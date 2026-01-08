import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

test('graph-layer accessors emit ui:binding-change events', () => {
  const helios = Object.create(Helios.prototype);
  helios.renderer = { graphLayer: { nodeSizeScale: 1 } };
  helios.scheduler = { requestRender: () => {} };
  helios._pendingGraphLayerProps = new Map();
  helios._pendingRendererProps = new Map();

  const events = [];
  helios.dispatchEvent = (event) => {
    events.push(event);
    return true;
  };

  helios.nodeSizeScale(2);

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'ui:binding-change');
  assert.equal(events[0].detail.id, 'helios.nodeSizeScale');
  assert.equal(events[0].detail.value, 2);
});

test('renderer accessors emit ui:binding-change events', () => {
  const helios = Object.create(Helios.prototype);
  helios.renderer = null;
  helios.scheduler = { requestRender: () => {} };
  helios._pendingGraphLayerProps = new Map();
  helios._pendingRendererProps = new Map();

  const events = [];
  helios.dispatchEvent = (event) => {
    events.push(event);
    return true;
  };

  helios.background('#ffffff');

  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'ui:binding-change');
  assert.equal(events[0].detail.id, 'helios.clearColor');
});

