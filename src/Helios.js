/** @typedef {import('helios-network').default} HeliosNetwork */

import { LayerManager } from './layers/LayerManager.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { StaticLayout, WorkerLayout } from './layouts/Layout.js';
import { createRenderer } from './rendering/createRenderer.js';
import { PerformanceMonitor } from './utilities/PerformanceMonitor.js';
import { VisualAttributes } from './pipeline/VisualAttributes.js';
import { createDefaultMappers, MapperCollection } from './pipeline/Mapper.js';

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
    this.mappersDirty = false;
    this.markMappersDirty = () => {
      this.mappersDirty = true;
      this.scheduler?.requestGeometry?.();
    };
    const container = options.container ?? document.getElementById('app') ?? document.body;
    this.layers = new LayerManager(container);
    this.visuals = new VisualAttributes(network);
    this.nodeMapper = new MapperCollection('node', network, this.markMappersDirty);
    this.edgeMapper = new MapperCollection('edge', network, this.markMappersDirty);
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
    this.scheduler = new Scheduler({ performanceMonitor: this.performanceMonitor });
    this.layout = this.createLayout(options.layout);
    this.renderer = null;
    this.size = { ...this.layers.size };
    this.removeResizeListener = null;
    this.firstGeometryUpdateComplete = false;
    this.ready = this.initialize();
  }

  async initialize() {
    if (this.layout?.setUpdateListener) {
      this.layout.setUpdateListener(() => {
        this.visuals.markPositionsDirty();
        this.scheduler.requestGeometry();
      });
    }
    await this.layout?.initialize?.();
    this.layout?.resize?.(this.layers.size);

    this.renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
      forceWebGPU: this.options.renderer === 'webgpu',
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
    });
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
    }

    this.removeResizeListener = this.layers.onResize((size) => {
      this.size = size;
      if (this.renderer?.resize) {
        this.renderer.resize(size);
      }
      this.layout?.resize?.(size);
      if (!this.manualRendering) {
        this.scheduler.requestGeometry();
      }
    });

    this.scheduler.setLayout(this.layout);
    this.scheduler.setGeometryCallback(() => {
      if (this.mappersDirty) {
        this.visuals.applyMappers({
          nodeMapper: this.nodeMapper.toCombinedMapper(),
          edgeMapper: this.edgeMapper.toCombinedMapper(),
        });
        this.mappersDirty = false;
      }
      this.firstGeometryUpdateComplete = true;
      return {
        network: this.network,
        timestamp: performance.now(),
      };
    });
    this.scheduler.setRenderCallback((frame) => {
      if (this.firstGeometryUpdateComplete && this.renderer && typeof this.renderer.render === 'function') {
        this.renderer.render(frame, this.size);
      }
    });
    if (!this.manualRendering) {
      this.scheduler.start();
      this.scheduler.requestGeometry();
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
    }
  }

  createLayout(layoutOption) {
    if (isLayoutInstance(layoutOption)) {
      return layoutOption;
    }
    if (layoutOption?.type === 'worker') {
      const workerOptions = { ...(layoutOption.options ?? {}), mode: this.options.mode ?? '2d' };
      return new WorkerLayout(this.network, this.visuals, workerOptions);
    }
    const w = this.layers.size.width;
    const h = this.layers.size.height;
    return new StaticLayout(this.network, this.visuals, {
      bounds: [-w * 0.5, -h * 0.5, w * 0.5, h * 0.5],
    });
  }

  addNodes(count, initializer) {
    const nodes = this.network.addNodes(count);
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
      this.visuals.applyNodeDefaults(nodes);
      this.visuals.seedMissingPositions(this.layers.size);
    }
    if (edges) {
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
      this.nodeMapper = new MapperCollection('node', this.network, () => {
        this.markMappersDirty();
      });
      this.edgeMapper = new MapperCollection('edge', this.network, () => {
        this.markMappersDirty();
      });
      this.mappersDirty = true;
      this.scheduler?.requestGeometry?.();
      this.scheduler.requestGeometry();
      return;
    }
    if (nodeMapper) {
      this.nodeMapper.setDefault(nodeMapper);
    }
    if (edgeMapper) {
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
    this.layout.setUpdateListener(() => {
      this.visuals.markPositionsDirty();
      this.scheduler.requestGeometry();
    });
    this.layout.initialize?.();
    this.scheduler.setLayout(layout);
    this.scheduler.requestLayout();
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
