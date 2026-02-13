import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GraphLayerWebGL } from '../src/rendering/engine/GraphLayerWebGL.js';
import { WebGLAttributeRenderer } from '../src/rendering/AttributeTracker.js';
import { createGraphWebGLSources } from '../src/rendering/engine/shaders/graphWebGL.js';

function createMockGL(maxTextureSize = 4) {
  const calls = {
    texImage2D: [],
    texSubImage2D: [],
  };
  const gl = {
    MAX_TEXTURE_SIZE: 0x0D33,
    TEXTURE_2D: 0x0DE1,
    UNPACK_ALIGNMENT: 0x0CF5,
    UNPACK_ROW_LENGTH: 0x0CF2,
    R32F: 0x822E,
    RED: 0x1903,
    RG32UI: 0x823C,
    RG_INTEGER: 0x8228,
    FLOAT: 0x1406,
    UNSIGNED_INT: 0x1405,
    getParameter(param) {
      if (param === this.MAX_TEXTURE_SIZE) return maxTextureSize;
      return 0;
    },
    bindTexture() {},
    pixelStorei() {},
    texImage2D(...args) {
      calls.texImage2D.push(args);
    },
    texSubImage2D(...args) {
      calls.texSubImage2D.push(args);
    },
  };
  return { gl, calls };
}

test('GraphLayerWebGL computes tiled texture layout for >MAX_TEXTURE_SIZE texels', () => {
  const layer = new GraphLayerWebGL();
  const { gl } = createMockGL(16384);
  layer.gl = gl;
  const layout = layer.getTextureLayout(50000);
  assert.deepEqual(layout, { width: 16384, height: 4 });
});

test('GraphLayerWebGL uploads multi-row textures with texSubImage2D slices', () => {
  const layer = new GraphLayerWebGL();
  const { gl, calls } = createMockGL(4);
  layer.gl = gl;

  const ok = layer.uploadFloatTexture('nodeSizes', {}, new Float32Array([1, 2, 3, 4, 5]), 1, 5, 1);
  assert.equal(ok, true);
  assert.equal(calls.texImage2D.length, 1);
  assert.equal(calls.texSubImage2D.length, 2);
  assert.equal(calls.texImage2D[0][3], 4); // width
  assert.equal(calls.texImage2D[0][4], 2); // height
  assert.equal(calls.texSubImage2D[0][4], 4); // first row width
  assert.equal(calls.texSubImage2D[1][4], 1); // second row width
  assert.equal(calls.texSubImage2D[0][8].length, 4);
  assert.equal(calls.texSubImage2D[1][8].length, 1);
});

test('WebGLAttributeRenderer tiles integer textures across rows', () => {
  const renderer = new WebGLAttributeRenderer({}, null, null);
  const { gl, calls } = createMockGL(2);
  renderer.gl = gl;

  const ok = renderer.uploadUintTexture('edgeEndpoints', {}, new Uint32Array([10, 11, 12, 13, 14, 15]), 2, 3, 1);
  assert.equal(ok, true);
  assert.equal(calls.texImage2D.length, 1);
  assert.equal(calls.texSubImage2D.length, 2);
  assert.equal(calls.texImage2D[0][3], 2); // width
  assert.equal(calls.texImage2D[0][4], 2); // height
  assert.equal(calls.texSubImage2D[0][4], 2); // first row width
  assert.equal(calls.texSubImage2D[1][4], 1); // second row width
  assert.equal(calls.texSubImage2D[0][8].length, 4);
  assert.equal(calls.texSubImage2D[1][8].length, 2);
});

test('graphWebGL shaders use textureCoord indexing instead of fixed y=0 fetches', () => {
  const sources = createGraphWebGLSources();
  assert.match(sources.NODE_VERTEX_SOURCE, /textureCoord/);
  assert.equal(sources.NODE_VERTEX_SOURCE.includes('ivec2(int(id), 0)'), false);
  assert.equal(sources.EDGE_VERTEX_SOURCE.includes('ivec2(int(a_edgeId), 0)'), false);
  assert.equal(sources.EDGE_QUAD_VERTEX_SOURCE.includes('ivec2(int(a_edgeId), 0)'), false);
});
