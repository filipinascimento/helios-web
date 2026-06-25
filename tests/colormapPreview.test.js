import test from 'node:test';
import assert from 'node:assert/strict';
import { colormapToCssGradient, getColormapSource } from '../src/ui/utils/colormapPreview.js';

test('colormapToCssGradient returns a linear-gradient string', () => {
  const css = colormapToCssGradient('interpolateViridis', { samples: 6 });
  assert.ok(typeof css === 'string' && css.startsWith('linear-gradient('));
  assert.ok(css.includes('rgba('));
});

test('getColormapSource resolves known colormaps', () => {
  assert.equal(getColormapSource('interpolateTurbo'), 'd3');
  assert.equal(getColormapSource('CET_C1-MagicWheel'), 'CET');
});
