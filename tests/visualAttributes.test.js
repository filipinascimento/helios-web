import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
import {
  NODE_POSITION_ATTRIBUTE,
  NODE_COLOR_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
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

  const endpointsPos = network.getEdgeAttributeInfo(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
  assert.equal(endpointsPos?.dimension, 6);
  assert.equal(endpointsPos?.type, AttributeType.Float);

  const endpointsSize = network.getEdgeAttributeInfo(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  assert.equal(endpointsSize?.dimension, 2);
  assert.equal(endpointsSize?.type, AttributeType.Float);
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
