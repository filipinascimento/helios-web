import { Behavior } from './Behavior.js';
import { StaticLayout, WorkerLayout } from '../layouts/Layout.js';
import { D3Force3DLayout } from '../layouts/d3force3dLayoutWorker.js';
import { GpuForceLayout } from '../layouts/GpuForceLayout.js';

const CURRENT_POSITION_ATTRIBUTE = '_helios_visuals_position';
const RANDOM_LAYOUT_POSITION_CHOICE = '$random';

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
    };
    this.update(options);
  }

  attach(context) {
    super.attach(context);
    const helios = this.context?.helios ?? null;
    this.addCleanup(this.context.subscribe(helios, 'layout:changed', () => this.emitChange('layout-changed')));
    this.addCleanup(this.context.subscribe(helios, 'layout:start', () => this.emitChange('layout-start')));
    this.addCleanup(this.context.subscribe(helios, 'layout:stop', () => this.emitChange('layout-stop')));
    this.addCleanup(this.context.subscribe(helios, 'network:replaced', () => this.emitChange('network-replaced')));
    this.emitChange('attach');
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
        positionAttribute: this.state.positionAttribute,
        layoutType: this.type(),
        parameters: snapshotLayoutBindingValues(layout),
        running: this.runState() !== 'stopped',
      },
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    if (options.positionAttribute != null) {
      this.positionAttribute(options.positionAttribute);
    }
    if (options.layoutType) {
      this.type(options.layoutType, { preserveRunState: false, emitChange: false });
    }
    if (options.parameters && typeof options.parameters === 'object') {
      this.parameters(options.parameters, { silent: true });
    }
    if (options.running === true && this.isDynamic()) {
      this.reheat('restore');
      this.start();
    } else if (options.running === false || !this.isDynamic()) {
      this.stop('restore');
    }
    this.emitChange('restore');
    return this;
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
    if (this.type() === 'static') {
      helios.stopLayout?.(options.reason ?? 'behavior:layout-type');
    } else if (options.preserveRunState !== false && previousRunState !== 'stopped') {
      nextLayout?.reheat?.(options.reason ?? 'behavior:layout-type');
      helios.startLayout?.();
    }
    if (options.emitChange !== false) this.emitChange('type');
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
    if (options.silent !== true) this.emitChange('parameter', { key, value });
    return this;
  }

  parameters(patch = {}, options = {}) {
    if (arguments.length === 0) return snapshotLayoutBindingValues(this.context?.helios?.layout?.() ?? null);
    for (const [key, value] of Object.entries(patch ?? {})) {
      this.parameter(key, value, { silent: true });
    }
    if (options.silent !== true) this.emitChange('parameters');
    return this;
  }

  positionAttribute(value) {
    if (arguments.length === 0) return this.state.positionAttribute;
    const next = typeof value === 'string' && value.trim() ? value.trim() : CURRENT_POSITION_ATTRIBUTE;
    this.state.positionAttribute = next;
    this.emitChange('position-attribute');
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
