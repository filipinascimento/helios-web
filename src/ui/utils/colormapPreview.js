import { resolveColormap } from '../../colors/colormaps.js';

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function rgbaToCss(rgba, alphaOverride) {
  const r = Math.round(255 * clamp01(rgba?.[0] ?? 0));
  const g = Math.round(255 * clamp01(rgba?.[1] ?? 0));
  const b = Math.round(255 * clamp01(rgba?.[2] ?? 0));
  const a = alphaOverride ?? clamp01(rgba?.[3] ?? 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

const gradientCache = new Map();

export function colormapToCssGradient(nameOrDescriptor, options = {}) {
  const resolved = resolveColormap(nameOrDescriptor);
  if (!resolved?.interpolate) return null;

  const samples = Math.max(2, Math.floor(options.samples ?? 24));
  const alpha = options.alpha;
  const direction = options.direction ?? '90deg';
  const cacheKey = `${resolved.name}|${alpha ?? 'auto'}|${samples}|${direction}`;
  const cached = gradientCache.get(cacheKey);
  if (cached) return cached;

  const stops = [];
  const denom = samples - 1;
  for (let i = 0; i < samples; i += 1) {
    const t = denom === 0 ? 0 : i / denom;
    const rgba = resolved.interpolate(t);
    const css = rgbaToCss(rgba, alpha);
    stops.push(`${css} ${(t * 100).toFixed(2)}%`);
  }

  const gradient = `linear-gradient(${direction}, ${stops.join(', ')})`;
  gradientCache.set(cacheKey, gradient);
  return gradient;
}

export function getColormapSource(nameOrDescriptor) {
  const resolved = resolveColormap(nameOrDescriptor);
  return resolved?.source ?? null;
}

