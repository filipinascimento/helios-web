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

test('label accessors proxy configuration to the label controller', () => {
  const calls = { render: 0, setConfig: 0, request: 0 };
  const state = {
    enabled: false,
    maxVisible: 120,
    fontSizeScale: 1,
    minScreenRadiusPx: 8,
    outlineWidth: 2,
    fill: '#ffffff',
    outlineColor: '#000000cc',
    fontFamily: 'sans-serif',
    source: null,
  };
  const helios = Object.create(Helios.prototype);
  helios.scheduler = { requestRender: () => { calls.render += 1; } };
  helios._refreshUIBindings = () => {};
  helios._labels = {
    getConfig() { return { ...state }; },
    setConfig(patch) {
      calls.setConfig += 1;
      Object.assign(state, patch);
    },
    requestFullReselect() { calls.request += 1; },
  };

  assert.equal(helios.labelsEnabled(), false);
  helios.labelsEnabled(true);
  assert.equal(state.enabled, true);

  helios.labelsMaxVisible(42);
  assert.equal(state.maxVisible, 42);

  helios.labelsFontSizeScale(1.5);
  assert.equal(state.fontSizeScale, 1.5);

  helios.labelsMinScreenRadius(12);
  assert.equal(state.minScreenRadiusPx, 12);

  helios.labelsOutlineWidth(3.5);
  assert.equal(state.outlineWidth, 3.5);

  helios.labelFill('#ff0000aa');
  assert.equal(state.fill, '#ff0000aa');

  helios.labelOutlineColor('#00ff00aa');
  assert.equal(state.outlineColor, '#00ff00aa');

  helios.labelFontFamily('Menlo, monospace');
  assert.equal(state.fontFamily, 'Menlo, monospace');

  helios.labelSource('name');
  assert.equal(state.source, 'name');

  assert.ok(calls.setConfig >= 9);
  assert.ok(calls.request >= 9);
  assert.ok(calls.render >= 9);
});
