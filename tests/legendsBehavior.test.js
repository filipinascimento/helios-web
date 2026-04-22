import test from 'node:test';
import assert from 'node:assert/strict';
import { LegendsBehavior } from '../src/behaviors/LegendsBehavior.js';

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = {
      id: 'network-1',
      getNodeAttributeCategoryDictionary(name) {
        if (name !== 'category') return null;
        return {
          entries: [
            { id: 0, label: 'alpha' },
            { id: 1, label: 'beta' },
          ],
        };
      },
    };
    this.nodeMapper = new Map([
      ['color', {
        type: 'categorical',
        attributes: 'category',
        domain: [0, 1],
        range: ['#ff0000', '#00ff00'],
      }],
    ]);
    this.edgeMapper = new Map();
    this._densityRuntime = null;
    this._legendApplyCount = 0;
    this._legendConfig = {
      enabled: true,
      respectDockInsets: true,
      showNodeColor: true,
      showDensity: true,
      showEdgeColor: true,
      showNodeSize: false,
      showEdgeWidth: false,
      maxChars: 24,
      maxRows: 2,
      scale: 1,
      continuousHeight: 132,
      titles: {},
      placements: {},
    };
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  density() {
    return null;
  }

  mode() {
    return '2d';
  }

  background() {
    return [0, 0, 0, 1];
  }

  nodeSizeBase() {
    return 1;
  }

  nodeSizeScale() {
    return 1;
  }

  semanticZoomExponent() {
    return 0;
  }

  _getLegendsControllerConfig() {
    return {
      ...this._legendConfig,
      titles: { ...this._legendConfig.titles },
      placements: { ...this._legendConfig.placements },
    };
  }

  _applyLegendsControllerConfig(options) {
    this._legendApplyCount += 1;
    this._legendConfig = {
      ...this._legendConfig,
      ...options,
      titles: {
        ...this._legendConfig.titles,
        ...(options?.titles ?? {}),
      },
      placements: {
        ...this._legendConfig.placements,
        ...(options?.placements ?? {}),
      },
    };
    return this;
  }

  _getLegendItems({ config } = {}) {
    const effective = {
      ...this._legendConfig,
      ...(config ?? {}),
    };
    const items = [];
    if (effective.showNodeColor !== false) {
      items.push({ kind: 'nodeColor', title: effective.titles?.nodeColor ?? 'category' });
    }
    if (effective.showDensity !== false) {
      items.push({ kind: 'density', title: effective.titles?.density ?? 'density' });
    }
    return items;
  }
}

function createContext(helios, behaviors) {
  return {
    helios,
    get network() {
      return helios.network;
    },
    subscribe(target, eventName, handler, optionsArg) {
      if (typeof target?.on === 'function') return target.on(eventName, handler, optionsArg);
      target?.addEventListener?.(eventName, handler, optionsArg);
      return () => target?.removeEventListener?.(eventName, handler, optionsArg);
    },
    getBehavior(id) {
      return behaviors.get(id) ?? null;
    },
  };
}

test('legends behavior owns legend config updates and public commands', () => {
  const helios = new MockHelios();
  const legends = new LegendsBehavior();
  const behaviors = new Map([['legends', legends]]);
  legends.attach(createContext(helios, behaviors));

  legends.enabled(false);
  legends.update({
    enabled: true,
    showNodeSize: true,
    scale: 1.8,
    titles: { nodeColor: 'Clusters' },
    placements: { density: 'top-right' },
  });

  assert.equal(legends.enabled(), true);
  assert.equal(legends.state.showNodeSize, true);
  assert.equal(legends.state.scale, 1.8);
  assert.equal(legends.state.titles.nodeColor, 'Clusters');
  assert.equal(legends.state.placements.density, 'top-right');
  assert.equal(helios._legendConfig.showNodeSize, true);
  assert.equal(helios._legendConfig.scale, 1.8);
  assert.equal(helios._legendConfig.titles.nodeColor, 'Clusters');
});

test('legends behavior reads mapper-driven legend content through shared helios context', () => {
  const helios = new MockHelios();
  const legends = new LegendsBehavior({ titles: { nodeColor: 'Node Categories' } });
  const behaviors = new Map([['legends', legends]]);
  legends.attach(createContext(helios, behaviors));

  const items = legends.getLegendItems();

  assert.deepEqual(items.map((item) => item.kind), ['nodeColor', 'density']);
  assert.equal(items[0].title, 'Node Categories');
});

test('legends behavior serializes and restores stable config', () => {
  const helios = new MockHelios();
  const legends = new LegendsBehavior();
  const behaviors = new Map([['legends', legends]]);
  legends.attach(createContext(helios, behaviors));

  legends.update({
    showEdgeWidth: true,
    maxChars: 31,
    titles: { density: 'Signal' },
    placements: { edgeWidth: { x: 24, y: 48 } },
  });
  const snapshot = legends.serialize();

  const restoredHelios = new MockHelios();
  const restored = new LegendsBehavior();
  const restoredBehaviors = new Map([['legends', restored]]);
  restored.attach(createContext(restoredHelios, restoredBehaviors));
  restored.restore(snapshot);

  assert.equal(restored.state.showEdgeWidth, true);
  assert.equal(restored.state.maxChars, 31);
  assert.equal(restored.state.titles.density, 'Signal');
  assert.deepEqual(restored.state.placements.edgeWidth, { x: 24, y: 48 });
  assert.equal(restoredHelios._legendConfig.showEdgeWidth, true);
});
