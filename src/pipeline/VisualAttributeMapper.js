import { AttributeType } from 'helios-network';

/** @typedef {import('helios-network').default} HeliosNetwork */
import {
  NODE_COLOR_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  DEFAULT_EDGE_COLOR,
  DEFAULT_EDGE_WIDTH,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_SIZE,
} from './constants.js';

/**
 * @typedef {Object} VisualAttributeViews
 * @property {Float32Array} nodePositions
 * @property {Float32Array} nodeColors
 * @property {Float32Array} nodeSizes
 * @property {Float32Array} edgeColors
 * @property {Float32Array} edgeWidths
 */

/**
 * Ensures that reserved visual attributes exist on the Helios network and exposes
 * typed-array views that can be fed into render pipelines without extra copies.
 */
export class VisualAttributeMapper {
  /**
   * @param {HeliosNetwork} network
   */
  constructor(network) {
    this.network = network;
    this.emptyFloat = new Float32Array(0);
    this.emptyUint = new Uint32Array(0);
    this.nodeOrderCache = null;
    this.edgeOrderCache = null;
    this.lastNodeCount = -1;
    this.lastEdgeCount = -1;
    this.ensureAttributes();
    this.registerDenseBuffers();
    this.applyNodeDefaults();
    this.applyEdgeDefaults();
    this.markAllDenseDirty();
  }

  /**
   * @returns {VisualAttributeViews}
   */
  get views() {
    return {
      nodePositions: this.nodePositions,
      nodeColors: this.nodeColors,
      nodeSizes: this.nodeSizes,
      edgeColors: this.edgeColors,
      edgeWidths: this.edgeWidths,
    };
  }

  /**
   * @returns {Float32Array}
   */
  get nodePositions() {
    return this.network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
  }

  /**
   * @returns {Float32Array}
   */
  get nodeColors() {
    return this.network.getNodeAttributeBuffer(NODE_COLOR_ATTRIBUTE).view;
  }

  /**
   * @returns {Float32Array}
   */
  get nodeSizes() {
    return this.network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE).view;
  }

  /**
   * @returns {Float32Array}
   */
  get edgeColors() {
    return this.network.getEdgeAttributeBuffer(EDGE_COLOR_ATTRIBUTE).view;
  }

  /**
   * @returns {Float32Array}
   */
  get edgeWidths() {
    return this.network.getEdgeAttributeBuffer(EDGE_WIDTH_ATTRIBUTE).view;
  }

  /**
   * Initializes basic node visuals. Can be re-used whenever nodes are added.
   * @param {Iterable<number>} [indices]
   */
  applyNodeDefaults(indices) {
    const color = DEFAULT_NODE_COLOR;
    const size = DEFAULT_NODE_SIZE;
    const positionView = this.nodePositions;
    const colorView = this.nodeColors;
    const sizeView = this.nodeSizes;

    if (!indices) {
      const activity = this.network.nodeActivityView;
      for (let i = 0; i < activity.length; i += 1) {
        if (activity[i]) {
          this.writeNodeDefaults(i, color, size, positionView, colorView, sizeView);
        }
      }
    } else {
      for (const index of indices) {
        this.writeNodeDefaults(index, color, size, positionView, colorView, sizeView);
      }
    }

    this.markNodeAttributesDirty(NODE_POSITION_ATTRIBUTE, NODE_COLOR_ATTRIBUTE, NODE_SIZE_ATTRIBUTE);
    this.markEdgeAttributesDirty(EDGE_ENDPOINTS_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  }

  /**
   * Initializes basic edge visuals. Can be re-used whenever edges are added.
   * @param {Iterable<number>} [indices]
   */
  applyEdgeDefaults(indices) {
    const color = DEFAULT_EDGE_COLOR;
    const width = DEFAULT_EDGE_WIDTH;
    const colorView = this.edgeColors;
    const widthView = this.edgeWidths;

    if (!indices) {
      const activity = this.network.edgeActivityView;
      for (let i = 0; i < activity.length; i += 1) {
        if (activity[i]) {
          this.writeEdgeDefaults(i, color, width, colorView, widthView);
        }
      }
    } else {
      for (const index of indices) {
        this.writeEdgeDefaults(index, color, width, colorView, widthView);
      }
    }

    this.markEdgeAttributesDirty(EDGE_COLOR_ATTRIBUTE, EDGE_WIDTH_ATTRIBUTE);
  }

  ensureAttributes() {
    // Positions store vec3 (x, y, z); w is supplied in shaders.
    this.ensureNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);
    this.ensureNodeAttribute(NODE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    this.ensureNodeAttribute(NODE_SIZE_ATTRIBUTE, AttributeType.Float, 1);
    this.ensureEdgeAttribute(EDGE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    this.ensureEdgeAttribute(EDGE_WIDTH_ATTRIBUTE, AttributeType.Float, 1);
    this.ensureNodeToEdgeAttribute(NODE_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_POSITION_ATTRIBUTE, 3);
    this.ensureNodeToEdgeAttribute(NODE_SIZE_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE, 1);
  }

  /**
   * @param {string} name
   * @param {number} type
   * @param {number} dimension
   */
  ensureNodeAttribute(name, type, dimension) {
    let buffer = null;
    try {
      buffer = this.network.getNodeAttributeBuffer(name);
    } catch (error) {
      buffer = null;
    }
    try {
      this.network.defineNodeAttribute(name, type, dimension);
      buffer = this.network.getNodeAttributeBuffer(name);
    } catch (error) {
      this.ignoreDuplicateAttribute(error, name);
    }
    buffer = buffer ?? this.network.getNodeAttributeBuffer(name);
    if (buffer?.dimension !== dimension) {
      throw new Error(`Attribute ${name} has dimension ${buffer?.dimension ?? 'unknown'}, expected ${dimension}`);
    }
  }

  /**
   * @param {string} name
   * @param {number} type
   * @param {number} dimension
   */
  ensureEdgeAttribute(name, type, dimension) {
    let buffer = null;
    try {
      buffer = this.network.getEdgeAttributeBuffer(name);
    } catch (error) {
      buffer = null;
    }
    try {
      this.network.defineEdgeAttribute(name, type, dimension);
      buffer = this.network.getEdgeAttributeBuffer(name);
    } catch (error) {
      this.ignoreDuplicateAttribute(error, name);
    }
    buffer = buffer ?? this.network.getEdgeAttributeBuffer(name);
    if (buffer?.dimension !== dimension) {
      throw new Error(`Attribute ${name} has dimension ${buffer?.dimension ?? 'unknown'}, expected ${dimension}`);
    }
  }

  ensureNodeToEdgeAttribute(sourceName, edgeName, sourceDimension) {
    const targetDimension = sourceDimension * 2;
    let buffer = null;
    try {
      buffer = this.network.getEdgeAttributeBuffer(edgeName);
    } catch (error) {
      buffer = null;
    }
    try {
      this.network.defineNodeToEdgeAttribute(sourceName, edgeName, 'both');
      buffer = this.network.getEdgeAttributeBuffer(edgeName);
    } catch (error) {
      this.ignoreDuplicateAttribute(error, edgeName);
    }
    buffer = buffer ?? this.network.getEdgeAttributeBuffer(edgeName);
    if (buffer?.dimension !== targetDimension) {
      throw new Error(
        `Attribute ${edgeName} has dimension ${buffer?.dimension ?? 'unknown'}, expected ${targetDimension}`,
      );
    }
  }

  registerDenseBuffers() {
    if (!this.network) return;
    const addDense = (method, name) => {
      if (typeof this.network[method] !== 'function') return;
      try {
        this.network[method](name);
      } catch (error) {
        // Ignore duplicate registration or unsupported dense buffers.
      }
    };
    addDense('addDenseNodeAttributeBuffer', NODE_POSITION_ATTRIBUTE);
    addDense('addDenseNodeAttributeBuffer', NODE_COLOR_ATTRIBUTE);
    addDense('addDenseNodeAttributeBuffer', NODE_SIZE_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_COLOR_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_WIDTH_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  }

  markNodeAttributesDirty(...names) {
    if (typeof this.network?.markDenseNodeAttributeDirty !== 'function') return;
    const targets =
      names && names.length ? names : [NODE_POSITION_ATTRIBUTE, NODE_COLOR_ATTRIBUTE, NODE_SIZE_ATTRIBUTE];
    for (const name of targets) {
      try {
        this.network.markDenseNodeAttributeDirty(name);
      } catch (_) {
        // Ignore if dense buffers are unavailable.
      }
    }
  }

  markEdgeAttributesDirty(...names) {
    if (typeof this.network?.markDenseEdgeAttributeDirty !== 'function') return;
    const targets =
      names && names.length
        ? names
        : [EDGE_COLOR_ATTRIBUTE, EDGE_WIDTH_ATTRIBUTE, EDGE_ENDPOINTS_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE];
    for (const name of targets) {
      try {
        this.network.markDenseEdgeAttributeDirty(name);
      } catch (_) {
        // Ignore if dense buffers are unavailable.
      }
    }
  }

  markAllDenseDirty() {
    this.markNodeAttributesDirty();
    this.markEdgeAttributesDirty();
  }

  buildDenseGeometry() {
    this.updateDenseOrders();
    return {
      nodes: this.buildDenseNodes(),
      edges: this.buildDenseEdges(),
    };
  }

  buildDenseNodes() {
    const positions = this.getDenseAttribute(NODE_POSITION_ATTRIBUTE, 3, 'node');
    const colors = this.getDenseAttribute(NODE_COLOR_ATTRIBUTE, 4, 'node');
    const sizes = this.getDenseAttribute(NODE_SIZE_ATTRIBUTE, 1, 'node');
    const indices = this.getDenseIndexBuffer('node');
    const range = this.getValidRange('node');
    const count = this.resolveDenseCount([positions, colors, sizes, indices], range);
    if (!count) {
      return {
        positions: this.emptyFloat,
        colors: this.emptyFloat,
        sizes: this.emptyFloat,
        indices: this.emptyUint,
        count: 0,
      };
    }
    return {
      positions: positions.array.subarray(0, count * 3),
      colors: colors.array.subarray(0, count * 4),
      sizes: sizes.array.subarray(0, count),
      indices: this.ensureNodeIndices(indices.array, count),
      count,
    };
  }

  buildDenseEdges() {
    const segments = this.getDenseAttribute(EDGE_ENDPOINTS_POSITION_ATTRIBUTE, 6, 'edge');
    const endpointSizes = this.getDenseAttribute(EDGE_ENDPOINTS_SIZE_ATTRIBUTE, 2, 'edge');
    const colors = this.getDenseAttribute(EDGE_COLOR_ATTRIBUTE, 4, 'edge');
    const widths = this.getDenseAttribute(EDGE_WIDTH_ATTRIBUTE, 1, 'edge');
    const indices = this.getDenseIndexBuffer('edge');
    const range = this.getValidRange('edge');
    const count = this.resolveDenseCount([segments, endpointSizes, colors, widths, indices], range);
    if (!count) {
      return {
        segments: this.emptyFloat,
        colors: this.emptyFloat,
        widths: this.emptyFloat,
        endpointSizes: this.emptyFloat,
        indices: this.emptyUint,
        count: 0,
      };
    }
    return {
      segments: segments.array.subarray(0, count * 6),
      colors: colors.array.subarray(0, count * 4),
      widths: widths.array.subarray(0, count),
      endpointSizes: endpointSizes.array.subarray(0, count * 2),
      indices: this.ensureEdgeIndices(indices.array, count),
      count,
    };
  }

  getDenseAttribute(name, dimension, scope) {
    const updater =
      scope === 'node'
        ? this.network?.updateDenseNodeAttributeBuffer?.bind(this.network)
        : this.network?.updateDenseEdgeAttributeBuffer?.bind(this.network);
    if (!updater) return { array: this.emptyFloat, count: 0 };
    let descriptor = null;
    try {
      descriptor = updater(name);
    } catch (_) {
      return { array: this.emptyFloat, count: 0 };
    }
    if (!descriptor || !descriptor.view || typeof descriptor.count !== 'number') {
      return { array: this.emptyFloat, count: 0 };
    }
    const byteOffset = descriptor.pointer ?? descriptor.view.byteOffset ?? 0;
    const length = descriptor.count * dimension;
    return {
      array: new Float32Array(descriptor.view.buffer, byteOffset, length),
      count: descriptor.count,
      validStart: descriptor.validStart,
      validEnd: descriptor.validEnd,
    };
  }

  getDenseIndexBuffer(scope) {
    const updater =
      scope === 'node'
        ? this.network?.updateDenseNodeIndexBuffer?.bind(this.network)
        : this.network?.updateDenseEdgeIndexBuffer?.bind(this.network);
    if (!updater) return { array: this.emptyUint, count: 0 };
    let descriptor = null;
    try {
      descriptor = updater();
    } catch (_) {
      return { array: this.emptyUint, count: 0 };
    }
    if (!descriptor?.view || typeof descriptor.count !== 'number') {
      return { array: this.emptyUint, count: 0 };
    }
    const byteOffset = descriptor.pointer ?? descriptor.view.byteOffset ?? 0;
    const result = {
      array: new Uint32Array(descriptor.view.buffer, byteOffset, descriptor.count),
      count: descriptor.count,
    };
    if (typeof descriptor.validStart === 'number') {
      result.validStart = descriptor.validStart;
    }
    if (typeof descriptor.validEnd === 'number') {
      result.validEnd = descriptor.validEnd;
    }
    return result;
  }

  resolveDenseCount(descriptors, range) {
    let min = Number.POSITIVE_INFINITY;
    for (const entry of descriptors) {
      if (!entry || !entry.array) return 0;
      if (typeof entry.count !== 'number') return 0;
      const range = typeof entry.validStart === 'number' && typeof entry.validEnd === 'number'
        ? Math.max(0, entry.validEnd - entry.validStart)
        : entry.count;
      const effective = Math.min(entry.count, range);
      min = Math.min(min, effective);
    }
    if (range && typeof range.start === 'number' && typeof range.end === 'number') {
      min = Math.min(min, Math.max(0, range.end - range.start));
    }
    if (!Number.isFinite(min)) {
      return 0;
    }
    return Math.max(0, min);
  }

  /**
   * @param {unknown} error
   * @param {string} name
   */
  ignoreDuplicateAttribute(error, name) {
    if (error instanceof Error && error.message.includes('already')) {
      return;
    }
    throw new Error(`Unable to define attribute ${name}: ${error}`);
  }

  /**
   * @param {number} index
   * @param {number[]} color
   * @param {number} size
   * @param {Float32Array} positionView
   * @param {Float32Array} colorView
   * @param {Float32Array} sizeView
   */
  writeNodeDefaults(index, color, size, positionView, colorView, sizeView) {
    const colorOffset = index * 4;
    colorView[colorOffset + 0] = color[0];
    colorView[colorOffset + 1] = color[1];
    colorView[colorOffset + 2] = color[2];
    colorView[colorOffset + 3] = color[3];

    const sizeOffset = index;
    sizeView[sizeOffset] = size;

    const posOffset = index * 3;
    if (!Number.isFinite(positionView[posOffset])) {
      positionView[posOffset] = 0;
    }
    if (!Number.isFinite(positionView[posOffset + 1])) {
      positionView[posOffset + 1] = 0;
    }
    if (!Number.isFinite(positionView[posOffset + 2])) {
      positionView[posOffset + 2] = 0;
    }
  }

  /**
   * @param {number} index
   * @param {number[]} color
   * @param {number} width
   * @param {Float32Array} colorView
   * @param {Float32Array} widthView
   */
  writeEdgeDefaults(index, color, width, colorView, widthView) {
    const colorOffset = index * 4;
    colorView[colorOffset + 0] = color[0];
    colorView[colorOffset + 1] = color[1];
    colorView[colorOffset + 2] = color[2];
    colorView[colorOffset + 3] = color[3];

    widthView[index] = width;
  }

  updateDenseOrders() {
    if (!this.network?.setDenseNodeOrder || !this.network?.setDenseEdgeOrder) {
      return;
    }
    const nodeOrder = this.collectActiveIndices(this.network?.nodeActivityView);
    const edgeOrder = this.collectActiveIndices(this.network?.edgeActivityView);

    if (nodeOrder && nodeOrder.length !== this.lastNodeCount) {
      if (!this.nodeOrderCache || this.nodeOrderCache.length < nodeOrder.length) {
        this.nodeOrderCache = new Uint32Array(nodeOrder.length);
      }
      this.nodeOrderCache.set(nodeOrder);
      try {
        this.network.setDenseNodeOrder(this.nodeOrderCache.subarray(0, nodeOrder.length));
      } catch (_) {
        // ignore order failures; dense updates will fall back to defaults
      }
      this.lastNodeCount = nodeOrder.length;
    }

    if (edgeOrder && edgeOrder.length !== this.lastEdgeCount) {
      if (!this.edgeOrderCache || this.edgeOrderCache.length < edgeOrder.length) {
        this.edgeOrderCache = new Uint32Array(edgeOrder.length);
      }
      this.edgeOrderCache.set(edgeOrder);
      try {
        this.network.setDenseEdgeOrder(this.edgeOrderCache.subarray(0, edgeOrder.length));
      } catch (_) {
        // ignore order failures; dense updates will fall back to defaults
      }
      this.lastEdgeCount = edgeOrder.length;
    }
  }

  getValidRange(scope) {
    try {
      return scope === 'node' ? this.network?.nodeValidRange : this.network?.edgeValidRange;
    } catch (_) {
      return null;
    }
  }

  ensureNodeIndices(indices, count) {
    if (indices?.length >= count) {
      return indices.subarray(0, count);
    }
    if (!this.nodeOrderCache || this.nodeOrderCache.length < count) {
      this.nodeOrderCache = new Uint32Array(count);
    }
    for (let i = 0; i < count; i += 1) {
      this.nodeOrderCache[i] = i;
    }
    return this.nodeOrderCache.subarray(0, count);
  }

  ensureEdgeIndices(indices, count) {
    if (indices?.length >= count) {
      return indices.subarray(0, count);
    }
    if (!this.edgeOrderCache || this.edgeOrderCache.length < count) {
      this.edgeOrderCache = new Uint32Array(count);
    }
    for (let i = 0; i < count; i += 1) {
      this.edgeOrderCache[i] = i;
    }
    return this.edgeOrderCache.subarray(0, count);
  }

  collectActiveIndices(activityView) {
    if (!activityView) return null;
    let count = 0;
    for (let i = 0; i < activityView.length; i += 1) {
      if (activityView[i]) count += 1;
    }
    const result = new Uint32Array(count);
    let offset = 0;
    for (let i = 0; i < activityView.length; i += 1) {
      if (activityView[i]) {
        result[offset] = i;
        offset += 1;
      }
    }
    return result;
  }
}
