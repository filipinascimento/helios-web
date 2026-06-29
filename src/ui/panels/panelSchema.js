function normalizeKey(key) {
  return String(key ?? '').trim();
}

function normalizeLabel(label) {
  const value = String(label ?? '').trim();
  return value || null;
}

const LABEL_ACRONYMS = Object.freeze({
  ao: 'AO',
  api: 'API',
  gpu: 'GPU',
  id: 'ID',
  ms: 'ms',
  rgb: 'RGB',
  rgba: 'RGBA',
  ssao: 'SSAO',
  ui: 'UI',
  umap: 'UMAP',
  url: 'URL',
  wasm: 'WASM',
  webgl: 'WebGL',
  webgpu: 'WebGPU',
});

/**
 * Convert a state key or control identifier into a display label.
 *
 * @public
 * @param {string} value - State key, control id, or raw label value.
 * @returns {string} Human-readable control label.
 */
export function humanizeControlLabel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const leaf = raw
    .split('.')
    .map((part) => part.trim())
    .filter((part) => part && !/^\d+$/u.test(part))
    .pop() ?? raw;
  const spaced = leaf
    .replace(/[_-]+/gu, ' ')
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/gu, '$1 $2')
    .replace(/\s+/gu, ' ')
    .trim();
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (LABEL_ACRONYMS[lower]) return LABEL_ACRONYMS[lower];
      return `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`;
    })
    .join(' ');
}

function itemKey(item) {
  if (typeof item === 'string') {
    const key = normalizeKey(item);
    return key || null;
  }
  if (!item || typeof item !== 'object') return null;
  if (typeof item.key === 'string') {
    const key = normalizeKey(item.key);
    return key || null;
  }
  if (typeof item.keyPrefix === 'string') {
    const key = normalizeKey(item.keyPrefix);
    return key || null;
  }
  return null;
}

function collectItemKeys(item, keys = []) {
  const key = itemKey(item);
  if (key) keys.push(key);
  if (!item || typeof item !== 'object') return keys;
  for (const child of item.items ?? []) collectItemKeys(child, keys);
  return keys;
}

/**
 * Resolve the display label for a panel schema item.
 *
 * @public
 * @param {string|object} item - Panel schema item descriptor.
 * @param {HeliosStateManager|null} [stateManager] - Optional state manager for state entry labels.
 * @returns {string} Display label for the item.
 */
export function resolvePanelItemLabel(item, stateManager = null) {
  const itemLabel = normalizeLabel(typeof item === 'object' && item ? item.label : null);
  if (itemLabel) return itemLabel;
  const key = itemKey(item);
  if (key && typeof stateManager?.entry === 'function') {
    const entryLabel = normalizeLabel(stateManager.entry(key)?.ui?.label);
    if (entryLabel) return entryLabel;
  }
  const fallback = key
    ?? (typeof item === 'object' && item ? (item.id ?? item.type) : item);
  return humanizeControlLabel(fallback);
}

/**
 * Normalize a panel schema into the canonical shape used by Helios UI panels.
 *
 * @public
 * @param {object} [schema] - Partial panel schema.
 * @returns {object} Normalized panel schema.
 */
export function normalizePanelSchema(schema = {}) {
  const sections = Array.isArray(schema.sections) ? schema.sections : [];
  return {
    id: normalizeKey(schema.id),
    title: typeof schema.title === 'string' ? schema.title : normalizeKey(schema.id),
    dock: schema.dock ?? null,
    sections: sections.map((section) => ({
      id: normalizeKey(section?.id),
      title: typeof section?.title === 'string' ? section.title : normalizeKey(section?.id),
      items: Array.isArray(section?.items) ? section.items.slice() : [],
    })),
  };
}

/**
 * Return all state keys referenced by a panel schema.
 *
 * @public
 * @param {object} [schema] - Panel schema to inspect.
 * @returns {string[]} Unique state keys referenced by the schema.
 */
export function panelSchemaKeys(schema = {}) {
  const normalized = normalizePanelSchema(schema);
  const keys = [];
  for (const section of normalized.sections) {
    for (const item of section.items) collectItemKeys(item, keys);
  }
  return Array.from(new Set(keys));
}

/**
 * Compute the dirty status for a full panel schema.
 *
 * @public
 * @param {object} [schema] - Panel schema to inspect.
 * @param {HeliosStateManager|null} [stateManager] - State manager that tracks override status.
 * @returns {object} Panel-level and section-level status values.
 */
export function panelSchemaStatus(schema = {}, stateManager = null) {
  const normalized = normalizePanelSchema(schema);
  const sectionStatuses = {};
  let changedSections = 0;
  let partialSections = 0;
  let populatedSections = 0;
  for (const section of normalized.sections) {
    const keys = [];
    for (const item of section.items) collectItemKeys(item, keys);
    if (!keys.length) {
      sectionStatuses[section.id] = 'default';
      continue;
    }
    populatedSections += 1;
    const changed = keys.filter((key) => (stateManager?.status?.(key)?.state ?? 'default') !== 'default').length;
    const state = changed <= 0 ? 'default' : (changed === keys.length ? 'changed' : 'partial');
    sectionStatuses[section.id] = state;
    if (state !== 'default') changedSections += 1;
    if (state === 'partial') partialSections += 1;
  }
  const panelState = changedSections <= 0
    ? 'default'
    : (partialSections <= 0 && changedSections === populatedSections ? 'changed' : 'partial');
  return {
    panel: panelState,
    sections: sectionStatuses,
  };
}

/**
 * Return all state keys referenced by one panel schema section.
 *
 * @public
 * @param {object} [schema] - Panel schema to inspect.
 * @param {string} [sectionId] - Section id to inspect.
 * @returns {string[]} Unique state keys referenced by the section.
 */
export function panelSchemaSectionKeys(schema = {}, sectionId = '') {
  const normalized = normalizePanelSchema(schema);
  const id = normalizeKey(sectionId);
  const section = normalized.sections.find((entry) => entry.id === id);
  if (!section) return [];
  const keys = [];
  for (const item of section.items) collectItemKeys(item, keys);
  return Array.from(new Set(keys));
}

/**
 * Compute the dirty status for one panel schema section.
 *
 * @public
 * @param {object} [schema] - Panel schema to inspect.
 * @param {string} [sectionId] - Section id to inspect.
 * @param {HeliosStateManager|null} [stateManager] - State manager that tracks override status.
 * @returns {string} Section status: `default`, `partial`, or `changed`.
 */
export function panelSchemaSectionStatus(schema = {}, sectionId = '', stateManager = null) {
  const statuses = panelSchemaStatus(schema, stateManager);
  const id = normalizeKey(sectionId);
  return statuses.sections[id] ?? 'default';
}

/**
 * Create a DOM indicator that reflects dirty status for a panel schema.
 *
 * @public
 * @param {object} [options] - Indicator options.
 * @param {Helios} [options.helios] - Helios instance whose state manager is observed.
 * @param {object} [options.schema] - Panel schema to observe.
 * @param {string|null} [options.sectionId] - Optional section id to observe.
 * @param {Function|null} [options.attachTooltip] - Optional tooltip hook.
 * @returns {HTMLElement} Indicator element with a `destroy()` cleanup method.
 */
export function createPanelSchemaIndicator({
  helios,
  schema,
  sectionId = null,
  attachTooltip = null,
} = {}) {
  const indicator = document.createElement('span');
  indicator.className = 'helios-ui-dirty-indicator helios-ui-dirty-indicator--schema';
  indicator.dataset.state = 'default';
  indicator.dataset.schema = normalizePanelSchema(schema).id;
  indicator.setAttribute('aria-label', 'Persistence status');
  indicator.setAttribute('aria-hidden', 'true');
  if (sectionId != null) indicator.dataset.section = normalizeKey(sectionId);

  const update = () => {
    const stateManager = helios?.states ?? null;
    let nextState = 'default';
    if (sectionId != null) {
      nextState = panelSchemaSectionStatus(schema, sectionId, stateManager);
    } else {
      nextState = panelSchemaStatus(schema, stateManager).panel;
    }
    if (indicator.dataset.state !== nextState) indicator.dataset.state = nextState;
  };
  const onChange = () => update();
  const stateManager = helios?.states ?? null;
  const schemaKeys = sectionId != null
    ? panelSchemaSectionKeys(schema, sectionId)
    : panelSchemaKeys(schema);
  const stateUnsubscribers = typeof stateManager?.subscribe === 'function'
    ? schemaKeys.map((key) => stateManager.subscribe(key, onChange, { immediate: false }))
    : [];
  if (!stateUnsubscribers.length) stateManager?.addEventListener?.('change', onChange);
  stateManager?.addEventListener?.('config', onChange);
  indicator.destroy = () => {
    for (const unsubscribe of stateUnsubscribers) unsubscribe?.();
    if (!stateUnsubscribers.length) stateManager?.removeEventListener?.('change', onChange);
    stateManager?.removeEventListener?.('config', onChange);
  };
  attachTooltip?.(indicator, 'Shows whether this panel has session overrides.');
  update();
  return indicator;
}

/**
 * Built-in state schema for the Scene panel.
 *
 * @public
 */
export const SCENE_PANEL_SCHEMA = Object.freeze({
  id: 'scene',
  title: 'Scene',
  dock: 'left',
  sections: [
    {
      id: 'appearance',
      title: 'Appearance',
      items: [
        'ui.theme',
        'scene.dimension',
        'appearance.background',
        'appearance.edgeTransparencyMode',
        'appearance.nodeStyle.sizeScale',
        'appearance.nodeStyle.opacityScale',
        'appearance.nodeStyle.outlineWidthScale',
        'appearance.edgeStyle.widthScale',
        'appearance.edgeStyle.opacityScale',
        'appearance.edgeStyle.fastRendering',
        { key: 'appearance.edgeStyle.adaptiveQuality.enabled', label: 'Adaptive Edges' },
        { key: 'appearance.edgeStyle.adaptiveQuality.slowFrameThresholdMs', label: 'Slow Frame Threshold' },
        { key: 'appearance.edgeStyle.adaptiveQuality.slowFrameConsecutiveFrames', label: 'Averaging Frames' },
        { key: 'appearance.edgeStyle.adaptiveQuality.probeIntervalMs', label: 'Probe Interval' },
        { key: 'appearance.edgeStyle.adaptiveQuality.interactionHoldMs', label: 'Interaction Hold' },
        { key: 'appearance.edgeStyle.adaptiveQuality.fastDuringCamera', label: 'Fast During Camera' },
        { key: 'appearance.edgeStyle.adaptiveQuality.fastDuringLayout', label: 'Fast During Layout' },
        { type: 'custom', id: 'node-mappers', keyPrefix: 'mappers.node' },
        { type: 'custom', id: 'edge-mappers', keyPrefix: 'mappers.edge' },
        'appearance.shaded.enabled',
        'appearance.shaded.nodes',
        'appearance.shaded.edges',
        'appearance.shaded.lightDirection',
        'appearance.shaded.lightColor',
        'appearance.shaded.ambientTopColor',
        'appearance.shaded.ambientBottomColor',
        'appearance.shaded.diffuseStrength',
        'appearance.shaded.ambientStrength',
        'appearance.shaded.specularColor',
        'appearance.shaded.specularStrength',
        'appearance.shaded.shininess',
        'appearance.ambientOcclusion.enabled',
        'appearance.ambientOcclusion.nodes',
        'appearance.ambientOcclusion.edges',
        'appearance.ambientOcclusion.strength',
        'appearance.ambientOcclusion.radius',
        'appearance.ambientOcclusion.bias',
        'appearance.ambientOcclusion.mode',
        'appearance.ambientOcclusion.intensityScale',
        'appearance.ambientOcclusion.intensityShift',
        'appearance.ambientOcclusion.quality',
      ],
    },
    {
      id: 'labels',
      title: 'Labels',
      items: [
        'labels.mode',
        'labels.enabled',
        'labels.selectedOnlySpaceAware',
        'labels.source',
        'labels.maxVisible',
        'labels.fontSizeScale',
        'labels.minScreenRadius',
        'labels.outlineWidth',
        'labels.offsetRadiusFactor',
        'labels.offsetPx',
        'labels.maxChars',
        'labels.maxRows',
        'labels.fill',
        'labels.outlineColor',
        'labels.fontFamily',
      ],
    },
    {
      id: 'advanced',
      title: 'Advanced',
      items: [
        'appearance.nodeStyle.sizeBase',
        'appearance.nodeStyle.semanticZoomExponent',
        'appearance.nodeStyle.opacityBase',
        'appearance.nodeStyle.outlineWidthBase',
        'appearance.edgeStyle.widthBase',
        'appearance.edgeStyle.opacityBase',
        'appearance.edgeStyle.endpointTrim',
        'appearance.supersampling',
        'appearance.nodeStyle.blendWithEdges',
        'appearance.edgeStyle.depthWrite',
        'appearance.edgeStyle.clampToNodeDiameter',
      ],
    },
  ],
});

/**
 * Built-in state schema for the Labels panel.
 *
 * @public
 */
export const LABELS_PANEL_SCHEMA = Object.freeze({
  id: 'labels',
  title: 'Labels',
  dock: 'right',
  sections: [
    {
      id: 'visibility',
      title: 'Visibility',
      items: [
        'labels.mode',
        'labels.enabled',
        'labels.selectedOnlySpaceAware',
        'labels.source',
      ],
    },
    {
      id: 'limits',
      title: 'Limits',
      items: [
        'labels.maxVisible',
        'labels.minScreenRadius',
        'labels.maxChars',
        'labels.maxRows',
      ],
    },
    {
      id: 'style',
      title: 'Style',
      items: [
        'labels.fontSizeScale',
        'labels.outlineWidth',
        'labels.offsetRadiusFactor',
        'labels.offsetPx',
        'labels.fill',
        'labels.outlineColor',
        'labels.fontFamily',
      ],
    },
  ],
});

/**
 * Built-in state schema for the Legends panel.
 *
 * @public
 */
export const LEGENDS_PANEL_SCHEMA = Object.freeze({
  id: 'legends',
  title: 'Legends',
  dock: 'right',
  sections: [
    {
      id: 'visibility',
      title: 'Visibility',
      items: [
        'legends.enabled',
        'legends.respectDockInsets',
        'legends.showNodeColor',
        'legends.showDensity',
        'legends.showEdgeColor',
        'legends.showNodeSize',
        'legends.showEdgeWidth',
      ],
    },
    {
      id: 'layout',
      title: 'Layout',
      items: [
        { key: 'legends.maxChars', inputMax: 512, suggested: [0, 64] },
        { key: 'legends.maxRows', inputMax: 8, suggested: [1, 8] },
        { key: 'legends.scale', inputMax: 3, suggested: [0.6, 3] },
        { key: 'legends.continuousHeight', inputMax: 320, suggested: [72, 320], step: 4 },
      ],
    },
    {
      id: 'custom',
      title: 'Custom',
      items: [
        { type: 'custom', id: 'legend-titles', keyPrefix: 'legends.titles' },
        { type: 'custom', id: 'legend-placements', keyPrefix: 'legends.placements' },
      ],
    },
  ],
});

/**
 * Built-in state schema for the Mappers panel.
 *
 * @public
 */
export const MAPPERS_PANEL_SCHEMA = Object.freeze({
  id: 'mappers',
  title: 'Mappers',
  dock: 'right',
  sections: [
    {
      id: 'nodes',
      title: 'Nodes',
      items: [
        { type: 'custom', id: 'node-mapper-editor', keyPrefix: 'mappers.node' },
        { key: 'mappers.node.color', label: 'Node Color' },
        { key: 'mappers.node.size', label: 'Node Size' },
        { key: 'mappers.node.opacity', label: 'Node Opacity' },
        { key: 'mappers.node.outline', label: 'Node Outline' },
        { key: 'mappers.node.outlineColor', label: 'Node Outline Color' },
        { key: 'mappers.node.position', label: 'Node Position' },
      ],
    },
    {
      id: 'edges',
      title: 'Edges',
      items: [
        { type: 'custom', id: 'edge-mapper-editor', keyPrefix: 'mappers.edge' },
        { key: 'mappers.edge.color', label: 'Edge Color' },
        { key: 'mappers.edge.width', label: 'Edge Width' },
        { key: 'mappers.edge.opacity', label: 'Edge Opacity' },
      ],
    },
  ],
});

/**
 * Built-in state schema for the Filters panel.
 *
 * @public
 */
export const FILTERS_PANEL_SCHEMA = Object.freeze({
  id: 'filters',
  title: 'Filters',
  dock: 'right',
  sections: [
    {
      id: 'nodes',
      title: 'Nodes',
      items: [
        { type: 'custom', id: 'node-filter-editor', keyPrefix: 'filters.rules' },
      ],
    },
    {
      id: 'edges',
      title: 'Edges',
      items: [
        { type: 'custom', id: 'edge-filter-editor', keyPrefix: 'filters.rules' },
      ],
    },
    {
      id: 'runtime',
      title: 'Runtime',
      items: [
        'filters.enabled',
        'filters.scope',
        'filters.rules',
        'filters.minComponentSize',
      ],
    },
  ],
});

/**
 * Built-in state schema for the Layout panel.
 *
 * @public
 */
export const LAYOUT_PANEL_SCHEMA = Object.freeze({
  id: 'layout',
  title: 'Layout',
  dock: 'right',
  sections: [
    {
      id: 'runtime',
      title: 'Runtime',
      items: [
        'layout.layoutType',
        'layout.running',
        'layout.pauseOnInteraction',
      ],
    },
    {
      id: 'parameters',
      title: 'Parameters',
      items: [
        { type: 'custom', id: 'layout-parameters', keyPrefix: 'layout.parameters' },
      ],
    },
  ],
});

/**
 * Built-in state schema for the Selection panel.
 *
 * @public
 */
export const SELECTION_PANEL_SCHEMA = Object.freeze({
  id: 'selection',
  title: 'Selection',
  dock: 'right',
  sections: [
    {
      id: 'current',
      title: 'Current',
      items: [
        'selection.selectedNodes',
        'selection.selectedEdges',
        'selection.savedSelectionAttribute',
      ],
    },
    {
      id: 'selectors',
      title: 'Selectors',
      items: [
        { type: 'custom', id: 'node-selector-editor', keyPrefix: 'selection.selectors' },
        'selection.selectors.node.rules',
      ],
    },
    {
      id: 'interaction',
      title: 'Interaction',
      items: [
        'selection.nodeClick',
        'selection.edgeClick',
        'selection.selectedConnectedEdges',
      ],
    },
    {
      id: 'style',
      title: 'Style',
      items: [
        'selection.otherSelectedNodeStyle',
        'selection.otherSelectedEdgeStyle',
        'selection.otherSelectedNodeTone',
        'selection.otherSelectedEdgeTone',
      ],
    },
  ],
});
