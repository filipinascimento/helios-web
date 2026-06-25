import test from 'node:test';
import assert from 'node:assert/strict';
import { SvgLabelController } from '../src/labels/SvgLabelController.js';
import { PositionDelegate } from '../src/delegates/PositionDelegate.js';

async function waitForProgressiveLabels(controller, limit = 30) {
  for (let i = 0; i < limit && controller._progressiveRankJob; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test('SvgLabelController resolves network position source when delegation is inactive', () => {
  const view = new Float32Array([0, 1, 0, 2, 3, 0]);
  const helios = {
    network: {
      getNodeAttributeBuffer: () => ({ view }),
    },
    positions: () => ({ source: 'network', delegate: null }),
  };
  const controller = new SvgLabelController(helios, {});

  const resolved = controller._resolvePositionView({}, performance.now());
  assert.equal(resolved.source, 'network');
  assert.equal(resolved.view, view);
});

test('SvgLabelController position accessor can reuse caller storage', () => {
  const view = new Float32Array([0, 1, 0, 2, 3, 4]);
  const helios = {
    network: {
      getNodeAttributeBuffer: () => ({ view }),
    },
    positions: () => ({ source: 'network', delegate: null }),
  };
  const controller = new SvgLabelController(helios, {});

  const accessor = controller._resolvePositionAccessor({}, performance.now());
  const out = [0, 0, 0];
  const returned = accessor.getInto(1, out);

  assert.equal(returned, out);
  assert.deepEqual(out, [2, 3, 4]);
});

test('SvgLabelController prefers delegate CPU view when available', () => {
  const delegateView = new Float32Array([4, 5, 0, 6, 7, 0]);
  class CpuViewDelegate extends PositionDelegate {
    synchronizeTopology() {}
    getNodePositionView() {
      return delegateView;
    }
  }
  const delegate = new CpuViewDelegate();
  const helios = {
    network: {},
    positions: () => ({ source: 'delegate', delegate }),
  };
  const controller = new SvgLabelController(helios, {});

  const resolved = controller._resolvePositionView({}, performance.now());
  assert.equal(resolved.source, 'delegate-view');
  assert.equal(resolved.view, delegateView);
});

test('SvgLabelController falls back to delegate snapshot for GPU-only delegates', () => {
  class GpuOnlyDelegate extends PositionDelegate {
    synchronizeTopology() {}
    getGpuPositionResource() {
      return { buffer: { label: 'gpu-only' }, count: 2, version: 1 };
    }
    getNodePositionView() {
      return null;
    }
  }
  const delegate = new GpuOnlyDelegate();
  const helios = {
    network: {},
    positions: () => ({ source: 'delegate', delegate }),
  };
  const controller = new SvgLabelController(helios, {});
  let scheduled = false;
  controller._scheduleDelegateSnapshot = () => {
    scheduled = true;
    controller._delegateSnapshot = new Float32Array([8, 9, 0, 10, 11, 0]);
  };

  const resolved = controller._resolvePositionView({}, performance.now());
  assert.equal(scheduled, true);
  assert.equal(resolved.source, 'delegate-snapshot');
  assert.ok(resolved.view instanceof Float32Array);
  assert.deepEqual(Array.from(resolved.view), [8, 9, 0, 10, 11, 0]);
});

test('SvgLabelController full selection uses the filtered render network node set', () => {
  const positions = new Float32Array([
    -0.5, -0.5, 0,
    0.25, 0.25, 0,
    0.75, 0.75, 0,
  ]);
  const baseNetwork = {
    nodeIndices: new Uint32Array([0, 1, 2]),
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: () => ({ view: positions }),
  };
  const filteredNetwork = {
    nodeIndices: new Uint32Array([1]),
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: () => ({ view: positions }),
    getTopologyVersions: () => ({ node: 10, edge: 4 }),
  };
  const helios = {
    network: baseNetwork,
    _getRenderNetwork: () => filteredNetwork,
    positions: () => ({ source: 'network', delegate: null }),
    size: { width: 100, height: 100 },
    renderer: { camera: { zoom: 1 } },
    nodeSizeBase: () => 1,
    nodeSizeScale: () => 1,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network: filteredNetwork }),
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({ enabled: true, source: '$id', maxVisible: 8 });

  const changed = controller._runFullUpdate({
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  }, performance.now());

  assert.equal(changed, true);
  assert.deepEqual(controller._visibleEntries.map((entry) => entry.id), [1]);
});

test('SvgLabelController selected-only mode uses sparse selection behavior ids', () => {
  const positions = new Float32Array([
    -0.8, -0.8, 0,
    -0.3, -0.3, 0,
    0.2, 0.2, 0,
    0.3, -0.3, 0,
  ]);
  let requestedNodeIndices = false;
  let requestedNodeState = false;
  const network = {
    get nodeIndices() {
      throw new Error('selected-only sparse selection should not iterate nodeIndices');
    },
    withBufferAccess: (fn, options = {}) => {
      requestedNodeIndices = requestedNodeIndices || options.nodeIndices === true;
      return fn();
    },
    hasNodeIndices: (ids) => Array.from(ids, (id) => id !== 2),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positions };
      if (name === '_helios_visuals_state') {
        requestedNodeState = true;
        throw new Error('selected-only sparse selection should not scan node state');
      }
      return null;
    },
  };
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'network', delegate: null }),
    size: { width: 100, height: 100 },
    renderer: { camera: { zoom: 1 } },
    behaviors: {
      get: (id) => (id === 'selection'
        ? { state: { selectedNodes: new Set([1, 2, 3]) } }
        : null),
    },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({
    enabled: true,
    selectionMode: 'selected-only',
    source: '$id',
    maxVisible: 8,
  });

  const changed = controller._runFullUpdate({
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  }, performance.now());

  assert.equal(changed, true);
  assert.equal(requestedNodeIndices, false);
  assert.equal(requestedNodeState, false);
  assert.deepEqual(controller._visibleEntries.map((entry) => entry.id), [1, 3]);
});

test('SvgLabelController throttles full ranked reselects while large graph view changes', () => {
  const network = {
    nodeCount: 200000,
    getTopologyVersions: () => ({ node: 1, edge: 1 }),
    getNodeAttributeVersion: () => 0,
  };
  const makeUniforms = (panX) => ({
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      panX, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  });
  let uniforms = makeUniforms(0);
  let fullUpdates = 0;
  let reprojects = 0;
  let requestedRender = 0;
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'network', delegate: null }),
    renderer: {
      camera: {
        getUniforms: () => uniforms,
      },
    },
    scheduler: {
      requestRender() {
        requestedRender += 1;
      },
    },
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({ enabled: true, source: '$id', maxVisible: 8, maxUpdateFps: 20 });
  controller.group = { remove() {} };
  controller._runFullUpdate = () => {
    fullUpdates += 1;
    controller._visibleEntries = [{ id: 1, text: '1', lines: ['1'], x: 50, y: 50, worldRadius: 1, score: 1 }];
    controller._lastVisibleSet = new Set([1]);
    return true;
  };
  controller._reprojectVisible = () => {
    reprojects += 1;
    return true;
  };

  assert.equal(controller.update({ timestamp: 0 }), true);
  assert.equal(fullUpdates, 1);

  uniforms = makeUniforms(0.01);
  assert.equal(controller.update({ timestamp: 60 }), true);
  assert.equal(fullUpdates, 1);
  assert.equal(reprojects, 1);
  assert.ok(controller._viewSettleTimer);

  uniforms = makeUniforms(0.02);
  assert.equal(controller.update({ timestamp: 520 }), true);
  assert.equal(fullUpdates, 2);
  assert.equal(reprojects, 1);
  assert.equal(controller._viewSettleTimer, null);
  assert.equal(requestedRender, 0);

  controller.destroy();
});

test('SvgLabelController progressively ranks huge graphs in cancellable chunks', async () => {
  const count = 100000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = 2;
    positions[i * 3 + 1] = 2;
  }
  positions[(count - 1) * 3] = 0;
  positions[(count - 1) * 3 + 1] = 0;
  const nodeIndices = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) nodeIndices[i] = i;
  let bufferAccessCalls = 0;
  const network = {
    nodeCount: count,
    nodeIndices,
    withBufferAccess: (fn) => {
      bufferAccessCalls += 1;
      return fn();
    },
    getTopologyVersions: () => ({ node: 1, edge: 1 }),
    getNodeAttributeVersion: () => 0,
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positions };
      return null;
    },
  };
  const uniforms = {
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  };
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'network', delegate: null }),
    renderer: {
      camera: {
        zoom: 1,
        getUniforms: () => uniforms,
      },
    },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({ enabled: true, source: '$id', maxVisible: 4 });

  assert.equal(controller._runFullUpdate(uniforms, 0), false);
  assert.ok(controller._progressiveRankJob);
  assert.deepEqual(controller._visibleEntries, []);

  await waitForProgressiveLabels(controller);

  assert.equal(controller._progressiveRankJob, null);
  assert.ok(bufferAccessCalls > 2);
  assert.deepEqual(controller._visibleEntries.map((entry) => entry.id), [count - 1]);
});

test('SvgLabelController cancels progressive ranking when the view changes', async () => {
  const count = 100000;
  const positions = new Float32Array(count * 3);
  const nodeIndices = new Uint32Array(count);
  for (let i = 0; i < count; i += 1) nodeIndices[i] = i;
  const network = {
    nodeCount: count,
    nodeIndices,
    withBufferAccess: (fn) => fn(),
    getTopologyVersions: () => ({ node: 1, edge: 1 }),
    getNodeAttributeVersion: () => 0,
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positions };
      return null;
    },
  };
  const makeUniforms = (panX) => ({
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      panX, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  });
  let uniforms = makeUniforms(0);
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'network', delegate: null }),
    renderer: {
      camera: {
        zoom: 1,
        getUniforms: () => uniforms,
      },
    },
    scheduler: { requestRender() {} },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({ enabled: true, source: '$id', maxVisible: 4 });

  assert.equal(controller._runFullUpdate(uniforms, 0), false);
  assert.ok(controller._progressiveRankJob);
  uniforms = makeUniforms(0.1);

  await waitForProgressiveLabels(controller, 5);

  assert.equal(controller._progressiveRankJob, null);
  assert.equal(controller._needsFullReselect, true);
  assert.deepEqual(controller._visibleEntries, []);
});

test('SvgLabelController hovered-node selection mode projects only the hovered node', () => {
  const positions = new Float32Array([
    -0.5, -0.5, 0,
    0.25, 0.25, 0,
    0.75, 0.75, 0,
  ]);
  const network = {
    withBufferAccess: (fn) => fn(),
    get nodeIndices() {
      throw new Error('hovered-node mode should not iterate nodeIndices');
    },
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positions };
      return null;
    },
  };
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'network', delegate: null }),
    size: { width: 100, height: 100 },
    renderer: { camera: { zoom: 1 } },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({ enabled: true, selectionMode: 'hovered-node', source: '$id' });
  controller._hoveredNode = 1;

  const changed = controller._runFullUpdate({
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  }, performance.now());

  assert.equal(changed, true);
  assert.deepEqual(controller._visibleEntries.map((entry) => entry.id), [1]);
  assert.equal(controller._visibleEntries[0].text, '1');
});

test('SvgLabelController hovered-node GPU delegate path requests only the hovered node', async () => {
  const network = {
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: () => null,
  };
  const delegate = {
    getNodePositionView() {
      return null;
    },
  };
  const requested = [];
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'delegate', delegate }),
    size: { width: 100, height: 100 },
    renderer: { camera: { zoom: 1 } },
    scheduler: { requestRender() {} },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
    async snapshotNodePositions(ids) {
      requested.push(Array.from(ids));
      return {
        ids: Uint32Array.from(ids),
        positions: new Float32Array([0.25, 0.25, 0]),
        count: ids.length,
        version: 1,
        source: 'test',
      };
    },
    async snapshotDelegatePositions() {
      throw new Error('hovered-node labels should not request a full delegate snapshot');
    },
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({ enabled: true, selectionMode: 'hovered-node', source: '$id' });
  controller._hoveredNode = 1;
  const uniforms = {
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  };

  assert.equal(controller._runFullUpdate(uniforms, performance.now()), false);
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller._runFullUpdate(uniforms, performance.now() + 20), true);

  assert.deepEqual(requested, [[1]]);
  assert.deepEqual(controller._visibleEntries.map((entry) => entry.id), [1]);
});

test('SvgLabelController can combine selected-only labels with a separate hovered-node overlay', () => {
  const positions = new Float32Array([
    -0.5, -0.5, 0,
    0.0, 0.0, 0,
    0.5, 0.5, 0,
  ]);
  const nodeStates = new Uint32Array([2, 0, 0]);
  const network = {
    nodeIndices: new Uint32Array([0, 1, 2]),
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positions };
      if (name === '_helios_visuals_state') return { view: nodeStates };
      return null;
    },
  };
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'network', delegate: null }),
    size: { width: 100, height: 100 },
    renderer: { camera: { zoom: 1 } },
    constructor: { STATES: { SELECTED: 2 } },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({
    enabled: true,
    selectionMode: 'selected-only',
    hoveredNodeEnabled: true,
    source: '$id',
    hoveredNodeSource: '$id',
    maxVisible: 8,
  });
  controller._hoveredNode = 1;

  const changed = controller._runFullUpdate({
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  }, performance.now());

  assert.equal(changed, true);
  assert.deepEqual(controller._visibleEntries.map((entry) => entry.id), [0, 1]);
});

test('SvgLabelController keeps selected-only delegate labels while resolving hovered-node overlay', async () => {
  const nodeStates = new Uint32Array([2, 0, 0]);
  const network = {
    nodeIndices: new Uint32Array([0, 1, 2]),
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_state') return { view: nodeStates };
      return null;
    },
  };
  const delegate = {
    getNodePositionView() {
      return null;
    },
  };
  const positionsById = new Map([
    [0, [-0.5, -0.5, 0]],
    [1, [0, 0, 0]],
  ]);
  const requested = [];
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'delegate', delegate }),
    size: { width: 100, height: 100 },
    renderer: { camera: { zoom: 1 } },
    scheduler: { requestRender() {} },
    constructor: { STATES: { SELECTED: 2 } },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
    async snapshotNodePositions(ids) {
      requested.push(Array.from(ids));
      const packed = new Float32Array(ids.length * 3);
      for (let i = 0; i < ids.length; i += 1) {
        packed.set(positionsById.get(ids[i]) ?? [0, 0, 0], i * 3);
      }
      return {
        ids: Uint32Array.from(ids),
        positions: packed,
        count: ids.length,
        version: 1,
        source: 'test',
      };
    },
    async snapshotDelegatePositions() {
      throw new Error('selected-only hover labels should not request a full delegate snapshot');
    },
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({
    enabled: true,
    selectionMode: 'selected-only',
    hoveredNodeEnabled: true,
    source: '$id',
    hoveredNodeSource: '$id',
    maxVisible: 8,
  });
  controller._hoveredNode = 1;
  const uniforms = {
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  };

  assert.equal(controller._runFullUpdate(uniforms, performance.now()), false);
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller._runFullUpdate(uniforms, performance.now() + 20), true);

  assert.deepEqual(requested, [[0], [1]]);
  assert.deepEqual(controller._visibleEntries.map((entry) => entry.id), [0, 1]);
});

test('SvgLabelController hover overlay does not replace regular labels', () => {
  const positions = new Float32Array([
    -0.5, -0.5, 0,
    0.0, 0.0, 0,
    0.5, 0.5, 0,
  ]);
  const network = {
    nodeIndices: new Uint32Array([0, 1, 2]),
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positions };
      return null;
    },
  };
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'network', delegate: null }),
    size: { width: 100, height: 100 },
    renderer: { camera: { zoom: 1 } },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({
    enabled: true,
    selectionMode: 'hovered-node',
    hoveredNodeEnabled: true,
    source: '$id',
    hoveredNodeSource: '$id',
    maxVisible: 8,
  });
  controller._hoveredNode = 1;

  const changed = controller._runFullUpdate({
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  }, performance.now());

  assert.equal(changed, true);
  const visibleIds = controller._visibleEntries.map((entry) => entry.id);
  assert.ok(visibleIds.includes(1), 'hovered label should be visible');
  assert.ok(visibleIds.includes(0) || visibleIds.includes(2), 'at least one regular label should remain visible');
});

test('SvgLabelController selected-only space-aware mode applies regular collision culling to selected labels', () => {
  const positions = new Float32Array([
    0, 0, 0,
    0.01, 0, 0,
  ]);
  const nodeStates = new Uint32Array([2, 2]);
  const network = {
    nodeIndices: new Uint32Array([0, 1]),
    withBufferAccess: (fn) => fn(),
    getNodeAttributeBuffer: (name) => {
      if (name === '_helios_visuals_position') return { view: positions };
      if (name === '_helios_visuals_state') return { view: nodeStates };
      return null;
    },
  };
  const helios = {
    network,
    _getRenderNetwork: () => network,
    positions: () => ({ source: 'network', delegate: null }),
    size: { width: 100, height: 100 },
    renderer: { camera: { zoom: 1 } },
    constructor: { STATES: { SELECTED: 2 } },
    nodeSizeBase: () => 0,
    nodeSizeScale: () => 0,
    nodeOutlineWidthBase: () => 0,
    nodeOutlineWidthScale: () => 0,
    semanticZoomExponent: () => 0,
    _buildPositionDelegateContext: () => ({ network }),
  };
  const controller = new SvgLabelController(helios, {});
  controller.setConfig({
    enabled: true,
    selectionMode: 'selected-only',
    selectedOnlySpaceAware: true,
    source: '$id',
    maxVisible: 8,
  });

  const changed = controller._runFullUpdate({
    viewProjection: new Float32Array([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]),
    viewport: { width: 100, height: 100 },
    mode: '2d',
    projectionType: 'orthographic',
    right: [1, 0, 0],
  }, performance.now());

  assert.equal(changed, true);
  assert.equal(controller._visibleEntries.length, 1);
});

test('SvgLabelController enables selected-only space-aware placement by default', () => {
  const controller = new SvgLabelController({}, {});
  assert.equal(controller.getConfig().selectedOnlySpaceAware, true);
});

test('SvgLabelController truncates single-line labels with maxChars', () => {
  const controller = new SvgLabelController({}, {});
  controller.setConfig({ maxChars: 5, maxRows: 1 });
  const formatted = controller._formatLabelText('abcdefg', 12);
  assert.ok(formatted);
  assert.deepEqual(formatted.lines, ['ab...']);
});

test('SvgLabelController wraps multi-line labels and appends ellipsis when clipped', () => {
  const controller = new SvgLabelController({}, {});
  controller.setConfig({ maxChars: 4, maxRows: 3 });
  const formatted = controller._formatLabelText('abcdefghijklm', 12);
  assert.ok(formatted);
  assert.deepEqual(formatted.lines, ['abcd', 'efgh', 'i...']);
});

test('SvgLabelController radius factor maps -1/0/1 to below/center/above', () => {
  const controller = new SvgLabelController({}, {});
  controller.setConfig({ offsetPx: 0, offsetRadiusFactor: 1 });
  assert.equal(controller._computeLabelScreenY(100, 20), 80);
  controller.setConfig({ offsetRadiusFactor: 0 });
  assert.equal(controller._computeLabelScreenY(100, 20), 100);
  controller.setConfig({ offsetRadiusFactor: -1 });
  assert.equal(controller._computeLabelScreenY(100, 20), 120);
});
