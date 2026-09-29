// LIFO stacks, drawn vertically with the top at the top. Push flashes in; a popped item lingers struck through.
// Works for Stack (top = last element) and for a Deque used via push/pop (top = first element).

import { h } from '../util/dom.js';
import { typeLabel } from '../util/values.js';
import { viewShell, heapChange, lookupsOf, cellText } from './common.js';

export function renderStack(view, ctx) {
  const { frame, prev } = ctx;
  const heap = frame.heap;
  const st = heap[view.id];
  const topFirst = st.kind === 'deque';
  const raw = st.elems || [];
  const elems = topFirst ? [...raw].reverse() : raw; // bottom -> top
  const change = heapChange(frame, view.id);
  const pushedRaw = change && (change.type === (topFirst ? 'prepend' : 'append')) ? change.indices : [];
  const pushed = new Set(pushedRaw.map((i) => (topFirst ? raw.length - 1 - i : i)));
  const popped = change && change.type === (topFirst ? 'popFront' : 'popBack') ? change.removed : [];
  const lookups = lookupsOf(frame, view.id);

  const items = elems.map((v, i) => h('div', {
    class: ['stk-item', i === elems.length - 1 && 'top', pushed.has(i) && 'pushed'],
  }, cellText(v, heap), i === elems.length - 1 ? h('span', { class: 'stk-label' }, lookups.length ? '← top (peek)' : '← top') : null));
  (topFirst ? [...popped].reverse() : popped).forEach((v) => items.push(h('div', { class: 'stk-item popped' }, cellText(v, prev.heap), h('span', { class: 'stk-label' }, 'popped'))));

  return viewShell(view, ctx, {
    type: typeLabel(st) + (topFirst ? ' · used as stack' : ''),
    ops: lookups.map((l) => ({ text: l.text })),
    body: items.length ? h('div', { class: 'stk', style: { marginRight: '90px' } }, items) : h('div', { class: 'stk-empty' }, 'empty stack'),
  });
}
