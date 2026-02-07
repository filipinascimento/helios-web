import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttributeTracker, WebGPUAttributeRenderer } from '../src/rendering/AttributeTracker.js';

test('AttributeTracker defaults to 0.5 resolution scale', () => {
  const tracker = new AttributeTracker();
  assert.equal(tracker.options.resolutionScale, 0.5);
});

test('AttributeTracker preserves scale when enabling without override', () => {
  const tracker = new AttributeTracker();
  tracker.enable('index', 'index', {});
  assert.equal(tracker.options.resolutionScale, 0.5);
});

test('AttributeTracker accepts custom resolution scale', () => {
  const tracker = new AttributeTracker();
  tracker.enable('index', 'index', { resolutionScale: 2 });
  assert.equal(tracker.options.resolutionScale, 2);
});

test('AttributeTracker pick returns decoded index from mock device', async () => {
  const mockPixels = new Uint8Array([6, 0, 0, 0]); // decodes to index 5
  const device = {
    type: 'webgpu',
    readPixels: async () => mockPixels,
  };
  const tracker = new AttributeTracker({ device, size: { width: 2, height: 2, devicePixelRatio: 1 } });
  tracker.enable('index', null, { resolutionScale: 1 });
  tracker.lastTargets = { node: { width: 2, height: 2 }, edge: null };
  const result = await tracker.pick(1, 0);
  assert.equal(result.node, 5);
});

test('AttributeTracker pick decodes r32uint targets in indirect mode', async () => {
  const mockPixels = new Uint8Array([11, 0, 0, 0]); // uint32 value 11 -> index 10
  const device = {
    type: 'webgpu',
    format: 'r32uint',
    readPixels: async () => mockPixels,
  };
  const tracker = new AttributeTracker({ device, size: { width: 2, height: 2, devicePixelRatio: 1 } });
  tracker.webgpu = { targetFormat: 'r32uint' };
  tracker.enable('index', null, { resolutionScale: 1 });
  tracker.lastTargets = { node: { width: 2, height: 2 }, edge: null };
  const result = await tracker.pick(1, 0);
  assert.equal(result.node, 10);
});

test('WebGPUAttributeRenderer uses sparse encoded APIs only for indirect mode', () => {
  const calls = {
    sparseDefineNode: 0,
    sparseUpdateNode: 0,
    denseDefineNode: 0,
    denseUpdateNode: 0,
  };
  const network = {
    nodeIndices: new Uint32Array(0),
    edgeIndices: new Uint32Array(0),
    getTopologyVersions() {
      return { node: 1, edge: 1 };
    },
    defineSparseColorEncodedNodeAttribute() {
      calls.sparseDefineNode += 1;
    },
    updateSparseColorEncodedNodeAttribute() {
      calls.sparseUpdateNode += 1;
    },
    getSparseColorEncodedNodeAttributeView() {
      return { view: new Uint8Array(0), version: 1 };
    },
    defineDenseColorEncodedNodeAttribute() {
      calls.denseDefineNode += 1;
    },
    updateDenseColorEncodedNodeAttribute() {
      calls.denseUpdateNode += 1;
    },
    withBufferAccess(fn) {
      return fn();
    },
  };
  const graphLayer = {
    edgeRenderingMode: 'line',
    nodeOutlineUseAttributes: false,
    getCameraUniforms() {
      return {
        mode: '2d',
        viewProjection: new Float32Array(16),
        view: new Float32Array(16),
        position: [0, 0, 1],
        up: [0, 1, 0],
        right: [1, 0, 0],
        viewport: { width: 1, height: 1, devicePixelRatio: 1 },
      };
    },
    resolveIndirectEdgeVariant() {
      return {};
    },
    withSparseGraph(_net, _versions, _indices, _edgeSources, fn) {
      return fn({
        nodes: {
          positions: new Float32Array(0),
          sizes: new Float32Array(0),
          outlineWidths: new Float32Array(0),
          indices: new Uint32Array(0),
          versions: { positions: 1, sizes: 1, outlineWidths: 1, topology: 1 },
        },
        edges: {
          endpoints: new Uint32Array(0),
          widths: new Float32Array(0),
          endpointSizes: new Float32Array(0),
          indices: new Uint32Array(0),
          versions: { endpoints: 1, widths: 1, endpointSizes: 1, topology: 1 },
        },
        nodeEdgeSources: {},
      });
    },
  };

  const renderer = new WebGPUAttributeRenderer(graphLayer, null, null);
  renderer.device = { type: 'webgpu' };
  renderer.resize = () => {};
  renderer.renderPreparedGeometry = () => ({ node: null, edge: null });

  const result = renderer.render(
    { network, camera: {} },
    { width: 1, height: 1, devicePixelRatio: 1 },
    { nodeAttribute: '$index', edgeAttribute: null, resolutionScale: 1, trackDepth: false },
  );

  assert.ok(result);
  assert.equal(calls.sparseDefineNode > 0, true);
  assert.equal(calls.sparseUpdateNode > 0, true);
  assert.equal(calls.denseDefineNode, 0);
  assert.equal(calls.denseUpdateNode, 0);
});

test('WebGPUAttributeRenderer keeps sparse encoded APIs disabled for dense mode', () => {
  const calls = {
    sparseDefineNode: 0,
    sparseUpdateNode: 0,
    denseDefineNode: 0,
    denseUpdateNode: 0,
  };
  const network = {
    defineSparseColorEncodedNodeAttribute() {
      calls.sparseDefineNode += 1;
    },
    updateSparseColorEncodedNodeAttribute() {
      calls.sparseUpdateNode += 1;
    },
    defineDenseColorEncodedNodeAttribute() {
      calls.denseDefineNode += 1;
    },
    updateDenseColorEncodedNodeAttribute() {
      calls.denseUpdateNode += 1;
    },
  };
  const graphLayer = {
    edgeRenderingMode: 'line',
    nodeOutlineUseAttributes: false,
    getCameraUniforms() {
      return {
        mode: '2d',
        viewProjection: new Float32Array(16),
        view: new Float32Array(16),
        position: [0, 0, 1],
        up: [0, 1, 0],
        right: [1, 0, 0],
        viewport: { width: 1, height: 1, devicePixelRatio: 1 },
      };
    },
    withDenseGraph(_net, fn) {
      return fn({
        nodes: {
          positions: new Float32Array(0),
          sizes: new Float32Array(0),
          outlineWidths: new Float32Array(0),
          count: 0,
          versions: { positions: 1, sizes: 1, outlineWidths: 1, topology: 1 },
        },
        edges: {
          segments: new Float32Array(0),
          widths: new Float32Array(0),
          endpointSizes: new Float32Array(0),
          count: 0,
          versions: { segments: 1, widths: 1, endpointSizes: 1, topology: 1 },
        },
      });
    },
  };

  const renderer = new WebGPUAttributeRenderer(graphLayer, null, null);
  renderer.device = { type: 'webgpu' };
  renderer.resize = () => {};
  renderer.renderPreparedGeometry = () => ({ node: null, edge: null });
  renderer.encodeAttributes = () => ({ nodeEncoded: null, edgeEncoded: null });

  const result = renderer.render(
    { network, camera: {} },
    { width: 1, height: 1, devicePixelRatio: 1 },
    { nodeAttribute: '$index', edgeAttribute: null, resolutionScale: 1, trackDepth: false },
  );

  assert.ok(result);
  assert.equal(calls.sparseDefineNode, 0);
  assert.equal(calls.sparseUpdateNode, 0);
  assert.equal(calls.denseDefineNode > 0, true);
  assert.equal(calls.denseUpdateNode > 0, true);
});

test('WebGPUAttributeRenderer bypasses sparse encoded APIs for indirect r32uint mode', () => {
  const calls = {
    sparseDefineNode: 0,
    sparseUpdateNode: 0,
    sparseDefineEdge: 0,
    sparseUpdateEdge: 0,
    denseDefineNode: 0,
    denseUpdateNode: 0,
  };
  const network = {
    nodeIndices: new Uint32Array(0),
    edgeIndices: new Uint32Array(0),
    getTopologyVersions() {
      return { node: 1, edge: 1 };
    },
    defineSparseColorEncodedNodeAttribute() {
      calls.sparseDefineNode += 1;
    },
    updateSparseColorEncodedNodeAttribute() {
      calls.sparseUpdateNode += 1;
    },
    defineSparseColorEncodedEdgeAttribute() {
      calls.sparseDefineEdge += 1;
    },
    updateSparseColorEncodedEdgeAttribute() {
      calls.sparseUpdateEdge += 1;
    },
    defineDenseColorEncodedNodeAttribute() {
      calls.denseDefineNode += 1;
    },
    updateDenseColorEncodedNodeAttribute() {
      calls.denseUpdateNode += 1;
    },
    withBufferAccess(fn) {
      return fn();
    },
  };
  const graphLayer = {
    edgeRenderingMode: 'line',
    nodeOutlineUseAttributes: false,
    getCameraUniforms() {
      return {
        mode: '2d',
        viewProjection: new Float32Array(16),
        view: new Float32Array(16),
        position: [0, 0, 1],
        up: [0, 1, 0],
        right: [1, 0, 0],
        viewport: { width: 1, height: 1, devicePixelRatio: 1 },
      };
    },
    resolveIndirectEdgeVariant() {
      return {};
    },
    withSparseGraph(_net, _versions, _indices, _edgeSources, fn) {
      return fn({
        nodes: {
          positions: new Float32Array(0),
          sizes: new Float32Array(0),
          outlineWidths: new Float32Array(0),
          indices: new Uint32Array(0),
          versions: { positions: 1, sizes: 1, outlineWidths: 1, topology: 1 },
        },
        edges: {
          endpoints: new Uint32Array(0),
          widths: new Float32Array(0),
          endpointSizes: new Float32Array(0),
          indices: new Uint32Array(0),
          versions: { endpoints: 1, widths: 1, endpointSizes: 1, topology: 1 },
        },
        nodeEdgeSources: {},
      });
    },
  };

  const renderer = new WebGPUAttributeRenderer(graphLayer, null, null);
  renderer.device = { type: 'webgpu' };
  renderer.targetFormat = 'r32uint';
  renderer.resize = () => {};
  renderer.renderPreparedGeometry = () => ({ node: null, edge: null });

  const result = renderer.render(
    { network, camera: {} },
    { width: 1, height: 1, devicePixelRatio: 1 },
    { nodeAttribute: '$index', edgeAttribute: '$index', resolutionScale: 1, trackDepth: false },
  );

  assert.ok(result);
  assert.equal(calls.sparseDefineNode, 0);
  assert.equal(calls.sparseUpdateNode, 0);
  assert.equal(calls.sparseDefineEdge, 0);
  assert.equal(calls.sparseUpdateEdge, 0);
  assert.equal(calls.denseDefineNode, 0);
  assert.equal(calls.denseUpdateNode, 0);
});
