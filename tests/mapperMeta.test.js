import test from 'node:test';
import assert from 'node:assert/strict';
import { Mapper } from '../src/pipeline/Mapper.js';

test('Mapper preserves channel config meta for custom mappers', () => {
  const mapper = new Mapper({ mode: 'node' });

  const transform = (inputs) => inputs;

  mapper.setChannel('size', {
    attributes: 'degree',
    transform,
    meta: {
      name: 'My Custom Size',
      description: 'Non-roundtrippable mapper with a custom transform.',
      source: 'app/graph/mappers.js',
    },
  });

  const config = mapper.getChannel('size');
  assert.equal(typeof config.transform, 'function');
  assert.equal(config.transform, transform);
  assert.equal(config.meta?.name, 'My Custom Size');
  assert.equal(config.meta?.description, 'Non-roundtrippable mapper with a custom transform.');
  assert.equal(config.meta?.source, 'app/graph/mappers.js');
});
