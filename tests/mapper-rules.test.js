import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
import { Mapper } from '../src/pipeline/Mapper.js';
import { NODE_COLOR_ATTRIBUTE, NODE_SIZE_ATTRIBUTE } from '../src/pipeline/constants.js';

function approxEqualArray(a, b, eps = 1e-6) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 1) {
    assert.ok(Math.abs(a[i] - b[i]) <= eps, `index ${i}: ${a[i]} vs ${b[i]}`);
  }
}

test('mapper rules can override colormap output (e.g. -1 -> gray)', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  network.defineNodeAttribute('value', AttributeType.Float);
  network.addNodes(3);

  network.withBufferAccess(() => {
    const v = network.getNodeAttributeBuffer('value').view;
    v[0] = -1;
    v[1] = 0;
    v[2] = 1;
  });

  const visuals = new VisualAttributes(network);
  const nodeMapper = new Mapper({ mode: 'node', network });

  const spec = { op: 'eq', rhs: -1, out: '#808080ff' };
  nodeMapper
    .channel('color')
    .from('value')
    .colormap('interpolateInferno', { domain: [0, 1], alpha: 1, clamp: true })
    .rule({
      __ui: spec,
      when: (inputs) => Number(inputs) === -1,
      value: spec.out,
    })
    .done();

  visuals.applyMappers({ nodeMapper, edgeMapper: null });

  const colors = network.getNodeAttributeBuffer(NODE_COLOR_ATTRIBUTE).view;
  const c0 = [colors[0], colors[1], colors[2], colors[3]];
  approxEqualArray(c0, [128 / 255, 128 / 255, 128 / 255, 1]);
});

test('mapper rules can override linear output (e.g. -1 -> 0)', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  network.defineNodeAttribute('value', AttributeType.Float);
  network.addNodes(3);

  network.withBufferAccess(() => {
    const v = network.getNodeAttributeBuffer('value').view;
    v[0] = -1;
    v[1] = 0;
    v[2] = 1;
  });

  const visuals = new VisualAttributes(network);
  const nodeMapper = new Mapper({ mode: 'node', network });

  const spec = { op: 'eq', rhs: -1, out: 0 };
  nodeMapper
    .channel('size')
    .from('value')
    .linear([0, 1], [1, 2])
    .rule({
      __ui: spec,
      when: (inputs) => Number(inputs) === -1,
      value: spec.out,
    })
    .done();

  visuals.applyMappers({ nodeMapper, edgeMapper: null });

  const sizes = network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE).view;
  assert.equal(sizes[0], 0);
  assert.equal(sizes[1], 1);
  assert.equal(sizes[2], 2);
});

