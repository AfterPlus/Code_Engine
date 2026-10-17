// DP table analysis against real traces: which cells a run touched, how big the table needs to be drawn, and which
// sub-problem calls a cell was built from. Pure logic, no DOM (the drawing itself is covered by tests/render.html).
//   node --test frontend/tests/dpTable.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { SAMPLES } from '../js/samples.js';
import { parseTestInput } from '../js/components/TestCasePanel.js';
import { buildExecution } from '../js/state/executionState.js';
import { detectViews } from '../js/visualizers/StructureDetector.js';
import { analyzeTable, cellOfCall, childCalls, usedRegion } from '../js/state/tableAnalysis.js';
import { infinityOf } from '../js/visualizers/common.js';

const require = createRequire(import.meta.url);
const acorn = require('../js/vendor/acorn.js');
const astring = require('../js/vendor/astring.min.js');
const instrumenter = require('../js/runners/jsInstrumenter.js');
const { runTrace } = require('../js/runners/jsTracer.js');
const cpp = require('./cppLoad.cjs');

const sample = (id) => SAMPLES.find((s) => s.id === id);

async function trace(language, code, input) {
  const tc = parseTestInput(input).value;
  const result = language === 'cpp'
    ? await cpp.run('cpp', code, tc, { definitions: '', maxSteps: 5000 })
    : runTrace(code, tc, { acorn, astring, instrumenter, maxSteps: 5000, timeoutMs: 20000 });
  assert.equal(result.status, 'SUCCESS', result.error && result.error.message);
  return buildExecution(result, code, language === 'cpp' ? 'cpp' : 'javascript');
}

/** The matrix view of the last frame, and its analysis the way the visualizer asks for it. */
function matrixOf(exec, name) {
  const frame = exec.frames[exec.frames.length - 1];
  const view = detectViews(frame, {}, exec).find((v) => v.kind === 'matrix' && v.names.includes(name));
  assert.ok(view, `no matrix view for ${name}`);
  const rowNames = exec.src.rowVars(name);
  const colNames = exec.src.colVars(name);
  const info = analyzeTable(exec, view.id, { rowNames, colNames });
  const rows = frame.heap[view.id].elems.map((e) => frame.heap[e.ref]);
  const cols = Math.max(...rows.map((r) => r.elems.length));
  return { frame, view, info, rows, cols, rowNames, colNames };
}

test('∞ stands in for INT_MAX, INT_MIN, Long extremes and real infinities, and nothing else', () => {
  assert.equal(infinityOf(2147483647), '∞');
  assert.equal(infinityOf(-2147483648), '−∞');
  assert.equal(infinityOf(2 ** 63), '∞');
  assert.equal(infinityOf({ n: 'Infinity' }), '∞');
  assert.equal(infinityOf({ n: '-inf' }), '−∞');
  assert.equal(infinityOf({ n: '9223372036854775807' }), '∞');
  for (const v of [0, 7, -1, 2147483646, null, true, { c: 'x' }, { str: 'inf' }, { ref: '3' }, { n: 'NaN' }]) assert.equal(infinityOf(v), null, JSON.stringify(v));
});

test('memoized interval DP: a 102x102 table is cropped to the part the calls used', async () => {
  const exec = await trace('cpp', sample('min-cost-cut').cpp, 'n = 7, cuts = [1,3,4,5]');
  const { frame, info, rows, cols, rowNames, colNames } = matrixOf(exec, 'dp');
  assert.equal(rows.length, 102);
  assert.equal(cols, 102);
  assert.equal(info.written, true);
  assert.equal(info.bg.value, 0);
  // six positions (0,1,3,4,5,7): dfs(i, j) with i < j <= 5, so rows 0..4 and columns 0..5
  assert.deepEqual([info.maxRow, info.maxCol], [4, 5]);
  assert.ok(info.touched.has('4,5'), 'the base case dfs(4, 5) never reads dp but is a visited sub-problem');
  assert.ok(info.touched.has('0,5'));
  assert.ok(!info.touched.has('5,0') && !info.touched.has('50,50'));
  const region = usedRegion(info, rows, cols, []);
  assert.deepEqual(region, { usedRows: 5, usedCols: 6, croppable: true });
  // the sentinel is a real value in the table, so it still counts as a (non-filler) cell
  assert.ok(info.writes.get('0,5').length >= 2, 'dp[0][5] is written once as INT_MAX and again as it improves');
  assert.ok(rowNames.has('i') && colNames.has('j'));
  assert.equal(frame.index, exec.frames.length - 1);
});

test('a call works on the cell named by its row / column arguments, and sub-problems are its child calls', async () => {
  const exec = await trace('cpp', sample('min-cost-cut').cpp, 'n = 7, cuts = [1,3,4,5]');
  const { rowNames, colNames } = matrixOf(exec, 'dp');
  const calls = [...exec.calls.values()].filter((c) => c.name === 'dfs');
  const root = calls[0];
  assert.equal(cellOfCall(root, rowNames, colNames, 102, 102), '0,5');
  assert.equal(cellOfCall(root, rowNames, colNames, 3, 3), null, 'outside the table');
  const kids = childCalls(exec).get(root.id).map((c) => cellOfCall(c, rowNames, colNames, 102, 102));
  // k = 1..4 splits [0,5] into (0,k) and (k,5)
  assert.deepEqual(kids, ['0,1', '1,5', '0,2', '2,5', '0,3', '3,5', '0,4', '4,5']);
});

test('the same example in JavaScript shows the same shape, with Infinity as the in-progress marker', async () => {
  const exec = await trace('js', sample('min-cost-cut').javascript, 'n = 7, cuts = [1,3,4,5]');
  const { info, rows, cols } = matrixOf(exec, 'dp');
  assert.deepEqual([info.maxRow, info.maxCol], [4, 5]);
  assert.deepEqual(usedRegion(info, rows, cols, []), { usedRows: 5, usedCols: 6, croppable: true });
});

test('a small iterative table is shown whole', async () => {
  const exec = await trace('js', sample('lcs').javascript, 'text1 = "abcde", text2 = "ace"');
  const { info, rows, cols } = matrixOf(exec, 'dp');
  assert.equal(rows.length * cols, 24);
  assert.equal(usedRegion(info, rows, cols, []).croppable, false);
});

test('filling a table with its filler value does not make every cell "used"', async () => {
  const code = `var f = function(n) {
    const memo = Array.from({ length: 30 }, () => new Array(30).fill(0));
    for (const row of memo) for (let j = 0; j < 30; j++) row[j] = -1;
    memo[1][2] = 5;
    return memo[1][2];
};`;
  const exec = await trace('js', code, 'n = 1');
  const { info, rows, cols } = matrixOf(exec, 'memo');
  assert.equal(info.bg.value, -1);
  assert.deepEqual(usedRegion(info, rows, cols, []), { usedRows: 2, usedCols: 3, croppable: true });
  assert.deepEqual(usedRegion(info, rows, cols, [[10, 12]]), { usedRows: 11, usedCols: 13, croppable: true }, 'cells that must stay visible widen it');
});

test('a grid the program only reads is input data: never cropped, never faded', async () => {
  // reads through for-of are invisible to the trace, so "untouched" would mean nothing here
  const code = `var f = function(n) {
    const grid = Array.from({ length: 20 }, (_, i) => new Array(20).fill(i % 2));
    let sum = 0;
    for (const row of grid) for (const v of row) sum += v;
    return sum;
};`;
  const exec = await trace('js', code, 'n = 1');
  const { info, rows, cols } = matrixOf(exec, 'grid');
  assert.equal(info.written, false);
  assert.deepEqual(usedRegion(info, rows, cols, []), { usedRows: 20, usedCols: 20, croppable: false });
});
