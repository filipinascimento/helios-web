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
  alphaDecay: 0.003,
  alphaTarget: 0,
  alphaMin: 0.001,
  autoStopAtAlphaMin: true,
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

function createZeroableUnitLogBinding(binding) {
  return withLogScaleBinding({
    min: 0.000001,
    max: 1,
    inputMin: 0,
    inputMax: 1,
    ...binding,
  });
}

function shouldAutoStopAtAlphaMin(alpha, alphaMin) {
  const current = Number(alpha);
  const min = Number(alphaMin);
  if (!Number.isFinite(current) || !Number.isFinite(min)) return false;
  return current <= (min + 1e-9);
}

function hash32(value) {
  let x = value >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
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
    this.reheatAlpha = Number.isFinite(settings.alpha) ? Number(settings.alpha) : DEFAULT_SETTINGS.alpha;
    this.helios = options.helios ?? null;
    this.worker = null;
    this.pending = false;
    this.lastUpdate = 0;
    this.optionsDirty = true;
    this.seededPositions = false;
    this._adoptOnlyNextTick = false;
    this._awaitingAdoptOnlyResponse = false;
  }

  _seedPlanarDepthIfNeeded() {
    const nodeIndices = this.network?.nodeIndices ?? null;
    const positions = this.visuals?.nodePositions ?? null;
    if (!nodeIndices?.length || !positions?.length || nodeIndices.length <= 1) return false;

    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < nodeIndices.length; i += 1) {
      const offset = (nodeIndices[i] >>> 0) * 3;
      const z = positions[offset + 2];
      if (!Number.isFinite(z)) continue;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    const zRange = Number.isFinite(minZ) && Number.isFinite(maxZ) ? (maxZ - minZ) : 0;
    const depth = Number.isFinite(this.options?.depth) ? Math.max(0, this.options.depth) : 0;
    const radius = Number.isFinite(this.options?.radius) ? Math.max(1, this.options.radius) : 150;
    const planarTolerance = Math.max(1e-6, depth * 1e-5, radius * 1e-6);
    if (zRange > planarTolerance) return false;

    const centerZ = Number.isFinite(this.settings?.center?.[2]) ? this.settings.center[2] : 0;
    const jitterBase = depth > 1e-6 ? depth : Math.max(1, radius * 0.25);
    const jitterAmplitude = Math.max(1e-3, jitterBase * 0.04);
    let jitterMean = 0;
    for (let i = 0; i < nodeIndices.length; i += 1) {
      const nodeId = nodeIndices[i] >>> 0;
      jitterMean += (((hash32((nodeId + 1) >>> 0) + 0.5) / 4294967296) - 0.5) * jitterAmplitude;
    }
    jitterMean /= nodeIndices.length;

    for (let i = 0; i < nodeIndices.length; i += 1) {
      const nodeId = nodeIndices[i] >>> 0;
      const offset = nodeId * 3;
      const jitter = ((((hash32((nodeId + 1) >>> 0) + 0.5) / 4294967296) - 0.5) * jitterAmplitude) - jitterMean;
      positions[offset + 2] = centerZ + jitter;
    }
    this.visuals?.markPositionsDirty?.();
    return true;
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
    return !this.isPositionHandoffPending() && !this.pending;
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
    if (this._adoptOnlyNextTick) {
      message.adoptOnly = true;
      this._adoptOnlyNextTick = false;
      this._awaitingAdoptOnlyResponse = true;
    }
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
      if (
        this.settings.autoStopAtAlphaMin !== false
        && shouldAutoStopAtAlphaMin(this.settings.alpha, this.settings.alphaMin ?? DEFAULT_SETTINGS.alphaMin)
      ) {
        this.helios?.stopLayout?.('alpha-min');
      }
      this.visuals?.markPositionsDirty?.();
      if (view) {
        this.emitUpdate({
          positions: view,
          timestamp: performance.now(),
          handoffAdopted: this._awaitingAdoptOnlyResponse === true,
        });
      }
      this._awaitingAdoptOnlyResponse = false;
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

  _applyReheatAlpha() {
    this.settings.alpha = this.reheatAlpha;
    this.options = {
      ...this.options,
      settings: {
        ...(this.options.settings ?? {}),
        ...this.settings,
      },
    };
    this.optionsDirty = true;
  }

  _resumeStoppedLayout(reason = 'layout') {
    const helios = this.helios ?? null;
    const activeLayout = typeof helios?.layout === 'function'
      ? helios.layout()
      : helios?._layout;
    const scheduler = helios?.scheduler ?? null;
    const state = typeof scheduler?.getLayoutState === 'function'
      ? scheduler.getLayoutState()
      : (scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
    if (activeLayout !== this || state !== 'stopped') return;
    scheduler?.setLayoutEnabled?.(true, reason);
    scheduler?.requestLayout?.(reason);
  }

  setSettings(next = {}, { reheat = false } = {}) {
    if (!next || typeof next !== 'object') return this;
    const hadUse2D = this.settings.use2D === true;
    let nextMode = this.options?.mode === '3d' ? '3d' : '2d';

    if (Object.prototype.hasOwnProperty.call(next, 'mode')) {
      nextMode = next.mode === '3d' ? '3d' : '2d';
      this.options.mode = nextMode;
    }
    Object.entries(next).forEach(([key, value]) => {
      if (key in DEFAULT_SETTINGS) {
        this.settings[key] = value;
      }
    });
    if (Object.prototype.hasOwnProperty.call(next, 'alpha')) {
      this.reheatAlpha = Number.isFinite(next.alpha) ? Number(next.alpha) : this.reheatAlpha;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'use2D')) {
      this.settings.use2D = next.use2D === true;
      this.options.mode = this.settings.use2D ? '2d' : '3d';
    } else if (Object.prototype.hasOwnProperty.call(next, 'mode')) {
      this.settings.use2D = nextMode !== '3d';
    }

    const switchedInto3D = hadUse2D && this.settings.use2D === false;
    if (switchedInto3D) {
      const apply = () => this._seedPlanarDepthIfNeeded();
      if (typeof this.visuals?.withBufferAccess === 'function') {
        this.visuals.withBufferAccess(apply);
      } else {
        apply();
      }
    }

    this.options = {
      ...this.options,
      mode: this.settings.use2D ? '2d' : '3d',
      settings: {
        ...(this.options.settings ?? {}),
        ...this.settings,
      },
    };
    this.optionsDirty = true;
    if (reheat) {
      this._applyReheatAlpha();
      super.reheat('layout-settings');
      this._resumeStoppedLayout('layout-settings');
    } else {
      this.requestUpdate();
    }
    return this;
  }

  reheat(reason = 'layout') {
    this._applyReheatAlpha();
    super.reheat(reason);
    this._resumeStoppedLayout(reason);
    return this;
  }

  seedFromNetworkPositions() {
    this.seededPositions = true;
    this._adoptOnlyNextTick = true;
    this.requestUpdate();
    this.emitUpdate({ timestamp: performance.now(), layoutElapsedMs: 0 });
    this.helios?.scheduler?.requestRender?.();
    return this;
  }

  completePositionHandoff(snapshot = null, options = {}) {
    const wrote = super.completePositionHandoff(snapshot, options);
    if (wrote) {
      this.seededPositions = true;
      this._adoptOnlyNextTick = true;
    }
    return wrote;
  }

  adoptHandoffState(state = {}) {
    const nextAlpha = Number(state?.alpha);
    if (Number.isFinite(nextAlpha)) {
      const alphaMin = Number.isFinite(this.settings.alphaMin) ? this.settings.alphaMin : DEFAULT_SETTINGS.alphaMin;
      const clamped = Math.max(alphaMin, Math.min(1, nextAlpha));
      this.settings.alpha = clamped;
      this.reheatAlpha = clamped;
    }
    if (Array.isArray(state?.center) && state.center.length >= 3) {
      this.settings.center = [
        Number.isFinite(state.center[0]) ? Number(state.center[0]) : 0,
        Number.isFinite(state.center[1]) ? Number(state.center[1]) : 0,
        Number.isFinite(state.center[2]) ? Number(state.center[2]) : 0,
      ];
    }
    this.options = {
      ...this.options,
      settings: {
        ...(this.options.settings ?? {}),
        ...this.settings,
      },
    };
    this.optionsDirty = true;
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
          label: 'Temp.',
          type: 'display',
          get: () => Number(this.settings.alpha ?? DEFAULT_SETTINGS.alpha),
          format: (value) => Number(value).toFixed(4),
          history: {
            length: 20,
            sampleMs: 1500,
            scale: 'log',
            min: () => {
              const alphaMin = Number(this.settings.alphaMin ?? DEFAULT_SETTINGS.alphaMin);
              return alphaMin > 0 ? alphaMin : null;
            },
            max: 1,
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
          set: (value) => this.setSettings({ forcesStrength: value }, { reheat: true }),
        },
        {
          key: 'forcesRatio',
          ...withLogScaleBinding({
            label: 'Force ratio',
            min: 0.01,
            max: 100,
          }),
          get: () => Number(this.settings.forcesRatio ?? DEFAULT_SETTINGS.forcesRatio),
          set: (value) => this.setSettings({ forcesRatio: value }, { reheat: true }),
        },
        {
          key: 'repulsiveExponent',
          label: 'Repulsion exp.',
          type: 'number',
          min: 0.1,
          max: 4,
          step: 0.05,
          get: () => Number(this.settings.repulsiveExponent ?? DEFAULT_SETTINGS.repulsiveExponent),
          set: (value) => this.setSettings({ repulsiveExponent: value }, { reheat: true }),
        },
        {
          key: 'attractiveExponent',
          label: 'Attraction exp.',
          type: 'number',
          min: 0.1,
          max: 4,
          step: 0.05,
          get: () => Number(this.settings.attractiveExponent ?? DEFAULT_SETTINGS.attractiveExponent),
          set: (value) => this.setSettings({ attractiveExponent: value }, { reheat: true }),
        },
        {
          key: 'gravity',
          ...withLogScaleBinding({
            label: 'Gravity',
            min: 0.0005,
            max: 5,
          }),
          get: () => Number(this.settings.gravity ?? DEFAULT_SETTINGS.gravity),
          set: (value) => this.setSettings({ gravity: value }, { reheat: true }),
        },
        {
          key: 'viscosity',
          label: 'Viscosity',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.001,
          get: () => Number(this.settings.viscosity ?? DEFAULT_SETTINGS.viscosity),
          set: (value) => this.setSettings({ viscosity: value }, { reheat: true }),
        },
        {
          key: 'linkDistance',
          label: 'Link distance',
          type: 'number',
          min: 1,
          max: 300,
          step: 1,
          get: () => Number(this.settings.linkDistance ?? DEFAULT_SETTINGS.linkDistance),
          set: (value) => this.setSettings({ linkDistance: value }, { reheat: true }),
        },
        {
          key: 'collisionEnabled',
          label: 'Collision',
          type: 'boolean',
          get: () => Boolean(this.settings.collisionEnabled),
          set: (value) => this.setSettings({ collisionEnabled: value }, { reheat: true }),
        },
        {
          key: 'collisionRadius',
          label: 'Collision radius',
          type: 'number',
          min: 0,
          max: 200,
          step: 1,
          get: () => Number(this.settings.collisionRadius ?? DEFAULT_SETTINGS.collisionRadius),
          set: (value) => this.setSettings({ collisionRadius: value }, { reheat: true }),
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
          set: (value) => this.setSettings({ forceNormalizationType: value }, { reheat: true }),
        },
        {
          key: 'autoStopAtAlphaMin',
          label: 'Stop at min temp',
          type: 'boolean',
          get: () => this.settings.autoStopAtAlphaMin !== false,
          set: (value) => this.setSettings({ autoStopAtAlphaMin: value !== false }),
        },
        {
          key: 'alphaDecay',
          ...createZeroableUnitLogBinding({
            label: 'Temp. decay',
          }),
          get: () => Number(this.settings.alphaDecay ?? DEFAULT_SETTINGS.alphaDecay),
          set: (value) => this.setSettings({ alphaDecay: value }, { reheat: true }),
        },
        {
          key: 'alphaTarget',
          ...createZeroableUnitLogBinding({
            label: 'Temp. target',
          }),
          get: () => Number(this.settings.alphaTarget ?? DEFAULT_SETTINGS.alphaTarget),
          set: (value) => this.setSettings({ alphaTarget: value }, { reheat: true }),
        },
        {
          key: 'alphaMin',
          ...createZeroableUnitLogBinding({
            label: 'Temp. min',
          }),
          get: () => Number(this.settings.alphaMin ?? DEFAULT_SETTINGS.alphaMin),
          set: (value) => this.setSettings({ alphaMin: value }, { reheat: true }),
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
