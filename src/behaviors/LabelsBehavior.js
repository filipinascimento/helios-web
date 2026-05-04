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

  update(options = {}) {
    super.update(options);
    const patch = normalizeConfigPatch(options);
    if (Object.keys(patch).length === 0) return this;
    this.state = { ...this.state, ...patch };
    this.applyConfig({ silent: true, reason: 'options' });
    this.emitChange('options');
    return this;
  }

  serialize() {
    return {
      options: { ...this.state },
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    this.update(options);
    this.emitChange('restore');
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

  enabled(value) {
    if (arguments.length === 0) return this.mode() !== 'off';
    return this.mode(value === true ? 'auto' : 'off');
  }

  mode(value) {
    if (arguments.length === 0) {
      if (this.state.enabled !== true) return 'off';
      return this.state.selectionMode === 'selected-only' ? 'selected-only' : 'auto';
    }
    const next = normalizeMode(value, this.mode());
    if (next === 'off') return this.update({ enabled: false });
    return this.update({
      enabled: true,
      selectionMode: next === 'selected-only' ? 'selected-only' : 'ranked',
    });
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
    return this.mode(nextMode);
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
