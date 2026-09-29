package com.leetcodevisualizer.service;

import com.leetcodevisualizer.model.ExecutionRequest;
import com.leetcodevisualizer.model.ExecutionResult;
import com.leetcodevisualizer.model.ExecutionStatus;
import com.leetcodevisualizer.model.ExecutionStep;
import com.leetcodevisualizer.model.HeapObject;
import com.leetcodevisualizer.security.ResourceLimiter;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Objects;

import static org.junit.jupiter.api.Assertions.*;

/** End-to-end tests: real compilation, a real sandboxed JVM, and real JDI tracing. */
class TraceServiceTest {

    private static TraceService service;

    @BeforeAll
    static void setUp() throws Exception {
        ResourceLimiter limits = ResourceLimiter.defaults();
        service = new TraceService(new SandboxService(limits), limits);
    }

    private static ExecutionResult run(String code, Map<String, Object> testCase) {
        return run(code, testCase, null);
    }

    private static ExecutionResult run(String code, Map<String, Object> testCase, Integer maxSteps) {
        return service.execute("test", new ExecutionRequest("java", code, testCase, maxSteps), () -> false);
    }

    @Test
    void twoSumProducesArrayMapAndLineSteps() {
        String code = """
                class Solution {
                    public int[] twoSum(int[] nums, int target) {
                        Map<Integer, Integer> map = new HashMap<>();
                        for (int i = 0; i < nums.length; i++) {
                            int complement = target - nums[i];
                            if (map.containsKey(complement)) {
                                return new int[]{map.get(complement), i};
                            }
                            map.put(nums[i], i);
                        }
                        return new int[]{};
                    }
                }
                """;
        ExecutionResult r = run(code, Map.of("nums", List.of(2, 7, 11, 15), "target", 9));
        assertEquals(ExecutionStatus.SUCCESS, r.status, () -> String.valueOf(r.error));
        assertEquals(List.of(0L, 1L), ((List<?>) r.output).stream().map(o -> ((Number) o).longValue()).toList());
        assertEquals("FUNCTION_ENTER", r.steps.get(0).event);
        assertEquals("twoSum", r.steps.get(0).function);
        assertTrue(r.steps.stream().anyMatch(s -> s.line == 5), "line 5 should be stepped");
        assertEquals("FUNCTION_EXIT", r.steps.get(r.steps.size() - 1).event);

        // After map.put(2, 0) the heap must contain a map with one entry.
        boolean sawMapEntry = r.steps.stream().flatMap(s -> s.heap.values().stream())
                .anyMatch(h -> "map".equals(h.kind) && h.entries.size() == 1);
        assertTrue(sawMapEntry);
        HeapObject nums = r.steps.get(0).heap.values().stream().filter(h -> "array".equals(h.kind)).findFirst().orElseThrow();
        assertEquals(List.of(2, 7, 11, 15), nums.elems);
    }

    @Test
    void bareMethodIsWrappedAndLinesArePreserved() {
        String code = """
                int sum(int[] a) {
                    int s = 0;
                    for (int x : a) s += x;
                    return s;
                }
                """;
        ExecutionResult r = run(code, Map.of("a", List.of(1, 2, 3)));
        assertEquals(ExecutionStatus.SUCCESS, r.status, () -> String.valueOf(r.error));
        assertEquals(6L, ((Number) r.output).longValue());
        assertTrue(r.steps.stream().allMatch(s -> s.line >= 1 && s.line <= 5));
        // One-line loop: one frame per iteration (plus the loop entry), not a single frame for the whole loop.
        assertTrue(r.steps.stream().filter(s -> s.line == 3).count() >= 4,
                () -> r.steps.stream().map(s -> s.line + ":" + s.event).toList().toString());
    }

    @Test
    void recursionGetsDistinctCallIdsAndParents() {
        String code = """
                class Solution {
                    public int fib(int n) {
                        if (n <= 1) return n;
                        return fib(n - 1) + fib(n - 2);
                    }
                }
                """;
        ExecutionResult r = run(code, Map.of("n", 4));
        assertEquals(ExecutionStatus.SUCCESS, r.status, () -> String.valueOf(r.error));
        assertEquals(3L, ((Number) r.output).longValue());
        List<ExecutionStep> enters = r.steps.stream().filter(s -> "FUNCTION_ENTER".equals(s.event)).toList();
        assertEquals(9, enters.size(), "fib(4) makes 9 calls");
        assertTrue(enters.stream().skip(1).allMatch(s -> s.parentCallId != null));
        int maxDepth = r.steps.stream().mapToInt(s -> s.callStack.size()).max().orElse(0);
        assertEquals(4, maxDepth);
        assertTrue(r.steps.stream().anyMatch(s -> "FUNCTION_EXIT".equals(s.event) && Objects.equals(s.returnValue, 2)));
    }

    @Test
    void linkedListInputIsBuiltAndOutputSerialized() {
        String code = """
                class Solution {
                    public ListNode reverseList(ListNode head) {
                        ListNode prev = null, cur = head;
                        while (cur != null) {
                            ListNode next = cur.next;
                            cur.next = prev;
                            prev = cur;
                            cur = next;
                        }
                        return prev;
                    }
                }
                """;
        ExecutionResult r = run(code, Map.of("head", List.of(1, 2, 3)));
        assertEquals(ExecutionStatus.SUCCESS, r.status, () -> String.valueOf(r.error));
        assertEquals(List.of(3L, 2L, 1L), ((List<?>) r.output).stream().map(o -> ((Number) o).longValue()).toList());
        assertTrue(r.steps.get(0).heap.values().stream().anyMatch(h -> "ListNode".equals(h.type) && "object".equals(h.kind)));
    }

    @Test
    void printsAreAttributedToSteps() {
        String code = """
                class Solution {
                    public void hello(int n) {
                        for (int i = 0; i < n; i++) {
                            System.out.println("hi " + i);
                        }
                    }
                }
                """;
        ExecutionResult r = run(code, Map.of("n", 2));
        assertEquals(ExecutionStatus.SUCCESS, r.status, () -> String.valueOf(r.error));
        assertEquals("hi 0\nhi 1\n", r.stdout.replace("\r", ""));
        assertEquals(2, r.steps.stream().filter(s -> s.out != null).count());
    }

    @Test
    void entryMethodIsChosenByTypeWhenNamesDoNotMatch() {
        // The test-case key ("grid") matches no parameter name, and the public helper has the same arity:
        // only the argument types can tell which method is the entry point.
        String code = """
                class Solution {
                    int[] parent;
                    public int find(int i) {
                        return parent[i] == i ? i : (parent[i] = find(parent[i]));
                    }
                    public int numIslands(char[][] g) {
                        int count = 0;
                        for (char[] row : g) for (char c : row) if (c == '1') count++;
                        return count;
                    }
                }
                """;
        Map<String, Object> tc = Map.of("grid", List.of(List.of("1", "0"), List.of("0", "1")));
        ExecutionResult r = run(code, tc);
        assertEquals(ExecutionStatus.SUCCESS, r.status, () -> String.valueOf(r.error));
        assertEquals(2L, ((Number) r.output).longValue());
    }

    @Test
    void runtimeErrorKeepsTraceAndAddsExceptionFrame() {
        String code = """
                class Solution {
                    public int get(int[] a) {
                        int i = 5;
                        return a[i];
                    }
                }
                """;
        ExecutionResult r = run(code, Map.of("a", List.of(1)));
        assertEquals(ExecutionStatus.RUNTIME_ERROR, r.status);
        assertEquals("ArrayIndexOutOfBoundsException", r.error.type());
        assertEquals(4, r.error.line());
        ExecutionStep last = r.steps.get(r.steps.size() - 1);
        assertEquals("EXCEPTION", last.event);
        assertTrue(r.steps.size() >= 3);
    }

    @Test
    void compileErrorsMapToUserLines() {
        String code = """
                class Solution {
                    public int f(int x) {
                        return y;
                    }
                }
                """;
        ExecutionResult r = run(code, Map.of("x", 1));
        assertEquals(ExecutionStatus.COMPILE_ERROR, r.status);
        assertEquals(3, r.diagnostics.get(0).line());
    }

    @Test
    void forbiddenApisAreRejectedBeforeRunning() {
        String code = """
                class Solution {
                    public boolean f() throws Exception {
                        return new java.io.File("/").delete();
                    }
                }
                """;
        ExecutionResult r = run(code, Map.of());
        assertEquals(ExecutionStatus.SECURITY_VIOLATION, r.status);
        assertTrue(r.steps.isEmpty());
        assertEquals(3, r.error.line());
    }

    @Test
    void infiniteLoopHitsStepLimitButKeepsFrames() {
        String code = """
                class Solution {
                    public int spin() {
                        int i = 0;
                        while (true) { i++; }
                    }
                }
                """;
        ExecutionResult r = run(code, Map.of(), 200);
        assertEquals(ExecutionStatus.STEP_LIMIT, r.status);
        assertEquals(200, r.steps.size());
    }

    @Test
    void collectionsAndTreesAreRecognized() {
        String code = """
                class Solution {
                    public int maxDepth(TreeNode root) {
                        Deque<TreeNode> stack = new ArrayDeque<>();
                        Queue<Integer> q = new LinkedList<>();
                        Set<Integer> seen = new HashSet<>();
                        List<Integer> order = new ArrayList<>();
                        q.offer(1); seen.add(2); order.add(3);
                        if (root == null) return 0;
                        return 1 + Math.max(maxDepth(root.left), maxDepth(root.right));
                    }
                }
                """;
        Map<String, Object> tc = new java.util.HashMap<>();
        tc.put("root", java.util.Arrays.asList(3, 9, 20, null, null, 15, 7));
        ExecutionResult r = run(code, tc);
        assertEquals(ExecutionStatus.SUCCESS, r.status, () -> String.valueOf(r.error));
        assertEquals(3L, ((Number) r.output).longValue());
        ExecutionStep s = r.steps.stream().filter(x -> x.line == 8).findFirst().orElseThrow();
        List<String> kinds = s.heap.values().stream().map(h -> h.kind).toList();
        assertTrue(kinds.containsAll(List.of("deque", "queue", "set", "list", "object")), kinds::toString);
    }
}
