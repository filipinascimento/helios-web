import { test, expect } from '@playwright/test';
import {
  Mapper,
  createDefaultMappers,
} from '../src/pipeline/Mapper.js';
import { DEFAULT_NODE_SIZE } from '../src/pipeline/constants.js';

test('maps linear channel with rule override', () => {
  const mapper = new Mapper({ mode: 'node' });
  mapper
    .channel('size')
    .from(['degree', 'clustering'])
    .transform(({ degree, clustering }) => degree + clustering)
    .linear([0, 10], [0, 20])
    .default(2)
    .rule({
      attributes: ['betweenness'],
      when: (inputs) => {
        const value = typeof inputs === 'number' ? inputs : inputs?.betweenness;
        return (value ?? 0) > 5;
      },
      type: 'linear',
      domain: [0, 10],
      range: [10, 30],
      defaultValue: 10,
    })
    .done();

  const base = mapper.mapItem({ attributes: { degree: 2, clustering: 3 } });
  expect(base.size).toBeCloseTo(10);

  const overridden = mapper.mapItem({ attributes: { degree: 2, clustering: 3, betweenness: 8 } });
  expect(overridden.size).toBeGreaterThan(20);
});

test('categorical mapping works via config object', () => {
  const mapper = new Mapper({ mode: 'node' });
  mapper.setChannel('color', {
    attributes: 'community',
    type: 'categorical',
    domain: ['A', 'B'],
    range: ['red', 'blue'],
    defaultValue: 'gray',
  });

  const a = mapper.mapItem({ attributes: { community: 'A' } });
  expect(a.color).toBe('red');

  const fallback = mapper.mapItem({ attributes: { community: 'C' } });
  expect(fallback.color).toBe('gray');
});

test('nodeToEdge passthrough returns endpoint values', () => {
  const edgeMapper = new Mapper({ mode: 'edge' });
  edgeMapper.channel('color').from('@node.community').nodeToEdge().done();

  const mapped = edgeMapper.mapItem({
    source: { attributes: { community: 'A' } },
    target: { attributes: { community: 'B' } },
  });
  expect(mapped.color).toEqual({ source: 'A', target: 'B' });
});

test('default mappers expose sensible defaults', () => {
  const { nodeMapper, edgeMapper } = createDefaultMappers();
  const node = nodeMapper.mapItem({ attributes: {} }, { index: 3 });
  expect(node.size).toBe(DEFAULT_NODE_SIZE);
  expect(node.outline).toBeGreaterThan(0);
  expect(node.color).toBeTruthy();

  const edge = edgeMapper.mapItem({
    source: { attributes: { color: '#111111' } },
    target: { attributes: { color: '#222222' } },
  });
  expect(edge.width).toBe(1);
  expect(edge.color).toEqual({ source: '#111111', target: '#222222' });
});
