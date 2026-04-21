import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';
import { resolveFigurePreviewRect } from '../src/export/figureExport.js';
import { Camera } from '../src/rendering/Camera.js';

function createCamera(mode = '2d') {
  return new Camera(
    {
      addEventListener() {},
      removeEventListener() {},
      getBoundingClientRect() {
        return { left: 0, top: 0, width: 400, height: 400 };
      },
    },
    {
      mode,
      projection: mode === '3d' ? 'perspective' : 'orthographic',
      disableControls: true,
      viewport: { width: 400, height: 400, devicePixelRatio: 1 },
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
  assert.ok(camera.zoom > 3, `expected trimmed zoom to stay near the dense cluster, got ${camera.zoom}`);
  assert.ok(Math.abs(camera.pan2D[0]) < 10);
  assert.ok(Math.abs(camera.pan2D[1]) < 10);
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
  assert.ok(camera.zoom > 8, `expected frameNetwork to fit delegate snapshot bounds, got ${camera.zoom}`);
});

test('cameraTargetNodes uses delegate centroid readback for GPU-only target nodes', async () => {
  const helios = Object.create(Helios.prototype);
  const camera = createCamera('2d');
  let centroidCalls = 0;
  let fullSnapshotCalls = 0;
  let renderRequests = 0;
  const delegate = {
    getNodePositionView() {
      return null;
    },
    async snapshotNodeCentroidById(_context, ids) {
      centroidCalls += 1;
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
    delegateTargetBounds: null,
    delegateTargetBoundsAt: Number.NEGATIVE_INFINITY,
    delegateTargetBoundsPending: false,
    delegateTargetBoundsDelegate: null,
    delegateTargetBoundsSignature: '',
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

test('camera rotation interaction does not disable auto fit, but pan does', () => {
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
  assert.equal(helios._cameraControlConfig.autoFit, true);
  assert.equal(helios._cameraControlConfig.followTarget, true);

  helios._disableAutomaticCameraControlFromInteraction({ action: 'pan' });
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

  helios._stepCameraControlRenderPump(100);
  assert.equal(camera.pan2D[0], -5);
  assert.equal(camera.pan2D[1], -10);

  positions[0] = 20;
  positions[1] = 30;
  positions[3] = 40;
  positions[4] = 50;
  helios._stepCameraControlRenderPump(116);

  assert.equal(camera.pan2D[0], -30);
  assert.equal(camera.pan2D[1], -40);
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
  assert.ok(camera.zoom > 8);
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
    maxAttempts: 60,
  }]);
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
  helios._stepCameraControlRenderPump(400);
  helios._stepCameraControlRenderPump(700);

  assert.equal(sampled, 1);
  assert.equal(queued, 1);
  assert.equal(helios._cameraControlRuntime.autoFitDirty, false);
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
