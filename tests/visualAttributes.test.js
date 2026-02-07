import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
import { Mapper, MapperCollection } from '../src/pipeline/Mapper.js';
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

test('creates required visual attributes with expected shapes', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  new VisualAttributes(network);

  const pos = network.getNodeAttributeInfo(NODE_POSITION_ATTRIBUTE);
  assert.equal(pos?.dimension, 3);
  assert.equal(pos?.type, AttributeType.Float);

  const state = network.getNodeAttributeInfo(NODE_STATE_ATTRIBUTE);
  assert.equal(state?.dimension, 1);
  assert.equal(state?.type, AttributeType.UnsignedInteger);

  const edgeState = network.getEdgeAttributeInfo(EDGE_STATE_ATTRIBUTE);
  assert.equal(edgeState?.dimension, 1);
  assert.equal(edgeState?.type, AttributeType.UnsignedInteger);

  const endpointsPos = network.getEdgeAttributeInfo(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
  assert.equal(endpointsPos?.dimension, 6);
  assert.equal(endpointsPos?.type, AttributeType.Float);

  const endpointsState = network.getEdgeAttributeInfo(EDGE_ENDPOINTS_STATE_ATTRIBUTE);
  assert.equal(endpointsState?.dimension, 2);
  assert.equal(endpointsState?.type, AttributeType.UnsignedInteger);

  assert.equal(network.hasNodeAttribute(NODE_COLOR_ATTRIBUTE), false);
  assert.equal(network.hasNodeAttribute(NODE_SIZE_ATTRIBUTE), false);
  assert.equal(network.hasNodeAttribute(NODE_OUTLINE_COLOR_ATTRIBUTE), false);
  assert.equal(network.hasNodeAttribute(NODE_OUTLINE_WIDTH_ATTRIBUTE), false);
  assert.equal(network.hasEdgeAttribute(EDGE_COLOR_ATTRIBUTE, true), false);
  assert.equal(network.hasEdgeAttribute(EDGE_OPACITY_ATTRIBUTE, true), false);
  assert.equal(network.hasEdgeAttribute(EDGE_WIDTH_ATTRIBUTE, true), false);
  assert.equal(network.hasEdgeAttribute(EDGE_ENDPOINTS_SIZE_ATTRIBUTE, true), false);
});

test('repairs incompatible visual attribute metadata', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  // Seed with wrong metadata.
  network.defineNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 2);
  network.defineEdgeAttribute(EDGE_STATE_ATTRIBUTE, AttributeType.Float, 2);

  new VisualAttributes(network);

  const pos = network.getNodeAttributeInfo(NODE_POSITION_ATTRIBUTE);
  assert.equal(pos?.dimension, 3);
  assert.equal(pos?.type, AttributeType.Float);

  const edgeState = network.getEdgeAttributeInfo(EDGE_STATE_ATTRIBUTE);
  assert.equal(edgeState?.dimension, 1);
  assert.equal(edgeState?.type, AttributeType.UnsignedInteger);
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

test('parses hex colors with alpha in toRgba', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  const visuals = new VisualAttributes(network);

  const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

  const redOpaque = visuals.toRgba('#ff0000ff');
  assert.ok(close(redOpaque[0], 1));
  assert.ok(close(redOpaque[1], 0));
  assert.ok(close(redOpaque[2], 0));
  assert.ok(close(redOpaque[3], 1));

  const blackTransparent = visuals.toRgba('#00000000');
  assert.ok(close(blackTransparent[0], 0));
  assert.ok(close(blackTransparent[1], 0));
  assert.ok(close(blackTransparent[2], 0));
  assert.ok(close(blackTransparent[3], 0));

  const short = visuals.toRgba('#0f08'); // #RGBA => r=0, g=255, b=0, a~0.533
  assert.ok(close(short[0], 0));
  assert.ok(close(short[1], 1));
  assert.ok(close(short[2], 0));
  assert.ok(close(short[3], 0x88 / 255));
});

test('constant mappers update uniform config without bumping buffer versions', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  const nodes = network.addNodes(3);
  network.addEdges([
    { from: nodes[0], to: nodes[1] },
    { from: nodes[1], to: nodes[2] },
  ]);

  const visuals = new VisualAttributes(network);

  const nodeMapper = new Mapper({ mode: 'node', network });
  nodeMapper.channel('size').constant(2.5).done();

  const edgeMapper = new Mapper({ mode: 'edge', network });
  edgeMapper.channel('width').constant(1.25).done();

  visuals.applyMappers({ nodeMapper, edgeMapper });

  assert.equal(network.__heliosVisualConfig?.node?.size?.mode, 'uniform');
  assert.equal(network.__heliosVisualConfig?.edge?.width?.mode, 'uniform');

  assert.equal(network.hasNodeAttribute(NODE_SIZE_ATTRIBUTE), false);
  assert.equal(network.hasEdgeAttribute(EDGE_WIDTH_ATTRIBUTE, true), false);
});

test('node-to-edge passthrough downgrades when node channel is constant', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  const nodes = network.addNodes(2);
  network.addEdges([{ from: nodes[0], to: nodes[1] }]);

  const visuals = new VisualAttributes(network);
  const nodeCollection = new MapperCollection('node', network, () => {});
  const edgeCollection = new MapperCollection('edge', network, () => {});

  nodeCollection.channel('color').constant('#ff0000').done();
  edgeCollection.channel('color').from('@node.color').nodeToEdge().done();

  const nodeMapper = nodeCollection.toCombinedMapper();
  const edgeMapper = edgeCollection.toCombinedMapper({ nodeMapper });
  visuals.applyMappers({ nodeMapper, edgeMapper });

  assert.equal(network.__heliosVisualConfig?.edge?.color?.mode, 'uniform');
  assert.equal(network.hasEdgeAttribute(EDGE_COLOR_ATTRIBUTE, true), false);
  if (typeof network.hasNodeToEdgeAttribute === 'function') {
    assert.equal(network.hasNodeToEdgeAttribute(EDGE_COLOR_ATTRIBUTE), false);
  }
});

test('visual config records node-sourced edge channels with custom node attributes', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  const nodes = network.addNodes(2);
  network.addEdges([{ from: nodes[0], to: nodes[1] }]);
  network.defineNodeAttribute('weight', AttributeType.Float, 1);

  const visuals = new VisualAttributes(network);
  const edgeMapper = new Mapper({ mode: 'edge', network });
  edgeMapper.channel('width').nodeAttribute('weight', 'source').done();

  visuals.applyMappers({ edgeMapper });

  const widthCfg = network.__heliosVisualConfig?.edge?.width;
  assert.equal(widthCfg?.mode, 'buffer');
  assert.equal(widthCfg?.source, 'node');
  assert.equal(widthCfg?.nodeAttribute, 'weight');
  assert.equal(widthCfg?.endpoints, 'source');
  assert.equal(widthCfg?.doubleWidth, true);
});
