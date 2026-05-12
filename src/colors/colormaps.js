import * as d3Chromatic from 'd3-scale-chromatic';
import rawColormapData from './ColormapData.json' with { type: 'json' };

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(a, b, t) {
  const aLen = Array.isArray(a) ? a.length : 0;
  const bLen = Array.isArray(b) ? b.length : 0;
  const size = Math.max(3, Math.min(Math.max(aLen, bLen), 4));
  const next = new Array(size);
  for (let i = 0; i < size; i += 1) {
    const av = a?.[i] ?? a?.[0] ?? 0;
    const bv = b?.[i] ?? b?.[0] ?? av;
    next[i] = lerp(av, bv, t);
  }
  if (size === 3) next.push(1);
  if (size === 4 && (next[3] == null || Number.isNaN(next[3]))) next[3] = 1;
  return next;
}

/**
 * Decode base64-encoded binary colormap data.
 *
 * @public
 * @apiSection Colormaps
 * @param {string} b64 - Base64-encoded byte payload.
 * @returns {Uint8Array} Decoded bytes.
 */
export function base64ToUint8Array(b64) {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

/**
 * Decode packed RGB colormap bytes into color tuples.
 *
 * @public
 * @apiSection Colormaps
 * @param {string} b64 - Base64-encoded RGB byte payload.
 * @param {number} [expectedN] - Expected number of colors.
 * @returns {Array<Array<number>>} RGB colors in byte space.
 */
export function decodeColormapData(b64, expectedN) {
  const bytes = base64ToUint8Array(b64);
  if (expectedN != null && bytes.length !== expectedN * 3) {
    console.warn(
      `Colormap length mismatch: expected ${expectedN * 3} bytes, got ${bytes.length}`,
    );
  }
  const colors = [];
  for (let i = 0; i < bytes.length; i += 3) {
    colors.push([bytes[i], bytes[i + 1], bytes[i + 2]]);
  }
  return colors;
}

function normalizeCssColor(value) {
  const fallback = [0, 0, 0, 1];
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value.length === 4) {
      const needsScale = value.some((v, i) => i < 3 && v > 1);
      return needsScale ? value.map((v, i) => (i < 3 ? (v ?? 0) / 255 : v ?? 1)) : [...value];
    }
    if (value.length === 3) {
      const needsScale = value.some((v) => v > 1);
      const scaled = needsScale ? value.map((v) => (v ?? 0) / 255) : value;
      return [scaled[0] ?? 0, scaled[1] ?? 0, scaled[2] ?? 0, 1];
    }
  }
  if (typeof value === 'number') {
    const v = value > 1 ? value / 255 : value;
    return [v, v, v, 1];
  }
  if (typeof value !== 'string') return fallback;
  const color = value.trim();
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  if (hexMatch) {
    const raw = hexMatch[1];
    const expand = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
    const int = parseInt(expand, 16);
    return [(int >> 16) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255, 1];
  }
  const rgbMatch = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (rgbMatch) {
    const parts = rgbMatch[1]
      .split(',')
      .map((v) => parseFloat(v.trim()))
      .filter((v) => Number.isFinite(v));
    if (parts.length >= 3) {
      const [r, g, b, a = 1] = parts;
      return [clamp01(r / 255), clamp01(g / 255), clamp01(b / 255), clamp01(a)];
    }
  }
  return fallback;
}

function normalizeColors(colors) {
  return colors.map((c) => normalizeCssColor(c));
}

function basisBlend(t, v0, v1, v2, v3) {
  const t2 = t * t;
  const t3 = t2 * t;
  return ((1 - 3 * t + 3 * t2 - t3) * v0
    + (4 - 6 * t2 + 3 * t3) * v1
    + (1 + 3 * t + 3 * t2 - 3 * t3) * v2
    + t3 * v3) / 6;
}

function basisVector(t, a, b, c, d) {
  const size = Math.max(3, Math.min(4, Math.max(a?.length ?? 0, b?.length ?? 0, c?.length ?? 0, d?.length ?? 0)));
  const out = new Array(size);
  for (let i = 0; i < size; i += 1) {
    const av = a?.[i] ?? a?.[0] ?? 0;
    const bv = b?.[i] ?? b?.[0] ?? av;
    const cv = c?.[i] ?? c?.[0] ?? bv;
    const dv = d?.[i] ?? d?.[0] ?? cv;
    out[i] = basisBlend(t, av, bv, cv, dv);
  }
  if (size === 3) out.push(1);
  if (size === 4 && (out[3] == null || Number.isNaN(out[3]))) out[3] = 1;
  return out;
}

function createInterpolatorFromList(colors, alreadyNormalized = false, closed = false) {
  const list = alreadyNormalized ? colors.map((c) => [...c]) : normalizeColors(colors);
  const n = list.length;
  if (n === 0) return () => [0, 0, 0, 1];
  if (n === 1) return () => [...list[0]];
  return (tRaw) => {
    const t = clamp01(tRaw);
    if (closed) {
      const scaled = t * n;
      const i = Math.floor(scaled);
      const localT = scaled - i;
      const v0 = list[(i - 1 + n) % n];
      const v1 = list[i % n];
      const v2 = list[(i + 1) % n];
      const v3 = list[(i + 2) % n];
      return basisVector(localT, v0, v1, v2, v3);
    }
    const scaled = t * (n - 1);
    const i = Math.floor(scaled);
    const localT = scaled - i;
    const v0 = i > 0 ? list[i - 1] : list[0];
    const v1 = list[i];
    const v2 = i + 1 < n ? list[i + 1] : list[n - 1];
    const v3 = i + 2 < n ? list[i + 2] : list[n - 1];
    return basisVector(localT, v0, v1, v2, v3);
  };
}

function sampleColorsFromInterpolator(interpolator, count, alpha) {
  const safeCount = Math.max(1, count ?? 1);
  const result = [];
  const denom = Math.max(1, safeCount - 1);
  for (let i = 0; i < safeCount; i += 1) {
    const t = denom === 0 ? 0 : i / denom;
    const value = interpolator(t);
    const normalized = normalizeCssColor(value);
    normalized[3] = alpha ?? normalized[3] ?? 1;
    result.push(normalized);
  }
  return result;
}

function sampleColorsFromList(colors, count, alreadyNormalized = false) {
  if (!colors?.length) return [];
  const normalized = alreadyNormalized ? colors : normalizeColors(colors);
  if (!count || count >= normalized.length) return normalized.map((c) => [...c]);
  const result = [];
  const step = (normalized.length - 1) / Math.max(1, count - 1);
  for (let i = 0; i < count; i += 1) {
    const pos = i * step;
    const i0 = Math.max(0, Math.min(normalized.length - 1, Math.floor(pos)));
    const i1 = Math.max(0, Math.min(normalized.length - 1, i0 + 1));
    const localT = pos - i0;
    result.push(lerpColor(normalized[i0], normalized[i1], localT));
  }
  return result;
}

const CATEGORY18_COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#bcbd22',
  '#17becf',
  '#aec7e8',
  '#ffbb78',
  '#98df8a',
  '#ff9896',
  '#c5b0d5',
  '#c49c94',
  '#f7b6d2',
  '#dbdb8d',
  '#9edae5',
];

function createRepeatingSchemeDescriptor(name, colors, source = 'helios') {
  const normalized = normalizeColors(colors);
  const interpolator = createInterpolatorFromList(normalized, true, false);
  return {
    name,
    source,
    isScheme: true,
    interpolate: (t) => interpolator(t),
    scheme: (count) => {
      const target = Math.max(1, Math.floor(Number(count) || normalized.length));
      return Array.from({ length: target }, (_, index) => [...normalized[index % normalized.length]]);
    },
  };
}

function buildJsonColormapDescriptor(name, entry, source) {
  let cached = null;
  const load = () => {
    if (cached) return cached;
    const decoded = decodeColormapData(entry.data, entry.n).map((c) => [c[0] / 255, c[1] / 255, c[2] / 255, 1]);
    cached = decoded;
    return cached;
  };
  return {
    name,
    source,
    isScheme: !!entry.isScheme,
    interpolate: (() => {
      const interpolator = createInterpolatorFromList(load(), true, false);
      return (t) => interpolator(t);
    })(),
    scheme: (count) => sampleColorsFromList(load(), count ?? entry.n ?? load().length, true),
  };
}

function buildD3Descriptors() {
  const RAMP_SIZE = 1024;
  const result = {};
  for (const [name, value] of Object.entries(d3Chromatic)) {
    if (!value) continue;
    if (typeof value === 'function') {
      // Build a ramp once from the d3 interpolator to avoid per-sample CSS parsing.
      const ramp = new Float32Array(RAMP_SIZE * 4);
      for (let i = 0; i < RAMP_SIZE; i += 1) {
        const t = i / (RAMP_SIZE - 1);
        const color = normalizeCssColor(value(clamp01(t)));
        const offset = i * 4;
        ramp[offset] = color[0];
        ramp[offset + 1] = color[1];
        ramp[offset + 2] = color[2];
        ramp[offset + 3] = color[3];
      }
      const rampInterpolator = (tRaw) => {
        const t = clamp01(tRaw);
        const scaled = t * (RAMP_SIZE - 1);
        const i0 = Math.max(0, Math.min(RAMP_SIZE - 1, Math.floor(scaled)));
        const i1 = Math.max(0, Math.min(RAMP_SIZE - 1, i0 + 1));
        const localT = scaled - i0;
        const offset0 = i0 * 4;
        const offset1 = i1 * 4;
        return [
          lerp(ramp[offset0], ramp[offset1], localT),
          lerp(ramp[offset0 + 1], ramp[offset1 + 1], localT),
          lerp(ramp[offset0 + 2], ramp[offset1 + 2], localT),
          lerp(ramp[offset0 + 3], ramp[offset1 + 3], localT),
        ];
      };
      result[name] = {
        name,
        source: 'd3',
        isScheme: false,
        interpolate: rampInterpolator,
        scheme: (count) => sampleColorsFromInterpolator(rampInterpolator, count ?? 10),
      };
    } else if (Array.isArray(value)) {
      const colorsByCount = new Map();
      value.forEach((entry, index) => {
        if (!Array.isArray(entry)) return;
        colorsByCount.set(index, normalizeColors(entry));
      });
      const maxKey = Math.max(...colorsByCount.keys(), 0);
      const fallback = Array.isArray(value[0]) ? normalizeColors(value[value.length - 1]) : normalizeColors(value);
      const baseColors = value.find((entry) => Array.isArray(entry) && entry.length >= 2) ?? fallback;
      const baseInterpolator = createInterpolatorFromList(baseColors, true, false);
      result[name] = {
        name,
        source: 'd3',
        isScheme: true,
        scheme: (count) => {
          if (!colorsByCount.size) return fallback;
          const keys = [...colorsByCount.keys()].sort((a, b) => a - b);
          const target = count ?? keys[keys.length - 1];
          let chosen = null;
          for (const key of keys) {
            if (key === target) {
              chosen = colorsByCount.get(key);
              break;
            }
            if (key > target) {
              chosen = colorsByCount.get(chosen ?? key) ?? colorsByCount.get(key);
              break;
            }
            chosen = colorsByCount.get(key) ?? chosen;
          }
          return chosen ?? fallback;
        },
        interpolate: (t) => baseInterpolator(t),
      };
    }
  }
  return result;
}

const d3Descriptors = buildD3Descriptors();

function buildJsonDescriptors() {
  const CET = {};
  const cmasher = {};
  const helios = {};
  for (const [name, entry] of Object.entries(rawColormapData)) {
    const descriptor = buildJsonColormapDescriptor(name, entry, name.startsWith('CET') ? 'CET' : name.startsWith('cmasher') ? 'cmasher' : 'helios');
    if (name.startsWith('CET')) {
      CET[name] = descriptor;
    } else if (name.startsWith('cmasher')) {
      cmasher[name] = descriptor;
    } else {
      helios[name] = descriptor;
    }
  }
  return { CET, cmasher, helios };
}

const { CET: CETDescriptors, cmasher: cmasherDescriptors, helios: heliosDescriptors } = buildJsonDescriptors();
heliosDescriptors.category18 = createRepeatingSchemeDescriptor('category18', CATEGORY18_COLORS, 'helios');

const registry = new Map();
function registerDescriptor(descriptor) {
  if (!descriptor?.name) return;
  registry.set(descriptor.name.toLowerCase(), descriptor);
}

function primeRegistry() {
  for (const desc of Object.values(d3Descriptors)) registerDescriptor(desc);
  for (const desc of Object.values(CETDescriptors)) registerDescriptor(desc);
  for (const desc of Object.values(cmasherDescriptors)) registerDescriptor(desc);
  for (const desc of Object.values(heliosDescriptors)) registerDescriptor(desc);
}

primeRegistry();

/**
 * Built-in color map registry grouped by source collection.
 *
 * @public
 * @apiSection Colormaps
 * @returns {object} D3, CET, cmasher, and Helios colormap collections.
 */
export const colormaps = {
  d3: d3Descriptors,
  CET: CETDescriptors,
  cmasher: cmasherDescriptors,
  helios: heliosDescriptors,
};

/**
 * Default node colormap used by Helios when no explicit node color mapper is set.
 *
 * @public
 * @apiSection Colormaps
 */
export const DEFAULT_NODE_COLORMAP = 'CET_L08-NeonBurst';

/**
 * Resolve a colormap name, descriptor, or function to a descriptor.
 *
 * @public
 * @apiSection Colormaps
 * @param {string|Function|object} input - Colormap reference.
 * @returns {object|null} Resolved descriptor, or `null` when not found.
 * @example
 * const viridis = resolveColormap('interpolateViridis');
 */
export function resolveColormap(input) {
  if (!input) return null;
  if (typeof input === 'function') {
    return {
      name: input.name || 'custom-interpolator',
      source: 'custom',
      isScheme: false,
      interpolate: (t) => normalizeCssColor(input(clamp01(t))),
      scheme: (count) => sampleColorsFromInterpolator((v) => input(clamp01(v)), count ?? 10),
    };
  }
  if (Array.isArray(input)) {
    return {
      name: 'custom-scheme',
      source: 'custom',
      isScheme: true,
      interpolate: (t) => createInterpolatorFromList(input)(t),
      scheme: (count) => sampleColorsFromList(input, count ?? input.length),
    };
  }
  if (typeof input === 'object' && typeof input.interpolate === 'function') {
    return input;
  }
  if (typeof input === 'object' && Array.isArray(input.colors)) {
    return {
      name: input.name ?? 'custom-colors',
      source: input.source ?? 'custom',
      isScheme: !!input.isScheme,
      interpolate: (t) => createInterpolatorFromList(input.colors)(t),
      scheme: (count) => sampleColorsFromList(input.colors, count ?? input.colors.length),
    };
  }
  if (typeof input !== 'string') return null;
  const normalizedInput = input.trim();
  const key = normalizedInput
    .toLowerCase()
    .replace(/^d3:\s*/, '')
    .replace(/^cmasher:\s*/, 'cmasher_')
    .replace(/^cet:\s*/, 'cet_');
  if (registry.has(key)) return registry.get(key);
  if (registry.has(normalizedInput.toLowerCase())) return registry.get(normalizedInput.toLowerCase());
  return null;
}

/**
 * Resolve a colormap to an interpolation function.
 *
 * @public
 * @apiSection Colormaps
 * @param {string|Function|object} input - Colormap reference.
 * @returns {Function|null} Function that maps `0..1` values to colors.
 */
export function colormapToInterpolator(input) {
  const resolved = resolveColormap(input);
  if (!resolved?.interpolate) throw new Error(`Unknown colormap: ${input}`);
  return resolved.interpolate;
}

/**
 * Resolve a colormap to a discrete color scheme.
 *
 * @public
 * @apiSection Colormaps
 * @param {string|Function|object} input - Colormap reference.
 * @param {number} count - Number of colors to sample.
 * @returns {Array<Array<number>>|null} Sampled RGBA colors.
 */
export function colormapToScheme(input, count) {
  const resolved = resolveColormap(input);
  if (!resolved?.scheme) throw new Error(`Unknown colormap: ${input}`);
  return resolved.scheme(count ?? 10);
}

/**
 * Create a numeric colormap scale.
 *
 * @public
 * @apiSection Colormaps
 * @param {string|Function|object} colormapInput - Colormap reference.
 * @param {object} [options] - Scale options.
 * @param {Array<number>} [options.domain] - Numeric input domain.
 * @param {number} [options.alpha] - Output alpha override.
 * @returns {Function} Function that maps values to RGBA colors.
 * @example
 * const color = createColormapScale('interpolateViridis', { domain: [0, 1] });
 */
export function createColormapScale(colormapInput, options = {}) {
  const { domain = [0, 1], clamp = true, alpha } = options;
  const clampSpec = (() => {
    if (clamp && typeof clamp === 'object') {
      return { min: clamp.min !== false, max: clamp.max !== false };
    }
    if (clamp === false) return { min: false, max: false };
    return { min: true, max: true };
  })();
  const interpolator = colormapToInterpolator(colormapInput);
  const sample = interpolator(0.5);
  const isArrayLike = (value) =>
    (Array.isArray(value) || ArrayBuffer.isView(value)) &&
    typeof value.length === 'number' &&
    value.length >= 3;
  const interpolatorReturnsArray =
    isArrayLike(sample) && Array.from(sample).every((v) => Number.isFinite(v));
  const [d0, d1] = domain;
  const denom = d1 - d0 || 1;
  return (value) => {
    if (!clampSpec.min || !clampSpec.max) {
      const lo = Math.min(d0, d1);
      const hi = Math.max(d0, d1);
      if (!clampSpec.min && value < lo) return undefined;
      if (!clampSpec.max && value > hi) return undefined;
    }
    const tRaw = (value - d0) / denom;
    const shouldClamp = clampSpec.min || clampSpec.max;
    const t = shouldClamp ? clamp01(tRaw) : tRaw;
    const color = interpolatorReturnsArray ? [...interpolator(t)] : normalizeCssColor(interpolator(t));
    if (alpha != null) {
      color[3] = alpha;
    }
    return color;
  };
}

/**
 * Create a categorical palette from a colormap.
 *
 * @public
 * @apiSection Colormaps
 * @param {string|Function|object} colormapInput - Colormap reference.
 * @param {number} count - Number of categories.
 * @returns {Array<Array<number>>} RGBA colors for categories.
 */
export function createCategoricalColormap(colormapInput, count) {
  return colormapToScheme(colormapInput, count);
}

export default colormaps;
