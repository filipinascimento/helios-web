function normalizeRange(range) {
  if (!range) return null;
  if (Array.isArray(range) && range.length >= 2) {
    const min = Number(range[0]);
    const max = Number(range[1]);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
  }
  if (typeof range === 'object') {
    const min = Number(range.min);
    const max = Number(range.max);
    if (Number.isFinite(min) && Number.isFinite(max)) return { min, max };
  }
  return null;
}

/**
 * Observable UI attribute descriptor used to bind controls to Helios state.
 *
 * @public
 * @apiSection User Interface
 * @param {object} options - Attribute descriptor.
 * @param {string} options.id - Stable attribute id.
 * @param {Function} options.get - Read callback.
 * @param {Function} [options.set] - Write callback.
 */
export class UIAttribute {
  constructor(options) {
    if (!options?.id) throw new Error('UIAttribute requires an id');
    if (typeof options.get !== 'function') throw new Error('UIAttribute requires a get() function');
    const readOnly = Boolean(options.readOnly ?? (typeof options.set !== 'function'));
    this.id = options.id;
    this.label = options.label ?? options.id;
    this.type = options.type ?? 'unknown';
    this.readOnly = readOnly;
    this.updateMode = options.updateMode ?? 'onChange';
    this.get = options.get;
    this.set = readOnly ? null : options.set;
    this.min = options.min ?? null;
    this.max = options.max ?? null;
    this.step = options.step ?? null;
    this.domain = normalizeRange(options.domain);
    this.recommendedRange = normalizeRange(options.recommendedRange);
    this.meta = options.meta ?? {};
    this._listeners = new Set();
    this._lastValue = undefined;
    this._hasLast = false;
  }

  value() {
    return this.get();
  }

  write(value, context) {
    if (this.readOnly || !this.set) return;
    this.set(value, context);
    this.notify();
  }

  notify() {
    const next = this.get();
    if (this._hasLast && Object.is(next, this._lastValue)) return;
    this._lastValue = next;
    this._hasLast = true;
    for (const listener of this._listeners) {
      listener(next);
    }
  }

  subscribe(listener, options = {}) {
    this._listeners.add(listener);
    if (options.immediate ?? true) {
      listener(this.get());
    }
    return () => this._listeners.delete(listener);
  }

  static number(options) {
    return new UIAttribute({ ...options, type: 'number' });
  }

  static string(options) {
    return new UIAttribute({ ...options, type: 'string' });
  }

  static boolean(options) {
    return new UIAttribute({ ...options, type: 'boolean' });
  }
}
