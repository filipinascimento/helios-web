import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSupersamplingOption,
  resolveEffectiveDevicePixelRatio,
  resolveSupersamplingPreset,
  resolveSupersamplingMultiplier,
  resolveWebGLAntialiasEnabled,
  resolveWebGPUCanvasSampleCount,
  supersamplingPresetToOption,
} from '../src/rendering/qualityOptions.js';

test('supersampling defaults to legacy auto behavior on non-retina screens', () => {
  assert.equal(normalizeSupersamplingOption(undefined), 'auto');
  assert.equal(resolveSupersamplingMultiplier(1), 2);
  assert.equal(resolveSupersamplingMultiplier(1.5), 2);
  assert.equal(resolveEffectiveDevicePixelRatio(1), 2);
  assert.equal(resolveEffectiveDevicePixelRatio(1.5), 3);
});

test('supersampling auto leaves retina-class screens at native device pixel ratio', () => {
  assert.equal(resolveSupersamplingMultiplier(2), 1);
  assert.equal(resolveEffectiveDevicePixelRatio(2), 2);
  assert.equal(resolveEffectiveDevicePixelRatio(3), 3);
});

test('supersampling can be forced on or disabled explicitly', () => {
  assert.equal(resolveEffectiveDevicePixelRatio(2, { supersampling: false }), 2);
  assert.equal(resolveEffectiveDevicePixelRatio(2, { supersampling: true }), 4);
  assert.equal(resolveEffectiveDevicePixelRatio(2, { forceSupersample: true }), 4);
  assert.equal(resolveEffectiveDevicePixelRatio(2, { supersampling: 1.5 }), 3);
});

test('supersampling preset helpers normalize UI values', () => {
  assert.equal(resolveSupersamplingPreset(undefined), 'auto');
  assert.equal(resolveSupersamplingPreset(false), 'off');
  assert.equal(resolveSupersamplingPreset(true), '2x');
  assert.equal(resolveSupersamplingPreset('2x'), '2x');
  assert.equal(supersamplingPresetToOption('off'), false);
  assert.equal(supersamplingPresetToOption('auto'), 'auto');
  assert.equal(supersamplingPresetToOption('2x'), 2);
});

test('antialias options normalize per backend', () => {
  assert.equal(resolveWebGLAntialiasEnabled({}), true);
  assert.equal(resolveWebGLAntialiasEnabled({ antialias: false }), false);
  assert.equal(resolveWebGPUCanvasSampleCount({}), 1);
  assert.equal(resolveWebGPUCanvasSampleCount({ antialias: false }), 1);
  assert.equal(resolveWebGPUCanvasSampleCount({ antialias: true }), 4);
  assert.equal(resolveWebGPUCanvasSampleCount({ antialias: 8 }), 4);
});
