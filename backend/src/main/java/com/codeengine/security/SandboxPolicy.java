package com.codeengine.security;

import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Static bytecode policy applied to every compiled user class before anything is executed.
 *
 * <p>Since the JDK no longer ships a SecurityManager, the policy works on the class-file constant pool: every
 * class, field, and method the code can touch must appear there as a symbolic reference, so scanning it catches
 * filesystem, network, process, reflection, threading, and native-access APIs regardless of how the source was
 * written. This is one layer of defence; the runner also isolates each execution in its own short-lived JVM with
 * memory, time, step, and output limits (see {@link ResourceLimiter}). Production deployments should additionally
 * run the runner inside a container with no network (see README).
 */
public final class SandboxPolicy {

    private static final List<String> DENIED_PREFIXES = List.of(
            "java/io/File", "java/io/RandomAccessFile", "java/io/ObjectInputStream", "java/io/ObjectOutputStream",
            "java/io/Console",
            "java/nio/file/", "java/nio/channels/",
            "java/net/", "java/sql/", "java/rmi/", "java/awt/", "java/beans/", "java/applet/",
            "java/lang/Runtime", "java/lang/Process", "java/lang/Thread", "java/lang/VirtualThread",
            "java/lang/ClassLoader", "java/lang/Module", "java/lang/ModuleLayer", "java/lang/StackWalker",
            "java/lang/ScopedValue", "java/lang/SecurityManager", "java/lang/Shutdown",
            "java/lang/reflect/", "java/lang/foreign/", "java/lang/instrument/", "java/lang/management/",
            "java/lang/ref/",
            "java/util/concurrent/Executor", "java/util/concurrent/ForkJoin", "java/util/concurrent/CompletableFuture",
            "java/util/concurrent/ThreadPoolExecutor", "java/util/concurrent/ScheduledThreadPoolExecutor",
            "java/util/concurrent/StructuredTaskScope", "java/util/Timer",
            "java/util/ServiceLoader", "java/util/prefs/", "java/util/logging/", "java/util/jar/", "java/util/zip/",
            "javax/", "jdk/", "sun/", "com/sun/", "lcvharness/");

    /** Needed by javac for lambdas, string concatenation, records, and pattern switches. */
    private static final Set<String> INVOKE_ALLOWED = Set.of(
            "java/lang/invoke/LambdaMetafactory", "java/lang/invoke/StringConcatFactory",
            "java/lang/invoke/ObjectMethods", "java/lang/runtime/ObjectMethods",
            "java/lang/runtime/SwitchBootstraps", "java/lang/invoke/SwitchBootstraps");

    /** Referenced as class entries by the InnerClasses attribute of any class using lambdas; members stay denied. */
    private static final Set<String> INVOKE_CLASS_ONLY = Set.of(
            "java/lang/invoke/MethodHandles", "java/lang/invoke/MethodHandles$Lookup");

    private static final Set<String> SYSTEM_ALLOWED = Set.of(
            "out", "err", "in", "currentTimeMillis", "nanoTime", "arraycopy", "identityHashCode", "lineSeparator");

    private static final Set<String> CLASS_ALLOWED = Set.of(
            "getName", "getSimpleName", "getTypeName", "getCanonicalName", "getComponentType", "isArray",
            "isInstance", "isPrimitive", "cast", "desiredAssertionStatus", "hashCode", "equals", "toString",
            "getEnumConstants", "isEnum", "isRecord", "isInterface");

    public record Violation(String className, String member, String what) {
        public String describe() {
            String cls = what.replace('/', '.');
            return member == null ? "Use of " + cls + " is not allowed in the sandbox"
                    : "Call to " + cls + "." + member + "() is not allowed in the sandbox";
        }
    }

    public List<Violation> scan(String className, byte[] classFile) throws IOException {
        DataInputStream in = new DataInputStream(new ByteArrayInputStream(classFile));
        if (in.readInt() != 0xCAFEBABE) throw new IOException("Not a class file: " + className);
        in.readUnsignedShort();
        in.readUnsignedShort();
        int count = in.readUnsignedShort();
        String[] utf8 = new String[count];
        int[] classNameIdx = new int[count];
        int[][] memberRef = new int[count][];
        int[][] nameAndType = new int[count][];
        for (int i = 1; i < count; i++) {
            int tag = in.readUnsignedByte();
            switch (tag) {
                case 1 -> utf8[i] = in.readUTF();
                case 3, 4 -> in.readInt();
                case 5, 6 -> {
                    in.readLong();
                    i++;
                }
                case 7 -> classNameIdx[i] = in.readUnsignedShort();
                case 8, 16, 19, 20 -> in.readUnsignedShort();
                case 9, 10, 11 -> memberRef[i] = new int[]{in.readUnsignedShort(), in.readUnsignedShort()};
                case 12 -> nameAndType[i] = new int[]{in.readUnsignedShort(), in.readUnsignedShort()};
                case 15 -> {
                    in.readUnsignedByte();
                    in.readUnsignedShort();
                }
                case 17, 18 -> {
                    in.readUnsignedShort();
                    in.readUnsignedShort();
                }
                default -> throw new IOException("Unknown constant pool tag " + tag + " in " + className);
            }
        }

        Set<Violation> out = new LinkedHashSet<>();
        for (int i = 1; i < count; i++) {
            if (classNameIdx[i] != 0) {
                String name = elementType(utf8[classNameIdx[i]]);
                if (name != null && deniedClass(name)) out.add(new Violation(className, null, name));
            }
        }
        for (int i = 1; i < count; i++) {
            if (memberRef[i] == null) continue;
            String owner = elementType(utf8[classNameIdx[memberRef[i][0]]]);
            String member = utf8[nameAndType[memberRef[i][1]][0]];
            if (owner == null) continue;
            if (deniedMember(owner, member)) out.add(new Violation(className, member, owner));
        }
        return new ArrayList<>(out);
    }

    private static boolean deniedClass(String name) {
        if (name.startsWith("java/lang/invoke/")) {
            return !INVOKE_ALLOWED.contains(name) && !INVOKE_CLASS_ONLY.contains(name);
        }
        if (INVOKE_ALLOWED.contains(name)) return false;
        for (String p : DENIED_PREFIXES) {
            if (name.startsWith(p)) return true;
        }
        return false;
    }

    private static boolean deniedMember(String owner, String member) {
        if (INVOKE_CLASS_ONLY.contains(owner)) return true;
        return switch (owner) {
            case "java/lang/System" -> !SYSTEM_ALLOWED.contains(member);
            case "java/lang/Class" -> !CLASS_ALLOWED.contains(member);
            default -> false;
        };
    }

    /** Strips array descriptors: "[[Ljava/io/File;" -> "java/io/File"; primitive arrays -> null. */
    private static String elementType(String name) {
        if (name == null) return null;
        if (!name.startsWith("[")) return name;
        String t = name.replaceFirst("^\\[+", "");
        return t.startsWith("L") && t.endsWith(";") ? t.substring(1, t.length() - 1) : null;
    }
}
