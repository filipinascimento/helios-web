import test from 'node:test';
import assert from 'node:assert/strict';
import { DummyStorageManager, Helios, HeliosStateManager } from '../src/index.js';
import {
  AppearanceBehavior,
  BEHAVIOR_IDS,
  Behavior,
  BehaviorManager,
  BehaviorRegistry,
  ExporterBehavior,
  FilterBehavior,
  HoverBehavior,
  InterfaceBehavior,
  LayoutBehavior,
  LegendsBehavior,
  LabelsBehavior,
  MappersBehavior,
  SelectionBehavior,
  createDefaultBehaviorRegistry,
} from '../src/behaviors/index.js';
import { MapperCollection } from '../src/pipeline/Mapper.js';
import { HeliosFilter } from '../src/filters/HeliosFilter.js';

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = null;
    this.states = new HeliosStateManager({ helios: this });
    this.nodeMapper = new MapperCollection('node', null, () => this.emit('mappers:changed', {}));
    this.edgeMapper = new MapperCollection('edge', null, () => this.emit('mappers:changed', {}));
    this._activeHeliosFilter = null;
    this._graphFilter = {
      enabled: false,
      scope: 'render',
      options: null,
      nodeCount: 0,
      edgeCount: 0,
      baseNodeCount: 0,
      baseEdgeCount: 0,
      error: null,
    };
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

  getGraphFilter() {
    return {
      ...this._graphFilter,
      options: this._graphFilter.options ? { ...this._graphFilter.options } : null,
    };
  }

  clearGraphFilter() {
    this._activeHeliosFilter = null;
    this._graphFilter = {
      ...this._graphFilter,
      enabled: false,
      scope: 'render',
      options: null,
    };
    this.emit('graph:filter-changed', this.getGraphFilter());
    return this;
  }

  setGraphFilter(options) {
    const normalized = options instanceof HeliosFilter ? options.toGraphFilterOptions() : options;
    this._activeHeliosFilter = options instanceof HeliosFilter ? options : null;
    this._graphFilter = {
      ...this._graphFilter,
      enabled: true,
      scope: normalized?.scope ?? 'render',
      options: { ...normalized, scope: normalized?.scope ?? 'render' },
      nodeCount: 3,
      edgeCount: 2,
      baseNodeCount: 4,
      baseEdgeCount: 3,
      error: null,
    };
    this.emit('graph:filter-changed', this.getGraphFilter());
    return this;
  }

  activateHeliosFilter(filter) {
    this._activeHeliosFilter = filter;
    return this.setGraphFilter(filter);
  }

  getActiveHeliosFilter() {
    return this._activeHeliosFilter;
  }
}

class ProbeBehavior extends Behavior {
  static id = 'probe';

  constructor(options = {}) {
    super(options);
    this.attachCount = 0;
    this.detachCount = 0;
  }

  attach(context) {
    super.attach(context);
    this.attachCount += 1;
    this.addCleanup(context.subscribe(context.helios, 'probe:event', () => {
      this.emit('change', { observed: true });
    }));
    return this;
  }

  detach() {
    this.detachCount += 1;
    return super.detach();
  }
}

class PersistentProbeBehavior extends ProbeBehavior {
  static id = 'persistent-probe';

  constructor(options = {}) {
    super(options);
    this.value = options.value ?? 1;
  }

  stateEntries() {
    return {
      value: {
        default: 1,
        type: 'number',
        getter: () => this.value,
        setter: (value) => {
          this.value = Number(value);
          this.emit('change', { reason: 'storage-set' });
        },
        subscribe: (notify) => this.on('change', () => notify()),
      },
    };
  }
}

test('behavior manager registers and reuses built-in behaviors by name', () => {
  const helios = new MockHelios();
  const registry = new BehaviorRegistry()
    .register('appearance', AppearanceBehavior)
    .register('exporter', ExporterBehavior)
    .register('mappers', MappersBehavior)
    .register('filters', FilterBehavior)
    .register('interface', InterfaceBehavior)
    .register('layout', LayoutBehavior)
    .register('legends', LegendsBehavior)
    .register('labels', LabelsBehavior)
    .register('hover', HoverBehavior)
    .register('selection', SelectionBehavior)
    .register('probe', ProbeBehavior);
  const manager = new BehaviorManager(helios, registry);

  const labels = manager.use('labels', { enabled: true, maxVisible: 42 });
  const mappers = manager.use('mappers');
  const filters = manager.use('filters');
  const selection = manager.use('selection', { nodeClick: false });
  const hover = manager.use('hover', { hoverLabel: false });
  const reused = manager.use('selection', { edgeClick: true });

  assert.equal(selection, reused);
  assert.equal(manager.get('labels'), labels);
  assert.equal(manager.get('selection'), selection);
  assert.equal(manager.get('hover'), hover);
  assert.equal(manager.get('mappers'), mappers);
  assert.equal(manager.get('filters'), filters);
  assert.equal(labels.state.enabled, true);
  assert.equal(labels.state.maxVisible, 42);
  assert.equal(selection.state.nodeClick, false);
  assert.equal(selection.state.edgeClick, true);
  assert.equal(hover.state.hoverLabel, false);
});

test('Helios default behavior initialization attaches built-ins and applies options', () => {
  const helios = new MockHelios();
  Object.assign(helios, {
    options: {
      labels: { enabled: true, source: 'label' },
    },
    behaviors: new BehaviorManager(helios, createDefaultBehaviorRegistry()),
    useBehavior: Helios.prototype.useBehavior,
  });

  Helios.prototype._initializeDefaultBehaviors.call(helios, {
    hover: { edgeHover: true },
    filters: false,
  });

  const attached = new Set(helios.behaviors.entries().map(([id]) => id));
  for (const id of BEHAVIOR_IDS) {
    if (id === 'filters') {
      assert.equal(attached.has(id), false);
    } else {
      assert.equal(attached.has(id), true, `${id} should be attached by default`);
    }
  }
  assert.equal(helios.behaviors.get('labels').state.enabled, true);
  assert.equal(helios.behaviors.get('labels').state.source, 'label');
  assert.equal(helios.behaviors.get('hover').state.edgeHover, true);
});

test('behavior manager attaches and detaches instantiated custom behaviors', () => {
  const helios = new MockHelios();
  const registry = new BehaviorRegistry().register('probe', ProbeBehavior);
  const manager = new BehaviorManager(helios, registry);
  const probe = new ProbeBehavior();

  manager.use(probe);
  assert.equal(probe.attachCount, 1);
  assert.equal(manager.get('probe'), probe);

  let observed = false;
  probe.on('change', () => {
    observed = true;
  });
  helios.emit('probe:event', {});
  assert.equal(observed, true);

  assert.equal(manager.detach('probe'), true);
  assert.equal(probe.detachCount, 1);
  assert.equal(manager.get('probe'), null);
});

test('behavior manager destroy detaches active behavior cleanups', () => {
  const helios = new MockHelios();
  const registry = new BehaviorRegistry().register('probe', ProbeBehavior);
  const manager = new BehaviorManager(helios, registry);
  const probe = manager.use('probe');

  manager.destroy();

  assert.equal(probe.detachCount, 1);
  assert.equal(manager.get('probe'), null);
  assert.equal(manager.helios, null);
  assert.equal(manager.ui, null);
});

test('behavior manager registers behavior stateEntries with helios.states', () => {
  const helios = new MockHelios();
  helios.storage = new DummyStorageManager({ helios, states: helios.states });
  const registry = new BehaviorRegistry().register('persistent-probe', PersistentProbeBehavior);
  const manager = new BehaviorManager(helios, registry);

  const probe = manager.use('persistent-probe', { value: 3 });
  assert.equal(helios.states.get('behaviors.persistent-probe.value'), 3);

  helios.states.set('behaviors.persistent-probe.value', 7);
  assert.equal(probe.value, 7);
  assert.equal(helios.states.status('behaviors.persistent-probe.value').state, 'changed');

  manager.detach('persistent-probe');
  assert.equal(helios.states.entry('behaviors.persistent-probe.value'), null);
});

test('built-in behaviors expose state entries for durable state', () => {
  const entries = {
    appearance: new AppearanceBehavior().stateEntries(),
    filters: new FilterBehavior().stateEntries(),
    layout: new LayoutBehavior().stateEntries(),
    legends: new LegendsBehavior().stateEntries(),
    labels: new LabelsBehavior().stateEntries(),
    mappers: new MappersBehavior().stateEntries(),
    selection: new SelectionBehavior().stateEntries(),
  };

  assert.ok(entries.appearance.state);
  assert.ok(entries.appearance.nodeStyle);
  assert.ok(entries.filters.rules);
  assert.ok(entries.layout.parameters);
  assert.ok(entries.legends.enabled);
  assert.ok(entries.labels.mode);
  assert.ok(entries.labels.fontFamily);
  assert.ok(entries.labels.fill);
  assert.ok(entries.mappers.node);
  assert.ok(entries.mappers['node.color']);
  assert.ok(entries.mappers['edge.width']);
  assert.ok(entries.selection.selectedNodes);
  assert.ok(entries.selection.selectedEdges);
  assert.ok(entries.selection.nodeClick);
  assert.ok(entries.selection['selectors.node.rules']);
  assert.deepEqual(entries.layout.parameters.aliases, ['layout.parameters']);
  assert.deepEqual(entries.legends.enabled.aliases, ['legends.enabled']);
  assert.deepEqual(entries.filters.rules.aliases, ['filters.rules']);
  assert.deepEqual(entries.labels.enabled.aliases, ['labels.enabled']);
  assert.deepEqual(entries.labels.fontFamily.aliases, ['labels.fontFamily']);
  assert.deepEqual(entries.mappers.node.aliases, ['mappers.node']);
  assert.deepEqual(entries.mappers['node.color'].aliases, ['mappers.node.color']);
  assert.deepEqual(entries.selection.selectedNodes.aliases, ['selection.selectedNodes']);
  assert.deepEqual(entries.selection['selectors.node.rules'].aliases, ['selection.selectors.node.rules']);
  assert.equal(Object.prototype.hasOwnProperty.call(entries.filters, 'state'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(entries.mappers, 'state'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(entries.selection, 'state'), false);
  assert.deepEqual(entries.appearance.nodeSizeScale.aliases, ['appearance.nodeStyle.sizeScale']);
  assert.deepEqual(entries.appearance.shadedEnabled.aliases, ['appearance.shaded.enabled']);
  assert.equal(entries.appearance.edgeAdaptiveQualitySlowFrameThresholdMs.ui.label, 'Slow Frame Threshold');
  assert.equal(entries.appearance.edgeAdaptiveQualityProbeIntervalMs.ui.label, 'Probe Interval');
  assert.equal(entries.appearance.shadedAmbientTopColor.ui.label, 'Ambient Top');
  assert.equal(entries.appearance.ambientOcclusionIntensityScale.ui.label, 'Fast Scale');

  for (const [id, stateEntries] of Object.entries(entries)) {
    for (const [key, entry] of Object.entries(stateEntries)) {
      assert.equal(Object.prototype.hasOwnProperty.call(entry, 'panel'), false, `${id}.${key} should not define panel`);
      assert.equal(Object.prototype.hasOwnProperty.call(entry, 'section'), false, `${id}.${key} should not define section`);
      assert.equal(Object.prototype.hasOwnProperty.call(entry.ui ?? {}, 'panel'), false, `${id}.${key}.ui should not define panel`);
      assert.equal(Object.prototype.hasOwnProperty.call(entry.ui ?? {}, 'section'), false, `${id}.${key}.ui should not define section`);
    }
  }
});

test('complex behavior state entries dirty stable keys across programmatic, UI-style, and restore writes', () => {
  const helios = new MockHelios();
  helios.storage = new DummyStorageManager({ helios, states: helios.states });
  const registry = new BehaviorRegistry()
    .register('mappers', MappersBehavior)
    .register('filters', FilterBehavior)
    .register('labels', LabelsBehavior)
    .register('selection', SelectionBehavior);
  const manager = new BehaviorManager(helios, registry);
  helios.behaviors = manager;

  const mappers = manager.use('mappers');
  const filters = manager.use('filters');
  const labels = manager.use('labels');
  const selection = manager.use('selection');

  mappers.setChannelConfig('node', 'color', {
    type: 'constant',
    value: '#ff0000ff',
  });
  assert.equal(helios.states.status('mappers.node.color').state, 'changed');
  assert.equal(helios.states.getOverrides({ aliases: 'preferred' })['mappers.node.color'].type, 'constant');
  assert.equal(helios.states.getOverrides({ aliases: 'preferred' })['mappers.node.color'].value, '#ff0000ff');

  helios.states.reset('mappers.node.color');
  helios.states.set('mappers.node.color', {
    type: 'constant',
    value: '#00ff00ff',
  }, { source: 'ui' });
  assert.equal(mappers.getSerializedChannelConfig('node', 'color').value, '#00ff00ff');
  assert.equal(helios.states.status('mappers.node.color').state, 'changed');

  filters.replaceRules({
    nodeRules: [{ scope: 'node', type: 'query', query: 'degree > 3' }],
  });
  assert.equal(helios.states.status('filters.rules').state, 'changed');
  helios.states.set('filters.scope', 'render+layout', { source: 'ui' });
  assert.equal(filters.state.scope, 'render+layout');
  assert.equal(helios.states.status('filters.scope').state, 'changed');

  selection.selectNodes([1, 2], { mode: 'replace' });
  assert.deepEqual(helios.states.get('selection.selectedNodes'), [1, 2]);
  assert.equal(helios.states.status('selection.selectedNodes').state, 'changed');
  selection.setSelectorRules([{ scope: 'node', type: 'query', query: 'score > 0' }]);
  assert.equal(helios.states.status('selection.selectors.node.rules').state, 'changed');

  labels.fontFamily('Menlo, monospace');
  assert.equal(helios.states.status('labels.fontFamily').state, 'changed');
  helios.states.set('labels.fill', '#123456ff', { source: 'ui' });
  assert.equal(labels.fill(), '#123456ff');
  assert.equal(helios.states.status('labels.fill').state, 'changed');

  helios.storage.restoreSnapshot({
    state: {
      overrides: {
        'mappers.edge.width': { type: 'constant', value: 4 },
        'filters.rules': [{ scope: 'edge', type: 'query', query: 'weight > 1' }],
        'selection.selectedEdges': [0],
        'labels.outlineColor': '#abcdefcc',
      },
    },
  });
  assert.equal(mappers.getSerializedChannelConfig('edge', 'width').value, 4);
  assert.equal(filters.state.rules[0].scope, 'edge');
  assert.deepEqual(helios.states.get('selection.selectedEdges'), [0]);
  assert.equal(labels.outlineColor(), '#abcdefcc');
  assert.equal(helios.states.status('mappers.edge.width').state, 'changed');
  assert.equal(helios.states.status('filters.rules').state, 'changed');
  assert.equal(helios.states.status('selection.selectedEdges').state, 'changed');
  assert.equal(helios.states.status('labels.outlineColor').state, 'changed');
});

test('layout parameter state entries keep programmatic, UI-style, and restore writes on the same key', () => {
  let gravity = 0.5;
  let eta = 0.04;
  const fakeLayout = {
    getParameterBindings() {
      return {
        key: 'worker:force3d',
        label: 'Force (worker)',
        dynamic: true,
        bindings: [
          {
            key: 'gravity',
            label: 'Gravity',
            type: 'number',
            min: 0,
            max: 1,
            step: 0.01,
            get: () => gravity,
            set: (value) => { gravity = Number(value); },
          },
          {
            key: 'eta',
            type: 'number',
            min: 0.001,
            max: 1,
            step: 0.001,
            get: () => eta,
            set: (value) => { eta = Number(value); },
          },
        ],
      };
    },
  };
  const helios = new MockHelios();
  helios.layout = () => fakeLayout;
  helios.scheduler = { getLayoutState: () => 'stopped' };
  helios.storage = new DummyStorageManager({ helios, states: helios.states });
  const layout = new LayoutBehavior();
  layout.attach({
    helios,
    manager: { helios },
    subscribe: () => () => {},
  });
  helios.states.register(layout, 'behaviors.layout', layout.stateEntries());

  assert.equal(helios.states.entry('layout.parameters.gravity').key, 'behaviors.layout.parameters.gravity');
  assert.equal(helios.states.entry('layout.parameters.gravity').ui.label, 'Gravity');
  assert.equal(helios.states.entry('layout.parameters.eta').ui.label, 'Step Rate');

  layout.parameter('gravity', 0.7);
  assert.equal(helios.states.status('layout.parameters.gravity').state, 'changed');
  assert.deepEqual(helios.states.getOverrides({ aliases: 'preferred' }), {
    'layout.parameters.gravity': 0.7,
  });

  helios.states.reset('layout.parameters.gravity');
  assert.equal(gravity, 0.5);
  helios.states.set('layout.parameters.gravity', 0.8, { source: 'ui' });
  assert.equal(gravity, 0.8);
  assert.deepEqual(helios.states.getOverrides({ aliases: 'preferred' }), {
    'layout.parameters.gravity': 0.8,
  });

  helios.states.reset('layout.parameters.gravity');
  helios.storage.restoreSnapshot({
    state: {
      overrides: {
        'layout.parameters.gravity': 0.65,
      },
    },
  });
  assert.equal(gravity, 0.65);
  assert.equal(helios.states.status('layout.parameters').state, 'partial');
  assert.deepEqual(helios.states.getOverrides({ aliases: 'preferred' }), {
    'layout.parameters.gravity': 0.65,
  });
});

function makeDestroyHarness(options = {}) {
  const calls = [];
  const helios = Object.create(Helios.prototype);
  Object.assign(helios, {
    _destroyed: false,
    _autoCleanupObserver: { disconnect: () => calls.push('disconnect') },
    options,
    scheduler: { stop: () => calls.push('scheduler.stop') },
    behaviors: { destroy: () => calls.push('behaviors.destroy') },
    _edgeAdaptiveRuntime: {},
    _activePositionDelegate: null,
    _positionsConfig: { delegate: null },
    _layout: { dispose: () => calls.push('layout.dispose') },
    _listenHandlers: new Map(),
    _pendingGraphLayerProps: new Map(),
    _pendingRendererProps: new Map(),
    removeResizeListener: () => calls.push('resize.remove'),
    _pickingListenersAttached: false,
    attributeTracker: { destroy: () => calls.push('attributeTracker.destroy') },
    indexPickingTracker: { destroy: () => calls.push('indexPickingTracker.destroy') },
    renderer: { destroy: () => calls.push('renderer.destroy') },
    _densityLayer: {},
    _labels: { destroy: () => calls.push('labels.destroy') },
    _legends: { destroy: () => calls.push('legends.destroy') },
    network: { dispose: () => calls.push('network.dispose') },
    layers: { destroy: () => calls.push('layers.destroy') },
  });
  return { helios, calls };
}

test('Helios destroy tears down behaviors and owned network once', () => {
  const { helios, calls } = makeDestroyHarness();

  helios.destroy();
  helios.destroy();

  assert.deepEqual(calls.filter((call) => call === 'behaviors.destroy'), ['behaviors.destroy']);
  assert.deepEqual(calls.filter((call) => call === 'network.dispose'), ['network.dispose']);
  assert.deepEqual(calls.filter((call) => call === 'layers.destroy'), ['layers.destroy']);
  assert.equal(helios.network, null);
});

test('Helios destroy can leave caller-owned network alive', () => {
  const { helios, calls } = makeDestroyHarness({ disposeNetworkOnDestroy: false });

  helios.destroy();

  assert.equal(calls.includes('network.dispose'), false);
  assert.equal(helios.network, null);
});

test('Helios auto cleanup destroys when its root is removed', () => {
  const previousMutationObserver = globalThis.MutationObserver;
  const observers = [];
  globalThis.MutationObserver = class MutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      this.disconnected = false;
      observers.push(this);
    }

    observe(target, options) {
      this.observed.push({ target, options });
    }

    disconnect() {
      this.disconnected = true;
    }
  };

  try {
    const { helios, calls } = makeDestroyHarness();
    const parent = {};
    const root = { contains: (node) => node === root };
    const container = {
      parentNode: parent,
      contains: (node) => node === root || node === container,
    };
    helios._autoCleanupObserver = null;
    helios.layers.root = root;
    helios.layers.container = container;

    helios._setupAutoCleanup();
    observers[0].callback([{ removedNodes: [root] }]);

    assert.equal(observers[0].observed.length, 2);
    assert.equal(observers[0].disconnected, true);
    assert.equal(calls.includes('network.dispose'), true);
  } finally {
    globalThis.MutationObserver = previousMutationObserver;
  }
});

test('behavior manager serializes and restores attached behavior state', () => {
  const helios = new MockHelios();
  const registry = new BehaviorRegistry()
    .register('appearance', AppearanceBehavior)
    .register('exporter', ExporterBehavior)
    .register('mappers', MappersBehavior)
    .register('filters', FilterBehavior)
    .register('interface', InterfaceBehavior)
    .register('layout', LayoutBehavior)
    .register('legends', LegendsBehavior)
    .register('labels', LabelsBehavior)
    .register('hover', HoverBehavior)
    .register('selection', SelectionBehavior);
  const manager = new BehaviorManager(helios, registry);

  const appearance = manager.use('appearance', { background: '#112233ff', shaded: { enabled: true } });
  const mappers = manager.use('mappers');
  const filters = manager.use('filters');
  const labels = manager.use('labels', { enabled: true, maxVisible: 18 });
  const selection = manager.use('selection', { nodeClick: false });
  const hover = manager.use('hover', { hoverLabel: false });
  mappers.setChannelConfig('node', 'color', {
    type: 'colormap',
    attributes: '$index',
    colormap: 'interpolateInferno',
    domain: [0, 3],
  });
  filters.replaceRules({
    scope: 'render+layout',
    nodeRules: [{ id: 'node-weight', scope: 'node', type: 'numeric', attribute: 'weight', min: 0.2, max: 1 }],
  });
  selection.state.selectedNodes.add(2);
  hover.state.hoveredNode = 3;
  const snapshot = manager.serialize();

  const nextManager = new BehaviorManager(new MockHelios(), registry);
  nextManager.restore(snapshot);

  const restored = nextManager.get('selection');
  const restoredHover = nextManager.get('hover');
  const restoredLabels = nextManager.get('labels');
  const restoredAppearance = nextManager.get('appearance');
  const restoredMappers = nextManager.get('mappers');
  const restoredFilters = nextManager.get('filters');
  assert.ok(restored);
  assert.ok(restoredHover);
  assert.ok(restoredLabels);
  assert.ok(restoredAppearance);
  assert.ok(restoredMappers);
  assert.ok(restoredFilters);
  assert.equal(appearance.serialize().options.background, '#112233ff');
  assert.equal(restoredAppearance.serialize().options.background, '#112233ff');
  assert.equal(restoredAppearance.serialize().options.shaded.enabled, true);
  assert.equal(labels.state.maxVisible, 18);
  assert.equal(restoredLabels.state.enabled, true);
  assert.equal(restoredLabels.state.maxVisible, 18);
  assert.equal(restored.state.nodeClick, false);
  assert.equal(restoredHover.state.hoverLabel, false);
  assert.deepEqual(Array.from(restored.state.selectedNodes), [2]);
  assert.equal(restoredHover.state.hoveredNode, -1);
  assert.equal(restoredMappers.getSerializedChannelConfig('node', 'color').colormap, 'interpolateInferno');
  assert.equal(restoredFilters.state.scope, 'render+layout');
});

test('behavior restore and network refresh do not emit broad explicit state warnings', () => {
  const helios = new MockHelios();
  const registry = new BehaviorRegistry()
    .register('filters', FilterBehavior)
    .register('legends', LegendsBehavior);
  const manager = new BehaviorManager(helios, registry);
  manager.use('filters');
  manager.use('legends');
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    manager.restore({
      filters: {
        filter: {
          scope: 'render+layout',
          rules: [{ id: 'node-weight', scope: 'node', type: 'numeric', attribute: 'weight', min: 0.2 }],
        },
      },
      legends: {
        options: {
          showNodeSize: true,
          showEdgeColor: true,
        },
      },
    });
    helios.emit('network:replaced', { nodeCount: 4, edgeCount: 3 });
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(
    warnings.some((warning) => warning.includes('Ignoring broad explicit binding notification')),
    false,
    warnings.join('\n'),
  );
});

test('default behavior registry exposes appearance, mappers, filters, layout, legends, labels, hover, and selection behaviors', () => {
  const registry = createDefaultBehaviorRegistry();
  assert.equal(registry.has('appearance'), true);
  assert.equal(registry.has('exporter'), true);
  assert.equal(registry.has('mappers'), true);
  assert.equal(registry.has('filters'), true);
  assert.equal(registry.has('interface'), true);
  assert.equal(registry.has('layout'), true);
  assert.equal(registry.has('legends'), true);
  assert.equal(registry.has('labels'), true);
  assert.equal(registry.has('selection'), true);
  assert.equal(registry.has('hover'), true);
});

function createHeliosBehaviorHarness() {
  const eventTarget = new EventTarget();
  const helios = Object.create(Helios.prototype);
  helios.addEventListener = eventTarget.addEventListener.bind(eventTarget);
  helios.removeEventListener = eventTarget.removeEventListener.bind(eventTarget);
  helios.dispatchEvent = eventTarget.dispatchEvent.bind(eventTarget);
  helios.on = MockHelios.prototype.on;
  helios.emit = MockHelios.prototype.emit;
  helios.network = null;
  helios._labelsConfig = { enabled: false, source: '$id', selectionMode: 'ranked' };
  helios._legendsConfig = { enabled: true, placements: {}, titles: {} };
  helios._layout = {
    getParameterBindings() {
      return { key: 'worker:force3d', label: 'Force (worker)', dynamic: true, bindings: [] };
    },
  };
  helios._refreshUIBindings = () => {};
  helios.requestRender = () => {};
  helios.scheduler = {
    layoutEnabled: true,
    requestRender: () => {},
    requestGeometry: () => {},
    getLayoutState: () => 'running',
  };
  helios.debug = { log: () => {} };
  helios.renderer = { clearColor: [1, 1, 1, 1], graphLayer: {} };
  helios.options = {};
  helios._pendingRendererProps = new Map();
  helios._pendingGraphLayerProps = new Map();
  helios._edgeAdaptiveQualityConfig = undefined;
  helios._edgeAdaptiveRuntime = null;
  helios._nodeStateStyles = new Map();
  helios._edgeStateStyles = new Map();
  helios._nodeNoStateStyle = null;
  helios._edgeNoStateStyle = null;
  helios._pickingConfig = {
    node: { enabled: false, trackMove: false, requireClick: false },
    edge: { enabled: false, trackMove: false, requireClick: false },
  };
  helios.enableNodePicking = () => helios;
  helios.disableNodePicking = () => helios;
  helios.enableEdgePicking = () => helios;
  helios.disableEdgePicking = () => helios;
  helios.nodeStateStyle = function nodeStateStyle(name, value) {
    if (arguments.length === 1) return helios._nodeStateStyles.get(name) ?? null;
    helios._nodeStateStyles.set(name, value);
    return helios;
  };
  helios.edgeStateStyle = function edgeStateStyle(name, value) {
    if (arguments.length === 1) return helios._edgeStateStyles.get(name) ?? null;
    helios._edgeStateStyles.set(name, value);
    return helios;
  };
  helios.nodeNoStateStyle = function nodeNoStateStyle(value) {
    if (arguments.length === 0) return helios._nodeNoStateStyle;
    helios._nodeNoStateStyle = value;
    return helios;
  };
  helios.edgeNoStateStyle = function edgeNoStateStyle(value) {
    if (arguments.length === 0) return helios._edgeNoStateStyle;
    helios._edgeNoStateStyle = value;
    return helios;
  };
  helios._getLabelsControllerConfig = () => ({ ...helios._labelsConfig });
  helios._applyLabelsControllerConfig = (options) => {
    if (options == null) helios._labelsConfig = { enabled: false, hoveredNodeEnabled: false };
    else helios._labelsConfig = { ...helios._labelsConfig, ...options };
    return helios;
  };
  helios._getLegendsControllerConfig = () => ({
    ...helios._legendsConfig,
    placements: { ...(helios._legendsConfig.placements ?? {}) },
    titles: { ...(helios._legendsConfig.titles ?? {}) },
  });
  helios._applyLegendsControllerConfig = (options) => {
    helios._legendsConfig = {
      ...helios._legendsConfig,
      ...options,
      placements: { ...(helios._legendsConfig.placements ?? {}), ...(options?.placements ?? {}) },
      titles: { ...(helios._legendsConfig.titles ?? {}), ...(options?.titles ?? {}) },
    };
    return helios;
  };
  helios.layout = function layout(value) {
    if (arguments.length === 0) return helios._layout;
    helios._layout = value;
    return helios;
  };
  helios.createLayout = (options = {}) => ({
    options,
    getParameterBindings() {
      const key = options?.type === 'gpu-force'
        ? 'gpu-force'
        : options?.type === 'd3force3d'
          ? 'd3force3d'
          : options?.type === 'worker' && options?.options?.layout === 'jitter'
            ? 'worker:jitter'
            : options?.type === 'static'
              ? 'static'
              : 'worker:force3d';
      return { key, label: key, dynamic: key !== 'static', bindings: [] };
    },
  });
  helios.getLayoutPositionAttributeChoices = () => [
    { value: '_helios_visuals_position', label: 'Current positions', dimension: 3 },
  ];
  helios.setLayoutPositionsFromNodeAttribute = () => true;
  helios.startLayout = () => helios;
  helios.stopLayout = () => helios;
  helios.nodeMapper = new MapperCollection('node', null, () => helios.emit('mappers:changed', {}));
  helios.edgeMapper = new MapperCollection('edge', null, () => helios.emit('mappers:changed', {}));
  helios.nodeMapper.channel('color').constant('#ff0000ff').done();
  helios.edgeMapper.channel('color').constant({ source: '#111111ff', target: '#222222ff' }).done();
  helios._activeHeliosFilter = null;
  helios._graphFilter = {
    enabled: false,
    scope: 'render',
    options: null,
    nodeCount: 0,
    edgeCount: 0,
    baseNodeCount: 0,
    baseEdgeCount: 0,
    error: null,
  };
  helios.getGraphFilter = () => ({ ...helios._graphFilter, options: helios._graphFilter.options ? { ...helios._graphFilter.options } : null });
  helios.clearGraphFilter = () => {
    helios._activeHeliosFilter = null;
    helios._graphFilter = { ...helios._graphFilter, enabled: false, scope: 'render', options: null };
    helios.emit('graph:filter-changed', helios.getGraphFilter());
    return helios;
  };
  helios.setGraphFilter = (options) => {
    const normalized = options instanceof HeliosFilter ? options.toGraphFilterOptions() : options;
    helios._activeHeliosFilter = options instanceof HeliosFilter ? options : null;
    helios._graphFilter = {
      enabled: true,
      scope: normalized?.scope ?? 'render',
      options: { ...normalized, scope: normalized?.scope ?? 'render' },
      nodeCount: 3,
      edgeCount: 2,
      baseNodeCount: 4,
      baseEdgeCount: 3,
      error: null,
    };
    helios.emit('graph:filter-changed', helios.getGraphFilter());
    return helios;
  };
  helios.activateHeliosFilter = (filter) => helios.setGraphFilter(filter);
  helios.getActiveHeliosFilter = () => helios._activeHeliosFilter;
  helios.getFigureExportCapabilities = ({ supersampling = 1 } = {}) => ({
    supersampling,
    maxBitmapDimension: 8192,
    windowDevicePixelRatio: 1,
    defaultPreset: 'window',
    presets: [],
  });
  helios._resolveFigureExportOptions = (options = {}) => ({
    filename: `${options.baseName ?? 'figure'}.${options.format ?? 'png'}`,
    format: options.format ?? 'png',
    preset: options.preset ?? 'window',
    width: Number(options.width ?? 800),
    height: Number(options.height ?? 600),
    includeLabels: options.includeLabels === true,
    includeLegends: options.includeLegends !== false,
    includeInterface: options.includeInterface === true,
    legendScale: Number(options.legendScale ?? 1),
    transparentBackground: options.transparentBackground === true,
    alphaMode: options.alphaMode ?? 'straight',
    supersampling: Number(options.supersampling ?? 1),
    capability: { maxBitmapDimension: 8192 },
    fitsCapability: true,
    previewRect: { x: 0, y: 0, width: 800, height: 600 },
  });
  helios.behaviors = new BehaviorManager(helios, createDefaultBehaviorRegistry());
  helios._initializeBehaviorNamespace();
  return helios;
}

test('helios.behavior exposes named and dynamic public access for built-in behaviors', () => {
  const helios = createHeliosBehaviorHarness();
  const appearance = helios.behavior.appearance;
  const exporter = helios.behavior.exporter;
  const mappers = helios.behavior.mappers;
  const filters = helios.behavior.filters;
  const iface = helios.behavior.interface;
  const labels = helios.behavior.labels;
  const hover = helios.behavior('hover');
  const layout = helios.behavior.layout;

  assert.ok(appearance instanceof AppearanceBehavior);
  assert.ok(exporter instanceof ExporterBehavior);
  assert.ok(mappers instanceof MappersBehavior);
  assert.ok(filters instanceof FilterBehavior);
  assert.ok(iface instanceof InterfaceBehavior);
  assert.ok(labels instanceof LabelsBehavior);
  assert.ok(hover instanceof HoverBehavior);
  assert.ok(layout instanceof LayoutBehavior);
  assert.equal(helios.behavior('appearance'), appearance);
  assert.equal(helios.behavior('exporter'), exporter);
  assert.equal(helios.behavior('mappers'), mappers);
  assert.equal(helios.behavior('filters'), filters);
  assert.equal(helios.behavior('interface'), iface);
  assert.equal(helios.behavior('labels'), labels);
  assert.equal(helios.behavior.hover, hover);
  assert.equal(helios.behavior('layout'), layout);
  assert.equal(helios.getBehavior('appearance'), appearance);
  assert.equal(helios.getBehavior('layout'), layout);
  assert.equal(helios.hasBehavior('appearance'), true);
  assert.equal(helios.hasBehavior('selection'), true);
  assert.equal(helios.hasBehavior('missing-behavior'), false);
});

test('constructor-style behavior config object can be initialized through _initializeBehaviors', () => {
  const helios = createHeliosBehaviorHarness();

  helios._initializeBehaviors({
    appearance: { background: '#112233ff', shaded: { enabled: true } },
    exporter: { format: 'svg', includeInterface: true, legendScale: 1.5 },
    mappers: {
      nodeChannels: {
        color: {
          type: 'colormap',
          attributes: '$index',
          colormap: 'interpolateInferno',
          domain: [0, 10],
        },
      },
    },
    filters: {
      rules: [{ id: 'node-weight', scope: 'node', type: 'numeric', attribute: 'weight', min: 0.1, max: 1 }],
      scope: 'render+layout',
    },
    layout: { positionAttribute: 'embedding2d' },
    selection: { nodeClick: false },
    hover: { hoverLabel: true },
    labels: { enabled: true, source: 'label' },
    legends: { enabled: true, scale: 2 },
  });

  assert.deepEqual(helios.behavior.appearance.background(), [0x11 / 255, 0x22 / 255, 0x33 / 255, 1]);
  assert.equal(helios.behavior.exporter.format(), 'svg');
  assert.equal(helios.behavior.exporter.includeInterface(), true);
  assert.equal(helios.behavior.exporter.legendScale(), 1.5);
  assert.equal(helios.behavior.mappers.getSerializedChannelConfig('node', 'color').colormap, 'interpolateInferno');
  assert.equal(helios.behavior.filters.state.scope, 'render+layout');
  assert.equal(helios.behavior.appearance.shadedEnabled(), true);
  assert.equal(helios.behavior.layout.positionAttribute(), 'embedding2d');
  assert.equal(helios.behavior.selection.state.nodeClick, false);
  assert.equal(helios.behavior.hover.state.hoverLabel, true);
  assert.equal(helios.behavior.labels.state.source, 'label');
  assert.equal(helios.behavior.legends.state.scale, 2);
});

test('Helios mapper change events include full serializable channel configs', () => {
  const helios = createHeliosBehaviorHarness();
  let detail = null;
  helios.on('mappers:changed', (event) => {
    detail = event.detail;
  });

  const nodeCollection = new MapperCollection('node', null);
  nodeCollection.channel('color').from('$index').colormap('interpolateInferno', { domain: [0, 10], alpha: 0.75 }).done();

  helios.mappers({ nodeMapper: nodeCollection.defaultMapper });

  const color = detail?.node?.mappers?.default?.channels?.color;
  assert.equal(color?.type, 'colormap');
  assert.equal(color?.attributes, '$index');
  assert.equal(color?.colormap, 'interpolateInferno');
  assert.deepEqual(color?.domain, [0, 10]);
  assert.equal(color?.alpha, 0.75);
  assert.equal(color?.serializable, true);
});

test('behavior renderer bindings can be reapplied after renderer creation', () => {
  const helios = createHeliosBehaviorHarness();
  helios.renderer = null;
  helios._initializeDefaultBehaviors({
    hover: { hoverConnectedEdges: true },
    selection: { selectedConnectedEdges: true },
  });

  const hover = helios.behaviors.get('hover');
  const selection = helios.behaviors.get('selection');
  assert.equal(hover.state.hoverConnectedEdges, true);
  assert.equal(selection.state.selectedConnectedEdges, true);

  helios.renderer = {
    clearColor: [1, 1, 1, 1],
    graphLayer: {
      propagateHoveredNodeToEdges: false,
      propagateSelectedNodesToEdges: false,
    },
  };

  Helios.prototype._reapplyBehaviorRendererBindings.call(helios);

  assert.equal(helios.renderer.graphLayer.propagateHoveredNodeToEdges, true);
  assert.equal(helios.renderer.graphLayer.propagateSelectedNodesToEdges, true);
});

test('registerBehavior() and useBehavior() place custom behaviors under helios.behavior namespace', () => {
  const helios = createHeliosBehaviorHarness();
  helios.registerBehavior('clusterFocus', ProbeBehavior);

  const registered = helios.behavior.clusterFocus;
  assert.ok(registered instanceof ProbeBehavior);
  assert.equal(registered.id, 'clusterFocus');
  assert.equal(helios.behavior('clusterFocus'), registered);

  const explicit = new ProbeBehavior();
  const attached = helios.useBehavior('customThing', explicit);
  assert.equal(attached, explicit);
  assert.equal(helios.behavior.customThing, explicit);
});

test('helios.behaviors remains a temporary compatibility layer over the attached manager', () => {
  const helios = createHeliosBehaviorHarness();
  const labels = helios.behavior.labels;

  assert.equal(helios.behaviors.get('labels'), labels);

  const selection = helios.behaviors.use('selection', { nodeClick: false });
  assert.equal(helios.behavior.selection, selection);
  assert.equal(selection.state.nodeClick, false);
});
