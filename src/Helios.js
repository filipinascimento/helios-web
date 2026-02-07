/** @typedef {import('helios-network').default} HeliosNetwork */
import { LayerManager } from './layers/LayerManager.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { StaticLayout, WorkerLayout } from './layouts/Layout.js';
import { D3Force3DLayout } from './layouts/d3force3dLayoutWorker.js';
import { createRenderer } from './rendering/createRenderer.js';
import { AttributeTracker } from './rendering/AttributeTracker.js';
import { PerformanceMonitor } from './utilities/PerformanceMonitor.js';
import { bumpCounter } from './utilities/counters.js';
import { VisualAttributes } from './pipeline/VisualAttributes.js';
import { createDefaultMappers, MapperCollection } from './pipeline/Mapper.js';
import { createDebugLogger } from './utilities/DebugLogger.js';
import { VISUAL_ATTRIBUTE_NAMES } from './pipeline/constants.js';
import { CpuMirrorPositionDelegate, createPositionDelegateFromOptions } from './layouts/positions/PositionDelegate.js';
import { CpuLinearPositionInterpolator } from './layouts/positions/PositionInterpolator.js';

const {
  NODE_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
  EDGE_ENDPOINTS_STATE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

function isLayoutInstance(candidate) {
  return candidate && typeof candidate.step === 'function' && typeof candidate.initialize === 'function';
}

function forEachIndex(indices, visitor) {
  if (indices == null) return;
  if (typeof indices === 'number') {
    visitor(indices);
    return;
  }
  if (Array.isArray(indices) || ArrayBuffer.isView(indices)) {
    for (let i = 0; i < indices.length; i += 1) visitor(indices[i]);
    return;
  }
  if (typeof indices[Symbol.iterator] === 'function') {
    for (const index of indices) visitor(index);
  }
}

function parseNamespacedEventType(type) {
  if (typeof type !== 'string') {
    throw new TypeError('Event type must be a string');
  }
  const trimmed = type.trim();
  if (!trimmed) {
    throw new Error('Event type cannot be empty');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('Namespaced event types cannot contain whitespace');
  }
  const dot = trimmed.indexOf('.');
  if (dot === -1) return { type: trimmed, namespace: '' };
  const base = trimmed.slice(0, dot);
  const namespace = trimmed.slice(dot + 1);
  if (!base) {
    throw new Error('Namespaced event types must include a base type before the "."');
  }
  return { type: base, namespace };
}

function resolveStateMask(mask, states) {
  if (typeof mask === 'string') {
    const value = states?.[mask];
    if (value == null) {
      throw new Error(`Unknown state name "${mask}"`);
    }
    return value;
  }
  if (Array.isArray(mask)) {
    let combined = 0;
    for (const entry of mask) {
      combined |= (Number(resolveStateMask(entry, states)) >>> 0);
    }
    return combined >>> 0;
  }
  return mask;
}

function resolveStateSlot(slot, states) {
  if (typeof slot !== 'string') return slot;
  const mask = Number(resolveStateMask(slot, states)) >>> 0;
  if (!mask || (mask & (mask - 1)) !== 0) {
    throw new Error(`State "${slot}" must map to a single-bit mask to be used as a style slot`);
  }
  return 31 - Math.clz32(mask);
}

function normalizeColorInput(color) {
  if (color == null) return null;
  if (Array.isArray(color) || ArrayBuffer.isView(color)) {
    const r = Number(color[0]);
    const g = Number(color[1]);
    const b = Number(color[2]);
    const a = color.length >= 4 ? Number(color[3]) : 1;
    if (![r, g, b, a].every(Number.isFinite)) return null;
    const max = Math.max(r, g, b, a);
    if (max > 1.0) {
      return [r / 255, g / 255, b / 255, a / 255];
    }
    return [r, g, b, a];
  }
  if (typeof color === 'string') {
    const hex = color.trim();
    if (!hex.startsWith('#')) return null;
    const raw = hex.slice(1);
    const expand = (c) => `${c}${c}`;
    let r = 0; let g = 0; let b = 0; let a = 255;
    if (raw.length === 3 || raw.length === 4) {
      r = parseInt(expand(raw[0]), 16);
      g = parseInt(expand(raw[1]), 16);
      b = parseInt(expand(raw[2]), 16);
      if (raw.length === 4) a = parseInt(expand(raw[3]), 16);
    } else if (raw.length === 6 || raw.length === 8) {
      r = parseInt(raw.slice(0, 2), 16);
      g = parseInt(raw.slice(2, 4), 16);
      b = parseInt(raw.slice(4, 6), 16);
      if (raw.length === 8) a = parseInt(raw.slice(6, 8), 16);
    } else {
      return null;
    }
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return [r / 255, g / 255, b / 255, a / 255];
  }
  return null;
}

function createDetailEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
  if (typeof Event === 'function') {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

function cloneMapperCollection(previous, network, onChange, debug) {
  const collection = new MapperCollection(previous?.mode ?? 'node', network, onChange, debug);
  if (!previous?.mappers || previous.mappers.size === 0) {
    return collection;
  }
  collection.mappers.clear();
  collection.defaultMapper = null;
  for (const [key, mapper] of previous.mappers.entries()) {
    const cloned = collection.createMapper(key);
    for (const [channelName, config] of mapper?.channels?.entries?.() ?? []) {
      if (!channelName || !config) continue;
      cloned.setChannel(channelName, { ...config, attributes: config.attributes ?? config.from });
    }
    if (!collection.defaultMapper && (key === 'default' || mapper === previous.defaultMapper)) {
      collection.defaultMapper = cloned;
    }
  }
  if (!collection.defaultMapper) {
    collection.defaultMapper = collection.mappers.get('default') ?? collection.mappers.values().next().value ?? null;
  }
  return collection;
}

function inferNetworkFormatFromName(name) {
  if (typeof name !== 'string') return null;
  const lower = name.trim().toLowerCase();
  if (lower.endsWith('.bxnet')) return 'bxnet';
  if (lower.endsWith('.zxnet')) return 'zxnet';
  if (lower.endsWith('.xnet')) return 'xnet';
  return null;
}

function resolveSeedBoundsForLayout(layoutOption, size, mode) {
  const safeMode = mode === '3d' ? '3d' : '2d';
  const width = Math.max(1, size?.width ?? 1)*0.01;
  const height = Math.max(1, size?.height ?? 1)*0.01;
  const minSide = Math.max(1, Math.min(width, height));
  const base = { width: minSide, height: minSide, depth: 0, mode: safeMode, center: [0, 0, 0] };

  if (!layoutOption || isLayoutInstance(layoutOption)) return base;
  if (layoutOption?.type === 'worker') {
    const opts = layoutOption.options ?? {};
    const radius = Number.isFinite(opts.radius) ? Math.max(1, opts.radius) : 150;
    const depth = Number.isFinite(opts.depth) ? Math.max(0, opts.depth) : 0;
    const center = Array.isArray(opts.center) ? opts.center : [0, 0, 0];
    return {
      width: radius,
      height: radius,
      depth: safeMode === '3d' ? depth : 0,
      mode: safeMode,
      center,
    };
  }

  if (layoutOption?.type === 'd3force3d' || layoutOption?.type === 'd3-force-3d') {
    const bounds = layoutOption?.options?.bounds ?? null;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      const minX = Number(bounds[0]);
      const minY = Number(bounds[1]);
      const maxX = Number(bounds[2]);
      const maxY = Number(bounds[3]);
      if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
        return {
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          depth: 0,
          mode: safeMode,
          center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, 0],
        };
      }
    }
  }

  const bounds = layoutOption?.options?.bounds ?? null;
  if (Array.isArray(bounds) && bounds.length >= 4) {
    const minX = Number(bounds[0]);
    const minY = Number(bounds[1]);
    const maxX = Number(bounds[2]);
    const maxY = Number(bounds[3]);
    if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
      return {
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        depth: 0,
        mode: safeMode,
        center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, 0],
      };
    }
  }

  return base;
}

function getBaseFilename(name) {
  if (typeof name !== 'string') return 'network';
  const trimmed = name.trim();
  if (!trimmed) return 'network';
  const withoutKnown = trimmed.replace(/\.(bxnet|zxnet|xnet)$/i, '');
  if (withoutKnown !== trimmed) return withoutKnown;
  return trimmed.replace(/\.[^/.]+$/, '') || trimmed;
}

export const EVENTS = Object.freeze({
  LAYOUT_START: 'layout:start',
  LAYOUT_STOP: 'layout:stop',

  NODE_HOVER: 'node:hover',
  EDGE_HOVER: 'edge:hover',

  GRAPH_CLICK: 'graph:click',
  GRAPH_DBLCLICK: 'graph:dblclick',

  NODE_CLICK: 'node:click',
  EDGE_CLICK: 'edge:click',

  NODE_DBLCLICK: 'node:dblclick',
  EDGE_DBLCLICK: 'edge:dblclick',

  BEFORE_RENDER: 'render:before',
  AFTER_RENDER: 'render:after',

  RESIZE: 'resize',
  CAMERA_MOVE: 'camera:move',
  NETWORK_REPLACED: 'network:replaced',
});

export class Helios extends EventTarget {
  static STATES = Object.freeze({
    FILTERED: 1 << 0,
    SELECTED: 1 << 1,
    HIGHLIGHTED: 1 << 2,
  });

  static STATE_BITS = Helios.STATES;

  static UI_BINDINGS = Object.freeze({
    edgeWidthScale: {
      type: 'number',
      label: 'Edge Width Scale',
      description: 'Scales mapped edge widths',
      defaultValue: 1,
      domain: { min: 0, max: 10 },
      recommendedRange: { min: 0.25, max: 4.0 },
      step: 0.01,
    },
    edgeWidthBase: {
      type: 'number',
      label: 'Edge Width Base',
      description: 'Adds a constant to mapped edge widths',
      defaultValue: 0,
      domain: { min: 0, max: 20 },
      recommendedRange: { min: 0.0, max: 6.0 },
      step: 0.01,
    },
    edgeOpacityScale: {
      type: 'number',
      label: 'Edge Opacity Scale',
      description: 'Scales mapped edge opacity',
      defaultValue: 0.5,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
      meta: { inputMin: 0, inputMax: null },
    },
    edgeOpacityBase: {
      type: 'number',
      label: 'Edge Opacity Base',
      description: 'Adds a constant to mapped edge opacity',
      defaultValue: 0,
      domain: { min: 0, max: 1 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
    },
    nodeOpacityScale: {
      type: 'number',
      label: 'Node Opacity Scale',
      description: 'Scales mapped node opacity',
      defaultValue: 1,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
      meta: { inputMin: 0, inputMax: null },
    },
    nodeOpacityBase: {
      type: 'number',
      label: 'Node Opacity Base',
      description: 'Adds a constant to mapped node opacity',
      defaultValue: 0,
      domain: { min: 0, max: 1 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
    },
    nodeSizeScale: {
      type: 'number',
      label: 'Node Size Scale',
      description: 'Scales mapped node sizes',
      defaultValue: 1,
      domain: { min: 0, max: 100 },
      recommendedRange: { min: 0.25, max: 3.0 },
      step: 0.01,
    },
    nodeSizeBase: {
      type: 'number',
      label: 'Node Size Base',
      description: 'Adds a constant to mapped node sizes',
      defaultValue: 0,
      domain: { min: 0, max: 50 },
      recommendedRange: { min: 0.0, max: 10.0 },
      step: 0.01,
    },
    nodeOutlineWidthScale: {
      type: 'number',
      label: 'Outline Width Scale',
      description: 'Scales mapped outline widths',
      defaultValue: 0,
      domain: { min: 0, max: 10 },
      recommendedRange: { min: 0.0, max: 10.0 },
      step: 0.01,
    },
    nodeOutlineWidthBase: {
      type: 'number',
      label: 'Outline Width Base',
      description: 'Adds a constant to mapped outline widths',
      defaultValue: 0,
      domain: { min: 0, max: 20 },
      recommendedRange: { min: 0.0, max: 4.0 },
      step: 0.01,
    },
    edgeEndpointTrim: {
      type: 'number',
      label: 'Edge Endpoint Trim',
      description: 'Trims edge endpoints so edges don’t overlap nodes',
      defaultValue: 0.8,
      domain: { min: 0, max: 3 },
      recommendedRange: { min: 0.0, max: 1.5 },
      step: 0.01,
    },
    nodeBlendWithEdges: {
      type: 'boolean',
      label: 'Blend Nodes With Edges',
      description: 'Blend nodes using the edge transparency mode (weighted modes still use alpha; disables node depth testing)',
      defaultValue: false,
    },
    edgeDepthWrite: {
      type: 'boolean',
      label: 'Edge Depth Write',
      description: 'Enable depth testing and depth writes for edges (best for solid edges)',
      defaultValue: false,
    },
    background: {
      type: 'color',
      label: 'Background',
      description: 'Renderer clear/background color',
      eventName: 'clearColor',
    },
    clearColor: {
      type: 'color',
      label: 'Background',
      description: 'Renderer clear/background color',
    },
  });

  uiBindingInfo(name) {
    return this.constructor.UI_BINDINGS?.[name] ?? null;
  }

  _emitUIBindingChange(name, value) {
    if (typeof this.dispatchEvent !== 'function') return;
    try {
      this.dispatchEvent(createDetailEvent('ui:binding-change', { id: `helios.${name}`, name, value }));
    } catch {
      // Avoid breaking tests that create Helios-shaped objects without EventTarget internals.
    }
  }

  constructor(network, options = {}) {
    if (!network) {
      throw new Error('Helios requires a helios-network instance');
    }
    super();
    if (!Object.prototype.hasOwnProperty.call(options, 'layout')) {
      const mode = options.mode ?? '2d';
      options.layout = {
        type: 'd3force3d',
        options: {
          settings: {
            use2D: mode !== '3d',
          },
        },
      };
    }
    if (!Object.prototype.hasOwnProperty.call(options, 'interpolation')) {
      options.interpolation = { enabled: true, backend: 'auto' };
    }
    this.network = network;
    this.options = options;
    this.debug = createDebugLogger(options.debug);
    this.debug.log('helios', 'Constructing Helios instance', { mode: options.mode ?? '2d' });
    this.prewarmPromise = null;
    this.mappersDirty = false;
    this.markMappersDirty = () => {
      this.mappersDirty = true;
      this.prewarmPromise = null;
      this.scheduler?.requestGeometry?.();
    };
    const container = options.container ?? document.getElementById('app') ?? document.body;
    this.layers = new LayerManager(container, { suppressBrowserGestures: options.suppressBrowserGestures !== false });
    this.visuals = new VisualAttributes(network, this.debug);
    this._positionDelegate = null;
    this._positionInterpolator = null;
    this._positionOverrides = null;
    this._positionDelegateSubscriptions = [];
    this._positionInterpolationBackend = 'cpu';
    this._positionInterpolationSource = 'network';
    this._cpuInterpolationLastLayoutTimestamp = 0;
    this._cpuInterpolationDeltaHistory = [];
    this._networkInterpolation = {
      active: false,
      lastLayoutTimestamp: 0,
      layoutElapsedMs: 16,
      lastStepTimestamp: 0,
      layoutDeltaHistory: [],
      targetView: null,
      targetLength: 0,
    };
    this._positionDelegationOptions = options.positions ?? null;
    this._positionInterpolationOptions = options.interpolation ?? null;
    this._configurePositioning(this._positionDelegationOptions, this._positionInterpolationOptions);
    this.nodeMapper = new MapperCollection('node', network, this.markMappersDirty, this.debug);
    this.edgeMapper = new MapperCollection('edge', network, this.markMappersDirty, this.debug);
    const optionMappers = options.mappers;
    if (optionMappers !== null) {
      const initialMappers = optionMappers ?? createDefaultMappers(network);
      if (initialMappers?.nodeMapper) {
        this.nodeMapper.setDefault(initialMappers.nodeMapper);
      }
      if (initialMappers?.edgeMapper) {
        this.edgeMapper.setDefault(initialMappers.edgeMapper);
      }
    }
    this.mappersDirty = true;
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(options.layout, this.layers.size, options.mode));
    const debugPerformance = options.debugPerformance?? false;
    const performanceWindow = options.performanceWindow ?? 60;
    const performanceLogEvery = options.performanceLogEvery ?? performanceWindow;
    this.performanceMonitor = new PerformanceMonitor({
      enabled: debugPerformance,
      windowSize: performanceWindow,
      logEvery: performanceLogEvery,
    });
    this.attributeUpdateOptions = {
      autoUpdate: options.attributeAutoUpdate === true,
      maxFps: options.attributeAutoUpdateMaxFps ?? null,
      frameSkip: options.attributeAutoUpdateFrameSkip ?? null,
    };
    this.manualRendering = options.manualRendering === true;
    this.scheduler = new Scheduler({
      performanceMonitor: this.performanceMonitor,
      maxFps: options.maxFps,
      debug: this.debug,
      attributeAutoUpdate: this.attributeUpdateOptions.autoUpdate,
      attributeMaxFps: this.attributeUpdateOptions.maxFps,
      attributeFrameSkip: this.attributeUpdateOptions.frameSkip,
    });
    this.scheduler.setRenderPump(({ timestamp }) => {
      if (this.manualRendering) return false;
      if (!this._supportsInterpolation()) return false;
      if (!this._positionInterpolator || this._positionInterpolationBackend !== 'cpu') return false;
      const lastUpdate = this._positionInterpolator._lastUpdateTime ?? 0;
      const durationMs = this._positionInterpolator.durationMs ?? 0;
      const elapsed = timestamp - lastUpdate;
      return durationMs > 0 && elapsed >= 0 && elapsed < durationMs;
    });
    if (options.prewarm === true) {
      this.prewarm({ updateDenseBuffers: options.prewarmDenseBuffers !== false });
    }
    this._layout = this.createLayout(options.layout);
    this.renderer = null;
    this.attributeTracker = null;
    this.indexPickingTracker = null;
    this._anyListeners = new Set();
    this._listenHandlers = new Map();
    this._pendingGraphLayerProps = new Map();
    this._pendingRendererProps = new Map();
    this._frameId = 0;
    this._lastRenderTime = performance.now();
    this.counters = {
      geometryFrames: 0,
      renderFrames: 0,
      attributeUpdateTicks: 0,
    };
    this._cameraMoveRaf = null;
    this._picking = {
      node: { enabled: false },
      edge: { enabled: false },
      options: {
        resolutionScale: 0.5,
        trackDepth: false,
        maxFps: 30,
        clickRequiresStationary: true,
        clickMoveTolerancePx: 4,
        suppressClickAfterWheelMs: 200,
      },
      hover: { kind: null, index: -1, depth: null },
      pointer: { x: 0, y: 0, clientX: 0, clientY: 0, inside: false },
      suppressHover: false,
      cameraIdleTimer: null,
      hoverThrottleTimer: null,
      gesture: {
        active: false,
        startClientX: 0,
        startClientY: 0,
        moved: false,
        cameraMoved: false,
        wheelZoomed: false,
        lastWheelAt: -Infinity,
        lastCameraMoveAt: -Infinity,
      },
      _raf: null,
      _inFlight: false,
      _rerun: false,
      _lastPickTime: -Infinity,
    };
    this._pickingListenersAttached = false;
    this._boundPickingHandlers = {
      down: (event) => this._handlePointerDown(event),
      move: (event) => this._handlePointerMove(event),
      up: () => this._handlePointerUp(),
      cancel: () => this._handlePointerUp(),
      leave: () => this._handlePointerLeave(),
      wheel: (event) => this._handleWheel(event),
      click: (event) => this._handlePointerClick(event, false),
      dblclick: (event) => this._handlePointerClick(event, true),
    };
    this._pendingFrameNetwork = null;
    this._stateStyleCache = {
      nodeSlots: new Map(),
      edgeSlots: new Map(),
      nodeNoState: null,
      edgeNoState: null,
    };
    this.size = { ...this.layers.size };
    this.removeResizeListener = null;
    this.firstGeometryUpdateComplete = false;
    this.ready = this.initialize();
  }

  _snapshotCameraState() {
    const camera = this.renderer?.camera ?? null;
    if (!camera) return null;
    const state = {
      mode: camera.mode ?? null,
      projection: camera.projection ?? null,
      zoom: Number.isFinite(camera.zoom) ? camera.zoom : null,
      distance: Number.isFinite(camera.distance) ? camera.distance : null,
      pan2D: ArrayBuffer.isView(camera.pan2D) ? Array.from(camera.pan2D) : null,
      orbit3D: ArrayBuffer.isView(camera.orbit3D) ? Array.from(camera.orbit3D) : null,
      viewport: camera.viewport ? { ...camera.viewport } : null,
    };
    return state;
  }

  _restoreCameraState(state) {
    if (!state) return;
    const camera = this.renderer?.camera ?? null;
    if (!camera) return;
    if ('_needsUpdate' in camera) camera._needsUpdate = true;
    if (state.mode && typeof camera.setMode === 'function') {
      camera.setMode(state.mode);
    } else if (state.mode) {
      camera.mode = state.mode;
    }
    if (state.projection && typeof camera.setProjection === 'function') {
      camera.setProjection(state.projection);
    } else if (state.projection) {
      camera.projection = state.projection;
    }
    if (state.zoom != null) camera.zoom = state.zoom;
    if (state.distance != null) camera.distance = state.distance;
    if (state.pan2D && ArrayBuffer.isView(camera.pan2D)) {
      camera.pan2D[0] = state.pan2D[0] ?? camera.pan2D[0];
      camera.pan2D[1] = state.pan2D[1] ?? camera.pan2D[1];
    }
    if (state.orbit3D && ArrayBuffer.isView(camera.orbit3D)) {
      camera.orbit3D[0] = state.orbit3D[0] ?? camera.orbit3D[0];
      camera.orbit3D[1] = state.orbit3D[1] ?? camera.orbit3D[1];
      camera.orbit3D[2] = state.orbit3D[2] ?? camera.orbit3D[2];
    }
    camera.updateMatrices?.();
  }

  async _createRendererAndTrackers(options = {}) {
    const extraStateSlotsRaw = this.options.extraStateSlots ?? 1;
    const extraStateSlots = Number.isFinite(extraStateSlotsRaw) ? Math.max(0, Math.floor(extraStateSlotsRaw)) : 1;
    const stateSlots = Math.min(32, 3 + extraStateSlots);
    const renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
      forceWebGPU: this.options.renderer === 'webgpu',
      webgpuBackend: this.options.webgpuBackend,
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      suppressBrowserGestures: this.options.suppressBrowserGestures !== false,
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
      edgeEndpointTrim: this.options.edgeEndpointTrim,
      nodeBlendWithEdges: this.options.nodeBlendWithEdges,
      edgeDepthWrite: this.options.edgeDepthWrite,
      stateSlots,
      ...options,
    });
    this.renderer = renderer;
    this._applyPendingRendererProps();
    this._refreshUIBindings();
    this._applyCachedStateStyles();
    this._configurePositioning(this._positionDelegationOptions, this._positionInterpolationOptions);
    this.attributeTracker?.destroy?.();
    this.attributeTracker = new AttributeTracker(this.renderer);
    this.attributeTracker.resize(this.layers.size);
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
    }
    if (this.mappersDirty) {
      this._applyMappersSafely();
    }
    if (this.renderer?.camera?.setChangeListener) {
      this.renderer.camera.setChangeListener(() => {
        this.scheduler.requestRender();
        this._scheduleCameraMove();
        this.debug.log('helios', 'Camera change requested render');
      });
    }
    this._applyPickingConfig();
  }

  _resetMappersToDefault(network = this.network) {
    const defaults = createDefaultMappers(network);
    this.nodeMapper = new MapperCollection('node', network, this.markMappersDirty, this.debug);
    this.edgeMapper = new MapperCollection('edge', network, this.markMappersDirty, this.debug);
    if (defaults?.nodeMapper) this.nodeMapper.setDefault(defaults.nodeMapper);
    if (defaults?.edgeMapper) this.edgeMapper.setDefault(defaults.edgeMapper);
    this.mappersDirty = true;
  }

  _applyMappersSafely() {
    if (!this.mappersDirty) return true;
    if (!this.visuals) return false;
    try {
      const nodeMapper = this.nodeMapper.toCombinedMapper();
      const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
      this.visuals.applyMappers({ nodeMapper, edgeMapper });
      this.mappersDirty = false;
      return true;
    } catch (error) {
      this.debug?.log?.('mapper', 'Failed to apply mappers; falling back to defaults', {
        error,
        nodeCount: this.network?.nodeCount ?? 0,
        edgeCount: this.network?.edgeCount ?? 0,
      });
      try {
        this._resetMappersToDefault(this.network);
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
        return true;
      } catch (fallbackError) {
        // Last resort: avoid crashing the scheduler loop.
        this.mappersDirty = false;
        // eslint-disable-next-line no-console
        console.error('Failed to apply default mappers after fallback', fallbackError);
        return false;
      }
    }
  }

  async replaceNetwork(nextNetwork, options = {}) {
    if (!nextNetwork) {
      throw new Error('replaceNetwork requires a helios-network instance');
    }
    await this.ready;

    const disposeOld = options.disposeOld !== false;
    const keepCamera = options.keepCamera !== false;
    const keepMappers = options.keepMappers !== false;
    const recreateRenderer = options.recreateRenderer !== false;
    const frameNetwork = options.frame ?? (!keepCamera);
    const layoutOption = options.layout ?? this.options.layout;
    if (isLayoutInstance(layoutOption)) {
      throw new Error('replaceNetwork requires options.layout when Helios was constructed with a layout instance');
    }

    const wasRunning = !this.manualRendering && this.scheduler?.running === true;
    const cameraState = keepCamera ? this._snapshotCameraState() : null;
    const attributeConfig = this.attributeTracker
      ? { node: this.attributeTracker.nodeAttribute, edge: this.attributeTracker.edgeAttribute, options: { ...this.attributeTracker.options } }
      : null;
    const pickingConfig = {
      node: this._picking?.node?.enabled === true,
      edge: this._picking?.edge?.enabled === true,
      options: { ...(this._picking?.options ?? {}) },
    };

    this.scheduler?.stop?.();
    this._detachPickingListeners();
    this.indexPickingTracker?.destroy?.();
    this.indexPickingTracker = null;
    this.attributeTracker?.destroy?.();
    this.attributeTracker = null;
    this._resetHover?.('network-replaced');

    if (recreateRenderer) {
      this.renderer?.destroy?.();
      this.renderer = null;
    }

    this._layout?.dispose?.();

    const prevNetwork = this.network;
    this.network = nextNetwork;
    this.visuals = new VisualAttributes(nextNetwork, this.debug);
    this._configurePositioning(this._positionDelegationOptions, this._positionInterpolationOptions);
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(layoutOption, this.layers.size, this.options.mode));

    if (options.mappers === null) {
      this.nodeMapper = new MapperCollection('node', nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = new MapperCollection('edge', nextNetwork, this.markMappersDirty, this.debug);
      this.mappersDirty = false;
    } else if (options.mappers) {
      this.nodeMapper = new MapperCollection('node', nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = new MapperCollection('edge', nextNetwork, this.markMappersDirty, this.debug);
      if (options.mappers?.nodeMapper) this.nodeMapper.setDefault(options.mappers.nodeMapper);
      if (options.mappers?.edgeMapper) this.edgeMapper.setDefault(options.mappers.edgeMapper);
      this.mappersDirty = true;
    } else if (keepMappers) {
      this.nodeMapper = cloneMapperCollection(this.nodeMapper, nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = cloneMapperCollection(this.edgeMapper, nextNetwork, this.markMappersDirty, this.debug);
      this.mappersDirty = true;
    } else {
      this._resetMappersToDefault(nextNetwork);
    }

    this.firstGeometryUpdateComplete = false;

    this._layout = this.createLayout(layoutOption);
    if (this._layout?.setUpdateListener) {
      this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    }
    await this._layout?.initialize?.();
    this._layout?.resize?.(this.layers.size);
    this.scheduler.setLayout(this._layout);

    if (recreateRenderer) {
      await this._createRendererAndTrackers();
      this._refreshUIBindings();
      if (frameNetwork) {
        this.requestFrameNetwork({ paddingPx: options.framePaddingPx ?? 24 });
      } else {
        this._restoreCameraState(cameraState);
      }
    } else if (this.renderer) {
      this.attributeTracker = new AttributeTracker(this.renderer);
      this.attributeTracker.resize(this.layers.size);
      this._applyPickingConfig();
      this._refreshUIBindings();
      if (frameNetwork) {
        this.requestFrameNetwork({ paddingPx: options.framePaddingPx ?? 24 });
      } else {
        this._restoreCameraState(cameraState);
      }
    }

    // Apply visuals immediately so first render and exports are non-empty even if the scheduler
    // hasn't ticked yet; also catches incompatible mappers early.
    this._applyMappersSafely();

    if (attributeConfig && this.attributeTracker) {
      this.enableAttributeTracking(attributeConfig.node, attributeConfig.edge, attributeConfig.options);
    }
    if (pickingConfig.node) this.enableNodePicking(pickingConfig.options);
    if (pickingConfig.edge) this.enableEdgePicking(pickingConfig.options);

    if (wasRunning) {
      this.scheduler.start();
    }
    this.scheduler.requestGeometry();
    this.scheduler.requestRender();

    this.emit(EVENTS.NETWORK_REPLACED, {
      oldNetwork: prevNetwork ?? null,
      network: nextNetwork,
      oldNodeCount: prevNetwork?.nodeCount ?? null,
      oldEdgeCount: prevNetwork?.edgeCount ?? null,
      nodeCount: nextNetwork?.nodeCount ?? null,
      edgeCount: nextNetwork?.edgeCount ?? null,
    });

    if (disposeOld && prevNetwork && typeof prevNetwork.dispose === 'function') {
      try {
        prevNetwork.dispose();
      } catch (_) {
        // ignore disposal failures
      }
    }
  }

  _tryPendingFrameNetwork() {
    const pending = this._pendingFrameNetwork;
    if (!pending) return false;
    if (!this.renderer?.camera) return false;
    const size = this.size ?? this.layers?.size ?? null;
    if (!size || size.width <= 2 || size.height <= 2) return false;

    pending.attempts += 1;
    const ok = this.frameNetwork(pending.options);
    if (ok) {
      this._pendingFrameNetwork = null;
      return true;
    }
    if (pending.attempts >= pending.maxAttempts) {
      this._pendingFrameNetwork = null;
    }
    return false;
  }

  requestFrameNetwork(options = {}) {
    const maxAttempts = Number.isFinite(options.maxAttempts) ? Math.max(1, Math.floor(options.maxAttempts)) : 25;
    const { maxAttempts: _ignored, ...frameOptions } = options ?? {};
    this._pendingFrameNetwork = { options: frameOptions, attempts: 0, maxAttempts };
    const ok = this._tryPendingFrameNetwork();
    if (!ok) {
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  frameNetwork(options = {}) {
    const camera = this.renderer?.camera ?? null;
    const network = this.network;
    const positions = this.visuals?.nodePositions ?? null;
    const nodeIndices = network?.nodeIndices ?? null;
    if (!camera || !positions || !nodeIndices?.length) return false;

    const paddingPx = Number.isFinite(options.paddingPx) ? Math.max(0, options.paddingPx) : 24;
    const maxSamples = options.maxSamples ?? 50000;
    const stride = 3;
    const step = Math.max(1, Math.ceil(nodeIndices.length / Math.max(1, maxSamples)));

    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    let sumX = 0; let sumY = 0; let sumZ = 0;
    let count = 0;
    let found = false;
    for (let i = 0; i < nodeIndices.length; i += step) {
      const id = nodeIndices[i];
      const o = id * stride;
      const x = positions[o];
      const y = positions[o + 1];
      const z = positions[o + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      found = true;
      sumX += x; sumY += y; sumZ += z;
      count += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!found) return false;

    const bboxCx = (minX + maxX) * 0.5;
    const bboxCy = (minY + maxY) * 0.5;
    const bboxCz = (minZ + maxZ) * 0.5;
    const meanCx = count ? (sumX / count) : bboxCx;
    const meanCy = count ? (sumY / count) : bboxCy;
    const meanCz = count ? (sumZ / count) : bboxCz;
    const cx = Number.isFinite(meanCx) ? meanCx : bboxCx;
    const cy = Number.isFinite(meanCy) ? meanCy : bboxCy;
    const cz = Number.isFinite(meanCz) ? meanCz : bboxCz;
    const w = Math.max(1e-6, maxX - minX);
    const h = Math.max(1e-6, maxY - minY);
    const dz = Math.max(1e-6, maxZ - minZ);

    if (camera.mode === '2d') {
      const viewportW = Math.max(1, camera.viewport?.width ?? this.size?.width ?? 1);
      const viewportH = Math.max(1, camera.viewport?.height ?? this.size?.height ?? 1);
      const availW = Math.max(1, viewportW - paddingPx * 2);
      const availH = Math.max(1, viewportH - paddingPx * 2);
      const zoomX = availW / w;
      const zoomY = availH / h;
      const nextZoom = Math.min(zoomX, zoomY);
      const clamped = Math.min(camera.maxZoom ?? nextZoom, Math.max(camera.minZoom ?? nextZoom, nextZoom));
      camera.zoom = clamped;
      camera.pan2D[0] = -cx * camera.zoom;
      camera.pan2D[1] = -cy * camera.zoom;
      if ('_needsUpdate' in camera) camera._needsUpdate = true;
      camera.updateMatrices?.();
      this.scheduler?.requestRender?.();
      return true;
    }

    // 3D: reset rotation/pan, re-center target, choose a distance that frames the bounding box.
    camera.resetCameraState?.();
    camera.target[0] = cx;
    camera.target[1] = cy;
    camera.target[2] = cz;
    const radius = 0.5 * Math.hypot(w, h, dz);
    const fovRad = (Number.isFinite(camera.fov) ? camera.fov : 60) * (Math.PI / 180);
    const distPerspective = radius / Math.max(1e-3, Math.tan(fovRad * 0.5));
    const desired = camera.projection === 'orthographic' ? radius * 1.2 : distPerspective * 1.25;
    camera.distance = Math.min(camera.maxDistance ?? desired, Math.max(camera.minDistance ?? desired, desired));
    if ('_needsUpdate' in camera) camera._needsUpdate = true;
    camera.updateMatrices?.();
    this.scheduler?.requestRender?.();
    return true;
  }

  async loadNetwork(source, options = {}) {
    const requestedFormat = options.format ?? null;
    const formatFromName = source && typeof source === 'object' && typeof source.name === 'string'
      ? inferNetworkFormatFromName(source.name)
      : null;
    const format = requestedFormat ?? formatFromName;
    if (!format) {
      throw new Error('loadNetwork requires a format ("xnet", "zxnet", "bxnet") or a filename with a supported extension');
    }
    const { default: HeliosNetwork } = await import('helios-network');
    const normalized = format.toLowerCase();
    let next = null;
    if (normalized === 'bxnet') next = await HeliosNetwork.fromBXNet(source);
    else if (normalized === 'zxnet') next = await HeliosNetwork.fromZXNet(source);
    else if (normalized === 'xnet') next = await HeliosNetwork.fromXNet(source);
    else throw new Error(`Unsupported network format: ${format}`);
    await this.replaceNetwork(next, options);
    if (typeof source?.name === 'string') {
      this._lastLoadedNetworkName = source.name;
      this._lastLoadedNetworkBase = getBaseFilename(source.name);
      this._lastLoadedNetworkFormat = inferNetworkFormatFromName(source.name);
    }
    return next;
  }

  async saveNetwork(format = 'bxnet', options = {}) {
    const normalized = String(format).toLowerCase();
    if (!this.network) throw new Error('saveNetwork requires an active network');
    // Ensure visuals exist and mappers have been applied before serializing.
    this.visuals?.seedMissingPositions?.(this.layers?.size);
    this._applyMappersSafely();
    const output = options.output ?? 'blob';
    const saveOptions = { ...(options.saveOptions ?? {}), format: output };
    if (normalized === 'bxnet') {
      if (typeof this.network.saveBXNet !== 'function') throw new Error('Network does not support saveBXNet()');
      return this.network.saveBXNet(saveOptions);
    }
    if (normalized === 'zxnet') {
      if (typeof this.network.saveZXNet !== 'function') throw new Error('Network does not support saveZXNet()');
      return this.network.saveZXNet(saveOptions);
    }
    if (normalized === 'xnet') {
      if (typeof this.network.saveXNet !== 'function') throw new Error('Network does not support saveXNet()');
      return this.network.saveXNet(saveOptions);
    }
    throw new Error(`Unsupported network format: ${format}`);
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    if (options?.signal && typeof options.signal.addEventListener === 'function') {
      const signal = options.signal;
      if (signal.aborted) {
        this.removeEventListener(type, handler, options);
      } else {
        signal.addEventListener('abort', () => this.removeEventListener(type, handler, options), { once: true });
      }
    }
    return () => this.off(type, handler, options);
  }

  listen(typeWithNamespace, handler, options) {
    const parsed = parseNamespacedEventType(typeWithNamespace);
    const namespace = parsed.namespace ?? '';
    const key = `${parsed.type}\u0000${namespace}`;
    const capture = options === true ? true : Boolean(options?.capture);

    const existing = this._listenHandlers.get(key);
    if (existing) {
      this.removeEventListener(parsed.type, existing.listener, existing.capture);
      existing.unsubscribeSignal?.();
      this._listenHandlers.delete(key);
    }

    if (handler == null) {
      return this;
    }
    if (typeof handler !== 'function') {
      throw new TypeError('listen() handler must be a function or null');
    }

    const listener = (event) => handler(event);
    const listenerOptions = options === true || options === false
      ? options
      : { ...options, signal: undefined };
    this.addEventListener(parsed.type, listener, listenerOptions);

    let unsubscribeSignal = null;
    const signal = options?.signal;
    if (signal && typeof signal.addEventListener === 'function') {
      if (signal.aborted) {
        this.removeEventListener(parsed.type, listener, capture);
      } else {
        const onAbort = () => this.listen(typeWithNamespace, null);
        signal.addEventListener('abort', onAbort, { once: true });
        unsubscribeSignal = () => signal.removeEventListener?.('abort', onAbort);
      }
    }

    this._listenHandlers.set(key, {
      type: parsed.type,
      namespace,
      listener,
      capture,
      unsubscribeSignal,
    });

    return this;
  }

  off(type, handler, options) {
    this.removeEventListener(type, handler, options);
  }

  onAny(handler, options) {
    if (typeof handler !== 'function') return () => {};
    this._anyListeners.add(handler);
    const unsubscribe = () => this._anyListeners.delete(handler);
    if (options?.signal && typeof options.signal.addEventListener === 'function') {
      const signal = options.signal;
      if (signal.aborted) {
        unsubscribe();
      } else {
        signal.addEventListener('abort', unsubscribe, { once: true });
      }
    }
    return unsubscribe;
  }

  emit(type, detail) {
    const event = new CustomEvent(type, { detail });
    this.dispatchEvent(event);
    if (this._anyListeners.size) {
      for (const handler of this._anyListeners) {
        try {
          handler({ type, detail, event, target: this });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Helios onAny handler failed', error);
        }
      }
    }
    return event;
  }

  async initialize() {
    this.debug.log('helios', 'Initializing layout');
    if (this._layout?.setUpdateListener) {
      this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    }
    await this._layout?.initialize?.();
    this.debug.log('helios', 'Layout initialized', { layout: this._layout?.constructor?.name });
    this._layout?.resize?.(this.layers.size);
    this.debug.log('layout', 'Layout resized to initial viewport', this.layers.size);

    this.debug.log('helios', 'Creating renderer', {
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      renderer: this.options.renderer ?? 'auto',
    });
    const extraStateSlotsRaw = this.options.extraStateSlots ?? 1;
    const extraStateSlots = Number.isFinite(extraStateSlotsRaw) ? Math.max(0, Math.floor(extraStateSlotsRaw)) : 1;
    const stateSlots = Math.min(32, 3 + extraStateSlots);
    this.renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
      forceWebGPU: this.options.renderer === 'webgpu',
      webgpuBackend: this.options.webgpuBackend,
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      suppressBrowserGestures: this.options.suppressBrowserGestures !== false,
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
      edgeEndpointTrim: this.options.edgeEndpointTrim,
      stateSlots,
    });
    this.debug.log('helios', 'Renderer created', { renderer: this.renderer?.constructor?.name });
    this._applyPendingRendererProps();
    this._applyCachedStateStyles();
    this._configurePositioning(this._positionDelegationOptions, this._positionInterpolationOptions);
    this.attributeTracker = new AttributeTracker(this.renderer);
    this.attributeTracker.resize(this.layers.size);
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
    }
    if (this.mappersDirty) {
      this._applyMappersSafely();
    }
    this.scheduler.setAttributeCallback(
      (frame) => {
        if (!frame) return;
        this.counters.attributeUpdateTicks = bumpCounter(this.counters.attributeUpdateTicks);
        this.attributeTracker?.render(frame, false);
        this.indexPickingTracker?.render(frame, false);
      },
      {
        autoUpdate: this.attributeUpdateOptions.autoUpdate,
        maxFps: this.attributeUpdateOptions.maxFps,
        frameSkip: this.attributeUpdateOptions.frameSkip,
      },
    );
    this.scheduler.setLayoutEventHandlers({
      start: (payload) => {
        this.emit(EVENTS.LAYOUT_START, { ...payload, algo: this._layout?.constructor?.name ?? null });
      },
      stop: (payload) => {
        this.emit(EVENTS.LAYOUT_STOP, { ...payload, algo: this._layout?.constructor?.name ?? null });
      },
    });
    if (this.renderer?.camera?.setChangeListener) {
      this.renderer.camera.setChangeListener(() => {
        this.scheduler.requestRender();
        this._scheduleCameraMove();
        this.debug.log('helios', 'Camera change requested render');
      });
    }

    this.removeResizeListener = this.layers.onResize((size) => {
      this.size = size;
      if (this.renderer?.resize) {
        this.renderer.resize(size);
      }
      this.attributeTracker?.resize(size);
      this.indexPickingTracker?.resize(size);
      this._layout?.resize?.(size);
      this._tryPendingFrameNetwork();
      if (!this.manualRendering) {
        this.scheduler.requestGeometry();
        this.scheduler.requestRender();
        this.debug.log('helios', 'Resize requested geometry/render', size);
      }
      this.emit(EVENTS.RESIZE, { size: { ...size } });
    });

    this.debug.log('scheduler', 'Setting scheduler callbacks');
    this.scheduler.setLayout(this._layout);
    this.scheduler.setGeometryCallback(() => {
      this.counters.geometryFrames = bumpCounter(this.counters.geometryFrames);
      if (this.mappersDirty) {
        this.debug.log('mapper', 'Applying mappers to visuals');
        this._applyMappersSafely();
      }
      const frame = {
        network: this.network,
        timestamp: performance.now(),
        camera: this.renderer?.camera,
      };
      const interpolationActive = this._supportsInterpolation()
        ? this._advanceNetworkInterpolation(frame.timestamp)
        : false;
      const overrides = this._supportsPositionOverrides()
        ? this._resolvePositionOverrides(frame.timestamp)
        : null;
      if (overrides) {
        frame.positionOverrides = overrides;
      }
      if (interpolationActive) {
        this.scheduler.requestGeometry();
        this.scheduler.requestRender();
      }
      if (this._supportsInterpolation() && this._positionInterpolator && this._positionInterpolationBackend === 'cpu') {
        const lastUpdate = this._positionInterpolator._lastUpdateTime ?? 0;
        const durationMs = this._positionInterpolator.durationMs ?? 0;
        const elapsed = frame.timestamp - lastUpdate;
        if (durationMs > 0 && elapsed >= 0 && elapsed < durationMs) {
          this.scheduler.requestGeometry();
          this.scheduler.requestRender();
        }
      }
      if (!this.firstGeometryUpdateComplete) {
        this.firstGeometryUpdateComplete = true;
        this.debug.log('scheduler', 'First geometry frame ready', {
          nodes: this.network?.nodeCount,
          edges: this.network?.edgeCount,
        });
      } else {
        this.debug.log('scheduler', 'Geometry frame prepared', {
          nodes: this.network?.nodeCount,
          edges: this.network?.edgeCount,
        });
      }
      this._tryPendingFrameNetwork();
      return frame;
    });
    this.scheduler.setRenderCallback((frame) => {
      this.debug.log('scheduler', 'Rendering frame', {
        renderer: this.renderer?.constructor?.name,
        size: this.size,
      });
      if (this.firstGeometryUpdateComplete && this.renderer && typeof this.renderer.render === 'function') {
        this.counters.renderFrames = bumpCounter(this.counters.renderFrames);
        const now = performance.now();
        const dt = now - this._lastRenderTime;
        this._lastRenderTime = now;
        this._frameId += 1;
        if (this._supportsPositionOverrides() && this._positionInterpolator && this._positionInterpolationBackend === 'cpu') {
          const overrides = this._resolvePositionOverrides(now);
          if (overrides) {
            frame.positionOverrides = overrides;
          }
        }
        this.emit(EVENTS.BEFORE_RENDER, { frameId: this._frameId, dt, frame, size: { ...this.size } });
        this.renderer.render(frame, this.size);
        this.emit(EVENTS.AFTER_RENDER, { frameId: this._frameId, dt, frame, size: { ...this.size } });
      }
    });
    if (!this.manualRendering) {
      this.scheduler.start();
      this.scheduler.requestGeometry();
      this.debug.log('scheduler', 'Scheduler started (auto rendering)');
    } else {
      // In manual mode, run initial geometry setup but don't start scheduler
      if (this.mappersDirty) {
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
      }
      this.firstGeometryUpdateComplete = true;
      this.debug.log('helios', 'Manual rendering enabled, initial geometry applied');
    }
    this.debug.log('helios', 'Initialization complete');
    this._applyPickingConfig();
  }

  _applyCachedStateStyles() {
    const layer = this.renderer?.graphLayer ?? null;
    if (!layer) return false;
    const cached = this._stateStyleCache;
    if (!cached) return false;
    if (!cached.nodeSlots.size && !cached.edgeSlots.size && !cached.nodeNoState && !cached.edgeNoState) {
      return false;
    }
    layer.resetStateStyles?.();
    if (cached.nodeNoState) {
      layer.setNodeNoStateStyle?.(cached.nodeNoState);
    }
    if (cached.edgeNoState) {
      layer.setEdgeNoStateStyle?.(cached.edgeNoState);
    }
    for (const [slot, style] of cached.nodeSlots.entries()) {
      layer.setNodeStateStyle?.(slot, style);
    }
    for (const [slot, style] of cached.edgeSlots.entries()) {
      layer.setEdgeStateStyle?.(slot, style);
    }
    return true;
  }

  _configurePositioning(positions = null, interpolation = null) {
    const supportsOverrides = this._supportsPositionOverrides();
    const supportsInterpolation = this._supportsInterpolation();
    const nextPositions = positions ?? null;
    let nextInterpolation = interpolation ?? null;
    if (!supportsOverrides && (nextPositions?.source === 'delegate' || nextPositions?.delegate)) {
      this.debug?.log?.('layout', 'Position overrides disabled for WebGPU indirect backend');
    }
    if (!supportsInterpolation && nextInterpolation?.enabled) {
      this.debug?.log?.('layout', 'Interpolation disabled for WebGPU indirect backend');
      nextInterpolation = { ...nextInterpolation, enabled: false };
    }
    const resolvedPositions = supportsOverrides
      ? nextPositions
      : (nextPositions ? { ...nextPositions, source: 'network', delegate: null, buffer: null } : null);
    this._positionDelegationOptions = resolvedPositions ?? null;
    this._positionInterpolationOptions = nextInterpolation ?? null;
    if (this._positionDelegate) {
      this._detachPositionDelegate();
    }
    const wantsNetworkBackend = nextInterpolation?.backend === 'network';
    const wantsCpuBackend = nextInterpolation?.backend === 'cpu';
    const wantsAutoBackend = nextInterpolation?.backend == null || nextInterpolation?.backend === 'auto';
    const networkSupportsInterpolation = typeof this.network?.interpolateNodeAttribute === 'function';
    const backend = (!wantsCpuBackend && (wantsNetworkBackend || wantsAutoBackend) && networkSupportsInterpolation)
      ? 'network'
      : 'cpu';
    if (wantsNetworkBackend && !networkSupportsInterpolation) {
      this.debug?.log?.('layout', 'Network interpolation unavailable; falling back to CPU backend');
    }
    if (nextInterpolation?.backend && !['network', 'cpu', 'auto'].includes(nextInterpolation.backend)) {
      this.debug?.log?.('layout', 'Unsupported interpolation backend; falling back to CPU backend');
    }
    this._positionInterpolationBackend = backend;
    let delegate = resolvedPositions?.delegate ?? createPositionDelegateFromOptions(resolvedPositions);
    let wantsDelegate = resolvedPositions?.source === 'delegate' || Boolean(resolvedPositions?.delegate);
    if (backend === 'network' && nextInterpolation?.enabled) {
      if (!delegate) {
        delegate = new CpuMirrorPositionDelegate({ syncToNetwork: false });
      }
      wantsDelegate = true;
    }
    this._positionInterpolationSource = wantsDelegate ? 'delegate' : 'network';
    if (wantsDelegate && delegate) {
      this._attachPositionDelegate(delegate);
    } else {
      this.visuals?.clearPositionDelegate?.();
      this._positionDelegate = null;
    }
    if (nextInterpolation?.enabled && backend !== 'network') {
      this._positionInterpolator = new CpuLinearPositionInterpolator(nextInterpolation);
    } else {
      this._positionInterpolator = null;
    }
    if (backend !== 'network') {
      this._networkInterpolation.active = false;
      this._networkInterpolation.lastStepTimestamp = 0;
    }
  }

  _isIndirectWebgpuBackend() {
    const backend = this.options?.webgpuBackend;
    if (backend !== 'indirect') return false;
    if (this.options?.renderer === 'webgl') return false;
    const deviceType = this.renderer?.device?.type ?? null;
    if (deviceType) return deviceType === 'webgpu';
    return this.options?.renderer === 'webgpu';
  }

  _supportsPositionOverrides() {
    return !this._isIndirectWebgpuBackend();
  }

  _supportsInterpolation() {
    return !this._isIndirectWebgpuBackend();
  }

  _attachPositionDelegate(delegate) {
    if (!delegate) return;
    this._positionDelegate = delegate;
    this._positionDelegate.attach?.({ network: this.network, visuals: this.visuals, debug: this.debug });
    this.visuals?.setPositionDelegate?.(delegate);
    this._positionDelegateSubscriptions = [];
    const events = this.network?.constructor?.EVENTS ?? this.network?.EVENTS ?? null;
    if (events && typeof this.network?.on === 'function') {
      const types = [
        events.nodesAdded,
        events.nodesRemoved,
        events.edgesAdded,
        events.edgesRemoved,
        events.topologyChanged,
        events.attributeChanged,
        events.attributeDefined,
        events.attributeRemoved,
      ].filter(Boolean);
      for (const type of types) {
        const unsub = this.network.on(type, (event) => {
          this._positionDelegate?.onNetworkEvent?.(event);
          this._positionDelegate?.markPositionsDirty?.();
          this._layout?.requestUpdate?.();
          this.scheduler?.requestLayout?.('data');
          this.scheduler?.requestGeometry?.();
          this.scheduler?.requestRender?.();
        });
        if (typeof unsub === 'function') this._positionDelegateSubscriptions.push(unsub);
      }
    }
  }

  _detachPositionDelegate() {
    for (const unsub of this._positionDelegateSubscriptions ?? []) {
      try {
        unsub?.();
      } catch (_) {
        // ignore
      }
    }
    this._positionDelegateSubscriptions = [];
    this._positionDelegate?.detach?.();
    this._positionDelegate = null;
    this.visuals?.clearPositionDelegate?.();
  }

  _getDenseOverridesFromNetwork() {
    if (!this.network) return null;
    try {
      const nodeDesc = this.network.getDenseNodeAttributeView?.(NODE_POSITION_ATTRIBUTE);
      const edgeDesc = this.network.getDenseEdgeAttributeView?.(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
      if (!nodeDesc?.view) return null;
      return {
        nodes: {
          positions: {
            view: nodeDesc.view,
            version: nodeDesc.version ?? 0,
            topologyVersion: nodeDesc.topologyVersion ?? 0,
            count: nodeDesc.count ?? Math.floor((nodeDesc.view.length ?? 0) / 3),
          },
        },
        edges: edgeDesc?.view
          ? {
              segments: {
                view: edgeDesc.view,
                version: edgeDesc.version ?? 0,
                topologyVersion: edgeDesc.topologyVersion ?? 0,
                count: edgeDesc.count ?? Math.floor((edgeDesc.view.length ?? 0) / 6),
              },
            }
          : null,
      };
    } catch (_) {
      return null;
    }
  }

  _captureNetworkInterpolationTarget(payload = null, timestamp = performance.now()) {
    if (!this._supportsInterpolation()) return false;
    if (!this.network) return false;
    let source = payload?.positions ?? null;
    if (!source && this._positionInterpolationSource === 'delegate') {
      source = this._positionDelegate?.getPositionView?.() ?? null;
    }
    let sourceLength = source?.length ?? 0;
    if (!sourceLength) {
      const info = this.network.getNodeAttributeInfo?.(NODE_POSITION_ATTRIBUTE);
      const dimension = Number.isFinite(info?.dimension) ? Math.max(1, Math.floor(info.dimension)) : 1;
      const capacity = Number.isFinite(this.network.nodeCapacity)
        ? Math.max(0, Math.floor(this.network.nodeCapacity))
        : 0;
      sourceLength = capacity * dimension;
    }
    if (!sourceLength) return false;
    if (!source) {
      if (this._positionInterpolationSource === 'delegate') {
        source = this._positionDelegate?.getPositionView?.() ?? null;
      }
      source = this.visuals?.getNodeAttributeView?.(NODE_POSITION_ATTRIBUTE) ?? null;
    }
    if (!source) return false;
    const target = ArrayBuffer.isView(source) ? source : Float32Array.from(source);
    const state = this._networkInterpolation;
    state.targetView = target;
    state.targetLength = target.length;
    if (state.lastLayoutTimestamp) {
      let elapsed = timestamp - state.lastLayoutTimestamp;
      if (!Number.isFinite(elapsed) || elapsed <= 0) elapsed = 16;
      const clamped = Math.min(2500, Math.max(10, elapsed));
      state.layoutElapsedMs = this._averageLayoutElapsed(state.layoutDeltaHistory, clamped);
    }
    state.lastLayoutTimestamp = timestamp;
    state.lastStepTimestamp = 0;
    state.active = true;
    return true;
  }

  _advanceNetworkInterpolation(timestamp = performance.now()) {
    if (!this._supportsInterpolation()) return false;
    if (this._positionInterpolationBackend !== 'network' || !this._networkInterpolation.active) {
      return false;
    }
    const state = this._networkInterpolation;
    const target = state.targetView;
    if (!target || !this.network?.interpolateNodeAttribute) {
      state.active = false;
      return false;
    }
    let elapsedMs = 16;
    if (state.lastStepTimestamp) {
      elapsedMs = timestamp - state.lastStepTimestamp;
      if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) elapsedMs = 16;
    }
    state.lastStepTimestamp = timestamp;
    const options = this._positionInterpolationOptions ?? {};
    const hasSmoothing = Number.isFinite(options.smoothing);
    const autoSmoothing = options.autoSmoothing === true || (!hasSmoothing && options.autoSmoothing !== false);
    let smoothing = hasSmoothing ? options.smoothing : 6;
    if (autoSmoothing) {
      const targetRemaining = Number.isFinite(options.targetRemaining)
        ? Math.min(0.5, Math.max(0.01, options.targetRemaining))
        : 0.1;
      smoothing = -Math.log(targetRemaining);
    }
    const minDisplacementRatio = Number.isFinite(options.minDisplacementRatio)
      ? options.minDisplacementRatio
      : 0.0005;
    const continueInterpolation = this.network.interpolateNodeAttribute(
      NODE_POSITION_ATTRIBUTE,
      target,
      {
        elapsedMs,
        layoutElapsedMs: state.layoutElapsedMs,
        smoothing,
        minDisplacementRatio,
        emitEvent: false,
      },
    );
    state.active = Boolean(continueInterpolation);
    return state.active;
  }

  _capturePositionSnapshot(timestamp = performance.now()) {
    if (!this._supportsPositionOverrides()) return;
    if (!this._positionInterpolator) return;
    const overrides = this._positionDelegate?.getDenseOverrides?.() ?? this._getDenseOverridesFromNetwork();
    if (overrides) {
      this._positionInterpolator.capture(overrides, timestamp);
    }
  }

  _averageLayoutElapsed(history, elapsedMs) {
    if (!Array.isArray(history)) return elapsedMs;
    history.push(elapsedMs);
    if (history.length > 5) {
      history.shift();
    }
    let sum = 0;
    for (const value of history) sum += value;
    return sum / history.length;
  }

  _resolvePositionOverrides(timestamp = performance.now()) {
    if (!this._supportsPositionOverrides()) return null;
    if (this._positionInterpolator) {
      const interpolated = this._positionInterpolator.getOverrides(timestamp);
      if (interpolated) return interpolated;
    }
    if (this._positionDelegate && this._positionInterpolationBackend !== 'network') {
      return this._positionDelegate.getDenseOverrides?.() ?? null;
    }
    return null;
  }

  _handleLayoutUpdate(payload = null) {
    const timestamp = payload?.timestamp ?? performance.now();
    if (this._positionInterpolationBackend === 'network' && this._supportsInterpolation()) {
      this._captureNetworkInterpolationTarget(payload, timestamp);
      this.scheduler.requestGeometry();
      this.scheduler.requestRender();
      this.debug.log('layout', 'Layout queued network interpolation');
      return;
    }
    if (!this._supportsInterpolation()) {
      this.visuals.markPositionsDirty();
      this._positionDelegate?.markPositionsDirty?.();
      this._positionDelegate?.syncToNetwork?.();
      this.scheduler.requestGeometry();
      this.debug.log('layout', 'Layout requested geometry update (interpolation disabled)');
      return;
    }
    if (this._positionInterpolator && this._positionInterpolationOptions?.durationMs == null) {
      if (this._cpuInterpolationLastLayoutTimestamp) {
        let elapsed = timestamp - this._cpuInterpolationLastLayoutTimestamp;
        if (!Number.isFinite(elapsed) || elapsed <= 0) elapsed = 16;
        const clamped = Math.min(2500, Math.max(10, elapsed));
        this._positionInterpolator.durationMs = this._averageLayoutElapsed(this._cpuInterpolationDeltaHistory, clamped);
      }
      this._cpuInterpolationLastLayoutTimestamp = timestamp;
    }
    this.visuals.markPositionsDirty();
    this._positionDelegate?.markPositionsDirty?.();
    this._positionDelegate?.syncToNetwork?.();
    this._capturePositionSnapshot(timestamp);
    this.scheduler.requestGeometry();
    this.debug.log('layout', 'Layout requested geometry update');
  }

  _applyPendingRendererProps() {
    const renderer = this.renderer;
    const graphLayer = renderer?.graphLayer;
    if (renderer && this._pendingRendererProps.size) {
      for (const [key, value] of this._pendingRendererProps.entries()) {
        renderer[key] = value;
      }
      this._pendingRendererProps.clear();
    }
    if (graphLayer && this._pendingGraphLayerProps.size) {
      for (const [key, value] of this._pendingGraphLayerProps.entries()) {
        graphLayer[key] = value;
      }
      this._pendingGraphLayerProps.clear();
    }
  }

  _refreshUIBindings() {
    const bindings = this.constructor.UI_BINDINGS ?? null;
    if (!bindings) return;
    for (const name of Object.keys(bindings)) {
      if (typeof this[name] !== 'function') continue;
      const value = this[name]();
      this._emitUIBindingChange(name, value);
    }
  }

  _getGraphLayerProp(name) {
    if (this.renderer?.graphLayer && name in this.renderer.graphLayer) {
      return this.renderer.graphLayer[name];
    }
    return this._pendingGraphLayerProps.get(name);
  }

  _setGraphLayerProp(name, value) {
    if (this.renderer?.graphLayer && name in this.renderer.graphLayer) {
      this.renderer.graphLayer[name] = value;
      this.scheduler.requestRender();
      this._emitUIBindingChange(name, value);
      return this;
    }
    this._pendingGraphLayerProps.set(name, value);
    this._emitUIBindingChange(name, value);
    return this;
  }

  _getRendererProp(name) {
    if (this.renderer && name in this.renderer) {
      return this.renderer[name];
    }
    return this._pendingRendererProps.get(name);
  }

  _setRendererProp(name, value) {
    if (this.renderer && name in this.renderer) {
      this.renderer[name] = value;
      this.scheduler.requestRender();
      this._emitUIBindingChange(name, value);
      return this;
    }
    this._pendingRendererProps.set(name, value);
    this._emitUIBindingChange(name, value);
    return this;
  }

  edgeWidthScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeWidthScale');
    return this._setGraphLayerProp('edgeWidthScale', Number(value));
  }

  edgeWidthBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeWidthBase');
    return this._setGraphLayerProp('edgeWidthBase', Number(value));
  }

  edgeOpacityScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeOpacityScale');
    return this._setGraphLayerProp('edgeOpacityScale', Number(value));
  }

  edgeOpacityBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeOpacityBase');
    return this._setGraphLayerProp('edgeOpacityBase', Number(value));
  }

  nodeOpacityScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOpacityScale');
    return this._setGraphLayerProp('nodeOpacityScale', Number(value));
  }

  nodeOpacityBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOpacityBase');
    return this._setGraphLayerProp('nodeOpacityBase', Number(value));
  }

  nodeSizeScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeSizeScale');
    return this._setGraphLayerProp('nodeSizeScale', Number(value));
  }

  nodeSizeBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeSizeBase');
    return this._setGraphLayerProp('nodeSizeBase', Number(value));
  }

  nodeOutlineWidthScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineWidthScale');
    return this._setGraphLayerProp('nodeOutlineWidthScale', Number(value));
  }

  nodeOutlineWidthBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineWidthBase');
    return this._setGraphLayerProp('nodeOutlineWidthBase', Number(value));
  }

  nodeOutlineColor(color) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineColor');
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('nodeOutlineColor(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setGraphLayerProp('nodeOutlineColor', normalized);
  }

  nodeOutlineUseAttributes(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineUseAttributes');
    return this._setGraphLayerProp('nodeOutlineUseAttributes', Boolean(value));
  }

  edgeEndpointTrim(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeEndpointTrim');
    return this._setGraphLayerProp('edgeEndpointTrim', Number(value));
  }

  nodeBlendWithEdges(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeBlendWithEdges');
    return this._setGraphLayerProp('nodeBlendWithEdges', Boolean(value));
  }

  edgeDepthWrite(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeDepthWrite');
    return this._setGraphLayerProp('edgeDepthWrite', Boolean(value));
  }

  background(color) {
    if (arguments.length === 0) return this._getRendererProp('clearColor');
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('background(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setRendererProp('clearColor', normalized);
  }

  clearColor(color) {
    if (arguments.length === 0) return this.background();
    return this.background(color);
  }

  edgeTransparencyMode(mode) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeTransparencyMode');
    const next = String(mode ?? '');
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (graphLayer?.isSupportedTransparencyMode && !graphLayer.isSupportedTransparencyMode(next)) {
      return this;
    }
    return this._setGraphLayerProp('edgeTransparencyMode', next);
  }

  /**
   * Pre-runs mapper application and (optionally) dense buffer rebuilds. Useful
   * for large graphs where the first geometry pass is expensive.
   * Can be awaited before `helios.ready` to shorten time to first render.
   */
  async prewarm(options = {}) {
    if (this.prewarmPromise) return this.prewarmPromise;
    const backend = this.options?.webgpuBackend;
    const indirectMode = backend === 'indirect';
    const wantsDenseBuffers = options.updateDenseBuffers !== false;
    const updateDenseBuffers = wantsDenseBuffers && !indirectMode;
    this.debug.log('helios', 'Prewarming visuals before ready', {
      updateDenseBuffers,
      skippedDenseForIndirect: wantsDenseBuffers && indirectMode,
    });
    this.prewarmPromise = (async () => {
      if (this.mappersDirty) {
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
      }
      if (updateDenseBuffers) {
        this.visuals.updateDenseBuffers?.();
      }
      this.scheduler?.requestGeometry?.();
    })();
    try {
      await this.prewarmPromise;
    } catch (error) {
      this.prewarmPromise = null;
      this.debug.log('helios', 'Prewarm failed', { error });
      throw error;
    }
    return this.prewarmPromise;
  }

  createLayout(layoutOption) {
    if (isLayoutInstance(layoutOption)) {
      return layoutOption;
    }
    if (layoutOption?.type === 'worker') {
      const workerOptions = { ...(layoutOption.options ?? {}), mode: this.options.mode ?? '2d' };
      this.debug.log('layout', 'Using worker layout', workerOptions);
      return new WorkerLayout(this.network, this.visuals, workerOptions);
    }
    if (layoutOption?.type === 'd3force3d' || layoutOption?.type === 'd3-force-3d') {
      const workerOptions = { ...(layoutOption.options ?? {}), mode: this.options.mode ?? '2d' };
      this.debug.log('layout', 'Using d3-force-3d layout', workerOptions);
      return new D3Force3DLayout(this.network, this.visuals, workerOptions);
    }
    const w = this.layers.size.width;
    const h = this.layers.size.height;
    this.debug.log('layout', 'Using static layout', { width: w, height: h });
    return new StaticLayout(this.network, this.visuals, {
      bounds: [-w * 0.5, -h * 0.5, w * 0.5, h * 0.5],
    });
  }

  addNodes(count, initializer) {
    const nodes = this.network.addNodes(count);
    this.debug.log('helios', 'Adding nodes', { count });
    this.visuals.applyNodeDefaults(nodes);
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(this.options.layout, this.layers.size, this.options.mode));
    if (initializer) {
      initializer(nodes, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this.mappersDirty = true;
    this._layout?.requestUpdate?.();
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    return nodes;
  }

  addEdges(edges, initializer) {
    const edgeIndices = this.network.addEdges(edges);
    this.debug.log('helios', 'Adding edges', { count: edgeIndices?.length ?? 0 });
    this.visuals.applyEdgeDefaults(edgeIndices);
    if (initializer) {
      initializer(edgeIndices, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this.mappersDirty = true;
    this._layout?.requestUpdate?.();
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    return edgeIndices;
  }

  notifyNetworkChanged({ nodes, edges } = {}) {
    if (nodes) {
      this.debug.log('helios', 'Network nodes changed', { count: nodes.length ?? nodes.size ?? nodes });
      this.visuals.applyNodeDefaults(nodes);
      this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(this.options.layout, this.layers.size, this.options.mode));
    }
    if (edges) {
      this.debug.log('helios', 'Network edges changed', { count: edges.length ?? edges.size ?? edges });
      this.visuals.applyEdgeDefaults(edges);
    }
    this.visuals.markPositionsDirty();
    this.mappersDirty = true;
    this._layout?.requestUpdate?.();
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
  }

  nodeState(indices, mask, options = {}) {
    const mode = options.mode ?? 'replace';
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    this.network.withBufferAccess(() => {
      const view = this.network.getNodeAttributeBuffer(NODE_STATE_ATTRIBUTE)?.view;
      if (!view) return;
      const usesBigInt = typeof view[0] === 'bigint';
      const valueBig = usesBigInt ? BigInt(value) : null;
      forEachIndex(indices, (index) => {
        const id = Number(index);
        if (!Number.isFinite(id) || id < 0) return;
        const current = view[id] ?? (usesBigInt ? 0n : 0);
        switch (mode) {
          case 'add':
            view[id] = usesBigInt ? (current | valueBig) : ((current | value) >>> 0);
            break;
          case 'remove':
            view[id] = usesBigInt ? (current & (~valueBig)) : ((current & (~value)) >>> 0);
            break;
          case 'toggle':
            view[id] = usesBigInt ? (current ^ valueBig) : ((current ^ value) >>> 0);
            break;
          default:
            view[id] = usesBigInt ? valueBig : value;
            break;
        }
      });
      this.visuals.bumpNodeAttributes(NODE_STATE_ATTRIBUTE);
      // Endpoint states are derived via node-to-edge mapping; bump versions so downstream dense rebuilds notice.
      this.visuals.bumpEdgeAttributes(EDGE_ENDPOINTS_STATE_ATTRIBUTE);
    });
    this.scheduler.requestGeometry();
    return this;
  }

  edgeState(indices, mask, options = {}) {
    const mode = options.mode ?? 'replace';
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    this.network.withBufferAccess(() => {
      const view = this.network.getEdgeAttributeBuffer(EDGE_STATE_ATTRIBUTE)?.view;
      if (!view) return;
      const usesBigInt = typeof view[0] === 'bigint';
      const valueBig = usesBigInt ? BigInt(value) : null;
      forEachIndex(indices, (index) => {
        const id = Number(index);
        if (!Number.isFinite(id) || id < 0) return;
        const current = view[id] ?? (usesBigInt ? 0n : 0);
        switch (mode) {
          case 'add':
            view[id] = usesBigInt ? (current | valueBig) : ((current | value) >>> 0);
            break;
          case 'remove':
            view[id] = usesBigInt ? (current & (~valueBig)) : ((current & (~value)) >>> 0);
            break;
          case 'toggle':
            view[id] = usesBigInt ? (current ^ valueBig) : ((current ^ value) >>> 0);
            break;
          default:
            view[id] = usesBigInt ? valueBig : value;
            break;
        }
      });
      this.visuals.bumpEdgeAttributes(EDGE_STATE_ATTRIBUTE);
    });
    this.scheduler.requestGeometry();
    return this;
  }

  hoverNodeState(index, mask) {
    const resolvedIndex = index == null || Number(index) < 0 ? 0xffffffff : (Number(index) >>> 0);
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    const layer = this.renderer?.graphLayer ?? null;
    if (layer && 'hoveredNodeIndex' in layer) {
      layer.hoveredNodeIndex = resolvedIndex;
      layer.hoveredNodeState = value;
      this.scheduler.requestRender();
      return this;
    }
    this._pendingGraphLayerProps.set('hoveredNodeIndex', resolvedIndex);
    this._pendingGraphLayerProps.set('hoveredNodeState', value);
    return this;
  }

  hoverEdgeState(index, mask) {
    const resolvedIndex = index == null || Number(index) < 0 ? 0xffffffff : (Number(index) >>> 0);
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    const layer = this.renderer?.graphLayer ?? null;
    if (layer && 'hoveredEdgeIndex' in layer) {
      layer.hoveredEdgeIndex = resolvedIndex;
      layer.hoveredEdgeState = value;
      this.scheduler.requestRender();
      return this;
    }
    this._pendingGraphLayerProps.set('hoveredEdgeIndex', resolvedIndex);
    this._pendingGraphLayerProps.set('hoveredEdgeState', value);
    return this;
  }

  nodeStateStyle(slot, style) {
    if (arguments.length < 2) {
      const layer = this.renderer?.graphLayer;
      const index = Number(resolveStateSlot(slot, this.constructor.STATES));
      if (!Number.isInteger(index) || index < 0) return null;
      if (!layer) {
        return this._stateStyleCache?.nodeSlots?.get(index) ?? null;
      }
      if (index >= layer.stateSlotCount) return null;
      const o = index * 4;
      return {
        sizeMul: layer.nodeStateScale[o + 0],
        opacityMul: layer.nodeStateScale[o + 1],
        outlineMul: layer.nodeStateScale[o + 2],
        discard: layer.nodeStateScale[o + 3] === 1,
        colorMul: Array.from(layer.nodeStateColorMul.slice(o, o + 4)),
        colorAdd: Array.from(layer.nodeStateColorAdd.slice(o, o + 4)),
      };
    }
    const resolvedSlot = resolveStateSlot(slot, this.constructor.STATES);
    if (this._stateStyleCache?.nodeSlots) {
      this._stateStyleCache.nodeSlots.set(resolvedSlot, style);
    }
    this.renderer?.graphLayer?.setNodeStateStyle?.(resolvedSlot, style);
    this.scheduler.requestRender();
    return this;
  }

  nodeNoStateStyle(style) {
    if (arguments.length === 0) {
      const layer = this.renderer?.graphLayer;
      if (!layer) return this._stateStyleCache?.nodeNoState ?? null;
      return {
        sizeMul: layer.nodeNoStateScale[0],
        opacityMul: layer.nodeNoStateScale[1],
        outlineMul: layer.nodeNoStateScale[2],
        discard: layer.nodeNoStateScale[3] === 1,
        colorMul: Array.from(layer.nodeNoStateColorMul.slice(0, 4)),
        colorAdd: Array.from(layer.nodeNoStateColorAdd.slice(0, 4)),
      };
    }
    if (this._stateStyleCache) {
      this._stateStyleCache.nodeNoState = style;
    }
    this.renderer?.graphLayer?.setNodeNoStateStyle?.(style);
    this.scheduler.requestRender();
    return this;
  }

  edgeStateStyle(slot, style) {
    if (arguments.length < 2) {
      const layer = this.renderer?.graphLayer;
      const index = Number(resolveStateSlot(slot, this.constructor.STATES));
      if (!Number.isInteger(index) || index < 0) return null;
      if (!layer) {
        return this._stateStyleCache?.edgeSlots?.get(index) ?? null;
      }
      if (index >= layer.stateSlotCount) return null;
      const o = index * 4;
      return {
        widthMul: layer.edgeStateScale[o + 0],
        opacityMul: layer.edgeStateScale[o + 1],
        discard: layer.edgeStateScale[o + 3] === 1,
        colorMul: Array.from(layer.edgeStateColorMul.slice(o, o + 4)),
        colorAdd: Array.from(layer.edgeStateColorAdd.slice(o, o + 4)),
      };
    }
    const resolvedSlot = resolveStateSlot(slot, this.constructor.STATES);
    if (this._stateStyleCache?.edgeSlots) {
      this._stateStyleCache.edgeSlots.set(resolvedSlot, style);
    }
    this.renderer?.graphLayer?.setEdgeStateStyle?.(resolvedSlot, style);
    this.scheduler.requestRender();
    return this;
  }

  edgeNoStateStyle(style) {
    if (arguments.length === 0) {
      const layer = this.renderer?.graphLayer;
      if (!layer) return this._stateStyleCache?.edgeNoState ?? null;
      return {
        widthMul: layer.edgeNoStateScale[0],
        opacityMul: layer.edgeNoStateScale[1],
        discard: layer.edgeNoStateScale[3] === 1,
        colorMul: Array.from(layer.edgeNoStateColorMul.slice(0, 4)),
        colorAdd: Array.from(layer.edgeNoStateColorAdd.slice(0, 4)),
      };
    }
    if (this._stateStyleCache) {
      this._stateStyleCache.edgeNoState = style;
    }
    this.renderer?.graphLayer?.setEdgeNoStateStyle?.(style);
    this.scheduler.requestRender();
    return this;
  }

  resetStateStyles() {
    if (this._stateStyleCache) {
      this._stateStyleCache.nodeSlots.clear();
      this._stateStyleCache.edgeSlots.clear();
      this._stateStyleCache.nodeNoState = null;
      this._stateStyleCache.edgeNoState = null;
    }
    this.renderer?.graphLayer?.resetStateStyles?.();
    this.scheduler.requestRender();
    return this;
  }

  mappers({ nodeMapper, edgeMapper } = {}) {
    if (arguments.length === 0) {
      return { nodeMapper: this.nodeMapper, edgeMapper: this.edgeMapper };
    }
    if (nodeMapper === null && edgeMapper === null) {
      this.debug.log('mapper', 'Resetting mappers to defaults');
      this.nodeMapper = new MapperCollection('node', this.network, () => {
        this.markMappersDirty();
      }, this.debug);
      this.edgeMapper = new MapperCollection('edge', this.network, () => {
        this.markMappersDirty();
      }, this.debug);
      this.mappersDirty = true;
      this.scheduler?.requestGeometry?.();
      this.scheduler.requestGeometry();
      return this;
    }
    if (nodeMapper) {
      this.debug.log('mapper', 'Replacing node mapper');
      this.nodeMapper.setDefault(nodeMapper);
    }
    if (edgeMapper) {
      this.debug.log('mapper', 'Replacing edge mapper');
      this.edgeMapper.setDefault(edgeMapper);
    }
    this.mappersDirty = true;
    this.scheduler.requestGeometry();
    return this;
  }

  layout(layout) {
    if (arguments.length === 0) {
      return this._layout;
    }
    if (!isLayoutInstance(layout)) {
      throw new Error('Layout must extend the Layout base class');
    }
    this._layout?.dispose?.();
    this._layout = layout;
    this.debug.log('layout', 'Layout replaced', { layout: layout?.constructor?.name });
    this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    this.debug.log('layout', 'Initializing new layout instance');
    this._layout.initialize?.();
    this._layout.resize?.(this.layers.size);
    this.debug.log('layout', 'Layout initialized and resized', this.layers.size);
    this.scheduler.setLayout(layout);
    this.scheduler.requestLayout('user');
    this.scheduler.requestRender();
    return this;
  }

  positions(options) {
    if (arguments.length === 0) {
      return this._positionDelegationOptions;
    }
    this._configurePositioning(options, this._positionInterpolationOptions);
    this._layout?.requestUpdate?.();
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    this.scheduler.requestRender();
    return this;
  }

  interpolation(options) {
    if (arguments.length === 0) {
      return this._positionInterpolationOptions;
    }
    this._configurePositioning(this._positionDelegationOptions, options);
    this._layout?.requestUpdate?.();
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    this.scheduler.requestRender();
    return this;
  }

  // Backwards-compatible aliases.
  setLayout(layout) { return this.layout(layout); }
  setPositions(options) { return this.positions(options); }
  setInterpolation(options) { return this.interpolation(options); }
  setMappers(mappers) { return this.mappers(mappers); }
  setNodeState(indices, mask, options) { return this.nodeState(indices, mask, options); }
  setEdgeState(indices, mask, options) { return this.edgeState(indices, mask, options); }
  setNodeStateStyle(slot, style) { return this.nodeStateStyle(slot, style); }
  setEdgeStateStyle(slot, style) { return this.edgeStateStyle(slot, style); }
  setNodeNoStateStyle(style) { return this.nodeNoStateStyle(style); }
  setEdgeNoStateStyle(style) { return this.edgeNoStateStyle(style); }

  startLayout(algo = null, params = null) {
    const requestedAlgo = typeof algo === 'string' ? algo : null;
    const requestedParams = params ?? (requestedAlgo ? null : algo);
    this.scheduler.setLayoutEnabled(true, 'user');
    this._layout?.requestUpdate?.();
    this.scheduler.requestLayout('user');
    if (requestedAlgo || requestedParams) {
      this.debug.log('layout', 'startLayout called', { algo: requestedAlgo, params: requestedParams });
    }
    return this;
  }

  stopLayout(reason = 'user') {
    this.scheduler.setLayoutEnabled(false, reason);
    return this;
  }

  requestRender() {
    this.scheduler.requestRender();
    return this;
  }

  performRendering() {
    if (!this.manualRendering) {
      console.warn('performRendering() should only be called when manualRendering option is enabled');
      return;
    }
    if (!this.firstGeometryUpdateComplete) {
      console.warn('performRendering() called before initialization is complete');
      return;
    }
    // Update geometry if needed
    // if (this.mappersDirty) {
    //   this.visuals.applyMappers({
    //     nodeMapper: this.nodeMapper.toCombinedMapper(),
    //     edgeMapper: this.edgeMapper.toCombinedMapper(),
    //   });
    //   this.mappersDirty = false;
    // }
    // Create frame and render
    const frame = {
      network: this.network,
      timestamp: performance.now(),
    };
    const overrides = this._supportsPositionOverrides() ? this._resolvePositionOverrides(frame.timestamp) : null;
    if (overrides) {
      frame.positionOverrides = overrides;
    }
    this.attributeTracker?.render(frame, true);
    if (this.renderer && typeof this.renderer.render === 'function') {
      this.counters.renderFrames = bumpCounter(this.counters.renderFrames);
      this.renderer.render(frame, this.size);
    }
  }

  enableAttributeTracking(nodeAttribute = '$index', edgeAttribute = null, options = {}) {
    if (!this.attributeTracker && this.renderer) {
      this.attributeTracker = new AttributeTracker(this.renderer);
    }
    this.attributeTracker?.enable(nodeAttribute, edgeAttribute, options);
    const updateOptions = {
      autoUpdate: options.autoUpdate ?? this.attributeUpdateOptions.autoUpdate,
      maxFps: options.autoUpdateMaxFps ?? this.attributeUpdateOptions.maxFps,
      frameSkip: options.autoUpdateFrameSkip ?? this.attributeUpdateOptions.frameSkip,
    };
    this.attributeUpdateOptions = updateOptions;
    this.scheduler.configureAttributeUpdates(updateOptions);
    return this.attributeTracker;
  }

  disableAttributeTracking(scope) {
    this.attributeTracker?.disable(scope);
  }

  async renderAttributeTracking() {
    if (!this.attributeTracker) return null;
    const frame = {
      network: this.network,
      timestamp: performance.now(),
      camera: this.renderer?.camera,
    };
    const overrides = this._supportsPositionOverrides() ? this._resolvePositionOverrides(frame.timestamp) : null;
    if (overrides) {
      frame.positionOverrides = overrides;
    }
    return this.attributeTracker.render(frame, true);
  }

  async pickAttributesAt(clientX, clientY) {
    if (!this.attributeTracker) return { node: -1, edge: -1 };
    await this.renderAttributeTracking();
    return this.attributeTracker.pick(clientX, clientY);
  }

  /**
   * Returns a Map of framebuffer/attachment references to monotonically
   * increasing "version" counters (wrapping at Number.MAX_SAFE_INTEGER).
   *
   * Keys are live object references (e.g. RenderTarget instances, WebGLFramebuffer,
   * GPUTexture) so they can be used for identity comparisons.
   */
  getFramebufferVersionsByRefMap() {
    const versions = new Map();

    const addAttributeTrackerTargets = (tracker) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      if (targets.node) versions.set(targets.node, counters.node ?? 0);
      if (targets.edge) versions.set(targets.edge, counters.edge ?? 0);
      if (targets.depthTargets?.node) versions.set(targets.depthTargets.node, counters.nodeDepth ?? 0);
      if (targets.depthTargets?.edge) versions.set(targets.depthTargets.edge, counters.edgeDepth ?? 0);
    };

    addAttributeTrackerTargets(this.attributeTracker);
    addAttributeTrackerTargets(this.indexPickingTracker);

    if (this.renderer?.renderTarget) {
      versions.set(this.renderer.renderTarget, this.counters?.renderFrames ?? 0);
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      versions.set(graphLayer.weightedFramebuffer, graphLayer.counters?.weightedFramebufferRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.color) {
      versions.set(graphLayer.weightedTextures.color, graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.weight) {
      versions.set(graphLayer.weightedTextures.weight, graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }

    return versions;
  }

  /**
   * Returns framebuffer/attachment information keyed by a meaningful name.
   * Values include the version counter and a minimal shape description.
   *
   * Key format conventions:
   * - `attributes.<attributeName>.<scope>.<tracking|picking>[.<depth>]`
   * - `render.<variation>`
   */
  getFramebufferInformation() {
    const info = {};

    const set = (key, value) => {
      if (!key) return;
      info[key] = value;
    };

    const describeRenderTarget = (target, extra = {}) => {
      if (!target) return { version: 0, ...extra };
      const base = {
        type: target.type ?? null,
        width: target.width ?? null,
        height: target.height ?? null,
      };
      return { ...base, ...extra };
    };

    const addTracker = (tracker, variant) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      const nodeAttr = tracker.nodeAttribute ?? null;
      const edgeAttr = tracker.edgeAttribute ?? null;
      if (nodeAttr && targets.node) {
        set(
          `attributes.${nodeAttr}.node.${variant}`,
          { ...describeRenderTarget(targets.node), version: counters.node ?? 0 },
        );
      }
      if (edgeAttr && targets.edge) {
        set(
          `attributes.${edgeAttr}.edge.${variant}`,
          { ...describeRenderTarget(targets.edge), version: counters.edge ?? 0 },
        );
      }
      if (tracker.options?.trackDepth === true) {
        if (nodeAttr && targets.depthTargets?.node) {
          set(
            `attributes.${nodeAttr}.node.${variant}.depth`,
            { ...describeRenderTarget(targets.depthTargets.node), version: counters.nodeDepth ?? 0 },
          );
        }
        if (edgeAttr && targets.depthTargets?.edge) {
          set(
            `attributes.${edgeAttr}.edge.${variant}.depth`,
            { ...describeRenderTarget(targets.depthTargets.edge), version: counters.edgeDepth ?? 0 },
          );
        }
      }
    };

    addTracker(this.attributeTracker, 'tracking');
    addTracker(this.indexPickingTracker, 'picking');

    const device = this.renderer?.device ?? null;
    const renderTarget = this.renderer?.renderTarget ?? null;
    if (device?.type === 'webgl2') {
      set(
        renderTarget ? 'render.webgl.target' : 'render.webgl.default',
        { ...describeRenderTarget(renderTarget, { type: 'webgl2' }), version: device.counters?.beginFrame ?? 0 },
      );
      set('render.webgl.present', { type: 'webgl2', version: device.counters?.presentFramebuffer ?? 0 });
    } else if (device?.type === 'webgpu') {
      set(
        renderTarget ? 'render.webgpu.target' : 'render.webgpu.swapchain',
        { ...describeRenderTarget(renderTarget, { type: 'webgpu' }), version: device.counters?.beginFrame ?? 0 },
      );
      set(
        'render.webgpu.depth',
        {
          type: 'webgpu',
          width: renderTarget?.width ?? this.size?.width ?? null,
          height: renderTarget?.height ?? this.size?.height ?? null,
          version: device.counters?.beginFrame ?? 0,
        },
      );
      set('render.webgpu.present', { type: 'webgpu', version: device.counters?.presentFramebuffer ?? 0 });
    } else if (this.renderer) {
      set('render.main', { type: 'unknown', version: this.counters?.renderFrames ?? 0 });
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      set(
        'render.weighted.webgl.framebuffer',
        {
          type: 'webgl2',
          width: graphLayer.weightedSize?.width ?? null,
          height: graphLayer.weightedSize?.height ?? null,
          version: graphLayer.counters?.weightedFramebufferRenders ?? 0,
        },
      );
    }
    if (graphLayer?.weightedTextures?.color) {
      set(
        'render.weighted.webgpu.color',
        {
          type: 'webgpu',
          width: graphLayer.weightedTextures?.width ?? null,
          height: graphLayer.weightedTextures?.height ?? null,
          format: graphLayer.weightedTextures?.color?.format ?? null,
          version: graphLayer.counters?.weightedAttachmentRenders ?? 0,
        },
      );
    }
    if (graphLayer?.weightedTextures?.weight) {
      set(
        'render.weighted.webgpu.weight',
        {
          type: 'webgpu',
          width: graphLayer.weightedTextures?.width ?? null,
          height: graphLayer.weightedTextures?.height ?? null,
          format: graphLayer.weightedTextures?.weight?.format ?? null,
          version: graphLayer.counters?.weightedAttachmentRenders ?? 0,
        },
      );
    }

    return info;
  }

  /**
   * Returns an object keyed by a meaningful framebuffer name, where each value
   * is the version counter.
   *
   * Key format conventions:
   * - `attributes.<attributeName>.<scope>.<tracking|picking>[.<depth>]`
   * - `render.<variation>`
   */
  getFramebufferVersions() {
    const summary = {};

    const addEntry = (key, version) => {
      if (!key) return;
      summary[key] = version ?? 0;
    };

    const addTracker = (tracker, variant) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      const nodeAttr = tracker.nodeAttribute ?? null;
      const edgeAttr = tracker.edgeAttribute ?? null;
      if (nodeAttr && targets.node) {
        addEntry(`attributes.${nodeAttr}.node.${variant}`, counters.node ?? 0);
      }
      if (edgeAttr && targets.edge) {
        addEntry(`attributes.${edgeAttr}.edge.${variant}`, counters.edge ?? 0);
      }
      if (tracker.options?.trackDepth === true) {
        if (nodeAttr && targets.depthTargets?.node) {
          addEntry(`attributes.${nodeAttr}.node.${variant}.depth`, counters.nodeDepth ?? 0);
        }
        if (edgeAttr && targets.depthTargets?.edge) {
          addEntry(`attributes.${edgeAttr}.edge.${variant}.depth`, counters.edgeDepth ?? 0);
        }
      }
    };

    addTracker(this.attributeTracker, 'tracking');
    addTracker(this.indexPickingTracker, 'picking');

    const device = this.renderer?.device ?? null;
    const renderTarget = this.renderer?.renderTarget ?? null;
    if (device?.type === 'webgl2') {
      addEntry(renderTarget ? 'render.webgl.target' : 'render.webgl.default', device.counters?.beginFrame ?? 0);
      addEntry('render.webgl.present', device.counters?.presentFramebuffer ?? 0);
    } else if (device?.type === 'webgpu') {
      addEntry(renderTarget ? 'render.webgpu.target' : 'render.webgpu.swapchain', device.counters?.beginFrame ?? 0);
      addEntry('render.webgpu.depth', device.counters?.beginFrame ?? 0);
      addEntry('render.webgpu.present', device.counters?.presentFramebuffer ?? 0);
    } else if (this.renderer) {
      addEntry('render.main', this.counters?.renderFrames ?? 0);
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      addEntry('render.weighted.webgl.framebuffer', graphLayer.counters?.weightedFramebufferRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.color) {
      addEntry('render.weighted.webgpu.color', graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.weight) {
      addEntry('render.weighted.webgpu.weight', graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }

    return summary;
  }

  // Backwards-compatible alias: use getFramebufferInformation() for string-keyed details.
  getFramebufferVersionsByRef() {
    return this.getFramebufferInformation();
  }

  enableNodePicking(options = {}) {
    this._picking.node.enabled = true;
    this._mergePickingOptions(options);
    this._applyPickingConfig();
    return this;
  }

  enableEdgePicking(options = {}) {
    this._picking.edge.enabled = true;
    this._mergePickingOptions(options);
    this._applyPickingConfig();
    return this;
  }

  disableNodePicking() {
    this._picking.node.enabled = false;
    this._applyPickingConfig();
    return this;
  }

  disableEdgePicking() {
    this._picking.edge.enabled = false;
    this._applyPickingConfig();
    return this;
  }

  _mergePickingOptions(options = {}) {
    if (!options) return;
    if (options.resolutionScale != null) {
      const scale = Number(options.resolutionScale);
      if (Number.isFinite(scale) && scale > 0) {
        this._picking.options.resolutionScale = scale;
      }
    }
    if (options.trackDepth != null) {
      this._picking.options.trackDepth = options.trackDepth === true;
    }
    if (options.maxFps != null) {
      const maxFps = Number(options.maxFps);
      if (Number.isFinite(maxFps) && maxFps > 0) {
        this._picking.options.maxFps = Math.floor(maxFps);
      }
    }
    if (options.clickRequiresStationary != null) {
      this._picking.options.clickRequiresStationary = options.clickRequiresStationary !== false;
    }
    if (options.clickMoveTolerancePx != null) {
      const tolerance = Number(options.clickMoveTolerancePx);
      if (Number.isFinite(tolerance) && tolerance >= 0) {
        this._picking.options.clickMoveTolerancePx = tolerance;
      }
    }
    if (options.suppressClickAfterWheelMs != null) {
      const ms = Number(options.suppressClickAfterWheelMs);
      if (Number.isFinite(ms) && ms >= 0) {
        this._picking.options.suppressClickAfterWheelMs = ms;
      }
    }
  }

  _applyPickingConfig() {
    const nodeEnabled = this._picking.node.enabled;
    const edgeEnabled = this._picking.edge.enabled;
    if (!nodeEnabled && !edgeEnabled) {
      this._detachPickingListeners();
      this._resetHover('disabled');
      this.indexPickingTracker?.destroy?.();
      this.indexPickingTracker = null;
      this._reconcileAttributeUpdateConfig();
      return;
    }
    if (!this.renderer) {
      this.ready?.then?.(() => this._applyPickingConfig());
      return;
    }
    if (!this.indexPickingTracker) {
      this.indexPickingTracker = new AttributeTracker(this.renderer);
    }
    this.indexPickingTracker.enable(nodeEnabled ? '$index' : null, edgeEnabled ? '$index' : null, {
      resolutionScale: this._picking.options.resolutionScale,
      trackDepth: this._picking.options.trackDepth,
      autoRender: true,
    });
    this.indexPickingTracker.resize(this.size);
    this._attachPickingListeners();
    this._reconcileAttributeUpdateConfig();
    this.scheduler.requestRender();
  }

  _reconcileAttributeUpdateConfig() {
    const manual = this.attributeUpdateOptions ?? { autoUpdate: false, maxFps: null, frameSkip: null };
    const pickingEnabled = this._picking.node.enabled || this._picking.edge.enabled;
    const picking = pickingEnabled
      ? { autoUpdate: true, maxFps: this._picking.options.maxFps ?? 30, frameSkip: 0 }
      : { autoUpdate: false, maxFps: null, frameSkip: null };
    const autoUpdate = manual.autoUpdate === true || picking.autoUpdate === true;
    if (!autoUpdate) {
      this.scheduler.configureAttributeUpdates({ autoUpdate: false });
      return;
    }
    const enabledMaxFps = [];
    if (manual.autoUpdate === true) enabledMaxFps.push(manual.maxFps);
    if (picking.autoUpdate === true) enabledMaxFps.push(picking.maxFps);
    const effectiveFps = enabledMaxFps.map((value) => (Number.isFinite(value) && value > 0 ? value : 60));
    const combinedMaxFps = Math.max(...effectiveFps);
    const frameSkip = 0;
    this.scheduler.configureAttributeUpdates({ autoUpdate: true, maxFps: combinedMaxFps, frameSkip });
  }

  _getInteractionCanvas() {
    return this.layers?.canvas ?? this.renderer?.canvas ?? null;
  }

  _attachPickingListeners() {
    const canvas = this._getInteractionCanvas();
    if (!canvas || this._pickingListenersAttached) return;
    canvas.addEventListener('pointerdown', this._boundPickingHandlers.down, { passive: true });
    canvas.addEventListener('pointermove', this._boundPickingHandlers.move, { passive: true });
    canvas.addEventListener('pointerup', this._boundPickingHandlers.up, { passive: true });
    canvas.addEventListener('pointercancel', this._boundPickingHandlers.cancel, { passive: true });
    canvas.addEventListener('pointerleave', this._boundPickingHandlers.leave, { passive: true });
    canvas.addEventListener('wheel', this._boundPickingHandlers.wheel, { passive: true });
    canvas.addEventListener('click', this._boundPickingHandlers.click);
    canvas.addEventListener('dblclick', this._boundPickingHandlers.dblclick);
    this._pickingListenersAttached = true;
  }

  _detachPickingListeners() {
    const canvas = this._getInteractionCanvas();
    if (!canvas || !this._pickingListenersAttached) return;
    canvas.removeEventListener('pointerdown', this._boundPickingHandlers.down);
    canvas.removeEventListener('pointermove', this._boundPickingHandlers.move);
    canvas.removeEventListener('pointerup', this._boundPickingHandlers.up);
    canvas.removeEventListener('pointercancel', this._boundPickingHandlers.cancel);
    canvas.removeEventListener('pointerleave', this._boundPickingHandlers.leave);
    canvas.removeEventListener('wheel', this._boundPickingHandlers.wheel);
    canvas.removeEventListener('click', this._boundPickingHandlers.click);
    canvas.removeEventListener('dblclick', this._boundPickingHandlers.dblclick);
    this._pickingListenersAttached = false;
  }

  _handlePointerDown(event) {
    const g = this._picking.gesture;
    g.active = true;
    g.startClientX = event.clientX ?? 0;
    g.startClientY = event.clientY ?? 0;
    g.moved = false;
    g.cameraMoved = false;
    // Keep wheelZoomed/lastWheelAt so we can suppress click after a zoom gesture.
  }

  _handlePointerUp() {
    this._picking.gesture.active = false;
  }

  _handlePointerMove(event) {
    const canvas = this._getInteractionCanvas();
    if (!canvas) return;
    const g = this._picking.gesture;
    if (g.active) {
      const dx = (event.clientX ?? 0) - g.startClientX;
      const dy = (event.clientY ?? 0) - g.startClientY;
      const dist = Math.hypot(dx, dy);
      if (dist > (this._picking.options.clickMoveTolerancePx ?? 4)) {
        g.moved = true;
        g.cameraMoved = true;
      }
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this._picking.pointer = {
      x,
      y,
      clientX: event.clientX,
      clientY: event.clientY,
      inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
    };
    // Suppress hover while panning/rotating (mouse button down).
    if (event.buttons && event.buttons !== 0) {
      this._picking.suppressHover = true;
      this._resetHover('camera');
      return;
    }
    this._picking.suppressHover = false;
    this._scheduleHoverPick();
  }

  _handlePointerLeave() {
    this._picking.pointer.inside = false;
    this._picking.suppressHover = false;
    if (this._picking.hoverThrottleTimer) {
      clearTimeout(this._picking.hoverThrottleTimer);
      this._picking.hoverThrottleTimer = null;
    }
    this._picking.gesture.active = false;
    this._resetHover('leave');
  }

  _handleWheel(_) {
    // Zoom can trigger camera changes; avoid hover spam while the camera is moving.
    this._picking.suppressHover = true;
    this._picking.gesture.wheelZoomed = true;
    this._picking.gesture.lastWheelAt = performance.now();
    this._resetHover('camera');
    this._scheduleCameraIdleHoverPick();
  }

  async _handlePointerClick(event, isDouble) {
    if (!this.indexPickingTracker) return;
    const clickRequiresStationary = this._picking.options.clickRequiresStationary !== false;
    if (clickRequiresStationary) {
      const g = this._picking.gesture;
      const now = performance.now();
      const suppressWheelMs = this._picking.options.suppressClickAfterWheelMs ?? 200;
      const wheelRecently = Number.isFinite(g.lastWheelAt) && now - g.lastWheelAt <= suppressWheelMs;
      if (g.cameraMoved || g.moved || wheelRecently) {
        return;
      }
    }
    const canvas = this._getInteractionCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    await this._ensureIndexPickingTargets();
    const picked = await this.indexPickingTracker.pick(x, y);
    const hit = this._resolvePrimaryHit(picked);
    const resolved = hit ?? { kind: null, index: -1, depth: null };
    const baseDetail = {
      kind: resolved.kind,
      index: resolved.index,
      node: resolved.kind === 'node' ? resolved.index : -1,
      edge: resolved.kind === 'edge' ? resolved.index : -1,
      depth: resolved.depth ?? null,
      x,
      y,
      clientX: event.clientX,
      clientY: event.clientY,
      modifiers: {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      },
      button: event.button,
    };

    this.emit(isDouble ? EVENTS.GRAPH_DBLCLICK : EVENTS.GRAPH_CLICK, baseDetail);

    if (resolved.kind === 'node' && resolved.index >= 0) {
      this.emit(isDouble ? EVENTS.NODE_DBLCLICK : EVENTS.NODE_CLICK, baseDetail);
    } else if (resolved.kind === 'edge' && resolved.index >= 0) {
      this.emit(isDouble ? EVENTS.EDGE_DBLCLICK : EVENTS.EDGE_CLICK, baseDetail);
    }
  }

  _scheduleCameraMove() {
    if (this._cameraMoveRaf != null) return;
    this._cameraMoveRaf = requestAnimationFrame((ts) => {
      this._cameraMoveRaf = null;
      const camera = this.renderer?.camera ?? null;
      const detail = {
        timestamp: ts,
        camera,
        state: camera
          ? {
              mode: camera.mode,
              projection: camera.projection,
              zoom: camera.zoom,
              distance: camera.distance,
              viewport: camera.viewport ? { ...camera.viewport } : null,
            }
          : null,
      };
      this.emit(EVENTS.CAMERA_MOVE, detail);
      // Avoid hover spam during camera movement; resample once the camera settles.
      this._picking.suppressHover = true;
      const g = this._picking.gesture;
      g.lastCameraMoveAt = performance.now();
      if (g.active) {
        g.cameraMoved = true;
      }
      this._resetHover('camera');
      this._scheduleCameraIdleHoverPick();
    });
  }

  _scheduleCameraIdleHoverPick() {
    if (!(this._picking.node.enabled || this._picking.edge.enabled)) return;
    if (this._picking.cameraIdleTimer) {
      clearTimeout(this._picking.cameraIdleTimer);
    }
    this._picking.cameraIdleTimer = setTimeout(() => {
      this._picking.cameraIdleTimer = null;
      this._picking.suppressHover = false;
      if (this._picking.pointer.inside) {
        this._scheduleHoverPick();
      }
    }, 80);
  }

  _scheduleHoverPick() {
    if (!(this._picking.node.enabled || this._picking.edge.enabled)) return;
    if (this._picking._raf != null) return;
    this._picking._raf = requestAnimationFrame(() => {
      this._picking._raf = null;
      void this._runHoverPick();
    });
  }

  async _ensureIndexPickingTargets() {
    if (!this.indexPickingTracker) return;
    const base = this.scheduler?.currentFrame ?? null;
    // Scheduler.currentFrame may exist before the renderer/camera is ready.
    // Always force a current camera/network so the AttributeTracker can render.
    const frame = {
      ...(base ?? null),
      network: this.network,
      timestamp: performance.now(),
      camera: this.renderer?.camera,
    };
    const overrides = this._supportsPositionOverrides() ? this._resolvePositionOverrides(frame.timestamp) : null;
    if (overrides) {
      frame.positionOverrides = overrides;
    }
    await this.indexPickingTracker.render(frame, true);
  }

  _resolvePrimaryHit(picked) {
    if (!picked) return null;
    const nodeEnabled = this._picking.node.enabled;
    const edgeEnabled = this._picking.edge.enabled;
    const nodeHit = nodeEnabled ? picked.node : -1;
    const edgeHit = edgeEnabled ? picked.edge : -1;
    const nodeDepth = picked.nodeDepth;
    const edgeDepth = picked.edgeDepth;
    if (nodeHit < 0 && edgeHit < 0) return { kind: null, index: -1, depth: null };
    const trackDepth = this._picking.options.trackDepth === true;
    if (trackDepth && nodeHit >= 0 && edgeHit >= 0 && Number.isFinite(nodeDepth) && Number.isFinite(edgeDepth)) {
      return nodeDepth <= edgeDepth
        ? { kind: 'node', index: nodeHit, depth: nodeDepth }
        : { kind: 'edge', index: edgeHit, depth: edgeDepth };
    }
    if (nodeHit >= 0) return { kind: 'node', index: nodeHit, depth: Number.isFinite(nodeDepth) ? nodeDepth : null };
    return { kind: 'edge', index: edgeHit, depth: Number.isFinite(edgeDepth) ? edgeDepth : null };
  }

  async _runHoverPick() {
    if (!this.indexPickingTracker) return;
    if (this._picking.suppressHover) return;
    if (!this._picking.pointer.inside) {
      this._resetHover('outside');
      return;
    }
    const maxFps = this._picking.options.maxFps ?? 30;
    const interval = maxFps > 0 ? (1000 / maxFps) : 0;
    const now = performance.now();
    if (interval > 0 && now - this._picking._lastPickTime < interval) {
      if (!this._picking.hoverThrottleTimer) {
        const remaining = Math.max(0, interval - (now - this._picking._lastPickTime));
        this._picking.hoverThrottleTimer = setTimeout(() => {
          this._picking.hoverThrottleTimer = null;
          this._scheduleHoverPick();
        }, remaining);
      }
      return;
    }
    if (this._picking._inFlight) {
      this._picking._rerun = true;
      return;
    }
    this._picking._inFlight = true;
    this._picking._lastPickTime = now;
    try {
      await this._ensureIndexPickingTargets();
      const { x, y, clientX, clientY } = this._picking.pointer;
      const picked = await this.indexPickingTracker.pick(x, y);
      const hit = this._resolvePrimaryHit(picked);
      const prev = this._picking.hover;
      const next = hit ?? { kind: null, index: -1, depth: null };
      if (prev.kind === next.kind && prev.index === next.index) return;
      if (prev.kind === 'node' && prev.index >= 0) {
        this.emit(EVENTS.NODE_HOVER, { state: 'out', index: prev.index, depth: prev.depth, x, y, clientX, clientY });
      } else if (prev.kind === 'edge' && prev.index >= 0) {
        this.emit(EVENTS.EDGE_HOVER, { state: 'out', index: prev.index, depth: prev.depth, x, y, clientX, clientY });
      }
      if (next.kind === 'node' && next.index >= 0) {
        this.emit(EVENTS.NODE_HOVER, { state: 'in', index: next.index, depth: next.depth, x, y, clientX, clientY });
      } else if (next.kind === 'edge' && next.index >= 0) {
        this.emit(EVENTS.EDGE_HOVER, { state: 'in', index: next.index, depth: next.depth, x, y, clientX, clientY });
      }
      this._picking.hover = { ...next };
    } finally {
      this._picking._inFlight = false;
      if (this._picking._rerun) {
        this._picking._rerun = false;
        this._scheduleHoverPick();
      }
    }
  }

  _resetHover(reason) {
    const prev = this._picking.hover;
    const { x, y, clientX, clientY } = this._picking.pointer ?? {};
    if (prev.kind === 'node' && prev.index >= 0) {
      this.emit(EVENTS.NODE_HOVER, {
        state: 'out',
        index: prev.index,
        depth: prev.depth,
        reason,
        x,
        y,
        clientX,
        clientY,
      });
    } else if (prev.kind === 'edge' && prev.index >= 0) {
      this.emit(EVENTS.EDGE_HOVER, {
        state: 'out',
        index: prev.index,
        depth: prev.depth,
        reason,
        x,
        y,
        clientX,
        clientY,
      });
    }
    this._picking.hover = { kind: null, index: -1, depth: null };
  }

  destroy() {
    this.scheduler.stop();
    this._layout?.dispose?.();
    for (const entry of this._listenHandlers.values()) {
      this.removeEventListener(entry.type, entry.listener, entry.capture);
      entry.unsubscribeSignal?.();
    }
    this._listenHandlers.clear();
    this._pendingGraphLayerProps.clear();
    this._pendingRendererProps.clear();
    if (this.removeResizeListener) {
      this.removeResizeListener();
      this.removeResizeListener = null;
    }
    this._detachPickingListeners();
    this.attributeTracker?.destroy?.();
    this.indexPickingTracker?.destroy?.();
    this.indexPickingTracker = null;
    this.renderer?.destroy?.();
    if (this._networkInterpolation) {
      this._networkInterpolation.targetView = null;
      this._networkInterpolation.targetLength = 0;
      this._networkInterpolation.active = false;
    }
    this.layers.destroy();
  }
}

export default Helios;
