import {
  createGraphWebGLSources,
} from './shaders/graphWebGL.js';
import { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './GraphLayerCommon.js';
import { GraphLayer } from './GraphLayer.js';
import { FrameGraphRunner } from './framegraph/FrameGraphRunner.js';
import { bumpCounter } from '../../utilities/counters.js';
import { GraphVisualSchema } from '../schema/GraphVisualSchema.js';

export class GraphLayerWebGL extends GraphLayer {
  constructor(options = {}) {
    super(options);
    this.device = null;
    this.gl = null;
    this.frameGraph = new FrameGraphRunner();

    this.nodeProgramCache = new Map();
    this.edgeProgramCache = new Map();
    this.edgeQuadProgramCache = new Map();
    this.edgeWeightedProgramCache = new Map();
    this.edgeWeightedQuadProgramCache = new Map();
    this.edgeProgram = null;
    this.edgeQuadProgram = null;
    this.edgeWeightedProgram = null;
    this.edgeWeightedQuadProgram = null;
    this.edgeResolveProgram = null;
    this._nodeProgramKeyLast = null;
    this._edgeProgramKeyLast = null;
    this.edgeUniformViewProjection = null;
    this.edgeUniformOpacityBase = null;
    this.edgeUniformOpacityScale = null;
    this.edgeUniformWidthBase = null;
    this.edgeUniformWidthScale = null;
    this.edgeUniformNodeSizeBase = null;
    this.edgeUniformNodeSizeScale = null;
    this.edgeUniformEndpointTrim = null;
    this.edgeUniformNodeNoStateScale = null;
    this.edgeUniformNodeStateScale = null;
    this.edgeUniformNoStateScale = null;
    this.edgeUniformNoStateColorMul = null;
    this.edgeUniformNoStateColorAdd = null;
    this.edgeUniformStateScale = null;
    this.edgeUniformStateColorMul = null;
    this.edgeUniformStateColorAdd = null;
    this.edgeQuadUniformViewProjection = null;
    this.edgeQuadUniformViewport = null;
    this.edgeQuadUniformOpacityBase = null;
    this.edgeQuadUniformOpacityScale = null;
    this.edgeQuadUniformWidthBase = null;
    this.edgeQuadUniformWidthScale = null;
    this.edgeQuadUniformNodeSizeBase = null;
    this.edgeQuadUniformNodeSizeScale = null;
    this.edgeQuadUniformEndpointTrim = null;
    this.edgeQuadUniformNodeNoStateScale = null;
    this.edgeQuadUniformNodeStateScale = null;
    this.edgeQuadUniformNoStateScale = null;
    this.edgeQuadUniformNoStateColorMul = null;
    this.edgeQuadUniformNoStateColorAdd = null;
    this.edgeQuadUniformStateScale = null;
    this.edgeQuadUniformStateColorMul = null;
    this.edgeQuadUniformStateColorAdd = null;
    this.edgeWeightedUniformViewProjection = null;
    this.edgeWeightedUniformOpacityBase = null;
    this.edgeWeightedUniformOpacityScale = null;
    this.edgeWeightedUniformWidthBase = null;
    this.edgeWeightedUniformWidthScale = null;
    this.edgeWeightedUniformNodeSizeBase = null;
    this.edgeWeightedUniformNodeSizeScale = null;
    this.edgeWeightedUniformEndpointTrim = null;
    this.edgeWeightedUniformNodeNoStateScale = null;
    this.edgeWeightedUniformNodeStateScale = null;
    this.edgeWeightedUniformNoStateScale = null;
    this.edgeWeightedUniformNoStateColorMul = null;
    this.edgeWeightedUniformNoStateColorAdd = null;
    this.edgeWeightedUniformStateScale = null;
    this.edgeWeightedUniformStateColorMul = null;
    this.edgeWeightedUniformStateColorAdd = null;
    this.edgeWeightedQuadUniformViewProjection = null;
    this.edgeWeightedQuadUniformViewport = null;
    this.edgeWeightedQuadUniformOpacityBase = null;
    this.edgeWeightedQuadUniformOpacityScale = null;
    this.edgeWeightedQuadUniformWidthBase = null;
    this.edgeWeightedQuadUniformWidthScale = null;
    this.edgeWeightedQuadUniformNodeSizeBase = null;
    this.edgeWeightedQuadUniformNodeSizeScale = null;
    this.edgeWeightedQuadUniformEndpointTrim = null;
    this.edgeWeightedQuadUniformNodeNoStateScale = null;
    this.edgeWeightedQuadUniformNodeStateScale = null;
    this.edgeWeightedQuadUniformNoStateScale = null;
    this.edgeWeightedQuadUniformNoStateColorMul = null;
    this.edgeWeightedQuadUniformNoStateColorAdd = null;
    this.edgeWeightedQuadUniformStateScale = null;
    this.edgeWeightedQuadUniformStateColorMul = null;
    this.edgeWeightedQuadUniformStateColorAdd = null;
    this.edgeResolveUniformColor = null;
    this.edgeResolveUniformWeight = null;
    this.edgeResolveVAO = null;
    this.edgeResolveBuffer = null;
    this.edgeResolveTonemapProgram = null;
    this.edgeResolveTonemapUniformColor = null;
    this.edgeResolveTonemapUniformWeight = null;
    this.edgeResolveBoostProgram = null;
    this.edgeResolveBoostUniformColor = null;
    this.edgeResolveBoostUniformWeight = null;
    this.nodeVAO = null;
    this.nodeBuffers = {};
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.edgeBuffers = {};
    this.nodeQuadBuffer = null;
    this.edgeQuadBuffer = null;
    this.weightedFramebuffer = null;
    this.weightedColor = null;
    this.weightedWeight = null;
    this.weightedDepth = null;
    this.weightedSize = null;
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.weightedSupported = null;
    this.warnedWeightedFallback = false;
    this._nodeVersionsLast = null;
    this._nodeOutlineUseAttrsLast = false;
    this._edgeVersionsLast = null;
    this._shaderSources = null;
    this.counters = { weightedFramebufferRenders: 0 };
  }

  getVisualConfig(network) {
    const cfg = network && network.__heliosVisualConfig;
    return cfg && typeof cfg === 'object' ? cfg : null;
  }

  resolveNodeVariant(useOutlineAttributesOrVariant, visualConfig) {
    if (useOutlineAttributesOrVariant && typeof useOutlineAttributesOrVariant === 'object') {
      return {
        color: useOutlineAttributesOrVariant.color !== false,
        size: useOutlineAttributesOrVariant.size !== false,
        outline: useOutlineAttributesOrVariant.outline === true,
        outlineColor: useOutlineAttributesOrVariant.outlineColor === true,
      };
    }

    const outlineToggle = useOutlineAttributesOrVariant === true;
    const nodeCfg = visualConfig?.node;
    return {
      color: nodeCfg?.color?.mode !== 'uniform',
      size: nodeCfg?.size?.mode !== 'uniform',
      outline: nodeCfg?.outline?.mode !== 'uniform' ? true : false,
      outlineColor: nodeCfg?.outlineColor?.mode !== 'uniform' ? true : false,
      // If no visualConfig, preserve previous behavior: only outline used a toggle.
      ...(visualConfig ? null : { outline: outlineToggle, outlineColor: outlineToggle }),
    };
  }

  resolveEdgeVariant(visualConfig) {
    const edgeCfg = visualConfig?.edge;
    if (!edgeCfg) {
      return { color: true, width: true, opacity: true, endpointSize: true };
    }
    return {
      color: edgeCfg?.color?.mode !== 'uniform',
      width: edgeCfg?.width?.mode !== 'uniform',
      opacity: edgeCfg?.opacity?.mode !== 'uniform',
      endpointSize: edgeCfg?.endpointSize?.mode !== 'uniform',
    };
  }

  getEdgeProgram(kind, edgeVariant, weighted = false, premultiplyAlpha = false) {
    const gl = this.gl;
    if (!gl || !this.device) return null;

    const isQuad = kind === 'quad';

    const v = edgeVariant && typeof edgeVariant === 'object'
      ? edgeVariant
      : { color: true, width: true, opacity: true, endpointSize: true };

    const key = `edge|${weighted ? 'w' : (premultiplyAlpha ? 'p' : 'a')}|${isQuad ? 'q' : 'l'}|${v.color ? 'cA' : 'cU'}|${v.width ? 'wA' : 'wU'}|${v.opacity ? 'oA' : 'oU'}|${v.endpointSize ? 'esA' : 'esU'}`;
    const sharedCache = this.device?.resourceCache?.webgl;
    const sharedKey = `graph:webgl:${this.stateSlotCount}:${key}`;
    if (sharedCache) {
      return sharedCache.getOrCreateProgram(sharedKey, () => {
        const sources = createGraphWebGLSources(this.stateSlotCount, {
          edge: {
            color: v.color ? 'attribute' : 'uniform',
            width: v.width ? 'attribute' : 'uniform',
            opacity: v.opacity ? 'attribute' : 'uniform',
            endpointSize: v.endpointSize ? 'attribute' : 'uniform',
          },
        });

        const vert = isQuad ? sources.EDGE_QUAD_VERTEX_SOURCE : sources.EDGE_VERTEX_SOURCE;
        const frag = weighted
          ? (isQuad ? sources.EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE : sources.EDGE_WEIGHTED_FRAGMENT_SOURCE)
          : (premultiplyAlpha
            ? (isQuad ? sources.EDGE_PREMUL_QUAD_FRAGMENT_SOURCE : sources.EDGE_PREMUL_FRAGMENT_SOURCE)
            : sources.EDGE_FRAGMENT_SOURCE);
        const program = this.device.createProgram(vert, frag);

        const uniforms = {
          viewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
          viewport: gl.getUniformLocation(program, 'u_viewport'),
          opacityBase: gl.getUniformLocation(program, 'u_edgeOpacityBase'),
          opacityScale: gl.getUniformLocation(program, 'u_edgeOpacityScale'),
          widthBase: gl.getUniformLocation(program, 'u_edgeWidthBase'),
          widthScale: gl.getUniformLocation(program, 'u_edgeWidthScale'),
          nodeSizeBase: gl.getUniformLocation(program, 'u_nodeSizeBase'),
          nodeSizeScale: gl.getUniformLocation(program, 'u_nodeSizeScale'),
          endpointTrim: gl.getUniformLocation(program, 'u_edgeEndpointTrim'),
          hoverIndex: gl.getUniformLocation(program, 'u_hoverEdgeIndex'),
          hoverState: gl.getUniformLocation(program, 'u_hoverEdgeState'),
          nodeNoStateScale: gl.getUniformLocation(program, 'u_nodeNoStateScale'),
          nodeStateScale: gl.getUniformLocation(program, 'u_nodeStateScale[0]'),
          noStateScale: gl.getUniformLocation(program, 'u_edgeNoStateScale'),
          noStateColorMul: gl.getUniformLocation(program, 'u_edgeNoStateColorMul'),
          noStateColorAdd: gl.getUniformLocation(program, 'u_edgeNoStateColorAdd'),
          stateScale: gl.getUniformLocation(program, 'u_edgeStateScale[0]'),
          stateColorMul: gl.getUniformLocation(program, 'u_edgeStateColorMul[0]'),
          stateColorAdd: gl.getUniformLocation(program, 'u_edgeStateColorAdd[0]'),
          edgeColorStart: gl.getUniformLocation(program, 'u_edgeColorStart'),
          edgeColorEnd: gl.getUniformLocation(program, 'u_edgeColorEnd'),
          edgeWidth: gl.getUniformLocation(program, 'u_edgeWidth'),
          edgeOpacity: gl.getUniformLocation(program, 'u_edgeOpacity'),
          edgeEndpointSize: gl.getUniformLocation(program, 'u_edgeEndpointSize'),
        };

        return { key, program, uniforms, variant: v };
      });
    }

    // Fallback for unexpected device setups.
    const cache = weighted
      ? (isQuad ? this.edgeWeightedQuadProgramCache : this.edgeWeightedProgramCache)
      : (isQuad ? this.edgeQuadProgramCache : this.edgeProgramCache);
    if (cache.has(key)) return cache.get(key);

    const sources = createGraphWebGLSources(this.stateSlotCount, {
      edge: {
        color: v.color ? 'attribute' : 'uniform',
        width: v.width ? 'attribute' : 'uniform',
        opacity: v.opacity ? 'attribute' : 'uniform',
        endpointSize: v.endpointSize ? 'attribute' : 'uniform',
      },
    });

    const vert = isQuad ? sources.EDGE_QUAD_VERTEX_SOURCE : sources.EDGE_VERTEX_SOURCE;
    const frag = weighted
      ? (isQuad ? sources.EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE : sources.EDGE_WEIGHTED_FRAGMENT_SOURCE)
      : (premultiplyAlpha
        ? (isQuad ? sources.EDGE_PREMUL_QUAD_FRAGMENT_SOURCE : sources.EDGE_PREMUL_FRAGMENT_SOURCE)
        : sources.EDGE_FRAGMENT_SOURCE);
    const program = this.device.createProgram(vert, frag);

    const uniforms = {
      viewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
      viewport: gl.getUniformLocation(program, 'u_viewport'),
      opacityBase: gl.getUniformLocation(program, 'u_edgeOpacityBase'),
      opacityScale: gl.getUniformLocation(program, 'u_edgeOpacityScale'),
      widthBase: gl.getUniformLocation(program, 'u_edgeWidthBase'),
      widthScale: gl.getUniformLocation(program, 'u_edgeWidthScale'),
      nodeSizeBase: gl.getUniformLocation(program, 'u_nodeSizeBase'),
      nodeSizeScale: gl.getUniformLocation(program, 'u_nodeSizeScale'),
      endpointTrim: gl.getUniformLocation(program, 'u_edgeEndpointTrim'),
      hoverIndex: gl.getUniformLocation(program, 'u_hoverEdgeIndex'),
      hoverState: gl.getUniformLocation(program, 'u_hoverEdgeState'),
      nodeNoStateScale: gl.getUniformLocation(program, 'u_nodeNoStateScale'),
      nodeStateScale: gl.getUniformLocation(program, 'u_nodeStateScale[0]'),
      noStateScale: gl.getUniformLocation(program, 'u_edgeNoStateScale'),
      noStateColorMul: gl.getUniformLocation(program, 'u_edgeNoStateColorMul'),
      noStateColorAdd: gl.getUniformLocation(program, 'u_edgeNoStateColorAdd'),
      stateScale: gl.getUniformLocation(program, 'u_edgeStateScale[0]'),
      stateColorMul: gl.getUniformLocation(program, 'u_edgeStateColorMul[0]'),
      stateColorAdd: gl.getUniformLocation(program, 'u_edgeStateColorAdd[0]'),
      edgeColorStart: gl.getUniformLocation(program, 'u_edgeColorStart'),
      edgeColorEnd: gl.getUniformLocation(program, 'u_edgeColorEnd'),
      edgeWidth: gl.getUniformLocation(program, 'u_edgeWidth'),
      edgeOpacity: gl.getUniformLocation(program, 'u_edgeOpacity'),
      edgeEndpointSize: gl.getUniformLocation(program, 'u_edgeEndpointSize'),
    };

    const entry = { key, program, uniforms, variant: v };
    cache.set(key, entry);
    return entry;
  }

  setEdgeUniforms(gl, uniforms, cameraUniforms, viewportWidth, viewportHeight, edgeWidthBase, edgeWidthScale, edgeConfig = null) {
    if (!gl || !uniforms || !cameraUniforms) return;
    if (uniforms.viewProjection) gl.uniformMatrix4fv(uniforms.viewProjection, false, cameraUniforms.viewProjection);
    if (uniforms.viewport) gl.uniform2f(uniforms.viewport, viewportWidth, viewportHeight);
    if (uniforms.opacityBase) gl.uniform1f(uniforms.opacityBase, this.edgeOpacityBase);
    if (uniforms.opacityScale) gl.uniform1f(uniforms.opacityScale, this.edgeOpacityScale);
    if (uniforms.widthBase) gl.uniform1f(uniforms.widthBase, edgeWidthBase);
    if (uniforms.widthScale) gl.uniform1f(uniforms.widthScale, edgeWidthScale);
    if (uniforms.nodeSizeBase) gl.uniform1f(uniforms.nodeSizeBase, this.nodeSizeBase);
    if (uniforms.nodeSizeScale) gl.uniform1f(uniforms.nodeSizeScale, this.nodeSizeScale);
    if (uniforms.endpointTrim) gl.uniform1f(uniforms.endpointTrim, this.edgeEndpointTrim);
    if (uniforms.hoverIndex) gl.uniform1ui(uniforms.hoverIndex, this.hoveredEdgeIndex >>> 0);
    if (uniforms.hoverState) gl.uniform1ui(uniforms.hoverState, this.hoveredEdgeState >>> 0);
    if (uniforms.nodeNoStateScale) gl.uniform4fv(uniforms.nodeNoStateScale, this.nodeNoStateScale);
    if (uniforms.nodeStateScale) gl.uniform4fv(uniforms.nodeStateScale, this.nodeStateScale);
    if (uniforms.noStateScale) gl.uniform4fv(uniforms.noStateScale, this.edgeNoStateScale);
    if (uniforms.noStateColorMul) gl.uniform4fv(uniforms.noStateColorMul, this.edgeNoStateColorMul);
    if (uniforms.noStateColorAdd) gl.uniform4fv(uniforms.noStateColorAdd, this.edgeNoStateColorAdd);
    if (uniforms.stateScale) gl.uniform4fv(uniforms.stateScale, this.edgeStateScale);
    if (uniforms.stateColorMul) gl.uniform4fv(uniforms.stateColorMul, this.edgeStateColorMul);
    if (uniforms.stateColorAdd) gl.uniform4fv(uniforms.stateColorAdd, this.edgeStateColorAdd);

    if (uniforms.edgeColorStart && edgeConfig?.color?.mode === 'uniform' && Array.isArray(edgeConfig?.color?.value)) {
      const pair = edgeConfig.color.value;
      const start = pair?.[0];
      const end = pair?.[1];
      if (Array.isArray(start)) gl.uniform4f(uniforms.edgeColorStart, start[0] ?? 0, start[1] ?? 0, start[2] ?? 0, start[3] ?? 1);
      if (Array.isArray(end)) gl.uniform4f(uniforms.edgeColorEnd, end[0] ?? 0, end[1] ?? 0, end[2] ?? 0, end[3] ?? 1);
    }
    if (uniforms.edgeWidth && edgeConfig?.width?.mode === 'uniform' && Array.isArray(edgeConfig?.width?.value)) {
      const pair = edgeConfig.width.value;
      gl.uniform2f(uniforms.edgeWidth, pair?.[0] ?? 0, pair?.[1] ?? 0);
    }
    if (uniforms.edgeOpacity && edgeConfig?.opacity?.mode === 'uniform' && Array.isArray(edgeConfig?.opacity?.value)) {
      const pair = edgeConfig.opacity.value;
      gl.uniform2f(uniforms.edgeOpacity, pair?.[0] ?? 1, pair?.[1] ?? 1);
    }
    if (uniforms.edgeEndpointSize && edgeConfig?.endpointSize?.mode === 'uniform' && Array.isArray(edgeConfig?.endpointSize?.value)) {
      const pair = edgeConfig.endpointSize.value;
      gl.uniform2f(uniforms.edgeEndpointSize, pair?.[0] ?? 1, pair?.[1] ?? 1);
    }
  }

  initialize(device, size) {
    if (device?.type !== 'webgl2') {
      throw new Error('GraphLayerWebGL requires a WebGL2 device.');
    }
    super.initialize(device, size);
    this.device = device;
    this.gl = device.gl;
    this.initializeWebGL2();
    this.resize(size);
  }

  resize(size) {
    super.resize(size);
    // Matrices are updated per-frame from the camera.
  }

  destroy() {
    const gl = this.gl;
    if (!gl) return;
    if (this.nodeVAO) gl.deleteVertexArray(this.nodeVAO);
    if (this.edgeVAO) gl.deleteVertexArray(this.edgeVAO);
    if (this.edgeQuadVAO) gl.deleteVertexArray(this.edgeQuadVAO);
    // Programs are owned by the device-level resource cache so they can be
    // reused across passes. Do not delete them here.
    this.nodeProgramCache.clear();
    this.edgeProgramCache.clear();
    this.edgeQuadProgramCache.clear();
    this.edgeWeightedProgramCache.clear();
    this.edgeWeightedQuadProgramCache.clear();
    this.edgeProgram = null;
    this.edgeQuadProgram = null;
    this.edgeWeightedProgram = null;
    this.edgeWeightedQuadProgram = null;
    this.edgeResolveProgram = null;
    this.edgeResolveTonemapProgram = null;
    this.edgeResolveBoostProgram = null;
    if (this.nodeQuadBuffer) gl.deleteBuffer(this.nodeQuadBuffer);
    if (this.edgeQuadBuffer) gl.deleteBuffer(this.edgeQuadBuffer);
    if (this.edgeResolveVAO) gl.deleteVertexArray(this.edgeResolveVAO);
    if (this.edgeResolveBuffer) gl.deleteBuffer(this.edgeResolveBuffer);
    // Dense buffers are owned by the device-level resource cache so they can be
    // reused across passes (e.g. attribute picking). Do not delete them here.
    if (this.weightedFramebuffer) gl.deleteFramebuffer(this.weightedFramebuffer);
    if (this.weightedColor) gl.deleteTexture(this.weightedColor);
    if (this.weightedWeight) gl.deleteTexture(this.weightedWeight);
    if (this.weightedDepth) gl.deleteRenderbuffer(this.weightedDepth);
  }

  setEdgeRenderingMode(mode) {
    super.setEdgeRenderingMode(mode);
  }

  initializeWebGL2() {
    const { gl } = this;
    const cache = this.device?.resourceCache?.webgl;
    this._shaderSources = createGraphWebGLSources(this.stateSlotCount);
    const {
      NODE_VERTEX_SOURCE,
      NODE_FRAGMENT_SOURCE,
      EDGE_VERTEX_SOURCE,
      EDGE_FRAGMENT_SOURCE,
      EDGE_QUAD_VERTEX_SOURCE,
      EDGE_QUAD_FRAGMENT_SOURCE,
      EDGE_WEIGHTED_FRAGMENT_SOURCE,
      EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE,
      EDGE_RESOLVE_VERTEX_SOURCE,
      EDGE_RESOLVE_FRAGMENT_SOURCE,
      EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE,
      EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE,
    } = this._shaderSources;
    const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    const extColorBufferHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
    const extFloatBlend = gl.getExtension('EXT_float_blend');
    const canDrawMultiple = (gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) ?? 1) >= 2;
    this.weightedSupported = Boolean(
      gl.drawBuffers &&
        canDrawMultiple &&
        (extColorBufferFloat || extColorBufferHalfFloat) &&
        extFloatBlend,
    );

    const defaultEdgeVariant = { color: true, width: true, opacity: true, endpointSize: true };
    const defaultEdgeEntry = this.getEdgeProgram('line', defaultEdgeVariant, false);
    const defaultEdgeQuadEntry = this.getEdgeProgram('quad', defaultEdgeVariant, false);
    this.edgeProgram = defaultEdgeEntry?.program ?? null;
    this.edgeQuadProgram = defaultEdgeQuadEntry?.program ?? null;

    // Prime node program cache with the default variant.
    this.nodeProgramCache.clear();
    this.getNodeProgram(false, { NODE_VERTEX_SOURCE, NODE_FRAGMENT_SOURCE });
    this.edgeUniformViewProjection = defaultEdgeEntry?.uniforms?.viewProjection ?? null;
    this.edgeUniformOpacityBase = defaultEdgeEntry?.uniforms?.opacityBase ?? null;
    this.edgeUniformOpacityScale = defaultEdgeEntry?.uniforms?.opacityScale ?? null;
    this.edgeUniformWidthBase = defaultEdgeEntry?.uniforms?.widthBase ?? null;
    this.edgeUniformWidthScale = defaultEdgeEntry?.uniforms?.widthScale ?? null;
    this.edgeUniformNodeSizeBase = defaultEdgeEntry?.uniforms?.nodeSizeBase ?? null;
    this.edgeUniformNodeSizeScale = defaultEdgeEntry?.uniforms?.nodeSizeScale ?? null;
    this.edgeUniformEndpointTrim = defaultEdgeEntry?.uniforms?.endpointTrim ?? null;
    this.edgeUniformHoverIndex = defaultEdgeEntry?.uniforms?.hoverIndex ?? null;
    this.edgeUniformHoverState = defaultEdgeEntry?.uniforms?.hoverState ?? null;
    this.edgeUniformNodeNoStateScale = defaultEdgeEntry?.uniforms?.nodeNoStateScale ?? null;
    this.edgeUniformNodeStateScale = defaultEdgeEntry?.uniforms?.nodeStateScale ?? null;
    this.edgeUniformNoStateScale = defaultEdgeEntry?.uniforms?.noStateScale ?? null;
    this.edgeUniformNoStateColorMul = defaultEdgeEntry?.uniforms?.noStateColorMul ?? null;
    this.edgeUniformNoStateColorAdd = defaultEdgeEntry?.uniforms?.noStateColorAdd ?? null;
    this.edgeUniformStateScale = defaultEdgeEntry?.uniforms?.stateScale ?? null;
    this.edgeUniformStateColorMul = defaultEdgeEntry?.uniforms?.stateColorMul ?? null;
    this.edgeUniformStateColorAdd = defaultEdgeEntry?.uniforms?.stateColorAdd ?? null;
    this.edgeQuadUniformViewProjection = defaultEdgeQuadEntry?.uniforms?.viewProjection ?? null;
    this.edgeQuadUniformViewport = defaultEdgeQuadEntry?.uniforms?.viewport ?? null;
    this.edgeQuadUniformOpacityBase = defaultEdgeQuadEntry?.uniforms?.opacityBase ?? null;
    this.edgeQuadUniformOpacityScale = defaultEdgeQuadEntry?.uniforms?.opacityScale ?? null;
    this.edgeQuadUniformWidthBase = defaultEdgeQuadEntry?.uniforms?.widthBase ?? null;
    this.edgeQuadUniformWidthScale = defaultEdgeQuadEntry?.uniforms?.widthScale ?? null;
    this.edgeQuadUniformNodeSizeBase = defaultEdgeQuadEntry?.uniforms?.nodeSizeBase ?? null;
    this.edgeQuadUniformNodeSizeScale = defaultEdgeQuadEntry?.uniforms?.nodeSizeScale ?? null;
    this.edgeQuadUniformEndpointTrim = defaultEdgeQuadEntry?.uniforms?.endpointTrim ?? null;
    this.edgeQuadUniformHoverIndex = defaultEdgeQuadEntry?.uniforms?.hoverIndex ?? null;
    this.edgeQuadUniformHoverState = defaultEdgeQuadEntry?.uniforms?.hoverState ?? null;
    this.edgeQuadUniformNodeNoStateScale = defaultEdgeQuadEntry?.uniforms?.nodeNoStateScale ?? null;
    this.edgeQuadUniformNodeStateScale = defaultEdgeQuadEntry?.uniforms?.nodeStateScale ?? null;
    this.edgeQuadUniformNoStateScale = defaultEdgeQuadEntry?.uniforms?.noStateScale ?? null;
    this.edgeQuadUniformNoStateColorMul = defaultEdgeQuadEntry?.uniforms?.noStateColorMul ?? null;
    this.edgeQuadUniformNoStateColorAdd = defaultEdgeQuadEntry?.uniforms?.noStateColorAdd ?? null;
    this.edgeQuadUniformStateScale = defaultEdgeQuadEntry?.uniforms?.stateScale ?? null;
    this.edgeQuadUniformStateColorMul = defaultEdgeQuadEntry?.uniforms?.stateColorMul ?? null;
    this.edgeQuadUniformStateColorAdd = defaultEdgeQuadEntry?.uniforms?.stateColorAdd ?? null;

    this.nodeQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.nodeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.nodeBuffers.positions = cache?.ensureBuffer(gl, 'dense:node:positions') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    this.nodeBuffers.colors = cache?.ensureBuffer(gl, 'dense:node:colors') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.colors);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    this.nodeBuffers.sizes = cache?.ensureBuffer(gl, 'dense:node:sizes') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    this.nodeBuffers.states = cache?.ensureBuffer(gl, 'dense:node:states') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.states);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribIPointer(4, 1, gl.UNSIGNED_INT, 0, 0);
    gl.vertexAttribDivisor(4, 1);

    this.nodeBuffers.outlineWidths = cache?.ensureBuffer(gl, 'dense:node:outlineWidths') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.outlineWidths);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(5, 1);

    this.nodeBuffers.outlineColors = cache?.ensureBuffer(gl, 'dense:node:outlineColors') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.outlineColors);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(6, 1);
    gl.bindVertexArray(null);

    this.edgeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeVAO);
    this.edgeBuffers.segments = cache?.ensureBuffer(gl, 'dense:edge:segments') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(0, 1);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(1, 1);

    this.edgeBuffers.colors = cache?.ensureBuffer(gl, 'dense:edge:colors') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(3, 1);
    this.edgeBuffers.widths = cache?.ensureBuffer(gl, 'dense:edge:widths') ?? (this.edgeBuffers.widths || gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(4, 1);
    this.edgeBuffers.endpointSizes = cache?.ensureBuffer(gl, 'dense:edge:endpointSizes') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(5, 1);
    this.edgeBuffers.opacities = cache?.ensureBuffer(gl, 'dense:edge:opacities') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.opacities);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(6, 1);

    this.edgeBuffers.states = cache?.ensureBuffer(gl, 'dense:edge:states') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.states);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribIPointer(7, 1, gl.UNSIGNED_INT, 0, 0);
    gl.vertexAttribDivisor(7, 1);

    this.edgeBuffers.endpointStates = cache?.ensureBuffer(gl, 'dense:edge:endpointStates') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointStates);
    gl.enableVertexAttribArray(8);
    gl.vertexAttribIPointer(8, 2, gl.UNSIGNED_INT, 0, 0);
    gl.vertexAttribDivisor(8, 1);
    gl.bindVertexArray(null);

    this.edgeQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeQuadBuffer);
    const edgeQuad = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, edgeQuad, gl.STATIC_DRAW);

    this.edgeResolveBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeResolveBuffer);
    const resolveQuad = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, resolveQuad, gl.STATIC_DRAW);

    this.edgeResolveVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeResolveVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeResolveBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    this.edgeQuadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeQuadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(2, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(5, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(6, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.opacities);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(7, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.states);
    gl.enableVertexAttribArray(8);
    gl.vertexAttribIPointer(8, 1, gl.UNSIGNED_INT, 0, 0);
    gl.vertexAttribDivisor(8, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointStates);
    gl.enableVertexAttribArray(9);
    gl.vertexAttribIPointer(9, 2, gl.UNSIGNED_INT, 0, 0);
    gl.vertexAttribDivisor(9, 1);
    gl.bindVertexArray(null);
  }

  getNodeProgram(useOutlineAttributesOrVariant, fallbackSources = null, visualConfig = null) {
    const variant = this.resolveNodeVariant(useOutlineAttributesOrVariant, visualConfig);
    const key = `node|${variant.color ? 'cA' : 'cU'}|${variant.size ? 'sA' : 'sU'}|${variant.outline ? 'oA' : 'oU'}|${variant.outlineColor ? 'ocA' : 'ocU'}`;
    const gl = this.gl;
    if (!gl || !this.device) return null;

    const sharedCache = this.device?.resourceCache?.webgl;
    const sharedKey = `graph:webgl:${this.stateSlotCount}:${key}`;
    if (sharedCache && !fallbackSources) {
      return sharedCache.getOrCreateProgram(sharedKey, () => {
        const sources = createGraphWebGLSources(this.stateSlotCount, {
          node: {
            color: variant.color ? 'attribute' : 'uniform',
            size: variant.size ? 'attribute' : 'uniform',
            outline: variant.outline ? 'attribute' : 'uniform',
            outlineColor: variant.outlineColor ? 'attribute' : 'uniform',
          },
        });
        const program = this.device.createProgram(sources.NODE_VERTEX_SOURCE, sources.NODE_FRAGMENT_SOURCE);
        const uniforms = {
          viewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
          view: gl.getUniformLocation(program, 'u_view'),
          cameraPosition: gl.getUniformLocation(program, 'u_cameraPosition'),
          cameraUp: gl.getUniformLocation(program, 'u_cameraUp'),
          cameraRight: gl.getUniformLocation(program, 'u_cameraRight'),
          is2D: gl.getUniformLocation(program, 'u_is2D'),
          opacityBase: gl.getUniformLocation(program, 'u_nodeOpacityBase'),
          opacityScale: gl.getUniformLocation(program, 'u_nodeOpacityScale'),
          sizeBase: gl.getUniformLocation(program, 'u_nodeSizeBase'),
          sizeScale: gl.getUniformLocation(program, 'u_nodeSizeScale'),
          outlineWidthBase: gl.getUniformLocation(program, 'u_outlineWidthBase'),
          outlineWidthScale: gl.getUniformLocation(program, 'u_outlineWidthScale'),
          outlineColor: gl.getUniformLocation(program, 'u_outlineColor'),
          nodeColor: gl.getUniformLocation(program, 'u_nodeColor'),
          nodeSize: gl.getUniformLocation(program, 'u_nodeSize'),
          nodeOutline: gl.getUniformLocation(program, 'u_nodeOutline'),
          hoverIndex: gl.getUniformLocation(program, 'u_hoverNodeIndex'),
          hoverState: gl.getUniformLocation(program, 'u_hoverNodeState'),
          noStateScale: gl.getUniformLocation(program, 'u_nodeNoStateScale'),
          noStateColorMul: gl.getUniformLocation(program, 'u_nodeNoStateColorMul'),
          noStateColorAdd: gl.getUniformLocation(program, 'u_nodeNoStateColorAdd'),
          stateScale: gl.getUniformLocation(program, 'u_nodeStateScale[0]'),
          stateColorMul: gl.getUniformLocation(program, 'u_nodeStateColorMul[0]'),
          stateColorAdd: gl.getUniformLocation(program, 'u_nodeStateColorAdd[0]'),
        };
        return { key, program, uniforms, variant };
      });
    }

    if (this.nodeProgramCache.has(key)) return this.nodeProgramCache.get(key);

    let sources = fallbackSources;
    if (!sources) {
      sources = createGraphWebGLSources(this.stateSlotCount, {
        node: {
          color: variant.color ? 'attribute' : 'uniform',
          size: variant.size ? 'attribute' : 'uniform',
          outline: variant.outline ? 'attribute' : 'uniform',
          outlineColor: variant.outlineColor ? 'attribute' : 'uniform',
        },
      });
    }
    const program = this.device.createProgram(sources.NODE_VERTEX_SOURCE, sources.NODE_FRAGMENT_SOURCE);
    const uniforms = {
      viewProjection: gl.getUniformLocation(program, 'u_viewProjection'),
      view: gl.getUniformLocation(program, 'u_view'),
      cameraPosition: gl.getUniformLocation(program, 'u_cameraPosition'),
      cameraUp: gl.getUniformLocation(program, 'u_cameraUp'),
      cameraRight: gl.getUniformLocation(program, 'u_cameraRight'),
      is2D: gl.getUniformLocation(program, 'u_is2D'),
      opacityBase: gl.getUniformLocation(program, 'u_nodeOpacityBase'),
      opacityScale: gl.getUniformLocation(program, 'u_nodeOpacityScale'),
      sizeBase: gl.getUniformLocation(program, 'u_nodeSizeBase'),
      sizeScale: gl.getUniformLocation(program, 'u_nodeSizeScale'),
      outlineWidthBase: gl.getUniformLocation(program, 'u_outlineWidthBase'),
      outlineWidthScale: gl.getUniformLocation(program, 'u_outlineWidthScale'),
      outlineColor: gl.getUniformLocation(program, 'u_outlineColor'),
      nodeColor: gl.getUniformLocation(program, 'u_nodeColor'),
      nodeSize: gl.getUniformLocation(program, 'u_nodeSize'),
      nodeOutline: gl.getUniformLocation(program, 'u_nodeOutline'),
      hoverIndex: gl.getUniformLocation(program, 'u_hoverNodeIndex'),
      hoverState: gl.getUniformLocation(program, 'u_hoverNodeState'),
      noStateScale: gl.getUniformLocation(program, 'u_nodeNoStateScale'),
      noStateColorMul: gl.getUniformLocation(program, 'u_nodeNoStateColorMul'),
      noStateColorAdd: gl.getUniformLocation(program, 'u_nodeNoStateColorAdd'),
      stateScale: gl.getUniformLocation(program, 'u_nodeStateScale[0]'),
      stateColorMul: gl.getUniformLocation(program, 'u_nodeStateColorMul[0]'),
      stateColorAdd: gl.getUniformLocation(program, 'u_nodeStateColorAdd[0]'),
    };
    const entry = { key, program, uniforms, variant };
    this.nodeProgramCache.set(key, entry);
    return entry;
  }

  setNodeUniforms(gl, uniforms, cameraUniforms, is2D, nodeConfig = null) {
    if (!gl || !uniforms || !cameraUniforms) return;
    if (uniforms.viewProjection) gl.uniformMatrix4fv(uniforms.viewProjection, false, cameraUniforms.viewProjection);
    if (uniforms.view) gl.uniformMatrix4fv(uniforms.view, false, cameraUniforms.view);
    if (uniforms.cameraPosition) gl.uniform3fv(uniforms.cameraPosition, cameraUniforms.position);
    if (uniforms.cameraUp) gl.uniform3fv(uniforms.cameraUp, cameraUniforms.up);
    if (uniforms.cameraRight) gl.uniform3fv(uniforms.cameraRight, cameraUniforms.right);
    if (uniforms.is2D) gl.uniform1i(uniforms.is2D, is2D ? 1 : 0);
    if (uniforms.opacityBase) gl.uniform1f(uniforms.opacityBase, this.nodeOpacityBase);
    if (uniforms.opacityScale) gl.uniform1f(uniforms.opacityScale, this.nodeOpacityScale);
    if (uniforms.sizeBase) gl.uniform1f(uniforms.sizeBase, this.nodeSizeBase);
    if (uniforms.sizeScale) gl.uniform1f(uniforms.sizeScale, this.nodeSizeScale);
    if (uniforms.outlineWidthBase) gl.uniform1f(uniforms.outlineWidthBase, this.nodeOutlineWidthBase);
    if (uniforms.outlineWidthScale) gl.uniform1f(uniforms.outlineWidthScale, this.nodeOutlineWidthScale);
    if (uniforms.nodeColor && nodeConfig?.color?.mode === 'uniform' && Array.isArray(nodeConfig?.color?.value)) {
      gl.uniform4f(
        uniforms.nodeColor,
        nodeConfig.color.value[0] ?? 0,
        nodeConfig.color.value[1] ?? 0,
        nodeConfig.color.value[2] ?? 0,
        nodeConfig.color.value[3] ?? 1,
      );
    }
    if (uniforms.nodeSize && nodeConfig?.size?.mode === 'uniform' && Number.isFinite(nodeConfig?.size?.value)) {
      gl.uniform1f(uniforms.nodeSize, nodeConfig.size.value);
    }
    if (uniforms.nodeOutline && nodeConfig?.outline?.mode === 'uniform' && Number.isFinite(nodeConfig?.outline?.value)) {
      gl.uniform1f(uniforms.nodeOutline, nodeConfig.outline.value);
    }

    const outlineColor = (nodeConfig?.outlineColor?.mode === 'uniform' && Array.isArray(nodeConfig?.outlineColor?.value))
      ? nodeConfig.outlineColor.value
      : this.nodeOutlineColor;
    if (uniforms.outlineColor) {
      gl.uniform4f(
        uniforms.outlineColor,
        outlineColor?.[0] ?? 0,
        outlineColor?.[1] ?? 0,
        outlineColor?.[2] ?? 0,
        outlineColor?.[3] ?? 1,
      );
    }
    if (uniforms.hoverIndex) gl.uniform1ui(uniforms.hoverIndex, this.hoveredNodeIndex >>> 0);
    if (uniforms.hoverState) gl.uniform1ui(uniforms.hoverState, this.hoveredNodeState >>> 0);
    if (uniforms.stateScale) gl.uniform4fv(uniforms.stateScale, this.nodeStateScale);
    if (uniforms.stateColorMul) gl.uniform4fv(uniforms.stateColorMul, this.nodeStateColorMul);
    if (uniforms.stateColorAdd) gl.uniform4fv(uniforms.stateColorAdd, this.nodeStateColorAdd);
    if (uniforms.noStateScale) gl.uniform4fv(uniforms.noStateScale, this.nodeNoStateScale);
    if (uniforms.noStateColorMul) gl.uniform4fv(uniforms.noStateColorMul, this.nodeNoStateColorMul);
    if (uniforms.noStateColorAdd) gl.uniform4fv(uniforms.noStateColorAdd, this.nodeNoStateColorAdd);
  }

  render(context, frame) {
    if (!context || context.type !== 'webgl2') return;
    const network = frame?.network;
    if (!network) return;
    const { camera } = frame ?? {};
    const overrides = frame?.positionOverrides ?? null;
    const gl = context.gl;
    const cameraUniforms = this.getCameraUniforms(camera);
    if (!cameraUniforms) return;

    const schema = GraphVisualSchema.fromNetwork(network, {
      nodeOutlineUseAttributes: this.nodeOutlineUseAttributes === true,
    });
    const visualConfig = schema.visualConfig;
    const { requests, nodeVariant: schemaNodeVariant } = schema.getDenseRequests();
    const nodeVariant = this.resolveNodeVariant({
      color: schemaNodeVariant.colorBuffer,
      size: schemaNodeVariant.sizeBuffer,
      outline: schemaNodeVariant.outlineWidthBuffer,
      outlineColor: schemaNodeVariant.outlineColorBuffer,
    }, visualConfig);
    const edgeVariant = this.resolveEdgeVariant(visualConfig);
    const edgeCfg = visualConfig?.edge ?? null;

    let renderedWeighted = false;
    const passes = [];
    const geometryCounts = { nodes: { count: 0 }, edges: { count: 0 } };
    {
      const is2D = cameraUniforms.mode === '2d';
      const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
      const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
      const globalEdgeWidthBase = this.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
      const globalEdgeWidthScale = this.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
      const viewport = context.viewport;
      const viewportWidth = viewport ? viewport[2] : (gl.drawingBufferWidth || this.size?.width || 1);
      const viewportHeight = viewport ? viewport[3] : (gl.drawingBufferHeight || this.size?.height || 1);
      const transparencyMode = this.edgeTransparencyMode;
      const nodeBlendWithEdges = this.nodeBlendWithEdges === true;
      const edgeDepthWrite = this.edgeDepthWrite === true;

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.depthFunc(gl.LEQUAL);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      if (is2D) {
        gl.disable(gl.DEPTH_TEST);
        gl.depthMask(false);
      } else {
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
      }
      const ok = this.withDenseGraph(network, (geometry) => {
        if (!geometry) return false;
        geometryCounts.nodes.count = geometry.nodes.count ?? 0;
        geometryCounts.edges.count = geometry.edges.count ?? 0;
        if (geometryCounts.edges.count) {
          this.uploadEdgesWebGL2(geometry.edges, visualConfig);
        } else {
          this.edgeCount = 0;
          this._edgeVersionsLast = null;
        }
        if (geometryCounts.nodes.count) {
          this.uploadNodesWebGL2(geometry.nodes, nodeVariant);
        } else {
          this.nodeCount = 0;
          this._nodeVersionsLast = null;
        }
        return true;
      }, requests, overrides);
      if (!ok) return;

      const drawNodes = () => {
        if (!this.nodeCount) return;
        const nodeEntry = this.getNodeProgram(nodeVariant, null, visualConfig);
        if (!nodeEntry?.program) return;
        gl.useProgram(nodeEntry.program);
        this.setNodeUniforms(gl, nodeEntry.uniforms, cameraUniforms, is2D, visualConfig?.node ?? null);
        gl.bindVertexArray(this.nodeVAO);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);
      };

      const premultiplyEdgeAlpha = transparencyMode === 'screen';

      const drawEdges = () => {
        if (!this.edgeCount) return;
        if (is2D) {
          gl.disable(gl.DEPTH_TEST);
          gl.depthMask(false);
        } else {
          gl.enable(gl.DEPTH_TEST);
          gl.depthMask(edgeDepthWrite);
          gl.depthFunc(gl.LEQUAL);
        }
        const useQuads = this.edgeRenderingMode === 'quad';
        const kind = useQuads ? 'quad' : 'line';
        const edgeEntry = this.getEdgeProgram(kind, edgeVariant, false, premultiplyEdgeAlpha);
        if (!edgeEntry?.program) return;
        gl.useProgram(edgeEntry.program);
        this.setEdgeUniforms(
          gl,
          edgeEntry.uniforms,
          cameraUniforms,
          viewportWidth,
          viewportHeight,
          globalEdgeWidthBase,
          globalEdgeWidthScale,
          edgeCfg,
        );
        gl.bindVertexArray(useQuads ? this.edgeQuadVAO : this.edgeVAO);
        gl.drawArraysInstanced(useQuads ? gl.TRIANGLE_STRIP : gl.LINES, 0, useQuads ? 4 : 2, this.edgeCount);
      };

      const applyNodeBlend = () => {
        if (nodeBlendWithEdges) {
          this.applyEdgeBlend(gl, transparencyMode);
        } else {
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
      };

      const setupNodeDepth = () => {
        if (nodeBlendWithEdges || is2D) {
          gl.disable(gl.DEPTH_TEST);
          gl.depthMask(false);
        } else {
          gl.enable(gl.DEPTH_TEST);
          gl.depthMask(true);
          gl.depthFunc(gl.LEQUAL);
        }
      };

      const weightedRequested = transparencyMode === 'weighted' || transparencyMode === 'additive-normalized' || transparencyMode === 'additive-tonemapped' || transparencyMode === 'additive-normalized-bright';
      const weightedReady = weightedRequested && geometryCounts.edges.count > 0
        ? this.prepareWeightedWebGL(viewportWidth, viewportHeight)
        : false;

      if (weightedReady) {
        if (!this.loggedWeightedActive) {
          console.info(`GraphLayerWebGL: using weighted multipass for '${transparencyMode}'`);
          this.loggedWeightedActive = true;
        }
        passes.push(() => this.renderWeightedWebGL(context, {
          geometry: geometryCounts,
          is2D,
          cameraUniforms,
          edgeWidthBase: globalEdgeWidthBase,
          edgeWidthScale: globalEdgeWidthScale,
          viewport,
          visualConfig,
          nodeVariant,
          edgeVariant,
        }));
        renderedWeighted = true;
      }
      if (!weightedReady) {
        if (weightedRequested && geometry.edges.count && !this.warnedWeightedFallback) {
          console.warn('Weighted edge transparency is not available in WebGL2; falling back to alpha.');
          this.warnedWeightedFallback = true;
        }

        // Always render nodes with standard alpha blending.
        gl.enable(gl.BLEND);

        if (is2D) {
          passes.push(() => {
            this.applyEdgeBlend(gl, transparencyMode);
            drawEdges();
            applyNodeBlend();
            setupNodeDepth();
            drawNodes();
            gl.bindVertexArray(null);
            gl.depthMask(true);
            gl.depthFunc(gl.LEQUAL);
            gl.enable(gl.DEPTH_TEST);
          });
        } else {
          passes.push(() => {
            applyNodeBlend();
            setupNodeDepth();
            drawNodes();
            this.applyEdgeBlend(gl, transparencyMode);
            drawEdges();
            gl.bindVertexArray(null);
            gl.depthMask(true);
            gl.depthFunc(gl.LEQUAL);
            gl.enable(gl.DEPTH_TEST);
          });
        }
      }
    }

    if (renderedWeighted) {
      this.frameGraph.run(passes, context);
      return;
    }

    this.frameGraph.run(passes, context);
  }

  applyEdgeBlend(gl, mode) {
    switch (mode) {
      case 'additive':
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        break;
      case 'screen':
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        break;
      case 'max':
        gl.blendEquation(gl.MAX);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        break;
      default:
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        break;
    }
  }

  uploadNodesWebGL2(nodes, variant) {
    const count = nodes?.count ?? 0;
    const versions = nodes?.versions ?? {};

    const v = variant && typeof variant === 'object'
      ? variant
      : { color: true, size: true, outline: this.nodeOutlineUseAttributes === true, outlineColor: this.nodeOutlineUseAttributes === true };

    const needsColor = v.color === true;
    const needsSize = v.size === true;
    const needsOutlineWidth = v.outline === true;
    const needsOutlineColor = v.outlineColor === true;

    if (!nodes || !nodes.positions || !nodes.states) {
      this.nodeCount = 0;
      return;
    }

    if ((needsColor && !nodes.colors) || (needsSize && !nodes.sizes)) {
      this.nodeCount = 0;
      return;
    }
    if ((needsOutlineWidth && !nodes.outlineWidths) || (needsOutlineColor && !nodes.outlineColors)) {
      this.nodeCount = 0;
      return;
    }

    const variantKey = `c${needsColor ? 'A' : 'U'}|s${needsSize ? 'A' : 'U'}|o${needsOutlineWidth ? 'A' : 'U'}|oc${needsOutlineColor ? 'A' : 'U'}`;
    const variantChanged = this._nodeProgramKeyLast !== variantKey;
    const viewsChanged = (
      this._nodeViewsLast?.positions !== nodes.positions
      || this._nodeViewsLast?.states !== nodes.states
      || (needsColor && this._nodeViewsLast?.colors !== nodes.colors)
      || (needsSize && this._nodeViewsLast?.sizes !== nodes.sizes)
      || (needsOutlineWidth && this._nodeViewsLast?.outlineWidths !== nodes.outlineWidths)
      || (needsOutlineColor && this._nodeViewsLast?.outlineColors !== nodes.outlineColors)
    );
    const versionChanged = (
      this._nodeVersionsLast?.positions !== (versions.positions ?? 0)
      || (needsColor && this._nodeVersionsLast?.colors !== (versions.colors ?? 0))
      || (needsSize && this._nodeVersionsLast?.sizes !== (versions.sizes ?? 0))
      || this._nodeVersionsLast?.states !== (versions.states ?? 0)
      || (needsOutlineWidth && this._nodeVersionsLast?.outlineWidths !== (versions.outlineWidths ?? 0))
      || (needsOutlineColor && this._nodeVersionsLast?.outlineColors !== (versions.outlineColors ?? 0))
      || this._nodeVersionsLast?.topology !== (versions.topology ?? 0)
      || this.nodeCount !== count
      || variantChanged
    );
    this.nodeCount = count;
    if (!count) return;
    if (!versionChanged && !viewsChanged) return;

    const { gl } = this;
    const cache = this.device?.resourceCache?.webgl;
    gl.bindVertexArray(this.nodeVAO);
    cache?.uploadArrayBuffer(gl, 'dense:node:positions', nodes.positions, {
      version: versions.positions ?? 0,
      topologyVersion: versions.topology ?? 0,
      count,
      trackViewIdentity: true,
    });

    if (needsColor) {
      cache?.uploadArrayBuffer(gl, 'dense:node:colors', nodes.colors, {
        version: versions.colors ?? 0,
        topologyVersion: versions.topology ?? 0,
        count,
        trackViewIdentity: true,
      });
    }

    if (needsSize) {
      cache?.uploadArrayBuffer(gl, 'dense:node:sizes', nodes.sizes, {
        version: versions.sizes ?? 0,
        topologyVersion: versions.topology ?? 0,
        count,
        trackViewIdentity: true,
      });
    }

    cache?.uploadArrayBuffer(gl, 'dense:node:states', nodes.states, {
      version: versions.states ?? 0,
      topologyVersion: versions.topology ?? 0,
      count,
      trackViewIdentity: true,
    });

    if (needsOutlineWidth) {
      cache?.uploadArrayBuffer(gl, 'dense:node:outlineWidths', nodes.outlineWidths, {
        version: versions.outlineWidths ?? 0,
        topologyVersion: versions.topology ?? 0,
        count,
        trackViewIdentity: true,
      });
    }

    if (needsOutlineColor) {
      cache?.uploadArrayBuffer(gl, 'dense:node:outlineColors', nodes.outlineColors, {
        version: versions.outlineColors ?? 0,
        topologyVersion: versions.topology ?? 0,
        count,
        trackViewIdentity: true,
      });
    }
    gl.bindVertexArray(null);

    this._nodeVersionsLast = {
      positions: versions.positions ?? 0,
      colors: versions.colors ?? 0,
      sizes: versions.sizes ?? 0,
      states: versions.states ?? 0,
      outlineWidths: versions.outlineWidths ?? 0,
      outlineColors: versions.outlineColors ?? 0,
      topology: versions.topology ?? 0,
    };

    this._nodeViewsLast = {
      positions: nodes.positions,
      colors: nodes.colors,
      sizes: nodes.sizes,
      states: nodes.states,
      outlineWidths: nodes.outlineWidths,
      outlineColors: nodes.outlineColors,
    };

    this._nodeProgramKeyLast = variantKey;
  }

  uploadEdgesWebGL2(edges, visualConfig) {
    const count = edges?.count ?? 0;
    const versions = edges?.versions ?? {};

    const edgeCfg = visualConfig?.edge;
    const needsColor = edgeCfg?.color?.mode !== 'uniform';
    const needsWidth = edgeCfg?.width?.mode !== 'uniform';
    const needsOpacity = edgeCfg?.opacity?.mode !== 'uniform';
    const needsEndpointSize = edgeCfg?.endpointSize?.mode !== 'uniform';

    if (!edges || !edges.segments || !edges.states || !edges.endpointStates) {
      this.edgeCount = 0;
      return;
    }
    if ((needsColor && !edges.colors) || (needsWidth && !edges.widths) || (needsOpacity && !edges.opacities) || (needsEndpointSize && !edges.endpointSizes)) {
      this.edgeCount = 0;
      return;
    }

    const variantKey = `c${needsColor ? 'A' : 'U'}|w${needsWidth ? 'A' : 'U'}|o${needsOpacity ? 'A' : 'U'}|es${needsEndpointSize ? 'A' : 'U'}`;
    const variantChanged = this._edgeProgramKeyLast !== variantKey;
    const viewsChanged = (
      this._edgeViewsLast?.segments !== edges.segments
      || this._edgeViewsLast?.states !== edges.states
      || this._edgeViewsLast?.endpointStates !== edges.endpointStates
      || (needsColor && this._edgeViewsLast?.colors !== edges.colors)
      || (needsOpacity && this._edgeViewsLast?.opacities !== edges.opacities)
      || (needsWidth && this._edgeViewsLast?.widths !== edges.widths)
      || (needsEndpointSize && this._edgeViewsLast?.endpointSizes !== edges.endpointSizes)
    );
    const versionChanged = (
      this._edgeVersionsLast?.segments !== (versions.segments ?? 0)
      || (needsColor && this._edgeVersionsLast?.colors !== (versions.colors ?? 0))
      || (needsOpacity && this._edgeVersionsLast?.opacities !== (versions.opacities ?? 0))
      || (needsWidth && this._edgeVersionsLast?.widths !== (versions.widths ?? 0))
      || (needsEndpointSize && this._edgeVersionsLast?.endpointSizes !== (versions.endpointSizes ?? 0))
      || this._edgeVersionsLast?.states !== (versions.states ?? 0)
      || this._edgeVersionsLast?.endpointStates !== (versions.endpointStates ?? 0)
      || this._edgeVersionsLast?.topology !== (versions.topology ?? 0)
      || this.edgeCount !== count
      || variantChanged
    );
    this.edgeCount = count;
    if (!count) return;
    if (!versionChanged && !viewsChanged) return;

    const { gl } = this;
    const cache = this.device?.resourceCache?.webgl;
    gl.bindVertexArray(this.edgeVAO);
    cache?.uploadArrayBuffer(gl, 'dense:edge:segments', edges.segments, {
      version: versions.segments ?? 0,
      topologyVersion: versions.topology ?? 0,
      count,
      trackViewIdentity: true,
    });

    if (needsColor) {
      cache?.uploadArrayBuffer(gl, 'dense:edge:colors', edges.colors, {
        version: versions.colors ?? 0,
        topologyVersion: versions.topology ?? 0,
        count,
        trackViewIdentity: true,
      });
    }
    gl.bindVertexArray(null);

    if (needsOpacity) {
      cache?.uploadArrayBuffer(gl, 'dense:edge:opacities', edges.opacities, {
        version: versions.opacities ?? 0,
        topologyVersion: versions.topology ?? 0,
        count,
        trackViewIdentity: true,
      });
    }

    if (needsWidth) {
      cache?.uploadArrayBuffer(gl, 'dense:edge:widths', edges.widths, {
        version: versions.widths ?? 0,
        topologyVersion: versions.topology ?? 0,
        count,
        trackViewIdentity: true,
      });
    }

    if (needsEndpointSize) {
      cache?.uploadArrayBuffer(gl, 'dense:edge:endpointSizes', edges.endpointSizes, {
        version: versions.endpointSizes ?? 0,
        topologyVersion: versions.topology ?? 0,
        count,
        trackViewIdentity: true,
      });
    }

    cache?.uploadArrayBuffer(gl, 'dense:edge:states', edges.states, {
      version: versions.states ?? 0,
      topologyVersion: versions.topology ?? 0,
      count,
      trackViewIdentity: true,
    });

    cache?.uploadArrayBuffer(gl, 'dense:edge:endpointStates', edges.endpointStates, {
      version: versions.endpointStates ?? 0,
      topologyVersion: versions.topology ?? 0,
      count,
      trackViewIdentity: true,
    });

    this._edgeVersionsLast = {
      segments: versions.segments ?? 0,
      colors: versions.colors ?? 0,
      opacities: versions.opacities ?? 0,
      widths: versions.widths ?? 0,
      endpointSizes: versions.endpointSizes ?? 0,
      states: versions.states ?? 0,
      endpointStates: versions.endpointStates ?? 0,
      topology: versions.topology ?? 0,
    };

    this._edgeViewsLast = {
      segments: edges.segments,
      colors: edges.colors,
      opacities: edges.opacities,
      widths: edges.widths,
      endpointSizes: edges.endpointSizes,
      states: edges.states,
      endpointStates: edges.endpointStates,
    };

    this._edgeProgramKeyLast = variantKey;
  }

  ensureWeightedPrograms() {
    const gl = this.gl;
    if (!gl || !this.weightedSupported) return false;
    if (!this._shaderSources) {
      this._shaderSources = createGraphWebGLSources(this.stateSlotCount);
    }
    const {
      EDGE_VERTEX_SOURCE,
      EDGE_QUAD_VERTEX_SOURCE,
      EDGE_WEIGHTED_FRAGMENT_SOURCE,
      EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE,
      EDGE_RESOLVE_VERTEX_SOURCE,
      EDGE_RESOLVE_FRAGMENT_SOURCE,
      EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE,
      EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE,
    } = this._shaderSources;
    const sharedCache = this.device?.resourceCache?.webgl;
    const getSharedProgram = (cacheKey, vert, frag) => {
      if (!sharedCache) return { program: this.device.createProgram(vert, frag) };
      return sharedCache.getOrCreateProgram(`graph:webgl:${this.stateSlotCount}:program:${cacheKey}`, () => ({
        program: this.device.createProgram(vert, frag),
      }));
    };

    if (!this.edgeWeightedProgram) {
      this.edgeWeightedProgram = getSharedProgram('edgeWeighted', EDGE_VERTEX_SOURCE, EDGE_WEIGHTED_FRAGMENT_SOURCE).program;
      this.edgeWeightedUniformViewProjection = gl.getUniformLocation(this.edgeWeightedProgram, 'u_viewProjection');
      this.edgeWeightedUniformOpacityBase = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeOpacityBase');
      this.edgeWeightedUniformOpacityScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeOpacityScale');
      this.edgeWeightedUniformWidthBase = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeWidthBase');
      this.edgeWeightedUniformWidthScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeWidthScale');
      this.edgeWeightedUniformNodeSizeBase = gl.getUniformLocation(this.edgeWeightedProgram, 'u_nodeSizeBase');
      this.edgeWeightedUniformNodeSizeScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_nodeSizeScale');
      this.edgeWeightedUniformEndpointTrim = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeEndpointTrim');
      this.edgeWeightedUniformHoverIndex = gl.getUniformLocation(this.edgeWeightedProgram, 'u_hoverEdgeIndex');
      this.edgeWeightedUniformHoverState = gl.getUniformLocation(this.edgeWeightedProgram, 'u_hoverEdgeState');
      this.edgeWeightedUniformNodeNoStateScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_nodeNoStateScale');
      this.edgeWeightedUniformNodeStateScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_nodeStateScale[0]');
      this.edgeWeightedUniformNoStateScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeNoStateScale');
      this.edgeWeightedUniformNoStateColorMul = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeNoStateColorMul');
      this.edgeWeightedUniformNoStateColorAdd = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeNoStateColorAdd');
      this.edgeWeightedUniformStateScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeStateScale[0]');
      this.edgeWeightedUniformStateColorMul = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeStateColorMul[0]');
      this.edgeWeightedUniformStateColorAdd = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeStateColorAdd[0]');
    }

    if (!this.edgeWeightedQuadProgram) {
      this.edgeWeightedQuadProgram = getSharedProgram(
        'edgeWeightedQuad',
        EDGE_QUAD_VERTEX_SOURCE,
        EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE,
      ).program;
      this.edgeWeightedQuadUniformViewProjection = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_viewProjection');
      this.edgeWeightedQuadUniformViewport = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_viewport');
      this.edgeWeightedQuadUniformOpacityBase = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeOpacityBase');
      this.edgeWeightedQuadUniformOpacityScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeOpacityScale');
      this.edgeWeightedQuadUniformWidthBase = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeWidthBase');
      this.edgeWeightedQuadUniformWidthScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeWidthScale');
      this.edgeWeightedQuadUniformNodeSizeBase = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_nodeSizeBase');
      this.edgeWeightedQuadUniformNodeSizeScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_nodeSizeScale');
      this.edgeWeightedQuadUniformEndpointTrim = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeEndpointTrim');
      this.edgeWeightedQuadUniformHoverIndex = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_hoverEdgeIndex');
      this.edgeWeightedQuadUniformHoverState = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_hoverEdgeState');
      this.edgeWeightedQuadUniformNodeNoStateScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_nodeNoStateScale');
      this.edgeWeightedQuadUniformNodeStateScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_nodeStateScale[0]');
      this.edgeWeightedQuadUniformNoStateScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeNoStateScale');
      this.edgeWeightedQuadUniformNoStateColorMul = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeNoStateColorMul');
      this.edgeWeightedQuadUniformNoStateColorAdd = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeNoStateColorAdd');
      this.edgeWeightedQuadUniformStateScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeStateScale[0]');
      this.edgeWeightedQuadUniformStateColorMul = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeStateColorMul[0]');
      this.edgeWeightedQuadUniformStateColorAdd = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeStateColorAdd[0]');
    }

    const ensureResolveProgram = (key, fragSource) => {
      if (this[key]) return;
      this[key] = getSharedProgram(key, EDGE_RESOLVE_VERTEX_SOURCE, fragSource).program;
      this[`${key.replace('Program', 'UniformColor')}`] = gl.getUniformLocation(this[key], 'u_colorAccum');
      this[`${key.replace('Program', 'UniformWeight')}`] = gl.getUniformLocation(this[key], 'u_weightAccum');
    };

    ensureResolveProgram('edgeResolveProgram', EDGE_RESOLVE_FRAGMENT_SOURCE);
    ensureResolveProgram('edgeResolveTonemapProgram', EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE);
    ensureResolveProgram('edgeResolveBoostProgram', EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE);

    return Boolean(this.edgeWeightedProgram && this.edgeWeightedQuadProgram && this.edgeResolveProgram);
  }

  destroyWeightedTargets() {
    const gl = this.gl;
    if (!gl) return;
    if (this.weightedFramebuffer) gl.deleteFramebuffer(this.weightedFramebuffer);
    if (this.weightedColor) gl.deleteTexture(this.weightedColor);
    if (this.weightedWeight) gl.deleteTexture(this.weightedWeight);
    if (this.weightedDepth) gl.deleteRenderbuffer(this.weightedDepth);
    this.weightedFramebuffer = null;
    this.weightedColor = null;
    this.weightedWeight = null;
    this.weightedDepth = null;
    this.weightedSize = null;
  }

  ensureWeightedTargets(width, height) {
    if (!this.weightedSupported) return false;
    const gl = this.gl;
    if (!gl) return false;
    const targetWidth = Math.max(1, Math.floor(width));
    const targetHeight = Math.max(1, Math.floor(height));
    if (this.weightedSize && this.weightedSize.width === targetWidth && this.weightedSize.height === targetHeight) {
      return true;
    }

    this.destroyWeightedTargets();

    const framebuffer = gl.createFramebuffer();
    const color = gl.createTexture();
    const weight = gl.createTexture();
    const depth = gl.createRenderbuffer();

    gl.bindTexture(gl.TEXTURE_2D, color);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, targetWidth, targetHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);

    gl.bindTexture(gl.TEXTURE_2D, weight);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, targetWidth, targetHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);

    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, targetWidth, targetHeight);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, weight, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.warn('Weighted transparency framebuffer is incomplete, falling back to alpha.', status);
      this.destroyWeightedTargets();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.weightedFramebuffer = framebuffer;
    this.weightedColor = color;
    this.weightedWeight = weight;
    this.weightedDepth = depth;
    this.weightedSize = { width: targetWidth, height: targetHeight };
    return true;
  }

  prepareWeightedWebGL(width, height) {
    return this.ensureWeightedPrograms() && this.ensureWeightedTargets(width, height);
  }

  renderWeightedWebGL(context, {
    geometry,
    is2D,
    cameraUniforms,
    edgeWidthBase,
    edgeWidthScale,
    viewport,
    visualConfig,
    nodeVariant,
    edgeVariant,
  }) {
    const gl = this.gl;
    if (!gl || !this.weightedFramebuffer) return;
    const nodeBlendWithEdges = this.nodeBlendWithEdges === true;
    const edgeDepthWrite = this.edgeDepthWrite === true;
    this.counters.weightedFramebufferRenders = bumpCounter(this.counters.weightedFramebufferRenders);
    const mainFramebuffer = context.target?.handle ?? null;
    const mainDrawBuffers = mainFramebuffer ? [gl.COLOR_ATTACHMENT0] : [gl.BACK];
    const applyViewport = () => {
      if (viewport) {
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      } else {
        gl.viewport(0, 0, this.weightedSize?.width ?? gl.drawingBufferWidth, this.weightedSize?.height ?? gl.drawingBufferHeight);
      }
    };

    const drawNodesAlpha = () => {
      const nodeEntry = this.getNodeProgram(nodeVariant, null, visualConfig);
      if (!nodeEntry?.program) return;
      gl.useProgram(nodeEntry.program);
      this.setNodeUniforms(gl, nodeEntry.uniforms, cameraUniforms, is2D, visualConfig?.node ?? null);
      gl.bindVertexArray(this.nodeVAO);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);
    };

    const globalEdgeWidthBase = edgeWidthBase;
    const globalEdgeWidthScale = edgeWidthScale;

    // Draw nodes to the main framebuffer first in 3D to populate color and depth.
    if (!is2D && this.nodeCount && !nodeBlendWithEdges) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
      applyViewport();
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawNodesAlpha();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.weightedFramebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    applyViewport();
    gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 0, 0, 0]));
    gl.clearBufferfv(gl.COLOR, 1, new Float32Array([0, 0, 0, 0]));
    gl.clearBufferfv(gl.DEPTH, 0, new Float32Array([1]));

    if (!is2D && this.nodeCount && !nodeBlendWithEdges) {
      gl.colorMask(false, false, false, false);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      drawNodesAlpha();
      gl.colorMask(true, true, true, true);
    }

    if (geometry.edges.count) {
      const useQuads = this.edgeRenderingMode === 'quad';
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      if (is2D) {
        gl.disable(gl.DEPTH_TEST);
      } else {
        gl.enable(gl.DEPTH_TEST);
      }
      gl.depthMask(!is2D && edgeDepthWrite);

      const vw = viewport ? viewport[2] : (this.weightedSize?.width ?? 1);
      const vh = viewport ? viewport[3] : (this.weightedSize?.height ?? 1);
      const kind = useQuads ? 'quad' : 'line';
      const edgeEntry = this.getEdgeProgram(kind, edgeVariant, true);
      if (edgeEntry?.program) {
        gl.useProgram(edgeEntry.program);
        this.setEdgeUniforms(gl, edgeEntry.uniforms, cameraUniforms, vw, vh, globalEdgeWidthBase, globalEdgeWidthScale, visualConfig?.edge ?? null);
        gl.bindVertexArray(useQuads ? this.edgeQuadVAO : this.edgeVAO);
        gl.drawArraysInstanced(useQuads ? gl.TRIANGLE_STRIP : gl.LINES, 0, useQuads ? 4 : 2, this.edgeCount);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
    gl.drawBuffers(mainDrawBuffers);
    applyViewport();
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    let resolveProgram = this.edgeResolveProgram;
    let resolveUniformColor = this.edgeResolveUniformColor;
    let resolveUniformWeight = this.edgeResolveUniformWeight;
    if (this.edgeTransparencyMode === 'additive-tonemapped') {
      resolveProgram = this.edgeResolveTonemapProgram ?? resolveProgram;
      resolveUniformColor = this.edgeResolveTonemapUniformColor ?? resolveUniformColor;
      resolveUniformWeight = this.edgeResolveTonemapUniformWeight ?? resolveUniformWeight;
    } else if (this.edgeTransparencyMode === 'additive-normalized-bright') {
      resolveProgram = this.edgeResolveBoostProgram ?? resolveProgram;
      resolveUniformColor = this.edgeResolveBoostUniformColor ?? resolveUniformColor;
      resolveUniformWeight = this.edgeResolveBoostUniformWeight ?? resolveUniformWeight;
    }

    gl.useProgram(resolveProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.weightedColor);
    gl.uniform1i(resolveUniformColor, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.weightedWeight);
    gl.uniform1i(resolveUniformWeight, 1);
    gl.bindVertexArray(this.edgeResolveVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if ((is2D || nodeBlendWithEdges) && this.nodeCount) {
      gl.enable(gl.BLEND);
      if (nodeBlendWithEdges) {
        this.applyEdgeBlend(gl, this.edgeTransparencyMode);
      } else {
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      }
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
      applyViewport();
      drawNodesAlpha();
    }

    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LEQUAL);
  }
}
