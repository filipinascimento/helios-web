import HeliosNetwork, { AttributeType } from 'helios-network';
// When consuming the published package use `import { Helios } from 'helios-web-next';`
import { Helios } from '../../../src/index.js';

function resolveRendererPreference() {
  const params = new URLSearchParams(window.location.search);
  const renderer = params.get('renderer');
  if (renderer === 'webgl') return 'webgl';
  return null;
}

async function bootstrap() {
  const diagnostics = {
    ready: false,
    renderer: 'pending',
    nodeCount: 0,
    edgeCount: 0,
  };
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;

  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0 });
  const nodeAttribute = 'weight';
  const edgeAttribute = 'intensity';
  network.defineNodeAttribute(nodeAttribute, AttributeType.Float);
  network.defineEdgeAttribute(edgeAttribute, AttributeType.Float);

  const nodeCount = 64;
  const nodes = network.addNodes(nodeCount);
  for (let i = 0; i < nodes.length; i += 1) {
    const value = Math.random();
    network.getNodeAttributeBuffer(nodeAttribute).view[nodes[i]] = value;
  }

  const edges = [];
  for (let i = 0; i < nodeCount * 1.5; i += 1) {
    const from = Math.floor(Math.random() * nodeCount);
    const to = Math.floor(Math.random() * nodeCount);
    if (from === to) continue;
    edges.push({ from, to });
  }
  const edgeIds = network.addEdges(edges);
  const edgeBuffer = network.getEdgeAttributeBuffer(edgeAttribute).view;
  for (const id of edgeIds) {
    edgeBuffer[id] = Math.random();
  }

  const heliosOptions = {
    container: document.getElementById('app'),
    layout: { type: 'worker', options: { radius: 180 } },
  };
  const rendererPreference = resolveRendererPreference();
  if (rendererPreference) {
    heliosOptions.renderer = rendererPreference;
  }

  const helios = new Helios(network, heliosOptions);
  await helios.ready;

  helios.attributeMappings.mapNodeAttributeToColor(nodeAttribute);
  helios.attributeMappings.mapEdgeAttributeToColor(edgeAttribute);

  diagnostics.ready = true;
  diagnostics.renderer = helios.renderer?.constructor?.name ?? 'unknown';
  diagnostics.nodeCount = nodes.length;
  diagnostics.edgeCount = edgeIds.length;
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;
  window.__helios = helios;
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Helios', error);
  window.__HELIOS_DIAGNOSTICS__ = {
    ready: false,
    error: error?.message ?? String(error),
  };
});
