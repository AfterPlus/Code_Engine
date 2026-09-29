// Test cases: add / delete / select, input + expected output, and the actual output with pass/fail after a run.
// Inputs accept JSON ({"nums": [2,7], "target": 9}) or LeetCode's own format (nums = [2,7], target = 9).

import { h, mount } from '../util/dom.js';

/**
 * Parses a test-case input. Returns {ok, value} or {ok: false, error}. Accepted:
 *  - a JSON object of named arguments          {"nums": [2,7], "target": 9}
 *  - LeetCode's example format                 nums = [2,7], target = 9   (an "Input:" label is ignored)
 *  - LeetCode's raw test-case format           one JSON value per line, in parameter order
 * Positional values get keys $1, $2, ... which the runners match to parameters in order.
 */
export function parseTestInput(text) {
  let t = (text || '').trim().replace(/^input\s*:\s*/i, '');
  t = t.replace(/\n\s*(output|explanation)\s*:[\s\S]*$/i, '').trim();
  if (!t) return { ok: true, value: {} };
  const positional = parsePositional(t);
  if (positional) return { ok: true, value: positional };
  try {
    const v = JSON.parse(t);
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, value: v };
    return { ok: true, value: { $1: v } };
  } catch (e) {
    // LeetCode style: name = value, name = value (values are JSON)
    const re = /(?:^|[,\n])\s*([A-Za-z_$][\w$]*)\s*=\s*/g;
    const marks = [];
    let m;
    while ((m = re.exec(t))) marks.push({ name: m[1], start: m.index, valueStart: re.lastIndex });
    if (!marks.length) return { ok: false, error: 'Use JSON like {"nums": [1,2]} or nums = [1,2], target = 3' };
    const out = {};
    for (let i = 0; i < marks.length; i++) {
      const end = i + 1 < marks.length ? marks[i + 1].start : t.length;
      const raw = t.slice(marks[i].valueStart, end).trim().replace(/,$/, '');
      try {
        out[marks[i].name] = JSON.parse(raw);
      } catch (err) {
        return { ok: false, error: `Could not read the value of '${marks[i].name}': ${raw}` };
      }
    }
    return { ok: true, value: out };
  }
}

/** One JSON value per non-empty line (LeetCode's raw test-case box), or null if it isn't that format. */
function parsePositional(t) {
  const lines = t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    try {
      out['$' + (i + 1)] = JSON.parse(lines[i]);
    } catch (e) {
      return null;
    }
  }
  return out;
}

export function parseExpected(text) {
  const t = (text || '').trim();
  if (!t) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch (e) {
    return { ok: true, value: t }; // plain strings are fine
  }
}

/** Deep equality on JSON-like values; numbers compare with a small tolerance. */
export function sameOutput(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameOutput(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => sameOutput(a[k], b[k]));
  }
  return false;
}

export class TestCasePanel {
  /**
   * @param {HTMLElement} el
   * @param {{onChange(tests), onSelect(index), onRunAll()}} handlers
   */
  constructor(el, handlers) {
    this.el = el;
    this.handlers = handlers;
    this.tests = [];
    this.active = 0;
    this.results = [];
  }

  setTests(tests, active = 0) {
    this.tests = tests.map((t) => ({ input: t.input || '', expected: t.expected || '' }));
    this.active = Math.min(active, Math.max(0, this.tests.length - 1));
    this.results = [];
    this.render();
  }

  setResult(index, result) {
    this.results[index] = result;
    this.render();
  }

  clearResults() {
    this.results = [];
    this.render();
  }

  select(i) {
    this.active = i;
    this.handlers.onSelect(i);
    this.render();
  }

  render() {
    const tabs = this.tests.map((t, i) => {
      const r = this.results[i];
      return h('button', {
        type: 'button', class: 'case-tab', role: 'tab', 'aria-selected': String(i === this.active),
        onclick: () => this.select(i),
      }, h('span', { class: ['case-dot', r && r.pass === true && 'pass', r && r.pass === false && 'fail'] }), `Case ${i + 1}`);
    });
    const add = h('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', title: 'Add test case',
      onclick: () => {
        const base = this.tests[this.active] || { input: '', expected: '' };
        this.tests.push({ input: base.input, expected: '' });
        this.changed();
        this.select(this.tests.length - 1);
      },
    }, '+ Add');
    const del = this.tests.length > 1 ? h('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', title: 'Delete this test case',
      onclick: () => {
        this.tests.splice(this.active, 1);
        this.results.splice(this.active, 1);
        this.active = Math.max(0, this.active - 1);
        this.changed();
        this.select(this.active);
      },
    }, 'Delete') : null;
    const runAll = this.tests.length > 1 ? h('button', { type: 'button', class: 'btn btn-sm', onclick: () => this.handlers.onRunAll() }, 'Run all') : null;

    const t = this.tests[this.active] || { input: '', expected: '' };
    const parsed = parseTestInput(t.input);
    const inputArea = h('textarea', { class: !parsed.ok ? 'invalid' : null, spellcheck: 'false', rows: 3, id: 'case-input' });
    inputArea.value = t.input;
    inputArea.addEventListener('input', () => {
      t.input = inputArea.value;
      const p = parseTestInput(t.input);
      inputArea.classList.toggle('invalid', !p.ok);
      errorEl.textContent = p.ok ? '' : p.error;
      this.changed();
    });
    const expectedArea = h('textarea', { spellcheck: 'false', rows: 3, id: 'case-expected', placeholder: 'optional' });
    expectedArea.value = t.expected;
    expectedArea.addEventListener('input', () => { t.expected = expectedArea.value; this.changed(); });
    const errorEl = h('div', { class: 'case-error' }, parsed.ok ? '' : parsed.error);

    const r = this.results[this.active];
    let outputField = null;
    if (r) {
      const text = r.status === 'SUCCESS' ? JSON.stringify(r.output) : `${r.status.replace(/_/g, ' ').toLowerCase()}${r.message ? ': ' + r.message : ''}`;
      outputField = h('div', { class: 'case-field wide' },
        h('label', null, r.status !== 'SUCCESS' ? 'Result' : r.pass === true ? 'Output  ✓ matches expected' : r.pass === false ? 'Output  ✕ differs from expected' : 'Output'),
        h('div', { class: ['case-output', r.pass === true && 'pass', r.pass === false && 'fail'] }, text));
    }

    mount(this.el,
      h('div', { class: 'card-head' },
        h('h2', null, 'Test cases'),
        h('div', { class: 'case-tabs', role: 'tablist' }, tabs),
        h('div', { class: 'card-actions' }, add, del, runAll)),
      h('div', { class: 'case-body' },
        h('div', { class: 'case-field' }, h('label', { for: 'case-input' }, 'Input'), inputArea, errorEl),
        h('div', { class: 'case-field' }, h('label', { for: 'case-expected' }, 'Expected output'), expectedArea),
        outputField));
  }

  changed() {
    this.handlers.onChange(this.tests);
  }
}
