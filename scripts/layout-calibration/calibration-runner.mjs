import HeliosNetwork from 'helios-network';
import { Helios } from '../../src/index.js';

const DEFAULT_CANDIDATE = Object.freeze({
  linkDistance: 1,
  minDistance: 0.15,
  kRepulsion: 1,
  kAttraction: 0.62,
  kGravity: 0.001,
  outputScale: 6.5,
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sampleEdges(edges, limit = 2000) {
  if (!edges || edges.length <= limit) return edges ?? [];
  const step = Math.max(1, Math.floor(edges.length / limit));
  const sampled = [];
  for (let i = 0; i < edges.length && sampled.length < limit; i += step) {
    sampled.push(edges[i]);
  }
  return sampled;
}

function projectPoint(matrix, width, height, x, y, z) {
  const cx = (matrix[0] * x) + (matrix[4] * y) + (matrix[8] * z) + matrix[12];
  const cy = (matrix[1] * x) + (matrix[5] * y) + (matrix[9] * z) + matrix[13];
  const cw = (matrix[3] * x) + (matrix[7] * y) + (matrix[11] * z) + matrix[15];
  const invW = Math.abs(cw) > 1e-9 ? 1 / cw : 1;
  return [
    (cx * invW * 0.5 + 0.5) * width,
    (1 - (cy * invW * 0.5 + 0.5)) * height,
  ];
}

function quantile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, (sortedValues.length - 1) * p));
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + ((sortedValues[hi] - sortedValues[lo]) * (index - lo));
}

function median(values, fallback = 0) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? quantile(sorted, 0.5) : fallback;
}

function sampleNodeIds(nodeCount, limit = 300) {
  const count = Math.max(0, Math.floor(Number(nodeCount) || 0));
  if (count <= limit) return Array.from({ length: count }, (_, i) => i);
  const ids = [];
  const step = count / limit;
  for (let i = 0; i < limit; i += 1) ids.push(Math.min(count - 1, Math.floor(i * step)));
  return ids;
}

function distance2d(projected, a, b) {
  const pa = projected[a];
  const pb = projected[b];
  if (!pa || !pb) return NaN;
  return Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
}

function computeNodeOverlapPenalty(projected, nodeIds, nodeRadiusPx) {
  let overlapHits = 0;
  let overlapPairs = 0;
  const threshold = nodeRadiusPx * 1.8;
  for (let i = 0; i < nodeIds.length; i += 1) {
    for (let j = i + 1; j < nodeIds.length; j += 1) {
      const distance = distance2d(projected, nodeIds[i], nodeIds[j]);
      if (!Number.isFinite(distance)) continue;
      if (distance < threshold) overlapHits += 1;
      overlapPairs += 1;
    }
  }
  return overlapPairs > 0 ? Math.min(1, overlapHits / Math.max(1, overlapPairs * 0.04)) : 0;
}

function computeEdgeMetrics(spec, projected, {
  nodeRadiusPx,
  minVisibleEdgePx,
  edgeSampleLimit = 2500,
} = {}) {
  const edges = sampleEdges(spec.edges, edgeSampleLimit);
  const edgeLengths = [];
  let visibleTotal = 0;
  let visibleCount = 0;
  for (const [source, target] of edges) {
    const distance = distance2d(projected, source, target);
    if (!Number.isFinite(distance)) continue;
    edgeLengths.push(distance);
    const visible = Math.max(0, distance - (nodeRadiusPx * 2));
    visibleTotal += Math.min(1, visible / minVisibleEdgePx);
    visibleCount += 1;
  }
  const edgeVisibility = visibleCount > 0 ? visibleTotal / visibleCount : 1;
  const edgeMedian = median(edgeLengths, 0);
  let lengthError = 0;
  for (const distance of edgeLengths) {
    lengthError += Math.abs(Math.log((distance + 1) / (edgeMedian + 1)));
  }
  const edgeLengthUniformity = edgeLengths.length
    ? Math.max(0, 1 - Math.min(1, (lengthError / edgeLengths.length) / 1.2))
    : 1;
  return { edges, edgeLengths, edgeMedian, edgeVisibility, edgeLengthUniformity };
}

function computeNeighborhoodSeparation(spec, projected, edgeMedian, sampleLimit = 1200) {
  const nodeCount = Math.max(0, Math.floor(Number(spec.nodeCount) || 0));
  if (nodeCount < 2 || !(edgeMedian > 0)) return 1;
  const edgeSet = new Set((spec.edges ?? []).map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`));
  const distances = [];
  const stride = Math.max(1, Math.floor(nodeCount / 97));
  for (let source = 0; source < nodeCount && distances.length < sampleLimit; source += stride) {
    const target = (source * 2654435761 + 1013904223) % nodeCount;
    if (source === target) continue;
    const key = `${Math.min(source, target)},${Math.max(source, target)}`;
    if (edgeSet.has(key)) continue;
    const distance = distance2d(projected, source, target);
    if (Number.isFinite(distance)) distances.push(distance);
  }
  const nonEdgeMedian = median(distances, edgeMedian);
  return Math.max(0, Math.min(1, (nonEdgeMedian / Math.max(1, edgeMedian) - 1) / 2));
}

function segmentsIntersect(a, b, c, d) {
  const orient = (p, q, r) => ((q[0] - p[0]) * (r[1] - p[1])) - ((q[1] - p[1]) * (r[0] - p[0]));
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return (o1 * o2 < 0) && (o3 * o4 < 0);
}

function computeCrossingPenalty(edges, projected, pairLimit = 6000) {
  if (!edges.length) return 0;
  const sampledEdges = sampleEdges(edges, 260);
  let checked = 0;
  let crossings = 0;
  for (let i = 0; i < sampledEdges.length && checked < pairLimit; i += 1) {
    const [a, b] = sampledEdges[i];
    const pa = projected[a];
    const pb = projected[b];
    if (!pa || !pb) continue;
    for (let j = i + 1; j < sampledEdges.length && checked < pairLimit; j += 1) {
      const [c, d] = sampledEdges[j];
      if (a === c || a === d || b === c || b === d) continue;
      const pc = projected[c];
      const pd = projected[d];
      if (!pc || !pd) continue;
      if (segmentsIntersect(pa, pb, pc, pd)) crossings += 1;
      checked += 1;
    }
  }
  return checked > 0 ? Math.min(1, (crossings / checked) / 0.08) : 0;
}

function computeSampledStress(spec, projected, edgeMedian, {
  sourceLimit = 20,
  pairLimit = 900,
  maxDepth = 4,
} = {}) {
  const nodeCount = Math.max(0, Math.floor(Number(spec.nodeCount) || 0));
  if (nodeCount < 2 || !(edgeMedian > 0)) return 0;
  const adjacency = Array.from({ length: nodeCount }, () => []);
  for (const [source, target] of spec.edges ?? []) {
    if (source >= 0 && source < nodeCount && target >= 0 && target < nodeCount) {
      adjacency[source].push(target);
      adjacency[target].push(source);
    }
  }
  const sources = sampleNodeIds(nodeCount, Math.min(sourceLimit, nodeCount));
  let numerator = 0;
  let denominator = 0;
  let pairs = 0;
  for (const source of sources) {
    const distance = new Int16Array(nodeCount);
    distance.fill(-1);
    const queue = [source];
    distance[source] = 0;
    for (let qi = 0; qi < queue.length; qi += 1) {
      const current = queue[qi];
      const depth = distance[current];
      if (depth >= maxDepth) continue;
      for (const next of adjacency[current]) {
        if (distance[next] >= 0) continue;
        distance[next] = depth + 1;
        queue.push(next);
      }
    }
    for (const target of queue) {
      const graphDistance = distance[target];
      if (target === source || graphDistance <= 0) continue;
      const screenDistance = distance2d(projected, source, target);
      if (!Number.isFinite(screenDistance)) continue;
      const ideal = edgeMedian * graphDistance;
      const error = screenDistance - ideal;
      numerator += error * error;
      denominator += ideal * ideal;
      pairs += 1;
      if (pairs >= pairLimit) break;
    }
    if (pairs >= pairLimit) break;
  }
  return denominator > 0 ? Math.min(1, Math.sqrt(numerator / denominator)) : 0;
}

export function scoreProjectedLayout(spec, positions, camera, {
  nodeRadiusPx = 4,
  minVisibleEdgePx = 10,
  maxSpreadFill = 0.92,
} = {}) {
  const uniforms = camera?.getUniforms?.() ?? null;
  const width = Math.max(1, Number(camera?.viewport?.width ?? 800));
  const height = Math.max(1, Number(camera?.viewport?.height ?? 600));
  const matrix = uniforms?.viewProjection ?? null;
  if (!matrix || !positions || positions.length < spec.nodeCount * 3) {
    return { score: -1, edgeVisibility: 0, overlapPenalty: 1, spreadPenalty: 1, stressPenalty: 1 };
  }

  const projected = Array.from({ length: spec.nodeCount }, (_, i) => projectPoint(
    matrix,
    width,
    height,
    positions[i * 3],
    positions[(i * 3) + 1],
    positions[(i * 3) + 2] ?? 0,
  ));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of projected) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const nodeIds = sampleNodeIds(spec.nodeCount, 300);
  const overlapPenalty = computeNodeOverlapPenalty(projected, nodeIds, nodeRadiusPx);
  const edgeMetrics = computeEdgeMetrics(spec, projected, { nodeRadiusPx, minVisibleEdgePx });
  const crossingPenalty = computeCrossingPenalty(edgeMetrics.edges, projected);
  const stressPenalty = computeSampledStress(spec, projected, edgeMetrics.edgeMedian);
  const neighborhoodSeparation = computeNeighborhoodSeparation(spec, projected, edgeMetrics.edgeMedian);
  const spreadFill = Math.max((maxX - minX) / width, (maxY - minY) / height);
  const spreadPenalty = Math.max(0, spreadFill - maxSpreadFill) / Math.max(0.01, 1 - maxSpreadFill);
  const score = (0.38 * edgeMetrics.edgeVisibility)
    + (0.18 * edgeMetrics.edgeLengthUniformity)
    + (0.16 * neighborhoodSeparation)
    - (0.24 * overlapPenalty)
    - (0.16 * stressPenalty)
    - (0.12 * spreadPenalty)
    - (0.08 * crossingPenalty);
  return {
    score,
    edgeVisibility: edgeMetrics.edgeVisibility,
    edgeLengthUniformity: edgeMetrics.edgeLengthUniformity,
    neighborhoodSeparation,
    overlapPenalty,
    stressPenalty,
    spreadPenalty,
    crossingPenalty,
    spreadFill,
    sampledEdgeMedianPx: edgeMetrics.edgeMedian,
  };
}

async function buildNetwork(spec) {
  const network = await HeliosNetwork.create({ directed: Boolean(spec.directed) });
  const nodes = network.addNodes(spec.nodeCount);
  const mappedEdges = (spec.edges ?? []).map(([source, target]) => [nodes[source], nodes[target]]);
  if (mappedEdges.length) network.addEdges(mappedEdges);
  return network;
}

export async function runLayoutCalibrationTrial(spec, candidate = {}, options = {}) {
  const container = document.getElementById('helios-calibration-root') ?? document.body.appendChild(document.createElement('div'));
  container.replaceChildren();
  container.style.width = `${options.width ?? 800}px`;
  container.style.height = `${options.height ?? 600}px`;

  const network = await buildNetwork(spec);
  const layoutOptions = {
    ...DEFAULT_CANDIDATE,
    ...candidate,
    mode: options.mode ?? '2d',
    forceModel: 'linear',
    tuningModel: false,
  };
  const helios = new Helios(network, {
    container,
    renderer: options.renderer ?? 'webgl',
    mode: options.mode ?? '2d',
    layout: { type: 'gpu-force', options: layoutOptions },
    camera: { animation: false },
  });
  await helios.ready;
  helios.startLayout();
  await wait(options.durationMs ?? 1200);
  helios.stopLayout('calibration');
  helios.frameNetwork({ animate: false, padding: 0.1 });
  await wait(80);

  const layout = helios.layout();
  const delegate = layout?.getPositionDelegate?.();
  const positions = await delegate?.snapshotNodePositions?.({ network });
  const metrics = scoreProjectedLayout(spec, positions, helios.renderer?.camera, options);
  helios.destroy?.();
  return {
    id: spec.id ?? null,
    family: spec.family ?? 'unknown',
    nodeCount: spec.nodeCount,
    edgeCount: spec.edges?.length ?? 0,
    candidate: layoutOptions,
    metrics,
  };
}

if (typeof window !== 'undefined') {
  window.__runLayoutCalibrationTrial = runLayoutCalibrationTrial;
}
