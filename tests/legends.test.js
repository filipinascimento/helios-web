import test from 'node:test';
import assert from 'node:assert/strict';
import { SvgLegendController, deriveLegendItems, layoutLegendItems, scalarSampleValues } from '../src/legends/SvgLegendController.js';

test('deriveLegendItems includes node color and density legends, and suppresses node-derived edge colors', () => {
  const nodeChannels = new Map([
    ['color', {
      type: 'colormap',
      attributes: 'weight',
      colormap: 'interpolateInferno',
      domain: [0, 1],
    }],
    ['size', {
      type: 'linear',
      attributes: 'score',
      domain: [0, 10],
      range: [1, 6],
    }],
  ]);
  const edgeChannels = new Map([
    ['color', {
      type: 'categorical',
      attributes: 'category',
      domain: ['a', 'b'],
      range: ['#ff0000', '#00ff00'],
    }],
    ['width', {
      type: 'linear',
      attributes: 'weight',
      domain: [0, 4],
      range: [1, 5],
    }],
  ]);

  const items = deriveLegendItems({
    nodeChannels,
    edgeChannels,
    densityConfig: {
      enabled: true,
      property: 'weight',
      compareProperty: 'baseline',
      colormap: 'interpolateInferno',
      divergingColormap: 'interpolateRdBu',
    },
    densityRuntime: { diverging: true },
    visualConfig: {
      edge: {
        color: { source: 'node' },
      },
    },
    config: {
      showNodeColor: true,
      showDensity: true,
      showEdgeColor: true,
      showNodeSize: true,
      showEdgeWidth: true,
    },
  });

  assert.deepEqual(items.map((item) => item.kind), ['nodeColor', 'nodeSize', 'edgeWidth', 'density']);
  assert.equal(items.find((item) => item.kind === 'density')?.tickLabels?.join('|'), 'baseline|0|weight');
});

test('deriveLegendItems uses a real numeric domain for log-ratio density legends', () => {
  const items = deriveLegendItems({
    nodeChannels: new Map(),
    edgeChannels: new Map(),
    densityConfig: {
      enabled: true,
      property: 'signal',
      compareProperty: 'baseline',
      comparisonMode: 'logRatio',
      logRatioRange: 2.5,
      colormap: 'interpolateInferno',
      divergingColormap: 'interpolateRdBu',
    },
    densityRuntime: {
      diverging: true,
      valueDomain: [-2.5, 2.5],
    },
    visualConfig: null,
    config: { showDensity: true },
  });

  const densityLegend = items.find((item) => item.kind === 'density');
  assert.ok(densityLegend);
  assert.equal(densityLegend.title, 'signal log ratio vs baseline');
  assert.deepEqual(densityLegend.domain, [-2.5, 2.5]);
  assert.deepEqual(densityLegend.ticks, [-2.5, 0, 2.5]);
  assert.deepEqual(densityLegend.tickLabels, ['-3', '0', '3']);
});

test('deriveLegendItems keeps the difference diverging colormap for difference density legends', () => {
  const items = deriveLegendItems({
    nodeChannels: new Map(),
    edgeChannels: new Map(),
    densityConfig: {
      enabled: true,
      property: 'signal',
      compareProperty: 'baseline',
      comparisonMode: 'difference',
      colormap: 'interpolateViridis',
      divergingColormap: 'interpolateRdBu',
    },
    densityRuntime: {
      diverging: true,
      valueDomain: null,
    },
    visualConfig: null,
    config: { showDensity: true },
  });

  const densityLegend = items.find((item) => item.kind === 'density');
  assert.ok(densityLegend);
  assert.equal(densityLegend.colormap, 'interpolateRdBu');
});

test('deriveLegendItems formats continuous tick labels without malformed zero/exponent output', () => {
  const items = deriveLegendItems({
    nodeChannels: new Map([
      ['color', {
        type: 'colormap',
        attributes: 'delta_score',
        colormap: 'interpolateInferno',
        domain: [0, 0.00024],
      }],
    ]),
    edgeChannels: new Map(),
    densityConfig: null,
    densityRuntime: null,
    visualConfig: null,
    config: { showNodeColor: true },
  });

  const nodeLegend = items.find((item) => item.kind === 'nodeColor');
  assert.ok(nodeLegend);
  assert.ok(nodeLegend.ticks.length >= 3);
  assert.equal(nodeLegend.ticks[0], 0);
  assert.equal(nodeLegend.tickLabels[0], '0');
  assert.ok(!nodeLegend.tickLabels.some((label) => label.includes('0.e')));
});

test('deriveLegendItems resolves categorical legend labels from the network dictionary', () => {
  const items = deriveLegendItems({
    nodeChannels: new Map([
      ['color', {
        type: 'categorical',
        attributes: 'category',
        domain: [0, 1, 2],
        range: ['#ff0000', '#00ff00', '#0000ff'],
      }],
    ]),
    edgeChannels: new Map(),
    densityConfig: null,
    densityRuntime: null,
    visualConfig: null,
    config: { showNodeColor: true },
    network: {
      getNodeAttributeCategoryDictionary(name) {
        assert.equal(name, 'category');
        return {
          entries: [
            { id: 0, label: 'alpha' },
            { id: 1, label: 'beta' },
            { id: 2, label: 'gamma' },
          ],
        };
      },
    },
  });

  const nodeLegend = items.find((item) => item.kind === 'nodeColor');
  assert.ok(nodeLegend);
  assert.deepEqual(nodeLegend.entries.map((entry) => entry.label), ['alpha', 'beta', 'gamma']);
});

test('deriveLegendItems appends gray Others entry for categorical fallbacks', () => {
  const items = deriveLegendItems({
    nodeChannels: new Map([
      ['color', {
        type: 'categorical',
        attributes: 'category',
        domain: [0, 1],
        range: ['#ff0000', '#00ff00'],
        defaultValue: '#888888ff',
      }],
    ]),
    edgeChannels: new Map(),
    densityConfig: null,
    densityRuntime: null,
    visualConfig: null,
    config: { showNodeColor: true },
    network: {
      getNodeAttributeCategoryDictionary(name) {
        assert.equal(name, 'category');
        return {
          entries: [
            { id: 0, label: 'alpha' },
            { id: 1, label: 'beta' },
            { id: 2, label: 'gamma' },
          ],
        };
      },
    },
  });

  const nodeLegend = items.find((item) => item.kind === 'nodeColor');
  assert.ok(nodeLegend);
  assert.deepEqual(
    nodeLegend.entries.map((entry) => ({ label: entry.label, color: entry.color })),
    [
      { label: 'alpha', color: '#ff0000' },
      { label: 'beta', color: '#00ff00' },
      { label: 'Other', color: '#888888ff' },
    ],
  );
});

test('deriveLegendItems allows legend titles to be overridden or removed', () => {
  const items = deriveLegendItems({
    nodeChannels: new Map([
      ['color', {
        type: 'categorical',
        attributes: 'category',
        domain: [0],
        range: ['#ff0000'],
      }],
    ]),
    edgeChannels: new Map(),
    densityConfig: null,
    densityRuntime: null,
    visualConfig: null,
    config: {
      showNodeColor: true,
      titles: {
        nodeColor: null,
      },
    },
    network: {
      getNodeAttributeCategoryDictionary() {
        return { entries: [{ id: 0, label: 'alpha' }] };
      },
    },
  });

  const nodeLegend = items.find((item) => item.kind === 'nodeColor');
  assert.ok(nodeLegend);
  assert.equal(nodeLegend.title, '');
});

test('deriveLegendItems makes node size legends zoom-aware in 2D orthographic mode', () => {
  const items = deriveLegendItems({
    nodeChannels: new Map([
      ['size', {
        type: 'linear',
        attributes: 'weight',
        domain: [0, 10],
        range: [2, 8],
      }],
    ]),
    edgeChannels: new Map(),
    densityConfig: null,
    densityRuntime: null,
    visualConfig: null,
    config: { showNodeSize: true, zoomAwareSizeIn2D: true },
    legendRuntime: {
      enabled: true,
      mode: '2d',
      projection: 'orthographic',
      zoom: 2,
      distance: 100,
      viewportHeight: 600,
      nodeSizeBase: 1,
      nodeSizeScale: 1.5,
      semanticZoomExponent: 0,
    },
  });

  const sizeLegend = items.find((item) => item.kind === 'nodeSize');
  assert.ok(sizeLegend?.preview);
  assert.deepEqual(sizeLegend.preview.apparentRange, [24, 78]);
});

test('SvgLegendController reverses continuous legend contrast on light backgrounds', () => {
  const controller = new SvgLegendController({
    background: () => [0.9, 0.9, 0.9, 1],
  });
  const theme = controller._theme();

  assert.equal(theme.text, 'rgba(16, 20, 28, 0.96)');
  assert.equal(theme.textOutline, 'rgba(255, 255, 255, 0.96)');
  assert.equal(theme.barOuterStroke, 'rgba(255, 255, 255, 0.98)');
  assert.equal(theme.barInnerStroke, 'rgba(16, 20, 28, 0.96)');
  assert.equal(theme.tickOutline, 'rgba(255, 255, 255, 0.96)');
});

test('scalarSampleValues omits the zero minimum for line legends', () => {
  assert.deepEqual(
    scalarSampleValues([0, 28598], 3, { omitZeroMin: true }),
    [14299, 28598],
  );
  assert.deepEqual(
    scalarSampleValues([0, 28598], 2, { omitZeroMin: true }),
    [14299, 28598],
  );
  assert.deepEqual(
    scalarSampleValues([0.1, 1], 2, { omitZeroMin: true, readableMinRatio: 0.2 }),
    [0.5, 1],
  );
});

test('layoutLegendItems keeps auto-placed legends inside the safe rect', () => {
  const positioned = layoutLegendItems([
    {
      kind: 'nodeColor',
      legendType: 'continuous',
      title: 'weight',
      colormap: 'interpolateInferno',
      domain: [0, 1],
      ticks: [0, 1],
      tickLabels: ['0', '1'],
    },
    {
      kind: 'density',
      legendType: 'continuous',
      title: 'Density',
      colormap: 'interpolateInferno',
      domain: [0, 1],
      ticks: [0, 1],
      tickLabels: ['0', '+'],
    },
  ], {
    x: 280,
    y: 0,
    width: 720,
    height: 640,
  }, {
    margin: 12,
    gap: 12,
    maxChars: 24,
    maxRows: 2,
    fontSize: 12,
    placements: {
      nodeColor: 'auto',
      density: 'auto',
    },
  });

  const nodeColor = positioned.find((item) => item.kind === 'nodeColor');
  const density = positioned.find((item) => item.kind === 'density');
  assert.ok(nodeColor);
  assert.ok(density);
  assert.ok(nodeColor.x >= 292);
  assert.ok(density.x + density.box.width <= 1000 - 12);
});
