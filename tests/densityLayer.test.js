import test from 'node:test';
import assert from 'node:assert/strict';
import { DensityLayer } from '../src/rendering/engine/DensityLayer.js';

function approxEqual(actual, expected, epsilon = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i += 1) {
    assert.ok(
      Math.abs(actual[i] - expected[i]) <= epsilon,
      `index ${i}: expected ${expected[i]}, received ${actual[i]}`,
    );
  }
}

function makeNetwork({
  nodeCount = 0,
  nodeIndices = null,
  edgeIndices = null,
  edgesView = null,
  attributes = {},
  edgeVersion = 1,
} = {}) {
  return {
    nodeCount,
    nodeIndices: nodeIndices ?? new Uint32Array(Array.from({ length: nodeCount }, (_, i) => i)),
    edgeIndices: edgeIndices ?? new Uint32Array(0),
    edgesView: edgesView ?? new Uint32Array(0),
    getTopologyVersions: () => ({ edge: edgeVersion }),
    getNodeAttributeBuffer(name) {
      const entry = attributes[name];
      if (!entry) throw new Error(`Unknown attribute: ${name}`);
      return entry;
    },
  };
}

const BASE_CONFIG = Object.freeze({
  property: 'Uniform',
  compareProperty: 'None',
  normalizeVs: false,
  colormap: 'interpolateOrRd',
  divergingColormap: 'interpolatePrinsenvlag',
});

test('DensityLayer.computeWeights normalizes uniform density as sequential', () => {
  const layer = new DensityLayer();
  const network = makeNetwork({ nodeCount: 3 });

  const computed = layer.computeWeights(network, BASE_CONFIG);
  assert.ok(computed);
  assert.equal(computed.count, 3);
  assert.equal(computed.diverging, false);
  assert.equal(computed.colormapKey, 'interpolateOrRd');
  approxEqual(computed.weights, [1 / 3, 1 / 3, 1 / 3]);
});

test('DensityLayer.computeWeights supports active-index subsets', () => {
  const layer = new DensityLayer();
  const network = makeNetwork({
    nodeCount: 3,
    nodeIndices: new Uint32Array([2, 0]),
    attributes: {
      score: { view: new Float32Array([10, 20, 30]), dimension: 1 },
    },
  });

  const computed = layer.computeWeights(network, {
    ...BASE_CONFIG,
    property: 'score',
  });

  assert.ok(computed);
  assert.equal(computed.count, 2);
  approxEqual(computed.weights, [0.75, 0.25]);
});

test('DensityLayer.computeWeights supports comparison mode and diverging normalization', () => {
  const layer = new DensityLayer();
  const network = makeNetwork({
    nodeCount: 3,
    attributes: {
      a: { view: new Float32Array([0, 1, 2]), dimension: 1 },
      b: { view: new Float32Array([2, 1, 0]), dimension: 1 },
    },
  });

  const computed = layer.computeWeights(network, {
    ...BASE_CONFIG,
    property: 'a',
    compareProperty: 'b',
  });

  assert.ok(computed);
  assert.equal(computed.diverging, true);
  assert.equal(computed.colormapKey, 'interpolatePrinsenvlag');
  approxEqual(computed.weights, [1, 0, -1]);
});

test('DensityLayer.computeWeights honors normalizeVs for unbalanced comparison', () => {
  const layer = new DensityLayer();
  const network = makeNetwork({
    nodeCount: 3,
    attributes: {
      primary: { view: new Float32Array([0, 1, 10]), dimension: 1 },
      compare: { view: new Float32Array([1, 1, 1]), dimension: 1 },
    },
  });

  const regular = layer.computeWeights(network, {
    ...BASE_CONFIG,
    property: 'primary',
    compareProperty: 'compare',
    normalizeVs: false,
  });
  const regularWeights = Array.from(regular?.weights ?? []);
  const normalized = layer.computeWeights(network, {
    ...BASE_CONFIG,
    property: 'primary',
    compareProperty: 'compare',
    normalizeVs: true,
  });
  const normalizedWeights = Array.from(normalized?.weights ?? []);

  assert.ok(regular);
  assert.ok(normalized);
  approxEqual(regularWeights, [1 / 9, 0, -1]);
  approxEqual(normalizedWeights, [1, 0, -1]);
});

test('DensityLayer.computeWeights supports Degree property from edge buffers', () => {
  const layer = new DensityLayer();
  const network = makeNetwork({
    nodeCount: 3,
    edgeIndices: new Uint32Array([0, 1]),
    edgesView: new Uint32Array([
      0, 1,
      1, 2,
    ]),
  });

  const computed = layer.computeWeights(network, {
    ...BASE_CONFIG,
    property: 'Degree',
  });

  assert.ok(computed);
  approxEqual(computed.weights, [0.25, 0.5, 0.25]);
});

test('DensityLayer resolves shared WebGL delegate positions even when CPU versions differ', () => {
  const sharedTexture = { label: 'delegate-texture' };
  const graphLayer = {
    positionDelegate: { id: 'delegate' },
    getSharedSparseResources: () => ({
      textures: { nodePositions: sharedTexture },
      textureMeta: {
        nodePositions: { version: 999, count: 6 },
      },
    }),
  };
  const layer = new DensityLayer({
    getGraphLayer: () => graphLayer,
    getNodePositionInfo: () => ({
      view: new Float32Array(18),
      version: 7,
      count: 6,
    }),
  });
  layer.device = {
    gl: {
      MAX_TEXTURE_SIZE: 0x0D33,
      getParameter: () => 4096,
    },
  };

  const resolved = layer.resolveWebGLPositionTexture({ network: {} }, { positionCount: 6 });
  assert.equal(resolved?.texture, sharedTexture);
  assert.equal(resolved?.positionCount, 6);
});

test('DensityLayer resolves shared WebGPU delegate positions even when CPU versions differ', () => {
  const previous = globalThis.GPUBufferUsage;
  globalThis.GPUBufferUsage = globalThis.GPUBufferUsage ?? {
    STORAGE: 1,
    COPY_DST: 2,
    VERTEX: 4,
  };
  try {
    const sharedIndexBuffer = { label: 'indices' };
    const sharedPositionBuffer = { label: 'positions' };
    const graphLayer = {
      positionDelegate: { id: 'delegate' },
      getSharedSparseResources: () => ({
        buffers: {
          'indirect:node:indices': { buffer: sharedIndexBuffer, count: 3 },
          'indirect:node:positions': { buffer: sharedPositionBuffer, count: 6, version: 999 },
        },
      }),
    };
    const layer = new DensityLayer({
      getGraphLayer: () => graphLayer,
      getNodePositionInfo: () => ({
        view: new Float32Array(18),
        version: 7,
        count: 6,
      }),
    });
    const computed = {
      count: 3,
      nodeIndices: new Uint32Array([0, 1, 2]),
      positionCount: 6,
    };

    const resolved = layer.resolveWebGPUPositionAndIndexBuffers({ network: {} }, computed);
    assert.equal(resolved?.indexBuffer, sharedIndexBuffer);
    assert.equal(resolved?.positionBuffer, sharedPositionBuffer);
    assert.equal(computed.positionCount, 6);
  } finally {
    globalThis.GPUBufferUsage = previous;
  }
});

test('DensityLayer.computeWeights uses guarded WASM active-node writer when available', () => {
  let heapOffset = 4;
  const heap = new Uint32Array(1024);
  const module = {
    HEAPU32: heap,
    _malloc(bytes) {
      const ptr = heapOffset;
      heapOffset += bytes;
      return ptr;
    },
    _free() {},
  };
  let inBufferAccess = false;
  const network = {
    module,
    nodeCount: 3,
    edgeCount: 0,
    edgesView: new Uint32Array(0),
    getTopologyVersions: () => ({ edge: 0 }),
    withBufferAccess(fn) {
      inBufferAccess = true;
      try {
        return fn();
      } finally {
        inBufferAccess = false;
      }
    },
    writeActiveNodes(target) {
      assert.equal(inBufferAccess, true);
      target[0] = 2;
      target[1] = 0;
      return 2;
    },
    get nodeIndices() {
      if (inBufferAccess) {
        throw new Error('nodeIndices getter should not run during buffer access');
      }
      return new Uint32Array([0, 1, 2]);
    },
    getNodeAttributeBuffer(name) {
      if (name === 'score') return { view: new Float32Array([10, 20, 30]), dimension: 1 };
      throw new Error(`Unknown attribute: ${name}`);
    },
  };
  const layer = new DensityLayer({
    withBufferAccess: (fn) => network.withBufferAccess(fn),
  });

  const computed = layer.computeWeights(network, {
    ...BASE_CONFIG,
    property: 'score',
  });
  assert.ok(computed);
  assert.equal(computed.count, 2);
  approxEqual(computed.nodeIndices, [2, 0]);
  approxEqual(computed.weights, [0.75, 0.25]);
});

test('DensityLayer.computeWeights keeps filtered proxy indices instead of base writeActiveNodes', () => {
  const filteredNetwork = {
    __heliosBaseNetwork: {},
    nodeCount: 2,
    edgeCount: 0,
    nodeIndices: new Uint32Array([1]),
    edgeIndices: new Uint32Array(0),
    withBufferAccess(fn) {
      return fn();
    },
    writeActiveNodes() {
      throw new Error('writeActiveNodes should not be used for filtered proxies');
    },
    getNodeAttributeBuffer(name) {
      if (name === 'score') return { view: new Float32Array([5, 10]), dimension: 1 };
      throw new Error(`Unknown attribute: ${name}`);
    },
    getTopologyVersions: () => ({ edge: 0 }),
    edgesView: new Uint32Array(0),
  };
  const layer = new DensityLayer({
    withBufferAccess: (fn) => filteredNetwork.withBufferAccess(fn),
  });

  const computed = layer.computeWeights(filteredNetwork, {
    ...BASE_CONFIG,
    property: 'score',
  });
  assert.ok(computed);
  assert.equal(computed.count, 1);
  approxEqual(computed.nodeIndices, [1]);
  approxEqual(computed.weights, [1]);
});
