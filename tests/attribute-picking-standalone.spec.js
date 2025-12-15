import { test, expect } from '@playwright/test';

async function setupStandalone(page) {
  await page.goto('/tests/fixtures/standalone-pick.html');
}

test('standalone attribute picking returns node and edge indices', async ({ page }) => {
  page.on('console', (msg) => console.log('page log:', msg.type(), msg.text()));
  await setupStandalone(page);
  await page.waitForFunction(() => window.__helios || window.__heliosError, { timeout: 5000 });
  const readiness = await page.evaluate(async () => {
    if (!window.__helios) return { ok: false, reason: 'no helios', error: window.__heliosError };
    const result = await window.__helios.renderAttributeTracking();
    const targets = window.__helios?.attributeTracker?.lastTargets;
    return {
      ok: Boolean(result && targets),
      hasTargets: Boolean(targets),
      device: window.__helios.renderer?.device?.type ?? null,
      size: window.__helios.size,
      resultNull: result === null,
    };
  });
  if (!readiness.ok) {
    throw new Error(`Attribute targets missing: ${JSON.stringify(readiness)}`);
  }
  const picked = await page.evaluate(async () => {
    const canvas = document.querySelector('canvas');
    const helios = window.__helios;
    if (!canvas || !helios) return { nodeHit: { node: -1, edge: -1 }, edgeHit: { node: -1, edge: -1 }, hits: [] };
    await helios.renderAttributeTracking();
    const rect = canvas.getBoundingClientRect();
    const samples = [
      [0.5, 0.5],
      [0.4, 0.5],
      [0.6, 0.5],
      [0.5, 0.45],
      [0.5, 0.55],
    ];
    const hits = [];
    for (const [nx, ny] of samples) {
      const x = rect.width * nx;
      const y = rect.height * ny;
      const result = await helios.pickAttributesAt(x, y);
      hits.push(result ?? { node: -1, edge: -1 });
    }
    console.log('standalone hits', hits);
    const nodeHit = hits.find((h) => h.node >= 0) ?? hits[0];
    const edgeHit = hits.find((h) => h.edge >= 0) ?? hits[0];
    return { nodeHit, edgeHit, hits };
  });
  expect(picked.nodeHit.node).toBeGreaterThanOrEqual(0);
  expect(picked.edgeHit.edge).toBeGreaterThanOrEqual(0);
});
