import HeliosNetwork, { AttributeType } from 'helios-network';
// When consuming the published package use `import { Helios } from 'helios-web-next';`
import { Helios, createColormapScale } from '../../../src/index.js';

// Set this to an object like { helios: true, mapper: true, scheduler: true } to re-enable debug logs.
const DEBUG_CONFIG = null;
window.__HELIOS_DEBUG__ = DEBUG_CONFIG;

const DEFAULT_NODE_COUNT = (() => {
  const fromEnv = Number(import.meta?.env?.VITE_NODE_COUNT ?? Number.NaN);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.floor(fromEnv);
  }
  return 2_000;
})();

function resolveRendererPreference() {
  const params = new URLSearchParams(window.location.search);
  const renderer = params.get('renderer');
  if (renderer === 'webgl') return 'webgl';
  if (renderer === 'webgpu') return 'webgpu';
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
  switch (normalized) {
    case 'weighted':
    case 'additive':
    case 'screen':
    case 'max':
    case 'additive-normalized':
    case 'additive-tonemapped':
    case 'additive-normalized-bright':
      return normalized;
    default:
      return 'alpha';
  }
}

function resolveNodeCount() {
  const params = new URLSearchParams(window.location.search);
  const value = Number(params.get('nodes') ?? params.get('nodeCount'));
  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_NODE_COUNT;
}

function resolvePickTestMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get('pickTest') === '1';
}

async function bootstrap() {
  const diagnostics = {
    ready: false,
    renderer: 'pending',
    nodeCount: 0,
    edgeCount: 0,
  };
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;
  console.log("Creating Helios network...");
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0 });

  console.log("Defining attributes...");
  const nodeAttribute = 'weight';
  const edgeAttribute = 'intensity';
  network.defineNodeAttribute(nodeAttribute, AttributeType.Float);
  network.defineEdgeAttribute(edgeAttribute, AttributeType.Float);

  console.log("Adding nodes...");
  const nodeCount = resolveNodeCount();
  const pickTest = resolvePickTestMode();
  const nodes = network.addNodes(nodeCount);

  console.log("Filling node attributes...");
  network.withBufferAccess(() => {
    const view = network.getNodeAttributeBuffer(nodeAttribute).view;
    for (let i = 0; i < nodes.length; i += 1) {
      const value = Math.random();
      view[nodes[i]] = value;
    }
  });

  function seedGridPositions() {
    // Predefine node positions so we can disable layout and still render nicely.
    // Allocate visuals buffers in case they are not already present.
    network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 3);
    network.withBufferAccess(() => {
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
    });
  }

  // const edges = [];
  // const expectedDegree = 3;
  // const probability = expectedDegree / nodeCount;
  // for (let i = 0; i < nodeCount; i += 1) {
  //   for (let j = i + 1; j < nodeCount; j += 1) {
  //     if (Math.random() < probability) {
  //       edges.push([nodes[i], nodes[j]]);
  //     }
  //   }
  // }

  // connect with the next 2 or 3 nodes to ensure connectivity
  // if 2d or 3d (try to follow the grid
  console.log("Adding edges...");
  let edges = [];
  const is3D = resolveMode() === '3d';
  const step = is3D ? 1 : 1;
  if (pickTest && nodeCount >= 2) {
    edges = [[nodes[0], nodes[3] ?? nodes[1]]];
    if (nodeCount >= 3) edges.push([nodes[1], nodes[2]]);
    if (nodeCount >= 4) edges.push([nodes[0], nodes[1]]);
  } else {
    for (let i = 0; i < nodeCount; i += 1) {
      for (let j = 1; j <= step; j += 1) {
        const to = (i + j) % nodeCount;
        edges.push([nodes[i], nodes[to]]);
      }
    }
  }

  // Trying adding another edge...
  // edges.push(nodes[0],nodes[100]);

  const edgeIds = network.addEdges(edges);
  // network node and edge count
  console.log("Created a network with nodes:", network.nodeCount, "edges:", network.edgeCount);
  
  console.log("Filling edge attribute...");
  network.withBufferAccess(() => {
    const edgeBuffer = network.getEdgeAttributeBuffer(edgeAttribute).view;
    for (const id of edgeIds) {
      edgeBuffer[id] = Math.random();
    }
  });

  console.log("Defining helios options...");
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
            center: [0, 0, 0],
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
    debug: DEBUG_CONFIG,
    // Warm up mapper application and dense buffers so first render is quick on large graphs.
    // prewarm: true,
    // prewarmDenseBuffers: true,
  };
  const rendererPreference = resolveRendererPreference();
  if (rendererPreference) {
    heliosOptions.renderer = rendererPreference;
  }


  if (layoutType === 'none') {
    console.log("No layout selected, seeding grid positions...");
    seedGridPositions();
  }
  
  console.log("Creating helios-web instance...");
  const helios = new Helios(network, heliosOptions);
  window.__helios = helios;

  console.log("Waiting for helios to be ready...");
  await helios.ready;
 

  console.log("Helios is ready!");
  // helios.renderer?.camera?.setTarget?.([0, 0, mode === '3d' ? 0 : 0]);
  if (pickTest && helios.renderer?.camera) {
    helios.renderer.camera.setMode?.('2d');
    helios.renderer.camera.zoom = 2;
    if (helios.renderer.camera.pan2D?.length >= 2) {
      helios.renderer.camera.pan2D[0] = 0;
      helios.renderer.camera.pan2D[1] = 0;
    }
    helios.renderer.camera.updateMatrices?.();
  }

  // Showcase a colormap on nodes: map "weight" through a perceptual ramp.
  console.log("Setting up mappers...");
  const nodeColormap = createColormapScale('cmasher:rainforest', { domain: [0, 1], alpha: 1 });

  console.log("  Node colors...");
  helios.nodeMapper.channel('color').from(nodeAttribute).transform((v) => nodeColormap(v ?? 0)).done();

  console.log("  Node sizes...");
  if (pickTest) {
    helios.nodeMapper.channel('size').constant(14).done();
  } else {
    helios.nodeMapper.channel('size').from(nodeAttribute).linear([0, 1], [1, 4]).done();
  }

  // Now using the default edge color mapper.
  // uncomment below to use a custom edge color mapper
  // console.log("  Edge color mapper...");
  // helios.edgeMapper
  //   .channel('color')
  //   .from(edgeAttribute)
  //   .transform((v) => {
  //     const t = Math.max(0, Math.min(1, v ?? 0));
  //     return [0.1, 0.3 + t * 0.5, 1 - t * 0.5, 0.9];
  //   })
  //   .done();
  console.log("  Edge width mapper...");
  helios.edgeMapper.channel('width').constant(1.5).done();

  console.log("Changing edge scaling...");
  // Make edges visibly thicker for the demo.
  if (helios.renderer?.graphLayer) {
    helios.renderer.graphLayer.edgeWidthScale = 1.0;
    helios.renderer.graphLayer.edgeWidthBase = 0;
  }

  console.log("Enabling attribute tracking for picking (auto-update, scaled)...");
  helios.enableAttributeTracking('$index', '$index', {
    resolutionScale: 1.0,
    trackDepth: true,
    autoUpdate: true,
    autoUpdateMaxFps: 1,
  });
  const canvas = helios.layers?.canvas ?? helios.renderer?.canvas ?? document.querySelector('canvas');
  if (canvas) {
    canvas.addEventListener('click', async (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const picked = await helios.pickAttributesAt(x, y);
      console.log('Picked node/edge indices', picked);
    });
  }

  if (pickTest) {
    await helios.renderAttributeTracking();
  }

  console.log("Misc diagnostics...");
  const rendererType = helios.renderer?.device?.type ?? helios.renderer?.constructor?.name ?? 'unknown';
  diagnostics.ready = true;
  diagnostics.renderer = rendererType;
  diagnostics.nodeCount = nodes.length;
  diagnostics.edgeCount = edgeIds.length;
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;
  window.__helios = helios;
  console.log("Done! Helios instance is available as window.__helios", helios);
  const m = window.__helios?.network?.module;
  console.log("HEAP SIZE: ",m?.HEAPU8?.buffer?.byteLength, 'bytes');
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Helios', error);
  window.__HELIOS_DIAGNOSTICS__ = {
    ready: false,
    error: error?.message ?? String(error),
  };
});
