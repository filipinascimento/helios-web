import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
}

test.describe('figure export', () => {
  test('data panel exposes a Figure tab with export controls', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=64');
    await page.waitForFunction(() =>
      Boolean(window.__helios && window.__helios.ready && window.__HELIOS_DIAGNOSTICS__?.ready === true),
    );

    const dataPanel = page.locator('helios-panel[heading="Data"]').first();
    await expect(dataPanel).toBeVisible();
    await expect(dataPanel.locator('button.helios-ui-tab', { hasText: 'Network' })).toBeVisible();
    await expect(dataPanel.locator('button.helios-ui-tab', { hasText: 'Figure' })).toBeVisible();

    await dataPanel.locator('button.helios-ui-tab', { hasText: 'Figure' }).click();
    await expect(dataPanel.locator('button', { hasText: 'Export' })).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-row', { hasText: 'Supersampling' })).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-row', { hasText: 'Alpha' })).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-row', { hasText: 'Alpha' }).locator('select.helios-ui-select')).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-row', { hasText: 'Frame' })).toBeVisible();
  });

  test('figure frame preview matches the chosen export aspect ratio', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=64');
    await page.waitForFunction(() =>
      Boolean(window.__helios && window.__helios.ready && window.__HELIOS_DIAGNOSTICS__?.ready === true),
    );

    const dataPanel = page.locator('helios-panel[heading="Data"]').first();
    await dataPanel.locator('button.helios-ui-tab', { hasText: 'Figure' }).click();

    await dataPanel.locator('.helios-ui-row', { hasText: 'Size' }).locator('select').selectOption('custom');
    const customInputs = dataPanel.locator('.helios-ui-row', { hasText: 'Custom' }).locator('input');
    await customInputs.nth(0).fill('800');
    await customInputs.nth(1).fill('800');
    await customInputs.nth(1).blur();
    await dataPanel.locator('button[aria-label="Show export frame"]').click();

    const frame = page.locator('.helios-ui-export-frame');
    await expect(frame).toBeVisible();

    const metrics = await frame.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        left: Number.parseFloat(style.left),
        top: Number.parseFloat(style.top),
        width: Number.parseFloat(style.width),
        height: Number.parseFloat(style.height),
      };
    });

    expect(metrics.left).toBeGreaterThan(150);
    expect(metrics.top).toBe(0);
    expect(metrics.width).toBeCloseTo(metrics.height, 0);
    expect(metrics.height).toBeGreaterThan(700);
  });

  test('exports self-contained SVG with vector overlays and figure-relative legends', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      window.__helios.labels({ enabled: true, maxVisible: 12 });
      window.__helios.legends({ showNodeSize: true, showEdgeWidth: true });
      window.__helios.overlayInsets({ top: 180, right: 0, bottom: 0, left: 160 });
      window.__helios.requestRender?.();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const blob = await window.__helios.exportFigureBlob({
        format: 'svg',
        preset: 'window',
        includeLabels: true,
        includeLegends: true,
      });
      const text = await blob.text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const nodeColorLegend = doc.querySelector('.helios-legend[data-legend-kind="nodeColor"]');
      const nodeColorLegendImage = nodeColorLegend?.querySelector('image');
      const nodeColorLegendGradient = nodeColorLegend?.querySelector('linearGradient');
      const edgeWidthLine = doc.querySelector('.helios-legend[data-legend-kind="edgeWidth"] line');
      const nodeSizeCircle = doc.querySelector('.helios-legend[data-legend-kind="nodeSize"] circle');
      const categorySwatch = doc.querySelector('.helios-legend rect[rx="3"]');
      return {
        type: blob.type,
        text,
        legendTransform: nodeColorLegend?.getAttribute('transform') ?? '',
        nodeColorLegendImageHref: nodeColorLegendImage?.getAttribute('href') ?? nodeColorLegendImage?.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '',
        nodeColorLegendHasGradient: Boolean(nodeColorLegendGradient),
        edgeWidthStroke: edgeWidthLine?.getAttribute('stroke') ?? '',
        nodeSizeFill: nodeSizeCircle?.getAttribute('fill') ?? '',
        categorySwatchFill: categorySwatch?.getAttribute('fill') ?? '',
      };
    });

    expect(result.type).toBe('image/svg+xml');
    expect(result.text).toContain('data:image/png;base64,');
    expect(result.text).toContain('helios-legends-layer');
    expect(result.text).toContain('helios-label-layer');
    expect(result.nodeColorLegendImageHref).toContain('data:image/png;base64,');
    expect(result.nodeColorLegendHasGradient).toBe(false);
    expect(result.text).not.toContain('system-ui');
    expect(result.text).not.toContain('BlinkMacSystemFont');
    expect(result.text).not.toContain('Segoe UI');
    expect(result.text).not.toContain('-apple-system');
    expect(result.text).toContain('Helvetica');
    expect(result.edgeWidthStroke).not.toContain('rgba(');
    expect(result.nodeSizeFill).not.toContain('rgba(');
    expect(result.categorySwatchFill).not.toContain('rgba(');

    const match = /translate\(([-\d.]+),\s*([-\d.]+)\)/u.exec(result.legendTransform);
    expect(match).toBeTruthy();
    expect(Number(match[1])).toBeLessThan(80);
    expect(Number(match[2])).toBeLessThan(80);
  });

  test('transparent background export preserves alpha in PNG and SVG', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const sampleAlpha = async (blob) => {
        const url = URL.createObjectURL(blob);
        const image = await new Promise((resolve, reject) => {
          const next = new Image();
          next.onload = () => resolve(next);
          next.onerror = () => reject(new Error('Failed to decode exported image'));
          next.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const alpha = ctx.getImageData(1, 1, 1, 1).data[3];
        URL.revokeObjectURL(url);
        return alpha;
      };

      const pngBlob = await window.__helios.exportFigureBlob({
        format: 'png',
        preset: 'window',
        transparentBackground: true,
      });
      const svgBlob = await window.__helios.exportFigureBlob({
        format: 'svg',
        preset: 'window',
        transparentBackground: true,
      });

      return {
        pngAlpha: await sampleAlpha(pngBlob),
        svgAlpha: await sampleAlpha(svgBlob),
      };
    });

    expect(result.pngAlpha).toBeLessThan(8);
    expect(result.svgAlpha).toBeLessThan(8);
  });

  test('background-on export stays opaque', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const pngBlob = await window.__helios.exportFigureBlob({
        format: 'png',
        preset: 'window',
        transparentBackground: false,
        alphaMode: 'premultiplied',
      });
      const url = URL.createObjectURL(pngBlob);
      const image = await new Promise((resolve, reject) => {
        const next = new Image();
        next.onload = () => resolve(next);
        next.onerror = () => reject(new Error('Failed to decode opaque PNG export'));
        next.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const pngAlpha = ctx.getImageData(1, 1, 1, 1).data[3];
      URL.revokeObjectURL(url);

      const svgBlob = await window.__helios.exportFigureBlob({
        format: 'svg',
        preset: 'window',
        transparentBackground: false,
        alphaMode: 'premultiplied',
      });
      const svgText = await svgBlob.text();
      return { pngAlpha, svgText };
    });

    expect(result.pngAlpha).toBe(255);
    expect(result.svgText).toContain('<rect width=');
    expect(result.svgText).toContain('fill="rgb(');
  });

  test('legend export size follows the figure frame and not a fixed pixel size', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const extractLegendMetrics = async (preset, legendScale = 1) => {
        const blob = await window.__helios.exportFigureBlob({
          format: 'svg',
          preset,
          includeLabels: false,
          includeLegends: true,
          legendScale,
        });
        const text = await blob.text();
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const layer = doc.querySelector('.helios-legends-layer');
        const legendText = doc.querySelector('.helios-legend text');
        const nodeColorLegend = doc.querySelector('.helios-legend[data-legend-kind="nodeColor"]');
        const bar = nodeColorLegend?.querySelector('image')
          ?? nodeColorLegend?.querySelector('rect[fill^="url("]');
        return {
          exportLegendScale: Number.parseFloat(layer?.getAttribute('data-export-legend-scale') ?? '0'),
          fontSize: Number.parseFloat(legendText?.getAttribute('font-size') ?? '0'),
          barHeight: Number.parseFloat(bar?.getAttribute('height') ?? '0'),
        };
      };

      return {
        base1080: await extractLegendMetrics('1080p', 1),
        scaled4k: await extractLegendMetrics('4k', 1),
        doubled1080: await extractLegendMetrics('1080p', 2),
      };
    });

    expect(result.base1080.fontSize).toBeGreaterThan(0);
    expect(result.base1080.barHeight).toBeGreaterThan(0);
    expect(result.scaled4k.fontSize / result.base1080.fontSize).toBeGreaterThan(1.8);
    expect(result.scaled4k.fontSize / result.base1080.fontSize).toBeLessThan(2.2);
    expect(result.scaled4k.barHeight / result.base1080.barHeight).toBeGreaterThan(1.8);
    expect(result.scaled4k.barHeight / result.base1080.barHeight).toBeLessThan(2.2);
    expect(result.doubled1080.fontSize / result.base1080.fontSize).toBeGreaterThan(1.8);
    expect(result.doubled1080.fontSize / result.base1080.fontSize).toBeLessThan(2.2);
    expect(result.doubled1080.barHeight / result.base1080.barHeight).toBeGreaterThan(1.8);
    expect(result.doubled1080.barHeight / result.base1080.barHeight).toBeLessThan(2.2);
  });
});
