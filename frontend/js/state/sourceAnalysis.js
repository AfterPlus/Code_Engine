// Code-driven analysis of the user's source. The runtime trace says *what* the state is; the source says how
// the program uses it: which variables index which arrays (pointers), what a line reads, and where blocks end.
// Everything here is language-agnostic enough for Java and JavaScript.

import { isRef, scalar, encodeScalar, keyOf } from '../util/values.js';

const KEYWORDS = new Set(('abstract assert boolean break byte case catch char class const continue default do double else enum ' +
  'extends final finally float for goto if implements import instanceof int interface long native new package private ' +
  'protected public return short static strictfp super switch synchronized this throw throws transient try void volatile ' +
  'while var let function typeof in of null true false undefined length size yield async await delete').split(' '));

const IDENT = /[A-Za-z_$][\w$]*/g;

/** Blanks comments and string/char literal contents (same length, so positions still line up). */
export function maskSource(code) {
  const out = code.split('');
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      while (i < n && code[i] !== '\n') out[i++] = ' ';
    } else if (c === '/' && code[i + 1] === '*') {
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) { if (code[i] !== '\n') out[i] = ' '; i++; }
      if (i < n) { out[i++] = ' '; out[i++] = ' '; }
    } else if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < n && code[i] !== c && (c === '`' || code[i] !== '\n')) {
        if (code[i] === '\\') out[i++] = ' ';
        if (i < n && code[i] !== '\n') out[i] = ' ';
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  return out.join('');
}

const identsIn = (text) => (text.match(IDENT) || []).filter((w) => !KEYWORDS.has(w));

export function analyzeSource(code, language) {
  const lines = code.split('\n');
  const masked = maskSource(code);
  const mlines = masked.split('\n');

  // name -> Map(identifier -> uses) for its first / second index position
  const dim0 = new Map();
  const dim1 = new Map();
  const add = (map, name, ids) => {
    if (!map.has(name)) map.set(name, new Map());
    const m = map.get(name);
    ids.forEach((x) => { if (x !== name) m.set(x, (m.get(x) || 0) + 1); });
  };
  // the variables that really drive indexing, most used first (dp[i][j] x4 beats dp[m][n] x1)
  const ranked = (m) => {
    if (!m) return new Set();
    const max = Math.max(0, ...m.values());
    return new Set([...m.entries()].filter(([, c]) => c * 2 >= max).sort((a, b) => b[1] - a[1]).map(([x]) => x));
  };
  const idxRe = /([A-Za-z_$][\w$]*)\s*\[([^\[\]]+)\](?:\s*\[([^\[\]]+)\])?/g;
  let m;
  while ((m = idxRe.exec(masked))) {
    if (KEYWORDS.has(m[1])) continue;
    add(dim0, m[1], identsIn(m[2]));
    if (m[3]) add(dim1, m[1], identsIn(m[3]));
  }
  // list-style indexing: xs.get(i), xs.set(i, v), sb.charAt(i), s.charAt(i)
  const getRe = /([A-Za-z_$][\w$]*)\s*\.\s*(?:get|set|charAt|remove)\s*\(([^(),]+)/g;
  while ((m = getRe.exec(masked))) add(dim0, m[1], identsIn(m[2]));

  // assignments: lhs <- identifiers on the rhs
  const assigns = [];
  const asgRe = /([A-Za-z_$][\w$]*)\s*(?:[+\-*/%]|>>>?|<<)?=(?!=)\s*([^;{}]+)/g;
  while ((m = asgRe.exec(masked))) assigns.push({ lhs: m[1], rhs: m[2] });

  const pointerCache = new Map();
  function pointerVars(name) {
    if (pointerCache.has(name)) return pointerCache.get(name);
    const set = new Set((dim0.get(name) || new Map()).keys());
    // variables initialised from the array's length are boundaries of it (right = nums.length - 1)
    const lenRe = new RegExp(`\\b${escape(name)}\\s*\\.\\s*(length|size\\s*\\(\\s*\\))`);
    for (const a of assigns) if (lenRe.test(a.rhs)) set.add(a.lhs);
    // fixed point: mid = (left + right) / 2 makes left and right pointers too
    for (let round = 0; round < 4; round++) {
      let grew = false;
      for (const a of assigns) {
        if (!set.has(a.lhs)) continue;
        for (const x of identsIn(a.rhs)) {
          if (x !== name && !set.has(x) && !/^[A-Z]/.test(x)) { set.add(x); grew = true; }
        }
      }
      if (!grew) break;
    }
    set.delete(name);
    pointerCache.set(name, set);
    return set;
  }

  // brace matching: line -> last line of the block opened on it
  const blockEnd = new Map();
  {
    const stack = [];
    let line = 1;
    for (let i = 0; i < masked.length; i++) {
      const c = masked[i];
      if (c === '\n') line++;
      else if (c === '{') stack.push(line);
      else if (c === '}') {
        const open = stack.pop();
        if (open !== undefined) blockEnd.set(open, Math.max(blockEnd.get(open) || 0, line));
      }
    }
  }

  function lineKind(lineNo) {
    const t = (mlines[lineNo - 1] || '').trim();
    if (/^(}\s*)?else\s+if\b/.test(t) || /^if\b/.test(t)) return 'if';
    if (/^(for|while)\b/.test(t)) return 'loop';
    if (/^}\s*while\b/.test(t) || /^do\b/.test(t)) return 'loop';
    return null;
  }

  /** Line range of the body controlled by the if/loop on lineNo, when it is a braced block. */
  function bodyRange(lineNo) {
    const end = blockEnd.get(lineNo);
    // `} else {` / `} else if (...)` closes the block but belongs to the other branch
    if (end && end > lineNo) return [lineNo + 1, /^\s*}\s*\S/.test(mlines[end - 1] || '') ? end - 1 : end];
    // unbraced single statement on the next line
    const t = (mlines[lineNo - 1] || '').trim();
    if (/\)\s*$/.test(t)) return [lineNo + 1, lineNo + 1];
    return null;
  }

  return {
    language, lines, mlines,
    pointerVars,
    rowVars: (name) => ranked(dim0.get(name)),
    colVars: (name) => ranked(dim1.get(name)),
    lineKind, bodyRange,
    text: (lineNo) => lines[lineNo - 1] || '',
    masked: (lineNo) => mlines[lineNo - 1] || '',
  };
}

function escape(s) {
  return s.replace(/[$]/g, '\\$');
}

// ---------------------------------------------------------------------------- expression evaluation

/**
 * Evaluates a small side-effect-free expression (identifiers, numbers, literals, + - * / % >> >>>, parentheses,
 * a[i], a[i][j], a.length) against a frame's locals and heap. Returns {ok, value} or {ok:false}.
 */
export function evaluate(expr, env) {
  const tokens = tokenize(expr);
  if (!tokens) return { ok: false };
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const fail = () => { throw new Error('unsupported'); };

  function primary() {
    const t = next();
    if (!t) fail();
    if (t.type === 'num') return t.value;
    if (t.type === 'str') return t.value;
    if (t.type === 'op' && t.value === '(') { const v = additive(); if (!next() || tokens[pos - 1].value !== ')') fail(); return postfix(v); }
    if (t.type === 'op' && t.value === '-') return -primary();
    if (t.type === 'id') {
      if (t.value === 'true') return true;
      if (t.value === 'false') return false;
      if (t.value === 'null') return null;
      if (!(t.value in env.locals)) fail();
      return postfix(env.locals[t.value]);
    }
    return fail();
  }

  function postfix(v) {
    for (;;) {
      const t = peek();
      if (t && t.type === 'op' && t.value === '[') {
        next();
        const idx = additive();
        if (!next() || tokens[pos - 1].value !== ']') fail();
        v = index(v, idx);
      } else if (t && t.type === 'op' && t.value === '.' && tokens[pos + 1] && tokens[pos + 1].type === 'id' && /^(length|size)$/.test(tokens[pos + 1].value)) {
        pos += 2;
        if (peek() && peek().value === '(') { pos++; if (!next() || tokens[pos - 1].value !== ')') fail(); }
        v = lengthOf(v);
      } else {
        return raw(v);
      }
    }
  }

  // keep references as encoded refs while indexing; convert scalars to plain JS
  function raw(v) {
    if (isRef(v)) return v;
    const x = scalar(v);
    return x === undefined && v && typeof v === 'object' && !('u' in v) ? fail() : x;
  }
  function index(v, idx) {
    if (!isRef(v)) fail();
    const h = env.heap[v.ref];
    if (!h || !h.elems || typeof idx !== 'number') fail();
    if (idx < 0 || idx >= h.elems.length) fail();
    env.reads.push({ heapId: v.ref, index: idx, parent: env.lastIndexed });
    env.lastIndexed = { heapId: v.ref, index: idx };
    return h.elems[idx];
  }
  function lengthOf(v) {
    if (!isRef(v)) { const x = scalar(v); if (typeof x === 'string') return x.length; fail(); }
    const h = env.heap[v.ref];
    if (!h) fail();
    return h.length != null ? h.length : (h.elems || h.entries || []).length;
  }

  function mul() {
    let v = unwrap(primary());
    for (;;) {
      const t = peek();
      if (!t || t.type !== 'op' || !['*', '/', '%'].includes(t.value)) return v;
      next();
      const r = unwrap(primary());
      if (typeof v !== 'number' || typeof r !== 'number') fail();
      if (t.value === '*') v *= r;
      else if (t.value === '%') v %= r;
      else { if (r === 0) fail(); v = env.intDivision && Number.isInteger(v) && Number.isInteger(r) ? Math.trunc(v / r) : v / r; }
    }
  }
  function additive() {
    let v = mul();
    for (;;) {
      const t = peek();
      if (!t || t.type !== 'op' || !['+', '-', '>>', '>>>', '<<'].includes(t.value)) return v;
      next();
      const r = mul();
      if (t.value === '+') v = (typeof v === 'string' || typeof r === 'string') ? String(v) + String(r) : v + r;
      else if (t.value === '-') v -= r;
      else if (t.value === '>>') v >>= r;
      else if (t.value === '>>>') v >>>= r;
      else v <<= r;
      if (Number.isNaN(v)) fail();
    }
  }
  function unwrap(v) {
    if (isRef(v)) return v;
    return v;
  }

  try {
    env.reads = env.reads || [];
    const value = additive();
    if (pos !== tokens.length) return { ok: false };
    return { ok: true, value };
  } catch (e) {
    return { ok: false };
  }
}

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)[lLfFdD]?|([A-Za-z_$][\w$]*)|('(?:\\.|[^'])'|"(?:\\.|[^"])*")|(>>>|>>|<<|[-+*/%()[\].]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) return null;
    if (m[1] !== undefined) tokens.push({ type: 'num', value: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ type: 'id', value: m[2] });
    else if (m[3] !== undefined) {
      const body = m[3].slice(1, -1).replace(/\\(.)/g, '$1');
      tokens.push({ type: 'str', value: body, char: m[3][0] === "'" });
    } else tokens.push({ type: 'op', value: m[4] });
    i = re.lastIndex;
  }
  return tokens;
}

// ---------------------------------------------------------------------------- per-line operations

const LOOKUP_METHODS = new Set(['get', 'getOrDefault', 'containsKey', 'containsValue', 'contains', 'has', 'peek', 'peekFirst', 'peekLast', 'top', 'first', 'last', 'firstKey', 'lastKey']);

/**
 * Operations performed by one source line, evaluated against the state *before* it ran:
 *  reads:   [{heapId, index}]              array/list element reads (a[i], a[i][j], list.get(i))
 *  lookups: [{heapId, method, key, result}] map/set/stack/queue queries
 */
export function lineOperations(src, lineNo, frame, language) {
  const text = src.masked(lineNo);
  const raw = src.text(lineNo);
  const top = frame.top;
  if (!text || !top) return { reads: [], lookups: [] };
  const locals = { ...top.locals };
  for (const [k, v] of Object.entries(frame.globals || {})) if (!(k in locals)) locals[k] = v;
  const thisRef = top.locals.this;
  if (isRef(thisRef) && frame.heap[thisRef.ref] && frame.heap[thisRef.ref].fields) {
    for (const [k, v] of Object.entries(frame.heap[thisRef.ref].fields)) if (!(k in locals)) locals[k] = v;
  }
  const env = { locals, heap: frame.heap, reads: [], intDivision: language === 'java', language };

  // element reads — skip pure assignment targets (a[i] = x), those are writes shown by the diff
  const reads = [];
  const idxRe = /([A-Za-z_$][\w$]*)((?:\s*\[[^\[\]]+\])+)(\s*(?:[+\-*/%]?=(?!=)|\+\+|--)?)/g;
  let m;
  while ((m = idxRe.exec(text))) {
    if (KEYWORDS.has(m[1])) continue;
    const isPlainAssign = /^\s*=$/.test(m[3]);
    if (isPlainAssign) continue;
    const exprText = raw.slice(m.index, m.index + m[1].length + m[2].length);
    const sub = { ...env, reads: [] };
    const r = evaluate(exprText, sub);
    if (r.ok) sub.reads.forEach((x) => reads.push(x));
  }
  const getRe = /([A-Za-z_$][\w$]*)\s*\.\s*(get|charAt)\s*\(([^()]*)\)/g;
  while ((m = getRe.exec(text))) {
    const target = locals[m[1]];
    const argText = raw.slice(m.index + m[0].indexOf('(') + 1, m.index + m[0].length - 1);
    if (!isRef(target)) continue;
    const h = frame.heap[target.ref];
    if (!h || !h.elems) continue;
    const r = evaluate(argText, { ...env, reads: [] });
    if (r.ok && typeof r.value === 'number' && r.value >= 0 && r.value < h.elems.length) reads.push({ heapId: target.ref, index: r.value });
  }

  // collection lookups
  const lookups = [];
  const callRe = /([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_]+)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  while ((m = callRe.exec(text))) {
    const [, recv, method] = m;
    if (!LOOKUP_METHODS.has(method)) continue;
    const target = locals[recv];
    if (!isRef(target)) continue;
    const h = frame.heap[target.ref];
    if (!h) continue;
    const argStart = m.index + m[0].indexOf('(') + 1;
    const argText = raw.slice(argStart, m.index + m[0].length - 1);
    const args = splitArgs(argText);
    let key;
    if (args.length && args[0].trim()) {
      const r = evaluate(args[0], { ...env, reads: [] });
      if (!r.ok) continue;
      key = r.value;
    }
    const res = lookup(h, method, key, args, env, frame.heap);
    if (res) lookups.push({ heapId: target.ref, recv, method, ...res });
  }

  // plain-object dictionaries in JS: seen[x]
  return { reads, lookups };
}

function splitArgs(text) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of text) {
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function lookup(h, method, key, args, env, heap) {
  const findKey = (list, k) => {
    const candidates = [keyOf(isRef(k) ? k : encodeScalar(k)), keyOf(encodeScalar(k, true))];
    if (typeof k === 'number') candidates.push(keyOf(k));
    return list.findIndex((x) => candidates.includes(keyOf(x)));
  };
  if (h.kind === 'map') {
    const keys = (h.entries || []).map((e) => e[0]);
    const i = key === undefined ? -1 : findKey(keys, key);
    const keyEnc = isRef(key) ? key : encodeScalar(key);
    switch (method) {
      case 'containsKey': case 'has': return { key: keyEnc, keyIndex: i, result: i >= 0 };
      case 'get': return { key: keyEnc, keyIndex: i, result: i >= 0 ? h.entries[i][1] : (env.language === 'javascript' ? { u: 1 } : null), found: i >= 0 };
      case 'getOrDefault': {
        if (i >= 0) return { key: keyEnc, keyIndex: i, result: h.entries[i][1], found: true };
        const d = args[1] ? evaluate(args[1], { ...env, reads: [] }) : { ok: false };
        return { key: keyEnc, keyIndex: -1, result: d.ok ? encodeScalar(d.value) : undefined, found: false };
      }
      case 'containsValue': return { key: keyEnc, keyIndex: -1, result: (h.entries || []).some((e) => keyOf(e[1]) === keyOf(keyEnc)) };
      case 'firstKey': return h.entries.length ? { keyIndex: 0, result: h.entries[0][0] } : null;
      case 'lastKey': return h.entries.length ? { keyIndex: h.entries.length - 1, result: h.entries[h.entries.length - 1][0] } : null;
      default: return null;
    }
  }
  if (h.kind === 'set') {
    if (!['contains', 'has'].includes(method)) return null;
    const i = findKey(h.elems || [], key);
    return { key: isRef(key) ? key : encodeScalar(key), keyIndex: i, result: i >= 0 };
  }
  const elems = h.elems || [];
  if (['stack'].includes(h.kind) && method === 'peek') return elems.length ? { keyIndex: elems.length - 1, result: elems[elems.length - 1] } : null;
  if (['queue', 'deque', 'pq'].includes(h.kind) && ['peek', 'peekFirst', 'first'].includes(method)) return elems.length ? { keyIndex: 0, result: elems[0] } : null;
  if (h.kind === 'deque' && ['peekLast', 'last'].includes(method)) return elems.length ? { keyIndex: elems.length - 1, result: elems[elems.length - 1] } : null;
  if (['list', 'array'].includes(h.kind) && method === 'contains') {
    const i = findKey(elems, key);
    return { key: encodeScalar(key), keyIndex: i, result: i >= 0 };
  }
  return null;
}
