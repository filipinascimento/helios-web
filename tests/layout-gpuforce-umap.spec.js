import { test, expect } from '@playwright/test';

test('dataset=umap aliases to the closest exported UMAP graph @webgpu', async ({ page }, testInfo) => {
  test.setTimeout(120000);

  await page.goto('/?nodes=240&mode=2d&renderer=webgpu&layout=gpuforce&dataset=umap');
  await page.waitForFunction(() => window.__HELIOS_DIAGNOSTICS__?.ready === true);
  await page.waitForFunction(() => window.__HELIOS_DIAGNOSTICS__?.datasetInfo?.resolvedNodeCount === 200);
  await page.waitForTimeout(2500);

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
      syntheticDataset: window.__HELIOS_SYNTHETIC_DATASET__ ?? null,
      nodeCount: network?.nodeCount ?? 0,
      edgeCount: network?.edgeCount ?? 0,
      positions: positions ?? networkPositions,
      clusters,
    };
  });

  await testInfo.attach('layout-gpuforce-umap-alias', {
    body: JSON.stringify({ ...payload, positions: undefined, clusters: undefined }, null, 2),
    contentType: 'application/json',
  });

  expect(payload.datasetInfo?.name).toBe('umap-export');
  expect(payload.datasetInfo?.source).toBe('exported');
  expect(payload.datasetInfo?.requestedNodeCount).toBe(240);
  expect(payload.datasetInfo?.resolvedNodeCount).toBe(200);
  expect(payload.datasetInfo?.label).toBe('gaussian-200');
  expect(payload.syntheticDataset).toBeNull();
  expect(payload.nodeCount).toBe(200);
  expect(payload.edgeCount).toBeGreaterThan(200);
  expect(payload.source).toBe('delegate');
  expect(payload.forceModel).toBe('umap');
  expect(payload.edgeWeightAttribute).toBe('umap_weight');
  expect(payload.nodeMassAttribute).toBe('umap_mass');
});
