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

test('fast edge rendering resolves a distinct lightweight WebGPU edge variant', () => {
  const layer = new GraphLayerWebGPU({ edgeRendering: 'quad', edgeFastRendering: true });
  const variant = layer.resolveEdgeVariant({
    edge: {
      color: { mode: 'buffer', source: 'edge' },
      width: { mode: 'buffer' },
      opacity: { mode: 'buffer' },
      endpointSize: { mode: 'buffer' },
    },
  });

  assert.equal(variant.fastPath, true);
  assert.equal(variant.colorBuffer, true);
  assert.equal(variant.colorSource, 'edge');
  assert.equal(variant.widthBuffer, false);
  assert.equal(variant.opacityBuffer, false);
  assert.equal(variant.endpointSizeBuffer, false);
  assert.match(layer.getEdgeVariantKey(true, variant), /\bf:1\b/);
});

test('advanced WebGPU edge variants specialize trim, state, semantic zoom, and camera mode', () => {
  const layer = new GraphLayerWebGPU();
  layer.edgeEndpointTrim = 0;
  layer.semanticZoomExponent = 0;
  const variant2D = layer.resolveEdgeVariant({
    edge: {
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  }, { is2D: true });
  assert.equal(variant2D.cameraMode, '2d');
  assert.equal(variant2D.trim, false);
  assert.equal(variant2D.endpointSizeBuffer, false);
  assert.equal(variant2D.edgeState, false);
  assert.equal(variant2D.endpointState, false);
  assert.equal(variant2D.semanticZoom, false);

  layer.edgeEndpointTrim = 0.8;
  layer.semanticZoomExponent = 0.5;
  layer.setEdgeStateStyle(0, { opacityMul: 0.5 });
  layer.setNodeStateStyle(0, { sizeMul: 1.5 });
  const variant3D = layer.resolveEdgeVariant({
    edge: {
      endpointSize: { mode: 'buffer', source: 'edge' },
    },
  }, { is2D: false });
  assert.equal(variant3D.cameraMode, '3d');
  assert.equal(variant3D.trim, true);
  assert.equal(variant3D.endpointSizeBuffer, true);
  assert.equal(variant3D.edgeState, true);
  assert.equal(variant3D.endpointState, true);
  assert.equal(variant3D.semanticZoom, false);

  const key2D = layer.getEdgeVariantKey(true, variant2D);
  const key3D = layer.getEdgeVariantKey(true, variant3D);
  assert.notEqual(key2D, key3D);
  assert.match(key2D, /\bcm:2d\b/);
  assert.match(key3D, /\bcm:3d\b/);
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
