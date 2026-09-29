// Call tree: every invocation up to the current frame, with arguments, return values, and status
// (active / waiting / returning / completed). Shows exactly which call caused which.

import { h, s, mount } from '../util/dom.js';
import { fmt } from '../util/values.js';

const NODE_H = 40;
const GAP_X = 14;
const GAP_Y = 30;
const MAX_NODES = 400;

export function renderCallTree(el, frame, exec) {
  if (!frame || !exec) return mount(el, h('div', { class: 'empty-note' }, 'Run the code to see its calls.'));
  const k = frame.index;
  const active = new Set(frame.stack.map((f) => f.id));
  const visible = [...exec.calls.values()].filter((c) => c.enter <= k).slice(0, MAX_NODES);
  if (!visible.length) return mount(el, h('div', { class: 'empty-note' }, 'No calls yet.'));
  const byId = new Map(visible.map((c) => [c.id, { ...c, children: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    const p = c.parentId != null ? byId.get(c.parentId) : null;
    if (p) p.children.push(c); else roots.push(c);
  }

  // label + width per node
  const measure = (c) => {
    const args = c.args.map(([n, v]) => fmt(v, c.argHeap, 0)).join(', ');
    c.label = `${c.name}(${args})`.slice(0, 36);
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
  const height = (maxDepth + 1) * (NODE_H + GAP_Y) + 10;
  const svg = s('svg', { class: 'calltree', width, height, viewBox: `0 0 ${width} ${height}` });
  const y = (d) => 10 + d * (NODE_H + GAP_Y);
  let focus = null;
  const drawLinks = (c) => {
    for (const ch of c.children) {
      const x1 = c.x;
      const y1 = y(c.depth) + NODE_H;
      const x2 = ch.x;
      const y2 = y(ch.depth);
      svg.appendChild(s('path', { class: 'link', d: `M${x1},${y1} C${x1},${y1 + GAP_Y / 2} ${x2},${y2 - GAP_Y / 2} ${x2},${y2}` }));
      drawLinks(ch);
    }
  };
  const drawNodes = (c) => {
    const g = s('g', { class: `call ${c.status}` },
      s('rect', { x: c.x - c.w / 2, y: y(c.depth), width: c.w, height: NODE_H }),
      s('text', { x: c.x, y: y(c.depth) + (c.retLabel ? 13 : NODE_H / 2) }, c.label),
      c.retLabel ? s('text', { class: 'ret', x: c.x, y: y(c.depth) + 28 }, c.retLabel) : null);
    g.appendChild(s('title', null, `${c.label}\nstatus: ${c.status}${c.retLabel ? '\nreturned ' + c.retLabel.slice(2) : ''}`));
    svg.appendChild(g);
    if (c.status === 'active' || c.status === 'returning') focus = c;
    c.children.forEach(drawNodes);
  };
  roots.forEach(drawLinks);
  roots.forEach(drawNodes);

  const host = h('div', { class: 'calltree-host' }, svg);
  mount(el,
    h('div', { class: 'legend' },
      h('span', { class: 'l-active' }, 'active'), h('span', { class: 'l-waiting' }, 'waiting'),
      h('span', { class: 'l-returning' }, 'returning'), h('span', { class: 'l-done' }, 'completed'),
      exec.calls.size > MAX_NODES ? h('span', null, `first ${MAX_NODES} calls`) : null),
    host);
  // keep the active call in view
  if (focus) {
    requestAnimationFrame(() => {
      const panel = el;
      const fx = focus.x - panel.clientWidth / 2;
      const fy = y(focus.depth) - panel.clientHeight / 2 + 40;
      panel.scrollTo({ left: Math.max(0, fx), top: Math.max(0, fy), behavior: 'smooth' });
    });
  }
  return el;
}
