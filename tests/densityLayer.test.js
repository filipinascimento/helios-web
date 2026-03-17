import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDensityBandwidthViewport } from '../src/rendering/engine/DensityLayer.js';

test('resolveDensityBandwidthViewport prefers the logical figure viewport over the raster target size', () => {
  const resolved = resolveDensityBandwidthViewport(
    {
      target: {
        exportFigureLogicalViewport: { width: 1200, height: 800 },
      },
    },
    {
      viewport: { width: 900, height: 600 },
    },
    4800,
    3200,
  );

  assert.deepEqual(resolved, { width: 1200, height: 800 });
});

test('resolveDensityBandwidthViewport falls back to the camera viewport in normal rendering', () => {
  const resolved = resolveDensityBandwidthViewport(
    null,
    {
      viewport: { width: 900, height: 600 },
    },
    1800,
    1200,
  );

  assert.deepEqual(resolved, { width: 900, height: 600 });
});
