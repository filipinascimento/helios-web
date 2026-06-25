import test from 'node:test';
import assert from 'node:assert/strict';
import { LayerManager } from '../src/layers/LayerManager.js';
import { PanelManager } from '../src/ui/panels/PanelManager.js';
import { HeliosUI } from '../src/ui/HeliosUI.js';
import { defaultStylesText } from '../src/ui/style/defaultStyles.js';

class FakeClassList {
  constructor(element) {
    this.element = element;
    this._set = new Set();
  }

  add(...names) {
    for (const name of names) this._set.add(name);
    this.element.className = Array.from(this._set).join(' ');
  }

  remove(...names) {
    for (const name of names) this._set.delete(name);
    this.element.className = Array.from(this._set).join(' ');
  }

  contains(name) {
    return this._set.has(name);
  }
}

function parsePx(value, fallback = 0) {
  if (typeof value === 'string' && value.endsWith('px')) {
    const numeric = Number(value.slice(0, -2));
    if (Number.isFinite(numeric)) return numeric;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.eventListeners = new Map();
    this.hidden = false;
    this.textContent = '';
    this._rect = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child) {
    if (child.parentElement) child.parentElement.removeChild(child);
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  insertBefore(child, before) {
    if (!before) return this.appendChild(child);
    if (child.parentElement) child.parentElement.removeChild(child);
    const index = this.children.indexOf(before);
    if (index === -1) return this.appendChild(child);
    this.children.splice(index, 0, child);
    child.parentElement = this;
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentElement = null;
    return child;
  }

  replaceChildren(...children) {
    for (const child of [...this.children]) this.removeChild(child);
    for (const child of children) this.appendChild(child);
  }

  remove() {
    this.parentElement?.removeChild(this);
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
    event.target = this;
    const list = this.eventListeners.get(event.type) ?? [];
    for (const handler of list) handler.call(this, event);
  }

  contains(node) {
    if (node === this) return true;
    return this.children.some((child) => child.contains(node));
  }

  get childElementCount() {
    return this.children.length;
  }

  getBoundingClientRect() {
    if (this._rect) {
      return {
        left: this._rect.left ?? 0,
        top: this._rect.top ?? 0,
        width: this._rect.width ?? 0,
        height: this._rect.height ?? 0,
        right: (this._rect.left ?? 0) + (this._rect.width ?? 0),
        bottom: (this._rect.top ?? 0) + (this._rect.height ?? 0),
      };
    }
    const parentRect = this.parentElement?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    };
    const top = parsePx(this.style.top, 0);
    const right = parsePx(this.style.right, 0);
    const bottom = parsePx(this.style.bottom, 0);
    const left = parsePx(this.style.left, 0);
    const width = this.style.width != null && this.style.width !== ''
      ? parsePx(this.style.width, parentRect.width - left - right)
      : Math.max(0, parentRect.width - left - right);
    const height = this.style.height != null && this.style.height !== ''
      ? parsePx(this.style.height, parentRect.height - top - bottom)
      : Math.max(0, parentRect.height - top - bottom);
    return {
      left: parentRect.left + left,
      top: parentRect.top + top,
      width,
      height,
      right: parentRect.left + left + width,
      bottom: parentRect.top + top + height,
    };
  }
}

function createFakeDomEnvironment() {
  const window = {
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
  };

  const document = {
    defaultView: window,
    createElement(tagName) {
      return new FakeElement(tagName, document);
    },
    createElementNS(_ns, tagName) {
      return new FakeElement(tagName, document);
    },
    body: null,
    documentElement: null,
  };
  document.body = new FakeElement('body', document);
  document.documentElement = document.body;
  document.body._rect = { left: 0, top: 0, width: 1000, height: 640 };
  window.document = document;

  return { document, window };
}

function createPanelStub(document, id, dock = 'free') {
  const element = document.createElement('div');
  element.dataset.panelId = id;
  element._rect = { left: 0, top: 0, width: 280, height: 180 };
  element.scrollIntoView = () => {
    element._scrolled = true;
  };
  const header = document.createElement('div');
  header._rect = { left: 0, top: 0, width: 280, height: 32 };
  const titleEl = document.createElement('div');
  const title = id
    .replace(/^helios-ui-/, '')
    .split('-')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : ''))
    .join(' ');
  titleEl.textContent = title;
  header.appendChild(titleEl);
  element.appendChild(header);
  return {
    id,
    title,
    dock,
    draggable: true,
    element,
    header,
    titleEl,
    setZIndex() {},
    setDockEdgeOverride(value) {
      this.dockEdgeOverride = value;
    },
    setResponsiveMode(mode) {
      this.responsiveMode = mode;
      this.draggable = mode !== 'fullscreen';
      this.element.dataset.responsiveMode = mode;
    },
    collapsed() {
      return this.element.dataset.collapsed === 'true';
    },
    setCollapsed(value) {
      this.element.dataset.collapsed = value ? 'true' : 'false';
    },
    syncDockStyles() {},
  };
}

function collectButtons(root) {
  const matches = [];
  const visit = (node) => {
    if (!node) return;
    if (node.tagName === 'BUTTON') matches.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return matches;
}

function createClosestTarget(matches = {}, extra = {}) {
  return {
    tagName: extra.tagName ?? 'DIV',
    type: extra.type,
    getAttribute(name) {
      return extra.attributes?.[name] ?? null;
    },
    closest(selector) {
      return matches[selector] ?? null;
    },
  };
}

test('compact and fullscreen interface chrome uses a compact dock toggle and a fullscreen launcher', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = window;

  try {
    const ui = Object.create(HeliosUI.prototype);
    ui.container = document.createElement('div');
    ui.container.ownerDocument = document;
    ui.panelManager = { getPanels: () => [] };
    ui.interfaceBehavior = {
      toggleDockSide() {},
      openControlsSurface() {},
      closeControlsSurface() {},
      clearActiveControl() {},
    };
    const chrome = ui._createInterfaceChrome();
    ui._interfaceChrome = chrome;
    ui._renderInterfaceChrome({ mode: 'compact', controlsOpen: false, dockSide: 'left' });

    const buttons = collectButtons(chrome.surface);
    assert.equal(buttons.includes(chrome.compactDockToggle), true);
    assert.equal(buttons.includes(chrome.launcherButton), true);
    assert.equal(chrome.compactDockToggle.children[0].tagName, 'SVG');
    assert.equal(chrome.compactDockToggle.getAttribute('aria-label'), 'Move dock to the right side');
    assert.equal(chrome.compactDockToggle.hidden, false);
    assert.equal(chrome.fullscreenBar.hidden, true);
    assert.equal(chrome.fullscreenPanelNav.hidden, true);

    ui._renderInterfaceChrome({ mode: 'fullscreen', controlsOpen: false, dockSide: 'left' });

    assert.equal(chrome.launcherButton.children[0].tagName, 'SVG');
    assert.equal(chrome.launcherButton.getAttribute('aria-label'), 'Open controls');
    assert.equal(chrome.compactDockToggle.hidden, true);
    assert.equal(chrome.fullscreenBar.hidden, false);
    assert.equal(chrome.fullscreenPanelNav.hidden, true);

    ui._renderInterfaceChrome({ mode: 'fullscreen', controlsOpen: true, dockSide: 'left' });

    assert.equal(chrome.launcherButton.getAttribute('aria-label'), 'Close controls');

    ui._renderInterfaceChrome({ mode: 'compact', controlsOpen: false, dockSide: 'right' });

    assert.equal(chrome.compactDockToggle.getAttribute('aria-label'), 'Move dock to the left side');
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
});

test('mobile transparency focus only activates for eligible controls and can resolve portal-scoped popovers', () => {
  const ui = Object.create(HeliosUI.prototype);
  const row = { dataset: {}, closest: () => null };
  ui.container = {
    querySelector(selector) {
      return selector === '[data-interface-focus-scope-id="scope-1"]' ? row : null;
    },
  };

  const toggleTarget = createClosestTarget({
    '[data-interface-focus-ignore="true"]': null,
    '[data-interface-focus-control="true"]': null,
    'input, select, textarea, [role="switch"], [role="radiogroup"], [role="radio"]': { tagName: 'BUTTON', closest: () => null, getAttribute: () => null },
    '.helios-ui-row, .helios-ui-layout__actions, .helios-ui-network__actions': row,
  });
  assert.equal(ui._isTransparencyEligibleControl(toggleTarget), true);
  assert.equal(ui._resolveActiveControlScope(toggleTarget), row);

  const ignoredThemeToggle = createClosestTarget({
    '[data-interface-focus-ignore="true"]': {},
  }, { tagName: 'BUTTON' });
  assert.equal(ui._isTransparencyEligibleControl(ignoredThemeToggle), false);
  assert.equal(ui._resolveActiveControlScope(ignoredThemeToggle), null);

  const portalTarget = createClosestTarget({
    '[data-interface-focus-ignore="true"]': null,
    '[data-interface-focus-control="true"]': {},
    '.helios-ui-row, .helios-ui-layout__actions, .helios-ui-network__actions': null,
    '[data-interface-focus-scope-id]': { dataset: { interfaceFocusScopeId: 'scope-1' } },
  });
  assert.equal(ui._resolveActiveControlScope(portalTarget), row);
});

test('touch pointerdown does not activate fullscreen transparency before a real control interaction', () => {
  const ui = Object.create(HeliosUI.prototype);
  let activePanelId = null;
  const row = { dataset: {}, closest: () => ({ dataset: { panelId: 'scene' } }) };
  const host = new FakeElement('div');
  ui.container = host;
  ui.interfaceBehavior = {
    activateControl(panelId) {
      activePanelId = panelId;
    },
    clearActiveControl() {
      activePanelId = null;
    },
  };
  ui._controlCleanups = new Set();
  ui._interfaceReleaseTimer = null;
  ui._activeControlScope = null;
  ui._resolveActiveControlScope = () => row;
  ui._resolveActivePanelId = () => 'scene';
  ui._setActiveControlScope = HeliosUI.prototype._setActiveControlScope;
  ui._scheduleInterfaceControlRelease = HeliosUI.prototype._scheduleInterfaceControlRelease;

  ui._installInterfaceControlTracking();

  host.dispatchEvent({ type: 'pointerdown', pointerType: 'touch', target: host });
  assert.equal(ui._activeControlScope, null);
  assert.equal(activePanelId, null);

  host.dispatchEvent({ type: 'input', target: host });
  assert.equal(ui._activeControlScope, row);
  assert.equal(activePanelId, 'scene');
});

test('scrolling while a control is focused clears fullscreen transparency immediately', () => {
  const ui = Object.create(HeliosUI.prototype);
  let cleared = 0;
  const row = { dataset: { controlFocusActive: 'true' } };
  const host = new FakeElement('div');
  ui.container = host;
  ui.interfaceBehavior = {
    clearActiveControl() {
      cleared += 1;
    },
  };
  ui._controlCleanups = new Set();
  ui._interfaceReleaseTimer = setTimeout(() => {}, 1000);
  ui._activeControlScope = row;
  ui._setActiveControlScope = HeliosUI.prototype._setActiveControlScope;
  ui._scheduleInterfaceControlRelease = HeliosUI.prototype._scheduleInterfaceControlRelease;
  ui._resolveActiveControlScope = () => row;
  ui._resolveActivePanelId = () => 'scene';

  ui._installInterfaceControlTracking();
  host.dispatchEvent({ type: 'scroll', target: host });

  assert.equal(ui._activeControlScope, null);
  assert.equal(cleared, 1);
  assert.equal(row.dataset.controlFocusActive, undefined);
});

test('fullscreen compact mode moves docked and floating panels into one sequential full-space flow', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    const docked = createPanelStub(document, 'layout', 'left');
    docked.element.dataset.sideDocked = 'true';
    const floating = createPanelStub(document, 'selection', 'free');
    manager.panels.set(docked.id, docked);
    manager.panels.set(floating.id, floating);

    manager.setResponsivePresentation({ mode: 'fullscreen', controlsOpen: true });

    assert.equal(docked.element.parentElement, manager.fullscreenFlow);
    assert.equal(floating.element.parentElement, manager.fullscreenFlow);
    assert.equal(manager.fullscreenFlow.hidden, false);
    assert.equal('sideDocked' in docked.element.dataset, false);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('fullscreen mobile flow keeps panels at intrinsic height so the parent flow scrolls', () => {
  assert.match(
    defaultStylesText,
    /\.helios-ui\[data-interface-mode="fullscreen"\] \.helios-ui-fullscreen-flow > \.helios-ui-panel\[data-interface-visible="true"\][\s\S]*flex: 0 0 auto !important;/,
  );
});

test('compact side-docked mode keeps free panels windowed and only stacks docked panels on the chosen side', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    const docked = createPanelStub(document, 'layout', 'left');
    const floating = createPanelStub(document, 'selection', 'free');
    manager.panels.set(docked.id, docked);
    manager.panels.set(floating.id, floating);

    manager.setResponsivePresentation({ mode: 'compact', dockSide: 'left' });

    assert.equal(docked.element.parentElement, manager.dockLeft);
    assert.equal(floating.element.parentElement, container);
    assert.equal(docked.draggable, true);
    assert.equal(floating.draggable, true);
    assert.equal(docked.responsiveMode, 'desktop');
    assert.equal(floating.responsiveMode, 'desktop');
    assert.equal(docked.element.dataset.sideDocked, 'true');
    assert.equal('sideDocked' in floating.element.dataset, false);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('compact dock toggle click flips the preferred side and compact ordering keeps left-origin panels before right-origin panels', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container.ownerDocument = document;
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };

    const manager = new PanelManager({ container });
    const leftPanel = createPanelStub(document, 'left-panel', 'left');
    const rightPanel = createPanelStub(document, 'right-panel', 'right');
    manager.panels.set(leftPanel.id, leftPanel);
    manager.panels.set(rightPanel.id, rightPanel);
    manager.setResponsivePresentation({ mode: 'compact', dockSide: 'left' });

    assert.deepEqual(manager.dockLeft.children.map((child) => child.dataset.panelId), ['left-panel', 'right-panel']);

    const ui = Object.create(HeliosUI.prototype);
    let dockSide = 'left';
    ui.container = container;
    ui.panelManager = manager;
    ui.interfaceBehavior = {
      toggleDockSide() {
        dockSide = dockSide === 'left' ? 'right' : 'left';
        ui.applyInterfaceBehaviorState({ mode: 'compact', dockSide, controlsOpen: false, focused: false });
      },
      controlsOpen() { return false; },
    };
    ui._latestDockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    ui._setActiveControlScope = () => {};
    ui._applyGraphViewportPolicy = () => {};
    ui._interfaceChrome = ui._createInterfaceChrome();
    ui._renderInterfaceChrome({ mode: 'compact', dockSide, controlsOpen: false });

    ui._interfaceChrome.compactDockToggle.dispatchEvent({ type: 'click' });

    assert.equal(container.dataset.compactDockSide, 'right');
    assert.deepEqual(manager.dockRight.children.map((child) => child.dataset.panelId), ['left-panel', 'right-panel']);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('compact mode places newly side-docked panels into the active dock side', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    const panel = createPanelStub(document, 'selection', 'right');
    manager.panels.set(panel.id, panel);

    manager.setResponsivePresentation({ mode: 'compact', dockSide: 'left' });
    manager._placePanel(panel);

    assert.equal(panel.element.parentElement, manager.dockLeft);
    assert.equal(panel.element.dataset.sideDocked, 'true');
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('compact mode starts dock reorder against the active single dock even for opposite-origin panels', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    const panel = createPanelStub(document, 'selection', 'right');
    manager.panels.set(panel.id, panel);

    manager.setResponsivePresentation({ mode: 'compact', dockSide: 'left' });
    panel.element._rect = { left: 0, top: 40, width: 280, height: 180 };

    const started = manager._startSideDockReorder(panel, {
      pointerId: 1,
      button: 0,
      buttons: 1,
      shiftKey: false,
      clientX: 24,
      clientY: 60,
      preventDefault() {},
    });

    assert.equal(started, true);
    assert.equal(manager._dockReorder?.dockEl, manager.dockLeft);
    assert.equal(container.classList.contains('helios-ui--dock-reordering'), true);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('fullscreen active-control reveal marks one panel active and fades the rest', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    const docked = createPanelStub(document, 'layout', 'left');
    const floating = createPanelStub(document, 'selection', 'free');
    manager.panels.set(docked.id, docked);
    manager.panels.set(floating.id, floating);

    manager.setResponsivePresentation({
      mode: 'fullscreen',
      controlsOpen: true,
      focused: true,
      activePanelId: 'selection',
    });

    assert.equal(floating.element.dataset.interfaceState, 'active');
    assert.equal(docked.element.dataset.interfaceState, 'background');
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('restore-to-desktop returns panels to their desktop placement after fullscreen flow', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    const docked = createPanelStub(document, 'layout', 'right');
    const floating = createPanelStub(document, 'selection', 'free');
    manager.panels.set(docked.id, docked);
    manager.panels.set(floating.id, floating);

    manager.setResponsivePresentation({ mode: 'fullscreen', controlsOpen: true });
    manager.setResponsivePresentation({ mode: 'desktop', controlsOpen: false });

    assert.equal(docked.element.parentElement, manager.dockRight);
    assert.equal(floating.element.parentElement, container);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('redocking a widened floating panel snaps it back to the active dock width', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    const docked = createPanelStub(document, 'layout', 'left');
    docked.width = 280;
    docked.element.style.width = '280px';
    const floating = createPanelStub(document, 'selection', 'free');
    floating.width = 420;
    floating.element.style.width = '420px';
    manager.panels.set(docked.id, docked);
    manager.panels.set(floating.id, floating);

    manager._placePanel(docked);
    floating.dock = 'left';
    manager._placePanel(floating);

    assert.equal(floating.width, 280);
    assert.equal(floating.element.style.width, '280px');
    assert.equal(floating.element.parentElement, manager.dockLeft);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('one-sided compact mode shifts the effective render viewport to the remaining visible side', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const host = document.createElement('div');
    host._rect = { left: 0, top: 0, width: 1000, height: 640 };
    document.body.appendChild(host);
    const layers = new LayerManager(host);

    layers.setViewportInsets({ left: 280, right: 0, top: 0, bottom: 0 });

    assert.equal(layers.viewport.style.left, '280px');
    assert.equal(layers.size.width, 720);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('renderer viewport layers disable text selection without affecting external UI layers', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const host = document.createElement('div');
    host._rect = { left: 0, top: 0, width: 1000, height: 640 };
    document.body.appendChild(host);
    const layers = new LayerManager(host);

    const uiLayer = document.createElement('div');
    layers.addLayer('ui', uiLayer);

    assert.equal(layers.viewport.style.userSelect, 'none');
    assert.equal(layers.viewport.style.webkitUserSelect, 'none');
    assert.equal(layers.canvas.style.userSelect, 'none');
    assert.equal(layers.svg.style.userSelect, 'none');
    assert.equal(layers.overlay.style.userSelect, 'none');
    assert.equal(uiLayer.style.userSelect ?? '', '');
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('compact viewport policy uses viewport insets without duplicating overlay insets for legends', () => {
  const ui = Object.create(HeliosUI.prototype);
  const calls = [];
  ui._latestDockInsets = { top: 0, right: 0, bottom: 0, left: 280 };
  ui.helios = {
    layers: {
      setViewportInsets(insets) {
        calls.push({ type: 'viewport', insets });
      },
    },
    overlayInsets(insets) {
      calls.push({ type: 'overlay', insets });
    },
  };

  ui._applyGraphViewportPolicy({ mode: 'compact' });
  ui._applyGraphViewportPolicy({ mode: 'fullscreen' });
  ui._applyGraphViewportPolicy({ mode: 'desktop' });

  assert.deepEqual(calls, [
    { type: 'viewport', insets: { top: 0, right: 0, bottom: 0, left: 280 } },
    { type: 'overlay', insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    { type: 'viewport', insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    { type: 'overlay', insets: { top: 0, right: 0, bottom: 0, left: 28 } },
    { type: 'viewport', insets: { top: 0, right: 0, bottom: 0, left: 0 } },
    { type: 'overlay', insets: { top: 0, right: 0, bottom: 0, left: 280 } },
  ]);
});

test('compact dock background uses a theme-aware fill instead of staying transparent', () => {
  assert.match(
    defaultStylesText,
    /\.helios-ui\[data-theme="dark"\]\s*\{[\s\S]*--helios-ui-dock-fill:\s*color-mix\(in srgb, var\(--helios-ui-bg-solid\) 88%, white 12%\);/,
  );
  assert.match(
    defaultStylesText,
    /\.helios-ui\[data-theme="light"\]\s*\{[\s\S]*--helios-ui-dock-fill:\s*color-mix\(in srgb, var\(--helios-ui-bg-solid\) 94%, black 6%\);/,
  );
  assert.match(
    defaultStylesText,
    /\.helios-ui\[data-interface-mode="compact"\] \.helios-ui-dock--side\s*\{[\s\S]*background:\s*var\(--helios-ui-dock-fill\);/,
  );
});

test('compact side dock opts into iOS touch scrolling behavior', () => {
  assert.match(
    defaultStylesText,
    /\.helios-ui-dock--side\s*\{[\s\S]*overflow-y:\s*auto;[\s\S]*pointer-events:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*-webkit-overflow-scrolling:\s*touch;[\s\S]*touch-action:\s*pan-y;/,
  );
});

test('fullscreen panel nav hides during focused-control transparency mode', () => {
  assert.match(
    defaultStylesText,
    /\.helios-ui\[data-interface-mode="fullscreen"\]\[data-focused-control="true"\]\[data-focused-control-scope="row"\] \.helios-ui-interface-fullscreen-bar\s*\{[\s\S]*opacity:\s*0;[\s\S]*pointer-events:\s*none;/,
  );
});

test('fullscreen controls render a left-side panel icon rail in visible panel order', () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container.ownerDocument = document;
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    const dataPanel = createPanelStub(document, 'helios-ui-data', 'left');
    const scenePanel = createPanelStub(document, 'helios-ui-demo', 'left');
    const filterPanel = createPanelStub(document, 'helios-ui-filter', 'left');
    manager.panels.set(dataPanel.id, dataPanel);
    manager.panels.set(scenePanel.id, scenePanel);
    manager.panels.set(filterPanel.id, filterPanel);
    manager.setResponsivePresentation({ mode: 'fullscreen', controlsOpen: true });

    const ui = Object.create(HeliosUI.prototype);
    ui.container = container;
    ui.panelManager = manager;
    ui.interfaceBehavior = {
      controlsOpen() { return true; },
      clearActiveControl() {},
    };
    ui._setActiveControlScope = () => {};
    ui._interfaceChrome = ui._createInterfaceChrome();
    ui._renderInterfaceChrome({ mode: 'fullscreen', controlsOpen: true, dockSide: 'left' });

    assert.equal(ui._interfaceChrome.fullscreenPanelNav.hidden, false);
    assert.deepEqual(
      ui._interfaceChrome.fullscreenPanelNav.children.map((child) => child.dataset.panelId),
      ['helios-ui-data', 'helios-ui-demo', 'helios-ui-filter'],
    );
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('fullscreen panel rail jumps to a panel and expands it before showing the header cue', async () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container.ownerDocument = document;
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    manager.fullscreenFlow._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const scenePanel = createPanelStub(document, 'helios-ui-demo', 'left');
    scenePanel.setCollapsed(true);
    manager.panels.set(scenePanel.id, scenePanel);

    const ui = Object.create(HeliosUI.prototype);
    ui.container = container;
    ui.panelManager = manager;
    ui._panelHeaderShineTimers = new WeakMap();
    ui._pendingPanelHeaderShine = null;
    let clearCalls = 0;
    ui.interfaceBehavior = {
      clearActiveControl() { clearCalls += 1; },
    };
    ui._setActiveControlScope = () => {};

    ui._jumpToFullscreenPanel('helios-ui-demo');
    await new Promise((resolve) => setTimeout(resolve, 220));

    assert.equal(scenePanel.element.dataset.collapsed, 'false');
    assert.equal(scenePanel.element._scrolled, true);
    assert.equal(scenePanel.header.dataset.navShine, 'true');
    assert.equal(clearCalls, 1);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

test('fullscreen panel rail waits for scroll settle before shining the header', async () => {
  const { document, window } = createFakeDomEnvironment();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.document = document;
  globalThis.window = window;
  globalThis.ResizeObserver = undefined;

  try {
    const container = document.createElement('div');
    container.ownerDocument = document;
    container._rect = { left: 0, top: 0, width: 1000, height: 640 };
    const manager = new PanelManager({ container });
    manager.fullscreenFlow._rect = { left: 0, top: 0, width: 320, height: 160 };
    const scenePanel = createPanelStub(document, 'helios-ui-demo', 'free');
    scenePanel.element._rect = { left: 0, top: 240, width: 280, height: 180 };
    scenePanel.element.scrollIntoView = () => {
      scenePanel.element._scrolled = true;
      manager.fullscreenFlow.dispatchEvent({ type: 'scroll' });
      window.setTimeout(() => {
        manager.fullscreenFlow.dispatchEvent({ type: 'scroll' });
      }, 20);
    };
    manager.panels.set(scenePanel.id, scenePanel);

    const ui = Object.create(HeliosUI.prototype);
    ui.container = container;
    ui.panelManager = manager;
    ui._panelHeaderShineTimers = new WeakMap();
    ui._pendingPanelHeaderShine = null;
    ui.interfaceBehavior = {
      clearActiveControl() {},
    };
    ui._setActiveControlScope = () => {};

    ui._jumpToFullscreenPanel('helios-ui-demo');

    assert.equal(scenePanel.header.dataset.navShine, undefined);

    await new Promise((resolve) => setTimeout(resolve, 240));

    assert.equal(scenePanel.header.dataset.navShine, 'true');
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    globalThis.ResizeObserver = originalResizeObserver;
  }
});
