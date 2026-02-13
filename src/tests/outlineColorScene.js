import HeliosNetwork, { AttributeType } from 'helios-network';
import { Helios } from '../index.js';

/**
 * Builds a minimal 2-node scene to validate per-node outline width/color rendering.
 * @param {HTMLElement} container
 * @param {'webgl' | 'webgpu'} renderer
 */
export async function createOutlineColorHelios(container, renderer = 'webgl') {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });

  const NODE_POSITION_ATTRIBUTE = '_helios_visuals_position';
  const NODE_COLOR_ATTRIBUTE = '_helios_visuals_color';
  const NODE_SIZE_ATTRIBUTE = '_helios_visuals_size';
  const NODE_OUTLINE_WIDTH_ATTRIBUTE = '_helios_visuals_outline_width';
  const NODE_OUTLINE_COLOR_ATTRIBUTE = '_helios_visuals_outline_color';

  network.defineNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);
  network.defineNodeAttribute(NODE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
  network.defineNodeAttribute(NODE_SIZE_ATTRIBUTE, AttributeType.Float, 1);
  network.defineNodeAttribute(NODE_OUTLINE_WIDTH_ATTRIBUTE, AttributeType.Float, 1);
  network.defineNodeAttribute(NODE_OUTLINE_COLOR_ATTRIBUTE, AttributeType.Float, 4);

  const [n0, n1] = network.addNodes(2);

  // Add a single edge so both nodes are present in edge endpoint mapping.
  network.addEdges([{ from: n0, to: n1 }]);

  network.withBufferAccess(() => {
    const pos = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
    const color = network.getNodeAttributeBuffer(NODE_COLOR_ATTRIBUTE).view;
    const size = network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE).view;
    const outlineW = network.getNodeAttributeBuffer(NODE_OUTLINE_WIDTH_ATTRIBUTE).view;
    const outlineC = network.getNodeAttributeBuffer(NODE_OUTLINE_COLOR_ATTRIBUTE).view;

    pos.set([-70, 0, 0], n0 * 3);
    pos.set([70, 0, 0], n1 * 3);

    size[n0] = 70;
    size[n1] = 70;

    color.set([0.2, 0.2, 0.2, 1], n0 * 4);
    color.set([0.2, 0.2, 0.2, 1], n1 * 4);

    outlineW[n0] = 1;
    outlineW[n1] = 1;

    outlineC.set([1, 0, 0, 1], n0 * 4);
    outlineC.set([0, 1, 0, 1], n1 * 4);
  });

  const helios = new Helios(network, {
    container,
    renderer,
    clearColor: [0, 0, 0, 1],
    layout: { type: 'static', options: { bounds: [0, 0, 320, 320] } },
    mappers: null,
  });

  await helios.ready;

  // Re-apply visuals after Helios/VisualAttributes may have seeded defaults.
  network.withBufferAccess(() => {
    const pos = network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
    const color = network.getNodeAttributeBuffer(NODE_COLOR_ATTRIBUTE).view;
    const size = network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE).view;
    const outlineW = network.getNodeAttributeBuffer(NODE_OUTLINE_WIDTH_ATTRIBUTE).view;
    const outlineC = network.getNodeAttributeBuffer(NODE_OUTLINE_COLOR_ATTRIBUTE).view;

    pos.set([-70, 0, 0], n0 * 3);
    pos.set([70, 0, 0], n1 * 3);

    size[n0] = 70;
    size[n1] = 70;

    color.set([0.2, 0.2, 0.2, 1], n0 * 4);
    color.set([0.2, 0.2, 0.2, 1], n1 * 4);

    outlineW[n0] = 1;
    outlineW[n1] = 1;

    outlineC.set([1, 0, 0, 1], n0 * 4);
    outlineC.set([0, 1, 0, 1], n1 * 4);
  });

  helios.renderer?.camera?.setTarget?.([0, 0, 0]);
  helios.renderer?.camera?.setMode?.('2d');
  if (helios.renderer?.camera) {
    helios.renderer.camera.zoom = 2;
    helios.renderer.camera.updateMatrices?.();
  }

  // Ensure updated buffers are visible to the renderer before pixel reads.
  helios.visuals.bumpNodeAttributes(
    NODE_POSITION_ATTRIBUTE,
    NODE_COLOR_ATTRIBUTE,
    NODE_SIZE_ATTRIBUTE,
    NODE_OUTLINE_WIDTH_ATTRIBUTE,
    NODE_OUTLINE_COLOR_ATTRIBUTE,
  );
  helios.visuals.markPositionsDirty();
  helios.scheduler.requestGeometry();

  return { helios };
}
