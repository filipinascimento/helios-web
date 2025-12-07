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

  const nodeCount = 256;
  const nodes = network.addNodes(nodeCount);
  for (let i = 0; i < nodes.length; i += 1) {
    const value = Math.random();
    network.getNodeAttributeBuffer(nodeAttribute).view[nodes[i]] = value;
  }

  const edges = [];
  for (let i = 0; i < nodeCount * 3; i += 1) {
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

  const target = document.getElementById('app');
  const mode = resolveMode();
  const layoutType = resolveLayoutType();
  const heliosOptions = {
    container: target,
    layout: {
      type: 'worker',
      options: {
        layout: layoutType,
        mode,
        radius: 220*Math.sqrt(nodeCount/1000),
        depth: mode === '3d' ? 140 : 0,
        // Slightly stronger forces for the demo; tweak via query params if needed.
        kRepulsion: 3,
        kAttraction: 0.003,
        kGravity: 0.0008,
        repulsionStrategy: 'barnes-hut',
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

  helios.nodeMapper
    .channel('color')
    .from(nodeAttribute)
    .transform((v) => {
      const t = Math.max(0, Math.min(1, v ?? 0));
      return [t, 0.2, 1 - t, 1];
    })
    .done();
  helios.nodeMapper.channel('size').from(nodeAttribute).linear([0, 1], [6, 18]).done();
  // helios.edgeMapper
  //   .channel('color')
  //   .from(edgeAttribute)
  //   .transform((v) => {
  //     const t = Math.max(0, Math.min(1, v ?? 0));
  //     return [0.1, 0.3 + t * 0.5, 1 - t * 0.5, 0.9];
  //   })
  //   .done();
  helios.edgeMapper.channel('width').constant(1.5).done();
  // Make edges visibly thicker for the demo.
  if (helios.renderer?.graphLayer) {
    helios.renderer.graphLayer.edgeWidthScale = 1.0;
    helios.renderer.graphLayer.edgeWidthBase = 0;
  }

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
