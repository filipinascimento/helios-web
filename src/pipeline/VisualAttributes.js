import { AttributeType } from 'helios-network';
import { VISUAL_ATTRIBUTE_NAMES, DEFAULT_VISUALS, VISUAL_ATTRIBUTE_MAP } from './constants.js';
import { resolveEdgeMapperForNodeConstants } from './Mapper.js';

const {
  NODE_COLOR_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_ENDPOINTS_STATE_ATTRIBUTE,
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

const EDGE_CHANNEL_TO_ATTRIBUTE = {
  color: EDGE_COLOR_ATTRIBUTE,
  width: EDGE_WIDTH_ATTRIBUTE,
  opacity: EDGE_OPACITY_ATTRIBUTE,
  endpointSize: EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  endpointPosition: EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  endpointState: EDGE_ENDPOINTS_STATE_ATTRIBUTE,
};

const EDGE_CHANNEL_DEFAULT_NODE_ATTRIBUTE = {
  color: NODE_COLOR_ATTRIBUTE,
  width: NODE_SIZE_ATTRIBUTE,
  opacity: NODE_SIZE_ATTRIBUTE,
  endpointSize: NODE_SIZE_ATTRIBUTE,
  endpointPosition: NODE_POSITION_ATTRIBUTE,
  endpointState: NODE_STATE_ATTRIBUTE,
};

function normalizeEndpoints(value) {
  if (value === 'source' || value === 'from') return 'source';
  if (value === 'destination' || value === 'target' || value === 'to') return 'destination';
  return 'both';
}

function normalizeAttributeName(name) {
  if (typeof name !== 'string') return name;
  const trimmed = name.replace(/^@nodes?\./, '');
  return VISUAL_ATTRIBUTE_MAP[trimmed] ?? trimmed;
}

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

function expandAttributeData({ view, count, fromDimension, toDimension }) {
  const result = new Float32Array(count * toDimension);
  if (!view || !view.length || fromDimension <= 0 || toDimension <= 0) return result;
  const ratio = toDimension / fromDimension;
  const duplicateEach = Number.isInteger(ratio) && ratio === 2 ? 2 : 1;
  for (let i = 0; i < count; i += 1) {
    const baseFrom = i * fromDimension;
    const baseTo = i * toDimension;
    for (let k = 0; k < toDimension; k += 1) {
      if (duplicateEach === 2 && toDimension === fromDimension * 2) {
        const sourceIndex = baseFrom + Math.floor(k / 2);
        result[baseTo + k] = view[sourceIndex] ?? 0;
      } else {
        const sourceIndex = baseFrom + Math.min(k, fromDimension - 1);
        result[baseTo + k] = view[sourceIndex] ?? 0;
      }
    }
  }
  return result;
}

/**
 * Ensures required visual attributes exist on the Helios network, seeds defaults,
 * and provides helpers to apply mappers into sparse buffers.
 */
export class VisualAttributes {
  /**
   * @param {import('helios-network').default} network
   */
  constructor(network, debug) {
    this.network = network;
    this.debug = debug;
    this.maxInitializedNodeId = -1;
    this.ensureAttributes();
    this.seedMissingEdgeOpacity();
  }

  get nodePositions() {
    return this.getNodeAttributeView(NODE_POSITION_ATTRIBUTE);
  }

  get nodeColors() {
    return this.getNodeAttributeView(NODE_COLOR_ATTRIBUTE);
  }

  get nodeSizes() {
    return this.getNodeAttributeView(NODE_SIZE_ATTRIBUTE);
  }

  get nodeStates() {
    return this.getNodeAttributeView(NODE_STATE_ATTRIBUTE);
  }

  get nodeOutlineWidths() {
    return this.getNodeAttributeView(NODE_OUTLINE_WIDTH_ATTRIBUTE);
  }

  get nodeOutlineColors() {
    return this.getNodeAttributeView(NODE_OUTLINE_COLOR_ATTRIBUTE);
  }

  get edgeColors() {
    return this.getEdgeAttributeView(EDGE_COLOR_ATTRIBUTE);
  }

  get edgeWidths() {
    return this.getEdgeAttributeView(EDGE_WIDTH_ATTRIBUTE);
  }

  get edgeOpacities() {
    return this.getEdgeAttributeView(EDGE_OPACITY_ATTRIBUTE);
  }

  get edgeStates() {
    return this.getEdgeAttributeView(EDGE_STATE_ATTRIBUTE);
  }

  getNodeAttributeView(name) {
    if (!this.network) return null;
    const read = () => {
      try {
        return this.network.getNodeAttributeBuffer(name)?.view ?? null;
      } catch (_) {
        return null;
      }
    };
    return this.withBufferAccess(read);
  }

  getEdgeAttributeView(name) {
    if (!this.network) return null;
    const read = () => {
      try {
        return this.network.getEdgeAttributeBuffer(name)?.view ?? null;
      } catch (_) {
        return null;
      }
    };
    return this.withBufferAccess(read);
  }

  /**
   * When networks are populated before Helios is created, edge opacity buffers
   * start at zero which hides edges entirely. Seed a reasonable default for any
   * active edge that still has an uninitialized (zero/invalid) opacity.
   */
  seedMissingEdgeOpacity() {
    const edgeIndices = this.network?.edgeIndices;
    if (!edgeIndices?.length) return;
    this.withBufferAccess(() => {
      const opacities = this.edgeOpacities;
      if (!opacities) return;
      let touched = false;
      for (let i = 0; i < edgeIndices.length; i += 1) {
        const edgeId = edgeIndices[i];
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
        this.bumpEdgeAttributes(EDGE_OPACITY_ATTRIBUTE);
      }
    });
  }

  applyMappers({ nodeMapper, edgeMapper } = {}) {
    this.debug?.log('mapper', 'Applying mappers to visuals');
    const resolvedEdgeMapper =
      nodeMapper && edgeMapper
        ? resolveEdgeMapperForNodeConstants(edgeMapper, nodeMapper, { network: this.network, debug: this.debug })
        : edgeMapper;
    const visualConfig = this.buildVisualConstantConfig({ nodeMapper, edgeMapper: resolvedEdgeMapper });
    this.ensureVisualAttributesForConfig({ nodeMapper, edgeMapper: resolvedEdgeMapper, visualConfig });
    this.setNetworkVisualConfig(visualConfig);
    if (nodeMapper) this.applyNodeMapper(nodeMapper, visualConfig);
    if (resolvedEdgeMapper) this.applyEdgeMapper(resolvedEdgeMapper, visualConfig);
    this.debug?.log('mapper', 'Finished applying mappers');
  }

  setNetworkVisualConfig(config) {
    if (!this.network) return;
    Object.defineProperty(this.network, '__heliosVisualConfig', {
      value: config,
      writable: true,
      configurable: true,
    });
  }

  buildVisualConstantConfig({ nodeMapper, edgeMapper } = {}) {
    const node = this.buildNodeConstantConfig(nodeMapper);
    return {
      node,
      edge: this.buildEdgeConstantConfig(edgeMapper, node),
    };
  }

  buildNodeConstantConfig(mapper) {
    const channels = mapper?.channels;
    const get = (name) => channels?.get?.(name);
    const normalizeNumber = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
    const normalizeRgba = (v) => (v != null ? this.toRgba(v) : undefined);

    const color = get('color');
    const size = get('size');
    const outline = get('outline');
    const outlineColor = get('outlineColor');

    return {
      color: color?.type === 'constant' ? { mode: 'uniform', value: normalizeRgba(color.value) } : { mode: 'buffer' },
      size: size?.type === 'constant' ? { mode: 'uniform', value: normalizeNumber(size.value) } : { mode: 'buffer' },
      outline: outline?.type === 'constant' ? { mode: 'uniform', value: normalizeNumber(outline.value) } : { mode: 'buffer' },
      outlineColor: outlineColor?.type === 'constant'
        ? { mode: 'uniform', value: normalizeRgba(outlineColor.value) }
        : { mode: 'buffer' },
    };
  }

  buildEdgeConstantConfig(mapper, nodeConfig = null) {
    const channels = mapper?.channels;
    const get = (name) => channels?.get?.(name);
    const normalizePair = (v) => {
      if (v == null) return undefined;
      const [a, b] = this.resolveEdgeScalarPair(v);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
      return [a, b];
    };
    const normalizeColorPair = (v) => {
      if (v == null) return undefined;
      const [start, end] = this.resolveEdgeColorPair(v);
      return [start, end];
    };

    const color = get('color');
    const width = get('width');
    const opacity = get('opacity');
    const endpointSize = get('endpointSize');
    const nodeSizeFallback = nodeConfig?.size?.mode === 'uniform'
      ? normalizePair(nodeConfig?.size?.value)
      : undefined;

    const config = {
      color: color?.type === 'constant' ? { mode: 'uniform', value: normalizeColorPair(color.value) } : { mode: 'buffer' },
      width: width?.type === 'constant' ? { mode: 'uniform', value: normalizePair(width.value) } : { mode: 'buffer' },
      opacity: opacity?.type === 'constant'
        ? { mode: 'uniform', value: normalizePair(opacity.value) }
        : (opacity == null
          ? { mode: 'uniform', value: normalizePair(DEFAULT_EDGE_OPACITY) }
          : { mode: 'buffer' }),
      endpointSize: endpointSize?.type === 'constant'
        ? { mode: 'uniform', value: normalizePair(endpointSize.value) }
        : (endpointSize == null && nodeSizeFallback
          ? { mode: 'uniform', value: nodeSizeFallback }
          : { mode: 'buffer' }),
    };
    return this.augmentEdgeSourceConfig(config, mapper);
  }

  augmentEdgeSourceConfig(edgeConfig, mapper) {
    if (!edgeConfig) return edgeConfig;
    const passthroughs = typeof this.network?.getNodeToEdgePassthroughs === 'function'
      ? this.network.getNodeToEdgePassthroughs()
      : null;
    const passthroughMap = new Map();
    if (Array.isArray(passthroughs)) {
      for (const entry of passthroughs) {
        if (!entry?.edgeName) continue;
        passthroughMap.set(entry.edgeName, entry);
      }
    }

    const inferNodeAttributeFromConfig = (config) => {
      if (!config) return null;
      if (typeof config.nodeAttribute === 'string') {
        return normalizeAttributeName(config.nodeAttribute);
      }
      const attrs = config.attributes ?? config.from;
      const list = Array.isArray(attrs) ? attrs : (attrs ? [attrs] : []);
      for (const attr of list) {
        if (typeof attr !== 'string') continue;
        if (!/^@nodes?\\./.test(attr)) continue;
        return normalizeAttributeName(attr);
      }
      return null;
    };

    const inferNodeSourceFromMapper = (channelName) => {
      const channel = mapper?.channels?.get?.(channelName);
      if (!channel) return null;
      const type = channel.type ?? channel.mode;
      if (type !== 'passthrough' && type !== 'nodeToEdge' && type !== 'nodeAttribute') return null;
      return {
        source: 'node',
        endpoints: normalizeEndpoints(channel.endpoints ?? channel.endpoint),
        doubleWidth: channel.doubleWidth !== false,
        nodeAttribute: inferNodeAttributeFromConfig(channel),
      };
    };

    const channels = ['color', 'width', 'opacity', 'endpointSize'];
    for (const channelName of channels) {
      const entry = edgeConfig[channelName];
      if (!entry || typeof entry !== 'object') continue;
      const mode = entry.mode ?? 'buffer';
      if (mode === 'uniform') {
        entry.source = entry.source ?? 'uniform';
        continue;
      }
      const edgeAttr = EDGE_CHANNEL_TO_ATTRIBUTE[channelName];
      const passthrough = edgeAttr ? passthroughMap.get(edgeAttr) : null;
      if (passthrough) {
        entry.source = 'node';
        entry.nodeAttribute = passthrough.sourceName ?? entry.nodeAttribute;
        entry.endpoints = normalizeEndpoints(passthrough.endpoints);
        entry.doubleWidth = passthrough.doubleWidth !== false;
      } else {
        const inferred = inferNodeSourceFromMapper(channelName);
        if (inferred) {
          entry.source = inferred.source;
          entry.nodeAttribute = inferred.nodeAttribute ?? entry.nodeAttribute;
          entry.endpoints = inferred.endpoints;
          entry.doubleWidth = inferred.doubleWidth;
        } else if (!entry.source) {
          entry.source = 'edge';
        }
      }
      if (entry.source === 'node') {
        entry.endpoints = normalizeEndpoints(entry.endpoints);
        if (entry.doubleWidth == null) entry.doubleWidth = true;
        if (!entry.nodeAttribute) {
          entry.nodeAttribute = EDGE_CHANNEL_DEFAULT_NODE_ATTRIBUTE[channelName] ?? null;
        } else if (typeof entry.nodeAttribute === 'string') {
          entry.nodeAttribute = normalizeAttributeName(entry.nodeAttribute);
        }
      }
    }

    return edgeConfig;
  }

  applyNodeMapper(mapper, visualConfig) {
    if (!mapper?.channels?.size) return;
    const nodeIndices = this.network?.nodeIndices;
    const nodeChannels = [...mapper.channels.keys()];
    this.debug?.log('mapper', 'Applying node mapper', {
      nodes: nodeIndices?.length ?? 0,
      channels: mapper.channels.size,
      channelNames: nodeChannels,
    });
    for (const channel of nodeChannels) {
      this.debug?.log('mapper', 'Applying node channel start', {
        channel,
        nodes: nodeIndices?.length ?? 0,
      });
    }
    this.withBufferAccess(() => {
      const attributes = this.collectAttributeNames(mapper, 'node');
      const buffers = this.resolveNodeAttributeBuffers(attributes.node);
      const visuals = {
        color: visualConfig?.node?.color?.mode === 'uniform' ? null : this.nodeColors,
        size: visualConfig?.node?.size?.mode === 'uniform' ? null : this.nodeSizes,
        outline: visualConfig?.node?.outline?.mode === 'uniform' ? null : this.nodeOutlineWidths,
        outlineColor: visualConfig?.node?.outlineColor?.mode === 'uniform' ? null : this.nodeOutlineColors,
        position: this.nodePositions,
      };
      if (!nodeIndices?.length) return;
      for (let i = 0; i < nodeIndices.length; i += 1) {
        const nodeId = nodeIndices[i];
        const inputs = this.buildAttributeObject(buffers, nodeId);
        const mapped = mapper.mapItem({ attributes: inputs }, { index: nodeId });
        this.writeNodeVisuals(nodeId, mapped, visuals);
      }

      const bumpNode = [NODE_POSITION_ATTRIBUTE];
      if (visuals.color) bumpNode.push(NODE_COLOR_ATTRIBUTE);
      if (visuals.size) bumpNode.push(NODE_SIZE_ATTRIBUTE);
      if (visuals.outline) bumpNode.push(NODE_OUTLINE_WIDTH_ATTRIBUTE);
      if (visuals.outlineColor) bumpNode.push(NODE_OUTLINE_COLOR_ATTRIBUTE);
      this.bumpNodeAttributes(...bumpNode);

      const bumpEdge = [EDGE_ENDPOINTS_POSITION_ATTRIBUTE];
      if (visuals.size) bumpEdge.push(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
      this.bumpEdgeAttributes(...bumpEdge);
    });
    for (const channel of nodeChannels) {
      this.debug?.log('mapper', 'Applying node channel finish', {
        channel,
        nodes: nodeIndices?.length ?? 0,
      });
    }
    this.debug?.log('mapper', 'Node mapper applied', { nodes: nodeIndices?.length ?? 0 });
  }

  applyEdgeMapper(mapper, visualConfig) {
    if (!mapper?.channels?.size) return;
    const edgeIndices = this.network?.edgeIndices;
    const edgeChannels = [...mapper.channels.keys()];
    this.debug?.log('mapper', 'Applying edge mapper', {
      edges: edgeIndices?.length ?? 0,
      channels: mapper.channels.size,
      channelNames: edgeChannels,
    });
    for (const channel of edgeChannels) {
      this.debug?.log('mapper', 'Applying edge channel start', {
        channel,
        edges: edgeIndices?.length ?? 0,
      });
    }
    this.withBufferAccess(() => {
      const attributes = this.collectAttributeNames(mapper, 'edge');
      const edgeBuffers = this.resolveEdgeAttributeBuffers(attributes.edge);
      const nodeBuffers = this.resolveNodeAttributeBuffers(attributes.node);
      const nodeToEdgeRegistrations = mapper?.nodeToEdgeRegistrations ?? new Set();
      const skipColor = nodeToEdgeRegistrations.has(EDGE_COLOR_ATTRIBUTE);
      const skipOpacity = nodeToEdgeRegistrations.has(EDGE_OPACITY_ATTRIBUTE);
      const skipEndpointSize = nodeToEdgeRegistrations.has(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
      const visuals = {
        color: (skipColor || visualConfig?.edge?.color?.mode === 'uniform') ? null : this.edgeColors,
        opacity: (skipOpacity || visualConfig?.edge?.opacity?.mode === 'uniform') ? null : this.edgeOpacities,
        width: visualConfig?.edge?.width?.mode === 'uniform' ? null : this.edgeWidths,
        endpointSize: (skipEndpointSize || visualConfig?.edge?.endpointSize?.mode === 'uniform')
          ? null
          : this.getEdgeAttributeView(EDGE_ENDPOINTS_SIZE_ATTRIBUTE),
      };
      const edgesView = this.network?.edgesView;
      if (!edgeIndices?.length) return;
      for (let i = 0; i < edgeIndices.length; i += 1) {
        const edgeId = edgeIndices[i];
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

      const bumpEdge = [];
      if (visuals.color) bumpEdge.push(EDGE_COLOR_ATTRIBUTE);
      if (visuals.opacity) bumpEdge.push(EDGE_OPACITY_ATTRIBUTE);
      if (visuals.width) bumpEdge.push(EDGE_WIDTH_ATTRIBUTE);
      if (visuals.endpointSize) bumpEdge.push(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
      if (bumpEdge.length) this.bumpEdgeAttributes(...bumpEdge);
    });
    for (const channel of edgeChannels) {
      this.debug?.log('mapper', 'Applying edge channel finish', {
        channel,
        edges: edgeIndices?.length ?? 0,
      });
    }
    this.debug?.log('mapper', 'Edge mapper applied', { edges: edgeIndices?.length ?? 0 });
  }


  ensureVisualAttributesForConfig({ nodeMapper, edgeMapper, visualConfig } = {}) {
    if (!this.network) return;
    const nodeCfg = visualConfig?.node ?? null;
    const edgeCfg = visualConfig?.edge ?? null;
    const nodeSizeBuffer = nodeCfg?.size?.mode !== 'uniform';
    const edgeEndpointSizeBuffer = edgeCfg?.endpointSize?.mode !== 'uniform';
    const endpointSizeChannel = edgeMapper?.channels?.get?.('endpointSize') ?? null;
    const nodeToEdgeRegistrations = edgeMapper?.nodeToEdgeRegistrations ?? new Set();

    const edgeUsesNodeColor = edgeCfg?.color?.source === 'node';
    const edgeUsesNodeSize = edgeCfg?.width?.source === 'node'
      || edgeCfg?.opacity?.source === 'node'
      || edgeCfg?.endpointSize?.source === 'node';

    if (nodeCfg?.color?.mode !== 'uniform') {
      this.ensureNodeAttribute(NODE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    }
    if (edgeUsesNodeColor) {
      this.ensureNodeAttribute(NODE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    }
    if (nodeSizeBuffer) {
      this.ensureNodeAttribute(NODE_SIZE_ATTRIBUTE, AttributeType.Float, 1);
    }
    if (edgeUsesNodeSize) {
      this.ensureNodeAttribute(NODE_SIZE_ATTRIBUTE, AttributeType.Float, 1);
    }
    if (nodeCfg?.outline?.mode !== 'uniform') {
      this.ensureNodeAttribute(NODE_OUTLINE_WIDTH_ATTRIBUTE, AttributeType.Float, 1);
    }
    if (nodeCfg?.outlineColor?.mode !== 'uniform') {
      this.ensureNodeAttribute(NODE_OUTLINE_COLOR_ATTRIBUTE, AttributeType.Float, 4);
    }

    if (edgeCfg?.color?.mode !== 'uniform' && !nodeToEdgeRegistrations.has(EDGE_COLOR_ATTRIBUTE)) {
      this.ensureEdgeAttribute(EDGE_COLOR_ATTRIBUTE, AttributeType.Float, 8);
    }
    if (edgeCfg?.opacity?.mode !== 'uniform') {
      this.ensureEdgeAttribute(EDGE_OPACITY_ATTRIBUTE, AttributeType.Float, 2);
    }
    if (edgeCfg?.width?.mode !== 'uniform') {
      this.ensureEdgeAttribute(EDGE_WIDTH_ATTRIBUTE, AttributeType.Float, 2);
    }

    if (edgeEndpointSizeBuffer) {
      if (nodeToEdgeRegistrations.has(EDGE_ENDPOINTS_SIZE_ATTRIBUTE)) {
        if (nodeSizeBuffer) {
          this.ensureNodeToEdgeAttribute(NODE_SIZE_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE, 1);
        }
      } else if (!endpointSizeChannel && nodeSizeBuffer) {
        this.ensureNodeToEdgeAttribute(NODE_SIZE_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE, 1);
      } else if (endpointSizeChannel) {
        this.ensureEdgeAttribute(EDGE_ENDPOINTS_SIZE_ATTRIBUTE, AttributeType.Float, 2);
      }
    }
  }

  ensureAttributes() {
    this.ensureNodeAttribute(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);
    this.ensureNodeAttribute(NODE_STATE_ATTRIBUTE, AttributeType.UnsignedInteger, 1);
    this.ensureEdgeAttribute(EDGE_STATE_ATTRIBUTE, AttributeType.UnsignedInteger, 1);
    this.ensureNodeToEdgeAttribute(NODE_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_POSITION_ATTRIBUTE, 3);
    this.ensureNodeToEdgeAttributeTyped(NODE_STATE_ATTRIBUTE, EDGE_ENDPOINTS_STATE_ATTRIBUTE, 1, AttributeType.UnsignedInteger);
  }

  bumpNodeAttributes(...names) {
    const targets =
      names && names.length
        ? names
        : [
            NODE_POSITION_ATTRIBUTE,
            NODE_COLOR_ATTRIBUTE,
            NODE_SIZE_ATTRIBUTE,
            NODE_STATE_ATTRIBUTE,
            NODE_OUTLINE_WIDTH_ATTRIBUTE,
            NODE_OUTLINE_COLOR_ATTRIBUTE,
          ];
    for (const name of targets) {
      try {
        const buf = this.network?.getNodeAttributeBuffer?.(name);
        buf?.bumpVersion?.();
        this.network?.bumpNodeAttributeVersion?.(name);
      } catch (_) {
        // Ignore if bumping is unavailable.
      }
    }
  }

  bumpEdgeAttributes(...names) {
    const targets =
      names && names.length
        ? names
        : [
            EDGE_COLOR_ATTRIBUTE,
            EDGE_OPACITY_ATTRIBUTE,
            EDGE_WIDTH_ATTRIBUTE,
            EDGE_STATE_ATTRIBUTE,
            EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
            EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
            EDGE_ENDPOINTS_STATE_ATTRIBUTE,
          ];
    for (const name of targets) {
      try {
        const buf = this.network?.getEdgeAttributeBuffer?.(name);
        buf?.bumpVersion?.();
        this.network?.bumpEdgeAttributeVersion?.(name);
      } catch (_) {
        // Ignore if bumping is unavailable.
      }
    }
  }

  markPositionsDirty() {
    this.bumpNodeAttributes(NODE_POSITION_ATTRIBUTE, NODE_SIZE_ATTRIBUTE);
    this.bumpEdgeAttributes(EDGE_ENDPOINTS_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  }

  /**
   * Initializes basic node visuals. Can be re-used whenever nodes are added.
   * @param {Iterable<number>} [indices]
   */
  applyNodeDefaults(indices) {
    const targetIndices = indices ?? this.network?.nodeIndices;
    this.withBufferAccess(() => {
      const color = DEFAULT_NODE_COLOR;
      const size = DEFAULT_NODE_SIZE;
      const outlineWidth = DEFAULT_NODE_OUTLINE_WIDTH;
      const outlineColor = DEFAULT_NODE_OUTLINE_COLOR;
      const positionView = this.nodePositions;
      const colorView = this.nodeColors;
      const sizeView = this.nodeSizes;
      const stateView = this.nodeStates;
      const outlineWidthView = this.nodeOutlineWidths;
      const outlineColorView = this.nodeOutlineColors;

      if (targetIndices) {
        for (const index of targetIndices) {
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
          if (stateView) {
            stateView[index] = typeof stateView[0] === 'bigint' ? 0n : 0;
          }
        }
      }

      const bumpNode = [];
      if (positionView) bumpNode.push(NODE_POSITION_ATTRIBUTE);
      if (colorView) bumpNode.push(NODE_COLOR_ATTRIBUTE);
      if (sizeView) bumpNode.push(NODE_SIZE_ATTRIBUTE);
      if (stateView) bumpNode.push(NODE_STATE_ATTRIBUTE);
      if (outlineWidthView) bumpNode.push(NODE_OUTLINE_WIDTH_ATTRIBUTE);
      if (outlineColorView) bumpNode.push(NODE_OUTLINE_COLOR_ATTRIBUTE);
      if (bumpNode.length) this.bumpNodeAttributes(...bumpNode);

      const bumpEdge = [];
      if (positionView) bumpEdge.push(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
      if (sizeView) bumpEdge.push(EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
      if (stateView) bumpEdge.push(EDGE_ENDPOINTS_STATE_ATTRIBUTE);
      if (bumpEdge.length) this.bumpEdgeAttributes(...bumpEdge);
    });
  }

  /**
   * Initializes basic edge visuals. Can be re-used whenever edges are added.
   * @param {Iterable<number>} [indices]
   */
  applyEdgeDefaults(indices) {
    const targetIndices = indices ?? this.network?.edgeIndices;
    this.withBufferAccess(() => {
      const color = DEFAULT_EDGE_COLOR;
      const opacity = DEFAULT_EDGE_OPACITY;
      const width = DEFAULT_EDGE_WIDTH;
      const colorView = this.edgeColors;
      const opacityView = this.edgeOpacities;
      const widthView = this.edgeWidths;
      const stateView = this.edgeStates;

      if (targetIndices) {
        for (const index of targetIndices) {
          this.writeEdgeDefaults(index, color, width, opacity, colorView, widthView, opacityView);
          if (stateView) {
            stateView[index] = typeof stateView[0] === 'bigint' ? 0n : 0;
          }
        }
      }

      const bumpEdge = [];
      if (colorView) bumpEdge.push(EDGE_COLOR_ATTRIBUTE);
      if (opacityView) bumpEdge.push(EDGE_OPACITY_ATTRIBUTE);
      if (widthView) bumpEdge.push(EDGE_WIDTH_ATTRIBUTE);
      if (stateView) bumpEdge.push(EDGE_STATE_ATTRIBUTE);
      if (bumpEdge.length) this.bumpEdgeAttributes(...bumpEdge);
    });
  }

  /**
   * Seeds missing node positions with random values so downstream layouts/renderers
   * always have finite coordinates to start with.
   * @param {{width?: number, height?: number, depth?: number, mode?: string, center?: number[]}} [bounds]
   */
  seedMissingPositions(bounds = {}) {
    const nodeIndices = this.network?.nodeIndices;
    this.withBufferAccess(() => {
      const width = Math.max(1, bounds.width ?? 1);
      const height = Math.max(1, bounds.height ?? 1);
      const depth = Math.max(0, bounds.depth ?? 0);
      const mode = bounds.mode === '3d' ? '3d' : '2d';
      const center = Array.isArray(bounds.center) ? bounds.center : null;
      const cx = Number.isFinite(center?.[0]) ? center[0] : 0;
      const cy = Number.isFinite(center?.[1]) ? center[1] : 0;
      const cz = Number.isFinite(center?.[2]) ? center[2] : 0;
      const pos = this.nodePositions;
      if (!pos || !nodeIndices?.length) return;
      let touched = false;
      const previousMaxNodeId = this.maxInitializedNodeId ?? -1;
      let maxNodeId = previousMaxNodeId;
      let hasAnyNonZero = false;

      for (let i = 0; i < nodeIndices.length; i += 1) {
        const nodeId = nodeIndices[i];
        const offset = nodeId * 3;
        const missing =
          !Number.isFinite(pos[offset]) ||
          !Number.isFinite(pos[offset + 1]) ||
          !Number.isFinite(pos[offset + 2]);
        const zeroVector = pos[offset] === 0 && pos[offset + 1] === 0 && pos[offset + 2] === 0;
        if (!missing && !zeroVector) {
          hasAnyNonZero = true;
        }
        if (missing) {
          pos[offset] = cx + (Math.random() - 0.5) * width;
          pos[offset + 1] = cy + (Math.random() - 0.5) * height;
          pos[offset + 2] = mode === '3d' ? cz + (Math.random() - 0.5) * depth : cz;
          touched = true;
          hasAnyNonZero = true;
        }
        if (nodeId > maxNodeId) {
          maxNodeId = nodeId;
        }
      }

      const zeroSeedBaseline = hasAnyNonZero
        ? (previousMaxNodeId >= 0 ? previousMaxNodeId : maxNodeId)
        : -1;
      for (let i = 0; i < nodeIndices.length; i += 1) {
        const nodeId = nodeIndices[i];
        const offset = nodeId * 3;
        const zeroVector = pos[offset] === 0 && pos[offset + 1] === 0 && pos[offset + 2] === 0;
        const isNewNode = nodeId > zeroSeedBaseline;
        if (zeroVector && (!hasAnyNonZero || isNewNode)) {
          pos[offset] = cx + (Math.random() - 0.5) * width;
          pos[offset + 1] = cy + (Math.random() - 0.5) * height;
          pos[offset + 2] = mode === '3d' ? cz + (Math.random() - 0.5) * depth : cz;
          touched = true;
        }
      }
      this.maxInitializedNodeId = Math.max(maxNodeId, this.maxInitializedNodeId ?? -1);
      if (touched) {
        this.bumpNodeAttributes(NODE_POSITION_ATTRIBUTE);
        this.bumpEdgeAttributes(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
      }
    });
  }

  ensureNodeAttribute(name, type, dimension) {
    const expected = { dimension, type };
    const info = this.network.getNodeAttributeInfo(name);
    const hasAttribute = this.network.hasNodeAttribute(name);

    if (!hasAttribute) {
      try {
        this.network.defineNodeAttribute(name, type, dimension);
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (!/already/i.test(msg)) throw error;
      }
    } else if (attributeInfoMismatched(info, expected)) {
      const currentDim = info?.dimension ?? dimension;
      const shouldExpand = currentDim > 0 && currentDim < dimension;
      let preserved = null;
      if (shouldExpand) {
        preserved = this.withBufferAccess(() => {
          try {
            const buffer = this.network.getNodeAttributeBuffer(name);
            const count = buffer?.view ? Math.floor(buffer.view.length / currentDim) : 0;
            return expandAttributeData({
              view: buffer?.view,
              count,
              fromDimension: currentDim,
              toDimension: dimension,
            });
          } catch (_) {
            return null;
          }
        });
      }
      console.warn(
        `Attribute ${name} metadata mismatch: redefining with dimension ${dimension} type ${type} (saw dimension ${info?.dimension ?? 'unknown'}, type ${info?.type ?? 'unknown'}).` +
          (shouldExpand ? ' Existing data was expanded and padded to the new dimension.' : ''),
      );
      this.network.removeNodeAttribute(name);
      this.network.defineNodeAttribute(name, type, dimension);
      if (preserved) {
        this.withBufferAccess(() => {
          const buffer = this.network.getNodeAttributeBuffer(name);
          if (buffer?.view) {
            buffer.view.set(preserved.subarray(0, buffer.view.length));
          }
        });
      }
    }

    try {
      this.withBufferAccess(() => {
        const buffer = this.network.getNodeAttributeBuffer(name);
        validateAttribute(buffer, name, expected);
      });
    } catch (error) {
      // If no node capacity is allocated yet, buffer pointers may be unavailable; defer validation.
      if (this.network.nodeCapacity > 0) throw error;
    }
  }

  ensureEdgeAttribute(name, type, dimension) {
    const expected = { dimension, type };
    const info = this.network.getEdgeAttributeInfo(name);
    const hasAttribute = this.network.hasEdgeAttribute(name, true);

    if (!hasAttribute) {
      try {
        this.network.defineEdgeAttribute(name, type, dimension);
      } catch (error) {
        const msg = error instanceof Error ? error.message : '';
        if (!/already/i.test(msg)) throw error;
      }
    } else if (attributeInfoMismatched(info, expected)) {
      const currentDim = info?.dimension ?? dimension;
      const shouldExpand = currentDim > 0 && currentDim < dimension;
      let preserved = null;
      if (shouldExpand) {
        preserved = this.withBufferAccess(() => {
          try {
            const buffer = this.network.getEdgeAttributeBuffer(name);
            const count = buffer?.view ? Math.floor(buffer.view.length / currentDim) : 0;
            return expandAttributeData({
              view: buffer?.view,
              count,
              fromDimension: currentDim,
              toDimension: dimension,
            });
          } catch (_) {
            return null;
          }
        });
      }
      console.warn(
        `Edge attribute ${name} metadata mismatch: redefining with dimension ${dimension} type ${type} (saw dimension ${info?.dimension ?? 'unknown'}, type ${info?.type ?? 'unknown'}).` +
          (shouldExpand ? ' Existing data was expanded and padded to the new dimension.' : ''),
      );
      this.network.removeEdgeAttribute(name);
      this.network.defineEdgeAttribute(name, type, dimension);
      if (preserved) {
        this.withBufferAccess(() => {
          const buffer = this.network.getEdgeAttributeBuffer(name);
          if (buffer?.view) {
            buffer.view.set(preserved.subarray(0, buffer.view.length));
          }
        });
      }
    }

    try {
      this.withBufferAccess(() => {
        const buffer = this.network.getEdgeAttributeBuffer(name);
        validateAttribute(buffer, name, expected);
      });
    } catch (error) {
      // If no edge capacity is allocated yet, buffer pointers may be unavailable; defer validation.
      if (this.network.edgeCapacity > 0) throw error;
    }
  }

  ensureNodeToEdgeAttribute(sourceName, edgeName, sourceDimension) {
    const targetDimension = sourceDimension * 2;
    const expected = { dimension: targetDimension, type: AttributeType.Float };
    const info = this.network.getEdgeAttributeInfo(edgeName);
    const hasAttribute = this.network.hasEdgeAttribute(edgeName);

    if (!hasAttribute) {
      this.network.defineNodeToEdgeAttribute(sourceName, edgeName, 'both');
    } else if (attributeInfoMismatched(info, expected)) {
      const currentDim = info?.dimension ?? targetDimension;
      const shouldExpand = currentDim > 0 && currentDim < targetDimension;
      let preserved = null;
      if (shouldExpand) {
        preserved = this.withBufferAccess(() => {
          try {
            const buffer = this.network.getEdgeAttributeBuffer(edgeName);
            const count = buffer?.view ? Math.floor(buffer.view.length / currentDim) : 0;
            return expandAttributeData({
              view: buffer?.view,
              count,
              fromDimension: currentDim,
              toDimension: targetDimension,
            });
          } catch (_) {
            return null;
          }
        });
      }
      console.warn(
        `Edge attribute ${edgeName} metadata mismatch: redefining with dimension ${targetDimension} type ${AttributeType.Float} (saw dimension ${info?.dimension ?? 'unknown'}, type ${info?.type ?? 'unknown'})` +
          (shouldExpand ? ' Existing data was expanded and padded to the new dimension.' : ''),
      );
      this.network.removeEdgeAttribute(edgeName);
      this.network.defineNodeToEdgeAttribute(sourceName, edgeName, 'both');
      if (preserved) {
        this.withBufferAccess(() => {
          const buffer = this.network.getEdgeAttributeBuffer(edgeName);
          if (buffer?.view) {
            buffer.view.set(preserved.subarray(0, buffer.view.length));
          }
        });
      }
    }

    try {
      this.withBufferAccess(() => {
        const buffer = this.network.getEdgeAttributeBuffer(edgeName);
        validateAttribute(buffer, edgeName, expected);
      });
    } catch (error) {
      // If no edge capacity is allocated yet, buffer pointers may be unavailable; defer validation.
      if (this.network.edgeCapacity > 0) throw error;
    }
  }

  ensureNodeToEdgeAttributeTyped(sourceName, edgeName, sourceDimension, type) {
    const targetDimension = sourceDimension * 2;
    const expected = { dimension: targetDimension, type };
    const info = this.network.getEdgeAttributeInfo(edgeName);
    const hasAttribute = this.network.hasEdgeAttribute(edgeName);

    if (!hasAttribute) {
      this.network.defineNodeToEdgeAttribute(sourceName, edgeName, 'both');
    } else if (attributeInfoMismatched(info, expected)) {
      console.warn(
        `Edge attribute ${edgeName} metadata mismatch: redefining with dimension ${targetDimension} type ${type} (saw dimension ${info?.dimension ?? 'unknown'}, type ${info?.type ?? 'unknown'}).`,
      );
      this.network.removeEdgeAttribute(edgeName);
      this.network.defineNodeToEdgeAttribute(sourceName, edgeName, 'both');
    }

    try {
      this.withBufferAccess(() => {
        const buffer = this.network.getEdgeAttributeBuffer(edgeName);
        validateAttribute(buffer, edgeName, expected);
      });
    } catch (error) {
      if (this.network.edgeCapacity > 0) throw error;
    }
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
        // Expose a view into the buffer to avoid per-item copies; callers should treat as read-only.
        result[name] = view.subarray(start, start + dimension);
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
    const isArrayLikePosition = Array.isArray(mapped.position) || ArrayBuffer.isView(mapped.position);
    if (isArrayLikePosition && visuals.position) {
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
        const eps = 1e-6;
        const maxRgb = Math.max(Number(value[0] ?? 0), Number(value[1] ?? 0), Number(value[2] ?? 0));
        const needsScale = Number.isFinite(maxRgb) && maxRgb > 1 + eps;
        if (needsScale) {
          const a = Number(value[3] ?? 1);
          return [
            (Number(value[0] ?? 0) || 0) / 255,
            (Number(value[1] ?? 0) || 0) / 255,
            (Number(value[2] ?? 0) || 0) / 255,
            a > 1 + eps ? a / 255 : a,
          ].map((v) => Math.min(1, Math.max(0, v)));
        }
        return [
          Math.min(1, Math.max(0, Number(value[0] ?? 0) || 0)),
          Math.min(1, Math.max(0, Number(value[1] ?? 0) || 0)),
          Math.min(1, Math.max(0, Number(value[2] ?? 0) || 0)),
          Math.min(1, Math.max(0, Number(value[3] ?? 1) || 0)),
        ];
      }
      if (value.length === 3) {
        const eps = 1e-6;
        const maxRgb = Math.max(Number(value[0] ?? 0), Number(value[1] ?? 0), Number(value[2] ?? 0));
        const needsScale = Number.isFinite(maxRgb) && maxRgb > 1 + eps;
        const scale = needsScale ? 1 / 255 : 1;
        return [
          Math.min(1, Math.max(0, (Number(value[0] ?? 0) || 0) * scale)),
          Math.min(1, Math.max(0, (Number(value[1] ?? 0) || 0) * scale)),
          Math.min(1, Math.max(0, (Number(value[2] ?? 0) || 0) * scale)),
          1,
        ];
      }
    }
    if (typeof value === 'string') {
      const hex = value.trim();
      if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) {
        const raw = hex.slice(1);
        const expand =
          raw.length === 3 || raw.length === 4
            ? raw
                .split('')
                .map((c) => c + c)
                .join('')
            : raw;
        const hasAlpha = expand.length === 8;
        const rgb = expand.slice(0, 6);
        const int = parseInt(rgb, 16);
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        const a = hasAlpha ? parseInt(expand.slice(6, 8), 16) / 255 : 1;
        return [r / 255, g / 255, b / 255, a];
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
    if (colorView) {
      const colorOffset = index * 4;
      colorView[colorOffset + 0] = color[0];
      colorView[colorOffset + 1] = color[1];
      colorView[colorOffset + 2] = color[2];
      colorView[colorOffset + 3] = color[3];
    }

    if (sizeView) {
      const sizeOffset = index;
      sizeView[sizeOffset] = size;
    }

    if (outlineWidthView) {
      const sizeOffset = index;
      outlineWidthView[sizeOffset] = outlineWidth;
    }
    if (outlineColorView) {
      const outlineOffset = index * 4;
      outlineColorView[outlineOffset + 0] = outlineColor[0];
      outlineColorView[outlineOffset + 1] = outlineColor[1];
      outlineColorView[outlineOffset + 2] = outlineColor[2];
      outlineColorView[outlineOffset + 3] = outlineColor[3];
    }

    if (positionView) {
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
  }

  writeEdgeDefaults(index, color, width, opacity, colorView, widthView, opacityView) {
    if (colorView) {
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
    }

    if (widthView) {
      const widthOffset = index * 2;
      widthView[widthOffset] = width;
      widthView[widthOffset + 1] = width;
    }

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
