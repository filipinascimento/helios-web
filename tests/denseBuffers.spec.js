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

  const visuals = new VisualAttributes(network);
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
  visuals.markAllDenseDirty();

  const edgeSegmentsDesc = network.updateDenseEdgeAttributeBuffer(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
  const edgeSegments = new Float32Array(
    edgeSegmentsDesc.view.buffer,
    edgeSegmentsDesc.pointer ?? edgeSegmentsDesc.view.byteOffset ?? 0,
    edgeSegmentsDesc.count * 6,
  );
  const edgeEndpointSizesDesc = network.updateDenseEdgeAttributeBuffer(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  const edgeEndpointSizes = new Float32Array(
    edgeEndpointSizesDesc.view.buffer,
    edgeEndpointSizesDesc.pointer ?? edgeEndpointSizesDesc.view.byteOffset ?? 0,
    edgeEndpointSizesDesc.count * 2,
  );
  const edgeWidthsDesc = network.updateDenseEdgeAttributeBuffer(EDGE_WIDTH_ATTRIBUTE);
  const edgeWidthsView = new Float32Array(
    edgeWidthsDesc.view.buffer,
    edgeWidthsDesc.pointer ?? edgeWidthsDesc.view.byteOffset ?? 0,
    edgeWidthsDesc.count,
  );
  const edgeIndexDesc = network.updateDenseEdgeIndexBuffer();
  const edgeIndices = new Uint32Array(
    edgeIndexDesc.view.buffer,
    edgeIndexDesc.pointer ?? edgeIndexDesc.view.byteOffset ?? 0,
    edgeIndexDesc.count,
  );

  const nodeIndexDesc = network.updateDenseNodeIndexBuffer();
  const nodeIndices = new Uint32Array(
    nodeIndexDesc.view.buffer,
    nodeIndexDesc.pointer ?? nodeIndexDesc.view.byteOffset ?? 0,
    nodeIndexDesc.count,
  );

  expect(edgeSegmentsDesc.count).toBeGreaterThanOrEqual(1);
  expect(edgeSegmentsDesc.count).toBe(edgeEndpointSizesDesc.count);
  expect(nodeIndexDesc.count).toBeGreaterThanOrEqual(2);
  expect(edgeIndices.length).toBeGreaterThanOrEqual(1);
  expect(Array.from(edgeSegments.slice(0, 6))).toEqual([10, 20, 0, 100, 200, 0]);
  expect(Array.from(edgeEndpointSizes.slice(0, 2))).toEqual([5, 7]);
  expect(Array.from(edgeWidthsView.slice(0, 1))).toEqual([2]);
  expect(Array.from(nodeIndices.slice(0, 2)).sort()).toEqual([nodes[0], nodes[1]].sort());
  expect(network.nodeValidRange.end - network.nodeValidRange.start).toBeGreaterThanOrEqual(2);
  expect(network.edgeValidRange.end - network.edgeValidRange.start).toBeGreaterThanOrEqual(1);
});
