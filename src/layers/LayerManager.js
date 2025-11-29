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

    this.root = document.createElement('div');
    this.root.className = 'helios-root';
    Object.assign(this.root.style, {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: 'hidden',
      touchAction: 'none',
    });

    this.canvas3d = document.createElement('canvas');
    this.canvas3d.className = 'helios-layer-canvas3d';
    Object.assign(this.canvas3d.style, {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      display: 'block',
    });

    this.svgLayer = document.createElementNS(SVG_NS, 'svg');
    this.svgLayer.classList.add('helios-layer-svg');
    Object.assign(this.svgLayer.style, {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    });

    this.htmlOverlay = document.createElement('div');
    this.htmlOverlay.className = 'helios-layer-overlay';
    Object.assign(this.htmlOverlay.style, {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
    });

    this.root.appendChild(this.canvas3d);
    this.root.appendChild(this.svgLayer);
    this.root.appendChild(this.htmlOverlay);

    this.container.appendChild(this.root);

    this.layers = new Map();
    this.resizeListeners = new Set();
    const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
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

  handleResize() {
    const rect = this.root.getBoundingClientRect();
    const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
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
    this.root.remove();
    this.layers.clear();
    this.resizeListeners.clear();
  }
}
