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
 * @property {Float32Array} positions - Packed vec4 positions (x, y, z, 1)
 * @property {Float32Array} colors
 * @property {Float32Array} sizes
 * @property {number} count
 * @property {Uint32Array} indices
 */

/**
 * @typedef {Object} EdgeGeometry
 * @property {Float32Array} colors
 * @property {Float32Array} widths
 * @property {Float32Array} segments - Packed start/end vec4 tuples per edge
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
    this.nodeIndexCache = null;
    this.edgeIndexCache = null;
    this.edgeEndpointSizes = new Float32Array(0);
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
    if (force || this.edgesDirty) {
      this.populateEdgeGeometry();
      this.edgesDirty = false;
    }

    if (this.hasDense) {
      const dense = this.buildDenseGeometry();
      if (dense) {
        return dense;
      }
    }

    return this.buildSparseGeometry();
  }

  buildDenseGeometry() {
    const nodes = this.getDenseNodeGeometry();
    const edges = this.getDenseEdgeGeometry();
    if (!nodes?.positions || !nodes?.colors || !nodes?.sizes || !edges?.segments || !edges?.colors || !edges?.widths) {
      return null;
    }
    return { nodes, edges };
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
    const nodeStride = 4;
    const edgeStride = 8; // fromXYZ1, toXYZ1 per edge

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
      geometryView[geometryOffset + 3] = 1;
      geometryView[geometryOffset + 4] = nodePositions[toOffset + 0];
      geometryView[geometryOffset + 5] = nodePositions[toOffset + 1];
      geometryView[geometryOffset + 6] = nodePositions[toOffset + 2];
      geometryView[geometryOffset + 7] = 1;

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
    const positions = this.getDenseAttribute(NODE_POSITION_ATTRIBUTE, 4, 'node');
    const colors = this.getDenseAttribute(NODE_COLOR_ATTRIBUTE, 4, 'node');
    const sizes = this.getDenseAttribute(NODE_SIZE_ATTRIBUTE, 1, 'node');
    const count = Math.min(
      positions?.length ? positions.length / 4 : 0,
      colors?.length ? colors.length / 4 : 0,
      sizes?.length ?? 0,
    );
    const indices = this.ensureIdentityBuffer('node', count);
    return { positions, colors, sizes, count, indices };
  }

  getDenseEdgeGeometry() {
    const segments = this.getDenseAttribute(EDGE_GEOMETRY_ATTRIBUTE, 8, 'edge');
    const colors = this.getDenseAttribute(EDGE_COLOR_ATTRIBUTE, 4, 'edge');
    const widths = this.getDenseAttribute(EDGE_WIDTH_ATTRIBUTE, 1, 'edge');
    const count = Math.min(
      segments?.length ? segments.length / 8 : 0,
      colors?.length ? colors.length / 4 : 0,
      widths?.length ?? 0,
    );
    const indices = this.ensureIdentityBuffer('edge', count);
    return { segments, colors, widths, endpointSizes: this.edgeEndpointSizes, count, indices };
  }

  getDenseAttribute(name, dimension, scope) {
    if (!this.hasDense) return null;
    const updater =
      scope === 'node'
        ? this.network?.updateDenseNodeAttributeBuffer?.bind(this.network)
        : this.network?.updateDenseEdgeAttributeBuffer?.bind(this.network);
    if (!updater) return null;
    const descriptor = updater(name);
    if (!descriptor || !descriptor.view) return null;
    const byteOffset = descriptor.pointer ?? descriptor.view.byteOffset ?? 0;
    const length = descriptor.count * dimension;
    return new Float32Array(descriptor.view.buffer, byteOffset, length);
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
}
