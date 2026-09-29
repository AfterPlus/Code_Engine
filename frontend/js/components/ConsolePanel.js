// Console: program output up to the current frame, then the run's outcome (output vs expected, errors).

import { h, mount } from '../util/dom.js';
import { sameOutput } from './TestCasePanel.js';

const STATUS_TEXT = {
  SUCCESS: 'Finished', COMPILE_ERROR: 'Compile Error', RUNTIME_ERROR: 'Runtime Error', TIMEOUT: 'Timeout',
  MEMORY_LIMIT: 'Memory Limit Exceeded', STEP_LIMIT: 'Step Limit Reached', SECURITY_VIOLATION: 'Security Violation',
  INVALID_INPUT: 'Invalid Input', CANCELLED: 'Cancelled', INTERNAL_ERROR: 'Error',
};

export function renderConsole(el, { exec, frame, run }) {
  if (!run) return mount(el, h('pre', { class: 'console' }, h('span', { class: 'sys' }, 'Output appears here when you run the code.')));
  const lines = [h('span', { class: 'sys' }, `Running ${run.caseLabel} (${run.language === 'java' ? 'Java' : 'JavaScript'})…\n\n`)];
  const result = run.result;
  if (!result) return mount(el, h('pre', { class: 'console' }, lines));

  if (frame) {
    const before = frame.console.slice(0, frame.console.length - frame.out.length);
    if (before) lines.push(before);
    if (frame.out) lines.push(h('span', { class: 'new' }, frame.out));
    if (frame.console) lines.push('\n');
  } else if (result.stdout) {
    lines.push(result.stdout, '\n');
  }

  const atEnd = !exec || !frame || frame.index === exec.frames.length - 1;
  if (!atEnd) {
    lines.push(h('span', { class: 'sys' }, `… paused at step ${frame.index + 1} of ${exec.frames.length}`));
    return mount(el, h('pre', { class: 'console' }, lines));
  }

  if (result.status === 'SUCCESS') {
    lines.push(h('span', { class: 'sys' }, 'Output:\n'), JSON.stringify(result.output), '\n');
    if (run.expected !== undefined) {
      lines.push(h('span', { class: 'sys' }, '\nExpected:\n'), JSON.stringify(run.expected), '\n\n');
      lines.push(sameOutput(result.output, run.expected) ? h('span', { class: 'ok' }, '✓ PASS') : h('span', { class: 'bad' }, '✕ FAIL'));
    }
  } else {
    const e = result.error || {};
    lines.push(h('span', { class: 'bad' }, `${STATUS_TEXT[result.status] || result.status}\n`));
    if (e.type && e.type !== STATUS_TEXT[result.status]) lines.push(`${e.type}\n`);
    if (e.message) lines.push(`${e.message}\n`);
    if (e.line) lines.push(h('span', { class: 'sys' }, `Line ${e.line}${e.function ? ' · ' + e.function + '()' : ''}\n`));
    (result.diagnostics || []).slice(1, 6).forEach((d) => lines.push(h('span', { class: 'sys' }, `Line ${d.line}: ${d.message}\n`)));
  }
  if (result.executionTimeMs !== undefined) lines.push(h('span', { class: 'sys' }, `\n\n${result.steps ? result.steps.length : 0} steps traced in ${result.executionTimeMs} ms`));
  return mount(el, h('pre', { class: 'console' }, lines));
}

export { STATUS_TEXT };
