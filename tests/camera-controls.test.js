import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios, HeliosStateManager } from '../src/index.js';
import { resolveFigurePreviewRect } from '../src/export/figureExport.js';
import { Camera } from '../src/rendering/Camera.js';
import { applyCameraPose, captureCameraPose } from '../src/rendering/CameraTransitionController.js';

function createCamera(mode = '2d', width = 400, height = 400) {
  return new Camera(
    {
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect() {
        return { left: 0, top: 0, width, height };
      },
    },
    {
      mode,
      projection: mode === '3d' ? 'perspective' : 'orthographic',
      disableControls: true,
      viewport: { width, height, devicePixelRatio: 1 },
    },
  );
}

function projectPoint(uniforms, point) {
  const [x, y, z] = point;
  const matrix = uniforms.viewProjection;
  const clipX = (matrix[0] * x) + (matrix[4] * y) + (matrix[8] * z) + matrix[12];
  const clipY = (matrix[1] * x) + (matrix[5] * y) + (matrix[9] * z) + matrix[13];
  const clipW = (matrix[3] * x) + (matrix[7] * y) + (matrix[11] * z) + matrix[15];
  const ndcX = clipX / clipW;
  const ndcY = clipY / clipW;
  return {
    x: (ndcX * 0.5 + 0.5) * uniforms.viewport.width,
    y: (1 - (ndcY * 0.5 + 0.5)) * uniforms.viewport.height,
  };
}

function projectBounds(camera, bounds) {
  const corners = [];
  for (const x of [bounds.fitMinX, bounds.fitMaxX]) {
    for (const y of [bounds.fitMinY, bounds.fitMaxY]) {
      for (const z of [bounds.fitMinZ, bounds.fitMaxZ]) {
        corners.push(projectPoint(camera.getUniforms(), [x, y, z]));
      }
    }
  }
  return corners;
}

function projectFitPoints(camera, points) {
  const projected = [];
  for (let i = 0; (i + 2) < points.length; i += 3) {
    projected.push(projectPoint(camera.getUniforms(), [points[i], points[i + 1], points[i + 2]]));
  }
  return projected;
}

test('2D camera pose capture and restore normalize to orthographic projection', () => {
  const camera = createCamera('2d');
  camera.projection = 'perspective';

  const pose = captureCameraPose(camera);
  assert.equal(pose.mode, '2d');
  assert.equal(pose.projection, 'orthographic');

  applyCameraPose(camera, { mode: '2d', projection: 'perspective', zoom: 3 });
  assert.equal(camera.mode, '2d');
  assert.equal(camera.projection, 'orthographic');
  assert.equal(camera.zoom, 3);
});

function assertFitsViewport(points, width, height, padding = 0) {
  for (const point of points) {
    assert.ok(point.x >= padding - 1e-3, `expected x ${point.x} >= ${padding}`);
    assert.ok(point.x <= width - padding + 1e-3, `expected x ${point.x} <= ${width - padding}`);
    assert.ok(point.y >= padding - 1e-3, `expected y ${point.y} >= ${padding}`);
    assert.ok(point.y <= height - padding + 1e-3, `expected y ${point.y} <= ${height - padding}`);
  }
}

function encodedLayoutRuntimePositions(values) {
  const positions = values instanceof Float32Array ? values : new Float32Array(values);
  return {
    encoding: 'float32-base64',
    length: positions.length,
    byteLength: positions.byteLength,
    data: Buffer.from(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength)).toString('base64'),
  };
}

function createFrameNetworkHarness({
  mode = '2d',
  nodeCount = 4,
  edgeCount = 0,
  positions = new Float32Array([
    -20, -10, 0,
    20, -10, 0,
    20, 10, 0,
    -20, 10, 0,
  ]),
  config = {},
} = {}) {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera(mode);
  camera.maxZoom = 1000;
  camera.maxDistance = 100000;
  let renderRequests = 0;
  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = {
    requestRender() { renderRequests += 1; },
    requestGeometry() {},
  };
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 1,
    autoFitPaddingRatio: 0,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 1000,
    largeNetworkStartupFit: true,
    largeNetworkStartupNodeThreshold: 1000000,
    largeNetworkStartupEdgeThreshold: 1000000,
    largeNetworkStartupScale: 4,
    largeNetworkStartupDurationMs: 2200,
    animation: true,
    animationDurationMs: 280,
    orbit: false,
    orbitAngle: 0,
    orbitAxis: [0, 1, 0],
    orbitSpeed: 0.08,
    orbitDirection: 1,
    followTarget: false,
    followUpdateIntervalMs: 180,
    targetNodeIndices: null,
    ...config,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
    suspended: false,
    controlPoseActive: false,
    controlPoseFrom: null,
    controlPoseTo: null,
    controlPoseStartedAt: 0,
    controlPoseDurationMs: 0,
    controlPoseSignature: '',
    largeNetworkStartupActive: false,
    pendingLargeNetworkStartupSettle: null,
    largeNetworkStartupRefreshIteration: -1,
  };
  const nodeIndices = Array.from({ length: Math.floor(positions.length / 3) }, (_, index) => index);
  helios._getRenderNetwork = () => ({ nodeCount, edgeCount, nodeIndices });
  helios._withPositionBufferAccess = (fn) => fn();
  helios._readNodePositionViewUnsafe = () => positions;
  helios._resolveActiveCameraTargetNodeIndices = () => null;
  helios.emit = () => {};
  return {
    helios,
    camera,
    get renderRequests() {
      return renderRequests;
    },
  };
}

test('frameNetwork trims outliers when using 95% auto-fit coverage', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  camera.maxZoom = 1000;
  const positions = new Float32Array(100 * 3);
  for (let i = 0; i < 99; i += 1) {
    const offset = i * 3;
    positions[offset] = i - 49;
    positions[offset + 1] = i - 49;
    positions[offset + 2] = 0;
  }
  positions[99 * 3] = 5000;
  positions[(99 * 3) + 1] = 5000;
  positions[(99 * 3) + 2] = 0;

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = { requestRender() {} };
  helios._cameraControlConfig = {
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0,
    autoFitMaxSamples: 1000,
    animationDurationMs: 0,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
  };
  helios._getRenderNetwork = () => ({
    nodeCount: 100,
    nodeIndices: Array.from({ length: 100 }, (_, index) => index),
  });
  helios._withPositionBufferAccess = (fn) => fn();
  helios._readNodePositionViewUnsafe = () => positions;
  helios._resolveActiveCameraTargetNodeIndices = () => null;

  const fitted = helios.frameNetwork({ coverage: 0.95, paddingRatio: 0, resetOrientation: false });

  assert.equal(fitted, true);
  assert.ok(camera.zoom > 2, `expected trimmed zoom to stay near the dense cluster, got ${camera.zoom}`);
  assert.ok(Math.abs(camera.pan2D[0]) < 10);
  assert.ok(Math.abs(camera.pan2D[1]) < 10);
});

test('frameNetwork percentile coverage avoids full Array.sort in camera bounds sampling', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  const positions = new Float32Array(1200 * 3);
  for (let i = 0; i < 1200; i += 1) {
    const offset = i * 3;
    positions[offset] = (i % 80) - 40;
    positions[offset + 1] = Math.floor(i / 80) - 8;
    positions[offset + 2] = 0;
  }

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = { requestRender() {} };
  helios._cameraControlConfig = {
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0,
    autoFitMaxSamples: 1200,
    animationDurationMs: 0,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
  };
  helios._getRenderNetwork = () => ({
    nodeCount: 1200,
    nodeIndices: Array.from({ length: 1200 }, (_, index) => index),
  });
  helios._withPositionBufferAccess = (fn) => fn();
  helios._readNodePositionViewUnsafe = () => positions;
  helios._resolveActiveCameraTargetNodeIndices = () => null;

  const originalSort = Array.prototype.sort;
  Array.prototype.sort = function sortShouldNotRun() {
    throw new Error('camera bounds percentile sampling should not use Array.sort');
  };
  try {
    assert.equal(helios.frameNetwork({ coverage: 0.95, paddingRatio: 0, resetOrientation: false }), true);
  } finally {
    Array.prototype.sort = originalSort;
  }
});

test('camera bounds read visual radius attributes inside render-network buffer access for delegate positions', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  const positions = new Float32Array([
    -20, -10, 0,
    20, -10, 0,
    20, 10, 0,
    -20, 10, 0,
  ]);
  const size = new Float32Array([1, 2, 3, 4]);
  const outline = new Float32Array([0.5, 1, 1.5, 2]);
  let bufferAccessDepth = 0;
  const metadataReads = [];
  const reads = [];
  const primed = new Set();
  const network = {
    nodeCount: 4,
    edgeCount: 0,
    nodeIndices: [0, 1, 2, 3],
    getNodeAttributeInfo(name) {
      metadataReads.push({ name, guarded: bufferAccessDepth > 0 });
      if (name === '_helios_visuals_size' || name === '_helios_visuals_outline_width') {
        primed.add(name);
        return { type: 2, dimension: 1, complex: false };
      }
      return null;
    },
    withBufferAccess(fn) {
      bufferAccessDepth += 1;
      try {
        return fn();
      } finally {
        bufferAccessDepth -= 1;
      }
    },
    getNodeAttributeBuffer(name) {
      if (!primed.has(name)) {
        throw new Error(`Cannot perform attribute metadata lookup for node:${name} during buffer access`);
      }
      reads.push({ name, guarded: bufferAccessDepth > 0 });
      if (name === '_helios_visuals_size') return { view: size };
      if (name === '_helios_visuals_outline_width') return { view: outline };
      return null;
    },
  };
  const delegate = {
    getNodePositionView() {
      return positions;
    },
  };

  helios.network = network;
  helios.renderer = {
    camera,
    graphLayer: {
      nodeSizeBase: 0,
      nodeSizeScale: 2,
      nodeOutlineWidthBase: 0,
      nodeOutlineWidthScale: 1,
    },
  };
  helios.size = { width: 400, height: 400 };
  helios._positionsConfig = { source: 'delegate', delegate };
  helios._activePositionDelegate = delegate;
  helios._getRenderNetwork = () => network;

  const bounds = helios._sampleRenderBounds({ coverage: 1, paddingRatio: 0, maxSamples: 1000 });

  assert.ok(bounds);
  assert.deepEqual(metadataReads, [
    { name: '_helios_visuals_size', guarded: false },
    { name: '_helios_visuals_outline_width', guarded: false },
  ]);
  assert.deepEqual(reads, [
    { name: '_helios_visuals_size', guarded: true },
    { name: '_helios_visuals_outline_width', guarded: true },
  ]);
  assert.equal(bounds.nodeRadiusWorld, 5);
});

test('3D frameNetwork fit honors portrait viewport aspect ratio', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d', 240, 600);
  camera.maxDistance = 10000;
  helios.renderer = { camera };
  helios.size = { width: 240, height: 600 };

  const bounds = {
    paddingPx: 0,
    fitMinX: -120,
    fitMaxX: 120,
    fitMinY: -20,
    fitMaxY: 20,
    fitMinZ: -10,
    fitMaxZ: 10,
    bboxCenter: [0, 0, 0],
    centroid: [0, 0, 0],
  };

  const pose = helios._resolveCameraFitPose(bounds, { resetOrientation: true });
  applyCameraPose(camera, pose);

  assertFitsViewport(projectBounds(camera, bounds), 240, 600);
});

test('3D frameNetwork fit honors landscape viewport aspect ratio', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d', 600, 240);
  camera.maxDistance = 10000;
  helios.renderer = { camera };
  helios.size = { width: 600, height: 240 };

  const bounds = {
    paddingPx: 0,
    fitMinX: -20,
    fitMaxX: 20,
    fitMinY: -120,
    fitMaxY: 120,
    fitMinZ: -10,
    fitMaxZ: 10,
    bboxCenter: [0, 0, 0],
    centroid: [0, 0, 0],
  };

  const pose = helios._resolveCameraFitPose(bounds, { resetOrientation: true });
  applyCameraPose(camera, pose);

  assertFitsViewport(projectBounds(camera, bounds), 600, 240);
});

test('2D frameNetwork fit reserves room for rendered node radius', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d', 200, 200);
  camera.maxZoom = 10000;
  helios.renderer = { camera };
  helios.size = { width: 200, height: 200 };

  const bounds = {
    paddingPx: 0,
    nodeRadiusWorld: 20,
    fitMinX: -50,
    fitMaxX: 50,
    fitMinY: -50,
    fitMaxY: 50,
    fitMinZ: 0,
    fitMaxZ: 0,
    bboxCenter: [0, 0, 0],
    centroid: [0, 0, 0],
  };

  const pose = helios._resolveCameraFitPose(bounds, { resetOrientation: false });
  applyCameraPose(camera, pose);

  assertFitsViewport(projectBounds(camera, {
    ...bounds,
    fitMinX: -70,
    fitMaxX: 70,
    fitMinY: -70,
    fitMaxY: 70,
  }), 200, 200);
});

test('2D frameNetwork fit keeps a comfortable default margin', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d', 220, 220);
  camera.maxZoom = 10000;
  helios.renderer = { camera };
  helios.size = { width: 220, height: 220 };

  const bounds = {
    paddingPx: 0,
    nodeRadiusWorld: 0,
    fitMinX: -50,
    fitMaxX: 50,
    fitMinY: -50,
    fitMaxY: 50,
    fitMinZ: 0,
    fitMaxZ: 0,
    bboxCenter: [0, 0, 0],
    centroid: [0, 0, 0],
  };

  const pose = helios._resolveCameraFitPose(bounds, { resetOrientation: false });

  assert.ok(Math.abs(pose.zoom - (220 / (100 * 1.35))) < 1e-9);
  applyCameraPose(camera, pose);
  assertFitsViewport(projectBounds(camera, {
    ...bounds,
    fitMinX: -67.5,
    fitMaxX: 67.5,
    fitMinY: -67.5,
    fitMaxY: 67.5,
  }), 220, 220);
});

test('3D frameNetwork fit reserves room for billboard node radius', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d', 240, 240);
  camera.maxDistance = 10000;
  helios.renderer = { camera };
  helios.size = { width: 240, height: 240 };

  const bounds = {
    paddingPx: 0,
    nodeRadiusWorld: 20,
    fitMinX: -50,
    fitMaxX: 50,
    fitMinY: -50,
    fitMaxY: 50,
    fitMinZ: 0,
    fitMaxZ: 0,
    bboxCenter: [0, 0, 0],
    centroid: [0, 0, 0],
  };

  const withoutRadius = helios._resolveCameraFitPose({ ...bounds, nodeRadiusWorld: 0 }, { resetOrientation: true });
  const withRadius = helios._resolveCameraFitPose(bounds, { resetOrientation: true });

  assert.ok(withRadius.distance > withoutRadius.distance);
});

test('3D frameNetwork fits sampled points instead of empty synthetic bbox corners', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d', 300, 300);
  camera.maxDistance = 100000;
  helios.renderer = { camera };
  helios.size = { width: 300, height: 300 };

  const bounds = {
    paddingPx: 0,
    nodeRadiusWorld: 5,
    fitMinX: -100,
    fitMaxX: 100,
    fitMinY: 0,
    fitMaxY: 0,
    fitMinZ: -100,
    fitMaxZ: 100,
    bboxCenter: [0, 0, 0],
    centroid: [0, 0, 0],
    fitPoints: new Float32Array([
      -100, 0, -100,
      100, 0, -100,
      0, 0, 100,
    ]),
  };

  const cornerPose = helios._resolveCameraFitPose({ ...bounds, fitPoints: null }, { resetOrientation: false });
  const sampledPose = helios._resolveCameraFitPose(bounds, { resetOrientation: false });

  assert.ok(
    sampledPose.distance < cornerPose.distance,
    `expected sampled fit distance ${sampledPose.distance} below corner fit distance ${cornerPose.distance}`,
  );
  applyCameraPose(camera, sampledPose);
  assertFitsViewport(projectFitPoints(camera, bounds.fitPoints), 300, 300);
});

test('constructor UI panel option maps requested panels to HeliosUI creators', () => {
  const helios = Object.create(Helios.prototype);
  const calls = [];
  const ui = {
    createCameraPanel(options) { calls.push(['camera', options]); },
    createLayoutPanel(options) { calls.push(['layout', options]); },
    createSelectionPanel(options) { calls.push(['selection', options]); },
  };

  helios._createOptionalUIPanels(ui, ['camera', 'layout', 'selection'], {
    camera: { collapsed: true },
  });

  assert.deepEqual(calls, [
    ['camera', { collapsed: true }],
    ['layout', {}],
    ['selection', {}],
  ]);
});

test('constructor UI panel option expands default panel presets', () => {
  const helios = Object.create(Helios.prototype);
  const calls = [];
  const ui = {
    createDemoPanel() { calls.push('demo'); },
    createMetricsPanel() { calls.push('metrics'); },
    createMappersPanel() { calls.push('mappers'); },
    createLayoutPanel() { calls.push('layout'); },
    createLegendsPanel() { calls.push('legends'); },
    createFilterPanel() { calls.push('filter'); },
    createCameraPanel() { calls.push('camera'); },
    createSelectionPanel() { calls.push('selection'); },
  };

  helios._createOptionalUIPanels(ui, true);

  assert.deepEqual(calls, ['demo', 'metrics', 'mappers', 'layout', 'legends', 'filter', 'camera', 'selection']);
});

test('constructor debug option appends the debug panel last', () => {
  const helios = Object.create(Helios.prototype);
  helios.debugEnabled = true;
  const calls = [];
  const ui = {
    createDemoPanel() { calls.push('demo'); },
    createMetricsPanel() { calls.push('metrics'); },
    createMappersPanel() { calls.push('mappers'); },
    createLayoutPanel() { calls.push('layout'); },
    createLegendsPanel() { calls.push('legends'); },
    createFilterPanel() { calls.push('filter'); },
    createCameraPanel() { calls.push('camera'); },
    createSelectionPanel() { calls.push('selection'); },
    createDebugPanel(options) { calls.push(['debug', options]); },
  };

  helios._createOptionalUIPanels(ui, true, {
    debug: { dock: 'right', refreshMs: 2000 },
  });

  assert.deepEqual(calls, [
    'demo',
    'metrics',
    'mappers',
    'layout',
    'legends',
    'filter',
    'camera',
    'selection',
    ['debug', { dock: 'right', refreshMs: 2000 }],
  ]);
});

test('constructor debug option does not duplicate an explicitly requested debug panel', () => {
  const helios = Object.create(Helios.prototype);
  helios.debugEnabled = true;
  const calls = [];
  const ui = {
    createDebugPanel(options) { calls.push(['debug', options]); },
  };

  helios._createOptionalUIPanels(ui, ['debug'], {
    debug: { dock: 'right' },
  });

  assert.deepEqual(calls, [['debug', { dock: 'right' }]]);
});

test('manual camera pose changes disable automatic camera fitting', () => {
  const emitted = [];
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');

  helios.renderer = { camera };
  helios.scheduler = { requestRender() {} };
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0.05,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 50000,
    animation: true,
    animationDurationMs: 280,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0.08,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
  };
  helios._getRenderNetwork = () => ({ nodeCount: 10, nodeIndices: [0, 1, 2] });
  helios.emit = (type, detail) => emitted.push({ type, detail });

  helios.setCameraPose({ zoom: 2 }, { source: 'ui' });

  assert.equal(helios._cameraControlConfig.autoFit, false);
  assert.ok(emitted.some((entry) => entry.type === Helios.EVENTS?.CAMERA_CONTROL_CHANGE || entry.type === 'camera:control-change'));
});

test('camera controls and pose write sparse state overrides through core state entries', () => {
  const helios = Object.create(Helios.prototype);
  helios.renderer = { camera: createCamera('2d') };
  helios.scheduler = { requestRender() {} };
  helios.states = new HeliosStateManager();
  helios.on = () => () => {};
  helios.emit = () => {};
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0.08,
    autoFitMaxSamples: 20000,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 100,
    autoFitMaxIntervalMs: 5000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 100000,
    animation: true,
    animationDurationMs: 280,
    orbit: false,
    orbitAngle: 0,
    orbitAxis: [0, 1, 0],
    orbitSpeed: 0.08,
    orbitDirection: 1,
    followTarget: false,
    followUpdateIntervalMs: 200,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
  };
  helios._registerCoreStateEntries();

  helios.cameraControls({ autoFit: false });
  assert.equal(helios.states.status('camera.controls.autoFit').state, 'changed');
  assert.equal(helios.states.getOverrides({ aliases: 'preferred' })['cameraControls.autoFit'], false);

  helios.setCameraPose({ zoom: 2, pan2D: [4, 5, 0] }, { source: 'ui' });
  assert.equal(helios.states.status('camera.pose').state, 'changed');
  assert.equal(helios.states.getOverrides({ aliases: 'preferred' })['camera.pose'].zoom, 2);
});

test('default camera animation retargets from the in-flight pose', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  helios.renderer = { camera };
  helios.scheduler = { requestRender() {} };
  helios.states = new HeliosStateManager();
  helios.on = () => () => {};
  helios.emit = () => {};
  helios._initialMode = '2d';
  helios._cameraControlConfig = undefined;
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
    suspended: false,
    controlPoseActive: false,
    controlPoseFrom: null,
    controlPoseTo: null,
    controlPoseStartedAt: 0,
    controlPoseDurationMs: 0,
    controlPoseSignature: '',
    largeNetworkStartupActive: false,
    pendingLargeNetworkStartupSettle: null,
    largeNetworkStartupRefreshIteration: -1,
  };
  helios._registerCoreStateEntries();

  assert.equal(helios.states.entry('camera.controls.animationDurationMs').default, 520);

  const firstTarget = captureCameraPose(camera);
  firstTarget.zoom = 4;
  assert.equal(helios._queueCameraControlPose(firstTarget, { animate: true, durationMs: 520 }), true);
  helios._cameraControlRuntime.controlPoseStartedAt = performance.now() - 260;

  const secondTarget = captureCameraPose(camera);
  secondTarget.zoom = 8;
  assert.equal(helios._queueCameraControlPose(secondTarget, { animate: true, durationMs: 520 }), true);

  const retargetedFromZoom = helios._cameraControlRuntime.controlPoseFrom.zoom;
  assert.ok(retargetedFromZoom > 1, `expected retarget to start after initial zoom, got ${retargetedFromZoom}`);
  assert.ok(retargetedFromZoom < 4, `expected retarget to stay before previous target, got ${retargetedFromZoom}`);
  assert.equal(helios._cameraControlRuntime.controlPoseTo.zoom, 8);
});

test('clearing followed nodes stops in-flight camera control pose before framing', () => {
  const { helios, camera } = createFrameNetworkHarness({
    config: { animationDurationMs: 520 },
  });
  const target = captureCameraPose(camera);
  target.zoom = 6;
  assert.equal(helios._queueCameraControlPose(target, { animate: true, durationMs: 520 }), true);
  assert.equal(helios._cameraControlRuntime.controlPoseActive, true);

  let activeDuringFrame = null;
  const originalFrameNetwork = helios.frameNetwork.bind(helios);
  helios.frameNetwork = (options) => {
    activeDuringFrame = helios._cameraControlRuntime.controlPoseActive;
    return originalFrameNetwork(options);
  };

  helios.cameraFollowNodes([], { animate: true });

  assert.equal(activeDuringFrame, false);
  assert.equal(helios._cameraControlRuntime.controlPoseActive, false);
  assert.equal(helios._cameraControlRuntime.controlPoseTo, null);
});

test('restored layout positions invalidate prepared auto-fit bounds', () => {
  const currentPositions = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const restoredPositions = new Float32Array([
    100, 80, 0,
    140, 80, 0,
    140, 120, 0,
  ]);
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  const network = {
    nodeCount: 3,
    edgeCount: 0,
    nodeIndices: [0, 1, 2],
    withBufferAccess: (fn) => fn(),
    getNodeAttributeInfo: () => null,
    getNodeAttributeBuffer: (name) => (name === '_helios_visuals_position' ? { view: currentPositions } : null),
  };
  helios.network = network;
  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.visuals = {
    withBufferAccess: (fn) => fn(),
    markPositionsDirty() {},
    bumpNodeAttributes() {},
  };
  helios.scheduler = {
    requestGeometry() {},
    requestRender() {},
    setLayoutEnabled() {},
  };
  helios._labels = { requestFullReselect() {} };
  helios._layout = {
    seedFromPositionSnapshot: () => true,
  };
  helios._positionsConfig = { source: 'network', delegate: null };
  helios._activePositionDelegate = null;
  helios._interpolationConfig = { durationMs: 0 };
  helios._interpolationRuntime = { layoutIntervalsMs: [] };
  helios._cameraControlConfig = {
    autoFit: true,
    followTarget: false,
    autoFitCoverage: 1,
    autoFitPaddingRatio: 0,
    autoFitMaxSamples: 1000,
    autoFitIntervalMs: 100,
    autoFitMinIntervalMs: 100,
    autoFitMaxIntervalMs: 100,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    animation: true,
    animationDurationMs: 520,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: 123,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 100,
    autoFitDirty: false,
    cameraBoundsSnapshot: { fitMinX: -1, fitMaxX: 1, fitMinY: -1, fitMaxY: 1 },
    cameraBoundsSignature: 'stale',
    cameraBoundsKind: 'autoFit',
    cameraBoundsDirty: false,
    cameraBoundsPending: false,
    delegateSnapshot: new Float32Array([9, 9, 0]),
    delegateSnapshotAt: 123,
    delegateSnapshotPending: false,
    delegateSnapshotDelegate: {},
    delegateSnapshotRequestId: 1,
    delegateTargetBounds: { fitMinX: 9 },
    delegateTargetBoundsAt: 123,
    delegateTargetBoundsPending: false,
    delegateTargetBoundsDelegate: {},
    delegateTargetBoundsSignature: 'stale-target',
    delegateTargetBoundsRequestId: 1,
    suspended: false,
    largeNetworkStartupActive: false,
    pendingLargeNetworkStartupSettle: null,
    largeNetworkStartupRefreshIteration: -1,
  };
  helios._getRenderNetwork = () => network;
  helios.mode = () => '2d';
  helios.emit = () => {};

  const restored = helios.restoreLayoutRuntimeState({
    positions: encodedLayoutRuntimePositions(restoredPositions),
    layoutState: 'stopped',
  }, {
    restoreRunState: false,
    reason: 'test-restore',
  });

  assert.equal(restored, true);
  assert.deepEqual(Array.from(currentPositions), Array.from(restoredPositions));
  assert.equal(helios._cameraControlRuntime.delegateSnapshot, null);
  assert.equal(helios._cameraControlRuntime.delegateTargetBounds, null);
  assert.equal(helios._cameraControlRuntime.autoFitDirty, true);
  assert.equal(helios._cameraControlRuntime.lastAutoFitAt, Number.NEGATIVE_INFINITY);
  assert.equal(helios._cameraControlRuntime.cameraBoundsDirty, false);
  assert.equal(helios._cameraControlRuntime.cameraBoundsSnapshot.fitMinX, 100);
  assert.equal(helios._cameraControlRuntime.cameraBoundsSnapshot.fitMaxX, 140);
  assert.equal(helios._cameraControlRuntime.cameraBoundsSnapshot.fitMinY, 80);
  assert.equal(helios._cameraControlRuntime.cameraBoundsSnapshot.fitMaxY, 120);

  currentPositions.set([
    200, 180, 0,
    260, 180, 0,
    260, 220, 0,
  ]);
  helios._cameraControlRuntime.cameraBoundsSnapshot = { fitMinX: -10, fitMaxX: 10, fitMinY: -10, fitMaxY: 10 };
  helios._cameraControlRuntime.cameraBoundsSignature = 'stale-again';
  helios._cameraControlRuntime.cameraBoundsDirty = false;
  helios._cameraControlRuntime.delegateSnapshot = new Float32Array([7, 7, 0]);
  helios._cameraControlRuntime.delegateTargetBounds = { fitMinX: 7 };

  assert.equal(helios._adoptNetworkPositionsAsLayoutBaseline({ reason: 'test-network-restore' }), true);
  assert.equal(helios._cameraControlRuntime.delegateSnapshot, null);
  assert.equal(helios._cameraControlRuntime.delegateTargetBounds, null);
  assert.equal(helios._cameraControlRuntime.autoFitDirty, true);
  assert.equal(helios._cameraControlRuntime.lastAutoFitAt, Number.NEGATIVE_INFINITY);
  assert.equal(helios._cameraControlRuntime.cameraBoundsDirty, false);
  assert.equal(helios._cameraControlRuntime.cameraBoundsSnapshot.fitMinX, 200);
  assert.equal(helios._cameraControlRuntime.cameraBoundsSnapshot.fitMaxX, 260);
  assert.equal(helios._cameraControlRuntime.cameraBoundsSnapshot.fitMinY, 180);
  assert.equal(helios._cameraControlRuntime.cameraBoundsSnapshot.fitMaxY, 220);
});

test('frameNetwork uses delegate snapshots when positions come from a GPU layout delegate', async () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  camera.maxZoom = 1000;

  const positions = new Float32Array([
    -20, -10, 0,
    20, -10, 0,
    20, 10, 0,
    -20, 10, 0,
  ]);
  const delegate = {
    getNodePositionView() {
      return null;
    },
    async snapshotNodePositions() {
      return positions;
    },
  };

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = {
    requestRender() {},
    requestGeometry() {},
  };
  helios._cameraControlConfig = {
    autoFit: false,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 1000,
    animation: false,
    animationDurationMs: 0,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0.08,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    delegateSnapshot: null,
    delegateSnapshotAt: Number.NEGATIVE_INFINITY,
    delegateSnapshotPending: false,
    delegateSnapshotDelegate: null,
    delegateSnapshotRequestId: 0,
    orbitBaseRotation: null,
  };
  helios._positionsConfig = { source: 'delegate', delegate };
  helios._activePositionDelegate = delegate;
  helios._getRenderNetwork = () => ({
    nodeCount: 4,
    nodeIndices: [0, 1, 2, 3],
  });
  helios._buildPositionDelegateContext = () => ({ network: null });
  helios.snapshotDelegatePositions = (options = {}) => options.delegate.snapshotNodePositions();
  helios.emit = () => {};

  helios._scheduleCameraDelegateSnapshot(delegate, {});
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(helios._cameraControlRuntime.delegateSnapshot instanceof Float32Array);
  const fitted = helios.frameNetwork({ coverage: 1, paddingRatio: 0, animate: false });

  assert.equal(fitted, true);
  assert.ok(camera.zoom > 5, `expected frameNetwork to fit delegate snapshot bounds with margin, got ${camera.zoom}`);
});

test('cameraTargetNodes uses delegate centroid readback for GPU-only target nodes', async () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  let centroidCalls = 0;
  let fullSnapshotCalls = 0;
  let renderRequests = 0;
  let centroidOptions = null;
  const delegate = {
    getNodePositionView() {
      return null;
    },
    async snapshotNodeCentroidById(_context, ids, options = {}) {
      centroidCalls += 1;
      centroidOptions = options;
      assert.deepEqual(Array.from(ids), [1, 2]);
      return { centroid: new Float32Array([10, -4, 0]), count: ids.length, version: 3, source: 'test' };
    },
    async snapshotNodePositions() {
      fullSnapshotCalls += 1;
      return new Float32Array(0);
    },
  };

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = { requestRender() { renderRequests += 1; } };
  helios._cameraControlConfig = {
    autoFit: false,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 1000,
    animation: false,
    animationDurationMs: 0,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0.08,
    orbitDirection: 1,
    targetNodeIndices: null,
    followTarget: false,
    followUpdateIntervalMs: 180,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
    delegateSnapshot: null,
    delegateSnapshotAt: Number.NEGATIVE_INFINITY,
    delegateSnapshotPending: false,
    delegateSnapshotDelegate: null,
    delegateSnapshotRequestId: 0,
    delegateTargetBounds: {
      paddingPx: 24,
      coverage: 1,
      sourceCount: 2,
      sampledCount: 2,
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 0,
      maxY: 0,
      maxZ: 0,
      fitMinX: 0,
      fitMinY: 0,
      fitMinZ: 0,
      fitMaxX: 0,
      fitMaxY: 0,
      fitMaxZ: 0,
      sumX: 0,
      sumY: 0,
      sumZ: 0,
      count: 2,
      bboxCenter: [0, 0, 0],
      centroid: [0, 0, 0],
    },
    delegateTargetBoundsAt: performance.now(),
    delegateTargetBoundsPending: false,
    delegateTargetBoundsDelegate: delegate,
    delegateTargetBoundsSignature: '1,2',
    delegateTargetBoundsRequestId: 0,
    orbitBaseRotation: null,
    controlPoseActive: false,
  };
  helios._positionsConfig = { source: 'delegate', delegate };
  helios._activePositionDelegate = delegate;
  helios._getRenderNetwork = () => ({ nodeCount: 3, nodeIndices: [0, 1, 2] });
  helios._buildPositionDelegateContext = () => ({ network: null });
  helios.emit = () => {};

  helios.cameraTargetNodes([1, 2], { animate: false, zoomScale: 1.25 });
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(centroidCalls, 1);
  assert.equal(centroidOptions.exactReadback, true);
  assert.equal(centroidOptions.preferCached, false);
  assert.equal(centroidOptions.allowStaleVersion, false);
  assert.equal(centroidOptions.deferReadback, false);
  assert.equal(fullSnapshotCalls, 0);
  assert.equal(renderRequests > 0, true);
  assert.deepEqual(Array.from(camera.target), [10, -4, 0]);
});

test('camera focus caps repeated 2d zoom-in while still recentering', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  camera.maxZoom = 10;
  camera.zoom = 2.9;
  helios.renderer = { camera };

  const pose = helios._resolveCameraFocusPose(
    { centroid: [12, -8, 0], bboxCenter: [0, 0, 0] },
    {
      focusMode: 'centroid',
      zoomScale: 1.35,
      maxFocusZoom: 3,
      focusZoomTolerance: 0.05,
    },
  );

  assert.equal(pose.zoom, 2.9);
  assert.deepEqual(Array.from(pose.target), [12, -8, 0]);
  assert.ok(Math.abs(pose.pan2D[0] - (-12 * 2.9)) < 1e-5);
  assert.ok(Math.abs(pose.pan2D[1] - (8 * 2.9)) < 1e-5);
});

test('camera focus caps repeated 3d dolly-in while still retargeting', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d');
  camera.distance = 270;
  helios.renderer = { camera };

  const pose = helios._resolveCameraFocusPose(
    { centroid: [4, 6, -2], bboxCenter: [0, 0, 0] },
    {
      focusMode: 'centroid',
      zoomScale: 1.35,
      minFocusDistance: 260,
      focusZoomTolerance: 0.05,
    },
  );

  assert.equal(pose.distance, 270);
  assert.deepEqual(Array.from(pose.target), [4, 6, -2]);
});

test('orbit angle acts as a stable orbit tilt while orbiting keeps azimuth internal', () => {
  const emitted = [];
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d');

  helios.renderer = { camera };
  helios.scheduler = { requestRender() {} };
  helios.emit = (type, detail) => emitted.push({ type, detail });
  helios._getRenderNetwork = () => ({ nodeCount: 1, nodeIndices: [0] });
  helios._cameraControlConfig = {
    autoFit: false,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0.05,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 50000,
    animation: false,
    animationDurationMs: 0,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0.5,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    delegateSnapshot: null,
    delegateSnapshotAt: Number.NEGATIVE_INFINITY,
    delegateSnapshotPending: false,
    delegateSnapshotDelegate: null,
    delegateSnapshotRequestId: 0,
    orbitBaseRotation: null,
    appliedOrbitAngle: 0,
    suspended: false,
  };

  const initialRotation = Array.from(camera.rotation);
  helios.cameraControls({ orbitAngle: 90 });
  helios._stepCameraControlRenderPump(1000);
  const rotatedOnce = Array.from(camera.rotation);

  assert.notDeepEqual(rotatedOnce, initialRotation);
  assert.equal(helios.cameraControls().orbitAngle, 89);

  helios.cameraControls({ orbit: true, orbitSpeed: 0.5 });
  helios._stepCameraControlRenderPump(1100);

  assert.equal(helios.cameraControls().orbitAngle, 89);
  assert.notDeepEqual(Array.from(camera.rotation), rotatedOnce);
  assert.ok(emitted.some((entry) => entry.type === Helios.EVENTS?.CAMERA_CONTROL_CHANGE || entry.type === 'camera:control-change'));
});

test('orbit axis controls the 3D camera orbit rotation axis', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d');
  const renders = [];

  helios.renderer = { camera };
  helios.scheduler = { requestRender() { renders.push('render'); } };
  helios.emit = () => {};
  helios._getRenderNetwork = () => ({ nodeCount: 1, nodeIndices: [0] });
  helios._cameraControlConfig = {
    autoFit: false,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0.05,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 50000,
    animation: false,
    animationDurationMs: 0,
    orbit: true,
    orbitAngle: 0,
    orbitAxis: [0, 1, 0],
    orbitSpeed: 0.25,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 1000,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    delegateSnapshot: null,
    delegateSnapshotAt: Number.NEGATIVE_INFINITY,
    delegateSnapshotPending: false,
    delegateSnapshotDelegate: null,
    delegateSnapshotRequestId: 0,
    orbitBaseRotation: null,
    appliedOrbitAngle: 0,
    suspended: false,
  };

  helios.cameraControls({ orbitAxis: [0, 0, 2] });
  assert.deepEqual(helios.cameraControls().orbitAxis, [0, 0, 1]);
  assert.ok(renders.length > 0);

  helios._stepCameraControlRenderPump(1100);
  const rotationAroundZ = Array.from(camera.rotation);
  assert.ok(Math.abs(rotationAroundZ[2]) > 0.01);
  assert.ok(Math.abs(rotationAroundZ[1]) < 0.01);
});

test('camera rotation interaction disables auto fit while pan clears follow target', () => {
  const helios = Object.create(Helios.prototype);
  helios.scheduler = { requestRender() {} };
  helios.emit = () => {};
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0.05,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 50000,
    animation: true,
    animationDurationMs: 280,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0.08,
    orbitDirection: 1,
    followTarget: true,
    followUpdateIntervalMs: 0,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
    suspended: false,
  };

  helios._disableAutomaticCameraControlFromInteraction({ action: 'rotate' });
  assert.equal(helios._cameraControlConfig.autoFit, false);
  assert.equal(helios._cameraControlConfig.followTarget, true);

  helios._cameraControlConfig.autoFit = true;
  helios._disableAutomaticCameraControlFromInteraction({ action: 'pinch-pan', mode: '2d' });
  assert.equal(helios._cameraControlConfig.autoFit, false);
  assert.equal(helios._cameraControlConfig.followTarget, false);
  assert.equal(helios._cameraControlConfig.targetNodeIndices, null);

  helios._cameraControlConfig.autoFit = true;
  helios._cameraControlConfig.followTarget = true;
  helios._cameraControlConfig.targetNodeIndices = [1];
  helios._disableAutomaticCameraControlFromInteraction({ action: 'zoom', mode: '2d' });
  assert.equal(helios._cameraControlConfig.autoFit, false);
  assert.equal(helios._cameraControlConfig.followTarget, false);
  assert.equal(helios._cameraControlConfig.targetNodeIndices, null);

  helios._cameraControlConfig.autoFit = true;
  helios._cameraControlConfig.followTarget = true;
  helios._cameraControlConfig.targetNodeIndices = [1];
  helios._disableAutomaticCameraControlFromInteraction({ action: 'pan' });
  assert.equal(helios._cameraControlConfig.autoFit, false);
  assert.equal(helios._cameraControlConfig.followTarget, false);
  assert.equal(helios._cameraControlConfig.targetNodeIndices, null);
});

test('2D camera movement without action detail disables auto fit defensively', () => {
  const helios = Object.create(Helios.prototype);
  helios.scheduler = { requestRender() {} };
  helios.emit = () => {};
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0.05,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 50000,
    animation: true,
    animationDurationMs: 280,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0.08,
    orbitDirection: 1,
    followTarget: true,
    followUpdateIntervalMs: 0,
    targetNodeIndices: [2],
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
    suspended: false,
  };

  helios._disableAutomaticCameraControlFromInteraction({ mode: '2d', type: 'pointer' });
  assert.equal(helios._cameraControlConfig.autoFit, false);
  assert.equal(helios._cameraControlConfig.followTarget, false);
  assert.equal(helios._cameraControlConfig.targetNodeIndices, null);
});

test('camera follow keeps a moving node centroid centered in 2D', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  const positions = new Float32Array([
    0, 0, 0,
    10, 20, 0,
    100, 100, 0,
  ]);

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = { requestRender() {} };
  helios._positionsConfig = { source: 'network', delegate: null };
  helios._cameraControlConfig = {
    autoFit: false,
    autoFitCoverage: 1,
    autoFitPaddingRatio: 0,
    autoFitIntervalMs: 100,
    autoFitMinIntervalMs: 100,
    autoFitMaxIntervalMs: 100,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 1000,
    animation: false,
    animationDurationMs: 0,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0,
    orbitDirection: 1,
    followTarget: true,
    followUpdateIntervalMs: 0,
    targetNodeIndices: [0, 1],
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
    appliedOrbitAngle: 0,
    suspended: false,
    controlPoseActive: false,
    controlPoseFrom: null,
    controlPoseTo: null,
    controlPoseStartedAt: 0,
    controlPoseDurationMs: 0,
    controlPoseSignature: '',
    lastFollowUpdateAt: Number.NEGATIVE_INFINITY,
  };
  helios._getRenderNetwork = () => ({
    nodeCount: 3,
    nodeIndices: [0, 1, 2],
  });
  helios._withPositionBufferAccess = (fn) => fn();
  helios._readNodePositionViewUnsafe = () => positions;
  helios._prepareCameraControlBoundsSnapshot({ force: true });

  helios._stepCameraControlRenderPump(100);
  assert.equal(camera.pan2D[0], -15);
  assert.equal(camera.pan2D[1], -30);

  positions[0] = 20;
  positions[1] = 30;
  positions[3] = 40;
  positions[4] = 50;
  helios._invalidateCameraBoundsSnapshot();
  helios._prepareCameraControlBoundsSnapshot({ force: true });
  helios._stepCameraControlRenderPump(116);

  assert.equal(camera.pan2D[0], -90);
  assert.equal(camera.pan2D[1], -120);
});

test('3d figure export camera matches the preview-frame sub-frustum', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d');
  camera.setViewport({ width: 1000, height: 800, devicePixelRatio: 1 });
  camera.rotateBy(90, -55);
  camera.pan3DBy(30, -20);
  camera.updateMatrices();

  const previewRect = resolveFigurePreviewRect(1600, 900, { width: 1000, height: 800 });
  const exportCamera = helios._buildFigureExportCamera(camera, {
    previewRect,
    exportFigureLogicalViewport: {
      width: previewRect.width,
      height: previewRect.height,
      devicePixelRatio: 1,
    },
  });

  assert.notEqual(exportCamera, camera);

  const liveUniforms = camera.getUniforms();
  const exportUniforms = exportCamera.getUniforms();
  const points = [
    [0, 0, 0],
    [60, -40, 30],
    [-75, 55, -25],
    [45, 90, -10],
  ];

  for (const point of points) {
    const livePoint = projectPoint(liveUniforms, point);
    const exportPoint = projectPoint(exportUniforms, point);

    assert.ok(livePoint.x >= previewRect.x && livePoint.x <= (previewRect.x + previewRect.width));
    assert.ok(livePoint.y >= previewRect.y && livePoint.y <= (previewRect.y + previewRect.height));
    assert.ok(Math.abs(exportPoint.x - (livePoint.x - previewRect.x)) < 1e-3);
    assert.ok(Math.abs(exportPoint.y - (livePoint.y - previewRect.y)) < 1e-3);
  }
});

test('frameNetwork reads active node indices only inside buffer access', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  camera.maxZoom = 1000;
  const positions = new Float32Array([
    -20, -10, 0,
    20, -10, 0,
    20, 10, 0,
    -20, 10, 0,
  ]);

  let insideBufferAccess = false;
  const renderNetwork = {
    nodeCount: 4,
    get nodeIndices() {
      if (!insideBufferAccess) {
        throw new Error('Cannot access active node indices outside buffer access (wrap it in withBufferAccess(...))');
      }
      return new Uint32Array([0, 1, 2, 3]);
    },
  };

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = { requestRender() {} };
  helios._positionsConfig = { source: 'network', delegate: null };
  helios._cameraControlConfig = {
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0,
    autoFitMaxSamples: 1000,
    animationDurationMs: 0,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    delegateSnapshot: null,
    delegateSnapshotAt: Number.NEGATIVE_INFINITY,
    delegateSnapshotPending: false,
    delegateSnapshotDelegate: null,
    delegateSnapshotRequestId: 0,
    orbitBaseRotation: null,
    suspended: false,
  };
  helios._getRenderNetwork = () => renderNetwork;
  helios._withPositionBufferAccess = (fn) => {
    insideBufferAccess = true;
    try {
      return fn();
    } finally {
      insideBufferAccess = false;
    }
  };
  helios._readNodePositionViewUnsafe = () => positions;

  const fitted = helios.frameNetwork({ coverage: 1, paddingRatio: 0, animate: false });

  assert.equal(fitted, true);
  assert.ok(camera.zoom > 5);
});

test('large-network startup fit leaves small graphs on the normal fit pose', () => {
  const { helios, camera } = createFrameNetworkHarness({ nodeCount: 999999, edgeCount: 999999 });

  const fitted = helios.frameNetwork({
    coverage: 1,
    paddingRatio: 0,
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
  });

  assert.equal(fitted, true);
  assert.ok(camera.zoom > 5, `expected normal fitted zoom, got ${camera.zoom}`);
  assert.equal(helios._cameraControlRuntime.controlPoseActive, false);
});

test('large-network startup fit starts wider for million-node graphs and settles toward normal fit', () => {
  const normal = createFrameNetworkHarness({ nodeCount: 1000000, edgeCount: 0 });
  normal.helios.frameNetwork({ coverage: 1, paddingRatio: 0, animate: false, resetOrientation: false });
  const normalZoom = normal.camera.zoom;

  const { helios, camera } = createFrameNetworkHarness({ nodeCount: 1000000, edgeCount: 0 });
  const fitted = helios.frameNetwork({
    coverage: 1,
    paddingRatio: 0,
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
  });

  assert.equal(fitted, true);
  assert.equal(helios._cameraControlRuntime.controlPoseActive, true);
  assert.equal(helios._cameraControlRuntime.controlPoseDurationMs, 2200);
  assert.ok(camera.zoom < normalZoom, `expected wider startup zoom below ${normalZoom}, got ${camera.zoom}`);
  assert.ok(Math.abs(camera.zoom - normalZoom / 4) < 1e-6);
  assert.ok(Math.abs(helios._cameraControlRuntime.controlPoseTo.zoom - normalZoom) < 1e-6);
});

test('large-network startup settling is not replaced by dirty auto-fit on the next frame', () => {
  const normal = createFrameNetworkHarness({ nodeCount: 1000000, edgeCount: 0 });
  normal.helios.frameNetwork({ coverage: 1, paddingRatio: 0, animate: false, resetOrientation: false });
  const normalZoom = normal.camera.zoom;

  const { helios, camera } = createFrameNetworkHarness({ nodeCount: 1000000, edgeCount: 0 });
  helios.frameNetwork({
    coverage: 1,
    paddingRatio: 0,
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
  });

  let queued = 0;
  const originalQueue = helios._queueCameraControlPose.bind(helios);
  helios._queueCameraControlPose = (...args) => {
    queued += 1;
    return originalQueue(...args);
  };
  helios._cameraControlRuntime.controlPoseStartedAt = 1000;
  helios._cameraControlRuntime.autoFitDirty = true;

  const keepRunning = helios._stepCameraControlRenderPump(1100);

  assert.equal(keepRunning, true);
  assert.equal(queued, 0, 'startup settling should not be replaced by a normal auto-fit queue');
  assert.equal(helios._cameraControlRuntime.largeNetworkStartupActive, true);
  assert.ok(camera.zoom < normalZoom, `expected startup frame to remain wider than normal fit ${normalZoom}, got ${camera.zoom}`);

  helios._stepCameraControlRenderPump(3300);
  assert.equal(helios._cameraControlRuntime.largeNetworkStartupActive, false);
});

test('large-network startup delays settling until the first visible frame when startup gate is active', () => {
  const normal = createFrameNetworkHarness({ nodeCount: 1000000, edgeCount: 0 });
  normal.helios.frameNetwork({ coverage: 1, paddingRatio: 0, animate: false, resetOrientation: false });
  const normalZoom = normal.camera.zoom;

  const { helios, camera } = createFrameNetworkHarness({ nodeCount: 1000000, edgeCount: 0 });
  helios._startupGate = {
    active: true,
    firstVisibleFrameDrawn: false,
    startedAt: 0,
    layoutIterations: 0,
    targetLayoutIterations: 0,
    targetLayoutDurationMs: 0,
  };

  helios.frameNetwork({
    coverage: 1,
    paddingRatio: 0,
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
  });

  assert.equal(helios._cameraControlRuntime.controlPoseActive, false);
  assert.ok(helios._cameraControlRuntime.pendingLargeNetworkStartupSettle);
  assert.ok(Math.abs(camera.zoom - normalZoom / 4) < 1e-6);

  helios._finishStartupFirstVisibleFrame();

  assert.equal(helios._startupGate.active, false);
  assert.equal(helios._cameraControlRuntime.pendingLargeNetworkStartupSettle, null);
  assert.equal(helios._cameraControlRuntime.controlPoseActive, true);
  assert.equal(helios._cameraControlRuntime.largeNetworkStartupActive, true);
});

test('large-network startup fit refreshes from updated layout bounds before first visible frame', () => {
  const expandedPositions = new Float32Array([
    -200, -100, 0,
    200, -100, 0,
    200, 100, 0,
    -200, 100, 0,
  ]);
  const normal = createFrameNetworkHarness({
    nodeCount: 1000000,
    edgeCount: 0,
    positions: expandedPositions,
  });
  normal.helios.frameNetwork({ coverage: 1, paddingRatio: 0, animate: false, resetOrientation: false });
  const refreshedNormalZoom = normal.camera.zoom;

  const positions = new Float32Array([
    -20, -10, 0,
    20, -10, 0,
    20, 10, 0,
    -20, 10, 0,
  ]);
  const { helios, camera } = createFrameNetworkHarness({
    nodeCount: 1000000,
    edgeCount: 0,
    positions,
  });
  helios._startupGate = {
    active: true,
    firstVisibleFrameDrawn: false,
    startedAt: 0,
    layoutIterations: 0,
    targetLayoutIterations: 100,
    targetLayoutDurationMs: 5000,
  };

  helios.frameNetwork({
    coverage: 1,
    paddingRatio: 0,
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
  });
  const initialStartupZoom = camera.zoom;
  positions.set(expandedPositions);
  helios._recordStartupLayoutUpdate();

  const refreshed = helios._refreshLargeNetworkStartupFit({ force: true });

  assert.equal(refreshed, true);
  assert.ok(camera.zoom < initialStartupZoom, `expected expanded layout bounds to lower startup zoom below ${initialStartupZoom}, got ${camera.zoom}`);
  assert.ok(Math.abs(camera.zoom - refreshedNormalZoom / 4) < 1e-6);
  assert.ok(Math.abs(helios._cameraControlRuntime.pendingLargeNetworkStartupSettle.pose.zoom - refreshedNormalZoom) < 1e-6);
});

test('large-network startup fit also triggers for million-edge graphs below the node threshold', () => {
  const normal = createFrameNetworkHarness({ nodeCount: 4, edgeCount: 1000000 });
  normal.helios.frameNetwork({ coverage: 1, paddingRatio: 0, animate: false, resetOrientation: false });
  const normalZoom = normal.camera.zoom;

  const { helios, camera } = createFrameNetworkHarness({ nodeCount: 4, edgeCount: 1000000 });
  const fitted = helios.frameNetwork({
    coverage: 1,
    paddingRatio: 0,
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
  });

  assert.equal(fitted, true);
  assert.equal(helios._cameraControlRuntime.controlPoseActive, true);
  assert.ok(Math.abs(camera.zoom - normalZoom / 4) < 1e-6);
});

test('large graphs use the normal fit unless startup fitting is explicitly requested', () => {
  const { helios, camera } = createFrameNetworkHarness({ nodeCount: 1000000, edgeCount: 1000000 });

  const fitted = helios.frameNetwork({ coverage: 1, paddingRatio: 0, animate: false, resetOrientation: false });

  assert.equal(fitted, true);
  assert.ok(camera.zoom > 5, `expected restored/manual fit path to use normal zoom, got ${camera.zoom}`);
  assert.equal(helios._cameraControlRuntime.controlPoseActive, false);
});

test('large-network startup fit respects disabled auto fit', () => {
  const { helios, camera } = createFrameNetworkHarness({
    nodeCount: 1000000,
    edgeCount: 1000000,
    config: { autoFit: false },
  });

  const fitted = helios.frameNetwork({
    coverage: 1,
    paddingRatio: 0,
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
  });

  assert.equal(fitted, true);
  assert.ok(camera.zoom > 5, `expected disabled auto-fit path to use normal zoom, got ${camera.zoom}`);
  assert.equal(helios._cameraControlRuntime.controlPoseActive, false);
});

test('manual camera interaction cancels queued large-network startup settling', () => {
  const { helios } = createFrameNetworkHarness({ mode: '3d', nodeCount: 1000000, edgeCount: 0 });

  helios.frameNetwork({
    coverage: 1,
    paddingRatio: 0,
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
  });
  assert.equal(helios._cameraControlRuntime.controlPoseActive, true);
  assert.equal(helios._cameraControlConfig.autoFit, true);

  helios._disableAutomaticCameraControlFromInteraction({
    origin: 'interaction',
    type: 'pointer',
    action: 'rotate',
    mode: '3d',
  });

  assert.equal(helios._cameraControlRuntime.controlPoseActive, false);
  assert.equal(helios._cameraControlConfig.autoFit, false);
});

test('initial camera fit requests a non-animated frame before first render', () => {
  const helios = Object.create(Helios.prototype);
  const calls = [];
  helios.mode = () => '2d';
  helios.requestFrameNetwork = (options) => {
    calls.push(options);
    return helios;
  };

  helios._requestInitialCameraFit();

  assert.deepEqual(calls, [{
    animate: false,
    resetOrientation: false,
    largeNetworkStartupFit: true,
    maxAttempts: 60,
  }]);
});

test('startup initial camera fit can be skipped for explicit startup poses', () => {
  const helios = Object.create(Helios.prototype);
  let calls = 0;
  helios._requestInitialCameraFit = () => { calls += 1; };

  helios._sessionRestoreResult = null;
  helios._startupConfig = { initialCameraFit: true };
  helios._requestStartupInitialCameraFit();
  assert.equal(calls, 1);

  helios._startupConfig = { initialCameraFit: false };
  helios._requestStartupInitialCameraFit();
  assert.equal(calls, 1);

  helios._sessionRestoreResult = { restored: true };
  helios._startupConfig = { initialCameraFit: true };
  helios._requestStartupInitialCameraFit();
  assert.equal(calls, 1);
});

test('startup render gate waits for layout iterations or elapsed startup time', () => {
  const helios = Object.create(Helios.prototype);
  helios._layout = {};
  helios.scheduler = { layoutEnabled: true };
  helios._startupGate = {
    active: true,
    firstVisibleFrameDrawn: false,
    startedAt: 1000,
    layoutIterations: 0,
    targetLayoutIterations: 2,
    targetLayoutDurationMs: 500,
  };

  assert.equal(helios._shouldSuppressStartupRender(1200), true);
  helios._recordStartupLayoutUpdate();
  assert.equal(helios._shouldSuppressStartupRender(1300), true);
  helios._recordStartupLayoutUpdate();
  assert.equal(helios._shouldSuppressStartupRender(1350), false);

  helios._startupGate.layoutIterations = 0;
  assert.equal(helios._shouldSuppressStartupRender(1600), false);
});

test('network-load startup gate blocks rendering until load is released', () => {
  const helios = Object.create(Helios.prototype);
  const canvas = { style: { visibility: 'visible' } };
  let renderRequests = 0;
  let geometryRequests = 0;

  helios.layers = { canvas };
  helios.network = { nodeCount: 10, edgeCount: 0 };
  helios._layout = {};
  helios._startupConfig = {
    loadingOverlay: true,
    hideCanvasUntilFirstFrame: true,
    layoutIterations: 100,
    layoutDurationMs: 1000,
    initialCameraFit: true,
    _layoutIterationsExplicit: false,
    _layoutDurationMsExplicit: false,
  };
  helios._cameraControlConfig = {
    largeNetworkStartupNodeThreshold: 1000000,
    largeNetworkStartupEdgeThreshold: 1000000,
  };
  helios.scheduler = {
    layoutEnabled: true,
    requestRender() { renderRequests += 1; },
    requestGeometry() { geometryRequests += 1; },
  };
  helios._queuePendingLargeNetworkStartupSettle = () => {};

  const gate = helios._beginNetworkLoadStartupGate();

  assert.equal(canvas.style.visibility, 'hidden');
  assert.equal(helios._shouldSuppressStartupRender(1100), true);
  assert.equal(renderRequests, 1);

  helios.network = { nodeCount: 1000000, edgeCount: 0 };
  helios._releaseNetworkLoadStartupGate(gate);

  assert.notEqual(helios._startupGate, gate);
  assert.equal(helios._startupGate.blockRendering, false);
  assert.equal(helios._startupGate.targetLayoutDurationMs, 5000);
  assert.equal(helios._shouldSuppressStartupRender(1200), true);
  assert.equal(geometryRequests, 1);
  assert.equal(renderRequests, 2);

  helios._startupGate.layoutIterations = helios._startupGate.targetLayoutIterations;
  assert.equal(helios._shouldSuppressStartupRender(1300), false);
  helios._finishStartupFirstVisibleFrame();
  assert.equal(canvas.style.visibility, 'visible');
});

test('network-load startup gate restores canvas when load fails', () => {
  const helios = Object.create(Helios.prototype);
  const canvas = { style: { visibility: 'visible' } };

  helios.layers = { canvas };
  helios.network = { nodeCount: 10, edgeCount: 0 };
  helios._startupConfig = {
    loadingOverlay: true,
    hideCanvasUntilFirstFrame: true,
    layoutIterations: 0,
    layoutDurationMs: 0,
    initialCameraFit: true,
    _layoutIterationsExplicit: true,
    _layoutDurationMsExplicit: true,
  };
  helios.scheduler = { requestRender() {} };
  helios._queuePendingLargeNetworkStartupSettle = () => {};

  const gate = helios._beginNetworkLoadStartupGate();

  assert.equal(canvas.style.visibility, 'hidden');
  assert.equal(helios._shouldSuppressStartupRender(1100), true);

  helios._cancelNetworkLoadStartupGate(gate);

  assert.equal(gate.active, false);
  assert.equal(gate.blockRendering, false);
  assert.equal(canvas.style.visibility, 'visible');
});

test('startup gate defaults to 100 layout iterations or 1000 ms', () => {
  const helios = Object.create(Helios.prototype);
  const gate = helios._createStartupGate();

  assert.equal(gate.active, true);
  assert.equal(gate.targetLayoutIterations, 100);
  assert.equal(gate.targetLayoutDurationMs, 1000);
});

test('large-network startup gate defaults to 100 layout iterations or 5000 ms', () => {
  const { helios } = createFrameNetworkHarness({ nodeCount: 1000000, edgeCount: 0 });
  const gate = helios._createStartupGate();

  assert.equal(gate.active, true);
  assert.equal(gate.targetLayoutIterations, 100);
  assert.equal(gate.targetLayoutDurationMs, 5000);
});

test('startup render gate does not hold static or missing layouts for layout warmup', () => {
  const helios = Object.create(Helios.prototype);
  helios._layout = null;
  helios.scheduler = { layoutEnabled: true };
  helios._startupGate = {
    active: true,
    firstVisibleFrameDrawn: false,
    startedAt: 1000,
    layoutIterations: 0,
    targetLayoutIterations: 100,
    targetLayoutDurationMs: 1000,
  };

  assert.equal(helios._shouldSuppressStartupRender(1100), false);
});

test('camera control render pump queues auto fit while orbit is composed analytically in the same frame', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d');
  const positions = new Float32Array([
    -20, -10, -5,
    20, -10, -5,
    20, 10, 5,
    -20, 10, 5,
  ]);
  const queued = [];

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = { requestRender() {} };
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 1,
    autoFitPaddingRatio: 0,
    autoFitIntervalMs: 100,
    autoFitMinIntervalMs: 100,
    autoFitMaxIntervalMs: 100,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 1000,
    animation: true,
    animationDurationMs: 280,
    orbit: true,
    orbitAngle: 30,
    orbitSpeed: 0.5,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 1000,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: true,
    appliedOrbitAngle: 0,
    suspended: false,
    controlPoseActive: false,
    controlPoseFrom: null,
    controlPoseTo: null,
    controlPoseStartedAt: 0,
    controlPoseDurationMs: 0,
    controlPoseSignature: '',
  };
  helios._getRenderNetwork = () => ({
    nodeCount: 4,
    nodeIndices: [0, 1, 2, 3],
  });
  helios._resolveActiveCameraTargetNodeIndices = () => null;
  helios._resolveCameraAutoFitIntervalMs = () => 100;
  helios._withPositionBufferAccess = (fn) => fn();
  helios._readNodePositionViewUnsafe = () => positions;
  helios._applyCameraPoseWithOptionalAnimation = () => {
    throw new Error('render pump should queue through the unified camera control interpolator');
  };
  helios._queueCameraControlPose = (pose, options) => {
    queued.push({ pose, options });
    return true;
  };
  helios._prepareCameraControlBoundsSnapshot({ force: true });

  const initialRotation = Array.from(camera.rotation);
  const initialDistance = camera.distance;
  const keepRunning = helios._stepCameraControlRenderPump(1100);

  assert.equal(keepRunning, true);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].options.animate, true);
  assert.notEqual(queued[0].pose.distance, initialDistance);
  assert.notDeepEqual(Array.from(camera.rotation), initialRotation);
  assert.equal(helios._cameraControlRuntime.autoFitDirty, false);
});

test('3D auto fit interpolation preserves live orbit rotation', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d');
  helios.renderer = { camera };
  helios.scheduler = { requestRender() {} };
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 1,
    autoFitPaddingRatio: 0,
    autoFitIntervalMs: 100,
    autoFitMinIntervalMs: 100,
    autoFitMaxIntervalMs: 100,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 1000,
    animation: true,
    animationDurationMs: 1000,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
    appliedOrbitAngle: 0,
    suspended: false,
    controlPoseActive: false,
    controlPoseFrom: null,
    controlPoseTo: null,
    controlPoseStartedAt: 0,
    controlPoseDurationMs: 0,
    controlPoseSignature: '',
    controlPosePreserveRotation: false,
  };

  const targetPose = captureCameraPose(camera);
  targetPose.distance = camera.distance * 0.5;
  assert.equal(helios._queueCameraControlPose(targetPose, {
    animate: true,
    durationMs: 1000,
    preserveRotation: true,
  }), true);
  helios._cameraControlRuntime.controlPoseStartedAt = 1000;

  const orbitRotation = helios._composeOrbitRotation(camera.rotation, {
    yawRadians: 0.35,
    pitchRadians: 0,
    axis: [0, 1, 0],
  });
  camera.rotation = new Float32Array(orbitRotation);

  helios._stepCameraControlRenderPump(1500);

  assert.deepEqual(Array.from(camera.rotation), Array.from(orbitRotation));
  assert.ok(camera.distance < targetPose.distance * 2, `expected distance to interpolate toward fit target, got ${camera.distance}`);
});

test('auto fit render pump stays idle until a graph change marks it dirty', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  const positions = new Float32Array([
    -10, -10, 0,
    10, -10, 0,
    10, 10, 0,
    -10, 10, 0,
  ]);
  let sampled = 0;
  let queued = 0;

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = { requestRender() {} };
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 1,
    autoFitPaddingRatio: 0,
    autoFitIntervalMs: 100,
    autoFitMinIntervalMs: 100,
    autoFitMaxIntervalMs: 100,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 1000,
    animation: false,
    animationDurationMs: 0,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: false,
    appliedOrbitAngle: 0,
    suspended: false,
    controlPoseActive: false,
    controlPoseFrom: null,
    controlPoseTo: null,
    controlPoseStartedAt: 0,
    controlPoseDurationMs: 0,
    controlPoseSignature: '',
  };
  helios._getRenderNetwork = () => ({
    nodeCount: 4,
    nodeIndices: [0, 1, 2, 3],
  });
  helios._resolveActiveCameraTargetNodeIndices = () => null;
  helios._resolveCameraAutoFitIntervalMs = () => 100;
  helios._withPositionBufferAccess = (fn) => fn();
  helios._readNodePositionViewUnsafe = () => positions;
  helios._sampleRenderBounds = (...args) => {
    sampled += 1;
    return Helios.prototype._sampleRenderBounds.apply(helios, args);
  };
  helios._queueCameraControlPose = () => {
    queued += 1;
    return true;
  };

  helios._stepCameraControlRenderPump(100);
  helios._stepCameraControlRenderPump(300);

  assert.equal(sampled, 0);
  assert.equal(queued, 0);

  helios._markAutoFitDirty(false);
  assert.equal(sampled, 1);
  helios._stepCameraControlRenderPump(400);
  helios._stepCameraControlRenderPump(700);

  assert.equal(sampled, 1);
  assert.equal(queued, 1);
  assert.equal(helios._cameraControlRuntime.autoFitDirty, false);
});

test('auto fit render pump schedules bounds preparation instead of sampling buffers inline', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  let sampled = 0;
  let scheduled = 0;
  let queued = 0;

  helios.renderer = { camera };
  helios.size = { width: 400, height: 400 };
  helios.scheduler = { requestRender() {} };
  helios._cameraControlConfig = {
    autoFit: true,
    autoFitCoverage: 1,
    autoFitPaddingRatio: 0,
    autoFitIntervalMs: 100,
    autoFitMinIntervalMs: 100,
    autoFitMaxIntervalMs: 100,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 1000,
    animation: false,
    animationDurationMs: 0,
    orbit: false,
    orbitAngle: 0,
    orbitSpeed: 0,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 0,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    autoFitDirty: true,
    appliedOrbitAngle: 0,
    suspended: false,
    controlPoseActive: false,
    controlPoseFrom: null,
    controlPoseTo: null,
    controlPoseStartedAt: 0,
    controlPoseDurationMs: 0,
    controlPoseSignature: '',
  };
  helios._getRenderNetwork = () => ({
    nodeCount: 4,
    nodeIndices: [0, 1, 2, 3],
  });
  helios._resolveActiveCameraTargetNodeIndices = () => null;
  helios._resolveCameraAutoFitIntervalMs = () => 100;
  helios._sampleRenderBounds = () => {
    sampled += 1;
    return null;
  };
  helios._scheduleCameraBoundsPreparation = () => {
    scheduled += 1;
    return true;
  };
  helios._queueCameraControlPose = () => {
    queued += 1;
    return true;
  };

  helios._stepCameraControlRenderPump(100);

  assert.equal(sampled, 0);
  assert.equal(scheduled, 1);
  assert.equal(queued, 0);
  assert.equal(helios._cameraControlRuntime.autoFitDirty, true);
});

test('auto fit dirty marking defers bounds preparation during active buffer access', () => {
  const helios = Object.create(Helios.prototype);
  const network = {
    nodeCount: 4,
    nodeIndices: [0, 1, 2, 3],
    _bufferSessionDepth: 1,
    getNodeAttributeInfo() {
      throw new Error('Cannot perform attribute metadata lookup during buffer access');
    },
  };
  let scheduled = 0;
  let sampled = 0;
  helios.scheduler = { requestRender() {} };
  helios.renderer = { camera: createCamera('2d') };
  helios.size = { width: 400, height: 400 };
  helios._getRenderNetwork = () => network;
  helios._resolveActiveCameraTargetNodeIndices = () => null;
  helios._cameraControlConfig = {
    autoFit: true,
    followTarget: false,
    autoFitCoverage: 1,
    autoFitPaddingRatio: 0,
    autoFitMaxSamples: 1000,
  };
  helios._cameraControlRuntime = {
    autoFitDirty: false,
    lastAutoFitAt: 0,
    cameraBoundsSnapshot: null,
    cameraBoundsSignature: '',
    cameraBoundsKind: '',
    cameraBoundsDirty: false,
    cameraBoundsPending: false,
    largeNetworkStartupActive: false,
  };
  helios._sampleRenderBounds = () => {
    sampled += 1;
    return null;
  };
  helios._scheduleCameraBoundsPreparation = () => {
    scheduled += 1;
    return true;
  };

  helios._markAutoFitDirty(false);

  assert.equal(sampled, 0);
  assert.equal(scheduled, 1);
  assert.equal(helios._cameraControlRuntime.autoFitDirty, true);
  assert.equal(helios._cameraControlRuntime.cameraBoundsDirty, true);
});

test('resize does not retrigger 3D auto fit, but keeps 2D auto fit responsive', () => {
  const helios3d = Object.create(Helios.prototype);
  helios3d.renderer = { camera: createCamera('3d') };
  helios3d._cameraControlConfig = { autoFit: true };
  helios3d._cameraControlRuntime = {
    autoFitDirty: false,
    lastAutoFitAt: 123,
  };

  helios3d._handleResizeAutoFit();

  assert.equal(helios3d._cameraControlRuntime.autoFitDirty, false);
  assert.equal(helios3d._cameraControlRuntime.lastAutoFitAt, 123);

  const helios2d = Object.create(Helios.prototype);
  helios2d.renderer = { camera: createCamera('2d') };
  helios2d._cameraControlConfig = { autoFit: true };
  helios2d._cameraControlRuntime = {
    autoFitDirty: false,
    lastAutoFitAt: 123,
  };

  helios2d._handleResizeAutoFit();

  assert.equal(helios2d._cameraControlRuntime.autoFitDirty, true);
  assert.equal(helios2d._cameraControlRuntime.lastAutoFitAt, Number.NEGATIVE_INFINITY);
});

test('orbit animation advances analytically without queueing camera pose transitions every frame', () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('3d');
  let queued = 0;

  helios.renderer = { camera };
  helios.scheduler = { requestRender() {} };
  helios._cameraControlConfig = {
    autoFit: false,
    autoFitCoverage: 0.95,
    autoFitPaddingRatio: 0.05,
    autoFitIntervalMs: 900,
    autoFitMinIntervalMs: 250,
    autoFitMaxIntervalMs: 6000,
    autoFitLargeNetworkScale: 1,
    autoFitIntervalNodeCountRef: 5000,
    autoFitMaxSamples: 50000,
    animation: true,
    animationDurationMs: 280,
    orbit: true,
    orbitAngle: 20,
    orbitSpeed: 0.5,
    orbitDirection: 1,
    targetNodeIndices: null,
  };
  helios._cameraControlRuntime = {
    lastAutoFitAt: Number.NEGATIVE_INFINITY,
    lastOrbitAt: 1000,
    lastFitSignature: '',
    lastEffectiveIntervalMs: 0,
    appliedOrbitAngle: 0,
    suspended: false,
    controlPoseActive: false,
    controlPoseFrom: null,
    controlPoseTo: null,
    controlPoseStartedAt: 0,
    controlPoseDurationMs: 0,
    controlPoseSignature: '',
  };
  helios._queueCameraControlPose = () => {
    queued += 1;
    return true;
  };

  const before = Array.from(camera.rotation);
  helios._stepCameraControlRenderPump(1100);
  const afterFirst = Array.from(camera.rotation);
  helios._stepCameraControlRenderPump(1200);
  const afterSecond = Array.from(camera.rotation);

  assert.equal(queued, 0);
  assert.notDeepEqual(afterFirst, before);
  assert.notDeepEqual(afterSecond, afterFirst);
});
