package com.codeengine.instrumentation;

import com.codeengine.model.ExecutionStep;
import com.codeengine.model.HeapObject;
import com.codeengine.model.StackFrame;
import com.codeengine.security.ResourceLimiter;
import com.sun.jdi.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;

import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.function.BooleanSupplier;

/**
 * Drives the sandboxed JVM through the Java Debug Interface and records one {@link ExecutionStep} per executed
 * source line, function entry, and function exit in user code.
 *
 * <p>Tracing is armed only between the harness's {@code begin()} and {@code end()} breakpoints. Lines are traced
 * with breakpoints rather than single-stepping: every line-table entry of every user method gets one, so JDK code
 * runs at full speed while user callbacks (comparators, lambdas) are still traced. (JDWP single-stepping
 * recomputes the stack depth at every bytecode, which makes deep recursion quadratic.) One-line loops such as
 * {@code for (int x : a) s += x;} never change line, so each method's bytecode is also scanned for backward jumps
 * within a line; those loop heads record one frame per iteration.
 *
 * <p>A shadow call stack, driven by method entry/exit events, gives every invocation a stable id (the recursion
 * tree is built from it) and caches each call's variables: a caller's locals cannot change while a callee runs,
 * so only the innermost frame is re-read, and the values a caller shows are those of its call line.
 * A call's FUNCTION_ENTER frame is taken at its first line breakpoint, where the thread is suspended exactly;
 * at a method-entry event it may already be a little further along (e.g. in class loading).
 */
public final class TraceCollector {

    public enum Outcome { COMPLETED, STEP_LIMIT, TIMEOUT, CANCELLED }

    private static final String HARNESS = "lcvharness.Harness";
    /** Frames included per step; deep recursion keeps its true depth in stackDepth. */
    private static final int MAX_FRAMES = 50;

    /** One live invocation, with its variables as last read. */
    private static final class CallRecord {
        final int id;
        final Integer parentId;
        final String name;
        final Method method;
        /** No frame recorded yet: the first line breakpoint of the call records its FUNCTION_ENTER. */
        boolean pendingEnter = true;
        /** Location of the last frame recorded for this call. */
        int lastLine = -1;
        long lastIndex = -1;
        String className = "";
        int line;
        final List<String> args = new ArrayList<>();
        final Map<String, Value> values = new LinkedHashMap<>();
        final Map<String, String> declaredTypes = new HashMap<>();
        ObjectReference self;

        CallRecord(int id, Integer parentId, Method method) {
            this.id = id;
            this.parentId = parentId;
            this.method = method;
            this.name = displayName(method);
        }
    }

    private final VirtualMachine vm;
    private final Set<String> userClasses;
    private final ResourceLimiter limits;
    private final int maxSteps;
    private final Set<Integer> braceOnlyLines;

    private final List<ExecutionStep> steps = new ArrayList<>();
    private final List<CallRecord> shadow = new ArrayList<>();
    private final Map<String, ClassType> loadedUserTypes = new LinkedHashMap<>();
    private final Map<ReferenceType, Boolean> hasInstanceFields = new HashMap<>();
    private final List<EventRequest> tracingRequests = new ArrayList<>();
    private final StringBuilder stdout = new StringBuilder();

    private final Set<ReferenceType> instrumented = new HashSet<>();
    private final Set<BreakpointRequest> lineBreakpoints = new HashSet<>();
    private final Set<Location> loopHeads = new HashSet<>();
    private final Set<Location> handledInSet = new HashSet<>();

    private BreakpointRequest beginBp;
    private BreakpointRequest endBp;
    private boolean tracing;
    /** A caught exception may have unwound calls without exit events; resynchronize at the next line. */
    private boolean resync;
    private int callSeq;
    private Outcome outcome;

    private ObjectReference outBuf;
    private int outSeen;

    /**
     * @param braceOnlyLines source lines holding nothing but braces; javac maps loop back-jumps to them, and a
     *                       frame there shows nothing new, so they are passed through without recording
     */
    public TraceCollector(VirtualMachine vm, Collection<String> userClasses, ResourceLimiter limits, int maxSteps,
                          Set<Integer> braceOnlyLines) {
        this.vm = vm;
        this.userClasses = new LinkedHashSet<>(userClasses);
        this.limits = limits;
        this.maxSteps = maxSteps;
        this.braceOnlyLines = braceOnlyLines;
    }

    public List<ExecutionStep> steps() {
        return steps;
    }

    public String stdout() {
        return stdout.toString();
    }

    public Outcome run(long deadlineNanos, BooleanSupplier cancelled) {
        EventRequestManager erm = vm.eventRequestManager();
        ClassPrepareRequest cpr = erm.createClassPrepareRequest();
        cpr.addClassFilter(HARNESS);
        cpr.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        cpr.enable();
        for (String cls : userClasses) {
            ClassPrepareRequest userPrepare = erm.createClassPrepareRequest();
            userPrepare.addClassFilter(cls);
            userPrepare.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
            userPrepare.enable();
        }
        for (ReferenceType t : vm.classesByName(HARNESS)) installAnchors(t);
        for (String cls : userClasses) vm.classesByName(cls).forEach(this::installLineBreakpoints);

        EventQueue queue = vm.eventQueue();
        try {
            while (true) {
                if (cancelled.getAsBoolean()) return Outcome.CANCELLED;
                if (System.nanoTime() > deadlineNanos) return Outcome.TIMEOUT;
                EventSet set = queue.remove(50);
                if (set == null) continue;
                handledInSet.clear();
                for (Event e : ordered(set)) {
                    if (e instanceof VMDeathEvent || e instanceof VMDisconnectEvent) return Outcome.COMPLETED;
                    handle(e);
                    if (outcome != null) return outcome;
                }
                set.resume();
            }
        } catch (VMDisconnectedException e) {
            return outcome != null ? outcome : Outcome.COMPLETED;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Outcome.CANCELLED;
        }
    }

    /** Within one composite event: entries, then line breakpoints, then exits. */
    private static List<Event> ordered(EventSet set) {
        List<Event> events = new ArrayList<>(set);
        events.sort(Comparator.comparingInt(e -> e instanceof MethodEntryEvent ? 0
                : e instanceof BreakpointEvent ? 1 : e instanceof MethodExitEvent ? 3 : 2));
        return events;
    }

    private void handle(Event e) {
        if (e instanceof ClassPrepareEvent cpe) {
            if (cpe.referenceType().name().equals(HARNESS)) installAnchors(cpe.referenceType());
            else installLineBreakpoints(cpe.referenceType());
        } else if (e instanceof BreakpointEvent be) {
            if (be.request().equals(beginBp)) startTracing(be.thread());
            else if (be.request().equals(endBp)) stopTracing();
            else if (tracing && lineBreakpoints.contains(be.request())) onLine(be);
        } else if (!tracing) {
            return;
        } else if (e instanceof MethodEntryEvent me) {
            onEnter(me);
        } else if (e instanceof MethodExitEvent mx) {
            onExit(mx);
        } else if (e instanceof ExceptionEvent) {
            resync = true;
        }
    }

    private void installAnchors(ReferenceType harness) {
        if (beginBp != null) return;
        EventRequestManager erm = vm.eventRequestManager();
        beginBp = erm.createBreakpointRequest(harness.methodsByName("begin").get(0).location());
        endBp = erm.createBreakpointRequest(harness.methodsByName("end").get(0).location());
        beginBp.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        endBp.setSuspendPolicy(EventRequest.SUSPEND_ALL);
        beginBp.enable();
        endBp.enable();
    }

    private void startTracing(ThreadReference thread) {
        EventRequestManager erm = vm.eventRequestManager();
        // JDI class filters are ANDed within one request, so each user class gets its own entry/exit request.
        for (String cls : userClasses) {
            MethodEntryRequest entry = erm.createMethodEntryRequest();
            entry.addClassFilter(cls);
            entry.addThreadFilter(thread);
            entry.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
            MethodExitRequest exit = erm.createMethodExitRequest();
            exit.addClassFilter(cls);
            exit.addThreadFilter(thread);
            exit.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
            tracingRequests.add(entry);
            tracingRequests.add(exit);
        }
        // JDWP sends no method-exit events for frames unwound by an exception; a caught one triggers a resync.
        ExceptionRequest exceptions = erm.createExceptionRequest(null, true, false);
        exceptions.addThreadFilter(thread);
        exceptions.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
        tracingRequests.add(exceptions);
        tracingRequests.forEach(EventRequest::enable);

        for (ReferenceType t : vm.classesByName("lcvharness.Out")) {
            if (t.getValue(t.fieldByName("BUF")) instanceof ObjectReference buf) {
                outBuf = buf;
                outSeen = intField(buf, "count");
            }
        }
        tracing = true;
    }

    private void stopTracing() {
        tracing = false;
        EventRequestManager erm = vm.eventRequestManager();
        erm.deleteEventRequests(tracingRequests);
        tracingRequests.clear();
    }

    // ------------------------------------------------------------------ events

    private void onEnter(MethodEntryEvent e) {
        Method m = e.method();
        if (m.isStaticInitializer()) return; // class initialization (e.g. javac's enum-switch tables), not a call
        Integer parent = shadow.isEmpty() ? null : shadow.get(shadow.size() - 1).id;
        shadow.add(new CallRecord(++callSeq, parent, m));
    }

    private void onExit(MethodExitEvent e) {
        Method m = e.method();
        if (m.isStaticInitializer() || shadow.isEmpty()) return;
        if (resync) resync(e.thread());
        if (shadow.isEmpty()) return;
        CallRecord call = shadow.get(shadow.size() - 1);
        // A call that never reached a line (no debug info) stays invisible, like library code.
        if (!call.pendingEnter) {
            Value rv = "void".equals(m.returnTypeName()) || m.isConstructor() ? null : e.returnValue();
            snapshot("FUNCTION_EXIT", e.thread(), rv, false);
        }
        shadow.remove(shadow.size() - 1);
    }

    /**
     * A line breakpoint. The first one in a call records its FUNCTION_ENTER. After that, a frame is recorded when
     * the line changes (returning into the middle of the caller's line is not a new frame: the callee's exit shows
     * it), or at a same-line loop head for a new iteration, unless we arrived from a later part of that line (a
     * multi-line for loop's update expression).
     */
    private void onLine(BreakpointEvent e) {
        Location loc = e.location();
        if (loc.lineNumber() <= 0 || loc.method().isStaticInitializer() || !handledInSet.add(loc)) return;
        ThreadReference thread = e.thread();
        if (resync) resync(thread);
        CallRecord call = callFor(loc.method());
        if (call == null) return;
        if (call.pendingEnter) {
            call.pendingEnter = false;
            call.lastLine = loc.lineNumber();
            call.lastIndex = loc.codeIndex();
            snapshot("FUNCTION_ENTER", thread, null, true);
            return;
        }
        boolean newLine = loc.lineNumber() != call.lastLine;
        boolean nextIteration = loopHeads.contains(loc) && call.lastIndex <= loc.codeIndex();
        if (!newLine && !nextIteration) return;
        call.lastLine = loc.lineNumber();
        call.lastIndex = loc.codeIndex();
        if (!braceOnlyLines.contains(loc.lineNumber())) snapshot("LINE", thread, null, true);
    }

    /**
     * The shadow record for the method now executing. Normally the top one; calls entered without ever reaching
     * a line (e.g. bridge methods) are skipped over.
     */
    private CallRecord callFor(Method m) {
        for (int i = shadow.size() - 1; i >= 0 && i >= shadow.size() - 3; i--) {
            if (shadow.get(i).method.equals(m)) return shadow.get(i);
        }
        if (shadow.isEmpty()) {
            CallRecord adopted = new CallRecord(++callSeq, null, m); // running before tracing started
            shadow.add(adopted);
            return adopted;
        }
        return null;
    }

    /** After a caught exception: drop shadow calls whose frames are gone. O(depth), but only after exceptions. */
    private void resync(ThreadReference thread) {
        resync = false;
        try {
            int userFrames = 0;
            for (com.sun.jdi.StackFrame f : thread.frames()) {
                if (isUserFrame(f)) userFrames++;
            }
            while (shadow.size() > userFrames) shadow.remove(shadow.size() - 1);
        } catch (IncompatibleThreadStateException ignored) {
            // not suspended: try again at the next line
            resync = true;
        }
    }

    private void installLineBreakpoints(ReferenceType type) {
        if (!instrumented.add(type)) return;
        EventRequestManager erm = vm.eventRequestManager();
        for (Method m : type.methods()) {
            if (m.isAbstract() || m.isNative() || m.isStaticInitializer()) continue;
            Set<Location> points = new LinkedHashSet<>();
            try {
                points.addAll(m.allLineLocations());
            } catch (AbsentInformationException ignored) {
                // compiled without -g: nothing to break on
            }
            for (long[] jump : Bytecode.backwardJumps(m.bytecodes())) {
                Location from = m.locationOfCodeIndex(jump[0]);
                Location to = m.locationOfCodeIndex(jump[1]);
                if (from == null || to == null || from.lineNumber() != to.lineNumber()) continue;
                loopHeads.add(to);
                points.add(to);
            }
            for (Location loc : points) {
                BreakpointRequest bp = erm.createBreakpointRequest(loc);
                bp.setSuspendPolicy(EventRequest.SUSPEND_EVENT_THREAD);
                bp.enable();
                lineBreakpoints.add(bp);
            }
        }
    }

    // ------------------------------------------------------------------ snapshots

    /**
     * @param readTop re-read the innermost frame (line breakpoints stop exactly in it); at method exit the
     *                thread may already be past the frame, so the values cached at its last line are used
     */
    private ExecutionStep snapshot(String event, ThreadReference thread, Value returnValue, boolean readTop) {
        if (steps.size() >= maxSteps) {
            outcome = Outcome.STEP_LIMIT;
            return null;
        }
        if (shadow.isEmpty()) return null;
        if (readTop) {
            try {
                refresh(shadow.get(shadow.size() - 1), thread.frame(0));
            } catch (IncompatibleThreadStateException ex) {
                return null;
            }
        }

        HeapReader heap = new HeapReader(limits);
        List<StackFrame> stack = new ArrayList<>();
        for (int i = Math.max(0, shadow.size() - MAX_FRAMES); i < shadow.size(); i++) stack.add(frame(shadow.get(i), heap));

        ExecutionStep s = new ExecutionStep();
        s.step = steps.size();
        s.event = event;
        s.callStack = stack;
        s.stackDepth = shadow.size();
        StackFrame top = stack.get(stack.size() - 1);
        s.line = top.line;
        s.function = top.name;
        s.callId = top.id;
        s.parentCallId = top.parentId;
        if (returnValue != null || "FUNCTION_EXIT".equals(event)) s.returnValue = heap.encode(returnValue);
        s.globals = globals(heap);
        Map<String, HeapObject> h = heap.drain();
        s.heap = h;
        s.out = readOutput();
        steps.add(s);
        return s;
    }

    private boolean isUserFrame(com.sun.jdi.StackFrame f) {
        Location l = f.location();
        return userClasses.contains(l.declaringType().name()) && !l.method().isStaticInitializer();
    }

    /** Re-reads a frame's variables into its call record (the only per-step JDWP traffic for the stack). */
    private void refresh(CallRecord rec, com.sun.jdi.StackFrame f) {
        Location loc = f.location();
        rec.className = HeapReader.simpleName(loc.declaringType().name());
        rec.line = loc.lineNumber();
        rec.args.clear();
        rec.values.clear();
        try {
            List<LocalVariable> vars = f.visibleVariables();
            Map<LocalVariable, Value> values = f.getValues(vars);
            for (LocalVariable v : vars) {
                if (!v.isArgument()) continue;
                rec.args.add(v.name());
                rec.values.put(v.name(), values.get(v));
                rec.declaredTypes.put(v.name(), v.typeName());
            }
            for (LocalVariable v : vars) {
                if (v.isArgument()) continue;
                rec.values.put(v.name(), values.get(v));
                rec.declaredTypes.put(v.name(), v.typeName());
            }
        } catch (AbsentInformationException ex) {
            List<Value> args = f.getArgumentValues();
            for (int i = 0; i < args.size(); i++) {
                rec.args.add("arg" + i);
                rec.values.put("arg" + i, args.get(i));
            }
        }
        ObjectReference self = f.thisObject();
        rec.self = self != null && hasInstanceFields(self.referenceType()) ? self : null;
    }

    private StackFrame frame(CallRecord rec, HeapReader heap) {
        StackFrame sf = new StackFrame();
        sf.id = rec.id;
        sf.parentId = rec.parentId;
        sf.name = rec.name;
        sf.className = rec.className;
        sf.line = rec.line;
        sf.args = new ArrayList<>(rec.args);
        sf.locals = new LinkedHashMap<>();
        for (Map.Entry<String, Value> e : rec.values.entrySet()) {
            sf.locals.put(e.getKey(), heap.encode(e.getValue()));
            heap.hint(e.getValue(), rec.declaredTypes.get(e.getKey()));
        }
        if (rec.self != null) sf.locals.put("this", heap.encode(rec.self));
        return sf;
    }

    private boolean hasInstanceFields(ReferenceType t) {
        return hasInstanceFields.computeIfAbsent(t,
                k -> k.allFields().stream().anyMatch(f -> !f.isStatic() && !f.isSynthetic()));
    }

    private Map<String, Object> globals(HeapReader heap) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String cls : userClasses) {
            ClassType t = loadedUserTypes.get(cls);
            if (t == null) {
                for (ReferenceType rt : vm.classesByName(cls)) {
                    if (rt instanceof ClassType ct) t = ct;
                }
                if (t == null) continue;
                loadedUserTypes.put(cls, t);
            }
            if (!t.isInitialized()) continue;
            List<Field> statics = new ArrayList<>();
            for (Field f : t.fields()) if (f.isStatic() && !f.isSynthetic()) statics.add(f);
            if (statics.isEmpty()) continue;
            Map<Field, Value> vals = t.getValues(statics);
            String prefix = cls.equals("Solution") ? "" : HeapReader.simpleName(cls) + ".";
            for (Field f : statics) out.put(prefix + f.name(), heap.encode(vals.get(f)));
        }
        return out.isEmpty() ? null : out;
    }

    private String readOutput() {
        if (outBuf == null) return null;
        int count = intField(outBuf, "count");
        if (count <= outSeen) return null;
        if (!(outBuf.getValue(outBuf.referenceType().fieldByName("data")) instanceof ArrayReference data)) return null;
        List<Value> bytes = data.getValues(outSeen, count - outSeen);
        byte[] raw = new byte[bytes.size()];
        for (int i = 0; i < raw.length; i++) raw[i] = ((ByteValue) bytes.get(i)).value();
        outSeen = count;
        String text = new String(raw, StandardCharsets.UTF_8);
        stdout.append(text);
        return text;
    }

    private static int intField(ObjectReference o, String name) {
        return o.getValue(o.referenceType().fieldByName(name)) instanceof IntegerValue i ? i.value() : 0;
    }

    private static String displayName(Method m) {
        String owner = HeapReader.simpleName(m.declaringType().name());
        String name = m.name();
        if (m.isConstructor()) return "new " + owner;
        if (m.isStaticInitializer()) return owner + ".<static>";
        if (name.startsWith("lambda$")) {
            String[] parts = name.split("\\$");
            return "lambda" + (parts.length > 1 ? "@" + parts[1] : "");
        }
        return owner.equals("Solution") ? name : owner + "." + name;
    }
}
