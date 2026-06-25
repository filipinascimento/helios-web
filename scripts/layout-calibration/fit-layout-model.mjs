#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const FEATURE_NAMES = ['bias', 'smallGraph', 'density', 'avgDegreeNorm', 'degreeVarianceNorm', 'componentProxy'];
const PARAMETER_KEYS = ['outputScale'];
const DEFAULT_BASE_OPTIONS = {
  outputScale: 6.5,
};
const DEFAULT_CLAMPS = {
  outputScale: [4, 20],
};
const SCORE_WEIGHTS = Object.freeze({
  edgeVisibility: 0.38,
  edgeLengthUniformity: 0.18,
  neighborhoodSeparation: 0.16,
  overlapPenalty: -0.24,
  stressPenalty: -0.16,
  spreadPenalty: -0.12,
  crossingPenalty: -0.08,
});

function parseArgs(argv) {
  const get = (name, fallback) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] ?? fallback : fallback;
  };
  return {
    input: get('--input', path.join(__dirname, 'results', 'measurements.json')),
    output: get('--output', path.join(repoRoot, 'src', 'layouts', 'layoutTuningModel.generated.js')),
    lambda: Number(get('--lambda', 0.08)),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function featureVector(row) {
  const features = row.features ?? {};
  const nodeCount = Math.max(0, Number(row.nodeCount ?? features.nodeCount) || 0);
  const edgeCount = Math.max(0, Number(row.edgeCount ?? features.edgeCount) || 0);
  const avgDegree = Number(features.avgDegree) || (nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0);
  const degreeVariance = Math.max(0, Number(features.degreeVariance) || avgDegree);
  const density = nodeCount > 1 ? clamp((2 * edgeCount) / (nodeCount * (nodeCount - 1)), 0, 1) : 0;
  const logNodeCount = Math.log10(Math.max(2, nodeCount));
  const smallGraph = clamp((Math.log10(200) - logNodeCount) / (Math.log10(200) - Math.log10(5)), 0, 1);
  return [
    1,
    smallGraph,
    density,
    clamp(avgDegree / 50, 0, 2),
    clamp(degreeVariance / Math.max(1, avgDegree * avgDegree), 0, 2),
    clamp(Number(features.componentProxy) || Number(features.isolateFraction) || 0, 0, 1),
  ];
}

function scoreFromMetrics(metrics = {}) {
  const direct = Number(metrics.score);
  if (Number.isFinite(direct)) return direct;
  let score = 0;
  let used = false;
  for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
    const value = Number(metrics[key]);
    if (!Number.isFinite(value)) continue;
    score += weight * value;
    used = true;
  }
  return used ? score : NaN;
}

function selectBestRows(measurements) {
  const best = new Map();
  for (const row of measurements) {
    const id = row.id ?? `${row.family}-${row.nodeCount}-${row.edgeCount}`;
    const score = scoreFromMetrics(row.metrics);
    if (!Number.isFinite(score)) continue;
    const previous = best.get(id);
    if (!previous || score > scoreFromMetrics(previous.metrics)) best.set(id, row);
  }
  return Array.from(best.values());
}

function solveLinearSystem(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) continue;
    if (pivot !== col) [a[pivot], a[col]] = [a[col], a[pivot]];
    const div = a[col][col];
    for (let j = col; j <= n; j += 1) a[col][j] /= div;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let j = col; j <= n; j += 1) a[row][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => Number.isFinite(row[n]) ? row[n] : 0);
}

function fitRidge(rows, key, base, lambda) {
  const width = FEATURE_NAMES.length;
  const xtx = Array.from({ length: width }, () => Array.from({ length: width }, () => 0));
  const xty = Array.from({ length: width }, () => 0);
  for (const row of rows) {
    const candidateValue = Number(row.candidate?.[key]);
    if (!Number.isFinite(candidateValue) || candidateValue <= 0 || !Number.isFinite(base) || base <= 0) continue;
    const x = featureVector(row);
    const y = Math.log(candidateValue / base);
    for (let i = 0; i < width; i += 1) {
      xty[i] += x[i] * y;
      for (let j = 0; j < width; j += 1) {
        xtx[i][j] += x[i] * x[j];
      }
    }
  }
  for (let i = 1; i < width; i += 1) {
    xtx[i][i] += lambda;
  }
  return solveLinearSystem(xtx, xty).map((value) => Number(value.toFixed(6)));
}

function modelSource(model) {
  return `const DEFAULT_BASE_OPTIONS = Object.freeze(${JSON.stringify(DEFAULT_BASE_OPTIONS, null, 2)});

export const DEFAULT_LAYOUT_TUNING_MODEL = Object.freeze(${JSON.stringify(model, null, 2)});

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

${awaitReadNetworkSnapshotSource()}
${estimateDegreeStatsSource()}
${extractFeatureSource()}
${predictionSource()}
`;
}

function awaitReadNetworkSnapshotSource() {
  return String.raw`function readNetworkSnapshot(network) {
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
}`;
}

function estimateDegreeStatsSource() {
  return String.raw`function estimateDegreeStats(snapshot) {
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
}`;
}

function extractFeatureSource() {
  return String.raw`export function extractLayoutTuningFeatures(network, hints = {}) {
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
}`;
}

function predictionSource() {
  return String.raw`function dot(coefficients, vector) {
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
}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = JSON.parse(await readFile(args.input, 'utf8'));
  const measurements = Array.isArray(payload.measurements) ? payload.measurements : [];
  const rows = selectBestRows(measurements);
  if (rows.length < FEATURE_NAMES.length) {
    throw new Error(`Need at least ${FEATURE_NAMES.length} calibrated graphs, got ${rows.length}`);
  }
  const base = payload.baseCandidate ?? DEFAULT_BASE_OPTIONS;
  const parameters = {};
  for (const key of PARAMETER_KEYS) {
    parameters[key] = {
      coefficients: fitRidge(rows, key, Number(base[key] ?? DEFAULT_BASE_OPTIONS[key]), args.lambda),
      clamp: DEFAULT_CLAMPS[key],
    };
  }
  const model = { version: 1, featureNames: FEATURE_NAMES, parameters };
  await writeFile(args.output, modelSource(model));
  console.log(JSON.stringify({ input: args.input, output: args.output, rows: rows.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
