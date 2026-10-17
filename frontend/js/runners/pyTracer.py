"""
Python tracer + judge-style harness.

`lcv_run(code, definitions, testcase_json, max_steps, timeout_ms)` executes the user's solution under
sys.settrace and returns (as a JSON string) a result in exactly the normalized shape the other engines produce
(see ExecutionResult.java): steps with call stacks, locals and a heap snapshot, output, status and error.

It is plain CPython code: it runs inside Pyodide in the browser, and under any CPython for tests.
"""
import sys
import json
import time
import types
import math
import inspect
import re
import collections
import builtins

MAX_ELEMENTS = 256
MAX_OBJECTS = 400
MAX_OUTPUT = 65536
MAX_FRAMES = 50
USER_FILE = '<solution>'
DEFS_FILE = '<definitions>'
SKIP_CODE_NAMES = ('<listcomp>', '<dictcomp>', '<setcomp>', '<genexpr>', '<module>')


class Halt(BaseException):
    """Raised by the tracer to stop the program (step limit, timeout). BaseException so `except Exception` can't eat it."""


class InvalidInput(Exception):
    pass


# ---------------------------------------------------------------------------------------------- heap encoding

class HeapWalker:
    def __init__(self, ids, keep):
        self.ids = ids      # id(obj) -> heap id, stable across steps
        self.keep = keep    # keeps objects alive so ids are never reused
        self.heap = {}
        self.pending = []
        self.queued = set()

    def id_of(self, obj):
        k = id(obj)
        hid = self.ids.get(k)
        if hid is None:
            hid = str(len(self.ids) + 1)
            self.ids[k] = hid
            self.keep.append(obj)
        return hid

    def encode(self, v):
        if v is None:
            return None
        t = type(v)
        if t is bool:
            return v
        if t is int:
            return v if -9007199254740991 <= v <= 9007199254740991 else {'n': str(v)}
        if t is float:
            if math.isfinite(v):
                return v
            return {'n': 'NaN' if math.isnan(v) else ('Infinity' if v > 0 else '-Infinity')}
        if t is str:
            return {'str': v if len(v) <= 500 else v[:500] + '…'}
        if isinstance(v, int):  # IntEnum etc.
            return int(v)
        if isinstance(v, (types.FunctionType, types.BuiltinFunctionType, types.MethodType, types.ModuleType, type,
                          types.BuiltinMethodType)):
            return {'fn': getattr(v, '__name__', 'anonymous')}
        if isinstance(v, (bytes, bytearray)):
            return {'str': repr(v)}
        if isinstance(v, complex):
            return {'str': repr(v)}
        hid = self.id_of(v)
        if hid not in self.queued and len(self.queued) < MAX_OBJECTS:
            self.queued.add(hid)
            self.pending.append((hid, v))
        return {'ref': hid}

    def drain(self):
        while self.pending:
            hid, obj = self.pending.pop(0)
            self.heap[hid] = self.describe(hid, obj)
        return self.heap

    def seq(self, values):
        out = []
        n = 0
        for x in values:
            if n >= MAX_ELEMENTS:
                break
            out.append(self.encode(x))
            n += 1
        return out

    def describe(self, hid, obj):
        h = {'id': hid}
        try:
            self._describe(h, obj)
        except Exception:  # a misbehaving __repr__/__iter__ must not kill the trace
            h['kind'] = 'opaque'
            h['type'] = type(obj).__name__
        return h

    def _describe(self, h, obj):
        name = type(obj).__name__
        if isinstance(obj, list):
            h['kind'] = 'list'; h['type'] = name
            h['elems'] = self.seq(obj)
            if len(obj) > MAX_ELEMENTS:
                h['length'] = len(obj); h['truncated'] = True
        elif isinstance(obj, tuple) and not hasattr(obj, '_fields'):
            h['kind'] = 'array'; h['type'] = 'tuple'
            h['elems'] = self.seq(obj)
            if len(obj) > MAX_ELEMENTS:
                h['length'] = len(obj); h['truncated'] = True
        elif isinstance(obj, collections.deque):
            h['kind'] = 'deque'; h['type'] = 'deque'
            h['elems'] = self.seq(obj)
            if len(obj) > MAX_ELEMENTS:
                h['length'] = len(obj); h['truncated'] = True
        elif isinstance(obj, dict):
            h['kind'] = 'map'; h['type'] = name
            entries = []
            for k, v in obj.items():
                if len(entries) >= MAX_ELEMENTS:
                    h['length'] = len(obj); h['truncated'] = True
                    break
                entries.append([self.encode(k), self.encode(v)])
            h['entries'] = entries
        elif isinstance(obj, (set, frozenset)):
            h['kind'] = 'set'; h['type'] = name
            h['elems'] = self.seq(sort_for_display(obj))
            if len(obj) > MAX_ELEMENTS:
                h['length'] = len(obj); h['truncated'] = True
        elif type(obj).__module__ == 'array' or name == 'array':
            h['kind'] = 'array'; h['type'] = 'array'
            h['elems'] = self.seq(obj)
        elif isinstance(obj, (range, types.GeneratorType, types.FrameType, types.TracebackType)) or callable(getattr(obj, '__next__', None)):
            h['kind'] = 'opaque'; h['type'] = name
        else:
            fields = object_fields(obj)
            if fields is None:
                h['kind'] = 'opaque'; h['type'] = name
            else:
                h['kind'] = 'object'; h['type'] = name
                h['fields'] = {}
                n = 0
                for k, v in fields:
                    if n >= MAX_ELEMENTS:
                        h['truncated'] = True
                        break
                    n += 1
                    h['fields'][k] = self.encode(v)


def sort_for_display(s):
    try:
        return sorted(s)
    except Exception:
        return list(s)


def object_fields(obj):
    """Instance attributes of a user object (in assignment order), or None when it has none to show."""
    fields = []
    d = getattr(obj, '__dict__', None)
    if isinstance(d, dict):
        fields.extend((k, v) for k, v in d.items() if not (k.startswith('__') and k.endswith('__')))
    slots = []
    for klass in type(obj).__mro__:
        s = klass.__dict__.get('__slots__')
        if s:
            slots.extend([s] if isinstance(s, str) else s)
    for k in slots:
        if k.startswith('__') or k in ('__dict__', '__weakref__'):
            continue
        try:
            fields.append((k, getattr(obj, k)))
        except AttributeError:
            pass
    if hasattr(obj, '_fields') and isinstance(obj, tuple):  # namedtuple
        fields.extend(zip(obj._fields, obj))
    if not fields and d is None and not slots:
        return None
    return fields


def clean_local_name(n):
    return not (n.startswith('__') and n.endswith('__'))


def is_data(v):
    return not isinstance(v, (types.FunctionType, types.BuiltinFunctionType, types.ModuleType, type, types.MethodType))


# ---------------------------------------------------------------------------------------------- tracer

class Rec:
    __slots__ = ('id', 'parent', 'name', 'frame', 'args', 'line', 'entered', 'exc', 'has_self')


class Tracer:
    def __init__(self, max_steps, deadline):
        self.max_steps = max_steps
        self.deadline = deadline
        self.steps = []
        self.stack = []
        self.recs = {}          # id(frame) -> Rec
        self.call_seq = 0
        self.ids = {}
        self.keep = []
        self.out = []
        self.out_len = 0
        self.out_seen = 0
        self.halted = None      # 'STEP_LIMIT' | 'TIMEOUT'
        self.globals_ns = None
        self.global_names = []
        self.last_error_info = None
        self.active = False

    # -- program output
    def write(self, text):
        if self.out_len < MAX_OUTPUT:
            text = text[:MAX_OUTPUT - self.out_len]
            self.out.append(text)
            self.out_len += len(text)
        return len(text)

    def flush(self):
        pass

    # -- sys.settrace callbacks
    def global_trace(self, frame, event, arg):
        if event != 'call' or not self.active:
            return None
        code = frame.f_code
        if code.co_filename != USER_FILE or code.co_name in SKIP_CODE_NAMES or code.co_flags & 0x20 or code.co_flags & 0x80 or code.co_flags & 0x100:
            return None  # not user code, a comprehension, or a generator/coroutine
        if self.halted:
            raise Halt()
        parent = self.stack[-1] if self.stack else None
        rec = Rec()
        self.call_seq += 1
        rec.id = self.call_seq
        rec.parent = parent.id if parent else None
        rec.name = display_name(code)
        rec.frame = frame
        rec.args = arg_names(code)
        rec.line = frame.f_lineno
        rec.entered = False
        rec.exc = False
        rec.has_self = 'self' in code.co_varnames[:code.co_argcount]
        self.recs[id(frame)] = rec
        self.stack.append(rec)
        return self.local_trace

    def local_trace(self, frame, event, arg):
        rec = self.recs.get(id(frame))
        if rec is None:
            return None
        if self.halted:
            raise Halt()
        if event == 'line':
            rec.line = frame.f_lineno
            rec.exc = False
            if not rec.entered:
                rec.entered = True
                self.snap('FUNCTION_ENTER', rec, False)
            else:
                self.snap('LINE', rec, False)
        elif event == 'return':
            rec.line = frame.f_lineno
            if not rec.entered:
                rec.entered = True
                self.snap('FUNCTION_ENTER', rec, False)
            try:
                self.snap('FUNCTION_EXIT', rec, True, arg, exceptional=rec.exc)
            finally:
                if rec in self.stack:
                    del self.stack[self.stack.index(rec):]
                self.recs.pop(id(frame), None)
        elif event == 'exception':
            rec.exc = True
            self.last_error_info = (frame.f_lineno, rec.name)
        return self.local_trace

    # -- snapshots
    def snap(self, event, rec, is_exit, ret=None, exceptional=False):
        if len(self.steps) >= self.max_steps:
            self.halted = 'STEP_LIMIT'
            raise Halt()
        if (len(self.steps) & 63) == 0 and time.time() > self.deadline:
            self.halted = 'TIMEOUT'
            raise Halt()
        hw = HeapWalker(self.ids, self.keep)
        call_stack = []
        for fr in self.stack[-MAX_FRAMES:]:
            locs = {}
            try:
                items = list(fr.frame.f_locals.items())
            except Exception:
                items = []
            for k, v in items:
                if not clean_local_name(k) or not is_data(v):
                    continue
                if k == 'self' and fr.has_self:
                    continue
                locs[k] = hw.encode(v)
            if fr.has_self:
                sv = fr.frame.f_locals.get('self')
                if sv is not None and object_fields(sv):
                    locs['this'] = hw.encode(sv)
            call_stack.append({'id': fr.id, 'parentId': fr.parent, 'name': fr.name, 'line': fr.line,
                               'args': [a for a in fr.args if not (a == 'self' and fr.has_self)], 'locals': locs})
        step = {'step': len(self.steps), 'line': rec.line, 'event': event, 'function': rec.name,
                'callId': rec.id, 'parentCallId': rec.parent, 'callStack': call_stack, 'stackDepth': len(self.stack)}
        if is_exit and not exceptional:
            step['returnValue'] = hw.encode(ret)
        if self.globals_ns is not None and self.global_names:
            g = {}
            for n in self.global_names:
                if n in self.globals_ns:
                    v = self.globals_ns[n]
                    if is_data(v):
                        g[n] = hw.encode(v)
            if g:
                step['globals'] = g
        step['heap'] = hw.drain()
        if self.out_len > self.out_seen:
            text = ''.join(self.out)
            step['out'] = text[self.out_seen:]
            self.out_seen = len(text)
        self.steps.append(step)


def display_name(code):
    q = getattr(code, 'co_qualname', None) or code.co_name
    if '<locals>.' in q:
        q = q.rsplit('<locals>.', 1)[1]
    return q


def arg_names(code):
    n = code.co_argcount + code.co_kwonlyargcount
    names = list(code.co_varnames[:n])
    i = n
    if code.co_flags & 0x04:  # *args
        names.append(code.co_varnames[i]); i += 1
    if code.co_flags & 0x08:  # **kwargs
        names.append(code.co_varnames[i])
    return names


# ---------------------------------------------------------------------------------------------- judge structures
# (port of js/runners/structures.js)

def _make(cls, val):
    try:
        return cls(val)
    except TypeError:
        return cls()


def build_list(cls, values):
    head = tail = None
    for v in values:
        n = _make(cls, v)
        n.next = None
        if head is None:
            head = n
        else:
            tail.next = n
        tail = n
    return head


def build_tree(cls, values):
    if not values or values[0] is None:
        return None

    def mk(v):
        n = _make(cls, v)
        n.left = None
        n.right = None
        return n
    root = mk(values[0])
    q = [root]
    i = 1
    qi = 0
    while qi < len(q) and i < len(values):
        p = q[qi]; qi += 1
        if i < len(values) and values[i] is not None:
            p.left = mk(values[i]); q.append(p.left)
        i += 1
        if i < len(values) and values[i] is not None:
            p.right = mk(values[i]); q.append(p.right)
        i += 1
    return root


def build_nary(cls, values):
    if not values or values[0] is None:
        return None

    def mk(v):
        n = _make(cls, v)
        n.children = []
        return n
    root = mk(values[0])
    q = [root]
    qi = 0
    i = 2
    while qi < len(q) and i < len(values):
        p = q[qi]; qi += 1
        kids = []
        while i < len(values) and values[i] is not None:
            c = mk(values[i]); kids.append(c); q.append(c); i += 1
        p.children = kids
        i += 1
    return root


def build_graph(cls, adjacency):
    if not adjacency:
        return None
    nodes = []
    for i in range(len(adjacency)):
        n = _make(cls, i + 1)
        n.neighbors = []
        nodes.append(n)
    for i, lst in enumerate(adjacency):
        nb = []
        for v in lst:
            if v < 1 or v > len(nodes):
                raise InvalidInput('graph neighbor %s is out of range' % v)
            nb.append(nodes[v - 1])
        nodes[i].neighbors = nb
    return nodes[0]


def build_random(cls, entries):
    if not entries:
        return None
    nodes = []
    for e in entries:
        n = _make(cls, e[0])
        n.next = None
        n.random = None
        nodes.append(n)
    for i, n in enumerate(nodes):
        if i + 1 < len(nodes):
            n.next = nodes[i + 1]
        r = entries[i][1]
        if r is not None:
            if r < 0 or r >= len(nodes):
                raise InvalidInput('random index %s is out of range' % r)
            n.random = nodes[r]
    return nodes[0]


def build_structure(kind, cls, values):
    if not isinstance(values, list):
        raise InvalidInput('expected an array to build a %s' % cls.__name__)
    if kind == 'list':
        return build_list(cls, values)
    if kind in ('tree', 'nextptr'):
        return build_tree(cls, values)
    if kind == 'nary':
        return build_nary(cls, values)
    if kind == 'graph':
        return build_graph(cls, values)
    if kind == 'random':
        return build_random(cls, values)
    raise InvalidInput('building a %s from an array is not supported' % cls.__name__)


def node_kind(n):
    d = getattr(n, '__dict__', None)
    if not isinstance(d, dict) or 'val' not in d:
        return None
    if 'children' in d:
        return 'nary'
    if 'neighbors' in d:
        return 'graph'
    if 'random' in d:
        return 'random'
    if 'left' in d and 'right' in d:
        return 'nextptr' if 'next' in d else 'tree'
    if 'next' in d:
        return 'list'
    return None


def class_kind(cls):
    """What kind of structure instances of a definitions class form, from its constructor and source."""
    name = cls.__name__
    if name == 'TreeNode':
        return 'tree'
    if name == 'ListNode':
        return 'list'
    try:
        # classes defined by exec() have no source file: read the attribute names the constructor mentions instead
        src = ' '.join(cls.__init__.__code__.co_names + cls.__init__.__code__.co_varnames)
    except Exception:
        src = ''
    if 'children' in src:
        return 'nary'
    if 'neighbors' in src or 'neighbours' in src:
        return 'graph'
    if 'random' in src:
        return 'random'
    if 'left' in src or 'right' in src:
        return 'nextptr'
    return 'list'


def _val(n):
    return to_json(getattr(n, 'val', None))


def serialize_structure(kind, node):
    if node is None:
        return []
    out = []
    if kind == 'list':
        seen = set()
        n = node
        while n is not None and len(out) < 10000:
            if id(n) in seen:
                out.append('...cycle')
                break
            seen.add(id(n))
            out.append(_val(n))
            n = getattr(n, 'next', None)
        return out
    if kind in ('tree',):
        q = [node]
        qi = 0
        while qi < len(q) and len(out) < 10000:
            n = q[qi]; qi += 1
            if n is None:
                out.append(None)
                continue
            out.append(_val(n))
            q.append(getattr(n, 'left', None))
            q.append(getattr(n, 'right', None))
        while out and out[-1] is None:
            out.pop()
        return out
    if kind == 'nary':
        out = [_val(node), None]
        q = [node]
        qi = 0
        while qi < len(q) and len(out) < 10000:
            n = q[qi]; qi += 1
            for c in (getattr(n, 'children', None) or []):
                out.append(_val(c))
                q.append(c)
            out.append(None)
        while out and out[-1] is None:
            out.pop()
        return out
    if kind == 'graph':
        by_val = {}
        q = [node]
        seen = {id(node)}
        qi = 0
        while qi < len(q) and len(q) < 10000:
            n = q[qi]; qi += 1
            by_val[getattr(n, 'val', None)] = n
            for m in (getattr(n, 'neighbors', None) or []):
                if id(m) not in seen:
                    seen.add(id(m)); q.append(m)
        mx = max(v for v in by_val if isinstance(v, int)) if by_val else 0
        res = []
        for v in range(1, mx + 1):
            n = by_val.get(v)
            res.append([_val(m) for m in (getattr(n, 'neighbors', None) or [])] if n is not None else [])
        return res
    if kind == 'random':
        nodes = []
        n = node
        while n is not None and len(nodes) < 10000 and not any(n is x for x in nodes):
            nodes.append(n)
            n = getattr(n, 'next', None)
        res = []
        for n in nodes:
            r = getattr(n, 'random', None)
            idx = None
            if r is not None:
                idx = next((i for i, x in enumerate(nodes) if x is r), -1)
            res.append([_val(n), idx])
        return res
    if kind == 'nextptr':
        level = node
        while level is not None and len(out) < 10000:
            first = None
            n = level
            while n is not None:
                out.append(_val(n))
                if first is None:
                    first = getattr(n, 'left', None) or getattr(n, 'right', None)
                n = getattr(n, 'next', None)
            out.append('#')
            level = first
        return out
    return None


def find_node_by_value(roots, value):
    seen = set()
    queue = list(roots)
    while queue:
        n = queue.pop(0)
        if n is None or id(n) in seen:
            continue
        seen.add(id(n))
        if getattr(n, 'val', None) == value:
            return n
        for f in ('next', 'left', 'right', 'random', 'child'):
            queue.append(getattr(n, f, None))
        for f in ('children', 'neighbors'):
            queue.extend(getattr(n, f, None) or [])
    raise InvalidInput('no node with value %s in the earlier arguments' % json.dumps(value))


def to_json(v, depth=0):
    if v is None or isinstance(v, (bool, str)):
        return v
    if isinstance(v, int):
        return v if -9007199254740991 <= v <= 9007199254740991 else str(v)
    if isinstance(v, float):
        return v if math.isfinite(v) else str(v)
    if depth > 50:
        return str(v)
    if isinstance(v, (list, tuple, collections.deque)):
        return [to_json(x, depth + 1) for x in v]
    if isinstance(v, (set, frozenset)):
        return [to_json(x, depth + 1) for x in sort_for_display(v)]
    if isinstance(v, dict):
        return {str(k): to_json(x, depth + 1) for k, x in v.items()}
    kind = node_kind(v)
    if kind:
        return serialize_structure(kind, v)
    d = getattr(v, '__dict__', None)
    if isinstance(d, dict):
        return {k: to_json(x, depth + 1) for k, x in d.items() if not k.startswith('__')}
    return str(v)


# ---------------------------------------------------------------------------------------------- harness

PRELUDE = '''
from typing import *
import collections, heapq, bisect, math, itertools, functools, re, string, operator, random
from collections import deque, Counter, defaultdict, OrderedDict
from heapq import heappush, heappop, heapify, heappushpop, heapreplace, nlargest, nsmallest
from bisect import bisect_left, bisect_right, insort, insort_left, insort_right, bisect
from functools import lru_cache, cache, reduce, cmp_to_key, partial
from itertools import accumulate, combinations, permutations, product, chain, groupby, zip_longest, count
from math import inf, gcd, sqrt, ceil, floor, log, log2, comb, factorial
'''


def ann_text(a):
    if a is inspect.Parameter.empty:
        return ''
    if isinstance(a, str):
        return a
    try:
        return re.sub(r'\b[\w.]*\.(\w+)', r'\1', str(a)) if not isinstance(a, type) else a.__name__
    except Exception:
        return ''


def struct_classes(ns, defs_names):
    """Definition classes by name (TreeNode, ListNode, Node) with the kind of structure each one builds."""
    out = {}
    for name in ('TreeNode', 'ListNode', 'Node'):
        c = ns.get(name)
        if isinstance(c, type):
            out[name] = (c, class_kind(c))
    return out


def convert_arg(value, ann, pname, classes, built):
    if value is None:
        return None
    a = ann or ''
    m = re.match(r'^(?:typing\.)?(?:List|list|Sequence|Tuple|tuple)\[(.*)\]$', a)
    if m and isinstance(value, list):
        return [convert_arg(v, m.group(1), pname, classes, built) for v in value]
    target = None
    for name in ('TreeNode', 'ListNode', 'Node'):
        if re.search(r'\b_?%s\b' % name, a) and name in classes:
            target = name
            break
    if target is None and not a and pname in ('root', 'root1', 'root2') and 'TreeNode' in classes:
        target = 'TreeNode'
    if target is None and not a and pname in ('head', 'l1', 'l2', 'list1', 'list2') and 'ListNode' in classes:
        target = 'ListNode'
    if target is None:
        return value
    cls, kind = classes[target]
    if not isinstance(value, list):
        return find_node_by_value(built, value)
    node = build_structure(kind, cls, value)
    if node is not None:
        built.append(node)
    return node


def own_callables(ns, baseline):
    """User-defined top-level functions and (public) methods of user classes, in source order."""
    fns = []
    for name, v in list(ns.items()):
        if name in baseline and baseline[name] is v:
            continue
        if isinstance(v, types.FunctionType) and v.__code__.co_filename == USER_FILE:
            fns.append((None, name, v))
        elif isinstance(v, type) and getattr(v, '__module__', None) == ns.get('__name__') and name not in ('TreeNode', 'ListNode', 'Node'):
            for mname, m in v.__dict__.items():
                if isinstance(m, types.FunctionType) and not mname.startswith('__') and m.__code__.co_filename == USER_FILE:
                    fns.append((name, mname, m))
    return fns


def pick_target(callables, testcase):
    keys = list(testcase.keys())
    best = None
    best_score = -1e9
    for owner, name, fn in callables:
        try:
            params = [p for p in inspect.signature(fn).parameters.values() if p.name not in ('self', 'cls')]
        except (TypeError, ValueError):
            continue
        names = [p.name for p in params]
        score = 0
        for p in names:
            if p in keys:
                score += 10
        if len(names) == len(keys):
            score += 5
        if score > best_score:
            best_score = score
            best = (owner, name, fn, params)
    return best


def resolve_args(params, testcase, classes, built):
    names = [p.name for p in params]
    spare = [testcase[k] for k in testcase if k not in names]
    args = []
    for p in params:
        if p.name in testcase:
            raw = testcase[p.name]
        elif spare:
            raw = spare.pop(0)
        elif p.default is not inspect.Parameter.empty:
            args.append(p.default)
            continue
        else:
            keys = list(testcase.keys())
            raise InvalidInput("Missing test-case value for parameter '%s'%s" % (
                p.name, (' (the test case provides: ' + ', '.join(keys) + ')') if keys else ' (the test case is empty)'))
        args.append(convert_arg(json.loads(json.dumps(raw)), ann_text(p.annotation), p.name, classes, built))
    return args


def design_problem(testcase, ns):
    vals = list(testcase.values())
    if len(vals) != 2:
        return None
    ops, params = vals
    if not isinstance(ops, list) or not isinstance(params, list) or not ops or len(ops) != len(params):
        return None
    if not all(isinstance(o, str) for o in ops) or not all(isinstance(p, list) for p in params):
        return None
    cls = ns.get(ops[0])
    return (cls, ops, params) if isinstance(cls, type) else None


def build_result(status, **kw):
    r = {'language': 'python', 'status': status, 'steps': [], 'stdout': ''}
    r.update(kw)
    return r


def exc_info_line(exc_tb):
    line = None
    fn = None
    tb = exc_tb
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == USER_FILE:
            line = tb.tb_lineno
            fn = display_name(tb.tb_frame.f_code)
        tb = tb.tb_next
    return line, fn


def lcv_run(code, definitions, testcase_json, max_steps, timeout_ms):
    started = time.time()
    tc = json.loads(testcase_json) if testcase_json else {}
    if not isinstance(tc, dict):
        tc = {'$1': tc}
    result = build_result('SUCCESS')

    def finish(res, tracer=None):
        if tracer is not None:
            res['steps'] = tracer.steps
            res['stdout'] = ''.join(tracer.out)
        res['executionTimeMs'] = int((time.time() - started) * 1000)
        return json.dumps(res, ensure_ascii=False, default=str)

    ns = {'__name__': '__lcv_solution__', '__builtins__': builtins}
    exec(compile(PRELUDE, '<prelude>', 'exec'), ns)
    tracer = Tracer(int(max_steps or 5000), started + (timeout_ms or 10000) / 1000.0)
    old_stdout = sys.stdout
    old_recursion = sys.getrecursionlimit()
    sys.stdout = tracer

    def compile_error(e, filename_hint):
        line = getattr(e, 'lineno', None) or 0
        col = getattr(e, 'offset', None) or 0
        msg = getattr(e, 'msg', None) or str(e)
        diag = {'line': line, 'column': col, 'severity': 'error', 'message': msg}
        err = {'type': 'Syntax Error', 'message': msg, 'line': line}
        if filename_hint == DEFS_FILE:
            diag['file'] = 'definitions'
            err['file'] = 'definitions'
            err['message'] = 'In the Definitions tab: ' + msg
        r = build_result('COMPILE_ERROR', error=err, diagnostics=[diag])
        return finish(r, tracer)

    try:
        # ---- definitions (never traced), then the solution (traced only while the target runs)
        if definitions and definitions.strip():
            try:
                exec(compile(definitions, DEFS_FILE, 'exec'), ns)
            except SyntaxError as e:
                return compile_error(e, DEFS_FILE)
            except Exception as e:
                line, _ = exc_info_line(e.__traceback__)
                r = build_result('RUNTIME_ERROR', error={'type': type(e).__name__, 'message': 'In the Definitions tab: ' + str(e), 'file': 'definitions'})
                return finish(r, tracer)
        baseline = dict(ns)
        try:
            user_code = compile(code, USER_FILE, 'exec')
        except SyntaxError as e:
            return compile_error(e, USER_FILE)
        # online judges supply these classes; if the solution uses them but nothing defined them, define the standard ones
        for missing, src in (('ListNode', 'class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n'),
                             ('TreeNode', 'class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val\n        self.left = left\n        self.right = right\n')):
            if missing not in ns and re.search(r'\b%s\b' % missing, code) and not re.search(r'\bclass\s+%s\b' % missing, code):
                exec(compile(src, DEFS_FILE, 'exec'), ns)
                baseline[missing] = ns[missing]
        try:
            exec(user_code, ns)
        except Exception as e:
            line, fn = exc_info_line(e.__traceback__)
            r = build_result('RUNTIME_ERROR', error={'type': type(e).__name__, 'message': str(e), 'line': line, 'function': fn})
            return finish(r, tracer)

        classes = struct_classes(ns, None)
        built = []
        design = design_problem(tc, ns)
        call = None
        in_place = False
        if design:
            cls, ops, params = design

            def call():
                ctor_args = json.loads(json.dumps(params[0]))
                try:
                    sig = [p for p in inspect.signature(cls.__init__).parameters.values() if p.name != 'self']
                    ctor_args = [convert_arg(v, ann_text(sig[i].annotation) if i < len(sig) else '', sig[i].name if i < len(sig) else '', classes, built)
                                 for i, v in enumerate(ctor_args)]
                except (TypeError, ValueError):
                    pass
                obj = cls(*ctor_args)
                outs = [None]
                for i in range(1, len(ops)):
                    m = getattr(obj, ops[i], None)
                    if not callable(m):
                        raise InvalidInput('Operation %d: %s has no method %s' % (i + 1, ops[0], ops[i]))
                    r = m(*json.loads(json.dumps(params[i])))
                    outs.append(to_json(r))
                return outs
        else:
            callables = own_callables(ns, baseline)
            target = pick_target(callables, tc)
            if target is None:
                return finish(build_result('INVALID_INPUT', error={'type': 'Invalid Input', 'message': 'No function was found to call.'}), tracer)
            owner, name, fn, params = target
            try:
                args = resolve_args(params, tc, classes, built)
            except InvalidInput as e:
                sig = ', '.join(p.name for p in params)
                return finish(build_result('INVALID_INPUT', error={'type': 'Invalid Input', 'message': 'Calling %s(%s): %s' % (name, sig, e)}), tracer)
            bound = fn
            if owner is not None:
                inst = ns[owner]()
                bound = getattr(inst, name)
            returns_node = bool(re.search(r'\b(TreeNode|ListNode|Node)\b', ann_text(inspect.signature(fn).return_annotation)))

            def call():
                nonlocal in_place
                ret = bound(*args)
                if ret is None:
                    if not returns_node:
                        in_place = True
                        return to_json(args[0]) if args else None
                    return []
                return to_json(ret)

        tracer.globals_ns = ns
        tracer.global_names = [n for n in ns if n not in baseline and not n.startswith('_') and is_data(ns[n])]
        tracer.active = True
        sys.setrecursionlimit(min(max(old_recursion, 1000), 1500))
        sys.settrace(tracer.global_trace)
        try:
            output = call()
            sys.settrace(None)
            tracer.active = False
            result['output'] = output
            if in_place:
                result['inPlace'] = True
        except InvalidInput as e:
            sys.settrace(None)
            tracer.active = False
            return finish(build_result('INVALID_INPUT', error={'type': 'Invalid Input', 'message': str(e)}), tracer)
        except Halt:
            sys.settrace(None)
            tracer.active = False
            last = tracer.steps[-1]['line'] if tracer.steps else None
            if tracer.halted == 'TIMEOUT':
                result['status'] = 'TIMEOUT'
                result['error'] = {'type': 'Timeout', 'message': 'Execution exceeded %d seconds.' % round((timeout_ms or 10000) / 1000), 'line': last}
            else:
                result['status'] = 'STEP_LIMIT'
                result['error'] = {'type': 'Step Limit', 'message': 'Execution exceeded %d steps (infinite loop?). The first %d steps are shown.' % (tracer.max_steps, tracer.max_steps), 'line': last}
        except BaseException as e:  # noqa: BLE001 - report whatever the program raised
            sys.settrace(None)
            tracer.active = False
            if isinstance(e, KeyboardInterrupt):
                raise
            line, fn = exc_info_line(e.__traceback__)
            if line is None and tracer.last_error_info:
                line, fn = tracer.last_error_info
            kind = type(e).__name__
            if isinstance(e, RecursionError):
                kind = 'Stack Overflow'
            err = {'type': kind, 'message': str(e), 'line': line, 'function': fn}
            result['status'] = 'RUNTIME_ERROR'
            result['error'] = err
            if tracer.steps:
                last = dict(tracer.steps[-1])
                last['step'] = len(tracer.steps)
                last['event'] = 'EXCEPTION'
                last['line'] = line or last['line']
                last['exception'] = err
                last.pop('out', None)
                last.pop('returnValue', None)
                tracer.steps.append(last)
        finally:
            sys.settrace(None)
            tracer.active = False
        return finish(result, tracer)
    finally:
        sys.stdout = old_stdout
        sys.setrecursionlimit(old_recursion)
