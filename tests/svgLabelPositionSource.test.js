import test from 'node:test';
import assert from 'node:assert/strict';
import { SvgLabelController } from '../src/labels/SvgLabelController.js';
import { PositionDelegate } from '../src/delegates/PositionDelegate.js';

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
