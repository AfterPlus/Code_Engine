// Any other object: a card of its fields, with the ones that just changed highlighted.

import { h } from '../util/dom.js';
import { viewShell, cellText } from './common.js';

export function objectCard(o, heap, change, title) {
  const changed = new Set(change && change.type === 'fields' ? change.fields : []);
  return h('div', { class: 'obj' },
    h('div', { class: 'obj-title' }, title || o.type, h('span', { class: 'obj-id' }, '#' + o.id)),
    o.kind === 'object'
      ? Object.entries(o.fields || {}).map(([k, v]) => h('div', { class: ['obj-row', changed.has(k) && 'changed'] }, h('span', { class: 'k' }, k), h('span', null, cellText(v, heap))))
      : h('div', { class: 'obj-row' }, h('span', { class: 'k' }, o.kind)));
}

export function renderObject(view, ctx) {
  const { frame } = ctx;
  const o = frame.heap[view.id];
  return viewShell(view, ctx, { type: o.type, body: objectCard(o, frame.heap, frame.changes.heap.get(view.id)) });
}
