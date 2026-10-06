// Right side: the step bar (what just happened), the stage (auto-detected data structures), and the dock
// (variables, call stack, call tree, memory, console) — all views of the same frame, no re-run needed.

import { h, mount } from '../util/dom.js';
import { eventCategory } from '../state/executionState.js';
import { detectViews } from '../visualizers/StructureDetector.js';
import { renderArray } from '../visualizers/ArrayVisualizer.js';
import { renderMatrix } from '../visualizers/DPVisualizer.js';
import { renderMap, renderSet } from '../visualizers/MapVisualizer.js';
import { renderStack } from '../visualizers/StackVisualizer.js';
import { renderQueue, renderPriorityQueue } from '../visualizers/QueueVisualizer.js';
import { renderLinkedList } from '../visualizers/LinkedListVisualizer.js';
import { renderTree } from '../visualizers/TreeVisualizer.js';
import { renderIndexedGraph, renderNodeGraph } from '../visualizers/GraphVisualizer.js';
import { renderObject } from '../visualizers/ObjectVisualizer.js';
import { renderVariables } from '../visualizers/VariableVisualizer.js';
import { renderCallStack } from '../visualizers/CallStackVisualizer.js';
import { renderCallTree } from '../visualizers/RecursionVisualizer.js';
import { renderHeap } from '../visualizers/HeapVisualizer.js';
import { renderConsole, STATUS_TEXT } from './ConsolePanel.js';
import { PanZoom } from './PanZoom.js';

const RENDERERS = {
  array: renderArray,
  matrix: renderMatrix,
  map: renderMap,
  set: renderSet,
  stack: renderStack,
  queue: renderQueue,
  pq: renderPriorityQueue,
  linkedlist: renderLinkedList,
  tree: renderTree,
  graph: (view, ctx) => (view.id ? renderIndexedGraph(view, ctx) : renderNodeGraph(view, ctx)),
  edges: renderIndexedGraph,
  object: renderObject,
};

const TABS = [
  ['vars', 'Variables'],
  ['stack', 'Call Stack'],
  ['tree', 'Call Tree'],
  ['heap', 'Memory'],
  ['console', 'Console'],
];

export class VisualizationPanel {
  constructor({ stepbar, stage, dock }, { onMode }) {
    this.stepbarEl = stepbar;
    this.stageEl = stage;
    this.dockEl = dock;
    this.onMode = onMode;
    this.tab = 'vars';
    this.userPickedTab = false;
    this.tabButtons = new Map();
    this.panel = h('div', { class: 'tab-panel', role: 'tabpanel' });
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([id, label]) => {
      const b = h('button', { type: 'button', class: 'tab', role: 'tab', onclick: () => { this.userPickedTab = true; this.setTab(id); } }, label);
      this.tabButtons.set(id, b);
      return b;
    }));
    mount(dock, tabs, this.panel);
    // The stage is [notes, body]: error cards stay put above a pan/zoom surface whose position and zoom survive
    // every step, because a frame only swaps the surface's content.
    this.stageNotes = h('div', { class: 'stage-notes' });
    this.stageBody = h('div', { class: 'stage-body' });
    mount(stage, this.stageNotes, this.stageBody);
    this.stagePZ = new PanZoom({ label: 'Data structures' });
    this.treeStagePZ = new PanZoom({ follow: true, label: 'Call tree' });
    this.dockTreePZ = new PanZoom({ follow: true, label: 'Call tree' });
    this.state = {};
    this.renderEmpty();
  }

  setTab(id) {
    this.tab = id;
    for (const [k, b] of this.tabButtons) b.setAttribute('aria-selected', String(k === id));
    this.renderDock();
  }

  /** Called once per run: pick a sensible default tab (Call Tree for recursive code, Console for failures). */
  prepare(exec, run) {
    this.state = { exec, run, frame: exec ? exec.frames[0] : null };
    for (const pz of [this.stagePZ, this.treeStagePZ, this.dockTreePZ]) pz.reset();
    if (!this.userPickedTab) {
      if (!exec || !exec.frames.length) this.setTab('console');
      // recursive code: the call tree goes in the dock, unless the stage already shows it (no structures)
      else if (exec.recursive) this.setTab(detectViews(exec.frames[0], this.overrides || {}, exec).length ? 'tree' : 'stack');
      else this.setTab('vars');
    }
    this.updateTabBadges();
  }

  updateTabBadges() {
    const { exec, run, frame } = this.state;
    const set = (id, extra) => {
      const b = this.tabButtons.get(id);
      const label = TABS.find(([k]) => k === id)[1];
      b.replaceChildren(label, extra || '');
    };
    set('stack', frame && frame.depth ? h('span', { class: 'count' }, frame.depth) : null);
    set('tree', exec && exec.recursive ? h('span', { class: 'dot', title: 'recursion detected' }) : exec ? h('span', { class: 'count' }, exec.calls.size) : null);
    set('console', run && run.result && (run.result.status !== 'SUCCESS' || run.result.stdout) ? h('span', { class: 'dot', style: { background: run.result.status === 'SUCCESS' ? 'var(--read)' : 'var(--err)' } }) : null);
  }

  renderEmpty(running = false, language = null) {
    this.state = {};
    mount(this.stepbarEl, h('div', { class: 'meta' }, running ? 'Tracing…' : 'Ready'));
    mount(this.stageNotes);
    mount(this.stageBody, h('div', { class: 'stage-empty' },
      running ? h('div', { class: 'spinner' }) : null,
      h('div', { class: 'big' }, running ? (language === 'java' ? 'Compiling and tracing in a sandboxed JVM…' : 'Tracing in a sandboxed worker…') : 'Paste a solution and press Run'),
      running ? null : h('div', null, 'Every executed line becomes a frame you can step through. ',
        h('span', { class: 'kbd' }, 'Ctrl'), ' + ', h('span', { class: 'kbd' }, 'Enter'), ' runs; ',
        h('span', { class: 'kbd' }, '←'), ' ', h('span', { class: 'kbd' }, '→'), ' step; ', h('span', { class: 'kbd' }, 'Space'), ' plays.')));
    this.setTab(this.tab);
  }

  render(frame) {
    this.state.frame = frame;
    this.renderStepbar();
    this.renderStage();
    this.renderDock();
    this.updateTabBadges();
  }

  renderStepbar() {
    const { frame, exec, run } = this.state;
    if (!frame) {
      const st = run && run.result ? run.result.status : null;
      mount(this.stepbarEl, h('div', { class: 'meta' }, st ? STATUS_TEXT[st] || st : 'Ready'));
      return;
    }
    const cat = eventCategory(frame.primary);
    mount(this.stepbarEl,
      h('span', { class: `event-badge ev-${cat}` }, frame.primary),
      h('div', { class: 'meta' },
        h('span', null, 'Line ', h('b', null, frame.line || '–')),
        h('span', null, 'Function ', h('b', null, `${frame.function || '?'}()`)),
        h('span', null, 'Depth ', h('b', null, frame.depth))),
      h('div', { class: 'desc' }, frame.desc.slice(0, 4).map((d) => h('span', { class: 'desc-item' }, d))));
  }

  renderStage() {
    const { frame, exec, run } = this.state;
    const result = run && run.result;
    const notes = [];
    const err = result && result.error;
    const failed = result && result.status !== 'SUCCESS';
    const atEnd = frame && exec && frame.index === exec.frames.length - 1;
    if (failed && err && (!frame || atEnd || frame.rawEvent === 'EXCEPTION')) {
      const where = [err.line ? `Line ${err.line}` : null, err.function ? `${err.function}()` : null].filter(Boolean).join(' · ');
      notes.push(h('div', { class: 'error-card', role: 'alert' },
        h('div', { class: 'error-title' }, STATUS_TEXT[result.status] || result.status, where ? h('small', null, where) : null),
        h('pre', null, [err.type && err.type !== STATUS_TEXT[result.status] ? err.type + '\n' : '', err.message || ''].join('')),
        frame ? h('pre', null, h('span', { style: { color: 'var(--muted)' } }, 'Earlier frames are still inspectable — use ← or the timeline.')) : null));
    }
    mount(this.stageNotes, notes);
    if (!frame) {
      mount(this.stageBody);
      return;
    }
    const views = detectViews(frame, this.overrides || {}, exec);
    const prev = exec.frames[frame.index - 1] || null;
    const ctx = { frame, prev, exec, onMode: this.onMode, rerender: () => this.renderStage() };
    const nodes = views.map((v) => {
      const fn = RENDERERS[v.kind];
      try {
        return fn ? fn(v, ctx) : null;
      } catch (e) {
        console.error('visualizer failed', v, e);
        return null;
      }
    }).filter(Boolean);
    if (nodes.length) this.stagePZ.show(this.stageBody, [h('div', { class: 'views' }, nodes)]);
    // Pure recursion (fib, permutations of indices...): the call tree *is* the data structure.
    else if (exec.recursive) renderCallTree(this.stageBody, frame, exec, this.treeStagePZ);
    else if (!notes.length) mount(this.stageBody, h('div', { class: 'stage-empty' }, h('div', { class: 'big' }, 'No data structures in scope'), 'Scalar variables are listed under Variables below.'));
    else mount(this.stageBody);
  }

  setOverrides(overrides) {
    this.overrides = overrides;
  }

  renderDock() {
    const { frame, exec, run } = this.state;
    const prev = frame && exec ? exec.frames[frame.index - 1] : null;
    // the call tree is a pan/zoom surface that fills the panel; every other tab scrolls inside it
    this.panel.classList.toggle('pz-host', this.tab === 'tree');
    if (this.tab !== 'tree') this.panel.scrollTop = 0;
    switch (this.tab) {
      case 'vars': renderVariables(this.panel, frame, exec, prev); break;
      case 'stack': renderCallStack(this.panel, frame); break;
      case 'tree': renderCallTree(this.panel, frame, exec, this.dockTreePZ); break;
      case 'heap': renderHeap(this.panel, frame); break;
      default: renderConsole(this.panel, { exec, frame, run });
    }
  }
}
