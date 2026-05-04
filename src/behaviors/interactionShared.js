import {
  DEFAULT_AUTO_BACKGROUND_TONE_DISABLED,
  DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
  DEFAULT_EDGE_HIGHLIGHT_STYLE,
  DEFAULT_EDGE_HOVER_STYLE,
  DEFAULT_EDGE_SELECTED_STYLE,
  DEFAULT_NODE_HIGHLIGHT_STYLE,
  DEFAULT_NODE_HOVER_STYLE,
  DEFAULT_NODE_SELECTED_STYLE,
  NEUTRAL_EDGE_NO_STATE_STYLE,
  NEUTRAL_NODE_NO_STATE_STYLE,
  applyAutoBackgroundTone,
  isNeutralEdgeStateStyle,
  isNeutralNodeStateStyle,
  resolveBackgroundColor,
} from './selectionShared.js';

export const DEFAULT_PICKING_OPTIONS = Object.freeze({
  resolutionScale: 0.25,
  trackDepth: false,
  maxFps: 20,
});

function getSelectionState(context) {
  return context?.getBehavior?.('selection')?.state ?? null;
}

function getHoverState(context) {
  return context?.getBehavior?.('hover')?.state ?? null;
}

export function ensureInteractionStateStyleDefaults(helios) {
  if (!helios) return;
  const selectedNodeStyle = helios.nodeStateStyle?.('SELECTED') ?? null;
  const highlightedNodeStyle = helios.nodeStateStyle?.('HIGHLIGHTED') ?? null;
  const selectedEdgeStyle = helios.edgeStateStyle?.('SELECTED') ?? null;
  const highlightedEdgeStyle = helios.edgeStateStyle?.('HIGHLIGHTED') ?? null;
  if (!selectedNodeStyle || isNeutralNodeStateStyle(selectedNodeStyle)) {
    helios.nodeStateStyle?.('SELECTED', { ...DEFAULT_NODE_SELECTED_STYLE });
  }
  if (!highlightedNodeStyle || isNeutralNodeStateStyle(highlightedNodeStyle)) {
    helios.nodeStateStyle?.('HIGHLIGHTED', { ...DEFAULT_NODE_HIGHLIGHT_STYLE });
  }
  if (!selectedEdgeStyle || isNeutralEdgeStateStyle(selectedEdgeStyle)) {
    helios.edgeStateStyle?.('SELECTED', { ...DEFAULT_EDGE_SELECTED_STYLE });
  }
  if (!highlightedEdgeStyle || isNeutralEdgeStateStyle(highlightedEdgeStyle)) {
    helios.edgeStateStyle?.('HIGHLIGHTED', { ...DEFAULT_EDGE_HIGHLIGHT_STYLE });
  }
  if (!helios.nodeHoverStyle?.()) {
    helios.nodeHoverStyle?.({ ...DEFAULT_NODE_HOVER_STYLE });
  }
  if (!helios.edgeHoverStyle?.()) {
    helios.edgeHoverStyle?.({ ...DEFAULT_EDGE_HOVER_STYLE });
  }
}

export function resolveOtherElementsMode(context) {
  const selectionState = getSelectionState(context);
  if (selectionState && (selectionState.selectedNodes.size > 0 || selectionState.selectedEdges.size > 0)) {
    return 'selected';
  }
  const helios = context?.helios ?? null;
  const highlightUnion = helios?._highlightUnion ?? null;
  if (highlightUnion && ((highlightUnion.nodes?.size ?? 0) > 0 || (highlightUnion.edges?.size ?? 0) > 0)) {
    return 'highlighted';
  }
  const hoverState = getHoverState(context);
  if (hoverState?.hoverAffectsOtherElements === true && (
    (hoverState.nodeHover && hoverState.hoveredNode >= 0)
    || (hoverState.edgeHover && hoverState.hoveredEdge >= 0)
  )) {
    return 'highlighted';
  }
  return 'neutral';
}

function resolveOtherElementsStyle(context, mode) {
  const helios = context?.helios ?? null;
  const background = resolveBackgroundColor(helios);
  const selectionState = getSelectionState(context);
  const hoverState = getHoverState(context);
  if (mode === 'selected' && selectionState) {
    return {
      node: applyAutoBackgroundTone(selectionState.otherSelectedNodeStyle, background, selectionState.otherSelectedNodeTone),
      edge: applyAutoBackgroundTone(selectionState.otherSelectedEdgeStyle, background, selectionState.otherSelectedEdgeTone),
    };
  }
  if (mode === 'highlighted' && hoverState) {
    return {
      node: applyAutoBackgroundTone(hoverState.otherHighlightNodeStyle, background, hoverState.otherHighlightNodeTone),
      edge: applyAutoBackgroundTone(hoverState.otherHighlightEdgeStyle, background, hoverState.otherHighlightEdgeTone),
    };
  }
  return {
    node: { ...NEUTRAL_NODE_NO_STATE_STYLE },
    edge: { ...NEUTRAL_EDGE_NO_STATE_STYLE },
  };
}

export function applyOtherElementsState(context) {
  const helios = context?.helios ?? null;
  if (!helios) return;
  const mode = resolveOtherElementsMode(context);
  const styles = resolveOtherElementsStyle(context, mode);
  const graphLayer = helios.renderer?.graphLayer ?? null;
  helios.nodeNoStateStyle?.(styles.node);
  helios.edgeNoStateStyle?.(styles.edge);
  if (graphLayer) {
    const enabled = mode !== 'neutral';
    graphLayer.nodeNoStateStyleEnabled = enabled;
    graphLayer.edgeNoStateStyleEnabled = enabled;
  }
  helios.requestRender?.();
}

export function applyHoverConnectedEdges(context) {
  const helios = context?.helios ?? null;
  const graphLayer = helios?.renderer?.graphLayer ?? null;
  const hoverState = getHoverState(context);
  if (graphLayer) {
    graphLayer.propagateHoveredNodeToEdges = hoverState?.hoverConnectedEdges === true;
  }
  helios?.requestRender?.();
}

export function applySelectedConnectedEdges(context) {
  const helios = context?.helios ?? null;
  const graphLayer = helios?.renderer?.graphLayer ?? null;
  const selectionState = getSelectionState(context);
  if (graphLayer) {
    graphLayer.propagateSelectedNodesToEdges = selectionState?.selectedConnectedEdges === true;
  }
  helios?.requestRender?.();
}

export function needsNodeHoverTracking(context) {
  const hoverState = getHoverState(context);
  return hoverState
    ? (hoverState.nodeHover || hoverState.hoverLabel || hoverState.hoverConnectedEdges)
    : false;
}

export function needsEdgeHoverTracking(context) {
  return getHoverState(context)?.edgeHover === true;
}

export function syncPicking(context, options = {}) {
  const helios = context?.helios ?? null;
  if (!helios) return;
  const selectionState = getSelectionState(context);
  const needsNodePicking = (selectionState?.nodeClick === true) || needsNodeHoverTracking(context);
  const needsEdgePicking = (selectionState?.edgeClick === true) || needsEdgeHoverTracking(context);
  const pickingOptions = {
    ...DEFAULT_PICKING_OPTIONS,
    resolutionScale: options.pickingResolutionScale ?? DEFAULT_PICKING_OPTIONS.resolutionScale,
    trackDepth: options.pickingTrackDepth === true,
    maxFps: options.pickingMaxFps ?? DEFAULT_PICKING_OPTIONS.maxFps,
  };
  if (needsNodePicking) helios.enableNodePicking?.({ ...pickingOptions, hoverEnabled: needsNodeHoverTracking(context) });
  else helios.disableNodePicking?.();
  if (needsEdgePicking) helios.enableEdgePicking?.({ ...pickingOptions, hoverEnabled: needsEdgeHoverTracking(context) });
  else helios.disableEdgePicking?.();
}

export function applyHoverLabelConfig(context) {
  const helios = context?.helios ?? null;
  const hoverBehavior = context?.getBehavior?.('hover') ?? null;
  const labelsBehavior = context?.getBehavior?.('labels') ?? null;
  if (!helios || !hoverBehavior) return;
  if (labelsBehavior?.setHoverPolicy) {
    labelsBehavior.setHoverPolicy({
      enabled: hoverBehavior.state.hoverLabel,
      source: hoverBehavior.state.hoverLabel
        ? ((id, network) => hoverBehavior.resolveHoverLabelValue(id, network))
        : null,
    });
    return;
  }
  helios.labels?.({
    hoveredNodeEnabled: hoverBehavior.state.hoverLabel,
    hoveredNodeSource: hoverBehavior.state.hoverLabel
      ? ((id, network) => hoverBehavior.resolveHoverLabelValue(id, network))
      : null,
  });
}

export default {
  DEFAULT_PICKING_OPTIONS,
  ensureInteractionStateStyleDefaults,
  resolveOtherElementsMode,
  applyOtherElementsState,
  applyHoverConnectedEdges,
  applySelectedConnectedEdges,
  needsNodeHoverTracking,
  needsEdgeHoverTracking,
  syncPicking,
  applyHoverLabelConfig,
};
