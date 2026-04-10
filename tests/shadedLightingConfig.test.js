import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GraphLayer,
  SHADED_AMBIENT_STRENGTH_DEFAULT,
  SHADED_DIFFUSE_STRENGTH_DEFAULT,
  SHADED_SHININESS_DEFAULT,
  SHADED_SPECULAR_STRENGTH_DEFAULT,
} from '../src/rendering/engine/GraphLayer.js';

test('graph layer shaded-light defaults mirror UI expectations', () => {
  const layer = new GraphLayer();
  assert.equal(layer.shadedEnabled, false);
  assert.equal(layer.shadedNodes, true);
  assert.equal(layer.shadedEdges, false);
  assert.equal(layer.shadedDiffuseStrength, SHADED_DIFFUSE_STRENGTH_DEFAULT);
  assert.equal(layer.shadedAmbientStrength, SHADED_AMBIENT_STRENGTH_DEFAULT);
  assert.equal(layer.shadedSpecularStrength, SHADED_SPECULAR_STRENGTH_DEFAULT);
  assert.equal(layer.shadedShininess, SHADED_SHININESS_DEFAULT);
});

test('graph layer shaded strengths clamp invalid values to non-negative ranges', () => {
  const layer = new GraphLayer({
    shadedDiffuseStrength: -2,
    shadedAmbientStrength: '3.5',
    shadedSpecularStrength: -1,
  });
  assert.equal(layer.shadedDiffuseStrength, 0);
  assert.equal(layer.shadedAmbientStrength, 3.5);
  assert.equal(layer.shadedSpecularStrength, 0);
});