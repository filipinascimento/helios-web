import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGraphWebGLSources } from '../src/rendering/engine/shaders/graphWebGL.js';
import { createGraphWebGPUSources } from '../src/rendering/engine/shaders/graphWebGPU.js';
import { createAttributeWebGPUSources } from '../src/rendering/engine/shaders/attributeWebGPU.js';

test('edge quad shaders allow subpixel widths', () => {
  const webgl = createGraphWebGLSources();
  assert.match(webgl.EDGE_QUAD_VERTEX_SOURCE, /float halfWidth = max\(width, 1e-3\) \* 0\.5;/);
  assert.equal(/float halfWidth = max\(width, 1\.0\) \* 0\.5;/.test(webgl.EDGE_QUAD_VERTEX_SOURCE), false);

  const webgpu = createGraphWebGPUSources();
  assert.match(webgpu.EDGE_WGSL, /let halfWidth = max\(width, 1e-3\) \* 0\.5;/);
  assert.equal(/let halfWidth = max\(width, 1\.0\) \* 0\.5;/.test(webgpu.EDGE_WGSL), false);

  const attribute = createAttributeWebGPUSources();
  assert.match(attribute.edgeWGSL, /let halfWidth = max\(width, 1e-3\) \* 0\.5;/);
  assert.equal(/let halfWidth = max\(width, 1\.0\) \* 0\.5;/.test(attribute.edgeWGSL), false);
});

test('runtime shader sources do not clamp edge quads to a 1px minimum', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const files = [
    '../src/rendering/engine/GraphLayerWebGL.js',
    '../src/rendering/AttributeTracker.js',
    '../src/rendering/engine/shaders/attributeWebGL.js',
    '../src/rendering/engine/shaders/graphWebGPUBase.js',
  ];
  for (const relativePath of files) {
    const source = fs.readFileSync(path.resolve(here, relativePath), 'utf8');
    assert.match(source, /halfWidth = max\(width, 1e-3\) \* 0\.5/);
    assert.equal(/halfWidth = max\(width, 1\.0\) \* 0\.5/.test(source), false, relativePath);
  }
});
