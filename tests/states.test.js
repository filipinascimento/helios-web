import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

test('exports Helios.STATES and keeps Helios.STATE_BITS as alias', () => {
  assert.ok(Helios);
  assert.ok(Helios.STATES);
  assert.equal(Helios.STATE_BITS, Helios.STATES);
  assert.equal(Helios.STATES.FILTERED, 1 << 0);
  assert.equal(Helios.STATES.SELECTED, 1 << 1);
  assert.equal(Helios.STATES.HIGHLIGHTED, 1 << 2);
});

