import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/ui/state/Store.js';
import { UIAttribute } from '../src/ui/state/UIAttribute.js';

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
