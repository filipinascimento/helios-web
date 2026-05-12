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
  if (!layout) return 'gpuforce';
  const normalized = layout.toLowerCase();
  if (normalized === 'none' || normalized === 'static') return 'none';
  if (normalized === 'jitter' || normalized === 'legacy') return 'jitter';
  if (normalized === 'd3force3d' || normalized === 'd3-force-3d') return 'd3force3d';
  if (normalized === 'gpuforce' || normalized === 'gpu-force' || normalized === 'gpu') return 'gpuforce';
  return 'gpuforce';
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

function resolveDataset(params) {
  const dataset = params.get('dataset');
  if (typeof dataset === 'string' && dataset.trim().toLowerCase() === 'umap') return 'umap';
  return 'ring';
}

function gaussianRandom() {
  let u = 0;
  let v = 0;
  while (u <= Number.EPSILON) u = Math.random();
  while (v <= Number.EPSILON) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
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

function buildSyntheticUmapFixture(network, nodes) {
  const nodeCount = nodes.length;
  const clusterCount = Math.max(4, Math.min(8, Math.round(Math.sqrt(nodeCount / 8))));
  const featureDims = 12;
  const neighborsPerNode = Math.max(8, Math.min(16, Math.floor(nodeCount / 12)));
  const clusterLabels = new Uint32Array(nodeCount);
  const features = Array.from({ length: nodeCount }, () => new Float32Array(featureDims));
  const embedding = new Float32Array(nodeCount * 2);
  const clusterCenters = Array.from({ length: clusterCount }, (_, clusterId) => {
    const center = new Float32Array(featureDims);
    const angle = (clusterId / clusterCount) * Math.PI * 2;
    center[0] = Math.cos(angle) * 4;
    center[1] = Math.sin(angle) * 4;
    center[2] = Math.cos(angle * 2) * 2;
    center[3] = Math.sin(angle * 2) * 2;
    center[4] = clusterId * 0.35;
    return center;
  });

  for (let i = 0; i < nodeCount; i += 1) {
    const clusterId = i % clusterCount;
    clusterLabels[i] = clusterId;
    const center = clusterCenters[clusterId];
    for (let dim = 0; dim < featureDims; dim += 1) {
      features[i][dim] = center[dim] + (gaussianRandom() * 0.45);
    }
    const angle = (clusterId / clusterCount) * Math.PI * 2;
    const offset = i * 2;
    embedding[offset] = (Math.cos(angle) * 120) + (gaussianRandom() * 10);
    embedding[offset + 1] = (Math.sin(angle) * 120) + (gaussianRandom() * 10);
  }

  const pairWeights = new Map();
  const nodeMass = new Float32Array(nodeCount);
  for (let i = 0; i < nodeCount; i += 1) {
    const distances = [];
    const source = features[i];
    for (let j = 0; j < nodeCount; j += 1) {
      if (i === j) continue;
      const target = features[j];
      let distSq = 0;
      for (let dim = 0; dim < featureDims; dim += 1) {
        const delta = source[dim] - target[dim];
        distSq += delta * delta;
      }
      distances.push({ index: j, distSq });
    }
    distances.sort((a, b) => a.distSq - b.distSq);
    const sigma = Math.max(1e-3, Math.sqrt(distances[Math.max(0, neighborsPerNode - 1)]?.distSq ?? 1));
    for (let n = 0; n < Math.min(neighborsPerNode, distances.length); n += 1) {
      const neighbor = distances[n];
      const weight = Math.exp(-Math.sqrt(neighbor.distSq) / sigma);
      if (!(weight > 0)) continue;
      const a = Math.min(i, neighbor.index);
      const b = Math.max(i, neighbor.index);
      const key = `${a}:${b}`;
      const previous = pairWeights.get(key) ?? 0;
      if (weight > previous) pairWeights.set(key, weight);
    }
  }

  const edgePairs = [];
  const edgeWeights = [];
  for (const [key, weight] of pairWeights.entries()) {
    const [source, target] = key.split(':').map((value) => Number(value));
    edgePairs.push([source, target]);
    edgeWeights.push(weight);
    nodeMass[source] += weight;
    nodeMass[target] += weight;
  }

  network.defineNodeAttribute('umap_mass', AttributeType.Float, 1);
  network.defineNodeAttribute('test_cluster', AttributeType.UnsignedInteger, 1);
  network.defineEdgeAttribute('umap_weight', AttributeType.Float, 1);
  network.defineNetworkAttribute('umap', AttributeType.String, 1);
  network.defineNetworkAttribute('umap_a', AttributeType.String, 1);
  network.defineNetworkAttribute('umap_b', AttributeType.String, 1);
  network.defineNetworkAttribute('umap_gamma', AttributeType.String, 1);
  network.defineNetworkAttribute('umap_negative_sample_rate', AttributeType.String, 1);
  network.defineNetworkAttribute('umap_n_neighbors', AttributeType.UnsignedInteger, 1);
  network.defineNetworkAttribute('umap_n_components', AttributeType.UnsignedInteger, 1);
  network.defineNetworkAttribute('umap_min_dist', AttributeType.Float, 1);
  network.defineNetworkAttribute('umap_spread', AttributeType.Float, 1);
  network.defineNetworkAttribute('umap_edge_weight_attr', AttributeType.String, 1);
  network.defineNetworkAttribute('umap_node_mass_attr', AttributeType.String, 1);
  network.setNetworkStringAttribute('umap', 'true');
  network.setNetworkStringAttribute('umap_a', '1.5769434601962196');
  network.setNetworkStringAttribute('umap_b', '0.8950608779914887');
  network.setNetworkStringAttribute('umap_gamma', '1');
  network.setNetworkStringAttribute('umap_negative_sample_rate', '5');
  network.setNetworkStringAttribute('umap_edge_weight_attr', 'umap_weight');
  network.setNetworkStringAttribute('umap_node_mass_attr', 'umap_mass');

  const edgeIds = network.addEdges(edgePairs);
  network.withBufferAccess(() => {
    const massView = network.getNodeAttributeBuffer('umap_mass').view;
    const clusterView = network.getNodeAttributeBuffer('test_cluster').view;
    const weightView = network.getEdgeAttributeBuffer('umap_weight').view;
    const neighborsView = network.getNetworkAttributeBuffer('umap_n_neighbors').view;
    const componentsView = network.getNetworkAttributeBuffer('umap_n_components').view;
    const minDistView = network.getNetworkAttributeBuffer('umap_min_dist').view;
    const spreadView = network.getNetworkAttributeBuffer('umap_spread').view;

    massView.set(nodeMass);
    clusterView.set(clusterLabels);
    weightView.set(edgeWeights);
    neighborsView[0] = neighborsPerNode;
    componentsView[0] = 2;
    minDistView[0] = 0.1;
    spreadView[0] = 1;
  });

  return {
    edgeIds,
    clusters: Array.from(clusterLabels),
  };
}

export async function bootstrapDemoFixture() {
  const diagnostics = { ready: false, renderer: 'pending', nodeCount: 0, edgeCount: 0 };
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;
  window.__HELIOS_SYNTHETIC_DATASET__ = null;
  try {
    const params = new URLSearchParams(window.location.search);
    const mode = resolveMode(params);
    const layoutType = resolveLayoutType(params);
    const nodeCount = resolveNodeCount(params);
    const pickTest = resolvePickTestMode(params);
    const mappersUi = resolveMappersUi(params);
    const dataset = resolveDataset(params);
    const rendererPreference = resolveRendererPreference(params);

    const container = document.getElementById('app');
    const network = await HeliosNetwork.create({ directed: false, initialNodes: 0 });

    // Define key visuals attributes upfront so tests relying on them behave consistently.
    network.defineNodeAttribute('_helios_visuals_size', AttributeType.Float, 1);
    network.defineNodeAttribute('_helios_visuals_color', AttributeType.Float, 4);
    network.defineEdgeAttribute('_helios_visuals_edge_color', AttributeType.Float, 8);
    network.defineEdgeAttribute('_helios_visuals_edge_width', AttributeType.Float, 2);

    const nodes = network.addNodes(nodeCount);
    const fixture = dataset === 'umap'
      ? buildSyntheticUmapFixture(network, nodes)
      : { edgeIds: connectRing(network, nodes), clusters: null };
    const edgeIds = fixture.edgeIds;
    window.__HELIOS_SYNTHETIC_DATASET__ = fixture.clusters
      ? { name: dataset, clusters: fixture.clusters }
      : { name: dataset };

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
        : layoutType === 'gpuforce'
          ? {
              type: 'gpu-force',
              options: {
                mode,
                center: [0, 0, 0],
                radius: 220,
                depth: mode === '3d' ? 140 : 0,
                outputScale: 6.5,
                kRepulsion: 1,
                kAttraction: 0.62,
                kGravity: 0.001,
                eta: 0.4,
                damping: 0.92,
                maxStep: 2.5,
                alphaDecay: 0.005,
                updateIntervalMs: 0,
              },
          }
        : layoutType === 'd3force3d'
          ? {
              type: 'd3force3d',
              options: {
                settings: {
                  use2D: mode !== '3d',
                  alphaDecay: 0.003,
                },
              },
            }
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
    diagnostics.dataset = dataset;
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
