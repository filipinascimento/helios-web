import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/rendering/Camera.js';

function transformPoint(matrix, x, y, z = 0, w = 1) {
  return [
    (matrix[0] * x) + (matrix[4] * y) + (matrix[8] * z) + (matrix[12] * w),
    (matrix[1] * x) + (matrix[5] * y) + (matrix[9] * z) + (matrix[13] * w),
    (matrix[2] * x) + (matrix[6] * y) + (matrix[10] * z) + (matrix[14] * w),
    (matrix[3] * x) + (matrix[7] * y) + (matrix[11] * z) + (matrix[15] * w),
  ];
}

test('2D camera uses the same positive-up Y convention as 3D', () => {
  const canvas = {
    addEventListener() {},
    removeEventListener() {},
  };
  const camera = new Camera(canvas, {
    mode: '2d',
    projection: 'orthographic',
    disableControls: true,
    viewport: { width: 200, height: 100, devicePixelRatio: 1 },
  });

  camera.zoom = 1;
  camera.pan2D[0] = 0;
  camera.pan2D[1] = 0;
  camera.updateMatrices();

  assert.equal(camera.up[1], 1);
  assert.ok(camera.projectionMatrix[5] > 0);

  const above = transformPoint(camera.viewProjectionMatrix, 0, 10);
  const below = transformPoint(camera.viewProjectionMatrix, 0, -10);
  assert.ok(above[1] > 0);
  assert.ok(below[1] < 0);
});

test('camera emits interaction detail for wheel zoom changes', () => {
  const events = [];
  const canvas = {
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 100 };
    },
  };
  const camera = new Camera(canvas, {
    mode: '2d',
    projection: 'orthographic',
    disableControls: true,
    viewport: { width: 200, height: 100, devicePixelRatio: 1 },
    onChange: (detail) => events.push(detail),
  });
  events.length = 0;

  camera.handleWheel({
    deltaY: -120,
    clientX: 100,
    clientY: 50,
    preventDefault() {},
    stopPropagation() {},
  });

  assert.equal(events.length, 1);
  assert.equal(events[0]?.origin, 'interaction');
  assert.equal(events[0]?.type, 'wheel');
  assert.equal(events[0]?.action, 'zoom');
});
