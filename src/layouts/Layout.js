import { NODE_POSITION_ATTRIBUTE } from '../pipeline/constants.js';

/** @typedef {import('helios-network').default} HeliosNetwork */

export function withLogScaleBinding(binding) {
  return {
    type: 'number',
    scale: 'log',
    notation: 'scientific',
    inputStep: 'any',
    sliderStep: 0.01,
    ...binding,
  };
}

export function withVelocityRetentionBinding(binding) {
  return {
    label: 'Velocity retention',
    hint: 'Higher values keep more momentum; lower values damp faster.',
    ...binding,
  };
}

/**
 * Base class for layout algorithms. Concrete implementations can override the
 * lifecycle hooks to move nodes around by writing into
 * `_helios_visuals_position`.
 */
export class Layout {
  constructor(network, visuals) {
    this.network = network;
    this.visuals = visuals;
    this.helios = null;
    this._updateRequested = true;
    this._updateListener = null;
    this._positionHandoffPending = false;
  }

  async initialize() {}

  shouldRun() {
    return !this._positionHandoffPending && this._updateRequested;
  }

  requestUpdate() {
    this._updateRequested = true;
  }

  step() {
    this._updateRequested = false;
    return false;
  }

  resize() {}

  setUpdateListener(listener) {
    this._updateListener = listener;
  }

  emitUpdate(payload) {
    if (typeof this._updateListener === 'function') {
      this._updateListener(payload);
    }
  }

  getParameterBindings() {
    return {
      key: 'static',
      label: this.constructor?.name ?? 'Layout',
      dynamic: false,
      bindings: [],
    };
  }

  reheat(reason = 'layout') {
    this.requestUpdate();
    this.helios?._wakeLayoutIfIdle?.(reason);
    return this;
  }

  isPositionHandoffPending() {
    return this._positionHandoffPending === true;
  }

  beginPositionHandoff() {
    this._positionHandoffPending = true;
    this._updateRequested = false;
    return this;
  }

  completePositionHandoff(snapshot = null, options = {}) {
    const wrote = this.seedFromPositionSnapshot(snapshot, options);
    this._positionHandoffPending = false;
    if (options.requestUpdate !== false) {
      this.requestUpdate();
    }
    return wrote;
  }

  seedFromPositionSnapshot(snapshot, options = {}) {
    if (!(snapshot instanceof Float32Array) || snapshot.length <= 0) return false;

    let wrote = false;
    let writtenView = null;
    const writeSnapshot = (view) => {
      if (!view || !Number.isFinite(view.length) || view.length <= 0) return false;
      const count = Math.min(view.length, snapshot.length);
      if (count <= 0) return false;
      view.set(snapshot.subarray(0, count), 0);
      writtenView ??= view;
      return true;
    };
    const apply = () => {
      const visualView = this.visuals?.nodePositions ?? null;
      const networkView = this.network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
      const wroteVisual = writeSnapshot(visualView);
      const wroteNetwork = networkView && networkView !== visualView
        ? writeSnapshot(networkView)
        : false;
      wrote = wroteVisual || wroteNetwork;
    };

    const withVisualAccess = typeof this.visuals?.withBufferAccess === 'function'
      ? (fn) => this.visuals.withBufferAccess(fn)
      : (fn) => fn();
    const withNetworkAccess = typeof this.network?.withBufferAccess === 'function'
      ? (fn) => this.network.withBufferAccess(fn)
      : (fn) => fn();
    withNetworkAccess(() => withVisualAccess(apply));

    if (!wrote) return false;
    this.visuals?.markPositionsDirty?.();
    if (options.emitUpdate !== false) {
      this.emitUpdate({
        positions: writtenView ?? snapshot,
        timestamp: performance.now(),
        layoutElapsedMs: 0,
      });
    }
    return true;
  }

  dispose() {}
}

/**
 * Keeps nodes at their current positions. Useful as a default fallback when no
 * dynamic layout is configured yet.
 */
export class StaticLayout extends Layout {
  constructor(network, visuals, options = {}) {
    super(network, visuals);
    this.bounds = options.bounds ?? [0, 0, 1, 1];
  }

  initialize() {
    const apply = () => {
      const activeNodes = this.network?.nodeIndices || [];
      const positions = this.visuals.nodePositions;
      const [minX, minY, maxX, maxY] = this.bounds;
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);

      for (let n = 0; n < activeNodes.length; n += 1) {
        const node = activeNodes[n];
        const offset = node * 3;
        const x = positions[offset];
        const y = positions[offset + 1];
        if (Number.isFinite(x) && Number.isFinite(y)) {
          continue;
        }
        positions[offset] = minX + (width * Math.random());
        positions[offset + 1] = minY + (height * Math.random());
        positions[offset + 2] = 0;
      }
      this._updateRequested = false;
      this.emitUpdate({ positions });
    };
    if (typeof this.visuals?.withBufferAccess === 'function') {
      this.visuals.withBufferAccess(apply);
    } else {
      apply();
    }
  }

  getParameterBindings() {
    return {
      key: 'static',
      label: 'Static',
      dynamic: false,
      bindings: [],
    };
  }
}

/**
 * Proxies layout execution to a WebWorker.
 */
export class WorkerLayout extends Layout {
  constructor(network, visuals, options = {}) {
    super(network, visuals);
    this.worker = null;
    this.options = { center: [0, 0, 0], ...options };
    this.pending = false;
    this.lastUpdate = 0;
  }

  async initialize() {
    this.worker = new Worker(new URL('../workers/layoutWorker.js', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.postMessage({
      type: 'init',
      nodeCount: this.network.nodeCapacity,
      options: this.options,
    });
  }

  shouldRun() {
    return !this.isPositionHandoffPending() && !this.pending;
  }

  step() {
    if (!this.worker || this.pending) {
      return false;
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
    this.worker.postMessage(
      {
        type: 'tick',
        timestamp: now,
        positions: positionsCopy,
        nodeIndices,
        edges,
      },
      [positionsCopy.buffer],
    );
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
      this.pending = false;
      this._updateRequested = false;
      // Inform downstream consumers that position-dependent buffers changed.
      this.visuals?.markPositionsDirty?.();
      if (view) {
        const layoutTimestamp = performance.now();
        this.emitUpdate({ positions: view, timestamp: layoutTimestamp });
      }
      return true;
    }
    if (message?.type === 'ready') {
      this.pending = false;
      this._updateRequested = true;
    }
    return false;
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  setSettings(next = {}, { reheat = false, reason = 'layout-settings' } = {}) {
    if (!next || typeof next !== 'object') return this;
    this.options = {
      ...this.options,
      ...next,
      center: Array.isArray(next.center) ? next.center.slice(0, 3) : this.options.center,
    };
    if (this.worker) {
      this.worker.postMessage({
        type: 'settings',
        options: this.options,
      });
    }
    if (reheat) {
      this.reheat(reason);
    } else {
      this.requestUpdate();
    }
    return this;
  }

  getParameterBindings() {
    const layoutMode = String(this.options?.layout ?? 'force3d').toLowerCase();
    if (layoutMode === 'jitter') {
      return {
        key: 'worker:jitter',
        label: 'Jitter (worker)',
        dynamic: true,
        bindings: [
          {
            key: 'jitter',
            label: 'Jitter',
            type: 'number',
            min: 0,
            max: 20,
            step: 0.1,
            get: () => Number(this.options.jitter ?? 3),
            set: (value) => this.setSettings({ jitter: value }, { reheat: true }),
          },
        ],
      };
    }

    return {
      key: 'worker:force3d',
      label: 'Force (worker)',
      dynamic: true,
      bindings: [
        {
          key: 'repulsionStrategy',
          label: 'Repulsion',
          type: 'select',
          options: [
            { value: 'barnes-hut', label: 'Barnes-Hut' },
            { value: 'negative', label: 'Negative sampling' },
            { value: 'full', label: 'All pairs' },
          ],
          get: () => String(this.options.repulsionStrategy ?? 'barnes-hut'),
          set: (value) => this.setSettings({ repulsionStrategy: value }, { reheat: true }),
        },
        {
          key: 'negativeSampling',
          label: 'Extra negatives',
          type: 'boolean',
          get: () => Boolean(this.options.negativeSampling),
          set: (value) => this.setSettings({ negativeSampling: value }, { reheat: true }),
        },
        {
          key: 'negativesPerNode',
          label: 'Negatives / node',
          type: 'number',
          min: 1,
          max: 256,
          step: 1,
          get: () => Number(this.options.negativesPerNode ?? 48),
          set: (value) => this.setSettings({ negativesPerNode: value }, { reheat: true }),
        },
        {
          key: 'repulsionExponent',
          label: 'Repulsion exp.',
          type: 'number',
          min: 0.1,
          max: 4,
          step: 0.05,
          get: () => Number(this.options.repulsionExponent ?? 2),
          set: (value) => this.setSettings({ repulsionExponent: value }, { reheat: true }),
        },
        {
          key: 'attractionExponent',
          label: 'Attraction exp.',
          type: 'number',
          min: 0.1,
          max: 4,
          step: 0.05,
          get: () => Number(this.options.attractionExponent ?? 1),
          set: (value) => this.setSettings({ attractionExponent: value }, { reheat: true }),
        },
        {
          key: 'kRepulsion',
          ...withLogScaleBinding({
            label: 'Repulsion',
            min: 0.06,
            max: 600,
          }),
          get: () => Number(this.options.kRepulsion ?? 6),
          set: (value) => this.setSettings({ kRepulsion: value }, { reheat: true }),
        },
        {
          key: 'kAttraction',
          ...withLogScaleBinding({
            label: 'Attraction',
            min: 0.000035,
            max: 0.35,
          }),
          get: () => Number(this.options.kAttraction ?? 0.0035),
          set: (value) => this.setSettings({ kAttraction: value }, { reheat: true }),
        },
        {
          key: 'kGravity',
          ...withLogScaleBinding({
            label: 'Gravity',
            min: 0.000005,
            max: 0.05,
            inputMin: 0,
          }),
          get: () => Number(this.options.kGravity ?? 0.0005),
          set: (value) => this.setSettings({ kGravity: value }, { reheat: true }),
        },
        {
          key: 'epsilon',
          label: 'Softening',
          type: 'number',
          min: 0.001,
          max: 5,
          step: 0.01,
          get: () => Number(this.options.epsilon ?? 0.25),
          set: (value) => this.setSettings({ epsilon: value }, { reheat: true }),
        },
        {
          key: 'minDistance',
          label: 'Min distance',
          type: 'number',
          min: 0.001,
          max: 10,
          step: 0.01,
          get: () => Number(this.options.minDistance ?? 0.25),
          set: (value) => this.setSettings({ minDistance: value }, { reheat: true }),
        },
        {
          key: 'maxForce',
          label: 'Max force',
          type: 'number',
          min: 0.1,
          max: 100,
          step: 0.1,
          get: () => Number(this.options.maxForce ?? 50),
          set: (value) => this.setSettings({ maxForce: value }, { reheat: true }),
        },
        {
          key: 'maxStep',
          label: 'Max step',
          type: 'number',
          min: 0.01,
          max: 10,
          step: 0.01,
          get: () => Number(this.options.maxStep ?? 3),
          set: (value) => this.setSettings({ maxStep: value }, { reheat: true }),
        },
        {
          key: 'eta',
          label: 'Eta',
          type: 'number',
          min: 0.001,
          max: 1,
          step: 0.001,
          get: () => Number(this.options.eta ?? 0.04),
          set: (value) => this.setSettings({ eta: value }, { reheat: true }),
        },
        withVelocityRetentionBinding({
          key: 'damping',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.001,
          get: () => Number(this.options.damping ?? 0.9),
          set: (value) => this.setSettings({ damping: value }, { reheat: true }),
        }),
        {
          key: 'theta',
          label: 'Theta',
          type: 'number',
          min: 0.1,
          max: 1.5,
          step: 0.01,
          get: () => Number(this.options.theta ?? 0.6),
          set: (value) => this.setSettings({ theta: value }, { reheat: true }),
        },
        {
          key: 'leafSize',
          label: 'Leaf size',
          type: 'number',
          min: 1,
          max: 128,
          step: 1,
          get: () => Number(this.options.leafSize ?? 16),
          set: (value) => this.setSettings({ leafSize: value }, { reheat: true }),
        },
        {
          key: 'recenter',
          label: 'Recenter',
          type: 'boolean',
          get: () => this.options.recenter !== false,
          set: (value) => this.setSettings({ recenter: value }),
        },
      ],
    };
  }

  resize(size) {
    if (!this.worker || !size) return;
    const center =
      Array.isArray(this.options.center) && this.options.center.length >= 2
        ? this.options.center
        : [0, 0, 0];
    this.worker.postMessage({
      type: 'resize',
      center,
    });
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
