import test from 'node:test';
import assert from 'node:assert/strict';
import { MapperCollection } from '../src/pipeline/Mapper.js';
import { MappersBehavior } from '../src/behaviors/MappersBehavior.js';
import { LegendsBehavior } from '../src/behaviors/LegendsBehavior.js';

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = null;
    this.nodeMapper = new MapperCollection('node', null, () => this.emit('mappers:changed', {}));
    this.edgeMapper = new MapperCollection('edge', null, () => this.emit('mappers:changed', {}));
    this.nodeMapper.channel('color').constant('#ff0000ff').done();
    this.edgeMapper.channel('width').constant(1).done();
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  emit(type, detail) {
    const event = new Event(type);
    event.detail = detail;
    this.dispatchEvent(event);
  }

  _getLegendItems({ config } = {}) {
    const effective = config ?? {};
    const colorConfig = this.nodeMapper.defaultMapper.getChannel('color');
    return effective.showNodeColor === false
      ? []
      : [{ kind: 'nodeColor', title: colorConfig?.attributes ?? 'constant' }];
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

test('mappers behavior updates raw mapper collections and restores serializable state', () => {
  const helios = new MockHelios();
  const behavior = new MappersBehavior();
  const behaviors = new Map([['mappers', behavior]]);
  behavior.attach(createContext(helios, behaviors));

  const updated = behavior.setChannelConfig('node', 'color', {
    type: 'colormap',
    attributes: '$index',
    colormap: 'interpolateInferno',
    domain: [0, 4],
    alpha: 1,
    clamp: true,
    rules: [{
      __ui: { op: 'eq', rhs: -1, out: '#808080ff' },
      when: (inputs) => Number(inputs) === -1,
      value: '#808080ff',
    }],
  });

  assert.equal(updated, true);
  assert.equal(helios.nodeMapper.defaultMapper.getChannel('color').colormap, 'interpolateInferno');
  assert.equal(behavior.getSerializedChannelConfig('node', 'color').rules.length, 1);

  const snapshot = behavior.serialize();

  const restoredHelios = new MockHelios();
  const restored = new MappersBehavior();
  const restoredBehaviors = new Map([['mappers', restored]]);
  restored.attach(createContext(restoredHelios, restoredBehaviors));
  restored.restore(snapshot);

  const restoredConfig = restoredHelios.nodeMapper.defaultMapper.getChannel('color');
  assert.equal(restoredConfig.colormap, 'interpolateInferno');
  assert.deepEqual(restoredConfig.domain, [0, 4]);
  assert.equal(typeof restoredConfig.rules[0]?.when, 'function');
});

test('mappers behavior restores declarative transform configs after JSON round-trip', () => {
  const helios = new MockHelios();
  const behavior = new MappersBehavior();
  const behaviors = new Map([['mappers', behavior]]);
  behavior.attach(createContext(helios, behaviors));

  behavior.setChannelConfig('node', 'size', {
    type: 'linear',
    attributes: 'weight',
    transformType: 'power',
    transformPower: 0.5,
    domain: [0, 1],
    range: [2, 10],
  });

  const snapshot = JSON.parse(JSON.stringify(behavior.serialize()));
  const restoredHelios = new MockHelios();
  const restored = new MappersBehavior();
  restored.attach(createContext(restoredHelios, new Map([['mappers', restored]])));
  restored.restore(snapshot);

  const restoredConfig = restoredHelios.nodeMapper.defaultMapper.getChannel('size');
  assert.equal(restoredConfig.type, 'linear');
  assert.equal(restoredConfig.attributes, 'weight');
  assert.equal(restoredConfig.transformType, 'power');
  assert.equal(restoredConfig.transformPower, 0.5);
  assert.deepEqual(restoredConfig.domain, [0, 1]);
  assert.deepEqual(restoredConfig.range, [2, 10]);
  assert.equal(typeof restoredConfig.transform, 'function');
});

test('mappers behavior marks custom function configs unsupported and restores existing channel fallback', () => {
  const helios = new MockHelios();
  const behavior = new MappersBehavior();
  const behaviors = new Map([['mappers', behavior]]);
  behavior.attach(createContext(helios, behaviors));

  behavior.setChannelConfig('node', 'color', {
    attributes: 'weight',
    transform: (inputs) => (Number(inputs) > 0 ? '#ffffffff' : '#000000ff'),
    meta: {
      name: 'Custom color',
      source: 'test/custom-mapper.js',
    },
  });

  const snapshot = JSON.parse(JSON.stringify(behavior.serialize()));
  const serializedColor = snapshot.options.node.mappers.default.channels.color;
  assert.equal(serializedColor.unsupported, true);
  assert.equal(serializedColor.serializable, false);
  assert.equal(serializedColor.meta.name, 'Custom color');

  const restoredHelios = new MockHelios();
  const restored = new MappersBehavior();
  restored.attach(createContext(restoredHelios, new Map([['mappers', restored]])));
  restored.restore(snapshot);

  const restoredConfig = restoredHelios.nodeMapper.defaultMapper.getChannel('color');
  assert.equal(restoredConfig.type, 'constant');
  assert.equal(restoredConfig.value, '#ff0000ff');
  assert.equal(typeof restoredConfig.transform, 'undefined');
});

test('mappers behavior tracks direct raw mapper mutations without taking ownership away from raw helios', () => {
  const helios = new MockHelios();
  const behavior = new MappersBehavior();
  const behaviors = new Map([['mappers', behavior]]);
  behavior.attach(createContext(helios, behaviors));

  helios.nodeMapper.channel('size').linear([0, 1], [1, 8]).done();

  const snapshot = behavior.getSerializedChannelConfig('node', 'size');
  assert.equal(snapshot.type, 'linear');
  assert.deepEqual(snapshot.range, [1, 8]);
});

test('legends behavior continues reading mapper-driven content from shared raw helios state', () => {
  const helios = new MockHelios();
  const mappers = new MappersBehavior();
  const legends = new LegendsBehavior();
  const behaviors = new Map([
    ['mappers', mappers],
    ['legends', legends],
  ]);
  const context = createContext(helios, behaviors);
  mappers.attach(context);
  legends.attach(context);

  mappers.setChannelConfig('node', 'color', {
    type: 'categorical',
    attributes: 'category',
    domain: [0, 1],
    range: ['#ff0000ff', '#00ff00ff'],
  });

  const items = legends.getLegendItems();
  assert.deepEqual(items, [{ kind: 'nodeColor', title: 'category' }]);
});
