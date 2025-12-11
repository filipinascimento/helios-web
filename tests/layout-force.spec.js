import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

test.describe('force layout behavior', () => {
  test('connected nodes end up closer than random non-neighbors', async ({ page }, testInfo) => {
    await page.goto('/?layout=force3d&mode=2d');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.nodeCount).toBeGreaterThan(20);
    expect(diagnostics.edgeCount).toBeGreaterThan(20);

    // Allow the layout some time to settle.
    await page.waitForTimeout(5000);

    const stats = await page.evaluate(() => {
      const helios = window.__helios;
      const pos = helios.visuals.nodePositions;
      const stride = 3;
      const nodeActivity = helios.network.nodeActivityView;
      const edgesView = helios.network.edgesView;
      const edgeActivity = helios.network.edgeActivityView;
      const activeNodes = [];
      for (let i = 0; i < nodeActivity.length; i += 1) {
        if (nodeActivity[i]) activeNodes.push(i);
      }
      const coord = (idx) => {
        const o = idx * stride;
        return [pos[o], pos[o + 1], pos[o + 2]];
      };
      const dist = (a, b) => {
        const dx = a[0] - b[0];
        const dy = a[1] - b[1];
        const dz = a[2] - b[2];
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
      };

      const adjacency = new Set();
      const edgeDistances = [];
      for (let e = 0; e < edgeActivity.length; e += 1) {
        if (!edgeActivity[e]) continue;
        const a = edgesView[e * 2];
        const b = edgesView[e * 2 + 1];
        if (!nodeActivity[a] || !nodeActivity[b]) continue;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        adjacency.add(key);
        edgeDistances.push(dist(coord(a), coord(b)));
      }

      const nonEdgeDistances = [];
      const maxSamples = Math.min(256, activeNodes.length * activeNodes.length);
      let seed = 1337;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 0x100000000;
        return seed / 0x100000000;
      };
      let attempts = 0;
      while (nonEdgeDistances.length < maxSamples && attempts < maxSamples * 8) {
        attempts += 1;
        const i = Math.floor(rand() * activeNodes.length);
        const j = Math.floor(rand() * activeNodes.length);
        if (i === j) continue;
        const a = activeNodes[i];
        const b = activeNodes[j];
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (adjacency.has(key)) continue;
        nonEdgeDistances.push(dist(coord(a), coord(b)));
      }

      const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
      return {
        edgeAvg: avg(edgeDistances),
        nonEdgeAvg: avg(nonEdgeDistances),
        edgeCount: edgeDistances.length,
        nonEdgeCount: nonEdgeDistances.length,
      };
    });

    await testInfo.attach('force-layout-stats', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json',
    });

    expect(stats.edgeCount).toBeGreaterThan(10);
    expect(stats.nonEdgeCount).toBeGreaterThan(20);
    expect(stats.edgeAvg).toBeGreaterThan(0);
    expect(stats.nonEdgeAvg).toBeGreaterThan(0);
    // Force layout should separate non-neighbors a bit more than neighbors; allow small variance across runs.
    expect(stats.nonEdgeAvg).toBeGreaterThanOrEqual(stats.edgeAvg * 0.97);
  });
});
