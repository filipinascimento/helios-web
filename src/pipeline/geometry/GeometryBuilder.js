import { VisualAttributeMapper } from '../VisualAttributeMapper';

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
  }

  markNodePositionsDirty() {
    this.edgesDirty = true;
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
        ...this.collectActiveSelection(this.network.edgeActivityView),
      },
    };
  }

  populateEdgeGeometry() {
    const nodePositions = this.mapper.nodePositions;
    const edgesView = this.network.edgesView;
    const edgeActivity = this.network.edgeActivityView;
    const geometryView = this.mapper.edgeGeometry;
    const nodeStride = 4;
    const edgeStride = 8; // fromXYZ1, toXYZ1 per edge

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
}
