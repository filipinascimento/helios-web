import { Layout, withLogScaleBinding, withVelocityRetentionBinding } from './Layout.js';
import { GpuForcePositionDelegate } from '../delegates/GpuForcePositionDelegate.js';
import { DEFAULT_LAYOUT_TUNING_MODEL, predictLayoutTuningOptions } from './layoutTuningModel.generated.js';

const DEFAULT_OPTIONS = {
  mode: '3d',
  forceModel: 'linear',
  layoutScheduling: 'auto',
  layoutChunkCount: 2,
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
  kRepulsion: 1,
  kAttraction: 0.62,
  kGravity: 0.001,
  edgeWeightAttribute: null,
  nodeMassAttribute: null,
  forceNormalizationType: 'local-degree',
  umapA: 1.5769434601962196,
  umapB: 0.8950608779914887,
  umapGamma: 1,
  umapNeighborCount: 15,
  umapNegativeSampleRate: 5,
  umapEpochs: null,
  eta: 0.4,
  damping: 0.82,
  maxStep: 2.5,
  minDistance: 0.15,
  alpha: 1,
  alphaDecay: 0.003,
  alphaTarget: 0,
  alphaMin: 0.001,
  autoStopAtAlphaMin: true,
  recenter: true,
  rotationDamping: 0.6,
  componentForces: 'auto',
  componentMode: 'weak',
  componentSeeding: false,
  componentGravity: true,
  componentMainGravityScale: 1.5,
  componentSingletonGravityScale: 0.25,
};

const DEFAULT_UMAP_OUTPUT_SCALE = 24;
const OUTPUT_SCALE_CONTROL_MAX = 100;
const DEFAULT_UMAP_SAMPLE_CHURN = 0.01;
const DEFAULT_UMAP_ALPHA_DECAY = 0.0025;
const AUTO_TUNED_OPTION_KEYS = Object.freeze([
  'maxNeighborsPerNode',
  'sampleCount2D',
  'sampleCount3D',
  'sampleChurn',
  'outputScale',
]);
const AUTO_TUNE_MIN_NODE_COUNT = 10_000;
const AUTO_TUNE_MAX_NODE_COUNT = 1_000_000;
const AUTO_TUNE_TARGET_OPTIONS = Object.freeze({
  maxNeighborsPerNode: 20,
  sampleCount2D: 10,
  sampleCount3D: 10,
  sampleChurn: 0.05,
});

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function hasOwn(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
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

function normalizeForceNormalizationType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'degree' || normalized === 'endpoint-degree') return 'degree';
  if (normalized === 'strength' || normalized === 'weighted-strength') return 'strength';
  if (normalized === 'none' || normalized === 'off' || normalized === 'disabled') return 'none';
  return 'local-degree';
}

function normalizeLayoutScheduling(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'chunk' || normalized === 'chunked') return 'chunked';
  if (normalized === 'full' || normalized === 'legacy' || normalized === 'off') return 'full';
  return 'auto';
}

function normalizeComponentForces(value) {
  if (value === false) return 'off';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'off' || normalized === 'false' || normalized === 'disabled' || normalized === 'none') {
    return 'off';
  }
  if (normalized === 'halo') return 'halo';
  if (normalized === 'supernode' || normalized === 'supernode-experimental') return 'supernode-experimental';
  return 'auto';
}

function resolveLayoutChunkNodeCount(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 65_536;
  return Math.max(1, numeric);
}

function resolveLayoutChunkCount(value) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return DEFAULT_OPTIONS.layoutChunkCount;
  return Math.max(2, Math.min(10, numeric));
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function resolveLayoutNodeCount(network) {
  if (!network || typeof network !== 'object') return 0;
  const directCount = Number(network.nodeCount ?? network.nodeCapacity);
  if (Number.isFinite(directCount) && directCount >= 0) {
    return Math.max(0, Math.floor(directCount));
  }
  const indexedCount = Number(network.nodeIndices?.length);
  if (Number.isFinite(indexedCount) && indexedCount >= 0) {
    return Math.max(0, Math.floor(indexedCount));
  }
  return 0;
}

function resolveAutoTuneProgress(nodeCount) {
  const safeNodeCount = Math.max(0, Math.floor(Number(nodeCount) || 0));
  if (safeNodeCount <= AUTO_TUNE_MIN_NODE_COUNT) return 0;
  if (safeNodeCount >= AUTO_TUNE_MAX_NODE_COUNT) return 1;
  const minLog = Math.log10(AUTO_TUNE_MIN_NODE_COUNT);
  const maxLog = Math.log10(AUTO_TUNE_MAX_NODE_COUNT);
  const nodeLog = Math.log10(safeNodeCount);
  return clamp01((nodeLog - minLog) / (maxLog - minLog));
}

function interpolateAutoTunedValue(base, target, progress, { round = false } = {}) {
  const safeBase = Number(base);
  const safeTarget = Number(target);
  if (!Number.isFinite(safeBase)) return safeTarget;
  if (!Number.isFinite(safeTarget)) return safeBase;
  const value = safeBase + ((safeTarget - safeBase) * clamp01(progress));
  return round ? Math.round(value) : value;
}

export function resolveGpuForceAutoTuning(nodeCount, baseOptions = {}, modelOptions = {}) {
  const progress = resolveAutoTuneProgress(nodeCount);
  const model = modelOptions.model === undefined ? DEFAULT_LAYOUT_TUNING_MODEL : modelOptions.model;
  const modelTuned = model === false || isUmapForceModel(modelOptions.forceModel)
    ? {}
    : predictLayoutTuningOptions(modelOptions.network ?? null, {
        model,
        baseOptions: {
          outputScale: baseOptions.outputScale ?? DEFAULT_OPTIONS.outputScale,
        },
        hints: {
          nodeCount,
          edgeCount: modelOptions.edgeCount,
          avgDegree: modelOptions.avgDegree,
          communityCount: modelOptions.communityCount,
        },
      });
  return {
    maxNeighborsPerNode: interpolateAutoTunedValue(
      baseOptions.maxNeighborsPerNode ?? DEFAULT_OPTIONS.maxNeighborsPerNode,
      AUTO_TUNE_TARGET_OPTIONS.maxNeighborsPerNode,
      progress,
      { round: true },
    ),
    sampleCount2D: interpolateAutoTunedValue(
      baseOptions.sampleCount2D ?? DEFAULT_OPTIONS.sampleCount2D,
      AUTO_TUNE_TARGET_OPTIONS.sampleCount2D,
      progress,
      { round: true },
    ),
    sampleCount3D: interpolateAutoTunedValue(
      baseOptions.sampleCount3D ?? DEFAULT_OPTIONS.sampleCount3D,
      AUTO_TUNE_TARGET_OPTIONS.sampleCount3D,
      progress,
      { round: true },
    ),
    sampleChurn: interpolateAutoTunedValue(
      baseOptions.sampleChurn ?? DEFAULT_OPTIONS.sampleChurn,
      AUTO_TUNE_TARGET_OPTIONS.sampleChurn,
      progress,
    ),
    linkDistance: baseOptions.linkDistance ?? DEFAULT_OPTIONS.linkDistance,
    minDistance: baseOptions.minDistance ?? DEFAULT_OPTIONS.minDistance,
    kRepulsion: baseOptions.kRepulsion ?? DEFAULT_OPTIONS.kRepulsion,
    kAttraction: baseOptions.kAttraction ?? DEFAULT_OPTIONS.kAttraction,
    kGravity: baseOptions.kGravity ?? DEFAULT_OPTIONS.kGravity,
    outputScale: modelTuned.outputScale ?? (baseOptions.outputScale ?? DEFAULT_OPTIONS.outputScale),
  };
}

function applyGpuForceAutoTuning(options, explicitOptions, network, baseAutoTuneOptions) {
  const nodeCount = resolveLayoutNodeCount(network);
  const tuned = resolveGpuForceAutoTuning(nodeCount, baseAutoTuneOptions, {
    network,
    model: options.skipTuningModel || options.umapHasInitialPositions ? false : options.tuningModel,
    forceModel: options.forceModel,
  });
  const next = { ...options };
  for (const key of AUTO_TUNED_OPTION_KEYS) {
    if (!hasOwn(explicitOptions, key)) {
      next[key] = tuned[key];
    }
  }
  return next;
}

function createAutoTuneBaseOptions(options = {}) {
  return {
    maxNeighborsPerNode: options.maxNeighborsPerNode ?? DEFAULT_OPTIONS.maxNeighborsPerNode,
    sampleCount2D: options.sampleCount2D ?? DEFAULT_OPTIONS.sampleCount2D,
    sampleCount3D: options.sampleCount3D ?? DEFAULT_OPTIONS.sampleCount3D,
    sampleChurn: options.sampleChurn ?? DEFAULT_OPTIONS.sampleChurn,
    linkDistance: options.linkDistance ?? DEFAULT_OPTIONS.linkDistance,
    minDistance: options.minDistance ?? DEFAULT_OPTIONS.minDistance,
    kRepulsion: options.kRepulsion ?? DEFAULT_OPTIONS.kRepulsion,
    kAttraction: options.kAttraction ?? DEFAULT_OPTIONS.kAttraction,
    kGravity: options.kGravity ?? DEFAULT_OPTIONS.kGravity,
    outputScale: options.outputScale ?? DEFAULT_OPTIONS.outputScale,
  };
}

/**
 * GPU-backed force layout that can run through WebGPU or WebGL2 delegates.
 *
 * @public
 * @param {import('helios-network').default} network - Source graph.
 * @param {import('../pipeline/VisualAttributes.js').VisualAttributes} visuals
 * Visual attribute owner.
 * @param {object} [options] - Force, UMAP-like force, sampling, damping,
 * recentering, and renderer delegate options.
 * @remarks Renderer support and graph size determine whether WebGPU or WebGL2
 * backing is selected. Position output is written into Helios visual position
 * buffers for rendering.
 */
export class GpuForceLayout extends Layout {
  constructor(network, visuals, options = {}) {
    super(network, visuals);
    const normalizedMode = options.mode === '2d' ? '2d' : '3d';
    const normalized = {
      ...DEFAULT_OPTIONS,
      ...options,
      mode: normalizedMode,
      center: normalizeCenter(options.center ?? DEFAULT_OPTIONS.center),
      layoutScheduling: normalizeLayoutScheduling(options.layoutScheduling ?? DEFAULT_OPTIONS.layoutScheduling),
      layoutChunkCount: resolveLayoutChunkCount(options.layoutChunkCount),
      layoutChunkNodeCount: options.layoutChunkNodeCount == null
        ? null
        : resolveLayoutChunkNodeCount(options.layoutChunkNodeCount),
      componentForces: normalizeComponentForces(options.componentForces ?? DEFAULT_OPTIONS.componentForces),
    };
    if (isUmapForceModel(normalized.forceModel)) {
      if (options.outputScale == null) normalized.outputScale = DEFAULT_UMAP_OUTPUT_SCALE;
      if (options.kRepulsion == null) normalized.kRepulsion = 1;
      if (options.kAttraction == null) normalized.kAttraction = 1;
      if (options.kGravity == null) normalized.kGravity = 0;
      if (options.eta == null) normalized.eta = 1;
      if (options.alphaDecay == null) normalized.alphaDecay = DEFAULT_UMAP_ALPHA_DECAY;
      if (options.sampleChurn == null) normalized.sampleChurn = DEFAULT_UMAP_SAMPLE_CHURN;
    }
    this._autoTuneExplicitKeys = new Set(
      AUTO_TUNED_OPTION_KEYS.filter((key) => hasOwn(options, key)),
    );
    this._autoTuneBaseOptions = createAutoTuneBaseOptions(normalized);
    this.options = applyGpuForceAutoTuning(normalized, options, network, this._autoTuneBaseOptions);
    this.helios = options.helios ?? null;
    this.positionDelegate = new GpuForcePositionDelegate(this.options);
    this.lastUpdate = 0;
  }

  getPositionDelegate() {
    return this.positionDelegate;
  }

  async initialize() {
    this._updateRequested = true;
  }

  shouldRun() {
    return !this.isPositionHandoffPending();
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
      this.emitUpdate({
        timestamp: performance.now(),
        layoutElapsedMs: deltaMs,
        delegateChanged: true,
      });
      this.helios?.scheduler?.requestRender?.();
    }
    return changed;
  }

  resize(size) {
    if (!size) return;
    this.positionDelegate.updateOptions({ center: normalizeCenter(this.options.center) });
  }

  _getAutoTuneExplicitKeys() {
    if (!(this._autoTuneExplicitKeys instanceof Set)) {
      this._autoTuneExplicitKeys = new Set();
    }
    return this._autoTuneExplicitKeys;
  }

  _getAutoTuneBaseOptions() {
    if (!this._autoTuneBaseOptions || typeof this._autoTuneBaseOptions !== 'object') {
      this._autoTuneBaseOptions = createAutoTuneBaseOptions(this.options);
    }
    return this._autoTuneBaseOptions;
  }

  syncAutoSettingsForNetwork(network = this.network, { reheat = false, reason = 'layout-auto-tune' } = {}) {
    if (network) {
      this.network = network;
    }
    const explicitKeys = this._getAutoTuneExplicitKeys();
    const baseAutoTuneOptions = this._getAutoTuneBaseOptions();
    const explicitOptions = Object.fromEntries(
      Array.from(explicitKeys, (key) => [key, this.options?.[key]]),
    );
    const nextOptions = applyGpuForceAutoTuning(
      this.options,
      explicitOptions,
      this.network,
      baseAutoTuneOptions,
    );
    let changed = false;
    for (const key of AUTO_TUNED_OPTION_KEYS) {
      if (!explicitKeys.has(key) && nextOptions[key] !== this.options[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return false;
    this.options = nextOptions;
    this.positionDelegate?.updateOptions?.(this.options);
    if (reheat) {
      this._applyReheatAlpha();
      super.reheat(reason);
    }
    return true;
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
    const explicitKeys = this._getAutoTuneExplicitKeys();
    const baseAutoTuneOptions = this._getAutoTuneBaseOptions();
    for (const key of AUTO_TUNED_OPTION_KEYS) {
      if (hasOwn(next, key)) {
        explicitKeys.add(key);
      }
    }
    this.options = {
      ...this.options,
      ...next,
      center: normalizeCenter(next.center ?? this.options.center),
      mode: (next.mode ?? this.options.mode) === '3d' ? '3d' : '2d',
      layoutScheduling: normalizeLayoutScheduling(next.layoutScheduling ?? this.options.layoutScheduling),
      layoutChunkCount: resolveLayoutChunkCount(next.layoutChunkCount ?? this.options.layoutChunkCount),
      layoutChunkNodeCount: next.layoutChunkNodeCount == null
        ? (hasOwn(next, 'layoutChunkCount') ? null : this.options.layoutChunkNodeCount)
        : resolveLayoutChunkNodeCount(next.layoutChunkNodeCount),
      componentForces: normalizeComponentForces(next.componentForces ?? this.options.componentForces),
    };
    if (isUmapForceModel(this.options.forceModel) && !isUmapForceModel(prevForceModel)) {
      if (next.outputScale == null) this.options.outputScale = DEFAULT_UMAP_OUTPUT_SCALE;
      if (next.kRepulsion == null) this.options.kRepulsion = 1;
      if (next.kAttraction == null) this.options.kAttraction = 1;
      if (next.kGravity == null) this.options.kGravity = 0;
      if (next.eta == null) this.options.eta = 1;
      if (next.alphaDecay == null) this.options.alphaDecay = DEFAULT_UMAP_ALPHA_DECAY;
      if (next.sampleChurn == null) this.options.sampleChurn = DEFAULT_UMAP_SAMPLE_CHURN;
    }
    if (!explicitKeys.has('sampleChurn')) {
      baseAutoTuneOptions.sampleChurn = this.options.sampleChurn;
    }
    this.options = applyGpuForceAutoTuning(
      this.options,
      Object.fromEntries(Array.from(explicitKeys, (key) => [key, this.options[key]])),
      this.network,
      baseAutoTuneOptions,
    );
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
          max: OUTPUT_SCALE_CONTROL_MAX,
        }),
        get: () => Number(this.options.outputScale ?? DEFAULT_OPTIONS.outputScale),
        set: (value) => this.setSettings({ outputScale: value }, { reheat: true }),
      },
      {
        key: 'rotationDamping',
        label: 'Rotation damping',
        hint: 'Projects out the estimated rigid-body spin after each GPU step. 0 disables the correction; 1 removes the full fitted rotation component.',
        type: 'number',
        min: 0,
        max: 1,
        step: 0.01,
        inputMin: 0,
        inputMax: 1,
        sliderMin: 0,
        sliderMax: 1,
        get: () => Number(this.options.rotationDamping ?? DEFAULT_OPTIONS.rotationDamping),
        set: (value) => this.setSettings({ rotationDamping: value }),
      },
      {
        key: 'layoutScheduling',
        label: 'Scheduling',
        hint: 'Auto uses chunked WebGPU layout above 500k active nodes. Full keeps the legacy one-step dispatch. Chunked reduces render queue stalls but converges more slowly.',
        type: 'select',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'full', label: 'Full' },
          { value: 'chunked', label: 'Chunked' },
        ],
        get: () => normalizeLayoutScheduling(this.options.layoutScheduling ?? DEFAULT_OPTIONS.layoutScheduling),
        set: (value) => this.setSettings({ layoutScheduling: normalizeLayoutScheduling(value) }),
      },
      {
        key: 'layoutChunkCount',
        label: 'Chunks',
        hint: 'Number of WebGPU layout chunks per full sweep when chunked scheduling is active.',
        type: 'number',
        min: 2,
        max: 10,
        inputMin: 2,
        inputMax: 10,
        sliderMin: 2,
        sliderMax: 10,
        step: 1,
        get: () => resolveLayoutChunkCount(this.options.layoutChunkCount),
        set: (value) => this.setSettings({ layoutChunkCount: resolveLayoutChunkCount(value) }),
      },
      {
        key: 'componentForces',
        label: 'Components',
        hint: 'Auto scales gravity for singleton-heavy layouts without changing dense connected layouts. Off disables component metadata. Force halo applies component gravity unconditionally without reseeding positions.',
        type: 'select',
        options: [
          { value: 'auto', label: 'Auto' },
          { value: 'off', label: 'Off' },
          { value: 'halo', label: 'Force halo' },
        ],
        get: () => normalizeComponentForces(this.options.componentForces ?? DEFAULT_OPTIONS.componentForces),
        set: (value) => this.setSettings({ componentForces: normalizeComponentForces(value) }, { reheat: true }),
      },
    ];

    if (umapModel) {
      bindings.push(
        {
          key: 'umapEpochCurrent',
          label: 'Epochs',
          type: 'display',
          get: () => Number(this.positionDelegate?.getCompletedEpochs?.() ?? 0),
          format: (value) => String(Math.max(0, Math.floor(Number(value) || 0))),
        },
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
          key: 'forceNormalizationType',
          label: 'Normalize by',
          type: 'select',
          options: [
            { value: 'local-degree', label: 'Local degree' },
            { value: 'degree', label: 'Degree' },
            { value: 'strength', label: 'Strength' },
            { value: 'none', label: 'None' },
          ],
          get: () => normalizeForceNormalizationType(this.options.forceNormalizationType),
          set: (value) => this.setSettings({ forceNormalizationType: normalizeForceNormalizationType(value) }, { reheat: true }),
        },
        {
          key: 'kRepulsion',
          ...withLogScaleBinding({
            label: 'Repulsion',
            min: 0.01,
            max: 100,
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
          min: 0.00001,
          max: 0.1,
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
    const forceFullStartupLayout = this.helios?._isStartupLayoutWarmupActive?.() === true
      && normalizeLayoutScheduling(this.options.layoutScheduling ?? DEFAULT_OPTIONS.layoutScheduling) === 'auto';
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
      layoutSchedulingOverride: forceFullStartupLayout ? 'full' : null,
    };
  }
}

export default GpuForceLayout;
