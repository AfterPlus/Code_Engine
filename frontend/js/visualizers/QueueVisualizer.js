// FIFO queues and deques (front on the left), and priority queues as their backing array or heap tree.

import { h } from '../util/dom.js';
import { isRef, typeLabel, fmt } from '../util/values.js';
import { viewShell, heapChange, lookupsOf, cellText } from './common.js';
import { drawBinaryTree } from './TreeVisualizer.js';

export function renderQueue(view, ctx) {
  const { frame, prev } = ctx;
  const heap = frame.heap;
  const q = heap[view.id];
  const elems = q.elems || [];
  const change = heapChange(frame, view.id);
  const pushed = new Set(change && (change.type === 'append' || change.type === 'prepend') ? change.indices : []);
  const isDeque = q.kind === 'deque';

  const cells = [];
  if (change && change.type === 'popFront') change.removed.forEach((v) => cells.push(cell(cellText(v, prev.heap), 'popped', 'out')));
  elems.forEach((v, i) => {
    const end = i === 0 && i === elems.length - 1 ? (isDeque ? 'front/back' : 'front · back') : i === 0 ? (isDeque ? 'FRONT' : 'FRONT') : i === elems.length - 1 ? 'BACK' : '';
    cells.push(cell(cellText(v, heap), pushed.has(i) ? 'pushed' : null, end));
  });
  if (change && change.type === 'popBack') change.removed.forEach((v) => cells.push(cell(cellText(v, prev.heap), 'popped', 'out')));

  return viewShell(view, ctx, {
    type: typeLabel(q) + (isDeque ? ' · deque' : ''),
    ops: lookupsOf(frame, view.id).map((l) => ({ text: l.text })),
    body: elems.length || cells.length ? h('div', { class: 'view-scroll' }, h('div', { class: 'q' }, cells)) : h('div', { class: 'q-empty' }, 'empty queue'),
  });
}

function cell(text, cls, end) {
  return h('div', { class: ['q-cell', cls] }, h('div', { class: 'q-end' }, end || ''), h('div', { class: 'q-val' }, text));
}

export function renderPriorityQueue(view, ctx) {
  const { frame } = ctx;
  const heap = frame.heap;
  const pq = heap[view.id];
  const elems = pq.elems || [];
  let body;
  if (view.mode === 'tree' && elems.length) {
    const nodes = new Map();
    elems.forEach((v, i) => nodes.set(String(i), {
      label: isRef(v) ? cellText(v, heap) : fmt(v, heap, 0),
      left: 2 * i + 1 < elems.length ? String(2 * i + 1) : null,
      right: 2 * i + 2 < elems.length ? String(2 * i + 2) : null,
      cls: i === 0 ? ['pointed'] : [],
    }));
    body = drawBinaryTree(nodes, ['0'], new Map([['0', ['top']]]));
  } else {
    body = elems.length
      ? h('div', { class: 'view-scroll' }, h('div', { class: 'q' }, elems.map((v, i) => cell(cellText(v, heap), null, i === 0 ? 'TOP' : String(i)))))
      : h('div', { class: 'q-empty' }, 'empty');
  }
  const change = heapChange(frame, view.id);
  return viewShell(view, ctx, {
    type: typeLabel(pq) + ' · heap order',
    ops: [...lookupsOf(frame, view.id).map((l) => ({ text: l.text })), ...(change ? [{ text: frame.desc.find((d) => d.startsWith(view.names[0])) || 'changed', write: true }] : [])],
    body,
  });
}
