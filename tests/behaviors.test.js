import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';
import {
  AppearanceBehavior,
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
    getLayoutState: () => 'running',
  };
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
