import { AttributeType } from 'helios-network';
import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { createSegmentedToggleControl } from '../controls/createSegmentedToggleControl.js';
import { createTooltipManager } from '../controls/createTooltipManager.js';
import { createSelectControl } from '../controls/createSelectControl.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { clampNumber } from '../utils/numbers.js';
import { toHex8 } from '../utils/colors.js';
import { PanelStack } from './PanelStack.js';
import { createAttributeRuleEditor } from './AttributeRuleEditor.js';

const DEFAULT_NODE_SELECTED_STYLE = Object.freeze({
  sizeMul: 2,
  opacityMul: 1,
  outlineMul: 2,
  discard: false,
  forceMaxAlpha: true,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.34, 0.16, 0.02, 0],
});

const DEFAULT_NODE_HIGHLIGHT_STYLE = Object.freeze({
  sizeMul: 1.5,
  opacityMul: 1,
  outlineMul: 1.25,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.02, 0.18, 0.34, 0],
});

const DEFAULT_NODE_HOVER_STYLE = Object.freeze({
  sizeMul: 1.35,
  opacityMul: 1,
  outlineMul: 1.1,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.08, 0.08, 0.08, 0],
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
  opacityMul: 50,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.03, 0.16, 0.28, 0],
});

const DEFAULT_EDGE_HOVER_STYLE = Object.freeze({
  widthMul: 1.35,
  opacityMul: 50,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0.08, 0.08, 0.08, 0],
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
  sizeMul: 0.75,
  opacityMul: 1,
  outlineMul: 0.75,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_OTHER_SELECTED_EDGE_STYLE = Object.freeze({
  widthMul: 0.85,
  opacityMul: 0.85,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_OTHER_HIGHLIGHT_NODE_STYLE = Object.freeze({
  sizeMul: 0.9,
  opacityMul: 1,
  outlineMul: 0.9,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_OTHER_HIGHLIGHT_EDGE_STYLE = Object.freeze({
  widthMul: 0.9,
  opacityMul: 0.9,
  discard: false,
  forceMaxAlpha: false,
  colorMul: [1, 1, 1, 1],
  colorAdd: [0, 0, 0, 0],
});

const DEFAULT_AUTO_BACKGROUND_TONE_DISABLED = Object.freeze({
  enabled: true,
  amount: 0.15,
});

const DEFAULT_AUTO_BACKGROUND_TONE_SELECTED = Object.freeze({
  enabled: true,
  amount: 0.4,
});

const DEFAULT_SELECTION_FOCUS_MAX_ZOOM = 3;
const DEFAULT_SELECTION_FOCUS_MIN_DISTANCE = 260;
const DEFAULT_SELECTION_FOCUS_ZOOM_TOLERANCE = 0.05;

const CURRENT_SELECTION_VALUE = '__current_selection__';

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

function normalizeFiniteNumber(value, fallback) {
  if (value == null || `${value}`.trim() === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeNonNegativeNumber(value, fallback) {
  return clampNumber(normalizeFiniteNumber(value, null), { min: 0 }) ?? fallback;
}

function normalizeNodeStyle(style, fallback) {
  const seed = fallback ?? DEFAULT_NODE_SELECTED_STYLE;
  const next = style && typeof style === 'object' ? style : {};
  return {
    sizeMul: normalizeNonNegativeNumber(next.sizeMul ?? seed.sizeMul, seed.sizeMul),
    opacityMul: normalizeNonNegativeNumber(next.opacityMul ?? seed.opacityMul, seed.opacityMul),
    outlineMul: normalizeNonNegativeNumber(next.outlineMul ?? seed.outlineMul, seed.outlineMul),
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
    widthMul: normalizeNonNegativeNumber(next.widthMul ?? seed.widthMul, seed.widthMul),
    opacityMul: normalizeNonNegativeNumber(next.opacityMul ?? seed.opacityMul, seed.opacityMul),
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

function resolveBooleanAttributeNames(network, scope = 'node') {
  if (!network) return [];
  const getNames = scope === 'edge'
    ? network.getEdgeAttributeNames?.bind(network)
    : network.getNodeAttributeNames?.bind(network);
  const getInfo = scope === 'edge'
    ? network.getEdgeAttributeInfo?.bind(network)
    : network.getNodeAttributeInfo?.bind(network);
  const entries = [];
  for (const name of getNames?.() ?? []) {
    const info = getInfo?.(name);
    if (info?.type !== AttributeType.Boolean || info?.dimension !== 1) continue;
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

    const selectionBehavior = helios.useBehavior?.('selection', this.options) ?? helios.behavior?.selection ?? null;
    const hoverBehavior = helios.useBehavior?.('hover', this.options) ?? helios.behavior?.hover ?? null;
    const labelsBehavior = helios.behavior?.labels ?? helios.useBehavior?.('labels');
    if (!selectionBehavior) {
      throw new Error('SelectionPanel requires Helios.behaviors to provide SelectionBehavior.');
    }
    if (!hoverBehavior) {
      throw new Error('SelectionPanel requires Helios.behaviors to provide HoverBehavior.');
    }
    const selectionState = selectionBehavior.state;
    const hoverState = hoverBehavior.state;

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

    const ensureStateStyleDefaults = () => selectionBehavior.ensureStateStyleDefaults();
    const applyOtherElementsState = () => selectionBehavior.applyOtherElementsState();
    const applyHoverConnectedEdges = () => hoverBehavior.applyHoverConnectedEdges();
    const applyHighlightConnectedEdges = () => hoverBehavior.applyHighlightConnectedEdges();
    const applySelectedConnectedEdges = () => selectionBehavior.applySelectedConnectedEdges();
    const clearNodeHover = () => hoverBehavior.clearNodeHover();
    const clearEdgeHover = () => hoverBehavior.clearEdgeHover();
    const syncPicking = () => hoverBehavior.syncPicking();
    const applyHoverLabelConfig = () => hoverBehavior.applyHoverLabelConfig();
    const applySelectionLabelDefaults = () => selectionBehavior.applySelectionLabelDefaults();
    const setSelectionBinding = (value = CURRENT_SELECTION_VALUE) => {
      selectionBehavior.setSelectionBinding(value);
      refreshSavedSelectionOptions();
    };
    const clearSelection = (options = {}) => selectionBehavior.clearSelection(options);
    const applyNodeSelectionSet = (indices, mode = 'add', options = {}) => selectionBehavior.applyNodeSelectionSet(indices, mode, options);
    const applyEdgeSelectionSet = (indices, mode = 'add', options = {}) => selectionBehavior.applyEdgeSelectionSet(indices, mode, options);

    const selectionMessageEl = document.createElement('div');
    selectionMessageEl.className = 'helios-ui-label__hint';
    selectionMessageEl.style.lineHeight = '1.4';
    selectionMessageEl.style.margin = '8px 0 0';
    selectionMessageEl.hidden = true;

    const setSelectionMessage = (message = '') => {
      const text = typeof message === 'string' ? message.trim() : '';
      selectionMessageEl.textContent = text;
      selectionMessageEl.hidden = !text;
    };

    const runNodeSelector = (mode = 'add') => {
      try {
        const rules = nodeSelectorEditor.collectRules();
        if (!rules.length) {
          setSelectionMessage('Add at least one selector before applying it.');
          return;
        }
        selectionBehavior.applyNodeSelectionQuery(rules, mode);
        refreshStatus();
        setSelectionMessage('');
      } catch (error) {
        setSelectionMessage(error instanceof Error ? error.message : String(error));
      }
    };

    const expandSelectionToNeighbors = () => {
      if (!selectionState.selectedNodes.size) {
        setSelectionMessage('Select at least one node before expanding to neighbors.');
        return;
      }
      try {
        selectionBehavior.expandSelectionToNeighbors();
        refreshStatus();
        setSelectionMessage('');
      } catch (error) {
        setSelectionMessage(error instanceof Error ? error.message : String(error));
      }
    };

    const centerSelectedNodesOrNetwork = (options = {}) => selectionBehavior.centerSelectedNodesOrNetwork(options);

    const statusEl = document.createElement('div');
    statusEl.className = 'helios-ui-selection__status helios-ui-label__hint';
    statusEl.style.margin = '0 0 10px';

    const refreshStatus = () => {
      statusEl.textContent = `Status: ${selectionState.selectedNodes.size} node${selectionState.selectedNodes.size === 1 ? '' : 's'} ${selectionState.selectedEdges.size} edge${selectionState.selectedEdges.size === 1 ? '' : 's'}`;
    };

    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'helios-ui-selection__actions';
    actionsWrap.style.display = 'flex';
    actionsWrap.style.flexWrap = 'wrap';
    actionsWrap.style.gap = '8px';
    actionsWrap.style.margin = '0 0 8px';

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'helios-ui-button';
    clearButton.textContent = 'Clear';
    clearButton.setAttribute('aria-label', 'Clear selection');
    clearButton.addEventListener('click', () => {
      clearSelection();
      refreshStatus();
      setSelectionMessage('');
    });
    actionsWrap.appendChild(clearButton);

    const expandButton = document.createElement('button');
    expandButton.type = 'button';
    expandButton.className = 'helios-ui-button';
    expandButton.textContent = 'Expand Neighbors';
    expandButton.setAttribute('aria-label', 'Expand selection to neighbors');
    expandButton.addEventListener('click', () => {
      expandSelectionToNeighbors();
    });
    actionsWrap.appendChild(expandButton);

    const centerButton = document.createElement('button');
    centerButton.type = 'button';
    centerButton.className = 'helios-ui-button';
    centerButton.textContent = 'Center';
    centerButton.setAttribute('aria-label', 'Center on selection');
    centerButton.addEventListener('click', () => {
      centerSelectedNodesOrNetwork();
      setSelectionMessage('');
    });
    actionsWrap.appendChild(centerButton);

    let autoReplaceToggle = null;
    let selectorInterfaceCount = 0;
    let selectorStackEntry = null;

    const getSelectorInterfaceCount = () => {
      const rulesHost = nodeSelectorEditor.element.firstElementChild;
      return rulesHost instanceof HTMLElement ? rulesHost.childElementCount : 0;
    };

    const setSelectorCollapsed = (collapsed) => {
      if (!selectorStackEntry) return;
      selectorStackEntry.item.dataset.collapsed = collapsed ? 'true' : 'false';
      selectorStackEntry.header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      const toggle = selectorStackEntry.header.querySelector('.helios-ui-subpanel__toggle');
      if (toggle) toggle.textContent = collapsed ? '+' : '−';
    };

    const updateSelectorSectionAvailability = (interfaceCount = 0) => {
      const hasSelectors = Number(interfaceCount) > 0;
      selectorApplyWrap.hidden = !hasSelectors;
      if (!selectorStackEntry) return;
      selectorStackEntry.header.disabled = !hasSelectors;
      selectorStackEntry.header.setAttribute('aria-disabled', hasSelectors ? 'false' : 'true');
      if (!hasSelectors) {
        setSelectorCollapsed(true);
      }
    };

    const nodeSelectorEditor = createAttributeRuleEditor({
      helios,
      scope: 'node',
      addPlaceholder: 'Add selector...',
      onDirty: () => {
        const nextInterfaceCount = getSelectorInterfaceCount();
        updateSelectorSectionAvailability(nextInterfaceCount);
        if (nextInterfaceCount > selectorInterfaceCount && selectorStackEntry?.item?.dataset?.collapsed === 'true') {
          setSelectorCollapsed(false);
        }
        selectorInterfaceCount = nextInterfaceCount;
        if (autoReplaceToggle?.checked && nextInterfaceCount > 0) {
          runNodeSelector('replace');
        }
      },
    });

    const savedSelectionWrap = document.createElement('div');
    savedSelectionWrap.className = 'helios-ui-selection__saved';
    savedSelectionWrap.style.display = 'flex';
    savedSelectionWrap.style.alignItems = 'center';
    savedSelectionWrap.style.gap = '8px';
    savedSelectionWrap.style.margin = '0 0 8px';

    const savedSelectionSelect = createSelectControl({
      ariaLabel: 'Saved selection attribute',
    });
    savedSelectionSelect.style.flex = '1 1 0';
    savedSelectionWrap.appendChild(savedSelectionSelect);

    const saveSelectionButton = document.createElement('button');
    saveSelectionButton.type = 'button';
    saveSelectionButton.className = 'helios-ui-button';
    saveSelectionButton.textContent = 'Save';
    saveSelectionButton.setAttribute('aria-label', 'Save selection');
    savedSelectionWrap.appendChild(saveSelectionButton);

    const saveDialog = document.createElement('dialog');
    saveDialog.className = 'helios-ui-dialog';
    saveDialog.setAttribute('aria-label', 'Save selection attribute');

    const saveDialogTitle = document.createElement('div');
    saveDialogTitle.className = 'helios-ui-dialog__title';
    saveDialogTitle.textContent = 'Save Selection';

    const saveDialogHint = document.createElement('div');
    saveDialogHint.className = 'helios-ui-label__hint';
    saveDialogHint.textContent = 'Enter the attribute name used to store this selection.';

    const saveDialogInput = document.createElement('input');
    saveDialogInput.type = 'text';
    saveDialogInput.className = 'helios-ui-text';
    saveDialogInput.placeholder = 'selection_name';
    saveDialogInput.autocomplete = 'off';
    saveDialogInput.spellcheck = false;
    saveDialogInput.setAttribute('aria-label', 'Selection attribute name');

    const saveDialogError = document.createElement('div');
    saveDialogError.className = 'helios-ui-label__hint';
    saveDialogError.style.color = 'var(--helios-ui-danger)';
    saveDialogError.hidden = true;

    const saveDialogActions = document.createElement('div');
    saveDialogActions.className = 'helios-ui-dialog__actions';

    const saveDialogCancel = document.createElement('button');
    saveDialogCancel.type = 'button';
    saveDialogCancel.className = 'helios-ui-button';
    saveDialogCancel.textContent = 'Cancel';
    saveDialogCancel.setAttribute('aria-label', 'Cancel save selection');

    const saveDialogConfirm = document.createElement('button');
    saveDialogConfirm.type = 'button';
    saveDialogConfirm.className = 'helios-ui-button';
    saveDialogConfirm.textContent = 'Save';
    saveDialogConfirm.setAttribute('aria-label', 'Confirm save selection');

    saveDialogActions.appendChild(saveDialogCancel);
    saveDialogActions.appendChild(saveDialogConfirm);
    saveDialog.appendChild(saveDialogTitle);
    saveDialog.appendChild(saveDialogHint);
    saveDialog.appendChild(saveDialogInput);
    saveDialog.appendChild(saveDialogError);
    saveDialog.appendChild(saveDialogActions);
    content.appendChild(saveDialog);

    const closeSaveDialog = () => {
      saveDialogError.hidden = true;
      saveDialogError.textContent = '';
      if (typeof saveDialog.close === 'function' && saveDialog.open) saveDialog.close();
      else saveDialog.removeAttribute('open');
    };

    const openSaveDialog = (value = '') => {
      saveDialogError.hidden = true;
      saveDialogError.textContent = '';
      saveDialogInput.value = value;
      if (typeof saveDialog.showModal === 'function' && !saveDialog.open) saveDialog.showModal();
      else saveDialog.setAttribute('open', '');
      globalThis.setTimeout(() => {
        saveDialogInput.focus();
        saveDialogInput.select();
      }, 0);
    };

    const collectSavedSelectionAttributes = () => selectionBehavior.collectSavedSelectionAttributes();

    const resolveSuggestedSelectionName = () => {
      const entries = collectSavedSelectionAttributes();
      const names = new Set(entries.map((entry) => entry.name));
      const current = selectionState.savedSelectionAttribute !== CURRENT_SELECTION_VALUE
        ? selectionState.savedSelectionAttribute
        : selectionState.lastNamedSelectionAttribute;
      const base = (typeof current === 'string' && current.trim()) ? current.trim() : 'selection';
      if (!names.has(base)) return base;
      let suffix = 2;
      while (names.has(`${base}-${suffix}`)) suffix += 1;
      return `${base}-${suffix}`;
    };

    const refreshSavedSelectionOptions = () => {
      const entries = collectSavedSelectionAttributes();
      const current = typeof selectionState.savedSelectionAttribute === 'string'
        ? selectionState.savedSelectionAttribute
        : CURRENT_SELECTION_VALUE;
      const nextValue = current === CURRENT_SELECTION_VALUE || entries.some((entry) => entry.name === current)
        ? current
        : CURRENT_SELECTION_VALUE;
      const options = [
        {
          value: CURRENT_SELECTION_VALUE,
          label: 'Current Selection',
        },
        ...entries.map((entry) => ({
          value: entry.name,
          label: entry.node && entry.edge
            ? entry.name
            : entry.node
              ? `${entry.name} (nodes)`
              : `${entry.name} (edges)`,
        })),
      ];
      selectionState.savedSelectionAttribute = nextValue;
      savedSelectionSelect.setOptions(options, nextValue);
    };

    const saveSelectionToAttribute = (name) => {
      const trimmed = selectionBehavior.saveSelectionToAttribute(name);
      refreshSavedSelectionOptions();
      savedSelectionSelect.value = trimmed;
      setSelectionMessage('');
      return trimmed;
    };

    const restoreSelectionFromAttribute = (name) => {
      selectionBehavior.restoreSelectionFromAttribute(name);
      refreshStatus();
      setSelectionMessage('');
    };

    savedSelectionSelect.addEventListener('change', () => {
      selectionState.savedSelectionAttribute = savedSelectionSelect.value || CURRENT_SELECTION_VALUE;
      refreshSavedSelectionOptions();
      if (selectionState.savedSelectionAttribute !== CURRENT_SELECTION_VALUE) {
        restoreSelectionFromAttribute(selectionState.savedSelectionAttribute);
      } else {
        setSelectionMessage('');
      }
    });

    saveSelectionButton.addEventListener('click', (event) => {
      if (event.shiftKey === true || selectionState.savedSelectionAttribute === CURRENT_SELECTION_VALUE) {
        openSaveDialog(resolveSuggestedSelectionName());
        return;
      }
      if (selectionState.savedSelectionAttribute && selectionState.savedSelectionAttribute !== CURRENT_SELECTION_VALUE) {
        try {
          saveSelectionToAttribute(selectionState.savedSelectionAttribute);
        } catch (error) {
          setSelectionMessage(error instanceof Error ? error.message : String(error));
        }
      }
    });

    saveDialogCancel.addEventListener('click', () => {
      closeSaveDialog();
    });

    saveDialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeSaveDialog();
    });

    saveDialogInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      saveDialogConfirm.click();
    });

    saveDialogConfirm.addEventListener('click', () => {
      try {
        saveSelectionToAttribute(saveDialogInput.value);
        closeSaveDialog();
      } catch (error) {
        saveDialogError.textContent = error instanceof Error ? error.message : String(error);
        saveDialogError.hidden = false;
      }
    });

    const selectorBody = document.createElement('div');
    selectorBody.appendChild(nodeSelectorEditor.element);

    const selectorApplyWrap = document.createElement('div');
    selectorApplyWrap.style.display = 'flex';
    selectorApplyWrap.style.alignItems = 'center';
    selectorApplyWrap.style.justifyContent = 'space-between';
    selectorApplyWrap.style.gap = '12px';
    selectorApplyWrap.style.marginTop = '8px';

    autoReplaceToggle = createSegmentedToggleControl({
      checked: false,
      onLabel: 'Auto Replace',
      offLabel: 'Manual',
      ariaLabel: 'Automatically replace selection when selector changes',
    });
    autoReplaceToggle.style.transform = 'scale(0.92)';
    autoReplaceToggle.style.transformOrigin = 'left center';
    selectorApplyWrap.appendChild(autoReplaceToggle);

    const selectorButtonsWrap = document.createElement('div');
    selectorButtonsWrap.style.display = 'flex';
    selectorButtonsWrap.style.alignItems = 'center';
    selectorButtonsWrap.style.justifyContent = 'flex-end';
    selectorButtonsWrap.style.gap = '8px';

    const addMatchesButton = document.createElement('button');
    addMatchesButton.type = 'button';
    addMatchesButton.className = 'helios-ui-button';
    addMatchesButton.textContent = 'Add';
    addMatchesButton.setAttribute('aria-label', 'Add selector matches');
    addMatchesButton.addEventListener('click', () => {
      runNodeSelector('add');
    });
    selectorButtonsWrap.appendChild(addMatchesButton);

    const replaceMatchesButton = document.createElement('button');
    replaceMatchesButton.type = 'button';
    replaceMatchesButton.className = 'helios-ui-button';
    replaceMatchesButton.textContent = 'Replace';
    replaceMatchesButton.setAttribute('aria-label', 'Replace node selection with selector matches');
    replaceMatchesButton.addEventListener('click', () => {
      runNodeSelector('replace');
    });
    selectorButtonsWrap.appendChild(replaceMatchesButton);
    selectorApplyWrap.appendChild(selectorButtonsWrap);
    nodeSelectorEditor.element.appendChild(selectorApplyWrap);

    selectorApplyWrap.hidden = true;

    const interactionBody = document.createElement('div');
    const note = document.createElement('div');
    note.className = 'helios-ui-label__hint';
    note.style.margin = '0 0 10px';
    note.textContent = 'Click selects. Double-click follows selected nodes. Shift-click adds or removes from the current selection.';
    interactionBody.appendChild(note);

    const nodeClickToggle = createToggleControl({
      checked: selectionState.nodeClick,
      ariaLabel: 'Node click selection',
    });
    nodeClickToggle.addEventListener('change', () => {
      selectionBehavior.update({ nodeClick: nodeClickToggle.checked });
    });
    createRow(interactionBody, {
      title: 'Node Click',
      hint: 'Click nodes to select them. Shift-click toggles membership for multi-select.',
      controls: nodeClickToggle,
    });

    const nodeHoverToggle = createToggleControl({
      checked: hoverState.nodeHover,
      ariaLabel: 'Node hover highlight',
    });
    nodeHoverToggle.addEventListener('change', () => {
      hoverBehavior.update({ nodeHover: nodeHoverToggle.checked });
      if (!nodeHoverToggle.checked) clearNodeHover();
    });
    createRow(interactionBody, {
      title: 'Node Hover',
      hint: 'Apply the dedicated virtual HOVER style to the single hovered node.',
      controls: nodeHoverToggle,
    });

    const hoverAffectsOtherElementsToggle = createToggleControl({
      checked: hoverState.hoverAffectsOtherElements === true,
      ariaLabel: 'Dim other elements on hover',
    });
    hoverAffectsOtherElementsToggle.addEventListener('change', () => {
      hoverBehavior.update({ hoverAffectsOtherElements: hoverAffectsOtherElementsToggle.checked });
    });
    createRow(interactionBody, {
      title: 'Dim Others on Hover',
      hint: 'Apply the non-highlight style to other elements during virtual HOVER. Disabled by default; real HIGHLIGHTED groups still dim others.',
      controls: hoverAffectsOtherElementsToggle,
    });

    appendSectionHeading(interactionBody, 'Connected Edges');

    const hoverConnectedEdgesToggle = createToggleControl({
      checked: hoverState.hoverConnectedEdges,
      ariaLabel: 'Connected edges on hover',
    });
    hoverConnectedEdgesToggle.addEventListener('change', () => {
      hoverBehavior.update({ hoverConnectedEdges: hoverConnectedEdgesToggle.checked });
    });
    createRow(interactionBody, {
      title: 'Hover',
      hint: 'Apply the dedicated virtual HOVER edge style to incident edges while a node is hovered, without mutating edge state buffers.',
      controls: hoverConnectedEdgesToggle,
    });

    const highlightConnectedEdgesToggle = createToggleControl({
      checked: hoverState.highlightConnectedEdges === true,
      ariaLabel: 'Connected edges on highlight',
    });
    highlightConnectedEdgesToggle.addEventListener('change', () => {
      hoverBehavior.update({ highlightConnectedEdges: highlightConnectedEdgesToggle.checked });
    });
    createRow(interactionBody, {
      title: 'Highlight',
      hint: 'Apply the real HIGHLIGHTED edge style to edges incident to source-managed highlighted nodes, such as legend hover.',
      controls: highlightConnectedEdgesToggle,
    });

    const selectedConnectedEdgesToggle = createToggleControl({
      checked: selectionState.selectedConnectedEdges,
      ariaLabel: 'Connected edges on selection',
    });
    selectedConnectedEdgesToggle.addEventListener('change', () => {
      selectionBehavior.update({ selectedConnectedEdges: selectedConnectedEdgesToggle.checked });
    });
    createRow(interactionBody, {
      title: 'Selected',
      hint: 'Apply the selected edge style to edges incident to selected nodes through a specialized shader path.',
      controls: selectedConnectedEdgesToggle,
    });

    const edgeClickToggle = createToggleControl({
      checked: selectionState.edgeClick,
      ariaLabel: 'Edge click selection',
    });
    edgeClickToggle.addEventListener('change', () => {
      selectionBehavior.update({ edgeClick: edgeClickToggle.checked });
    });
    createRow(interactionBody, {
      title: 'Edge Click',
      hint: 'Enable edge selection. Disabled by default so node picking stays primary in the example.',
      controls: edgeClickToggle,
    });

    const edgeHoverToggle = createToggleControl({
      checked: hoverState.edgeHover,
      ariaLabel: 'Edge hover highlight',
    });
    edgeHoverToggle.addEventListener('change', () => {
      hoverBehavior.update({ edgeHover: edgeHoverToggle.checked });
      if (!edgeHoverToggle.checked) clearEdgeHover();
    });
    createRow(interactionBody, {
      title: 'Edge Hover',
      hint: 'Apply the dedicated virtual HOVER style to the single hovered edge.',
      controls: edgeHoverToggle,
    });

    const hoverLabelToggle = createToggleControl({
      checked: hoverState.hoverLabel,
      ariaLabel: 'Hover label',
    });
    hoverLabelToggle.addEventListener('change', () => {
      hoverBehavior.update({ hoverLabel: hoverLabelToggle.checked });
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
      hoverBehavior.update({ hoverLabelSource: hoverLabelSourceSelect.value || 'auto' });
    });
    createRow(interactionBody, {
      title: 'Label Source',
      hint: 'Node string attribute used for the hover label. Auto prefers label-like names before falling back to $id.',
      controls: hoverLabelSourceSelect,
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
        onCommit: (value) => patch({ sizeMul: normalizeNonNegativeNumber(value, getter().sizeMul) }),
      });
      sliderControls.push(sizeControls);
      createRow(container, {
        title: 'Size',
        hint: 'Multiplier applied to node size while this state is active.',
        controls: sizeControls.element,
      });

      const opacityControls = new SuggestedSliderControls({
        value: getter().opacityMul,
        suggested: [0, 5],
        step: 0.05,
        inputMin: 0,
        onCommit: (value) => patch({ opacityMul: normalizeNonNegativeNumber(value, getter().opacityMul) }),
      });
      sliderControls.push(opacityControls);
      createRow(container, {
        title: 'Opacity Gain',
        hint: 'Gain applied to node opacity for this state. The slider suggests a typical range, but typed values can be any non-negative number.',
        controls: opacityControls.element,
      });

      const outlineControls = new SuggestedSliderControls({
        value: getter().outlineMul,
        suggested: [0, 3],
        step: 0.05,
        inputMin: 0,
        onCommit: (value) => patch({ outlineMul: normalizeNonNegativeNumber(value, getter().outlineMul) }),
      });
      sliderControls.push(outlineControls);
      createRow(container, {
        title: 'Outline',
        hint: 'Multiplier applied to node outline width for this state.',
        controls: outlineControls.element,
      });

      const discardToggle = createToggleControl({
        checked: getter().discard,
        ariaLabel: `${stateKey.toLowerCase()} node discard`,
      });
      discardToggle.addEventListener('change', () => patch({ discard: discardToggle.checked }));
      createRow(container, {
        title: 'Discard',
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
          title: 'Visibility Boost',
          hint: 'Force full opacity in normal blending and apply a strong accumulation boost in weighted transparency whenever this state slot is active.',
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
        title: 'Tint',
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
        title: 'Blend',
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
        onCommit: (value) => patch({ widthMul: normalizeNonNegativeNumber(value, getter().widthMul) }),
      });
      sliderControls.push(widthControls);
      createRow(container, {
        title: 'Width',
        hint: 'Multiplier applied to edge width while this state is active.',
        controls: widthControls.element,
      });

      const opacityControls = new SuggestedSliderControls({
        value: getter().opacityMul,
        suggested: [0, 5],
        step: 0.05,
        inputMin: 0,
        onCommit: (value) => patch({ opacityMul: normalizeNonNegativeNumber(value, getter().opacityMul) }),
      });
      sliderControls.push(opacityControls);
      createRow(container, {
        title: 'Opacity Gain',
        hint: 'Gain applied to edge opacity for this state. The slider suggests a typical range, but typed values can be any non-negative number.',
        controls: opacityControls.element,
      });

      const discardToggle = createToggleControl({
        checked: getter().discard,
        ariaLabel: `${stateKey.toLowerCase()} edge discard`,
      });
      discardToggle.addEventListener('change', () => patch({ discard: discardToggle.checked }));
      createRow(container, {
        title: 'Discard',
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
          title: 'Visibility Boost',
          hint: 'Force full opacity in normal blending and apply a strong accumulation boost in weighted transparency whenever this state slot is active.',
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
        title: 'Tint',
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
        title: 'Blend',
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

    const hoverBody = document.createElement('div');
    const hoverCopyToggle = createToggleControl({
      checked: hoverState.hoverStyleFromHighlight === true,
      ariaLabel: 'Copy hover style from highlighted',
    });
    hoverCopyToggle.addEventListener('change', () => {
      hoverBehavior.update({ hoverStyleFromHighlight: hoverCopyToggle.checked });
    });
    createRow(hoverBody, {
      title: 'Use Highlight Style',
      hint: 'Copy the real HIGHLIGHTED node and edge styles into the virtual HOVER style. Disabled by default so hover and group highlight stay visually distinct.',
      controls: hoverCopyToggle,
    });

    const hoverCopyNote = document.createElement('div');
    hoverCopyNote.className = 'helios-ui-label__hint';
    hoverCopyNote.style.display = 'none';
    hoverCopyNote.style.margin = '8px 0 10px';
    hoverCopyNote.style.padding = '8px 10px';
    hoverCopyNote.style.border = '1px solid rgba(128, 128, 128, 0.42)';
    hoverCopyNote.style.borderRadius = '6px';
    hoverCopyNote.style.background = 'rgba(128, 128, 128, 0.10)';
    hoverCopyNote.textContent = 'HOVER is currently copying HIGHLIGHTED. Hover style controls are shown read-only until this option is disabled.';
    hoverBody.appendChild(hoverCopyNote);

    const hoverStyleControls = document.createElement('div');
    hoverBody.appendChild(hoverStyleControls);
    const refreshHoverNode = createNodeStyleSection(hoverStyleControls, 'HOVER', DEFAULT_NODE_HOVER_STYLE, {
      getStyle: () => normalizeNodeStyle(helios.nodeHoverStyle?.(), DEFAULT_NODE_HOVER_STYLE),
      patchStyle: (changes) => {
        helios.nodeHoverStyle?.(normalizeNodeStyle({ ...normalizeNodeStyle(helios.nodeHoverStyle?.(), DEFAULT_NODE_HOVER_STYLE), ...changes }, DEFAULT_NODE_HOVER_STYLE));
      },
    });
    const refreshHoverEdge = createEdgeStyleSection(hoverStyleControls, 'HOVER', DEFAULT_EDGE_HOVER_STYLE, {
      getStyle: () => normalizeEdgeStyle(helios.edgeHoverStyle?.(), DEFAULT_EDGE_HOVER_STYLE),
      patchStyle: (changes) => {
        helios.edgeHoverStyle?.(normalizeEdgeStyle({ ...normalizeEdgeStyle(helios.edgeHoverStyle?.(), DEFAULT_EDGE_HOVER_STYLE), ...changes }, DEFAULT_EDGE_HOVER_STYLE));
      },
    });

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
      getStyle: () => normalizeNodeStyle(selectionState.otherSelectedNodeStyle, defaultOtherSelectedNodeStyle),
      patchStyle: (changes) => {
        selectionBehavior.update({
          otherSelectedNodeStyle: normalizeNodeStyle({ ...selectionState.otherSelectedNodeStyle, ...changes }, defaultOtherSelectedNodeStyle),
        });
      },
      getTone: () => normalizeAutoBackgroundTone(selectionState.otherSelectedNodeTone, DEFAULT_AUTO_BACKGROUND_TONE_SELECTED),
      patchTone: (changes) => {
        selectionBehavior.update({
          otherSelectedNodeTone: normalizeAutoBackgroundTone(
            { ...selectionState.otherSelectedNodeTone, ...changes },
            DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
          ),
        });
      },
    });
    const refreshSelectedOtherEdge = createEdgeStyleSection(normalBody, 'other-selected', defaultOtherSelectedEdgeStyle, {
      allowForceMaxAlpha: false,
      getStyle: () => normalizeEdgeStyle(selectionState.otherSelectedEdgeStyle, defaultOtherSelectedEdgeStyle),
      patchStyle: (changes) => {
        selectionBehavior.update({
          otherSelectedEdgeStyle: normalizeEdgeStyle({ ...selectionState.otherSelectedEdgeStyle, ...changes }, defaultOtherSelectedEdgeStyle),
        });
      },
      getTone: () => normalizeAutoBackgroundTone(selectionState.otherSelectedEdgeTone, DEFAULT_AUTO_BACKGROUND_TONE_SELECTED),
      patchTone: (changes) => {
        selectionBehavior.update({
          otherSelectedEdgeTone: normalizeAutoBackgroundTone(
            { ...selectionState.otherSelectedEdgeTone, ...changes },
            DEFAULT_AUTO_BACKGROUND_TONE_SELECTED,
          ),
        });
      },
    });

    appendSectionHeading(normalBody, 'When Highlighted');
    const refreshHighlightOtherNode = createNodeStyleSection(normalBody, 'other-highlighted', defaultOtherHighlightNodeStyle, {
      allowForceMaxAlpha: false,
      getStyle: () => normalizeNodeStyle(hoverState.otherHighlightNodeStyle, defaultOtherHighlightNodeStyle),
      patchStyle: (changes) => {
        hoverBehavior.update({
          otherHighlightNodeStyle: normalizeNodeStyle({ ...hoverState.otherHighlightNodeStyle, ...changes }, defaultOtherHighlightNodeStyle),
        });
      },
      getTone: () => normalizeAutoBackgroundTone(hoverState.otherHighlightNodeTone, DEFAULT_AUTO_BACKGROUND_TONE_DISABLED),
      patchTone: (changes) => {
        hoverBehavior.update({
          otherHighlightNodeTone: normalizeAutoBackgroundTone(
            { ...hoverState.otherHighlightNodeTone, ...changes },
            DEFAULT_AUTO_BACKGROUND_TONE_DISABLED,
          ),
        });
      },
    });
    const refreshHighlightOtherEdge = createEdgeStyleSection(normalBody, 'other-highlighted', defaultOtherHighlightEdgeStyle, {
      allowForceMaxAlpha: false,
      getStyle: () => normalizeEdgeStyle(hoverState.otherHighlightEdgeStyle, defaultOtherHighlightEdgeStyle),
      patchStyle: (changes) => {
        hoverBehavior.update({
          otherHighlightEdgeStyle: normalizeEdgeStyle({ ...hoverState.otherHighlightEdgeStyle, ...changes }, defaultOtherHighlightEdgeStyle),
        });
      },
      getTone: () => normalizeAutoBackgroundTone(hoverState.otherHighlightEdgeTone, DEFAULT_AUTO_BACKGROUND_TONE_DISABLED),
      patchTone: (changes) => {
        hoverBehavior.update({
          otherHighlightEdgeTone: normalizeAutoBackgroundTone(
            { ...hoverState.otherHighlightEdgeTone, ...changes },
            DEFAULT_AUTO_BACKGROUND_TONE_DISABLED,
          ),
        });
      },
    });

    const refreshStyleControls = () => {
      refreshSelectedNode();
      refreshSelectedEdge();
      refreshHoverNode();
      refreshHoverEdge();
      refreshHighlightNode();
      refreshHighlightEdge();
      refreshSelectedOtherNode();
      refreshSelectedOtherEdge();
      refreshHighlightOtherNode();
      refreshHighlightOtherEdge();
      const copyHover = hoverState.hoverStyleFromHighlight === true || helios.hoverStyleFromHighlight?.() === true;
      hoverCopyToggle.checked = copyHover;
      hoverCopyNote.style.display = copyHover ? 'block' : 'none';
      hoverStyleControls.style.opacity = copyHover ? '0.56' : '';
      hoverStyleControls.style.pointerEvents = copyHover ? 'none' : '';
      hoverConnectedEdgesToggle.checked = hoverState.hoverConnectedEdges === true;
      hoverAffectsOtherElementsToggle.checked = hoverState.hoverAffectsOtherElements === true;
      highlightConnectedEdgesToggle.checked = hoverState.highlightConnectedEdges === true && helios.highlightConnectedEdges?.() === true;
    };

    const styleBody = document.createElement('div');
    const styleStack = new PanelStack();
    styleStack.add({
      id: 'selection-style-interaction',
      title: 'Interaction',
      collapsed: true,
      statusDot: false,
      content: interactionBody,
    });
    styleStack.add({
      id: 'selection-style-selected',
      title: 'Selected',
      collapsed: true,
      statusDot: false,
      content: selectedBody,
    });
    styleStack.add({
      id: 'selection-style-hover',
      title: 'Hover',
      collapsed: true,
      statusDot: false,
      content: hoverBody,
    });
    styleStack.add({
      id: 'selection-style-highlight',
      title: 'Highlight',
      collapsed: true,
      statusDot: false,
      content: highlightBody,
    });
    styleStack.add({
      id: 'selection-style-normal',
      title: 'Other Elements',
      collapsed: true,
      statusDot: false,
      content: normalBody,
    });
    styleBody.appendChild(styleStack.element);

    content.appendChild(statusEl);
    content.appendChild(actionsWrap);
    content.appendChild(savedSelectionWrap);
    content.appendChild(selectionMessageEl);

    const stack = new PanelStack();
    stack.add({
      id: 'selection-selectors',
      title: 'Selectors',
      collapsed: true,
      statusDot: false,
      headerControls: nodeSelectorEditor.addSelect,
      content: selectorBody,
    });
    selectorStackEntry = stack._items.get('selection-selectors') ?? null;
    stack.add({
      id: 'selection-style',
      title: 'Style',
      collapsed: true,
      statusDot: false,
      content: styleBody,
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
      hoverLabelSourceSelect.setOptions(options, hoverState.hoverLabelSource);
      if (!options.some((entry) => entry.value === hoverState.hoverLabelSource)) {
        hoverState.hoverLabelSource = 'auto';
        hoverLabelSourceSelect.value = 'auto';
      }
    };

    let networkAttributeUnsub = null;
    const attachNetworkAttributeListeners = () => {
      if (networkAttributeUnsub) {
        networkAttributeUnsub();
        networkAttributeUnsub = null;
      }
      const network = helios.network ?? null;
      if (!network) return;
      const handler = (event) => {
        const scope = event?.detail?.scope;
        const type = event?.type ?? '';
        if ((!scope || scope === 'node') && (
          type !== 'attribute:changed'
          || event?.detail?.op === 'categorize'
          || event?.detail?.op === 'decategorize'
        )) {
          nodeSelectorEditor.refreshFromNetwork();
        }
        if (!scope || scope === 'node' || scope === 'edge') {
          refreshSavedSelectionOptions();
        }
      };
      if (typeof network.on === 'function') {
        const unsubs = [
          network.on('attribute:defined', handler),
          network.on('attribute:removed', handler),
          network.on('attribute:changed', handler),
        ];
        networkAttributeUnsub = () => {
          for (const unsubscribe of unsubs) unsubscribe?.();
        };
      } else if (typeof network.addEventListener === 'function') {
        network.addEventListener('attribute:defined', handler);
        network.addEventListener('attribute:removed', handler);
        network.addEventListener('attribute:changed', handler);
        networkAttributeUnsub = () => {
          network.removeEventListener('attribute:defined', handler);
          network.removeEventListener('attribute:removed', handler);
          network.removeEventListener('attribute:changed', handler);
        };
      }
    };

    refreshHoverLabelOptions();
    refreshSavedSelectionOptions();
    nodeSelectorEditor.refreshFromNetwork();
    selectorInterfaceCount = getSelectorInterfaceCount();
    updateSelectorSectionAvailability(selectorInterfaceCount);
    refreshStyleControls();
    refreshStatus();
    attachNetworkAttributeListeners();

    const unsubscribers = [
      selectionBehavior.on('change', () => {
        refreshStatus();
        refreshSavedSelectionOptions();
        refreshStyleControls();
      }),
      hoverBehavior.on('change', () => {
        refreshStyleControls();
        refreshHoverLabelOptions();
      }),
    ];

    this.ui._controlCleanups.add(() => tooltips.destroy());
    this.ui._controlCleanups.add(() => {
      for (const controls of sliderControls) controls.destroy();
      for (const controls of colorControls) controls.destroy();
      for (const unsubscribe of unsubscribers) unsubscribe();
      networkAttributeUnsub?.();
      nodeSelectorEditor.destroy();
      closeSaveDialog();
      saveDialog.remove();
      styleStack.destroy();
      stack.destroy();
    });

    const panel = this.ui.createPanel({
      id: this.options.id ?? 'helios-ui-selection',
      title: this.options.title ?? 'Selection',
      position: this.options.position ?? { x: 16, y: 960 },
      dock: this.options.dock ?? 'top-right',
      content,
    });
    panel.selectionState = selectionState;
    panel.selectionBehavior = selectionBehavior;
    panel.hoverState = hoverState;
    panel.hoverBehavior = hoverBehavior;
    panel.labelsBehavior = labelsBehavior ?? null;
    panel.refreshSelectionPanel = () => {
      nodeSelectorEditor.refreshFromNetwork();
      selectorInterfaceCount = getSelectorInterfaceCount();
      updateSelectorSectionAvailability(selectorInterfaceCount);
      refreshHoverLabelOptions();
      refreshSavedSelectionOptions();
      refreshStyleControls();
      refreshStatus();
    };
    return panel;
  }
}

export default SelectionPanel;
