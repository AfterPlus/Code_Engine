// Variables of the active frame (+ `this` fields and globals). Changed values show "old → new".

import { h, mount } from '../util/dom.js';
import { fmt, isRef, valueClass } from '../util/values.js';

function valueNode(v, heap) {
  return h('span', { class: valueClass(v), title: isRef(v) ? '#' + v.ref : undefined }, fmt(v, heap, 1));
}

function row(name, v, change, frame, prevHeap) {
  const cls = change ? (change.kind === 'declare' ? 'declared' : 'changed') : null;
  return h('tr', { class: cls },
    h('td', { class: 'name' }, name),
    h('td', { class: 'val' },
      change && change.kind === 'update' ? [h('span', { class: 'from' }, fmt(change.from, prevHeap, 1)), h('span', { class: 'arrow' }, '→')] : null,
      valueNode(v, frame.heap)));
}

export function renderVariables(el, frame, exec, prev) {
  if (!frame || !frame.top) return mount(el, h('div', { class: 'empty-note' }, 'No variables yet.'));
  const top = frame.top;
  const changes = frame.changes.locals.get(top.id) || new Map();
  const prevHeap = prev ? prev.heap : frame.heap;
  const rows = [h('tr', { class: 'section' }, h('td', { colspan: 2 }, `${top.name}()  ·  line ${top.line}`))];
  const entries = Object.entries(top.locals).filter(([n]) => n !== 'this');
  if (!entries.length) rows.push(h('tr', null, h('td', { colspan: 2, class: 'name' }, '(no locals)')));
  for (const [n, v] of entries) rows.push(row(n, v, changes.get(n), frame, prevHeap));

  if (frame.rawEvent === 'FUNCTION_EXIT') {
    rows.push(h('tr', { class: 'declared' }, h('td', { class: 'name' }, '⮐ return'), h('td', { class: 'val' }, frame.returnValue === undefined ? 'void' : valueNode(frame.returnValue, frame.heap))));
  }

  const self = top.locals.this;
  if (isRef(self) && frame.heap[self.ref]?.fields) {
    const o = frame.heap[self.ref];
    const c = frame.changes.heap.get(self.ref);
    rows.push(h('tr', { class: 'section' }, h('td', { colspan: 2 }, `this (${o.type})`)));
    for (const [n, v] of Object.entries(o.fields)) {
      rows.push(row(n, v, c && c.type === 'fields' && c.fields.includes(n) ? { kind: 'update', from: prev?.heap[self.ref]?.fields?.[n] } : null, frame, prevHeap));
    }
  }
  const globals = Object.entries(frame.globals || {});
  if (globals.length) {
    rows.push(h('tr', { class: 'section' }, h('td', { colspan: 2 }, 'globals / static')));
    const gc = frame.changes.globals || new Map();
    for (const [n, v] of globals) rows.push(row(n, v, gc.get(n), frame, prevHeap));
  }
  return mount(el, h('table', { class: 'vars' }, h('tbody', null, rows)));
}
