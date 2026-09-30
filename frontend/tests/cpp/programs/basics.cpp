#include <bits/stdc++.h>
using namespace std;

typedef long long ll;
const int MOD = 1e9 + 7;
int counter = 0;

int gcd2(int a, int b) { return b == 0 ? a : gcd2(b, a % b); }

double avg(vector<int>& v) {
    double s = 0;
    for (int x : v) s += x;
    return s / v.size();
}

int main() {
    // integer arithmetic
    int a = 7, b = 2;
    cout << a / b << " " << a % b << " " << -a / b << " " << -a % b << endl;
    cout << (double)a / b << " " << a / (double)b << " " << 7.0 / 2 << endl;
    cout << 1 / 2 << " " << 1.0 / 2 << " " << 10 % 3 << endl;
    ll big = 1000000007LL * 1000000007LL;
    cout << big << " " << big % MOD << endl;
    int ov = INT_MAX;
    ov += 1;
    cout << ov << endl;
    unsigned int u = 0;
    u -= 1;
    cout << u << endl;
    cout << (5 & 3) << (5 | 3) << (5 ^ 3) << (~5) << (1 << 10) << (1024 >> 3) << endl;
    long long shifted = 1LL << 40;
    cout << shifted << endl;
    cout << (a > b ? "yes" : "no") << endl;

    // chars and strings
    char c = 'a';
    c += 2;
    cout << c << " " << (int)c << " " << (char)(c + 1) << " " << c - 'a' << endl;
    string s = "hello";
    s += " world";
    s.push_back('!');
    cout << s << " " << s.size() << " " << s.substr(6, 5) << " " << s.find("wor") << endl;
    cout << (s.find("zzz") == string::npos) << endl;
    string t = s;
    t[0] = 'H';
    cout << s << " " << t << endl;
    reverse(t.begin(), t.end());
    cout << t << endl;
    sort(s.begin(), s.end());
    cout << s << endl;
    string num = to_string(12345) + "-" + to_string(2.5);
    cout << num << " " << stoi("42") + 1 << endl;
    for (char ch : string("abc")) cout << (char)toupper(ch);
    cout << endl;

    // vectors
    vector<int> v = {5, 3, 8, 1, 9, 2};
    sort(v.begin(), v.end());
    for (int x : v) cout << x << ",";
    cout << endl;
    sort(v.begin(), v.end(), greater<int>());
    for (int i = 0; i < v.size(); i++) cout << v[i] << (i + 1 < v.size() ? " " : "\n");
    v.push_back(100);
    v.insert(v.begin() + 2, 77);
    v.erase(v.begin());
    cout << v.size() << " " << v.front() << " " << v.back() << " " << avg(v) << endl;
    vector<vector<int>> grid(3, vector<int>(4, 1));
    grid[1][2] = 5;
    int total = 0;
    for (auto& row : grid) for (int x : row) total += x;
    cout << total << " " << grid.size() << "x" << grid[0].size() << endl;
    vector<int> copy = v;
    copy[0] = -1;
    cout << v[0] << " " << copy[0] << endl;
    cout << *max_element(v.begin(), v.end()) << " " << *min_element(v.begin(), v.end()) << " " << accumulate(v.begin(), v.end(), 0) << endl;

    // recursion / functions
    cout << gcd2(48, 18) << " " << gcd(48, 18) << endl;
    cout << fixed << setprecision(3) << 3.14159 << " " << sqrt(2.0) << " " << pow(2, 10) << endl;
    cout << 1e9 << " " << 1.5e-3 << " " << 100.0 << " " << 0.1 + 0.2 << endl;
    printf("%d %5d|%-5d|%05d %x %c %s %.1f %lld\n", 42, 42, 42, 42, 255, 'z', "str", 2.55, big);
    counter++;
    counter += 2;
    cout << counter << endl;
    return 0;
}
