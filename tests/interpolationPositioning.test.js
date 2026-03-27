import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios, PositionDelegate } from '../src/index.js';
import { StaticLayout } from '../src/layouts/Layout.js';

function almostEqualArray(actual, expected, epsilon = 1e-4) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= epsilon,
      `value mismatch at ${i}: ${actual[i]} vs ${expected[i]}`,
    );
  }
}

function createPositionHarness(initialPositions) {
  const positions = new Float32Array(initialPositions);
  const network = {
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: () => ({ view: positions }),
  };
  let dirtyCalls = 0;
  const visuals = {
    withBufferAccess: (fn) => fn(),
    markPositionsDirty: () => { dirtyCalls += 1; },
  };
  let geometryCalls = 0;
  let renderCalls = 0;
  const scheduler = {
    requestGeometry: () => { geometryCalls += 1; },
    requestRender: () => { renderCalls += 1; },
  };
  const graphLayerState = { delegate: null, interpolation: null };
  const renderer = {
    graphLayer: {
      setPositionDelegate: (delegate) => { graphLayerState.delegate = delegate; },
      setPositionInterpolationState: (state) => { graphLayerState.interpolation = state; },
    },
  };

  const helios = Object.create(Helios.prototype);
  helios.network = network;
  helios.visuals = visuals;
  helios.scheduler = scheduler;
  helios.renderer = renderer;
  helios.debug = { log: () => {} };
  helios._positionsConfig = { source: 'network', delegate: null };
  helios._activePositionDelegate = null;
  helios._interpolationConfig = {
    enabled: false,
    mode: 'gpu',
    durationMode: 'fixed',
    durationMs: 120,
    adaptiveDuration: false,
    adaptiveDurationSamples: 5,
    adaptiveDurationWindowMs: 5000,
    adaptiveDurationScale: 1,
    adaptiveDurationMinMs: 16,
    adaptiveDurationMaxMs: 5000,
    easing: 'linear',
    smoothing: 6,
    minDisplacementRatio: 0.0005,
  };
  helios._interpolationRuntime = {
    active: false,
    startedAt: 0,
    lastFrameAt: 0,
    lastTargetUpdateAt: 0,
    layoutElapsedMs: 16,
    sourcePositions: null,
    targetPositions: null,
    mixedPositions: null,
    sourceVersion: 0,
    targetVersion: 0,
    sourceCount: 0,
    factor: 1,
    delegateVersion: null,
    sourceWebGPUBuffer: null,
    sourceWebGLTexture: null,
    sourceTextureMeta: null,
    lastRenderedPositions: null,
    effectiveDurationMs: 120,
    layoutIntervalsMs: [],
  };

  return {
    helios,
    positions,
    graphLayerState,
    getDirtyCalls: () => dirtyCalls,
    getGeometryCalls: () => geometryCalls,
    getRenderCalls: () => renderCalls,
  };
}

function applyLayoutPositionPolicy(helios, delegate = null) {
  helios._layout = delegate
    ? { getPositionDelegate: () => delegate }
    : {};
  helios._enforcePositionSourcePolicy(helios._layout, { resetInterpolation: false });
}

test('positions() follows active layout policy for delegate and network sources', () => {
  const { helios, graphLayerState, getGeometryCalls, getRenderCalls } = createPositionHarness([0, 0, 0]);
  let attached = 0;
  let detached = 0;
  class LifecycleDelegate extends PositionDelegate {
    synchronizeTopology() {}
    onAttach(context) {
      super.onAttach(context);
      attached += 1;
    }
    onDetach(context) {
      super.onDetach(context);
      detached += 1;
    }
    getNodePositionView() { return null; }
  }
  const delegate = new LifecycleDelegate();

  assert.deepEqual(helios.positions(), { source: 'network', delegate: null });
  applyLayoutPositionPolicy(helios, delegate);
  assert.equal(helios.positions().source, 'delegate');
  assert.equal(helios.positions().delegate, delegate);
  assert.equal(attached, 1);
  assert.equal(graphLayerState.delegate, delegate);
  helios.positions({ source: 'network' });
  assert.equal(helios.positions().source, 'delegate');
  assert.equal(helios.positions().delegate, delegate);
  assert.equal(graphLayerState.delegate, delegate);

  applyLayoutPositionPolicy(helios, null);
  assert.equal(helios.positions().source, 'network');
  assert.equal(helios.positions().delegate, null);
  assert.ok(detached >= 1);
  assert.equal(graphLayerState.delegate, null);
  assert.ok(getGeometryCalls() >= 3);
  assert.ok(getRenderCalls() >= 3);
});

test('snapshotDelegatePositions() returns delegate snapshots for inspection', async () => {
  const { helios } = createPositionHarness([0, 0, 0, 1, 1, 0]);
  const expected = new Float32Array([4, 5, 0, 6, 7, 0]);
  class SnapshotDelegate extends PositionDelegate {
    synchronizeTopology() {}
    getNodePositionView() { return null; }
    snapshotNodePositions() { return new Float32Array(expected); }
  }
  const delegate = new SnapshotDelegate();
  applyLayoutPositionPolicy(helios, delegate);

  const snapshot = await helios.snapshotDelegatePositions();
  assert.ok(snapshot instanceof Float32Array);
  assert.deepEqual(Array.from(snapshot), Array.from(expected));
});

test('syncDelegatePositionsToNetwork() copies delegate positions into network buffers', async () => {
  const harness = createPositionHarness([0, 0, 0, 1, 1, 0]);
  const { helios, positions, getDirtyCalls, getGeometryCalls, getRenderCalls } = harness;
  const next = new Float32Array([10, 20, 0, 30, 40, 0]);
  class SyncDelegate extends PositionDelegate {
    synchronizeTopology() {}
    getNodePositionView() { return null; }
    snapshotNodePositions() { return new Float32Array(next); }
  }
  const delegate = new SyncDelegate();
  applyLayoutPositionPolicy(helios, delegate);
  const dirtyBefore = getDirtyCalls();
  const geometryBefore = getGeometryCalls();
  const renderBefore = getRenderCalls();

  const wrote = await helios.syncDelegatePositionsToNetwork();
  assert.equal(wrote, true);
  almostEqualArray(Array.from(positions), Array.from(next));
  assert.equal(getDirtyCalls(), dirtyBefore + 1);
  assert.equal(getGeometryCalls(), geometryBefore + 1);
  assert.equal(getRenderCalls(), renderBefore + 1);
});

test('layout() seeds incoming network-backed layouts from the outgoing delegate snapshot before switching sources', async () => {
  const {
    helios,
    positions,
    graphLayerState,
    getGeometryCalls,
    getRenderCalls,
  } = createPositionHarness([
    0, 0, 0,
    0, 0, 0,
  ]);
  const calls = {
    setLayouts: [],
    requestLayout: [],
    layoutChanged: [],
    labelReasons: [],
    previousDisposed: 0,
  };

  const delegateSnapshot = new Float32Array([
    1, 2, 3,
    4, 5, 6,
  ]);
  class HandoffDelegate extends PositionDelegate {
    synchronizeTopology() {}
    getWebGPUPositionBuffer() { return null; }
    async snapshotNodePositions() { return delegateSnapshot; }
  }
  const previousDelegate = new HandoffDelegate();
  const previousLayout = {
    getPositionDelegate: () => previousDelegate,
    dispose: () => { calls.previousDisposed += 1; },
  };

  helios._layout = previousLayout;
  helios._enforcePositionSourcePolicy(previousLayout, { resetInterpolation: false });
  helios._interpolationConfig.enabled = true;
  helios._interpolationRuntime.lastRenderedPositions = new Float32Array([
    99, 99, 99,
    77, 77, 77,
  ]);
  helios.layers = { size: { width: 120, height: 80 } };
  helios.scheduler.setLayout = (layout) => { calls.setLayouts.push(layout); };
  helios.scheduler.requestLayout = (reason) => { calls.requestLayout.push(reason); };
  helios._labels = {
    requestFullReselect: (reason) => { calls.labelReasons.push(reason); },
  };
  helios.snapshotDelegatePositions = (options = {}) => options.delegate.snapshotNodePositions();
  helios._emitLayoutChanged = (layout) => { calls.layoutChanged.push(layout); };

  const nextLayout = new StaticLayout(helios.network, helios.visuals);
  helios.layout(nextLayout);

  assert.equal(helios.layout(), nextLayout);
  assert.equal(calls.previousDisposed, 0);
  assert.deepEqual(Array.from(positions), [0, 0, 0, 0, 0, 0]);

  await new Promise((resolve) => setTimeout(resolve, 0));

  almostEqualArray(Array.from(positions), Array.from(delegateSnapshot));
  assert.equal(calls.previousDisposed, 1);
  assert.equal(helios.positions().source, 'network');
  assert.equal(helios.positions().delegate, null);
  assert.equal(graphLayerState.delegate, null);
  assert.equal(graphLayerState.interpolation?.enabled, false);
  almostEqualArray(
    Array.from(helios._interpolationRuntime.lastRenderedPositions ?? []),
    Array.from(delegateSnapshot),
  );
  assert.deepEqual(calls.setLayouts, [nextLayout]);
  assert.deepEqual(calls.layoutChanged, [nextLayout]);
  assert.deepEqual(calls.requestLayout, ['user', 'layout-handoff']);
  assert.ok(calls.labelReasons.includes('layout-handoff'));
  assert.ok(getGeometryCalls() >= 1);
  assert.ok(getRenderCalls() >= 2);
});

test('_computePositionSnapshotCenter() uses active layout-network node indices when available', () => {
  const { helios } = createPositionHarness([
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
    0, 0, 0,
  ]);
  const snapshot = new Float32Array([
    1, 2, 3,
    10, 20, 30,
    4, 5, 6,
    40, 50, 60,
  ]);
  const network = {
    nodeIndices: new Uint32Array([1, 3]),
    withBufferAccess: (fn) => fn(),
  };

  const center = helios._computePositionSnapshotCenter(snapshot, network);

  almostEqualArray(center, [25, 35, 45]);
});

test('_startLayoutPositionHandoff() snapshots the outgoing delegate against the previous layout network', async () => {
  const { helios } = createPositionHarness([0, 0, 0]);
  const previousNetwork = {
    nodeIndices: new Uint32Array([0]),
    withBufferAccess: (fn) => fn(),
  };
  const previousDelegate = new (class extends PositionDelegate {
    synchronizeTopology() {}
    getNodePositionView() { return null; }
  })();
  const previousLayout = {
    network: previousNetwork,
    getPositionDelegate: () => previousDelegate,
    dispose: () => {},
  };
  const nextLayout = {
    beginPositionHandoff: () => {},
    adoptHandoffState: () => {},
  };
  let snapshotOptions = null;
  helios._finishLayoutPositionHandoff = () => true;
  helios.snapshotDelegatePositions = async (options = {}) => {
    snapshotOptions = options;
    return new Float32Array([1, 2, 3]);
  };

  helios._startLayoutPositionHandoff({
    previousLayout,
    previousDelegate,
    nextLayout,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(snapshotOptions?.delegate, previousDelegate);
  assert.equal(snapshotOptions?.network, previousNetwork);
  assert.equal(snapshotOptions?.scope, 'layout');
});

test('handoff-adopted layout updates bypass interpolation even when interpolation is enabled', () => {
  const {
    helios,
    positions,
    graphLayerState,
  } = createPositionHarness([
    10, 20, 30,
    40, 50, 60,
  ]);
  helios._interpolationConfig.enabled = true;
  helios._interpolationRuntime.lastRenderedPositions = new Float32Array([
    1, 2, 3,
    4, 5, 6,
  ]);

  helios._handleLayoutUpdate({ timestamp: 100, handoffAdopted: true });

  almostEqualArray(
    Array.from(helios._interpolationRuntime.lastRenderedPositions ?? []),
    Array.from(positions),
  );
  assert.equal(helios._interpolationRuntime.active, false);
  assert.equal(graphLayerState.interpolation?.enabled, false);
});

test('interpolation() exposes and updates interpolation settings', () => {
  const { helios, graphLayerState, getRenderCalls } = createPositionHarness([0, 0, 0]);

  const initial = helios.interpolation();
  assert.equal(initial.enabled, false);
  assert.equal(initial.mode, 'gpu');
  assert.equal(initial.durationMode, 'fixed');
  assert.equal(initial.durationMs, 120);
  assert.equal(initial.fixedDurationMs, 120);
  assert.equal(initial.easing, 'linear');
  assert.equal(initial.smoothing, 6);
  assert.equal(initial.minDisplacementRatio, 0.0005);
  assert.equal(initial.active, false);
  assert.equal(initial.factor, 1);
  assert.equal(initial.adaptiveDuration, false);
  assert.equal(initial.adaptiveDurationSamples, 5);
  assert.equal(initial.adaptiveDurationWindowMs, 5000);
  assert.equal(initial.effectiveDurationMs, 120);

  helios.interpolation({
    enabled: true,
    mode: 'javascript',
    durationMode: 'adaptive',
    durationMs: 240,
    easing: 'linear',
    smoothing: 3,
    minDisplacementRatio: 0.001,
    adaptiveDuration: true,
    adaptiveDurationSamples: 4,
    adaptiveDurationWindowMs: 4000,
  });

  const updated = helios.interpolation();
  assert.equal(updated.enabled, true);
  assert.equal(updated.mode, 'gpu');
  assert.equal(updated.durationMode, 'adaptive');
  assert.equal(updated.durationMs, 240);
  assert.equal(updated.fixedDurationMs, 240);
  assert.equal(updated.easing, 'linear');
  assert.equal(updated.smoothing, 3);
  assert.equal(updated.minDisplacementRatio, 0.001);
  assert.equal(updated.active, false);
  assert.equal(updated.factor, 1);
  assert.equal(updated.adaptiveDuration, true);
  assert.equal(updated.adaptiveDurationSamples, 4);
  assert.equal(updated.adaptiveDurationWindowMs, 4000);
  assert.equal(updated.effectiveDurationMs, 240);
  assert.equal(getRenderCalls(), 1);
  assert.equal(graphLayerState.interpolation.enabled, false);

  helios.interpolation(null);
  assert.equal(helios.interpolation().enabled, false);
});

test('adaptive interpolation duration uses recent layout intervals (sample count + time window)', () => {
  const { helios } = createPositionHarness([0, 0, 0]);
  helios.interpolation({
    enabled: true,
    mode: 'gpu',
    durationMode: 'adaptive',
    durationMs: 120,
    adaptiveDuration: true,
    adaptiveDurationSamples: 5,
    adaptiveDurationWindowMs: 5000,
    adaptiveDurationScale: 1,
    adaptiveDurationMinMs: 0,
    adaptiveDurationMaxMs: 5000,
  });

  helios._interpolationRuntime.layoutIntervalsMs = [
    { dt: 90, ts: 100 }, // outside 5s window for now=7000
    { dt: 100, ts: 2000 },
    { dt: 200, ts: 3000 },
    { dt: 300, ts: 4000 },
    { dt: 400, ts: 5000 },
    { dt: 500, ts: 6000 },
  ];

  assert.equal(helios._resolveInterpolationDurationMs(7000), 300);

  helios.interpolation({ adaptiveDurationSamples: 3 });
  assert.equal(helios._resolveInterpolationDurationMs(7000), 400);
});

test('fixedDurationMs overrides adaptive timing until durationMode returns to adaptive', () => {
  const { helios } = createPositionHarness([0, 0, 0]);
  helios.interpolation({
    enabled: true,
    mode: 'gpu',
    durationMode: 'adaptive',
    adaptiveDurationSamples: 5,
    adaptiveDurationWindowMs: 5000,
    adaptiveDurationScale: 1,
    adaptiveDurationMinMs: 0,
    adaptiveDurationMaxMs: 5000,
  });

  helios._interpolationRuntime.layoutIntervalsMs = [
    { dt: 100, ts: 2000 },
    { dt: 200, ts: 3000 },
    { dt: 300, ts: 4000 },
    { dt: 400, ts: 5000 },
    { dt: 500, ts: 6000 },
  ];
  assert.equal(helios._resolveInterpolationDurationMs(7000), 300);

  helios.interpolation({ fixedDurationMs: 180 });
  const fixed = helios.interpolation();
  assert.equal(fixed.durationMode, 'fixed');
  assert.equal(fixed.adaptiveDuration, false);
  assert.equal(fixed.durationMs, 180);
  assert.equal(fixed.fixedDurationMs, 180);
  assert.equal(helios._resolveInterpolationDurationMs(7000), 180);

  helios.interpolation({ durationMode: 'adaptive' });
  const adaptiveAgain = helios.interpolation();
  assert.equal(adaptiveAgain.durationMode, 'adaptive');
  assert.equal(adaptiveAgain.adaptiveDuration, true);
  assert.equal(helios._resolveInterpolationDurationMs(7000), 300);
});

test('durationMode adaptive is preserved when fixedDurationMs is provided in the same update', () => {
  const { helios } = createPositionHarness([0, 0, 0]);
  helios.interpolation({
    enabled: true,
    mode: 'gpu',
    durationMode: 'adaptive',
    adaptiveDurationSamples: 5,
    adaptiveDurationWindowMs: 5000,
    adaptiveDurationScale: 1,
    adaptiveDurationMinMs: 0,
    adaptiveDurationMaxMs: 5000,
  });

  helios._interpolationRuntime.layoutIntervalsMs = [
    { dt: 100, ts: 2000 },
    { dt: 200, ts: 3000 },
    { dt: 300, ts: 4000 },
    { dt: 400, ts: 5000 },
    { dt: 500, ts: 6000 },
  ];
  assert.equal(helios._resolveInterpolationDurationMs(7000), 300);

  helios.interpolation({
    durationMode: 'fixed',
    fixedDurationMs: 180,
  });
  assert.equal(helios._resolveInterpolationDurationMs(7000), 180);

  // Mirrors the UI payload: mode switch + fixed duration value included together.
  helios.interpolation({
    durationMode: 'adaptive',
    fixedDurationMs: 180,
  });
  const current = helios.interpolation();
  assert.equal(current.durationMode, 'adaptive');
  assert.equal(current.adaptiveDuration, true);
  assert.equal(helios._resolveInterpolationDurationMs(7000), 300);
});

test('legacy interpolation mode inputs are coerced to the GPU path', () => {
  for (const requestedMode of ['javascript', 'network']) {
    const { helios, positions, graphLayerState } = createPositionHarness([
      10, 10, 0,
      20, 20, 0,
    ]);
    helios.interpolation({
      enabled: true,
      mode: requestedMode,
      durationMs: 100,
      minDisplacementRatio: 0,
    });
    assert.equal(helios.interpolation().mode, 'gpu');

    helios._interpolationRuntime.lastRenderedPositions = new Float32Array([
      0, 0, 0,
      5, 5, 0,
    ]);
    helios._handleLayoutUpdate({ timestamp: 100 });
    almostEqualArray(Array.from(positions), [10, 10, 0, 20, 20, 0]);
    assert.equal(graphLayerState.interpolation.enabled, true);

    assert.equal(helios._runInterpolationRenderPump(150), true);
    assert.ok(graphLayerState.interpolation.factor > 0 && graphLayerState.interpolation.factor < 1);
    assert.equal(helios._runInterpolationRenderPump(220), false);
    assert.equal(graphLayerState.interpolation.enabled, false);
  }
});

test('gpu interpolation keeps target positions untouched and propagates shader state', () => {
  const { helios, positions, graphLayerState } = createPositionHarness([
    10, 10, 0,
    20, 20, 0,
  ]);
  helios._interpolationConfig = {
    enabled: true,
    mode: 'gpu',
    durationMs: 100,
    easing: 'linear',
    smoothing: 6,
    minDisplacementRatio: 0,
  };
  helios._interpolationRuntime.lastRenderedPositions = new Float32Array([
    0, 0, 0,
    5, 5, 0,
  ]);

  helios._handleLayoutUpdate({ timestamp: 100 });
  almostEqualArray(Array.from(positions), [10, 10, 0, 20, 20, 0]);
  assert.equal(graphLayerState.interpolation.enabled, true);
  assert.equal(graphLayerState.interpolation.factor, 0);

  assert.equal(helios._runInterpolationRenderPump(150), true);
  assert.ok(graphLayerState.interpolation.factor > 0 && graphLayerState.interpolation.factor < 1);
  assert.equal(graphLayerState.interpolation.enabled, true);

  assert.equal(helios._runInterpolationRenderPump(220), false);
  assert.equal(graphLayerState.interpolation.enabled, false);
});

test('layout updates skip CPU position snapshots when delegate source is active', () => {
  const { helios, graphLayerState } = createPositionHarness([
    10, 10, 0,
    20, 20, 0,
  ]);

  class GpuDelegate extends PositionDelegate {
    synchronizeTopology() {}
    getGpuPositionResource() {
      return { buffer: { label: 'gpu-pos' }, count: 2, version: 1 };
    }
    getNodePositionView() {
      throw new Error('CPU position view should not be requested for GPU delegates.');
    }
  }

  const delegate = new GpuDelegate();
  applyLayoutPositionPolicy(helios, delegate);
  helios._interpolationConfig = {
    enabled: true,
    mode: 'gpu',
    durationMs: 100,
    easing: 'linear',
    smoothing: 6,
    minDisplacementRatio: 0,
  };
  helios._snapshotNodePositions = () => {
    throw new Error('Layout update should not snapshot CPU positions while delegate source is active.');
  };

  helios._handleLayoutUpdate({ timestamp: 100 });
  assert.equal(helios._interpolationRuntime.active, false);
  assert.equal(helios._interpolationRuntime.lastRenderedPositions, null);
  assert.equal(graphLayerState.interpolation.enabled, false);
});
