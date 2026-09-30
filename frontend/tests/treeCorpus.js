// LeetCode tree problems in every language, written the way LeetCode's own templates are (no TreeNode / ListNode /
// Node definitions in the solution: those live in the Definitions tab, see js/definitions.js).
//
// Used by tests/engines.mjs. Fields: id, title, tests [{input, expected}], and java / javascript / python / cpp / c
// (a language with no version is skipped). `unordered` compares arrays as multisets.

export const TREE_CORPUS = [
  // ============================================================================ binary trees
  {
    id: 'max-depth', title: '104. Maximum Depth of Binary Tree',
    tests: [{ input: 'root = [3,9,20,null,null,15,7]', expected: 3 }, { input: 'root = [1,null,2]', expected: 2 }, { input: 'root = []', expected: 0 }],
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
    if (root === null) return 0;
    const left = maxDepth(root.left);
    const right = maxDepth(root.right);
    return 1 + Math.max(left, right);
};`,
    python: `class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if not root:
            return 0
        left = self.maxDepth(root.left)
        right = self.maxDepth(root.right)
        return 1 + max(left, right)`,
    cpp: `class Solution {
public:
    int maxDepth(TreeNode* root) {
        if (root == nullptr) return 0;
        int left = maxDepth(root->left);
        int right = maxDepth(root->right);
        return 1 + max(left, right);
    }
};`,
    c: `int maxDepth(struct TreeNode* root) {
    if (root == NULL) return 0;
    int left = maxDepth(root->left);
    int right = maxDepth(root->right);
    return 1 + (left > right ? left : right);
}`,
  },
  {
    id: 'invert-tree', title: '226. Invert Binary Tree',
    tests: [{ input: 'root = [4,2,7,1,3,6,9]', expected: [4, 7, 2, 9, 6, 3, 1] }, { input: 'root = [2,1,3]', expected: [2, 3, 1] }, { input: 'root = []', expected: [] }],
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
    if (root === null) return null;
    const tmp = root.left;
    root.left = invertTree(root.right);
    root.right = invertTree(tmp);
    return root;
};`,
    python: `class Solution:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if not root:
            return None
        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root`,
    cpp: `class Solution {
public:
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;
        TreeNode* tmp = root->left;
        root->left = invertTree(root->right);
        root->right = invertTree(tmp);
        return root;
    }
};`,
    c: `struct TreeNode* invertTree(struct TreeNode* root) {
    if (root == NULL) return NULL;
    struct TreeNode* tmp = root->left;
    root->left = invertTree(root->right);
    root->right = invertTree(tmp);
    return root;
}`,
  },
  {
    id: 'same-tree', title: '100. Same Tree',
    tests: [{ input: 'p = [1,2,3], q = [1,2,3]', expected: true }, { input: 'p = [1,2], q = [1,null,2]', expected: false }, { input: 'p = [1,2,1], q = [1,1,2]', expected: false }],
    java: `class Solution {
    public boolean isSameTree(TreeNode p, TreeNode q) {
        if (p == null && q == null) return true;
        if (p == null || q == null || p.val != q.val) return false;
        return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
    }
}`,
    javascript: `/**
 * @param {TreeNode} p
 * @param {TreeNode} q
 * @return {boolean}
 */
var isSameTree = function(p, q) {
    if (p === null && q === null) return true;
    if (p === null || q === null || p.val !== q.val) return false;
    return isSameTree(p.left, q.left) && isSameTree(p.right, q.right);
};`,
    python: `class Solution:
    def isSameTree(self, p: Optional[TreeNode], q: Optional[TreeNode]) -> bool:
        if not p and not q:
            return True
        if not p or not q or p.val != q.val:
            return False
        return self.isSameTree(p.left, q.left) and self.isSameTree(p.right, q.right)`,
    cpp: `class Solution {
public:
    bool isSameTree(TreeNode* p, TreeNode* q) {
        if (!p && !q) return true;
        if (!p || !q || p->val != q->val) return false;
        return isSameTree(p->left, q->left) && isSameTree(p->right, q->right);
    }
};`,
    c: `bool isSameTree(struct TreeNode* p, struct TreeNode* q) {
    if (!p && !q) return true;
    if (!p || !q || p->val != q->val) return false;
    return isSameTree(p->left, q->left) && isSameTree(p->right, q->right);
}`,
  },
  {
    id: 'symmetric-tree', title: '101. Symmetric Tree',
    tests: [{ input: 'root = [1,2,2,3,4,4,3]', expected: true }, { input: 'root = [1,2,2,null,3,null,3]', expected: false }],
    java: `class Solution {
    public boolean isSymmetric(TreeNode root) {
        return root == null || mirror(root.left, root.right);
    }

    private boolean mirror(TreeNode a, TreeNode b) {
        if (a == null && b == null) return true;
        if (a == null || b == null || a.val != b.val) return false;
        return mirror(a.left, b.right) && mirror(a.right, b.left);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {boolean}
 */
var isSymmetric = function(root) {
    const mirror = (a, b) => {
        if (!a && !b) return true;
        if (!a || !b || a.val !== b.val) return false;
        return mirror(a.left, b.right) && mirror(a.right, b.left);
    };
    return root === null || mirror(root.left, root.right);
};`,
    python: `class Solution:
    def isSymmetric(self, root: Optional[TreeNode]) -> bool:
        def mirror(a, b):
            if not a and not b:
                return True
            if not a or not b or a.val != b.val:
                return False
            return mirror(a.left, b.right) and mirror(a.right, b.left)
        return root is None or mirror(root.left, root.right)`,
    cpp: `class Solution {
    bool mirror(TreeNode* a, TreeNode* b) {
        if (!a && !b) return true;
        if (!a || !b || a->val != b->val) return false;
        return mirror(a->left, b->right) && mirror(a->right, b->left);
    }
public:
    bool isSymmetric(TreeNode* root) {
        return !root || mirror(root->left, root->right);
    }
};`,
    c: `bool mirror(struct TreeNode* a, struct TreeNode* b) {
    if (!a && !b) return true;
    if (!a || !b || a->val != b->val) return false;
    return mirror(a->left, b->right) && mirror(a->right, b->left);
}

bool isSymmetric(struct TreeNode* root) {
    return !root || mirror(root->left, root->right);
}`,
  },
  {
    id: 'inorder-recursive', title: '94. Binary Tree Inorder Traversal (recursive)',
    tests: [{ input: 'root = [1,null,2,3]', expected: [1, 3, 2] }, { input: 'root = []', expected: [] }, { input: 'root = [1]', expected: [1] }],
    java: `class Solution {
    public List<Integer> inorderTraversal(TreeNode root) {
        List<Integer> res = new ArrayList<>();
        walk(root, res);
        return res;
    }

    private void walk(TreeNode node, List<Integer> res) {
        if (node == null) return;
        walk(node.left, res);
        res.add(node.val);
        walk(node.right, res);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number[]}
 */
var inorderTraversal = function(root) {
    const res = [];
    const walk = (node) => {
        if (!node) return;
        walk(node.left);
        res.push(node.val);
        walk(node.right);
    };
    walk(root);
    return res;
};`,
    python: `class Solution:
    def inorderTraversal(self, root: Optional[TreeNode]) -> List[int]:
        res = []
        def walk(node):
            if not node:
                return
            walk(node.left)
            res.append(node.val)
            walk(node.right)
        walk(root)
        return res`,
    cpp: `class Solution {
    void walk(TreeNode* node, vector<int>& res) {
        if (!node) return;
        walk(node->left, res);
        res.push_back(node->val);
        walk(node->right, res);
    }
public:
    vector<int> inorderTraversal(TreeNode* root) {
        vector<int> res;
        walk(root, res);
        return res;
    }
};`,
    c: `void walk(struct TreeNode* node, int* res, int* n) {
    if (!node) return;
    walk(node->left, res, n);
    res[(*n)++] = node->val;
    walk(node->right, res, n);
}

int* inorderTraversal(struct TreeNode* root, int* returnSize) {
    int* res = malloc(100 * sizeof(int));
    *returnSize = 0;
    walk(root, res, returnSize);
    return res;
}`,
  },
  {
    id: 'inorder-iterative', title: '94. Binary Tree Inorder Traversal (iterative, explicit stack)',
    tests: [{ input: 'root = [1,null,2,3]', expected: [1, 3, 2] }, { input: 'root = [1,2,3,4,5,null,8,null,null,6,7,9]', expected: [4, 2, 6, 5, 7, 1, 3, 9, 8] }],
    java: `class Solution {
    public List<Integer> inorderTraversal(TreeNode root) {
        List<Integer> res = new ArrayList<>();
        Deque<TreeNode> stack = new ArrayDeque<>();
        TreeNode cur = root;
        while (cur != null || !stack.isEmpty()) {
            while (cur != null) {
                stack.push(cur);
                cur = cur.left;
            }
            cur = stack.pop();
            res.add(cur.val);
            cur = cur.right;
        }
        return res;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number[]}
 */
var inorderTraversal = function(root) {
    const res = [];
    const stack = [];
    let cur = root;
    while (cur !== null || stack.length > 0) {
        while (cur !== null) {
            stack.push(cur);
            cur = cur.left;
        }
        cur = stack.pop();
        res.push(cur.val);
        cur = cur.right;
    }
    return res;
};`,
    python: `class Solution:
    def inorderTraversal(self, root: Optional[TreeNode]) -> List[int]:
        res = []
        stack = []
        cur = root
        while cur or stack:
            while cur:
                stack.append(cur)
                cur = cur.left
            cur = stack.pop()
            res.append(cur.val)
            cur = cur.right
        return res`,
    cpp: `class Solution {
public:
    vector<int> inorderTraversal(TreeNode* root) {
        vector<int> res;
        stack<TreeNode*> st;
        TreeNode* cur = root;
        while (cur || !st.empty()) {
            while (cur) {
                st.push(cur);
                cur = cur->left;
            }
            cur = st.top();
            st.pop();
            res.push_back(cur->val);
            cur = cur->right;
        }
        return res;
    }
};`,
  },
  {
    id: 'level-order', title: '102. Binary Tree Level Order Traversal (BFS)',
    tests: [{ input: 'root = [3,9,20,null,null,15,7]', expected: [[3], [9, 20], [15, 7]] }, { input: 'root = [1]', expected: [[1]] }, { input: 'root = []', expected: [] }],
    java: `class Solution {
    public List<List<Integer>> levelOrder(TreeNode root) {
        List<List<Integer>> res = new ArrayList<>();
        if (root == null) return res;
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
            res.add(level);
        }
        return res;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number[][]}
 */
var levelOrder = function(root) {
    const res = [];
    if (!root) return res;
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
        res.push(level);
    }
    return res;
};`,
    python: `class Solution:
    def levelOrder(self, root: Optional[TreeNode]) -> List[List[int]]:
        res = []
        if not root:
            return res
        queue = deque([root])
        while queue:
            level = []
            for _ in range(len(queue)):
                node = queue.popleft()
                level.append(node.val)
                if node.left:
                    queue.append(node.left)
                if node.right:
                    queue.append(node.right)
            res.append(level)
        return res`,
    cpp: `class Solution {
public:
    vector<vector<int>> levelOrder(TreeNode* root) {
        vector<vector<int>> res;
        if (!root) return res;
        queue<TreeNode*> q;
        q.push(root);
        while (!q.empty()) {
            int size = q.size();
            vector<int> level;
            for (int i = 0; i < size; i++) {
                TreeNode* node = q.front();
                q.pop();
                level.push_back(node->val);
                if (node->left) q.push(node->left);
                if (node->right) q.push(node->right);
            }
            res.push_back(level);
        }
        return res;
    }
};`,
  },
  {
    id: 'path-sum', title: '112. Path Sum',
    tests: [{ input: 'root = [5,4,8,11,null,13,4,7,2,null,null,null,1], targetSum = 22', expected: true }, { input: 'root = [1,2,3], targetSum = 5', expected: false }, { input: 'root = [], targetSum = 0', expected: false }],
    java: `class Solution {
    public boolean hasPathSum(TreeNode root, int targetSum) {
        if (root == null) return false;
        if (root.left == null && root.right == null) return root.val == targetSum;
        return hasPathSum(root.left, targetSum - root.val) || hasPathSum(root.right, targetSum - root.val);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {number} targetSum
 * @return {boolean}
 */
var hasPathSum = function(root, targetSum) {
    if (!root) return false;
    if (!root.left && !root.right) return root.val === targetSum;
    return hasPathSum(root.left, targetSum - root.val) || hasPathSum(root.right, targetSum - root.val);
};`,
    python: `class Solution:
    def hasPathSum(self, root: Optional[TreeNode], targetSum: int) -> bool:
        if not root:
            return False
        if not root.left and not root.right:
            return root.val == targetSum
        return self.hasPathSum(root.left, targetSum - root.val) or self.hasPathSum(root.right, targetSum - root.val)`,
    cpp: `class Solution {
public:
    bool hasPathSum(TreeNode* root, int targetSum) {
        if (!root) return false;
        if (!root->left && !root->right) return root->val == targetSum;
        return hasPathSum(root->left, targetSum - root->val) || hasPathSum(root->right, targetSum - root->val);
    }
};`,
    c: `bool hasPathSum(struct TreeNode* root, int targetSum) {
    if (!root) return false;
    if (!root->left && !root->right) return root->val == targetSum;
    return hasPathSum(root->left, targetSum - root->val) || hasPathSum(root->right, targetSum - root->val);
}`,
  },
  {
    id: 'lca-bst', title: '235. Lowest Common Ancestor of a Binary Search Tree (nodes given by value)',
    tests: [
      { input: 'root = [6,2,8,0,4,7,9,null,null,3,5], p = 2, q = 8', expected: [6, 2, 8, 0, 4, 7, 9, null, null, 3, 5] },
      { input: 'root = [6,2,8,0,4,7,9,null,null,3,5], p = 2, q = 4', expected: [2, 0, 4, null, null, 3, 5] },
    ],
    java: `class Solution {
    public TreeNode lowestCommonAncestor(TreeNode root, TreeNode p, TreeNode q) {
        TreeNode cur = root;
        while (cur != null) {
            if (p.val < cur.val && q.val < cur.val) cur = cur.left;
            else if (p.val > cur.val && q.val > cur.val) cur = cur.right;
            else return cur;
        }
        return null;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @param {TreeNode} p
 * @param {TreeNode} q
 * @return {TreeNode}
 */
var lowestCommonAncestor = function(root, p, q) {
    let cur = root;
    while (cur) {
        if (p.val < cur.val && q.val < cur.val) cur = cur.left;
        else if (p.val > cur.val && q.val > cur.val) cur = cur.right;
        else return cur;
    }
    return null;
};`,
    python: `class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        cur = root
        while cur:
            if p.val < cur.val and q.val < cur.val:
                cur = cur.left
            elif p.val > cur.val and q.val > cur.val:
                cur = cur.right
            else:
                return cur
        return None`,
    cpp: `class Solution {
public:
    TreeNode* lowestCommonAncestor(TreeNode* root, TreeNode* p, TreeNode* q) {
        TreeNode* cur = root;
        while (cur) {
            if (p->val < cur->val && q->val < cur->val) cur = cur->left;
            else if (p->val > cur->val && q->val > cur->val) cur = cur->right;
            else return cur;
        }
        return nullptr;
    }
};`,
    c: `struct TreeNode* lowestCommonAncestor(struct TreeNode* root, struct TreeNode* p, struct TreeNode* q) {
    struct TreeNode* cur = root;
    while (cur) {
        if (p->val < cur->val && q->val < cur->val) cur = cur->left;
        else if (p->val > cur->val && q->val > cur->val) cur = cur->right;
        else return cur;
    }
    return NULL;
}`,
  },
  {
    id: 'lca-binary', title: '236. Lowest Common Ancestor of a Binary Tree (nodes given by value)',
    tests: [
      { input: 'root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 1', expected: [3, 5, 1, 6, 2, 0, 8, null, null, 7, 4] },
      { input: 'root = [3,5,1,6,2,0,8,null,null,7,4], p = 5, q = 4', expected: [5, 6, 2, null, null, 7, 4] },
    ],
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
    if (root === null || root === p || root === q) return root;
    const left = lowestCommonAncestor(root.left, p, q);
    const right = lowestCommonAncestor(root.right, p, q);
    if (left !== null && right !== null) return root;
    return left !== null ? left : right;
};`,
    python: `class Solution:
    def lowestCommonAncestor(self, root: 'TreeNode', p: 'TreeNode', q: 'TreeNode') -> 'TreeNode':
        if root is None or root is p or root is q:
            return root
        left = self.lowestCommonAncestor(root.left, p, q)
        right = self.lowestCommonAncestor(root.right, p, q)
        if left and right:
            return root
        return left if left else right`,
    cpp: `class Solution {
public:
    TreeNode* lowestCommonAncestor(TreeNode* root, TreeNode* p, TreeNode* q) {
        if (root == nullptr || root == p || root == q) return root;
        TreeNode* left = lowestCommonAncestor(root->left, p, q);
        TreeNode* right = lowestCommonAncestor(root->right, p, q);
        if (left && right) return root;
        return left ? left : right;
    }
};`,
    c: `struct TreeNode* lowestCommonAncestor(struct TreeNode* root, struct TreeNode* p, struct TreeNode* q) {
    if (root == NULL || root == p || root == q) return root;
    struct TreeNode* left = lowestCommonAncestor(root->left, p, q);
    struct TreeNode* right = lowestCommonAncestor(root->right, p, q);
    if (left && right) return root;
    return left ? left : right;
}`,
  },
  {
    id: 'validate-bst', title: '98. Validate Binary Search Tree',
    tests: [{ input: 'root = [2,1,3]', expected: true }, { input: 'root = [5,1,4,null,null,3,6]', expected: false }, { input: 'root = [2147483647]', expected: true }],
    java: `class Solution {
    public boolean isValidBST(TreeNode root) {
        return check(root, Long.MIN_VALUE, Long.MAX_VALUE);
    }

    private boolean check(TreeNode node, long lo, long hi) {
        if (node == null) return true;
        if (node.val <= lo || node.val >= hi) return false;
        return check(node.left, lo, node.val) && check(node.right, node.val, hi);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {boolean}
 */
var isValidBST = function(root) {
    const check = (node, lo, hi) => {
        if (!node) return true;
        if (node.val <= lo || node.val >= hi) return false;
        return check(node.left, lo, node.val) && check(node.right, node.val, hi);
    };
    return check(root, -Infinity, Infinity);
};`,
    python: `class Solution:
    def isValidBST(self, root: Optional[TreeNode]) -> bool:
        def check(node, lo, hi):
            if not node:
                return True
            if node.val <= lo or node.val >= hi:
                return False
            return check(node.left, lo, node.val) and check(node.right, node.val, hi)
        return check(root, float('-inf'), float('inf'))`,
    cpp: `class Solution {
    bool check(TreeNode* node, long long lo, long long hi) {
        if (!node) return true;
        if (node->val <= lo || node->val >= hi) return false;
        return check(node->left, lo, node->val) && check(node->right, node->val, hi);
    }
public:
    bool isValidBST(TreeNode* root) {
        return check(root, LLONG_MIN, LLONG_MAX);
    }
};`,
    c: `bool check(struct TreeNode* node, long long lo, long long hi) {
    if (!node) return true;
    if (node->val <= lo || node->val >= hi) return false;
    return check(node->left, lo, node->val) && check(node->right, node->val, hi);
}

bool isValidBST(struct TreeNode* root) {
    return check(root, LLONG_MIN, LLONG_MAX);
}`,
  },
  {
    id: 'diameter', title: '543. Diameter of Binary Tree (state kept outside the recursion)',
    tests: [{ input: 'root = [1,2,3,4,5]', expected: 3 }, { input: 'root = [1,2]', expected: 1 }],
    java: `class Solution {
    private int best = 0;

    public int diameterOfBinaryTree(TreeNode root) {
        depth(root);
        return best;
    }

    private int depth(TreeNode node) {
        if (node == null) return 0;
        int l = depth(node.left);
        int r = depth(node.right);
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
        const l = depth(node.left);
        const r = depth(node.right);
        best = Math.max(best, l + r);
        return 1 + Math.max(l, r);
    };
    depth(root);
    return best;
};`,
    python: `class Solution:
    def diameterOfBinaryTree(self, root: Optional[TreeNode]) -> int:
        best = 0
        def depth(node):
            nonlocal best
            if not node:
                return 0
            l = depth(node.left)
            r = depth(node.right)
            best = max(best, l + r)
            return 1 + max(l, r)
        depth(root)
        return best`,
    cpp: `class Solution {
    int best = 0;
    int depth(TreeNode* node) {
        if (!node) return 0;
        int l = depth(node->left);
        int r = depth(node->right);
        best = max(best, l + r);
        return 1 + max(l, r);
    }
public:
    int diameterOfBinaryTree(TreeNode* root) {
        depth(root);
        return best;
    }
};`,
    c: `int best;

int depth(struct TreeNode* node) {
    if (!node) return 0;
    int l = depth(node->left);
    int r = depth(node->right);
    if (l + r > best) best = l + r;
    return 1 + (l > r ? l : r);
}

int diameterOfBinaryTree(struct TreeNode* root) {
    best = 0;
    depth(root);
    return best;
}`,
  },
  {
    id: 'build-tree', title: '105. Construct Binary Tree from Preorder and Inorder Traversal',
    tests: [{ input: 'preorder = [3,9,20,15,7], inorder = [9,3,15,20,7]', expected: [3, 9, 20, null, null, 15, 7] }, { input: 'preorder = [-1], inorder = [-1]', expected: [-1] }],
    java: `class Solution {
    private int pre = 0;
    private Map<Integer, Integer> index = new HashMap<>();

    public TreeNode buildTree(int[] preorder, int[] inorder) {
        for (int i = 0; i < inorder.length; i++) index.put(inorder[i], i);
        return build(preorder, 0, inorder.length - 1);
    }

    private TreeNode build(int[] preorder, int lo, int hi) {
        if (lo > hi) return null;
        TreeNode node = new TreeNode(preorder[pre++]);
        int mid = index.get(node.val);
        node.left = build(preorder, lo, mid - 1);
        node.right = build(preorder, mid + 1, hi);
        return node;
    }
}`,
    javascript: `/**
 * @param {number[]} preorder
 * @param {number[]} inorder
 * @return {TreeNode}
 */
var buildTree = function(preorder, inorder) {
    const index = new Map();
    inorder.forEach((v, i) => index.set(v, i));
    let pre = 0;
    const build = (lo, hi) => {
        if (lo > hi) return null;
        const node = new TreeNode(preorder[pre++]);
        const mid = index.get(node.val);
        node.left = build(lo, mid - 1);
        node.right = build(mid + 1, hi);
        return node;
    };
    return build(0, inorder.length - 1);
};`,
    python: `class Solution:
    def buildTree(self, preorder: List[int], inorder: List[int]) -> Optional[TreeNode]:
        index = {v: i for i, v in enumerate(inorder)}
        pre = 0
        def build(lo, hi):
            nonlocal pre
            if lo > hi:
                return None
            node = TreeNode(preorder[pre])
            pre += 1
            mid = index[node.val]
            node.left = build(lo, mid - 1)
            node.right = build(mid + 1, hi)
            return node
        return build(0, len(inorder) - 1)`,
    cpp: `class Solution {
    int pre = 0;
    unordered_map<int, int> index;
    TreeNode* build(vector<int>& preorder, int lo, int hi) {
        if (lo > hi) return nullptr;
        TreeNode* node = new TreeNode(preorder[pre++]);
        int mid = index[node->val];
        node->left = build(preorder, lo, mid - 1);
        node->right = build(preorder, mid + 1, hi);
        return node;
    }
public:
    TreeNode* buildTree(vector<int>& preorder, vector<int>& inorder) {
        for (int i = 0; i < inorder.size(); i++) index[inorder[i]] = i;
        return build(preorder, 0, inorder.size() - 1);
    }
};`,
  },
  {
    id: 'kth-smallest', title: '230. Kth Smallest Element in a BST (iterative)',
    tests: [{ input: 'root = [3,1,4,null,2], k = 1', expected: 1 }, { input: 'root = [5,3,6,2,4,null,null,1], k = 3', expected: 3 }],
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
    python: `class Solution:
    def kthSmallest(self, root: Optional[TreeNode], k: int) -> int:
        stack = []
        cur = root
        while cur or stack:
            while cur:
                stack.append(cur)
                cur = cur.left
            cur = stack.pop()
            k -= 1
            if k == 0:
                return cur.val
            cur = cur.right
        return -1`,
    cpp: `class Solution {
public:
    int kthSmallest(TreeNode* root, int k) {
        stack<TreeNode*> st;
        TreeNode* cur = root;
        while (cur || !st.empty()) {
            while (cur) {
                st.push(cur);
                cur = cur->left;
            }
            cur = st.top();
            st.pop();
            if (--k == 0) return cur->val;
            cur = cur->right;
        }
        return -1;
    }
};`,
    c: `int kthSmallest(struct TreeNode* root, int k) {
    struct TreeNode* stack[100];
    int top = 0;
    struct TreeNode* cur = root;
    while (cur != NULL || top > 0) {
        while (cur != NULL) {
            stack[top++] = cur;
            cur = cur->left;
        }
        cur = stack[--top];
        if (--k == 0) return cur->val;
        cur = cur->right;
    }
    return -1;
}`,
  },
  {
    id: 'right-side-view', title: '199. Binary Tree Right Side View',
    tests: [{ input: 'root = [1,2,3,null,5,null,4]', expected: [1, 3, 4] }, { input: 'root = [1,null,3]', expected: [1, 3] }, { input: 'root = []', expected: [] }],
    java: `class Solution {
    public List<Integer> rightSideView(TreeNode root) {
        List<Integer> res = new ArrayList<>();
        Queue<TreeNode> q = new LinkedList<>();
        if (root != null) q.add(root);
        while (!q.isEmpty()) {
            int n = q.size();
            for (int i = 0; i < n; i++) {
                TreeNode node = q.poll();
                if (i == n - 1) res.add(node.val);
                if (node.left != null) q.add(node.left);
                if (node.right != null) q.add(node.right);
            }
        }
        return res;
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {number[]}
 */
var rightSideView = function(root) {
    const res = [];
    const q = root ? [root] : [];
    while (q.length) {
        const n = q.length;
        for (let i = 0; i < n; i++) {
            const node = q.shift();
            if (i === n - 1) res.push(node.val);
            if (node.left) q.push(node.left);
            if (node.right) q.push(node.right);
        }
    }
    return res;
};`,
    python: `class Solution:
    def rightSideView(self, root: Optional[TreeNode]) -> List[int]:
        res = []
        q = deque([root] if root else [])
        while q:
            n = len(q)
            for i in range(n):
                node = q.popleft()
                if i == n - 1:
                    res.append(node.val)
                if node.left:
                    q.append(node.left)
                if node.right:
                    q.append(node.right)
        return res`,
    cpp: `class Solution {
public:
    vector<int> rightSideView(TreeNode* root) {
        vector<int> res;
        queue<TreeNode*> q;
        if (root) q.push(root);
        while (!q.empty()) {
            int n = q.size();
            for (int i = 0; i < n; i++) {
                TreeNode* node = q.front();
                q.pop();
                if (i == n - 1) res.push_back(node->val);
                if (node->left) q.push(node->left);
                if (node->right) q.push(node->right);
            }
        }
        return res;
    }
};`,
  },
  {
    id: 'flatten', title: '114. Flatten Binary Tree to Linked List (in place)',
    tests: [{ input: 'root = [1,2,5,3,4,null,6]', expected: [1, null, 2, null, 3, null, 4, null, 5, null, 6] }, { input: 'root = [0]', expected: [0] }],
    java: `class Solution {
    public void flatten(TreeNode root) {
        TreeNode cur = root;
        while (cur != null) {
            if (cur.left != null) {
                TreeNode pre = cur.left;
                while (pre.right != null) pre = pre.right;
                pre.right = cur.right;
                cur.right = cur.left;
                cur.left = null;
            }
            cur = cur.right;
        }
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {void} Do not return anything, modify root in-place instead.
 */
var flatten = function(root) {
    let cur = root;
    while (cur) {
        if (cur.left) {
            let pre = cur.left;
            while (pre.right) pre = pre.right;
            pre.right = cur.right;
            cur.right = cur.left;
            cur.left = null;
        }
        cur = cur.right;
    }
};`,
    python: `class Solution:
    def flatten(self, root: Optional[TreeNode]) -> None:
        cur = root
        while cur:
            if cur.left:
                pre = cur.left
                while pre.right:
                    pre = pre.right
                pre.right = cur.right
                cur.right = cur.left
                cur.left = None
            cur = cur.right`,
    cpp: `class Solution {
public:
    void flatten(TreeNode* root) {
        TreeNode* cur = root;
        while (cur) {
            if (cur->left) {
                TreeNode* pre = cur->left;
                while (pre->right) pre = pre->right;
                pre->right = cur->right;
                cur->right = cur->left;
                cur->left = nullptr;
            }
            cur = cur->right;
        }
    }
};`,
  },
  {
    id: 'balanced', title: '110. Balanced Binary Tree',
    tests: [{ input: 'root = [3,9,20,null,null,15,7]', expected: true }, { input: 'root = [1,2,2,3,3,null,null,4,4]', expected: false }, { input: 'root = []', expected: true }],
    java: `class Solution {
    public boolean isBalanced(TreeNode root) {
        return height(root) >= 0;
    }

    private int height(TreeNode node) {
        if (node == null) return 0;
        int l = height(node.left);
        if (l < 0) return -1;
        int r = height(node.right);
        if (r < 0 || Math.abs(l - r) > 1) return -1;
        return 1 + Math.max(l, r);
    }
}`,
    javascript: `/**
 * @param {TreeNode} root
 * @return {boolean}
 */
var isBalanced = function(root) {
    const height = (node) => {
        if (!node) return 0;
        const l = height(node.left);
        if (l < 0) return -1;
        const r = height(node.right);
        if (r < 0 || Math.abs(l - r) > 1) return -1;
        return 1 + Math.max(l, r);
    };
    return height(root) >= 0;
};`,
    python: `class Solution:
    def isBalanced(self, root: Optional[TreeNode]) -> bool:
        def height(node):
            if not node:
                return 0
            l = height(node.left)
            if l < 0:
                return -1
            r = height(node.right)
            if r < 0 or abs(l - r) > 1:
                return -1
            return 1 + max(l, r)
        return height(root) >= 0`,
    cpp: `class Solution {
    int height(TreeNode* node) {
        if (!node) return 0;
        int l = height(node->left);
        if (l < 0) return -1;
        int r = height(node->right);
        if (r < 0 || abs(l - r) > 1) return -1;
        return 1 + max(l, r);
    }
public:
    bool isBalanced(TreeNode* root) {
        return height(root) >= 0;
    }
};`,
    c: `int height(struct TreeNode* node) {
    if (!node) return 0;
    int l = height(node->left);
    if (l < 0) return -1;
    int r = height(node->right);
    int d = l > r ? l - r : r - l;
    if (r < 0 || d > 1) return -1;
    return 1 + (l > r ? l : r);
}

bool isBalanced(struct TreeNode* root) {
    return height(root) >= 0;
}`,
  },
];
