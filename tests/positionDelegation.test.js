import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork from 'helios-network';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
import { NODE_POSITION_ATTRIBUTE } from '../src/pipeline/constants.js';
import {
  CpuMirrorPositionDelegate,
  ExternalBufferPositionDelegate,
} from '../src/layouts/positions/PositionDelegate.js';

test('CpuMirrorPositionDelegate builds dense overrides', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  try {
    const visuals = new VisualAttributes(network);
    const nodes = network.addNodes(2);
    network.addEdges([[nodes[0], nodes[1]]]);

    network.withBufferAccess(() => {
      const view = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
      view[nodes[0] * 3 + 0] = 1;
      view[nodes[0] * 3 + 1] = 2;
      view[nodes[0] * 3 + 2] = 3;
      view[nodes[1] * 3 + 0] = 4;
      view[nodes[1] * 3 + 1] = 5;
      view[nodes[1] * 3 + 2] = 6;
    });

    const delegate = new CpuMirrorPositionDelegate({ syncToNetwork: false });
    delegate.attach({ network, visuals });
    const overrides = delegate.getDenseOverrides();

    assert.ok(overrides?.nodes?.positions?.view, 'node positions override exists');
    assert.equal(overrides.nodes.positions.view.length, 6);
    assert.deepEqual(Array.from(overrides.nodes.positions.view), [1, 2, 3, 4, 5, 6]);

    assert.ok(overrides?.edges?.segments?.view, 'edge endpoints override exists');
    assert.equal(overrides.edges.segments.view.length, 6);
    assert.deepEqual(Array.from(overrides.edges.segments.view), [1, 2, 3, 4, 5, 6]);
  } finally {
    network.dispose();
  }
});

test('ExternalBufferPositionDelegate exposes provided buffer', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  try {
    const visuals = new VisualAttributes(network);
    network.addNodes(1);
    const buffer = new Float32Array([9, 8, 7]);
    const delegate = new ExternalBufferPositionDelegate(buffer);
    delegate.attach({ network, visuals });
    assert.equal(delegate.getPositionView(), buffer);
  } finally {
    network.dispose();
  }
});

test('CpuMirrorPositionDelegate can sync back to network', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  try {
    const visuals = new VisualAttributes(network);
    const nodes = network.addNodes(1);
    const delegate = new CpuMirrorPositionDelegate({ syncToNetwork: true });
    delegate.attach({ network, visuals });

    const view = delegate.getPositionView();
    view[nodes[0] * 3 + 0] = 10;
    view[nodes[0] * 3 + 1] = 20;
    view[nodes[0] * 3 + 2] = 30;
    delegate.syncToNetwork();

    const networkView = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
    assert.equal(networkView[nodes[0] * 3 + 0], 10);
    assert.equal(networkView[nodes[0] * 3 + 1], 20);
    assert.equal(networkView[nodes[0] * 3 + 2], 30);
  } finally {
    network.dispose();
  }
});
