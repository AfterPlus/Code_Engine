/*
 * The C++ standard library subset the interpreter provides: containers and their methods, iterators, <algorithm>,
 * <cmath>, strings, streams, and the C library pieces online-judge C templates use (malloc, printf, strlen, qsort...).
 */
(function (root) {
  'use strict';
  const NS = root.LCVCpp || (root.LCVCpp = {});
  const {
    Dbl, Chr, Vec, Deq, Stk, Que, PQ, Pair, Tup, Obj, Ptr, Ref, Cell, InitList, RawAlloc, MapObj, Iter, Fn, CppError, CppThrow,
    num, toInt, arith, compare, truthy, keyStr, copyVal, fmtDouble, wrapInt,
  } = NS;

  const NPOS = 18446744073709551615n;
  const valueOf = (a) => (a instanceof Ref ? a.v : a);

  /** cout / cerr / cin / a stringstream. */
  class Stream {
    constructor(kind, text) {
      this.kind = kind; this.buf = text || ''; this.pos = 0;
      this.fixed = false; this.sci = false; this.prec = 6; this.boolalpha = false; this.width = 0; this.fill = ' '; this.hex = false; this.fail = false;
    }
  }
  class Manip { constructor(k, v) { this.k = k; this.v = v; } }
  NS.Stream = Stream;

  function makeLib(I) {
    const L = {};
    const cout = new Stream('cout');
    const cerr = new Stream('cerr');
    const cin = new Stream('cin');

    // ------------------------------------------------------------------------------------ helpers

    const isNum = (v) => typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean' || v instanceof Dbl || v instanceof Chr;
    const int = (v) => Number(toInt(v));

    function callCmp(cmp, a, b) {
      if (cmp === null || cmp === undefined) return L.less(a, b);
      if (cmp === 'greater') return L.less(b, a);
      if (cmp instanceof Fn && cmp.kind === 'builtin' && cmp.name === 'greater') return L.less(b, a);
      if (cmp instanceof Fn && cmp.kind === 'builtin' && cmp.name === 'less') return L.less(a, b);
      return truthy(I.callValue(cmp, [a, b]));
    }

    L.less = function less(a, b) {
      if (isNum(a) && isNum(b)) return compare('<', a, b);
      if (typeof a === 'string' && typeof b === 'string') return a < b;
      if (a instanceof Pair && b instanceof Pair) {
        if (L.less(a.first, b.first)) return true;
        if (L.less(b.first, a.first)) return false;
        return L.less(a.second, b.second);
      }
      if (a instanceof Tup && b instanceof Tup) {
        for (let i = 0; i < a.a.length; i++) { if (L.less(a.a[i], b.a[i])) return true; if (L.less(b.a[i], a.a[i])) return false; }
        return false;
      }
      if ((a instanceof Vec || a instanceof Deq) && (b instanceof Vec || b instanceof Deq)) {
        const n = Math.min(a.a.length, b.a.length);
        for (let i = 0; i < n; i++) { if (L.less(a.a[i], b.a[i])) return true; if (L.less(b.a[i], a.a[i])) return false; }
        return a.a.length < b.a.length;
      }
      if (a instanceof Obj) {
        const ms = I.findMethods(a.cls, 'operator<');
        if (ms) return truthy(I.callFunction(ms[0], [b], a, false));
      }
      const free = I.funcs.get('operator<');
      if (free && (a instanceof Obj || b instanceof Obj)) return truthy(I.callFunction(free[0], [a, b], null, false));
      if (a instanceof Ptr && b instanceof Ptr) return NS.idOf(a.o) < NS.idOf(b.o) || (a.o === b.o && a.i < b.i);
      if (a === null || b === null) return a === null && b !== null;
      throw new CppError('Type Error', 'these values cannot be compared with <');
    };

    L.deepEq = function deepEq(a, b) {
      if (a === b) return true;
      if (isNum(a) && isNum(b)) return compare('==', a, b);
      if (typeof a === 'string' && typeof b === 'string') return a === b;
      if (a instanceof Pair && b instanceof Pair) return I.equals(a.first, b.first) && I.equals(a.second, b.second);
      if (a instanceof Tup && b instanceof Tup) return a.a.length === b.a.length && a.a.every((x, i) => I.equals(x, b.a[i]));
      if ((a instanceof Vec || a instanceof Deq) && (b instanceof Vec || b instanceof Deq)) return a.a.length === b.a.length && a.a.every((x, i) => I.equals(x, b.a[i]));
      if (a instanceof MapObj && b instanceof MapObj) {
        const ea = L.mapEntries(a); const eb = L.mapEntries(b);
        return ea.length === eb.length && ea.every((e, i) => I.equals(e.first, eb[i].first) && (a.isSet || I.equals(e.second, eb[i].second)));
      }
      if (a instanceof Obj && b instanceof Obj) {
        const ms = I.findMethods(a.cls, 'operator==');
        if (ms) return truthy(I.callFunction(ms[0], [b], a, false));
        return a.cls === b.cls && Object.keys(a.f).every((k) => I.equals(a.f[k], b.f[k]));
      }
      return false;
    };

    L.toStringValue = function toStringValue(x) {
      if (typeof x === 'string') return x;
      if (typeof x === 'number' || typeof x === 'bigint') return String(x);
      if (x instanceof Dbl) return fmtDouble(x.v, 6, true);
      if (x instanceof Chr) return String(x.c);
      if (typeof x === 'boolean') return x ? '1' : '0';
      if (x === null) return '0';
      return String(x);
    };

    L.cString = function cString(p) {
      if (typeof p === 'string') return p;
      if (p instanceof Ptr && p.k === 'elem') {
        let s = '';
        for (let i = p.i; i < p.o.a.length; i++) { const c = num(p.o.a[i]); if (c === 0) break; s += String.fromCharCode(Number(c)); }
        return s;
      }
      if (p instanceof Vec) return L.cString(new Ptr('elem', p, 0));
      return '';
    };

    L.cStringLiteral = function cStringLiteral(s) {
      const a = [];
      for (let i = 0; i < s.length; i++) a.push(new Chr(s.charCodeAt(i)));
      a.push(new Chr(0));
      return new Ptr('elem', new Vec(a, NS.mkType('char'), 'array', 'char[]'), 0);
    };

    /** C-style string argument: JS string or char pointer. */
    const cstr = (v) => (typeof v === 'string' ? v : L.cString(v));

    // ------------------------------------------------------------------------------------ constants

    const INF = new Dbl(Infinity);
    const CONSTS = {
      INT_MAX: 2147483647, INT_MIN: -2147483648, UINT_MAX: 4294967295, LONG_MAX: 9223372036854775807n, LONG_MIN: -9223372036854775808n,
      LLONG_MAX: 9223372036854775807n, LLONG_MIN: -9223372036854775808n, ULLONG_MAX: 18446744073709551615n, ULONG_MAX: 18446744073709551615n,
      SHRT_MAX: 32767, SHRT_MIN: -32768, USHRT_MAX: 65535, CHAR_BIT: 8, CHAR_MAX: 127, CHAR_MIN: -128, UCHAR_MAX: 255, SCHAR_MAX: 127, SCHAR_MIN: -128,
      INT8_MAX: 127, INT8_MIN: -128, UINT8_MAX: 255, INT16_MAX: 32767, INT16_MIN: -32768, UINT16_MAX: 65535,
      INT32_MAX: 2147483647, INT32_MIN: -2147483648, UINT32_MAX: 4294967295, INT64_MAX: 9223372036854775807n, INT64_MIN: -9223372036854775808n,
      UINT64_MAX: 18446744073709551615n, SIZE_MAX: 18446744073709551615n, RAND_MAX: 2147483647, EOF: -1, EXIT_SUCCESS: 0, EXIT_FAILURE: 1,
      DBL_MAX: new Dbl(Number.MAX_VALUE), DBL_MIN: new Dbl(2.2250738585072014e-308), DBL_EPSILON: new Dbl(Number.EPSILON), FLT_MAX: new Dbl(3.4028234663852886e38),
      FLT_MIN: new Dbl(1.1754943508222875e-38), FLT_EPSILON: new Dbl(1.1920928955078125e-7), LDBL_MAX: new Dbl(Number.MAX_VALUE),
      M_PI: new Dbl(Math.PI), M_E: new Dbl(Math.E), M_SQRT2: new Dbl(Math.SQRT2), M_LN2: new Dbl(Math.LN2), M_PI_2: new Dbl(Math.PI / 2), INFINITY: INF, HUGE_VAL: INF, NAN: new Dbl(NaN),
      cout, cerr, clog: cerr, cin, nullptr_t: null,
      endl: new Manip('endl'), ends: new Manip('ends'), flush: new Manip('flush'), fixed: new Manip('fixed'), scientific: new Manip('scientific'),
      boolalpha: new Manip('boolalpha'), noboolalpha: new Manip('noboolalpha'), hex: new Manip('hex'), dec: new Manip('dec'), ws: new Manip('ws'),
      left: new Manip('left'), right: new Manip('right'), skipws: new Manip('skipws'), noshowpoint: new Manip('noshowpoint'), showpoint: new Manip('showpoint'),
      stdin: cin, stdout: cout, stderr: cerr,
    };
    L.constant = (name) => (Object.prototype.hasOwnProperty.call(CONSTS, name) ? CONSTS[name] : undefined);

    const LIMITS = {
      i32: [-2147483648, 2147483647], u32: [0, 4294967295], i64: [-9223372036854775808n, 9223372036854775807n], u64: [0, 18446744073709551615n],
      i16: [-32768, 32767], u16: [0, 65535], i8: [-128, 127], u8: [0, 255], char: [new Chr(0), new Chr(127)], bool: [false, true],
    };

    L.scopedConstant = function scopedConstant(t, name) {
      if (t.n === 'string' && name === 'npos') return NPOS;
      if (t.n === 'numeric_limits') return undefined;
      return undefined;
    };

    L.scopedCall = function scopedCall(t, name, args) {
      if (t.n === 'numeric_limits') {
        const tt = t.a[0] || NS.mkType('int');
        const cls = tt.cls;
        if (cls === 'f64' || cls === 'f32') {
          switch (name) {
            case 'max': return new Dbl(cls === 'f32' ? 3.4028234663852886e38 : Number.MAX_VALUE);
            case 'min': return new Dbl(cls === 'f32' ? 1.1754943508222875e-38 : 2.2250738585072014e-308);
            case 'lowest': return new Dbl(cls === 'f32' ? -3.4028234663852886e38 : -Number.MAX_VALUE);
            case 'infinity': return INF;
            case 'epsilon': return new Dbl(cls === 'f32' ? 1.1920928955078125e-7 : Number.EPSILON);
            case 'quiet_NaN': return new Dbl(NaN);
            default: return undefined;
          }
        }
        const lim = LIMITS[cls];
        if (!lim) return undefined;
        if (name === 'max') return lim[1];
        if (name === 'min' || name === 'lowest') return lim[0];
      }
      if (t.n === 'string' && name === 'npos') return NPOS;
      if (t.n === 'chrono') return undefined;
      return undefined;
    };

    // ------------------------------------------------------------------------------------ map / set

    const keyLess = (m) => {
      const c = m.cmp;
      return (a, b) => callCmp(c, a, b);
    };

    L.mapEntries = function mapEntries(m) {
      if (m.cache) return m.cache;
      const list = [];
      for (const v of m.m.values()) { if (Array.isArray(v)) list.push(...v); else list.push(v); }
      if (m.ordered) {
        const lt = keyLess(m);
        list.sort((x, y) => (lt(x.first, y.first) ? -1 : lt(y.first, x.first) ? 1 : 0));
      }
      m.cache = list;
      return list;
    };

    L.mapFind = (m, k) => {
      const e = m.m.get(keyStr(k));
      return e ? (Array.isArray(e) ? e[0] : e) : null;
    };

    L.mapInsert = function mapInsert(m, k, v) {
      const ks = keyStr(k);
      const ex = m.m.get(ks);
      if (m.multi) {
        const arr = ex || [];
        const e = new Pair(k, v);
        arr.push(e);
        if (!ex) m.m.set(ks, arr);
        m.cache = null;
        return { e, inserted: true };
      }
      if (ex) return { e: ex, inserted: false };
      const e = new Pair(k, v);
      m.m.set(ks, e);
      m.cache = null;
      return { e, inserted: true };
    };

    L.setInsert = (s, k) => L.mapInsert(s, k, undefined);

    L.mapEntry = function mapEntry(m, k, create) {
      const ex = L.mapFind(m, k);
      if (ex) return ex;
      if (!create) throw new CppError('Out Of Range', 'map::at: key not found');
      const v = m.vt ? I.defaultValue(m.vt) : 0;
      return L.mapInsert(m, copyVal(k), v).e;
    };

    function mapErase(m, k) {
      const ks = keyStr(k);
      const ex = m.m.get(ks);
      if (!ex) return 0;
      m.m.delete(ks);
      m.cache = null;
      return Array.isArray(ex) ? ex.length : 1;
    }

    function eraseEntry(m, e) {
      const ks = keyStr(e.first);
      const ex = m.m.get(ks);
      if (Array.isArray(ex)) { const i = ex.indexOf(e); if (i >= 0) ex.splice(i, 1); if (!ex.length) m.m.delete(ks); } else m.m.delete(ks);
      m.cache = null;
    }

    const mapSize = (m) => { let n = 0; for (const v of m.m.values()) n += Array.isArray(v) ? v.length : 1; return n; };

    // ------------------------------------------------------------------------------------ priority queue

    const pqLess = (pq) => (a, b) => callCmp(pq.cmp, a, b);
    L.pqPush = function pqPush(pq, v) {
      const a = pq.a;
      const lt = pqLess(pq);
      a.push(v);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (lt(a[p], a[i])) { const t = a[p]; a[p] = a[i]; a[i] = t; i = p; } else break;
      }
    };
    function pqPop(pq) {
      const a = pq.a;
      if (!a.length) throw new CppError('Runtime Error', 'pop() on an empty priority_queue');
      const lt = pqLess(pq);
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < a.length && lt(a[m], a[l])) m = l;
          if (r < a.length && lt(a[m], a[r])) m = r;
          if (m === i) break;
          const t = a[m]; a[m] = a[i]; a[i] = t; i = m;
        }
      }
      return top;
    }

    // ------------------------------------------------------------------------------------ iterators

    const seqOf = (it) => it.c.a;

    L.iterDeref = function iterDeref(it) {
      if (it.assoc) {
        if (!it.e) throw new CppError('Segmentation Fault', 'dereferencing end()', I.curLine);
        return it.c.isSet ? it.e.first : it.e;
      }
      if (it.c instanceof Ref) {
        const s = it.c.v;
        const idx = it.rev ? s.length - 1 - it.i : it.i;
        if (idx < 0 || idx >= s.length) throw new CppError('Segmentation Fault', 'dereferencing an iterator outside the string', I.curLine);
        return new Chr(s.charCodeAt(idx));
      }
      const a = seqOf(it);
      const idx = it.rev ? a.length - 1 - it.i : it.i;
      if (idx < 0 || idx >= a.length) throw new CppError('Segmentation Fault', 'dereferencing an iterator outside the container', I.curLine);
      return a[idx];
    };

    L.iterSet = function iterSet(it, v) {
      if (it.assoc) { if (!it.c.isSet && it.e) { it.e.second = v; return; } throw new CppError('Type Error', 'cannot assign through this iterator'); }
      if (it.c instanceof Ref) {
        const s = it.c.v;
        const idx = it.rev ? s.length - 1 - it.i : it.i;
        it.c.v = s.slice(0, idx) + String.fromCharCode(num(v)) + s.slice(idx + 1);
        return;
      }
      const a = seqOf(it);
      const idx = it.rev ? a.length - 1 - it.i : it.i;
      a[idx] = it.c.et ? I.coerce(it.c.et, v) : v;
    };

    function stepAssoc(it, d) {
      const list = L.mapEntries(it.c);
      let e = it.e;
      const forward = (d > 0) !== it.rev;
      for (let k = 0; k < Math.abs(d); k++) {
        if (forward) {
          if (e === null) break;
          const idx = list.indexOf(e);
          e = idx + 1 < list.length ? list[idx + 1] : null;
        } else {
          const idx = e === null ? list.length : list.indexOf(e);
          e = idx - 1 >= 0 ? list[idx - 1] : e;
        }
      }
      const r = new Iter(it.c, 0, e);
      r.rev = it.rev;
      return r;
    }

    L.iterArith = function iterArith(op, l, r) {
      if (l instanceof Iter && r instanceof Iter) {
        if (op === '-') return l.assoc ? L.mapEntries(l.c).indexOf(l.e) - L.mapEntries(r.c).indexOf(r.e) : l.i - r.i;
        throw new CppError('Type Error', 'unsupported iterator arithmetic');
      }
      const it = l instanceof Iter ? l : r;
      const n = int(l instanceof Iter ? r : l);
      const d = op === '-' ? -n : n;
      if (it.assoc) return stepAssoc(it, d);
      const res = new Iter(it.c, it.i + d);
      res.rev = it.rev;
      return res;
    };

    /** [first, last) as a JS array of values. */
    L.iterRange = function iterRange(first, last) {
      return makeRange(first, last).read();
    };

    /** A view over [first, last): read() returns the values, write(array) stores them back in place. */
    function makeRange(first, last) {
      if (first instanceof Vec && first.kind === 'array') first = new Ptr('elem', first, 0);
      if (first instanceof Ptr && first.k === 'elem') {
        const a = first.o.a;
        const lo = first.i;
        const hi = last instanceof Ptr ? last.i : a.length;
        return { n: hi - lo, read: () => a.slice(lo, hi), write(arr) { for (let i = 0; i < arr.length; i++) a[lo + i] = arr[i]; }, a, lo, hi };
      }
      if (first instanceof Iter && !first.assoc) {
        const c = first.c;
        const rev = first.rev;
        if (c instanceof Ref) {
          const s = c.v;
          let lo = first.i;
          let hi = last.i;
          if (rev) { const len = s.length; [lo, hi] = [len - hi, len - lo]; }
          return {
            n: hi - lo,
            read: () => { const arr = []; for (let i = lo; i < hi; i++) arr.push(new Chr(s.charCodeAt(i))); return rev ? arr.reverse() : arr; },
            write(arr) { const out = rev ? arr.slice().reverse() : arr; c.v = s.slice(0, lo) + out.map((x) => String.fromCharCode(Number(num(x)))).join('') + s.slice(hi); },
          };
        }
        const a = c.a;
        let lo = first.i;
        let hi = last.i;
        if (rev) { const len = a.length; [lo, hi] = [len - hi, len - lo]; }
        return {
          n: hi - lo,
          read: () => { const arr = a.slice(lo, hi); return rev ? arr.reverse() : arr; },
          write(arr) { const out = rev ? arr.slice().reverse() : arr; for (let i = 0; i < out.length; i++) a[lo + i] = out[i]; },
          a, lo, hi,
        };
      }
      if (first instanceof Iter && first.assoc) {
        const list = L.mapEntries(first.c);
        const lo = first.e === null ? list.length : list.indexOf(first.e);
        const hi = last.e === null ? list.length : list.indexOf(last.e);
        const isSet = first.c.isSet;
        return { n: hi - lo, read: () => list.slice(lo, hi).map((e) => (isSet ? e.first : e)), write() { throw new CppError('Type Error', 'cannot modify elements of an associative container in place'); } };
      }
      throw new CppError('Type Error', 'expected an iterator range');
    }
    L.makeRange = makeRange;

    /** Range-for support: {length(), get(i) -> {value, ref}}. */
    L.rangeItems = function rangeItems(v, coll) {
      if (v instanceof Vec || v instanceof Deq) return { length: () => v.a.length, get: (i) => ({ value: v.a[i], ref: new NS.ElemRef(v.a, i, v.et, v) }) };
      if (typeof v === 'string') { const ref = coll instanceof Ref ? coll : new Cell(v); return { length: () => v.length, get: (i) => ({ value: new Chr(v.charCodeAt(i)), ref: new NS.StrCharRef(ref, i) }) }; }
      if (v instanceof MapObj) {
        const list = L.mapEntries(v).slice();
        return { length: () => list.length, get: (i) => (v.isSet ? { value: list[i].first, ref: new Cell(list[i].first) } : { value: list[i], ref: new Cell(list[i]) }) };
      }
      if (v instanceof InitList) return { length: () => v.items.length, get: (i) => ({ value: v.items[i] }) };
      if (v instanceof Ptr && v.k === 'obj') return L.rangeItems(v.o, coll);
      if (v instanceof Stk || v instanceof Que || v instanceof PQ) throw new CppError('Type Error', 'this container cannot be iterated with a range-for');
      throw new CppError('Type Error', 'this value cannot be iterated with a range-for');
    };

    L.initListFor = function initListFor(cur, il) {
      if (cur instanceof Vec) return new Vec(il.items.map(copyVal), cur.et, cur.kind, cur.tname);
      if (cur instanceof Pair) return new Pair(il.items[0], il.items[1]);
      return new Vec(il.items.map(copyVal), null, 'list', 'vector');
    };

    L.makeException = function makeException(err) {
      const cd = { name: 'exception', builtinException: true, fields: ['msg'], fieldTypes: {}, methods: new Map(), ctors: [], statics: new Map(), bases: [], inits: new Map() };
      const o = new Obj(cd);
      o.f.msg = err.message;
      return o;
    };

    L.makeSStream = (text) => new Stream('sstream', text);

    L.constructBuiltin = function constructBuiltin(t) {
      if (['runtime_error', 'logic_error', 'out_of_range', 'invalid_argument', 'length_error', 'domain_error', 'range_error', 'overflow_error', 'underflow_error', 'exception', 'bad_alloc'].includes(t.n)) return undefined;
      return undefined;
    };

    // ------------------------------------------------------------------------------------ output

    function fmtStream(st, v) {
      let text;
      if (typeof v === 'string') text = v;
      else if (v instanceof Chr) text = String.fromCharCode(v.c);
      else if (typeof v === 'boolean') text = st.boolalpha ? String(v) : (v ? '1' : '0');
      else if (typeof v === 'number' || typeof v === 'bigint') text = st.hex ? v.toString(16) : String(v);
      else if (v instanceof Dbl) text = fmtDouble(v.v, st.prec, st.fixed, st.sci);
      else if (v === null || v === undefined) text = '0';
      else if (v instanceof Ptr && v.k === 'elem' && v.o.et && v.o.et.cls === 'char') text = L.cString(v);
      else if (v instanceof Ptr) text = '0x' + (0x1000 + NS.idOf(v.o) * 16).toString(16);
      else if (v instanceof Obj && v.cls.builtinException) text = v.f.msg;
      else if (v instanceof Fn) text = '1';
      else text = String(v);
      if (st.width > text.length) { text = st.fill.repeat(st.width - text.length) + text; }
      st.width = 0;
      return text;
    }

    function emit(st, text) {
      if (st.kind === 'cout' || st.kind === 'cerr') I.write(text);
      else st.buf += text;
    }

    L.streamOp = function streamOp(op, st, rightNode, env) {
      if (op === '<<') {
        const v = I.ev(rightNode, env);
        if (v instanceof Manip) {
          switch (v.k) {
            case 'endl': emit(st, '\n'); break;
            case 'ends': emit(st, '\0'); break;
            case 'fixed': st.fixed = true; st.sci = false; break;
            case 'scientific': st.sci = true; st.fixed = false; break;
            case 'boolalpha': st.boolalpha = true; break;
            case 'noboolalpha': st.boolalpha = false; break;
            case 'hex': st.hex = true; break;
            case 'dec': st.hex = false; break;
            case 'setprecision': st.prec = v.v; break;
            case 'setw': st.width = v.v; break;
            case 'setfill': st.fill = v.v; break;
            default: break;
          }
          return st;
        }
        if (v instanceof Vec && v.a.length && v.a[0] instanceof Chr && v.kind === 'array') { emit(st, L.cString(v)); return st; }
        emit(st, fmtStream(st, v));
        return st;
      }
      // >>
      const ref = I.isLvalueNode(rightNode) ? I.lv(rightNode, env) : new Cell(0);
      if (st.kind === 'cin') { st.fail = true; return st; }
      const rest = st.buf.slice(st.pos);
      const m = /^\s*(\S+)/.exec(rest);
      if (!m) { st.fail = true; return st; }
      st.pos += m[0].length;
      const tok = m[1];
      const cur = ref.v;
      if (typeof cur === 'string') ref.v = tok;
      else if (cur instanceof Dbl) ref.v = new Dbl(parseFloat(tok));
      else if (cur instanceof Chr) ref.v = new Chr(tok.charCodeAt(0));
      else ref.v = ref.t ? I.coerce(ref.t, parseInt(tok, 10)) : parseInt(tok, 10);
      return st;
    };

    /** printf-style formatting. */
    function cFormat(fmt, args) {
      let ai = 0;
      return fmt.replace(/%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d+))?(hh|h|ll|l|z|j|t|L)?([diuoxXeEfFgGaAcspn%])/g, (m, flags, width, prec, len, conv) => {
        if (conv === '%') return '%';
        if (width === '*') width = int(args[ai++]);
        if (prec === '*') prec = int(args[ai++]);
        const w = width === undefined ? 0 : Number(width);
        const p = prec === undefined ? undefined : Number(prec);
        let a = args[ai++];
        a = valueOf(a);
        let s;
        switch (conv) {
          case 'd': case 'i': {
            const x = toInt(a);
            s = String(len === 'll' || len === 'l' || len === 'z' || len === 'j' ? x : wrapInt(x, 'i32'));
            if (flags.includes('+') && !s.startsWith('-')) s = '+' + s;
            else if (flags.includes(' ') && !s.startsWith('-')) s = ' ' + s;
            break;
          }
          case 'u': { const x = toInt(a); s = String(len === 'll' || len === 'l' || len === 'z' ? wrapInt(x, 'u64') : wrapInt(x, 'u32')); break; }
          case 'x': case 'X': case 'o': {
            const x = toInt(a);
            const wide = len === 'll' || len === 'l' || len === 'z';
            const v = wrapInt(x, wide ? 'u64' : 'u32');
            s = v.toString(conv === 'o' ? 8 : 16);
            if (conv === 'X') s = s.toUpperCase();
            if (flags.includes('#') && v != 0) s = (conv === 'o' ? '0' : conv === 'X' ? '0X' : '0x') + s; // eslint-disable-line eqeqeq
            break;
          }
          case 'f': case 'F': s = num(a) === undefined ? '' : fmtDouble(Number(num(a)), p === undefined ? 6 : p, true); break;
          case 'e': case 'E': s = fmtDouble(Number(num(a)), p === undefined ? 6 : p, false, true); if (conv === 'E') s = s.toUpperCase(); break;
          case 'g': case 'G': s = fmtDouble(Number(num(a)), p === undefined ? 6 : p === 0 ? 1 : p); break;
          case 'c': s = a instanceof Chr ? String.fromCharCode(a.c) : String.fromCharCode(int(a)); break;
          case 's': s = cstr(a); if (p !== undefined) s = s.slice(0, p); break;
          case 'p': s = a === null ? '(nil)' : '0x' + (0x1000 + (a && a.o ? NS.idOf(a.o) * 16 : 0)).toString(16); break;
          default: s = m;
        }
        if (s.length < w) {
          if (flags.includes('-')) s = s + ' '.repeat(w - s.length);
          else if (flags.includes('0') && 'diuoxXfFeEgG'.includes(conv)) { const neg = /^[+-]/.test(s) ? s[0] : ''; s = neg + '0'.repeat(w - s.length) + s.slice(neg.length); } else s = ' '.repeat(w - s.length) + s;
        }
        return s;
      });
    }

    // ------------------------------------------------------------------------------------ free functions

    const FREE = Object.create(null);
    const REF_ARGS = { swap: [0, 1], getline: [1], sscanf: [], iter_swap: [] };
    L.hasFree = (name) => name in FREE;
    L.refArgs = (name) => REF_ARGS[name] || null;
    L.callFree = function callFree(name, args, targs, node) {
      const f = FREE[name];
      if (!f) throw new CppError('Name Error', `'${name}' is not supported by this interpreter`, node && node.line);
      return f(args, targs, node);
    };

    const D = (x) => new Dbl(x);
    const math1 = (fn) => (a) => D(fn(Number(num(a[0]))));
    Object.assign(FREE, {
      abs: (a) => { const x = a[0]; if (x instanceof Dbl) return D(Math.abs(x.v)); const v = toInt(x); return v < 0 ? arith('-', 0, v) : v; },
      labs: (a) => FREE.abs(a), llabs: (a) => FREE.abs(a),
      fabs: math1(Math.abs), sqrt: math1(Math.sqrt), cbrt: math1(Math.cbrt), floor: math1(Math.floor), ceil: math1(Math.ceil),
      round: math1((x) => (x < 0 ? -Math.round(-x) : Math.round(x))), trunc: math1(Math.trunc),
      log: math1(Math.log), log2: math1(Math.log2), log10: math1(Math.log10), exp: math1(Math.exp), exp2: math1((x) => 2 ** x),
      sin: math1(Math.sin), cos: math1(Math.cos), tan: math1(Math.tan), asin: math1(Math.asin), acos: math1(Math.acos), atan: math1(Math.atan),
      sinh: math1(Math.sinh), cosh: math1(Math.cosh), tanh: math1(Math.tanh),
      atan2: (a) => D(Math.atan2(Number(num(a[0])), Number(num(a[1])))),
      pow: (a) => D(Math.pow(Number(num(a[0])), Number(num(a[1])))),
      hypot: (a) => D(Math.hypot(Number(num(a[0])), Number(num(a[1])))),
      fmod: (a) => D(Number(num(a[0])) % Number(num(a[1]))),
      isnan: (a) => Number.isNaN(Number(num(a[0]))), isinf: (a) => Math.abs(Number(num(a[0]))) === Infinity,
      gcd: (a) => { let x = toInt(a[0]); let y = toInt(a[1]); x = x < 0 ? arith('-', 0, x) : x; y = y < 0 ? arith('-', 0, y) : y; while (y != 0) { const t = arith('%', x, y); x = y; y = t; } return x; }, // eslint-disable-line eqeqeq
      lcm: (a) => { const g = FREE.gcd(a); return g == 0 ? 0 : arith('*', arith('/', toInt(a[0]), g), toInt(a[1])); }, // eslint-disable-line eqeqeq
      swap: (a) => { const x = a[0]; const y = a[1]; const t = x.v; x.v = y.v; y.v = t; return undefined; },
      iter_swap: (a) => { const t = L.iterDeref(a[0]); L.iterSet(a[0], L.iterDeref(a[1])); L.iterSet(a[1], t); return undefined; },
      rand: () => Math.floor(Math.random() * 2147483647), srand: () => undefined, time: () => 0, clock: () => 0, exit: (a) => { throw new CppError('Exit', 'exit(' + int(a[0] || 0) + ') was called'); },
      assert: (a) => { if (!truthy(a[0])) throw new CppError('Assertion Failed', 'assertion failed'); return undefined; },
      make_pair: (a) => new Pair(copyVal(a[0]), copyVal(a[1])),
      make_tuple: (a) => new Tup(a.map(copyVal)),
      tie: (a) => new Tup(a),
      move: (a) => a[0], forward: (a) => a[0], ref: (a) => a[0], cref: (a) => a[0], as_const: (a) => a[0], identity: (a) => a[0],
      to_string: (a) => L.toStringValue(a[0]),
      stoi: (a) => { const v = parseInt(a[0], a[2] ? int(a[2]) : 10); if (Number.isNaN(v)) throw new CppError('Invalid Argument', 'stoi: no conversion'); return wrapInt(v, 'i32'); },
      stol: (a) => FREE.stoll(a), stoll: (a) => { const v = parseInt(a[0], a[2] ? int(a[2]) : 10); if (Number.isNaN(v)) throw new CppError('Invalid Argument', 'stoll: no conversion'); return v; },
      stoul: (a) => FREE.stoll(a), stoull: (a) => FREE.stoll(a),
      stod: (a) => D(parseFloat(a[0])), stof: (a) => D(Math.fround(parseFloat(a[0]))),
      atoi: (a) => { const v = parseInt(cstr(a[0]), 10); return Number.isNaN(v) ? 0 : wrapInt(v, 'i32'); },
      atol: (a) => FREE.atoi(a), atoll: (a) => FREE.atoi(a), atof: (a) => D(parseFloat(cstr(a[0])) || 0),
      isdigit: (a) => { const c = int(a[0]); return c >= 48 && c <= 57; },
      isalpha: (a) => { const c = int(a[0]); return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); },
      isalnum: (a) => FREE.isdigit(a) || FREE.isalpha(a),
      islower: (a) => { const c = int(a[0]); return c >= 97 && c <= 122; },
      isupper: (a) => { const c = int(a[0]); return c >= 65 && c <= 90; },
      isspace: (a) => { const c = int(a[0]); return c === 32 || (c >= 9 && c <= 13); },
      ispunct: (a) => { const c = int(a[0]); return c > 32 && c < 127 && !FREE.isalnum([c]); },
      isxdigit: (a) => /[0-9a-fA-F]/.test(String.fromCharCode(int(a[0]))),
      tolower: (a) => { const c = int(a[0]); const r = c >= 65 && c <= 90 ? c + 32 : c; return a[0] instanceof Chr ? new Chr(r) : r; },
      toupper: (a) => { const c = int(a[0]); const r = c >= 97 && c <= 122 ? c - 32 : c; return a[0] instanceof Chr ? new Chr(r) : r; },
      __builtin_popcount: (a) => { let x = BigInt.asUintN(32, BigInt(toInt(a[0]))); let n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; },
      __builtin_popcountll: (a) => { let x = BigInt.asUintN(64, BigInt(toInt(a[0]))); let n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; },
      __builtin_clz: (a) => Math.clz32(int(a[0])),
      __builtin_ctz: (a) => { const x = int(a[0]); if (x === 0) return 32; return 31 - Math.clz32(x & -x); },
      popcount: (a) => FREE.__builtin_popcountll(a),
      __gcd: (a) => FREE.gcd(a),
    });

    FREE.min = (a) => {
      if (a.length === 1 && a[0] instanceof InitList) return FREE.min([...a[0].items]);
      if (a.length === 1 && (a[0] instanceof Vec)) return FREE.min(a[0].a);
      const cmp = a.length === 3 ? a[2] : null;
      return callCmp(cmp, a[1], a[0]) ? a[1] : a[0];
    };
    FREE.max = (a) => {
      if (a.length === 1 && a[0] instanceof InitList) return FREE.max([...a[0].items]);
      const cmp = a.length === 3 ? a[2] : null;
      if (a.length > 3) return a.reduce((m, x) => (callCmp(null, m, x) ? x : m));
      return callCmp(cmp, a[0], a[1]) ? a[1] : a[0];
    };
    FREE.minmax = (a) => new Pair(FREE.min(a), FREE.max(a));

    // strings and C strings
    Object.assign(FREE, {
      strlen: (a) => cstr(a[0]).length,
      strcmp: (a) => { const x = cstr(a[0]); const y = cstr(a[1]); return x < y ? -1 : x > y ? 1 : 0; },
      strncmp: (a) => { const n = int(a[2]); const x = cstr(a[0]).slice(0, n); const y = cstr(a[1]).slice(0, n); return x < y ? -1 : x > y ? 1 : 0; },
      strcpy: (a) => { writeC(a[0], cstr(a[1])); return a[0]; },
      strncpy: (a) => { writeC(a[0], cstr(a[1]).slice(0, int(a[2]))); return a[0]; },
      strcat: (a) => { writeC(a[0], cstr(a[0]) + cstr(a[1])); return a[0]; },
      strchr: (a) => { const s = cstr(a[0]); const i = s.indexOf(String.fromCharCode(int(a[1]))); return i < 0 ? null : new Ptr('elem', a[0].o, a[0].i + i); },
      strdup: (a) => L.cStringLiteral(cstr(a[0])),
      strstr: (a) => { const i = cstr(a[0]).indexOf(cstr(a[1])); return i < 0 ? null : new Ptr('elem', a[0].o, a[0].i + i); },
    });
    function writeC(dst, s) {
      if (dst instanceof Vec) dst = new Ptr('elem', dst, 0);
      if (!(dst instanceof Ptr) || dst.k !== 'elem') throw new CppError('Segmentation Fault', 'writing to a non-array string');
      const a = dst.o.a;
      for (let i = 0; i <= s.length; i++) {
        if (dst.i + i >= a.length) throw new CppError('Segmentation Fault', 'string write is past the end of the buffer');
        a[dst.i + i] = new Chr(i < s.length ? s.charCodeAt(i) : 0);
      }
    }

    // memory
    Object.assign(FREE, {
      malloc: (a) => new RawAlloc(int(a[0])),
      calloc: (a) => new RawAlloc(int(a[0]) * int(a[1])),
      realloc: (a) => {
        const p = a[0];
        const raw = new RawAlloc(int(a[1]));
        if (p instanceof Ptr && p.k === 'elem') {
          const fresh = I.materialize({ ...p.o.et, p: (p.o.et ? p.o.et.p : 0) + 1 }, raw);
          for (let i = 0; i < Math.min(fresh.o.a.length, p.o.a.length); i++) fresh.o.a[i] = p.o.a[i];
          return fresh;
        }
        return raw;
      },
      free: () => undefined,
      memset: (a) => {
        const p = a[0]; const v = int(a[1]); const n = int(a[2]);
        if (p instanceof Ptr && p.k === 'elem') {
          const et = p.o.et; const size = Math.max(1, I.sizeOfType(et));
          const count = Math.min(p.o.a.length - p.i, Math.ceil(n / size));
          for (let i = 0; i < count; i++) p.o.a[p.i + i] = v === 0 ? I.defaultValue(et) : I.coerce(et, v === -1 ? -1 : v);
        } else if (p instanceof Vec) { for (let i = 0; i < p.a.length; i++) p.a[i] = v === 0 ? I.defaultValue(p.et) : I.coerce(p.et, v === -1 ? -1 : v); }
        return p;
      },
      memcpy: (a) => { const d = a[0]; const s = a[1]; const n = int(a[2]); const size = d instanceof Ptr ? Math.max(1, I.sizeOfType(d.o.et)) : 1; if (d instanceof Ptr && s instanceof Ptr) for (let i = 0; i < n / size; i++) d.o.a[d.i + i] = copyVal(s.o.a[s.i + i]); return d; },
      qsort: (a) => {
        const base = a[0] instanceof Vec ? new Ptr('elem', a[0], 0) : a[0];
        const n = int(a[1]);
        const cmp = a[3];
        const arr = base.o.a.slice(base.i, base.i + n);
        const idx = arr.map((_, i) => i);
        // the comparator receives pointers to the elements, like the C API
        const tmp = new Vec(arr.slice(), base.o.et, 'array', 'array');
        idx.sort((x, y) => int(I.callValue(cmp, [new Ptr('elem', tmp, x), new Ptr('elem', tmp, y)])));
        idx.forEach((src, i) => { base.o.a[base.i + i] = tmp.a[src]; });
        return undefined;
      },
    });

    // output
    Object.assign(FREE, {
      printf: (a) => { const s = cFormat(cstr(a[0]), a.slice(1)); I.write(s); return s.length; },
      puts: (a) => { I.write(cstr(a[0]) + '\n'); return 1; },
      putchar: (a) => { I.write(String.fromCharCode(int(a[0]))); return a[0]; },
      fputs: (a) => { I.write(cstr(a[0])); return 1; },
      fprintf: (a) => { const s = cFormat(cstr(a[1]), a.slice(2)); I.write(s); return s.length; },
      sprintf: (a) => { const s = cFormat(cstr(a[1]), a.slice(2)); writeC(a[0], s); return s.length; },
      snprintf: (a) => { const s = cFormat(cstr(a[2]), a.slice(3)).slice(0, Math.max(0, int(a[1]) - 1)); writeC(a[0], s); return s.length; },
      setprecision: (a) => new Manip('setprecision', int(a[0])),
      setw: (a) => new Manip('setw', int(a[0])),
      setfill: (a) => new Manip('setfill', a[0] instanceof Chr ? String.fromCharCode(a[0].c) : String(a[0])),
      getline: (a) => {
        const st = a[0] instanceof Ref ? a[0].v : a[0];
        const ref = a[1];
        if (!(st instanceof Stream) || st.kind === 'cin') return false;
        if (st.pos >= st.buf.length) { st.fail = true; return false; }
        const delim = a.length > 2 ? (a[2] instanceof Chr ? String.fromCharCode(a[2].c) : String(a[2])) : '\n';
        const at = st.buf.indexOf(delim, st.pos);
        const end = at < 0 ? st.buf.length : at;
        if (ref instanceof Ref) ref.v = st.buf.slice(st.pos, end); else throw new CppError('Type Error', 'getline needs a string variable');
        st.pos = at < 0 ? end : end + delim.length;
        return true;
      },
      scanf: () => 0, sscanf: () => 0,
    });

    // functors
    for (const name of ['less', 'greater', 'plus', 'minus', 'multiplies', 'divides', 'modulus', 'equal_to', 'not_equal_to', 'less_equal', 'greater_equal', 'logical_and', 'logical_or', 'logical_not', 'negate', 'hash']) {
      const ops = {
        less: (x, y) => L.less(x, y), greater: (x, y) => L.less(y, x), plus: (x, y) => I.binop('+', x, y), minus: (x, y) => I.binop('-', x, y),
        multiplies: (x, y) => I.binop('*', x, y), divides: (x, y) => I.binop('/', x, y), modulus: (x, y) => I.binop('%', x, y), equal_to: (x, y) => I.equals(x, y),
        not_equal_to: (x, y) => !I.equals(x, y), less_equal: (x, y) => !L.less(y, x), greater_equal: (x, y) => !L.less(x, y), logical_and: (x, y) => truthy(x) && truthy(y),
        logical_or: (x, y) => truthy(x) || truthy(y), logical_not: (x) => !truthy(x), negate: (x) => arith('-', 0, x), hash: (x) => keyStr(x).length,
      };
      FREE[name] = () => new Fn('builtin', { name, fn: (args) => ops[name](args[0], args[1]) });
    }

    // ------------------------------------------------------------------------------------ algorithms

    const cmpFn = (c) => (x, y) => callCmp(c, x, y);
    const sortValues = (arr, c) => arr.sort((x, y) => { const lt = callCmp(c, x, y); if (lt) return -1; return callCmp(c, y, x) ? 1 : 0; });
    const endOf = (first, k) => { const r = new Iter(first.c, first.i + k); r.rev = first.rev; return r; };

    Object.assign(FREE, {
      sort: (a) => { const r = makeRange(a[0], a[1]); r.write(sortValues(r.read(), a[2])); return undefined; },
      stable_sort: (a) => FREE.sort(a),
      partial_sort: (a) => { const r = makeRange(a[0], a[2]); r.write(sortValues(r.read(), a[3])); return undefined; },
      nth_element: (a) => { const r = makeRange(a[0], a[2]); r.write(sortValues(r.read(), a[3])); return undefined; },
      reverse: (a) => { const r = makeRange(a[0], a[1]); r.write(r.read().reverse()); return undefined; },
      rotate: (a) => { const first = a[0]; const mid = a[1]; const last = a[2]; const r = makeRange(first, last); const arr = r.read(); const k = makeRange(first, mid).n; r.write(arr.slice(k).concat(arr.slice(0, k))); return mid; },
      fill: (a) => { const r = makeRange(a[0], a[1]); r.write(r.read().map(() => copyVal(a[2]))); return undefined; },
      fill_n: (a) => { const last = a[0] instanceof Ptr ? new Ptr('elem', a[0].o, a[0].i + int(a[1])) : endOf(a[0], int(a[1])); const r = makeRange(a[0], last); r.write(r.read().map(() => copyVal(a[2]))); return undefined; },
      iota: (a) => { const r = makeRange(a[0], a[1]); let v = a[2]; r.write(r.read().map(() => { const cur = v; v = arith('+', v, 1); return cur; })); return undefined; },
      accumulate: (a) => { const arr = makeRange(a[0], a[1]).read(); let acc = a[2]; for (const x of arr) acc = a.length > 3 ? I.callValue(a[3], [acc, x]) : I.binop('+', acc, x); return acc; },
      reduce: (a) => FREE.accumulate(a),
      partial_sum: (a) => { const arr = makeRange(a[0], a[1]).read(); let acc = null; const out = arr.map((x, i) => { acc = i === 0 ? x : I.binop('+', acc, x); return acc; }); const dst = a[2]; const rr = makeRange(dst, dst instanceof Iter ? endOf(dst, out.length) : new Ptr('elem', dst.o, dst.i + out.length)); rr.write(out); return undefined; },
      count: (a) => makeRange(a[0], a[1]).read().filter((x) => I.equals(x, a[2])).length,
      count_if: (a) => makeRange(a[0], a[1]).read().filter((x) => truthy(I.callValue(a[2], [x]))).length,
      all_of: (a) => makeRange(a[0], a[1]).read().every((x) => truthy(I.callValue(a[2], [x]))),
      any_of: (a) => makeRange(a[0], a[1]).read().some((x) => truthy(I.callValue(a[2], [x]))),
      none_of: (a) => !makeRange(a[0], a[1]).read().some((x) => truthy(I.callValue(a[2], [x]))),
      for_each: (a) => { for (const x of makeRange(a[0], a[1]).read()) I.callValue(a[2], [x]); return a[2]; },
      find: (a) => { const arr = makeRange(a[0], a[1]).read(); const i = arr.findIndex((x) => I.equals(x, a[2])); return i < 0 ? a[1] : advance(a[0], i); },
      find_if: (a) => { const arr = makeRange(a[0], a[1]).read(); const i = arr.findIndex((x) => truthy(I.callValue(a[2], [x]))); return i < 0 ? a[1] : advance(a[0], i); },
      min_element: (a) => { const arr = makeRange(a[0], a[1]).read(); if (!arr.length) return a[1]; let b = 0; for (let i = 1; i < arr.length; i++) if (callCmp(a[2], arr[i], arr[b])) b = i; return advance(a[0], b); },
      max_element: (a) => { const arr = makeRange(a[0], a[1]).read(); if (!arr.length) return a[1]; let b = 0; for (let i = 1; i < arr.length; i++) if (callCmp(a[2], arr[b], arr[i])) b = i; return advance(a[0], b); },
      distance: (a) => (a[0] instanceof Iter ? (a[0].assoc ? makeRange(a[0], a[1]).n : a[1].i - a[0].i) : a[1].i - a[0].i),
      next: (a) => (a[0] instanceof Iter ? L.iterArith('+', a[0], a.length > 1 ? int(a[1]) : 1) : a[0]),
      prev: (a) => (a[0] instanceof Iter ? L.iterArith('-', a[0], a.length > 1 ? int(a[1]) : 1) : a[0]),
      advance: (a) => { const it = a[0].v; a[0].v = L.iterArith('+', it, int(a[1])); return undefined; },
      begin: (a) => L.callMethod(a[0], 'begin', [], null), end: (a) => L.callMethod(a[0], 'end', [], null),
      size: (a) => L.callMethod(a[0], 'size', [], null), empty: (a) => L.callMethod(a[0], 'empty', [], null),
      lower_bound: (a) => { const arr = makeRange(a[0], a[1]).read(); let lo = 0; let hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (callCmp(a[3], arr[m], a[2])) lo = m + 1; else hi = m; } return advance(a[0], lo); },
      upper_bound: (a) => { const arr = makeRange(a[0], a[1]).read(); let lo = 0; let hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (!callCmp(a[3], a[2], arr[m])) lo = m + 1; else hi = m; } return advance(a[0], lo); },
      binary_search: (a) => { const arr = makeRange(a[0], a[1]).read(); let lo = 0; let hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (callCmp(a[3], arr[m], a[2])) lo = m + 1; else hi = m; } return lo < arr.length && !callCmp(a[3], a[2], arr[lo]); },
      unique: (a) => { const r = makeRange(a[0], a[1]); const arr = r.read(); const out = []; for (const x of arr) if (!out.length || !(a[2] ? truthy(I.callValue(a[2], [out[out.length - 1], x])) : I.equals(out[out.length - 1], x))) out.push(x); r.write(out.concat(arr.slice(out.length))); return advance(a[0], out.length); },
      remove: (a) => { const r = makeRange(a[0], a[1]); const arr = r.read(); const out = arr.filter((x) => !I.equals(x, a[2])); r.write(out.concat(arr.slice(out.length))); return advance(a[0], out.length); },
      remove_if: (a) => { const r = makeRange(a[0], a[1]); const arr = r.read(); const out = arr.filter((x) => !truthy(I.callValue(a[2], [x]))); r.write(out.concat(arr.slice(out.length))); return advance(a[0], out.length); },
      is_sorted: (a) => { const arr = makeRange(a[0], a[1]).read(); for (let i = 1; i < arr.length; i++) if (callCmp(a[2], arr[i], arr[i - 1])) return false; return true; },
      transform: (a) => {
        const src = makeRange(a[0], a[1]).read();
        const has2 = a.length === 5;
        const dst = has2 ? a[3] : a[2];
        const fn = has2 ? a[4] : a[3];
        const src2 = has2 ? makeRange(a[2], endOf(a[2], src.length)).read() : null;
        const out = src.map((x, i) => I.callValue(fn, has2 ? [x, src2[i]] : [x]));
        makeRange(dst, dst instanceof Iter ? endOf(dst, out.length) : new Ptr('elem', dst.o, dst.i + out.length)).write(out);
        return undefined;
      },
      copy: (a) => { const src = makeRange(a[0], a[1]).read(); const dst = a[2]; makeRange(dst, dst instanceof Iter ? endOf(dst, src.length) : new Ptr('elem', dst.o, dst.i + src.length)).write(src.map(copyVal)); return dst instanceof Iter ? endOf(dst, src.length) : new Ptr('elem', dst.o, dst.i + src.length); },
      next_permutation: (a) => permute(a, 1), prev_permutation: (a) => permute(a, -1),
      equal: (a) => { const x = makeRange(a[0], a[1]).read(); const y = makeRange(a[2], endOf(a[2], x.length)).read(); return x.every((v, i) => I.equals(v, y[i])); },
      swap_ranges: () => undefined,
      max_element_index: () => 0,
    });

    function advance(it, k) {
      if (it instanceof Ptr) return new Ptr('elem', it.o, it.i + k);
      if (it instanceof Vec) return new Ptr('elem', it, k);
      if (it.assoc) return stepAssoc(it, k);
      const r = new Iter(it.c, it.i + k);
      r.rev = it.rev;
      return r;
    }

    function permute(a, dir) {
      const r = makeRange(a[0], a[1]);
      const arr = r.read();
      const lt = (x, y) => (dir > 0 ? callCmp(null, x, y) : callCmp(null, y, x));
      let i = arr.length - 2;
      while (i >= 0 && !lt(arr[i], arr[i + 1])) i--;
      if (i < 0) { arr.reverse(); r.write(arr); return false; }
      let j = arr.length - 1;
      while (!lt(arr[i], arr[j])) j--;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      const tail = arr.splice(i + 1).reverse();
      r.write(arr.concat(tail));
      return true;
    }

    // ------------------------------------------------------------------------------------ methods

    const outOfRange = (what) => { const e = new CppError('Out Of Range', what); e.catchable = true; return e; };

    function strFind(s, x, pos, rfind) {
      const needle = typeof x === 'string' ? x : x instanceof Chr ? String.fromCharCode(x.c) : L.cString(x);
      const i = rfind ? s.lastIndexOf(needle, pos === undefined ? Infinity : pos) : s.indexOf(needle, pos === undefined ? 0 : pos);
      return i < 0 ? NPOS : i;
    }

    const charsOf = (x) => (typeof x === 'string' ? x : x instanceof Chr ? String.fromCharCode(x.c) : L.cString(x));

    function strMethod(s, name, args, ref, node) {
      const set = (v) => { if (ref) ref.v = v; };
      const A = args;
      switch (name) {
        case 'size': case 'length': return s.length;
        case 'empty': return s.length === 0;
        case 'at': { const i = int(A[0]); if (i < 0 || i >= s.length) throw outOfRange('basic_string::at: index out of range'); return new Chr(s.charCodeAt(i)); }
        case 'front': return new Chr(s.charCodeAt(0));
        case 'back': return new Chr(s.charCodeAt(s.length - 1));
        case 'substr': {
          const p = A.length ? int(A[0]) : 0;
          if (p > s.length) throw outOfRange('basic_string::substr: pos out of range');
          return A.length > 1 && A[1] !== NPOS ? s.substr(p, int(A[1])) : s.slice(p);
        }
        case 'find': return strFind(s, A[0], A[1] === undefined ? undefined : int(A[1]));
        case 'rfind': return strFind(s, A[0], A[1] === undefined ? undefined : int(A[1]), true);
        case 'find_first_of': { const cs = charsOf(A[0]); for (let i = A[1] === undefined ? 0 : int(A[1]); i < s.length; i++) if (cs.includes(s[i])) return i; return NPOS; }
        case 'find_last_of': { const cs = charsOf(A[0]); for (let i = Math.min(s.length - 1, A[1] === undefined ? s.length - 1 : int(A[1])); i >= 0; i--) if (cs.includes(s[i])) return i; return NPOS; }
        case 'find_first_not_of': { const cs = charsOf(A[0]); for (let i = A[1] === undefined ? 0 : int(A[1]); i < s.length; i++) if (!cs.includes(s[i])) return i; return NPOS; }
        case 'find_last_not_of': { const cs = charsOf(A[0]); for (let i = s.length - 1; i >= 0; i--) if (!cs.includes(s[i])) return i; return NPOS; }
        case 'compare': { const o = charsOf(A[0]); return s < o ? -1 : s > o ? 1 : 0; }
        case 'c_str': case 'data': case 'str': return s;
        case 'starts_with': return s.startsWith(charsOf(A[0]));
        case 'ends_with': return s.endsWith(charsOf(A[0]));
        case 'contains': return s.includes(charsOf(A[0]));
        case 'begin': case 'cbegin': return new Iter(ref || new Cell(s), 0);
        case 'end': case 'cend': return new Iter(ref || new Cell(s), s.length);
        case 'rbegin': { const it = new Iter(ref || new Cell(s), 0); it.rev = true; return it; }
        case 'rend': { const it = new Iter(ref || new Cell(s), s.length); it.rev = true; return it; }
        case 'push_back': set(s + charsOf(A[0])); return undefined;
        case 'pop_back': set(s.slice(0, -1)); return undefined;
        case 'append': set(s + (A.length >= 2 && typeof A[1] === 'number' && A[0] instanceof Chr === false && typeof A[0] !== 'string' ? charsOf(A[0]) : A.length === 2 && typeof A[0] === 'number' ? String.fromCharCode(num(A[1])).repeat(A[0]) : A.length === 3 && typeof A[0] === 'string' ? A[0].substr(int(A[1]), int(A[2])) : charsOf(A[0]))); return ref ? ref.v : undefined;
        case 'clear': set(''); return undefined;
        case 'insert': {
          const p = int(A[0]);
          if (A[0] instanceof Iter) { set(s.slice(0, A[0].i) + charsOf(A[1]) + s.slice(A[0].i)); return undefined; }
          if (typeof A[1] === 'number' && A.length === 3) set(s.slice(0, p) + String.fromCharCode(num(A[2])).repeat(A[1]) + s.slice(p));
          else set(s.slice(0, p) + charsOf(A[1]) + s.slice(p));
          return undefined;
        }
        case 'erase': {
          if (A.length === 0) { set(''); return undefined; }
          if (A[0] instanceof Iter) { const from = A[0].i; const to = A.length > 1 ? A[1].i : from + 1; set(s.slice(0, from) + s.slice(to)); return A[0]; }
          const p = int(A[0]);
          set(s.slice(0, p) + (A.length > 1 && A[1] !== NPOS ? s.slice(p + int(A[1])) : ''));
          return undefined;
        }
        case 'replace': { const p = int(A[0]); set(s.slice(0, p) + charsOf(A[2]) + s.slice(p + int(A[1]))); return undefined; }
        case 'resize': { const n = int(A[0]); set(n <= s.length ? s.slice(0, n) : s + (A.length > 1 ? String.fromCharCode(num(A[1])) : '\0').repeat(n - s.length)); return undefined; }
        case 'assign': set(A.length === 2 && typeof A[0] === 'number' ? String.fromCharCode(num(A[1])).repeat(A[0]) : charsOf(A[0])); return undefined;
        case 'reserve': case 'shrink_to_fit': return undefined;
        case 'capacity': return Math.max(15, s.length);
        case 'copy': return 0;
        default: throw new CppError('Name Error', `std::string has no member '${name}'`, node && node.line);
      }
    }

    function seqMethod(v, name, args, node) {
      const a = v.a;
      const et = v.et;
      const A = args;
      const isDeq = v instanceof Deq;
      const cv = (x) => copyVal(et ? I.coerce(et, x) : x);
      switch (name) {
        case 'size': return a.length;
        case 'empty': return a.length === 0;
        case 'push_back': case 'emplace_back': {
          let x = A[0];
          if (name === 'emplace_back' && et && et.cls === 'obj' && A.length !== 1) x = I.constructValue(et, A);
          else if (name === 'emplace_back' && !et && A.length === 2) x = new Pair(A[0], A[1]);
          else if (name === 'emplace_back' && et && et.cls === 'obj' && !(A[0] instanceof Obj)) x = I.constructValue(et, A);
          a.push(cv(x)); return undefined;
        }
        case 'pop_back': if (!a.length) throw new CppError('Runtime Error', 'pop_back() on an empty container'); a.pop(); return undefined;
        case 'push_front': case 'emplace_front': a.unshift(cv(A[0])); return undefined;
        case 'pop_front': if (!a.length) throw new CppError('Runtime Error', 'pop_front() on an empty container'); a.shift(); return undefined;
        case 'back': if (!a.length) throw new CppError('Runtime Error', 'back() on an empty container', node && node.line); return a[a.length - 1];
        case 'front': if (!a.length) throw new CppError('Runtime Error', 'front() on an empty container', node && node.line); return a[0];
        case 'at': { const i = int(A[0]); if (i < 0 || i >= a.length) throw outOfRange(`vector::_M_range_check: index ${i} >= size ${a.length}`); return a[i]; }
        case 'clear': a.length = 0; return undefined;
        case 'resize': { const n = int(A[0]); if (n < a.length) a.length = n; else while (a.length < n) a.push(A.length > 1 ? cv(A[1]) : I.defaultValue(et)); return undefined; }
        case 'reserve': case 'shrink_to_fit': return undefined;
        case 'capacity': return Math.max(a.length, 1);
        case 'begin': case 'cbegin': return new Iter(v, 0);
        case 'end': case 'cend': return new Iter(v, a.length);
        case 'rbegin': case 'crbegin': { const it = new Iter(v, 0); it.rev = true; return it; }
        case 'rend': case 'crend': { const it = new Iter(v, a.length); it.rev = true; return it; }
        case 'data': return new Ptr('elem', v, 0);
        case 'assign': {
          if (A.length === 2 && A[0] instanceof Iter) { const r = L.iterRange(A[0], A[1]).map(cv); a.length = 0; a.push(...r); } else if (A.length === 2) { const n = int(A[0]); a.length = 0; for (let i = 0; i < n; i++) a.push(cv(A[1])); } else if (A[0] instanceof InitList) { a.length = 0; a.push(...A[0].items.map(cv)); }
          return undefined;
        }
        case 'insert': case 'emplace': {
          const pos = A[0] instanceof Iter ? A[0].i : int(A[0]);
          let items;
          if (A.length >= 3 && A[1] instanceof Iter) items = L.iterRange(A[1], A[2]).map(cv);
          else if (A.length === 3) items = Array.from({ length: int(A[1]) }, () => cv(A[2]));
          else if (A[1] instanceof InitList) items = A[1].items.map(cv);
          else items = [name === 'emplace' && et && et.cls === 'obj' && A.length > 2 ? I.constructValue(et, A.slice(1)) : cv(A[1])];
          a.splice(pos, 0, ...items);
          return new Iter(v, pos);
        }
        case 'erase': {
          const from = A[0].i;
          const to = A.length > 1 ? A[1].i : from + 1;
          if (from < 0 || from > a.length) throw new CppError('Segmentation Fault', 'erase() with an invalid iterator', node && node.line);
          a.splice(from, to - from);
          return new Iter(v, from);
        }
        case 'swap': { const o = A[0]; const t = v.a; v.a = o.a; o.a = t; return undefined; }
        case 'fill': for (let i = 0; i < a.length; i++) a[i] = cv(A[0]); return undefined;
        case 'max_size': return 1152921504606846975;
        default: throw new CppError('Name Error', `${isDeq ? 'deque' : 'vector'} has no member '${name}'`, node && node.line);
      }
    }

    function adaptorMethod(v, name, args, node) {
      const a = v.a;
      const A = args;
      const cv = (x) => copyVal(v.et ? I.coerce(v.et, x) : x);
      const emplace = () => (v.et && v.et.cls === 'obj' && (A.length !== 1 || !(A[0] instanceof Obj)) ? I.constructValue(v.et, A) : (!v.et && A.length === 2 ? new Pair(A[0], A[1]) : A[0]));
      if (v instanceof PQ) {
        switch (name) {
          case 'push': L.pqPush(v, cv(A[0])); return undefined;
          case 'emplace': L.pqPush(v, copyVal(emplace())); return undefined;
          case 'pop': pqPop(v); return undefined;
          case 'top': if (!a.length) throw new CppError('Runtime Error', 'top() on an empty priority_queue', node && node.line); return a[0];
          case 'size': return a.length;
          case 'empty': return a.length === 0;
          default: break;
        }
      } else if (v instanceof Stk) {
        switch (name) {
          case 'push': a.push(cv(A[0])); return undefined;
          case 'emplace': a.push(copyVal(emplace())); return undefined;
          case 'pop': if (!a.length) throw new CppError('Runtime Error', 'pop() on an empty stack', node && node.line); a.pop(); return undefined;
          case 'top': if (!a.length) throw new CppError('Runtime Error', 'top() on an empty stack', node && node.line); return a[a.length - 1];
          case 'size': return a.length;
          case 'empty': return a.length === 0;
          default: break;
        }
      } else {
        switch (name) {
          case 'push': a.push(cv(A[0])); return undefined;
          case 'emplace': a.push(copyVal(emplace())); return undefined;
          case 'pop': if (!a.length) throw new CppError('Runtime Error', 'pop() on an empty queue', node && node.line); a.shift(); return undefined;
          case 'front': if (!a.length) throw new CppError('Runtime Error', 'front() on an empty queue', node && node.line); return a[0];
          case 'back': if (!a.length) throw new CppError('Runtime Error', 'back() on an empty queue', node && node.line); return a[a.length - 1];
          case 'size': return a.length;
          case 'empty': return a.length === 0;
          default: break;
        }
      }
      if (name === 'swap') { const t = v.a; v.a = A[0].a; A[0].a = t; return undefined; }
      throw new CppError('Name Error', `this container has no member '${name}'`, node && node.line);
    }

    const mkIter = (m, e) => new Iter(m, 0, e);
    const rmkIter = (m, e) => { const it = new Iter(m, 0, e); it.rev = true; return it; };

    function assocMethod(m, name, args, node) {
      const A = args;
      const list = () => L.mapEntries(m);
      const setLike = m.isSet;
      switch (name) {
        case 'size': return mapSize(m);
        case 'empty': return mapSize(m) === 0;
        case 'clear': m.m.clear(); m.cache = null; return undefined;
        case 'begin': case 'cbegin': { const l = list(); return mkIter(m, l.length ? l[0] : null); }
        case 'end': case 'cend': return mkIter(m, null);
        case 'rbegin': case 'crbegin': { const l = list(); return rmkIter(m, l.length ? l[l.length - 1] : null); }
        case 'rend': case 'crend': return rmkIter(m, null);
        case 'find': { const e = L.mapFind(m, A[0]); return mkIter(m, e); }
        case 'count': { const e = m.m.get(keyStr(A[0])); return e ? (Array.isArray(e) ? e.length : 1) : 0; }
        case 'contains': return m.m.has(keyStr(A[0]));
        case 'at': return L.mapEntry(m, A[0], false).second;
        case 'insert': case 'emplace': {
          const x = A[0];
          if (setLike) {
            if (x instanceof InitList) { for (const k of x.items) L.setInsert(m, copyVal(m.kt ? I.coerce(m.kt, k) : k)); return undefined; }
            if (x instanceof Iter) { for (const k of L.iterRange(A[0], A[1])) L.setInsert(m, copyVal(k)); return undefined; }
            const r = L.setInsert(m, copyVal(m.kt ? I.coerce(m.kt, x) : x));
            return new Pair(mkIter(m, r.e), r.inserted);
          }
          if (name === 'emplace' && A.length === 2) { const r = L.mapInsert(m, copyVal(A[0]), copyVal(A[1])); return new Pair(mkIter(m, r.e), r.inserted); }
          if (x instanceof Pair) { const r = L.mapInsert(m, copyVal(m.kt ? I.coerce(m.kt, x.first) : x.first), copyVal(m.vt ? I.coerce(m.vt, x.second) : x.second)); return new Pair(mkIter(m, r.e), r.inserted); }
          if (x instanceof InitList) {
            if (x.items.length && x.items[0] instanceof InitList) { for (const it of x.items) L.mapInsert(m, copyVal(it.items[0]), copyVal(it.items[1])); return undefined; }
            const r = L.mapInsert(m, copyVal(x.items[0]), copyVal(x.items[1])); return new Pair(mkIter(m, r.e), r.inserted);
          }
          if (x instanceof Iter) { for (const e of L.iterRange(A[0], A[1])) L.mapInsert(m, copyVal(e.first), copyVal(e.second)); return undefined; }
          throw new CppError('Type Error', 'cannot insert this value into a map');
        }
        case 'insert_or_assign': { const e = L.mapEntry(m, A[0], true); e.second = copyVal(A[1]); return new Pair(mkIter(m, e), true); }
        case 'try_emplace': { const ex = L.mapFind(m, A[0]); if (ex) return new Pair(mkIter(m, ex), false); const r = L.mapInsert(m, copyVal(A[0]), copyVal(A[1])); return new Pair(mkIter(m, r.e), true); }
        case 'erase': {
          if (A[0] instanceof Iter) {
            const it = A[0];
            const next = stepAssoc(it, 1);
            if (it.e) eraseEntry(m, it.e);
            return mkIter(m, next.e);
          }
          return mapErase(m, A[0]);
        }
        case 'lower_bound': { const lt = keyLess(m); const l = list(); return mkIter(m, l.find((e) => !lt(e.first, A[0])) || null); }
        case 'upper_bound': { const lt = keyLess(m); const l = list(); return mkIter(m, l.find((e) => lt(A[0], e.first)) || null); }
        case 'equal_range': return new Pair(assocMethod(m, 'lower_bound', A), assocMethod(m, 'upper_bound', A));
        case 'swap': { const o = A[0]; const t = m.m; m.m = o.m; o.m = t; m.cache = null; o.cache = null; return undefined; }
        case 'key_comp': return new Fn('builtin', { name: 'less', fn: (args) => L.less(args[0], args[1]) });
        default: throw new CppError('Name Error', `this container has no member '${name}'`, node && node.line);
      }
    }

    L.callMethod = function callMethod(recv, name, args, recvRef, node) {
      if (typeof recv === 'string') return strMethod(recv, name, args, recvRef, node);
      if (recv instanceof Vec || recv instanceof Deq) return seqMethod(recv, name, args, node);
      if (recv instanceof Stk || recv instanceof Que || recv instanceof PQ) return adaptorMethod(recv, name, args, node);
      if (recv instanceof MapObj) return assocMethod(recv, name, args, node);
      if (recv instanceof Stream) return streamMethod(recv, name, args, node);
      if (recv instanceof Pair && name === 'swap') { const o = args[0]; [recv.first, o.first] = [o.first, recv.first]; [recv.second, o.second] = [o.second, recv.second]; return undefined; }
      if (recv instanceof Fn || recv instanceof Obj) return I.callValue(recv, args);
      if (recv instanceof Tup) throw new CppError('Type Error', 'tuples use std::get<N>', node && node.line);
      if (recv instanceof Iter && name === 'operator*') return L.iterDeref(recv);
      if (recv === null) throw new CppError('Segmentation Fault', `calling '${name}' through a null pointer`, node && node.line);
      throw new CppError('Type Error', `this value has no member function '${name}'`, node && node.line);
    };

    function streamMethod(st, name, args, node) {
      switch (name) {
        case 'str': if (args.length) { st.buf = String(args[0]); st.pos = 0; return undefined; } return st.buf;
        case 'clear': st.fail = false; return undefined;
        case 'good': return !st.fail;
        case 'fail': return st.fail;
        case 'eof': return st.pos >= st.buf.length;
        case 'flush': return st;
        case 'put': emit(st, String.fromCharCode(num(args[0]))); return st;
        case 'precision': st.prec = int(args[0]); return undefined;
        default: throw new CppError('Name Error', `stream has no member '${name}'`, node && node.line);
      }
    }

    // get<N>(tuple/pair)
    FREE.get = (a, targs) => {
      const idx = targs && targs.a[0] ? Number(targs.a[0].n.slice(1)) : 0;
      const v = a[0];
      if (v instanceof Pair) return idx === 0 ? v.first : v.second;
      if (v instanceof Tup) return v.a[idx];
      if (v instanceof Vec) return v.a[idx];
      throw new CppError('Type Error', 'std::get needs a pair or tuple');
    };
    FREE.numeric_limits = () => undefined;
    FREE.bind = (a) => new Fn('builtin', { name: 'bind', fn: (args) => I.callValue(a[0], a.slice(1).concat(args)) });
    FREE.function = (a) => a[0];
    FREE.pair = (a) => new Pair(a[0], a[1]);
    FREE.min_max = FREE.minmax;

    return L;
  }

  NS.makeLib = makeLib;
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof self !== 'undefined' ? self : globalThis);
