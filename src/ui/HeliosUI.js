import { AttributeType } from 'helios-network';
import { PanelManager } from './panels/PanelManager.js';
import { UIAttribute } from './state/UIAttribute.js';
import { ensureDefaultStyles } from './style/defaultStyles.js';
import { defineHeliosWebComponents } from './web-components/defineHeliosWebComponents.js';
import { createSliderRow } from './controls/createSliderRow.js';
import { createAlignedRowEl } from './controls/createAlignedRowEl.js';
import { createDirtyIndicator } from './controls/createDirtyIndicator.js';
import { createFpsThrottle } from './controls/createFpsThrottle.js';
import { createTooltipManager } from './controls/createTooltipManager.js';
import { createToggleControl } from './controls/createToggleControl.js';
import { createSegmentedToggleControl } from './controls/createSegmentedToggleControl.js';
import { createSelectControl } from './controls/createSelectControl.js';
import { createLightDirectionControl } from './controls/LightDirectionControl.js';
import { PanelStack } from './panels/PanelStack.js';
import { TabbedPanel } from './panels/TabbedPanel.js';
import {
  FILTERS_PANEL_SCHEMA,
  SCENE_PANEL_SCHEMA,
  createPanelSchemaIndicator,
  humanizeControlLabel,
} from './panels/panelSchema.js';
import { colormaps } from '../colors/colormaps.js';
import { VISUAL_ATTRIBUTE_MAP } from '../pipeline/constants.js';
import { MappersPanel } from './panels/MappersPanel.js';
import { LayoutPanel } from './panels/LayoutPanel.js';
import { LegendsPanel } from './panels/LegendsPanel.js';
import { CameraPanel } from './panels/CameraPanel.js';
import { SelectionPanel } from './panels/SelectionPanel.js';
import { createAttributeRuleEditor } from './panels/AttributeRuleEditor.js';
import { createPanelIcon, resolvePanelIconKind } from './panelIcons.js';
import { clampNumber } from './utils/numbers.js';
import { toHex8 } from './utils/colors.js';
import { isPublicAttributeName } from './utils/attributes.js';
import { shallowCloneChannelConfig } from './utils/channelConfig.js';
import { HeliosFilter } from '../filters/HeliosFilter.js';
import { AMBIENT_OCCLUSION_MODE_OPTIONS } from '../rendering/engine/AmbientOcclusionMode.js';
import { AMBIENT_OCCLUSION_QUALITY_OPTIONS } from '../rendering/engine/AmbientOcclusionQuality.js';
import {
  buildFigureExportPresetList,
  normalizeFigureExportFilename,
  resolveFigureExportOptions,
  resolveFigurePreviewThumbnailOptions,
} from '../export/figureExport.js';

const INTERFACE_CONTROL_RELEASE_MS = 420;
const FULLSCREEN_OVERLAY_LEFT_INSET_PX = 28;

function storageCapabilities(helios) {
  return helios?.storage?.capabilities ?? {};
}

function storageSupportsPersistentUI(helios) {
  const capabilities = storageCapabilities(helios);
  return capabilities.persistent === true || capabilities.sessions === true;
}

function storageSupportsSessions(helios) {
  return storageCapabilities(helios).sessions === true;
}

const STATE_ACCESSOR_PATHS = Object.freeze({
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
  labelsMode: 'labels.mode',
  labelsSelectedOnlySpaceAware: 'labels.selectedOnlySpaceAware',
  labelsEnabled: 'labels.enabled',
  labelsMaxVisible: 'labels.maxVisible',
  labelsFontSizeScale: 'labels.fontSizeScale',
  labelsMinScreenRadius: 'labels.minScreenRadius',
  labelsOutlineWidth: 'labels.outlineWidth',
  labelsOffsetRadiusFactor: 'labels.offsetRadiusFactor',
  labelsOffsetPx: 'labels.offsetPx',
  labelsMaxChars: 'labels.maxChars',
  labelsMaxRows: 'labels.maxRows',
  legendsEnabled: 'legends.enabled',
});

const STATE_ACCESSOR_DEBOUNCE_MS = 180;
const BASELINE_REFRESH_IGNORED_OVERRIDES = new Set(['exporter.baseName', 'exporter.preset']);

function stateScopeForPath(path) {
  const root = String(path ?? '').split('.')[0];
  if (root === 'ui' || root === 'interface') return 'user';
  if (root === 'network' || root === 'positions') return 'workspace';
  return 'network';
}

function persistencePanelPathForId(id, title = '') {
  const normalizedId = String(id ?? '').trim();
  const normalizedTitle = String(title ?? '').trim().toLowerCase();
  if (normalizedId === 'helios-ui-mappers' || normalizedTitle === 'mappers') return 'mappers';
  if (normalizedId === 'helios-ui-filter' || normalizedTitle === 'filter' || normalizedTitle === 'filters') return 'filters';
  if (normalizedId === 'helios-ui-layout' || normalizedTitle === 'layout') return 'layout';
  if (normalizedId === 'helios-ui-legends' || normalizedTitle === 'legends') return 'legends';
  if (normalizedId === 'helios-ui-camera' || normalizedTitle === 'camera') return 'camera';
  if (normalizedId === 'helios-ui-selection' || normalizedTitle === 'selection') return 'selection';
  if (normalizedId === 'helios-ui-metrics' || normalizedTitle === 'metrics') return 'metrics';
  return null;
}

function stateDebounceForPath(path) {
  const text = String(path ?? '');
  if (text.startsWith('camera.')) return 500;
  if (text.startsWith('layout.')) return 220;
  if (text.startsWith('mappers.') || text.startsWith('filters.')) return 300;
  return STATE_ACCESSOR_DEBOUNCE_MS;
}

function clonePersistenceValue(value) {
  if (value == null || typeof value !== 'object') return value;
  try {
    if (typeof structuredClone === 'function') return structuredClone(value);
  } catch (_) {
    // Fall back to JSON cloning below.
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function stateValueSignature(value) {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return String(value);
  }
}

function scopeForStatePath(path) {
  const parts = String(path ?? '').split('.').filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return parts[0] ?? '';
}

function resolveUiContainer({ helios, container, layerName }) {
  if (container) return container;
  if (helios?.layers?.layers && typeof helios.layers.addLayer === 'function') {
    const layer = document.createElement('div');
    layer.className = 'helios-ui';
    helios.layers.addLayer(layerName ?? 'ui', layer);
    return layer;
  }
  const fallback = document.createElement('div');
  fallback.className = 'helios-ui';
  (document.body ?? document.documentElement).appendChild(fallback);
  return fallback;
}

function createStatChip(labelText, valueEl) {
  const stat = document.createElement('div');
  stat.className = 'helios-ui-stat';
  const label = document.createElement('div');
  label.className = 'helios-ui-stat__label';
  label.textContent = labelText;
  const value = valueEl ?? document.createElement('div');
  if (!valueEl) {
    value.className = 'helios-ui-stat__value';
    value.textContent = '—';
  } else {
    value.classList.add('helios-ui-stat__value');
  }
  stat.appendChild(label);
  stat.appendChild(value);
  return { stat, label, value };
}

function formatAttributeType(type) {
  switch (type) {
    case AttributeType.Boolean: return 'Boolean';
    case AttributeType.Float: return 'Float';
    case AttributeType.Double: return 'Double';
    case AttributeType.Integer: return 'Integer';
    case AttributeType.UnsignedInteger: return 'Unsigned Integer';
    case AttributeType.Category: return 'Category';
    case AttributeType.String: return 'String';
    case AttributeType.Data: return 'Data';
    case AttributeType.Javascript: return 'Javascript';
    case AttributeType.BigInteger: return 'Big Integer';
    case AttributeType.UnsignedBigInteger: return 'Unsigned Big Integer';
    case AttributeType.MultiCategory: return 'Multi Category';
    default: return String(type ?? 'Unknown');
  }
}

function isHiddenAppAttributeName(name) {
  return typeof name === 'string' && name.startsWith('_');
}

function summarizeChannelConfig(config) {
  if (!config) return '—';
  const type = config.type ?? config.mode ?? 'custom';
  const attr = config.attributes ?? config.from;
  if (type === 'custom') {
    const name = config?.meta?.name;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.toLowerCase() === 'custom') return 'custom';
    return `custom: ${trimmed}`;
  }
  if (type === 'constant') {
    return config.value != null ? `constant` : 'constant';
  }
  if (type === 'passthrough') {
    return typeof attr === 'string' ? `passthrough: ${attr}` : 'passthrough';
  }
  if (type === 'linear') {
    const d = Array.isArray(config.domain) ? config.domain.join('..') : '';
    const r = Array.isArray(config.range) ? config.range.join('..') : '';
    const src = typeof attr === 'string' ? attr : 'attr';
    return `linear: ${src} (${d || '—'} → ${r || '—'})`;
  }
  if (type === 'colormap' || config.colormap) {
    const name = config.colormap ?? config.scale ?? config.range ?? 'colormap';
    const d = Array.isArray(config.domain) ? config.domain.join('..') : '';
    const src = typeof attr === 'string' ? attr : 'attr';
    return `colormap: ${src} → ${name}${d ? ` (${d})` : ''}`;
  }
  if (type === 'categorical') {
    const src = typeof attr === 'string' ? attr : 'attr';
    return `categorical: ${src}`;
  }
  if (type === 'nodeAttribute') return `node attribute: ${config.nodeAttribute ?? ''}`.trim();
  return String(type);
}

function collectColormapSuggestionNames() {
  const names = new Set();
  const add = (value) => {
    if (!value) return;
    names.add(String(value));
  };
  for (const key of Object.keys(colormaps?.d3 ?? {})) add(key);
  for (const key of Object.keys(colormaps?.CET ?? {})) add(key);
  for (const key of Object.keys(colormaps?.helios ?? {})) add(key);
  for (const key of Object.keys(colormaps?.cmasher ?? {})) {
    add(key);
    if (key.startsWith('cmasher_')) {
      add(`cmasher:${key.slice('cmasher_'.length)}`);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function warnUiDerivationFailure(message, detail) {
  if (!import.meta.env?.DEV) return;
  console.warn(`[HeliosUI] ${message}`, detail);
}

function createInterfaceIcon(doc, kind) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('helios-ui-interface-icon');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  if (kind === 'dock-left') path.setAttribute('d', 'M4 5h4v14H4zM10 5h10v14H10z');
  else if (kind === 'dock-right') path.setAttribute('d', 'M4 5h10v14H4zM16 5h4v14h-4z');
  else if (kind === 'close') path.setAttribute('d', 'M7 7l10 10M17 7L7 17');
  else path.setAttribute('d', 'M5 7h14M5 12h14M5 17h14M9 5v4M15 10v4M11 15v4');
  svg.appendChild(path);
  return svg;
}

/**
 * Optional built-in control surface for a Helios visualization.
 *
 * @public
 * @apiSection User Interface
 * @param {object} [options] - UI construction options.
 * @param {Helios} [options.helios] - Helios instance to inspect and control.
 * @param {HTMLElement} [options.container] - Existing UI container.
 * @param {'dark'|'light'} [options.theme] - Initial UI theme.
 * @example
 * const ui = new HeliosUI({ helios, theme: 'dark' });
 */
export class HeliosUI {
  constructor(options = {}) {
    this.helios = options.helios ?? null;
    if (this.helios && !this.helios.ui) this.helios.ui = this;
    this.helios?.behaviors?.setUI?.(this);
    this.layerName = options.layerName ?? 'ui';
    this.theme = options.theme ?? 'dark';
    this.styles = options.styles ?? 'default';
    this.persistenceIndicators = options.persistenceIndicators !== false && storageSupportsPersistentUI(this.helios);

    if (this.styles === 'default') ensureDefaultStyles(options.document ?? document);

    // Ensure custom elements exist before panels/controls are created.
    defineHeliosWebComponents(options.document ?? document);

    this.container = resolveUiContainer({
      helios: this.helios,
      container: options.container ?? null,
      layerName: this.layerName,
    });
    this.container.classList.add('helios-ui');
    this.container.classList.toggle('helios-ui--storage-disabled', !this.persistenceIndicators);
    this.container.dataset.theme = this.theme;
    this._controlCleanups = new Set();
    this._boundAttributesById = new Map();
    this._heliosBindingUnsubscribe = null;
    this._latestDockInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    this._interfaceReleaseTimer = null;
    this._activeControlScope = null;
    this._panelHeaderShineTimers = new WeakMap();
    this._pendingPanelHeaderShine = null;
    this._persistenceIndicatorObserver = null;
    this._persistenceIndicatorFrame = null;
    this._persistenceBaselineRefreshTimer = null;
    this._stateAccessorBindings = new WeakSet();
    this._lastLoggedSyncFailure = null;

    this.panelManager = new PanelManager({
      container: this.container,
      allowDrag: options.allowDrag ?? true,
      labelColumn: options.labelColumn ?? undefined,
    });
    this.interfaceBehavior = this.helios?.useBehavior?.('interface', options.interface ?? options.behaviors?.options?.interface) ?? null;
    this._interfaceResizeObserver = null;
    this._interfaceChrome = this._createInterfaceChrome();
    this.interfaceBehavior?.bindUI?.(this);
    this._registerStateKey('ui.theme', {
      scope: 'user',
      debounceMs: 0,
      defaultValue: this.theme,
      metadata: { control: 'theme' },
    });
    this._installInterfaceViewportTracking();
    this._installInterfaceControlTracking();
    this._installPersistenceIndicatorFallback();
    const pendingUiState = this.helios?._pendingVisualizationUiState;
    if (pendingUiState && typeof pendingUiState === 'object') {
      const applyPendingUiState = () => {
        this.restoreState(pendingUiState);
        this.helios._pendingVisualizationUiState = null;
        this._writeStateValue('ui.theme', this.theme, {
          scope: 'user',
          source: 'restore',
          reason: 'theme-restore',
          debounceMs: 0,
          autosave: false,
          trackOverride: false,
        });
      };
      applyPendingUiState();
      if (this.helios?._pendingPersistenceBaselineRefresh === true) {
        this.helios._pendingPersistenceBaselineRefresh = false;
      }
      this.helios._pendingVisualizationUiState = null;
    }
    this._syncInterfaceState();
    const dockMetricsUnsubscribe = this.panelManager.onDockMetricsChange?.((insets) => {
      this._latestDockInsets = { ...insets };
      this.container?.style?.setProperty?.('--helios-ui-left-dock-width', `${Math.max(0, Number(insets?.left) || 0)}px`);
      this.container?.style?.setProperty?.('--helios-ui-right-dock-width', `${Math.max(0, Number(insets?.right) || 0)}px`);
      this._applyGraphViewportPolicy();
    });
    if (dockMetricsUnsubscribe) this._controlCleanups.add(dockMetricsUnsubscribe);
  }

  _ensureHeliosBindingListener() {
    if (this._heliosBindingUnsubscribe || !this.helios) return;
    const handler = (event) => {
      const detail = event?.detail;
      const id = detail?.id;
      if (!id) return;
      const attribute = this._boundAttributesById.get(id);
      if (attribute) attribute.notify();
    };
    if (typeof this.helios.on === 'function') {
      this._heliosBindingUnsubscribe = this.helios.on('ui:binding-change', handler);
    } else if (typeof this.helios.addEventListener === 'function') {
      this.helios.addEventListener('ui:binding-change', handler);
      this._heliosBindingUnsubscribe = () => this.helios.removeEventListener('ui:binding-change', handler);
    }
    if (this._heliosBindingUnsubscribe) this._controlCleanups.add(this._heliosBindingUnsubscribe);
  }

  _schedulePersistenceBaselineRefresh() {
    const storage = this.helios?.storage ?? null;
    const stateManager = this.helios?.states ?? null;
    if (!storage || typeof storage.flush !== 'function') return;
    const hasBlockingOverride = (overrides = {}) => Object.keys(overrides)
      .some((path) => !BASELINE_REFRESH_IGNORED_OVERRIDES.has(path));
    if (hasBlockingOverride(stateManager?.getOverrides?.({ aliases: false }) ?? {})) return;
    if (this._persistenceBaselineRefreshTimer != null) clearTimeout(this._persistenceBaselineRefreshTimer);
    this._persistenceBaselineRefreshTimer = setTimeout(() => {
      this._persistenceBaselineRefreshTimer = null;
      const latestStorage = this.helios?.storage ?? null;
      const latestStates = this.helios?.states ?? null;
      if (!latestStorage || hasBlockingOverride(latestStates?.getOverrides?.({ aliases: false }) ?? {})) return;
      if (this.helios) this.helios._pendingPersistenceBaselineRefresh = false;
    }, 0);
  }

  registerStateControl(path, options = {}) {
    const stateManager = this.helios?.states ?? null;
    if (!path || typeof stateManager?.register !== 'function') return null;
    const existingEntry = typeof stateManager?.entry === 'function' ? stateManager.entry(path) : null;
    const targetPath = existingEntry?.key ?? path;
    const hasDefaultValue = Object.prototype.hasOwnProperty.call(options, 'defaultValue');
    const hasOverride = stateManager?.status?.(targetPath)?.hasOverride === true;
    const defaultValue = hasDefaultValue ? options.defaultValue : existingEntry?.default ?? null;
    try {
      return stateManager.register(this, '', {
        [targetPath]: {
          ...(existingEntry ?? {}),
          default: clonePersistenceValue(hasOverride ? stateManager.get(targetPath) : defaultValue),
          scope: options.scope ?? stateScopeForPath(path),
          type: options.type ?? existingEntry?.type ?? 'object',
          ui: {
            ...(existingEntry?.ui ?? {}),
            label: options.label ?? existingEntry?.ui?.label,
            controller: options.controller ?? existingEntry?.ui?.controller,
            debounceMs: options.debounceMs ?? stateDebounceForPath(path),
          },
        },
      });
    } catch (_) {
      return null;
    }
  }

  _registerStateKey(path, options = {}) {
    return this.registerStateControl(path, options);
  }

  writeStateControl(path, value, options = {}) {
    const stateStore = this.helios?.states ?? null;
    if (!path || typeof stateStore?.set !== 'function') return null;
    try {
      const writeOptions = {
        scope: options.scope ?? stateScopeForPath(path),
        source: options.source ?? 'ui',
        reason: options.reason ?? 'control',
        autosave: options.autosave,
        applyBinding: options.applyBinding,
        debounceMs: options.debounceMs,
        journal: options.journal ?? false,
      };
      const trackOverride = options.trackOverride ?? this.helios?.storage?.overrideTrackingReady !== false;
      if (trackOverride === false || Object.prototype.hasOwnProperty.call(options, 'trackOverride')) {
        writeOptions.trackOverride = trackOverride;
      }
      return stateStore.set(path, value, writeOptions);
    } catch (_) {
      return null;
    }
  }

  _writeStateValue(path, value, options = {}) {
    return this.writeStateControl(path, value, options);
  }

  createStateIndicator(path = '', scope = null, options = {}) {
    if (!this.persistenceIndicators) return null;
    const target = String(path ?? '').trim();
    if (target && options.register !== false) {
      this.registerStateControl(target, {
        scope: options.persistenceScope ?? stateScopeForPath(target),
        debounceMs: options.debounceMs ?? stateDebounceForPath(target),
        ...(Object.prototype.hasOwnProperty.call(options, 'defaultValue')
          ? { defaultValue: options.defaultValue }
          : {}),
        metadata: options.metadata,
      });
    }
    return createDirtyIndicator({
      helios: this.helios,
      path: target,
      scope: scope ?? options.indicatorScope ?? target,
      mode: options.mode,
      attachTooltip: options.attachTooltip,
    });
  }

  _trackAttributeState(attribute, path, options = {}) {
    if (!attribute || !path || this._stateAccessorBindings.has(attribute)) return;
    this._stateAccessorBindings.add(attribute);
    const debounceMs = options.debounceMs ?? stateDebounceForPath(path);
    const scope = options.scope ?? stateScopeForPath(path);
    const initialValue = typeof attribute.value === 'function' ? attribute.value() : options.defaultValue;
    this._registerStateKey(path, {
      scope,
      debounceMs,
      defaultValue: options.defaultValue ?? initialValue,
      metadata: { binding: attribute.id ?? null, ...(options.metadata ?? {}) },
    });
    let previousSignature = stateValueSignature(initialValue);
    const unsubscribe = attribute.subscribe((value) => {
      const nextSignature = stateValueSignature(value);
      if (nextSignature === previousSignature) return;
      previousSignature = nextSignature;
      this._writeStateValue(path, value, {
        scope,
        source: 'ui',
        reason: options.reason ?? 'control',
        debounceMs,
        applyBinding: false,
      });
    }, { immediate: false });
    this._controlCleanups.add(() => unsubscribe());
  }

  setTheme(theme) {
    this.theme = theme;
    if (this.container) this.container.dataset.theme = theme;
    this.helios?._syncQuickControlsTheme?.(theme);
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  serializeState() {
    const panelState = this.panelManager?.serializeState?.() ?? {};
    const interfaceState = this.interfaceBehavior?.serializeInterfaceState?.() ?? {};
    return {
      theme: this.theme,
      panels: panelState.panels ?? {},
      dockOrder: panelState.dockOrder ?? {},
      interface: interfaceState,
    };
  }

  restoreState(state = {}) {
    if (!state || typeof state !== 'object') return this;
    if (typeof state.theme === 'string' && state.theme) {
      this.setTheme(state.theme);
    }
    this.panelManager?.restoreState?.(state);
    this.interfaceBehavior?.restoreInterfaceState?.(state.interface ?? {});
    this._syncInterfaceState();
    return this;
  }

  getViewportWidth() {
    const candidates = [
      this.container?.clientWidth,
      this.container?.getBoundingClientRect?.()?.width,
      this.helios?.layers?.size?.width,
      this.helios?.size?.width,
      this.container?.ownerDocument?.defaultView?.innerWidth,
      globalThis.window?.innerWidth,
    ];
    for (const value of candidates) {
      const width = Number(value);
      if (Number.isFinite(width) && width > 0) return width;
    }
    return 0;
  }

  applyInterfaceBehaviorState(state = {}) {
    const snapshot = state && typeof state === 'object' ? state : {};
    this.container.dataset.interfaceMode = snapshot.mode ?? 'desktop';
    this.container.dataset.interfaceVisible = snapshot.interfaceVisible === false ? 'false' : 'true';
    this.panelManager?.setResponsivePresentation?.({
      mode: snapshot.mode ?? 'desktop',
      dockSide: snapshot.dockSide ?? 'left',
      controlsOpen: snapshot.controlsOpen === true,
      activePanelId: snapshot.activePanelId ?? null,
      focused: snapshot.focused === true,
    });
    if (snapshot.focused !== true || snapshot.controlsOpen !== true) {
      this._setActiveControlScope(null);
    }
    this._applyGraphViewportPolicy(snapshot);
    this._renderInterfaceChrome(snapshot);
    return this;
  }

  _applyGraphViewportPolicy(state = null) {
    const snapshot = state && typeof state === 'object'
      ? state
      : (this.interfaceBehavior?.serializeInterfaceState?.() ?? { mode: 'desktop' });
    const mode = snapshot.mode ?? 'desktop';
    if (mode === 'compact') {
      this.helios?.layers?.setViewportInsets?.(this._latestDockInsets);
      this.helios?.overlayInsets?.({ top: 0, right: 0, bottom: 0, left: 0 });
      return;
    }
    this.helios?.layers?.setViewportInsets?.({ top: 0, right: 0, bottom: 0, left: 0 });
    if (mode === 'fullscreen') {
      this.helios?.overlayInsets?.({ top: 0, right: 0, bottom: 0, left: FULLSCREEN_OVERLAY_LEFT_INSET_PX });
      return;
    }
    this.helios?.overlayInsets?.(this._latestDockInsets);
  }

  _installInterfaceViewportTracking() {
    const report = () => {
      this.interfaceBehavior?.setViewportWidth?.(this.getViewportWidth(), { silent: true });
      this._syncInterfaceState();
    };
    if (typeof ResizeObserver === 'function') {
      this._interfaceResizeObserver = new ResizeObserver(() => report());
      this._interfaceResizeObserver.observe(this.container);
    } else if (typeof window?.addEventListener === 'function') {
      window.addEventListener('resize', report);
      this._controlCleanups.add(() => window.removeEventListener('resize', report));
    }
    this._controlCleanups.add(() => this._interfaceResizeObserver?.disconnect?.());
    report();
  }

  _syncInterfaceState() {
    this.applyInterfaceBehaviorState(this.interfaceBehavior?.serializeInterfaceState?.({ includeResumePrompt: true }) ?? {
      dockSide: 'left',
      mode: 'desktop',
      interfaceVisible: true,
      controlsOpen: false,
      activePanelId: null,
      focused: false,
      resumePrompt: null,
    });
  }

  _installPersistenceIndicatorFallback() {
    if (!this.persistenceIndicators || !this.container) return;

    const doc = this.container.ownerDocument ?? document;
    const win = doc.defaultView ?? globalThis;
    const createStaticIndicator = () => {
      const indicator = createDirtyIndicator({
        helios: this.helios,
        path: '',
      });
      indicator.classList.add('helios-ui-dirty-indicator--fallback');
      this._controlCleanups.add(() => indicator.destroy?.());
      return indicator;
    };
    const createGroupIndicator = () => {
      const indicator = doc.createElement('span');
      indicator.className = 'helios-ui-dirty-indicator helios-ui-dirty-indicator--static helios-ui-dirty-indicator--group';
      indicator.dataset.state = 'default';
      indicator.setAttribute('aria-hidden', 'true');
      return indicator;
    };
    const syncGroupIndicator = (indicator, scope) => {
      const changed = Boolean(scope?.querySelector?.('.helios-ui-row .helios-ui-dirty-indicator[data-state="changed"]'));
      indicator.dataset.state = changed ? 'partial' : 'default';
    };

    const apply = () => {
      this._persistenceIndicatorFrame = null;
      for (const row of this.container.querySelectorAll('.helios-ui-row')) {
        if (row.querySelector('.helios-ui-dirty-indicator')) continue;
        const titleRow = row.querySelector('.helios-ui-label__title-row');
        if (titleRow) {
          titleRow.appendChild(createStaticIndicator());
          continue;
        }
        const title = row.querySelector('.helios-ui-label__title');
        if (title?.parentElement) {
          title.parentElement.appendChild(createStaticIndicator());
        }
      }
      for (const panel of this.container.querySelectorAll('.helios-ui-panel')) {
        const titleWrap = panel.querySelector(':scope > .helios-ui-panel__header .helios-ui-panel__title-wrap');
        if (!titleWrap) continue;
        if (
          panel.querySelector(':scope > .helios-ui-panel__header .helios-ui-panel__persistence-indicator')
          || panel.querySelector(':scope > .helios-ui-panel__header .helios-ui-dirty-indicator--schema')
        ) {
          titleWrap.querySelector(':scope > .helios-ui-dirty-indicator--group')?.remove();
          continue;
        }
        let indicator = titleWrap.querySelector(':scope > .helios-ui-dirty-indicator--group');
        if (!indicator) {
          indicator = createGroupIndicator();
          titleWrap.appendChild(indicator);
        }
        syncGroupIndicator(indicator, panel.querySelector(':scope > .helios-ui-panel__body'));
      }
      for (const subpanel of this.container.querySelectorAll('.helios-ui-subpanel')) {
        const header = subpanel.querySelector(':scope > .helios-ui-subpanel__header-row > .helios-ui-subpanel__header');
        if (!header) continue;
        const headerRow = subpanel.querySelector(':scope > .helios-ui-subpanel__header-row');
        if (
          headerRow?.querySelector?.(':scope > .helios-ui-subpanel__header-controls .helios-ui-dirty-indicator')
          || header.querySelector(':scope > .helios-ui-dirty-indicator--schema')
        ) {
          header.querySelector(':scope > .helios-ui-dirty-indicator--group')?.remove();
          continue;
        }
        let indicator = header.querySelector(':scope > .helios-ui-dirty-indicator--group');
        if (!indicator) {
          indicator = createGroupIndicator();
          header.appendChild(indicator);
        }
        syncGroupIndicator(indicator, subpanel.querySelector(':scope > .helios-ui-subpanel__body'));
      }
    };

    const schedule = () => {
      if (this._persistenceIndicatorFrame != null) return;
      this._persistenceIndicatorFrame = win.requestAnimationFrame?.(apply)
        ?? win.setTimeout?.(apply, 0);
    };

    schedule();
    if (typeof win.MutationObserver === 'function') {
      this._persistenceIndicatorObserver = new win.MutationObserver(schedule);
      this._persistenceIndicatorObserver.observe(this.container, {
        childList: true,
        subtree: true,
      });
      this._controlCleanups.add(() => this._persistenceIndicatorObserver?.disconnect?.());
    }
    const storage = this.helios?.storage ?? null;
    storage?.addEventListener?.('change', schedule);
    this._controlCleanups.add(() => {
      storage?.removeEventListener?.('change', schedule);
    });
    this._controlCleanups.add(() => {
      if (this._persistenceIndicatorFrame == null) return;
      win.cancelAnimationFrame?.(this._persistenceIndicatorFrame);
      win.clearTimeout?.(this._persistenceIndicatorFrame);
      this._persistenceIndicatorFrame = null;
    });
  }

  _createInterfaceChrome() {
    const doc = this.container?.ownerDocument ?? document;
    const surface = doc.createElement('div');
    surface.className = 'helios-ui-interface-surface';

    const compactDockToggle = doc.createElement('button');
    compactDockToggle.type = 'button';
    compactDockToggle.className = 'helios-ui-interface-dock-toggle';
    compactDockToggle.setAttribute('aria-label', 'Move compact dock to the other side');
    compactDockToggle.setAttribute('title', 'Move compact dock to the other side');
    compactDockToggle.addEventListener('click', () => {
      this.interfaceBehavior?.toggleDockSide?.();
    });

    const fullscreenBar = doc.createElement('div');
    fullscreenBar.className = 'helios-ui-interface-fullscreen-bar';

    const launcherButton = doc.createElement('button');
    launcherButton.type = 'button';
    launcherButton.className = 'helios-ui-button helios-ui-interface-bar__button helios-ui-interface-bar__button--icon';
    launcherButton.addEventListener('click', () => {
      const controlsOpen = this.interfaceBehavior?.controlsOpen?.() === true;
      if (controlsOpen) {
        this.interfaceBehavior?.closeControlsSurface?.();
        this.interfaceBehavior?.clearActiveControl?.();
        this._setActiveControlScope(null);
      } else {
        this.interfaceBehavior?.openControlsSurface?.();
      }
    });

    const fullscreenPanelNav = doc.createElement('div');
    fullscreenPanelNav.className = 'helios-ui-fullscreen-panel-nav';

    fullscreenBar.appendChild(launcherButton);
    fullscreenBar.appendChild(fullscreenPanelNav);

    const resumePrompt = doc.createElement('div');
    resumePrompt.className = 'helios-ui-resume-prompt';

    const resumeText = doc.createElement('div');
    resumeText.className = 'helios-ui-resume-prompt__text';

    const resumeActions = doc.createElement('div');
    resumeActions.className = 'helios-ui-resume-prompt__actions';

    const resumeButton = doc.createElement('button');
    resumeButton.type = 'button';
    resumeButton.className = 'helios-ui-button';
    resumeButton.textContent = 'Resume';
    resumeButton.addEventListener('click', async () => {
      const prompt = this.interfaceBehavior?.resumePrompt?.() ?? null;
      let sessions = Array.isArray(prompt?.sessions) ? prompt.sessions.filter((entry) => entry?.id) : [];
      const storage = this.helios?.storage ?? null;
      const resumeSource = storage;
      if (sessions.length <= 1 && typeof resumeSource?.getResumeSessions === 'function') {
        sessions = await resumeSource.getResumeSessions({ limit: 8 });
      }
      if (sessions.length > 1) {
        renderResumeMenu(sessions);
        resumeMenu.hidden = false;
        return;
      }
      this.interfaceBehavior?.resumeSession?.();
    });

    const resumeMenu = doc.createElement('div');
    resumeMenu.className = 'helios-ui-resume-prompt__menu';
    resumeMenu.hidden = true;

    const renderResumeMenu = (sessions = []) => {
      resumeMenu.replaceChildren();
      for (let i = 0; i < sessions.length; i += 1) {
        const session = sessions[i];
        const item = doc.createElement('button');
        item.type = 'button';
        item.className = 'helios-ui-resume-prompt__menu-item';
        item.dataset.sessionId = session.id;
        item.textContent = this._formatResumeSessionLabel(session, i);
        item.addEventListener('click', async () => {
          resumeMenu.hidden = true;
          resumePrompt.hidden = true;
          item.disabled = true;
          try {
            await (this.interfaceBehavior?.resumeSession?.({ sessionId: session.id })
              ?? this.helios?.storage?.resumeSession?.(session.id));
          } finally {
            item.disabled = false;
          }
        });
        resumeMenu.appendChild(item);
      }
    };
    resumeMenu.__heliosRenderSessions = renderResumeMenu;

    const freshButton = doc.createElement('button');
    freshButton.type = 'button';
    freshButton.className = 'helios-ui-button';
    freshButton.textContent = 'Start Fresh';
    freshButton.addEventListener('click', async () => {
      resumeMenu.hidden = true;
      resumePrompt.hidden = true;
      freshButton.disabled = true;
      try {
        await this.interfaceBehavior?.startFresh?.();
      } finally {
        freshButton.disabled = false;
      }
    });

    resumeActions.appendChild(resumeButton);
    resumeActions.appendChild(freshButton);
    resumePrompt.appendChild(resumeText);
    resumePrompt.appendChild(resumeActions);
    resumePrompt.appendChild(resumeMenu);

    surface.appendChild(compactDockToggle);
    surface.appendChild(fullscreenBar);
    surface.appendChild(resumePrompt);
    this.container.appendChild(surface);

    return {
      surface,
      compactDockToggle,
      fullscreenBar,
      launcherButton,
      fullscreenPanelNav,
      resumePrompt,
      resumeText,
      resumeMenu,
    };
  }

  _formatResumeSessionLabel(session, index = 0) {
    const timestamp = Number(session?.updatedAt);
    const date = Number.isFinite(timestamp) && timestamp > 0
      ? new Date(timestamp).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
      : 'unknown date';
    if (index === 0) return `Latest - ${date}`;
    const label = String(session?.label ?? session?.id ?? `Session ${index + 1}`).trim() || `Session ${index + 1}`;
    return `${label} - ${date}`;
  }

  _renderInterfaceChrome(state = {}) {
    const snapshot = state && typeof state === 'object' ? state : {};
    const chrome = this._interfaceChrome;
    if (!chrome) return;

    chrome.surface.dataset.mode = snapshot.mode ?? 'desktop';
    chrome.compactDockToggle.hidden = snapshot.mode !== 'compact';
    chrome.fullscreenBar.hidden = snapshot.mode !== 'fullscreen';
    chrome.launcherButton.hidden = snapshot.mode !== 'fullscreen';
    chrome.compactDockToggle.dataset.side = snapshot.dockSide === 'right' ? 'right' : 'left';
    chrome.compactDockToggle.setAttribute(
      'aria-label',
      snapshot.dockSide === 'right' ? 'Move dock to the left side' : 'Move dock to the right side',
    );
    chrome.compactDockToggle.setAttribute(
      'title',
      snapshot.dockSide === 'right' ? 'Move dock to the left side' : 'Move dock to the right side',
    );
    chrome.compactDockToggle.replaceChildren(
      createInterfaceIcon(
        this.container?.ownerDocument ?? document,
        snapshot.dockSide === 'right' ? 'dock-left' : 'dock-right',
      ),
    );
    chrome.launcherButton.setAttribute('aria-label', snapshot.controlsOpen === true ? 'Close controls' : 'Open controls');
    chrome.launcherButton.setAttribute('title', snapshot.controlsOpen === true ? 'Close controls' : 'Open controls');
    chrome.launcherButton.replaceChildren(
      createInterfaceIcon(
        this.container?.ownerDocument ?? document,
        snapshot.controlsOpen === true ? 'close' : 'controls',
      ),
    );
    this._renderFullscreenPanelNav(snapshot);

    const prompt = storageSupportsSessions(this.helios) && !this.helios?.storage?.requestedSessionId
      ? (snapshot.resumePrompt ?? null)
      : null;
    chrome.resumePrompt.hidden = !prompt?.visible;
    if (prompt?.visible) {
      const sourceName = prompt.networkSource?.name ?? prompt.networkSource?.baseName ?? 'previous session';
      const sessions = Array.isArray(prompt.sessions) ? prompt.sessions.filter((entry) => entry?.id) : [];
      chrome.resumeText.textContent = sessions.length > 1
        ? `Resume a previous session?`
        : `Resume previous session from ${sourceName}?`;
      if (chrome.resumeMenu) {
        chrome.resumeMenu.hidden = true;
        chrome.resumeMenu.__heliosRenderSessions?.(sessions);
      }
    } else if (chrome.resumeMenu) {
      chrome.resumeMenu.hidden = true;
      chrome.resumeMenu.replaceChildren();
    }
  }

  _orderedFullscreenPanels() {
    const manager = this.panelManager ?? null;
    if (!manager) return [];
    const ordered = [];
    const seen = new Set();
    const appendFrom = (container) => {
      for (const element of Array.from(container?.children ?? [])) {
        const panelId = element?.dataset?.panelId;
        if (!panelId || seen.has(panelId)) continue;
        const panel = manager.getPanel?.(panelId) ?? null;
        if (!panel) continue;
        seen.add(panelId);
        ordered.push(panel);
      }
    };
    appendFrom(manager.fullscreenFlow);
    appendFrom(manager.dockLeft);
    appendFrom(manager.dockRight);
    for (const panel of manager.getPanels?.() ?? []) {
      if (!panel?.id || seen.has(panel.id)) continue;
      seen.add(panel.id);
      ordered.push(panel);
    }
    return ordered;
  }

  _renderFullscreenPanelNav(state = {}) {
    const chrome = this._interfaceChrome;
    const nav = chrome?.fullscreenPanelNav;
    if (!nav) return;
    const snapshot = state && typeof state === 'object' ? state : {};
    const visible = snapshot.mode === 'fullscreen' && snapshot.controlsOpen === true;
    nav.hidden = !visible;
    if (!visible) {
      nav.replaceChildren();
      return;
    }

    const doc = this.container?.ownerDocument ?? document;
    const buttons = this._orderedFullscreenPanels().map((panel) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'helios-ui-button helios-ui-fullscreen-panel-nav__button';
      button.dataset.panelId = panel.id;
      button.dataset.active = snapshot.activePanelId === panel.id ? 'true' : 'false';
      button.setAttribute('aria-label', `Jump to ${panel.title}`);
      button.setAttribute('title', panel.title);
      button.appendChild(
        createPanelIcon(doc, { id: panel.id, title: panel.title }, { className: 'helios-ui-fullscreen-panel-nav__icon' }),
      );
      button.addEventListener('click', () => {
        this._jumpToFullscreenPanel(panel.id);
      });
      return button;
    });
    nav.replaceChildren(...buttons);
  }

  _jumpToFullscreenPanel(panelId) {
    const panel = this.panelManager?.getPanel?.(panelId) ?? null;
    if (!panel) return;
    if (typeof panel.collapsed === 'function' && panel.collapsed()) {
      panel.setCollapsed?.(false);
    } else if (panel.element?.dataset?.collapsed === 'true') {
      panel.setCollapsed?.(false);
    }
    this.interfaceBehavior?.clearActiveControl?.();
    this._setActiveControlScope(null);
    const scroller = this.panelManager?.fullscreenFlow ?? null;
    const waitForScroll = this._fullscreenPanelJumpNeedsScroll(panel, scroller);
    this._queueFullscreenPanelHeaderShine(panel, { scroller, waitForScroll });
    panel.element?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  _fullscreenPanelJumpNeedsScroll(panel, scroller) {
    if (!panel?.element?.getBoundingClientRect || !scroller?.getBoundingClientRect) return false;
    const panelRect = panel.element.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    if (!Number.isFinite(panelRect?.top) || !Number.isFinite(panelRect?.bottom)) return false;
    if (!Number.isFinite(scrollerRect?.top) || !Number.isFinite(scrollerRect?.bottom)) return false;
    const tolerance = 2;
    return panelRect.top < scrollerRect.top + tolerance || panelRect.bottom > scrollerRect.bottom - tolerance;
  }

  _queueFullscreenPanelHeaderShine(panel, options = {}) {
    this._cancelPendingPanelHeaderShine();
    const { scroller = null, waitForScroll = false } = options;
    if (!waitForScroll || !scroller || typeof scroller.addEventListener !== 'function') {
      this._shineFullscreenPanelHeader(panel);
      return;
    }
    const clock = this.container?.ownerDocument?.defaultView ?? globalThis;
    let settleTimer = null;
    const finish = () => {
      cleanup();
      this._shineFullscreenPanelHeader(panel);
    };
    const scheduleFinish = (delay = 140) => {
      if (settleTimer != null) clock.clearTimeout?.(settleTimer);
      settleTimer = clock.setTimeout?.(finish, delay) ?? null;
    };
    const onScroll = () => {
      scheduleFinish(140);
    };
    const cleanup = () => {
      if (settleTimer != null) {
        clock.clearTimeout?.(settleTimer);
        settleTimer = null;
      }
      scroller.removeEventListener?.('scroll', onScroll);
      if (this._pendingPanelHeaderShine?.cleanup === cleanup) this._pendingPanelHeaderShine = null;
    };
    this._pendingPanelHeaderShine = { cleanup };
    scroller.addEventListener('scroll', onScroll);
    scheduleFinish(160);
  }

  _cancelPendingPanelHeaderShine() {
    this._pendingPanelHeaderShine?.cleanup?.();
    this._pendingPanelHeaderShine = null;
  }

  _shineFullscreenPanelHeader(panel) {
    const header = panel?.header ?? panel?.element?.querySelector?.('.helios-ui-panel__header') ?? null;
    if (!header?.dataset) return;
    if (!this._panelHeaderShineTimers) this._panelHeaderShineTimers = new WeakMap();
    const previousTimer = this._panelHeaderShineTimers.get(header);
    if (previousTimer != null) {
      const clock = this.container?.ownerDocument?.defaultView ?? globalThis;
      clock.clearTimeout?.(previousTimer);
    }
    header.dataset.navShine = 'true';
    const clock = this.container?.ownerDocument?.defaultView ?? globalThis;
    const timer = clock.setTimeout?.(() => {
      if (header?.dataset) delete header.dataset.navShine;
      this._panelHeaderShineTimers?.delete?.(header);
    }, 1150);
    if (timer != null) this._panelHeaderShineTimers.set(header, timer);
  }

  _resolveActiveControlScope(target) {
    if (!target || typeof target.closest !== 'function') return null;
    if (!this._isTransparencyEligibleControl(target)) return null;
    const localScope = target.closest('.helios-ui-row, .helios-ui-layout__actions, .helios-ui-network__actions');
    if (localScope) return localScope;
    const scopeId = target.closest('[data-interface-focus-scope-id]')?.dataset?.interfaceFocusScopeId;
    if (!scopeId) return null;
    return this.container?.querySelector?.(`[data-interface-focus-scope-id="${scopeId}"]`) ?? null;
  }

  _isTransparencyEligibleControl(target) {
    if (!target || typeof target.closest !== 'function') return false;
    if (target.closest('[data-interface-focus-ignore="true"]')) return false;
    if (target.closest('[data-interface-focus-control="true"]')) return true;

    const control = target.closest('input, select, textarea, [role="switch"], [role="radiogroup"], [role="radio"]');
    if (!control) return false;
    if (control.closest('[data-interface-focus-ignore="true"]')) return false;
    if (control.tagName === 'INPUT') {
      const type = String(control.getAttribute?.('type') ?? control.type ?? '').toLowerCase();
      if (type === 'button' || type === 'submit' || type === 'reset' || type === 'file') return false;
    }
    return true;
  }

  _resolveActivePanelId(target, scope = null) {
    const explicitPanelId = target?.closest?.('[data-interface-panel-id]')?.dataset?.interfacePanelId;
    if (explicitPanelId) return explicitPanelId;
    const panelId = scope?.closest?.('.helios-ui-panel')?.dataset?.panelId
      ?? target?.closest?.('.helios-ui-panel')?.dataset?.panelId
      ?? null;
    return typeof panelId === 'string' && panelId ? panelId : null;
  }

  _installInterfaceControlTracking() {
    const host = this.container;
    if (!host?.addEventListener) return;

    const activate = (event) => {
      const scope = this._resolveActiveControlScope(event?.target);
      if (!scope) return;
      this._setActiveControlScope(scope);
      const panelId = this._resolveActivePanelId(event?.target, scope);
      if (panelId) this.interfaceBehavior?.activateControl?.(panelId);
    };
    const activateFromPointerDown = (event) => {
      // On touch screens, pointerdown often begins a scroll gesture.
      // Defer transparency activation until we see a real control interaction
      // such as input/change/click, otherwise mobile scrolling can get stuck
      // in focused-control mode.
      if (event?.pointerType === 'touch') return;
      activate(event);
    };
    const release = () => {
      this._scheduleInterfaceControlRelease();
    };
    const releaseImmediately = () => {
      if (this._interfaceReleaseTimer != null) {
        clearTimeout(this._interfaceReleaseTimer);
        this._interfaceReleaseTimer = null;
      }
      this._setActiveControlScope(null);
      this.interfaceBehavior?.clearActiveControl?.();
    };

    host.addEventListener('pointerdown', activateFromPointerDown, { capture: true });
    host.addEventListener('focusin', activate);
    host.addEventListener('input', activate);
    host.addEventListener('change', activate);
    host.addEventListener('click', activate);
    host.addEventListener('pointerup', release, { capture: true });
    host.addEventListener('pointercancel', releaseImmediately, { capture: true });
    host.addEventListener('scroll', releaseImmediately, { capture: true });
    host.addEventListener('change', release);
    host.addEventListener('focusout', release);

    this._controlCleanups.add(() => {
      host.removeEventListener('pointerdown', activateFromPointerDown, { capture: true });
      host.removeEventListener('focusin', activate);
      host.removeEventListener('input', activate);
      host.removeEventListener('change', activate);
      host.removeEventListener('click', activate);
      host.removeEventListener('pointerup', release, { capture: true });
      host.removeEventListener('pointercancel', releaseImmediately, { capture: true });
      host.removeEventListener('scroll', releaseImmediately, { capture: true });
      host.removeEventListener('change', release);
      host.removeEventListener('focusout', release);
    });
  }

  _setActiveControlScope(scope) {
    if (this._activeControlScope === scope) return;
    if (this._activeControlScope?.dataset) {
      delete this._activeControlScope.dataset.controlFocusActive;
    }
    this._activeControlScope = scope ?? null;
    if (this._activeControlScope?.dataset) {
      this._activeControlScope.dataset.controlFocusActive = 'true';
      if (this.container?.dataset) this.container.dataset.focusedControlScope = 'row';
    } else if (this.container?.dataset) {
      delete this.container.dataset.focusedControlScope;
    }
  }

  _scheduleInterfaceControlRelease() {
    if (this._interfaceReleaseTimer != null) {
      clearTimeout(this._interfaceReleaseTimer);
    }
    this._interfaceReleaseTimer = setTimeout(() => {
      this._interfaceReleaseTimer = null;
      this._setActiveControlScope(null);
      this.interfaceBehavior?.clearActiveControl?.();
    }, INTERFACE_CONTROL_RELEASE_MS);
  }

  bindHeliosAccessor(accessorName, options = {}) {
    if (!this.helios) {
      throw new Error('HeliosUI.bindHeliosAccessor requires a Helios instance');
    }
    const accessor = this.helios[accessorName];
    if (typeof accessor !== 'function') {
      throw new Error(`Helios instance has no accessor method "${accessorName}()"`);
    }
    const info = typeof this.helios.uiBindingInfo === 'function'
      ? (this.helios.uiBindingInfo(accessorName) ?? null)
      : null;
    const merged = info ? { ...info, ...options } : options;
    const eventName = merged.eventName ?? (accessorName === 'background' ? 'clearColor' : accessorName);
    const persistencePath = STATE_ACCESSOR_PATHS[accessorName] ?? STATE_ACCESSOR_PATHS[eventName] ?? null;
    const storageAttribute = this._createStateBackedAttribute(persistencePath, {
      ...merged,
      id: merged.id ?? `helios.${eventName}`,
      label: merged.label ?? humanizeControlLabel(accessorName),
      meta: { source: 'helios', accessor: accessorName, eventName, ...merged.meta },
    });
    if (storageAttribute) return storageAttribute;
    const id = merged.id ?? `helios.${eventName}`;
    const label = merged.label ?? humanizeControlLabel(accessorName);
    const defaultValue = merged.defaultValue ?? null;
    const type = merged.type ?? 'number';
    const makeAttribute = (factory) => factory({
      id,
      label,
      readOnly: Boolean(merged.readOnly ?? false),
      min: merged.min ?? null,
      max: merged.max ?? null,
      step: merged.step ?? null,
      domain: merged.domain ?? null,
      recommendedRange: merged.recommendedRange ?? null,
      meta: { source: 'helios', accessor: accessorName, eventName, ...merged.meta },
      get: () => {
        const value = accessor.call(this.helios);
        return value == null ? defaultValue : value;
      },
      set: (value) => accessor.call(this.helios, value),
    });
    const attribute = type === 'boolean'
      ? makeAttribute(UIAttribute.boolean)
      : type === 'string'
        ? makeAttribute(UIAttribute.string)
        : makeAttribute(UIAttribute.number);
    this._boundAttributesById.set(id, attribute);
    if (persistencePath) {
      this._trackAttributeState(attribute, persistencePath, {
        scope: merged.persistenceScope ?? stateScopeForPath(persistencePath),
        debounceMs: merged.persistenceDebounceMs ?? stateDebounceForPath(persistencePath),
        defaultValue,
        metadata: { accessor: accessorName, eventName },
      });
    }
    this._ensureHeliosBindingListener();
    return attribute;
  }

  bindBehaviorAccessor(behavior, accessorName, options = {}) {
    if (!behavior || typeof behavior?.[accessorName] !== 'function') {
      throw new Error(`Behavior has no accessor method "${accessorName}()"`);
    }
    const info = typeof this.helios?.uiBindingInfo === 'function'
      ? (this.helios.uiBindingInfo(accessorName) ?? null)
      : null;
    const merged = info ? { ...info, ...options } : options;
    const id = merged.id ?? `helios.behavior.${behavior.id ?? 'behavior'}.${accessorName}`;
    const label = merged.label ?? humanizeControlLabel(accessorName);
    const behaviorId = String(behavior.id ?? 'behavior');
    const mappedPersistencePath = STATE_ACCESSOR_PATHS[accessorName] ?? null;
    const persistencePath = merged.persistencePath ?? mappedPersistencePath ?? `behaviors.${behaviorId}.${accessorName}`;
    const storageAttribute = this._createStateBackedAttribute(persistencePath, {
      ...merged,
      id,
      label,
      meta: { source: 'behavior', behavior: behavior.id ?? null, accessor: accessorName, ...merged.meta },
    });
    if (storageAttribute) return storageAttribute;
    const defaultValue = merged.defaultValue ?? null;
    const type = merged.type ?? 'number';
    const makeAttribute = (factory) => factory({
      id,
      label,
      readOnly: Boolean(merged.readOnly ?? false),
      min: merged.min ?? null,
      max: merged.max ?? null,
      step: merged.step ?? null,
      domain: merged.domain ?? null,
      recommendedRange: merged.recommendedRange ?? null,
      meta: { source: 'behavior', behavior: behavior.id ?? null, accessor: accessorName, ...merged.meta },
      get: () => {
        const value = behavior[accessorName]();
        return value == null ? defaultValue : value;
      },
      set: (value) => behavior[accessorName](value),
    });
    const attribute = type === 'boolean'
      ? makeAttribute(UIAttribute.boolean)
      : type === 'string'
        ? makeAttribute(UIAttribute.string)
        : makeAttribute(UIAttribute.number);
    this._trackAttributeState(attribute, persistencePath, {
      scope: merged.persistenceScope ?? (behaviorId === 'interface' || behaviorId === 'exporter' ? 'user' : 'network'),
      debounceMs: merged.persistenceDebounceMs ?? STATE_ACCESSOR_DEBOUNCE_MS,
      defaultValue,
      metadata: { behavior: behaviorId, accessor: accessorName },
    });
    const unsubscribe = behavior.on?.('change', () => attribute.notify()) ?? (() => {});
    this._controlCleanups.add(() => unsubscribe());
    return attribute;
  }

  _createStateBackedAttribute(path, options = {}) {
    const stateManager = this.helios?.states ?? null;
    const target = String(path ?? '').trim();
    if (!target || typeof stateManager?.entry !== 'function' || typeof stateManager?.set !== 'function') return null;
    const entry = stateManager.entry(target);
    if (!entry) return null;
    const ui = entry.ui ?? {};
    const type = entry.type === 'boolean'
      ? 'boolean'
      : (entry.type === 'string' || entry.type === 'enum' ? 'string' : 'number');
    const defaultValue = Object.prototype.hasOwnProperty.call(options, 'defaultValue')
      ? options.defaultValue
      : entry.default;
    const meta = {
      storageKey: target,
      ...(options.meta ?? {}),
    };
    if (ui.inputMin != null) meta.inputMin = ui.inputMin;
    if (ui.inputMax != null) meta.inputMax = ui.inputMax;
    const attributeOptions = {
      id: options.id ?? entry.key ?? target,
      label: ui.label ?? options.label ?? humanizeControlLabel(entry.key ?? target),
      readOnly: Boolean(options.readOnly ?? false),
      min: options.min ?? ui.min ?? ui.sliderMin ?? null,
      max: options.max ?? ui.max ?? ui.sliderMax ?? null,
      step: options.step ?? ui.step ?? null,
      domain: options.domain ?? null,
      recommendedRange: options.recommendedRange ?? (
        Number.isFinite(Number(ui.sliderMin)) && Number.isFinite(Number(ui.sliderMax))
          ? { min: Number(ui.sliderMin), max: Number(ui.sliderMax) }
          : null
      ),
      meta,
      get: () => {
        const value = stateManager.get(target, defaultValue);
        return value == null ? defaultValue : value;
      },
      set: (value) => {
        stateManager.set(target, value, {
          source: 'ui',
          reason: options.reason ?? 'control',
          autosave: options.autosave,
          debounceMs: type === 'boolean' ? 0 : options.persistenceDebounceMs,
          journal: false,
        });
      },
    };
    const attribute = type === 'boolean'
      ? UIAttribute.boolean(attributeOptions)
      : type === 'string'
        ? UIAttribute.string(attributeOptions)
        : UIAttribute.number(attributeOptions);
    this._boundAttributesById.set(attribute.id, attribute);
    const unsubscribe = stateManager.subscribe(target, (_value, detail = {}) => {
      if (detail?.source === 'ui') return;
      attribute.notify();
    }, { immediate: false });
    this._controlCleanups.add(() => unsubscribe());
    return attribute;
  }

  createPanel(options) {
    const panel = this.panelManager.createPanel({
      ...options,
      icon: options?.icon ?? resolvePanelIconKind({ id: options?.id, title: options?.title }),
    });
    const panelSchema = options?.panelSchema ?? null;
    const persistencePath = options?.persistencePath === false
      ? null
      : (panelSchema ? null : (options?.persistencePath ?? persistencePanelPathForId(options?.id, options?.title)));
    if ((panelSchema || persistencePath) && panel?.actionsEl) {
      const indicator = panelSchema
        ? createPanelSchemaIndicator({
          helios: this.helios,
          schema: panelSchema,
        })
        : this.createStateIndicator(persistencePath, persistencePath, {
          mode: 'scope',
          metadata: { panel: options?.id ?? null },
        });
      if (indicator) {
        indicator.classList.add('helios-ui-panel__persistence-indicator');
        panel.actionsEl.insertBefore(indicator, panel.collapseButton ?? null);
        this._controlCleanups.add(() => indicator.destroy?.());
      }
    }
    this._schedulePersistenceBaselineRefresh();
    return panel;
  }

  createTabbedPanel(options = {}) {
    const tabs = new TabbedPanel({
      tabs: options.tabs ?? [],
      activeId: options.activeId,
      barRight: options.barRight,
      variant: options.variant,
      onActiveChanged: options.onActiveChanged,
    });
    this._controlCleanups.add(() => tabs.destroy());
    return this.createPanel({
      id: options.id,
      title: options.title,
      position: options.position,
      dock: options.dock,
      persistencePath: options.persistencePath,
      panelSchema: options.panelSchema,
      content: tabs.element,
    });
  }

  createDemoPanel(options = {}) {
    const content = document.createElement('div');

    const tooltips = createTooltipManager();
    this._controlCleanups.add(() => tooltips.destroy());

    const createStateIndicator = (path = '', scope = null) => {
      if (!this.persistenceIndicators) return null;
      const indicator = createDirtyIndicator({
        helios: this.helios,
        path: path ?? '',
        scope: scope ?? scopeForStatePath(path),
        attachTooltip: tooltips.attachTooltip,
      });
      this._controlCleanups.add(() => indicator.destroy?.());
      return indicator;
    };

    const createAlignedRow = ({ title, hint, controls, dirtyIndicator }) => createAlignedRowEl({
      title,
      hint,
      controls,
      dirtyIndicator: dirtyIndicator === undefined ? createStateIndicator() : dirtyIndicator,
      attachTooltip: tooltips.attachTooltip,
    });

    const statePathForAccessor = (accessorName) => STATE_ACCESSOR_PATHS[accessorName] ?? null;

    const createHeaderControlsWithIndicator = (control, path) => {
      const controls = document.createElement('div');
      controls.className = 'helios-ui-row__controls';
      const indicator = createStateIndicator(path);
      if (indicator) controls.appendChild(indicator);
      controls.appendChild(control);
      return controls;
    };

    let themeRow = document.createElement('div');
    const themeToggle = createSegmentedToggleControl({
      checked: this.theme === 'dark',
      onLabel: 'Dark',
      offLabel: 'Light',
      ariaLabel: 'Theme',
    });
    themeToggle.dataset.interfaceFocusIgnore = 'true';
    themeToggle.addEventListener('change', () => {
      this.toggleTheme();
      themeToggle.checked = this.theme === 'dark';
      this._writeStateValue('ui.theme', this.theme, {
        scope: 'user',
        source: 'ui',
        reason: 'theme',
        debounceMs: 0,
      });
    });

    const built = createAlignedRow({
      title: 'Theme',
      hint: 'Toggle light/dark',
      controls: themeToggle,
      dirtyIndicator: createStateIndicator('ui.theme', 'ui'),
    });
    themeRow = built.row;

    if (this.helios) {
      const bindings = this.helios?.constructor?.UI_BINDINGS ?? null;

      const networkControls = (() => {
        const container = document.createElement('div');
        container.className = 'helios-ui-network';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.xnet,.zxnet,.bxnet,.gml';
        fileInput.style.display = 'none';

        const formatSelect = document.createElement('select');
        formatSelect.className = 'helios-ui-select helios-ui-select--compact';
        for (const fmt of ['bxnet', 'zxnet', 'xnet', 'gml']) {
          const opt = document.createElement('option');
          opt.value = fmt;
          opt.textContent = fmt.toUpperCase();
          formatSelect.appendChild(opt);
        }

        const formatWarning = document.createElement('span');
        formatWarning.className = 'helios-ui-network__format-warning';
        formatWarning.setAttribute('role', 'img');
        formatWarning.setAttribute('aria-label', 'GML export warning');
        formatWarning.hidden = true;
        const warningIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        warningIcon.setAttribute('viewBox', '0 0 24 24');
        warningIcon.setAttribute('aria-hidden', 'true');
        warningIcon.classList.add('helios-ui-network__format-warning-icon');
        const warningPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        warningPath.setAttribute('d', 'M10.3 4.4 2.5 18a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 4.4a2 2 0 0 0-3.4 0ZM12 9v5m0 3h.01');
        warningPath.setAttribute('fill', 'none');
        warningPath.setAttribute('stroke', 'currentColor');
        warningPath.setAttribute('stroke-width', '2');
        warningPath.setAttribute('stroke-linecap', 'round');
        warningPath.setAttribute('stroke-linejoin', 'round');
        warningIcon.appendChild(warningPath);
        formatWarning.appendChild(warningIcon);

        const loadButton = document.createElement('button');
        loadButton.type = 'button';
        loadButton.className = 'helios-ui-button helios-ui-button--icon';
        loadButton.setAttribute('aria-label', 'Load network…');

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'helios-ui-button helios-ui-button--icon';
        saveButton.setAttribute('aria-label', 'Save network');

        const makeIcon = (d) => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.classList.add('helios-ui-button__icon');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'currentColor');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(path);
          return svg;
        };

        // Simple, readable icons (stroke, currentColor).
        const loadIcon = makeIcon('M12 3v10m0 0l-4-4m4 4l4-4M4 17v3h16v-3');
        const saveIcon = makeIcon('M12 21V11m0 0l-4 4m4-4l4 4M4 7V4h16v3');
        const syncIcon = makeIcon('M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 3v4h-4M6 21v-4h4');

        const loadText = document.createElement('span');
        loadText.textContent = 'Load';
        const saveText = document.createElement('span');
        saveText.textContent = 'Save';
        loadButton.appendChild(loadIcon);
        loadButton.appendChild(loadText);
        saveButton.appendChild(saveIcon);
        saveButton.appendChild(saveText);

        tooltips.attachTooltip(loadButton, 'Load a network file (.xnet/.zxnet/.bxnet/.gml)');
        tooltips.attachTooltip(saveButton, 'Save the current network as a file');
        tooltips.attachTooltip(formatSelect, 'Select export format');
        tooltips.attachTooltip(formatWarning, 'GML export is lossy: private Helios state, some attribute types, and keys that cannot be represented by GML may be skipped or renamed.');

        const syncContainer = document.createElement('div');
        syncContainer.className = 'helios-ui-network-persistence';
        const syncStatus = document.createElement('span');
        syncStatus.className = 'helios-ui-network-persistence__status';
        syncStatus.textContent = 'Not synced';
        const syncControls = document.createElement('div');
        syncControls.className = 'helios-ui-network-persistence__controls';
        const syncButton = document.createElement('button');
        syncButton.type = 'button';
        syncButton.className = 'helios-ui-button helios-ui-button--icon helios-ui-network-persistence__sync';
        syncButton.setAttribute('aria-label', 'Synchronize persistence');
        syncButton.appendChild(syncIcon);
        syncControls.appendChild(syncButton);
        syncContainer.appendChild(syncControls);
        syncContainer.appendChild(syncStatus);
        tooltips.attachTooltip(syncButton, 'Synchronize settings, network metadata, and positions');

        const autoSyncGroup = document.createElement('div');
        autoSyncGroup.className = 'helios-ui-network-autosync';
        const autoSyncLabel = document.createElement('span');
        autoSyncLabel.className = 'helios-ui-network-autosync__label';
        autoSyncLabel.textContent = 'Auto Sync';
        const autoSyncToggle = createToggleControl({
          checked: this.helios?.states?.get?.('network.persistence.autosave', true) !== false,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: 'Auto sync network persistence',
          className: 'helios-ui-toggle helios-ui-toggle--compact helios-ui-network-autosync__toggle',
        });
        autoSyncGroup.appendChild(autoSyncLabel);
        autoSyncGroup.appendChild(autoSyncToggle);
        tooltips.attachTooltip(autoSyncToggle, 'Automatically synchronize network state and positions when they change');
        syncControls.appendChild(autoSyncGroup);

        const controls = document.createElement('div');
        controls.className = 'helios-ui-network__actions';
        controls.style.marginTop = '8px';
        controls.style.marginBottom = '10px';
        controls.appendChild(loadButton);
        controls.appendChild(saveButton);
        controls.appendChild(formatSelect);
        controls.appendChild(formatWarning);
        controls.appendChild(fileInput);

        const formatRelativeSyncTime = (timestamp) => {
          if (!Number.isFinite(timestamp)) return null;
          const elapsed = Math.max(0, Date.now() - Number(timestamp));
          if (elapsed < 60000) return `${Math.floor(elapsed / 1000)}s ago`;
          if (elapsed < 3600000) return `${Math.floor(elapsed / 60000)}m ago`;
          return `${Math.floor(elapsed / 3600000)}h ago`;
        };

        const showPersistenceSync = storageSupportsPersistentUI(this.helios);
        const showSessionTab = storageSupportsSessions(this.helios);

        const syncPersistenceStatus = () => {
          if (!showPersistenceSync) return;
          const storage = this.helios?.storage ?? null;
          const status = storage?.persistenceStatus?.() ?? storage?.status?.() ?? null;
          const networkData = status?.networkData ?? {};
          const backendStatus = status?.backendStatus ?? [];
          const failed = backendStatus.find((entry) => entry?.ok === false) ?? null;
          const failureMessage = failed?.error ?? status?.lastError ?? networkData.remoteWarning ?? '';
          const logSyncFailure = () => {
            if (!failureMessage) return;
            const key = JSON.stringify({
              message: failureMessage,
              backend: failed?.id ?? failed?.name ?? failed?.type ?? null,
              sessionId: status?.sessionId ?? null,
              status: networkData.status ?? null,
            });
            if (this._lastLoggedSyncFailure === key) return;
            this._lastLoggedSyncFailure = key;
            console.error('[HeliosStorage] Sync failed', {
              error: failureMessage,
              backend: failed ?? null,
              status,
            });
          };
          const savedAtCandidates = [
            networkData.savedAt,
            status?.lastSyncedAt,
            status?.sessionSync?.savedAt,
            networkData.registrySavedAt,
          ].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
          const savedAt = savedAtCandidates.length ? Math.max(...savedAtCandidates) : null;
          const hasSavedAt = savedAt != null;
          const dirtySyncedText = hasSavedAt ? `Synced ${formatRelativeSyncTime(savedAt)}` : null;
          const cleanSyncedText = hasSavedAt ? 'Synced' : null;
          const networkPersistenceEnabled = this.helios?.states?.get?.('network.persistence.enabled', networkData.enabled !== false) !== false;
          const autosyncDisabledReason = networkData.autosyncDisabledReason?.message
            ?? (networkData.autosyncDisabled === true
              ? 'Auto sync is disabled for this session. Use manual Sync to save changes.'
              : '');
          const autosyncDisabled = networkData.autosyncDisabled === true;
          autoSyncToggle.checked = autosyncDisabled
            ? false
            : this.helios?.states?.get?.('network.persistence.autosave', true) !== false;
          autoSyncToggle.disabled = !networkPersistenceEnabled || autosyncDisabled;
          autoSyncGroup.title = autosyncDisabledReason;
          autoSyncToggle.title = autosyncDisabledReason;
          autoSyncGroup.dataset.state = autosyncDisabled ? 'disabled' : 'enabled';
          syncButton.title = '';
          if (status?.syncing || networkData.status === 'syncing') {
            syncStatus.textContent = 'Syncing...';
            syncButton.dataset.state = 'syncing';
            syncButton.disabled = true;
          } else if (networkData.status === 'skipped' && networkData.skipped?.reason === 'size-limit') {
            syncStatus.textContent = 'Network too large';
            syncButton.dataset.state = 'error';
            syncButton.disabled = false;
            syncButton.title = 'Network autosave was skipped because the payload is larger than the configured storage limit.';
          } else if (failed || status?.lastError || networkData.remoteWarning) {
            logSyncFailure();
            syncStatus.textContent = 'Sync failed';
            syncButton.dataset.state = 'error';
            syncButton.disabled = false;
            syncButton.title = failureMessage;
          } else if (networkData.positionsDirty) {
            syncStatus.textContent = dirtySyncedText ?? 'Unsynced';
            syncButton.dataset.state = 'dirty';
            syncButton.disabled = false;
            syncButton.title = dirtySyncedText
              ? 'Position changes will sync after interaction idle and the autosync debounce.'
              : 'Position changes have not been synced yet.';
          } else if (networkData.dirty) {
            syncStatus.textContent = dirtySyncedText ?? 'Unsynced';
            syncButton.dataset.state = 'dirty';
            syncButton.disabled = false;
            syncButton.title = dirtySyncedText
              ? 'Session changes will sync after interaction idle and the autosync debounce.'
              : 'Session changes have not been synced yet.';
          } else if (hasSavedAt) {
            syncStatus.textContent = cleanSyncedText;
            syncButton.dataset.state = 'saved';
            syncButton.disabled = false;
          } else {
            syncStatus.textContent = '';
            syncButton.dataset.state = 'idle';
            syncButton.disabled = false;
          }
        };

        const syncPersistenceStatusForChange = (event) => {
          const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
          const reason = String(detail.reason ?? '');
          const networkStatus = detail.status?.networkData && typeof detail.status.networkData === 'object'
            ? detail.status.networkData
            : null;
          const cleanSaved = networkStatus?.status === 'saved'
            && networkStatus.dirty !== true
            && networkStatus.positionsDirty !== true;
          const failed = networkStatus?.status === 'error'
            || networkStatus?.status === 'skipped'
            || Boolean(networkStatus?.remoteWarning)
            || Boolean(detail.error);
          if (reason === 'load' || reason === 'autosync-size-limit' || reason === 'autosync-disabled' || cleanSaved || failed) {
            syncPersistenceStatus();
            return;
          }
          const entries = Array.isArray(detail.entries) ? detail.entries : [];
          if (entries.some((entry) => {
            const path = String(entry?.path ?? '');
            return path.startsWith('network.persistence') || path.startsWith('positions.persistence');
          })) {
            syncPersistenceStatus();
          }
        };

        const syncStatusInterval = showPersistenceSync
          ? setInterval(syncPersistenceStatus, 10000)
          : null;
        if (syncStatusInterval != null) {
          this._controlCleanups.add(() => clearInterval(syncStatusInterval));
        }

        syncButton.addEventListener('click', async () => {
          syncButton.disabled = true;
          syncButton.dataset.state = 'syncing';
          syncStatus.textContent = 'Syncing...';
          try {
            await this.helios?.storage?.sync?.({
              includeNetwork: true,
              includePositions: true,
              retention: { enabled: false },
            });
          } catch (error) {
            console.error('[HeliosStorage] Manual sync failed', error);
          } finally {
            syncPersistenceStatus();
          }
        });

        autoSyncToggle.addEventListener('change', () => {
          const stateStore = this.helios?.states ?? null;
          stateStore?.set?.('network.persistence.autosave', autoSyncToggle.checked, {
            scope: 'workspace',
            source: 'ui',
            reason: 'network-autosync-toggle',
          });
          this.helios?.storage?.configure?.({
            networkPersistence: { autosave: autoSyncToggle.checked },
          });
          syncPersistenceStatus();
        });

        let baseName = this.helios._lastLoadedNetworkBase ?? 'network';
        let loadedFormat = this.helios._lastLoadedNetworkFormat ?? null;
        if (loadedFormat && ['bxnet', 'zxnet', 'xnet', 'gml'].includes(loadedFormat)) {
          formatSelect.value = loadedFormat;
        }

        const sanitizeBaseName = (value) => {
          const raw = String(value ?? '').trim();
          // Keep filenames portable and avoid path separators.
          return raw.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_');
        };

        let lastValidBaseName = sanitizeBaseName(baseName) || 'network';
        baseName = lastValidBaseName;

        const downloadBlob = (blob, filename) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 250);
        };

        const nameBar = document.createElement('div');
        nameBar.className = 'helios-ui-network__name';
        nameBar.style.marginTop = '6px';

        const syncRow = document.createElement('div');
        syncRow.className = 'helios-ui-network__sync-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'helios-ui-text';
        nameInput.value = lastValidBaseName;
        nameInput.placeholder = 'network';
        nameInput.spellcheck = false;
        nameInput.autocapitalize = 'off';
        nameInput.autocomplete = 'off';
        nameInput.inputMode = 'text';

        const extEl = document.createElement('span');
        extEl.className = 'helios-ui-network__ext';

        const syncExtension = () => {
          extEl.textContent = `.${formatSelect.value}`;
          formatWarning.hidden = formatSelect.value !== 'gml';
        };
        syncExtension();

        const exportNameInput = document.createElement('input');
        exportNameInput.type = 'text';
        exportNameInput.className = 'helios-ui-text';
        exportNameInput.value = lastValidBaseName;
        exportNameInput.placeholder = 'figure';
        exportNameInput.spellcheck = false;
        exportNameInput.autocapitalize = 'off';
        exportNameInput.autocomplete = 'off';
        exportNameInput.inputMode = 'text';

        const exportFormatSelect = document.createElement('select');
        exportFormatSelect.className = 'helios-ui-select';
        for (const fmt of ['png', 'svg']) {
          const opt = document.createElement('option');
          opt.value = fmt;
          opt.textContent = fmt.toUpperCase();
          exportFormatSelect.appendChild(opt);
        }

        const exportExtEl = document.createElement('span');
        exportExtEl.className = 'helios-ui-network__ext';

        const commitBaseName = (input) => {
          const candidate = sanitizeBaseName(input.value);
          if (candidate) {
            lastValidBaseName = candidate;
            baseName = candidate;
            if (nameInput.value !== candidate) nameInput.value = candidate;
            if (exportNameInput.value !== candidate) exportNameInput.value = candidate;
            exporterBehavior?.baseName?.(candidate);
          } else {
            input.value = lastValidBaseName;
          }
        };

        const syncBaseNameFromHelios = () => {
          const candidate = sanitizeBaseName(this.helios?._lastLoadedNetworkBase ?? '');
          if (!candidate || candidate === lastValidBaseName) return;
          baseName = candidate;
          lastValidBaseName = candidate;
          if (nameInput.value !== candidate) nameInput.value = candidate;
          if (exportNameInput.value !== candidate) exportNameInput.value = candidate;
          exporterBehavior?.baseName?.(candidate);
        };

        nameInput.addEventListener('blur', () => commitBaseName(nameInput));
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            nameInput.blur();
          }
        });
        exportNameInput.addEventListener('blur', () => commitBaseName(exportNameInput));
        exportNameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            exportNameInput.blur();
          }
        });

        tooltips.attachTooltip(nameInput, 'Base filename (without extension). Used when saving.');
        tooltips.attachTooltip(exportNameInput, 'Base filename (without extension). Used when exporting images.');

        nameBar.appendChild(nameInput);
        nameBar.appendChild(extEl);
        if (showPersistenceSync) {
          syncRow.appendChild(syncContainer);
        }

        const stats = document.createElement('div');
        stats.className = 'helios-ui-stats helios-ui-network__stats';
        stats.style.marginBottom = '8px';
        const nodesValue = document.createElement('div');
        nodesValue.textContent = '—';
        const edgesValue = document.createElement('div');
        edgesValue.textContent = '—';
        const typeValue = document.createElement('div');
        typeValue.textContent = '—';
        const avgDegValue = document.createElement('div');
        avgDegValue.textContent = '—';

        stats.appendChild(createStatChip('Nodes', nodesValue).stat);
        stats.appendChild(createStatChip('Edges', edgesValue).stat);
        stats.appendChild(createStatChip('Type', typeValue).stat);
        stats.appendChild(createStatChip('Avg deg', avgDegValue).stat);

        const refreshNetworkInfo = () => {
          const network = this.helios?.network ?? null;
          const nodes = network?.nodeCount ?? 0;
          const edges = network?.edgeCount ?? 0;
          const directed = Boolean(network?.directed);
          const avgDegree = nodes ? (directed ? edges / nodes : (2 * edges) / nodes) : 0;

          syncBaseNameFromHelios();
          syncExtension();
          nodesValue.textContent = String(nodes);
          edgesValue.textContent = String(edges);
          typeValue.textContent = directed ? 'directed' : 'undirected';
          avgDegValue.textContent = Number.isFinite(avgDegree) ? avgDegree.toFixed(2) : '—';
        };

        refreshNetworkInfo();
        if (showPersistenceSync) syncPersistenceStatus();

        const networkTab = document.createElement('div');
        networkTab.appendChild(stats);
        networkTab.appendChild(controls);
        networkTab.appendChild(nameBar);
        if (showPersistenceSync) networkTab.appendChild(syncRow);

        const sessionTab = document.createElement('div');
        sessionTab.className = 'helios-ui-session-tab';
        const sessionHeader = document.createElement('div');
        sessionHeader.className = 'helios-ui-session-tab__header';
        const currentSession = document.createElement('div');
        currentSession.className = 'helios-ui-session-tab__current';
        const currentSessionLabel = document.createElement('div');
        currentSessionLabel.className = 'helios-ui-session-tab__current-label';
        currentSessionLabel.textContent = 'Current';
        const currentSessionId = document.createElement('div');
        currentSessionId.className = 'helios-ui-session-tab__current-id';
        currentSession.appendChild(currentSessionLabel);
        currentSession.appendChild(currentSessionId);
        const sessionActions = document.createElement('div');
        sessionActions.className = 'helios-ui-session-tab__actions';
        const newSessionButton = document.createElement('button');
        newSessionButton.type = 'button';
        newSessionButton.className = 'helios-ui-button';
        newSessionButton.textContent = 'Save Session';
        const refreshSessionsButton = document.createElement('button');
        refreshSessionsButton.type = 'button';
        refreshSessionsButton.className = 'helios-ui-button helios-ui-button--icon';
        refreshSessionsButton.setAttribute('aria-label', 'Refresh sessions');
        refreshSessionsButton.appendChild(makeIcon('M21 12a9 9 0 0 1-15.5 6.2M3 12A9 9 0 0 1 18.5 5.8M18 3v4h-4M6 21v-4h4'));
        sessionActions.appendChild(newSessionButton);
        sessionActions.appendChild(refreshSessionsButton);
        sessionHeader.appendChild(currentSession);
        sessionHeader.appendChild(sessionActions);
        const sessionList = document.createElement('div');
        sessionList.className = 'helios-ui-session-tab__list';
        sessionTab.appendChild(sessionHeader);
        sessionTab.appendChild(sessionList);
        tooltips.attachTooltip(newSessionButton, 'Save the current network state as a restorable session');
        tooltips.attachTooltip(refreshSessionsButton, 'Refresh saved sessions');

        const refreshSessionTab = async () => {
          const storage = this.helios?.storage ?? null;
          const currentId = storage?.sessionId ?? null;
          currentSessionId.textContent = currentId || 'none';
          sessionList.replaceChildren();
          if (!storage?.capabilities?.sessions) {
            const empty = document.createElement('div');
            empty.className = 'helios-ui-label__hint';
            empty.textContent = 'Session persistence is not enabled.';
            sessionList.appendChild(empty);
            return;
          }
          let sessions = [];
          try {
            const sessionSource = typeof storage?.listSessionSummaries === 'function' ? storage : persistence;
            sessions = await sessionSource.listSessionSummaries({
              includeFinished: false,
              includeAllWorkspaces: true,
            });
          } catch (error) {
            const empty = document.createElement('div');
            empty.className = 'helios-ui-label__hint';
            empty.textContent = `Could not load sessions: ${error?.message ?? error}`;
            sessionList.appendChild(empty);
            return;
          }
          const visibleSessions = sessions.filter((entry) => entry?.id);
          if (!visibleSessions.length) {
            const empty = document.createElement('div');
            empty.className = 'helios-ui-label__hint';
            empty.textContent = 'No saved sessions.';
            sessionList.appendChild(empty);
            return;
          }
          for (let i = 0; i < visibleSessions.length; i += 1) {
            const session = visibleSessions[i];
            const isCurrent = currentId != null && String(session.id) === String(currentId);
            const row = document.createElement('div');
            row.className = 'helios-ui-session-tab__row';
            row.dataset.current = isCurrent ? 'true' : 'false';
            row.dataset.sessionId = session.id;
            const updatedAt = Number(session.updatedAt);
            const thumbnailCapturedAt = Number(session.thumbnail?.capturedAt);
            const thumbnailIsFreshForCurrent = !isCurrent
              || !Number.isFinite(updatedAt)
              || !Number.isFinite(thumbnailCapturedAt)
              || thumbnailCapturedAt >= updatedAt;
            const thumbnail = session.thumbnail?.dataUrl && thumbnailIsFreshForCurrent
              ? document.createElement('img')
              : null;
            if (thumbnail) {
              row.classList.add('helios-ui-session-tab__row--with-thumbnail');
              thumbnail.className = 'helios-ui-session-tab__thumbnail';
              thumbnail.src = session.thumbnail.dataUrl;
              thumbnail.alt = '';
              thumbnail.loading = 'lazy';
            }
            const details = document.createElement('div');
            details.className = 'helios-ui-session-tab__details';
            const title = document.createElement('div');
            title.className = 'helios-ui-session-tab__title';
            const compactUpdated = Number.isFinite(updatedAt) && updatedAt > 0
              ? new Date(updatedAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })
              : 'unknown date';
            const networkName = String(
              session.networkSource?.baseName
              ?? session.networkSource?.name
              ?? this.helios?._lastLoadedNetworkBase
              ?? 'network',
            ).trim() || 'network';
            const nickname = String(session.nickname ?? '').trim();
            const primaryName = nickname || networkName || `Session ${i + 1}`;
            title.textContent = `${primaryName} - ${compactUpdated}`;
            const meta = document.createElement('div');
            meta.className = 'helios-ui-session-tab__meta';
            const updated = Number.isFinite(updatedAt) && updatedAt > 0
              ? new Date(updatedAt).toLocaleString()
              : 'unknown date';
            const bytes = Number.isFinite(session.bytes) && session.bytes > 0
              ? `${Math.max(1, Math.round(session.bytes / 1024))} KB`
              : 'unknown size';
            const idLine = document.createElement('div');
            idLine.className = 'helios-ui-session-tab__meta-line helios-ui-session-tab__meta-line--id';
            idLine.textContent = String(session.id);
            const updatedLine = document.createElement('div');
            updatedLine.className = 'helios-ui-session-tab__meta-line';
            updatedLine.textContent = `latest ${updated} · ${bytes}`;
            meta.appendChild(idLine);
            meta.appendChild(updatedLine);
            details.appendChild(meta);
            const resume = document.createElement('button');
            resume.type = 'button';
            resume.className = 'helios-ui-button';
            resume.textContent = isCurrent ? 'Current' : 'Resume';
            resume.disabled = isCurrent;
            resume.addEventListener('click', async () => {
              if (isCurrent) return;
              resume.disabled = true;
              try {
                const sessionSource = storage;
                await (this.interfaceBehavior?.resumeSession?.({ sessionId: session.id })
                  ?? sessionSource?.resumeSession?.(session.id)
                  ?? sessionSource?.restoreSession?.(session.id));
                await storage?.sync?.({
                  includeNetwork: true,
                  includePositions: true,
                  retention: { enabled: false },
                });
                refreshNetworkInfo();
                syncPersistenceStatus();
              } finally {
                resume.disabled = false;
              }
            });
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'helios-ui-button helios-ui-button--icon helios-ui-session-tab__delete';
            deleteButton.setAttribute('aria-label', `Delete session ${primaryName}`);
            deleteButton.appendChild(makeIcon('M3 6h18M8 6V4h8v2M6.5 6l1 14h9l1-14M10 10v6M14 10v6'));
            tooltips.attachTooltip(deleteButton, 'Delete this saved session');
            deleteButton.addEventListener('click', async () => {
              const confirmed = globalThis.confirm?.(`Delete saved session "${primaryName}"? This cannot be undone.`) ?? false;
              if (!confirmed) return;
              deleteButton.disabled = true;
              resume.disabled = true;
              try {
                await (storage ?? persistence)?.deleteSession?.(session.id);
                await refreshSessionTab();
              } finally {
                deleteButton.disabled = false;
                resume.disabled = isCurrent;
              }
            });
            const rowActions = document.createElement('div');
            rowActions.className = 'helios-ui-session-tab__row-actions';
            rowActions.appendChild(resume);
            rowActions.appendChild(deleteButton);
            const body = document.createElement('div');
            body.className = 'helios-ui-session-tab__body';
            if (thumbnail) body.appendChild(thumbnail);
            body.appendChild(details);
            body.appendChild(rowActions);
            row.appendChild(title);
            row.appendChild(body);
            sessionList.appendChild(row);
          }
        };

        newSessionButton.addEventListener('click', async () => {
          newSessionButton.disabled = true;
          try {
            const storage = this.helios?.storage ?? null;
            const nickname = this.helios?._lastLoadedNetworkBase ?? this.helios?._lastLoadedNetworkName ?? 'network';
            await storage?.saveSession?.({
              nickname,
              networkFormat: 'zxnet',
              includeNetwork: true,
              includePositions: true,
              retention: { enabled: false },
            });
            syncPersistenceStatus();
            await refreshSessionTab();
          } finally {
            newSessionButton.disabled = false;
          }
        });
        refreshSessionsButton.addEventListener('click', () => {
          void refreshSessionTab();
        });

        const attributesTab = document.createElement('div');
        const attributesHeader = document.createElement('div');
        attributesHeader.style.display = 'flex';
        attributesHeader.style.alignItems = 'center';
        attributesHeader.style.justifyContent = 'space-between';
        attributesHeader.style.gap = '8px';
        attributesHeader.style.margin = '0 0 10px';

        const attributesSummary = document.createElement('div');
        attributesSummary.className = 'helios-ui-label__hint';

        const hiddenAttributesToggle = createSegmentedToggleControl({
          checked: false,
          onLabel: 'Hidden On',
          offLabel: 'Hidden Off',
          ariaLabel: 'Show hidden attributes',
        });

        const hiddenAttributesWrap = document.createElement('div');
        hiddenAttributesWrap.style.display = 'inline-flex';
        hiddenAttributesWrap.style.alignItems = 'center';
        hiddenAttributesWrap.style.gap = '6px';
        hiddenAttributesWrap.appendChild(hiddenAttributesToggle);

        attributesHeader.appendChild(attributesSummary);
        attributesHeader.appendChild(hiddenAttributesWrap);

        const attributesTableWrap = document.createElement('div');
        attributesTableWrap.className = 'helios-ui-attributes-table-wrap';

        const attributesTable = document.createElement('table');
        attributesTable.className = 'helios-ui-attributes-table';

        const attributesHead = document.createElement('thead');
        const attributesHeadRow = document.createElement('tr');
        for (const label of ['Scope', 'Attribute', 'Type', 'Dim']) {
          const th = document.createElement('th');
          th.textContent = label;
          attributesHeadRow.appendChild(th);
        }
        attributesHead.appendChild(attributesHeadRow);

        const attributesBody = document.createElement('tbody');
        attributesTable.appendChild(attributesHead);
        attributesTable.appendChild(attributesBody);
        attributesTableWrap.appendChild(attributesTable);

        const attributesEmpty = document.createElement('div');
        attributesEmpty.className = 'helios-ui-label__hint';
        attributesEmpty.textContent = 'No attributes to show.';
        attributesEmpty.hidden = true;

        attributesTab.appendChild(attributesHeader);
        attributesTab.appendChild(attributesTableWrap);
        attributesTab.appendChild(attributesEmpty);

        const collectAttributeRows = ({ includeHidden = false } = {}) => {
          const network = this.helios?.network ?? null;
          if (!network) return [];
          const rows = [];
          const appendRows = (scope, getNames, getInfo) => {
            const rawNames = getNames?.call(network) ?? [];
            for (const rawName of rawNames) {
              const name = String(rawName);
              if (!includeHidden && isHiddenAppAttributeName(name)) continue;
              const info = getInfo?.call(network, name) ?? null;
              rows.push({
                scope,
                name,
                type: formatAttributeType(info?.type),
                dimension: Number.isFinite(info?.dimension) ? String(info.dimension) : '—',
              });
            }
          };
          appendRows('node', network.getNodeAttributeNames, network.getNodeAttributeInfo);
          appendRows('edge', network.getEdgeAttributeNames, network.getEdgeAttributeInfo);
          appendRows('network', network.getNetworkAttributeNames, network.getNetworkAttributeInfo);
          rows.sort((a, b) => {
            const scopeCompare = a.scope.localeCompare(b.scope);
            if (scopeCompare !== 0) return scopeCompare;
            return a.name.localeCompare(b.name);
          });
          return rows;
        };

        const renderAttributesTable = () => {
          const includeHidden = hiddenAttributesToggle.checked === true;
          const rows = collectAttributeRows({ includeHidden });
          attributesBody.replaceChildren();
          attributesSummary.textContent = `${rows.length} attribute${rows.length === 1 ? '' : 's'}`;
          attributesEmpty.hidden = rows.length > 0;
          attributesTableWrap.hidden = rows.length === 0;
          for (const row of rows) {
            const tr = document.createElement('tr');
            for (const value of [row.scope, row.name, row.type, row.dimension]) {
              const td = document.createElement('td');
              td.textContent = value;
              tr.appendChild(td);
            }
            attributesBody.appendChild(tr);
          }
        };

        hiddenAttributesToggle.addEventListener('change', () => {
          renderAttributesTable();
        });
        renderAttributesTable();

        const exportTab = document.createElement('div');
        const exportNameBar = document.createElement('div');
        exportNameBar.className = 'helios-ui-network__name';
        exportNameBar.style.marginTop = '8px';
        exportNameBar.style.marginBottom = '12px';
        exportNameBar.appendChild(exportNameInput);
        exportNameBar.appendChild(exportExtEl);

        const presetSelect = document.createElement('select');
        presetSelect.className = 'helios-ui-select';
        const exporterBehavior = this.helios?.behavior?.exporter ?? null;

        const customWidthInput = document.createElement('input');
        customWidthInput.type = 'number';
        customWidthInput.className = 'helios-ui-number';
        customWidthInput.min = '1';
        customWidthInput.step = '1';
        customWidthInput.value = String(this.helios?.layers?.size?.width ?? this.helios?.size?.width ?? 1920);
        customWidthInput.style.maxWidth = '96px';

        const customHeightInput = document.createElement('input');
        customHeightInput.type = 'number';
        customHeightInput.className = 'helios-ui-number';
        customHeightInput.min = '1';
        customHeightInput.step = '1';
        customHeightInput.value = String(this.helios?.layers?.size?.height ?? this.helios?.size?.height ?? 1080);
        customHeightInput.style.maxWidth = '96px';

        const customSizeWrap = document.createElement('div');
        customSizeWrap.style.display = 'inline-flex';
        customSizeWrap.style.alignItems = 'center';
        customSizeWrap.style.gap = '8px';
        customSizeWrap.appendChild(customWidthInput);
        customSizeWrap.appendChild(document.createTextNode('×'));
        customSizeWrap.appendChild(customHeightInput);

        const supersamplingSelect = document.createElement('select');
        supersamplingSelect.className = 'helios-ui-select';
        for (const value of [1, 2, 4]) {
          const opt = document.createElement('option');
          opt.value = String(value);
          opt.textContent = `${value}x`;
          supersamplingSelect.appendChild(opt);
        }

        const labelsToggle = createToggleControl({
          checked: false,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: 'Export labels',
        });
        const legendsToggle = createToggleControl({
          checked: true,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: 'Export legends',
        });
        const interfaceToggle = createToggleControl({
          checked: false,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: 'Include interface margins',
        });
        const frameToggle = createToggleControl({
          checked: false,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: 'Show export frame',
        });
        const backgroundToggle = createToggleControl({
          checked: true,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: 'Export background',
        });
        const alphaModeControl = createSelectControl({
          ariaLabel: 'Alpha mode',
          value: 'straight',
          options: [
            { value: 'straight', label: 'Standard' },
            { value: 'premultiplied', label: 'Premultiplied' },
          ],
          onChange: () => syncExportUi(),
        });
        let exportLegendScale = exporterBehavior?.legendScale?.() ?? 1;
        const legendScaleAttribute = UIAttribute.number({
          id: 'figure.legendScale',
          label: 'Legend Scale',
          min: 0.25,
          max: 4,
          step: 0.05,
          domain: { min: 0.25, max: 4 },
          recommendedRange: { min: 0.5, max: 2.5 },
          get: () => exportLegendScale,
          set: (value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return;
            exportLegendScale = clampNumber(numeric, 0.25, 4);
            exporterBehavior?.legendScale?.(exportLegendScale);
          },
        });
        const legendScaleRow = createSliderRow(legendScaleAttribute, {
          hint: 'Multiplier for exported legend size. At 1x, legends keep the same relative size within the chosen figure.',
          precision: 2,
          step: 0.05,
        });
        this._controlCleanups.add(legendScaleRow.destroy);

        const exportButton = document.createElement('button');
        exportButton.type = 'button';
        exportButton.className = 'helios-ui-button';
        exportButton.textContent = 'Export';
        exportButton.style.marginLeft = 'auto';

        const previewContent = document.createElement('div');
        previewContent.className = 'helios-ui-figure-preview';

        const previewViewport = document.createElement('div');
        previewViewport.className = 'helios-ui-figure-preview__viewport';
        const previewImage = document.createElement('img');
        previewImage.className = 'helios-ui-figure-preview__image';
        previewImage.alt = 'Figure export preview';
        previewImage.decoding = 'async';
        previewImage.loading = 'eager';
        previewViewport.appendChild(previewImage);

        const previewStatus = document.createElement('div');
        previewStatus.className = 'helios-ui-figure-preview__status';
        previewStatus.textContent = '—';

        previewContent.appendChild(previewViewport);
        previewContent.appendChild(previewStatus);

        const previewStack = new PanelStack();
        previewStack.add({
          id: 'figure-preview',
          title: 'Preview',
          collapsed: false,
          statusDot: false,
          content: previewContent,
        });
        const previewEntry = previewStack._items.get('figure-preview') ?? null;
        const previewPanel = previewEntry?.item ?? null;
        const previewExpanded = () => previewPanel?.dataset.collapsed !== 'true';

        let previewUrl = null;
        let previewDirty = true;
        let previewBusy = false;
        let previewIgnoreRenderEvents = 0;
        let previewTimer = null;
        let previewCaptureGeneration = 0;
        let previewSceneVersion = 0;
        let previewCapturedSceneVersion = -1;
        let previewCapturedSignature = '';

        const clearPreviewUrl = () => {
          if (!previewUrl) return;
          URL.revokeObjectURL(previewUrl);
          previewUrl = null;
        };
        this._controlCleanups.add(() => clearPreviewUrl());

        const setPreviewStatus = (message) => {
          if (previewStatus.textContent === message) return;
          previewStatus.textContent = message;
        };

        const markPreviewDirty = () => {
          previewDirty = true;
        };

        const renderPreviewSummary = (resolved, thumbnail) => {
          void thumbnail;
          setPreviewStatus(`${resolved.width}×${resolved.height}`);
        };

        const refreshFigurePreview = async ({ force = false } = {}) => {
          if (!this.helios || !figureTabActive || !previewExpanded() || previewBusy || (!force && !previewDirty)) return;
          const resolved = resolveFigureState();
          const thumbnailOptions = resolveFigurePreviewThumbnailOptions(resolved, {
            maxWidth: 320,
            maxHeight: 180,
          });
          const signature = JSON.stringify(thumbnailOptions);
          if (!force && previewCapturedSignature === signature && previewCapturedSceneVersion === previewSceneVersion) {
            previewDirty = false;
            renderPreviewSummary(resolved, thumbnailOptions);
            return;
          }
          previewBusy = true;
          previewDirty = false;
          renderPreviewSummary(resolved, thumbnailOptions);
          const generation = ++previewCaptureGeneration;
          try {
            previewIgnoreRenderEvents += 1;
            const blob = exporterBehavior
              ? await exporterBehavior.exportPreviewBlob({}, {
                maxWidth: 320,
                maxHeight: 180,
              })
              : await this.helios.exportFigurePreviewBlob(resolved, {
                maxWidth: 320,
                maxHeight: 180,
              });
            const nextUrl = URL.createObjectURL(blob);
            await new Promise((resolve, reject) => {
              const image = new Image();
              image.onload = () => resolve();
              image.onerror = () => reject(new Error('Failed to decode preview image'));
              image.src = nextUrl;
            });
            if (generation !== previewCaptureGeneration) return;
            const prevUrl = previewUrl;
            previewUrl = nextUrl;
            previewImage.src = nextUrl;
            previewCapturedSignature = signature;
            previewCapturedSceneVersion = previewSceneVersion;
            if (prevUrl) URL.revokeObjectURL(prevUrl);
            renderPreviewSummary(resolved, thumbnailOptions);
          } catch (error) {
            if (generation !== previewCaptureGeneration) return;
            setPreviewStatus(error instanceof Error ? error.message : 'Failed to render preview.');
          } finally {
            previewBusy = false;
          }
        };

        const startPreviewTimer = () => {
          if (previewTimer != null) return;
          previewTimer = globalThis.setInterval(() => {
            void refreshFigurePreview();
          }, 1000);
        };
        const stopPreviewTimer = () => {
          if (previewTimer == null) return;
          globalThis.clearInterval(previewTimer);
          previewTimer = null;
        };
        this._controlCleanups.add(() => stopPreviewTimer());

        const syncExportExtension = () => {
          exportExtEl.textContent = `.${exportFormatSelect.value}`;
        };

        const getExportCapability = () => exporterBehavior?.getCapabilities?.({
          supersampling: Number(supersamplingSelect.value || 1),
        }) ?? this.helios?.getFigureExportCapabilities?.({
          supersampling: Number(supersamplingSelect.value || 1),
        }) ?? {
          maxBitmapDimension: 8192,
          presets: buildFigureExportPresetList(this.helios?.layers?.size ?? this.helios?.size ?? {}, { maxBitmapDimension: 8192 }, Number(supersamplingSelect.value || 1)),
        };

        const pushExporterUiState = (patch = {}) => {
          if (!exporterBehavior) return;
          exporterBehavior.update(patch);
          exportLegendScale = exporterBehavior.legendScale?.() ?? exportLegendScale;
        };

        const applyExporterStateToControls = () => {
          const state = exporterBehavior?.getPublicState?.() ?? null;
          if (!state) return;
          if (exportNameInput.value !== state.baseName) exportNameInput.value = state.baseName;
          if (exportFormatSelect.value !== state.format) exportFormatSelect.value = state.format;
          if (presetSelect.value !== String(state.preset ?? '')) presetSelect.value = String(state.preset ?? '');
          if (customWidthInput.value !== String(state.width ?? customWidthInput.value)) customWidthInput.value = String(state.width ?? customWidthInput.value);
          if (customHeightInput.value !== String(state.height ?? customHeightInput.value)) customHeightInput.value = String(state.height ?? customHeightInput.value);
          if (supersamplingSelect.value !== String(state.supersampling ?? 1)) supersamplingSelect.value = String(state.supersampling ?? 1);
          labelsToggle.checked = state.includeLabels === true;
          legendsToggle.checked = state.includeLegends !== false;
          interfaceToggle.checked = state.includeInterface === true;
          frameToggle.checked = state.showFrame === true;
          backgroundToggle.checked = state.transparentBackground !== true;
          alphaModeControl.value = state.alphaMode ?? 'straight';
          exportLegendScale = Number(state.legendScale ?? exportLegendScale);
          legendScaleAttribute.notify();
        };

        const exportFrame = document.createElement('div');
        exportFrame.className = 'helios-ui-export-frame';
        exportFrame.setAttribute('aria-hidden', 'true');
        Object.assign(exportFrame.style, {
          position: 'absolute',
          display: 'none',
          boxSizing: 'border-box',
          border: '2px solid #ff3b30',
          pointerEvents: 'none',
        });
        (this.helios?.layers?.overlay ?? this.container).appendChild(exportFrame);
        this._controlCleanups.add(() => exportFrame.remove());

        let figureTabActive = false;

        const syncPresetOptions = () => {
          const capability = getExportCapability();
          const presets = capability?.presets ?? [];
          const previous = presetSelect.value || capability?.defaultPreset || 'window';
          presetSelect.replaceChildren();
          let firstAvailable = 'custom';
          for (const entry of presets) {
            const opt = document.createElement('option');
            opt.value = entry.id;
            opt.textContent = entry.available === false ? `${entry.label} (unavailable)` : entry.label;
            opt.disabled = entry.available === false;
            if (entry.available !== false && firstAvailable === 'custom') firstAvailable = entry.id;
            presetSelect.appendChild(opt);
          }
          presetSelect.value = Array.from(presetSelect.options).some((opt) => opt.value === previous && !opt.disabled)
            ? previous
            : firstAvailable;
          if (exporterBehavior && exporterBehavior.preset?.() !== presetSelect.value) {
            pushExporterUiState({ preset: presetSelect.value });
          }
        };

        const resolveFigureState = () => exporterBehavior?.getResolvedOptions?.() ?? (() => {
          const capability = getExportCapability();
          return resolveFigureExportOptions({
            filename: exportNameInput.value,
            format: exportFormatSelect.value,
            preset: presetSelect.value,
            width: customWidthInput.value,
            height: customHeightInput.value,
            supersampling: Number(supersamplingSelect.value || 1),
            includeLabels: labelsToggle.checked,
            includeLegends: legendsToggle.checked,
            includeInterface: interfaceToggle.checked,
            legendScale: exportLegendScale,
            transparentBackground: backgroundToggle.checked !== true,
            alphaMode: alphaModeControl.value,
          }, {
            renderer: this.helios?.renderer,
            capability,
            windowSize: this.helios?.layers?.size ?? this.helios?.size ?? { width: 1, height: 1 },
          });
        })();

        const syncExportFrame = (resolved) => {
          const rect = resolved?.previewRect ?? null;
          const visible = Boolean(figureTabActive && (exporterBehavior?.showFrame?.() ?? frameToggle.checked) && rect);
          exportFrame.style.display = visible ? 'block' : 'none';
          if (!visible) return;
          exportFrame.style.left = `${rect.x}px`;
          exportFrame.style.top = `${rect.y}px`;
          exportFrame.style.width = `${rect.width}px`;
          exportFrame.style.height = `${rect.height}px`;
        };

        const syncExportUi = () => {
          syncPresetOptions();
          applyExporterStateToControls();
          syncExportExtension();
          const resolved = resolveFigureState();
          const isCustom = resolved.preset === 'custom';
          customWidthInput.disabled = !isCustom;
          customHeightInput.disabled = !isCustom;
          alphaModeControl.disabled = backgroundToggle.checked === true;
          exportButton.disabled = resolved.fitsCapability !== true;
          exportButton.title = resolved.fitsCapability === true
            ? 'Export figure'
            : `Requested raster pass ${resolved.bitmapWidth}×${resolved.bitmapHeight} exceeds the current renderer limit of ${resolved.capability.maxBitmapDimension}px.`;
          syncExportFrame(resolved);
          setPreviewStatus(`${resolved.width}×${resolved.height}`);
          markPreviewDirty();
          if (figureTabActive && previewExpanded()) {
            startPreviewTimer();
            if (!previewImage.src) void refreshFigurePreview({ force: true });
          } else {
            stopPreviewTimer();
          }
        };

        exportFormatSelect.addEventListener('change', () => {
          pushExporterUiState({ format: exportFormatSelect.value });
          syncExportUi();
        });
        presetSelect.addEventListener('change', () => {
          pushExporterUiState({ preset: presetSelect.value });
          syncExportUi();
        });
        supersamplingSelect.addEventListener('change', () => {
          pushExporterUiState({ supersampling: Number(supersamplingSelect.value || 1) });
          syncExportUi();
        });
        customWidthInput.addEventListener('change', () => {
          pushExporterUiState({ customSize: { width: customWidthInput.value, height: customHeightInput.value } });
          syncExportUi();
        });
        customHeightInput.addEventListener('change', () => {
          pushExporterUiState({ customSize: { width: customWidthInput.value, height: customHeightInput.value } });
          syncExportUi();
        });
        labelsToggle.addEventListener('change', () => {
          pushExporterUiState({ includeLabels: labelsToggle.checked });
          syncExportUi();
        });
        legendsToggle.addEventListener('change', () => {
          pushExporterUiState({ includeLegends: legendsToggle.checked });
          syncExportUi();
        });
        interfaceToggle.addEventListener('change', () => {
          pushExporterUiState({ includeInterface: interfaceToggle.checked });
          syncExportUi();
        });
        frameToggle.addEventListener('change', () => {
          pushExporterUiState({ showFrame: frameToggle.checked });
          syncExportUi();
        });
        backgroundToggle.addEventListener('change', () => {
          pushExporterUiState({ transparentBackground: backgroundToggle.checked !== true });
          syncExportUi();
        });
        alphaModeControl.addEventListener('change', () => {
          pushExporterUiState({ alphaMode: alphaModeControl.value });
          syncExportUi();
        });
        const unsubscribeLegendScale = legendScaleAttribute.subscribe(() => syncExportUi(), { immediate: false });
        this._controlCleanups.add(() => unsubscribeLegendScale());
        if (exporterBehavior?.on) {
          const unsubscribe = exporterBehavior.on('change', () => {
            applyExporterStateToControls();
            syncExportUi();
          });
          this._controlCleanups.add(unsubscribe);
        }

        const exportTabContent = document.createElement('div');
        exportTabContent.appendChild(createAlignedRow({
          title: 'Format',
          hint: 'PNG exports a bitmap. SVG embeds the bitmap and keeps labels/legends as vectors.',
          controls: exportFormatSelect,
        }).row);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Size',
          hint: 'Pick a preset based on the figure size. Window presets use the current view size.',
          controls: presetSelect,
        }).row);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Custom',
          hint: 'Used only when the size preset is Custom.',
          controls: customSizeWrap,
        }).row);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Supersampling',
          hint: 'Renders the bitmap portion at a larger size and downsamples it for sharper PNGs and embedded SVG images.',
          controls: supersamplingSelect,
        }).row);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Legends',
          hint: 'Adds the SVG legends using figure-relative placement, ignoring docked UI insets.',
          controls: legendsToggle,
        }).row);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Interface',
          hint: 'Keeps docked-panel margins when placing legends in the export. Off uses the full figure area.',
          controls: interfaceToggle,
        }).row);
        exportTabContent.appendChild(legendScaleRow.element);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Labels',
          hint: 'Adds the current SVG label overlay to the export.',
          controls: labelsToggle,
        }).row);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Background',
          hint: 'On exports an opaque figure with the current background color. Off makes the full figure background transparent.',
          controls: backgroundToggle,
        }).row);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Alpha',
          hint: 'Only used when Background is off. Standard is regular PNG/SVG alpha; premultiplied keeps raw framebuffer RGB.',
          controls: alphaModeControl,
        }).row);
        exportTabContent.appendChild(createAlignedRow({
          title: 'Frame',
          hint: 'Shows the crop that will be exported. Disabled by default.',
          controls: frameToggle,
        }).row);
        exportNameBar.appendChild(exportButton);
        exportTabContent.appendChild(exportNameBar);
        previewStack.element.style.marginTop = '8px';
        exportTabContent.appendChild(previewStack.element);
        exportTab.appendChild(exportTabContent);

        loadButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files?.[0] ?? null;
          fileInput.value = '';
          if (!file) return;
          loadButton.disabled = true;
          saveButton.disabled = true;
          try {
            await this.helios.loadNetwork(file, { disposeOld: true, recreateRenderer: true, keepCamera: false });
            const nextBase = this.helios._lastLoadedNetworkBase ?? file.name.replace(/\.[^.]+$/, '');
            const sanitized = sanitizeBaseName(nextBase);
            if (sanitized) {
              baseName = sanitized;
              lastValidBaseName = sanitized;
              nameInput.value = sanitized;
              exportNameInput.value = sanitized;
              exporterBehavior?.baseName?.(sanitized);
            }
            loadedFormat = this.helios._lastLoadedNetworkFormat ?? loadedFormat;
            if (loadedFormat && ['bxnet', 'zxnet', 'xnet', 'gml'].includes(loadedFormat)) {
              formatSelect.value = loadedFormat;
              syncExtension();
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to load network', error);
          } finally {
            refreshNetworkInfo();
            loadButton.disabled = false;
            saveButton.disabled = false;
          }
        });

        saveButton.addEventListener('click', async () => {
          saveButton.disabled = true;
          loadButton.disabled = true;
          try {
            commitBaseName(nameInput);
            const fmt = formatSelect.value;
            let blob = null;
            if (fmt === 'gml') {
              await this.helios.syncDelegatePositionsToNetwork?.();
              blob = await this.helios.saveNetwork(fmt, { output: 'blob' });
            } else {
              blob = await this.helios.savePortableNetwork?.(fmt, {
                output: 'blob',
                includeVisualization: true,
                trackedOnly: true,
                includeCurrentPositions: true,
              }) ?? await this.helios.saveNetwork(fmt, { output: 'blob' });
            }
            if (blob) {
              const filename = `${lastValidBaseName}.${fmt}`;
              downloadBlob(blob, filename);
            }
            await this.helios.storage?.sync?.({ includeNetwork: true, includePositions: true });
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to save network', error);
          } finally {
            refreshNetworkInfo();
            syncPersistenceStatus();
            saveButton.disabled = false;
            loadButton.disabled = false;
          }
        });

        exportButton.addEventListener('click', async () => {
          exportButton.disabled = true;
          try {
            commitBaseName(exportNameInput);
            exporterBehavior?.baseName?.(exportNameInput.value);
            const resolved = resolveFigureState();
            const blob = exporterBehavior
              ? await exporterBehavior.exportBlob()
              : await this.helios.exportFigureBlob(resolved);
            downloadBlob(blob, resolved.filename);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to export figure', error);
          } finally {
            syncExportUi();
          }
        });

        formatSelect.addEventListener('change', () => {
          syncExtension();
          refreshNetworkInfo();
        });

        // Update stats if the network is replaced externally.
        const onNetworkReplaced = () => {
          attachAttributeListeners();
          refreshNetworkInfo();
          syncPersistenceStatus();
          renderAttributesTable();
          syncExportUi();
        };
        let unsub = null;
        if (this.helios?.on) {
          unsub = this.helios.on('network:replaced', onNetworkReplaced);
        } else if (this.helios?.addEventListener) {
          this.helios.addEventListener('network:replaced', onNetworkReplaced);
          unsub = () => this.helios.removeEventListener('network:replaced', onNetworkReplaced);
        }
        if (unsub) this._controlCleanups.add(unsub);
        const storageManager = this.helios?.storage ?? null;
        storageManager?.addEventListener?.('change', syncPersistenceStatusForChange);
        this._controlCleanups.add(() => {
          storageManager?.removeEventListener?.('change', syncPersistenceStatusForChange);
        });
        if (exporterBehavior) {
          exporterBehavior.baseName?.(lastValidBaseName);
          applyExporterStateToControls();
        }

        let attributeEventsUnsub = null;
        const attachAttributeListeners = () => {
          attributeEventsUnsub?.();
          attributeEventsUnsub = null;
          const network = this.helios?.network ?? null;
          if (!network) return;
          const handler = (event) => {
            const scope = event?.detail?.scope;
            if (scope && scope !== 'node' && scope !== 'edge' && scope !== 'network') return;
            renderAttributesTable();
          };
          if (typeof network.on === 'function') {
            const unsubs = [
              network.on('attribute:defined', handler),
              network.on('attribute:removed', handler),
              network.on('attribute:changed', handler),
            ];
            attributeEventsUnsub = () => {
              for (const unsubHandler of unsubs) unsubHandler?.();
            };
          } else if (typeof network.addEventListener === 'function') {
            network.addEventListener('attribute:defined', handler);
            network.addEventListener('attribute:removed', handler);
            network.addEventListener('attribute:changed', handler);
            attributeEventsUnsub = () => {
              network.removeEventListener('attribute:defined', handler);
              network.removeEventListener('attribute:removed', handler);
              network.removeEventListener('attribute:changed', handler);
            };
          }
        };
        attachAttributeListeners();
        this._controlCleanups.add(() => attributeEventsUnsub?.());

        const onAfterRender = () => {
          if (previewIgnoreRenderEvents > 0) {
            previewIgnoreRenderEvents -= 1;
            return;
          }
          previewSceneVersion += 1;
          markPreviewDirty();
        };
        let unsubAfterRender = null;
        if (this.helios?.on) {
          unsubAfterRender = this.helios.on('render:after', onAfterRender);
        } else if (this.helios?.addEventListener) {
          this.helios.addEventListener('render:after', onAfterRender);
          unsubAfterRender = () => this.helios.removeEventListener('render:after', onAfterRender);
        }
        if (unsubAfterRender) this._controlCleanups.add(unsubAfterRender);

        const unsubResize = this.helios?.layers?.onResize?.(() => syncExportUi());
        if (unsubResize) this._controlCleanups.add(unsubResize);

        previewEntry?.header.addEventListener('click', () => {
          if (figureTabActive && previewExpanded()) {
            markPreviewDirty();
            startPreviewTimer();
            if (!previewImage.src) void refreshFigurePreview({ force: true });
          } else {
            stopPreviewTimer();
          }
        });

        const dataTabs = [
          { id: 'network', title: 'Network', content: networkTab },
          { id: 'figure', title: 'Figure', content: exportTab },
          { id: 'attributes', title: 'Attributes', content: attributesTab },
        ];
        if (showSessionTab) dataTabs.push({ id: 'session', title: 'Session', content: sessionTab });

        const tabs = new TabbedPanel({
          variant: 'panel',
          onActiveChanged: (id) => {
            figureTabActive = id === 'figure';
            syncExportUi();
          },
          tabs: dataTabs,
        });
        this._controlCleanups.add(() => tabs.destroy());
        container.appendChild(tabs.element);
        syncExportUi();
        if (showSessionTab) void refreshSessionTab();
        return container;
      })();

      const createRows = (accessorNames, {
        source = this.helios,
        bind = (accessorName) => this.bindHeliosAccessor(accessorName),
      } = {}) => {
        const container = document.createElement('div');
        for (const accessorName of accessorNames) {
          const info = bindings?.[accessorName] ?? null;
          if (info?.type && info.type !== 'number') continue;
          if (typeof source?.[accessorName] !== 'function') continue;
          const attribute = bind(accessorName);
          const label = attribute.label ?? info?.label ?? humanizeControlLabel(accessorName);
          const path = statePathForAccessor(accessorName);
          const row = createSliderRow(attribute, {
            title: label,
            hint: info?.description ?? null,
            dirtyIndicator: createStateIndicator(path),
          });
          container.appendChild(row.element);
          this._controlCleanups.add(row.destroy);
        }
        return container;
      };

      const createToggleRow = (accessorName, {
        source = this.helios,
        bind = (name) => this.bindHeliosAccessor(name),
      } = {}) => {
        const info = bindings?.[accessorName] ?? null;
        if (!info || info.type !== 'boolean') return null;
        if (typeof source?.[accessorName] !== 'function') return null;
        const attribute = bind(accessorName);
        const label = attribute.label ?? info.label ?? humanizeControlLabel(accessorName);
        const toggle = createToggleControl({
          checked: false,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: label,
          disabled: attribute.readOnly,
        });

        const syncToggle = (value) => {
          const enabled = Boolean(value);
          toggle.checked = enabled;
          toggle.disabled = attribute.readOnly;
        };

        const unsub = attribute.subscribe((value) => {
          syncToggle(value);
        });

        toggle.addEventListener('change', () => {
          attribute.write(toggle.checked, { source: 'ui', event: 'change' });
        });

        const controls = document.createElement('div');
        controls.className = 'helios-ui-row__controls';
        controls.appendChild(toggle);
        const { row } = createAlignedRow({
          title: label,
          hint: info.description ?? null,
          controls,
          dirtyIndicator: createStateIndicator(statePathForAccessor(accessorName)),
        });
        this._controlCleanups.add(() => unsub());
        return row;
      };

      const createSelectRow = (accessorName, options, {
        source = this.helios,
        bind = (name) => this.bindHeliosAccessor(name),
      } = {}) => {
        const info = bindings?.[accessorName] ?? null;
        if (!info || info.type !== 'string') return null;
        if (typeof source?.[accessorName] !== 'function') return null;
        const attribute = bind(accessorName);
        const label = attribute.label ?? info.label ?? humanizeControlLabel(accessorName);
        const select = createSelectControl({
          ariaLabel: label,
          options,
          value: attribute.value(),
        });

        const syncSelect = (value) => {
          select.value = String(value ?? '');
          select.disabled = attribute.readOnly;
        };

        const unsub = attribute.subscribe((value) => {
          syncSelect(value);
        });

        select.addEventListener('change', () => {
          attribute.write(select.value, { source: 'ui', event: 'change' });
        });

        const controls = document.createElement('div');
        controls.className = 'helios-ui-row__controls';
        controls.appendChild(select);
        const { row } = createAlignedRow({
          title: label,
          hint: info.description ?? null,
          controls,
          dirtyIndicator: createStateIndicator(statePathForAccessor(accessorName)),
        });
        this._controlCleanups.add(() => unsub());
        return row;
      };

      const clamp01 = (value) => {
        const v = Number(value);
        if (!Number.isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
      };

      const rgba01ToHex6 = (rgba) => {
        const r = Math.round(255 * clamp01(rgba?.[0] ?? 0));
        const g = Math.round(255 * clamp01(rgba?.[1] ?? 0));
        const b = Math.round(255 * clamp01(rgba?.[2] ?? 0));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      };
      const hexToRgba01 = (value) => {
        const raw = String(value ?? '').trim().replace(/^#/, '');
        if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return null;
        const r = parseInt(raw.slice(0, 2), 16);
        const g = parseInt(raw.slice(2, 4), 16);
        const b = parseInt(raw.slice(4, 6), 16);
        const a = raw.length === 8 ? parseInt(raw.slice(6, 8), 16) : 255;
        if (![r, g, b, a].every(Number.isFinite)) return null;
        return [r / 255, g / 255, b / 255, a / 255];
      };
      const applyBackgroundColor = (value) => {
        const normalized = hexToRgba01(value) ?? value;
        const target = appearanceBehavior?.background ?? this.helios?.background ?? this.helios?.clearColor;
        if (typeof target === 'function') target.call(appearanceBehavior ?? this.helios, normalized);
        writeAccessorPersistenceValue('background', normalized, 'background');
      };

      const createColorWithAlphaControls = ({ ariaLabel, getValue, setValue }) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.width = '100%';

        const swatchWrap = document.createElement('div');
        swatchWrap.className = 'helios-ui-color-swatch';

        const swatch = document.createElement('div');
        swatch.className = 'helios-ui-color-swatch__swatch';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'helios-ui-color-swatch__input';
        colorInput.setAttribute('aria-label', ariaLabel);

        const alphaInput = document.createElement('input');
        alphaInput.type = 'number';
        alphaInput.className = 'helios-ui-number';
        alphaInput.min = '0';
        alphaInput.max = '1';
        alphaInput.step = '0.01';
        alphaInput.style.maxWidth = '88px';
        alphaInput.title = 'Alpha';
        alphaInput.setAttribute('aria-label', `${ariaLabel} alpha`);

        const alphaLabel = document.createElement('span');
        alphaLabel.textContent = 'Alpha';
        alphaLabel.style.color = 'var(--helios-ui-muted)';

        const rawValue = getValue?.();

        let baseHex = '#000000';
        let alpha = 1;
        if (typeof rawValue === 'string') {
          const raw = rawValue.startsWith('#') ? rawValue.slice(1) : rawValue;
          baseHex = raw.length >= 6 ? `#${raw.slice(0, 6)}` : '#000000';
          const alphaHex = raw.length === 8 ? raw.slice(6, 8) : 'ff';
          alpha = Math.round((parseInt(alphaHex, 16) / 255) * 100) / 100;
        } else if (Array.isArray(rawValue) || ArrayBuffer.isView(rawValue)) {
          baseHex = rgba01ToHex6(rawValue);
          alpha = clamp01(rawValue?.[3] ?? 1);
        }

        colorInput.value = baseHex;
        alphaInput.value = String(Number.isFinite(alpha) ? alpha : 1);
        let lastCommittedValue = toHex8(colorInput.value, clamp01(alphaInput.value));
        swatch.style.background = colorInput.value;

        const commit = () => {
          const a = clampNumber(alphaInput.value, { min: 0, max: 1 });
          if (a == null) return;
          const nextValue = toHex8(colorInput.value, a);
          if (nextValue === lastCommittedValue) return;
          lastCommittedValue = nextValue;
          setValue?.(nextValue);
          swatch.style.background = colorInput.value;
        };

        colorInput.addEventListener('input', commit);
        alphaInput.addEventListener('change', commit);

        swatchWrap.appendChild(swatch);
        swatchWrap.appendChild(colorInput);
        row.appendChild(swatchWrap);
        row.appendChild(alphaLabel);
        row.appendChild(alphaInput);
        return row;
      };

      const createColorControls = ({ ariaLabel, getValue, setValue }) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.width = '100%';

        const swatchWrap = document.createElement('div');
        swatchWrap.className = 'helios-ui-color-swatch';

        const swatch = document.createElement('div');
        swatch.className = 'helios-ui-color-swatch__swatch';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'helios-ui-color-swatch__input';
        colorInput.setAttribute('aria-label', ariaLabel);

        colorInput.value = rgba01ToHex6(getValue?.());
        let lastCommittedValue = toHex8(colorInput.value, 1);
        swatch.style.background = colorInput.value;
        const commit = () => {
          const nextValue = toHex8(colorInput.value, 1);
          if (nextValue === lastCommittedValue) return;
          lastCommittedValue = nextValue;
          setValue?.(nextValue);
          swatch.style.background = colorInput.value;
        };
        colorInput.addEventListener('input', commit);

        swatchWrap.appendChild(swatch);
        swatchWrap.appendChild(colorInput);
        row.appendChild(swatchWrap);
        return row;
      };

      const createLabelSourceSelect = (labelsBehavior = null) => {
        const select = document.createElement('select');
        select.className = 'helios-ui-select';
        select.setAttribute('aria-label', 'Label source attribute');

        const readNodeAttributeNames = () => {
          const network = this.helios?.network ?? null;
          if (!network || typeof network.getNodeAttributeNames !== 'function') return [];
          try {
            const raw = network.getNodeAttributeNames() ?? [];
            const out = [];
            for (const name of raw) {
              if (typeof name !== 'string') continue;
              if (!isPublicAttributeName(name)) continue;
              out.push(name);
            }
            out.sort((a, b) => a.localeCompare(b));
            return out;
          } catch (_) {
            return [];
          }
        };

        const refreshOptions = () => {
          const currentRaw = labelsBehavior?.source?.() ?? this.helios?.labelSource?.();
          const current = typeof currentRaw === 'string' ? currentRaw.trim() : '';
          const currentUi = current === '$id' ? '$index' : current;

          const options = [
            { value: '', label: 'Auto (Label, Name, id)' },
            { value: '$index', label: '$index (node id)' },
          ];
          const seen = new Set(options.map((entry) => entry.value));
          for (const name of readNodeAttributeNames()) {
            if (seen.has(name)) continue;
            options.push({ value: name, label: name });
            seen.add(name);
          }
          if (currentUi && !seen.has(currentUi)) {
            options.push({ value: currentUi, label: `${currentUi} (custom)` });
            seen.add(currentUi);
          }

          select.replaceChildren();
          for (const entry of options) {
            const opt = document.createElement('option');
            opt.value = entry.value;
            opt.textContent = entry.label;
            select.appendChild(opt);
          }
          select.value = seen.has(currentUi) ? currentUi : '';
        };

        select.addEventListener('change', () => {
          const next = String(select.value ?? '').trim();
          if (!next) {
            labelsBehavior?.source?.(null) ?? this.helios?.labelSource?.(null);
          } else if (next === '$index') {
            labelsBehavior?.source?.('$id') ?? this.helios?.labelSource?.('$id');
          } else {
            labelsBehavior?.source?.(next) ?? this.helios?.labelSource?.(next);
          }
          refreshOptions();
        });

        const onNetworkReplaced = () => refreshOptions();
        let unsubscribe = null;
        if (this.helios?.on) {
          unsubscribe = this.helios.on('network:replaced', onNetworkReplaced);
        } else if (this.helios?.addEventListener) {
          this.helios.addEventListener('network:replaced', onNetworkReplaced);
          unsubscribe = () => this.helios.removeEventListener('network:replaced', onNetworkReplaced);
        }

        refreshOptions();
        return {
          element: select,
          destroy() {
            if (typeof unsubscribe === 'function') unsubscribe();
          },
        };
      };

      const createLabelFontFamilyInput = (labelsBehavior = null) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'helios-ui-text';
        input.placeholder = 'ui-sans-serif, system-ui, sans-serif';
        input.setAttribute('aria-label', 'Label font family');
        input.value = String(labelsBehavior?.fontFamily?.() ?? this.helios?.labelFontFamily?.() ?? '');
        input.addEventListener('change', () => {
          const next = String(input.value ?? '').trim();
          labelsBehavior?.fontFamily?.(next) ?? this.helios?.labelFontFamily?.(next);
        });
        return input;
      };

      const appearanceBehavior = this.helios?.behavior?.appearance ?? this.helios?.useBehavior?.('appearance');
      this._lastAppearanceBehavior = appearanceBehavior ?? null;
      const bindAppearanceAccessor = (accessorName, options = {}) => (
        appearanceBehavior
          ? this.bindBehaviorAccessor(appearanceBehavior, accessorName, options)
          : this.bindHeliosAccessor(accessorName, options)
      );
      const appearanceAccessorSource = appearanceBehavior ?? this.helios;
      const registerAccessorPersistenceKey = (accessorName, read) => {
        const path = statePathForAccessor(accessorName);
        if (!path) return null;
        this._registerStateKey(path, {
          scope: stateScopeForPath(path),
          debounceMs: stateDebounceForPath(path),
          defaultValue: read?.(),
          metadata: { accessor: accessorName },
        });
        return path;
      };
      const writeAccessorPersistenceValue = (accessorName, value, reason = accessorName) => {
        const path = statePathForAccessor(accessorName);
        if (!path) return null;
        return this._writeStateValue(path, value, {
          scope: stateScopeForPath(path),
          source: 'ui',
          reason,
          debounceMs: stateDebounceForPath(path),
          applyBinding: false,
        });
      };
      const writeAppearanceAccessor = (accessorName, value, reason = accessorName) => {
        const path = statePathForAccessor(accessorName);
        const stateManager = this.helios?.states ?? null;
        if (path && typeof stateManager?.entry === 'function' && typeof stateManager?.set === 'function' && stateManager.entry(path)) {
          return this._writeStateValue(path, value, {
            scope: stateScopeForPath(path),
            source: 'ui',
            reason,
            debounceMs: stateDebounceForPath(path),
            applyBinding: true,
          });
        }
        const fallbackAccessorName = accessorName === 'background' ? 'clearColor' : accessorName;
        const target = appearanceBehavior?.[accessorName] ?? this.helios?.[fallbackAccessorName];
        if (typeof target === 'function') target.call(appearanceBehavior ?? this.helios, value);
        return writeAccessorPersistenceValue(accessorName, value, reason);
      };

      const createAppearanceContent = () => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(themeRow);

        const dimensionToggle = createSegmentedToggleControl({
          checked: false,
          onLabel: '3D',
          offLabel: '2D',
          ariaLabel: 'Scene dimension',
        });
        dimensionToggle.dataset.testid = 'controls-appearance-dimension';
        const readSceneDimension = () => (
          (this.helios?.mode?.() ?? this.helios?.options?.mode ?? '2d') === '3d' ? '3d' : '2d'
        );
        const defaultSceneDimension = this.helios?._initialMode === '3d' ? '3d' : '2d';
        this._registerStateKey('scene.dimension', {
          scope: 'network',
          debounceMs: 0,
          defaultValue: defaultSceneDimension,
          metadata: { control: 'dimension' },
        });
        const unbindSceneDimension = this.helios?.states?.subscribe?.('scene.dimension', (value) => {
            const nextMode = value === '3d' ? '3d' : '2d';
            if (readSceneDimension() === nextMode) return;
            this.helios?.setMode?.(nextMode);
        });
        if (typeof unbindSceneDimension === 'function') this._controlCleanups.add(unbindSceneDimension);

        const syncDimensionToggle = (mode = null) => {
          const nextMode = mode === '3d'
            ? '3d'
            : readSceneDimension();
          dimensionToggle.checked = nextMode === '3d';
          dimensionToggle.disabled = typeof this.helios?.setMode !== 'function';
        };

        dimensionToggle.addEventListener('change', () => {
          const targetMode = dimensionToggle.checked ? '3d' : '2d';
          Promise.resolve(this.helios?.setMode?.(targetMode))
            .then(() => {
              const currentMode = readSceneDimension();
              if (currentMode !== targetMode) {
                syncDimensionToggle(currentMode);
                return;
              }
              this._writeStateValue('scene.dimension', currentMode, {
                scope: 'network',
                source: 'ui',
                reason: 'dimension',
                debounceMs: 0,
              });
            })
            .catch((error) => {
              // eslint-disable-next-line no-console
              console.error(error);
              syncDimensionToggle();
            });
        });

        let unsubscribeMode = null;
        const onModeChanged = (event) => syncDimensionToggle(event?.detail?.mode ?? event?.mode ?? null);
        if (this.helios?.on) {
          unsubscribeMode = this.helios.on('mode:changed', onModeChanged);
        } else if (this.helios?.addEventListener) {
          this.helios.addEventListener('mode:changed', onModeChanged);
          unsubscribeMode = () => this.helios.removeEventListener('mode:changed', onModeChanged);
        }
        if (unsubscribeMode) this._controlCleanups.add(unsubscribeMode);
        syncDimensionToggle();

        registerAccessorPersistenceKey('background', () => appearanceBehavior?.background?.() ?? this.helios?.clearColor?.());
        wrapper.appendChild(createAlignedRow({
          title: 'Dimension',
          hint: 'Switch camera and active layout between 2D and 3D.',
          controls: dimensionToggle,
          dirtyIndicator: createStateIndicator('scene.dimension', 'scene'),
        }).row);

        wrapper.appendChild(createAlignedRow({
          title: 'Background',
          hint: 'Clear/background color (including opacity).',
          controls: createColorWithAlphaControls({
            ariaLabel: 'Background color',
            getValue: () => appearanceBehavior?.background?.() ?? this.helios?.clearColor?.(),
            setValue: applyBackgroundColor,
          }),
          dirtyIndicator: createStateIndicator(statePathForAccessor('background')),
        }).row);

        const modes = [
          { value: 'alpha', label: 'Alpha' },
          { value: 'weighted', label: 'Smooth' },
          { value: 'additive', label: 'Additive' },
          { value: 'screen', label: 'Screen' },
          { value: 'max', label: 'Max' },
          { value: 'additive-normalized', label: 'Additive (normalized)' },
          { value: 'additive-tonemapped', label: 'Additive (tonemapped)' },
          { value: 'additive-normalized-bright', label: 'Additive (normalized bright)' },
        ];
        const edgeTransparencyAttribute = bindAppearanceAccessor('edgeTransparencyMode');
        const modeSelect = createSelectControl({
          ariaLabel: 'Edge transparency mode',
          options: modes,
          value: edgeTransparencyAttribute.value(),
        });
        tooltips.attachTooltip(modeSelect, 'How edges blend/accumulate when overlapping.');
        const syncEdgeMode = (value) => {
          const next = typeof value === 'string' ? value : 'weighted';
          modeSelect.value = modes.some((entry) => entry.value === next) ? next : 'weighted';
          modeSelect.disabled = edgeTransparencyAttribute.readOnly;
        };
        const unsubscribeEdgeMode = edgeTransparencyAttribute.subscribe((value) => syncEdgeMode(value));
        modeSelect.addEventListener('change', () => {
          edgeTransparencyAttribute.write(modeSelect.value, { source: 'ui', event: 'change' });
        });
        this._controlCleanups.add(() => unsubscribeEdgeMode());

        wrapper.appendChild(createAlignedRow({
          title: 'Blend Mode',
          hint: 'Controls how overlapping edges are composited ("Smooth" reduces overlap artifacts).',
          controls: modeSelect,
          dirtyIndicator: createStateIndicator(statePathForAccessor('edgeTransparencyMode')),
        }).row);

        return wrapper;
      };

      const createLabelsContent = () => {
        const wrapper = document.createElement('div');
        const labelsBehavior = this.helios?.behavior?.labels ?? this.helios?.useBehavior?.('labels');

        const labelsModeSelect = createSelectControl({
          ariaLabel: 'Label Mode',
          options: [
            { value: 'off', label: 'Off' },
            { value: 'auto', label: 'Auto Labels' },
            { value: 'selected-only', label: 'Selected Only' },
          ],
          value: labelsBehavior?.mode?.() ?? this.helios?.labelsMode?.(),
        });
        const syncLabelsMode = (value) => {
          const next = value === 'selected-only' ? 'selected-only' : (value === 'off' ? 'off' : 'auto');
          labelsModeSelect.value = next;
          labelsModeSelect.disabled = false;
        };
        const unsubscribeLabelsMode = labelsBehavior?.on?.('change', (event) => {
          syncLabelsMode(event?.detail?.state?.enabled === true
            ? (event?.detail?.state?.selectionMode === 'selected-only' ? 'selected-only' : 'auto')
            : 'off');
        }) ?? (() => {});
        labelsModeSelect.addEventListener('change', () => {
          labelsBehavior?.mode?.(labelsModeSelect.value);
        });
        this._controlCleanups.add(() => unsubscribeLabelsMode());
        wrapper.appendChild(createAlignedRow({
          title: 'Labels',
          hint: 'Off hides regular labels. Auto Labels ranks visible labels. Selected Only limits regular labels to selected nodes.',
          controls: labelsModeSelect,
          dirtyIndicator: createStateIndicator('labels.mode', 'labels'),
        }).row);

        const selectedOnlySpaceAwareToggle = createToggleControl({
          checked: labelsBehavior?.state?.selectedOnlySpaceAware === true,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: 'Selected-only labels use regular space-aware placement',
          disabled: false,
        });
        const syncSelectedOnlySpaceAware = (value) => {
          selectedOnlySpaceAwareToggle.checked = Boolean(value);
          selectedOnlySpaceAwareToggle.disabled = false;
        };
        const unsubscribeSelectedOnlySpaceAware = labelsBehavior?.on?.('change', (event) => {
          syncSelectedOnlySpaceAware(event?.detail?.state?.selectedOnlySpaceAware === true);
        }) ?? (() => {});
        selectedOnlySpaceAwareToggle.addEventListener('change', () => {
          labelsBehavior?.update?.({ selectedOnlySpaceAware: selectedOnlySpaceAwareToggle.checked });
        });
        this._controlCleanups.add(() => unsubscribeSelectedOnlySpaceAware());
        const selectedOnlySpaceAwareRow = createAlignedRow({
          title: 'Use Available Space',
          hint: 'When Selected Only is active, apply the same collision and space-availability logic used by regular labels.',
          dirtyIndicator: createStateIndicator('labels.selectedOnlySpaceAware', 'labels'),
          controls: (() => {
            const controls = document.createElement('div');
            controls.className = 'helios-ui-row__controls';
            controls.appendChild(selectedOnlySpaceAwareToggle);
            return controls;
          })(),
        }).row;
        const syncSelectedOnlySpaceAwareVisibility = (mode) => {
          selectedOnlySpaceAwareRow.style.display = mode === 'selected-only' ? '' : 'none';
        };
        syncSelectedOnlySpaceAwareVisibility(labelsBehavior?.mode?.() ?? this.helios?.labelsMode?.());
        const unsubscribeLabelsModeForSpaceAware = labelsBehavior?.on?.('change', (event) => {
          const state = event?.detail?.state ?? {};
          syncSelectedOnlySpaceAwareVisibility(state.enabled === true
            ? (state.selectionMode === 'selected-only' ? 'selected-only' : 'auto')
            : 'off');
        }) ?? (() => {});
        this._controlCleanups.add(() => unsubscribeLabelsModeForSpaceAware());
        wrapper.appendChild(selectedOnlySpaceAwareRow);

        wrapper.appendChild(createRows([
          'labelsMaxVisible',
          'labelsFontSizeScale',
          'labelsMinScreenRadius',
          'labelsOutlineWidth',
          'labelsOffsetRadiusFactor',
          'labelsOffsetPx',
          'labelsMaxChars',
          'labelsMaxRows',
        ]));

        const labelSourceControl = createLabelSourceSelect(labelsBehavior);
        wrapper.appendChild(createAlignedRow({
          title: 'Source',
          hint: 'Node attribute used for labels. Empty = auto fallback (Label, Name, id).',
          controls: labelSourceControl.element,
          dirtyIndicator: createStateIndicator('labels.source', 'labels'),
        }).row);
        this._controlCleanups.add(() => labelSourceControl.destroy());

        wrapper.appendChild(createAlignedRow({
          title: 'Font Family',
          hint: 'CSS font-family used by SVG labels.',
          controls: createLabelFontFamilyInput(labelsBehavior),
          dirtyIndicator: createStateIndicator('labels.fontFamily', 'labels'),
        }).row);

        wrapper.appendChild(createAlignedRow({
          title: 'Fill',
          hint: 'Label text color + alpha.',
          dirtyIndicator: createStateIndicator('labels.fill', 'labels'),
          controls: createColorWithAlphaControls({
            ariaLabel: 'Label fill color',
            getValue: () => labelsBehavior?.fill?.() ?? this.helios?.labelFill?.(),
            setValue: (value) => labelsBehavior?.fill?.(value) ?? this.helios?.labelFill?.(value),
          }),
        }).row);

        wrapper.appendChild(createAlignedRow({
          title: 'Outline',
          hint: 'Label outline/halo color + alpha.',
          dirtyIndicator: createStateIndicator('labels.outlineColor', 'labels'),
          controls: createColorWithAlphaControls({
            ariaLabel: 'Label outline color',
            getValue: () => labelsBehavior?.outlineColor?.() ?? this.helios?.labelOutlineColor?.(),
            setValue: (value) => labelsBehavior?.outlineColor?.(value) ?? this.helios?.labelOutlineColor?.(value),
          }),
        }).row);
        return wrapper;
      };

      const createAdvancedContent = () => {
        const advanced = document.createElement('div');
        advanced.appendChild(createRows([
          'nodeSizeBase',
          'semanticZoomExponent',
          'nodeOpacityBase',
          'nodeOutlineWidthBase',
          'edgeWidthBase',
          'edgeOpacityBase',
          'edgeEndpointTrim',
        ]));

        if (typeof this.helios?.supersampling === 'function') {
          const supersampling = this.bindHeliosAccessor('supersampling');
          const supersamplingSelect = document.createElement('select');
          supersamplingSelect.className = 'helios-ui-select';
          supersamplingSelect.setAttribute('aria-label', 'Supersampling');
          tooltips.attachTooltip(supersamplingSelect, 'Canvas resolution scale. Auto keeps retina screens native and boosts lower-DPR screens.');
          for (const option of [
            { value: 'off', label: 'Off' },
            { value: 'auto', label: 'Auto' },
            { value: '2x', label: '2x' },
          ]) {
            const element = document.createElement('option');
            element.value = option.value;
            element.textContent = option.label;
            supersamplingSelect.appendChild(element);
          }
          const syncSupersampling = (value) => {
            const next = value === 'off' || value === '2x' ? value : 'auto';
            supersamplingSelect.value = next;
          };
          const unsubscribeSupersampling = supersampling.subscribe((value) => {
            syncSupersampling(value);
          });
          supersamplingSelect.addEventListener('change', () => {
            supersampling.write(supersamplingSelect.value, { source: 'ui', event: 'change' });
          });
          this._controlCleanups.add(() => unsubscribeSupersampling());
              advanced.appendChild(createAlignedRow({
                title: 'Supersampling',
                hint: 'Adjust canvas backing resolution live. Auto matches the legacy default.',
                controls: supersamplingSelect,
                dirtyIndicator: createStateIndicator(statePathForAccessor('supersampling')),
              }).row);
        }

        const nodeBlendRow = createToggleRow('nodeBlendWithEdges', {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (nodeBlendRow) advanced.appendChild(nodeBlendRow);
        const edgeDepthRow = createToggleRow('edgeDepthWrite');
        if (edgeDepthRow) advanced.appendChild(edgeDepthRow);
        const edgeWidthClampRow = createToggleRow('edgeWidthClampToNodeDiameter', {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (edgeWidthClampRow) advanced.appendChild(edgeWidthClampRow);
        return advanced;
      };

      const nodeEdgeStack = new PanelStack();
      const createShadedAppearanceContent = () => {
        const container = document.createElement('div');
        registerAccessorPersistenceKey('shadedLightColor', () => appearanceBehavior?.shadedLightColor?.() ?? this.helios?.shadedLightColor?.());
        registerAccessorPersistenceKey('shadedAmbientTopColor', () => appearanceBehavior?.shadedAmbientTopColor?.() ?? this.helios?.shadedAmbientTopColor?.());
        registerAccessorPersistenceKey('shadedAmbientBottomColor', () => appearanceBehavior?.shadedAmbientBottomColor?.() ?? this.helios?.shadedAmbientBottomColor?.());
        registerAccessorPersistenceKey('shadedSpecularColor', () => appearanceBehavior?.shadedSpecularColor?.() ?? this.helios?.shadedSpecularColor?.());
        const nodesRow = createToggleRow('shadedNodes', {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (nodesRow) container.appendChild(nodesRow);
        const edgesRow = createToggleRow('shadedEdges', {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (edgesRow) container.appendChild(edgesRow);
        const lightDirectionAttribute = bindAppearanceAccessor('shadedLightDirection', {
          label: 'Light Direction',
          defaultValue: [0.577350269, 0.577350269, 0.577350269],
        });
        const lightDirectionControl = createLightDirectionControl(lightDirectionAttribute, {
          ariaLabel: 'Shaded light direction',
        });
        container.appendChild(createAlignedRow({
          title: 'Light Direction',
          hint: 'Drag the end marker to aim shaded lighting; edit X/Y/Z directly for precise values.',
          controls: lightDirectionControl.element,
          dirtyIndicator: createStateIndicator(statePathForAccessor('shadedLightDirection')),
        }).row);
        this._controlCleanups.add(() => lightDirectionControl.destroy());
        container.appendChild(createAlignedRow({
          title: 'Light Color',
          hint: 'Diffuse light tint used by shaded nodes and edges.',
          controls: createColorControls({
            ariaLabel: 'Shaded light color',
            getValue: () => appearanceBehavior?.shadedLightColor?.() ?? this.helios?.shadedLightColor?.(),
            setValue: (value) => {
              writeAppearanceAccessor('shadedLightColor', value, 'shaded-light-color');
            },
          }),
          dirtyIndicator: createStateIndicator(statePathForAccessor('shadedLightColor')),
        }).row);
        container.appendChild(createRows(['shadedDiffuseStrength'], {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        }));
        container.appendChild(createAlignedRow({
          title: 'Ambient Top',
          hint: 'Ambient tint on the camera-facing top hemisphere.',
          controls: createColorControls({
            ariaLabel: 'Shaded ambient top color',
            getValue: () => appearanceBehavior?.shadedAmbientTopColor?.() ?? this.helios?.shadedAmbientTopColor?.(),
            setValue: (value) => {
              writeAppearanceAccessor('shadedAmbientTopColor', value, 'shaded-ambient-top-color');
            },
          }),
          dirtyIndicator: createStateIndicator(statePathForAccessor('shadedAmbientTopColor')),
        }).row);
        container.appendChild(createAlignedRow({
          title: 'Ambient Bottom',
          hint: 'Ambient tint on the lower hemisphere.',
          controls: createColorControls({
            ariaLabel: 'Shaded ambient bottom color',
            getValue: () => appearanceBehavior?.shadedAmbientBottomColor?.() ?? this.helios?.shadedAmbientBottomColor?.(),
            setValue: (value) => {
              writeAppearanceAccessor('shadedAmbientBottomColor', value, 'shaded-ambient-bottom-color');
            },
          }),
          dirtyIndicator: createStateIndicator(statePathForAccessor('shadedAmbientBottomColor')),
        }).row);
        container.appendChild(createRows(['shadedAmbientStrength'], {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        }));
        container.appendChild(createAlignedRow({
          title: 'Specular Color',
          hint: 'Highlight tint added by shaded lighting.',
          controls: createColorControls({
            ariaLabel: 'Shaded specular color',
            getValue: () => appearanceBehavior?.shadedSpecularColor?.() ?? this.helios?.shadedSpecularColor?.(),
            setValue: (value) => {
              writeAppearanceAccessor('shadedSpecularColor', value, 'shaded-specular-color');
            },
          }),
          dirtyIndicator: createStateIndicator(statePathForAccessor('shadedSpecularColor')),
        }).row);
        container.appendChild(createRows(['shadedSpecularStrength', 'shadedShininess'], {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        }));
        return container;
      };

      const createAmbientOcclusionContent = () => {
        const container = document.createElement('div');
        const nodesRow = createToggleRow('ambientOcclusionNodes', {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (nodesRow) container.appendChild(nodesRow);
        const edgesRow = createToggleRow('ambientOcclusionEdges', {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (edgesRow) container.appendChild(edgesRow);
        const modeRow = createSelectRow('ambientOcclusionMode', AMBIENT_OCCLUSION_MODE_OPTIONS, {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (modeRow) container.appendChild(modeRow);
        const qualityRow = createSelectRow('ambientOcclusionQuality', AMBIENT_OCCLUSION_QUALITY_OPTIONS, {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (qualityRow) container.appendChild(qualityRow);
        container.appendChild(createRows([
          'ambientOcclusionStrength',
          'ambientOcclusionRadius',
          'ambientOcclusionBias',
          'ambientOcclusionIntensityScale',
          'ambientOcclusionIntensityShift',
        ], {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        }));
        return container;
      };
      const ambientOcclusionDeviceType = String(this.helios?.renderer?.device?.type ?? '').toLowerCase();
      const supportsAmbientOcclusion = ambientOcclusionDeviceType === 'webgpu' || ambientOcclusionDeviceType === 'webgl2';

      const shadedEnabled = bindAppearanceAccessor('shadedEnabled');
      const shadedToggle = createToggleControl({
        checked: false,
        onLabel: 'On',
        offLabel: 'Off',
        ariaLabel: 'Shaded',
        disabled: shadedEnabled.readOnly,
      });
      const syncShadedToggle = (value) => {
        shadedToggle.checked = Boolean(value);
        shadedToggle.disabled = shadedEnabled.readOnly;
      };
      const unsubscribeShadedToggle = shadedEnabled.subscribe((value) => {
        syncShadedToggle(value);
      });
      shadedToggle.addEventListener('change', () => {
        shadedEnabled.write(shadedToggle.checked, { source: 'ui', event: 'change' });
      });
      this._controlCleanups.add(() => unsubscribeShadedToggle());
      let ambientOcclusionToggle = null;
      if (supportsAmbientOcclusion) {
        const ambientOcclusionEnabled = bindAppearanceAccessor('ambientOcclusionEnabled');
        ambientOcclusionToggle = createToggleControl({
          checked: false,
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: 'Ambient Occlusion',
          disabled: ambientOcclusionEnabled.readOnly,
        });
        const syncAmbientOcclusionToggle = (value) => {
          ambientOcclusionToggle.checked = Boolean(value);
          ambientOcclusionToggle.disabled = ambientOcclusionEnabled.readOnly;
        };
        const unsubscribeAmbientOcclusionToggle = ambientOcclusionEnabled.subscribe((value) => {
          syncAmbientOcclusionToggle(value);
        });
        ambientOcclusionToggle.addEventListener('change', () => {
          ambientOcclusionEnabled.write(ambientOcclusionToggle.checked, { source: 'ui', event: 'change' });
        });
        this._controlCleanups.add(() => unsubscribeAmbientOcclusionToggle());
      }
      const createEdgeAppearanceContent = () => {
        const container = document.createElement('div');
        container.appendChild(createRows(['edgeWidthScale', 'edgeOpacityScale'], {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        }));
        const edgeFastRow = createToggleRow('edgeFastRendering', {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        });
        if (edgeFastRow) container.appendChild(edgeFastRow);
        if (typeof this.helios?.edgeAdaptiveQuality === 'function') {
          const adaptiveContent = document.createElement('div');
          const enabledRow = createToggleRow('edgeAdaptiveQualityEnabled', {
            source: appearanceAccessorSource,
            bind: bindAppearanceAccessor,
          });
          if (enabledRow) adaptiveContent.appendChild(enabledRow);
          adaptiveContent.appendChild(createRows([
            'edgeAdaptiveQualitySlowFrameThresholdMs',
            'edgeAdaptiveQualitySlowFrameConsecutiveFrames',
            'edgeAdaptiveQualityProbeIntervalMs',
            'edgeAdaptiveQualityInteractionHoldMs',
          ], {
            source: appearanceAccessorSource,
            bind: bindAppearanceAccessor,
          }));
          const fastDuringCameraRow = createToggleRow('edgeAdaptiveQualityFastDuringCamera', {
            source: appearanceAccessorSource,
            bind: bindAppearanceAccessor,
          });
          if (fastDuringCameraRow) adaptiveContent.appendChild(fastDuringCameraRow);
          const fastDuringLayoutRow = createToggleRow('edgeAdaptiveQualityFastDuringLayout', {
            source: appearanceAccessorSource,
            bind: bindAppearanceAccessor,
          });
          if (fastDuringLayoutRow) adaptiveContent.appendChild(fastDuringLayoutRow);

          const adaptiveStack = new PanelStack();
          adaptiveStack.add({
            id: 'edge-adaptive-quality',
            title: 'Adaptive',
            collapsed: true,
            statusDot: false,
            content: adaptiveContent,
          });
          container.appendChild(adaptiveStack.element);
          this._controlCleanups.add(() => adaptiveStack.destroy());
        }

        return container;
      };
      nodeEdgeStack.add({
        id: 'node-appearance',
        title: 'Nodes',
        content: createRows(['nodeSizeScale', 'nodeOpacityScale', 'nodeOutlineWidthScale'], {
          source: appearanceAccessorSource,
          bind: bindAppearanceAccessor,
        }),
      });
      nodeEdgeStack.add({
        id: 'edge-appearance',
        title: 'Edges',
        content: createEdgeAppearanceContent(),
      });
      nodeEdgeStack.add({
        id: 'shaded-appearance',
        title: 'Shaded',
        collapsed: true,
        statusDot: false,
        headerControls: createHeaderControlsWithIndicator(shadedToggle, statePathForAccessor('shadedEnabled')),
        content: createShadedAppearanceContent(),
      });
      if (supportsAmbientOcclusion) {
        nodeEdgeStack.add({
          id: 'ambient-occlusion-appearance',
          title: 'Ambient Occlusion',
          collapsed: true,
          statusDot: false,
          headerControls: createHeaderControlsWithIndicator(ambientOcclusionToggle, statePathForAccessor('ambientOcclusionEnabled')),
          content: createAmbientOcclusionContent(),
        });
      }
      this._controlCleanups.add(() => nodeEdgeStack.destroy());

      const appearanceTab = document.createElement('div');
      appearanceTab.appendChild(createAppearanceContent());
      appearanceTab.appendChild(nodeEdgeStack.element);

      const sceneTabs = new TabbedPanel({
        variant: 'panel',
        tabs: [
          {
            id: 'appearance',
            title: 'Appearance',
            content: appearanceTab,
          },
          {
            id: 'labels',
            title: 'Labels',
            content: createLabelsContent(),
          },
          {
            id: 'advanced',
            title: 'Advanced',
            content: createAdvancedContent(),
          },
        ],
      });
      content.appendChild(sceneTabs.element);
      this._controlCleanups.add(() => sceneTabs.destroy());

      let dataPanel = null;
      if (options.includeDataPanel ?? true) {
        dataPanel = this.createPanel({
          id: options.dataPanelId ?? 'helios-ui-data',
          title: options.dataPanelTitle ?? 'Data',
          position: options.dataPanelPosition ?? { x: 16, y: 16 },
          dock: options.dataPanelDock ?? options.dock ?? 'top-left',
          content: networkControls,
        });
      }

      const scenePanel = this.createPanel({
        id: options.id ?? 'helios-ui-demo',
        title: options.title ?? 'Scene',
        position: options.position ?? { x: 16, y: 220 },
        dock: options.dock ?? 'top-left',
        panelSchema: SCENE_PANEL_SCHEMA,
        content,
      });

      if (dataPanel) {
        scenePanel.dataPanel = dataPanel;
      }

      return scenePanel;
    } else {
      content.appendChild(themeRow);
    }

    return this.createPanel({
      id: options.id ?? 'helios-ui-demo',
      title: options.title ?? 'Scene',
      position: options.position ?? { x: 16, y: 16 },
      dock: options.dock ?? 'top-left',
      content,
    });
  }

  createFilterPanel(options = {}) {
    const content = document.createElement('div');
    content.className = 'helios-ui-filter';

    const FILTER_SCOPE_RENDER = 'render';
    const FILTER_SCOPE_RENDER_LAYOUT = 'render+layout';
    const updateIntervalMs = Number.isFinite(options?.updateIntervalMs)
      ? Math.max(0, Math.floor(options.updateIntervalMs))
      : Number.isFinite(options?.debounceMs)
        ? Math.max(0, Math.floor(options.debounceMs))
        : 32;

    const filterBehavior = this.helios?.behavior?.filters ?? this.helios?.useBehavior?.('filters');
    if (options.filterModel instanceof HeliosFilter) {
      filterBehavior?.setFilterModel?.(options.filterModel, { reason: 'panel-init' });
    }

    let applyTimer = null;
    let lastApplyAt = 0;

    const clearApplyTimer = () => {
      if (applyTimer == null) return;
      clearTimeout(applyTimer);
      applyTimer = null;
    };

    const applyFilterNow = () => {
      clearApplyTimer();
      lastApplyAt = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      try {
        filterBehavior?.replaceRules?.({
          scope: layoutCheckbox.checked ? FILTER_SCOPE_RENDER_LAYOUT : FILTER_SCOPE_RENDER,
          nodeRules: nodeEditor.collectRules(),
          edgeRules: edgeEditor.collectRules(),
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[HeliosUI] Failed to apply graph filter', error);
      }
    };

    const scheduleApply = () => {
      const now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();
      const elapsed = Math.max(0, now - lastApplyAt);
      if (elapsed >= updateIntervalMs) {
        applyFilterNow();
        return;
      }
      clearApplyTimer();
      applyTimer = setTimeout(applyFilterNow, Math.max(0, updateIntervalMs - elapsed));
    };

    const nodeEditor = createAttributeRuleEditor({
      helios: this.helios,
      scope: 'node',
      addPlaceholder: 'Add filter...',
      onDirty: scheduleApply,
      testIds: {
        addSelect: 'controls-filter-node-attribute',
        sliderMin: 'controls-filter-node-min-slider',
        sliderMax: 'controls-filter-node-max-slider',
        minInput: 'controls-filter-node-min',
        maxInput: 'controls-filter-node-max',
        numericRemove: 'controls-filter-node-numeric-remove',
        stringOperator: 'controls-filter-node-string-operator',
        stringValue: 'controls-filter-node-string-value',
        stringRemove: 'controls-filter-node-string-remove',
        categoricalMode: 'controls-filter-node-categorical-mode',
        categoricalList: 'controls-filter-node-categorical-list',
        categoricalText: 'controls-filter-node-categorical-text',
        categoricalRemove: 'controls-filter-node-categorical-remove',
        queryInput: 'controls-filter-node-query',
        queryRemove: 'controls-filter-node-query-remove',
      },
    });

    const edgeEditor = createAttributeRuleEditor({
      helios: this.helios,
      scope: 'edge',
      addPlaceholder: 'Add filter...',
      onDirty: scheduleApply,
      testIds: {
        addSelect: 'controls-filter-edge-attribute',
        sliderMin: 'controls-filter-edge-min-slider',
        sliderMax: 'controls-filter-edge-max-slider',
        minInput: 'controls-filter-edge-min',
        maxInput: 'controls-filter-edge-max',
        numericRemove: 'controls-filter-edge-numeric-remove',
        stringOperator: 'controls-filter-edge-string-operator',
        stringValue: 'controls-filter-edge-string-value',
        stringRemove: 'controls-filter-edge-string-remove',
        categoricalMode: 'controls-filter-edge-categorical-mode',
        categoricalList: 'controls-filter-edge-categorical-list',
        categoricalText: 'controls-filter-edge-categorical-text',
        categoricalRemove: 'controls-filter-edge-categorical-remove',
        queryInput: 'controls-filter-edge-query',
        queryRemove: 'controls-filter-edge-query-remove',
      },
    });

    const tabBarFilterHost = document.createElement('div');
    tabBarFilterHost.style.display = 'flex';
    tabBarFilterHost.style.alignItems = 'center';
    tabBarFilterHost.style.justifyContent = 'flex-end';
    tabBarFilterHost.style.minWidth = '0';
    tabBarFilterHost.appendChild(nodeEditor.addSelect);
    tabBarFilterHost.appendChild(edgeEditor.addSelect);

    const syncTabBarFilterForActiveTab = (tabId) => {
      const active = tabId === 'edges' ? 'edge' : 'node';
      nodeEditor.addSelect.hidden = active !== 'node';
      edgeEditor.addSelect.hidden = active !== 'edge';
    };

    const tabs = new TabbedPanel({
      variant: 'panel',
      barRight: tabBarFilterHost,
      onActiveChanged: (tabId) => {
        syncTabBarFilterForActiveTab(tabId);
      },
      tabs: [
        {
          id: 'nodes',
          title: 'Nodes',
          content: nodeEditor.element,
        },
        {
          id: 'edges',
          title: 'Edges',
          content: edgeEditor.element,
        },
      ],
    });
    this._controlCleanups.add(() => tabs.destroy());
    syncTabBarFilterForActiveTab(tabs.activeId?.() ?? 'nodes');

    const layoutCheckbox = createSegmentedToggleControl({
      checked: false,
      onLabel: 'Layout+Render',
      offLabel: 'Render Only',
      ariaLabel: 'Apply filter scope to layout',
    });
    layoutCheckbox.dataset.testid = 'controls-filter-layout';
    layoutCheckbox.addEventListener('change', scheduleApply);

    const layoutWrap = document.createElement('div');
    layoutWrap.style.display = 'inline-flex';
    layoutWrap.style.alignItems = 'center';
    layoutWrap.style.gap = '6px';
    layoutWrap.style.marginTop = '6px';
    layoutWrap.style.userSelect = 'none';
    layoutWrap.appendChild(layoutCheckbox);

    const syncScopeFromFilter = () => {
      const filter = filterBehavior?.filters?.() ?? this.helios?.getGraphFilter?.() ?? null;
      layoutCheckbox.checked = filter?.scope === FILTER_SCOPE_RENDER_LAYOUT;
    };

    const refreshFromNetwork = () => {
      nodeEditor.refreshFromNetwork();
      edgeEditor.refreshFromNetwork();
    };

    let networkAttributeUnsub = null;
    const attachNetworkAttributeListeners = () => {
      if (networkAttributeUnsub) {
        networkAttributeUnsub();
        networkAttributeUnsub = null;
      }
      const network = this.helios?.network ?? null;
      if (!network) return;
      const handler = (event) => {
        const scope = event?.detail?.scope;
        if (scope && scope !== 'node' && scope !== 'edge') return;
        const type = event?.type ?? '';
        if (type === 'attribute:changed') {
          const op = event?.detail?.op ?? '';
          if (op !== 'categorize' && op !== 'decategorize') return;
        }
        refreshFromNetwork();
      };
      if (typeof network.on === 'function') {
        const unsubs = [
          network.on('attribute:defined', handler),
          network.on('attribute:removed', handler),
          network.on('attribute:changed', handler),
        ];
        networkAttributeUnsub = () => {
          for (const unsub of unsubs) unsub?.();
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

    const onNetworkReplaced = () => {
      attachNetworkAttributeListeners();
      refreshFromNetwork();
      scheduleApply();
    };

    const onFilterChanged = () => {
      syncScopeFromFilter();
    };

    let unsubNetwork = null;
    let unsubFilter = null;
    if (this.helios?.on) {
      unsubNetwork = this.helios.on('network:replaced', onNetworkReplaced);
      unsubFilter = this.helios.on('graph:filter-changed', onFilterChanged);
    } else if (this.helios?.addEventListener) {
      this.helios.addEventListener('network:replaced', onNetworkReplaced);
      this.helios.addEventListener('graph:filter-changed', onFilterChanged);
      unsubNetwork = () => this.helios.removeEventListener('network:replaced', onNetworkReplaced);
      unsubFilter = () => this.helios.removeEventListener('graph:filter-changed', onFilterChanged);
    }
    if (unsubNetwork) this._controlCleanups.add(unsubNetwork);
    if (unsubFilter) this._controlCleanups.add(unsubFilter);
    const unsubBehavior = filterBehavior?.on?.('change', onFilterChanged) ?? null;
    if (unsubBehavior) this._controlCleanups.add(unsubBehavior);
    attachNetworkAttributeListeners();
    if (networkAttributeUnsub) this._controlCleanups.add(() => networkAttributeUnsub?.());
    this._controlCleanups.add(() => {
      clearApplyTimer();
      nodeEditor.destroy();
      edgeEditor.destroy();
    });

    syncScopeFromFilter();
    refreshFromNetwork();

    content.appendChild(tabs.element);
    content.appendChild(layoutWrap);

    return this.createPanel({
      id: options.id ?? 'helios-ui-filter',
      title: options.title ?? 'Filter',
      position: options.position ?? { x: 16, y: 250 },
      dock: options.dock ?? 'top-left',
      width: options.width,
      minWidth: options.minWidth,
      panelSchema: FILTERS_PANEL_SCHEMA,
      content,
    });
  }
  createMetricsPanel(options = {}) {
    const content = document.createElement('div');
    content.style.setProperty('--helios-ui-label-col', '130px');

    const tooltipCleanups = new Set();

    const attachTooltip = (anchorEl, hint) => {
      if (!anchorEl || !hint) return () => {};

      let tooltip = null;
      let tooltipRoot = null;
      let hideTooltipTimer = null;

      const resolveTooltipRoot = () => anchorEl.closest?.('.helios-ui') ?? anchorEl.ownerDocument?.body ?? document.body;

      const setTooltipHidden = (hidden) => {
        if (!tooltip) return;
        tooltip.dataset.open = hidden ? 'false' : 'true';
        tooltip.hidden = hidden;
      };

      const placeTooltip = () => {
        if (!tooltip) return;
        const anchor = tooltip.dataset.anchorId ? anchorEl.ownerDocument?.getElementById?.(tooltip.dataset.anchorId) : null;
        const el = anchor ?? null;
        if (!el) return;

        const margin = 8;
        const rect = el.getBoundingClientRect();
        const { innerWidth: vw, innerHeight: vh } = window;

        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        tooltip.style.transform = 'translate(-9999px, -9999px)';
        const tipRect = tooltip.getBoundingClientRect();

        const preferredLeft = rect.left + rect.width / 2 - tipRect.width / 2;
        const left = Math.max(margin, Math.min(vw - margin - tipRect.width, preferredLeft));

        const preferredTop = rect.top - 8 - tipRect.height;
        const fallbackTop = rect.bottom + 8;
        const top = preferredTop >= margin ? preferredTop : Math.min(vh - margin - tipRect.height, fallbackTop);

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.transform = 'translate(0, 0)';
      };

      const scheduleHideTooltip = () => {
        if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
        hideTooltipTimer = window.setTimeout(() => setTooltipHidden(true), 120);
      };

      const showTooltip = () => {
        if (!tooltip) return;
        if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
        if (!tooltipRoot) {
          tooltipRoot = resolveTooltipRoot();
          tooltipRoot.appendChild(tooltip);
        }
        setTooltipHidden(false);
        placeTooltip();
      };

      tooltip = document.createElement('div');
      tooltip.className = 'helios-ui-tooltip';
      tooltip.hidden = true;
      tooltip.dataset.open = 'false';
      tooltip.textContent = hint;
      tooltip.setAttribute('role', 'tooltip');

      const tooltipId = `helios-ui-tooltip-${Math.random().toString(16).slice(2)}`;
      tooltip.dataset.anchorId = tooltipId;
      anchorEl.id = tooltipId;
      anchorEl.tabIndex = 0;

      const onPointerEnter = () => showTooltip();
      const onPointerLeave = () => scheduleHideTooltip();
      const onFocus = () => showTooltip();
      const onBlur = () => setTooltipHidden(true);
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          setTooltipHidden(true);
          anchorEl.blur();
        }
      };
      const onScrollOrResize = () => {
        if (!tooltip || tooltip.hidden) return;
        placeTooltip();
      };

      anchorEl.addEventListener('pointerenter', onPointerEnter);
      anchorEl.addEventListener('pointerleave', onPointerLeave);
      anchorEl.addEventListener('focus', onFocus);
      anchorEl.addEventListener('blur', onBlur);
      anchorEl.addEventListener('keydown', onKeyDown);
      window.addEventListener('scroll', onScrollOrResize, { capture: true });
      window.addEventListener('resize', onScrollOrResize);

      const cleanup = () => {
        if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
        anchorEl.removeEventListener('pointerenter', onPointerEnter);
        anchorEl.removeEventListener('pointerleave', onPointerLeave);
        anchorEl.removeEventListener('focus', onFocus);
        anchorEl.removeEventListener('blur', onBlur);
        anchorEl.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('scroll', onScrollOrResize, { capture: true });
        window.removeEventListener('resize', onScrollOrResize);
        tooltip?.remove?.();
        tooltip = null;
        tooltipRoot = null;
      };

      tooltipCleanups.add(cleanup);
      return cleanup;
    };

    const createAlignedRow = ({ title, hint, controls }) => {
      const row = document.createElement('div');
      row.className = 'helios-ui-row helios-ui-row--aligned';
      const label = document.createElement('div');
      label.className = 'helios-ui-label';

      const titleRowEl = document.createElement('div');
      titleRowEl.className = 'helios-ui-label__title-row';
      const titleEl = document.createElement('div');
      titleEl.className = 'helios-ui-label__title';
      titleEl.textContent = title ?? '';
      titleRowEl.appendChild(titleEl);
      label.appendChild(titleRowEl);
      if (hint) attachTooltip(titleEl, hint);

      row.appendChild(label);
      const controlWrap = document.createElement('div');
      controlWrap.className = 'helios-ui-row__controls';
      if (controls) controlWrap.appendChild(controls);
      row.appendChild(controlWrap);
      return { row, titleEl, controlWrap };
    };

    const updateSliderVisual = (slider) => {
      if (!slider) return;
      const min = Number(slider.min);
      const max = Number(slider.max);
      const value = Number(slider.value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || min === max) return;
      const pct = ((value - min) / (max - min)) * 100;
      slider.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct))));
    };

    const formatCompactNumber = (value, sigDigits = 6) => {
      const v = Number(value);
      if (!Number.isFinite(v)) return '';
      if (v === 0) return '0';
      return String(Number(v.toPrecision(sigDigits)));
    };

    const createLinearSliderRow = ({ title, hint, valueInput, range, step = 1, inputMin = null, inputMax = null, clampInput = true }) => {
      const { row, controlWrap } = createAlignedRow({ title, hint, controls: null });
      row.classList.add('helios-ui-row--slider');

      const controls = document.createElement('div');
      controls.className = 'helios-ui-slider-controls';

      const slider = document.createElement('input');
      slider.className = 'helios-ui-slider';
      slider.type = 'range';
      slider.min = String(range.min);
      slider.max = String(range.max);
      slider.step = String(step);

      valueInput.classList.add('helios-ui-number');
      valueInput.type = 'number';
      valueInput.step = String(step);
      valueInput.min = String(inputMin ?? range.min);
      if (inputMax != null) valueInput.max = String(inputMax);
      else valueInput.removeAttribute('max');

      const write = (next) => {
        const n = Number(next);
        if (!Number.isFinite(n)) return;
        const nextValue = clampInput ? Math.max(range.min, Math.min(range.max, n)) : n;
        const sliderValue = Math.max(range.min, Math.min(range.max, n));
        slider.value = String(sliderValue);
        valueInput.value = String(nextValue);
        updateSliderVisual(slider);
      };

      write(valueInput.value || range.min);

      slider.addEventListener('input', () => write(slider.value));
      valueInput.addEventListener('change', () => write(valueInput.value));
      valueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          write(valueInput.value);
          valueInput.blur();
        }
      });

      controls.appendChild(slider);
      controls.appendChild(valueInput);
      controlWrap.appendChild(controls);
      return { row, slider, write };
    };

    const createLogSliderRow = ({ title, hint, valueInput, minExp = -4, maxExp = 4, stepExp = 0.01 }) => {
      const { row, controlWrap } = createAlignedRow({ title, hint, controls: null });
      row.classList.add('helios-ui-row--slider');

      const controls = document.createElement('div');
      controls.className = 'helios-ui-slider-controls';

      const slider = document.createElement('input');
      slider.className = 'helios-ui-slider';
      slider.type = 'range';
      slider.min = String(minExp);
      slider.max = String(maxExp);
      slider.step = String(stepExp);

      const minValue = 10 ** minExp;
      const maxValue = 10 ** maxExp;

      valueInput.classList.add('helios-ui-number');
      valueInput.type = 'number';
      valueInput.step = 'any';
      valueInput.min = '0';

      const write = (next) => {
        const n = Number(next);
        if (!Number.isFinite(n) || n <= 0) return;
        // Keep the numeric value unbounded (>0); only clamp the slider's position
        // to the suggested exponent window.
        const exp = Math.log10(n);
        slider.value = String(Math.max(minExp, Math.min(maxExp, exp)));
        valueInput.value = formatCompactNumber(n, 6);
        updateSliderVisual(slider);
      };

      const writeFromSlider = () => {
        const exp = Number(slider.value);
        if (!Number.isFinite(exp)) return;
        const value = 10 ** exp;
        valueInput.value = formatCompactNumber(value, 6);
        updateSliderVisual(slider);
      };

      // Initialize from the provided numeric value.
      write(valueInput.value || 1);

      slider.addEventListener('input', () => writeFromSlider());
      valueInput.addEventListener('change', () => write(valueInput.value));
      valueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          write(valueInput.value);
          valueInput.blur();
        }
      });

      controls.appendChild(slider);
      controls.appendChild(valueInput);
      controlWrap.appendChild(controls);
      return { row, slider, write };
    };

    const net = () => this.helios?.network ?? null;
    const defer = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

    const formatNumber = (value, digits = 3) => {
      if (!Number.isFinite(value)) return '—';
      return Number(value).toFixed(digits);
    };

    const makeValue = (text = '—') => {
      const el = document.createElement('div');
      el.className = 'helios-ui-value';
      el.textContent = text;
      return el;
    };

    const createStat = (labelText, valueEl) => {
      const stat = document.createElement('div');
      stat.className = 'helios-ui-stat';
      const label = document.createElement('div');
      label.className = 'helios-ui-stat__label';
      label.textContent = labelText;
      const value = valueEl ?? document.createElement('div');
      if (!valueEl) {
        value.className = 'helios-ui-stat__value';
        value.textContent = '—';
      } else {
        value.classList.add('helios-ui-stat__value');
      }
      stat.appendChild(label);
      stat.appendChild(value);
      return { stat, label, value };
    };

    const setDisabled = (el, disabled) => {
      if (!el) return;
      el.disabled = Boolean(disabled);
    };

    const setProgressActionButtonState = (button, running) => {
      if (!button) return;
      const isRunning = Boolean(running);
      button.classList.toggle('helios-ui-button--danger', isRunning);
      button.classList.toggle('helios-ui-button--spinning', isRunning);
      button.textContent = isRunning ? 'Cancel' : 'Calculate';
      button.title = isRunning
        ? 'Cancel current run'
        : (button.dataset.calcTitle || 'Calculate');
      button.setAttribute('aria-busy', isRunning ? 'true' : 'false');
    };

    const normalizeDimensionMethod = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized === 'forward' || normalized === 'fw') return 'forward';
      if (normalized === 'backward' || normalized === 'bk') return 'backward';
      if (normalized === 'central' || normalized === 'centered' || normalized === 'ce') return 'central';
      return 'leastsquares';
    };

    const maxOrderForDimensionMethod = (method) => {
      const normalized = normalizeDimensionMethod(method);
      if (normalized === 'forward' || normalized === 'backward') return 6;
      if (normalized === 'central') return 4;
      return 32;
    };

    const maxFiniteArrayValue = (values) => {
      if (!values || typeof values.length !== 'number') return NaN;
      let max = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < values.length; i += 1) {
        const v = Number(values[i]);
        if (Number.isFinite(v) && v > max) {
          max = v;
        }
      }
      return Number.isFinite(max) ? max : NaN;
    };

    const summarizeFiniteValues = (values) => {
      if (!values || typeof values.length !== 'number') {
        return {
          count: 0,
          min: NaN,
          max: NaN,
          mean: NaN,
        };
      }
      let count = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let sum = 0;
      for (let i = 0; i < values.length; i += 1) {
        const v = Number(values[i]);
        if (!Number.isFinite(v)) continue;
        count += 1;
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      return {
        count,
        min: count > 0 ? min : NaN,
        max: count > 0 ? max : NaN,
        mean: count > 0 ? sum / count : NaN,
      };
    };

    const writeNodeMetricValues = (network, attributeName, result) => {
      if (!network || !attributeName || typeof attributeName !== 'string') return false;
      const trimmed = attributeName.trim();
      if (!trimmed) return false;

      const writeBuffer = () => network.withBufferAccess(() => {
        const buffer = network.getNodeAttributeBuffer(trimmed);
        const view = buffer?.view ?? null;
        if (!view || typeof view.length !== 'number') return false;

        const full = result?.valuesByNode;
        if (full && typeof full.length === 'number') {
          const n = Math.min(view.length, full.length);
          for (let i = 0; i < n; i += 1) {
            const v = Number(full[i]);
            view[i] = Number.isFinite(v) ? v : 0;
          }
        } else {
          const nodeIndices = result?.nodeIndices;
          const values = result?.values;
          if (!nodeIndices || !values || typeof nodeIndices.length !== 'number' || typeof values.length !== 'number') {
            return false;
          }
          const n = Math.min(nodeIndices.length, values.length);
          for (let i = 0; i < n; i += 1) {
            const node = Number(nodeIndices[i]);
            if (!Number.isInteger(node) || node < 0 || node >= view.length) continue;
            const v = Number(values[i]);
            view[node] = Number.isFinite(v) ? v : 0;
          }
        }

        if (typeof buffer.bumpVersion === 'function') {
          buffer.bumpVersion();
        }
        return true;
      });

      try {
        return Boolean(writeBuffer());
      } catch (_) {
        if (typeof network.defineNodeAttribute !== 'function') return false;
      }

      network.defineNodeAttribute(trimmed, AttributeType.Float, 1);
      return Boolean(writeBuffer());
    };

    const markMetricOutputDirty = (metricName, attributes = []) => {
      const names = Array.from(new Set((Array.isArray(attributes) ? attributes : [attributes])
        .map((name) => String(name ?? '').trim())
        .filter(Boolean)));
      if (!names.length) return;
      this.registerStateControl?.('metrics.lastOutput', {
        scope: 'network',
        debounceMs: 500,
        defaultValue: null,
        metadata: { panel: 'metrics' },
      });
      this.writeStateControl?.('metrics.lastOutput', {
        metric: String(metricName ?? 'metric'),
        attributes: names,
        updatedAt: Date.now(),
      }, {
        scope: 'network',
        source: 'ui',
        reason: `metrics:${metricName ?? 'metric'}`,
        debounceMs: 500,
      });
      this.helios?.storage?.markNetworkDirty?.(`metrics:${metricName ?? 'metric'}`);
    };

    const styleStatusHint = (el) => {
      if (!el) return;
      el.className = 'helios-ui-label__hint';
      el.style.marginTop = '0px';
      el.style.fontSize = '10px';
      el.style.lineHeight = '1.2';
      el.style.whiteSpace = 'normal';
      el.style.overflow = 'visible';
      el.style.textOverflow = 'clip';
      el.style.maxWidth = '100%';
      el.style.minWidth = '0';
    };

    const reportMeasurementError = (metricName, error, context = null) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const message = err?.message ?? String(err);
      const detail = err?.stack ? `${message}\n${err.stack}` : message;
      if (typeof globalThis !== 'undefined' && typeof globalThis.reportError === 'function') {
        try {
          globalThis.reportError(err);
        } catch {}
      }
      // eslint-disable-next-line no-console
      console.error(`[HeliosUI] ${metricName} failed`, { error: err, context });
      return detail;
    };

    const normalizeNeighborDirection = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized === 'out' || normalized === 'outgoing') return 'out';
      if (normalized === 'in' || normalized === 'incoming') return 'in';
      return 'both';
    };

    const normalizeStrengthMeasure = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized === 'average' || normalized === 'avg' || normalized === 'mean') return 'average';
      if (normalized === 'maximum' || normalized === 'max') return 'maximum';
      if (normalized === 'minimum' || normalized === 'min') return 'minimum';
      return 'sum';
    };

    const normalizeClusteringVariant = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized === 'onnela') return 'onnela';
      if (normalized === 'newman' || normalized === 'barrat' || normalized === 'weighted') return 'newman';
      return 'unweighted';
    };

    const isNumericEdgeWeightType = (type) =>
      type === AttributeType.Float ||
      type === AttributeType.Double ||
      type === AttributeType.Integer ||
      type === AttributeType.UnsignedInteger ||
      type === AttributeType.BigInteger ||
      type === AttributeType.UnsignedBigInteger;

    const createDirectionSelect = (testid, initialValue = 'both') => {
      const select = document.createElement('select');
      select.className = 'helios-ui-select';
      if (testid) select.dataset.testid = testid;
      for (const entry of [
        { value: 'both', label: 'Both' },
        { value: 'in', label: 'In' },
        { value: 'out', label: 'Out' },
      ]) {
        const opt = document.createElement('option');
        opt.value = entry.value;
        opt.textContent = entry.label;
        select.appendChild(opt);
      }
      select.value = normalizeNeighborDirection(initialValue);
      return select;
    };

    const edgeWeightSelects = [];
    const createEdgeWeightSelect = (testid, initialValue = '') => {
      const select = document.createElement('select');
      select.className = 'helios-ui-select';
      if (testid) select.dataset.testid = testid;
      select.dataset.initialValue = initialValue ? String(initialValue) : '';
      select.dataset.userSelected = 'false';
      select.addEventListener('change', () => {
        select.dataset.userSelected = 'true';
      });
      edgeWeightSelects.push(select);
      return select;
    };

    // --- Degree --------------------------------------------------------------
    const degree = document.createElement('div');

    const degreeDirectionSelect = createDirectionSelect('metrics-degree-direction', options?.degree?.direction ?? 'both');
    const degreeOutAttrInput = document.createElement('input');
    degreeOutAttrInput.type = 'text';
    degreeOutAttrInput.className = 'helios-ui-text';
    degreeOutAttrInput.placeholder = 'degree';
    degreeOutAttrInput.value = String(options?.degree?.outNodeAttribute ?? 'degree');
    degreeOutAttrInput.dataset.testid = 'metrics-degree-outAttr';

    const degreeCalcButton = document.createElement('button');
    degreeCalcButton.type = 'button';
    degreeCalcButton.className = 'helios-ui-button';
    degreeCalcButton.textContent = 'Calculate';
    degreeCalcButton.title = 'Calculate degree';
    degreeCalcButton.dataset.testid = 'metrics-degree-calc';

    const degreeStatusEl = document.createElement('div');
    degreeStatusEl.dataset.testid = 'metrics-degree-status';
    degreeStatusEl.textContent = '';
    styleStatusHint(degreeStatusEl);

    degree.appendChild(createAlignedRow({
      title: 'Direction',
      hint: 'For directed networks: In, Out, or Both',
      controls: degreeDirectionSelect,
    }).row);
    degree.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: degreeStatusEl,
    }).row);

    const degreeStats = document.createElement('div');
    degreeStats.className = 'helios-ui-stats';
    const degreeMaxValue = makeValue('—');
    degreeMaxValue.dataset.testid = 'metrics-degree-max';
    const degreeMeanValue = makeValue('—');
    degreeMeanValue.dataset.testid = 'metrics-degree-mean';
    const degreeElapsedValue = makeValue('—');
    degreeElapsedValue.dataset.testid = 'metrics-degree-elapsed';
    degreeStats.appendChild(createStat('Max', degreeMaxValue).stat);
    degreeStats.appendChild(createStat('Mean', degreeMeanValue).stat);
    degreeStats.appendChild(createStat('Elapsed', degreeElapsedValue).stat);
    degreeStats.style.marginTop = '2px';
    degreeStats.style.marginBottom = '8px';
    degree.appendChild(degreeStats);

    const degreeAdvanced = document.createElement('div');
    degreeAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float node degree values',
      controls: degreeOutAttrInput,
    }).row);
    const degreeInnerStack = new PanelStack();
    degreeInnerStack.add({ id: 'metrics-degree-advanced', title: 'Advanced', collapsed: true, statusDot: false, content: degreeAdvanced });
    degreeInnerStack.element.style.marginTop = '6px';

    // --- Strength ------------------------------------------------------------
    const strength = document.createElement('div');

    const strengthDirectionSelect = createDirectionSelect('metrics-strength-direction', options?.strength?.direction ?? 'both');
    const strengthMeasureSelect = document.createElement('select');
    strengthMeasureSelect.className = 'helios-ui-select';
    strengthMeasureSelect.dataset.testid = 'metrics-strength-measure';
    for (const entry of [
      { value: 'sum', label: 'Sum' },
      { value: 'average', label: 'Average' },
      { value: 'maximum', label: 'Maximum' },
      { value: 'minimum', label: 'Minimum' },
    ]) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      strengthMeasureSelect.appendChild(opt);
    }
    strengthMeasureSelect.value = normalizeStrengthMeasure(options?.strength?.measure ?? 'sum');

    const strengthWeightSelect = createEdgeWeightSelect('metrics-strength-weight', options?.strength?.edgeWeightAttribute ?? '');
    const strengthOutAttrInput = document.createElement('input');
    strengthOutAttrInput.type = 'text';
    strengthOutAttrInput.className = 'helios-ui-text';
    strengthOutAttrInput.placeholder = 'strength';
    strengthOutAttrInput.value = String(options?.strength?.outNodeAttribute ?? 'strength');
    strengthOutAttrInput.dataset.testid = 'metrics-strength-outAttr';

    const strengthCalcButton = document.createElement('button');
    strengthCalcButton.type = 'button';
    strengthCalcButton.className = 'helios-ui-button';
    strengthCalcButton.textContent = 'Calculate';
    strengthCalcButton.title = 'Calculate strength';
    strengthCalcButton.dataset.testid = 'metrics-strength-calc';

    const strengthStatusEl = document.createElement('div');
    strengthStatusEl.dataset.testid = 'metrics-strength-status';
    strengthStatusEl.textContent = '';
    styleStatusHint(strengthStatusEl);

    strength.appendChild(createAlignedRow({
      title: 'Direction',
      hint: 'For directed networks: In, Out, or Both',
      controls: strengthDirectionSelect,
    }).row);
    strength.appendChild(createAlignedRow({
      title: 'Measure',
      hint: 'Aggregation over incident edge weights',
      controls: strengthMeasureSelect,
    }).row);
    strength.appendChild(createAlignedRow({
      title: 'Edge Weight',
      hint: 'Optional edge weight attribute',
      controls: strengthWeightSelect,
    }).row);
    strength.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: strengthStatusEl,
    }).row);

    const strengthStats = document.createElement('div');
    strengthStats.className = 'helios-ui-stats';
    const strengthMaxValue = makeValue('—');
    strengthMaxValue.dataset.testid = 'metrics-strength-max';
    const strengthMeanValue = makeValue('—');
    strengthMeanValue.dataset.testid = 'metrics-strength-mean';
    const strengthElapsedValue = makeValue('—');
    strengthElapsedValue.dataset.testid = 'metrics-strength-elapsed';
    strengthStats.appendChild(createStat('Max', strengthMaxValue).stat);
    strengthStats.appendChild(createStat('Mean', strengthMeanValue).stat);
    strengthStats.appendChild(createStat('Elapsed', strengthElapsedValue).stat);
    strengthStats.style.marginTop = '2px';
    strengthStats.style.marginBottom = '8px';
    strength.appendChild(strengthStats);

    const strengthAdvanced = document.createElement('div');
    strengthAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float node strength values',
      controls: strengthOutAttrInput,
    }).row);
    const strengthInnerStack = new PanelStack();
    strengthInnerStack.add({ id: 'metrics-strength-advanced', title: 'Advanced', collapsed: true, statusDot: false, content: strengthAdvanced });
    strengthInnerStack.element.style.marginTop = '6px';

    // --- Local Clustering ----------------------------------------------------
    const clustering = document.createElement('div');

    const clusteringDirectionSelect = createDirectionSelect('metrics-clustering-direction', options?.clustering?.direction ?? 'both');
    const clusteringVariantSelect = document.createElement('select');
    clusteringVariantSelect.className = 'helios-ui-select';
    clusteringVariantSelect.dataset.testid = 'metrics-clustering-variant';
    for (const entry of [
      { value: 'unweighted', label: 'Unweighted' },
      { value: 'onnela', label: 'Onnela (Weighted)' },
      { value: 'newman', label: 'Newman (Weighted)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      clusteringVariantSelect.appendChild(opt);
    }
    clusteringVariantSelect.value = normalizeClusteringVariant(options?.clustering?.variant ?? 'unweighted');

    const clusteringWeightSelect = createEdgeWeightSelect('metrics-clustering-weight', options?.clustering?.edgeWeightAttribute ?? '');
    const clusteringOutAttrInput = document.createElement('input');
    clusteringOutAttrInput.type = 'text';
    clusteringOutAttrInput.className = 'helios-ui-text';
    clusteringOutAttrInput.placeholder = 'clustering';
    clusteringOutAttrInput.value = String(options?.clustering?.outNodeAttribute ?? 'clustering');
    clusteringOutAttrInput.dataset.testid = 'metrics-clustering-outAttr';

    const clusteringCalcButton = document.createElement('button');
    clusteringCalcButton.type = 'button';
    clusteringCalcButton.className = 'helios-ui-button';
    clusteringCalcButton.textContent = 'Calculate';
    clusteringCalcButton.title = 'Calculate local clustering';
    clusteringCalcButton.dataset.testid = 'metrics-clustering-calc';

    const clusteringStatusEl = document.createElement('div');
    clusteringStatusEl.dataset.testid = 'metrics-clustering-status';
    clusteringStatusEl.textContent = '';
    styleStatusHint(clusteringStatusEl);

    clustering.appendChild(createAlignedRow({
      title: 'Variant',
      hint: 'Unweighted, Onnela, or Newman formulation',
      controls: clusteringVariantSelect,
    }).row);
    clustering.appendChild(createAlignedRow({
      title: 'Direction',
      hint: 'For directed networks: In, Out, or Both',
      controls: clusteringDirectionSelect,
    }).row);
    clustering.appendChild(createAlignedRow({
      title: 'Edge Weight',
      hint: 'Required for weighted variants',
      controls: clusteringWeightSelect,
    }).row);
    clustering.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: clusteringStatusEl,
    }).row);

    const clusteringStats = document.createElement('div');
    clusteringStats.className = 'helios-ui-stats';
    const clusteringMaxValue = makeValue('—');
    clusteringMaxValue.dataset.testid = 'metrics-clustering-max';
    const clusteringMeanValue = makeValue('—');
    clusteringMeanValue.dataset.testid = 'metrics-clustering-mean';
    const clusteringElapsedValue = makeValue('—');
    clusteringElapsedValue.dataset.testid = 'metrics-clustering-elapsed';
    clusteringStats.appendChild(createStat('Max', clusteringMaxValue).stat);
    clusteringStats.appendChild(createStat('Mean', clusteringMeanValue).stat);
    clusteringStats.appendChild(createStat('Elapsed', clusteringElapsedValue).stat);
    clusteringStats.style.marginTop = '2px';
    clusteringStats.style.marginBottom = '8px';
    clustering.appendChild(clusteringStats);

    const clusteringAdvanced = document.createElement('div');
    clusteringAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float local clustering coefficients',
      controls: clusteringOutAttrInput,
    }).row);
    const clusteringInnerStack = new PanelStack();
    clusteringInnerStack.add({ id: 'metrics-clustering-advanced', title: 'Advanced', collapsed: true, statusDot: false, content: clusteringAdvanced });
    clusteringInnerStack.element.style.marginTop = '6px';

    // --- Eigenvector Centrality ---------------------------------------------
    const eigenvector = document.createElement('div');

    const eigenvectorDirectionSelect = createDirectionSelect('metrics-eigen-direction', options?.eigenvector?.direction ?? 'both');
    const eigenvectorWeightSelect = createEdgeWeightSelect('metrics-eigen-weight', options?.eigenvector?.edgeWeightAttribute ?? '');

    const eigenvectorMaxIterationsInput = document.createElement('input');
    eigenvectorMaxIterationsInput.type = 'number';
    eigenvectorMaxIterationsInput.className = 'helios-ui-number';
    eigenvectorMaxIterationsInput.value = String(options?.eigenvector?.maxIterations ?? 256);
    eigenvectorMaxIterationsInput.dataset.testid = 'metrics-eigen-maxIterations';

    const eigenvectorToleranceInput = document.createElement('input');
    eigenvectorToleranceInput.type = 'number';
    eigenvectorToleranceInput.className = 'helios-ui-number';
    eigenvectorToleranceInput.value = String(options?.eigenvector?.tolerance ?? 1e-6);
    eigenvectorToleranceInput.dataset.testid = 'metrics-eigen-tolerance';

    const eigenvectorOutAttrInput = document.createElement('input');
    eigenvectorOutAttrInput.type = 'text';
    eigenvectorOutAttrInput.className = 'helios-ui-text';
    eigenvectorOutAttrInput.placeholder = 'eigenvector_centrality';
    eigenvectorOutAttrInput.value = String(options?.eigenvector?.outNodeAttribute ?? 'eigenvector_centrality');
    eigenvectorOutAttrInput.dataset.testid = 'metrics-eigen-outAttr';

    const eigenvectorCalcButton = document.createElement('button');
    eigenvectorCalcButton.type = 'button';
    eigenvectorCalcButton.className = 'helios-ui-button';
    eigenvectorCalcButton.textContent = 'Calculate';
    eigenvectorCalcButton.title = 'Calculate eigenvector centrality';
    eigenvectorCalcButton.dataset.calcTitle = 'Calculate eigenvector centrality';
    eigenvectorCalcButton.dataset.testid = 'metrics-eigen-calc';

    const eigenvectorStatusEl = document.createElement('div');
    eigenvectorStatusEl.dataset.testid = 'metrics-eigen-status';
    eigenvectorStatusEl.textContent = '';
    styleStatusHint(eigenvectorStatusEl);

    eigenvector.appendChild(createAlignedRow({
      title: 'Direction',
      hint: 'For directed networks: In, Out, or Both',
      controls: eigenvectorDirectionSelect,
    }).row);
    eigenvector.appendChild(createAlignedRow({
      title: 'Edge Weight',
      hint: 'Optional edge weight attribute',
      controls: eigenvectorWeightSelect,
    }).row);
    const eigenvectorMaxIterationsRow = createLinearSliderRow({
      title: 'Max Iterations',
      hint: 'Maximum power-iteration steps',
      valueInput: eigenvectorMaxIterationsInput,
      range: { min: 1, max: 2048 },
      step: 1,
    });
    eigenvector.appendChild(eigenvectorMaxIterationsRow.row);
    const eigenvectorToleranceRow = createLogSliderRow({
      title: 'Tolerance',
      hint: 'Convergence threshold • log scale',
      valueInput: eigenvectorToleranceInput,
      minExp: -12,
      maxExp: -1,
      stepExp: 0.05,
    });
    eigenvector.appendChild(eigenvectorToleranceRow.row);
    eigenvector.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: eigenvectorStatusEl,
    }).row);

    const eigenvectorProgressWrap = document.createElement('div');
    eigenvectorProgressWrap.style.display = 'grid';
    eigenvectorProgressWrap.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    eigenvectorProgressWrap.style.columnGap = '8px';
    eigenvectorProgressWrap.style.rowGap = '2px';
    eigenvectorProgressWrap.style.alignItems = 'center';
    eigenvectorProgressWrap.style.width = '100%';

    const eigenvectorProgressEl = document.createElement('progress');
    eigenvectorProgressEl.className = 'helios-ui-progress';
    eigenvectorProgressEl.max = 1;
    eigenvectorProgressEl.value = 0;
    eigenvectorProgressEl.dataset.testid = 'metrics-eigen-progress';

    const eigenvectorProgressPct = makeValue('0%');
    eigenvectorProgressPct.dataset.testid = 'metrics-eigen-progressPct';
    eigenvectorProgressWrap.appendChild(eigenvectorProgressEl);
    eigenvectorProgressWrap.appendChild(eigenvectorProgressPct);

    const { row: eigenvectorProgressRow } = createAlignedRow({
      title: 'Progress',
      hint: 'Chunked power-iteration progress',
      controls: eigenvectorProgressWrap,
    });
    eigenvector.appendChild(eigenvectorProgressRow);

    const eigenvectorStats = document.createElement('div');
    eigenvectorStats.className = 'helios-ui-stats';
    const eigenvectorMaxValue = makeValue('—');
    eigenvectorMaxValue.dataset.testid = 'metrics-eigen-max';
    const eigenvectorEigenvalueValue = makeValue('—');
    eigenvectorEigenvalueValue.dataset.testid = 'metrics-eigen-eigenvalue';
    const eigenvectorElapsedValue = makeValue('—');
    eigenvectorElapsedValue.dataset.testid = 'metrics-eigen-elapsed';
    eigenvectorStats.appendChild(createStat('Max', eigenvectorMaxValue).stat);
    eigenvectorStats.appendChild(createStat('Eigenvalue', eigenvectorEigenvalueValue).stat);
    eigenvectorStats.appendChild(createStat('Elapsed', eigenvectorElapsedValue).stat);
    eigenvectorStats.style.marginTop = '2px';
    eigenvectorStats.style.marginBottom = '8px';
    eigenvector.appendChild(eigenvectorStats);

    const eigenvectorAdvanced = document.createElement('div');
    eigenvectorAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float eigenvector-centrality values',
      controls: eigenvectorOutAttrInput,
    }).row);

    const eigenvectorChunkIterationsInput = document.createElement('input');
    eigenvectorChunkIterationsInput.type = 'number';
    eigenvectorChunkIterationsInput.className = 'helios-ui-number';
    eigenvectorChunkIterationsInput.value = String(options?.eigenvector?.chunkIterations ?? 16);
    eigenvectorChunkIterationsInput.dataset.testid = 'metrics-eigen-chunkIterations';
    const eigenvectorChunkIterationsRow = createLinearSliderRow({
      title: 'Chunk Iterations',
      hint: 'Iterations per chunk before yielding',
      valueInput: eigenvectorChunkIterationsInput,
      range: { min: 1, max: 256 },
      step: 1,
    });
    eigenvectorAdvanced.appendChild(eigenvectorChunkIterationsRow.row);

    const eigenvectorYieldMsInput = document.createElement('input');
    eigenvectorYieldMsInput.type = 'number';
    eigenvectorYieldMsInput.className = 'helios-ui-number';
    eigenvectorYieldMsInput.value = String(options?.eigenvector?.yieldMs ?? 0);
    eigenvectorYieldMsInput.dataset.testid = 'metrics-eigen-yieldMs';
    const eigenvectorYieldRow = createLinearSliderRow({
      title: 'Yield (ms)',
      hint: 'Delay between chunks to keep UI responsive',
      valueInput: eigenvectorYieldMsInput,
      range: { min: 0, max: 100 },
      step: 1,
    });
    eigenvectorAdvanced.appendChild(eigenvectorYieldRow.row);
    const eigenvectorInnerStack = new PanelStack();
    eigenvectorInnerStack.add({ id: 'metrics-eigen-advanced', title: 'Advanced', collapsed: true, statusDot: false, content: eigenvectorAdvanced });
    eigenvectorInnerStack.element.style.marginTop = '6px';

    // --- Betweenness Centrality ---------------------------------------------
    const betweenness = document.createElement('div');

    const betweennessWeightSelect = createEdgeWeightSelect('metrics-betweenness-weight', options?.betweenness?.edgeWeightAttribute ?? '');
    const betweennessNormalizeCheckbox = createSegmentedToggleControl({
      checked: options?.betweenness?.normalize !== false,
      onLabel: 'Normalized',
      offLabel: 'Raw',
      ariaLabel: 'Normalize betweenness values',
    });
    betweennessNormalizeCheckbox.dataset.testid = 'metrics-betweenness-normalize';

    const betweennessOutAttrInput = document.createElement('input');
    betweennessOutAttrInput.type = 'text';
    betweennessOutAttrInput.className = 'helios-ui-text';
    betweennessOutAttrInput.placeholder = 'betweenness_centrality';
    betweennessOutAttrInput.value = String(options?.betweenness?.outNodeAttribute ?? 'betweenness_centrality');
    betweennessOutAttrInput.dataset.testid = 'metrics-betweenness-outAttr';

    const betweennessCalcButton = document.createElement('button');
    betweennessCalcButton.type = 'button';
    betweennessCalcButton.className = 'helios-ui-button';
    betweennessCalcButton.textContent = 'Calculate';
    betweennessCalcButton.title = 'Calculate betweenness centrality';
    betweennessCalcButton.dataset.calcTitle = 'Calculate betweenness centrality';
    betweennessCalcButton.dataset.testid = 'metrics-betweenness-calc';

    const betweennessStatusEl = document.createElement('div');
    betweennessStatusEl.dataset.testid = 'metrics-betweenness-status';
    betweennessStatusEl.textContent = '';
    styleStatusHint(betweennessStatusEl);

    betweenness.appendChild(createAlignedRow({
      title: 'Edge Weight',
      hint: 'Optional edge weight attribute',
      controls: betweennessWeightSelect,
    }).row);
    betweenness.appendChild(createAlignedRow({
      title: 'Normalize',
      hint: 'Normalize values by graph size',
      controls: betweennessNormalizeCheckbox,
    }).row);
    betweenness.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: betweennessStatusEl,
    }).row);

    const betweennessProgressWrap = document.createElement('div');
    betweennessProgressWrap.style.display = 'grid';
    betweennessProgressWrap.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    betweennessProgressWrap.style.columnGap = '8px';
    betweennessProgressWrap.style.rowGap = '2px';
    betweennessProgressWrap.style.alignItems = 'center';
    betweennessProgressWrap.style.width = '100%';

    const betweennessProgressEl = document.createElement('progress');
    betweennessProgressEl.className = 'helios-ui-progress';
    betweennessProgressEl.max = 1;
    betweennessProgressEl.value = 0;
    betweennessProgressEl.dataset.testid = 'metrics-betweenness-progress';

    const betweennessProgressPct = makeValue('0%');
    betweennessProgressPct.dataset.testid = 'metrics-betweenness-progressPct';
    betweennessProgressWrap.appendChild(betweennessProgressEl);
    betweennessProgressWrap.appendChild(betweennessProgressPct);

    const { row: betweennessProgressRow } = createAlignedRow({
      title: 'Progress',
      hint: 'Chunked source-node progress',
      controls: betweennessProgressWrap,
    });
    betweenness.appendChild(betweennessProgressRow);

    const betweennessStats = document.createElement('div');
    betweennessStats.className = 'helios-ui-stats';
    const betweennessMaxValue = makeValue('—');
    betweennessMaxValue.dataset.testid = 'metrics-betweenness-max';
    const betweennessSourceCountValue = makeValue('—');
    betweennessSourceCountValue.dataset.testid = 'metrics-betweenness-sourceCount';
    const betweennessElapsedValue = makeValue('—');
    betweennessElapsedValue.dataset.testid = 'metrics-betweenness-elapsed';
    betweennessStats.appendChild(createStat('Max', betweennessMaxValue).stat);
    betweennessStats.appendChild(createStat('Sources', betweennessSourceCountValue).stat);
    betweennessStats.appendChild(createStat('Elapsed', betweennessElapsedValue).stat);
    betweennessStats.style.marginTop = '2px';
    betweennessStats.style.marginBottom = '8px';
    betweenness.appendChild(betweennessStats);

    const betweennessAdvanced = document.createElement('div');
    betweennessAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float betweenness-centrality values',
      controls: betweennessOutAttrInput,
    }).row);

    const betweennessSourceChunkInput = document.createElement('input');
    betweennessSourceChunkInput.type = 'number';
    betweennessSourceChunkInput.className = 'helios-ui-number';
    betweennessSourceChunkInput.value = String(options?.betweenness?.sourceChunkSize ?? 64);
    betweennessSourceChunkInput.dataset.testid = 'metrics-betweenness-sourceChunk';
    const betweennessSourceChunkRow = createLinearSliderRow({
      title: 'Source Chunk',
      hint: 'Number of source nodes processed per chunk',
      valueInput: betweennessSourceChunkInput,
      range: { min: 1, max: 512 },
      step: 1,
    });
    betweennessAdvanced.appendChild(betweennessSourceChunkRow.row);

    const betweennessYieldMsInput = document.createElement('input');
    betweennessYieldMsInput.type = 'number';
    betweennessYieldMsInput.className = 'helios-ui-number';
    betweennessYieldMsInput.value = String(options?.betweenness?.yieldMs ?? 0);
    betweennessYieldMsInput.dataset.testid = 'metrics-betweenness-yieldMs';
    const betweennessYieldRow = createLinearSliderRow({
      title: 'Yield (ms)',
      hint: 'Delay between source chunks',
      valueInput: betweennessYieldMsInput,
      range: { min: 0, max: 100 },
      step: 1,
    });
    betweennessAdvanced.appendChild(betweennessYieldRow.row);
    const betweennessInnerStack = new PanelStack();
    betweennessInnerStack.add({ id: 'metrics-betweenness-advanced', title: 'Advanced', collapsed: true, statusDot: false, content: betweennessAdvanced });
    betweennessInnerStack.element.style.marginTop = '6px';

    // --- Leiden --------------------------------------------------------------
    const leiden = document.createElement('div');

    const weightSelect = document.createElement('select');
    weightSelect.className = 'helios-ui-select';
    weightSelect.dataset.testid = 'metrics-leiden-weight';
    weightSelect.dataset.initialValue = String(options?.leiden?.edgeWeightAttribute ?? '');
    edgeWeightSelects.push(weightSelect);

    const resolutionInput = document.createElement('input');
    resolutionInput.type = 'number';
    resolutionInput.className = 'helios-ui-number';
    resolutionInput.value = String(options?.leiden?.resolution ?? 1);
    resolutionInput.dataset.testid = 'metrics-leiden-resolution';

    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.className = 'helios-ui-number';
    seedInput.value = String(options?.leiden?.seed ?? 1);
    seedInput.dataset.testid = 'metrics-leiden-seed';

    const maxLevelsInput = document.createElement('input');
    maxLevelsInput.type = 'number';
    maxLevelsInput.className = 'helios-ui-number';
    maxLevelsInput.value = String(options?.leiden?.maxLevels ?? 32);
    maxLevelsInput.dataset.testid = 'metrics-leiden-maxLevels';

    const maxPassesInput = document.createElement('input');
    maxPassesInput.type = 'number';
    maxPassesInput.className = 'helios-ui-number';
    maxPassesInput.value = String(options?.leiden?.passes ?? options?.leiden?.maxPasses ?? 8);
    maxPassesInput.dataset.testid = 'metrics-leiden-maxPasses';

    const outAttributeInput = document.createElement('input');
    outAttributeInput.type = 'text';
    outAttributeInput.className = 'helios-ui-text';
    outAttributeInput.placeholder = 'community';
    outAttributeInput.value = String(options?.leiden?.outNodeCommunityAttribute ?? 'community');
    outAttributeInput.dataset.testid = 'metrics-leiden-outAttr';

    const calcButton = document.createElement('button');
    calcButton.type = 'button';
    calcButton.className = 'helios-ui-button';
    calcButton.textContent = 'Calculate';
    calcButton.title = 'Calculate communities (Leiden)';
    calcButton.dataset.calcTitle = 'Calculate communities (Leiden)';
    calcButton.dataset.testid = 'metrics-calc';

    const statusEl = document.createElement('div');
    statusEl.className = 'helios-ui-label__hint';
    statusEl.dataset.testid = 'metrics-status';
    statusEl.textContent = '';

    const { row: weightRow } = createAlignedRow({
      title: 'Edge Weight',
      hint: 'Optional edge weight attribute',
      controls: weightSelect,
    });
    leiden.appendChild(weightRow);

    const resolutionRow = createLogSliderRow({
      title: 'Resolution',
      hint: 'Gamma (higher → more communities) • log scale',
      valueInput: resolutionInput,
      minExp: -4,
      maxExp: 4,
      stepExp: 0.02,
    });
    leiden.appendChild(resolutionRow.row);

    const leidenStats = document.createElement('div');
    leidenStats.className = 'helios-ui-stats';
    const modularityValue = makeValue('—');
    modularityValue.dataset.testid = 'metrics-modularity';
    const communityValue = makeValue('—');
    communityValue.dataset.testid = 'metrics-communityCount';
    const elapsedValue = makeValue('—');
    elapsedValue.dataset.testid = 'metrics-elapsed';

    leidenStats.appendChild(createStat('Modularity', modularityValue).stat);
    leidenStats.appendChild(createStat('Communities', communityValue).stat);
    leidenStats.appendChild(createStat('Elapsed', elapsedValue).stat);

    leidenStats.style.marginTop = '2px';

    const progressWrap = document.createElement('div');
    progressWrap.style.display = 'grid';
    progressWrap.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    progressWrap.style.columnGap = '8px';
    progressWrap.style.rowGap = '2px';
    progressWrap.style.alignItems = 'center';
    progressWrap.style.width = '100%';

    const progressEl = document.createElement('progress');
    progressEl.className = 'helios-ui-progress';
    progressEl.max = 1;
    progressEl.value = 0;
    progressEl.dataset.testid = 'metrics-progress';

    const progressPct = makeValue('0%');
    progressPct.dataset.testid = 'metrics-progressPct';
    progressWrap.appendChild(progressEl);
    progressWrap.appendChild(progressPct);

    // Status text lives directly under the progress bar.
    statusEl.style.gridColumn = '1 / -1';
    statusEl.style.marginTop = '0px';
    statusEl.style.fontSize = '10px';
    statusEl.style.lineHeight = '1.1';
    statusEl.style.whiteSpace = 'nowrap';
    statusEl.style.overflow = 'hidden';
    statusEl.style.textOverflow = 'ellipsis';
    statusEl.style.maxWidth = '100%';
    statusEl.style.minWidth = '0';
    progressWrap.appendChild(statusEl);

    const { row: progressRow } = createAlignedRow({
      title: 'Progress',
      hint: 'Worker progress for the current run',
      controls: progressWrap,
    });
    leiden.appendChild(progressRow);

    // Results shown without an extra title row.
    leiden.appendChild(leidenStats);
    leidenStats.style.marginBottom = '8px';

    // Advanced options collapsed inside Leiden.
    const advanced = document.createElement('div');

    const seedRow = createLinearSliderRow({
      title: 'Seed',
      hint: 'Deterministic RNG seed',
      valueInput: seedInput,
      range: { min: 0, max: 1_000_000 },
      step: 1,
    });
    advanced.appendChild(seedRow.row);

    const levelsRow = createLinearSliderRow({
      title: 'Max Levels',
      hint: 'Hierarchy aggregation levels',
      valueInput: maxLevelsInput,
      range: { min: 1, max: 128 },
      step: 1,
    });
    advanced.appendChild(levelsRow.row);

    const passesRow = createLinearSliderRow({
      title: 'Max Passes',
      hint: 'Local move passes per level',
      valueInput: maxPassesInput,
      range: { min: 1, max: 64 },
      step: 1,
    });
    advanced.appendChild(passesRow.row);

    advanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes UnsignedInteger node communities',
      controls: outAttributeInput,
    }).row);

    const yieldMsInput = document.createElement('input');
    yieldMsInput.type = 'number';
    yieldMsInput.className = 'helios-ui-number';
    yieldMsInput.value = String(options?.worker?.yieldMs ?? 0);
    yieldMsInput.dataset.testid = 'metrics-yieldMs';

    const timeoutMsInput = document.createElement('input');
    timeoutMsInput.type = 'number';
    timeoutMsInput.className = 'helios-ui-number';
    timeoutMsInput.value = String(options?.worker?.timeoutMs ?? 60);
    timeoutMsInput.dataset.testid = 'metrics-timeoutMs';

    const chunkBudgetInput = document.createElement('input');
    chunkBudgetInput.type = 'number';
    chunkBudgetInput.className = 'helios-ui-number';
    chunkBudgetInput.value = String(options?.worker?.chunkBudget ?? 20000);
    chunkBudgetInput.dataset.testid = 'metrics-chunkBudget';

    advanced.appendChild(createLinearSliderRow({ title: 'Yield (ms)', hint: 'Delay between worker chunks', valueInput: yieldMsInput, range: { min: 0, max: 100 }, step: 1 }).row);
    advanced.appendChild(createLinearSliderRow({ title: 'Timeout (ms)', hint: 'Max time per step() (slider shows 0–500ms suggestion)', valueInput: timeoutMsInput, range: { min: 0, max: 500 }, step: 1, inputMin: 0, inputMax: null, clampInput: false }).row);
    advanced.appendChild(createLinearSliderRow({ title: 'Chunk Budget', hint: 'Work per step() slice', valueInput: chunkBudgetInput, range: { min: 100, max: 100_000 }, step: 100 }).row);

    const leidenInnerStack = new PanelStack();
    leidenInnerStack.add({ id: 'metrics-leiden-advanced', title: 'Advanced', collapsed: true, statusDot: false, content: advanced });
    leidenInnerStack.element.style.marginTop = '6px';

    // --- Dimensionality ------------------------------------------------------
    const dimension = document.createElement('div');

    const dimensionMethodSelect = document.createElement('select');
    dimensionMethodSelect.className = 'helios-ui-select';
    dimensionMethodSelect.dataset.testid = 'metrics-dimension-method';
    const dimensionMethodValue = normalizeDimensionMethod(options?.dimension?.method ?? 'leastsquares');
    for (const entry of [
      { value: 'leastsquares', label: 'Least Squares (LS)' },
      { value: 'central', label: 'Centered Difference (CE)' },
      { value: 'backward', label: 'Backward Difference (BK)' },
      { value: 'forward', label: 'Forward Difference (FW)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      dimensionMethodSelect.appendChild(opt);
    }
    dimensionMethodSelect.value = dimensionMethodValue;

    const dimensionMaxLevelInput = document.createElement('input');
    dimensionMaxLevelInput.type = 'number';
    dimensionMaxLevelInput.className = 'helios-ui-number';
    dimensionMaxLevelInput.value = String(options?.dimension?.maxLevel ?? 12);
    dimensionMaxLevelInput.dataset.testid = 'metrics-dimension-maxLevel';

    const dimensionOrderInput = document.createElement('input');
    dimensionOrderInput.type = 'number';
    dimensionOrderInput.className = 'helios-ui-number';
    dimensionOrderInput.value = String(options?.dimension?.order ?? 2);
    dimensionOrderInput.dataset.testid = 'metrics-dimension-order';

    const dimensionOutMaxAttrInput = document.createElement('input');
    dimensionOutMaxAttrInput.type = 'text';
    dimensionOutMaxAttrInput.className = 'helios-ui-text';
    dimensionOutMaxAttrInput.placeholder = 'dimension_max';
    dimensionOutMaxAttrInput.value = String(options?.dimension?.outNodeMaxDimensionAttribute ?? 'dimension_max');
    dimensionOutMaxAttrInput.dataset.testid = 'metrics-dimension-outMaxAttr';

    const dimensionOutLevelsAttrInput = document.createElement('input');
    dimensionOutLevelsAttrInput.type = 'text';
    dimensionOutLevelsAttrInput.className = 'helios-ui-text';
    dimensionOutLevelsAttrInput.placeholder = 'dimension_levels';
    dimensionOutLevelsAttrInput.value = String(options?.dimension?.outNodeDimensionLevelsAttribute ?? '');
    dimensionOutLevelsAttrInput.dataset.testid = 'metrics-dimension-outLevelsAttr';

    const dimensionSaveLevelsCheckbox = createSegmentedToggleControl({
      checked: Boolean(
        options?.dimension?.saveLevelsDistribution
        ?? options?.dimension?.saveNodeDimensionLevels
        ?? options?.dimension?.outNodeDimensionLevelsAttribute
      ),
      onLabel: 'Write Levels',
      offLabel: 'Skip Levels',
      ariaLabel: 'Write levels distribution',
    });
    dimensionSaveLevelsCheckbox.dataset.testid = 'metrics-dimension-saveLevels';

    const dimensionLevelsEncodingSelect = document.createElement('select');
    dimensionLevelsEncodingSelect.className = 'helios-ui-select';
    dimensionLevelsEncodingSelect.dataset.testid = 'metrics-dimension-levelsEncoding';
    for (const entry of [
      { value: 'vector', label: 'Vector (Float)' },
      { value: 'string', label: 'String (JSON)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      dimensionLevelsEncodingSelect.appendChild(opt);
    }
    const initialLevelsEncoding = String(options?.dimension?.dimensionLevelsEncoding ?? 'vector').trim().toLowerCase();
    dimensionLevelsEncodingSelect.value = initialLevelsEncoding === 'string' ? 'string' : 'vector';

    const dimensionLevelsPrecisionInput = document.createElement('input');
    dimensionLevelsPrecisionInput.type = 'number';
    dimensionLevelsPrecisionInput.className = 'helios-ui-number';
    dimensionLevelsPrecisionInput.min = '0';
    dimensionLevelsPrecisionInput.max = '12';
    dimensionLevelsPrecisionInput.step = '1';
    dimensionLevelsPrecisionInput.value = String(options?.dimension?.dimensionLevelsStringPrecision ?? 6);
    dimensionLevelsPrecisionInput.dataset.testid = 'metrics-dimension-levelsPrecision';

    const dimensionCalcButton = document.createElement('button');
    dimensionCalcButton.type = 'button';
    dimensionCalcButton.className = 'helios-ui-button';
    dimensionCalcButton.textContent = 'Calculate';
    dimensionCalcButton.title = 'Calculate dimensionality';
    dimensionCalcButton.dataset.calcTitle = 'Calculate dimensionality';
    dimensionCalcButton.dataset.testid = 'metrics-dimension-calc';

    const dimensionStatusEl = document.createElement('div');
    dimensionStatusEl.className = 'helios-ui-label__hint';
    dimensionStatusEl.dataset.testid = 'metrics-dimension-status';
    dimensionStatusEl.textContent = '';

    const { row: dimensionMethodRow } = createAlignedRow({
      title: 'Method',
      hint: 'Dimension estimator: LS, CE, BK, or FW',
      controls: dimensionMethodSelect,
    });
    dimension.appendChild(dimensionMethodRow);

    const dimensionMaxLevelRow = createLinearSliderRow({
      title: 'Max Level',
      hint: 'Largest concentric geodesic level r',
      valueInput: dimensionMaxLevelInput,
      range: { min: 1, max: 128 },
      step: 1,
    });
    dimension.appendChild(dimensionMaxLevelRow.row);

    const dimensionOrderRow = createLinearSliderRow({
      title: 'Order',
      hint: 'Estimator order (LS window order or finite-difference order)',
      valueInput: dimensionOrderInput,
      range: { min: 1, max: 32 },
      step: 1,
    });
    dimension.appendChild(dimensionOrderRow.row);

    const dimensionStats = document.createElement('div');
    dimensionStats.className = 'helios-ui-stats';
    const dimensionGlobalMaxValue = makeValue('—');
    dimensionGlobalMaxValue.dataset.testid = 'metrics-dimension-globalMax';
    const dimensionSelectedCountValue = makeValue('—');
    dimensionSelectedCountValue.dataset.testid = 'metrics-dimension-selectedCount';
    const dimensionElapsedValue = makeValue('—');
    dimensionElapsedValue.dataset.testid = 'metrics-dimension-elapsed';

    dimensionStats.appendChild(createStat('Global Dmax', dimensionGlobalMaxValue).stat);
    dimensionStats.appendChild(createStat('Nodes', dimensionSelectedCountValue).stat);
    dimensionStats.appendChild(createStat('Elapsed', dimensionElapsedValue).stat);
    dimensionStats.style.marginTop = '2px';

    const dimensionProgressWrap = document.createElement('div');
    dimensionProgressWrap.style.display = 'grid';
    dimensionProgressWrap.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    dimensionProgressWrap.style.columnGap = '8px';
    dimensionProgressWrap.style.rowGap = '2px';
    dimensionProgressWrap.style.alignItems = 'center';
    dimensionProgressWrap.style.width = '100%';

    const dimensionProgressEl = document.createElement('progress');
    dimensionProgressEl.className = 'helios-ui-progress';
    dimensionProgressEl.max = 1;
    dimensionProgressEl.value = 0;
    dimensionProgressEl.dataset.testid = 'metrics-dimension-progress';

    const dimensionProgressPct = makeValue('0%');
    dimensionProgressPct.dataset.testid = 'metrics-dimension-progressPct';
    dimensionProgressWrap.appendChild(dimensionProgressEl);
    dimensionProgressWrap.appendChild(dimensionProgressPct);

    dimensionStatusEl.style.gridColumn = '1 / -1';
    dimensionStatusEl.style.marginTop = '0px';
    dimensionStatusEl.style.fontSize = '10px';
    dimensionStatusEl.style.lineHeight = '1.1';
    dimensionStatusEl.style.whiteSpace = 'nowrap';
    dimensionStatusEl.style.overflow = 'hidden';
    dimensionStatusEl.style.textOverflow = 'ellipsis';
    dimensionStatusEl.style.maxWidth = '100%';
    dimensionStatusEl.style.minWidth = '0';
    dimensionProgressWrap.appendChild(dimensionStatusEl);

    const { row: dimensionProgressRow } = createAlignedRow({
      title: 'Progress',
      hint: 'Incremental progress while measuring selected nodes',
      controls: dimensionProgressWrap,
    });
    dimension.appendChild(dimensionProgressRow);

    dimension.appendChild(dimensionStats);
    dimensionStats.style.marginBottom = '8px';

    const dimensionAdvanced = document.createElement('div');
    dimensionAdvanced.appendChild(createAlignedRow({
      title: 'Output Dmax',
      hint: 'Writes maximum local dimension per node (Float, dim 1)',
      controls: dimensionOutMaxAttrInput,
    }).row);
    dimensionAdvanced.appendChild(createAlignedRow({
      title: 'Save Levels',
      hint: 'Enable writing the local dimension distribution across concentric levels',
      controls: dimensionSaveLevelsCheckbox,
    }).row);
    dimensionAdvanced.appendChild(createAlignedRow({
      title: 'Output Levels',
      hint: 'Optional full per-level local dimension profile per node',
      controls: dimensionOutLevelsAttrInput,
    }).row);
    dimensionAdvanced.appendChild(createAlignedRow({
      title: 'Levels Encoding',
      hint: 'Vector writes Float dimension=maxLevel+1; String writes JSON array string',
      controls: dimensionLevelsEncodingSelect,
    }).row);

    const dimensionPrecisionRow = createLinearSliderRow({
      title: 'String Precision',
      hint: 'Applied only when Levels Encoding is String',
      valueInput: dimensionLevelsPrecisionInput,
      range: { min: 0, max: 12 },
      step: 1,
    });
    dimensionAdvanced.appendChild(dimensionPrecisionRow.row);

    const dimensionYieldMsInput = document.createElement('input');
    dimensionYieldMsInput.type = 'number';
    dimensionYieldMsInput.className = 'helios-ui-number';
    dimensionYieldMsInput.value = String(options?.dimension?.worker?.yieldMs ?? options?.worker?.yieldMs ?? 0);
    dimensionYieldMsInput.dataset.testid = 'metrics-dimension-yieldMs';

    const dimensionTimeoutMsInput = document.createElement('input');
    dimensionTimeoutMsInput.type = 'number';
    dimensionTimeoutMsInput.className = 'helios-ui-number';
    dimensionTimeoutMsInput.value = String(options?.dimension?.worker?.timeoutMs ?? options?.worker?.timeoutMs ?? 60);
    dimensionTimeoutMsInput.dataset.testid = 'metrics-dimension-timeoutMs';

    const dimensionChunkBudgetInput = document.createElement('input');
    dimensionChunkBudgetInput.type = 'number';
    dimensionChunkBudgetInput.className = 'helios-ui-number';
    dimensionChunkBudgetInput.value = String(options?.dimension?.worker?.chunkBudget ?? options?.worker?.chunkBudget ?? 200);
    dimensionChunkBudgetInput.dataset.testid = 'metrics-dimension-chunkBudget';

    dimensionAdvanced.appendChild(createLinearSliderRow({ title: 'Yield (ms)', hint: 'Delay between step() calls', valueInput: dimensionYieldMsInput, range: { min: 0, max: 100 }, step: 1 }).row);
    dimensionAdvanced.appendChild(createLinearSliderRow({ title: 'Timeout (ms)', hint: 'Max time per step() (slider shows 0–500ms suggestion)', valueInput: dimensionTimeoutMsInput, range: { min: 0, max: 500 }, step: 1, inputMin: 0, inputMax: null, clampInput: false }).row);
    dimensionAdvanced.appendChild(createLinearSliderRow({ title: 'Chunk Budget', hint: 'Nodes processed per step() chunk', valueInput: dimensionChunkBudgetInput, range: { min: 1, max: 10_000 }, step: 1 }).row);

    const dimensionInnerStack = new PanelStack();
    dimensionInnerStack.add({ id: 'metrics-dimension-advanced', title: 'Advanced', collapsed: true, statusDot: false, content: dimensionAdvanced });
    dimensionInnerStack.element.style.marginTop = '6px';

    // --- State + wiring ------------------------------------------------------
    let leidenRunning = false;
    let leidenAbortController = null;
    let dimensionRunning = false;
    let dimensionAbortController = null;
    let degreeRunning = false;
    let strengthRunning = false;
    let clusteringRunning = false;
    let eigenvectorRunning = false;
    let betweennessRunning = false;
    let eigenvectorAbortController = null;
    let betweennessAbortController = null;
    let metricsStack = null;

    const setMetricSectionState = (sectionId, state) => {
      metricsStack?.setStatus?.(sectionId, state);
    };
    const resetMetricSectionStates = () => {
      for (const id of [
        'metrics-degree',
        'metrics-strength',
        'metrics-clustering',
        'metrics-eigen',
        'metrics-betweenness',
        'metrics-leiden',
        'metrics-dimension',
      ]) {
        setMetricSectionState(id, 'idle');
      }
    };

    const setDegreeStatus = (text) => {
      const value = text ?? '';
      degreeStatusEl.textContent = value;
      degreeStatusEl.title = value;
    };

    const setDegreeRunning = (nextRunning) => {
      degreeRunning = Boolean(nextRunning);
      setDisabled(degreeCalcButton, degreeRunning);
      setDisabled(degreeDirectionSelect, degreeRunning);
      setDisabled(degreeOutAttrInput, degreeRunning);
    };

    const setStrengthStatus = (text) => {
      const value = text ?? '';
      strengthStatusEl.textContent = value;
      strengthStatusEl.title = value;
    };

    const setStrengthRunning = (nextRunning) => {
      strengthRunning = Boolean(nextRunning);
      setDisabled(strengthCalcButton, strengthRunning);
      setDisabled(strengthDirectionSelect, strengthRunning);
      setDisabled(strengthMeasureSelect, strengthRunning);
      setDisabled(strengthWeightSelect, strengthRunning);
      setDisabled(strengthOutAttrInput, strengthRunning);
    };

    const setClusteringStatus = (text) => {
      const value = text ?? '';
      clusteringStatusEl.textContent = value;
      clusteringStatusEl.title = value;
    };

    const setClusteringRunning = (nextRunning) => {
      clusteringRunning = Boolean(nextRunning);
      setDisabled(clusteringCalcButton, clusteringRunning);
      setDisabled(clusteringVariantSelect, clusteringRunning);
      setDisabled(clusteringDirectionSelect, clusteringRunning);
      setDisabled(clusteringWeightSelect, clusteringRunning || clusteringVariantSelect.value === 'unweighted');
      setDisabled(clusteringOutAttrInput, clusteringRunning);
    };

    const setEigenvectorStatus = (text) => {
      const value = text ?? '';
      eigenvectorStatusEl.textContent = value;
      eigenvectorStatusEl.title = value;
    };

    const setEigenvectorProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        eigenvectorProgressEl.removeAttribute('value');
        eigenvectorProgressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      eigenvectorProgressEl.value = pct;
      eigenvectorProgressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setEigenvectorRunning = (nextRunning) => {
      eigenvectorRunning = Boolean(nextRunning);
      setProgressActionButtonState(eigenvectorCalcButton, eigenvectorRunning);
      setDisabled(eigenvectorDirectionSelect, eigenvectorRunning);
      setDisabled(eigenvectorWeightSelect, eigenvectorRunning);
      setDisabled(eigenvectorMaxIterationsInput, eigenvectorRunning);
      setDisabled(eigenvectorMaxIterationsRow.slider, eigenvectorRunning);
      setDisabled(eigenvectorToleranceInput, eigenvectorRunning);
      setDisabled(eigenvectorToleranceRow.slider, eigenvectorRunning);
      setDisabled(eigenvectorOutAttrInput, eigenvectorRunning);
      setDisabled(eigenvectorChunkIterationsInput, eigenvectorRunning);
      setDisabled(eigenvectorChunkIterationsRow.slider, eigenvectorRunning);
      setDisabled(eigenvectorYieldMsInput, eigenvectorRunning);
      setDisabled(eigenvectorYieldRow.slider, eigenvectorRunning);
    };

    const setBetweennessStatus = (text) => {
      const value = text ?? '';
      betweennessStatusEl.textContent = value;
      betweennessStatusEl.title = value;
    };

    const setBetweennessProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        betweennessProgressEl.removeAttribute('value');
        betweennessProgressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      betweennessProgressEl.value = pct;
      betweennessProgressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setBetweennessRunning = (nextRunning) => {
      betweennessRunning = Boolean(nextRunning);
      setProgressActionButtonState(betweennessCalcButton, betweennessRunning);
      setDisabled(betweennessWeightSelect, betweennessRunning);
      setDisabled(betweennessNormalizeCheckbox, betweennessRunning);
      setDisabled(betweennessOutAttrInput, betweennessRunning);
      setDisabled(betweennessSourceChunkInput, betweennessRunning);
      setDisabled(betweennessSourceChunkRow.slider, betweennessRunning);
      setDisabled(betweennessYieldMsInput, betweennessRunning);
      setDisabled(betweennessYieldRow.slider, betweennessRunning);
    };

    const setLeidenStatus = (text) => {
      statusEl.textContent = text ?? '';
    };

    const setLeidenProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        progressEl.removeAttribute('value');
        progressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      progressEl.value = pct;
      progressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setLeidenRunning = (nextRunning) => {
      leidenRunning = Boolean(nextRunning);
      setProgressActionButtonState(calcButton, leidenRunning);
      setDisabled(weightSelect, leidenRunning);
      setDisabled(resolutionInput, leidenRunning);
      setDisabled(resolutionRow.slider, leidenRunning);
      setDisabled(seedInput, leidenRunning);
      setDisabled(seedRow.slider, leidenRunning);
      setDisabled(maxLevelsInput, leidenRunning);
      setDisabled(levelsRow.slider, leidenRunning);
      setDisabled(maxPassesInput, leidenRunning);
      setDisabled(passesRow.slider, leidenRunning);
      setDisabled(outAttributeInput, leidenRunning);
      setDisabled(yieldMsInput, leidenRunning);
      setDisabled(timeoutMsInput, leidenRunning);
      setDisabled(chunkBudgetInput, leidenRunning);
    };

    const setDimensionStatus = (text) => {
      dimensionStatusEl.textContent = text ?? '';
    };

    const setDimensionProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        dimensionProgressEl.removeAttribute('value');
        dimensionProgressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      dimensionProgressEl.value = pct;
      dimensionProgressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setDimensionRunning = (nextRunning) => {
      dimensionRunning = Boolean(nextRunning);
      setProgressActionButtonState(dimensionCalcButton, dimensionRunning);
      setDisabled(dimensionMethodSelect, dimensionRunning);
      setDisabled(dimensionMaxLevelInput, dimensionRunning);
      setDisabled(dimensionMaxLevelRow.slider, dimensionRunning);
      setDisabled(dimensionOrderInput, dimensionRunning);
      setDisabled(dimensionOrderRow.slider, dimensionRunning);
      setDisabled(dimensionOutMaxAttrInput, dimensionRunning);
      setDisabled(dimensionSaveLevelsCheckbox, dimensionRunning);
      setDisabled(dimensionOutLevelsAttrInput, dimensionRunning || !dimensionSaveLevelsCheckbox.checked);
      setDisabled(dimensionLevelsEncodingSelect, dimensionRunning || !dimensionSaveLevelsCheckbox.checked);
      setDisabled(dimensionLevelsPrecisionInput, dimensionRunning || !dimensionSaveLevelsCheckbox.checked || dimensionLevelsEncodingSelect.value !== 'string');
      setDisabled(dimensionPrecisionRow.slider, dimensionRunning || !dimensionSaveLevelsCheckbox.checked || dimensionLevelsEncodingSelect.value !== 'string');
      setDisabled(dimensionYieldMsInput, dimensionRunning);
      setDisabled(dimensionTimeoutMsInput, dimensionRunning);
      setDisabled(dimensionChunkBudgetInput, dimensionRunning);
    };

    const refreshDimensionOrderLimits = () => {
      const method = normalizeDimensionMethod(dimensionMethodSelect.value);
      const methodMaxOrder = maxOrderForDimensionMethod(method);
      dimensionOrderInput.max = String(methodMaxOrder);
      dimensionOrderRow.slider.max = String(methodMaxOrder);
      const currentOrder = Math.max(1, Number(dimensionOrderInput.value) || 1);
      if (currentOrder > methodMaxOrder) {
        dimensionOrderRow.write(methodMaxOrder);
      } else {
        dimensionOrderRow.write(currentOrder);
      }
    };

    const refreshDimensionLevelEncodingControls = () => {
      const saveLevels = Boolean(dimensionSaveLevelsCheckbox.checked);
      const allowPrecision = saveLevels && dimensionLevelsEncodingSelect.value === 'string';
      setDisabled(dimensionOutLevelsAttrInput, dimensionRunning || !saveLevels);
      setDisabled(dimensionLevelsEncodingSelect, dimensionRunning || !saveLevels);
      setDisabled(dimensionLevelsPrecisionInput, dimensionRunning || !allowPrecision);
      setDisabled(dimensionPrecisionRow.slider, dimensionRunning || !allowPrecision);
    };

    dimensionMethodSelect.addEventListener('change', refreshDimensionOrderLimits);
    dimensionOutLevelsAttrInput.addEventListener('input', refreshDimensionLevelEncodingControls);
    dimensionSaveLevelsCheckbox.addEventListener('change', refreshDimensionLevelEncodingControls);
    dimensionLevelsEncodingSelect.addEventListener('change', refreshDimensionLevelEncodingControls);

    const refreshClusteringWeightControls = () => {
      setDisabled(clusteringWeightSelect, clusteringRunning || clusteringVariantSelect.value === 'unweighted');
    };

    clusteringVariantSelect.addEventListener('change', refreshClusteringWeightControls);

    const refreshEdgeWeightOptions = () => {
      const network = net();
      const names = network && typeof network.getEdgeAttributeNames === 'function'
        ? (network.getEdgeAttributeNames() ?? []).filter((name) => isPublicAttributeName(name))
        : [];
      const numericNames = [];
      if (network && typeof network.getEdgeAttributeInfo === 'function') {
        for (const name of names) {
          try {
            const info = network.getEdgeAttributeInfo(name);
            if (info && isNumericEdgeWeightType(info.type)) numericNames.push(name);
          } catch (_) {}
        }
      }
      const autoStrengthWeight = numericNames.includes('weight')
        ? 'weight'
        : (numericNames[0] ?? '');
      for (const select of edgeWeightSelects) {
        const existing = select.value;
        const preferred = select.dataset.initialValue ?? '';
        const userSelected = select.dataset.userSelected === 'true';
        select.textContent = '';
        const optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = 'None';
        select.appendChild(optNone);
        for (const name of names) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        }
        const availableValues = new Set(Array.from(select.options, (o) => o.value));
        if (userSelected && availableValues.has(existing)) {
          select.value = existing;
        } else if (existing && availableValues.has(existing)) {
          select.value = existing;
        } else if (preferred && availableValues.has(preferred)) {
          select.value = preferred;
        } else if (select === strengthWeightSelect && autoStrengthWeight && !userSelected && availableValues.has(autoStrengthWeight)) {
          select.value = autoStrengthWeight;
        } else {
          select.value = '';
        }
      }
    };

    const refreshAll = () => {
      refreshEdgeWeightOptions();
      refreshClusteringWeightControls();
      refreshDimensionOrderLimits();
      refreshDimensionLevelEncodingControls();
    };

    const cancelLeidenRun = () => {
      if (!leidenAbortController) return;
      leidenAbortController.abort();
    };

    const cancelDimensionRun = () => {
      if (!dimensionAbortController) return;
      dimensionAbortController.abort();
    };

    const cancelEigenvectorRun = () => {
      if (!eigenvectorAbortController) return;
      eigenvectorAbortController.abort();
    };

    const cancelBetweennessRun = () => {
      if (!betweennessAbortController) return;
      betweennessAbortController.abort();
    };

    const runDegree = () => {
      const network = net();
      if (!network || typeof network.measureDegree !== 'function') {
        setDegreeStatus('Degree measurement is not available on this network');
        setMetricSectionState('metrics-degree', 'error');
        return;
      }
      const direction = normalizeNeighborDirection(degreeDirectionSelect.value);
      const outNodeAttribute = degreeOutAttrInput.value.trim();

      setDegreeStatus('Running…');
      setMetricSectionState('metrics-degree', 'running');
      degreeMaxValue.textContent = '—';
      degreeMeanValue.textContent = '—';
      degreeElapsedValue.textContent = '—';
      setDegreeRunning(true);

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const result = network.measureDegree({
          direction,
          outNodeAttribute: outNodeAttribute || null,
        });
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(result?.values ?? result?.valuesByNode);
        const wrote = Boolean(outNodeAttribute);
        degreeMaxValue.textContent = formatNumber(summary.max, 4);
        degreeMeanValue.textContent = formatNumber(summary.mean, 4);
        degreeElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        setDegreeStatus(wrote ? `Done • wrote "${outNodeAttribute}"` : 'Done');
        setMetricSectionState('metrics-degree', 'success');
        if (wrote) markMetricOutputDirty('degree', outNodeAttribute);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        setDegreeStatus(error?.message ?? String(error));
        setMetricSectionState('metrics-degree', 'error');
      } finally {
        setDegreeRunning(false);
      }
    };

    const runStrength = () => {
      const network = net();
      if (!network || typeof network.measureStrength !== 'function') {
        setStrengthStatus('Strength measurement is not available on this network');
        setMetricSectionState('metrics-strength', 'error');
        return;
      }
      const direction = normalizeNeighborDirection(strengthDirectionSelect.value);
      const measure = normalizeStrengthMeasure(strengthMeasureSelect.value);
      const edgeWeightAttribute = strengthWeightSelect.value ? String(strengthWeightSelect.value) : null;
      const outNodeAttribute = strengthOutAttrInput.value.trim();

      setStrengthStatus('Running…');
      setMetricSectionState('metrics-strength', 'running');
      strengthMaxValue.textContent = '—';
      strengthMeanValue.textContent = '—';
      strengthElapsedValue.textContent = '—';
      setStrengthRunning(true);

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const result = network.measureStrength({
          direction,
          measure,
          edgeWeightAttribute,
          outNodeAttribute: outNodeAttribute || null,
        });
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(result?.values ?? result?.valuesByNode);
        const wrote = Boolean(outNodeAttribute);
        strengthMaxValue.textContent = formatNumber(summary.max, 4);
        strengthMeanValue.textContent = formatNumber(summary.mean, 4);
        strengthElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        setStrengthStatus(wrote ? `Done • wrote "${outNodeAttribute}"` : 'Done');
        setMetricSectionState('metrics-strength', 'success');
        if (wrote) markMetricOutputDirty('strength', outNodeAttribute);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        setStrengthStatus(error?.message ?? String(error));
        setMetricSectionState('metrics-strength', 'error');
      } finally {
        setStrengthRunning(false);
      }
    };

    const runClustering = () => {
      const network = net();
      if (!network || typeof network.measureLocalClusteringCoefficient !== 'function') {
        setClusteringStatus('Local clustering measurement is not available on this network');
        setMetricSectionState('metrics-clustering', 'error');
        return;
      }
      const direction = normalizeNeighborDirection(clusteringDirectionSelect.value);
      const variant = normalizeClusteringVariant(clusteringVariantSelect.value);
      const edgeWeightAttribute = clusteringWeightSelect.value ? String(clusteringWeightSelect.value) : null;
      if (variant !== 'unweighted' && !edgeWeightAttribute) {
        setClusteringStatus('Choose an edge weight attribute for weighted variants');
        setMetricSectionState('metrics-clustering', 'error');
        return;
      }
      const outNodeAttribute = clusteringOutAttrInput.value.trim();

      setClusteringStatus('Running…');
      setMetricSectionState('metrics-clustering', 'running');
      clusteringMaxValue.textContent = '—';
      clusteringMeanValue.textContent = '—';
      clusteringElapsedValue.textContent = '—';
      setClusteringRunning(true);

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const result = network.measureLocalClusteringCoefficient({
          direction,
          variant,
          edgeWeightAttribute: variant === 'unweighted' ? null : edgeWeightAttribute,
          outNodeAttribute: outNodeAttribute || null,
        });
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(result?.values ?? result?.valuesByNode);
        const wrote = Boolean(outNodeAttribute);
        clusteringMaxValue.textContent = formatNumber(summary.max, 4);
        clusteringMeanValue.textContent = formatNumber(summary.mean, 4);
        clusteringElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        setClusteringStatus(wrote ? `Done • wrote "${outNodeAttribute}"` : 'Done');
        setMetricSectionState('metrics-clustering', 'success');
        if (wrote) markMetricOutputDirty('local-clustering', outNodeAttribute);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        setClusteringStatus(error?.message ?? String(error));
        setMetricSectionState('metrics-clustering', 'error');
      } finally {
        setClusteringRunning(false);
      }
    };

    const runEigenvector = async () => {
      const network = net();
      if (!network || typeof network.measureEigenvectorCentrality !== 'function') {
        setEigenvectorStatus('Eigenvector centrality is not available on this network');
        setMetricSectionState('metrics-eigen', 'error');
        return;
      }

      const direction = normalizeNeighborDirection(eigenvectorDirectionSelect.value);
      const edgeWeightAttribute = eigenvectorWeightSelect.value ? String(eigenvectorWeightSelect.value) : null;
      const maxIterations = Math.max(1, Number(eigenvectorMaxIterationsInput.value) || 1);
      const chunkIterations = Math.max(1, Number(eigenvectorChunkIterationsInput.value) || 1);
      const yieldMs = Math.max(0, Number(eigenvectorYieldMsInput.value) || 0);
      const toleranceRaw = Number(eigenvectorToleranceInput.value);
      const tolerance = Number.isFinite(toleranceRaw) && toleranceRaw > 0 ? toleranceRaw : 1e-6;
      const outNodeAttribute = eigenvectorOutAttrInput.value.trim();

      setEigenvectorStatus('Starting…');
      setMetricSectionState('metrics-eigen', 'running');
      setEigenvectorProgress(0, maxIterations);
      eigenvectorMaxValue.textContent = '—';
      eigenvectorEigenvalueValue.textContent = '—';
      eigenvectorElapsedValue.textContent = '—';
      setEigenvectorRunning(true);
      eigenvectorAbortController = new AbortController();
      const signal = eigenvectorAbortController.signal;

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      let processedIterations = 0;
      let currentValues = null;
      let lastResult = null;
      try {
        while (processedIterations < maxIterations) {
          if (signal.aborted) {
            throw new Error('Canceled');
          }
          const remaining = maxIterations - processedIterations;
          const stepIterations = Math.max(1, Math.min(chunkIterations, remaining));
          lastResult = network.measureEigenvectorCentrality({
            direction,
            edgeWeightAttribute,
            maxIterations: stepIterations,
            tolerance,
            initialValues: currentValues,
            executionMode: 'single-thread',
            outNodeAttribute: outNodeAttribute || null,
          });
          currentValues = lastResult?.valuesByNode ?? currentValues;
          const stepDone = Math.max(1, Number(lastResult?.iterations ?? stepIterations));
          processedIterations = Math.min(maxIterations, processedIterations + stepDone);
          setEigenvectorProgress(processedIterations, maxIterations);
          setEigenvectorStatus(`Running… ${processedIterations}/${maxIterations} iterations`);
          if (lastResult?.converged) break;
          await defer(yieldMs);
        }
        if (!currentValues) {
          throw new Error('Eigenvector centrality returned no values');
        }
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(currentValues);
        const wrote = Boolean(outNodeAttribute);
        const converged = lastResult?.converged ? 'converged' : 'max iterations reached';
        const iterations = processedIterations;
        setEigenvectorProgress(1, 1);
        eigenvectorMaxValue.textContent = formatNumber(summary.max, 6);
        eigenvectorEigenvalueValue.textContent = formatNumber(Number(lastResult?.eigenvalue ?? NaN), 6);
        eigenvectorElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        const writeMsg = wrote ? ` • wrote "${outNodeAttribute}"` : '';
        setEigenvectorStatus(`Done • ${converged} in ${iterations} iterations${writeMsg}`);
        setMetricSectionState('metrics-eigen', 'success');
        if (wrote) markMetricOutputDirty('eigenvector-centrality', outNodeAttribute);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const lower = message.toLowerCase();
        const aborted = signal.aborted || lower.includes('aborted') || lower.includes('canceled');
        if (aborted) {
          setEigenvectorStatus('Canceled');
          setMetricSectionState('metrics-eigen', 'idle');
        } else {
          const detail = reportMeasurementError('Eigenvector centrality', error, {
            direction,
            edgeWeightAttribute,
            maxIterations,
            chunkIterations,
            tolerance,
            processedIterations,
          });
          setEigenvectorStatus(detail);
          setMetricSectionState('metrics-eigen', 'error');
        }
      } finally {
        eigenvectorAbortController = null;
        setEigenvectorRunning(false);
      }
    };

    const runBetweenness = async () => {
      const network = net();
      if (!network || typeof network.measureBetweennessCentrality !== 'function') {
        setBetweennessStatus('Betweenness centrality is not available on this network');
        setMetricSectionState('metrics-betweenness', 'error');
        return;
      }
      const edgeWeightAttribute = betweennessWeightSelect.value ? String(betweennessWeightSelect.value) : null;
      const normalize = Boolean(betweennessNormalizeCheckbox.checked);
      const outNodeAttribute = betweennessOutAttrInput.value.trim();

      const totalSources = Math.max(0, Number(network.nodeCount) || 0);
      if (!totalSources) {
        setBetweennessStatus('No active nodes to process');
        setMetricSectionState('metrics-betweenness', 'error');
        betweennessMaxValue.textContent = '—';
        betweennessSourceCountValue.textContent = '0';
        betweennessElapsedValue.textContent = '0 ms';
        setBetweennessProgress(1, 1);
        return;
      }

      setBetweennessStatus('Starting…');
      setMetricSectionState('metrics-betweenness', 'running');
      setBetweennessProgress(0, totalSources);
      betweennessMaxValue.textContent = '—';
      betweennessSourceCountValue.textContent = '—';
      betweennessElapsedValue.textContent = '—';
      setBetweennessRunning(true);
      betweennessAbortController = new AbortController();
      const signal = betweennessAbortController.signal;

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      let processedSources = 0;
      try {
        if (signal.aborted) {
          throw new Error('Canceled');
        }
        setBetweennessStatus(`Running… ${totalSources}/${totalSources} sources`);
        const result = network.measureBetweennessCentrality({
          edgeWeightAttribute,
          normalize,
          executionMode: 'single-thread',
          outNodeAttribute: outNodeAttribute || null,
        });
        const finalValues = result?.valuesByNode ?? null;
        processedSources = Math.max(0, Number(result?.processedSources) || totalSources);
        setBetweennessProgress(processedSources, totalSources);
        if (!finalValues) {
          throw new Error('Betweenness centrality returned no values');
        }
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(finalValues);
        const wrote = Boolean(outNodeAttribute);
        setBetweennessProgress(1, 1);
        betweennessMaxValue.textContent = formatNumber(summary.max, 6);
        betweennessSourceCountValue.textContent = String(processedSources);
        betweennessElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        const writeMsg = wrote ? ` • wrote "${outNodeAttribute}"` : '';
        setBetweennessStatus(`Done${writeMsg}`);
        setMetricSectionState('metrics-betweenness', 'success');
        if (wrote) markMetricOutputDirty('betweenness-centrality', outNodeAttribute);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const lower = message.toLowerCase();
        const aborted = signal.aborted || lower.includes('aborted') || lower.includes('canceled');
        if (aborted) {
          setBetweennessStatus('Canceled');
          setMetricSectionState('metrics-betweenness', 'idle');
        } else {
          const detail = reportMeasurementError('Betweenness centrality', error, {
            edgeWeightAttribute,
            normalize,
            sourceChunkSize,
            processedSources,
            totalSources,
          });
          setBetweennessStatus(detail);
          setMetricSectionState('metrics-betweenness', 'error');
        }
      } finally {
        betweennessAbortController = null;
        setBetweennessRunning(false);
      }
    };

    const runLeiden = async () => {
      const network = net();
      if (!network || typeof network.createLeidenSession !== 'function') {
        setLeidenStatus('Leiden is not available on this network');
        setMetricSectionState('metrics-leiden', 'error');
        return;
      }

      const resolution = Number(resolutionInput.value || 1);
      const seed = Number(seedInput.value || 0);
      const maxLevels = Number(maxLevelsInput.value || 32);
      const maxPasses = Number(maxPassesInput.value || 8);
      const edgeWeightAttribute = weightSelect.value ? String(weightSelect.value) : null;
      const outNodeCommunityAttribute = String(outAttributeInput.value || 'community');

      const timeoutMs = Math.max(0, Number(timeoutMsInput.value) || 0);
      const chunkBudget = Math.max(1, Number(chunkBudgetInput.value) || 20000);
      const yieldMs = Math.max(0, Number(yieldMsInput.value) || 0);

      setLeidenStatus('Starting…');
      setMetricSectionState('metrics-leiden', 'running');
      setLeidenProgress(0, 1);
      modularityValue.textContent = '—';
      communityValue.textContent = '—';
      elapsedValue.textContent = '—';
      setLeidenRunning(true);
      leidenAbortController = new AbortController();

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const session = network.createLeidenSession({
          edgeWeightAttribute,
          resolution,
          seed,
          maxLevels,
          maxPasses,
          outNodeCommunityAttribute,
        });

        const result = await session.runWorker({
          signal: leidenAbortController.signal,
          yieldMs,
          stepOptions: { timeoutMs, chunkBudget },
          onProgress: (progress) => {
            if (!progress) return;
            setLeidenProgress(progress.progressCurrent, progress.progressTotal);
            const phase = progress.phase ?? 0;
            const level = progress.level ?? 0;
            const maxL = progress.maxLevels ?? 0;
            const pass = progress.pass ?? 0;
            const maxP = progress.maxPasses ?? 0;
            const communities = progress.communityCount ?? 0;
            setLeidenStatus(`Running… phase ${phase} • level ${level}/${maxL} • pass ${pass}/${maxP} • k=${communities}`);
          },
        });

        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsedMs = Math.max(0, ended - started);
        setLeidenProgress(1, 1);
        setLeidenStatus(`Done • wrote "${outNodeCommunityAttribute}"`);
        setMetricSectionState('metrics-leiden', 'success');
        modularityValue.textContent = formatNumber(result?.modularity ?? NaN, 6);
        communityValue.textContent = String(result?.communityCount ?? '—');
        elapsedValue.textContent = `${Math.round(elapsedMs)} ms`;
        markMetricOutputDirty('leiden-communities', outNodeCommunityAttribute);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const lower = message.toLowerCase();
        const aborted = leidenAbortController?.signal?.aborted || lower.includes('aborted') || lower.includes('canceled');
        if (aborted) {
          setLeidenStatus('Canceled');
          setMetricSectionState('metrics-leiden', 'idle');
        } else {
          setLeidenStatus(message);
          setMetricSectionState('metrics-leiden', 'error');
        }
      } finally {
        leidenAbortController = null;
        setLeidenRunning(false);
      }
    };

    const runDimension = async () => {
      const network = net();
      if (!network || typeof network.createDimensionSession !== 'function') {
        setDimensionStatus('Dimension session is not available on this network');
        setMetricSectionState('metrics-dimension', 'error');
        return;
      }

      refreshDimensionOrderLimits();
      const method = normalizeDimensionMethod(dimensionMethodSelect.value);
      const maxLevel = Math.max(0, Number(dimensionMaxLevelInput.value) || 0);
      const methodMaxOrder = maxOrderForDimensionMethod(method);
      const order = Math.min(methodMaxOrder, Math.max(1, Number(dimensionOrderInput.value) || 1));
      dimensionOrderRow.write(order);

      const outNodeMaxDimensionAttribute = dimensionOutMaxAttrInput.value.trim() || null;
      const saveLevels = Boolean(dimensionSaveLevelsCheckbox.checked);
      let outNodeDimensionLevelsAttribute = null;
      if (saveLevels) {
        outNodeDimensionLevelsAttribute = dimensionOutLevelsAttrInput.value.trim() || 'dimension_levels';
        dimensionOutLevelsAttrInput.value = outNodeDimensionLevelsAttribute;
      }
      const dimensionLevelsEncoding = dimensionLevelsEncodingSelect.value === 'string' ? 'string' : 'vector';
      const dimensionLevelsStringPrecision = Math.max(0, Math.min(12, Number(dimensionLevelsPrecisionInput.value) || 0));

      const timeoutMs = Math.max(0, Number(dimensionTimeoutMsInput.value) || 0);
      const chunkBudget = Math.max(1, Number(dimensionChunkBudgetInput.value) || 200);
      const yieldMs = Math.max(0, Number(dimensionYieldMsInput.value) || 0);

      setDimensionStatus('Starting…');
      setMetricSectionState('metrics-dimension', 'running');
      setDimensionProgress(0, 1);
      dimensionGlobalMaxValue.textContent = '—';
      dimensionSelectedCountValue.textContent = '—';
      dimensionElapsedValue.textContent = '—';
      setDimensionRunning(true);
      dimensionAbortController = new AbortController();

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      let session = null;
      try {
        session = network.createDimensionSession({
          maxLevel,
          method,
          order,
          captureNodeDimensionProfiles: Boolean(outNodeDimensionLevelsAttribute),
          outNodeMaxDimensionAttribute,
          outNodeDimensionLevelsAttribute,
          dimensionLevelsEncoding,
          dimensionLevelsStringPrecision,
        });

        await session.run({
          signal: dimensionAbortController.signal,
          yieldMs,
          stepOptions: { timeoutMs, chunkBudget },
          onProgress: (progress) => {
            if (!progress) return;
            setDimensionProgress(progress.progressCurrent, progress.progressTotal);
            const phase = progress.phase ?? 0;
            const processed = progress.processedNodes ?? progress.progressCurrent ?? 0;
            const total = progress.nodeCount ?? progress.progressTotal ?? 0;
            setDimensionStatus(`Running… phase ${phase} • ${processed}/${total} nodes`);
          },
        });

        const result = session.finalize({
          outNodeMaxDimensionAttribute,
          outNodeDimensionLevelsAttribute,
          dimensionLevelsEncoding,
          dimensionLevelsStringPrecision,
        });
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsedMs = Math.max(0, ended - started);
        const dmax = maxFiniteArrayValue(result?.globalDimension);

        const writes = [];
        if (outNodeMaxDimensionAttribute) writes.push(`"${outNodeMaxDimensionAttribute}"`);
        if (outNodeDimensionLevelsAttribute) writes.push(`"${outNodeDimensionLevelsAttribute}"`);
        setDimensionProgress(1, 1);
        setDimensionStatus(writes.length ? `Done • wrote ${writes.join(', ')}` : 'Done');
        setMetricSectionState('metrics-dimension', 'success');
        dimensionGlobalMaxValue.textContent = formatNumber(dmax, 4);
        dimensionSelectedCountValue.textContent = String(result?.selectedCount ?? '—');
        dimensionElapsedValue.textContent = `${Math.round(elapsedMs)} ms`;
        if (writes.length) markMetricOutputDirty('dimension', [outNodeMaxDimensionAttribute, outNodeDimensionLevelsAttribute]);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const lower = message.toLowerCase();
        const aborted = dimensionAbortController?.signal?.aborted || lower.includes('aborted') || lower.includes('canceled');
        if (aborted) {
          setDimensionStatus('Canceled');
          setMetricSectionState('metrics-dimension', 'idle');
        } else {
          setDimensionStatus(message);
          setMetricSectionState('metrics-dimension', 'error');
        }
      } finally {
        if (session && typeof session.dispose === 'function') {
          session.dispose();
        }
        dimensionAbortController = null;
        setDimensionRunning(false);
      }
    };

    degreeCalcButton.addEventListener('click', () => {
      if (degreeRunning) return;
      runDegree();
    });
    strengthCalcButton.addEventListener('click', () => {
      if (strengthRunning) return;
      runStrength();
    });
    clusteringCalcButton.addEventListener('click', () => {
      if (clusteringRunning) return;
      runClustering();
    });
    eigenvectorCalcButton.addEventListener('click', () => {
      if (eigenvectorRunning) {
        cancelEigenvectorRun();
        return;
      }
      runEigenvector();
    });
    betweennessCalcButton.addEventListener('click', () => {
      if (betweennessRunning) {
        cancelBetweennessRun();
        return;
      }
      runBetweenness();
    });

    calcButton.addEventListener('click', () => {
      if (leidenRunning) {
        cancelLeidenRun();
        return;
      }
      runLeiden();
    });
    dimensionCalcButton.addEventListener('click', () => {
      if (dimensionRunning) {
        cancelDimensionRun();
        return;
      }
      runDimension();
    });

    refreshAll();

    // Status is rendered under the Progress bar.

    metricsStack = new PanelStack();
    const stack = metricsStack;
    stack.add({
      id: 'metrics-degree',
      title: 'Degree',
      collapsed: options?.collapsedDegree ?? true,
      statusDot: true,
      headerControls: degreeCalcButton,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(degree);
        wrapper.appendChild(degreeInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-strength',
      title: 'Strength',
      collapsed: options?.collapsedStrength ?? true,
      statusDot: true,
      headerControls: strengthCalcButton,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(strength);
        wrapper.appendChild(strengthInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-clustering',
      title: 'Local Clustering',
      collapsed: options?.collapsedClustering ?? true,
      statusDot: true,
      headerControls: clusteringCalcButton,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(clustering);
        wrapper.appendChild(clusteringInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-eigen',
      title: 'Eigenvector Centrality',
      collapsed: options?.collapsedEigenvector ?? true,
      statusDot: true,
      headerControls: eigenvectorCalcButton,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(eigenvector);
        wrapper.appendChild(eigenvectorInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-betweenness',
      title: 'Betweenness Centrality',
      collapsed: options?.collapsedBetweenness ?? true,
      statusDot: true,
      headerControls: betweennessCalcButton,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(betweenness);
        wrapper.appendChild(betweennessInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-leiden',
      title: 'Communities (Leiden)',
      collapsed: options?.collapsedLeiden ?? true,
      statusDot: true,
      headerControls: calcButton,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(leiden);
        wrapper.appendChild(leidenInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-dimension',
      title: 'Dimensionality',
      collapsed: options?.collapsedDimension ?? true,
      statusDot: true,
      headerControls: dimensionCalcButton,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(dimension);
        wrapper.appendChild(dimensionInnerStack.element);
        return wrapper;
      })(),
    });
    resetMetricSectionStates();
    content.appendChild(stack.element);
    this._controlCleanups.add(() => stack.destroy());
    this._controlCleanups.add(() => degreeInnerStack.destroy());
    this._controlCleanups.add(() => strengthInnerStack.destroy());
    this._controlCleanups.add(() => clusteringInnerStack.destroy());
    this._controlCleanups.add(() => eigenvectorInnerStack.destroy());
    this._controlCleanups.add(() => betweennessInnerStack.destroy());
    this._controlCleanups.add(() => leidenInnerStack.destroy());
    this._controlCleanups.add(() => dimensionInnerStack.destroy());

    this._controlCleanups.add(() => {
      for (const cleanup of tooltipCleanups) cleanup();
      tooltipCleanups.clear();
    });

    // Refresh on network changes (and cancel any in-flight run).
    const onNetworkReplaced = () => {
      cancelLeidenRun();
      cancelDimensionRun();
      cancelEigenvectorRun();
      cancelBetweennessRun();
      resetMetricSectionStates();
      refreshAll();
    };
    let unsub = null;
    if (this.helios?.on) {
      unsub = this.helios.on('network:replaced', onNetworkReplaced);
    } else if (this.helios?.addEventListener) {
      this.helios.addEventListener('network:replaced', onNetworkReplaced);
      unsub = () => this.helios.removeEventListener('network:replaced', onNetworkReplaced);
    }
    if (unsub) this._controlCleanups.add(unsub);

    return this.createPanel({
      id: options.id ?? 'helios-ui-metrics',
      title: options.title ?? 'Metrics',
      position: options.position ?? { x: 16, y: 340 },
      dock: options.dock ?? 'top-left',
      content,
    });
  }

  createDebugPanel(options = {}) {
    const content = document.createElement('div');
    content.className = 'helios-ui-debug-panel';
    const windowMs = Number.isFinite(options.windowMs)
      ? Math.max(1000, Number(options.windowMs))
      : 5 * 60 * 1000;
    const refreshMs = Number.isFinite(options.refreshMs)
      ? Math.max(500, Number(options.refreshMs))
      : 1500;

    const rows = [
      ['trackedStateCount', 'Tracked states'],
      ['stateChangeCount', 'State changes'],
      ['uiChangeCount', 'UI changes'],
      ['persistenceChangeCount', 'Persistence changes'],
    ].map(([key, label]) => {
      const row = document.createElement('div');
      row.className = 'helios-ui-debug-panel__row';
      const labelEl = document.createElement('span');
      labelEl.className = 'helios-ui-debug-panel__label';
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.className = 'helios-ui-debug-panel__value';
      valueEl.textContent = '0';
      row.append(labelEl, valueEl);
      content.appendChild(row);
      return { key, valueEl };
    });

    const meta = document.createElement('div');
    meta.className = 'helios-ui-debug-panel__meta';
    content.appendChild(meta);

    const update = () => {
      const stats = this.helios?.storage?.debugStats?.({ windowMs })
        ?? this.helios?.states?.debugStats?.({ windowMs })
        ?? {};
      for (const row of rows) {
        const value = Number(stats[row.key] ?? 0);
        row.valueEl.textContent = Number.isFinite(value) ? String(value) : '0';
      }
      const minutes = Math.max(1, Math.round(windowMs / 60000));
      const sessionId = stats.sessionId ? String(stats.sessionId) : 'none';
      const networkStatus = stats.networkData?.status ? String(stats.networkData.status) : 'unknown';
      meta.textContent = `${minutes} min window | ${networkStatus} | ${sessionId}`;
    };
    update();
    const interval = window.setInterval(update, refreshMs);
    this._controlCleanups.add(() => window.clearInterval(interval));
    const unsubscribeState = this.helios?.states?.subscribe?.('', update, { immediate: false });
    if (typeof unsubscribeState === 'function') this._controlCleanups.add(unsubscribeState);
    if (typeof this.helios?.storage?.addEventListener === 'function') {
      const onStorageChange = () => update();
      this.helios.storage.addEventListener('change', onStorageChange);
      this._controlCleanups.add(() => this.helios?.storage?.removeEventListener?.('change', onStorageChange));
    }

    return this.createPanel({
      id: options.id ?? 'helios-ui-debug',
      title: options.title ?? 'Debug',
      position: options.position ?? { x: 16, y: 420 },
      dock: options.dock ?? 'right',
      width: options.width ?? 320,
      minWidth: options.minWidth ?? 280,
      persistencePath: false,
      content,
    });
  }

  destroy() {
    if (this._persistenceBaselineRefreshTimer != null) clearTimeout(this._persistenceBaselineRefreshTimer);
    this._persistenceBaselineRefreshTimer = null;
    for (const cleanup of this._controlCleanups) cleanup();
    this._controlCleanups.clear();
    this._boundAttributesById.clear();
    this._heliosBindingUnsubscribe = null;
    this.helios?.overlayInsets?.({ top: 0, right: 0, bottom: 0, left: 0 });
    this.panelManager?.destroy();
    if (this.helios?.ui === this) this.helios.ui = null;
    if (this.helios?.layers && typeof this.helios.layers.removeLayer === 'function') {
      this.helios.layers.removeLayer(this.layerName);
      return;
    }
    this.container?.remove?.();
  }

  createMappersPanel(options = {}) {
    return new MappersPanel(this, options).create();

    const helios = this.helios;
    const network = helios?.network ?? null;

    const CHANNEL_LABELS = {
      color: 'Color',
      size: 'Size',
      outline: 'Outline Width',
      outlineColor: 'Outline Color',
      position: 'Position',
      width: 'Width',
      opacity: 'Opacity',
      endpointPosition: 'Endpoint Position',
      endpointSize: 'Endpoint Size',
    };

    const MAPPER_TYPE_LABELS = {
      layout: 'Layout',
      constant: 'Constant',
      passthrough: 'Passthrough',
      nodeAttribute: 'From Nodes',
      linear: 'Scale',
      colormap: 'Colormap',
    };

    const nodeChannels = ['color', 'size', 'outline', 'outlineColor', 'position'];
    // Edge endpoint channels are node-derived and intentionally not exposed in the UI.
    const edgeChannels = ['color', 'width', 'opacity'];

    const colormapNames = collectColormapSuggestionNames();

    let customPresetCounter = 1;
    const customPresetsByMode = {
      node: new Map(),
      edge: new Map(),
    };

    const getCustomPresetMap = (mode, channel) => {
      const modeMap = customPresetsByMode[mode];
      if (!modeMap) return new Map();
      let byChannel = modeMap.get(channel);
      if (!byChannel) {
        byChannel = new Map();
        modeMap.set(channel, byChannel);
      }
      return byChannel;
    };

    const isEditorTransferableConfig = (config) => {
      if (!config) return false;
      const type = config.type ?? config.mode ?? null;
      if (type === 'layout') return true;

      // Editor currently doesn't represent exception rules.
      if (Array.isArray(config.rules) && config.rules.length > 0) return false;

      // Any custom function makes the config non-roundtrippable for now.
      if (typeof config.transform === 'function' && !config.transformType) return false;
      if (typeof config.scale === 'function') return false;

      // Cache/internal fields like __colormapScale are ignored.

      if (type === 'constant') return true;
      if (type === 'passthrough') return true;
      if (type === 'linear') return true;
      if (type === 'nodeAttribute') return true;

      if (type === 'colormap' || config.colormap) {
        // Only support selecting named colormaps in the editor for now.
        return typeof (config.colormap ?? config.scale ?? config.range) === 'string';
      }

      return false;
    };

    // Domains shown in the UI are always in the original attribute scale.
    // When a transform is selected, the runtime will transform the domain internally.

    const isEphemeralCustomPreset = (config) => {
      if (!config) return false;
      if (isEditorTransferableConfig(config)) return false;
      const meta = config.meta && typeof config.meta === 'object' ? config.meta : null;
      if (!meta) return true;
      const keys = Object.keys(meta);
      if (!keys.length) return true;
      const hasLabel =
        (typeof meta.name === 'string' && meta.name.trim()) ||
        (typeof meta.source === 'string' && meta.source.trim()) ||
        (typeof meta.description === 'string' && meta.description.trim());
      return !hasLabel;
    };

    const registerCustomPreset = (mode, channel, config) => {
      if (!config) return null;
      const meta = config.meta && typeof config.meta === 'object' ? config.meta : {};
      const preferredName = typeof meta.name === 'string' ? meta.name.trim() : '';
      const baseId = preferredName || `custom-${customPresetCounter++}`;
      const ephemeral = isEphemeralCustomPreset(config);

      const byId = getCustomPresetMap(mode, channel);
      let id = baseId;
      if (byId.has(id)) {
        const existing = byId.get(id);
        if (existing?.config === config) return id;
        let n = 2;
        while (byId.has(`${baseId} (${n})`)) n += 1;
        id = `${baseId} (${n})`;
      }

      byId.set(id, {
        id,
        label: preferredName || 'custom',
        ephemeral,
        config: shallowCloneChannelConfig(config) ?? config,
      });
      return id;
    };

    const pruneEphemeralCustomPresets = (mode, channel) => {
      const byId = getCustomPresetMap(mode, channel);
      for (const [id, preset] of byId.entries()) {
        if (preset?.ephemeral) byId.delete(id);
      }
    };

    const isHexColorString = (value) => {
      if (typeof value !== 'string') return false;
      const hex = value.trim();
      return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex);
    };

    const isNumericAttributeType = (type) => typeof type === 'number';
    const isIntegerAttributeType = (type) =>
      type === AttributeType.Integer ||
      type === AttributeType.UnsignedInteger ||
      type === AttributeType.BigInteger ||
      type === AttributeType.UnsignedBigInteger;

    const resolveVisualAlias = (name) => {
      if (typeof name !== 'string') return name;
      return VISUAL_ATTRIBUTE_MAP[name] ?? name;
    };

    const getAttributeInfo = (scope, rawName) => {
      if (!network) return null;
      if (rawName === '$index') return { dimension: 1, type: null };
      if (typeof rawName !== 'string' || !rawName.length) return null;

      if (scope === 'edge' && rawName.startsWith('@node.')) {
        const key = rawName.slice('@node.'.length);
        const resolved = resolveVisualAlias(key);
        return network.getNodeAttributeInfo?.(resolved) ?? null;
      }

      const resolved = resolveVisualAlias(rawName);
      return scope === 'edge'
        ? (network.getEdgeAttributeInfo?.(resolved) ?? null)
        : (network.getNodeAttributeInfo?.(resolved) ?? null);
    };

    const isCompatibleAttribute = (scope, channel, mapperType, name) => {
      const info = getAttributeInfo(scope, name);
      if (!info) return false;
      if (info.type != null && !isNumericAttributeType(info.type)) return false;

      const dim = info.dimension ?? 1;
      const isEdge = scope === 'edge';
      const isColorChannel = channel === 'color' || channel === 'outlineColor';
      const isPositionChannel = scope === 'node' && channel === 'position';
      const isScalarChannel =
        channel === 'size' ||
        channel === 'outline' ||
        channel === 'width' ||
        channel === 'opacity' ||
        channel === 'endpointSize';
      const isEdgeEndpointPosition = channel === 'endpointPosition';

      if (mapperType === 'colormap') {
        return dim === 1;
      }

      if (mapperType === 'linear') {
        return dim === 1;
      }

      if (mapperType === 'nodeAttribute') {
        if (isColorChannel) return dim === 3 || dim === 4 || dim === 1;
        if (isScalarChannel) return dim === 1;
        return false;
      }

      if (mapperType === 'passthrough') {
        if (isPositionChannel) {
          return dim === 3;
        }
        if (isColorChannel) {
          if (isEdge && typeof name === 'string' && name.startsWith('@node.')) return false;
          if (isEdge) return dim === 4 || dim === 8;
          return dim === 3 || dim === 4;
        }
        if (isEdgeEndpointPosition) {
          return isEdge && dim === 6;
        }
        if (isScalarChannel) {
          if (isEdge) return dim === 1 || dim === 2;
          return dim === 1;
        }
        return false;
      }

      return true;
    };

    const listAttributeNames = (scope, { channel, mapperType } = {}) => {
      if (!network) return [];
      const getNames = scope === 'edge' ? network.getEdgeAttributeNames : network.getNodeAttributeNames;
      if (typeof getNames !== 'function') return [];
      const raw = getNames.call(network) ?? [];
      const out = [];

      // Special built-in attribute implemented by Mapper.resolveAttribute.
      out.push('$index');

      // Friendly aliases for internal visual attributes (avoid showing _helios_*).
      if (scope === 'node') {
        out.push('color', 'size', 'outline', 'outlineColor', 'position');
      } else {
        out.push('edgeColor', 'edgeWidth', 'edgeOpacity', 'edgeEndpointPosition', 'edgeEndpointSize');
      }

      for (const name of raw) {
        if (typeof name !== 'string') continue;
        if (!isPublicAttributeName(name)) continue;
        out.push(name);
      }

      // For edge mappers, allow selecting node endpoint values with @node.*.
      if (scope === 'edge' && typeof network.getNodeAttributeNames === 'function') {
        const nodeRaw = network.getNodeAttributeNames() ?? [];
        for (const name of nodeRaw) {
          if (typeof name !== 'string') continue;
          if (!isPublicAttributeName(name)) continue;
          out.push(`@node.${name}`);
        }
      }

      const unique = Array.from(new Set(out));
      unique.sort((a, b) => {
        if (a === '$index') return -1;
        if (b === '$index') return 1;
        return a.localeCompare(b);
      });

      if (channel && mapperType) {
        return unique.filter((name) => isCompatibleAttribute(scope, channel, mapperType, name));
      }
      return unique;
    };

    const resolveCollection = (mode) => {
      if (!helios) return null;
      return mode === 'edge' ? helios.edgeMapper : helios.nodeMapper;
    };

    const computeScalarExtent = (scope, rawName) => {
      if (!network) return null;
      if (typeof rawName !== 'string' || !rawName) return null;

      if (rawName === '$index') {
        const count = scope === 'edge' ? (network.edgeCount ?? network.edgesCount ?? null) : (network.nodeCount ?? network.nodesCount ?? null);
        if (Number.isFinite(count) && count > 0) return { min: 0, max: Math.max(0, count - 1), isInteger: true };
        return null;
      }

      const resolveName = (n) => resolveVisualAlias(n);
      const isNodeProxy = scope === 'edge' && rawName.startsWith('@node.');
      const name = isNodeProxy ? rawName.slice('@node.'.length) : rawName;
      const resolved = resolveName(name);
      const info = getAttributeInfo(scope, rawName);
      const integerType = info?.type != null && isIntegerAttributeType(info.type);

      const compute = () => {
        try {
          const indices = scope === 'network'
            ? [0]
            : (isNodeProxy || scope === 'node')
              ? network.nodeIndices
              : network.edgeIndices;
          if (!indices || typeof indices.length !== 'number' || indices.length === 0) return null;
          const buffer = isNodeProxy
            ? network.getNodeAttributeBuffer?.(resolved)
            : (scope === 'edge' ? network.getEdgeAttributeBuffer?.(resolved) : network.getNodeAttributeBuffer?.(resolved));

          const view = buffer?.view ?? null;
          if (!view || typeof view.length !== 'number' || view.length <= 0) return null;

          let min = Infinity;
          let max = -Infinity;
          for (let i = 0; i < indices.length; i += 1) {
            const idx = indices[i];
            const v = Number(view[idx]);
            if (!Number.isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
          if (integerType) {
            const minInt = Math.floor(min);
            const maxInt = Math.ceil(max);
            if (minInt === maxInt) return { min: minInt, max: minInt + 1, isInteger: true };
            return { min: minInt, max: maxInt, isInteger: true };
          }
          if (min === max) return { min, max: min + 1 };
          return { min, max };
        } catch (_) {
          return null;
        }
      };

      if (typeof network.withBufferAccess === 'function') {
        return network.withBufferAccess(compute);
      }
      return compute();
    };

    const suggestDomainForAttribute = (scope, rawName) => {
      const extent = computeScalarExtent(scope, rawName);
      if (extent && Number.isFinite(extent.min) && Number.isFinite(extent.max)) return [extent.min, extent.max];
      return [0, 1];
    };

    const suggestRangeForChannel = (mode, channel) => {
      if (mode === 'node') {
        if (channel === 'size') return [1, 20];
        if (channel === 'outline') return [0, 6];
      }
      if (mode === 'edge') {
        if (channel === 'width') return [0.5, 6];
        if (channel === 'opacity') return [0, 1];
      }
      return [0, 1];
    };

    const suggestStepForRange = (min, max, isInteger = false) => {
      if (isInteger) return 1;
      const span = Math.abs(Number(max) - Number(min));
      if (!Number.isFinite(span) || span <= 0) return 0.01;
      const magnitude = Math.floor(Math.log10(span));
      const step = Math.pow(10, magnitude - 3);
      return Math.max(step, 1e-6);
    };

    const isPercentileTransform = (transformType) => transformType === 'percentile' || transformType === 'quantile';

    const formatTransformLabel = (value) => {
      if (value === 'log1p') return 'Log1p';
      if (value === 'percentile' || value === 'quantile') return 'Percentile';
      return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
    };

    const normalizeClampSetting = (clamp) => {
      if (clamp && typeof clamp === 'object') {
        return { min: clamp.min !== false, max: clamp.max !== false };
      }
      if (clamp === false) return { min: false, max: false };
      return { min: true, max: true };
    };

    const resolveDivergentDomain = (domain, extent) => {
      if (!Array.isArray(domain) || domain.length !== 2) {
        const min = extent?.min ?? -1;
        const max = extent?.max ?? 1;
        const maxAbs = Math.max(Math.abs(min), Math.abs(max), 1);
        return [-maxAbs, maxAbs];
      }
      const maxAbs = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
      if (!Number.isFinite(maxAbs) || maxAbs === 0) return [-1, 1];
      return [-maxAbs, maxAbs];
    };

    const resolveDivergentDomainFromSlider = (next, prev) => {
      const prevAbs = Math.abs(prev?.[1] ?? prev?.[0] ?? 0);
      const loAbs = Math.abs(next?.[0] ?? 0);
      const hiAbs = Math.abs(next?.[1] ?? 0);
      const loChanged = Math.abs(loAbs - prevAbs) > 1e-6;
      const hiChanged = Math.abs(hiAbs - prevAbs) > 1e-6;
      const maxAbs = loChanged && !hiChanged
        ? loAbs
        : (hiChanged && !loChanged ? hiAbs : Math.max(loAbs, hiAbs));
      if (!Number.isFinite(maxAbs) || maxAbs === 0) return [-1, 1];
      return [-maxAbs, maxAbs];
    };

    const updateSliderVisual = (slider) => {
      if (!slider) return;
      const min = Number(slider.min);
      const max = Number(slider.max);
      const value = Number(slider.value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || min === max) return;
      const pct = ((value - min) / (max - min)) * 100;
      slider.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct))));
    };

    const createSuggestedSliderControls = ({
      value,
      suggested,
      step,
      inputMin = null,
      inputMax = null,
      onCommit,
    }) => {
      const controls = document.createElement('div');
      controls.className = 'helios-ui-slider-controls';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'helios-ui-slider';
      slider.min = String(suggested[0]);
      slider.max = String(suggested[1]);
      slider.step = String(step);

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'helios-ui-number';
      input.step = String(step);
      if (inputMin != null) input.min = String(inputMin);
      else input.removeAttribute('min');
      if (inputMax != null) input.max = String(inputMax);
      else input.removeAttribute('max');

      const set = (next) => {
        const n = Number(next);
        if (!Number.isFinite(n)) return;
        const min = Number(slider.min);
        const max = Number(slider.max);
        const clamped = Math.max(min, Math.min(max, n));
        slider.value = String(clamped);
        input.value = String(n);
        updateSliderVisual(slider);
      };

      set(value);
      const commitSliderValue = createFpsThrottle((nextValue) => {
        onCommit?.(nextValue);
      });

      slider.addEventListener('input', () => {
        input.value = String(slider.value);
        updateSliderVisual(slider);
        commitSliderValue(slider.value);
      });
      slider.addEventListener('change', () => {
        input.value = String(slider.value);
        updateSliderVisual(slider);
        commitSliderValue(slider.value);
        commitSliderValue.flush();
      });
      input.addEventListener('change', () => {
        set(input.value);
        onCommit?.(input.value);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          set(input.value);
          onCommit?.(input.value);
          input.blur();
        }
      });

      controls.appendChild(slider);
      controls.appendChild(input);
      return { element: controls, slider, input, set };
    };

    const createTwoHandleRange = ({ min, max, value, step, onChange, allowRangeDrag = true }) => {
      const wrap = document.createElement('div');
      wrap.className = 'helios-ui-range2';

      const track = document.createElement('div');
      track.className = 'helios-ui-range2__track';
      const bar = document.createElement('div');
      bar.className = 'helios-ui-range2__bar';
      const rangeEl = document.createElement('div');
      rangeEl.className = 'helios-ui-range2__range';
      track.appendChild(bar);
      track.appendChild(rangeEl);

      const aInput = document.createElement('input');
      aInput.type = 'range';
      aInput.className = 'helios-ui-slider helios-ui-range2__input';
      const bInput = document.createElement('input');
      bInput.type = 'range';
      bInput.className = 'helios-ui-slider helios-ui-range2__input';

      const syncRanges = () => {
        aInput.min = String(min);
        aInput.max = String(max);
        aInput.step = String(step);
        bInput.min = String(min);
        bInput.max = String(max);
        bInput.step = String(step);
      };
      syncRanges();

      const clampTo = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const snappedMin = Math.abs(n - min) <= step / 2 ? min : n;
        const snappedMax = Math.abs(snappedMin - max) <= step / 2 ? max : snappedMin;
        return Math.max(min, Math.min(max, snappedMax));
      };

      const setVisual = (lo, hi) => {
        const span = max - min;
        const loPct = span === 0 ? 0 : ((lo - min) / span) * 100;
        const hiPct = span === 0 ? 100 : ((hi - min) / span) * 100;
        track.style.setProperty('--min-pct', String(Math.max(0, Math.min(100, loPct))));
        track.style.setProperty('--max-pct', String(Math.max(0, Math.min(100, hiPct))));
      };

      const commitBoth = (lo, hi) => {
        const nextLo = clampTo(lo);
        const nextHi = clampTo(hi);
        if (nextLo == null || nextHi == null) return;
        const orderedLo = Math.min(nextLo, nextHi);
        const orderedHi = Math.max(nextLo, nextHi);
        aInput.value = String(orderedLo);
        bInput.value = String(orderedHi);
        setVisual(orderedLo, orderedHi);
        emitRangeChange(orderedLo, orderedHi);
      };

      const seedLo = clampTo(value?.[0] ?? min) ?? min;
      const seedHi = clampTo(value?.[1] ?? max) ?? max;
      const lo0 = Math.min(seedLo, seedHi);
      const hi0 = Math.max(seedLo, seedHi);
      aInput.value = String(lo0);
      bInput.value = String(hi0);
      setVisual(lo0, hi0);
      const emitRangeChange = createFpsThrottle((lo, hi) => {
        onChange?.([lo, hi]);
      });

      const commit = (source) => {
        const a = clampTo(aInput.value);
        const b = clampTo(bInput.value);
        if (a == null || b == null) return;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        // Keep thumbs from crossing visually.
        if (source === 'a' && a > hi) aInput.value = String(hi);
        if (source === 'b' && b < lo) bInput.value = String(lo);
        setVisual(lo, hi);
        emitRangeChange(lo, hi);
      };

      // Dragging the highlighted range pans both thumbs together.
      const onRangePointerDown = (event) => {
        // Only handle primary pointer interactions.
        if (event.button != null && event.button !== 0) return;
        event.preventDefault();

        const rect = track.getBoundingClientRect();
        const widthPx = Math.max(1, rect.width);
        const domainSpan = max - min;
        if (!Number.isFinite(domainSpan) || Math.abs(domainSpan) < 1e-9) return;

        const startX = event.clientX;
        const startA = clampTo(aInput.value) ?? min;
        const startB = clampTo(bInput.value) ?? max;
        const startLo = Math.min(startA, startB);
        const startHi = Math.max(startA, startB);
        const rangeSpan = startHi - startLo;

        const clampRangeToBounds = (lo, hi) => {
          let nextLo = lo;
          let nextHi = hi;
          if (nextLo < min) {
            const shift = min - nextLo;
            nextLo = min;
            nextHi += shift;
          }
          if (nextHi > max) {
            const shift = nextHi - max;
            nextHi = max;
            nextLo -= shift;
          }
          // If span is larger than domain (shouldn't happen), fall back.
          if (nextLo < min) nextLo = min;
          if (nextHi > max) nextHi = max;
          // Preserve original span when possible.
          if (Number.isFinite(rangeSpan) && rangeSpan >= 0) {
            const currentSpan = nextHi - nextLo;
            if (currentSpan !== rangeSpan) {
              nextHi = Math.min(max, nextLo + rangeSpan);
              nextLo = Math.max(min, nextHi - rangeSpan);
            }
          }
          return [nextLo, nextHi];
        };

        const onMove = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const delta = (dx / widthPx) * domainSpan;
          if (!Number.isFinite(delta)) return;
          const [nextLo, nextHi] = clampRangeToBounds(startLo + delta, startHi + delta);
          commitBoth(nextLo, nextHi);
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          emitRangeChange.flush();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      };
      if (allowRangeDrag) {
        rangeEl.addEventListener('pointerdown', onRangePointerDown);
      }

      aInput.style.zIndex = '2';
      bInput.style.zIndex = '3';
      aInput.addEventListener('input', () => commit('a'));
      bInput.addEventListener('input', () => commit('b'));

      track.appendChild(aInput);
      track.appendChild(bInput);
      wrap.appendChild(track);

      return { element: wrap, setVisual: (lo, hi) => setVisual(lo, hi), aInput, bInput };
    };

    const resolveLiveConfig = (mode, channel) => {
      const collection = resolveCollection(mode);
      const mapper = collection?.defaultMapper ?? null;
      if (!mapper || typeof mapper.getChannel !== 'function') return null;
      return shallowCloneChannelConfig(mapper.getChannel(channel));
    };

    const applyConfig = (mode, channel, config) => {
      const collection = resolveCollection(mode);
      const mapper = collection?.defaultMapper ?? null;
      if (!collection || !mapper || typeof mapper.setChannel !== 'function') return false;
      mapper.setChannel(channel, config);
      collection.touch?.();
      return true;
    };

    const createModeTab = (mode) => {
      const root = document.createElement('div');

      const state = {
        channel: (mode === 'edge' ? (options.defaultEdgeChannel ?? 'color') : (options.defaultNodeChannel ?? 'color')),
        pending: null,
        dirty: false,
      };

      const channels = mode === 'edge' ? edgeChannels : nodeChannels;
      if (!channels.includes(state.channel)) state.channel = channels[0];

      const editorStack = new PanelStack();
      const editorBody = document.createElement('div');
      editorStack.add({ id: `${mode}-mapper-basic`, title: 'Editor', content: editorBody });
      root.appendChild(editorStack.element);
      this._controlCleanups.add(() => editorStack.destroy());

      const applyRow = document.createElement('div');
      applyRow.style.display = 'flex';
      applyRow.style.justifyContent = 'flex-end';
      applyRow.style.gap = '8px';

      const revertButton = document.createElement('button');
      revertButton.type = 'button';
      revertButton.className = 'helios-ui-button';
      revertButton.textContent = 'Revert';

      const applyButton = document.createElement('button');
      applyButton.type = 'button';
      applyButton.className = 'helios-ui-button';
      applyButton.textContent = 'Apply';

      applyRow.appendChild(revertButton);
      applyRow.appendChild(applyButton);
      root.appendChild(applyRow);

      const canApplyPending = () => {
        if (!state.pending) return false;
        const collection = resolveCollection(mode);
        const mapper = collection?.defaultMapper ?? null;
        if (!collection || !mapper || typeof mapper.setChannel !== 'function') return false;

        // If the editor can't fully represent the config, treat it as a custom mapper.
        const rawType = state.pending.type ?? state.pending.mode ?? null;
        const type = isEditorTransferableConfig(state.pending) ? (rawType ?? 'passthrough') : 'custom';

        if (mode === 'node' && state.channel === 'position' && type === 'layout') {
          const scheduler = helios?.scheduler ?? null;
          if (!scheduler || typeof scheduler.setLayoutEnabled !== 'function') return false;
          return Boolean(scheduler.layout);
        }

        if (type === 'passthrough') {
          return typeof state.pending.attributes === 'string' && state.pending.attributes.length > 0;
        }

        if (type === 'nodeAttribute') {
          return typeof state.pending.nodeAttribute === 'string' && state.pending.nodeAttribute.length > 0;
        }

        if (type === 'constant') {
          const v = state.pending.value;
          const isArrayLike = Array.isArray(v) || ArrayBuffer.isView(v);
          if (mode === 'node' && state.channel === 'position') {
            return isArrayLike && v.length === 3 && Array.from(v).every((x) => Number.isFinite(x));
          }
          if (isArrayLike) return v.length === 3 || v.length === 4;
          if (v && typeof v === 'object') {
            if (mode === 'edge') {
              if (state.channel === 'color') {
                const src = v.source ?? v.start ?? null;
                const dst = v.target ?? v.end ?? null;
                if (src != null && !isHexColorString(String(src))) return false;
                if (dst != null && !isHexColorString(String(dst))) return false;
                return src != null || dst != null;
              }
              if (state.channel === 'width' || state.channel === 'opacity' || state.channel === 'endpointSize') {
                const src = Number(v.source ?? v.start);
                const dst = Number(v.target ?? v.end);
                const srcOk = Number.isFinite(src);
                const dstOk = Number.isFinite(dst);
                return srcOk || dstOk;
              }
            }
            return false;
          }
          if (typeof v === 'number') return Number.isFinite(v);
          if (typeof v === 'string') return isHexColorString(v);
          return false;
        }

        if (type === 'linear') {
          if (!(typeof state.pending.attributes === 'string' && state.pending.attributes.length > 0)) return false;
          const domain = state.pending.domain;
          const range = state.pending.range;
          const domainOk = Array.isArray(domain) && domain.length === 2 && domain.every((x) => Number.isFinite(x));
          const rangeOk = Array.isArray(range) && range.length === 2 && range.every((x) => Number.isFinite(x));
          return domainOk && rangeOk;
        }

        if (type === 'colormap') {
          if (!(typeof state.pending.attributes === 'string' && state.pending.attributes.length > 0)) return false;
          if (!(typeof state.pending.colormap === 'string' && state.pending.colormap.length > 0)) return false;
          return true;
        }

        if (type === 'custom') {
          return true;
        }

        return true;
      };

      const syncApplyEnabled = () => {
        applyButton.disabled = !canApplyPending();
      };

      const setDirty = (dirty) => {
        state.dirty = Boolean(dirty);
        syncApplyEnabled();
      };


      const resolveAllowedTypes = (channel) => {
        if (mode === 'node' && channel === 'position') return ['layout', 'constant', 'passthrough'];
        const isColor = channel === 'color' || channel === 'outlineColor';
        const isScalar =
          channel === 'size' ||
          channel === 'outline' ||
          channel === 'width' ||
          channel === 'opacity' ||
          channel === 'endpointSize';
        if (mode === 'edge' && isColor) return ['constant', 'passthrough', 'nodeAttribute', 'colormap'];
        if (mode === 'edge' && isScalar) return ['constant', 'passthrough', 'nodeAttribute', 'linear'];
        if (isColor) return ['constant', 'passthrough', 'colormap'];
        if (isScalar) return ['constant', 'passthrough', 'linear'];
        // MVP: other channels are passthrough only.
        return ['passthrough'];
      };

      const renderEditor = () => {
        editorBody.textContent = '';
        const live = resolveLiveConfig(mode, state.channel);

        if (!state.pending) {
          if (mode === 'node' && state.channel === 'position') {
            const scheduler = helios?.scheduler ?? null;
            const hasLayout = Boolean(scheduler?.layout);
            const layoutState = typeof scheduler?.getLayoutState === 'function'
              ? scheduler.getLayoutState()
              : (scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
            const layoutEnabled = hasLayout && layoutState !== 'stopped';
            state.pending = layoutEnabled ? { name: state.channel, type: 'layout' } : (shallowCloneChannelConfig(live) ?? { name: state.channel });
          } else {
            state.pending = shallowCloneChannelConfig(live) ?? { name: state.channel };
          }
        }

        const allowedTypes = resolveAllowedTypes(state.channel);
        const customPresets = getCustomPresetMap(mode, state.channel);

        // Decide current selection first, registering custom presets before building the dropdown.
        const resolveCurrentTypeKey = () => {
          const pendingType = state.pending?.type ?? state.pending?.mode ?? null;

          if (pendingType === 'layout' && allowedTypes.includes('layout')) return 'layout';

          if (state.pending && isEditorTransferableConfig(state.pending) && allowedTypes.includes(pendingType)) {
            return pendingType;
          }

          const candidate = state.pending ?? live;
          if (candidate && !isEditorTransferableConfig(candidate)) {
            const id = registerCustomPreset(mode, state.channel, candidate);
            if (id) return `custom:${id}`;
          }

          // If live is custom but pending isn't set yet, ensure the live custom preset exists.
          if (live && !isEditorTransferableConfig(live)) {
            const id = registerCustomPreset(mode, state.channel, live);
            if (id) return `custom:${id}`;
          }

          return allowedTypes[0];
        };

        const currentKey = resolveCurrentTypeKey();

        const typeSelect = document.createElement('select');
        typeSelect.className = 'helios-ui-select';

        for (const t of allowedTypes) {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = MAPPER_TYPE_LABELS[t] ?? t;
          typeSelect.appendChild(opt);
        }

        for (const preset of customPresets.values()) {
          const opt = document.createElement('option');
          opt.value = `custom:${preset.id}`;
          const label = typeof preset.label === 'string' ? preset.label.trim() : '';
          opt.textContent = label && label.toLowerCase() !== 'custom' ? `Custom: ${label}` : 'Custom';
          typeSelect.appendChild(opt);
        }

        const availableKeys = [
          ...allowedTypes,
          ...Array.from(customPresets.keys()).map((id) => `custom:${id}`),
        ];
        typeSelect.value = availableKeys.includes(currentKey) ? currentKey : availableKeys[0];

        const setPendingType = (nextType) => {
          const prev = state.pending ?? {};
          const base = nextType === 'layout'
            ? { name: state.channel, type: nextType }
            : {
              name: state.channel,
              type: nextType,
              attributes: prev.attributes ?? live?.attributes ?? live?.from,
              defaultValue: prev.defaultValue ?? live?.defaultValue,
            };
          if (nextType === 'constant') {
            base.value = prev.value ?? live?.value;
          }
          if (nextType === 'passthrough') {
            // nothing else
          }
          if (nextType === 'nodeAttribute') {
            base.nodeAttribute = prev.nodeAttribute ?? live?.nodeAttribute ?? '';
            base.endpoints = prev.endpoints ?? live?.endpoints ?? 'both';
            if (!base.nodeAttribute) {
              const isColorChannel = state.channel === 'color' || state.channel === 'outlineColor';
              base.nodeAttribute = isColorChannel ? 'color' : 'size';
            }
            base.attributes = [`@node.${base.nodeAttribute}`];
          }
          if (nextType === 'linear') {
            const attr = typeof base.attributes === 'string' ? base.attributes : null;
            base.transformType = prev.transformType ?? live?.transformType ?? 'linear';
            base.transformPower = prev.transformPower ?? live?.transformPower ?? 1;
            base.domain = Array.isArray(prev.domain)
              ? prev.domain
              : (Array.isArray(live?.domain) ? live.domain : suggestDomainForAttribute(mode, attr));
            const suggested = suggestRangeForChannel(mode, state.channel);
            base.range = Array.isArray(prev.range) ? prev.range : (Array.isArray(live?.range) ? live.range : suggested);
          }
          if (nextType === 'colormap') {
            base.colormap = prev.colormap ?? live?.colormap ?? 'interpolateInferno';
            const attr = typeof base.attributes === 'string' ? base.attributes : null;
            base.transformType = prev.transformType ?? live?.transformType ?? 'linear';
            base.transformPower = prev.transformPower ?? live?.transformPower ?? 1;
            base.domain = Array.isArray(prev.domain)
              ? prev.domain
              : (Array.isArray(live?.domain) ? live.domain : suggestDomainForAttribute(mode, attr));
            base.alpha = prev.alpha ?? live?.alpha ?? 1;
            base.clamp = prev.clamp ?? live?.clamp ?? true;
          }
          state.pending = base;
          setDirty(true);
          renderEditor();
        };

        typeSelect.addEventListener('change', () => {
          const next = typeSelect.value;
          if (next.startsWith('custom:')) {
            const id = next.slice('custom:'.length);
            const preset = customPresets.get(id) ?? null;
            if (preset?.config) {
              state.pending = shallowCloneChannelConfig(preset.config) ?? preset.config;
              setDirty(true);
              renderEditor();
            }
            return;
          }
          pruneEphemeralCustomPresets(mode, state.channel);
          setPendingType(next);
        });

        editorBody.appendChild(createAlignedRowEl({ title: 'Type', controls: typeSelect }).row);

        const pendingTypeKey = typeSelect.value;
        const pendingType = pendingTypeKey.startsWith('custom:') ? 'custom' : pendingTypeKey;
        const isColor = state.channel === 'color' || state.channel === 'outlineColor';
        const isScalar =
          state.channel === 'size' ||
          state.channel === 'outline' ||
          state.channel === 'width' ||
          state.channel === 'opacity' ||
          state.channel === 'endpointSize';
        const isPosition = mode === 'node' && state.channel === 'position';

        if (pendingType === 'layout') {
          const note = document.createElement('div');
          note.style.color = 'var(--helios-ui-muted)';
          note.textContent = 'Uses the active layout (no position mapper applied).';
          editorBody.appendChild(note);
        }

        if (pendingType === 'custom') {
          const meta = state.pending?.meta && typeof state.pending.meta === 'object' ? state.pending.meta : {};
          const description = typeof meta.description === 'string' ? meta.description : '';
          const source = typeof meta.source === 'string' ? meta.source : '';

          const descEl = document.createElement('div');
          descEl.style.whiteSpace = 'pre-wrap';
          descEl.style.color = 'var(--helios-ui-muted)';
          descEl.textContent = description || '—';
          editorBody.appendChild(createAlignedRowEl({ title: 'Description', controls: descEl }).row);

          const srcEl = document.createElement('div');
          srcEl.style.whiteSpace = 'pre-wrap';
          srcEl.style.color = 'var(--helios-ui-muted)';
          srcEl.textContent = source || '—';
          editorBody.appendChild(createAlignedRowEl({ title: 'Source', controls: srcEl }).row);
        }

        if (pendingType === 'passthrough') {
          const attrSelect = document.createElement('select');
          attrSelect.className = 'helios-ui-select';
          const names = listAttributeNames(mode, { channel: state.channel, mapperType: 'passthrough' });
          const current = typeof state.pending.attributes === 'string'
            ? state.pending.attributes
            : (typeof live?.attributes === 'string' ? live.attributes : '');
          const optBlank = document.createElement('option');
          optBlank.value = '';
          optBlank.textContent = names.length ? 'Select attribute…' : 'No attributes';
          attrSelect.appendChild(optBlank);
          for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            attrSelect.appendChild(opt);
          }
          attrSelect.value = names.includes(current) ? current : '';
          attrSelect.addEventListener('change', () => {
            state.pending = { ...state.pending, type: 'passthrough', attributes: attrSelect.value || undefined };
            setDirty(true);
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'Attribute', controls: attrSelect }).row);
        }

        if (pendingType === 'nodeAttribute') {
          const attrSelect = document.createElement('select');
          attrSelect.className = 'helios-ui-select';
          const names = listAttributeNames('node', { channel: state.channel, mapperType: 'nodeAttribute' });
          const current = typeof state.pending.nodeAttribute === 'string'
            ? state.pending.nodeAttribute
            : (typeof live?.nodeAttribute === 'string' ? live.nodeAttribute : '');

          const optBlank = document.createElement('option');
          optBlank.value = '';
          optBlank.textContent = names.length ? 'Select node attribute…' : 'No node attributes';
          attrSelect.appendChild(optBlank);

          for (const name of names) {
            const bare = name.startsWith('@node.') ? name.slice('@node.'.length) : name;
            if (bare === '$index') continue;
            const opt = document.createElement('option');
            opt.value = bare;
            opt.textContent = bare;
            attrSelect.appendChild(opt);
          }

          attrSelect.value = current || '';
          attrSelect.addEventListener('change', () => {
            const bare = attrSelect.value || undefined;
            state.pending = {
              ...state.pending,
              type: 'nodeAttribute',
              nodeAttribute: bare,
              endpoints: state.pending.endpoints ?? 'both',
              attributes: bare ? [`@node.${bare}`] : undefined,
            };
            setDirty(true);
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'From/To', controls: attrSelect }).row);
        }

        if (pendingType === 'constant' && isScalar) {
          const wrap = document.createElement('div');
          wrap.style.display = 'grid';
          wrap.style.gap = '6px';
          wrap.style.width = '100%';

          const minAllowed = (() => {
            if (state.channel === 'opacity') return 0;
            if (state.channel === 'size' || state.channel === 'outline' || state.channel === 'width' || state.channel === 'endpointSize') return 0;
            return null;
          })();
          const maxAllowed = state.channel === 'opacity' ? 1 : null;

          const [suggestMin, suggestMax] = suggestRangeForChannel(mode, state.channel);
          const step = suggestStepForRange(suggestMin, suggestMax);

          const isEdgeSplitCapable = mode === 'edge' && (state.channel === 'width' || state.channel === 'opacity' || state.channel === 'endpointSize');
          const pendingValue = state.pending.value ?? live?.value;
          const isSplit =
            isEdgeSplitCapable &&
            pendingValue &&
            typeof pendingValue === 'object' &&
            ('source' in pendingValue || 'target' in pendingValue);

          if (isEdgeSplitCapable) {
            const toggle = createSegmentedToggleControl({
              checked: Boolean(isSplit),
              onLabel: 'Source/Target',
              offLabel: 'Single',
            });
            wrap.appendChild(toggle);

            toggle.addEventListener('change', () => {
              const raw = state.pending.value ?? live?.value;
              const seed = Number.isFinite(Number(raw)) ? Number(raw) : 1;
              if (toggle.checked) {
                state.pending = { ...state.pending, type: 'constant', value: { source: seed, target: seed } };
              } else {
                const src = raw && typeof raw === 'object' ? Number(raw.source ?? raw.start) : seed;
                const next = Number.isFinite(src) ? src : seed;
                state.pending = { ...state.pending, type: 'constant', value: next };
              }
              setDirty(true);
              renderEditor();
            });
          }

          const commit = (value, endpoint) => {
            const n = clampNumber(value, { min: minAllowed, max: maxAllowed });
            if (n == null) return;

            if (isSplit) {
              const current = state.pending.value && typeof state.pending.value === 'object' ? state.pending.value : {};
              const next = endpoint === 'target'
                ? { ...current, target: n }
                : { ...current, source: n };
              state.pending = { ...state.pending, type: 'constant', value: next };
            } else {
              state.pending = { ...state.pending, type: 'constant', value: n };
            }
            setDirty(true);
          };

          if (isSplit) {
            const labelStyle = (el) => {
              el.style.fontSize = '12px';
              el.style.color = 'var(--helios-ui-muted)';
            };

            const sourceLabel = document.createElement('div');
            sourceLabel.textContent = 'Source';
            labelStyle(sourceLabel);
            wrap.appendChild(sourceLabel);

            const srcSeed = Number(pendingValue?.source ?? pendingValue?.start ?? 1);
            const srcValue = Number.isFinite(srcSeed) ? srcSeed : 1;
            wrap.appendChild(createSuggestedSliderControls({
              value: srcValue,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v, 'source'),
            }).element);

            const targetLabel = document.createElement('div');
            targetLabel.textContent = 'Target';
            labelStyle(targetLabel);
            wrap.appendChild(targetLabel);

            const dstSeed = Number(pendingValue?.target ?? pendingValue?.end ?? srcValue);
            const dstValue = Number.isFinite(dstSeed) ? dstSeed : srcValue;
            wrap.appendChild(createSuggestedSliderControls({
              value: dstValue,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v, 'target'),
            }).element);
          } else {
            const fallbackValue = Number.isFinite(Number(live?.value)) ? Number(live.value) : 1;
            const seeded = Number.isFinite(Number(state.pending.value)) ? Number(state.pending.value) : fallbackValue;
            if (!Number.isFinite(Number(state.pending.value))) {
              state.pending = { ...state.pending, type: 'constant', value: seeded };
            }
            wrap.appendChild(createSuggestedSliderControls({
              value: seeded,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v),
            }).element);
          }

          editorBody.appendChild(createAlignedRowEl({ title: 'Value', controls: wrap }).row);
        }

        if (pendingType === 'constant' && isPosition) {
          const wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.gap = '8px';

          const makeNum = () => {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'helios-ui-number';
            return input;
          };

          const xInput = makeNum();
          const yInput = makeNum();
          const zInput = makeNum();

          const seeded = (() => {
            const v = state.pending.value ?? live?.value;
            const isArrayLike = Array.isArray(v) || ArrayBuffer.isView(v);
            if (isArrayLike && v.length >= 3) {
              const x = Number(v[0]);
              const y = Number(v[1]);
              const z = Number(v[2]);
              if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) return [x, y, z];
            }
            return [0, 0, 0];
          })();

          if (!Array.isArray(state.pending.value) && !ArrayBuffer.isView(state.pending.value)) {
            state.pending = { ...state.pending, type: 'constant', value: seeded };
          }

          xInput.value = String(seeded[0]);
          yInput.value = String(seeded[1]);
          zInput.value = String(seeded[2]);

          const commit = () => {
            const x = clampNumber(xInput.value);
            const y = clampNumber(yInput.value);
            const z = clampNumber(zInput.value);
            if (x == null || y == null || z == null) return;
            state.pending = { ...state.pending, type: 'constant', value: [x, y, z] };
            setDirty(true);
          };
          xInput.addEventListener('change', commit);
          yInput.addEventListener('change', commit);
          zInput.addEventListener('change', commit);

          wrap.appendChild(xInput);
          wrap.appendChild(yInput);
          wrap.appendChild(zInput);
          editorBody.appendChild(createAlignedRowEl({ title: 'Value', controls: wrap }).row);
        }

        if (pendingType === 'constant' && isColor) {
          const wrap = document.createElement('div');
          wrap.style.display = 'grid';
          wrap.style.gap = '6px';
          wrap.style.width = '100%';

          const isEdgeSplitCapable = mode === 'edge' && state.channel === 'color';
          const pendingValue = state.pending.value ?? live?.value;
          const isSplit =
            isEdgeSplitCapable &&
            pendingValue &&
            typeof pendingValue === 'object' &&
            ('source' in pendingValue || 'target' in pendingValue);

          const seedSingle = () => {
            const seed = typeof pendingValue === 'string'
              ? pendingValue
              : (typeof live?.value === 'string' ? live.value : '#ffffff');
            return typeof seed === 'string' && seed.length ? seed : '#ffffff';
          };

          if (isEdgeSplitCapable) {
            const toggle = createSegmentedToggleControl({
              checked: Boolean(isSplit),
              onLabel: 'Source/Target',
              offLabel: 'Single',
            });
            wrap.appendChild(toggle);

            toggle.addEventListener('change', () => {
              const seed = seedSingle();
              if (toggle.checked) {
                state.pending = { ...state.pending, type: 'constant', value: { source: seed, target: seed } };
              } else {
                const raw = state.pending.value ?? live?.value;
                const next = raw && typeof raw === 'object' ? String(raw.source ?? raw.start ?? seed) : seed;
                state.pending = { ...state.pending, type: 'constant', value: next };
              }
              setDirty(true);
              renderEditor();
            });
          }

          const makeColorControls = ({ label, getValue, setValue }) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            row.style.width = '100%';

            if (label) {
              const labelEl = document.createElement('div');
              labelEl.textContent = label;
              labelEl.style.fontSize = '12px';
              labelEl.style.color = 'var(--helios-ui-muted)';
              labelEl.style.minWidth = '52px';
              row.appendChild(labelEl);
            }

            const swatchWrap = document.createElement('div');
            swatchWrap.className = 'helios-ui-color-swatch';

            const swatch = document.createElement('div');
            swatch.className = 'helios-ui-color-swatch__swatch';

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.className = 'helios-ui-color-swatch__input';
            colorInput.setAttribute('aria-label', label ? `${label} color` : 'Color');

            const alphaInput = document.createElement('input');
            alphaInput.type = 'number';
            alphaInput.className = 'helios-ui-number';
            alphaInput.min = '0';
            alphaInput.max = '1';
            alphaInput.step = '0.01';
            alphaInput.style.maxWidth = '88px';
            alphaInput.title = 'Alpha';

            const alphaLabel = document.createElement('span');
            alphaLabel.textContent = 'Alpha';
            alphaLabel.style.color = 'var(--helios-ui-muted)';

            const rawValue = getValue();
            const liveColor = typeof rawValue === 'string' ? rawValue : '#ffffff';
            const raw = liveColor.startsWith('#') ? liveColor.slice(1) : liveColor;
            const baseHex = raw.length >= 6 ? `#${raw.slice(0, 6)}` : '#ffffff';
            const alphaHex = raw.length === 8 ? raw.slice(6, 8) : 'ff';
            const alpha = Math.round(parseInt(alphaHex, 16) / 255 * 100) / 100;

            colorInput.value = baseHex;
            alphaInput.value = String(Number.isFinite(alpha) ? alpha : 1);
            swatch.style.background = colorInput.value;

            const commit = () => {
              const a = clampNumber(alphaInput.value, { min: 0, max: 1 });
              if (a == null) return;
              setValue(toHex8(colorInput.value, a));
              setDirty(true);
              swatch.style.background = colorInput.value;
            };
            colorInput.addEventListener('input', commit);
            alphaInput.addEventListener('change', commit);

            swatchWrap.appendChild(swatch);
            swatchWrap.appendChild(colorInput);
            row.appendChild(swatchWrap);
            row.appendChild(alphaLabel);
            row.appendChild(alphaInput);
            return row;
          };

          if (isSplit) {
            if (!state.pending.value || typeof state.pending.value !== 'object') {
              const seed = seedSingle();
              state.pending = { ...state.pending, type: 'constant', value: { source: seed, target: seed } };
            }
            wrap.appendChild(makeColorControls({
              label: 'Source',
              getValue: () => String(state.pending.value?.source ?? seedSingle()),
              setValue: (v) => {
                state.pending = { ...state.pending, type: 'constant', value: { ...(state.pending.value ?? {}), source: v } };
              },
            }));
            wrap.appendChild(makeColorControls({
              label: 'Target',
              getValue: () => String(state.pending.value?.target ?? state.pending.value?.source ?? seedSingle()),
              setValue: (v) => {
                state.pending = { ...state.pending, type: 'constant', value: { ...(state.pending.value ?? {}), target: v } };
              },
            }));
            editorBody.appendChild(createAlignedRowEl({ title: 'Color', controls: wrap }).row);
          } else {
            if (!(typeof state.pending.value === 'string' && state.pending.value.length > 0)) {
              state.pending = { ...state.pending, type: 'constant', value: seedSingle() };
            }
            wrap.appendChild(makeColorControls({
              label: null,
              getValue: () => String(state.pending.value ?? seedSingle()),
              setValue: (v) => {
                state.pending = { ...state.pending, type: 'constant', value: v };
              },
            }));
            editorBody.appendChild(createAlignedRowEl({ title: 'Color', controls: wrap }).row);
          }
        }

        if (pendingType === 'linear') {
          const srcRow = document.createElement('div');
          srcRow.style.display = 'grid';
          srcRow.style.gap = '6px';

          const attrSelect = document.createElement('select');
          attrSelect.className = 'helios-ui-select';
          const names = listAttributeNames(mode, { channel: state.channel, mapperType: 'linear' });
          const current = typeof state.pending.attributes === 'string'
            ? state.pending.attributes
            : (typeof live?.attributes === 'string' ? live.attributes : '');
          const optBlank = document.createElement('option');
          optBlank.value = '';
          optBlank.textContent = names.length ? 'Select attribute…' : 'No attributes';
          attrSelect.appendChild(optBlank);
          for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            attrSelect.appendChild(opt);
          }
          attrSelect.value = names.includes(current) ? current : '';
          attrSelect.addEventListener('change', () => {
            const attr = attrSelect.value || undefined;
            const domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
            state.pending = { ...state.pending, type: 'linear', attributes: attr, domain };
            setDirty(true);
            renderEditor();
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'Attribute', controls: attrSelect }).row);

          const transformWrap = document.createElement('div');
          transformWrap.style.display = 'flex';
          transformWrap.style.gap = '8px';
          transformWrap.style.alignItems = 'center';

          const transformSelect = document.createElement('select');
          transformSelect.className = 'helios-ui-select';
          for (const optVal of ['linear', 'log', 'log1p', 'logit', 'power', 'percentile']) {
            const opt = document.createElement('option');
            opt.value = optVal;
            opt.textContent = formatTransformLabel(optVal);
            transformSelect.appendChild(opt);
          }
          const resolvedTransformType = state.pending.transformType === 'quantile'
            ? 'percentile'
            : (state.pending.transformType ?? 'linear');
          transformSelect.value = String(resolvedTransformType);

          const powerInput = document.createElement('input');
          powerInput.type = 'number';
          powerInput.className = 'helios-ui-number';
          powerInput.style.maxWidth = '96px';
          powerInput.value = String(Number.isFinite(Number(state.pending.transformPower)) ? state.pending.transformPower : 1);
          powerInput.hidden = transformSelect.value !== 'power';

          transformSelect.addEventListener('change', () => {
            const nextType = transformSelect.value || 'linear';
            const prevType = state.pending.transformType ?? 'linear';
            powerInput.hidden = nextType !== 'power';
            const nextPending = { ...state.pending, type: 'linear', transformType: nextType };
            if (isPercentileTransform(nextType)) {
              nextPending.domain = [0, 1];
            } else if (isPercentileTransform(prevType)) {
              const attr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
              nextPending.domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
            }
            state.pending = nextPending;
            if (nextType !== 'power') {
              state.pending = { ...state.pending, type: 'linear', transformPower: undefined };
            } else {
              state.pending = { ...state.pending, type: 'linear', transformPower: Number(powerInput.value) || 1 };
            }
            setDirty(true);
            renderEditor();
          });

          powerInput.addEventListener('change', () => {
            const p = clampNumber(powerInput.value);
            if (p == null) return;
            state.pending = { ...state.pending, type: 'linear', transformType: 'power', transformPower: p };
            setDirty(true);
            renderEditor();
          });

          transformWrap.appendChild(transformSelect);
          transformWrap.appendChild(powerInput);
          editorBody.appendChild(createAlignedRowEl({ title: 'Transform', controls: transformWrap }).row);

          const domainWrap = document.createElement('div');
          domainWrap.style.display = 'grid';
          domainWrap.style.gap = '2px';
          domainWrap.style.width = '100%';

          const domainAttr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
          const transformType = state.pending.transformType ?? 'linear';
          const percentile = isPercentileTransform(transformType);
          const extent = percentile ? { min: 0, max: 1 } : computeScalarExtent(mode, domainAttr);
          const min = extent?.min ?? 0;
          const max = extent?.max ?? 1;
          const isIntegerDomain = Boolean(extent?.isInteger);
          const step = percentile ? 0.01 : suggestStepForRange(min, max, isIntegerDomain);

          if (percentile && (!Array.isArray(state.pending.domain) || state.pending.domain[0] !== 0 || state.pending.domain[1] !== 1)) {
            state.pending = { ...state.pending, type: 'linear', domain: [0, 1] };
          } else if (!Array.isArray(state.pending.domain) && domainAttr) {
            state.pending = { ...state.pending, type: 'linear', domain: [min, max] };
          }
          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : [min, max];

          const slider = createTwoHandleRange({
            min,
            max,
            step,
            value: domain,
            onChange: (next) => {
              state.pending = { ...state.pending, type: 'linear', domain: next };
              setDirty(true);
              d0.value = String(next[0]);
              d1.value = String(next[1]);
            },
          });

          const values = document.createElement('div');
          values.className = 'helios-ui-range2__values';
          const d0 = document.createElement('input');
          d0.type = 'number';
          d0.className = 'helios-ui-number';
          d0.style.maxWidth = '96px';
          const d1 = document.createElement('input');
          d1.type = 'number';
          d1.className = 'helios-ui-number';
          d1.style.maxWidth = '96px';

          d0.value = String(domain[0] ?? min);
          d1.value = String(domain[1] ?? max);

          const commitDomainTyped = () => {
            const a = clampNumber(d0.value);
            const b = clampNumber(d1.value);
            if (a == null || b == null) return;
            let lo = Math.min(a, b);
            let hi = Math.max(a, b);
            if (isIntegerDomain) {
              lo = Math.round(lo);
              hi = Math.round(hi);
            }
            const loSlider = Math.max(min, Math.min(max, lo));
            const hiSlider = Math.max(min, Math.min(max, hi));
            slider.aInput.value = String(loSlider);
            slider.bInput.value = String(hiSlider);
            slider.setVisual(loSlider, hiSlider);
            state.pending = { ...state.pending, type: 'linear', domain: [lo, hi] };
            setDirty(true);
          };
          d0.addEventListener('change', commitDomainTyped);
          d1.addEventListener('change', commitDomainTyped);

          values.appendChild(d0);
          values.appendChild(d1);
          domainWrap.appendChild(slider.element);
          domainWrap.appendChild(values);
          editorBody.appendChild(createAlignedRowEl({ title: 'Domain', controls: domainWrap }).row);

          const rangeWrap = document.createElement('div');
          rangeWrap.style.display = 'grid';
          rangeWrap.style.gap = '6px';
          rangeWrap.style.width = '100%';

          const minAllowed = (() => {
            if (state.channel === 'opacity') return 0;
            if (state.channel === 'size' || state.channel === 'outline' || state.channel === 'width' || state.channel === 'endpointSize') return 0;
            return null;
          })();
          const maxAllowed = state.channel === 'opacity' ? 1 : null;

          const suggestedRange = suggestRangeForChannel(mode, state.channel);
          const stepOut = suggestStepForRange(suggestedRange[0], suggestedRange[1]);

          const range = Array.isArray(state.pending.range) ? state.pending.range : suggestedRange;
          if (!Array.isArray(state.pending.range)) {
            state.pending = { ...state.pending, type: 'linear', range };
          }

          const commitRangeAt = (idx, value) => {
            const n = clampNumber(value, { min: minAllowed, max: maxAllowed });
            if (n == null) return;
            const current = Array.isArray(state.pending.range) ? state.pending.range : suggestedRange;
            const next = [current[0], current[1]];
            next[idx] = n;
            state.pending = { ...state.pending, type: 'linear', range: next };
            setDirty(true);
          };

          const labelStyle = (el) => {
            el.style.fontSize = '12px';
            el.style.color = 'var(--helios-ui-muted)';
          };

          const minLabel = document.createElement('div');
          minLabel.textContent = 'Min';
          labelStyle(minLabel);
          rangeWrap.appendChild(minLabel);
          rangeWrap.appendChild(createSuggestedSliderControls({
            value: Number(range[0] ?? suggestedRange[0]),
            suggested: [suggestedRange[0], suggestedRange[1]],
            step: stepOut,
            inputMin: minAllowed,
            inputMax: maxAllowed,
            onCommit: (v) => commitRangeAt(0, v),
          }).element);

          const maxLabel = document.createElement('div');
          maxLabel.textContent = 'Max';
          labelStyle(maxLabel);
          rangeWrap.appendChild(maxLabel);
          rangeWrap.appendChild(createSuggestedSliderControls({
            value: Number(range[1] ?? suggestedRange[1]),
            suggested: [suggestedRange[0], suggestedRange[1]],
            step: stepOut,
            inputMin: minAllowed,
            inputMax: maxAllowed,
            onCommit: (v) => commitRangeAt(1, v),
          }).element);

          editorBody.appendChild(createAlignedRowEl({ title: 'Range', controls: rangeWrap }).row);
        }

        if (pendingType === 'colormap') {
          const attrSelect = document.createElement('select');
          attrSelect.className = 'helios-ui-select';
          const names = listAttributeNames(mode, { channel: state.channel, mapperType: 'colormap' });
          const current = typeof state.pending.attributes === 'string'
            ? state.pending.attributes
            : (typeof live?.attributes === 'string' ? live.attributes : '');
          const optBlank = document.createElement('option');
          optBlank.value = '';
          optBlank.textContent = names.length ? 'Select attribute…' : 'No attributes';
          attrSelect.appendChild(optBlank);
          for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            attrSelect.appendChild(opt);
          }
          attrSelect.value = names.includes(current) ? current : '';
          attrSelect.addEventListener('change', () => {
            const attr = attrSelect.value || undefined;
            const domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
            state.pending = { ...state.pending, type: 'colormap', attributes: attr, domain };
            setDirty(true);
            renderEditor();
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'Attribute', controls: attrSelect }).row);

          const transformWrap = document.createElement('div');
          transformWrap.style.display = 'flex';
          transformWrap.style.gap = '8px';
          transformWrap.style.alignItems = 'center';

          const transformSelect = document.createElement('select');
          transformSelect.className = 'helios-ui-select';
          for (const optVal of ['linear', 'log', 'log1p', 'logit', 'power', 'percentile']) {
            const opt = document.createElement('option');
            opt.value = optVal;
            opt.textContent = formatTransformLabel(optVal);
            transformSelect.appendChild(opt);
          }
          const resolvedTransformType = state.pending.transformType === 'quantile'
            ? 'percentile'
            : (state.pending.transformType ?? 'linear');
          transformSelect.value = String(resolvedTransformType);

          const powerInput = document.createElement('input');
          powerInput.type = 'number';
          powerInput.className = 'helios-ui-number';
          powerInput.style.maxWidth = '96px';
          powerInput.value = String(Number.isFinite(Number(state.pending.transformPower)) ? state.pending.transformPower : 1);
          powerInput.hidden = transformSelect.value !== 'power';

          transformSelect.addEventListener('change', () => {
            const nextType = transformSelect.value || 'linear';
            const prevType = state.pending.transformType ?? 'linear';
            powerInput.hidden = nextType !== 'power';
            const nextPending = { ...state.pending, type: 'colormap', transformType: nextType };
            if (isPercentileTransform(nextType)) {
              nextPending.domain = [0, 1];
            } else if (isPercentileTransform(prevType)) {
              const attr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
              nextPending.domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
            }
            state.pending = nextPending;
            if (nextType !== 'power') {
              state.pending = { ...state.pending, type: 'colormap', transformPower: undefined };
            } else {
              state.pending = { ...state.pending, type: 'colormap', transformPower: Number(powerInput.value) || 1 };
            }
            setDirty(true);
            renderEditor();
          });

          powerInput.addEventListener('change', () => {
            const p = clampNumber(powerInput.value);
            if (p == null) return;
            state.pending = { ...state.pending, type: 'colormap', transformType: 'power', transformPower: p };
            setDirty(true);
            renderEditor();
          });

          transformWrap.appendChild(transformSelect);
          transformWrap.appendChild(powerInput);
          editorBody.appendChild(createAlignedRowEl({ title: 'Transform', controls: transformWrap }).row);

          const nameWrap = document.createElement('div');
          nameWrap.style.display = 'grid';
          nameWrap.style.gap = '6px';
          const colormapInput = document.createElement('input');
          colormapInput.type = 'text';
          colormapInput.className = 'helios-ui-text';
          colormapInput.placeholder = 'interpolateInferno';
          colormapInput.value = String(state.pending.colormap ?? 'interpolateInferno');

          const datalistId = `helios-ui-colormap-datalist-${Math.random().toString(16).slice(2)}`;
          const datalist = document.createElement('datalist');
          datalist.id = datalistId;
          for (const name of colormapNames) {
            const opt = document.createElement('option');
            opt.value = name;
            datalist.appendChild(opt);
          }
          colormapInput.setAttribute('list', datalistId);
          nameWrap.appendChild(colormapInput);
          nameWrap.appendChild(datalist);

          colormapInput.addEventListener('change', () => {
            state.pending = { ...state.pending, type: 'colormap', colormap: colormapInput.value || 'interpolateInferno' };
            setDirty(true);
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'Colormap', controls: nameWrap }).row);

          const domainWrap = document.createElement('div');
          domainWrap.style.display = 'grid';
          domainWrap.style.gap = '2px';
          domainWrap.style.width = '100%';

          const domainAttr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
          const transformType = state.pending.transformType ?? 'linear';
          const percentile = isPercentileTransform(transformType);
          const allowDivergent = !percentile;
          const divergent = Boolean(state.pending.divergent) && allowDivergent;
          const extent = percentile ? { min: 0, max: 1 } : computeScalarExtent(mode, domainAttr);
          const min = extent?.min ?? 0;
          const max = extent?.max ?? 1;
          const extentAbs = divergent ? Math.max(Math.abs(min), Math.abs(max), 1) : null;
          const sliderMin = divergent ? -extentAbs : min;
          const sliderMax = divergent ? extentAbs : max;
          const isIntegerDomain = Boolean(extent?.isInteger);
          const step = percentile ? 0.01 : suggestStepForRange(sliderMin, sliderMax, isIntegerDomain);

          if (percentile && (!Array.isArray(state.pending.domain) || state.pending.domain[0] !== 0 || state.pending.domain[1] !== 1)) {
            state.pending = { ...state.pending, type: 'colormap', domain: [0, 1] };
          } else if (!Array.isArray(state.pending.domain) && domainAttr) {
            const nextDomain = divergent ? resolveDivergentDomain([min, max], extent) : [min, max];
            state.pending = { ...state.pending, type: 'colormap', domain: nextDomain };
          } else if (divergent && Array.isArray(state.pending.domain)) {
            state.pending = { ...state.pending, type: 'colormap', domain: resolveDivergentDomain(state.pending.domain, extent) };
          }

          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : (divergent ? resolveDivergentDomain([min, max], extent) : [min, max]);

          const slider = createTwoHandleRange({
            min: sliderMin,
            max: sliderMax,
            step,
            value: domain,
            allowRangeDrag: !divergent,
            onChange: (next) => {
              const prevDomain = Array.isArray(state.pending.domain) ? state.pending.domain : domain;
            let nextDomain = divergent ? resolveDivergentDomainFromSlider(next, prevDomain) : next;
            if (isIntegerDomain) {
              nextDomain = [Math.round(nextDomain[0]), Math.round(nextDomain[1])];
            }
            state.pending = { ...state.pending, type: 'colormap', domain: nextDomain };
            setDirty(true);
            d0.value = String(nextDomain[0]);
              d1.value = String(nextDomain[1]);
              if (divergent) {
                slider.aInput.value = String(nextDomain[0]);
                slider.bInput.value = String(nextDomain[1]);
                slider.setVisual(nextDomain[0], nextDomain[1]);
              }
            },
          });

          const values = document.createElement('div');
          values.className = 'helios-ui-range2__values';
          const d0 = document.createElement('input');
          d0.type = 'number';
          d0.className = 'helios-ui-number';
          d0.style.maxWidth = '96px';
          const d1 = document.createElement('input');
          d1.type = 'number';
          d1.className = 'helios-ui-number';
          d1.style.maxWidth = '96px';

          d0.value = String(domain[0] ?? min);
          d1.value = String(domain[1] ?? max);

          const commitDomainTyped = () => {
            const a = clampNumber(d0.value);
            const b = clampNumber(d1.value);
            if (a == null || b == null) return;
            let lo = Math.min(a, b);
            let hi = Math.max(a, b);
            if (isIntegerDomain) {
              lo = Math.round(lo);
              hi = Math.round(hi);
            }
            const maxAbs = divergent ? Math.max(Math.abs(lo), Math.abs(hi)) : null;
            const nextDomain = divergent ? [-maxAbs, maxAbs] : [lo, hi];
            const loSlider = Math.max(sliderMin, Math.min(sliderMax, nextDomain[0]));
            const hiSlider = Math.max(sliderMin, Math.min(sliderMax, nextDomain[1]));
            slider.aInput.value = String(loSlider);
            slider.bInput.value = String(hiSlider);
            slider.setVisual(loSlider, hiSlider);
            state.pending = { ...state.pending, type: 'colormap', domain: nextDomain };
            setDirty(true);
            d0.value = String(nextDomain[0]);
            d1.value = String(nextDomain[1]);
          };
          d0.addEventListener('change', commitDomainTyped);
          d1.addEventListener('change', commitDomainTyped);

          values.appendChild(d0);
          values.appendChild(d1);
          domainWrap.appendChild(slider.element);
          domainWrap.appendChild(values);
          editorBody.appendChild(createAlignedRowEl({
            title: 'Domain',
            controls: domainWrap,
            hint: percentile
              ? 'Percentile range used to map values into the colormap (0 to 1).'
              : (divergent
                ? 'Symmetric range around zero used for divergent colormaps.'
                : 'Input range used to map values into the colormap (min/max).'),
          }).row);

          const advanced = document.createElement('div');
          const divergentInput = createSegmentedToggleControl({
            checked: Boolean(state.pending.divergent) && allowDivergent,
            disabled: !allowDivergent,
            onLabel: 'Divergent',
            offLabel: 'Sequential',
          });

          const clampWrap = document.createElement('div');
          clampWrap.style.display = 'inline-flex';
          clampWrap.style.alignItems = 'center';
          clampWrap.style.gap = '10px';
          const clampState = normalizeClampSetting(state.pending.clamp);
          const clampMinInput = createSegmentedToggleControl({
            checked: clampState.min,
            onLabel: 'Min Clamp',
            offLabel: 'Min Free',
          });
          const clampMaxInput = createSegmentedToggleControl({
            checked: clampState.max,
            onLabel: 'Max Clamp',
            offLabel: 'Max Free',
          });

          clampWrap.appendChild(clampMinInput);
          clampWrap.appendChild(clampMaxInput);

          const alphaSeed = clampNumber(state.pending.alpha ?? 1, { min: 0, max: 1 }) ?? 1;
          const alphaControls = createSuggestedSliderControls({
            value: alphaSeed,
            suggested: [0, 1],
            step: 0.01,
            inputMin: 0,
            inputMax: 1,
            onCommit: (v) => {
              const a = clampNumber(v, { min: 0, max: 1 });
              if (a == null) return;
              state.pending = { ...state.pending, type: 'colormap', alpha: a };
              setDirty(true);
            },
          });

          const commitClamp = () => {
            const nextClamp = { min: clampMinInput.checked, max: clampMaxInput.checked };
            state.pending = { ...state.pending, type: 'colormap', clamp: nextClamp };
            setDirty(true);
          };
          clampMinInput.addEventListener('change', commitClamp);
          clampMaxInput.addEventListener('change', commitClamp);

          divergentInput.addEventListener('change', () => {
            const nextDivergent = divergentInput.checked;
            const fallbackDomain = domainAttr ? suggestDomainForAttribute(mode, domainAttr) : [0, 1];
            const baseDomain = Array.isArray(state.pending.domain) ? state.pending.domain : fallbackDomain;
            const nextDomain = nextDivergent ? resolveDivergentDomain(baseDomain, extent) : fallbackDomain;
            state.pending = { ...state.pending, type: 'colormap', divergent: nextDivergent, domain: nextDomain };
            setDirty(true);
            renderEditor();
          });

          advanced.appendChild(createAlignedRowEl({
            title: 'Divergent',
            controls: divergentInput,
            hint: allowDivergent
              ? 'Lock the domain to a symmetric range around zero (for divergent colormaps).'
              : 'Divergent mode is unavailable for percentile transforms.',
          }).row);

          advanced.appendChild(createAlignedRowEl({
            title: 'Clamp',
            controls: clampWrap,
            hint: 'Clamp values outside the domain to the nearest end of the colormap.',
          }).row);

          advanced.appendChild(createAlignedRowEl({ title: 'Alpha', controls: alphaControls.element }).row);

          const advancedStack = new PanelStack();
          advancedStack.add({ id: `${mode}-mapper-advanced`, title: 'Advanced', collapsed: true, content: advanced });
          editorBody.appendChild(advancedStack.element);
          this._controlCleanups.add(() => advancedStack.destroy());
        }

        if (!isColor && !isScalar && pendingType !== 'passthrough') {
          const note = document.createElement('div');
          note.style.color = 'var(--helios-ui-muted)';
          note.textContent = 'This channel is passthrough-only in the current MVP.';
          editorBody.appendChild(note);
        }

        syncApplyEnabled();
      };

      const resetPendingFromLive = () => {
        if (mode === 'node' && state.channel === 'position') {
          const scheduler = helios?.scheduler ?? null;
          const hasLayout = Boolean(scheduler?.layout);
          const layoutState = typeof scheduler?.getLayoutState === 'function'
            ? scheduler.getLayoutState()
            : (scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
          const layoutEnabled = hasLayout && layoutState !== 'stopped';
          state.pending = layoutEnabled ? { name: state.channel, type: 'layout' } : (resolveLiveConfig(mode, state.channel) ?? { name: state.channel });
        } else {
          state.pending = resolveLiveConfig(mode, state.channel) ?? { name: state.channel };
        }
        setDirty(false);
        renderEditor();
      };

      const setChannel = (next) => {
        if (!channels.includes(next)) return;
        state.channel = next;
        resetPendingFromLive();
      };

      revertButton.addEventListener('click', () => {
        resetPendingFromLive();
      });

      applyButton.addEventListener('click', () => {
        if (!state.pending) return;

        if (mode === 'node' && state.channel === 'position') {
          if (state.pending.type === 'layout') {
            helios?.startLayout?.();
            setDirty(false);
            return;
          }
          helios?.stopLayout?.('ui:mappers');
        }

        const ok = applyConfig(mode, state.channel, state.pending);
        if (ok) {
          if (
            mode === 'node' &&
            state.channel === 'outlineColor' &&
            (state.pending.type ?? state.pending.mode) === 'constant' &&
            typeof helios?.nodeOutlineColor === 'function'
          ) {
            try {
              helios.nodeOutlineColor(state.pending.value);
            } catch {
              // Ignore invalid color inputs; mapper validation covers common cases.
            }
          }

          if (mode === 'node' && (state.channel === 'outline' || state.channel === 'outlineColor')) {
            const outlineCfg = resolveLiveConfig('node', 'outline');
            const outlineColorCfg = resolveLiveConfig('node', 'outlineColor');
            const outlineType = outlineCfg?.type ?? outlineCfg?.mode ?? null;
            const outlineColorType = outlineColorCfg?.type ?? outlineColorCfg?.mode ?? null;
            const bothConstant = outlineType === 'constant' && outlineColorType === 'constant';
            if (typeof helios?.nodeOutlineUseAttributes === 'function') {
              helios.nodeOutlineUseAttributes(!bothConstant);
            }
          }
          setDirty(false);
        }
      });

      resetPendingFromLive();
      return { root, state, channels, setChannel };
    };

    const nodeTab = createModeTab('node');
    const edgeTab = createModeTab('edge');

    let activeMode = 'node';

    const channelSelect = document.createElement('select');
    channelSelect.className = 'helios-ui-select helios-ui-select--compact';

    const getActiveTab = () => (activeMode === 'edge' ? edgeTab : nodeTab);

    const syncChannelSelect = () => {
      const { channels, state } = getActiveTab();
      channelSelect.textContent = '';
      for (const name of channels) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = CHANNEL_LABELS[name] ?? name;
        channelSelect.appendChild(opt);
      }
      channelSelect.value = channels.includes(state.channel) ? state.channel : channels[0];
    };

    channelSelect.addEventListener('change', () => {
      const tab = getActiveTab();
      tab.setChannel(channelSelect.value);
      syncChannelSelect();
    });

    syncChannelSelect();

    return this.createTabbedPanel({
      id: options.id ?? 'helios-ui-mappers',
      title: options.title ?? 'Mappers',
      position: options.position ?? { x: 16, y: 120 },
      dock: options.dock ?? 'top-left',
      barRight: channelSelect,
      onActiveChanged: (tabId) => {
        activeMode = tabId === 'edges' ? 'edge' : 'node';
        syncChannelSelect();
      },
      tabs: [
        { id: 'nodes', title: 'Nodes', content: nodeTab.root },
        { id: 'edges', title: 'Edges', content: edgeTab.root },
      ],
    });
  }

  createLayoutPanel(options = {}) {
    return new LayoutPanel(this, options).create();
  }

  createLegendsPanel(options = {}) {
    return new LegendsPanel(this, options).create();
  }

  createCameraPanel(options = {}) {
    return new CameraPanel(this, options).create();
  }

  createSelectionPanel(options = {}) {
    return new SelectionPanel(this, options).create();
  }
}
