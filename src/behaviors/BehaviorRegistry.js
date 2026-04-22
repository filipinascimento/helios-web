export class BehaviorRegistry {
  constructor() {
    this._entries = new Map();
  }

  register(id, behavior) {
    const key = String(id ?? '').trim();
    if (!key) throw new Error('BehaviorRegistry.register(id, behavior) requires a non-empty id');
    if (typeof behavior !== 'function') {
      throw new TypeError(`BehaviorRegistry entry for "${key}" must be a constructor or factory`);
    }
    this._entries.set(key, behavior);
    return this;
  }

  has(id) {
    return this._entries.has(String(id ?? '').trim());
  }

  create(id, options) {
    const key = String(id ?? '').trim();
    const entry = this._entries.get(key);
    if (!entry) throw new Error(`Unknown behavior "${key}"`);
    const instance = entry.prototype ? new entry(options) : entry(options);
    if (!instance || typeof instance !== 'object') {
      throw new Error(`Behavior factory for "${key}" did not return an instance`);
    }
    instance.id = key;
    return instance;
  }
}

export default BehaviorRegistry;
