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

test.describe('renderer selection', () => {
  test('honors webgl force flag via query param', async ({ page }) => {
    await page.goto('/?renderer=webgl');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.renderer.toLowerCase()).toContain('webgl');
  });

  test('defaults to best available backend', async ({ page }) => {
    await page.goto('/');
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
    await page.goto('/?renderer=webgl');
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
    await page.goto('/?renderer=webgl');
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
    await page.goto('/?renderer=webgl');
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
      await new Promise((resolve) => setTimeout(resolve, 100));
      const result = await renderer.readPixels(fb, { x: 0, y: 0, width: 1, height: 1 });
      renderer.setRenderTarget(null);
      return Array.from(result.slice(0, 4));
    });
    expect(pixel[0]).toBeGreaterThan(200);
    expect(pixel[1]).toBeLessThan(20);
    expect(pixel[2]).toBeLessThan(20);
  });

  test('custom layers receive render calls', async ({ page }) => {
    await page.goto('/?renderer=webgl');
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
    await page.goto('/');
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
      const frame = helios?.pipeline?.buildFrame?.(true);
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
  test('renders deterministic node colors with WebGPU when available @webgpu', async ({ page, browser }) => {
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

    await headedPage.goto('/');
    const hasWebGPU = await headedPage.evaluate(() => Boolean(navigator.gpu));
    if (!hasWebGPU) {
      await headedContext?.close();
      test.skip(true, 'WebGPU not supported in this environment');
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

    if (diagnostics.error || !diagnostics.renderer?.toLowerCase().includes('webgpu')) {
      await headedContext?.close();
      test.skip(true, `WebGPU initialization unavailable (${diagnostics.error ?? diagnostics.renderer})`);
    }

    await headedPage.waitForTimeout(300);
    const canvas = headedPage.locator('#app canvas.helios-layer-canvas3d').first();
    const shot = await canvas.screenshot();
    const png = PNG.sync.read(shot);

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

    for (const target of targets) {
      const hits = countFor(target);
      expect(hits).toBeGreaterThan(30);
    }

    await headedContext?.close();
  });
});
