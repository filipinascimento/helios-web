import { GraphLayerWebGPUBase } from './GraphLayerWebGPUBase.js';
import { createGraphWebGPUSources } from './shaders/graphWebGPU.js';
import { GraphVisualSchema } from '../schema/GraphVisualSchema.js';
import { VISUAL_ATTRIBUTE_NAMES } from '../../pipeline/constants.js';
import { AttributeType } from 'helios-network';

const {
  NODE_COLOR_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

function normalizeEndpoints(value) {
  if (value === 'source' || value === 'from') return 'source';
  if (value === 'destination' || value === 'target' || value === 'to') return 'destination';
  return 'both';
}

function warnOnce(owner, key, message, detail) {
  if (!owner) return;
  owner._warnedIssues ??= new Set();
  if (owner._warnedIssues.has(key)) return;
  owner._warnedIssues.add(key);
  console.warn(message, detail);
}

function isMissingAttributeError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return (
    message.includes('Unknown node attribute')
    || message.includes('Unknown edge attribute')
    || message.includes('Cannot perform attribute metadata lookup')
  );
}

export class GraphLayerWebGPU extends GraphLayerWebGPUBase {
  constructor(options = {}) {
    super(options);
    this.edgeNodeSourceBuffers = {};
    this.edgeNodeSourceBindings = null;
    this.edgeBindGroupLayouts = new Map();
    this.edgeBindGroups = new Map();
    this._edgeBuffersLastByKey = new Map();
  }

  initializeWebGPU(device) {
    super.initializeWebGPU(device);
    const gpu = device?.device;
    if (!gpu) return;
    this.edgeBindGroupLayout = null;
    this.edgeBindGroup = null;
    this.edgeBindGroupLayouts.clear();
    this.edgeBindGroups.clear();
    this._edgeBuffersLastByKey.clear();
    this.edgeModules.clear();
    this.edgeWeightedModules.clear();
    this.edgePipelineCache.clear();
    this.edgeQuadPipelineCache.clear();
  }

  resolveEdgeBindings(useIndices, variant) {
    const key = this.getEdgeVariantKey(useIndices, variant);
    const cached = this.edgeBindGroupLayouts.get(key);
    if (cached) return cached;
    const device = this.device?.device;
    if (!device) return null;

    const useEdgeColorBuffer = variant?.colorBuffer && variant?.colorSource !== 'node';
    const useEdgeColorNode = variant?.colorBuffer && variant?.colorSource === 'node';
    const useEdgeWidthBuffer = variant?.widthBuffer && variant?.widthSource !== 'node';
    const useEdgeWidthNode = variant?.widthBuffer && variant?.widthSource === 'node';
    const useEdgeOpacityBuffer = variant?.opacityBuffer && variant?.opacitySource !== 'node';
    const useEdgeOpacityNode = variant?.opacityBuffer && variant?.opacitySource === 'node';
    const useEdgeEndpointSizeBuffer = variant?.endpointSizeBuffer && variant?.endpointSizeSource !== 'node';
    const useEdgeEndpointSizeNode = variant?.endpointSizeBuffer && variant?.endpointSizeSource === 'node';
    const useEndpointState = variant?.endpointState === true;
    const useEdgeState = variant?.edgeState === true;

    const specs = [];
    let binding = 0;
    const push = (name, visibility, type = 'read-only-storage') => {
      specs.push({ name, binding, visibility, type });
      binding += 1;
    };

    push('camera', GPUShaderStage.VERTEX, 'uniform');
    if (useIndices) {
      push('edgeIndices', GPUShaderStage.VERTEX);
    }
    push('edgeEndpoints', GPUShaderStage.VERTEX);
    push('nodePositions', GPUShaderStage.VERTEX);
    push('nodePositionsFrom', GPUShaderStage.VERTEX);
    if (useEndpointState) {
      push('nodeStates', GPUShaderStage.VERTEX);
    }
    if (useEdgeState) {
      push('edgeStates', GPUShaderStage.VERTEX);
    }
    if (useEdgeColorNode) {
      push('edgeNodeColorSource', GPUShaderStage.VERTEX);
    } else if (useEdgeColorBuffer) {
      push('edgeColors', GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT);
    }
    if (useEdgeWidthNode) {
      push('edgeNodeWidthSource', GPUShaderStage.VERTEX);
    } else if (useEdgeWidthBuffer) {
      push('edgeWidths', GPUShaderStage.VERTEX);
    }
    if (useEdgeOpacityNode) {
      push('edgeNodeOpacitySource', GPUShaderStage.VERTEX);
    } else if (useEdgeOpacityBuffer) {
      push('edgeOpacities', GPUShaderStage.VERTEX);
    }
    if (useEdgeEndpointSizeNode) {
      push('edgeNodeEndpointSizeSource', GPUShaderStage.VERTEX);
    } else if (useEdgeEndpointSizeBuffer) {
      push('edgeEndpointSizes', GPUShaderStage.VERTEX);
    }
    push('globals', GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, 'uniform');
    push('hover', GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, 'uniform');

    const entries = specs.map((spec) => ({
      binding: spec.binding,
      visibility: spec.visibility,
      buffer: { type: spec.type },
    }));
    const layout = device.createBindGroupLayout({ entries });
    const bindings = {};
    for (const spec of specs) {
      bindings[spec.name] = spec.binding;
    }

    const result = { key, layout, bindings, specs };
    this.edgeBindGroupLayouts.set(key, result);
    return result;
  }

  resolveEdgeVariant(visualConfig, options = {}) {
    const edgeCfg = visualConfig?.edge ?? null;
    const fastPath = options.fastPath === true || this.isFastEdgeRenderingActive?.() === true;
    const specialization = this.resolveEdgeSpecialization({
      fastPath,
      is2D: options.is2D === true,
    });
    const normalize = (entry, fallbackSource = 'edge') => {
      if (!entry || typeof entry !== 'object') {
        return {
          mode: 'buffer',
          source: fallbackSource,
          endpoints: 'both',
          doubleWidth: true,
          nodeAttribute: null,
        };
      }
      return {
        mode: entry.mode ?? 'buffer',
        source: entry.source ?? fallbackSource,
        endpoints: normalizeEndpoints(entry.endpoints),
        doubleWidth: entry.doubleWidth !== false,
        nodeAttribute: entry.nodeAttribute ?? null,
      };
    };

    const color = normalize(edgeCfg?.color, 'edge');
    const width = normalize(edgeCfg?.width, 'edge');
    const opacity = normalize(edgeCfg?.opacity, 'edge');
    const endpointSize = normalize(edgeCfg?.endpointSize, 'edge');

    if (fastPath) {
      return {
        colorBuffer: color.mode !== 'uniform',
        colorSource: color.source,
        colorEndpoints: color.endpoints,
        colorDoubleWidth: color.doubleWidth,
        colorNodeAttribute: color.nodeAttribute,
        widthBuffer: false,
        widthSource: 'edge',
        widthEndpoints: 'both',
        widthDoubleWidth: false,
        widthNodeAttribute: null,
        opacityBuffer: false,
        opacitySource: 'edge',
        opacityEndpoints: 'both',
        opacityDoubleWidth: false,
        opacityNodeAttribute: null,
        endpointSizeBuffer: false,
        endpointSizeSource: 'edge',
        endpointSizeEndpoints: 'both',
        endpointSizeDoubleWidth: false,
        endpointSizeNodeAttribute: null,
        cameraMode: specialization.cameraMode,
        semanticZoom: specialization.semanticZoom,
        trim: specialization.trim,
        edgeState: specialization.edgeState,
        endpointState: specialization.endpointState,
        fastPath: true,
      };
    }

    return {
      colorBuffer: color.mode !== 'uniform',
      colorSource: color.source,
      colorEndpoints: color.endpoints,
      colorDoubleWidth: color.doubleWidth,
      colorNodeAttribute: color.nodeAttribute,
      widthBuffer: width.mode !== 'uniform',
      widthSource: width.source,
      widthEndpoints: width.endpoints,
      widthDoubleWidth: width.doubleWidth,
      widthNodeAttribute: width.nodeAttribute,
      opacityBuffer: opacity.mode !== 'uniform',
      opacitySource: opacity.source,
      opacityEndpoints: opacity.endpoints,
      opacityDoubleWidth: opacity.doubleWidth,
      opacityNodeAttribute: opacity.nodeAttribute,
      endpointSizeBuffer: specialization.trim && endpointSize.mode !== 'uniform',
      endpointSizeSource: endpointSize.source,
      endpointSizeEndpoints: endpointSize.endpoints,
      endpointSizeDoubleWidth: endpointSize.doubleWidth,
      endpointSizeNodeAttribute: endpointSize.nodeAttribute,
      cameraMode: specialization.cameraMode,
      semanticZoom: specialization.semanticZoom,
      trim: specialization.trim,
      edgeState: specialization.edgeState,
      endpointState: specialization.endpointState,
      fastPath: false,
    };
  }

  getEdgeVariantKey(useIndices, variant) {
    return [
      useIndices ? 'idx' : 'id',
      `f:${variant?.fastPath ? 1 : 0}`,
      `cm:${variant?.cameraMode ?? '3d'}`,
      `sz:${variant?.semanticZoom ? 1 : 0}`,
      `tr:${variant?.trim ? 1 : 0}`,
      `st:${variant?.edgeState ? 1 : 0}`,
      `et:${variant?.endpointState ? 1 : 0}`,
      `c:${variant?.colorBuffer ? 'B' : 'U'}:${variant?.colorSource}:${variant?.colorEndpoints}:${variant?.colorDoubleWidth ? 1 : 0}:${variant?.colorNodeAttribute ?? ''}`,
      `w:${variant?.widthBuffer ? 'B' : 'U'}:${variant?.widthSource}:${variant?.widthEndpoints}:${variant?.widthDoubleWidth ? 1 : 0}:${variant?.widthNodeAttribute ?? ''}`,
      `o:${variant?.opacityBuffer ? 'B' : 'U'}:${variant?.opacitySource}:${variant?.opacityEndpoints}:${variant?.opacityDoubleWidth ? 1 : 0}:${variant?.opacityNodeAttribute ?? ''}`,
      `es:${variant?.endpointSizeBuffer ? 'B' : 'U'}:${variant?.endpointSizeSource}:${variant?.endpointSizeEndpoints}:${variant?.endpointSizeDoubleWidth ? 1 : 0}:${variant?.endpointSizeNodeAttribute ?? ''}`,
    ].join('|');
  }

  getEdgeModule(useIndices, variant) {
    const key = this.getEdgeVariantKey(useIndices, variant);
    if (this.edgeModules.has(key)) return this.edgeModules.get(key);
    const device = this.device?.device;
    if (!device) return null;
    const bindingInfo = this.resolveEdgeBindings(useIndices, variant);
    const sources = createGraphWebGPUSources(this.stateSlotCount, {
      useEdgeIndices: useIndices,
      bindings: bindingInfo?.bindings ?? null,
      edge: {
        fastPath: variant?.fastPath === true,
        cameraMode: variant?.cameraMode ?? '3d',
        semanticZoom: variant?.semanticZoom === true,
        trim: variant?.trim === true,
        edgeState: variant?.edgeState === true,
        endpointState: variant?.endpointState === true,
        color: {
          mode: variant?.colorBuffer ? 'buffer' : 'uniform',
          source: variant?.colorSource,
          endpoints: variant?.colorEndpoints,
          doubleWidth: variant?.colorDoubleWidth,
        },
        width: {
          mode: variant?.widthBuffer ? 'buffer' : 'uniform',
          source: variant?.widthSource,
          endpoints: variant?.widthEndpoints,
          doubleWidth: variant?.widthDoubleWidth,
        },
        opacity: {
          mode: variant?.opacityBuffer ? 'buffer' : 'uniform',
          source: variant?.opacitySource,
          endpoints: variant?.opacityEndpoints,
          doubleWidth: variant?.opacityDoubleWidth,
        },
        endpointSize: {
          mode: variant?.endpointSizeBuffer ? 'buffer' : 'uniform',
          source: variant?.endpointSizeSource,
          endpoints: variant?.endpointSizeEndpoints,
          doubleWidth: variant?.endpointSizeDoubleWidth,
        },
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
    const bindingInfo = this.resolveEdgeBindings(useIndices, variant);
    const sources = createGraphWebGPUSources(this.stateSlotCount, {
      useEdgeIndices: useIndices,
      bindings: bindingInfo?.bindings ?? null,
      edge: {
        fastPath: variant?.fastPath === true,
        cameraMode: variant?.cameraMode ?? '3d',
        semanticZoom: variant?.semanticZoom === true,
        trim: variant?.trim === true,
        edgeState: variant?.edgeState === true,
        endpointState: variant?.endpointState === true,
        color: {
          mode: variant?.colorBuffer ? 'buffer' : 'uniform',
          source: variant?.colorSource,
          endpoints: variant?.colorEndpoints,
          doubleWidth: variant?.colorDoubleWidth,
        },
        width: {
          mode: variant?.widthBuffer ? 'buffer' : 'uniform',
          source: variant?.widthSource,
          endpoints: variant?.widthEndpoints,
          doubleWidth: variant?.widthDoubleWidth,
        },
        opacity: {
          mode: variant?.opacityBuffer ? 'buffer' : 'uniform',
          source: variant?.opacitySource,
          endpoints: variant?.opacityEndpoints,
          doubleWidth: variant?.opacityDoubleWidth,
        },
        endpointSize: {
          mode: variant?.endpointSizeBuffer ? 'buffer' : 'uniform',
          source: variant?.endpointSizeSource,
          endpoints: variant?.endpointSizeEndpoints,
          doubleWidth: variant?.endpointSizeDoubleWidth,
        },
      },
    });
    const module = device.createShaderModule({ code: sources.EDGE_WEIGHTED_WGSL });
    this.edgeWeightedModules.set(key, module);
    return module;
  }

  createEdgePipelines(
    key,
    blend,
    edgeModule,
    depthStencil,
    fragmentEntryPoint,
    useIndices,
    edgeVariant,
    depthWriteEnabled,
    sampleCount = 1,
  ) {
    const device = this.device?.device;
    if (!device || !edgeModule || !depthStencil) return;
    const bindingInfo = this.resolveEdgeBindings(useIndices, edgeVariant);
    const edgeLayout = bindingInfo?.layout;
    if (!edgeLayout) return;
    const resolvedSampleCount = Number.isFinite(sampleCount) && sampleCount > 1 ? 4 : 1;
    const linePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [edgeLayout] }),
      vertex: { module: edgeModule, entryPoint: 'edgeVertex' },
      fragment: {
        module: edgeModule,
        entryPoint: fragmentEntryPoint,
        targets: [{ format: this.device.format, blend }],
      },
      depthStencil: { ...depthStencil, depthWriteEnabled: Boolean(depthWriteEnabled) },
      multisample: { count: resolvedSampleCount },
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
      multisample: { count: resolvedSampleCount },
      primitive: { topology: 'triangle-strip' },
    });

    const variantKey = this.getEdgeVariantKey(useIndices, edgeVariant);
    const cacheKey = `${key}|${variantKey}|d${depthWriteEnabled ? 1 : 0}|s${resolvedSampleCount}`;
    this.edgePipelineCache.set(cacheKey, linePipeline);
    this.edgeQuadPipelineCache.set(cacheKey, quadPipeline);
  }

  ensureWeightedPipelines(device, swapchainFormat, useEdgeIndices, edgeVariant) {
    const bindingInfo = this.resolveEdgeBindings(useEdgeIndices, edgeVariant);
    if (!bindingInfo?.layout) return false;
    const prevLayout = this.edgeBindGroupLayout;
    this.edgeBindGroupLayout = bindingInfo.layout;
    const result = super.ensureWeightedPipelines(device, swapchainFormat, useEdgeIndices, edgeVariant);
    this.edgeBindGroupLayout = prevLayout;
    return result;
  }

  updateNodeBuffersGpuIndirect(nodes, device, maxBindingSize, nodeVariant, uploads = {}, edgeSources = null) {
    const {
      positions,
      positionBuffer,
      sizes,
      colors,
      states,
      outlineWidths,
      outlineColors,
      indices,
      versions = {},
      count,
    } = nodes;
    const nodeCount = Number.isFinite(count)
      ? Math.max(0, Math.floor(count))
      : Math.floor((indices?.length ?? 0));
    const cache = this._nodeDataCache;
    const v = nodeVariant && typeof nodeVariant === 'object'
      ? nodeVariant
      : { colorBuffer: true, sizeBuffer: true, outlineWidthBuffer: this.nodeOutlineUseAttributes === true, outlineColorBuffer: this.nodeOutlineUseAttributes === true };
    const uploadColors = Boolean(uploads.colors) || v.colorBuffer;
    const uploadSizes = Boolean(uploads.sizes) || v.sizeBuffer;
    const uploadPositions = uploads.positions !== false;
    const uploadStates = uploads.states !== false;
    if (!positions && !positionBuffer && nodeCount) {
      throw new Error('Node positions buffer is missing for indirect rendering.');
    }
    if (uploadSizes && !sizes && nodeCount) {
      throw new Error('Node sizes buffer is missing for indirect rendering.');
    }
    if (uploadColors && !colors && nodeCount) {
      throw new Error('Node colors buffer is missing for indirect rendering.');
    }
    if (uploadStates && !states && nodeCount) {
      throw new Error('Node states buffer is missing for indirect rendering.');
    }
    const useOutlineAttributes = Boolean(v.outlineWidthBuffer || v.outlineColorBuffer);
    const outlineModeChanged = this._nodeOutlineUseAttributesLast !== useOutlineAttributes;
    this._nodeOutlineUseAttributesLast = useOutlineAttributes;

    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX;
    const resourceCache = this.device?.resourceCache?.webgpu;
    if (!resourceCache) {
      throw new Error('WebGPU resource cache is missing; expected device.resourceCache.webgpu.');
    }

    const checkBindingSize = (label, requiredBytes) => {
      const aligned = Math.max(256, Math.ceil((requiredBytes ?? 0) / 256) * 256);
      if (maxBindingSize && aligned > maxBindingSize) {
        const message = `${label} requires ${aligned} bytes, exceeding maxStorageBufferBindingSize (${maxBindingSize}).`;
        console.warn(message);
        throw new Error(message);
      }
      return aligned;
    };

    const ensure = (key, requiredBytes, label) => {
      checkBindingSize(label, requiredBytes);
      return resourceCache.ensureBuffer(device, key, requiredBytes, storageUsage, label);
    };
    const interpolationState = this.getPositionInterpolationState?.() ?? this.positionInterpolation ?? null;
    const interpolationEnabled = interpolationState?.enabled === true;
    const interpolationSourceBuffer = interpolationState?.sourceWebGPUBuffer ?? null;
    const interpolationSourceView = interpolationState?.sourceView ?? null;
    const interpolationSourceVersion = Number.isFinite(interpolationState?.sourceVersion)
      ? Number(interpolationState.sourceVersion)
      : 0;
    const interpolationSourceCount = Number.isFinite(interpolationState?.sourceCount)
      ? Math.max(0, Math.floor(Number(interpolationState.sourceCount)))
      : Math.floor((interpolationSourceView?.length ?? 0) / 3);
    const delegatePositionBuffer = positionBuffer ?? null;

    if (!indices && nodeCount) {
      throw new Error('Node index buffer is missing for indirect rendering.');
    }

    this.nodeBuffersGpu.indices = ensure('indirect:node:indices', indices?.byteLength ?? 4, 'Node index buffer');
    this.nodeBuffersGpu.positions = delegatePositionBuffer
      ? { buffer: delegatePositionBuffer }
      : ensure(
        'indirect:node:positions',
        positions?.byteLength ?? 12,
        'Node position buffer',
      );
    this.nodeBuffersGpu.sizes = ensure(
      'indirect:node:sizes',
      uploadSizes ? (sizes?.byteLength ?? 4) : 4,
      'Node size buffer',
    );
    this.nodeBuffersGpu.colors = ensure(
      'indirect:node:colors',
      uploadColors ? (colors?.byteLength ?? 16) : 16,
      'Node color buffer',
    );
    this.nodeBuffersGpu.states = ensure(
      'indirect:node:states',
      uploadStates ? (states?.byteLength ?? 4) : 4,
      'Node state buffer',
    );
    if (interpolationEnabled) {
      if (interpolationSourceBuffer) {
        this.nodeBuffersGpu.positionsFrom = { buffer: interpolationSourceBuffer };
      } else if (interpolationSourceView) {
        this.nodeBuffersGpu.positionsFrom = ensure(
          'indirect:node:positionsFrom',
          interpolationSourceView?.byteLength ?? 12,
          'Node interpolation source position buffer',
        );
      } else {
        this.nodeBuffersGpu.positionsFrom = this.nodeBuffersGpu.positions;
      }
    } else {
      this.nodeBuffersGpu.positionsFrom = this.nodeBuffersGpu.positions;
    }

    if (useOutlineAttributes) {
      this.nodeBuffersGpu.outlineWidths = ensure(
        'indirect:node:outlineWidths',
        v.outlineWidthBuffer ? (outlineWidths?.byteLength ?? 4) : 4,
        'Node outline width buffer',
      );
      this.nodeBuffersGpu.outlineColors = ensure(
        'indirect:node:outlineColors',
        v.outlineColorBuffer ? (outlineColors?.byteLength ?? 16) : 16,
        'Node outline color buffer',
      );
    }

    const buffersChanged = (
      this._nodeBuffersLast?.indices !== this.nodeBuffersGpu.indices?.buffer
      || this._nodeBuffersLast?.positions !== this.nodeBuffersGpu.positions?.buffer
      || this._nodeBuffersLast?.positionsFrom !== this.nodeBuffersGpu.positionsFrom?.buffer
      || this._nodeBuffersLast?.sizes !== this.nodeBuffersGpu.sizes?.buffer
      || this._nodeBuffersLast?.colors !== this.nodeBuffersGpu.colors?.buffer
      || this._nodeBuffersLast?.states !== this.nodeBuffersGpu.states?.buffer
    );

    if (nodeCount > 0) {
      resourceCache.uploadBuffer(device, device.queue, 'indirect:node:indices', indices, {
        label: 'Node index buffer',
        version: versions.indices ?? 0,
        topologyVersion: versions.topology ?? 0,
        count: nodeCount,
        trackViewIdentity: true,
      }, storageUsage);
      if (uploadPositions && !delegatePositionBuffer && positions) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:node:positions', positions, {
          label: 'Node position buffer',
          version: versions.positions ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: nodeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      if (interpolationEnabled && !interpolationSourceBuffer && interpolationSourceView) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:node:positionsFrom', interpolationSourceView, {
          label: 'Node interpolation source position buffer',
          version: interpolationSourceVersion,
          topologyVersion: versions.topology ?? 0,
          count: interpolationSourceCount || nodeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      if (uploadSizes) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:node:sizes', sizes, {
          label: 'Node size buffer',
          version: versions.sizes ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: nodeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      if (uploadColors) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:node:colors', colors, {
          label: 'Node color buffer',
          version: versions.colors ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: nodeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      if (uploadStates) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:node:states', states, {
          label: 'Node state buffer',
          version: versions.states ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: nodeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      cache.count = nodeCount;
    }

    const edgeSourceEntries = edgeSources && typeof edgeSources === 'object' ? edgeSources : {};
    const edgeSourceBuffers = this.edgeNodeSourceBuffers ?? {};
    const uploadEdgeSource = (key, entry, label) => {
      if (!entry?.view) {
        edgeSourceBuffers[key] = null;
        return;
      }
      const view = entry.view;
      const bufferEntry = ensure(`indirect:node:edgeSource:${key}`, view.byteLength ?? 0, label);
      edgeSourceBuffers[key] = bufferEntry;
      if (nodeCount > 0) {
        const dimension = entry.dimension ?? 1;
        const count = Number.isFinite(entry.count)
          ? entry.count
          : (dimension > 0 ? Math.floor((view.length ?? 0) / dimension) : view.length ?? 0);
        resourceCache.uploadBuffer(device, device.queue, `indirect:node:edgeSource:${key}`, view, {
          label,
          version: entry.version ?? 0,
          topologyVersion: versions.topology ?? 0,
          count,
          trackViewIdentity: true,
        }, storageUsage);
      }
    };

    uploadEdgeSource('color', edgeSourceEntries.color, 'Edge node color source buffer');
    uploadEdgeSource('width', edgeSourceEntries.width, 'Edge node width source buffer');
    uploadEdgeSource('opacity', edgeSourceEntries.opacity, 'Edge node opacity source buffer');
    uploadEdgeSource('endpointSize', edgeSourceEntries.endpointSize, 'Edge node endpoint size source buffer');

    this.edgeNodeSourceBuffers = edgeSourceBuffers;
    const defaultColorBuffer = this.nodeBuffersGpu.colors?.buffer ?? null;
    const defaultScalarBuffer = this.nodeBuffersGpu.sizes?.buffer ?? null;
    this.edgeNodeSourceBindings = {
      color: edgeSourceBuffers.color?.buffer ?? defaultColorBuffer,
      width: edgeSourceBuffers.width?.buffer ?? defaultScalarBuffer,
      opacity: edgeSourceBuffers.opacity?.buffer ?? defaultScalarBuffer,
      endpointSize: edgeSourceBuffers.endpointSize?.buffer ?? defaultScalarBuffer,
    };

    if (useOutlineAttributes) {
      const outlineBuffersChanged = outlineModeChanged
        || this._nodeBuffersLastOutline?.indices !== this.nodeBuffersGpu.indices?.buffer
        || this._nodeBuffersLastOutline?.positions !== this.nodeBuffersGpu.positions?.buffer
        || this._nodeBuffersLastOutline?.positionsFrom !== this.nodeBuffersGpu.positionsFrom?.buffer
        || this._nodeBuffersLastOutline?.sizes !== this.nodeBuffersGpu.sizes?.buffer
        || this._nodeBuffersLastOutline?.colors !== this.nodeBuffersGpu.colors?.buffer
        || this._nodeBuffersLastOutline?.states !== this.nodeBuffersGpu.states?.buffer
        || this._nodeBuffersLastOutline?.outlineWidths !== this.nodeBuffersGpu.outlineWidths?.buffer
        || this._nodeBuffersLastOutline?.outlineColors !== this.nodeBuffersGpu.outlineColors?.buffer;

      if (nodeCount > 0) {
        if (v.outlineWidthBuffer && outlineWidths) {
          resourceCache.uploadBuffer(device, device.queue, 'indirect:node:outlineWidths', outlineWidths, {
            label: 'Node outline width buffer',
            version: versions.outlineWidths ?? 0,
            topologyVersion: versions.topology ?? 0,
            count: nodeCount,
            trackViewIdentity: true,
          }, storageUsage);
        }
        if (v.outlineColorBuffer && outlineColors) {
          resourceCache.uploadBuffer(device, device.queue, 'indirect:node:outlineColors', outlineColors, {
            label: 'Node outline color buffer',
            version: versions.outlineColors ?? 0,
            topologyVersion: versions.topology ?? 0,
            count: nodeCount,
            trackViewIdentity: true,
          }, storageUsage);
        }
      }

      if (outlineBuffersChanged || !this.nodeBindGroupOutline) {
        const entries = [
          { binding: 0, resource: { buffer: this.cameraBuffer } },
          { binding: 1, resource: { buffer: this.nodeBuffersGpu.indices.buffer } },
          { binding: 2, resource: { buffer: this.nodeBuffersGpu.positions.buffer } },
          { binding: 3, resource: { buffer: this.nodeBuffersGpu.sizes.buffer } },
          { binding: 4, resource: { buffer: this.nodeBuffersGpu.colors.buffer } },
          { binding: 5, resource: { buffer: this.nodeBuffersGpu.states.buffer } },
          { binding: 6, resource: { buffer: this.globalsBuffer } },
          { binding: 7, resource: { buffer: this.hoverBuffer } },
          { binding: 8, resource: { buffer: this.nodeBuffersGpu.outlineWidths.buffer } },
          { binding: 9, resource: { buffer: this.nodeBuffersGpu.outlineColors.buffer } },
          { binding: 10, resource: { buffer: this.nodeBuffersGpu.positionsFrom.buffer } },
        ];
        this.nodeBindGroupOutline = device.createBindGroup({
          layout: this.nodeBindGroupLayoutOutline,
          entries,
        });
        this._nodeBuffersLastOutline = {
          indices: this.nodeBuffersGpu.indices.buffer,
          positions: this.nodeBuffersGpu.positions.buffer,
          positionsFrom: this.nodeBuffersGpu.positionsFrom.buffer,
          sizes: this.nodeBuffersGpu.sizes.buffer,
          colors: this.nodeBuffersGpu.colors.buffer,
          states: this.nodeBuffersGpu.states.buffer,
          outlineWidths: this.nodeBuffersGpu.outlineWidths.buffer,
          outlineColors: this.nodeBuffersGpu.outlineColors.buffer,
        };
      }
    } else {
      this.nodeBindGroupOutline = null;
      this._nodeBuffersLastOutline = null;
      this._nodeVersionsLastOutline = null;
    }

    if (buffersChanged || !this.nodeBindGroup) {
      const entries = [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.nodeBuffersGpu.indices.buffer } },
        { binding: 2, resource: { buffer: this.nodeBuffersGpu.positions.buffer } },
        { binding: 3, resource: { buffer: this.nodeBuffersGpu.sizes.buffer } },
        { binding: 4, resource: { buffer: this.nodeBuffersGpu.colors.buffer } },
        { binding: 5, resource: { buffer: this.nodeBuffersGpu.states.buffer } },
        { binding: 6, resource: { buffer: this.globalsBuffer } },
        { binding: 7, resource: { buffer: this.hoverBuffer } },
        { binding: 10, resource: { buffer: this.nodeBuffersGpu.positionsFrom.buffer } },
      ];
      this.nodeBindGroup = device.createBindGroup({
        layout: this.nodeBindGroupLayout,
        entries,
      });
      this._nodeBuffersLast = {
        indices: this.nodeBuffersGpu.indices.buffer,
        positions: this.nodeBuffersGpu.positions.buffer,
        positionsFrom: this.nodeBuffersGpu.positionsFrom.buffer,
        sizes: this.nodeBuffersGpu.sizes.buffer,
        colors: this.nodeBuffersGpu.colors.buffer,
        states: this.nodeBuffersGpu.states.buffer,
      };
    }
  }

  updateEdgeBuffersGpuIndirect(edges, device, maxBindingSize, edgeVariant, useEdgeIndices = true) {
    const {
      endpoints,
      colors,
      indices,
      widths,
      endpointSizes,
      opacities,
      states,
      versions = {},
      count,
    } = edges;
    const edgeCount = Number.isFinite(count)
      ? Math.max(0, Math.floor(count))
      : Math.floor((indices?.length ?? 0));
    const cache = this._edgeDataCache;
    const useEdgeColorBuffer = edgeVariant?.colorBuffer && edgeVariant?.colorSource !== 'node';
    const useEdgeWidthBuffer = edgeVariant?.widthBuffer && edgeVariant?.widthSource !== 'node';
    const useEdgeOpacityBuffer = edgeVariant?.opacityBuffer && edgeVariant?.opacitySource !== 'node';
    const useEdgeEndpointSizeBuffer = edgeVariant?.endpointSizeBuffer && edgeVariant?.endpointSizeSource !== 'node';
    const useEdgeStateBuffer = edgeVariant?.edgeState === true;

    if (useEdgeIndices && !indices && edgeCount) {
      throw new Error('Edge index buffer is missing for indirect rendering.');
    }
    if (!endpoints && edgeCount) {
      throw new Error('Edge endpoints buffer is missing for indirect rendering.');
    }
    if (useEdgeColorBuffer && !colors && edgeCount) {
      throw new Error('Edge colors buffer is missing for indirect rendering.');
    }
    if (useEdgeWidthBuffer && !widths && edgeCount) {
      throw new Error('Edge widths buffer is missing for indirect rendering.');
    }
    if (useEdgeOpacityBuffer && !opacities && edgeCount) {
      throw new Error('Edge opacities buffer is missing for indirect rendering.');
    }
    if (useEdgeEndpointSizeBuffer && !endpointSizes && edgeCount) {
      throw new Error('Edge endpoint sizes buffer is missing for indirect rendering.');
    }
    if (useEdgeStateBuffer && !states && edgeCount) {
      throw new Error('Edge states buffer is missing for indirect rendering.');
    }

    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX;
    const resourceCache = this.device?.resourceCache?.webgpu;
    if (!resourceCache) {
      throw new Error('WebGPU resource cache is missing; expected device.resourceCache.webgpu.');
    }
    const checkBindingSize = (label, requiredBytes) => {
      const aligned = Math.max(256, Math.ceil((requiredBytes ?? 0) / 256) * 256);
      if (maxBindingSize && aligned > maxBindingSize) {
        const message = `${label} requires ${aligned} bytes, exceeding maxStorageBufferBindingSize (${maxBindingSize}).`;
        console.warn(message);
        throw new Error(message);
      }
      return aligned;
    };
    const ensure = (key, requiredBytes, label) => {
      checkBindingSize(label, requiredBytes);
      return resourceCache.ensureBuffer(device, key, requiredBytes, storageUsage, label);
    };

    if (useEdgeIndices) {
      this.edgeBuffersGpu.indices = ensure('indirect:edge:indices', indices?.byteLength ?? 4, 'Edge index buffer');
    }
    this.edgeBuffersGpu.endpoints = ensure('indirect:edge:endpoints', endpoints?.byteLength ?? 8, 'Edge endpoints buffer');
    this.edgeBuffersGpu.colors = ensure('indirect:edge:colors', useEdgeColorBuffer ? (colors?.byteLength ?? 32) : 32, 'Edge color buffer');
    this.edgeBuffersGpu.widths = ensure('indirect:edge:widths', useEdgeWidthBuffer ? (widths?.byteLength ?? 4) : 4, 'Edge width buffer');
    this.edgeBuffersGpu.endpointSizes = ensure(
      'indirect:edge:endpointSizes',
      useEdgeEndpointSizeBuffer ? (endpointSizes?.byteLength ?? 4) : 4,
      'Edge endpoint size buffer',
    );
    this.edgeBuffersGpu.opacities = ensure('indirect:edge:opacities', useEdgeOpacityBuffer ? (opacities?.byteLength ?? 4) : 4, 'Edge opacity buffer');
    this.edgeBuffersGpu.states = ensure('indirect:edge:states', useEdgeStateBuffer ? (states?.byteLength ?? 4) : 4, 'Edge state buffer');

    const edgeSourceBindings = this.edgeNodeSourceBindings ?? {
      color: this.nodeBuffersGpu.colors?.buffer ?? null,
      width: this.nodeBuffersGpu.sizes?.buffer ?? null,
      opacity: this.nodeBuffersGpu.sizes?.buffer ?? null,
      endpointSize: this.nodeBuffersGpu.sizes?.buffer ?? null,
    };

    const bindingInfo = this.resolveEdgeBindings(useEdgeIndices, edgeVariant);
    const bindingMap = bindingInfo?.bindings ?? {};
    const bindGroupKey = bindingInfo?.key ?? this.getEdgeVariantKey(useEdgeIndices, edgeVariant);
    const lastBuffers = this._edgeBuffersLastByKey.get(bindGroupKey) ?? null;
    const currentBuffers = {
      camera: this.cameraBuffer,
      globals: this.globalsBuffer,
      hover: this.hoverBuffer,
      edgeIndices: this.edgeBuffersGpu.indices?.buffer ?? null,
      edgeEndpoints: this.edgeBuffersGpu.endpoints?.buffer ?? null,
      nodePositions: this.nodeBuffersGpu.positions?.buffer ?? null,
      nodePositionsFrom: this.nodeBuffersGpu.positionsFrom?.buffer ?? this.nodeBuffersGpu.positions?.buffer ?? null,
      nodeStates: this.nodeBuffersGpu.states?.buffer ?? null,
      edgeStates: this.edgeBuffersGpu.states?.buffer ?? null,
      edgeColors: this.edgeBuffersGpu.colors?.buffer ?? null,
      edgeWidths: this.edgeBuffersGpu.widths?.buffer ?? null,
      edgeEndpointSizes: this.edgeBuffersGpu.endpointSizes?.buffer ?? null,
      edgeOpacities: this.edgeBuffersGpu.opacities?.buffer ?? null,
      edgeNodeColorSource: edgeSourceBindings.color ?? null,
      edgeNodeWidthSource: edgeSourceBindings.width ?? null,
      edgeNodeOpacitySource: edgeSourceBindings.opacity ?? null,
      edgeNodeEndpointSizeSource: edgeSourceBindings.endpointSize ?? null,
    };
    let buffersChanged = false;
    for (const name of Object.keys(bindingMap)) {
      if ((lastBuffers?.[name] ?? null) !== (currentBuffers[name] ?? null)) {
        buffersChanged = true;
        break;
      }
    }

    if (edgeCount > 0) {
      if (useEdgeIndices) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:edge:indices', indices, {
          label: 'Edge index buffer',
          version: versions.indices ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: edgeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      resourceCache.uploadBuffer(device, device.queue, 'indirect:edge:endpoints', endpoints, {
        label: 'Edge endpoints buffer',
        version: versions.endpoints ?? versions.topology ?? 0,
        topologyVersion: versions.topology ?? 0,
        count: edgeCount,
        trackViewIdentity: true,
      }, storageUsage);
      if (useEdgeColorBuffer) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:edge:colors', colors, {
          label: 'Edge color buffer',
          version: versions.colors ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: edgeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      if (useEdgeWidthBuffer) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:edge:widths', widths, {
          label: 'Edge width buffer',
          version: versions.widths ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: edgeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      if (useEdgeOpacityBuffer) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:edge:opacities', opacities, {
          label: 'Edge opacity buffer',
          version: versions.opacities ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: edgeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      if (useEdgeEndpointSizeBuffer) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:edge:endpointSizes', endpointSizes, {
          label: 'Edge endpoint size buffer',
          version: versions.endpointSizes ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: edgeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      if (useEdgeStateBuffer) {
        resourceCache.uploadBuffer(device, device.queue, 'indirect:edge:states', states, {
          label: 'Edge state buffer',
          version: versions.states ?? 0,
          topologyVersion: versions.topology ?? 0,
          count: edgeCount,
          trackViewIdentity: true,
        }, storageUsage);
      }
      cache.count = edgeCount;
    }

    if (buffersChanged || !this.edgeBindGroups.get(bindGroupKey)) {
      const entries = [];
      const push = (name, buffer) => {
        const binding = bindingMap[name];
        if (binding == null || !buffer) return;
        entries.push({ binding, resource: { buffer } });
      };
      push('camera', currentBuffers.camera);
      push('edgeIndices', currentBuffers.edgeIndices);
      push('edgeEndpoints', currentBuffers.edgeEndpoints);
      push('nodePositions', currentBuffers.nodePositions);
      push('nodePositionsFrom', currentBuffers.nodePositionsFrom);
      push('nodeStates', currentBuffers.nodeStates);
      push('edgeStates', currentBuffers.edgeStates);
      push('edgeColors', currentBuffers.edgeColors);
      push('edgeWidths', currentBuffers.edgeWidths);
      push('edgeEndpointSizes', currentBuffers.edgeEndpointSizes);
      push('edgeOpacities', currentBuffers.edgeOpacities);
      push('edgeNodeColorSource', currentBuffers.edgeNodeColorSource);
      push('edgeNodeWidthSource', currentBuffers.edgeNodeWidthSource);
      push('edgeNodeOpacitySource', currentBuffers.edgeNodeOpacitySource);
      push('edgeNodeEndpointSizeSource', currentBuffers.edgeNodeEndpointSizeSource);
      push('globals', currentBuffers.globals);
      push('hover', currentBuffers.hover);

      const bindGroup = device.createBindGroup({
        layout: bindingInfo.layout,
        entries,
      });
      this.edgeBindGroups.set(bindGroupKey, bindGroup);
      const usedBuffers = {};
      for (const name of Object.keys(bindingMap)) {
        usedBuffers[name] = currentBuffers[name] ?? null;
      }
      this._edgeBuffersLastByKey.set(bindGroupKey, usedBuffers);
    }
    this.edgeBindGroup = this.edgeBindGroups.get(bindGroupKey) ?? null;
  }

  getSharedSparseResources() {
    const cacheBuffers = this.device?.resourceCache?.webgpu?.buffers ?? null;
    const keys = [
      'indirect:node:indices',
      'indirect:node:positions',
      'indirect:node:positionsFrom',
      'indirect:node:sizes',
      'indirect:node:outlineWidths',
      'indirect:node:edgeSource:width',
      'indirect:node:edgeSource:endpointSize',
      'indirect:edge:indices',
      'indirect:edge:endpoints',
      'indirect:edge:widths',
      'indirect:edge:endpointSizes',
    ];
    const buffers = {};
    for (const key of keys) {
      buffers[key] = cacheBuffers?.get(key) ?? null;
    }

    const adoptActiveBuffer = (key, activeBuffer, fallback = {}) => {
      if (!activeBuffer) return;
      const existing = buffers[key] ?? null;
      if (existing?.buffer === activeBuffer) {
        buffers[key] = {
          ...existing,
          count: existing.count ?? fallback.count ?? null,
          byteLength: existing.byteLength ?? activeBuffer?.size ?? fallback.byteLength ?? null,
        };
        return;
      }
      buffers[key] = {
        buffer: activeBuffer,
        version: fallback.version ?? null,
        topologyVersion: fallback.topologyVersion ?? null,
        count: fallback.count ?? null,
        byteLength: activeBuffer?.size ?? fallback.byteLength ?? null,
      };
    };

    const interpolation = this.getPositionInterpolationState?.() ?? this.positionInterpolation ?? null;
    const nodeCount = this._nodeDataCache?.count ?? null;
    adoptActiveBuffer('indirect:node:positions', this.nodeBuffersGpu.positions?.buffer ?? null, {
      count: nodeCount,
    });
    adoptActiveBuffer('indirect:node:positionsFrom', this.nodeBuffersGpu.positionsFrom?.buffer ?? null, {
      version: interpolation?.sourceVersion ?? null,
      count: interpolation?.sourceCount ?? nodeCount,
    });

    return { buffers };
  }

  withSparseGraph(network, topologyVersions, indices, edgeNodeAttributes, fn) {
    if (!network) return fn(null);
    if (typeof network.withBufferAccess !== 'function') {
      console.warn('GraphLayerWebGPU: network does not support buffer access sessions');
      return false;
    }
    const hasNodeAttribute = (name) => (
      Boolean(name) && (network._nodeAttributes?.has?.(name) ?? false)
    );
    const hasEdgeAttribute = (name) => (
      Boolean(name) && (network._edgeAttributes?.has?.(name) ?? false)
    );
    return network.withBufferAccess(() => {
      const nodeIndices = indices?.node ?? network.nodeIndices ?? null;
      const edgeIndices = indices?.edge ?? network.edgeIndices ?? null;
      const safeGet = (scope, name) => {
        if (!name) return null;
        if (scope === 'node' && !hasNodeAttribute(name)) return null;
        if (scope === 'edge' && !hasEdgeAttribute(name)) return null;
        const getter = scope === 'node' ? network.getNodeAttributeBuffer : network.getEdgeAttributeBuffer;
        if (typeof getter !== 'function') return null;
        return getter.call(network, name);
      };
      const resolveNodeSource = (name, dimension, label) => {
        if (!name) return null;
        const buffer = safeGet('node', name);
        if (!buffer || !buffer.view) {
          throw new Error(`GraphLayerWebGPU: missing node attribute ${label ?? name}.`);
        }
        if (buffer.type !== AttributeType.Float) {
          throw new Error(`GraphLayerWebGPU: node attribute ${label ?? name} must be Float.`);
        }
        if (typeof dimension === 'number' && buffer.dimension !== dimension) {
          throw new Error(`GraphLayerWebGPU: node attribute ${label ?? name} must have dimension ${dimension}.`);
        }
        const resolvedDimension = buffer.dimension ?? dimension ?? 1;
        const count = resolvedDimension > 0
          ? Math.floor((buffer.view.length ?? 0) / resolvedDimension)
          : buffer.view.length ?? 0;
        return {
          attribute: name,
          view: buffer.view,
          version: buffer.version ?? 0,
          dimension: resolvedDimension,
          count,
        };
      };
      const nodePositions = safeGet('node', NODE_POSITION_ATTRIBUTE);
      const nodeSizes = safeGet('node', NODE_SIZE_ATTRIBUTE);
      const nodeColors = safeGet('node', NODE_COLOR_ATTRIBUTE);
      const nodeStates = safeGet('node', NODE_STATE_ATTRIBUTE);
      const nodeOutlineWidths = safeGet('node', NODE_OUTLINE_WIDTH_ATTRIBUTE);
      const nodeOutlineColors = safeGet('node', NODE_OUTLINE_COLOR_ATTRIBUTE);

      const edgeColors = safeGet('edge', EDGE_COLOR_ATTRIBUTE);
      const edgeWidths = safeGet('edge', EDGE_WIDTH_ATTRIBUTE);
      const edgeOpacities = safeGet('edge', EDGE_OPACITY_ATTRIBUTE);
      const edgeEndpointSizes = safeGet('edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
      const edgeStates = safeGet('edge', EDGE_STATE_ATTRIBUTE);
      const positionOverride = this.resolvePositionSourceOverride(network, {
        backend: 'webgpu',
        device: this.device?.device ?? null,
      });
      const resolvedNodePositionBuffer = positionOverride?.webgpuBuffer ?? null;
      const resolvedNodePositions = resolvedNodePositionBuffer
        ? (positionOverride?.view ?? null)
        : (positionOverride?.view ?? nodePositions?.view ?? null);
      const resolvedNodePositionVersion = Number.isFinite(positionOverride?.version)
        ? Number(positionOverride.version)
        : (nodePositions?.version ?? 0);

      const nodeEdgeSources = {
        color: resolveNodeSource(edgeNodeAttributes?.color, 4, 'edge color source'),
        width: resolveNodeSource(edgeNodeAttributes?.width, 1, 'edge width source'),
        opacity: resolveNodeSource(edgeNodeAttributes?.opacity, 1, 'edge opacity source'),
        endpointSize: resolveNodeSource(edgeNodeAttributes?.endpointSize, 1, 'edge endpoint size source'),
      };

      const nodes = {
        positions: resolvedNodePositions,
        positionBuffer: resolvedNodePositionBuffer,
        sizes: nodeSizes?.view ?? null,
        colors: nodeColors?.view ?? null,
        states: nodeStates?.view ?? null,
        outlineWidths: nodeOutlineWidths?.view ?? null,
        outlineColors: nodeOutlineColors?.view ?? null,
        indices: nodeIndices,
        count: nodeIndices?.length ?? 0,
        versions: {
          positions: resolvedNodePositionVersion,
          sizes: nodeSizes?.version ?? 0,
          colors: nodeColors?.version ?? 0,
          states: nodeStates?.version ?? 0,
          outlineWidths: nodeOutlineWidths?.version ?? 0,
          outlineColors: nodeOutlineColors?.version ?? 0,
          indices: topologyVersions?.node ?? 0,
          topology: topologyVersions?.node ?? 0,
        },
      };

      const edges = {
        endpoints: network.edgesView ?? null,
        colors: edgeColors?.view ?? null,
        widths: edgeWidths?.view ?? null,
        opacities: edgeOpacities?.view ?? null,
        endpointSizes: edgeEndpointSizes?.view ?? null,
        states: edgeStates?.view ?? null,
        indices: edgeIndices,
        count: edgeIndices?.length ?? 0,
        versions: {
          endpoints: topologyVersions?.edge ?? 0,
          colors: edgeColors?.version ?? 0,
          widths: edgeWidths?.version ?? 0,
          opacities: edgeOpacities?.version ?? 0,
          endpointSizes: edgeEndpointSizes?.version ?? 0,
          states: edgeStates?.version ?? 0,
          indices: topologyVersions?.edge ?? 0,
          topology: topologyVersions?.edge ?? 0,
        },
      };

      return fn({ nodes, edges, nodeEdgeSources });
    });
  }

  render(context, frame) {
    if (!context || context.type !== 'webgpu') return;
    const network = frame?.network;
    if (!network) return;
    const { camera } = frame ?? {};
    const gpuDevice = this.device?.device;
    if (!gpuDevice) return;
    const maxBindingSize = gpuDevice.limits?.maxStorageBufferBindingSize;
    const cameraUniforms = this.getCameraUniforms(camera, context);
    const fastEdges = this.isFastEdgeRenderingActive?.() === true;
    const edgeRenderingMode = this.getEffectiveEdgeRenderingMode?.() ?? this.edgeRenderingMode;
    const transparencyMode = fastEdges ? 'alpha' : this.edgeTransparencyMode;
    const nodeBlendWithEdges = this.nodeBlendWithEdges === true;
    const weightedRequested = !fastEdges && (transparencyMode === 'weighted'
      || transparencyMode === 'additive-normalized'
      || transparencyMode === 'additive-tonemapped'
      || transparencyMode === 'additive-normalized-bright');
    let weightedReady = false;
    let nodeCount = 0;
    let edgeCount = 0;
    const useNodeIndices = true;
    const useEdgeIndices = true;
    let is2D = cameraUniforms?.mode === '2d';

    const schema = GraphVisualSchema.fromNetwork(network, {
      nodeOutlineUseAttributes: this.nodeOutlineUseAttributes === true,
    });
    const visualConfig = schema.visualConfig;
    const nodeVariant = this.resolveNodeVariant(visualConfig);
    const edgeVariant = this.resolveEdgeVariant(visualConfig, { fastPath: fastEdges, is2D });

    let topologyVersions = { node: 0, edge: 0 };
    if (typeof network.getTopologyVersions === 'function') {
      try {
        topologyVersions = network.getTopologyVersions();
      } catch (_) {
        topologyVersions = { node: 0, edge: 0 };
      }
    }

    const edgeNodeAttributes = {
      color: edgeVariant?.colorSource === 'node'
        ? (edgeVariant.colorNodeAttribute ?? NODE_COLOR_ATTRIBUTE)
        : null,
      width: edgeVariant?.widthSource === 'node'
        ? (edgeVariant.widthNodeAttribute ?? NODE_SIZE_ATTRIBUTE)
        : null,
      opacity: edgeVariant?.opacitySource === 'node'
        ? (edgeVariant.opacityNodeAttribute ?? NODE_SIZE_ATTRIBUTE)
        : null,
      endpointSize: edgeVariant?.endpointSizeSource === 'node'
        ? (edgeVariant.endpointSizeNodeAttribute ?? NODE_SIZE_ATTRIBUTE)
        : null,
    };
    const customEdgeNodeAttributes = {
      color: edgeNodeAttributes.color && edgeNodeAttributes.color !== NODE_COLOR_ATTRIBUTE
        ? edgeNodeAttributes.color
        : null,
      width: edgeNodeAttributes.width && edgeNodeAttributes.width !== NODE_SIZE_ATTRIBUTE
        ? edgeNodeAttributes.width
        : null,
      opacity: edgeNodeAttributes.opacity && edgeNodeAttributes.opacity !== NODE_SIZE_ATTRIBUTE
        ? edgeNodeAttributes.opacity
        : null,
      endpointSize: edgeNodeAttributes.endpointSize && edgeNodeAttributes.endpointSize !== NODE_SIZE_ATTRIBUTE
        ? edgeNodeAttributes.endpointSize
        : null,
    };

    const usesDefaultNodeColor = Boolean(edgeNodeAttributes.color && edgeNodeAttributes.color === NODE_COLOR_ATTRIBUTE);
    const usesDefaultNodeSize = Boolean(
      (edgeNodeAttributes.width && edgeNodeAttributes.width === NODE_SIZE_ATTRIBUTE)
      || (edgeNodeAttributes.opacity && edgeNodeAttributes.opacity === NODE_SIZE_ATTRIBUTE)
      || (edgeNodeAttributes.endpointSize && edgeNodeAttributes.endpointSize === NODE_SIZE_ATTRIBUTE),
    );

    const passes = [];
    const ok = this.withSparseGraph(
      network,
      topologyVersions,
      null,
      customEdgeNodeAttributes,
      (geometry) => {
      if (!geometry) return false;
      nodeCount = geometry.nodes.count ?? 0;
      edgeCount = geometry.edges.count ?? 0;
      is2D = cameraUniforms?.mode === '2d';

      this.updateGlobalsGpu(gpuDevice, cameraUniforms, visualConfig);
      this.updateCameraUniformsGpu(camera, cameraUniforms);
      this.updateHoverGpu(gpuDevice);
      if (!this.cameraBuffer) return false;

      if (nodeCount) {
        this.updateNodeBuffersGpuIndirect(geometry.nodes, gpuDevice, maxBindingSize, nodeVariant, {
          positions: true,
          sizes: Boolean(nodeVariant?.sizeBuffer || usesDefaultNodeSize),
          colors: Boolean(nodeVariant?.colorBuffer || usesDefaultNodeColor),
          states: true,
        }, geometry.nodeEdgeSources);
      } else {
        this.nodeBindGroup = null;
        this.nodeBindGroupOutline = null;
        this._nodeVersionsLast = null;
        this._nodeVersionsLastOutline = null;
        this._nodeBuffersLastOutline = null;
        this._nodeDataCache.count = 0;
      }
      if (edgeCount) {
        this.updateEdgeBuffersGpuIndirect(geometry.edges, gpuDevice, maxBindingSize, edgeVariant, useEdgeIndices);
      } else {
        this.edgeBindGroup = null;
        this._edgeVersionsLast = null;
        this._edgeDataCache.count = 0;
      }
      return true;
    });
    if (!ok || !this.cameraBuffer) return;

    const effectiveEdgeCount = this.shouldRenderEdges() ? edgeCount : 0;
    weightedReady = weightedRequested && effectiveEdgeCount > 0
      ? this.prepareWeightedResources(context, cameraUniforms, useEdgeIndices, edgeVariant)
      : false;

    const useNodeOutlineAttributes = Boolean(nodeVariant?.outlineWidthBuffer || nodeVariant?.outlineColorBuffer);
    const nodeBlend = nodeBlendWithEdges ? this.getBlendForMode(transparencyMode) : this.getBlendForMode('alpha');
    const nodePipeline = this.getNodePipeline(useNodeIndices, nodeVariant, {
      blendKey: nodeBlend.key,
      blend: nodeBlend.blend,
      depthMode: nodeBlendWithEdges ? 'none' : 'depth',
      sampleCount: context.sampleCount ?? 1,
    });
    if (!nodePipeline) return;
    const edgePipelines = this.getEdgePipelinesForMode(
      transparencyMode,
      gpuDevice,
      useEdgeIndices,
      edgeVariant,
      context.sampleCount ?? 1,
    );

    const drawNodes = (passEncoder) => {
      const nodeBindGroup = useNodeOutlineAttributes ? this.nodeBindGroupOutline : this.nodeBindGroup;
      if (!nodeCount || !nodeBindGroup || !passEncoder) return;
      passEncoder.setPipeline(nodePipeline);
      passEncoder.setBindGroup(0, nodeBindGroup);
      passEncoder.setVertexBuffer(0, this.nodeQuadBufferGpu);
      passEncoder.draw(4, nodeCount, 0, 0);
    };

    const drawEdgesAlpha = (passEncoder) => {
      if (!effectiveEdgeCount || !this.edgeBindGroup || !passEncoder) return;
      if (edgeRenderingMode === 'quad' && edgePipelines?.quad) {
        passEncoder.setPipeline(edgePipelines.quad);
        passEncoder.setBindGroup(0, this.edgeBindGroup);
        passEncoder.setVertexBuffer(0, this.edgeQuadBufferGpu);
        passEncoder.draw(4, effectiveEdgeCount, 0, 0);
      } else if (edgePipelines?.line) {
        passEncoder.setPipeline(edgePipelines.line);
        passEncoder.setBindGroup(0, this.edgeBindGroup);
        passEncoder.draw(effectiveEdgeCount * 2, 1, 0, 0);
      }
    };

    if (!weightedReady) {
      if (weightedRequested && !this.warnedWeightedFallback && effectiveEdgeCount > 0) {
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
        geometry: { nodes: { count: nodeCount }, edges: { count: effectiveEdgeCount } },
        is2D,
        drawNodes,
        nodeBlendWithEdges,
        mode: transparencyMode,
      }));
    }

    this.frameGraph.run(passes, context);
  }
}

export default GraphLayerWebGPU;
