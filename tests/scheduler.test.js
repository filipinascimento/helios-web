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

test('attribute auto-update runs after renders with optional frame skipping', () => {
  const scheduler = createScheduler({ attributeAutoUpdate: true, attributeFrameSkip: 1 });
  const attributeRuns = [];
  scheduler.setAttributeCallback((frame) => {
    attributeRuns.push(frame.frameId);
  });
  let renderId = 0;
  scheduler.setRenderCallback(() => {
    renderId += 1;
    scheduler.currentFrame.frameId = renderId;
  });

  scheduler.tick(0); // first render
  assert.deepEqual(attributeRuns, [1], 'attribute update should run on first render');

  scheduler.requestRender();
  scheduler.tick(16); // second render, should be skipped due to frameSkip=1
  assert.deepEqual(attributeRuns, [1], 'attribute update should skip one render');

  scheduler.requestRender();
  scheduler.tick(32); // third render, attribute should run
  assert.deepEqual(attributeRuns, [1, 3], 'attribute update should run after skip window');

  scheduler.stop();
});

test('attribute auto-update respects max fps when timer-driven', async () => {
  const scheduler = createScheduler({ attributeAutoUpdate: true, attributeMaxFps: 2 });
  const attributeRuns = [];
  scheduler.setAttributeCallback((frame) => {
    attributeRuns.push({ frame: frame.frameId, time: performance.now() });
  });
  let renderId = 0;
  scheduler.setRenderCallback(() => {
    renderId += 1;
    scheduler.currentFrame.frameId = renderId;
  });

  scheduler.tick(0); // render 1 + attribute run 1
  scheduler.requestRender();
  scheduler.tick(100); // render 2, too soon for attribute (max fps 2 => 500 ms)
  assert.equal(attributeRuns.length, 1);

  await new Promise((resolve) => setTimeout(resolve, 550));
  scheduler._maybeRunAttributeUpdate('test');
  assert.equal(attributeRuns.length, 2, 'attribute update should run after interval elapses');

  scheduler.stop();
});
