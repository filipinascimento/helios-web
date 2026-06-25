import test from 'node:test';
import assert from 'node:assert/strict';
import { HeliosFilter } from '../src/filters/HeliosFilter.js';
import { FilterBehavior } from '../src/behaviors/FilterBehavior.js';

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = null;
    this._activeHeliosFilter = null;
    this._graphFilter = {
      enabled: false,
      scope: 'render',
      options: null,
      nodeCount: 12,
      edgeCount: 6,
      baseNodeCount: 12,
      baseEdgeCount: 6,
      error: null,
    };
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

  getGraphFilter() {
    return {
      ...this._graphFilter,
      options: this._graphFilter.options ? { ...this._graphFilter.options } : null,
    };
  }

  clearGraphFilter() {
    this._activeHeliosFilter = null;
    this._graphFilter = {
      ...this._graphFilter,
      enabled: false,
      scope: 'render',
      options: null,
      nodeCount: this._graphFilter.baseNodeCount,
      edgeCount: this._graphFilter.baseEdgeCount,
    };
    this.emit('graph:filter-changed', this.getGraphFilter());
    return this;
  }

  setGraphFilter(options) {
    const normalized = options instanceof HeliosFilter ? options.toGraphFilterOptions() : options;
    if (options instanceof HeliosFilter) this._activeHeliosFilter = options;
    else this._activeHeliosFilter = null;
    this._graphFilter = {
      ...this._graphFilter,
      enabled: true,
      scope: normalized?.scope ?? 'render',
      options: { ...normalized, scope: normalized?.scope ?? 'render' },
      nodeCount: 5,
      edgeCount: 3,
    };
    this.emit('graph:filter-changed', this.getGraphFilter());
    return this;
  }

  activateHeliosFilter(filter) {
    this._activeHeliosFilter = filter;
    return this.setGraphFilter(filter);
  }

  getActiveHeliosFilter() {
    return this._activeHeliosFilter;
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

test('filter behavior owns rule updates and restores serializable filter state', () => {
  const helios = new MockHelios();
  const behavior = new FilterBehavior();
  const behaviors = new Map([['filters', behavior]]);
  behavior.attach(createContext(helios, behaviors));

  behavior.replaceRules({
    scope: 'render+layout',
    nodeRules: [{ id: 'weight', scope: 'node', type: 'numeric', attribute: 'weight', min: 0.25, max: 1 }],
    edgeRules: [{ id: 'query', scope: 'edge', type: 'query', query: 'intensity >= 0.5' }],
  });

  assert.equal(helios.getGraphFilter().enabled, true);
  assert.equal(helios.getGraphFilter().scope, 'render+layout');
  assert.equal(behavior.state.rules.length, 2);

  const snapshot = behavior.serialize();

  const restoredHelios = new MockHelios();
  const restored = new FilterBehavior();
  const restoredBehaviors = new Map([['filters', restored]]);
  restored.attach(createContext(restoredHelios, restoredBehaviors));
  restored.restore(snapshot);

  assert.equal(restored.state.scope, 'render+layout');
  assert.equal(restored.state.rules.length, 2);
  assert.equal(restoredHelios.getGraphFilter().enabled, true);
  assert.equal(restoredHelios.getGraphFilter().scope, 'render+layout');
});

test('filter behavior syncs from direct raw helios filter activation', () => {
  const helios = new MockHelios();
  const behavior = new FilterBehavior();
  const behaviors = new Map([['filters', behavior]]);
  behavior.attach(createContext(helios, behaviors));

  const rawFilter = new HeliosFilter({ scope: 'render+layout' });
  rawFilter.addRule({ id: 'category', scope: 'node', type: 'categorical', attribute: 'category', values: ['A'] });
  helios.activateHeliosFilter(rawFilter);

  assert.equal(behavior.state.enabled, true);
  assert.equal(behavior.state.scope, 'render+layout');
  assert.deepEqual(behavior.state.rules.map((rule) => rule.attribute ?? rule.query), ['category']);
});
