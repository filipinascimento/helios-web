import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

test('exports Helios.STATES and keeps Helios.STATE_BITS as alias', () => {
  assert.ok(Helios);
  assert.ok(Helios.STATES);
  assert.equal(Helios.STATE_BITS, Helios.STATES);
  assert.equal(Helios.STATES.FILTERED, 1 << 0);
  assert.equal(Helios.STATES.SELECTED, 1 << 1);
  assert.equal(Helios.STATES.HIGHLIGHTED, 1 << 2);
});

test('supports no-state style helpers', () => {
  assert.equal(typeof Helios.prototype.nodeNoStateStyle, 'function');
  assert.equal(typeof Helios.prototype.edgeNoStateStyle, 'function');
  assert.equal(typeof Helios.prototype.setNodeNoStateStyle, 'function');
  assert.equal(typeof Helios.prototype.setEdgeNoStateStyle, 'function');
});

test('state APIs accept built-in state names', () => {
  assert.equal(typeof Helios.prototype.nodeStateStyle, 'function');
  assert.equal(typeof Helios.prototype.edgeStateStyle, 'function');
  assert.equal(typeof Helios.prototype.nodeState, 'function');
  assert.equal(typeof Helios.prototype.edgeState, 'function');
  assert.equal(typeof Helios.prototype.hoverNodeState, 'function');
  assert.equal(typeof Helios.prototype.hoverEdgeState, 'function');
});

test('global accessors exist on Helios prototype', () => {
  const names = [
    'edgeWidthScale',
    'edgeWidthBase',
    'edgeOpacityScale',
    'edgeOpacityBase',
    'nodeOpacityScale',
    'nodeOpacityBase',
    'nodeSizeScale',
    'nodeSizeBase',
    'semanticZoomExponent',
    'nodeOutlineWidthScale',
    'nodeOutlineWidthBase',
    'edgeEndpointTrim',
    'background',
    'clearColor',
  ];
  for (const name of names) {
    assert.equal(typeof Helios.prototype[name], 'function', `${name} should be a function`);
  }
});
