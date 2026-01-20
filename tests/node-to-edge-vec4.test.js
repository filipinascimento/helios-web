import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork, { AttributeType } from 'helios-network';

test('helios-network node-to-edge passthrough copies vec4 endpoints correctly (undirected)', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  try {
    const nodes = network.addNodes(2);
    const edges = network.addEdges([{ from: nodes[0], to: nodes[1] }]);

    network.defineNodeAttribute('vec4', AttributeType.Float, 4);
    network.withBufferAccess(() => {
      const vec = network.getNodeAttributeBuffer('vec4').view;
      vec.set([0, 0, 0, 1], nodes[0] * 4);
      vec.set([0.25, 0.5, 0.75, 1], nodes[1] * 4);
    });

    network.defineNodeToEdgeAttribute('vec4', 'edge_vec4_both', 'both', true);
    network.defineNodeToEdgeAttribute('vec4', 'edge_vec4_source', 'source', true);
    network.defineNodeToEdgeAttribute('vec4', 'edge_vec4_destination', 'destination', true);

    network.updateDenseEdgeIndexBuffer();
    network.updateDenseEdgeAttributeBuffer('edge_vec4_both');
    network.updateDenseEdgeAttributeBuffer('edge_vec4_source');
    network.updateDenseEdgeAttributeBuffer('edge_vec4_destination');

    const denseEdges = network.getDenseEdgeIndexView().view;
    assert.equal(denseEdges.length, edges.length);
    const denseIdx = 0;
    const edgeId = denseEdges[denseIdx];
    assert.equal(edgeId, edges[0]);

    const readPair = (name) => {
      const dense = network.getDenseEdgeAttributeView(name);
      assert.ok(dense?.view);
      const view = dense.view;
      const base = denseIdx * 8;
      const start = Array.from(view.subarray(base, base + 4));
      const end = Array.from(view.subarray(base + 4, base + 8));
      return { start, end };
    };

    const srcExpected = [0, 0, 0, 1];
    const dstExpected = [0.25, 0.5, 0.75, 1];

    const both = readPair('edge_vec4_both');
    assert.deepEqual(both.start, srcExpected);
    assert.deepEqual(both.end, dstExpected);

    const source = readPair('edge_vec4_source');
    assert.deepEqual(source.start, srcExpected);
    assert.deepEqual(source.end, srcExpected);

    const dest = readPair('edge_vec4_destination');
    assert.deepEqual(dest.start, dstExpected);
    assert.deepEqual(dest.end, dstExpected);
  } finally {
    network.dispose();
  }
});

