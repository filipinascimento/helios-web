import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AttributeTracker,
  WebGLAttributeRenderer,
  WebGPUAttributeRenderer,
} from '../src/rendering/AttributeTracker.js';

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
    resolveEdgeVariant() {
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
});

test('WebGPUAttributeRenderer bypasses sparse encoded APIs for indirect r32uint mode', () => {
  const calls = {
    sparseDefineNode: 0,
    sparseUpdateNode: 0,
    sparseDefineEdge: 0,
    sparseUpdateEdge: 0,
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
    resolveEdgeVariant() {
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
});

test('WebGPUAttributeRenderer bypasses sparse encoded APIs for indirect rgba8 direct path', () => {
  const calls = {
    sparseDefineNode: 0,
    sparseUpdateNode: 0,
    sparseDefineEdge: 0,
    sparseUpdateEdge: 0,
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
    resolveEdgeVariant() {
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
  renderer.device = { type: 'webgpu', device: {} };
  renderer.targetFormat = 'rgba8unorm';
  renderer.nodeIndirectBindGroupLayout = {};
  renderer.edgeIndirectBindGroupLayout = {};
  renderer.resize = () => {};
  renderer.renderIndirectSparseGeometry = () => ({ node: null, edge: null });

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
});

test('WebGLAttributeRenderer does not eagerly update sparse encoded APIs', () => {
  const calls = {
    sparseDefineNode: 0,
    sparseUpdateNode: 0,
    sparseDefineEdge: 0,
    sparseUpdateEdge: 0,
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
  };
  const graphLayer = {
    getCameraUniforms() {
      return {
        mode: '2d',
        viewProjection: new Float32Array(16),
      };
    },
    withSparseGraph() {
      return { node: null, edge: null };
    },
  };

  const renderer = new WebGLAttributeRenderer(graphLayer, null, null);
  renderer.gl = {};
  renderer.resize = () => {};

  const result = renderer.render(
    { network, camera: {} },
    { width: 1, height: 1, devicePixelRatio: 1 },
    { nodeAttribute: 'rank', edgeAttribute: 'weight', resolutionScale: 1, trackDepth: false },
  );

  assert.ok(result);
  assert.equal(calls.sparseDefineNode, 0);
  assert.equal(calls.sparseUpdateNode, 0);
  assert.equal(calls.sparseDefineEdge, 0);
  assert.equal(calls.sparseUpdateEdge, 0);
});

test('WebGLAttributeRenderer does not eagerly touch sparse encoded readiness across frames', () => {
  const calls = {
    sparseDefineNode: 0,
    sparseUpdateNode: 0,
    sparseDefineEdge: 0,
    sparseUpdateEdge: 0,
  };
  const network = {
    nodeIndices: new Uint32Array(0),
    edgeIndices: new Uint32Array(0),
    getTopologyVersions() {
      return { node: 7, edge: 11 };
    },
    getNodeAttributeVersion() {
      return 23;
    },
    getEdgeAttributeVersion() {
      return 29;
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
    defineSparseColorEncodedEdgeAttribute() {
      calls.sparseDefineEdge += 1;
    },
    updateSparseColorEncodedEdgeAttribute() {
      calls.sparseUpdateEdge += 1;
    },
    getSparseColorEncodedEdgeAttributeView() {
      return { view: new Uint8Array(0), version: 1 };
    },
  };
  const graphLayer = {
    getCameraUniforms() {
      return {
        mode: '2d',
        viewProjection: new Float32Array(16),
      };
    },
    withSparseGraph() {
      return { node: null, edge: null };
    },
  };

  const renderer = new WebGLAttributeRenderer(graphLayer, null, null);
  renderer.gl = {};
  renderer.resize = () => {};

  const config = {
    nodeAttribute: 'rank',
    edgeAttribute: 'weight',
    resolutionScale: 1,
    trackDepth: false,
  };
  renderer.render({ network, camera: {} }, { width: 1, height: 1, devicePixelRatio: 1 }, config);
  renderer.render({ network, camera: {} }, { width: 1, height: 1, devicePixelRatio: 1 }, config);

  assert.equal(calls.sparseDefineNode, 0);
  assert.equal(calls.sparseUpdateNode, 0);
  assert.equal(calls.sparseDefineEdge, 0);
  assert.equal(calls.sparseUpdateEdge, 0);
});

test('WebGLAttributeRenderer resolves integer tracked attributes for shader-side packing', () => {
  const renderer = new WebGLAttributeRenderer({ }, null, null);
  const network = {
    getNodeAttributeBuffer(name) {
      if (name === 'rank') return { view: new Int32Array([3, 7]), dimension: 1, version: 5 };
      if (name === 'weight') return { view: new Uint32Array([11, 13]), dimension: 1, version: 9 };
      if (name === 'score') return { view: new Float32Array([1.5, 2.5]), dimension: 1, version: 12 };
      return null;
    },
  };

  const nodeSigned = renderer.resolveTrackedAttributeDescriptor(network, 'node', 'rank');
  const nodeUnsigned = renderer.resolveTrackedAttributeDescriptor(network, 'node', 'weight');
  const nodeFloat = renderer.resolveTrackedAttributeDescriptor(network, 'node', 'score');
  const index = renderer.resolveTrackedAttributeDescriptor(network, 'node', '$index');

  assert.equal(nodeSigned?.mode, 3);
  assert.equal(nodeUnsigned?.mode, 4);
  assert.equal(nodeFloat, null);
  assert.equal(index, null);
});

test('WebGLAttributeRenderer uses quad geometry for edge tracking in quad mode', () => {
  const drawModes = [];
  const gl = {
    TEXTURE0: 0,
    TEXTURE_2D: 3553,
    POINTS: 0,
    LINES: 1,
    TRIANGLE_STRIP: 5,
    FRAMEBUFFER: 36160,
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    BLEND: 3042,
    DEPTH_TEST: 2929,
    LEQUAL: 515,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    RGBA8UI: 36220,
    RGBA_INTEGER: 36249,
    UNSIGNED_BYTE: 5121,
    RG32UI: 33338,
    RG_INTEGER: 33320,
    UNSIGNED_INT: 5125,
    R32F: 33326,
    RED: 6403,
    RG32F: 33328,
    RG: 33319,
    ARRAY_BUFFER: 34962,
    DYNAMIC_DRAW: 35048,
    activeTexture() {},
    bindTexture() {},
    texParameteri() {},
    texImage2D() {},
    pixelStorei() {},
    useProgram() {},
    uniformMatrix4fv() {},
    uniform1i() {},
    uniform1f() {},
    uniform2f() {},
    uniform3f() {},
    bindVertexArray() {},
    drawArraysInstanced(mode) { drawModes.push(mode); },
    disable() {},
    enable() {},
    depthMask() {},
    depthFunc() {},
    blendFunc() {},
    bindFramebuffer() {},
    viewport() {},
    clearColor() {},
    clear() {},
    bindBuffer() {},
    bufferData() {},
    getParameter() { return 16384; },
  };

  const graphLayer = {
    edgeRenderingMode: 'quad',
    nodeOutlineUseAttributes: false,
    nodeSizeBase: 0,
    nodeSizeScale: 1,
    edgeWidthBase: 0,
    edgeWidthScale: 1,
    edgeEndpointTrim: 0.8,
    getCameraUniforms() {
      return {
        mode: '2d',
        viewProjection: new Float32Array(16),
      };
    },
    resolveEdgeVariant() {
      return {
        widthBuffer: true,
        widthSource: 'edge',
        widthEndpoints: 'both',
        endpointSizeBuffer: true,
        endpointSizeSource: 'edge',
        endpointSizeEndpoints: 'both',
      };
    },
    withSparseGraph(_network, _versions, _indices, _edgeSources, fn) {
      return fn({
        nodes: {
          positions: new Float32Array(0),
          sizes: new Float32Array(0),
          indices: new Uint32Array(0),
          versions: { positions: 1, sizes: 1, indices: 1 },
        },
        edges: {
          endpoints: new Uint32Array([0, 1]),
          widths: new Float32Array([2, 2]),
          endpointSizes: new Float32Array([1, 1]),
          indices: new Uint32Array([0]),
          versions: { endpoints: 1, widths: 1, endpointSizes: 1, indices: 1 },
        },
        nodeEdgeSources: {},
      });
    },
  };

  const renderer = new WebGLAttributeRenderer(graphLayer, null, {
    run(passes) {
      for (const pass of passes) pass();
    },
  });
  renderer.gl = gl;
  renderer.device = { type: 'webgl2' };
  renderer.resize = function resizeMock() {
    this.size = { width: 1, height: 1 };
    this.targets = { node: { handle: null }, edge: { handle: null } };
    this.depthTargets = { node: null, edge: null };
  };
  renderer.programs = {
    node: {},
    nodeOcclusion: {},
    nodeDepth: {},
    edge: {},
    edgeDepth: {},
    edgeQuad: {},
    edgeQuadDepth: {},
  };
  const nodeUniforms = {
    u_viewProjection: 0,
    u_nodePositions: 0,
    u_nodeSizes: 0,
    u_nodeEncoded: 0,
    u_useNodeIdBuffer: 0,
    u_useNodeSize: 0,
    u_useEncodedTexture: 0,
    u_nodeSizeBase: 0,
    u_nodeSizeScale: 0,
  };
  const edgeUniforms = {
    u_viewProjection: 0,
    u_viewport: 0,
    u_nodePositions: 0,
    u_edgeEndpoints: 0,
    u_edgeEncoded: 0,
    u_edgeWidths: 0,
    u_edgeEndpointSizes: 0,
    u_nodeWidthSource: 0,
    u_nodeEndpointSizeSource: 0,
    u_useEdgeIdBuffer: 0,
    u_useEncodedTexture: 0,
    u_edgeWidthSource: 0,
    u_edgeWidthEndpoints: 0,
    u_edgeEndpointSizeSource: 0,
    u_edgeEndpointSizeEndpoints: 0,
    u_hasEdgeWidths: 0,
    u_hasEdgeEndpointSizes: 0,
    u_hasNodeWidthSource: 0,
    u_hasNodeEndpointSizeSource: 0,
    u_defaultEdgeWidth: 0,
    u_defaultEdgeEndpointSize: 0,
    u_edgeWidthBase: 0,
    u_edgeWidthScale: 0,
    u_nodeSizeBase: 0,
    u_nodeSizeScale: 0,
    u_edgeEndpointTrim: 0,
  };
  renderer.uniforms = {
    node: nodeUniforms,
    nodeOcclusion: nodeUniforms,
    nodeDepth: nodeUniforms,
    edge: edgeUniforms,
    edgeDepth: edgeUniforms,
    edgeQuad: edgeUniforms,
    edgeQuadDepth: edgeUniforms,
  };
  renderer.nodeVao = {};
  renderer.edgeVao = {};
  renderer.edgeQuadVao = {};
  renderer.nodeIdBuffer = {};
  renderer.edgeIdBuffer = {};
  renderer.textures = {
    nodePositions: {},
    nodeSizes: {},
    nodeEncoded: {},
    edgeEndpoints: {},
    edgeWidths: {},
    edgeEndpointSizes: {},
    nodeWidthSource: {},
    nodeEndpointSizeSource: {},
    edgeEncoded: {},
  };

  const network = {
    nodeIndices: new Uint32Array(0),
    edgeIndices: new Uint32Array([0]),
    getTopologyVersions() {
      return { node: 1, edge: 1 };
    },
  };

  const result = renderer.render(
    { network, camera: {} },
    { width: 1, height: 1, devicePixelRatio: 1 },
    { nodeAttribute: null, edgeAttribute: '$index', resolutionScale: 1, trackDepth: false },
  );

  assert.ok(result);
  assert.equal(drawModes.includes(gl.TRIANGLE_STRIP), true);
  assert.equal(drawModes.includes(gl.LINES), false);
});

test('WebGLAttributeRenderer reuses shared sparse graph textures when metadata matches', () => {
  const gl = {
    TEXTURE0: 0,
    TEXTURE_2D: 3553,
    POINTS: 0,
    LINES: 1,
    TRIANGLE_STRIP: 5,
    FRAMEBUFFER: 36160,
    COLOR_BUFFER_BIT: 16384,
    DEPTH_BUFFER_BIT: 256,
    BLEND: 3042,
    DEPTH_TEST: 2929,
    LEQUAL: 515,
    SRC_ALPHA: 770,
    ONE_MINUS_SRC_ALPHA: 771,
    ARRAY_BUFFER: 34962,
    DYNAMIC_DRAW: 35048,
    useProgram() {},
    uniformMatrix4fv() {},
    uniform1i() {},
    uniform1f() {},
    uniform2f() {},
    uniform3f() {},
    bindVertexArray() {},
    drawArraysInstanced() {},
    disable() {},
    enable() {},
    depthMask() {},
    depthFunc() {},
    blendFunc() {},
    bindFramebuffer() {},
    viewport() {},
    clearColor() {},
    clear() {},
    bindBuffer() {},
    bufferData() {},
  };

  const nodePositions = new Float32Array([
    0, 0, 0,
    1, 1, 1,
  ]);
  const nodeSizes = new Float32Array([2, 3]);
  const nodeOutlineWidths = new Float32Array([0.1, 0.2]);
  const nodeWidthSource = new Float32Array([2, 3]);
  const nodeEndpointSizeSource = new Float32Array([4, 5]);
  const edgeEndpoints = new Uint32Array([0, 1]);
  const edgeWidths = new Float32Array([1.5, 2.5]);
  const edgeEndpointSizes = new Float32Array([0.4, 0.6]);

  const shared = {
    nodePositions: { id: 'shared-nodePositions' },
    nodeSizes: { id: 'shared-nodeSizes' },
    nodeOutlineWidths: { id: 'shared-nodeOutlineWidths' },
    nodeWidthSource: { id: 'shared-nodeWidthSource' },
    nodeEndpointSizeSource: { id: 'shared-nodeEndpointSizeSource' },
    edgeEndpoints: { id: 'shared-edgeEndpoints' },
    edgeWidths: { id: 'shared-edgeWidths' },
    edgeEndpointSizes: { id: 'shared-edgeEndpointSizes' },
  };

  const metaFor = (view, version, count) => ({
    version,
    count,
    buffer: view.buffer,
    byteOffset: view.byteOffset,
    byteLength: view.byteLength,
  });

  const graphLayer = {
    edgeRenderingMode: 'quad',
    nodeOutlineUseAttributes: false,
    nodeSizeBase: 0,
    nodeSizeScale: 1,
    edgeWidthBase: 0,
    edgeWidthScale: 1,
    edgeEndpointTrim: 0.8,
    getCameraUniforms() {
      return {
        mode: '2d',
        viewProjection: new Float32Array(16),
      };
    },
    resolveEdgeVariant() {
      return {
        widthBuffer: true,
        widthSource: 'node',
        widthEndpoints: 'both',
        endpointSizeBuffer: true,
        endpointSizeSource: 'node',
        endpointSizeEndpoints: 'both',
      };
    },
    getSharedSparseResources() {
      return {
        textures: { ...shared },
        textureMeta: {
          nodePositions: metaFor(nodePositions, 11, 2),
          nodeSizes: metaFor(nodeSizes, 12, 2),
          nodeOutlineWidths: metaFor(nodeOutlineWidths, 13, 2),
          nodeEdgeWidths: metaFor(nodeWidthSource, 14, 2),
          nodeEdgeEndpointSizes: metaFor(nodeEndpointSizeSource, 15, 2),
          edgeEndpoints: metaFor(edgeEndpoints, 21, 1),
          edgeWidths: metaFor(edgeWidths, 22, 1),
          edgeEndpointSizes: metaFor(edgeEndpointSizes, 23, 1),
        },
      };
    },
    withSparseGraph(_network, _versions, _indices, _edgeSources, fn) {
      return fn({
        nodes: {
          positions: nodePositions,
          sizes: nodeSizes,
          outlineWidths: nodeOutlineWidths,
          indices: null,
          versions: { positions: 11, sizes: 12, outlineWidths: 13 },
        },
        edges: {
          endpoints: edgeEndpoints,
          widths: edgeWidths,
          endpointSizes: edgeEndpointSizes,
          indices: null,
          versions: { endpoints: 21, widths: 22, endpointSizes: 23 },
        },
        nodeEdgeSources: {
          width: { view: nodeWidthSource, version: 14 },
          endpointSize: { view: nodeEndpointSizeSource, version: 15 },
        },
      });
    },
  };

  const renderer = new WebGLAttributeRenderer(graphLayer, null, {
    run(passes) {
      for (const pass of passes) pass();
    },
  });
  renderer.gl = gl;
  renderer.device = { type: 'webgl2' };
  renderer.resize = function resizeMock() {
    this.size = { width: 1, height: 1 };
    this.targets = { node: { handle: null }, edge: { handle: null } };
    this.depthTargets = { node: null, edge: null };
  };
  renderer.programs = {
    node: {},
    nodeOcclusion: {},
    nodeDepth: {},
    edge: {},
    edgeDepth: {},
    edgeQuad: {},
    edgeQuadDepth: {},
  };
  const nodeUniforms = {
    u_viewProjection: 0,
    u_nodePositions: 0,
    u_nodeSizes: 0,
    u_nodeOutlineWidths: 0,
    u_nodeEncoded: 0,
    u_cameraPosition: 0,
    u_cameraUp: 0,
    u_cameraRight: 0,
    u_is2D: 0,
    u_viewport: 0,
    u_useNodeIdBuffer: 0,
    u_useNodeSize: 0,
    u_useNodeOutline: 0,
    u_useEncodedTexture: 0,
    u_nodeSizeBase: 0,
    u_nodeSizeScale: 0,
    u_nodeOutline: 0,
    u_outlineWidthBase: 0,
    u_outlineWidthScale: 0,
  };
  const edgeUniforms = {
    u_viewProjection: 0,
    u_viewport: 0,
    u_nodePositions: 0,
    u_edgeEndpoints: 0,
    u_edgeEncoded: 0,
    u_edgeWidths: 0,
    u_edgeEndpointSizes: 0,
    u_nodeWidthSource: 0,
    u_nodeEndpointSizeSource: 0,
    u_useEdgeIdBuffer: 0,
    u_useEncodedTexture: 0,
    u_edgeWidthSource: 0,
    u_edgeWidthEndpoints: 0,
    u_edgeEndpointSizeSource: 0,
    u_edgeEndpointSizeEndpoints: 0,
    u_hasEdgeWidths: 0,
    u_hasEdgeEndpointSizes: 0,
    u_hasNodeWidthSource: 0,
    u_hasNodeEndpointSizeSource: 0,
    u_defaultEdgeWidth: 0,
    u_defaultEdgeEndpointSize: 0,
    u_edgeWidthBase: 0,
    u_edgeWidthScale: 0,
    u_nodeSizeBase: 0,
    u_nodeSizeScale: 0,
    u_edgeEndpointTrim: 0,
  };
  renderer.uniforms = {
    node: nodeUniforms,
    nodeOcclusion: nodeUniforms,
    nodeDepth: nodeUniforms,
    edge: edgeUniforms,
    edgeDepth: edgeUniforms,
    edgeQuad: edgeUniforms,
    edgeQuadDepth: edgeUniforms,
  };
  renderer.nodeVao = {};
  renderer.edgeVao = {};
  renderer.edgeQuadVao = {};
  renderer.nodeIdBuffer = {};
  renderer.edgeIdBuffer = {};
  renderer.textures = {
    nodePositions: { id: 'local-nodePositions' },
    nodeSizes: { id: 'local-nodeSizes' },
    nodeOutlineWidths: { id: 'local-nodeOutlineWidths' },
    nodeEncoded: { id: 'local-nodeEncoded' },
    edgeEndpoints: { id: 'local-edgeEndpoints' },
    edgeWidths: { id: 'local-edgeWidths' },
    edgeEndpointSizes: { id: 'local-edgeEndpointSizes' },
    nodeWidthSource: { id: 'local-nodeWidthSource' },
    nodeEndpointSizeSource: { id: 'local-nodeEndpointSizeSource' },
    edgeEncoded: { id: 'local-edgeEncoded' },
  };

  const uploads = [];
  renderer.uploadFloatTexture = (slot) => {
    uploads.push(`float:${slot}`);
    return true;
  };
  renderer.uploadUintTexture = (slot) => {
    uploads.push(`uint:${slot}`);
    return true;
  };

  const boundTextures = [];
  renderer.bindTexture = (unit, texture) => {
    boundTextures.push({ unit, texture });
  };

  const network = {
    nodeIndices: new Uint32Array([0, 1]),
    edgeIndices: new Uint32Array([0]),
    getTopologyVersions() {
      return { node: 1, edge: 1 };
    },
  };

  const result = renderer.render(
    { network, camera: {} },
    { width: 1, height: 1, devicePixelRatio: 1 },
    { nodeAttribute: '$index', edgeAttribute: '$index', resolutionScale: 1, trackDepth: false },
  );

  const boundByUnit = new Map();
  for (const entry of boundTextures) {
    if (!boundByUnit.has(entry.unit)) boundByUnit.set(entry.unit, []);
    boundByUnit.get(entry.unit).push(entry.texture);
  }

  assert.ok(result);
  assert.deepEqual(uploads, []);
  assert.equal(boundByUnit.get(0)?.includes(shared.nodePositions), true);
  assert.equal(boundByUnit.get(1)?.includes(shared.nodeSizes), true);
  assert.equal(boundByUnit.get(9)?.includes(shared.nodeOutlineWidths), true);
  assert.equal(boundByUnit.get(3)?.includes(shared.edgeEndpoints), true);
  assert.equal(boundByUnit.get(5)?.includes(shared.edgeWidths), true);
  assert.equal(boundByUnit.get(6)?.includes(shared.edgeEndpointSizes), true);
  assert.equal(boundByUnit.get(7)?.includes(shared.nodeWidthSource), true);
  assert.equal(boundByUnit.get(8)?.includes(shared.nodeEndpointSizeSource), true);
});
