import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphLayerWebGPUIndirect } from '../src/rendering/engine/GraphLayerWebGPUIndirect.js';


test('indirect edge variant key changes when node attribute changes', () => {
  const layer = new GraphLayerWebGPUIndirect();
  const variantA = layer.resolveIndirectEdgeVariant({
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
  const variantB = layer.resolveIndirectEdgeVariant({
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
