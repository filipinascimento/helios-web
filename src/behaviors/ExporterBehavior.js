import { Behavior } from './Behavior.js';
import {
  buildFigureExportPresetList,
  normalizeFigureExportFormat,
  resolveFigureExportAlphaMode,
  resolveFigureExportOptions,
  resolveFigureExportSupersampling,
  resolveFigureLegendScale,
  resolveFigureTransparentBackground,
  sanitizeFigureExportBaseName,
} from '../export/figureExport.js';

const STABLE_CONFIG_KEYS = Object.freeze([
  'baseName',
  'format',
  'preset',
  'width',
  'height',
  'supersampling',
  'includeLabels',
  'includeLegends',
  'includeInterface',
  'legendScale',
  'transparentBackground',
  'alphaMode',
]);

function clampPositiveInt(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(1, Math.round(numeric));
}

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (ArrayBuffer.isView(value)) return Array.from(value, (entry) => cloneSerializable(entry));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function') continue;
    next[key] = cloneSerializable(entry);
  }
  return next;
}

function normalizePreset(value, fallback = null) {
  if (value == null || value === '') return fallback;
  return String(value).trim().toLowerCase() || fallback;
}

function normalizeConfigPatch(options = {}) {
  const next = {};
  if (!options || typeof options !== 'object') return next;

  if (Object.prototype.hasOwnProperty.call(options, 'baseName')) {
    next.baseName = sanitizeFigureExportBaseName(options.baseName, 'figure');
  } else if (Object.prototype.hasOwnProperty.call(options, 'name')) {
    next.baseName = sanitizeFigureExportBaseName(options.name, 'figure');
  } else if (Object.prototype.hasOwnProperty.call(options, 'filename')) {
    next.baseName = sanitizeFigureExportBaseName(String(options.filename).replace(/\.[^.]+$/u, ''), 'figure');
  }

  if (Object.prototype.hasOwnProperty.call(options, 'format')) {
    next.format = normalizeFigureExportFormat(options.format, 'png');
  }
  if (Object.prototype.hasOwnProperty.call(options, 'preset')) {
    next.preset = normalizePreset(options.preset, null);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'width')) {
    next.width = clampPositiveInt(options.width, null);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'height')) {
    next.height = clampPositiveInt(options.height, null);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'customSize') && options.customSize && typeof options.customSize === 'object') {
    if (Object.prototype.hasOwnProperty.call(options.customSize, 'width')) {
      next.width = clampPositiveInt(options.customSize.width, null);
    }
    if (Object.prototype.hasOwnProperty.call(options.customSize, 'height')) {
      next.height = clampPositiveInt(options.customSize.height, null);
    }
  }
  if (Object.prototype.hasOwnProperty.call(options, 'supersampling')) {
    next.supersampling = resolveFigureExportSupersampling(options.supersampling, 1);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'includeLabels')) {
    next.includeLabels = options.includeLabels === true;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'includeLegends')) {
    next.includeLegends = options.includeLegends !== false;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'includeInterface')) {
    next.includeInterface = options.includeInterface === true;
  }
  if (Object.prototype.hasOwnProperty.call(options, 'legendScale')) {
    next.legendScale = resolveFigureLegendScale(options.legendScale, 1);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'transparentBackground')) {
    next.transparentBackground = resolveFigureTransparentBackground(options.transparentBackground, false);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'alphaMode')) {
    next.alphaMode = resolveFigureExportAlphaMode(options.alphaMode, 'straight');
  }
  if (Object.prototype.hasOwnProperty.call(options, 'showFrame')) {
    next.showFrame = options.showFrame === true;
  }

  return next;
}

function pickStableConfig(config = {}) {
  const next = {};
  for (const key of STABLE_CONFIG_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(config, key)) continue;
    next[key] = cloneSerializable(config[key]);
  }
  return next;
}

function summarizeBehaviorState(behavior, fallbackEnabled = null) {
  const state = behavior?.getPublicState?.() ?? behavior?.state ?? null;
  if (!state || typeof state !== 'object') return { attached: false, enabled: fallbackEnabled };
  const enabled = Object.prototype.hasOwnProperty.call(state, 'enabled')
    ? state.enabled === true
    : fallbackEnabled;
  return { attached: true, enabled };
}

function summarizeViewState(helios) {
  const camera = helios?.renderer?.camera ?? null;
  return {
    width: Number(helios?.layers?.size?.width ?? helios?.size?.width ?? 1),
    height: Number(helios?.layers?.size?.height ?? helios?.size?.height ?? 1),
    mode: camera?.mode ?? null,
    projection: camera?.projection ?? null,
  };
}

/**
 * Built-in behavior for figure export settings and preview capture.
 *
 * @public
 * @param {object} [options] - Figure filename, format, preset, custom
 * dimensions, supersampling, label/legend/interface inclusion, transparency,
 * and frame-preview options.
 * @returns {ExporterBehavior} Behavior that stores export settings and calls
 * `helios.exportFigureBlob`, `helios.exportFigurePreviewBlob`, or
 * `helios.exportFigure`.
 * @remarks The actual capture capability depends on the active renderer and
 * should be checked through `capabilities()` after the renderer is ready.
 */
export class ExporterBehavior extends Behavior {
  static id = 'exporter';

  constructor(options = {}) {
    super(options);
    this.config = {
      baseName: 'figure',
      format: 'png',
      preset: null,
      width: null,
      height: null,
      supersampling: 1,
      includeLabels: false,
      includeLegends: true,
      includeInterface: false,
      legendScale: 1,
      transparentBackground: false,
      alphaMode: 'straight',
      showFrame: false,
      ...normalizeConfigPatch(options),
    };
    this.state = this._computeState();
  }

  attach(context) {
    super.attach(context);
    for (const id of ['appearance', 'labels', 'legends', 'filters', 'layout']) {
      const dependency = this.context?.getBehavior(id);
      if (!dependency?.on) continue;
      this.addCleanup(dependency.on('change', () => {
        this.emitChange(`${id}-behavior`);
      }));
    }
    this.addCleanup(this.context.subscribe(this.context?.helios, 'network:replaced', () => {
      this.emitChange('network-replaced');
    }));
    this.addCleanup(this.context.subscribe(this.context?.helios, 'renderer:changed', () => {
      this.emitChange('renderer-changed');
    }));
    this.state = this._computeState();
    this.emitChange('attach');
    return this;
  }

  update(options = {}) {
    super.update(options);
    const patch = normalizeConfigPatch(options);
    if (Object.keys(patch).length === 0) return this;
    this.config = {
      ...this.config,
      ...patch,
    };
    this.state = this._computeState();
    this.emitChange('options');
    return this;
  }

  serialize() {
    return {
      options: pickStableConfig(this.config),
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    this.update(options);
    this.emitChange('restore');
    return this;
  }

  getPublicState() {
    this.state = this._computeState();
    return cloneSerializable(this.state);
  }

  emitChange(reason, detail = {}) {
    this.state = this._computeState();
    this.emit('change', { reason, state: cloneSerializable(this.state), ...detail });
  }

  exporter(options) {
    if (arguments.length === 0) return this.getPublicState();
    return this.update(options);
  }

  baseName(value) {
    if (arguments.length === 0) return this.config.baseName;
    return this.update({ baseName: value });
  }

  format(value) {
    if (arguments.length === 0) return this.config.format;
    return this.update({ format: value });
  }

  preset(value) {
    if (arguments.length === 0) return this.config.preset;
    return this.update({ preset: value });
  }

  customSize(value) {
    if (arguments.length === 0) {
      return {
        width: this.config.width,
        height: this.config.height,
      };
    }
    return this.update({ customSize: value });
  }

  supersampling(value) {
    if (arguments.length === 0) return this.config.supersampling;
    return this.update({ supersampling: value });
  }

  includeLabels(value) {
    if (arguments.length === 0) return this.config.includeLabels === true;
    return this.update({ includeLabels: value === true });
  }

  includeLegends(value) {
    if (arguments.length === 0) return this.config.includeLegends !== false;
    return this.update({ includeLegends: value !== false });
  }

  includeInterface(value) {
    if (arguments.length === 0) return this.config.includeInterface === true;
    return this.update({ includeInterface: value === true });
  }

  legendScale(value) {
    if (arguments.length === 0) return this.config.legendScale;
    return this.update({ legendScale: value });
  }

  transparentBackground(value) {
    if (arguments.length === 0) return this.config.transparentBackground === true;
    return this.update({ transparentBackground: value === true });
  }

  alphaMode(value) {
    if (arguments.length === 0) return this.config.alphaMode;
    return this.update({ alphaMode: value });
  }

  showFrame(value) {
    if (arguments.length === 0) return this.config.showFrame === true;
    return this.update({ showFrame: value === true });
  }

  getCapabilities(options = {}) {
    const helios = this.context?.helios ?? null;
    const supersampling = Object.prototype.hasOwnProperty.call(options, 'supersampling')
      ? resolveFigureExportSupersampling(options.supersampling, this.config.supersampling)
      : this.config.supersampling;
    return helios?.getFigureExportCapabilities?.({ supersampling }) ?? {
      supersampling,
      maxBitmapDimension: 8192,
      windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
      defaultPreset: 'window',
      presets: buildFigureExportPresetList(
        helios?.layers?.size ?? helios?.size ?? { width: 1, height: 1 },
        { maxBitmapDimension: 8192, windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1 },
        supersampling,
      ),
    };
  }

  getResolvedOptions(overrides = {}) {
    const helios = this.context?.helios ?? null;
    const patch = normalizeConfigPatch(overrides);
    const nextConfig = {
      ...this.config,
      ...patch,
    };
    const request = {
      baseName: nextConfig.baseName,
      filename: nextConfig.baseName,
      format: nextConfig.format,
      preset: nextConfig.preset,
      width: nextConfig.width,
      height: nextConfig.height,
      supersampling: nextConfig.supersampling,
      includeLabels: nextConfig.includeLabels,
      includeLegends: nextConfig.includeLegends,
      includeInterface: nextConfig.includeInterface,
      legendScale: nextConfig.legendScale,
      transparentBackground: nextConfig.transparentBackground,
      alphaMode: nextConfig.alphaMode,
    };
    if (typeof helios?._resolveFigureExportOptions === 'function') {
      return helios._resolveFigureExportOptions(request);
    }
    return resolveFigureExportOptions(request, {
      renderer: helios?.renderer,
      capability: this.getCapabilities({ supersampling: request.supersampling }),
      windowSize: helios?.layers?.size ?? helios?.size ?? { width: 1, height: 1 },
      windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
    });
  }

  async exportBlob(options = {}) {
    const helios = this.context?.helios ?? null;
    if (typeof helios?.exportFigureBlob !== 'function') {
      throw new Error('ExporterBehavior requires helios.exportFigureBlob(...)');
    }
    const resolved = this.getResolvedOptions(options);
    return await helios.exportFigureBlob(resolved);
  }

  async exportPreviewBlob(options = {}, previewOptions = {}) {
    const helios = this.context?.helios ?? null;
    if (typeof helios?.exportFigurePreviewBlob !== 'function') {
      throw new Error('ExporterBehavior requires helios.exportFigurePreviewBlob(...)');
    }
    const resolved = this.getResolvedOptions(options);
    return await helios.exportFigurePreviewBlob(resolved, previewOptions);
  }

  async export(options = {}) {
    const helios = this.context?.helios ?? null;
    if (typeof helios?.exportFigure !== 'function') {
      throw new Error('ExporterBehavior requires helios.exportFigure(...)');
    }
    const resolved = this.getResolvedOptions(options);
    return await helios.exportFigure(resolved);
  }

  _computeState() {
    const helios = this.context?.helios ?? null;
    const capability = this.getCapabilities();
    const resolved = this.getResolvedOptions();
    const labels = summarizeBehaviorState(this.context?.getBehavior('labels'), false);
    const legends = summarizeBehaviorState(this.context?.getBehavior('legends'), true);
    const filters = summarizeBehaviorState(this.context?.getBehavior('filters'), false);
    const layoutBehavior = this.context?.getBehavior('layout');
    return {
      ...cloneSerializable(this.config),
      filename: resolved.filename,
      fitsCapability: resolved.fitsCapability === true,
      resolved: cloneSerializable(resolved),
      capability: cloneSerializable(capability),
      dependencies: {
        labels,
        legends,
        filters,
        layout: {
          attached: Boolean(layoutBehavior),
          running: layoutBehavior?.state?.running === true,
        },
      },
      view: summarizeViewState(helios),
    };
  }
}

export default ExporterBehavior;
