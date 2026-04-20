export const AMBIENT_OCCLUSION_MODE_DEFAULT = 'fast';

export const AMBIENT_OCCLUSION_MODE_OPTIONS = Object.freeze([
  Object.freeze({ value: 'fast', label: 'Fast SSAO' }),
  Object.freeze({ value: 'smooth', label: 'Smooth SSAO' }),
]);

export function normalizeAmbientOcclusionMode(value, fallback = AMBIENT_OCCLUSION_MODE_DEFAULT) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'fast' || normalized === 'alt') return 'fast';
  if (normalized === 'smooth') return 'smooth';
  return fallback;
}
