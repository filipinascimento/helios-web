import test from 'node:test';
import assert from 'node:assert/strict';
import { AttributeType } from 'helios-network';
import { HoverBehavior } from '../src/behaviors/HoverBehavior.js';
import { SelectionBehavior } from '../src/behaviors/SelectionBehavior.js';

class MockNetwork extends EventTarget {
  constructor() {
    super();
    this.nodeIndices = [0, 1, 2, 3];
    this.edgeIndices = [0, 1];
    this._nodeInfo = new Map([
      ['label', { type: AttributeType.String, dimension: 1 }],
    ]);
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  getNodeAttributeNames() {
    return Array.from(this._nodeInfo.keys());
  }

  getNodeAttributeInfo(name) {
    return this._nodeInfo.get(name) ?? null;
  }

  getNodeStringAttribute(name, index) {
    if (name !== 'label') return null;
    return `node-${index}`;
  }
}

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = new MockNetwork();
    this._labels = { enabled: false, maxVisible: 120 };
    this._nodeStateStyles = new Map();
    this._edgeStateStyles = new Map();
    this._nodeNoStateStyle = null;
    this._edgeNoStateStyle = null;
    this._picking = { node: { enabled: false, hoverEnabled: false }, edge: { enabled: false, hoverEnabled: false } };
    this.renderer = {
      graphLayer: {
        propagateHoveredNodeToEdges: false,
        propagateSelectedNodesToEdges: false,
        nodeNoStateStyleEnabled: false,
        edgeNoStateStyleEnabled: false,
      },
    };
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  emit(type, detail) {
    const event = new Event(type);
    event.detail = detail;
    this.dispatchEvent(event);
  }

  labels(options) {
    if (arguments.length === 0) return { ...this._labels };
    this._labels = { ...this._labels, ...options };
    return this;
  }

  nodeStateStyle(slot, style) {
    if (arguments.length === 1) return this._nodeStateStyles.get(slot) ?? { sizeMul: 1, opacityMul: 1, outlineMul: 1, discard: false, forceMaxAlpha: false, colorMul: [1, 1, 1, 1], colorAdd: [0, 0, 0, 0] };
    this._nodeStateStyles.set(slot, style);
    return this;
  }

  edgeStateStyle(slot, style) {
    if (arguments.length === 1) return this._edgeStateStyles.get(slot) ?? { widthMul: 1, opacityMul: 1, discard: false, forceMaxAlpha: false, colorMul: [1, 1, 1, 1], colorAdd: [0, 0, 0, 0] };
    this._edgeStateStyles.set(slot, style);
    return this;
  }

  nodeNoStateStyle(style) {
    if (arguments.length === 0) return this._nodeNoStateStyle;
    this._nodeNoStateStyle = style;
    return this;
  }

  edgeNoStateStyle(style) {
    if (arguments.length === 0) return this._edgeNoStateStyle;
    this._edgeNoStateStyle = style;
    return this;
  }

  hoverNodeState(index, mask) {
    this._hoverNode = { index, mask };
    return this;
  }

  hoverEdgeState(index, mask) {
    this._hoverEdge = { index, mask };
    return this;
  }

  enableNodePicking(options) {
    this._picking.node = { enabled: true, hoverEnabled: options.hoverEnabled === true };
  }

  disableNodePicking() {
    this._picking.node = { enabled: false, hoverEnabled: false };
  }

  enableEdgePicking(options) {
    this._picking.edge = { enabled: true, hoverEnabled: options.hoverEnabled === true };
  }

  disableEdgePicking() {
    this._picking.edge = { enabled: false, hoverEnabled: false };
  }

  requestRender() {}

  background() {
    return [1, 1, 1, 1];
  }
}

function createContext(helios, behaviors) {
  return {
    helios,
    get network() {
      return helios.network;
    },
    subscribe(target, eventName, handler, optionsArg) {
      if (typeof target.on === 'function') return target.on(eventName, handler, optionsArg);
      target.addEventListener(eventName, handler, optionsArg);
      return () => target.removeEventListener(eventName, handler, optionsArg);
    },
    getBehavior(id) {
      return behaviors.get(id) ?? null;
    },
  };
}

function attachHover(options = {}, selectionOptions = {}) {
  const helios = new MockHelios();
  const behaviors = new Map();
  const selection = new SelectionBehavior(selectionOptions);
  const hover = new HoverBehavior(options);
  behaviors.set('selection', selection);
  behaviors.set('hover', hover);
  const context = createContext(helios, behaviors);
  selection.attach(context);
  hover.attach(context);
  return { helios, hover, selection };
}

test('hover behavior updates hover state, labels, and picking policy independently from selection', () => {
  const { helios, hover, selection } = attachHover({ hoverLabel: false }, { nodeClick: true });

  assert.equal(selection.state.nodeClick, true);
  assert.equal(hover.state.hoverLabel, false);
  assert.equal(helios._picking.node.enabled, true);
  assert.equal(helios._picking.node.hoverEnabled, true);

  hover.update({ nodeHover: false, hoverConnectedEdges: false });
  assert.equal(hover.state.nodeHover, false);
  assert.equal(hover.state.hoverConnectedEdges, false);
  assert.equal(selection.state.nodeClick, true);
  assert.equal(helios._picking.node.enabled, true);
  assert.equal(helios._picking.node.hoverEnabled, false);
});

test('hover behavior handles node and edge hover events and clears renderer hover state', () => {
  const { helios, hover } = attachHover({ edgeHover: true });

  helios.emit('node:hover', { state: 'in', index: 2 });
  assert.equal(hover.state.hoveredNode, 2);
  assert.deepEqual(helios._hoverNode, { index: 2, mask: 'HIGHLIGHTED' });

  helios.emit('node:hover', { state: 'out', index: 2 });
  assert.equal(hover.state.hoveredNode, -1);
  assert.deepEqual(helios._hoverNode, { index: null, mask: 0 });

  helios.emit('edge:hover', { state: 'in', index: 1 });
  assert.equal(hover.state.hoveredEdge, 1);
  assert.deepEqual(helios._hoverEdge, { index: 1, mask: 'HIGHLIGHTED' });

  hover.clearEdgeHover();
  assert.equal(hover.state.hoveredEdge, -1);
  assert.deepEqual(helios._hoverEdge, { index: null, mask: 0 });
});

test('hover behavior serializes hover options without persisting transient hovered state', () => {
  const { hover } = attachHover({ hoverLabel: false, hoverLabelSource: 'label', edgeHover: true });
  hover.state.hoveredNode = 1;
  hover.state.hoveredEdge = 0;

  const snapshot = hover.serialize();
  const { hover: restored } = attachHover();
  restored.restore(snapshot);

  assert.equal(restored.state.hoverLabel, false);
  assert.equal(restored.state.hoverLabelSource, 'label');
  assert.equal(restored.state.edgeHover, true);
  assert.equal(restored.state.hoveredNode, -1);
  assert.equal(restored.state.hoveredEdge, -1);
});
