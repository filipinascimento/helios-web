import { Layout } from './Layout.js';
import { GpuForcePositionDelegate } from '../delegates/GpuForcePositionDelegate.js';

const DEFAULT_OPTIONS = {
  mode: '2d',
  updateIntervalMs: 0,
  center: [0, 0, 0],
  radius: 220,
  depth: 140,
  sampleCount: null,
  sampleCount2D: 64,
  sampleCount3D: 96,
  maxNeighborsPerNode: 64,
  outputScale: 6,
  linkDistance: 1,
  kRepulsion: 0.07,
  kAttraction: 0.62,
  kGravity: 0.00035,
  eta: 0.04,
  damping: 0.92,
  maxStep: 2.5,
  minDistance: 0.15,
  alpha: 1,
  alphaDecay: 0.001,
  alphaTarget: 0,
  alphaMin: 0.001,
};

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeCenter(center) {
  if (!Array.isArray(center)) return [0, 0, 0];
  return [
    toFinite(center[0], 0),
    toFinite(center[1], 0),
    toFinite(center[2], 0),
  ];
}

export class GpuForceLayout extends Layout {
  constructor(network, visuals, options = {}) {
    super(network, visuals);
    const normalizedMode = options.mode === '3d' ? '3d' : '2d';
    const normalized = {
      ...DEFAULT_OPTIONS,
      ...options,
      mode: normalizedMode,
      center: normalizeCenter(options.center ?? DEFAULT_OPTIONS.center),
    };
    this.options = normalized;
    this.helios = options.helios ?? null;
    this.positionDelegate = new GpuForcePositionDelegate(normalized);
    this.lastUpdate = 0;
  }

  getPositionDelegate() {
    return this.positionDelegate;
  }

  async initialize() {
    if (this.helios?.positions) {
      this.helios.positions({ source: 'delegate', delegate: this.positionDelegate });
    }
    this._updateRequested = true;
  }

  shouldRun() {
    return true;
  }

  step(deltaMs = 16) {
    const intervalMs = Math.max(0, toFinite(this.options.updateIntervalMs, 0));
    const now = performance.now();
    if (intervalMs > 0 && this.lastUpdate > 0 && (now - this.lastUpdate) < intervalMs) {
      return false;
    }

    const changed = this.positionDelegate.step(this._buildDelegateContext(deltaMs));
    this.lastUpdate = now;
    this._updateRequested = false;
    if (changed) {
      this.helios?.scheduler?.requestRender?.();
    }
    return changed;
  }

  resize(size) {
    if (!size) return;
    this.positionDelegate.updateOptions({ center: normalizeCenter(this.options.center) });
  }

  setSettings(next = {}) {
    if (!next || typeof next !== 'object') return this;
    this.options = {
      ...this.options,
      ...next,
      center: normalizeCenter(next.center ?? this.options.center),
      mode: (next.mode ?? this.options.mode) === '3d' ? '3d' : '2d',
    };
    this.positionDelegate.updateOptions(this.options);
    this.requestUpdate();
    return this;
  }

  dispose() {
    if (this.helios?.positions) {
      const current = this.helios.positions?.();
      if (current?.source === 'delegate' && current?.delegate === this.positionDelegate) {
        this.helios.positions({ source: 'network' });
      }
    }
    this.positionDelegate.dispose?.();
  }

  _buildDelegateContext(deltaMs = 16) {
    const renderer = this.helios?.renderer ?? null;
    const rendererDevice = renderer?.device ?? null;
    return {
      helios: this.helios,
      network: this.network,
      visuals: this.visuals,
      renderer,
      scheduler: this.helios?.scheduler ?? null,
      backend: rendererDevice?.type ?? null,
      device: rendererDevice?.device ?? null,
      gl: rendererDevice?.gl ?? null,
      deltaMs,
      reason: 'layout-step',
    };
  }
}

export default GpuForceLayout;
