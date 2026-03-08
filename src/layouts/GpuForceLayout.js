import { Layout, withLogScaleBinding, withVelocityRetentionBinding } from './Layout.js';
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
  sampleChurn: 0,
  maxNeighborsPerNode: 64,
  outputScale: 6.5,
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
  recenter: true,
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
    this._updateRequested = true;
  }

  shouldRun() {
    return true;
  }

  step(deltaMs = 16) {
    const changed = this.positionDelegate.step(this._buildDelegateContext(deltaMs));
    this.lastUpdate = performance.now();
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

  reheat() {
    this.setSettings({
      alpha: Number(this.options.alpha ?? DEFAULT_OPTIONS.alpha),
    });
    return this;
  }

  getParameterBindings() {
    const sampleKey = this.options.mode === '3d' ? 'sampleCount3D' : 'sampleCount2D';
    const sampleLabel = 'Repulsion samples';
    return {
      key: 'gpu-force',
      label: 'Force (GPU)',
      dynamic: true,
      bindings: [
        {
          key: 'alphaCurrent',
          label: 'Alpha',
          type: 'display',
          get: () => Number(this.positionDelegate?.alpha ?? this.options.alpha ?? DEFAULT_OPTIONS.alpha),
          format: (value) => Number(value).toFixed(4),
          history: {
            length: 20,
            sampleMs: 1500,
            scale: 'log',
          },
        },
        {
          key: sampleKey,
          label: sampleLabel,
          type: 'number',
          min: 1,
          sliderMax: 256,
          inputMax: null,
          step: 1,
          hint: 'Suggested range 1-256; larger typed values are allowed.',
          get: () => Number(this.options[sampleKey] ?? DEFAULT_OPTIONS[sampleKey]),
          set: (value) => {
            this.setSettings({ [sampleKey]: value });
            this.reheat();
          },
        },
        {
          key: 'sampleChurn',
          label: 'Sample churn',
          hint: '0 keeps repulsion samples fixed; 1 refreshes all repulsion samples every step.',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          get: () => Number(this.options.sampleChurn ?? DEFAULT_OPTIONS.sampleChurn),
          set: (value) => {
            this.setSettings({ sampleChurn: value });
            this.reheat();
          },
        },
        {
          key: 'maxNeighborsPerNode',
          label: 'Neighbors / node',
          type: 'number',
          min: 1,
          max: 256,
          step: 1,
          get: () => Number(this.options.maxNeighborsPerNode ?? DEFAULT_OPTIONS.maxNeighborsPerNode),
          set: (value) => this.setSettings({ maxNeighborsPerNode: value }),
        },
        {
          key: 'outputScale',
          label: 'Output scale',
          type: 'number',
          min: 0.1,
          max: 20,
          step: 0.1,
          get: () => Number(this.options.outputScale ?? DEFAULT_OPTIONS.outputScale),
          set: (value) => this.setSettings({ outputScale: value }),
        },
        {
          key: 'linkDistance',
          label: 'Link distance',
          type: 'number',
          min: 0.1,
          max: 20,
          step: 0.01,
          get: () => Number(this.options.linkDistance ?? DEFAULT_OPTIONS.linkDistance),
          set: (value) => this.setSettings({ linkDistance: value }),
        },
        {
          key: 'kRepulsion',
          ...withLogScaleBinding({
            label: 'Repulsion',
            min: 0.0007,
            max: 7,
          }),
          get: () => Number(this.options.kRepulsion ?? DEFAULT_OPTIONS.kRepulsion),
          set: (value) => this.setSettings({ kRepulsion: value }),
        },
        {
          key: 'kAttraction',
          ...withLogScaleBinding({
            label: 'Attraction',
            min: 0.0062,
            max: 62,
          }),
          get: () => Number(this.options.kAttraction ?? DEFAULT_OPTIONS.kAttraction),
          set: (value) => this.setSettings({ kAttraction: value }),
        },
        {
          key: 'kGravity',
          ...withLogScaleBinding({
            label: 'Gravity',
            min: 0.0000035,
            max: 0.035,
          }),
          get: () => Number(this.options.kGravity ?? DEFAULT_OPTIONS.kGravity),
          set: (value) => this.setSettings({ kGravity: value }),
        },
        {
          key: 'eta',
          label: 'Eta',
          type: 'number',
          min: 0.001,
          max: 1,
          step: 0.001,
          get: () => Number(this.options.eta ?? DEFAULT_OPTIONS.eta),
          set: (value) => this.setSettings({ eta: value }),
        },
        withVelocityRetentionBinding({
          key: 'damping',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.001,
          get: () => Number(this.options.damping ?? DEFAULT_OPTIONS.damping),
          set: (value) => this.setSettings({ damping: value }),
        }),
        {
          key: 'maxStep',
          label: 'Max step',
          type: 'number',
          min: 0.01,
          max: 10,
          step: 0.01,
          get: () => Number(this.options.maxStep ?? DEFAULT_OPTIONS.maxStep),
          set: (value) => this.setSettings({ maxStep: value }),
        },
        {
          key: 'minDistance',
          label: 'Min distance',
          type: 'number',
          min: 0.001,
          max: 10,
          step: 0.001,
          get: () => Number(this.options.minDistance ?? DEFAULT_OPTIONS.minDistance),
          set: (value) => this.setSettings({ minDistance: value }),
        },
        {
          key: 'alphaDecay',
          label: 'Alpha decay',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.0001,
          get: () => Number(this.options.alphaDecay ?? DEFAULT_OPTIONS.alphaDecay),
          set: (value) => this.setSettings({ alphaDecay: value }),
        },
        {
          key: 'alphaTarget',
          label: 'Alpha target',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.0001,
          get: () => Number(this.options.alphaTarget ?? DEFAULT_OPTIONS.alphaTarget),
          set: (value) => this.setSettings({ alphaTarget: value }),
        },
        {
          key: 'alphaMin',
          label: 'Alpha min',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.0001,
          get: () => Number(this.options.alphaMin ?? DEFAULT_OPTIONS.alphaMin),
          set: (value) => this.setSettings({ alphaMin: value }),
        },
      ],
    };
  }

  dispose() {
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
