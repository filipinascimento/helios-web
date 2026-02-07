import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

test('indirect WebGPU backend disables interpolation and position overrides', () => {
  const helios = Object.create(Helios.prototype);
  helios.options = { webgpuBackend: 'indirect', renderer: 'webgpu' };
  helios.renderer = { device: { type: 'webgpu' } };
  helios.network = { interpolateNodeAttribute: () => true };
  helios.debug = { log: () => {} };
  helios.visuals = { setPositionDelegate: () => {}, clearPositionDelegate: () => {} };
  helios._positionDelegate = null;
  helios._positionInterpolator = null;
  helios._networkInterpolation = { active: true, lastStepTimestamp: 0 };

  helios._configurePositioning(
    { source: 'delegate', delegate: { attach: () => {} } },
    { enabled: true, backend: 'cpu' },
  );

  assert.equal(helios._supportsInterpolation(), false);
  assert.equal(helios._supportsPositionOverrides(), false);
  assert.equal(helios._positionInterpolator, null);
  assert.equal(helios._positionDelegate, null);
  assert.equal(helios._positionInterpolationOptions.enabled, false);
});
