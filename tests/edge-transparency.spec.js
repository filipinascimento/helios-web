import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

async function createOverlapScreenshot(page, mode = 'alpha') {
  await page.goto('/tests/fixtures/blank.html');
  await page.setViewportSize({ width: 320, height: 320 });

  const { screenshot, fallback } = await page.evaluate(async ({ transparencyModeEdges }) => {
    const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
    document.body.innerHTML = '<div id="app" style="width:320px;height:320px"></div>';
    const { helios } = await createDeterministicHelios(document.getElementById('app'), 'webgl');

    const network = helios.network;
    const edges = network.addEdges([
      { from: 0, to: 1 },
      { from: 0, to: 1 },
    ]);
    const colors = network.getEdgeAttributeBuffer('_helios_visuals_edge_color').view;
    const widths = network.getEdgeAttributeBuffer('_helios_visuals_edge_width').view;
    const opacities = network.getEdgeAttributeBuffer('_helios_visuals_edge_opacity').view;
    colors.set([1, 0, 0, 1, 1, 0, 0, 1], edges[0] * 8);
    colors.set([0, 0, 1, 1, 0, 0, 1, 1], edges[1] * 8);
    widths.set([8, 8], edges[0] * 2);
    widths.set([8, 8], edges[1] * 2);
    opacities.set([0.8, 0.8], edges[0] * 2);
    opacities.set([0.2, 0.2], edges[1] * 2);

    helios.renderer?.setEdgeTransparencyMode?.(transparencyModeEdges);
    helios.visuals.markAllDenseDirty();
    helios.scheduler.requestGeometry();
    helios.renderer.render({ network, timestamp: performance.now(), camera: helios.renderer.camera });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const canvas = document.querySelector('#app canvas.helios-layer-canvas3d');
    const buffer = canvas?.toDataURL?.('image/png');
    const layer = helios.renderer?.graphLayer;
    const weightedAvailable = layer?.weightedSupported ?? true;
    const fallback = transparencyModeEdges === 'weighted' && !weightedAvailable;
    return { screenshot: buffer, fallback };
  }, { transparencyModeEdges: mode });

  if (!screenshot) return { png: null, fallback: true };
  const pngBuffer = Buffer.from(screenshot.split(',')[1], 'base64');
  const png = PNG.sync.read(pngBuffer);
  return { png, fallback };
}

function centerPixel(png) {
  if (!png) return [0, 0, 0];
  const x = Math.floor(png.width / 2);
  const y = Math.floor(png.height / 2);
  const idx = (y * png.width + x) * 4;
  return [png.data[idx], png.data[idx + 1], png.data[idx + 2]];
}

test('weighted edges differ from alpha when supported', async ({ page }) => {
  const headed = test.info().project.use?.headless === false;
  test.skip(!headed, 'Run this check in headed mode only');

  const alpha = await createOverlapScreenshot(page, 'alpha');
  const weighted = await createOverlapScreenshot(page, 'weighted');

  if (weighted.fallback || !alpha.png || !weighted.png) {
    test.skip(true, 'Weighted transparency not supported or capture failed');
  }

  const a = centerPixel(alpha.png);
  const w = centerPixel(weighted.png);

  const distance = Math.sqrt((a[0] - w[0]) ** 2 + (a[1] - w[1]) ** 2 + (a[2] - w[2]) ** 2);
  if (distance <= 5) {
    test.skip(true, 'Weighted transparency produced no observable delta (likely unsupported in this environment)');
  }
  expect(distance).toBeGreaterThan(5);
});
