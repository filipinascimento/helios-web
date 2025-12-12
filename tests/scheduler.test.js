import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scheduler } from '../src/scheduler/Scheduler.js';

if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = () => 0;
}
if (typeof globalThis.cancelAnimationFrame !== 'function') {
  globalThis.cancelAnimationFrame = () => {};
}

function createScheduler(options = {}) {
  const scheduler = new Scheduler(options);
  scheduler.setGeometryCallback(() => ({ frame: true }));
  scheduler.setRenderCallback(() => {});
  scheduler.running = true;
  scheduler._lastRenderTime = -Infinity;
  return scheduler;
}

test('renders once initially, then only when requested', () => {
  const scheduler = createScheduler();
  let renders = 0;
  scheduler.setRenderCallback(() => {
    renders += 1;
  });

  scheduler.tick(0);
  assert.equal(renders, 1);

  scheduler.tick(16);
  assert.equal(renders, 1, 'should not render again without request');

  scheduler.requestRender();
  scheduler.tick(32);
  assert.equal(renders, 2, 'should render when explicitly requested');
});

test('geometry updates flag rendering on next tick', () => {
  const scheduler = createScheduler();
  let renders = 0;
  let geometryRuns = 0;
  scheduler.setGeometryCallback(() => {
    geometryRuns += 1;
    return { frame: geometryRuns };
  });
  scheduler.setRenderCallback(() => {
    renders += 1;
  });

  scheduler.tick(0);
  assert.equal(renders, 1);
  assert.equal(geometryRuns, 1);

  scheduler.requestGeometry();
  scheduler.tick(16);
  assert.equal(geometryRuns, 2, 'geometry should run after request');
  assert.equal(renders, 2, 'render should follow geometry update');
});

test('maxFps throttles renders but preserves pending render requests', () => {
  const scheduler = createScheduler({ maxFps: 1 });
  let renders = 0;
  scheduler.setRenderCallback(() => {
    renders += 1;
  });

  scheduler.tick(0);
  assert.equal(renders, 1);

  scheduler.requestRender();
  scheduler.tick(500);
  assert.equal(renders, 1, 'should skip render before interval elapses');

  scheduler.tick(1100);
  assert.equal(renders, 2, 'should render once interval has elapsed');
});
