import HeliosNetwork, { AttributeType } from 'helios-network';
// When consuming the published package use `import { Helios } from 'helios-web';`
import { Helios, EVENTS, HeliosUI } from '../../src/index.js';

// Set this to an object like { helios: true, mapper: true, scheduler: true } to re-enable debug logs.
const DEFAULT_NODE_COUNT = 10_000;
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

function normalizeThemeName(value) {
  const theme = String(value ?? '').trim().toLowerCase();
  if (theme === 'light' || theme === 'default') return 'light';
  if (theme === 'dark' || theme === 'slate') return 'dark';
  return null;
}

function resolveAppTheme() {
  const params = new URLSearchParams(window.location.search);
  const queryTheme = normalizeThemeName(params.get('theme'));
  if (queryTheme) return queryTheme;
  const rootTheme = normalizeThemeName(
    document.documentElement?.getAttribute?.('data-helios-theme')
    ?? document.documentElement?.getAttribute?.('data-theme')
    ?? document.documentElement?.getAttribute?.('data-md-color-scheme')
    ?? document.body?.getAttribute?.('data-helios-theme')
    ?? document.body?.getAttribute?.('data-theme')
    ?? document.body?.getAttribute?.('data-md-color-scheme'),
  );
  if (rootTheme) return rootTheme;
  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function resolveSessionOptions() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('session') === '0') return false;
  const sessionAlias = params.get('session');
  const normalizedSessionAlias = String(sessionAlias ?? '').trim().toLowerCase();
  const sessionId = params.get('sessionId')
    || params.get('heliosSessionId')
    || (
      normalizedSessionAlias
      && normalizedSessionAlias !== '1'
      && normalizedSessionAlias !== 'true'
      && normalizedSessionAlias !== 'false'
        ? sessionAlias
        : undefined
    );
  const maxSessions = params.has('maxSessions') ? Number(params.get('maxSessions')) : NaN;
  const maxSessionBytes = params.has('maxSessionBytes') ? Number(params.get('maxSessionBytes')) : NaN;
  return {
    id: sessionId || undefined,
    url: true,
    autosave: params.get('autosave') !== '0',
    restore: params.get('restore') !== '0',
    restoreNetwork: params.get('restoreNetwork') !== '0',
    maxJournalEntries: 200,
    retention: {
      maxSessions: Number.isFinite(maxSessions)
        ? Math.max(1, Math.floor(maxSessions))
        : 20,
      maxBytes: Number.isFinite(maxSessionBytes)
        ? Math.max(0, Math.floor(maxSessionBytes))
        : undefined,
    },
    networkPersistence: {
      enabled: params.get('networkPersistence') !== '0',
      format: params.get('networkFormat') || 'zxnet',
    },
  };
}

function resolvePersistenceOptions(defaultWorkspaceId = 'network') {
  const params = new URLSearchParams(window.location.search);
  const workspaceId = params.get('workspaceId') || defaultWorkspaceId;
  return {
    workspaceId,
    networkPersistence: {
      enabled: params.get('networkPersistence') !== '0',
      autosave: params.get('networkAutosave') !== '0',
    },
    positionPersistence: {
      enabled: params.get('positionPersistence') !== '0',
      autosave: params.get('positionAutosave') !== '0',
    },
  };
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
  if (!mode) return 'weighted';
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

function resolveGpuForceNormalizationType() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('forceNormalizationType')
    ?? params.get('forceNormalization')
    ?? params.get('gpuForceNormalization');
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'degree') return 'degree';
  if (normalized === 'strength') return 'strength';
  if (normalized === 'none') return 'none';
  return 'local-degree';
}

function resolveNodeCount() {
  const params = new URLSearchParams(window.location.search);
  const value = Number(params.get('nodes') ?? params.get('nodeCount'));
  if (Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return DEFAULT_NODE_COUNT;
}

function isStartupDisabledByQuery() {
  const params = new URLSearchParams(window.location.search);
  return params.get('startup') === '0' || params.get('startupLoading') === '0';
}

function ensureStartupSpinnerStyle() {
  if (document.getElementById('helios-demo-startup-spinner-style')) return;
  const style = document.createElement('style');
  style.id = 'helios-demo-startup-spinner-style';
  style.textContent = `
    @keyframes helios-demo-startup-spin { to { transform: rotate(360deg); } }
    .helios-demo-startup-overlay {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      z-index: 2147483647;
    }
    .helios-demo-startup-spinner {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.28);
      border-top-color: rgba(255, 255, 255, 0.94);
      box-shadow: 0 0 14px rgba(0, 0, 0, 0.18);
      animation: helios-demo-startup-spin 0.82s linear infinite;
    }
  `;
  document.head?.appendChild(style);
}

function showDemoStartupOverlay() {
  if (isStartupDisabledByQuery()) return null;
  ensureStartupSpinnerStyle();
  const overlay = document.createElement('div');
  overlay.className = 'helios-demo-startup-overlay';
  const spinner = document.createElement('div');
  spinner.className = 'helios-demo-startup-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  overlay.appendChild(spinner);
  document.body?.appendChild(overlay);
  return overlay;
}

function resolveStartupOptions() {
  const params = new URLSearchParams(window.location.search);
  const startupDisabled = isStartupDisabledByQuery();
  if (startupDisabled) {
    return false;
  }
  const hasStartupOverride = [
    'startupLayoutIterations',
    'startupIterations',
    'layoutStartupIterations',
    'startupLayoutDurationMs',
    'startupDurationMs',
    'layoutStartupDurationMs',
    'startupSpinner',
    'loadingOverlay',
    'hideCanvasUntilFirstFrame',
  ].some((name) => params.has(name));
  if (!hasStartupOverride) return undefined;
  const readNumberParam = (...names) => {
    for (const name of names) {
      const value = params.get(name);
      if (value != null) return Number(value);
    }
    return NaN;
  };
  const requestedIterations = readNumberParam('startupLayoutIterations', 'startupIterations', 'layoutStartupIterations');
  const requestedDurationMs = readNumberParam('startupLayoutDurationMs', 'startupDurationMs', 'layoutStartupDurationMs');
  const loadingOverlay = params.get('startupSpinner') !== '0' && params.get('loadingOverlay') !== '0';
  const hideCanvas = params.get('hideCanvasUntilFirstFrame') !== '0';
  const startup = {
    loadingOverlay,
    hideCanvasUntilFirstFrame: hideCanvas,
  };
  if (Number.isFinite(requestedIterations) && requestedIterations >= 0) {
    startup.layoutIterations = Math.floor(requestedIterations);
  }
  if (Number.isFinite(requestedDurationMs) && requestedDurationMs >= 0) {
    startup.layoutDurationMs = Math.floor(requestedDurationMs);
  }
  return startup;
}

function resolveCameraOptions() {
  const params = new URLSearchParams(window.location.search);
  const camera = {};
  const readNumberParam = (...names) => {
    for (const name of names) {
      const value = params.get(name);
      if (value != null) return Number(value);
    }
    return NaN;
  };
  if (params.get('largeNetworkStartupFit') === '0') {
    camera.largeNetworkStartupFit = false;
  }
  const nodeThreshold = readNumberParam('largeNetworkStartupNodeThreshold', 'startupNodeThreshold');
  const edgeThreshold = readNumberParam('largeNetworkStartupEdgeThreshold', 'startupEdgeThreshold');
  const scale = readNumberParam('largeNetworkStartupScale', 'startupCameraScale');
  const durationMs = readNumberParam('largeNetworkStartupDurationMs', 'startupCameraDurationMs');
  if (Number.isFinite(nodeThreshold) && nodeThreshold > 0) {
    camera.largeNetworkStartupNodeThreshold = Math.floor(nodeThreshold);
  }
  if (Number.isFinite(edgeThreshold) && edgeThreshold > 0) {
    camera.largeNetworkStartupEdgeThreshold = Math.floor(edgeThreshold);
  }
  if (Number.isFinite(scale) && scale >= 1) {
    camera.largeNetworkStartupScale = scale;
  }
  if (Number.isFinite(durationMs) && durationMs >= 0) {
    camera.largeNetworkStartupDurationMs = Math.floor(durationMs);
  }
  return Object.keys(camera).length ? camera : undefined;
}

function resolveDataset() {
  const params = new URLSearchParams(window.location.search);
  const dataset = params.get('dataset')?.trim().toLowerCase();
  if (!dataset) return 'small-world';
  if (dataset === 'ws' || dataset === 'small-world' || dataset === 'watts-strogatz') return 'small-world';
  if (dataset === 'grid' || dataset === 'lattice' || dataset === 'lattice2d' || dataset === 'grid2d') return 'grid';
  if (dataset === 'grid3d' || dataset === 'lattice3d') return 'grid3d';
  if (dataset === 'umap') return 'umap-export';
  if (dataset === 'umap-export' || dataset === 'umap-real' || dataset === 'umap-exported') return 'umap-export';
  return 'small-world';
}

function resolveSmallWorldOptions() {
  const params = new URLSearchParams(window.location.search);
  const readNumberParam = (...names) => {
    for (const name of names) {
      const value = params.get(name);
      if (value != null) return Number(value);
    }
    return NaN;
  };
  const rewiring = readNumberParam('rewiringProbability', 'rewiring', 'wsRewire');
  const neighborLevel = readNumberParam('neighborLevel', 'wsLevel');
  const seed = readNumberParam('seed', 'networkSeed');
  return {
    neighborLevel: Number.isFinite(neighborLevel) && neighborLevel > 0 ? Math.floor(neighborLevel) : 2,
    rewiringProbability: Number.isFinite(rewiring) && rewiring >= 0 ? Math.min(1, rewiring) : 0.006,
    seed: Number.isFinite(seed) && seed >= 0 ? Math.floor(seed) : 1,
  };
}

function resolveGridOptions(requestedNodeCount, dataset) {
  const params = new URLSearchParams(window.location.search);
  const readNumberParam = (...names) => {
    for (const name of names) {
      const value = params.get(name);
      if (value != null) return Number(value);
    }
    return NaN;
  };
  const neighborLevel = readNumberParam('neighborLevel', 'gridLevel', 'latticeLevel');
  const rows = readNumberParam('rows', 'gridRows', 'height');
  const columns = readNumberParam('columns', 'cols', 'gridColumns', 'width');
  const side = readNumberParam('side', 'gridSide', 'depth');
  const periodic = params.get('periodic') === '1'
    || params.get('periodic') === 'true'
    || params.get('toroidal') === '1'
    || params.get('toroidal') === 'true';
  if (dataset === 'grid3d') {
    const resolvedSide = Number.isFinite(side) && side > 0
      ? Math.floor(side)
      : Math.ceil(Math.cbrt(requestedNodeCount));
    return {
      dimensions: 3,
      side: resolvedSide,
      nodeCount: Math.max(1, requestedNodeCount),
      neighborLevel: Number.isFinite(neighborLevel) && neighborLevel > 0 ? Math.floor(neighborLevel) : 1,
      periodic,
    };
  }
  const resolvedColumns = Number.isFinite(columns) && columns > 0
    ? Math.floor(columns)
    : Math.ceil(Math.sqrt(requestedNodeCount));
  const resolvedRows = Number.isFinite(rows) && rows > 0
    ? Math.floor(rows)
    : Math.ceil(requestedNodeCount / Math.max(1, resolvedColumns));
  return {
    dimensions: 2,
    rows: resolvedRows,
    columns: resolvedColumns,
    nodeCount: Math.max(1, requestedNodeCount),
    neighborLevel: Number.isFinite(neighborLevel) && neighborLevel > 0 ? Math.floor(neighborLevel) : 1,
    periodic,
  };
}

async function generateGrid3DNetwork(options = {}) {
  const side = Math.max(1, Math.floor(Number(options.side) || 1));
  const requestedNodeCount = Math.max(1, Math.floor(Number(options.nodeCount) || side ** 3));
  const nodeCount = Math.min(requestedNodeCount, side ** 3);
  const neighborLevel = Math.max(1, Math.floor(Number(options.neighborLevel) || 1));
  const periodic = options.periodic === true;
  const edgeCountEstimate = nodeCount * 3 * neighborLevel;
  const network = await HeliosNetwork.create({
    directed: false,
    initialNodes: nodeCount,
    initialEdges: edgeCountEstimate,
  });
  const edges = new Uint32Array(edgeCountEstimate * 2);
  let edgeOffset = 0;
  const indexAt = (x, y, z) => z * side * side + y * side + x;
  const pushEdge = (from, x, y, z) => {
    let nx = x;
    let ny = y;
    let nz = z;
    if (periodic) {
      nx = (nx + side) % side;
      ny = (ny + side) % side;
      nz = (nz + side) % side;
    }
    if (nx < 0 || nx >= side || ny < 0 || ny >= side || nz < 0 || nz >= side) return;
    const to = indexAt(nx, ny, nz);
    if (to >= nodeCount) return;
    edges[edgeOffset] = from;
    edges[edgeOffset + 1] = to;
    edgeOffset += 2;
  };
  for (let z = 0; z < side; z += 1) {
    for (let y = 0; y < side; y += 1) {
      for (let x = 0; x < side; x += 1) {
        const from = indexAt(x, y, z);
        if (from >= nodeCount) break;
        for (let level = 1; level <= neighborLevel; level += 1) {
          pushEdge(from, x + level, y, z);
          pushEdge(from, x, y + level, z);
          pushEdge(from, x, y, z + level);
        }
      }
    }
  }
  if (edgeOffset > 0) network.addEdges(edges.subarray(0, edgeOffset));
  return network;
}

async function generateGrid2DNetwork(options = {}) {
  const columns = Math.max(1, Math.floor(Number(options.columns) || 1));
  const rows = Math.max(1, Math.floor(Number(options.rows) || 1));
  const requestedNodeCount = Math.max(1, Math.floor(Number(options.nodeCount) || rows * columns));
  const nodeCount = Math.min(requestedNodeCount, rows * columns);
  const neighborLevel = Math.max(1, Math.floor(Number(options.neighborLevel) || 1));
  const periodic = options.periodic === true;
  const edgeCountEstimate = nodeCount * 2 * neighborLevel;
  const network = await HeliosNetwork.create({
    directed: false,
    initialNodes: nodeCount,
    initialEdges: edgeCountEstimate,
  });
  const edges = new Uint32Array(edgeCountEstimate * 2);
  let edgeOffset = 0;
  const indexAt = (x, y) => y * columns + x;
  const pushEdge = (from, x, y) => {
    let nx = x;
    let ny = y;
    if (periodic) {
      nx = (nx + columns) % columns;
      ny = (ny + rows) % rows;
    }
    if (nx < 0 || nx >= columns || ny < 0 || ny >= rows) return;
    const to = indexAt(nx, ny);
    if (to >= nodeCount) return;
    edges[edgeOffset] = from;
    edges[edgeOffset + 1] = to;
    edgeOffset += 2;
  };
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const from = indexAt(x, y);
      if (from >= nodeCount) break;
      for (let level = 1; level <= neighborLevel; level += 1) {
        pushEdge(from, x + level, y);
        pushEdge(from, x, y + level);
      }
    }
  }
  if (edgeOffset > 0) network.addEdges(edges.subarray(0, edgeOffset));
  return network;
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

function summarizeWattsStrogatzNetwork(network, options = {}) {
  if (!network || typeof network.withBufferAccess !== 'function') return null;
  const nodeCount = network.nodeCount ?? 0;
  const edgeCount = network.edgeCount ?? 0;
  const neighborLevel = Math.max(0, Math.floor(Number(options.neighborLevel) || 0));
  return network.withBufferAccess(() => {
    const edges = network.edgesView;
    let localEdges = 0;
    let shortcutEdges = 0;
    for (let edge = 0; edge < edgeCount; edge += 1) {
      const from = edges[edge * 2] >>> 0;
      const to = edges[edge * 2 + 1] >>> 0;
      const forward = (to - from + nodeCount) % nodeCount;
      const backward = (from - to + nodeCount) % nodeCount;
      const ringDistance = Math.min(forward, backward);
      if (ringDistance > neighborLevel) shortcutEdges += 1;
      else localEdges += 1;
    }
    return {
      nodeCount,
      edgeCount,
      neighborLevel,
      localEdges,
      shortcutEdges,
      rewiringProbability: options.rewiringProbability,
      expectedShortcutEdges: Math.round(edgeCount * Number(options.rewiringProbability ?? 0)),
      seed: options.seed,
    };
  }, { edgesView: true });
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
  const demoStartupOverlay = showDemoStartupOverlay();
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
  const usingGridDataset = dataset === 'grid' || dataset === 'grid3d';
  let exportedUmapCase = null;
  console.log("Creating Helios network...");
  const smallWorldOptions = resolveSmallWorldOptions();
  const gridOptions = resolveGridOptions(nodeCount, dataset);
  const network = usingExportedUmapDataset
    ? (({ network: loadedNetwork, selectedCase }) => {
        exportedUmapCase = selectedCase;
        return loadedNetwork;
      })(await fetchExportedUmapNetwork(nodeCount))
    : usingGridDataset
      ? (dataset === 'grid3d'
        ? await generateGrid3DNetwork(gridOptions)
        : await generateGrid2DNetwork(gridOptions))
      : await HeliosNetwork.generateWattsStrogatz({
          nodeCount,
          neighborLevel: smallWorldOptions.neighborLevel,
          rewiringProbability: smallWorldOptions.rewiringProbability,
          seed: smallWorldOptions.seed,
          directed: false,
        });

  const nodeAttribute = 'weight';
  const edgeAttribute = 'intensity';
  const categoryAttribute = 'category';
  const labelAttribute = 'label';

  if (!usingExportedUmapDataset) {
    console.log("Defining attributes...");
    network.defineNodeAttribute(nodeAttribute, AttributeType.Float);
    const fillStringAttributes = network.nodeCount <= 50_000;
    if (fillStringAttributes) {
      network.defineNodeAttribute(categoryAttribute, AttributeType.String);
      network.defineNodeAttribute(labelAttribute, AttributeType.String);
    }
    network.defineEdgeAttribute(edgeAttribute, AttributeType.Float);
    console.log("Filling node attributes...");
    network.withBufferAccess(() => {
      const ids = network.nodeIndices;
      const view = network.getNodeAttributeBuffer(nodeAttribute).view;
      for (let i = 0; i < ids.length; i += 1) {
        const value = Math.random();
        view[ids[i]] = value;
      }
    }, { nodeIndices: true });

    if (fillStringAttributes) {
      let nodes = [];
      network.withBufferAccess(() => {
        nodes = Uint32Array.from(network.nodeIndices);
      }, { nodeIndices: true });
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

  const is3D = resolveMode() === '3d';
  let datasetInfo = {
    name: dataset,
    requestedNodeCount: nodeCount,
    resolvedNodeCount: usingExportedUmapDataset ? (exportedUmapCase?.nodeCount ?? 0) : network.nodeCount,
    source: usingExportedUmapDataset ? 'exported' : 'generated',
    path: usingExportedUmapDataset ? (exportedUmapCase?.path ?? null) : null,
    label: usingExportedUmapDataset
      ? (exportedUmapCase?.label ?? null)
      : usingGridDataset
        ? `${dataset === 'grid3d' ? 'Grid3D' : 'Grid'} ${network.nodeCount}`
        : `WS ${nodeCount}`,
  };
  let syntheticDataset = null;

  if (!usingExportedUmapDataset) {
    syntheticDataset = {
      name: dataset,
      model: usingGridDataset ? dataset : 'watts-strogatz',
      ...(usingGridDataset ? gridOptions : smallWorldOptions),
      summary: usingGridDataset
        ? {
            nodeCount: network.nodeCount,
            edgeCount: network.edgeCount,
            ...gridOptions,
          }
        : summarizeWattsStrogatzNetwork(network, smallWorldOptions),
    };
    window.__HELIOS_SYNTHETIC_DATASET__ = syntheticDataset;
    console.log(
      "Created a network with nodes:",
      network.nodeCount,
      "edges:",
      network.edgeCount,
      "shortcut edges:",
      syntheticDataset.summary?.shortcutEdges ?? null,
    );

    console.log("Filling edge attribute...");
    if (network.edgeCount > 0) {
      network.withBufferAccess(() => {
        const ids = network.edgeIndices;
        const edgeBuffer = network.getEdgeAttributeBuffer(edgeAttribute).view;
        for (const id of ids) {
          edgeBuffer[id] = Math.random();
        }
      }, { edgeIndices: true });
    }
  }

  console.log("Defining helios options...");
  const target = document.getElementById('app');
  const mode = resolveMode();
  const layoutType = resolveLayoutType();
  const usingUmapDataset = usingExportedUmapDataset;
  const startupOptions = resolveStartupOptions();
  const cameraOptions = resolveCameraOptions();
  let interpolationEnabled = resolveInterpolationEnabled();
  let interpolationDurationMs = resolveInterpolationDurationMs();
  let interpolationDurationMode = resolveInterpolationDurationMode();
  const edgeTransparency = resolveEdgeTransparencyMode();
  const forceNormalizationType = resolveGpuForceNormalizationType();
  const gpuForceLayoutOptions = {
    mode,
    center: [0, 0, 0],
    radius: 220 * Math.sqrt(nodeCount / 1000),
    depth: mode === '3d' ? 140 : 0,
    outputScale: 6.5,
    rotationDamping: 0.6,
    ...(usingUmapDataset
      ? {
          eta: 0.4,
          damping: 0.82,
          maxStep: 2.5,
          kRepulsion: 1,
          kAttraction: 1,
          kGravity: 0,
        }
      : {
          eta: 0.4,
          damping: 0.82,
          maxStep: 2.5,
          linkDistance: 1,
          kRepulsion: 1,
          kAttraction: 0.62,
          kGravity: 0.001,
        }),
    forceNormalizationType,
    ...(!usingUmapDataset && forceNormalizationType === 'strength'
      ? { edgeWeightAttribute: edgeAttribute }
      : {}),
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
    theme: resolveAppTheme(),
    ui: false,
    fileDrop: true,
    networkSource: {
      name: datasetInfo?.label ?? datasetInfo?.name ?? 'network',
      baseName: datasetInfo?.label ?? datasetInfo?.name ?? 'network',
      format: usingExportedUmapDataset ? 'zxnet' : null,
    },
    // Warm up mapper application so first render is quick on large graphs.
    // prewarm: true,
  };
  if (startupOptions !== undefined) {
    heliosOptions.startup = startupOptions;
  }
  if (cameraOptions !== undefined) {
    heliosOptions.camera = cameraOptions;
  }
  const sessionOptions = resolveSessionOptions();
  if (sessionOptions === false) {
    heliosOptions.storage = false;
  } else {
    Object.assign(heliosOptions, resolvePersistenceOptions(datasetInfo?.label ?? datasetInfo?.name ?? 'network'));
  }
  const rendererPreference = resolveRendererPreference();
  if (rendererPreference) {
    heliosOptions.renderer = rendererPreference;
  }
  if (sessionOptions !== undefined) {
    heliosOptions.session = sessionOptions;
  }

  if (layoutType === 'none' && !usingExportedUmapDataset) {
    console.log("No layout selected, seeding grid positions...");
    seedGridPositions();
  }
  
  console.log("Creating helios-web instance...");
  const helios = new Helios(network, heliosOptions);
  window.__helios = helios;
  demoStartupOverlay?.remove?.();

  console.log("Waiting for helios to be ready...");
  await helios.ready;
  window.__snapshotDelegatePositions = () => helios.snapshotDelegatePositions();
  window.__syncDelegatePositionsToNetwork = () => helios.syncDelegatePositionsToNetwork();

  console.log("Helios is ready!");

  // Optional UI overlay demo (panels, theming, attribute bindings).
  const heliosUI = new HeliosUI({ helios, theme: resolveAppTheme(), allowDrag: true });
  heliosUI.createDemoPanel();
  heliosUI.createMetricsPanel();
  window.__heliosUI = heliosUI;

  heliosUI.createMappersPanel({ dock: 'top-right', position: { x: 16, y: 16 } });
  heliosUI.createLayoutPanel({ dock: 'top-right', position: { x: 16, y: 360 } });
  heliosUI.createLegendsPanel({ dock: 'top-right', position: { x: 16, y: 560 } });
  heliosUI.createFilterPanel({ dock: 'top-right' });
  heliosUI.createCameraPanel({ dock: 'top-right' });
  const selectionPanel = heliosUI.createSelectionPanel({
    dock: 'top-right',
  });
  window.__heliosSelectionPanel = selectionPanel;
  if (helios.debugEnabled !== false) {
    heliosUI.createDebugPanel({ dock: 'right' });
  }

  helios.on(EVENTS.NETWORK_REPLACED, () => {
    helios.requestFrameNetwork?.({ paddingPx: 24 });
  });
  

  console.log("Misc diagnostics...");
  const activeNetwork = helios.network;
  const rendererType = helios.renderer?.device?.type ?? helios.renderer?.constructor?.name ?? 'unknown';
  diagnostics.ready = true;
  diagnostics.renderer = rendererType;
  diagnostics.dataset = dataset;
  diagnostics.nodeCount = activeNetwork?.nodeCount ?? nodeCount;
  diagnostics.edgeCount = activeNetwork?.edgeCount ?? 0;
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
