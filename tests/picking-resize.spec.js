import { test, expect } from '@playwright/test';

async function waitForHelios(page) {
  await page.waitForFunction(() => Boolean(window.__helios?.ready), null, { timeout: 15_000 });
  await page.evaluate(async () => {
    await window.__helios.ready;
  });
}

async function computeFirstNodeHit(page) {
  return page.evaluate(async () => {
    const helios = window.__helios;
    const canvas = document.querySelector('canvas');
    if (!helios || !canvas) throw new Error('Missing helios/canvas');

    const tracker = helios.indexPickingTracker;
    if (!tracker) throw new Error('Missing indexPickingTracker');

    await tracker.render(
      { network: helios.network, timestamp: performance.now(), camera: helios.renderer?.camera },
      true,
    );
    const targets = tracker.lastTargets;
    if (!targets?.node) throw new Error('Missing picking targets');

    const pixels = await helios.renderer.device.readPixels(targets.node, {
      x: 0,
      y: 0,
      width: targets.node.width,
      height: targets.node.height,
    });
    const bytes = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels);
    const decode = (arr, offset) => (arr[offset] + (arr[offset + 1] << 8) + (arr[offset + 2] << 16) + (arr[offset + 3] << 24) - 1);

    let hit = null;
    for (let y = 0; y < targets.node.height; y += 1) {
      for (let x = 0; x < targets.node.width; x += 1) {
        const idx = (y * targets.node.width + x) * 4;
        const value = decode(bytes, idx);
        if (value >= 0) {
          hit = { x, y, value };
          break;
        }
      }
      if (hit) break;
    }
    if (!hit) throw new Error('No node pixels found in picking target');

    const rect = canvas.getBoundingClientRect();
    const size = helios.size ?? { width: rect.width, height: rect.height, devicePixelRatio: 1 };
    const pixelRatio = size.devicePixelRatio ?? 1;
    const scale = tracker.options?.resolutionScale ?? 1;
    const isWebGL = helios.renderer?.device?.type === 'webgl2';
    const localX = hit.x / (pixelRatio * scale);
    const localY = (isWebGL ? (targets.node.height - 1 - hit.y) : hit.y) / (pixelRatio * scale);

    return {
      expectedIndex: hit.value,
      clientX: rect.left + localX,
      clientY: rect.top + localY,
    };
  });
}

async function expectHoverIndexAt(page, clientX, clientY, expectedIndex) {
  await page.evaluate(() => {
    window.__lastHover = null;
    window.__helios.addEventListener('node:hover', (e) => {
      if (e?.detail?.state === 'in') {
        window.__lastHover = e.detail;
      }
    }, { once: false });
  });
  await page.mouse.move(clientX, clientY);
  await page.waitForFunction(
    (idx) => window.__lastHover?.index === idx,
    expectedIndex,
    { timeout: 10_000 },
  );
  const detail = await page.evaluate(() => window.__lastHover);
  expect(detail.index).toBe(expectedIndex);
}

test('node picking remains correct after resize', async ({ page }) => {
  const query = new URLSearchParams({
    nodes: '64',
    layout: 'none',
    mode: '2d',
    renderer: 'webgl',
    pickTest: '1',
  });
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto(`/tests/fixtures/resize-pick.html?${query.toString()}`);
  await waitForHelios(page);

  const before = await computeFirstNodeHit(page);
  await expectHoverIndexAt(page, before.clientX, before.clientY, before.expectedIndex);

  await page.setViewportSize({ width: 1100, height: 720 });
  await page.waitForTimeout(100);

  const after = await computeFirstNodeHit(page);
  await expectHoverIndexAt(page, after.clientX, after.clientY, after.expectedIndex);
});

