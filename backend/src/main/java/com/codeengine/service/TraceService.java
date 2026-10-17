package com.codeengine.service;

import com.codeengine.instrumentation.JavaInstrumenter;
import com.codeengine.instrumentation.TraceCollector;
import com.codeengine.model.ExecutionRequest;
import com.codeengine.model.ExecutionResult;
import com.codeengine.model.ExecutionResult.ExecutionError;
import com.codeengine.model.ExecutionStatus;
import com.codeengine.model.ExecutionStep;
import com.codeengine.security.ResourceLimiter;
import com.codeengine.security.SandboxPolicy;
import com.codeengine.util.Json;
import org.springframework.stereotype.Service;

import javax.tools.Diagnostic;
import javax.tools.JavaFileObject;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/** Runs one Java execution end to end: prepare, compile, vet, trace, and normalize into an {@link ExecutionResult}. */
@Service
public class TraceService {

    private static final String MARKER = "@@LCV_RESULT@@";

    private final SandboxService sandbox;
    private final ResourceLimiter limits;
    private final JavaInstrumenter instrumenter = new JavaInstrumenter();
    private final SandboxPolicy policy = new SandboxPolicy();

    public TraceService(SandboxService sandbox, ResourceLimiter limits) {
        this.sandbox = sandbox;
        this.limits = limits;
    }

    public ExecutionResult execute(String id, ExecutionRequest req, BooleanSupplier cancelled) {
        long started = System.nanoTime();
        ExecutionResult r = ExecutionResult.of(id, ExecutionStatus.RUNNING);
        Path work = null;
        try {
            String invalid = validate(req);
            if (invalid != null) return fail(r, ExecutionStatus.INVALID_INPUT, "Invalid Input", invalid, null);

            work = sandbox.createWorkDir();
            JavaInstrumenter.PreparedSource src = instrumenter.prepare(req.code(), req.definitions());
            Path classes = work.resolve("classes");
            SandboxService.CompileOutput compiled = sandbox.compile(src.files(), work.resolve("src"), classes, List.of());
            if (!compiled.success()) return compileError(r, compiled, src);

            List<String> userClasses = listClasses(classes);
            ExecutionResult violation = vet(r, classes, userClasses, req.code());
            if (violation != null) return violation;

            Map<String, Object> input = new LinkedHashMap<>();
            input.put("userClasses", userClasses);
            input.put("args", req.testCase() == null ? Map.of() : req.testCase());
            Files.writeString(work.resolve("input.json"), Json.write(input), StandardCharsets.UTF_8);

            int maxSteps = req.maxSteps() == null ? limits.maxSteps()
                    : Math.max(1, Math.min(req.maxSteps(), limits.maxSteps()));
            long deadline = started + limits.timeoutMs() * 1_000_000L;

            try (SandboxService.SandboxProcess proc = sandbox.launch(work, classes)) {
                // Injected judge helper types are shown as data, not traced as calls (like library code).
                List<String> traced = userClasses.stream().filter(c -> !src.injected().contains(c)).toList();
                TraceCollector collector = new TraceCollector(proc.vm, traced, limits, maxSteps, braceOnlyLines(req.code()));
                TraceCollector.Outcome outcome = collector.run(deadline, cancelled);
                r.steps = collector.steps();
                r.stdout = collector.stdout();
                switch (outcome) {
                    case STEP_LIMIT -> fail(r, ExecutionStatus.STEP_LIMIT, "Step Limit",
                            "Execution exceeded " + maxSteps + " steps (infinite loop?). The first " + maxSteps
                                    + " steps are shown.", lastLine(r));
                    case TIMEOUT -> fail(r, ExecutionStatus.TIMEOUT, "Timeout",
                            "Execution exceeded " + limits.timeoutMs() / 1000 + " seconds.", lastLine(r));
                    case CANCELLED -> fail(r, ExecutionStatus.CANCELLED, "Cancelled", "Execution was cancelled.", null);
                    case COMPLETED -> applyHarnessResult(r, proc.awaitStdout(5000));
                }
            }
        } catch (Exception e) {
            fail(r, ExecutionStatus.INTERNAL_ERROR, "Internal Error", e.toString(), null);
        } finally {
            sandbox.deleteRecursively(work);
            r.executionTimeMs = (System.nanoTime() - started) / 1_000_000;
        }
        return r;
    }

    private String validate(ExecutionRequest req) {
        if (req == null || req.code() == null || req.code().isBlank()) return "No code was provided.";
        String lang = req.language() == null ? "java" : req.language().toLowerCase(Locale.ROOT);
        if (!lang.equals("java")) {
            return "The server traces Java only; '" + req.language() + "' is traced in the browser.";
        }
        if (req.code().length() > limits.maxCodeChars()) {
            return "Code is too long (" + req.code().length() + " > " + limits.maxCodeChars() + " characters).";
        }
        return null;
    }

    private ExecutionResult compileError(ExecutionResult r, SandboxService.CompileOutput out,
                                         JavaInstrumenter.PreparedSource src) {
        String mainFile = src.files().keySet().iterator().next();
        int prefix = JavaInstrumenter.prefixLength(src.wrapped());
        r.diagnostics = new ArrayList<>();
        for (Diagnostic<? extends JavaFileObject> d : out.diagnostics()) {
            if (d.getKind() != Diagnostic.Kind.ERROR) continue;
            boolean inMain = d.getSource() != null && d.getSource().getName().endsWith(mainFile);
            boolean inDefs = d.getSource() != null && d.getSource().getName().endsWith(JavaInstrumenter.DEFINITIONS_FILE);
            long line = inMain || inDefs ? d.getLineNumber() : 0;
            long col = d.getColumnNumber();
            if (line == 1 && inMain) col = Math.max(1, col - prefix);
            if (line == 1 && inDefs) col = Math.max(1, col - JavaInstrumenter.IMPORTS.length());
            r.diagnostics.add(new ExecutionResult.Diagnostic(line, col, "error",
                    (inDefs ? "In the Definitions tab: " : "") + d.getMessage(Locale.ROOT), inDefs ? "definitions" : null));
        }
        ExecutionResult.Diagnostic first = r.diagnostics.isEmpty() ? null : r.diagnostics.get(0);
        return fail(r, ExecutionStatus.COMPILE_ERROR, "Compile Error",
                first == null ? "Compilation failed." : first.message(), first == null ? null : (int) first.line());
    }

    private ExecutionResult vet(ExecutionResult r, Path classes, List<String> userClasses, String code) throws Exception {
        List<SandboxPolicy.Violation> violations = new ArrayList<>();
        for (String cls : userClasses) {
            byte[] bytes = Files.readAllBytes(classes.resolve(cls.replace('.', '/') + ".class"));
            violations.addAll(policy.scan(cls, bytes));
        }
        if (violations.isEmpty()) return null;
        SandboxPolicy.Violation v = violations.get(0);
        String simple = v.what().substring(v.what().lastIndexOf('/') + 1).replaceAll(".*\\$", "");
        Integer line = findLine(code, v.member() != null ? v.member() : simple);
        StringBuilder msg = new StringBuilder();
        violations.stream().map(SandboxPolicy.Violation::describe).distinct().limit(5)
                .forEach(s -> msg.append(msg.isEmpty() ? "" : "\n").append(s));
        return fail(r, ExecutionStatus.SECURITY_VIOLATION, "Security Violation", msg.toString(), line);
    }

    private static Set<Integer> braceOnlyLines(String code) {
        Set<Integer> out = new HashSet<>();
        String[] lines = code.split("\n", -1);
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].strip().matches("[{}();\\s]+")) out.add(i + 1);
        }
        return out;
    }

    private static Integer findLine(String code, String token) {
        Matcher m = Pattern.compile("\\b" + Pattern.quote(token) + "\\b").matcher(code);
        if (!m.find()) return null;
        return (int) code.substring(0, m.start()).chars().filter(c -> c == '\n').count() + 1;
    }

    private static List<String> listClasses(Path classes) throws Exception {
        try (Stream<Path> files = Files.walk(classes)) {
            return files.filter(p -> p.toString().endsWith(".class"))
                    .map(p -> classes.relativize(p).toString().replace('\\', '/').replace('/', '.'))
                    .map(s -> s.substring(0, s.length() - ".class".length()))
                    .sorted()
                    .toList();
        }
    }

    @SuppressWarnings("unchecked")
    private void applyHarnessResult(ExecutionResult r, String processOut) {
        int at = processOut.lastIndexOf(MARKER);
        if (at < 0) {
            String tail = processOut.length() > 2000 ? processOut.substring(processOut.length() - 2000) : processOut;
            fail(r, ExecutionStatus.RUNTIME_ERROR, "Runtime Error",
                    "The program terminated unexpectedly." + (tail.isBlank() ? "" : "\n" + tail.strip()), lastLine(r));
            return;
        }
        String json = processOut.substring(at + MARKER.length()).lines().findFirst().orElse("{}");
        Map<String, Object> res = (Map<String, Object>) Json.parse(json);
        String status = String.valueOf(res.get("status"));
        Integer line = res.get("line") instanceof Number n ? n.intValue() : lastLine(r);
        String function = res.get("function") instanceof String s ? s : null;
        String exception = res.get("exception") instanceof String s ? s.substring(s.lastIndexOf('.') + 1) : null;
        String message = res.get("message") instanceof String s ? s : null;
        switch (status) {
            case "OK" -> {
                r.status = ExecutionStatus.SUCCESS;
                r.output = res.get("output");
            }
            case "EXCEPTION" -> {
                ExecutionError err = new ExecutionError(exception, message, line, function);
                r.status = ExecutionStatus.RUNTIME_ERROR;
                r.error = err;
                appendExceptionStep(r, err);
            }
            case "MEMORY_LIMIT" -> {
                ExecutionError err = new ExecutionError("Memory Limit",
                        "OutOfMemoryError: the program exceeded the sandbox heap limit.", line, function);
                r.status = ExecutionStatus.MEMORY_LIMIT;
                r.error = err;
                appendExceptionStep(r, err);
            }
            case "INVALID_INPUT" -> fail(r, ExecutionStatus.INVALID_INPUT, "Invalid Input", message, null);
            default -> fail(r, ExecutionStatus.INTERNAL_ERROR, "Internal Error", message, null);
        }
    }

    /** Freezes the last recorded state as an EXCEPTION frame so the failure point stays inspectable. */
    private static void appendExceptionStep(ExecutionResult r, ExecutionError err) {
        if (r.steps.isEmpty()) return;
        ExecutionStep last = r.steps.get(r.steps.size() - 1);
        ExecutionStep s = new ExecutionStep();
        s.step = r.steps.size();
        s.event = "EXCEPTION";
        s.line = err.line() != null ? err.line() : last.line;
        s.function = last.function;
        s.callId = last.callId;
        s.parentCallId = last.parentCallId;
        s.callStack = last.callStack;
        s.heap = last.heap;
        s.globals = last.globals;
        s.exception = err;
        r.steps.add(s);
    }

    private static Integer lastLine(ExecutionResult r) {
        return r.steps.isEmpty() ? null : r.steps.get(r.steps.size() - 1).line;
    }

    private static ExecutionResult fail(ExecutionResult r, ExecutionStatus status, String type, String message,
                                        Integer line) {
        r.status = status;
        r.error = new ExecutionError(type, message, line, null);
        return r;
    }
}
