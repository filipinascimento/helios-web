import { Layout, withLogScaleBinding } from './Layout.js';

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
    const now = performance.now();
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
    this.options = {
      ...this.options,
      settings: {
        ...(this.options.settings ?? {}),
        ...this.settings,
      },
    };
    this.optionsDirty = true;
    this.requestUpdate();
    return this;
  }

  reheat() {
    this.setSettings({
      alpha: Number(this.options?.settings?.alpha ?? DEFAULT_SETTINGS.alpha),
    });
    return this;
  }

  getParameterBindings() {
    return {
      key: 'd3force3d',
      label: 'D3 Force 3D (worker)',
      dynamic: true,
      bindings: [
        {
          key: 'alphaCurrent',
          label: 'Alpha',
          type: 'display',
          get: () => Number(this.settings.alpha ?? DEFAULT_SETTINGS.alpha),
          format: (value) => Number(value).toFixed(4),
          history: {
            length: 20,
            sampleMs: 1500,
            scale: 'log',
          },
        },
        {
          key: 'forcesStrength',
          label: 'Force strength',
          type: 'number',
          min: 0,
          max: 5,
          step: 0.01,
          get: () => Number(this.settings.forcesStrength ?? DEFAULT_SETTINGS.forcesStrength),
          set: (value) => this.setSettings({ forcesStrength: value }),
        },
        {
          key: 'forcesRatio',
          label: 'Force ratio',
          type: 'number',
          min: 1,
          max: 200,
          step: 1,
          get: () => Number(this.settings.forcesRatio ?? DEFAULT_SETTINGS.forcesRatio),
          set: (value) => this.setSettings({ forcesRatio: value }),
        },
        {
          key: 'repulsiveExponent',
          label: 'Repulsion exp.',
          type: 'number',
          min: 0.1,
          max: 4,
          step: 0.05,
          get: () => Number(this.settings.repulsiveExponent ?? DEFAULT_SETTINGS.repulsiveExponent),
          set: (value) => this.setSettings({ repulsiveExponent: value }),
        },
        {
          key: 'attractiveExponent',
          label: 'Attraction exp.',
          type: 'number',
          min: 0.1,
          max: 4,
          step: 0.05,
          get: () => Number(this.settings.attractiveExponent ?? DEFAULT_SETTINGS.attractiveExponent),
          set: (value) => this.setSettings({ attractiveExponent: value }),
        },
        {
          key: 'gravity',
          ...withLogScaleBinding({
            label: 'Gravity',
            min: 0.0005,
            max: 5,
          }),
          get: () => Number(this.settings.gravity ?? DEFAULT_SETTINGS.gravity),
          set: (value) => this.setSettings({ gravity: value }),
        },
        {
          key: 'viscosity',
          label: 'Viscosity',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.001,
          get: () => Number(this.settings.viscosity ?? DEFAULT_SETTINGS.viscosity),
          set: (value) => this.setSettings({ viscosity: value }),
        },
        {
          key: 'linkDistance',
          label: 'Link distance',
          type: 'number',
          min: 1,
          max: 300,
          step: 1,
          get: () => Number(this.settings.linkDistance ?? DEFAULT_SETTINGS.linkDistance),
          set: (value) => this.setSettings({ linkDistance: value }),
        },
        {
          key: 'collisionEnabled',
          label: 'Collision',
          type: 'boolean',
          get: () => Boolean(this.settings.collisionEnabled),
          set: (value) => this.setSettings({ collisionEnabled: value }),
        },
        {
          key: 'collisionRadius',
          label: 'Collision radius',
          type: 'number',
          min: 0,
          max: 200,
          step: 1,
          get: () => Number(this.settings.collisionRadius ?? DEFAULT_SETTINGS.collisionRadius),
          set: (value) => this.setSettings({ collisionRadius: value }),
        },
        {
          key: 'forceNormalizationType',
          label: 'Normalize by',
          type: 'select',
          options: [
            { value: 'degree', label: 'Degree' },
            { value: 'strength', label: 'Strength' },
            { value: 'none', label: 'None' },
          ],
          get: () => String(this.settings.forceNormalizationType ?? DEFAULT_SETTINGS.forceNormalizationType),
          set: (value) => this.setSettings({ forceNormalizationType: value }),
        },
        {
          key: 'alphaDecay',
          label: 'Alpha decay',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.0001,
          get: () => Number(this.settings.alphaDecay ?? DEFAULT_SETTINGS.alphaDecay),
          set: (value) => this.setSettings({ alphaDecay: value }),
        },
        {
          key: 'alphaTarget',
          label: 'Alpha target',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.0001,
          get: () => Number(this.settings.alphaTarget ?? DEFAULT_SETTINGS.alphaTarget),
          set: (value) => this.setSettings({ alphaTarget: value }),
        },
        {
          key: 'alphaMin',
          label: 'Alpha min',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.0001,
          get: () => Number(this.settings.alphaMin ?? DEFAULT_SETTINGS.alphaMin),
          set: (value) => this.setSettings({ alphaMin: value }),
        },
        {
          key: 'recenter',
          label: 'Recenter',
          type: 'boolean',
          get: () => this.settings.recenter !== false,
          set: (value) => this.setSettings({ recenter: value }),
        },
      ],
    };
  }

  buildGraphPayload() {
    return this.network.withBufferAccess(() => {
      const nodeIndices = this.network.nodeIndices.slice();
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
    }, { nodeIndices: true, edgeIndices: true, edgesView: true });
  }
}

export default D3Force3DLayout;
