const DEFAULT_SUPERSAMPLING_FACTOR = 2;
const DEFAULT_SUPERSAMPLING_THRESHOLD = 2;
export const DEFAULT_GRAPHICS_POWER_PREFERENCE = 'high-performance';

function normalizePositiveNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

export function getWindowDevicePixelRatio() {
  if (typeof window === 'undefined') return 1;
  return normalizePositiveNumber(window.devicePixelRatio, 1);
}

export function normalizeSupersamplingOption(value, { forceSupersample = false } = {}) {
  if (value === 'auto' || value == null) {
    return forceSupersample ? true : 'auto';
  }
  if (value === 'off') return false;
  if (value === '2x') return 2;
  if (typeof value === 'boolean') return value;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return forceSupersample ? true : 'auto';
}

export function resolveSupersamplingPreset(value, { forceSupersample = false } = {}) {
  const normalized = normalizeSupersamplingOption(value, { forceSupersample });
  if (normalized === false) return 'off';
  if (normalized === 'auto') return 'auto';
  return '2x';
}

export function supersamplingPresetToOption(value, { forceSupersample = false } = {}) {
  const preset = resolveSupersamplingPreset(value, { forceSupersample });
  if (preset === 'off') return false;
  if (preset === '2x') return 2;
  return 'auto';
}

export function resolveSupersamplingMultiplier(baseDevicePixelRatio, options = {}) {
  const baseRatio = normalizePositiveNumber(baseDevicePixelRatio, 1);
  const mode = normalizeSupersamplingOption(options.supersampling, {
    forceSupersample: options.forceSupersample === true,
  });
  const autoFactor = normalizePositiveNumber(options.supersamplingAutoFactor, DEFAULT_SUPERSAMPLING_FACTOR);
  const autoThreshold = normalizePositiveNumber(options.supersamplingAutoThreshold, DEFAULT_SUPERSAMPLING_THRESHOLD);
  if (typeof mode === 'number') {
    return Math.max(1, mode);
  }
  if (mode === true) {
    return autoFactor;
  }
  if (mode === false) {
    return 1;
  }
  return baseRatio < autoThreshold ? autoFactor : 1;
}

export function resolveEffectiveDevicePixelRatio(baseDevicePixelRatio = getWindowDevicePixelRatio(), options = {}) {
  const baseRatio = normalizePositiveNumber(baseDevicePixelRatio, 1);
  const multiplier = resolveSupersamplingMultiplier(baseRatio, options);
  return Math.max(1, baseRatio * multiplier);
}

export function resolveWebGLAntialiasEnabled(options = {}) {
  return options.antialias !== false;
}

function objectOption(value) {
  return value && typeof value === 'object' ? value : {};
}

export function resolveGraphicsPowerPreference(options = {}) {
  return options.powerPreference ?? DEFAULT_GRAPHICS_POWER_PREFERENCE;
}

export function resolveWebGLContextAttributes(options = {}) {
  return {
    antialias: resolveWebGLAntialiasEnabled(options),
    premultipliedAlpha: true,
    powerPreference: resolveGraphicsPowerPreference(options),
    ...objectOption(options.webglContextAttributes),
  };
}

export function resolveWebGPUAdapterOptions(options = {}) {
  const adapterOptions = { ...objectOption(options.webgpuAdapterOptions) };
  if (Object.prototype.hasOwnProperty.call(options, 'powerPreference')
    && !Object.prototype.hasOwnProperty.call(adapterOptions, 'powerPreference')) {
    adapterOptions.powerPreference = options.powerPreference;
  }
  if (adapterOptions.powerPreference == null) {
    delete adapterOptions.powerPreference;
  }
  return adapterOptions;
}

export function resolveWebGPURequestAdapterArgument(options = {}) {
  const adapterOptions = resolveWebGPUAdapterOptions(options);
  return Object.keys(adapterOptions).length ? adapterOptions : undefined;
}

export function resolveWebGPUCanvasSampleCount(options = {}) {
  const antialias = options.antialias;
  if (antialias == null || antialias === false) return 1;
  if (antialias === true) return 4;
  const numeric = Number(antialias);
  if (!Number.isFinite(numeric) || numeric <= 1) return 1;
  return 4;
}
