function subscribe(target, eventName, handler, options) {
  if (!target || typeof handler !== 'function') return () => {};
  if (typeof target.on === 'function') {
    return target.on(eventName, handler, options) ?? (() => {});
  }
  if (typeof target.addEventListener === 'function') {
    target.addEventListener(eventName, handler, options);
    return () => target.removeEventListener(eventName, handler, options);
  }
  return () => {};
}

export class BehaviorContext {
  constructor(manager) {
    this.manager = manager;
  }

  get helios() {
    return this.manager.helios ?? null;
  }

  get network() {
    return this.helios?.network ?? null;
  }

  get ui() {
    return this.manager.ui ?? null;
  }

  get behaviors() {
    return this.manager;
  }

  subscribe(target, eventName, handler, options) {
    return subscribe(target, eventName, handler, options);
  }

  getBehavior(id) {
    return this.manager.get(id);
  }
}

export default BehaviorContext;
