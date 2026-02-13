import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphLayerWebGPU } from '../src/rendering/engine/GraphLayerWebGPU.js';


test('indirect edge variant key changes when node attribute changes', () => {
  const layer = new GraphLayerWebGPU();
  const variantA = layer.resolveEdgeVariant({
    edge: {
      width: {
        mode: 'buffer',
        source: 'node',
        nodeAttribute: 'weight',
        endpoints: 'both',
        doubleWidth: true,
      },
    },
  });
  const variantB = layer.resolveEdgeVariant({
    edge: {
      width: {
        mode: 'buffer',
        source: 'node',
        nodeAttribute: 'strength',
        endpoints: 'both',
        doubleWidth: true,
      },
    },
  });
  const keyA = layer.getEdgeVariantKey(true, variantA);
  const keyB = layer.getEdgeVariantKey(true, variantB);
  assert.notEqual(keyA, keyB);
});
