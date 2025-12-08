import { GraphLayerWebGL } from './GraphLayerWebGL.js';
import { GraphLayerWebGPU } from './GraphLayerWebGPU.js';
import { WebGL2Device } from './WebGL2Device.js';
import { WebGPUDevice } from './WebGPUDevice.js';
import { Camera } from '../Camera.js';

/**
 * High-level orchestrator that owns the underlying graphics device (WebGL2 or
 * WebGPU) and a set of render layers. Layers can be provided by the developer
 * to draw arbitrary accelerated content alongside the default network layer.
 */
export class LayeredRenderer {
  constructor(canvas, options = {}) {
    const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.canvas = canvas;
    this.options = { transparencyModeEdges: 'alpha', ...options };
    this.clearColor = options.clearColor ?? [0.01, 0.01, 0.02, 1];
    this.layers = [];
    this.device = null;
    this.size = { width: 1, height: 1, devicePixelRatio: pixelRatio };
    this.renderTarget = null;
    this.presentRect = null;
    this.camera = options.camera ?? new Camera(canvas, { ...options, viewport: this.size, target: null });

    // Default graph drawing layer will be created once a device is chosen.
    this.graphLayer = null;
  }

  /**
   * Chooses the best available device (WebGPU preferred) and initializes all
   * registered layers.
   */
  async initialize() {
    if (this.device) return;
    const { forceWebGL, forceWebGPU } = this.options;
    const webgpuSupported = await WebGPUDevice.isSupported();
    const shouldTryWebGPU = forceWebGPU || (!forceWebGL && webgpuSupported);

    if (shouldTryWebGPU) {
      try {
        this.device = new WebGPUDevice(this.canvas, this.options);
        await this.device.initialize();
      } catch (error) {
        if (forceWebGPU) {
          throw error;
        }
        console.warn('WebGPU initialization failed, falling back to WebGL2', error);
        this.device = null;
      }
    }

    if (!this.device) {
      this.device = new WebGL2Device(this.canvas, this.options);
      await this.device.initialize();
    }
    this.device.resize(this.size);
    if (this.camera && this.size) {
      this.camera.setTarget([this.size.width * 0.5, this.size.height * 0.5, 0]);
    }
    this.ensureGraphLayer();
    for (const layer of this.layers) {
      layer.initialize?.(this.device, this.size);
    }
  }

  /**
   * Adds a custom render layer. If the renderer is already initialized, the
   * layer will be initialized immediately.
   * @param {object} layer
   * @param {object} [options]
   */
  addLayer(layer, options = {}) {
    if (options.before) {
      const index = this.layers.findIndex((entry) => entry === options.before || entry?.name === options.before);
      if (index >= 0) {
        this.layers.splice(index, 0, layer);
      } else {
        this.layers.push(layer);
      }
    } else {
      this.layers.push(layer);
    }
    if (this.device) {
      layer.initialize?.(this.device, this.size);
    }
  }

  removeLayer(layerOrName) {
    const index = this.layers.findIndex(
      (entry) => entry === layerOrName || entry?.name === layerOrName || entry?.id === layerOrName,
    );
    if (index >= 0) {
      const [removed] = this.layers.splice(index, 1);
      removed?.destroy?.();
    }
  }

  setRenderTarget(framebuffer) {
    this.renderTarget = framebuffer;
  }

  /**
   * Presents a framebuffer onto the default canvas. When a rect is provided,
   * the framebuffer is drawn into that viewport without scaling the canvas
   * size.
   * @param {import('./types').FramebufferTarget} framebuffer
   * @param {{ x: number, y: number, width: number, height: number }} [rect]
   */
  presentFramebuffer(framebuffer, rect) {
    this.presentRect = rect ?? null;
    this.device?.presentFramebuffer(framebuffer, rect);
  }

  setEdgeRenderingMode(mode) {
    this.options.edgeRendering = mode;
    this.graphLayer?.setEdgeRenderingMode?.(mode);
  }

  setEdgeTransparencyMode(mode) {
    this.options.transparencyModeEdges = mode;
    this.graphLayer?.setEdgeTransparencyMode?.(mode);
  }

  /**
   * Allocates an off-screen framebuffer that can be used as a render target.
   * @param {number} width
   * @param {number} height
   */
  createFramebuffer(width, height) {
    if (!this.device) {
      throw new Error('Renderer not initialized. Call initialize() first.');
    }
    return this.device.createFramebuffer(width, height);
  }

  /**
   * Returns a Float32Array in clip space (-1..1) for the supplied world-space
   * pixel coordinates. Useful for recovering transformed vectors without
   * re-deriving math inside layers.
   * @param {[number, number]} vector
   * @returns {[number, number]}
   */
  projectToClip(vector) {
    const [x, y] = vector;
    const clipX = (x / this.size.width) * 2 - 1;
    const clipY = (y / this.size.height) * -2 + 1;
    return [clipX, clipY];
  }

  /**
   * Converts clip-space coordinates back to pixel space.
   * @param {[number, number]} vector
   * @returns {[number, number]}
   */
  unprojectFromClip(vector) {
    const [x, y] = vector;
    const worldX = ((x + 1) * 0.5) * this.size.width;
    const worldY = ((-y + 1) * 0.5) * this.size.height;
    return [worldX, worldY];
  }

  resize(size) {
    this.size = size;
    this.camera?.setViewport(size);
    if (this.camera && size?.width && size?.height) {
      this.camera.setTarget([size.width * 0.5, size.height * 0.5, 0]);
    }
    this.device?.resize(size);
    for (const layer of this.layers) {
      layer.resize?.(size, this.device);
    }
  }

  /**
   * Captures pixels from a framebuffer. Falls back to the default canvas when
   * no target is supplied.
   */
  async readPixels(framebuffer, rect) {
    if (!this.device) return null;
    return this.device.readPixels(framebuffer, rect);
  }

  /**
   * Main render entry point. Each layer receives a per-frame context so
   * additional accelerated content can be drawn.
   */
  render(frame) {
    if (!this.device) return;
    const renderPayload = frame ? { ...frame, camera: frame.camera ?? this.camera } : { camera: this.camera };
    const context = this.device.beginFrame(this.renderTarget, this.clearColor, this.presentRect);
    for (const layer of this.layers) {
      layer.render?.(context, renderPayload, this.size);
    }
    this.device.endFrame(context);
    this.presentRect = null;
  }

  destroy() {
    for (const layer of this.layers) {
      layer.destroy?.();
    }
    this.device?.destroy?.();
    this.camera?.destroy?.();
  }

  ensureGraphLayer() {
    if (this.graphLayer) return;
    const options = {
      edgeRendering: this.options.edgeRendering,
      nodeOutlineColor: this.options.nodeOutlineColor,
      transparencyModeEdges: this.options.transparencyModeEdges,
    };
    if (this.device?.type === 'webgpu') {
      this.graphLayer = new GraphLayerWebGPU(options);
    } else {
      this.graphLayer = new GraphLayerWebGL(options);
    }
    // Keep the graph layer first to match previous ordering.
    this.layers.unshift(this.graphLayer);
  }
}

export default LayeredRenderer;
