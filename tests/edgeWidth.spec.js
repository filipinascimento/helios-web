import { test, expect } from '@playwright/test';
import HeliosNetwork from 'helios-network';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
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

  visuals.markAllDenseDirty();
  const edgeSegmentsDesc = network.updateDenseEdgeAttributeBuffer(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
  const denseEdgesSegments = new Float32Array(
    edgeSegmentsDesc.view.buffer,
    edgeSegmentsDesc.pointer ?? edgeSegmentsDesc.view.byteOffset ?? 0,
    edgeSegmentsDesc.count * 6,
  );
  const edgeEndpointSizesDesc = network.updateDenseEdgeAttributeBuffer(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  const denseEdgeSizes = new Float32Array(
    edgeEndpointSizesDesc.view.buffer,
    edgeEndpointSizesDesc.pointer ?? edgeEndpointSizesDesc.view.byteOffset ?? 0,
    edgeEndpointSizesDesc.count * 2,
  );
  const edgeWidthsDesc = network.updateDenseEdgeAttributeBuffer(EDGE_WIDTH_ATTRIBUTE);
  const denseEdgeWidths = new Float32Array(
    edgeWidthsDesc.view.buffer,
    edgeWidthsDesc.pointer ?? edgeWidthsDesc.view.byteOffset ?? 0,
    edgeWidthsDesc.count,
  );
  const edgeIndexDesc = network.updateDenseEdgeIndexBuffer();
  const denseEdgeIndices = new Uint32Array(
    edgeIndexDesc.view.buffer,
    edgeIndexDesc.pointer ?? edgeIndexDesc.view.byteOffset ?? 0,
    edgeIndexDesc.count,
  );

  expect(edgeSegmentsDesc.count).toBeGreaterThanOrEqual(1);
  expect(Array.from(denseEdgeIndices.slice(0, 1))).toEqual([edges[0]]);
  expect(Array.from(denseEdgesSegments.slice(0, 6))).toEqual([0, 0, 0, 10, 0, 0]);
  expect(Array.from(denseEdgeSizes.slice(0, 2))).toEqual([4, 6]);
  expect(Array.from(denseEdgeWidths.slice(0, 1))).toEqual([3.5]);
});
