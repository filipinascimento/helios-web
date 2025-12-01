import { AttributeType } from 'helios-network';

/** @typedef {import('helios-network').default} HeliosNetwork */
import {
  NODE_COLOR_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_GEOMETRY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  DEFAULT_EDGE_COLOR,
  DEFAULT_EDGE_WIDTH,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_SIZE,
} from './constants';

/**
 * @typedef {Object} VisualAttributeViews
 * @property {Float32Array} nodePositions
 * @property {Float32Array} nodeColors
 * @property {Float32Array} nodeSizes
 * @property {Float32Array} edgeColors
 * @property {Float32Array} edgeWidths
 * @property {Float32Array} edgeGeometry
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
    this.ensureAttributes();
    this.registerDenseBuffers();
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
      edgeGeometry: this.edgeGeometry,
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
   * @returns {Float32Array}
   */
  get edgeGeometry() {
    return this.network.getEdgeAttributeBuffer(EDGE_GEOMETRY_ATTRIBUTE).view;
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
      return;
    }

    for (const index of indices) {
      this.writeNodeDefaults(index, color, size, positionView, colorView, sizeView);
    }

    this.markDenseNodeAttributesDirty();
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
      return;
    }

    for (const index of indices) {
      this.writeEdgeDefaults(index, color, width, colorView, widthView);
    }

    this.markDenseEdgeAttributesDirty();
  }

  ensureAttributes() {
    // Positions store a padded vec4 to keep GPU alignment predictable (x, y, z, w).
    this.ensureNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 4);
    this.ensureNodeAttribute(NODE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    this.ensureNodeAttribute(NODE_SIZE_ATTRIBUTE, AttributeType.Float, 1);
    this.ensureEdgeAttribute(EDGE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    this.ensureEdgeAttribute(EDGE_WIDTH_ATTRIBUTE, AttributeType.Float, 1);
    // Edge geometry stores two padded vec4 values: start(xyz1) and end(xyz1).
    this.ensureEdgeAttribute(EDGE_GEOMETRY_ATTRIBUTE, AttributeType.Float, 8);
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
    addDense('addDenseEdgeAttributeBuffer', EDGE_GEOMETRY_ATTRIBUTE);
  }

  markDenseNodeAttributesDirty() {
    if (typeof this.network?.markDenseNodeAttributeDirty !== 'function') return;
    try {
      this.network.markDenseNodeAttributeDirty(NODE_POSITION_ATTRIBUTE);
      this.network.markDenseNodeAttributeDirty(NODE_COLOR_ATTRIBUTE);
      this.network.markDenseNodeAttributeDirty(NODE_SIZE_ATTRIBUTE);
    } catch (_) {
      // Ignore if dense buffers are unavailable.
    }
  }

  markDenseEdgeAttributesDirty() {
    if (typeof this.network?.markDenseEdgeAttributeDirty !== 'function') return;
    try {
      this.network.markDenseEdgeAttributeDirty(EDGE_COLOR_ATTRIBUTE);
      this.network.markDenseEdgeAttributeDirty(EDGE_WIDTH_ATTRIBUTE);
      this.network.markDenseEdgeAttributeDirty(EDGE_GEOMETRY_ATTRIBUTE);
    } catch (_) {
      // Ignore if dense buffers are unavailable.
    }
  }

  /**
   * @param {unknown} error
   * @param {string} name
   */
  ignoreDuplicateAttribute(error, name) {
    if (error instanceof Error && error.message.includes('already defined')) {
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

    const posOffset = index * 4;
    if (!Number.isFinite(positionView[posOffset])) {
      positionView[posOffset] = 0;
    }
    if (!Number.isFinite(positionView[posOffset + 1])) {
      positionView[posOffset + 1] = 0;
    }
    if (!Number.isFinite(positionView[posOffset + 2])) {
      positionView[posOffset + 2] = 0;
    }
    positionView[posOffset + 3] = 1;
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
}
