import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttributeTracker } from '../src/rendering/AttributeTracker.js';

test('AttributeTracker defaults to 0.5 resolution scale', () => {
  const tracker = new AttributeTracker();
  assert.equal(tracker.options.resolutionScale, 0.5);
});

test('AttributeTracker preserves scale when enabling without override', () => {
  const tracker = new AttributeTracker();
  tracker.enable('index', 'index', {});
  assert.equal(tracker.options.resolutionScale, 0.5);
});

test('AttributeTracker accepts custom resolution scale', () => {
  const tracker = new AttributeTracker();
  tracker.enable('index', 'index', { resolutionScale: 2 });
  assert.equal(tracker.options.resolutionScale, 2);
});

test('AttributeTracker pick returns decoded index from mock device', async () => {
  const mockPixels = new Uint8Array([6, 0, 0, 0]); // decodes to index 5
  const device = {
    type: 'webgpu',
    readPixels: async () => mockPixels,
  };
  const tracker = new AttributeTracker({ device, size: { width: 2, height: 2, devicePixelRatio: 1 } });
  tracker.enable('index', null, { resolutionScale: 1 });
  tracker.lastTargets = { node: { width: 2, height: 2 }, edge: null };
  const result = await tracker.pick(1, 0);
  assert.equal(result.node, 5);
});
