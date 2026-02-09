import HeliosNetwork, { AttributeType } from 'helios-network';
// When consuming the published package use `import { Helios } from 'helios-web-next';`
import { Helios, EVENTS, HeliosUI } from '../../../src/index.js';
import { UIAttribute } from '../../../src/ui/state/UIAttribute.js';
import { createSliderRow } from '../../../src/ui/controls/createSliderRow.js';

// Set this to an object like { helios: true, mapper: true, scheduler: true } to re-enable debug logs.
const DEFAULT_NODE_COUNT = 2_000;
const DEBUG_CONFIG = null;

function resolveRendererPreference() {
  const params = new URLSearchParams(window.location.search);
  const renderer = params.get('renderer');
  if (renderer === 'webgl') return 'webgl';
  if (renderer === 'webgpu') return 'webgpu';
  return null;
}

function resolveWebgpuBackend() {
  const params = new URLSearchParams(window.location.search);
  const backend = (params.get('webgpuBackend') ?? '').toLowerCase();
  if (backend === 'indirect' || backend === 'dense') return backend;
  return null;
}

function resolveWebglBackend() {
  const params = new URLSearchParams(window.location.search);
  const backend = (params.get('webglBackend') ?? '').toLowerCase();
  if (backend === 'indirect' || backend === 'dense') return backend;
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
  if (!layout) return 'd3force3d';
  const normalized = layout.toLowerCase();
  if (normalized === 'none' || normalized === 'static') return 'none';
  if (normalized === 'jitter' || normalized === 'legacy') return 'jitter';
  if (normalized === 'd3force3d' || normalized === 'd3-force-3d') return 'd3force3d';
  return 'force3d';
}

function resolveLayoutIntervalMs() {
  const params = new URLSearchParams(window.location.search);
  const value = Number(params.get('layoutIntervalMs') ?? params.get('layoutInterval'));
  if (Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  return 0;
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
  const categoryAttribute = 'category';
  network.defineNodeAttribute(nodeAttribute, AttributeType.Float);
  network.defineNodeAttribute(categoryAttribute, AttributeType.String);
  network.defineEdgeAttribute(edgeAttribute, AttributeType.Float);

  console.log("Adding nodes...");
  const nodeCount = resolveNodeCount();
  const nodes = network.addNodes(nodeCount);

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
  }
  network.categorizeNodeAttribute(categoryAttribute, { sortOrder: 'frequency' });

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
  const edges = [];
  const is3D = resolveMode() === '3d';

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

  const edgeIds = network.addEdges(edges);
  // network node and edge count
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

  console.log("Defining helios options...");
  const target = document.getElementById('app');
  const mode = resolveMode();
  const layoutType = resolveLayoutType();
  let layoutIntervalMs = resolveLayoutIntervalMs();
  const edgeTransparency = resolveEdgeTransparencyMode();
  const webgpuBackend = resolveWebgpuBackend();
  const webglBackend = resolveWebglBackend();
  const heliosOptions = {
    container: target,
    layout: layoutType === 'none'
      ? { type: 'static', options: { bounds: [-500, -500, 500, 500] } }
      : layoutType === 'd3force3d'
        ? {
            type: 'd3force3d',
            options: {
              settings: {
                use2D: mode !== '3d',
              },
              updateIntervalMs: layoutIntervalMs,
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
              updateIntervalMs: layoutIntervalMs,
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
  if (webgpuBackend) {
    heliosOptions.webgpuBackend = webgpuBackend;
  }
  if (webglBackend) {
    heliosOptions.webglBackend = webglBackend;
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
 
  const usesIndirectBackend = (
    (webgpuBackend === 'indirect' && helios.renderer?.device?.type === 'webgpu')
    || (webglBackend === 'indirect' && helios.renderer?.device?.type === 'webgl2')
  );

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

  const createLayoutPanel = () => {
    const content = document.createElement('div');

    const createRow = (title, control) => {
      const row = document.createElement('div');
      row.className = 'helios-ui-row helios-ui-row--aligned';
      const label = document.createElement('div');
      label.className = 'helios-ui-label';
      const titleRow = document.createElement('div');
      titleRow.className = 'helios-ui-label__title-row';
      const titleEl = document.createElement('div');
      titleEl.className = 'helios-ui-label__title';
      titleEl.textContent = title;
      titleRow.appendChild(titleEl);
      label.appendChild(titleRow);
      row.appendChild(label);
      const controlWrap = document.createElement('div');
      controlWrap.className = 'helios-ui-row__controls';
      if (control) controlWrap.appendChild(control);
      row.appendChild(controlWrap);
      return row;
    };

    const layoutSelect = document.createElement('select');
    layoutSelect.className = 'helios-ui-select';
    const options = [
      { value: 'force3d', label: 'Force (worker)' },
      { value: 'd3force3d', label: 'D3 Force 3D (worker)' },
      { value: 'jitter', label: 'Jitter (worker)' },
      { value: 'none', label: 'Static (no layout)' },
    ];
    for (const entry of options) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      layoutSelect.appendChild(opt);
    }
    layoutSelect.value = layoutType;

    const layoutIntervalSelect = document.createElement('select');
    layoutIntervalSelect.className = 'helios-ui-select';
    const intervalOptions = [
      { value: 0, label: 'Real-time' },
      { value: 250, label: '250 ms' },
      { value: 1000, label: '1 s' },
      { value: 2000, label: '2 s' },
    ];
    for (const entry of intervalOptions) {
      const opt = document.createElement('option');
      opt.value = String(entry.value);
      opt.textContent = entry.label;
      layoutIntervalSelect.appendChild(opt);
    }
    layoutIntervalSelect.value = String(layoutIntervalMs);

    const interpolatorToggle = document.createElement('button');
    interpolatorToggle.type = 'button';
    interpolatorToggle.className = 'helios-ui-toggle';
    interpolatorToggle.setAttribute('role', 'switch');
    interpolatorToggle.setAttribute('aria-checked', 'false');
    const toggleThumb = document.createElement('span');
    toggleThumb.className = 'helios-ui-toggle__thumb';
    toggleThumb.setAttribute('aria-hidden', 'true');
    const toggleText = document.createElement('span');
    toggleText.className = 'helios-ui-toggle__text';
    toggleText.textContent = 'Off';
    interpolatorToggle.appendChild(toggleThumb);
    interpolatorToggle.appendChild(toggleText);

    const updateInterpolatorLabel = () => {
      const enabled = interpolatorToggle.getAttribute('aria-checked') === 'true';
      toggleText.textContent = enabled ? 'On' : 'Off';
    };
    updateInterpolatorLabel();

    let interpolationSmoothness = 6;
    let interpolationTargetRemaining = 0.1;
    let interpolationBackend = 'auto';

    const backendSelect = document.createElement('select');
    backendSelect.className = 'helios-ui-select';
    backendSelect.setAttribute('aria-label', 'Interpolation backend');
    const backendOptions = [
      { value: 'auto', label: 'Auto' },
      { value: 'cpu', label: 'CPU' },
      { value: 'network', label: 'Network' },
    ];
    for (const entry of backendOptions) {
      const option = document.createElement('option');
      option.value = entry.value;
      option.textContent = entry.label;
      backendSelect.appendChild(option);
    }
    backendSelect.value = interpolationBackend;

    const smoothnessAttribute = UIAttribute.number({
      id: 'interpolation-smoothness',
      label: 'Interpolation smoothness',
      min: 1,
      max: 12,
      step: 0.5,
      get: () => interpolationSmoothness,
      set: (value) => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        interpolationSmoothness = next;
        if (interpolatorToggle.getAttribute('aria-checked') === 'true') {
          applyInterpolation();
        }
      },
    });

    const remainingAttribute = UIAttribute.number({
      id: 'interpolation-remaining',
      label: 'Interpolation remaining',
      min: 0.01,
      max: 0.5,
      step: 0.01,
      get: () => interpolationTargetRemaining,
      set: (value) => {
        const next = Number(value);
        if (!Number.isFinite(next)) return;
        interpolationTargetRemaining = next;
        if (interpolatorToggle.getAttribute('aria-checked') === 'true') {
          applyInterpolation();
        }
      },
    });

    const smoothnessRow = createSliderRow(smoothnessAttribute, { step: 0.5, precision: 1 });
    const remainingRow = createSliderRow(remainingAttribute, { step: 0.01, precision: 2 });

    const applyInterpolation = () => {
      if (usesIndirectBackend) {
        interpolatorToggle.setAttribute('aria-checked', 'false');
        updateInterpolatorLabel();
        interpolatorToggle.disabled = true;
        backendSelect.disabled = true;
        smoothnessRow.element.style.display = 'none';
        remainingRow.element.style.display = 'none';
        helios.interpolation({ enabled: false, backend: interpolationBackend });
        return;
      }
      const enabled = interpolatorToggle.getAttribute('aria-checked') === 'true';
      let backend = interpolationBackend;
      if (backend === 'auto') {
        backend = typeof helios?.network?.interpolateNodeAttribute === 'function' ? 'network' : 'cpu';
      }
      smoothnessRow.element.style.display = backend === 'cpu' ? '' : 'none';
      remainingRow.element.style.display = backend === 'cpu' ? 'none' : '';
      const interpolationOptions = {
        enabled,
        backend,
        minDisplacementRatio: 0.0005,
      };
      if (backend === 'cpu') {
        interpolationOptions.smoothing = interpolationSmoothness;
      } else {
        interpolationOptions.autoSmoothing = true;
        interpolationOptions.targetRemaining = interpolationTargetRemaining;
      }
      helios.interpolation(interpolationOptions);
    };

    const applyLayout = (value) => {
      const bounds = [-500, -500, 500, 500];
      if (value === 'none') {
        seedGridPositions();
        const layoutInstance = helios.createLayout({ type: 'static', options: { bounds } });
        helios.layout(layoutInstance);
        return;
      }
      if (value === 'd3force3d') {
        const layoutInstance = helios.createLayout({
          type: 'd3force3d',
          options: {
            settings: {
              use2D: mode !== '3d',
            },
            updateIntervalMs: layoutIntervalMs,
          },
        });
        helios.layout(layoutInstance);
        return;
      }
      const workerOptions = {
        layout: value,
        mode,
        center: [0, 0, 0],
        radius: 220 * Math.sqrt(nodeCount / 1000),
        depth: mode === '3d' ? 140 : 0,
        updateIntervalMs: layoutIntervalMs,
        kRepulsion: 3,
        kAttraction: 0.003,
        kGravity: 0.0008,
        repulsionStrategy: 'barnes-hut',
        negativesPerNode: 64,
        negativeSampling: true,
      };
      const layoutInstance = helios.createLayout({ type: 'worker', options: workerOptions });
      helios.layout(layoutInstance);
    };

    layoutSelect.addEventListener('change', () => {
      applyLayout(layoutSelect.value);
    });

    layoutIntervalSelect.addEventListener('change', () => {
      const next = Number(layoutIntervalSelect.value);
      layoutIntervalMs = Number.isFinite(next) ? Math.max(0, next) : 0;
      applyLayout(layoutSelect.value);
    });

    interpolatorToggle.addEventListener('click', () => {
      const next = interpolatorToggle.getAttribute('aria-checked') !== 'true';
      interpolatorToggle.setAttribute('aria-checked', next ? 'true' : 'false');
      updateInterpolatorLabel();
      applyInterpolation();
    });

    backendSelect.addEventListener('change', () => {
      interpolationBackend = backendSelect.value;
      applyInterpolation();
    });

    applyInterpolation();

    content.appendChild(createRow('Layout', layoutSelect));
    content.appendChild(createRow('Layout interval', layoutIntervalSelect));
    content.appendChild(createRow('Interpolation', interpolatorToggle));
    content.appendChild(createRow('Interpolation backend', backendSelect));
    content.appendChild(smoothnessRow.element);
    content.appendChild(remainingRow.element);

    return heliosUI.createPanel({
      id: 'helios-ui-layout',
      title: 'Layout',
      dock: 'top-right',
      position: { x: 16, y: 360 },
      content,
    });
  };

  createLayoutPanel();

  helios.on(EVENTS.NETWORK_REPLACED, () => {
    configureDemoMappers();
    helios.requestFrameNetwork?.({ paddingPx: 24 });
  });

  console.log("Changing edge scaling...");
  // Make edges visibly thicker for the demo.
  helios.edgeWidthScale(1.0).edgeWidthBase(0);
  helios.edgeOpacityScale(0.5);
  

  console.log("Picking");

  // --- State interactions demo -------------------------------------------------
  // Click selects a node; clicking empty space deselects.
  // Hover highlights a node.
  // Double-click filters (hides) a node; double-click empty space resets filters.
  //
  // Requires node picking to be enabled (uses the internal $index pick targets).
  console.log('Enabling state interactions (hover/click/dblclick)...');
  const STATES = Helios.STATES;
  helios
    .resetStateStyles()
    // FILTERED: hide.
    .nodeStateStyle('FILTERED', { discard: true })
    // SELECTED: bigger and brighter.
    .nodeStateStyle('SELECTED', { sizeMul: 1.4, opacityMul: 1.0, outlineMul: 2.0, colorAdd: [0.25, 0.25, 0.25, 0] })
    // HIGHLIGHTED: slightly bigger and tint.
    .nodeStateStyle('HIGHLIGHTED', { sizeMul: 1.15, opacityMul: 1.0, outlineMul: 1.2, colorAdd: [0.0, 0.25, 0.25, 0] });

  helios.enableNodePicking({ resolutionScale: 0.25, trackDepth: false, maxFps: 15 });

  let highlightedNode = null;
  let selectedNode = null;
  const filteredNodes = new Set();

  const clearSelected = () => {
    if (selectedNode != null) {
      helios.nodeState([selectedNode], 'SELECTED', { mode: 'remove' });
      selectedNode = null;
    }
  };

  const clearFiltered = () => {
    if (!filteredNodes.size) return;
    helios.nodeState(Array.from(filteredNodes), 'FILTERED', { mode: 'remove' });
    filteredNodes.clear();
  };

  helios.on('node:hover', (e) => {
    const detail = e?.detail;
    if (!detail) return;
    const index = detail.index;
    if (detail.state === 'in') {
      highlightedNode = index;
      helios.hoverNodeState(index, 'HIGHLIGHTED');
    } else if (detail.state === 'out') {
      if (highlightedNode === index) {
        helios.hoverNodeState(null, 0);
        highlightedNode = null;
      }
    }
  });

  // Click and double-click are emitted even when the background is clicked (kind === null).
  helios.on('graph:click', (e) => {
    const detail = e?.detail;
    if (!detail) return;
    if (detail.kind === 'node' && detail.index >= 0) {
      const index = detail.index;
      if (selectedNode != null && selectedNode !== index) {
        helios.nodeState([selectedNode], 'SELECTED', { mode: 'remove' });
      }
      selectedNode = index;
      helios.nodeState([index], 'SELECTED', { mode: 'add' });
      return;
    }
    // Background click or edge click: clear selection.
    clearSelected();
  });

  helios.on('graph:dblclick', (e) => {
    const detail = e?.detail;
    if (!detail) return;
    if (detail.kind === 'node' && detail.index >= 0) {
      clearFiltered();
      filteredNodes.add(detail.index);
      helios.nodeState([detail.index], 'FILTERED', { mode: 'add' });
      return;
    }
    // Background double-click or edge double-click: reset filters.
    clearFiltered();
  });


  console.log("Misc diagnostics...");
  const rendererType = helios.renderer?.device?.type ?? helios.renderer?.constructor?.name ?? 'unknown';
  diagnostics.ready = true;
  diagnostics.renderer = rendererType;
  diagnostics.nodeCount = nodes.length;
  diagnostics.edgeCount = edgeIds.length;
  window.__HELIOS_DIAGNOSTICS__ = diagnostics;
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
