import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDockMode, isSideDockMode, resolveDockTarget } from '../src/ui/panels/docking.js';

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
  assert.equal(computeDockMode({ ...base, x: 200, y: 2 }), 'free');
  assert.equal(computeDockMode({ ...base, x: 200, y: 600 - 150 - 2 }), 'free');
  assert.equal(computeDockMode({ ...base, x: 200, y: 200 }), 'free');
});

test('resolveDockTarget collapses side variants into one side stack', () => {
  assert.equal(resolveDockTarget('left'), 'left');
  assert.equal(resolveDockTarget('top-left'), 'left');
  assert.equal(resolveDockTarget('bottom-left'), 'left');
  assert.equal(resolveDockTarget('right'), 'right');
  assert.equal(resolveDockTarget('top-right'), 'right');
  assert.equal(resolveDockTarget('bottom-right'), 'right');
  assert.equal(resolveDockTarget('top'), 'top');
  assert.equal(resolveDockTarget('bottom'), 'bottom');
  assert.equal(resolveDockTarget('free'), 'free');
});

test('isSideDockMode flags only side docking modes', () => {
  assert.equal(isSideDockMode('left'), true);
  assert.equal(isSideDockMode('bottom-left'), true);
  assert.equal(isSideDockMode('right'), true);
  assert.equal(isSideDockMode('top-right'), true);
  assert.equal(isSideDockMode('top'), false);
  assert.equal(isSideDockMode('bottom'), false);
  assert.equal(isSideDockMode('free'), false);
});
