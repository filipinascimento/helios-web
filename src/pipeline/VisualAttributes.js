import { AttributeType } from 'helios-network';
import { VISUAL_ATTRIBUTE_NAMES, DEFAULT_VISUALS, VISUAL_ATTRIBUTE_MAP } from './constants.js';

const {
  NODE_COLOR_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

const {
  DEFAULT_EDGE_COLOR,
  DEFAULT_EDGE_OPACITY,
  DEFAULT_EDGE_WIDTH,
  DEFAULT_NODE_COLOR,
  DEFAULT_NODE_SIZE,
  DEFAULT_NODE_OUTLINE_COLOR,
  DEFAULT_NODE_OUTLINE_WIDTH,
} = DEFAULT_VISUALS;

function validateAttribute(buffer, name, expected) {
  if (!buffer) {
    throw new Error(`Attribute ${name} is missing`);
  }
  if (typeof expected.dimension === 'number' && buffer.dimension !== expected.dimension) {
    throw new Error(
      `Attribute ${name} has dimension ${buffer.dimension ?? 'unknown'}, expected ${expected.dimension}`,
    );
  }
  if (typeof expected.type === 'number' && buffer.type != null && buffer.type !== expected.type) {
    throw new Error(`Attribute ${name} has type ${buffer.type}, expected ${expected.type}`);
  }
}

function attributeInfoMismatched(info, expected) {
  if (!info) return false;
  const dimensionMismatch =
    typeof expected.dimension === 'number' && info.dimension != null && info.dimension !== expected.dimension;
  const typeMismatch = typeof expected.type === 'number' && info.type != null && info.type !== expected.type;
  return dimensionMismatch || typeMismatch;
}

/**
 * Ensures required visual attributes exist on the Helios network, seeds defaults,
 * and provides helpers to apply mappers into sparse buffers while marking dense
 * buffers dirty for rebuild.
 */
export class VisualAttributes {
  /**
   * @param {import('helios-network').default} network
   */
  constructor(network) {
    this.network = network;
    this.ensureAttributes();
    this.registerDenseBuffers();
    this.seedMissingEdgeOpacity();
  }

  get nodePositions() {
    return this.network.getNodeAttributeBuffer(NODE_POSITION_ATTRIBUTE).view;
  }

  get nodeColors() {
    return this.network.getNodeAttributeBuffer(NODE_COLOR_ATTRIBUTE).view;
  }

  get nodeSizes() {
    return this.network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE).view;
  }

  get nodeOutlineWidths() {
    return this.network.getNodeAttributeBuffer(NODE_OUTLINE_WIDTH_ATTRIBUTE).view;
  }

  get nodeOutlineColors() {
    return this.network.getNodeAttributeBuffer(NODE_OUTLINE_COLOR_ATTRIBUTE).view;
  }

  get edgeColors() {
    return this.network.getEdgeAttributeBuffer(EDGE_COLOR_ATTRIBUTE).view;
  }

  get edgeWidths() {
    return this.network.getEdgeAttributeBuffer(EDGE_WIDTH_ATTRIBUTE).view;
  }

  get edgeOpacities() {
    return this.network.getEdgeAttributeBuffer(EDGE_OPACITY_ATTRIBUTE).view;
  }

  /**
   * When networks are populated before Helios is created, edge opacity buffers
   * start at zero which hides edges entirely. Seed a reasonable default for any
   * active edge that still has an uninitialized (zero/invalid) opacity.
   */
  seedMissingEdgeOpacity() {
    this.withBufferAccess(() => {
      const activity = this.network?.edgeActivityView;
      const opacities = this.edgeOpacities;
      if (!activity || !opacities) return;
      let touched = false;
      for (let edgeId = 0; edgeId < activity.length; edgeId += 1) {
        if (!activity[edgeId]) continue;
        const offset = edgeId * 2;
        const a = opacities[offset];
        const b = opacities[offset + 1];
        const invalidA = !Number.isFinite(a) || a === 0;
        const invalidB = !Number.isFinite(b) || b === 0;
        if (invalidA && invalidB) {
          opacities[offset] = DEFAULT_EDGE_OPACITY;
          opacities[offset + 1] = DEFAULT_EDGE_OPACITY;
          touched = true;
        }
      }
      if (touched) {
        this.markEdgeAttributesDirty(EDGE_OPACITY_ATTRIBUTE);
      }
    });
  }

  applyMappers({ nodeMapper, edgeMapper } = {}) {
    if (nodeMapper) this.applyNodeMapper(nodeMapper);
    if (edgeMapper) this.applyEdgeMapper(edgeMapper);
  }

  applyNodeMapper(mapper) {
    if (!mapper?.channels?.size) return;
    this.withBufferAccess(() => {
      const attributes = this.collectAttributeNames(mapper, 'node');
      const buffers = this.resolveNodeAttributeBuffers(attributes.node);
      const visuals = {
        color: this.nodeColors,
        size: this.nodeSizes,
        outline: this.nodeOutlineWidths,
        outlineColor: this.nodeOutlineColors,
        position: this.nodePositions,
      };
      const activity = this.network?.nodeActivityView;
      if (!activity) return;
      for (let nodeId = 0; nodeId < activity.length; nodeId += 1) {
        if (!activity[nodeId]) continue;
        const inputs = this.buildAttributeObject(buffers, nodeId);
        const mapped = mapper.mapItem({ attributes: inputs }, { index: nodeId });
        this.writeNodeVisuals(nodeId, mapped, visuals);
      }
      this.markNodeAttributesDirty(
        NODE_COLOR_ATTRIBUTE,
        NODE_SIZE_ATTRIBUTE,
        NODE_OUTLINE_WIDTH_ATTRIBUTE,
        NODE_OUTLINE_COLOR_ATTRIBUTE,
        NODE_POSITION_ATTRIBUTE,
      );
      this.markEdgeAttributesDirty(EDGE_ENDPOINTS_SIZE_ATTRIBUTE, EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    });
  }

  applyEdgeMapper(mapper) {
    if (!mapper?.channels?.size) return;
    this.withBufferAccess(() => {
      const attributes = this.collectAttributeNames(mapper, 'edge');
      const edgeBuffers = this.resolveEdgeAttributeBuffers(attributes.edge);
      const nodeBuffers = this.resolveNodeAttributeBuffers(attributes.node);
      const nodeToEdgeRegistrations = mapper?.nodeToEdgeRegistrations ?? new Set();
      const skipColor = nodeToEdgeRegistrations.has(EDGE_COLOR_ATTRIBUTE);
      const skipOpacity = nodeToEdgeRegistrations.has(EDGE_OPACITY_ATTRIBUTE);
      const skipEndpointSize = nodeToEdgeRegistrations.has(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
      const visuals = {
        color: skipColor ? null : this.edgeColors,
        opacity: skipOpacity ? null : this.edgeOpacities,
        width: this.edgeWidths,
        endpointSize: skipEndpointSize ? null : this.network.getEdgeAttributeBuffer(EDGE_ENDPOINTS_SIZE_ATTRIBUTE).view,
      };
      const activity = this.network?.edgeActivityView;
      const edgesView = this.network?.edgesView;
      if (!activity) return;
      for (let edgeId = 0; edgeId < activity.length; edgeId += 1) {
        if (!activity[edgeId]) continue;
        const edgeInputs = this.buildEdgeAttributeObject(edgeBuffers, edgeId);
        const sourceId = edgesView ? edgesView[edgeId * 2] : null;
        const targetId = edgesView ? edgesView[edgeId * 2 + 1] : null;
        const sourceAttributes = sourceId != null ? this.buildAttributeObject(nodeBuffers, sourceId) : {};
        const targetAttributes = targetId != null ? this.buildAttributeObject(nodeBuffers, targetId) : {};
        const mapped = mapper.mapItem(
          { attributes: edgeInputs, source: { attributes: sourceAttributes }, target: { attributes: targetAttributes } },
          { index: edgeId },
        );
        this.writeEdgeVisuals(edgeId, mapped, visuals);
      }
      this.markEdgeAttributesDirty(
        EDGE_COLOR_ATTRIBUTE,
        EDGE_OPACITY_ATTRIBUTE,
        EDGE_WIDTH_ATTRIBUTE,
        EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
      );
    });
  }

  ensureAttributes() {
    this.ensureNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);
    this.ensureNodeAttribute(NODE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    this.ensureNodeAttribute(NODE_SIZE_ATTRIBUTE, AttributeType.Float, 1);
    this.ensureNodeAttribute(NODE_OUTLINE_WIDTH_ATTRIBUTE, AttributeType.Float, 1);
    this.ensureNodeAttribute(NODE_OUTLINE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    this.ensureEdgeAttribute(EDGE_COLOR_ATTRIBUTE, AttributeType.Float, 8);
    this.ensureEdgeAttribute(EDGE_OPACITY_ATTRIBUTE, AttributeType.Float, 2);
    this.ensureEdgeAttribute(EDGE_WIDTH_ATTRIBUTE, AttributeType.Float, 2);
    this.ensureNodeToEdgeAttribute(NODE_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_POSITION_ATTRIBUTE, 3);
    this.ensureNodeToEdgeAttribute(NODE_SIZE_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE, 1);
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
    addDense('addDenseNodeAttributeBuffer', NODE_OUTLINE_WIDTH_ATTRIBUTE);
    addDense('addDenseNodeAttributeBuffer', NODE_OUTLINE_COLOR_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_COLOR_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_OPACITY_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_WIDTH_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    addDense('addDenseEdgeAttributeBuffer', EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  }

  markNodeAttributesDirty(...names) {
    if (typeof this.network?.markDenseNodeAttributeDirty !== 'function') return;
    const targets =
      names && names.length
        ? names
        : [
            NODE_POSITION_ATTRIBUTE,
            NODE_COLOR_ATTRIBUTE,
            NODE_SIZE_ATTRIBUTE,
            NODE_OUTLINE_WIDTH_ATTRIBUTE,
            NODE_OUTLINE_COLOR_ATTRIBUTE,
          ];
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
        : [
            EDGE_COLOR_ATTRIBUTE,
            EDGE_OPACITY_ATTRIBUTE,
            EDGE_WIDTH_ATTRIBUTE,
            EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
            EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
          ];
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

  markPositionsDirty() {
    this.markNodeAttributesDirty(NODE_POSITION_ATTRIBUTE, NODE_SIZE_ATTRIBUTE);
    this.markEdgeAttributesDirty(EDGE_ENDPOINTS_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  }

  /**
   * Initializes basic node visuals. Can be re-used whenever nodes are added.
   * @param {Iterable<number>} [indices]
   */
  applyNodeDefaults(indices) {
    this.withBufferAccess(() => {
      const color = DEFAULT_NODE_COLOR;
      const size = DEFAULT_NODE_SIZE;
      const outlineWidth = DEFAULT_NODE_OUTLINE_WIDTH;
      const outlineColor = DEFAULT_NODE_OUTLINE_COLOR;
      const positionView = this.nodePositions;
      const colorView = this.nodeColors;
      const sizeView = this.nodeSizes;
      const outlineWidthView = this.nodeOutlineWidths;
      const outlineColorView = this.nodeOutlineColors;

      if (!indices) {
        const activity = this.network.nodeActivityView;
        for (let i = 0; i < activity.length; i += 1) {
          if (activity[i]) {
            this.writeNodeDefaults(
              i,
              color,
              size,
              outlineWidth,
              outlineColor,
              positionView,
              colorView,
              sizeView,
              outlineWidthView,
              outlineColorView,
            );
          }
        }
      } else {
        for (const index of indices) {
          this.writeNodeDefaults(
            index,
            color,
            size,
            outlineWidth,
            outlineColor,
            positionView,
            colorView,
            sizeView,
            outlineWidthView,
            outlineColorView,
          );
        }
      }

      this.markNodeAttributesDirty(
        NODE_POSITION_ATTRIBUTE,
        NODE_COLOR_ATTRIBUTE,
        NODE_SIZE_ATTRIBUTE,
        NODE_OUTLINE_WIDTH_ATTRIBUTE,
        NODE_OUTLINE_COLOR_ATTRIBUTE,
      );
      this.markEdgeAttributesDirty(EDGE_ENDPOINTS_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
    });
  }

  /**
   * Initializes basic edge visuals. Can be re-used whenever edges are added.
   * @param {Iterable<number>} [indices]
   */
  applyEdgeDefaults(indices) {
    this.withBufferAccess(() => {
      const color = DEFAULT_EDGE_COLOR;
      const opacity = DEFAULT_EDGE_OPACITY;
      const width = DEFAULT_EDGE_WIDTH;
      const colorView = this.edgeColors;
      const opacityView = this.edgeOpacities;
      const widthView = this.edgeWidths;

      if (!indices) {
        const activity = this.network.edgeActivityView;
        for (let i = 0; i < activity.length; i += 1) {
          if (activity[i]) {
            this.writeEdgeDefaults(i, color, width, opacity, colorView, widthView, opacityView);
          }
        }
      } else {
        for (const index of indices) {
          this.writeEdgeDefaults(index, color, width, opacity, colorView, widthView, opacityView);
        }
      }

      this.markEdgeAttributesDirty(EDGE_COLOR_ATTRIBUTE, EDGE_OPACITY_ATTRIBUTE, EDGE_WIDTH_ATTRIBUTE);
    });
  }

  /**
   * Seeds missing node positions with random values so downstream layouts/renderers
   * always have finite coordinates to start with.
   * @param {{width?: number, height?: number}} [bounds]
   */
  seedMissingPositions(bounds = {}) {
    this.withBufferAccess(() => {
      const width = Math.max(1, bounds.width ?? 1);
      const height = Math.max(1, bounds.height ?? 1);
      const pos = this.nodePositions;
      const activity = this.network?.nodeActivityView;
      if (!pos || !activity) return;
      let touched = false;
      for (let i = 0; i < activity.length; i += 1) {
        if (!activity[i]) continue;
        const offset = i * 3;
        const missing =
          !Number.isFinite(pos[offset]) ||
          !Number.isFinite(pos[offset + 1]) ||
          !Number.isFinite(pos[offset + 2]) ||
          (pos[offset] === 0 && pos[offset + 1] === 0 && pos[offset + 2] === 0);
        if (missing) {
          pos[offset] = Math.random() * width;
          pos[offset + 1] = Math.random() * height;
          pos[offset + 2] = 0;
          touched = true;
        }
      }
      if (touched) {
        this.markNodeAttributesDirty(NODE_POSITION_ATTRIBUTE);
        this.markEdgeAttributesDirty(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
      }
    });
  }

  ensureNodeAttribute(name, type, dimension) {
    const expected = { dimension, type };
    const info = this.network.getNodeAttributeInfo(name);
    const hasAttribute = this.network.hasNodeAttribute(name);

    if (!hasAttribute) {
      this.network.defineNodeAttribute(name, type, dimension);
    } else if (attributeInfoMismatched(info, expected)) {
      throw new Error(
        `Attribute ${name} metadata mismatch: dimension ${info?.dimension ?? 'unknown'}, expected ${dimension}`,
      );
    }

    const buffer = this.network.getNodeAttributeBuffer(name);
    validateAttribute(buffer, name, expected);
  }

  ensureEdgeAttribute(name, type, dimension) {
    const expected = { dimension, type };
    const info = this.network.getEdgeAttributeInfo(name);
    const hasAttribute = this.network.hasEdgeAttribute(name, true);

    if (!hasAttribute) {
      this.network.defineEdgeAttribute(name, type, dimension);
    } else if (attributeInfoMismatched(info, expected)) {
      this.network.removeEdgeAttribute(name);
      this.network.defineEdgeAttribute(name, type, dimension);
    }

    const buffer = this.network.getEdgeAttributeBuffer(name);
    validateAttribute(buffer, name, expected);
  }

  ensureNodeToEdgeAttribute(sourceName, edgeName, sourceDimension) {
    const targetDimension = sourceDimension * 2;
    const expected = { dimension: targetDimension, type: AttributeType.Float };
    const info = this.network.getEdgeAttributeInfo(edgeName);
    const hasAttribute = this.network.hasEdgeAttribute(edgeName);

    if (!hasAttribute) {
      this.network.defineNodeToEdgeAttribute(sourceName, edgeName, 'both');
    } else if (attributeInfoMismatched(info, expected)) {
      this.network.removeEdgeAttribute(edgeName);
      this.network.defineNodeToEdgeAttribute(sourceName, edgeName, 'both');
    }

    const buffer = this.network.getEdgeAttributeBuffer(edgeName);
    validateAttribute(buffer, edgeName, expected);
  }

  collectAttributeNames(mapper, mode) {
    const node = new Set();
    const edge = new Set();
    const add = (attr) => {
      if (!attr) return;
      const list = Array.isArray(attr) ? attr : [attr];
      for (const entry of list) {
        if (typeof entry !== 'string') continue;
        if (entry.startsWith('@node.') || entry.startsWith('@nodes.')) {
          node.add(entry.replace('@nodes.', '').replace('@node.', ''));
        } else {
          (mode === 'edge' ? edge : node).add(entry);
        }
      }
    };
    for (const config of mapper.channels.values()) {
      add(config.attributes ?? config.from);
      if (config.rules) {
        for (const rule of config.rules) {
          add(rule.attributes);
        }
      }
    }
    return { node, edge };
  }

  resolveNodeAttributeBuffers(names) {
    const buffers = new Map();
    if (!names?.size) return buffers;
    for (const name of names) {
      const lookup = VISUAL_ATTRIBUTE_MAP[name] ?? name;
      try {
        const buffer = this.network.getNodeAttributeBuffer(lookup);
        if (buffer?.view) {
          const dimension = buffer.dimension ?? 1;
          buffers.set(name, { view: buffer.view, dimension: dimension > 0 ? dimension : 1 });
        }
      } catch (_) {
        // ignore missing attributes
      }
    }
    return buffers;
  }

  resolveEdgeAttributeBuffers(names) {
    const buffers = new Map();
    if (!names?.size) return buffers;
    for (const name of names) {
      const lookup = VISUAL_ATTRIBUTE_MAP[name] ?? name;
      try {
        const buffer = this.network.getEdgeAttributeBuffer(lookup);
        if (buffer?.view) {
          buffers.set(name, { view: buffer.view, dimension: buffer.dimension ?? 1 });
        }
      } catch (_) {
        // ignore missing attributes
      }
    }
    return buffers;
  }

  buildAttributeObject(buffers, index) {
    const result = {};
    for (const [name, info] of buffers.entries()) {
      const { view, dimension } = info;
      if (!view) continue;
      if (dimension === 1) {
        result[name] = view[index];
      } else {
        const start = index * dimension;
        result[name] = Array.from(view.subarray(start, start + dimension));
      }
    }
    return result;
  }

  buildEdgeAttributeObject(buffers, edgeId) {
    return this.buildAttributeObject(buffers, edgeId);
  }

  writeNodeVisuals(nodeId, mapped, visuals) {
    if (!mapped) return;
    if (mapped.color && visuals.color) {
      const rgba = this.toRgba(mapped.color);
      const offset = nodeId * 4;
      visuals.color[offset + 0] = rgba[0];
      visuals.color[offset + 1] = rgba[1];
      visuals.color[offset + 2] = rgba[2];
      visuals.color[offset + 3] = rgba[3];
    }
    if (Number.isFinite(mapped.size) && visuals.size) {
      visuals.size[nodeId] = mapped.size;
    }
    if (Number.isFinite(mapped.outline) && visuals.outline) {
      visuals.outline[nodeId] = mapped.outline;
    }
    if (mapped.outlineColor && visuals.outlineColor) {
      const rgba = this.toRgba(mapped.outlineColor);
      const offset = nodeId * 4;
      visuals.outlineColor[offset + 0] = rgba[0];
      visuals.outlineColor[offset + 1] = rgba[1];
      visuals.outlineColor[offset + 2] = rgba[2];
      visuals.outlineColor[offset + 3] = rgba[3];
    }
    if (Array.isArray(mapped.position) && visuals.position) {
      const offset = nodeId * 3;
      visuals.position[offset + 0] = mapped.position[0] ?? visuals.position[offset + 0];
      visuals.position[offset + 1] = mapped.position[1] ?? visuals.position[offset + 1];
      visuals.position[offset + 2] = mapped.position[2] ?? visuals.position[offset + 2];
    }
  }

  writeEdgeVisuals(edgeId, mapped, visuals) {
    if (!mapped) return;
    if (mapped.color && visuals.color) {
      const [startColor, endColor] = this.resolveEdgeColorPair(mapped.color);
      const offset = edgeId * 8;
      visuals.color[offset + 0] = startColor[0];
      visuals.color[offset + 1] = startColor[1];
      visuals.color[offset + 2] = startColor[2];
      visuals.color[offset + 3] = startColor[3];
      visuals.color[offset + 4] = endColor[0];
      visuals.color[offset + 5] = endColor[1];
      visuals.color[offset + 6] = endColor[2];
      visuals.color[offset + 7] = endColor[3];
    }
    if (mapped.width != null && visuals.width) {
      const [startWidth, endWidth] = this.resolveEdgeScalarPair(mapped.width);
      const offset = edgeId * 2;
      visuals.width[offset + 0] = startWidth;
      visuals.width[offset + 1] = endWidth;
    }
    if (mapped.opacity != null && visuals.opacity) {
      const [startOpacity, endOpacity] = this.resolveEdgeScalarPair(mapped.opacity);
      const offset = edgeId * 2;
      visuals.opacity[offset + 0] = startOpacity;
      visuals.opacity[offset + 1] = endOpacity;
    }
    if (mapped.endpointSize && visuals.endpointSize) {
      const value = Array.isArray(mapped.endpointSize)
        ? mapped.endpointSize
        : [mapped.endpointSize?.source, mapped.endpointSize?.target];
      const offset = edgeId * 2;
      visuals.endpointSize[offset + 0] = value?.[0] ?? visuals.endpointSize[offset + 0];
      visuals.endpointSize[offset + 1] = value?.[1] ?? visuals.endpointSize[offset + 1];
    }
  }

  toRgba(value) {
    const fallback = [0, 0, 0, 1];
    const isArrayLike = Array.isArray(value) || ArrayBuffer.isView(value);
    if (isArrayLike) {
      if (value.length === 4) {
        const needsScale = value.some((v) => v > 1);
        return needsScale ? value.map((v, i) => (i < 3 ? (v ?? 0) / 255 : v ?? 1)) : value;
      }
      if (value.length === 3) {
        const needsScale = value.some((v) => v > 1);
        const scaled = needsScale ? value.map((v) => (v ?? 0) / 255) : value;
        return [scaled[0] ?? 0, scaled[1] ?? 0, scaled[2] ?? 0, 1];
      }
    }
    if (typeof value === 'string') {
      const hex = value.trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
        const raw = hex.slice(1);
        const expand = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
        const int = parseInt(expand, 16);
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        return [r / 255, g / 255, b / 255, 1];
      }
    }
    if (typeof value === 'number') {
      const v = value > 1 ? value / 255 : value;
      return [v, v, v, 1];
    }
    if (value && typeof value === 'object' && 'source' in value) {
      return this.toRgba(value.source);
    }
    return fallback;
  }

  resolveEdgeColorPair(value) {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      if (value.length >= 8) {
        const start = [value[0], value[1], value[2], value[3]];
        const end = [value[4], value[5], value[6], value[7]];
        return [this.toRgba(start), this.toRgba(end)];
      }
      if (value.length === 4) {
        const rgba = this.toRgba(value);
        return [rgba, rgba];
      }
    }
    if (value && typeof value === 'object') {
      const start = 'source' in value ? this.toRgba(value.source) : this.toRgba(value);
      const end = 'target' in value ? this.toRgba(value.target) : start;
      return [start, end];
    }
    const rgba = this.toRgba(value);
    return [rgba, rgba];
  }

  resolveEdgeScalarPair(value) {
    if (Array.isArray(value) || ArrayBuffer.isView(value)) {
      if (value.length >= 2) {
        const start = Number.isFinite(value[0]) ? Number(value[0]) : 0;
        const end = Number.isFinite(value[1]) ? Number(value[1]) : start;
        return [start, end];
      }
      if (value.length === 1) {
        const v = Number(value[0]) ?? 0;
        return [v, v];
      }
    }
    if (value && typeof value === 'object') {
      const start = 'source' in value ? Number(value.source) : Number(value);
      const end = 'target' in value ? Number(value.target) : start;
      const startSafe = Number.isFinite(start) ? start : 0;
      const endSafe = Number.isFinite(end) ? end : startSafe;
      return [startSafe, endSafe];
    }
    const scalar = Number.isFinite(value) ? value : 0;
    return [scalar, scalar];
  }

  writeNodeDefaults(
    index,
    color,
    size,
    outlineWidth,
    outlineColor,
    positionView,
    colorView,
    sizeView,
    outlineWidthView,
    outlineColorView,
  ) {
    const colorOffset = index * 4;
    colorView[colorOffset + 0] = color[0];
    colorView[colorOffset + 1] = color[1];
    colorView[colorOffset + 2] = color[2];
    colorView[colorOffset + 3] = color[3];

    const sizeOffset = index;
    sizeView[sizeOffset] = size;

    outlineWidthView[sizeOffset] = outlineWidth;
    const outlineOffset = index * 4;
    outlineColorView[outlineOffset + 0] = outlineColor[0];
    outlineColorView[outlineOffset + 1] = outlineColor[1];
    outlineColorView[outlineOffset + 2] = outlineColor[2];
    outlineColorView[outlineOffset + 3] = outlineColor[3];

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

  writeEdgeDefaults(index, color, width, opacity, colorView, widthView, opacityView) {
    const colorOffset = index * 8;
    const rgba = this.toRgba(color);
    colorView[colorOffset + 0] = rgba[0];
    colorView[colorOffset + 1] = rgba[1];
    colorView[colorOffset + 2] = rgba[2];
    colorView[colorOffset + 3] = rgba[3];
    colorView[colorOffset + 4] = rgba[0];
    colorView[colorOffset + 5] = rgba[1];
    colorView[colorOffset + 6] = rgba[2];
    colorView[colorOffset + 7] = rgba[3];

    const widthOffset = index * 2;
    widthView[widthOffset] = width;
    widthView[widthOffset + 1] = width;

    if (opacityView) {
      const opacityOffset = index * 2;
      opacityView[opacityOffset] = opacity;
      opacityView[opacityOffset + 1] = opacity;
    }
  }

  withBufferAccess(fn) {
    if (typeof this.network?.withBufferAccess === 'function') {
      return this.network.withBufferAccess(fn);
    }
    return fn();
  }
}

export default VisualAttributes;
