// The real call stack at this frame, top first. On a return, the returning frame shows its value flowing
// back into the caller.

import { h, mount } from '../util/dom.js';
import { fmt } from '../util/values.js';

export function renderCallStack(el, frame) {
  if (!frame || !frame.stack.length) return mount(el, h('div', { class: 'empty-note' }, 'The call stack is empty.'));
  const returning = frame.rawEvent === 'FUNCTION_EXIT';
  const frames = [...frame.stack].reverse();
  const items = [];
  frames.forEach((f, i) => {
    const isTop = i === 0;
    const status = isTop ? (returning ? 'returning' : frame.rawEvent === 'EXCEPTION' ? 'throwing' : 'active') : 'waiting';
    const args = (f.args || []).map((a) => `${a}=${fmt(f.locals[a], frame.heap, 1)}`).join(', ');
    items.push(h('div', { class: ['frame', isTop && (returning ? 'returning' : 'active')] },
      h('div', { class: 'frame-top' },
        h('span', { class: 'frame-name' }, `${f.name}(${args})`),
        h('span', { class: 'frame-status' }, status)),
      h('div', { class: 'frame-line' }, `line ${f.line}`),
      isTop && returning ? h('div', { class: 'frame-ret' }, `return ${frame.returnValue === undefined ? '' : fmt(frame.returnValue, frame.heap, 1)}`) : null));
    if (isTop && returning && frames[1]) items.push(h('div', { class: 'return-flow' }, `↓ value returns to ${frames[1].name}()`));
  });
  if (frame.depth > frame.stack.length) {
    items.push(h('div', { class: 'return-flow' }, `… ${frame.depth - frame.stack.length} older frames not captured`));
  }
  return mount(el, h('div', { class: 'frames' }, items));
}
