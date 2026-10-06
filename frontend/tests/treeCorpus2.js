// More tree / node problems: BST operations, path problems, N-ary trees, pointers (next / random), graphs.
// Node classes other than TreeNode / ListNode (Node) come from the Definitions tab presets.

export const TREE_CORPUS_2 = [
  {
    id: 'search-bst', title: 'Search in a Binary Search Tree',
    tests: [{ input: 'root = [4,2,7,1,3], val = 2', expected: [2, 1, 3] }, { input: 'root = [4,2,7,1,3], val = 5', expected: [] }],
    java: `class Solution {
    public TreeNode searchBST(TreeNode root, int val) {
        while (root != null && root.val != val) {
            root = val < root.val ? root.left : root.right;
        }
        return root;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {number} val
 * @return {TreeNode}
 */
var searchBST = function(root, val) {
    while (root && root.val !== val) {
        root = val < root.val ? root.left : root.right;
    }
    return root;
};`,
    python: `class Solution:
    def searchBST(self, root: Optional[TreeNode], val: int) -> Optional[TreeNode]:
        while root and root.val != val:
            root = root.left if val < root.val else root.right
        return root`,
    cpp: `class Solution {
public:
    TreeNode* searchBST(TreeNode* root, int val) {
        while (root && root->val != val) {
            root = val < root->val ? root->left : root->right;
        }
        return root;
    }
};`,
    c: `struct TreeNode* searchBST(struct TreeNode* root, int val) {
    while (root != NULL && root->val != val) {
        root = val < root->val ? root->left : root->right;
    }
    return root;
}`,
  },
  {
    id: 'insert-bst', title: 'Insert into a Binary Search Tree',
    tests: [{ input: 'root = [4,2,7,1,3], val = 5', expected: [4, 2, 7, 1, 3, 5] }, { input: 'root = [], val = 5', expected: [5] }],
    java: `class Solution {
    public TreeNode insertIntoBST(TreeNode root, int val) {
        if (root == null) return new TreeNode(val);
        if (val < root.val) root.left = insertIntoBST(root.left, val);
        else root.right = insertIntoBST(root.right, val);
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
    if (val < root.val) root.left = insertIntoBST(root.left, val);
    else root.right = insertIntoBST(root.right, val);
    return root;
};`,
    python: `class Solution:
    def insertIntoBST(self, root: Optional[TreeNode], val: int) -> Optional[TreeNode]:
        if not root:
            return TreeNode(val)
        if val < root.val:
            root.left = self.insertIntoBST(root.left, val)
        else:
            root.right = self.insertIntoBST(root.right, val)
        return root`,
    cpp: `class Solution {
public:
    TreeNode* insertIntoBST(TreeNode* root, int val) {
        if (!root) return new TreeNode(val);
        if (val < root->val) root->left = insertIntoBST(root->left, val);
        else root->right = insertIntoBST(root->right, val);
        return root;
    }
};`,
    c: `struct TreeNode* insertIntoBST(struct TreeNode* root, int val) {
    if (!root) {
        struct TreeNode* n = malloc(sizeof(struct TreeNode));
        n->val = val;
        n->left = NULL;
        n->right = NULL;
        return n;
    }
    if (val < root->val) root->left = insertIntoBST(root->left, val);
    else root->right = insertIntoBST(root->right, val);
    return root;
}`,
  },
  {
    id: 'merge-trees', title: 'Merge Two Binary Trees',
    tests: [{ input: 'root1 = [1,3,2,5], root2 = [2,1,3,null,4,null,7]', expected: [3, 4, 5, 5, 4, null, 7] }, { input: 'root1 = [1], root2 = [1,2]', expected: [2, 2] }],
    java: `class Solution {
    public TreeNode mergeTrees(TreeNode root1, TreeNode root2) {
        if (root1 == null) return root2;
        if (root2 == null) return root1;
        root1.val += root2.val;
        root1.left = mergeTrees(root1.left, root2.left);
        root1.right = mergeTrees(root1.right, root2.right);
        return root1;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root1
 * @param {TreeNode} root2
 * @return {TreeNode}
 */
var mergeTrees = function(root1, root2) {
    if (!root1) return root2;
    if (!root2) return root1;
    root1.val += root2.val;
    root1.left = mergeTrees(root1.left, root2.left);
    root1.right = mergeTrees(root1.right, root2.right);
    return root1;
};`,
    python: `class Solution:
    def mergeTrees(self, root1: Optional[TreeNode], root2: Optional[TreeNode]) -> Optional[TreeNode]:
        if not root1:
            return root2
        if not root2:
            return root1
        root1.val += root2.val
        root1.left = self.mergeTrees(root1.left, root2.left)
        root1.right = self.mergeTrees(root1.right, root2.right)
        return root1`,
    cpp: `class Solution {
public:
    TreeNode* mergeTrees(TreeNode* root1, TreeNode* root2) {
        if (!root1) return root2;
        if (!root2) return root1;
        root1->val += root2->val;
        root1->left = mergeTrees(root1->left, root2->left);
        root1->right = mergeTrees(root1->right, root2->right);
        return root1;
    }
};`,
    c: `struct TreeNode* mergeTrees(struct TreeNode* root1, struct TreeNode* root2) {
    if (!root1) return root2;
    if (!root2) return root1;
    root1->val += root2->val;
    root1->left = mergeTrees(root1->left, root2->left);
    root1->right = mergeTrees(root1->right, root2->right);
    return root1;
}`,
  },
  {
    id: 'min-depth', title: 'Minimum Depth of Binary Tree',
    tests: [{ input: 'root = [3,9,20,null,null,15,7]', expected: 2 }, { input: 'root = [2,null,3,null,4,null,5,null,6]', expected: 5 }],
    java: `class Solution {
    public int minDepth(TreeNode root) {
        if (root == null) return 0;
        if (root.left == null) return 1 + minDepth(root.right);
        if (root.right == null) return 1 + minDepth(root.left);
        return 1 + Math.min(minDepth(root.left), minDepth(root.right));
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number}
 */
var minDepth = function(root) {
    if (!root) return 0;
    if (!root.left) return 1 + minDepth(root.right);
    if (!root.right) return 1 + minDepth(root.left);
    return 1 + Math.min(minDepth(root.left), minDepth(root.right));
};`,
    python: `class Solution:
    def minDepth(self, root: Optional[TreeNode]) -> int:
        if not root:
            return 0
        if not root.left:
            return 1 + self.minDepth(root.right)
        if not root.right:
            return 1 + self.minDepth(root.left)
        return 1 + min(self.minDepth(root.left), self.minDepth(root.right))`,
    cpp: `class Solution {
public:
    int minDepth(TreeNode* root) {
        if (!root) return 0;
        if (!root->left) return 1 + minDepth(root->right);
        if (!root->right) return 1 + minDepth(root->left);
        return 1 + min(minDepth(root->left), minDepth(root->right));
    }
};`,
    c: `int minDepth(struct TreeNode* root) {
    if (!root) return 0;
    if (!root->left) return 1 + minDepth(root->right);
    if (!root->right) return 1 + minDepth(root->left);
    int l = minDepth(root->left), r = minDepth(root->right);
    return 1 + (l < r ? l : r);
}`,
  },
  {
    id: 'binary-tree-paths', title: 'Binary Tree Paths',
    tests: [{ input: 'root = [1,2,3,null,5]', expected: ['1->2->5', '1->3'] }, { input: 'root = [1]', expected: ['1'] }],
    java: `class Solution {
    public List<String> binaryTreePaths(TreeNode root) {
        List<String> res = new ArrayList<>();
        dfs(root, "", res);
        return res;
    }

    private void dfs(TreeNode node, String path, List<String> res) {
        if (node == null) return;
        path += node.val;
        if (node.left == null && node.right == null) {
            res.add(path);
            return;
        }
        dfs(node.left, path + "->", res);
        dfs(node.right, path + "->", res);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {string[]}
 */
var binaryTreePaths = function(root) {
    const res = [];
    const dfs = (node, path) => {
        if (!node) return;
        path += node.val;
        if (!node.left && !node.right) { res.push(path); return; }
        dfs(node.left, path + '->');
        dfs(node.right, path + '->');
    };
    dfs(root, '');
    return res;
};`,
    python: `class Solution:
    def binaryTreePaths(self, root: Optional[TreeNode]) -> List[str]:
        res = []
        def dfs(node, path):
            if not node:
                return
            path += str(node.val)
            if not node.left and not node.right:
                res.append(path)
                return
            dfs(node.left, path + "->")
            dfs(node.right, path + "->")
        dfs(root, "")
        return res`,
    cpp: `class Solution {
    void dfs(TreeNode* node, string path, vector<string>& res) {
        if (!node) return;
        path += to_string(node->val);
        if (!node->left && !node->right) {
            res.push_back(path);
            return;
        }
        dfs(node->left, path + "->", res);
        dfs(node->right, path + "->", res);
    }
public:
    vector<string> binaryTreePaths(TreeNode* root) {
        vector<string> res;
        dfs(root, "", res);
        return res;
    }
};`,
  },
  {
    id: 'max-path-sum', title: 'Binary Tree Maximum Path Sum',
    tests: [{ input: 'root = [1,2,3]', expected: 6 }, { input: 'root = [-10,9,20,null,null,15,7]', expected: 42 }],
    java: `class Solution {
    private int best = Integer.MIN_VALUE;

    public int maxPathSum(TreeNode root) {
        gain(root);
        return best;
    }

    private int gain(TreeNode node) {
        if (node == null) return 0;
        int l = Math.max(0, gain(node.left));
        int r = Math.max(0, gain(node.right));
        best = Math.max(best, node.val + l + r);
        return node.val + Math.max(l, r);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number}
 */
var maxPathSum = function(root) {
    let best = -Infinity;
    const gain = (node) => {
        if (!node) return 0;
        const l = Math.max(0, gain(node.left));
        const r = Math.max(0, gain(node.right));
        best = Math.max(best, node.val + l + r);
        return node.val + Math.max(l, r);
    };
    gain(root);
    return best;
};`,
    python: `class Solution:
    def maxPathSum(self, root: Optional[TreeNode]) -> int:
        best = float('-inf')
        def gain(node):
            nonlocal best
            if not node:
                return 0
            l = max(0, gain(node.left))
            r = max(0, gain(node.right))
            best = max(best, node.val + l + r)
            return node.val + max(l, r)
        gain(root)
        return best`,
    cpp: `class Solution {
    int best = INT_MIN;
    int gain(TreeNode* node) {
        if (!node) return 0;
        int l = max(0, gain(node->left));
        int r = max(0, gain(node->right));
        best = max(best, node->val + l + r);
        return node->val + max(l, r);
    }
public:
    int maxPathSum(TreeNode* root) {
        gain(root);
        return best;
    }
};`,
  },
  {
    id: 'path-sum-iii', title: 'Path Sum III (prefix sums in a hash map)',
    tests: [{ input: 'root = [10,5,-3,3,2,null,11,3,-2,null,1], targetSum = 8', expected: 3 }, { input: 'root = [5,4,8,11,null,13,4,7,2,null,null,5,1], targetSum = 22', expected: 3 }],
    java: `class Solution {
    private Map<Long, Integer> prefix = new HashMap<>();

    public int pathSum(TreeNode root, int targetSum) {
        prefix.put(0L, 1);
        return dfs(root, 0L, targetSum);
    }

    private int dfs(TreeNode node, long sum, int target) {
        if (node == null) return 0;
        sum += node.val;
        int count = prefix.getOrDefault(sum - target, 0);
        prefix.merge(sum, 1, Integer::sum);
        count += dfs(node.left, sum, target) + dfs(node.right, sum, target);
        prefix.merge(sum, -1, Integer::sum);
        return count;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {number} targetSum
 * @return {number}
 */
var pathSum = function(root, targetSum) {
    const prefix = new Map([[0, 1]]);
    const dfs = (node, sum) => {
        if (!node) return 0;
        sum += node.val;
        let count = prefix.get(sum - targetSum) || 0;
        prefix.set(sum, (prefix.get(sum) || 0) + 1);
        count += dfs(node.left, sum) + dfs(node.right, sum);
        prefix.set(sum, prefix.get(sum) - 1);
        return count;
    };
    return dfs(root, 0);
};`,
    python: `class Solution:
    def pathSum(self, root: Optional[TreeNode], targetSum: int) -> int:
        prefix = defaultdict(int)
        prefix[0] = 1
        def dfs(node, total):
            if not node:
                return 0
            total += node.val
            count = prefix[total - targetSum]
            prefix[total] += 1
            count += dfs(node.left, total) + dfs(node.right, total)
            prefix[total] -= 1
            return count
        return dfs(root, 0)`,
    cpp: `class Solution {
    unordered_map<long long, int> prefix;
    int dfs(TreeNode* node, long long sum, int target) {
        if (!node) return 0;
        sum += node->val;
        int count = prefix.count(sum - target) ? prefix[sum - target] : 0;
        prefix[sum]++;
        count += dfs(node->left, sum, target) + dfs(node->right, sum, target);
        prefix[sum]--;
        return count;
    }
public:
    int pathSum(TreeNode* root, int targetSum) {
        prefix[0] = 1;
        return dfs(root, 0, targetSum);
    }
};`,
  },
  {
    id: 'zigzag', title: 'Binary Tree Zigzag Level Order Traversal',
    tests: [{ input: 'root = [3,9,20,null,null,15,7]', expected: [[3], [20, 9], [15, 7]] }, { input: 'root = [1]', expected: [[1]] }],
    java: `class Solution {
    public List<List<Integer>> zigzagLevelOrder(TreeNode root) {
        List<List<Integer>> res = new ArrayList<>();
        if (root == null) return res;
        Deque<TreeNode> q = new ArrayDeque<>();
        q.add(root);
        boolean leftToRight = true;
        while (!q.isEmpty()) {
            int n = q.size();
            LinkedList<Integer> level = new LinkedList<>();
            for (int i = 0; i < n; i++) {
                TreeNode node = q.poll();
                if (leftToRight) level.addLast(node.val); else level.addFirst(node.val);
                if (node.left != null) q.add(node.left);
                if (node.right != null) q.add(node.right);
            }
            res.add(level);
            leftToRight = !leftToRight;
        }
        return res;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number[][]}
 */
var zigzagLevelOrder = function(root) {
    const res = [];
    if (!root) return res;
    let q = [root];
    let leftToRight = true;
    while (q.length) {
        const level = [];
        const next = [];
        for (const node of q) {
            if (leftToRight) level.push(node.val); else level.unshift(node.val);
            if (node.left) next.push(node.left);
            if (node.right) next.push(node.right);
        }
        res.push(level);
        q = next;
        leftToRight = !leftToRight;
    }
    return res;
};`,
    python: `class Solution:
    def zigzagLevelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:
        res = []
        if not root:
            return res
        q = deque([root])
        left_to_right = True
        while q:
            level = deque()
            for _ in range(len(q)):
                node = q.popleft()
                if left_to_right:
                    level.append(node.val)
                else:
                    level.appendleft(node.val)
                if node.left:
                    q.append(node.left)
                if node.right:
                    q.append(node.right)
            res.append(list(level))
            left_to_right = not left_to_right
        return res`,
    cpp: `class Solution {
public:
    vector<vector<int>> zigzagLevelOrder(TreeNode* root) {
        vector<vector<int>> res;
        if (!root) return res;
        queue<TreeNode*> q;
        q.push(root);
        bool leftToRight = true;
        while (!q.empty()) {
            int n = q.size();
            vector<int> level(n);
            for (int i = 0; i < n; i++) {
                TreeNode* node = q.front();
                q.pop();
                level[leftToRight ? i : n - 1 - i] = node->val;
                if (node->left) q.push(node->left);
                if (node->right) q.push(node->right);
            }
            res.push_back(level);
            leftToRight = !leftToRight;
        }
        return res;
    }
};`,
  },
  {
    id: 'sorted-array-to-bst', title: 'Convert Sorted Array to Binary Search Tree',
    tests: [{ input: 'nums = [-10,-3,0,5,9]', expected: [0, -10, 5, null, -3, null, 9] }, { input: 'nums = [1,3]', expected: [1, null, 3] }],
    java: `class Solution {
    public TreeNode sortedArrayToBST(int[] nums) {
        return build(nums, 0, nums.length - 1);
    }

    private TreeNode build(int[] nums, int lo, int hi) {
        if (lo > hi) return null;
        int mid = (lo + hi) / 2;
        TreeNode node = new TreeNode(nums[mid]);
        node.left = build(nums, lo, mid - 1);
        node.right = build(nums, mid + 1, hi);
        return node;
    }
}`,
    javascript: `/**
 * @param {number[]} nums
 * @return {TreeNode}
 */
var sortedArrayToBST = function(nums) {
    const build = (lo, hi) => {
        if (lo > hi) return null;
        const mid = Math.floor((lo + hi) / 2);
        const node = new TreeNode(nums[mid]);
        node.left = build(lo, mid - 1);
        node.right = build(mid + 1, hi);
        return node;
    };
    return build(0, nums.length - 1);
};`,
    python: `class Solution:
    def sortedArrayToBST(self, nums: List[int]) -> Optional[TreeNode]:
        def build(lo, hi):
            if lo > hi:
                return None
            mid = (lo + hi) // 2
            node = TreeNode(nums[mid])
            node.left = build(lo, mid - 1)
            node.right = build(mid + 1, hi)
            return node
        return build(0, len(nums) - 1)`,
    cpp: `class Solution {
    TreeNode* build(vector<int>& nums, int lo, int hi) {
        if (lo > hi) return nullptr;
        int mid = (lo + hi) / 2;
        TreeNode* node = new TreeNode(nums[mid]);
        node->left = build(nums, lo, mid - 1);
        node->right = build(nums, mid + 1, hi);
        return node;
    }
public:
    TreeNode* sortedArrayToBST(vector<int>& nums) {
        return build(nums, 0, (int)nums.size() - 1);
    }
};`,
  },
  {
    id: 'two-sum-bst', title: 'Two Sum IV - Input is a BST',
    tests: [{ input: 'root = [5,3,6,2,4,null,7], k = 9', expected: true }, { input: 'root = [5,3,6,2,4,null,7], k = 28', expected: false }],
    java: `class Solution {
    public boolean findTarget(TreeNode root, int k) {
        Set<Integer> seen = new HashSet<>();
        return find(root, k, seen);
    }

    private boolean find(TreeNode node, int k, Set<Integer> seen) {
        if (node == null) return false;
        if (seen.contains(k - node.val)) return true;
        seen.add(node.val);
        return find(node.left, k, seen) || find(node.right, k, seen);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {number} k
 * @return {boolean}
 */
var findTarget = function(root, k) {
    const seen = new Set();
    const find = (node) => {
        if (!node) return false;
        if (seen.has(k - node.val)) return true;
        seen.add(node.val);
        return find(node.left) || find(node.right);
    };
    return find(root);
};`,
    python: `class Solution:
    def findTarget(self, root: Optional[TreeNode], k: int) -> bool:
        seen = set()
        def find(node):
            if not node:
                return False
            if k - node.val in seen:
                return True
            seen.add(node.val)
            return find(node.left) or find(node.right)
        return find(root)`,
    cpp: `class Solution {
    unordered_set<int> seen;
    bool find(TreeNode* node, int k) {
        if (!node) return false;
        if (seen.count(k - node->val)) return true;
        seen.insert(node->val);
        return find(node->left, k) || find(node->right, k);
    }
public:
    bool findTarget(TreeNode* root, int k) {
        return find(root, k);
    }
};`,
  },
  // ============================================================================ N-ary trees
  {
    id: 'nary-preorder', title: 'N-ary Tree Preorder Traversal',
    tests: [{ input: 'root = [1,null,3,2,4,null,5,6]', expected: [1, 3, 5, 6, 2, 4] }, { input: 'root = [1,null,2,3,4,5,null,null,6,7,null,8,null,9,10,null,null,11,null,12,null,13,null,null,14]', expected: [1, 2, 3, 6, 7, 11, 14, 4, 8, 12, 5, 9, 13, 10] }],
    java: `class Solution {
    public List<Integer> preorder(Node root) {
        List<Integer> res = new ArrayList<>();
        walk(root, res);
        return res;
    }

    private void walk(Node node, List<Integer> res) {
        if (node == null) return;
        res.add(node.val);
        for (Node child : node.children) walk(child, res);
    }
}`,
    javascript: `/**
 * @param {_Node|null} root
 * @return {number[]}
 */
var preorder = function(root) {
    const res = [];
    const walk = (node) => {
        if (!node) return;
        res.push(node.val);
        for (const child of node.children) walk(child);
    };
    walk(root);
    return res;
};`,
    python: `class Solution:
    def preorder(self, root: 'Node') -> List[int]:
        res = []
        def walk(node):
            if not node:
                return
            res.append(node.val)
            for child in node.children:
                walk(child)
        walk(root)
        return res`,
    cpp: `class Solution {
    void walk(Node* node, vector<int>& res) {
        if (!node) return;
        res.push_back(node->val);
        for (Node* child : node->children) walk(child, res);
    }
public:
    vector<int> preorder(Node* root) {
        vector<int> res;
        walk(root, res);
        return res;
    }
};`,
  },
  {
    id: 'nary-level-order', title: 'N-ary Tree Level Order Traversal',
    tests: [{ input: 'root = [1,null,3,2,4,null,5,6]', expected: [[1], [3, 2, 4], [5, 6]] }],
    java: `class Solution {
    public List<List<Integer>> levelOrder(Node root) {
        List<List<Integer>> res = new ArrayList<>();
        if (root == null) return res;
        Queue<Node> q = new LinkedList<>();
        q.add(root);
        while (!q.isEmpty()) {
            int n = q.size();
            List<Integer> level = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                Node node = q.poll();
                level.add(node.val);
                q.addAll(node.children);
            }
            res.add(level);
        }
        return res;
    }
}`,
    javascript: `/**
 * @param {_Node|null} root
 * @return {number[][]}
 */
var levelOrder = function(root) {
    const res = [];
    if (!root) return res;
    let q = [root];
    while (q.length) {
        res.push(q.map((n) => n.val));
        q = q.flatMap((n) => n.children);
    }
    return res;
};`,
    python: `class Solution:
    def levelOrder(self, root: 'Node') -> List[List[int]]:
        res = []
        if not root:
            return res
        q = deque([root])
        while q:
            level = []
            for _ in range(len(q)):
                node = q.popleft()
                level.append(node.val)
                q.extend(node.children)
            res.append(level)
        return res`,
    cpp: `class Solution {
public:
    vector<vector<int>> levelOrder(Node* root) {
        vector<vector<int>> res;
        if (!root) return res;
        queue<Node*> q;
        q.push(root);
        while (!q.empty()) {
            int n = q.size();
            vector<int> level;
            for (int i = 0; i < n; i++) {
                Node* node = q.front();
                q.pop();
                level.push_back(node->val);
                for (Node* c : node->children) q.push(c);
            }
            res.push_back(level);
        }
        return res;
    }
};`,
  },
  {
    id: 'nary-max-depth', title: 'Maximum Depth of N-ary Tree',
    tests: [{ input: 'root = [1,null,3,2,4,null,5,6]', expected: 3 }],
    java: `class Solution {
    public int maxDepth(Node root) {
        if (root == null) return 0;
        int best = 0;
        for (Node child : root.children) best = Math.max(best, maxDepth(child));
        return best + 1;
    }
}`,
    javascript: `/**
 * @param {_Node|null} root
 * @return {number}
 */
var maxDepth = function(root) {
    if (!root) return 0;
    let best = 0;
    for (const child of root.children) best = Math.max(best, maxDepth(child));
    return best + 1;
};`,
    python: `class Solution:
    def maxDepth(self, root: 'Node') -> int:
        if not root:
            return 0
        return 1 + max((self.maxDepth(c) for c in root.children), default=0)`,
    cpp: `class Solution {
public:
    int maxDepth(Node* root) {
        if (!root) return 0;
        int best = 0;
        for (Node* child : root->children) best = max(best, maxDepth(child));
        return best + 1;
    }
};`,
  },
  // ============================================================================ next pointers / random pointers / graphs
  {
    id: 'populate-next', title: 'Populating Next Right Pointers in Each Node',
    tests: [{ input: 'root = [1,2,3,4,5,6,7]', expected: [1, '#', 2, 3, '#', 4, 5, 6, 7, '#'] }],
    java: `class Solution {
    public Node connect(Node root) {
        Node level = root;
        while (level != null && level.left != null) {
            for (Node n = level; n != null; n = n.next) {
                n.left.next = n.right;
                if (n.next != null) n.right.next = n.next.left;
            }
            level = level.left;
        }
        return root;
    }
}`,
    javascript: `/**
 * @param {_Node} root
 * @return {_Node}
 */
var connect = function(root) {
    let level = root;
    while (level && level.left) {
        for (let n = level; n; n = n.next) {
            n.left.next = n.right;
            if (n.next) n.right.next = n.next.left;
        }
        level = level.left;
    }
    return root;
};`,
    python: `class Solution:
    def connect(self, root: 'Optional[Node]') -> 'Optional[Node]':
        level = root
        while level and level.left:
            n = level
            while n:
                n.left.next = n.right
                if n.next:
                    n.right.next = n.next.left
                n = n.next
            level = level.left
        return root`,
    cpp: `class Solution {
public:
    Node* connect(Node* root) {
        Node* level = root;
        while (level && level->left) {
            for (Node* n = level; n; n = n->next) {
                n->left->next = n->right;
                if (n->next) n->right->next = n->next->left;
            }
            level = level->left;
        }
        return root;
    }
};`,
  },
  {
    id: 'copy-random-list', title: 'Copy List with Random Pointer',
    tests: [{ input: 'head = [[7,null],[13,0],[11,4],[10,2],[1,0]]', expected: [[7, null], [13, 0], [11, 4], [10, 2], [1, 0]] }, { input: 'head = [[1,1],[2,1]]', expected: [[1, 1], [2, 1]] }],
    java: `class Solution {
    public Node copyRandomList(Node head) {
        Map<Node, Node> copy = new HashMap<>();
        for (Node n = head; n != null; n = n.next) copy.put(n, new Node(n.val));
        for (Node n = head; n != null; n = n.next) {
            copy.get(n).next = copy.get(n.next);
            copy.get(n).random = copy.get(n.random);
        }
        return copy.get(head);
    }
}`,
    javascript: `/**
 * @param {_Node} head
 * @return {_Node}
 */
var copyRandomList = function(head) {
    const copy = new Map();
    for (let n = head; n; n = n.next) copy.set(n, new Node(n.val, null, null));
    for (let n = head; n; n = n.next) {
        copy.get(n).next = n.next ? copy.get(n.next) : null;
        copy.get(n).random = n.random ? copy.get(n.random) : null;
    }
    return head ? copy.get(head) : null;
};`,
    python: `class Solution:
    def copyRandomList(self, head: 'Optional[Node]') -> 'Optional[Node]':
        copy = {None: None}
        n = head
        while n:
            copy[n] = Node(n.val)
            n = n.next
        n = head
        while n:
            copy[n].next = copy[n.next]
            copy[n].random = copy[n.random]
            n = n.next
        return copy[head]`,
    cpp: `class Solution {
public:
    Node* copyRandomList(Node* head) {
        unordered_map<Node*, Node*> copy;
        for (Node* n = head; n; n = n->next) copy[n] = new Node(n->val);
        for (Node* n = head; n; n = n->next) {
            copy[n]->next = n->next ? copy[n->next] : nullptr;
            copy[n]->random = n->random ? copy[n->random] : nullptr;
        }
        return head ? copy[head] : nullptr;
    }
};`,
  },
  {
    id: 'clone-graph', title: 'Clone Graph',
    tests: [{ input: 'node = [[2,4],[1,3],[2,4],[1,3]]', expected: [[2, 4], [1, 3], [2, 4], [1, 3]] }, { input: 'node = [[]]', expected: [[]] }],
    java: `class Solution {
    private Map<Node, Node> copies = new HashMap<>();

    public Node cloneGraph(Node node) {
        if (node == null) return null;
        if (copies.containsKey(node)) return copies.get(node);
        Node clone = new Node(node.val);
        copies.put(node, clone);
        for (Node nb : node.neighbors) clone.neighbors.add(cloneGraph(nb));
        return clone;
    }
}`,
    javascript: `/**
 * @param {_Node} node
 * @return {_Node}
 */
var cloneGraph = function(node) {
    const copies = new Map();
    const dfs = (n) => {
        if (!n) return null;
        if (copies.has(n)) return copies.get(n);
        const clone = new Node(n.val);
        copies.set(n, clone);
        for (const nb of n.neighbors) clone.neighbors.push(dfs(nb));
        return clone;
    };
    return dfs(node);
};`,
    python: `class Solution:
    def cloneGraph(self, node: 'Optional[Node]') -> 'Optional[Node]':
        copies = {}
        def dfs(n):
            if not n:
                return None
            if n in copies:
                return copies[n]
            clone = Node(n.val)
            copies[n] = clone
            for nb in n.neighbors:
                clone.neighbors.append(dfs(nb))
            return clone
        return dfs(node)`,
    cpp: `class Solution {
    unordered_map<Node*, Node*> copies;
public:
    Node* cloneGraph(Node* node) {
        if (!node) return nullptr;
        if (copies.count(node)) return copies[node];
        Node* clone = new Node(node->val);
        copies[node] = clone;
        for (Node* nb : node->neighbors) clone->neighbors.push_back(cloneGraph(nb));
        return clone;
    }
};`,
  },
  {
    id: 'bst-iterator', title: 'Binary Search Tree Iterator (class design)',
    tests: [{ input: '["BSTIterator","next","next","hasNext","next","hasNext","next","hasNext"]\n[[[7,3,15,null,null,9,20]],[],[],[],[],[],[],[]]', expected: [null, 3, 7, true, 9, true, 15, true] }],
    java: `class BSTIterator {
    private Deque<TreeNode> stack = new ArrayDeque<>();

    public BSTIterator(TreeNode root) {
        pushLeft(root);
    }

    public int next() {
        TreeNode node = stack.pop();
        pushLeft(node.right);
        return node.val;
    }

    public boolean hasNext() {
        return !stack.isEmpty();
    }

    private void pushLeft(TreeNode node) {
        while (node != null) {
            stack.push(node);
            node = node.left;
        }
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 */
var BSTIterator = function(root) {
    this.stack = [];
    this.pushLeft(root);
};

BSTIterator.prototype.pushLeft = function(node) {
    while (node) {
        this.stack.push(node);
        node = node.left;
    }
};

/**
 * @return {number}
 */
BSTIterator.prototype.next = function() {
    const node = this.stack.pop();
    this.pushLeft(node.right);
    return node.val;
};

/**
 * @return {boolean}
 */
BSTIterator.prototype.hasNext = function() {
    return this.stack.length > 0;
};`,
    python: `class BSTIterator:
    def __init__(self, root: Optional[TreeNode]):
        self.stack = []
        self._push_left(root)

    def _push_left(self, node):
        while node:
            self.stack.append(node)
            node = node.left

    def next(self) -> int:
        node = self.stack.pop()
        self._push_left(node.right)
        return node.val

    def hasNext(self) -> bool:
        return len(self.stack) > 0`,
    cpp: `class BSTIterator {
    stack<TreeNode*> st;
    void pushLeft(TreeNode* node) {
        while (node) {
            st.push(node);
            node = node->left;
        }
    }
public:
    BSTIterator(TreeNode* root) {
        pushLeft(root);
    }

    int next() {
        TreeNode* node = st.top();
        st.pop();
        pushLeft(node->right);
        return node->val;
    }

    bool hasNext() {
        return !st.empty();
    }
};`,
  },
  {
    id: 'reverse-list', title: 'Reverse Linked List',
    tests: [{ input: 'head = [1,2,3,4,5]', expected: [5, 4, 3, 2, 1] }, { input: 'head = [1,2]', expected: [2, 1] }, { input: 'head = []', expected: [] }],
    java: `class Solution {
    public ListNode reverseList(ListNode head) {
        ListNode prev = null;
        while (head != null) {
            ListNode next = head.next;
            head.next = prev;
            prev = head;
            head = next;
        }
        return prev;
    }
}`,
    javascript: `/**
 * @param {ListNode} head
 * @return {ListNode}
 */
var reverseList = function(head) {
    let prev = null;
    while (head) {
        const next = head.next;
        head.next = prev;
        prev = head;
        head = next;
    }
    return prev;
};`,
    python: `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        while head:
            nxt = head.next
            head.next = prev
            prev = head
            head = nxt
        return prev`,
    cpp: `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        while (head) {
            ListNode* next = head->next;
            head->next = prev;
            prev = head;
            head = next;
        }
        return prev;
    }
};`,
    c: `struct ListNode* reverseList(struct ListNode* head) {
    struct ListNode* prev = NULL;
    while (head) {
        struct ListNode* next = head->next;
        head->next = prev;
        prev = head;
        head = next;
    }
    return prev;
}`,
  },
];
