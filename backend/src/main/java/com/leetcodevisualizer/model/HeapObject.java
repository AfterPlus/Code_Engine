package com.leetcodevisualizer.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * A heap object reachable from the stack, described by runtime structure rather than by variable name.
 *
 * <p>{@code kind} is one of: array, list, map, set, stack, queue, deque, pq, object, opaque.
 * Sequences use {@code elems}, maps use {@code entries} ([key, value] pairs), objects use {@code fields}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class HeapObject {
    public String id;
    public String kind;
    public String type;
    public List<Object> elems;
    public List<List<Object>> entries;
    public Map<String, Object> fields;
    /** Real size when {@code elems}/{@code entries} were truncated. */
    public Integer length;
    public Boolean truncated;
}
