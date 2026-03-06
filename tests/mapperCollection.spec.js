import { test, expect } from '@playwright/test';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { MapperCollection } from '../src/pipeline/Mapper.js';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';

test('MapperCollection channels receive attribute values', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 1 });
  const attr = 'weight';
  network.defineNodeAttribute(attr, AttributeType.Float, 1);
  const nodes = network.addNodes(3);
  let weights = null;
  network.withBufferAccess(() => {
    const view = network.getNodeAttributeBuffer(attr).view;
    view[nodes[0]] = 0.2;
    view[nodes[1]] = 0.6;
    view[nodes[2]] = 1.0;
    weights = Array.from(nodes, (id) => view[id]);
  });
  expect(weights[0]).toBeCloseTo(0.2);
  expect(weights[1]).toBeCloseTo(0.6);
  expect(weights[2]).toBeCloseTo(1.0);

  const visuals = new VisualAttributes(network);
  const captured = [];
  const collection = new MapperCollection('node', network, () => {});
  collection
    .channel('color')
    .from(attr)
    .transform((value) => {
      captured.push(value);
      return [value ?? 0, 0, 0, 1];
    })
    .done();

  expect([...collection.mappers.values()][0].channels.get('color').attributes).toBe(attr);
  const combined = collection.toCombinedMapper();
  expect([...combined.channels.values()].map((c) => c.attributes)).toContain(attr);
  const direct = combined.mapItem({ attributes: { [attr]: weights[0] } }, { index: nodes[0] });
  expect(direct.color).toBeTruthy();
  captured.length = 0;
  const mapped = nodes.map((id, index) => combined.mapItem({ attributes: { [attr]: weights[index] } }, { index: id }));
  expect(mapped.length).toBe(3);
  expect(captured[0]).toBeCloseTo(0.2);
  expect(captured[1]).toBeCloseTo(0.6);
  expect(captured[2]).toBeCloseTo(1.0);
});
