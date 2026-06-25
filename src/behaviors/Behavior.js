function createDetailEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
  if (typeof Event === 'function') {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

/**
 * Base class for reusable Helios application behaviors.
 *
 * @public
 * @param {object} [options] - Serializable configuration owned by the behavior.
 * @returns {Behavior} Detached behavior instance; Helios attaches it through
 * `helios.useBehavior(...)` or `BehaviorManager.use(...)`.
 * @remarks Behaviors attach to a Helios context, own serializable state, emit
 * change events, and register cleanup hooks for listeners, timers, and UI
 * bindings. Custom behaviors should override `attach`, `detach`, `serialize`,
 * and `restore` only where needed.
 * @example
 * class PulseBehavior extends Behavior {
 *   static id = 'pulse';
 *   attach(context) {
 *     super.attach(context);
 *     const timer = setInterval(() => context.helios.requestRender(), 500);
 *     this.addCleanup(() => clearInterval(timer));
 *     return this;
 *   }
 * }
 */
export class Behavior extends EventTarget {
  static id = null;

  constructor(options = {}) {
    super();
    this.options = options && typeof options === 'object' ? { ...options } : {};
    this.context = null;
    this.id = this.constructor.id ?? null;
    this._cleanups = new Set();
  }

  attach(context) {
    this.context = context ?? null;
    return this;
  }

  detach() {
    for (const cleanup of this._cleanups) {
      try {
        cleanup?.();
      } catch (error) {
        console.warn(`Helios behavior "${this.id ?? this.constructor.name}" cleanup failed during detach.`, error);
      }
    }
    this._cleanups.clear();
    this.context = null;
    return this;
  }

  update(options = {}) {
    if (options && typeof options === 'object') {
      this.options = { ...this.options, ...options };
    }
    return this;
  }

  serialize() {
    return { options: { ...this.options } };
  }

  restore(snapshot = {}) {
    if (snapshot?.options && typeof snapshot.options === 'object') {
      this.update(snapshot.options);
    }
    return this;
  }

  addCleanup(cleanup) {
    if (typeof cleanup !== 'function') return cleanup;
    this._cleanups.add(cleanup);
    return cleanup;
  }

  removeCleanup(cleanup) {
    this._cleanups.delete(cleanup);
    return this;
  }

  emit(type, detail) {
    this.dispatchEvent(createDetailEvent(type, detail));
    return this;
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }
}

export default Behavior;
