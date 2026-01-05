/** @typedef {import('helios-network').default} HeliosNetwork */

import { LayerManager } from './layers/LayerManager.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { StaticLayout, WorkerLayout } from './layouts/Layout.js';
import { createRenderer } from './rendering/createRenderer.js';
import { AttributeTracker } from './rendering/AttributeTracker.js';
import { PerformanceMonitor } from './utilities/PerformanceMonitor.js';
import { bumpCounter } from './utilities/counters.js';
import { VisualAttributes } from './pipeline/VisualAttributes.js';
import { createDefaultMappers, MapperCollection } from './pipeline/Mapper.js';
import { createDebugLogger } from './utilities/DebugLogger.js';
import { VISUAL_ATTRIBUTE_NAMES } from './pipeline/constants.js';

const {
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

export const EVENTS = Object.freeze({
  LAYOUT_START: 'layout:start',
  LAYOUT_STOP: 'layout:stop',

  NODE_HOVER: 'node:hover',
  EDGE_HOVER: 'edge:hover',

  NODE_CLICK: 'node:click',
  EDGE_CLICK: 'edge:click',

  NODE_DBLCLICK: 'node:dblclick',
  EDGE_DBLCLICK: 'edge:dblclick',

  BEFORE_RENDER: 'render:before',
  AFTER_RENDER: 'render:after',

  RESIZE: 'resize',
  CAMERA_MOVE: 'camera:move',
});

export class Helios extends EventTarget {
  static STATES = Object.freeze({
    FILTERED: 1 << 0,
    SELECTED: 1 << 1,
    HIGHLIGHTED: 1 << 2,
  });

  static STATE_BITS = Helios.STATES;

  constructor(network, options = {}) {
    if (!network) {
      throw new Error('Helios requires a helios-network instance');
    }
    super();
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
    this.layers = new LayerManager(container);
    this.visuals = new VisualAttributes(network, this.debug);
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
    this.visuals.seedMissingPositions(this.layers.size);
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
    if (options.prewarm === true) {
      this.prewarm({ updateDenseBuffers: options.prewarmDenseBuffers !== false });
    }
    this.layout = this.createLayout(options.layout);
    this.renderer = null;
    this.attributeTracker = null;
    this.indexPickingTracker = null;
    this._anyListeners = new Set();
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
    this.size = { ...this.layers.size };
    this.removeResizeListener = null;
    this.firstGeometryUpdateComplete = false;
    this.ready = this.initialize();
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
    if (this.layout?.setUpdateListener) {
      this.layout.setUpdateListener(() => {
        this.visuals.markPositionsDirty();
        this.scheduler.requestGeometry();
        this.debug.log('layout', 'Layout requested geometry update');
      });
    }
    await this.layout?.initialize?.();
    this.debug.log('helios', 'Layout initialized', { layout: this.layout?.constructor?.name });
    this.layout?.resize?.(this.layers.size);
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
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
      edgeEndpointTrim: this.options.edgeEndpointTrim,
      stateSlots,
    });
    this.debug.log('helios', 'Renderer created', { renderer: this.renderer?.constructor?.name });
    this.attributeTracker = new AttributeTracker(this.renderer);
    this.attributeTracker.resize(this.layers.size);
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
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
        this.emit(EVENTS.LAYOUT_START, { ...payload, algo: this.layout?.constructor?.name ?? null });
      },
      stop: (payload) => {
        this.emit(EVENTS.LAYOUT_STOP, { ...payload, algo: this.layout?.constructor?.name ?? null });
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
      this.layout?.resize?.(size);
      if (!this.manualRendering) {
        this.scheduler.requestGeometry();
        this.scheduler.requestRender();
        this.debug.log('helios', 'Resize requested geometry/render', size);
      }
      this.emit(EVENTS.RESIZE, { size: { ...size } });
    });

    this.debug.log('scheduler', 'Setting scheduler callbacks');
    this.scheduler.setLayout(this.layout);
    this.scheduler.setGeometryCallback(() => {
      this.counters.geometryFrames = bumpCounter(this.counters.geometryFrames);
      if (this.mappersDirty) {
        this.debug.log('mapper', 'Applying mappers to visuals');
        this.visuals.applyMappers({
          nodeMapper: this.nodeMapper.toCombinedMapper(),
          edgeMapper: this.edgeMapper.toCombinedMapper(),
        });
        this.mappersDirty = false;
      }
      const frame = {
        network: this.network,
        timestamp: performance.now(),
        camera: this.renderer?.camera,
      };
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
        this.visuals.applyMappers({
          nodeMapper: this.nodeMapper.toCombinedMapper(),
          edgeMapper: this.edgeMapper.toCombinedMapper(),
        });
        this.mappersDirty = false;
      }
      this.firstGeometryUpdateComplete = true;
      this.debug.log('helios', 'Manual rendering enabled, initial geometry applied');
    }
    this.debug.log('helios', 'Initialization complete');
    this._applyPickingConfig();
  }

  /**
   * Pre-runs mapper application and (optionally) dense buffer rebuilds. Useful
   * for large graphs where the first geometry pass is expensive.
   * Can be awaited before `helios.ready` to shorten time to first render.
   */
  async prewarm(options = {}) {
    if (this.prewarmPromise) return this.prewarmPromise;
    const { updateDenseBuffers = true } = options;
    this.debug.log('helios', 'Prewarming visuals before ready', { updateDenseBuffers });
    this.prewarmPromise = (async () => {
      if (this.mappersDirty) {
        this.visuals.applyMappers({
          nodeMapper: this.nodeMapper.toCombinedMapper(),
          edgeMapper: this.edgeMapper.toCombinedMapper(),
        });
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
    this.visuals.seedMissingPositions(this.layers.size);
    if (initializer) {
      initializer(nodes, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this.mappersDirty = true;
    this.layout?.requestUpdate?.();
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
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    return edgeIndices;
  }

  notifyNetworkChanged({ nodes, edges } = {}) {
    if (nodes) {
      this.debug.log('helios', 'Network nodes changed', { count: nodes.length ?? nodes.size ?? nodes });
      this.visuals.applyNodeDefaults(nodes);
      this.visuals.seedMissingPositions(this.layers.size);
    }
    if (edges) {
      this.debug.log('helios', 'Network edges changed', { count: edges.length ?? edges.size ?? edges });
      this.visuals.applyEdgeDefaults(edges);
    }
    this.visuals.markPositionsDirty();
    this.mappersDirty = true;
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
  }

  setNodeState(indices, mask, options = {}) {
    const mode = options.mode ?? 'replace';
    const value = (Number(mask) >>> 0);
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
  }

  setEdgeState(indices, mask, options = {}) {
    const mode = options.mode ?? 'replace';
    const value = (Number(mask) >>> 0);
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
  }

  setNodeStateStyle(slot, style) {
    this.renderer?.graphLayer?.setNodeStateStyle?.(slot, style);
    this.scheduler.requestRender();
  }

  setNodeNoStateStyle(style) {
    this.renderer?.graphLayer?.setNodeNoStateStyle?.(style);
    this.scheduler.requestRender();
  }

  setEdgeStateStyle(slot, style) {
    this.renderer?.graphLayer?.setEdgeStateStyle?.(slot, style);
    this.scheduler.requestRender();
  }

  setEdgeNoStateStyle(style) {
    this.renderer?.graphLayer?.setEdgeNoStateStyle?.(style);
    this.scheduler.requestRender();
  }

  resetStateStyles() {
    this.renderer?.graphLayer?.resetStateStyles?.();
    this.scheduler.requestRender();
  }

  setMappers({ nodeMapper, edgeMapper } = {}) {
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
      return;
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
  }

  setLayout(layout) {
    if (!isLayoutInstance(layout)) {
      throw new Error('Layout must extend the Layout base class');
    }
    this.layout?.dispose?.();
    this.layout = layout;
    this.debug.log('layout', 'Layout replaced', { layout: layout?.constructor?.name });
    this.layout.setUpdateListener(() => {
      this.visuals.markPositionsDirty();
      this.scheduler.requestGeometry();
    });
    this.debug.log('layout', 'Initializing new layout instance');
    this.layout.initialize?.();
    this.layout.resize?.(this.layers.size);
    this.debug.log('layout', 'Layout initialized and resized', this.layers.size);
    this.scheduler.setLayout(layout);
    this.scheduler.requestLayout('user');
    this.scheduler.requestRender();
  }

  startLayout(algo = null, params = null) {
    const requestedAlgo = typeof algo === 'string' ? algo : null;
    const requestedParams = params ?? (requestedAlgo ? null : algo);
    this.scheduler.setLayoutEnabled(true, 'user');
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout('user');
    if (requestedAlgo || requestedParams) {
      this.debug.log('layout', 'startLayout called', { algo: requestedAlgo, params: requestedParams });
    }
  }

  stopLayout(reason = 'user') {
    this.scheduler.setLayoutEnabled(false, reason);
  }

  requestRender() {
    this.scheduler.requestRender();
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
  }

  enableEdgePicking(options = {}) {
    this._picking.edge.enabled = true;
    this._mergePickingOptions(options);
    this._applyPickingConfig();
  }

  disableNodePicking() {
    this._picking.node.enabled = false;
    this._applyPickingConfig();
  }

  disableEdgePicking() {
    this._picking.edge.enabled = false;
    this._applyPickingConfig();
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
    if (!hit || hit.index < 0) return;
    const baseDetail = {
      index: hit.index,
      depth: hit.depth ?? null,
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
    if (hit.kind === 'node') {
      this.emit(isDouble ? EVENTS.NODE_DBLCLICK : EVENTS.NODE_CLICK, baseDetail);
    } else if (hit.kind === 'edge') {
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
    const frame = this.scheduler?.currentFrame ?? {
      network: this.network,
      timestamp: performance.now(),
      camera: this.renderer?.camera,
    };
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
    this.layout?.dispose?.();
    if (this.removeResizeListener) {
      this.removeResizeListener();
      this.removeResizeListener = null;
    }
    this._detachPickingListeners();
    this.attributeTracker?.destroy?.();
    this.indexPickingTracker?.destroy?.();
    this.indexPickingTracker = null;
    this.renderer?.destroy?.();
    this.layers.destroy();
  }
}

export default Helios;
