package com.leetcodevisualizer.model;

import java.util.Map;

/**
 * A request to trace one solution against one test case.
 *
 * @param language  "java" (JavaScript is traced client-side in a Web Worker and never reaches the server)
 * @param code      the user's solution source
 * @param testCase  named arguments, e.g. {"nums": [2,7,11,15], "target": 9}; matched to parameter names
 * @param maxSteps  optional lower step cap; clamped to the server maximum
 */
public record ExecutionRequest(String language, String code, Map<String, Object> testCase, Integer maxSteps) {
}
