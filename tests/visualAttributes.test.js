import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
import {
  NODE_POSITION_ATTRIBUTE,
  NODE_COLOR_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_ENDPOINTS_STATE_ATTRIBUTE,
} from '../src/pipeline/constants.js';

test('creates missing visual attributes with expected shapes', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  new VisualAttributes(network);

  const pos = network.getNodeAttributeInfo(NODE_POSITION_ATTRIBUTE);
  assert.equal(pos?.dimension, 3);
  assert.equal(pos?.type, AttributeType.Float);

  const color = network.getNodeAttributeInfo(NODE_COLOR_ATTRIBUTE);
  assert.equal(color?.dimension, 4);
  assert.equal(color?.type, AttributeType.Float);

  const size = network.getNodeAttributeInfo(NODE_SIZE_ATTRIBUTE);
  assert.equal(size?.dimension, 1);
  assert.equal(size?.type, AttributeType.Float);

  const state = network.getNodeAttributeInfo(NODE_STATE_ATTRIBUTE);
  assert.equal(state?.dimension, 1);
  assert.equal(state?.type, AttributeType.UnsignedInteger);

  const outlineColor = network.getNodeAttributeInfo(NODE_OUTLINE_COLOR_ATTRIBUTE);
  assert.equal(outlineColor?.dimension, 4);
  assert.equal(outlineColor?.type, AttributeType.Float);

  const outlineWidth = network.getNodeAttributeInfo(NODE_OUTLINE_WIDTH_ATTRIBUTE);
  assert.equal(outlineWidth?.dimension, 1);
  assert.equal(outlineWidth?.type, AttributeType.Float);

  const edgeColor = network.getEdgeAttributeInfo(EDGE_COLOR_ATTRIBUTE);
  assert.equal(edgeColor?.dimension, 8);
  assert.equal(edgeColor?.type, AttributeType.Float);

  const edgeOpacity = network.getEdgeAttributeInfo(EDGE_OPACITY_ATTRIBUTE);
  assert.equal(edgeOpacity?.dimension, 2);
  assert.equal(edgeOpacity?.type, AttributeType.Float);

  const edgeWidth = network.getEdgeAttributeInfo(EDGE_WIDTH_ATTRIBUTE);
  assert.equal(edgeWidth?.dimension, 2);
  assert.equal(edgeWidth?.type, AttributeType.Float);

  const edgeState = network.getEdgeAttributeInfo(EDGE_STATE_ATTRIBUTE);
  assert.equal(edgeState?.dimension, 1);
  assert.equal(edgeState?.type, AttributeType.UnsignedInteger);

  const endpointsPos = network.getEdgeAttributeInfo(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
  assert.equal(endpointsPos?.dimension, 6);
  assert.equal(endpointsPos?.type, AttributeType.Float);

  const endpointsSize = network.getEdgeAttributeInfo(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  assert.equal(endpointsSize?.dimension, 2);
  assert.equal(endpointsSize?.type, AttributeType.Float);

  const endpointsState = network.getEdgeAttributeInfo(EDGE_ENDPOINTS_STATE_ATTRIBUTE);
  assert.equal(endpointsState?.dimension, 2);
  assert.equal(endpointsState?.type, AttributeType.UnsignedInteger);
});

test('repairs incompatible visual attribute metadata', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  // Seed with wrong metadata.
  network.defineNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 2);
  network.defineEdgeAttribute(EDGE_COLOR_ATTRIBUTE, AttributeType.Integer, 3);
  network.defineEdgeAttribute(EDGE_OPACITY_ATTRIBUTE, AttributeType.Integer, 1);

  new VisualAttributes(network);

  const pos = network.getNodeAttributeInfo(NODE_POSITION_ATTRIBUTE);
  assert.equal(pos?.dimension, 3);
  assert.equal(pos?.type, AttributeType.Float);

  const edgeColor = network.getEdgeAttributeInfo(EDGE_COLOR_ATTRIBUTE);
  assert.equal(edgeColor?.dimension, 8);
  assert.equal(edgeColor?.type, AttributeType.Float);

  const edgeOpacity = network.getEdgeAttributeInfo(EDGE_OPACITY_ATTRIBUTE);
  assert.equal(edgeOpacity?.dimension, 2);
  assert.equal(edgeOpacity?.type, AttributeType.Float);
});

test('does not overwrite zeroed nodes when positions are already initialized', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  network.defineNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);
  const nodeCount = 10_649;
  network.addNodes(nodeCount);
  const targetId = Math.floor(nodeCount / 2);
  network.withBufferAccess(() => {
    const pos = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
    for (let i = 0; i < nodeCount; i += 1) {
      const offset = i * 3;
      pos[offset] = (i % 100) + 1;
      pos[offset + 1] = (i % 37) + 2;
      pos[offset + 2] = (i % 13) + 3;
    }
    // Intentionally place a single node at the origin.
    const originOffset = targetId * 3;
    pos[originOffset] = 0;
    pos[originOffset + 1] = 0;
    pos[originOffset + 2] = 0;
  });

  const visuals = new VisualAttributes(network);
  const before = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view.slice(targetId * 3, targetId * 3 + 3);
  visuals.seedMissingPositions({ width: 800, height: 600 });
  const after = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view.slice(targetId * 3, targetId * 3 + 3);

  assert.deepEqual(after, before);
});

test('seeds nodes when all positions are missing', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  network.defineNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);
  const nodeCount = 12;
  network.addNodes(nodeCount);

  const visuals = new VisualAttributes(network);
  visuals.seedMissingPositions({ width: 10, height: 20 });

  const pos = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
  let seeded = 0;
  for (let i = 0; i < nodeCount; i += 1) {
    const offset = i * 3;
    const x = pos[offset];
    const y = pos[offset + 1];
    const z = pos[offset + 2];
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    if (x !== 0 || y !== 0 || z !== 0) {
      seeded += 1;
    }
    assert.ok(x >= -5 && x <= 5);
    assert.ok(y >= -10 && y <= 10);
  }
  assert.equal(seeded, nodeCount);
});
