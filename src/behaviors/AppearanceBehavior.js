import { Behavior } from './Behavior.js';

const ACCESSOR_NAMES = Object.freeze([
  'background',
  'clearColor',
  'edgeTransparencyMode',
  'nodeSizeScale',
  'nodeSizeBase',
  'nodeOpacityScale',
  'nodeOpacityBase',
  'nodeOutlineWidthScale',
  'nodeOutlineWidthBase',
  'semanticZoomExponent',
  'edgeWidthScale',
  'edgeWidthBase',
  'edgeOpacityScale',
  'edgeOpacityBase',
  'edgeEndpointTrim',
  'nodeBlendWithEdges',
  'edgeWidthClampToNodeDiameter',
  'edgeDepthWrite',
  'edgeFastRendering',
  'edgeAdaptiveQuality',
  'edgeAdaptiveQualityEnabled',
  'edgeAdaptiveQualitySlowFrameThresholdMs',
  'edgeAdaptiveQualitySlowFrameConsecutiveFrames',
  'edgeAdaptiveQualityProbeIntervalMs',
  'edgeAdaptiveQualityInteractionHoldMs',
  'edgeAdaptiveQualityFastDuringCamera',
  'edgeAdaptiveQualityFastDuringLayout',
  'shadedEnabled',
  'shadedNodes',
  'shadedEdges',
  'shadedLightDirection',
  'shadedLightDirectionX',
  'shadedLightDirectionY',
  'shadedLightDirectionZ',
  'shadedLightColor',
  'shadedAmbientTopColor',
  'shadedAmbientBottomColor',
  'shadedDiffuseStrength',
  'shadedAmbientStrength',
  'shadedSpecularColor',
  'shadedSpecularStrength',
  'shadedShininess',
  'ambientOcclusionEnabled',
  'ambientOcclusionNodes',
  'ambientOcclusionEdges',
  'ambientOcclusionStrength',
  'ambientOcclusionRadius',
  'ambientOcclusionBias',
  'ambientOcclusionMode',
  'ambientOcclusionIntensityScale',
  'ambientOcclusionIntensityShift',
  'ambientOcclusionQuality',
  'supersampling',
]);

const ACCESSOR_NAME_SET = new Set(ACCESSOR_NAMES);
const SOURCE_EVENT_NAMES = new Set([
  'clearColor',
  ...ACCESSOR_NAMES,
]);

const LEGACY_APPEARANCE_PATHS = Object.freeze({
  background: 'appearance.background',
  clearColor: 'appearance.background',
  edgeTransparencyMode: 'appearance.edgeTransparencyMode',
  supersampling: 'appearance.supersampling',
  nodeSizeScale: 'appearance.nodeStyle.sizeScale',
  nodeSizeBase: 'appearance.nodeStyle.sizeBase',
  nodeOpacityScale: 'appearance.nodeStyle.opacityScale',
  nodeOpacityBase: 'appearance.nodeStyle.opacityBase',
  nodeOutlineWidthScale: 'appearance.nodeStyle.outlineWidthScale',
  nodeOutlineWidthBase: 'appearance.nodeStyle.outlineWidthBase',
  semanticZoomExponent: 'appearance.nodeStyle.semanticZoomExponent',
  nodeBlendWithEdges: 'appearance.nodeStyle.blendWithEdges',
  edgeWidthScale: 'appearance.edgeStyle.widthScale',
  edgeWidthBase: 'appearance.edgeStyle.widthBase',
  edgeOpacityScale: 'appearance.edgeStyle.opacityScale',
  edgeOpacityBase: 'appearance.edgeStyle.opacityBase',
  edgeEndpointTrim: 'appearance.edgeStyle.endpointTrim',
  edgeDepthWrite: 'appearance.edgeStyle.depthWrite',
  edgeFastRendering: 'appearance.edgeStyle.fastRendering',
  edgeWidthClampToNodeDiameter: 'appearance.edgeStyle.clampToNodeDiameter',
  edgeAdaptiveQuality: 'appearance.edgeStyle.adaptiveQuality',
  edgeAdaptiveQualityEnabled: 'appearance.edgeStyle.adaptiveQuality.enabled',
  edgeAdaptiveQualitySlowFrameThresholdMs: 'appearance.edgeStyle.adaptiveQuality.slowFrameThresholdMs',
  edgeAdaptiveQualitySlowFrameConsecutiveFrames: 'appearance.edgeStyle.adaptiveQuality.slowFrameConsecutiveFrames',
  edgeAdaptiveQualityProbeIntervalMs: 'appearance.edgeStyle.adaptiveQuality.probeIntervalMs',
  edgeAdaptiveQualityInteractionHoldMs: 'appearance.edgeStyle.adaptiveQuality.interactionHoldMs',
  edgeAdaptiveQualityFastDuringCamera: 'appearance.edgeStyle.adaptiveQuality.fastDuringCamera',
  edgeAdaptiveQualityFastDuringLayout: 'appearance.edgeStyle.adaptiveQuality.fastDuringLayout',
  shadedEnabled: 'appearance.shaded.enabled',
  shadedNodes: 'appearance.shaded.nodes',
  shadedEdges: 'appearance.shaded.edges',
  shadedLightDirection: 'appearance.shaded.lightDirection',
  shadedLightDirectionX: 'appearance.shaded.lightDirection.0',
  shadedLightDirectionY: 'appearance.shaded.lightDirection.1',
  shadedLightDirectionZ: 'appearance.shaded.lightDirection.2',
  shadedLightColor: 'appearance.shaded.lightColor',
  shadedAmbientTopColor: 'appearance.shaded.ambientTopColor',
  shadedAmbientBottomColor: 'appearance.shaded.ambientBottomColor',
  shadedDiffuseStrength: 'appearance.shaded.diffuseStrength',
  shadedAmbientStrength: 'appearance.shaded.ambientStrength',
  shadedSpecularColor: 'appearance.shaded.specularColor',
  shadedSpecularStrength: 'appearance.shaded.specularStrength',
  shadedShininess: 'appearance.shaded.shininess',
  ambientOcclusionEnabled: 'appearance.ambientOcclusion.enabled',
  ambientOcclusionNodes: 'appearance.ambientOcclusion.nodes',
  ambientOcclusionEdges: 'appearance.ambientOcclusion.edges',
  ambientOcclusionStrength: 'appearance.ambientOcclusion.strength',
  ambientOcclusionRadius: 'appearance.ambientOcclusion.radius',
  ambientOcclusionBias: 'appearance.ambientOcclusion.bias',
  ambientOcclusionMode: 'appearance.ambientOcclusion.mode',
  ambientOcclusionIntensityScale: 'appearance.ambientOcclusion.intensityScale',
  ambientOcclusionIntensityShift: 'appearance.ambientOcclusion.intensityShift',
  ambientOcclusionQuality: 'appearance.ambientOcclusion.quality',
});

function collectStateKeys(detail = {}) {
  const keys = [];
  if (typeof detail.storageKey === 'string') keys.push(detail.storageKey);
  if (typeof detail.stateKey === 'string') keys.push(detail.stateKey);
  if (Array.isArray(detail.storageKeys)) {
    for (const key of detail.storageKeys) if (typeof key === 'string') keys.push(key);
  }
  if (Array.isArray(detail.stateKeys)) {
    for (const key of detail.stateKeys) if (typeof key === 'string') keys.push(key);
  }
  return keys;
}

function keyMatchesTarget(key, target) {
  if (!key || !target) return false;
  return key === target || key.startsWith(`${target}.`) || target.startsWith(`${key}.`);
}

function appearanceEventTargetsEntry(detail = {}, entryKey = '', storagePath = '') {
  const eventName = typeof detail.name === 'string' ? detail.name : '';
  const eventPath = LEGACY_APPEARANCE_PATHS[eventName] ?? '';
  const targetPath = storagePath || LEGACY_APPEARANCE_PATHS[entryKey] || '';
  if (eventName && (eventName === entryKey || (eventPath && keyMatchesTarget(eventPath, targetPath)))) return true;
  const keys = collectStateKeys(detail);
  if (!keys.length) return false;
  const behaviorPath = entryKey ? `behaviors.appearance.${entryKey}` : '';
  return keys.some((key) => (
    keyMatchesTarget(key, targetPath)
    || keyMatchesTarget(key, behaviorPath)
  ));
}

const APPEARANCE_CONTROL_LABELS = Object.freeze({
  edgeAdaptiveQuality: 'Adaptive Edge Quality',
  edgeAdaptiveQualityEnabled: 'Adaptive Edges',
  edgeAdaptiveQualitySlowFrameThresholdMs: 'Slow Frame Threshold',
  edgeAdaptiveQualitySlowFrameConsecutiveFrames: 'Averaging Frames',
  edgeAdaptiveQualityProbeIntervalMs: 'Probe Interval',
  edgeAdaptiveQualityInteractionHoldMs: 'Interaction Hold',
  edgeAdaptiveQualityFastDuringCamera: 'Fast During Camera',
  edgeAdaptiveQualityFastDuringLayout: 'Fast During Layout',
  shadedEnabled: 'Shaded',
  shadedNodes: 'Nodes',
  shadedEdges: 'Edges',
  shadedLightDirection: 'Light Direction',
  shadedLightDirectionX: 'Light X',
  shadedLightDirectionY: 'Light Y',
  shadedLightDirectionZ: 'Light Z',
  shadedLightColor: 'Light Color',
  shadedAmbientTopColor: 'Ambient Top',
  shadedAmbientBottomColor: 'Ambient Bottom',
  shadedDiffuseStrength: 'Diffuse',
  shadedAmbientStrength: 'Ambient',
  shadedSpecularColor: 'Specular Color',
  shadedSpecularStrength: 'Specular',
  shadedShininess: 'Shininess',
  ambientOcclusionEnabled: 'Ambient Occlusion',
  ambientOcclusionNodes: 'Nodes',
  ambientOcclusionEdges: 'Edges',
  ambientOcclusionStrength: 'Strength',
  ambientOcclusionRadius: 'Radius',
  ambientOcclusionBias: 'Bias',
  ambientOcclusionMode: 'Mode',
  ambientOcclusionIntensityScale: 'Fast Scale',
  ambientOcclusionIntensityShift: 'Fast Shift',
  ambientOcclusionQuality: 'Quality',
  nodeSizeScale: 'Node Size Scale',
  nodeSizeBase: 'Node Size Base',
  nodeOpacityScale: 'Node Opacity Scale',
  nodeOpacityBase: 'Node Opacity Base',
  nodeOutlineWidthScale: 'Outline Width Scale',
  nodeOutlineWidthBase: 'Outline Width Base',
  semanticZoomExponent: 'Semantic Zoom Exp.',
  nodeBlendWithEdges: 'Blend Nodes',
  edgeWidthScale: 'Edge Width Scale',
  edgeWidthBase: 'Edge Width Base',
  edgeOpacityScale: 'Edge Opacity Scale',
  edgeOpacityBase: 'Edge Opacity Base',
  edgeEndpointTrim: 'Edge Endpoint Trim',
  edgeDepthWrite: 'Edge Depth Write',
  edgeFastRendering: 'Fast Edge Lines',
  edgeWidthClampToNodeDiameter: 'Clamp Edge Widths',
});

function fallbackControlLabel(value) {
  return String(value ?? '')
    .replace(/[_-]+/gu, ' ')
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/\b\w/gu, (match) => match.toUpperCase());
}

function appearanceControlLabel(key) {
  return APPEARANCE_CONTROL_LABELS[key] ?? fallbackControlLabel(key);
}

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (ArrayBuffer.isView(value)) return Array.from(value, (entry) => cloneSerializable(entry));
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function') continue;
    next[key] = cloneSerializable(entry);
  }
  return next;
}

function appearanceValueFromState(key, state = {}) {
  const nodeStyle = state.nodeStyle ?? {};
  const edgeStyle = state.edgeStyle ?? {};
  const adaptiveQuality = edgeStyle.adaptiveQuality ?? {};
  const shaded = state.shaded ?? {};
  const ambientOcclusion = state.ambientOcclusion ?? {};
  const values = {
    background: state.background,
    clearColor: state.background,
    edgeTransparencyMode: state.edgeTransparencyMode,
    supersampling: state.supersampling,
    nodeSizeScale: nodeStyle.sizeScale,
    nodeSizeBase: nodeStyle.sizeBase,
    nodeOpacityScale: nodeStyle.opacityScale,
    nodeOpacityBase: nodeStyle.opacityBase,
    nodeOutlineWidthScale: nodeStyle.outlineWidthScale,
    nodeOutlineWidthBase: nodeStyle.outlineWidthBase,
    semanticZoomExponent: nodeStyle.semanticZoomExponent,
    nodeBlendWithEdges: nodeStyle.blendWithEdges,
    edgeWidthScale: edgeStyle.widthScale,
    edgeWidthBase: edgeStyle.widthBase,
    edgeOpacityScale: edgeStyle.opacityScale,
    edgeOpacityBase: edgeStyle.opacityBase,
    edgeEndpointTrim: edgeStyle.endpointTrim,
    edgeWidthClampToNodeDiameter: edgeStyle.clampToNodeDiameter,
    edgeDepthWrite: edgeStyle.depthWrite,
    edgeFastRendering: edgeStyle.fastRendering,
    edgeAdaptiveQuality: edgeStyle.adaptiveQuality,
    edgeAdaptiveQualityEnabled: adaptiveQuality.enabled,
    edgeAdaptiveQualitySlowFrameThresholdMs: adaptiveQuality.slowFrameThresholdMs,
    edgeAdaptiveQualitySlowFrameConsecutiveFrames: adaptiveQuality.slowFrameConsecutiveFrames,
    edgeAdaptiveQualityProbeIntervalMs: adaptiveQuality.probeIntervalMs,
    edgeAdaptiveQualityInteractionHoldMs: adaptiveQuality.interactionHoldMs,
    edgeAdaptiveQualityFastDuringCamera: adaptiveQuality.fastDuringCamera,
    edgeAdaptiveQualityFastDuringLayout: adaptiveQuality.fastDuringLayout,
    shadedEnabled: shaded.enabled,
    shadedNodes: shaded.nodes,
    shadedEdges: shaded.edges,
    shadedLightDirection: shaded.lightDirection,
    shadedLightDirectionX: Array.isArray(shaded.lightDirection) ? shaded.lightDirection[0] : undefined,
    shadedLightDirectionY: Array.isArray(shaded.lightDirection) ? shaded.lightDirection[1] : undefined,
    shadedLightDirectionZ: Array.isArray(shaded.lightDirection) ? shaded.lightDirection[2] : undefined,
    shadedLightColor: shaded.lightColor,
    shadedAmbientTopColor: shaded.ambientTopColor,
    shadedAmbientBottomColor: shaded.ambientBottomColor,
    shadedDiffuseStrength: shaded.diffuseStrength,
    shadedAmbientStrength: shaded.ambientStrength,
    shadedSpecularColor: shaded.specularColor,
    shadedSpecularStrength: shaded.specularStrength,
    shadedShininess: shaded.shininess,
    ambientOcclusionEnabled: ambientOcclusion.enabled,
    ambientOcclusionNodes: ambientOcclusion.nodes,
    ambientOcclusionEdges: ambientOcclusion.edges,
    ambientOcclusionStrength: ambientOcclusion.strength,
    ambientOcclusionRadius: ambientOcclusion.radius,
    ambientOcclusionBias: ambientOcclusion.bias,
    ambientOcclusionMode: ambientOcclusion.mode,
    ambientOcclusionIntensityScale: ambientOcclusion.intensityScale,
    ambientOcclusionIntensityShift: ambientOcclusion.intensityShift,
    ambientOcclusionQuality: ambientOcclusion.quality,
  };
  return values[key];
}

function supportsAmbientOcclusion(helios) {
  const type = String(helios?.renderer?.device?.type ?? '').toLowerCase();
  return type === 'webgpu' || type === 'webgl2';
}

function normalizeAppearancePatch(options = {}) {
  const next = {};
  if (!options || typeof options !== 'object') return next;

  for (const name of ACCESSOR_NAMES) {
    if (Object.prototype.hasOwnProperty.call(options, name)) {
      next[name] = cloneSerializable(options[name]);
    }
  }

  if (Object.prototype.hasOwnProperty.call(options, 'background')) {
    next.background = cloneSerializable(options.background);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'clearColor') && !Object.prototype.hasOwnProperty.call(next, 'background')) {
    next.background = cloneSerializable(options.clearColor);
  }

  const nodeStyle = options.nodeStyle;
  if (nodeStyle && typeof nodeStyle === 'object') {
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'sizeScale')) next.nodeSizeScale = cloneSerializable(nodeStyle.sizeScale);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'sizeBase')) next.nodeSizeBase = cloneSerializable(nodeStyle.sizeBase);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'opacityScale')) next.nodeOpacityScale = cloneSerializable(nodeStyle.opacityScale);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'opacityBase')) next.nodeOpacityBase = cloneSerializable(nodeStyle.opacityBase);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'outlineWidthScale')) next.nodeOutlineWidthScale = cloneSerializable(nodeStyle.outlineWidthScale);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'outlineWidthBase')) next.nodeOutlineWidthBase = cloneSerializable(nodeStyle.outlineWidthBase);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'semanticZoomExponent')) next.semanticZoomExponent = cloneSerializable(nodeStyle.semanticZoomExponent);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'blendWithEdges')) next.nodeBlendWithEdges = nodeStyle.blendWithEdges === true;
  }

  const edgeStyle = options.edgeStyle;
  if (edgeStyle && typeof edgeStyle === 'object') {
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'widthScale')) next.edgeWidthScale = cloneSerializable(edgeStyle.widthScale);
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'widthBase')) next.edgeWidthBase = cloneSerializable(edgeStyle.widthBase);
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'opacityScale')) next.edgeOpacityScale = cloneSerializable(edgeStyle.opacityScale);
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'opacityBase')) next.edgeOpacityBase = cloneSerializable(edgeStyle.opacityBase);
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'endpointTrim')) next.edgeEndpointTrim = cloneSerializable(edgeStyle.endpointTrim);
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'fastRendering')) next.edgeFastRendering = edgeStyle.fastRendering === true;
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'depthWrite')) next.edgeDepthWrite = edgeStyle.depthWrite === true;
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'clampToNodeDiameter')) {
      next.edgeWidthClampToNodeDiameter = edgeStyle.clampToNodeDiameter !== false;
    }
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'adaptiveQuality')) {
      next.edgeAdaptiveQuality = cloneSerializable(edgeStyle.adaptiveQuality);
    }
  }

  const shaded = options.shaded;
  if (shaded && typeof shaded === 'object') {
    if (Object.prototype.hasOwnProperty.call(shaded, 'enabled')) next.shadedEnabled = shaded.enabled === true;
    if (Object.prototype.hasOwnProperty.call(shaded, 'nodes')) next.shadedNodes = shaded.nodes !== false;
    if (Object.prototype.hasOwnProperty.call(shaded, 'edges')) next.shadedEdges = shaded.edges === true;
    if (Object.prototype.hasOwnProperty.call(shaded, 'lightDirection')) next.shadedLightDirection = cloneSerializable(shaded.lightDirection);
    if (Object.prototype.hasOwnProperty.call(shaded, 'lightColor')) next.shadedLightColor = cloneSerializable(shaded.lightColor);
    if (Object.prototype.hasOwnProperty.call(shaded, 'ambientTopColor')) next.shadedAmbientTopColor = cloneSerializable(shaded.ambientTopColor);
    if (Object.prototype.hasOwnProperty.call(shaded, 'ambientBottomColor')) next.shadedAmbientBottomColor = cloneSerializable(shaded.ambientBottomColor);
    if (Object.prototype.hasOwnProperty.call(shaded, 'diffuseStrength')) next.shadedDiffuseStrength = cloneSerializable(shaded.diffuseStrength);
    if (Object.prototype.hasOwnProperty.call(shaded, 'ambientStrength')) next.shadedAmbientStrength = cloneSerializable(shaded.ambientStrength);
    if (Object.prototype.hasOwnProperty.call(shaded, 'specularColor')) next.shadedSpecularColor = cloneSerializable(shaded.specularColor);
    if (Object.prototype.hasOwnProperty.call(shaded, 'specularStrength')) next.shadedSpecularStrength = cloneSerializable(shaded.specularStrength);
    if (Object.prototype.hasOwnProperty.call(shaded, 'shininess')) next.shadedShininess = cloneSerializable(shaded.shininess);
  }

  const ambientOcclusion = options.ambientOcclusion;
  if (ambientOcclusion && typeof ambientOcclusion === 'object') {
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'enabled')) next.ambientOcclusionEnabled = ambientOcclusion.enabled === true;
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'nodes')) next.ambientOcclusionNodes = ambientOcclusion.nodes !== false;
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'edges')) next.ambientOcclusionEdges = ambientOcclusion.edges === true;
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'strength')) next.ambientOcclusionStrength = cloneSerializable(ambientOcclusion.strength);
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'radius')) next.ambientOcclusionRadius = cloneSerializable(ambientOcclusion.radius);
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'bias')) next.ambientOcclusionBias = cloneSerializable(ambientOcclusion.bias);
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'mode')) next.ambientOcclusionMode = cloneSerializable(ambientOcclusion.mode);
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'intensityScale')) next.ambientOcclusionIntensityScale = cloneSerializable(ambientOcclusion.intensityScale);
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'intensityShift')) next.ambientOcclusionIntensityShift = cloneSerializable(ambientOcclusion.intensityShift);
    if (Object.prototype.hasOwnProperty.call(ambientOcclusion, 'quality')) next.ambientOcclusionQuality = cloneSerializable(ambientOcclusion.quality);
  }

  return next;
}

function buildAppearanceSnapshot(helios, fallback = {}) {
  const read = (name, defaultValue = undefined) => {
    if (typeof helios?.[name] === 'function') {
      const value = helios[name]();
      if (value !== undefined && (value !== null || defaultValue == null)) {
        return cloneSerializable(value);
      }
    }
    if (Object.prototype.hasOwnProperty.call(fallback, name)) {
      const value = fallback[name];
      if (value !== undefined && (value !== null || defaultValue == null)) {
        return cloneSerializable(value);
      }
    }
    return defaultValue;
  };

  return {
    background: read('background', null),
    edgeTransparencyMode: read('edgeTransparencyMode', 'weighted'),
    supersampling: read('supersampling', 'auto'),
    nodeStyle: {
      sizeScale: read('nodeSizeScale', 1),
      sizeBase: read('nodeSizeBase', 0),
      opacityScale: read('nodeOpacityScale', 1),
      opacityBase: read('nodeOpacityBase', 0),
      outlineWidthScale: read('nodeOutlineWidthScale', 1),
      outlineWidthBase: read('nodeOutlineWidthBase', 0),
      semanticZoomExponent: read('semanticZoomExponent', 0),
      blendWithEdges: read('nodeBlendWithEdges', false),
    },
    edgeStyle: {
      widthScale: read('edgeWidthScale', 1),
      widthBase: read('edgeWidthBase', 0),
      opacityScale: read('edgeOpacityScale', 1),
      opacityBase: read('edgeOpacityBase', 0),
      endpointTrim: read('edgeEndpointTrim', 0.8),
      clampToNodeDiameter: read('edgeWidthClampToNodeDiameter', true),
      depthWrite: read('edgeDepthWrite', false),
      fastRendering: read('edgeFastRendering', false),
      adaptiveQuality: read('edgeAdaptiveQuality', null),
    },
    shaded: {
      enabled: read('shadedEnabled', false),
      nodes: read('shadedNodes', true),
      edges: read('shadedEdges', false),
      lightDirection: read('shadedLightDirection', null),
      lightColor: read('shadedLightColor', null),
      ambientTopColor: read('shadedAmbientTopColor', null),
      ambientBottomColor: read('shadedAmbientBottomColor', null),
      diffuseStrength: read('shadedDiffuseStrength', null),
      ambientStrength: read('shadedAmbientStrength', null),
      specularColor: read('shadedSpecularColor', null),
      specularStrength: read('shadedSpecularStrength', null),
      shininess: read('shadedShininess', null),
    },
    ambientOcclusion: {
      supported: supportsAmbientOcclusion(helios),
      enabled: read('ambientOcclusionEnabled', false),
      nodes: read('ambientOcclusionNodes', true),
      edges: read('ambientOcclusionEdges', false),
      strength: read('ambientOcclusionStrength', null),
      radius: read('ambientOcclusionRadius', null),
      bias: read('ambientOcclusionBias', null),
      mode: read('ambientOcclusionMode', null),
      intensityScale: read('ambientOcclusionIntensityScale', null),
      intensityShift: read('ambientOcclusionIntensityShift', null),
      quality: read('ambientOcclusionQuality', null),
    },
  };
}

/**
 * Built-in behavior for global visual appearance and render quality.
 *
 * @public
 * @param {object} [options] - Background, node/edge scale and opacity,
 * shading, ambient occlusion, and adaptive edge quality options.
 * @returns {AppearanceBehavior} Behavior that keeps appearance settings
 * serializable and synchronized with UI bindings.
 * @remarks Renderer capability affects some appearance options. Query
 * `supportsAmbientOcclusion()` after `await helios.ready` before exposing
 * ambient-occlusion controls.
 */
export class AppearanceBehavior extends Behavior {
  static id = 'appearance';

  constructor(options = {}) {
    super(options);
    this._pendingPatch = normalizeAppearancePatch(options);
    this._muteSourceEvents = 0;
    this.state = buildAppearanceSnapshot(null, this._pendingPatch);
  }

  attach(context) {
    super.attach(context);
    this.addCleanup(this.context.subscribe(this.context?.helios, 'ui:binding-change', (event) => {
      const name = String(event?.detail?.name ?? '');
      if (this._muteSourceEvents > 0 || !SOURCE_EVENT_NAMES.has(name)) return;
      const storageKey = LEGACY_APPEARANCE_PATHS[name] ?? null;
      this.emitChange('binding-change', {
        name,
        value: cloneSerializable(event?.detail?.value),
        source: event?.detail?.source,
        trackOverride: event?.detail?.trackOverride === true,
        storageKeys: storageKey ? [storageKey] : [],
      });
    }));
    if (Object.keys(this._pendingPatch).length > 0) {
      this._applyPatch(this._pendingPatch, { silent: true });
    }
    this.emitChange('attach', { source: 'default', trackOverride: false });
    return this;
  }

  update(options = {}) {
    super.update(options);
    const patch = normalizeAppearancePatch(options);
    if (!Object.keys(patch).length) return this;
    this._pendingPatch = { ...this._pendingPatch, ...patch };
    this._applyPatch(patch, { silent: true });
    this.emitChange('options', { source: 'default', trackOverride: false });
    return this;
  }

  serialize() {
    return {
      options: this.getPublicState(),
    };
  }

  stateEntries() {
    const subscribeForEntry = (entryKey, storagePath) => (notify) => this.on('change', (event) => {
      const detail = event?.detail ?? event ?? {};
      if (!appearanceEventTargetsEntry(detail, entryKey, storagePath)) return;
      notify(undefined, detail);
    });
    const state = this.getPublicState();
    const inferType = (value) => {
      if (Array.isArray(value)) return 'array';
      if (typeof value === 'boolean') return 'boolean';
      if (typeof value === 'number') return 'number';
      if (typeof value === 'string') return 'string';
      return 'object';
    };
    const accessorEntry = (key) => {
      const publicState = this.getPublicState();
      const fallbackValue = appearanceValueFromState(key, publicState);
      const rawValue = typeof this[key] === 'function'
        ? this[key]()
        : fallbackValue;
      const value = rawValue !== undefined && rawValue !== null ? rawValue : fallbackValue;
      return {
        description: `Appearance ${key} setting.`,
        default: cloneSerializable(value),
        type: inferType(value),
        scope: 'workspace',
        aliases: LEGACY_APPEARANCE_PATHS[key] ? [LEGACY_APPEARANCE_PATHS[key]] : [],
        ui: { label: appearanceControlLabel(key), controller: inferType(value) === 'boolean' ? 'toggle' : 'auto' },
        getter: () => (typeof this[key] === 'function'
          ? cloneSerializable(this[key]() ?? appearanceValueFromState(key, this.getPublicState()))
          : cloneSerializable(appearanceValueFromState(key, this.getPublicState()))),
        setter: (nextValue) => this._applyStateEntryValue(key, nextValue),
        subscribe: subscribeForEntry(key, LEGACY_APPEARANCE_PATHS[key]),
      };
    };
    const groupedEntry = (key, label) => ({
      description: `Appearance ${label.toLowerCase()} settings.`,
      default: cloneSerializable(state[key]),
      type: 'object',
      scope: 'workspace',
      aliases: [`appearance.${key}`],
      ui: { label, controller: 'object' },
      getter: () => cloneSerializable(this.getPublicState()[key]),
      setter: (value) => this.update({ [key]: value }),
      subscribe: subscribeForEntry(key, `appearance.${key}`),
    });
    return {
      state: {
        description: 'Serializable appearance behavior state.',
        default: this.serialize(),
        type: 'object',
        scope: 'workspace',
        aliases: ['appearance.state'],
        getter: () => this.serialize(),
        setter: (value) => this.restore(value),
        subscribe: () => () => {},
      },
      background: {
        description: 'Scene background color.',
        default: cloneSerializable(state.background),
        type: 'array',
        scope: 'workspace',
        aliases: ['appearance.background'],
        ui: { label: 'Background', controller: 'color' },
        getter: () => cloneSerializable(this.getPublicState().background),
        setter: (value) => this._applyStateEntryValue('background', value),
        subscribe: subscribeForEntry('background', 'appearance.background'),
      },
      edgeTransparencyMode: {
        description: 'Edge transparency mode.',
        default: state.edgeTransparencyMode,
        type: 'string',
        scope: 'workspace',
        aliases: ['appearance.edgeTransparencyMode'],
        ui: {
          label: 'Edge Transparency',
          controller: 'select',
          options: ['weighted', 'alpha', 'max'],
        },
        getter: () => this.getPublicState().edgeTransparencyMode,
        setter: (value) => this._applyStateEntryValue('edgeTransparencyMode', value),
        subscribe: subscribeForEntry('edgeTransparencyMode', 'appearance.edgeTransparencyMode'),
      },
      supersampling: {
        description: 'Supersampling quality setting.',
        default: state.supersampling,
        type: 'string',
        scope: 'workspace',
        aliases: ['appearance.supersampling'],
        ui: {
          label: 'Supersampling',
          controller: 'select',
          options: ['auto', 'off', 'on'],
        },
        getter: () => this.getPublicState().supersampling,
        setter: (value) => this._applyStateEntryValue('supersampling', value),
        subscribe: subscribeForEntry('supersampling', 'appearance.supersampling'),
      },
      nodeStyle: groupedEntry('nodeStyle', 'Node Style'),
      edgeStyle: groupedEntry('edgeStyle', 'Edge Style'),
      shaded: groupedEntry('shaded', 'Shading'),
      ambientOcclusion: groupedEntry('ambientOcclusion', 'Ambient Occlusion'),
      ...Object.fromEntries(ACCESSOR_NAMES
        .filter((key) => !['background', 'edgeTransparencyMode', 'supersampling'].includes(key))
        .map((key) => [key, accessorEntry(key)])),
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    this.update(options);
    this.emitChange('restore', { source: 'restore', trackOverride: false });
    return this;
  }

  appearance(options) {
    if (arguments.length === 0) return this.getPublicState();
    return this.update(options);
  }

  supportsAmbientOcclusion() {
    return supportsAmbientOcclusion(this.context?.helios ?? null);
  }

  getPublicState() {
    return buildAppearanceSnapshot(this.context?.helios ?? null, this._pendingPatch);
  }

  emitChange(reason, detail = {}) {
    this.state = this.getPublicState();
    this.emit('change', { reason, state: this.state, ...detail });
    return this;
  }

  _applyPatch(patch = {}, { silent = false } = {}) {
    const helios = this.context?.helios ?? null;
    if (!helios) {
      this.state = buildAppearanceSnapshot(null, { ...this._pendingPatch, ...patch });
      return this;
    }
    this._muteSourceEvents += 1;
    try {
      for (const [name, value] of Object.entries(patch)) {
        const accessor = name === 'background' ? 'background' : name;
        if (!ACCESSOR_NAME_SET.has(accessor) && accessor !== 'background') continue;
        if (typeof helios?.[accessor] !== 'function') continue;
        helios[accessor](cloneSerializable(value));
      }
    } finally {
      this._muteSourceEvents = Math.max(0, this._muteSourceEvents - 1);
    }
    this.state = this.getPublicState();
    if (!silent) this.emitChange('apply');
    return this;
  }

  _applyStateEntryValue(key, value) {
    const patch = normalizeAppearancePatch({ [key]: value });
    if (!Object.keys(patch).length) return this;
    this._pendingPatch = { ...this._pendingPatch, ...patch };
    const helios = this.context?.helios ?? null;
    if (!helios) {
      this.state = buildAppearanceSnapshot(null, this._pendingPatch);
      return this;
    }
    this._muteSourceEvents += 1;
    helios._suppressStateBindingUiEvent = (helios._suppressStateBindingUiEvent ?? 0) + 1;
    try {
      for (const [name, nextValue] of Object.entries(patch)) {
        const accessor = name === 'background' ? 'background' : name;
        if (!ACCESSOR_NAME_SET.has(accessor) && accessor !== 'background') continue;
        if (typeof helios?.[accessor] !== 'function') continue;
        helios[accessor](nextValue);
      }
    } finally {
      helios._suppressStateBindingUiEvent = Math.max(0, (helios._suppressStateBindingUiEvent ?? 1) - 1);
      this._muteSourceEvents = Math.max(0, this._muteSourceEvents - 1);
    }
    return this;
  }
}

for (const accessorName of ACCESSOR_NAMES) {
  AppearanceBehavior.prototype[accessorName] = function accessor(value) {
    const helios = this.context?.helios ?? null;
    if (arguments.length === 0) {
      if (typeof helios?.[accessorName] === 'function') {
        return cloneSerializable(helios[accessorName]());
      }
      return cloneSerializable(this._pendingPatch[accessorName]);
    }

    if (!helios || typeof helios?.[accessorName] !== 'function') {
      this._pendingPatch[accessorName] = cloneSerializable(value);
      this.emitChange('local-update', {
        name: accessorName,
        source: 'program',
        trackOverride: true,
        storageKeys: [LEGACY_APPEARANCE_PATHS[accessorName]].filter(Boolean),
      });
      return this;
    }

    this._muteSourceEvents += 1;
    try {
      helios[accessorName](cloneSerializable(value));
    } finally {
      this._muteSourceEvents = Math.max(0, this._muteSourceEvents - 1);
    }
    this.emitChange('command', {
      name: accessorName,
      source: 'program',
      trackOverride: true,
      storageKeys: [LEGACY_APPEARANCE_PATHS[accessorName]].filter(Boolean),
    });
    return this;
  };
}

AppearanceBehavior.prototype.clearColor = function clearColor(value) {
  if (arguments.length === 0) return this.background();
  return this.background(value);
};

export default AppearanceBehavior;
