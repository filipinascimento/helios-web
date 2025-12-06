import { VisualAttributeMapper } from '../VisualAttributeMapper';
import {
  EDGE_COLOR_ATTRIBUTE,
  EDGE_GEOMETRY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  NODE_COLOR_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
} from '../constants.js';

/** @typedef {import('helios-network').default} HeliosNetwork */

/**
 * @typedef {Object} NodeGeometry
 * @property {Float32Array} positions - Packed vec3 positions (x, y, z)
 * @property {Float32Array} colors
 * @property {Float32Array} sizes
 * @property {number} count
 * @property {Uint32Array} indices
 */

/**
 * @typedef {Object} EdgeGeometry
 * @property {Float32Array} colors
 * @property {Float32Array} widths
 * @property {Float32Array} segments - Packed start/end vec3 tuples per edge
 * @property {number} count
 * @property {Uint32Array} indices
 */

/**
 * @typedef {Object} GeometryBuffers
 * @property {NodeGeometry} nodes
 * @property {EdgeGeometry} edges
 */

/**
 * Responsible for generating per-node and per-edge geometry buffers based on
 * the shared attribute views managed by the Helios network instance.
 */
export class GeometryBuilder {
  /**
   * @param {HeliosNetwork} network
   * @param {VisualAttributeMapper} mapper
   */
  constructor(network, mapper) {
    this.network = network;
    this.mapper = mapper;
    this.edgesDirty = true;
    this.hasDense = typeof network?.updateDenseNodeAttributeBuffer === 'function';
    this.hasDenseNodeToEdge = typeof network?.updateDenseNodeToEdgeAttributeBuffer === 'function';
    this.nodeIndexCache = null;
    this.edgeIndexCache = null;
    this.edgeEndpointSizes = new Float32Array(0);
    this.denseEdgeEndpointCache = new Float32Array(0);
    this.nodeToEdgeBuffersRegistered = false;
  }

  markNodePositionsDirty() {
    this.edgesDirty = true;
    if (this.hasDense && typeof this.network?.markDenseNodeAttributeDirty === 'function') {
      try {
        this.network.markDenseNodeAttributeDirty(NODE_POSITION_ATTRIBUTE);
      } catch (_) {
        // Ignore if dense buffers are unavailable.
      }
    }
  }

  /**
   * @param {boolean} [force]
   * @returns {GeometryBuffers}
   */
  build(force = false) {
    // Prefer dense node-to-edge buffers; fall back to sparse generation.
    if (this.hasDense) {
      const dense = this.buildDenseGeometry();
      if (dense) {
        return dense;
      }
    }

    if (force || this.edgesDirty) {
      this.populateEdgeGeometry();
      this.edgesDirty = false;
    }

    return this.buildSparseGeometry();
  }

  buildDenseGeometry() {
    this.markDenseVisualsDirty();
    this.ensureDenseNodeToEdgeBuffers();
    const nodes = this.getDenseNodeGeometry();
    const edges = this.getDenseEdgeGeometry();
    if (
      !nodes?.positions ||
      !nodes?.colors ||
      !nodes?.sizes ||
      !edges?.segments ||
      !edges?.colors ||
      !edges?.widths ||
      !edges?.endpointSizes
    ) {
      return null;
    }
    // If dense views exist but report zero elements, fall back to sparse so
    // renderer still draws.
    if (!nodes.count || !edges.count) {
      return null;
    }
    return { nodes, edges };
  }

  markDenseVisualsDirty() {
    if (!this.hasDense) return;
    const markNode = (name) => {
      try {
        this.network?.markDenseNodeAttributeDirty?.(name);
      } catch (_) {
        // Dense buffers may be unsupported.
      }
    };
    const markEdge = (name) => {
      try {
        this.network?.markDenseEdgeAttributeDirty?.(name);
      } catch (_) {
        // Dense buffers may be unsupported.
      }
    };
    markNode(NODE_POSITION_ATTRIBUTE);
    markNode(NODE_COLOR_ATTRIBUTE);
    markNode(NODE_SIZE_ATTRIBUTE);
    markEdge(EDGE_COLOR_ATTRIBUTE);
    markEdge(EDGE_WIDTH_ATTRIBUTE);
    markEdge(EDGE_GEOMETRY_ATTRIBUTE);
  }

  buildSparseGeometry() {
    return {
      nodes: {
        positions: this.mapper.nodePositions,
        colors: this.mapper.nodeColors,
        sizes: this.mapper.nodeSizes,
        ...this.collectActiveSelection(this.network.nodeActivityView),
      },
      edges: {
        colors: this.mapper.edgeColors,
        widths: this.mapper.edgeWidths,
        segments: this.mapper.edgeGeometry,
        endpointSizes: this.edgeEndpointSizes,
        ...this.collectActiveSelection(this.network.edgeActivityView),
      },
    };
  }

  populateEdgeGeometry() {
    const nodePositions = this.mapper.nodePositions;
    const nodeSizes = this.mapper.nodeSizes;
    const edgesView = this.network.edgesView;
    const edgeActivity = this.network.edgeActivityView;
    const geometryView = this.mapper.edgeGeometry;
    const nodeStride = 3;
    const edgeStride = 6; // fromXYZ, toXYZ per edge

    if (!this.edgeEndpointSizes || this.edgeEndpointSizes.length < edgeActivity.length * 2) {
      this.edgeEndpointSizes = new Float32Array(edgeActivity.length * 2);
    }

    for (let edgeIndex = 0; edgeIndex < edgeActivity.length; edgeIndex += 1) {
      if (!edgeActivity[edgeIndex]) {
        continue;
      }
      const pairIndex = edgeIndex * 2;
      const fromNode = edgesView[pairIndex];
      const toNode = edgesView[pairIndex + 1];

      const fromOffset = fromNode * nodeStride;
      const toOffset = toNode * nodeStride;
      const geometryOffset = edgeIndex * edgeStride;

      geometryView[geometryOffset + 0] = nodePositions[fromOffset + 0];
      geometryView[geometryOffset + 1] = nodePositions[fromOffset + 1];
      geometryView[geometryOffset + 2] = nodePositions[fromOffset + 2];
      geometryView[geometryOffset + 3] = nodePositions[toOffset + 0];
      geometryView[geometryOffset + 4] = nodePositions[toOffset + 1];
      geometryView[geometryOffset + 5] = nodePositions[toOffset + 2];

      this.edgeEndpointSizes[edgeIndex * 2] = nodeSizes?.[fromNode] ?? 0;
      this.edgeEndpointSizes[edgeIndex * 2 + 1] = nodeSizes?.[toNode] ?? 0;
    }

    if (this.hasDense && typeof this.network?.markDenseEdgeAttributeDirty === 'function') {
      try {
        this.network.markDenseEdgeAttributeDirty(EDGE_GEOMETRY_ATTRIBUTE);
      } catch (_) {
        // Ignore if dense buffers are unavailable.
      }
    }
  }

  collectActiveSelection(activity) {
    let count = 0;
    for (let i = 0; i < activity.length; i += 1) {
      if (activity[i]) {
        count += 1;
      }
    }
    const indices = new Uint32Array(count);
    let offset = 0;
    for (let i = 0; i < activity.length; i += 1) {
      if (activity[i]) {
        indices[offset] = i;
        offset += 1;
      }
    }
    return { count, indices };
  }

  getDenseNodeGeometry() {
    const positions = this.getDenseAttribute(NODE_POSITION_ATTRIBUTE, 3, 'node');
    const colors = this.getDenseAttribute(NODE_COLOR_ATTRIBUTE, 4, 'node');
    const sizes = this.getDenseAttribute(NODE_SIZE_ATTRIBUTE, 1, 'node');
    const indexBuffer = this.getDenseIndexBuffer('node');
    const count = this.resolveDenseCount([positions, colors, sizes, indexBuffer]);
    if (!count || !positions?.array || !colors?.array || !sizes?.array) return null;
    const indices =
      indexBuffer?.array?.subarray(0, count) ?? this.ensureIdentityBuffer('node', count);
    return {
      positions: positions.array.subarray(0, count * 3),
      colors: colors.array.subarray(0, count * 4),
      sizes: sizes.array.subarray(0, count),
      count,
      indices,
    };
  }

  getDenseEdgeGeometry() {
    // Pull endpoints directly from node->edge dense buffers for speed.
    const segments = this.getDenseNodeToEdgeAttribute(NODE_POSITION_ATTRIBUTE, 3);
    const endpointSizes = this.getDenseNodeToEdgeAttribute(NODE_SIZE_ATTRIBUTE, 1);
    const colors = this.getDenseAttribute(EDGE_COLOR_ATTRIBUTE, 4, 'edge');
    const widths = this.getDenseAttribute(EDGE_WIDTH_ATTRIBUTE, 1, 'edge');
    const indexBuffer = this.getDenseIndexBuffer('edge');
    const count = this.resolveDenseCount([segments, colors, widths, endpointSizes, indexBuffer]);
    if (
      !count ||
      !segments?.array ||
      !colors?.array ||
      !widths?.array ||
      segments.array.length < count * 6 ||
      endpointSizes?.array?.length < count * 2 ||
      !this.ensureFiniteArray(segments.array, count * 6) ||
      !this.ensureFiniteArray(endpointSizes.array, count * 2)
    ) {
      return null;
    }
    const indices =
      indexBuffer?.array?.subarray(0, count) ?? this.ensureIdentityBuffer('edge', count);
    const endpointSizesArray = endpointSizes?.array?.subarray(0, count * 2);
    if (!endpointSizesArray) return null;
    if (!this.validateDenseSegments(segments.array, indices, count)) {
      return null;
    }
    return {
      segments: segments.array.subarray(0, count * 6),
      colors: colors.array.subarray(0, count * 4),
      widths: widths.array.subarray(0, count),
      endpointSizes: endpointSizesArray,
      count,
      indices,
    };
  }

  getDenseAttribute(name, dimension, scope) {
    if (!this.hasDense) return null;
    const updater =
      scope === 'node'
        ? this.network?.updateDenseNodeAttributeBuffer?.bind(this.network)
        : this.network?.updateDenseEdgeAttributeBuffer?.bind(this.network);
    if (!updater) return null;
    const descriptor = updater(name);
    if (!descriptor || !descriptor.view || typeof descriptor.count !== 'number') return null;
    const byteOffset = descriptor.pointer ?? descriptor.view.byteOffset ?? 0;
    const length = descriptor.count * dimension;
    return { array: new Float32Array(descriptor.view.buffer, byteOffset, length), count: descriptor.count };
  }

  getDenseNodeToEdgeAttribute(name, dimension) {
    if (!this.hasDenseNodeToEdge) return null;
    const updater = this.network?.updateDenseNodeToEdgeAttributeBuffer?.bind(this.network);
    if (!updater) return null;
    let descriptor = null;
    try {
      descriptor = updater(name);
    } catch (_) {
      return null;
    }
    if (!descriptor || !descriptor.view || typeof descriptor.count !== 'number') return null;
    const byteOffset = descriptor.pointer ?? descriptor.view.byteOffset ?? 0;
    const length = descriptor.count * dimension * 2;
    return { array: new Float32Array(descriptor.view.buffer, byteOffset, length), count: descriptor.count };
  }

  resolveDenseCount(descriptors) {
    let min = Number.POSITIVE_INFINITY;
    for (const entry of descriptors) {
      if (!entry?.count || entry.count < 0) continue;
      min = Math.min(min, entry.count);
    }
    if (!Number.isFinite(min)) {
      return 0;
    }
    return min;
  }

  getDenseIndexBuffer(scope) {
    const updater =
      scope === 'node'
        ? this.network?.updateDenseNodeIndexBuffer?.bind(this.network)
        : this.network?.updateDenseEdgeIndexBuffer?.bind(this.network);
    if (!updater) return null;
    const descriptor = updater();
    if (!descriptor?.view || typeof descriptor.count !== 'number') return null;
    const byteOffset = descriptor.pointer ?? descriptor.view.byteOffset ?? 0;
    return {
      array: new Uint32Array(descriptor.view.buffer, byteOffset, descriptor.count),
      count: descriptor.count,
    };
  }

  buildDenseEndpointSizesFromSparse(order, count) {
    if (!order || !count) return null;
    if (!this.denseEdgeEndpointCache || this.denseEdgeEndpointCache.length < count * 2) {
      this.denseEdgeEndpointCache = new Float32Array(count * 2);
    }
    const target = this.denseEdgeEndpointCache;
    for (let i = 0; i < count; i += 1) {
      const edgeId = order[i];
      const base = edgeId * 2;
      target[i * 2] = this.edgeEndpointSizes?.[base] ?? 0;
      target[i * 2 + 1] = this.edgeEndpointSizes?.[base + 1] ?? 0;
    }
    return target.subarray(0, count * 2);
  }

  ensureIdentityBuffer(scope, count) {
    const key = scope === 'edge' ? 'edgeIndexCache' : 'nodeIndexCache';
    const existing = this[key];
    if (!existing || existing.length < count) {
      this[key] = new Uint32Array(count);
    }
    const target = this[key];
    for (let i = 0; i < count; i += 1) {
      target[i] = i;
    }
    return target.subarray(0, count);
  }

  ensureFiniteArray(array, length) {
    if (!array || array.length < length) return false;
    for (let i = 0; i < length; i += 1) {
      if (!Number.isFinite(array[i])) {
        return false;
      }
    }
    return true;
  }

  validateDenseSegments(segments, indices, count) {
    if (!segments || !indices || !count) return false;
    const edgesView = this.network?.edgesView;
    const nodePositions = this.mapper?.nodePositions;
    if (!edgesView || !nodePositions) return true;
    const edgeId = indices[0];
    const baseEdge = edgeId * 2;
    const from = edgesView[baseEdge];
    const to = edgesView[baseEdge + 1];
    const nodeStride = 3;
    const fromPos = from * nodeStride;
    const toPos = to * nodeStride;
    const tol = 1e-3;
    const matches =
      Math.abs(segments[0] - nodePositions[fromPos]) < tol &&
      Math.abs(segments[1] - nodePositions[fromPos + 1]) < tol &&
      Math.abs(segments[2] - nodePositions[fromPos + 2]) < tol &&
      Math.abs(segments[3] - nodePositions[toPos]) < tol &&
      Math.abs(segments[4] - nodePositions[toPos + 1]) < tol &&
      Math.abs(segments[5] - nodePositions[toPos + 2]) < tol;
    return matches;
  }

  ensureDenseNodeToEdgeBuffers() {
    if (!this.hasDenseNodeToEdge || this.nodeToEdgeBuffersRegistered) return;
    // Avoid registering until there is capacity, otherwise wasm returns null pointers.
    if (!this.network || this.network.edgeCapacity === 0 || this.network.nodeCapacity === 0) return;
    try {
      this.network.addDenseNodeToEdgeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE);
      this.network.addDenseNodeToEdgeAttributeBuffer?.(NODE_SIZE_ATTRIBUTE);
      this.nodeToEdgeBuffersRegistered = true;
    } catch (_) {
      // Ignore if unsupported; fallback to sparse path.
    }
  }
}
