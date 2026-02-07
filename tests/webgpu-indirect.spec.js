import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  });
  const diag = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
  if (!diag.ready) {
    throw new Error(`Renderer diagnostics not ready: ${diag.error ?? 'unknown error'}`);
  }
  return diag;
}

test('webgpu indirect backend disables interpolation @webgpu', async ({ page }) => {
  await page.goto('/tests/fixtures/demo.html?renderer=webgpu&webgpuBackend=indirect');
  const diagnostics = await waitForDiagnostics(page);
  expect(diagnostics.renderer.toLowerCase()).toContain('webgpu');

  const info = await page.evaluate(() => {
    const helios = window.__helios;
    return {
      graphLayer: helios?.renderer?.graphLayer?.constructor?.name ?? null,
      interpolation: helios?.interpolation?.() ?? null,
    };
  });
  expect(info.graphLayer).toBe('GraphLayerWebGPUIndirect');
  expect(info.interpolation?.enabled).toBe(false);
});
