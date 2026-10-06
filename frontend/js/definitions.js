// Online judges ship some classes with the problem (ListNode, TreeNode, Node, ...) and never show them in the editor.
// The "Definitions" tab holds them, so the solution can be pasted exactly as the judge presents it. The text there is
// compiled/evaluated *before* the solution, is never traced, and never shifts the solution's line numbers.
//
// Each preset is one of the standard judge class definitions, per language. `kind` tells the test-case parser how a
// judge-style array is turned into that structure (see the engines' builders).

const P = {};

// ------------------------------------------------------------------------------------------------ Java

P.java = {
  ListNode: `class ListNode {
    int val;
    ListNode next;
    ListNode() {}
    ListNode(int val) { this.val = val; }
    ListNode(int val, ListNode next) { this.val = val; this.next = next; }
}
`,
  TreeNode: `class TreeNode {
    int val;
    TreeNode left;
    TreeNode right;
    TreeNode() {}
    TreeNode(int val) { this.val = val; }
    TreeNode(int val, TreeNode left, TreeNode right) {
        this.val = val;
        this.left = left;
        this.right = right;
    }
}
`,
  nary: `class Node {
    public int val;
    public List<Node> children;

    public Node() {}
    public Node(int _val) { val = _val; }
    public Node(int _val, List<Node> _children) {
        val = _val;
        children = _children;
    }
}
`,
  graph: `class Node {
    public int val;
    public List<Node> neighbors;

    public Node() {
        val = 0;
        neighbors = new ArrayList<Node>();
    }
    public Node(int _val) {
        val = _val;
        neighbors = new ArrayList<Node>();
    }
    public Node(int _val, ArrayList<Node> _neighbors) {
        val = _val;
        neighbors = _neighbors;
    }
}
`,
  random: `class Node {
    int val;
    Node next;
    Node random;

    public Node(int val) {
        this.val = val;
        this.next = null;
        this.random = null;
    }
}
`,
  nextptr: `class Node {
    public int val;
    public Node left;
    public Node right;
    public Node next;

    public Node() {}
    public Node(int _val) { val = _val; }
    public Node(int _val, Node _left, Node _right, Node _next) {
        val = _val;
        left = _left;
        right = _right;
        next = _next;
    }
}
`,
  multilevel: `class Node {
    public int val;
    public Node prev;
    public Node next;
    public Node child;
}
`,
};

// ------------------------------------------------------------------------------------------------ JavaScript

P.javascript = {
  ListNode: `function ListNode(val, next) {
    this.val = (val === undefined ? 0 : val);
    this.next = (next === undefined ? null : next);
}
`,
  TreeNode: `function TreeNode(val, left, right) {
    this.val = (val === undefined ? 0 : val);
    this.left = (left === undefined ? null : left);
    this.right = (right === undefined ? null : right);
}
`,
  nary: `function Node(val, children) {
    this.val = val;
    this.children = children;
}
`,
  graph: `function Node(val, neighbors) {
    this.val = val === undefined ? 0 : val;
    this.neighbors = neighbors === undefined ? [] : neighbors;
}
`,
  random: `function Node(val, next, random) {
    this.val = val;
    this.next = next;
    this.random = random;
}
`,
  nextptr: `function Node(val, left, right, next) {
    this.val = val === undefined ? null : val;
    this.left = left === undefined ? null : left;
    this.right = right === undefined ? null : right;
    this.next = next === undefined ? null : next;
}
`,
  multilevel: `function Node(val, prev, next, child) {
    this.val = val;
    this.prev = prev;
    this.next = next;
    this.child = child;
}
`,
};

// ------------------------------------------------------------------------------------------------ Python

P.python = {
  ListNode: `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
`,
  TreeNode: `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
`,
  nary: `class Node:
    def __init__(self, val=None, children=None):
        self.val = val
        self.children = children
`,
  graph: `class Node:
    def __init__(self, val=0, neighbors=None):
        self.val = val
        self.neighbors = neighbors if neighbors is not None else []
`,
  random: `class Node:
    def __init__(self, x: int, next: 'Node' = None, random: 'Node' = None):
        self.val = int(x)
        self.next = next
        self.random = random
`,
  nextptr: `class Node:
    def __init__(self, val: int = 0, left: 'Node' = None, right: 'Node' = None, next: 'Node' = None):
        self.val = val
        self.left = left
        self.right = right
        self.next = next
`,
  multilevel: `class Node:
    def __init__(self, val, prev, next, child):
        self.val = val
        self.prev = prev
        self.next = next
        self.child = child
`,
};

// ------------------------------------------------------------------------------------------------ C++

P.cpp = {
  ListNode: `struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};
`,
  TreeNode: `struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};
`,
  nary: `class Node {
public:
    int val;
    vector<Node*> children;

    Node() {}
    Node(int _val) {
        val = _val;
    }
    Node(int _val, vector<Node*> _children) {
        val = _val;
        children = _children;
    }
};
`,
  graph: `class Node {
public:
    int val;
    vector<Node*> neighbors;
    Node() {
        val = 0;
        neighbors = vector<Node*>();
    }
    Node(int _val) {
        val = _val;
        neighbors = vector<Node*>();
    }
    Node(int _val, vector<Node*> _neighbors) {
        val = _val;
        neighbors = _neighbors;
    }
};
`,
  random: `class Node {
public:
    int val;
    Node* next;
    Node* random;

    Node(int _val) {
        val = _val;
        next = NULL;
        random = NULL;
    }
};
`,
  nextptr: `class Node {
public:
    int val;
    Node* left;
    Node* right;
    Node* next;

    Node() : val(0), left(NULL), right(NULL), next(NULL) {}
    Node(int _val) : val(_val), left(NULL), right(NULL), next(NULL) {}
    Node(int _val, Node* _left, Node* _right, Node* _next)
        : val(_val), left(_left), right(_right), next(_next) {}
};
`,
  multilevel: `class Node {
public:
    int val;
    Node* prev;
    Node* next;
    Node* child;
};
`,
};

// ------------------------------------------------------------------------------------------------ C

P.c = {
  ListNode: `struct ListNode {
    int val;
    struct ListNode *next;
};
`,
  TreeNode: `struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
};
`,
  nary: `struct Node {
    int val;
    int numChildren;
    struct Node** children;
};
`,
  graph: `struct Node {
    int val;
    int numNeighbors;
    struct Node** neighbors;
};
`,
  random: `struct Node {
    int val;
    struct Node *next;
    struct Node *random;
};
`,
  nextptr: `struct Node {
    int val;
    struct Node *left;
    struct Node *right;
    struct Node *next;
};
`,
  multilevel: `struct Node {
    int val;
    struct Node *prev;
    struct Node *next;
    struct Node *child;
};
`,
};

/** id -> {label, className, kind}; `kind` drives how test-case arrays are built into the structure. */
export const PRESET_INFO = {
  ListNode: { label: 'ListNode — singly linked list', className: 'ListNode', kind: 'list' },
  TreeNode: { label: 'TreeNode — binary tree', className: 'TreeNode', kind: 'tree' },
  nary: { label: 'Node — N-ary tree (children)', className: 'Node', kind: 'nary' },
  graph: { label: 'Node — graph (neighbors)', className: 'Node', kind: 'graph' },
  random: { label: 'Node — list with random pointer', className: 'Node', kind: 'random' },
  nextptr: { label: 'Node — tree with next pointers', className: 'Node', kind: 'nextptr' },
  multilevel: { label: 'Node — multilevel doubly linked list', className: 'Node', kind: 'multilevel' },
};

export const PRESET_IDS = Object.keys(PRESET_INFO);

export function presetCode(lang, id) {
  return (P[lang] && P[lang][id]) || '';
}

const mask = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ')
  .replace(/^\s*#[^\n]*/gm, (m) => (/^\s*#\s*(define|include)/.test(m) ? m : ' '))
  .replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""');

function pyMask(code) {
  return code.replace(/#[^\n]*/g, ' ').replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, ' ').replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, '""');
}

/**
 * The text where type names count as uses. JavaScript keeps its JSDoc (`@param {TreeNode}`, `{_Node}`) and Python keeps
 * its annotation strings (`'Node'`), because that is often the only place a judge's templates name the class.
 */
function typeText(lang, code) {
  if (lang === 'python') return code.replace(/#[^\n]*/g, ' ');
  if (lang === 'javascript') return code.replace(/\/\/[^\n]*/g, ' ');
  return mask(code);
}

/** Whether `name` is declared as a type in this source. */
export function declares(lang, code, name) {
  const t = lang === 'python' ? pyMask(code) : mask(code);
  const n = name.replace(/\$/g, '\\$');
  if (new RegExp(`\\b(?:class|struct|interface|enum|record|def|function|typedef\\s+struct)\\s+${n}\\b`).test(t)) return true;
  if (new RegExp(`\\b(?:var|let|const)\\s+${n}\\s*=`).test(t)) return true;
  if (new RegExp(`\\busing\\s+${n}\\s*=`).test(t)) return true;
  if (new RegExp(`}\\s*${n}\\s*;`).test(t)) return true; // typedef struct { ... } Name;
  return false;
}

/** The preset a bare `Node` in this solution most likely refers to, judged from how it is used. */
function nodePreset(code) {
  if (/\bchildren\b/.test(code)) return 'nary';
  if (/\bneighbou?rs\b/.test(code)) return 'graph';
  if (/\brandom\b/.test(code)) return 'random';
  if (/\bchild\b/.test(code)) return 'multilevel';
  if (/\b(left|right)\b/.test(code) && /\bnext\b/.test(code)) return 'nextptr';
  return 'random';
}

/**
 * Presets the solution uses but that nothing declares yet (neither the solution nor the definitions text).
 * @returns {string[]} preset ids
 */
export function missingPresets(lang, code, defs = '') {
  const used = typeText(lang, code);
  const known = (n) => declares(lang, code, n) || declares(lang, defs, n);
  const out = [];
  if (/\bListNode\b/.test(used) && !known('ListNode')) out.push('ListNode');
  if (/\bTreeNode\b/.test(used) && !known('TreeNode')) out.push('TreeNode');
  if (/\b_?Node\b/.test(used) && !known('Node')) out.push(nodePreset(used));
  return out;
}

/** Definitions text for the presets a solution needs (used when loading examples and switching language). */
export function defaultDefinitions(lang, code) {
  return missingPresets(lang, code, '').map((id) => presetCode(lang, id)).join('\n');
}

/** The kind of structure a class name stands for, according to the definitions (for building test inputs). */
export function structureKinds(defs) {
  const kinds = {};
  if (/\bTreeNode\b/.test(defs)) kinds.TreeNode = 'tree';
  if (/\bListNode\b/.test(defs)) kinds.ListNode = 'list';
  const m = /\bNode\b/.test(defs);
  if (m) {
    if (/\bchildren\b/.test(defs)) kinds.Node = 'nary';
    else if (/\bneighbou?rs\b/.test(defs)) kinds.Node = 'graph';
    else if (/\brandom\b/.test(defs)) kinds.Node = 'random';
    else if (/\bchild\b/.test(defs)) kinds.Node = 'multilevel';
    else if (/\b(left|right)\b/.test(defs)) kinds.Node = 'nextptr';
    else kinds.Node = 'list';
  }
  return kinds;
}
