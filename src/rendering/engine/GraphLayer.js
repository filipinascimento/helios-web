import { Layer } from './Layer.js';
import {
  AMBIENT_OCCLUSION_QUALITY_DEFAULT,
  normalizeAmbientOcclusionQuality,
} from './AmbientOcclusionQuality.js';
import {
  AMBIENT_OCCLUSION_MODE_DEFAULT,
  normalizeAmbientOcclusionMode,
} from './AmbientOcclusionMode.js';

export { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './GraphLayerCommon.js';

export const SHADED_LIGHT_DIRECTION_DEFAULT = Object.freeze([
  0.577350269,
  0.577350269,
  0.577350269,
]);
export const SHADED_LIGHT_COLOR_DEFAULT = Object.freeze([1, 1, 1, 1]);
export const SHADED_AMBIENT_TOP_COLOR_DEFAULT = Object.freeze([0.62, 0.64, 0.7, 1]);
export const SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT = Object.freeze([0.22, 0.24, 0.3, 1]);
export const SHADED_DIFFUSE_STRENGTH_DEFAULT = 1;
export const SHADED_AMBIENT_STRENGTH_DEFAULT = 1;
export const SHADED_SPECULAR_COLOR_DEFAULT = Object.freeze([1, 1, 1, 1]);
export const SHADED_SPECULAR_STRENGTH_DEFAULT = 0.35;
export const SHADED_SHININESS_DEFAULT = 48;
export const AMBIENT_OCCLUSION_STRENGTH_DEFAULT = 0.7;
export const AMBIENT_OCCLUSION_RADIUS_DEFAULT = 14;
export const AMBIENT_OCCLUSION_BIAS_DEFAULT = 0.02;
export const AMBIENT_OCCLUSION_INTENSITY_SCALE_DEFAULT = 1.25;
export const AMBIENT_OCCLUSION_INTENSITY_SHIFT_DEFAULT = 0.05;
export { AMBIENT_OCCLUSION_QUALITY_DEFAULT } from './AmbientOcclusionQuality.js';
export { AMBIENT_OCCLUSION_MODE_DEFAULT } from './AmbientOcclusionMode.js';

function clampUnit01(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function normalizeShadedColor(value, fallback) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : fallback;
  return [
    clampUnit01(source?.[0], fallback[0] ?? 0),
    clampUnit01(source?.[1], fallback[1] ?? 0),
    clampUnit01(source?.[2], fallback[2] ?? 0),
    clampUnit01(source?.[3], fallback[3] ?? 1),
  ];
}

function normalizeShadedDirection(value, fallback = SHADED_LIGHT_DIRECTION_DEFAULT) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : fallback;
  const x = Number(source?.[0]);
  const y = Number(source?.[1]);
  const z = Number(source?.[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return [...fallback];
  }
  const length = Math.hypot(x, y, z);
  if (!(length > 1e-6)) {
    return [...fallback];
  }
  return [x / length, y / length, z / length];
}

export class GraphLayer extends Layer {
  static NO_HOVER_INDEX = 0xffffffff;
  static FORCE_VISIBILITY_BOOST = 1000.0;

  isSupportedTransparencyMode(mode) {
    switch (mode) {
      case 'alpha':
      case 'weighted':
      case 'additive':
      case 'screen':
      case 'max':
      case 'additive-normalized':
      case 'additive-tonemapped':
      case 'additive-normalized-bright':
        return true;
      default:
        return false;
    }
  }

  isWeightedTransparencyMode(mode) {
    switch (mode) {
      case 'weighted':
      case 'additive-normalized':
      case 'additive-tonemapped':
      case 'additive-normalized-bright':
        return true;
      default:
        return false;
    }
  }

  normalizeEdgeTransparencyMode(mode) {
    const raw = typeof mode === 'string' ? mode : '';
    const fallback = raw ? 'alpha' : 'weighted';
    const resolved = this.isSupportedTransparencyMode(raw) ? raw : fallback;
    if (this.isWeightedTransparencyMode(resolved) && this.weightedSupported === false) {
      return 'alpha';
    }
    return resolved;
  }

  constructor(options = {}) {
    super('graph-layer');
    const requestedSlots = Number(options.stateSlots);
    const clampedSlots = Number.isFinite(requestedSlots) ? Math.floor(requestedSlots) : 4;
    this.stateSlotCount = Math.min(32, Math.max(0, clampedSlots));
    this.edgeRenderingMode = options.edgeRendering === 'line' ? 'line' : 'quad';
    this.weightedSupported = null;
    this.edgeTransparencyMode = this.normalizeEdgeTransparencyMode(options.transparencyModeEdges);
    this.nodeOpacityBase = 0;
    this.nodeOpacityScale = 1;
    this.nodeSizeBase = 0;
    this.nodeSizeScale = 1;
    this.semanticZoomExponent = Number.isFinite(options.semanticZoomExponent)
      ? options.semanticZoomExponent
      : 0;
    this.nodeOutlineWidthBase = 0;
    this.nodeOutlineWidthScale = 0;
    this.nodeOutlineColor = options.nodeOutlineColor ?? [0, 0, 0, 1];
    this.nodeOutlineUseAttributes = options.nodeOutlineUseAttributes === true;
    this.edgeOpacityBase = 0;
    this.edgeOpacityScale = 0.5;
    this.edgeWidthBase = 0;
    this.edgeWidthScale = 1;
    this.edgeEndpointTrim = Number.isFinite(options.edgeEndpointTrim) ? options.edgeEndpointTrim : 0.8;
    this.edgeWidthClampToNodeDiameter = options.edgeWidthClampToNodeDiameter !== false;
    this.nodeBlendWithEdges = options.nodeBlendWithEdges === true;
    this.edgeDepthWrite = options.edgeDepthWrite === true;
    this.edgeFastRendering = options.edgeFastRendering === true;
    this.edgeAdaptiveFastRendering = options.edgeAdaptiveFastRendering === true;
    this.lastRenderDurationMs = null;
    this.loggedWeightedActive = false;
    this.shadedEnabled = options.shadedEnabled === true;
    this.shadedNodes = options.shadedNodes !== false;
    this.shadedEdges = options.shadedEdges === true;
    this.shadedLightDirection = normalizeShadedDirection(options.shadedLightDirection);
    this.shadedLightColor = normalizeShadedColor(options.shadedLightColor, SHADED_LIGHT_COLOR_DEFAULT);
    this.shadedAmbientTopColor = normalizeShadedColor(
      options.shadedAmbientTopColor,
      SHADED_AMBIENT_TOP_COLOR_DEFAULT,
    );
    this.shadedAmbientBottomColor = normalizeShadedColor(
      options.shadedAmbientBottomColor,
      SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT,
    );
    this.shadedDiffuseStrength = Number.isFinite(Number(options.shadedDiffuseStrength))
      ? Math.max(0, Number(options.shadedDiffuseStrength))
      : SHADED_DIFFUSE_STRENGTH_DEFAULT;
    this.shadedAmbientStrength = Number.isFinite(Number(options.shadedAmbientStrength))
      ? Math.max(0, Number(options.shadedAmbientStrength))
      : SHADED_AMBIENT_STRENGTH_DEFAULT;
    this.shadedSpecularColor = normalizeShadedColor(
      options.shadedSpecularColor,
      SHADED_SPECULAR_COLOR_DEFAULT,
    );
    this.shadedSpecularStrength = Number.isFinite(Number(options.shadedSpecularStrength))
      ? Math.max(0, Number(options.shadedSpecularStrength))
      : SHADED_SPECULAR_STRENGTH_DEFAULT;
    this.shadedShininess = Number.isFinite(Number(options.shadedShininess))
      ? Math.max(1, Number(options.shadedShininess))
      : SHADED_SHININESS_DEFAULT;
    this.ambientOcclusionEnabled = options.ambientOcclusionEnabled === true;
    this.ambientOcclusionNodes = options.ambientOcclusionNodes !== false;
    this.ambientOcclusionEdges = options.ambientOcclusionEdges === true;
    this.ambientOcclusionStrength = Number.isFinite(Number(options.ambientOcclusionStrength))
      ? Math.max(0, Number(options.ambientOcclusionStrength))
      : AMBIENT_OCCLUSION_STRENGTH_DEFAULT;
    this.ambientOcclusionRadius = Number.isFinite(Number(options.ambientOcclusionRadius))
      ? Math.max(1, Number(options.ambientOcclusionRadius))
      : AMBIENT_OCCLUSION_RADIUS_DEFAULT;
    this.ambientOcclusionBias = Number.isFinite(Number(options.ambientOcclusionBias))
      ? Math.max(0, Number(options.ambientOcclusionBias))
      : AMBIENT_OCCLUSION_BIAS_DEFAULT;
    this.ambientOcclusionMode = normalizeAmbientOcclusionMode(
      options.ambientOcclusionMode,
      AMBIENT_OCCLUSION_MODE_DEFAULT,
    );
    this.ambientOcclusionIntensityScale = Number.isFinite(Number(options.ambientOcclusionIntensityScale))
      ? Math.max(0, Number(options.ambientOcclusionIntensityScale))
      : AMBIENT_OCCLUSION_INTENSITY_SCALE_DEFAULT;
    this.ambientOcclusionIntensityShift = Number.isFinite(Number(options.ambientOcclusionIntensityShift))
      ? Math.max(0, Number(options.ambientOcclusionIntensityShift))
      : AMBIENT_OCCLUSION_INTENSITY_SHIFT_DEFAULT;
    this.ambientOcclusionQuality = normalizeAmbientOcclusionQuality(
      options.ambientOcclusionQuality,
      AMBIENT_OCCLUSION_QUALITY_DEFAULT,
    );
    const slots = this.stateSlotCount;
    this.nodeStateScale = new Float32Array(slots * 4);
    this.nodeStateColorMul = new Float32Array(slots * 4);
    this.nodeStateColorAdd = new Float32Array(slots * 4);
    this.nodeStateForceMaxAlphaMask = 0;
    this.nodeNoStateScale = new Float32Array(4);
    this.nodeNoStateColorMul = new Float32Array(4);
    this.nodeNoStateColorAdd = new Float32Array(4);
    this.nodeNoStateStyleEnabled = true;
    this.edgeStateScale = new Float32Array(slots * 4);
    this.edgeStateColorMul = new Float32Array(slots * 4);
    this.edgeStateColorAdd = new Float32Array(slots * 4);
    this.edgeStateForceMaxAlphaMask = 0;
    this.edgeNoStateScale = new Float32Array(4);
    this.edgeNoStateColorMul = new Float32Array(4);
    this.edgeNoStateColorAdd = new Float32Array(4);
    this.edgeNoStateStyleEnabled = true;
    this.propagateHoveredNodeToEdges = options.propagateHoveredNodeToEdges === true;
    this.propagateSelectedNodesToEdges = options.propagateSelectedNodesToEdges === true;

    this.hoveredNodeIndex = GraphLayer.NO_HOVER_INDEX;
    this.hoveredNodeState = 0;
    this.hoveredEdgeIndex = GraphLayer.NO_HOVER_INDEX;
    this.hoveredEdgeState = 0;
    this.positionDelegate = null;
    this.positionInterpolation = {
      enabled: false,
      factor: 1,
      sourceVersion: 0,
      sourceCount: 0,
      sourceView: null,
      sourceWebGPUBuffer: null,
      sourceWebGLTexture: null,
      sourceTextureMeta: null,
    };
    this.resetStateStyles();
  }

  getCameraUniforms(camera, context = null) {
    if (camera?.getUniforms) {
      const uniforms = camera.getUniforms();
      if (!this.ensureFinite(uniforms?.viewProjection) || !this.ensureFinite(uniforms?.view)) {
        return null;
      }
      const exportViewport = context?.target?.exportFigureLogicalViewport ?? null;
      if (!exportViewport) {
        return uniforms;
      }
      return {
        ...uniforms,
        viewport: {
          ...(uniforms.viewport ?? {}),
          ...exportViewport,
        },
      };
    }
    return null;
  }

  ensureFinite(array) {
    if (!array) return false;
    for (let i = 0; i < array.length; i += 1) {
      if (!Number.isFinite(array[i])) return false;
    }
    return true;
  }

  shouldRenderEdges() {
    const edgeWidthBase = Number(this.edgeWidthBase);
    const edgeWidthScale = Number(this.edgeWidthScale);
    if (edgeWidthBase === 0 && edgeWidthScale === 0) return false;

    const edgeOpacityBase = Number(this.edgeOpacityBase);
    const edgeOpacityScale = Number(this.edgeOpacityScale);
    if (edgeOpacityBase === 0 && edgeOpacityScale === 0) return false;

    return true;
  }

  hasSemanticZoom() {
    return Number.isFinite(this.semanticZoomExponent) && this.semanticZoomExponent > 0;
  }

  hasEdgeTrim() {
    return Number.isFinite(this.edgeEndpointTrim) && this.edgeEndpointTrim !== 0;
  }

  hasEdgeWidthClampToNodeDiameter(options = {}) {
    return options.fastPath === true ? false : this.edgeWidthClampToNodeDiameter !== false;
  }

  isNodeShadingEnabled() {
    return this.shadedEnabled === true && this.shadedNodes !== false;
  }

  isEdgeShadingEnabled() {
    return this.shadedEnabled === true && this.shadedEdges === true;
  }

  isAmbientOcclusionEnabled() {
    return this.ambientOcclusionEnabled === true;
  }

  isAmbientOcclusionNodesEnabled() {
    return this.isAmbientOcclusionEnabled() && this.ambientOcclusionNodes !== false;
  }

  isAmbientOcclusionEdgesEnabled() {
    return this.isAmbientOcclusionEnabled() && this.ambientOcclusionEdges === true;
  }

  getAmbientOcclusionSelection() {
    return {
      nodes: this.isAmbientOcclusionNodesEnabled(),
      edges: this.isAmbientOcclusionEdgesEnabled(),
    };
  }

  hasAmbientOcclusionSelection() {
    const selection = this.getAmbientOcclusionSelection();
    return selection.nodes || selection.edges;
  }

  hasActiveEdgeStateStyling() {
    if ((this.hoveredEdgeState >>> 0) !== 0) return true;
    if (
      this.edgeNoStateScale[0] !== 1
      || this.edgeNoStateScale[1] !== 1
      || this.edgeNoStateScale[3] !== 0
      || this.edgeNoStateColorMul[0] !== 1
      || this.edgeNoStateColorMul[1] !== 1
      || this.edgeNoStateColorMul[2] !== 1
      || this.edgeNoStateColorAdd[0] !== 0
      || this.edgeNoStateColorAdd[1] !== 0
      || this.edgeNoStateColorAdd[2] !== 0
    ) {
      return true;
    }
    for (let i = 0; i < this.stateSlotCount; i += 1) {
      const o = i * 4;
      if (
        this.edgeStateScale[o + 0] !== 1
        || this.edgeStateScale[o + 1] !== 1
        || this.edgeStateScale[o + 3] !== 0
        || this.edgeStateColorMul[o + 0] !== 1
        || this.edgeStateColorMul[o + 1] !== 1
        || this.edgeStateColorMul[o + 2] !== 1
        || this.edgeStateColorAdd[o + 0] !== 0
        || this.edgeStateColorAdd[o + 1] !== 0
        || this.edgeStateColorAdd[o + 2] !== 0
      ) {
        return true;
      }
    }
    return false;
  }

  hasActiveNodeStateStyling() {
    if ((this.hoveredNodeState >>> 0) !== 0) return true;
    if (
      this.nodeNoStateScale[0] !== 1
      || this.nodeNoStateScale[1] !== 1
      || this.nodeNoStateScale[2] !== 1
      || this.nodeNoStateScale[3] !== 0
      || this.nodeNoStateColorMul[0] !== 1
      || this.nodeNoStateColorMul[1] !== 1
      || this.nodeNoStateColorMul[2] !== 1
      || this.nodeNoStateColorAdd[0] !== 0
      || this.nodeNoStateColorAdd[1] !== 0
      || this.nodeNoStateColorAdd[2] !== 0
    ) {
      return true;
    }
    for (let i = 0; i < this.stateSlotCount; i += 1) {
      const o = i * 4;
      if (
        this.nodeStateScale[o + 0] !== 1
        || this.nodeStateScale[o + 1] !== 1
        || this.nodeStateScale[o + 2] !== 1
        || this.nodeStateScale[o + 3] !== 0
        || this.nodeStateColorMul[o + 0] !== 1
        || this.nodeStateColorMul[o + 1] !== 1
        || this.nodeStateColorMul[o + 2] !== 1
        || this.nodeStateColorAdd[o + 0] !== 0
        || this.nodeStateColorAdd[o + 1] !== 0
        || this.nodeStateColorAdd[o + 2] !== 0
      ) {
        return true;
      }
    }
    return false;
  }

  hasActiveEndpointStateStyling() {
    if (this.nodeNoStateScale[0] !== 1) return true;
    for (let i = 0; i < this.stateSlotCount; i += 1) {
      if (this.nodeStateScale[i * 4] !== 1) return true;
    }
    return false;
  }

  resolveEdgeSpecialization(options = {}) {
    const is2D = options.is2D === true;
    const trim = options.fastPath === true ? false : this.hasEdgeTrim();
    const widthClampToNodeDiameter = this.hasEdgeWidthClampToNodeDiameter(options);
    const propagateHoveredNodeToEdges = options.fastPath === true
      ? false
      : this.propagateHoveredNodeToEdges === true;
    const propagateSelectedNodesToEdges = options.fastPath === true
      ? false
      : this.propagateSelectedNodesToEdges === true;
    const edgeState = options.fastPath === true
      ? false
      : (this.hasActiveEdgeStateStyling() || propagateHoveredNodeToEdges || propagateSelectedNodesToEdges);
    const endpointState = options.fastPath === true
      ? false
      : (((trim || widthClampToNodeDiameter) && this.hasActiveEndpointStateStyling()) || propagateSelectedNodesToEdges);
    return {
      cameraMode: is2D ? '2d' : '3d',
      semanticZoom: options.fastPath === true ? false : (is2D && this.hasSemanticZoom()),
      trim,
      widthClampToNodeDiameter,
      edgeState,
      endpointState,
      propagateHoveredNodeToEdges,
      propagateSelectedNodesToEdges,
    };
  }


  setHoveredNodeState(index, mask) {
    const nextIndex =
      index == null || Number(index) < 0
        ? GraphLayer.NO_HOVER_INDEX
        : (Number(index) >>> 0);
    this.hoveredNodeIndex = nextIndex;
    this.hoveredNodeState = (Number(mask) >>> 0);
    return this;
  }

  setHoveredEdgeState(index, mask) {
    const nextIndex =
      index == null || Number(index) < 0
        ? GraphLayer.NO_HOVER_INDEX
        : (Number(index) >>> 0);
    this.hoveredEdgeIndex = nextIndex;
    this.hoveredEdgeState = (Number(mask) >>> 0);
    return this;
  }

  resetStateStyles() {
    const slots = this.stateSlotCount;
    this.nodeStateForceMaxAlphaMask = 0;
    this.edgeStateForceMaxAlphaMask = 0;
    for (let i = 0; i < slots; i += 1) {
      const o = i * 4;
      this.nodeStateScale[o + 0] = 1;
      this.nodeStateScale[o + 1] = 1;
      this.nodeStateScale[o + 2] = 1;
      this.nodeStateScale[o + 3] = 0;
      this.nodeStateColorMul[o + 0] = 1;
      this.nodeStateColorMul[o + 1] = 1;
      this.nodeStateColorMul[o + 2] = 1;
      this.nodeStateColorMul[o + 3] = 1;
      this.nodeStateColorAdd[o + 0] = 0;
      this.nodeStateColorAdd[o + 1] = 0;
      this.nodeStateColorAdd[o + 2] = 0;
      this.nodeStateColorAdd[o + 3] = 0;

      this.edgeStateScale[o + 0] = 1;
      this.edgeStateScale[o + 1] = 1;
      this.edgeStateScale[o + 2] = 1;
      this.edgeStateScale[o + 3] = 0;
      this.edgeStateColorMul[o + 0] = 1;
      this.edgeStateColorMul[o + 1] = 1;
      this.edgeStateColorMul[o + 2] = 1;
      this.edgeStateColorMul[o + 3] = 1;
      this.edgeStateColorAdd[o + 0] = 0;
      this.edgeStateColorAdd[o + 1] = 0;
      this.edgeStateColorAdd[o + 2] = 0;
      this.edgeStateColorAdd[o + 3] = 0;
    }

    // NO_STATE styles (applied when state bitmask is 0).
    this.nodeNoStateScale[0] = 1;
    this.nodeNoStateScale[1] = 1;
    this.nodeNoStateScale[2] = 1;
    this.nodeNoStateScale[3] = 0;
    this.nodeNoStateColorMul[0] = 1;
    this.nodeNoStateColorMul[1] = 1;
    this.nodeNoStateColorMul[2] = 1;
    this.nodeNoStateColorMul[3] = 1;
    this.nodeNoStateColorAdd[0] = 0;
    this.nodeNoStateColorAdd[1] = 0;
    this.nodeNoStateColorAdd[2] = 0;
    this.nodeNoStateColorAdd[3] = 0;

    this.edgeNoStateScale[0] = 1;
    this.edgeNoStateScale[1] = 1;
    this.edgeNoStateScale[2] = 1;
    this.edgeNoStateScale[3] = 0;
    this.edgeNoStateColorMul[0] = 1;
    this.edgeNoStateColorMul[1] = 1;
    this.edgeNoStateColorMul[2] = 1;
    this.edgeNoStateColorMul[3] = 1;
    this.edgeNoStateColorAdd[0] = 0;
    this.edgeNoStateColorAdd[1] = 0;
    this.edgeNoStateColorAdd[2] = 0;
    this.edgeNoStateColorAdd[3] = 0;
  }

  setNodeStateStyle(slot, style = {}) {
    const index = Number(slot);
    if (!Number.isInteger(index) || index < 0 || index >= this.stateSlotCount) return;
    const o = index * 4;
    if (style.sizeMul != null) this.nodeStateScale[o + 0] = Number(style.sizeMul);
    if (style.opacityMul != null) this.nodeStateScale[o + 1] = Number(style.opacityMul);
    if (style.outlineMul != null) this.nodeStateScale[o + 2] = Number(style.outlineMul);
    if (style.discard != null) this.nodeStateScale[o + 3] = style.discard ? 1 : 0;
    if (style.colorMul != null) {
      const v = style.colorMul;
      this.nodeStateColorMul[o + 0] = v[0] ?? this.nodeStateColorMul[o + 0];
      this.nodeStateColorMul[o + 1] = v[1] ?? this.nodeStateColorMul[o + 1];
      this.nodeStateColorMul[o + 2] = v[2] ?? this.nodeStateColorMul[o + 2];
      this.nodeStateColorMul[o + 3] = v[3] ?? this.nodeStateColorMul[o + 3];
    }
    if (style.colorAdd != null) {
      const v = style.colorAdd;
      this.nodeStateColorAdd[o + 0] = v[0] ?? this.nodeStateColorAdd[o + 0];
      this.nodeStateColorAdd[o + 1] = v[1] ?? this.nodeStateColorAdd[o + 1];
      this.nodeStateColorAdd[o + 2] = v[2] ?? this.nodeStateColorAdd[o + 2];
      this.nodeStateColorAdd[o + 3] = v[3] ?? this.nodeStateColorAdd[o + 3];
    }
    if (style.forceMaxAlpha != null) {
      const bit = (1 << index) >>> 0;
      if (style.forceMaxAlpha) {
        this.nodeStateForceMaxAlphaMask = (this.nodeStateForceMaxAlphaMask | bit) >>> 0;
      } else {
        this.nodeStateForceMaxAlphaMask = (this.nodeStateForceMaxAlphaMask & (~bit)) >>> 0;
      }
    }
  }

  setNodeNoStateStyle(style = {}) {
    if (style.sizeMul != null) this.nodeNoStateScale[0] = Number(style.sizeMul);
    if (style.opacityMul != null) this.nodeNoStateScale[1] = Number(style.opacityMul);
    if (style.outlineMul != null) this.nodeNoStateScale[2] = Number(style.outlineMul);
    if (style.discard != null) this.nodeNoStateScale[3] = style.discard ? 1 : 0;
    if (style.colorMul != null) {
      const v = style.colorMul;
      this.nodeNoStateColorMul[0] = v[0] ?? this.nodeNoStateColorMul[0];
      this.nodeNoStateColorMul[1] = v[1] ?? this.nodeNoStateColorMul[1];
      this.nodeNoStateColorMul[2] = v[2] ?? this.nodeNoStateColorMul[2];
      this.nodeNoStateColorMul[3] = v[3] ?? this.nodeNoStateColorMul[3];
    }
    if (style.colorAdd != null) {
      const v = style.colorAdd;
      this.nodeNoStateColorAdd[0] = v[0] ?? this.nodeNoStateColorAdd[0];
      this.nodeNoStateColorAdd[1] = v[1] ?? this.nodeNoStateColorAdd[1];
      this.nodeNoStateColorAdd[2] = v[2] ?? this.nodeNoStateColorAdd[2];
      this.nodeNoStateColorAdd[3] = v[3] ?? this.nodeNoStateColorAdd[3];
    }
  }

  setEdgeStateStyle(slot, style = {}) {
    const index = Number(slot);
    if (!Number.isInteger(index) || index < 0 || index >= this.stateSlotCount) return;
    const o = index * 4;
    if (style.widthMul != null) this.edgeStateScale[o + 0] = Number(style.widthMul);
    if (style.opacityMul != null) this.edgeStateScale[o + 1] = Number(style.opacityMul);
    if (style.discard != null) this.edgeStateScale[o + 3] = style.discard ? 1 : 0;
    if (style.colorMul != null) {
      const v = style.colorMul;
      this.edgeStateColorMul[o + 0] = v[0] ?? this.edgeStateColorMul[o + 0];
      this.edgeStateColorMul[o + 1] = v[1] ?? this.edgeStateColorMul[o + 1];
      this.edgeStateColorMul[o + 2] = v[2] ?? this.edgeStateColorMul[o + 2];
      this.edgeStateColorMul[o + 3] = v[3] ?? this.edgeStateColorMul[o + 3];
    }
    if (style.colorAdd != null) {
      const v = style.colorAdd;
      this.edgeStateColorAdd[o + 0] = v[0] ?? this.edgeStateColorAdd[o + 0];
      this.edgeStateColorAdd[o + 1] = v[1] ?? this.edgeStateColorAdd[o + 1];
      this.edgeStateColorAdd[o + 2] = v[2] ?? this.edgeStateColorAdd[o + 2];
      this.edgeStateColorAdd[o + 3] = v[3] ?? this.edgeStateColorAdd[o + 3];
    }
    if (style.forceMaxAlpha != null) {
      const bit = (1 << index) >>> 0;
      if (style.forceMaxAlpha) {
        this.edgeStateForceMaxAlphaMask = (this.edgeStateForceMaxAlphaMask | bit) >>> 0;
      } else {
        this.edgeStateForceMaxAlphaMask = (this.edgeStateForceMaxAlphaMask & (~bit)) >>> 0;
      }
    }
  }

  setEdgeNoStateStyle(style = {}) {
    if (style.widthMul != null) this.edgeNoStateScale[0] = Number(style.widthMul);
    if (style.opacityMul != null) this.edgeNoStateScale[1] = Number(style.opacityMul);
    if (style.discard != null) this.edgeNoStateScale[3] = style.discard ? 1 : 0;
    if (style.colorMul != null) {
      const v = style.colorMul;
      this.edgeNoStateColorMul[0] = v[0] ?? this.edgeNoStateColorMul[0];
      this.edgeNoStateColorMul[1] = v[1] ?? this.edgeNoStateColorMul[1];
      this.edgeNoStateColorMul[2] = v[2] ?? this.edgeNoStateColorMul[2];
      this.edgeNoStateColorMul[3] = v[3] ?? this.edgeNoStateColorMul[3];
    }
    if (style.colorAdd != null) {
      const v = style.colorAdd;
      this.edgeNoStateColorAdd[0] = v[0] ?? this.edgeNoStateColorAdd[0];
      this.edgeNoStateColorAdd[1] = v[1] ?? this.edgeNoStateColorAdd[1];
      this.edgeNoStateColorAdd[2] = v[2] ?? this.edgeNoStateColorAdd[2];
      this.edgeNoStateColorAdd[3] = v[3] ?? this.edgeNoStateColorAdd[3];
    }
  }

  setEdgeRenderingMode(mode) {
    if (mode === 'line' || mode === 'quad') {
      this.edgeRenderingMode = mode;
    }
  }

  getEffectiveEdgeRenderingMode() {
    return this.isFastEdgeRenderingActive() ? 'line' : this.edgeRenderingMode;
  }

  setEdgeFastRendering(enabled) {
    this.edgeFastRendering = enabled === true;
  }

  setAdaptiveEdgeFastRendering(enabled) {
    this.edgeAdaptiveFastRendering = enabled === true;
  }

  isFastEdgeRenderingActive() {
    return this.edgeFastRendering === true || this.edgeAdaptiveFastRendering === true;
  }

  setEdgeTransparencyMode(mode) {
    this.edgeTransparencyMode = this.normalizeEdgeTransparencyMode(mode);
  }

  setPositionDelegate(delegate = null) {
    this.positionDelegate = delegate ?? null;
    return this;
  }

  setPositionInterpolationState(state = null) {
    const enabled = state?.enabled === true;
    const factor = Number.isFinite(state?.factor) ? Math.max(0, Math.min(1, Number(state.factor))) : 1;
    this.positionInterpolation = {
      enabled,
      factor,
      sourceVersion: Number.isFinite(state?.sourceVersion) ? Number(state.sourceVersion) : 0,
      sourceCount: Number.isFinite(state?.sourceCount) ? Math.max(0, Math.floor(Number(state.sourceCount))) : 0,
      sourceView: state?.sourceView ?? null,
      sourceWebGPUBuffer: state?.sourceWebGPUBuffer ?? null,
      sourceWebGLTexture: state?.sourceWebGLTexture ?? null,
      sourceTextureMeta: state?.sourceTextureMeta ?? null,
    };
    return this;
  }

  getPositionInterpolationState() {
    return this.positionInterpolation ?? null;
  }

  resolvePositionSourceOverride(network, backendContext = {}) {
    const delegate = this.positionDelegate;
    if (!delegate || !network) return null;
    const delegateNetwork = delegate?._context?.network ?? network;

    const context = {
      network: delegateNetwork,
      graphLayer: this,
      backend: backendContext.backend ?? null,
      device: backendContext.device ?? null,
      gl: backendContext.gl ?? null,
    };

    const ensureSynchronized = (reason = 'delegate-access') => {
      if (typeof delegate.ensureSynchronized !== 'function') return;
      try {
        delegate.ensureSynchronized({ ...context, reason });
      } catch (error) {
        console.warn('GraphLayer: position delegate synchronization failed', error);
      }
    };

    const pickValue = (...fns) => {
      for (const fn of fns) {
        if (typeof fn !== 'function') continue;
        ensureSynchronized(`before:${fn.name || 'callback'}`);
        try {
          const value = fn.call(delegate, context);
          if (value != null) return value;
        } catch (error) {
          console.warn('GraphLayer: position delegate callback failed', error);
        }
      }
      return null;
    };

    ensureSynchronized('resolve-position-override');
    const gpuShared = pickValue(delegate.getGpuPositionResource, delegate.getPositionResource);
    const webgpuRaw = pickValue(delegate.getWebGPUPositionBuffer);
    const webglRaw = pickValue(delegate.getWebGLPositionTexture);
    const versionRaw = pickValue(delegate.getVersion);
    const hasGpuResource = Boolean(gpuShared || webgpuRaw || webglRaw);
    const view = hasGpuResource
      ? null
      : pickValue(delegate.getNodePositionView, delegate.getPositionView);

    const normalizeBuffer = (raw) => {
      if (!raw) return null;
      if (raw.buffer) return raw.buffer;
      return raw;
    };

    const normalizeTexture = (raw) => {
      if (!raw) return null;
      if (raw.texture) return raw.texture;
      return raw;
    };

    const version =
      Number.isFinite(versionRaw)
        ? Number(versionRaw)
        : (Number.isFinite(delegate.version) ? Number(delegate.version) : 0);
    const countFromView = view && Number.isFinite(view.length)
      ? Math.floor((view.length ?? 0) / 3)
      : 0;
    const countFromActiveIndices = (() => {
      try {
        return Math.max(0, Math.floor(Number(network?.nodeCount ?? 0)));
      } catch (_) {
        return 0;
      }
    })();
    const count = Number.isFinite(gpuShared?.count)
      ? Math.max(0, Math.floor(Number(gpuShared.count)))
      : (Number.isFinite(webgpuRaw?.count)
        ? Math.max(0, Math.floor(Number(webgpuRaw.count)))
        : (Number.isFinite(webglRaw?.count)
          ? Math.max(0, Math.floor(Number(webglRaw.count)))
          : (countFromView || countFromActiveIndices)));
    const webgpuBuffer = normalizeBuffer(webgpuRaw) ?? normalizeBuffer(gpuShared);
    const webglTexture = normalizeTexture(webglRaw) ?? normalizeTexture(gpuShared);
    const webglTextureVersion = Number.isFinite(webglRaw?.version)
      ? Number(webglRaw.version)
      : (Number.isFinite(gpuShared?.version) ? Number(gpuShared.version) : version);
    const webglTextureCount = Number.isFinite(webglRaw?.count)
      ? Math.max(0, Math.floor(Number(webglRaw.count)))
      : count;
    const webglTextureMeta = webglRaw?.meta ?? null;

    if (!view && !webgpuBuffer && !webglTexture) return null;
    return {
      view: view ?? null,
      version,
      count,
      webgpuBuffer: webgpuBuffer ?? null,
      webglTexture: webglTexture ?? null,
      webglTextureVersion,
      webglTextureCount,
      webglTextureMeta,
    };
  }
}
