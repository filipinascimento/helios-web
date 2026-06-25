import test from 'node:test';
import assert from 'node:assert/strict';
import { createGraphWebGLSources } from '../src/rendering/engine/shaders/graphWebGL.js';

test('node outline fragment path does not skip depth write', () => {
  const { NODE_FRAGMENT_SOURCE } = createGraphWebGLSources(4);
  assert.match(NODE_FRAGMENT_SOURCE, /gl_FragDepth/);
  assert.doesNotMatch(
    NODE_FRAGMENT_SOURCE,
    /fragColor\\s*=\\s*v_outlineColor;\\s*\\n\\s*return;/,
  );
});

