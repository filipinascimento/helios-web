import { Behavior } from './Behavior.js';
import { BehaviorContext } from './BehaviorContext.js';

/**
 * Runtime owner for active behavior instances on a Helios visualization.
 *
 * @public
 * @param {import('../Helios.js').Helios} helios - Visualization controller that
 * behaviors will attach to.
 * @param {BehaviorRegistry} registry - Registry used to instantiate named
 * behaviors.
 * @returns {BehaviorManager} Manager with no active behaviors attached.
 * @remarks The manager creates, attaches, detaches, serializes, and restores
 * behavior instances against a shared Helios context. Use the higher-level
 * `helios.behavior` namespace for most app code.
 */
export class BehaviorManager {
  constructor(helios, registry) {
    this.helios = helios ?? null;
    this.registry = registry;
    this.ui = null;
    this._attached = new Map();
    this._storageBindings = new Map();
  }

  setUI(ui) {
    this.ui = ui ?? null;
    return this;
  }

  has(id) {
    return this._attached.has(String(id ?? '').trim());
  }

  get(id) {
    return this._attached.get(String(id ?? '').trim()) ?? null;
  }

  entries() {
    return Array.from(this._attached.entries());
  }

  values() {
    return Array.from(this._attached.values());
  }

  use(idOrBehavior, options = {}) {
    if (typeof idOrBehavior === 'string') {
      const existing = this.get(idOrBehavior);
      if (existing) {
        existing.update(options);
        return existing;
      }
      const created = this.registry.create(idOrBehavior, options);
      return this._attach(created);
    }

    const behavior = idOrBehavior;
    if (!(behavior instanceof Behavior) && (!behavior || typeof behavior.attach !== 'function')) {
      throw new TypeError('behaviors.use(...) expects a registered behavior name or a Behavior instance');
    }
    if (options && typeof options === 'object' && Object.keys(options).length > 0) {
      behavior.update?.(options);
    }
    return this._attach(behavior);
  }

  detach(id) {
    const key = String(id ?? '').trim();
    const existing = this._attached.get(key);
    if (!existing) return false;
    this._storageBindings.get(key)?.();
    this._storageBindings.delete(key);
    existing.detach?.();
    this._attached.delete(key);
    return true;
  }

  detachAll() {
    for (const [id, behavior] of this._attached.entries()) {
      try {
        this._storageBindings.get(id)?.();
        this._storageBindings.delete(id);
        behavior.detach?.();
      } finally {
        this._attached.delete(id);
      }
    }
    return this;
  }

  destroy() {
    this.detachAll();
    this.ui = null;
    this.helios = null;
  }

  serialize() {
    const snapshot = {};
    for (const [id, behavior] of this._attached.entries()) {
      if (typeof behavior.serialize !== 'function') continue;
      snapshot[id] = behavior.serialize();
    }
    return snapshot;
  }

  restore(snapshot = {}) {
    if (!snapshot || typeof snapshot !== 'object') return this;
    for (const [id, state] of Object.entries(snapshot)) {
      const behavior = this.get(id) ?? (this.registry.has(id) ? this.use(id) : null);
      behavior?.restore?.(state);
    }
    return this;
  }

  _attach(behavior) {
    const id = String(behavior?.id ?? behavior?.constructor?.id ?? '').trim();
    if (!id) throw new Error('Attached behaviors must expose an id');
    const existing = this._attached.get(id);
    if (existing && existing !== behavior) {
      this._storageBindings.get(id)?.();
      this._storageBindings.delete(id);
      existing.detach?.();
    }
    behavior.id = id;
    this._attached.set(id, behavior);
    try {
      behavior.attach?.(new BehaviorContext(this));
    } catch (error) {
      this._attached.delete(id);
      throw error;
    }
    const stateManager = this.helios?.states ?? this.helios?.storage;
    if (typeof behavior.stateEntries === 'function' && typeof stateManager?.register === 'function') {
      const entries = behavior.stateEntries();
      if (entries && typeof entries === 'object') {
        const cleanup = stateManager.register(behavior, `behaviors.${id}`, entries);
        if (typeof cleanup === 'function') this._storageBindings.set(id, cleanup);
      }
    }
    return behavior;
  }
}

export default BehaviorManager;
