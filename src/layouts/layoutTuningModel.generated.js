const DEFAULT_BASE_OPTIONS = Object.freeze({
  "outputScale": 6.5
});

export const DEFAULT_LAYOUT_TUNING_MODEL = Object.freeze({
  "version": 1,
  "featureNames": [
    "bias",
    "smallGraph",
    "density",
    "avgDegreeNorm",
    "degreeVarianceNorm",
    "componentProxy"
  ],
  "parameters": {
    "outputScale": {
      "coefficients": [
        0.245287,
        1.318114,
        -0.940403,
        0.619971,
        -0.354482,
        0.048489
      ],
      "clamp": [
        4,
        20
      ]
    }
  }
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveCount(value, fallback = 0) {
  const numeric = Math.floor(Number(value));
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function getArrayLikeLength(value) {
  const length = Number(value?.length);
  return Number.isFinite(length) && length >= 0 ? Math.floor(length) : 0;
}

function readNetworkSnapshot(network) {
  const read = () => {
    const nodeCount = resolveCount(
      network?.nodeCount ?? network?.nodeCapacity ?? getArrayLikeLength(network?.nodeIndices),
      0,
    );
    const edgeCount = resolveCount(
      network?.edgeCount ?? network?.edgesCount ?? getArrayLikeLength(network?.edgeIndices),
      0,
    );
    const edgesView = network?.edgesView ?? null;
    const edgePairLimit = Math.min(getArrayLikeLength(edgesView), 40000);
    return {
      nodeCount,
      edgeCount,
      hasEdgeInfo: Boolean(network && (
        network.edgeCount != null
        || network.edgesCount != null
        || network.edgeIndices != null
        || network.edgesView != null
      )),
      edgePairs: edgesView ? Array.from(edgesView.slice ? edgesView.slice(0, edgePairLimit) : edgesView).slice(0, edgePairLimit) : null,
    };
  };
  if (typeof network?.withBufferAccess === 'function') {
    return network.withBufferAccess(read);
  }
  return read();
}
function estimateDegreeStats(snapshot) {
  const nodeCount = Math.max(0, snapshot.nodeCount);
  const edgeCount = Math.max(0, snapshot.edgeCount);
  const avgDegree = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;
  const edgePairs = snapshot.edgePairs;
  if (!snapshot.hasEdgeInfo) {
    return { avgDegree, degreeVariance: avgDegree, isolateFraction: 0, componentProxy: 0 };
  }
  if (edgeCount <= 0) {
    return {
      avgDegree,
      degreeVariance: 0,
      isolateFraction: nodeCount > 0 ? 1 : 0,
      componentProxy: nodeCount > 1 ? 1 : 0,
    };
  }
  if (!edgePairs || edgePairs.length < 2 || nodeCount <= 0) {
    return { avgDegree, degreeVariance: avgDegree, isolateFraction: 0, componentProxy: 0 };
  }
  const availablePairs = Math.floor(edgePairs.length / 2);
  const pairLimit = Math.min(availablePairs, 20000);
  const stride = Math.max(1, Math.floor(availablePairs / Math.max(1, pairLimit)));
  const degree = new Map();
  let sampledPairs = 0;
  for (let pair = 0; pair < availablePairs && sampledPairs < pairLimit; pair += stride) {
    const a = edgePairs[pair * 2];
    const b = edgePairs[(pair * 2) + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
    sampledPairs += 1;
  }
  const scale = edgeCount > sampledPairs && sampledPairs > 0 ? edgeCount / sampledPairs : 1;
  let sum = 0;
  let sumSq = 0;
  for (const value of degree.values()) {
    const d = value * scale;
    sum += d;
    sumSq += d * d;
  }
  const seenNodes = Math.min(nodeCount, degree.size);
  const unseenNodes = Math.max(0, nodeCount - seenNodes);
  const mean = sum / nodeCount;
  const isolateFraction = nodeCount > 0 ? unseenNodes / nodeCount : 0;
  return {
    avgDegree: sampledPairs < edgeCount ? avgDegree : mean,
    degreeVariance: Math.max(0, (sumSq / nodeCount) - (mean * mean)),
    isolateFraction,
    componentProxy: isolateFraction,
  };
}
export function extractLayoutTuningFeatures(network, hints = {}) {
  const snapshot = readNetworkSnapshot(network);
  const nodeCount = Math.max(0, resolveCount(hints.nodeCount ?? snapshot.nodeCount, snapshot.nodeCount));
  const edgeCount = Math.max(0, resolveCount(hints.edgeCount ?? snapshot.edgeCount, snapshot.edgeCount));
  const stats = estimateDegreeStats({ ...snapshot, nodeCount, edgeCount });
  const avgDegree = toFinite(hints.avgDegree, stats.avgDegree || (nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0));
  const density = nodeCount > 1 ? clamp((2 * edgeCount) / (nodeCount * (nodeCount - 1)), 0, 1) : 0;
  const degreeVariance = toFinite(hints.degreeVariance, stats.degreeVariance);
  const communityCount = resolveCount(hints.communityCount, 0);
  const logNodeCount = Math.log10(Math.max(2, nodeCount));
  const smallGraph = clamp((Math.log10(200) - logNodeCount) / (Math.log10(200) - Math.log10(5)), 0, 1);
  return {
    nodeCount,
    edgeCount,
    avgDegree,
    density,
    degreeVariance,
    isolateFraction: toFinite(hints.isolateFraction, stats.isolateFraction),
    componentProxy: toFinite(hints.componentProxy, stats.componentProxy),
    communityCount,
    vector: [
      1,
      smallGraph,
      density,
      clamp(avgDegree / 50, 0, 2),
      clamp(degreeVariance / Math.max(1, avgDegree * avgDegree), 0, 2),
      toFinite(hints.componentProxy, stats.componentProxy),
    ],
  };
}
function dot(coefficients, vector) {
  let total = 0;
  for (let i = 0; i < coefficients.length; i += 1) total += (Number(coefficients[i]) || 0) * (Number(vector[i]) || 0);
  return total;
}

function resolveModel(model) {
  if (model === false || model == null) return null;
  if (typeof model === 'function') return model;
  if (model && typeof model === 'object') return model;
  return DEFAULT_LAYOUT_TUNING_MODEL;
}

export function predictLayoutTuningOptions(network, {
  model = DEFAULT_LAYOUT_TUNING_MODEL,
  baseOptions = DEFAULT_BASE_OPTIONS,
  hints = {},
} = {}) {
  const resolvedModel = resolveModel(model);
  if (!resolvedModel) return {};
  const features = extractLayoutTuningFeatures(network, hints);
  if (typeof resolvedModel === 'function') return resolvedModel(features, baseOptions) ?? {};
  const parameters = resolvedModel.parameters ?? DEFAULT_LAYOUT_TUNING_MODEL.parameters;
  const next = {};
  for (const [key, descriptor] of Object.entries(parameters)) {
    const base = toFinite(baseOptions[key], DEFAULT_BASE_OPTIONS[key]);
    if (!Number.isFinite(base)) continue;
    const multiplier = Math.exp(dot(descriptor.coefficients ?? [], features.vector));
    const [min, max] = descriptor.clamp ?? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
    next[key] = clamp(base * multiplier, min, max);
  }
  return next;
}
