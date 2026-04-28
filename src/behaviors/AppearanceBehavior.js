import { Behavior } from './Behavior.js';

const ACCESSOR_NAMES = Object.freeze([
  'background',
  'clearColor',
  'edgeTransparencyMode',
  'nodeSizeScale',
  'nodeOpacityScale',
  'nodeOutlineWidthScale',
  'edgeWidthScale',
  'edgeOpacityScale',
  'nodeBlendWithEdges',
  'edgeWidthClampToNodeDiameter',
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
]);

const ACCESSOR_NAME_SET = new Set(ACCESSOR_NAMES);
const SOURCE_EVENT_NAMES = new Set([
  'clearColor',
  ...ACCESSOR_NAMES,
]);

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
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'opacityScale')) next.nodeOpacityScale = cloneSerializable(nodeStyle.opacityScale);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'outlineWidthScale')) next.nodeOutlineWidthScale = cloneSerializable(nodeStyle.outlineWidthScale);
    if (Object.prototype.hasOwnProperty.call(nodeStyle, 'blendWithEdges')) next.nodeBlendWithEdges = nodeStyle.blendWithEdges === true;
  }

  const edgeStyle = options.edgeStyle;
  if (edgeStyle && typeof edgeStyle === 'object') {
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'widthScale')) next.edgeWidthScale = cloneSerializable(edgeStyle.widthScale);
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'opacityScale')) next.edgeOpacityScale = cloneSerializable(edgeStyle.opacityScale);
    if (Object.prototype.hasOwnProperty.call(edgeStyle, 'fastRendering')) next.edgeFastRendering = edgeStyle.fastRendering === true;
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
      return cloneSerializable(helios[name]());
    }
    if (Object.prototype.hasOwnProperty.call(fallback, name)) {
      return cloneSerializable(fallback[name]);
    }
    return defaultValue;
  };

  return {
    background: read('background', null),
    edgeTransparencyMode: read('edgeTransparencyMode', 'weighted'),
    nodeStyle: {
      sizeScale: read('nodeSizeScale', 1),
      opacityScale: read('nodeOpacityScale', 1),
      outlineWidthScale: read('nodeOutlineWidthScale', 1),
      blendWithEdges: read('nodeBlendWithEdges', false),
    },
    edgeStyle: {
      widthScale: read('edgeWidthScale', 1),
      opacityScale: read('edgeOpacityScale', 1),
      clampToNodeDiameter: read('edgeWidthClampToNodeDiameter', true),
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
      this.emitChange('binding-change', {
        name,
        value: cloneSerializable(event?.detail?.value),
      });
    }));
    if (Object.keys(this._pendingPatch).length > 0) {
      this._applyPatch(this._pendingPatch, { silent: true });
    }
    this.emitChange('attach');
    return this;
  }

  update(options = {}) {
    super.update(options);
    const patch = normalizeAppearancePatch(options);
    if (!Object.keys(patch).length) return this;
    this._pendingPatch = { ...this._pendingPatch, ...patch };
    this._applyPatch(patch, { silent: true });
    this.emitChange('options');
    return this;
  }

  serialize() {
    return {
      options: this.getPublicState(),
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    this.update(options);
    this.emitChange('restore');
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
      this.emitChange('local-update', { name: accessorName });
      return this;
    }

    this._muteSourceEvents += 1;
    try {
      helios[accessorName](cloneSerializable(value));
    } finally {
      this._muteSourceEvents = Math.max(0, this._muteSourceEvents - 1);
    }
    this.emitChange('command', { name: accessorName });
    return this;
  };
}

AppearanceBehavior.prototype.clearColor = function clearColor(value) {
  if (arguments.length === 0) return this.background();
  return this.background(value);
};

export default AppearanceBehavior;
