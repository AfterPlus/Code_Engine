// Holds the current execution and the selected frame; everything else subscribes to it.

export class Timeline {
  constructor() {
    this.execution = null;
    this.index = 0;
    this.listeners = new Set();
  }

  load(execution) {
    this.execution = execution;
    this.index = 0;
    this.emit();
  }

  clear() {
    this.execution = null;
    this.index = 0;
    this.emit();
  }

  get length() {
    return this.execution ? this.execution.frames.length : 0;
  }

  get frame() {
    return this.execution ? this.execution.frames[this.index] || null : null;
  }

  seek(i) {
    if (!this.length) return;
    const next = Math.max(0, Math.min(this.length - 1, i));
    if (next === this.index) return;
    this.index = next;
    this.emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this);
  }
}
