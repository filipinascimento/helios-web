import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork from 'helios-network';
import { VisualAttributes } from '../src/pipeline/VisualAttributes.js';
import { Mapper } from '../src/pipeline/Mapper.js';
import { createColormapScale } from '../src/colors/colormaps.js';
import { NODE_COLOR_ATTRIBUTE } from '../src/pipeline/constants.js';

const SUSPECT_NODE_IDS = [
  18435,
  19220,
  19219,
  18405,
  18376,
  18493,
  19357,
  19385,
  19356,
  18574,
  18635,
  18669,
  19398,
  18475,
  19082,
  18329,
];

function maxAbsDiff(a, b) {
  return Math.max(
    Math.abs((a[0] ?? 0) - (b[0] ?? 0)),
    Math.abs((a[1] ?? 0) - (b[1] ?? 0)),
    Math.abs((a[2] ?? 0) - (b[2] ?? 0)),
    Math.abs((a[3] ?? 0) - (b[3] ?? 0)),
  );
}

test('colormap CET_R1-BalancedRainbow does not produce near-black for reported indices (20k nodes)', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  network.addNodes(20000);
  const visuals = new VisualAttributes(network);

  const domain = [0, 19999];
  const expectedScale = createColormapScale('CET_R1-BalancedRainbow', { domain, alpha: 1, clamp: true });

  const nodeMapper = new Mapper({ mode: 'node', network });
  nodeMapper.channel('color').from('$index').colormap('CET_R1-BalancedRainbow', { domain, alpha: 1, clamp: true }).done();
  visuals.applyMappers({ nodeMapper, edgeMapper: null });

  network.withBufferAccess(() => {
    const colors = network.getNodeAttributeBuffer(NODE_COLOR_ATTRIBUTE).view;
    for (const nodeId of SUSPECT_NODE_IDS) {
      const offset = nodeId * 4;
      const actual = [colors[offset], colors[offset + 1], colors[offset + 2], colors[offset + 3]];
      const expected = expectedScale(nodeId);
      const diff = maxAbsDiff(actual, expected);
      const luminance = actual[0] * 0.2126 + actual[1] * 0.7152 + actual[2] * 0.0722;

      assert.ok(actual.every((v) => Number.isFinite(v) && v >= 0 && v <= 1), `invalid rgba for node ${nodeId}: ${actual}`);
      assert.ok(luminance > 0.03, `near-black luminance for node ${nodeId}: ${actual}`);
      assert.ok(diff < 1e-6, `unexpected colormap mismatch for node ${nodeId}: diff=${diff}`);
    }
  });
});

test('colormap CET_R1-BalancedRainbow is smooth between adjacent indices near 18.5k (domain 0..19999)', async () => {
  const domain = [0, 19999];
  const scale = createColormapScale('CET_R1-BalancedRainbow', { domain, alpha: 1, clamp: true });
  const a = scale(18493);
  const b = scale(18494);
  const diff = maxAbsDiff(a, b);
  assert.ok(diff < 1e-3, `expected adjacent indices to be very close; diff=${diff}`);
});
