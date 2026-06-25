import { getWindowDevicePixelRatio, resolveEffectiveDevicePixelRatio } from '../rendering/qualityOptions.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function resolveContainer(target) {
  if (!target && typeof document !== 'undefined') {
    return document.body;
  }
  if (typeof target === 'string') {
    const element = document.querySelector(target);
    if (!element) {
      throw new Error(`Unable to find container using selector "${target}"`);
    }
    return element;
  }
  return target;
}

function normalizeViewportInsets(insets) {
  if (!insets || typeof insets !== 'object') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const coerce = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  };
  return {
    top: coerce(insets.top),
    right: coerce(insets.right),
    bottom: coerce(insets.bottom),
    left: coerce(insets.left),
  };
}

/**
 * Manages the DOM layers (canvas, SVG overlay, HTML overlays) that can be used
 * by Helios for rendering and interaction.
 */
export class LayerManager {
  constructor(target, options = {}) {
    this.container = resolveContainer(target);
    if (!this.container) {
      throw new Error('A valid container element is required');
    }
    this.options = options;

    const suppressBrowserGestures = options.suppressBrowserGestures !== false;

    this.root = document.createElement('div');
    this.root.className = 'helios-root';
    Object.assign(this.root.style, {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      touchAction: suppressBrowserGestures ? 'none' : 'auto',
      ...(suppressBrowserGestures
        ? { overscrollBehavior: 'none', overscrollBehaviorX: 'none', overscrollBehaviorY: 'none' }
        : null),
    });

    this.canvas3d = document.createElement('canvas');
    this.canvas3d.className = 'helios-layer-canvas3d';
    Object.assign(this.canvas3d.style, {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      display: 'block',
      userSelect: 'none',
      webkitUserSelect: 'none',
      touchAction: suppressBrowserGestures ? 'none' : 'auto',
      ...(suppressBrowserGestures
        ? { overscrollBehavior: 'none', overscrollBehaviorX: 'none', overscrollBehaviorY: 'none' }
        : null),
    });

    this.svgLayer = document.createElementNS(SVG_NS, 'svg');
    this.svgLayer.classList.add('helios-layer-svg');
    Object.assign(this.svgLayer.style, {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      userSelect: 'none',
      webkitUserSelect: 'none',
    });

    this.htmlOverlay = document.createElement('div');
    this.htmlOverlay.className = 'helios-layer-overlay';
    Object.assign(this.htmlOverlay.style, {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      userSelect: 'none',
      webkitUserSelect: 'none',
    });

    this.viewport = document.createElement('div');
    this.viewport.className = 'helios-layer-viewport';
    Object.assign(this.viewport.style, {
      position: 'absolute',
      inset: '0px',
      overflow: 'hidden',
      userSelect: 'none',
      webkitUserSelect: 'none',
    });

    this.viewport.appendChild(this.canvas3d);
    this.viewport.appendChild(this.svgLayer);
    this.viewport.appendChild(this.htmlOverlay);
    this.root.appendChild(this.viewport);

    this.container.appendChild(this.root);

    this._boundWheelBlocker = null;
    if (suppressBrowserGestures) {
      this._boundWheelBlocker = (event) => {
        if (event?.cancelable) event.preventDefault();
        event?.stopPropagation?.();
      };
      this.canvas3d.addEventListener('wheel', this._boundWheelBlocker, { passive: false });
    }

    this.layers = new Map();
    this.resizeListeners = new Set();
    this.viewportInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    const pixelRatio = resolveEffectiveDevicePixelRatio(getWindowDevicePixelRatio(), this.options);
    this.size = { width: 0, height: 0, devicePixelRatio: pixelRatio };

    this.boundResize = () => this.handleResize();
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this.boundResize);
      this.resizeObserver.observe(this.root);
    } else {
      window.addEventListener('resize', this.boundResize);
    }
    this.handleResize();
  }

  get canvas() {
    return this.canvas3d;
  }

  get svg() {
    return this.svgLayer;
  }

  get overlay() {
    return this.htmlOverlay;
  }

  addLayer(name, element) {
    if (this.layers.has(name)) {
      throw new Error(`Layer ${name} already exists`);
    }
    this.layers.set(name, element);
    this.root.appendChild(element);
  }

  setViewportInsets(insets) {
    const next = normalizeViewportInsets(insets);
    const prev = this.viewportInsets;
    if (
      prev.top === next.top
      && prev.right === next.right
      && prev.bottom === next.bottom
      && prev.left === next.left
    ) {
      return this;
    }
    this.viewportInsets = next;
    this.viewport.style.top = `${next.top}px`;
    this.viewport.style.right = `${next.right}px`;
    this.viewport.style.bottom = `${next.bottom}px`;
    this.viewport.style.left = `${next.left}px`;
    this.handleResize();
    return this;
  }

  removeLayer(name) {
    const element = this.layers.get(name);
    if (element) {
      element.remove();
      this.layers.delete(name);
    }
  }

  onResize(callback) {
    this.resizeListeners.add(callback);
    callback({ ...this.size });
    return () => this.resizeListeners.delete(callback);
  }

  setSupersampling(supersampling) {
    this.options.supersampling = supersampling;
    this.handleResize();
  }

  handleResize() {
    const rect = this.viewport.getBoundingClientRect();
    const pixelRatio = resolveEffectiveDevicePixelRatio(getWindowDevicePixelRatio(), this.options);
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (width === this.size.width && height === this.size.height && pixelRatio === this.size.devicePixelRatio) {
      return;
    }

    this.size = { width, height, devicePixelRatio: pixelRatio };
    this.canvas3d.width = Math.floor(width * pixelRatio);
    this.canvas3d.height = Math.floor(height * pixelRatio);

    for (const listener of this.resizeListeners) {
      listener({ ...this.size });
    }
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this.boundResize);
    }
    if (this._boundWheelBlocker) {
      this.canvas3d.removeEventListener('wheel', this._boundWheelBlocker);
      this._boundWheelBlocker = null;
    }
    this.root.remove();
    this.layers.clear();
    this.resizeListeners.clear();
  }
}
