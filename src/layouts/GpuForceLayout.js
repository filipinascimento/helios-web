import { Layout, withLogScaleBinding, withVelocityRetentionBinding } from './Layout.js';
import { GpuForcePositionDelegate } from '../delegates/GpuForcePositionDelegate.js';

const DEFAULT_OPTIONS = {
  mode: '2d',
  forceModel: 'linear',
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
  kGravity: 0.005,
  edgeWeightAttribute: null,
  nodeMassAttribute: null,
  umapA: 1.5769434601962196,
  umapB: 0.8950608779914887,
  umapGamma: 1,
  umapNeighborCount: 15,
  umapNegativeSampleRate: 5,
  umapEpochs: null,
  eta: 0.4,
  damping: 0.92,
  maxStep: 2.5,
  minDistance: 0.15,
  alpha: 1,
  alphaDecay: 0.005,
  alphaTarget: 0,
  alphaMin: 0.001,
  autoStopAtAlphaMin: true,
  recenter: true,
};

const DEFAULT_UMAP_SAMPLE_CHURN = 0.01;

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

function isUmapForceModel(value) {
  return String(value ?? '').trim().toLowerCase() === 'umap';
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
    if (isUmapForceModel(normalized.forceModel)) {
      if (options.kRepulsion == null) normalized.kRepulsion = 1;
      if (options.kAttraction == null) normalized.kAttraction = 1;
      if (options.kGravity == null) normalized.kGravity = 0;
      if (options.eta == null) normalized.eta = 1;
      if (options.sampleChurn == null) normalized.sampleChurn = DEFAULT_UMAP_SAMPLE_CHURN;
    }
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
    if (
      this.options.autoStopAtAlphaMin !== false
      && shouldAutoStopAtAlphaMin(this.positionDelegate.alpha, this.options.alphaMin ?? DEFAULT_OPTIONS.alphaMin)
    ) {
      this.helios?.stopLayout?.('alpha-min');
    }
    if (changed) {
      this.helios?.scheduler?.requestRender?.();
    }
    return changed;
  }

  resize(size) {
    if (!size) return;
    this.positionDelegate.updateOptions({ center: normalizeCenter(this.options.center) });
  }

  _applyReheatAlpha() {
    this.positionDelegate.updateOptions({
      alpha: Number(this.options.alpha ?? DEFAULT_OPTIONS.alpha),
    });
    this.positionDelegate.resetAnnealing?.();
  }

  setSettings(next = {}, { reheat = false, reason = 'layout-settings' } = {}) {
    if (!next || typeof next !== 'object') return this;
    const prevForceModel = this.options.forceModel;
    this.options = {
      ...this.options,
      ...next,
      center: normalizeCenter(next.center ?? this.options.center),
      mode: (next.mode ?? this.options.mode) === '3d' ? '3d' : '2d',
    };
    if (isUmapForceModel(this.options.forceModel) && !isUmapForceModel(prevForceModel)) {
      if (next.kRepulsion == null) this.options.kRepulsion = 1;
      if (next.kAttraction == null) this.options.kAttraction = 1;
      if (next.kGravity == null) this.options.kGravity = 0;
      if (next.eta == null) this.options.eta = 1;
      if (next.sampleChurn == null) this.options.sampleChurn = DEFAULT_UMAP_SAMPLE_CHURN;
    }
    this.positionDelegate.updateOptions(this.options);
    if (reheat) {
      this._applyReheatAlpha();
      super.reheat(reason);
    } else {
      this.requestUpdate();
    }
    return this;
  }

  reheat(reason = 'layout') {
    this._applyReheatAlpha();
    super.reheat(reason);
    return this;
  }

  seedFromNetworkPositions(options = {}) {
    this.positionDelegate.resetDynamicStateFromNetwork({
      ...this._buildDelegateContext(0),
      ...options,
    });
    this.requestUpdate();
    this.emitUpdate({ timestamp: performance.now(), layoutElapsedMs: 0 });
    this.helios?.scheduler?.requestRender?.();
    return this;
  }

  getParameterBindings() {
    const sampleKey = this.options.mode === '3d' ? 'sampleCount3D' : 'sampleCount2D';
    const sampleLabel = 'Repulsion samples';
    const umapModel = isUmapForceModel(this.options.forceModel);
    const bindings = [
      {
        key: 'alphaCurrent',
        label: 'Temp.',
        type: 'display',
        get: () => Number(this.positionDelegate?.alpha ?? this.options.alpha ?? DEFAULT_OPTIONS.alpha),
        format: (value) => Number(value).toFixed(4),
        history: {
          length: 20,
          sampleMs: 1500,
          scale: 'log',
          min: () => {
            const alphaMin = Number(this.options.alphaMin ?? DEFAULT_OPTIONS.alphaMin);
            return alphaMin > 0 ? alphaMin : null;
          },
          max: 1,
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
        set: (value) => this.setSettings({ maxNeighborsPerNode: value }, { reheat: true }),
      },
      {
        key: 'outputScale',
        ...withLogScaleBinding({
          label: 'Output scale',
          min: 0.1,
          max: 20,
        }),
        get: () => Number(this.options.outputScale ?? DEFAULT_OPTIONS.outputScale),
        set: (value) => this.setSettings({ outputScale: value }, { reheat: true }),
      },
    ];

    if (umapModel) {
      bindings.push(
        {
          key: 'umapNegativeSampleRate',
          label: 'Negative sample rate',
          type: 'number',
          min: 0,
          max: 64,
          step: 1,
          get: () => Number(this.options.umapNegativeSampleRate ?? DEFAULT_OPTIONS.umapNegativeSampleRate),
          set: (value) => this.setSettings({ umapNegativeSampleRate: value }, { reheat: true }),
        },
        {
          key: 'sampleChurn',
          label: 'Negative sample churn',
          hint: '0 keeps sampled negatives fixed; positive values progressively refresh sampled negatives between steps. This is an implementation detail for interactive UMAP, not a standard UMAP-learn parameter.',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          inputMin: 0,
          inputMax: 1,
          sliderMin: 0,
          sliderMax: 1,
          get: () => Number(this.options.sampleChurn ?? DEFAULT_OPTIONS.sampleChurn),
          set: (value) => {
            this.setSettings({ sampleChurn: value });
            this.reheat();
          },
        },
        {
          key: 'umapA',
          ...withLogScaleBinding({
            label: 'UMAP a',
            min: 0.01,
            max: 10,
          }),
          get: () => Number(this.options.umapA ?? DEFAULT_OPTIONS.umapA),
          set: (value) => this.setSettings({ umapA: value }, { reheat: true }),
        },
        {
          key: 'umapB',
          ...withLogScaleBinding({
            label: 'UMAP b',
            min: 0.01,
            max: 10,
          }),
          get: () => Number(this.options.umapB ?? DEFAULT_OPTIONS.umapB),
          set: (value) => this.setSettings({ umapB: value }, { reheat: true }),
        },
        {
          key: 'umapGamma',
          ...withLogScaleBinding({
            label: 'Gamma',
            min: 0.01,
            max: 10,
          }),
          get: () => Number(this.options.umapGamma ?? DEFAULT_OPTIONS.umapGamma),
          set: (value) => this.setSettings({ umapGamma: value }, { reheat: true }),
        },
        {
          key: 'kRepulsion',
          ...withLogScaleBinding({
            label: 'Repulsion importance',
            min: 0.001,
            max: 100,
          }),
          get: () => Number(this.options.kRepulsion ?? 1),
          set: (value) => this.setSettings({ kRepulsion: value }, { reheat: true }),
        },
        {
          key: 'kAttraction',
          ...withLogScaleBinding({
            label: 'Attraction importance',
            min: 0.001,
            max: 100,
          }),
          get: () => Number(this.options.kAttraction ?? 1),
          set: (value) => this.setSettings({ kAttraction: value }, { reheat: true }),
        },
      );
    } else {
      bindings.push(
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
          hint: '0 keeps repulsion samples fixed; positive values progressively refresh samples. This only affects sampled repulsion, not exact repulsion on smaller active sets.',
          type: 'number',
          min: 0,
          max: 1,
          step: 0.01,
          inputMin: 0,
          inputMax: 1,
          sliderMin: 0,
          sliderMax: 1,
          get: () => Number(this.options.sampleChurn ?? DEFAULT_OPTIONS.sampleChurn),
          set: (value) => {
            this.setSettings({ sampleChurn: value });
            this.reheat();
          },
        },
        {
          key: 'linkDistance',
          label: 'Link distance',
          type: 'number',
          min: 0.1,
          max: 20,
          step: 0.01,
          get: () => Number(this.options.linkDistance ?? DEFAULT_OPTIONS.linkDistance),
          set: (value) => this.setSettings({ linkDistance: value }, { reheat: true }),
        },
        {
          key: 'kRepulsion',
          ...withLogScaleBinding({
            label: 'Repulsion',
            min: 0.0007,
            max: 7,
          }),
          get: () => Number(this.options.kRepulsion ?? DEFAULT_OPTIONS.kRepulsion),
          set: (value) => this.setSettings({ kRepulsion: value }, { reheat: true }),
        },
        {
          key: 'kAttraction',
          ...withLogScaleBinding({
            label: 'Attraction',
            min: 0.0062,
            max: 62,
          }),
          get: () => Number(this.options.kAttraction ?? DEFAULT_OPTIONS.kAttraction),
          set: (value) => this.setSettings({ kAttraction: value }, { reheat: true }),
        },
      );
    }

    bindings.push(
      {
        key: 'kGravity',
        ...withLogScaleBinding({
          label: 'Gravity',
          min: 0.0000035,
          max: 0.035,
          inputMin: 0,
        }),
        get: () => Number(this.options.kGravity ?? DEFAULT_OPTIONS.kGravity),
        set: (value) => this.setSettings({ kGravity: value }, { reheat: true }),
      },
      {
        key: 'eta',
        label: 'Eta',
        type: 'number',
        min: 0.001,
        max: 1,
        step: 0.001,
        get: () => Number(this.options.eta ?? DEFAULT_OPTIONS.eta),
        set: (value) => this.setSettings({ eta: value }, { reheat: true }),
      },
      withVelocityRetentionBinding({
        key: 'damping',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.001,
        get: () => Number(this.options.damping ?? DEFAULT_OPTIONS.damping),
        set: (value) => this.setSettings({ damping: value }, { reheat: true }),
      }),
      {
        key: 'maxStep',
        label: 'Max step',
        type: 'number',
        min: 0.01,
        max: 10,
        step: 0.01,
        get: () => Number(this.options.maxStep ?? DEFAULT_OPTIONS.maxStep),
        set: (value) => this.setSettings({ maxStep: value }, { reheat: true }),
      },
    );

    if (!umapModel) {
      bindings.push({
        key: 'minDistance',
        label: 'Min distance',
        type: 'number',
        min: 0.001,
        max: 10,
        step: 0.001,
        get: () => Number(this.options.minDistance ?? DEFAULT_OPTIONS.minDistance),
        set: (value) => this.setSettings({ minDistance: value }, { reheat: true }),
      });
    }

    bindings.push(
      {
        key: 'autoStopAtAlphaMin',
        label: 'Stop at min temp',
        type: 'boolean',
        get: () => this.options.autoStopAtAlphaMin !== false,
        set: (value) => this.setSettings({ autoStopAtAlphaMin: value !== false }),
      },
      {
        key: 'alphaDecay',
        ...createZeroableUnitLogBinding({
          label: 'Temp. decay',
        }),
        get: () => Number(this.options.alphaDecay ?? DEFAULT_OPTIONS.alphaDecay),
        set: (value) => this.setSettings({ alphaDecay: value }, { reheat: true }),
      },
      {
        key: 'alphaTarget',
        ...createZeroableUnitLogBinding({
          label: 'Temp. target',
        }),
        get: () => Number(this.options.alphaTarget ?? DEFAULT_OPTIONS.alphaTarget),
        set: (value) => this.setSettings({ alphaTarget: value }, { reheat: true }),
      },
      {
        key: 'alphaMin',
        ...createZeroableUnitLogBinding({
          label: 'Temp. min',
        }),
        get: () => Number(this.options.alphaMin ?? DEFAULT_OPTIONS.alphaMin),
        set: (value) => this.setSettings({ alphaMin: value }, { reheat: true }),
      },
    );
    return {
      key: 'gpu-force',
      label: umapModel ? 'UMAP Force (GPU)' : 'Force (GPU)',
      dynamic: true,
      bindings,
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
