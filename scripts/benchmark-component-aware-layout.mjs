import {
  applyComponentAwareInitialPositions,
  buildActiveComponentMetadata,
} from '../src/delegates/GpuForcePositionDelegate.js';

const LARGE = process.argv.includes('--large');
const NODE_COUNTS = LARGE ? [100_000, 250_000, 500_000] : [10_000, 50_000];

function now() {
  return performance.now();
}

function makeActiveIds(nodeCount) {
  const ids = new Uint32Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) ids[i] = i;
  return ids;
}

function prefixStarts(counts) {
  const starts = new Uint32Array(counts.length);
  let cursor = 0;
  for (let i = 0; i < counts.length; i += 1) {
    starts[i] = cursor;
    cursor += counts[i];
  }
  return { starts, length: cursor };
}

function giantWithSingletons(nodeCount) {
  const giantCount = Math.max(2, Math.floor(nodeCount * 0.72));
  const counts = new Uint32Array(nodeCount);
  for (let i = 0; i < giantCount; i += 1) {
    counts[i] = (i > 0 ? 1 : 0) + (i + 1 < giantCount ? 1 : 0);
  }
  const { starts, length } = prefixStarts(counts);
  const neighbors = new Uint32Array(length);
  const cursor = new Uint32Array(starts);
  for (let i = 0; i + 1 < giantCount; i += 1) {
    neighbors[cursor[i]++] = i + 1;
    neighbors[cursor[i + 1]++] = i;
  }
  return { name: 'giant_singletons', starts, counts, neighbors };
}

function pairsAndChains(nodeCount) {
  const counts = new Uint32Array(nodeCount);
  for (let i = 0; i + 1 < nodeCount; i += 2) {
    counts[i] = 1;
    counts[i + 1] = 1;
  }
  const { starts, length } = prefixStarts(counts);
  const neighbors = new Uint32Array(length);
  for (let i = 0; i + 1 < nodeCount; i += 2) {
    neighbors[starts[i]] = i + 1;
    neighbors[starts[i + 1]] = i;
  }
  return { name: 'all_pairs', starts, counts, neighbors };
}

function shatteredBlocks(nodeCount) {
  const blockSize = 37;
  const counts = new Uint32Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    const indexInBlock = i % blockSize;
    const hasPrev = indexInBlock > 0;
    const hasNext = indexInBlock + 1 < blockSize && i + 1 < nodeCount;
    counts[i] = (hasPrev ? 1 : 0) + (hasNext ? 1 : 0);
  }
  const { starts, length } = prefixStarts(counts);
  const neighbors = new Uint32Array(length);
  const cursor = new Uint32Array(starts);
  for (let i = 0; i + 1 < nodeCount; i += 1) {
    if ((i % blockSize) + 1 >= blockSize) continue;
    neighbors[cursor[i]++] = i + 1;
    neighbors[cursor[i + 1]++] = i;
  }
  return { name: 'filtered_shattered_blocks', starts, counts, neighbors };
}

function makeClumpedPositions(nodeCount) {
  const positions = new Float32Array(nodeCount * 3);
  for (let i = 0; i < nodeCount; i += 1) {
    const base = i * 3;
    const h1 = ((Math.imul(i + 1, 2654435761) >>> 0) / 4294967296) - 0.5;
    const h2 = ((Math.imul(i + 1, 1597334677) >>> 0) / 4294967296) - 0.5;
    positions[base] = 96 + (h1 * 8);
    positions[base + 1] = 12 + (h2 * 8);
    positions[base + 2] = 0;
  }
  return positions;
}

function componentCentroidMetrics(metadata, positions, activeIds, activeCount) {
  const componentCount = metadata.componentCount;
  const sumX = new Float64Array(componentCount);
  const sumY = new Float64Array(componentCount);
  const counts = new Uint32Array(componentCount);
  for (let i = 0; i < activeCount; i += 1) {
    const nodeId = activeIds[i] >>> 0;
    const componentId = metadata.componentIds[nodeId] >>> 0;
    const base = nodeId * 3;
    sumX[componentId] += positions[base];
    sumY[componentId] += positions[base + 1];
    counts[componentId] += 1;
  }

  let angleCount = 0;
  let cosSum = 0;
  let sinSum = 0;
  let maxRadius = 0;
  let mainDistance = 0;
  for (let componentId = 0; componentId < componentCount; componentId += 1) {
    if (counts[componentId] <= 0) continue;
    const x = sumX[componentId] / counts[componentId];
    const y = sumY[componentId] / counts[componentId];
    const radius = Math.hypot(x, y);
    if (componentId === metadata.largestComponentId) {
      mainDistance = radius;
      continue;
    }
    maxRadius = Math.max(maxRadius, radius);
    if (radius > 1e-9) {
      cosSum += x / radius;
      sinSum += y / radius;
      angleCount += 1;
    }
  }
  const rayleigh = angleCount > 0
    ? Math.hypot(cosSum, sinSum) / angleCount
    : 0;
  return {
    mainDistance,
    rayleigh,
    maxRadius,
    haloComponents: angleCount,
  };
}

function runCase(nodeCount, graph, componentForces = 'auto') {
  const activeIds = makeActiveIds(nodeCount);
  const activeMask = new Uint32Array(nodeCount);
  activeMask.fill(1);
  const scratch = {};
  const t0 = now();
  const metadata = buildActiveComponentMetadata({
    nodeCapacity: nodeCount,
    activeIds,
    activeCount: nodeCount,
    activeMask,
    neighborStarts: graph.starts,
    neighborCounts: graph.counts,
    neighbors: graph.neighbors,
    options: { componentForces },
    scratch,
  });
  const t1 = now();

  const baseline = makeClumpedPositions(nodeCount);
  const baselineMetrics = componentCentroidMetrics(metadata, baseline, activeIds, nodeCount);
  const seeded = new Float32Array(baseline);
  const t2 = now();
  const seedApplied = metadata.componentSeedingEnabled === true
    && applyComponentAwareInitialPositions({
      positions: seeded,
      nodeCapacity: nodeCount,
      activeIds,
      activeCount: nodeCount,
      componentIds: metadata.componentIds,
      componentRanks: metadata.componentRanks,
      componentSizes: metadata.componentSizes,
      componentCount: metadata.componentCount,
      largestComponentId: metadata.largestComponentId,
      center: [0, 0, 0],
      radius: 220,
      mode: '2d',
      scratch,
    });
  const t3 = now();
  const seededMetrics = componentCentroidMetrics(metadata, seeded, activeIds, nodeCount);

  return {
    graph: graph.name,
    componentForces,
    nodes: nodeCount,
    edges2: graph.neighbors.length,
    components: metadata.componentCount,
    largest: metadata.largestComponentSize,
    secondLargest: metadata.secondLargestComponentSize,
    componentForcesActive: metadata.componentForcesActive,
    seedApplied,
    metadataMs: t1 - t0,
    seedMs: t3 - t2,
    baselineRayleigh: baselineMetrics.rayleigh,
    seededRayleigh: seededMetrics.rayleigh,
    baselineMainDistance: baselineMetrics.mainDistance,
    seededMainDistance: seededMetrics.mainDistance,
    seededMaxRadius: seededMetrics.maxRadius,
  };
}

for (const nodeCount of NODE_COUNTS) {
  const graphs = [
    giantWithSingletons(nodeCount),
    pairsAndChains(nodeCount),
    shatteredBlocks(nodeCount),
  ];
  for (const graph of graphs) {
    const modes = graph.name === 'giant_singletons' ? ['auto'] : ['auto', 'halo'];
    for (const mode of modes) {
      const result = runCase(nodeCount, graph, mode);
      console.log(JSON.stringify({
        ...result,
        metadataMs: Number(result.metadataMs.toFixed(3)),
        seedMs: Number(result.seedMs.toFixed(3)),
        baselineRayleigh: Number(result.baselineRayleigh.toFixed(4)),
        seededRayleigh: Number(result.seededRayleigh.toFixed(4)),
        baselineMainDistance: Number(result.baselineMainDistance.toFixed(3)),
        seededMainDistance: Number(result.seededMainDistance.toFixed(3)),
        seededMaxRadius: Number(result.seededMaxRadius.toFixed(3)),
      }));
    }
  }
}
