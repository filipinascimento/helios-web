import { test, expect } from '@playwright/test';

function computeMetrics(payload) {
  const { positions, edgeIndices, edges } = payload;
  const n = Math.floor((positions?.length ?? 0) / 3);
  const coords = new Array(n);
  for (let i = 0; i < n; i += 1) {
    coords[i] = [positions[i * 3], positions[i * 3 + 1]];
  }

  const neighbors = Array.from({ length: n }, () => new Set());
  const edgeLens = [];
  for (let i = 0; i < edgeIndices.length; i += 1) {
    const edgeId = edgeIndices[i] * 2;
    const a = edges[edgeId];
    const b = edges[edgeId + 1];
    if (a >= n || b >= n || a === b) continue;
    neighbors[a].add(b);
    neighbors[b].add(a);
    const dx = coords[a][0] - coords[b][0];
    const dy = coords[a][1] - coords[b][1];
    edgeLens.push(Math.hypot(dx, dy));
  }

  let seed = 0x12345678;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const randomLens = [];
  for (let i = 0; i < Math.min(edgeLens.length, 3000); i += 1) {
    const a = Math.floor(rand() * n);
    let b = Math.floor(rand() * n);
    if (b === a) b = (b + 1) % n;
    const dx = coords[a][0] - coords[b][0];
    const dy = coords[a][1] - coords[b][1];
    randomLens.push(Math.hypot(dx, dy));
  }

  const mean = (arr) => arr.reduce((sum, value) => sum + value, 0) / Math.max(1, arr.length);

  const k = 8;
  let localityHits = 0;
  let localityDen = 0;
  for (let i = 0; i < n; i += 1) {
    const [ix, iy] = coords[i];
    const dists = [];
    for (let j = 0; j < n; j += 1) {
      if (j === i) continue;
      const dx = ix - coords[j][0];
      const dy = iy - coords[j][1];
      dists.push([dx * dx + dy * dy, j]);
    }
    dists.sort((a, b) => a[0] - b[0]);
    const count = Math.min(k, dists.length);
    for (let t = 0; t < count; t += 1) {
      if (neighbors[i].has(dists[t][1])) localityHits += 1;
    }
    localityDen += count;
  }

  return {
    edgeMean: mean(edgeLens),
    edgeToRandomRatio: mean(edgeLens) / Math.max(1e-9, mean(randomLens)),
    localityAt8: localityHits / Math.max(1, localityDen),
  };
}

async function collectLayoutStats(page, layout) {
  await page.addInitScript((seed) => {
    let x = (seed >>> 0) || 1;
    Math.random = () => {
      x = (x * 1664525 + 1013904223) >>> 0;
      return x / 0x100000000;
    };
  }, 101);

  await page.goto(`/?nodes=500&mode=2d&renderer=webgpu&layout=${layout}`);
  await page.waitForFunction(() => window.__HELIOS_DIAGNOSTICS__?.ready === true);
  await page.waitForTimeout(5000);

  const payload = await page.evaluate(async () => {
    const helios = window.__helios;
    const network = helios?.network;
    if (!helios || !network) {
      return null;
    }

    let delegate = await helios.snapshotDelegatePositions?.();
    if (!(delegate instanceof Float32Array) || delegate.length <= 0) {
      delegate = null;
    }

    const edgeIndices = network.edgeIndices instanceof Uint32Array
      ? new Uint32Array(network.edgeIndices)
      : new Uint32Array(0);
    const edges = network.edgesView instanceof Uint32Array
      ? new Uint32Array(network.edgesView)
      : new Uint32Array(0);

    let networkPositions = null;
    network.withBufferAccess(() => {
      const view = network.getNodeAttributeBuffer('_helios_visuals_position')?.view;
      if (view) {
        networkPositions = new Float32Array(view);
      }
    });

    return {
      source: helios.positions?.()?.source ?? null,
      used: delegate ? 'delegate' : 'network',
      positions: delegate ?? networkPositions,
      edgeIndices,
      edges,
    };
  });

  return {
    source: payload.source,
    used: payload.used,
    ...computeMetrics(payload),
  };
}

test('gpu-force converges to useful locality within 5s @webgpu', async ({ browser }, testInfo) => {
  test.setTimeout(120000);

  const d3Page = await browser.newPage();
  const d3 = await collectLayoutStats(d3Page, 'd3force3d');
  await d3Page.close();

  const gpuPage = await browser.newPage();
  const gpu = await collectLayoutStats(gpuPage, 'gpuforce');
  await gpuPage.close();

  await testInfo.attach('layout-gpuforce-metrics', {
    body: JSON.stringify({ d3, gpu }, null, 2),
    contentType: 'application/json',
  });

  expect(gpu.source).toBe('delegate');
  expect(gpu.used).toBe('delegate');

  // Absolute quality floors for the default GPU-force profile.
  expect(gpu.edgeToRandomRatio).toBeLessThan(0.24);
  expect(gpu.localityAt8).toBeGreaterThan(0.16);

  // Relative guardrails against major regressions versus d3-force-3d.
  expect(gpu.edgeMean).toBeGreaterThanOrEqual(d3.edgeMean * 0.65);
  expect(gpu.edgeMean).toBeLessThanOrEqual(d3.edgeMean * 1.35);
  expect(gpu.edgeToRandomRatio).toBeLessThanOrEqual(d3.edgeToRandomRatio * 1.4 + 0.03);
  expect(gpu.localityAt8).toBeGreaterThanOrEqual(d3.localityAt8 * 0.6);
});
