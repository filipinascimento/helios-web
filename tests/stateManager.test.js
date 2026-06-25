import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HeliosStateManager,
} from '../src/state/index.js';

test('HeliosStateManager tracks overrides independently from value equality', () => {
  const states = new HeliosStateManager({ now: () => 1 });
  states.register(null, 'appearance.nodeStyle', {
    sizeScale: {
      default: 1,
      type: 'number',
    },
  });

  assert.equal(states.status('appearance.nodeStyle.sizeScale').state, 'default');
  states.set('appearance.nodeStyle.sizeScale', 1, { source: 'ui' });

  assert.equal(states.get('appearance.nodeStyle.sizeScale'), 1);
  assert.equal(states.status('appearance.nodeStyle.sizeScale').state, 'changed');
  assert.deepEqual(states.getOverrides({ aliases: false }), {
    'appearance.nodeStyle.sizeScale': 1,
  });
});

test('HeliosStateManager setDefault updates heuristic defaults without creating overrides', () => {
  const states = new HeliosStateManager();
  const owner = {
    value: 0,
    gravity(next) {
      if (next === undefined) return this.value;
      this.value = next;
      return this;
    },
  };
  states.register(owner, 'layout.parameters', {
    gravity: {
      default: 0.1,
      type: 'number',
    },
  });

  states.setDefault('layout.parameters.gravity', 0.25, { reason: 'network-size-heuristic' });

  assert.equal(owner.value, 0.25);
  assert.equal(states.get('layout.parameters.gravity'), 0.25);
  assert.equal(states.status('layout.parameters.gravity').state, 'default');
});

test('HeliosStateManager re-registers heuristic defaults without creating overrides', () => {
  const states = new HeliosStateManager();
  let gravity = 0.1;
  const owner = {
    gravity(next) {
      if (next === undefined) return gravity;
      gravity = next;
      return this;
    },
  };
  states.register(owner, 'layout.parameters', {
    gravity: { default: 0.1, type: 'number' },
  });

  gravity = 0.25;
  states.register(owner, 'layout.parameters', {
    gravity: { default: 0.25, type: 'number' },
  });

  assert.equal(states.get('layout.parameters.gravity'), 0.25);
  assert.equal(states.status('layout.parameters.gravity').state, 'default');
  assert.deepEqual(states.getOverrides(), {});

  states.set('layout.parameters.gravity', 0.5, { source: 'ui' });
  gravity = 0.3;
  states.register(owner, 'layout.parameters', {
    gravity: { default: 0.3, type: 'number' },
  });

  assert.equal(states.get('layout.parameters.gravity'), 0.5);
  assert.equal(states.status('layout.parameters.gravity').state, 'changed');
});

test('HeliosStateManager resetToDefault intentionally clears tracked overrides', () => {
  const states = new HeliosStateManager();
  states.register(null, 'appearance', {
    background: { default: '#000000ff', type: 'string' },
  });

  states.set('appearance.background', '#000000ff', { source: 'ui' });
  assert.equal(states.status('appearance.background').state, 'changed');

  states.resetToDefault('appearance.background');
  assert.equal(states.status('appearance.background').state, 'default');
  assert.deepEqual(states.getOverrides(), {});
});

test('HeliosStateManager infers d3-style getter/setter bindings from owner methods', () => {
  const states = new HeliosStateManager();
  const owner = {
    current: 1,
    nodeSizeScale(next) {
      if (next === undefined) return this.current;
      this.current = next;
      return this;
    },
  };
  states.register(owner, 'appearance.nodeStyle', {
    nodeSizeScale: {
      aliases: ['appearance.nodeStyle.sizeScale'],
      default: 1,
      type: 'number',
    },
  });

  states.set('appearance.nodeStyle.sizeScale', 1.75, { source: 'ui' });

  assert.equal(owner.current, 1.75);
  assert.equal(states.get('appearance.nodeStyle.nodeSizeScale'), 1.75);
  assert.equal(states.status('appearance.nodeStyle.sizeScale').state, 'changed');
});

test('HeliosStateManager transactions emit one coalesced transaction event', () => {
  const states = new HeliosStateManager();
  const transactions = [];
  states.register(null, 'filters.rules.byId.r1', {
    attribute: { default: null, type: 'string' },
    value: { default: null, type: 'string' },
  });
  states.addEventListener('transaction', (event) => transactions.push(event.detail));

  const result = states.transaction({ source: 'ui', reason: 'filter-edit' }, (tx) => {
    tx.set('filters.rules.byId.r1.attribute', 'group');
    tx.set('filters.rules.byId.r1.value', 'A');
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.keys, [
    'filters.rules.byId.r1.attribute',
    'filters.rules.byId.r1.value',
  ]);
  assert.equal(transactions.length, 1);
  assert.deepEqual(transactions[0].keys, result.keys);
  assert.equal(states.status('filters.rules.byId.r1').state, 'partial');
});

test('HeliosStateManager hot leaf writes notify only matching subscriptions and keep status indexed', () => {
  const states = new HeliosStateManager();
  states.register(null, 'appearance.nodeStyle', {
    sizeScale: { default: 1, type: 'number' },
    opacityScale: { default: 1, type: 'number' },
  });
  states.register(null, 'appearance.edgeStyle', {
    widthScale: { default: 1, type: 'number' },
  });
  states.register(null, 'layout.parameters', {
    gravity: { default: 0.5, type: 'number' },
  });

  let exact = 0;
  let prefix = 0;
  let unrelated = 0;
  states.subscribe('appearance.nodeStyle.sizeScale', () => { exact += 1; });
  states.subscribe('appearance.nodeStyle', () => { prefix += 1; });
  states.subscribe('layout', () => { unrelated += 1; });

  let matchingCalls = 0;
  const originalMatchingKeys = states._matchingKeys.bind(states);
  states._matchingKeys = (...args) => {
    matchingCalls += 1;
    return originalMatchingKeys(...args);
  };

  states.set('appearance.nodeStyle.sizeScale', 1.2, { source: 'ui' });
  states.set('appearance.nodeStyle.sizeScale', 1.3, { source: 'ui' });

  assert.equal(exact, 2);
  assert.equal(prefix, 2);
  assert.equal(unrelated, 0);
  assert.equal(states.status('appearance.nodeStyle.sizeScale').state, 'changed');
  assert.equal(states.status('appearance.nodeStyle').state, 'partial');
  assert.equal(matchingCalls, 0);
});

test('HeliosStateManager does not fan keyed writes out to broad empty subscriptions', () => {
  const states = new HeliosStateManager();
  states.register(null, 'appearance', {
    background: { default: '#000000ff', type: 'string' },
  });

  let globalCalls = 0;
  let exactCalls = 0;
  states.subscribe('', () => { globalCalls += 1; });
  states.subscribe('appearance.background', () => { exactCalls += 1; });

  states.set('appearance.background', '#ffffffff', { source: 'ui' });

  assert.equal(exactCalls, 1);
  assert.equal(globalCalls, 0);
});

test('HeliosStateManager indexed status includes cameraControls aliases under camera', () => {
  const states = new HeliosStateManager();

  states.set('cameraControls.autoFit', false, {
    source: 'program',
    reason: 'camera-control',
  });

  assert.equal(states.status('cameraControls.autoFit').state, 'changed');
  assert.equal(states.status('cameraControls').state, 'partial');
  assert.equal(states.status('camera').state, 'partial');
  assert.equal(states.status('camera.controls').state, 'partial');
});
