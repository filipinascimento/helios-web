import { Layer } from './Layer.js';
import { VISUAL_ATTRIBUTE_NAMES } from '../../pipeline/constants.js';

const {
  EDGE_COLOR_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_ENDPOINTS_STATE_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  NODE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

export { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './GraphLayerCommon.js';

const DENSE_GRAPH_NODE_REQUESTS = [
  ['node', NODE_POSITION_ATTRIBUTE],
  ['node', NODE_COLOR_ATTRIBUTE],
  ['node', NODE_SIZE_ATTRIBUTE],
  ['node', NODE_STATE_ATTRIBUTE],
  ['node', NODE_OUTLINE_WIDTH_ATTRIBUTE],
  ['node', NODE_OUTLINE_COLOR_ATTRIBUTE],
];

const DENSE_GRAPH_EDGE_REQUESTS = [
  ['edge', EDGE_COLOR_ATTRIBUTE],
  ['edge', EDGE_OPACITY_ATTRIBUTE],
  ['edge', EDGE_WIDTH_ATTRIBUTE],
  ['edge', EDGE_STATE_ATTRIBUTE],
  ['edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE],
  ['edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE],
  ['edge', EDGE_ENDPOINTS_STATE_ATTRIBUTE],
];

export class GraphLayer extends Layer {
  static NO_HOVER_INDEX = 0xffffffff;

  constructor(options = {}) {
    super('graph-layer');
    this.emptyFloat = new Float32Array(0);
    this.emptyUint = new Uint32Array(0);
    const requestedSlots = Number(options.stateSlots);
    const clampedSlots = Number.isFinite(requestedSlots) ? Math.floor(requestedSlots) : 4;
    this.stateSlotCount = Math.min(32, Math.max(0, clampedSlots));
    this.edgeRenderingMode = options.edgeRendering === 'line' ? 'line' : 'quad';
    const mode = options.transparencyModeEdges;
    this.edgeTransparencyMode = this.isSupportedTransparencyMode(mode) ? mode : 'alpha';
    this.nodeOpacityBase = 0;
    this.nodeOpacityScale = 1;
    this.nodeSizeBase = 0;
    this.nodeSizeScale = 1;
    this.nodeOutlineWidthBase = 0;
    this.nodeOutlineWidthScale = 0;
    this.nodeOutlineColor = options.nodeOutlineColor ?? [0, 0, 0, 1];
    this.nodeOutlineUseAttributes = options.nodeOutlineUseAttributes === true;
    this.edgeOpacityBase = 0;
    this.edgeOpacityScale = 1;
    this.edgeWidthBase = 0;
    this.edgeWidthScale = 1;
    this.edgeEndpointTrim = Number.isFinite(options.edgeEndpointTrim) ? options.edgeEndpointTrim : 0.8;
    this.nodeBlendWithEdges = options.nodeBlendWithEdges === true;
    this.edgeDepthWrite = options.edgeDepthWrite === true;
    this.fallbackCameraUniforms = null;
    this.loggedWeightedActive = false;

    const slots = this.stateSlotCount;
    this.nodeStateScale = new Float32Array(slots * 4);
    this.nodeStateColorMul = new Float32Array(slots * 4);
    this.nodeStateColorAdd = new Float32Array(slots * 4);
    this.nodeNoStateScale = new Float32Array(4);
    this.nodeNoStateColorMul = new Float32Array(4);
    this.nodeNoStateColorAdd = new Float32Array(4);
    this.edgeStateScale = new Float32Array(slots * 4);
    this.edgeStateColorMul = new Float32Array(slots * 4);
    this.edgeStateColorAdd = new Float32Array(slots * 4);
    this.edgeNoStateScale = new Float32Array(4);
    this.edgeNoStateColorMul = new Float32Array(4);
    this.edgeNoStateColorAdd = new Float32Array(4);

    this.hoveredNodeIndex = GraphLayer.NO_HOVER_INDEX;
    this.hoveredNodeState = 0;
    this.hoveredEdgeIndex = GraphLayer.NO_HOVER_INDEX;
    this.hoveredEdgeState = 0;
    this.resetStateStyles();
  }

  setHoveredNodeState(index, mask) {
    const nextIndex =
      index == null || Number(index) < 0
        ? GraphLayer.NO_HOVER_INDEX
        : (Number(index) >>> 0);
    this.hoveredNodeIndex = nextIndex;
    this.hoveredNodeState = (Number(mask) >>> 0);
    return this;
  }

  setHoveredEdgeState(index, mask) {
    const nextIndex =
      index == null || Number(index) < 0
        ? GraphLayer.NO_HOVER_INDEX
        : (Number(index) >>> 0);
    this.hoveredEdgeIndex = nextIndex;
    this.hoveredEdgeState = (Number(mask) >>> 0);
    return this;
  }

  resetStateStyles() {
    const slots = this.stateSlotCount;
    for (let i = 0; i < slots; i += 1) {
      const o = i * 4;
      this.nodeStateScale[o + 0] = 1;
      this.nodeStateScale[o + 1] = 1;
      this.nodeStateScale[o + 2] = 1;
      this.nodeStateScale[o + 3] = 0;
      this.nodeStateColorMul[o + 0] = 1;
      this.nodeStateColorMul[o + 1] = 1;
      this.nodeStateColorMul[o + 2] = 1;
      this.nodeStateColorMul[o + 3] = 1;
      this.nodeStateColorAdd[o + 0] = 0;
      this.nodeStateColorAdd[o + 1] = 0;
      this.nodeStateColorAdd[o + 2] = 0;
      this.nodeStateColorAdd[o + 3] = 0;

      this.edgeStateScale[o + 0] = 1;
      this.edgeStateScale[o + 1] = 1;
      this.edgeStateScale[o + 2] = 1;
      this.edgeStateScale[o + 3] = 0;
      this.edgeStateColorMul[o + 0] = 1;
      this.edgeStateColorMul[o + 1] = 1;
      this.edgeStateColorMul[o + 2] = 1;
      this.edgeStateColorMul[o + 3] = 1;
      this.edgeStateColorAdd[o + 0] = 0;
      this.edgeStateColorAdd[o + 1] = 0;
      this.edgeStateColorAdd[o + 2] = 0;
      this.edgeStateColorAdd[o + 3] = 0;
    }

    // NO_STATE styles (applied when state bitmask is 0).
    this.nodeNoStateScale[0] = 1;
    this.nodeNoStateScale[1] = 1;
    this.nodeNoStateScale[2] = 1;
    this.nodeNoStateScale[3] = 0;
    this.nodeNoStateColorMul[0] = 1;
    this.nodeNoStateColorMul[1] = 1;
    this.nodeNoStateColorMul[2] = 1;
    this.nodeNoStateColorMul[3] = 1;
    this.nodeNoStateColorAdd[0] = 0;
    this.nodeNoStateColorAdd[1] = 0;
    this.nodeNoStateColorAdd[2] = 0;
    this.nodeNoStateColorAdd[3] = 0;

    this.edgeNoStateScale[0] = 1;
    this.edgeNoStateScale[1] = 1;
    this.edgeNoStateScale[2] = 1;
    this.edgeNoStateScale[3] = 0;
    this.edgeNoStateColorMul[0] = 1;
    this.edgeNoStateColorMul[1] = 1;
    this.edgeNoStateColorMul[2] = 1;
    this.edgeNoStateColorMul[3] = 1;
    this.edgeNoStateColorAdd[0] = 0;
    this.edgeNoStateColorAdd[1] = 0;
    this.edgeNoStateColorAdd[2] = 0;
    this.edgeNoStateColorAdd[3] = 0;
  }

  setNodeStateStyle(slot, style = {}) {
    const index = Number(slot);
    if (!Number.isInteger(index) || index < 0 || index >= this.stateSlotCount) return;
    const o = index * 4;
    if (style.sizeMul != null) this.nodeStateScale[o + 0] = Number(style.sizeMul);
    if (style.opacityMul != null) this.nodeStateScale[o + 1] = Number(style.opacityMul);
    if (style.outlineMul != null) this.nodeStateScale[o + 2] = Number(style.outlineMul);
    if (style.discard != null) this.nodeStateScale[o + 3] = style.discard ? 1 : 0;
    if (style.colorMul != null) {
      const v = style.colorMul;
      this.nodeStateColorMul[o + 0] = v[0] ?? this.nodeStateColorMul[o + 0];
      this.nodeStateColorMul[o + 1] = v[1] ?? this.nodeStateColorMul[o + 1];
      this.nodeStateColorMul[o + 2] = v[2] ?? this.nodeStateColorMul[o + 2];
      this.nodeStateColorMul[o + 3] = v[3] ?? this.nodeStateColorMul[o + 3];
    }
    if (style.colorAdd != null) {
      const v = style.colorAdd;
      this.nodeStateColorAdd[o + 0] = v[0] ?? this.nodeStateColorAdd[o + 0];
      this.nodeStateColorAdd[o + 1] = v[1] ?? this.nodeStateColorAdd[o + 1];
      this.nodeStateColorAdd[o + 2] = v[2] ?? this.nodeStateColorAdd[o + 2];
      this.nodeStateColorAdd[o + 3] = v[3] ?? this.nodeStateColorAdd[o + 3];
    }
  }

  setNodeNoStateStyle(style = {}) {
    if (style.sizeMul != null) this.nodeNoStateScale[0] = Number(style.sizeMul);
    if (style.opacityMul != null) this.nodeNoStateScale[1] = Number(style.opacityMul);
    if (style.outlineMul != null) this.nodeNoStateScale[2] = Number(style.outlineMul);
    if (style.discard != null) this.nodeNoStateScale[3] = style.discard ? 1 : 0;
    if (style.colorMul != null) {
      const v = style.colorMul;
      this.nodeNoStateColorMul[0] = v[0] ?? this.nodeNoStateColorMul[0];
      this.nodeNoStateColorMul[1] = v[1] ?? this.nodeNoStateColorMul[1];
      this.nodeNoStateColorMul[2] = v[2] ?? this.nodeNoStateColorMul[2];
      this.nodeNoStateColorMul[3] = v[3] ?? this.nodeNoStateColorMul[3];
    }
    if (style.colorAdd != null) {
      const v = style.colorAdd;
      this.nodeNoStateColorAdd[0] = v[0] ?? this.nodeNoStateColorAdd[0];
      this.nodeNoStateColorAdd[1] = v[1] ?? this.nodeNoStateColorAdd[1];
      this.nodeNoStateColorAdd[2] = v[2] ?? this.nodeNoStateColorAdd[2];
      this.nodeNoStateColorAdd[3] = v[3] ?? this.nodeNoStateColorAdd[3];
    }
  }

  setEdgeStateStyle(slot, style = {}) {
    const index = Number(slot);
    if (!Number.isInteger(index) || index < 0 || index >= this.stateSlotCount) return;
    const o = index * 4;
    if (style.widthMul != null) this.edgeStateScale[o + 0] = Number(style.widthMul);
    if (style.opacityMul != null) this.edgeStateScale[o + 1] = Number(style.opacityMul);
    if (style.discard != null) this.edgeStateScale[o + 3] = style.discard ? 1 : 0;
    if (style.colorMul != null) {
      const v = style.colorMul;
      this.edgeStateColorMul[o + 0] = v[0] ?? this.edgeStateColorMul[o + 0];
      this.edgeStateColorMul[o + 1] = v[1] ?? this.edgeStateColorMul[o + 1];
      this.edgeStateColorMul[o + 2] = v[2] ?? this.edgeStateColorMul[o + 2];
      this.edgeStateColorMul[o + 3] = v[3] ?? this.edgeStateColorMul[o + 3];
    }
    if (style.colorAdd != null) {
      const v = style.colorAdd;
      this.edgeStateColorAdd[o + 0] = v[0] ?? this.edgeStateColorAdd[o + 0];
      this.edgeStateColorAdd[o + 1] = v[1] ?? this.edgeStateColorAdd[o + 1];
      this.edgeStateColorAdd[o + 2] = v[2] ?? this.edgeStateColorAdd[o + 2];
      this.edgeStateColorAdd[o + 3] = v[3] ?? this.edgeStateColorAdd[o + 3];
    }
  }

  setEdgeNoStateStyle(style = {}) {
    if (style.widthMul != null) this.edgeNoStateScale[0] = Number(style.widthMul);
    if (style.opacityMul != null) this.edgeNoStateScale[1] = Number(style.opacityMul);
    if (style.discard != null) this.edgeNoStateScale[3] = style.discard ? 1 : 0;
    if (style.colorMul != null) {
      const v = style.colorMul;
      this.edgeNoStateColorMul[0] = v[0] ?? this.edgeNoStateColorMul[0];
      this.edgeNoStateColorMul[1] = v[1] ?? this.edgeNoStateColorMul[1];
      this.edgeNoStateColorMul[2] = v[2] ?? this.edgeNoStateColorMul[2];
      this.edgeNoStateColorMul[3] = v[3] ?? this.edgeNoStateColorMul[3];
    }
    if (style.colorAdd != null) {
      const v = style.colorAdd;
      this.edgeNoStateColorAdd[0] = v[0] ?? this.edgeNoStateColorAdd[0];
      this.edgeNoStateColorAdd[1] = v[1] ?? this.edgeNoStateColorAdd[1];
      this.edgeNoStateColorAdd[2] = v[2] ?? this.edgeNoStateColorAdd[2];
      this.edgeNoStateColorAdd[3] = v[3] ?? this.edgeNoStateColorAdd[3];
    }
  }

  setEdgeRenderingMode(mode) {
    if (mode === 'line' || mode === 'quad') {
      this.edgeRenderingMode = mode;
    }
  }

  setEdgeTransparencyMode(mode) {
    if (this.isSupportedTransparencyMode(mode)) {
      this.edgeTransparencyMode = mode;
    }
  }

  isSupportedTransparencyMode(mode) {
    return mode === 'alpha' ||
      mode === 'weighted' ||
      mode === 'additive' ||
      mode === 'screen' ||
      mode === 'max' ||
      mode === 'additive-normalized' ||
      mode === 'additive-tonemapped' ||
      mode === 'additive-normalized-bright';
  }

  getCameraUniforms(camera) {
    if (camera?.getUniforms) {
      const uniforms = camera.getUniforms();
      if (!this.ensureFinite(uniforms?.viewProjection) || !this.ensureFinite(uniforms?.view)) {
        console.warn('GraphLayer: camera matrices invalid, falling back to identity.', {
          view: uniforms?.view,
          projection: uniforms?.projection,
          viewProjection: uniforms?.viewProjection,
        });
        return this.getFallbackCameraUniforms();
      }
      return uniforms;
    }
    return this.getFallbackCameraUniforms();
  }

  ensureFinite(array) {
    if (!array) return false;
    for (let i = 0; i < array.length; i += 1) {
      if (!Number.isFinite(array[i])) return false;
    }
    return true;
  }

  getFallbackCameraUniforms() {
    if (!this.fallbackCameraUniforms) {
      const identity = new Float32Array(16);
      identity[0] = 1;
      identity[5] = 1;
      identity[10] = 1;
      identity[15] = 1;
      this.fallbackCameraUniforms = {
        view: identity,
        projection: identity,
        viewProjection: identity,
        position: new Float32Array([0, 0, 1]),
        right: new Float32Array([1, 0, 0]),
        up: new Float32Array([0, 1, 0]),
        mode: '2d',
        projectionType: 'orthographic',
        viewport: { width: 1, height: 1, devicePixelRatio: 1 },
      };
    }
    return this.fallbackCameraUniforms;
  }

  updateDenseGraphBuffers(network) {
    if (!network) return false;
    const updates = [
      () => network.updateDenseNodeIndexBuffer?.(),
      () => network.updateDenseEdgeIndexBuffer?.(),
    ];
    const addNode = (name) => {
      if (typeof network.updateDenseNodeAttributeBuffer !== 'function') return;
      if (typeof network.hasNodeAttribute === 'function' && !network.hasNodeAttribute(name)) return;
      updates.push(() => network.updateDenseNodeAttributeBuffer(name));
    };
    const addEdge = (name) => {
      if (typeof network.updateDenseEdgeAttributeBuffer !== 'function') return;
      if (typeof network.hasEdgeAttribute === 'function' && !network.hasEdgeAttribute(name, true)) return;
      updates.push(() => network.updateDenseEdgeAttributeBuffer(name));
    };
    addNode(NODE_POSITION_ATTRIBUTE);
    addNode(NODE_COLOR_ATTRIBUTE);
    addNode(NODE_SIZE_ATTRIBUTE);
    addNode(NODE_STATE_ATTRIBUTE);
    addNode(NODE_OUTLINE_WIDTH_ATTRIBUTE);
    addNode(NODE_OUTLINE_COLOR_ATTRIBUTE);
    addEdge(EDGE_COLOR_ATTRIBUTE);
    addEdge(EDGE_OPACITY_ATTRIBUTE);
    addEdge(EDGE_WIDTH_ATTRIBUTE);
    addEdge(EDGE_STATE_ATTRIBUTE);
    addEdge(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    addEdge(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
    addEdge(EDGE_ENDPOINTS_STATE_ATTRIBUTE);
    for (const fn of updates) {
      if (typeof fn !== 'function') continue;
      try {
        fn();
      } catch (error) {
        console.warn('GraphLayer: failed to update dense buffer', error);
        return false;
      }
    }
    return true;
  }

  getDensePackingInfo(network) {
    if (!network) {
      return { node: null, edge: null };
    }
    const node = typeof network.getDenseNodePackingInfo === 'function'
      ? network.getDenseNodePackingInfo()
      : null;
    const edge = typeof network.getDenseEdgePackingInfo === 'function'
      ? network.getDenseEdgePackingInfo()
      : null;
    return { node, edge };
  }

  getDenseGraphRequests(packing) {
    const includeNodeIndex = !(packing?.node?.indicesAreIdentity);
    const includeEdgeIndex = !(packing?.edge?.indicesAreIdentity);
    const requests = [];
    if (includeNodeIndex) requests.push(['node', 'index']);
    if (includeEdgeIndex) requests.push(['edge', 'index']);
    requests.push(...DENSE_GRAPH_NODE_REQUESTS, ...DENSE_GRAPH_EDGE_REQUESTS);
    return requests;
  }

  getAttributeView(network, scope, name) {
    if (!network) return null;
    try {
      return scope === 'node'
        ? network.getDenseNodeAttributeView(name)
        : network.getDenseEdgeAttributeView(name);
    } catch (_) {
      return null;
    }
  }

  getIndexView(network, scope) {
    if (!network) return null;
    try {
      return scope === 'node' ? network.getDenseNodeIndexView() : network.getDenseEdgeIndexView();
    } catch (_) {
      return null;
    }
  }

  readDenseGraph(network) {
    if (!network) {
      return {
        nodes: {
          positions: this.emptyFloat,
          colors: this.emptyFloat,
          sizes: this.emptyFloat,
          states: this.emptyUint,
          outlineWidths: this.emptyFloat,
          outlineColors: this.emptyFloat,
          indices: this.emptyUint,
          count: 0,
        },
        edges: {
          segments: this.emptyFloat,
          colors: this.emptyFloat,
          widths: this.emptyFloat,
          endpointSizes: this.emptyFloat,
          endpointStates: this.emptyUint,
          indices: this.emptyUint,
          states: this.emptyUint,
          count: 0,
        },
      };
    }
    const nodeIndexDesc = this.getIndexView(network, 'node');
    const edgeIndexDesc = this.getIndexView(network, 'edge');
    const nodePositionsDesc = this.getAttributeView(network, 'node', NODE_POSITION_ATTRIBUTE);
    const nodeColorsDesc = this.getAttributeView(network, 'node', NODE_COLOR_ATTRIBUTE);
    const nodeSizesDesc = this.getAttributeView(network, 'node', NODE_SIZE_ATTRIBUTE);
    const nodeStatesDesc = this.getAttributeView(network, 'node', NODE_STATE_ATTRIBUTE);
    const nodeOutlineWidthDesc = this.getAttributeView(network, 'node', NODE_OUTLINE_WIDTH_ATTRIBUTE);
    const nodeOutlineColorDesc = this.getAttributeView(network, 'node', NODE_OUTLINE_COLOR_ATTRIBUTE);
    const edgeColorDesc = this.getAttributeView(network, 'edge', EDGE_COLOR_ATTRIBUTE);
    const edgeOpacityDesc = this.getAttributeView(network, 'edge', EDGE_OPACITY_ATTRIBUTE);
    const edgeWidthDesc = this.getAttributeView(network, 'edge', EDGE_WIDTH_ATTRIBUTE);
    const edgeStatesDesc = this.getAttributeView(network, 'edge', EDGE_STATE_ATTRIBUTE);
    const edgeSegmentsDesc = this.getAttributeView(network, 'edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    const edgeEndpointSizeDesc = this.getAttributeView(network, 'edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
    const edgeEndpointStatesDesc = this.getAttributeView(network, 'edge', EDGE_ENDPOINTS_STATE_ATTRIBUTE);

    const nodes = {
      positions: nodePositionsDesc?.view ?? this.emptyFloat,
      colors: nodeColorsDesc?.view ?? this.emptyFloat,
      sizes: nodeSizesDesc?.view ?? this.emptyFloat,
      states: nodeStatesDesc?.view ?? this.emptyUint,
      outlineWidths: nodeOutlineWidthDesc?.view ?? this.emptyFloat,
      outlineColors: nodeOutlineColorDesc?.view ?? this.emptyFloat,
      indices: nodeIndexDesc?.view ?? this.emptyUint,
      count:
        nodeIndexDesc?.count ??
        nodePositionsDesc?.count ??
        nodeColorsDesc?.count ??
        nodeSizesDesc?.count ??
        nodeStatesDesc?.count ??
        0,
      versions: {
        positions: nodePositionsDesc?.version ?? 0,
        colors: nodeColorsDesc?.version ?? 0,
        sizes: nodeSizesDesc?.version ?? 0,
        states: nodeStatesDesc?.version ?? 0,
        outlineWidths: nodeOutlineWidthDesc?.version ?? 0,
        outlineColors: nodeOutlineColorDesc?.version ?? 0,
        indices: nodeIndexDesc?.version ?? 0,
        topology: nodeIndexDesc?.topologyVersion ?? 0,
      },
    };

    const edges = {
      segments: edgeSegmentsDesc?.view ?? this.emptyFloat,
      colors: edgeColorDesc?.view ?? this.emptyFloat,
      opacities: edgeOpacityDesc?.view ?? this.emptyFloat,
      widths: edgeWidthDesc?.view ?? this.emptyFloat,
      endpointSizes: edgeEndpointSizeDesc?.view ?? this.emptyFloat,
      endpointStates: edgeEndpointStatesDesc?.view ?? this.emptyUint,
      indices: edgeIndexDesc?.view ?? this.emptyUint,
      states: edgeStatesDesc?.view ?? this.emptyUint,
      count:
        edgeIndexDesc?.count ??
        edgeSegmentsDesc?.count ??
        edgeColorDesc?.count ??
        edgeOpacityDesc?.count ??
        edgeWidthDesc?.count ??
        edgeStatesDesc?.count ??
        0,
      versions: {
        segments: edgeSegmentsDesc?.version ?? 0,
        colors: edgeColorDesc?.version ?? 0,
        opacities: edgeOpacityDesc?.version ?? 0,
        widths: edgeWidthDesc?.version ?? 0,
        endpointSizes: edgeEndpointSizeDesc?.version ?? 0,
        endpointStates: edgeEndpointStatesDesc?.version ?? 0,
        states: edgeStatesDesc?.version ?? 0,
        indices: edgeIndexDesc?.version ?? 0,
        topology: edgeIndexDesc?.topologyVersion ?? 0,
      },
    };

    return { nodes, edges };
  }

  readDenseGraphFromViews(views, packing) {
    if (!views) return this.readDenseGraph(null);

    const nodeIndexDesc = views.node?.index ?? null;
    const edgeIndexDesc = views.edge?.index ?? null;
    const nodePositionsDesc = views.node?.[NODE_POSITION_ATTRIBUTE] ?? null;
    const nodeColorsDesc = views.node?.[NODE_COLOR_ATTRIBUTE] ?? null;
    const nodeSizesDesc = views.node?.[NODE_SIZE_ATTRIBUTE] ?? null;
    const nodeStatesDesc = views.node?.[NODE_STATE_ATTRIBUTE] ?? null;
    const nodeOutlineWidthDesc = views.node?.[NODE_OUTLINE_WIDTH_ATTRIBUTE] ?? null;
    const nodeOutlineColorDesc = views.node?.[NODE_OUTLINE_COLOR_ATTRIBUTE] ?? null;
    const edgeColorDesc = views.edge?.[EDGE_COLOR_ATTRIBUTE] ?? null;
    const edgeOpacityDesc = views.edge?.[EDGE_OPACITY_ATTRIBUTE] ?? null;
    const edgeWidthDesc = views.edge?.[EDGE_WIDTH_ATTRIBUTE] ?? null;
    const edgeStatesDesc = views.edge?.[EDGE_STATE_ATTRIBUTE] ?? null;
    const edgeSegmentsDesc = views.edge?.[EDGE_ENDPOINTS_POSITION_ATTRIBUTE] ?? null;
    const edgeEndpointSizeDesc = views.edge?.[EDGE_ENDPOINTS_SIZE_ATTRIBUTE] ?? null;
    const edgeEndpointStatesDesc = views.edge?.[EDGE_ENDPOINTS_STATE_ATTRIBUTE] ?? null;

    const nodes = {
      positions: nodePositionsDesc?.view ?? this.emptyFloat,
      colors: nodeColorsDesc?.view ?? this.emptyFloat,
      sizes: nodeSizesDesc?.view ?? this.emptyFloat,
      states: nodeStatesDesc?.view ?? this.emptyUint,
      outlineWidths: nodeOutlineWidthDesc?.view ?? this.emptyFloat,
      outlineColors: nodeOutlineColorDesc?.view ?? this.emptyFloat,
      indices: nodeIndexDesc?.view ?? this.emptyUint,
      count:
        nodeIndexDesc?.count ??
        nodePositionsDesc?.count ??
        nodeColorsDesc?.count ??
        nodeSizesDesc?.count ??
        nodeStatesDesc?.count ??
        packing?.node?.count ??
        0,
      versions: {
        positions: nodePositionsDesc?.version ?? 0,
        colors: nodeColorsDesc?.version ?? 0,
        sizes: nodeSizesDesc?.version ?? 0,
        states: nodeStatesDesc?.version ?? 0,
        outlineWidths: nodeOutlineWidthDesc?.version ?? 0,
        outlineColors: nodeOutlineColorDesc?.version ?? 0,
        indices: nodeIndexDesc?.version ?? 0,
        topology: nodeIndexDesc?.topologyVersion ?? nodePositionsDesc?.topologyVersion ?? 0,
      },
      packing: packing?.node ?? null,
    };

    const edges = {
      segments: edgeSegmentsDesc?.view ?? this.emptyFloat,
      colors: edgeColorDesc?.view ?? this.emptyFloat,
      widths: edgeWidthDesc?.view ?? this.emptyFloat,
      endpointSizes: edgeEndpointSizeDesc?.view ?? this.emptyFloat,
      endpointStates: edgeEndpointStatesDesc?.view ?? this.emptyUint,
      indices: edgeIndexDesc?.view ?? this.emptyUint,
      opacities: edgeOpacityDesc?.view ?? this.emptyFloat,
      states: edgeStatesDesc?.view ?? this.emptyUint,
      count:
        edgeIndexDesc?.count ??
        edgeSegmentsDesc?.count ??
        edgeColorDesc?.count ??
        edgeWidthDesc?.count ??
        edgeOpacityDesc?.count ??
        edgeStatesDesc?.count ??
        packing?.edge?.count ??
        0,
      versions: {
        segments: edgeSegmentsDesc?.version ?? 0,
        colors: edgeColorDesc?.version ?? 0,
        widths: edgeWidthDesc?.version ?? 0,
        endpointSizes: edgeEndpointSizeDesc?.version ?? 0,
        endpointStates: edgeEndpointStatesDesc?.version ?? 0,
        indices: edgeIndexDesc?.version ?? 0,
        opacities: edgeOpacityDesc?.version ?? 0,
        states: edgeStatesDesc?.version ?? 0,
        topology: edgeIndexDesc?.topologyVersion ?? edgeSegmentsDesc?.topologyVersion ?? 0,
      },
      packing: packing?.edge ?? null,
    };

    return { nodes, edges };
  }

  withDenseGraph(network, fn, explicitRequests = null) {
    if (!network) return fn(this.readDenseGraph(null));
    const packing = this.getDensePackingInfo(network);
    const requests = Array.isArray(explicitRequests) && explicitRequests.length
      ? [...explicitRequests]
      : this.getDenseGraphRequests(packing);

    // Even when callers supply explicit attribute requests, ensure indices are
    // included when dense packing requires them.
    if (Array.isArray(explicitRequests) && explicitRequests.length) {
      const needNodeIndex = !(packing?.node?.indicesAreIdentity);
      const needEdgeIndex = !(packing?.edge?.indicesAreIdentity);
      const hasNodeIndex = requests.some(([scope, name]) => scope === 'node' && name === 'index');
      const hasEdgeIndex = requests.some(([scope, name]) => scope === 'edge' && name === 'index');
      if (needNodeIndex && !hasNodeIndex) requests.unshift(['node', 'index']);
      if (needEdgeIndex && !hasEdgeIndex) requests.unshift(['edge', 'index']);
    }

    // Updates must happen outside of buffer access.
    try {
      for (const [scope, name] of requests) {
        if (scope !== 'node' && scope !== 'edge') continue;
        if (name === 'index') {
          if (scope === 'node') network.updateDenseNodeIndexBuffer?.();
          else network.updateDenseEdgeIndexBuffer?.();
        } else if (scope === 'node') {
          network.updateDenseNodeAttributeBuffer?.(name);
        } else {
          network.updateDenseEdgeAttributeBuffer?.(name);
        }
      }
    } catch (error) {
      console.warn('GraphLayer: failed to update dense buffers', error);
      return null;
    }

    // Reads must happen inside buffer access.
    try {
      const augmentDerivedEdgeVersions = (geometry) => {
        if (!geometry?.edges?.versions || typeof network?.hasNodeToEdgeAttribute !== 'function') return geometry;
        const edgeVersions = geometry.edges.versions;
        const derived = [
          { attr: EDGE_COLOR_ATTRIBUTE, key: 'colors' },
          { attr: EDGE_ENDPOINTS_POSITION_ATTRIBUTE, key: 'segments' },
          { attr: EDGE_ENDPOINTS_SIZE_ATTRIBUTE, key: 'endpointSizes' },
          { attr: EDGE_ENDPOINTS_STATE_ATTRIBUTE, key: 'endpointStates' },
        ];
        let passthroughs = null;
        for (const { attr, key } of derived) {
          if (!attr || !(key in edgeVersions)) continue;
          let isDerived = false;
          try {
            isDerived = Boolean(network.hasNodeToEdgeAttribute(attr));
          } catch (_) {
            isDerived = false;
          }
          if (!isDerived) continue;

          if (passthroughs == null && typeof network.getNodeToEdgePassthroughs === 'function') {
            try {
              passthroughs = network.getNodeToEdgePassthroughs();
            } catch (_) {
              passthroughs = [];
            }
          }
          const entry = Array.isArray(passthroughs)
            ? passthroughs.find((p) => p?.edgeName === attr)
            : null;
          const denseVersion = edgeVersions[key] ?? 0;
          let edgeVersion = null;
          if (typeof network.getEdgeAttributeVersion === 'function') {
            try {
              edgeVersion = network.getEdgeAttributeVersion(attr);
            } catch (_) {
              edgeVersion = null;
            }
          }
          const parts = [`dense:${denseVersion}`];
          if (edgeVersion != null) parts.push(`edge:${edgeVersion}`);
          if (entry) {
            parts.push(`src:${entry.sourceName}`);
            if (entry.sourceName && typeof network.getNodeAttributeVersion === 'function') {
              try {
                const srcVersion = network.getNodeAttributeVersion(entry.sourceName);
                if (srcVersion != null) parts.push(`srcVer:${srcVersion}`);
              } catch (_) {
                // Ignore missing source attribute version.
              }
            }
            parts.push(`endpoints:${entry.endpoints}`);
            parts.push(`doubleWidth:${entry.doubleWidth ? 1 : 0}`);
          }
          edgeVersions[key] = parts.join('|');
        }
        return geometry;
      };

      if (typeof network.withDenseBufferViews === 'function') {
        return network.withDenseBufferViews(requests, (views) => {
          const geometry = this.readDenseGraphFromViews(views, packing);
          augmentDerivedEdgeVersions(geometry);
          return fn(geometry);
        });
      }

      if (typeof network.withBufferAccess === 'function') {
        return network.withBufferAccess(() => {
          const views = { node: Object.create(null), edge: Object.create(null) };
          for (const [scope, name] of requests) {
            if (scope !== 'node' && scope !== 'edge') continue;
            if (name === 'index') {
              views[scope].index = scope === 'node'
                ? network.getDenseNodeIndexView?.()
                : network.getDenseEdgeIndexView?.();
            } else {
              views[scope][name] = scope === 'node'
                ? network.getDenseNodeAttributeView?.(name)
                : network.getDenseEdgeAttributeView?.(name);
            }
          }
          const geometry = this.readDenseGraphFromViews(views, packing);
          augmentDerivedEdgeVersions(geometry);
          return fn(geometry);
        });
      }

      console.warn('GraphLayer: network does not support buffer access sessions');
      return null;
    } catch (error) {
      console.warn('GraphLayer: failed to read dense buffers', error);
      return null;
    }
  }
}
