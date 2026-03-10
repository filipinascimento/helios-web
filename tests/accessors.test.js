import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

test('graph-layer accessors are chainable setters and return values as getters', () => {
  const calls = { render: 0 };
  const helios = Object.create(Helios.prototype);
  helios.renderer = { graphLayer: { edgeWidthScale: 1, edgeWidthBase: 0, semanticZoomExponent: 0.25 } };
  helios.scheduler = { requestRender: () => { calls.render += 1; } };
  helios._pendingGraphLayerProps = new Map();
  helios._pendingRendererProps = new Map();

  assert.equal(helios.edgeWidthScale(), 1);
  const result = helios.edgeWidthScale(2.5);
  assert.equal(result, helios);
  assert.equal(helios.edgeWidthScale(), 2.5);
  assert.equal(calls.render, 1);

  assert.equal(helios.semanticZoomExponent(), 0.25);
  const semanticResult = helios.semanticZoomExponent(0.65);
  assert.equal(semanticResult, helios);
  assert.equal(helios.semanticZoomExponent(), 0.65);
  assert.equal(calls.render, 2);
});

test('renderer accessors store pending values before renderer exists', () => {
  const calls = { render: 0 };
  const helios = Object.create(Helios.prototype);
  helios.renderer = null;
  helios.scheduler = { requestRender: () => { calls.render += 1; } };
  helios._pendingRendererProps = new Map();
  helios._pendingGraphLayerProps = new Map();

  const result = helios.background('#ffffff');
  assert.equal(result, helios);
  assert.equal(calls.render, 0);
  assert.deepEqual(helios._pendingRendererProps.get('clearColor'), [1, 1, 1, 1]);
});

test('supersampling accessor updates layer sizing mode live', () => {
  const layerCalls = [];
  const bindingEvents = [];
  const helios = Object.create(Helios.prototype);
  helios.options = {};
  helios.layers = {
    setSupersampling(value) {
      layerCalls.push(value);
    },
  };
  helios._emitUIBindingChange = (name, value) => {
    bindingEvents.push({ name, value });
  };

  assert.equal(helios.supersampling(), 'auto');

  assert.equal(helios.supersampling('off'), helios);
  assert.equal(helios.supersampling(), 'off');
  assert.equal(helios.options.supersampling, false);

  assert.equal(helios.supersampling('2x'), helios);
  assert.equal(helios.supersampling(), '2x');
  assert.equal(helios.options.supersampling, 2);

  assert.equal(helios.supersampling('auto'), helios);
  assert.equal(helios.supersampling(), 'auto');
  assert.equal(helios.options.supersampling, 'auto');

  assert.deepEqual(layerCalls, [false, 2, 'auto']);
  assert.deepEqual(bindingEvents, [
    { name: 'supersampling', value: 'off' },
    { name: 'supersampling', value: '2x' },
    { name: 'supersampling', value: 'auto' },
  ]);
});

test('label accessors proxy configuration to the label controller', () => {
  const calls = { render: 0, setConfig: 0, request: 0 };
  const state = {
    enabled: false,
    maxVisible: 120,
    fontSizeScale: 1,
    minScreenRadiusPx: 8,
    outlineWidth: 2,
    offsetRadiusFactor: 1,
    offsetPx: 4,
    maxChars: 0,
    maxRows: 1,
    fill: '#ffffff',
    outlineColor: '#000000cc',
    fontFamily: 'sans-serif',
    source: null,
  };
  const helios = Object.create(Helios.prototype);
  helios.scheduler = { requestRender: () => { calls.render += 1; } };
  helios._refreshUIBindings = () => {};
  helios._labels = {
    getConfig() { return { ...state }; },
    setConfig(patch) {
      calls.setConfig += 1;
      Object.assign(state, patch);
    },
    requestFullReselect() { calls.request += 1; },
  };

  assert.equal(helios.labelsEnabled(), false);
  helios.labelsEnabled(true);
  assert.equal(state.enabled, true);

  helios.labelsMaxVisible(42);
  assert.equal(state.maxVisible, 42);

  helios.labelsFontSizeScale(1.5);
  assert.equal(state.fontSizeScale, 1.5);

  helios.labelsMinScreenRadius(12);
  assert.equal(state.minScreenRadiusPx, 12);

  helios.labelsOutlineWidth(3.5);
  assert.equal(state.outlineWidth, 3.5);

  helios.labelsOffsetRadiusFactor(-0.75);
  assert.equal(state.offsetRadiusFactor, -0.75);

  helios.labelsOffsetPx(10);
  assert.equal(state.offsetPx, 10);

  helios.labelsMaxChars(24);
  assert.equal(state.maxChars, 24);

  helios.labelsMaxRows(3);
  assert.equal(state.maxRows, 3);

  helios.labelFill('#ff0000aa');
  assert.equal(state.fill, '#ff0000aa');

  helios.labelOutlineColor('#00ff00aa');
  assert.equal(state.outlineColor, '#00ff00aa');

  helios.labelFontFamily('Menlo, monospace');
  assert.equal(state.fontFamily, 'Menlo, monospace');

  helios.labelSource('name');
  assert.equal(state.source, 'name');

  assert.ok(calls.setConfig >= 13);
  assert.ok(calls.request >= 13);
  assert.ok(calls.render >= 13);
});

test('setMode() updates projection, active layout mode, and emits a mode change event', async () => {
  const calls = {
    syncDelegate: 0,
    seedMissingPositions: 0,
    cameraModes: [],
    projectionModes: [],
    updateMatrices: 0,
    requestGeometry: 0,
    requestLayout: [],
    requestRender: 0,
    requestLabels: [],
    refreshUI: 0,
    emitLayoutChanged: 0,
    layoutSetSettings: [],
    layoutReheat: 0,
    requestUpdate: 0,
    emitted: [],
    enforcePositionSourcePolicy: 0,
  };

  const helios = Object.create(Helios.prototype);
  helios.options = {
    mode: '2d',
    projection: 'orthographic',
    layout: {
      type: 'd3force3d',
      options: {
        mode: '2d',
        settings: { use2D: true },
      },
    },
  };
  helios.layers = { size: { width: 800, height: 600 } };
  helios.positions = () => ({ source: 'delegate', delegate: { id: 'stub' } });
  helios.syncDelegatePositionsToNetwork = async () => {
    calls.syncDelegate += 1;
    return true;
  };
  helios.visuals = {
    seedMissingPositions: () => { calls.seedMissingPositions += 1; },
  };
  helios.renderer = {
    camera: {
      mode: '2d',
      projection: 'orthographic',
      setMode: (mode) => { calls.cameraModes.push(mode); },
      setProjectionMode: (mode) => { calls.projectionModes.push(mode); },
      updateMatrices: () => { calls.updateMatrices += 1; },
    },
  };
  helios.scheduler = {
    requestGeometry: () => { calls.requestGeometry += 1; },
    requestLayout: (reason) => { calls.requestLayout.push(reason); },
    requestRender: () => { calls.requestRender += 1; },
  };
  helios._layout = {
    setSettings: (next) => { calls.layoutSetSettings.push(next); },
    reheat: () => { calls.layoutReheat += 1; },
    requestUpdate: () => { calls.requestUpdate += 1; },
  };
  helios._labels = {
    requestFullReselect: (reason) => { calls.requestLabels.push(reason); },
  };
  helios._refreshUIBindings = () => { calls.refreshUI += 1; };
  helios._emitLayoutChanged = () => { calls.emitLayoutChanged += 1; };
  helios._enforcePositionSourcePolicy = () => { calls.enforcePositionSourcePolicy += 1; };
  helios.emit = (type, detail) => { calls.emitted.push({ type, detail }); };

  const result = await helios.setMode('3d');

  assert.equal(result, helios);
  assert.equal(helios.mode(), '3d');
  assert.equal(helios.options.projection, 'perspective');
  assert.equal(helios.options.layout.options.mode, '3d');
  assert.equal(helios.options.layout.options.settings.use2D, false);
  assert.equal(calls.syncDelegate, 1);
  assert.equal(calls.seedMissingPositions, 1);
  assert.equal(helios.renderer.camera.mode, '3d');
  assert.equal(helios.renderer.camera.projection, 'perspective');
  assert.deepEqual(calls.cameraModes, []);
  assert.deepEqual(calls.projectionModes, []);
  assert.equal(calls.updateMatrices, 1);
  assert.deepEqual(calls.layoutSetSettings, [{ mode: '3d' }]);
  assert.equal(calls.layoutReheat, 1);
  assert.equal(calls.requestUpdate, 1);
  assert.equal(calls.enforcePositionSourcePolicy, 1);
  assert.equal(calls.requestGeometry, 1);
  assert.deepEqual(calls.requestLayout, ['mode']);
  assert.ok(calls.requestRender >= 1);
  assert.deepEqual(calls.requestLabels, ['mode']);
  assert.equal(calls.refreshUI, 1);
  assert.equal(calls.emitLayoutChanged, 1);
  assert.deepEqual(calls.emitted, [{
    type: 'mode:changed',
    detail: {
      mode: '3d',
      previousMode: '2d',
      projection: 'perspective',
    },
  }]);
});

test('camera pose helpers expose capture, apply, and transition through Helios', async () => {
  const calls = { requestRender: 0, updateMatrices: 0 };
  const helios = Object.create(Helios.prototype);
  helios.scheduler = {
    requestRender: () => { calls.requestRender += 1; },
  };
  helios.renderer = {
    camera: {
      mode: '2d',
      projection: 'orthographic',
      zoom: 2,
      distance: 800,
      fov: 60,
      near: 0.1,
      far: 100000,
      near2D: -1,
      far2D: 1,
      viewport: { width: 800, height: 600, devicePixelRatio: 1 },
      target: new Float32Array([0, 0, 0]),
      pan2D: new Float32Array([12, -8, 0]),
      pan3D: new Float32Array([0, 0, 0]),
      rotation: new Float32Array([0, 0, 0, 1]),
      updateMatrices: () => { calls.updateMatrices += 1; },
    },
  };

  const pose = helios.cameraPose();
  assert.equal(pose.mode, '2d');
  assert.equal(pose.projection, 'orthographic');
  assert.equal(pose.pan2D[0], 12);

  helios.setCameraPose({ mode: '3d', projection: 'perspective', distance: 320, target: [5, 6, 7] });
  assert.equal(helios.renderer.camera.mode, '3d');
  assert.equal(helios.renderer.camera.projection, 'perspective');
  assert.equal(helios.renderer.camera.distance, 320);
  assert.deepEqual(Array.from(helios.renderer.camera.target), [5, 6, 7]);

  await helios.transitionCamera(
    { distance: 640, target: [9, 10, 11] },
    { durationMs: 0 },
  );
  assert.equal(helios.renderer.camera.distance, 640);
  assert.deepEqual(Array.from(helios.renderer.camera.target), [9, 10, 11]);
  assert.ok(calls.updateMatrices >= 2);
  assert.ok(calls.requestRender >= 2);

  assert.equal(helios.stopCameraTransition(), helios);
});

test('setMode() collapses node depth when landing in 2D', async () => {
  const positions = new Float32Array([
    0, 0, -5,
    1, 2, 7,
  ]);
  const helios = Object.create(Helios.prototype);
  helios.options = {
    mode: '3d',
    projection: 'perspective',
    layout: { type: 'static', options: {} },
  };
  helios.network = {
    nodeIndices: new Uint32Array([0, 1]),
    getNodeAttributeBuffer: () => ({ view: positions }),
  };
  helios.visuals = {
    seedMissingPositions: () => {},
    markPositionsDirty: () => {},
  };
  helios.scheduler = {
    requestGeometry: () => {},
    requestLayout: () => {},
    requestRender: () => {},
  };
  helios.renderer = {
    camera: {
      mode: '3d',
      projection: 'perspective',
      zoom: 1,
      distance: 800,
      fov: 60,
      near: 0.1,
      far: 100000,
      near2D: -1,
      far2D: 1,
      viewport: { width: 800, height: 600, devicePixelRatio: 1 },
      target: new Float32Array([0, 0, 0]),
      pan2D: new Float32Array([0, 0, 0]),
      pan3D: new Float32Array([0, 0, 0]),
      rotation: new Float32Array([0, 0, 0, 1]),
      updateMatrices: () => {},
    },
  };
  helios._layout = { requestUpdate: () => {} };
  helios._labels = { requestFullReselect: () => {} };
  helios._refreshUIBindings = () => {};
  helios._emitLayoutChanged = () => {};
  helios._enforcePositionSourcePolicy = () => {};
  helios.emit = () => {};
  helios.positions = () => ({ source: 'network', delegate: null });

  await helios.setMode('2d', { animate: false });
  assert.deepEqual(Array.from(positions), [
    0, 0, 0,
    1, 2, 0,
  ]);
});

test('3D to 2D transition plan matches the orthographic landing scale before projection switch', () => {
  const helios = Object.create(Helios.prototype);
  helios.renderer = {
    camera: {
      mode: '3d',
      projection: 'perspective',
      zoom: 1,
      distance: 420,
      fov: 60,
      near: 0.1,
      far: 100000,
      near2D: -1,
      far2D: 1,
      minZoom: 0.001,
      maxZoom: 10,
      minDistance: 10,
      maxDistance: 25000,
      viewport: { width: 900, height: 600, devicePixelRatio: 1 },
      target: new Float32Array([10, 20, 30]),
      pan2D: new Float32Array([0, 0, 0]),
      pan3D: new Float32Array([0, 0, 0]),
      rotation: new Float32Array([0.1, 0.2, 0.3, 0.9]),
      updateMatrices: () => {},
    },
  };
  helios.size = { width: 900, height: 600 };

  const plan = helios._build2DModeTransitionPoses({
    minX: -120,
    maxX: 180,
    minY: -60,
    maxY: 140,
    minZ: -80,
    maxZ: 90,
    sumX: 30,
    sumY: 60,
    sumZ: 15,
    count: 3,
  });

  assert.ok(plan);
  assert.equal(plan.pre2D3D.mode, '3d');
  assert.equal(plan.pre2D3D.projection, 'perspective');
  assert.equal(plan.start2DPose.mode, '2d');
  assert.equal(plan.start2DPose.projection, 'orthographic');
  assert.ok(Math.abs(plan.pre2D3D.rotation[0]) < 1e-6);
  assert.ok(Math.abs(plan.pre2D3D.rotation[1]) < 1e-6);
  assert.ok(Math.abs(plan.pre2D3D.rotation[2]) < 1e-6);
  assert.ok(Math.abs(plan.pre2D3D.rotation[3] - 1) < 1e-6);
  assert.ok(Math.abs(plan.start2DPose.zoom - plan.endPose.zoom) < 1e-9);
  assert.ok(Math.abs(plan.start2DPose.pan2D[0] - plan.endPose.pan2D[0]) < 1e-9);
  assert.ok(Math.abs(plan.start2DPose.pan2D[1] - plan.endPose.pan2D[1]) < 1e-9);
});
