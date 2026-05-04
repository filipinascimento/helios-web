import test from 'node:test';
import assert from 'node:assert/strict';
import { AttributeType } from 'helios-network';
import { SelectionBehavior } from '../src/behaviors/SelectionBehavior.js';

class MockNetwork extends EventTarget {
  constructor() {
    super();
    this.nodeIndices = [0, 1, 2, 3];
    this.edgeIndices = [0, 1];
    this._nodeInfo = new Map([
      ['saved_selection', { type: AttributeType.Boolean, dimension: 1 }],
    ]);
    this._edgeInfo = new Map([
      ['saved_selection', { type: AttributeType.Boolean, dimension: 1 }],
    ]);
    this._nodeBuffers = new Map([
      ['saved_selection', { view: Uint8Array.from([0, 1, 0, 1]) }],
    ]);
    this._edgeBuffers = new Map([
      ['saved_selection', { view: Uint8Array.from([1, 0]) }],
    ]);
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  withBufferAccess(callback) {
    return callback();
  }

  getNodeAttributeNames() {
    return Array.from(this._nodeInfo.keys());
  }

  getEdgeAttributeNames() {
    return Array.from(this._edgeInfo.keys());
  }

  getNodeAttributeInfo(name) {
    return this._nodeInfo.get(name) ?? null;
  }

  getEdgeAttributeInfo(name) {
    return this._edgeInfo.get(name) ?? null;
  }

  defineNodeAttribute(name, type, dimension) {
    this._nodeInfo.set(name, { type, dimension });
    if (!this._nodeBuffers.has(name)) this._nodeBuffers.set(name, { view: new Uint8Array(this.nodeIndices.length) });
  }

  defineEdgeAttribute(name, type, dimension) {
    this._edgeInfo.set(name, { type, dimension });
    if (!this._edgeBuffers.has(name)) this._edgeBuffers.set(name, { view: new Uint8Array(this.edgeIndices.length) });
  }

  getNodeAttributeBuffer(name) {
    return this._nodeBuffers.get(name);
  }

  getEdgeAttributeBuffer(name) {
    return this._edgeBuffers.get(name);
  }

  bumpNodeAttributeVersion() {}

  bumpEdgeAttributeVersion() {}

  selectNodes() {
    return new Uint32Array([1, 3]);
  }

  getNeighborsForNodes(indices) {
    return indices.includes(1) ? new Uint32Array([0, 2]) : new Uint32Array();
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
    this._nodeStateCalls = [];
    this._edgeStateCalls = [];
    this._cameraFollowCalls = [];
    this._picking = { node: { hoverEnabled: true }, edge: { hoverEnabled: false } };
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

  nodeState(indices, mask, options) {
    this._nodeStateCalls.push({ indices: Array.from(indices), mask, options });
    return this;
  }

  edgeState(indices, mask, options) {
    this._edgeStateCalls.push({ indices: Array.from(indices), mask, options });
    return this;
  }

  cameraFollowNodes(indices, options) {
    this._cameraFollowCalls.push({ indices: Array.from(indices), options });
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
    if (arguments.length === 0) return this._nodeNoStateStyle ?? { sizeMul: 1, opacityMul: 1, outlineMul: 1, discard: false, colorMul: [1, 1, 1, 1], colorAdd: [0, 0, 0, 0] };
    this._nodeNoStateStyle = style;
    return this;
  }

  edgeNoStateStyle(style) {
    if (arguments.length === 0) return this._edgeNoStateStyle ?? { widthMul: 1, opacityMul: 1, discard: false, colorMul: [1, 1, 1, 1], colorAdd: [0, 0, 0, 0] };
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

function attachSelection(options = {}) {
  const helios = new MockHelios();
  const behaviors = new Map();
  const behavior = new SelectionBehavior(options);
  behaviors.set('selection', behavior);
  behavior.attach({
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
  });
  return { helios, behavior };
}

test('selection behavior handles click, shift multi-select, and double-click focus', () => {
  const { helios, behavior } = attachSelection();

  helios.emit('graph:click', { kind: 'node', index: 1, modifiers: { shiftKey: false } });
  helios.emit('graph:click', { kind: 'node', index: 3, modifiers: { shiftKey: true } });
  helios.emit('graph:dblclick', { kind: 'node', index: 3, modifiers: { shiftKey: false } });

  assert.deepEqual(Array.from(behavior.state.selectedNodes).sort((a, b) => a - b), [3]);
  assert.deepEqual(helios._cameraFollowCalls.at(-1).indices, [3]);
});

test('selection behavior commands support direct selection and neighbor expansion', () => {
  const { behavior } = attachSelection();

  behavior.selectNodes([1, 3], { mode: 'replace' });
  assert.deepEqual(Array.from(behavior.state.selectedNodes).sort((a, b) => a - b), [1, 3]);

  behavior.selectNodes([1], { mode: 'remove' });
  assert.deepEqual(Array.from(behavior.state.selectedNodes).sort((a, b) => a - b), [3]);

  behavior.selectEdges([2], { mode: 'replace' });
  assert.deepEqual(Array.from(behavior.state.selectedEdges), [2]);
  behavior.selectEdges([2], { mode: 'remove' });
  assert.deepEqual(Array.from(behavior.state.selectedEdges), []);

  behavior.selectNodes([1, 3], { mode: 'replace' });
  behavior.expandSelectionToNeighbors();
  assert.deepEqual(Array.from(behavior.state.selectedNodes).sort((a, b) => a - b), [0, 1, 2, 3]);
});

test('selection behavior serializes and restores selection state including saved selections', () => {
  const { behavior } = attachSelection({ nodeClick: false });

  behavior.selectNodes([1, 2], { mode: 'replace' });
  behavior.selectEdges([1], { mode: 'replace' });
  behavior.saveSelectionToAttribute('restored_selection');

  const snapshot = behavior.serialize();
  const { behavior: restored } = attachSelection();
  restored.restore(snapshot);

  assert.equal(restored.state.nodeClick, false);
  assert.deepEqual(Array.from(restored.state.selectedNodes).sort((a, b) => a - b), [1, 2]);
  assert.deepEqual(Array.from(restored.state.selectedEdges), [1]);
  assert.equal(restored.state.savedSelectionAttribute, 'restored_selection');

  restored.restoreSelectionFromAttribute('saved_selection');
  assert.deepEqual(Array.from(restored.state.selectedNodes).sort((a, b) => a - b), [1, 3]);
  assert.deepEqual(Array.from(restored.state.selectedEdges), [0]);
});
