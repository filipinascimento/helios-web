import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/Helios.js';
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

function approx(actual, expected, epsilon = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ~= ${expected}`);
}

test('GpuForceLayout exposes a PositionDelegate and adopts delegate source on initialize', async () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, { helios, mode: '2d' });

  assert.ok(layout.getPositionDelegate() instanceof PositionDelegate);
  await layout.initialize();

  const state = helios.getState();
  assert.equal(state.source, 'delegate');
  assert.equal(state.delegate, layout.getPositionDelegate());
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

test('GpuForceLayout dispose returns to network source when it owns the active delegate', async () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, { helios, mode: '2d' });

  await layout.initialize();
  assert.equal(helios.getState().source, 'delegate');

  layout.dispose();
  assert.equal(helios.getState().source, 'network');
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
