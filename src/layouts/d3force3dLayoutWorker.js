import { Layout } from './Layout.js';

const DEFAULT_SETTINGS = {
  use2D: false,
  forcesStrength: 1,
  forcesRatio: 1,
  repulsiveExponent: 1,
  attractiveExponent: 1,
  gravity: 0.05,
  viscosity: 0.05,
  collisionEnabled: false,
  collisionRadius: 50,
  linkDistance: 30,
  forceNormalizationType: 'degree',
  alpha: 1,
  alphaDecay: 1 - Math.pow(0.001, 1 / 300),
  alphaTarget: 0,
  alphaMin: 0.001,
  recenter: true,
  center: [0, 0, 0],
};

const DEFAULT_OPTIONS = {
  updateIntervalMs: 0,
  settings: {},
  mode: '2d',
};

function resolveSeedBounds(options = {}) {
  const mode = options.mode === '3d' ? '3d' : '2d';
  const bounds = options.bounds ?? null;
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
        mode,
        center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, 0],
      };
    }
  }

  const settingsCenter = Array.isArray(options.settings?.center) ? options.settings.center : [0, 0, 0];
  const radius = Number.isFinite(options.radius) ? Math.max(1, options.radius) : 150;
  const depth = Number.isFinite(options.depth) ? Math.max(0, options.depth) : 0;
  return {
    width: radius,
    height: radius,
    depth: mode === '3d' ? depth : 0,
    mode,
    center: settingsCenter,
  };
}

export class D3Force3DLayout extends Layout {
  constructor(network, visuals, options = {}) {
    super(network, visuals);
    const normalizedMode = options.mode === '3d' ? '3d' : '2d';
    const defaults = { ...DEFAULT_OPTIONS, ...options, mode: normalizedMode };
    const settings = { ...DEFAULT_SETTINGS, ...(defaults.settings ?? {}) };
    if (typeof options.use2D === 'boolean') {
      settings.use2D = options.use2D;
    } else if (typeof options.mode === 'string') {
      settings.use2D = options.mode !== '3d';
    }

    this.options = defaults;
    this.settings = settings;
    this.worker = null;
    this.pending = false;
    this.lastUpdate = 0;
    this.optionsDirty = true;
    this.seededPositions = false;
  }

  async initialize() {
    this.worker = new Worker(new URL('../workers/d3force3dWorker.js', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.postMessage({
      type: 'init',
      options: {
        settings: { ...this.settings },
      },
    });
  }

  shouldRun() {
    return !this.pending;
  }

  step() {
    if (!this.worker || this.pending) {
      return false;
    }
    if (!this.seededPositions) {
      this.visuals?.seedMissingPositions?.(resolveSeedBounds(this.options));
      this.seededPositions = true;
    }
    const intervalMs = Number.isFinite(this.options.updateIntervalMs)
      ? Math.max(0, this.options.updateIntervalMs)
      : 0;
    const now = performance.now();
    if (intervalMs > 0 && this.lastUpdate && (now - this.lastUpdate) < intervalMs) {
      return false;
    }

    this.pending = true;
    let positionsCopy = null;
    const snapshot = () => {
      positionsCopy = new Float32Array(this.visuals.nodePositions);
    };
    if (typeof this.visuals?.withBufferAccess === 'function') {
      this.visuals.withBufferAccess(snapshot);
    } else {
      snapshot();
    }

    const { nodeIndices, edges } = this.buildGraphPayload();
    const message = {
      type: 'tick',
      timestamp: now,
      positions: positionsCopy,
      nodeIndices,
      edges,
    };
    if (this.optionsDirty) {
      message.options = { settings: { ...this.settings } };
      this.optionsDirty = false;
    }

    this.worker.postMessage(message, [positionsCopy.buffer]);
    this.lastUpdate = now;
    return false;
  }

  handleMessage(message) {
    if (message?.type === 'positions' && message.positions instanceof Float32Array) {
      let view = null;
      const apply = () => {
        view = this.visuals.nodePositions;
        const count = Math.min(view.length, message.positions.length);
        for (let i = 0; i < count; i += 1) {
          view[i] = message.positions[i];
        }
      };
      if (typeof this.visuals?.withBufferAccess === 'function') {
        this.visuals.withBufferAccess(apply);
      } else {
        apply();
      }

      if (Number.isFinite(message.alpha)) {
        this.settings.alpha = message.alpha;
      }
      this.pending = false;
      this._updateRequested = false;
      this.visuals?.markPositionsDirty?.();
      if (view) {
        this.emitUpdate({ positions: view, timestamp: performance.now() });
      }
      return true;
    }
    if (message?.type === 'ready') {
      this.pending = false;
      this._updateRequested = true;
      return true;
    }
    return false;
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  setSettings(next = {}) {
    if (!next || typeof next !== 'object') return this;
    Object.entries(next).forEach(([key, value]) => {
      if (key in DEFAULT_SETTINGS) {
        this.settings[key] = value;
      }
    });
    this.optionsDirty = true;
    this.requestUpdate();
    return this;
  }

  buildGraphPayload() {
    const nodeIndices = this.network.nodeIndices;
    const edgeIndices = this.network.edgeIndices;
    const edgesView = this.network.edgesView;
    const edges = new Uint32Array(edgeIndices.length * 2);
    for (let i = 0; i < edgeIndices.length; i += 1) {
      const id = edgeIndices[i];
      const base = id * 2;
      edges[i * 2] = edgesView[base];
      edges[i * 2 + 1] = edgesView[base + 1];
    }
    return { nodeIndices, edges };
  }
}

export default D3Force3DLayout;
