// 2D arrays / lists of lists as a table: DP tables, grids, boards. The current cell comes from the variables the
// code uses as row/column indices; reads and writes come from the trace, so 1D and 2D DP need no special cases.
//
// A table allocated far larger than the algorithm uses (dp[102][102] for a 6-element input) is drawn at the size the
// run actually touched, with the cells nobody touched faded. Recursive code shows the cell of every call still waiting
// on a sub-problem, and arrows run from the sub-problems a cell is being built from (the calls it made, or the cells
// its line read) to that cell. Axes are labelled with the input they walk: a string, or an array the code indexes with
// the same variables (cuts[i]).

import { h, s } from '../util/dom.js';
import { fmt, isRef, scalar } from '../util/values.js';
import { viewShell, cellText, infinityOf, intVars, svgCanvas, trimLine } from './common.js';
import { readLabels } from './ArrayVisualizer.js';
import { rootBindings } from './StructureDetector.js';
import { analyzeTable, cellOfCall, childCalls, isFiller, usedRegion } from '../state/tableAnalysis.js';

const MAX_SHOWN = 60; // rows / columns drawn at most
const CELL_H = 28;

const expanded = new WeakMap(); // exec -> Set of table keys the user opened in full

const fullSet = (exec) => {
  if (!expanded.has(exec)) expanded.set(exec, new Set());
  return expanded.get(exec);
};

export function renderMatrix(view, ctx) {
  const { frame, exec } = ctx;
  const heap = frame.heap;
  const outer = heap[view.id];
  const rows = (outer.elems || []).map((e) => (isRef(e) ? heap[e.ref] : null));
  const rowIndex = new Map();
  (outer.elems || []).forEach((e, i) => { if (isRef(e)) rowIndex.set(e.ref, i); });
  const cols = Math.max(0, ...rows.map((r) => (r && r.elems ? r.elems.length : 0)));
  const name = view.names[0];
  const bare = name.replace(/^this\./, '');
  const rowNames = exec.src.rowVars(bare);
  const colNames = exec.src.colVars(bare);
  const info = analyzeTable(exec, view.id, { rowNames, colNames });

  const writes = new Set();
  const reads = new Set();
  for (const [id, c] of frame.changes.heap) {
    if (rowIndex.has(id) && c.indices) c.indices.forEach((j) => writes.add(`${rowIndex.get(id)},${j}`));
  }
  for (const r of frame.ops.reads) if (rowIndex.has(r.heapId)) reads.add(`${rowIndex.get(r.heapId)},${r.index}`);

  // current cell: variables used as the first / second index of this table in the source
  const pick = (names, ints, limit) => {
    for (const v of names) if (ints.has(v) && ints.get(v) >= 0 && ints.get(v) < limit) return { name: v, value: ints.get(v) };
    return null;
  };
  const ints = intVars(frame);
  const rv = pick(rowNames, ints, rows.length);
  const cv = pick(colNames, ints, cols);
  const curKey = rv && cv ? `${rv.value},${cv.value}` : null;

  // recursion: the cells of the calls that are still open, each waiting on a sub-problem
  const waiting = new Set();
  const top = frame.top;
  for (const f of top ? frame.stack : []) {
    if (f === top || f.name !== top.name) continue;
    const locals = new Map(Object.entries(f.locals).filter(([, v]) => Number.isInteger(v)));
    const r = pick(rowNames, locals, rows.length);
    const c = pick(colNames, locals, cols);
    if (r && c) waiting.add(`${r.value},${c.value}`);
  }
  waiting.delete(curKey);

  // ---- how much of the table to draw
  const keep = [...writes, ...waiting].map((k) => k.split(',').map(Number));
  keep.push([rv ? rv.value : -1, cv ? cv.value : -1]);
  const { usedRows, usedCols, croppable } = usedRegion(info, rows, cols, keep);
  const full = croppable && fullSet(exec).has(view.key);
  const trimmed = croppable && !full;
  const wantRows = trimmed ? usedRows : rows.length;
  const wantCols = trimmed ? usedCols : cols;
  const showRows = Math.min(wantRows, MAX_SHOWN);
  const showCols = Math.min(wantCols, MAX_SHOWN);

  // ---- what the current cell is built from: sub-problem calls since it was last written, and the cells just read
  const writeKeys = [...writes];
  const targetKey = writeKeys[0] || curKey;
  const deps = new Map(); // "i,j" -> 'done' | 'running'
  if (targetKey) {
    if (writeKeys.length) for (const k of reads) if (k !== targetKey) deps.set(k, 'done');
    const since = (info.writes.get(targetKey) || []).filter((w) => w < frame.index).pop() ?? -1;
    for (const call of childCalls(exec).get(frame.callId) || []) {
      if (call.enter > frame.index) break;
      if (call.enter <= since) continue;
      const cell = cellOfCall(call, rowNames, colNames, rows.length, cols);
      if (!cell || cell === targetKey) continue;
      deps.set(cell, call.exit !== null && call.exit <= frame.index ? 'done' : 'running');
    }
  }

  // ---- cell text and sizes (fixed, so arrows can be placed without measuring the page)
  const cells = Array.from({ length: showRows }, (_, i) => Array.from({ length: showCols }, (_, j) => {
    const v = rows[i] && rows[i].elems ? rows[i].elems[j] : undefined;
    return { v, text: v === undefined ? '' : cellText(v, heap) };
  }));
  const axes = axisLabels({ frame, exec, view, rows: rows.length, cols, showRows, showCols, rowNames, colNames, heap });
  const longest = (list) => list.reduce((m, t) => Math.max(m, String(t).length), 1);
  const widest = Math.max(longest(cells.flat().map((c) => c.text)), axes.cols ? longest(axes.cols.slice(0, showCols)) : 1);
  const cw = Math.min(96, Math.max(34, Math.ceil(7.6 * widest) + 16));
  const hh = axes.cols ? 38 : 22;
  const hw = Math.max(34, 18 + 8 * String(Math.max(0, showRows - 1)).length + (axes.rows ? 8 * longest(axes.rows.slice(0, showRows)) + 6 : 0));
  const center = (i, j) => [hw + j * cw + cw / 2, hh + i * CELL_H + CELL_H / 2];

  const seen = new Set();
  const flag = (cls) => { seen.add(cls); return cls; };
  const head = [
    h('div', { class: 'mx-corner', title: 'rows ↓ · columns →' }, [...rowNames][0] && [...colNames][0] ? `${[...rowNames][0]}↓ ${[...colNames][0]}→` : ''),
    ...Array.from({ length: showCols }, (_, j) => h('div', { class: ['mx-ch', cv && cv.value === j && 'cur'] },
      axes.cols ? h('b', null, axes.cols[j] ?? '') : null, h('span', { class: 'mx-ix' }, j))),
  ];
  const body = cells.flatMap((row, i) => [
    h('div', { class: ['mx-rh', rv && rv.value === i && 'cur'] }, h('span', { class: 'mx-ix' }, i), axes.rows ? h('b', null, axes.rows[i] ?? '') : null),
    ...row.map(({ v, text }, j) => {
      const key = `${i},${j}`;
      const x = scalar(v);
      const isWrite = writes.has(key);
      const isCur = key === curKey;
      const dep = deps.get(key);
      const unused = info.written && !info.touched.has(key) && !isWrite && !isCur && !waiting.has(key) && !dep && !reads.has(key) && v !== undefined && isFiller(v, info.bg);
      return h('div', {
        class: [
          'mx-c',
          isWrite && flag('write'),
          !isWrite && reads.has(key) && flag('read'),
          dep && flag(`dep-${dep}`),
          isCur && flag('cur'),
          waiting.has(key) && flag('wait'),
          rv && !cv && rv.value === i && 'row-cur',
          (x === 0 || x === false || x === '0') && 'zero',
          x === true && 'truthy',
          infinityOf(v) && 'inf',
          unused && flag('unused'),
        ],
        title: infinityOf(v) ? `${name}[${i}][${j}] = ${fmt(v, heap, 0)}` : undefined,
      }, text);
    }),
  ]);

  const arrows = arrowLayer(deps, targetKey, showRows, showCols, hw + showCols * cw, hh + showRows * CELL_H, center);
  const grid = h('div', {
    class: 'mxg',
    style: { gridTemplateColumns: `${hw}px repeat(${showCols}, ${cw}px)`, gridTemplateRows: `${hh}px repeat(${showRows}, ${CELL_H}px)` },
  }, head, body);
  const table = h('div', { class: 'mxg-wrap', style: { width: `${hw + showCols * cw}px`, height: `${hh + showRows * CELL_H}px` } }, grid, arrows);

  const chips = [
    ['cur', 'current cell'], ['wait', 'waiting on a sub-problem'], ['write', 'just written'],
    ['read', 'read'], ['dep-done', 'sub-problem'], ['unused', 'never touched'],
  ].filter(([k]) => seen.has(k));
  const legend = chips.length
    ? h('div', { class: 'mx-legend' }, chips.map(([k, text]) => h('span', { class: `mx-key ${k}` }, text)))
    : null;

  // ---- caption: what was just computed from what
  const label = (key) => { const [i, j] = key.split(',').map(Number); return `${name}[${i}][${j}]`; };
  let caption = null;
  if (writes.size) {
    const [i, j] = writeKeys[0].split(',').map(Number);
    const self = `${name}[${i}][${j}]`;
    const fromCalls = [...deps].filter(([k, state]) => state === 'done' && !reads.has(k)).map(([k]) => label(k));
    const needs = [...new Set([...readLabels(frame, view).filter((l) => l !== self), ...fromCalls])];
    caption = h('span', null, `${self} = ${cellText(rows[i].elems[j], heap)}`, needs.length ? '  ← ' : '', h('span', { class: 'dep' }, needs.join(', ')));
  } else if (rv && cv) {
    const needs = [...deps].map(([k, state]) => label(k) + (state === 'running' ? '…' : ''));
    caption = h('span', null, `current: ${name}[${rv.name}=${rv.value}][${cv.name}=${cv.value}]`, needs.length ? '  ← ' : '', h('span', { class: 'dep' }, needs.join(', ')));
  }

  const toggle = croppable
    ? h('button', {
      type: 'button', class: 'view-action',
      title: full ? 'Show only the part of the table the run used' : 'Show the whole allocated table',
      onclick: () => { const set = fullSet(exec); if (set.has(view.key)) set.delete(view.key); else set.add(view.key); if (ctx.rerender) ctx.rerender(); },
    }, full ? `used ${usedRows}×${usedCols}` : `all ${rows.length}×${cols}`)
    : null;
  const clipped = showRows < wantRows || showCols < wantCols;

  return viewShell(view, ctx, {
    type: `${tableType(outer, rows, cols)}${trimmed ? ` · showing ${showRows}×${showCols}` : ''}${clipped ? ` (first ${showRows}×${showCols})` : ''}`,
    actions: toggle,
    body: h('div', { class: 'view-scroll' }, table, legend),
    caption,
  });
}

/** "int[102][102]" for an array of arrays; the container name plus the size for lists. */
function tableType(outer, rows, cols) {
  const sample = rows.find((r) => r && r.type);
  if (outer.kind === 'array' && sample && /\[\]$/.test(sample.type)) return `${sample.type.replace(/\[\]$/, '')}[${rows.length}][${cols}]`;
  const kind = outer.type ? outer.type.replace(/\[\]$/, '') : 'table';
  return `${kind} ${rows.length}×${cols}`;
}

/** Arrows from each sub-problem cell to the cell being built, curved a little so crossing ones stay readable. */
function arrowLayer(deps, targetKey, showRows, showCols, width, height, center) {
  if (!targetKey || !deps.size) return null;
  const [ti, tj] = targetKey.split(',').map(Number);
  if (ti >= showRows || tj >= showCols) return null;
  const { svg, marker } = svgCanvas(width, height, 'mx-arrows');
  const [tx, ty] = center(ti, tj);
  for (const [key, state] of deps) {
    const [i, j] = key.split(',').map(Number);
    if (i >= showRows || j >= showCols) continue;
    const [sx, sy] = center(i, j);
    const len = Math.hypot(tx - sx, ty - sy);
    if (!len) continue;
    const [ax, ay, bx, by] = trimLine(sx, sy, tx, ty, Math.min(9, len * 0.25), Math.min(13, len * 0.35));
    const cx = (ax + bx) / 2 - (by - ay) * 0.16;
    const cy = (ay + by) / 2 + (bx - ax) * 0.16;
    svg.appendChild(s('path', { class: state === 'running' ? 'running' : null, d: `M${ax},${ay} Q${cx},${cy} ${bx},${by}`, 'marker-end': marker }));
  }
  return svg;
}

/**
 * Labels for the rows and columns, or null. The usual source is the input the DP walks: a string one shorter than the
 * axis (LCS, edit distance; index 0 is the empty prefix), or an array the code indexes with this axis's variables.
 */
function axisLabels({ frame, exec, view, rows, cols, showRows, showCols, rowNames, colNames, heap }) {
  const strings = frame.top ? Object.entries(frame.top.locals).map(([n, v]) => [n, scalar(v)]).filter(([, v]) => typeof v === 'string') : [];
  const rowString = rows > 1 ? strings.find(([, v]) => v.length === rows - 1) : null;
  const colString = cols > 1 ? strings.find(([n, v]) => v.length === cols - 1 && (!rowString || n !== rowString[0])) || strings.find(([, v]) => v.length === cols - 1) : null;
  const ofString = (str) => ['""', ...str[1].split('')];

  const arrays = [];
  for (const b of rootBindings(frame)) {
    const a = isRef(b.value) && b.value.ref !== view.id ? heap[b.value.ref] : null;
    if (!a || (a.kind !== 'array' && a.kind !== 'list') || !(a.elems || []).length || a.elems.some(isRef)) continue;
    arrays.push({ name: b.name.replace(/^this\./, ''), elems: a.elems });
  }
  const ofArray = (names, count, shown) => {
    for (const a of arrays) {
      if (![...exec.src.rowVars(a.name)].some((v) => names.has(v))) continue;
      const labels = a.elems.map((v) => cellText(v, heap));
      if (a.elems.length === count - 1) return ['·', ...labels];
      if (a.elems.length >= shown) return labels;
    }
    return null;
  };
  return {
    rows: rowString ? ofString(rowString) : ofArray(rowNames, rows, showRows),
    cols: colString ? ofString(colString) : ofArray(colNames, cols, showCols),
  };
}
