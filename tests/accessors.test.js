import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

test('graph-layer accessors are chainable setters and return values as getters', () => {
  const calls = { render: 0 };
  const helios = Object.create(Helios.prototype);
  helios.renderer = { graphLayer: { edgeWidthScale: 1, edgeWidthBase: 0, semanticZoomExponent: 0.25 } };
  helios.scheduler = { requestRender: () => { calls.render += 1; } };
  helios._pendingGraphLayerProps = new Map();
  helios._pendingRendererProps = new Map();

  assert.equal(helios.edgeWidthScale(), 1);
  const result = helios.edgeWidthScale(2.5);
  assert.equal(result, helios);
  assert.equal(helios.edgeWidthScale(), 2.5);
  assert.equal(calls.render, 1);

  assert.equal(helios.semanticZoomExponent(), 0.25);
  const semanticResult = helios.semanticZoomExponent(0.65);
  assert.equal(semanticResult, helios);
  assert.equal(helios.semanticZoomExponent(), 0.65);
  assert.equal(calls.render, 2);
});

test('renderer accessors store pending values before renderer exists', () => {
  const calls = { render: 0 };
  const helios = Object.create(Helios.prototype);
  helios.renderer = null;
  helios.scheduler = { requestRender: () => { calls.render += 1; } };
  helios._pendingRendererProps = new Map();
  helios._pendingGraphLayerProps = new Map();

  const result = helios.background('#ffffff');
  assert.equal(result, helios);
  assert.equal(calls.render, 0);
  assert.deepEqual(helios._pendingRendererProps.get('clearColor'), [1, 1, 1, 1]);
});
