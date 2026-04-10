export const AMBIENT_OCCLUSION_QUALITY_DEFAULT = 'medium';

export const AMBIENT_OCCLUSION_QUALITY_OPTIONS = Object.freeze([
  Object.freeze({ value: 'low', label: 'Low' }),
  Object.freeze({ value: 'medium', label: 'Medium' }),
  Object.freeze({ value: 'high', label: 'High' }),
]);

function freezeKernel(kernel) {
  return Object.freeze(kernel.map((sample) => Object.freeze(sample)));
}

function buildSmoothKernel(sampleCount) {
  const kernel = [];
  const goldenAngle = 2.399963229728653;
  for (let i = 0; i < sampleCount; i += 1) {
    const radius = Math.sqrt((i + 0.5) / sampleCount);
    const angle = i * goldenAngle;
    kernel.push([
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    ]);
  }
  return freezeKernel(kernel);
}

function buildHemisphereKernel(sampleCount) {
  const kernel = [];
  const goldenAngle = 2.399963229728653;
  for (let i = 0; i < sampleCount; i += 1) {
    const t = (i + 0.5) / sampleCount;
    const angle = i * goldenAngle;
    const radial = Math.sqrt(t);
    const z = Math.sqrt(Math.max(0, 1 - radial * radial));
    const scale = 0.1 + 0.9 * t * t;
    kernel.push([
      Math.cos(angle) * radial * scale,
      Math.sin(angle) * radial * scale,
      z * scale,
    ]);
  }
  return freezeKernel(kernel);
}

function buildBlurWeights(radius, sigma) {
  const weights = new Array(radius + 1).fill(0);
  for (let i = 0; i <= radius; i += 1) {
    weights[i] = Math.exp(-((i * i) / (2 * sigma * sigma)));
  }
  let total = weights[0];
  for (let i = 1; i <= radius; i += 1) total += weights[i] * 2;
  for (let i = 0; i <= radius; i += 1) weights[i] /= total;
  return Object.freeze(weights);
}

function createPreset(key, label, config) {
  return Object.freeze({
    key,
    label,
    resolutionScale: config.resolutionScale,
    smoothSampleCount: config.smoothSampleCount,
    altSampleCount: config.altSampleCount,
    blurRadius: config.blurRadius,
    blurSigma: config.blurSigma,
    blurWeights: buildBlurWeights(config.blurRadius, config.blurSigma),
    depthSharpness: config.depthSharpness,
    occlusionScale: config.occlusionScale,
    smoothKernel: buildSmoothKernel(config.smoothSampleCount),
    altKernel: buildHemisphereKernel(config.altSampleCount),
  });
}

export const AMBIENT_OCCLUSION_QUALITY_PRESETS = Object.freeze({
  low: createPreset('low', 'Low', {
    resolutionScale: 0.5,
    smoothSampleCount: 8,
    altSampleCount: 12,
    blurRadius: 2,
    blurSigma: 1.2,
    depthSharpness: 320.0,
    occlusionScale: 1.6,
  }),
  medium: createPreset('medium', 'Medium', {
    resolutionScale: 0.75,
    smoothSampleCount: 12,
    altSampleCount: 20,
    blurRadius: 3,
    blurSigma: 1.55,
    depthSharpness: 380.0,
    occlusionScale: 1.52,
  }),
  high: createPreset('high', 'High', {
    resolutionScale: 1.0,
    smoothSampleCount: 16,
    altSampleCount: 28,
    blurRadius: 4,
    blurSigma: 1.9,
    depthSharpness: 460.0,
    occlusionScale: 1.46,
  }),
});

export function normalizeAmbientOcclusionQuality(value, fallback = AMBIENT_OCCLUSION_QUALITY_DEFAULT) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized && normalized in AMBIENT_OCCLUSION_QUALITY_PRESETS) return normalized;
  return fallback;
}

export function getAmbientOcclusionQualityPreset(value) {
  return AMBIENT_OCCLUSION_QUALITY_PRESETS[
    normalizeAmbientOcclusionQuality(value, AMBIENT_OCCLUSION_QUALITY_DEFAULT)
  ];
}