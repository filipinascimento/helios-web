import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = class CustomEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.detail = init.detail;
    }
  };
}

class HeliosEventHarness extends EventTarget {
  constructor() {
    super();
    this._anyListeners = new Set();
    this._listenHandlers = new Map();
  }

  on(type, handler, options) { return Helios.prototype.on.call(this, type, handler, options); }
  off(type, handler, options) { return Helios.prototype.off.call(this, type, handler, options); }
  listen(type, handler, options) { return Helios.prototype.listen.call(this, type, handler, options); }

  emit(type, detail) {
    const event = new CustomEvent(type, { detail });
    this.dispatchEvent(event);
    return event;
  }

  destroy() {
    for (const entry of this._listenHandlers.values()) {
      this.removeEventListener(entry.type, entry.listener, entry.capture);
      entry.unsubscribeSignal?.();
    }
    this._listenHandlers.clear();
  }
}

test('listen() is chainable and does not affect on()', () => {
  const helios = new HeliosEventHarness();
  let onCount = 0;
  let listenCount = 0;

  const unsubscribe = helios.on('graph:click', () => { onCount += 1; });
  const result = helios.listen('graph:click', () => { listenCount += 1; });

  assert.equal(result, helios);
  helios.emit('graph:click', { kind: null, index: -1 });
  assert.equal(onCount, 1);
  assert.equal(listenCount, 1);

  helios.listen('graph:click', null);
  helios.emit('graph:click', { kind: null, index: -1 });
  assert.equal(onCount, 2);
  assert.equal(listenCount, 1);

  unsubscribe();
  helios.destroy();
});

test('listen() namespaces are independent and rebinding replaces only that key', () => {
  const helios = new HeliosEventHarness();
  const calls = [];

  helios.listen('graph:click.foo', () => calls.push('foo1'));
  helios.listen('graph:click.bar', () => calls.push('bar1'));
  helios.emit('graph:click', {});
  assert.deepEqual(calls, ['foo1', 'bar1']);

  helios.listen('graph:click.foo', () => calls.push('foo2'));
  helios.emit('graph:click', {});
  // Rebinding replaces the prior handler and re-registers it, so ordering
  // follows DOM listener registration order (bar then foo2).
  assert.deepEqual(calls, ['foo1', 'bar1', 'bar1', 'foo2']);

  helios.listen('graph:click.bar', null);
  helios.emit('graph:click', {});
  assert.deepEqual(calls, ['foo1', 'bar1', 'bar1', 'foo2', 'foo2']);

  helios.destroy();
});

test('listen() supports AbortSignal cleanup', () => {
  const helios = new HeliosEventHarness();
  const controller = new AbortController();
  let calls = 0;

  helios.listen('graph:click', () => { calls += 1; }, { signal: controller.signal });
  helios.emit('graph:click', {});
  assert.equal(calls, 1);

  controller.abort();
  helios.emit('graph:click', {});
  assert.equal(calls, 1);

  helios.destroy();
});
