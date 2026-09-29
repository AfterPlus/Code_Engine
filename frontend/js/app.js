// App wiring: editor + problem + test cases on the left, visualization on the right, player at the bottom.
// Flow: Run -> execute (backend JVM or browser worker) -> normalized trace -> buildExecution -> timeline.

import { h, storage } from './util/dom.js';
import { execute } from './api.js';
import { buildExecution } from './state/executionState.js';
import { Timeline } from './state/timeline.js';
import { Player } from './player.js';
import { SAMPLES } from './samples.js';
import { CodeEditor } from './components/CodeEditor.js';
import { ProblemPanel } from './components/ProblemPanel.js';
import { TestCasePanel, parseTestInput, parseExpected, sameOutput } from './components/TestCasePanel.js';
import { TimelineControls } from './components/TimelineControls.js';
import { VisualizationPanel } from './components/VisualizationPanel.js';
import { STATUS_TEXT } from './components/ConsolePanel.js';

const STORE_KEY = 'lcv:v1';
const $ = (id) => document.getElementById(id);

function sampleById(id) {
  return SAMPLES.find((s) => s.id === id) || null;
}

function freshState() {
  const s = SAMPLES[0];
  return {
    language: 'java',
    sampleId: s.id,
    problem: s.problem,
    code: { java: s.java, javascript: s.javascript },
    tests: s.tests.map((t) => ({ ...t })),
    activeTest: 0,
    overrides: {},
    settings: { theme: 'system', maxSteps: 3000, backend: '' },
    leftWidth: null,
  };
}

const state = { ...freshState(), ...storage.get(STORE_KEY, {}) };
state.settings = { ...freshState().settings, ...(state.settings || {}) };
const save = () => storage.set(STORE_KEY, state);

// ------------------------------------------------------------------------------------------ theme

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme();

// ------------------------------------------------------------------------------------------ components

const timeline = new Timeline();
const player = new Player(timeline);
player.bindKeys();
new TimelineControls($('player'), timeline, player);

const viz = new VisualizationPanel({ stepbar: $('stepbar'), stage: $('stage'), dock: $('dock') }, {
  onMode: (key, mode) => {
    state.overrides[key] = mode;
    save();
    viz.setOverrides(state.overrides);
    renderFrame();
  },
});
viz.setOverrides(state.overrides);

const problem = new ProblemPanel({
  card: $('problem-card'), toggle: $('problem-toggle'), textarea: $('problem'),
  onChange: (text) => { state.problem = text; save(); },
});
problem.setValue(state.problem);

const tests = new TestCasePanel($('tests'), {
  onChange: (list) => { state.tests = list; save(); },
  onSelect: (i) => { state.activeTest = i; save(); },
  onRunAll: () => runAll(),
});
tests.setTests(state.tests, state.activeTest);

let lastRunCode = null;
const editor = new CodeEditor($('editor'), {
  value: state.code[state.language] || '',
  language: state.language,
  onChange: (value) => {
    state.code[state.language] = value;
    save();
    editor.setStale(lastRunCode !== null && value !== lastRunCode);
  },
});

// ------------------------------------------------------------------------------------------ header

const examples = $('examples');
examples.append(h('option', { value: '' }, 'Examples…'), ...SAMPLES.map((s) => h('option', { value: s.id }, `${s.title}  —  ${s.shows}`)));
examples.addEventListener('change', () => {
  const s = sampleById(examples.value);
  examples.value = '';
  if (s) loadSample(s);
});

function loadSample(s) {
  if (running) cancelRun();
  state.sampleId = s.id;
  state.problem = s.problem;
  state.code = { java: s.java, javascript: s.javascript };
  state.tests = s.tests.map((t) => ({ ...t }));
  state.activeTest = 0;
  save();
  problem.setValue(s.problem);
  editor.setValue(state.code[state.language]);
  tests.setTests(state.tests, 0);
  resetRun();
}

const langButtons = [...$('language').querySelectorAll('button')];
function renderLanguage() {
  langButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === state.language)));
  $('editor-lang').textContent = state.language === 'java' ? 'Java · traced with the JVM debugger' : 'JavaScript · traced in your browser';
}
langButtons.forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.lang === state.language) return;
  if (running) cancelRun();
  state.language = b.dataset.lang;
  save();
  editor.setLanguage(state.language);
  editor.setValue(state.code[state.language] || '');
  renderLanguage();
  resetRun();
}));
renderLanguage();

$('reset-code').addEventListener('click', () => {
  const s = sampleById(state.sampleId);
  if (s) editor.setValue(s[state.language]);
});

// settings popover
const settingsBtn = $('settings-toggle');
const settings = $('settings');
settingsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  settings.hidden = !settings.hidden;
  settingsBtn.setAttribute('aria-expanded', String(!settings.hidden));
});
document.addEventListener('click', (e) => {
  if (!settings.hidden && !settings.contains(e.target)) { settings.hidden = true; settingsBtn.setAttribute('aria-expanded', 'false'); }
});
$('set-theme').value = state.settings.theme;
$('set-theme').addEventListener('change', (e) => {
  state.settings.theme = e.target.value;
  save();
  applyTheme();
  editor.refreshTheme();
  renderFrame();
});
$('set-steps').value = state.settings.maxSteps;
$('set-steps').addEventListener('change', (e) => {
  state.settings.maxSteps = Math.max(50, Math.min(5000, Number(e.target.value) || 3000));
  e.target.value = state.settings.maxSteps;
  save();
});
$('set-backend').value = state.settings.backend;
$('set-backend').addEventListener('change', (e) => { state.settings.backend = e.target.value.trim(); save(); });
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { editor.refreshTheme(); renderFrame(); });

// resizable split
const splitter = $('splitter');
if (state.leftWidth) document.documentElement.style.setProperty('--left-width', state.leftWidth);
splitter.addEventListener('pointerdown', (e) => {
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add('dragging');
  const ws = $('workspace').getBoundingClientRect();
  const move = (ev) => {
    const pct = Math.max(25, Math.min(70, ((ev.clientX - ws.left) / ws.width) * 100));
    state.leftWidth = pct.toFixed(1) + '%';
    document.documentElement.style.setProperty('--left-width', state.leftWidth);
  };
  const up = () => {
    splitter.classList.remove('dragging');
    splitter.removeEventListener('pointermove', move);
    splitter.removeEventListener('pointerup', up);
    save();
  };
  splitter.addEventListener('pointermove', move);
  splitter.addEventListener('pointerup', up);
});

// ------------------------------------------------------------------------------------------ running

let running = null; // current execution handle
let run = null;     // last run record {language, caseLabel, expected, result}
const runBtn = $('run');
const statusPill = $('status');

function setStatus(text, kind) {
  statusPill.hidden = !text;
  statusPill.textContent = text || '';
  statusPill.dataset.kind = kind || '';
}

function setRunning(on) {
  runBtn.classList.toggle('is-running', on);
  runBtn.querySelector('span').textContent = on ? 'Cancel' : 'Run';
  runBtn.title = on ? 'Cancel this run' : 'Run selected test case (Ctrl+Enter)';
}

function cancelRun() {
  if (running) running.cancel();
}

function resetRun() {
  run = null;
  lastRunCode = null;
  timeline.clear();
  tests.clearResults();
  editor.setStale(false);
  editor.clearHighlight();
  editor.setMarkers([]);
  setStatus('');
  viz.renderEmpty(false);
}

function renderFrame() {
  const frame = timeline.frame;
  if (!frame) {
    viz.render(null);
    return;
  }
  viz.render(frame);
  editor.highlight({
    line: frame.line,
    prevLine: frame.prevLine,
    errorLine: frame.rawEvent === 'EXCEPTION' ? frame.line : null,
  });
}
timeline.subscribe(renderFrame);

async function executeCase(index) {
  const t = state.tests[index];
  const input = parseTestInput(t.input);
  const expected = parseExpected(t.expected);
  const code = editor.getValue();
  if (!input.ok) {
    return { code, expected: expected.value, result: { status: 'INVALID_INPUT', steps: [], error: { type: 'Invalid Input', message: input.error } } };
  }
  running = execute({
    language: state.language, code, testCase: input.value, maxSteps: state.settings.maxSteps, backend: state.settings.backend,
  });
  const handle = running;
  const result = await handle.promise;
  if (running === handle) running = null;
  return { code, expected: expected.value, result };
}

function recordResult(index, { result, expected }) {
  const pass = result.status === 'SUCCESS' ? (expected === undefined ? null : sameOutput(result.output, expected)) : false;
  tests.setResult(index, { status: result.status, output: result.output, pass, message: result.error && result.error.message });
  return pass;
}

function show(index, outcome) {
  const { result, expected, code } = outcome;
  run = { language: state.language, caseLabel: `Case ${index + 1}`, expected, result };
  lastRunCode = code;
  editor.setStale(editor.getValue() !== code);
  editor.setMarkers(result.diagnostics || []);
  const exec = result.steps && result.steps.length ? buildExecution(result, code, state.language) : null;
  viz.prepare(exec, run);
  if (exec) {
    timeline.load(exec);
    if (result.status !== 'SUCCESS') timeline.seek(exec.frames.length - 1);
  } else {
    timeline.clear();
    editor.highlight({ errorLine: result.error && result.error.line });
  }
}

function statusFor(result, pass) {
  if (result.status === 'SUCCESS') {
    if (pass === true) return ['✓ Accepted', 'ok'];
    if (pass === false) return ['✕ Wrong Answer', 'err'];
    return ['Finished', 'ok'];
  }
  return [STATUS_TEXT[result.status] || result.status, result.status === 'CANCELLED' ? '' : 'err'];
}

async function runActive() {
  if (running) { cancelRun(); return; }
  const index = state.activeTest;
  player.pause();
  setRunning(true);
  setStatus('Running…', 'busy');
  viz.renderEmpty(true, state.language);
  editor.clearHighlight();
  const outcome = await executeCase(index);
  setRunning(false);
  const pass = recordResult(index, outcome);
  setStatus(...statusFor(outcome.result, pass));
  show(index, outcome);
}

async function runAll() {
  if (running) return;
  player.pause();
  setRunning(true);
  viz.renderEmpty(true, state.language);
  let passed = 0;
  let shown = null;
  for (let i = 0; i < state.tests.length; i++) {
    setStatus(`Running ${i + 1}/${state.tests.length}…`, 'busy');
    const outcome = await executeCase(i);
    if (outcome.result.status === 'CANCELLED') break;
    if (recordResult(i, outcome) !== false && outcome.result.status === 'SUCCESS') passed++;
    if (i === state.activeTest) shown = outcome;
  }
  setRunning(false);
  setStatus(`${passed} / ${state.tests.length} passed`, passed === state.tests.length ? 'ok' : 'err');
  if (shown) show(state.activeTest, shown);
  else viz.renderEmpty(false);
}

runBtn.addEventListener('click', runActive);
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runActive();
  }
}, true);

// ------------------------------------------------------------------------------------------ boot

viz.renderEmpty(false);
editor.init().then(() => {
  // Monaco swallows Ctrl+Enter; route it to Run.
  if (editor.editor && editor.monaco) {
    editor.editor.addCommand(editor.monaco.KeyMod.CtrlCmd | editor.monaco.KeyCode.Enter, runActive);
  }
});
