import { h, s } from '../util/dom.js';
import { fmt, isRef, nodeLabel, summarize, typeLabel } from '../util/values.js';

/** Card chrome shared by every structure view: title, type, live operation labels, mode switcher. */
export function viewShell(view, ctx, { type, ops = [], badge, actions, body, caption, wide }) {
  const modes = view.modes && view.modes.length > 1
    ? h('div', { class: 'view-modes', role: 'group', 'aria-label': 'View as' },
      view.modes.map((m) => h('button', {
        type: 'button', 'aria-pressed': String((view.mode || view.kind) === m),
        onclick: () => ctx.onMode(view.key, m),
      }, MODE_LABELS[m] || m)))
    : null;
  return h('div', { class: ['view', wide && 'wide'], dataset: { kind: view.kind } },
    h('div', { class: 'view-head' },
      h('span', { class: 'view-name' }, view.title),
      type ? h('span', { class: 'view-type' }, type) : null,
      ops.map((o) => h('span', { class: ['view-op', o.write && 'write'] }, o.text)),
      badge ? h('span', { class: 'view-badge' }, badge) : null,
      h('span', { class: 'view-tail' }, actions || null, modes)),
    body,
    caption ? h('div', { class: 'view-caption' }, caption) : null);
}

const MODE_LABELS = { matrix: 'Table', graph: 'Graph', edges: 'Edges', map: 'Table', array: 'Array', tree: 'Tree' };

export const heapChange = (frame, id) => frame.changes.heap.get(id) || null;
export const readsOf = (frame, id) => new Set(frame.ops.reads.filter((r) => r.heapId === id).map((r) => r.index));
export const lookupsOf = (frame, id) => frame.ops.lookups.filter((l) => l.heapId === id);

/**
 * "∞" / "−∞" for INT_MAX, INT_MIN, Long extremes and real infinities: a DP's "not computed yet" or "unreachable".
 * Spelled out they are ten digits wide and drown the table. Null for every other value.
 */
export function infinityOf(v) {
  let x = v;
  if (v && typeof v === 'object' && 'n' in v) x = /^[-+]?inf/i.test(v.n) ? (v.n[0] === '-' ? -Infinity : Infinity) : Number(v.n);
  if (typeof x !== 'number') return null;
  if (x === Infinity || x === 2147483647 || x === 2 ** 63) return '∞';
  if (x === -Infinity || x === -2147483648 || x === -(2 ** 63)) return '−∞';
  return null;
}

/** Compact text for a value inside a cell. */
export function cellText(v, heap) {
  const inf = infinityOf(v);
  if (inf) return inf;
  if (isRef(v)) {
    const t = heap[v.ref];
    if (!t) return '→';
    if (t.kind === 'object') return '→' + nodeLabel(t);
    const short = summarize(t, heap, 1);
    return short.length <= 18 ? short : typeLabel(t);
  }
  // single characters read better bare inside a grid cell: 1 rather than "1" or '1'
  if (v && typeof v === 'object' && 'c' in v) return v.c === ' ' ? '␠' : v.c;
  if (v && typeof v === 'object' && 'str' in v && v.str.length === 1) return v.str === ' ' ? '␠' : v.str;
  return fmt(v, heap, 0);
}

/** Integer-valued variables from the active frame (plus globals / this.fields), by name. */
export function intVars(frame) {
  const out = new Map();
  const add = (n, v) => { if (typeof v === 'number' && Number.isInteger(v) && !out.has(n)) out.set(n, v); };
  if (frame.top) Object.entries(frame.top.locals).forEach(([n, v]) => add(n, v));
  Object.entries(frame.globals || {}).forEach(([n, v]) => add(n, v));
  return out;
}

export function changedLocal(frame, name) {
  const top = frame.top;
  if (!top) return null;
  const c = frame.changes.locals.get(top.id);
  return c ? c.get(name) || null : null;
}

let markerSeq = 0;
/** An <svg> with an arrowhead marker; returns {svg, marker} where marker is the url() to reference. */
export function svgCanvas(width, height, cls = 'nodes') {
  const id = 'lcv-arrow-' + (++markerSeq);
  const svg = s('svg', { class: cls, width, height, viewBox: `0 0 ${width} ${height}` },
    s('defs', null,
      s('marker', { id, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' },
        s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head' }))));
  return { svg, marker: `url(#${id})` };
}

/** Shortens a line from (x1,y1)->(x2,y2) so it stops at a circle of radius r around the end point. */
export function trimLine(x1, y1, x2, y2, r1, r2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return [x1 + (dx / len) * r1, y1 + (dy / len) * r1, x2 - (dx / len) * r2, y2 - (dy / len) * r2];
}

/** Variables pointing into a set of nodes, as "name" labels per node id. */
export function pointerLabels(view) {
  return view.pointers || new Map();
}
