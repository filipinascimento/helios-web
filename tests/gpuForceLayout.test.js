import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/Helios.js';
import { WorkerLayout } from '../src/layouts/Layout.js';
import { D3Force3DLayout } from '../src/layouts/d3force3dLayoutWorker.js';
import { GpuForceLayout } from '../src/layouts/GpuForceLayout.js';
import { GpuForcePositionDelegate } from '../src/delegates/GpuForcePositionDelegate.js';
import { PositionDelegate } from '../src/delegates/PositionDelegate.js';

function createStubNetwork() {
  return {
    nodeCapacity: 4,
    nodeIndices: new Uint32Array([0, 1, 2, 3]),
    edgeIndices: new Uint32Array([0, 1]),
    edgesView: new Uint32Array([0, 1, 1, 2]),
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: () => ({
      view: new Float32Array([
        0, 0, 0,
        1, 0, 0,
        2, 0, 0,
        3, 0, 0,
      ]),
    }),
  };
}

function createStubHelios() {
  const state = { source: 'network', delegate: null };
  let renderRequests = 0;
  return {
    scheduler: {
      requestRender: () => { renderRequests += 1; },
    },
    positions(options) {
      if (arguments.length === 0) {
        return { ...state };
      }
      if (options?.source === 'delegate') {
        state.source = 'delegate';
        state.delegate = options.delegate ?? null;
      } else {
        state.source = 'network';
        state.delegate = options?.delegate ?? null;
      }
      return this;
    },
    getRenderRequests: () => renderRequests,
    getState: () => ({ ...state }),
  };
}

function createTopologyNetwork(positions) {
  const positionView = new Float32Array(positions);
  const nodeCount = Math.floor(positionView.length / 3);
  const nodeIndices = new Uint32Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    nodeIndices[i] = i;
  }
  const edgeCount = Math.max(0, nodeCount - 1);
  const edgeIndices = new Uint32Array(edgeCount);
  const edgesView = new Uint32Array(Math.max(1, edgeCount) * 2);
  for (let i = 0; i < edgeCount; i += 1) {
    edgeIndices[i] = i;
    edgesView[i * 2] = i;
    edgesView[i * 2 + 1] = i + 1;
  }

  return {
    nodeCapacity: nodeCount,
    nodeIndices,
    edgeIndices,
    edgesView,
    withBufferAccess: (fn) => fn(),
    getTopologyVersions: () => ({ node: 1, edge: 1 }),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positionView, version: 1 };
      if (name === '$index') return { version: 1 };
      return null;
    },
    getEdgeAttributeBuffer: (name) => (name === '$index' ? { version: 1 } : null),
  };
}

function createFakeWebGPUDevice() {
  const writes = [];
  const queue = {
    writeBuffer(buffer, offset, data) {
      let copy = null;
      if (data instanceof Float32Array) {
        copy = new Float32Array(data);
      } else if (data instanceof Uint32Array) {
        copy = new Uint32Array(data);
      } else if (data instanceof ArrayBuffer) {
        copy = new Uint8Array(data.slice(0));
      } else if (ArrayBuffer.isView(data)) {
        const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        copy = new Uint8Array(bytes);
      }
      writes.push({ label: buffer?.label ?? null, offset, data: copy });
    },
    submit() {},
  };

  const device = {
    queue,
    createBuffer({ size, usage, label }) {
      return {
        size,
        usage,
        label,
        destroy() {},
      };
    },
    createBindGroupLayout() { return {}; },
    createShaderModule() { return {}; },
    createPipelineLayout() { return {}; },
    createComputePipeline() { return {}; },
    createBindGroup() { return {}; },
    createCommandEncoder() {
      return {
        beginComputePass() {
          return {
            setPipeline() {},
            setBindGroup() {},
            dispatchWorkgroups() {},
            end() {},
          };
        },
        copyBufferToBuffer() {},
        finish() { return {}; },
      };
    },
  };

  return { device, writes };
}

function createFakeWebGL2Context() {
  let textureId = 1;
  let texImageCalls = 0;
  let texSubImageCalls = 0;
  const gl = {
    MAX_TEXTURE_SIZE: 64,
    TEXTURE_2D: 0x0DE1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    NEAREST: 0x2600,
    UNPACK_ALIGNMENT: 0x0CF5,
    UNPACK_ROW_LENGTH: 0x0CF2,
    FLOAT: 0x1406,
    RGB32F: 0x8815,
    RGB: 0x1907,
    createTexture() {
      return { id: textureId += 1 };
    },
    deleteTexture() {},
    bindTexture() {},
    texParameteri() {},
    pixelStorei() {},
    texImage2D() { texImageCalls += 1; },
    texSubImage2D() { texSubImageCalls += 1; },
    getParameter(param) {
      if (param === this.MAX_TEXTURE_SIZE) return 64;
      return 0;
    },
  };
  return {
    gl,
    getTexImageCalls: () => texImageCalls,
    getTexSubImageCalls: () => texSubImageCalls,
  };
}

function approx(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ~= ${expected}`);
}

test('GpuForceLayout exposes a PositionDelegate', async () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, { helios, mode: '2d' });

  assert.ok(layout.getPositionDelegate() instanceof PositionDelegate);
  await layout.initialize();
});

test('GpuForceLayout step requests render when GPU delegate advances', () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, { helios, mode: '2d' });

  layout.positionDelegate.step = () => true;

  layout.step(16);
  assert.equal(helios.getRenderRequests(), 1);
});

test('GpuForceLayout with updateIntervalMs still steps every scheduler tick', () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, {
    helios,
    mode: '2d',
    updateIntervalMs: 10_000,
  });
  let stepCalls = 0;
  layout.positionDelegate.step = () => {
    stepCalls += 1;
    return false;
  };
  layout.lastUpdate = performance.now();

  layout.step(16);
  assert.equal(stepCalls, 1);
});

test('WorkerLayout ignores updateIntervalMs gating and posts tick when scheduler ticks', () => {
  const network = createStubNetwork();
  const visuals = {
    nodePositions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0,
      3, 0, 0,
    ]),
    withBufferAccess: (fn) => fn(),
  };
  const layout = new WorkerLayout(network, visuals, { updateIntervalMs: 10_000 });
  let posted = null;
  layout.worker = {
    postMessage: (message) => {
      posted = message;
    },
  };
  layout.pending = false;
  layout.lastUpdate = performance.now();

  layout.step();
  assert.equal(posted?.type, 'tick');
});

test('D3Force3DLayout ignores updateIntervalMs gating and posts tick when scheduler ticks', () => {
  const network = createStubNetwork();
  const visuals = {
    nodePositions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0,
      3, 0, 0,
    ]),
    withBufferAccess: (fn) => fn(),
    seedMissingPositions: () => {},
  };
  const layout = new D3Force3DLayout(network, visuals, { updateIntervalMs: 10_000, mode: '2d' });
  let posted = null;
  layout.worker = {
    postMessage: (message) => {
      posted = message;
    },
  };
  layout.pending = false;
  layout.seededPositions = true;
  layout.lastUpdate = performance.now();

  layout.step();
  assert.equal(posted?.type, 'tick');
});

test('Helios.createLayout resolves gpu-force into GpuForceLayout', () => {
  const helios = Object.create(Helios.prototype);
  helios.network = createStubNetwork();
  helios.visuals = {};
  helios.options = { mode: '3d' };
  helios.debug = { log: () => {} };

  const layout = helios.createLayout({ type: 'gpu-force', options: { mode: '3d' } });
  assert.ok(layout instanceof GpuForceLayout);
  assert.equal(layout.options.mode, '3d');
});

test('GpuForcePositionDelegate normalizes simulation seed positions while preserving visible output seeds', () => {
  const network = createTopologyNetwork([
    60, 0, 0,
    -60, 0, 0,
  ]);
  const { device, writes } = createFakeWebGPUDevice();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 6,
  });

  delegate.onAttach({ network, backend: 'webgpu', device });

  const simSeed = writes.find((entry) => entry.label === 'layout:gpu-force:positions');
  const visibleSeed = writes.find((entry) => entry.label === 'layout:gpu-force:positions-output');
  assert.ok(simSeed?.data instanceof Float32Array);
  assert.ok(visibleSeed?.data instanceof Float32Array);

  approx(simSeed.data[0], 10);
  approx(simSeed.data[3], -10);
  approx(visibleSeed.data[0], 60);
  approx(visibleSeed.data[3], -60);
});

test('GpuForcePositionDelegate exposes WebGL2 texture resource when running on WebGL backend', () => {
  const network = createTopologyNetwork([
    0, 0, 0,
    10, 0, 0,
    20, 0, 0,
  ]);
  const { gl, getTexImageCalls } = createFakeWebGL2Context();
  const delegate = new GpuForcePositionDelegate({ mode: '2d' });

  delegate.onAttach({ network, backend: 'webgl2', gl });
  const resource = delegate.getWebGLPositionTexture({ network, backend: 'webgl', gl });

  assert.ok(resource?.texture);
  assert.equal(resource.count, 3);
  assert.equal(resource.version, delegate.version);
  assert.ok(getTexImageCalls() > 0);
  assert.equal(delegate.getNodePositionView({ network, backend: 'webgl2', gl }), null);
});

test('GpuForcePositionDelegate preserves dynamic positions across version-change topology syncs', async () => {
  const positionView = new Float32Array([
    60, 0, 0,
    -60, 0, 0,
  ]);
  let topologyVersion = 1;
  let activeNodeIndices = new Uint32Array([0, 1]);
  const network = {
    nodeCapacity: 2,
    get nodeIndices() {
      return activeNodeIndices;
    },
    edgeIndices: new Uint32Array([0]),
    edgesView: new Uint32Array([0, 1]),
    withBufferAccess: (fn) => fn(),
    getTopologyVersions: () => ({ node: topologyVersion, edge: topologyVersion }),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positionView, version: topologyVersion };
      if (name === '$index') return { version: topologyVersion };
      return null;
    },
    getEdgeAttributeBuffer: (name) => (name === '$index' ? { version: topologyVersion } : null),
  };

  const { gl } = createFakeWebGL2Context();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 6,
    sampleCount2D: 8,
  });

  delegate.onAttach({ network, backend: 'webgl2', gl });
  const changed = delegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  assert.equal(changed, true);
  const before = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  topologyVersion += 1;
  activeNodeIndices = new Uint32Array([0]);
  delegate.ensureSynchronized({ network, backend: 'webgl2', gl });
  const after = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  assert.ok(before instanceof Float32Array);
  assert.ok(after instanceof Float32Array);
  assert.equal(before.length, after.length);
  approx(after[0], before[0], 1e-5);
  approx(after[1], before[1], 1e-5);
  approx(after[3], before[3], 1e-5);
  approx(after[4], before[4], 1e-5);
});

test('GpuForcePositionDelegate WebGL2 backend advances layout and updates snapshots', async () => {
  const network = createTopologyNetwork([
    60, 0, 0,
    -60, 0, 0,
  ]);
  const { gl, getTexImageCalls } = createFakeWebGL2Context();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 6,
    sampleCount2D: 8,
  });
  delegate.onAttach({ network, backend: 'webgl2', gl });

  const before = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });
  const changed = delegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  const after = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  assert.equal(changed, true);
  assert.ok(before instanceof Float32Array);
  assert.ok(after instanceof Float32Array);
  assert.equal(before.length, after.length);
  assert.notEqual(after[0], before[0]);
  assert.equal(after[2], 0);
  assert.ok(getTexImageCalls() >= 2);
});
