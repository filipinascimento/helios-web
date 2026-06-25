import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createGraphWebGLSources } from '../src/rendering/engine/shaders/graphWebGL.js';
import { createGraphWebGPUSources } from '../src/rendering/engine/shaders/graphWebGPUBase.js';

test('node outline thickness scales with semantic zoom in graph shaders', () => {
  const webgl = createGraphWebGLSources();
  assert.match(webgl.NODE_VERTEX_SOURCE, /float semanticOutlineWidth = outlineWidth \* semanticScale;/);
  assert.match(webgl.NODE_VERTEX_SOURCE, /v_outlineThreshold = semanticOutlineWidth \/ max\(fullSize, 1e-5\);/);
  assert.equal(/v_outlineThreshold = outlineWidth \/ max\(fullSize, 1e-5\);/.test(webgl.NODE_VERTEX_SOURCE), false);

  const webgpu = createGraphWebGPUSources();
  assert.match(webgpu.NODE_WGSL, /let semanticOutlineWidth = outlineWidth \* semanticScale;/);
  assert.match(webgpu.NODE_WGSL, /output\.outlineThreshold = select\(0\.0, semanticOutlineWidth \/ max\(fullDiameter, 1e-5\), outlineWidth > 0\.0\);/);
  assert.equal(/output\.outlineThreshold = select\(0\.0, outlineWidth \/ max\(fullDiameter, 1e-5\), outlineWidth > 0\.0\);/.test(webgpu.NODE_WGSL), false);
});

test('attribute tracker applies semantic zoom to tracked node radius', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const source = fs.readFileSync(path.resolve(here, '../src/rendering/AttributeTracker.js'), 'utf8');
  assert.match(source, /float semanticScale = \(u_is2D == 1 && u_semanticZoomExponent > 0\.0\)/);
  assert.match(source, /float fullSize = max\(0\.0, \(u_nodeSizeBase \+ u_nodeSizeScale \* rawSize\) \* sizeMul \+ outlineWidth\) \* semanticScale;/);
  assert.match(source, /float radius = fullSize \* 0\.5;/);
});

test('node rendering shaders do not apply a hidden minimum size floor', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const webgl = createGraphWebGLSources();
  const webgpu = createGraphWebGPUSources();
  const attributeWebGL = fs.readFileSync(path.resolve(here, '../src/rendering/engine/shaders/attributeWebGL.js'), 'utf8');
  const attributeWebGPU = fs.readFileSync(path.resolve(here, '../src/rendering/engine/shaders/attributeWebGPU.js'), 'utf8');
  const fallbackWebGL = fs.readFileSync(path.resolve(here, '../src/rendering/engine/GraphLayerWebGL.js'), 'utf8');

  assert.match(webgl.NODE_VERTEX_SOURCE, /float fullSize = max\(0\.0, baseSize \+ outlineWidth\) \* semanticScale;/);
  assert.match(webgpu.NODE_WGSL, /let diameter = max\(0\.0, \(globals\.nodeSize\.x \+ globals\.nodeSize\.y \* rawSize\) \* sizeMul\);/);
  assert.match(attributeWebGL, /float fullSize = max\(0\.0, baseSize \+ outlineWidth\) \* semanticScale;/);
  assert.match(attributeWebGPU, /let fullSize = max\(0\.0, baseSize \+ outlineWidth\) \* semanticScale;/);
  assert.match(fallbackWebGL, /float fullSize = max\(0\.0, u_nodeSizeBase \+ u_nodeSizeScale \* rawSize\);/);
  assert.match(fallbackWebGL, /gl_PointSize = max\(0\.0, radiusPx \* 2\.0\);/);

  for (const source of [webgl.NODE_VERTEX_SOURCE, webgpu.NODE_WGSL, attributeWebGL, attributeWebGPU, fallbackWebGL]) {
    assert.equal(/max\(1\.0,[^\n]*(fullSize|nodeSize|globals\.nodeSize|u_nodeSizeBase|radiusPx)/.test(source), false);
  }
});
