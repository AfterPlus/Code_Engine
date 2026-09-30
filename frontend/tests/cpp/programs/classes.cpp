#include <bits/stdc++.h>
using namespace std;

struct ListNode {
    int val;
    ListNode* next;
    ListNode(int x) : val(x), next(nullptr) {}
};

struct TreeNode {
    int val;
    TreeNode *left, *right;
    TreeNode(int v = 0) : val(v), left(nullptr), right(nullptr) {}
};

class Animal {
public:
    string name;
    Animal(string n) : name(n) {}
    virtual string sound() { return "..."; }
    string describe() { return name + " says " + sound(); }
};
class Dog : public Animal {
public:
    Dog(string n) : Animal(n) {}
    string sound() override { return "woof"; }
};

class Counter {
    int n;
    static int instances;
public:
    Counter() : n(0) { instances++; }
    Counter& inc() { n++; return *this; }
    int get() const { return n; }
    static int count() { return instances; }
};
int Counter::instances = 0;

struct Vec2 {
    double x, y;
    Vec2(double x = 0, double y = 0) : x(x), y(y) {}
    Vec2 operator+(const Vec2& o) const { return Vec2(x + o.x, y + o.y); }
    Vec2 operator*(double k) const { return Vec2(x * k, y * k); }
    bool operator==(const Vec2& o) const { return x == o.x && y == o.y; }
};

template <typename T>
T maxOf(T a, T b) { return a > b ? a : b; }

template <typename T>
struct Box {
    T value;
    Box(T v) : value(v) {}
    T get() { return value; }
};

ListNode* build(vector<int> v) {
    ListNode dummy(0);
    ListNode* cur = &dummy;
    for (int x : v) { cur->next = new ListNode(x); cur = cur->next; }
    return dummy.next;
}

ListNode* reverseList(ListNode* head) {
    ListNode* prev = nullptr;
    while (head) {
        ListNode* nxt = head->next;
        head->next = prev;
        prev = head;
        head = nxt;
    }
    return prev;
}

TreeNode* insert(TreeNode* root, int v) {
    if (!root) return new TreeNode(v);
    if (v < root->val) root->left = insert(root->left, v);
    else root->right = insert(root->right, v);
    return root;
}
void inorder(TreeNode* r, vector<int>& out) {
    if (!r) return;
    inorder(r->left, out);
    out.push_back(r->val);
    inorder(r->right, out);
}
int height(TreeNode* r) { return r ? 1 + max(height(r->left), height(r->right)) : 0; }

void swapInts(int& a, int& b) { int t = a; a = b; b = t; }
void addOne(vector<int>& v) { for (int& x : v) x++; }
void noEffect(vector<int> v) { v.push_back(99); }
int sumPtr(int* arr, int n) { int s = 0; for (int i = 0; i < n; i++) s += arr[i]; return s; }

int main() {
    ListNode* head = build({1, 2, 3, 4});
    head = reverseList(head);
    for (ListNode* p = head; p; p = p->next) cout << p->val << " ";
    cout << endl;

    TreeNode* root = nullptr;
    for (int v : {5, 3, 8, 1, 4, 9, 7}) root = insert(root, v);
    vector<int> out;
    inorder(root, out);
    for (int x : out) cout << x << " ";
    cout << "h=" << height(root) << endl;

    Animal a("cat");
    Dog d("rex");
    cout << a.describe() << " / " << d.describe() << endl;
    Animal* ap = &d;
    cout << ap->sound() << endl;

    Counter c1, c2;
    c1.inc().inc().inc();
    cout << c1.get() << c2.get() << " " << Counter::count() << endl;

    Vec2 p(1, 2), q(3, 4);
    Vec2 r = p + q * 2;
    cout << r.x << "," << r.y << " " << (r == Vec2(7, 10)) << endl;

    cout << maxOf(3, 7) << " " << maxOf(2.5, 1.5) << " " << maxOf<string>("a", "b") << endl;
    Box<int> bi(5);
    Box<string> bs("hi");
    cout << bi.get() + 1 << bs.get() << endl;

    int x = 1, y = 2;
    swapInts(x, y);
    cout << x << y << endl;
    vector<int> v = {1, 2, 3};
    addOne(v);
    noEffect(v);
    cout << v.size() << v[0] << endl;
    int arr[5] = {1, 2, 3, 4, 5};
    cout << sumPtr(arr, 5) << " " << sumPtr(arr + 2, 3) << endl;
    int* dyn = new int[4];
    for (int i = 0; i < 4; i++) dyn[i] = i * i;
    cout << dyn[3] << " " << *(dyn + 2) << endl;
    delete[] dyn;
    int* single = new int(42);
    *single += 1;
    cout << *single << endl;
    delete single;
    int val = 10;
    int* pv = &val;
    *pv = 20;
    cout << val << endl;
    int** pp = &pv;
    **pp = 30;
    cout << val << endl;

    auto fact = [](int n) { int r = 1; for (int i = 2; i <= n; i++) r *= i; return r; };
    cout << fact(5) << endl;
    int base = 100;
    auto addBase = [base](int v) { return v + base; };
    auto addRef = [&base](int v) { base += v; return base; };
    base = 200;
    cout << addBase(1) << " " << addRef(5) << " " << base << endl;
    function<int(int)> fib = [&](int n) -> int { return n < 2 ? n : fib(n - 1) + fib(n - 2); };
    cout << fib(15) << endl;
    function<void(TreeNode*, int)> dfs = [&](TreeNode* n, int depth) {
        if (!n) return;
        cout << n->val << "@" << depth << " ";
        dfs(n->left, depth + 1);
        dfs(n->right, depth + 1);
    };
    dfs(root, 0);
    cout << endl;
    enum Color { RED, GREEN = 5, BLUE };
    Color cc = BLUE;
    cout << cc << " " << (cc == BLUE) << " " << GREEN << endl;
    switch (cc) {
        case RED: cout << "red"; break;
        case BLUE: cout << "blue";
        case GREEN: cout << "+green"; break;
        default: cout << "none";
    }
    cout << endl;
    int i = 0;
    do { i += 3; } while (i < 10);
    cout << i << endl;
    try {
        vector<int> e;
        e.at(3);
    } catch (const out_of_range& ex) {
        cout << "caught" << endl;
    }
    try { throw 42; } catch (int n) { cout << "int " << n << endl; }
    return 0;
}
