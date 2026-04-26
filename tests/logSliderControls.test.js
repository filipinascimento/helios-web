import test from 'node:test';
import assert from 'node:assert/strict';

import { LogSliderControls } from '../src/ui/controls/LogSliderControls.js';

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.eventListeners = new Map();
    this.style = new FakeStyle();
    this.className = '';
    this.type = '';
    this.value = '';
    this.min = '';
    this.max = '';
    this.step = '';
    this.disabled = false;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  addEventListener(type, handler) {
    const list = this.eventListeners.get(type) ?? [];
    list.push(handler);
    this.eventListeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.eventListeners.get(type) ?? [];
    this.eventListeners.set(type, list.filter((entry) => entry !== handler));
  }

  dispatchEvent(event) {
    Object.defineProperty(event, 'target', { configurable: true, value: this });
    const list = this.eventListeners.get(event.type) ?? [];
    for (const handler of list) handler.call(this, event);
    return true;
  }

  blur() {}

  remove() {}
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

function interceptValueSetter(input) {
  let sets = 0;
  let current = input.value;
  Object.defineProperty(input, 'value', {
    configurable: true,
    enumerable: true,
    get() {
      return current;
    },
    set(next) {
      sets += 1;
      current = String(next);
    },
  });
  return () => sets;
}

test('log slider input drag does not rewrite the slider value while dragging', () => {
  const originalDocument = globalThis.document;
  globalThis.document = new FakeDocument();

  try {
    const controls = new LogSliderControls({
      value: 0.001,
      minExp: -6,
      maxExp: 0,
      minValue: 0.000001,
      maxValue: 1,
    });

    const readSets = interceptValueSetter(controls.slider);
    controls.slider.value = controls.slider.max;
    assert.equal(readSets(), 1);

    controls.slider.dispatchEvent(new Event('input'));

    assert.equal(readSets(), 1);
    assert.equal(controls.slider.value, controls.slider.max);
    assert.match(controls.input.value, /^1(?:\.0+)?$/);

    controls.destroy();
  } finally {
    globalThis.document = originalDocument;
  }
});
