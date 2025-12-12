import { test, expect } from '@playwright/test';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
import {
  EDGE_COLOR_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
} from '../src/pipeline/constants.js';

test('dense buffers map nodes and edges with correct counts and data', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 1 });
  network.defineNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);
  network.defineNodeAttribute('_helios_visuals_color', AttributeType.Float, 4);
  network.defineNodeAttribute(NODE_SIZE_ATTRIBUTE, AttributeType.Float, 1);
  network.defineEdgeAttribute(EDGE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
  network.defineEdgeAttribute(EDGE_WIDTH_ATTRIBUTE, AttributeType.Float, 1);
  network.defineNodeToEdgeAttribute(NODE_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_POSITION_ATTRIBUTE, 'both');
  network.defineNodeToEdgeAttribute(NODE_SIZE_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE, 'both');

  const nodes = network.addNodes(2);
  const visuals = new VisualAttributes(network);
  const positions = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
  const sizes = network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE).view;
  positions.set([10, 20, 0], nodes[0] * 3);
  positions.set([100, 200, 0], nodes[1] * 3);
  sizes[nodes[0]] = 5;
  sizes[nodes[1]] = 7;

  const edges = network.addEdges([{ from: nodes[0], to: nodes[1] }]);
  const edgeColors = network.getEdgeAttributeBuffer(EDGE_COLOR_ATTRIBUTE).view;
  const edgeWidths = network.getEdgeAttributeBuffer(EDGE_WIDTH_ATTRIBUTE).view;
  edgeColors.set([0.1, 0.2, 0.3, 0.4], edges[0] * 4);
  edgeWidths[edges[0]] = 2;
  visuals.markAllDenseDirty();

  network.updateDenseNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE);
  network.updateDenseNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE);
  network.updateDenseEdgeAttributeBuffer(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
  network.updateDenseEdgeAttributeBuffer(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  network.updateDenseEdgeAttributeBuffer(EDGE_WIDTH_ATTRIBUTE);
  network.updateDenseEdgeIndexBuffer();
  network.updateDenseNodeIndexBuffer();

  network.withBufferAccess(() => {
    const edgeSegmentsDesc = network.getDenseEdgeAttributeView(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    const edgeEndpointSizesDesc = network.getDenseEdgeAttributeView(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
    const edgeWidthsDesc = network.getDenseEdgeAttributeView(EDGE_WIDTH_ATTRIBUTE);
    const edgeIndexDesc = network.getDenseEdgeIndexView();
    const nodeIndexDesc = network.getDenseNodeIndexView();
    expect(edgeSegmentsDesc.count).toBeGreaterThanOrEqual(1);
    expect(edgeSegmentsDesc.count).toBe(edgeEndpointSizesDesc.count);
    expect(nodeIndexDesc.count).toBeGreaterThanOrEqual(2);
    expect(edgeIndexDesc.view.length).toBeGreaterThanOrEqual(1);
    expect(Array.from(edgeSegmentsDesc.view.slice(0, 6))).toEqual([10, 20, 0, 100, 200, 0]);
    expect(Array.from(edgeEndpointSizesDesc.view.slice(0, 2))).toEqual([5, 7]);
    expect(Array.from(edgeWidthsDesc.view.slice(0, 1))).toEqual([2]);
    expect(Array.from(nodeIndexDesc.view.slice(0, 2)).sort()).toEqual([nodes[0], nodes[1]].sort());
  });
  expect(network.nodeValidRange.end - network.nodeValidRange.start).toBeGreaterThanOrEqual(2);
  expect(network.edgeValidRange.end - network.edgeValidRange.start).toBeGreaterThanOrEqual(1);
});
