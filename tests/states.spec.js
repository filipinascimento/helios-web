import { test, expect } from '@playwright/test';

async function runStateVisualCheck(page, renderer) {
  await page.goto(`/tests/fixtures/standalone-pick.html?renderer=${renderer}`);
  await page.waitForFunction(() => window.__helios || window.__heliosError, { timeout: 5000 });
  const error = await page.evaluate(() => window.__heliosError ?? null);
  if (error) throw new Error(`fixture failed: ${error}`);

  const result = await page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios?.renderer?.readPixels) return { ok: false, reason: 'missing helios/renderer' };

    const canvas = document.querySelector('canvas');
    const mainWidth = canvas?.width ?? 320;
    const mainHeight = canvas?.height ?? 240;
    const isWebGL = helios.renderer?.device?.type === 'webgl2';
    const offscreen = helios.renderer?.createFramebuffer?.(mainWidth, mainHeight) ?? null;
    if (offscreen && helios.renderer?.setRenderTarget) {
      helios.renderer.setRenderTarget(offscreen);
    }

    const decodeIndex = (bytes, offset = 0) => {
      const r = bytes[offset] ?? 0;
      const g = bytes[offset + 1] ?? 0;
      const b = bytes[offset + 2] ?? 0;
      const a = bytes[offset + 3] ?? 0;
      return r + (g << 8) + (b << 16) + (a << 24) - 1;
    };

    const renderMain = async () => {
      await helios.prewarm?.();
      // Remove edge contribution so the assertions validate node state styling specifically.
      if (helios.renderer?.graphLayer) {
        helios.renderer.graphLayer.edgeOpacityBase = 0;
        helios.renderer.graphLayer.edgeOpacityScale = 0;
      }
      helios.renderer.render({ network: helios.network, camera: helios.renderer.camera });
    };

    const readMaxGreen = async () => {
      const bytes = await helios.renderer.readPixels(offscreen, { x: 0, y: 0, width: mainWidth, height: mainHeight });
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      let maxG = 0;
      for (let i = 0; i < arr.length; i += 4) {
        const g = arr[i + 1] ?? 0;
        if (g > maxG) maxG = g;
      }
      return maxG;
    };

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await renderMain();
    const beforeMaxGreen = await readMaxGreen();

    helios.resetStateStyles();
    // Slot 2 (HIGHLIGHTED): force green tint on node 0.
    helios.nodeStateStyle(2, { opacityMul: 2, colorMul: [0, 0, 0, 1], colorAdd: [0, 1, 0, 0] });
    helios.nodeState([0], helios.constructor.STATES.HIGHLIGHTED, { mode: 'replace' });
    await renderMain();

    const afterSlot2MaxGreen = await readMaxGreen();

    // Slot 3 (custom): force green tint on node 1.
    helios.resetStateStyles();
    helios.nodeState([0, 1], 0, { mode: 'replace' });
    helios.nodeStateStyle(3, { opacityMul: 2, colorMul: [0, 0, 0, 1], colorAdd: [0, 1, 0, 0] });
    helios.nodeState([1], 1 << 3, { mode: 'replace' });
    await renderMain();
    const afterSlot3MaxGreen = await readMaxGreen();

    return {
      ok: true,
      beforeMaxGreen,
      afterSlot2MaxGreen,
      afterSlot3MaxGreen,
      mainWidth,
      mainHeight,
      device: helios.renderer?.device?.type ?? null,
    };
  });

  expect(result.ok).toBe(true);
  expect(result.afterSlot2MaxGreen).toBeGreaterThan(result.beforeMaxGreen);
  expect(result.afterSlot3MaxGreen).toBeGreaterThan(result.beforeMaxGreen);
}

async function runNoStateVisualCheck(page, renderer) {
  await page.goto(`/tests/fixtures/standalone-pick.html?renderer=${renderer}`);
  await page.waitForFunction(() => window.__helios || window.__heliosError, { timeout: 5000 });
  const error = await page.evaluate(() => window.__heliosError ?? null);
  if (error) throw new Error(`fixture failed: ${error}`);

  const result = await page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios?.renderer?.readPixels) return { ok: false, reason: 'missing helios/renderer' };

    const canvas = document.querySelector('canvas');
    const mainWidth = canvas?.width ?? 320;
    const mainHeight = canvas?.height ?? 240;
    const offscreen = helios.renderer?.createFramebuffer?.(mainWidth, mainHeight) ?? null;
    if (offscreen && helios.renderer?.setRenderTarget) {
      helios.renderer.setRenderTarget(offscreen);
    }

    const renderMain = async () => {
      await helios.prewarm?.();
      helios.renderer.render({ network: helios.network, camera: helios.renderer.camera });
    };

    const readStats = async () => {
      const bytes = await helios.renderer.readPixels(offscreen, { x: 0, y: 0, width: mainWidth, height: mainHeight });
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      let sumG = 0;
      let brightCount = 0;
      const threshold = 30; // background is ~#111; pixels above this are likely rendered content.
      for (let i = 0; i < arr.length; i += 4) {
        const r = arr[i] ?? 0;
        const g = arr[i + 1] ?? 0;
        const b = arr[i + 2] ?? 0;
        sumG += g;
        if (r > threshold || g > threshold || b > threshold) brightCount += 1;
      }
      const pixelCount = Math.max(1, arr.length / 4);
      return { meanG: sumG / pixelCount, brightCount };
    };

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await renderMain();
    const before = await readStats();

    helios.resetStateStyles();
    helios.nodeNoStateStyle({ colorMul: [0, 0, 0, 1], colorAdd: [0, 1, 0, 0] });
    helios.edgeNoStateStyle({ colorMul: [0, 0, 0, 1], colorAdd: [0, 1, 0, 0] });
    await renderMain();
    const afterStyle = await readStats();

    helios.nodeNoStateStyle({ discard: true });
    helios.edgeNoStateStyle({ discard: true });
    await renderMain();
    const afterDiscard = await readStats();

    return { ok: true, before, afterStyle, afterDiscard };
  });

  expect(result.ok).toBe(true);
  expect(result.before.brightCount).toBeGreaterThan(50);
  expect(result.afterStyle.meanG).toBeGreaterThan(result.before.meanG);
  expect(result.afterDiscard.brightCount).toBeLessThan(result.before.brightCount * 0.1);
}

test('state styling affects WebGL rendering', async ({ page }) => {
  await runStateVisualCheck(page, 'webgl');
});

test('no-state styling + discard affects WebGL rendering', async ({ page }) => {
  await runNoStateVisualCheck(page, 'webgl');
});

test('@webgpu state styling affects WebGPU rendering', async ({ page }) => {
  await page.goto('/tests/fixtures/blank.html');
  const supported = await page.evaluate(async () => {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  });
  test.skip(!supported, 'WebGPU not available in browser');
  await runStateVisualCheck(page, 'webgpu');
});

test('@webgpu no-state styling + discard affects WebGPU rendering', async ({ page }) => {
  await page.goto('/tests/fixtures/blank.html');
  const supported = await page.evaluate(async () => {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  });
  test.skip(!supported, 'WebGPU not available in browser');
  await runNoStateVisualCheck(page, 'webgpu');
});
