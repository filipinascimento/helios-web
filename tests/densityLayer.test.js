import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DensityLayer,
  resolveDensityBandwidthViewport,
  resolveLogRatioSupportWindow,
} from '../src/rendering/engine/DensityLayer.js';

test('resolveDensityBandwidthViewport prefers the logical figure viewport over the raster target size', () => {
  const resolved = resolveDensityBandwidthViewport(
    {
      target: {
        exportFigureLogicalViewport: { width: 1200, height: 800 },
      },
    },
    {
      viewport: { width: 900, height: 600 },
    },
    4800,
    3200,
  );

  assert.deepEqual(resolved, { width: 1200, height: 800 });
});

test('resolveDensityBandwidthViewport falls back to the camera viewport in normal rendering', () => {
  const resolved = resolveDensityBandwidthViewport(
    null,
    {
      viewport: { width: 900, height: 600 },
    },
    1800,
    1200,
  );

  assert.deepEqual(resolved, { width: 900, height: 600 });
});

test('resolveLogRatioSupportWindow keeps supported regions raw and only corrects the epsilon-scale tail', () => {
  assert.deepEqual(resolveLogRatioSupportWindow(1e-6, 0), {
    floor: 128e-6,
    ceil: 512e-6,
  });
  assert.deepEqual(resolveLogRatioSupportWindow(1e-6, 1e-3), {
    floor: 1e-3,
    ceil: 2e-3,
  });
  assert.deepEqual(resolveLogRatioSupportWindow(1e-6, 1e-3, false), {
    floor: 0,
    ceil: 0,
  });
});

test('DensityLayer keeps difference mode normalization behavior intact', () => {
  const layer = new DensityLayer();
  const network = {
    nodeCount: 3,
    nodeIndices: new Uint32Array([0, 1, 2]),
    getNodeAttributeBuffer(name) {
      if (name === 'weight') return { view: new Float32Array([1, 2, 3]), dimension: 1 };
      return null;
    },
  };

  layer.setConfig({ comparisonMode: 'difference', property: 'weight', compareProperty: 'None' });
  const computed = layer.computeWeightsUnsafe(network, layer.config);

  assert.equal(computed.mode, 'difference');
  assert.equal(computed.diverging, false);
  assert.deepEqual(
    Array.from(computed.weights).map((value) => Number(value.toFixed(6))),
    [1 / 6, 2 / 6, 3 / 6].map((value) => Number(value.toFixed(6))),
  );
});

test('DensityLayer builds normalized numerator and denominator weights for log-ratio mode', () => {
  const layer = new DensityLayer();
  const network = {
    nodeCount: 3,
    nodeIndices: new Uint32Array([0, 1, 2]),
    getNodeAttributeBuffer(name) {
      if (name === 'signal') return { view: new Float32Array([2, 0, 2]), dimension: 1 };
      if (name === 'baseline') return { view: new Float32Array([1, 3, 0]), dimension: 1 };
      return null;
    },
  };

  layer.setConfig({
    comparisonMode: 'logRatio',
    property: 'signal',
    compareProperty: 'baseline',
    logRatioRange: 2.5,
  });
  const computed = layer.computeWeightsUnsafe(network, layer.config);

  assert.equal(computed.mode, 'logRatio');
  assert.equal(computed.diverging, true);
  assert.deepEqual(computed.valueDomain, [-2.5, 2.5]);
  assert.equal(computed.baselineLabel, 'baseline');
  assert.deepEqual(
    Array.from(computed.numeratorWeights).map((value) => Number(value.toFixed(6))),
    [0.5, 0, 0.5],
  );
  assert.deepEqual(
    Array.from(computed.denominatorWeights).map((value) => Number(value.toFixed(6))),
    [0.25, 0.75, 0],
  );
});

test('DensityLayer coerces log-ratio back to difference when no compare property is set', () => {
  const layer = new DensityLayer();
  const network = {
    nodeCount: 2,
    nodeIndices: new Uint32Array([0, 1]),
    getNodeAttributeBuffer(name) {
      if (name === 'weight') return { view: new Float32Array([1, 3]), dimension: 1 };
      return null;
    },
  };

  layer.setConfig({
    comparisonMode: 'logRatio',
    property: 'weight',
    compareProperty: 'None',
    logRatioRange: 3,
  });
  const computed = layer.computeWeightsUnsafe(network, layer.config);

  assert.equal(layer.config.comparisonMode, 'difference');
  assert.equal(computed.mode, 'difference');
  assert.deepEqual(
    Array.from(computed.weights).map((value) => Number(value.toFixed(6))),
    [0.25, 0.75],
  );
});

test('DensityLayer clears compareProperty when it matches the primary property', () => {
  const layer = new DensityLayer();
  layer.setConfig({
    property: 'Degree',
    compareProperty: 'Degree',
    comparisonMode: 'logRatio',
  });

  assert.equal(layer.config.compareProperty, 'None');
  assert.equal(layer.config.comparisonMode, 'difference');
});

test('DensityLayer accepts an explicit switch from log-ratio back to difference', () => {
  const layer = new DensityLayer();

  layer.setConfig({
    property: 'Degree',
    compareProperty: 'Uniform',
    comparisonMode: 'logRatio',
  });
  assert.equal(layer.config.comparisonMode, 'logRatio');

  layer.setConfig({ comparisonMode: 'difference' });
  assert.equal(layer.config.comparisonMode, 'difference');
  assert.deepEqual(layer.runtime.valueDomain, null);
});

test('DensityLayer preserves an explicit log-ratio support correction toggle', () => {
  const layer = new DensityLayer();

  layer.setConfig({
    property: 'Degree',
    compareProperty: 'Uniform',
    comparisonMode: 'logRatio',
    logRatioSupportCorrection: false,
  });

  assert.equal(layer.config.logRatioSupportCorrection, false);
});

test('DensityLayer difference mode keeps using the sequential colormap key', () => {
  const layer = new DensityLayer();
  const network = {
    nodeCount: 2,
    nodeIndices: new Uint32Array([0, 1]),
    getNodeAttributeBuffer(name) {
      if (name === 'signal') return { view: new Float32Array([0, 1]), dimension: 1 };
      if (name === 'baseline') return { view: new Float32Array([1, 0]), dimension: 1 };
      return null;
    },
  };

  layer.setConfig({
    property: 'signal',
    compareProperty: 'baseline',
    comparisonMode: 'difference',
    colormap: 'interpolateViridis',
    divergingColormap: 'interpolateRdBu',
  });
  const computed = layer.computeWeightsUnsafe(network, layer.config);

  assert.equal(computed.mode, 'difference');
  assert.equal(computed.diverging, true);
  assert.equal(computed.colormapKey, 'interpolateRdBu');
});
