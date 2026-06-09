import { Mapper } from '../pipeline/Mapper.js';
import { shallowCloneChannelConfig } from '../ui/utils/channelConfig.js';

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (ArrayBuffer.isView(value)) return Array.from(value, (entry) => cloneSerializable(entry));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function') continue;
    next[key] = cloneSerializable(entry);
  }
  return next;
}

function extractScalarForRule(inputs) {
  if (inputs == null) return inputs;
  if (typeof inputs === 'number') return inputs;
  if (Array.isArray(inputs) || ArrayBuffer.isView(inputs)) return inputs[0];
  if (typeof inputs === 'object') {
    const keys = Object.keys(inputs);
    if (keys.length) return inputs[keys[0]];
  }
  return inputs;
}

export function buildMapperRulePredicate(spec = {}) {
  const op = spec?.op ?? 'eq';
  const rhsRaw = spec?.rhs;
  const rhs = rhsRaw != null ? Number(rhsRaw) : undefined;
  return (inputs) => {
    const valueRaw = extractScalarForRule(inputs);
    if (op === 'nullish') return valueRaw == null;
    if (op === 'nan') return valueRaw != null && Number.isNaN(Number(valueRaw));
    const value = Number(valueRaw);
    if (!Number.isFinite(value)) return false;
    if (op === 'eq') return rhs != null && value === rhs;
    if (op === 'lt') return rhs != null && value < rhs;
    if (op === 'lte') return rhs != null && value <= rhs;
    if (op === 'gt') return rhs != null && value > rhs;
    if (op === 'gte') return rhs != null && value >= rhs;
    return false;
  };
}

function isSerializableRule(rule) {
  const ui = rule?.__ui && typeof rule.__ui === 'object' ? rule.__ui : null;
  if (!ui) return false;
  if (typeof rule?.when !== 'function') return false;
  return rule?.value !== undefined;
}

function serializeRule(rule) {
  if (!isSerializableRule(rule)) {
    return {
      unsupported: true,
      meta: cloneSerializable(rule?.meta ?? null),
    };
  }
  return {
    __ui: cloneSerializable(rule.__ui),
    value: cloneSerializable(rule.value),
    defaultValue: cloneSerializable(rule.defaultValue),
    type: typeof rule.type === 'string' ? rule.type : undefined,
    meta: cloneSerializable(rule.meta),
  };
}

function restoreRule(snapshot) {
  if (!snapshot || snapshot.unsupported === true) return null;
  const spec = snapshot.__ui && typeof snapshot.__ui === 'object' ? cloneSerializable(snapshot.__ui) : null;
  if (!spec) return null;
  return {
    __ui: spec,
    when: buildMapperRulePredicate(spec),
    value: cloneSerializable(snapshot.value),
    defaultValue: cloneSerializable(snapshot.defaultValue),
    type: typeof snapshot.type === 'string' ? snapshot.type : undefined,
    meta: cloneSerializable(snapshot.meta),
  };
}

export function isSerializableChannelConfig(config) {
  if (!config || typeof config !== 'object') return false;
  const type = config.type ?? config.mode ?? null;
  if (typeof config.scale === 'function') return false;
  if (typeof config.transform === 'function' && !config.transformType) return false;
  if (type === 'layout') return true;
  if (type === 'constant') return true;
  if (type === 'passthrough') return true;
  if (type === 'linear') return true;
  if (type === 'nodeAttribute') return true;
  if (type === 'nodeToEdge') return true;
  if (type === 'categorical') return true;
  if (type === 'colormap' || config.colormap) {
    return typeof (config.colormap ?? config.scale ?? config.range) === 'string';
  }
  return false;
}

export function serializeChannelConfig(config) {
  const cloned = shallowCloneChannelConfig(config);
  if (!cloned) return null;
  const serializable = isSerializableChannelConfig(cloned);
  const snapshot = {
    serializable,
    type: typeof cloned.type === 'string' ? cloned.type : (typeof cloned.mode === 'string' ? cloned.mode : undefined),
    attributes: cloneSerializable(cloned.attributes),
    transformType: cloned.transformType,
    transformPower: cloneSerializable(cloned.transformPower),
    colormap: cloneSerializable(cloned.colormap),
    alpha: cloneSerializable(cloned.alpha),
    clamp: cloneSerializable(cloned.clamp),
    divergent: cloned.divergent === true,
    endpoints: cloneSerializable(cloned.endpoints),
    nodeAttribute: cloneSerializable(cloned.nodeAttribute),
    domain: cloneSerializable(cloned.domain),
    range: cloneSerializable(cloned.range),
    value: cloneSerializable(cloned.value),
    defaultValue: cloneSerializable(cloned.defaultValue),
    meta: cloneSerializable(cloned.meta),
    __ui: cloneSerializable(cloned.__ui),
    rules: Array.isArray(cloned.rules) ? cloned.rules.map((rule) => serializeRule(rule)) : [],
  };
  if (!serializable) {
    snapshot.unsupported = true;
    delete snapshot.attributes;
    delete snapshot.transformType;
    delete snapshot.transformPower;
    delete snapshot.colormap;
    delete snapshot.alpha;
    delete snapshot.clamp;
    delete snapshot.divergent;
    delete snapshot.endpoints;
    delete snapshot.nodeAttribute;
    delete snapshot.domain;
    delete snapshot.range;
    delete snapshot.value;
    delete snapshot.defaultValue;
    delete snapshot.__ui;
    delete snapshot.rules;
  }
  return snapshot;
}

export function restoreChannelConfig(snapshot) {
  if (!snapshot || snapshot.unsupported === true) return null;
  const next = {
    type: snapshot.type,
    attributes: cloneSerializable(snapshot.attributes),
    transformType: snapshot.transformType,
    transformPower: cloneSerializable(snapshot.transformPower),
    colormap: cloneSerializable(snapshot.colormap),
    alpha: cloneSerializable(snapshot.alpha),
    clamp: cloneSerializable(snapshot.clamp),
    divergent: snapshot.divergent === true,
    endpoints: cloneSerializable(snapshot.endpoints),
    nodeAttribute: cloneSerializable(snapshot.nodeAttribute),
    domain: cloneSerializable(snapshot.domain),
    range: cloneSerializable(snapshot.range),
    value: cloneSerializable(snapshot.value),
    defaultValue: cloneSerializable(snapshot.defaultValue),
    meta: cloneSerializable(snapshot.meta),
    __ui: cloneSerializable(snapshot.__ui),
    rules: Array.isArray(snapshot.rules)
      ? snapshot.rules.map((rule) => restoreRule(rule)).filter(Boolean)
      : [],
  };
  return next;
}

function resetMapper(mapper) {
  if (!mapper?.channels) return;
  for (const config of mapper.channels.values()) {
    mapper.unregisterChannel?.(config);
  }
  mapper.channels.clear();
}

function snapshotExistingChannels(collection) {
  const existing = new Map();
  for (const [id, mapper] of collection?.mappers?.entries?.() ?? []) {
    const channels = new Map();
    for (const [channelName, config] of mapper?.channels?.entries?.() ?? []) {
      const snapshot = serializeChannelConfig(config);
      if (snapshot && snapshot.unsupported !== true) channels.set(channelName, snapshot);
    }
    existing.set(id, channels);
  }
  return existing;
}

function restoreChannelSnapshot(channelSnapshot, fallbackSnapshot = null) {
  return restoreChannelConfig(channelSnapshot)
    ?? restoreChannelConfig(fallbackSnapshot);
}

export function serializeMapperCollection(collection) {
  const mappers = {};
  for (const [id, mapper] of collection?.mappers?.entries?.() ?? []) {
    const channels = {};
    for (const [channelName, config] of mapper?.channels?.entries?.() ?? []) {
      channels[channelName] = serializeChannelConfig(config);
    }
    mappers[id] = { channels };
  }
  let defaultId = null;
  for (const [id, mapper] of collection?.mappers?.entries?.() ?? []) {
    if (mapper === collection?.defaultMapper) {
      defaultId = id;
      break;
    }
  }
  return {
    mode: collection?.mode ?? null,
    defaultId,
    mappers,
  };
}

export function restoreMapperCollection(collection, snapshot) {
  if (!collection || !snapshot || typeof snapshot !== 'object') return collection;
  const existingChannels = snapshotExistingChannels(collection);
  for (const mapper of collection.mappers?.values?.() ?? []) {
    resetMapper(mapper);
  }
  collection.mappers.clear();
  const restored = [];
  for (const [id, mapperSnapshot] of Object.entries(snapshot.mappers ?? {})) {
    const mapper = new Mapper({ mode: collection.mode, network: collection.network });
    const fallbackChannels = existingChannels.get(id) ?? (id === 'default' ? existingChannels.get(snapshot.defaultId) : null);
    for (const [channelName, channelSnapshot] of Object.entries(mapperSnapshot?.channels ?? {})) {
      const fallbackSnapshot = fallbackChannels?.get?.(channelName) ?? null;
      const config = restoreChannelSnapshot(channelSnapshot, fallbackSnapshot);
      if (!config) continue;
      mapper.setChannel(channelName, config);
    }
    collection.mappers.set(id, mapper);
    restored.push([id, mapper]);
  }
  if (!restored.length) {
    const mapper = collection.defaultMapper instanceof Mapper
      ? collection.defaultMapper
      : new Mapper({ mode: collection.mode, network: collection.network });
    resetMapper(mapper);
    collection.mappers.set('default', mapper);
    collection.defaultMapper = mapper;
    collection.touch?.();
    return collection;
  }
  const desiredDefaultId = typeof snapshot.defaultId === 'string' ? snapshot.defaultId : null;
  collection.defaultMapper = (desiredDefaultId && collection.mappers.get(desiredDefaultId))
    || collection.mappers.get('default')
    || restored[0][1]
    || null;
  collection.touch?.();
  return collection;
}

export function cloneMapperSnapshot(snapshot) {
  return cloneSerializable(snapshot);
}
