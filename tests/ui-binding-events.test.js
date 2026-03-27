import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

test('graph-layer accessors emit ui:binding-change events', () => {
  const helios = Object.create(Helios.prototype);
  helios.renderer = { graphLayer: { nodeSizeScale: 1, semanticZoomExponent: 0.25 } };
  helios.scheduler = { requestRender: () => {} };
  helios._pendingGraphLayerProps = new Map();
  helios._pendingRendererProps = new Map();

  const events = [];
  helios.dispatchEvent = (event) => {
    events.push(event);
    return true;
  };

  helios.nodeSizeScale(2);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'ui:binding-change');
  assert.equal(events[0].detail.id, 'helios.nodeSizeScale');
  assert.equal(events[0].detail.value, 2);

  helios.semanticZoomExponent(0.5);
  assert.equal(events.length, 2);
  assert.equal(events[1].detail.id, 'helios.semanticZoomExponent');
  assert.equal(events[1].detail.value, 0.5);
});

test('renderer accessors emit ui:binding-change events', () => {
  const helios = Object.create(Helios.prototype);
  helios.renderer = null;
  helios.scheduler = { requestRender: () => {} };
  helios._pendingGraphLayerProps = new Map();
  helios._pendingRendererProps = new Map();

  const events = [];
  helios.dispatchEvent = (event) => {
    events.push(event);
    return true;
  };

  helios.background('#ffffff');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'ui:binding-change');
  assert.equal(events[0].detail.id, 'helios.clearColor');
});

test('adaptive edge quality emits ui:binding-change events', () => {
  const helios = Object.create(Helios.prototype);
  helios.options = {};
  helios.renderer = { graphLayer: { edgeAdaptiveFastRendering: false, edgeFastRendering: false } };
  helios.scheduler = { requestRender: () => {} };
  helios._pendingGraphLayerProps = new Map();
  helios._pendingRendererProps = new Map();
  helios._edgeAdaptiveQualityConfig = undefined;
  helios._edgeAdaptiveRuntime = {
    nextProbeAt: Number.NEGATIVE_INFINITY,
    lastRenderMs: null,
    qualityFrameSamples: [],
    qualityFrameAverageMs: null,
    reason: 'quality',
    cameraMovingUntil: Number.NEGATIVE_INFINITY,
    cameraIdleTimer: null,
    probeTimer: null,
    forceHighQuality: false,
  };

  const events = [];
  helios.dispatchEvent = (event) => {
    events.push(event);
    return true;
  };

  helios.edgeAdaptiveQuality({ slowFrameThresholdMs: 28, probeIntervalMs: 1400 });

  const adaptiveEvent = events.find((event) => event.detail?.id === 'helios.edgeAdaptiveQuality');
  assert.ok(adaptiveEvent);
  assert.equal(adaptiveEvent.type, 'ui:binding-change');
  assert.equal(adaptiveEvent.detail.value.slowFrameThresholdMs, 28);
  assert.equal(adaptiveEvent.detail.value.probeIntervalMs, 1400);
});
