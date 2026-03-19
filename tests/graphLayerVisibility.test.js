import test from 'node:test';
import assert from 'node:assert/strict';
import { GraphLayer } from '../src/rendering/engine/GraphLayer.js';

test('GraphLayer skips edge rendering when global width resolves to zero', () => {
  const layer = new GraphLayer();
  layer.edgeWidthBase = 0;
  layer.edgeWidthScale = 0;
  assert.equal(layer.shouldRenderEdges(), false);
});

test('GraphLayer skips edge rendering when global opacity resolves to zero', () => {
  const layer = new GraphLayer();
  layer.edgeOpacityBase = 0;
  layer.edgeOpacityScale = 0;
  assert.equal(layer.shouldRenderEdges(), false);
});

test('GraphLayer keeps edges enabled when width and opacity are both still active', () => {
  const layer = new GraphLayer();
  layer.edgeWidthBase = 0;
  layer.edgeWidthScale = 1;
  layer.edgeOpacityBase = 0;
  layer.edgeOpacityScale = 0.5;
  assert.equal(layer.shouldRenderEdges(), true);
});
