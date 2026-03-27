import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';
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

  helios._disableAutomaticCameraControlFromInteraction({ action: 'pan' });
  assert.equal(helios._cameraControlConfig.autoFit, false);
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
