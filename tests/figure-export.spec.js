import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { resolveFigurePreviewRect } from '../src/export/figureExport.js';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
}

function decodePng(buffer) {
  return PNG.sync.read(buffer);
}

function meanAbsoluteRgbError(left, right, region = null) {
  const width = Math.min(left?.width ?? 0, right?.width ?? 0);
  const height = Math.min(left?.height ?? 0, right?.height ?? 0);
  const xStart = Math.max(0, Math.floor(region?.xStart ?? 0));
  const yStart = Math.max(0, Math.floor(region?.yStart ?? 0));
  const xEnd = Math.min(width, Math.floor(region?.xEnd ?? width));
  const yEnd = Math.min(height, Math.floor(region?.yEnd ?? height));
  let sum = 0;
  let count = 0;
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const offset = (y * width + x) * 4;
      sum += Math.abs(left.data[offset] - right.data[offset]);
      sum += Math.abs(left.data[offset + 1] - right.data[offset + 1]);
      sum += Math.abs(left.data[offset + 2] - right.data[offset + 2]);
      count += 3;
    }
  }
  return count > 0 ? sum / count : Infinity;
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
    await expect(dataPanel.locator('.helios-ui-row', { hasText: 'Interface' })).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-row', { hasText: 'Alpha' })).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-row', { hasText: 'Alpha' }).locator('select.helios-ui-select')).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-row', { hasText: 'Frame' })).toBeVisible();
  });

  test('figure controls route config and export actions through ExporterBehavior', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=64');
    await page.waitForFunction(() =>
      Boolean(window.__helios && window.__helios.ready && window.__HELIOS_DIAGNOSTICS__?.ready === true),
    );

    await page.evaluate(() => {
      window.__exporterUpdates = [];
      window.__exporterBlobCalls = [];
      const behavior = window.__helios?.behavior?.exporter;
      const originalUpdate = behavior.update.bind(behavior);
      const originalExportBlob = behavior.exportBlob.bind(behavior);
      behavior.update = function updateSpy(options) {
        window.__exporterUpdates.push(JSON.parse(JSON.stringify(options)));
        return originalUpdate(options);
      };
      behavior.exportBlob = async function exportBlobSpy(options) {
        window.__exporterBlobCalls.push(JSON.parse(JSON.stringify(options ?? {})));
        return await originalExportBlob(options);
      };
    });

    const dataPanel = page.locator('helios-panel[heading="Data"]').first();
    await dataPanel.locator('button.helios-ui-tab', { hasText: 'Figure' }).click();

    await dataPanel.locator('.helios-ui-row', { hasText: 'Format' }).locator('select').selectOption('svg');
    await dataPanel.locator('.helios-ui-row', { hasText: 'Interface' }).locator('[role="switch"]').click();
    await dataPanel.locator('.helios-ui-row', { hasText: 'Labels' }).locator('[role="switch"]').click();

    await expect.poll(async () => page.evaluate(() => ({
      format: window.__helios?.behavior?.exporter?.format?.(),
      includeInterface: window.__helios?.behavior?.exporter?.includeInterface?.(),
      includeLabels: window.__helios?.behavior?.exporter?.includeLabels?.(),
    }))).toEqual({
      format: 'svg',
      includeInterface: true,
      includeLabels: true,
    });

    await dataPanel.locator('button', { hasText: 'Export' }).click();

    await expect.poll(async () => page.evaluate(() => window.__exporterBlobCalls.length)).toBe(1);
    await expect.poll(async () => page.evaluate(() => window.__exporterUpdates.length)).toBeGreaterThan(0);
    await expect.poll(async () => page.evaluate(() => window.__exporterUpdates.some((entry) =>
      entry?.format === 'svg' || entry?.includeInterface === true || entry?.includeLabels === true,
    ))).toBe(true);
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

  test('figure tab renders a throttled thumbnail preview for the selected export size', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=128');
    await page.waitForFunction(() =>
      Boolean(window.__helios && window.__helios.ready && window.__HELIOS_DIAGNOSTICS__?.ready === true),
    );

    const dataPanel = page.locator('helios-panel[heading="Data"]').first();
    await dataPanel.locator('button.helios-ui-tab', { hasText: 'Figure' }).click();

    await expect(dataPanel.locator('.helios-ui-subpanel__header', { hasText: 'Preview' })).toBeVisible();
    await dataPanel.locator('.helios-ui-row', { hasText: 'Size' }).locator('select').selectOption('4k');

    const previewImage = dataPanel.locator('img.helios-ui-figure-preview__image');
    await expect(previewImage).toHaveAttribute('src', /blob:/);
    await expect(dataPanel.locator('.helios-ui-figure-preview__status')).toContainText('3840×2160', { timeout: 6000 });
    await expect.poll(async () => previewImage.evaluate((element) => {
      if (!element.naturalWidth || !element.naturalHeight) return 0;
      return element.naturalWidth / element.naturalHeight;
    }), { timeout: 6000 }).toBeGreaterThan(1.7);

    const metrics = await previewImage.evaluate((element) => ({
      naturalWidth: element.naturalWidth,
      naturalHeight: element.naturalHeight,
    }));

    expect(metrics.naturalWidth).toBeLessThanOrEqual(320);
    expect(metrics.naturalHeight).toBeLessThanOrEqual(180);
    expect(metrics.naturalWidth / metrics.naturalHeight).toBeGreaterThan(1.7);
    expect(metrics.naturalWidth / metrics.naturalHeight).toBeLessThan(1.8);
    await expect(dataPanel.locator('.helios-ui-figure-preview__status')).toHaveText('3840×2160');
  });

  test('preview export matches a scaled-down final export layout', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const loadImage = async (blob) => {
        const url = URL.createObjectURL(blob);
        try {
          return await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to decode export image'));
            image.src = url;
          });
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      };

      const renderImage = (image, width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height).data;
      };

      const meanAbsoluteError = (left, right, width, xStart = 0, xEnd = width) => {
        let sum = 0;
        let count = 0;
        for (let i = 0; i < left.length; i += 4) {
          const px = (i / 4) % width;
          if (px < xStart || px >= xEnd) continue;
          sum += Math.abs(left[i] - right[i]);
          sum += Math.abs(left[i + 1] - right[i + 1]);
          sum += Math.abs(left[i + 2] - right[i + 2]);
          sum += Math.abs(left[i + 3] - right[i + 3]);
          count += 4;
        }
        return count > 0 ? sum / count : Infinity;
      };

      window.__helios.labels({ enabled: true, maxVisible: 12 });
      window.__helios.legends({ showNodeSize: true, showEdgeWidth: true });
      window.__helios.requestRender?.();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const exportOptions = {
        format: 'svg',
        preset: 'custom',
        width: 1600,
        height: 900,
        includeLabels: true,
        includeLegends: true,
      };
      const previewBlob = await window.__helios.exportFigurePreviewBlob(exportOptions, {
        maxWidth: 320,
        maxHeight: 180,
      });
      const fullBlob = await window.__helios.exportFigureBlob(exportOptions);

      const previewImage = await loadImage(previewBlob);
      const fullImage = await loadImage(fullBlob);
      const width = previewImage.naturalWidth;
      const height = previewImage.naturalHeight;
      const previewData = renderImage(previewImage, width, height);
      const fullData = renderImage(fullImage, width, height);

      return {
        width,
        height,
        overallMae: meanAbsoluteError(previewData, fullData, width),
        leftMae: meanAbsoluteError(previewData, fullData, width, 0, Math.floor(width * 0.35)),
      };
    });

    expect(result.width).toBeLessThanOrEqual(320);
    expect(result.height).toBeLessThanOrEqual(180);
    expect(result.overallMae).toBeLessThan(12);
    expect(result.leftMae).toBeLessThan(10);
  });

  test('preview export preserves the square inner-frame layout when the window is wider than the export', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const loadImage = async (blob) => {
        const url = URL.createObjectURL(blob);
        try {
          return await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to decode export image'));
            image.src = url;
          });
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      };

      const renderImage = (image, width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height).data;
      };

      const meanAbsoluteError = (left, right, width, xStart = 0, xEnd = width) => {
        let sum = 0;
        let count = 0;
        for (let i = 0; i < left.length; i += 4) {
          const px = (i / 4) % width;
          if (px < xStart || px >= xEnd) continue;
          sum += Math.abs(left[i] - right[i]);
          sum += Math.abs(left[i + 1] - right[i + 1]);
          sum += Math.abs(left[i + 2] - right[i + 2]);
          sum += Math.abs(left[i + 3] - right[i + 3]);
          count += 4;
        }
        return count > 0 ? sum / count : Infinity;
      };

      window.__helios.labels({ enabled: true, maxVisible: 12 });
      window.__helios.legends({ showNodeSize: true, showEdgeWidth: true });
      window.__helios.requestRender?.();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const exportOptions = {
        format: 'svg',
        preset: 'custom',
        width: 1200,
        height: 1200,
        includeLabels: true,
        includeLegends: true,
      };
      const previewBlob = await window.__helios.exportFigurePreviewBlob(exportOptions, {
        maxWidth: 180,
        maxHeight: 180,
      });
      const fullBlob = await window.__helios.exportFigureBlob(exportOptions);

      const previewImage = await loadImage(previewBlob);
      const fullImage = await loadImage(fullBlob);
      const width = previewImage.naturalWidth;
      const height = previewImage.naturalHeight;
      const previewData = renderImage(previewImage, width, height);
      const fullData = renderImage(fullImage, width, height);

      return {
        width,
        height,
        overallMae: meanAbsoluteError(previewData, fullData, width),
        leftMae: meanAbsoluteError(previewData, fullData, width, 0, Math.floor(width * 0.35)),
      };
    });

    expect(result.width).toBeLessThanOrEqual(180);
    expect(result.height).toBeLessThanOrEqual(180);
    expect(result.width).toBe(result.height);
    expect(result.overallMae).toBeLessThan(12);
    expect(result.leftMae).toBeLessThan(10);
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
      window.__helios.legends({ showNodeSize: true, showEdgeWidth: true });
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
        const outlinedText = doc.querySelector('.helios-legend text[stroke-width]');
        const nodeColorLegend = doc.querySelector('.helios-legend[data-legend-kind="nodeColor"]');
        const barOutline = Array.from(nodeColorLegend?.querySelectorAll('rect[fill="none"]') ?? [])[0];
        const bar = nodeColorLegend?.querySelector('image')
          ?? nodeColorLegend?.querySelector('rect[fill^="url("]');
        const transformMatch = /translate\(([-\d.]+),\s*([-\d.]+)\)/u.exec(nodeColorLegend?.getAttribute('transform') ?? '');
        return {
          exportLegendScale: Number.parseFloat(layer?.getAttribute('data-export-legend-scale') ?? '0'),
          fontSize: Number.parseFloat(legendText?.getAttribute('font-size') ?? '0'),
          textOutlineWidth: Number.parseFloat(outlinedText?.getAttribute('stroke-width') ?? '0'),
          barHeight: Number.parseFloat(bar?.getAttribute('height') ?? '0'),
          barOutlineStroke: Number.parseFloat(barOutline?.getAttribute('stroke-width') ?? '0'),
          x: Number.parseFloat(transformMatch?.[1] ?? '0'),
          y: Number.parseFloat(transformMatch?.[2] ?? '0'),
        };
      };

      return {
        base1080: await extractLegendMetrics('1080p', 1),
        scaled4k: await extractLegendMetrics('4k', 1),
        scaled8k: await extractLegendMetrics('8k', 1),
        windowBase: await extractLegendMetrics('window', 1),
        window2x: await extractLegendMetrics('window@x2', 1),
        window4x: await extractLegendMetrics('window@x4', 1),
        doubled1080: await extractLegendMetrics('1080p', 2),
      };
    });

    expect(result.base1080.fontSize).toBeGreaterThan(0);
    expect(result.base1080.barHeight).toBeGreaterThan(0);
    expect(result.scaled4k.fontSize / result.base1080.fontSize).toBeGreaterThan(1.8);
    expect(result.scaled4k.fontSize / result.base1080.fontSize).toBeLessThan(2.2);
    expect(result.scaled4k.textOutlineWidth / result.base1080.textOutlineWidth).toBeGreaterThan(1.8);
    expect(result.scaled4k.textOutlineWidth / result.base1080.textOutlineWidth).toBeLessThan(2.2);
    expect(result.scaled4k.barHeight / result.base1080.barHeight).toBeGreaterThan(1.8);
    expect(result.scaled4k.barHeight / result.base1080.barHeight).toBeLessThan(2.2);
    expect(result.scaled4k.barOutlineStroke / result.base1080.barOutlineStroke).toBeGreaterThan(1.8);
    expect(result.scaled4k.barOutlineStroke / result.base1080.barOutlineStroke).toBeLessThan(2.2);
    expect(result.scaled4k.x / result.base1080.x).toBeGreaterThan(1.8);
    expect(result.scaled4k.x / result.base1080.x).toBeLessThan(2.2);
    expect(result.scaled4k.y / result.base1080.y).toBeGreaterThan(1.8);
    expect(result.scaled4k.y / result.base1080.y).toBeLessThan(2.2);
    expect(result.scaled8k.fontSize / result.scaled4k.fontSize).toBeGreaterThan(1.8);
    expect(result.scaled8k.fontSize / result.scaled4k.fontSize).toBeLessThan(2.2);
    expect(result.scaled8k.textOutlineWidth / result.scaled4k.textOutlineWidth).toBeGreaterThan(1.8);
    expect(result.scaled8k.textOutlineWidth / result.scaled4k.textOutlineWidth).toBeLessThan(2.2);
    expect(result.scaled8k.barHeight / result.scaled4k.barHeight).toBeGreaterThan(1.8);
    expect(result.scaled8k.barHeight / result.scaled4k.barHeight).toBeLessThan(2.2);
    expect(result.scaled8k.barOutlineStroke / result.scaled4k.barOutlineStroke).toBeGreaterThan(1.8);
    expect(result.scaled8k.barOutlineStroke / result.scaled4k.barOutlineStroke).toBeLessThan(2.2);
    expect(result.scaled8k.x / result.scaled4k.x).toBeGreaterThan(1.8);
    expect(result.scaled8k.x / result.scaled4k.x).toBeLessThan(2.2);
    expect(result.scaled8k.y / result.scaled4k.y).toBeGreaterThan(1.8);
    expect(result.scaled8k.y / result.scaled4k.y).toBeLessThan(2.2);
    expect(result.window2x.fontSize / result.windowBase.fontSize).toBeGreaterThan(1.8);
    expect(result.window2x.fontSize / result.windowBase.fontSize).toBeLessThan(2.2);
    expect(result.window2x.textOutlineWidth / result.windowBase.textOutlineWidth).toBeGreaterThan(1.8);
    expect(result.window2x.textOutlineWidth / result.windowBase.textOutlineWidth).toBeLessThan(2.2);
    expect(result.window2x.barHeight / result.windowBase.barHeight).toBeGreaterThan(1.8);
    expect(result.window2x.barHeight / result.windowBase.barHeight).toBeLessThan(2.2);
    expect(result.window2x.barOutlineStroke / result.windowBase.barOutlineStroke).toBeGreaterThan(1.8);
    expect(result.window2x.barOutlineStroke / result.windowBase.barOutlineStroke).toBeLessThan(2.2);
    expect(result.window2x.x / result.windowBase.x).toBeGreaterThan(1.8);
    expect(result.window2x.x / result.windowBase.x).toBeLessThan(2.2);
    expect(result.window2x.y / result.windowBase.y).toBeGreaterThan(1.8);
    expect(result.window2x.y / result.windowBase.y).toBeLessThan(2.2);
    expect(result.window4x.fontSize / result.windowBase.fontSize).toBeGreaterThan(3.6);
    expect(result.window4x.fontSize / result.windowBase.fontSize).toBeLessThan(4.4);
    expect(result.window4x.textOutlineWidth / result.windowBase.textOutlineWidth).toBeGreaterThan(3.6);
    expect(result.window4x.textOutlineWidth / result.windowBase.textOutlineWidth).toBeLessThan(4.4);
    expect(result.window4x.barHeight / result.windowBase.barHeight).toBeGreaterThan(3.6);
    expect(result.window4x.barHeight / result.windowBase.barHeight).toBeLessThan(4.4);
    expect(result.window4x.barOutlineStroke / result.windowBase.barOutlineStroke).toBeGreaterThan(3.6);
    expect(result.window4x.barOutlineStroke / result.windowBase.barOutlineStroke).toBeLessThan(4.4);
    expect(result.window4x.x / result.windowBase.x).toBeGreaterThan(3.6);
    expect(result.window4x.x / result.windowBase.x).toBeLessThan(4.4);
    expect(result.window4x.y / result.windowBase.y).toBeGreaterThan(3.6);
    expect(result.window4x.y / result.windowBase.y).toBeLessThan(4.4);
    expect(result.doubled1080.fontSize / result.base1080.fontSize).toBeGreaterThan(1.8);
    expect(result.doubled1080.fontSize / result.base1080.fontSize).toBeLessThan(2.2);
    expect(result.doubled1080.textOutlineWidth / result.base1080.textOutlineWidth).toBeGreaterThan(1.8);
    expect(result.doubled1080.textOutlineWidth / result.base1080.textOutlineWidth).toBeLessThan(2.2);
    expect(result.doubled1080.barHeight / result.base1080.barHeight).toBeGreaterThan(1.8);
    expect(result.doubled1080.barHeight / result.base1080.barHeight).toBeLessThan(2.2);
    expect(result.doubled1080.barOutlineStroke / result.base1080.barOutlineStroke).toBeGreaterThan(1.8);
    expect(result.doubled1080.barOutlineStroke / result.base1080.barOutlineStroke).toBeLessThan(2.2);
  });

  test('same-aspect fixed presets preserve framing between 1080p and 4k exports', async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await page.setViewportSize({ width: 640, height: 480 });

    const result = await page.evaluate(async () => {
      const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');

      document.body.innerHTML = '<div id="app" style="width:640px;height:480px;background:black"></div>';
      const container = document.getElementById('app');
      const { helios } = await createDeterministicHelios(container, 'webgl');
      const graphLayer = helios.renderer?.graphLayer ?? null;
      const records = [];
      const originalRender = graphLayer?.render?.bind(graphLayer);
      if (graphLayer && originalRender) {
        graphLayer.render = function instrumentedRender(context, frame, size) {
          const exportViewport = context?.target?.exportFigureLogicalViewport ?? null;
          if (exportViewport) {
            const cameraViewport = this.getCameraUniforms(frame?.camera, context)?.viewport ?? null;
            records.push({
              targetWidth: Number(context?.target?.width ?? 0),
              targetHeight: Number(context?.target?.height ?? 0),
              exportViewport: exportViewport ? { ...exportViewport } : null,
              cameraViewport: cameraViewport ? { ...cameraViewport } : null,
            });
          }
          return originalRender(context, frame, size);
        };
      }
      const network = helios.network;
      const extraIds = network.addNodes(28);

      network.withBufferAccess(() => {
        const positions = network.getNodeAttributeBuffer('_helios_visuals_position').view;
        const colors = network.getNodeAttributeBuffer('_helios_visuals_color').view;
        const sizes = network.getNodeAttributeBuffer('_helios_visuals_size').view;
        const ids = extraIds.slice(0, 24);
        for (let i = 0; i < ids.length; i += 1) {
          const id = ids[i];
          const column = i % 6;
          const row = Math.floor(i / 6);
          const pOffset = id * 3;
          const cOffset = id * 4;
          positions[pOffset] = -180 + (column * 72) + (row % 2 ? 18 : 0);
          positions[pOffset + 1] = -120 + (row * 78);
          positions[pOffset + 2] = 0;
          colors[cOffset] = 0.2 + (column * 0.1);
          colors[cOffset + 1] = 0.3 + (row * 0.12);
          colors[cOffset + 2] = 0.85 - (column * 0.08);
          colors[cOffset + 3] = 1;
          sizes[id] = 24 + ((column + row) % 3) * 8;
        }
      });

      helios.background([0, 0, 0, 1]);
      helios.edgeOpacityScale(0);
      helios.visuals.bumpNodeAttributes(
        '_helios_visuals_position',
        '_helios_visuals_color',
        '_helios_visuals_size',
      );
      helios.visuals.markPositionsDirty();
      helios.scheduler.requestGeometry();
      helios.requestRender?.();
      await new Promise((resolve) => setTimeout(resolve, 200));

      await helios.exportFigureBlob({
        format: 'png',
        preset: '1080p',
        includeLabels: false,
        includeLegends: false,
      });
      await helios.exportFigureBlob({
        format: 'png',
        preset: '4k',
        includeLabels: false,
        includeLegends: false,
      });

      if (graphLayer && originalRender) {
        graphLayer.render = originalRender;
      }

      return records;
    });

    expect(result).toHaveLength(2);
    expect(result[0].targetWidth).toBe(1920);
    expect(result[0].targetHeight).toBe(1080);
    expect(result[1].targetWidth).toBe(3840);
    expect(result[1].targetHeight).toBe(2160);
    expect(result[0].exportViewport.width).toBe(640);
    expect(result[0].exportViewport.height).toBe(360);
    expect(result[1].exportViewport.width).toBe(640);
    expect(result[1].exportViewport.height).toBe(360);
    expect(result[0].cameraViewport.width).toBe(640);
    expect(result[0].cameraViewport.height).toBe(360);
    expect(result[1].cameraViewport.width).toBe(640);
    expect(result[1].cameraViewport.height).toBe(360);
    expect(result[0].exportViewport.devicePixelRatio).toBe(1);
    expect(result[1].exportViewport.devicePixelRatio).toBe(1);
  });

  test('3d fixed-aspect export matches the preview-frame crop instead of rendering empty', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=3d&nodes=400');
    await page.setViewportSize({ width: 1280, height: 900 });
    await waitForDiagnostics(page);

    await page.evaluate(async () => {
      window.__helios.background([0, 0, 0, 1]);
      window.__helios.requestRender?.();
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    const livePng = decodePng(await page.locator('canvas.helios-layer-canvas3d').screenshot());
    const exportBase64 = await page.evaluate(async () => {
      const blob = await window.__helios.exportFigureBlob({
        format: 'png',
        preset: '4k',
        includeLabels: false,
        includeLegends: false,
      });
      const url = URL.createObjectURL(blob);
      try {
        const image = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to decode export image'));
          img.src = url;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    const exportPng = decodePng(Buffer.from(exportBase64, 'base64'));
    const previewRect = resolveFigurePreviewRect(exportPng.width, exportPng.height, {
      width: livePng.width,
      height: livePng.height,
    });

    const cropWidth = Math.max(1, Math.round(previewRect.width));
    const cropHeight = Math.max(1, Math.round(previewRect.height));
    const liveCrop = new PNG({ width: cropWidth, height: cropHeight });
    for (let y = 0; y < cropHeight; y += 1) {
      for (let x = 0; x < cropWidth; x += 1) {
        const srcX = Math.min(livePng.width - 1, Math.max(0, Math.round(previewRect.x + x)));
        const srcY = Math.min(livePng.height - 1, Math.max(0, Math.round(previewRect.y + y)));
        const srcOffset = (srcY * livePng.width + srcX) * 4;
        const dstOffset = (y * cropWidth + x) * 4;
        liveCrop.data[dstOffset] = livePng.data[srcOffset];
        liveCrop.data[dstOffset + 1] = livePng.data[srcOffset + 1];
        liveCrop.data[dstOffset + 2] = livePng.data[srcOffset + 2];
        liveCrop.data[dstOffset + 3] = livePng.data[srcOffset + 3];
      }
    }

    const downsampledExportBase64 = await page.evaluate(async ({ base64, width, height }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL('image/png').split(',')[1];
    }, { base64: exportBase64, width: cropWidth, height: cropHeight });
    const exportCrop = decodePng(Buffer.from(downsampledExportBase64, 'base64'));
    const region = {
      xStart: Math.floor(cropWidth * 0.15),
      xEnd: Math.floor(cropWidth * 0.85),
      yStart: Math.floor(cropHeight * 0.15),
      yEnd: Math.floor(cropHeight * 0.85),
    };

    expect(meanAbsoluteRgbError(liveCrop, exportCrop, region)).toBeLessThan(28);
  });

  test('transparent PNG and SVG exports stay aligned for low-opacity nodes', async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await page.setViewportSize({ width: 480, height: 480 });

    const result = await page.evaluate(async () => {
      const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');

      const loadImage = async (blob) => {
        const url = URL.createObjectURL(blob);
        try {
          return await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to decode exported image'));
            image.src = url;
          });
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      };

      const renderImage = (image, width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height).data;
      };

      const meanAbsoluteError = (left, right, width, xStart = 0, xEnd = width, yStart = 0, yEnd = Infinity) => {
        let sum = 0;
        let count = 0;
        for (let i = 0; i < left.length; i += 4) {
          const px = (i / 4) % width;
          const py = Math.floor((i / 4) / width);
          if (px < xStart || px >= xEnd || py < yStart || py >= yEnd) continue;
          sum += Math.abs(left[i] - right[i]);
          sum += Math.abs(left[i + 1] - right[i + 1]);
          sum += Math.abs(left[i + 2] - right[i + 2]);
          sum += Math.abs(left[i + 3] - right[i + 3]);
          count += 4;
        }
        return count > 0 ? sum / count : Infinity;
      };

      document.body.innerHTML = '<div id="app" style="width:480px;height:480px"></div>';
      const container = document.getElementById('app');
      const { helios } = await createDeterministicHelios(container, 'webgl');
      const network = helios.network;

      network.withBufferAccess(() => {
        const positions = network.getNodeAttributeBuffer('_helios_visuals_position').view;
        const colors = network.getNodeAttributeBuffer('_helios_visuals_color').view;
        const sizes = network.getNodeAttributeBuffer('_helios_visuals_size').view;
        const centers = [
          [-18, -8],
          [0, 0],
          [12, 8],
          [24, -4],
        ];
        for (let i = 0; i < centers.length; i += 1) {
          const pOffset = i * 3;
          const cOffset = i * 4;
          positions[pOffset] = centers[i][0];
          positions[pOffset + 1] = centers[i][1];
          positions[pOffset + 2] = 0;
          colors[cOffset + 3] = 0.075 + (i * 0.015);
          sizes[i] = 170;
        }
      });

      helios.background([0, 0, 0, 0]);
      helios.edgeOpacityScale(0);
      helios.visuals.bumpNodeAttributes(
        '_helios_visuals_position',
        '_helios_visuals_color',
        '_helios_visuals_size',
      );
      helios.visuals.markPositionsDirty();
      helios.scheduler.requestGeometry();
      helios.requestRender?.();
      await new Promise((resolve) => setTimeout(resolve, 150));

      const pngBlob = await helios.exportFigureBlob({
        format: 'png',
        preset: 'custom',
        width: 720,
        height: 720,
        transparentBackground: true,
        includeLabels: false,
        includeLegends: false,
      });
      const svgBlob = await helios.exportFigureBlob({
        format: 'svg',
        preset: 'custom',
        width: 720,
        height: 720,
        transparentBackground: true,
        includeLabels: false,
        includeLegends: false,
      });

      const pngImage = await loadImage(pngBlob);
      const svgImage = await loadImage(svgBlob);
      const width = pngImage.naturalWidth;
      const height = pngImage.naturalHeight;
      const pngData = renderImage(pngImage, width, height);
      const svgData = renderImage(svgImage, width, height);

      return {
        overallMae: meanAbsoluteError(pngData, svgData, width, 0, width, 0, height),
        centerMae: meanAbsoluteError(
          pngData,
          svgData,
          width,
          Math.floor(width * 0.2),
          Math.ceil(width * 0.8),
          Math.floor(height * 0.2),
          Math.ceil(height * 0.8),
        ),
      };
    });

    expect(result.overallMae).toBeLessThan(4);
    expect(result.centerMae).toBeLessThan(3);
  });

  test('transparent PNG export preserves dense low-opacity node overlap brightness against the live canvas', async ({ page }) => {
    await page.goto('/tests/fixtures/blank.html');
    await page.setViewportSize({ width: 480, height: 480 });
    await page.evaluate(async () => {
      document.body.style.margin = '0';
      document.body.style.background = 'rgb(30, 20, 20)';
      const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
      document.body.innerHTML = '<div id="app" style="width:480px;height:480px;background:rgb(30,20,20)"></div>';
      const { helios } = await createDeterministicHelios(document.getElementById('app'), 'webgl');
      globalThis.__exportTestHelios = helios;
      const network = helios.network;
      const extraIds = network.addNodes(496);
      const random = ((seed) => () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0xffffffff;
      })(7);

      network.withBufferAccess(() => {
        const positions = network.getNodeAttributeBuffer('_helios_visuals_position').view;
        const colors = network.getNodeAttributeBuffer('_helios_visuals_color').view;
        const sizes = network.getNodeAttributeBuffer('_helios_visuals_size').view;
        for (let i = 0; i < extraIds.length; i += 1) {
          const id = extraIds[i];
          const angle = random() * Math.PI * 2;
          const radius = Math.pow(random(), 1.8) * 45;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          const pOffset = id * 3;
          const cOffset = id * 4;
          positions[pOffset] = x;
          positions[pOffset + 1] = y;
          positions[pOffset + 2] = 0;
          colors[cOffset] = 0.85 + (random() * 0.15);
          colors[cOffset + 1] = 0.35 + (random() * 0.3);
          colors[cOffset + 2] = 0.05 + (random() * 0.15);
          colors[cOffset + 3] = 0.02 + (random() * 0.03);
          sizes[id] = 38 + (random() * 18);
        }
      });

      helios.background([0, 0, 0, 0]);
      helios.edgeOpacityScale(0);
      helios.visuals.bumpNodeAttributes(
        '_helios_visuals_position',
        '_helios_visuals_color',
        '_helios_visuals_size',
      );
      helios.visuals.markPositionsDirty();
      helios.scheduler.requestGeometry();
      helios.requestRender?.();
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    const livePng = decodePng(await page.locator('canvas.helios-layer-canvas3d').screenshot());
    const exportBase64 = await page.evaluate(async () => {
      const liveCanvas = document.querySelector('canvas.helios-layer-canvas3d');
      const exportWidth = Math.max(1, Number(liveCanvas?.width ?? 480));
      const exportHeight = Math.max(1, Number(liveCanvas?.height ?? 480));
      const compareWidth = Math.max(1, Number(liveCanvas?.clientWidth ?? 480));
      const compareHeight = Math.max(1, Number(liveCanvas?.clientHeight ?? 480));
      const blob = await globalThis.__exportTestHelios.exportFigureBlob({
        format: 'png',
        preset: 'custom',
        width: exportWidth,
        height: exportHeight,
        transparentBackground: true,
        alphaMode: 'straight',
        includeLabels: false,
        includeLegends: false,
      });
      const url = URL.createObjectURL(blob);
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to decode exported image'));
        img.src = url;
      });
      try {
        const canvas = document.createElement('canvas');
        canvas.width = compareWidth;
        canvas.height = compareHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgb(30,20,20)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png').split(',')[1];
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    const exportPng = decodePng(Buffer.from(exportBase64, 'base64'));
    const centerRegion = {
      xStart: Math.floor(livePng.width * 0.25),
      xEnd: Math.floor(livePng.width * 0.75),
      yStart: Math.floor(livePng.height * 0.25),
      yEnd: Math.floor(livePng.height * 0.75),
    };

    expect(meanAbsoluteRgbError(livePng, exportPng, centerRegion)).toBeLessThan(20);
  });

  test('density export keeps the same pattern for window and window@x4 exports', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const loadImage = async (blob) => {
        const url = URL.createObjectURL(blob);
        try {
          return await new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('Failed to decode export image'));
            image.src = url;
          });
        } finally {
          setTimeout(() => URL.revokeObjectURL(url), 0);
        }
      };

      const renderImage = (image, width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height).data;
      };

      const meanAbsoluteError = (left, right, width, xStart = 0, xEnd = width, yStart = 0, yEnd = Infinity) => {
        let sum = 0;
        let count = 0;
        for (let i = 0; i < left.length; i += 4) {
          const px = (i / 4) % width;
          const py = Math.floor((i / 4) / width);
          if (px < xStart || px >= xEnd || py < yStart || py >= yEnd) continue;
          sum += Math.abs(left[i] - right[i]);
          sum += Math.abs(left[i + 1] - right[i + 1]);
          sum += Math.abs(left[i + 2] - right[i + 2]);
          sum += Math.abs(left[i + 3] - right[i + 3]);
          count += 4;
        }
        return count > 0 ? sum / count : Infinity;
      };

      window.__helios.background([0, 0, 0, 1]);
      window.__helios.nodeOpacityScale(0);
      window.__helios.edgeOpacityScale(0);
      window.__helios.density({
        enabled: true,
        property: 'Uniform',
        compareProperty: 'None',
        qualityScale: 0.6,
        bandwidth: 42,
        weightScale: 900,
        topographic: false,
        scaleWithZoom: false,
      });
      window.__helios.requestRender?.();
      await new Promise((resolve) => setTimeout(resolve, 200));

      const smallBlob = await window.__helios.exportFigureBlob({
        format: 'png',
        preset: 'window',
        includeLabels: false,
        includeLegends: false,
      });
      const largeBlob = await window.__helios.exportFigureBlob({
        format: 'png',
        preset: 'window@x4',
        includeLabels: false,
        includeLegends: false,
      });

      const smallImage = await loadImage(smallBlob);
      const largeImage = await loadImage(largeBlob);
      const width = smallImage.naturalWidth;
      const height = smallImage.naturalHeight;
      const smallData = renderImage(smallImage, width, height);
      const largeData = renderImage(largeImage, width, height);

      return {
        overallMae: meanAbsoluteError(smallData, largeData, width, 0, width, 0, height),
        centerMae: meanAbsoluteError(
          smallData,
          largeData,
          width,
          Math.floor(width * 0.15),
          Math.ceil(width * 0.85),
          Math.floor(height * 0.15),
          Math.ceil(height * 0.85),
        ),
      };
    });

    expect(result.overallMae).toBeLessThan(12);
    expect(result.centerMae).toBeLessThan(10);
  });
});
