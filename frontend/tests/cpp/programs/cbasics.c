#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <limits.h>

struct Node {
    int val;
    struct Node* next;
};

typedef struct TreeNode {
    int val;
    struct TreeNode *left;
    struct TreeNode *right;
} TreeNode;

struct Node* push(struct Node* head, int v) {
    struct Node* n = (struct Node*)malloc(sizeof(struct Node));
    n->val = v;
    n->next = head;
    return n;
}

TreeNode* newNode(int v) {
    TreeNode* t = malloc(sizeof(TreeNode));
    t->val = v;
    t->left = NULL;
    t->right = NULL;
    return t;
}

TreeNode* insertBST(TreeNode* root, int v) {
    if (!root) return newNode(v);
    if (v < root->val) root->left = insertBST(root->left, v);
    else root->right = insertBST(root->right, v);
    return root;
}

int height(TreeNode* r) {
    if (r == NULL) return 0;
    int l = height(r->left), rr = height(r->right);
    return 1 + (l > rr ? l : rr);
}

void inorder(TreeNode* r) {
    if (!r) return;
    inorder(r->left);
    printf("%d ", r->val);
    inorder(r->right);
}

int cmp(const void* a, const void* b) { return *(int*)a - *(int*)b; }

int sum(int* a, int n) {
    int s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}

int main() {
    int a = 7, b = 2;
    printf("%d %d %d %.2f\n", a / b, a % b, -a / b, (double)a / b);
    long long big = 1LL << 40;
    printf("%lld %d\n", big, INT_MAX);
    unsigned int u = 0;
    u--;
    printf("%u\n", u);
    char c = 'a' + 3;
    printf("%c %d\n", c, c);

    int arr[6] = {5, 2, 9, 1, 7, 3};
    qsort(arr, 6, sizeof(int), cmp);
    for (int i = 0; i < 6; i++) printf("%d ", arr[i]);
    printf("\n%d %d\n", sum(arr, 6), sum(arr + 3, 3));
    int n = sizeof(arr) / sizeof(arr[0]);
    printf("n=%d\n", n);

    int* dyn = (int*)malloc(5 * sizeof(int));
    for (int i = 0; i < 5; i++) dyn[i] = i * 10;
    printf("%d %d\n", dyn[4], *(dyn + 2));
    free(dyn);

    int** grid = (int**)malloc(3 * sizeof(int*));
    for (int i = 0; i < 3; i++) {
        grid[i] = (int*)malloc(3 * sizeof(int));
        for (int j = 0; j < 3; j++) grid[i][j] = i * 3 + j;
    }
    printf("%d %d\n", grid[1][1], grid[2][0]);

    struct Node* head = NULL;
    for (int i = 1; i <= 4; i++) head = push(head, i);
    for (struct Node* p = head; p != NULL; p = p->next) printf("%d ", p->val);
    printf("\n");

    TreeNode* root = NULL;
    int vals[] = {5, 3, 8, 1, 4};
    for (int i = 0; i < 5; i++) root = insertBST(root, vals[i]);
    inorder(root);
    printf("h=%d\n", height(root));

    char s[20] = "hello";
    strcat(s, " world");
    printf("%s %d %d\n", s, (int)strlen(s), strcmp("abc", "abd"));
    char t[20];
    strcpy(t, s);
    t[0] = 'J';
    printf("%s %s\n", s, t);
    int counts[26];
    memset(counts, 0, sizeof(counts));
    for (int i = 0; s[i]; i++) if (s[i] >= 'a' && s[i] <= 'z') counts[s[i] - 'a']++;
    printf("%d %d\n", counts['l' - 'a'], counts['o' - 'a']);
    bool flag = a > b;
    printf("%d %s\n", flag, flag ? "true" : "false");
    int x = 5, *px = &x;
    *px += 10;
    printf("%d\n", x);
    return 0;
}
