import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork, { AttributeType } from 'helios-network';

function decodePacked(view, index = 0) {
  const base = index * 4;
  const value = view[base]
    + (view[base + 1] << 8)
    + (view[base + 2] << 16)
    + (view[base + 3] << 24);
  return value - 1;
}

test('color-encoded dense buffers are provided for nodes and edges (attributes and $index)', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  const nodeAttr = 'node_int';
  const edgeAttr = 'edge_int';
  const encodedNode = 'encoded_node_int';
  const encodedEdge = 'encoded_edge_int';
  const encodedNodeIndex = 'encoded_node_index';
  const encodedEdgeIndex = 'encoded_edge_index';

  network.defineNodeAttribute(nodeAttr, AttributeType.Integer, 1);
  network.defineEdgeAttribute(edgeAttr, AttributeType.Integer, 1);

  const nodes = network.addNodes(3);
  const edges = network.addEdges([
    { from: nodes[0], to: nodes[1] },
    { from: nodes[1], to: nodes[2] },
  ]);

  network.withBufferAccess(() => {
    const nodeView = network.getNodeAttributeBuffer(nodeAttr).view;
    nodeView[nodes[0]] = BigInt(10);
    nodeView[nodes[1]] = BigInt(20);
    nodeView[nodes[2]] = BigInt(30);
    const edgeView = network.getEdgeAttributeBuffer(edgeAttr).view;
    edgeView[edges[0]] = BigInt(5);
    edgeView[edges[1]] = BigInt(15);
  });

  network.defineDenseColorEncodedNodeAttribute(nodeAttr, encodedNode);
  network.defineDenseColorEncodedEdgeAttribute(edgeAttr, encodedEdge);
  network.defineDenseColorEncodedNodeAttribute('$index', encodedNodeIndex);
  network.defineDenseColorEncodedEdgeAttribute('$index', encodedEdgeIndex);

  network.updateDenseNodeIndexBuffer();
  network.updateDenseEdgeIndexBuffer();

  const nodeEncodedDesc = network.updateDenseColorEncodedNodeAttribute(encodedNode);
  const edgeEncodedDesc = network.updateDenseColorEncodedEdgeAttribute(encodedEdge);
  const nodeIndexDesc = network.updateDenseColorEncodedNodeAttribute(encodedNodeIndex);
  const edgeIndexDesc = network.updateDenseColorEncodedEdgeAttribute(encodedEdgeIndex);

  network.withBufferAccess(() => {
    const nodeEncodedView = network.getDenseColorEncodedNodeAttributeView(encodedNode)?.view ?? nodeEncodedDesc?.view;
    const edgeEncodedView = network.getDenseColorEncodedEdgeAttributeView(encodedEdge)?.view ?? edgeEncodedDesc?.view;
    const nodeIndexView = network.getDenseColorEncodedNodeAttributeView(encodedNodeIndex)?.view ?? nodeIndexDesc?.view;
    const edgeIndexView = network.getDenseColorEncodedEdgeAttributeView(encodedEdgeIndex)?.view ?? edgeIndexDesc?.view;

    assert.ok(nodeEncodedView instanceof Uint8Array);
    assert.ok(edgeEncodedView instanceof Uint8Array);
    assert.ok(nodeIndexView instanceof Uint8Array);
    assert.ok(edgeIndexView instanceof Uint8Array);

    assert.equal(nodeEncodedView.length, nodes.length * 4);
    assert.equal(edgeEncodedView.length, edges.length * 4);
    assert.equal(nodeIndexView.length, nodes.length * 4);
    assert.equal(edgeIndexView.length, edges.length * 4);

    assert.equal(decodePacked(nodeEncodedView, 0), 10);
    assert.equal(decodePacked(nodeEncodedView, 1), 20);
    assert.equal(decodePacked(edgeEncodedView, 0), 5);
    assert.equal(decodePacked(edgeEncodedView, 1), 15);

    // $index encoding should recover dense ids.
    assert.equal(decodePacked(nodeIndexView, 0), nodes[0]);
    assert.equal(decodePacked(edgeIndexView, 0), edges[0]);
  });
});
