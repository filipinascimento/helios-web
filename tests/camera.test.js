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
