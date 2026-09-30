#include <bits/stdc++.h>
using namespace std;

typedef long long ll;
const int MOD = 1000000007;
int memo[50];
vector<vector<int>> adj;

int fibm(int n) {
    if (n < 2) return n;
    if (memo[n]) return memo[n];
    return memo[n] = fibm(n - 1) + fibm(n - 2);
}

ll power(ll b, ll e, ll m) {
    ll r = 1;
    b %= m;
    while (e > 0) {
        if (e & 1) r = r * b % m;
        b = b * b % m;
        e >>= 1;
    }
    return r;
}

int lcs(const string& a, const string& b) {
    int n = a.size(), m = b.size();
    vector<vector<int>> dp(n + 1, vector<int>(m + 1, 0));
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            dp[i][j] = a[i - 1] == b[j - 1] ? dp[i - 1][j - 1] + 1 : max(dp[i - 1][j], dp[i][j - 1]);
    return dp[n][m];
}

int knap(vector<int>& w, vector<int>& v, int cap) {
    vector<int> dp(cap + 1, 0);
    for (int i = 0; i < w.size(); i++)
        for (int c = cap; c >= w[i]; c--) dp[c] = max(dp[c], dp[c - w[i]] + v[i]);
    return dp[cap];
}

int islands(vector<vector<char>>& g) {
    int n = g.size(), m = g[0].size(), cnt = 0;
    function<void(int, int)> dfs = [&](int r, int c) {
        if (r < 0 || c < 0 || r >= n || c >= m || g[r][c] != '1') return;
        g[r][c] = '0';
        dfs(r + 1, c); dfs(r - 1, c); dfs(r, c + 1); dfs(r, c - 1);
    };
    for (int i = 0; i < n; i++) for (int j = 0; j < m; j++) if (g[i][j] == '1') { cnt++; dfs(i, j); }
    return cnt;
}

vector<int> bfs(int start, int n) {
    vector<int> dist(n, -1);
    queue<int> q;
    q.push(start);
    dist[start] = 0;
    while (!q.empty()) {
        int u = q.front(); q.pop();
        for (int v : adj[u]) if (dist[v] < 0) { dist[v] = dist[u] + 1; q.push(v); }
    }
    return dist;
}

vector<int> dijkstra(int src, vector<vector<pair<int, int>>>& g) {
    vector<int> d(g.size(), INT_MAX);
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;
    d[src] = 0;
    pq.push({0, src});
    while (!pq.empty()) {
        auto [du, u] = pq.top(); pq.pop();
        if (du > d[u]) continue;
        for (auto& [v, w] : g[u]) if (d[u] + w < d[v]) { d[v] = d[u] + w; pq.push({d[v], v}); }
    }
    return d;
}

void permute(vector<int>& a, int k, vector<vector<int>>& out) {
    if (k == a.size()) { out.push_back(a); return; }
    for (int i = k; i < a.size(); i++) { swap(a[k], a[i]); permute(a, k + 1, out); swap(a[k], a[i]); }
}

bool isPalin(string s) {
    int i = 0, j = s.size() - 1;
    while (i < j) {
        while (i < j && !isalnum(s[i])) i++;
        while (i < j && !isalnum(s[j])) j--;
        if (tolower(s[i++]) != tolower(s[j--])) return false;
    }
    return true;
}

bool validParens(string s) {
    stack<char> st;
    for (char c : s) {
        if (c == '(' || c == '[' || c == '{') st.push(c);
        else {
            if (st.empty()) return false;
            char t = st.top(); st.pop();
            if ((c == ')' && t != '(') || (c == ']' && t != '[') || (c == '}' && t != '{')) return false;
        }
    }
    return st.empty();
}

int main() {
    cout << fibm(40) << " " << power(2, 100, MOD) << " " << power(3, 1000000, 998244353) << endl;
    cout << lcs("AGGTAB", "GXTXAYB") << endl;
    vector<int> w = {1, 3, 4, 5}, v = {1, 4, 5, 7};
    cout << knap(w, v, 7) << endl;
    vector<vector<char>> g = {{'1','1','0','0'},{'1','0','0','1'},{'0','0','1','1'},{'0','0','0','0'}};
    cout << islands(g) << endl;
    adj.assign(6, {});
    int edges[][2] = {{0,1},{0,2},{1,3},{2,3},{3,4}};
    for (auto& e : edges) { adj[e[0]].push_back(e[1]); adj[e[1]].push_back(e[0]); }
    for (int d : bfs(0, 6)) cout << d << " ";
    cout << endl;
    vector<vector<pair<int, int>>> wg(4);
    wg[0] = {{1, 4}, {2, 1}}; wg[2] = {{1, 2}, {3, 7}}; wg[1] = {{3, 1}};
    for (int d : dijkstra(0, wg)) cout << d << " ";
    cout << endl;
    vector<int> a = {1, 2, 3};
    vector<vector<int>> perms;
    permute(a, 0, perms);
    cout << perms.size() << " ";
    for (auto& p : perms) { for (int x : p) cout << x; cout << ","; }
    cout << endl;
    cout << isPalin("A man, a plan, a canal: Panama") << isPalin("race a car") << validParens("{[()]}") << validParens("([)]") << endl;
    ll sum = 0;
    for (int i = 1; i <= 2000; i++) sum += (ll)i * i;
    cout << sum << " " << sum % MOD << endl;
    int cnt[26] = {0};
    for (char c : string("hello world")) if (isalpha(c)) cnt[c - 'a']++;
    for (int i = 0; i < 26; i++) if (cnt[i] > 1) cout << (char)('a' + i) << cnt[i] << " ";
    cout << endl;
    string bin;
    for (int n = 37; n > 0; n /= 2) bin += char('0' + n % 2);
    reverse(bin.begin(), bin.end());
    cout << bin << " " << stoi(bin, nullptr, 2) << " " << __builtin_popcount(37) << endl;
    vector<int> nums = {2, 7, 11, 15};
    int lo = 0, hi = nums.size() - 1, target = 26;
    while (lo < hi) {
        int s = nums[lo] + nums[hi];
        if (s == target) break;
        if (s < target) lo++; else hi--;
    }
    cout << lo << " " << hi << endl;
    return 0;
}
