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

test('dense buffers map nodes and edges with correct counts and data', async () => {
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
  positions.set([10, 20, 0], nodes[0] * 3);
  positions.set([100, 200, 0], nodes[1] * 3);
  sizes[nodes[0]] = 5;
  sizes[nodes[1]] = 7;

  const edges = network.addEdges([{ from: nodes[0], to: nodes[1] }]);
  if (network.edgeActivityView) {
    network.edgeActivityView.fill(0);
    network.edgeActivityView[edges[0]] = 1;
  }
  const edgeColors = network.getEdgeAttributeBuffer(EDGE_COLOR_ATTRIBUTE).view;
  const edgeWidths = network.getEdgeAttributeBuffer(EDGE_WIDTH_ATTRIBUTE).view;
  edgeColors.set([0.1, 0.2, 0.3, 0.4], edges[0] * 4);
  edgeWidths[edges[0]] = 2;
  mapper.markAllDenseDirty();
  const geometry = mapper.buildDenseGeometry();

  expect(geometry.nodes.count).toBeGreaterThanOrEqual(2);
  expect(geometry.edges.count).toBeGreaterThanOrEqual(1);
  expect(geometry.nodes.indices.length).toBeGreaterThanOrEqual(2);
  expect(geometry.edges.indices.length).toBeGreaterThanOrEqual(1);
  expect(Array.from(geometry.edges.segments.slice(0, 6))).toEqual([10, 20, 0, 100, 200, 0]);
  expect(Array.from(geometry.edges.endpointSizes.slice(0, 2))).toEqual([5, 7]);
  expect(Array.from(geometry.edges.widths.slice(0, 1))).toEqual([2]);
  expect(network.nodeValidRange.end - network.nodeValidRange.start).toBeGreaterThanOrEqual(2);
  expect(network.edgeValidRange.end - network.edgeValidRange.start).toBeGreaterThanOrEqual(1);
});
