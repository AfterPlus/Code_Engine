// Call tree: every invocation up to the current frame, with arguments, return values, and status
// (active / waiting / returning / completed). Shows exactly which call caused which, and which calls repeat an
// earlier one (overlapping sub-problems: what memoization removes).

import { h, s, mount } from '../util/dom.js';
import { fmt, isRef, keyOf } from '../util/values.js';

const NODE_H = 40;
const GAP_X = 14;
const GAP_Y = 30;
const MAX_NODES = 400;
const TOP = 10; // margin above the root

const analyses = new WeakMap();

/**
 * Per run: the arguments that are the same shared object in every call of a function (the cuts array, the memo
 * table, the grid) and only add noise to a label, and the calls that repeat an earlier call with identical arguments.
 * Decided over the whole run, so labels do not change as the tree grows.
 */
function analyze(exec) {
  if (analyses.has(exec)) return analyses.get(exec);
  const byName = new Map();
  for (const c of exec.calls.values()) {
    if (!byName.has(c.name)) byName.set(c.name, []);
    byName.get(c.name).push(c);
  }
  const hidden = new Map();
  const repeat = new Set();
  for (const [name, calls] of byName) {
    if (calls.length < 2) continue;
    const width = Math.min(...calls.map((c) => c.args.length));
    const shared = new Set();
    for (let i = 0; i < width; i++) {
      const first = calls[0].args[i][1];
      if (isRef(first) && calls.every((c) => isRef(c.args[i][1]) && c.args[i][1].ref === first.ref)) shared.add(i);
    }
    if (shared.size && shared.size < width) hidden.set(name, shared); // never hide every argument
    const seen = new Set();
    for (const c of calls) {
      const key = c.args.length ? callKey(c) : null; // with no arguments every call is trivially "the same"
      if (key === null) continue;
      if (seen.has(key)) repeat.add(c.id);
      else seen.add(key);
    }
  }
  const result = { hidden, repeat };
  analyses.set(exec, result);
  return result;
}

/** Identity of a call's arguments: scalars by value, objects by id plus (small) contents; null when too big to compare. */
function callKey(c) {
  const parts = [];
  for (const [, v] of c.args) {
    if (!isRef(v)) { parts.push(keyOf(v)); continue; }
    const o = c.argHeap && c.argHeap[v.ref];
    const body = o ? JSON.stringify(o.elems || o.entries || o.fields || null) : '';
    if (body.length > 600) return null;
    parts.push(`${v.ref}:${body}`);
  }
  return parts.join('|');
}

/**
 * Draws the tree on a pan/zoom surface (`pz`) mounted in `el`; while the surface is following, the active call stays
 * centred as you step.
 */
export function renderCallTree(el, frame, exec, pz) {
  if (!frame || !exec) return mount(el, h('div', { class: 'empty-note' }, 'Run the code to see its calls.'));
  const k = frame.index;
  const active = new Set(frame.stack.map((f) => f.id));
  const visible = [...exec.calls.values()].filter((c) => c.enter <= k).slice(0, MAX_NODES);
  if (!visible.length) return mount(el, h('div', { class: 'empty-note' }, 'No calls yet.'));
  const { hidden, repeat } = analyze(exec);
  const byId = new Map(visible.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    const p = c.parentId != null ? byId.get(c.parentId) : null;
    if (p) p.children.push(c); else roots.push(c);
  }

  // label + width per node
  let repeats = 0;
  const measure = (c) => {
    const argText = (list) => list.map(([n, v]) => fmt(v, c.argHeap, 0)).join(', ');
    const skip = hidden.get(c.name);
    c.repeat = repeat.has(c.id);
    if (c.repeat) repeats++;
    c.full = `${c.name}(${argText(c.args)})`;
    c.label = `${c.name}(${argText(skip ? c.args.filter((_, i) => !skip.has(i)) : c.args)})`.slice(0, 36) + (c.repeat ? ' ↩' : '');
    const done = c.exit !== null && c.exit <= k;
    c.retLabel = done && c.ret !== undefined && !(c.ret && c.ret.u) ? '→ ' + fmt(c.ret, c.retHeap, 0).slice(0, 18) : '';
    c.w = Math.max(70, Math.max(c.label.length, c.retLabel.length) * 7.4 + 18);
    c.status = c.exit !== null && c.exit < k ? 'completed'
      : c.exit === k ? 'returning'
        : active.has(c.id) ? (frame.callId === c.id ? 'active' : 'waiting') : 'completed';
    c.children.forEach(measure);
  };
  roots.forEach(measure);

  // tidy-ish layout: each subtree gets the width of its children (or itself), parents centered over children
  let maxDepth = 0;
  const layout = (c, x, depth) => {
    maxDepth = Math.max(maxDepth, depth);
    c.depth = depth;
    if (!c.children.length) {
      c.x = x + c.w / 2;
      return x + c.w + GAP_X;
    }
    let cx = x;
    for (const ch of c.children) cx = layout(ch, cx, depth + 1);
    const span = cx - GAP_X - x;
    if (span < c.w) {
      const shift = (c.w - span) / 2;
      c.children.forEach((ch) => shiftTree(ch, shift));
      c.x = x + c.w / 2;
      return x + c.w + GAP_X;
    }
    c.x = (c.children[0].x + c.children[c.children.length - 1].x) / 2;
    return cx;
  };
  const shiftTree = (c, dx) => { c.x += dx; c.children.forEach((ch) => shiftTree(ch, dx)); };
  let x = 10;
  for (const r of roots) x = layout(r, x, 0);

  const width = Math.max(x + 10, 200);
  const height = (maxDepth + 1) * (NODE_H + GAP_Y) + TOP;
  const svg = s('svg', { class: 'calltree', width, height, viewBox: `0 0 ${width} ${height}` });
  const y = (d) => TOP + d * (NODE_H + GAP_Y);
  let focus = null;
  const edges = []; // {el, from, to}: the link group between a call and one of its children
  const nodeEls = new Map(); // call id -> its node group
  const drawLinks = (c) => {
    for (const ch of c.children) {
      const x1 = c.x;
      const y1 = y(c.depth) + NODE_H;
      const x2 = ch.x;
      const y2 = y(ch.depth);
      const d = `M${x1},${y1} C${x1},${y1 + GAP_Y / 2} ${x2},${y2 - GAP_Y / 2} ${x2},${y2}`;
      // the invisible fat copy of the line is what the pointer can hit: the drawn line is only 1.4px wide
      const el = s('g', { class: 'edge' }, s('path', { class: 'link', d }), s('path', { class: 'hit', d }), s('title', null, `${c.full} → ${ch.full}`));
      svg.appendChild(el);
      edges.push({ el, from: c.id, to: ch.id });
      drawLinks(ch);
    }
  };
  const drawNodes = (c) => {
    const g = s('g', { class: `call ${c.status}${c.repeat ? ' repeat' : ''}` },
      s('rect', { x: c.x - c.w / 2, y: y(c.depth), width: c.w, height: NODE_H }),
      s('text', { x: c.x, y: y(c.depth) + (c.retLabel ? 13 : NODE_H / 2) }, c.label),
      c.retLabel ? s('text', { class: 'ret', x: c.x, y: y(c.depth) + 28 }, c.retLabel) : null);
    g.appendChild(s('title', null, `${c.full}\nstatus: ${c.status}${c.repeat ? '\nrepeats an earlier call with the same arguments' : ''}${c.retLabel ? '\nreturned ' + c.retLabel.slice(2) : ''}`));
    svg.appendChild(g);
    nodeEls.set(c.id, g);
    if (c.status === 'active' || c.status === 'returning') focus = c;
    c.children.forEach(drawNodes);
  };
  roots.forEach(drawLinks);
  roots.forEach(drawNodes);

  // hovering a link lights it up together with the two calls it connects, and dims the rest of the tree
  for (const { el: edge, from, to } of edges) {
    const lit = [edge, nodeEls.get(from), nodeEls.get(to)];
    edge.addEventListener('mouseenter', () => { svg.classList.add('hovering'); lit.forEach((n) => n.classList.add('hl')); });
    edge.addEventListener('mouseleave', () => { svg.classList.remove('hovering'); lit.forEach((n) => n.classList.remove('hl')); });
  }

  const legend = h('div', { class: 'legend' },
    h('span', { class: 'l-active' }, 'active'), h('span', { class: 'l-waiting' }, 'waiting'),
    h('span', { class: 'l-returning' }, 'returning'), h('span', { class: 'l-done' }, 'completed'),
    repeats ? h('span', { class: 'l-repeat', title: 'Same function and arguments as an earlier call' }, '↩ repeat') : null,
    exec.calls.size > MAX_NODES ? h('span', null, `first ${MAX_NODES} calls`) : null);
  pz.show(el, [svg], { legend, size: { w: width, h: height }, focus: focus ? { x: focus.x, y: y(focus.depth) + NODE_H / 2 } : null });
  return el;
}
