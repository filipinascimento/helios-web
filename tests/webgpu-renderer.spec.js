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

test('webgpu renderer uses indirect graph layer @webgpu', async ({ page }) => {
  await page.goto('/tests/fixtures/demo.html?renderer=webgpu');
  const diagnostics = await waitForDiagnostics(page);
  expect(diagnostics.renderer.toLowerCase()).toContain('webgpu');

  const info = await page.evaluate(() => {
    const helios = window.__helios;
    const hasInterpolationApi = typeof helios?.interpolation === 'function';
    return {
      graphLayer: helios?.renderer?.graphLayer?.constructor?.name ?? null,
      hasInterpolationApi,
      interpolation: hasInterpolationApi ? helios.interpolation() : undefined,
    };
  });
  expect(info.graphLayer).toBe('GraphLayerWebGPU');
  expect(info.hasInterpolationApi).toBe(true);
  expect(info.interpolation).toMatchObject({
    enabled: false,
    mode: 'gpu',
  });
});

test('webgpu renderer creates edge pipelines for the active edge variant @webgpu', async ({ page }) => {
  await page.goto('/tests/fixtures/blank.html');

  const info = await page.evaluate(async () => {
    document.body.innerHTML = '<div id="app" style="width:400px;height:300px;"></div>';
    const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
    const { helios } = await createDeterministicHelios(document.getElementById('app'), 'webgpu');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const graphLayer = helios?.renderer?.graphLayer;
    const device = helios?.renderer?.device?.device ?? null;
    const visualConfig = graphLayer?.getVisualConfig?.(helios.network) ?? null;
    const edgeVariant = graphLayer?.resolveEdgeVariant?.(visualConfig) ?? null;
    const pipelines = graphLayer?.getEdgePipelinesForMode?.(
      graphLayer?.edgeTransparencyMode ?? 'alpha',
      device,
      true,
      edgeVariant,
      helios?.renderer?.device?.sampleCount ?? 1,
    ) ?? null;
    return {
      graphLayer: graphLayer?.constructor?.name ?? null,
      hasLine: Boolean(pipelines?.line),
      hasQuad: Boolean(pipelines?.quad),
    };
  });

  expect(info.graphLayer).toBe('GraphLayerWebGPU');
  expect(info.hasLine).toBe(true);
  expect(info.hasQuad).toBe(true);
});
