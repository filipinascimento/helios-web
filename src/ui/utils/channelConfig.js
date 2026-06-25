export function shallowCloneChannelConfig(config) {
  if (!config) return null;
  return {
    ...config,
    meta: config.meta && typeof config.meta === 'object' ? { ...config.meta } : config.meta,
    attributes: config.attributes ?? config.from,
    clamp: config.clamp && typeof config.clamp === 'object' ? { ...config.clamp } : config.clamp,
    domain: Array.isArray(config.domain) ? [...config.domain] : config.domain,
    range: Array.isArray(config.range) ? [...config.range] : config.range,
    rules: Array.isArray(config.rules) ? config.rules.map((r) => ({ ...r })) : [],
  };
}
