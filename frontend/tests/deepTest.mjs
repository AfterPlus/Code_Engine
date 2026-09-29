// Deep test: runs every corpus problem (plus the built-in examples) through both engines and checks
//   1. status and output against the expected answer
//   2. trace invariants (step numbering, call stacks, balanced calls, resolvable heap references, lines in range)
//   3. the state builder and structure detection on every frame (expected views/events present, no crashes)
//
// Usage:  node frontend/tests/deepTest.mjs [filter]      (Java needs the backend: LCV_BACKEND, default :8080)

import { createRequire } from 'node:module';
import { CORPUS } from './corpus.js';
import { SAMPLES } from '../js/samples.js';
import { buildExecution } from '../js/state/executionState.js';
import { detectViews } from '../js/visualizers/StructureDetector.js';
import { parseTestInput, sameOutput } from '../js/components/TestCasePanel.js';

const require = createRequire(import.meta.url);
const acorn = require('../js/vendor/acorn.js');
const astring = require('../js/vendor/astring.min.js');
const instrumenter = require('../js/runners/jsInstrumenter.js');
const { runTrace } = require('../js/runners/jsTracer.js');

const BACKEND = process.env.LCV_BACKEND || 'http://localhost:8080';
const MAX_STEPS = 5000;
const filter = process.argv[2] || '';

// built-in examples are part of the corpus too
const problems = [
  ...CORPUS,
  ...SAMPLES.map((s) => ({
    id: 'sample:' + s.id, category: 'examples', title: s.title, java: s.java, javascript: s.javascript,
    tests: s.tests.map((t) => ({ input: t.input, expected: JSON.parse(t.expected) })),
  })),
].filter((p) => p.id.includes(filter) || (p.category || '').includes(filter));

// ------------------------------------------------------------------------------------------ engines

async function runJava(code, testCase) {
  const res = await fetch(`${BACKEND}/api/v1/execution/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'java', code, testCase, maxSteps: MAX_STEPS }),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  let r = await res.json();
  while (r.status === 'QUEUED' || r.status === 'RUNNING') {
    await new Promise((ok) => setTimeout(ok, 300));
    r = await (await fetch(`${BACKEND}/api/v1/execution/${r.executionId}`)).json();
  }
  return r;
}

function runJs(code, testCase) {
  return runTrace(code, testCase, { acorn, astring, instrumenter, maxSteps: MAX_STEPS, timeoutMs: 20000 });
}

// ------------------------------------------------------------------------------------------ checks

const canonical = (v) => {
  if (Array.isArray(v)) return v.map(canonical).map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x));
  return v;
};

function collectRefs(v, out) {
  if (!v || typeof v !== 'object') return;
  if ('ref' in v) { out.push(v.ref); return; }
  if (Array.isArray(v)) v.forEach((x) => collectRefs(x, out));
  else Object.values(v).forEach((x) => collectRefs(x, out));
}

function traceInvariants(result, code) {
  const problems = [];
  const lines = code.split('\n').length;
  const steps = result.steps || [];
  let enters = 0;
  let exits = 0;
  steps.forEach((s, i) => {
    if (s.step !== i) problems.push(`step ${i} numbered ${s.step}`);
    if (!['FUNCTION_ENTER', 'LINE', 'FUNCTION_EXIT', 'EXCEPTION'].includes(s.event)) problems.push(`step ${i}: unknown event ${s.event}`);
    if (s.line < 1 || s.line > lines) problems.push(`step ${i}: line ${s.line} outside 1..${lines}`);
    const stack = s.callStack || [];
    if (!stack.length) problems.push(`step ${i}: empty call stack`);
    else if (stack[stack.length - 1].id !== s.callId) problems.push(`step ${i}: callId ${s.callId} != top frame ${stack[stack.length - 1].id}`);
    if (s.event === 'FUNCTION_ENTER') enters++;
    if (s.event === 'FUNCTION_EXIT') exits++;
    const heap = s.heap || {};
    if (Object.keys(heap).length < 390) {
      const refs = [];
      stack.forEach((f) => collectRefs(f.locals, refs));
      collectRefs(s.globals, refs);
      collectRefs(s.returnValue, refs);
      Object.values(heap).forEach((h) => { collectRefs(h.elems, refs); collectRefs(h.entries, refs); collectRefs(h.fields, refs); });
      const missing = refs.filter((r) => !(r in heap));
      if (missing.length) problems.push(`step ${i}: ${missing.length} dangling heap refs (${missing.slice(0, 3)})`);
    }
  });
  if (result.status === 'SUCCESS' && enters !== exits) problems.push(`unbalanced calls: ${enters} enters vs ${exits} exits`);
  return problems.slice(0, 5);
}

function stateChecks(result, code, lang) {
  const exec = buildExecution(result, code, lang);
  const kinds = new Set();
  const events = new Set();
  for (const f of exec.frames) {
    f.events.forEach((e) => events.add(e));
    detectViews(f, {}, exec).forEach((v) => kinds.add(v.kind));
  }
  return { exec, kinds, events };
}

// ------------------------------------------------------------------------------------------ main

const rows = [];
let failures = 0;
const pick = (p, key, lang) => [...(p[key] || []), ...((p[key + 'By'] || {})[lang] || [])];

for (const p of problems) {
  for (const lang of ['java', 'javascript']) {
    const code = p[lang];
    if (!code) continue;
    for (const [ti, t] of p.tests.entries()) {
      const label = `${p.id} [${lang}] #${ti + 1}`;
      const errs = [];
      let result;
      const tc = typeof t.input === 'string' ? parseTestInput(t.input) : { ok: true, value: t.input };
      if (!tc.ok) { errs.push('test input did not parse: ' + tc.error); }
      try {
        result = tc.ok ? (lang === 'java' ? await runJava(code, tc.value) : runJs(code, tc.value)) : null;
      } catch (e) {
        errs.push('engine failed: ' + e.message);
      }
      if (result) {
        const wantStatus = t.status || 'SUCCESS';
        const okStatus = Array.isArray(wantStatus) ? wantStatus.includes(result.status) : result.status === wantStatus;
        if (!okStatus) errs.push(`status ${result.status}, wanted ${wantStatus}${result.error ? ' — ' + result.error.type + ': ' + result.error.message : ''}`);
        if (result.status === 'SUCCESS' && 'expected' in t) {
          const same = t.unordered ? sameOutput(canonical(result.output), canonical(t.expected)) : sameOutput(result.output, t.expected);
          if (!same) errs.push(`output ${JSON.stringify(result.output)} != expected ${JSON.stringify(t.expected)}`);
        }
        if (t.messageIncludes && !(result.error && result.error.message.includes(t.messageIncludes))) {
          errs.push(`message "${result.error && result.error.message}" lacks "${t.messageIncludes}"`);
        }
        if (result.error && /[^\x20-\x7e\n\t…—←→]/.test(result.error.message || '')) errs.push('garbled characters in message: ' + result.error.message);
        if (t.errorLineBy && t.errorLineBy[lang] && (!result.error || result.error.line !== t.errorLineBy[lang])) {
          errs.push(`error line ${result.error && result.error.line}, wanted ${t.errorLineBy[lang]}`);
        }
        const want = p.stdout && p.stdout[lang];
        if (want && !(result.stdout || '').replace(/\r/g, '').includes(want)) errs.push(`stdout ${JSON.stringify(result.stdout)} lacks ${JSON.stringify(want)}`);
        if (result.steps && result.steps.length) {
          errs.push(...traceInvariants(result, code));
          try {
            const { exec, kinds, events } = stateChecks(result, code, lang);
            if (ti === 0) {
              for (const k of pick(p, 'views', lang)) if (!kinds.has(k)) errs.push(`view "${k}" never detected (saw ${[...kinds].join(',') || 'none'})`);
              for (const k of pick(p, 'absentViews', lang)) if (kinds.has(k)) errs.push(`view "${k}" detected but shouldn't be`);
              for (const e of pick(p, 'events', lang)) if (!events.has(e)) errs.push(`event ${e} never derived`);
              if (p.recursive && !exec.recursive) errs.push('recursion not detected');
              if (p.minFrames && exec.frames.length < p.minFrames) errs.push(`only ${exec.frames.length} frames`);
              if (p.maxDepthAtLeast && exec.maxDepth < p.maxDepthAtLeast) errs.push(`max depth ${exec.maxDepth} < ${p.maxDepthAtLeast}`);
              if (p.maxMs && result.executionTimeMs > p.maxMs) errs.push(`too slow: ${result.executionTimeMs} ms > ${p.maxMs} ms`);
              for (const name of (p.noCallsNamed || {})[lang] || []) {
                if ([...exec.calls.values()].some((c) => c.name.includes(name))) errs.push(`unexpected call frame "${name}"`);
              }
            }
          } catch (e) {
            errs.push('state builder crashed: ' + (e.stack || e).toString().split('\n').slice(0, 3).join(' | '));
          }
        }
      }
      if (errs.length) failures++;
      rows.push({ label, ok: !errs.length, steps: result && result.steps ? result.steps.length : 0, ms: result ? result.executionTimeMs : 0, errs });
    }
  }
}

for (const r of rows) {
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(44)} ${String(r.steps).padStart(5)} steps ${String(r.ms ?? '').padStart(6)} ms`);
  for (const e of r.errs) console.log('        - ' + e);
}
console.log(`\n${rows.length - failures}/${rows.length} passed across ${problems.length} problems`);
process.exitCode = failures ? 1 : 0;
