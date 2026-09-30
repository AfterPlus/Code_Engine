package com.leetcodevisualizer.model;

import java.util.Map;

/**
 * A request to trace one solution against one test case.
 *
 * @param language     "java" (JavaScript, Python, C and C++ are traced client-side and never reach the server)
 * @param code         the user's solution source
 * @param definitions  optional classes LeetCode defines for the problem (TreeNode, ListNode, Node...); compiled with the
 *                     solution but never traced, and they never shift the solution's line numbers
 * @param testCase     named arguments, e.g. {"nums": [2,7,11,15], "target": 9}; matched to parameter names
 * @param maxSteps     optional lower step cap; clamped to the server maximum
 */
public record ExecutionRequest(String language, String code, String definitions, Map<String, Object> testCase, Integer maxSteps) {

    public ExecutionRequest(String language, String code, Map<String, Object> testCase, Integer maxSteps) {
        this(language, code, null, testCase, maxSteps);
    }
}
