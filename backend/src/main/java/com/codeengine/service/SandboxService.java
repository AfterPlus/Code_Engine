package com.codeengine.service;

import com.codeengine.security.ResourceLimiter;
import com.sun.jdi.Bootstrap;
import com.sun.jdi.VirtualMachine;
import com.sun.jdi.connect.Connector;
import com.sun.jdi.connect.ListeningConnector;
import org.springframework.stereotype.Service;

import javax.tools.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.*;
import java.util.concurrent.TimeUnit;

/**
 * Owns everything that touches the operating system: temporary working directories, compilation, and the
 * isolated child JVM that runs user code under the debugger.
 *
 * <p>Isolation: each execution gets a fresh temp directory (also its working dir and java.io.tmpdir), a separate
 * JVM process with heap/metaspace/stack caps, an empty environment, a wall-clock timeout, forced kill, and
 * recursive cleanup. Code is compiled in-process with annotation processing disabled, so no user code runs here.
 */
@Service
public class SandboxService {

    private final ResourceLimiter limits;
    private final Path root;
    private final Path harnessClasses;

    public SandboxService(ResourceLimiter limits) throws IOException {
        this.limits = limits;
        this.root = Files.createTempDirectory("lcv-sandbox-");
        this.harnessClasses = root.resolve("harness");
        compileHarness();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> deleteRecursively(root)));
    }

    // ------------------------------------------------------------------ work dirs

    public Path createWorkDir() throws IOException {
        return Files.createTempDirectory(root, "run-");
    }

    public void deleteRecursively(Path dir) {
        if (dir == null || !Files.exists(dir)) return;
        try {
            Files.walkFileTree(dir, new SimpleFileVisitor<>() {
                @Override
                public FileVisitResult visitFile(Path file, BasicFileAttributes attrs) throws IOException {
                    Files.deleteIfExists(file);
                    return FileVisitResult.CONTINUE;
                }

                @Override
                public FileVisitResult postVisitDirectory(Path d, IOException exc) throws IOException {
                    Files.deleteIfExists(d);
                    return FileVisitResult.CONTINUE;
                }
            });
        } catch (IOException ignored) {
            // best effort; the shutdown hook retries for the whole sandbox root
        }
    }

    // ------------------------------------------------------------------ compilation

    public record CompileOutput(boolean success, List<Diagnostic<? extends JavaFileObject>> diagnostics) {
    }

    public CompileOutput compile(Map<String, String> sources, Path srcDir, Path outDir, List<String> extraClasspath)
            throws IOException {
        Files.createDirectories(srcDir);
        Files.createDirectories(outDir);
        List<File> files = new ArrayList<>();
        for (Map.Entry<String, String> e : sources.entrySet()) {
            Path p = srcDir.resolve(e.getKey());
            Files.createDirectories(p.getParent());
            Files.writeString(p, e.getValue(), StandardCharsets.UTF_8);
            files.add(p.toFile());
        }
        JavaCompiler javac = ToolProvider.getSystemJavaCompiler();
        if (javac == null) throw new IllegalStateException("The server must run on a JDK (javac not found)");
        DiagnosticCollector<JavaFileObject> diags = new DiagnosticCollector<>();
        try (StandardJavaFileManager fm = javac.getStandardFileManager(diags, Locale.ROOT, StandardCharsets.UTF_8)) {
            List<String> options = new ArrayList<>(List.of(
                    "-g", "-parameters", "-proc:none", "-nowarn", "-encoding", "UTF-8",
                    "-d", outDir.toString(), "-implicit:none"));
            options.add("-cp");
            options.add(String.join(File.pathSeparator, extraClasspath.isEmpty() ? List.of(".") : extraClasspath));
            Boolean ok = javac.getTask(null, fm, diags, options, null, fm.getJavaFileObjectsFromFiles(files)).call();
            return new CompileOutput(Boolean.TRUE.equals(ok), diags.getDiagnostics());
        }
    }

    private void compileHarness() throws IOException {
        Map<String, String> sources = new LinkedHashMap<>();
        for (String name : List.of("Harness", "Json", "Out")) {
            try (InputStream in = getClass().getResourceAsStream("/sandbox/lcvharness/" + name + ".java")) {
                if (in == null) throw new IllegalStateException("Missing harness source " + name);
                sources.put("lcvharness/" + name + ".java", new String(in.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        CompileOutput out = compile(sources, root.resolve("harness-src"), harnessClasses, List.of());
        if (!out.success()) throw new IllegalStateException("Harness failed to compile: " + out.diagnostics());
    }

    // ------------------------------------------------------------------ process

    /** A running sandboxed JVM attached to the debugger. Closing it kills the process. */
    public static final class SandboxProcess implements AutoCloseable {
        public final Process process;
        public final VirtualMachine vm;
        private final StringBuffer stdout = new StringBuffer();
        private final Thread pump;

        SandboxProcess(Process process, VirtualMachine vm, int maxBytes) {
            this.process = process;
            this.vm = vm;
            this.pump = Thread.ofVirtual().start(() -> {
                try (Reader r = new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8)) {
                    char[] buf = new char[4096];
                    int n;
                    while ((n = r.read(buf)) > 0) {
                        if (stdout.length() < maxBytes) stdout.append(buf, 0, Math.min(n, maxBytes - stdout.length()));
                    }
                } catch (IOException ignored) {
                }
            });
        }

        /** Raw process stdout (the harness's result marker; user prints are captured separately). */
        public String awaitStdout(long millis) {
            try {
                process.waitFor(millis, TimeUnit.MILLISECONDS);
                pump.join(Math.max(1, millis));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            return stdout.toString();
        }

        @Override
        public void close() {
            try {
                vm.dispose();
            } catch (Exception ignored) {
            }
            process.descendants().forEach(ProcessHandle::destroyForcibly);
            process.destroyForcibly();
        }
    }

    /**
     * Starts the harness in a fresh JVM, suspended, and attaches the debugger. The server listens and the child
     * connects, so the child never opens a listening port. Synchronized because JDI keys listening state by the
     * (identical) connector arguments, so only one listen/accept handshake may be in flight at a time.
     */
    public synchronized SandboxProcess launch(Path workDir, Path userClasses) throws Exception {
        ListeningConnector connector = Bootstrap.virtualMachineManager().listeningConnectors().stream()
                .filter(c -> c.transport().name().equals("dt_socket"))
                .findFirst().orElseThrow(() -> new IllegalStateException("No socket listening connector"));
        Map<String, Connector.Argument> args = connector.defaultArguments();
        args.get("localAddress").setValue("127.0.0.1");
        args.get("port").setValue("0");
        args.get("timeout").setValue("10000");
        String address = connector.startListening(args);
        String port = address.substring(address.lastIndexOf(':') + 1);

        Path java = Path.of(System.getProperty("java.home"), "bin", isWindows() ? "java.exe" : "java");
        List<String> cmd = new ArrayList<>();
        cmd.add(java.toString());
        cmd.add("-agentlib:jdwp=transport=dt_socket,server=n,suspend=y,address=127.0.0.1:" + port);
        cmd.addAll(limits.jvmFlags());
        cmd.add("-Djava.io.tmpdir=" + workDir);
        cmd.add("-Duser.home=" + workDir);
        cmd.add("-cp");
        cmd.add(userClasses + File.pathSeparator + harnessClasses);
        cmd.add("lcvharness.Harness");
        cmd.add(workDir.toString());

        ProcessBuilder pb = new ProcessBuilder(cmd).directory(workDir.toFile()).redirectErrorStream(true);
        Map<String, String> env = pb.environment();
        String systemRoot = env.get("SystemRoot");
        env.clear();
        if (systemRoot != null) env.put("SystemRoot", systemRoot); // required by the JVM on Windows
        Process process = pb.start();
        try {
            VirtualMachine vm = connector.accept(args);
            return new SandboxProcess(process, vm, limits.maxOutputBytes() * 2);
        } catch (Exception e) {
            process.destroyForcibly();
            throw e;
        } finally {
            try {
                connector.stopListening(args);
            } catch (Exception ignored) {
            }
        }
    }

    private static boolean isWindows() {
        return System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("win");
    }
}
