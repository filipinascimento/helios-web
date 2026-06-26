import HeliosNetwork from 'helios-network';
import { Helios } from '../index.js';

export async function createThemeProbeHelios(container, options = {}) {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 1, initialEdges: 0 });
  const helios = new Helios(network, {
    container,
    renderer: 'webgl',
    layout: { type: 'static', options: { bounds: [-10, -10, 10, 10] } },
    mappers: null,
    storage: false,
    session: false,
    startup: false,
    ui: true,
    quickControls: true,
    ...options,
  });
  await helios.ready;
  return helios;
}
