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
    /Shader compilation error/i,
    /Program link error/i,
    /framebuffer incomplete/i,
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

function countBufferDiffBytes(before, after) {
  let diffBytes = Math.abs(before.length - after.length);
  const sharedLength = Math.min(before.length, after.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (before[index] !== after[index]) diffBytes += 1;
  }
  return diffBytes;
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
      mode: helios.ambientOcclusionMode(),
      enabled: helios.ambientOcclusionEnabled(),
      nodes: helios.ambientOcclusionNodes(),
      edges: helios.ambientOcclusionEdges(),
    };
  });

  expect(state.ok).toBe(true);
  expect(state.renderer).toBe('webgpu');
  expect(state.mode).toBe('fast');
  expect(state.enabled).toBe(true);
  expect(state.nodes).toBe(true);
  expect(state.edges).toBe(true);

  const afterCoverage = await getCanvasCoverage(page);
  expect(afterCoverage.ok).toBe(true);

  await page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios) return;
    helios.ambientOcclusionMode('smooth');
    helios.requestRender?.();
  });

  await page.waitForFunction(() => {
    const ao = window.__helios?.renderer?.graphLayer?.ambientOcclusion;
    return ao?.aoPipelines && Array.from(ao.aoPipelines.keys()).includes('smooth|medium');
  });

  await page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios) return;
    helios.ambientOcclusionMode('fast');
    helios.ambientOcclusionIntensityScale(1.4);
    helios.ambientOcclusionIntensityShift(0.03);
    helios.requestRender?.();
  });

  await page.waitForFunction(() => {
    const ao = window.__helios?.renderer?.graphLayer?.ambientOcclusion;
    return ao?.aoPipelines && Array.from(ao.aoPipelines.keys()).includes('fast|medium');
  });

  const fastRuntime = await page.evaluate(() => {
    const helios = window.__helios;
    const ao = helios?.renderer?.graphLayer?.ambientOcclusion;
    return {
      mode: helios?.ambientOcclusionMode?.() ?? null,
      aoPipelineKeys: ao?.aoPipelines ? Array.from(ao.aoPipelines.keys()) : [],
    };
  });
  expect(fastRuntime.mode).toBe('fast');
  expect(fastRuntime.aoPipelineKeys).toContain('smooth|medium');
  expect(fastRuntime.aoPipelineKeys).toContain('fast|medium');

  const forbidden = browserIssues.filter(hasForbiddenAoRuntimeError);
  if (browserIssues.length) {
    await testInfo.attach('webgpu-browser-issues', {
      body: browserIssues.join('\n\n'),
      contentType: 'text/plain',
    });
  }
  expect(forbidden, forbidden.join('\n\n')).toHaveLength(0);
});

test('ambient occlusion runtime is stable in WebGL fixture', async ({ page }, testInfo) => {
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

  await page.goto('/tests/fixtures/demo.html?renderer=webgl&mode=3d&nodes=2000&layout=none');
  const diagnostics = await waitForDiagnostics(page);
  expect(diagnostics?.ready).toBe(true);
  expect(String(diagnostics?.renderer ?? '').toLowerCase()).toContain('webgl');

  const beforeScreenshot = await page.screenshot();

  const state = await page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios) return { ok: false, reason: 'missing helios' };

    helios.ambientOcclusionEnabled(true);
    helios.ambientOcclusionNodes(true);
    helios.ambientOcclusionEdges(true);
    helios.ambientOcclusionMode('fast');
    helios.ambientOcclusionStrength(1.1);
    helios.ambientOcclusionRadius(22);
    helios.ambientOcclusionBias(0.01);
    helios.ambientOcclusionIntensityScale(1.35);
    helios.ambientOcclusionIntensityShift(0.03);
    await helios.render?.();

    return {
      ok: true,
      renderer: helios.renderer?.device?.type ?? null,
      mode: helios.ambientOcclusionMode(),
      enabled: helios.ambientOcclusionEnabled(),
      nodes: helios.ambientOcclusionNodes(),
      edges: helios.ambientOcclusionEdges(),
    };
  });

  expect(state.ok).toBe(true);
  expect(state.renderer).toBe('webgl2');
  expect(state.mode).toBe('fast');
  expect(state.enabled).toBe(true);
  expect(state.nodes).toBe(true);
  expect(state.edges).toBe(true);

  await page.evaluate(() => {
    const helios = window.__helios;
    if (!helios) return;
    helios.ambientOcclusionMode('smooth');
    helios.requestRender?.();
  });

  await page.waitForFunction(() => {
    const ao = window.__helios?.renderer?.graphLayer?.ambientOcclusion;
    return ao?.aoPrograms && Array.from(ao.aoPrograms.keys()).includes('smooth|medium');
  });

  await page.evaluate(() => {
    const helios = window.__helios;
    if (!helios) return;
    helios.ambientOcclusionMode('fast');
    helios.requestRender?.();
  });

  await page.waitForFunction(() => {
    const ao = window.__helios?.renderer?.graphLayer?.ambientOcclusion;
    return ao?.aoPrograms && Array.from(ao.aoPrograms.keys()).includes('fast|medium');
  });

  const afterScreenshot = await page.screenshot();
  const visibleDiffBytes = countBufferDiffBytes(beforeScreenshot, afterScreenshot);

  const runtime = await page.evaluate(() => {
    const ao = window.__helios?.renderer?.graphLayer?.ambientOcclusion;
    return {
      aoProgramKeys: ao?.aoPrograms ? Array.from(ao.aoPrograms.keys()) : [],
      aoSize: ao?.aoSize ?? null,
      fullSize: ao?.fullSize ?? null,
    };
  });
  expect(runtime.aoProgramKeys).toContain('fast|medium');
  expect(runtime.aoProgramKeys).toContain('smooth|medium');
  expect(runtime.aoSize?.width ?? 0).toBeGreaterThan(0);
  expect(runtime.aoSize?.height ?? 0).toBeGreaterThan(0);
  expect(runtime.fullSize?.width ?? 0).toBeGreaterThan(0);
  expect(runtime.fullSize?.height ?? 0).toBeGreaterThan(0);
  expect(visibleDiffBytes).toBeGreaterThan(1000);

  const forbidden = browserIssues.filter(hasForbiddenAoRuntimeError);
  if (browserIssues.length) {
    await testInfo.attach('webgl-browser-issues', {
      body: browserIssues.join('\n\n'),
      contentType: 'text/plain',
    });
  }
  expect(forbidden, forbidden.join('\n\n')).toHaveLength(0);
});
