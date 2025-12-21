import {
  NODE_WGSL,
  EDGE_WGSL,
  EDGE_WEIGHTED_WGSL,
  EDGE_WEIGHTED_RESOLVE_WGSL,
  createEdgeWeightedResolveTonemapWGSL,
} from './shaders/graphWebGPU.js';
import { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './GraphLayerCommon.js';
import { GraphLayer } from './GraphLayer.js';
import { FrameGraphRunner } from './framegraph/FrameGraphRunner.js';

export class GraphLayerWebGPU extends GraphLayer {
  constructor(options = {}) {
    super(options);
    this.device = null;

    this.frameGraph = new FrameGraphRunner();

    this.nodeBindGroupLayout = null;
    this.edgeBindGroupLayout = null;
    this.nodePipeline = null;
    this.edgePipeline = null;
    this.edgeQuadPipeline = null;
    this.edgeWeightedPipeline = null;
    this.edgeWeightedQuadPipeline = null;
    this.edgeResolvePipeline = null;
    this.edgeResolvePipelineCache = new Map();
    this.edgeResolveModuleCache = new Map();
    this.edgeResolveBindGroup = null;
    this.edgeResolveLayout = null;
    this.weightedSampler = null;
    this.weightedTextures = null;
    this.weightedSupported = null;
    this.warnedWeightedFallback = false;
    this.edgePipelineCache = new Map();
    this.edgeQuadPipelineCache = new Map();
    this.currentEdgeBlend = 'alpha';
    this.edgeWeightedModule = null;
    this.edgeResolveModule = null;
    this.weightedPipelineFormats = null;
    this.nodeBindGroup = null;
    this.edgeBindGroup = null;
    this.edgeModule = null;
    this.baseDepthStencil = null;
    this.cameraArray = null;
    this.cameraBuffer = null;
    this.globalsArray = null;
    this.globalsBuffer = null;
    this.nodeBuffersGpu = {};
    this.edgeBuffersGpu = {};
    this.nodeQuadBufferGpu = null;
    this.edgeQuadBufferGpu = null;
    this._nodeDataCache = { positions: null, sizes: null, colors: null, indices: null, count: 0 };
    this._edgeDataCache = { segments: null, widths: null, endpointSizes: null, colors: null, indices: null, opacities: null, count: 0 };
  }

  initialize(device, size) {
    if (device?.type !== 'webgpu') {
      throw new Error('GraphLayerWebGPU requires a WebGPU device.');
    }
    super.initialize(device, size);
    this.device = device;
    this.initializeWebGPU(device);
    this.resize(size);
  }

  resize(size) {
    super.resize(size);
  }

  destroy() {
    this.nodeBuffersGpu.indices?.buffer?.destroy?.();
    this.nodeBuffersGpu.positions?.buffer?.destroy?.();
    this.nodeBuffersGpu.sizes?.buffer?.destroy?.();
    this.nodeBuffersGpu.colors?.buffer?.destroy?.();
    this.edgeBuffersGpu.indices?.buffer?.destroy?.();
    this.edgeBuffersGpu.segments?.buffer?.destroy?.();
    this.edgeBuffersGpu.colors?.buffer?.destroy?.();
    this.edgeBuffersGpu.widths?.buffer?.destroy?.();
    this.edgeBuffersGpu.opacities?.buffer?.destroy?.();
    this.edgeBuffersGpu.endpointSizes?.buffer?.destroy?.();
    this.cameraBuffer?.destroy?.();
    this.globalsBuffer?.destroy?.();
    this.nodeQuadBufferGpu?.destroy?.();
    this.edgeQuadBufferGpu?.destroy?.();
    this.weightedTextures?.color?.destroy?.();
    this.weightedTextures?.weight?.destroy?.();
  }

  setEdgeRenderingMode(mode) {
    super.setEdgeRenderingMode(mode);
  }

  initializeWebGPU(device) {
    this.cameraArray = new Float32Array(48);
    this.cameraBuffer = device.device.createBuffer({
      size: this.cameraArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.globalsArray = new Float32Array(24);
    this.globalsBuffer = device.device.createBuffer({
      size: this.globalsArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    this.nodeQuadBufferGpu = device.device.createBuffer({
      size: quad.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.nodeQuadBufferGpu.getMappedRange()).set(quad);
    this.nodeQuadBufferGpu.unmap();
    const edgeQuad = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    this.edgeQuadBufferGpu = device.device.createBuffer({
      size: edgeQuad.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.edgeQuadBufferGpu.getMappedRange()).set(edgeQuad);
    this.edgeQuadBufferGpu.unmap();

    this.nodeBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        {
          binding: 4,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' },
        },
        { binding: 5, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.edgeBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        {
          binding: 3,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' },
        },
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 7, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const nodeModule = device.device.createShaderModule({ code: NODE_WGSL });
    const edgeModule = device.device.createShaderModule({ code: EDGE_WGSL });
    this.edgeModule = edgeModule;
    const depthStencil = {
      format: device.depthFormat ?? 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less-equal',
    };
    this.baseDepthStencil = depthStencil;
    const alphaBlend = {
      color: {
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
      alpha: {
        srcFactor: 'src-alpha',
        dstFactor: 'one-minus-src-alpha',
        operation: 'add',
      },
    };

    this.nodePipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.nodeBindGroupLayout] }),
      vertex: {
        module: nodeModule,
        entryPoint: 'nodeVertex',
        buffers: [
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
            stepMode: 'vertex',
          },
        ],
      },
      fragment: {
        module: nodeModule,
        entryPoint: 'nodeFragment',
        targets: [{ format: device.format, blend: alphaBlend }],
      },
      depthStencil,
      primitive: { topology: 'triangle-strip' },
    });

    this.createEdgePipelines('alpha', alphaBlend, edgeModule, depthStencil);
  }

  ensureBufferGpu(entry, requiredBytes, usage, device, maxBindingSize, label = 'storage buffer') {
    const aligned = Math.max(256, Math.ceil(requiredBytes / 256) * 256);
    if ((usage & GPUBufferUsage.STORAGE) && maxBindingSize && aligned > maxBindingSize) {
      const message = `${label} requires ${aligned} bytes, exceeding maxStorageBufferBindingSize (${maxBindingSize}).`;
      console.warn(message);
      throw new Error(message);
    }
    if (!entry || aligned > entry.size) {
      entry?.buffer?.destroy?.();
      return {
        buffer: device.createBuffer({ size: aligned, usage }),
        size: aligned,
      };
    }
    return entry;
  }

  updateNodeBuffersGpu(nodes, device, maxBindingSize) {
    const { positions, sizes, colors, indices } = nodes;
    const nodeCount = Math.floor((positions?.length ?? 0) / 3);
    const cache = this._nodeDataCache;
    const sameView = (a, b) => a && b && a.buffer === b.buffer && a.byteOffset === b.byteOffset && a.byteLength === b.byteLength;
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.nodeBuffersGpu.indices = this.ensureBufferGpu(
      this.nodeBuffersGpu.indices,
      indices.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Node index buffer',
    );
    this.nodeBuffersGpu.positions = this.ensureBufferGpu(
      this.nodeBuffersGpu.positions,
      positions.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Node position buffer',
    );
    this.nodeBuffersGpu.sizes = this.ensureBufferGpu(
      this.nodeBuffersGpu.sizes,
      sizes.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Node size buffer',
    );
    this.nodeBuffersGpu.colors = this.ensureBufferGpu(
      this.nodeBuffersGpu.colors,
      colors.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Node color buffer',
    );

    const buffersChanged = (
      this._nodeBuffersLast?.indices !== this.nodeBuffersGpu.indices?.buffer
      || this._nodeBuffersLast?.positions !== this.nodeBuffersGpu.positions?.buffer
      || this._nodeBuffersLast?.sizes !== this.nodeBuffersGpu.sizes?.buffer
      || this._nodeBuffersLast?.colors !== this.nodeBuffersGpu.colors?.buffer
    );

    // Layout mutates the same underlying views each tick, so even when the
    // typed array identity is stable we still need to push fresh data to the GPU.
    // Always upload when we have nodes to avoid stale positions/sizes/colors.
    if (nodeCount > 0) {
      device.queue.writeBuffer(this.nodeBuffersGpu.indices.buffer, 0, indices);
      device.queue.writeBuffer(this.nodeBuffersGpu.positions.buffer, 0, positions);
      device.queue.writeBuffer(this.nodeBuffersGpu.sizes.buffer, 0, sizes);
      device.queue.writeBuffer(this.nodeBuffersGpu.colors.buffer, 0, colors);
      cache.positions = positions;
      cache.sizes = sizes;
      cache.colors = colors;
      cache.indices = indices;
      cache.count = nodeCount;
    }

    if (buffersChanged || !this.nodeBindGroup) {
      this.nodeBindGroup = device.createBindGroup({
        layout: this.nodeBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.cameraBuffer } },
          { binding: 1, resource: { buffer: this.nodeBuffersGpu.indices.buffer } },
          { binding: 2, resource: { buffer: this.nodeBuffersGpu.positions.buffer } },
          { binding: 3, resource: { buffer: this.nodeBuffersGpu.sizes.buffer } },
          { binding: 4, resource: { buffer: this.nodeBuffersGpu.colors.buffer } },
          { binding: 5, resource: { buffer: this.globalsBuffer } },
        ],
      });
      this._nodeBuffersLast = {
        indices: this.nodeBuffersGpu.indices.buffer,
        positions: this.nodeBuffersGpu.positions.buffer,
        sizes: this.nodeBuffersGpu.sizes.buffer,
        colors: this.nodeBuffersGpu.colors.buffer,
      };
    }
  }

  updateEdgeBuffersGpu(edges, device, maxBindingSize) {
    const { segments, colors, indices, widths, endpointSizes, opacities } = edges;
    if (!endpointSizes) {
      throw new Error('Edge endpoint sizes buffer is missing; dense buffers must include endpointSizes.');
    }
    const edgeCount = Math.floor((segments?.length ?? 0) / 6);
    const cache = this._edgeDataCache;
    const sameView = (a, b) => a && b && a.buffer === b.buffer && a.byteOffset === b.byteOffset && a.byteLength === b.byteLength;
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.edgeBuffersGpu.indices = this.ensureBufferGpu(
      this.edgeBuffersGpu.indices,
      indices.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge index buffer',
    );
    this.edgeBuffersGpu.segments = this.ensureBufferGpu(
      this.edgeBuffersGpu.segments,
      segments.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge segment buffer',
    );
    this.edgeBuffersGpu.colors = this.ensureBufferGpu(
      this.edgeBuffersGpu.colors,
      colors.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge color buffer',
    );
    this.edgeBuffersGpu.widths = this.ensureBufferGpu(
      this.edgeBuffersGpu.widths,
      widths.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge width buffer',
    );
    this.edgeBuffersGpu.opacities = this.ensureBufferGpu(
      this.edgeBuffersGpu.opacities,
      opacities.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge opacity buffer',
    );
    this.edgeBuffersGpu.endpointSizes = this.ensureBufferGpu(
      this.edgeBuffersGpu.endpointSizes,
      endpointSizes.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge endpoint size buffer',
    );

    const buffersChanged = (
      this._edgeBuffersLast?.indices !== this.edgeBuffersGpu.indices?.buffer
      || this._edgeBuffersLast?.segments !== this.edgeBuffersGpu.segments?.buffer
      || this._edgeBuffersLast?.colors !== this.edgeBuffersGpu.colors?.buffer
      || this._edgeBuffersLast?.widths !== this.edgeBuffersGpu.widths?.buffer
      || this._edgeBuffersLast?.endpointSizes !== this.edgeBuffersGpu.endpointSizes?.buffer
      || this._edgeBuffersLast?.opacities !== this.edgeBuffersGpu.opacities?.buffer
    );

    // Same reasoning as nodes: layout writes into stable views, so always push
    // edge data when present to avoid stale buffers on WebGPU.
    if (edgeCount > 0) {
      device.queue.writeBuffer(this.edgeBuffersGpu.indices.buffer, 0, indices);
      device.queue.writeBuffer(this.edgeBuffersGpu.segments.buffer, 0, segments);
      device.queue.writeBuffer(this.edgeBuffersGpu.colors.buffer, 0, colors);
      device.queue.writeBuffer(this.edgeBuffersGpu.widths.buffer, 0, widths);
      device.queue.writeBuffer(this.edgeBuffersGpu.opacities.buffer, 0, opacities);
      device.queue.writeBuffer(this.edgeBuffersGpu.endpointSizes.buffer, 0, endpointSizes);
      cache.segments = segments;
      cache.colors = colors;
      cache.indices = indices;
      cache.widths = widths;
      cache.endpointSizes = endpointSizes;
      cache.opacities = opacities;
      cache.count = edgeCount;
    }

    if (buffersChanged || !this.edgeBindGroup) {
      this.edgeBindGroup = device.createBindGroup({
        layout: this.edgeBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.cameraBuffer } },
          { binding: 1, resource: { buffer: this.edgeBuffersGpu.indices.buffer } },
          { binding: 2, resource: { buffer: this.edgeBuffersGpu.segments.buffer } },
          { binding: 3, resource: { buffer: this.edgeBuffersGpu.colors.buffer } },
          { binding: 4, resource: { buffer: this.edgeBuffersGpu.widths.buffer } },
          { binding: 5, resource: { buffer: this.edgeBuffersGpu.endpointSizes.buffer } },
          { binding: 6, resource: { buffer: this.edgeBuffersGpu.opacities.buffer } },
          { binding: 7, resource: { buffer: this.globalsBuffer } },
        ],
      });
      this._edgeBuffersLast = {
        indices: this.edgeBuffersGpu.indices.buffer,
        segments: this.edgeBuffersGpu.segments.buffer,
        colors: this.edgeBuffersGpu.colors.buffer,
        widths: this.edgeBuffersGpu.widths.buffer,
        endpointSizes: this.edgeBuffersGpu.endpointSizes.buffer,
        opacities: this.edgeBuffersGpu.opacities.buffer,
      };
    }
  }

  render(context, frame) {
    if (!context || context.type !== 'webgpu') return;
    const network = frame?.network;
    if (!network) return;
    if (!this.updateDenseGraphBuffers(network)) return;
    const { camera } = frame ?? {};
    const gpuDevice = this.device?.device;
    if (!gpuDevice) return;
    const maxBindingSize = gpuDevice.limits?.maxStorageBufferBindingSize;
    const cameraUniforms = this.getCameraUniforms(camera);
    const transparencyMode = this.edgeTransparencyMode;
    const weightedRequested = transparencyMode === 'weighted'
      || transparencyMode === 'additive-normalized'
      || transparencyMode === 'additive-tonemapped'
      || transparencyMode === 'additive-normalized-bright';
    let weightedReady = false;
    let geometry = null;
    let is2D = cameraUniforms?.mode === '2d';

    const passes = [];
    network.withBufferAccess(() => {
      geometry = this.readDenseGraph(network);
      is2D = cameraUniforms?.mode === '2d';
      this.updateGlobalsGpu(gpuDevice, cameraUniforms);
      this.updateCameraUniformsGpu(camera, cameraUniforms);
      if (!this.cameraBuffer) return;
      if (geometry.nodes.count) {
        this.updateNodeBuffersGpu(geometry.nodes, gpuDevice, maxBindingSize);
      } else {
        this.nodeBindGroup = null;
      }
      if (geometry.edges.count) {
        this.updateEdgeBuffersGpu(geometry.edges, gpuDevice, maxBindingSize);
      } else {
        this.edgeBindGroup = null;
      }
      weightedReady = weightedRequested && geometry.edges.count > 0
        ? this.prepareWeightedResources(context, cameraUniforms)
        : false;
    });

    if (!geometry || !this.cameraBuffer) return;

    const edgePipelines = this.getEdgePipelinesForMode(transparencyMode, gpuDevice);

    const drawNodes = (passEncoder) => {
      if (!geometry.nodes.count || !this.nodeBindGroup || !passEncoder) return;
      passEncoder.setPipeline(this.nodePipeline);
      passEncoder.setBindGroup(0, this.nodeBindGroup);
      passEncoder.setVertexBuffer(0, this.nodeQuadBufferGpu);
      passEncoder.draw(4, geometry.nodes.count, 0, 0);
    };

    const drawEdgesAlpha = (passEncoder) => {
      if (!geometry.edges.count || !this.edgeBindGroup || !passEncoder) return;
      if (this.edgeRenderingMode === 'quad' && edgePipelines?.quad) {
        passEncoder.setPipeline(edgePipelines.quad);
        passEncoder.setBindGroup(0, this.edgeBindGroup);
        passEncoder.setVertexBuffer(0, this.edgeQuadBufferGpu);
        passEncoder.draw(4, geometry.edges.count, 0, 0);
      } else if (edgePipelines?.line) {
        passEncoder.setPipeline(edgePipelines.line);
        passEncoder.setBindGroup(0, this.edgeBindGroup);
        passEncoder.draw(geometry.edges.count * 2, 1, 0, 0);
      }
    };

    if (!weightedReady) {
      if (weightedRequested && !this.warnedWeightedFallback && geometry.edges.count > 0) {
        console.warn('Weighted edge transparency is not available; using alpha blending instead.');
        this.warnedWeightedFallback = true;
      }
      if (is2D) {
        passes.push(() => {
          drawEdgesAlpha(context.passEncoder);
          drawNodes(context.passEncoder);
        });
      } else {
        passes.push(() => {
          drawNodes(context.passEncoder);
          drawEdgesAlpha(context.passEncoder);
        });
      }
    } else {
      if (!this.loggedWeightedActive) {
        console.info(`GraphLayerWebGPU: using weighted multipass for '${transparencyMode}'`);
        this.loggedWeightedActive = true;
      }
      passes.push(() => this.renderWeighted(context, {
        geometry,
        is2D,
        drawNodes,
        mode: transparencyMode,
      }));
    }

    this.frameGraph.run(passes, context);
  }

  getBlendForMode(mode) {
    switch (mode) {
      case 'additive':
        return { key: 'additive', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } };
      case 'screen':
        return { key: 'screen', blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-color', operation: 'add' }, alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' } } };
      case 'max':
        return { key: 'max', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' } } };
      default:
        return { key: 'alpha', blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' } } };
    }
  }

  createEdgePipelines(key, blend, edgeModule, depthStencil) {
    const device = this.device?.device;
    if (!device || !edgeModule || !depthStencil) return;
    const linePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: { module: edgeModule, entryPoint: 'edgeVertex' },
      fragment: {
        module: edgeModule,
        entryPoint: 'edgeFragment',
        targets: [{ format: this.device.format, blend }],
      },
      depthStencil: { ...depthStencil, depthWriteEnabled: false },
      primitive: { topology: 'line-list' },
    });

    const quadPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: {
        module: edgeModule,
        entryPoint: 'edgeQuadVertex',
        buffers: [
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
            stepMode: 'vertex',
          },
        ],
      },
      fragment: {
        module: edgeModule,
        entryPoint: 'edgeFragment',
        targets: [{ format: this.device.format, blend }],
      },
      depthStencil: { ...depthStencil, depthWriteEnabled: false },
      primitive: { topology: 'triangle-strip' },
    });

    this.edgePipelineCache.set(key, linePipeline);
    this.edgeQuadPipelineCache.set(key, quadPipeline);
  }

  getEdgePipelinesForMode(mode, gpuDevice) {
    if (!gpuDevice) return null;
    const { key, blend } = this.getBlendForMode(mode);
    if (key === 'alpha' && this.edgePipelineCache.has('alpha')) {
      return { line: this.edgePipelineCache.get('alpha'), quad: this.edgeQuadPipelineCache.get('alpha') };
    }
    if (this.edgePipelineCache.has(key)) {
      return { line: this.edgePipelineCache.get(key), quad: this.edgeQuadPipelineCache.get(key) };
    }
    this.createEdgePipelines(key, blend, this.edgeModule, this.baseDepthStencil);
    return { line: this.edgePipelineCache.get(key), quad: this.edgeQuadPipelineCache.get(key) };
  }

  updateCameraUniformsGpu(camera, cameraUniforms) {
    if (!this.device?.device || !this.cameraBuffer || !this.cameraArray) return;
    const source = cameraUniforms ?? this.getCameraUniforms(camera);
    if (!source) return;
    this.cameraArray.set(source.viewProjection, 0);
    this.cameraArray.set(source.view, 16);
    this.cameraArray[32] = source.position?.[0] ?? 0;
    this.cameraArray[33] = source.position?.[1] ?? 0;
    this.cameraArray[34] = source.position?.[2] ?? 0;
    this.cameraArray[35] = source.mode === '2d' ? 1 : 0;
    this.cameraArray[36] = source.up?.[0] ?? 0;
    this.cameraArray[37] = source.up?.[1] ?? 1;
    this.cameraArray[38] = source.up?.[2] ?? 0;
    this.cameraArray[39] = 0;
    this.cameraArray[40] = source.right?.[0] ?? 1;
    this.cameraArray[41] = source.right?.[1] ?? 0;
    this.cameraArray[42] = source.right?.[2] ?? 0;
    this.cameraArray[43] = 0;
    const viewportWidth = source.viewport?.width ?? this.size?.width ?? 1;
    const viewportHeight = source.viewport?.height ?? this.size?.height ?? 1;
    const pixelRatio = source.viewport?.devicePixelRatio ?? this.size?.devicePixelRatio ?? 1;
    const drawWidth = viewportWidth * pixelRatio;
    const drawHeight = viewportHeight * pixelRatio;
    this.cameraArray[44] = drawWidth;
    this.cameraArray[45] = drawHeight;
    this.cameraArray[46] = drawWidth > 0 ? 1 / drawWidth : 0;
    this.cameraArray[47] = drawHeight > 0 ? 1 / drawHeight : 0;
    this.device.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraArray);
  }

  updateGlobalsGpu(device, cameraUniforms) {
    if (!device || !this.globalsBuffer || !this.globalsArray) return;
    // Keep offsets aligned with WGSL struct layout (vec4 aligned to 16 bytes).
    const OFFSET_NODE_OPACITY = 0;
    const OFFSET_NODE_SIZE = 2;
    const OFFSET_NODE_OUTLINE = 4;
    const OFFSET_EDGE_OPACITY = 6;
    const OFFSET_EDGE_WIDTH = 8;
    const OFFSET_PADDING_AFTER_EDGE_WIDTH = 10; // 2 floats of padding before vec4 outline color
    const OFFSET_OUTLINE_COLOR = 12;
    const OFFSET_EDGE_TRIM = 16;
    const OFFSET_PADDING_AFTER_EDGE_TRIM = 17; // 3 floats padding to align vec3 _pad
    const OFFSET_PAD_VEC3 = 20;
    const outlineColor = this.nodeOutlineColor || [0, 0, 0, 1];
    const is2D = cameraUniforms?.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms?.view?.[0] ?? 1) : 1;
    const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
    const edgeWidthBase = this.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
    const edgeWidthScale = this.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
    this.globalsArray[OFFSET_NODE_OPACITY + 0] = this.nodeOpacityBase;
    this.globalsArray[OFFSET_NODE_OPACITY + 1] = this.nodeOpacityScale;
    this.globalsArray[OFFSET_NODE_SIZE + 0] = this.nodeSizeBase;
    this.globalsArray[OFFSET_NODE_SIZE + 1] = this.nodeSizeScale;
    this.globalsArray[OFFSET_NODE_OUTLINE + 0] = this.nodeOutlineWidthBase;
    this.globalsArray[OFFSET_NODE_OUTLINE + 1] = this.nodeOutlineWidthScale;
    this.globalsArray[OFFSET_EDGE_OPACITY + 0] = this.edgeOpacityBase;
    this.globalsArray[OFFSET_EDGE_OPACITY + 1] = this.edgeOpacityScale;
    this.globalsArray[OFFSET_EDGE_WIDTH + 0] = edgeWidthBase;
    this.globalsArray[OFFSET_EDGE_WIDTH + 1] = edgeWidthScale;
    this.globalsArray[OFFSET_PADDING_AFTER_EDGE_WIDTH + 0] = 0;
    this.globalsArray[OFFSET_PADDING_AFTER_EDGE_WIDTH + 1] = 0;
    this.globalsArray[OFFSET_OUTLINE_COLOR + 0] = outlineColor[0] ?? 0;
    this.globalsArray[OFFSET_OUTLINE_COLOR + 1] = outlineColor[1] ?? 0;
    this.globalsArray[OFFSET_OUTLINE_COLOR + 2] = outlineColor[2] ?? 0;
    this.globalsArray[OFFSET_OUTLINE_COLOR + 3] = outlineColor[3] ?? 1;
    this.globalsArray[OFFSET_EDGE_TRIM] = this.edgeEndpointTrim;
    this.globalsArray[OFFSET_PADDING_AFTER_EDGE_TRIM + 0] = 0;
    this.globalsArray[OFFSET_PADDING_AFTER_EDGE_TRIM + 1] = 0;
    this.globalsArray[OFFSET_PADDING_AFTER_EDGE_TRIM + 2] = 0;
    this.globalsArray[OFFSET_PAD_VEC3 + 0] = 0;
    this.globalsArray[OFFSET_PAD_VEC3 + 1] = 0;
    this.globalsArray[OFFSET_PAD_VEC3 + 2] = 0;
    this.globalsArray[23] = 0;
    device.queue.writeBuffer(this.globalsBuffer, 0, this.globalsArray);
  }

  prepareWeightedResources(context, cameraUniforms) {
    const device = this.device?.device;
    if (!device) return false;
    const maxTargets = device.limits?.maxColorAttachments ?? 1;
    if (maxTargets < 2) return false;

    const viewport = cameraUniforms?.viewport;
    const pixelRatio = viewport?.devicePixelRatio ?? this.size?.devicePixelRatio ?? 1;
    const width = context?.target?.width ?? Math.max(1, Math.floor((viewport?.width ?? this.size?.width ?? 1) * pixelRatio));
    const height = context?.target?.height ?? Math.max(1, Math.floor((viewport?.height ?? this.size?.height ?? 1) * pixelRatio));
    if (!this.ensureWeightedTextures(device, width, height)) return false;
    if (!this.ensureWeightedPipelines(device, context.format)) return false;
    this.ensureWeightedResolveBindGroup(device);
    return Boolean(this.edgeWeightedPipeline && this.edgeResolveBindGroup && this.edgeResolveLayout);
  }

  ensureWeightedTextures(device, width, height) {
    const targetWidth = Math.max(1, Math.floor(width));
    const targetHeight = Math.max(1, Math.floor(height));
    if (
      this.weightedTextures &&
      this.weightedTextures.width === targetWidth &&
      this.weightedTextures.height === targetHeight
    ) {
      return true;
    }

    const destroyOld = () => {
      this.weightedTextures?.color?.destroy?.();
      this.weightedTextures?.weight?.destroy?.();
    };

    const usage = GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;
    try {
      const color = device.createTexture({
        size: { width: targetWidth, height: targetHeight, depthOrArrayLayers: 1 },
        format: 'rgba16float',
        usage,
      });

      let weightFormat = 'r16float';
      let weight = null;
      try {
        weight = device.createTexture({
          size: { width: targetWidth, height: targetHeight, depthOrArrayLayers: 1 },
          format: weightFormat,
          usage,
        });
      } catch (_) {
        weightFormat = 'rgba16float';
        weight = device.createTexture({
          size: { width: targetWidth, height: targetHeight, depthOrArrayLayers: 1 },
          format: weightFormat,
          usage,
        });
      }

      destroyOld();
      this.weightedTextures = {
        color,
        weight,
        width: targetWidth,
        height: targetHeight,
        weightFormat,
      };
      return true;
    } catch (error) {
      console.warn('Unable to allocate weighted transparency targets; falling back to alpha.', error);
      destroyOld();
      this.weightedTextures = null;
      return false;
    }
  }

  ensureWeightedPipelines(device, swapchainFormat) {
    const colorFormat = this.weightedTextures?.color?.format ?? 'rgba16float';
    const weightFormat = this.weightedTextures?.weight?.format ?? 'r16float';
    if (!colorFormat || !weightFormat) return false;

    const additiveBlend = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    };

    const needsRebuild =
      !this.weightedPipelineFormats ||
      this.weightedPipelineFormats.color !== colorFormat ||
      this.weightedPipelineFormats.weight !== weightFormat ||
      this.weightedPipelineFormats.swapchain !== swapchainFormat;

    if (!this.edgeWeightedModule) {
      this.edgeWeightedModule = device.createShaderModule({ code: EDGE_WEIGHTED_WGSL });
    }
    if (!this.edgeResolveModule) {
      this.edgeResolveModule = device.createShaderModule({ code: EDGE_WEIGHTED_RESOLVE_WGSL });
    }

    if (needsRebuild) {
      const depthStencilAccumulate = {
        format: this.device.depthFormat ?? 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'less-equal',
      };

      this.edgeWeightedPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
        vertex: { module: this.edgeWeightedModule, entryPoint: 'edgeVertex' },
        fragment: {
          module: this.edgeWeightedModule,
          entryPoint: 'edgeWeightedFragment',
          targets: [
            { format: colorFormat, blend: additiveBlend },
            { format: weightFormat, blend: additiveBlend },
          ],
        },
        depthStencil: depthStencilAccumulate,
        primitive: { topology: 'line-list' },
      });

      this.edgeWeightedQuadPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
        vertex: {
          module: this.edgeWeightedModule,
          entryPoint: 'edgeQuadVertex',
          buffers: [
            {
              arrayStride: 8,
              attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
              stepMode: 'vertex',
            },
          ],
        },
        fragment: {
          module: this.edgeWeightedModule,
          entryPoint: 'edgeWeightedFragment',
          targets: [
            { format: colorFormat, blend: additiveBlend },
            { format: weightFormat, blend: additiveBlend },
          ],
        },
        depthStencil: depthStencilAccumulate,
        primitive: { topology: 'triangle-strip' },
      });

      this.weightedPipelineFormats = {
        color: colorFormat,
        weight: weightFormat,
        swapchain: swapchainFormat,
      };
    }

    if (!this.edgeResolveLayout) {
      this.edgeResolveLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        ],
      });
    }

    return Boolean(this.edgeWeightedPipeline);
  }

  ensureWeightedResolveBindGroup(device) {
    if (!this.weightedTextures) return;
    if (!this.weightedSampler) {
      this.weightedSampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    }
    this.edgeResolveBindGroup = device.createBindGroup({
      layout: this.edgeResolveLayout,
      entries: [
        { binding: 0, resource: this.weightedSampler },
        { binding: 1, resource: this.weightedTextures.color.createView() },
        { binding: 2, resource: this.weightedTextures.weight.createView() },
      ],
    });
  }

  getResolvePipeline(mode, swapchainFormat) {
    const key = `${mode ?? 'default'}|${swapchainFormat}`;
    if (this.edgeResolvePipelineCache.has(key)) {
      return this.edgeResolvePipelineCache.get(key);
    }

    const device = this.device?.device;
    if (!device) return null;
    const layout = this.edgeResolveLayout;
    if (!layout) return null;

    const shaderCode = (() => {
      if (mode === 'additive-tonemapped') {
        return createEdgeWeightedResolveTonemapWGSL({ boost: false });
      }
      if (mode === 'additive-normalized-bright') {
        return createEdgeWeightedResolveTonemapWGSL({ boost: true });
      }
      return EDGE_WEIGHTED_RESOLVE_WGSL;
    })();

    let module = this.edgeResolveModuleCache.get(shaderCode);
    if (!module) {
      module = device.createShaderModule({ code: shaderCode });
      this.edgeResolveModuleCache.set(shaderCode, module);
    }

    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format: swapchainFormat,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      depthStencil: {
        format: this.device.depthFormat ?? 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'always',
      },
      primitive: { topology: 'triangle-strip' },
    });

    this.edgeResolvePipelineCache.set(key, pipeline);
    return pipeline;
  }

  renderWeighted(context, { geometry, is2D, drawNodes, mode }) {
    const commandEncoder = context.commandEncoder;
    const targetView = context.colorView;
    const depthView = context.depthView;
    const useQuads = this.edgeRenderingMode === 'quad' && this.edgeWeightedQuadPipeline;
    const edgePipeline = useQuads ? this.edgeWeightedQuadPipeline : this.edgeWeightedPipeline;
    const edgeVertexBuffer = useQuads ? this.edgeQuadBufferGpu : null;
    const applyViewport = (pass) => {
      if (context.viewport && pass?.setViewport) {
        pass.setViewport(context.viewport.x, context.viewport.y, context.viewport.width, context.viewport.height, 0, 1);
      }
    };

    // Draw nodes first for 3D to populate depth, mirroring the existing ordering.
    if (!is2D) {
      drawNodes(context.passEncoder);
    }

    if (context.passEncoder) {
      context.passEncoder.end();
      context.passEncoder = null;
    }

    if (geometry.edges.count && edgePipeline) {
      const accumulatePass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.weightedTextures.color.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
          {
            view: this.weightedTextures.weight.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        ...(depthView
          ? {
              depthStencilAttachment: {
                view: depthView,
                depthLoadOp: 'load',
                depthStoreOp: 'store',
              },
            }
          : {}),
      });
          applyViewport(accumulatePass);
      accumulatePass.setPipeline(edgePipeline);
      accumulatePass.setBindGroup(0, this.edgeBindGroup);
      if (edgeVertexBuffer) {
        accumulatePass.setVertexBuffer(0, edgeVertexBuffer);
        accumulatePass.draw(4, geometry.edges.count, 0, 0);
      } else {
        accumulatePass.draw(geometry.edges.count * 2, 1, 0, 0);
      }
      accumulatePass.end();
    }

    const resolvePass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetView,
          loadOp: 'load',
          storeOp: 'store',
        },
      ],
      ...(depthView
        ? {
            depthStencilAttachment: {
              view: depthView,
              depthLoadOp: 'load',
              depthStoreOp: 'store',
            },
          }
        : {}),
    });
    applyViewport(resolvePass);
    resolvePass.setPipeline(this.getResolvePipeline(mode, context.format));
    resolvePass.setBindGroup(0, this.edgeResolveBindGroup);
    resolvePass.setVertexBuffer(0, context.quad);
    resolvePass.draw(4, 1, 0, 0);

    if (is2D) {
      drawNodes(resolvePass);
    }

    context.passEncoder = resolvePass;
  }
}
