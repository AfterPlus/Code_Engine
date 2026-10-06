// Deep-test corpus: LeetCode problems across data structures and algorithms, each in Java and JavaScript.
//
// Every entry is checked end to end by tests/deepTest.mjs (engines, trace invariants, state builder, structure
// detection) and by tests/render.html (every frame of every view actually rendered). Fields:
//   tests    [{ input, expected, unordered? }]  input: LeetCode text (parsed like the UI does) or an object
//   views    view kinds that must be detected in at least one frame, in every language (viewsBy: per language)
//   events   semantic events that must be derived at least once (eventsBy: per language)
//   status   expected status when the run is supposed to fail
//   stdout   expected printed text (per language)

import { SAMPLES } from '../js/samples.js';

const MIN_COST_CUT = SAMPLES.find((s) => s.id === 'min-cost-cut');

export const CORPUS = [
  // ============================================================================ arrays & hashing
  {
    id: 'move-zeroes', category: 'arrays', title: '283. Move Zeroes (in-place)',
    java: `class Solution {
    public void moveZeroes(int[] nums) {
        int insert = 0;
        for (int i = 0; i < nums.length; i++) {
            if (nums[i] != 0) {
                int tmp = nums[insert];
                nums[insert] = nums[i];
                nums[i] = tmp;
                insert++;
            }
        }
    }
}`,
    javascript: `/**
 * @param {number[]} nums
 * @return {void}
 */
var moveZeroes = function(nums) {
    let insert = 0;
    for (let i = 0; i < nums.length; i++) {
        if (nums[i] !== 0) {
            [nums[insert], nums[i]] = [nums[i], nums[insert]];
            insert++;
        }
    }
};`,
    tests: [{ input: 'nums = [0,1,0,3,12]', expected: [1, 3, 12, 0, 0] }, { input: 'nums = [0]', expected: [0] }],
    views: ['array'], events: ['ARRAY_READ'], eventsBy: { java: ['ARRAY_WRITE'], javascript: ['ARRAY_SWAP'] },
  },
  {
    id: 'sort-colors', category: 'arrays', title: '75. Sort Colors (Dutch flag, helper swap)',
    java: `class Solution {
    public void sortColors(int[] nums) {
        int lo = 0, mid = 0, hi = nums.length - 1;
        while (mid <= hi) {
            if (nums[mid] == 0) {
                swap(nums, lo++, mid++);
            } else if (nums[mid] == 1) {
                mid++;
            } else {
                swap(nums, mid, hi--);
            }
        }
    }

    private void swap(int[] a, int i, int j) {
        int t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
}`,
    javascript: `var sortColors = function(nums) {
    let lo = 0, mid = 0, hi = nums.length - 1;
    while (mid <= hi) {
        if (nums[mid] === 0) {
            [nums[lo], nums[mid]] = [nums[mid], nums[lo]];
            lo++;
            mid++;
        } else if (nums[mid] === 1) {
            mid++;
        } else {
            [nums[mid], nums[hi]] = [nums[hi], nums[mid]];
            hi--;
        }
    }
};`,
    tests: [{ input: 'nums = [2,0,2,1,1,0]', expected: [0, 0, 1, 1, 2, 2] }],
    views: ['array'], events: ['FUNCTION_ENTER', 'CONDITION_TRUE', 'CONDITION_FALSE'], eventsBy: { javascript: ['ARRAY_SWAP'] },
  },
  {
    id: 'container-water', category: 'two pointers', title: '11. Container With Most Water',
    java: `class Solution {
    public int maxArea(int[] height) {
        int left = 0, right = height.length - 1, best = 0;
        while (left < right) {
            int area = Math.min(height[left], height[right]) * (right - left);
            best = Math.max(best, area);
            if (height[left] < height[right]) left++;
            else right--;
        }
        return best;
    }
}`,
    javascript: `var maxArea = function(height) {
    let left = 0, right = height.length - 1, best = 0;
    while (left < right) {
        const area = Math.min(height[left], height[right]) * (right - left);
        best = Math.max(best, area);
        if (height[left] < height[right]) left++;
        else right--;
    }
    return best;
};`,
    tests: [{ input: 'height = [1,8,6,2,5,4,8,3,7]', expected: 49 }, { input: 'height = [1,1]', expected: 1 }],
    views: ['array'], events: ['ARRAY_READ', 'VARIABLE_UPDATE', 'LOOP_ITERATION'],
  },
  {
    id: 'product-except-self', category: 'prefix sums', title: '238. Product of Array Except Self (one-line loops)',
    java: `class Solution {
    public int[] productExceptSelf(int[] nums) {
        int n = nums.length;
        int[] answer = new int[n];
        answer[0] = 1;
        for (int i = 1; i < n; i++) answer[i] = answer[i - 1] * nums[i - 1];
        int suffix = 1;
        for (int i = n - 1; i >= 0; i--) {
            answer[i] *= suffix;
            suffix *= nums[i];
        }
        return answer;
    }
}`,
    javascript: `var productExceptSelf = function(nums) {
    const n = nums.length;
    const answer = new Array(n).fill(1);
    for (let i = 1; i < n; i++) answer[i] = answer[i - 1] * nums[i - 1];
    let suffix = 1;
    for (let i = n - 1; i >= 0; i--) {
        answer[i] *= suffix;
        suffix *= nums[i];
    }
    return answer;
};`,
    tests: [{ input: 'nums = [1,2,3,4]', expected: [24, 12, 8, 6] }, { input: 'nums = [-1,1,0,-3,3]', expected: [0, 0, 9, 0, 0] }],
    views: ['array'], events: ['ARRAY_WRITE', 'OBJECT_CREATE'],
  },
  {
    id: 'subarray-sum-k', category: 'hashing', title: '560. Subarray Sum Equals K',
    java: `class Solution {
    public int subarraySum(int[] nums, int k) {
        Map<Integer, Integer> count = new HashMap<>();
        count.put(0, 1);
        int sum = 0, result = 0;
        for (int num : nums) {
            sum += num;
            result += count.getOrDefault(sum - k, 0);
            count.put(sum, count.getOrDefault(sum, 0) + 1);
        }
        return result;
    }
}`,
    javascript: `var subarraySum = function(nums, k) {
    const count = new Map([[0, 1]]);
    let sum = 0, result = 0;
    for (const num of nums) {
        sum += num;
        result += count.get(sum - k) || 0;
        count.set(sum, (count.get(sum) || 0) + 1);
    }
    return result;
};`,
    tests: [{ input: 'nums = [1,1,1], k = 2', expected: 2 }, { input: 'nums = [1,2,3], k = 3', expected: 2 }],
    views: ['array', 'map'], events: ['MAP_PUT', 'MAP_GET'],
  },
  {
    id: 'group-anagrams', category: 'hashing', title: '49. Group Anagrams (lambdas, map of lists)',
    java: `class Solution {
    public List<List<String>> groupAnagrams(String[] strs) {
        Map<String, List<String>> groups = new HashMap<>();
        for (String s : strs) {
            char[] chars = s.toCharArray();
            Arrays.sort(chars);
            String key = new String(chars);
            groups.computeIfAbsent(key, k -> new ArrayList<>()).add(s);
        }
        return new ArrayList<>(groups.values());
    }
}`,
    javascript: `var groupAnagrams = function(strs) {
    const groups = new Map();
    for (const s of strs) {
        const key = s.split('').sort().join('');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(s);
    }
    return [...groups.values()];
};`,
    tests: [{ input: 'strs = ["eat","tea","tan","ate","nat","bat"]', expected: [['bat'], ['nat', 'tan'], ['ate', 'eat', 'tea']], unordered: true }],
    views: ['array', 'map'], events: ['MAP_PUT'], eventsBy: { java: ['FUNCTION_ENTER'] },
  },
  {
    id: 'longest-consecutive', category: 'hashing', title: '128. Longest Consecutive Sequence (set)',
    java: `class Solution {
    public int longestConsecutive(int[] nums) {
        Set<Integer> set = new HashSet<>();
        for (int n : nums) set.add(n);
        int best = 0;
        for (int n : set) {
            if (!set.contains(n - 1)) {
                int len = 1;
                while (set.contains(n + len)) len++;
                best = Math.max(best, len);
            }
        }
        return best;
    }
}`,
    javascript: `var longestConsecutive = function(nums) {
    const set = new Set(nums);
    let best = 0;
    for (const n of set) {
        if (!set.has(n - 1)) {
            let len = 1;
            while (set.has(n + len)) len++;
            best = Math.max(best, len);
        }
    }
    return best;
};`,
    tests: [{ input: 'nums = [100,4,200,1,3,2]', expected: 4 }, { input: 'nums = []', expected: 0 }],
    views: ['set'], events: ['MAP_GET'], eventsBy: { java: ['SET_ADD'] },
  },

  // ============================================================================ strings & sliding window
  {
    id: 'longest-substring', category: 'sliding window', title: '3. Longest Substring Without Repeating Characters',
    java: `class Solution {
    public int lengthOfLongestSubstring(String s) {
        Map<Character, Integer> last = new HashMap<>();
        int left = 0, best = 0;
        for (int right = 0; right < s.length(); right++) {
            char c = s.charAt(right);
            if (last.containsKey(c) && last.get(c) >= left) {
                left = last.get(c) + 1;
            }
            last.put(c, right);
            best = Math.max(best, right - left + 1);
        }
        return best;
    }
}`,
    javascript: `var lengthOfLongestSubstring = function(s) {
    const last = new Map();
    let left = 0, best = 0;
    for (let right = 0; right < s.length; right++) {
        const c = s[right];
        if (last.has(c) && last.get(c) >= left) {
            left = last.get(c) + 1;
        }
        last.set(c, right);
        best = Math.max(best, right - left + 1);
    }
    return best;
};`,
    tests: [{ input: 's = "abcabcbb"', expected: 3 }, { input: 's = "bbbbb"', expected: 1 }, { input: 's = ""', expected: 0 }],
    views: ['map'], events: ['MAP_PUT', 'MAP_GET'],
  },
  {
    id: 'valid-anagram', category: 'strings', title: '242. Valid Anagram (counting array)',
    java: `class Solution {
    public boolean isAnagram(String s, String t) {
        if (s.length() != t.length()) return false;
        int[] count = new int[26];
        for (int i = 0; i < s.length(); i++) {
            count[s.charAt(i) - 'a']++;
            count[t.charAt(i) - 'a']--;
        }
        for (int c : count) {
            if (c != 0) return false;
        }
        return true;
    }
}`,
    javascript: `var isAnagram = function(s, t) {
    if (s.length !== t.length) return false;
    const count = new Array(26).fill(0);
    for (let i = 0; i < s.length; i++) {
        count[s.charCodeAt(i) - 97]++;
        count[t.charCodeAt(i) - 97]--;
    }
    return count.every((c) => c === 0);
};`,
    tests: [{ input: 's = "anagram", t = "nagaram"', expected: true }, { input: 's = "rat", t = "car"', expected: false }],
    views: ['array'], events: ['ARRAY_WRITE'],
  },
  {
    id: 'longest-palindrome', category: 'strings', title: '5. Longest Palindromic Substring (expand around center)',
    java: `class Solution {
    public String longestPalindrome(String s) {
        int start = 0, end = 0;
        for (int i = 0; i < s.length(); i++) {
            int len = Math.max(expand(s, i, i), expand(s, i, i + 1));
            if (len > end - start) {
                start = i - (len - 1) / 2;
                end = i + len / 2;
            }
        }
        return s.substring(start, end + 1);
    }

    private int expand(String s, int l, int r) {
        while (l >= 0 && r < s.length() && s.charAt(l) == s.charAt(r)) {
            l--;
            r++;
        }
        return r - l - 1;
    }
}`,
    javascript: `var longestPalindrome = function(s) {
    let start = 0, end = 0;
    const expand = (l, r) => {
        while (l >= 0 && r < s.length && s[l] === s[r]) {
            l--;
            r++;
        }
        return r - l - 1;
    };
    for (let i = 0; i < s.length; i++) {
        const len = Math.max(expand(i, i), expand(i, i + 1));
        if (len > end - start) {
            start = i - Math.floor((len - 1) / 2);
            end = i + Math.floor(len / 2);
        }
    }
    return s.substring(start, end + 1);
};`,
    // "bab" is equally valid on LeetCode; this algorithm keeps the later of equal-length palindromes
    tests: [{ input: 's = "babad"', expected: 'aba' }, { input: 's = "cbbd"', expected: 'bb' }],
    events: ['FUNCTION_ENTER', 'RETURN', 'VARIABLE_UPDATE'],
  },
  {
    id: 'reverse-string', category: 'strings', title: '344. Reverse String (char[] in-place)',
    java: `class Solution {
    public void reverseString(char[] s) {
        int i = 0, j = s.length - 1;
        while (i < j) {
            char tmp = s[i];
            s[i++] = s[j];
            s[j--] = tmp;
        }
    }
}`,
    javascript: `var reverseString = function(s) {
    let i = 0, j = s.length - 1;
    while (i < j) {
        [s[i], s[j]] = [s[j], s[i]];
        i++;
        j--;
    }
};`,
    tests: [{ input: 's = ["h","e","l","l","o"]', expected: ['o', 'l', 'l', 'e', 'h'] }],
    views: ['array'], eventsBy: { java: ['ARRAY_WRITE'], javascript: ['ARRAY_SWAP'] },
  },

  // ============================================================================ stacks & queues
  {
    id: 'daily-temperatures', category: 'monotonic stack', title: '739. Daily Temperatures (deque as stack)',
    java: `class Solution {
    public int[] dailyTemperatures(int[] temperatures) {
        int n = temperatures.length;
        int[] answer = new int[n];
        Deque<Integer> stack = new ArrayDeque<>();
        for (int i = 0; i < n; i++) {
            while (!stack.isEmpty() && temperatures[i] > temperatures[stack.peek()]) {
                int j = stack.pop();
                answer[j] = i - j;
            }
            stack.push(i);
        }
        return answer;
    }
}`,
    javascript: `var dailyTemperatures = function(temperatures) {
    const answer = new Array(temperatures.length).fill(0);
    const stack = [];
    for (let i = 0; i < temperatures.length; i++) {
        while (stack.length && temperatures[i] > temperatures[stack[stack.length - 1]]) {
            const j = stack.pop();
            answer[j] = i - j;
        }
        stack.push(i);
    }
    return answer;
};`,
    tests: [{ input: 'temperatures = [73,74,75,71,69,72,76,73]', expected: [1, 1, 4, 2, 1, 1, 0, 0] }],
    views: ['array'], viewsBy: { java: ['stack'] }, eventsBy: { java: ['STACK_PUSH', 'STACK_POP', 'MAP_GET'] },
  },
  {
    id: 'eval-rpn', category: 'stack', title: '150. Evaluate Reverse Polish Notation (switch on strings)',
    java: `class Solution {
    public int evalRPN(String[] tokens) {
        Stack<Integer> stack = new Stack<>();
        for (String token : tokens) {
            switch (token) {
                case "+" -> stack.push(stack.pop() + stack.pop());
                case "-" -> {
                    int b = stack.pop(), a = stack.pop();
                    stack.push(a - b);
                }
                case "*" -> stack.push(stack.pop() * stack.pop());
                case "/" -> {
                    int b = stack.pop(), a = stack.pop();
                    stack.push(a / b);
                }
                default -> stack.push(Integer.parseInt(token));
            }
        }
        return stack.pop();
    }
}`,
    javascript: `var evalRPN = function(tokens) {
    const stack = [];
    for (const token of tokens) {
        switch (token) {
            case '+': stack.push(stack.pop() + stack.pop()); break;
            case '-': { const b = stack.pop(), a = stack.pop(); stack.push(a - b); break; }
            case '*': stack.push(stack.pop() * stack.pop()); break;
            case '/': { const b = stack.pop(), a = stack.pop(); stack.push(Math.trunc(a / b)); break; }
            default: stack.push(Number(token));
        }
    }
    return stack.pop();
};`,
    tests: [{ input: 'tokens = ["2","1","+","3","*"]', expected: 9 }, { input: 'tokens = ["4","13","5","/","+"]', expected: 6 }],
    viewsBy: { java: ['stack', 'array'], javascript: ['array'] }, eventsBy: { java: ['STACK_PUSH', 'STACK_POP'] },
  },
  {
    id: 'min-stack', category: 'design', title: '155. Min Stack (class design, raw LeetCode input)',
    java: `class MinStack {
    private final Deque<int[]> stack = new ArrayDeque<>();

    public MinStack() {
    }

    public void push(int val) {
        int min = stack.isEmpty() ? val : Math.min(val, stack.peek()[1]);
        stack.push(new int[]{val, min});
    }

    public void pop() {
        stack.pop();
    }

    public int top() {
        return stack.peek()[0];
    }

    public int getMin() {
        return stack.peek()[1];
    }
}`,
    javascript: `var MinStack = function() {
    this.stack = [];
};

MinStack.prototype.push = function(val) {
    const min = this.stack.length === 0 ? val : Math.min(val, this.stack[this.stack.length - 1][1]);
    this.stack.push([val, min]);
};

MinStack.prototype.pop = function() {
    this.stack.pop();
};

MinStack.prototype.top = function() {
    return this.stack[this.stack.length - 1][0];
};

MinStack.prototype.getMin = function() {
    return this.stack[this.stack.length - 1][1];
};`,
    tests: [{
      input: '["MinStack","push","push","push","getMin","pop","top","getMin"]\n[[],[-2],[0],[-3],[],[],[],[]]',
      expected: [null, null, null, null, -3, null, 0, -2],
    }],
    viewsBy: { java: ['stack'], javascript: ['array'] }, events: ['FUNCTION_ENTER', 'RETURN'], eventsBy: { java: ['STACK_PUSH', 'STACK_POP'] },
  },
  {
    id: 'lru-cache', category: 'design', title: '146. LRU Cache (hash map + doubly linked list)',
    java: `class LRUCache {
    private static class Node {
        int key, val;
        Node prev, next;

        Node(int key, int val) {
            this.key = key;
            this.val = val;
        }
    }

    private final int capacity;
    private final Map<Integer, Node> map = new HashMap<>();
    private final Node head = new Node(0, 0), tail = new Node(0, 0);

    public LRUCache(int capacity) {
        this.capacity = capacity;
        head.next = tail;
        tail.prev = head;
    }

    public int get(int key) {
        Node node = map.get(key);
        if (node == null) return -1;
        remove(node);
        addFirst(node);
        return node.val;
    }

    public void put(int key, int value) {
        Node node = map.get(key);
        if (node != null) {
            node.val = value;
            remove(node);
            addFirst(node);
            return;
        }
        if (map.size() == capacity) {
            Node lru = tail.prev;
            remove(lru);
            map.remove(lru.key);
        }
        node = new Node(key, value);
        map.put(key, node);
        addFirst(node);
    }

    private void remove(Node node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }

    private void addFirst(Node node) {
        node.next = head.next;
        node.prev = head;
        head.next.prev = node;
        head.next = node;
    }
}`,
    javascript: `class Node {
    constructor(key, val) {
        this.key = key;
        this.val = val;
        this.prev = null;
        this.next = null;
    }
}

class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.map = new Map();
        this.head = new Node(0, 0);
        this.tail = new Node(0, 0);
        this.head.next = this.tail;
        this.tail.prev = this.head;
    }

    get(key) {
        if (!this.map.has(key)) return -1;
        const node = this.map.get(key);
        this.remove(node);
        this.addFirst(node);
        return node.val;
    }

    put(key, value) {
        if (this.map.has(key)) {
            const node = this.map.get(key);
            node.val = value;
            this.remove(node);
            this.addFirst(node);
            return;
        }
        if (this.map.size === this.capacity) {
            const lru = this.tail.prev;
            this.remove(lru);
            this.map.delete(lru.key);
        }
        const node = new Node(key, value);
        this.map.set(key, node);
        this.addFirst(node);
    }

    remove(node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }

    addFirst(node) {
        node.next = this.head.next;
        node.prev = this.head;
        this.head.next.prev = node;
        this.head.next = node;
    }
}`,
    tests: [{
      input: '["LRUCache","put","put","get","put","get","put","get","get","get"]\n[[2],[1,1],[2,2],[1],[3,3],[2],[4,4],[1],[3],[4]]',
      expected: [null, null, null, 1, null, -1, null, -1, 3, 4],
    }],
    views: ['linkedlist', 'map'], events: ['MAP_PUT', 'MAP_REMOVE', 'POINTER_UPDATE'],
  },
  {
    id: 'rotting-oranges', category: 'BFS', title: '994. Rotting Oranges (grid BFS, queue of cells)',
    java: `class Solution {
    public int orangesRotting(int[][] grid) {
        int rows = grid.length, cols = grid[0].length, fresh = 0;
        Queue<int[]> queue = new LinkedList<>();
        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (grid[r][c] == 2) queue.offer(new int[]{r, c});
                else if (grid[r][c] == 1) fresh++;
            }
        }
        int[][] dirs = {{1, 0}, {-1, 0}, {0, 1}, {0, -1}};
        int minutes = 0;
        while (!queue.isEmpty() && fresh > 0) {
            int size = queue.size();
            for (int i = 0; i < size; i++) {
                int[] cell = queue.poll();
                for (int[] d : dirs) {
                    int nr = cell[0] + d[0], nc = cell[1] + d[1];
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] == 1) {
                        grid[nr][nc] = 2;
                        fresh--;
                        queue.offer(new int[]{nr, nc});
                    }
                }
            }
            minutes++;
        }
        return fresh == 0 ? minutes : -1;
    }
}`,
    javascript: `var orangesRotting = function(grid) {
    const rows = grid.length, cols = grid[0].length;
    let fresh = 0;
    let queue = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r][c] === 2) queue.push([r, c]);
            else if (grid[r][c] === 1) fresh++;
        }
    }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let minutes = 0;
    while (queue.length && fresh > 0) {
        const next = [];
        for (const [r, c] of queue) {
            for (const [dr, dc] of dirs) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 1) {
                    grid[nr][nc] = 2;
                    fresh--;
                    next.push([nr, nc]);
                }
            }
        }
        queue = next;
        minutes++;
    }
    return fresh === 0 ? minutes : -1;
};`,
    tests: [{ input: 'grid = [[2,1,1],[1,1,0],[0,1,1]]', expected: 4 }, { input: 'grid = [[2,1,1],[0,1,1],[1,0,1]]', expected: -1 }],
    views: ['matrix'], viewsBy: { java: ['queue'] }, events: ['ARRAY_WRITE'], eventsBy: { java: ['QUEUE_PUSH', 'QUEUE_POP'] },
  },

  // ============================================================================ heaps
  {
    id: 'top-k-frequent', category: 'heap', title: '347. Top K Frequent Elements (PQ with comparator / buckets)',
    java: `class Solution {
    public int[] topKFrequent(int[] nums, int k) {
        Map<Integer, Integer> freq = new HashMap<>();
        for (int n : nums) freq.merge(n, 1, Integer::sum);
        PriorityQueue<Integer> heap = new PriorityQueue<>((a, b) -> freq.get(a) - freq.get(b));
        for (int key : freq.keySet()) {
            heap.offer(key);
            if (heap.size() > k) heap.poll();
        }
        int[] result = new int[k];
        for (int i = k - 1; i >= 0; i--) result[i] = heap.poll();
        return result;
    }
}`,
    javascript: `var topKFrequent = function(nums, k) {
    const freq = new Map();
    for (const n of nums) freq.set(n, (freq.get(n) || 0) + 1);
    const buckets = [];
    for (let i = 0; i <= nums.length; i++) buckets.push([]);
    for (const [num, count] of freq) buckets[count].push(num);
    const result = [];
    for (let i = buckets.length - 1; i >= 0 && result.length < k; i--) {
        for (const num of buckets[i]) {
            if (result.length < k) result.push(num);
        }
    }
    return result;
};`,
    tests: [{ input: 'nums = [1,1,1,2,2,3], k = 2', expected: [1, 2], unordered: true }],
    views: ['map'], viewsBy: { java: ['pq'], javascript: ['matrix'] }, eventsBy: { java: ['QUEUE_PUSH', 'QUEUE_POP'] },
    absentViewsBy: { javascript: ['graph'] },
  },
  {
    id: 'merge-k-lists', category: 'heap', title: '23. Merge k Sorted Lists (ListNode[] input)',
    java: `class Solution {
    public ListNode mergeKLists(ListNode[] lists) {
        PriorityQueue<ListNode> heap = new PriorityQueue<>((a, b) -> a.val - b.val);
        for (ListNode node : lists) {
            if (node != null) heap.offer(node);
        }
        ListNode dummy = new ListNode(0), tail = dummy;
        while (!heap.isEmpty()) {
            ListNode node = heap.poll();
            tail.next = node;
            tail = node;
            if (node.next != null) heap.offer(node.next);
        }
        return dummy.next;
    }
}`,
    javascript: `/**
 * @param {ListNode[]} lists
 * @return {ListNode}
 */
var mergeKLists = function(lists) {
    if (lists.length === 0) return null;
    const mergeTwo = (a, b) => {
        const dummy = new ListNode(0);
        let tail = dummy;
        while (a && b) {
            if (a.val <= b.val) { tail.next = a; a = a.next; }
            else { tail.next = b; b = b.next; }
            tail = tail.next;
        }
        tail.next = a || b;
        return dummy.next;
    };
    while (lists.length > 1) {
        const merged = [];
        for (let i = 0; i < lists.length; i += 2) {
            merged.push(i + 1 < lists.length ? mergeTwo(lists[i], lists[i + 1]) : lists[i]);
        }
        lists = merged;
    }
    return lists[0];
};`,
    tests: [{ input: 'lists = [[1,4,5],[1,3,4],[2,6]]', expected: [1, 1, 2, 3, 4, 4, 5, 6] }, { input: 'lists = []', expected: [] }],
    views: ['linkedlist'], viewsBy: { java: ['pq'] }, events: ['POINTER_UPDATE'],
  },
  {
    id: 'kth-largest-quickselect', category: 'sorting', title: '215. Kth Largest (quickselect, recursion + swaps)',
    java: `class Solution {
    public int findKthLargest(int[] nums, int k) {
        return select(nums, 0, nums.length - 1, nums.length - k);
    }

    private int select(int[] a, int lo, int hi, int target) {
        int pivot = a[hi], p = lo;
        for (int i = lo; i < hi; i++) {
            if (a[i] < pivot) {
                int t = a[i]; a[i] = a[p]; a[p] = t;
                p++;
            }
        }
        int t = a[p]; a[p] = a[hi]; a[hi] = t;
        if (p == target) return a[p];
        return p < target ? select(a, p + 1, hi, target) : select(a, lo, p - 1, target);
    }
}`,
    javascript: `var findKthLargest = function(nums, k) {
    const select = (lo, hi, target) => {
        const pivot = nums[hi];
        let p = lo;
        for (let i = lo; i < hi; i++) {
            if (nums[i] < pivot) {
                [nums[i], nums[p]] = [nums[p], nums[i]];
                p++;
            }
        }
        [nums[p], nums[hi]] = [nums[hi], nums[p]];
        if (p === target) return nums[p];
        return p < target ? select(p + 1, hi, target) : select(lo, p - 1, target);
    };
    return select(0, nums.length - 1, nums.length - k);
};`,
    tests: [{ input: 'nums = [3,2,1,5,6,4], k = 2', expected: 5 }, { input: 'nums = [3,2,3,1,2,4,5,5,6], k = 4', expected: 4 }],
    views: ['array'], events: ['ARRAY_SWAP', 'FUNCTION_ENTER'],
  },

  // ============================================================================ linked lists
  {
    id: 'merge-two-lists', category: 'linked list', title: '21. Merge Two Sorted Lists (dummy node, empty lists)',
    java: `class Solution {
    public ListNode mergeTwoLists(ListNode list1, ListNode list2) {
        ListNode dummy = new ListNode(0);
        ListNode tail = dummy;
        while (list1 != null && list2 != null) {
            if (list1.val <= list2.val) {
                tail.next = list1;
                list1 = list1.next;
            } else {
                tail.next = list2;
                list2 = list2.next;
            }
            tail = tail.next;
        }
        tail.next = list1 != null ? list1 : list2;
        return dummy.next;
    }
}`,
    javascript: `/**
 * @param {ListNode} list1
 * @param {ListNode} list2
 * @return {ListNode}
 */
var mergeTwoLists = function(list1, list2) {
    const dummy = new ListNode(0);
    let tail = dummy;
    while (list1 && list2) {
        if (list1.val <= list2.val) {
            tail.next = list1;
            list1 = list1.next;
        } else {
            tail.next = list2;
            list2 = list2.next;
        }
        tail = tail.next;
    }
    tail.next = list1 || list2;
    return dummy.next;
};`,
    tests: [{ input: 'list1 = [1,2,4], list2 = [1,3,4]', expected: [1, 1, 2, 3, 4, 4] }, { input: 'list1 = [], list2 = []', expected: [] }],
    views: ['linkedlist'], events: ['POINTER_UPDATE'],
  },
  {
    id: 'remove-nth', category: 'linked list', title: '19. Remove Nth Node From End (fast/slow)',
    java: `class Solution {
    public ListNode removeNthFromEnd(ListNode head, int n) {
        ListNode dummy = new ListNode(0, head);
        ListNode fast = dummy, slow = dummy;
        for (int i = 0; i <= n; i++) fast = fast.next;
        while (fast != null) {
            fast = fast.next;
            slow = slow.next;
        }
        slow.next = slow.next.next;
        return dummy.next;
    }
}`,
    javascript: `/**
 * @param {ListNode} head
 * @param {number} n
 * @return {ListNode}
 */
var removeNthFromEnd = function(head, n) {
    const dummy = new ListNode(0, head);
    let fast = dummy, slow = dummy;
    for (let i = 0; i <= n; i++) fast = fast.next;
    while (fast) {
        fast = fast.next;
        slow = slow.next;
    }
    slow.next = slow.next.next;
    return dummy.next;
};`,
    tests: [{ input: 'head = [1,2,3,4,5], n = 2', expected: [1, 2, 3, 5] }, { input: 'head = [1], n = 1', expected: [] }],
    views: ['linkedlist'], events: ['POINTER_UPDATE'],
  },
  {
    id: 'linked-list-cycle', category: 'linked list', title: '141. Linked List Cycle (pos input, cyclic heap)',
    java: `class Solution {
    public boolean hasCycle(ListNode head) {
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
            if (slow == fast) return true;
        }
        return false;
    }
}`,
    javascript: `/**
 * @param {ListNode} head
 * @return {boolean}
 */
var hasCycle = function(head) {
    let slow = head, fast = head;
    while (fast && fast.next) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow === fast) return true;
    }
    return false;
};`,
    tests: [{ input: 'head = [3,2,0,-4], pos = 1', expected: true }, { input: 'head = [1,2], pos = -1', expected: false }],
    views: ['linkedlist'], events: ['POINTER_UPDATE'],
  },
  {
    id: 'add-two-numbers', category: 'linked list', title: '2. Add Two Numbers',
    java: `class Solution {
    public ListNode addTwoNumbers(ListNode l1, ListNode l2) {
        ListNode dummy = new ListNode(0), tail = dummy;
        int carry = 0;
        while (l1 != null || l2 != null || carry != 0) {
            int sum = carry;
            if (l1 != null) { sum += l1.val; l1 = l1.next; }
            if (l2 != null) { sum += l2.val; l2 = l2.next; }
            carry = sum / 10;
            tail.next = new ListNode(sum % 10);
            tail = tail.next;
        }
        return dummy.next;
    }
}`,
    javascript: `/**
 * @param {ListNode} l1
 * @param {ListNode} l2
 * @return {ListNode}
 */
var addTwoNumbers = function(l1, l2) {
    const dummy = new ListNode(0);
    let tail = dummy, carry = 0;
    while (l1 || l2 || carry) {
        let sum = carry;
        if (l1) { sum += l1.val; l1 = l1.next; }
        if (l2) { sum += l2.val; l2 = l2.next; }
        carry = Math.floor(sum / 10);
        tail.next = new ListNode(sum % 10);
        tail = tail.next;
    }
    return dummy.next;
};`,
    tests: [{ input: 'l1 = [2,4,3], l2 = [5,6,4]', expected: [7, 0, 8] }, { input: 'l1 = [9,9], l2 = [1]', expected: [0, 0, 1] }],
    views: ['linkedlist'], events: ['OBJECT_CREATE', 'POINTER_UPDATE'],
  },
  {
    id: 'palindrome-list', category: 'linked list', title: '234. Palindrome Linked List (reverse half)',
    java: `class Solution {
    public boolean isPalindrome(ListNode head) {
        ListNode slow = head, fast = head;
        while (fast != null && fast.next != null) {
            slow = slow.next;
            fast = fast.next.next;
        }
        ListNode prev = null;
        while (slow != null) {
            ListNode next = slow.next;
            slow.next = prev;
            prev = slow;
            slow = next;
        }
        while (prev != null) {
            if (prev.val != head.val) return false;
            prev = prev.next;
            head = head.next;
        }
        return true;
    }
}`,
    javascript: `/**
 * @param {ListNode} head
 * @return {boolean}
 */
var isPalindrome = function(head) {
    let slow = head, fast = head;
    while (fast && fast.next) {
        slow = slow.next;
        fast = fast.next.next;
    }
    let prev = null;
    while (slow) {
        const next = slow.next;
        slow.next = prev;
        prev = slow;
        slow = next;
    }
    while (prev) {
        if (prev.val !== head.val) return false;
        prev = prev.next;
        head = head.next;
    }
    return true;
};`,
    tests: [{ input: 'head = [1,2,2,1]', expected: true }, { input: 'head = [1,2]', expected: false }],
    views: ['linkedlist'], events: ['POINTER_UPDATE'],
  },

  // ============================================================================ trees
  {
    id: 'max-depth', category: 'tree DFS', title: '104. Maximum Depth of Binary Tree (recursion)',
    java: `class Solution {
    public int maxDepth(TreeNode root) {
        if (root == null) return 0;
        int left = maxDepth(root.left);
        int right = maxDepth(root.right);
        return 1 + Math.max(left, right);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number}
 */
var maxDepth = function(root) {
    if (!root) return 0;
    const left = maxDepth(root.left);
    const right = maxDepth(root.right);
    return 1 + Math.max(left, right);
};`,
    tests: [{ input: 'root = [3,9,20,null,null,15,7]', expected: 3 }, { input: 'root = []', expected: 0 }],
    views: ['tree'], events: ['FUNCTION_ENTER', 'RETURN'], recursive: true,
  },
  {
    id: 'invert-tree', category: 'tree DFS', title: '226. Invert Binary Tree (returns a tree)',
    java: `class Solution {
    public TreeNode invertTree(TreeNode root) {
        if (root == null) return null;
        TreeNode tmp = root.left;
        root.left = invertTree(root.right);
        root.right = invertTree(tmp);
        return root;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {TreeNode}
 */
var invertTree = function(root) {
    if (!root) return null;
    [root.left, root.right] = [invertTree(root.right), invertTree(root.left)];
    return root;
};`,
    tests: [{ input: 'root = [4,2,7,1,3,6,9]', expected: [4, 7, 2, 9, 6, 3, 1] }, { input: 'root = []', expected: [] }],
    views: ['tree'], events: ['POINTER_UPDATE'], recursive: true,
  },
  {
    id: 'validate-bst', category: 'tree DFS', title: '98. Validate BST (long / Infinity bounds)',
    java: `class Solution {
    public boolean isValidBST(TreeNode root) {
        return valid(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }

    private boolean valid(TreeNode node, long lo, long hi) {
        if (node == null) return true;
        if (node.val <= lo || node.val >= hi) return false;
        return valid(node.left, lo, node.val) && valid(node.right, node.val, hi);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {boolean}
 */
var isValidBST = function(root) {
    const valid = (node, lo, hi) => {
        if (!node) return true;
        if (node.val <= lo || node.val >= hi) return false;
        return valid(node.left, lo, node.val) && valid(node.right, node.val, hi);
    };
    return valid(root, -Infinity, Infinity);
};`,
    tests: [{ input: 'root = [2,1,3]', expected: true }, { input: 'root = [5,1,4,null,null,3,6]', expected: false }],
    views: ['tree'], events: ['FUNCTION_ENTER'], recursive: true,
  },
  {
    id: 'lca', category: 'tree DFS', title: '236. Lowest Common Ancestor (node parameters by value)',
    java: `class Solution {
    public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        if (root == null || root == p || root == q) return root;
        TreeNode left = lowestCommonAncestor(root.left, p, q);
        TreeNode right = lowestCommonAncestor(root.right, p, q);
        if (left != null && right != null) return root;
        return left != null ? left : right;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {TreeNode} p
 * @param {TreeNode} q
 * @return {TreeNode}
 */
var lowestCommonAncestor = function(root, p, q) {
    if (!root || root === p || root === q) return root;
    const left = lowestCommonAncestor(root.left, p, q);
    const right = lowestCommonAncestor(root.right, p, q);
    if (left && right) return root;
    return left || right;
};`,
    tests: [
      { input: 'root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 4', expected: [5, 6, 2, null, null, 7, 4] },
      { input: 'root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 1', expected: [3, 5, 1, 6, 2, 0, 8, null, null, 7, 4] },
    ],
    views: ['tree'], recursive: true,
  },
  {
    id: 'kth-smallest-bst', category: 'tree iterative', title: '230. Kth Smallest in BST (iterative inorder, stack of nodes)',
    java: `class Solution {
    public int kthSmallest(TreeNode root, int k) {
        Deque<TreeNode> stack = new ArrayDeque<>();
        TreeNode cur = root;
        while (cur != null || !stack.isEmpty()) {
            while (cur != null) {
                stack.push(cur);
                cur = cur.left;
            }
            cur = stack.pop();
            if (--k == 0) return cur.val;
            cur = cur.right;
        }
        return -1;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {number} k
 * @return {number}
 */
var kthSmallest = function(root, k) {
    const stack = [];
    let cur = root;
    while (cur || stack.length) {
        while (cur) {
            stack.push(cur);
            cur = cur.left;
        }
        cur = stack.pop();
        if (--k === 0) return cur.val;
        cur = cur.right;
    }
    return -1;
};`,
    tests: [{ input: 'root = [3,1,4,null,2], k = 1', expected: 1 }, { input: 'root = [5,3,6,2,4,null,null,1], k = 3', expected: 3 }],
    views: ['tree'], viewsBy: { java: ['stack'] }, eventsBy: { java: ['STACK_PUSH', 'STACK_POP'] },
  },
  {
    id: 'diameter', category: 'tree DFS', title: '543. Diameter of Binary Tree (instance field state)',
    java: `class Solution {
    private int best = 0;

    public int diameterOfBinaryTree(TreeNode root) {
        depth(root);
        return best;
    }

    private int depth(TreeNode node) {
        if (node == null) return 0;
        int l = depth(node.left), r = depth(node.right);
        best = Math.max(best, l + r);
        return 1 + Math.max(l, r);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number}
 */
var diameterOfBinaryTree = function(root) {
    let best = 0;
    const depth = (node) => {
        if (!node) return 0;
        const l = depth(node.left), r = depth(node.right);
        best = Math.max(best, l + r);
        return 1 + Math.max(l, r);
    };
    depth(root);
    return best;
};`,
    tests: [{ input: 'root = [1,2,3,4,5]', expected: 3 }],
    views: ['tree'], recursive: true,
  },
  {
    id: 'path-sum-ii', category: 'backtracking', title: '113. Path Sum II (backtracking path list)',
    java: `class Solution {
    public List<List<Integer>> pathSum(TreeNode root, int targetSum) {
        List<List<Integer>> result = new ArrayList<>();
        walk(root, targetSum, new ArrayList<>(), result);
        return result;
    }

    private void walk(TreeNode node, int remaining, List<Integer> path, List<List<Integer>> result) {
        if (node == null) return;
        path.add(node.val);
        if (node.left == null && node.right == null && remaining == node.val) {
            result.add(new ArrayList<>(path));
        } else {
            walk(node.left, remaining - node.val, path, result);
            walk(node.right, remaining - node.val, path, result);
        }
        path.remove(path.size() - 1);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {number} targetSum
 * @return {number[][]}
 */
var pathSum = function(root, targetSum) {
    const result = [];
    const path = [];
    const walk = (node, remaining) => {
        if (!node) return;
        path.push(node.val);
        if (!node.left && !node.right && remaining === node.val) {
            result.push([...path]);
        } else {
            walk(node.left, remaining - node.val);
            walk(node.right, remaining - node.val);
        }
        path.pop();
    };
    walk(root, targetSum);
    return result;
};`,
    tests: [{ input: 'root = [5,4,8,11,null,13,4,7,2,null,null,5,1], targetSum = 22', expected: [[5, 4, 11, 2], [5, 8, 4, 5]] }],
    views: ['tree', 'array'], events: ['ARRAY_WRITE'], recursive: true,
  },
  {
    id: 'bst-insert', category: 'tree', title: '701. Insert into a BST',
    java: `class Solution {
    public TreeNode insertIntoBST(TreeNode root, int val) {
        if (root == null) return new TreeNode(val);
        TreeNode cur = root;
        while (true) {
            if (val < cur.val) {
                if (cur.left == null) { cur.left = new TreeNode(val); break; }
                cur = cur.left;
            } else {
                if (cur.right == null) { cur.right = new TreeNode(val); break; }
                cur = cur.right;
            }
        }
        return root;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {number} val
 * @return {TreeNode}
 */
var insertIntoBST = function(root, val) {
    if (!root) return new TreeNode(val);
    let cur = root;
    while (true) {
        if (val < cur.val) {
            if (!cur.left) { cur.left = new TreeNode(val); break; }
            cur = cur.left;
        } else {
            if (!cur.right) { cur.right = new TreeNode(val); break; }
            cur = cur.right;
        }
    }
    return root;
};`,
    tests: [{ input: 'root = [4,2,7,1,3], val = 5', expected: [4, 2, 7, 1, 3, 5] }],
    views: ['tree'], events: ['POINTER_UPDATE', 'OBJECT_CREATE'],
  },
  {
    id: 'right-side-view', category: 'tree BFS', title: '199. Binary Tree Right Side View',
    java: `class Solution {
    public List<Integer> rightSideView(TreeNode root) {
        List<Integer> result = new ArrayList<>();
        if (root == null) return result;
        Queue<TreeNode> queue = new ArrayDeque<>();
        queue.offer(root);
        while (!queue.isEmpty()) {
            int size = queue.size();
            for (int i = 0; i < size; i++) {
                TreeNode node = queue.poll();
                if (i == size - 1) result.add(node.val);
                if (node.left != null) queue.offer(node.left);
                if (node.right != null) queue.offer(node.right);
            }
        }
        return result;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number[]}
 */
var rightSideView = function(root) {
    const result = [];
    if (!root) return result;
    let level = [root];
    while (level.length) {
        result.push(level[level.length - 1].val);
        const next = [];
        for (const node of level) {
            if (node.left) next.push(node.left);
            if (node.right) next.push(node.right);
        }
        level = next;
    }
    return result;
};`,
    tests: [{ input: 'root = [1,2,3,null,5,null,4]', expected: [1, 3, 4] }],
    views: ['tree'], viewsBy: { java: ['queue'] }, eventsBy: { java: ['QUEUE_PUSH', 'QUEUE_POP'] },
  },

  // ============================================================================ graphs
  {
    id: 'course-schedule', category: 'graph', title: "207. Course Schedule (Kahn's topological sort)",
    java: `class Solution {
    public boolean canFinish(int numCourses, int[][] prerequisites) {
        List<List<Integer>> graph = new ArrayList<>();
        for (int i = 0; i < numCourses; i++) graph.add(new ArrayList<>());
        int[] indegree = new int[numCourses];
        for (int[] p : prerequisites) {
            graph.get(p[1]).add(p[0]);
            indegree[p[0]]++;
        }
        Queue<Integer> queue = new ArrayDeque<>();
        for (int i = 0; i < numCourses; i++) {
            if (indegree[i] == 0) queue.offer(i);
        }
        int taken = 0;
        while (!queue.isEmpty()) {
            int course = queue.poll();
            taken++;
            for (int next : graph.get(course)) {
                if (--indegree[next] == 0) queue.offer(next);
            }
        }
        return taken == numCourses;
    }
}`,
    javascript: `var canFinish = function(numCourses, prerequisites) {
    const graph = [];
    for (let i = 0; i < numCourses; i++) graph.push([]);
    const indegree = new Array(numCourses).fill(0);
    for (const [course, pre] of prerequisites) {
        graph[pre].push(course);
        indegree[course]++;
    }
    const queue = [];
    for (let i = 0; i < numCourses; i++) {
        if (indegree[i] === 0) queue.push(i);
    }
    let taken = 0;
    while (queue.length) {
        const course = queue.shift();
        taken++;
        for (const next of graph[course]) {
            if (--indegree[next] === 0) queue.push(next);
        }
    }
    return taken === numCourses;
};`,
    tests: [
      { input: 'numCourses = 4, prerequisites = [[1,0],[2,0],[3,1],[3,2]]', expected: true },
      { input: 'numCourses = 2, prerequisites = [[1,0],[0,1]]', expected: false },
    ],
    views: ['graph', 'array'], viewsBy: { java: ['queue'] }, eventsBy: { java: ['QUEUE_PUSH', 'QUEUE_POP'] },
  },
  {
    id: 'network-delay', category: 'graph', title: "743. Network Delay Time (Dijkstra)",
    java: `class Solution {
    public int networkDelayTime(int[][] times, int n, int k) {
        Map<Integer, List<int[]>> graph = new HashMap<>();
        for (int[] t : times) graph.computeIfAbsent(t[0], x -> new ArrayList<>()).add(new int[]{t[1], t[2]});
        int[] dist = new int[n + 1];
        Arrays.fill(dist, Integer.MAX_VALUE);
        dist[k] = 0;
        PriorityQueue<int[]> heap = new PriorityQueue<>((a, b) -> a[1] - b[1]);
        heap.offer(new int[]{k, 0});
        while (!heap.isEmpty()) {
            int[] cur = heap.poll();
            int node = cur[0], d = cur[1];
            if (d > dist[node]) continue;
            for (int[] edge : graph.getOrDefault(node, List.of())) {
                int nd = d + edge[1];
                if (nd < dist[edge[0]]) {
                    dist[edge[0]] = nd;
                    heap.offer(new int[]{edge[0], nd});
                }
            }
        }
        int best = 0;
        for (int i = 1; i <= n; i++) {
            if (dist[i] == Integer.MAX_VALUE) return -1;
            best = Math.max(best, dist[i]);
        }
        return best;
    }
}`,
    javascript: `var networkDelayTime = function(times, n, k) {
    const dist = new Array(n + 1).fill(Infinity);
    const done = new Array(n + 1).fill(false);
    dist[k] = 0;
    for (let round = 0; round < n; round++) {
        let u = -1;
        for (let v = 1; v <= n; v++) {
            if (!done[v] && (u === -1 || dist[v] < dist[u])) u = v;
        }
        if (dist[u] === Infinity) break;
        done[u] = true;
        for (const [from, to, w] of times) {
            if (from === u && dist[u] + w < dist[to]) dist[to] = dist[u] + w;
        }
    }
    let best = 0;
    for (let v = 1; v <= n; v++) best = Math.max(best, dist[v]);
    return best === Infinity ? -1 : best;
};`,
    tests: [{ input: 'times = [[2,1,1],[2,3,1],[3,4,1]], n = 4, k = 2', expected: 2 }, { input: 'times = [[1,2,1]], n = 2, k = 2', expected: -1 }],
    views: ['array'], viewsBy: { java: ['pq', 'map'] }, events: ['ARRAY_WRITE'],
  },
  {
    id: 'provinces', category: 'union find', title: '547. Number of Provinces (union-find, path compression)',
    java: `class Solution {
    private int[] parent;

    public int findCircleNum(int[][] isConnected) {
        int n = isConnected.length;
        parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;
        int components = n;
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                if (isConnected[i][j] == 1 && union(i, j)) components--;
            }
        }
        return components;
    }

    private int find(int x) {
        if (parent[x] != x) parent[x] = find(parent[x]);
        return parent[x];
    }

    private boolean union(int a, int b) {
        int ra = find(a), rb = find(b);
        if (ra == rb) return false;
        parent[ra] = rb;
        return true;
    }
}`,
    javascript: `var findCircleNum = function(isConnected) {
    const n = isConnected.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x) => {
        if (parent[x] !== x) parent[x] = find(parent[x]);
        return parent[x];
    };
    let components = n;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (isConnected[i][j] === 1) {
                const ra = find(i), rb = find(j);
                if (ra !== rb) {
                    parent[ra] = rb;
                    components--;
                }
            }
        }
    }
    return components;
};`,
    tests: [{ input: 'isConnected = [[1,1,0],[1,1,0],[0,0,1]]', expected: 2 }, { input: 'isConnected = [[1,0,0],[0,1,0],[0,0,1]]', expected: 3 }],
    views: ['matrix', 'array'], events: ['ARRAY_WRITE'], absentViews: ['graph'],
  },
  {
    id: 'keys-rooms', category: 'graph', title: '841. Keys and Rooms (DFS with explicit stack)',
    java: `class Solution {
    public boolean canVisitAllRooms(List<List<Integer>> rooms) {
        boolean[] seen = new boolean[rooms.size()];
        Deque<Integer> stack = new ArrayDeque<>();
        stack.push(0);
        seen[0] = true;
        while (!stack.isEmpty()) {
            int room = stack.pop();
            for (int key : rooms.get(room)) {
                if (!seen[key]) {
                    seen[key] = true;
                    stack.push(key);
                }
            }
        }
        for (boolean s : seen) if (!s) return false;
        return true;
    }
}`,
    javascript: `var canVisitAllRooms = function(rooms) {
    const seen = new Array(rooms.length).fill(false);
    const stack = [0];
    seen[0] = true;
    while (stack.length) {
        const room = stack.pop();
        for (const key of rooms[room]) {
            if (!seen[key]) {
                seen[key] = true;
                stack.push(key);
            }
        }
    }
    return seen.every(Boolean);
};`,
    tests: [{ input: 'rooms = [[1],[2],[3],[]]', expected: true }, { input: 'rooms = [[1,3],[3,0,1],[2],[0]]', expected: false }],
    views: ['graph', 'array'], viewsBy: { java: ['stack'] }, eventsBy: { java: ['STACK_PUSH', 'STACK_POP'] },
  },

  // ============================================================================ dynamic programming
  {
    id: 'climbing-stairs', category: 'DP 1D', title: '70. Climbing Stairs',
    java: `class Solution {
    public int climbStairs(int n) {
        if (n <= 2) return n;
        int[] dp = new int[n + 1];
        dp[1] = 1;
        dp[2] = 2;
        for (int i = 3; i <= n; i++) {
            dp[i] = dp[i - 1] + dp[i - 2];
        }
        return dp[n];
    }
}`,
    javascript: `var climbStairs = function(n) {
    if (n <= 2) return n;
    const dp = new Array(n + 1).fill(0);
    dp[1] = 1;
    dp[2] = 2;
    for (let i = 3; i <= n; i++) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }
    return dp[n];
};`,
    tests: [{ input: 'n = 5', expected: 8 }, { input: 'n = 1', expected: 1 }],
    views: ['array'], events: ['ARRAY_WRITE', 'ARRAY_READ'], dependency: /dp\[\d+\] = \d+ {2}← dp\[\d+\], dp\[\d+\]/,
  },
  {
    id: 'coin-change', category: 'DP 1D', title: '322. Coin Change (Arrays.fill, sentinel values)',
    java: `class Solution {
    public int coinChange(int[] coins, int amount) {
        int[] dp = new int[amount + 1];
        Arrays.fill(dp, amount + 1);
        dp[0] = 0;
        for (int a = 1; a <= amount; a++) {
            for (int coin : coins) {
                if (coin <= a) dp[a] = Math.min(dp[a], dp[a - coin] + 1);
            }
        }
        return dp[amount] > amount ? -1 : dp[amount];
    }
}`,
    javascript: `var coinChange = function(coins, amount) {
    const dp = new Array(amount + 1).fill(amount + 1);
    dp[0] = 0;
    for (let a = 1; a <= amount; a++) {
        for (const coin of coins) {
            if (coin <= a) dp[a] = Math.min(dp[a], dp[a - coin] + 1);
        }
    }
    return dp[amount] > amount ? -1 : dp[amount];
};`,
    tests: [{ input: 'coins = [1,2,5], amount = 11', expected: 3 }, { input: 'coins = [2], amount = 3', expected: -1 }],
    views: ['array'], events: ['ARRAY_WRITE'],
  },
  {
    id: 'lis', category: 'DP 1D', title: '300. Longest Increasing Subsequence (O(n²))',
    java: `class Solution {
    public int lengthOfLIS(int[] nums) {
        int[] dp = new int[nums.length];
        int best = 0;
        for (int i = 0; i < nums.length; i++) {
            dp[i] = 1;
            for (int j = 0; j < i; j++) {
                if (nums[j] < nums[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
            }
            best = Math.max(best, dp[i]);
        }
        return best;
    }
}`,
    javascript: `var lengthOfLIS = function(nums) {
    const dp = new Array(nums.length).fill(1);
    let best = 0;
    for (let i = 0; i < nums.length; i++) {
        for (let j = 0; j < i; j++) {
            if (nums[j] < nums[i]) dp[i] = Math.max(dp[i], dp[j] + 1);
        }
        best = Math.max(best, dp[i]);
    }
    return best;
};`,
    tests: [{ input: 'nums = [10,9,2,5,3,7,101,18]', expected: 4 }],
    views: ['array'], events: ['ARRAY_WRITE'],
  },
  {
    id: 'edit-distance', category: 'DP 2D', title: '72. Edit Distance',
    java: `class Solution {
    public int minDistance(String word1, String word2) {
        int m = word1.length(), n = word2.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (word1.charAt(i - 1) == word2.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], Math.min(dp[i - 1][j], dp[i][j - 1]));
                }
            }
        }
        return dp[m][n];
    }
}`,
    javascript: `var minDistance = function(word1, word2) {
    const m = word1.length, n = word2.length;
    const dp = [];
    for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (word1[i - 1] === word2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }
    return dp[m][n];
};`,
    tests: [{ input: 'word1 = "horse", word2 = "ros"', expected: 3 }],
    views: ['matrix'], events: ['ARRAY_WRITE', 'ARRAY_READ'], absentViews: ['graph'],
    dependency: /dp\[\d+\]\[\d+\] = \d+ {2}← dp\[\d+\]\[\d+\], dp\[\d+\]\[\d+\], dp\[\d+\]\[\d+\]/,
  },
  {
    id: 'unique-paths', category: 'DP 2D', title: '62. Unique Paths',
    java: `class Solution {
    public int uniquePaths(int m, int n) {
        int[][] dp = new int[m][n];
        for (int i = 0; i < m; i++) {
            for (int j = 0; j < n; j++) {
                if (i == 0 || j == 0) dp[i][j] = 1;
                else dp[i][j] = dp[i - 1][j] + dp[i][j - 1];
            }
        }
        return dp[m - 1][n - 1];
    }
}`,
    javascript: `var uniquePaths = function(m, n) {
    const dp = [];
    for (let i = 0; i < m; i++) dp.push(new Array(n).fill(1));
    for (let i = 1; i < m; i++) {
        for (let j = 1; j < n; j++) {
            dp[i][j] = dp[i - 1][j] + dp[i][j - 1];
        }
    }
    return dp[m - 1][n - 1];
};`,
    tests: [{ input: 'm = 3, n = 4', expected: 10 }],
    views: ['matrix'], events: ['ARRAY_WRITE'],
  },
  {
    // the built-in example: memoized interval DP whose table is allocated far bigger than it is used; the dependency
    // caption has to come from the sub-problem calls (the cell's own line reads no other cell of the table)
    id: 'min-cost-cut', category: 'DP 2D', title: '1547. Minimum Cost to Cut a Stick (memoized recursion, oversized table)',
    java: MIN_COST_CUT.java,
    javascript: MIN_COST_CUT.javascript,
    tests: [{ input: 'n = 7, cuts = [1,3,4,5]', expected: 16 }, { input: 'n = 9, cuts = [5,6,1,4,2]', expected: 22 }],
    views: ['matrix'], events: ['ARRAY_WRITE'], recursive: true,
    dependency: /dp\[\d+\]\[\d+\] = \d+ {2}← (this\.)?dp\[\d+\]\[\d+\], (this\.)?dp\[\d+\]\[\d+\]/,
  },
  {
    id: 'house-robber', category: 'DP 1D', title: '198. House Robber (rolling variables)',
    java: `class Solution {
    public int rob(int[] nums) {
        int prev = 0, cur = 0;
        for (int n : nums) {
            int next = Math.max(cur, prev + n);
            prev = cur;
            cur = next;
        }
        return cur;
    }
}`,
    javascript: `var rob = function(nums) {
    let prev = 0, cur = 0;
    for (const n of nums) {
        [prev, cur] = [cur, Math.max(cur, prev + n)];
    }
    return cur;
};`,
    tests: [{ input: 'nums = [2,7,9,3,1]', expected: 12 }],
    views: ['array'], events: ['VARIABLE_UPDATE'],
  },
  {
    id: 'word-break', category: 'DP 1D', title: '139. Word Break (boolean dp + set of strings)',
    java: `class Solution {
    public boolean wordBreak(String s, List<String> wordDict) {
        Set<String> words = new HashSet<>(wordDict);
        boolean[] dp = new boolean[s.length() + 1];
        dp[0] = true;
        for (int i = 1; i <= s.length(); i++) {
            for (int j = 0; j < i; j++) {
                if (dp[j] && words.contains(s.substring(j, i))) {
                    dp[i] = true;
                    break;
                }
            }
        }
        return dp[s.length()];
    }
}`,
    javascript: `var wordBreak = function(s, wordDict) {
    const words = new Set(wordDict);
    const dp = new Array(s.length + 1).fill(false);
    dp[0] = true;
    for (let i = 1; i <= s.length; i++) {
        for (let j = 0; j < i; j++) {
            if (dp[j] && words.has(s.substring(j, i))) {
                dp[i] = true;
                break;
            }
        }
    }
    return dp[s.length];
};`,
    tests: [{ input: 's = "leetcode", wordDict = ["leet","code"]', expected: true }, { input: 's = "catsandog", wordDict = ["cats","dog","sand","and","cat"]', expected: false }],
    views: ['array', 'set'], events: ['ARRAY_WRITE'],
  },
  {
    id: 'partition-subset', category: 'DP knapsack', title: '416. Partition Equal Subset Sum (0/1 knapsack)',
    java: `class Solution {
    public boolean canPartition(int[] nums) {
        int total = 0;
        for (int n : nums) total += n;
        if (total % 2 == 1) return false;
        int target = total / 2;
        boolean[] dp = new boolean[target + 1];
        dp[0] = true;
        for (int n : nums) {
            for (int s = target; s >= n; s--) {
                dp[s] = dp[s] || dp[s - n];
            }
        }
        return dp[target];
    }
}`,
    javascript: `var canPartition = function(nums) {
    const total = nums.reduce((a, b) => a + b, 0);
    if (total % 2 === 1) return false;
    const target = total / 2;
    const dp = new Array(target + 1).fill(false);
    dp[0] = true;
    for (const n of nums) {
        for (let s = target; s >= n; s--) {
            dp[s] = dp[s] || dp[s - n];
        }
    }
    return dp[target];
};`,
    tests: [{ input: 'nums = [1,5,11,5]', expected: true }, { input: 'nums = [1,2,3,5]', expected: false }],
    views: ['array'], events: ['ARRAY_WRITE'],
  },
  {
    id: 'fib-memo', category: 'memoization', title: '509. Fibonacci with memo (field map / global map)',
    java: `class Solution {
    private final Map<Integer, Integer> memo = new HashMap<>();

    public int fib(int n) {
        if (n <= 1) return n;
        if (memo.containsKey(n)) return memo.get(n);
        int result = fib(n - 1) + fib(n - 2);
        memo.put(n, result);
        return result;
    }
}`,
    javascript: `const memo = new Map();

var fib = function(n) {
    if (n <= 1) return n;
    if (memo.has(n)) return memo.get(n);
    const result = fib(n - 1) + fib(n - 2);
    memo.set(n, result);
    return result;
};`,
    tests: [{ input: 'n = 10', expected: 55 }],
    views: ['map'], events: ['MAP_PUT', 'MAP_GET', 'FUNCTION_ENTER'], recursive: true,
  },

  // ============================================================================ backtracking
  {
    id: 'subsets', category: 'backtracking', title: '78. Subsets',
    java: `class Solution {
    public List<List<Integer>> subsets(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        backtrack(nums, 0, new ArrayList<>(), result);
        return result;
    }

    private void backtrack(int[] nums, int start, List<Integer> path, List<List<Integer>> result) {
        result.add(new ArrayList<>(path));
        for (int i = start; i < nums.length; i++) {
            path.add(nums[i]);
            backtrack(nums, i + 1, path, result);
            path.remove(path.size() - 1);
        }
    }
}`,
    javascript: `var subsets = function(nums) {
    const result = [];
    const path = [];
    const backtrack = (start) => {
        result.push([...path]);
        for (let i = start; i < nums.length; i++) {
            path.push(nums[i]);
            backtrack(i + 1);
            path.pop();
        }
    };
    backtrack(0);
    return result;
};`,
    tests: [{ input: 'nums = [1,2,3]', expected: [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]], unordered: true }],
    views: ['array'], events: ['FUNCTION_ENTER', 'RETURN'], recursive: true,
  },
  {
    id: 'permutations', category: 'backtracking', title: '46. Permutations (used[] flags)',
    java: `class Solution {
    public List<List<Integer>> permute(int[] nums) {
        List<List<Integer>> result = new ArrayList<>();
        boolean[] used = new boolean[nums.length];
        build(nums, used, new ArrayList<>(), result);
        return result;
    }

    private void build(int[] nums, boolean[] used, List<Integer> path, List<List<Integer>> result) {
        if (path.size() == nums.length) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int i = 0; i < nums.length; i++) {
            if (used[i]) continue;
            used[i] = true;
            path.add(nums[i]);
            build(nums, used, path, result);
            path.remove(path.size() - 1);
            used[i] = false;
        }
    }
}`,
    javascript: `var permute = function(nums) {
    const result = [];
    const used = new Array(nums.length).fill(false);
    const path = [];
    const build = () => {
        if (path.length === nums.length) {
            result.push([...path]);
            return;
        }
        for (let i = 0; i < nums.length; i++) {
            if (used[i]) continue;
            used[i] = true;
            path.push(nums[i]);
            build();
            path.pop();
            used[i] = false;
        }
    };
    build();
    return result;
};`,
    tests: [{ input: 'nums = [1,2,3]', expected: [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]] }],
    views: ['array'], events: ['ARRAY_WRITE'], recursive: true,
  },
  {
    id: 'generate-parentheses', category: 'backtracking', title: '22. Generate Parentheses (StringBuilder)',
    java: `class Solution {
    public List<String> generateParenthesis(int n) {
        List<String> result = new ArrayList<>();
        build(new StringBuilder(), 0, 0, n, result);
        return result;
    }

    private void build(StringBuilder sb, int open, int close, int n, List<String> result) {
        if (sb.length() == 2 * n) {
            result.add(sb.toString());
            return;
        }
        if (open < n) {
            sb.append('(');
            build(sb, open + 1, close, n, result);
            sb.deleteCharAt(sb.length() - 1);
        }
        if (close < open) {
            sb.append(')');
            build(sb, open, close + 1, n, result);
            sb.deleteCharAt(sb.length() - 1);
        }
    }
}`,
    javascript: `var generateParenthesis = function(n) {
    const result = [];
    const build = (s, open, close) => {
        if (s.length === 2 * n) {
            result.push(s);
            return;
        }
        if (open < n) build(s + '(', open + 1, close);
        if (close < open) build(s + ')', open, close + 1);
    };
    build('', 0, 0);
    return result;
};`,
    tests: [{ input: 'n = 3', expected: ['((()))', '(()())', '(())()', '()(())', '()()()'] }],
    views: ['array'], events: ['FUNCTION_ENTER'], eventsBy: { java: ['ARRAY_WRITE'] }, recursive: true,
  },
  {
    id: 'n-queens', category: 'backtracking', title: '51. N-Queens (char board)',
    java: `class Solution {
    public List<List<String>> solveNQueens(int n) {
        char[][] board = new char[n][n];
        for (char[] row : board) Arrays.fill(row, '.');
        List<List<String>> result = new ArrayList<>();
        place(board, 0, result);
        return result;
    }

    private void place(char[][] board, int row, List<List<String>> result) {
        int n = board.length;
        if (row == n) {
            List<String> snapshot = new ArrayList<>();
            for (char[] r : board) snapshot.add(new String(r));
            result.add(snapshot);
            return;
        }
        for (int col = 0; col < n; col++) {
            if (safe(board, row, col)) {
                board[row][col] = 'Q';
                place(board, row + 1, result);
                board[row][col] = '.';
            }
        }
    }

    private boolean safe(char[][] board, int row, int col) {
        for (int r = 0; r < row; r++) {
            int d = row - r;
            if (board[r][col] == 'Q') return false;
            if (col - d >= 0 && board[r][col - d] == 'Q') return false;
            if (col + d < board.length && board[r][col + d] == 'Q') return false;
        }
        return true;
    }
}`,
    javascript: `var solveNQueens = function(n) {
    const board = [];
    for (let i = 0; i < n; i++) board.push(new Array(n).fill('.'));
    const result = [];
    const safe = (row, col) => {
        for (let r = 0; r < row; r++) {
            const d = row - r;
            if (board[r][col] === 'Q') return false;
            if (col - d >= 0 && board[r][col - d] === 'Q') return false;
            if (col + d < n && board[r][col + d] === 'Q') return false;
        }
        return true;
    };
    const place = (row) => {
        if (row === n) {
            result.push(board.map((r) => r.join('')));
            return;
        }
        for (let col = 0; col < n; col++) {
            if (safe(row, col)) {
                board[row][col] = 'Q';
                place(row + 1);
                board[row][col] = '.';
            }
        }
    };
    place(0);
    return result;
};`,
    tests: [{ input: 'n = 4', expected: [['.Q..', '...Q', 'Q...', '..Q.'], ['..Q.', 'Q...', '...Q', '.Q..']] }],
    views: ['matrix'], events: ['ARRAY_WRITE'], recursive: true,
  },
  {
    id: 'combination-sum', category: 'backtracking', title: '39. Combination Sum',
    java: `class Solution {
    public List<List<Integer>> combinationSum(int[] candidates, int target) {
        List<List<Integer>> result = new ArrayList<>();
        dfs(candidates, 0, target, new ArrayList<>(), result);
        return result;
    }

    private void dfs(int[] candidates, int start, int remaining, List<Integer> path, List<List<Integer>> result) {
        if (remaining == 0) {
            result.add(new ArrayList<>(path));
            return;
        }
        for (int i = start; i < candidates.length; i++) {
            if (candidates[i] > remaining) continue;
            path.add(candidates[i]);
            dfs(candidates, i, remaining - candidates[i], path, result);
            path.remove(path.size() - 1);
        }
    }
}`,
    javascript: `var combinationSum = function(candidates, target) {
    const result = [];
    const path = [];
    const dfs = (start, remaining) => {
        if (remaining === 0) {
            result.push([...path]);
            return;
        }
        for (let i = start; i < candidates.length; i++) {
            if (candidates[i] > remaining) continue;
            path.push(candidates[i]);
            dfs(i, remaining - candidates[i]);
            path.pop();
        }
    };
    dfs(0, target);
    return result;
};`,
    tests: [{ input: 'candidates = [2,3,6,7], target = 7', expected: [[2, 2, 3], [7]] }],
    views: ['array'], recursive: true,
  },

  // ============================================================================ bits & math
  {
    id: 'single-number', category: 'bit manipulation', title: '136. Single Number (XOR)',
    java: `class Solution {
    public int singleNumber(int[] nums) {
        int x = 0;
        for (int n : nums) x ^= n;
        return x;
    }
}`,
    javascript: `var singleNumber = function(nums) {
    let x = 0;
    for (const n of nums) x ^= n;
    return x;
};`,
    tests: [{ input: 'nums = [4,1,2,1,2]', expected: 4 }],
    views: ['array'], events: ['VARIABLE_UPDATE'], minFrames: 6,
  },
  {
    id: 'counting-bits', category: 'bit manipulation', title: '338. Counting Bits (shifts)',
    java: `class Solution {
    public int[] countBits(int n) {
        int[] bits = new int[n + 1];
        for (int i = 1; i <= n; i++) bits[i] = bits[i >> 1] + (i & 1);
        return bits;
    }
}`,
    javascript: `var countBits = function(n) {
    const bits = new Array(n + 1).fill(0);
    for (let i = 1; i <= n; i++) bits[i] = bits[i >> 1] + (i & 1);
    return bits;
};`,
    tests: [{ input: 'n = 5', expected: [0, 1, 1, 2, 1, 2] }],
    views: ['array'], events: ['ARRAY_WRITE', 'ARRAY_READ'],
  },
  {
    id: 'reverse-integer', category: 'math', title: '7. Reverse Integer (overflow via long)',
    java: `class Solution {
    public int reverse(int x) {
        long result = 0;
        while (x != 0) {
            result = result * 10 + x % 10;
            x /= 10;
        }
        if (result > Integer.MAX_VALUE || result < Integer.MIN_VALUE) return 0;
        return (int) result;
    }
}`,
    javascript: `var reverse = function(x) {
    let result = 0;
    while (x !== 0) {
        result = result * 10 + (x % 10);
        x = Math.trunc(x / 10);
    }
    if (result > 2 ** 31 - 1 || result < -(2 ** 31)) return 0;
    return result;
};`,
    tests: [{ input: 'x = -123', expected: -321 }, { input: 'x = 1534236469', expected: 0 }],
    events: ['VARIABLE_UPDATE'],
  },
  {
    id: 'roman-to-int', category: 'hashing', title: '13. Roman to Integer (Map.of / object map)',
    java: `class Solution {
    public int romanToInt(String s) {
        Map<Character, Integer> value = Map.of('I', 1, 'V', 5, 'X', 10, 'L', 50, 'C', 100, 'D', 500, 'M', 1000);
        int total = 0;
        for (int i = 0; i < s.length(); i++) {
            int v = value.get(s.charAt(i));
            if (i + 1 < s.length() && v < value.get(s.charAt(i + 1))) total -= v;
            else total += v;
        }
        return total;
    }
}`,
    javascript: `var romanToInt = function(s) {
    const value = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let i = 0; i < s.length; i++) {
        const v = value[s[i]];
        if (i + 1 < s.length && v < value[s[i + 1]]) total -= v;
        else total += v;
    }
    return total;
};`,
    tests: [{ input: 's = "MCMXCIV"', expected: 1994 }],
    views: ['map'],
  },
  {
    id: 'pow', category: 'math', title: '50. Pow(x, n) (doubles, fast exponentiation)',
    java: `class Solution {
    public double myPow(double x, int n) {
        long N = n;
        if (N < 0) {
            x = 1 / x;
            N = -N;
        }
        double result = 1;
        while (N > 0) {
            if ((N & 1) == 1) result *= x;
            x *= x;
            N >>= 1;
        }
        return result;
    }
}`,
    javascript: `var myPow = function(x, n) {
    let N = n;
    if (N < 0) {
        x = 1 / x;
        N = -N;
    }
    let result = 1;
    while (N > 0) {
        if (N % 2 === 1) result *= x;
        x *= x;
        N = Math.floor(N / 2);
    }
    return result;
};`,
    tests: [{ input: 'x = 2.0, n = 10', expected: 1024 }, { input: 'x = 2.1, n = 3', expected: 9.261 }, { input: 'x = 2.0, n = -2', expected: 0.25 }],
    events: ['VARIABLE_UPDATE'],
  },

  // ============================================================================ language features
  {
    id: 'java-features', category: 'language features', title: 'Java: records, enums, streams, switch, try/catch, labels, TreeMap/TreeSet, statics, printing',
    java: `import java.util.*;
import java.util.stream.*;

class Solution {
    record Point(int x, int y) {}

    enum Color { RED, GREEN }

    static int calls = 0;

    static class Counter {
        int count;

        void inc() {
            count++;
        }
    }

    public String features(int[] nums) {
        calls++;
        var points = new ArrayList<Point>();
        for (int i = 0; i < nums.length; i++) points.add(new Point(i, nums[i]));
        int sum = points.stream().mapToInt(Point::y).filter(v -> v % 2 == 0).sum();
        TreeMap<Integer, String> sorted = new TreeMap<>();
        for (int n : nums) sorted.put(n, n % 2 == 0 ? "even" : "odd");
        TreeSet<Integer> set = new TreeSet<>(sorted.keySet());
        Color c = sum > 5 ? Color.GREEN : Color.RED;
        String label = switch (c) {
            case RED -> "small";
            case GREEN -> "big";
        };
        Counter counter = new Counter();
        int i = 0;
        do {
            counter.inc();
            i++;
        } while (i < 3);
        int parsed;
        try {
            parsed = Integer.parseInt("x" + nums.length);
        } catch (NumberFormatException e) {
            parsed = -1;
        }
        outer:
        for (int a = 0; a < 3; a++) {
            for (int b = 0; b < 3; b++) {
                if (a * b == 2) break outer;
            }
        }
        Iterator<Integer> it = set.iterator();
        int first = it.next();
        System.out.println(String.format("sum=%d label=%s", sum, label));
        return label + ":" + sum + ":" + counter.count + ":" + parsed + ":" + first + ":" + set.size() + ":" + calls;
    }
}`,
    tests: [{ input: 'nums = [1,2,3,4]', expected: 'big:6:3:-1:1:4:1' }],
    views: ['map', 'set', 'object'], events: ['PRINT', 'FUNCTION_ENTER'], stdout: { java: 'sum=6 label=big' },
    noCallsNamed: { java: ['1.<static>', 'Solution$1'] },
  },
  {
    id: 'js-features', category: 'language features', title: 'JS: destructuring, spread, callbacks, switch, try/finally, labels, generators, BigInt, globals',
    javascript: `const memo = new Map();

function features(nums) {
    const [first, ...rest] = nums;
    const { length } = rest;
    const doubled = nums.map((n) => n * 2).filter((n) => n > 2);
    const total = doubled.reduce((acc, n) => acc + n, 0);
    const obj = { a: 1, b: { c: 2 } };
    let label = '';
    switch (total % 3) {
        case 0: label = 'zero'; break;
        case 1: label = 'one'; break;
        default: label = 'two';
    }
    let i = 0;
    do { i++; } while (i < 3);
    let caught = null;
    try {
        null.x;
    } catch (e) {
        caught = e.name;
    } finally {
        i += 10;
    }
    outer: for (let a = 0; a < 3; a++) {
        for (let b = 0; b < 3; b++) {
            if (a * b === 2) break outer;
        }
    }
    memo.set('total', total);
    const gen = (function* () { yield 1; yield 2; })();
    const fromGen = [...gen];
    const big = 2n ** 64n;
    console.log(\`total=\${total}\`, obj);
    return [first, length, total, label, i, caught, fromGen.length, String(big), memo.get('total')];
}`,
    tests: [{ input: 'nums = [1,2,3,4]', expected: [1, 3, 18, 'zero', 13, 'TypeError', 2, '18446744073709551616', 18] }],
    views: ['array', 'map'], events: ['PRINT', 'FUNCTION_ENTER', 'MAP_PUT'], stdout: { javascript: 'total=18 {a: 1, b: {c: 2}}' },
  },

  // ============================================================================ input formats
  {
    id: 'positional-input', category: 'input formats', title: 'Raw one-value-per-line input, mismatched names',
    java: `class Solution {
    public int numDistinct(String s, String t) {
        int[] dp = new int[t.length() + 1];
        dp[0] = 1;
        for (int i = 1; i <= s.length(); i++) {
            for (int j = t.length(); j >= 1; j--) {
                if (s.charAt(i - 1) == t.charAt(j - 1)) dp[j] += dp[j - 1];
            }
        }
        return dp[t.length()];
    }
}`,
    javascript: `var numDistinct = function(s, t) {
    const dp = new Array(t.length + 1).fill(0);
    dp[0] = 1;
    for (let i = 1; i <= s.length; i++) {
        for (let j = t.length; j >= 1; j--) {
            if (s[i - 1] === t[j - 1]) dp[j] += dp[j - 1];
        }
    }
    return dp[t.length];
};`,
    tests: [
      { input: '"rabbbit"\n"rabbit"', expected: 3 },
      { input: 'Input: s = "babgbag", t = "bag"', expected: 5 },
      { input: { first: 'rabbbit', second: 'rabbit' }, expected: 3 },
    ],
    views: ['array'],
  },
  {
    id: 'invalid-input-message', category: 'input formats', title: 'Too few values: clear, ASCII-safe message',
    java: `class Solution {
    public int numDistinct(String s, String t) {
        return s.length() + t.length();
    }
}`,
    javascript: `var numDistinct = function(s, t) {
    return s.length + t.length;
};`,
    tests: [{ input: 'grid = [["1","0"]]', status: 'INVALID_INPUT', messageIncludes: 'provides: grid' }],
  },

  // ============================================================================ scale
  {
    id: 'deep-recursion', category: 'scale', title: 'Recursion 1200 deep (snapshot cost must not grow with depth)',
    java: `class Solution {
    public int sumTo(int n) {
        if (n == 0) return 0;
        return n + sumTo(n - 1);
    }
}`,
    javascript: `var sumTo = function(n) {
    if (n === 0) return 0;
    return n + sumTo(n - 1);
};`,
    tests: [{ input: 'n = 1200', expected: 720600 }],
    maxDepthAtLeast: 1201, recursive: true, maxMs: 12000,
  },
  {
    id: 'large-array', category: 'scale', title: '5000-element input (collection capping)',
    java: `class Solution {
    public long total(int[] nums) {
        long sum = 0;
        for (int i = 0; i < nums.length; i += 250) sum += nums[i];
        return sum;
    }
}`,
    javascript: `var total = function(nums) {
    let sum = 0;
    for (let i = 0; i < nums.length; i += 250) sum += nums[i];
    return sum;
};`,
    tests: [{ input: { nums: Array.from({ length: 5000 }, (_, i) => i) }, expected: 47500 }],
    views: ['array'], maxMs: 8000,
  },

  // ============================================================================ failures
  {
    id: 'err-runtime', category: 'failures', title: 'Runtime error keeps earlier frames',
    java: `class Solution {
    public int divide(int a, int b) {
        int q = a / b;
        return q;
    }
}`,
    javascript: `var divide = function(a, b) {
    const obj = null;
    return obj.value / b;
};`,
    tests: [{ input: 'a = 1, b = 0', status: 'RUNTIME_ERROR', errorLineBy: { java: 3, javascript: 3 } }],
  },
  {
    id: 'err-infinite-recursion', category: 'failures', title: 'Unbounded recursion hits the step limit',
    java: `class Solution {
    public int down(int n) {
        return down(n + 1);
    }
}`,
    javascript: `var down = function(n) {
    return down(n + 1);
};`,
    tests: [{ input: 'n = 0', status: 'STEP_LIMIT' }],
  },
  {
    id: 'err-memory', category: 'failures', title: 'Allocation beyond the heap limit',
    java: `class Solution {
    public int allocate(int n) {
        long[] big = new long[50_000_000];
        return big.length + n;
    }
}`,
    tests: [{ input: 'n = 1', status: 'MEMORY_LIMIT' }],
  },
  {
    id: 'err-security-reflection', category: 'failures', title: 'Reflection is blocked before running',
    java: `class Solution {
    public String peek(int n) throws Exception {
        return Class.forName("java.lang.Runtime").getName() + n;
    }
}`,
    tests: [{ input: 'n = 1', status: 'SECURITY_VIOLATION' }],
  },
  {
    id: 'err-security-thread', category: 'failures', title: 'Threads and System.exit are blocked',
    java: `class Solution {
    public int run(int n) {
        new Thread(() -> System.exit(n)).start();
        return n;
    }
}`,
    tests: [{ input: 'n = 1', status: 'SECURITY_VIOLATION' }],
  },
  {
    id: 'err-compile', category: 'failures', title: 'Compile / syntax errors carry a line',
    java: `class Solution {
    public int f(int n) {
        return n +;
    }
}`,
    javascript: `var f = function(n) {
    return n +;
};`,
    tests: [{ input: 'n = 1', status: 'COMPILE_ERROR', errorLineBy: { java: 3, javascript: 2 } }],
  },
];
