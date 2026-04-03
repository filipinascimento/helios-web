import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

function createPickingHarness() {
  const calls = {
    attach: 0,
    detach: 0,
    reset: [],
    configure: [],
    render: 0,
    trackerEnable: [],
    trackerResize: [],
  };
  const helios = Object.create(Helios.prototype);
  helios._picking = {
    node: { enabled: false, hoverEnabled: true },
    edge: { enabled: false, hoverEnabled: true },
    options: {
      resolutionScale: 0.5,
      trackDepth: false,
      maxFps: 30,
      clickRequiresStationary: true,
      clickMoveTolerancePx: 4,
      suppressClickAfterWheelMs: 200,
    },
    hover: { kind: null, index: -1, depth: null },
    pointer: { x: 0, y: 0, clientX: 0, clientY: 0, inside: false },
    suppressHover: false,
    cameraIdleTimer: null,
    hoverThrottleTimer: null,
    gesture: {
      active: false,
      startClientX: 0,
      startClientY: 0,
      moved: false,
      cameraMoved: false,
      wheelZoomed: false,
      lastWheelAt: -Infinity,
      lastCameraMoveAt: -Infinity,
    },
    _raf: null,
    _inFlight: false,
    _rerun: false,
    _lastPickTime: -Infinity,
  };
  helios.renderer = { canvas: null };
  helios.ready = { then() {} };
  helios.size = { width: 100, height: 80 };
  helios.attributeUpdateOptions = { autoUpdate: false, maxFps: null, frameSkip: null };
  helios.indexPickingTracker = {
    enable(nodeAttr, edgeAttr, options) {
      calls.trackerEnable.push({ nodeAttr, edgeAttr, options });
    },
    resize(size) {
      calls.trackerResize.push(size);
    },
  };
  helios.scheduler = {
    configureAttributeUpdates(options) {
      calls.configure.push(options);
    },
    requestRender() {
      calls.render += 1;
    },
  };
  helios._attachPickingListeners = () => {
    calls.attach += 1;
  };
  helios._detachPickingListeners = () => {
    calls.detach += 1;
  };
  helios._resetHover = (reason) => {
    calls.reset.push(reason);
    helios._picking.hover = { kind: null, index: -1, depth: null };
  };
  return { helios, calls };
}

test('enableNodePicking can specialize node picking down to click-only tracking', () => {
  const { helios, calls } = createPickingHarness();

  Helios.prototype.enableNodePicking.call(helios, {
    resolutionScale: 0.25,
    maxFps: 60,
    hoverEnabled: false,
  });

  assert.equal(helios._picking.node.enabled, true);
  assert.equal(helios._picking.node.hoverEnabled, false);
  assert.deepEqual(calls.trackerEnable, [{
    nodeAttr: '$index',
    edgeAttr: null,
    options: {
      resolutionScale: 0.25,
      trackDepth: false,
      autoRender: true,
    },
  }]);
  assert.deepEqual(calls.trackerResize, [{ width: 100, height: 80 }]);
  assert.deepEqual(calls.configure.at(-1), { autoUpdate: false });
  assert.deepEqual(calls.reset, ['config']);
  assert.equal(calls.render, 1);
});

test('hover hit resolution ignores click-only node picking and keeps edge hover active', () => {
  const { helios } = createPickingHarness();
  helios._picking.node.enabled = true;
  helios._picking.node.hoverEnabled = false;
  helios._picking.edge.enabled = true;
  helios._picking.edge.hoverEnabled = true;

  const hit = Helios.prototype._resolveHoverHit.call(helios, {
    node: 12,
    edge: 7,
    nodeDepth: 0.1,
    edgeDepth: 0.4,
  });

  assert.deepEqual(hit, { kind: 'edge', index: 7, depth: 0.4 });
});
