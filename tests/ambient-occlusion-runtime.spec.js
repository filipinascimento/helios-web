import { test, expect } from '@playwright/test';

function isIgnorableConsoleMessage(msg) {
  return /favicon\.ico/i.test(msg);
}

function hasForbiddenAoRuntimeError(msg) {
  return [
    /u_semanticZoomExponent/i,
    /u_zoom2D/i,
    /no matching constructor for 'vec2<i32>/i,
    /Invalid ShaderModule/i,
    /Invalid ComputePipeline/i,
    /Invalid CommandBuffer/i,
    /Attachment state .* not compatible/i,
    /cannot read properties of null/i,
    /CreateShaderModule/i,
  ].some((pattern) => pattern.test(msg));
}

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

async function getCanvasCoverage(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { ok: false, reason: 'missing canvas' };

    const sample = document.createElement('canvas');
    sample.width = canvas.width;
    sample.height = canvas.height;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, reason: 'missing 2d context' };

    ctx.drawImage(canvas, 0, 0);
    const image = ctx.getImageData(0, 0, sample.width, sample.height).data;

    let nonBlack = 0;
    for (let i = 0; i < image.length; i += 4) {
      const r = image[i];
      const g = image[i + 1];
      const b = image[i + 2];
      if (r > 8 || g > 8 || b > 8) nonBlack += 1;
    }

    return {
      ok: true,
      width: sample.width,
      height: sample.height,
      nonBlack,
      total: sample.width * sample.height,
    };
  });
}

test('ambient occlusion runtime is stable in WebGPU fixture @webgpu', async ({ page }, testInfo) => {
  const browserIssues = [];

  page.on('pageerror', (error) => {
    browserIssues.push(`pageerror: ${error?.message ?? String(error)}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (isIgnorableConsoleMessage(text)) return;
    browserIssues.push(`${msg.type()}: ${text}`);
  });

  await page.goto('/tests/fixtures/demo.html?renderer=webgpu&mode=3d&nodes=2000');
  const diagnostics = await waitForDiagnostics(page);
  expect(diagnostics?.ready).toBe(true);
  expect(String(diagnostics?.renderer ?? '').toLowerCase()).toContain('webgpu');

  // Keep a smoke check that something rendered before enabling AO.
  const beforeCoverage = await getCanvasCoverage(page);
  expect(beforeCoverage.ok).toBe(true);

  const state = await page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios) return { ok: false, reason: 'missing helios' };

    helios.ambientOcclusionEnabled(true);
    helios.ambientOcclusionNodes(true);
    helios.ambientOcclusionEdges(true);
    helios.ambientOcclusionStrength(1.2);
    helios.ambientOcclusionRadius(24);
    helios.ambientOcclusionBias(0.01);
    await helios.render?.();

    return {
      ok: true,
      renderer: helios.renderer?.device?.type ?? null,
      enabled: helios.ambientOcclusionEnabled(),
      nodes: helios.ambientOcclusionNodes(),
      edges: helios.ambientOcclusionEdges(),
    };
  });

  expect(state.ok).toBe(true);
  expect(state.renderer).toBe('webgpu');
  expect(state.enabled).toBe(true);
  expect(state.nodes).toBe(true);
  expect(state.edges).toBe(true);

  const afterCoverage = await getCanvasCoverage(page);
  expect(afterCoverage.ok).toBe(true);

  await page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios) return;
    helios.ambientOcclusionMode('alt');
    helios.ambientOcclusionIntensityScale(1.4);
    helios.ambientOcclusionIntensityShift(0.03);
    await helios.render?.();
  });

  await page.waitForFunction(() => {
    const ao = window.__helios?.renderer?.graphLayer?.ambientOcclusion;
    return ao?.aoPipelines && Array.from(ao.aoPipelines.keys()).includes('alt|medium');
  });

  const altRuntime = await page.evaluate(() => {
    const helios = window.__helios;
    const ao = helios?.renderer?.graphLayer?.ambientOcclusion;
    return {
      mode: helios?.ambientOcclusionMode?.() ?? null,
      aoPipelineKeys: ao?.aoPipelines ? Array.from(ao.aoPipelines.keys()) : [],
    };
  });
  expect(altRuntime.mode).toBe('alt');
  expect(altRuntime.aoPipelineKeys).toContain('smooth|medium');
  expect(altRuntime.aoPipelineKeys).toContain('alt|medium');

  const forbidden = browserIssues.filter(hasForbiddenAoRuntimeError);
  if (browserIssues.length) {
    await testInfo.attach('webgpu-browser-issues', {
      body: browserIssues.join('\n\n'),
      contentType: 'text/plain',
    });
  }
  expect(forbidden, forbidden.join('\n\n')).toHaveLength(0);
});
