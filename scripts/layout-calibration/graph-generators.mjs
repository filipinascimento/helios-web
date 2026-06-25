export function createPrng(seed = 1) {
  let state = (Number(seed) >>> 0) || 1;
  return function random() {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function clampInteger(value, min, max) {
  const numeric = Math.floor(Number(value));
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

function addEdge(edgeSet, source, target) {
  if (source === target) return;
  const a = Math.min(source, target);
  const b = Math.max(source, target);
  edgeSet.add(`${a},${b}`);
}

function materializeEdges(edgeSet) {
  return Array.from(edgeSet, (key) => key.split(',').map((value) => Number(value)));
}

function randomDistinctPair(n, random) {
  const source = Math.floor(random() * n);
  let target = Math.floor(random() * Math.max(1, n - 1));
  if (target >= source) target += 1;
  return [source, target];
}

function sampleRandomEdges({ nodeCount, targetEdges, random, accept = null, maxAttemptsFactor = 24 }) {
  const n = Math.max(0, Math.floor(Number(nodeCount) || 0));
  const maxEdges = n * Math.max(0, n - 1) / 2;
  const target = clampInteger(targetEdges, 0, maxEdges);
  const edges = new Set();
  const maxAttempts = Math.max(256, target * maxAttemptsFactor);
  let attempts = 0;
  while (edges.size < target && attempts < maxAttempts) {
    attempts += 1;
    const [source, targetNode] = randomDistinctPair(n, random);
    if (!accept || accept(source, targetNode)) {
      addEdge(edges, source, targetNode);
    }
  }
  return edges;
}

export function normalizeGraphSpec(spec) {
  const nodeCount = clampInteger(spec.nodeCount ?? spec.n, 0, Number.MAX_SAFE_INTEGER);
  const edgeSet = new Set();
  for (const edge of spec.edges ?? []) {
    const source = clampInteger(edge[0], 0, Math.max(0, nodeCount - 1));
    const target = clampInteger(edge[1], 0, Math.max(0, nodeCount - 1));
    addEdge(edgeSet, source, target);
  }
  return {
    ...spec,
    nodeCount,
    edgeCount: edgeSet.size,
    edges: materializeEdges(edgeSet),
  };
}

export function generateErdosRenyi({ nodeCount, avgDegree, seed = 1, id = null } = {}) {
  const n = clampInteger(nodeCount, 0, 1_000_000);
  const k = Math.min(Math.max(0, Number(avgDegree) || 0), Math.max(0, n - 1));
  const p = n > 1 ? k / (n - 1) : 0;
  const random = createPrng(seed);
  const edges = new Set();
  const totalPairs = n * Math.max(0, n - 1) / 2;
  const targetEdges = Math.round((n * k) / 2);
  if (n > 2000 && p < 0.02) {
    for (const edge of sampleRandomEdges({ nodeCount: n, targetEdges, random })) {
      edges.add(edge);
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        if (random() <= p) addEdge(edges, i, j);
      }
    }
    if (edges.size === 0 && targetEdges > 0 && targetEdges < totalPairs) {
      for (const edge of sampleRandomEdges({ nodeCount: n, targetEdges: Math.min(targetEdges, 4), random })) {
        edges.add(edge);
      }
    }
  }
  return normalizeGraphSpec({
    id: id ?? `er-n${n}-k${k}-s${seed}`,
    family: 'er',
    nodeCount: n,
    targetAvgDegree: k,
    seed,
    edges: materializeEdges(edges),
  });
}

export function generateBarabasiAlbert({ nodeCount, avgDegree, seed = 1, id = null } = {}) {
  const n = clampInteger(nodeCount, 0, 1_000_000);
  const m = clampInteger(Math.round((Number(avgDegree) || 0) / 2), 1, Math.max(1, n - 1));
  const random = createPrng(seed);
  const edges = new Set();
  const repeated = [];
  const initial = Math.min(n, Math.max(2, m + 1));
  for (let i = 0; i < initial; i += 1) {
    for (let j = i + 1; j < initial; j += 1) {
      addEdge(edges, i, j);
      repeated.push(i, j);
    }
  }
  for (let node = initial; node < n; node += 1) {
    const targets = new Set();
    while (targets.size < Math.min(m, node)) {
      const pick = repeated.length ? repeated[Math.floor(random() * repeated.length)] : Math.floor(random() * node);
      if (pick !== node) targets.add(pick);
    }
    for (const target of targets) {
      addEdge(edges, node, target);
      repeated.push(node, target);
    }
  }
  return normalizeGraphSpec({
    id: id ?? `ba-n${n}-m${m}-s${seed}`,
    family: 'ba',
    nodeCount: n,
    targetAvgDegree: m * 2,
    seed,
    edges: materializeEdges(edges),
  });
}

export function generateWattsStrogatz({ nodeCount, avgDegree, rewiringProbability = 0.05, seed = 1, id = null } = {}) {
  const n = clampInteger(nodeCount, 0, 1_000_000);
  const random = createPrng(seed);
  const halfDegree = clampInteger(Math.round((Number(avgDegree) || 0) / 2), 1, Math.max(1, Math.floor((n - 1) / 2)));
  const p = Math.min(1, Math.max(0, Number(rewiringProbability) || 0));
  const edges = new Set();
  for (let i = 0; i < n; i += 1) {
    for (let d = 1; d <= halfDegree; d += 1) {
      let target = (i + d) % n;
      if (random() < p) {
        let attempts = 0;
        do {
          target = Math.floor(random() * n);
          attempts += 1;
        } while ((target === i || edges.has(`${Math.min(i, target)},${Math.max(i, target)}`)) && attempts < 64);
      }
      addEdge(edges, i, target);
    }
  }
  return normalizeGraphSpec({
    id: id ?? `ws-n${n}-k${halfDegree * 2}-p${p}-s${seed}`,
    family: 'ws',
    nodeCount: n,
    targetAvgDegree: halfDegree * 2,
    rewiringProbability: p,
    seed,
    edges: materializeEdges(edges),
  });
}

export function generateStochasticBlockModel({
  nodeCount,
  avgDegree,
  communities = 2,
  mixing = 0.12,
  seed = 1,
  id = null,
} = {}) {
  const n = clampInteger(nodeCount, 0, 1_000_000);
  const c = clampInteger(communities, 1, Math.max(1, n));
  const k = Math.min(Math.max(0, Number(avgDegree) || 0), Math.max(0, n - 1));
  const random = createPrng(seed);
  const labels = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) labels[i] = i % c;
  const samePairsApprox = c * ((n / c) * Math.max(0, (n / c) - 1) / 2);
  const totalPairs = n * Math.max(0, n - 1) / 2;
  const targetEdges = (n * k) / 2;
  const interWeight = Math.min(0.45, Math.max(0.01, Number(mixing) || 0.12));
  const intraP = samePairsApprox > 0 ? Math.min(1, (targetEdges * (1 - interWeight)) / samePairsApprox) : 0;
  const interPairs = Math.max(1, totalPairs - samePairsApprox);
  const interP = Math.min(1, (targetEdges * interWeight) / interPairs);
  const edges = new Set();
  if (n > 2000 && Math.max(intraP, interP) < 0.02) {
    const targetIntra = Math.round(targetEdges * (1 - interWeight));
    const targetInter = Math.round(targetEdges * interWeight);
    const groups = Array.from({ length: c }, () => []);
    for (let i = 0; i < n; i += 1) groups[labels[i]].push(i);
    let attempts = 0;
    while (edges.size < targetIntra && attempts < Math.max(256, targetIntra * 32)) {
      attempts += 1;
      const group = groups[Math.floor(random() * groups.length)];
      if (!group || group.length < 2) continue;
      const ai = Math.floor(random() * group.length);
      let bi = Math.floor(random() * (group.length - 1));
      if (bi >= ai) bi += 1;
      addEdge(edges, group[ai], group[bi]);
    }
    for (const edge of sampleRandomEdges({
      nodeCount: n,
      targetEdges: targetInter,
      random,
      accept: (source, targetNode) => labels[source] !== labels[targetNode],
      maxAttemptsFactor: 48,
    })) {
      edges.add(edge);
    }
  } else {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const p = labels[i] === labels[j] ? intraP : interP;
        if (random() <= p) addEdge(edges, i, j);
      }
    }
  }
  return normalizeGraphSpec({
    id: id ?? `sbm-n${n}-k${k}-c${c}-s${seed}`,
    family: 'sbm',
    nodeCount: n,
    targetAvgDegree: k,
    communityCount: c,
    seed,
    edges: materializeEdges(edges),
  });
}

export function createCalibrationSampleSpecs({ seeds = [1, 7], includeLarge = true } = {}) {
  const specs = [];
  const nodeCounts = includeLarge ? [5, 10, 100, 1000, 10000] : [5, 10, 100];
  const degreeTargets = [5, 10, 20, 50];
  for (const n of nodeCounts) {
    const usableDegrees = degreeTargets.filter((k) => k < n).slice(0, n <= 10 ? 2 : 4);
    for (const k of usableDegrees) {
      for (const seed of seeds) {
        if (specs.length % 2 === 0) specs.push(generateErdosRenyi({ nodeCount: n, avgDegree: k, seed }));
        specs.push(generateBarabasiAlbert({ nodeCount: n, avgDegree: k, seed }));
        if (n >= 10 && seed === seeds[0]) {
          for (const p of [0.01, 0.05, 0.2]) {
            specs.push(generateWattsStrogatz({ nodeCount: n, avgDegree: k, rewiringProbability: p, seed }));
          }
        }
      }
    }
    if (n >= 10) {
      for (const c of [2, 4, 10].filter((value) => value <= n)) {
        specs.push(generateStochasticBlockModel({ nodeCount: n, avgDegree: Math.min(10, n - 1), communities: c, seed: seeds[0] }));
      }
    }
  }
  return specs;
}

export function extractSpecFeatures(spec) {
  const normalized = normalizeGraphSpec(spec);
  const degree = new Float64Array(normalized.nodeCount);
  for (const [source, target] of normalized.edges) {
    degree[source] += 1;
    degree[target] += 1;
  }
  const avgDegree = normalized.nodeCount > 0 ? (2 * normalized.edgeCount) / normalized.nodeCount : 0;
  let sumSq = 0;
  let isolates = 0;
  for (const value of degree) {
    sumSq += value * value;
    if (value === 0) isolates += 1;
  }
  return {
    nodeCount: normalized.nodeCount,
    edgeCount: normalized.edgeCount,
    avgDegree,
    density: normalized.nodeCount > 1 ? (2 * normalized.edgeCount) / (normalized.nodeCount * (normalized.nodeCount - 1)) : 0,
    degreeVariance: normalized.nodeCount > 0 ? (sumSq / normalized.nodeCount) - (avgDegree * avgDegree) : 0,
    isolateFraction: normalized.nodeCount > 0 ? isolates / normalized.nodeCount : 0,
    communityCount: normalized.communityCount ?? 0,
    family: normalized.family ?? 'unknown',
  };
}
