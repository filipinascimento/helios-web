import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/rendering/Camera.js';
import {
  classifyGestureForSuppression,
  computeGestureCentroid,
  computePinchDistance,
  computeTwistAngle,
} from '../src/rendering/touchGestureMath.js';

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

test('touch gesture math computes centroid, pinch distance, twist, and suppression state', () => {
  const start = [
    { pointerId: 2, clientX: 0, clientY: 0 },
    { pointerId: 1, clientX: 10, clientY: 0 },
  ];
  const next = [
    { pointerId: 1, clientX: 16, clientY: 8 },
    { pointerId: 2, clientX: 2, clientY: 4 },
  ];

  assert.deepEqual(computeGestureCentroid(start), { x: 5, y: 0 });
  assert.equal(computePinchDistance(start), 10);
  assert.equal(computeTwistAngle(start), Math.PI);

  const classified = classifyGestureForSuppression(start, next, 4);
  assert.equal(classified.pointerCount, 2);
  assert.equal(classified.moved, true);
  assert.ok(classified.centroidDistance > 4);
  assert.ok(Math.abs(classified.pinchDelta) > 0);
  assert.ok(Math.abs(classified.twistDelta) > 0);
});

test('2D camera supports two-finger pinch zoom and pan', () => {
  const events = [];
  const canvas = {
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
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
  camera.zoom = 1;
  camera.updateMatrices();
  events.length = 0;

  camera.handlePointerDown({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 80, clientY: 50, shiftKey: false });
  camera.handlePointerDown({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 120, clientY: 50, shiftKey: false });
  camera.handlePointerMove({ pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 40, shiftKey: false });
  camera.handlePointerMove({ pointerId: 2, pointerType: 'touch', clientX: 140, clientY: 40, shiftKey: false });

  assert.ok(camera.zoom > 1.5, `expected pinch zoom to increase zoom, got ${camera.zoom}`);
  assert.ok(camera.pan2D[1] > 5, `expected two-finger drag to pan, got ${camera.pan2D[1]}`);
  assert.ok(events.some((detail) => detail?.origin === 'interaction' && detail?.action === 'pinch-pan' && detail?.mode === '2d'));
});

test('3D camera tracks multiple touch pointers for dolly/pan and clears them on release', () => {
  const canvas = {
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 200, height: 200 };
    },
  };
  const camera = new Camera(canvas, {
    mode: '3d',
    projection: 'perspective',
    disableControls: true,
    viewport: { width: 200, height: 200, devicePixelRatio: 1 },
    distance: 800,
  });

  camera.handlePointerDown({ pointerId: 1, pointerType: 'touch', button: 0, clientX: 70, clientY: 100, shiftKey: false });
  camera.handlePointerDown({ pointerId: 2, pointerType: 'touch', button: 0, clientX: 130, clientY: 100, shiftKey: false });
  camera.handlePointerMove({ pointerId: 1, pointerType: 'touch', clientX: 60, clientY: 90, shiftKey: false });
  camera.handlePointerMove({ pointerId: 2, pointerType: 'touch', clientX: 150, clientY: 90, shiftKey: false });

  assert.ok(camera.distance < 800, `expected pinch-out to dolly inward, got ${camera.distance}`);
  assert.ok(Math.abs(camera.pan3D[1]) > 0, `expected two-finger drag to pan, got ${camera.pan3D[1]}`);
  assert.equal(camera._activePointers.size, 2);

  camera.handlePointerUp({ pointerId: 1 });
  camera.handlePointerUp({ pointerId: 2 });
  assert.equal(camera._activePointers.size, 0);
});
