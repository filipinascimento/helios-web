import test from 'node:test';
import assert from 'node:assert/strict';
import { Helios } from '../src/index.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  toggle(name, force) {
    const enabled = force === undefined ? !this.values.has(name) : force === true;
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeStyle {
  constructor() {
    this.values = {};
  }

  setProperty(name, value) {
    this.values[name] = value;
  }
}

class FakeElement {
  constructor(tagName, ownerDocument) {
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = new FakeStyle();
    this.classList = new FakeClassList();
    this.attributes = {};
    this.listeners = new Map();
    this.textContent = '';
    this.innerHTML = '';
    this.title = '';
    this.type = '';
  }

  set className(value) {
    this._className = String(value ?? '');
    this.classList = new FakeClassList();
    for (const token of this._className.split(/\s+/).filter(Boolean)) {
      this.classList.values.add(token);
    }
  }

  get className() {
    return this._className ?? '';
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    if (index >= 0) siblings.splice(index, 1);
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  click() {
    for (const handler of this.listeners.get('click') ?? []) {
      handler({ type: 'click', button: 0, target: this });
    }
  }

  querySelector(selector) {
    const match = selector.match(/^\[data-helios-quick-control="([^"]+)"\]$/);
    if (!match) return null;
    return this._find((node) => node.dataset?.heliosQuickControl === match[1]);
  }

  _find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child._find?.(predicate);
      if (nested) return nested;
    }
    return null;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
}

function createHarness() {
  const document = new FakeDocument();
  const root = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 });
  let layoutState = 'running';
  const helios = Object.create(Helios.prototype);
  helios._baseOverlayInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  helios._quickControlsOverlayInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  helios._overlayInsets = { top: 0, right: 0, bottom: 0, left: 0 };
  helios._quickControls = null;
  helios._quickControlCleanups = [];
  helios._quickControlsConfig = {
    enabled: true,
    autoFit: true,
    layout: true,
    zoom: true,
    reserveLegendSpace: true,
    theme: 'dark',
    buttonSize: 38,
    gap: 6,
    margin: 12,
    zoomFactor: 1.25,
  };
  helios._cameraControlConfig = { autoFit: true, animation: true };
  helios.layers = {
    root,
    canvas,
    addLayer(_name, element) {
      root.appendChild(element);
    },
    removeLayer(_name) {
      helios._quickControls?.root?.remove?.();
    },
  };
  helios.scheduler = {
    renderRequests: 0,
    getLayoutState: () => layoutState,
    requestRender() {
      this.renderRequests += 1;
    },
  };
  helios.renderer = {
    camera: {
      mode: '2d',
      zoom: 1,
      viewport: { width: 400, height: 300 },
      zoom2DAtClientPoint(_x, _y, scale) {
        this.zoom *= scale;
        return true;
      },
    },
  };
  helios.on = () => () => {};
  helios.mode = () => '2d';
  helios.cameraControls = (patch) => {
    if (patch === undefined) return { ...helios._cameraControlConfig };
    helios._cameraControlConfig = { ...helios._cameraControlConfig, ...patch };
    return helios;
  };
  helios.requestFrameNetworkCalls = [];
  helios.requestFrameNetwork = (options) => {
    helios.requestFrameNetworkCalls.push(options);
    return helios;
  };
  helios._scheduleCameraMove = () => {};
  helios.setCameraPoseCalls = [];
  helios.setCameraPose = (pose, options) => {
    helios.setCameraPoseCalls.push({ pose, options });
    if (Number.isFinite(pose?.zoom)) helios.renderer.camera.zoom = pose.zoom;
    if (Number.isFinite(pose?.distance)) helios.renderer.camera.distance = pose.distance;
    if (options?.source === 'ui') helios._cameraControlConfig.autoFit = false;
    helios.scheduler.requestRender();
    return helios;
  };
  helios.startLayout = () => {
    layoutState = 'running';
    return helios;
  };
  helios.stopLayout = () => {
    layoutState = 'stopped';
    return helios;
  };
  return { helios, root };
}

test('quick controls render by default and reserve right-side legend space', () => {
  const { helios, root } = createHarness();

  const controls = helios._setupQuickControls();

  assert.ok(controls);
  assert.equal(root.children.includes(controls), true);
  assert.ok(controls.querySelector('[data-helios-quick-control="auto-fit"]'));
  assert.ok(controls.querySelector('[data-helios-quick-control="layout"]'));
  assert.ok(controls.querySelector('[data-helios-quick-control="zoom-in"]'));
  assert.ok(controls.querySelector('[data-helios-quick-control="zoom-out"]'));
  assert.equal(helios.overlayInsets().right, 56);

  helios.overlayInsets({ top: 12, right: 100 });

  assert.deepEqual(helios.overlayInsets(), { top: 12, right: 100, bottom: 0, left: 0 });
  assert.equal(controls.style.top, '24px');
  assert.equal(controls.style.right, '112px');
});

test('quick control buttons toggle fit, layout, and zoom', () => {
  const { helios } = createHarness();
  const controls = helios._setupQuickControls();
  const fit = controls.querySelector('[data-helios-quick-control="auto-fit"]');
  const layout = controls.querySelector('[data-helios-quick-control="layout"]');
  const zoomIn = controls.querySelector('[data-helios-quick-control="zoom-in"]');

  assert.equal(fit.classList.contains('is-active'), true);
  fit.click();
  assert.equal(helios.cameraControls().autoFit, false);

  fit.click();
  assert.equal(helios.cameraControls().autoFit, true);
  assert.equal(helios.requestFrameNetworkCalls.length, 1);

  layout.click();
  assert.equal(layout.getAttribute('aria-label'), 'Run layout');
  layout.click();
  assert.equal(layout.getAttribute('aria-label'), 'Pause layout');

  zoomIn.click();
  assert.equal(helios.cameraControls().autoFit, false);
  assert.ok(helios.renderer.camera.zoom > 1);
  assert.deepEqual(helios.setCameraPoseCalls.at(-1)?.options, { source: 'ui' });
  assert.ok(helios.scheduler.renderRequests > 0);
});

test('quick controls follow the active UI theme', () => {
  const { helios } = createHarness();
  helios.ui = { theme: 'light' };

  const controls = helios._setupQuickControls();

  assert.equal(controls.dataset.theme, 'light');

  helios.ui.theme = 'dark';
  helios._syncQuickControlsTheme();

  assert.equal(controls.dataset.theme, 'dark');

  helios._syncQuickControlsTheme('light');

  assert.equal(controls.dataset.theme, 'light');
});

test('quick controls can be disabled before setup', () => {
  const { helios, root } = createHarness();
  helios._quickControlsConfig = { ...helios._quickControlsConfig, enabled: false };

  const controls = helios._setupQuickControls();

  assert.equal(controls, null);
  assert.equal(root.children.length, 0);
  assert.deepEqual(helios.overlayInsets(), { top: 0, right: 0, bottom: 0, left: 0 });
});
