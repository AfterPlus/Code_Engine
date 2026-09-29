package com.leetcodevisualizer.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/** A call-stack frame. {@code id} is stable for the lifetime of the call, so frames can be matched across steps. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class StackFrame {
    public int id;
    public Integer parentId;
    public String name;
    public String className;
    public int line;
    public List<String> args;
    /** Encoded values, parameters first, in declaration order. */
    public Map<String, Object> locals;
}
