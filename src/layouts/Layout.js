/** @typedef {import('helios-network').default} HeliosNetwork */

/**
 * Base class for layout algorithms. Concrete implementations can override the
 * lifecycle hooks to move nodes around by writing into
 * `_helios_visuals_position`.
 */
export class Layout {
  constructor(network, visuals) {
    this.network = network;
    this.visuals = visuals;
    this._updateRequested = true;
    this._updateListener = null;
  }

  async initialize() {}

  shouldRun() {
    return this._updateRequested;
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
    const positions = this.visuals.nodePositions;
    const activeNodes = this.network?.nodeIndices || [];
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
    return !this.pending;
  }

  step() {
    if (!this.worker || this.pending) {
      return false;
    }
    this.pending = true;
    const positionsCopy = new Float32Array(this.visuals.nodePositions);
    const { nodeIndices, edges } = this.buildGraphPayload();
    this.worker.postMessage(
      {
        type: 'tick',
        timestamp: performance.now(),
        positions: positionsCopy,
        nodeIndices,
        edges,
      },
      [positionsCopy.buffer],
    );
    return false;
  }

  handleMessage(message) {
    if (message?.type === 'positions' && message.positions instanceof Float32Array) {
      const view = this.visuals.nodePositions;
      const count = Math.min(view.length, message.positions.length);
      for (let i = 0; i < count; i += 1) {
        view[i] = message.positions[i];
      }
      this.pending = false;
      this._updateRequested = false;
      // Inform downstream consumers that position-dependent buffers changed.
      this.visuals?.markPositionsDirty?.();
      this.emitUpdate({ positions: view });
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
