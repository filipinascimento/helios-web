import { AttributeType } from 'helios-network';
import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { createTooltipManager } from '../controls/createTooltipManager.js';
import { createSelectControl } from '../controls/createSelectControl.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { clampNumber } from '../utils/numbers.js';
import { toHex8 } from '../utils/colors.js';
import { PanelStack } from './PanelStack.js';

const DEFAULT_NODE_SELECTED_STYLE = Object.freeze({
  sizeMul: 1.55,
  opacityMul: 1,
  outlineMul: 2.8,
  discard: false,
  forceMaxAlpha: true,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.34, 0.16, 0.02, 0],
});

const DEFAULT_NODE_HIGHLIGHT_STYLE = Object.freeze({
  sizeMul: 1.42,
  opacityMul: 1,
  outlineMul: 1.55,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.02, 0.18, 0.34, 0],
});

const DEFAULT_EDGE_SELECTED_STYLE = Object.freeze({
  widthMul: 1.5,
  opacityMul: 1,
  discard: false,
  forceMaxAlpha: true,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.3, 0.16, 0.04, 0],
});

const DEFAULT_EDGE_HIGHLIGHT_STYLE = Object.freeze({
  widthMul: 1.25,
  opacityMul: 1,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.03, 0.16, 0.28, 0],
});

const NEUTRAL_NODE_NO_STATE_STYLE = Object.freeze({
  sizeMul: 1,
  opacityMul: 1,
  outlineMul: 1,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const NEUTRAL_EDGE_NO_STATE_STYLE = Object.freeze({
  widthMul: 1,
  opacityMul: 1,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_OTHER_SELECTED_NODE_STYLE = Object.freeze({
  sizeMul: 0.9,
  opacityMul: 1,
  outlineMul: 0.72,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_OTHER_SELECTED_EDGE_STYLE = Object.freeze({
  widthMul: 0.84,
  opacityMul: 0.82,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE = Object.freeze({
  sizeMul: 0.96,
  opacityMul: 1,
  outlineMul: 0.86,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE = Object.freeze({
  widthMul: 0.92,
  opacityMul: 0.88,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_AUTO_BACKGROUND_TONE_DISABLED = Object.freeze({
  enabled: false,
  amount: 0.35,
});

const DEFAULT_AUTO_BACKGROUND_TONE_SELECTED = Object.freeze({
  enabled: true,
  amount: 0.38,
});

function subscribe(helios, eventName, handler) {
  if (!helios || typeof handler !== 'function') return () => {};
  if (typeof helios.on === 'function') {
    return helios.on(eventName, handler) ?? (() => {});
  }
  if (typeof helios.addEventListener === 'function') {
    helios.addEventListener(eventName, handler);
    return () => helios.removeEventListener(eventName, handler);
  }
  return () => {};
}

function appendSectionHeading(container, text) {
  const heading = document.createElement('div');
  heading.className = 'helios-ui-label__hint';
  heading.style.margin = '10px 0 6px';
  heading.style.fontWeight = '700';
  heading.style.letterSpacing = '0.02em';
  heading.textContent = text;
  container.appendChild(heading);
  return heading;
}

function rgbaArray(value, fallback) {
  const seed = Array.isArray(fallback) ? fallback : [1, 1, 1, 1];
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) return [...seed];
  return [0, 1, 2, 3].map((index) => {
    const numeric = Number(value[index]);
    return Number.isFinite(numeric) ? numeric : seed[index];
  });
}

function rgbaToHexWithAlpha(value, fallback = '#ffffffff') {
  const rgba = rgbaArray(value, [1, 1, 1, 1]).map((entry, index) => {
    if (index === 3) return Math.max(0, Math.min(1, entry));
    return Math.max(0, Math.min(1, entry));
  });
  const r = Math.round(rgba[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgba[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgba[2] * 255).toString(16).padStart(2, '0');
  const a = Math.round(rgba[3] * 255).toString(16).padStart(2, '0');
  const hex = `#${r}${g}${b}${a}`;
  return /^#[0-9a-f]{8}$/iu.test(hex) ? hex : fallback;
}

function hexWithAlphaToRgba(value, fallback) {
  const seed = rgbaArray(fallback, [1, 1, 1, 1]);
  const raw = String(value ?? '').trim().replace(/^#/, '');
  if (!/^[0-9a-f]{8}$/iu.test(raw)) return seed;
  return [
    Number.parseInt(raw.slice(0, 2), 16) / 255,
    Number.parseInt(raw.slice(2, 4), 16) / 255,
    Number.parseInt(raw.slice(4, 6), 16) / 255,
    Number.parseInt(raw.slice(6, 8), 16) / 255,
  ];
}

function normalizeNodeStyle(style, fallback) {
  const seed = fallback ?? DEFAULT_NODE_SELECTED_STYLE;
  const next = style && typeof style === 'object' ? style : {};
  return {
    sizeMul: clampNumber(next.sizeMul ?? seed.sizeMul, { min: 0, max: 10 }) ?? seed.sizeMul,
    opacityMul: clampNumber(next.opacityMul ?? seed.opacityMul, { min: 0, max: 4 }) ?? seed.opacityMul,
    outlineMul: clampNumber(next.outlineMul ?? seed.outlineMul, { min: 0, max: 10 }) ?? seed.outlineMul,
    discard: next.discard === true,
    forceMaxAlpha: next.forceMaxAlpha === true,
    colorMul: rgbaArray(next.colorMul, seed.colorMul),
    colorAdd: rgbaArray(next.colorAdd, seed.colorAdd),
  };
}

function normalizeEdgeStyle(style, fallback) {
  const seed = fallback ?? DEFAULT_EDGE_SELECTED_STYLE;
  const next = style && typeof style === 'object' ? style : {};
  return {
    widthMul: clampNumber(next.widthMul ?? seed.widthMul, { min: 0, max: 10 }) ?? seed.widthMul,
    opacityMul: clampNumber(next.opacityMul ?? seed.opacityMul, { min: 0, max: 4 }) ?? seed.opacityMul,
    discard: next.discard === true,
    forceMaxAlpha: next.forceMaxAlpha === true,
    colorMul: rgbaArray(next.colorMul, seed.colorMul),
    colorAdd: rgbaArray(next.colorAdd, seed.colorAdd),
  };
}

function backgroundLuminance(color) {
  const rgba = rgbaArray(color, [1, 1, 1, 1]);
  return (rgba[0] * 0.2126) + (rgba[1] * 0.7152) + (rgba[2] * 0.0722);
}

function defaultNormalNodeStyleForBackground(color) {
  if (backgroundLuminance(color) < 0.5) {
    return {
      sizeMul: 0.88,
      opacityMul: 1,
      outlineMul: 0.68,
      discard: false,
      colorMul: [0.64, 0.66, 0.72, 1],
      colorAdd: [0, 0, 0, 0],
    };
  }
  return {
    sizeMul: 0.88,
    opacityMul: 1,
    outlineMul: 0.68,
    discard: false,
    colorMul: [1, 1, 1, 1],
    colorAdd: [0.22, 0.22, 0.24, 0],
  };
}

function defaultNormalEdgeStyleForBackground(color) {
  if (backgroundLuminance(color) < 0.5) {
    return {
      widthMul: 0.78,
      opacityMul: 0.72,
      discard: false,
      colorMul: [0.56, 0.6, 0.68, 1],
      colorAdd: [0, 0, 0, 0],
    };
  }
  return {
    widthMul: 0.78,
    opacityMul: 0.76,
    discard: false,
    colorMul: [1, 1, 1, 1],
    colorAdd: [0.22, 0.22, 0.24, 0],
  };
}

function resolveBackgroundColor(helios) {
  return helios?.background?.() ?? helios?.clearColor?.() ?? [1, 1, 1, 1];
}

function normalizeAutoBackgroundTone(tone, fallback = DEFAULT_AUTO_BACKGROUND_TONE_DISABLED) {
  const seed = fallback && typeof fallback === 'object' ? fallback : DEFAULT_AUTO_BACKGROUND_TONE_DISABLED;
  const next = tone && typeof tone === 'object' ? tone : {};
  return {
    enabled: next.enabled == null ? seed.enabled === true : next.enabled === true,
    amount: clampNumber(next.amount ?? seed.amount, { min: 0, max: 1 }) ?? seed.amount,
  };
}

function applyAutoBackgroundTone(style, backgroundColor, tone) {
  const current = {
    ...style,
    colorMul: rgbaArray(style?.colorMul, [1, 1, 1, 1]),
    colorAdd: rgbaArray(style?.colorAdd, [0, 0, 0, 0]),
  };
  const resolvedTone = normalizeAutoBackgroundTone(tone);
  if (!resolvedTone.enabled) return current;
  const mixAmount = resolvedTone.amount;
  const background = rgbaArray(backgroundColor, [1, 1, 1, 1]);
  if (backgroundLuminance(background) < 0.5) {
    current.colorMul = [
      1 - (mixAmount * (1 - background[0])),
      1 - (mixAmount * (1 - background[1])),
      1 - (mixAmount * (1 - background[2])),
      1,
    ];
    current.colorAdd = [0, 0, 0, 0];
    return current;
  }
  current.colorMul = [1, 1, 1, 1];
  current.colorAdd = [
    background[0] * mixAmount * 0.28,
    background[1] * mixAmount * 0.28,
    background[2] * mixAmount * 0.28,
    0,
  ];
  return current;
}

function isNeutralNodeStateStyle(style) {
  const current = normalizeNodeStyle(style, DEFAULT_NODE_SELECTED_STYLE);
  return current.sizeMul === 1
    && current.opacityMul === 1
    && current.outlineMul === 1
    && current.discard === false
    && current.forceMaxAlpha === false
    && current.colorMul.every((value, index) => value === [1, 1, 1, 1][index])
    && current.colorAdd.every((value) => value === 0);
}

function isNeutralEdgeStateStyle(style) {
  const current = normalizeEdgeStyle(style, DEFAULT_EDGE_SELECTED_STYLE);
  return current.widthMul === 1
    && current.opacityMul === 1
    && current.discard === false
    && current.forceMaxAlpha === false
    && current.colorMul.every((value, index) => value === [1, 1, 1, 1][index])
    && current.colorAdd.every((value) => value === 0);
}

function resolveStringAttributeNames(network) {
  if (!network) return [];
  const entries = [];
  for (const name of network.getNodeAttributeNames?.() ?? []) {
    const info = network.getNodeAttributeInfo?.(name);
    if (info?.type !== AttributeType.String) continue;
    entries.push(String(name));
  }
  entries.sort((a, b) => a.localeCompare(b));
  return entries;
}

function resolvePreferredHoverLabelSource(network) {
  if (!network) return '$id';
  const names = new Map((network.getNodeAttributeNames?.() ?? []).map((name) => [String(name).toLowerCase(), String(name)]));
  for (const key of ['label', 'name', 'title']) {
    const found = names.get(key);
    if (!found) continue;
    const info = network.getNodeAttributeInfo?.(found);
    if (info?.type === AttributeType.String) return found;
  }
  return '$id';
}

function resolveHoverLabelValue(network, source, id) {
  if (!network || !Number.isInteger(id) || id < 0) return null;
  const resolvedSource = source === 'auto' ? resolvePreferredHoverLabelSource(network) : source;
  if (!resolvedSource || resolvedSource === '$id') return String(id);
  const info = network.getNodeAttributeInfo?.(resolvedSource);
  if (!info) return String(id);
  if (info.type === AttributeType.String) {
    const value = network.getNodeStringAttribute?.(resolvedSource, id);
    return value == null || value === '' ? String(id) : String(value);
  }
  return String(id);
}

export class SelectionPanel {
  constructor(ui, options = {}) {
    this.ui = ui;
    this.options = options;
  }

  create() {
    const helios = this.ui.helios ?? null;
    const content = document.createElement('div');
    content.style.setProperty('--helios-ui-label-col', '120px');

    if (!helios) {
      const placeholder = document.createElement('div');
      placeholder.textContent = this.options.placeholder ?? 'Selection controls require a Helios instance.';
      content.appendChild(placeholder);
      return this.ui.createPanel({
        id: this.options.id ?? 'helios-ui-selection',
        title: this.options.title ?? 'Selection',
        position: this.options.position ?? { x: 16, y: 960 },
        dock: this.options.dock ?? 'top-right',
        content,
      });
    }

    const tooltips = createTooltipManager();
    const createRow = (container, { title, hint, controls }) => {
      const built = createAlignedRowEl({
        title,
        hint,
        controls,
        attachTooltip: tooltips.attachTooltip,
      });
      container.appendChild(built.row);
      return built;
    };

    const state = {
      nodeClick: this.options.enableNodeSelection !== false,
      nodeHover: this.options.enableNodeHover !== false,
      edgeClick: this.options.enableEdgeSelection === true,
      edgeHover: this.options.enableEdgeHover === true,
      hoverLabel: this.options.enableHoverLabels !== false,
      hoverLabelSource: this.options.hoverLabelSource ?? 'auto',
      hoverConnectedEdges: this.options.hoverConnectedEdges !== false,
      selectedConnectedEdges: this.options.selectedConnectedEdges !== false,
      hoveredNode: -1,
      hoveredEdge: -1,
      selectedNodes: new Set(),
      selectedEdges: new Set(),
      hoverLabelRestore: null,
      otherSelectedNodeStyle: null,
      otherSelectedEdgeStyle: null,
      otherHighlightNodeStyle: null,
      otherHighlightEdgeStyle: null,
      otherSelectedNodeTone: null,
      otherSelectedEdgeTone: null,
      otherHighlightNodeTone: null,
      otherHighlightEdgeTone: null,
    };

    const backgroundColor = resolveBackgroundColor(helios);
    const legacyNormalNodeStyle = normalizeNodeStyle(
      defaultNormalNodeStyleForBackground(backgroundColor),
      defaultNormalNodeStyleForBackground(backgroundColor),
    );
    const legacyNormalEdgeStyle = normalizeEdgeStyle(
      defaultNormalEdgeStyleForBackground(backgroundColor),
      defaultNormalEdgeStyleForBackground(backgroundColor),
    );
    const defaultOtherSelectedNodeStyle = normalizeNodeStyle(
      DEFAULT_OTHER_SELECTED_NODE_STYLE,
      DEFAULT_OTHER_SELECTED_NODE_STYLE,
    );
    const defaultOtherSelectedEdgeStyle = normalizeEdgeStyle(
      DEFAULT_OTHER_SELECTED_EDGE_STYLE,
      DEFAULT_OTHER_SELECTED_EDGE_STYLE,
    );
    const defaultOtherHighlightNodeStyle = normalizeNodeStyle(
      DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE,
      DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE,
    );
    const defaultOtherHighlightEdgeStyle = normalizeEdgeStyle(
      DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE,
      DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE,
    );

    const ensureStateStyleDefaults = () => {
      if (isNeutralNodeStateStyle(helios.nodeStateStyle?.('SELECTED'))) {
        helios.nodeStateStyle?.('SELECTED', { ...DEFAULT_NODE_SELECTED_STYLE });
      }
      if (isNeutralNodeStateStyle(helios.nodeStateStyle?.('HIGHLIGHTED'))) {
        helios.nodeStateStyle?.('HIGHLIGHTED', { ...DEFAULT_NODE_HIGHLIGHT_STYLE });
      }
      if (isNeutralEdgeStateStyle(helios.edgeStateStyle?.('SELECTED'))) {
        helios.edgeStateStyle?.('SELECTED', { ...DEFAULT_EDGE_SELECTED_STYLE });
      }
      if (isNeutralEdgeStateStyle(helios.edgeStateStyle?.('HIGHLIGHTED'))) {
        helios.edgeStateStyle?.('HIGHLIGHTED', { ...DEFAULT_EDGE_HIGHLIGHT_STYLE });
      }
      const existingNodeNoState = helios.nodeNoStateStyle?.();
      const existingEdgeNoState = helios.edgeNoStateStyle?.();
      const seededNodeNoState = isNeutralNodeStateStyle(existingNodeNoState) ? null : existingNodeNoState;
      const seededEdgeNoState = isNeutralEdgeStateStyle(existingEdgeNoState) ? null : existingEdgeNoState;
      state.otherSelectedNodeStyle = normalizeNodeStyle(
        state.otherSelectedNodeStyle ?? seededNodeNoState ?? defaultOtherSelectedNodeStyle,
        defaultOtherSelectedNodeStyle,
      );
      state.otherSelectedEdgeStyle = normalizeEdgeStyle(
        state.otherSelectedEdgeStyle ?? seededEdgeNoState ?? defaultOtherSelectedEdgeStyle,
        defaultOtherSelectedEdgeStyle,
      );
      state.otherHighlightNodeStyle = normalizeNodeStyle(
        state.otherHighlightNodeStyle ?? legacyNormalNodeStyle,
        defaultOtherHighlightNodeStyle,
      );
      state.otherHighlightEdgeStyle = normalizeEdgeStyle(
        state.otherHighlightEdgeStyle ?? legacyNormalEdgeStyle,
        defaultOtherHighlightEdgeStyle,
      );
      state.otherSelectedNodeTone = normalizeAutoBackgroundTone(
        state.otherSelectedNodeTone,
        DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
      );
      state.otherSelectedEdgeTone = normalizeAutoBackgroundTone(
        state.otherSelectedEdgeTone,
        DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
      );
      state.otherHighlightNodeTone = normalizeAutoBackgroundTone(
        state.otherHighlightNodeTone,
        DEFAULT_AUTO_BACKGROUND_TONE_DISABLED,
      );
      state.otherHighlightEdgeTone = normalizeAutoBackgroundTone(
        state.otherHighlightEdgeTone,
        DEFAULT_AUTO_BACKGROUND_TONE_DISABLED,
      );
    };

    ensureStateStyleDefaults();

    const resolveOtherElementsMode = () => {
      if (state.selectedNodes.size > 0 || state.selectedEdges.size > 0) return 'selected';
      if ((state.nodeHover && state.hoveredNode >= 0) || (state.edgeHover && state.hoveredEdge >= 0)) return 'highlighted';
      return 'neutral';
    };

    const resolveOtherElementsStyle = (mode) => {
      const nextBackground = resolveBackgroundColor(helios);
      if (mode === 'selected') {
        return {
          node: applyAutoBackgroundTone(state.otherSelectedNodeStyle, nextBackground, state.otherSelectedNodeTone),
          edge: applyAutoBackgroundTone(state.otherSelectedEdgeStyle, nextBackground, state.otherSelectedEdgeTone),
        };
      }
      if (mode === 'highlighted') {
        return {
          node: applyAutoBackgroundTone(state.otherHighlightNodeStyle, nextBackground, state.otherHighlightNodeTone),
          edge: applyAutoBackgroundTone(state.otherHighlightEdgeStyle, nextBackground, state.otherHighlightEdgeTone),
        };
      }
      return {
        node: { ...NEUTRAL_NODE_NO_STATE_STYLE },
        edge: { ...NEUTRAL_EDGE_NO_STATE_STYLE },
      };
    };

    const applyOtherElementsState = () => {
      const mode = resolveOtherElementsMode();
      const styles = resolveOtherElementsStyle(mode);
      const graphLayer = helios.renderer?.graphLayer ?? null;
      helios.nodeNoStateStyle?.(styles.node);
      helios.edgeNoStateStyle?.(styles.edge);
      if (graphLayer) {
        const enabled = mode !== 'neutral';
        graphLayer.nodeNoStateStyleEnabled = enabled;
        graphLayer.edgeNoStateStyleEnabled = enabled;
      }
      helios.requestRender?.();
    };

    const applyHoverConnectedEdges = () => {
      const graphLayer = helios.renderer?.graphLayer ?? null;
      if (graphLayer) {
        graphLayer.propagateHoveredNodeToEdges = state.hoverConnectedEdges === true;
      }
      helios.requestRender?.();
    };

    const applySelectedConnectedEdges = () => {
      const graphLayer = helios.renderer?.graphLayer ?? null;
      if (graphLayer) {
        graphLayer.propagateSelectedNodesToEdges = state.selectedConnectedEdges === true;
      }
      helios.requestRender?.();
    };

    const clearNodeHover = () => {
      state.hoveredNode = -1;
      helios.hoverNodeState?.(null, 0);
      applyOtherElementsState();
    };

    const clearEdgeHover = () => {
      state.hoveredEdge = -1;
      helios.hoverEdgeState?.(null, 0);
      applyOtherElementsState();
    };

    const needsNodeHoverTracking = () => state.nodeHover || state.hoverLabel || state.hoverConnectedEdges;
    const needsEdgeHoverTracking = () => state.edgeHover;

    const syncPicking = () => {
      const needsNodePicking = state.nodeClick || needsNodeHoverTracking();
      const needsEdgePicking = state.edgeClick || needsEdgeHoverTracking();
      const options = {
        resolutionScale: this.options.pickingResolutionScale ?? 0.25,
        trackDepth: this.options.pickingTrackDepth === true,
        maxFps: this.options.pickingMaxFps ?? 20,
      };
      if (needsNodePicking) helios.enableNodePicking?.({ ...options, hoverEnabled: needsNodeHoverTracking() });
      else helios.disableNodePicking?.();
      if (needsEdgePicking) helios.enableEdgePicking?.({ ...options, hoverEnabled: needsEdgeHoverTracking() });
      else helios.disableEdgePicking?.();
      if (!needsNodeHoverTracking()) clearNodeHover();
      if (!needsEdgeHoverTracking()) clearEdgeHover();
    };

    const applyHoverLabelConfig = () => {
      if (!state.hoverLabel) {
        if (state.hoverLabelRestore) {
          helios.labels?.(state.hoverLabelRestore);
          state.hoverLabelRestore = null;
        }
        return;
      }
      if (!state.hoverLabelRestore) {
        state.hoverLabelRestore = { ...(helios.labels?.() ?? { enabled: false }) };
      }
      helios.labels?.({
        enabled: true,
        maxVisible: 1,
        source: (id, network) => {
          if (id !== state.hoveredNode || state.hoveredNode < 0) return null;
          return resolveHoverLabelValue(network, state.hoverLabelSource, id);
        },
      });
    };

    const setNodeSelected = (index, selected) => {
      if (!Number.isInteger(index) || index < 0) return;
      if (selected) {
        if (state.selectedNodes.has(index)) return;
        state.selectedNodes.add(index);
      } else {
        if (!state.selectedNodes.has(index)) return;
        state.selectedNodes.delete(index);
      }
      helios.nodeState?.([index], 'SELECTED', { mode: selected ? 'add' : 'remove' });
      applyOtherElementsState();
    };

    const setEdgeSelected = (index, selected) => {
      if (!Number.isInteger(index) || index < 0) return;
      if (selected) {
        if (state.selectedEdges.has(index)) return;
        state.selectedEdges.add(index);
      } else {
        if (!state.selectedEdges.has(index)) return;
        state.selectedEdges.delete(index);
      }
      helios.edgeState?.([index], 'SELECTED', { mode: selected ? 'add' : 'remove' });
      applyOtherElementsState();
    };

    const clearSelection = () => {
      if (state.selectedNodes.size) {
        helios.nodeState?.(Array.from(state.selectedNodes), 'SELECTED', { mode: 'remove' });
        state.selectedNodes.clear();
      }
      if (state.selectedEdges.size) {
        helios.edgeState?.(Array.from(state.selectedEdges), 'SELECTED', { mode: 'remove' });
        state.selectedEdges.clear();
      }
      applyOtherElementsState();
    };

    const selectOnly = (kind, index) => {
      const selectedNodes = Array.from(state.selectedNodes);
      const selectedEdges = Array.from(state.selectedEdges);
      for (const nodeIndex of selectedNodes) {
        if (!(kind === 'node' && nodeIndex === index)) setNodeSelected(nodeIndex, false);
      }
      for (const edgeIndex of selectedEdges) {
        if (!(kind === 'edge' && edgeIndex === index)) setEdgeSelected(edgeIndex, false);
      }
      if (kind === 'node') setNodeSelected(index, true);
      if (kind === 'edge') setEdgeSelected(index, true);
    };

    const toggleSelection = (kind, index) => {
      if (kind === 'node') setNodeSelected(index, !state.selectedNodes.has(index));
      if (kind === 'edge') setEdgeSelected(index, !state.selectedEdges.has(index));
    };

    const statusEl = document.createElement('div');
    statusEl.className = 'helios-ui-label__hint';
    statusEl.style.lineHeight = '1.4';

    const refreshStatus = () => {
      const parts = [];
      parts.push(`${state.selectedNodes.size} node${state.selectedNodes.size === 1 ? '' : 's'} selected`);
      parts.push(`${state.selectedEdges.size} edge${state.selectedEdges.size === 1 ? '' : 's'} selected`);
      statusEl.textContent = parts.join(' • ');
    };

    const interactionBody = document.createElement('div');
    const note = document.createElement('div');
    note.className = 'helios-ui-label__hint';
    note.style.margin = '0 0 10px';
    note.textContent = 'Click selects. Shift-click adds or removes from the current selection.';
    interactionBody.appendChild(note);

    const nodeClickToggle = createToggleControl({
      checked: state.nodeClick,
      ariaLabel: 'Node click selection',
    });
    nodeClickToggle.addEventListener('change', () => {
      state.nodeClick = nodeClickToggle.checked;
      syncPicking();
    });
    createRow(interactionBody, {
      title: 'Node Click',
      hint: 'Click nodes to select them. Shift-click toggles membership for multi-select.',
      controls: nodeClickToggle,
    });

    const nodeHoverToggle = createToggleControl({
      checked: state.nodeHover,
      ariaLabel: 'Node hover highlight',
    });
    nodeHoverToggle.addEventListener('change', () => {
      state.nodeHover = nodeHoverToggle.checked;
      if (!state.nodeHover) clearNodeHover();
      syncPicking();
    });
    createRow(interactionBody, {
      title: 'Node Hover',
      hint: 'Apply the highlighted state style to the hovered node.',
      controls: nodeHoverToggle,
    });

    appendSectionHeading(interactionBody, 'Connected Edges');

    const hoverConnectedEdgesToggle = createToggleControl({
      checked: state.hoverConnectedEdges,
      ariaLabel: 'Connected edges on hover',
    });
    hoverConnectedEdgesToggle.addEventListener('change', () => {
      state.hoverConnectedEdges = hoverConnectedEdgesToggle.checked;
      applyHoverConnectedEdges();
      syncPicking();
    });
    createRow(interactionBody, {
      title: 'Hover',
      hint: 'Highlight incident edges in the shader while a node is hovered, without mutating edge state buffers.',
      controls: hoverConnectedEdgesToggle,
    });

    const selectedConnectedEdgesToggle = createToggleControl({
      checked: state.selectedConnectedEdges,
      ariaLabel: 'Connected edges on selection',
    });
    selectedConnectedEdgesToggle.addEventListener('change', () => {
      state.selectedConnectedEdges = selectedConnectedEdgesToggle.checked;
      applySelectedConnectedEdges();
    });
    createRow(interactionBody, {
      title: 'Selected',
      hint: 'Apply the selected edge style to edges incident to selected nodes through a specialized shader path.',
      controls: selectedConnectedEdgesToggle,
    });

    const edgeClickToggle = createToggleControl({
      checked: state.edgeClick,
      ariaLabel: 'Edge click selection',
    });
    edgeClickToggle.addEventListener('change', () => {
      state.edgeClick = edgeClickToggle.checked;
      syncPicking();
    });
    createRow(interactionBody, {
      title: 'Edge Click',
      hint: 'Enable edge selection. Disabled by default so node picking stays primary in the example.',
      controls: edgeClickToggle,
    });

    const edgeHoverToggle = createToggleControl({
      checked: state.edgeHover,
      ariaLabel: 'Edge hover highlight',
    });
    edgeHoverToggle.addEventListener('change', () => {
      state.edgeHover = edgeHoverToggle.checked;
      if (!state.edgeHover) clearEdgeHover();
      syncPicking();
    });
    createRow(interactionBody, {
      title: 'Edge Hover',
      hint: 'Apply the highlighted state style to hovered edges.',
      controls: edgeHoverToggle,
    });

    const hoverLabelToggle = createToggleControl({
      checked: state.hoverLabel,
      ariaLabel: 'Hover label',
    });
    hoverLabelToggle.addEventListener('change', () => {
      state.hoverLabel = hoverLabelToggle.checked;
      applyHoverLabelConfig();
      syncPicking();
    });
    createRow(interactionBody, {
      title: 'Hover Label',
      hint: 'Show a temporary SVG label only for the currently hovered node.',
      controls: hoverLabelToggle,
    });

    const hoverLabelSourceSelect = createSelectControl({
      ariaLabel: 'Hover label source',
      compact: false,
    });
    hoverLabelSourceSelect.addEventListener('change', () => {
      state.hoverLabelSource = hoverLabelSourceSelect.value || 'auto';
      if (state.hoverLabel) applyHoverLabelConfig();
    });
    createRow(interactionBody, {
      title: 'Label Source',
      hint: 'Node string attribute used for the hover label. Auto prefers label-like names before falling back to $id.',
      controls: hoverLabelSourceSelect,
    });

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'helios-ui-button';
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('aria-label', 'Clear selection');
    clearButton.addEventListener('click', () => {
      clearSelection();
      refreshStatus();
    });
    createRow(interactionBody, {
      title: 'Selection',
      hint: 'Remove all selected node and edge states without changing the interaction settings.',
      controls: clearButton,
    });

    createRow(interactionBody, {
      title: 'Status',
      hint: 'Live summary of the current selection.',
      controls: statusEl,
    });

    const createColorControl = ({ ariaLabel, getValue, setValue, fallback }) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '8px';
      row.style.width = '100%';

      const swatchWrap = document.createElement('div');
      swatchWrap.className = 'helios-ui-color-swatch';

      const swatch = document.createElement('div');
      swatch.className = 'helios-ui-color-swatch__swatch';

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'helios-ui-color-swatch__input';
      colorInput.setAttribute('aria-label', `${ariaLabel} color`);

      const alphaLabel = document.createElement('span');
      alphaLabel.textContent = 'Alpha';
      alphaLabel.style.color = 'var(--helios-ui-muted)';

      const alphaInput = document.createElement('input');
      alphaInput.type = 'number';
      alphaInput.className = 'helios-ui-number';
      alphaInput.min = '0';
      alphaInput.max = '1';
      alphaInput.step = '0.01';
      alphaInput.style.maxWidth = '88px';
      alphaInput.setAttribute('aria-label', `${ariaLabel} alpha`);

      const refresh = () => {
        const hex8 = rgbaToHexWithAlpha(getValue(), rgbaToHexWithAlpha(fallback));
        colorInput.value = `#${hex8.slice(1, 7)}`;
        alphaInput.value = String(Math.round((Number.parseInt(hex8.slice(7, 9), 16) / 255) * 100) / 100);
        swatch.style.background = colorInput.value;
      };

      const commit = () => {
        const alpha = clampNumber(alphaInput.value, { min: 0, max: 1 });
        if (alpha == null) return;
        setValue(hexWithAlphaToRgba(toHex8(colorInput.value, alpha), fallback));
        refresh();
      };

      colorInput.addEventListener('input', commit);
      alphaInput.addEventListener('change', commit);

      swatchWrap.appendChild(swatch);
      swatchWrap.appendChild(colorInput);
      row.appendChild(swatchWrap);
      row.appendChild(alphaLabel);
      row.appendChild(alphaInput);

      return {
        element: row,
        refresh,
        destroy: () => {
          colorInput.removeEventListener('input', commit);
          alphaInput.removeEventListener('change', commit);
        },
      };
    };

    const sliderControls = [];
    const colorControls = [];

    const createNodeStyleSection = (container, stateKey, fallback, options = {}) => {
      appendSectionHeading(container, 'Nodes');
      const getter = options.getStyle ?? (() => normalizeNodeStyle(helios.nodeStateStyle?.(stateKey), fallback));
      const patch = options.patchStyle ?? ((changes) => {
        helios.nodeStateStyle?.(stateKey, normalizeNodeStyle({ ...getter(), ...changes }, fallback));
      });
      const toneGetter = options.getTone ?? null;
      const tonePatch = options.patchTone ?? null;

      const sizeControls = new SuggestedSliderControls({
        value: getter().sizeMul,
        suggested: [0, 3],
        step: 0.05,
        inputMin: 0,
        inputMax: 10,
        onCommit: (value) => patch({ sizeMul: clampNumber(value, { min: 0, max: 10 }) ?? getter().sizeMul }),
      });
      sliderControls.push(sizeControls);
      createRow(container, {
        title: 'Node Size',
        hint: 'Multiplier applied to node size while this state is active.',
        controls: sizeControls.element,
      });

      const opacityControls = new SuggestedSliderControls({
        value: getter().opacityMul,
        suggested: [0, 2],
        step: 0.05,
        inputMin: 0,
        inputMax: 4,
        onCommit: (value) => patch({ opacityMul: clampNumber(value, { min: 0, max: 4 }) ?? getter().opacityMul }),
      });
      sliderControls.push(opacityControls);
      createRow(container, {
        title: 'Node Opacity',
        hint: 'Multiplier applied to node opacity for this state.',
        controls: opacityControls.element,
      });

      const outlineControls = new SuggestedSliderControls({
        value: getter().outlineMul,
        suggested: [0, 3],
        step: 0.05,
        inputMin: 0,
        inputMax: 10,
        onCommit: (value) => patch({ outlineMul: clampNumber(value, { min: 0, max: 10 }) ?? getter().outlineMul }),
      });
      sliderControls.push(outlineControls);
      createRow(container, {
        title: 'Node Outline',
        hint: 'Multiplier applied to node outline width for this state.',
        controls: outlineControls.element,
      });

      const discardToggle = createToggleControl({
        checked: getter().discard,
        ariaLabel: `${stateKey.toLowerCase()} node discard`,
      });
      discardToggle.addEventListener('change', () => patch({ discard: discardToggle.checked }));
      createRow(container, {
        title: 'Node Discard',
        hint: 'Discard matched nodes entirely in the fragment shader.',
        controls: discardToggle,
      });

      let forceMaxAlphaToggle = null;
      if (options.allowForceMaxAlpha !== false) {
        forceMaxAlphaToggle = createToggleControl({
          checked: getter().forceMaxAlpha === true,
          ariaLabel: `${stateKey.toLowerCase()} node force max alpha`,
        });
        forceMaxAlphaToggle.addEventListener('change', () => patch({ forceMaxAlpha: forceMaxAlphaToggle.checked }));
        createRow(container, {
          title: 'Node Max Alpha',
          hint: 'Force the final rendered node alpha to 1.0 whenever this state slot is active.',
          controls: forceMaxAlphaToggle,
        });
      }

      const tintControls = createColorControl({
        ariaLabel: `${stateKey.toLowerCase()} node tint`,
        getValue: () => getter().colorAdd,
        setValue: (value) => patch({ colorAdd: value }),
        fallback: fallback.colorAdd,
      });
      colorControls.push(tintControls);
      createRow(container, {
        title: 'Node Tint',
        hint: 'Additive RGBA tint applied after the base node color.',
        controls: tintControls.element,
      });

      const blendControls = createColorControl({
        ariaLabel: `${stateKey.toLowerCase()} node blend`,
        getValue: () => getter().colorMul,
        setValue: (value) => patch({ colorMul: value }),
        fallback: fallback.colorMul,
      });
      colorControls.push(blendControls);
      createRow(container, {
        title: 'Node Blend',
        hint: 'Multiplicative RGBA blend applied to the base node color.',
        controls: blendControls.element,
      });

      let autoColorToggle = null;
      let autoMixControls = null;
      if (toneGetter && tonePatch) {
        autoColorToggle = createToggleControl({
          checked: toneGetter().enabled === true,
          ariaLabel: `${stateKey.toLowerCase()} node auto color`,
        });
        autoColorToggle.addEventListener('change', () => tonePatch({ enabled: autoColorToggle.checked }));
        createRow(container, {
          title: 'Auto Color',
          hint: 'Use the scene background to choose blend or tint automatically. Manual tint and blend stay available when this is off.',
          controls: autoColorToggle,
        });

        autoMixControls = new SuggestedSliderControls({
          value: toneGetter().amount,
          suggested: [0, 1],
          step: 0.05,
          inputMin: 0,
          inputMax: 1,
          onCommit: (value) => tonePatch({ amount: clampNumber(value, { min: 0, max: 1 }) ?? toneGetter().amount }),
        });
        sliderControls.push(autoMixControls);
        createRow(container, {
          title: 'Auto Mix',
          hint: 'Controls how strongly the automatic background-matched color treatment pulls other nodes toward the scene background.',
          controls: autoMixControls.element,
        });
      }

      return () => {
        const current = getter();
        sizeControls.set(current.sizeMul);
        opacityControls.set(current.opacityMul);
        outlineControls.set(current.outlineMul);
        discardToggle.checked = current.discard;
        if (forceMaxAlphaToggle) forceMaxAlphaToggle.checked = current.forceMaxAlpha === true;
        tintControls.refresh();
        blendControls.refresh();
        if (autoColorToggle) autoColorToggle.checked = toneGetter().enabled === true;
        if (autoMixControls) autoMixControls.set(toneGetter().amount);
      };
    };

    const createEdgeStyleSection = (container, stateKey, fallback, options = {}) => {
      appendSectionHeading(container, 'Edges');
      const getter = options.getStyle ?? (() => normalizeEdgeStyle(helios.edgeStateStyle?.(stateKey), fallback));
      const patch = options.patchStyle ?? ((changes) => {
        helios.edgeStateStyle?.(stateKey, normalizeEdgeStyle({ ...getter(), ...changes }, fallback));
      });
      const toneGetter = options.getTone ?? null;
      const tonePatch = options.patchTone ?? null;

      const widthControls = new SuggestedSliderControls({
        value: getter().widthMul,
        suggested: [0, 3],
        step: 0.05,
        inputMin: 0,
        inputMax: 10,
        onCommit: (value) => patch({ widthMul: clampNumber(value, { min: 0, max: 10 }) ?? getter().widthMul }),
      });
      sliderControls.push(widthControls);
      createRow(container, {
        title: 'Edge Width',
        hint: 'Multiplier applied to edge width while this state is active.',
        controls: widthControls.element,
      });

      const opacityControls = new SuggestedSliderControls({
        value: getter().opacityMul,
        suggested: [0, 2],
        step: 0.05,
        inputMin: 0,
        inputMax: 4,
        onCommit: (value) => patch({ opacityMul: clampNumber(value, { min: 0, max: 4 }) ?? getter().opacityMul }),
      });
      sliderControls.push(opacityControls);
      createRow(container, {
        title: 'Edge Opacity',
        hint: 'Multiplier applied to edge opacity for this state.',
        controls: opacityControls.element,
      });

      const discardToggle = createToggleControl({
        checked: getter().discard,
        ariaLabel: `${stateKey.toLowerCase()} edge discard`,
      });
      discardToggle.addEventListener('change', () => patch({ discard: discardToggle.checked }));
      createRow(container, {
        title: 'Edge Discard',
        hint: 'Discard matched edges entirely in the fragment shader.',
        controls: discardToggle,
      });

      let forceMaxAlphaToggle = null;
      if (options.allowForceMaxAlpha !== false) {
        forceMaxAlphaToggle = createToggleControl({
          checked: getter().forceMaxAlpha === true,
          ariaLabel: `${stateKey.toLowerCase()} edge force max alpha`,
        });
        forceMaxAlphaToggle.addEventListener('change', () => patch({ forceMaxAlpha: forceMaxAlphaToggle.checked }));
        createRow(container, {
          title: 'Edge Max Alpha',
          hint: 'Force the final rendered edge alpha to 1.0 whenever this state slot is active.',
          controls: forceMaxAlphaToggle,
        });
      }

      const tintControls = createColorControl({
        ariaLabel: `${stateKey.toLowerCase()} edge tint`,
        getValue: () => getter().colorAdd,
        setValue: (value) => patch({ colorAdd: value }),
        fallback: fallback.colorAdd,
      });
      colorControls.push(tintControls);
      createRow(container, {
        title: 'Edge Tint',
        hint: 'Additive RGBA tint applied after the base edge color.',
        controls: tintControls.element,
      });

      const blendControls = createColorControl({
        ariaLabel: `${stateKey.toLowerCase()} edge blend`,
        getValue: () => getter().colorMul,
        setValue: (value) => patch({ colorMul: value }),
        fallback: fallback.colorMul,
      });
      colorControls.push(blendControls);
      createRow(container, {
        title: 'Edge Blend',
        hint: 'Multiplicative RGBA blend applied to the base edge color.',
        controls: blendControls.element,
      });

      let autoColorToggle = null;
      let autoMixControls = null;
      if (toneGetter && tonePatch) {
        autoColorToggle = createToggleControl({
          checked: toneGetter().enabled === true,
          ariaLabel: `${stateKey.toLowerCase()} edge auto color`,
        });
        autoColorToggle.addEventListener('change', () => tonePatch({ enabled: autoColorToggle.checked }));
        createRow(container, {
          title: 'Auto Color',
          hint: 'Use the scene background to choose blend or tint automatically. Manual tint and blend stay available when this is off.',
          controls: autoColorToggle,
        });

        autoMixControls = new SuggestedSliderControls({
          value: toneGetter().amount,
          suggested: [0, 1],
          step: 0.05,
          inputMin: 0,
          inputMax: 1,
          onCommit: (value) => tonePatch({ amount: clampNumber(value, { min: 0, max: 1 }) ?? toneGetter().amount }),
        });
        sliderControls.push(autoMixControls);
        createRow(container, {
          title: 'Auto Mix',
          hint: 'Controls how strongly the automatic background-matched color treatment pulls other edges toward the scene background.',
          controls: autoMixControls.element,
        });
      }

      return () => {
        const current = getter();
        widthControls.set(current.widthMul);
        opacityControls.set(current.opacityMul);
        discardToggle.checked = current.discard;
        if (forceMaxAlphaToggle) forceMaxAlphaToggle.checked = current.forceMaxAlpha === true;
        tintControls.refresh();
        blendControls.refresh();
        if (autoColorToggle) autoColorToggle.checked = toneGetter().enabled === true;
        if (autoMixControls) autoMixControls.set(toneGetter().amount);
      };
    };

    const selectedBody = document.createElement('div');
    const refreshSelectedNode = createNodeStyleSection(selectedBody, 'SELECTED', DEFAULT_NODE_SELECTED_STYLE);
    const refreshSelectedEdge = createEdgeStyleSection(selectedBody, 'SELECTED', DEFAULT_EDGE_SELECTED_STYLE);

    const highlightBody = document.createElement('div');
    const refreshHighlightNode = createNodeStyleSection(highlightBody, 'HIGHLIGHTED', DEFAULT_NODE_HIGHLIGHT_STYLE);
    const refreshHighlightEdge = createEdgeStyleSection(highlightBody, 'HIGHLIGHTED', DEFAULT_EDGE_HIGHLIGHT_STYLE);

    const normalBody = document.createElement('div');
    const normalNote = document.createElement('div');
    normalNote.className = 'helios-ui-label__hint';
    normalNote.style.margin = '0 0 10px';
    normalNote.textContent = 'Applies to non-selected, non-highlighted elements while a selection or active highlight exists. Selection takes precedence over highlight.';
    normalBody.appendChild(normalNote);

    appendSectionHeading(normalBody, 'When Selected');
    const refreshSelectedOtherNode = createNodeStyleSection(normalBody, 'other-selected', defaultOtherSelectedNodeStyle, {
      allowForceMaxAlpha: false,
      getStyle: () => normalizeNodeStyle(state.otherSelectedNodeStyle, defaultOtherSelectedNodeStyle),
      patchStyle: (changes) => {
        state.otherSelectedNodeStyle = normalizeNodeStyle({ ...state.otherSelectedNodeStyle, ...changes }, defaultOtherSelectedNodeStyle);
        applyOtherElementsState();
      },
      getTone: () => normalizeAutoBackgroundTone(state.otherSelectedNodeTone, DEFAULT_AUTO_BACKGROUND_TONE_SELECTED),
      patchTone: (changes) => {
        state.otherSelectedNodeTone = normalizeAutoBackgroundTone(
          { ...state.otherSelectedNodeTone, ...changes },
          DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
        );
        applyOtherElementsState();
      },
    });
    const refreshSelectedOtherEdge = createEdgeStyleSection(normalBody, 'other-selected', defaultOtherSelectedEdgeStyle, {
      allowForceMaxAlpha: false,
      getStyle: () => normalizeEdgeStyle(state.otherSelectedEdgeStyle, defaultOtherSelectedEdgeStyle),
      patchStyle: (changes) => {
        state.otherSelectedEdgeStyle = normalizeEdgeStyle({ ...state.otherSelectedEdgeStyle, ...changes }, defaultOtherSelectedEdgeStyle);
        applyOtherElementsState();
      },
      getTone: () => normalizeAutoBackgroundTone(state.otherSelectedEdgeTone, DEFAULT_AUTO_BACKGROUND_TONE_SELECTED),
      patchTone: (changes) => {
        state.otherSelectedEdgeTone = normalizeAutoBackgroundTone(
          { ...state.otherSelectedEdgeTone, ...changes },
          DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
        );
        applyOtherElementsState();
      },
    });

    appendSectionHeading(normalBody, 'When Highlighted');
    const refreshHighlightOtherNode = createNodeStyleSection(normalBody, 'other-highlighted', defaultOtherHighlightNodeStyle, {
      allowForceMaxAlpha: false,
      getStyle: () => normalizeNodeStyle(state.otherHighlightNodeStyle, defaultOtherHighlightNodeStyle),
      patchStyle: (changes) => {
        state.otherHighlightNodeStyle = normalizeNodeStyle({ ...state.otherHighlightNodeStyle, ...changes }, defaultOtherHighlightNodeStyle);
        applyOtherElementsState();
      },
      getTone: () => normalizeAutoBackgroundTone(state.otherHighlightNodeTone, DEFAULT_AUTO_BACKGROUND_TONE_DISABLED),
      patchTone: (changes) => {
        state.otherHighlightNodeTone = normalizeAutoBackgroundTone(
          { ...state.otherHighlightNodeTone, ...changes },
          DEFAULT_AUTO_BACKGROUND_TONE_DISABLED,
        );
        applyOtherElementsState();
      },
    });
    const refreshHighlightOtherEdge = createEdgeStyleSection(normalBody, 'other-highlighted', defaultOtherHighlightEdgeStyle, {
      allowForceMaxAlpha: false,
      getStyle: () => normalizeEdgeStyle(state.otherHighlightEdgeStyle, defaultOtherHighlightEdgeStyle),
      patchStyle: (changes) => {
        state.otherHighlightEdgeStyle = normalizeEdgeStyle({ ...state.otherHighlightEdgeStyle, ...changes }, defaultOtherHighlightEdgeStyle);
        applyOtherElementsState();
      },
      getTone: () => normalizeAutoBackgroundTone(state.otherHighlightEdgeTone, DEFAULT_AUTO_BACKGROUND_TONE_DISABLED),
      patchTone: (changes) => {
        state.otherHighlightEdgeTone = normalizeAutoBackgroundTone(
          { ...state.otherHighlightEdgeTone, ...changes },
          DEFAULT_AUTO_BACKGROUND_TONE_DISABLED,
        );
        applyOtherElementsState();
      },
    });

    const refreshStyleControls = () => {
      refreshSelectedNode();
      refreshSelectedEdge();
      refreshHighlightNode();
      refreshHighlightEdge();
      refreshSelectedOtherNode();
      refreshSelectedOtherEdge();
      refreshHighlightOtherNode();
      refreshHighlightOtherEdge();
    };

    const stack = new PanelStack();
    stack.add({
      id: 'selection-interaction',
      title: 'Interaction',
      collapsed: false,
      statusDot: false,
      content: interactionBody,
    });
    stack.add({
      id: 'selection-style-selected',
      title: 'Selected Style',
      collapsed: false,
      statusDot: false,
      content: selectedBody,
    });
    stack.add({
      id: 'selection-style-highlight',
      title: 'Highlight Style',
      collapsed: true,
      statusDot: false,
      content: highlightBody,
    });
    stack.add({
      id: 'selection-style-normal',
      title: 'Other Elements',
      collapsed: true,
      statusDot: false,
      content: normalBody,
    });
    content.appendChild(stack.element);

    const refreshHoverLabelOptions = () => {
      const network = helios.network ?? null;
      const preferred = resolvePreferredHoverLabelSource(network);
      const names = resolveStringAttributeNames(network);
      const options = [
        { value: 'auto', label: `Auto (${preferred})` },
        { value: '$id', label: '$id' },
        ...names.map((name) => ({ value: name, label: name })),
      ];
      hoverLabelSourceSelect.setOptions(options, state.hoverLabelSource);
      if (!options.some((entry) => entry.value === state.hoverLabelSource)) {
        state.hoverLabelSource = 'auto';
        hoverLabelSourceSelect.value = 'auto';
      }
    };

    const handleGraphClick = (event) => {
      const detail = event?.detail;
      if (!detail) return;
      const shiftKey = detail.modifiers?.shiftKey === true;
      const isNodeHit = detail.kind === 'node' && detail.index >= 0;
      const isEdgeHit = detail.kind === 'edge' && detail.index >= 0;

      if (isNodeHit && state.nodeClick) {
        if (shiftKey) toggleSelection('node', detail.index);
        else selectOnly('node', detail.index);
        refreshStatus();
        return;
      }

      if (isEdgeHit && state.edgeClick) {
        if (shiftKey) toggleSelection('edge', detail.index);
        else selectOnly('edge', detail.index);
        refreshStatus();
        return;
      }

      if (!shiftKey) {
        clearSelection();
        refreshStatus();
      }
    };

    const handleNodeHover = (event) => {
      const detail = event?.detail;
      if (!detail) return;
      if (!needsNodeHoverTracking()) return;
      if (detail.state === 'in') {
        state.hoveredNode = detail.index;
        if (state.nodeHover) helios.hoverNodeState?.(detail.index, 'HIGHLIGHTED');
      } else if (detail.state === 'out' && state.hoveredNode === detail.index) {
        clearNodeHover();
      }
      applyOtherElementsState();
      if (state.hoverLabel) applyHoverLabelConfig();
      refreshStatus();
    };

    const handleEdgeHover = (event) => {
      const detail = event?.detail;
      if (!detail) return;
      if (!needsEdgeHoverTracking()) return;
      if (detail.state === 'in') {
        state.hoveredEdge = detail.index;
        if (state.edgeHover) helios.hoverEdgeState?.(detail.index, 'HIGHLIGHTED');
      } else if (detail.state === 'out' && state.hoveredEdge === detail.index) {
        state.hoveredEdge = -1;
        helios.hoverEdgeState?.(null, 0);
      }
      applyOtherElementsState();
      refreshStatus();
    };

    const handleNetworkReplaced = () => {
      clearSelection();
      clearNodeHover();
      clearEdgeHover();
      refreshHoverLabelOptions();
      ensureStateStyleDefaults();
      applyHoverConnectedEdges();
      applySelectedConnectedEdges();
      applyOtherElementsState();
      refreshStyleControls();
      applyHoverLabelConfig();
      syncPicking();
      refreshStatus();
    };

    refreshHoverLabelOptions();
    refreshStyleControls();
    applyHoverLabelConfig();
    applyHoverConnectedEdges();
    applySelectedConnectedEdges();
    syncPicking();
    applyOtherElementsState();
    refreshStatus();

    const unsubscribers = [
      subscribe(helios, 'graph:click', handleGraphClick),
      subscribe(helios, 'node:hover', handleNodeHover),
      subscribe(helios, 'edge:hover', handleEdgeHover),
      subscribe(helios, 'network:replaced', handleNetworkReplaced),
    ];

    this.ui._controlCleanups.add(() => tooltips.destroy());
    this.ui._controlCleanups.add(() => {
      for (const controls of sliderControls) controls.destroy();
      for (const controls of colorControls) controls.destroy();
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (state.hoverLabelRestore) {
        helios.labels?.(state.hoverLabelRestore);
        state.hoverLabelRestore = null;
      }
      const graphLayer = helios.renderer?.graphLayer ?? null;
      if (graphLayer) {
        graphLayer.propagateHoveredNodeToEdges = false;
        graphLayer.propagateSelectedNodesToEdges = false;
        graphLayer.nodeNoStateStyleEnabled = false;
        graphLayer.edgeNoStateStyleEnabled = false;
      }
      helios.requestRender?.();
      stack.destroy();
    });

    const panel = this.ui.createPanel({
      id: this.options.id ?? 'helios-ui-selection',
      title: this.options.title ?? 'Selection',
      position: this.options.position ?? { x: 16, y: 960 },
      dock: this.options.dock ?? 'top-right',
      content,
    });
    panel.selectionState = state;
    panel.refreshSelectionPanel = () => {
      refreshHoverLabelOptions();
      refreshStyleControls();
      applyOtherElementsState();
      refreshStatus();
    };
    return panel;
  }
}

export default SelectionPanel;
