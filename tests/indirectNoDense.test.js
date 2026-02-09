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
});
