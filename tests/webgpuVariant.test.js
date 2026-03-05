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

test('getSharedSparseResources prefers active position buffers over stale cache entries', () => {
  const stalePositionBuffer = { label: 'stale-position' };
  const stalePositionFromBuffer = { label: 'stale-position-from' };
  const activePositionBuffer = { label: 'active-position', size: 1536 };
  const activePositionFromBuffer = { label: 'active-position-from', size: 1536 };

  const layerLike = {
    device: {
      resourceCache: {
        webgpu: {
          buffers: new Map([
            ['indirect:node:positions', { buffer: stalePositionBuffer, version: 4, count: 2, byteLength: 24 }],
            ['indirect:node:positionsFrom', { buffer: stalePositionFromBuffer, version: 3, count: 2, byteLength: 24 }],
          ]),
        },
      },
    },
    nodeBuffersGpu: {
      positions: { buffer: activePositionBuffer },
      positionsFrom: { buffer: activePositionFromBuffer },
    },
    _nodeDataCache: { count: 6 },
    positionInterpolation: { sourceVersion: 9, sourceCount: 6 },
    getPositionInterpolationState() {
      return this.positionInterpolation;
    },
  };

  const shared = GraphLayerWebGPU.prototype.getSharedSparseResources.call(layerLike);
  assert.equal(shared?.buffers?.['indirect:node:positions']?.buffer, activePositionBuffer);
  assert.equal(shared?.buffers?.['indirect:node:positions']?.count, 6);
  assert.equal(shared?.buffers?.['indirect:node:positionsFrom']?.buffer, activePositionFromBuffer);
  assert.equal(shared?.buffers?.['indirect:node:positionsFrom']?.version, 9);
});
