import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

function parseScreenshot(buffer) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

test.describe('network load/save', () => {
  test('round-trips via XNET and replaces the network in-place', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=64');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.nodeCount).toBeGreaterThan(10);

    const result = await page.evaluate(async () => {
      const helios = window.__helios;
      const before = { nodes: helios.network.nodeCount, edges: helios.network.edgeCount };

      const xnetBlob = await helios.saveNetwork('xnet', { output: 'blob' });
      const xnetText = await xnetBlob.text();

      await helios.loadNetwork(xnetBlob, { format: 'xnet', disposeOld: true, recreateRenderer: true });

      const after = { nodes: helios.network.nodeCount, edges: helios.network.edgeCount };
      let colorSum = 0;
      helios.network.withBufferAccess(() => {
        const nodeColors = helios.network.getNodeAttributeBuffer('_helios_visuals_color')?.view ?? null;
        colorSum = nodeColors
          ? Array.from(nodeColors.slice(0, Math.min(nodeColors.length, 256))).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
          : 0;
      });
      const targets = await helios.renderAttributeTracking?.();
      const bxnetBlob = await helios.saveNetwork('bxnet', { output: 'blob' });

      return {
        before,
        after,
        xnetHeader: xnetText.slice(0, 16),
        colorSum,
        hasTargets: Boolean(targets),
        bxnetSize: bxnetBlob.size,
      };
    });

    expect(result.xnetHeader).toContain('#XNET');
    expect(result.after.nodes).toBe(result.before.nodes);
    expect(result.after.edges).toBe(result.before.edges);
    expect(result.colorSum).toBeGreaterThan(0);
    expect(result.hasTargets).toBe(true);
    expect(result.bxnetSize).toBeGreaterThan(16);
  });

  test('still renders pixels after replacing the network', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=600');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.nodeCount).toBeGreaterThan(100);
    expect(diagnostics.renderer.toLowerCase()).toContain('webgl');

    await page.waitForTimeout(500);
    const beforeScreenshot = await page.screenshot({ fullPage: false });

    await page.evaluate(async () => {
      const helios = window.__helios;
      const xnetBlob = await helios.saveNetwork('xnet', { output: 'blob' });
      await helios.loadNetwork(xnetBlob, { format: 'xnet', disposeOld: true, recreateRenderer: true });
      helios.requestRender?.();
    });

    await page.waitForTimeout(750);
    const afterScreenshot = await page.screenshot({ fullPage: false });

    const countNonBackground = async (buffer) => {
      const png = await parseScreenshot(buffer);
      let nonBackground = 0;
      const threshold = 10;
      for (let i = 0; i < png.data.length; i += 4) {
        const r = png.data[i];
        const g = png.data[i + 1];
        const b = png.data[i + 2];
        if (r > threshold || g > threshold || b > threshold) nonBackground += 1;
      }
      return nonBackground;
    };

    const beforeNonBackground = await countNonBackground(beforeScreenshot);
    const afterNonBackground = await countNonBackground(afterScreenshot);

    expect(beforeNonBackground).toBeGreaterThan(500);
    expect(afterNonBackground).toBeGreaterThan(500);
  });

  test('frames the camera when loading a differently-scaled network', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    await page.evaluate(async () => {
      const helios = window.__helios;
      const network = helios.network;
      network.withBufferAccess(() => {
        const active = network.nodeIndices || [];
        const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
        for (let i = 0; i < active.length; i += 1) {
          const id = active[i];
          const o = id * 3;
          pos[o] = pos[o] * 1e6 + 5e6;
          pos[o + 1] = pos[o + 1] * 1e6 - 5e6;
          pos[o + 2] = 0;
        }
        network.bumpNodeAttributeVersion?.('_helios_visuals_position');
      });
      const blob = await helios.saveNetwork('xnet', { output: 'blob' });
      await helios.loadNetwork(blob, { format: 'xnet', disposeOld: true, recreateRenderer: true, keepCamera: false });
    });

    await page.waitForTimeout(750);
    const screenshot = await page.screenshot({ fullPage: false });
    const png = await parseScreenshot(screenshot);
    let nonBackground = 0;
    const threshold = 10;
    for (let i = 0; i < png.data.length; i += 4) {
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (r > threshold || g > threshold || b > threshold) nonBackground += 1;
    }
    expect(nonBackground).toBeGreaterThan(500);
  });
});
