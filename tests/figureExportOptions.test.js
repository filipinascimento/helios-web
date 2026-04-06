import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFigureExportPresetList,
  normalizeFigureExportFilename,
  resolveFigureExportOptions,
  resolveFigureRelativeOverlayScale,
  resolveFigurePreviewThumbnailOptions,
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

test('resolveFigureExportOptions keeps fixed exports independent of window aspect', () => {
  const resolved = resolveFigureExportOptions({
    format: 'png',
    preset: '8k',
  }, {
    capability: { maxBitmapDimension: 8192 },
    windowSize: { width: 1000, height: 1000 },
  });

  assert.equal(resolved.width, 7680);
  assert.equal(resolved.height, 4320);
  assert.equal(resolved.bitmapWidth, 7680);
  assert.equal(resolved.bitmapHeight, 4320);
  assert.equal(resolved.framebufferWidth, 7680);
  assert.equal(resolved.framebufferHeight, 4320);
  assert.equal(resolved.cropRect.x, 0);
  assert.equal(resolved.cropRect.width, 7680);
  assert.equal(resolved.cropRect.height, 4320);
  assert.equal(resolved.cropRect.y, 0);
  assert.equal(resolved.logicalWidth, 1000);
  assert.equal(resolved.previewRect.width, 1000);
  assert.equal(resolved.previewRect.y, 218.75);
  assert.ok(Math.abs(resolved.logicalHeight - 562.5) < 1e-6);
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
  assert.equal(resolved.logicalWidth, 800);
  assert.equal(resolved.logicalHeight, 600);
  assert.equal(resolved.devicePixelRatio, 1.5);
});

test('resolveFigureExportOptions keeps window presets tied to the live logical viewport', () => {
  const resolved = resolveFigureExportOptions({
    format: 'png',
    preset: 'window@x4',
  }, {
    capability: { maxBitmapDimension: 16384 },
    windowSize: { width: 900, height: 700 },
  });

  assert.equal(resolved.width, 3600);
  assert.equal(resolved.height, 2800);
  assert.equal(resolved.bitmapWidth, 3600);
  assert.equal(resolved.bitmapHeight, 2800);
  assert.equal(resolved.logicalWidth, 900);
  assert.equal(resolved.logicalHeight, 700);
  assert.equal(resolved.devicePixelRatio, 4);
});

test('resolveFigureExportOptions keeps arbitrary same-aspect custom exports tied to the same frame', () => {
  const base = resolveFigureExportOptions({
    format: 'png',
    width: 1500,
    height: 844,
  }, {
    capability: { maxBitmapDimension: 16384 },
    windowSize: { width: 900, height: 700 },
  });
  const scaled = resolveFigureExportOptions({
    format: 'png',
    width: 3000,
    height: 1688,
  }, {
    capability: { maxBitmapDimension: 16384 },
    windowSize: { width: 900, height: 700 },
  });

  assert.equal(base.logicalWidth, scaled.logicalWidth);
  assert.equal(base.logicalHeight, scaled.logicalHeight);
  assert.equal(base.previewRect.x, scaled.previewRect.x);
  assert.equal(base.previewRect.y, scaled.previewRect.y);
  assert.equal(base.previewRect.width, scaled.previewRect.width);
  assert.equal(base.previewRect.height, scaled.previewRect.height);
  assert.ok(Math.abs(scaled.devicePixelRatio - (base.devicePixelRatio * 2)) < 1e-6);
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

test('resolveFigurePreviewThumbnailOptions preserves export aspect ratio without upscaling', () => {
  const wide = resolveFigurePreviewThumbnailOptions({
    width: 3840,
    height: 2160,
    includeLabels: true,
    includeLegends: false,
    legendScale: 1.5,
    transparentBackground: true,
    alphaMode: 'premultiplied',
    baseName: 'plot',
  }, {
    maxWidth: 320,
    maxHeight: 180,
  });

  assert.equal(wide.width, 320);
  assert.equal(wide.height, 180);
  assert.equal(wide.format, 'png');
  assert.equal(wide.preset, 'custom');
  assert.equal(wide.includeLabels, true);
  assert.equal(wide.includeLegends, false);
  assert.equal(wide.legendScale, 1.5);
  assert.equal(wide.transparentBackground, true);
  assert.equal(wide.alphaMode, 'premultiplied');
  assert.equal(wide.filename, 'plot-preview');

  const small = resolveFigurePreviewThumbnailOptions({
    width: 120,
    height: 80,
    baseName: 'tiny',
  }, {
    maxWidth: 320,
    maxHeight: 180,
  });

  assert.equal(small.width, 120);
  assert.equal(small.height, 80);
});

test('resolveFigureRelativeOverlayScale keeps overlay sizing proportional to the exported figure', () => {
  assert.equal(
    resolveFigureRelativeOverlayScale(
      { width: 3840, height: 2160 },
      { width: 1920, height: 1080 },
      1,
    ),
    2,
  );

  assert.equal(
    resolveFigureRelativeOverlayScale(
      { width: 7680, height: 4320 },
      { width: 3840, height: 2160 },
      1,
    ),
    2,
  );

  assert.equal(
    resolveFigureRelativeOverlayScale(
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      1,
    ),
    1.5,
  );
});
