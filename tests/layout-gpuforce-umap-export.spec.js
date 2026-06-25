import { test, expect } from '@playwright/test';

function sampleClusterIndices(clusters, maxTotal = 512, maxPerCluster = 64) {
  const groups = new Map();
  for (let i = 0; i < clusters.length; i += 1) {
    const clusterId = clusters[i];
    const entries = groups.get(clusterId) ?? [];
    entries.push(i);
    groups.set(clusterId, entries);
  }

  const clusterIds = Array.from(groups.keys()).sort((a, b) => Number(a) - Number(b));
  const perClusterQuota = Math.max(1, Math.floor(maxTotal / Math.max(1, clusterIds.length)));
  const sampled = [];
  for (const clusterId of clusterIds) {
    const entries = groups.get(clusterId) ?? [];
    const count = Math.min(entries.length, maxPerCluster, perClusterQuota);
    if (count >= entries.length) {
      sampled.push(...entries);
      continue;
    }
    for (let i = 0; i < count; i += 1) {
      const pick = Math.min(entries.length - 1, Math.floor(((i + 0.5) * entries.length) / count));
      sampled.push(entries[pick]);
    }
  }
  return sampled;
}

function computeClusterMetrics(payload) {
  const { positions, clusters } = payload;
  const nodeCount = Math.floor((positions?.length ?? 0) / 3);
  const sampledIndices = sampleClusterIndices(clusters ?? [], 512, 64);
  const coords = new Array(sampledIndices.length);
  for (let i = 0; i < sampledIndices.length; i += 1) {
    const nodeIndex = sampledIndices[i];
    coords[i] = [positions[nodeIndex * 3], positions[(nodeIndex * 3) + 1]];
  }

  const k = Math.min(12, Math.max(1, sampledIndices.length - 1));
  let sameClusterHits = 0;
  let sameClusterTotal = 0;
  for (let i = 0; i < sampledIndices.length; i += 1) {
    const distances = [];
    const [ix, iy] = coords[i];
    for (let j = 0; j < sampledIndices.length; j += 1) {
      if (i === j) continue;
      const dx = ix - coords[j][0];
      const dy = iy - coords[j][1];
      distances.push([dx * dx + dy * dy, j]);
    }
    distances.sort((a, b) => a[0] - b[0]);
    for (let neighbor = 0; neighbor < k; neighbor += 1) {
      sameClusterTotal += 1;
      if (clusters[sampledIndices[i]] === clusters[sampledIndices[distances[neighbor][1]]]) {
        sameClusterHits += 1;
      }
    }
  }

  const centroids = new Map();
  for (let i = 0; i < nodeCount; i += 1) {
    const cluster = clusters[i];
    const entry = centroids.get(cluster) ?? { x: 0, y: 0, count: 0 };
    entry.x += positions[i * 3];
    entry.y += positions[(i * 3) + 1];
    entry.count += 1;
    centroids.set(cluster, entry);
  }
  const centroidList = Array.from(centroids.values()).map((entry) => ({
    x: entry.x / Math.max(1, entry.count),
    y: entry.y / Math.max(1, entry.count),
  }));
  let minCentroidDistance = Infinity;
  for (let i = 0; i < centroidList.length; i += 1) {
    for (let j = i + 1; j < centroidList.length; j += 1) {
      const dx = centroidList[i].x - centroidList[j].x;
      const dy = centroidList[i].y - centroidList[j].y;
      minCentroidDistance = Math.min(minCentroidDistance, Math.hypot(dx, dy));
    }
  }

  return {
    sameClusterPurityAt12: sameClusterHits / Math.max(1, sameClusterTotal),
    minCentroidDistance: Number.isFinite(minCentroidDistance) ? minCentroidDistance : 0,
  };
}

for (const testCase of [
  { nodeCount: 200, waitMs: 6000, minPurity: 0.1, minCentroidDistance: 0, label: 'gaussian-200' },
  { nodeCount: 2000, waitMs: 9000, minPurity: 0.18, minCentroidDistance: 20, label: 'gaussian-2000' },
  { nodeCount: 20000, waitMs: 14000, minPurity: 0.12, minCentroidDistance: 10, label: 'gaussian-20000' },
]) test(`gpu-force auto-runs UMAP force mode on a real exported HeliosUMAP graph (${testCase.nodeCount} nodes) @webgpu`, async ({ page }, testInfo) => {
  test.setTimeout(180000);

  await page.goto(`/?nodes=${testCase.nodeCount}&mode=2d&renderer=webgpu&layout=gpuforce&dataset=umap-export`);
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag?.ready === true;
  });
  await page.waitForFunction((expectedNodeCount) => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag?.datasetInfo?.resolvedNodeCount === expectedNodeCount;
  }, testCase.nodeCount);
  await page.waitForTimeout(testCase.waitMs);

  const payload = await page.evaluate(async () => {
    const helios = window.__helios;
    const network = helios?.network ?? null;
    const layout = typeof helios?.layout === 'function' ? helios.layout() : null;
    let positions = await helios?.snapshotDelegatePositions?.();
    if (!(positions instanceof Float32Array) || positions.length <= 0) {
      positions = null;
    }

    let clusters = null;
    let networkPositions = null;
    if (network && typeof network.withBufferAccess === 'function') {
      network.withBufferAccess(() => {
        const clusterBuffer = network.getNodeAttributeBuffer('test_cluster')?.view ?? null;
        const positionBuffer = network.getNodeAttributeBuffer('_helios_visuals_position')?.view ?? null;
        if (clusterBuffer) clusters = new Uint32Array(clusterBuffer);
        if (positionBuffer) networkPositions = new Float32Array(positionBuffer);
      });
    }

    return {
      source: helios?.positions?.()?.source ?? null,
      forceModel: layout?.options?.forceModel ?? null,
      edgeWeightAttribute: layout?.options?.edgeWeightAttribute ?? null,
      nodeMassAttribute: layout?.options?.nodeMassAttribute ?? null,
      datasetInfo: window.__HELIOS_DATASET_INFO__ ?? null,
      nodeCount: network?.nodeCount ?? 0,
      edgeCount: network?.edgeCount ?? 0,
      hasEmbeddingAttribute: network?.hasNodeAttribute?.('umap_embedding') === true,
      hasEmbeddedPositionMetadata: network?.getNetworkAttributeInfo?.('umap_position_attr') != null,
      positions: positions ?? networkPositions,
      clusters,
    };
  });

  const metrics = computeClusterMetrics(payload);
  await testInfo.attach('layout-gpuforce-umap-export-metrics', {
    body: JSON.stringify({ payload: { ...payload, positions: undefined, clusters: undefined }, metrics }, null, 2),
    contentType: 'application/json',
  });

  expect(payload.datasetInfo?.label).toBe(testCase.label);
  expect(payload.nodeCount).toBe(testCase.nodeCount);
  expect(payload.edgeCount).toBeGreaterThan(200);
  expect(payload.source).toBe('delegate');
  expect(payload.forceModel).toBe('umap');
  expect(payload.edgeWeightAttribute).toBe('umap_weight');
  expect(payload.nodeMassAttribute).toBe('umap_mass');
  expect(payload.hasEmbeddingAttribute).toBe(false);
  expect(payload.hasEmbeddedPositionMetadata).toBe(false);
  expect(metrics.sameClusterPurityAt12).toBeGreaterThan(testCase.minPurity);
  expect(metrics.minCentroidDistance).toBeGreaterThan(testCase.minCentroidDistance);
});
