import { Layer } from './Layer.js';
import { VISUAL_ATTRIBUTE_NAMES } from '../../pipeline/constants.js';

const {
  EDGE_COLOR_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  NODE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

export { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './GraphLayerCommon.js';

export class GraphLayer extends Layer {
  constructor(options = {}) {
    super('graph-layer');
    this.emptyFloat = new Float32Array(0);
    this.emptyUint = new Uint32Array(0);
    this.cpuArrays = {};
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
    this.edgeOpacityBase = 0;
    this.edgeOpacityScale = 1;
    this.edgeWidthBase = 0;
    this.edgeWidthScale = 1;
    this.edgeEndpointTrim = Number.isFinite(options.edgeEndpointTrim) ? options.edgeEndpointTrim : 0.8;
    this.fallbackCameraUniforms = null;
    this.loggedWeightedActive = false;
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
      () => network.updateDenseNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE),
      () => network.updateDenseNodeAttributeBuffer?.(NODE_COLOR_ATTRIBUTE),
      () => network.updateDenseNodeAttributeBuffer?.(NODE_SIZE_ATTRIBUTE),
      () => network.updateDenseNodeAttributeBuffer?.(NODE_OUTLINE_WIDTH_ATTRIBUTE),
      () => network.updateDenseNodeAttributeBuffer?.(NODE_OUTLINE_COLOR_ATTRIBUTE),
      () => network.updateDenseEdgeAttributeBuffer?.(EDGE_COLOR_ATTRIBUTE),
      () => network.updateDenseEdgeAttributeBuffer?.(EDGE_OPACITY_ATTRIBUTE),
      () => network.updateDenseEdgeAttributeBuffer?.(EDGE_WIDTH_ATTRIBUTE),
      () => network.updateDenseEdgeAttributeBuffer?.(EDGE_ENDPOINTS_POSITION_ATTRIBUTE),
      () => network.updateDenseEdgeAttributeBuffer?.(EDGE_ENDPOINTS_SIZE_ATTRIBUTE),
    ];
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
          indices: this.emptyUint,
          count: 0,
        },
      };
    }
    const nodeIndexDesc = this.getIndexView(network, 'node');
    const edgeIndexDesc = this.getIndexView(network, 'edge');
    const nodePositionsDesc = this.getAttributeView(network, 'node', NODE_POSITION_ATTRIBUTE);
    const nodeColorsDesc = this.getAttributeView(network, 'node', NODE_COLOR_ATTRIBUTE);
    const nodeSizesDesc = this.getAttributeView(network, 'node', NODE_SIZE_ATTRIBUTE);
    const nodeOutlineWidthDesc = this.getAttributeView(network, 'node', NODE_OUTLINE_WIDTH_ATTRIBUTE);
    const nodeOutlineColorDesc = this.getAttributeView(network, 'node', NODE_OUTLINE_COLOR_ATTRIBUTE);
    const edgeColorDesc = this.getAttributeView(network, 'edge', EDGE_COLOR_ATTRIBUTE);
    const edgeOpacityDesc = this.getAttributeView(network, 'edge', EDGE_OPACITY_ATTRIBUTE);
    const edgeWidthDesc = this.getAttributeView(network, 'edge', EDGE_WIDTH_ATTRIBUTE);
    const edgeSegmentsDesc = this.getAttributeView(network, 'edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    const edgeEndpointSizeDesc = this.getAttributeView(network, 'edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE);

    const nodes = {
      positions: nodePositionsDesc?.view ?? this.emptyFloat,
      colors: nodeColorsDesc?.view ?? this.emptyFloat,
      sizes: nodeSizesDesc?.view ?? this.emptyFloat,
      outlineWidths: nodeOutlineWidthDesc?.view ?? this.emptyFloat,
      outlineColors: nodeOutlineColorDesc?.view ?? this.emptyFloat,
      indices: nodeIndexDesc?.view ?? this.emptyUint,
      count:
        nodeIndexDesc?.count ??
        nodePositionsDesc?.count ??
        nodeColorsDesc?.count ??
        nodeSizesDesc?.count ??
        0,
    };

    const edges = {
      segments: edgeSegmentsDesc?.view ?? this.emptyFloat,
      colors: edgeColorDesc?.view ?? this.emptyFloat,
      opacities: edgeOpacityDesc?.view ?? this.emptyFloat,
      widths: edgeWidthDesc?.view ?? this.emptyFloat,
      endpointSizes: edgeEndpointSizeDesc?.view ?? this.emptyFloat,
      indices: edgeIndexDesc?.view ?? this.emptyUint,
      count:
        edgeIndexDesc?.count ??
        edgeSegmentsDesc?.count ??
        edgeColorDesc?.count ??
        edgeOpacityDesc?.count ??
        edgeWidthDesc?.count ??
        0,
    };

    return { nodes, edges };
  }
}
