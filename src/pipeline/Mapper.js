import { AttributeType } from 'helios-network';
import { createColormapScale } from '../colors/colormaps.js';
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

const NODE_ATTRIBUTE_TO_CHANNEL = {
  [NODE_COLOR_ATTRIBUTE]: 'color',
  [NODE_SIZE_ATTRIBUTE]: 'size',
  [NODE_OUTLINE_WIDTH_ATTRIBUTE]: 'outline',
  [NODE_OUTLINE_COLOR_ATTRIBUTE]: 'outlineColor',
  [NODE_POSITION_ATTRIBUTE]: 'position',
};

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

function applyBuiltinTransform(transformType, value, power = 1) {
  const v = Number(value);
  if (!Number.isFinite(v)) return value;
  if (!transformType || transformType === 'linear') return v;

  if (transformType === 'log') {
    if (v <= 0) return undefined;
    return Math.log(v);
  }

  if (transformType === 'log1p') {
    if (v <= -1) return undefined;
    return Math.log1p(v);
  }

  if (transformType === 'logit') {
    // Avoid infinities for values near 0/1.
    const eps = 1e-12;
    const clamped = Math.max(eps, Math.min(1 - eps, v));
    return Math.log(clamped / (1 - clamped));
  }

  if (transformType === 'power') {
    const p = Number(power);
    if (!Number.isFinite(p)) return undefined;
    const out = Math.pow(v, p);
    return Number.isFinite(out) ? out : undefined;
  }

  return v;
}

function isPercentileTransformType(transformType) {
  return transformType === 'percentile' || transformType === 'quantile';
}

function applyPercentileTransform(config, inputs) {
  const value = Array.isArray(inputs) ? (inputs.length === 1 ? inputs[0] : undefined) : inputs;
  const v = Number(value);
  if (!Number.isFinite(v)) return undefined;
  const lookup = config?.__percentileLookup;
  if (typeof lookup !== 'function') return v;
  return lookup(v);
}

function clampForDomainTransform(transformType, value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return value;
  const eps = 1e-12;
  if (!transformType || transformType === 'linear') return v;
  if (transformType === 'log') return Math.max(eps, v);
  if (transformType === 'log1p') return Math.max(-1 + eps, v);
  if (transformType === 'logit') return Math.max(eps, Math.min(1 - eps, v));
  return v;
}

function transformDomainIfNeeded(config, domain) {
  const type = config?.transformType;
  if (!type || type === 'linear') return domain;
  if (isPercentileTransformType(type)) return domain;
  if (!Array.isArray(domain) || domain.length !== 2) return domain;
  const power = config?.transformPower;
  const d0 = clampForDomainTransform(type, domain[0]);
  const d1 = clampForDomainTransform(type, domain[1]);
  const t0 = applyBuiltinTransform(type, d0, power);
  const t1 = applyBuiltinTransform(type, d1, power);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return domain;
  return [t0, t1];
}

function resolveTransformFn(config) {
  const type = config?.transformType;
  if (!type || type === 'linear') return undefined;
  if (isPercentileTransformType(type)) {
    return (inputs) => applyPercentileTransform(config, inputs);
  }
  const power = config?.transformPower;
  return (inputs) => applyBuiltinTransform(type, inputs, power);
}

function applyScale(config, value, inputs, item, context) {
  if (config.type === 'colormap' || config.colormap) {
    const baseDomain = resolveDivergentDomain(config, config.domain);
    const domain = transformDomainIfNeeded(config, baseDomain);
    const clamp = config.clamp ?? true;
    if (!Number.isFinite(Number(value))) return undefined;
    const scaleKey = config.colormap ?? config.scale ?? config.range;
    const scaleSignature = JSON.stringify({
      key: scaleKey,
      domain: Array.isArray(domain) ? domain : null,
      alpha: config.alpha ?? null,
      clamp,
    });
    if (config.__colormapScaleSignature !== scaleSignature) {
      config.__colormapScale = createColormapScale(scaleKey, { domain, alpha: config.alpha, clamp });
      config.__colormapScaleSignature = scaleSignature;
    }
    const scale = config.__colormapScale;
    if (typeof scale === 'function' && Array.isArray(domain) && domain.length === 2) {
      const [d0, d1] = domain;
      const lo = Math.min(d0, d1);
      const hi = Math.max(d0, d1);
      const clampMin = typeof clamp === 'object' ? clamp.min !== false : clamp !== false;
      const clampMax = typeof clamp === 'object' ? clamp.max !== false : clamp !== false;
      if (!clampMin && Number.isFinite(lo) && value < lo) return undefined;
      if (!clampMax && Number.isFinite(hi) && value > hi) return undefined;
    }
    return scale(value, inputs, item, context);
  }
  if (config.type === 'linear') {
    const domain = transformDomainIfNeeded(config, config.domain);
    return linearScale(value, domain, config.range);
  }
  if (config.type === 'categorical') {
    return categoricalScale(value, config.domain, config.range);
  }
  if (typeof config.scale === 'function') {
    return config.scale(value, inputs, item, context);
  }
  return value;
}

function resolveDivergentDomain(config, domain) {
  if (!config?.divergent || isPercentileTransformType(config.transformType)) return domain;
  if (!Array.isArray(domain) || domain.length !== 2) return [-1, 1];
  const maxAbs = Math.max(Math.abs(domain[0] ?? 0), Math.abs(domain[1] ?? 0));
  if (!Number.isFinite(maxAbs) || maxAbs === 0) return [-1, 1];
  return [-maxAbs, maxAbs];
}

function buildPercentileLookup(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const denom = Math.max(1, sorted.length - 1);
  return (value) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return undefined;
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= v) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const idx = Math.max(0, lo - 1);
    return denom === 0 ? 0 : idx / denom;
  };
}

function buildPercentileLookupForIndex(count) {
  const size = Number(count);
  if (!Number.isFinite(size) || size <= 0) return null;
  const denom = Math.max(1, size - 1);
  return (value) => {
    const v = Number(value);
    if (!Number.isFinite(v)) return undefined;
    const idx = Math.max(0, Math.min(size - 1, Math.floor(v)));
    return denom === 0 ? 0 : idx / denom;
  };
}

function resolvePercentileLookup(mapper, config) {
  const network = mapper?.network;
  if (!network) return null;
  const attrs = normalizeAttributes(config?.attributes);
  if (attrs.length !== 1) return null;
  const attr = attrs[0];
  if (typeof attr !== 'string') return null;
  if (attr === '$index') {
    const count = mapper.mode === 'edge'
      ? (network.edgeCount ?? network.edgesCount ?? null)
      : (network.nodeCount ?? network.nodesCount ?? null);
    return buildPercentileLookupForIndex(count);
  }
  const isNodeProxy = mapper.mode === 'edge' && (attr.startsWith('@node.') || attr.startsWith('@nodes.'));
  const name = attr.replace(/^@nodes?\./, '');
  const resolved = normalizeAttributeName(name);
  const indices = mapper.mode === 'edge' && !isNodeProxy ? network.edgeIndices : network.nodeIndices;
  if (!indices || typeof indices.length !== 'number') return null;
  const compute = () => {
    try {
      const buffer = isNodeProxy
        ? network.getNodeAttributeBuffer?.(resolved)
        : (mapper.mode === 'edge' ? network.getEdgeAttributeBuffer?.(resolved) : network.getNodeAttributeBuffer?.(resolved));
      if (!buffer?.view) return null;
      if (Number.isFinite(buffer.dimension) && buffer.dimension !== 1) return null;
      const values = [];
      for (let i = 0; i < indices.length; i += 1) {
        const idx = indices[i];
        const v = Number(buffer.view[idx]);
        if (Number.isFinite(v)) values.push(v);
      }
      return buildPercentileLookup(values);
    } catch (_) {
      return null;
    }
  };
  if (typeof network.withBufferAccess === 'function') {
    return network.withBufferAccess(compute);
  }
  return compute();
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
    meta: config.meta && typeof config.meta === 'object' ? { ...config.meta } : undefined,
    attributes: config.attributes ?? config.from ?? undefined,
    transform: config.transform,
    transformType: config.transformType,
    transformPower: config.transformPower,
    type: config.type ?? config.mode ?? undefined,
    colormap: config.colormap,
    alpha: config.alpha,
    clamp: config.clamp,
    divergent: config.divergent,
    endpoints: normalizeEndpoints(config.endpoints ?? config.endpoint ?? 'both'),
    nodeAttribute: config.nodeAttribute ?? config.nodeAttr ?? undefined,
    domain: config.domain,
    range: config.range,
    scale: config.scale,
    value: config.value,
    defaultValue: config.defaultValue,
    rules: (config.rules ?? []).map((rule) => ({ ...rule })),
  };

  if ((normalized.type === 'colormap' || normalized.colormap) && normalized.defaultValue === undefined) {
    const clamp = normalized.clamp;
    const clampMin = clamp && typeof clamp === 'object' ? clamp.min !== false : clamp !== false;
    const clampMax = clamp && typeof clamp === 'object' ? clamp.max !== false : clamp !== false;
    if (!clampMin && !clampMax) {
      normalized.defaultValue = '#888888ff';
    }
  }

  if (typeof normalized.transform !== 'function') {
    const fn = resolveTransformFn(normalized);
    if (typeof fn === 'function') normalized.transform = fn;
  }
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

function isConstantChannel(config) {
  return config?.type === 'constant' && (!config.rules || config.rules.length === 0);
}

function isEdgeNodePassthrough(config, def) {
  return (
    config &&
    def?.nodeSource &&
    (config.type === 'passthrough' || config.type === 'nodeToEdge' || config.type === 'nodeAttribute')
  );
}

function resolveNodeChannelNameFromConfig(config, def) {
  const attrs = normalizeAttributes(config?.attributes);
  const hasAttributes = attrs.length > 0;
  for (const attr of attrs) {
    if (typeof attr !== 'string') continue;
    if (!/^@nodes?\./.test(attr)) continue;
    const normalized = normalizeAttributeName(attr);
    const channelName = NODE_ATTRIBUTE_TO_CHANNEL[normalized];
    if (channelName) return channelName;
  }
  if (config?.nodeAttribute) {
    const normalized = normalizeAttributeName(config.nodeAttribute);
    return NODE_ATTRIBUTE_TO_CHANNEL[normalized] ?? null;
  }
  if (!hasAttributes && def?.nodeSource) {
    const normalized = normalizeAttributeName(def.nodeSource);
    return NODE_ATTRIBUTE_TO_CHANNEL[normalized] ?? null;
  }
  return null;
}

function removeEdgeAttributeSafe(network, name, debug) {
  if (!network?.removeEdgeAttribute || !name) return;
  try {
    network.removeEdgeAttribute(name);
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (/unknown edge attribute/i.test(msg) || /does not exist/i.test(msg) || /not defined/i.test(msg)) {
      return;
    }
    debug?.log?.('mapper', 'Failed to remove edge attribute', { name, error });
  }
}

function removeNodeToEdgeAttributeSafe(network, name, debug) {
  if (!network?.removeNodeToEdgeAttribute || !name) return;
  try {
    network.removeNodeToEdgeAttribute(name);
  } catch (error) {
    debug?.log?.('mapper', 'Failed to remove node-to-edge attribute', { name, error });
  }
}

function resolveEdgeChannelEntriesForNodeConstants(channelEntries, nodeMapper, network, debug) {
  if (!channelEntries || !nodeMapper?.channels) return { entries: channelEntries, changed: false };
  let changed = false;
  for (const [name, config] of channelEntries.entries()) {
    const def = CHANNEL_DEFS.edge?.[name];
    if (!def || def.attribute === EDGE_ENDPOINTS_POSITION_ATTRIBUTE) continue;
    if (!isEdgeNodePassthrough(config, def)) continue;
    const nodeChannelName = resolveNodeChannelNameFromConfig(config, def);
    if (!nodeChannelName) continue;
    const nodeConfig = nodeMapper.channels.get(nodeChannelName);
    if (!isConstantChannel(nodeConfig)) continue;
    const constantValue = nodeConfig?.value ?? nodeConfig?.defaultValue;
    if (constantValue === undefined) continue;
    removeNodeToEdgeAttributeSafe(network, def.attribute, debug);
    removeEdgeAttributeSafe(network, def.attribute, debug);
    channelEntries.set(name, {
      ...config,
      type: 'constant',
      value: constantValue,
      attributes: undefined,
      nodeAttribute: undefined,
      endpoints: undefined,
      transform: undefined,
      scale: undefined,
      domain: undefined,
      range: undefined,
      rules: [],
    });
    changed = true;
  }
  return { entries: channelEntries, changed };
}

export function resolveEdgeMapperForNodeConstants(edgeMapper, nodeMapper, options = {}) {
  if (!edgeMapper || edgeMapper.mode !== 'edge' || !nodeMapper?.channels) return edgeMapper;
  const network = options.network ?? edgeMapper.network ?? nodeMapper.network ?? null;
  const debug = options.debug ?? null;
  const entries = new Map();
  for (const [name, config] of edgeMapper.channels.entries()) {
    entries.set(name, { ...config, attributes: config.attributes ?? config.from });
  }
  const resolved = resolveEdgeChannelEntriesForNodeConstants(entries, nodeMapper, network, debug);
  if (!resolved.changed) return edgeMapper;
  const derived = new Mapper({ mode: 'edge', network });
  for (const [name, config] of resolved.entries.entries()) {
    derived.setChannel(name, config);
  }
  return derived;
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

  colormap(nameOrDescriptor, options = {}) {
    this.config.type = 'colormap';
    this.config.colormap = nameOrDescriptor;
    if (options?.domain) this.config.domain = options.domain;
    if (options?.alpha != null) this.config.alpha = options.alpha;
    if (options?.clamp != null) this.config.clamp = options.clamp;
    if (options?.divergent != null) this.config.divergent = options.divergent;
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
    this.ensurePercentileLookup(normalized);
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
      this.ensurePercentileLookup(config);
      result[name] = computeChannelValue(config, item, context);
    }
    return result;
  }

  mapItems(items, context = {}) {
    return items.map((item, index) => this.mapItem(item, { ...context, index }));
  }

  ensurePercentileLookup(config) {
    if (!isPercentileTransformType(config?.transformType)) return;
    if (typeof config.__percentileLookup === 'function') return;
    const lookup = resolvePercentileLookup(this, config);
    if (typeof lookup === 'function') {
      config.__percentileLookup = lookup;
    }
  }

  ensureBuffersForChannel(config) {
    if (!this.network) return;
    const defs = CHANNEL_DEFS[this.mode] ?? {};
    const def = defs[config.name];
    if (!def) return;
    if (!this.shouldEnsureChannelBuffer(config, def)) {
      return;
    }
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

  shouldEnsureChannelBuffer(config, def) {
    if (!def) return false;
    if (config.type === 'constant' && (!config.rules || config.rules.length === 0)) {
      return (
        def.attribute === NODE_POSITION_ATTRIBUTE ||
        def.attribute === EDGE_ENDPOINTS_POSITION_ATTRIBUTE
      );
    }
    return true;
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
    try {
      this.removeEdgeAttribute(attribute);
    } catch (error) {
      console.warn(`Mapper failed to remove edge attribute ${attribute} for ${channelName}:`, error);
    }
    try {
      this.network.defineNodeAttribute(sourceAttribute, type, sourceDimension);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('already')) {
        console.warn(`Mapper failed to define node attribute ${sourceAttribute} for ${channelName}:`, error);
      }
    }
    let passthroughOk = false;
    try {
      this.network.defineNodeToEdgeAttribute(sourceAttribute, attribute, endpoints, doubleWidth);
      passthroughOk = true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (typeof this.network?.removeEdgeAttribute === 'function' && /already exists/i.test(msg)) {
        // Retry once so endpoint changes don't get ignored when removal fails silently.
        try {
          this.network.removeEdgeAttribute(attribute);
          this.network.defineNodeToEdgeAttribute(sourceAttribute, attribute, endpoints, doubleWidth);
          passthroughOk = true;
        } catch (retryError) {
          console.warn(`Mapper failed to redefine node-to-edge attribute for ${channelName}:`, retryError);
        }
      } else {
        console.warn(`Mapper failed to define node-to-edge attribute for ${channelName}:`, error);
      }
    }
    if (passthroughOk && typeof this.network?.hasNodeToEdgeAttribute === 'function') {
      try {
        passthroughOk = Boolean(this.network.hasNodeToEdgeAttribute(attribute));
      } catch (_) {
        // ignore
      }
    }
    const sourceBuffer = this.safeGetAttributeBuffer('node', sourceAttribute);
    const edgeBuffer = this.safeGetAttributeBuffer('edge', attribute);
    const expected = targetDimension ?? computePassthroughTargetDimension(sourceDimension, endpoints, doubleWidth);
    validateAttribute(sourceBuffer, sourceAttribute, type, sourceDimension);
    validateAttribute(edgeBuffer, attribute, type, expected);
    if (passthroughOk) {
      this.nodeToEdgeRegistrations.add(attribute);
    } else {
      this.nodeToEdgeRegistrations.delete(attribute);
    }
    this.registerDense('node', sourceAttribute);
    this.registerDense('edge', attribute);

    // No explicit buffer bumps here: renderer invalidation for node-to-edge
    // passthrough config changes is handled centrally in GraphLayer (derived
    // version augmentation) to avoid surprising side-effects.
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
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (/unknown edge attribute/i.test(msg) || /does not exist/i.test(msg) || /not defined/i.test(msg)) {
        return;
      }
      throw error;
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
  const denom = Math.max(1, (network?.nodeCount ?? network?.nodeCapacity ?? 1) - 1);
  const infernoDefault = createColormapScale('interpolateInferno', { domain: [0, 1], alpha: 1 })(0.6);
  const nodeMapper = new Mapper({ mode: 'node', network });
  nodeMapper
    .channel('color')
    .from('$index')
    .colormap('interpolateInferno', { domain: [0, denom + 1], alpha: 1, clamp: true })
    .default(infernoDefault)
    .done();
  nodeMapper.channel('size').constant(DEFAULT_NODE_SIZE).done();
  nodeMapper.channel('outline').constant(DEFAULT_NODE_OUTLINE_WIDTH).done();
  nodeMapper.channel('outlineColor').constant(DEFAULT_NODE_OUTLINE_COLOR).done();

  const edgeMapper = new Mapper({ mode: 'edge', network });
  edgeMapper.channel('color').from('@node.color').nodeToEdge().done();
  edgeMapper.channel('width').constant(1).done();
  edgeMapper.channel('opacity').constant(1).done();

  return { nodeMapper, edgeMapper };
}

export { VISUAL_ATTRIBUTE_MAP as VISUAL_ATTRIBUTES };

/**
 * Convenience container that can hold multiple mappers of the same mode and
 * build a combined mapper when applying visuals.
 */
export class MapperCollection {
  constructor(mode, network, onChange, debug) {
    this.mode = mode;
    this.network = network;
    this.mappers = new Map();
    this.onChange = onChange;
    this.debug = debug;
    this.defaultMapper = this.createMapper('default');
    this.debug?.log('mapper', `Created ${mode} mapper collection`);
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
      this.debug?.log('mapper', `Updated ${this.mode} channel "${name}"`);
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
    this.debug?.log('mapper', `Added ${this.mode} mapper`, { name: key });
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
    this.debug?.log('mapper', `Replaced default ${this.mode} mapper`);
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
  toCombinedMapper(options = {}) {
    const nodeMapper = options?.nodeMapper ?? null;
    this.debug?.log('mapper', `Combining ${this.mode} mappers`, { count: this.mappers.size });
    if (this.mappers.size === 1 && !(this.mode === 'edge' && nodeMapper)) {
      // Fast path: no need to merge when only one mapper is registered.
      return this.mappers.values().next().value;
    }
    const combined = new Mapper({ mode: this.mode, network: this.network });
    const channelEntries = new Map();
    for (const mapper of this.mappers.values()) {
      for (const [name, config] of mapper.channels.entries()) {
        const cloned = { ...config, attributes: config.attributes ?? config.from };
        channelEntries.set(name, cloned);
      }
    }
    if (this.mode === 'edge') {
      resolveEdgeChannelEntriesForNodeConstants(channelEntries, nodeMapper, this.network, this.debug);
    }
    for (const [name, config] of channelEntries.entries()) {
      combined.setChannel(name, config);
    }
    this.debug?.log('mapper', `Combined ${this.mode} mappers`, { channels: combined.channels.size });
    return combined;
  }

  touch() {
    this.onChange?.();
  }
}
