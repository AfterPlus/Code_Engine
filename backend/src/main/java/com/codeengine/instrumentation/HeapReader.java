package com.codeengine.instrumentation;

import com.codeengine.model.HeapObject;
import com.codeengine.security.ResourceLimiter;
import com.sun.jdi.*;

import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Encodes JDI values into the language-neutral value model and walks everything reachable from them into a
 * heap snapshot. Collections are recognized by their runtime class and read through their internal fields
 * (never by invoking methods in the target VM, which could run user code or disturb the trace).
 *
 * <p>One instance is used per step.
 */
final class HeapReader {

    private static final Set<String> BOXES = Set.of("java.lang.Integer", "java.lang.Long", "java.lang.Short",
            "java.lang.Byte", "java.lang.Double", "java.lang.Float", "java.lang.Boolean", "java.lang.Character");

    private final int maxObjects;
    private final int maxElements;
    private final Map<String, HeapObject> heap = new LinkedHashMap<>();
    private final Set<String> seen = new HashSet<>();
    private final ArrayDeque<ObjectReference> pending = new ArrayDeque<>();
    private final Map<String, String> kindHints = new HashMap<>();

    HeapReader(ResourceLimiter limits) {
        this.maxObjects = limits.maxHeapObjectsPerStep();
        this.maxElements = limits.maxElementsPerCollection();
    }

    // ------------------------------------------------------------------ values

    Object encode(Value v) {
        if (v == null) return null;
        if (v instanceof BooleanValue b) return b.value();
        if (v instanceof CharValue c) return Map.of("c", String.valueOf(c.value()));
        if (v instanceof ByteValue b) return (int) b.value();
        if (v instanceof ShortValue s) return (int) s.value();
        if (v instanceof IntegerValue i) return i.value();
        if (v instanceof LongValue l) return l.value();
        if (v instanceof FloatValue f) return number(f.value());
        if (v instanceof DoubleValue d) return number(d.value());
        if (v instanceof StringReference s) {
            String str = s.value();
            return Map.of("str", str.length() > 500 ? str.substring(0, 500) + "…" : str);
        }
        if (v instanceof ObjectReference o) {
            ReferenceType type = o.referenceType();
            String tn = type.name();
            if (BOXES.contains(tn)) return encode(get(o, "value"));
            if (type instanceof ClassType ct && ct.isEnum()) {
                Value name = get(o, "name");
                return Map.of("enum", name instanceof StringReference s ? s.value() : "?");
            }
            String id = id(o);
            if (seen.add(id)) {
                if (seen.size() <= maxObjects) pending.add(o);
            }
            return Map.of("ref", id);
        }
        return String.valueOf(v);
    }

    private static Object number(double d) {
        if (Double.isNaN(d) || Double.isInfinite(d)) return Map.of("n", Double.toString(d));
        return d;
    }

    /** Uses the static (declared) type of a variable to refine how a collection is shown. */
    void hint(Value v, String declaredType) {
        if (!(v instanceof ObjectReference o) || declaredType == null) return;
        switch (declaredType) {
            case "java.util.Queue" -> kindHints.put(id(o), "queue");
            case "java.util.Deque" -> kindHints.put(id(o), "deque");
            default -> {
            }
        }
    }

    Map<String, HeapObject> drain() {
        while (!pending.isEmpty()) {
            ObjectReference o = pending.poll();
            try {
                HeapObject h = describe(o);
                heap.put(h.id, h);
            } catch (ObjectCollectedException ignored) {
                // gone between steps
            }
        }
        kindHints.forEach((id, kind) -> {
            HeapObject h = heap.get(id);
            if (h != null && ("list".equals(h.kind) || "deque".equals(h.kind))) h.kind = kind;
        });
        return heap;
    }

    // ------------------------------------------------------------------ objects

    private HeapObject describe(ObjectReference o) {
        HeapObject h = new HeapObject();
        h.id = id(o);
        String tn = o.referenceType().name();
        h.type = simpleName(tn);

        if (o instanceof ArrayReference a) {
            h.kind = "array";
            int len = a.length();
            h.elems = encodeAll(len == 0 ? List.of() : a.getValues(0, Math.min(len, maxElements)));
            truncate(h, len);
            return h;
        }
        if (tn.startsWith("java.util.Collections$Unmodifiable") || tn.startsWith("java.util.Collections$Synchronized")) {
            Value inner = firstNonNull(o, "list", "c", "m", "s", "ss", "sm");
            if (inner instanceof ObjectReference io) {
                HeapObject d = describe(io);
                d.id = h.id;
                return d;
            }
        }
        switch (tn) {
            case "java.util.ArrayList" -> sequence(h, "list", o, "elementData", intField(o, "size"));
            case "java.util.Vector" -> sequence(h, "list", o, "elementData", intField(o, "elementCount"));
            case "java.util.Stack" -> sequence(h, "stack", o, "elementData", intField(o, "elementCount"));
            case "java.util.PriorityQueue" -> sequence(h, "pq", o, "queue", intField(o, "size"));
            case "java.util.Arrays$ArrayList" -> sequence(h, "list", o, "a", -1);
            case "java.util.ImmutableCollections$ListN" -> sequence(h, "list", o, "elements", -1);
            case "java.util.ImmutableCollections$List12" -> pair(h, "list", o);
            case "java.util.ImmutableCollections$Set12" -> pair(h, "set", o);
            case "java.util.ImmutableCollections$SetN" -> {
                sequence(h, "set", o, "elements", -1);
                h.elems.removeIf(Objects::isNull);
            }
            case "java.util.LinkedList" -> linkedList(h, o);
            case "java.util.ArrayDeque" -> arrayDeque(h, o);
            case "java.util.HashMap", "java.util.LinkedHashMap", "java.util.Hashtable",
                 "java.util.concurrent.ConcurrentHashMap", "java.util.TreeMap" -> {
                h.kind = "map";
                h.entries = mapEntries(o, tn);
            }
            case "java.util.ImmutableCollections$MapN" -> immutableMap(h, o);
            case "java.util.ImmutableCollections$Map1" -> {
                h.kind = "map";
                h.entries = List.of(Arrays.asList(encode(get(o, "k0")), encode(get(o, "v0"))));
            }
            case "java.util.HashSet", "java.util.LinkedHashSet", "java.util.TreeSet" -> {
                h.kind = "set";
                Value backing = firstNonNull(o, "map", "m");
                h.elems = new ArrayList<>();
                if (backing instanceof ObjectReference bm) {
                    for (List<Object> e : mapEntries(bm, bm.referenceType().name())) h.elems.add(e.get(0));
                }
            }
            case "java.lang.StringBuilder", "java.lang.StringBuffer" -> stringBuilder(h, o);
            default -> {
                if (tn.startsWith("java.") || tn.startsWith("javax.") || tn.startsWith("jdk.") || tn.startsWith("sun.")
                        || tn.contains("$$Lambda")) {
                    h.kind = "opaque";
                    if (tn.contains("$$Lambda")) h.type = "lambda";
                } else {
                    h.kind = "object";
                    h.fields = new LinkedHashMap<>();
                    ReferenceType rt = o.referenceType();
                    List<Field> fields = new ArrayList<>();
                    for (Field f : rt.allFields()) {
                        if (!f.isStatic() && !f.isSynthetic()) fields.add(f);
                    }
                    Map<Field, Value> vals = o.getValues(fields);
                    for (Field f : fields) h.fields.put(f.name(), encode(vals.get(f)));
                }
            }
        }
        return h;
    }

    private void sequence(HeapObject h, String kind, ObjectReference o, String arrayField, int size) {
        h.kind = kind;
        h.elems = new ArrayList<>();
        if (get(o, arrayField) instanceof ArrayReference arr) {
            int n = size < 0 ? arr.length() : Math.min(size, arr.length());
            if (n > 0) h.elems = encodeAll(arr.getValues(0, Math.min(n, maxElements)));
            truncate(h, n);
        }
    }

    private void pair(HeapObject h, String kind, ObjectReference o) {
        h.kind = kind;
        h.elems = new ArrayList<>();
        for (String f : new String[]{"e0", "e1"}) {
            Value v = get(o, f);
            // Single-element instances store a private sentinel (a bare java.lang.Object) in e1.
            if (v != null && !(v instanceof ObjectReference r && r.referenceType().name().equals("java.lang.Object"))) {
                h.elems.add(encode(v));
            }
        }
    }

    private void linkedList(HeapObject h, ObjectReference o) {
        h.kind = "list";
        h.elems = new ArrayList<>();
        int size = intField(o, "size");
        Value node = get(o, "first");
        while (node instanceof ObjectReference n && h.elems.size() < maxElements) {
            h.elems.add(encode(get(n, "item")));
            node = get(n, "next");
        }
        truncate(h, size);
    }

    private void arrayDeque(HeapObject h, ObjectReference o) {
        h.kind = "deque";
        h.elems = new ArrayList<>();
        if (!(get(o, "elements") instanceof ArrayReference arr)) return;
        int head = intField(o, "head");
        int tail = intField(o, "tail");
        int cap = arr.length();
        if (cap == 0) return;
        List<Value> all = arr.getValues();
        int size = tail >= head ? tail - head : cap - head + tail;
        for (int i = head, k = 0; i != tail && k < maxElements; i = (i + 1) % cap, k++) {
            h.elems.add(encode(all.get(i)));
        }
        truncate(h, size);
    }

    private List<List<Object>> mapEntries(ObjectReference map, String tn) {
        List<List<Object>> out = new ArrayList<>();
        if (tn.equals("java.util.TreeMap")) {
            // iterative in-order walk
            Deque<ObjectReference> stack = new ArrayDeque<>();
            Value cur = get(map, "root");
            while ((cur instanceof ObjectReference || !stack.isEmpty()) && out.size() < maxElements) {
                while (cur instanceof ObjectReference c) {
                    stack.push(c);
                    cur = get(c, "left");
                }
                ObjectReference e = stack.pop();
                out.add(Arrays.asList(encode(get(e, "key")), encode(get(e, "value"))));
                cur = get(e, "right");
            }
            return out;
        }
        if (tn.equals("java.util.LinkedHashMap")) {
            Value e = get(map, "head");
            while (e instanceof ObjectReference n && out.size() < maxElements) {
                out.add(Arrays.asList(encode(get(n, "key")), encode(get(n, "value"))));
                e = get(n, "after");
            }
            return out;
        }
        if (!(get(map, "table") instanceof ArrayReference table)) return out;
        for (Value bucket : table.getValues()) {
            Value e = bucket;
            while (e instanceof ObjectReference n && out.size() < maxElements) {
                Value val = n.referenceType().fieldByName("value") != null ? get(n, "value") : get(n, "val");
                out.add(Arrays.asList(encode(get(n, "key")), encode(val)));
                e = get(n, "next");
            }
            if (out.size() >= maxElements) break;
        }
        return out;
    }

    private void immutableMap(HeapObject h, ObjectReference o) {
        h.kind = "map";
        h.entries = new ArrayList<>();
        if (!(get(o, "table") instanceof ArrayReference table)) return;
        List<Value> all = table.getValues();
        for (int i = 0; i + 1 < all.size() && h.entries.size() < maxElements; i += 2) {
            if (all.get(i) != null) h.entries.add(Arrays.asList(encode(all.get(i)), encode(all.get(i + 1))));
        }
    }

    /** Shown as a sequence of characters so appends/deletes animate like array writes. */
    private void stringBuilder(HeapObject h, ObjectReference o) {
        h.kind = "list";
        h.elems = new ArrayList<>();
        int count = intField(o, "count");
        if (!(get(o, "value") instanceof ArrayReference arr) || count == 0) return;
        boolean utf16 = get(o, "coder") instanceof ByteValue b && b.value() != 0;
        int bytes = Math.min(arr.length(), utf16 ? count * 2 : count);
        List<Value> vals = arr.getValues(0, bytes);
        byte[] raw = new byte[vals.size()];
        for (int i = 0; i < raw.length; i++) raw[i] = ((ByteValue) vals.get(i)).value();
        String s = utf16 ? new String(raw, StandardCharsets.UTF_16LE) : new String(raw, StandardCharsets.ISO_8859_1);
        for (int i = 0; i < s.length() && i < maxElements; i++) h.elems.add(Map.of("c", String.valueOf(s.charAt(i))));
        truncate(h, s.length());
    }

    // ------------------------------------------------------------------ helpers

    private List<Object> encodeAll(List<? extends Value> values) {
        List<Object> out = new ArrayList<>(values.size());
        for (Value v : values) out.add(encode(v));
        return out;
    }

    private void truncate(HeapObject h, int realSize) {
        if (h.elems != null && realSize > h.elems.size()) {
            h.length = realSize;
            h.truncated = true;
        }
    }

    private static Value get(ObjectReference o, String field) {
        Field f = o.referenceType().fieldByName(field);
        return f == null ? null : o.getValue(f);
    }

    private static Value firstNonNull(ObjectReference o, String... fields) {
        for (String f : fields) {
            Value v = get(o, f);
            if (v != null) return v;
        }
        return null;
    }

    private static int intField(ObjectReference o, String field) {
        return get(o, field) instanceof IntegerValue i ? i.value() : -1;
    }

    static String id(ObjectReference o) {
        return Long.toString(o.uniqueID());
    }

    /** "java.util.HashMap" -> "HashMap", "Solution$Node" -> "Node", "[I" style names are already readable in JDI. */
    static String simpleName(String typeName) {
        String s = typeName;
        int dot = s.lastIndexOf('.');
        if (dot >= 0 && !s.substring(0, dot).contains("[")) s = s.substring(dot + 1);
        int dollar = s.lastIndexOf('$');
        if (dollar >= 0 && dollar + 1 < s.length() && !s.contains("$$")) s = s.substring(dollar + 1);
        return s;
    }
}
