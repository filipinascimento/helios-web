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
