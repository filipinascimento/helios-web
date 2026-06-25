import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphWebGLSources } from '../src/rendering/engine/shaders/graphWebGL.js';
import { createGraphWebGPUSources as createDynamicGraphWebGPUSources } from '../src/rendering/engine/shaders/graphWebGPU.js';
import { createGraphWebGPUSources as createBaseGraphWebGPUSources } from '../src/rendering/engine/shaders/graphWebGPUBase.js';

test('webgl node shading specialization only emits shaded uniforms when enabled', () => {
  const disabled = createGraphWebGLSources({
    node: { shading: false },
  });
  const enabled = createGraphWebGLSources({
    node: { shading: true },
  });

  assert.equal(/u_shadedLightDirection/.test(disabled.NODE_FRAGMENT_SOURCE), false);
  assert.equal(/applyNodeShading/.test(disabled.NODE_FRAGMENT_SOURCE), false);
  assert.match(enabled.NODE_FRAGMENT_SOURCE, /uniform vec3 u_shadedLightDirection;/);
  assert.match(enabled.NODE_FRAGMENT_SOURCE, /uniform vec4 u_shadedParams;/);
  assert.match(enabled.NODE_FRAGMENT_SOURCE, /u_shadedParams\.z/);
  assert.match(enabled.NODE_FRAGMENT_SOURCE, /u_shadedParams\.w/);
  assert.match(enabled.NODE_FRAGMENT_SOURCE, /vec3 applyNodeShading/);
});

test('webgl edge shading specialization only emits shaded uniforms for quad-edge variants', () => {
  const disabled = createGraphWebGLSources({
    edge: { shading: false, fastPath: false },
  });
  const enabled = createGraphWebGLSources({
    edge: { shading: true, fastPath: false },
  });
  const fastPath = createGraphWebGLSources({
    edge: { shading: true, fastPath: true },
  });

  assert.equal(/u_shadedLightDirection/.test(disabled.EDGE_FRAGMENT_SOURCE), false);
  assert.equal(/applyEdgeShading/.test(disabled.EDGE_WEIGHTED_FRAGMENT_SOURCE), false);
  assert.match(enabled.EDGE_FRAGMENT_SOURCE, /uniform vec3 u_shadedLightDirection;/);
  assert.match(enabled.EDGE_WEIGHTED_FRAGMENT_SOURCE, /vec3 applyEdgeShading/);
  assert.match(enabled.EDGE_QUAD_VERTEX_SOURCE, /v_edgeShadeBasis = shadeBasis;/);
  assert.match(enabled.EDGE_FRAGMENT_SOURCE, /applyEdgeShading\(rgb, v_edgeLocal\.y, v_edgeShadeBasis\)/);
  assert.equal(/u_shadedLightDirection/.test(fastPath.EDGE_FRAGMENT_SOURCE), false);
});

test('webgpu node shading specialization only emits shaded uniform binding when enabled', () => {
  const disabled = createBaseGraphWebGPUSources(4, {
    node: { shading: false },
  });
  const enabled = createBaseGraphWebGPUSources(4, {
    node: { shading: true },
  });

  assert.equal(/var<uniform> shading : Shading;/.test(disabled.NODE_WGSL), false);
  assert.equal(/applyNodeShading/.test(disabled.NODE_WGSL), false);
  assert.match(enabled.NODE_WGSL, /var<uniform> shading : Shading;/);
  assert.match(enabled.NODE_WGSL, /shading\.params\.z/);
  assert.match(enabled.NODE_WGSL, /shading\.params\.w/);
  assert.match(enabled.NODE_WGSL, /fn applyNodeShading/);
});

test('webgpu edge shading specialization only emits shaded uniform binding when enabled', () => {
  const disabled = createDynamicGraphWebGPUSources(4, {
    edge: { shading: false, fastPath: false },
  });
  const enabled = createDynamicGraphWebGPUSources(4, {
    edge: { shading: true, fastPath: false },
  });
  const fastPath = createDynamicGraphWebGPUSources(4, {
    edge: { shading: true, fastPath: true },
  });

  assert.equal(/var<uniform> shading : Shading;/.test(disabled.EDGE_WGSL), false);
  assert.equal(/applyEdgeShading/.test(disabled.EDGE_WEIGHTED_WGSL), false);
  assert.match(enabled.EDGE_WGSL, /var<uniform> shading : Shading;/);
  assert.match(enabled.EDGE_WEIGHTED_WGSL, /fn applyEdgeShading/);
  assert.match(enabled.EDGE_WGSL, /output\.edgeShadeBasis = shadeBasis;/);
  assert.match(enabled.EDGE_WEIGHTED_WGSL, /applyEdgeShading\(input\.color\.rgb, input\.edgeLocal\.y, input\.edgeShadeBasis\)/);
  assert.equal(/var<uniform> shading : Shading;/.test(fastPath.EDGE_WGSL), false);
});
