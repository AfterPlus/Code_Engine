// Pan and zoom surface for the visualizations. It is a native scroll container (scrollbars, the wheel and keyboard
// scrolling keep working) whose content is scaled with a CSS transform, so stepping through frames only swaps the
// content and keeps your position and zoom. Drag to pan, Ctrl/⌘ + wheel or pinch to zoom around the pointer, and the
// corner buttons zoom, fit everything, reset, or (call tree) keep the active call centred.

import { h } from '../util/dom.js';

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const STEP = 1.25;
const DRAG_SLOP = 3;
// pressing these must click, not start a pan
const NO_PAN = 'button, select, input, textarea, a, .pz-tools';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export class PanZoom {
  /** @param {{follow?: boolean, label?: string}} opts follow: offer a "keep the focus centred" toggle (starts on) */
  constructor({ follow = false, label = 'Visualization' } = {}) {
    this.scale = 1;
    this.canFollow = follow;
    this.following = follow;
    this.focus = null;
    this.saved = { left: 0, top: 0 };
    this.natural = { w: 0, h: 0 };
    this.view = { w: 0, h: 0 }; // the viewport's size, kept by the ResizeObserver so stepping never has to measure it
    this.hint = null;
    this.contentW = 0;
    this.raf = 0;
    this.pointers = new Map();
    this.gesture = null;

    this.content = h('div', { class: 'pz-content' });
    this.sizer = h('div', { class: 'pz-sizer' }, this.content);
    this.scroller = h('div', {
      class: 'pz-scroll', tabindex: '0', role: 'group', 'aria-label': `${label}: drag to pan, Ctrl + scroll to zoom`,
    }, this.sizer);
    this.legend = h('div', { class: 'pz-legend' });
    this.pct = h('button', { type: 'button', class: 'pz-btn pz-pct', title: 'Reset to 100%', onclick: () => this.reset() }, '100%');
    this.followBtn = follow ? h('button', {
      type: 'button', class: 'pz-btn on', 'aria-pressed': 'true', title: 'Keep the active call centred as you step',
      onclick: () => {
        this.setFollowing(!this.following);
        if (this.following && this.focus) this.centerOn(this.focus.x, this.focus.y, true);
      },
    }, 'Follow') : null;
    this.tools = h('div', { class: 'pz-tools', role: 'toolbar', 'aria-label': 'Pan and zoom', title: 'Drag to pan. Ctrl/⌘ + scroll or pinch to zoom.' },
      h('button', { type: 'button', class: 'pz-btn', 'aria-label': 'Zoom out', title: 'Zoom out', onclick: () => this.zoomTo(this.scale / STEP) }, '−'),
      this.pct,
      h('button', { type: 'button', class: 'pz-btn', 'aria-label': 'Zoom in', title: 'Zoom in', onclick: () => this.zoomTo(this.scale * STEP) }, '+'),
      h('button', { type: 'button', class: 'pz-btn', title: 'Shrink to fit everything', onclick: () => this.fit() }, 'Fit'),
      this.followBtn);
    this.el = h('div', { class: 'pz' }, this.legend, this.scroller, this.tools);

    this.scroller.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.scroller.addEventListener('pointerdown', (e) => this.onDown(e));
    this.scroller.addEventListener('pointermove', (e) => this.onMove(e));
    this.scroller.addEventListener('pointerup', (e) => this.onUp(e));
    this.scroller.addEventListener('pointercancel', (e) => this.onUp(e));
    this.scroller.addEventListener('keydown', (e) => this.onKey(e));
    this.scroller.addEventListener('scroll', () => { this.saved = { left: this.scroller.scrollLeft, top: this.scroller.scrollTop }; });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(([entry]) => {
        this.view = { w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) };
        this.layout();
      }).observe(this.scroller);
    }
  }

  /**
   * Puts `nodes` on the surface (keeping the current zoom and position) and mounts the surface in `parent`.
   * `focus` is a point in content coordinates to keep centred while following; `legend` floats top-left; `size` is
   * the content's {w, h} when the caller knows it, which spares a synchronous layout on every step.
   */
  show(parent, nodes, { focus = null, legend = null, size = null } = {}) {
    const attached = this.el.parentNode === parent;
    if (!attached) {
      parent.replaceChildren(this.el);
      this.view = { w: 0, h: 0 }; // measured afresh now that it is on the page
    }
    this.content.replaceChildren(...nodes.filter(Boolean));
    this.legend.replaceChildren(...[legend].filter(Boolean));
    this.focus = focus;
    this.hint = size;
    this.layout();
    if (!attached) this.scroller.scrollTo(this.saved.left, this.saved.top);
    if (this.following && focus) {
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(() => this.centerOn(focus.x, focus.y, attached));
    }
    return this;
  }

  /** Back to 100% at the top-left, following again: used when a new run replaces the content. */
  reset() {
    this.scale = 1;
    this.saved = { left: 0, top: 0 }; // the surface may be detached right now, so there is no scroll event to record it
    this.setFollowing(this.canFollow);
    this.apply();
    this.scroller.scrollTo(0, 0);
  }

  /** Re-measures the content: the scrollable area is the content's natural size times the zoom. */
  layout() {
    if (!this.view.w) this.view = { w: this.scroller.clientWidth, h: this.scroller.clientHeight };
    const base = this.view.w;
    if (!base) return; // detached or hidden: measured again when it is shown
    // Content of a known size (the call tree) is given the whole viewport at any zoom, so it can centre itself in it
    const width = this.hint ? Math.max(base / this.scale, this.hint.w) : base;
    if (this.contentW !== width) {
      this.content.style.width = `${width}px`;
      this.contentW = width;
    }
    this.natural = this.hint
      ? { ...this.hint }
      : { w: Math.max(base, this.content.scrollWidth), h: this.content.scrollHeight };
    this.sizer.style.width = `${(this.hint ? width : this.natural.w) * this.scale}px`;
    this.sizer.style.height = `${this.natural.h * this.scale}px`;
  }

  /** How far a narrower-than-the-viewport content is pushed right to sit in the middle (see layout). */
  offsetX() {
    return this.hint ? Math.max(0, (this.contentW - this.hint.w) / 2) : 0;
  }

  apply() {
    this.content.style.transform = `scale(${this.scale})`;
    this.pct.textContent = `${Math.round(this.scale * 100)}%`;
    this.layout();
  }

  /** Zooms to `next`, keeping the content under (px, py) (viewport coordinates, default the centre) in place. */
  zoomTo(next, px = this.scroller.clientWidth / 2, py = this.scroller.clientHeight / 2) {
    const k = clamp(next, MIN_SCALE, MAX_SCALE);
    if (k === this.scale) return;
    const s = this.scroller;
    const cx = (s.scrollLeft + px) / this.scale;
    const cy = (s.scrollTop + py) / this.scale;
    this.scale = k;
    this.apply();
    s.scrollLeft = cx * k - px;
    s.scrollTop = cy * k - py;
  }

  /** Shrinks until everything is visible; never magnifies, so small content stays at 100%. */
  fit() {
    const s = this.scroller;
    const { w, h: ht } = this.natural;
    if (!w || !ht) return;
    this.scale = clamp(Math.min(1, s.clientWidth / w, s.clientHeight / ht), MIN_SCALE, 1);
    this.apply();
    s.scrollTo(0, 0);
  }

  /** Scrolls so the content point (x, y) is in the middle of the viewport. */
  centerOn(x, y, smooth = false) {
    this.scroller.scrollTo({
      left: Math.max(0, (x + this.offsetX()) * this.scale - this.view.w / 2),
      top: Math.max(0, y * this.scale - this.view.h / 2),
      behavior: smooth ? 'smooth' : 'auto',
    });
  }

  setFollowing(on) {
    this.following = !!on && this.canFollow;
    if (!this.followBtn) return;
    this.followBtn.classList.toggle('on', this.following);
    this.followBtn.setAttribute('aria-pressed', String(this.following));
  }

  /** Panning by hand ends "follow"; zooming does not (you can zoom in and keep the active call centred). */
  userPanned() {
    if (this.following) this.setFollowing(false);
  }

  // ---------------------------------------------------------------------------------------- input

  onWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl + wheel and trackpad pinch (which browsers report as Ctrl + wheel) zoom around the pointer
      e.preventDefault();
      const r = this.scroller.getBoundingClientRect();
      const d = clamp(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, -50, 50);
      this.zoomTo(this.scale * Math.exp(-d * 0.0045), e.clientX - r.left, e.clientY - r.top);
    } else {
      this.userPanned(); // plain wheel scrolls natively
    }
  }

  onDown(e) {
    if ((e.pointerType === 'mouse' && e.button !== 0) || e.target.closest(NO_PAN)) return;
    const s = this.scroller;
    const r = s.getBoundingClientRect();
    if (e.clientX - r.left > s.clientWidth || e.clientY - r.top > s.clientHeight) return; // the scrollbars pan natively
    if (e.isPrimary) this.pointers.clear(); // a release outside the window may have left a stale pointer behind
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.gesture = { kind: 'drag', x: e.clientX, y: e.clientY, left: s.scrollLeft, top: s.scrollTop, moved: false };
    } else if (this.pointers.size === 2) {
      this.gesture = this.pinchStart();
    }
  }

  pinchStart() {
    const [a, b] = [...this.pointers.values()];
    const r = this.scroller.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left;
    const my = (a.y + b.y) / 2 - r.top;
    return {
      kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: this.scale,
      cx: (this.scroller.scrollLeft + mx) / this.scale, cy: (this.scroller.scrollTop + my) / this.scale,
    };
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    const g = this.gesture;
    if (!p || !g) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const s = this.scroller;
    if (g.kind === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const r = s.getBoundingClientRect();
      const mx = (a.x + b.x) / 2 - r.left;
      const my = (a.y + b.y) / 2 - r.top;
      const k = clamp(g.scale * (Math.hypot(a.x - b.x, a.y - b.y) / g.dist), MIN_SCALE, MAX_SCALE);
      this.scale = k;
      this.apply();
      s.scrollLeft = g.cx * k - mx;
      s.scrollTop = g.cy * k - my;
      return;
    }
    if (g.kind !== 'drag') return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!g.moved) {
      g.moved = true;
      try { s.setPointerCapture(e.pointerId); } catch (err) { /* the pointer is already gone */ }
      s.classList.add('panning');
      window.getSelection()?.removeAllRanges();
      this.userPanned();
    }
    s.scrollLeft = g.left - dx;
    s.scrollTop = g.top - dy;
  }

  onUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.gesture && this.gesture.kind === 'pinch' && this.pointers.size === 1) {
      // lifting one finger of a pinch carries on as a drag with the remaining one
      const [rest] = [...this.pointers.values()];
      this.gesture = { kind: 'drag', x: rest.x, y: rest.y, left: this.scroller.scrollLeft, top: this.scroller.scrollTop, moved: true };
      return;
    }
    if (!this.pointers.size) {
      this.gesture = null;
      this.scroller.classList.remove('panning');
    }
  }

  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') this.zoomTo(this.scale * STEP);
    else if (e.key === '-' || e.key === '_') this.zoomTo(this.scale / STEP);
    else if (e.key === '0') this.reset();
    else return;
    e.preventDefault();
  }
}
