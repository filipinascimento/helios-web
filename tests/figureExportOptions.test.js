import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFigureExportPresetList,
  normalizeFigureExportFilename,
  resolveFigureExportOptions,
  resolveFigurePreviewRect,
} from '../src/export/figureExport.js';

test('normalizeFigureExportFilename enforces a safe extension', () => {
  assert.equal(normalizeFigureExportFilename('my plot', 'svg'), 'my plot.svg');
  assert.equal(normalizeFigureExportFilename('plot.png', 'svg'), 'plot.svg');
  assert.equal(normalizeFigureExportFilename('bad/name', 'png'), 'bad_name.png');
});

test('resolveFigureExportOptions derives preset and raster sizes', () => {
  const resolved = resolveFigureExportOptions({
    filename: 'figure',
    format: 'svg',
    preset: '4k',
    supersampling: 2,
    includeLabels: true,
    legendScale: 1.25,
    transparentBackground: true,
    alphaMode: 'premultiplied',
  }, {
    capability: { maxBitmapDimension: 16384 },
    windowSize: { width: 800, height: 600 },
  });

  assert.equal(resolved.filename, 'figure.svg');
  assert.equal(resolved.width, 3840);
  assert.equal(resolved.height, 2160);
  assert.equal(resolved.bitmapWidth, 7680);
  assert.equal(resolved.bitmapHeight, 4320);
  assert.equal(resolved.includeLabels, true);
  assert.equal(resolved.includeLegends, true);
  assert.equal(resolved.legendScale, 1.25);
  assert.equal(resolved.transparentBackground, true);
  assert.equal(resolved.alphaMode, 'premultiplied');
  assert.equal(resolved.fitsCapability, true);
});

test('resolveFigureExportOptions ignores alphaMode when background is enabled', () => {
  const resolved = resolveFigureExportOptions({
    format: 'png',
    preset: 'window',
    transparentBackground: false,
    alphaMode: 'premultiplied',
  }, {
    capability: { maxBitmapDimension: 16384 },
    windowSize: { width: 800, height: 600 },
  });

  assert.equal(resolved.transparentBackground, false);
  assert.equal(resolved.alphaMode, 'straight');
});

test('buildFigureExportPresetList marks oversized presets unavailable', () => {
  const presets = buildFigureExportPresetList(
    { width: 960, height: 540 },
    { maxBitmapDimension: 5000 },
    2,
  );

  assert.equal(presets.find((entry) => entry.id === 'window')?.available, true);
  assert.equal(presets.find((entry) => entry.id === '4k')?.available, false);
  assert.equal(presets.find((entry) => entry.id === '8k')?.available, false);
  assert.equal(presets.find((entry) => entry.id === 'custom')?.available, true);
});

test('resolveFigureExportOptions defaults to a DPR-aware window preset', () => {
  const resolved = resolveFigureExportOptions({}, {
    capability: { maxBitmapDimension: 16384, windowDevicePixelRatio: 1.5 },
    windowSize: { width: 800, height: 600 },
    windowDevicePixelRatio: 1.5,
  });

  assert.equal(resolved.preset, 'window@1.5x');
  assert.equal(resolved.width, 1200);
  assert.equal(resolved.height, 900);
});

test('resolveFigurePreviewRect letterboxes wider exports inside the current view', () => {
  const rect = resolveFigurePreviewRect(1920, 1080, { width: 1000, height: 1000 });

  assert.equal(rect.x, 0);
  assert.equal(rect.width, 1000);
  assert.equal(Math.round(rect.height), 563);
  assert.equal(Math.round(rect.y), 219);
});

test('resolveFigurePreviewRect pillarboxes taller exports inside the current view', () => {
  const rect = resolveFigurePreviewRect(1000, 1000, { width: 1600, height: 900 });

  assert.equal(rect.y, 0);
  assert.equal(rect.height, 900);
  assert.equal(rect.width, 900);
  assert.equal(rect.x, 350);
});
