import { Behavior } from './Behavior.js';
import { StaticLayout, WorkerLayout } from '../layouts/Layout.js';
import { D3Force3DLayout } from '../layouts/d3force3dLayoutWorker.js';
import { GpuForceLayout } from '../layouts/GpuForceLayout.js';

const CURRENT_POSITION_ATTRIBUTE = '_helios_visuals_position';
const RANDOM_LAYOUT_POSITION_CHOICE = '$random';
const CAMERA_MOVE_EVENT = 'camera:move';
const PAUSE_ON_INTERACTION_NODE_COUNT = 1_000_000;
const PAUSE_ON_INTERACTION_RESUME_DELAY_MS = 300;

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function') continue;
    if (key === 'helios') continue;
    next[key] = cloneSerializable(entry);
  }
  return next;
}

function collectStateKeys(detail = {}) {
  const keys = [];
  if (typeof detail.storageKey === 'string') keys.push(detail.storageKey);
  if (typeof detail.stateKey === 'string') keys.push(detail.stateKey);
  if (Array.isArray(detail.storageKeys)) {
    for (const key of detail.storageKeys) if (typeof key === 'string') keys.push(key);
  }
  if (Array.isArray(detail.stateKeys)) {
    for (const key of detail.stateKeys) if (typeof key === 'string') keys.push(key);
  }
  return keys;
}

function keyMatchesTarget(key, target) {
  if (!key || !target) return false;
  return key === target || key.startsWith(`${target}.`) || target.startsWith(`${key}.`);
}

function layoutEventTargetsPath(detail = {}, path = '') {
  const keys = collectStateKeys(detail);
  if (!keys.length) return false;
  return keys.some((key) => keyMatchesTarget(key, path) || keyMatchesTarget(key, `behaviors.${path}`));
}

function getLayoutDescriptor(layout) {
  const descriptor = typeof layout?.getParameterBindings === 'function'
    ? (layout.getParameterBindings() ?? null)
    : null;
  if (descriptor && typeof descriptor === 'object') return descriptor;
  return {
    key: 'static',
    label: layout?.constructor?.name ?? 'Layout',
    dynamic: false,
    bindings: [],
  };
}

function getRendererLabel(helios) {
  const type = String(helios?.renderer?.device?.type ?? '').toLowerCase();
  if (type === 'webgpu') return 'GPU/WebGPU';
  if (type === 'webgl2' || type === 'webgl') return 'GPU/WebGL2';
  return 'GPU';
}

function getLayoutChoices(helios) {
  return [
    { value: 'worker:force3d', label: 'Force (worker)' },
    { value: 'gpu-force', label: `Force (${getRendererLabel(helios)})` },
    { value: 'd3force3d', label: 'D3 Force 3D (worker)' },
    { value: 'worker:jitter', label: 'Jitter (worker)' },
    { value: 'static', label: 'Static (no layout)' },
  ];
}

function getLayoutRunState(helios) {
  const scheduler = helios?.scheduler ?? null;
  if (!scheduler) return 'stopped';
  if (typeof scheduler.getLayoutState === 'function') {
    return scheduler.getLayoutState();
  }
  return scheduler.layoutEnabled !== false ? 'running' : 'stopped';
}

function graphSizeForInteractionPause(helios) {
  const network = helios?.network ?? null;
  const nodeCount = Number(network?.nodeCount);
  const nodeCapacity = Number(network?.nodeCapacity);
  return Math.max(
    Number.isFinite(nodeCount) ? nodeCount : 0,
    Number.isFinite(nodeCapacity) ? nodeCapacity : 0,
  );
}

function defaultPauseOnInteraction(helios) {
  return graphSizeForInteractionPause(helios) >= PAUSE_ON_INTERACTION_NODE_COUNT;
}

function normalizeOptionalBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function normalizeNonNegativeNumber(value, fallback, max = Number.POSITIVE_INFINITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return Math.min(numeric, max);
}

function interactionNow() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function isManualCameraMove(detail = {}) {
  const source = String(detail?.origin ?? detail?.source ?? '').toLowerCase();
  if (source === 'interaction') return true;
  return detail?.manual === true || detail?.change?.manual === true;
}

function buildLayoutInstance(helios, value) {
  const mode = helios?.options?.mode === '3d' ? '3d' : '2d';
  const nodeCount = Math.max(1, Number(helios?.network?.nodeCount ?? helios?.network?.nodeCapacity ?? 1000));
  const radius = 220 * Math.sqrt(nodeCount / 1000);
  const depth = mode === '3d' ? 140 : 0;

  if (value === 'static') {
    return helios.createLayout({
      type: 'static',
      options: { bounds: [-500, -500, 500, 500] },
    });
  }

  if (value === 'd3force3d') {
    return helios.createLayout({
      type: 'd3force3d',
      options: {
        settings: {
          use2D: mode !== '3d',
          alphaDecay: 0.003,
        },
      },
    });
  }

  if (value === 'gpu-force') {
    return helios.createLayout({
      type: 'gpu-force',
      options: {
        mode,
        center: [0, 0, 0],
        radius,
        depth,
        eta: 0.4,
        damping: 0.82,
        maxStep: 2.5,
      },
    });
  }

  if (value === 'worker:jitter') {
    return helios.createLayout({
      type: 'worker',
      options: {
        layout: 'jitter',
        mode,
        center: [0, 0, 0],
        radius,
        depth,
        jitter: 3,
      },
    });
  }

  return helios.createLayout({
    type: 'worker',
    options: {
      layout: 'force3d',
      mode,
      center: [0, 0, 0],
      radius,
      depth,
      kRepulsion: 3,
      kAttraction: 0.003,
      kGravity: 0.0008,
      repulsionStrategy: 'barnes-hut',
      negativesPerNode: 64,
      negativeSampling: true,
    },
  });
}

function snapshotLayoutBindingValues(layout) {
  const descriptor = getLayoutDescriptor(layout);
  const parameters = {};
  for (const binding of descriptor.bindings ?? []) {
    if (!binding || binding.type === 'display' || typeof binding.get !== 'function') continue;
    parameters[binding.key] = cloneSerializable(binding.get());
  }
  return parameters;
}

function bindingStateEntryType(binding) {
  const type = String(binding?.type ?? '').trim();
  if (type === 'boolean') return 'boolean';
  if (type === 'select') return 'string';
  if (type === 'number') return 'number';
  if (type === 'string') return 'string';
  return 'object';
}

const LAYOUT_PARAMETER_LABELS = Object.freeze({
  jitter: 'Jitter',
  kRepulsion: 'Repulsion',
  kAttraction: 'Attraction',
  kGravity: 'Gravity',
  eta: 'Step Rate',
  damping: 'Velocity Retention',
  maxStep: 'Max Step',
  theta: 'Theta',
  repulsionStrategy: 'Repulsion',
  negativeSampling: 'Extra Negatives',
  negativesPerNode: 'Negatives / Node',
  negativeSampleRate: 'Negative Sample Rate',
  negativeSampleChurn: 'Negative Sample Churn',
  maxNeighborsPerNode: 'Neighbors / Node',
  outputScale: 'Output Scale',
  rotationDamping: 'Rotation Damping',
  minDistance: 'Min Distance',
  maxForce: 'Max Force',
  leafSize: 'Leaf Size',
});

function fallbackControlLabel(value) {
  return String(value ?? '')
    .replace(/[_-]+/gu, ' ')
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/\b\w/gu, (match) => match.toUpperCase());
}

function layoutParameterLabel(binding) {
  const explicit = typeof binding?.label === 'string' ? binding.label.trim() : '';
  if (explicit) return explicit;
  const key = typeof binding?.key === 'string' ? binding.key.trim() : '';
  return LAYOUT_PARAMETER_LABELS[key] ?? fallbackControlLabel(key);
}

function bindingStateEntryUi(binding) {
  const controller = binding?.type === 'select'
    ? 'select'
    : (binding?.type === 'boolean' ? 'toggle' : (binding?.type === 'number' ? 'slider' : 'auto'));
  return {
    label: layoutParameterLabel(binding),
    controller,
    min: binding?.min ?? binding?.sliderMin ?? null,
    max: binding?.max ?? binding?.sliderMax ?? null,
    step: binding?.step ?? binding?.inputStep ?? null,
    inputMin: binding?.inputMin ?? null,
    inputMax: Object.prototype.hasOwnProperty.call(binding ?? {}, 'inputMax') ? binding.inputMax : null,
    sliderMin: binding?.sliderMin ?? null,
    sliderMax: binding?.sliderMax ?? null,
    scale: binding?.scale ?? null,
    options: binding?.options ?? null,
    debounceMs: 220,
  };
}

function layoutParameterStateEntries(layoutBehavior) {
  const entries = {};
  for (const binding of layoutBehavior.bindings() ?? []) {
    const key = typeof binding?.key === 'string' ? binding.key.trim() : '';
    if (!key || binding.type === 'display' || typeof binding.get !== 'function') continue;
    entries[`parameters.${key}`] = {
      description: binding.hint ?? `Layout parameter ${key}.`,
      default: cloneSerializable(binding.get()),
      type: bindingStateEntryType(binding),
      scope: 'workspace',
      aliases: [`layout.parameters.${key}`],
      ui: bindingStateEntryUi(binding),
      getter: () => cloneSerializable(layoutBehavior.parameter(key)),
      setter: (value) => layoutBehavior.parameter(key, value, { silent: true }),
      subscribe: (notify) => layoutBehavior.on('change', (event) => {
          const detail = event?.detail ?? event ?? {};
          const changedKey = detail.key ?? null;
          const changedKeys = Array.isArray(detail.keys) ? detail.keys : [];
          if (changedKey && changedKey !== key) return;
          if (changedKeys.length && !changedKeys.includes(key)) return;
          if (!changedKey && !changedKeys.length && !layoutEventTargetsPath(detail, `layout.parameters.${key}`)) return;
          notify(undefined, detail);
        }),
    };
  }
  return entries;
}

function snapshotLowLevelLayoutConfig(layout) {
  if (!layout) return null;
  if (layout instanceof GpuForceLayout) {
    return { type: 'gpu-force', options: cloneSerializable(layout.options) };
  }
  if (layout instanceof D3Force3DLayout) {
    return {
      type: 'd3force3d',
      options: {
        ...cloneSerializable(layout.options),
        settings: cloneSerializable(layout.settings),
      },
    };
  }
  if (layout instanceof WorkerLayout) {
    return { type: 'worker', options: cloneSerializable(layout.options) };
  }
  if (layout instanceof StaticLayout) {
    return { type: 'static', options: { bounds: cloneSerializable(layout.bounds) } };
  }
  return null;
}

/**
 * Built-in behavior for choosing and controlling the active layout.
 *
 * @public
 * @param {object} [options] - Layout options such as `layoutType`,
 * `positionAttribute`, low-level `parameters`, and `running` state.
 * @returns {LayoutBehavior} Behavior wrapping static, worker, D3 force, and
 * GPU force layouts.
 * @remarks Use this behavior when UI or persistence needs to switch layouts,
 * copy numeric position attributes into current positions, or start/stop a
 * dynamic layout without replacing the Helios instance.
 */
export class LayoutBehavior extends Behavior {
  static id = 'layout';

  constructor(options = {}) {
    super(options);
    this.state = {
      positionAttribute: CURRENT_POSITION_ATTRIBUTE,
      pauseOnInteraction: false,
    };
    this._pauseOnInteractionExplicit = Object.prototype.hasOwnProperty.call(options, 'pauseOnInteraction')
      && normalizeOptionalBoolean(options.pauseOnInteraction) !== null;
    this._pauseOnInteractionResumeDelayMs = PAUSE_ON_INTERACTION_RESUME_DELAY_MS;
    this._interactionPauseTimer = null;
    this._interactionPauseActive = false;
    this._interactionPointerIds = new Set();
    this._lastInteractionAt = 0;
    this.update(options);
  }

  attach(context) {
    super.attach(context);
    const helios = this.context?.helios ?? null;
    this._refreshPauseOnInteractionDefault({ emit: false, rebaseline: false });
    this.addCleanup(() => {
      this._clearInteractionPauseTimer();
      this._resumeAfterCameraInteraction();
    });
    this._attachInteractionDebounceListeners(helios);
    this.addCleanup(this.context.subscribe(helios, 'layout:changed', () => this.emitChange('layout-changed', { source: 'refresh', trackOverride: false })));
    this.addCleanup(this.context.subscribe(helios, 'layout:start', () => this.emitChange('layout-start', { source: 'refresh', trackOverride: false })));
    this.addCleanup(this.context.subscribe(helios, 'layout:stop', () => this.emitChange('layout-stop', { source: 'refresh', trackOverride: false })));
    this.addCleanup(this.context.subscribe(helios, 'network:replaced', () => {
      this._refreshPauseOnInteractionDefault({ emit: true });
      this.refreshParameterStateEntries();
      this.emitChange('network-replaced', { trackOverride: false });
    }));
    this.addCleanup(this.context.subscribe(helios, CAMERA_MOVE_EVENT, (event) => {
      this._maybePauseForCameraInteraction(event?.detail ?? event ?? {});
    }));
    this.emitChange('attach', { source: 'default', trackOverride: false });
    return this;
  }

  update(options = {}) {
    super.update(options);
    if (!options || typeof options !== 'object') return this;
    if (Object.prototype.hasOwnProperty.call(options, 'positionAttribute')) {
      const value = options.positionAttribute;
      this.state.positionAttribute = typeof value === 'string' && value.trim()
        ? value.trim()
        : CURRENT_POSITION_ATTRIBUTE;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'pauseOnInteraction')) {
      const value = normalizeOptionalBoolean(options.pauseOnInteraction);
      if (value !== null) {
        this.state.pauseOnInteraction = value;
        this._pauseOnInteractionExplicit = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(options, 'pauseOnInteractionResumeDelayMs')) {
      this._pauseOnInteractionResumeDelayMs = normalizeNonNegativeNumber(
        options.pauseOnInteractionResumeDelayMs,
        PAUSE_ON_INTERACTION_RESUME_DELAY_MS,
        10_000,
      );
    }
    if (Object.prototype.hasOwnProperty.call(options, 'layoutType')) {
      this.type(options.layoutType, { preserveRunState: options.preserveRunState !== false });
    }
    if (options.parameters && typeof options.parameters === 'object') {
      this.parameters(options.parameters, { silent: true });
    }
    if (Object.prototype.hasOwnProperty.call(options, 'running')) {
      if (options.running === true) this.start();
      else this.stop('behavior:layout-options');
    }
    this.emitChange('options');
    return this;
  }

  serialize() {
    const layout = this.context?.helios?.layout?.() ?? null;
    return {
      options: {
        layoutType: this.type(),
        parameters: snapshotLayoutBindingValues(layout),
        running: this.runState() !== 'stopped',
        pauseOnInteraction: this.pauseOnInteraction(),
      },
    };
  }

  stateEntries() {
    return {
      state: {
        description: 'Serializable layout behavior state.',
        default: this.serialize(),
        type: 'object',
        scope: 'workspace',
        aliases: ['layout.state'],
        getter: () => this.serialize(),
        setter: (value) => this.restore(value),
        subscribe: (notify) => this.on('change', (event) => {
          const detail = event?.detail ?? event ?? {};
          const reason = detail.reason ?? null;
          if (reason === 'parameter' || reason === 'parameters') return;
          if (!layoutEventTargetsPath(detail, 'layout.state')) return;
          notify(undefined, detail);
        }),
      },
      layoutType: {
        description: 'Active layout implementation.',
        default: this.type(),
        type: 'string',
        scope: 'workspace',
        aliases: ['layout.layoutType'],
        ui: {
          label: 'Layout',
          controller: 'select',
          options: () => this.choices(),
        },
        getter: () => this.type(),
        setter: (value) => this.type(value, { preserveRunState: false }),
        subscribe: (notify) => this.on('change', (event) => {
          const detail = event?.detail ?? event ?? {};
          if (!layoutEventTargetsPath(detail, 'layout.layoutType')) return;
          notify(undefined, detail);
        }),
      },
      running: {
        description: 'Whether the active dynamic layout is running.',
        default: this.runState() !== 'stopped',
        type: 'boolean',
        scope: 'session',
        aliases: ['layout.running'],
        ui: {
          label: 'Running',
          controller: 'toggle',
        },
        getter: () => this.runState() !== 'stopped',
        setter: (value) => {
          if (value === true) this.start();
          else this.stop('storage');
        },
        subscribe: (notify) => this.on('change', (event) => {
          const detail = event?.detail ?? event ?? {};
          if (!layoutEventTargetsPath(detail, 'layout.running')) return;
          notify(undefined, detail);
        }),
      },
      pauseOnInteraction: this._pauseOnInteractionStateEntry(),
      parameters: {
        description: 'Active layout parameter values.',
        default: this.parameters(),
        type: 'object',
        scope: 'workspace',
        aliases: ['layout.parameters'],
        ui: {
          label: 'Parameters',
          controller: 'object',
          debounceMs: 220,
        },
        getter: () => this.parameters(),
        setter: (value) => this.parameters(value, { silent: false }),
        subscribe: () => () => {},
      },
      ...layoutParameterStateEntries(this),
    };
  }

  refreshParameterStateEntries() {
    const stateManager = this.context?.helios?.states ?? this.context?.helios?.storage ?? null;
    if (typeof stateManager?.register !== 'function') return this;
    const entries = layoutParameterStateEntries(this);
    if (Object.keys(entries).length > 0) {
      stateManager.register(this, 'behaviors.layout', entries);
    }
    return this;
  }

  refreshPauseOnInteractionStateEntry() {
    const stateManager = this.context?.helios?.states ?? this.context?.helios?.storage ?? null;
    if (typeof stateManager?.register !== 'function') return this;
    stateManager.register(this, 'behaviors.layout', {
      pauseOnInteraction: this._pauseOnInteractionStateEntry(),
    });
    return this;
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    if (options.layoutType) {
      this.type(options.layoutType, { preserveRunState: false, emitChange: false });
    }
    if (options.parameters && typeof options.parameters === 'object') {
      this.parameters(options.parameters, { silent: true });
    }
    if (Object.prototype.hasOwnProperty.call(options, 'pauseOnInteraction')) {
      const value = normalizeOptionalBoolean(options.pauseOnInteraction);
      if (value !== null) {
        this.state.pauseOnInteraction = value;
        this._pauseOnInteractionExplicit = true;
      }
    }
    if (options.running === true && this.isDynamic()) {
      this.start();
    } else if (options.running === false || !this.isDynamic()) {
      this.stop('restore');
    }
    this.emitChange('restore', { source: 'restore', trackOverride: false });
    return this;
  }

  _pauseOnInteractionStateEntry() {
    return {
      description: 'Pause layout updates during manual camera pan, zoom, or rotation.',
      default: this.pauseOnInteraction(),
      type: 'boolean',
      scope: 'workspace',
      aliases: ['layout.pauseOnInteraction'],
      ui: {
        label: 'Pause On Input',
        controller: 'toggle',
      },
      getter: () => this.pauseOnInteraction(),
      setter: (value) => this.pauseOnInteraction(value),
      subscribe: (notify) => this.on('change', (event) => {
        const detail = event?.detail ?? event ?? {};
        if (!layoutEventTargetsPath(detail, 'layout.pauseOnInteraction')) return;
        notify(undefined, detail);
      }),
    };
  }

  emitChange(reason, detail = {}) {
    this.emit('change', { reason, state: this.getPublicState(), ...detail });
    return this;
  }

  getPublicState() {
    const descriptor = this.descriptor();
    const runState = this.runState();
    const dynamic = descriptor.dynamic === true;
    return {
      layoutType: descriptor.key,
      layoutLabel: descriptor.label,
      dynamic,
      runState,
      running: runState !== 'stopped',
      pauseOnInteraction: this.pauseOnInteraction(),
      pauseOnInteractionAuto: this._pauseOnInteractionExplicit !== true,
      positionAttribute: this.state.positionAttribute,
      effectivePositionAttribute: dynamic && runState !== 'stopped'
        ? CURRENT_POSITION_ATTRIBUTE
        : this.state.positionAttribute,
      layoutChoices: this.choices(),
      lowLevelLayout: snapshotLowLevelLayoutConfig(this.context?.helios?.layout?.() ?? null),
    };
  }

  descriptor() {
    return getLayoutDescriptor(this.context?.helios?.layout?.() ?? null);
  }

  choices() {
    return getLayoutChoices(this.context?.helios ?? null);
  }

  bindings() {
    return this.descriptor().bindings ?? [];
  }

  runState() {
    return getLayoutRunState(this.context?.helios ?? null);
  }

  isDynamic() {
    return this.descriptor().dynamic === true;
  }

  type(value, options = {}) {
    const helios = this.context?.helios ?? null;
    if (arguments.length === 0) return this.descriptor().key;
    if (!helios || typeof helios.createLayout !== 'function' || typeof helios.layout !== 'function') return this;
    const previousRunState = this.runState();
    const nextLayout = buildLayoutInstance(helios, String(value ?? '').trim() || 'static');
    helios.layout(nextLayout);
    this.refreshParameterStateEntries();
    if (this.type() === 'static') {
      helios.stopLayout?.(options.reason ?? 'behavior:layout-type');
    } else if (options.preserveRunState !== false && previousRunState !== 'stopped') {
      nextLayout?.reheat?.(options.reason ?? 'behavior:layout-type');
      helios.startLayout?.();
    }
    if (options.emitChange !== false) this.emitChange('type', {
      trackOverride: options.trackOverride !== false,
      storageKeys: ['layout.layoutType'],
    });
    return this;
  }

  parameter(key, value, options = {}) {
    if (arguments.length === 1) {
      const binding = this.bindings().find((entry) => entry?.key === key);
      return typeof binding?.get === 'function' ? binding.get() : undefined;
    }
    const binding = this.bindings().find((entry) => entry?.key === key);
    if (typeof binding?.set !== 'function') return this;
    binding.set(value);
    if (options.silent !== true) this.emitChange('parameter', {
      key,
      value,
      trackOverride: options.trackOverride !== false,
      storageKeys: [`layout.parameters.${key}`],
    });
    return this;
  }

  parameters(patch = {}, options = {}) {
    if (arguments.length === 0) return snapshotLayoutBindingValues(this.context?.helios?.layout?.() ?? null);
    const keys = [];
    for (const [key, value] of Object.entries(patch ?? {})) {
      keys.push(key);
      this.parameter(key, value, { silent: true });
    }
    if (options.silent !== true) this.emitChange('parameters', {
      keys,
      trackOverride: options.trackOverride !== false,
      storageKeys: keys.map((key) => `layout.parameters.${key}`),
    });
    return this;
  }

  pauseOnInteraction(value, options = {}) {
    if (arguments.length === 0) return this.state.pauseOnInteraction === true;
    const normalized = normalizeOptionalBoolean(value);
    if (normalized === null) return this;
    const changed = this.state.pauseOnInteraction !== normalized;
    this.state.pauseOnInteraction = normalized;
    this._pauseOnInteractionExplicit = true;
    if (normalized === false) {
      this._clearInteractionPauseTimer();
      this._resumeAfterCameraInteraction({ force: true });
    }
    if (changed || options.forceEmit === true) {
      this.emitChange('pause-on-interaction', {
        trackOverride: options.trackOverride !== false,
        storageKeys: ['layout.pauseOnInteraction'],
      });
    }
    return this;
  }

  _refreshPauseOnInteractionDefault(options = {}) {
    if (this._pauseOnInteractionExplicit === true) return this;
    const next = defaultPauseOnInteraction(this.context?.helios ?? null);
    if (this.state.pauseOnInteraction === next) return this;
    this.state.pauseOnInteraction = next;
    if (options.rebaseline !== false) {
      this.refreshPauseOnInteractionStateEntry();
    }
    if (options.emit === true) {
      this.emitChange('pause-on-interaction-default', {
        source: 'default',
        trackOverride: false,
      });
    }
    return this;
  }

  _clearInteractionPauseTimer() {
    if (this._interactionPauseTimer == null) return this;
    clearTimeout(this._interactionPauseTimer);
    this._interactionPauseTimer = null;
    return this;
  }

  _attachInteractionDebounceListeners(helios = null) {
    const canvas = helios?.layers?.canvas ?? helios?.renderer?.canvas ?? null;
    if (!canvas || typeof canvas.addEventListener !== 'function') return this;
    const onPointerDown = (event) => {
      const pointerId = event?.pointerId;
      if (pointerId != null) this._interactionPointerIds.add(pointerId);
      this._recordManualInteractionActivity();
    };
    const onPointerMove = (event) => {
      const pointerId = event?.pointerId;
      if (pointerId != null && !this._interactionPointerIds.has(pointerId)) return;
      this._recordManualInteractionActivity();
    };
    const onPointerEnd = (event) => {
      const pointerId = event?.pointerId;
      if (pointerId != null) this._interactionPointerIds.delete(pointerId);
      this._recordManualInteractionActivity();
      if (this._interactionPauseActive) this._scheduleInteractionResume();
    };
    const onPointerLeave = (event) => {
      if (event?.buttons != null && event.buttons !== 0) return;
      const pointerId = event?.pointerId;
      if (pointerId != null) this._interactionPointerIds.delete(pointerId);
      this._recordManualInteractionActivity();
      if (this._interactionPauseActive) this._scheduleInteractionResume();
    };
    const onWheel = () => {
      this._recordManualInteractionActivity();
      if (this._interactionPauseActive) this._scheduleInteractionResume();
    };
    canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
    canvas.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerup', onPointerEnd, { passive: true });
    canvas.addEventListener('pointercancel', onPointerEnd, { passive: true });
    canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });
    canvas.addEventListener('wheel', onWheel, { passive: true });
    this.addCleanup(() => {
      canvas.removeEventListener?.('pointerdown', onPointerDown);
      canvas.removeEventListener?.('pointermove', onPointerMove);
      canvas.removeEventListener?.('pointerup', onPointerEnd);
      canvas.removeEventListener?.('pointercancel', onPointerEnd);
      canvas.removeEventListener?.('pointerleave', onPointerLeave);
      canvas.removeEventListener?.('wheel', onWheel);
      this._interactionPointerIds.clear();
    });
    return this;
  }

  _recordManualInteractionActivity() {
    this._lastInteractionAt = interactionNow();
    if (this._interactionPauseActive && this._interactionPointerIds.size > 0) {
      this._clearInteractionPauseTimer();
    }
    return this;
  }

  _scheduleInteractionResume() {
    this._clearInteractionPauseTimer();
    if (this._interactionPointerIds.size > 0) return this;
    const delayMs = this._pauseOnInteractionResumeDelayMs;
    this._interactionPauseTimer = setTimeout(() => {
      this._interactionPauseTimer = null;
      const elapsed = interactionNow() - this._lastInteractionAt;
      if (elapsed < delayMs || this._interactionPointerIds.size > 0) {
        this._scheduleInteractionResume();
        return;
      }
      this._resumeAfterCameraInteraction();
    }, delayMs);
    return this;
  }

  _pauseLayoutForCameraInteraction() {
    const helios = this.context?.helios ?? null;
    const scheduler = helios?.scheduler ?? null;
    if (!scheduler || typeof scheduler.setLayoutEnabled !== 'function') return false;
    scheduler.setLayoutEnabled(false, 'idle');
    scheduler.requestRender?.();
    this._interactionPauseActive = true;
    this.emitChange('interaction-pause', {
      source: 'interaction',
      trackOverride: false,
    });
    return true;
  }

  _resumeAfterCameraInteraction(options = {}) {
    if (!this._interactionPauseActive) return false;
    this._interactionPauseActive = false;
    if (options.force !== true && this.pauseOnInteraction() !== true) return false;
    if (!this.isDynamic()) return false;
    if (this.runState() !== 'idle') return false;
    const scheduler = this.context?.helios?.scheduler ?? null;
    if (!scheduler || typeof scheduler.setLayoutEnabled !== 'function') return false;
    scheduler.setLayoutEnabled(true, 'camera-interaction');
    scheduler.requestLayout?.('camera-interaction');
    this.emitChange('interaction-resume', {
      source: 'interaction',
      trackOverride: false,
    });
    return true;
  }

  _maybePauseForCameraInteraction(detail = {}) {
    if (this.pauseOnInteraction() !== true) return false;
    if (!isManualCameraMove(detail)) return false;
    if (!this.isDynamic()) return false;
    this._recordManualInteractionActivity();
    const state = this.runState();
    if (state === 'stopped') return false;
    if (state === 'running') {
      this._pauseLayoutForCameraInteraction();
    }
    this._scheduleInteractionResume();
    return this._interactionPauseActive;
  }

  positionAttribute(value, options = {}) {
    if (arguments.length === 0) return this.state.positionAttribute;
    const next = typeof value === 'string' && value.trim() ? value.trim() : CURRENT_POSITION_ATTRIBUTE;
    this.state.positionAttribute = next;
    this.emitChange('position-attribute', {
      trackOverride: options.trackOverride !== false,
    });
    return this;
  }

  positionAttributeChoices() {
    return this.context?.helios?.getLayoutPositionAttributeChoices?.() ?? [
      { value: CURRENT_POSITION_ATTRIBUTE, label: 'Current positions', dimension: 3 },
      { value: RANDOM_LAYOUT_POSITION_CHOICE, label: 'Random positions', dimension: 3 },
    ];
  }

  applyPositionAttribute(value = this.state.positionAttribute, options = {}) {
    const helios = this.context?.helios ?? null;
    if (!helios?.setLayoutPositionsFromNodeAttribute) return false;
    const selected = typeof value === 'string' && value.trim() ? value.trim() : CURRENT_POSITION_ATTRIBUTE;
    this.state.positionAttribute = selected;
    const wrote = helios.setLayoutPositionsFromNodeAttribute(selected);
    if (!wrote) {
      if (options.silent !== true) this.emitChange('position-attribute-failed', { positionAttribute: selected });
      return false;
    }
    const layout = helios.layout?.() ?? null;
    layout?.seedFromNetworkPositions?.();
    if (this.isDynamic() && this.runState() !== 'stopped') {
      layout?.reheat?.(options.reason ?? 'behavior:layout-position-attribute');
      helios.startLayout?.();
    }
    if (options.silent !== true) this.emitChange('position-attribute-applied', { positionAttribute: selected });
    return true;
  }

  start() {
    if (!this.isDynamic()) return this;
    this.context?.helios?.startLayout?.();
    this.emitChange('start');
    return this;
  }

  stop(reason = 'behavior:layout') {
    this.context?.helios?.stopLayout?.(reason);
    this.emitChange('stop', { stopReason: reason });
    return this;
  }

  reheat(reason = 'behavior:layout') {
    const helios = this.context?.helios ?? null;
    const layout = helios?.layout?.() ?? null;
    layout?.reheat?.(reason);
    if (this.isDynamic() && this.runState() !== 'stopped') {
      helios?.startLayout?.();
    }
    this.emitChange('reheat', { reheatReason: reason });
    return this;
  }

  reset(options = {}) {
    const helios = this.context?.helios ?? null;
    const selected = options.positionAttribute ?? this.state.positionAttribute;
    const wrote = helios?.setLayoutPositionsFromNodeAttribute?.(selected);
    if (!wrote) {
      this.emitChange('reset-failed');
      return false;
    }
    this.state.positionAttribute = selected;
    const layout = helios?.layout?.() ?? null;
    layout?.seedFromNetworkPositions?.();
    if (options.reheat !== false) {
      layout?.reheat?.(options.reason ?? 'behavior:layout-reset');
    }
    if (options.start === true || (this.isDynamic() && this.runState() !== 'stopped')) {
      helios?.startLayout?.();
    }
    this.emitChange('reset');
    return true;
  }
}

export default LayoutBehavior;
