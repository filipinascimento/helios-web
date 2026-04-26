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
      moved: false,
      cameraMoved: false,
      wheelZoomed: false,
      lastWheelAt: -Infinity,
      lastCameraMoveAt: -Infinity,
      lastTouchAt: -Infinity,
      lastTapAt: -Infinity,
      lastTapClientX: 0,
      lastTapClientY: 0,
      suppressNativeClickUntil: -Infinity,
      pointers: new Map(),
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
  helios._ensureIndexPickingTargets = async () => {};
  helios.emit = (...args) => {
    calls.emit ??= [];
    calls.emit.push(args);
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

test('touch tap emits synthetic click and suppresses ghost native clicks', async () => {
  const { helios, calls } = createPickingHarness();
  helios._picking.node.enabled = true;
  helios._getInteractionCanvas = () => ({
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 80 };
    },
  });
  helios.indexPickingTracker = {
    async pick() {
      return { node: 3, edge: -1, nodeDepth: 0.2, edgeDepth: null };
    },
  };

  Helios.prototype._handlePointerDown.call(helios, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 30,
    clientY: 20,
  });
  await Helios.prototype._handlePointerUp.call(helios, {
    type: 'pointerup',
    pointerId: 1,
    pointerType: 'touch',
    clientX: 30,
    clientY: 20,
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  });

  const syntheticClickCount = calls.emit.filter(([type]) => type === 'node:click').length;
  assert.equal(syntheticClickCount, 1);

  await Helios.prototype._handlePointerClick.call(helios, {
    clientX: 30,
    clientY: 20,
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  }, false, { synthetic: false });
  const afterGhostClick = calls.emit.filter(([type]) => type === 'node:click').length;
  assert.equal(afterGhostClick, 1);
});

test('touch drag marks picking gesture as moved for click suppression', () => {
  const { helios } = createPickingHarness();
  helios._getInteractionCanvas = () => ({
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 80 };
    },
  });

  Helios.prototype._handlePointerDown.call(helios, {
    pointerId: 7,
    pointerType: 'touch',
    clientX: 10,
    clientY: 10,
  });
  Helios.prototype._handlePointerMove.call(helios, {
    pointerId: 7,
    pointerType: 'touch',
    clientX: 30,
    clientY: 10,
    buttons: 0,
  });

  assert.equal(helios._picking.gesture.moved, true);
  assert.equal(helios._picking.gesture.cameraMoved, true);
});

test('second touch tap within the threshold emits synthetic double-click', async () => {
  const { helios, calls } = createPickingHarness();
  helios._picking.node.enabled = true;
  helios._getInteractionCanvas = () => ({
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 80 };
    },
  });
  helios.indexPickingTracker = {
    async pick() {
      return { node: 5, edge: -1, nodeDepth: 0.1, edgeDepth: null };
    },
  };
  const tap = {
    type: 'pointerup',
    pointerId: 1,
    pointerType: 'touch',
    clientX: 44,
    clientY: 22,
    button: 0,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };

  Helios.prototype._handlePointerDown.call(helios, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 44,
    clientY: 22,
  });
  await Helios.prototype._handlePointerUp.call(helios, tap);
  Helios.prototype._handlePointerDown.call(helios, {
    pointerId: 1,
    pointerType: 'touch',
    clientX: 44,
    clientY: 22,
  });
  await Helios.prototype._handlePointerUp.call(helios, tap);

  const doubleClicks = calls.emit.filter(([type]) => type === 'node:dblclick').length;
  assert.equal(doubleClicks, 1);
});
