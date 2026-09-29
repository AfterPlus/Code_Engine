// 2D arrays / lists of lists as a table: DP tables, grids, boards. The current cell comes from the variables the
// code uses as row/column indices; reads and writes come from the trace, so 1D and 2D DP need no special cases.

import { h } from '../util/dom.js';
import { isRef, scalar, typeLabel } from '../util/values.js';
import { viewShell, heapChange, cellText, intVars } from './common.js';
import { readLabels } from './ArrayVisualizer.js';

export function renderMatrix(view, ctx) {
  const { frame, exec } = ctx;
  const heap = frame.heap;
  const outer = heap[view.id];
  const rows = (outer.elems || []).map((e) => (isRef(e) ? heap[e.ref] : null));
  const rowIndex = new Map();
  (outer.elems || []).forEach((e, i) => { if (isRef(e)) rowIndex.set(e.ref, i); });
  const cols = Math.max(0, ...rows.map((r) => (r && r.elems ? r.elems.length : 0)));

  const writes = new Set();
  const reads = new Set();
  for (const [id, c] of frame.changes.heap) {
    if (rowIndex.has(id) && c.indices) c.indices.forEach((j) => writes.add(`${rowIndex.get(id)},${j}`));
  }
  for (const r of frame.ops.reads) if (rowIndex.has(r.heapId)) reads.add(`${rowIndex.get(r.heapId)},${r.index}`);

  // current cell: variables used as the first / second index of this table in the source
  const name = view.names[0].replace(/^this\./, '');
  const ints = intVars(frame);
  const pick = (vars, limit) => {
    for (const v of vars) if (ints.has(v) && ints.get(v) >= 0 && ints.get(v) < limit) return { name: v, value: ints.get(v) };
    return null;
  };
  const rv = pick(exec.src.rowVars(name), rows.length);
  const cv = pick(exec.src.colVars(name), cols);

  // axis labels: a string whose length is rows-1 / cols-1 is almost always the DP's input (LCS, edit distance)
  const strings = frame.top ? Object.entries(frame.top.locals).map(([n, v]) => [n, scalar(v)]).filter(([, v]) => typeof v === 'string') : [];
  const axis = (n) => {
    const s = strings.find(([, v]) => v.length === n - 1);
    return s ? ['""', ...s[1].split('')] : null;
  };
  const rowLabels = rows.length > 1 ? axis(rows.length) : null;
  let colLabels = cols > 1 ? axis(cols) : null;
  if (rowLabels && colLabels && rowLabels.join() === colLabels.join() && strings.length > 1) {
    const other = strings.filter(([, v]) => v.length === cols - 1)[1];
    if (other) colLabels = ['""', ...other[1].split('')];
  }

  const maxRows = 40;
  const maxCols = 40;
  const head = h('tr', null, h('th'), Array.from({ length: Math.min(cols, maxCols) }, (_, j) =>
    h('th', null, colLabels ? h('div', null, colLabels[j], h('br'), h('small', null, j)) : j)));
  const body = rows.slice(0, maxRows).map((row, i) => h('tr', null,
    h('th', null, rowLabels ? `${rowLabels[i]} ${i}` : i),
    Array.from({ length: Math.min(cols, maxCols) }, (_, j) => {
      const v = row && row.elems ? row.elems[j] : undefined;
      const key = `${i},${j}`;
      const x = scalar(v);
      return h('td', {
        class: [
          writes.has(key) && 'write',
          !writes.has(key) && reads.has(key) && 'read',
          rv && cv && rv.value === i && cv.value === j && 'cur',
          rv && !cv && rv.value === i && 'row-cur',
          (x === 0 || x === false || x === '0') && 'zero',
          x === true && 'truthy',
        ],
      }, v === undefined ? '' : cellText(v, heap));
    })));

  let caption = null;
  if (writes.size) {
    const [i, j] = [...writes][0].split(',').map(Number);
    const deps = readLabels(frame, view).filter((l) => l !== `${view.names[0]}[${i}][${j}]`);
    const value = cellText(rows[i].elems[j], heap);
    caption = h('span', null, `${view.names[0]}[${i}][${j}] = ${value}`, deps.length ? '  ← ' : '', h('span', { class: 'dep' }, deps.join(', ')));
  } else if (rv && cv) {
    caption = `current: ${view.names[0]}[${rv.name}=${rv.value}][${cv.name}=${cv.value}]`;
  }
  const truncated = rows.length > maxRows || cols > maxCols ? ` (showing ${Math.min(rows.length, maxRows)}×${Math.min(cols, maxCols)})` : '';

  return viewShell(view, ctx, {
    type: typeLabel(outer).replace(/\(\d+\)$/, '') + ` ${rows.length}×${cols}${truncated}`,
    body: h('div', { class: 'view-scroll' }, h('table', { class: 'mx' }, h('thead', null, head), h('tbody', null, body))),
    caption,
  });
}
