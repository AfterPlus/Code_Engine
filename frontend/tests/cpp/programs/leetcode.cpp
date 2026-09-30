#include <bits/stdc++.h>
using namespace std;

class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        unordered_map<string, vector<string>> groups;
        for (auto& s : strs) {
            string key = s;
            sort(key.begin(), key.end());
            groups[key].push_back(s);
        }
        vector<vector<string>> res;
        for (auto& [k, v] : groups) res.push_back(v);
        sort(res.begin(), res.end());
        return res;
    }

    vector<int> topKFrequent(vector<int>& nums, int k) {
        unordered_map<int, int> freq;
        for (int x : nums) freq[x]++;
        priority_queue<pair<int, int>, vector<pair<int, int>>, greater<>> pq;
        for (auto& [num, cnt] : freq) {
            pq.push({cnt, num});
            if (pq.size() > k) pq.pop();
        }
        vector<int> res;
        while (!pq.empty()) { res.push_back(pq.top().second); pq.pop(); }
        sort(res.begin(), res.end());
        return res;
    }

    vector<vector<int>> merge(vector<vector<int>>& intervals) {
        sort(intervals.begin(), intervals.end());
        vector<vector<int>> res;
        for (auto& iv : intervals) {
            if (res.empty() || res.back()[1] < iv[0]) res.push_back(iv);
            else res.back()[1] = max(res.back()[1], iv[1]);
        }
        return res;
    }

    int lengthOfLongestSubstring(string s) {
        unordered_map<char, int> last;
        int best = 0, start = 0;
        for (int i = 0; i < (int)s.size(); i++) {
            if (last.count(s[i]) && last[s[i]] >= start) start = last[s[i]] + 1;
            last[s[i]] = i;
            best = max(best, i - start + 1);
        }
        return best;
    }

    vector<int> dailyTemperatures(vector<int>& t) {
        vector<int> res(t.size(), 0);
        stack<int> st;
        for (int i = 0; i < t.size(); i++) {
            while (!st.empty() && t[st.top()] < t[i]) {
                res[st.top()] = i - st.top();
                st.pop();
            }
            st.push(i);
        }
        return res;
    }

    int coinChange(vector<int>& coins, int amount) {
        vector<int> dp(amount + 1, amount + 1);
        dp[0] = 0;
        for (int a = 1; a <= amount; a++)
            for (int c : coins)
                if (c <= a) dp[a] = min(dp[a], dp[a - c] + 1);
        return dp[amount] > amount ? -1 : dp[amount];
    }

    vector<vector<int>> subsets(vector<int>& nums) {
        vector<vector<int>> res;
        vector<int> cur;
        function<void(int)> go = [&](int i) {
            if (i == nums.size()) { res.push_back(cur); return; }
            go(i + 1);
            cur.push_back(nums[i]);
            go(i + 1);
            cur.pop_back();
        };
        go(0);
        return res;
    }

    int maxSubArray(vector<int>& nums) {
        int best = nums[0], cur = nums[0];
        for (int i = 1; i < nums.size(); i++) {
            cur = max(nums[i], cur + nums[i]);
            best = max(best, cur);
        }
        return best;
    }

    string longestPalindrome(string s) {
        int n = s.size(), lo = 0, len = 1;
        for (int c = 0; c < n; c++) {
            for (int w = 0; w < 2; w++) {
                int l = c, r = c + w;
                while (l >= 0 && r < n && s[l] == s[r]) { l--; r++; }
                if (r - l - 1 > len) { len = r - l - 1; lo = l + 1; }
            }
        }
        return s.substr(lo, len);
    }
};

int main() {
    Solution sol;
    vector<string> strs = {"eat", "tea", "tan", "ate", "nat", "bat"};
    for (auto& g : sol.groupAnagrams(strs)) { for (auto& s : g) cout << s << " "; cout << "| "; }
    cout << endl;
    vector<int> nums = {1, 1, 1, 2, 2, 3};
    for (int x : sol.topKFrequent(nums, 2)) cout << x << " ";
    cout << endl;
    vector<vector<int>> iv = {{1, 3}, {8, 10}, {2, 6}, {15, 18}};
    for (auto& m : sol.merge(iv)) cout << "[" << m[0] << "," << m[1] << "]";
    cout << endl;
    cout << sol.lengthOfLongestSubstring("abcabcbb") << " " << sol.lengthOfLongestSubstring("pwwkew") << endl;
    vector<int> temps = {73, 74, 75, 71, 69, 72, 76, 73};
    for (int x : sol.dailyTemperatures(temps)) cout << x << " ";
    cout << endl;
    vector<int> coins = {1, 2, 5};
    cout << sol.coinChange(coins, 11) << endl;
    vector<int> sub = {1, 2, 3};
    cout << sol.subsets(sub).size() << endl;
    vector<int> ms = {-2, 1, -3, 4, -1, 2, 1, -5, 4};
    cout << sol.maxSubArray(ms) << " " << sol.longestPalindrome("babad") << endl;
    return 0;
}
