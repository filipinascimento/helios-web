function shallowMerge(base, patch) {
  if (patch == null || typeof patch !== 'object') return patch;
  if (Array.isArray(patch)) return patch.slice();
  return { ...(base ?? {}), ...patch };
}

export class Store {
  constructor(initialState = {}) {
    this.state = initialState;
    this.listeners = new Set();
  }

  getState() {
    return this.state;
  }

  setState(update) {
    const next = typeof update === 'function'
      ? update(this.state)
      : shallowMerge(this.state, update);
    if (Object.is(next, this.state)) return;
    this.state = next;
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

