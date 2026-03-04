import test from 'node:test';
import assert from 'node:assert/strict';
import { HeliosFilter } from '../src/filters/HeliosFilter.js';

test('HeliosFilter compiles multi-rule node/edge queries', () => {
  const filter = new HeliosFilter({ scope: 'render+layout' });
  filter.addRule({
    id: 'node-range',
    scope: 'node',
    type: 'numeric',
    attribute: 'weight',
    min: 0.2,
    max: 0.7,
    extentMin: 0,
    extentMax: 1,
  });
  filter.addRule({
    id: 'node-string',
    scope: 'node',
    type: 'string',
    attribute: 'label',
    operator: 'starts_with',
    value: 'node-1',
  });
  filter.addRule({
    id: 'node-category',
    scope: 'node',
    type: 'categorical',
    attribute: 'category',
    values: ['category1', 'category2'],
  });
  filter.addRule({
    id: 'edge-query',
    scope: 'edge',
    type: 'query',
    query: 'intensity >= 0.5',
  });

  const options = filter.toGraphFilterOptions();
  assert.equal(options.scope, 'render+layout');
  assert.match(options.nodeQuery, /weight >= 0\.2/);
  assert.match(options.nodeQuery, /label =~ "\^node-1\.\*"/);
  assert.match(options.nodeQuery, /category IN \("category1", "category2"\)/);
  assert.equal(options.edgeQuery, 'intensity >= 0.5');
  assert.equal(filter.hasCriteria(), true);
});

test('HeliosFilter enforces one rule per attribute and one raw query per scope', () => {
  const filter = new HeliosFilter();
  filter.addRule({ scope: 'node', type: 'string', attribute: 'label', value: 'x' });
  assert.throws(
    () => filter.addRule({ scope: 'node', type: 'string', attribute: 'label', value: 'y' }),
    /Only one filter is allowed per attribute/,
  );

  filter.addRule({ scope: 'edge', type: 'query', query: 'intensity > 0.5' });
  assert.throws(
    () => filter.addRule({ scope: 'edge', type: 'query', query: 'intensity < 0.2' }),
    /Only one query filter is allowed/,
  );
});

test('HeliosFilter ignores empty/full-range rules when compiling', () => {
  const filter = new HeliosFilter();
  filter.addRule({
    scope: 'node',
    type: 'numeric',
    attribute: 'weight',
    min: 0,
    max: 1,
    extentMin: 0,
    extentMax: 1,
  });
  filter.addRule({
    scope: 'node',
    type: 'string',
    attribute: 'label',
    value: '   ',
  });

  const options = filter.toGraphFilterOptions();
  assert.equal(options.nodeQuery, undefined);
  assert.equal(filter.hasCriteria(), false);
});
