import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrailingThrottle } from '../src/ui/panels/CameraPanel.js';

test('createTrailingThrottle collapses rapid updates into one trailing callback', async () => {
  const calls = [];
  const throttled = createTrailingThrottle((value) => {
    calls.push(value);
  }, 20);

  throttled(1);
  throttled(2);
  throttled(3);

  assert.deepEqual(calls, []);

  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(calls, [3]);

  throttled(4);
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.deepEqual(calls, [3, 4]);
});
