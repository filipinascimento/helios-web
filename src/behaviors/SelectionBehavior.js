import { AttributeType } from 'helios-network';
import { HeliosFilter } from '../filters/HeliosFilter.js';
import { Behavior } from './Behavior.js';
import {
  CURRENT_SELECTION_VALUE,
  DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
  DEFAULT_OTHER_SELECTED_EDGE_STYLE,
  DEFAULT_OTHER_SELECTED_NODE_STYLE,
  DEFAULT_SELECTION_FOCUS_MAX_ZOOM,
  DEFAULT_SELECTION_FOCUS_MIN_DISTANCE,
  DEFAULT_SELECTION_FOCUS_ZOOM_TOLERANCE,
  normalizeAutoBackgroundTone,
  normalizeEdgeStyle,
  normalizeNodeStyle,
  resolveBooleanAttributeNames,
} from './selectionShared.js';
import {
  applyOtherElementsState,
  applySelectedConnectedEdges,
  ensureInteractionStateStyleDefaults,
  syncPicking,
} from './interactionShared.js';

function sortedArray(values) {
  return Array.from(values ?? []).sort((a, b) => a - b);
}

function collectUniqueIndices(indices) {
  const next = [];
  const seen = new Set();
  for (const raw of indices ?? []) {
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || seen.has(index)) continue;
    seen.add(index);
    next.push(index);
  }
  return next;
}

function cloneRules(rules = []) {
  return Array.isArray(rules)
    ? rules.map((rule) => ({
      ...rule,
      values: Array.isArray(rule?.values) ? [...rule.values] : rule?.values,
    }))
    : [];
}

function selectionOptionStorageKeys(options = {}) {
  const keys = new Set();
  if (Object.prototype.hasOwnProperty.call(options, 'enableNodeSelection') || Object.prototype.hasOwnProperty.call(options, 'nodeClick')) {
    keys.add('selection.nodeClick');
  }
  if (Object.prototype.hasOwnProperty.call(options, 'enableEdgeSelection') || Object.prototype.hasOwnProperty.call(options, 'edgeClick')) {
    keys.add('selection.edgeClick');
  }
  for (const key of [
    'selectedConnectedEdges',
    'otherSelectedNodeStyle',
    'otherSelectedEdgeStyle',
    'otherSelectedNodeTone',
    'otherSelectedEdgeTone',
  ]) {
    if (Object.prototype.hasOwnProperty.call(options, key)) keys.add(`selection.${key}`);
  }
  return Array.from(keys);
}

function detailTargetsPath(detail = {}, path = '') {
  const keys = [];
  if (typeof detail.storageKey === 'string') keys.push(detail.storageKey);
  if (typeof detail.stateKey === 'string') keys.push(detail.stateKey);
  if (Array.isArray(detail.storageKeys)) {
    for (const key of detail.storageKeys) if (typeof key === 'string') keys.push(key);
  }
  if (Array.isArray(detail.stateKeys)) {
    for (const key of detail.stateKeys) if (typeof key === 'string') keys.push(key);
  }
  if (!keys.length) return false;
  return keys.some((key) => key === path || key.startsWith(`${path}.`) || path.startsWith(`${key}.`));
}

function createEntrySubscribe(behavior, path) {
  return (notify) => {
    if (typeof notify !== 'function') return () => {};
    return behavior.on('change', (event) => {
      const detail = event?.detail ?? event ?? {};
      if (!detailTargetsPath(detail, path)) return;
      notify(undefined, detail);
    });
  };
}

/**
 * Built-in behavior for node and edge selection state.
 *
 * @public
 * @param {object} [options] - Selection options such as `nodeClick`,
 * `edgeClick`, `selectedConnectedEdges`, saved-selection attribute names, and
 * inactive-item styling.
 * @returns {SelectionBehavior} Behavior that can be attached through
 * `helios.useBehavior('selection', options)`.
 * @remarks Selection state is serializable. The behavior also synchronizes
 * picking, labels, and optional connected-edge highlighting.
 * @example
 * helios.behavior.selection.selectNodes([0, 2, 4], { mode: 'replace' });
 */
export class SelectionBehavior extends Behavior {
  static id = 'selection';

  constructor(options = {}) {
    super(options);
    this.state = {
      nodeClick: true,
      edgeClick: false,
      selectedConnectedEdges: true,
      selectedNodes: new Set(),
      selectedEdges: new Set(),
      savedSelectionAttribute: CURRENT_SELECTION_VALUE,
      lastNamedSelectionAttribute: '',
      selectorRules: [],
      otherSelectedNodeStyle: normalizeNodeStyle(DEFAULT_OTHER_SELECTED_NODE_STYLE, DEFAULT_OTHER_SELECTED_NODE_STYLE),
      otherSelectedEdgeStyle: normalizeEdgeStyle(DEFAULT_OTHER_SELECTED_EDGE_STYLE, DEFAULT_OTHER_SELECTED_EDGE_STYLE),
      otherSelectedNodeTone: normalizeAutoBackgroundTone(DEFAULT_AUTO_BACKGROUND_TONE_SELECTED, DEFAULT_AUTO_BACKGROUND_TONE_SELECTED),
      otherSelectedEdgeTone: normalizeAutoBackgroundTone(DEFAULT_AUTO_BACKGROUND_TONE_SELECTED, DEFAULT_AUTO_BACKGROUND_TONE_SELECTED),
    };
    this.selectionFilterModel = new HeliosFilter({
      id: 'helios-selection-behavior-model',
      name: 'Selection Rules',
      scope: 'render',
    });
    this._networkAttributeUnsub = null;
    this.update(options);
  }

  attach(context) {
    super.attach(context);
    const helios = this.context?.helios ?? null;
    this.ensureStateStyleDefaults();
    this.applySelectionLabelDefaults();
    this.applySelectedConnectedEdges();
    this.syncPicking();
    this.applyOtherElementsState();
    this.attachNetworkAttributeListeners();

    this.addCleanup(this.context.subscribe(helios, 'graph:click', (event) => this.handleGraphClick(event)));
    this.addCleanup(this.context.subscribe(helios, 'graph:dblclick', (event) => this.handleGraphDoubleClick(event)));
    this.addCleanup(this.context.subscribe(helios, 'network:replaced', () => this.handleNetworkReplaced()));
    this.addCleanup(this.context.subscribe(helios, 'ui:binding-change', (event) => this.handleUiBindingChange(event)));
    return this;
  }

  detach() {
    this.clearSelection({ preserveBinding: true, preserveCameraFollow: false, silent: true });
    const graphLayer = this.context?.helios?.renderer?.graphLayer ?? null;
    if (graphLayer) graphLayer.propagateSelectedNodesToEdges = false;
    this.context?.helios?.requestRender?.();
    this._networkAttributeUnsub?.();
    this._networkAttributeUnsub = null;
    return super.detach();
  }

  update(options = {}) {
    super.update(options);
    if (!options || typeof options !== 'object') return this;
    const state = this.state;
    if (Object.prototype.hasOwnProperty.call(options, 'enableNodeSelection')) state.nodeClick = options.enableNodeSelection !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'nodeClick')) state.nodeClick = options.nodeClick !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'enableEdgeSelection')) state.edgeClick = options.enableEdgeSelection === true;
    if (Object.prototype.hasOwnProperty.call(options, 'edgeClick')) state.edgeClick = options.edgeClick === true;
    if (Object.prototype.hasOwnProperty.call(options, 'selectedConnectedEdges')) state.selectedConnectedEdges = options.selectedConnectedEdges !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'otherSelectedNodeStyle')) {
      state.otherSelectedNodeStyle = normalizeNodeStyle(options.otherSelectedNodeStyle, DEFAULT_OTHER_SELECTED_NODE_STYLE);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'otherSelectedEdgeStyle')) {
      state.otherSelectedEdgeStyle = normalizeEdgeStyle(options.otherSelectedEdgeStyle, DEFAULT_OTHER_SELECTED_EDGE_STYLE);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'otherSelectedNodeTone')) {
      state.otherSelectedNodeTone = normalizeAutoBackgroundTone(options.otherSelectedNodeTone, DEFAULT_AUTO_BACKGROUND_TONE_SELECTED);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'otherSelectedEdgeTone')) {
      state.otherSelectedEdgeTone = normalizeAutoBackgroundTone(options.otherSelectedEdgeTone, DEFAULT_AUTO_BACKGROUND_TONE_SELECTED);
    }
    if (this.context) {
      this.applySelectedConnectedEdges();
      this.syncPicking();
      this.applyOtherElementsState();
    }
    this.emitChange('options', {
      storageKeys: selectionOptionStorageKeys(options),
      trackOverride: true,
    });
    return this;
  }

  serialize() {
    return {
      options: {
        nodeClick: this.state.nodeClick,
        edgeClick: this.state.edgeClick,
        selectedConnectedEdges: this.state.selectedConnectedEdges,
        otherSelectedNodeStyle: { ...this.state.otherSelectedNodeStyle },
        otherSelectedEdgeStyle: { ...this.state.otherSelectedEdgeStyle },
        otherSelectedNodeTone: { ...this.state.otherSelectedNodeTone },
        otherSelectedEdgeTone: { ...this.state.otherSelectedEdgeTone },
      },
      selectedNodes: sortedArray(this.state.selectedNodes),
      selectedEdges: sortedArray(this.state.selectedEdges),
      savedSelectionAttribute: this.state.savedSelectionAttribute,
      lastNamedSelectionAttribute: this.state.lastNamedSelectionAttribute,
      selectorRules: cloneRules(this.state.selectorRules),
    };
  }

  stateEntries() {
    const subscribe = (key) => createEntrySubscribe(this, `selection.${key}`);
    return {
      selectedNodes: {
        description: 'Selected node indices.',
        default: sortedArray(this.state.selectedNodes),
        type: 'array',
        scope: 'session',
        aliases: ['selection.selectedNodes'],
        ui: {
          label: 'Selected Nodes',
          controller: 'custom',
        },
        getter: () => sortedArray(this.state.selectedNodes),
        setter: (value) => this.applyNodeSelectionSet(value ?? [], 'replace', { preserveBinding: true }),
        subscribe: subscribe('selectedNodes'),
      },
      selectedEdges: {
        description: 'Selected edge indices.',
        default: sortedArray(this.state.selectedEdges),
        type: 'array',
        scope: 'session',
        aliases: ['selection.selectedEdges'],
        ui: {
          label: 'Selected Edges',
          controller: 'custom',
        },
        getter: () => sortedArray(this.state.selectedEdges),
        setter: (value) => this.applyEdgeSelectionSet(value ?? [], 'replace', { preserveBinding: true }),
        subscribe: subscribe('selectedEdges'),
      },
      selectedConnectedEdges: {
        description: 'Highlight edges connected to selected nodes.',
        default: this.state.selectedConnectedEdges === true,
        type: 'boolean',
        scope: 'workspace',
        aliases: ['selection.selectedConnectedEdges'],
        ui: {
          label: 'Connected Edges',
          controller: 'toggle',
        },
        getter: () => this.state.selectedConnectedEdges === true,
        setter: (value) => this.update({ selectedConnectedEdges: value === true }),
        subscribe: subscribe('selectedConnectedEdges'),
      },
      savedSelectionAttribute: {
        description: 'Attribute used for saved selection state.',
        default: this.state.savedSelectionAttribute,
        type: 'string',
        scope: 'workspace',
        aliases: ['selection.savedSelectionAttribute'],
        ui: {
          label: 'Saved Selection Attribute',
          controller: 'text',
        },
        getter: () => this.state.savedSelectionAttribute,
        setter: (value) => this.setSelectionBinding(value),
        subscribe: subscribe('savedSelectionAttribute'),
      },
      nodeClick: {
        description: 'Whether node clicks update the current selection.',
        default: this.state.nodeClick === true,
        type: 'boolean',
        scope: 'workspace',
        aliases: ['selection.nodeClick'],
        ui: { label: 'Node Click Selection', controller: 'toggle' },
        getter: () => this.state.nodeClick === true,
        setter: (value) => this.update({ nodeClick: value === true }),
        subscribe: subscribe('nodeClick'),
      },
      edgeClick: {
        description: 'Whether edge clicks update the current selection.',
        default: this.state.edgeClick === true,
        type: 'boolean',
        scope: 'workspace',
        aliases: ['selection.edgeClick'],
        ui: { label: 'Edge Click Selection', controller: 'toggle' },
        getter: () => this.state.edgeClick === true,
        setter: (value) => this.update({ edgeClick: value === true }),
        subscribe: subscribe('edgeClick'),
      },
      'selectors.node.rules': {
        description: 'Node selector rules used by the selection panel.',
        default: cloneRules(this.state.selectorRules),
        type: 'array',
        scope: 'session',
        aliases: ['selection.selectors.node.rules'],
        ui: {
          label: 'Node Selector Rules',
          controller: 'custom',
        },
        getter: () => cloneRules(this.state.selectorRules),
        setter: (value) => this.setSelectorRules(value, { silent: true }),
        subscribe: subscribe('selectors.node.rules'),
      },
      otherSelectedNodeStyle: {
        description: 'Style applied to non-selected nodes while nodes are selected.',
        default: { ...this.state.otherSelectedNodeStyle },
        type: 'object',
        scope: 'workspace',
        aliases: ['selection.otherSelectedNodeStyle'],
        ui: { label: 'Other Selected Node Style', controller: 'custom' },
        getter: () => ({ ...this.state.otherSelectedNodeStyle }),
        setter: (value) => this.update({ otherSelectedNodeStyle: value }),
        subscribe: subscribe('otherSelectedNodeStyle'),
      },
      otherSelectedEdgeStyle: {
        description: 'Style applied to non-selected edges while nodes or edges are selected.',
        default: { ...this.state.otherSelectedEdgeStyle },
        type: 'object',
        scope: 'workspace',
        aliases: ['selection.otherSelectedEdgeStyle'],
        ui: { label: 'Other Selected Edge Style', controller: 'custom' },
        getter: () => ({ ...this.state.otherSelectedEdgeStyle }),
        setter: (value) => this.update({ otherSelectedEdgeStyle: value }),
        subscribe: subscribe('otherSelectedEdgeStyle'),
      },
      otherSelectedNodeTone: {
        description: 'Automatic background tone mix for non-selected nodes.',
        default: { ...this.state.otherSelectedNodeTone },
        type: 'object',
        scope: 'workspace',
        aliases: ['selection.otherSelectedNodeTone'],
        ui: { label: 'Other Selected Node Tone', controller: 'custom' },
        getter: () => ({ ...this.state.otherSelectedNodeTone }),
        setter: (value) => this.update({ otherSelectedNodeTone: value }),
        subscribe: subscribe('otherSelectedNodeTone'),
      },
      otherSelectedEdgeTone: {
        description: 'Automatic background tone mix for non-selected edges.',
        default: { ...this.state.otherSelectedEdgeTone },
        type: 'object',
        scope: 'workspace',
        aliases: ['selection.otherSelectedEdgeTone'],
        ui: { label: 'Other Selected Edge Tone', controller: 'custom' },
        getter: () => ({ ...this.state.otherSelectedEdgeTone }),
        setter: (value) => this.update({ otherSelectedEdgeTone: value }),
        subscribe: subscribe('otherSelectedEdgeTone'),
      },
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    this.update(options);
    this.clearSelection({ preserveBinding: true, preserveCameraFollow: true, silent: true });
    this.applyNodeSelectionSet(snapshot?.selectedNodes ?? [], 'replace', { preserveBinding: true, silent: true });
    this.applyEdgeSelectionSet(snapshot?.selectedEdges ?? [], 'replace', { preserveBinding: true, silent: true });
    this.state.savedSelectionAttribute = snapshot?.savedSelectionAttribute || CURRENT_SELECTION_VALUE;
    this.state.lastNamedSelectionAttribute = snapshot?.lastNamedSelectionAttribute || '';
    this.state.selectorRules = cloneRules(snapshot?.selectorRules ?? []);
    this.applyOtherElementsState();
    this.emitChange('restore');
    return this;
  }

  emitChange(reason, detail = {}) {
    this.emit('change', { reason, state: this.getPublicState(), ...detail });
  }

  getPublicState() {
    return {
      ...this.state,
      selectedNodes: this.state.selectedNodes,
      selectedEdges: this.state.selectedEdges,
    };
  }

  ensureStateStyleDefaults() {
    ensureInteractionStateStyleDefaults(this.context?.helios ?? null);
  }

  applyOtherElementsState() {
    applyOtherElementsState(this.context);
  }

  applySelectedConnectedEdges() {
    applySelectedConnectedEdges(this.context);
  }

  syncPicking() {
    syncPicking(this.context, this.options);
  }

  setSelectionBinding(value = CURRENT_SELECTION_VALUE) {
    this.state.savedSelectionAttribute = value || CURRENT_SELECTION_VALUE;
    this.emitChange('binding', {
      storageKeys: ['selection.savedSelectionAttribute'],
      trackOverride: true,
    });
  }

  setSelectorRules(rules = [], options = {}) {
    this.state.selectorRules = cloneRules(rules);
    if (options.silent !== true) this.emitChange('selector-rules', {
      trackOverride: options.trackOverride !== false,
      storageKeys: ['selection.selectors.node.rules'],
    });
    return this;
  }

  applySelectionLabelDefaults() {
    if (this.options.enableSelectionLabels === false) return;
    const labelsBehavior = this.context?.getBehavior?.('labels') ?? null;
    if (labelsBehavior?.applySelectionDefaults) {
      labelsBehavior.applySelectionDefaults();
      return;
    }
    const helios = this.context?.helios ?? null;
    const current = helios?.labels?.() ?? {};
    helios?.labels?.({
      enabled: current.enabled === true ? current.enabled : true,
      selectionMode: current.enabled === true && current.selectionMode === 'ranked' ? 'ranked' : 'selected-only',
    });
  }

  setNodeSelected(index, selected, options = {}) {
    const helios = this.context?.helios ?? null;
    if (!Number.isInteger(index) || index < 0 || !helios) return;
    if (selected) {
      if (this.state.selectedNodes.has(index)) return;
      this.state.selectedNodes.add(index);
    } else {
      if (!this.state.selectedNodes.has(index)) return;
      this.state.selectedNodes.delete(index);
    }
    helios.nodeState?.([index], 'SELECTED', { mode: selected ? 'add' : 'remove' });
    if (!this.state.selectedNodes.size) {
      helios.cameraFollowNodes?.([], { frame: false });
    }
    this.applyOtherElementsState();
    if (options.preserveBinding !== true) this.setSelectionBinding(CURRENT_SELECTION_VALUE);
    if (options.silent !== true) this.emitChange('node-selection', {
      trackOverride: options.trackOverride !== false,
      storageKeys: ['selection.selectedNodes'],
    });
  }

  setEdgeSelected(index, selected, options = {}) {
    const helios = this.context?.helios ?? null;
    if (!Number.isInteger(index) || index < 0 || !helios) return;
    if (selected) {
      if (this.state.selectedEdges.has(index)) return;
      this.state.selectedEdges.add(index);
    } else {
      if (!this.state.selectedEdges.has(index)) return;
      this.state.selectedEdges.delete(index);
    }
    helios.edgeState?.([index], 'SELECTED', { mode: selected ? 'add' : 'remove' });
    this.applyOtherElementsState();
    if (options.preserveBinding !== true) this.setSelectionBinding(CURRENT_SELECTION_VALUE);
    if (options.silent !== true) this.emitChange('edge-selection', {
      trackOverride: options.trackOverride !== false,
      storageKeys: ['selection.selectedEdges'],
    });
  }

  clearSelection(options = {}) {
    const helios = this.context?.helios ?? null;
    if (!helios) return;
    if (this.state.selectedNodes.size) {
      helios.nodeState?.(Array.from(this.state.selectedNodes), 'SELECTED', { mode: 'remove' });
      this.state.selectedNodes.clear();
    }
    if (this.state.selectedEdges.size) {
      helios.edgeState?.(Array.from(this.state.selectedEdges), 'SELECTED', { mode: 'remove' });
      this.state.selectedEdges.clear();
    }
    this.applyOtherElementsState();
    if (options.preserveBinding !== true) this.setSelectionBinding(CURRENT_SELECTION_VALUE);
    if (options.preserveCameraFollow !== true) {
      helios.cameraFollowNodes?.([], { frame: false });
    }
    if (options.silent !== true) this.emitChange('clear', {
      trackOverride: options.trackOverride !== false,
      storageKeys: ['selection.selectedNodes', 'selection.selectedEdges'],
    });
  }

  selectOnly(kind, index, options = {}) {
    const selectedNodes = Array.from(this.state.selectedNodes);
    const selectedEdges = Array.from(this.state.selectedEdges);
    for (const nodeIndex of selectedNodes) {
      if (!(kind === 'node' && nodeIndex === index)) this.setNodeSelected(nodeIndex, false, options);
    }
    for (const edgeIndex of selectedEdges) {
      if (!(kind === 'edge' && edgeIndex === index)) this.setEdgeSelected(edgeIndex, false, options);
    }
    if (kind === 'node') this.setNodeSelected(index, true, options);
    if (kind === 'edge') this.setEdgeSelected(index, true, options);
  }

  toggleSelection(kind, index, options = {}) {
    if (kind === 'node') this.setNodeSelected(index, !this.state.selectedNodes.has(index), options);
    if (kind === 'edge') this.setEdgeSelected(index, !this.state.selectedEdges.has(index), options);
  }

  applyNodeSelectionSet(indices, mode = 'add', options = {}) {
    const helios = this.context?.helios ?? null;
    if (!helios) return { added: 0, removed: 0, total: 0 };
    const nextIndices = collectUniqueIndices(indices);
    const nextIndexSet = new Set(nextIndices);
    const toAdd = [];
    const toRemove = [];
    if (mode === 'replace') {
      for (const index of this.state.selectedNodes) {
        if (!nextIndexSet.has(index)) toRemove.push(index);
      }
    } else if (mode === 'remove') {
      for (const index of nextIndices) {
        if (this.state.selectedNodes.has(index)) toRemove.push(index);
      }
    }
    if (mode !== 'remove') {
      for (const index of nextIndices) {
        if (!this.state.selectedNodes.has(index)) toAdd.push(index);
      }
    }
    if (toRemove.length) {
      helios.nodeState?.(toRemove, 'SELECTED', { mode: 'remove' });
      for (const index of toRemove) this.state.selectedNodes.delete(index);
    }
    if (toAdd.length) {
      helios.nodeState?.(toAdd, 'SELECTED', { mode: 'add' });
      for (const index of toAdd) this.state.selectedNodes.add(index);
    }
    this.applyOtherElementsState();
    if (options.preserveBinding !== true) this.setSelectionBinding(CURRENT_SELECTION_VALUE);
    if (options.silent !== true) this.emitChange('node-selection-set', {
      trackOverride: options.trackOverride !== false,
      storageKeys: ['selection.selectedNodes'],
    });
    return { added: toAdd.length, removed: toRemove.length, total: this.state.selectedNodes.size };
  }

  applyEdgeSelectionSet(indices, mode = 'add', options = {}) {
    const helios = this.context?.helios ?? null;
    if (!helios) return { added: 0, removed: 0, total: 0 };
    const nextIndices = collectUniqueIndices(indices);
    const nextIndexSet = new Set(nextIndices);
    const toAdd = [];
    const toRemove = [];
    if (mode === 'replace') {
      for (const index of this.state.selectedEdges) {
        if (!nextIndexSet.has(index)) toRemove.push(index);
      }
    } else if (mode === 'remove') {
      for (const index of nextIndices) {
        if (this.state.selectedEdges.has(index)) toRemove.push(index);
      }
    }
    if (mode !== 'remove') {
      for (const index of nextIndices) {
        if (!this.state.selectedEdges.has(index)) toAdd.push(index);
      }
    }
    if (toRemove.length) {
      helios.edgeState?.(toRemove, 'SELECTED', { mode: 'remove' });
      for (const index of toRemove) this.state.selectedEdges.delete(index);
    }
    if (toAdd.length) {
      helios.edgeState?.(toAdd, 'SELECTED', { mode: 'add' });
      for (const index of toAdd) this.state.selectedEdges.add(index);
    }
    this.applyOtherElementsState();
    if (options.preserveBinding !== true) this.setSelectionBinding(CURRENT_SELECTION_VALUE);
    if (options.silent !== true) this.emitChange('edge-selection-set', {
      trackOverride: options.trackOverride !== false,
      storageKeys: ['selection.selectedEdges'],
    });
    return { added: toAdd.length, removed: toRemove.length, total: this.state.selectedEdges.size };
  }

  selectNodes(indices, options = {}) {
    return this.applyNodeSelectionSet(indices, options.mode ?? 'add', options);
  }

  selectEdges(indices, options = {}) {
    return this.applyEdgeSelectionSet(indices, options.mode ?? 'add', options);
  }

  buildNodeSelectionQuery(rules = []) {
    this.selectionFilterModel.clear('node');
    this.selectionFilterModel.clear('edge');
    for (const rule of rules ?? []) {
      this.selectionFilterModel.addRule(rule);
    }
    return this.selectionFilterModel.compileScopeQuery('node');
  }

  applyNodeSelectionQuery(rules, mode = 'add') {
    this.setSelectorRules(rules, { silent: true });
    const query = this.buildNodeSelectionQuery(rules);
    if (!query) return { added: 0, removed: 0, total: this.state.selectedNodes.size };
    const matches = this.context?.network?.selectNodes?.(query) ?? new Uint32Array();
    return this.applyNodeSelectionSet(matches, mode);
  }

  expandSelectionToNeighbors() {
    if (!this.state.selectedNodes.size) return { added: 0, removed: 0, total: 0 };
    const neighbors = this.context?.network?.getNeighborsForNodes?.(Array.from(this.state.selectedNodes), {
      direction: 'both',
      includeEdges: false,
      includeSourceNodes: false,
    }) ?? new Uint32Array();
    return this.applyNodeSelectionSet(neighbors, 'add');
  }

  centerSelectedNodesOrNetwork(options = {}) {
    const helios = this.context?.helios ?? null;
    const selectedNodes = Array.from(this.state.selectedNodes);
    if (selectedNodes.length) {
      helios?.cameraFollowNodes?.(selectedNodes, {
        animate: options.animate ?? true,
        durationMs: options.durationMs,
        followUpdateIntervalMs: options.followUpdateIntervalMs ?? 180,
        zoomScale: options.zoomScale ?? 1.35,
        maxFocusZoom: options.maxFocusZoom ?? DEFAULT_SELECTION_FOCUS_MAX_ZOOM,
        minFocusDistance: options.minFocusDistance ?? DEFAULT_SELECTION_FOCUS_MIN_DISTANCE,
        focusZoomTolerance: options.focusZoomTolerance ?? DEFAULT_SELECTION_FOCUS_ZOOM_TOLERANCE,
      });
      return true;
    }
    helios?.cameraFollowNodes?.([], {
      animate: options.animate ?? true,
      durationMs: options.durationMs,
      resetOrientation: false,
    });
    return false;
  }

  collectSavedSelectionAttributes() {
    const network = this.context?.network ?? null;
    const catalog = new Map();
    for (const name of resolveBooleanAttributeNames(network, 'node')) {
      const entry = catalog.get(name) ?? { name, node: false, edge: false };
      entry.node = true;
      catalog.set(name, entry);
    }
    for (const name of resolveBooleanAttributeNames(network, 'edge')) {
      const entry = catalog.get(name) ?? { name, node: false, edge: false };
      entry.edge = true;
      catalog.set(name, entry);
    }
    return Array.from(catalog.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  ensureBooleanSelectionAttribute(network, scope, name) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) throw new Error('Selection attribute name is required.');
    const getInfo = scope === 'edge'
      ? network.getEdgeAttributeInfo?.bind(network)
      : network.getNodeAttributeInfo?.bind(network);
    const defineAttribute = scope === 'edge'
      ? network.defineEdgeAttribute?.bind(network)
      : network.defineNodeAttribute?.bind(network);
    const info = getInfo?.(trimmed) ?? null;
    if (info) {
      if (info.type !== AttributeType.Boolean || info.dimension !== 1) {
        throw new Error(`Attribute "${trimmed}" already exists on ${scope}s and is not a boolean scalar.`);
      }
      return trimmed;
    }
    defineAttribute?.(trimmed, AttributeType.Boolean, 1);
    return trimmed;
  }

  saveSelectionToAttribute(name) {
    const network = this.context?.network ?? null;
    if (!network) throw new Error('Selection save requires an active network.');
    const trimmed = this.ensureBooleanSelectionAttribute(network, 'node', name);
    this.ensureBooleanSelectionAttribute(network, 'edge', trimmed);
    if (typeof network.withBufferAccess === 'function') {
      network.withBufferAccess(() => {
        const nodeView = network.getNodeAttributeBuffer(trimmed).view;
        const edgeView = network.getEdgeAttributeBuffer(trimmed).view;
        nodeView.fill(0);
        edgeView.fill(0);
        for (const index of this.state.selectedNodes) nodeView[index] = 1;
        for (const index of this.state.selectedEdges) edgeView[index] = 1;
      });
    }
    network.bumpNodeAttributeVersion?.(trimmed);
    network.bumpEdgeAttributeVersion?.(trimmed);
    this.state.savedSelectionAttribute = trimmed;
    this.state.lastNamedSelectionAttribute = trimmed;
    this.emitChange('save');
    return trimmed;
  }

  collectSelectionAttributeIndices(scope, name) {
    const network = this.context?.network ?? null;
    if (!network || typeof network.withBufferAccess !== 'function') return [];
    const trimmed = String(name ?? '').trim();
    if (!trimmed) return [];
    const getInfo = scope === 'edge'
      ? network.getEdgeAttributeInfo?.bind(network)
      : network.getNodeAttributeInfo?.bind(network);
    const info = getInfo?.(trimmed) ?? null;
    if (!info || info.type !== AttributeType.Boolean || info.dimension !== 1) return [];
    return network.withBufferAccess(() => {
      const ids = scope === 'edge' ? (network.edgeIndices ?? []) : (network.nodeIndices ?? []);
      const view = scope === 'edge'
        ? network.getEdgeAttributeBuffer(trimmed).view
        : network.getNodeAttributeBuffer(trimmed).view;
      const matches = [];
      for (let index = 0; index < ids.length; index += 1) {
        const id = Number(ids[index]);
        if (Number(view[id]) !== 0) matches.push(id);
      }
      return matches;
    }, {
      nodeIndices: scope !== 'edge',
      edgeIndices: scope === 'edge',
    });
  }

  restoreSelectionFromAttribute(name) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) throw new Error('Select a saved selection before restoring.');
    const nodeMatches = this.collectSelectionAttributeIndices('node', trimmed);
    const edgeMatches = this.collectSelectionAttributeIndices('edge', trimmed);
    this.applyNodeSelectionSet(nodeMatches, 'replace', { preserveBinding: true });
    this.applyEdgeSelectionSet(edgeMatches, 'replace', { preserveBinding: true });
    this.setSelectionBinding(trimmed);
    this.emitChange('restore-attribute');
  }

  attachNetworkAttributeListeners() {
    this._networkAttributeUnsub?.();
    this._networkAttributeUnsub = null;
    const network = this.context?.network ?? null;
    if (!network) return;
    const handler = () => this.emitChange('attributes');
    const unsubs = [
      this.context.subscribe(network, 'attribute:defined', handler),
      this.context.subscribe(network, 'attribute:removed', handler),
      this.context.subscribe(network, 'attribute:changed', handler),
    ];
    this._networkAttributeUnsub = () => {
      for (const unsubscribe of unsubs) unsubscribe?.();
    };
  }

  handleGraphClick(event) {
    const detail = event?.detail;
    if (!detail) return;
    const shiftKey = detail.modifiers?.shiftKey === true;
    const isNodeHit = detail.kind === 'node' && detail.index >= 0;
    const isEdgeHit = detail.kind === 'edge' && detail.index >= 0;
    if (isNodeHit && this.state.nodeClick) {
      if (shiftKey) this.toggleSelection('node', detail.index);
      else this.selectOnly('node', detail.index);
      return;
    }
    if (isEdgeHit && this.state.edgeClick) {
      if (shiftKey) this.toggleSelection('edge', detail.index);
      else this.selectOnly('edge', detail.index);
      return;
    }
    if (!shiftKey) {
      this.clearSelection();
    }
  }

  handleGraphDoubleClick(event) {
    const detail = event?.detail;
    if (!detail) return;
    const shiftKey = detail.modifiers?.shiftKey === true;
    const isNodeHit = detail.kind === 'node' && detail.index >= 0;
    if (isNodeHit && this.state.nodeClick) {
      if (shiftKey) this.toggleSelection('node', detail.index);
      else this.selectOnly('node', detail.index);
      this.centerSelectedNodesOrNetwork();
      return;
    }
    this.clearSelection();
    this.centerSelectedNodesOrNetwork();
  }

  handleNetworkReplaced() {
    this.clearSelection({ preserveBinding: true, silent: true });
    this.state.savedSelectionAttribute = CURRENT_SELECTION_VALUE;
    this.state.lastNamedSelectionAttribute = '';
    this.attachNetworkAttributeListeners();
    this.ensureStateStyleDefaults();
    this.applySelectedConnectedEdges();
    this.applyOtherElementsState();
    this.applySelectionLabelDefaults();
    this.syncPicking();
    this.emitChange('network-replaced');
  }

  handleUiBindingChange(event) {
    const bindingName = event?.detail?.name ?? null;
    if (bindingName !== 'clearColor' && bindingName !== 'background') return;
    this.applyOtherElementsState();
    this.emitChange('ui-binding');
  }
}

export default SelectionBehavior;
