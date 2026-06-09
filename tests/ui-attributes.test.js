import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/ui/state/Store.js';
import { UIAttribute } from '../src/ui/state/UIAttribute.js';
import { HeliosUI } from '../src/ui/HeliosUI.js';

test('Store merges object patches and notifies subscribers', () => {
  const store = new Store({ a: 1, b: 2 });
  let seen = null;
  store.subscribe((next) => { seen = next; });
  store.setState({ b: 3 });
  assert.deepEqual(store.getState(), { a: 1, b: 3 });
  assert.deepEqual(seen, { a: 1, b: 3 });
});

test('UIAttribute notifies subscribers when value changes', () => {
  const state = { value: 1 };
  const attr = UIAttribute.number({
    id: 'x',
    get: () => state.value,
    set: (v) => { state.value = v; },
  });

  const values = [];
  const unsub = attr.subscribe((v) => values.push(v));
  attr.write(2);
  attr.write(2);
  attr.write(3);
  unsub();

  assert.deepEqual(values, [1, 2, 3]);
});

test('UIAttribute stores domain separately from recommendedRange', () => {
  const attr = UIAttribute.number({
    id: 'scale',
    get: () => 1,
    domain: { min: 0, max: 10 },
    recommendedRange: { min: 0.25, max: 3 },
  });
  assert.deepEqual(attr.domain, { min: 0, max: 10 });
  assert.deepEqual(attr.recommendedRange, { min: 0.25, max: 3 });
});

test('HeliosUI accessor bindings write explicit persistence keys without an initial write', () => {
  const registered = [];
  const writes = [];
  const helios = {
    _nodeSizeScale: 1,
    nodeSizeScale(value) {
      if (arguments.length > 0) this._nodeSizeScale = value;
      return this._nodeSizeScale;
    },
    uiBindingInfo(name) {
      assert.equal(name, 'nodeSizeScale');
      return { type: 'number', defaultValue: 1 };
    },
    on() {
      return () => {};
    },
    persistence: {
      registerKey(path, options) {
        registered.push({ path, options });
      },
      set(path, value, options) {
        writes.push({ path, value, options });
      },
    },
  };
  const ui = Object.create(HeliosUI.prototype);
  ui.helios = helios;
  ui._boundAttributesById = new Map();
  ui._controlCleanups = new Set();
  ui._heliosBindingUnsubscribe = null;
  ui._persistenceWriteTimers = new Map();
  ui._persistenceAccessorBindings = new WeakSet();

  const attribute = ui.bindHeliosAccessor('nodeSizeScale', { persistenceDebounceMs: 0 });

  assert.equal(registered.at(-1).path, 'appearance.nodeStyle.sizeScale');
  assert.equal(registered.at(-1).options.scope, 'network');
  assert.deepEqual(writes, []);

  attribute.write(2);

  assert.deepEqual(writes, [{
    path: 'appearance.nodeStyle.sizeScale',
    value: 2,
    options: {
      scope: 'network',
      source: 'ui',
      reason: 'control',
      autosave: undefined,
    },
  }]);
});

test('HeliosUI control registration does not rebaseline restored overrides', () => {
  const registered = [];
  const helios = {
    persistence: {
      keyStatus(path) {
        assert.equal(path, 'layout.layoutType');
        return { hasOverride: true };
      },
      registerKey(path, options) {
        registered.push({ path, options });
      },
    },
  };
  const ui = Object.create(HeliosUI.prototype);
  ui.helios = helios;

  ui.registerPersistenceControl('layout.layoutType', {
    scope: 'network',
    defaultValue: 'gpu-force',
  });

  assert.equal(registered.at(-1).path, 'layout.layoutType');
  assert.equal(Object.prototype.hasOwnProperty.call(registered.at(-1).options, 'defaultValue'), false);
  assert.equal(registered.at(-1).options.preserveOverrides, true);
});
