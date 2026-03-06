import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { Mapper } from '../src/pipeline/Mapper.js';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
import { createColormapScale } from '../src/colors/colormaps.js';
import { NODE_COLOR_ATTRIBUTE, NODE_SIZE_ATTRIBUTE } from '../src/pipeline/constants.js';

function approxEqualArray(a, b, eps = 1e-6) {
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i += 1) {
    assert.ok(Math.abs(a[i] - b[i]) <= eps, `index ${i}: ${a[i]} vs ${b[i]}`);
  }
}

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

test('percentile transform ranks values across the network', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  network.defineNodeAttribute('value', AttributeType.Float);
  network.addNodes(4);
  network.withBufferAccess(() => {
    const values = network.getNodeAttributeBuffer('value').view;
    values[0] = 10;
    values[1] = 20;
    values[2] = 30;
    values[3] = 40;
  });

  const visuals = new VisualAttributes(network);
  const mapper = new Mapper({ mode: 'node', network });
  mapper.setChannel('size', {
    attributes: 'value',
    type: 'linear',
    transformType: 'percentile',
    domain: [0, 1],
    range: [0, 1],
    defaultValue: 0,
  });

  visuals.applyMappers({ nodeMapper: mapper, edgeMapper: null });
  let sizes = null;
  network.withBufferAccess(() => {
    sizes = Array.from(network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE).view.slice(0, 4));
  });
  approxEqualArray(sizes, [0, 1 / 3, 2 / 3, 1], 1e-4);
});

test('colormap clamp supports one-sided limits with defaults', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  network.defineNodeAttribute('value', AttributeType.Float);
  network.addNodes(3);
  network.withBufferAccess(() => {
    const values = network.getNodeAttributeBuffer('value').view;
    values[0] = -1;
    values[1] = 0.5;
    values[2] = 2;
  });

  const visuals = new VisualAttributes(network);
  const mapper = new Mapper({ mode: 'node', network });
  mapper.setChannel('color', {
    attributes: 'value',
    type: 'colormap',
    colormap: 'interpolateInferno',
    domain: [0, 1],
    alpha: 1,
    clamp: { min: true, max: false },
    defaultValue: '#00ff00ff',
  });

  visuals.applyMappers({ nodeMapper: mapper, edgeMapper: null });
  let colors = null;
  network.withBufferAccess(() => {
    colors = Array.from(network.getNodeAttributeBuffer(NODE_COLOR_ATTRIBUTE).view.slice(0, 12));
  });
  const expectedMin = createColormapScale('interpolateInferno', { domain: [0, 1], alpha: 1, clamp: true })(0);
  const expectedDefault = visuals.toRgba('#00ff00ff');
  const node0 = colors.slice(0, 4);
  const node2 = colors.slice(8, 12);

  approxEqualArray(node0, expectedMin, 1e-6);
  approxEqualArray(node2, expectedDefault, 1e-6);
});
