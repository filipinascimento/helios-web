import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Mapper,
  DEFAULT_NODE_COLORMAP,
  colormaps,
  colormapToScheme,
  colormapToInterpolator,
  createColormapScale,
} from '../src/index.js';

const within = (value, target, delta = 0.05) => Math.abs(value - target) <= delta;

function rgbaInRange(rgba) {
  assert.ok(Array.isArray(rgba));
  assert.ok(rgba.length >= 3);
  rgba.forEach((v) => assert.ok(v >= 0 && v <= 1, `expected component ${v} to be within [0,1]`));
}

test('loads embedded cmasher colormap', () => {
  const colors = colormapToScheme('cmasher_amber', 4);
  assert.equal(colors.length, 4);
  colors.forEach(rgbaInRange);
});

test('default node colormap resolves with CET aliases', () => {
  assert.equal(colormapToInterpolator(DEFAULT_NODE_COLORMAP), colormapToInterpolator('CET: L08-NeonBurst'));
  const colors = colormapToScheme(DEFAULT_NODE_COLORMAP, 5);
  assert.equal(colors.length, 5);
  colors.forEach(rgbaInRange);
});

test('d3 interpolator resolves by name and scales across domain', () => {
  const scale = createColormapScale('interpolateViridis', { domain: [0, 10] });
  const start = scale(0);
  const end = scale(10);
  rgbaInRange(start);
  rgbaInRange(end);
  // interpolateViridis starts with a deep purple and ends near yellow.
  assert.ok(start[0] < end[0], 'expected more red at the end of the scale');
  assert.ok(start[2] > end[2], 'expected less blue at the end of the scale');
});

test('continuous colormap can be sampled as categorical scheme', () => {
  const scheme = colormapToScheme(colormaps.d3.interpolatePlasma, 6);
  assert.equal(scheme.length, 6);
  scheme.forEach(rgbaInRange);
});

test('category18 categorical scheme repeats to requested size', () => {
  const scheme = colormapToScheme('category18', 20);
  assert.equal(scheme.length, 20);
  scheme.forEach(rgbaInRange);
  assert.deepEqual(scheme[0], scheme[18]);
  assert.deepEqual(scheme[1], scheme[19]);
});

test('mapper colormap channel maps values to rgba', () => {
  const mapper = new Mapper();
  mapper.channel('color').from('weight').colormap('interpolateMagma', { domain: [0, 1] }).done();
  const mapped = mapper.mapItem({ weight: 0.5 });
  rgbaInRange(mapped.color);
});

test('colormapToInterpolator returns function', () => {
  const interp = colormapToInterpolator('interpolateTurbo');
  const value = interp(0.25);
  rgbaInRange(value);
  assert.ok(within(value[3], 1));
});
