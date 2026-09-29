// Helpers for the language-neutral value encoding shared by both tracers:
//   number | boolean | null | {c} char | {str} string | {n} special number | {u} undefined | {fn} function
//   | {enum} enum constant | {ref} heap reference

export const isRef = (v) => v !== null && typeof v === 'object' && 'ref' in v;

/** Stable identity string, used for equality and as map keys. */
export const keyOf = (v) => JSON.stringify(v === undefined ? { u: 1 } : v);

/** Plain JS value for arithmetic / comparisons, or undefined when not a scalar. */
export function scalar(v) {
  if (v === null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v && typeof v === 'object') {
    if ('str' in v) return v.str;
    if ('c' in v) return v.c;
    if ('n' in v) return Number(v.n);
    if ('u' in v) return undefined;
  }
  return undefined;
}

/** Encodes a JS value produced by the expression evaluator back into the trace encoding (for key lookups). */
export function encodeScalar(x, preferChar = false) {
  if (x === null || typeof x === 'number' || typeof x === 'boolean') return x;
  if (typeof x === 'string') return preferChar && x.length === 1 ? { c: x } : { str: x };
  if (x === undefined) return { u: 1 };
  return x;
}

export const isIntValue = (v) => typeof v === 'number' && Number.isInteger(v);

export function valueClass(v) {
  if (v === null || (v && typeof v === 'object' && 'u' in v)) return 'val-null';
  if (typeof v === 'number' || (v && typeof v === 'object' && 'n' in v)) return 'val-num';
  if (typeof v === 'boolean') return 'val-bool';
  if (v && typeof v === 'object' && ('str' in v || 'c' in v)) return 'val-str';
  if (isRef(v)) return 'val-ref';
  return '';
}

/** Short, human-readable rendering of a value. */
export function fmt(v, heap, depth = 1) {
  if (v === null) return 'null';
  if (v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
  if (typeof v === 'boolean') return String(v);
  if ('c' in v) return `'${v.c}'`;
  if ('str' in v) return JSON.stringify(v.str);
  if ('n' in v) return v.n;
  if ('u' in v) return 'undefined';
  if ('fn' in v) return `ƒ ${v.fn}`;
  if ('enum' in v) return v.enum;
  if ('ref' in v) {
    const h = heap && heap[v.ref];
    return h ? summarize(h, heap, depth) : '…';
  }
  return JSON.stringify(v);
}

const SEQ = new Set(['array', 'list', 'stack', 'queue', 'deque', 'pq']);

export function sizeOf(h) {
  if (h.length !== undefined && h.length !== null) return h.length;
  if (h.elems) return h.elems.length;
  if (h.entries) return h.entries.length;
  return 0;
}

export function typeLabel(h) {
  const n = sizeOf(h);
  if (h.kind === 'array' && /\[\]$/.test(h.type)) return h.type.replace(/\[\]$/, `[${n}]`).replace(/\[\](\[\d+\])$/, '$1[]');
  if (SEQ.has(h.kind) || h.kind === 'map' || h.kind === 'set') return `${h.type}(${n})`;
  return h.type;
}

export function summarize(h, heap, depth = 1) {
  if (SEQ.has(h.kind)) {
    const elems = h.elems || [];
    const simple = elems.every((e) => !isRef(e));
    if (depth > 0 && simple && elems.length <= 10 && !h.truncated) {
      const body = elems.map((e) => fmt(e, heap, 0)).join(', ');
      return h.type === 'StringBuilder' ? `"${elems.map((e) => (e && e.c) || '').join('')}"` : `[${body}]`;
    }
    if (depth > 0 && !simple && elems.length <= 4 && !h.truncated) {
      return `[${elems.map((e) => fmt(e, heap, depth - 1)).join(', ')}]`;
    }
    return typeLabel(h);
  }
  if (h.kind === 'map') {
    const entries = h.entries || [];
    if (depth > 0 && entries.length <= 6 && entries.every(([k, x]) => !isRef(k) && !isRef(x))) {
      return `{${entries.map(([k, x]) => `${fmt(k, heap, 0)}: ${fmt(x, heap, 0)}`).join(', ')}}`;
    }
    return typeLabel(h);
  }
  if (h.kind === 'set') {
    const elems = h.elems || [];
    if (depth > 0 && elems.length <= 8 && elems.every((e) => !isRef(e))) return `{${elems.map((e) => fmt(e, heap, 0)).join(', ')}}`;
    return typeLabel(h);
  }
  if (h.kind === 'object') {
    const first = Object.entries(h.fields || {}).find(([, x]) => !isRef(x) && x !== null);
    return first ? `${h.type}(${first[0]}=${fmt(first[1], heap, 0)})` : h.type;
  }
  return h.type || 'object';
}

/** The first primitive field of an object: what a node "shows" (val, value, key, data...). */
export function nodeLabel(h) {
  if (!h || !h.fields) return '?';
  const preferred = ['val', 'value', 'key', 'data', 'label', 'name', 'id'];
  for (const p of preferred) {
    if (p in h.fields && !isRef(h.fields[p])) return fmt(h.fields[p], null, 0);
  }
  const first = Object.entries(h.fields).find(([, x]) => !isRef(x) && x !== null);
  return first ? fmt(first[1], null, 0) : '•';
}
