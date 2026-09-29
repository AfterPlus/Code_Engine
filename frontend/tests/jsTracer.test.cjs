// Run with: node --test frontend/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const acorn = require('../js/vendor/acorn.js');
const astring = require('../js/vendor/astring.min.js');
const instrumenter = require('../js/runners/jsInstrumenter.js');
const { runTrace } = require('../js/runners/jsTracer.js');

const run = (code, tc, opts = {}) => runTrace(code, tc, { acorn, astring, instrumenter, ...opts });

test('two sum: steps, locals, Map heap object, output', () => {
  const code = `
var twoSum = function(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i];
    if (map.has(complement)) {
      return [map.get(complement), i];
    }
    map.set(nums[i], i);
  }
  return [];
};`;
  const r = run(code, { nums: [2, 7, 11, 15], target: 9 });
  assert.equal(r.status, 'SUCCESS', JSON.stringify(r.error));
  assert.deepEqual(r.output, [0, 1]);
  assert.equal(r.steps[0].event, 'FUNCTION_ENTER');
  assert.equal(r.steps[0].function, 'twoSum');
  assert.equal(r.steps.at(-1).event, 'FUNCTION_EXIT');
  const withMap = r.steps.find((s) => Object.values(s.heap).some((h) => h.kind === 'map' && h.entries.length === 1));
  assert.ok(withMap, 'map with one entry should appear');
  const loopStep = r.steps.find((s) => s.line === 5);
  assert.ok('i' in loopStep.callStack[0].locals, 'loop variable visible');
  assert.deepEqual(loopStep.callStack[0].args, ['nums', 'target']);
});

test('recursion: call ids, parents, return values', () => {
  const code = `
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}`;
  const r = run(code, { n: 4 });
  assert.equal(r.status, 'SUCCESS');
  assert.equal(r.output, 3);
  const enters = r.steps.filter((s) => s.event === 'FUNCTION_ENTER');
  assert.equal(enters.length, 9);
  assert.equal(Math.max(...r.steps.map((s) => s.callStack.length)), 4);
  assert.ok(r.steps.some((s) => s.event === 'FUNCTION_EXIT' && s.returnValue === 2));
});

test('jsdoc ListNode params are built and output serialized', () => {
  const code = `
/**
 * @param {ListNode} head
 * @return {ListNode}
 */
var reverseList = function(head) {
  let prev = null, cur = head;
  while (cur) { const next = cur.next; cur.next = prev; prev = cur; cur = next; }
  return prev;
};`;
  const r = run(code, { head: [1, 2, 3] });
  assert.equal(r.status, 'SUCCESS', JSON.stringify(r.error));
  assert.deepEqual(r.output, [3, 2, 1]);
  assert.ok(Object.values(r.steps[0].heap).some((h) => h.type === 'ListNode'));
  // one-line while loop still steps each iteration
  assert.ok(r.steps.filter((s) => s.line === 8).length >= 3);
});

test('console output is attributed to steps', () => {
  const r = run('function f(n) {\n  for (let i = 0; i < n; i++) console.log("hi", i);\n}', { n: 2 });
  assert.equal(r.stdout, 'hi 0\nhi 1\n');
  assert.equal(r.steps.filter((s) => s.out).length, 2);
});

test('runtime error keeps the trace and adds an EXCEPTION frame', () => {
  const r = run('function f(a) {\n  let x = null;\n  return x.y;\n}', { a: 1 });
  assert.equal(r.status, 'RUNTIME_ERROR');
  assert.equal(r.error.type, 'TypeError');
  assert.equal(r.error.line, 3);
  assert.equal(r.steps.at(-1).event, 'EXCEPTION');
});

test('syntax errors are compile errors with a line', () => {
  const r = run('function f() {\n  return (;\n}', {});
  assert.equal(r.status, 'COMPILE_ERROR');
  assert.equal(r.error.line, 2);
});

test('infinite loops hit the step limit and user catch blocks cannot swallow it', () => {
  const r = run('function f() {\n  while (true) { try { let a = 1; } catch (e) {} }\n}', {}, { maxSteps: 100 });
  assert.equal(r.status, 'STEP_LIMIT');
  assert.equal(r.steps.length, 100);
});

test('tree input from level order, nested helpers traced', () => {
  const code = `
/** @param {TreeNode} root */
function maxDepth(root) {
  const depth = (n) => n ? 1 + Math.max(depth(n.left), depth(n.right)) : 0;
  return depth(root);
}`;
  const r = run(code, { root: [3, 9, 20, null, null, 15, 7] });
  assert.equal(r.status, 'SUCCESS', JSON.stringify(r.error));
  assert.equal(r.output, 3);
  assert.ok(r.steps.some((s) => s.function === 'depth'));
});
