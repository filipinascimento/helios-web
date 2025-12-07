import { Layer } from './Layer.js';
import {
  EDGE_COLOR_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  NODE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
} from '../../pipeline/constants.js';

export { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './GraphLayerCommon.js';

export class GraphLayer extends Layer {
  constructor(options = {}) {
    super('graph-layer');
    this.emptyFloat = new Float32Array(0);
    this.emptyUint = new Uint32Array(0);
    this.cpuArrays = {};
    this.edgeRenderingMode = options.edgeRendering === 'line' ? 'line' : 'quad';
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
    this.edgeEndpointTrim = 1;
    this.fallbackCameraUniforms = null;
  }

  setEdgeRenderingMode(mode) {
    if (mode === 'line' || mode === 'quad') {
      this.edgeRenderingMode = mode;
    }
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

  getAttributeDescriptor(network, scope, name) {
    const updater =
      scope === 'node'
        ? network?.updateDenseNodeAttributeBuffer?.bind(network)
        : network?.updateDenseEdgeAttributeBuffer?.bind(network);
    if (!updater) return null;
    try {
      return updater(name);
    } catch (_) {
      return null;
    }
  }

  getIndexDescriptor(network, scope) {
    const updater =
      scope === 'node'
        ? network?.updateDenseNodeIndexBuffer?.bind(network)
        : network?.updateDenseEdgeIndexBuffer?.bind(network);
    if (!updater) return null;
    try {
      return updater();
    } catch (_) {
      return null;
    }
  }

  createTypedView(descriptor, Type, components) {
    if (!descriptor?.view || typeof descriptor.count !== 'number') return null;
    const stride = descriptor.stride ?? components;
    const start = Math.max(0, descriptor.validStart ?? 0);
    const end = descriptor.validEnd ?? descriptor.count;
    const count = Math.max(0, end - start);
    const basePointer = descriptor.pointer ?? descriptor.view.byteOffset ?? 0;
    const pointer = basePointer + start * stride * Type.BYTES_PER_ELEMENT;
    const length = count * stride;
    try {
      return new Type(descriptor.view.buffer, pointer, length);
    } catch (_) {
      return null;
    }
  }

  getDescriptorCount(descriptor) {
    if (!descriptor || typeof descriptor.count !== 'number') return 0;
    const start = Math.max(0, descriptor.validStart ?? 0);
    const end = descriptor.validEnd ?? descriptor.count;
    return Math.max(0, end - start);
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
    const nodeIndexDesc = this.getIndexDescriptor(network, 'node');
    const edgeIndexDesc = this.getIndexDescriptor(network, 'edge');
    const nodePositionsDesc = this.getAttributeDescriptor(network, 'node', NODE_POSITION_ATTRIBUTE);
    const nodeColorsDesc = this.getAttributeDescriptor(network, 'node', NODE_COLOR_ATTRIBUTE);
    const nodeSizesDesc = this.getAttributeDescriptor(network, 'node', NODE_SIZE_ATTRIBUTE);
    const nodeOutlineWidthDesc = this.getAttributeDescriptor(network, 'node', NODE_OUTLINE_WIDTH_ATTRIBUTE);
    const nodeOutlineColorDesc = this.getAttributeDescriptor(network, 'node', NODE_OUTLINE_COLOR_ATTRIBUTE);
    const edgeColorDesc = this.getAttributeDescriptor(network, 'edge', EDGE_COLOR_ATTRIBUTE);
    const edgeWidthDesc = this.getAttributeDescriptor(network, 'edge', EDGE_WIDTH_ATTRIBUTE);
    const edgeSegmentsDesc = this.getAttributeDescriptor(network, 'edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    const edgeEndpointSizeDesc = this.getAttributeDescriptor(network, 'edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE);

    const nodes = {
      positions: this.createTypedView(nodePositionsDesc, Float32Array, 3) ?? this.emptyFloat,
      colors: this.createTypedView(nodeColorsDesc, Float32Array, 4) ?? this.emptyFloat,
      sizes: this.createTypedView(nodeSizesDesc, Float32Array, 1) ?? this.emptyFloat,
      outlineWidths: this.createTypedView(nodeOutlineWidthDesc, Float32Array, 1) ?? this.emptyFloat,
      outlineColors: this.createTypedView(nodeOutlineColorDesc, Float32Array, 4) ?? this.emptyFloat,
      indices: this.createTypedView(nodeIndexDesc, Uint32Array, 1) ?? this.emptyUint,
      count:
        this.getDescriptorCount(nodeIndexDesc) ||
        this.getDescriptorCount(nodePositionsDesc) ||
        this.getDescriptorCount(nodeColorsDesc) ||
        this.getDescriptorCount(nodeSizesDesc),
    };

    const edges = {
      segments: this.createTypedView(edgeSegmentsDesc, Float32Array, 6) ?? this.emptyFloat,
      colors: this.createTypedView(edgeColorDesc, Float32Array, 4) ?? this.emptyFloat,
      widths: this.createTypedView(edgeWidthDesc, Float32Array, 1) ?? this.emptyFloat,
      endpointSizes: this.createTypedView(edgeEndpointSizeDesc, Float32Array, 2) ?? this.emptyFloat,
      indices: this.createTypedView(edgeIndexDesc, Uint32Array, 1) ?? this.emptyUint,
      count:
        this.getDescriptorCount(edgeIndexDesc) ||
        this.getDescriptorCount(edgeSegmentsDesc) ||
        this.getDescriptorCount(edgeColorDesc) ||
        this.getDescriptorCount(edgeWidthDesc),
    };

    return { nodes, edges };
  }
}
