/*
 * Runtime values of the C/C++ interpreter, and the numeric rules that go with them.
 *
 *   int-like     JS number (safe integer) or BigInt (beyond 2^53); wrapped to the declared width on every store
 *   double       Dbl        (a wrapper, so 3.0 and 3 stay different and `/` divides the right way)
 *   char         Chr        (a code point; prints as a character, does arithmetic as an int)
 *   bool         boolean
 *   std::string  JS string  (immutable; mutating methods write through the receiver's lvalue)
 *   pointer      null, or Ptr {k:'obj'|'cell'|'elem'}   (pointer to an object / a variable / an array element)
 *   containers   Vec (vector, array, C arrays), Deq, Stk, Que, PQ, MapObj, SetObj, Pair, Tup
 *   user types   Obj {cls, f}
 *
 * Copies are made when a value is *stored* (initialization, assignment, by-value parameters, push_back); references
 * and pointers share. That is what gives struct/vector value semantics without static types.
 */
(function (root) {
  'use strict';
  const NS = root.LCVCpp || (root.LCVCpp = {});

  class Dbl { constructor(v) { this.v = v; } }
  class Chr { constructor(c) { this.c = c; } }
  class Vec { constructor(a, et, kind, tname) { this.a = a; this.et = et || null; this.kind = kind || 'list'; this.tname = tname || null; } }
  class Deq { constructor(a, et) { this.a = a; this.et = et || null; } }
  class Stk { constructor(a, et) { this.a = a; this.et = et || null; } }
  class Que { constructor(a, et) { this.a = a; this.et = et || null; } }
  class PQ { constructor(a, et, cmp) { this.a = a; this.et = et || null; this.cmp = cmp || null; } }
  class Pair { constructor(first, second) { this.first = first; this.second = second; } }
  class Tup { constructor(a) { this.a = a; } }
  class Obj { constructor(cls, f) { this.cls = cls; this.f = f || Object.create(null); } }
  class Ptr { constructor(k, o, i) { this.k = k; this.o = o; this.i = i === undefined ? 0 : i; } }
  /** Anything with a readable/writable `.v`: a variable (Cell) or an lvalue into a container or object. */
  class Ref {}
  class Cell extends Ref { constructor(v, t) { super(); this.v = v; this.t = t || null; } }
  /** A `{a, b, c}` that has not met its type yet. */
  class InitList { constructor(items) { this.items = items; } }
  /** Memory returned by malloc before a cast tells us what it holds. */
  class RawAlloc { constructor(bytes) { this.bytes = bytes; } }

  /** std::map / set / multiset / unordered_*: entries keyed by a canonical string; ordered ones sort on demand. */
  class MapObj {
    constructor(opts) {
      this.ordered = opts.ordered; this.multi = !!opts.multi; this.cmp = opts.cmp || null;
      this.kt = opts.kt || null; this.vt = opts.vt || null; this.isSet = !!opts.isSet; this.tname = opts.tname || 'map';
      this.m = new Map();   // key string -> entry (Pair for maps, {first: key} boxed as Pair for sets), or array of entries when multi
      this.cache = null;
    }
  }

  /**
   * An iterator. Sequences (Vec/Deq, or a Ref holding a string): container + index. Associative containers (MapObj):
   * the entry it points at (null is end()), so it survives inserts and erases the way real iterators do.
   */
  class Iter {
    constructor(c, i, e) { this.c = c; this.i = i; this.rev = false; this.assoc = e !== undefined; this.e = e === undefined ? null : e; }
  }

  /** A callable: lambda, user function, or bound builtin. */
  class Fn {
    constructor(kind, data) { this.kind = kind; Object.assign(this, data); }
  }

  class CppError extends Error {
    constructor(type, message, line) { super(message); this.type = type; this.line = line; }
  }
  class CppThrow { constructor(value) { this.value = value; } }

  // ------------------------------------------------------------------------------------------ integers

  const I64_MIN = -(2n ** 63n);
  const I64_MAX = 2n ** 63n - 1n;
  const norm = (b) => (b >= -9007199254740991n && b <= 9007199254740991n ? Number(b) : b);

  function wrapBig(v, bits, signed) {
    const b = typeof v === 'bigint' ? v : BigInt(v);
    return norm(signed ? BigInt.asIntN(bits, b) : BigInt.asUintN(bits, b));
  }

  /** Wraps an integer to a width; cls is one of i8 u8 i16 u16 i32 u32 i64 u64. */
  function wrapInt(v, cls) {
    if (typeof v === 'number') {
      switch (cls) {
        case 'i32': if (v >= -2147483648 && v <= 2147483647) return v; break;
        case 'u32': if (v >= 0 && v <= 4294967295) return v; break;
        case 'i64': if (Number.isSafeInteger(v)) return v; break;
        case 'u64': if (v >= 0 && Number.isSafeInteger(v)) return v; break;
        case 'i16': if (v >= -32768 && v <= 32767) return v; break;
        case 'u16': if (v >= 0 && v <= 65535) return v; break;
        case 'i8': if (v >= -128 && v <= 127) return v; break;
        case 'u8': if (v >= 0 && v <= 255) return v; break;
        default: return v;
      }
    }
    switch (cls) {
      case 'i32': return wrapBig(v, 32, true);
      case 'u32': return wrapBig(v, 32, false);
      case 'i64': return wrapBig(v, 64, true);
      case 'u64': return wrapBig(v, 64, false);
      case 'i16': return wrapBig(v, 16, true);
      case 'u16': return wrapBig(v, 16, false);
      case 'i8': return wrapBig(v, 8, true);
      case 'u8': return wrapBig(v, 8, false);
      default: return v;
    }
  }

  /** Any numeric-ish value as a JS number or BigInt (doubles stay doubles). */
  function num(v) {
    if (typeof v === 'number' || typeof v === 'bigint') return v;
    if (v instanceof Dbl) return v.v;
    if (v instanceof Chr) return v.c;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v === null || v === undefined) return 0;
    if (v instanceof Ptr) return 1;
    throw new CppError('Type Error', 'a number was expected here, but the value is not one');
  }

  const isFloat = (v) => v instanceof Dbl;

  /** The integer value of anything numeric (doubles truncate toward zero, like a C++ conversion). */
  function toInt(v) {
    if (typeof v === 'number') return Number.isInteger(v) ? v : (Number.isNaN(v) ? 0 : Math.trunc(v));
    if (typeof v === 'bigint') return v;
    if (v instanceof Dbl) {
      const x = v.v;
      if (Number.isNaN(x)) return 0;
      const t = Math.trunc(x);
      return Number.isSafeInteger(t) ? t : (Number.isFinite(t) ? norm(BigInt(t)) : (t > 0 ? I64_MAX : I64_MIN));
    }
    return num(v);
  }

  const big = (x) => (typeof x === 'bigint' ? x : BigInt(x));

  function intOp(op, x, y) {
    if (typeof x === 'number' && typeof y === 'number') {
      switch (op) {
        case '+': { const r = x + y; if (Number.isSafeInteger(r)) return r; break; }
        case '-': { const r = x - y; if (Number.isSafeInteger(r)) return r; break; }
        case '*': { const r = x * y; if (Number.isSafeInteger(r)) return r; break; }
        case '/': if (y === 0) throw new CppError('Floating Point Exception', 'integer division by zero'); return Math.trunc(x / y);
        case '%': if (y === 0) throw new CppError('Floating Point Exception', 'integer modulo by zero'); return x % y;
        case '&': if (x >= -2147483648 && x <= 2147483647 && y >= -2147483648 && y <= 2147483647) return x & y; break;
        case '|': if (x >= -2147483648 && x <= 2147483647 && y >= -2147483648 && y <= 2147483647) return x | y; break;
        case '^': if (x >= -2147483648 && x <= 2147483647 && y >= -2147483648 && y <= 2147483647) return x ^ y; break;
        default: break;
      }
    }
    const a = big(x);
    const b = big(y);
    switch (op) {
      case '+': return norm(BigInt.asIntN(64, a + b));
      case '-': return norm(BigInt.asIntN(64, a - b));
      case '*': return norm(BigInt.asIntN(64, a * b));
      case '/': if (b === 0n) throw new CppError('Floating Point Exception', 'integer division by zero'); return norm(a / b);
      case '%': if (b === 0n) throw new CppError('Floating Point Exception', 'integer modulo by zero'); return norm(a % b);
      case '&': return norm(a & b);
      case '|': return norm(a | b);
      case '^': return norm(a ^ b);
      case '<<': return norm(BigInt.asIntN(64, a << (b < 0n ? 0n : b > 63n ? 63n : b)));
      case '>>': return norm(a >> (b < 0n ? 0n : b > 63n ? 63n : b));
      default: throw new CppError('Internal Error', 'unknown integer operator ' + op);
    }
  }

  /** Arithmetic on two numeric-ish values. */
  function arith(op, a, b) {
    if (a instanceof Dbl || b instanceof Dbl) {
      const x = Number(num(a));
      const y = Number(num(b));
      switch (op) {
        case '+': return new Dbl(x + y);
        case '-': return new Dbl(x - y);
        case '*': return new Dbl(x * y);
        case '/': return new Dbl(x / y);
        case '%': return new Dbl(x % y);
        default: break;
      }
    }
    const x = num(a);
    const y = num(b);
    if (op === '<<' || op === '>>') {
      if (typeof x === 'number' && typeof y === 'number' && op === '>>' && x >= -2147483648 && x <= 2147483647) return y >= 32 ? (x < 0 ? -1 : 0) : x >> y;
      return intOp(op, x, y);
    }
    return intOp(op, x, y);
  }

  function compare(op, a, b) {
    if (typeof a === 'string' && typeof b === 'string') {
      switch (op) { case '<': return a < b; case '>': return a > b; case '<=': return a <= b; case '>=': return a >= b; default: break; }
    }
    if (a instanceof Ptr || b instanceof Ptr || a === null || b === null) {
      if (op === '==' || op === '!=') { const r = ptrEq(a, b); return op === '==' ? r : !r; }
      if (a instanceof Ptr && b instanceof Ptr && a.o === b.o) return compare(op, a.i, b.i);
    }
    const x = num(a);
    const y = num(b);
    switch (op) {
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
      case '==': return x == y; // eslint-disable-line eqeqeq
      case '!=': return x != y; // eslint-disable-line eqeqeq
      default: throw new CppError('Internal Error', 'unknown comparison ' + op);
    }
  }

  function ptrEq(a, b) {
    const an = a === null || a === undefined || (typeof a === 'number' && a === 0);
    const bn = b === null || b === undefined || (typeof b === 'number' && b === 0);
    if (an || bn) return an && bn;
    if (a instanceof Ptr && b instanceof Ptr) return a.k === b.k && a.o === b.o && a.i === b.i;
    if (a instanceof Iter && b instanceof Iter) return iterEq(a, b);
    return false;
  }

  function iterEq(a, b) {
    return a.c === b.c && (a.assoc ? a.e === b.e : a.i === b.i);
  }

  function truthy(v) {
    if (typeof v === 'boolean') return v;
    if (v === null || v === undefined) return false;
    if (typeof v === 'number') return v !== 0;
    if (typeof v === 'bigint') return v !== 0n;
    if (v instanceof Dbl) return v.v !== 0;
    if (v instanceof Chr) return v.c !== 0;
    return true;
  }

  // ------------------------------------------------------------------------------------------ keys, equality, order

  let objSeq = 0;
  const objIds = new WeakMap();
  const idOf = (o) => { let i = objIds.get(o); if (!i) { i = ++objSeq; objIds.set(o, i); } return i; };

  /** Canonical string of a value, for hashing into maps/sets. */
  function keyStr(v) {
    if (typeof v === 'number' || typeof v === 'bigint') return 'i' + v;
    if (typeof v === 'string') return 's' + v;
    if (typeof v === 'boolean') return 'i' + (v ? 1 : 0);
    if (v === null || v === undefined) return 'n';
    if (v instanceof Chr) return 'i' + v.c;
    if (v instanceof Dbl) return Number.isInteger(v.v) ? 'i' + v.v : 'd' + v.v;
    if (v instanceof Pair) return 'p(' + keyStr(v.first) + ',' + keyStr(v.second) + ')';
    if (v instanceof Tup) return 't(' + v.a.map(keyStr).join(',') + ')';
    if (v instanceof Vec || v instanceof Deq) return 'v[' + v.a.map(keyStr).join(',') + ']';
    if (v instanceof Ptr) return 'o' + idOf(v.o) + ':' + v.i;
    if (v instanceof Obj) return 'S{' + Object.keys(v.f).map((k) => keyStr(v.f[k])).join(',') + '}';
    if (v instanceof MapObj) return 'm' + idOf(v);
    return 'x' + idOf(v);
  }

  function copyVal(v) {
    if (v === null || typeof v !== 'object') return v;
    if (v instanceof Vec) return new Vec(v.a.map(copyVal), v.et, v.kind, v.tname);
    if (v instanceof Obj) { const f = Object.create(null); for (const k of Object.keys(v.f)) f[k] = copyVal(v.f[k]); return new Obj(v.cls, f); }
    if (v instanceof Pair) return new Pair(copyVal(v.first), copyVal(v.second));
    if (v instanceof Tup) return new Tup(v.a.map(copyVal));
    if (v instanceof MapObj) {
      const c = new MapObj({ ordered: v.ordered, multi: v.multi, cmp: v.cmp, kt: v.kt, vt: v.vt, isSet: v.isSet, tname: v.tname });
      for (const [k, e] of v.m) c.m.set(k, Array.isArray(e) ? e.map((x) => copyVal(x)) : copyVal(e));
      return c;
    }
    if (v instanceof Deq) return new Deq(v.a.map(copyVal), v.et);
    if (v instanceof Stk) return new Stk(v.a.map(copyVal), v.et);
    if (v instanceof Que) return new Que(v.a.map(copyVal), v.et);
    if (v instanceof PQ) return new PQ(v.a.map(copyVal), v.et, v.cmp);
    if (v instanceof InitList) return new InitList(v.items.map(copyVal));
    return v; // Dbl, Chr, Ptr, Iter, Fn are immutable values
  }

  /** Default value of a type (`T x;` and `vector<T>(n)`): zero, empty, null. */
  const defaultOf = { fn: null };

  // ------------------------------------------------------------------------------------------ text

  function charOf(c) {
    return String.fromCharCode(c);
  }

  function fmtDouble(x, prec, fixed, scientific) {
    if (Number.isNaN(x)) return 'nan';
    if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';
    if (fixed) return x.toFixed(prec);
    if (scientific) return x.toExponential(prec).replace(/e([+-])(\d)$/, 'e$10$2');
    // %g with `prec` significant digits (default 6)
    if (x === 0) return Object.is(x, -0) ? '-0' : '0';
    const p = prec === undefined ? 6 : Math.max(1, prec);
    const exp = Math.floor(Math.log10(Math.abs(x)));
    let s;
    if (exp < -4 || exp >= p) {
      s = x.toExponential(p - 1);
      s = s.replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
    } else {
      s = x.toFixed(Math.max(0, p - 1 - exp));
      if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    }
    return s;
  }

  Object.assign(NS, {
    Dbl, Chr, Vec, Deq, Stk, Que, PQ, Pair, Tup, Obj, Ptr, Ref, Cell, InitList, RawAlloc, MapObj, Iter, Fn, CppError, CppThrow,
    I64_MIN, I64_MAX, norm, wrapInt, num, toInt, isFloat, arith, compare, ptrEq, truthy, keyStr, copyVal, idOf, defaultOf,
    charOf, fmtDouble, intOp,
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof self !== 'undefined' ? self : globalThis);
