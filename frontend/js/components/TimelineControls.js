// Footer: first / prev / play / next / last, a clickable timeline, the step counter, and speed.
// Each timeline tick is one frame, colored by its event and sized by call depth, so the shape of the run
// (loops, recursion) is visible at a glance.

import { h, mount } from '../util/dom.js';
import { SPEEDS } from '../player.js';
import { eventCategory } from '../state/executionState.js';

const ICONS = {
  first: 'M3 3h2v10H3zM13 3v10L6 8z',
  prev: 'M11 3v10L4 8z',
  play: 'M4.5 2.5v11l9-5.5z',
  pause: 'M4 3h3v10H4zM9 3h3v10H9z',
  next: 'M5 3v10l7-5z',
  last: 'M11 3h2v10h-2zM3 3v10l7-5z',
};
const icon = (d) => h('span', { html: `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`, style: { display: 'contents' } });

export class TimelineControls {
  constructor(el, timeline, player) {
    this.el = el;
    this.timeline = timeline;
    this.player = player;
    const btn = (name, label, fn, cls = 'btn btn-icon') => h('button', { type: 'button', class: cls, title: label, 'aria-label': label, onclick: fn }, icon(ICONS[name]));
    this.playBtn = btn('play', 'Play (Space)', () => player.toggle(), 'btn btn-icon btn-play');
    this.buttons = [
      btn('first', 'First (Home)', () => player.first()),
      btn('prev', 'Previous (←)', () => player.prev()),
      this.playBtn,
      btn('next', 'Next (→)', () => player.next()),
      btn('last', 'Last (End)', () => player.last()),
    ];
    this.canvas = h('canvas');
    this.tip = h('div', { class: 'timeline-tip', hidden: true });
    this.track = h('div', { class: 'timeline', title: 'Click or drag to jump to a step' }, this.canvas, this.tip);
    this.count = h('div', { class: 'stepcount' }, 'Step 0 / 0');
    this.speed = h('select', { 'aria-label': 'Playback speed', onchange: () => player.setSpeed(Number(this.speed.value)) },
      SPEEDS.map((s) => h('option', { value: s, selected: s === 1 ? true : null }, `${s}x`)));
    mount(el, h('div', { class: 'controls' }, this.buttons), this.track, this.count, h('label', { class: 'speed' }, this.speed));

    let dragging = false;
    const seekAt = (e) => {
      const n = this.timeline.length;
      if (!n) return;
      const r = this.canvas.getBoundingClientRect();
      const i = Math.floor(((e.clientX - r.left) / r.width) * n);
      this.player.pause();
      this.timeline.seek(i);
    };
    this.track.addEventListener('pointerdown', (e) => { dragging = true; this.track.setPointerCapture(e.pointerId); seekAt(e); });
    this.track.addEventListener('pointermove', (e) => { if (dragging) seekAt(e); this.hover(e); });
    this.track.addEventListener('pointerup', () => { dragging = false; });
    this.track.addEventListener('pointerleave', () => { this.tip.hidden = true; });
    new ResizeObserver(() => this.draw()).observe(this.track);
    timeline.subscribe(() => this.update());
    player.subscribe(() => this.update());
    this.update();
  }

  hover(e) {
    const exec = this.timeline.execution;
    if (!exec) return;
    const r = this.canvas.getBoundingClientRect();
    const n = exec.frames.length;
    const i = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    const f = exec.frames[i];
    this.tip.hidden = false;
    this.tip.textContent = `${i + 1} · line ${f.line} · ${f.primary}`;
    this.tip.style.left = `${e.clientX - r.left}px`;
  }

  update() {
    const n = this.timeline.length;
    this.count.textContent = n ? `Step ${this.timeline.index + 1} / ${n}` : 'Step 0 / 0';
    this.playBtn.replaceChildren(icon(this.player.playing ? ICONS.pause : ICONS.play));
    this.playBtn.title = this.player.playing ? 'Pause (Space)' : 'Play (Space)';
    this.buttons.forEach((b) => { b.disabled = !n; });
    this.draw();
  }

  draw() {
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = this.track.clientWidth;
    const hgt = this.track.clientHeight;
    if (!w || !hgt) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const color = (v) => css.getPropertyValue(v).trim();
    ctx.fillStyle = color('--panel-2');
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(0, 0, w, hgt, 6) : ctx.rect(0, 0, w, hgt);
    ctx.fill();
    const exec = this.timeline.execution;
    if (!exec || !exec.frames.length) return;
    const frames = exec.frames;
    const n = frames.length;
    const colors = { call: color('--call'), ret: color('--ret'), write: color('--write'), read: color('--read'), ptr: color('--ptr'), err: color('--err'), step: color('--border-strong') };
    const maxDepth = Math.max(1, exec.maxDepth);
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const f = frames[i];
      const depth = f.depth || 1;
      const barH = 6 + ((hgt - 12) * depth) / maxDepth;
      ctx.fillStyle = colors[eventCategory(f.primary)] || colors.step;
      ctx.globalAlpha = i <= this.timeline.index ? 0.95 : 0.4;
      ctx.fillRect(i * bw + (bw > 3 ? 0.5 : 0), hgt - 3 - barH, Math.max(1, bw - (bw > 3 ? 1 : 0)), barH);
    }
    ctx.globalAlpha = 1;
    const x = (this.timeline.index + 0.5) * bw;
    ctx.fillStyle = color('--text');
    ctx.fillRect(x - 1, 1, 2, hgt - 2);
  }
}
