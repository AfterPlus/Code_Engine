#include <bits/stdc++.h>
using namespace std;

struct Point {
    int x, y;
    Point(int x, int y) : x(x), y(y) {}
    bool operator<(const Point& o) const { return x != o.x ? x < o.x : y < o.y; }
    bool operator==(const Point& o) const { return x == o.x && y == o.y; }
};

int main() {
    // map
    map<string, int> m;
    m["banana"] = 3;
    m["apple"] = 5;
    m["cherry"]++;
    m.insert({"date", 9});
    m.emplace("elder", 1);
    for (auto& [k, v] : m) cout << k << "=" << v << " ";
    cout << endl;
    cout << m.size() << " " << m.count("apple") << " " << m.count("zzz") << " " << m.at("date") << endl;
    auto it = m.find("banana");
    if (it != m.end()) cout << it->first << ":" << it->second << endl;
    m.erase("apple");
    for (auto it2 = m.begin(); it2 != m.end(); ++it2) cout << it2->first << " ";
    cout << endl;
    cout << m.begin()->first << " " << m.rbegin()->first << endl;
    cout << m.lower_bound("c")->first << " " << m.upper_bound("cherry")->first << endl;

    // unordered_map with sorted output
    unordered_map<int, vector<int>> groups;
    for (int i = 0; i < 10; i++) groups[i % 3].push_back(i);
    vector<int> keys;
    for (auto& p : groups) keys.push_back(p.first);
    sort(keys.begin(), keys.end());
    for (int k : keys) {
        cout << k << ": ";
        for (int x : groups[k]) cout << x << " ";
        cout << endl;
    }

    // set / multiset
    set<int> s = {5, 1, 4, 1, 5, 9, 2, 6};
    for (int x : s) cout << x << " ";
    cout << endl;
    s.insert(3);
    s.erase(9);
    cout << s.size() << " " << *s.begin() << " " << *s.rbegin() << " " << s.count(4) << " " << (s.find(7) == s.end()) << endl;
    cout << *s.lower_bound(4) << " " << *s.upper_bound(4) << endl;
    multiset<int> ms = {3, 1, 3, 2, 3};
    cout << ms.count(3) << " " << ms.size() << endl;
    ms.erase(ms.find(3));
    cout << ms.count(3) << endl;
    set<Point> ps;
    ps.insert(Point(2, 3));
    ps.insert(Point(1, 5));
    ps.insert(Point(2, 1));
    for (auto& p : ps) cout << "(" << p.x << "," << p.y << ")";
    cout << endl;
    set<pair<int, int>> pairs = {{2, 1}, {1, 9}, {1, 2}};
    for (auto& p : pairs) cout << p.first << "-" << p.second << " ";
    cout << endl;

    // stack / queue / priority_queue / deque
    stack<int> st;
    for (int i = 1; i <= 4; i++) st.push(i * i);
    cout << st.top() << " " << st.size() << endl;
    st.pop();
    while (!st.empty()) { cout << st.top() << " "; st.pop(); }
    cout << endl;
    queue<string> q;
    q.push("a"); q.push("b"); q.push("c");
    cout << q.front() << q.back() << q.size() << endl;
    q.pop();
    cout << q.front() << endl;
    priority_queue<int> pq;
    for (int x : {5, 1, 8, 3, 9, 2}) pq.push(x);
    while (!pq.empty()) { cout << pq.top() << " "; pq.pop(); }
    cout << endl;
    priority_queue<int, vector<int>, greater<int>> minpq;
    for (int x : {5, 1, 8, 3, 9, 2}) minpq.push(x);
    cout << minpq.top() << " " << minpq.size() << endl;
    priority_queue<pair<int, string>> ppq;
    ppq.push({2, "two"}); ppq.push({9, "nine"}); ppq.push({5, "five"});
    cout << ppq.top().second << endl;
    auto cmp = [](const pair<int,int>& a, const pair<int,int>& b) { return a.second > b.second; };
    priority_queue<pair<int,int>, vector<pair<int,int>>, decltype(cmp)> cpq(cmp);
    cpq.push({1, 30}); cpq.push({2, 10}); cpq.push({3, 20});
    while (!cpq.empty()) { cout << cpq.top().first << " "; cpq.pop(); }
    cout << endl;
    deque<int> dq;
    dq.push_back(1); dq.push_back(2); dq.push_front(0); dq.push_front(-1);
    cout << dq.front() << " " << dq.back() << " " << dq[1] << " " << dq.size() << endl;
    dq.pop_front(); dq.pop_back();
    for (int x : dq) cout << x << " ";
    cout << endl;

    // pair / tuple / structured bindings
    pair<int, string> p = {1, "one"};
    auto [num, name] = p;
    cout << num << name << " " << p.first << p.second << endl;
    tuple<int, double, string> t = make_tuple(1, 2.5, "x");
    cout << get<0>(t) << " " << get<1>(t) << " " << get<2>(t) << endl;
    vector<pair<int, int>> vp = {{3, 1}, {1, 2}, {2, 0}};
    sort(vp.begin(), vp.end());
    for (auto& [a, b] : vp) cout << a << b << " ";
    cout << endl;
    sort(vp.begin(), vp.end(), [](auto& a, auto& b) { return a.second < b.second; });
    for (auto& e : vp) cout << e.first << e.second << " ";
    cout << endl;

    // vector algorithms
    vector<int> v = {4, 2, 7, 2, 9, 4, 1};
    sort(v.begin(), v.end());
    v.erase(unique(v.begin(), v.end()), v.end());
    for (int x : v) cout << x << " ";
    cout << endl;
    cout << (lower_bound(v.begin(), v.end(), 4) - v.begin()) << " " << (upper_bound(v.begin(), v.end(), 4) - v.begin()) << " " << binary_search(v.begin(), v.end(), 7) << endl;
    reverse(v.begin(), v.end());
    rotate(v.begin(), v.begin() + 2, v.end());
    for (int x : v) cout << x << " ";
    cout << endl;
    vector<int> w(5);
    iota(w.begin(), w.end(), 10);
    fill(w.begin(), w.begin() + 2, 0);
    cout << count(w.begin(), w.end(), 0) << " " << accumulate(w.begin(), w.end(), 0) << " " << count_if(w.begin(), w.end(), [](int x) { return x > 11; }) << endl;
    vector<int> perm = {1, 2, 3};
    do { for (int x : perm) cout << x; cout << " "; } while (next_permutation(perm.begin(), perm.end()));
    cout << endl;
    vector<string> words = {"pear", "fig", "apple", "kiwi"};
    sort(words.begin(), words.end(), [](const string& a, const string& b) { return a.size() != b.size() ? a.size() < b.size() : a < b; });
    for (auto& s2 : words) cout << s2 << " ";
    cout << endl;
    return 0;
}
