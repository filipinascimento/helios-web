import { Behavior } from './Behavior.js';
import {
  DEFAULT_AUTO_BACKGROUND_TONE_DISABLED,
  DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
  DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE,
  DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE,
  normalizeAutoBackgroundTone,
  normalizeEdgeStyle,
  normalizeNodeStyle,
  resolveHoverLabelValue,
} from './selectionShared.js';
import {
  applyHoverConnectedEdges,
  applyHoverLabelConfig,
  applyOtherElementsState,
  ensureInteractionStateStyleDefaults,
  needsEdgeHoverTracking,
  needsNodeHoverTracking,
  syncPicking,
} from './interactionShared.js';

/**
 * Built-in behavior for hover picking and hover labels.
 *
 * @public
 * @param {object} [options] - Hover options including `nodeHover`,
 * `edgeHover`, `hoverLabel`, and connected-edge highlighting.
 * @returns {HoverBehavior} Behavior that tracks the current hovered node and
 * edge.
 * @remarks Hover requires picking to be available on the active renderer. The
 * behavior coordinates with `LabelsBehavior` when transient hover labels are
 * enabled.
 */
export class HoverBehavior extends Behavior {
  static id = 'hover';

  constructor(options = {}) {
    super(options);
    this.state = {
      nodeHover: true,
      edgeHover: false,
      hoverLabel: true,
      hoverLabelSource: 'auto',
      hoverConnectedEdges: true,
      hoveredNode: -1,
      hoveredEdge: -1,
      otherHighlightNodeStyle: normalizeNodeStyle(DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE, DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE),
      otherHighlightEdgeStyle: normalizeEdgeStyle(DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE, DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE),
      otherHighlightNodeTone: normalizeAutoBackgroundTone(DEFAULT_AUTO_BACKGROUND_TONE_DISABLED, DEFAULT_AUTO_BACKGROUND_TONE_DISABLED),
      otherHighlightEdgeTone: normalizeAutoBackgroundTone(DEFAULT_AUTO_BACKGROUND_TONE_DISABLED, DEFAULT_AUTO_BACKGROUND_TONE_DISABLED),
      initialHoverLabelConfig: {
        hoveredNodeEnabled: false,
        hoveredNodeSource: null,
      },
    };
    this.update(options);
  }

  attach(context) {
    super.attach(context);
    const helios = this.context?.helios ?? null;
    const labelsBehavior = this.context?.getBehavior?.('labels') ?? null;
    if (!labelsBehavior) {
      const initialLabelsConfig = helios?.labels?.() ?? { enabled: false };
      this.state.initialHoverLabelConfig = {
        hoveredNodeEnabled: initialLabelsConfig.hoveredNodeEnabled === true,
        hoveredNodeSource: initialLabelsConfig.hoveredNodeSource ?? null,
      };
    }
    this.ensureStateStyleDefaults();
    this.applyHoverLabelConfig();
    this.applyHoverConnectedEdges();
    this.syncPicking();
    this.applyOtherElementsState();

    this.addCleanup(this.context.subscribe(helios, 'node:hover', (event) => this.handleNodeHover(event)));
    this.addCleanup(this.context.subscribe(helios, 'edge:hover', (event) => this.handleEdgeHover(event)));
    this.addCleanup(this.context.subscribe(helios, 'network:replaced', () => this.handleNetworkReplaced()));
    this.addCleanup(this.context.subscribe(helios, 'ui:binding-change', (event) => this.handleUiBindingChange(event)));
    return this;
  }

  detach() {
    const labelsBehavior = this.context?.getBehavior?.('labels') ?? null;
    if (labelsBehavior?.clearHoverPolicy) labelsBehavior.clearHoverPolicy({ silent: true });
    else this.context?.helios?.labels?.(this.state.initialHoverLabelConfig);
    this.clearNodeHover({ silent: true });
    this.clearEdgeHover({ silent: true });
    const graphLayer = this.context?.helios?.renderer?.graphLayer ?? null;
    if (graphLayer) graphLayer.propagateHoveredNodeToEdges = false;
    this.syncPicking();
    this.applyOtherElementsState();
    return super.detach();
  }

  update(options = {}) {
    super.update(options);
    if (!options || typeof options !== 'object') return this;
    const state = this.state;
    if (Object.prototype.hasOwnProperty.call(options, 'enableNodeHover')) state.nodeHover = options.enableNodeHover !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'nodeHover')) state.nodeHover = options.nodeHover === true;
    if (Object.prototype.hasOwnProperty.call(options, 'enableEdgeHover')) state.edgeHover = options.enableEdgeHover === true;
    if (Object.prototype.hasOwnProperty.call(options, 'edgeHover')) state.edgeHover = options.edgeHover === true;
    if (Object.prototype.hasOwnProperty.call(options, 'enableHoverLabels')) state.hoverLabel = options.enableHoverLabels !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'hoverLabel')) state.hoverLabel = options.hoverLabel === true;
    if (Object.prototype.hasOwnProperty.call(options, 'hoverLabelSource') && typeof options.hoverLabelSource === 'string') {
      state.hoverLabelSource = options.hoverLabelSource || 'auto';
    }
    if (Object.prototype.hasOwnProperty.call(options, 'hoverConnectedEdges')) state.hoverConnectedEdges = options.hoverConnectedEdges !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'otherHighlightNodeStyle')) {
      state.otherHighlightNodeStyle = normalizeNodeStyle(options.otherHighlightNodeStyle, DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'otherHighlightEdgeStyle')) {
      state.otherHighlightEdgeStyle = normalizeEdgeStyle(options.otherHighlightEdgeStyle, DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'otherHighlightNodeTone')) {
      state.otherHighlightNodeTone = normalizeAutoBackgroundTone(options.otherHighlightNodeTone, DEFAULT_AUTO_BACKGROUND_TONE_DISABLED);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'otherHighlightEdgeTone')) {
      state.otherHighlightEdgeTone = normalizeAutoBackgroundTone(options.otherHighlightEdgeTone, DEFAULT_AUTO_BACKGROUND_TONE_DISABLED);
    }
    if (this.context) {
      if (!needsNodeHoverTracking(this.context)) this.clearNodeHover({ silent: true });
      if (!needsEdgeHoverTracking(this.context)) this.clearEdgeHover({ silent: true });
      this.applyHoverLabelConfig();
      this.applyHoverConnectedEdges();
      this.syncPicking();
      this.applyOtherElementsState();
    }
    this.emitChange('options');
    return this;
  }

  serialize() {
    return {
      options: {
        nodeHover: this.state.nodeHover,
        edgeHover: this.state.edgeHover,
        hoverLabel: this.state.hoverLabel,
        hoverLabelSource: this.state.hoverLabelSource,
        hoverConnectedEdges: this.state.hoverConnectedEdges,
        otherHighlightNodeStyle: { ...this.state.otherHighlightNodeStyle },
        otherHighlightEdgeStyle: { ...this.state.otherHighlightEdgeStyle },
        otherHighlightNodeTone: { ...this.state.otherHighlightNodeTone },
        otherHighlightEdgeTone: { ...this.state.otherHighlightEdgeTone },
      },
    };
  }

  restore(snapshot = {}) {
    const options = snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    this.update(options);
    this.clearNodeHover({ silent: true });
    this.clearEdgeHover({ silent: true });
    this.emitChange('restore');
    return this;
  }

  emitChange(reason, detail = {}) {
    this.emit('change', { reason, state: this.getPublicState(), ...detail });
  }

  getPublicState() {
    return { ...this.state };
  }

  ensureStateStyleDefaults() {
    ensureInteractionStateStyleDefaults(this.context?.helios ?? null);
  }

  applyHoverLabelConfig() {
    applyHoverLabelConfig(this.context);
  }

  applyHoverConnectedEdges() {
    applyHoverConnectedEdges(this.context);
  }

  applyOtherElementsState() {
    applyOtherElementsState(this.context);
  }

  syncPicking() {
    syncPicking(this.context, this.options);
  }

  resolveHoverLabelValue(index, network = this.context?.network ?? null) {
    return resolveHoverLabelValue(network, this.state.hoverLabelSource, index);
  }

  clearNodeHover(options = {}) {
    if (this.state.hoveredNode < 0 && options.force !== true) return;
    this.state.hoveredNode = -1;
    this.context?.helios?.hoverNodeState?.(null, 0);
    this.applyOtherElementsState();
    if (options.silent !== true) this.emitChange('node-hover-clear');
  }

  clearEdgeHover(options = {}) {
    if (this.state.hoveredEdge < 0 && options.force !== true) return;
    this.state.hoveredEdge = -1;
    this.context?.helios?.hoverEdgeState?.(null, 0);
    this.applyOtherElementsState();
    if (options.silent !== true) this.emitChange('edge-hover-clear');
  }

  handleNodeHover(event) {
    const detail = event?.detail;
    if (!detail || !needsNodeHoverTracking(this.context)) return;
    if (detail.state === 'in') {
      this.state.hoveredNode = detail.index;
      if (this.state.nodeHover) this.context?.helios?.hoverNodeState?.(detail.index, 'HIGHLIGHTED');
    } else if (detail.state === 'out' && this.state.hoveredNode === detail.index) {
      this.clearNodeHover({ silent: true });
    }
    this.applyOtherElementsState();
    this.emitChange('node-hover');
  }

  handleEdgeHover(event) {
    const detail = event?.detail;
    if (!detail || !needsEdgeHoverTracking(this.context)) return;
    if (detail.state === 'in') {
      this.state.hoveredEdge = detail.index;
      if (this.state.edgeHover) this.context?.helios?.hoverEdgeState?.(detail.index, 'HIGHLIGHTED');
    } else if (detail.state === 'out' && this.state.hoveredEdge === detail.index) {
      this.clearEdgeHover({ silent: true });
    }
    this.applyOtherElementsState();
    this.emitChange('edge-hover');
  }

  handleNetworkReplaced() {
    const labelsBehavior = this.context?.getBehavior?.('labels') ?? null;
    if (!labelsBehavior) {
      const labelsConfig = this.context?.helios?.labels?.() ?? { enabled: false };
      this.state.initialHoverLabelConfig = {
        hoveredNodeEnabled: labelsConfig.hoveredNodeEnabled === true,
        hoveredNodeSource: labelsConfig.hoveredNodeSource ?? null,
      };
    }
    this.clearNodeHover({ silent: true, force: true });
    this.clearEdgeHover({ silent: true, force: true });
    this.ensureStateStyleDefaults();
    this.applyHoverConnectedEdges();
    this.applyOtherElementsState();
    this.applyHoverLabelConfig();
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

export default HoverBehavior;
