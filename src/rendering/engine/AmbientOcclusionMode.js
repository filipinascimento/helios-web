export const AMBIENT_OCCLUSION_MODE_DEFAULT = 'smooth';

export const AMBIENT_OCCLUSION_MODE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'smooth', label: 'SSAO Smooth' }),
  Object.freeze({ value: 'alt', label: 'SSAO Alt' }),
]);

export function normalizeAmbientOcclusionMode(value, fallback = AMBIENT_OCCLUSION_MODE_DEFAULT) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'smooth' || normalized === 'alt') return normalized;
  return fallback;
}
