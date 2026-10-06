package com.codeengine.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.ArrayList;
import java.util.List;

/**
 * The normalized, language-neutral result of a traced execution. The frontend consumes only this shape,
 * so the JavaScript runner in the browser produces exactly the same structure.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ExecutionResult {

    public String executionId;
    public String language;
    public ExecutionStatus status;

    /** One entry per execution frame; still populated (up to the failure point) for runtime errors and limits. */
    public List<ExecutionStep> steps = new ArrayList<>();

    /** The value returned by the solution, serialized as plain JSON (ListNode -> array, TreeNode -> level order). */
    public Object output;

    /** Everything the program printed. */
    public String stdout;

    public ExecutionError error;

    /** Compile diagnostics, mapped to the user's source lines. */
    public List<Diagnostic> diagnostics;

    public long executionTimeMs;

    public static ExecutionResult of(String id, ExecutionStatus status) {
        ExecutionResult r = new ExecutionResult();
        r.executionId = id;
        r.language = "java";
        r.status = status;
        return r;
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ExecutionError(String type, String message, Integer line, String function) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Diagnostic(long line, long column, String severity, String message, String file) {
    }
}
