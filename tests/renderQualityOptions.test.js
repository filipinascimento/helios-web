import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSupersamplingOption,
  resolveEffectiveDevicePixelRatio,
  resolveGraphicsPowerPreference,
  resolveSupersamplingPreset,
  resolveSupersamplingMultiplier,
  resolveWebGLContextAttributes,
  resolveWebGLAntialiasEnabled,
  resolveWebGPUAdapterOptions,
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

test('graphics initialization defaults prefer high-performance adapters', () => {
  assert.equal(resolveGraphicsPowerPreference({}), 'high-performance');
  assert.deepEqual(resolveWebGPUAdapterOptions({}), { powerPreference: 'high-performance' });
  assert.deepEqual(resolveWebGLContextAttributes({}), {
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
});

test('graphics initialization options allow backend-specific overrides', () => {
  assert.deepEqual(resolveWebGPUAdapterOptions({
    powerPreference: 'high-performance',
    webgpuAdapterOptions: { powerPreference: 'low-power', forceFallbackAdapter: true },
  }), {
    powerPreference: 'low-power',
    forceFallbackAdapter: true,
  });

  assert.deepEqual(resolveWebGLContextAttributes({
    antialias: false,
    webglContextAttributes: {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    },
  }), {
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    alpha: false,
    preserveDrawingBuffer: true,
  });
});
