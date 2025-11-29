/** @typedef {import('helios-network').default} HeliosNetwork */

import { LayerManager } from './layers/LayerManager.js';
import { Pipeline } from './pipeline/Pipeline.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { StaticLayout, WorkerLayout } from './layouts/Layout.js';
import { AttributeMapperUtility } from './pipeline/AttributeMapperUtility.js';
import { createRenderer } from './rendering/createRenderer.js';

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
    const container = options.container ?? document.getElementById('app') ?? document.body;
    this.layers = new LayerManager(container);
    this.pipeline = new Pipeline(network);
    this.attributeMappings = new AttributeMapperUtility(network, this.pipeline.visuals);
    this.scheduler = new Scheduler();
    this.layout = this.createLayout(options.layout);
    this.renderer = null;
    this.size = { ...this.layers.size };
    this.removeResizeListener = null;
    this.ready = this.initialize();
  }

  async initialize() {
    if (this.layout?.setUpdateListener) {
      this.layout.setUpdateListener(() => {
        this.pipeline.markPositionsDirty();
        this.scheduler.requestGeometry();
      });
    }
    await this.layout?.initialize?.();
    this.layout?.resize?.(this.layers.size);

    this.renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
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
      this.scheduler.requestGeometry();
    });

    this.scheduler.setLayout(this.layout);
    this.scheduler.setGeometryCallback(() => this.pipeline.buildFrame());
    this.scheduler.setRenderCallback((frame) => {
      if (this.renderer && typeof this.renderer.render === 'function') {
        this.renderer.render(frame, this.size);
      }
    });
    this.scheduler.start();
    this.scheduler.requestGeometry();
  }

  createLayout(layoutOption) {
    if (isLayoutInstance(layoutOption)) {
      return layoutOption;
    }
    if (layoutOption?.type === 'worker') {
      return new WorkerLayout(this.network, this.pipeline.visuals, layoutOption.options);
    }
    return new StaticLayout(this.network, this.pipeline.visuals, {
      bounds: [0, 0, this.layers.size.width, this.layers.size.height],
    });
  }

  addNodes(count, initializer) {
    const nodes = this.network.addNodes(count);
    this.pipeline.visuals.applyNodeDefaults(nodes);
    if (initializer) {
      initializer(nodes, this.pipeline.visuals);
    }
    this.pipeline.markPositionsDirty();
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout();
    this.scheduler.requestGeometry();
    return nodes;
  }

  addEdges(edges, initializer) {
    const edgeIndices = this.network.addEdges(edges);
    this.pipeline.visuals.applyEdgeDefaults(edgeIndices);
    if (initializer) {
      initializer(edgeIndices, this.pipeline.visuals);
    }
    this.pipeline.markPositionsDirty();
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout();
    this.scheduler.requestGeometry();
    return edgeIndices;
  }

  notifyNetworkChanged({ nodes, edges } = {}) {
    if (nodes) {
      this.pipeline.visuals.applyNodeDefaults(nodes);
    }
    if (edges) {
      this.pipeline.visuals.applyEdgeDefaults(edges);
    }
    this.pipeline.markPositionsDirty();
    this.layout?.requestUpdate?.();
    this.scheduler.requestLayout();
    this.scheduler.requestGeometry();
  }

  setLayout(layout) {
    if (!isLayoutInstance(layout)) {
      throw new Error('Layout must extend the Layout base class');
    }
    this.layout?.dispose?.();
    this.layout = layout;
    this.layout.setUpdateListener(() => {
      this.pipeline.markPositionsDirty();
      this.scheduler.requestGeometry();
    });
    this.layout.initialize?.();
    this.scheduler.setLayout(layout);
    this.scheduler.requestLayout();
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
