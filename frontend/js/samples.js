// Example problems, in the milestone order from the spec: arrays + maps, recursion, binary search, linked
// lists, trees (BFS), grids (DFS), graphs, DP, stacks, heaps. None of them has a special-cased visualizer.

const BASE = [
  {
    id: 'two-sum',
    title: 'Pair With a Given Sum',
    shows: 'array, hash map',
    problem: `Find two different positions in an array whose values add up to a target, and return those two indices.

Exactly one such pair exists, and an element cannot be used twice.

Example: nums = [2,7,11,15], target = 9  →  [0,1]`,
    java: `class Solution {
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
`,
    javascript: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
var twoSum = function(nums, target) {
    const map = new Map();
    for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (map.has(complement)) {
            return [map.get(complement), i];
        }
        map.set(nums[i], i);
    }
    return [];
};
`,
    tests: [
      { input: 'nums = [2,7,11,15], target = 9', expected: '[0,1]' },
      { input: 'nums = [3,2,4], target = 6', expected: '[1,2]' },
      { input: 'nums = [3,3], target = 6', expected: '[0,1]' },
    ],
  },
  {
    id: 'fibonacci',
    title: 'Fibonacci Number',
    shows: 'recursion tree, call stack',
    problem: `The Fibonacci sequence starts 0, 1, and every later term is the sum of the two terms before it: F(n) = F(n - 1) + F(n - 2). Compute F(n).

Example: n = 4  →  3`,
    java: `class Solution {
    public int fib(int n) {
        if (n <= 1) {
            return n;
        }
        return fib(n - 1) + fib(n - 2);
    }
}
`,
    javascript: `/**
 * @param {number} n
 * @return {number}
 */
var fib = function(n) {
    if (n <= 1) {
        return n;
    }
    return fib(n - 1) + fib(n - 2);
};
`,
    tests: [{ input: 'n = 4', expected: '3' }, { input: 'n = 6', expected: '8' }],
  },
  {
    id: 'binary-search',
    title: 'Binary Search',
    shows: 'array pointers, range',
    problem: `Given an array sorted in ascending order and a target value, return the position of the target, or -1 if it is not there. Aim for O(log n) time.

Example: nums = [-1,0,3,5,9,12], target = 9  →  4`,
    java: `class Solution {
    public int search(int[] nums, int target) {
        int left = 0, right = nums.length - 1;
        while (left <= right) {
            int mid = left + (right - left) / 2;
            if (nums[mid] == target) {
                return mid;
            } else if (nums[mid] < target) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }
        return -1;
    }
}
`,
    javascript: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number}
 */
var search = function(nums, target) {
    let left = 0, right = nums.length - 1;
    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        if (nums[mid] === target) {
            return mid;
        } else if (nums[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    return -1;
};
`,
    tests: [
      { input: 'nums = [-1,0,3,5,9,12], target = 9', expected: '4' },
      { input: 'nums = [-1,0,3,5,9,12], target = 2', expected: '-1' },
    ],
  },
  {
    id: 'reverse-list',
    title: 'Reverse a Linked List',
    shows: 'linked list, pointers',
    problem: `Reverse a singly linked list: given its first node, return the first node of the reversed list.

Example: head = [1,2,3,4,5]  →  [5,4,3,2,1]`,
    java: `/**
 * Definition for singly-linked list.
 * public class ListNode {
 *     int val;
 *     ListNode next;
 * }
 */
class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null;
        ListNode cur = head;
        while (cur != null) {
            ListNode next = cur.next;
            cur.next = prev;
            prev = cur;
            cur = next;
        }
        return prev;
    }
}
`,
    javascript: `/**
 * @param {ListNode} head
 * @return {ListNode}
 */
var reverseList = function(head) {
    let prev = null;
    let cur = head;
    while (cur !== null) {
        const next = cur.next;
        cur.next = prev;
        prev = cur;
        cur = next;
    }
    return prev;
};
`,
    tests: [{ input: 'head = [1,2,3,4,5]', expected: '[5,4,3,2,1]' }, { input: 'head = [1,2]', expected: '[2,1]' }],
  },
  {
    id: 'level-order',
    title: 'Level-Order Traversal',
    shows: 'tree, queue (BFS)',
    problem: `Visit a binary tree one level at a time, left to right, and return the values of each level as its own list.

Example: root = [3,9,20,null,null,15,7]  →  [[3],[9,20],[15,7]]`,
    java: `class Solution {
    public List<List<Integer>> levelOrder(TreeNode root) {
        List<List<Integer>> result = new ArrayList<>();
        if (root == null) return result;
        Queue<TreeNode> queue = new LinkedList<>();
        queue.offer(root);
        while (!queue.isEmpty()) {
            int size = queue.size();
            List<Integer> level = new ArrayList<>();
            for (int i = 0; i < size; i++) {
                TreeNode node = queue.poll();
                level.add(node.val);
                if (node.left != null) queue.offer(node.left);
                if (node.right != null) queue.offer(node.right);
            }
            result.add(level);
        }
        return result;
    }
}
`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number[][]}
 */
var levelOrder = function(root) {
    const result = [];
    if (!root) return result;
    const queue = [root];
    while (queue.length > 0) {
        const size = queue.length;
        const level = [];
        for (let i = 0; i < size; i++) {
            const node = queue.shift();
            level.push(node.val);
            if (node.left) queue.push(node.left);
            if (node.right) queue.push(node.right);
        }
        result.push(level);
    }
    return result;
};
`,
    tests: [{ input: 'root = [3,9,20,null,null,15,7]', expected: '[[3],[9,20],[15,7]]' }, { input: 'root = [1,2,3,4,null,null,5]', expected: '[[1],[2,3],[4,5]]' }],
  },
  {
    id: 'islands',
    title: 'Counting Islands',
    shows: 'grid, DFS recursion',
    problem: `A grid marks land with '1' and water with '0'. Count the islands: maximal groups of land cells that touch each other up, down, left or right.

Example: grid = [["1","1","0"],["0","1","0"],["0","0","1"]]  →  2`,
    java: `class Solution {
    public int numIslands(char[][] grid) {
        int count = 0;
        for (int r = 0; r < grid.length; r++) {
            for (int c = 0; c < grid[0].length; c++) {
                if (grid[r][c] == '1') {
                    count++;
                    sink(grid, r, c);
                }
            }
        }
        return count;
    }

    private void sink(char[][] grid, int r, int c) {
        if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] != '1') {
            return;
        }
        grid[r][c] = '0';
        sink(grid, r + 1, c);
        sink(grid, r - 1, c);
        sink(grid, r, c + 1);
        sink(grid, r, c - 1);
    }
}
`,
    javascript: `/**
 * @param {character[][]} grid
 * @return {number}
 */
var numIslands = function(grid) {
    let count = 0;
    const sink = (r, c) => {
        if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] !== '1') {
            return;
        }
        grid[r][c] = '0';
        sink(r + 1, c);
        sink(r - 1, c);
        sink(r, c + 1);
        sink(r, c - 1);
    };
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[0].length; c++) {
            if (grid[r][c] === '1') {
                count++;
                sink(r, c);
            }
        }
    }
    return count;
};
`,
    tests: [{ input: 'grid = [["1","1","0"],["0","1","0"],["0","0","1"]]', expected: '2' }],
  },
  {
    id: 'valid-path',
    title: 'Is There a Path Between Two Vertices',
    shows: 'adjacency list, BFS, visited',
    problem: `An undirected graph has vertices numbered 0 to n - 1, joined by the listed edges. Decide whether you can get from the source vertex to the destination vertex by following edges.

Example: n = 3, edges = [[0,1],[1,2],[2,0]], source = 0, destination = 2  →  true`,
    java: `class Solution {
    public boolean validPath(int n, int[][] edges, int source, int destination) {
        List<List<Integer>> graph = new ArrayList<>();
        for (int i = 0; i < n; i++) graph.add(new ArrayList<>());
        for (int[] e : edges) {
            graph.get(e[0]).add(e[1]);
            graph.get(e[1]).add(e[0]);
        }
        boolean[] visited = new boolean[n];
        Queue<Integer> queue = new ArrayDeque<>();
        queue.offer(source);
        visited[source] = true;
        while (!queue.isEmpty()) {
            int node = queue.poll();
            if (node == destination) return true;
            for (int next : graph.get(node)) {
                if (!visited[next]) {
                    visited[next] = true;
                    queue.offer(next);
                }
            }
        }
        return false;
    }
}
`,
    javascript: `/**
 * @param {number} n
 * @param {number[][]} edges
 * @param {number} source
 * @param {number} destination
 * @return {boolean}
 */
var validPath = function(n, edges, source, destination) {
    const graph = [];
    for (let i = 0; i < n; i++) graph.push([]);
    for (const [a, b] of edges) {
        graph[a].push(b);
        graph[b].push(a);
    }
    const visited = new Array(n).fill(false);
    const queue = [source];
    visited[source] = true;
    while (queue.length > 0) {
        const node = queue.shift();
        if (node === destination) return true;
        for (const next of graph[node]) {
            if (!visited[next]) {
                visited[next] = true;
                queue.push(next);
            }
        }
    }
    return false;
};
`,
    tests: [
      { input: 'n = 6, edges = [[0,1],[0,2],[3,5],[5,4],[4,3]], source = 0, destination = 5', expected: 'false' },
      { input: 'n = 4, edges = [[0,1],[1,2],[2,3]], source = 0, destination = 3', expected: 'true' },
    ],
  },
  {
    id: 'lcs',
    title: 'Longest Common Subsequence',
    shows: '2D DP table, dependencies',
    problem: `Return the length of the longest sequence of characters that appears in both strings in the same order, not necessarily next to each other (0 if they share none).

Example: text1 = "abcde", text2 = "ace"  →  3`,
    java: `class Solution {
    public int longestCommonSubsequence(String text1, String text2) {
        int m = text1.length(), n = text2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (text1.charAt(i - 1) == text2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        return dp[m][n];
    }
}
`,
    javascript: `/**
 * @param {string} text1
 * @param {string} text2
 * @return {number}
 */
var longestCommonSubsequence = function(text1, text2) {
    const m = text1.length, n = text2.length;
    const dp = [];
    for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (text1[i - 1] === text2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
};
`,
    tests: [{ input: 'text1 = "abcde", text2 = "ace"', expected: '3' }, { input: 'text1 = "abc", text2 = "def"', expected: '0' }],
  },
  {
    id: 'min-cost-cut',
    title: 'Cutting a Stick at Minimum Cost',
    shows: 'memoized interval DP, big table, call tree',
    problem: `A stick of length n has to be cut at the given positions. Each cut costs the length of the piece it is made on, and you may make the cuts in any order. Return the lowest total cost.

Example: n = 7, cuts = [1,3,4,5]  →  16

The memo table is allocated for the worst case (102 × 102 here; 20 × 20 in the JavaScript and Python versions, so the setup stays short) but only a small triangle of it is ever used: the view crops to that part, shows which sub-problems each cell is built from, and the call tree marks calls that repeat an earlier one.`,
    java: `class Solution {
    int[][] dp = new int[102][102];

    int dfs(int[] cuts, int i, int j) {
        if (j - i <= 1)
            return 0;
        if (dp[i][j] == 0) {
            dp[i][j] = Integer.MAX_VALUE;
            for (int k = i + 1; k < j; ++k)
                dp[i][j] = Math.min(dp[i][j], cuts[j] - cuts[i] + dfs(cuts, i, k) + dfs(cuts, k, j));
        }
        return dp[i][j];
    }

    public int minCost(int n, int[] cuts) {
        int[] all = new int[cuts.length + 2];
        for (int i = 0; i < cuts.length; i++) all[i] = cuts[i];
        all[cuts.length] = 0;
        all[cuts.length + 1] = n;
        Arrays.sort(all);
        return dfs(all, 0, all.length - 1);
    }
}
`,
    javascript: `/**
 * @param {number} n
 * @param {number[]} cuts
 * @return {number}
 */
var minCost = function(n, cuts) {
    const dp = Array.from({ length: 20 }, () => new Array(20).fill(0));
    const dfs = (i, j) => {
        if (j - i <= 1) return 0;
        if (!dp[i][j]) {
            dp[i][j] = Infinity;
            for (let k = i + 1; k < j; k++) {
                dp[i][j] = Math.min(dp[i][j], cuts[j] - cuts[i] + dfs(i, k) + dfs(k, j));
            }
        }
        return dp[i][j];
    };
    cuts.push(0, n);
    cuts.sort((a, b) => a - b);
    return dfs(0, cuts.length - 1);
};
`,
    tests: [{ input: 'n = 7, cuts = [1,3,4,5]', expected: '16' }, { input: 'n = 9, cuts = [5,6,1,4,2]', expected: '22' }],
  },
  {
    id: 'valid-parentheses',
    title: 'Balanced Brackets',
    shows: 'stack push / pop',
    problem: `A string holds only the characters ( ) { } [ and ]. Decide whether the brackets are balanced: every opening bracket is closed by the matching closing bracket, in the right order.

Example: s = "([]{})"  →  true`,
    java: `class Solution {
    public boolean isValid(String s) {
        Stack<Character> stack = new Stack<>();
        for (char c : s.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                stack.push(c);
            } else {
                if (stack.isEmpty()) return false;
                char open = stack.pop();
                if ((c == ')' && open != '(') || (c == ']' && open != '[') || (c == '}' && open != '{')) {
                    return false;
                }
            }
        }
        return stack.isEmpty();
    }
}
`,
    javascript: `/**
 * @param {string} s
 * @return {boolean}
 */
var isValid = function(s) {
    const stack = [];
    const pairs = { ')': '(', ']': '[', '}': '{' };
    for (const c of s) {
        if (c === '(' || c === '[' || c === '{') {
            stack.push(c);
        } else {
            if (stack.length === 0 || stack.pop() !== pairs[c]) {
                return false;
            }
        }
    }
    return stack.length === 0;
};
`,
    tests: [{ input: 's = "([]{})"', expected: 'true' }, { input: 's = "([)]"', expected: 'false' }],
  },
  {
    id: 'kth-largest',
    title: 'Kth Largest Element',
    shows: 'priority queue (min-heap)',
    problem: `Return the k-th largest value in an unsorted array of integers (duplicates count separately).

Example: nums = [3,2,1,5,6,4], k = 2  →  5`,
    java: `class Solution {
    public int findKthLargest(int[] nums, int k) {
        PriorityQueue<Integer> heap = new PriorityQueue<>();
        for (int num : nums) {
            heap.offer(num);
            if (heap.size() > k) {
                heap.poll();
            }
        }
        return heap.peek();
    }
}
`,
    javascript: `/**
 * @param {number[]} nums
 * @param {number} k
 * @return {number}
 */
var findKthLargest = function(nums, k) {
    const sorted = [...nums].sort((a, b) => b - a);
    return sorted[k - 1];
};
`,
    tests: [{ input: 'nums = [3,2,1,5,6,4], k = 2', expected: '5' }],
  },
];

import { EXTRA, TREE_SAMPLES } from './samplesExtra.js';

// Java + JavaScript come from BASE; Python, C++ and C from samplesExtra.js
export const SAMPLES = [...BASE.map((s) => ({ ...s, ...(EXTRA[s.id] || {}) })), ...TREE_SAMPLES];
