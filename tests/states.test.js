import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';
import { GraphLayer } from '../src/rendering/engine/GraphLayer.js';

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

test('state style accessors accept and return forceMaxAlpha', () => {
  const layer = new GraphLayer({ stateSlots: 4 });
  const heliosLike = {
    constructor: Helios,
    renderer: { graphLayer: layer },
    scheduler: { requestRender() {} },
    _stateStyleCache: {
      nodeSlots: new Map(),
      edgeSlots: new Map(),
      nodeNoState: null,
      edgeNoState: null,
    },
  };

  Helios.prototype.nodeStateStyle.call(heliosLike, 'SELECTED', {
    sizeMul: 1.5,
    forceMaxAlpha: true,
  });
  Helios.prototype.edgeStateStyle.call(heliosLike, 'SELECTED', {
    widthMul: 2.0,
    forceMaxAlpha: true,
  });

  const nodeStyle = Helios.prototype.nodeStateStyle.call(heliosLike, 'SELECTED');
  const edgeStyle = Helios.prototype.edgeStateStyle.call(heliosLike, 'SELECTED');

  assert.equal(nodeStyle.forceMaxAlpha, true);
  assert.equal(edgeStyle.forceMaxAlpha, true);
});

test('graph layer requests weighted edge transparency by default', () => {
  const layer = new GraphLayer();
  assert.equal(layer.edgeTransparencyMode, 'weighted');
});

test('graph layer falls back to alpha when weighted transparency is unavailable', () => {
  const layer = new GraphLayer();
  layer.weightedSupported = false;
  layer.setEdgeTransparencyMode('weighted');
  assert.equal(layer.edgeTransparencyMode, 'alpha');

  layer.setEdgeTransparencyMode('additive-normalized');
  assert.equal(layer.edgeTransparencyMode, 'alpha');
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
    'edgeFastRendering',
    'background',
    'clearColor',
  ];
  for (const name of names) {
    assert.equal(typeof Helios.prototype[name], 'function', `${name} should be a function`);
  }
});
