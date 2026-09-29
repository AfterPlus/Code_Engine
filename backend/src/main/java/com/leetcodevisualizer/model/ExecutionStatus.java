package com.leetcodevisualizer.model;

public enum ExecutionStatus {
    QUEUED,
    RUNNING,
    SUCCESS,
    COMPILE_ERROR,
    RUNTIME_ERROR,
    TIMEOUT,
    MEMORY_LIMIT,
    STEP_LIMIT,
    SECURITY_VIOLATION,
    INVALID_INPUT,
    CANCELLED,
    INTERNAL_ERROR;

    public boolean isTerminal() {
        return this != QUEUED && this != RUNNING;
    }
}
