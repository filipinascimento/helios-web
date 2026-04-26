import test from 'node:test';
import assert from 'node:assert/strict';
import { createSegmentedToggleControl } from '../src/ui/controls/createSegmentedToggleControl.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.className = '';
    this.disabled = false;
    this.tabIndex = 0;
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
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

  dispatchEvent(event) {
    Object.defineProperty(event, 'target', { configurable: true, value: this });
    const list = this.eventListeners.get(event.type) ?? [];
    for (const handler of list) handler.call(this, event);
    return true;
  }

  focus() {}
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

test('createSegmentedToggleControl exposes both options and syncs checked state', () => {
  const originalDocument = globalThis.document;
  globalThis.document = new FakeDocument();

  try {
    const control = createSegmentedToggleControl({
      checked: false,
      onLabel: 'Dark',
      offLabel: 'Light',
      ariaLabel: 'Theme',
    });

    assert.equal(control.getAttribute('role'), 'radiogroup');
    assert.equal(control.getAttribute('aria-label'), 'Theme');
    assert.equal(control.children.length, 2);
    assert.equal(control.children[0].textContent, 'Light');
    assert.equal(control.children[1].textContent, 'Dark');
    assert.equal(control.children[0].getAttribute('aria-checked'), 'true');
    assert.equal(control.children[1].getAttribute('aria-checked'), 'false');

    let changes = 0;
    control.addEventListener('change', () => {
      changes += 1;
    });

    control.children[1].dispatchEvent(new Event('click'));
    assert.equal(control.checked, true);
    assert.equal(control.children[1].getAttribute('aria-checked'), 'true');
    assert.equal(changes, 1);

    control.disabled = true;
    control.children[0].dispatchEvent(new Event('click'));
    assert.equal(control.checked, true);
    assert.equal(control.children[0].disabled, true);
    assert.equal(control.children[1].disabled, true);
    assert.equal(changes, 1);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('createSegmentedToggleControl responds to pointer activation for mobile taps', () => {
  const originalDocument = globalThis.document;
  globalThis.document = new FakeDocument();

  try {
    const control = createSegmentedToggleControl({
      checked: false,
      onLabel: '3D',
      offLabel: '2D',
    });

    let changes = 0;
    control.addEventListener('change', () => {
      changes += 1;
    });

    control.children[1].dispatchEvent({ type: 'pointerup', button: 0 });
    assert.equal(control.checked, true);
    assert.equal(changes, 1);

    control.children[0].dispatchEvent({ type: 'pointerup', button: 1 });
    assert.equal(control.checked, true);
    assert.equal(changes, 1);
  } finally {
    globalThis.document = originalDocument;
  }
});
