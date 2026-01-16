import test from 'node:test';
import assert from 'node:assert/strict';
import { Mapper } from '../src/pipeline/Mapper.js';

test('built-in transformType can be configured without providing a function', () => {
  const mapper = new Mapper({ mode: 'node' });

  mapper.setChannel('size', {
    attributes: 'x',
    type: 'linear',
    transformType: 'log1p',
    domain: [0, 1],
    range: [0, 10],
    defaultValue: 0,
  });

  const cfg = mapper.getChannel('size');
  assert.equal(cfg.transformType, 'log1p');
  assert.equal(typeof cfg.transform, 'function');

  const out = mapper.mapItem({ attributes: { x: 9 } });
  assert.ok(Number.isFinite(out.size));
});

test('power transform uses transformPower', () => {
  const mapper = new Mapper({ mode: 'node' });

  mapper.setChannel('size', {
    attributes: 'x',
    type: 'linear',
    transformType: 'power',
    transformPower: 2,
    domain: [0, 100],
    range: [0, 1],
    defaultValue: 0,
  });

  const out = mapper.mapItem({ attributes: { x: 3 } });
  assert.ok(Number.isFinite(out.size));
});
