import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios, PositionDelegate } from '../src/index.js';

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

test('positions() configures delegation and propagates to graph layer', () => {
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
  helios.positions({ delegate });
  assert.equal(helios.positions().source, 'delegate');
  assert.equal(helios.positions().delegate, delegate);
  assert.equal(attached, 1);
  assert.equal(graphLayerState.delegate, delegate);
  assert.equal(getGeometryCalls(), 1);
  assert.equal(getRenderCalls(), 1);

  helios.positions({ source: 'network' });
  assert.equal(detached, 1);
  assert.equal(graphLayerState.delegate, null);
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
  assert.equal(updated.mode, 'javascript');
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

test('javascript interpolation blends positions across render-pump ticks', () => {
  const { helios, positions, getDirtyCalls, getGeometryCalls } = createPositionHarness([
    10, 10, 0,
    20, 20, 0,
  ]);

  helios._interpolationConfig = {
    enabled: true,
    mode: 'javascript',
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
  almostEqualArray(
    Array.from(positions),
    [0, 0, 0, 5, 5, 0],
  );

  assert.equal(helios._runInterpolationRenderPump(150), true);
  almostEqualArray(
    Array.from(positions),
    [5, 5, 0, 12.5, 12.5, 0],
  );

  assert.equal(helios._runInterpolationRenderPump(220), false);
  almostEqualArray(
    Array.from(positions),
    [10, 10, 0, 20, 20, 0],
  );

  assert.ok(getDirtyCalls() >= 3);
  assert.ok(getGeometryCalls() >= 3);
});

test('network interpolation calls network.interpolateNodeAttribute and updates positions', () => {
  const harness = createPositionHarness([
    10, 10, 0,
    20, 20, 0,
  ]);
  const { helios, positions } = harness;
  let interpolateCalls = 0;
  helios.network.interpolateNodeAttribute = (_name, target, _options) => {
    interpolateCalls += 1;
    for (let i = 0; i < positions.length; i += 1) {
      positions[i] += (target[i] - positions[i]) * 0.5;
    }
    return interpolateCalls < 3;
  };
  helios._interpolationConfig = {
    enabled: true,
    mode: 'network',
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
  almostEqualArray(Array.from(positions), [0, 0, 0, 5, 5, 0]);

  const keepRunning = helios._runInterpolationRenderPump(116);
  assert.equal(keepRunning, true);
  assert.ok(interpolateCalls >= 1);
  assert.ok(positions[0] > 0 && positions[0] < 10);
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
