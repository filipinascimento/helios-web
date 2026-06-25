import { Behavior } from './Behavior.js';

function normalizeMode(value, fallback = 'off') {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (raw === 'selected' || raw === 'selected-only' || raw === 'selected_only') return 'selected-only';
  if (raw === 'off' || raw === 'none' || raw === 'disabled' || raw === 'false') return 'off';
  return 'auto';
}

function normalizeConfigPatch(options = {}) {
  const next = {};
  if (!options || typeof options !== 'object') return next;
  if (Object.prototype.hasOwnProperty.call(options, 'enabled')) next.enabled = options.enabled === true;
  if (Object.prototype.hasOwnProperty.call(options, 'source')) {
    const value = options.source;
    next.source = typeof value === 'function'
      ? value
      : (value == null || String(value).trim() === '' ? null : String(value).trim());
  }
  if (Object.prototype.hasOwnProperty.call(options, 'selectionMode')) {
    next.selectionMode = normalizeMode(options.selectionMode, 'auto') === 'selected-only' ? 'selected-only' : 'ranked';
  }
  if (Object.prototype.hasOwnProperty.call(options, 'selectedOnlySpaceAware')) {
    next.selectedOnlySpaceAware = options.selectedOnlySpaceAware === true;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'fallbackSources') && Array.isArray(options.fallbackSources)) {
    next.fallbackSources = options.fallbackSources.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'pinnedNodes')) {
    next.pinnedNodes = Array.from(new Set(Array.from(options.pinnedNodes ?? [], (entry) => Number(entry))
      .filter((entry) => Number.isInteger(entry) && entry >= 0)));
  }
  const scalarKeys = [
    'maxVisible',
    'minScreenRadiusPx',
    'fontSizeScale',
    'outlineWidth',
    'offsetRadiusFactor',
    'offsetPx',
    'maxChars',
    'maxRows',
    'maxUpdateFps',
    'keepBoost',
    'selectedBoost',
    'hoveredBoost',
    'delegateSnapshotMaxFps',
    'collisionPaddingPx',
    'collisionCellPx',
  ];
  for (const key of scalarKeys) {
    if (Object.prototype.hasOwnProperty.call(options, key)) next[key] = options[key];
  }
  const stringKeys = ['fill', 'outlineColor', 'fontFamily'];
  for (const key of stringKeys) {
    if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
    const value = options[key];
    next[key] = typeof value === 'string' ? value.trim() : value;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'illustratorCompatible')) {
    next.illustratorCompatible = options.illustratorCompatible === true;
  }
  return next;
}

function detailTargetsPath(detail = {}, path = '') {
  const keys = [];
  if (typeof detail.storageKey === 'string') keys.push(detail.storageKey);
  if (typeof detail.stateKey === 'string') keys.push(detail.stateKey);
  if (Array.isArray(detail.storageKeys)) {
    for (const key of detail.storageKeys) if (typeof key === 'string') keys.push(key);
  }
  if (Array.isArray(detail.stateKeys)) {
    for (const key of detail.stateKeys) if (typeof key === 'string') keys.push(key);
  }
  if (!keys.length) return false;
  return keys.some((key) => key === path || key.startsWith(`${path}.`) || path.startsWith(`${key}.`));
}

function createEntrySubscribe(behavior, path) {
  return (notify) => {
    if (typeof notify !== 'function') return () => {};
    return behavior.on('change', (event) => {
      const detail = event?.detail ?? event ?? {};
      if (!detailTargetsPath(detail, path)) return;
      notify(undefined, detail);
    });
  };
}

/**
 * Built-in behavior for SVG label overlays.
 *
 * @public
 * @param {object} [options] - Label options including `enabled`, `source`,
 * `selectionMode`, `maxVisible`, collision settings, font settings, and export
 * compatibility flags.
 * @returns {LabelsBehavior} Behavior controlling the live label overlay.
 * @remarks Labels can be driven by a node attribute, callback, selection state,
 * hover state, and screen-space collision/ranking limits.
 * @example
 * helios.behavior.labels.update({
 *   enabled: true,
 *   source: 'label',
 *   selectionMode: 'ranked',
 *   maxVisible: 80,
 * });
 */
export class LabelsBehavior extends Behavior {
  static id = 'labels';

  constructor(options = {}) {
    super(options);
    this.state = {
      enabled: false,
      ...normalizeConfigPatch(options),
    };
    this._hoverPolicy = {
      enabled: false,
      source: null,
    };
  }

  attach(context) {
    super.attach(context);
    const current = this.context?.helios?._getLabelsControllerConfig?.() ?? { enabled: false };
    this.state = { ...current, ...this.state };
    this.applyConfig({ silent: true, reason: 'attach' });
    this.addCleanup(this.context.subscribe(this.context?.helios, 'network:replaced', () => {
      this.applyConfig({ silent: true, reason: 'network-replaced' });
      this.emitChange('network-replaced');
    }));
    return this;
  }

  update(options = {}, changeOptions = {}) {
    super.update(options);
    const patch = normalizeConfigPatch(options);
    if (Object.keys(patch).length === 0) return this;
    this.state = { ...this.state, ...patch };
    this.applyConfig({ silent: true, reason: 'options' });
    const storageKeys = new Set(Object.keys(patch).map((key) => `labels.${key}`));
    if (Object.prototype.hasOwnProperty.call(patch, 'enabled') || Object.prototype.hasOwnProperty.call(patch, 'selectionMode')) {
      storageKeys.add('labels.enabled');
      storageKeys.add('labels.mode');
    }
    this.emitChange('options', {
      trackOverride: changeOptions.trackOverride !== false,
      storageKeys: Array.from(storageKeys),
    });
    return this;
  }

  serialize() {
    return {
      options: { ...this.state },
    };
  }

  stateEntries() {
    const subscribe = (key) => createEntrySubscribe(this, `labels.${key}`);
    return {
      state: {
        description: 'Serializable label behavior state.',
        default: this.serialize(),
        type: 'object',
        scope: 'workspace',
        aliases: ['labels.state'],
        getter: () => this.serialize(),
        setter: (value) => this.restore(value),
        subscribe: () => () => {},
      },
      enabled: {
        description: 'Whether labels are visible.',
        default: this.state.enabled === true,
        type: 'boolean',
        scope: 'workspace',
        aliases: ['labels.enabled'],
        ui: { label: 'Visible', controller: 'toggle' },
        getter: () => this.state.enabled === true,
        setter: (value) => this.enabled(value === true, { trackOverride: false }),
        subscribe: subscribe('enabled'),
      },
      mode: {
        description: 'Label selection mode.',
        default: this.mode(),
        type: 'string',
        scope: 'workspace',
        aliases: ['labels.mode'],
        ui: {
          label: 'Mode',
          controller: 'select',
          options: ['off', 'auto', 'selected-only'],
        },
        getter: () => this.mode(),
        setter: (value) => this.mode(value, { trackOverride: false }),
        subscribe: subscribe('mode'),
      },
      source: {
        description: 'Node attribute or source used for labels.',
        default: this.state.source ?? null,
        type: 'string',
        scope: 'workspace',
        aliases: ['labels.source'],
        ui: { label: 'Source', controller: 'text' },
        getter: () => this.source(),
        setter: (value) => this.source(value),
        subscribe: subscribe('source'),
      },
      maxVisible: {
        description: 'Maximum visible labels.',
        default: this.maxVisible(),
        type: 'number',
        scope: 'workspace',
        aliases: ['labels.maxVisible'],
        ui: { label: 'Max Visible', controller: 'slider', min: 0, max: 1000, step: 1 },
        getter: () => this.maxVisible(),
        setter: (value) => this.maxVisible(value),
        subscribe: subscribe('maxVisible'),
      },
      selectedOnlySpaceAware: {
        description: 'Whether selected-only labels use regular collision and space-aware placement.',
        default: this.selectedOnlySpaceAware(),
        type: 'boolean',
        scope: 'workspace',
        aliases: ['labels.selectedOnlySpaceAware'],
        ui: { label: 'Use Available Space', controller: 'toggle' },
        getter: () => this.selectedOnlySpaceAware(),
        setter: (value) => this.selectedOnlySpaceAware(value === true),
        subscribe: subscribe('selectedOnlySpaceAware'),
      },
      fontSizeScale: {
        description: 'Label font-size scale.',
        default: this.fontSizeScale(),
        type: 'number',
        scope: 'workspace',
        aliases: ['labels.fontSizeScale'],
        ui: { label: 'Font Size Scale', controller: 'slider', min: 0.25, max: 4, step: 0.05 },
        getter: () => this.fontSizeScale(),
        setter: (value) => this.fontSizeScale(value),
        subscribe: subscribe('fontSizeScale'),
      },
      minScreenRadiusPx: {
        description: 'Minimum node screen radius for labels.',
        default: this.minScreenRadius(),
        type: 'number',
        scope: 'workspace',
        aliases: ['labels.minScreenRadius'],
        ui: { label: 'Min Screen Radius', controller: 'slider', min: 0, max: 64, step: 0.5 },
        getter: () => this.minScreenRadius(),
        setter: (value) => this.minScreenRadius(value),
        subscribe: subscribe('minScreenRadiusPx'),
      },
      outlineWidth: {
        description: 'Label outline width in pixels.',
        default: this.outlineWidth(),
        type: 'number',
        scope: 'workspace',
        aliases: ['labels.outlineWidth'],
        ui: { label: 'Outline Width', controller: 'slider', min: 0, max: 12, step: 0.25 },
        getter: () => this.outlineWidth(),
        setter: (value) => this.outlineWidth(value),
        subscribe: subscribe('outlineWidth'),
      },
      offsetRadiusFactor: {
        description: 'Label radial offset factor.',
        default: this.offsetRadiusFactor(),
        type: 'number',
        scope: 'workspace',
        aliases: ['labels.offsetRadiusFactor'],
        ui: { label: 'Offset Radius Factor', controller: 'slider', min: -4, max: 8, step: 0.05 },
        getter: () => this.offsetRadiusFactor(),
        setter: (value) => this.offsetRadiusFactor(value),
        subscribe: subscribe('offsetRadiusFactor'),
      },
      offsetPx: {
        description: 'Label pixel offset.',
        default: this.offsetPx(),
        type: 'number',
        scope: 'workspace',
        aliases: ['labels.offsetPx'],
        ui: { label: 'Offset', controller: 'slider', min: -64, max: 64, step: 0.5 },
        getter: () => this.offsetPx(),
        setter: (value) => this.offsetPx(value),
        subscribe: subscribe('offsetPx'),
      },
      maxChars: {
        description: 'Maximum characters per label row.',
        default: this.maxChars(),
        type: 'number',
        scope: 'workspace',
        aliases: ['labels.maxChars'],
        ui: { label: 'Max Chars', controller: 'slider', min: 0, max: 256, step: 1 },
        getter: () => this.maxChars(),
        setter: (value) => this.maxChars(value),
        subscribe: subscribe('maxChars'),
      },
      maxRows: {
        description: 'Maximum label rows.',
        default: this.maxRows(),
        type: 'number',
        scope: 'workspace',
        aliases: ['labels.maxRows'],
        ui: { label: 'Max Rows', controller: 'slider', min: 1, max: 8, step: 1 },
        getter: () => this.maxRows(),
        setter: (value) => this.maxRows(value),
        subscribe: subscribe('maxRows'),
      },
      fill: {
        description: 'Label fill color.',
        default: this.fill(),
        type: 'string',
        scope: 'workspace',
        aliases: ['labels.fill'],
        ui: { label: 'Fill', controller: 'color' },
        getter: () => this.fill(),
        setter: (value) => this.fill(value),
        subscribe: subscribe('fill'),
      },
      outlineColor: {
        description: 'Label outline color.',
        default: this.outlineColor(),
        type: 'string',
        scope: 'workspace',
        aliases: ['labels.outlineColor'],
        ui: { label: 'Outline', controller: 'color' },
        getter: () => this.outlineColor(),
        setter: (value) => this.outlineColor(value),
        subscribe: subscribe('outlineColor'),
      },
      fontFamily: {
        description: 'Label font family.',
        default: this.fontFamily(),
        type: 'string',
        scope: 'workspace',
        aliases: ['labels.fontFamily'],
        ui: { label: 'Font Family', controller: 'text' },
        getter: () => this.fontFamily(),
        setter: (value) => this.fontFamily(value),
        subscribe: subscribe('fontFamily'),
      },
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    this.update(options, { trackOverride: false });
    this.emitChange('restore', { trackOverride: false });
    return this;
  }

  getPublicState() {
    return {
      ...this.state,
      pinnedNodes: Array.from(this.state.pinnedNodes ?? []),
      hoveredNodeEnabled: this._hoverPolicy.enabled,
      hoveredNodeSource: this._hoverPolicy.enabled ? this._hoverPolicy.source : null,
    };
  }

  emitChange(reason, detail = {}) {
    this.emit('change', { reason, state: this.getPublicState(), ...detail });
  }

  labels(options) {
    if (arguments.length === 0) return this.getPublicState();
    if (options == null) {
      this.state = { ...this.state, enabled: false };
      this.clearHoverPolicy({ silent: true });
      this.applyConfig({ silent: true, reason: 'disable' });
      this.emitChange('disable');
      return this;
    }
    if (options && typeof options === 'object' && options.enabled === true
      && !Object.prototype.hasOwnProperty.call(options, 'selectionMode')) {
      return this.update({ selectionMode: 'ranked', ...options });
    }
    return this.update(options);
  }

  enabled(value, options = {}) {
    if (arguments.length === 0) return this.mode() !== 'off';
    return this.mode(value === true ? 'auto' : 'off', options);
  }

  mode(value, options = {}) {
    if (arguments.length === 0) {
      if (this.state.enabled !== true) return 'off';
      return this.state.selectionMode === 'selected-only' ? 'selected-only' : 'auto';
    }
    const next = normalizeMode(value, this.mode());
    if (next === 'off') return this.update({ enabled: false }, options);
    return this.update({
      enabled: true,
      selectionMode: next === 'selected-only' ? 'selected-only' : 'ranked',
    }, options);
  }

  selectedOnlySpaceAware(value) {
    if (arguments.length === 0) return this.state.selectedOnlySpaceAware === true;
    return this.update({ selectedOnlySpaceAware: value === true });
  }

  maxVisible(value) {
    if (arguments.length === 0) return Number(this.state.maxVisible ?? 0);
    return this.update({ maxVisible: Math.max(0, Math.floor(Number(value) || 0)) });
  }

  fontSizeScale(value) {
    if (arguments.length === 0) return Number(this.state.fontSizeScale ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.update({ fontSizeScale: Math.max(0.25, numeric) });
  }

  minScreenRadius(value) {
    if (arguments.length === 0) return Number(this.state.minScreenRadiusPx ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.update({ minScreenRadiusPx: Math.max(0, numeric) });
  }

  outlineWidth(value) {
    if (arguments.length === 0) return Number(this.state.outlineWidth ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.update({ outlineWidth: Math.max(0, numeric) });
  }

  offsetRadiusFactor(value) {
    if (arguments.length === 0) return Number(this.state.offsetRadiusFactor ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.update({ offsetRadiusFactor: numeric });
  }

  offsetPx(value) {
    if (arguments.length === 0) return Number(this.state.offsetPx ?? 4);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.update({ offsetPx: numeric });
  }

  maxChars(value) {
    if (arguments.length === 0) return Number(this.state.maxChars ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.update({ maxChars: Math.max(0, Math.floor(numeric)) });
  }

  maxRows(value) {
    if (arguments.length === 0) return Number(this.state.maxRows ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.update({ maxRows: Math.max(1, Math.floor(numeric)) });
  }

  fill(value) {
    if (arguments.length === 0) return this.state.fill ?? null;
    return this.update({ fill: value });
  }

  outlineColor(value) {
    if (arguments.length === 0) return this.state.outlineColor ?? null;
    return this.update({ outlineColor: value });
  }

  fontFamily(value) {
    if (arguments.length === 0) return this.state.fontFamily ?? '';
    return this.update({ fontFamily: String(value ?? '').trim() });
  }

  source(value) {
    if (arguments.length === 0) return this.state.source ?? null;
    if (typeof value === 'function') return this.update({ source: value });
    const next = value == null ? null : String(value).trim();
    return this.update({ source: next || null });
  }

  applySelectionDefaults() {
    if (this.options.enableSelectionLabels === false) return this;
    const nextMode = this.state.enabled === true && this.state.selectionMode === 'ranked'
      ? 'auto'
      : 'selected-only';
    return this.mode(nextMode, { trackOverride: false });
  }

  setHoverPolicy({ enabled = false, source = null } = {}) {
    this._hoverPolicy = {
      enabled: enabled === true,
      source: enabled === true ? (source ?? null) : null,
    };
    this.applyConfig({ silent: true, reason: 'hover-policy' });
    this.emitChange('hover-policy');
    return this;
  }

  clearHoverPolicy(options = {}) {
    this._hoverPolicy = { enabled: false, source: null };
    this.applyConfig({ silent: true, reason: 'hover-policy-clear' });
    if (options.silent !== true) this.emitChange('hover-policy-clear');
    return this;
  }

  applyConfig({ silent = false } = {}) {
    const helios = this.context?.helios ?? null;
    helios?._applyLabelsControllerConfig?.({
      ...this.state,
      hoveredNodeEnabled: this._hoverPolicy.enabled,
      hoveredNodeSource: this._hoverPolicy.enabled ? this._hoverPolicy.source : null,
    }, { silent });
    return this;
  }
}

export default LabelsBehavior;
