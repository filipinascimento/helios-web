import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AMBIENT_OCCLUSION_BIAS_DEFAULT,
  AMBIENT_OCCLUSION_INTENSITY_SCALE_DEFAULT,
  AMBIENT_OCCLUSION_INTENSITY_SHIFT_DEFAULT,
  AMBIENT_OCCLUSION_MODE_DEFAULT,
  AMBIENT_OCCLUSION_QUALITY_DEFAULT,
  AMBIENT_OCCLUSION_RADIUS_DEFAULT,
  AMBIENT_OCCLUSION_STRENGTH_DEFAULT,
  GraphLayer,
} from '../src/rendering/engine/GraphLayer.js';

test('graph layer ambient occlusion defaults mirror UI expectations', () => {
  const layer = new GraphLayer();
  assert.equal(layer.ambientOcclusionEnabled, false);
  assert.equal(layer.ambientOcclusionNodes, true);
  assert.equal(layer.ambientOcclusionEdges, false);
  assert.equal(layer.ambientOcclusionStrength, AMBIENT_OCCLUSION_STRENGTH_DEFAULT);
  assert.equal(layer.ambientOcclusionRadius, AMBIENT_OCCLUSION_RADIUS_DEFAULT);
  assert.equal(layer.ambientOcclusionBias, AMBIENT_OCCLUSION_BIAS_DEFAULT);
  assert.equal(layer.ambientOcclusionMode, AMBIENT_OCCLUSION_MODE_DEFAULT);
  assert.equal(layer.ambientOcclusionIntensityScale, AMBIENT_OCCLUSION_INTENSITY_SCALE_DEFAULT);
  assert.equal(layer.ambientOcclusionIntensityShift, AMBIENT_OCCLUSION_INTENSITY_SHIFT_DEFAULT);
  assert.equal(layer.ambientOcclusionQuality, AMBIENT_OCCLUSION_QUALITY_DEFAULT);
  assert.deepEqual(layer.getAmbientOcclusionSelection(), { nodes: false, edges: false });
});

test('graph layer ambient occlusion selection is specialized by global and per-scope toggles', () => {
  const layer = new GraphLayer({
    ambientOcclusionEnabled: true,
    ambientOcclusionNodes: false,
    ambientOcclusionEdges: true,
  });
  assert.equal(layer.isAmbientOcclusionEnabled(), true);
  assert.equal(layer.isAmbientOcclusionNodesEnabled(), false);
  assert.equal(layer.isAmbientOcclusionEdgesEnabled(), true);
  assert.deepEqual(layer.getAmbientOcclusionSelection(), { nodes: false, edges: true });
  assert.equal(layer.hasAmbientOcclusionSelection(), true);
});

test('graph layer ambient occlusion quality normalizes invalid values', () => {
  const low = new GraphLayer({ ambientOcclusionQuality: 'LOW' });
  assert.equal(low.ambientOcclusionQuality, 'low');

  const fallback = new GraphLayer({ ambientOcclusionQuality: 'cinematic' });
  assert.equal(fallback.ambientOcclusionQuality, AMBIENT_OCCLUSION_QUALITY_DEFAULT);
});

test('graph layer ambient occlusion mode normalizes invalid values', () => {
  const alt = new GraphLayer({ ambientOcclusionMode: 'ALT' });
  assert.equal(alt.ambientOcclusionMode, 'alt');

  const fallback = new GraphLayer({ ambientOcclusionMode: 'vtk-ish' });
  assert.equal(fallback.ambientOcclusionMode, AMBIENT_OCCLUSION_MODE_DEFAULT);
});
