#include <bits/stdc++.h>
using namespace std;

vector<string> split(const string& s, char d) {
    vector<string> out;
    stringstream ss(s);
    string tok;
    while (getline(ss, tok, d)) out.push_back(tok);
    return out;
}

string join(const vector<string>& v, const string& sep) {
    string r;
    for (size_t i = 0; i < v.size(); i++) { if (i) r += sep; r += v[i]; }
    return r;
}

string toBinary(int n) {
    if (n == 0) return "0";
    string s;
    while (n) { s = char('0' + (n & 1)) + s; n >>= 1; }
    return s;
}

int main() {
    string s = "the quick brown fox";
    auto parts = split(s, ' ');
    cout << parts.size() << " " << join(parts, "_") << endl;
    for (auto& p : parts) p[0] = toupper(p[0]);
    cout << join(parts, " ") << endl;
    cout << s.substr(4, 5) << "|" << s.substr(16) << "|" << s.find('q') << "|" << s.find("fox") << "|" << s.rfind('o') << endl;
    s.insert(3, "!!");
    s.erase(0, 1);
    cout << s << " " << s.length() << endl;
    s.replace(0, 2, "XY");
    cout << s << endl;
    cout << s.compare("XY") << " " << (s == "XY") << " " << (s < "Z") << " " << (string("a") + "b" == "ab") << endl;
    string t = "abcabc";
    int freq[128] = {0};
    for (char c : t) freq[c]++;
    cout << freq['a'] << freq['b'] << freq['z'] << endl;
    map<char, int> cm;
    for (char c : t) cm[c]++;
    for (auto& [c, n] : cm) cout << c << n;
    cout << endl;
    string num = "12345";
    int total = 0;
    for (char c : num) total += c - '0';
    cout << total << " " << stoi(num) * 2 << " " << stoll("9000000000") << " " << stod("3.5") * 2 << endl;
    cout << toBinary(10) << " " << to_string(-45) << " " << to_string(1.0 / 4) << endl;
    string r = "";
    for (int i = 0; i < 5; i++) r += to_string(i) + (i < 4 ? "," : "");
    cout << r << endl;
    string up = "MiXeD";
    transform(up.begin(), up.end(), up.begin(), ::tolower);
    cout << up << endl;
    string word = "level";
    string rev(word.rbegin(), word.rend());
    cout << rev << " " << (word == rev) << endl;
    sort(word.begin(), word.end());
    cout << word << " " << word.front() << word.back() << endl;
    string x(3, 'z');
    cout << x << x.size() << endl;
    char buf[] = "hello";
    cout << strlen(buf) << " " << buf << endl;
    cout << (int)'A' << " " << (char)66 << " " << char('a' + 1) << " " << 'a' + 1 << endl;
    cout << isdigit('5') << isalpha('5') << isupper('Q') << islower('Q') << endl;
    stringstream out;
    out << "n=" << 42 << ",f=" << 1.5 << ",s=" << "ok";
    cout << out.str() << endl;
    cout << boolalpha << (1 < 2) << " " << noboolalpha << (1 < 2) << endl;
    cout << setw(6) << 42 << "|" << setfill('*') << setw(6) << 7 << "|" << endl;
    printf("%s has %d chars, pi=%.3f, %c%c\n", "abc", 3, 3.14159265, 'o', 'k');
    return 0;
}
