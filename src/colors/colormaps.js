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

export function base64ToUint8Array(b64) {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

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

function createInterpolatorFromList(colors) {
  const list = normalizeColors(colors);
  const last = Math.max(1, list.length - 1);
  return (tRaw) => {
    const t = clamp01(tRaw);
    if (list.length === 1) return [...list[0]];
    const scaled = t * last;
    const i0 = Math.max(0, Math.min(list.length - 1, Math.floor(scaled)));
    const i1 = Math.max(0, Math.min(list.length - 1, i0 + 1));
    const localT = scaled - i0;
    return lerpColor(list[i0], list[i1], localT);
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

function sampleColorsFromList(colors, count) {
  if (!colors?.length) return [];
  if (!count || count >= colors.length) return normalizeColors(colors);
  const normalized = normalizeColors(colors);
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
    interpolate: (t) => createInterpolatorFromList(load())(t),
    scheme: (count) => sampleColorsFromList(load(), count ?? entry.n ?? load().length),
  };
}

function buildD3Descriptors() {
  const result = {};
  for (const [name, value] of Object.entries(d3Chromatic)) {
    if (!value) continue;
    if (typeof value === 'function') {
      result[name] = {
        name,
        source: 'd3',
        isScheme: false,
        interpolate: (t) => normalizeCssColor(value(clamp01(t))),
        scheme: (count) => sampleColorsFromInterpolator((t) => value(clamp01(t)), count ?? 10),
      };
    } else if (Array.isArray(value)) {
      const colorsByCount = new Map();
      value.forEach((entry, index) => {
        if (!Array.isArray(entry)) return;
        colorsByCount.set(index, normalizeColors(entry));
      });
      const maxKey = Math.max(...colorsByCount.keys(), 0);
      const fallback = Array.isArray(value[0]) ? normalizeColors(value[value.length - 1]) : normalizeColors(value);
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
        interpolate: (t) => {
          const colors = value.find((entry) => Array.isArray(entry) && entry.length >= 2) ?? fallback;
          return createInterpolatorFromList(normalizeColors(colors))(t);
        },
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

export const colormaps = {
  d3: d3Descriptors,
  CET: CETDescriptors,
  cmasher: cmasherDescriptors,
  helios: heliosDescriptors,
};

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
  const key = input.toLowerCase().replace(/^d3:/, '').replace(/^cmasher:/, 'cmasher_');
  if (registry.has(key)) return registry.get(key);
  if (registry.has(input.toLowerCase())) return registry.get(input.toLowerCase());
  return null;
}

export function colormapToInterpolator(input) {
  const resolved = resolveColormap(input);
  if (!resolved?.interpolate) throw new Error(`Unknown colormap: ${input}`);
  return resolved.interpolate;
}

export function colormapToScheme(input, count) {
  const resolved = resolveColormap(input);
  if (!resolved?.scheme) throw new Error(`Unknown colormap: ${input}`);
  return resolved.scheme(count ?? 10);
}

export function createColormapScale(colormapInput, options = {}) {
  const { domain = [0, 1], clamp = true, alpha } = options;
  const interpolator = colormapToInterpolator(colormapInput);
  const [d0, d1] = domain;
  const denom = d1 - d0 || 1;
  return (value) => {
    const tRaw = (value - d0) / denom;
    const t = clamp ? clamp01(tRaw) : tRaw;
    const color = normalizeCssColor(interpolator(t));
    if (alpha != null) {
      color[3] = alpha;
    }
    return color;
  };
}

export function createCategoricalColormap(colormapInput, count) {
  return colormapToScheme(colormapInput, count);
}

export default colormaps;
