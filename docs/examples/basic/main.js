import HeliosNetwork, { AttributeType } from 'helios-network';
// When consuming the published package use `import { Helios } from 'helios-web-next';`
import { Helios } from '../../../src/index.js';

function resolveRendererPreference() {
  const params = new URLSearchParams(window.location.search);
  const renderer = params.get('renderer');
  if (renderer === 'webgl') return 'webgl';
  return null;
}

function resolveMode() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode');
  if (mode && mode.toLowerCase() === '3d') return '3d';
  return '2d';
}

function resolveLayoutType() {
  const params = new URLSearchParams(window.location.search);
  const layout = params.get('layout');
  if (!layout) return 'force3d';
  const normalized = layout.toLowerCase();
  if (normalized === 'jitter' || normalized === 'legacy') return 'jitter';
  return 'force3d';
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
  // Ensure visual attributes exist before seeding positions.
  network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 4);
  network.defineNodeAttribute('_helios_visuals_color', AttributeType.Float, 4);
  network.defineNodeAttribute('_helios_visuals_size', AttributeType.Float, 1);

  const nodeCount = 25600;
  const nodes = network.addNodes(nodeCount);
  for (let i = 0; i < nodes.length; i += 1) {
    const value = Math.random()*10000;
    network.getNodeAttributeBuffer(nodeAttribute).view[nodes[i]] = value;
  }

  const edges = [];
  for (let i = 0; i < nodeCount * 2; i += 1) {
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

  // Seed initial positions randomly before the animated layout takes over.
  const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
  const target = document.getElementById('app');
  const rect = target.getBoundingClientRect();
  const width = Math.max(1, rect.width || 640);
  const height = Math.max(1, rect.height || 480);
  for (let i = 0; i < nodeCount; i += 1) {
    const offset = i * 4;
    pos[offset] = Math.random() * width;
    pos[offset + 1] = Math.random() * height;
    pos[offset + 2] = 0;
    pos[offset + 3] = 1;
  }

  const mode = resolveMode();
  const layoutType = resolveLayoutType();
  const heliosOptions = {
    container: target,
    layout: {
      type: 'worker',
      options: {
        layout: layoutType,
        mode,
        radius: 900,
        depth: mode === '3d' ? 140 : 0,
        // Slightly stronger forces for the demo; tweak via query params if needed.
        kRepulsion: 3,
        kAttraction: 0.003,
        kGravity: 0.0008,
        repulsionStrategy: 'negative',
        negativesPerNode: 64,
        negativeSampling: true,
      },
    },
    mode,
    projection: 'perspective',
  };
  const rendererPreference = resolveRendererPreference();
  if (rendererPreference) {
    heliosOptions.renderer = rendererPreference;
  }

  const helios = new Helios(network, heliosOptions);
  await helios.ready;

  helios.attributeMappings.mapNodeAttributeToColor(nodeAttribute);
  helios.attributeMappings.mapEdgeAttributeToColor(edgeAttribute);

  const rendererType = helios.renderer?.device?.type ?? helios.renderer?.constructor?.name ?? 'unknown';
  diagnostics.ready = true;
  diagnostics.renderer = rendererType;
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
