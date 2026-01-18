import { test, expect } from '@playwright/test';

async function runOutlineColorVisualCheck(page, renderer) {
  await page.goto('/tests/fixtures/blank.html');

  const result = await page.evaluate(async (rendererName) => {
    document.body.innerHTML = '<div id="app" style="width:320px;height:320px;"></div>';
    const container = document.getElementById('app');

    const { createOutlineColorHelios } = await import('/src/tests/outlineColorScene.js');
    const { helios } = await createOutlineColorHelios(container, rendererName);

    // Make sure we're using the per-node outline buffers.
    helios.nodeOutlineUseAttributes?.(true);

    // Remove edges, and keep alpha stable.
    if (helios.renderer?.graphLayer) {
      helios.renderer.graphLayer.edgeOpacityBase = 0;
      helios.renderer.graphLayer.edgeOpacityScale = 0;

      helios.renderer.graphLayer.nodeOpacityBase = 0;
      helios.renderer.graphLayer.nodeOpacityScale = 1;

      helios.renderer.graphLayer.nodeSizeBase = 0;
      helios.renderer.graphLayer.nodeSizeScale = 1;

      // Outline width in pixels: base + scale * outlineRaw
      helios.renderer.graphLayer.nodeOutlineWidthBase = 0;
      helios.renderer.graphLayer.nodeOutlineWidthScale = 14;

      // Global outline color should not matter when attributes are enabled.
      helios.renderer.graphLayer.nodeOutlineColor = [0, 0, 0, 1];
    }

    helios.renderer?.camera?.setTarget?.([0, 0, 0]);
    helios.renderer?.camera?.setMode?.('2d');

    const size = helios.renderer?.size ?? { width: 320, height: 320 };
    const mainWidth = size.width || 320;
    const mainHeight = size.height || 320;
    const offscreen = helios.renderer?.createFramebuffer?.(mainWidth, mainHeight) ?? null;
    if (offscreen && helios.renderer?.setRenderTarget) {
      helios.renderer.setRenderTarget(offscreen);
    }

    const renderMain = async () => {
      await helios.prewarm?.({ updateDenseBuffers: true });
      helios.renderer.render({ network: helios.network, camera: helios.renderer.camera, timestamp: performance.now() });
    };

    const isWebGPU = helios.renderer?.device?.type === 'webgpu';
    const countHits = (pixels, targetRgb, tolerance) => {
      let hits = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        // WebGPU readback is typically BGRA8; WebGL is RGBA8.
        const r = pixels[i + (isWebGPU ? 2 : 0)] ?? 0;
        const g = pixels[i + 1] ?? 0;
        const b = pixels[i + (isWebGPU ? 0 : 2)] ?? 0;
        const dr = r - targetRgb[0];
        const dg = g - targetRgb[1];
        const db = b - targetRgb[2];
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist < tolerance) hits += 1;
      }
      return hits;
    };

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await renderMain();

    let denseOutlineColors = null;
    let denseNodeIndices = null;
    try {
      helios.network.updateDenseNodeAttributeBuffer?.('_helios_visuals_outline_color');
      helios.network.updateDenseNodeIndexBuffer?.();
      helios.network.withBufferAccess(() => {
        denseOutlineColors = Array.from(
          helios.network.getDenseNodeAttributeView?.('_helios_visuals_outline_color')?.view?.slice(0, 16) ?? [],
        );
        denseNodeIndices = Array.from(
          helios.network.getDenseNodeIndexView?.()?.view?.slice(0, 8) ?? [],
        );
      });
    } catch (_) {
      // ignore
    }

    const bytes = await helios.renderer.readPixels(offscreen, { x: 0, y: 0, width: mainWidth, height: mainHeight });
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

    let nonBackground = 0;
    let maxR = 0;
    let maxG = 0;
    let maxB = 0;
    for (let i = 0; i < arr.length; i += 4) {
      const r = arr[i + (isWebGPU ? 2 : 0)] ?? 0;
      const g = arr[i + 1] ?? 0;
      const b = arr[i + (isWebGPU ? 0 : 2)] ?? 0;
      if (r > maxR) maxR = r;
      if (g > maxG) maxG = g;
      if (b > maxB) maxB = b;
      if (r > 10 || g > 10 || b > 10) nonBackground += 1;
    }

    const tolerance = 55;
    const redHits = countHits(arr, [255, 0, 0], tolerance);
    const greenHits = countHits(arr, [0, 255, 0], tolerance);

    return {
      ok: true,
      device: helios.renderer?.device?.type ?? null,
      redHits,
      greenHits,
      nonBackground,
      maxR,
      maxG,
      maxB,
      denseOutlineColors,
      denseNodeIndices,
      mainWidth,
      mainHeight,
    };
  }, renderer);

  expect(result.ok).toBe(true);
  expect(result.nonBackground, JSON.stringify(result, null, 2)).toBeGreaterThan(200);
  // The outline ring should contribute a non-trivial amount of pixels for each color.
  expect(result.redHits, JSON.stringify(result, null, 2)).toBeGreaterThan(120);
  expect(result.greenHits, JSON.stringify(result, null, 2)).toBeGreaterThan(120);
}

test('per-node outlineColor renders in WebGL', async ({ page }) => {
  await runOutlineColorVisualCheck(page, 'webgl');
});

test('@webgpu per-node outlineColor renders in WebGPU', async ({ page }) => {
  await page.goto('/tests/fixtures/blank.html');
  const supported = await page.evaluate(async () => {
    if (!navigator.gpu) return false;
    const adapter = await navigator.gpu.requestAdapter();
    return Boolean(adapter);
  });
  test.skip(!supported, 'WebGPU not available in browser');

  await runOutlineColorVisualCheck(page, 'webgpu');
});
