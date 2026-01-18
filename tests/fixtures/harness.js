import HeliosNetwork, { AttributeType } from 'helios-network';
import { Helios, HeliosUI } from '/src/index.js';

function resolveRendererPreference(params) {
  const renderer = params.get('renderer');
  if (renderer === 'webgl') return 'webgl';
  if (renderer === 'webgpu') return 'webgpu';
  return null;
}

function resolveMode(params) {
  const mode = params.get('mode');
  if (mode && mode.toLowerCase() === '3d') return '3d';
  return '2d';
}

function resolveLayoutType(params) {
  const layout = params.get('layout');
  if (!layout) return 'force3d';
  const normalized = layout.toLowerCase();
  if (normalized === 'none' || normalized === 'static') return 'none';
  if (normalized === 'jitter' || normalized === 'legacy') return 'jitter';
  return 'force3d';
}

function resolveNodeCount(params) {
  const value = Number(params.get('nodes') ?? params.get('nodeCount'));
  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return 200;
}

function resolvePickTestMode(params) {
  return params.get('pickTest') === '1';
}

function resolveMappersUi(params) {
  return params.get('mappers') === '1';
}

function seedGridPositions(network, nodeCount, mode) {
  network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 3);
  network.withBufferAccess(() => {
    const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
    const is3D = mode === '3d';
    if (is3D) {
      const side = Math.ceil(Math.cbrt(nodeCount));
      const spacing = 24;
      for (let i = 0; i < nodeCount; i += 1) {
        const z = Math.floor(i / (side * side));
        const rem = i - z * side * side;
        const y = Math.floor(rem / side);
        const x = rem - y * side;
        const offset = i * 3;
        pos[offset] = (x - side / 2) * spacing;
        pos[offset + 1] = (y - side / 2) * spacing;
        pos[offset + 2] = (z - side / 2) * spacing;
      }
    } else {
      const side = Math.ceil(Math.sqrt(nodeCount));
      const spacing = 24;
      for (let i = 0; i < nodeCount; i += 1) {
        const row = Math.floor(i / side);
        const col = i - row * side;
        const offset = i * 3;
        pos[offset] = (col - side / 2) * spacing;
        pos[offset + 1] = (row - side / 2) * spacing;
        pos[offset + 2] = 0;
      }
    }
  });
}

function seedRandomPositions(network, nodeCount, mode) {
  network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 3);
  network.withBufferAccess(() => {
    const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
    const depth = mode === '3d' ? 200 : 0;
    for (let i = 0; i < nodeCount; i += 1) {
      const offset = i * 3;
      pos[offset] = (Math.random() - 0.5) * 400;
      pos[offset + 1] = (Math.random() - 0.5) * 400;
      pos[offset + 2] = (Math.random() - 0.5) * depth;
    }
  });
}

function connectRing(network, nodes) {
  const edges = [];
  for (let i = 0; i < nodes.length; i += 1) {
    edges.push([nodes[i], nodes[(i + 1) % nodes.length]]);
  }
  return network.addEdges(edges);
}

export async function bootstrapDemoFixture() {
  const diagnostics = { ready: false, renderer: 'pending', nodeCount: 0, edgeCount: 0 };
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = resolveMode(params);
    const layoutType = resolveLayoutType(params);
    const nodeCount = resolveNodeCount(params);
    const pickTest = resolvePickTestMode(params);
    const mappersUi = resolveMappersUi(params);
    const rendererPreference = resolveRendererPreference(params);

    const container = document.getElementById('app');
    const network = await HeliosNetwork.create({ directed: false, initialNodes: 0 });

    // Define key visuals attributes upfront so tests relying on them behave consistently.
    network.defineNodeAttribute('_helios_visuals_size', AttributeType.Float, 1);
    network.defineNodeAttribute('_helios_visuals_color', AttributeType.Float, 4);
    network.defineEdgeAttribute('_helios_visuals_edge_color', AttributeType.Float, 8);
    network.defineEdgeAttribute('_helios_visuals_edge_width', AttributeType.Float, 2);

    const nodes = network.addNodes(nodeCount);
    const edgeIds = connectRing(network, nodes);

    network.withBufferAccess(() => {
      const size = network.getNodeAttributeBuffer('_helios_visuals_size').view;
      const color = network.getNodeAttributeBuffer('_helios_visuals_color').view;
      const edgeColor = network.getEdgeAttributeBuffer('_helios_visuals_edge_color').view;
      const edgeWidth = network.getEdgeAttributeBuffer('_helios_visuals_edge_width').view;

      for (let i = 0; i < nodes.length; i += 1) {
        const id = nodes[i];
        size[id] = pickTest ? 28 : 10;
        const c = [(i * 97) % 255, (i * 57) % 255, (i * 17) % 255].map((v) => (v / 255) * 0.9 + 0.1);
        const offset = id * 4;
        color[offset] = c[0];
        color[offset + 1] = c[1];
        color[offset + 2] = c[2];
        color[offset + 3] = 1;
      }

      // Make edges visible but subtle.
      for (const edgeId of edgeIds) {
        const offset = edgeId * 8;
        edgeColor.set([0.35, 0.55, 1.0, 0.5, 0.35, 0.55, 1.0, 0.5], offset);
        const wOffset = edgeId * 2;
        edgeWidth[wOffset] = 1.5;
        edgeWidth[wOffset + 1] = 1.5;
      }
    });

    if (layoutType === 'none') {
      seedGridPositions(network, nodeCount, mode);
    } else {
      seedRandomPositions(network, nodeCount, mode);
    }

    const heliosOptions = {
      container,
      mode,
      clearColor: [0, 0, 0, 1],
      projection: 'perspective',
      layout: layoutType === 'none'
        ? { type: 'static', options: { bounds: [-500, -500, 500, 500] } }
        : {
            type: 'worker',
            options: {
              layout: layoutType,
              mode,
              center: [0, 0, 0],
              radius: 220,
              depth: mode === '3d' ? 140 : 0,
              kRepulsion: 2,
              kAttraction: 0.004,
              kGravity: 0.0008,
              repulsionStrategy: 'barnes-hut',
              negativesPerNode: 32,
              negativeSampling: true,
            },
          },
    };
    if (rendererPreference) {
      heliosOptions.renderer = rendererPreference;
    }

    const helios = new Helios(network, heliosOptions);
    window.__helios = helios;
    await helios.ready;

    if (mappersUi) {
      const heliosUI = new HeliosUI({ helios, theme: 'dark', allowDrag: false });
      heliosUI.createMappersPanel({ dock: 'top-left', position: { x: 8, y: 8 } });
      window.__heliosUI = heliosUI;
    }

    if (pickTest && helios.renderer?.camera) {
      helios.renderer.camera.setMode?.('2d');
      helios.renderer.camera.zoom = 2;
      if (helios.renderer.camera.pan2D?.length >= 2) {
        helios.renderer.camera.pan2D[0] = 0;
        helios.renderer.camera.pan2D[1] = 0;
      }
      helios.renderer.camera.updateMatrices?.();
    }

    helios.enableAttributeTracking('$index', '$index', {
      resolutionScale: 1,
      trackDepth: true,
      autoUpdate: true,
      autoUpdateMaxFps: 60,
    });

    // Keep compatibility with tests that expect pick helpers to be available.
    helios.enableNodePicking?.({ resolutionScale: 1, trackDepth: true, maxFps: 60 });
    helios.enableEdgePicking?.({ resolutionScale: 1, trackDepth: true, maxFps: 60 });

    if (pickTest) {
      await helios.renderAttributeTracking?.();
    }

    const rendererType = helios.renderer?.device?.type ?? helios.renderer?.constructor?.name ?? 'unknown';
    diagnostics.ready = true;
    diagnostics.renderer = rendererType;
    diagnostics.nodeCount = network.nodeCount;
    diagnostics.edgeCount = network.edgeCount;
    window.__HELIOS_DIAGNOSTICS__ = diagnostics;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to bootstrap demo fixture', error);
    window.__HELIOS_DIAGNOSTICS__ = {
      ready: false,
      error: error?.message ?? String(error),
    };
    window.__heliosError = error?.stack ?? error?.message ?? String(error);
  }
}
