import HeliosNetwork, { AttributeType } from 'helios-network';
import { Helios } from '../index.js';

/**
 * Creates a deterministic Helios instance with four colored nodes placed at
 * fixed coordinates inside the provided container.
 * @param {HTMLElement} container
 * @param {'webgl' | 'webgpu'} [renderer]
 * @returns {Promise<{ helios: import('../Helios.js').Helios, colors: number[][] }>}
 */
export async function createDeterministicHelios(container, renderer = 'webgl') {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 1 });
  const nodes = network.addNodes(4);

  network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 3);
  network.defineNodeAttribute('_helios_visuals_color', AttributeType.Float, 4);
  network.defineNodeAttribute('_helios_visuals_size', AttributeType.Float, 1);
  network.defineEdgeAttribute('_helios_visuals_edge_color', AttributeType.Float, 8);
  network.defineEdgeAttribute('_helios_visuals_edge_opacity', AttributeType.Float, 2);
  network.defineEdgeAttribute('_helios_visuals_edge_width', AttributeType.Float, 2);
  network.defineNodeToEdgeAttribute('_helios_visuals_position', '_helios_visuals_edge_endpoints_position', 'both');
  network.defineNodeToEdgeAttribute('_helios_visuals_size', '_helios_visuals_edge_endpoints_size', 'both');

  const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
  const color = network.getNodeAttributeBuffer('_helios_visuals_color').view;
  const size = network.getNodeAttributeBuffer('_helios_visuals_size').view;

  // Keep nodes centered around the origin so any renderer/camera starts with all four visible.
  const positions = [
    [-80, -80],
    [80, -80],
    [-80, 80],
    [80, 80],
  ];
  const colors = [
    [1, 0.1, 0.1, 1],
    [0.1, 1, 0.1, 1],
    [0.1, 0.1, 1, 1],
    [0.95, 0.85, 0.2, 1],
  ];

  nodes.forEach((id, i) => {
    const offset = id * 3;
    pos[offset] = positions[i][0];
    pos[offset + 1] = positions[i][1];
    pos[offset + 2] = positions[i][2] ?? 0;
    size[id] = 48;
  });

  // Add a couple of edges so visuals are clear in snapshots.
  const edges = network.addEdges([
    { from: nodes[0], to: nodes[1] },
    { from: nodes[2], to: nodes[3] },
  ]);

  const helios = new Helios(network, {
    container,
    renderer,
    clearColor: [0, 0, 0, 1],
    layout: { type: 'static', options: { bounds: [0, 0, 320, 320] } },
    mappers: null,
  });
  await helios.ready;
  helios.renderer?.camera?.setTarget?.([0, 0, 0]);
  helios.renderer?.camera?.setMode?.('2d');

  // Re-apply colors and sizes after defaults may have run.
  const colorView = network.getNodeAttributeBuffer('_helios_visuals_color').view;
  const sizeView = network.getNodeAttributeBuffer('_helios_visuals_size').view;
  const edgeColorView = network.getEdgeAttributeBuffer('_helios_visuals_edge_color').view;
  const edgeWidthView = network.getEdgeAttributeBuffer('_helios_visuals_edge_width').view;
  const edgeOpacityView = network.getEdgeAttributeBuffer('_helios_visuals_edge_opacity')?.view;
  nodes.forEach((id, i) => {
    const cOffset = id * 4;
    const c = colors[i];
    colorView[cOffset] = c[0];
    colorView[cOffset + 1] = c[1];
    colorView[cOffset + 2] = c[2];
    colorView[cOffset + 3] = c[3];
    sizeView[id] = 48;
  });
  if (edgeColorView && edgeWidthView) {
    const writeColor = (edgeId, rgba) => {
      const offset = edgeId * 8;
      edgeColorView.set(rgba, offset);
      edgeColorView.set(rgba, offset + 4);
    };
    const writeWidth = (edgeId, value) => {
      const offset = edgeId * 2;
      edgeWidthView[offset] = value;
      edgeWidthView[offset + 1] = value;
    };
    writeColor(edges[0], [1, 0, 0, 1]);
    writeWidth(edges[0], 6);
    if (edges[1] != null) {
      writeColor(edges[1], [0, 0.3, 1, 1]);
      writeWidth(edges[1], 6);
    }
    if (edgeOpacityView) {
      edgeOpacityView.fill(1);
    }
    helios.visuals.bumpEdgeAttributes(
      '_helios_visuals_edge_color',
      '_helios_visuals_edge_width',
      '_helios_visuals_edge_opacity',
    );
  }

  helios.visuals.markAllDenseDirty();
  helios.scheduler.requestGeometry();

  return { helios, colors };
}
