import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDockMode } from '../src/ui/panels/docking.js';

test('computeDockMode snaps to corners first', () => {
  const containerWidth = 800;
  const containerHeight = 600;
  const width = 200;
  const height = 150;
  const threshold = 18;

  assert.equal(computeDockMode({ x: 0, y: 0, width, height, containerWidth, containerHeight, threshold }), 'top-left');
  assert.equal(computeDockMode({ x: 800 - width, y: 0, width, height, containerWidth, containerHeight, threshold }), 'top-right');
  assert.equal(computeDockMode({ x: 0, y: 600 - height, width, height, containerWidth, containerHeight, threshold }), 'bottom-left');
  assert.equal(computeDockMode({ x: 800 - width, y: 600 - height, width, height, containerWidth, containerHeight, threshold }), 'bottom-right');
});

test('computeDockMode snaps to edges otherwise', () => {
  const base = {
    containerWidth: 800,
    containerHeight: 600,
    width: 200,
    height: 150,
    threshold: 18,
  };
  assert.equal(computeDockMode({ ...base, x: 2, y: 200 }), 'left');
  assert.equal(computeDockMode({ ...base, x: 800 - 200 - 2, y: 200 }), 'right');
  assert.equal(computeDockMode({ ...base, x: 200, y: 2 }), 'top');
  assert.equal(computeDockMode({ ...base, x: 200, y: 600 - 150 - 2 }), 'bottom');
  assert.equal(computeDockMode({ ...base, x: 200, y: 200 }), 'free');
});

