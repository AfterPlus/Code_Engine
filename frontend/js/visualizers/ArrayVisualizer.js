// 1D arrays and lists: pointers from the code, range shading, reads, writes, swaps, and dependency captions.

import { h } from '../util/dom.js';
import { isRef, scalar, typeLabel } from '../util/values.js';
import { viewShell, heapChange, readsOf, lookupsOf, cellText, intVars, changedLocal } from './common.js';

export function renderArray(view, ctx) {
  const { frame, exec } = ctx;
  const heap = frame.heap;
  const arr = heap[view.id];
  const elems = arr.elems || [];
  const len = elems.length;

  // pointers: integer variables the source uses to index this array (or derived from those)
  const candidates = new Set();
  view.names.forEach((n) => exec.src.pointerVars(n.replace(/^this\./, '')).forEach((v) => candidates.add(v)));
  const ints = intVars(frame);
  const pointers = new Map();
  for (const [name, value] of ints) {
    if (!candidates.has(name) || value < 0 || value > len) continue;
    if (!pointers.has(value)) pointers.set(value, []);
    pointers.get(value).push(name);
  }
  const inRange = [...pointers.keys()].filter((i) => i < len);
  const range = inRange.length >= 2 ? [Math.min(...inRange), Math.max(...inRange)] : null;

  const change = heapChange(frame, view.id);
  const writes = new Set(change && ['write', 'append', 'prepend', 'swap'].includes(change.type) ? change.indices : []);
  const isSwap = change && change.type === 'swap';
  const reads = readsOf(frame, view.id);
  const lookups = lookupsOf(frame, view.id);
  lookups.forEach((l) => { if (l.keyIndex >= 0) reads.add(l.keyIndex); });

  const cells = [];
  for (let i = 0; i <= len; i++) {
    const isEnd = i === len;
    if (isEnd && !pointers.has(i)) break;
    const v = elems[i];
    const names = pointers.get(i) || [];
    const cls = ['arr-val',
      isEnd && 'empty',
      !isEnd && range && i >= range[0] && i <= range[1] && 'in-range',
      reads.has(i) && 'read',
      writes.has(i) && (isSwap ? 'swap' : 'write'),
      !isEnd && isRef(v) && 'ref'];
    cells.push(h('div', { class: 'arr-cell' },
      h('div', { class: 'arr-idx' }, isEnd ? '' : i),
      h('div', { class: cls, title: isEnd ? 'end' : undefined }, isEnd ? '·' : cellText(v, heap)),
      h('div', { class: 'arr-ptrs' }, names.map((n) => h('span', { class: ['ptr', changedLocal(frame, n) && 'changed'] }, n)))));
  }
  if (arr.truncated) cells.push(h('div', { class: 'arr-more' }, `… ${arr.length - len} more`));

  const ops = lookups.map((l) => ({ text: l.text }));
  if (change && (change.type === 'popBack' || change.type === 'popFront')) ops.push({ text: `removed ${change.removed.map((x) => cellText(x, heap)).join(', ')}`, write: true });
  const nums = elems.map(scalar);
  const sorted = len > 2 && !arr.truncated && nums.every((x, i) => typeof x === 'number' && (i === 0 || nums[i - 1] <= x));

  return viewShell(view, ctx, {
    type: typeLabel(arr),
    ops,
    badge: sorted ? 'sorted' : null,
    body: h('div', { class: 'view-scroll' }, h('div', { class: 'arr', style: { gridTemplateColumns: `repeat(${cells.length}, auto)` } }, cells)),
    caption: dependencyCaption(view, ctx, writes),
  });
}

/** "dp[4] = 5  <-  dp[3], dp[2]" when a write and element reads happened on the same line. */
function dependencyCaption(view, ctx, writes) {
  const { frame } = ctx;
  if (!writes.size || !frame.ops.reads.length) return null;
  const heap = frame.heap;
  const target = [...writes][0];
  const deps = readLabels(frame, view);
  if (!deps.length) return null;
  return h('span', null, `${view.names[0]}[${target}] = ${cellText((heap[view.id].elems || [])[target], heap)}  ← `,
    h('span', { class: 'dep' }, deps.join(', ')));
}

/** Labels like "dp[2]" or "grid[1][3]" for the element reads of the frame's previous line. */
export function readLabels(frame, view) {
  const reads = frame.ops.reads;
  // an outer read that was only the first half of a[i][j] is not a dependency on its own
  const inner = reads.filter((r) => !reads.some((o) => o.parent && o.parent.heapId === r.heapId && o.parent.index === r.index));
  const labels = inner.map((r) => (r.parent
    ? `${nameFor(frame, r.parent.heapId, view)}[${r.parent.index}][${r.index}]`
    : `${nameFor(frame, r.heapId, view)}[${r.index}]`));
  return [...new Set(labels)];
}

function nameFor(frame, heapId, view) {
  if (heapId === view.id) return view.names[0];
  const top = frame.top;
  if (top) for (const [n, v] of Object.entries(top.locals)) if (isRef(v) && v.ref === heapId) return n;
  return '?';
}
