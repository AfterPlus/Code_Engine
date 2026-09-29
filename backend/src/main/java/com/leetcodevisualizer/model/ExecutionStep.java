package com.leetcodevisualizer.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * One frame of the execution timeline: a full snapshot of the program state at a pause point.
 *
 * <p>Values inside {@code callStack[*].locals}, {@code globals}, and heap objects use a small, language-neutral
 * encoding: JSON numbers/booleans/null for primitives, {@code {"c":"x"}} for chars, {@code {"str":"..."}} for
 * strings, {@code {"ref":"id"}} for references into {@link #heap}, and {@code {"n":"NaN"}} for non-finite numbers.
 *
 * <p>The tracer only emits structural events ({@code FUNCTION_ENTER}, {@code LINE}, {@code FUNCTION_EXIT},
 * {@code EXCEPTION}). Semantic events such as {@code ARRAY_WRITE} or {@code MAP_PUT} are derived by the
 * frontend state builder by diffing consecutive snapshots, which keeps them identical across languages.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ExecutionStep {
    public int step;
    public int line;
    public String event;
    public String function;
    public Integer callId;
    public Integer parentCallId;
    /** Only the innermost frames are captured; this is the real call depth. */
    public List<StackFrame> callStack;
    public Integer stackDepth;
    public Map<String, HeapObject> heap;
    public Map<String, Object> globals;
    /** Text printed since the previous step. */
    public String out;
    /** Encoded return value, for FUNCTION_EXIT steps. */
    public Object returnValue;
    public ExecutionResult.ExecutionError exception;
}
