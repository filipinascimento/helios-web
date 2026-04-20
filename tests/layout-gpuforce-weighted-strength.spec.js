import { test, expect } from '@playwright/test';

test('weighted-strength gpu-force fixture runs without console errors', async ({ page }) => {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('/?nodes=360&mode=2d&renderer=webgl&layout=gpuforce&forceNormalizationType=strength');
  await page.waitForFunction(() => window.__HELIOS_DIAGNOSTICS__?.ready === true);
  await page.waitForTimeout(900);

  const result = await page.evaluate(async () => {
    const helios = window.__helios;
    const layout = typeof helios?.layout === 'function' ? helios.layout() : null;
    const delegate = layout?.getPositionDelegate?.() ?? null;
    const snapshot = await helios?.snapshotDelegatePositions?.();
    return {
      forceNormalizationType: layout?.options?.forceNormalizationType ?? null,
      edgeWeightAttribute: layout?.options?.edgeWeightAttribute ?? null,
      executionMode: delegate?._webgl?.getExecutionMode?.() ?? null,
      snapshotLength: snapshot instanceof Float32Array ? snapshot.length : 0,
    };
  });

  expect(errors).toEqual([]);
  expect(result.forceNormalizationType).toBe('strength');
  expect(result.edgeWeightAttribute).toBe('intensity');
  expect(['gpu', 'unavailable']).toContain(result.executionMode);
  if (result.executionMode === 'gpu') {
    expect(result.snapshotLength).toBeGreaterThan(0);
  }
});
