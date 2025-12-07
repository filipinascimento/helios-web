import { test, expect } from '@playwright/test';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { VisualAttributeMapper } from '../src/pipeline/VisualAttributeMapper.js';
import {
  EDGE_COLOR_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
} from '../src/pipeline/constants.js';

test('edge widths and endpoint data propagate into dense buffers', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 2, initialEdges: 1 });
  network.nodeActivityView?.fill(0);
  network.edgeActivityView?.fill(0);

  network.defineNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);
  network.defineNodeAttribute('_helios_visuals_color', AttributeType.Float, 4);
  network.defineNodeAttribute(NODE_SIZE_ATTRIBUTE, AttributeType.Float, 1);
  network.defineEdgeAttribute(EDGE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
  network.defineEdgeAttribute(EDGE_WIDTH_ATTRIBUTE, AttributeType.Float, 1);
  network.defineNodeToEdgeAttribute(NODE_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_POSITION_ATTRIBUTE, 'both');
  network.defineNodeToEdgeAttribute(NODE_SIZE_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE, 'both');

  const mapper = new VisualAttributeMapper(network);

  const nodes = network.addNodes(2);
  if (network.nodeActivityView) {
    network.nodeActivityView.fill(0);
    nodes.forEach((id) => {
      network.nodeActivityView[id] = 1;
    });
  }
  const positions = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
  const sizes = network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE).view;
  positions.set([0, 0, 0], nodes[0] * 3);
  positions.set([10, 0, 0], nodes[1] * 3);
  sizes[nodes[0]] = 4;
  sizes[nodes[1]] = 6;

  const edges = network.addEdges([{ from: nodes[0], to: nodes[1] }]);
  if (network.edgeActivityView) {
    network.edgeActivityView.fill(0);
    network.edgeActivityView[edges[0]] = 1;
  }
  const edgeWidths = network.getEdgeAttributeBuffer(EDGE_WIDTH_ATTRIBUTE).view;
  const edgeColors = network.getEdgeAttributeBuffer(EDGE_COLOR_ATTRIBUTE).view;
  edgeWidths[edges[0]] = 3.5;
  edgeColors.set([0.2, 0.2, 0.2, 1], edges[0] * 4);

  mapper.markAllDenseDirty();
  const geometry = mapper.buildDenseGeometry();
  const { edges: denseEdges } = geometry;

  expect(denseEdges.count).toBeGreaterThanOrEqual(1);
  expect(Array.from(denseEdges.indices.slice(0, 1))).toEqual([edges[0]]);
  expect(Array.from(denseEdges.segments.slice(0, 6))).toEqual([0, 0, 0, 10, 0, 0]);
  expect(Array.from(denseEdges.endpointSizes.slice(0, 2))).toEqual([4, 6]);
  expect(Array.from(denseEdges.widths.slice(0, 1))).toEqual([3.5]);
});
