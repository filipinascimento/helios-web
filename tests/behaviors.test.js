import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Behavior,
  BehaviorManager,
  BehaviorRegistry,
  HoverBehavior,
  LegendsBehavior,
  LabelsBehavior,
  SelectionBehavior,
  createDefaultBehaviorRegistry,
} from '../src/behaviors/index.js';

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = null;
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
}

class ProbeBehavior extends Behavior {
  static id = 'probe';

  constructor(options = {}) {
    super(options);
    this.attachCount = 0;
    this.detachCount = 0;
  }

  attach(context) {
    super.attach(context);
    this.attachCount += 1;
    this.addCleanup(context.subscribe(context.helios, 'probe:event', () => {
      this.emit('change', { observed: true });
    }));
    return this;
  }

  detach() {
    this.detachCount += 1;
    return super.detach();
  }
}

test('behavior manager registers and reuses built-in behaviors by name', () => {
  const helios = new MockHelios();
  const registry = new BehaviorRegistry()
    .register('legends', LegendsBehavior)
    .register('labels', LabelsBehavior)
    .register('hover', HoverBehavior)
    .register('selection', SelectionBehavior)
    .register('probe', ProbeBehavior);
  const manager = new BehaviorManager(helios, registry);

  const labels = manager.use('labels', { enabled: true, maxVisible: 42 });
  const selection = manager.use('selection', { nodeClick: false });
  const hover = manager.use('hover', { hoverLabel: false });
  const reused = manager.use('selection', { edgeClick: true });

  assert.equal(selection, reused);
  assert.equal(manager.get('labels'), labels);
  assert.equal(manager.get('selection'), selection);
  assert.equal(manager.get('hover'), hover);
  assert.equal(labels.state.enabled, true);
  assert.equal(labels.state.maxVisible, 42);
  assert.equal(selection.state.nodeClick, false);
  assert.equal(selection.state.edgeClick, true);
  assert.equal(hover.state.hoverLabel, false);
});

test('behavior manager attaches and detaches instantiated custom behaviors', () => {
  const helios = new MockHelios();
  const registry = new BehaviorRegistry().register('probe', ProbeBehavior);
  const manager = new BehaviorManager(helios, registry);
  const probe = new ProbeBehavior();

  manager.use(probe);
  assert.equal(probe.attachCount, 1);
  assert.equal(manager.get('probe'), probe);

  let observed = false;
  probe.on('change', () => {
    observed = true;
  });
  helios.emit('probe:event', {});
  assert.equal(observed, true);

  assert.equal(manager.detach('probe'), true);
  assert.equal(probe.detachCount, 1);
  assert.equal(manager.get('probe'), null);
});

test('behavior manager serializes and restores attached behavior state', () => {
  const helios = new MockHelios();
  const registry = new BehaviorRegistry()
    .register('legends', LegendsBehavior)
    .register('labels', LabelsBehavior)
    .register('hover', HoverBehavior)
    .register('selection', SelectionBehavior);
  const manager = new BehaviorManager(helios, registry);

  const labels = manager.use('labels', { enabled: true, maxVisible: 18 });
  const selection = manager.use('selection', { nodeClick: false });
  const hover = manager.use('hover', { hoverLabel: false });
  selection.state.selectedNodes.add(2);
  hover.state.hoveredNode = 3;
  const snapshot = manager.serialize();

  const nextManager = new BehaviorManager(new MockHelios(), registry);
  nextManager.restore(snapshot);

  const restored = nextManager.get('selection');
  const restoredHover = nextManager.get('hover');
  const restoredLabels = nextManager.get('labels');
  assert.ok(restored);
  assert.ok(restoredHover);
  assert.ok(restoredLabels);
  assert.equal(labels.state.maxVisible, 18);
  assert.equal(restoredLabels.state.enabled, true);
  assert.equal(restoredLabels.state.maxVisible, 18);
  assert.equal(restored.state.nodeClick, false);
  assert.equal(restoredHover.state.hoverLabel, false);
  assert.deepEqual(Array.from(restored.state.selectedNodes), [2]);
  assert.equal(restoredHover.state.hoveredNode, -1);
});

test('default behavior registry exposes legends, labels, hover, and selection behaviors', () => {
  const registry = createDefaultBehaviorRegistry();
  assert.equal(registry.has('legends'), true);
  assert.equal(registry.has('labels'), true);
  assert.equal(registry.has('selection'), true);
  assert.equal(registry.has('hover'), true);
});
