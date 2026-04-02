import HeliosNetwork, { AttributeType } from 'helios-network';
// When consuming the published package use `import { Helios } from 'helios-web-next';`
import { Helios, EVENTS, HeliosUI } from '../../../src/index.js';

// Set this to an object like { helios: true, mapper: true, scheduler: true } to re-enable debug logs.
const DEFAULT_NODE_COUNT = 2_000;
const DEBUG_CONFIG = null;
const DEFAULT_ADAPTIVE_DURATION_SAMPLES = 5;
const DEFAULT_ADAPTIVE_DURATION_WINDOW_MS = 5000;
const UMAP_EXPORTED_CASES = Object.freeze([
  { nodeCount: 200, path: '/assets/umap/gaussian-200.zxnet', label: 'gaussian-200' },
  { nodeCount: 2000, path: '/assets/umap/gaussian-2000.zxnet', label: 'gaussian-2000' },
  { nodeCount: 20000, path: '/assets/umap/gaussian-20000.zxnet', label: 'gaussian-20000' },
]);

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
  if (!layout) return 'gpuforce';
  const normalized = layout.toLowerCase();
  if (normalized === 'none' || normalized === 'static') return 'none';
  if (normalized === 'jitter' || normalized === 'legacy') return 'jitter';
  if (normalized === 'd3force3d' || normalized === 'd3-force-3d') return 'd3force3d';
  if (
    normalized === 'gpuforce-webgl'
    || normalized === 'gpuforce-webgl2'
    || normalized === 'gpu-force-webgl'
    || normalized === 'gpu-webgl'
  ) return 'gpuforce-webgl2';
  if (
    normalized === 'gpuforce-webgpu'
    || normalized === 'gpu-force-webgpu'
    || normalized === 'gpu-webgpu'
  ) return 'gpuforce-webgpu';
  if (normalized === 'gpuforce' || normalized === 'gpu-force' || normalized === 'gpu') return 'gpuforce';
  return 'gpuforce';
}

function isGpuForceLayoutType(layoutType) {
  return layoutType === 'gpuforce' || layoutType === 'gpuforce-webgl2' || layoutType === 'gpuforce-webgpu';
}

function resolveInterpolationEnabled() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('interpolationEnabled') ?? params.get('interpolate');
  if (raw == null) return true;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function resolveInterpolationDurationMs() {
  const params = new URLSearchParams(window.location.search);
  const value = Number(
    params.get('interpolationFixedDurationMs')
    ?? params.get('interpolationDurationMs')
    ?? params.get('interpolationDuration'),
  );
  if (Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 160;
}

function resolveInterpolationAdaptiveDuration() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('interpolationAdaptive') ?? params.get('adaptiveInterpolationDuration');
  if (raw == null) return true;
  const normalized = String(raw).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeInterpolationDurationMode(value, fallback = 'adaptive') {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (raw === 'adaptive' || raw === 'auto' || raw === 'dynamic') return 'adaptive';
  if (raw === 'fixed' || raw === 'manual' || raw === 'constant') return 'fixed';
  return fallback;
}

function resolveInterpolationDurationMode() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('interpolationDurationMode')
    ?? params.get('interpolationDurationStrategy')
    ?? params.get('interpolationTiming');
  if (raw != null) {
    return normalizeInterpolationDurationMode(raw, 'adaptive');
  }
  return resolveInterpolationAdaptiveDuration() ? 'adaptive' : 'fixed';
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

function resolveDataset() {
  const params = new URLSearchParams(window.location.search);
  const dataset = params.get('dataset')?.trim().toLowerCase();
  if (dataset === 'umap') return 'umap-export';
  if (dataset === 'umap-export' || dataset === 'umap-real' || dataset === 'umap-exported') return 'umap-export';
  return 'grid';
}

function resolveExportedUmapCase(requestedNodeCount) {
  let bestCase = UMAP_EXPORTED_CASES[0];
  let bestDistance = Math.abs(requestedNodeCount - bestCase.nodeCount);
  for (let index = 1; index < UMAP_EXPORTED_CASES.length; index += 1) {
    const candidate = UMAP_EXPORTED_CASES[index];
    const distance = Math.abs(requestedNodeCount - candidate.nodeCount);
    if (distance < bestDistance) {
      bestCase = candidate;
      bestDistance = distance;
    }
  }
  return bestCase;
}

async function fetchExportedUmapNetwork(requestedNodeCount) {
  const selectedCase = resolveExportedUmapCase(requestedNodeCount);
  const response = await fetch(selectedCase.path, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load exported UMAP dataset ${selectedCase.label}: HTTP ${response.status}`);
  }
  const network = await HeliosNetwork.fromZXNet(response);
  return { network, selectedCase };
}

async function bootstrap() {
  const diagnostics = {
    ready: false,
    renderer: 'pending',
    nodeCount: 0,
    edgeCount: 0,
  };
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;
  window.__HELIOS_SYNTHETIC_DATASET__ = null;
  window.__HELIOS_DATASET_INFO__ = null;
  const nodeCount = resolveNodeCount();
  const dataset = resolveDataset();
  const usingExportedUmapDataset = dataset === 'umap-export';
  let exportedUmapCase = null;
  console.log("Creating Helios network...");
  const network = usingExportedUmapDataset
    ? (({ network: loadedNetwork, selectedCase }) => {
        exportedUmapCase = selectedCase;
        return loadedNetwork;
      })(await fetchExportedUmapNetwork(nodeCount))
    : await HeliosNetwork.create({ directed: false, initialNodes: 0 });

  const nodeAttribute = 'weight';
  const edgeAttribute = 'intensity';
  const categoryAttribute = 'category';
  const labelAttribute = 'label';
  const nodes = usingExportedUmapDataset ? [] : network.addNodes(nodeCount);

  if (!usingExportedUmapDataset) {
    console.log("Defining attributes...");
    network.defineNodeAttribute(nodeAttribute, AttributeType.Float);
    network.defineNodeAttribute(categoryAttribute, AttributeType.String);
    network.defineNodeAttribute(labelAttribute, AttributeType.String);
    network.defineEdgeAttribute(edgeAttribute, AttributeType.Float);
    console.log("Filling node attributes...");
    const weightValues = new Float32Array(nodes.length);
    network.withBufferAccess(() => {
      const view = network.getNodeAttributeBuffer(nodeAttribute).view;
      for (let i = 0; i < nodes.length; i += 1) {
        const value = Math.random();
        view[nodes[i]] = value;
        weightValues[i] = value;
      }
    });

    console.log("Assigning categorical buckets...");
    const categoryCount = 8;
    const total = Math.max(1, nodes.length);
    for (let i = 0; i < nodes.length; i += 1) {
      const bucket = Math.min(categoryCount - 1, Math.floor((i / total) * categoryCount));
      const label = `category${bucket + 1}`;
      network.setNodeStringAttribute(categoryAttribute, nodes[i], label);
      network.setNodeStringAttribute(labelAttribute, nodes[i], `node-${i}`);
    }
    network.categorizeNodeAttribute(categoryAttribute, { sortOrder: 'frequency' });
  }

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
  const is3D = resolveMode() === '3d';
  let edgeIds = [];
  let datasetInfo = {
    name: dataset,
    requestedNodeCount: nodeCount,
    resolvedNodeCount: usingExportedUmapDataset ? (exportedUmapCase?.nodeCount ?? 0) : nodeCount,
    source: usingExportedUmapDataset ? 'exported' : 'synthetic',
    path: usingExportedUmapDataset ? (exportedUmapCase?.path ?? null) : null,
    label: usingExportedUmapDataset ? (exportedUmapCase?.label ?? null) : null,
  };
  let syntheticDataset = null;

  if (!usingExportedUmapDataset) {
    console.log("Adding edges...");
    syntheticDataset = { name: dataset };
    if (dataset !== 'umap-export') {
      const edges = [];
      if (nodeCount > 1) {
        if (is3D) {
          const side = Math.ceil(Math.cbrt(nodeCount));
          for (let i = 0; i < nodeCount; i += 1) {
            const z = Math.floor(i / (side * side));
            const rem = i - z * side * side;
            const y = Math.floor(rem / side);
            const x = rem - y * side;

            const neighborX = x + 1 < side ? i + 1 : -1;
            const neighborY = y + 1 < side ? i + side : -1;
            const neighborZ = z + 1 < side ? i + side * side : -1;

            if (neighborX >= 0 && neighborX < nodeCount) edges.push([nodes[i], nodes[neighborX]]);
            if (neighborY >= 0 && neighborY < nodeCount) edges.push([nodes[i], nodes[neighborY]]);
            if (neighborZ >= 0 && neighborZ < nodeCount) edges.push([nodes[i], nodes[neighborZ]]);
          }
        } else {
          const side = Math.ceil(Math.sqrt(nodeCount));
          for (let i = 0; i < nodeCount; i += 1) {
            const row = Math.floor(i / side);
            const col = i - row * side;
            const neighborRight = col + 1 < side ? i + 1 : -1;
            const neighborDown = row + 1 < side ? i + side : -1;

            if (neighborRight >= 0 && neighborRight < nodeCount) edges.push([nodes[i], nodes[neighborRight]]);
            if (neighborDown >= 0 && neighborDown < nodeCount) edges.push([nodes[i], nodes[neighborDown]]);
          }
        }
      }
      edgeIds = network.addEdges(edges);
    }
    window.__HELIOS_SYNTHETIC_DATASET__ = syntheticDataset;
    console.log("Created a network with nodes:", network.nodeCount, "edges:", network.edgeCount);

    console.log("Filling edge attribute...");
    if (edgeIds.length) {
      network.withBufferAccess(() => {
        const edgeBuffer = network.getEdgeAttributeBuffer(edgeAttribute).view;
        for (const id of edgeIds) {
          edgeBuffer[id] = Math.random();
        }
      });
    }
  }

  console.log("Defining helios options...");
  const target = document.getElementById('app');
  const mode = resolveMode();
  const layoutType = resolveLayoutType();
  const usingUmapDataset = usingExportedUmapDataset;
  let interpolationEnabled = resolveInterpolationEnabled();
  let interpolationDurationMs = resolveInterpolationDurationMs();
  let interpolationDurationMode = resolveInterpolationDurationMode();
  const edgeTransparency = resolveEdgeTransparencyMode();
  const gpuForceLayoutOptions = {
    mode,
    center: [0, 0, 0],
    radius: 220 * Math.sqrt(nodeCount / 1000),
    depth: mode === '3d' ? 140 : 0,
    outputScale: 6.5,
    ...(usingUmapDataset
      ? {
          eta: 0.4,
          damping: 0.92,
          maxStep: 2.5,
          kRepulsion: 1,
          kAttraction: 1,
          kGravity: 0,
        }
      : {
          eta: 0.4,
          damping: 0.92,
          maxStep: 2.5,
          linkDistance: 1,
          kRepulsion: 0.07,
          kAttraction: 0.62,
          kGravity: 0.005,
        }),
  };
  const heliosOptions = {
    container: target,
    layout: layoutType === 'none'
      ? { type: 'static', options: { bounds: [-500, -500, 500, 500] } }
      : isGpuForceLayoutType(layoutType)
        ? {
            type: 'gpu-force',
            options: gpuForceLayoutOptions,
          }
      : layoutType === 'd3force3d'
        ? {
            type: 'd3force3d',
            options: {
              settings: {
                use2D: mode !== '3d',
              },
            },
          }
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
    interpolation: {
      enabled: interpolationEnabled,
      mode: 'gpu',
      durationMode: interpolationDurationMode,
      fixedDurationMs: interpolationDurationMs,
      durationMs: interpolationDurationMs,
      adaptiveDuration: interpolationDurationMode === 'adaptive',
      adaptiveDurationSamples: DEFAULT_ADAPTIVE_DURATION_SAMPLES,
      adaptiveDurationWindowMs: DEFAULT_ADAPTIVE_DURATION_WINDOW_MS,
      easing: 'linear',
      smoothing: 6,
      minDisplacementRatio: 0.0005,
    },
    debug: DEBUG_CONFIG,
    // Warm up mapper application so first render is quick on large graphs.
    // prewarm: true,
  };
  const rendererPreference = resolveRendererPreference();
  if (rendererPreference) {
    heliosOptions.renderer = rendererPreference;
  }

  if (layoutType === 'none' && !usingExportedUmapDataset) {
    console.log("No layout selected, seeding grid positions...");
    seedGridPositions();
  }
  
  console.log("Creating helios-web instance...");
  const helios = new Helios(network, heliosOptions);
  window.__helios = helios;

  console.log("Waiting for helios to be ready...");
  await helios.ready;
  window.__snapshotDelegatePositions = () => helios.snapshotDelegatePositions();
  window.__syncDelegatePositionsToNetwork = () => helios.syncDelegatePositionsToNetwork();

  console.log("Helios is ready!");

  // Optional UI overlay demo (panels, theming, attribute bindings).
  const heliosUI = new HeliosUI({ helios, theme: 'dark', allowDrag: true });
  heliosUI.createDemoPanel();
  heliosUI.createMetricsPanel();
  window.__heliosUI = heliosUI;

  const configureDemoMappers = () => {
    const net = helios.network;
    const hasWeight = Boolean(net?.hasNodeAttribute?.(nodeAttribute));
    console.log("Setting up mappers...", { hasWeight });

    // Start with a serializable mapper so the UI doesn't show this as a custom preset.
    // Color nodes by index across the full domain.
    const maxIndex = Math.max(1, (net?.nodeCount ?? 1) - 1);
    console.log("  Node colors ($index/rainforest)...");
    helios.nodeMapper.channel('color').from('$index').colormap('cmasher:rainforest', { domain: [0, maxIndex], alpha: 1 }).done();

    if (hasWeight) {
      console.log("  Node sizes (weight)...");
      helios.nodeMapper.channel('size').from(nodeAttribute).linear([0, 1], [1, 4]).done();
    } else {
      console.log("  Node sizes (constant)...");
      helios.nodeMapper.channel('size').constant(2.5).done();
    }

    // Keep edges visible by deriving endpoint colors from node colors.
    helios.edgeMapper.channel('color').from('@node.color').nodeToEdge().done();
    console.log("  Edge width mapper...");
    helios.edgeMapper.channel('width').constant(1.5).done();
    helios.edgeMapper.channel('opacity').constant(1).done();
    helios.requestRender();
  };

  configureDemoMappers();
  // Create the Mappers panel after configuring demo mappers so it doesn't
  // initialize from the non-serializable default mapper.
  heliosUI.createMappersPanel({ dock: 'top-right', position: { x: 16, y: 16 } });
  heliosUI.createLayoutPanel({ dock: 'top-right', position: { x: 16, y: 360 } });
  heliosUI.createLegendsPanel({ dock: 'top-right', position: { x: 16, y: 560 } });
  heliosUI.createFilterPanel({ dock: 'top-right' });
  heliosUI.createCameraPanel({ dock: 'top-right' });
  const selectionPanel = heliosUI.createSelectionPanel({
    dock: 'top-right',
  });
  window.__heliosSelectionPanel = selectionPanel;

  helios.on(EVENTS.NETWORK_REPLACED, () => {
    configureDemoMappers();
    helios.requestFrameNetwork?.({ paddingPx: 24 });
  });

  console.log("Changing edge scaling...");
  // Make edges visibly thicker for the demo.
  helios.edgeWidthScale(1.0).edgeWidthBase(0);
  helios.edgeOpacityScale(0.5);
  

  console.log("Misc diagnostics...");
  const activeNetwork = helios.network;
  const rendererType = helios.renderer?.device?.type ?? helios.renderer?.constructor?.name ?? 'unknown';
  diagnostics.ready = true;
  diagnostics.renderer = rendererType;
  diagnostics.dataset = dataset;
  diagnostics.nodeCount = activeNetwork?.nodeCount ?? nodes.length;
  diagnostics.edgeCount = activeNetwork?.edgeCount ?? edgeIds.length;
  diagnostics.datasetInfo = datasetInfo;
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;
  window.__HELIOS_DATASET_INFO__ = datasetInfo;
  window.__helios = helios;
  console.log("Done! Helios instance is available as window.__helios", helios);
}

bootstrap().catch((error) => {
  console.error('Failed to bootstrap Helios', error);
  window.__HELIOS_DIAGNOSTICS__ = {
    ready: false,
    error: error?.message ?? String(error),
  };
});
