// Hover-to-inspect: what a name in the source is at the *current step* of the run.
//
// The step's frame holds the whole program state before the highlighted line runs, so a hover is a lookup:
// resolve the name (locals of the active call, `this` fields, globals, then the callers), walk `a.b.c` through the
// heap, and optionally evaluate `a[i]` / `dp[i-1][j]` with the same evaluator the step bar uses.

import { isRef, fmt, keyOf, sizeOf } from '../util/values.js';
import { evaluate } from '../state/sourceAnalysis.js';
import { analyzeNodeTypes } from '../visualizers/StructureDetector.js';

const NOT_VARIABLES = new Set(('if else for while do switch case break continue return new delete class struct public private protected ' +
  'static final const void int long short char float double bool boolean string auto var let def import from as in is not and or ' +
  'try catch except finally throw throws this self super true false null nullptr None True False undefined function lambda ' +
  'typename template using namespace include unsigned signed').split(' '));

const MAX_ITEMS = 40;

/**
 * @param {{word: string, before: string, after: string}} ctx  text either side of the hovered word
 * @param {object|null} frame  the current frame from buildExecution
 * @returns {{title: string, body: string, range?: [number, number]} | null}
 */
export function resolveHover(ctx, frame) {
  if (!frame || !frame.top) return null;
  const { word } = ctx;
  if (!/^[A-Za-z_$][\w$]*$/.test(word) || NOT_VARIABLES.has(word)) return null;

  // a.b.c up to and including the hovered word
  const chain = [word];
  const pre = /((?:[A-Za-z_$][\w$]*\s*(?:\.|->)\s*)+)$/.exec(ctx.before);
  if (pre) chain.unshift(...pre[1].split(/\s*(?:\.|->)\s*/).filter(Boolean));
  // `foo::bar` and calls like `x.size()` are not values worth showing
  if (/^\s*::/.test(ctx.after) || /::\s*$/.test(ctx.before)) return null;
  if (/^\s*\(/.test(ctx.after) && chain.length > 1) return null;

  const found = lookupRoot(frame, chain[0]);
  if (!found) return null;
  let { value, where } = found;
  let label = chain[0];
  let heapOwner = null;
  for (let i = 1; i < chain.length; i++) {
    const step = stepInto(value, chain[i], frame);
    if (!step) return null;
    value = step.value;
    label += '.' + chain[i];
    heapOwner = step.owner;
  }
  if (/^\s*\(/.test(ctx.after)) return null; // a function being called, not a variable

  const lines = [];
  const previous = changedFrom(frame, chain, where);
  lines.push(render(value, frame.heap));
  if (previous !== null) lines.push(`\n// was ${previous}`);

  // a[i], dp[i][j] right after the name: also show the element
  let extra = '';
  const idx = /^((?:\s*\[[^\[\]]+\])+)/.exec(ctx.after);
  if (idx && chain.length === 1) {
    const expr = word + idx[1];
    const env = { locals: visibleLocals(frame), heap: frame.heap, reads: [], intDivision: /^(java|cpp|c)$/.test(frame.language || '') };
    const r = evaluate(expr.replace(/\s+/g, ''), env);
    if (r.ok && r.value !== undefined && typeof r.value !== 'object') {
      extra = `${expr.replace(/\s+/g, '')} = ${typeof r.value === 'string' ? JSON.stringify(r.value) : String(r.value)}`;
    }
  }

  const type = typeName(value, frame.heap);
  const title = `**${label}**${type ? ` · \`${type}\`` : ''}${where ? ` · ${where}` : ''}`;
  const body = '```\n' + lines.join('') + '\n```' + (extra ? `\n\n\`${extra}\`` : '');
  void heapOwner;
  return { title, body };
}

/** Everything nameable from the active call: locals, then `this` fields, then globals. */
function visibleLocals(frame) {
  const out = { ...frame.top.locals };
  const self = frame.top.locals.this;
  if (isRef(self) && frame.heap[self.ref] && frame.heap[self.ref].fields) {
    for (const [k, v] of Object.entries(frame.heap[self.ref].fields)) if (!(k in out)) out[k] = v;
  }
  for (const [k, v] of Object.entries(frame.globals || {})) if (!(k in out)) out[k] = v;
  return out;
}

function lookupRoot(frame, name) {
  const top = frame.top;
  if (name in top.locals && name !== 'this') return { value: top.locals[name], where: '' };
  if (name === 'this' && 'this' in top.locals) return { value: top.locals.this, where: '' };
  const self = top.locals.this;
  if (isRef(self) && frame.heap[self.ref] && frame.heap[self.ref].fields && name in frame.heap[self.ref].fields) {
    return { value: frame.heap[self.ref].fields[name], where: `field of \`this\`` };
  }
  if (frame.globals && name in frame.globals) return { value: frame.globals[name], where: 'global' };
  for (let i = frame.stack.length - 2; i >= 0; i--) {
    const f = frame.stack[i];
    if (name in f.locals && name !== 'this') return { value: f.locals[name], where: `in caller \`${f.name}()\`` };
  }
  return null;
}

/** `.name` on a value: an object field, or a property every collection has. */
function stepInto(value, name, frame) {
  if (!isRef(value)) return null;
  const h = frame.heap[value.ref];
  if (!h) return null;
  if (h.kind === 'object' && h.fields && name in h.fields) return { value: h.fields[name], owner: h };
  if (h.kind === 'map' && name === 'size') return { value: sizeOf(h), owner: h };
  if (name === 'length' || name === 'size') return { value: sizeOf(h), owner: h };
  if (h.kind === 'object' && h.fields) {
    // C++ pair / Python attributes are plain fields; anything else is a method call
    return null;
  }
  return null;
}

/** What the previous line changed this variable from, if it just changed. */
function changedFrom(frame, chain, where) {
  if (chain.length !== 1 || where) return null;
  const c = frame.changes && frame.changes.locals.get(frame.top.id);
  const ch = c && c.get(chain[0]);
  if (!ch || ch.kind !== 'update') return null;
  const prev = frame.prevFrame;
  return fmt(ch.from, prev ? prev.heap : frame.heap, 1);
}

function typeName(value, heap) {
  if (!isRef(value)) return null;
  const h = heap[value.ref];
  if (!h) return null;
  if (h.kind === 'object') return h.type;
  const n = sizeOf(h);
  return `${h.type}${h.kind === 'array' && /\[\]$/.test(h.type) ? '' : ''} · ${n} item${n === 1 ? '' : 's'}`;
}

// ---------------------------------------------------------------------------------------------- rendering

function render(v, heap) {
  const ctx = { heap, types: analyzeNodeTypes(heap), seen: new Set() };
  return text(v, ctx, 0, 0);
}

function scalarText(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
  if (typeof v === 'boolean') return String(v);
  if ('c' in v) return `'${v.c}'`;
  if ('str' in v) return JSON.stringify(v.str);
  if ('n' in v) return v.n;
  if ('u' in v) return 'undefined';
  if ('fn' in v) return `ƒ ${v.fn}`;
  if ('enum' in v) return v.enum;
  return JSON.stringify(v);
}

function text(v, ctx, depth, indent) {
  if (!isRef(v)) return scalarText(v);
  const h = ctx.heap[v.ref];
  if (!h) return '…';
  if (ctx.seen.has(h.id)) return `↺ ${h.type || 'object'}`;
  const pad = ' '.repeat(indent);
  const info = h.kind === 'object' ? ctx.types.get(h.type) : null;

  if (info && info.shape === 'linkedlist' && info.next) return listText(h, info, ctx);
  if (info && info.shape === 'tree') return treeText(h, info, ctx);

  ctx.seen.add(h.id);
  try {
    if (h.elems && h.kind !== 'set') {
      const elems = h.elems;
      if (!elems.length) return '[]';
      const nested = elems.some(isRef);
      const items = elems.slice(0, MAX_ITEMS).map((e) => text(e, ctx, depth + 1, indent + 2));
      const more = (h.length || elems.length) > items.length ? `, … (${h.length || elems.length} items)` : '';
      const flat = `[${items.join(', ')}${more}]`;
      if (!nested || (flat.length <= 72 && !flat.includes('\n'))) return flat;
      return `[\n${items.map((s) => pad + '  ' + s).join(',\n')}${more ? ',\n' + pad + '  …' : ''}\n${pad}]`;
    }
    if (h.kind === 'set') {
      const items = (h.elems || []).slice(0, MAX_ITEMS).map((e) => text(e, ctx, depth + 1, indent));
      return `{${items.join(', ')}${(h.length || items.length) > items.length ? ', …' : ''}}`;
    }
    if (h.kind === 'map') {
      const entries = (h.entries || []).slice(0, MAX_ITEMS).map(([k, x]) => `${text(k, ctx, depth + 1, indent)}: ${text(x, ctx, depth + 1, indent + 2)}`);
      if (!entries.length) return '{}';
      const flat = `{${entries.join(', ')}${(h.length || entries.length) > entries.length ? ', …' : ''}}`;
      if (flat.length <= 72 && !flat.includes('\n')) return flat;
      return `{\n${entries.map((s) => pad + '  ' + s).join(',\n')}\n${pad}}`;
    }
    if (h.kind === 'object') {
      const entries = Object.entries(h.fields || {});
      if (depth >= 2) return `${h.type} {…}`;
      const body = entries.map(([k, x]) => `${k}: ${text(x, ctx, depth + 1, indent + 2)}`);
      const flat = `${h.type} { ${body.join(', ')} }`;
      if (flat.length <= 72 && !flat.includes('\n')) return flat;
      return `${h.type} {\n${body.map((s) => pad + '  ' + s).join(',\n')}\n${pad}}`;
    }
    return h.type || 'object';
  } finally {
    ctx.seen.delete(h.id);
  }
}

/** 1 → 2 → 3 → null, following the type's `next`-like field. */
function listText(head, info, ctx) {
  const parts = [];
  const seen = new Set();
  let n = head;
  while (n && !seen.has(n.id) && parts.length < 16) {
    seen.add(n.id);
    parts.push(nodeValue(n));
    const nx = n.fields[info.next];
    if (!isRef(nx)) { parts.push(scalarText(nx === undefined ? null : nx)); n = null; break; }
    n = ctx.heap[nx.ref];
  }
  if (n) parts.push(seen.has(n.id) ? `↺ ${nodeValue(n)}` : '…');
  return parts.join(' → ');
}

/** A binary tree as the usual level-order list: [3, 9, 20, null, null, 15, 7]. */
function treeText(root, info, ctx) {
  const out = [];
  const q = [root];
  let head = 0;
  const seen = new Set();
  while (head < q.length && out.length < 31) {
    const n = q[head++];
    if (!n) { out.push('null'); continue; }
    if (seen.has(n.id)) { out.push('↺'); continue; }
    seen.add(n.id);
    out.push(nodeValue(n));
    for (const f of [info.left, info.right]) {
      const c = n.fields[f];
      q.push(isRef(c) ? ctx.heap[c.ref] : null);
    }
  }
  while (out.length && out[out.length - 1] === 'null') out.pop();
  const more = head < q.length && q.slice(head).some(Boolean) ? ', …' : '';
  return `${root.type} [${out.join(', ')}${more}]`;
}

function nodeValue(n) {
  const fields = n.fields || {};
  for (const p of ['val', 'value', 'key', 'data', 'label', 'name', 'id']) if (p in fields && !isRef(fields[p])) return scalarText(fields[p]);
  const first = Object.values(fields).find((x) => !isRef(x) && x !== null);
  return first === undefined ? n.type : scalarText(first);
}

export { keyOf };
