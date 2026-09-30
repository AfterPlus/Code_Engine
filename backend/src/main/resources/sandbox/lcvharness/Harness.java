package lcvharness;

import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.PrintStream;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.GenericArrayType;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Parameter;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.Type;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Entry point of the sandboxed JVM. It turns the JSON test case into typed arguments, invokes the user's
 * solution between {@link #begin()} and {@link #end()} (the debugger only traces between those two
 * breakpoints), and reports the outcome on the real stdout behind a marker line.
 *
 * <p>Supported inputs, as LeetCode itself accepts them:
 * <ul>
 *   <li>named arguments ({@code nums = [...], target = 9}) or positional ones (raw one-value-per-line input);</li>
 *   <li>class-design problems: {@code ["MinStack","push","getMin"]} with {@code [[],[-2],[]]};</li>
 *   <li>node parameters given by value ({@code p = 5} in a tree problem) and {@code pos} for list cycles.</li>
 * </ul>
 *
 * <p>This class lives in the excluded {@code lcvharness} package, so its own execution is never traced.
 */
public final class Harness {

    public static final String MARKER = "@@LCV_RESULT@@";
    // Explicit UTF-8: the platform default (e.g. windows-1252) would mangle non-ASCII in results.
    private static final PrintStream REAL_OUT = new PrintStream(new FileOutputStream(FileDescriptor.out), true, StandardCharsets.UTF_8);
    private static Set<String> userClasses = Set.of();
    /** Node structures built from the test case, so later parameters can refer to nodes by value. */
    private static final List<Object> builtNodes = new ArrayList<>();

    /** Breakpoint anchor: tracing starts when this method is hit. */
    public static void begin() {
    }

    /** Breakpoint anchor: tracing stops when this method is hit. */
    public static void end() {
    }

    public static void main(String[] argv) {
        Map<String, Object> result;
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> spec = (Map<String, Object>) Json.parse(
                    Files.readString(Path.of(argv[0]).resolve("input.json"), StandardCharsets.UTF_8));
            userClasses = new HashSet<>(asStrings(spec.get("userClasses")));
            PrintStream captured = new PrintStream(Out.BUF, true, StandardCharsets.UTF_8);
            System.setOut(captured);
            System.setErr(captured);
            result = run(spec);
        } catch (InvalidInput e) {
            result = new LinkedHashMap<>();
            result.put("status", "INVALID_INPUT");
            result.put("message", e.getMessage());
        } catch (Throwable t) {
            result = new LinkedHashMap<>();
            result.put("status", "HARNESS_ERROR");
            result.put("message", t.toString());
        }
        REAL_OUT.println(MARKER + Json.write(result));
        REAL_OUT.flush();
        System.exit(0);
    }

    private static Map<String, Object> run(Map<String, Object> spec) throws Exception {
        @SuppressWarnings("unchecked")
        Map<String, Object> args = spec.get("args") instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
        Map<String, Object> result = new LinkedHashMap<>();

        Map<String, Object> design = designProblem(args);
        if (design != null) return runDesign(design);

        Class<?> solution = load("Solution");
        Method method;
        Object[] params;
        if (solution != null && hasCandidate(solution)) {
            method = pick(solution, args);
            try {
                params = convertArgs(method, args).values();
            } catch (InvalidInput e) {
                throw new InvalidInput("Calling " + signature(method) + ": " + e.getMessage()
                        + ". Name the test-case values after the parameters, e.g. "
                        + Arrays.stream(method.getParameters()).map(p -> p.getName() + " = ...").reduce((a, b) -> a + ", " + b).orElse(""));
            }
        } else {
            method = findMain();
            if (method == null) {
                throw new InvalidInput("No 'class Solution' with a public method (or a main method) was found.");
            }
            params = new Object[]{new String[0]};
        }
        method.setAccessible(true);

        // Instantiated before tracing starts so the implicit constructor isn't the first "call"; field
        // initializers still show up as the fields of `this`.
        Object target = null;
        if (!Modifier.isStatic(method.getModifiers())) {
            Constructor<?> ctor = method.getDeclaringClass().getDeclaredConstructor();
            ctor.setAccessible(true);
            try {
                target = ctor.newInstance();
            } catch (InvocationTargetException e) {
                return describeFailure(e.getCause());
            }
        }

        Object ret;
        begin();
        try {
            ret = method.invoke(target, params);
        } catch (InvocationTargetException e) {
            end();
            return describeFailure(e.getCause());
        }
        end();

        result.put("status", "OK");
        result.put("method", method.getName());
        if (method.getReturnType() == void.class) {
            // In-place problems (rotate array, sort colors, ...): report the mutated first argument.
            result.put("output", params.length > 0 && !method.getName().equals("main") ? toJson(params[0], 0) : null);
            result.put("inPlace", true);
        } else {
            Class<?> rt = method.getReturnType();
            boolean nodeType = structKind(rt) != null;
            result.put("output", ret == null && nodeType ? List.of() : toJson(ret, 0));
        }
        return result;
    }

    private static Map<String, Object> describeFailure(Throwable t) {
        Map<String, Object> r = new LinkedHashMap<>();
        if (t instanceof OutOfMemoryError) {
            r.put("status", "MEMORY_LIMIT");
        } else {
            r.put("status", "EXCEPTION");
        }
        r.put("exception", t.getClass().getName());
        r.put("message", t.getMessage());
        for (StackTraceElement el : t.getStackTrace()) {
            if (userClasses.contains(el.getClassName()) && el.getLineNumber() > 0) {
                r.put("line", el.getLineNumber());
                r.put("function", el.getMethodName());
                break;
            }
        }
        return r;
    }

    // ---------------------------------------------------------------- method selection

    private static boolean candidate(Method m) {
        return !m.isSynthetic() && !m.isBridge() && !m.getName().startsWith("lambda$")
                && !Modifier.isPrivate(m.getModifiers());
    }

    private static boolean hasCandidate(Class<?> c) {
        return Arrays.stream(c.getDeclaredMethods()).anyMatch(Harness::candidate);
    }

    /**
     * The entry point is the method the test case actually fits: first, every value must convert to its
     * parameter's type (so a helper like {@code dfs(int i, int j)} never beats {@code numIslands(char[][])});
     * then matching parameter names, arity, and public visibility break ties.
     */
    private static Method pick(Class<?> c, Map<String, Object> args) {
        Method best = null;
        int bestScore = Integer.MIN_VALUE;
        Method[] methods = c.getDeclaredMethods();
        Arrays.sort(methods, Comparator.comparing(Method::getName)); // deterministic tie-breaking
        for (Method m : methods) {
            if (!candidate(m)) continue;
            int score = 0;
            try {
                Converted fit = convertArgs(m, args);
                score += 100 - 20 * fit.unused();
            } catch (RuntimeException notAFit) {
                // keep it as a fallback candidate; its conversion error is reported if nothing fits
            }
            for (Parameter p : m.getParameters()) {
                if (args.containsKey(p.getName())) score += 10;
            }
            if (m.getParameterCount() == args.size()) score += 5;
            if (Modifier.isPublic(m.getModifiers())) score += 2;
            if (m.getName().equals("main")) score -= 20;
            if (score > bestScore) {
                bestScore = score;
                best = m;
            }
        }
        return best;
    }

    private static String signature(Method m) {
        StringBuilder sb = new StringBuilder(m.getName()).append('(');
        Parameter[] ps = m.getParameters();
        for (int i = 0; i < ps.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append(ps[i].getType().getSimpleName()).append(' ').append(ps[i].getName());
        }
        return sb.append(')').toString();
    }

    private static Method findMain() {
        for (String name : userClasses) {
            Class<?> c = load(name);
            if (c == null) continue;
            try {
                Method m = c.getDeclaredMethod("main", String[].class);
                if (Modifier.isStatic(m.getModifiers())) return m;
            } catch (NoSuchMethodException ignored) {
            }
        }
        return null;
    }

    /** Converted arguments, plus how many test-case values no parameter consumed. */
    record Converted(Object[] values, int unused) {
    }

    private static final Object NULL = new Object();

    /**
     * Matches values to parameters by name; values whose names match no parameter fill the remaining
     * parameters in order (so raw positional input works, and so do differently named keys).
     */
    private static Converted convertArgs(Method m, Map<String, Object> args) {
        Parameter[] ps = m.getParameters();
        Type[] types = m.getGenericParameterTypes();
        Set<String> names = new HashSet<>();
        for (Parameter p : ps) names.add(p.getName());
        boolean hasListParam = Arrays.stream(ps).anyMatch(p -> selfField(p.getType(), "next") != null);
        boolean cyclePos = hasListParam && args.containsKey("pos") && !names.contains("pos");
        Deque<Object> spare = new ArrayDeque<>();
        for (Map.Entry<String, Object> e : args.entrySet()) {
            if (!names.contains(e.getKey()) && !(cyclePos && e.getKey().equals("pos"))) {
                spare.add(e.getValue() == null ? NULL : e.getValue());
            }
        }
        builtNodes.clear();
        // assign every parameter first, so "too few values" is reported rather than a type mismatch
        Object[] json = new Object[ps.length];
        for (int i = 0; i < ps.length; i++) {
            if (args.containsKey(ps[i].getName())) {
                json[i] = args.get(ps[i].getName());
            } else if (!spare.isEmpty()) {
                Object v = spare.poll();
                json[i] = v == NULL ? null : v;
            } else {
                throw new InvalidInput("Missing test-case value for parameter '" + ps[i].getName() + "'"
                        + (args.isEmpty() ? " (the test case is empty)"
                        : " (the test case provides: " + String.join(", ", args.keySet()) + ")"));
            }
        }
        Object[] out = new Object[ps.length];
        for (int i = 0; i < ps.length; i++) {
            try {
                out[i] = convert(json[i], types[i]);
            } catch (InvalidInput e) {
                throw new InvalidInput("Parameter '" + ps[i].getName() + "': " + e.getMessage());
            }
        }
        if (cyclePos) linkCycle(out, args.get("pos"));
        return new Converted(out, spare.size());
    }

    /** LeetCode's linked-list-cycle input: the tail links back to the node at index {@code pos} (-1: no cycle). */
    private static void linkCycle(Object[] params, Object pos) {
        int p = num(pos).intValue();
        if (p < 0) return;
        for (Object head : params) {
            if (head == null) continue;
            Field next = selfField(head.getClass(), "next");
            if (next == null) continue;
            try {
                next.setAccessible(true);
                Object target = null;
                Object tail = head;
                for (int i = 0; ; i++) {
                    if (i == p) target = tail;
                    Object n = next.get(tail);
                    if (n == null) break;
                    tail = n;
                }
                if (target == null) throw new InvalidInput("pos " + p + " is outside the list");
                next.set(tail, target);
            } catch (IllegalAccessException e) {
                throw new InvalidInput("cannot link the cycle: " + e);
            }
            return;
        }
    }

    // ---------------------------------------------------------------- class-design problems

    /**
     * Recognizes LeetCode's design format: a list of operations whose first entry names a class of the
     * solution, and a parallel list of argument lists.
     */
    private static Map<String, Object> designProblem(Map<String, Object> args) {
        if (args.size() != 2) return null;
        Iterator<Object> it = args.values().iterator();
        Object a = it.next();
        Object b = it.next();
        if (!(a instanceof List<?> ops) || !(b instanceof List<?> params) || ops.isEmpty() || ops.size() != params.size()) return null;
        if (!ops.stream().allMatch(o -> o instanceof String) || !params.stream().allMatch(o -> o instanceof List)) return null;
        Class<?> cls = load((String) ops.get(0));
        if (cls == null || !userClasses.contains(cls.getName())) return null;
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("class", cls);
        d.put("ops", ops);
        d.put("params", params);
        return d;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> runDesign(Map<String, Object> d) throws Exception {
        Class<?> cls = (Class<?>) d.get("class");
        List<String> ops = (List<String>) d.get("ops");
        List<List<Object>> params = (List<List<Object>>) d.get("params");

        // Resolve every call and convert every argument before tracing, so bad input fails cleanly.
        Constructor<?> ctor = null;
        Object[] ctorArgs = null;
        for (Constructor<?> c : cls.getDeclaredConstructors()) {
            if (c.getParameterCount() != params.get(0).size()) continue;
            try {
                ctorArgs = convertList(c.getGenericParameterTypes(), params.get(0));
                ctor = c;
                break;
            } catch (InvalidInput ignored) {
                // try the next overload
            }
        }
        if (ctor == null) {
            throw new InvalidInput("No constructor of " + cls.getSimpleName() + " takes " + Json.write(params.get(0)));
        }
        ctor.setAccessible(true);
        List<Method> calls = new ArrayList<>();
        List<Object[]> callArgs = new ArrayList<>();
        for (int i = 1; i < ops.size(); i++) {
            String name = ops.get(i);
            List<Object> raw = params.get(i);
            Method found = null;
            Object[] converted = null;
            for (Class<?> k = cls; k != null && found == null; k = k.getSuperclass()) {
                for (Method m : k.getDeclaredMethods()) {
                    if (!m.getName().equals(name) || m.getParameterCount() != raw.size() || m.isSynthetic()) continue;
                    try {
                        converted = convertList(m.getGenericParameterTypes(), raw);
                        found = m;
                        break;
                    } catch (InvalidInput ignored) {
                        // try the next overload
                    }
                }
            }
            if (found == null) {
                throw new InvalidInput("Operation " + (i + 1) + ": " + cls.getSimpleName() + " has no method " + name
                        + " taking " + Json.write(raw));
            }
            found.setAccessible(true);
            calls.add(found);
            callArgs.add(converted);
        }

        List<Object> outputs = new ArrayList<>();
        outputs.add(null);
        begin();
        try {
            Object obj = ctor.newInstance(ctorArgs);
            for (int i = 0; i < calls.size(); i++) {
                Method m = calls.get(i);
                Object r = m.invoke(obj, callArgs.get(i));
                outputs.add(m.getReturnType() == void.class ? null : toJson(r, 0));
            }
        } catch (InvocationTargetException e) {
            end();
            return describeFailure(e.getCause());
        }
        end();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "OK");
        result.put("method", cls.getSimpleName());
        result.put("output", outputs);
        return result;
    }

    private static Object[] convertList(Type[] types, List<Object> raw) {
        Object[] out = new Object[types.length];
        for (int i = 0; i < types.length; i++) out[i] = convert(raw.get(i), types[i]);
        return out;
    }

    // ---------------------------------------------------------------- JSON -> Java

    private static Object convert(Object json, Type type) {
        if (type instanceof Class<?> c) return convertClass(json, c, null);
        if (type instanceof ParameterizedType pt) {
            Class<?> raw = (Class<?>) pt.getRawType();
            return convertClass(json, raw, pt.getActualTypeArguments());
        }
        if (type instanceof GenericArrayType gat) {
            List<?> list = asList(json);
            Class<?> comp = erase(gat.getGenericComponentType());
            Object arr = Array.newInstance(comp, list.size());
            for (int i = 0; i < list.size(); i++) Array.set(arr, i, convert(list.get(i), gat.getGenericComponentType()));
            return arr;
        }
        return json; // type variables / wildcards: pass through the raw JSON value
    }

    private static Class<?> erase(Type t) {
        if (t instanceof Class<?> c) return c;
        if (t instanceof ParameterizedType pt) return (Class<?>) pt.getRawType();
        return Object.class;
    }

    private static Object convertClass(Object json, Class<?> c, Type[] typeArgs) {
        if (json == null) {
            if (c.isPrimitive()) throw new InvalidInput("null is not a valid " + c.getName());
            return null;
        }
        if (c == int.class || c == Integer.class) return num(json).intValue();
        if (c == long.class || c == Long.class) return num(json).longValue();
        if (c == double.class || c == Double.class) return num(json).doubleValue();
        if (c == float.class || c == Float.class) return num(json).floatValue();
        if (c == short.class || c == Short.class) return num(json).shortValue();
        if (c == byte.class || c == Byte.class) return num(json).byteValue();
        if (c == boolean.class || c == Boolean.class) {
            if (json instanceof Boolean b) return b;
            throw new InvalidInput("expected a boolean but got " + json);
        }
        if (c == char.class || c == Character.class) {
            String s = String.valueOf(json);
            if (s.length() != 1) throw new InvalidInput("expected a single character but got \"" + s + "\"");
            return s.charAt(0);
        }
        if (c == String.class) {
            if (json instanceof List || json instanceof Map) throw new InvalidInput("expected a string but got " + Json.write(json));
            return String.valueOf(json);
        }
        if (c == Object.class) return normalize(json);
        if (c.isArray()) {
            Class<?> comp = c.getComponentType();
            if (comp == char.class && json instanceof String s) return s.toCharArray();
            List<?> list = asList(json);
            Object arr = Array.newInstance(comp, list.size());
            for (int i = 0; i < list.size(); i++) Array.set(arr, i, convertClass(list.get(i), comp, null));
            return arr;
        }
        Type elem = typeArgs != null && typeArgs.length > 0 ? typeArgs[0] : Object.class;
        if (Map.class.isAssignableFrom(c)) {
            if (!(json instanceof Map<?, ?> m)) throw new InvalidInput("expected a JSON object");
            Map<Object, Object> out = c.isAssignableFrom(TreeMap.class) && !c.isAssignableFrom(LinkedHashMap.class)
                    ? new TreeMap<>() : new LinkedHashMap<>();
            Type kt = typeArgs != null ? typeArgs[0] : String.class;
            Type vt = typeArgs != null ? typeArgs[1] : Object.class;
            for (Map.Entry<?, ?> e : m.entrySet()) {
                Object key = e.getKey();
                if (kt != String.class && kt != Object.class) key = convert(parseScalar((String) key), kt);
                out.put(key, convert(e.getValue(), vt));
            }
            return out;
        }
        if (Collection.class.isAssignableFrom(c) || c == Iterable.class) {
            List<?> list = asList(json);
            Collection<Object> out;
            if (Set.class.isAssignableFrom(c)) out = SortedSet.class.isAssignableFrom(c) ? new TreeSet<>() : new LinkedHashSet<>();
            else if (c == PriorityQueue.class) out = new PriorityQueue<>();
            else if (c == Stack.class) out = new Stack<>();
            else if (Deque.class.isAssignableFrom(c) || Queue.class.isAssignableFrom(c)) out = c == LinkedList.class ? new LinkedList<>() : new ArrayDeque<>();
            else if (c == LinkedList.class) out = new LinkedList<>();
            else out = new ArrayList<>();
            for (Object o : list) out.add(convert(o, elem));
            return out;
        }
        // User-defined node types, recognized by shape rather than by name.
        String kind = structKind(c);
        if (kind == null) throw new InvalidInput("cannot build a " + c.getSimpleName() + " from JSON");
        if (!(json instanceof List)) return findNode(c, json);
        Object built = switch (kind) {
            case "list" -> buildList(c, asList(json));
            case "tree", "nextptr" -> buildTree(c, asList(json));
            case "nary" -> buildNary(c, asList(json));
            case "graph" -> buildGraph(c, asList(json));
            default -> buildRandom(c, asList(json));
        };
        if (built != null) builtNodes.add(built);
        return built;
    }

    /** {@code p = 5} in a tree problem means "the node whose value is 5" in a tree given earlier. */
    private static Object findNode(Class<?> c, Object json) {
        Field vf = valueField(c);
        vf.setAccessible(true);
        List<Field> links = new ArrayList<>();
        for (String f : new String[]{"next", "left", "right", "random", "child"}) {
            Field l = selfField(c, f);
            if (l != null) {
                l.setAccessible(true);
                links.add(l);
            }
        }
        List<Field> collections = new ArrayList<>();
        for (String f : new String[]{"children", "neighbors"}) {
            try {
                Field l = c.getDeclaredField(f);
                l.setAccessible(true);
                collections.add(l);
            } catch (NoSuchFieldException ignored) {
            }
        }
        Object wanted = convertClass(json, vf.getType(), null);
        IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<>();
        Deque<Object> queue = new ArrayDeque<>();
        for (Object root : builtNodes) if (root != null && root.getClass() == c) queue.add(root);
        try {
            while (!queue.isEmpty()) {
                Object n = queue.poll();
                if (seen.put(n, true) != null) continue;
                if (Objects.equals(vf.get(n), wanted)) return n;
                for (Field l : links) {
                    Object x = l.get(n);
                    if (x != null) queue.add(x);
                }
                for (Field l : collections) {
                    Object x = l.get(n);
                    if (x instanceof Collection<?> col) for (Object o : col) if (o != null) queue.add(o);
                }
            }
        } catch (IllegalAccessException e) {
            throw new InvalidInput(e.toString());
        }
        throw new InvalidInput("no " + c.getSimpleName() + " with value " + Json.write(json) + " in the earlier arguments");
    }

    private static Object parseScalar(String s) {
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            try {
                return Double.parseDouble(s);
            } catch (NumberFormatException e2) {
                return s;
            }
        }
    }

    /** Numbers default to Integer when they fit, like LeetCode's own deserializer. */
    private static Object normalize(Object json) {
        if (json instanceof Long l && l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) return l.intValue();
        if (json instanceof List<?> list) {
            List<Object> out = new ArrayList<>();
            for (Object o : list) out.add(normalize(o));
            return out;
        }
        return json;
    }

    private static Field selfField(Class<?> c, String name) {
        try {
            Field f = c.getDeclaredField(name);
            return f.getType() == c ? f : null;
        } catch (NoSuchFieldException e) {
            return null;
        }
    }

    private static Field valueField(Class<?> c) {
        for (String n : new String[]{"val", "value", "data", "key"}) {
            try {
                return c.getDeclaredField(n);
            } catch (NoSuchFieldException ignored) {
            }
        }
        throw new InvalidInput(c.getSimpleName() + " needs a 'val' field");
    }

    private static Object newNode(Class<?> c, Object json) throws ReflectiveOperationException {
        Field vf = valueField(c);
        vf.setAccessible(true);
        Constructor<?> ctor;
        try {
            ctor = c.getDeclaredConstructor();
        } catch (NoSuchMethodException e) {
            ctor = c.getDeclaredConstructor(vf.getType());
            ctor.setAccessible(true);
            return ctor.newInstance(convertClass(json, vf.getType(), null));
        }
        ctor.setAccessible(true);
        Object node = ctor.newInstance();
        vf.set(node, convertClass(json, vf.getType(), null));
        return node;
    }

    private static Object buildList(Class<?> c, List<?> values) {
        try {
            Field next = c.getDeclaredField("next");
            next.setAccessible(true);
            Object head = null, tail = null;
            for (Object v : values) {
                Object node = newNode(c, v);
                if (head == null) head = node;
                else next.set(tail, node);
                tail = node;
            }
            return head;
        } catch (ReflectiveOperationException e) {
            throw new InvalidInput("cannot build " + c.getSimpleName() + ": " + e);
        }
    }

    /** LeetCode level-order encoding, e.g. [3,9,20,null,null,15,7]. */
    private static Object buildTree(Class<?> c, List<?> values) {
        if (values.isEmpty() || values.get(0) == null) return null;
        try {
            Field left = c.getDeclaredField("left");
            Field right = c.getDeclaredField("right");
            left.setAccessible(true);
            right.setAccessible(true);
            Object root = newNode(c, values.get(0));
            Deque<Object> queue = new ArrayDeque<>();
            queue.add(root);
            int i = 1;
            while (!queue.isEmpty() && i < values.size()) {
                Object parent = queue.poll();
                if (i < values.size() && values.get(i) != null) {
                    Object n = newNode(c, values.get(i));
                    left.set(parent, n);
                    queue.add(n);
                }
                i++;
                if (i < values.size() && values.get(i) != null) {
                    Object n = newNode(c, values.get(i));
                    right.set(parent, n);
                    queue.add(n);
                }
                i++;
            }
            return root;
        } catch (ReflectiveOperationException e) {
            throw new InvalidInput("cannot build " + c.getSimpleName() + ": " + e);
        }
    }

    // ---------------------------------------------------------------- Java -> JSON

    private static Object toJson(Object v, int depth) {
        if (v == null || v instanceof Number || v instanceof Boolean || v instanceof String) return v;
        if (depth > 50) return String.valueOf(v);
        if (v instanceof Character ch) return String.valueOf(ch);
        Class<?> c = v.getClass();
        if (c.isArray()) {
            if (c.getComponentType() == char.class) {
                List<Object> out = new ArrayList<>();
                for (char ch : (char[]) v) out.add(String.valueOf(ch));
                return out;
            }
            List<Object> out = new ArrayList<>();
            int n = Array.getLength(v);
            for (int i = 0; i < n; i++) out.add(toJson(Array.get(v, i), depth + 1));
            return out;
        }
        if (v instanceof Collection<?> col) {
            List<Object> out = new ArrayList<>();
            for (Object o : col) out.add(toJson(o, depth + 1));
            return out;
        }
        if (v instanceof Map<?, ?> m) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Map.Entry<?, ?> e : m.entrySet()) out.put(String.valueOf(e.getKey()), toJson(e.getValue(), depth + 1));
            return out;
        }
        try {
            String kind = structKind(c);
            if (kind != null) {
                switch (kind) {
                    case "list": return listToJson(v, c);
                    case "tree": return treeToJson(v, c);
                    case "nary": return naryToJson(v, c);
                    case "graph": return graphToJson(v, c);
                    case "random": return randomToJson(v, c);
                    default: return nextptrToJson(v, c);
                }
            }
        } catch (ReflectiveOperationException ignored) {
        }
        return String.valueOf(v);
    }

    /**
     * What a user-defined node class stands for, judged by its fields (never its name): "list" (next), "tree" (left,
     * right), "nextptr" (left, right, next), "nary" (children), "graph" (neighbors), "random" (next + random).
     */
    private static String structKind(Class<?> c) {
        if (c.isPrimitive() || c.isArray() || c.getName().startsWith("java.")) return null;
        if (hasCollectionOf(c, "children")) return "nary";
        if (hasCollectionOf(c, "neighbors")) return "graph";
        if (selfField(c, "next") != null && selfField(c, "random") != null) return "random";
        if (selfField(c, "left") != null && selfField(c, "right") != null) return selfField(c, "next") != null ? "nextptr" : "tree";
        if (selfField(c, "next") != null) return "list";
        return null;
    }

    private static boolean hasCollectionOf(Class<?> c, String name) {
        try {
            Field f = c.getDeclaredField(name);
            return Collection.class.isAssignableFrom(f.getType());
        } catch (NoSuchFieldException e) {
            return false;
        }
    }

    private static Object buildNary(Class<?> c, List<?> values) {
        if (values.isEmpty() || values.get(0) == null) return null;
        try {
            Field children = c.getDeclaredField("children");
            children.setAccessible(true);
            Object root = newNode(c, values.get(0));
            children.set(root, new ArrayList<>());
            Deque<Object> queue = new ArrayDeque<>();
            queue.add(root);
            int i = 2; // values[1] is the null that closes the root
            while (!queue.isEmpty() && i < values.size()) {
                Object parent = queue.poll();
                List<Object> kids = new ArrayList<>();
                while (i < values.size() && values.get(i) != null) {
                    Object kid = newNode(c, values.get(i++));
                    children.set(kid, new ArrayList<>());
                    kids.add(kid);
                    queue.add(kid);
                }
                children.set(parent, kids);
                i++;
            }
            return root;
        } catch (ReflectiveOperationException e) {
            throw new InvalidInput("cannot build " + c.getSimpleName() + ": " + e);
        }
    }

    /** LeetCode's graph encoding: node i (value i+1) has the neighbors adjacency[i]. */
    private static Object buildGraph(Class<?> c, List<?> adjacency) {
        if (adjacency.isEmpty()) return null;
        try {
            Field neighbors = c.getDeclaredField("neighbors");
            neighbors.setAccessible(true);
            List<Object> nodes = new ArrayList<>();
            for (int i = 0; i < adjacency.size(); i++) {
                Object n = newNode(c, i + 1);
                neighbors.set(n, new ArrayList<>());
                nodes.add(n);
            }
            for (int i = 0; i < adjacency.size(); i++) {
                List<Object> nb = new ArrayList<>();
                for (Object v : asList(adjacency.get(i))) {
                    int k = num(v).intValue();
                    if (k < 1 || k > nodes.size()) throw new InvalidInput("graph neighbor " + k + " is out of range");
                    nb.add(nodes.get(k - 1));
                }
                neighbors.set(nodes.get(i), nb);
            }
            return nodes.get(0);
        } catch (ReflectiveOperationException e) {
            throw new InvalidInput("cannot build " + c.getSimpleName() + ": " + e);
        }
    }

    /** [[val, randomIndex], ...] */
    private static Object buildRandom(Class<?> c, List<?> entries) {
        if (entries.isEmpty()) return null;
        try {
            Field next = c.getDeclaredField("next");
            Field random = c.getDeclaredField("random");
            next.setAccessible(true);
            random.setAccessible(true);
            List<Object> nodes = new ArrayList<>();
            for (Object e : entries) nodes.add(newNode(c, asList(e).get(0)));
            for (int i = 0; i < nodes.size(); i++) {
                if (i + 1 < nodes.size()) next.set(nodes.get(i), nodes.get(i + 1));
                Object r = asList(entries.get(i)).get(1);
                if (r != null) {
                    int k = num(r).intValue();
                    if (k < 0 || k >= nodes.size()) throw new InvalidInput("random index " + k + " is out of range");
                    random.set(nodes.get(i), nodes.get(k));
                }
            }
            return nodes.get(0);
        } catch (ReflectiveOperationException e) {
            throw new InvalidInput("cannot build " + c.getSimpleName() + ": " + e);
        }
    }

    private static List<Object> naryToJson(Object root, Class<?> c) throws ReflectiveOperationException {
        Field children = c.getDeclaredField("children");
        Field vf = valueField(c);
        children.setAccessible(true);
        vf.setAccessible(true);
        List<Object> out = new ArrayList<>();
        out.add(toJson(vf.get(root), 1));
        out.add(null);
        List<Object> queue = new ArrayList<>();
        queue.add(root);
        for (int head = 0; head < queue.size() && out.size() < 10_000; head++) {
            Object kids = children.get(queue.get(head));
            if (kids instanceof Collection<?> col) {
                for (Object k : col) {
                    out.add(toJson(vf.get(k), 1));
                    queue.add(k);
                }
            }
            out.add(null);
        }
        while (!out.isEmpty() && out.get(out.size() - 1) == null) out.remove(out.size() - 1);
        return out;
    }

    private static List<Object> graphToJson(Object start, Class<?> c) throws ReflectiveOperationException {
        Field neighbors = c.getDeclaredField("neighbors");
        Field vf = valueField(c);
        neighbors.setAccessible(true);
        vf.setAccessible(true);
        TreeMap<Integer, Object> byVal = new TreeMap<>();
        IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<>();
        Deque<Object> queue = new ArrayDeque<>();
        queue.add(start);
        seen.put(start, true);
        while (!queue.isEmpty() && seen.size() < 10_000) {
            Object n = queue.poll();
            byVal.put(((Number) vf.get(n)).intValue(), n);
            Object nb = neighbors.get(n);
            if (nb instanceof Collection<?> col) for (Object m : col) if (m != null && seen.put(m, true) == null) queue.add(m);
        }
        List<Object> out = new ArrayList<>();
        int max = byVal.isEmpty() ? 0 : byVal.lastKey();
        for (int v = 1; v <= max; v++) {
            List<Object> row = new ArrayList<>();
            Object n = byVal.get(v);
            if (n != null && neighbors.get(n) instanceof Collection<?> col) for (Object m : col) row.add(toJson(vf.get(m), 1));
            out.add(row);
        }
        return out;
    }

    private static List<Object> randomToJson(Object head, Class<?> c) throws ReflectiveOperationException {
        Field next = c.getDeclaredField("next");
        Field random = c.getDeclaredField("random");
        Field vf = valueField(c);
        next.setAccessible(true);
        random.setAccessible(true);
        vf.setAccessible(true);
        List<Object> nodes = new ArrayList<>();
        IdentityHashMap<Object, Integer> index = new IdentityHashMap<>();
        for (Object n = head; n != null && nodes.size() < 10_000 && !index.containsKey(n); n = next.get(n)) {
            index.put(n, nodes.size());
            nodes.add(n);
        }
        List<Object> out = new ArrayList<>();
        for (Object n : nodes) {
            Object r = random.get(n);
            List<Object> pair = new ArrayList<>();
            pair.add(toJson(vf.get(n), 1));
            pair.add(r == null ? null : index.getOrDefault(r, -1));
            out.add(pair);
        }
        return out;
    }

    /** Level order following the next pointers, each row closed with "#". */
    private static List<Object> nextptrToJson(Object root, Class<?> c) throws ReflectiveOperationException {
        Field next = c.getDeclaredField("next");
        Field left = c.getDeclaredField("left");
        Field right = c.getDeclaredField("right");
        Field vf = valueField(c);
        next.setAccessible(true);
        left.setAccessible(true);
        right.setAccessible(true);
        vf.setAccessible(true);
        List<Object> out = new ArrayList<>();
        Object level = root;
        while (level != null && out.size() < 10_000) {
            Object first = null;
            for (Object n = level; n != null && out.size() < 10_000; n = next.get(n)) {
                out.add(toJson(vf.get(n), 1));
                if (first == null) first = left.get(n) != null ? left.get(n) : right.get(n);
            }
            out.add("#");
            level = first;
        }
        return out;
    }

    private static List<Object> listToJson(Object head, Class<?> c) throws ReflectiveOperationException {
        Field next = c.getDeclaredField("next");
        Field vf = valueField(c);
        next.setAccessible(true);
        vf.setAccessible(true);
        List<Object> out = new ArrayList<>();
        IdentityHashMap<Object, Boolean> seen = new IdentityHashMap<>();
        for (Object n = head; n != null && out.size() < 10_000; n = next.get(n)) {
            if (seen.put(n, true) != null) {
                out.add("...cycle");
                break;
            }
            out.add(toJson(vf.get(n), 1));
        }
        return out;
    }

    private static List<Object> treeToJson(Object root, Class<?> c) throws ReflectiveOperationException {
        Field left = c.getDeclaredField("left");
        Field right = c.getDeclaredField("right");
        Field vf = valueField(c);
        left.setAccessible(true);
        right.setAccessible(true);
        vf.setAccessible(true);
        List<Object> out = new ArrayList<>();
        Deque<Optional<Object>> queue = new ArrayDeque<>();
        queue.add(Optional.of(root));
        while (!queue.isEmpty() && out.size() < 10_000) {
            Optional<Object> n = queue.poll();
            if (n.isEmpty()) {
                out.add(null);
                continue;
            }
            Object node = n.get();
            out.add(toJson(vf.get(node), 1));
            queue.add(Optional.ofNullable(left.get(node)));
            queue.add(Optional.ofNullable(right.get(node)));
        }
        while (!out.isEmpty() && out.get(out.size() - 1) == null) out.remove(out.size() - 1);
        return out;
    }

    // ---------------------------------------------------------------- helpers

    private static Class<?> load(String name) {
        try {
            return Class.forName(name, false, Harness.class.getClassLoader());
        } catch (ClassNotFoundException e) {
            return null;
        }
    }

    private static Number num(Object json) {
        if (json instanceof Number n) return n;
        if (json instanceof String s) {
            try {
                return Double.parseDouble(s);
            } catch (NumberFormatException ignored) {
            }
        }
        throw new InvalidInput("expected a number but got " + Json.write(json));
    }

    private static List<?> asList(Object json) {
        if (json instanceof List<?> l) return l;
        throw new InvalidInput("expected a JSON array but got " + Json.write(json));
    }

    private static List<String> asStrings(Object json) {
        List<String> out = new ArrayList<>();
        if (json instanceof List<?> l) for (Object o : l) out.add(String.valueOf(o));
        return out;
    }

    static final class InvalidInput extends RuntimeException {
        InvalidInput(String message) {
            super(message);
        }
    }
}
