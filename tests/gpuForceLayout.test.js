import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/Helios.js';
import { StaticLayout, WorkerLayout } from '../src/layouts/Layout.js';
import { D3Force3DLayout } from '../src/layouts/d3force3dLayoutWorker.js';
import { GpuForceLayout, resolveGpuForceAutoTuning } from '../src/layouts/GpuForceLayout.js';
import {
  GpuForcePositionDelegate,
  resolveUmapEpochCount,
  warmStartUmapPositionsFromTopology,
} from '../src/delegates/GpuForcePositionDelegate.js';
import { PositionDelegate } from '../src/delegates/PositionDelegate.js';
import { buildSparklinePath } from '../src/ui/panels/LayoutPanel.js';

const ATTRIBUTE_TYPE = {
  String: 0,
  Boolean: 1,
  Float: 2,
};

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

function createSizedStubNetwork(nodeCount) {
  const safeNodeCount = Math.max(0, Math.floor(Number(nodeCount) || 0));
  const nodeIndices = new Uint32Array(safeNodeCount);
  for (let i = 0; i < safeNodeCount; i += 1) {
    nodeIndices[i] = i;
  }
  return {
    ...createStubNetwork(),
    nodeCapacity: safeNodeCount,
    nodeIndices,
  };
}

function createUmapFlaggedNetwork({
  umap = true,
  edgeWeightAttribute = 'umap_weight',
  nodeMassAttribute = 'umap_mass',
  umapA = 1.7,
  umapB = 0.83,
  umapGamma = 1.25,
  umapNegativeSampleRate = 7,
  umapEpochs = 500,
} = {}) {
  const base = createStubNetwork();
  const numericAttributes = new Map([
    ['umap', { type: ATTRIBUTE_TYPE.Boolean, view: new Uint8Array([umap ? 1 : 0]) }],
    ['umap_a', { type: ATTRIBUTE_TYPE.Float, view: new Float32Array([umapA]) }],
    ['umap_b', { type: ATTRIBUTE_TYPE.Float, view: new Float32Array([umapB]) }],
    ['umap_gamma', { type: ATTRIBUTE_TYPE.Float, view: new Float32Array([umapGamma]) }],
    ['umap_negative_sample_rate', { type: ATTRIBUTE_TYPE.Float, view: new Float32Array([umapNegativeSampleRate]) }],
    ['umap_n_epochs', { type: ATTRIBUTE_TYPE.Float, view: new Float32Array([umapEpochs]) }],
  ]);
  const stringAttributes = new Map([
    ['umap_edge_weight_attr', edgeWeightAttribute],
    ['umap_node_mass_attr', nodeMassAttribute],
  ]);
  return {
    ...base,
    hasEdgeAttribute(name) {
      return name === edgeWeightAttribute;
    },
    hasNodeAttribute(name) {
      return name === nodeMassAttribute;
    },
    getNetworkAttributeInfo(name) {
      if (stringAttributes.has(name)) return { type: ATTRIBUTE_TYPE.String, dimension: 1 };
      if (numericAttributes.has(name)) return { type: numericAttributes.get(name).type, dimension: 1 };
      return null;
    },
    getNetworkAttributeBuffer(name) {
      const attribute = numericAttributes.get(name) ?? null;
      if (!attribute) return null;
      return { view: attribute.view };
    },
    getNetworkStringAttribute(name) {
      return stringAttributes.get(name) ?? null;
    },
  };
}

function createStubHelios() {
  const state = { source: 'network', delegate: null };
  let renderRequests = 0;
  let stopCalls = 0;
  let lastStopReason = null;
  return {
    scheduler: {
      requestRender: () => { renderRequests += 1; },
    },
    stopLayout(reason = 'user') {
      stopCalls += 1;
      lastStopReason = reason;
      return this;
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
    getStopCalls: () => stopCalls,
    getLastStopReason: () => lastStopReason,
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

function createIsolatedTopologyNetwork(positions) {
  const positionView = new Float32Array(positions);
  const nodeCount = Math.floor(positionView.length / 3);
  const nodeIndices = new Uint32Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    nodeIndices[i] = i;
  }

  return {
    nodeCapacity: nodeCount,
    nodeIndices,
    edgeIndices: new Uint32Array(0),
    edgesView: new Uint32Array(0),
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
  const dispatchCalls = [];
  const queue = {
    writeBuffer(buffer, offset, data, dataOffset = 0, size = undefined) {
      let copy = null;
      if (data instanceof Float32Array) {
        copy = new Float32Array(data);
      } else if (data instanceof Uint32Array) {
        copy = new Uint32Array(data);
      } else if (data instanceof ArrayBuffer) {
        const byteOffset = Math.max(0, dataOffset | 0);
        const byteLength = size == null ? Math.max(0, data.byteLength - byteOffset) : Math.max(0, size | 0);
        copy = new Uint8Array(data.slice(byteOffset, byteOffset + byteLength));
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
            dispatchWorkgroups(x, y = 1, z = 1) {
              dispatchCalls.push({ x, y, z });
            },
            end() {},
          };
        },
        copyBufferToBuffer() {},
        finish() { return {}; },
      };
    },
  };

  return { device, writes, dispatchCalls };
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

function createFakeWebGL2ComputeContext() {
  let textureId = 1;
  let shaderId = 1;
  let programId = 1;
  let framebufferId = 1;
  let vaoId = 1;
  let texImageCalls = 0;
  let texSubImageCalls = 0;
  const texImagePayloads = [];
  const texSubImagePayloads = [];
  let drawArraysCalls = 0;
  let currentFramebuffer = null;
  let currentProgram = null;
  let currentVao = null;
  let currentActiveTexture = 0x84C0;
  const viewport = new Int32Array([0, 0, 1, 1]);
  const enabledCaps = new Set([0x0B71, 0x0BE2]);
  const completeStatus = 0x8CD5;
  const gl = {
    MAX_TEXTURE_SIZE: 0x0D33,
    FRAMEBUFFER_BINDING: 0x8CA6,
    VERTEX_ARRAY_BINDING: 0x85B5,
    CURRENT_PROGRAM: 0x8B8D,
    VIEWPORT: 0x0BA2,
    ACTIVE_TEXTURE: 0x84E0,
    TEXTURE0: 0x84C0,
    TEXTURE_2D: 0x0DE1,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    NEAREST: 0x2600,
    FLOAT: 0x1406,
    UNSIGNED_INT: 0x1405,
    RGBA32F: 0x8814,
    RGBA: 0x1908,
    R32UI: 0x8236,
    RED_INTEGER: 0x8D94,
    COLOR_ATTACHMENT0: 0x8CE0,
    COLOR_ATTACHMENT1: 0x8CE1,
    COLOR_ATTACHMENT2: 0x8CE2,
    FRAMEBUFFER: 0x8D40,
    FRAMEBUFFER_COMPLETE: completeStatus,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    COMPILE_STATUS: 0x8B81,
    LINK_STATUS: 0x8B82,
    TRIANGLES: 0x0004,
    BLEND: 0x0BE2,
    DEPTH_TEST: 0x0B71,
    RGBA32UI: 0x8D70,
    createTexture() {
      return { id: textureId += 1 };
    },
    deleteTexture() {},
    bindTexture() {},
    texParameteri() {},
    texImage2D(...args) {
      texImageCalls += 1;
      texImagePayloads.push(args);
    },
    texSubImage2D(...args) {
      texSubImageCalls += 1;
      texSubImagePayloads.push(args);
    },
    createShader(type) { return { id: shaderId += 1, type }; },
    shaderSource() {},
    compileShader() {},
    getShaderParameter(_shader, param) {
      return param === this.COMPILE_STATUS;
    },
    getShaderInfoLog() { return ''; },
    deleteShader() {},
    createProgram() { return { id: programId += 1 }; },
    attachShader() {},
    linkProgram() {},
    getProgramParameter(_program, param) {
      return param === this.LINK_STATUS;
    },
    getProgramInfoLog() { return ''; },
    deleteProgram() {},
    getUniformLocation(_program, name) { return name; },
    createFramebuffer() { return { id: framebufferId += 1 }; },
    deleteFramebuffer() {},
    bindFramebuffer(_target, framebuffer) { currentFramebuffer = framebuffer ?? null; },
    framebufferTexture2D() {},
    drawBuffers() {},
    checkFramebufferStatus() { return completeStatus; },
    createVertexArray() { return { id: vaoId += 1 }; },
    bindVertexArray(vao) { currentVao = vao ?? null; },
    deleteVertexArray() {},
    viewport(x, y, width, height) {
      viewport[0] = x;
      viewport[1] = y;
      viewport[2] = width;
      viewport[3] = height;
    },
    useProgram(program) { currentProgram = program ?? null; },
    activeTexture(textureUnit) { currentActiveTexture = textureUnit; },
    uniform1i() {},
    uniform2i() {},
    uniform1ui() {},
    uniform3f() {},
    uniform1f() {},
    drawArrays() { drawArraysCalls += 1; },
    getParameter(param) {
      if (param === this.MAX_TEXTURE_SIZE) return 64;
      if (param === this.FRAMEBUFFER_BINDING) return currentFramebuffer;
      if (param === this.VERTEX_ARRAY_BINDING) return currentVao;
      if (param === this.CURRENT_PROGRAM) return currentProgram;
      if (param === this.VIEWPORT) return viewport;
      if (param === this.ACTIVE_TEXTURE) return currentActiveTexture;
      return 0;
    },
    isEnabled(cap) { return enabledCaps.has(cap); },
    enable(cap) { enabledCaps.add(cap); },
    disable(cap) { enabledCaps.delete(cap); },
    getExtension(name) {
      return name === 'EXT_color_buffer_float' ? {} : null;
    },
    readBuffer() {},
    readPixels(_x, _y, width, height, _format, _type, target) {
      if (target?.fill) {
        target.fill(0, 0, Math.max(0, width * height * 4));
      }
    },
  };
  return {
    gl,
    getTexImageCalls: () => texImageCalls,
    getTexImagePayloads: () => texImagePayloads.slice(),
    getTexSubImageCalls: () => texSubImageCalls,
    getTexSubImagePayloads: () => texSubImagePayloads.slice(),
    getDrawArraysCalls: () => drawArraysCalls,
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

test('D3Force3DLayout posts an adopt-only tick immediately after position handoff', () => {
  const network = createStubNetwork();
  let seedCalls = 0;
  const visuals = {
    nodePositions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0,
      3, 0, 0,
    ]),
    withBufferAccess: (fn) => fn(),
    seedMissingPositions: () => { seedCalls += 1; },
    markPositionsDirty: () => {},
  };
  const layout = new D3Force3DLayout(network, visuals, { mode: '3d' });
  let posted = null;
  layout.worker = {
    postMessage: (message) => {
      posted = message;
    },
  };
  layout.pending = false;
  layout.seededPositions = true;
  layout.completePositionHandoff(new Float32Array(visuals.nodePositions), { emitUpdate: false });

  layout.step();
  assert.equal(posted?.type, 'tick');
  assert.equal(posted?.adoptOnly, true);
  assert.equal(seedCalls, 0);

  posted = null;
  layout.pending = false;
  layout.step();
  assert.equal(posted?.adoptOnly, undefined);
});

test('D3Force3DLayout can adopt handoff alpha from the previous layout', () => {
  const layout = new D3Force3DLayout(createStubNetwork(), { nodePositions: new Float32Array(12) }, { mode: '3d' });

  layout.adoptHandoffState({ alpha: 0.125 });

  assert.equal(layout.settings.alpha, 0.125);
  assert.equal(layout.reheatAlpha, 0.125);
  assert.equal(layout.optionsDirty, true);
});

test('D3Force3DLayout can adopt handoff center from the previous layout snapshot', () => {
  const layout = new D3Force3DLayout(createStubNetwork(), { nodePositions: new Float32Array(12) }, { mode: '3d' });

  layout.adoptHandoffState({ center: [12, -8, 4] });

  assert.deepEqual(layout.settings.center, [12, -8, 4]);
  assert.equal(layout.optionsDirty, true);
});

test('WorkerLayout exposes shared parameter bindings for force and jitter layouts', () => {
  const network = createStubNetwork();
  const visuals = {
    nodePositions: new Float32Array(12),
    withBufferAccess: (fn) => fn(),
  };

  const forceLayout = new WorkerLayout(network, visuals, { layout: 'force3d' });
  const forceDescriptor = forceLayout.getParameterBindings();
  assert.equal(forceDescriptor.key, 'worker:force3d');
  assert.ok(forceDescriptor.dynamic);
  assert.ok(forceDescriptor.bindings.some((binding) => binding.key === 'kRepulsion'));

  const repulsionBinding = forceDescriptor.bindings.find((binding) => binding.key === 'kRepulsion');
  assert.equal(repulsionBinding.scale, 'log');
  assert.equal(repulsionBinding.notation, 'scientific');
  repulsionBinding.set(4.5);
  assert.equal(forceLayout.options.kRepulsion, 4.5);

  const dampingBinding = forceDescriptor.bindings.find((binding) => binding.key === 'damping');
  assert.equal(dampingBinding.label, 'Velocity retention');
  assert.match(dampingBinding.hint, /momentum/i);
  const gravityBinding = forceDescriptor.bindings.find((binding) => binding.key === 'kGravity');
  assert.equal(gravityBinding.inputMin, 0);

  const jitterLayout = new WorkerLayout(network, visuals, { layout: 'jitter', jitter: 2 });
  const jitterDescriptor = jitterLayout.getParameterBindings();
  assert.equal(jitterDescriptor.key, 'worker:jitter');
  assert.deepEqual(jitterDescriptor.bindings.map((binding) => binding.key), ['jitter']);
});

test('D3Force3DLayout exposes shared parameter bindings and can reheat alpha', () => {
  const network = createStubNetwork();
  const visuals = {
    nodePositions: new Float32Array(12),
    withBufferAccess: (fn) => fn(),
    seedMissingPositions: () => {},
  };

  const layout = new D3Force3DLayout(network, visuals, {});
  assert.equal(layout.settings.alphaDecay, 0.003);
  const descriptor = layout.getParameterBindings();
  assert.equal(descriptor.key, 'd3force3d');
  assert.ok(descriptor.bindings.some((binding) => binding.key === 'alphaCurrent'));
  assert.ok(descriptor.bindings.some((binding) => binding.key === 'autoStopAtAlphaMin'));
  const alphaCurrentBinding = descriptor.bindings.find((binding) => binding.key === 'alphaCurrent');
  assert.equal(alphaCurrentBinding.label, 'Temp.');
  assert.equal(alphaCurrentBinding.history.scale, 'log');
  assert.equal(alphaCurrentBinding.history.max, 1);
  assert.equal(alphaCurrentBinding.history.min(), layout.settings.alphaMin);

  for (const key of ['alphaDecay', 'alphaTarget', 'alphaMin']) {
    const binding = descriptor.bindings.find((entry) => entry.key === key);
    assert.match(binding.label, /^Temp\./);
    assert.equal(binding.scale, 'log');
    assert.equal(binding.notation, 'scientific');
    assert.equal(binding.inputMin, 0);
    assert.equal(binding.inputMax, 1);
  }

  layout.settings.alpha = 0.05;
  layout.reheat();
  assert.equal(layout.settings.alpha, 1);

  const forcesStrengthBinding = descriptor.bindings.find((binding) => binding.key === 'forcesStrength');
  layout.settings.alpha = 0.05;
  forcesStrengthBinding.set(2);
  assert.equal(layout.settings.forcesStrength, 2);
  assert.equal(layout.settings.alpha, 1);
});

test('D3Force3DLayout switches between 2D and 3D modes and seeds planar depth on 3D activation', () => {
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
    markPositionsDirty: () => {},
  };

  const layout = new D3Force3DLayout(network, visuals, { mode: '2d', settings: { use2D: true } });
  layout.setSettings({ mode: '3d' });

  assert.equal(layout.options.mode, '3d');
  assert.equal(layout.settings.use2D, false);

  const zValues = [];
  for (let i = 2; i < visuals.nodePositions.length; i += 3) {
    zValues.push(visuals.nodePositions[i]);
  }
  assert.ok(zValues.some((value) => Math.abs(value) > 1e-9));
  const meanZ = zValues.reduce((sum, value) => sum + value, 0) / zValues.length;
  assert.ok(Math.abs(meanZ) < 1e-6);
});

test('Layout snapshot handoff writes both visuals and layout-network position buffers when they differ', () => {
  const networkPositions = new Float32Array([
    0, 0, 0,
    0, 0, 0,
  ]);
  const visualPositions = new Float32Array([
    9, 9, 9,
    9, 9, 9,
  ]);
  const network = {
    nodeIndices: new Uint32Array([0, 1]),
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: () => ({ view: networkPositions }),
  };
  const visuals = {
    nodePositions: visualPositions,
    withBufferAccess: (fn) => fn(),
    markPositionsDirty: () => {},
  };
  const layout = new StaticLayout(network, visuals);
  const snapshot = new Float32Array([
    1, 2, 3,
    4, 5, 6,
  ]);

  const wrote = layout.seedFromPositionSnapshot(snapshot);

  assert.equal(wrote, true);
  assert.deepEqual(Array.from(visualPositions), Array.from(snapshot));
  assert.deepEqual(Array.from(networkPositions), Array.from(snapshot));
});

test('GpuForceLayout exposes shared parameter bindings and can reheat alpha', () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, { helios, mode: '2d', alpha: 0.75 });
  assert.equal(layout.options.eta, 0.4);
  assert.equal(layout.options.kGravity, 0.005);
  assert.equal(layout.options.alphaDecay, 0.005);
  const descriptor = layout.getParameterBindings();
  assert.equal(descriptor.key, 'gpu-force');
  assert.ok(descriptor.bindings.some((binding) => binding.key === 'alphaCurrent'));
  assert.ok(descriptor.bindings.some((binding) => binding.key === 'autoStopAtAlphaMin'));

  const repulsionBinding = descriptor.bindings.find((binding) => binding.key === 'kRepulsion');
  assert.equal(repulsionBinding.scale, 'log');
  assert.equal(repulsionBinding.notation, 'scientific');

  const dampingBinding = descriptor.bindings.find((binding) => binding.key === 'damping');
  assert.equal(dampingBinding.label, 'Velocity retention');
  assert.match(dampingBinding.hint, /momentum/i);
  const gravityBinding = descriptor.bindings.find((binding) => binding.key === 'kGravity');
  assert.equal(gravityBinding.inputMin, 0);

  const sampleCountBinding = descriptor.bindings.find((binding) => binding.key === 'sampleCount2D');
  assert.equal(sampleCountBinding.sliderMax, 256);
  assert.equal(sampleCountBinding.inputMax, null);
  layout.positionDelegate.alpha = 0.05;
  sampleCountBinding.set(128);
  assert.equal(layout.options.sampleCount2D, 128);
  assert.equal(layout.positionDelegate.alpha, 0.75);

  const sampleChurnBinding = descriptor.bindings.find((binding) => binding.key === 'sampleChurn');
  assert.equal(sampleChurnBinding.label, 'Sample churn');
  assert.equal(sampleChurnBinding.scale, undefined);
  assert.equal(sampleChurnBinding.min, 0);
  assert.equal(sampleChurnBinding.max, 1);
  assert.equal(sampleChurnBinding.inputMin, 0);
  assert.equal(sampleChurnBinding.inputMax, 1);
  assert.match(sampleChurnBinding.hint, /exact repulsion/i);
  layout.positionDelegate.alpha = 0.05;
  sampleChurnBinding.set(0.25);
  assert.equal(layout.options.sampleChurn, 0.25);
  assert.equal(layout.positionDelegate.alpha, 0.75);

  const outputScaleBinding = descriptor.bindings.find((binding) => binding.key === 'outputScale');
  assert.equal(outputScaleBinding.scale, 'log');
  assert.equal(outputScaleBinding.notation, 'scientific');

  const alphaCurrentBinding = descriptor.bindings.find((binding) => binding.key === 'alphaCurrent');
  assert.equal(alphaCurrentBinding.label, 'Temp.');
  assert.equal(alphaCurrentBinding.history.scale, 'log');
  assert.equal(alphaCurrentBinding.history.max, 1);
  assert.equal(alphaCurrentBinding.history.min(), layout.options.alphaMin);

  for (const key of ['alphaDecay', 'alphaTarget', 'alphaMin']) {
    const binding = descriptor.bindings.find((entry) => entry.key === key);
    assert.match(binding.label, /^Temp\./);
    assert.equal(binding.scale, 'log');
    assert.equal(binding.notation, 'scientific');
    assert.equal(binding.inputMin, 0);
    assert.equal(binding.inputMax, 1);
  }

  layout.positionDelegate.alpha = 0.1;
  layout.reheat();
  assert.equal(layout.positionDelegate.alpha, 0.75);
});

test('GpuForceLayout seedFromNetworkPositions forwards explicit initial-position intent', () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, {
    helios,
    mode: '2d',
    forceModel: 'umap',
  });
  let captured = null;
  layout.positionDelegate.resetDynamicStateFromNetwork = (context) => {
    captured = context;
    return layout.positionDelegate;
  };

  layout.seedFromNetworkPositions({ forceInitialPositions: true });
  assert.equal(captured.forceInitialPositions, true);
});

test('GpuForceLayout auto-stops at min temp by default and can be disabled', () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, {
    helios,
    alphaMin: 0.001,
    autoStopAtAlphaMin: true,
  });
  layout.positionDelegate.step = () => {
    layout.positionDelegate.alpha = 0.001;
    return false;
  };

  layout.step(16);
  assert.equal(helios.getStopCalls(), 1);
  assert.equal(helios.getLastStopReason(), 'alpha-min');

  const heliosNoStop = createStubHelios();
  const layoutNoStop = new GpuForceLayout(network, visuals, {
    helios: heliosNoStop,
    alphaMin: 0.001,
    autoStopAtAlphaMin: false,
  });
  layoutNoStop.positionDelegate.step = () => {
    layoutNoStop.positionDelegate.alpha = 0.001;
    return false;
  };

  layoutNoStop.step(16);
  assert.equal(heliosNoStop.getStopCalls(), 0);
});

test('D3Force3DLayout auto-stops at min temp by default and can be disabled', () => {
  const network = createStubNetwork();
  const visuals = {
    nodePositions: new Float32Array(12),
    withBufferAccess: (fn) => fn(),
    markPositionsDirty: () => {},
  };
  const helios = createStubHelios();
  const layout = new D3Force3DLayout(network, visuals, {
    helios,
    settings: { alphaMin: 0.001, autoStopAtAlphaMin: true },
  });

  layout.handleMessage({
    type: 'positions',
    positions: new Float32Array(12),
    alpha: 0.001,
  });
  assert.equal(helios.getStopCalls(), 1);
  assert.equal(helios.getLastStopReason(), 'alpha-min');

  const heliosNoStop = createStubHelios();
  const layoutNoStop = new D3Force3DLayout(network, visuals, {
    helios: heliosNoStop,
    settings: { alphaMin: 0.001, autoStopAtAlphaMin: false },
  });

  layoutNoStop.handleMessage({
    type: 'positions',
    positions: new Float32Array(12),
    alpha: 0.001,
  });
  assert.equal(heliosNoStop.getStopCalls(), 0);
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
  assert.equal(layout.options.eta, 0.4);
  assert.equal(layout.options.kGravity, 0.005);
  assert.equal(layout.options.alphaDecay, 0.005);
});

test('resolveGpuForceAutoTuning scales GPU force defaults by log-sized node count', () => {
  const base = {
    maxNeighborsPerNode: 64,
    sampleCount2D: 64,
    sampleCount3D: 96,
    sampleChurn: 0,
  };

  assert.deepEqual(resolveGpuForceAutoTuning(10_000, base), base);
  const large = resolveGpuForceAutoTuning(1_000_000, base);
  assert.equal(large.maxNeighborsPerNode, 20);
  assert.equal(large.sampleCount2D, 10);
  assert.equal(large.sampleCount3D, 10);
  approx(large.sampleChurn, 0.05);
  const mid = resolveGpuForceAutoTuning(100_000, base);
  assert.equal(mid.maxNeighborsPerNode, 42);
  assert.equal(mid.sampleCount2D, 37);
  assert.equal(mid.sampleCount3D, 53);
  approx(mid.sampleChurn, 0.025);
});

test('Helios.createLayout auto-tunes gpu-force defaults for large graphs while preserving explicit overrides', () => {
  const helios = Object.create(Helios.prototype);
  helios.network = createSizedStubNetwork(1_000_000);
  helios.visuals = {};
  helios.options = { mode: '2d' };
  helios.debug = { log: () => {} };

  const autoLayout = helios.createLayout({ type: 'gpu-force', options: { mode: '2d' } });
  assert.equal(autoLayout.options.maxNeighborsPerNode, 20);
  assert.equal(autoLayout.options.sampleCount2D, 10);
  approx(autoLayout.options.sampleChurn, 0.05);

  const overriddenLayout = helios.createLayout({
    type: 'gpu-force',
    options: { mode: '2d', maxNeighborsPerNode: 31, sampleCount2D: 27 },
  });
  assert.equal(overriddenLayout.options.maxNeighborsPerNode, 31);
  assert.equal(overriddenLayout.options.sampleCount2D, 27);
  approx(overriddenLayout.options.sampleChurn, 0.05);
});

test('Helios.createLayout auto-enables UMAP gpu-force mode from graph metadata', () => {
  const helios = Object.create(Helios.prototype);
  helios.network = createUmapFlaggedNetwork();
  helios.visuals = {};
  helios.options = { mode: '2d' };
  helios.debug = { log: () => {} };

  const layout = helios.createLayout({ type: 'gpu-force', options: { mode: '2d' } });

  assert.ok(layout instanceof GpuForceLayout);
  assert.equal(layout.options.forceModel, 'umap');
  assert.equal(layout.options.edgeWeightAttribute, 'umap_weight');
  assert.equal(layout.options.nodeMassAttribute, 'umap_mass');
  assert.equal(layout.options.kRepulsion, 1);
  assert.equal(layout.options.kAttraction, 1);
  assert.equal(layout.options.kGravity, 0);
  approx(layout.options.umapA, 1.7);
  approx(layout.options.umapB, 0.83);
  approx(layout.options.umapGamma, 1.25);
  approx(layout.options.umapNegativeSampleRate, 7);
  approx(layout.options.umapEpochs, 500);
  assert.equal(layout.options.eta, 1);
  assert.equal(layout.options.alphaDecay, 0.0025);
  approx(layout.options.sampleChurn, 0.01);
});

test('Helios.createLayout keeps legacy linear gpu-force behavior unless UMAP is enabled', () => {
  const helios = Object.create(Helios.prototype);
  helios.network = createUmapFlaggedNetwork();
  helios.visuals = {};
  helios.options = { mode: '2d' };
  helios.debug = { log: () => {} };

  const layout = helios.createLayout({
    type: 'gpu-force',
    options: { mode: '2d', forceModel: 'linear', kRepulsion: 0.33, kAttraction: 0.44 },
  });

  assert.equal(layout.options.forceModel, 'linear');
  assert.equal(layout.options.kRepulsion, 0.33);
  assert.equal(layout.options.kAttraction, 0.44);
});

test('GpuForceLayout can resync auto-tuned defaults when the layout network size changes', () => {
  const layout = new GpuForceLayout(createSizedStubNetwork(10_000), {}, { mode: '2d' });
  assert.equal(layout.options.maxNeighborsPerNode, 64);
  assert.equal(layout.options.sampleCount2D, 64);
  approx(layout.options.sampleChurn, 0);

  assert.equal(layout.syncAutoSettingsForNetwork(createSizedStubNetwork(1_000_000)), true);
  assert.equal(layout.options.maxNeighborsPerNode, 20);
  assert.equal(layout.options.sampleCount2D, 10);
  approx(layout.options.sampleChurn, 0.05);

  layout.setSettings({ sampleCount2D: 23 });
  assert.equal(layout.syncAutoSettingsForNetwork(createSizedStubNetwork(500_000)), true);
  assert.equal(layout.options.sampleCount2D, 23);
  assert.equal(layout.options.maxNeighborsPerNode, 27);
});

test('Helios.startLayout reheats the active layout before requesting ticks', () => {
  const helios = Object.create(Helios.prototype);
  let reheatCalls = 0;
  let setLayoutEnabledCalls = 0;
  let requestLayoutCalls = 0;
  helios.scheduler = {
    setLayoutEnabled(enabled, reason) {
      assert.equal(enabled, true);
      assert.equal(reason, 'user');
      setLayoutEnabledCalls += 1;
    },
    requestLayout(reason) {
      assert.equal(reason, 'user');
      requestLayoutCalls += 1;
    },
  };
  helios._layout = {
    reheat() {
      reheatCalls += 1;
    },
  };
  helios.debug = { log: () => {} };

  const result = helios.startLayout();
  assert.equal(result, helios);
  assert.equal(reheatCalls, 1);
  assert.equal(setLayoutEnabledCalls, 1);
  assert.equal(requestLayoutCalls, 1);
});

test('Helios wakes idle layouts without unpausing manually stopped layouts', () => {
  const helios = Object.create(Helios.prototype);
  const calls = [];
  let state = 'idle';
  helios.scheduler = {
    getLayoutState() {
      return state;
    },
    setLayoutEnabled(enabled, reason) {
      calls.push(['setLayoutEnabled', enabled, reason]);
      state = enabled ? 'running' : 'stopped';
    },
    requestLayout(reason) {
      calls.push(['requestLayout', reason]);
    },
  };

  assert.equal(helios._wakeLayoutIfIdle('filter'), true);
  assert.deepEqual(calls, [
    ['setLayoutEnabled', true, 'filter'],
    ['requestLayout', 'filter'],
  ]);

  calls.length = 0;
  state = 'stopped';
  assert.equal(helios._wakeLayoutIfIdle('filter'), false);
  assert.deepEqual(calls, []);
});

test('Helios resumes dynamic layouts after network replacement only when the previous layout auto-idled', () => {
  const helios = Object.create(Helios.prototype);
  const calls = [];
  let state = 'idle';
  helios._layout = {
    reheat(reason) {
      calls.push(['reheat', reason]);
    },
  };
  helios.scheduler = {
    getLayoutState() {
      return state;
    },
    setLayoutEnabled(enabled, reason) {
      calls.push(['setLayoutEnabled', enabled, reason]);
      state = enabled ? 'running' : 'stopped';
    },
    requestLayout(reason) {
      calls.push(['requestLayout', reason]);
    },
  };

  assert.equal(helios._resumeDynamicLayoutAfterNetworkReplace('idle', 'network-replaced'), true);
  assert.deepEqual(calls, [
    ['setLayoutEnabled', true, 'network-replaced'],
    ['requestLayout', 'network-replaced'],
    ['reheat', 'network-replaced'],
  ]);

  calls.length = 0;
  state = 'stopped';
  assert.equal(helios._resumeDynamicLayoutAfterNetworkReplace('stopped', 'network-replaced'), false);
  assert.deepEqual(calls, []);
});

test('Helios does not resume static layouts after network replacement', () => {
  const helios = Object.create(Helios.prototype);
  helios._layout = new StaticLayout(null, null);

  assert.equal(helios._resumeDynamicLayoutAfterNetworkReplace('idle', 'network-replaced'), false);
});

test('Helios activates delegate-backed layouts after network replacement before resuming them', () => {
  const helios = Object.create(Helios.prototype);
  const calls = [];
  let state = 'idle';
  helios._layout = {
    reheat(reason) {
      calls.push(['reheat', reason]);
    },
  };
  helios._enforcePositionSourcePolicy = (layout, options) => {
    calls.push(['enforcePositionSourcePolicy', layout, options]);
  };
  helios.scheduler = {
    setLayout(layout) {
      calls.push(['setLayout', layout]);
    },
    getLayoutState() {
      return state;
    },
    setLayoutEnabled(enabled, reason) {
      calls.push(['setLayoutEnabled', enabled, reason]);
      state = enabled ? 'running' : 'stopped';
    },
    requestLayout(reason) {
      calls.push(['requestLayout', reason]);
    },
  };
  helios._emitLayoutChanged = (layout) => {
    calls.push(['emitLayoutChanged', layout]);
  };

  helios._activateLayoutAfterNetworkReplace('idle', 'network-replaced');

  assert.deepEqual(calls, [
    ['enforcePositionSourcePolicy', helios._layout, { resetInterpolation: false }],
    ['setLayout', helios._layout],
    ['setLayoutEnabled', true, 'network-replaced'],
    ['requestLayout', 'network-replaced'],
    ['reheat', 'network-replaced'],
    ['emitLayoutChanged', helios._layout],
  ]);
});

test('graph filter mutation reheats and wakes an idle layout', () => {
  const helios = Object.create(Helios.prototype);
  const calls = [];
  let state = 'idle';
  helios.scheduler = {
    getLayoutState() {
      return state;
    },
    setLayoutEnabled(enabled, reason) {
      calls.push(['setLayoutEnabled', enabled, reason]);
      state = enabled ? 'running' : 'stopped';
    },
    requestLayout(reason) {
      calls.push(['requestLayout', reason]);
    },
    requestGeometry() {
      calls.push(['requestGeometry']);
    },
    requestRender() {
      calls.push(['requestRender']);
    },
  };
  helios._layout = {
    reheat(reason) {
      calls.push(['reheat', reason]);
      helios._wakeLayoutIfIdle(reason);
    },
  };
  helios._refreshGraphFilterNetworks = () => {};
  helios._syncLayoutNetworkFromFilter = () => false;
  helios._ensureGraphFilterState = () => ({ scope: 'render+layout' });
  helios._labels = { requestFullReselect() {} };
  helios.emit = () => {};
  helios.getGraphFilter = () => ({});

  helios._afterGraphFilterMutation('filter');

  assert.deepEqual(calls, [
    ['reheat', 'filter'],
    ['setLayoutEnabled', true, 'filter'],
    ['requestLayout', 'filter'],
    ['requestGeometry'],
    ['requestLayout', 'filter'],
    ['requestRender'],
  ]);
});

test('Helios lists numeric 2D/3D node attributes for layout seeding and copies them into positions', () => {
  const positions = new Float32Array([
    0, 0, 0,
    1, 1, 1,
    2, 2, 2,
  ]);
  const planar = new Float32Array([
    10, 20,
    30, 40,
    50, 60,
  ]);
  const depth = new Float32Array([
    -1, -2, -3,
    -4, -5, -6,
    -7, -8, -9,
  ]);
  const degree = new Float32Array([1, 2, 3]);
  const network = {
    getNodeAttributeNames: () => ['embedding2d', 'embedding3d', 'degree', '_helios_visuals_position'],
    getNodeAttributeInfo: (name) => {
      switch (name) {
        case 'embedding2d':
          return { type: 2, dimension: 2, complex: false };
        case 'embedding3d':
          return { type: 2, dimension: 3, complex: false };
        case 'degree':
          return { type: 2, dimension: 1, complex: false };
        case '_helios_visuals_position':
          return { type: 2, dimension: 3, complex: false };
        default:
          return null;
      }
    },
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: (name) => {
      switch (name) {
        case 'embedding2d':
          return { view: planar };
        case 'embedding3d':
          return { view: depth };
        case '_helios_visuals_position':
          return { view: positions };
        default:
          return null;
      }
    },
  };
  let positionsDirty = 0;
  let nodeBumps = 0;
  let edgeBumps = 0;
  let geometryRequests = 0;
  let renderRequests = 0;
  let labelRefreshes = 0;
  const helios = Object.create(Helios.prototype);
  helios.network = network;
  helios.visuals = {
    ensureNodeAttribute: () => {},
    markPositionsDirty: () => { positionsDirty += 1; },
    bumpNodeAttributes: () => { nodeBumps += 1; },
    bumpEdgeAttributes: () => { edgeBumps += 1; },
  };
  helios.scheduler = {
    requestGeometry: () => { geometryRequests += 1; },
    requestRender: () => { renderRequests += 1; },
  };
  helios._labels = {
    requestFullReselect: () => { labelRefreshes += 1; },
  };
  let seedFromNetworkPositionsCalls = 0;
  helios._layout = {
    seedFromNetworkPositions: () => { seedFromNetworkPositionsCalls += 1; },
  };

  const choices = helios.getLayoutPositionAttributeChoices();
  assert.deepEqual(
    choices.map((entry) => entry.value),
    ['_helios_visuals_position', '$random', 'embedding2d', 'embedding3d'],
  );

  const wrotePlanar = helios.setLayoutPositionsFromNodeAttribute('embedding2d');
  assert.equal(wrotePlanar, true);
  assert.deepEqual(Array.from(positions), [
    10, 20, 0,
    30, 40, 0,
    50, 60, 0,
  ]);

  const wroteDepth = helios.setLayoutPositionsFromNodeAttribute('embedding3d');
  assert.equal(wroteDepth, true);
  assert.deepEqual(Array.from(positions), [
    -1, -2, -3,
    -4, -5, -6,
    -7, -8, -9,
  ]);

  assert.equal(positionsDirty, 2);
  assert.equal(nodeBumps, 2);
  assert.equal(edgeBumps, 2);
  assert.equal(geometryRequests, 2);
  assert.equal(renderRequests, 2);
  assert.equal(labelRefreshes, 2);
  assert.equal(seedFromNetworkPositionsCalls, 2);
});

test('buildSparklinePath stays blank until a second history sample arrives', () => {
  assert.equal(buildSparklinePath([], 120, 28, 'log', { min: 0.001, max: 1 }), '');
  const single = buildSparklinePath([0.5], 120, 28, 'log', { min: 0.001, max: 1 });
  assert.match(single, /^M 0 /);
  assert.doesNotMatch(single, /L /);
  const pair = buildSparklinePath([0.5, 0.25], 120, 28, 'log', { min: 0.001, max: 1 });
  assert.match(pair, /L /);
});

test('GpuForceLayout exposes UMAP-specific controls without altering linear defaults', () => {
  const network = createStubNetwork();
  const visuals = {};
  const helios = createStubHelios();
  const layout = new GpuForceLayout(network, visuals, {
    helios,
    forceModel: 'umap',
    mode: '2d',
  });

  const descriptor = layout.getParameterBindings();
  const bindingKeys = descriptor.bindings.map((binding) => binding.key);

  assert.equal(descriptor.label, 'UMAP Force (GPU)');
  assert.ok(bindingKeys.includes('umapA'));
  assert.ok(bindingKeys.includes('umapB'));
  assert.ok(bindingKeys.includes('umapGamma'));
  assert.ok(bindingKeys.includes('umapNegativeSampleRate'));
  assert.ok(!bindingKeys.includes('sampleCount2D'));
  assert.ok(!bindingKeys.includes('linkDistance'));
  assert.ok(!bindingKeys.includes('minDistance'));
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'umapNegativeSampleRate')?.label, 'Negative sample rate');
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'umapEpochCurrent')?.label, 'Epochs');
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'umapEpochCurrent')?.type, 'display');
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'umapEpochCurrent')?.history, undefined);
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'sampleChurn')?.label, 'Negative sample churn');
  assert.notEqual(descriptor.bindings.find((binding) => binding.key === 'umapA')?.type, 'display');
  assert.notEqual(descriptor.bindings.find((binding) => binding.key === 'umapB')?.type, 'display');
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'umapNegativeSampleRate')?.type, 'number');
  assert.notEqual(descriptor.bindings.find((binding) => binding.key === 'umapGamma')?.type, 'display');
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'kRepulsion')?.label, 'Repulsion importance');
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'kAttraction')?.label, 'Attraction importance');
  assert.equal(layout.options.alphaDecay, 0.0025);
  layout.positionDelegate._webgl = { sampleFrame: 17 };
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'umapEpochCurrent')?.get?.(), 17);
  assert.equal(descriptor.bindings.find((binding) => binding.key === 'umapEpochCurrent')?.format?.(17.9), '17');
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
  const simSeedData = simSeed?.data instanceof Float32Array
    ? simSeed.data
    : new Float32Array(simSeed?.data?.buffer ?? new ArrayBuffer(0));
  const visibleSeedData = visibleSeed?.data instanceof Float32Array
    ? visibleSeed.data
    : new Float32Array(visibleSeed?.data?.buffer ?? new ArrayBuffer(0));
  assert.ok(simSeedData instanceof Float32Array);
  assert.ok(visibleSeedData instanceof Float32Array);

  approx(simSeedData[0], 10);
  approx(simSeedData[3], -10);
  approx(visibleSeedData[0], 60);
  approx(visibleSeedData[3], -60);
});

test('GpuForcePositionDelegate adds deterministic depth jitter for planar 3D seeds', () => {
  const network = createTopologyNetwork([
    60, 0, 0,
    -60, 0, 0,
    0, 40, 0,
  ]);
  const { device, writes } = createFakeWebGPUDevice();
  const delegate = new GpuForcePositionDelegate({
    mode: '3d',
    center: [0, 0, 0],
    depth: 120,
    outputScale: 6,
  });

  delegate.onAttach({ network, backend: 'webgpu', device });

  const visibleSeed = writes.find((entry) => entry.label === 'layout:gpu-force:positions-output');
  const visibleSeedData = visibleSeed?.data instanceof Float32Array
    ? visibleSeed.data
    : new Float32Array(visibleSeed?.data?.buffer ?? new ArrayBuffer(0));
  assert.ok(visibleSeedData instanceof Float32Array);
  const zValues = [visibleSeedData[2], visibleSeedData[5], visibleSeedData[8]];
  assert.ok(zValues.some((value) => Math.abs(value) > 1e-6));
  assert.ok(Math.abs(zValues[0] + zValues[1] + zValues[2]) < 1e-5);
});

test('GpuForcePositionDelegate exposes WebGL2 texture resource when running on WebGL backend', () => {
  const network = createTopologyNetwork([
    0, 0, 0,
    10, 0, 0,
    20, 0, 0,
  ]);
  const { gl, getTexImageCalls } = createFakeWebGL2ComputeContext();
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

  const { gl } = createFakeWebGL2ComputeContext();
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

test('GpuForcePositionDelegate preserves dynamic XY positions when switching from 2D to 3D', async () => {
  const network = createTopologyNetwork([
    -60, -10, 0,
    -20, 15, 0,
    25, -5, 0,
    55, 10, 0,
  ]);
  const { gl } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 8,
    recenter: false,
  });

  delegate.onAttach({ network, backend: 'webgl2', gl });
  delegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  const before = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  delegate.updateOptions({ mode: '3d' });
  delegate.ensureSynchronized({ network, backend: 'webgl2', gl });
  const after = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  assert.ok(before instanceof Float32Array);
  assert.ok(after instanceof Float32Array);
  assert.equal(before.length, after.length);
  for (let i = 0; i < before.length; i += 3) {
    approx(after[i], before[i], 1e-5);
    approx(after[i + 1], before[i + 1], 1e-5);
  }
});

test('GpuForcePositionDelegate WebGL2 compute sync does not clear same-size textures when preserving dynamic state', () => {
  const positionView = new Float32Array([
    60, 0, 0,
    -60, 0, 0,
  ]);
  let topologyVersion = 1;
  const network = {
    nodeCapacity: 2,
    nodeIndices: new Uint32Array([0, 1]),
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

  const { gl, getTexImageCalls, getTexImagePayloads } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 6,
    sampleCount2D: 8,
  });

  delegate.onAttach({ network, backend: 'webgl2', gl });
  const initialTexImageCalls = getTexImageCalls();
  const initialPayloadCount = getTexImagePayloads().length;
  assert.ok(initialTexImageCalls > 0);

  topologyVersion += 1;
  delegate.ensureSynchronized({ network, backend: 'webgl2', gl });

  const additionalPayloads = getTexImagePayloads().slice(initialPayloadCount);
  assert.equal(getTexImageCalls(), initialTexImageCalls + 5);
  assert.equal(additionalPayloads.length, 5);
  for (const args of additionalPayloads) {
    assert.equal(args[2], gl.R32UI);
    assert.ok(args[8] instanceof Uint32Array);
  }
});

test('GpuForcePositionDelegate WebGL2 backend advances layout and updates snapshots', async () => {
  const network = createTopologyNetwork([
    60, 0, 0,
    -60, 0, 0,
  ]);
  const { gl, getTexImageCalls } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 6,
    sampleCount2D: 8,
  });
  delegate.onAttach({ network, backend: 'webgl2', gl });

  const resourceBefore = delegate.getWebGLPositionTexture({ network, backend: 'webgl2', gl });
  const before = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });
  const changed = delegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  const resourceAfter = delegate.getWebGLPositionTexture({ network, backend: 'webgl2', gl });
  const after = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  assert.equal(changed, true);
  assert.ok(before instanceof Float32Array);
  assert.ok(after instanceof Float32Array);
  assert.equal(before.length, after.length);
  assert.ok(resourceBefore?.texture);
  assert.ok(resourceAfter?.texture);
  assert.ok((resourceAfter?.meta?.version ?? 0) > (resourceBefore?.meta?.version ?? -1));
  assert.equal(delegate._webgl?._gpu?.sampleFrame, 1);
  assert.ok(getTexImageCalls() >= 2);
});

test('GpuForcePositionDelegate uses exact repulsion for small active sets', async () => {
  const network = createIsolatedTopologyNetwork([
    -20, 0, 0,
    0, 0, 0,
    20, 0, 0,
  ]);
  const { gl } = createFakeWebGL2ComputeContext();
  const exactDelegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 3,
    recenter: false,
  });
  const sampledDelegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 64,
    recenter: false,
  });

  exactDelegate.onAttach({ network, backend: 'webgl2', gl });
  sampledDelegate.onAttach({ network, backend: 'webgl2', gl });
  exactDelegate._webgl.seed = 123;
  sampledDelegate._webgl.seed = 123;

  exactDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  sampledDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });

  const exactSnapshot = await exactDelegate.snapshotNodePositions({ network, backend: 'webgl2', gl });
  const sampledSnapshot = await sampledDelegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  assert.ok(exactSnapshot instanceof Float32Array);
  assert.ok(sampledSnapshot instanceof Float32Array);
  assert.equal(exactSnapshot.length, sampledSnapshot.length);
  for (let i = 0; i < exactSnapshot.length; i += 1) {
    approx(exactSnapshot[i], sampledSnapshot[i], 1e-6);
  }
});

test('GpuForcePositionDelegate exact repulsion threshold overrides a smaller sample budget', async () => {
  const network = createIsolatedTopologyNetwork([
    -20, 0, 0,
    -10, 0, 0,
    0, 0, 0,
    10, 0, 0,
    20, 0, 0,
  ]);
  const { gl } = createFakeWebGL2ComputeContext();
  const thresholdDelegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 2,
    exactRepulsionThreshold2D: 8,
    recenter: false,
  });
  const exactDelegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 8,
    recenter: false,
  });

  thresholdDelegate.onAttach({ network, backend: 'webgl2', gl });
  exactDelegate.onAttach({ network, backend: 'webgl2', gl });
  thresholdDelegate._webgl.seed = 123;
  exactDelegate._webgl.seed = 123;

  thresholdDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  exactDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });

  const thresholdSnapshot = await thresholdDelegate.snapshotNodePositions({ network, backend: 'webgl2', gl });
  const exactSnapshot = await exactDelegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  assert.ok(thresholdSnapshot instanceof Float32Array);
  assert.ok(exactSnapshot instanceof Float32Array);
  assert.equal(thresholdSnapshot.length, exactSnapshot.length);
  for (let i = 0; i < thresholdSnapshot.length; i += 1) {
    approx(thresholdSnapshot[i], exactSnapshot[i], 5e-4);
  }
});

test('GpuForcePositionDelegate sampleChurn=0 preserves legacy sampled repulsion behavior', async () => {
  const network = createIsolatedTopologyNetwork([
    -30, 0, 0,
    -12, 7, 0,
    5, -4, 0,
    18, 9, 0,
    31, -6, 0,
    44, 3, 0,
  ]);
  const { gl } = createFakeWebGL2ComputeContext();
  const legacyDelegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 2,
    exactRepulsionThreshold2D: 1,
    kAttraction: 0,
    kGravity: 0,
    damping: 0,
    recenter: false,
  });
  const explicitZeroDelegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 2,
    sampleChurn: 0,
    exactRepulsionThreshold2D: 1,
    kAttraction: 0,
    kGravity: 0,
    damping: 0,
    recenter: false,
  });

  legacyDelegate.onAttach({ network, backend: 'webgl2', gl });
  explicitZeroDelegate.onAttach({ network, backend: 'webgl2', gl });
  legacyDelegate._webgl.seed = 123;
  explicitZeroDelegate._webgl.seed = 123;

  legacyDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  explicitZeroDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  legacyDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  explicitZeroDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });

  const legacySnapshot = await legacyDelegate.snapshotNodePositions({ network, backend: 'webgl2', gl });
  const explicitZeroSnapshot = await explicitZeroDelegate.snapshotNodePositions({ network, backend: 'webgl2', gl });

  assert.equal(legacySnapshot.length, explicitZeroSnapshot.length);
  for (let i = 0; i < legacySnapshot.length; i += 1) {
    approx(legacySnapshot[i], explicitZeroSnapshot[i], 1e-6);
  }
});

test('GpuForcePositionDelegate sampleChurn progressively refreshes repulsion samples on WebGL2', async () => {
  const network = createIsolatedTopologyNetwork([
    -30, 0, 0,
    -12, 7, 0,
    5, -4, 0,
    18, 9, 0,
    31, -6, 0,
    44, 3, 0,
  ]);
  const { gl } = createFakeWebGL2ComputeContext();
  const fixedDelegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 2,
    sampleChurn: 0,
    exactRepulsionThreshold2D: 1,
    kAttraction: 0,
    kGravity: 0,
    damping: 0,
    recenter: false,
  });
  const churnedDelegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount2D: 2,
    sampleChurn: 1,
    exactRepulsionThreshold2D: 1,
    kAttraction: 0,
    kGravity: 0,
    damping: 0,
    recenter: false,
  });

  fixedDelegate.onAttach({ network, backend: 'webgl2', gl });
  churnedDelegate.onAttach({ network, backend: 'webgl2', gl });
  fixedDelegate._webgl.seed = 123;
  churnedDelegate._webgl.seed = 123;
  fixedDelegate._resolveSampleDebugConfig = () => ({ every: 1, previewCount: 2 });
  churnedDelegate._resolveSampleDebugConfig = () => ({ every: 1, previewCount: 2 });
  const fixedDebug = [];
  const churnedDebug = [];
  fixedDelegate._emitSampleDebug = (_message, payload) => { fixedDebug.push(payload); };
  churnedDelegate._emitSampleDebug = (_message, payload) => { churnedDebug.push(payload); };

  fixedDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  churnedDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });

  fixedDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  churnedDelegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });

  assert.equal(fixedDebug.length, 2);
  assert.equal(churnedDebug.length, 2);
  assert.equal(fixedDebug[0].changedSlotCount, 0);
  assert.equal(churnedDebug[0].changedSlotCount, 0);
  assert.equal(fixedDebug[1].changedSlotCount, 0);
  assert.ok(churnedDebug[1].changedSlotCount > 0);
});

test('GpuForcePositionDelegate uses mode-specific sampleCount when explicit sampleCount is unset', () => {
  const network = createTopologyNetwork([
    0, 0, 0,
    10, 0, 0,
    20, 0, 0,
    30, 0, 0,
  ]);
  const { gl } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({
    mode: '3d',
    center: [0, 0, 0],
    outputScale: 1,
    sampleCount3D: 32,
    recenter: false,
  });
  let captured = null;
  delegate._logSamplingTrace = (payload) => {
    captured = payload;
  };

  delegate.onAttach({ network, backend: 'webgl2', gl });
  delegate.ensureSynchronized({ network, backend: 'webgl2', gl });
  delegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });

  assert.ok(captured);
  assert.equal(captured.sampleCount, 32);
});

test('GpuForcePositionDelegate derives UMAP repulsion sampling from negative sample rate', () => {
  const network = createTopologyNetwork([
    0, 0, 0,
    10, 0, 0,
    20, 0, 0,
    30, 0, 0,
  ]);
  const { gl } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    forceModel: 'umap',
    sampleCount2D: 99,
    maxNeighborsPerNode: 64,
    umapNeighborCount: 12,
    umapNegativeSampleRate: 5,
    recenter: false,
  });
  let captured = null;
  delegate._logSamplingTrace = (payload) => {
    captured = payload;
  };

  delegate.onAttach({ network, backend: 'webgl2', gl });
  delegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });

  assert.ok(captured);
  assert.equal(captured.forceModel, 'umap');
  assert.equal(captured.sampleCount, 60);
});

test('resolveUmapEpochCount matches umap-learn defaults by graph size', () => {
  assert.equal(resolveUmapEpochCount(null, 2000), 500);
  assert.equal(resolveUmapEpochCount(undefined, 20000), 200);
  assert.equal(resolveUmapEpochCount(123, 2000), 123);
});

test('GpuForcePositionDelegate uses the regular alpha decay path for UMAP cooling', () => {
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    forceModel: 'umap',
    alpha: 1,
    alphaDecay: 0.1,
    alphaTarget: 0.2,
    alphaMin: 0.001,
    recenter: false,
  });
  let captured = null;
  delegate._markDirtyForBackend = () => {};
  delegate.ensureSynchronized = () => {};
  delegate._activeCount = 8;
  delegate._nodeCapacity = 8;
  delegate._webgl = {
    sampleFrame: 12,
    step(payload) {
      captured = payload;
      this.sampleFrame += 1;
      return true;
    },
  };

  const changed = delegate.step({ deltaMs: 16 });

  assert.equal(changed, true);
  assert.ok(captured);
  assert.equal(captured.forceModel, 'umap');
  assert.equal(captured.umapEpochs, 500);
  assert.ok(Math.abs(delegate.alpha - 0.92) < 1e-9);
  assert.ok(Math.abs(captured.kRepulsion - 0.92) < 1e-9);
  assert.ok(Math.abs(captured.kAttraction - 0.92) < 1e-9);
  assert.equal(delegate.getCompletedEpochs(), 13);
});

test('GpuForcePositionDelegate does not fall back to CPU when WebGL texture compute is unavailable', () => {
  const network = createTopologyNetwork([
    0, 0, 0,
    10, 0, 0,
    20, 0, 0,
    30, 0, 0,
  ]);
  const { gl } = createFakeWebGL2Context();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    recenter: false,
  });

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(args.join(' '));
  };

  try {
    delegate.onAttach({ network, backend: 'webgl', gl });
    delegate.ensureSynchronized({ network, backend: 'webgl', gl });
    const advanced = delegate.step({ network, backend: 'webgl', gl, deltaMs: 16 });
    assert.equal(advanced, false);
    assert.equal(delegate.getGpuPositionResource({ network, backend: 'webgl', gl }), null);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /WebGL gpu-force requires float texture compute support/);
  } finally {
    console.warn = originalWarn;
  }
});

test('warmStartUmapPositionsFromTopology separates disconnected components', () => {
  const nodeCapacity = 6;
  const activeIds = new Uint32Array([0, 1, 2, 3, 4, 5]);
  const neighborStarts = new Uint32Array([0, 2, 4, 6, 8, 10]);
  const neighborCounts = new Uint32Array([2, 2, 2, 2, 2, 2]);
  const neighbors = new Uint32Array([
    1, 2,
    0, 2,
    0, 1,
    4, 5,
    3, 5,
    3, 4,
  ]);
  const neighborWeights = new Float32Array(neighbors.length);
  neighborWeights.fill(1);
  const positions = new Float32Array([
    -24, -4, 0,
    -8, 12, 0,
    9, -15, 0,
    18, 6, 0,
    -14, 18, 0,
    5, -20, 0,
  ]);

  const applied = warmStartUmapPositionsFromTopology({
    nodeCapacity,
    activeIds,
    activeCount: activeIds.length,
    neighborStarts,
    neighborCounts,
    neighbors,
    neighborWeights,
    positions,
    center: [0, 0, 0],
    radius: 120,
    mode: '2d',
    scratch: {},
  });

  assert.equal(applied, true);

  const clusters = [
    [0, 1, 2],
    [3, 4, 5],
  ];
  const centroids = clusters.map((cluster) => {
    let sumX = 0;
    let sumY = 0;
    for (const nodeId of cluster) {
      sumX += positions[nodeId * 3];
      sumY += positions[(nodeId * 3) + 1];
    }
    return {
      x: sumX / cluster.length,
      y: sumY / cluster.length,
    };
  });
  const centroidDistance = Math.hypot(
    centroids[0].x - centroids[1].x,
    centroids[0].y - centroids[1].y,
  );
  const meanRadius = clusters.reduce((total, cluster, index) => {
    let clusterRadius = 0;
    for (const nodeId of cluster) {
      clusterRadius += Math.hypot(
        positions[nodeId * 3] - centroids[index].x,
        positions[(nodeId * 3) + 1] - centroids[index].y,
      );
    }
    return total + (clusterRadius / cluster.length);
  }, 0) / clusters.length;

  assert.ok(centroidDistance > 40);
  assert.ok(centroidDistance > (meanRadius * 2));
});

test('GpuForcePositionDelegate reads edgesView after position buffer lookup during topology sync', () => {
  const positionView = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    2, 0, 0,
  ]);
  const staleEdgesView = new Uint32Array([0, 0, 0, 0]);
  const freshEdgesView = new Uint32Array([0, 1, 1, 2]);
  const network = {
    nodeCapacity: 3,
    nodeIndices: new Uint32Array([0, 1, 2]),
    edgeIndices: new Uint32Array([0, 1]),
    edgesView: staleEdgesView,
    withBufferAccess(fn) {
      return fn();
    },
    getTopologyVersions: () => ({ node: 1, edge: 1 }),
    getNodeAttributeBuffer(name) {
      if (name === '_helios_visuals_position') {
        this.edgesView = freshEdgesView;
        return { view: positionView, version: 1 };
      }
      if (name === '$index') return { version: 1 };
      return null;
    },
    getEdgeAttributeBuffer(name) {
      if (name === '$index') return { version: 1 };
      return null;
    },
  };
  const { gl } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({ mode: '2d' });

  delegate.onAttach({ network, backend: 'webgl2', gl });

  assert.deepEqual(Array.from(delegate._topologyScratch.neighborCounts.subarray(0, 3)), [1, 2, 1]);
});

test('GpuForcePositionDelegate recenters active nodes around the configured center', async () => {
  const network = createIsolatedTopologyNetwork([
    10, 5, 0,
    20, 5, 0,
    30, 5, 0,
  ]);
  const { gl } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    kRepulsion: 0,
    kAttraction: 0,
    kGravity: 0,
    damping: 0,
    recenter: true,
  });

  delegate.onAttach({ network, backend: 'webgl2', gl });
  delegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });

  const snapshot = await delegate.snapshotNodePositions({ network, backend: 'webgl2', gl });
  assert.ok(snapshot instanceof Float32Array);

  const centroidX = (snapshot[0] + snapshot[3] + snapshot[6]) / 3;
  const centroidY = (snapshot[1] + snapshot[4] + snapshot[7]) / 3;
  approx(centroidX, 0, 1e-6);
  approx(centroidY, 0, 1e-6);
});

test('GpuForcePositionDelegate tiles large WebGPU dispatches across dimensions', () => {
  const network = createTopologyNetwork([
    0, 0, 0,
    10, 0, 0,
  ]);
  const { device, dispatchCalls } = createFakeWebGPUDevice();
  const delegate = new GpuForcePositionDelegate({
    mode: '3d',
    outputScale: 1,
  });

  delegate.onAttach({ network, backend: 'webgpu', device });
  const backend = delegate._webgpu;
  assert.ok(backend);
  backend.nodeCapacity = 6_000_000;
  backend.activeCount = 1;

  const advanced = backend.step({
    mode: '3d',
    center: [0, 0, 0],
    recenter: false,
    sampleCount: 1,
    exactRepulsionThreshold: 1,
    maxNeighborsPerNode: 1,
    outputScale: 1,
    linkDistance: 1,
    kRepulsion: 0.01,
    kAttraction: 0.01,
    kGravity: 0.001,
    eta: 0.01,
    damping: 0.9,
    maxStep: 1,
    minDistance: 0.1,
    dt: 1 / 60,
  });

  assert.equal(advanced, true);
  assert.ok(dispatchCalls.length >= 1);
  assert.ok(dispatchCalls[0].x <= 65535);
  assert.ok(dispatchCalls[0].y >= 2);
});

test('GpuForcePositionDelegate uses shader-driven WebGL2 layout when float render targets are available', () => {
  const network = createTopologyNetwork([
    0, 0, 0,
    10, 0, 0,
    20, 0, 0,
  ]);
  const { gl, getDrawArraysCalls, getTexImageCalls } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    recenter: false,
  });

  delegate.onAttach({ network, backend: 'webgl2', gl });

  assert.equal(delegate._webgl?.getExecutionMode?.(), 'gpu');
  assert.ok(getTexImageCalls() > 0);

  const changed = delegate.step({ network, backend: 'webgl2', gl, deltaMs: 16 });
  assert.equal(changed, true);
  assert.ok(getDrawArraysCalls() >= 1);
});

test('GpuForcePositionDelegate uploads padded uint textures on WebGL2 topology sync', () => {
  const network = createIsolatedTopologyNetwork([
    0, 0, 0,
    10, 0, 0,
    20, 0, 0,
  ]);
  const { gl, getTexImagePayloads, getTexSubImageCalls } = createFakeWebGL2ComputeContext();
  const delegate = new GpuForcePositionDelegate({
    mode: '2d',
    center: [0, 0, 0],
    outputScale: 1,
    recenter: false,
  });

  delegate.onAttach({ network, backend: 'webgl2', gl });

  const uintUploads = getTexImagePayloads().filter((args) => (
    args[2] === gl.R32UI
    && args[7] === gl.UNSIGNED_INT
    && args[8] instanceof Uint32Array
  ));
  assert.ok(uintUploads.length >= 4);
  for (const args of uintUploads) {
    const width = args[3];
    const height = args[4];
    const pixels = args[8];
    assert.equal(pixels.length, width * height);
  }
  assert.equal(getTexSubImageCalls(), 0);
});
