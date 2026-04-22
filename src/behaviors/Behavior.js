function createDetailEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
  if (typeof Event === 'function') {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

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
      } catch (_) {
        // Ignore cleanup failures so detach remains best-effort.
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
