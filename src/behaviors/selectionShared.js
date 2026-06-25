import { AttributeType } from 'helios-network';

export const DEFAULT_NODE_SELECTED_STYLE = Object.freeze({
  sizeMul: 2,
  opacityMul: 1,
  outlineMul: 2,
  discard: false,
  forceMaxAlpha: true,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.34, 0.16, 0.02, 0],
});

export const DEFAULT_NODE_HIGHLIGHT_STYLE = Object.freeze({
  sizeMul: 1.5,
  opacityMul: 1,
  outlineMul: 1.25,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.02, 0.18, 0.34, 0],
});

export const DEFAULT_NODE_HOVER_STYLE = Object.freeze({
  sizeMul: 1.35,
  opacityMul: 1,
  outlineMul: 1.1,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.08, 0.08, 0.08, 0],
});

export const DEFAULT_EDGE_SELECTED_STYLE = Object.freeze({
  widthMul: 1.5,
  opacityMul: 1,
  discard: false,
  forceMaxAlpha: true,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.3, 0.16, 0.04, 0],
});

export const DEFAULT_EDGE_HIGHLIGHT_STYLE = Object.freeze({
  widthMul: 1.25,
  opacityMul: 50,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.03, 0.16, 0.28, 0],
});

export const DEFAULT_EDGE_HOVER_STYLE = Object.freeze({
  widthMul: 1.35,
  opacityMul: 50,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.08, 0.08, 0.08, 0],
});

export const NEUTRAL_NODE_NO_STATE_STYLE = Object.freeze({
  sizeMul: 1,
  opacityMul: 1,
  outlineMul: 1,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

export const NEUTRAL_EDGE_NO_STATE_STYLE = Object.freeze({
  widthMul: 1,
  opacityMul: 1,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

export const DEFAULT_OTHER_SELECTED_NODE_STYLE = Object.freeze({
  sizeMul: 0.75,
  opacityMul: 1,
  outlineMul: 0.75,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

export const DEFAULT_OTHER_SELECTED_EDGE_STYLE = Object.freeze({
  widthMul: 0.85,
  opacityMul: 0.85,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

export const DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE = Object.freeze({
  sizeMul: 0.9,
  opacityMul: 1,
  outlineMul: 0.9,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

export const DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE = Object.freeze({
  widthMul: 0.9,
  opacityMul: 0.9,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

export const DEFAULT_AUTO_BACKGROUND_TONE_DISABLED = Object.freeze({
  enabled: true,
  amount: 0.15,
});

export const DEFAULT_AUTO_BACKGROUND_TONE_SELECTED = Object.freeze({
  enabled: true,
  amount: 0.4,
});

export const DEFAULT_SELECTION_FOCUS_MAX_ZOOM = 3;
export const DEFAULT_SELECTION_FOCUS_MIN_DISTANCE = 260;
export const DEFAULT_SELECTION_FOCUS_ZOOM_TOLERANCE = 0.05;
export const CURRENT_SELECTION_VALUE = '__current_selection__';

export function clampNumber(value, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(max, Math.max(min, numeric));
}

export function rgbaArray(value, fallback) {
  const seed = Array.isArray(fallback) ? fallback : [1, 1, 1, 1];
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return [...seed];
  return [0, 1, 2, 3].map((index) => {
    const numeric = Number(value[index]);
    return Number.isFinite(numeric) ? numeric : seed[index];
  });
}

export function normalizeFiniteNumber(value, fallback) {
  if (value == null || `${value}`.trim() === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function normalizeNonNegativeNumber(value, fallback) {
  return clampNumber(normalizeFiniteNumber(value, null), { min: 0 }) ?? fallback;
}

export function normalizeNodeStyle(style, fallback) {
  const seed = fallback ?? DEFAULT_NODE_SELECTED_STYLE;
  const next = style && typeof style === 'object' ? style : {};
  return {
    sizeMul: normalizeNonNegativeNumber(next.sizeMul ?? seed.sizeMul, seed.sizeMul),
    opacityMul: normalizeNonNegativeNumber(next.opacityMul ?? seed.opacityMul, seed.opacityMul),
    outlineMul: normalizeNonNegativeNumber(next.outlineMul ?? seed.outlineMul, seed.outlineMul),
    discard: next.discard === true,
    forceMaxAlpha: next.forceMaxAlpha === true,
    colorMul: rgbaArray(next.colorMul, seed.colorMul),
    colorAdd: rgbaArray(next.colorAdd, seed.colorAdd),
  };
}

export function normalizeEdgeStyle(style, fallback) {
  const seed = fallback ?? DEFAULT_EDGE_SELECTED_STYLE;
  const next = style && typeof style === 'object' ? style : {};
  return {
    widthMul: normalizeNonNegativeNumber(next.widthMul ?? seed.widthMul, seed.widthMul),
    opacityMul: normalizeNonNegativeNumber(next.opacityMul ?? seed.opacityMul, seed.opacityMul),
    discard: next.discard === true,
    forceMaxAlpha: next.forceMaxAlpha === true,
    colorMul: rgbaArray(next.colorMul, seed.colorMul),
    colorAdd: rgbaArray(next.colorAdd, seed.colorAdd),
  };
}

export function backgroundLuminance(color) {
  const rgba = rgbaArray(color, [1, 1, 1, 1]);
  return (rgba[0] * 0.2126) + (rgba[1] * 0.7152) + (rgba[2] * 0.0722);
}

export function resolveBackgroundColor(helios) {
  return helios?.background?.() ?? helios?.clearColor?.() ?? [1, 1, 1, 1];
}

export function normalizeAutoBackgroundTone(tone, fallback = DEFAULT_AUTO_BACKGROUND_TONE_DISABLED) {
  const seed = fallback && typeof fallback === 'object' ? fallback : DEFAULT_AUTO_BACKGROUND_TONE_DISABLED;
  const next = tone && typeof tone === 'object' ? tone : {};
  return {
    enabled: next.enabled == null ? seed.enabled === true : next.enabled === true,
    amount: clampNumber(next.amount ?? seed.amount, { min: 0, max: 1 }) ?? seed.amount,
  };
}

export function applyAutoBackgroundTone(style, backgroundColor, tone) {
  const current = {
    ...style,
    colorMul: rgbaArray(style?.colorMul, [1, 1, 1, 1]),
    colorAdd: rgbaArray(style?.colorAdd, [0, 0, 0, 0]),
  };
  const resolvedTone = normalizeAutoBackgroundTone(tone);
  if (!resolvedTone.enabled) return current;
  const mixAmount = resolvedTone.amount;
  const background = rgbaArray(backgroundColor, [1, 1, 1, 1]);
  if (backgroundLuminance(background) < 0.5) {
    current.colorMul = [
      1 - (mixAmount * (1 - background[0])),
      1 - (mixAmount * (1 - background[1])),
      1 - (mixAmount * (1 - background[2])),
      1,
    ];
    current.colorAdd = [0, 0, 0, 0];
    return current;
  }
  current.colorMul = [1, 1, 1, 1];
  current.colorAdd = [
    background[0] * mixAmount * 0.28,
    background[1] * mixAmount * 0.28,
    background[2] * mixAmount * 0.28,
    0,
  ];
  return current;
}

export function isNeutralNodeStateStyle(style) {
  const current = normalizeNodeStyle(style, DEFAULT_NODE_SELECTED_STYLE);
  return current.sizeMul === 1
    && current.opacityMul === 1
    && current.outlineMul === 1
    && current.discard === false
    && current.forceMaxAlpha === false
    && current.colorMul.every((value, index) => value === [1, 1, 1, 1][index])
    && current.colorAdd.every((value) => value === 0);
}

export function isNeutralEdgeStateStyle(style) {
  const current = normalizeEdgeStyle(style, DEFAULT_EDGE_SELECTED_STYLE);
  return current.widthMul === 1
    && current.opacityMul === 1
    && current.discard === false
    && current.forceMaxAlpha === false
    && current.colorMul.every((value, index) => value === [1, 1, 1, 1][index])
    && current.colorAdd.every((value) => value === 0);
}

export function resolveStringAttributeNames(network) {
  if (!network) return [];
  const entries = [];
  for (const name of network.getNodeAttributeNames?.() ?? []) {
    const info = network.getNodeAttributeInfo?.(name);
    if (info?.type !== AttributeType.String) continue;
    entries.push(String(name));
  }
  entries.sort((a, b) => a.localeCompare(b));
  return entries;
}

export function resolveBooleanAttributeNames(network, scope = 'node') {
  if (!network) return [];
  const getNames = scope === 'edge'
    ? network.getEdgeAttributeNames?.bind(network)
    : network.getNodeAttributeNames?.bind(network);
  const getInfo = scope === 'edge'
    ? network.getEdgeAttributeInfo?.bind(network)
    : network.getNodeAttributeInfo?.bind(network);
  const entries = [];
  for (const name of getNames?.() ?? []) {
    const info = getInfo?.(name);
    if (info?.type !== AttributeType.Boolean || info?.dimension !== 1) continue;
    entries.push(String(name));
  }
  entries.sort((a, b) => a.localeCompare(b));
  return entries;
}

export function resolvePreferredHoverLabelSource(network) {
  if (!network) return '$id';
  const names = new Map((network.getNodeAttributeNames?.() ?? []).map((name) => [String(name).toLowerCase(), String(name)]));
  for (const key of ['label', 'name', 'title']) {
    const found = names.get(key);
    if (!found) continue;
    const info = network.getNodeAttributeInfo?.(found);
    if (info?.type === AttributeType.String) return found;
  }
  return '$id';
}

export function resolveHoverLabelValue(network, source, id) {
  if (!network || !Number.isInteger(id) || id < 0) return null;
  const resolvedSource = source === 'auto' ? resolvePreferredHoverLabelSource(network) : source;
  if (!resolvedSource || resolvedSource === '$id') return String(id);
  const info = network.getNodeAttributeInfo?.(resolvedSource);
  if (!info) return String(id);
  if (info.type === AttributeType.String) {
    const value = network.getNodeStringAttribute?.(resolvedSource, id);
    return value == null || value === '' ? String(id) : String(value);
  }
  return String(id);
}
