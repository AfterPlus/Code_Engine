// Drag handle for resizing a panel. One implementation serves every divider in the app: drag with the pointer, nudge
// with the arrow keys (Shift for bigger steps), double-click to restore the default size.

const STEP = 24;
const BIG_STEP = 96;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param {HTMLElement} el  the handle
 * @param {object} o
 * @param {'x'|'y'} o.axis  the direction the handle moves in
 * @param {1|-1} o.grow     +1 when moving the handle towards larger x / y makes the panel bigger (a panel above or
 *                          left of the handle), -1 when it makes it smaller (a panel below it)
 * @param {() => number} o.size                the panel's current size in px
 * @param {() => [number, number]} o.limits    [min, max] size in px, read when a drag or key press starts
 * @param {(px: number) => void} o.apply       sets the panel's size
 * @param {() => void} o.reset                 back to the default size
 * @param {() => void} o.done                  a drag, key press or reset finished (persist it)
 */
export function bindSplitter(el, { axis, grow, size, limits, apply, reset, done }) {
  const pos = (e) => (axis === 'x' ? e.clientX : e.clientY);
  const set = (px, [lo, hi]) => {
    const v = Math.round(clamp(px, lo, hi));
    apply(v);
    el.setAttribute('aria-valuemin', Math.round(lo));
    el.setAttribute('aria-valuemax', Math.round(hi));
    el.setAttribute('aria-valuenow', v);
  };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    document.body.classList.add('resizing');
    const start = pos(e);
    const base = size();
    const range = limits();
    const move = (ev) => set(base + grow * (pos(ev) - start), range);
    const up = () => {
      el.classList.remove('dragging');
      document.body.classList.remove('resizing');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      done();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });

  el.addEventListener('keydown', (e) => {
    const dir = (axis === 'x' ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 })[e.key];
    if (!dir || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation(); // the arrow keys also step the timeline
    set(size() + grow * dir * (e.shiftKey ? BIG_STEP : STEP), limits());
    done();
  });

  el.addEventListener('dblclick', () => {
    reset();
    el.removeAttribute('aria-valuenow');
    done();
  });
}
