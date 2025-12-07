import { AttributeType } from 'helios-network';
import { VISUAL_ATTRIBUTE_NAMES, DEFAULT_VISUALS, VISUAL_ATTRIBUTE_MAP } from './constants.js';

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

const { DEFAULT_NODE_OUTLINE_COLOR, DEFAULT_NODE_OUTLINE_WIDTH, DEFAULT_NODE_SIZE } = DEFAULT_VISUALS;

function validateAttribute(buffer, name, expectedType, expectedDimension) {
  if (!buffer) {
    throw new Error(`Attribute ${name} is missing on the network`);
  }
  if (buffer.dimension !== expectedDimension) {
    throw new Error(
      `Attribute ${name} has dimension ${buffer.dimension ?? 'unknown'}, expected ${expectedDimension}`,
    );
  }
  if (buffer.type != null && expectedType != null && buffer.type !== expectedType) {
    throw new Error(`Attribute ${name} has type ${buffer.type}, expected ${expectedType}`);
  }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return `#${[f(0), f(8), f(4)]
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('')}`;
}

function colorFromIndex(index = 0) {
  const hue = (index * 137.508) % 360; // golden angle for spread
  return hslToHex(hue, 0.6, 0.55);
}

function normalizeAttributes(attributes) {
  if (attributes == null) return [];
  return Array.isArray(attributes) ? attributes : [attributes];
}

function isNil(value) {
  return value === undefined || value === null;
}

function resolveNodeEndpoints(item, context) {
  const getNode = (id) => {
    if (id == null) return null;
    if (typeof id === 'object') return id;
    if (context?.getNodeById) return context.getNodeById(id);
    if (context?.nodesById && id in context.nodesById) return context.nodesById[id];
    if (Array.isArray(context?.nodes) && context.nodes[id]) return context.nodes[id];
    return null;
  };
  const source = item?.source ?? item?.from ?? null;
  const target = item?.target ?? item?.to ?? null;
  return [getNode(source), getNode(target)];
}

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

function computePassthroughTargetDimension(sourceDimension = 1, endpoints = 'both', doubleWidth = true) {
  const base = Math.max(1, sourceDimension || 1);
  if (endpoints === 'both') return base * 2;
  return doubleWidth ? base * 2 : base;
}

function resolveValueFromItem(item, key) {
  if (!item) return undefined;
  if (item.attributes && key in item.attributes) {
    return item.attributes[key];
  }
  if (key in item) {
    return item[key];
  }
  return undefined;
}

function resolveAttribute(attr, item, context) {
  if (attr === '$index') {
    return context?.index ?? item?.index ?? item?.id ?? 0;
  }
  if (typeof attr === 'function') {
    return attr(item, context);
  }
  if (typeof attr === 'string' && attr.startsWith('@node.')) {
    const key = attr.slice(6);
    const [src, tgt] = resolveNodeEndpoints(item, context);
    return [resolveValueFromItem(src, key), resolveValueFromItem(tgt, key)];
  }
  if (typeof attr === 'string' && attr.startsWith('@nodes.')) {
    const key = attr.slice(7);
    const [src, tgt] = resolveNodeEndpoints(item, context);
    return [resolveValueFromItem(src, key), resolveValueFromItem(tgt, key)];
  }
  if (typeof attr === 'string' && attr in (context?.attributes ?? {})) {
    return context.attributes[attr];
  }
  return resolveValueFromItem(item, attr);
}

function collectInputs(attrSpec, item, context) {
  const attributes = normalizeAttributes(attrSpec);
  if (!attributes.length) return undefined;
  const values = [];
  const objectInputs = {};
  let containsNode = false;
  for (const attr of attributes) {
    const value = resolveAttribute(attr, item, context);
    if (Array.isArray(value) && typeof attr === 'string' && attr.startsWith('@node.')) {
      containsNode = true;
      values.push(...value);
    } else if (Array.isArray(value) && typeof attr === 'string' && attr.startsWith('@nodes.')) {
      containsNode = true;
      values.push(...value);
    } else {
      values.push(value);
      if (typeof attr === 'string' && !containsNode) {
        objectInputs[attr] = value;
      }
    }
  }
  if (attributes.length === 1 && !containsNode) {
    return values[0];
  }
  if (!containsNode && Object.keys(objectInputs).length === attributes.length) {
    return objectInputs;
  }
  return values;
}

function linearScale(value, domain, range) {
  const [d0, d1] = domain ?? [0, 1];
  const [r0, r1] = range ?? [0, 1];
  const denom = d1 - d0;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-9) return r0;
  const t = clamp01((value - d0) / denom);
  return lerp(r0, r1, t);
}

function categoricalScale(value, domain = [], range = []) {
  const index = domain.findIndex((entry) => entry === value);
  if (index === -1) return undefined;
  return range[index % range.length];
}

function applyScale(config, value, inputs, item, context) {
  if (config.type === 'linear') {
    return linearScale(value, config.domain, config.range);
  }
  if (config.type === 'categorical') {
    return categoricalScale(value, config.domain, config.range);
  }
  if (typeof config.scale === 'function') {
    return config.scale(value, inputs, item, context);
  }
  return value;
}

function buildNodeToEdgeValue(inputs) {
  if (Array.isArray(inputs)) {
    const [source, target] = inputs;
    if (inputs.length >= 2) {
      return { source, target };
    }
    if (inputs.length === 1) {
      return { source, target: source };
    }
  }
  return { source: inputs, target: inputs };
}

function computeChannelValue(config, item, context) {
  const inputs = collectInputs(config.attributes, item, context);
  if (config.type === 'constant') {
    return config.value;
  }
  if (config.type === 'passthrough') {
    if (Array.isArray(inputs)) return inputs.length === 1 ? inputs[0] : inputs;
    return inputs;
  }
  if (config.type === 'nodeAttribute') {
    if (!Array.isArray(inputs)) return inputs;
    const [sourceValue, targetValue] = inputs;
    const endpoints = normalizeEndpoints(config.endpoints);
    if (endpoints === 'source') {
      return { source: sourceValue, target: sourceValue };
    }
    if (endpoints === 'destination') {
      return { source: targetValue, target: targetValue };
    }
    return { source: sourceValue, target: targetValue };
  }
  if (config.type === 'nodeToEdge') {
    return buildNodeToEdgeValue(inputs);
  }

  const base = typeof config.transform === 'function' ? config.transform(inputs, item, context) : inputs;
  const scaled = applyScale(config, base, inputs, item, context);
  if (!config.rules?.length) {
    return isNil(scaled) ? config.defaultValue : scaled;
  }
  for (const rule of config.rules) {
    const ruleInputs = collectInputs(rule.attributes ?? config.attributes, item, context);
    const predicate = typeof rule.when === 'function' ? rule.when(ruleInputs, item, context) : true;
    if (!predicate) continue;
    if (rule.type === 'nodeToEdge') {
      return buildNodeToEdgeValue(ruleInputs);
    }
    if (rule.type === 'nodeAttribute') {
      const endpoints = normalizeEndpoints(rule.endpoints ?? config.endpoints);
      const [sourceValue, targetValue] = Array.isArray(ruleInputs) ? ruleInputs : [ruleInputs, ruleInputs];
      if (endpoints === 'source') {
        return { source: sourceValue, target: sourceValue };
      }
      if (endpoints === 'destination') {
        return { source: targetValue, target: targetValue };
      }
      return { source: sourceValue, target: targetValue };
    }
    if (rule.type === 'passthrough') {
      return Array.isArray(ruleInputs) && ruleInputs.length === 1 ? ruleInputs[0] : ruleInputs;
    }
    if (rule.value !== undefined) {
      return rule.value;
    }
    const ruleBase =
      typeof rule.transform === 'function' ? rule.transform(ruleInputs, item, context) : ruleInputs ?? base;
    const ruleScaled = applyScale(rule, ruleBase, ruleInputs, item, context);
    return isNil(ruleScaled) ? rule.defaultValue ?? config.defaultValue : ruleScaled;
  }
  return isNil(scaled) ? config.defaultValue : scaled;
}

function normalizeChannelConfig(name, config) {
  const normalized = {
    name,
    attributes: config.attributes ?? config.from ?? undefined,
    transform: config.transform,
    type: config.type ?? config.mode ?? undefined,
    endpoints: normalizeEndpoints(config.endpoints ?? config.endpoint ?? 'both'),
    nodeAttribute: config.nodeAttribute ?? config.nodeAttr ?? undefined,
    domain: config.domain,
    range: config.range,
    scale: config.scale,
    value: config.value,
    defaultValue: config.defaultValue,
    rules: (config.rules ?? []).map((rule) => ({ ...rule })),
  };
  if (normalized.type === 'constant' && normalized.value === undefined) {
    normalized.value = config.defaultValue;
  }
  if (normalized.type === 'nodeToEdge') {
    normalized.rules = [];
  }
  if (normalized.type === 'nodeAttribute') {
    normalized.rules = [];
    if (!normalized.nodeAttribute && typeof normalized.attributes === 'string') {
      normalized.nodeAttribute = normalized.attributes.replace('@nodes.', '').replace('@node.', '');
    }
    if (!normalized.attributes && normalized.nodeAttribute) {
      normalized.attributes = `@node.${normalized.nodeAttribute}`;
    }
    normalized.endpoints = normalizeEndpoints(config.endpoints ?? config.endpoint ?? 'both');
    normalized.transform = undefined;
    normalized.scale = undefined;
    normalized.domain = undefined;
    normalized.range = undefined;
  }
  return normalized;
}

class ChannelBuilder {
  constructor(mapper, name) {
    this.mapper = mapper;
    this.name = name;
    this.config = { name, rules: [] };
  }

  from(attributes) {
    this.config.attributes = attributes;
    return this;
  }

  transform(fn) {
    this.config.transform = fn;
    return this;
  }

  linear(domain, range) {
    this.config.type = 'linear';
    this.config.domain = domain;
    this.config.range = range;
    return this;
  }

  categorical(domain, range) {
    this.config.type = 'categorical';
    this.config.domain = domain;
    this.config.range = range;
    return this;
  }

  scale(fn) {
    this.config.scale = fn;
    return this;
  }

  default(value) {
    this.config.defaultValue = value;
    return this;
  }

  rule(ruleConfig) {
    if (!this.config.rules) this.config.rules = [];
    this.config.rules.push({ ...ruleConfig });
    return this;
  }

  passthrough() {
    this.config.type = 'passthrough';
    return this;
  }

  nodeAttribute(name, endpoints = 'both') {
    this.config.type = 'nodeAttribute';
    this.config.nodeAttribute = name;
    this.config.endpoints = normalizeEndpoints(endpoints);
    this.config.attributes = [`@node.${name}`];
    this.config.transform = undefined;
    this.config.scale = undefined;
    this.config.domain = undefined;
    this.config.range = undefined;
    this.config.rules = [];
    return this;
  }

  nodeToEdge() {
    this.config.type = 'nodeToEdge';
    this.config.rules = [];
    this.config.transform = undefined;
    this.config.scale = undefined;
    this.config.domain = undefined;
    this.config.range = undefined;
    return this;
  }

  constant(value) {
    this.config.type = 'constant';
    this.config.value = value;
    return this;
  }

  done() {
    this.mapper.setChannel(this.name, this.config);
    return this.mapper;
  }
}

const CHANNEL_DEFS = {
  node: {
    color: { attribute: NODE_COLOR_ATTRIBUTE, type: AttributeType.Float, dimension: 4 },
    size: { attribute: NODE_SIZE_ATTRIBUTE, type: AttributeType.Float, dimension: 1 },
    outline: { attribute: NODE_OUTLINE_WIDTH_ATTRIBUTE, type: AttributeType.Float, dimension: 1 },
    outlineColor: { attribute: NODE_OUTLINE_COLOR_ATTRIBUTE, type: AttributeType.Float, dimension: 4 },
    position: { attribute: NODE_POSITION_ATTRIBUTE, type: AttributeType.Float, dimension: 3 },
  },
  edge: {
    color: {
      attribute: EDGE_COLOR_ATTRIBUTE,
      type: AttributeType.Float,
      dimension: 8,
      nodeSource: NODE_COLOR_ATTRIBUTE,
      nodeSourceDimension: 4,
      nodePassthroughEndpoints: 'both',
      nodePassthroughDoubleWidth: true,
    },
    opacity: { attribute: EDGE_OPACITY_ATTRIBUTE, type: AttributeType.Float, dimension: 2 },
    width: { attribute: EDGE_WIDTH_ATTRIBUTE, type: AttributeType.Float, dimension: 2 },
    endpointPosition: {
      attribute: EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
      type: AttributeType.Float,
      dimension: 6,
      nodeSource: NODE_POSITION_ATTRIBUTE,
      nodeSourceDimension: 3,
      nodePassthroughEndpoints: 'both',
      nodePassthroughDoubleWidth: true,
    },
    endpointSize: {
      attribute: EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
      type: AttributeType.Float,
      dimension: 2,
      nodeSource: NODE_SIZE_ATTRIBUTE,
      nodeSourceDimension: 1,
      nodePassthroughEndpoints: 'both',
      nodePassthroughDoubleWidth: true,
    },
  },
};

export class Mapper {
  constructor(options = {}) {
    this.mode = options.mode ?? 'node';
    this.network = options.network ?? null;
    this.channels = new Map();
    this.nodeToEdgeRegistrations = new Set();
  }

  channel(name) {
    return new ChannelBuilder(this, name);
  }

  setChannel(name, config) {
    const previous = this.channels.get(name);
    if (previous) {
      this.unregisterChannel(previous);
    }
    const normalized = normalizeChannelConfig(name, config ?? {});
    this.ensureBuffersForChannel(normalized);
    this.channels.set(name, normalized);
    return this;
  }

  getChannel(name) {
    return this.channels.get(name);
  }

  mapItem(item, context = {}) {
    const result = {};
    for (const [name, config] of this.channels.entries()) {
      result[name] = computeChannelValue(config, item, context);
    }
    return result;
  }

  mapItems(items, context = {}) {
    return items.map((item, index) => this.mapItem(item, { ...context, index }));
  }

  ensureBuffersForChannel(config) {
    if (!this.network) return;
    const defs = CHANNEL_DEFS[this.mode] ?? {};
    const def = defs[config.name];
    if (!def) return;
    const { attribute, type, dimension } = def;
    if (this.isNodePassthroughChannel(config, def)) {
      const sourceAttribute = this.resolveNodeSourceAttribute(config, def);
      if (!sourceAttribute) {
        console.warn(`Mapper: unable to resolve node attribute for ${config.name} passthrough`);
        return;
      }
      const sourceDimension = this.resolveNodeSourceDimension(sourceAttribute, def);
      const passthrough = this.resolvePassthroughConfig(config, def, sourceDimension, dimension);
      this.configureNodeToEdgeAttribute({
        attribute,
        sourceAttribute,
        sourceDimension,
        type,
        channelName: config.name,
        ...passthrough,
      });
      return;
    }

    try {
      if (this.mode === 'node') {
        this.network.defineNodeAttribute(attribute, type, dimension);
      } else {
        this.network.defineEdgeAttribute(attribute, type, dimension);
      }
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('already')) {
        console.warn(`Mapper ensureBuffersForChannel failed for ${config.name}:`, error);
      }
    }

    if (this.mode === 'node') {
      const buffer = this.safeGetAttributeBuffer('node', attribute);
      validateAttribute(buffer, attribute, type, dimension);
      this.registerDense('node', attribute);
    } else {
      const buffer = this.safeGetAttributeBuffer('edge', attribute);
      validateAttribute(buffer, attribute, type, dimension);
      this.registerDense('edge', attribute);
    }
  }

  isNodePassthroughChannel(config, def) {
    return (
      this.mode === 'edge' &&
      def?.nodeSource &&
      (config.type === 'passthrough' || config.type === 'nodeToEdge' || config.type === 'nodeAttribute')
    );
  }

  resolveNodeSourceAttribute(config, def) {
    if (!def?.nodeSource) return null;
    if (config.nodeAttribute) return normalizeAttributeName(config.nodeAttribute);
    const attrs = normalizeAttributes(config.attributes);
    for (const attr of attrs) {
      if (typeof attr === 'string' && /^@nodes?\./.test(attr)) {
        return normalizeAttributeName(attr);
      }
    }
    return normalizeAttributeName(def.nodeSource);
  }

  resolveNodeSourceDimension(sourceAttribute, def) {
    if (!sourceAttribute) return null;
    const buffer = this.safeGetAttributeBuffer('node', sourceAttribute);
    if (buffer?.dimension != null) {
      return buffer.dimension;
    }
    if (def?.nodeSourceDimension) {
      return def.nodeSourceDimension;
    }
    if (def?.dimension && def?.nodePassthroughEndpoints) {
      const estimatedEndpoints = normalizeEndpoints(def.nodePassthroughEndpoints);
      const estimate = estimatedEndpoints === 'both' ? def.dimension / 2 : def.dimension;
      return Math.max(1, Math.round(estimate));
    }
    return def?.dimension ?? 1;
  }

  resolvePassthroughConfig(config, def, sourceDimension, expectedDimension) {
    const preferredEndpoints = normalizeEndpoints(config.endpoints ?? def.nodePassthroughEndpoints ?? 'both');
    const defaultDoubleWidth = def.nodePassthroughDoubleWidth ?? true;
    let endpoints = preferredEndpoints;
    let doubleWidth = defaultDoubleWidth;
    let targetDimension = computePassthroughTargetDimension(sourceDimension, endpoints, doubleWidth);
    const desired = expectedDimension ?? def?.dimension;

    if (desired && targetDimension !== desired) {
      const flipDoubleWidth = computePassthroughTargetDimension(sourceDimension, endpoints, !doubleWidth);
      if (flipDoubleWidth === desired) {
        doubleWidth = !doubleWidth;
        targetDimension = flipDoubleWidth;
      } else {
        const candidates = ['source', 'destination', 'both'];
        for (const candidate of candidates) {
          const candidateDoubleWidth =
            def.nodePassthroughDoubleWidth ??
            (candidate === 'both' ? true : doubleWidth);
          const candidateDimension = computePassthroughTargetDimension(
            sourceDimension,
            candidate,
            candidateDoubleWidth,
          );
          if (candidateDimension === desired) {
            endpoints = candidate;
            doubleWidth = candidateDoubleWidth;
            targetDimension = candidateDimension;
            break;
          }
        }
      }
    }

    return { endpoints, doubleWidth, targetDimension };
  }

  configureNodeToEdgeAttribute({
    attribute,
    sourceAttribute,
    sourceDimension,
    type,
    endpoints,
    doubleWidth,
    targetDimension,
    channelName,
  }) {
    if (!attribute || !sourceAttribute) return;
    this.unregisterNodeToEdge(attribute);
    this.removeEdgeAttribute(attribute);
    try {
      this.network.defineNodeAttribute(sourceAttribute, type, sourceDimension);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('already')) {
        console.warn(`Mapper failed to define node attribute ${sourceAttribute} for ${channelName}:`, error);
      }
    }
    try {
      this.network.defineNodeToEdgeAttribute(sourceAttribute, attribute, endpoints, doubleWidth);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('already')) {
        console.warn(`Mapper failed to define node-to-edge attribute for ${channelName}:`, error);
      }
    }
    const sourceBuffer = this.safeGetAttributeBuffer('node', sourceAttribute);
    const edgeBuffer = this.safeGetAttributeBuffer('edge', attribute);
    const expected = targetDimension ?? computePassthroughTargetDimension(sourceDimension, endpoints, doubleWidth);
    validateAttribute(sourceBuffer, sourceAttribute, type, sourceDimension);
    validateAttribute(edgeBuffer, attribute, type, expected);
    this.nodeToEdgeRegistrations.add(attribute);
    this.registerDense('node', sourceAttribute);
    this.registerDense('edge', attribute);
  }

  safeGetAttributeBuffer(scope, name) {
    if (!this.network || !name) return null;
    const getter = scope === 'node' ? 'getNodeAttributeBuffer' : 'getEdgeAttributeBuffer';
    try {
      return this.network[getter](name);
    } catch (_) {
      return null;
    }
  }

  removeEdgeAttribute(name) {
    if (!this.network?.removeEdgeAttribute || !name) return;
    try {
      this.network.removeEdgeAttribute(name);
    } catch (_) {
      // ignore failures when removing stale attributes
    }
  }

  registerDense(scope, name) {
    const method =
      scope === 'node' ? this.network?.addDenseNodeAttributeBuffer : this.network?.addDenseEdgeAttributeBuffer;
    if (typeof method !== 'function') return;
    try {
      method.call(this.network, name);
    } catch (_) {
      // ignore duplicates or unsupported dense buffers
    }
  }

  unregisterNodeToEdge(attribute) {
    if (!this.network?.removeNodeToEdgeAttribute || !attribute) return;
    try {
      this.network.removeNodeToEdgeAttribute(attribute);
    } catch (_) {
      // ignore unregistration failures
    }
    this.nodeToEdgeRegistrations.delete(attribute);
  }

  unregisterChannel(config) {
    if (this.mode !== 'edge' || !config) return;
    const defs = CHANNEL_DEFS[this.mode] ?? {};
    const def = defs[config.name];
    if (!def?.attribute || !def?.nodeSource) return;
    if (config.type === 'passthrough' || config.type === 'nodeToEdge' || config.type === 'nodeAttribute') {
      this.unregisterNodeToEdge(def.attribute);
    }
  }
}

export function createDefaultMappers(network) {
  const nodeMapper = new Mapper({ mode: 'node', network });
  nodeMapper
    .channel('color')
    .from('$index')
    .scale((value, _inputs, _item, ctx) => colorFromIndex(value ?? ctx?.index ?? 0))
    .default(colorFromIndex(0))
    .done();
  nodeMapper.channel('size').constant(DEFAULT_NODE_SIZE).done();
  nodeMapper.channel('outline').constant(DEFAULT_NODE_OUTLINE_WIDTH).done();
  nodeMapper.channel('outlineColor').constant(DEFAULT_NODE_OUTLINE_COLOR).done();

  const edgeMapper = new Mapper({ mode: 'edge', network });
  edgeMapper.channel('color').from('@node.color').nodeToEdge().done();
  edgeMapper.channel('width').constant(1).done();

  return { nodeMapper, edgeMapper };
}

export { VISUAL_ATTRIBUTE_MAP as VISUAL_ATTRIBUTES };

/**
 * Convenience container that can hold multiple mappers of the same mode and
 * build a combined mapper when applying visuals.
 */
export class MapperCollection {
  constructor(mode, network, onChange) {
    this.mode = mode;
    this.network = network;
    this.mappers = new Map();
    this.onChange = onChange;
    this.defaultMapper = this.createMapper('default');
  }

  /**
   * Returns a ChannelBuilder bound to the default mapper. Calling `.done()`
   * will mark the collection dirty.
   */
  channel(name) {
    const builder = this.defaultMapper.channel(name);
    const originalDone = builder.done.bind(builder);
    builder.done = () => {
      const result = originalDone();
      this.touch();
      return result;
    };
    return builder;
  }

  /**
   * Adds a Mapper instance or a descriptor object describing channels.
   * @param {Mapper | object} entry
   * @param {string} [name]
   */
  add(entry, name) {
    let mapper = null;
    if (entry instanceof Mapper) {
      mapper = entry;
    } else {
      mapper = this.buildFromDescriptor(entry);
    }
    const key = name ?? entry?.name ?? `mapper-${this.mappers.size + 1}`;
    this.mappers.set(key, mapper);
    this.touch();
    return mapper;
  }

  /**
   * Replaces the default mapper.
   * @param {Mapper} mapper
   */
  setDefault(mapper) {
    if (!(mapper instanceof Mapper)) return;
    this.defaultMapper = mapper;
    this.mappers.set('default', mapper);
    this.touch();
  }

  createMapper(name) {
    const mapper = new Mapper({ mode: this.mode, network: this.network });
    this.mappers.set(name ?? `mapper-${this.mappers.size + 1}`, mapper);
    return mapper;
  }

  buildFromDescriptor(descriptor) {
    const mapper = new Mapper({ mode: this.mode, network: this.network });
    if (!descriptor) return mapper;
    const entries = Array.isArray(descriptor.channels)
      ? descriptor.channels.map((entry) => [entry.name, entry.config ?? entry])
      : Object.entries(descriptor).filter(([key]) => key !== 'name');
    for (const [channelName, config] of entries) {
      if (!channelName || !config) continue;
      mapper.setChannel(channelName, config);
    }
    return mapper;
  }

  /**
   * Merges all registered mappers into a single Mapper (channels override in
   * insertion order).
   */
  toCombinedMapper() {
    if (this.mappers.size === 1) {
      // Fast path: no need to merge when only one mapper is registered.
      return this.mappers.values().next().value;
    }
    const combined = new Mapper({ mode: this.mode, network: this.network });
    for (const mapper of this.mappers.values()) {
      for (const [name, config] of mapper.channels.entries()) {
        const cloned = { ...config, attributes: config.attributes ?? config.from };
        combined.setChannel(name, cloned);
      }
    }
    return combined;
  }

  touch() {
    this.onChange?.();
  }
}
