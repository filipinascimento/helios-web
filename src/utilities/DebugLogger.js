const DEFAULT_CATEGORIES = ['helios', 'mapper', 'scheduler', 'layout', 'renderer'];

function buildCategorySet(value) {
  const categories = new Set();
  if (value === true) {
    DEFAULT_CATEGORIES.forEach((name) => categories.add(name));
    return categories;
  }
  if (value === 'all' || value === '*') {
    categories.add('*');
    return categories;
  }
  if (Array.isArray(value)) {
    value.map(String).forEach((name) => categories.add(name));
    return categories;
  }
  if (value && typeof value === 'object') {
    if (Array.isArray(value.categories)) {
      value.categories.map(String).forEach((name) => categories.add(name));
    }
    Object.entries(value).forEach(([key, flag]) => {
      if (flag === true) categories.add(key);
    });
  }
  return categories;
}

export function resolveDebugConfig(optionValue) {
  const source = optionValue ?? globalThis?.__HELIOS_DEBUG__;
  if (!source) {
    return { enabled: false, categories: new Set() };
  }
  const categories = buildCategorySet(source);
  if (categories.size === 0) {
    DEFAULT_CATEGORIES.forEach((name) => categories.add(name));
  }
  return { enabled: true, categories };
}

export class DebugLogger {
  constructor(config = {}) {
    this.enabled = config.enabled ?? false;
    this.categories = config.categories ?? new Set();
    this.prefix = config.prefix ?? 'helios';
  }

  enabledFor(category) {
    if (!this.enabled) return false;
    if (!category) return true;
    return this.categories.has('*') || this.categories.has(category);
  }

  log(category, message, ...args) {
    if (!this.enabledFor(category)) return;
    const tag = category ? `${this.prefix}:${category}` : this.prefix;
    if (args.length > 0) {
      console.debug(`[${tag}] ${message}`, ...args);
    } else {
      console.debug(`[${tag}] ${message}`);
    }
  }
}

export function createDebugLogger(optionValue) {
  return new DebugLogger(resolveDebugConfig(optionValue));
}
