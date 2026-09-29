// Hash maps / dictionaries (key → value table) and sets (chips), with put/get/remove/contains highlighted.

import { h } from '../util/dom.js';
import { keyOf, typeLabel } from '../util/values.js';
import { viewShell, heapChange, lookupsOf, cellText } from './common.js';

export function renderMap(view, ctx) {
  const { frame, prev } = ctx;
  const heap = frame.heap;
  const m = heap[view.id];
  const entries = view.objectAsMap
    ? Object.entries(m.fields || {}).map(([k, v]) => [{ str: k }, v])
    : m.entries || [];
  const change = heapChange(frame, view.id);
  const lookups = lookupsOf(frame, view.id);
  const lookupKeys = new Set(lookups.map((l) => l.key !== undefined && keyOf(l.key)));

  const cls = (k) => {
    const key = keyOf(k);
    if (change && change.type === 'map' && change.added.includes(key)) return 'added';
    if (change && change.type === 'map' && change.changed.includes(key)) return 'changed';
    if (change && change.type === 'fields' && change.fields.includes(k.str)) return 'changed';
    if (lookupKeys.has(key)) return 'lookup';
    return null;
  };

  const rows = entries.slice(0, 80).map(([k, v]) => h('tr', { class: cls(k) },
    h('td', null, cellText(k, heap)), h('td', null, cellText(v, heap))));
  // removed entries linger for one frame, struck through
  if (change && change.type === 'map' && change.removed.length && prev) {
    const old = prev.heap[view.id];
    for (const [k, v] of old.entries || []) {
      if (change.removed.includes(keyOf(k))) rows.push(h('tr', { class: 'removed' }, h('td', null, cellText(k, prev.heap)), h('td', null, cellText(v, prev.heap))));
    }
  }
  // a lookup that missed: show the probed key
  for (const l of lookups) {
    if (l.keyIndex < 0 && l.key !== undefined) rows.push(h('tr', { class: 'miss lookup' }, h('td', null, cellText(l.key, heap)), h('td', null, 'not found')));
  }
  if (entries.length > 80) rows.push(h('tr', null, h('td', { colspan: 2, class: 'arr-more' }, `… ${entries.length - 80} more`)));

  return viewShell(view, ctx, {
    type: view.objectAsMap ? `Object(${entries.length})` : typeLabel(m),
    ops: lookups.map((l) => ({ text: l.text })),
    body: entries.length || rows.length
      ? h('table', { class: 'kv' }, h('thead', null, h('tr', null, h('th', null, 'Key'), h('th', null, 'Value'))), h('tbody', null, rows))
      : h('div', { class: 'q-empty' }, 'empty'),
  });
}

export function renderSet(view, ctx) {
  const { frame, prev } = ctx;
  const heap = frame.heap;
  const set = heap[view.id];
  const change = heapChange(frame, view.id);
  const lookups = lookupsOf(frame, view.id);
  const lookupKeys = new Set(lookups.map((l) => l.key !== undefined && keyOf(l.key)));
  const chips = (set.elems || []).slice(0, 150).map((v) => {
    const k = keyOf(v);
    return h('span', { class: ['chip', change && change.added.includes(k) && 'added', lookupKeys.has(k) && 'lookup'] }, cellText(v, heap));
  });
  if (change && change.removed.length && prev) {
    for (const v of prev.heap[view.id].elems || []) if (change.removed.includes(keyOf(v))) chips.push(h('span', { class: 'chip removed' }, cellText(v, prev.heap)));
  }
  return viewShell(view, ctx, {
    type: typeLabel(set),
    ops: lookups.map((l) => ({ text: l.text })),
    body: chips.length ? h('div', { class: 'chips' }, chips) : h('div', { class: 'q-empty' }, 'empty'),
  });
}
