export const FIGURE_EXPORT_PRESETS = Object.freeze([
  { id: 'window', label: 'Window' },
  { id: 'window@x2', label: 'Window @2x' },
  { id: 'window@x4', label: 'Window @4x' },
  { id: '1080p', label: '1080p' },
  { id: '4k', label: '4K' },
  { id: '8k', label: '8K' },
  { id: 'custom', label: 'Custom' },
]);

const PRESET_DIMENSIONS = Object.freeze({
  '1080p': Object.freeze({ width: 1920, height: 1080 }),
  '4k': Object.freeze({ width: 3840, height: 2160 }),
  '8k': Object.freeze({ width: 7680, height: 4320 }),
});

function approximatelyEqual(a, b, epsilon = 1e-6) {
  return Math.abs(Number(a) - Number(b)) <= epsilon;
}

function normalizePositiveNumber(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return numeric;
}

function formatWindowScale(value) {
  const numeric = normalizePositiveNumber(value, 1);
  if (approximatelyEqual(numeric, Math.round(numeric))) return String(Math.round(numeric));
  return numeric.toFixed(2).replace(/\.?0+$/u, '');
}

function resolveWindowPresetScale(preset) {
  const safePreset = String(preset ?? '').trim().toLowerCase();
  if (safePreset === 'window') return 1;
  const fixedMatch = safePreset.match(/^window@x(\d+(?:\.\d+)?)$/u);
  if (fixedMatch) return normalizePositiveNumber(fixedMatch[1], 1);
  const match = safePreset.match(/^window@(\d+(?:\.\d+)?)x$/u);
  if (!match) return null;
  return normalizePositiveNumber(match[1], 1);
}

export function getDefaultFigureExportPreset(windowDevicePixelRatio = 1) {
  const dpr = normalizePositiveNumber(windowDevicePixelRatio, 1);
  if (approximatelyEqual(dpr, 1)) return 'window';
  if (approximatelyEqual(dpr, 2)) return 'window@x2';
  if (approximatelyEqual(dpr, 4)) return 'window@x4';
  return `window@${formatWindowScale(dpr)}x`;
}

export function resolveFigurePreviewRect(outputWidth, outputHeight, windowSize = {}) {
  const windowWidth = clampInt(windowSize.width, 1, 1);
  const windowHeight = clampInt(windowSize.height, 1, 1);
  const targetAspect = Math.max(1e-6, Number(outputWidth) / Math.max(1, Number(outputHeight)));
  const windowAspect = windowWidth / Math.max(1, windowHeight);
  if (approximatelyEqual(windowAspect, targetAspect)) {
    return { x: 0, y: 0, width: windowWidth, height: windowHeight };
  }
  if (targetAspect > windowAspect) {
    const width = windowWidth;
    const height = width / targetAspect;
    return {
      x: 0,
      y: (windowHeight - height) * 0.5,
      width,
      height,
    };
  }
  const height = windowHeight;
  const width = height * targetAspect;
  return {
    x: (windowWidth - width) * 0.5,
    y: 0,
    width,
    height,
  };
}

function clampInt(value, min, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.round(numeric));
}

export function sanitizeFigureExportBaseName(value, fallback = 'figure') {
  const raw = String(value ?? '').trim().replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_');
  return raw || fallback;
}

export function normalizeFigureExportFormat(value, fallback = 'png') {
  const format = String(value ?? fallback).trim().toLowerCase();
  return format === 'svg' ? 'svg' : 'png';
}

export function normalizeFigureExportFilename(filename, format = 'png', fallbackBase = 'figure') {
  const normalizedFormat = normalizeFigureExportFormat(format, 'png');
  const raw = String(filename ?? '').trim();
  const base = sanitizeFigureExportBaseName(raw.replace(/\.[^.]+$/u, ''), fallbackBase);
  return `${base}.${normalizedFormat}`;
}

export function resolveFigureExportPresetDimensions(preset, windowSize = {}) {
  const safePreset = String(preset ?? 'window').trim().toLowerCase();
  const windowWidth = clampInt(windowSize.width, 1, 1);
  const windowHeight = clampInt(windowSize.height, 1, 1);
  if (safePreset === 'window') return { width: windowWidth, height: windowHeight, preset: 'window' };
  if (safePreset === 'window@x2') return { width: windowWidth * 2, height: windowHeight * 2, preset: 'window@x2' };
  if (safePreset === 'window@x4') return { width: windowWidth * 4, height: windowHeight * 4, preset: 'window@x4' };
  const dynamicWindowMatch = safePreset.match(/^window@(\d+(?:\.\d+)?)x$/u);
  if (dynamicWindowMatch) {
    const factor = normalizePositiveNumber(dynamicWindowMatch[1], 1);
    return {
      width: Math.max(1, Math.round(windowWidth * factor)),
      height: Math.max(1, Math.round(windowHeight * factor)),
      preset: `window@${formatWindowScale(factor)}x`,
    };
  }
  if (PRESET_DIMENSIONS[safePreset]) return { ...PRESET_DIMENSIONS[safePreset], preset: safePreset };
  return null;
}

export function resolveFigureExportSupersampling(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  if (numeric <= 1) return 1;
  if (numeric <= 2) return 2;
  if (numeric <= 4) return 4;
  return Math.max(1, Math.round(numeric));
}

export function resolveFigureLegendScale(value, fallback = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.max(0.25, Math.min(8, numeric));
}

export function resolveFigureRelativeOverlayScale(exportSize = {}, viewSize = {}, fallback = 1) {
  const exportWidth = normalizePositiveNumber(exportSize.width ?? exportSize.logicalWidth, NaN);
  const exportHeight = normalizePositiveNumber(exportSize.height ?? exportSize.logicalHeight, NaN);
  const viewWidth = normalizePositiveNumber(viewSize.width, NaN);
  const viewHeight = normalizePositiveNumber(viewSize.height, NaN);
  if (
    !Number.isFinite(exportWidth)
    || !Number.isFinite(exportHeight)
    || !Number.isFinite(viewWidth)
    || !Number.isFinite(viewHeight)
  ) {
    return normalizePositiveNumber(fallback, 1);
  }
  return Math.max(1e-6, Math.min(exportWidth / viewWidth, exportHeight / viewHeight));
}

export function resolveFigureTransparentBackground(value, fallback = false) {
  if (value == null) return fallback;
  return value === true;
}

export function resolveFigureExportAlphaMode(value, fallback = 'straight') {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  return normalized === 'premultiplied' ? 'premultiplied' : 'straight';
}

export function getFigureExportCapability(renderer, supersampling = 1) {
  const safeSupersampling = resolveFigureExportSupersampling(supersampling, 1);
  let maxBitmapDimension = 8192;
  const device = renderer?.device ?? null;
  if (device?.type === 'webgl2') {
    const gl = device.gl ?? null;
    const maxTexture = gl?.getParameter?.(gl.MAX_TEXTURE_SIZE) ?? maxBitmapDimension;
    const maxRenderbuffer = gl?.getParameter?.(gl.MAX_RENDERBUFFER_SIZE) ?? maxBitmapDimension;
    maxBitmapDimension = Math.max(1, Math.floor(Math.min(maxTexture, maxRenderbuffer)));
  } else if (device?.type === 'webgpu') {
    const limit = device.device?.limits?.maxTextureDimension2D ?? maxBitmapDimension;
    maxBitmapDimension = Math.max(1, Math.floor(limit));
  }
  return {
    supersampling: safeSupersampling,
    maxBitmapDimension,
    maxFigureDimension: Math.max(1, Math.floor(maxBitmapDimension / safeSupersampling)),
  };
}

export function resolveFigureExportOptions(options = {}, context = {}) {
  const requestedPreset = String(options.preset ?? options.dimensions ?? '').trim().toLowerCase();
  const windowDevicePixelRatio = normalizePositiveNumber(context.windowDevicePixelRatio, 1);
  const preset = requestedPreset || (options.width || options.height ? 'custom' : getDefaultFigureExportPreset(windowDevicePixelRatio));
  const format = normalizeFigureExportFormat(options.format, 'png');
  const windowSize = context.windowSize ?? {};
  const baseName = sanitizeFigureExportBaseName(options.baseName ?? options.name ?? options.filename ?? 'figure');
  const supersampling = resolveFigureExportSupersampling(options.supersampling, 1);
  const legendScale = resolveFigureLegendScale(options.legendScale, 1);
  const transparentBackground = resolveFigureTransparentBackground(options.transparentBackground, false);
  const alphaMode = transparentBackground
    ? resolveFigureExportAlphaMode(options.alphaMode, 'straight')
    : 'straight';
  const capability = context.capability ?? getFigureExportCapability(context.renderer, supersampling);

  let dimensions = null;
  if (preset !== 'custom') {
    dimensions = resolveFigureExportPresetDimensions(preset, windowSize);
  }
  if (!dimensions) {
    const fallback = resolveFigureExportPresetDimensions('window', windowSize) ?? { width: 1, height: 1 };
    const fallbackAspect = Math.max(1e-6, fallback.width / Math.max(1, fallback.height));
    let width = Number(options.width);
    let height = Number(options.height);
    if (!Number.isFinite(width) && Number.isFinite(height)) width = height * fallbackAspect;
    if (!Number.isFinite(height) && Number.isFinite(width)) height = width / fallbackAspect;
    dimensions = {
      preset: 'custom',
      width: clampInt(width, 1, fallback.width),
      height: clampInt(height, 1, fallback.height),
    };
  }

  const finalWidth = Math.max(1, Math.floor(dimensions.width));
  const finalHeight = Math.max(1, Math.floor(dimensions.height));
  const bitmapWidth = Math.max(1, Math.floor(finalWidth * supersampling));
  const bitmapHeight = Math.max(1, Math.floor(finalHeight * supersampling));
  const previewRect = resolveFigurePreviewRect(finalWidth, finalHeight, windowSize);
  const logicalWidth = Math.max(1, Number(previewRect.width ?? finalWidth));
  const logicalHeight = Math.max(1, Number(previewRect.height ?? finalHeight));
  const devicePixelRatio = Math.max(
    1,
    bitmapWidth / Math.max(1, logicalWidth),
    bitmapHeight / Math.max(1, logicalHeight),
  );
  const renderScale = supersampling;
  const framebufferWidth = bitmapWidth;
  const framebufferHeight = bitmapHeight;
  const cropX = 0;
  const cropY = 0;
  const fitsCapability = bitmapWidth <= capability.maxBitmapDimension && bitmapHeight <= capability.maxBitmapDimension;

  return {
    preset: dimensions.preset,
    format,
    baseName,
    filename: normalizeFigureExportFilename(options.filename ?? baseName, format, baseName),
    includeLegends: options.includeLegends !== false,
    includeLabels: options.includeLabels === true,
    includeInterface: options.includeInterface === true,
    width: finalWidth,
    height: finalHeight,
    bitmapWidth,
    bitmapHeight,
    logicalWidth,
    logicalHeight,
    devicePixelRatio,
    renderScale,
    previewRect,
    framebufferWidth,
    framebufferHeight,
    cropRect: {
      x: cropX,
      y: cropY,
      width: bitmapWidth,
      height: bitmapHeight,
    },
    supersampling,
    legendScale,
    transparentBackground,
    alphaMode,
    capability,
    fitsCapability,
  };
}

export function resolveFigurePreviewThumbnailOptions(exportOptions = {}, previewOptions = {}) {
  const sourceWidth = clampInt(exportOptions.width, 1, 1);
  const sourceHeight = clampInt(exportOptions.height, 1, 1);
  const maxWidth = clampInt(previewOptions.maxWidth, 1, 320);
  const maxHeight = clampInt(previewOptions.maxHeight, 1, 180);
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const baseName = sanitizeFigureExportBaseName(exportOptions.baseName ?? exportOptions.filename ?? 'figure');

  return {
    baseName: `${baseName}-preview`,
    filename: `${baseName}-preview`,
    format: 'png',
    preset: 'custom',
    width,
    height,
    supersampling: resolveFigureExportSupersampling(previewOptions.supersampling, 1),
    includeLabels: exportOptions.includeLabels === true,
    includeLegends: exportOptions.includeLegends !== false,
    includeInterface: exportOptions.includeInterface === true,
    legendScale: resolveFigureLegendScale(exportOptions.legendScale, 1),
    transparentBackground: resolveFigureTransparentBackground(exportOptions.transparentBackground, false),
    alphaMode: resolveFigureExportAlphaMode(exportOptions.alphaMode, 'straight'),
  };
}

export function buildFigureExportPresetList(windowSize = {}, capability = { maxBitmapDimension: Infinity }, supersampling = 1) {
  const safeSupersampling = resolveFigureExportSupersampling(supersampling, 1);
  const maxBitmapDimension = Math.max(1, Math.floor(Number(capability?.maxBitmapDimension) || Infinity));
  const windowDevicePixelRatio = normalizePositiveNumber(capability?.windowDevicePixelRatio, 1);
  const dynamicPresetId = getDefaultFigureExportPreset(windowDevicePixelRatio);
  const presets = [...FIGURE_EXPORT_PRESETS];
  if (!['window', 'window@x2', 'window@x4'].includes(dynamicPresetId)) {
    presets.splice(1, 0, { id: dynamicPresetId, label: `Window @${formatWindowScale(windowDevicePixelRatio)}x` });
  }
  return presets.map((entry) => {
    if (entry.id === 'custom') {
      return { ...entry, available: true, width: null, height: null };
    }
    const resolved = resolveFigureExportPresetDimensions(entry.id, windowSize) ?? { width: 1, height: 1 };
    const available = (resolved.width * safeSupersampling) <= maxBitmapDimension
      && (resolved.height * safeSupersampling) <= maxBitmapDimension;
    return {
      ...entry,
      width: resolved.width,
      height: resolved.height,
      available,
    };
  });
}
