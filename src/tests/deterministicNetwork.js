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
  network.defineEdgeAttribute('_helios_visuals_edge_width', AttributeType.Float, 2);
  network.defineNodeToEdgeAttribute('_helios_visuals_position', '_helios_visuals_edge_endpoints_position', 'both');
  network.defineNodeToEdgeAttribute('_helios_visuals_size', '_helios_visuals_edge_endpoints_size', 'both');

  const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
  const color = network.getNodeAttributeBuffer('_helios_visuals_color').view;
  const size = network.getNodeAttributeBuffer('_helios_visuals_size').view;

  const positions = [
    [60, 60],
    [260, 60],
    [60, 260],
    [260, 260],
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
    pos[offset + 2] = 0;
    size[id] = 48;
  });

  // Add at least one edge so edge attribute buffers are allocated.
  network.addEdges([{ from: nodes[0], to: nodes[1] }]);

  const helios = new Helios(network, {
    container,
    renderer,
    clearColor: [0, 0, 0, 1],
    layout: { type: 'static', options: { bounds: [0, 0, 320, 320] } },
    mappers: null,
  });
  await helios.ready;

  // Re-apply colors and sizes after defaults may have run.
  const colorView = network.getNodeAttributeBuffer('_helios_visuals_color').view;
  const sizeView = network.getNodeAttributeBuffer('_helios_visuals_size').view;
  nodes.forEach((id, i) => {
    const cOffset = id * 4;
    const c = colors[i];
    colorView[cOffset] = c[0];
    colorView[cOffset + 1] = c[1];
    colorView[cOffset + 2] = c[2];
    colorView[cOffset + 3] = c[3];
    sizeView[id] = 48;
  });

  helios.visuals.markAllDenseDirty();
  helios.scheduler.requestGeometry();

  return { helios, colors };
}
