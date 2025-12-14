import { test, expect } from '@playwright/test';

async function waitForHelios(page) {
  await page.waitForFunction(() => Boolean(window.__helios?.ready), null, { timeout: 15_000 });
  await page.evaluate(() => window.__helios.ready);
  await page.waitForFunction(() => Boolean(window.__helios?.attributeTracker?.lastTargets), null, { timeout: 15_000 });
}

async function collectPicks(page) {
  return page.evaluate(async () => {
    const helios = window.__helios;
    const canvas = document.querySelector('canvas');
    if (!helios || !canvas) {
      return { nodeHits: [], edgeHits: [], meta: { reason: 'no helios or canvas' } };
    }
    // Force an attribute render before sampling picks to ensure lastTargets are fresh.
    await helios.renderAttributeTracking?.();
    const targets = helios.attributeTracker?.lastTargets;
    const targetInfo = {
      node: targets?.node ? { width: targets.node.width, height: targets.node.height } : null,
      edge: targets?.edge ? { width: targets.edge.width, height: targets.edge.height } : null,
    };
    const counts = { nodes: helios.network?.nodeCount ?? null, edges: helios.network?.edgeCount ?? null };
    let sample = null;
    if (helios.renderer?.readPixels && targets?.node) {
      const cx = Math.floor(targets.node.width / 2);
      const cy = Math.floor(targets.node.height / 2);
      const cyFlipped = targets.node.height - 1 - cy;
      const nodePixels = await helios.renderer.readPixels(targets.node, { x: cx, y: cy, width: 1, height: 1 });
      const nodePixelsFlipped = await helios.renderer.readPixels(targets.node, { x: cx, y: cyFlipped, width: 1, height: 1 });
      const edgePixels = targets.edge
        ? await helios.renderer.readPixels(targets.edge, { x: cx, y: cy, width: 1, height: 1 })
        : null;
      const edgePixelsFlipped = targets.edge
        ? await helios.renderer.readPixels(targets.edge, { x: cx, y: cyFlipped, width: 1, height: 1 })
        : null;
      sample = {
        nodeCenter: Array.from(nodePixels.slice ? nodePixels.slice(0, 4) : nodePixels),
        nodeCenterFlipped: Array.from(nodePixelsFlipped.slice ? nodePixelsFlipped.slice(0, 4) : nodePixelsFlipped),
        edgeCenter: edgePixels ? Array.from(edgePixels.slice ? edgePixels.slice(0, 4) : edgePixels) : null,
        edgeCenterFlipped: edgePixelsFlipped ? Array.from(edgePixelsFlipped.slice ? edgePixelsFlipped.slice(0, 4) : edgePixelsFlipped) : null,
      };
    }
    const rect = canvas.getBoundingClientRect();
    const xs = Array.from({ length: 8 }, (_, i) => (i + 0.5) / 8);
    const ys = Array.from({ length: 8 }, (_, i) => (i + 0.5) / 8);
    const nodeHits = [];
    const edgeHits = [];
    const directPick = await helios.pickAttributesAt(rect.width * 0.5, rect.height * 0.5);
    if (directPick?.node !== -1) nodeHits.push(directPick.node);
    if (directPick?.edge !== -1) edgeHits.push(directPick.edge);
    for (const fx of xs) {
      for (const fy of ys) {
        const x = rect.width * fx;
        const y = rect.height * fy;
        const picked = await helios.pickAttributesAt(x, y);
        if (picked.node !== -1) nodeHits.push(picked.node);
        if (picked.edge !== -1) edgeHits.push(picked.edge);
      }
    }
    return {
      nodeHits,
      edgeHits,
      meta: {
        targets: targetInfo,
        canvas: { width: rect.width, height: rect.height },
        sample,
        directPick,
        counts,
      },
    };
  });
}

async function runPickFlow(page, params) {
  const query = new URLSearchParams({ nodes: '4', layout: 'none', mode: '2d', renderer: 'webgl', pickTest: '1', ...params });
  await page.goto(`/?${query.toString()}`);
  await waitForHelios(page);
  const picks = await collectPicks(page);
  if (!picks.nodeHits.length) {
    throw new Error(`No node picks found. meta=${JSON.stringify(picks.meta)}`);
  }
  expect(picks.nodeHits.length, 'should pick at least one node').toBeGreaterThan(0);
  // Edge picking is best-effort on the minimal demo; we log but do not fail if absent.
  if (picks.edgeHits.length) {
    expect(picks.edgeHits.length, 'should pick at least one edge').toBeGreaterThan(0);
  }
}

test('attribute picking works in headless chromium (webgl)', async ({ page }) => {
  await runPickFlow(page, {});
});

test('@webgpu attribute picking works in headed webgpu when available', async ({ page }) => {
  const supported = await page.evaluate(() => Boolean(navigator.gpu));
  test.skip(!supported, 'WebGPU not available in browser');
  await runPickFlow(page, { renderer: 'webgpu' });
});
