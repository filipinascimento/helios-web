import { Behavior } from './Behavior.js';
import { BehaviorContext } from './BehaviorContext.js';

export class BehaviorManager {
  constructor(helios, registry) {
    this.helios = helios ?? null;
    this.registry = registry;
    this.ui = null;
    this._attached = new Map();
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
    existing.detach?.();
    this._attached.delete(key);
    return true;
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
    return behavior;
  }
}

export default BehaviorManager;
