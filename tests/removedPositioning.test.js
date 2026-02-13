import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

test('positions() and interpolation() getters return null after removal', () => {
  const helios = Object.create(Helios.prototype);
  assert.equal(helios.positions(), null);
  assert.equal(helios.interpolation(), null);
});

test('positions(options) throws because position delegation is removed', () => {
  const helios = Object.create(Helios.prototype);
  assert.throws(
    () => helios.positions({ source: 'delegate' }),
    /removed/,
  );
});

test('interpolation(options) throws because interpolation is removed', () => {
  const helios = Object.create(Helios.prototype);
  assert.throws(
    () => helios.interpolation({ enabled: true }),
    /removed/,
  );
});

test('_handleLayoutUpdate marks visuals dirty and requests geometry', () => {
  let markCalls = 0;
  let geometryCalls = 0;
  const helios = Object.create(Helios.prototype);
  helios.visuals = { markPositionsDirty: () => { markCalls += 1; } };
  helios.scheduler = { requestGeometry: () => { geometryCalls += 1; } };
  helios.debug = { log: () => {} };

  helios._handleLayoutUpdate({ timestamp: 123 });

  assert.equal(markCalls, 1);
  assert.equal(geometryCalls, 1);
});
