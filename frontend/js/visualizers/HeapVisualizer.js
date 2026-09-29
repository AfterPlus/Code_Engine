// Stack frames on the left, heap objects on the right, and an arrow for every reference.

import { h, s, mount, clear } from '../util/dom.js';
import { fmt, isRef, valueClass } from '../util/values.js';
import { objectCard } from './ObjectVisualizer.js';

const MAX_OBJECTS = 60;

export function renderHeap(el, frame) {
  if (!frame || !frame.stack.length) return mount(el, h('div', { class: 'empty-note' }, 'Nothing in memory yet.'));
  const heap = frame.heap;
  const refs = []; // [sourceEl, targetId]
  const refCell = (v) => {
    if (!isRef(v)) return h('span', { class: valueClass(v) }, fmt(v, heap, 0));
    const dot = h('span', { class: 'ref-dot', title: '#' + v.ref });
    refs.push([dot, v.ref]);
    return dot;
  };

  const frames = [...frame.stack].reverse().map((f, i) => h('div', { class: ['obj', 'heap-frame', i === 0 && 'active'] },
    h('div', { class: 'obj-title' }, f.name + '()', h('span', { class: 'obj-id' }, 'line ' + f.line)),
    Object.entries(f.locals).map(([n, v]) => h('div', { class: 'obj-row' }, h('span', { class: 'k' }, n), refCell(v)))));
  const globals = Object.entries(frame.globals || {});
  if (globals.length) {
    frames.push(h('div', { class: 'obj heap-frame' }, h('div', { class: 'obj-title' }, 'globals'),
      globals.map(([n, v]) => h('div', { class: 'obj-row' }, h('span', { class: 'k' }, n), refCell(v)))));
  }

  // objects in discovery order from the frames
  const order = [];
  const seen = new Set();
  const visit = (v) => {
    if (!isRef(v) || seen.has(v.ref) || !heap[v.ref] || order.length >= MAX_OBJECTS) return;
    seen.add(v.ref);
    order.push(v.ref);
    const o = heap[v.ref];
    (o.elems || []).forEach(visit);
    (o.entries || []).forEach(([k, x]) => { visit(k); visit(x); });
    Object.values(o.fields || {}).forEach(visit);
  };
  frame.stack.slice().reverse().forEach((f) => Object.values(f.locals).forEach(visit));
  globals.forEach(([, v]) => visit(v));

  const cards = new Map();
  const objects = order.map((id) => {
    const o = heap[id];
    let card;
    if (o.kind === 'object') {
      card = objectCard(o, heap, frame.changes.heap.get(id));
      // replace field values that are references with dots
      const rows = card.querySelectorAll('.obj-row');
      Object.values(o.fields || {}).forEach((v, i) => {
        if (isRef(v) && rows[i]) { const span = rows[i].lastChild; span.replaceWith(refCell(v)); }
      });
    } else if (o.elems) {
      card = h('div', { class: 'obj' },
        h('div', { class: 'obj-title' }, o.type, h('span', { class: 'obj-id' }, '#' + id)),
        h('div', { class: 'obj-row' }, h('div', { class: 'inline-arr' }, o.elems.slice(0, 24).map((v) => h('span', null, refCell(v))), o.elems.length > 24 ? h('span', null, '…') : null)));
    } else if (o.entries) {
      card = h('div', { class: 'obj' },
        h('div', { class: 'obj-title' }, o.type, h('span', { class: 'obj-id' }, '#' + id)),
        o.entries.slice(0, 24).map(([k, v]) => h('div', { class: 'obj-row' }, h('span', { class: 'k' }, refCell(k)), refCell(v))));
    } else {
      card = objectCard(o, heap, null);
    }
    cards.set(id, card);
    return card;
  });

  const arrows = s('svg', { class: 'heap-arrows' });
  const view = h('div', { class: 'heapview' },
    h('div', { class: 'heap-col' }, h('h3', null, 'Stack'), frames),
    h('div', { class: 'heap-col objects' }, h('h3', null, 'Heap'), objects.length ? objects : h('div', { class: 'empty-note' }, 'no objects')),
    arrows);
  mount(el, view);

  // draw arrows once laid out
  requestAnimationFrame(() => {
    clear(arrows);
    const base = view.getBoundingClientRect();
    arrows.setAttribute('width', view.scrollWidth);
    arrows.setAttribute('height', view.scrollHeight);
    for (const [dot, id] of refs) {
      const target = cards.get(id);
      if (!target || !dot.isConnected) continue;
      const a = dot.getBoundingClientRect();
      const b = target.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - base.left;
      const y1 = a.top + a.height / 2 - base.top;
      const toLeft = b.left - base.left > x1;
      const x2 = toLeft ? b.left - base.left : b.right - base.left;
      const y2 = b.top - base.top + 12;
      const mx = (x1 + x2) / 2;
      arrows.appendChild(s('path', { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: frame.changes.heap.has(id) ? 'hl' : '' }));
    }
  });
  return el;
}
