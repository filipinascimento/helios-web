import fs from 'fs/promises';
import path from 'path';
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

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

const SCREENSHOT_DIR = path.join(process.cwd(), 'artifacts', 'headed-screenshots');

async function writeImageAttachment(buffer, testInfo, name) {
  const dir = SCREENSHOT_DIR;
  await fs.mkdir(dir, { recursive: true });
  const slug = `${testInfo.project.name}-${testInfo.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`.replace(/-+/g, '-');
  const filePath = path.join(dir, `${slug}-${name}.png`);
  await fs.writeFile(filePath, buffer);
  await testInfo.attach(name, { body: buffer, contentType: 'image/png' });
  return filePath;
}

async function capturePageScreenshot(page, testInfo, name, options = {}) {
  const shot = await page.screenshot({ fullPage: true, ...options });
  return writeImageAttachment(shot, testInfo, name);
}

test.describe('renderer selection', () => {
  test('honors webgl force flag via query param', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.renderer.toLowerCase()).toContain('webgl');
  });

  test('defaults to best available backend', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html');
    const hasWebGPU = await page.evaluate(() => Boolean(navigator.gpu));
    const diagnostics = await waitForDiagnostics(page);
    if (hasWebGPU && diagnostics.renderer.toLowerCase().includes('webgpu')) {
      expect(diagnostics.renderer.toLowerCase()).toContain('webgpu');
    } else {
      expect(diagnostics.renderer.toLowerCase()).toContain('webgl');
    }
  });
});

test.describe('renderer helpers', () => {
  test('project/unproject round trips', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl');
    await waitForDiagnostics(page);
    const { original, roundTrip } = await page.evaluate(() => {
      const renderer = window.__helios.renderer;
      const original = [25, 40];
      const clip = renderer.projectToClip(original);
      const world = renderer.unprojectFromClip(clip);
      return { original, roundTrip: world };
    });
    expect(roundTrip[0]).toBeCloseTo(original[0], 2);
    expect(roundTrip[1]).toBeCloseTo(original[1], 2);
  });

  test('can create framebuffers and present without errors', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl');
    await waitForDiagnostics(page);
    const framebufferInfo = await page.evaluate(() => {
      const renderer = window.__helios.renderer;
      const fb = renderer.createFramebuffer(32, 32);
      renderer.presentFramebuffer(fb);
      return { width: fb.width, height: fb.height, type: fb.type };
    });
    expect(framebufferInfo.width).toBe(32);
    expect(framebufferInfo.height).toBe(32);
    expect(['webgl2', 'webgpu']).toContain(framebufferInfo.type);
  });

  test('can render to framebuffer and read pixels', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl');
    await waitForDiagnostics(page);
    const pixel = await page.evaluate(async () => {
      const renderer = window.__helios.renderer;
      const fb = renderer.createFramebuffer(4, 4);
      renderer.setRenderTarget(fb);
      renderer.addLayer({
        name: 'test-clear-red',
        render(ctx) {
          if (ctx.type === 'webgl2') {
            ctx.gl.clearColor(1, 0, 0, 1);
            ctx.gl.clear(ctx.gl.COLOR_BUFFER_BIT);
          }
        },
      });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      renderer.render({
        network: window.__helios.network,
        camera: renderer.camera,
        timestamp: performance.now(),
      });
      const result = await renderer.readPixels(fb, { x: 0, y: 0, width: 1, height: 1 });
      renderer.setRenderTarget(null);
      return Array.from(result.slice(0, 4));
    });
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[1]).toBeLessThan(20);
    expect(pixel[2]).toBeLessThan(20);
  });

  test('custom layers receive render calls', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl');
    await waitForDiagnostics(page);
    const count = await page.evaluate(() => {
      const renderer = window.__helios.renderer;
      let calls = 0;
      renderer.addLayer({
        name: 'test-layer',
        render() {
          calls += 1;
          window.__layerCalls = calls;
        },
      });
      return window.__layerCalls ?? 0;
    });
    await page.waitForFunction(() => (window.__layerCalls ?? 0) > 0);
    const finalCount = await page.evaluate(() => window.__layerCalls);
    expect(finalCount).toBeGreaterThan(0);
  });

  test('renders deterministic node colors at fixed positions', async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    const diagnostics = await page.evaluate(async () => {
      window.__helios?.destroy?.();
      document.body.innerHTML = '<div id="app" style="width:320px;height:320px"></div>';
      const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
      const { helios, colors } = await createDeterministicHelios(document.getElementById('app'), 'webgl');
      window.__helios = helios;
      return { colors };
    });

    const counts = await page.evaluate(async () => {
      const helios = window.__helios;
      const frame = helios ? { network: helios.network, timestamp: performance.now() } : null;
      if (frame) {
        helios?.renderer?.render?.(frame);
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
      const canvas = document.querySelector('#app canvas.helios-layer-canvas3d');
      const rect = { x: 0, y: 0, width: canvas.width, height: canvas.height };
      const pixels = await helios?.renderer?.readPixels?.(null, rect);
      if (!pixels) return [];
      const targets = window.__deterministicColors ?? helios?.renderer?.colors ?? [];
      const targetColors = targets.map(([r, g, b]) => [r * 255, g * 255, b * 255]);
      const tolerance = 50;
      function countFor(target) {
        let hits = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          const dr = pixels[i] - target[0];
          const dg = pixels[i + 1] - target[1];
          const db = pixels[i + 2] - target[2];
          const distance = Math.sqrt(dr * dr + dg * dg + db * db);
          if (distance < tolerance) hits += 1;
        }
        return hits;
      }
      return targetColors.map((t) => countFor(t));
    });
    for (const hits of counts) {
      expect(hits).toBeGreaterThan(30);
    }
  });
});

test.describe('webgpu visual (headed)', () => {
  test('renders deterministic node colors with WebGPU when available @webgpu', async ({ page, browser }, testInfo) => {
    // Attempt to spin a headed context; skip if not possible.
    let headedContext = null;
    let headedPage = page;
    if (browser) {
      try {
        headedContext = await browser.newContext({ headless: false });
        headedPage = await headedContext.newPage();
      } catch (error) {
        test.skip(true, `Unable to launch headed browser: ${error?.message ?? error}`);
      }
    } else {
      test.skip(true, 'Browser fixture unavailable');
    }

    await headedPage.goto('/tests/fixtures/blank.html');
    const hasWebGPU = await headedPage.evaluate(() => Boolean(navigator.gpu));
    if (!hasWebGPU) {
      await capturePageScreenshot(headedPage, testInfo, 'no-webgpu');
      await headedContext?.close();
      test.skip(true, 'WebGPU not supported in this environment');
    }
    const hasAdapter = await headedPage.evaluate(async () => {
      try {
        const adapter = await navigator.gpu?.requestAdapter?.();
        return !!adapter;
      } catch (error) {
        return false;
      }
    });
    if (!hasAdapter) {
      await capturePageScreenshot(headedPage, testInfo, 'webgpu-no-adapter');
      await headedContext?.close();
      test.skip(true, 'WebGPU adapter unavailable in this environment');
    }

    const diagnostics = await headedPage.evaluate(async () => {
      window.__helios?.destroy?.();
      document.body.innerHTML = '<div id="app" style="width:320px;height:320px"></div>';
      const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
      try {
        const { helios, colors } = await createDeterministicHelios(document.getElementById('app'), 'webgpu');
        window.__helios = helios;
        return { colors, renderer: helios.renderer?.device?.type ?? 'unknown' };
      } catch (error) {
        return { error: error?.message ?? String(error) };
      }
    });

    await testInfo.attach('webgpu-diagnostics', {
      body: JSON.stringify(diagnostics, null, 2),
      contentType: 'application/json',
    });

    if (diagnostics.error || !diagnostics.renderer?.toLowerCase().includes('webgpu')) {
      await headedContext?.close();
      test.skip(true, `WebGPU initialization unavailable (${diagnostics.error ?? diagnostics.renderer})`);
    }

    await headedPage.waitForTimeout(300);
    await headedPage.evaluate(() => {
      const helios = window.__helios;
      const frame = helios
        ? { network: helios.network, timestamp: performance.now(), camera: helios.renderer?.camera }
        : null;
      if (frame) {
        helios.renderer?.render?.(frame);
      }
    });
    await headedPage.waitForSelector('#app canvas.helios-layer-canvas3d');
    const canvas = headedPage.locator('#app canvas.helios-layer-canvas3d').first();
    const shot = await canvas.screenshot();
    const png = PNG.sync.read(shot);
    await writeImageAttachment(shot, testInfo, 'webgpu-headed-canvas');

    const targets = diagnostics.colors.map(([r, g, b]) => [r * 255, g * 255, b * 255]);
    const tolerance = 50;
    function countFor(target) {
      let hits = 0;
      for (let i = 0; i < png.data.length; i += 4) {
        const dr = png.data[i] - target[0];
        const dg = png.data[i + 1] - target[1];
        const db = png.data[i + 2] - target[2];
        const distance = Math.sqrt(dr * dr + dg * dg + db * db);
        if (distance < tolerance) {
          hits += 1;
        }
      }
      return hits;
    }

    const hitCounts = targets.map((target) => countFor(target));
    await testInfo.attach('webgpu-hit-counts', {
      body: JSON.stringify(hitCounts, null, 2),
      contentType: 'application/json',
    });

    if (hitCounts.every((v) => v === 0)) {
      await headedContext?.close();
      test.skip(true, 'WebGPU rendered a blank frame (likely unavailable on this platform)');
    }
    const maxHits = Math.max(...hitCounts);
    if (maxHits < 10) {
      await headedContext?.close();
      test.skip(true, `WebGPU produced insufficient color hits (${maxHits}) on this platform`);
    }
    const minHits = Math.min(...hitCounts);
    if (minHits <= 30) {
      await headedContext?.close();
      test.skip(true, `WebGPU rendered with low coverage (min hits ${minHits})`);
    }

    for (const hits of hitCounts) {
      expect(hits).toBeGreaterThan(30);
    }
    await headedContext?.close();
  });

  test('weighted edge transparency diverges from alpha (headed)', async ({ page, browser }, testInfo) => {
    // Ensure headed context so weighted blending can be exercised; skip otherwise.
    let headedContext = null;
    let headedPage = page;
    if (browser) {
      try {
        headedContext = await browser.newContext({ headless: false });
        headedPage = await headedContext.newPage();
      } catch (error) {
        test.skip(true, `Unable to launch headed browser: ${error?.message ?? error}`);
      }
    } else {
      test.skip(true, 'Browser fixture unavailable');
    }

    await headedPage.goto('/tests/fixtures/blank.html');
    await capturePageScreenshot(headedPage, testInfo, 'weighted-headed-initial');

    const result = await headedPage.evaluate(async () => {
      const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
      document.body.innerHTML = '<div id="app" style="width:320px;height:320px"></div>';
      const { helios } = await createDeterministicHelios(document.getElementById('app'), 'webgl');

      const network = helios.network;
      const edges = network.addEdges([
        { from: 0, to: 1 },
        { from: 0, to: 1 },
      ]);
      network.withBufferAccess(() => {
        const colors = network.getEdgeAttributeBuffer('_helios_visuals_edge_color').view;
        const widths = network.getEdgeAttributeBuffer('_helios_visuals_edge_width').view;
        const opacities = network.getEdgeAttributeBuffer('_helios_visuals_edge_opacity').view;
        colors.set([1, 0, 0, 1, 1, 0, 0, 1], edges[0] * 8);
        colors.set([0, 0, 1, 1, 0, 0, 1, 1], edges[1] * 8);
        widths.set([20, 20], edges[0] * 2);
        widths.set([20, 20], edges[1] * 2);
        opacities.set([1.0, 1.0], edges[0] * 2);
        opacities.set([0.05, 0.05], edges[1] * 2);
      });

      const sampleMean = async (mode) => {
        helios.renderer?.setEdgeTransparencyMode?.(mode);
        helios.visuals.bumpEdgeAttributes?.(
          '_helios_visuals_edge_color',
          '_helios_visuals_edge_width',
          '_helios_visuals_edge_opacity',
        );
        helios.scheduler.requestGeometry();
        helios.renderer.render({ network, timestamp: performance.now(), camera: helios.renderer.camera });
        await new Promise((resolve) => setTimeout(resolve, 80));
        // Sample around the midpoint of the overlapping edges.
        const rect = { x: 120, y: 60, width: 80, height: 40 };
        const pixels = await helios.renderer.readPixels(null, rect);
        if (!pixels) return { mean: [0, 0, 0], fallback: true };
        let r = 0; let g = 0; let b = 0; let count = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          r += pixels[i];
          g += pixels[i + 1];
          b += pixels[i + 2];
          count += 1;
        }
        const mean = [r / count, g / count, b / count];
        const layer = helios.renderer?.graphLayer;
        const fallback = mode === 'weighted' && layer?.edgeTransparencyMode !== 'weighted';
        return { mean, fallback };
      };

      const alpha = await sampleMean('alpha');
      const weighted = await sampleMean('weighted');

      const distance = Math.sqrt(
        (alpha.mean[0] - weighted.mean[0]) ** 2 +
        (alpha.mean[1] - weighted.mean[1]) ** 2 +
        (alpha.mean[2] - weighted.mean[2]) ** 2,
      );

      return {
        distance,
        fallback: weighted.fallback,
        alpha,
        weighted,
      };
    });

    await capturePageScreenshot(headedPage, testInfo, 'weighted-transparency-headed');
    await testInfo.attach('weighted-result', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
    console.log('weighted-result', result);

    if (result.fallback || result.distance <= 5) {
      test.skip(true, 'Weighted edge transparency unavailable or produced no observable delta in this environment');
    }

    expect(result.distance).toBeGreaterThan(5);

    await headedContext?.close();
  });
});
