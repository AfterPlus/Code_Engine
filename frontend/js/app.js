// App wiring: editor + problem + test cases on the left, visualization on the right, player at the bottom.
// Flow: Run -> execute (backend JVM or browser worker) -> normalized trace -> buildExecution -> timeline.

import { h, mount, storage } from './util/dom.js';
import { execute } from './api.js';
import { buildExecution } from './state/executionState.js';
import { Timeline } from './state/timeline.js';
import { Player } from './player.js';
import { SAMPLES } from './samples.js';
import { LANGUAGES, languageInfo } from './languages.js';
import { PRESET_INFO, presetCode, missingPresets, defaultDefinitions } from './definitions.js';
import { resolveHover } from './components/HoverInfo.js';
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

/** The example's code in a language, or a starting stub when the example has no version in that language. */
function sampleCode(s, lang) {
  if (s[lang]) return s[lang];
  const name = languageInfo(lang).label;
  return `${lang === 'python' ? '#' : '//'} No ${name} version of this example yet. Paste your ${name} solution here.\n`;
}

function sampleCodes(s) {
  return Object.fromEntries(LANGUAGES.map((l) => [l.id, sampleCode(s, l.id)]));
}

/** Definitions (Node classes) each language needs for the given code, unless the example ships its own. */
function sampleDefs(s, codes) {
  return Object.fromEntries(LANGUAGES.map((l) => [l.id, (s.defs && s.defs[l.id]) || defaultDefinitions(l.id, codes[l.id])]));
}

function freshState() {
  const s = SAMPLES[0];
  const code = sampleCodes(s);
  return {
    language: 'java',
    sampleId: s.id,
    problem: s.problem,
    code,
    defs: sampleDefs(s, code),
    tests: s.tests.map((t) => ({ ...t })),
    activeTest: 0,
    overrides: {},
    settings: { theme: 'system', maxSteps: 3000, backend: '' },
    leftWidth: null,
  };
}

const state = { ...freshState(), ...storage.get(STORE_KEY, {}) };
state.settings = { ...freshState().settings, ...(state.settings || {}) };
// state saved before a language existed: fill the gaps from the current example
{
  const base = sampleById(state.sampleId) || SAMPLES[0];
  const fresh = sampleCodes(base);
  state.code = { ...fresh, ...(state.code || {}) };
  state.defs = { ...sampleDefs(base, state.code), ...(state.defs || {}) };
  if (!LANGUAGES.some((l) => l.id === state.language)) state.language = 'java';
}
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
let lastRunDefs = null;
const editor = new CodeEditor($('editor'), {
  value: state.code[state.language] || '',
  defs: state.defs[state.language] || '',
  language: state.language,
  onChange: (value, tab) => {
    if (tab === 'defs') state.defs[state.language] = value;
    else state.code[state.language] = value;
    save();
    editor.setStale(lastRunCode !== null && (editor.getValue() !== lastRunCode || editor.getValue('defs') !== lastRunDefs));
    renderDefsUi();
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
  state.code = sampleCodes(s);
  state.defs = sampleDefs(s, state.code);
  state.tests = s.tests.map((t) => ({ ...t }));
  state.activeTest = 0;
  save();
  problem.setValue(s.problem);
  editor.setValue(state.code[state.language]);
  editor.setValue(state.defs[state.language], 'defs');
  tests.setTests(state.tests, 0);
  renderDefsUi();
  resetRun();
}

const langButtons = LANGUAGES.map((l) => h('button', { type: 'button', role: 'radio', 'data-lang': l.id }, l.label));
$('language').append(...langButtons);
function renderLanguage() {
  langButtons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === state.language)));
  $('editor-lang').textContent = languageInfo(state.language).note;
}
langButtons.forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.lang === state.language) return;
  if (running) cancelRun();
  state.language = b.dataset.lang;
  save();
  editor.setLanguage(state.language);
  editor.setValue(state.code[state.language] || '');
  editor.setValue(state.defs[state.language] || '', 'defs');
  renderLanguage();
  renderDefsUi();
  resetRun();
}));
renderLanguage();

$('reset-code').addEventListener('click', () => {
  const s = sampleById(state.sampleId);
  if (!s) return;
  if (editor.tab === 'defs') editor.setValue(sampleDefs(s, sampleCodes(s))[state.language] || '', 'defs');
  else editor.setValue(sampleCode(s, state.language));
});

// ------------------------------------------------------------------------------------------ definitions tab

const tabButtons = [...$('editor-tabs').querySelectorAll('.editor-tab')];
function showTab(tab) {
  editor.showTab(tab);
  tabButtons.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  renderDefsUi();
}
tabButtons.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

/** Definition bar: suggests classes the solution uses but nothing declares, and inserts LeetCode's presets. */
function renderDefsUi() {
  const lang = state.language;
  const defs = editor.getValue('defs');
  $('defs-dot').hidden = !defs.trim();
  const bar = $('defs-bar');
  const missing = missingPresets(lang, editor.getValue(), defs);
  const onDefs = editor.tab === 'defs';
  if (!onDefs && !missing.length) { bar.hidden = true; return; }
  bar.hidden = false;
  const insert = (id) => {
    const cur = editor.getValue('defs');
    editor.setValue((cur.trim() ? cur.replace(/\s*$/, '\n\n') : '') + presetCode(lang, id), 'defs');
  };
  const items = [];
  if (!onDefs) {
    const names = [...new Set(missing.map((id) => PRESET_INFO[id].className))].join(', ');
    items.push(h('span', { class: 'grow' }, `Uses ${names}, which LeetCode defines for you. `),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { missing.forEach(insert); showTab('defs'); } }, 'Add to Definitions'));
  } else {
    const select = h('select', { 'aria-label': 'Insert a LeetCode definition' },
      h('option', { value: '' }, 'Insert definition…'),
      ...Object.entries(PRESET_INFO).filter(([id]) => presetCode(lang, id)).map(([id, info]) => h('option', { value: id }, info.label)));
    select.addEventListener('change', () => { if (select.value) insert(select.value); select.value = ''; });
    items.push(h('span', { class: 'grow' }, 'Classes LeetCode defines for you. They run before your solution and are not traced.'), select);
  }
  mount(bar, items);
}

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
$('set-backend').placeholder = globalThis.CODE_ENGINE_CONFIG?.backend || 'same origin';
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
  lastRunDefs = null;
  timeline.clear();
  tests.clearResults();
  editor.setStale(false);
  editor.clearHighlight();
  editor.clearMarkers();
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
  const definitions = editor.getValue('defs');
  if (!input.ok) {
    return { code, expected: expected.value, result: { status: 'INVALID_INPUT', steps: [], error: { type: 'Invalid Input', message: input.error } } };
  }
  running = execute({
    language: state.language, code, definitions, testCase: input.value, maxSteps: state.settings.maxSteps, backend: state.settings.backend,
    onProgress: (text) => setStatus(text, 'busy'),
  });
  const handle = running;
  const result = await handle.promise;
  if (running === handle) running = null;
  return { code, definitions, expected: expected.value, result };
}

function recordResult(index, { result, expected }) {
  const pass = result.status === 'SUCCESS' ? (expected === undefined ? null : sameOutput(result.output, expected)) : false;
  tests.setResult(index, { status: result.status, output: result.output, pass, message: result.error && result.error.message });
  return pass;
}

function show(index, outcome) {
  const { result, expected, code, definitions } = outcome;
  run = { language: state.language, caseLabel: `Case ${index + 1}`, expected, result };
  lastRunCode = code;
  lastRunDefs = definitions === undefined ? editor.getValue('defs') : definitions;
  editor.setStale(editor.getValue() !== code || editor.getValue('defs') !== lastRunDefs);
  const diagnostics = result.diagnostics || [];
  editor.setMarkers(diagnostics.filter((d) => d.file !== 'definitions'), 'solution');
  editor.setMarkers(diagnostics.filter((d) => d.file === 'definitions'), 'defs');
  if (diagnostics.some((d) => d.file === 'definitions')) showTab('defs');
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
renderDefsUi();
editor.setHoverResolver((ctx) => {
  const frame = timeline.frame;
  return frame ? resolveHover(ctx, frame) : null;
});
editor.init().then(() => {
  // Monaco swallows Ctrl+Enter; route it to Run.
  if (editor.editor && editor.monaco) {
    editor.editor.addCommand(editor.monaco.KeyMod.CtrlCmd | editor.monaco.KeyCode.Enter, runActive);
  }
});
