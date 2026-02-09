import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Helios } from '../src/index.js';
import { WebGPUAttributeRenderer } from '../src/rendering/AttributeTracker.js';

test('Helios.prewarm skips dense buffer updates for indirect WebGPU backend', async () => {
  let denseUpdates = 0;
  const helios = Object.create(Helios.prototype);
  helios.options = { webgpuBackend: 'indirect', renderer: 'webgpu' };
  helios.prewarmPromise = null;
  helios.mappersDirty = false;
  helios.debug = { log: () => {} };
  helios.visuals = {
    applyMappers: () => {},
    updateDenseBuffers: () => { denseUpdates += 1; },
  };
  helios.scheduler = { requestGeometry: () => {} };

  await helios.prewarm();
  assert.equal(denseUpdates, 0);
});

test('Helios.prewarm skips dense buffer updates for indirect WebGL backend', async () => {
  let denseUpdates = 0;
  const helios = Object.create(Helios.prototype);
  helios.options = { webglBackend: 'indirect', renderer: 'webgl' };
  helios.prewarmPromise = null;
  helios.mappersDirty = false;
  helios.debug = { log: () => {} };
  helios.visuals = {
    applyMappers: () => {},
    updateDenseBuffers: () => { denseUpdates += 1; },
  };
  helios.scheduler = { requestGeometry: () => {} };

  await helios.prewarm();
  assert.equal(denseUpdates, 0);
});

test('Helios.prewarm keeps dense update behavior for non-indirect backends', async () => {
  let denseUpdates = 0;
  const helios = Object.create(Helios.prototype);
  helios.options = { webgpuBackend: 'dense', renderer: 'webgpu' };
  helios.prewarmPromise = null;
  helios.mappersDirty = false;
  helios.debug = { log: () => {} };
  helios.visuals = {
    applyMappers: () => {},
    updateDenseBuffers: () => { denseUpdates += 1; },
  };
  helios.scheduler = { requestGeometry: () => {} };

  await helios.prewarm();
  assert.equal(denseUpdates, 1);
});

test('Helios.prewarm keeps dense update behavior for explicit dense WebGL backend', async () => {
  let denseUpdates = 0;
  const helios = Object.create(Helios.prototype);
  helios.options = { webglBackend: 'dense', renderer: 'webgl' };
  helios.prewarmPromise = null;
  helios.mappersDirty = false;
  helios.debug = { log: () => {} };
  helios.visuals = {
    applyMappers: () => {},
    updateDenseBuffers: () => { denseUpdates += 1; },
  };
  helios.scheduler = { requestGeometry: () => {} };

  await helios.prewarm();
  assert.equal(denseUpdates, 1);
});

test('Helios.prewarm keeps dense update behavior for default WebGL backend', async () => {
  let denseUpdates = 0;
  const helios = Object.create(Helios.prototype);
  helios.options = { renderer: 'webgl' };
  helios.prewarmPromise = null;
  helios.mappersDirty = false;
  helios.debug = { log: () => {} };
  helios.visuals = {
    applyMappers: () => {},
    updateDenseBuffers: () => { denseUpdates += 1; },
  };
  helios.scheduler = { requestGeometry: () => {} };

  await helios.prewarm();
  assert.equal(denseUpdates, 1);
});

test('Helios.prewarm keeps dense update behavior for default WebGPU backend', async () => {
  let denseUpdates = 0;
  const helios = Object.create(Helios.prototype);
  helios.options = { renderer: 'webgpu' };
  helios.prewarmPromise = null;
  helios.mappersDirty = false;
  helios.debug = { log: () => {} };
  helios.visuals = {
    applyMappers: () => {},
    updateDenseBuffers: () => { denseUpdates += 1; },
  };
  helios.scheduler = { requestGeometry: () => {} };

  await helios.prewarm();
  assert.equal(denseUpdates, 1);
});

test('WebGPUAttributeRenderer packs indirect tracking data from sparse buffers', () => {
  const renderer = new WebGPUAttributeRenderer({}, null, null);
  const sparse = {
    nodes: {
      positions: new Float32Array([
        0, 0, 0,
        10, 0, 0,
        20, 0, 0,
      ]),
      sizes: new Float32Array([1, 5, 9]),
      outlineWidths: new Float32Array([0.1, 0.2, 0.3]),
      indices: new Uint32Array([2, 0]),
      versions: {
        positions: 11,
        sizes: 12,
        outlineWidths: 13,
        topology: 14,
      },
    },
    edges: {
      endpoints: new Uint32Array([0, 1, 1, 2]),
      widths: new Float32Array([1, 2, 3, 4]),
      endpointSizes: new Float32Array([5, 6, 7, 8]),
      indices: new Uint32Array([1]),
      versions: {
        endpoints: 21,
        widths: 22,
        endpointSizes: 23,
        topology: 24,
      },
    },
    nodeEdgeSources: {
      width: { view: new Float32Array([2, 6, 10]), version: 31 },
      endpointSize: null,
    },
  };

  let denseTouched = false;
  const network = {
    getNodeAttributeBuffer(name) {
      if (name === 'rank') {
        return { view: new Float32Array([100, 200, 300]), version: 41 };
      }
      return null;
    },
    getEdgeAttributeBuffer(name) {
      if (name === 'score') {
        return { view: new Float32Array([7, 8]), version: 42 };
      }
      return null;
    },
    updateDenseNodeAttributeBuffer() { denseTouched = true; },
    updateDenseEdgeAttributeBuffer() { denseTouched = true; },
    updateDenseNodeIndexBuffer() { denseTouched = true; },
    updateDenseEdgeIndexBuffer() { denseTouched = true; },
  };

  const prepared = renderer.buildIndirectPreparedGeometry(network, sparse, {
    nodeAttribute: '$index',
    edgeAttribute: '$index',
  }, {
    useQuads: true,
    nodeSizeUniform: false,
    nodeOutlineUniform: false,
    edgeWidthUniform: false,
    edgeEndpointSizeUniform: false,
    edgeVariant: {
      widthSource: 'node',
      widthEndpoints: 'source',
      endpointSizeSource: 'edge',
      endpointSizeEndpoints: 'both',
    },
  });

  assert.equal(denseTouched, false);
  assert.deepEqual(Array.from(prepared.geometry.nodes.positions), [20, 0, 0, 0, 0, 0]);
  assert.deepEqual(Array.from(prepared.geometry.nodes.sizes), [9, 1]);
  assert.deepEqual(Array.from(prepared.geometry.edges.segments), [10, 0, 0, 20, 0, 0]);
  assert.deepEqual(Array.from(prepared.geometry.edges.widths), [6, 6]);
  assert.deepEqual(Array.from(prepared.geometry.edges.endpointSizes), [7, 8]);
  assert.deepEqual(Array.from(prepared.encoded.nodeEncoded.view), [3, 0, 0, 0, 1, 0, 0, 0]);
  assert.deepEqual(Array.from(prepared.encoded.edgeEncoded.view), [2, 0, 0, 0]);
  assert.equal(prepared.shared.nodePositions, null);
  assert.equal(prepared.shared.nodeSizes, null);
  assert.equal(prepared.shared.nodeOutlineWidths, null);
  assert.equal(prepared.shared.edgeWidths, null);
  assert.equal(prepared.shared.edgeEndpointSizes, null);
});

test('WebGPUAttributeRenderer exposes shared candidates for identity indirect sparse views', () => {
  const renderer = new WebGPUAttributeRenderer({}, null, null);
  const nodePositions = new Float32Array([
    0, 0, 0,
    10, 0, 0,
  ]);
  const nodeSizes = new Float32Array([1, 2]);
  const nodeOutlineWidths = new Float32Array([0.1, 0.2]);
  const edgeEndpoints = new Uint32Array([0, 1]);
  const edgeWidths = new Float32Array([3, 4]);
  const edgeEndpointSizes = new Float32Array([5, 6]);
  const sparse = {
    nodes: {
      positions: nodePositions,
      sizes: nodeSizes,
      outlineWidths: nodeOutlineWidths,
      indices: new Uint32Array([0, 1]),
      versions: {
        positions: 101,
        sizes: 102,
        outlineWidths: 103,
        topology: 104,
      },
    },
    edges: {
      endpoints: edgeEndpoints,
      widths: edgeWidths,
      endpointSizes: edgeEndpointSizes,
      indices: new Uint32Array([0]),
      versions: {
        endpoints: 201,
        widths: 202,
        endpointSizes: 203,
        topology: 204,
      },
    },
    nodeEdgeSources: {},
  };

  const prepared = renderer.buildIndirectPreparedGeometry({}, sparse, {
    nodeAttribute: '$index',
    edgeAttribute: '$index',
  }, {
    useQuads: true,
    nodeSizeUniform: false,
    nodeOutlineUniform: false,
    edgeWidthUniform: false,
    edgeEndpointSizeUniform: false,
    edgeVariant: {
      widthSource: 'edge',
      endpointSizeSource: 'edge',
    },
  });

  assert.strictEqual(prepared.geometry.nodes.positions, nodePositions);
  assert.strictEqual(prepared.geometry.nodes.sizes, nodeSizes);
  assert.strictEqual(prepared.geometry.nodes.outlineWidths, nodeOutlineWidths);
  assert.strictEqual(prepared.geometry.edges.widths, edgeWidths);
  assert.strictEqual(prepared.geometry.edges.endpointSizes, edgeEndpointSizes);
  assert.deepEqual(prepared.shared.nodePositions, {
    key: 'indirect:node:positions',
    version: 101,
    topologyVersion: 104,
    count: 2,
    byteLength: nodePositions.byteLength,
  });
  assert.deepEqual(prepared.shared.nodeSizes, {
    key: 'indirect:node:sizes',
    version: 102,
    topologyVersion: 104,
    count: 2,
    byteLength: nodeSizes.byteLength,
  });
  assert.deepEqual(prepared.shared.nodeOutlineWidths, {
    key: 'indirect:node:outlineWidths',
    version: 103,
    topologyVersion: 104,
    count: 2,
    byteLength: nodeOutlineWidths.byteLength,
  });
  assert.deepEqual(prepared.shared.edgeWidths, {
    key: 'indirect:edge:widths',
    version: 202,
    topologyVersion: 204,
    count: 1,
    byteLength: edgeWidths.byteLength,
  });
  assert.deepEqual(prepared.shared.edgeEndpointSizes, {
    key: 'indirect:edge:endpointSizes',
    version: 203,
    topologyVersion: 204,
    count: 1,
    byteLength: edgeEndpointSizes.byteLength,
  });
});

test('WebGPUAttributeRenderer resolves shared buffers only when metadata matches', () => {
  const renderer = new WebGPUAttributeRenderer({}, null, null);
  const sharedBuffer = { id: 'shared' };
  let fallbackCalls = 0;
  const fallback = () => {
    fallbackCalls += 1;
    return { id: `fallback-${fallbackCalls}` };
  };

  const sharedResources = {
    buffers: {
      'indirect:node:positions': {
        buffer: sharedBuffer,
        version: 3,
        topologyVersion: 5,
        count: 7,
        byteLength: 84,
      },
    },
  };

  const reused = renderer.resolveSharedWebGPUBuffer(sharedResources, {
    key: 'indirect:node:positions',
    version: 3,
    topologyVersion: 5,
    count: 7,
    byteLength: 84,
  }, fallback);
  assert.strictEqual(reused, sharedBuffer);
  assert.equal(fallbackCalls, 0);

  const uploaded = renderer.resolveSharedWebGPUBuffer(sharedResources, {
    key: 'indirect:node:positions',
    version: 4,
    topologyVersion: 5,
    count: 7,
    byteLength: 84,
  }, fallback);
  assert.deepEqual(uploaded, { id: 'fallback-1' });
  assert.equal(fallbackCalls, 1);
});
