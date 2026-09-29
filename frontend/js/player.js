// Step player: first / previous / play-pause / next / last, speed, and keyboard shortcuts.

export const SPEEDS = [0.25, 0.5, 1, 2, 4];
const BASE_INTERVAL_MS = 700;

export class Player {
  constructor(timeline) {
    this.timeline = timeline;
    this.playing = false;
    this.speed = 1;
    this.timer = null;
    this.listeners = new Set();
    timeline.subscribe(() => {
      if (this.playing && timeline.index >= timeline.length - 1) this.pause();
    });
  }

  first() { this.pause(); this.timeline.seek(0); }
  last() { this.pause(); this.timeline.seek(this.timeline.length - 1); }
  prev() { this.pause(); this.timeline.seek(this.timeline.index - 1); }
  next() { this.pause(); this.timeline.seek(this.timeline.index + 1); }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  play() {
    if (!this.timeline.length) return;
    if (this.timeline.index >= this.timeline.length - 1) this.timeline.seek(0);
    this.playing = true;
    this.schedule();
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    clearTimeout(this.timer);
    this.emit();
  }

  setSpeed(speed) {
    this.speed = speed;
    if (this.playing) this.schedule();
    this.emit();
  }

  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.playing) return;
      this.timeline.seek(this.timeline.index + 1);
      if (this.playing) this.schedule();
    }, BASE_INTERVAL_MS / this.speed);
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }

  /** ← → Space Home End, ignored while typing in an editor or input. */
  bindKeys(target = window) {
    target.addEventListener('keydown', (e) => {
      const el = e.target;
      const typing = el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.closest?.('.monaco-editor'));
      if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
      const actions = { ArrowLeft: () => this.prev(), ArrowRight: () => this.next(), ' ': () => this.toggle(), Home: () => this.first(), End: () => this.last() };
      const fn = actions[e.key];
      if (fn && this.timeline.length) {
        e.preventDefault();
        fn();
      }
    });
  }
}
