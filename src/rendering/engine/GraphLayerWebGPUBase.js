import {
  createGraphWebGPUSources,
  EDGE_WEIGHTED_RESOLVE_WGSL,
  createEdgeWeightedResolveTonemapWGSL,
} from './shaders/graphWebGPUBase.js';
import {
  GraphLayer,
  SHADED_LIGHT_DIRECTION_DEFAULT,
  SHADED_LIGHT_COLOR_DEFAULT,
  SHADED_AMBIENT_STRENGTH_DEFAULT,
  SHADED_AMBIENT_TOP_COLOR_DEFAULT,
  SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT,
  SHADED_DIFFUSE_STRENGTH_DEFAULT,
  SHADED_SPECULAR_COLOR_DEFAULT,
  SHADED_SPECULAR_STRENGTH_DEFAULT,
  SHADED_SHININESS_DEFAULT,
} from './GraphLayer.js';
import { FrameGraphRunner } from './framegraph/FrameGraphRunner.js';
import { bumpCounter } from '../../utilities/counters.js';

export class GraphLayerWebGPUBase extends GraphLayer {
  constructor(options = {}) {
    super(options);
    this.device = null;

    this.frameGraph = new FrameGraphRunner();

    this.nodeBindGroupLayout = null;
    this.nodeBindGroupLayoutOutline = null;
    this.edgeBindGroupLayout = null;
    this.nodePipelineCache = new Map();
    this.nodeModules = new Map();
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
    this.nodeBindGroupOutline = null;
    this.edgeBindGroup = null;
    this.edgeModules = new Map();
    this.edgeWeightedModules = new Map();
    this.edgeWeightedUseIndices = null;
    this.baseDepthStencil = null;
    this.cameraArray = null;
    this.cameraBuffer = null;
    this.globalsArray = null;
    this.globalsBuffer = null;
    this.hoverArray = null;
    this.hoverU32Array = null;
    this.hoverBuffer = null;
    this.shadingArray = null;
    this.shadingBuffer = null;
    this.nodeBuffersGpu = {};
    this.edgeBuffersGpu = {};
    this.nodeQuadBufferGpu = null;
    this.edgeQuadBufferGpu = null;
    this._dummyIndexArray = new Uint32Array([0]);
    this._nodeDataCache = { count: 0 };
    this._edgeDataCache = { count: 0 };
    this._nodeVersionsLast = null;
    this._nodeVersionsLastOutline = null;
    this._edgeVersionsLast = null;
    this._shaderSources = null;
    this.counters = { weightedAttachmentRenders: 0 };

    this._nodeBuffersLastOutline = null;
    this._nodeOutlineUseAttributesLast = this.nodeOutlineUseAttributes === true;
  }

  initialize(device, size) {
    if (device?.type !== 'webgpu') {
      throw new Error('GraphLayerWebGPU requires a WebGPU device.');
    }
    super.initialize(device, size);
    this.device = device;
    this.weightedSupported = Boolean((device?.device?.limits?.maxColorAttachments ?? 1) >= 2);
    this.edgeTransparencyMode = this.normalizeEdgeTransparencyMode(this.edgeTransparencyMode);
    this.initializeWebGPU(device);
    this.resize(size);
  }

  resize(size) {
    super.resize(size);
  }

  destroy() {
    // GPU buffers are cached at the device level for reuse across passes.
    // They are destroyed by the device cache on device teardown.
    this.cameraBuffer?.destroy?.();
    this.globalsBuffer?.destroy?.();
    this.hoverBuffer?.destroy?.();
    this.shadingBuffer?.destroy?.();
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
    const globalsFloats = 74 + this.stateSlotCount * 24;
    this.globalsArray = new Float32Array(globalsFloats);
    this.globalsBuffer = device.device.createBuffer({
      size: this.globalsArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.hoverArray = new Float32Array(32);
    this.hoverU32Array = new Uint32Array(this.hoverArray.buffer);
    this.hoverU32Array[0] = GraphLayer.NO_HOVER_INDEX;
    this.hoverU32Array[2] = GraphLayer.NO_HOVER_INDEX;
    this.hoverBuffer = device.device.createBuffer({
      size: this.hoverArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.shadingArray = new Float32Array(24);
    this.shadingBuffer = device.device.createBuffer({
      size: this.shadingArray.byteLength,
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
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 7, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 10, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
    this.nodeBindGroupLayoutOutline = device.device.createBindGroupLayout({
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
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 7, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 8, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 9, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 10, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
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
        { binding: 7, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
        { binding: 8, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 9, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 10, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    this.nodeModules.clear();
    this.edgeModules.clear();
    this.edgeWeightedModules.clear();
    this._shaderSources = null;
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

    this.nodePipelineCache.clear();
    this.edgePipelineCache.clear();
    this.edgeQuadPipelineCache.clear();
  }

  getVisualConfig(network) {
    const cfg = network && network.__heliosVisualConfig;
    return cfg && typeof cfg === 'object' ? cfg : null;
  }

  resolveNodeVariant(visualConfig) {
    const nodeCfg = visualConfig?.node;
    if (!nodeCfg) {
      const outlineToggle = this.nodeOutlineUseAttributes === true;
      return {
        colorBuffer: true,
        sizeBuffer: true,
        outlineWidthBuffer: outlineToggle,
        outlineColorBuffer: outlineToggle,
      };
    }
    return {
      colorBuffer: nodeCfg?.color?.mode !== 'uniform',
      sizeBuffer: nodeCfg?.size?.mode !== 'uniform',
      outlineWidthBuffer: nodeCfg?.outline?.mode !== 'uniform',
      outlineColorBuffer: nodeCfg?.outlineColor?.mode !== 'uniform',
    };
  }

  resolveEdgeVariant(visualConfig) {
    const edgeCfg = visualConfig?.edge;
    if (!edgeCfg) {
      return {
        colorBuffer: true,
        widthBuffer: true,
        opacityBuffer: true,
        endpointSizeBuffer: true,
        widthClampToNodeDiameter: this.edgeWidthClampToNodeDiameter !== false,
      };
    }
    return {
      colorBuffer: edgeCfg?.color?.mode !== 'uniform',
      widthBuffer: edgeCfg?.width?.mode !== 'uniform',
      opacityBuffer: edgeCfg?.opacity?.mode !== 'uniform',
      endpointSizeBuffer: edgeCfg?.endpointSize?.mode !== 'uniform',
      widthClampToNodeDiameter: this.edgeWidthClampToNodeDiameter !== false,
    };
  }

  getNodeVariantKey(useIndices, variant) {
    return [
      useIndices ? 'idx' : 'id',
      variant?.colorBuffer ? 'cB' : 'cU',
      variant?.sizeBuffer ? 'sB' : 'sU',
      variant?.outlineWidthBuffer ? 'owB' : 'owU',
      variant?.outlineColorBuffer ? 'ocB' : 'ocU',
    ].join('|');
  }

  getNodeModule(useIndices, variant) {
    const key = this.getNodeVariantKey(useIndices, variant);
    if (this.nodeModules.has(key)) return this.nodeModules.get(key);
    const device = this.device?.device;
    if (!device) return null;
    const sources = createGraphWebGPUSources(this.stateSlotCount, {
      useNodeIndices: useIndices,
      useEdgeIndices: true,
      node: {
        color: variant?.colorBuffer ? 'buffer' : 'uniform',
        size: variant?.sizeBuffer ? 'buffer' : 'uniform',
        outline: variant?.outlineWidthBuffer ? 'buffer' : 'uniform',
        outlineColor: variant?.outlineColorBuffer ? 'buffer' : 'uniform',
      },
    });
    const module = device.createShaderModule({ code: sources.NODE_WGSL });
    this.nodeModules.set(key, module);
    return module;
  }

  getEdgeVariantKey(useIndices, variant) {
    return [
      useIndices ? 'idx' : 'id',
      variant?.colorBuffer ? 'cB' : 'cU',
      variant?.widthBuffer ? 'wB' : 'wU',
      variant?.opacityBuffer ? 'oB' : 'oU',
      variant?.endpointSizeBuffer ? 'esB' : 'esU',
      variant?.widthClampToNodeDiameter ? 'wc1' : 'wc0',
    ].join('|');
  }

  getEdgeModule(useIndices, variant) {
    const key = this.getEdgeVariantKey(useIndices, variant);
    if (this.edgeModules.has(key)) return this.edgeModules.get(key);
    const device = this.device?.device;
    if (!device) return null;
    const sources = createGraphWebGPUSources(this.stateSlotCount, {
      useNodeIndices: true,
      useEdgeIndices: useIndices,
      edge: {
        color: variant?.colorBuffer ? 'buffer' : 'uniform',
        width: variant?.widthBuffer ? 'buffer' : 'uniform',
        opacity: variant?.opacityBuffer ? 'buffer' : 'uniform',
        endpointSize: variant?.endpointSizeBuffer ? 'buffer' : 'uniform',
        widthClampToNodeDiameter: variant?.widthClampToNodeDiameter === true,
      },
    });
    const module = device.createShaderModule({ code: sources.EDGE_WGSL });
    this.edgeModules.set(key, module);
    return module;
  }

  getEdgeWeightedModule(useIndices, variant) {
    const key = this.getEdgeVariantKey(useIndices, variant);
    if (this.edgeWeightedModules.has(key)) return this.edgeWeightedModules.get(key);
    const device = this.device?.device;
    if (!device) return null;
    const sources = createGraphWebGPUSources(this.stateSlotCount, {
      useNodeIndices: true,
      useEdgeIndices: useIndices,
      edge: {
        color: variant?.colorBuffer ? 'buffer' : 'uniform',
        width: variant?.widthBuffer ? 'buffer' : 'uniform',
        opacity: variant?.opacityBuffer ? 'buffer' : 'uniform',
        endpointSize: variant?.endpointSizeBuffer ? 'buffer' : 'uniform',
        widthClampToNodeDiameter: variant?.widthClampToNodeDiameter === true,
      },
    });
    const module = device.createShaderModule({ code: sources.EDGE_WEIGHTED_WGSL });
    this.edgeWeightedModules.set(key, module);
    return module;
  }

  getNodePipeline(useIndices, variant, options = {}) {
    const useOutlineAttributes = Boolean(variant?.outlineWidthBuffer || variant?.outlineColorBuffer);
    const blendKey = options.blendKey ?? 'alpha';
    const depthMode = options.depthMode ?? 'depth';
    const sampleCount = Number.isFinite(options.sampleCount) && options.sampleCount > 1 ? 4 : 1;
    const key = `${this.getNodeVariantKey(useIndices, variant)}|b:${blendKey}|d:${depthMode}|s:${sampleCount}`;
    if (this.nodePipelineCache.has(key)) return this.nodePipelineCache.get(key);
    const device = this.device?.device;
    const nodeModule = this.getNodeModule(useIndices, variant);
    const bindGroupLayout = useOutlineAttributes
      ? this.nodeBindGroupLayoutOutline
      : this.nodeBindGroupLayout;
    if (!device || !nodeModule || !bindGroupLayout || !this.baseDepthStencil) return null;

    const alphaBlend = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    const blend = options.blend ?? alphaBlend;
    const depthStencil = depthMode === 'none'
      ? { ...this.baseDepthStencil, depthWriteEnabled: false, depthCompare: 'always' }
      : this.baseDepthStencil;

    const pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
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
        targets: [{ format: this.device.format, blend }],
      },
      depthStencil,
      multisample: { count: sampleCount },
      primitive: { topology: 'triangle-strip' },
    });

    this.nodePipelineCache.set(key, pipeline);
    return pipeline;
  }

  getBlendForMode(mode) {
    switch (mode) {
      case 'additive':
        return { key: 'additive', fragment: 'edgeFragment', blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' }, alpha: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' } } };
      case 'screen':
        return { key: 'screen', fragment: 'edgePremulFragment', blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src', operation: 'add' }, alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' } } };
      case 'max':
        return { key: 'max', fragment: 'edgeFragment', blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' }, alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' } } };
      default:
        return {
          key: 'alpha',
          fragment: 'edgeFragment',
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        };
    }
  }

  createEdgePipelines(key, blend, edgeModule, depthStencil, fragmentEntryPoint, useIndices, edgeVariant, depthWriteEnabled, sampleCount = 1) {
    const device = this.device?.device;
    if (!device || !edgeModule || !depthStencil) return;
    const edgeLayout = this.edgeBindGroupLayout;
    const linePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [edgeLayout] }),
      vertex: { module: edgeModule, entryPoint: 'edgeVertex' },
      fragment: {
        module: edgeModule,
        entryPoint: fragmentEntryPoint,
        targets: [{ format: this.device.format, blend }],
      },
      depthStencil: { ...depthStencil, depthWriteEnabled: Boolean(depthWriteEnabled) },
      multisample: { count: sampleCount },
      primitive: { topology: 'line-list' },
    });

    const quadPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [edgeLayout] }),
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
        entryPoint: fragmentEntryPoint,
        targets: [{ format: this.device.format, blend }],
      },
      depthStencil: { ...depthStencil, depthWriteEnabled: Boolean(depthWriteEnabled) },
      multisample: { count: sampleCount },
      primitive: { topology: 'triangle-strip' },
    });

    const variantKey = this.getEdgeVariantKey(useIndices, edgeVariant);
    const cacheKey = `${key}|${variantKey}|d${depthWriteEnabled ? 1 : 0}|s${sampleCount}`;
    this.edgePipelineCache.set(cacheKey, linePipeline);
    this.edgeQuadPipelineCache.set(cacheKey, quadPipeline);
  }

  getEdgePipelinesForMode(mode, gpuDevice, useIndices, edgeVariant, sampleCount = 1, depthWriteOverride = null) {
    if (!gpuDevice) return null;
    const { key, blend, fragment } = this.getBlendForMode(mode);
    const variantKey = this.getEdgeVariantKey(useIndices, edgeVariant);
    const depthWriteEnabled = depthWriteOverride == null
      ? (this.edgeDepthWrite === true)
      : (depthWriteOverride === true);
    const resolvedSampleCount = Number.isFinite(sampleCount) && sampleCount > 1 ? 4 : 1;
    const cacheKey = `${key}|${variantKey}|d${depthWriteEnabled ? 1 : 0}|s${resolvedSampleCount}`;
    if (key === 'alpha' && this.edgePipelineCache.has(cacheKey)) {
      return { line: this.edgePipelineCache.get(cacheKey), quad: this.edgeQuadPipelineCache.get(cacheKey) };
    }
    if (this.edgePipelineCache.has(cacheKey)) {
      return { line: this.edgePipelineCache.get(cacheKey), quad: this.edgeQuadPipelineCache.get(cacheKey) };
    }
    const edgeModule = this.getEdgeModule(useIndices, edgeVariant);
    this.createEdgePipelines(
      key,
      blend,
      edgeModule,
      this.baseDepthStencil,
      fragment ?? 'edgeFragment',
      useIndices,
      edgeVariant,
      depthWriteEnabled,
      resolvedSampleCount,
    );
    return { line: this.edgePipelineCache.get(cacheKey), quad: this.edgeQuadPipelineCache.get(cacheKey) };
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

  updateGlobalsGpu(device, cameraUniforms, visualConfig = null) {
    if (!device || !this.globalsBuffer || !this.globalsArray) return;
    const nodeCfg = visualConfig?.node;
    const edgeCfg = visualConfig?.edge;

    const outlineColor = (nodeCfg?.outlineColor?.mode === 'uniform' && Array.isArray(nodeCfg?.outlineColor?.value))
      ? nodeCfg.outlineColor.value
      : (this.nodeOutlineColor || [0, 0, 0, 1]);

    const nodeColor = (nodeCfg?.color?.mode === 'uniform' && Array.isArray(nodeCfg?.color?.value))
      ? nodeCfg.color.value
      : [1, 1, 1, 1];

    const nodeSizeRaw = (nodeCfg?.size?.mode === 'uniform' && Number.isFinite(nodeCfg?.size?.value))
      ? nodeCfg.size.value
      : 0;

    const nodeOutlineRaw = (nodeCfg?.outline?.mode === 'uniform' && Number.isFinite(nodeCfg?.outline?.value))
      ? nodeCfg.outline.value
      : 0;

    const edgeColorPair = (edgeCfg?.color?.mode === 'uniform' && Array.isArray(edgeCfg?.color?.value))
      ? edgeCfg.color.value
      : null;
    const edgeColorStart = Array.isArray(edgeColorPair?.[0]) ? edgeColorPair[0] : [1, 1, 1, 1];
    const edgeColorEnd = Array.isArray(edgeColorPair?.[1]) ? edgeColorPair[1] : edgeColorStart;

    const edgeWidthPair = (edgeCfg?.width?.mode === 'uniform' && Array.isArray(edgeCfg?.width?.value)) ? edgeCfg.width.value : [1, 1];
    const edgeOpacityPair = (edgeCfg?.opacity?.mode === 'uniform' && Array.isArray(edgeCfg?.opacity?.value)) ? edgeCfg.opacity.value : [1, 1];
    const edgeEndpointSizePair = (edgeCfg?.endpointSize?.mode === 'uniform' && Array.isArray(edgeCfg?.endpointSize?.value)) ? edgeCfg.endpointSize.value : [1, 1];
    const semanticZoomExponent = Number.isFinite(this.semanticZoomExponent) ? this.semanticZoomExponent : 0;

    let offset = 0;
    this.globalsArray[offset++] = this.nodeOpacityBase;
    this.globalsArray[offset++] = this.nodeOpacityScale;
    this.globalsArray[offset++] = this.nodeSizeBase;
    this.globalsArray[offset++] = this.nodeSizeScale;
    this.globalsArray[offset++] = this.nodeOutlineWidthBase;
    this.globalsArray[offset++] = this.nodeOutlineWidthScale;
    this.globalsArray[offset++] = this.edgeOpacityBase;
    this.globalsArray[offset++] = this.edgeOpacityScale;
    this.globalsArray[offset++] = this.edgeWidthBase;
    this.globalsArray[offset++] = this.edgeWidthScale;
    // _pad0.x = semantic zoom exponent, _pad0.y reserved
    this.globalsArray[offset++] = semanticZoomExponent;
    this.globalsArray[offset++] = 0;

    // nodeColor
    this.globalsArray[offset++] = nodeColor[0] ?? 1;
    this.globalsArray[offset++] = nodeColor[1] ?? 1;
    this.globalsArray[offset++] = nodeColor[2] ?? 1;
    this.globalsArray[offset++] = nodeColor[3] ?? 1;

    // nodeRaw
    this.globalsArray[offset++] = nodeSizeRaw;
    this.globalsArray[offset++] = nodeOutlineRaw;

    // _pad1
    this.globalsArray[offset++] = 0;
    this.globalsArray[offset++] = 0;

    // nodeOutlineColor
    this.globalsArray[offset++] = outlineColor[0] ?? 0;
    this.globalsArray[offset++] = outlineColor[1] ?? 0;
    this.globalsArray[offset++] = outlineColor[2] ?? 0;
    this.globalsArray[offset++] = outlineColor[3] ?? 1;

    // edgeColorStart
    this.globalsArray[offset++] = edgeColorStart[0] ?? 1;
    this.globalsArray[offset++] = edgeColorStart[1] ?? 1;
    this.globalsArray[offset++] = edgeColorStart[2] ?? 1;
    this.globalsArray[offset++] = edgeColorStart[3] ?? 1;

    // edgeColorEnd
    this.globalsArray[offset++] = edgeColorEnd[0] ?? 1;
    this.globalsArray[offset++] = edgeColorEnd[1] ?? 1;
    this.globalsArray[offset++] = edgeColorEnd[2] ?? 1;
    this.globalsArray[offset++] = edgeColorEnd[3] ?? 1;

    // edgeWidthRaw
    this.globalsArray[offset++] = edgeWidthPair?.[0] ?? 1;
    this.globalsArray[offset++] = edgeWidthPair?.[1] ?? 1;

    // edgeOpacityRaw
    this.globalsArray[offset++] = edgeOpacityPair?.[0] ?? 1;
    this.globalsArray[offset++] = edgeOpacityPair?.[1] ?? 1;

    // edgeEndpointSizeRaw
    this.globalsArray[offset++] = edgeEndpointSizePair?.[0] ?? 1;
    this.globalsArray[offset++] = edgeEndpointSizePair?.[1] ?? 1;

    // _pad2
    this.globalsArray[offset++] = 0;
    this.globalsArray[offset++] = 0;

    // edgeTrim + padding
    this.globalsArray[offset++] = this.edgeEndpointTrim;
    this.globalsArray[offset++] = 0;
    this.globalsArray[offset++] = 0;
    this.globalsArray[offset++] = 0;

    const slots = this.stateSlotCount;
    this.globalsArray.set(
      this.nodeNoStateStyleEnabled === true ? this.nodeNoStateScale : [1, 1, 1, 0],
      offset,
    );
    offset += 4;
    this.globalsArray.set(
      this.nodeNoStateStyleEnabled === true ? this.nodeNoStateColorMul : [1, 1, 1, 1],
      offset,
    );
    offset += 4;
    this.globalsArray.set(
      this.nodeNoStateStyleEnabled === true ? this.nodeNoStateColorAdd : [0, 0, 0, 0],
      offset,
    );
    offset += 4;
    this.globalsArray.set(
      this.edgeNoStateStyleEnabled === true ? this.edgeNoStateScale : [1, 1, 1, 0],
      offset,
    );
    offset += 4;
    this.globalsArray.set(
      this.edgeNoStateStyleEnabled === true ? this.edgeNoStateColorMul : [1, 1, 1, 1],
      offset,
    );
    offset += 4;
    this.globalsArray.set(
      this.edgeNoStateStyleEnabled === true ? this.edgeNoStateColorAdd : [0, 0, 0, 0],
      offset,
    );
    offset += 4;
    this.globalsArray.set(this.nodeStateScale, offset); offset += slots * 4;
    this.globalsArray.set(this.nodeStateColorMul, offset); offset += slots * 4;
    this.globalsArray.set(this.nodeStateColorAdd, offset); offset += slots * 4;
    this.globalsArray.set(this.edgeStateScale, offset); offset += slots * 4;
    this.globalsArray.set(this.edgeStateColorMul, offset); offset += slots * 4;
    this.globalsArray.set(this.edgeStateColorAdd, offset); offset += slots * 4;
    const interpolation = this.getPositionInterpolationState?.() ?? this.positionInterpolation ?? null;
    this.globalsArray[offset++] = interpolation?.enabled === true
      ? Math.max(0, Math.min(1, Number(interpolation.factor ?? 1)))
      : 1;
    this.globalsArray[offset++] = interpolation?.enabled === true ? 1 : 0;
    this.globalsArray[offset++] = 0;
    this.globalsArray[offset++] = 0;
    device.queue.writeBuffer(this.globalsBuffer, 0, this.globalsArray);
  }

  updateHoverGpu(device) {
    if (!device || !this.hoverBuffer || !this.hoverArray || !this.hoverU32Array) return;
    const nodeIndex = this.hoveredNodeIndex >>> 0;
    const nodeState = this.hoveredNodeState >>> 0;
    const edgeIndex = this.hoveredEdgeIndex >>> 0;
    const edgeState = this.hoveredEdgeState >>> 0;
    const nodeForceMask = this.nodeStateForceMaxAlphaMask >>> 0;
    const edgeForceMask = this.edgeStateForceMaxAlphaMask >>> 0;
    const nodeVirtual = this.hoveredNodeIsVirtual ? 1 : 0;
    const edgeVirtual = this.hoveredEdgeIsVirtual ? 1 : 0;
    const prev = this._hoverLast;
    if (
      prev &&
      prev.nodeIndex === nodeIndex &&
      prev.nodeState === nodeState &&
      prev.edgeIndex === edgeIndex &&
      prev.edgeState === edgeState &&
      prev.nodeForceMask === nodeForceMask &&
      prev.edgeForceMask === edgeForceMask &&
      prev.nodeVirtual === nodeVirtual &&
      prev.edgeVirtual === edgeVirtual
    ) {
      return;
    }
    this.hoverU32Array[0] = nodeIndex;
    this.hoverU32Array[1] = nodeState;
    this.hoverU32Array[2] = edgeIndex;
    this.hoverU32Array[3] = edgeState;
    this.hoverU32Array[4] = nodeForceMask;
    this.hoverU32Array[5] = edgeForceMask;
    this.hoverU32Array[6] = nodeVirtual;
    this.hoverU32Array[7] = edgeVirtual;
    this.hoverArray.set(this.nodeHoverScale, 8);
    this.hoverArray.set(this.nodeHoverColorMul, 12);
    this.hoverArray.set(this.nodeHoverColorAdd, 16);
    this.hoverArray[15] = this.nodeHoverForceMaxAlpha ? 2 : this.hoverArray[15];
    this.hoverArray.set(this.edgeHoverScale, 20);
    this.hoverArray.set(this.edgeHoverColorMul, 24);
    this.hoverArray.set(this.edgeHoverColorAdd, 28);
    this.hoverArray[27] = this.edgeHoverForceMaxAlpha ? 2 : this.hoverArray[27];
    device.queue.writeBuffer(this.hoverBuffer, 0, this.hoverArray);
    this._hoverLast = { nodeIndex, nodeState, edgeIndex, edgeState, nodeForceMask, edgeForceMask, nodeVirtual, edgeVirtual };
  }

  updateShadingGpu(device) {
    if (!device || !this.shadingBuffer || !this.shadingArray) return;
    const direction = Array.isArray(this.shadedLightDirection) || ArrayBuffer.isView(this.shadedLightDirection)
      ? this.shadedLightDirection
      : SHADED_LIGHT_DIRECTION_DEFAULT;
    const lightColor = Array.isArray(this.shadedLightColor) || ArrayBuffer.isView(this.shadedLightColor)
      ? this.shadedLightColor
      : SHADED_LIGHT_COLOR_DEFAULT;
    const ambientTop = Array.isArray(this.shadedAmbientTopColor) || ArrayBuffer.isView(this.shadedAmbientTopColor)
      ? this.shadedAmbientTopColor
      : SHADED_AMBIENT_TOP_COLOR_DEFAULT;
    const ambientBottom = Array.isArray(this.shadedAmbientBottomColor) || ArrayBuffer.isView(this.shadedAmbientBottomColor)
      ? this.shadedAmbientBottomColor
      : SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT;
    const specularColor = Array.isArray(this.shadedSpecularColor) || ArrayBuffer.isView(this.shadedSpecularColor)
      ? this.shadedSpecularColor
      : SHADED_SPECULAR_COLOR_DEFAULT;
    const diffuseStrength = Number.isFinite(Number(this.shadedDiffuseStrength))
      ? Math.max(0, Number(this.shadedDiffuseStrength))
      : SHADED_DIFFUSE_STRENGTH_DEFAULT;
    const ambientStrength = Number.isFinite(Number(this.shadedAmbientStrength))
      ? Math.max(0, Number(this.shadedAmbientStrength))
      : SHADED_AMBIENT_STRENGTH_DEFAULT;
    const specularStrength = Number.isFinite(Number(this.shadedSpecularStrength))
      ? Math.max(0, Number(this.shadedSpecularStrength))
      : SHADED_SPECULAR_STRENGTH_DEFAULT;
    const shininess = Number.isFinite(Number(this.shadedShininess))
      ? Math.max(1, Number(this.shadedShininess))
      : SHADED_SHININESS_DEFAULT;

    let offset = 0;
    this.shadingArray[offset++] = direction[0] ?? SHADED_LIGHT_DIRECTION_DEFAULT[0];
    this.shadingArray[offset++] = direction[1] ?? SHADED_LIGHT_DIRECTION_DEFAULT[1];
    this.shadingArray[offset++] = direction[2] ?? SHADED_LIGHT_DIRECTION_DEFAULT[2];
    this.shadingArray[offset++] = 0;
    this.shadingArray[offset++] = lightColor[0] ?? SHADED_LIGHT_COLOR_DEFAULT[0];
    this.shadingArray[offset++] = lightColor[1] ?? SHADED_LIGHT_COLOR_DEFAULT[1];
    this.shadingArray[offset++] = lightColor[2] ?? SHADED_LIGHT_COLOR_DEFAULT[2];
    this.shadingArray[offset++] = lightColor[3] ?? SHADED_LIGHT_COLOR_DEFAULT[3];
    this.shadingArray[offset++] = ambientTop[0] ?? SHADED_AMBIENT_TOP_COLOR_DEFAULT[0];
    this.shadingArray[offset++] = ambientTop[1] ?? SHADED_AMBIENT_TOP_COLOR_DEFAULT[1];
    this.shadingArray[offset++] = ambientTop[2] ?? SHADED_AMBIENT_TOP_COLOR_DEFAULT[2];
    this.shadingArray[offset++] = ambientTop[3] ?? SHADED_AMBIENT_TOP_COLOR_DEFAULT[3];
    this.shadingArray[offset++] = ambientBottom[0] ?? SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT[0];
    this.shadingArray[offset++] = ambientBottom[1] ?? SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT[1];
    this.shadingArray[offset++] = ambientBottom[2] ?? SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT[2];
    this.shadingArray[offset++] = ambientBottom[3] ?? SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT[3];
    this.shadingArray[offset++] = specularColor[0] ?? SHADED_SPECULAR_COLOR_DEFAULT[0];
    this.shadingArray[offset++] = specularColor[1] ?? SHADED_SPECULAR_COLOR_DEFAULT[1];
    this.shadingArray[offset++] = specularColor[2] ?? SHADED_SPECULAR_COLOR_DEFAULT[2];
    this.shadingArray[offset++] = specularColor[3] ?? SHADED_SPECULAR_COLOR_DEFAULT[3];
    this.shadingArray[offset++] = specularStrength;
    this.shadingArray[offset++] = shininess;
    this.shadingArray[offset++] = diffuseStrength;
    this.shadingArray[offset++] = ambientStrength;
    device.queue.writeBuffer(this.shadingBuffer, 0, this.shadingArray);
  }

  prepareWeightedResources(context, cameraUniforms, useEdgeIndices, edgeVariant) {
    const device = this.device?.device;
    if (!device) return false;
    const maxTargets = device.limits?.maxColorAttachments ?? 1;
    if (maxTargets < 2) {
      this.weightedSupported = false;
      return false;
    }

    const viewport = cameraUniforms?.viewport;
    const pixelRatio = viewport?.devicePixelRatio ?? this.size?.devicePixelRatio ?? 1;
    const width = context?.width
      ?? context?.target?.width
      ?? Math.max(1, Math.floor((viewport?.width ?? this.size?.width ?? 1) * pixelRatio));
    const height = context?.height
      ?? context?.target?.height
      ?? Math.max(1, Math.floor((viewport?.height ?? this.size?.height ?? 1) * pixelRatio));
    if (!this.ensureWeightedTextures(device, width, height)) {
      this.weightedSupported = false;
      return false;
    }
    if (!this.ensureWeightedPipelines(device, context.format, useEdgeIndices, edgeVariant)) {
      this.weightedSupported = false;
      return false;
    }
    this.ensureWeightedResolveBindGroup(device);
    const ready = Boolean(this.edgeWeightedPipeline && this.edgeResolveBindGroup && this.edgeResolveLayout);
    this.weightedSupported = ready;
    return ready;
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

  ensureWeightedPipelines(device, swapchainFormat, useEdgeIndices, edgeVariant) {
    const colorFormat = this.weightedTextures?.color?.format ?? 'rgba16float';
    const weightFormat = this.weightedTextures?.weight?.format ?? 'r16float';
    if (!colorFormat || !weightFormat) return false;

    const additiveBlend = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    };

    const depthWriteEnabled = this.edgeDepthWrite === true;
    const needsRebuild =
      !this.weightedPipelineFormats ||
      this.weightedPipelineFormats.color !== colorFormat ||
      this.weightedPipelineFormats.weight !== weightFormat ||
      this.weightedPipelineFormats.swapchain !== swapchainFormat ||
      this.weightedPipelineFormats.depthWriteEnabled !== depthWriteEnabled ||
      this.edgeWeightedUseIndices !== useEdgeIndices ||
      this.weightedPipelineFormats.edgeVariantKey !== this.getEdgeVariantKey(useEdgeIndices, edgeVariant);

    const weightedModule = this.getEdgeWeightedModule(useEdgeIndices, edgeVariant);
    if (!weightedModule) return false;
    if (!this.edgeResolveModule) {
      this.edgeResolveModule = device.createShaderModule({ code: EDGE_WEIGHTED_RESOLVE_WGSL });
    }

    if (needsRebuild) {
      const depthStencilAccumulate = {
        format: this.device.depthFormat ?? 'depth24plus',
        depthWriteEnabled,
        depthCompare: 'less-equal',
      };

      this.edgeWeightedPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
        vertex: { module: weightedModule, entryPoint: 'edgeVertex' },
        fragment: {
          module: weightedModule,
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
          module: weightedModule,
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
          module: weightedModule,
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
        depthWriteEnabled,
        edgeVariantKey: this.getEdgeVariantKey(useEdgeIndices, edgeVariant),
      };
      this.edgeWeightedUseIndices = useEdgeIndices;
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

  getResolvePipeline(mode, swapchainFormat, sampleCount = 1) {
    const resolvedSampleCount = Number.isFinite(sampleCount) && sampleCount > 1 ? 4 : 1;
    const key = `${mode ?? 'default'}|${swapchainFormat}|s:${resolvedSampleCount}`;
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
      multisample: { count: resolvedSampleCount },
      primitive: { topology: 'triangle-strip' },
    });

    this.edgeResolvePipelineCache.set(key, pipeline);
    return pipeline;
  }

  renderWeighted(context, { geometry, is2D, drawNodes, nodeBlendWithEdges, mode }) {
    this.counters.weightedAttachmentRenders = bumpCounter(this.counters.weightedAttachmentRenders);
    const commandEncoder = context.commandEncoder;
    const targetView = context.colorView;
    const depthView = context.depthView;
    const useQuads = (this.getEffectiveEdgeRenderingMode?.() ?? this.edgeRenderingMode) === 'quad' && this.edgeWeightedQuadPipeline;
    const edgePipeline = useQuads ? this.edgeWeightedQuadPipeline : this.edgeWeightedPipeline;
    const edgeVertexBuffer = useQuads ? this.edgeQuadBufferGpu : null;
    const applyViewport = (pass) => {
      if (context.viewport && pass?.setViewport) {
        pass.setViewport(context.viewport.x, context.viewport.y, context.viewport.width, context.viewport.height, 0, 1);
      }
    };

    // Draw nodes first for 3D to populate depth, mirroring the existing ordering.
    if (!is2D && !nodeBlendWithEdges) {
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
          ...(context.resolveTargetView ? { resolveTarget: context.resolveTargetView } : {}),
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
    resolvePass.setPipeline(this.getResolvePipeline(mode, context.format, context.sampleCount ?? 1));
    resolvePass.setBindGroup(0, this.edgeResolveBindGroup);
    resolvePass.setVertexBuffer(0, context.quad);
    resolvePass.draw(4, 1, 0, 0);

    if (is2D || nodeBlendWithEdges) {
      drawNodes(resolvePass);
    }

    context.passEncoder = resolvePass;
  }
}
