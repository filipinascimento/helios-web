import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

test.describe.configure({ timeout: 60000 });

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  }, null, { timeout: 60000 });
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

test.describe('basic example', () => {
  test('uses a rewired Watts-Strogatz default network', async ({ page }) => {
    await page.goto('/?renderer=webgl');

    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.error ?? null).toBeNull();

    const syntheticDataset = await page.waitForFunction(() => {
      const dataset = window.__HELIOS_SYNTHETIC_DATASET__;
      return dataset?.model === 'watts-strogatz' && dataset.summary ? dataset : null;
    }, null, { timeout: 60000 }).then((handle) => handle.jsonValue());

    expect(syntheticDataset.rewiringProbability).toBe(0.01);
    expect(syntheticDataset.summary.nodeCount).toBe(10000);
    expect(syntheticDataset.summary.edgeCount).toBe(20000);
    expect(syntheticDataset.summary.neighborLevel).toBe(2);
    expect(syntheticDataset.summary.shortcutEdges).toBe(200);
    expect(syntheticDataset.summary.expectedShortcutEdges).toBe(200);
    expect(syntheticDataset.summary.localEdges).toBe(19800);
  });

  test('renders nodes with non-empty pixels', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&nodes=600');

    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.nodeCount).toBeGreaterThan(0);
    expect(diagnostics.edgeCount).toBeGreaterThan(0);
    expect(diagnostics.renderer.toLowerCase()).toContain('webgl');
    expect(diagnostics.error ?? null).toBeNull();

    await page.waitForTimeout(750);

    const screenshot = await page.locator('canvas').first().screenshot({
      animations: 'disabled',
      timeout: 30000,
    });
    const png = await parseScreenshot(screenshot);
    let nonBackground = 0;
    const total = (png.width ?? 0) * (png.height ?? 0);
    const threshold = 10;
    for (let i = 0; i < png.data.length; i += 4) {
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (r > threshold || g > threshold || b > threshold) {
        nonBackground += 1;
      }
    }

    expect(total).toBeGreaterThan(0);
    expect(nonBackground).toBeGreaterThan(500);
    expect(total).toBeGreaterThan(nonBackground);
  });
});
