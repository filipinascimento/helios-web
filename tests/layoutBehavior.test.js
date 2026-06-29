import test from 'node:test';
import assert from 'node:assert/strict';
import { BehaviorManager, BehaviorRegistry } from '../src/behaviors/index.js';
import { LayoutBehavior } from '../src/behaviors/LayoutBehavior.js';
import { HeliosStateManager } from '../src/state/index.js';
import { LayoutPanel } from '../src/ui/panels/LayoutPanel.js';

class MockLayout {
  constructor(key, {
    label = key,
    dynamic = key !== 'static',
    parameters = { strength: 1.5, recenter: true },
  } = {}) {
    this.key = key;
    this.label = label;
    this.dynamic = dynamic;
    this.parameters = { ...parameters };
    this.reheatCalls = [];
    this.seedCalls = 0;
  }

  getParameterBindings() {
    const bindings = [
      {
        key: 'alphaCurrent',
        label: 'Temp.',
        type: 'display',
        get: () => 0.25,
        history: { length: 4, sampleMs: 1000, scale: 'log', min: 0.001, max: 1 },
      },
      {
        key: 'strength',
        label: 'Strength',
        type: 'number',
        min: 0,
        max: 10,
        step: 0.1,
        get: () => this.parameters.strength,
        set: (value) => {
          this.parameters.strength = Number(value);
        },
      },
      {
        key: 'recenter',
        label: 'Recenter',
        type: 'boolean',
        get: () => this.parameters.recenter === true,
        set: (value) => {
          this.parameters.recenter = value === true;
        },
      },
    ];
    if (Object.prototype.hasOwnProperty.call(this.parameters, 'layoutScheduling')) {
      bindings.push({
        key: 'layoutScheduling',
        label: 'Scheduling',
        type: 'select',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'full', label: 'Full' },
          { value: 'chunked', label: 'Chunked' },
        ],
        get: () => this.parameters.layoutScheduling,
        set: (value) => {
          this.parameters.layoutScheduling = value;
        },
      });
    }
    if (Object.prototype.hasOwnProperty.call(this.parameters, 'layoutChunkCount')) {
      bindings.push({
        key: 'layoutChunkCount',
        label: 'Chunks',
        type: 'number',
        min: 2,
        max: 10,
        step: 1,
        get: () => this.parameters.layoutChunkCount,
        set: (value) => {
          this.parameters.layoutChunkCount = Number(value);
        },
      });
    }
    return {
      key: this.key,
      label: this.label,
      dynamic: this.dynamic,
      bindings: this.dynamic ? bindings : [],
    };
  }

  reheat(reason = 'layout') {
    this.reheatCalls.push(reason);
    return this;
  }

  seedFromNetworkPositions() {
    this.seedCalls += 1;
    return this;
  }
}

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = { nodeCount: 32, nodeCapacity: 32 };
    this.options = { mode: '2d' };
    this.renderer = { device: { type: 'webgpu' } };
    this.layers = { canvas: new EventTarget() };
    this.states = new HeliosStateManager();
    this.scheduler = {
      layoutEnabled: true,
      state: 'running',
      getLayoutState() {
        return this.state;
      },
      requestRender() {},
      requestLayout() {},
      setLayoutEnabled: (enabled, reason = 'user') => {
        this.scheduler.layoutEnabled = enabled !== false;
        this.scheduler.state = enabled !== false
          ? 'running'
          : (reason === 'alpha-min' || reason === 'idle' || reason === 'temperature' ? 'idle' : 'stopped');
      },
    };
    this.calls = {
      created: [],
      layoutSet: [],
      start: 0,
      stop: [],
      positionAttributes: [],
    };
    this._layout = new MockLayout('worker:force3d', { label: 'Force (worker)' });
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  emit(type, detail) {
    const event = new Event(type);
    event.detail = detail;
    this.dispatchEvent(event);
  }

  layout(value) {
    if (arguments.length === 0) return this._layout;
    this._layout = value;
    this.calls.layoutSet.push(value.key);
    this.emit('layout:changed', { key: value.key, layout: value });
    return this;
  }

  createLayout(spec = {}) {
    const key = spec?.type === 'gpu-force'
      ? 'gpu-force'
      : spec?.type === 'd3force3d'
        ? 'd3force3d'
        : spec?.type === 'worker' && spec?.options?.layout === 'jitter'
          ? 'worker:jitter'
          : spec?.type === 'static'
            ? 'static'
            : 'worker:force3d';
    const layout = new MockLayout(key, {
      label: key,
      dynamic: key !== 'static',
    });
    layout.options = { ...(spec?.options ?? {}) };
    this.calls.created.push({ type: spec?.type ?? 'static', key });
    return layout;
  }

  getLayoutPositionAttributeChoices() {
    return [
      { value: '_helios_visuals_position', label: 'Current positions', dimension: 3 },
      { value: 'embedding2d', label: 'embedding2d (2D)', dimension: 2 },
      { value: 'embedding3d', label: 'embedding3d (3D)', dimension: 3 },
    ];
  }

  setLayoutPositionsFromNodeAttribute(name) {
    this.calls.positionAttributes.push(name);
    return name !== 'missing';
  }

  startLayout() {
    this.calls.start += 1;
    this.scheduler.state = 'running';
    this.emit('layout:start', { reason: 'user' });
    return this;
  }

  stopLayout(reason = 'user') {
    this.calls.stop.push(reason);
    this.scheduler.state = reason === 'alpha-min' || reason === 'idle' || reason === 'temperature'
      ? 'idle'
      : 'stopped';
    this.emit('layout:stop', { reason });
    return this;
  }
}

function attachLayoutBehavior(helios = new MockHelios(), options = {}) {
  const manager = new BehaviorManager(helios, new BehaviorRegistry().register('layout', LayoutBehavior));
  const layout = manager.use('layout', options);
  return { helios, manager, layout };
}

function dispatchCanvasEvent(helios, type, props = {}) {
  const event = new Event(type);
  for (const [key, value] of Object.entries(props)) {
    event[key] = value;
  }
  helios.layers.canvas.dispatchEvent(event);
}

test('layout behavior registers, attaches, and exposes public lifecycle state', () => {
  const { manager, layout } = attachLayoutBehavior();

  assert.ok(layout instanceof LayoutBehavior);
  assert.equal(manager.get('layout'), layout);
  assert.equal(layout.type(), 'worker:force3d');
  assert.equal(layout.runState(), 'running');
  assert.deepEqual(layout.choices().map((entry) => entry.value), [
    'worker:force3d',
    'gpu-force',
    'd3force3d',
    'worker:jitter',
    'static',
  ]);
});

test('layout behavior updates layout config through public behavior methods', () => {
  const { helios, layout } = attachLayoutBehavior();

  layout.parameter('strength', 3.25);
  layout.parameter('recenter', false);
  layout.positionAttribute('embedding2d');
  layout.type('gpu-force');

  assert.equal(layout.parameter('strength'), 3.25);
  assert.equal(layout.positionAttribute(), 'embedding2d');
  assert.equal(layout.type(), 'gpu-force');
  assert.equal(helios.calls.layoutSet.at(-1), 'gpu-force');
});

test('layout behavior rebaselines heuristic parameter defaults after network changes', () => {
  const { helios } = attachLayoutBehavior();

  assert.equal(helios.states.get('layout.parameters.strength'), 1.5);
  assert.equal(helios.states.status('layout.parameters.strength').state, 'default');

  helios.layout().parameters.strength = 2.25;
  helios.emit('network:replaced', { reason: 'network-size-heuristic' });

  assert.equal(helios.states.get('layout.parameters.strength'), 2.25);
  assert.equal(helios.states.status('layout.parameters.strength').state, 'default');
  assert.deepEqual(helios.states.getOverrides(), {});

  helios.states.set('layout.parameters.strength', 3, { source: 'ui' });
  helios.layout().parameters.strength = 2.5;
  helios.emit('network:replaced', { reason: 'network-size-heuristic' });

  assert.equal(helios.states.get('layout.parameters.strength'), 3);
  assert.equal(helios.states.status('layout.parameters.strength').state, 'changed');
});

test('layout behavior defaults pause-on-interaction from active network size', () => {
  const small = attachLayoutBehavior();
  assert.equal(small.layout.pauseOnInteraction(), false);
  assert.equal(small.helios.states.get('layout.pauseOnInteraction'), false);

  const largeHelios = new MockHelios();
  largeHelios.network = { nodeCount: 1_000_000, nodeCapacity: 1_000_000 };
  const large = attachLayoutBehavior(largeHelios);
  assert.equal(large.layout.pauseOnInteraction(), true);
  assert.equal(largeHelios.states.get('layout.pauseOnInteraction'), true);
});

test('layout behavior temporarily pauses running dynamic layout on manual camera moves when enabled', async () => {
  const helios = new MockHelios();
  helios.network = { nodeCount: 1_000_000, nodeCapacity: 1_000_000 };
  const { layout } = attachLayoutBehavior(helios, { pauseOnInteractionResumeDelayMs: 40 });

  helios.emit('camera:move', { origin: 'program', action: 'pan' });
  assert.equal(layout.runState(), 'running');

  helios.emit('camera:move', { origin: 'interaction', action: 'pan' });
  assert.equal(layout.runState(), 'idle');
  assert.equal(helios.scheduler.layoutEnabled, false);

  await new Promise((resolve) => setTimeout(resolve, 20));
  helios.emit('camera:move', { origin: 'interaction', action: 'pan' });
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(layout.runState(), 'idle');

  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(layout.runState(), 'running');
  assert.equal(helios.scheduler.layoutEnabled, true);
});

test('layout behavior waits for pointer interaction to end before debounced resume', async () => {
  const helios = new MockHelios();
  helios.network = { nodeCount: 1_000_000, nodeCapacity: 1_000_000 };
  const { layout } = attachLayoutBehavior(helios, { pauseOnInteractionResumeDelayMs: 40 });

  dispatchCanvasEvent(helios, 'pointerdown', { pointerId: 1 });
  helios.emit('camera:move', { origin: 'interaction', action: 'rotate' });
  assert.equal(layout.runState(), 'idle');

  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(layout.runState(), 'idle');

  dispatchCanvasEvent(helios, 'pointerup', { pointerId: 1 });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(layout.runState(), 'running');
});

test('layout behavior respects explicit pause-on-interaction choices across network replacement', () => {
  const helios = new MockHelios();
  const { layout } = attachLayoutBehavior(helios);

  helios.network = { nodeCount: 1_200_000, nodeCapacity: 1_200_000 };
  helios.emit('network:replaced', { reason: 'large-network' });
  assert.equal(layout.pauseOnInteraction(), true);
  assert.equal(helios.states.get('layout.pauseOnInteraction'), true);
  assert.equal(helios.states.status('layout.pauseOnInteraction').state, 'default');

  layout.pauseOnInteraction(false);
  assert.equal(helios.states.status('layout.pauseOnInteraction').state, 'changed');
  helios.scheduler.state = 'running';
  helios.emit('camera:move', { origin: 'interaction', action: 'zoom' });
  assert.equal(layout.runState(), 'running');

  helios.emit('network:replaced', { reason: 'large-network-again' });
  assert.equal(layout.pauseOnInteraction(), false);

  layout.pauseOnInteraction(true);
  helios.emit('camera:move', { origin: 'interaction', action: 'zoom' });
  assert.equal(layout.runState(), 'idle');
  layout.pauseOnInteraction(false);
  assert.equal(layout.runState(), 'running');
});

test('layout behavior registers gpu-force chunk scheduling parameters as state entries', () => {
  const helios = new MockHelios();
  helios._layout = new MockLayout('gpu-force', {
    label: 'Force (GPU)',
    parameters: {
      strength: 1.5,
      recenter: true,
      layoutScheduling: 'auto',
      layoutChunkCount: 2,
    },
  });
  const { layout } = attachLayoutBehavior(helios);

  assert.equal(helios.states.get('layout.parameters.layoutScheduling'), 'auto');
  assert.equal(helios.states.status('layout.parameters.layoutScheduling').state, 'default');
  assert.equal(helios.states.get('layout.parameters.layoutChunkCount'), 2);
  assert.equal(helios.states.status('layout.parameters.layoutChunkCount').state, 'default');

  helios.states.set('layout.parameters.layoutScheduling', 'chunked', { source: 'ui' });
  helios.states.set('layout.parameters.layoutChunkCount', 6, { source: 'ui' });

  assert.equal(layout.parameter('layoutScheduling'), 'chunked');
  assert.equal(layout.parameter('layoutChunkCount'), 6);
  assert.equal(helios.states.status('layout.parameters.layoutScheduling').state, 'changed');
  assert.equal(helios.states.status('layout.parameters.layoutChunkCount').state, 'changed');
});

test('layout behavior start stop reheat and reset delegate to lower layers without owning engines', () => {
  const { helios, layout } = attachLayoutBehavior();

  layout.stop('manual-pause');
  layout.start();
  layout.reheat('manual-reheat');
  layout.positionAttribute('embedding3d');
  const resetResult = layout.reset({ reason: 'manual-reset' });

  assert.equal(resetResult, true);
  assert.deepEqual(helios.calls.stop, ['manual-pause']);
  assert.equal(helios.calls.start >= 2, true);
  assert.deepEqual(helios.calls.positionAttributes, ['embedding3d']);
  assert.deepEqual(helios.layout().reheatCalls, ['manual-reheat', 'manual-reset']);
  assert.equal(helios.layout().seedCalls >= 1, true);
});

test('layout behavior serializes and restores public layout config', () => {
  const { layout } = attachLayoutBehavior();
  layout.type('gpu-force', { preserveRunState: false });
  layout.parameter('strength', 4.5);
  layout.parameter('recenter', false);
  layout.positionAttribute('embedding2d');
  layout.stop('serialize-test');
  const snapshot = layout.serialize();

  const { helios: restoredHelios, layout: restored } = attachLayoutBehavior();
  restored.restore(snapshot);

  assert.equal(restored.type(), 'gpu-force');
  assert.equal(restored.positionAttribute(), '_helios_visuals_position');
  assert.equal(restored.parameter('strength'), 4.5);
  assert.equal(restored.parameter('recenter'), false);
  assert.equal(restored.runState(), 'stopped');
  assert.deepEqual(restoredHelios.calls.stop, ['restore']);
});

test('layout position source is an action input, not a tracked state entry', () => {
  const { helios, layout } = attachLayoutBehavior();

  assert.equal(helios.states.entry('layout.positionAttribute'), null);
  layout.positionAttribute('embedding2d');

  assert.equal(layout.positionAttribute(), 'embedding2d');
  assert.equal(helios.states.entry('layout.positionAttribute'), null);
  assert.equal(helios.states.status('layout.positionAttribute').state, 'default');
  assert.equal(Object.hasOwn(helios.states.getOverrides({ aliases: 'preferred' }), 'layout.positionAttribute'), false);
});

function createFakeDomEnvironment() {
  class FakeClassList {
    constructor(owner) {
      this.owner = owner;
      this.classes = new Set();
    }

    add(...names) {
      for (const name of names) {
        if (!name) continue;
        this.classes.add(String(name));
      }
      this.owner.className = Array.from(this.classes).join(' ');
    }

    contains(name) {
      return this.classes.has(String(name));
    }
  }

  class FakeStyle {
    constructor() {
      this.display = '';
    }

    setProperty(name, value) {
      this[name] = value;
    }
  }

  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.className = '';
      this.classList = new FakeClassList(this);
      this.style = new FakeStyle();
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this.textContent = '';
      this.value = '';
      this.type = '';
      this.hidden = false;
      this.disabled = false;
      this.checked = false;
    }

    appendChild(child) {
      if (!child) return child;
      child.parentNode = this;
      this.children.push(child);
      return child;
    }

    replaceChildren(...children) {
      this.children = [];
      for (const child of children) this.appendChild(child);
    }

    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }

    setAttribute(name, value) {
      this.attributes.set(String(name), String(value));
    }

    getAttribute(name) {
      return this.attributes.get(String(name)) ?? null;
    }

    removeAttribute(name) {
      this.attributes.delete(String(name));
    }

    addEventListener(type, handler) {
      const key = String(type);
      const list = this.listeners.get(key) ?? [];
      list.push(handler);
      this.listeners.set(key, list);
    }

    removeEventListener(type, handler) {
      const key = String(type);
      const list = this.listeners.get(key) ?? [];
      this.listeners.set(key, list.filter((entry) => entry !== handler));
    }

    dispatchEvent(event) {
      const list = this.listeners.get(event.type) ?? [];
      for (const handler of list) handler(event);
      return true;
    }

    querySelector() {
      return null;
    }

    blur() {}
  }

  const document = {
    activeElement: null,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    createElementNS(_namespace, tagName) {
      return new FakeElement(tagName);
    },
  };

  const window = {
    setInterval,
    clearInterval,
  };

  return { document, window };
}

function findFirst(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const match = findFirst(child, predicate);
    if (match) return match;
  }
  return null;
}

test('layout panel routes layout controls through LayoutBehavior', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = window;

  try {
    const behaviorCalls = [];
    const layoutBehavior = {
      descriptor() {
        return { key: 'worker:force3d', label: 'Force (worker)', dynamic: true, bindings: [] };
      },
      choices() {
        return [
          { value: 'worker:force3d', label: 'Force (worker)' },
          { value: 'static', label: 'Static (no layout)' },
        ];
      },
      runState() {
        return 'running';
      },
      positionAttribute() {
        return 'embedding2d';
      },
      positionAttributeChoices() {
        return [
          { value: '_helios_visuals_position', label: 'Current positions', dimension: 3 },
          { value: 'embedding2d', label: 'embedding2d (2D)', dimension: 2 },
        ];
      },
      positionAttribute(value) {
        if (arguments.length === 0) return 'embedding2d';
        behaviorCalls.push(['positionAttribute', value]);
      },
      applyPositionAttribute(value) {
        behaviorCalls.push(['applyPositionAttribute', value]);
        return true;
      },
      type(value) {
        behaviorCalls.push(['type', value]);
      },
      stop(reason) {
        behaviorCalls.push(['stop', reason]);
      },
      start() {
        behaviorCalls.push(['start']);
      },
      reheat(reason) {
        behaviorCalls.push(['reheat', reason]);
      },
      on() {
        return () => {};
      },
    };

    const helios = {
      behavior: { layout: layoutBehavior },
      on() {
        return () => {};
      },
    };

    const ui = {
      helios,
      _controlCleanups: new Set(),
      createPanel(config) {
        return {
          ...config,
          destroy() {},
        };
      },
    };

    const panel = new LayoutPanel(ui, {}).create();
    try {
      const layoutSelect = findFirst(panel.content, (element) => element.tagName === 'SELECT');
      const positionSelect = findFirst(
        panel.content,
        (element) => element.tagName === 'SELECT' && element !== layoutSelect,
      );
      const runButton = findFirst(panel.content, (element) => element.tagName === 'BUTTON');

      assert.ok(layoutSelect);
      assert.ok(positionSelect);
      assert.ok(runButton);

      layoutSelect.value = 'static';
      layoutSelect.dispatchEvent(new Event('change'));
      positionSelect.value = 'embedding2d';
      positionSelect.dispatchEvent(new Event('change'));
      runButton.dispatchEvent(new Event('click'));

      assert.deepEqual(behaviorCalls, [
        ['type', 'static'],
        ['stop', 'ui:layout-panel'],
        ['positionAttribute', 'embedding2d'],
        ['applyPositionAttribute', 'embedding2d'],
        ['stop', 'ui:layout-panel'],
      ]);
    } finally {
      panel.destroy();
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test('layout panel writes pause-on-interaction through behavior and state', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = window;

  try {
    const behaviorCalls = [];
    const writes = [];
    let pauseOnInteraction = false;
    const layoutBehavior = {
      descriptor() {
        return { key: 'worker:force3d', label: 'Force (worker)', dynamic: true, bindings: [] };
      },
      choices() {
        return [{ value: 'worker:force3d', label: 'Force (worker)' }];
      },
      runState() {
        return 'running';
      },
      positionAttribute() {
        return '_helios_visuals_position';
      },
      positionAttributeChoices() {
        return [{ value: '_helios_visuals_position', label: 'Current positions', dimension: 3 }];
      },
      pauseOnInteraction(value) {
        if (arguments.length === 0) return pauseOnInteraction;
        pauseOnInteraction = value === true;
        behaviorCalls.push(['pauseOnInteraction', pauseOnInteraction]);
      },
      on() {
        return () => {};
      },
    };

    const ui = {
      helios: {
        behavior: { layout: layoutBehavior },
        on() {
          return () => {};
        },
      },
      _controlCleanups: new Set(),
      registerStateControl() {},
      writeStateControl(path, value, options) {
        writes.push({ path, value, options });
      },
      createPanel(config) {
        return {
          ...config,
          destroy() {},
        };
      },
    };

    const panel = new LayoutPanel(ui, {}).create();
    try {
      const toggle = findFirst(
        panel.content,
        (element) => element.dataset?.testid === 'controls-layout-pause-on-input',
      );
      assert.ok(toggle);
      assert.equal(toggle.checked, false);

      toggle.dispatchEvent(new Event('click'));

      assert.equal(pauseOnInteraction, true);
      assert.deepEqual(behaviorCalls, [
        ['pauseOnInteraction', true],
      ]);
      assert.deepEqual(writes.at(-1), {
        path: 'layout.pauseOnInteraction',
        value: true,
        options: {
          scope: 'network',
          source: 'ui',
          reason: 'layout-pause-on-input',
          debounceMs: 150,
        },
      });
    } finally {
      panel.destroy();
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test('layout panel status button activates on primary pointerup and suppresses the following click', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = window;

  try {
    const behaviorCalls = [];
    const layoutBehavior = {
      descriptor() {
        return { key: 'worker:force3d', label: 'Force (worker)', dynamic: true, bindings: [] };
      },
      choices() {
        return [{ value: 'worker:force3d', label: 'Force (worker)' }];
      },
      runState() {
        return 'running';
      },
      positionAttribute() {
        return '_helios_visuals_position';
      },
      positionAttributeChoices() {
        return [{ value: '_helios_visuals_position', label: 'Current positions', dimension: 3 }];
      },
      stop(reason) {
        behaviorCalls.push(['stop', reason]);
      },
      on() {
        return () => {};
      },
    };

    const ui = {
      helios: {
        behavior: { layout: layoutBehavior },
        on() {
          return () => {};
        },
      },
      _controlCleanups: new Set(),
      createPanel(config) {
        return {
          ...config,
          destroy() {},
        };
      },
    };

    const panel = new LayoutPanel(ui, {}).create();
    try {
      const runButton = findFirst(panel.content, (element) => element.tagName === 'BUTTON');
      assert.ok(runButton);

      runButton.dispatchEvent({ type: 'pointerup', button: 0 });
      runButton.dispatchEvent(new Event('click'));
      runButton.dispatchEvent({ type: 'pointerup', button: 1 });

      assert.deepEqual(behaviorCalls, [
        ['stop', 'ui:layout-panel'],
      ]);
    } finally {
      panel.destroy();
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test('layout panel keeps slider controls stable across non-structural behavior changes', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = window;

  try {
    let onChange = null;
    const layoutBehavior = {
      descriptor() {
        return {
          key: 'gpu-force',
          label: 'Force (GPU)',
          dynamic: true,
          bindings: [
            {
              key: 'alphaMin',
              label: 'Temp. min',
              type: 'number',
              scale: 'log',
              notation: 'scientific',
              sliderMin: 0.000001,
              sliderMax: 1,
              inputMin: 0,
              inputMax: 1,
              sliderStep: 0.01,
              get: () => 1,
              set() {},
            },
          ],
        };
      },
      choices() {
        return [{ value: 'gpu-force', label: 'Force (GPU)' }];
      },
      runState() {
        return 'idle';
      },
      positionAttribute() {
        return '_helios_visuals_position';
      },
      positionAttributeChoices() {
        return [{ value: '_helios_visuals_position', label: 'Current positions', dimension: 3 }];
      },
      on(type, handler) {
        if (type === 'change') onChange = handler;
        return () => {};
      },
    };

    const helios = {
      behavior: { layout: layoutBehavior },
      on() {
        return () => {};
      },
    };

    const ui = {
      helios,
      _controlCleanups: new Set(),
      createPanel(config) {
        return {
          ...config,
          destroy() {},
        };
      },
    };

    const panel = new LayoutPanel(ui, {}).create();
    try {
      const initialSlider = findFirst(
        panel.content,
        (element) => element.tagName === 'INPUT' && element.type === 'range',
      );
      assert.ok(initialSlider);
      document.activeElement = initialSlider;

      onChange?.(new Event('change'));

      const refreshedSlider = findFirst(
        panel.content,
        (element) => element.tagName === 'INPUT' && element.type === 'range',
      );
      assert.equal(refreshedSlider, initialSlider);
    } finally {
      panel.destroy();
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test('layout panel registers parameter persistence defaults before writing changes', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = window;

  try {
    let strength = 1.5;
    const registered = [];
    const writes = [];
    const layoutBehavior = {
      descriptor() {
        return {
          key: 'gpu-force',
          label: 'Force (GPU)',
          dynamic: true,
          bindings: [
            {
              key: 'strength',
              label: 'Strength',
              type: 'number',
              min: 0,
              max: 10,
              sliderMin: 0,
              sliderMax: 10,
              step: 0.1,
              get: () => strength,
              set(value) {
                strength = Number(value);
              },
            },
          ],
        };
      },
      choices() {
        return [{ value: 'gpu-force', label: 'Force (GPU)' }];
      },
      runState() {
        return 'idle';
      },
      positionAttribute() {
        return '_helios_visuals_position';
      },
      positionAttributeChoices() {
        return [{ value: '_helios_visuals_position', label: 'Current positions', dimension: 3 }];
      },
      parameter(key, value) {
        if (key === 'strength' && arguments.length > 1) strength = Number(value);
        return strength;
      },
      emitChange() {},
      on() {
        return () => {};
      },
    };

    const ui = {
      helios: {
        behavior: { layout: layoutBehavior },
        on() {
          return () => {};
        },
      },
      _controlCleanups: new Set(),
      persistenceIndicators: true,
      registerStateControl(path, options) {
        registered.push({ path, options });
      },
      writeStateControl(path, value, options) {
        writes.push({ path, value, options });
      },
      createStateIndicator(path, scope) {
        const indicator = document.createElement('span');
        indicator.dataset.path = path;
        indicator.dataset.scope = scope;
        return indicator;
      },
      createPanel(config) {
        return {
          ...config,
          destroy() {},
        };
      },
    };

    const panel = new LayoutPanel(ui, {}).create();
    try {
      const strengthRegistration = registered.find((entry) => entry.path === 'layout.parameters.strength');
      assert.ok(strengthRegistration);
      assert.equal(strengthRegistration.options.defaultValue, 1.5);

      const strengthInput = findFirst(
        panel.content,
        (element) => element.tagName === 'INPUT' && element.type === 'number',
      );
      assert.ok(strengthInput);
      strengthInput.value = '2.5';
      strengthInput.dispatchEvent(new Event('change'));

      assert.equal(strength, 2.5);
      assert.deepEqual(writes.at(-1), {
        path: 'layout.parameters.strength',
        value: 2.5,
        options: {
          scope: 'network',
          source: 'ui',
          reason: 'layout-parameter',
          debounceMs: 220,
        },
      });
      const strengthRegistrations = registered.filter((entry) => entry.path === 'layout.parameters.strength');
      assert.equal(strengthRegistrations.at(-1).options.defaultValue, undefined);
    } finally {
      panel.destroy();
    }
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test('layout panel parameter state entries ignore broad runtime layout refresh events', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalWarn = console.warn;
  globalThis.document = document;
  globalThis.window = window;

  try {
    let sampleCount3D = 96;
    let onChange = null;
    const warnings = [];
    console.warn = (...args) => {
      warnings.push(args.map((entry) => String(entry)).join(' '));
    };
    const stateManager = new HeliosStateManager();
    const layoutBehavior = {
      descriptor() {
        return {
          key: 'gpu-force',
          label: 'Force (GPU)',
          dynamic: true,
          bindings: [
            {
              key: 'sampleCount3D',
              label: 'Samples (3D)',
              type: 'number',
              min: 1,
              max: 512,
              get: () => sampleCount3D,
              set(value) {
                sampleCount3D = Number(value);
              },
            },
          ],
        };
      },
      choices() {
        return [{ value: 'gpu-force', label: 'Force (GPU)' }];
      },
      runState() {
        return 'running';
      },
      positionAttribute() {
        return '_helios_visuals_position';
      },
      positionAttributeChoices() {
        return [{ value: '_helios_visuals_position', label: 'Current positions', dimension: 3 }];
      },
      parameter(key, value) {
        if (key === 'sampleCount3D' && arguments.length > 1) sampleCount3D = Number(value);
        return sampleCount3D;
      },
      on(type, handler) {
        if (type === 'change') onChange = handler;
        return () => {};
      },
    };

    const ui = {
      helios: {
        behavior: { layout: layoutBehavior },
        states: stateManager,
        on() {
          return () => {};
        },
      },
      _controlCleanups: new Set(),
      persistenceIndicators: true,
      createStateIndicator(path, scope) {
        const indicator = document.createElement('span');
        indicator.dataset.path = path;
        indicator.dataset.scope = scope;
        return indicator;
      },
      createPanel(config) {
        return {
          ...config,
          destroy() {},
        };
      },
    };

    const panel = new LayoutPanel(ui, {}).create();
    try {
      assert.ok(stateManager.entry('layout.parameters.sampleCount3D'));

      onChange?.({
        detail: {
          reason: 'layout-start',
          source: 'refresh',
          trackOverride: false,
        },
      });
      onChange?.({
        detail: {
          reason: 'layout-stop',
          source: 'refresh',
          trackOverride: false,
        },
      });

      assert.equal(
        warnings.some((warning) => warning.includes('Ignoring broad explicit binding notification')),
        false,
      );
      assert.equal(
        stateManager.status('layout.parameters.sampleCount3D', { ignorePersistence: true })?.hasOverride,
        false,
      );
    } finally {
      panel.destroy();
    }
  } finally {
    console.warn = originalWarn;
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});
