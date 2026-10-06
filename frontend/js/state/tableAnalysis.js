// Whole-run facts about a table (a 2D array or list of lists). The trace is complete before anything is drawn, so a DP
// table can be shown at the size the algorithm actually used and stay that size while you step, however large it was
// allocated: which cells the program ever read or wrote, when each cell was written, and the value that fills the rest.

import { isRef, keyOf } from '../util/values.js';

const tables = new WeakMap(); // exec -> Map(outer heap id -> analysis)
const children = new WeakMap(); // exec -> Map(call id -> calls it made, in order)

/** Is `v` the table's filler value (the 0 / -1 / false everything starts as)? */
export function isFiller(v, bg) {
  if (!bg) return false;
  return v === bg.value || (v !== null && typeof v === 'object' && keyOf(v) === bg.key);
}

/** The most common value of the table's cells in the last frame it exists: what the untouched cells hold. */
function fillerOf(exec, id) {
  for (let k = exec.frames.length - 1; k >= 0; k--) {
    const outer = exec.frames[k].heap[id];
    if (!outer || !outer.elems) continue;
    const counts = new Map();
    let best = null;
    for (const e of outer.elems) {
      const row = isRef(e) ? exec.frames[k].heap[e.ref] : null;
      for (const v of (row && row.elems) || []) {
        if (isRef(v)) continue;
        const key = keyOf(v);
        const hit = counts.get(key) || { value: v, key, n: 0 };
        hit.n++;
        counts.set(key, hit);
        if (!best || hit.n > best.n) best = hit;
      }
    }
    return best && { value: best.value, key: best.key };
  }
  return null;
}

/**
 * The "i,j" cell a call works on, from the arguments named like the table's row / column index variables
 * (dfs(cuts, i, j) works on dp[i][j]), or null when it has none inside a rows x cols table.
 */
export function cellOfCall(call, rowNames, colNames, rows, cols) {
  const find = (names, limit) => {
    for (const [n, v] of call.args) if (names.has(n) && Number.isInteger(v) && v >= 0 && v < limit) return v;
    return null;
  };
  const i = find(rowNames, rows);
  const j = find(colNames, cols);
  return i === null || j === null ? null : `${i},${j}`;
}

/**
 * `index` names the variables the source uses as the table's row / column index ({rowNames, colNames}); with it,
 * the cells of recursive calls count as touched too (a base case like dfs(4, 5) never reads dp but is still visited).
 * @returns {{
 *   bg: {value, key}|null,        value of the untouched cells
 *   touched: Set<string>,         "i,j" of every cell read, called on, or written with something other than the filler
 *   writes: Map<string, number[]>, "i,j" -> frame indices of every write to it
 *   written: boolean,             whether the program stores results in it (a work table) or only reads it (input)
 *   maxRow: number, maxCol: number  furthest touched row / column (-1 if none)
 * }}
 */
export function analyzeTable(exec, id, index = null) {
  if (!tables.has(exec)) tables.set(exec, new Map());
  const cache = tables.get(exec);
  if (cache.has(id)) return cache.get(id);

  const bg = fillerOf(exec, id);
  const touched = new Set();
  const writes = new Map();
  let written = false;
  let maxRow = -1;
  let maxCol = -1;
  const touch = (i, j) => {
    touched.add(`${i},${j}`);
    if (i > maxRow) maxRow = i;
    if (j > maxCol) maxCol = j;
  };

  for (const f of exec.frames) {
    const outer = f.heap[id];
    if (!outer || !outer.elems || (!f.changes.heap.size && !f.ops.reads.length)) continue;
    const rowOf = new Map();
    outer.elems.forEach((e, i) => { if (isRef(e)) rowOf.set(e.ref, i); });
    for (const [rid, c] of f.changes.heap) {
      const i = rowOf.get(rid);
      if (i === undefined || !c.indices) continue;
      const row = f.heap[rid];
      for (const j of c.indices) {
        const key = `${i},${j}`;
        if (!writes.has(key)) writes.set(key, []);
        writes.get(key).push(f.index);
        // filling the table with its filler (Arrays.fill(dp, -1)) does not make a cell "used"
        if (!isFiller(row.elems[j], bg)) { touch(i, j); written = true; }
      }
    }
    for (const r of f.ops.reads) {
      const i = rowOf.get(r.heapId);
      if (i !== undefined) touch(i, r.index);
    }
  }
  if (index && written) {
    const last = [...exec.frames].reverse().find((f) => f.heap[id] && f.heap[id].elems);
    const outer = last && last.heap[id];
    const rowCount = outer ? outer.elems.length : 0;
    const colCount = outer ? Math.max(0, ...outer.elems.map((e) => (isRef(e) && last.heap[e.ref].elems ? last.heap[e.ref].elems.length : 0))) : 0;
    for (const call of exec.calls.values()) {
      const cell = cellOfCall(call, index.rowNames, index.colNames, rowCount, colCount);
      if (cell) touch(...cell.split(',').map(Number));
    }
  }
  const info = { bg, touched, writes, written, maxRow, maxCol };
  cache.set(id, info);
  return info;
}

const CROP_MIN_CELLS = 144; // smaller tables are always shown whole
const CROP_MAX_SHARE = 0.75; // crop only when the used part is at most this share of the table

/**
 * How much of a table to draw. `rows` are the row heap objects of the current frame; `keep` lists [row, col] cells
 * that must stay visible right now (written, current, waiting; -1 for an unknown coordinate). A work table allocated
 * far beyond what the run used (dp[102][102] for six cuts) is cropped to the used top-left corner; input data that
 * the program only reads, and small tables, are never cropped.
 * @returns {{usedRows: number, usedCols: number, croppable: boolean}}
 */
export function usedRegion(info, rows, cols, keep = []) {
  let usedRows = rows.length;
  let usedCols = cols;
  if (info.written) {
    let r = info.maxRow;
    let c = info.maxCol;
    rows.forEach((row, i) => ((row && row.elems) || []).forEach((v, j) => {
      if (!isRef(v) && !isFiller(v, info.bg)) { r = Math.max(r, i); c = Math.max(c, j); }
    }));
    for (const [i, j] of keep) { r = Math.max(r, i); c = Math.max(c, j); }
    usedRows = Math.min(rows.length, r + 1);
    usedCols = Math.min(cols, c + 1);
  }
  const area = rows.length * cols;
  return { usedRows, usedCols, croppable: info.written && area > CROP_MIN_CELLS && usedRows * usedCols <= CROP_MAX_SHARE * area };
}

/** Calls grouped by the call that made them, in the order they were made. */
export function childCalls(exec) {
  if (!children.has(exec)) {
    const byParent = new Map();
    for (const c of exec.calls.values()) {
      if (c.parentId == null) continue;
      if (!byParent.has(c.parentId)) byParent.set(c.parentId, []);
      byParent.get(c.parentId).push(c);
    }
    children.set(exec, byParent);
  }
  return children.get(exec);
}
