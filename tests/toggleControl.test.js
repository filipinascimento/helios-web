import test from 'node:test';
import assert from 'node:assert/strict';
import { createToggleControl } from '../src/ui/controls/createToggleControl.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.attributes = new Map();
    this.eventListeners = new Map();
    this.className = '';
    this.disabled = false;
    this.textContent = '';
    this.attributeWrites = new Map();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    this.attributeWrites.set(name, (this.attributeWrites.get(name) ?? 0) + 1);
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
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

test('createToggleControl responds to pointer taps without double toggling on click fallback', () => {
  const originalDocument = globalThis.document;
  globalThis.document = new FakeDocument();

  try {
    const control = createToggleControl({
      checked: false,
      onLabel: 'On',
      offLabel: 'Off',
      ariaLabel: 'Visibility',
    });

    let changes = 0;
    control.addEventListener('change', () => {
      changes += 1;
    });

    control.dispatchEvent({ type: 'pointerup', button: 0 });
    assert.equal(control.checked, true);
    assert.equal(control.getAttribute('aria-checked'), 'true');
    assert.equal(changes, 1);

    control.dispatchEvent(new Event('click'));
    assert.equal(control.checked, true);
    assert.equal(changes, 1);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('createToggleControl still supports keyboard or programmatic click activation', () => {
  const originalDocument = globalThis.document;
  globalThis.document = new FakeDocument();

  try {
    const control = createToggleControl({ checked: false });
    control.dispatchEvent(new Event('click'));
    assert.equal(control.checked, true);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('createToggleControl does not rewrite switch state when checked is unchanged', () => {
  const originalDocument = globalThis.document;
  globalThis.document = new FakeDocument();

  try {
    const control = createToggleControl({ checked: true, onLabel: 'On', offLabel: 'Off' });
    const initialAriaWrites = control.attributeWrites.get('aria-checked') ?? 0;
    const text = control.children.find((child) => child.className === 'helios-ui-toggle__text');
    const initialText = text.textContent;

    control.checked = true;

    assert.equal(control.attributeWrites.get('aria-checked') ?? 0, initialAriaWrites);
    assert.equal(text.textContent, initialText);
  } finally {
    globalThis.document = originalDocument;
  }
});
