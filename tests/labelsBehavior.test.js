import test from 'node:test';
import assert from 'node:assert/strict';
import { LabelsBehavior } from '../src/behaviors/LabelsBehavior.js';
import { HoverBehavior } from '../src/behaviors/HoverBehavior.js';
import { SelectionBehavior } from '../src/behaviors/SelectionBehavior.js';
import { applyHoverLabelConfig } from '../src/behaviors/interactionShared.js';

class MockHelios extends EventTarget {
  constructor() {
    super();
    this.network = null;
    this._labels = {
      enabled: false,
      selectionMode: 'ranked',
      selectedOnlySpaceAware: false,
      hoveredNodeEnabled: false,
      hoveredNodeSource: null,
      maxVisible: 120,
      fontSizeScale: 1,
      minScreenRadiusPx: 0,
      outlineWidth: 2,
      offsetRadiusFactor: 1,
      offsetPx: 4,
      maxChars: 45,
      maxRows: 2,
      fill: '#f4f7ff',
      outlineColor: '#001426cc',
      fontFamily: 'sans-serif',
      source: null,
    };
    this._applyCount = 0;
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  _getLabelsControllerConfig() {
    return { ...this._labels };
  }

  _applyLabelsControllerConfig(options) {
    this._applyCount += 1;
    this._labels = { ...this._labels, ...options };
    return this;
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

test('labels behavior owns label config updates and public commands', () => {
  const helios = new MockHelios();
  const labels = new LabelsBehavior();
  const behaviors = new Map([['labels', labels]]);
  labels.attach(createContext(helios, behaviors));

  labels.mode('selected-only');
  labels.update({ maxVisible: 24, selectedOnlySpaceAware: true, source: 'label' });
  labels.fontFamily('Menlo, monospace');

  assert.equal(labels.mode(), 'selected-only');
  assert.equal(labels.selectedOnlySpaceAware(), true);
  assert.equal(labels.source(), 'label');
  assert.equal(helios._labels.enabled, true);
  assert.equal(helios._labels.selectionMode, 'selected-only');
  assert.equal(helios._labels.maxVisible, 24);
  assert.equal(helios._labels.fontFamily, 'Menlo, monospace');
});

test('labels behavior coordinates hover and selection driven label policy without tight coupling', () => {
  const helios = new MockHelios();
  const labels = new LabelsBehavior();
  const hover = new HoverBehavior({ hoverLabel: true, hoverLabelSource: 'auto' });
  const selection = new SelectionBehavior();
  const behaviors = new Map([
    ['labels', labels],
    ['hover', hover],
    ['selection', selection],
  ]);
  const context = createContext(helios, behaviors);
  labels.attach(context);
  selection.attach(context);
  hover.attach(context);

  assert.equal(labels.mode(), 'selected-only');
  assert.equal(helios._labels.selectionMode, 'selected-only');

  applyHoverLabelConfig(context);
  assert.equal(helios._labels.hoveredNodeEnabled, true);
  assert.equal(typeof helios._labels.hoveredNodeSource, 'function');

  hover.update({ hoverLabel: false });
  applyHoverLabelConfig(context);
  assert.equal(helios._labels.hoveredNodeEnabled, false);
});

test('labels behavior serializes and restores stable config but not transient hover overlay policy', () => {
  const helios = new MockHelios();
  const labels = new LabelsBehavior();
  const behaviors = new Map([['labels', labels]]);
  labels.attach(createContext(helios, behaviors));

  labels.update({ enabled: true, selectionMode: 'selected-only', maxVisible: 31, fill: '#ff00ffaa' });
  labels.setHoverPolicy({ enabled: true, source: '$id' });
  const snapshot = labels.serialize();

  const restoredHelios = new MockHelios();
  const restored = new LabelsBehavior();
  const restoredBehaviors = new Map([['labels', restored]]);
  restored.attach(createContext(restoredHelios, restoredBehaviors));
  restored.restore(snapshot);

  assert.equal(restored.mode(), 'selected-only');
  assert.equal(restored.state.maxVisible, 31);
  assert.equal(restored.state.fill, '#ff00ffaa');
  assert.equal(restored.getPublicState().hoveredNodeEnabled, false);
  assert.equal(restoredHelios._labels.hoveredNodeEnabled, false);
});
