/** @typedef {import('helios-network').default} HeliosNetwork */

import { LayerManager } from './layers/LayerManager.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { StaticLayout, WorkerLayout } from './layouts/Layout.js';
import { createRenderer } from './rendering/createRenderer.js';
import { PerformanceMonitor } from './utilities/PerformanceMonitor.js';
import { VisualAttributes } from './pipeline/VisualAttributes.js';
import { createDefaultMappers, MapperCollection } from './pipeline/Mapper.js';
import { createDebugLogger } from './utilities/DebugLogger.js';

function isLayoutInstance(candidate) {
  return candidate && typeof candidate.step === 'function' && typeof candidate.initialize === 'function';
}

export class Helios {
  constructor(network, options = {}) {
    if (!network) {
      throw new Error('Helios requires a helios-network instance');
    }
    this.network = network;
    this.options = options;
    this.debug = createDebugLogger(options.debug);
    this.debug.log('helios', 'Constructing Helios instance', { mode: options.mode ?? '2d' });
    this.prewarmPromise = null;
    this.mappersDirty = false;
    this.markMappersDirty = () => {
      this.mappersDirty = true;
      this.prewarmPromise = null;
      this.scheduler?.requestGeometry?.();
    };
    const container = options.container ?? document.getElementById('app') ?? document.body;
    this.layers = new LayerManager(container);
    this.visuals = new VisualAttributes(network, this.debug);
    this.nodeMapper = new MapperCollection('node', network, this.markMappersDirty, this.debug);
    this.edgeMapper = new MapperCollection('edge', network, this.markMappersDirty, this.debug);
    const optionMappers = options.mappers;
    if (optionMappers !== null) {
      const initialMappers = optionMappers ?? createDefaultMappers(network);
      if (initialMappers?.nodeMapper) {
        this.nodeMapper.setDefault(initialMappers.nodeMapper);
      }
      if (initialMappers?.edgeMapper) {
        this.edgeMapper.setDefault(initialMappers.edgeMapper);
      }
    }
    this.mappersDirty = true;
    this.visuals.seedMissingPositions(this.layers.size);
    const debugPerformance = options.debugPerformance?? false;
    const performanceWindow = options.performanceWindow ?? 60;
    const performanceLogEvery = options.performanceLogEvery ?? performanceWindow;
    this.performanceMonitor = new PerformanceMonitor({
      enabled: debugPerformance,
      windowSize: performanceWindow,
      logEvery: performanceLogEvery,
    });
    this.manualRendering = options.manualRendering === true;
    this.scheduler = new Scheduler({
      performanceMonitor: this.performanceMonitor,
      maxFps: options.maxFps,
      debug: this.debug,
    });
    if (options.prewarm === true) {
      this.prewarm({ updateDenseBuffers: options.prewarmDenseBuffers !== false });
    }
    this.layout = this.createLayout(options.layout);
    this.renderer = null;
    this.size = { ...this.layers.size };
    this.removeResizeListener = null;
    this.firstGeometryUpdateComplete = false;
    this.ready = this.initialize();
  }

  async initialize() {
    this.debug.log('helios', 'Initializing layout');
    if (this.layout?.setUpdateListener) {
      this.layout.setUpdateListener(() => {
        this.visuals.markPositionsDirty();
        this.scheduler.requestGeometry();
        this.debug.log('layout', 'Layout requested geometry update');
      });
    }
    await this.layout?.initialize?.();
    this.debug.log('helios', 'Layout initialized', { layout: this.layout?.constructor?.name });
    this.layout?.resize?.(this.layers.size);
    this.debug.log('layout', 'Layout resized to initial viewport', this.layers.size);

    this.debug.log('helios', 'Creating renderer', {
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      renderer: this.options.renderer ?? 'auto',
    });
    this.renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
      forceWebGPU: this.options.renderer === 'webgpu',
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
      edgeEndpointTrim: this.options.edgeEndpointTrim,
    });
    this.debug.log('helios', 'Renderer created', { renderer: this.renderer?.constructor?.name });
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
    }
    if (this.renderer?.camera?.setChangeListener) {
      this.renderer.camera.setChangeListener(() => {
        this.scheduler.requestRender();
        this.debug.log('helios', 'Camera change requested render');
      });
    }

    this.removeResizeListener = this.layers.onResize((size) => {
      this.size = size;
      if (this.renderer?.resize) {
        this.renderer.resize(size);
      }
      this.layout?.resize?.(size);
      if (!this.manualRendering) {
        this.scheduler.requestGeometry();
        this.scheduler.requestRender();
        this.debug.log('helios', 'Resize requested geometry/render', size);
      }
    });

    this.debug.log('scheduler', 'Setting scheduler callbacks');
    this.scheduler.setLayout(this.layout);
    this.scheduler.setGeometryCallback(() => {
      if (this.mappersDirty) {
        this.debug.log('mapper', 'Applying mappers to visuals');
        this.visuals.applyMappers({
          nodeMapper: this.nodeMapper.toCombinedMapper(),
          edgeMapper: this.edgeMapper.toCombinedMapper(),
        });
        this.mappersDirty = false;
      }
      const frame = {
        network: this.network,
        timestamp: performance.now(),
        camera: this.renderer?.camera,
      };
      if (!this.firstGeometryUpdateComplete) {
        this.firstGeometryUpdateComplete = true;
        this.debug.log('scheduler', 'First geometry frame ready', {
          nodes: this.network?.nodeCount,
          edges: this.network?.edgeCount,
        });
      } else {
        this.debug.log('scheduler', 'Geometry frame prepared', {
          nodes: this.network?.nodeCount,
          edges: this.network?.edgeCount,
        });
      }
      return frame;
    });
    this.scheduler.setRenderCallback((frame) => {
      this.debug.log('scheduler', 'Rendering frame', {
        renderer: this.renderer?.constructor?.name,
        size: this.size,
      });
      if (this.firstGeometryUpdateComplete && this.renderer && typeof this.renderer.render === 'function') {
        this.renderer.render(frame, this.size);
      }
    });
    if (!this.manualRendering) {
      this.scheduler.start();
      this.scheduler.requestGeometry();
      this.debug.log('scheduler', 'Scheduler started (auto rendering)');
    } else {
      // In manual mode, run initial geometry setup but don't start scheduler
      if (this.mappersDirty) {
        this.visuals.applyMappers({
          nodeMapper: this.nodeMapper.toCombinedMapper(),
          edgeMapper: this.edgeMapper.toCombinedMapper(),
        });
        this.mappersDirty = false;
      }
      this.firstGeometryUpdateComplete = true;
      this.debug.log('helios', 'Manual rendering enabled, initial geometry applied');
    }
    this.debug.log('helios', 'Initialization complete');
  }

  /**
   * Pre-runs mapper application and (optionally) dense buffer rebuilds. Useful
   * for large graphs where the first geometry pass is expensive.
   * Can be awaited before `helios.ready` to shorten time to first render.
   */
  async prewarm(options = {}) {
    if (this.prewarmPromise) return this.prewarmPromise;
    const { updateDenseBuffers = true } = options;
    this.debug.log('helios', 'Prewarming visuals before ready', { updateDenseBuffers });
    this.prewarmPromise = (async () => {
      if (this.mappersDirty) {
        this.visuals.applyMappers({
          nodeMapper: this.nodeMapper.toCombinedMapper(),
          edgeMapper: this.edgeMapper.toCombinedMapper(),
        });
        this.mappersDirty = false;
      }
      if (updateDenseBuffers) {
        this.visuals.updateDenseBuffers?.();
      }
      this.scheduler?.requestGeometry?.();
    })();
    try {
      await this.prewarmPromise;
    } catch (error) {
      this.prewarmPromise = null;
      this.debug.log('helios', 'Prewarm failed', { error });
      throw error;
    }
    return this.prewarmPromise;
  }

  createLayout(layoutOption) {
    if (isLayoutInstance(layoutOption)) {
      return layoutOption;
    }
    if (layoutOption?.type === 'worker') {
      const workerOptions = { ...(layoutOption.options ?? {}), mode: this.options.mode ?? '2d' };
      this.debug.log('layout', 'Using worker layout', workerOptions);
      return new WorkerLayout(this.network, this.visuals, workerOptions);
    }
    const w = this.layers.size.width;
    const h = this.layers.size.height;
    this.debug.log('layout', 'Using static layout', { width: w, height: h });
    return new StaticLayout(this.network, this.visuals, {
      bounds: [-w * 0.5, -h * 0.5, w * 0.5, h * 0.5],
    });
  }

  addNodes(count, initializer) {
    const nodes = this.network.addNodes(count);
    this.debug.log('helios', 'Adding nodes', { count });
    this.visuals.applyNodeDefaults(nodes);
    this.visuals.seedMissingPositions(this.layers.size);
    if (initializer) {
      initializer(nodes, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this.mappersDirty = true;
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout();
    this.scheduler.requestGeometry();
    return nodes;
  }

  addEdges(edges, initializer) {
    const edgeIndices = this.network.addEdges(edges);
    this.debug.log('helios', 'Adding edges', { count: edgeIndices?.length ?? 0 });
    this.visuals.applyEdgeDefaults(edgeIndices);
    if (initializer) {
      initializer(edgeIndices, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this.mappersDirty = true;
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout();
    this.scheduler.requestGeometry();
    return edgeIndices;
  }

  notifyNetworkChanged({ nodes, edges } = {}) {
    if (nodes) {
      this.debug.log('helios', 'Network nodes changed', { count: nodes.length ?? nodes.size ?? nodes });
      this.visuals.applyNodeDefaults(nodes);
      this.visuals.seedMissingPositions(this.layers.size);
    }
    if (edges) {
      this.debug.log('helios', 'Network edges changed', { count: edges.length ?? edges.size ?? edges });
      this.visuals.applyEdgeDefaults(edges);
    }
    this.visuals.markPositionsDirty();
    this.mappersDirty = true;
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout();
    this.scheduler.requestGeometry();
  }

  setMappers({ nodeMapper, edgeMapper } = {}) {
    if (nodeMapper === null && edgeMapper === null) {
      this.debug.log('mapper', 'Resetting mappers to defaults');
      this.nodeMapper = new MapperCollection('node', this.network, () => {
        this.markMappersDirty();
      }, this.debug);
      this.edgeMapper = new MapperCollection('edge', this.network, () => {
        this.markMappersDirty();
      }, this.debug);
      this.mappersDirty = true;
      this.scheduler?.requestGeometry?.();
      this.scheduler.requestGeometry();
      return;
    }
    if (nodeMapper) {
      this.debug.log('mapper', 'Replacing node mapper');
      this.nodeMapper.setDefault(nodeMapper);
    }
    if (edgeMapper) {
      this.debug.log('mapper', 'Replacing edge mapper');
      this.edgeMapper.setDefault(edgeMapper);
    }
    this.mappersDirty = true;
    this.scheduler.requestGeometry();
  }

  setLayout(layout) {
    if (!isLayoutInstance(layout)) {
      throw new Error('Layout must extend the Layout base class');
    }
    this.layout?.dispose?.();
    this.layout = layout;
    this.debug.log('layout', 'Layout replaced', { layout: layout?.constructor?.name });
    this.layout.setUpdateListener(() => {
      this.visuals.markPositionsDirty();
      this.scheduler.requestGeometry();
    });
    this.debug.log('layout', 'Initializing new layout instance');
    this.layout.initialize?.();
    this.layout.resize?.(this.layers.size);
    this.debug.log('layout', 'Layout initialized and resized', this.layers.size);
    this.scheduler.setLayout(layout);
    this.scheduler.requestLayout();
    this.scheduler.requestRender();
  }

  requestRender() {
    this.scheduler.requestRender();
  }

  performRendering() {
    if (!this.manualRendering) {
      console.warn('performRendering() should only be called when manualRendering option is enabled');
      return;
    }
    if (!this.firstGeometryUpdateComplete) {
      console.warn('performRendering() called before initialization is complete');
      return;
    }
    // Update geometry if needed
    // if (this.mappersDirty) {
    //   this.visuals.applyMappers({
    //     nodeMapper: this.nodeMapper.toCombinedMapper(),
    //     edgeMapper: this.edgeMapper.toCombinedMapper(),
    //   });
    //   this.mappersDirty = false;
    // }
    // Create frame and render
    const frame = {
      network: this.network,
      timestamp: performance.now(),
    };
    if (this.renderer && typeof this.renderer.render === 'function') {
      this.renderer.render(frame, this.size);
    }
  }

  destroy() {
    this.scheduler.stop();
    this.layout?.dispose?.();
    if (this.removeResizeListener) {
      this.removeResizeListener();
      this.removeResizeListener = null;
    }
    this.renderer?.destroy?.();
    this.layers.destroy();
  }
}

export default Helios;
