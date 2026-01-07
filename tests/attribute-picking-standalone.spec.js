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
    if (!canvas || !helios) return { ok: false, reason: 'no canvas/helios' };
    await helios.renderAttributeTracking();
    const targets = helios.attributeTracker?.lastTargets;
    const decode = (bytes, offset = 0) => {
      const r = bytes[offset] ?? 0;
      const g = bytes[offset + 1] ?? 0;
      const b = bytes[offset + 2] ?? 0;
      const a = bytes[offset + 3] ?? 0;
      return r + (g << 8) + (b << 16) + (a << 24) - 1;
    };
    const uniqueFromTarget = async (target) => {
      if (!target || !helios.renderer?.readPixels) return [];
      const all = await helios.renderer.readPixels(target, { x: 0, y: 0, width: target.width, height: target.height });
      const bytes = all instanceof Uint8Array ? all : new Uint8Array(all);
      const ids = new Set();
      for (let i = 0; i < bytes.length; i += 4) {
        const value = decode(bytes, i);
        if (value >= 0) ids.add(value);
      }
      return Array.from(ids);
    };
    const nodeIds = await uniqueFromTarget(targets?.node);
    const edgeIds = await uniqueFromTarget(targets?.edge);
    const size = helios.size ?? helios.renderer?.size ?? { width: 1, height: 1, devicePixelRatio: 1 };
    const pixelRatio = size.devicePixelRatio ?? 1;
    const scale = helios.attributeTracker?.options?.resolutionScale ?? 1;

    const findFirstHit = async (target) => {
      if (!target || !helios.renderer?.readPixels) return null;
      const all = await helios.renderer.readPixels(target, { x: 0, y: 0, width: target.width, height: target.height });
      const bytes = all instanceof Uint8Array ? all : new Uint8Array(all);
      for (let y = 0; y < target.height; y += 1) {
        for (let x = 0; x < target.width; x += 1) {
          const idx = (y * target.width + x) * 4;
          const value = decode(bytes, idx);
          if (value >= 0) return { x, y, value };
        }
      }
      return null;
    };

	    const nodePixel = await findFirstHit(targets?.node);
	    const edgePixel = await findFirstHit(targets?.edge);
	    const isWebGL = helios.renderer?.device?.type === 'webgl2';
	    const nodePick = nodePixel
	      ? await helios.pickAttributesAt(
	        nodePixel.x / (pixelRatio * scale),
	        (isWebGL ? (targets.node.height - 1 - nodePixel.y) : nodePixel.y) / (pixelRatio * scale),
	      )
	      : null;
	    const edgePick = edgePixel
	      ? await helios.pickAttributesAt(
	        edgePixel.x / (pixelRatio * scale),
	        (isWebGL ? (targets.edge.height - 1 - edgePixel.y) : edgePixel.y) / (pixelRatio * scale),
	      )
	      : null;

    return {
      ok: true,
      nodeIds,
      edgeIds,
      nodePixel,
      edgePixel,
      nodePick,
      edgePick,
    };
  });
  if (!picked.ok) throw new Error(`Standalone pick failed early: ${JSON.stringify(picked)}`);
  expect(picked.nodeIds.length).toBeGreaterThan(0);
  expect(picked.edgeIds.length).toBeGreaterThan(0);
  expect(picked.nodePick?.node).toBe(picked.nodePixel?.value);
  expect(picked.edgePick?.edge).toBe(picked.edgePixel?.value);
});

async function expectDeterministicPick(page, renderer) {
  const url = `/tests/fixtures/standalone-pick.html?renderer=${renderer}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__helios || window.__heliosError, { timeout: 5000 });
  const support = await page.evaluate(() => Boolean(window.__helios) && (!window.__helios?.renderer || window.__helios.renderer.device));
  if (!support) {
    throw new Error('helios did not initialize');
  }
  const picks = await page.evaluate(async () => {
    const helios = window.__helios;
    await helios.renderAttributeTracking();
    const targets = helios.attributeTracker?.lastTargets;
    const readAll = async (target) => {
      if (!target || !helios.renderer?.readPixels) return [];
      const pixels = await helios.renderer.readPixels(target, {
        x: 0,
        y: 0,
        width: target.width,
        height: target.height,
      });
      const bytes = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels);
      const ids = new Set();
      for (let i = 0; i < bytes.length; i += 4) {
        const value = bytes[i] + (bytes[i + 1] << 8) + (bytes[i + 2] << 16) + (bytes[i + 3] << 24) - 1;
        if (value >= 0) ids.add(value);
      }
      return Array.from(ids);
    };
    const nodes = await readAll(targets?.node);
    const edges = await readAll(targets?.edge);
    return { nodes, edges };
  });
  expect(picks.nodes).toEqual(expect.arrayContaining([0, 1]));
  expect(picks.edges).toEqual(expect.arrayContaining([0]));
}

test('deterministic picking hits expected indices (webgl)', async ({ page }) => {
  await expectDeterministicPick(page, 'webgl');
});

test('deterministic picking hits expected indices (webgpu when available)', async ({ page }) => {
  await page.goto('/tests/fixtures/blank.html');
  const supported = await page.evaluate(async () => {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  });
  test.skip(!supported, 'WebGPU not available in browser');
  await expectDeterministicPick(page, 'webgpu');
});
