import HeliosNetwork from 'helios-network';
import { Helios } from '../../../src/index.js';

const container = document.querySelector('#app');

const network = await HeliosNetwork.create({
  directed: false,
  initialNodes: 8,
  initialEdges: 10,
});

network.addEdges(new Uint32Array([
  0, 1,
  1, 2,
  2, 3,
  3, 4,
  4, 5,
  5, 6,
  6, 7,
  7, 0,
  0, 4,
  2, 6,
]));

const helios = new Helios(network, {
  container,
  renderer: new URLSearchParams(window.location.search).get('renderer') || undefined,
  layout: {
    type: 'jitter',
    autoStart: true,
  },
  ui: false,
});

await helios.ready;
helios.frameNetwork({ animate: false });
window.__helios = helios;
