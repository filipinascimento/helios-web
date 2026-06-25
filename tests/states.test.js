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

  const layer = new GraphLayer({ stateSlots: 3 });
  layer.nodeNoStateStyleEnabled = false;
  layer.edgeNoStateStyleEnabled = false;
  const heliosLike = {
    renderer: { graphLayer: layer },
    scheduler: { requestRender() {} },
    _stateStyleCache: {
      nodeNoState: null,
      edgeNoState: null,
    },
  };

  Helios.prototype.nodeNoStateStyle.call(heliosLike, { colorAdd: [0, 1, 0, 0] });
  Helios.prototype.edgeNoStateStyle.call(heliosLike, { discard: true });
  assert.equal(layer.nodeNoStateStyleEnabled, true);
  assert.equal(layer.edgeNoStateStyleEnabled, true);
});

test('state APIs accept built-in state names', () => {
  assert.equal(typeof Helios.prototype.nodeStateStyle, 'function');
  assert.equal(typeof Helios.prototype.edgeStateStyle, 'function');
  assert.equal(typeof Helios.prototype.nodeState, 'function');
  assert.equal(typeof Helios.prototype.edgeState, 'function');
  assert.equal(typeof Helios.prototype.hoverNodeState, 'function');
  assert.equal(typeof Helios.prototype.hoverEdgeState, 'function');
});

test('virtual hover style APIs do not consume state slots', () => {
  assert.equal(typeof Helios.prototype.nodeHoverStyle, 'function');
  assert.equal(typeof Helios.prototype.edgeHoverStyle, 'function');
  assert.equal(typeof Helios.prototype.hoverStyleFromHighlight, 'function');
  assert.equal(typeof Helios.prototype.highlightConnectedEdges, 'function');
  assert.equal(typeof Helios.prototype.setNodeHoverStyle, 'function');
  assert.equal(typeof Helios.prototype.setEdgeHoverStyle, 'function');
  assert.equal(typeof Helios.prototype.setHoverStyleFromHighlight, 'function');
  assert.equal(typeof Helios.prototype.setHighlightConnectedEdges, 'function');

  const layer = new GraphLayer({ stateSlots: 3 });
  const heliosLike = {
    constructor: Helios,
    renderer: { graphLayer: layer },
    scheduler: { requestRender() {} },
    _stateStyleCache: {
      nodeSlots: new Map(),
      edgeSlots: new Map(),
      nodeNoState: null,
      edgeNoState: null,
      nodeHover: null,
      edgeHover: null,
    },
  };

  Helios.prototype.nodeHoverStyle.call(heliosLike, { sizeMul: 1.7, forceMaxAlpha: true });
  Helios.prototype.edgeHoverStyle.call(heliosLike, { widthMul: 1.4 });

  assert.equal(layer.stateSlotCount, 3);
  assert.ok(Math.abs(Helios.prototype.nodeHoverStyle.call(heliosLike).sizeMul - 1.7) < 1e-6);
  assert.equal(Helios.prototype.nodeHoverStyle.call(heliosLike).forceMaxAlpha, true);
  assert.ok(Math.abs(Helios.prototype.edgeHoverStyle.call(heliosLike).widthMul - 1.4) < 1e-6);
});

test('hover style can explicitly copy from highlighted style without using a state slot', () => {
  const layer = new GraphLayer({ stateSlots: 4 });
  const heliosLike = {
    constructor: Helios,
    renderer: { graphLayer: layer },
    scheduler: { requestRender() {} },
    options: {},
    _hoverStyleFromHighlight: false,
    _emitUIBindingChange() {},
    _copyHighlightStyleToHover: Helios.prototype._copyHighlightStyleToHover,
    _stateStyleCache: {
      nodeSlots: new Map(),
      edgeSlots: new Map(),
      nodeNoState: null,
      edgeNoState: null,
      nodeHover: null,
      edgeHover: null,
    },
  };
  heliosLike.nodeStateStyle = (...args) => Helios.prototype.nodeStateStyle.call(heliosLike, ...args);
  heliosLike.edgeStateStyle = (...args) => Helios.prototype.edgeStateStyle.call(heliosLike, ...args);
  heliosLike.nodeHoverStyle = (...args) => Helios.prototype.nodeHoverStyle.call(heliosLike, ...args);
  heliosLike.edgeHoverStyle = (...args) => Helios.prototype.edgeHoverStyle.call(heliosLike, ...args);

  Helios.prototype.hoverStyleFromHighlight.call(heliosLike, true);
  Helios.prototype.nodeStateStyle.call(heliosLike, 'HIGHLIGHTED', {
    sizeMul: 1.9,
    opacityMul: 1,
    outlineMul: 2.2,
    colorAdd: [0.2, 0.3, 0.4, 0],
  });
  Helios.prototype.edgeStateStyle.call(heliosLike, 'HIGHLIGHTED', {
    widthMul: 2.4,
    opacityMul: 7,
    colorAdd: [0.1, 0.2, 0.3, 0],
  });

  assert.equal(layer.stateSlotCount, 4);
  assert.ok(Math.abs(Helios.prototype.nodeHoverStyle.call(heliosLike).sizeMul - 1.9) < 1e-6);
  assert.ok(Math.abs(Helios.prototype.nodeHoverStyle.call(heliosLike).outlineMul - 2.2) < 1e-6);
  assert.ok(Math.abs(Helios.prototype.edgeHoverStyle.call(heliosLike).widthMul - 2.4) < 1e-6);
  assert.equal(Helios.prototype.edgeHoverStyle.call(heliosLike).opacityMul, 7);
});

test('source-managed highlight can include connected edges without clearing other highlight owners', () => {
  const calls = [];
  const heliosLike = {
    network: {
      edgeIndices: [0, 1, 2],
      edgesView: new Uint32Array([0, 1, 1, 2, 2, 3]),
      withBufferAccess(callback) { return callback(); },
    },
    options: {},
    scheduler: { requestRender() {} },
    _highlightConnectedEdges: true,
    _highlightSources: new Map(),
    _highlightUnion: { nodes: new Set(), edges: new Set() },
    nodeState(ids, state, options) {
      calls.push({ scope: 'node', ids: Array.from(ids), state, mode: options?.mode });
      return this;
    },
    edgeState(ids, state, options) {
      calls.push({ scope: 'edge', ids: Array.from(ids), state, mode: options?.mode });
      return this;
    },
    _emitUIBindingChange() {},
    _collectConnectedHighlightEdges: Helios.prototype._collectConnectedHighlightEdges,
    _setHighlightSource: Helios.prototype._setHighlightSource,
    _clearHighlightSource: Helios.prototype._clearHighlightSource,
    _applyHighlightSources: Helios.prototype._applyHighlightSources,
  };

  Helios.prototype._setHighlightSource.call(heliosLike, 'legend:hover', { nodes: [1] });
  assert.deepEqual(calls, [
    { scope: 'node', ids: [1], state: 'HIGHLIGHTED', mode: 'add' },
    { scope: 'edge', ids: [0, 1], state: 'HIGHLIGHTED', mode: 'add' },
  ]);

  calls.length = 0;
  Helios.prototype._setHighlightSource.call(heliosLike, 'search', { nodes: [2] });
  assert.deepEqual(calls, [
    { scope: 'node', ids: [2], state: 'HIGHLIGHTED', mode: 'add' },
    { scope: 'edge', ids: [2], state: 'HIGHLIGHTED', mode: 'add' },
  ]);

  calls.length = 0;
  Helios.prototype.highlightConnectedEdges.call(heliosLike, false);
  assert.equal(heliosLike._highlightConnectedEdges, false);
  assert.deepEqual(calls, [
    { scope: 'edge', ids: [0, 1, 2], state: 'HIGHLIGHTED', mode: 'remove' },
  ]);

  calls.length = 0;
  Helios.prototype._clearHighlightSource.call(heliosLike, 'legend:hover');
  assert.deepEqual(calls, [
    { scope: 'node', ids: [1], state: 'HIGHLIGHTED', mode: 'remove' },
  ]);
});

test('hoverNodeState distinguishes virtual HOVER from real state overlay', () => {
  const layer = new GraphLayer({ stateSlots: 4 });
  const heliosLike = {
    constructor: Helios,
    renderer: { graphLayer: layer },
    scheduler: { requestRender() {} },
    _pendingGraphLayerProps: new Map(),
  };

  Helios.prototype.hoverNodeState.call(heliosLike, 1, 'HOVER');
  assert.equal(layer.hoveredNodeIndex, 1);
  assert.equal(layer.hoveredNodeState, 0);
  assert.equal(layer.hoveredNodeIsVirtual, true);

  Helios.prototype.hoverNodeState.call(heliosLike, 2, 'HIGHLIGHTED');
  assert.equal(layer.hoveredNodeIndex, 2);
  assert.equal(layer.hoveredNodeState, Helios.STATES.HIGHLIGHTED);
  assert.equal(layer.hoveredNodeIsVirtual, false);
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
    'edgeWidthClampToNodeDiameter',
    'edgeFastRendering',
    'background',
    'clearColor',
    'interactionRenderOrder',
  ];
  for (const name of names) {
    assert.equal(typeof Helios.prototype[name], 'function', `${name} should be a function`);
  }
});
