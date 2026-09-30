// Runs the tree-problem corpus (tests/treeCorpus.js) through every engine and checks the answer, the trace and the
// visualization pipeline.
//   node tests/engines.mjs [languages] [filter]     e.g.  node tests/engines.mjs js,py,cpp,c max-depth
// Languages: js, py, cpp, c, java (needs the backend: LCV_BACKEND, default http://localhost:8080).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TREE_CORPUS as A } from './treeCorpus.js';
import { TREE_CORPUS_2 as B } from './treeCorpus2.js';
import { SAMPLES } from '../js/samples.js';
// CORPUS=samples runs the app's built-in examples instead
const TREE_CORPUS = process.env.CORPUS === 'samples'
  ? SAMPLES.map((x) => ({ ...x, tests: x.tests.map((t) => ({ input: t.input, expected: JSON.parse(t.expected) })), noTreeView: true }))
  : [...A, ...B];
import { parseTestInput, sameOutput } from '../js/components/TestCasePanel.js';
import { defaultDefinitions } from '../js/definitions.js';
import { buildExecution } from '../js/state/executionState.js';
import { detectViews } from '../js/visualizers/StructureDetector.js';

const require = createRequire(import.meta.url);
const acorn = require('../js/vendor/acorn.js');
const astring = require('../js/vendor/astring.min.js');
const instrumenter = require('../js/runners/jsInstrumenter.js');
const { runTrace } = require('../js/runners/jsTracer.js');
const cpp = require('./cppLoad.cjs');

const BACKEND = process.env.LCV_BACKEND || 'http://localhost:8080';
const [langArg = 'js,py,cpp,c', filter = ''] = process.argv.slice(2);
const langs = langArg.split(',');
const KEY = { js: 'javascript', py: 'python', cpp: 'cpp', c: 'c', java: 'java' };
const MAX_STEPS = 5000;

async function runJava(code, definitions, testCase) {
  const res = await fetch(`${BACKEND}/api/v1/execution/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ language: 'java', code, definitions, testCase, maxSteps: MAX_STEPS }) });
  let r = await res.json();
  while (r.status === 'QUEUED' || r.status === 'RUNNING') { await new Promise((ok) => setTimeout(ok, 200)); r = await (await fetch(`${BACKEND}/api/v1/execution/${r.executionId}`)).json(); }
  return r;
}

async function execute(lang, code, definitions, testCase) {
  switch (lang) {
    case 'js': return runTrace(code, testCase, { acorn, astring, instrumenter, maxSteps: MAX_STEPS, timeoutMs: 20000, definitions });
    case 'py': {
      const p = spawnSync('python', [fileURLToPath(new URL('./pyRun.py', import.meta.url))], { input: JSON.stringify({ code, definitions, testCase, maxSteps: MAX_STEPS }), encoding: 'utf8', maxBuffer: 1 << 28 });
      if (p.status !== 0) throw new Error(p.stderr);
      return JSON.parse(p.stdout);
    }
    case 'cpp': case 'c': return cpp.run(lang, code, testCase, { definitions, maxSteps: MAX_STEPS });
    case 'java': return runJava(code, definitions, testCase);
    default: throw new Error('unknown language ' + lang);
  }
}

const canon = (v) => (Array.isArray(v) ? v.map(canon).map((x) => JSON.stringify(x)).sort().map((x) => JSON.parse(x)) : v);

let pass = 0;
let fail = 0;
let skipped = 0;
for (const prob of TREE_CORPUS) {
  if (!prob.id.includes(filter)) continue;
  for (const lang of langs) {
    const code = prob[KEY[lang]];
    if (!code) { skipped++; continue; }
    const definitions = defaultDefinitions(KEY[lang], code);
    for (const t of prob.tests) {
      const input = parseTestInput(t.input);
      const label = `${lang.padEnd(4)} ${prob.id} [${t.input.slice(0, 40)}]`;
      try {
        const r = await execute(lang, code, definitions, input.value);
        const problems = [];
        if (r.status !== 'SUCCESS') problems.push(`status ${r.status}: ${r.error && r.error.message}`);
        else {
          const ok = prob.unordered ? sameOutput(canon(r.output), canon(t.expected)) : sameOutput(r.output, t.expected);
          if (!ok) problems.push(`output ${JSON.stringify(r.output)} != ${JSON.stringify(t.expected)}`);
        }
        if (r.status === 'SUCCESS') {
          if (!r.steps.length) problems.push('no trace steps');
          else {
            const exec = buildExecution(r, code, KEY[lang]);
            const kinds = new Set();
            for (const f of exec.frames) for (const v of detectViews(f, {}, exec)) kinds.add(v.kind);
            if (prob.views && !prob.views.every((k) => kinds.has(k))) problems.push(`views ${[...kinds]} lack ${prob.views}`);
            if (!prob.noTreeView && !/\[\s*\]/.test(t.input) && !kinds.has('tree') && !kinds.has('linkedlist') && !kinds.has('graph') && !prob.views) problems.push(`no node view detected (${[...kinds]})`);
          }
        }
        if (problems.length) { fail++; console.log(`✖ ${label}\n    ${problems.join('\n    ')}`); } else { pass++; console.log(`✔ ${label}`); }
      } catch (e) {
        fail++;
        console.log(`✖ ${label}\n    threw ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}`);
      }
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed, ${skipped} language versions skipped`);
process.exit(fail ? 1 : 0);
