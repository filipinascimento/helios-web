import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GraphLayer,
  SHADED_AMBIENT_STRENGTH_DEFAULT,
  SHADED_AMBIENT_TOP_COLOR_DEFAULT,
  SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT,
  SHADED_DIFFUSE_STRENGTH_DEFAULT,
  SHADED_SHININESS_DEFAULT,
  SHADED_SPECULAR_STRENGTH_DEFAULT,
} from '../src/rendering/engine/GraphLayer.js';

test('graph layer shaded-light defaults mirror UI expectations', () => {
  const layer = new GraphLayer();
  assert.equal(SHADED_DIFFUSE_STRENGTH_DEFAULT, 0.5);
  assert.deepEqual(SHADED_AMBIENT_TOP_COLOR_DEFAULT, [1, 1, 1, 1]);
  assert.deepEqual(SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT, [163 / 255, 163 / 255, 163 / 255, 1]);
  assert.equal(SHADED_AMBIENT_STRENGTH_DEFAULT, 1);
  assert.equal(SHADED_SPECULAR_STRENGTH_DEFAULT, 0);

  assert.equal(layer.shadedEnabled, false);
  assert.equal(layer.shadedNodes, true);
  assert.equal(layer.shadedEdges, false);
  assert.deepEqual(layer.shadedAmbientTopColor, SHADED_AMBIENT_TOP_COLOR_DEFAULT);
  assert.deepEqual(layer.shadedAmbientBottomColor, SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT);
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
