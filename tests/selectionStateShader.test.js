import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphLayerWebGL } from '../src/rendering/engine/GraphLayerWebGL.js';
import { GraphLayerWebGPU } from '../src/rendering/engine/GraphLayerWebGPU.js';
import { createGraphWebGLSources } from '../src/rendering/engine/shaders/graphWebGL.js';
import { createGraphWebGPUSources as createDynamicGraphWebGPUSources } from '../src/rendering/engine/shaders/graphWebGPU.js';
import { createGraphWebGPUSources as createBaseGraphWebGPUSources } from '../src/rendering/engine/shaders/graphWebGPUBase.js';

test('edge shader variant keys change when propagated hovered-node edge highlighting is enabled', () => {
  const webgl = new GraphLayerWebGL();
  const webgpu = new GraphLayerWebGPU();

  webgl.propagateHoveredNodeToEdges = false;
  let variant = webgl.resolveEdgeVariant({}, { is2D: true });
  const webglOff = webgl.getEdgeVariantKey(variant);
  webgl.propagateHoveredNodeToEdges = true;
  variant = webgl.resolveEdgeVariant({}, { is2D: true });
  const webglOn = webgl.getEdgeVariantKey(variant);
  assert.notEqual(webglOff, webglOn);
  assert.match(webglOff, /\bph:0\b/);
  assert.match(webglOn, /\bph:1\b/);

  webgpu.propagateHoveredNodeToEdges = false;
  let gpuVariant = webgpu.resolveEdgeVariant({}, { is2D: true });
  const webgpuOff = webgpu.getEdgeVariantKey(true, gpuVariant);
  webgpu.propagateHoveredNodeToEdges = true;
  gpuVariant = webgpu.resolveEdgeVariant({}, { is2D: true });
  const webgpuOn = webgpu.getEdgeVariantKey(true, gpuVariant);
  assert.notEqual(webgpuOff, webgpuOn);
  assert.match(webgpuOff, /\bph:0\b/);
  assert.match(webgpuOn, /\bph:1\b/);
});

test('edge shader variant keys change when propagated selected-node edge styling is enabled', () => {
  const webgl = new GraphLayerWebGL();
  const webgpu = new GraphLayerWebGPU();

  webgl.propagateSelectedNodesToEdges = false;
  let variant = webgl.resolveEdgeVariant({}, { is2D: true });
  const webglOff = webgl.getEdgeVariantKey(variant);
  webgl.propagateSelectedNodesToEdges = true;
  variant = webgl.resolveEdgeVariant({}, { is2D: true });
  const webglOn = webgl.getEdgeVariantKey(variant);
  assert.notEqual(webglOff, webglOn);
  assert.match(webglOff, /\bps:0\b/);
  assert.match(webglOn, /\bps:1\b/);

  webgpu.propagateSelectedNodesToEdges = false;
  let gpuVariant = webgpu.resolveEdgeVariant({}, { is2D: true });
  const webgpuOff = webgpu.getEdgeVariantKey(true, gpuVariant);
  webgpu.propagateSelectedNodesToEdges = true;
  gpuVariant = webgpu.resolveEdgeVariant({}, { is2D: true });
  const webgpuOn = webgpu.getEdgeVariantKey(true, gpuVariant);
  assert.notEqual(webgpuOff, webgpuOn);
  assert.match(webgpuOff, /\bps:0\b/);
  assert.match(webgpuOn, /\bps:1\b/);
});

test('webgpu edge variants drop endpoint-state specialization when storage-buffer budget would overflow', () => {
  const webgpu = new GraphLayerWebGPU();
  webgpu.device = {
    device: {
      limits: {
        maxStorageBuffersPerShaderStage: 9,
      },
    },
  };

  const heavyVariant = {
    fastPath: false,
    cameraMode: '3d',
    semanticZoom: false,
    trim: true,
    edgeState: true,
    endpointState: true,
    propagateHoveredNodeToEdges: true,
    propagateSelectedNodesToEdges: true,
    positionInterpolation: true,
    colorBuffer: true,
    colorSource: 'edge',
    colorEndpoints: 'both',
    colorDoubleWidth: true,
    colorNodeAttribute: null,
    widthBuffer: true,
    widthSource: 'edge',
    widthEndpoints: 'both',
    widthDoubleWidth: true,
    widthNodeAttribute: null,
    opacityBuffer: true,
    opacitySource: 'edge',
    opacityEndpoints: 'both',
    opacityDoubleWidth: true,
    opacityNodeAttribute: null,
    endpointSizeBuffer: true,
    endpointSizeSource: 'edge',
    endpointSizeEndpoints: 'both',
    endpointSizeDoubleWidth: true,
    endpointSizeNodeAttribute: null,
  };

  assert.equal(webgpu.countEdgeVariantVertexStorageBindings(true, heavyVariant), 10);

  const downgraded = webgpu.normalizeEdgeVariantForBudget(true, heavyVariant);
  assert.equal(downgraded.endpointState, false);
  assert.equal(downgraded.propagateSelectedNodesToEdges, false);
  assert.equal(webgpu.countEdgeVariantVertexStorageBindings(true, downgraded), 9);

  const key = webgpu.getEdgeVariantKey(true, heavyVariant);
  assert.match(key, /\bet:0\b/);
  assert.match(key, /\bps:0\b/);
  assert.match(key, /\bpi:1\b/);
});

test('edge shader sources only include hovered-node endpoint propagation when enabled', () => {
  const webglOff = createGraphWebGLSources({
    edge: {
      cameraMode: '2d',
      trim: false,
      edgeState: true,
      endpointState: false,
      propagateHoveredNodeToEdges: false,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  const webglOn = createGraphWebGLSources({
    edge: {
      cameraMode: '2d',
      trim: false,
      edgeState: true,
      endpointState: false,
      propagateHoveredNodeToEdges: true,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  assert.equal(/sourceId == u_hoverNodeIndex \|\| targetId == u_hoverNodeIndex/.test(webglOff.EDGE_QUAD_VERTEX_SOURCE), false);
  assert.match(webglOn.EDGE_QUAD_VERTEX_SOURCE, /sourceId == u_hoverNodeIndex \|\| targetId == u_hoverNodeIndex/);
  assert.match(webglOn.EDGE_QUAD_VERTEX_SOURCE, /state \|= 4u;/);

  const webgpuOff = createDynamicGraphWebGPUSources(4, {
    edge: {
      cameraMode: '2d',
      trim: false,
      edgeState: true,
      endpointState: false,
      propagateHoveredNodeToEdges: false,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  const webgpuOn = createDynamicGraphWebGPUSources(4, {
    edge: {
      cameraMode: '2d',
      trim: false,
      edgeState: true,
      endpointState: false,
      propagateHoveredNodeToEdges: true,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  assert.equal(/sourceId == hover\.nodeIndex \|\| targetId == hover\.nodeIndex/.test(webgpuOff.EDGE_WGSL), false);
  assert.match(webgpuOn.EDGE_WGSL, /sourceId == hover\.nodeIndex \|\| targetId == hover\.nodeIndex/);
  assert.match(webgpuOn.EDGE_WGSL, /state = state \| 4u;/);
});

test('edge shader sources only include selected-node endpoint propagation when enabled', () => {
  const webglOff = createGraphWebGLSources({
    edge: {
      cameraMode: '2d',
      trim: false,
      edgeState: true,
      endpointState: false,
      propagateSelectedNodesToEdges: false,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  const webglOn = createGraphWebGLSources({
    edge: {
      cameraMode: '2d',
      trim: false,
      edgeState: true,
      endpointState: false,
      propagateSelectedNodesToEdges: true,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  assert.equal(/endpointStatePair\.x \| endpointStatePair\.y/.test(webglOff.EDGE_QUAD_VERTEX_SOURCE), false);
  assert.match(webglOn.EDGE_QUAD_VERTEX_SOURCE, /endpointStatePair\.x \| endpointStatePair\.y/);
  assert.match(webglOn.EDGE_VERTEX_SOURCE, /uvec2 fetchEdgeEndpointStatePair\(uint edgeId\)/);
  assert.match(webglOn.EDGE_VERTEX_SOURCE, /endpointStatePair\.x \| endpointStatePair\.y/);
  assert.match(webglOn.EDGE_QUAD_VERTEX_SOURCE, /state \|= 2u;/);

  const webgpuOff = createDynamicGraphWebGPUSources(4, {
    edge: {
      cameraMode: '2d',
      trim: false,
      edgeState: true,
      endpointState: false,
      propagateSelectedNodesToEdges: false,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  const webgpuOn = createDynamicGraphWebGPUSources(4, {
    edge: {
      cameraMode: '2d',
      trim: false,
      edgeState: true,
      endpointState: false,
      propagateSelectedNodesToEdges: true,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  assert.equal(/endpointStatePair\.x \| endpointStatePair\.y/.test(webgpuOff.EDGE_WGSL), false);
  assert.match(webgpuOn.EDGE_WGSL, /endpointStatePair\.x \| endpointStatePair\.y/);
  assert.match(webgpuOn.EDGE_WGSL, /state = state \| 2u;/);
});

test('webgl quad edge shader does not redeclare endpointStatePair when trim and selected propagation are both enabled', () => {
  const webgl = createGraphWebGLSources({
    edge: {
      cameraMode: '2d',
      trim: true,
      edgeState: true,
      endpointState: false,
      propagateSelectedNodesToEdges: true,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  const declarations = webgl.EDGE_QUAD_VERTEX_SOURCE.match(/uvec2 endpointStatePair =/g) ?? [];
  assert.equal(declarations.length, 1);
  assert.match(webgl.EDGE_QUAD_VERTEX_SOURCE, /uvec2 trimEndpointStatePair =/);
});

test('webgpu node variants specialize state and interpolation storage bindings', () => {
  globalThis.GPUShaderStage ??= { VERTEX: 1, FRAGMENT: 2 };
  const webgpu = new GraphLayerWebGPU();
  webgpu.device = {
    device: {
      createBindGroupLayout({ entries }) {
        return { entries };
      },
      createShaderModule({ code }) {
        return { code };
      },
    },
  };

  const minimal = webgpu.resolveNodeBindings(true, {
    colorBuffer: false,
    sizeBuffer: false,
    stateBuffer: false,
    outlineWidthBuffer: false,
    outlineColorBuffer: false,
    positionInterpolation: false,
  });
  const heavy = webgpu.resolveNodeBindings(true, {
    colorBuffer: true,
    sizeBuffer: true,
    stateBuffer: true,
    outlineWidthBuffer: true,
    outlineColorBuffer: true,
    positionInterpolation: true,
  });

  const minimalBindings = minimal.specs.map((entry) => entry.binding);
  const heavyBindings = heavy.specs.map((entry) => entry.binding);
  assert.equal(minimalBindings.includes(minimal.bindings.nodeSizes), false);
  assert.equal(minimalBindings.includes(minimal.bindings.nodeStates), false);
  assert.equal(minimalBindings.includes(minimal.bindings.nodePositionsFrom), false);
  assert.equal(heavyBindings.includes(heavy.bindings.nodeSizes), true);
  assert.equal(heavyBindings.includes(heavy.bindings.nodeStates), true);
  assert.equal(heavyBindings.includes(heavy.bindings.nodePositionsFrom), true);
});

test('base WebGPU node shader source omits state and interpolation reads when disabled', () => {
  const sources = createBaseGraphWebGPUSources(4, {
    useNodeIndices: true,
    bindings: {
      camera: 0,
      nodeIndices: 1,
      nodePositions: 2,
      globals: 3,
      hover: 4,
    },
    node: {
      color: 'uniform',
      size: 'uniform',
      state: 'none',
      outline: 'uniform',
      outlineColor: 'uniform',
      positionInterpolation: false,
    },
  });

  assert.equal(/var<storage, read> nodeStates/.test(sources.NODE_WGSL), false);
  assert.equal(/var<storage, read> nodePositionsFrom/.test(sources.NODE_WGSL), false);
  assert.equal(/nodeStates\.data\[index\]/.test(sources.NODE_WGSL), false);
  assert.equal(/nodePositionsFrom\.data\[baseOffset \+ 0u\]/.test(sources.NODE_WGSL), false);
});

test('selected alpha override is implemented in WebGL and WebGPU shader paths', () => {
  const webgl = createGraphWebGLSources({
    edge: {
      edgeState: true,
      propagateHoveredNodeToEdges: true,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  assert.match(webgl.NODE_VERTEX_SOURCE, /uniform uint u_nodeStateForceMaxAlphaMask;/);
  assert.match(webgl.NODE_VERTEX_SOURCE, /forceMaxAlpha \? 1\.0 : clamp\(alpha, 0\.0, 1\.0\)/);
  assert.match(webgl.EDGE_QUAD_VERTEX_SOURCE, /uniform uint u_edgeStateForceMaxAlphaMask;/);
  assert.match(webgl.EDGE_QUAD_VERTEX_SOURCE, /forceMaxAlpha \? 1\.0 : alpha/);

  const webgpuBase = createBaseGraphWebGPUSources(4);
  assert.match(webgpuBase.NODE_WGSL, /nodeStateForceMaxAlphaMask: u32/);
  assert.match(webgpuBase.NODE_WGSL, /select\(clamp\(alpha, 0\.0, 1\.0\), 1\.0, forceMaxAlpha\)/);

  const webgpu = createDynamicGraphWebGPUSources(4, {
    edge: {
      edgeState: true,
      propagateHoveredNodeToEdges: true,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  assert.match(webgpu.EDGE_WGSL, /edgeStateForceMaxAlphaMask: u32/);
  assert.match(webgpu.EDGE_WGSL, /select\(alpha, 1\.0, forceMaxAlpha\)/);
  assert.match(webgpu.EDGE_WGSL, /max\(weight, 1000\.0\)/);
});

test('webgpu max transparency mode uses a valid max blend state', () => {
  const webgpu = new GraphLayerWebGPU();
  const { blend, fragment, key } = webgpu.getBlendForMode('max');

  assert.equal(key, 'max');
  assert.equal(fragment, 'edgeFragment');
  assert.deepEqual(blend, {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
  });
});

test('weighted edge accumulation uses unclamped weight while keeping final alpha clamped', () => {
  const webgl = createGraphWebGLSources({
    edge: {
      edgeState: true,
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer', source: 'edge' },
      opacity: { mode: 'buffer', source: 'edge' },
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  });
  assert.match(webgl.EDGE_VERTEX_SOURCE, /out float v_weight;/);
  assert.match(webgl.EDGE_VERTEX_SOURCE, /float weight = max\(baseColor\.a \* opacity \* opacityMul, 0\.0\);/);
  assert.match(webgl.EDGE_VERTEX_SOURCE, /forceMaxAlpha \? max\(weight, 1000\.0\) : weight/);
  assert.match(webgl.EDGE_WEIGHTED_FRAGMENT_SOURCE, /float weight = v_weight;/);

  const webgpu = createBaseGraphWebGPUSources(4);
  assert.match(webgpu.EDGE_WGSL, /@location\(1\) weight : f32,/);
  assert.match(webgpu.EDGE_WGSL, /let weight = max\(opacity \* color\.a, 0\.0\);/);
  assert.match(webgpu.EDGE_WGSL, /max\(weight, 1000\.0\)/);
  assert.match(webgpu.EDGE_WEIGHTED_WGSL, /let weight = input\.weight;/);
});
