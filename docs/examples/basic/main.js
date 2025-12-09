import HeliosNetwork, { AttributeType } from 'helios-network';
// When consuming the published package use `import { Helios } from 'helios-web-next';`
import { Helios, createColormapScale } from '../../../src/index.js';

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
  if (normalized === 'none' || normalized === 'static') return 'none';
  if (normalized === 'jitter' || normalized === 'legacy') return 'jitter';
  return 'force3d';
}

function resolveEdgeTransparencyMode() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('edgeTransparency');
  if (!mode) return 'alpha';
  const normalized = mode.toLowerCase();
  return normalized === 'weighted' ? 'weighted' : 'alpha';
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

  const nodeCount = 2560;
  const nodes = network.addNodes(nodeCount);
  for (let i = 0; i < nodes.length; i += 1) {
    const value = Math.random();
    network.getNodeAttributeBuffer(nodeAttribute).view[nodes[i]] = value;
  }

  function seedGridPositions() {
    // Predefine node positions so we can disable layout and still render nicely.
    // Allocate visuals buffers in case they are not already present.
    network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 3);
    network.defineNodeToEdgeAttribute('_helios_visuals_position', '_helios_visuals_edge_endpoints_position', 'both');
    const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;

    const is3D = mode === '3d';
    let minX = Infinity; let maxX = -Infinity;
    let minY = Infinity; let maxY = -Infinity;
    let minZ = Infinity; let maxZ = -Infinity;

    if (is3D) {
      const side = Math.ceil(Math.cbrt(nodeCount));
      const spacing = 10;
      for (let i = 0; i < nodeCount; i += 1) {
        const z = Math.floor(i / (side * side));
        const rem = i - z * side * side;
        const y = Math.floor(rem / side);
        const x = rem - y * side;
        const offset = i * 3;
        pos[offset] = x * spacing;
        pos[offset + 1] = y * spacing;
        pos[offset + 2] = z * spacing;
        if (pos[offset] < minX) minX = pos[offset]; if (pos[offset] > maxX) maxX = pos[offset];
        if (pos[offset + 1] < minY) minY = pos[offset + 1]; if (pos[offset + 1] > maxY) maxY = pos[offset + 1];
        if (pos[offset + 2] < minZ) minZ = pos[offset + 2]; if (pos[offset + 2] > maxZ) maxZ = pos[offset + 2];
      }
    } else {
      const side = Math.ceil(Math.sqrt(nodeCount));
      const spacing = 8; // Keep density reasonable even with many nodes.
      for (let i = 0; i < nodeCount; i += 1) {
        const row = Math.floor(i / side);
        const col = i - row * side;
        const offset = i * 3;
        pos[offset] = col * spacing;
        pos[offset + 1] = row * spacing;
        pos[offset + 2] = 0;
        if (pos[offset] < minX) minX = pos[offset]; if (pos[offset] > maxX) maxX = pos[offset];
        if (pos[offset + 1] < minY) minY = pos[offset + 1]; if (pos[offset + 1] > maxY) maxY = pos[offset + 1];
        if (pos[offset + 2] < minZ) minZ = pos[offset + 2]; if (pos[offset + 2] > maxZ) maxZ = pos[offset + 2];
      }
    }

    // Center the cloud around the origin so 2D/3D views stay balanced.
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    for (let i = 0; i < nodeCount; i += 1) {
      const offset = i * 3;
      pos[offset] -= centerX;
      pos[offset + 1] -= centerY;
      pos[offset + 2] -= centerZ;
    }
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
  const edgeTransparency = resolveEdgeTransparencyMode();
  const heliosOptions = {
    container: target,
    layout: layoutType === 'none'
      ? { type: 'static', options: { bounds: [-500, -500, 500, 500] } }
      : {
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
    transparencyModeEdges: edgeTransparency,
  };
  const rendererPreference = resolveRendererPreference();
  if (rendererPreference) {
    heliosOptions.renderer = rendererPreference;
  }

  if (layoutType === 'none') {
    seedGridPositions();
  }

  const helios = new Helios(network, heliosOptions);
  await helios.ready;

  // Showcase a colormap on nodes: map "weight" through a perceptual ramp.
  const nodeColormap = createColormapScale('cmasher:rainforest', { domain: [0, 1], alpha: 1 });
  helios.nodeMapper.channel('color').from(nodeAttribute).transform((v) => nodeColormap(v ?? 0)).done();
  helios.nodeMapper.channel('size').from(nodeAttribute).linear([0, 1], [1, 5]).done();
  // Now using the default edge color mapper.
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
