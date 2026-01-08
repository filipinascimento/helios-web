import test from 'node:test';
import assert from 'node:assert/strict';
import { computeResizedWidth } from '../src/ui/panels/resize.js';

test('computeResizedWidth resizes from right edge', () => {
  const next = computeResizedWidth({
    startWidth: 300,
    startClientX: 100,
    clientX: 140,
    edge: 'right',
    minWidth: 240,
    maxWidth: 1000,
  });
  assert.equal(next, 340);
});

test('computeResizedWidth resizes from left edge', () => {
  const next = computeResizedWidth({
    startWidth: 300,
    startClientX: 200,
    clientX: 160,
    edge: 'left',
    minWidth: 240,
    maxWidth: 1000,
  });
  assert.equal(next, 340);
});

test('computeResizedWidth clamps to min/max', () => {
  assert.equal(computeResizedWidth({
    startWidth: 260,
    startClientX: 100,
    clientX: 200,
    edge: 'right',
    minWidth: 240,
    maxWidth: 255,
  }), 255);
  assert.equal(computeResizedWidth({
    startWidth: 260,
    startClientX: 100,
    clientX: -1000,
    edge: 'right',
    minWidth: 240,
    maxWidth: 1000,
  }), 240);
});
