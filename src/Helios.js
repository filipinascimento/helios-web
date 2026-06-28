/** @typedef {import('helios-network').default} HeliosNetwork */
import { AttributeType } from 'helios-network';
import { LayerManager } from './layers/LayerManager.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { StaticLayout, WorkerLayout } from './layouts/Layout.js';
import { D3Force3DLayout } from './layouts/d3force3dLayoutWorker.js';
import { GpuForceLayout } from './layouts/GpuForceLayout.js';
import { createRenderer } from './rendering/createRenderer.js';
import { resolveSupersamplingPreset, supersamplingPresetToOption } from './rendering/qualityOptions.js';
import {
  CameraTransitionController,
  applyCameraPose,
  captureCameraPose,
  createYawPitchQuaternion,
  interpolateCameraPose,
  mergeCameraPose,
} from './rendering/CameraTransitionController.js';
import { AttributeTracker } from './rendering/AttributeTracker.js';
import { PerformanceMonitor } from './utilities/PerformanceMonitor.js';
import { bumpCounter } from './utilities/counters.js';
import { VisualAttributes } from './pipeline/VisualAttributes.js';
import { createDefaultMappers, MapperCollection } from './pipeline/Mapper.js';
import { createDebugLogger } from './utilities/DebugLogger.js';
import { PositionDelegate } from './delegates/PositionDelegate.js';
import { DEFAULT_NODE_OUTLINE_WIDTH, DEFAULT_NODE_SIZE, VISUAL_ATTRIBUTE_NAMES } from './pipeline/constants.js';
import { SvgLabelController } from './labels/SvgLabelController.js';
import { SvgLegendController } from './legends/SvgLegendController.js';
import { HeliosFilter } from './filters/HeliosFilter.js';
import { DensityLayer } from './rendering/engine/DensityLayer.js';
import { HeliosUI } from './ui/HeliosUI.js';
import { BEHAVIOR_IDS, Behavior, BehaviorManager, createDefaultBehaviorRegistry } from './behaviors/index.js';
import { serializeMapperCollection as serializeMapperCollectionSnapshot } from './behaviors/mapperBehaviorShared.js';
import {
  PERSISTENCE_KINDS,
  createDefaultNetworkSource,
  createDefaultPreferencesState,
  createPersistenceEnvelope,
  migratePersistenceEnvelope,
  parsePersistenceEnvelope,
  serializePersistenceEnvelope,
} from './persistence/index.js';
import { createHeliosStorageManager } from './storage/index.js';
import { HeliosStateManager, valuesEqual } from './state/index.js';
import {
  AMBIENT_OCCLUSION_BIAS_DEFAULT,
  AMBIENT_OCCLUSION_INTENSITY_SCALE_DEFAULT,
  AMBIENT_OCCLUSION_INTENSITY_SHIFT_DEFAULT,
  AMBIENT_OCCLUSION_MODE_DEFAULT,
  AMBIENT_OCCLUSION_QUALITY_DEFAULT,
  AMBIENT_OCCLUSION_RADIUS_DEFAULT,
  AMBIENT_OCCLUSION_STRENGTH_DEFAULT,
  SHADED_AMBIENT_STRENGTH_DEFAULT,
  SHADED_LIGHT_DIRECTION_DEFAULT,
  SHADED_LIGHT_COLOR_DEFAULT,
  SHADED_AMBIENT_TOP_COLOR_DEFAULT,
  SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT,
  SHADED_DIFFUSE_STRENGTH_DEFAULT,
  SHADED_SPECULAR_COLOR_DEFAULT,
  SHADED_SPECULAR_STRENGTH_DEFAULT,
  SHADED_SHININESS_DEFAULT,
} from './rendering/engine/GraphLayer.js';
import { normalizeAmbientOcclusionMode } from './rendering/engine/AmbientOcclusionMode.js';
import { normalizeAmbientOcclusionQuality } from './rendering/engine/AmbientOcclusionQuality.js';
import {
  buildFigureExportPresetList,
  getFigureExportCapability,
  resolveFigureExportOptions,
  resolveFigureRelativeOverlayScale,
  resolveFigurePreviewThumbnailOptions,
} from './export/figureExport.js';
import { classifyGestureForSuppression } from './rendering/touchGestureMath.js';

const {
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;
const DEFAULT_CAMERA_FIT_NODE_RADIUS_WORLD = 0;
const DEFAULT_LAYOUT_RUNTIME_POSITION_LIMIT_BYTES = 2 * 1024 * 1024;

const UMAP_FORCE_FLAG_ATTRIBUTE = 'umap';
const DEFAULT_UMAP_EDGE_WEIGHT_ATTRIBUTE = 'umap_weight';
const DEFAULT_UMAP_NODE_MASS_ATTRIBUTE = 'umap_mass';
const RANDOM_LAYOUT_POSITION_CHOICE = '$random';
const DEFAULT_UMAP_FORCE_OPTIONS = Object.freeze({
  umapA: 1.5769434601962196,
  umapB: 0.8950608779914887,
  umapGamma: 1,
  umapNegativeSampleRate: 5,
  umapNeighborCount: 15,
  umapEpochs: null,
});

function createPickingGestureState() {
  return {
    active: false,
    moved: false,
    cameraMoved: false,
    wheelZoomed: false,
    lastWheelAt: -Infinity,
    lastCameraMoveAt: -Infinity,
    lastTouchAt: -Infinity,
    lastTapAt: -Infinity,
    lastTapClientX: 0,
    lastTapClientY: 0,
    suppressNativeClickUntil: -Infinity,
    pointers: new Map(),
  };
}

function isLayoutInstance(candidate) {
  return candidate && typeof candidate.step === 'function' && typeof candidate.initialize === 'function';
}

function uint8ArrayToBase64(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length <= 0) return '';
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8Array(value) {
  if (typeof value !== 'string' || value.length <= 0) return null;
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(value, 'base64'));
  }
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeFloat32ArrayBase64(values) {
  if (!(values instanceof Float32Array) || values.length <= 0) return null;
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  return uint8ArrayToBase64(bytes);
}

function decodeFloat32ArrayBase64(value, expectedLength = null) {
  const bytes = base64ToUint8Array(value);
  if (!bytes || bytes.byteLength <= 0 || bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) return null;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const view = new Float32Array(copy.buffer);
  if (expectedLength != null && view.length !== Number(expectedLength)) return null;
  return view;
}

function forEachIndex(indices, visitor) {
  if (indices == null) return;
  if (typeof indices === 'number') {
    visitor(indices);
    return;
  }
  if (Array.isArray(indices) || ArrayBuffer.isView(indices)) {
    for (let i = 0; i < indices.length; i += 1) visitor(indices[i]);
    return;
  }
  if (typeof indices[Symbol.iterator] === 'function') {
    for (const index of indices) visitor(index);
  }
}

function parseNamespacedEventType(type) {
  if (typeof type !== 'string') {
    throw new TypeError('Event type must be a string');
  }
  const trimmed = type.trim();
  if (!trimmed) {
    throw new Error('Event type cannot be empty');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('Namespaced event types cannot contain whitespace');
  }
  const dot = trimmed.indexOf('.');
  if (dot === -1) return { type: trimmed, namespace: '' };
  const base = trimmed.slice(0, dot);
  const namespace = trimmed.slice(dot + 1);
  if (!base) {
    throw new Error('Namespaced event types must include a base type before the "."');
  }
  return { type: base, namespace };
}

function resolveStateMask(mask, states) {
  if (typeof mask === 'string' && mask === 'HOVER') return 0;
  if (typeof mask === 'string') {
    const value = states?.[mask];
    if (value == null) {
      throw new Error(`Unknown state name "${mask}"`);
    }
    return value;
  }
  if (Array.isArray(mask)) {
    let combined = 0;
    for (const entry of mask) {
      combined |= (Number(resolveStateMask(entry, states)) >>> 0);
    }
    return combined >>> 0;
  }
  return mask;
}

function resolveStateSlot(slot, states) {
  if (typeof slot !== 'string') return slot;
  const mask = Number(resolveStateMask(slot, states)) >>> 0;
  if (!mask || (mask & (mask - 1)) !== 0) {
    throw new Error(`State "${slot}" must map to a single-bit mask to be used as a style slot`);
  }
  return 31 - Math.clz32(mask);
}

function normalizeColorInput(color) {
  if (color == null) return null;
  if (Array.isArray(color) || ArrayBuffer.isView(color)) {
    const r = Number(color[0]);
    const g = Number(color[1]);
    const b = Number(color[2]);
    const a = color.length >= 4 ? Number(color[3]) : 1;
    if (![r, g, b, a].every(Number.isFinite)) return null;
    const max = Math.max(r, g, b, a);
    if (max > 1.0) {
      return [r / 255, g / 255, b / 255, a / 255];
    }
    return [r, g, b, a];
  }
  if (typeof color === 'string') {
    const hex = color.trim();
    if (!hex.startsWith('#')) return null;
    const raw = hex.slice(1);
    const expand = (c) => `${c}${c}`;
    let r = 0; let g = 0; let b = 0; let a = 255;
    if (raw.length === 3 || raw.length === 4) {
      r = parseInt(expand(raw[0]), 16);
      g = parseInt(expand(raw[1]), 16);
      b = parseInt(expand(raw[2]), 16);
      if (raw.length === 4) a = parseInt(expand(raw[3]), 16);
    } else if (raw.length === 6 || raw.length === 8) {
      r = parseInt(raw.slice(0, 2), 16);
      g = parseInt(raw.slice(2, 4), 16);
      b = parseInt(raw.slice(4, 6), 16);
      if (raw.length === 8) a = parseInt(raw.slice(6, 8), 16);
    } else {
      return null;
    }
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return [r / 255, g / 255, b / 255, a / 255];
  }
  return null;
}

function normalizeDirectionInput(direction, fallback = SHADED_LIGHT_DIRECTION_DEFAULT) {
  if (!(Array.isArray(direction) || ArrayBuffer.isView(direction))) return [...fallback];
  const x = Number(direction[0]);
  const y = Number(direction[1]);
  const z = Number(direction[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return [...fallback];
  const length = Math.hypot(x, y, z);
  if (!(length > 1e-6)) return [...fallback];
  return [x / length, y / length, z / length];
}

function cloneColorInput(value, fallback) {
  const normalized = normalizeColorInput(value);
  return normalized ? [...normalized] : [...fallback];
}

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (ArrayBuffer.isView(value)) return Array.from(value, (entry) => cloneSerializable(entry));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = cloneSerializable(entry);
    return next;
  }
  return value;
}

function arrayLikeValuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!(Array.isArray(a) || ArrayBuffer.isView(a)) || !(Array.isArray(b) || ArrayBuffer.isView(b))) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(Number(a[i]), Number(b[i]))) return false;
  }
  return true;
}

function cameraPoseValuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const arrayFields = new Set(['target', 'pan2D', 'pan3D', 'rotation', 'viewport']);
  const scalarFields = new Set(['mode', 'projection', 'zoom', 'distance']);
  for (const field of scalarFields) {
    if (!Object.is(a[field], b[field])) return false;
  }
  for (const field of arrayFields) {
    if (!arrayLikeValuesEqual(a[field] ?? [], b[field] ?? [])) return false;
  }
  const knownFields = new Set([...scalarFields, ...arrayFields]);
  const extraA = Object.keys(a).filter((key) => !knownFields.has(key));
  const extraB = Object.keys(b).filter((key) => !knownFields.has(key));
  if (extraA.length !== extraB.length) return false;
  for (const key of extraA) {
    if (!Object.prototype.hasOwnProperty.call(b, key) || !valuesEqual(a[key], b[key])) return false;
  }
  return true;
}

function normalizeInsets(insets) {
  if (!insets || typeof insets !== 'object') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const coerce = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  };
  return {
    top: coerce(insets.top),
    right: coerce(insets.right),
    bottom: coerce(insets.bottom),
    left: coerce(insets.left),
  };
}

function mergeOverlayInsets(...entries) {
  const next = { top: 0, right: 0, bottom: 0, left: 0 };
  for (const entry of entries) {
    const insets = normalizeInsets(entry);
    next.top = Math.max(next.top, insets.top);
    next.right = Math.max(next.right, insets.right);
    next.bottom = Math.max(next.bottom, insets.bottom);
    next.left = Math.max(next.left, insets.left);
  }
  return next;
}

function createDetailEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
  if (typeof Event === 'function') {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

function cloneMapperCollection(previous, network, onChange, debug) {
  const collection = new MapperCollection(previous?.mode ?? 'node', network, onChange, debug);
  if (!previous?.mappers || previous.mappers.size === 0) {
    return collection;
  }
  collection.mappers.clear();
  collection.defaultMapper = null;
  for (const [key, mapper] of previous.mappers.entries()) {
    const cloned = collection.createMapper(key);
    for (const [channelName, config] of mapper?.channels?.entries?.() ?? []) {
      if (!channelName || !config) continue;
      cloned.setChannel(channelName, { ...config, attributes: config.attributes ?? config.from });
    }
    if (!collection.defaultMapper && (key === 'default' || mapper === previous.defaultMapper)) {
      collection.defaultMapper = cloned;
    }
  }
  if (!collection.defaultMapper) {
    collection.defaultMapper = collection.mappers.get('default') ?? collection.mappers.values().next().value ?? null;
  }
  return collection;
}

function serializeMapperCollectionState(collection) {
  return serializeMapperCollectionSnapshot(collection);
}

function inferNetworkFormatFromName(name) {
  if (typeof name !== 'string') return null;
  const lower = name.trim().toLowerCase();
  if (lower.endsWith('.bxnet')) return 'bxnet';
  if (lower.endsWith('.zxnet')) return 'zxnet';
  if (lower.endsWith('.xnet')) return 'xnet';
  if (lower.endsWith('.gml')) return 'gml';
  if (lower.endsWith('.gt.zst')) return 'gt';
  if (lower.endsWith('.gt')) return 'gt';
  return null;
}

function normalizeNetworkFileDropOptions(value) {
  if (value === true) {
    return {
      enabled: true,
      target: 'root',
      supportedFormats: ['bxnet', 'zxnet', 'xnet', 'gml', 'gt'],
      replaceOptions: { disposeOld: true, recreateRenderer: true, keepCamera: false },
    };
  }
  if (!value || typeof value !== 'object' || value.enabled === false) return { enabled: false };
  const formats = Array.isArray(value.supportedFormats)
    ? value.supportedFormats.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)
    : ['bxnet', 'zxnet', 'xnet', 'gml', 'gt'];
  return {
    enabled: true,
    target: value.target ?? 'root',
    supportedFormats: formats,
    replaceOptions: {
      disposeOld: true,
      recreateRenderer: true,
      keepCamera: false,
      ...(value.replaceOptions && typeof value.replaceOptions === 'object' ? value.replaceOptions : {}),
    },
    overlayTitle: typeof value.overlayTitle === 'string' ? value.overlayTitle : 'Drop a network file here',
    overlaySubtitle: typeof value.overlaySubtitle === 'string'
      ? value.overlaySubtitle
      : `Supported formats: ${formats.map((fmt) => `.${fmt}`).join(', ')}`,
  };
}

function hasOwnOption(options, key) {
  return Object.prototype.hasOwnProperty.call(options ?? {}, key);
}

function hasOwnStringOption(options, key) {
  return hasOwnOption(options, key) && typeof options?.[key] === 'string' && options[key].trim().length > 0;
}

const DEFAULT_DARK_CLEAR_COLOR = Object.freeze([0.01, 0.01, 0.02, 1]);
const DEFAULT_LIGHT_CLEAR_COLOR = Object.freeze([1, 1, 1, 1]);

function normalizeThemeName(value) {
  if (typeof value !== 'string') return null;
  const theme = value.trim().toLowerCase();
  if (!theme) return null;
  if (theme === 'light' || theme === 'default') return 'light';
  if (theme === 'dark' || theme === 'slate') return 'dark';
  return null;
}

function resolveThemeValueFromElement(element) {
  if (!element || typeof element.closest !== 'function') return null;
  const source = element.closest('[data-helios-theme], [data-theme], [data-md-color-scheme]');
  if (!source || typeof source.getAttribute !== 'function') return null;
  return normalizeThemeName(
    source.getAttribute('data-helios-theme')
    ?? source.getAttribute('data-theme')
    ?? source.getAttribute('data-md-color-scheme'),
  );
}

function resolveThemeValueFromDocument() {
  if (typeof document === 'undefined') return null;
  const roots = [document.documentElement, document.body].filter(Boolean);
  for (const root of roots) {
    const theme = normalizeThemeName(
      root.getAttribute?.('data-helios-theme')
      ?? root.getAttribute?.('data-theme')
      ?? root.getAttribute?.('data-md-color-scheme'),
    );
    if (theme) return theme;
  }
  return null;
}

function resolveContainerElement(container) {
  if (typeof document === 'undefined') return null;
  if (typeof container === 'string') {
    try {
      return document.querySelector(container);
    } catch (_) {
      return null;
    }
  }
  return container && typeof container === 'object' && container.nodeType === 1 ? container : null;
}

function resolveBrowserTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  try {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  } catch (_) {
    return null;
  }
  return null;
}

function resolveInitialTheme(options = {}, container = null) {
  const uiOptions = options.ui && typeof options.ui === 'object' ? options.ui : {};
  const quickOptions = options.quickControls && typeof options.quickControls === 'object'
    ? options.quickControls
    : {};
  const explicitTheme = normalizeThemeName(options.theme)
    ?? normalizeThemeName(uiOptions.theme)
    ?? normalizeThemeName(quickOptions.theme);
  if (explicitTheme) return explicitTheme;
  const containerElement = resolveContainerElement(container);
  return resolveThemeValueFromElement(containerElement)
    ?? resolveThemeValueFromDocument()
    ?? resolveBrowserTheme()
    ?? 'dark';
}

function hasExplicitThemeOption(options = {}) {
  const uiOptions = options.ui && typeof options.ui === 'object' ? options.ui : {};
  const quickOptions = options.quickControls && typeof options.quickControls === 'object'
    ? options.quickControls
    : {};
  return hasOwnStringOption(options, 'theme')
    || hasOwnStringOption(uiOptions, 'theme')
    || hasOwnStringOption(quickOptions, 'theme');
}

function copyDefaultClearColorForTheme(theme) {
  return [...(theme === 'light' ? DEFAULT_LIGHT_CLEAR_COLOR : DEFAULT_DARK_CLEAR_COLOR)];
}

function normalizeInitialClearColorOptions(options = {}, theme = 'dark') {
  const hasClearColor = hasOwnOption(options, 'clearColor');
  const hasBackground = hasOwnOption(options, 'background');
  if (hasClearColor || hasBackground) {
    const color = hasClearColor ? options.clearColor : options.background;
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('Helios options.clearColor/background expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    options.clearColor = normalized;
    return normalized;
  }
  options.clearColor = copyDefaultClearColorForTheme(theme);
  return options.clearColor;
}

function shouldDisableAutoThemeDefault(detail = {}) {
  const source = String(detail.source ?? '').trim();
  const reason = String(detail.reason ?? '').trim();
  if (source === 'default' || source === 'binding' || source === 'refresh') return false;
  if (reason === 'auto-theme' || reason.startsWith('auto-theme:')) return false;
  return source === 'restore'
    || source === 'ui'
    || source === 'program'
    || source === 'cli'
    || source === 'state'
    || detail.explicit === true
    || detail.trackOverride === true
    || detail.overrideChanged === true;
}

function shouldEnablePersistence(options = {}) {
  if (options.storage === true) return true;
  if (options.storage && typeof options.storage === 'object') {
    const type = String(options.storage.type ?? options.storage.kind ?? '').toLowerCase();
    if (type !== 'dummy' && type !== 'memory') return true;
  }
  return [
    'workspaceId',
    'networkPersistence',
    'positionPersistence',
    'session',
    'sessionId',
  ].some((key) => hasOwnOption(options, key) && options[key] !== false && options[key] != null);
}

function normalizeSessionPersistenceOptions(options = {}) {
  if (options.session === false) return false;
  const topLevelSessionId = options.sessionId != null && String(options.sessionId).trim()
    ? { sessionId: String(options.sessionId).trim() }
    : {};
  if (typeof options.session === 'string' && options.session.trim()) return { sessionId: options.session.trim() };
  if (options.session === true) return { ...topLevelSessionId };
  if (options.session && typeof options.session === 'object') {
    return {
      ...options.session,
      ...topLevelSessionId,
    };
  }
  if (topLevelSessionId.sessionId) return { ...topLevelSessionId };
  return false;
}

function normalizeStorageSessionId(options = {}) {
  const storage = options.storage;
  if (!storage || typeof storage !== 'object') return null;
  const value = storage.sessionId ?? storage.id ?? null;
  return value != null && String(value).trim() ? String(value).trim() : null;
}

const CAMERA_CONTROL_STATE_KEYS = Object.freeze([
  'autoFit',
  'autoFitCoverage',
  'autoFitPaddingRatio',
  'autoFitMaxSamples',
  'autoFitIntervalMs',
  'autoFitMinIntervalMs',
  'autoFitMaxIntervalMs',
  'autoFitLargeNetworkScale',
  'autoFitIntervalNodeCountRef',
  'largeNetworkStartupFit',
  'largeNetworkStartupNodeThreshold',
  'largeNetworkStartupEdgeThreshold',
  'largeNetworkStartupScale',
  'largeNetworkStartupDurationMs',
  'animation',
  'animationDurationMs',
  'orbit',
  'orbitSpeed',
  'orbitDirection',
  'orbitAxis',
  'orbitAngle',
  'followTarget',
  'followUpdateIntervalMs',
  'targetNodeIndices',
]);

function isExplicitCameraStateSource(source, options = {}) {
  const value = String(source ?? '').trim();
  return value === 'ui' || value === 'interaction' || value === 'cli' || value === 'program' || options.manual === true;
}

function isBehaviorLike(candidate) {
  return candidate instanceof Behavior || Boolean(candidate && typeof candidate.attach === 'function');
}

function createBehaviorNamespace(helios) {
  const behaviorAccessor = function behavior(name) {
    return helios.getBehavior(name);
  };
  return new Proxy(behaviorAccessor, {
    apply(_target, _thisArg, args) {
      return helios.getBehavior(args[0]);
    },
    get(target, prop, receiver) {
      if (typeof prop !== 'string' || Reflect.has(target, prop)) {
        return Reflect.get(target, prop, receiver);
      }
      return helios.getBehavior(prop);
    },
  });
}

function elementToMarkup(element) {
  if (!element) return '';
  return new XMLSerializer().serializeToString(element);
}

function normalizeExportPixels(pixels, width, height, options = {}) {
  const source = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels);
  const normalized = new Uint8ClampedArray(width * height * 4);
  const flipY = options.flipY === true;
  const swizzleBGRA = options.swizzleBGRA === true;
  const alphaMode = String(options.alphaMode ?? 'straight').trim().toLowerCase();
  for (let row = 0; row < height; row += 1) {
    const srcRow = flipY ? (height - 1 - row) : row;
    for (let col = 0; col < width; col += 1) {
      const srcOffset = (srcRow * width + col) * 4;
      const dstOffset = (row * width + col) * 4;
      let red;
      let green;
      let blue;
      const alpha = source[srcOffset + 3];
      if (swizzleBGRA) {
        red = source[srcOffset + 2];
        green = source[srcOffset + 1];
        blue = source[srcOffset];
      } else {
        red = source[srcOffset];
        green = source[srcOffset + 1];
        blue = source[srcOffset + 2];
      }
      if (alphaMode === 'straight') {
        if (alpha <= 0) {
          red = 0;
          green = 0;
          blue = 0;
        } else if (alpha < 255) {
          const scale = 255 / alpha;
          red = Math.min(255, Math.round(red * scale));
          green = Math.min(255, Math.round(green * scale));
          blue = Math.min(255, Math.round(blue * scale));
        }
      }
      normalized[dstOffset] = red;
      normalized[dstOffset + 1] = green;
      normalized[dstOffset + 2] = blue;
      normalized[dstOffset + 3] = alpha;
    }
  }
  return normalized;
}

function pixelsToCanvas(pixels, width, height, outputWidth, outputHeight, options = {}) {
  const normalizedPixels = normalizeExportPixels(pixels, width, height, options);
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = Math.max(1, width);
  fullCanvas.height = Math.max(1, height);
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
  if (!fullCtx) throw new Error('Unable to create a 2D canvas context for figure export');
  fullCtx.putImageData(new ImageData(normalizedPixels, width, height), 0, 0);

  if (width === outputWidth && height === outputHeight) {
    return fullCanvas;
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(1, outputWidth);
  outputCanvas.height = Math.max(1, outputHeight);
  const outputCtx = outputCanvas.getContext('2d');
  if (!outputCtx) throw new Error('Unable to create an output canvas for figure export');
  outputCtx.imageSmoothingEnabled = true;
  if (typeof outputCtx.imageSmoothingQuality !== 'undefined') outputCtx.imageSmoothingQuality = 'high';
  outputCtx.drawImage(fullCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
  return outputCanvas;
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Failed to encode figure as ${type}`));
    }, type);
  });
}

function scaledCanvasThumbnailBlob(sourceCanvas, options = {}) {
  if (!sourceCanvas || typeof document === 'undefined') return null;
  const sourceWidth = Math.floor(Number(sourceCanvas.width) || 0);
  const sourceHeight = Math.floor(Number(sourceCanvas.height) || 0);
  if (sourceWidth <= 0 || sourceHeight <= 0) return null;
  const maxWidth = Math.max(1, Math.floor(Number(options.maxWidth ?? options.width) || 320));
  const maxHeight = Math.max(1, Math.floor(Number(options.maxHeight ?? options.height) || 180));
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const ctx = outputCanvas.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  if (typeof ctx.imageSmoothingQuality !== 'undefined') ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  return canvasToBlob(outputCanvas, 'image/png');
}

function loadSvgImage(svgText) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error instanceof Error ? error : new Error('Failed to rasterize SVG overlay'));
    };
    image.src = url;
  });
}

const ILLUSTRATOR_EXPORT_FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function resolveExportBackgroundColor(backgroundColor) {
  const source = Array.isArray(backgroundColor) ? backgroundColor : [1, 1, 1, 1];
  const red = Math.max(0, Math.min(255, Math.round(Number(source[0] ?? 0) * 255)));
  const green = Math.max(0, Math.min(255, Math.round(Number(source[1] ?? 0) * 255)));
  const blue = Math.max(0, Math.min(255, Math.round(Number(source[2] ?? 0) * 255)));
  return {
    red,
    green,
    blue,
    css: `rgb(${red} ${green} ${blue})`,
  };
}

function buildExportLogicalViewport(options = {}) {
  const width = Math.max(
    1,
    Number(options.logicalWidth ?? options.width ?? options.bitmapWidth ?? options.previewRect?.width ?? 1),
  );
  const height = Math.max(
    1,
    Number(options.logicalHeight ?? options.height ?? options.bitmapHeight ?? options.previewRect?.height ?? 1),
  );
  const bitmapWidth = Math.max(1, Number(options.bitmapWidth ?? width));
  const bitmapHeight = Math.max(1, Number(options.bitmapHeight ?? height));
  const devicePixelRatio = Math.max(
    1,
    Number(options.devicePixelRatio ?? Math.max(bitmapWidth / width, bitmapHeight / height, 1)),
  );
  return { width, height, devicePixelRatio };
}

function createMat4Identity() {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

function safeSignedDivisor(value, epsilon = 1e-12) {
  if (!Number.isFinite(value)) return epsilon;
  if (Math.abs(value) >= epsilon) return value;
  return value < 0 ? -epsilon : epsilon;
}

function mat4Multiply(out, a, b) {
  const a00 = a[0];
  const a01 = a[1];
  const a02 = a[2];
  const a03 = a[3];
  const a10 = a[4];
  const a11 = a[5];
  const a12 = a[6];
  const a13 = a[7];
  const a20 = a[8];
  const a21 = a[9];
  const a22 = a[10];
  const a23 = a[11];
  const a30 = a[12];
  const a31 = a[13];
  const a32 = a[14];
  const a33 = a[15];

  const b00 = b[0];
  const b01 = b[1];
  const b02 = b[2];
  const b03 = b[3];
  const b10 = b[4];
  const b11 = b[5];
  const b12 = b[6];
  const b13 = b[7];
  const b20 = b[8];
  const b21 = b[9];
  const b22 = b[10];
  const b23 = b[11];
  const b30 = b[12];
  const b31 = b[13];
  const b32 = b[14];
  const b33 = b[15];

  out[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;
  out[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;
  out[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;
  out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
  out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
  out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
  out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
  return out;
}

function mat4Frustum(out, left, right, bottom, top, near, far) {
  const rl = 1 / safeSignedDivisor(right - left);
  const tb = 1 / safeSignedDivisor(top - bottom);
  const nf = 1 / safeSignedDivisor(near - far);
  out[0] = (2 * near) * rl;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = (2 * near) * tb;
  out[6] = 0;
  out[7] = 0;
  out[8] = (right + left) * rl;
  out[9] = (top + bottom) * tb;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = (2 * far * near) * nf;
  out[15] = 0;
  return out;
}

function mat4Ortho(out, left, right, bottom, top, near, far) {
  const lr = 1 / safeSignedDivisor(left - right);
  const bt = 1 / safeSignedDivisor(bottom - top);
  const nf = 1 / safeSignedDivisor(near - far);
  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 2 * nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

function interpolateFrameBounds(bounds, previewRect, liveViewport) {
  const liveWidth = Math.max(1, Number(liveViewport?.width ?? 1));
  const liveHeight = Math.max(1, Number(liveViewport?.height ?? 1));
  const x = Math.min(Math.max(0, Number(previewRect?.x ?? 0)), liveWidth);
  const y = Math.min(Math.max(0, Number(previewRect?.y ?? 0)), liveHeight);
  const width = Math.min(
    Math.max(1e-6, Number(previewRect?.width ?? liveWidth)),
    Math.max(1e-6, liveWidth - x),
  );
  const height = Math.min(
    Math.max(1e-6, Number(previewRect?.height ?? liveHeight)),
    Math.max(1e-6, liveHeight - y),
  );

  const u0 = x / liveWidth;
  const u1 = (x + width) / liveWidth;
  const v0 = y / liveHeight;
  const v1 = (y + height) / liveHeight;

  return {
    left: bounds.left + ((bounds.right - bounds.left) * u0),
    right: bounds.left + ((bounds.right - bounds.left) * u1),
    top: bounds.top + ((bounds.bottom - bounds.top) * v0),
    bottom: bounds.top + ((bounds.bottom - bounds.top) * v1),
  };
}

function derivePerspectiveBounds(projectionMatrix, near) {
  const m00 = Number(projectionMatrix?.[0] ?? 0);
  const m11 = Number(projectionMatrix?.[5] ?? 0);
  const m20 = Number(projectionMatrix?.[8] ?? 0);
  const m21 = Number(projectionMatrix?.[9] ?? 0);
  if (!Number.isFinite(m00) || !Number.isFinite(m11) || Math.abs(m00) < 1e-12 || Math.abs(m11) < 1e-12) {
    return null;
  }
  return {
    left: near * ((m20 - 1) / m00),
    right: near * ((m20 + 1) / m00),
    bottom: near * ((m21 - 1) / m11),
    top: near * ((m21 + 1) / m11),
  };
}

function deriveOrthographicBounds(projectionMatrix) {
  const m00 = Number(projectionMatrix?.[0] ?? 0);
  const m11 = Number(projectionMatrix?.[5] ?? 0);
  const m30 = Number(projectionMatrix?.[12] ?? 0);
  const m31 = Number(projectionMatrix?.[13] ?? 0);
  if (!Number.isFinite(m00) || !Number.isFinite(m11) || Math.abs(m00) < 1e-12 || Math.abs(m11) < 1e-12) {
    return null;
  }
  return {
    left: (-1 - m30) / m00,
    right: (1 - m30) / m00,
    bottom: (-1 - m31) / m11,
    top: (1 - m31) / m11,
  };
}

function normalizeTruthyNetworkFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number(value) !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (['1', 'true', 'yes', 'y', 'on', 'enabled', 'umap'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
  }
  return false;
}

function normalizeForceModel(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'umap') return 'umap';
  if (normalized === 'linear' || normalized === 'force' || normalized === 'gpu-force') return 'linear';
  return null;
}

function readNetworkAttributeValue(network, name) {
  if (!network || typeof name !== 'string' || !name.trim()) return undefined;
  const info = network.getNetworkAttributeInfo?.(name) ?? null;
  if (!info || Number(info.dimension ?? 1) !== 1) return undefined;
  if (Number(info.type) === AttributeType.String || Number(info.type) === AttributeType.Category) {
    return network.getNetworkStringAttribute?.(name);
  }
  let value;
  const read = () => {
    const buffer = network.getNetworkAttributeBuffer?.(name) ?? null;
    value = buffer?.view?.[0];
  };
  try {
    if (typeof network.withBufferAccess === 'function') network.withBufferAccess(read);
    else read();
  } catch (error) {
    console.warn(`Helios: failed to read network attribute "${name}".`, error);
    return undefined;
  }
  return value;
}

function readNetworkStringAttributeValue(network, name) {
  const value = readNetworkAttributeValue(network, name);
  if (value == null) return null;
  return String(value).trim() || null;
}

function readNetworkNumberAttribute(network, name, fallback) {
  const value = Number(readNetworkAttributeValue(network, name));
  return Number.isFinite(value) ? value : fallback;
}

function resolveGpuForceLayoutOptionsFromNetwork(network, requestedOptions = {}) {
  const explicitModel = normalizeForceModel(requestedOptions.forceModel);
  const enabledByGraph = normalizeTruthyNetworkFlag(readNetworkAttributeValue(network, UMAP_FORCE_FLAG_ATTRIBUTE));
  const skipTuningModelForEmbeddedGraph = requestedOptions.skipTuningModel ?? (enabledByGraph ? true : undefined);
  if (explicitModel === 'linear') {
    return { ...requestedOptions, forceModel: 'linear', skipTuningModel: skipTuningModelForEmbeddedGraph };
  }
  if (!enabledByGraph && explicitModel !== 'umap') {
    return { ...requestedOptions, forceModel: 'linear' };
  }
  if (!enabledByGraph) {
    console.warn('Helios: ignoring gpu-force UMAP mode because the graph-level "umap" attribute is not enabled.');
    return { ...requestedOptions, forceModel: 'linear' };
  }

  const edgeWeightAttribute = String(
    requestedOptions.edgeWeightAttribute
      ?? readNetworkStringAttributeValue(network, 'umap_edge_weight_attr')
      ?? DEFAULT_UMAP_EDGE_WEIGHT_ATTRIBUTE,
  ).trim();
  if (!edgeWeightAttribute || !network?.hasEdgeAttribute?.(edgeWeightAttribute)) {
    console.warn(
      `Helios: ignoring gpu-force UMAP mode because edge attribute "${edgeWeightAttribute || DEFAULT_UMAP_EDGE_WEIGHT_ATTRIBUTE}" is unavailable.`,
    );
    return { ...requestedOptions, forceModel: 'linear', skipTuningModel: skipTuningModelForEmbeddedGraph };
  }

  const requestedMassAttribute = requestedOptions.nodeMassAttribute ?? readNetworkStringAttributeValue(network, 'umap_node_mass_attr');
  const normalizedMassAttribute = typeof requestedMassAttribute === 'string' && requestedMassAttribute.trim()
    ? requestedMassAttribute.trim()
    : DEFAULT_UMAP_NODE_MASS_ATTRIBUTE;
  const nodeMassAttribute = network?.hasNodeAttribute?.(normalizedMassAttribute)
    ? normalizedMassAttribute
    : null;
  const requestedPositionAttribute = requestedOptions.umapPositionAttribute
    ?? readNetworkStringAttributeValue(network, 'umap_position_attr');
  const normalizedPositionAttribute = typeof requestedPositionAttribute === 'string' && requestedPositionAttribute.trim()
    ? requestedPositionAttribute.trim()
    : null;
  const umapHasInitialPositions = Boolean(
    normalizedPositionAttribute
    && network?.hasNodeAttribute?.(normalizedPositionAttribute),
  );

  return {
    ...requestedOptions,
    forceModel: 'umap',
    skipTuningModel: skipTuningModelForEmbeddedGraph,
    edgeWeightAttribute,
    nodeMassAttribute,
    umapPositionAttribute: umapHasInitialPositions ? normalizedPositionAttribute : null,
    umapHasInitialPositions,
    umapA: readNetworkNumberAttribute(network, 'umap_a', requestedOptions.umapA ?? DEFAULT_UMAP_FORCE_OPTIONS.umapA),
    umapB: readNetworkNumberAttribute(network, 'umap_b', requestedOptions.umapB ?? DEFAULT_UMAP_FORCE_OPTIONS.umapB),
    umapGamma: readNetworkNumberAttribute(network, 'umap_gamma', requestedOptions.umapGamma ?? DEFAULT_UMAP_FORCE_OPTIONS.umapGamma),
    umapNeighborCount: readNetworkNumberAttribute(
      network,
      'umap_n_neighbors',
      requestedOptions.umapNeighborCount ?? DEFAULT_UMAP_FORCE_OPTIONS.umapNeighborCount,
    ),
    umapNegativeSampleRate: readNetworkNumberAttribute(
      network,
      'umap_negative_sample_rate',
      requestedOptions.umapNegativeSampleRate ?? DEFAULT_UMAP_FORCE_OPTIONS.umapNegativeSampleRate,
    ),
    umapEpochs: readNetworkNumberAttribute(
      network,
      'umap_n_epochs',
      requestedOptions.umapEpochs ?? DEFAULT_UMAP_FORCE_OPTIONS.umapEpochs,
    ),
    kAttraction: Number.isFinite(Number(requestedOptions.kAttraction)) ? requestedOptions.kAttraction : 1,
    kRepulsion: Number.isFinite(Number(requestedOptions.kRepulsion)) ? requestedOptions.kRepulsion : 1,
    kGravity: Number.isFinite(Number(requestedOptions.kGravity)) ? requestedOptions.kGravity : 0,
  };
}

function computeGpuForceModeSwitchDepthJitter(layout) {
  const depth = Math.max(0, Number(layout?.options?.depth ?? 0) || 0);
  const radius = Math.max(0, Number(layout?.options?.radius ?? 0) || 0);
  const jitterBase = depth > 1e-6 ? depth : Math.max(1, radius * 0.25);
  return Math.max(1e-4, jitterBase * 0.005);
}

function hash32(value) {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

function hasMeaningfulDepth(snapshot, amplitude = 0) {
  if (!(snapshot instanceof Float32Array) || snapshot.length < 3) return false;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 2; i < snapshot.length; i += 3) {
    const z = Number(snapshot[i]);
    if (!Number.isFinite(z)) continue;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ)) return false;
  const tolerance = Math.max(1e-6, Math.abs(Number(amplitude) || 0) * 0.05);
  return (maxZ - minZ) > tolerance;
}

function applyPlanarDepthJitter(snapshot, amplitude = 0) {
  if (!(snapshot instanceof Float32Array) || snapshot.length < 3) return false;
  const safeAmplitude = Math.max(1e-4, Number(amplitude) || 0);
  const count = Math.floor(snapshot.length / 3);
  if (count <= 0 || hasMeaningfulDepth(snapshot, safeAmplitude)) return false;
  let mean = 0;
  for (let nodeId = 0; nodeId < count; nodeId += 1) {
    mean += ((((hash32(nodeId + 1) + 0.5) / 4294967296) - 0.5) * safeAmplitude);
  }
  mean /= Math.max(1, count);
  for (let nodeId = 0; nodeId < count; nodeId += 1) {
    const offset = (nodeId * 3) + 2;
    const currentZ = Number(snapshot[offset]);
    const baseZ = Number.isFinite(currentZ) ? currentZ : 0;
    const noise = ((((hash32(nodeId + 1) + 0.5) / 4294967296) - 0.5) * safeAmplitude) - mean;
    snapshot[offset] = baseZ + noise;
  }
  return true;
}

function resolveSeedBoundsForLayout(layoutOption, size, mode) {
  const safeMode = mode === '2d' ? '2d' : '3d';
  const width = Math.max(1, size?.width ?? 1)*0.01;
  const height = Math.max(1, size?.height ?? 1)*0.01;
  const minSide = Math.max(1, Math.min(width, height));
  const base = {
    width: minSide,
    height: minSide,
    depth: safeMode === '3d' ? minSide : 0,
    mode: safeMode,
    center: [0, 0, 0],
  };

  if (!layoutOption || isLayoutInstance(layoutOption)) return base;
  if (layoutOption?.type === 'worker') {
    const opts = layoutOption.options ?? {};
    const radius = Number.isFinite(opts.radius) ? Math.max(1, opts.radius) : 150;
    const depth = Number.isFinite(opts.depth) ? Math.max(0, opts.depth) : radius;
    const center = Array.isArray(opts.center) ? opts.center : [0, 0, 0];
    const side = safeMode === '3d' ? Math.max(radius, depth, 1) : radius;
    return {
      width: side,
      height: side,
      depth: safeMode === '3d' ? side : 0,
      mode: safeMode,
      center,
    };
  }
  if (layoutOption?.type === 'gpu-force' || layoutOption?.type === 'gpuforce') {
    const opts = layoutOption.options ?? {};
    const radius = Number.isFinite(opts.radius) ? Math.max(1, opts.radius) : 150;
    const depth = Number.isFinite(opts.depth) ? Math.max(0, opts.depth) : radius;
    const center = Array.isArray(opts.center) ? opts.center : [0, 0, 0];
    const side = safeMode === '3d' ? Math.max(radius, depth, 1) : radius;
    return {
      width: side,
      height: side,
      depth: safeMode === '3d' ? side : 0,
      mode: safeMode,
      center,
    };
  }

  if (layoutOption?.type === 'd3force3d' || layoutOption?.type === 'd3-force-3d') {
    const bounds = layoutOption?.options?.bounds ?? null;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      const minX = Number(bounds[0]);
      const minY = Number(bounds[1]);
      const maxX = Number(bounds[2]);
      const maxY = Number(bounds[3]);
      if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
        return {
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          depth: 0,
          mode: safeMode,
          center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, 0],
        };
      }
    }
  }

  const bounds = layoutOption?.options?.bounds ?? null;
  if (Array.isArray(bounds) && bounds.length >= 4) {
    const minX = Number(bounds[0]);
    const minY = Number(bounds[1]);
    const maxX = Number(bounds[2]);
    const maxY = Number(bounds[3]);
    if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
      return {
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        depth: 0,
        mode: safeMode,
        center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, 0],
      };
    }
  }

  return base;
}

function isNumericLayoutPositionAttributeType(type) {
  return type === AttributeType.Float
    || type === AttributeType.Double
    || type === AttributeType.Integer
    || type === AttributeType.UnsignedInteger
    || type === AttributeType.BigInteger
    || type === AttributeType.UnsignedBigInteger;
}

function getBaseFilename(name) {
  if (typeof name !== 'string') return 'network';
  const trimmed = name.trim();
  if (!trimmed) return 'network';
  const withoutGtZst = trimmed.replace(/\.gt\.zst$/i, '');
  if (withoutGtZst !== trimmed) return withoutGtZst;
  const withoutKnown = trimmed.replace(/\.(bxnet|zxnet|xnet|gml|gt)$/i, '');
  if (withoutKnown !== trimmed) return withoutKnown;
  return trimmed.replace(/\.[^/.]+$/, '') || trimmed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function copyVec3(value, fallback = 0) {
  return [
    Number.isFinite(value?.[0]) ? value[0] : fallback,
    Number.isFinite(value?.[1]) ? value[1] : fallback,
    Number.isFinite(value?.[2]) ? value[2] : fallback,
  ];
}

function resolve2DCenterFromPose(pose, fallbackZ = 0) {
  const zoom = Math.max(1e-6, Number.isFinite(pose?.zoom) ? pose.zoom : 1);
  const pan = pose?.pan2D ?? [0, 0, 0];
  return [
    -(Number(pan[0]) || 0) / zoom,
    -(Number(pan[1]) || 0) / zoom,
    Number.isFinite(fallbackZ) ? fallbackZ : 0,
  ];
}

function resolve3DCenterFromPose(pose) {
  const target = pose?.target ?? [0, 0, 0];
  const pan = pose?.pan3D ?? [0, 0, 0];
  return [
    (Number(target[0]) || 0) + (Number(pan[0]) || 0),
    (Number(target[1]) || 0) + (Number(pan[1]) || 0),
    (Number(target[2]) || 0) + (Number(pan[2]) || 0),
  ];
}

function estimate3DDistanceFrom2DZoom(pose) {
  const viewportHeight = Math.max(1, Number(pose?.viewport?.height) || 1);
  const zoom = Math.max(1e-6, Number.isFinite(pose?.zoom) ? pose.zoom : 1);
  const fovRad = ((Number.isFinite(pose?.fov) ? pose.fov : 60) * Math.PI) / 180;
  const tanHalfFov = Math.max(1e-6, Math.tan(fovRad * 0.5));
  return viewportHeight / (2 * zoom * tanHalfFov);
}

function estimate2DZoomFrom3DDistance(pose) {
  const viewportHeight = Math.max(1, Number(pose?.viewport?.height) || 1);
  const distance = Math.max(1e-6, Number.isFinite(pose?.distance) ? pose.distance : 800);
  const fovRad = ((Number.isFinite(pose?.fov) ? pose.fov : 60) * Math.PI) / 180;
  const worldHeight = Math.max(1e-6, 2 * distance * Math.tan(fovRad * 0.5));
  return viewportHeight / worldHeight;
}

const DEFAULT_MODE_SWITCH_DURATION_MS = 360;
const DEFAULT_MODE_SWITCH_3D_ROTATION = createYawPitchQuaternion(-0.55, 0.42);
const CAMERA_FIT_DEFAULT_MAX_SAMPLES = 50000;
const CAMERA_FIT_DEFAULT_2D_ZOOM_MARGIN = 1.35;
const DEFAULT_CAMERA_ANIMATION_DURATION_MS = 520;
const LARGE_NETWORK_STARTUP_NODE_THRESHOLD = 1000000;
const LARGE_NETWORK_STARTUP_EDGE_THRESHOLD = 1000000;
const LARGE_NETWORK_STARTUP_SCALE = 4;
const LARGE_NETWORK_STARTUP_DURATION_MS = 2200;
const LARGE_NETWORK_STARTUP_LAYOUT_DURATION_MS = 5000;
const STARTUP_DEFAULTS = Object.freeze({
  loadingOverlay: true,
  hideCanvasUntilFirstFrame: true,
  layoutIterations: 100,
  layoutDurationMs: 1000,
  initialCameraFit: true,
});
const QUICK_CONTROL_DEFAULTS = Object.freeze({
  enabled: true,
  autoFit: true,
  layout: true,
  zoom: true,
  reserveLegendSpace: true,
  theme: 'dark',
  buttonSize: 34,
  gap: 6,
  margin: 12,
  legendOffset: 64,
  zoomFactor: 1.25,
});
const QUICK_CONTROL_HELIOS_URL = 'https://heliosweb.io/';
const QUICK_CONTROL_ISSUE_URL = 'https://github.com/filipinascimento/helios-web/issues/new';
const BASELINE_REFRESH_IGNORED_OVERRIDES = new Set(['exporter.baseName', 'exporter.preset']);
const WARNING_KEYS_BY_OWNER = new WeakMap();

function warnOnce(owner, key, message, detail = undefined) {
  if (typeof console === 'undefined' || typeof console.warn !== 'function') return;
  const target = owner && (typeof owner === 'object' || typeof owner === 'function') ? owner : warnOnce;
  let keys = WARNING_KEYS_BY_OWNER.get(target);
  if (!keys) {
    keys = new Set();
    WARNING_KEYS_BY_OWNER.set(target, keys);
  }
  const normalizedKey = String(key ?? message);
  if (keys.has(normalizedKey)) return;
  keys.add(normalizedKey);
  if (detail === undefined) console.warn(message);
  else console.warn(message, detail);
}

const CAMERA_CONTROL_DEFAULTS = Object.freeze({
  autoFit: true,
  autoFitCoverage: 0.95,
  autoFitPaddingRatio: 0.05,
  autoFitIntervalMs: 900,
  autoFitMinIntervalMs: 250,
  autoFitMaxIntervalMs: 6000,
  autoFitLargeNetworkScale: 1,
  autoFitIntervalNodeCountRef: 5000,
  autoFitMaxSamples: CAMERA_FIT_DEFAULT_MAX_SAMPLES,
  largeNetworkStartupFit: true,
  largeNetworkStartupNodeThreshold: LARGE_NETWORK_STARTUP_NODE_THRESHOLD,
  largeNetworkStartupEdgeThreshold: LARGE_NETWORK_STARTUP_EDGE_THRESHOLD,
  largeNetworkStartupScale: LARGE_NETWORK_STARTUP_SCALE,
  largeNetworkStartupDurationMs: LARGE_NETWORK_STARTUP_DURATION_MS,
  animation: true,
  animationDurationMs: DEFAULT_CAMERA_ANIMATION_DURATION_MS,
  orbit: false,
  orbitAngle: 0,
  orbitAxis: Object.freeze([0, 1, 0]),
  orbitSpeed: 0.08,
  orbitDirection: 1,
  followTarget: false,
  followUpdateIntervalMs: 180,
  targetNodeIndices: null,
});

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const POSITION_INTERPOLATION_DEFAULTS = Object.freeze({
  enabled: false,
  mode: 'gpu',
  durationMode: 'fixed',
  durationMs: 140,
  adaptiveDuration: false,
  adaptiveDurationSamples: 5,
  adaptiveDurationWindowMs: 5000,
  adaptiveDurationScale: 1,
  adaptiveDurationMinMs: 16,
  adaptiveDurationMaxMs: 5000,
  easing: 'linear',
  smoothing: 6,
  minDisplacementRatio: 0.0005,
});

const DENSITY_DEFAULTS = Object.freeze({
  enabled: false,
  qualityScale: 0.1,
  topographic: false,
  scaleWithZoom: false,
  bandwidth: 28.1,
  weightScale: 398.1071705534973,
  property: 'Uniform',
  compareProperty: 'None',
  comparisonMode: 'difference',
  normalizeVs: false,
  epsilon: 1e-6,
  logRatioRange: 3,
  maskThreshold: 0,
  logRatioZScore: false,
  logRatioSupportCorrection: true,
  colormap: 'interpolateOrRd',
  logRatioColormap: 'cmasher:prinsenvlag',
  divergingColormap: 'cmasher:prinsenvlag',
  interactionFilter: 'auto',
});

const NETWORK_VISUALIZATION_STATE_ATTRIBUTE = '_helios_visualization_state';

function hasDensityComparisonTarget(compareProperty) {
  return typeof compareProperty === 'string'
    && compareProperty.trim().length > 0
    && compareProperty.trim() !== 'None';
}

function resolveDensityCompareProperty(property, compareProperty) {
  const propertyKey = typeof property === 'string' ? property.trim() : '';
  const compareKey = typeof compareProperty === 'string' ? compareProperty.trim() : '';
  if (!compareKey || compareKey === 'None') return 'None';
  if (propertyKey && compareKey === propertyKey) return 'None';
  return compareKey;
}

function resolveDensityComparisonMode(compareProperty, requestedMode) {
  return hasDensityComparisonTarget(compareProperty) && requestedMode === 'logRatio'
    ? 'logRatio'
    : 'difference';
}

function usesLogRatioDensityColormap(config) {
  return resolveDensityComparisonMode(config?.compareProperty, config?.comparisonMode) === 'logRatio';
}

function resolveDensityActiveColormap(config, runtime) {
  if (usesLogRatioDensityColormap(config)) {
    return config?.logRatioColormap ?? config?.divergingColormap ?? config?.colormap;
  }
  if (runtime?.diverging === true) {
    return config?.divergingColormap ?? config?.colormap;
  }
  return config?.colormap;
}

const EDGE_ADAPTIVE_QUALITY_DEFAULTS = Object.freeze({
  enabled: false,
  slowFrameThresholdMs: 66,
  averageWindowFrames: 12,
  probeIntervalMs: 900,
  interactionHoldMs: 180,
  fastDuringCamera: true,
  fastDuringLayout: true,
});

const EDGE_ADAPTIVE_LAYOUT_HYSTERESIS = Object.freeze({
  exitThresholdFactor: 0.75,
  alphaProbeFactor: 0.5,
  alphaMinMultiplier: 4,
  backoffFactor: 2,
  maxBackoffMs: 12000,
});

function normalizeNodeIndexList(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    const numeric = Math.floor(value);
    return Number.isFinite(numeric) && numeric >= 0 ? [numeric] : [];
  }
  const next = [];
  const seen = new Set();
  forEachIndex(value, (entry) => {
    const numeric = Math.floor(Number(entry));
    if (!Number.isFinite(numeric) || numeric < 0 || seen.has(numeric)) return;
    seen.add(numeric);
    next.push(numeric);
  });
  return next;
}

function normalizeReadbackNodeIndexList(value) {
  if (value == null) return [];
  if (typeof value === 'number') {
    const numeric = Math.floor(value);
    return Number.isFinite(numeric) && numeric >= 0 ? [numeric] : [];
  }
  const next = [];
  forEachIndex(value, (entry) => {
    const numeric = Math.floor(Number(entry));
    if (!Number.isFinite(numeric) || numeric < 0) return;
    next.push(numeric);
  });
  return next;
}

function resolveFloat32Out(out, length) {
  if (out instanceof Float32Array && out.length >= length) return out;
  return new Float32Array(Math.max(0, length));
}

function copyReadbackPositionsFromView(view, ids, out = null) {
  const count = ids?.length ?? 0;
  const positions = resolveFloat32Out(out, count * 3);
  positions.fill(0, 0, count * 3);
  if (!view || !Number.isFinite(view.length)) return positions;
  for (let i = 0; i < count; i += 1) {
    const id = ids[i];
    const src = id * 3;
    const dst = i * 3;
    if (src + 2 >= view.length) continue;
    positions[dst] = Number.isFinite(view[src]) ? view[src] : 0;
    positions[dst + 1] = Number.isFinite(view[src + 1]) ? view[src + 1] : 0;
    positions[dst + 2] = Number.isFinite(view[src + 2]) ? view[src + 2] : 0;
  }
  return positions;
}

function centroidFromPackedReadback(positions, count, out = null) {
  const centroid = resolveFloat32Out(out, 3);
  centroid[0] = 0;
  centroid[1] = 0;
  centroid[2] = 0;
  const safeCount = Math.max(0, Math.min(Math.floor(Number(count) || 0), Math.floor((positions?.length ?? 0) / 3)));
  if (safeCount <= 0) return { centroid, count: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let found = 0;
  for (let i = 0; i < safeCount; i += 1) {
    const offset = i * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    sumX += x;
    sumY += y;
    sumZ += z;
    found += 1;
  }
  if (found > 0) {
    centroid[0] = sumX / found;
    centroid[1] = sumY / found;
    centroid[2] = sumZ / found;
  }
  return { centroid, count: found };
}

function normalizeOrbitAngleDegrees(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, -89, 89);
}

function normalizeCameraControlConfig(base = {}, patch = {}) {
  const next = { ...base };
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFit')) {
    next.autoFit = patch.autoFit === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitCoverage')) {
    next.autoFitCoverage = clamp(
      normalizeNonNegativeNumber(patch.autoFitCoverage, next.autoFitCoverage ?? CAMERA_CONTROL_DEFAULTS.autoFitCoverage, 0.5, 1),
      0.5,
      1,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitPaddingRatio')) {
    next.autoFitPaddingRatio = normalizeNonNegativeNumber(patch.autoFitPaddingRatio, next.autoFitPaddingRatio ?? 0, 0, 1);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitIntervalMs')) {
    next.autoFitIntervalMs = normalizeNonNegativeNumber(patch.autoFitIntervalMs, next.autoFitIntervalMs ?? 0, 0, 60000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitMinIntervalMs')) {
    next.autoFitMinIntervalMs = normalizeNonNegativeNumber(patch.autoFitMinIntervalMs, next.autoFitMinIntervalMs ?? 0, 0, 60000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitMaxIntervalMs')) {
    next.autoFitMaxIntervalMs = normalizeNonNegativeNumber(patch.autoFitMaxIntervalMs, next.autoFitMaxIntervalMs ?? 0, 0, 60000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitLargeNetworkScale')) {
    next.autoFitLargeNetworkScale = normalizeNonNegativeNumber(patch.autoFitLargeNetworkScale, next.autoFitLargeNetworkScale ?? 1, 0, 32);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitIntervalNodeCountRef')) {
    next.autoFitIntervalNodeCountRef = normalizePositiveInteger(
      patch.autoFitIntervalNodeCountRef,
      next.autoFitIntervalNodeCountRef ?? 1,
      1,
      Number.MAX_SAFE_INTEGER,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitMaxSamples')) {
    next.autoFitMaxSamples = normalizePositiveInteger(
      patch.autoFitMaxSamples,
      next.autoFitMaxSamples ?? CAMERA_FIT_DEFAULT_MAX_SAMPLES,
      32,
      1000000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'largeNetworkStartupFit')) {
    next.largeNetworkStartupFit = patch.largeNetworkStartupFit !== false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'largeNetworkStartupNodeThreshold')) {
    next.largeNetworkStartupNodeThreshold = normalizePositiveInteger(
      patch.largeNetworkStartupNodeThreshold,
      next.largeNetworkStartupNodeThreshold ?? LARGE_NETWORK_STARTUP_NODE_THRESHOLD,
      1,
      Number.MAX_SAFE_INTEGER,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'largeNetworkStartupEdgeThreshold')) {
    next.largeNetworkStartupEdgeThreshold = normalizePositiveInteger(
      patch.largeNetworkStartupEdgeThreshold,
      next.largeNetworkStartupEdgeThreshold ?? LARGE_NETWORK_STARTUP_EDGE_THRESHOLD,
      1,
      Number.MAX_SAFE_INTEGER,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'largeNetworkStartupScale')) {
    next.largeNetworkStartupScale = normalizeNonNegativeNumber(
      patch.largeNetworkStartupScale,
      next.largeNetworkStartupScale ?? LARGE_NETWORK_STARTUP_SCALE,
      1,
      64,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'largeNetworkStartupDurationMs')) {
    next.largeNetworkStartupDurationMs = normalizeNonNegativeNumber(
      patch.largeNetworkStartupDurationMs,
      next.largeNetworkStartupDurationMs ?? LARGE_NETWORK_STARTUP_DURATION_MS,
      0,
      60000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'animation')) {
    next.animation = patch.animation === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'animationDurationMs')) {
    next.animationDurationMs = normalizeNonNegativeNumber(patch.animationDurationMs, next.animationDurationMs ?? 0, 0, 60000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbit')) {
    next.orbit = patch.orbit === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbitAngle')) {
    next.orbitAngle = normalizeOrbitAngleDegrees(
      patch.orbitAngle,
      next.orbitAngle ?? CAMERA_CONTROL_DEFAULTS.orbitAngle,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbitAxis')) {
    next.orbitAxis = normalizeDirectionInput(
      patch.orbitAxis,
      next.orbitAxis ?? CAMERA_CONTROL_DEFAULTS.orbitAxis,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbitSpeed')) {
    next.orbitSpeed = normalizeNonNegativeNumber(patch.orbitSpeed, next.orbitSpeed ?? 0, 0, 10);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbitDirection')) {
    next.orbitDirection = Number(patch.orbitDirection) < 0 ? -1 : 1;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'followTarget')) {
    next.followTarget = patch.followTarget === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'followUpdateIntervalMs')) {
    next.followUpdateIntervalMs = normalizeNonNegativeNumber(
      patch.followUpdateIntervalMs,
      next.followUpdateIntervalMs ?? 0,
      0,
      60000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'targetNodeIndices')) {
    next.targetNodeIndices = normalizeNodeIndexList(patch.targetNodeIndices);
  }

  next.autoFitMinIntervalMs = Math.min(next.autoFitMinIntervalMs ?? 0, next.autoFitMaxIntervalMs ?? 0);
  next.autoFitMaxIntervalMs = Math.max(next.autoFitMaxIntervalMs ?? 0, next.autoFitMinIntervalMs ?? 0);
  return next;
}

function normalizeStartupConfig(value = {}, options = {}) {
  if (value === false || options.startupLoading === false) {
    return {
      ...STARTUP_DEFAULTS,
      loadingOverlay: false,
      hideCanvasUntilFirstFrame: false,
      layoutIterations: 0,
      layoutDurationMs: 0,
      initialCameraFit: STARTUP_DEFAULTS.initialCameraFit,
    };
  }
  const patch = value && typeof value === 'object' ? value : {};
  const read = (key, fallback) => (
    Object.prototype.hasOwnProperty.call(patch, key)
      ? patch[key]
      : (Object.prototype.hasOwnProperty.call(options, key) ? options[key] : fallback)
  );
  const has = (key) => (
    Object.prototype.hasOwnProperty.call(patch, key)
    || Object.prototype.hasOwnProperty.call(options, key)
  );
  return {
    loadingOverlay: read('loadingOverlay', STARTUP_DEFAULTS.loadingOverlay) !== false,
    hideCanvasUntilFirstFrame: read(
      'hideCanvasUntilFirstFrame',
      STARTUP_DEFAULTS.hideCanvasUntilFirstFrame,
    ) !== false,
    layoutIterations: normalizePositiveInteger(
      read('layoutIterations', read('startupLayoutIterations', STARTUP_DEFAULTS.layoutIterations)),
      STARTUP_DEFAULTS.layoutIterations,
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    layoutDurationMs: normalizeNonNegativeNumber(
      read('layoutDurationMs', read('startupLayoutDurationMs', STARTUP_DEFAULTS.layoutDurationMs)),
      STARTUP_DEFAULTS.layoutDurationMs,
      0,
      60000,
    ),
    initialCameraFit: read('initialCameraFit', STARTUP_DEFAULTS.initialCameraFit) !== false,
    _layoutIterationsExplicit: has('layoutIterations') || has('startupLayoutIterations'),
    _layoutDurationMsExplicit: has('layoutDurationMs') || has('startupLayoutDurationMs'),
  };
}

function normalizeQuickControlsConfig(value, options = {}) {
  if (value === false || value == null && options.defaultEnabled === false) {
    return {
      ...QUICK_CONTROL_DEFAULTS,
      theme: normalizeThemeName(options.defaultTheme) ?? QUICK_CONTROL_DEFAULTS.theme,
      enabled: false,
    };
  }
  const patch = value && typeof value === 'object' ? value : {};
  const uiOptions = options.ui && typeof options.ui === 'object' ? options.ui : {};
  const fallbackTheme = normalizeThemeName(options.defaultTheme) ?? QUICK_CONTROL_DEFAULTS.theme;
  const theme = typeof patch.theme === 'string' && patch.theme
    ? patch.theme
    : (typeof uiOptions.theme === 'string' && uiOptions.theme ? uiOptions.theme : fallbackTheme);
  const config = {
    ...QUICK_CONTROL_DEFAULTS,
    ...patch,
    theme,
    enabled: patch.enabled !== false,
    autoFit: patch.autoFit !== false && patch.fit !== false,
    layout: patch.layout !== false,
    zoom: patch.zoom !== false,
    reserveLegendSpace: patch.reserveLegendSpace !== false,
    buttonSize: normalizePositiveInteger(patch.buttonSize, QUICK_CONTROL_DEFAULTS.buttonSize, 28, 96),
    gap: normalizeNonNegativeNumber(patch.gap, QUICK_CONTROL_DEFAULTS.gap, 0, 32),
    margin: normalizeNonNegativeNumber(patch.margin, QUICK_CONTROL_DEFAULTS.margin, 0, 96),
    legendOffset: normalizeNonNegativeNumber(patch.legendOffset, QUICK_CONTROL_DEFAULTS.legendOffset, 0, 160),
    zoomFactor: normalizeNonNegativeNumber(patch.zoomFactor, QUICK_CONTROL_DEFAULTS.zoomFactor, 1.01, 8),
  };
  if (!config.autoFit && !config.layout && !config.zoom) config.enabled = false;
  return config;
}

function copyCameraControlConfig(config = {}) {
  return {
    ...config,
    orbitAxis: normalizeDirectionInput(config.orbitAxis, CAMERA_CONTROL_DEFAULTS.orbitAxis),
    targetNodeIndices: Array.isArray(config.targetNodeIndices) ? [...config.targetNodeIndices] : null,
  };
}

function swapNumericValue(values, a, b) {
  if (a === b) return;
  const tmp = values[a];
  values[a] = values[b];
  values[b] = tmp;
}

function medianIndexOfThree(values, a, b, c) {
  const av = values[a];
  const bv = values[b];
  const cv = values[c];
  if (av < bv) {
    if (bv < cv) return b;
    return av < cv ? c : a;
  }
  if (av < cv) return a;
  return bv < cv ? c : b;
}

function selectKthNumericValue(values, length, k) {
  const count = Math.max(0, Math.min(Math.floor(Number(length) || 0), values?.length ?? 0));
  if (count <= 0) return NaN;
  const target = Math.max(0, Math.min(count - 1, Math.floor(Number(k) || 0)));
  let left = 0;
  let right = count - 1;
  while (left < right) {
    const mid = left + ((right - left) >> 1);
    const pivotIndex = medianIndexOfThree(values, left, mid, right);
    const pivotValue = values[pivotIndex];
    let lt = left;
    let i = left;
    let gt = right;
    while (i <= gt) {
      const value = values[i];
      if (value < pivotValue) {
        swapNumericValue(values, lt, i);
        lt += 1;
        i += 1;
      } else if (value > pivotValue) {
        swapNumericValue(values, i, gt);
        gt -= 1;
      } else {
        i += 1;
      }
    }
    if (target < lt) right = lt - 1;
    else if (target > gt) left = gt + 1;
    else return values[target];
  }
  return values[left];
}

function quantileFromValues(values, length, t) {
  const count = Math.max(0, Math.min(Math.floor(Number(length) || 0), values?.length ?? 0));
  if (count === 0) return NaN;
  if (count === 1) return values[0];
  const clamped = clamp(Number(t), 0, 1);
  const index = clamped * (count - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  const loValue = selectKthNumericValue(values, count, lo);
  if (lo === hi) return loValue;
  const hiValue = selectKthNumericValue(values, count, hi);
  const factor = index - lo;
  return loValue + ((hiValue - loValue) * factor);
}

function quatNormalizeInto(out, q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len > 0) {
    const inv = 1 / len;
    out[0] = q[0] * inv;
    out[1] = q[1] * inv;
    out[2] = q[2] * inv;
    out[3] = q[3] * inv;
  } else {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
  }
  return out;
}

function quatMultiplyInto(out, a, b) {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

function quatFromAxisAngle(axis, radians) {
  const out = new Float32Array(4);
  const ax = Number(axis?.[0]) || 0;
  const ay = Number(axis?.[1]) || 0;
  const az = Number(axis?.[2]) || 0;
  const len = Math.hypot(ax, ay, az);
  if (len <= 1e-12) {
    out[3] = 1;
    return out;
  }
  const half = radians * 0.5;
  const scale = Math.sin(half) / len;
  out[0] = ax * scale;
  out[1] = ay * scale;
  out[2] = az * scale;
  out[3] = Math.cos(half);
  return out;
}

function transformDirectionByQuat(q, x, y, z) {
  const qx = q?.[0] ?? 0;
  const qy = q?.[1] ?? 0;
  const qz = q?.[2] ?? 0;
  const qw = q?.[3] ?? 1;
  const ix = (qw * x) + (qy * z) - (qz * y);
  const iy = (qw * y) + (qz * x) - (qx * z);
  const iz = (qw * z) + (qx * y) - (qy * x);
  const iw = (-qx * x) - (qy * y) - (qz * z);
  return [
    (ix * qw) + (iw * -qx) + (iy * -qz) - (iz * -qy),
    (iy * qw) + (iw * -qy) + (iz * -qx) - (ix * -qz),
    (iz * qw) + (iw * -qz) + (ix * -qy) - (iy * -qx),
  ];
}

function normalizeVec3Array(v, fallback) {
  const len = Math.hypot(v?.[0] ?? 0, v?.[1] ?? 0, v?.[2] ?? 0);
  if (!Number.isFinite(len) || len <= 1e-9) return [...fallback];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function crossVec3Array(a, b) {
  return [
    (a[1] * b[2]) - (a[2] * b[1]),
    (a[2] * b[0]) - (a[0] * b[2]),
    (a[0] * b[1]) - (a[1] * b[0]),
  ];
}

function dotVec3Array(a, b) {
  return (a[0] * b[0]) + (a[1] * b[1]) + (a[2] * b[2]);
}

function resolveCameraBasisForRotation(rotation) {
  const forward = normalizeVec3Array(transformDirectionByQuat(rotation, 0, 0, -1), [0, 0, -1]);
  let up = normalizeVec3Array(transformDirectionByQuat(rotation, 0, 1, 0), [0, 1, 0]);
  let right = normalizeVec3Array(crossVec3Array(forward, up), [1, 0, 0]);
  up = normalizeVec3Array(crossVec3Array(right, forward), [0, 1, 0]);
  right = normalizeVec3Array(right, [1, 0, 0]);
  return { right, up, forward };
}

function normalizeInterpolationMode(value, fallback = POSITION_INTERPOLATION_DEFAULTS.mode) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (!raw) return 'gpu';
  if (raw === 'javascript' || raw === 'js' || raw === 'cpu') return 'gpu';
  if (raw === 'network' || raw === 'wasm' || raw === 'native') return 'gpu';
  if (raw === 'gpu' || raw === 'shader') return 'gpu';
  return 'gpu';
}

function normalizeInterpolationDurationMode(value, fallback = POSITION_INTERPOLATION_DEFAULTS.durationMode) {
  if (typeof value === 'boolean') {
    return value ? 'adaptive' : 'fixed';
  }
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'adaptive' || raw === 'auto' || raw === 'dynamic') return 'adaptive';
  if (raw === 'fixed' || raw === 'manual' || raw === 'constant') return 'fixed';
  return fallback;
}

function normalizeInterpolationEasing(value, fallback = POSITION_INTERPOLATION_DEFAULTS.easing) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (!raw) return 'linear';
  // Smoothstep looked unstable for frequent layout updates; keep a single interpolation curve for now.
  return 'linear';
}

function clamp01(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function normalizeNonNegativeNumber(value, fallback, min = 0, max = Number.POSITIVE_INFINITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clampedMin = Math.max(min, numeric);
  return Math.min(max, clampedMin);
}

function normalizePositiveInteger(value, fallback, min = 1, max = Number.POSITIVE_INFINITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function normalizeEdgeAdaptiveQualityConfig(base = {}, patch = {}) {
  if (patch === true || patch === false) {
    return {
      ...base,
      enabled: patch === true,
    };
  }
  if (!patch || typeof patch !== 'object') {
    return { ...base };
  }
  const next = { ...base };
  if (Object.prototype.hasOwnProperty.call(patch, 'enabled') && patch.enabled !== undefined) {
    next.enabled = patch.enabled !== false;
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'slowFrameThresholdMs')
    || Object.prototype.hasOwnProperty.call(patch, 'thresholdMs')
  ) {
    next.slowFrameThresholdMs = normalizeNonNegativeNumber(
      patch.slowFrameThresholdMs ?? patch.thresholdMs,
      next.slowFrameThresholdMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.slowFrameThresholdMs,
      0,
      10000,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'probeIntervalMs')
    || Object.prototype.hasOwnProperty.call(patch, 'retryDelayMs')
  ) {
    next.probeIntervalMs = normalizeNonNegativeNumber(
      patch.probeIntervalMs ?? patch.retryDelayMs,
      next.probeIntervalMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.probeIntervalMs,
      0,
      60000,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'averageWindowFrames')
    || Object.prototype.hasOwnProperty.call(patch, 'slowFrameConsecutiveFrames')
  ) {
    next.averageWindowFrames = normalizePositiveInteger(
      patch.averageWindowFrames ?? patch.slowFrameConsecutiveFrames,
      next.averageWindowFrames ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.averageWindowFrames,
      1,
      240,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'interactionHoldMs')
    || Object.prototype.hasOwnProperty.call(patch, 'cameraIdleMs')
  ) {
    next.interactionHoldMs = normalizeNonNegativeNumber(
      patch.interactionHoldMs ?? patch.cameraIdleMs,
      next.interactionHoldMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.interactionHoldMs,
      0,
      5000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fastDuringCamera')) {
    next.fastDuringCamera = patch.fastDuringCamera !== false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fastDuringLayout')) {
    next.fastDuringLayout = patch.fastDuringLayout !== false;
  }
  return next;
}

function resolveInterpolationDurationMode(config) {
  const fallback = config?.adaptiveDuration === true ? 'adaptive' : POSITION_INTERPOLATION_DEFAULTS.durationMode;
  return normalizeInterpolationDurationMode(config?.durationMode, fallback);
}

function applyInterpolationEasing(mode, t) {
  const clamped = clamp01(t, 0);
  if (mode !== 'linear') return clamped;
  return clamped;
}

function arePositionArraysEqual(a, b, epsilon = 1e-6) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > epsilon) return false;
  }
  return true;
}

function mixPositionsArray(from, to, out, t) {
  if (!from || !to || !out) return out;
  const factor = clamp01(t, 1);
  const count = Math.min(from.length, to.length, out.length);
  for (let i = 0; i < count; i += 1) {
    out[i] = from[i] + (to[i] - from[i]) * factor;
  }
  return out;
}

function computePositionDisplacementRatio(from, to) {
  if (!from || !to || from.length !== to.length || from.length === 0) return 0;
  let maxDelta = 0;
  let maxMagnitude = 0;
  for (let i = 0; i < from.length; i += 1) {
    const a = Number(from[i] ?? 0);
    const b = Number(to[i] ?? 0);
    const delta = Math.abs(b - a);
    if (delta > maxDelta) maxDelta = delta;
    const magnitude = Math.max(Math.abs(a), Math.abs(b));
    if (magnitude > maxMagnitude) maxMagnitude = magnitude;
  }
  if (maxDelta <= 0) return 0;
  return maxDelta / Math.max(1, maxMagnitude);
}

const GRAPH_FILTER_SCOPE_RENDER = 'render';
const GRAPH_FILTER_SCOPE_RENDER_LAYOUT = 'render+layout';
const GRAPH_FILTER_ALLOWED_OPTION_KEYS = Object.freeze([
  'nodeQuery',
  'edgeQuery',
  'nodeSelector',
  'edgeSelector',
  'nodeSelection',
  'edgeSelection',
  'orderNodesBy',
  'orderEdgesBy',
]);

function normalizeGraphFilterScope(value, fallback = GRAPH_FILTER_SCOPE_RENDER) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (raw === GRAPH_FILTER_SCOPE_RENDER_LAYOUT || raw === 'layout' || raw === 'render_layout') {
    return GRAPH_FILTER_SCOPE_RENDER_LAYOUT;
  }
  return GRAPH_FILTER_SCOPE_RENDER;
}

function normalizeGraphFilterOptions(options = {}) {
  const out = {};
  for (const key of GRAPH_FILTER_ALLOWED_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      out[key] = options[key];
    }
  }
  return out;
}

function hasGraphFilterCriteria(options = {}) {
  for (const key of GRAPH_FILTER_ALLOWED_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      return true;
    }
  }
  return false;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeLength(value) {
  const length = Number(value?.length);
  return Number.isFinite(length) && length >= 0 ? Math.floor(length) : 0;
}

function computeFilterTopologyVersion(baseVersion, filterVersion) {
  const base = safeNumber(baseVersion, 0);
  const delta = safeNumber(filterVersion, 0);
  const sum = base + delta;
  if (sum >= Number.MAX_SAFE_INTEGER) {
    return sum % Number.MAX_SAFE_INTEGER;
  }
  if (sum < 0) return 0;
  return sum;
}

function bumpVersionCounter(value) {
  const current = safeNumber(value, 0);
  if (current >= Number.MAX_SAFE_INTEGER - 1) return 0;
  return current + 1;
}

/**
 * Stable event names emitted by `Helios` instances.
 *
 * @public
 * @remarks Event payloads are delivered through `CustomEvent.detail` where the
 * browser supports `CustomEvent`. Use these constants instead of string
 * literals when wiring app behavior to render, layout, camera, picking, mapper,
 * filter, or network replacement changes.
 * @example
 * helios.on(EVENTS.NODE_HOVER, (event) => {
 *   console.log(event.detail?.index);
 * });
 */
export const EVENTS = Object.freeze({
  LAYOUT_START: 'layout:start',
  LAYOUT_STOP: 'layout:stop',
  LAYOUT_CHANGED: 'layout:changed',
  MODE_CHANGED: 'mode:changed',

  NODE_HOVER: 'node:hover',
  EDGE_HOVER: 'edge:hover',

  GRAPH_CLICK: 'graph:click',
  GRAPH_DBLCLICK: 'graph:dblclick',

  NODE_CLICK: 'node:click',
  EDGE_CLICK: 'edge:click',

  NODE_DBLCLICK: 'node:dblclick',
  EDGE_DBLCLICK: 'edge:dblclick',

  BEFORE_RENDER: 'render:before',
  AFTER_RENDER: 'render:after',

  RESIZE: 'resize',
  CAMERA_MOVE: 'camera:move',
  CAMERA_CONTROL_CHANGE: 'camera:control-change',
  NETWORK_REPLACED: 'network:replaced',
  MAPPERS_CHANGED: 'mappers:changed',
  GRAPH_FILTER_CHANGED: 'graph:filter-changed',
});

/**
 * Main Helios Web visualization controller for one `helios-network` graph.
 *
 * @public
 * @param {import('helios-network').default} network - WASM-backed graph store
 * that supplies topology, attributes, and serialization.
 * @param {object} [options] - Renderer, layout, behavior, mapper, interface,
 * persistence, touch, camera, and quality options.
 * @param {Element|string} [options.container=document.body] - Element or selector
 * that receives the Helios canvas, SVG overlays, and interaction layers.
 * @param {'auto'|'webgpu'|'webgl'} [options.renderer='auto'] - Preferred
 * renderer backend. `auto` chooses WebGPU when available and falls back to WebGL2.
 * @param {'2d'|'3d'} [options.mode='2d'] - Initial dimensional mode.
 * @param {'perspective'|'orthographic'} [options.projection='perspective'] - Initial
 * 3D camera projection.
 * @param {object|Layout} [options.layout] - Layout configuration or a layout
 * instance to use for graph positions.
 * @param {string} [options.layout.type='gpu-force'] - Built-in layout key used
 * when `options.layout` is a configuration object.
 * @param {object} [options.layout.options] - Layout-specific options passed to
 * the selected layout implementation.
 * @param {object|false} [options.startup] - First-frame startup behavior, or
 * `false` to disable the loading overlay, canvas hiding, and layout warmup.
 * @param {boolean} [options.startup.loadingOverlay=true] - Show a centered
 * loading spinner while Helios is preparing the first visible frame.
 * @param {boolean} [options.startup.hideCanvasUntilFirstFrame=true] - Keep the
 * canvas hidden until the first intended graph frame is rendered.
 * @param {number} [options.startup.layoutIterations=100] - Optional number of
 * layout updates to wait before the first visible graph frame.
 * @param {number} [options.startup.layoutDurationMs=1000] - Optional layout warmup
 * time to wait before the first visible graph frame. When both layout warmup
 * limits are set, the first one reached releases the frame. Large initial
 * networks use a 5000 ms default duration unless this option is set.
 * @param {boolean} [options.startup.initialCameraFit=true] - Queue the default
 * initial camera fit after initialization. Set to `false` when applying an
 * explicit startup camera pose.
 * @param {object|false} [options.behaviors] - Built-in behavior options, custom
 * behavior instances, or `false` to disable default behaviors.
 * @param {object|null} [options.mappers] - Initial node and edge mapper
 * configuration. Pass `null` to skip default mapper setup.
 * @param {object|false} [options.interpolation] - Position interpolation
 * controls used when switching layouts or applying saved positions.
 * @param {object} [options.labels] - Initial label overlay options handled by
 * `LabelsBehavior`.
 * @param {object} [options.legends] - Initial legend overlay options handled by
 * `LegendsBehavior`.
 * @param {boolean|object} [options.density=false] - Density layer enablement or
 * density layer options.
 * @param {string} [options.transparencyModeEdges='weighted'] - Edge
 * transparency mode. The default weighted mode accumulates overlapping edges
 * without forcing every edge through the same alpha curve.
 * @param {object} [options.camera] - Camera framing, controls, and target
 * tracking options.
 * @param {boolean} [options.camera.largeNetworkStartupFit=true] - Start large
 * initial networks from a wider fit and settle toward the normal fit while
 * automatic fitting remains enabled.
 * @param {number} [options.camera.largeNetworkStartupNodeThreshold=1000000] -
 * Node count threshold for wide startup fitting.
 * @param {number} [options.camera.largeNetworkStartupEdgeThreshold=1000000] -
 * Edge count threshold for wide startup fitting.
 * @param {number} [options.camera.largeNetworkStartupScale=4] - Multiplier used
 * to move the startup fit farther from the graph before settling.
 * @param {number} [options.camera.largeNetworkStartupDurationMs=2200] -
 * Duration of the automatic startup settle animation.
 * @param {boolean|object} [options.quickControls=true] - Compact top-right
 * auto-fit, layout pause/run, and zoom controls. Pass `false` to disable all
 * controls, or disable individual groups with `autoFit`, `layout`, or `zoom`.
 * @param {boolean|object} [options.ui=false] - Optional HeliosUI creation.
 * Pass `true` to create the standard panel set, or an object with HeliosUI
 * options and `panels` set to a panel name, array of names, `true`, or `false`.
 * @param {object} [options.networkSource] - Metadata for the active network,
 * such as `name`, `baseName`, `format`, and provenance fields used by
 * persistence and file actions.
 * @param {boolean|object} [options.fileDrop=true] - File-drop behavior for
 * loading supported network files into the active view.
 * @param {boolean|object} [options.storage] - Storage backend configuration.
 * Pass `false` to disable persistent sessions, `true` for browser storage, or
 * an object accepted by `createHeliosStorageManager`.
 * @param {boolean|object|string} [options.session] - Session persistence
 * controls or explicit session id used by browser/native storage backends.
 * @param {string} [options.workspaceId='default'] - Workspace namespace for
 * persisted preferences and sessions.
 * @param {boolean} [options.persistNetwork=false] - Persist the network payload
 * as part of browser/native session saves.
 * @param {object} [options.networkPersistence] - Network payload persistence
 * policy, size limits, and backend-specific options.
 * @param {object} [options.positionPersistence] - Separate layout-position
 * persistence policy for storage backends that support split payloads.
 * @param {boolean|object} [options.sessionThumbnail] - Thumbnail capture policy
 * for saved sessions.
 * @param {boolean} [options.suppressBrowserGestures=true] - Prevent native
 * browser pan, zoom, and selection gestures over the visualization.
 * @param {boolean} [options.autoCleanup=true] - Destroy this Helios instance when
 * its root or container is removed from the DOM.
 * @param {boolean} [options.disposeNetworkOnDestroy=true] - Dispose the active
 * network when `destroy()` runs.
 * @param {boolean} [options.manualRendering=false] - Disable automatic scheduler
 * rendering so the host application can request frames explicitly.
 * @param {number} [options.maxFps] - Optional scheduler FPS cap.
 * @param {'high-performance'|'low-power'} [options.powerPreference='high-performance'] -
 * Preferred GPU class for WebGL and WebGPU initialization.
 * @param {WebGLContextAttributes} [options.webglContextAttributes] - Extra
 * WebGL2 context attributes merged over Helios defaults.
 * @param {GPURequestAdapterOptions} [options.webgpuAdapterOptions] - Extra
 * WebGPU adapter options merged over Helios defaults.
 * @param {GPUDeviceDescriptor} [options.webgpuDeviceDescriptor] - Extra
 * WebGPU device descriptor options. Explicit `requiredLimits` are merged with
 * Helios' graph-oriented limit requests.
 * @param {Partial<GPUCanvasConfiguration>} [options.webgpuCanvasConfiguration] -
 * Extra WebGPU canvas configuration values merged over Helios defaults.
 * @param {boolean|string|number} [options.supersampling] - Canvas
 * supersampling mode or scale factor.
 * @param {'dark'|'light'|string} [options.theme] - Initial renderer/UI theme.
 * When omitted, Helios follows `data-helios-theme`, `data-theme`,
 * `data-md-color-scheme`, or the browser color-scheme preference.
 * @param {string|Array<number>} [options.background] - Renderer background
 * color. Takes precedence over theme-derived defaults.
 * @param {string|Array<number>} [options.clearColor] - Renderer clear color.
 * Takes precedence over theme-derived defaults.
 * @returns {Helios} Visualization controller with a `ready` promise that
 * resolves after renderer, scheduler, layers, behaviors, and initial geometry
 * are initialized.
 * @remarks `options.container` should be an element or selector that already
 * has stable dimensions. `options.renderer` can prefer `webgpu` or `webgl`;
 * Helios falls back according to renderer availability. Built-in behaviors are
 * attached by default; `options.behaviors` accepts behavior options or custom
 * behavior instances when an app needs to tune or extend them. Set
 * `suppressBrowserGestures: true` for touch-first embedded canvases. Helios
 * automatically destroys itself when its root or container is removed from the
 * DOM unless `options.autoCleanup` is `false`. Destroying Helios disposes the
 * current network by default; pass `disposeNetworkOnDestroy: false` when the
 * application will keep using the same network after unmount.
 * @example
 * const helios = new Helios(network, {
 *   container: document.querySelector('#app'),
 *   layout: { type: 'gpu-force', options: { mode: '3d' } },
 *   behaviors: { labels: { enabled: true, source: 'label' } },
 * });
 * await helios.ready;
 */
export class Helios extends EventTarget {
  /**
   * Built-in bit flags used by node and edge interaction state.
   *
   * @public
   * @apiSection Static Properties
   * @returns {object} State bit constants for filtered, selected, and highlighted items.
   */
  static STATES = Object.freeze({
    FILTERED: 1 << 0,
    SELECTED: 1 << 1,
    HIGHLIGHTED: 1 << 2,
  });

  /**
   * Alias for `STATES` kept for compatibility with earlier public APIs.
   *
   * @public
   * @apiSection Static Properties
   * @returns {object} State bit constants.
   */
  static STATE_BITS = Helios.STATES;

  /**
   * Metadata describing settings that can be bound to controls in the UI.
   *
   * @public
   * @apiSection Static Properties
   * @returns {object} UI binding descriptors keyed by Helios setting name.
   */
  static UI_BINDINGS = Object.freeze({
    edgeWidthScale: {
      type: 'number',
      label: 'Edge Width Scale',
      description: 'Scales mapped edge widths',
      defaultValue: 1,
      domain: { min: 0, max: 10 },
      recommendedRange: { min: 0.0, max: 10.0 },
      step: 0.01,
    },
    edgeWidthBase: {
      type: 'number',
      label: 'Edge Width Base',
      description: 'Adds a constant to mapped edge widths',
      defaultValue: 0,
      domain: { min: 0, max: 20 },
      recommendedRange: { min: 0.0, max: 6.0 },
      step: 0.01,
    },
    edgeOpacityScale: {
      type: 'number',
      label: 'Edge Opacity Scale',
      description: 'Scales mapped edge opacity',
      defaultValue: 0.5,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
      meta: { inputMin: 0, inputMax: null },
    },
    edgeOpacityBase: {
      type: 'number',
      label: 'Edge Opacity Base',
      description: 'Adds a constant to mapped edge opacity',
      defaultValue: 0,
      domain: { min: 0, max: 1 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
    },
    nodeOpacityScale: {
      type: 'number',
      label: 'Node Opacity Scale',
      description: 'Scales mapped node opacity',
      defaultValue: 1,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
      meta: { inputMin: 0, inputMax: null },
    },
    nodeOpacityBase: {
      type: 'number',
      label: 'Node Opacity Base',
      description: 'Adds a constant to mapped node opacity',
      defaultValue: 0,
      domain: { min: 0, max: 1 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
    },
    nodeSizeScale: {
      type: 'number',
      label: 'Node Size Scale',
      description: 'Scales mapped node sizes',
      defaultValue: 1,
      domain: { min: 0, max: 100 },
      recommendedRange: { min: 0.0, max: 10.0 },
      step: 0.01,
    },
    nodeSizeBase: {
      type: 'number',
      label: 'Node Size Base',
      description: 'Adds a constant to mapped node sizes',
      defaultValue: 0,
      domain: { min: 0, max: 50 },
      recommendedRange: { min: 0.0, max: 10.0 },
      step: 0.01,
    },
    semanticZoomExponent: {
      type: 'number',
      label: 'Semantic Zoom Exp.',
      description: 'Compensates node and edge sizes as camera zoom changes (0 = geometric zoom only)',
      defaultValue: 0,
      domain: { min: 0, max: 2 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
    },
    nodeOutlineWidthScale: {
      type: 'number',
      label: 'Outline Width Scale',
      description: 'Scales mapped outline widths',
      defaultValue: 0,
      domain: { min: 0, max: 20 },
      recommendedRange: { min: 0.0, max: 20.0 },
      step: 0.01,
    },
    nodeOutlineWidthBase: {
      type: 'number',
      label: 'Outline Width Base',
      description: 'Adds a constant to mapped outline widths',
      defaultValue: 0,
      domain: { min: 0, max: 20 },
      recommendedRange: { min: 0.0, max: 4.0 },
      step: 0.01,
    },
    edgeEndpointTrim: {
      type: 'number',
      label: 'Edge Endpoint Trim',
      description: 'Trims edge endpoints so edges don’t overlap nodes',
      defaultValue: 0.8,
      domain: { min: 0, max: 3 },
      recommendedRange: { min: 0.0, max: 1.5 },
      step: 0.01,
    },
    edgeWidthClampToNodeDiameter: {
      type: 'boolean',
      label: 'Clamp Edge Widths',
      description: 'Limit rendered edge width to the endpoint node diameters after width mapping and state styles',
      defaultValue: true,
    },
    nodeBlendWithEdges: {
      type: 'boolean',
      label: 'Blend Nodes',
      description: 'Blend nodes using the edge transparency mode (weighted modes still use alpha; disables node depth testing)',
      defaultValue: false,
    },
    edgeDepthWrite: {
      type: 'boolean',
      label: 'Edge Depth Write',
      description: 'Enable depth testing and depth writes for edges (best for solid edges)',
      defaultValue: false,
    },
    edgeFastRendering: {
      type: 'boolean',
      label: 'Fast Edge Lines',
      description: 'Use a reduced-cost edge path for large interactive graphs. Forces thin line rendering and disables expensive edge effects.',
      defaultValue: false,
    },
    shadedEnabled: {
      type: 'boolean',
      label: 'Shaded',
      description: 'Enable shader-specialized lighting for the configured node and edge paths.',
      defaultValue: false,
    },
    shadedNodes: {
      type: 'boolean',
      label: 'Nodes',
      description: 'Apply shaded sphere lighting to nodes.',
      defaultValue: true,
    },
    shadedEdges: {
      type: 'boolean',
      label: 'Edges',
      description: 'Apply shaded cylindrical lighting across edge widths when the quad edge path is active.',
      defaultValue: false,
    },
    shadedLightDirectionX: {
      type: 'number',
      label: 'Light X',
      description: 'Shaded-light direction along the horizontal screen axis.',
      defaultValue: SHADED_LIGHT_DIRECTION_DEFAULT[0],
      domain: { min: -1, max: 1 },
      recommendedRange: { min: -1, max: 1 },
      step: 0.01,
    },
    shadedLightDirectionY: {
      type: 'number',
      label: 'Light Y',
      description: 'Shaded-light direction along the vertical screen axis.',
      defaultValue: SHADED_LIGHT_DIRECTION_DEFAULT[1],
      domain: { min: -1, max: 1 },
      recommendedRange: { min: -1, max: 1 },
      step: 0.01,
    },
    shadedLightDirectionZ: {
      type: 'number',
      label: 'Light Z',
      description: 'Shaded-light direction toward the camera.',
      defaultValue: SHADED_LIGHT_DIRECTION_DEFAULT[2],
      domain: { min: -1, max: 1 },
      recommendedRange: { min: -1, max: 1 },
      step: 0.01,
    },
    shadedDiffuseStrength: {
      type: 'number',
      label: 'Diffuse',
      description: 'Strength of the directional diffuse contribution from the shaded light color.',
      defaultValue: SHADED_DIFFUSE_STRENGTH_DEFAULT,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0, max: 2 },
      step: 0.01,
    },
    shadedAmbientStrength: {
      type: 'number',
      label: 'Ambient',
      description: 'Strength of the ambient top and bottom hemisphere lighting.',
      defaultValue: SHADED_AMBIENT_STRENGTH_DEFAULT,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0, max: 2 },
      step: 0.01,
    },
    shadedSpecularStrength: {
      type: 'number',
      label: 'Specular',
      description: 'Strength of the specular highlight added on top of ambient and diffuse lighting.',
      defaultValue: SHADED_SPECULAR_STRENGTH_DEFAULT,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0, max: 1.5 },
      step: 0.01,
    },
    shadedShininess: {
      type: 'number',
      label: 'Shininess',
      description: 'Exponent used for shaded specular highlights.',
      defaultValue: SHADED_SHININESS_DEFAULT,
      domain: { min: 1, max: 256 },
      recommendedRange: { min: 8, max: 128 },
      step: 1,
    },
    ambientOcclusionEnabled: {
      type: 'boolean',
      label: 'Ambient Occlusion',
      description: 'Enable a fast screen-space ambient occlusion post pass.',
      defaultValue: false,
    },
    ambientOcclusionNodes: {
      type: 'boolean',
      label: 'Nodes',
      description: 'Include node surfaces in the AO depth prepass and darkening pass.',
      defaultValue: true,
    },
    ambientOcclusionEdges: {
      type: 'boolean',
      label: 'Edges',
      description: 'Include edge surfaces in the AO depth prepass and darkening pass.',
      defaultValue: false,
    },
    ambientOcclusionStrength: {
      type: 'number',
      label: 'Strength',
      description: 'How strongly the AO pass darkens occluded pixels.',
      defaultValue: AMBIENT_OCCLUSION_STRENGTH_DEFAULT,
      domain: { min: 0, max: 3 },
      recommendedRange: { min: 0.2, max: 3.0 },
      step: 0.01,
    },
    ambientOcclusionRadius: {
      type: 'number',
      label: 'Radius',
      description: 'Screen-space AO sample radius in pixels.',
      defaultValue: AMBIENT_OCCLUSION_RADIUS_DEFAULT,
      domain: { min: 1, max: 100 },
      recommendedRange: { min: 4, max: 100 },
      step: 1,
    },
    ambientOcclusionBias: {
      type: 'number',
      label: 'Bias',
      description: 'Small positive bias that suppresses self-occlusion noise.',
      defaultValue: AMBIENT_OCCLUSION_BIAS_DEFAULT,
      domain: { min: 0, max: 0.1 },
      recommendedRange: { min: 0.001, max: 0.04 },
      step: 0.001,
    },
    ambientOcclusionMode: {
      type: 'string',
      label: 'Mode',
      description: 'Choose between Fast SSAO and Smooth SSAO.',
      defaultValue: AMBIENT_OCCLUSION_MODE_DEFAULT,
    },
    ambientOcclusionIntensityScale: {
      type: 'number',
      label: 'Fast Scale',
      description: 'Internal occlusion contrast scale used by Fast SSAO before final compositing.',
      defaultValue: AMBIENT_OCCLUSION_INTENSITY_SCALE_DEFAULT,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0.5, max: 2.5 },
      step: 0.01,
    },
    ambientOcclusionIntensityShift: {
      type: 'number',
      label: 'Fast Shift',
      description: 'Internal occlusion offset used by Fast SSAO to keep mid-tones from over-darkening.',
      defaultValue: AMBIENT_OCCLUSION_INTENSITY_SHIFT_DEFAULT,
      domain: { min: 0, max: 1 },
      recommendedRange: { min: 0, max: 0.2 },
      step: 0.01,
    },
    ambientOcclusionQuality: {
      type: 'string',
      label: 'Quality',
      description: 'Trade AO sharpness and stability against GPU cost.',
      defaultValue: AMBIENT_OCCLUSION_QUALITY_DEFAULT,
    },
    edgeAdaptiveQualityEnabled: {
      type: 'boolean',
      label: 'Adaptive Edges',
      description: 'Automatically switch to fast edge lines only after repeated slow high-quality frames.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.enabled,
    },
    edgeAdaptiveQualitySlowFrameThresholdMs: {
      type: 'number',
      label: 'Slow Frame',
      description: 'A high-quality edge frame slower than this counts toward adaptive fallback.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.slowFrameThresholdMs,
      domain: { min: 0, max: 200 },
      recommendedRange: { min: 8, max: 60 },
      step: 1,
    },
    edgeAdaptiveQualitySlowFrameConsecutiveFrames: {
      type: 'number',
      label: 'Avg Frames',
      description: 'How many recent high-quality edge frames are averaged before deciding to switch to fast edges.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.averageWindowFrames,
      domain: { min: 1, max: 60 },
      recommendedRange: { min: 4, max: 24 },
      step: 1,
    },
    edgeAdaptiveQualityProbeIntervalMs: {
      type: 'number',
      label: 'Hold Time',
      description: 'How long to stay in fast-edge mode before probing high-quality edges again.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.probeIntervalMs,
      domain: { min: 0, max: 5000 },
      recommendedRange: { min: 100, max: 2000 },
      step: 10,
    },
    edgeAdaptiveQualityInteractionHoldMs: {
      type: 'number',
      label: 'Interaction Hold',
      description: 'Debounce after camera movement before trying high-quality edges again.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.interactionHoldMs,
      domain: { min: 0, max: 2000 },
      recommendedRange: { min: 0, max: 500 },
      step: 10,
    },
    edgeAdaptiveQualityFastDuringCamera: {
      type: 'boolean',
      label: 'Camera',
      description: 'Keep fast edges active during panning, zooming, rotating, and nearby interaction bursts.',
      defaultValue: true,
    },
    edgeAdaptiveQualityFastDuringLayout: {
      type: 'boolean',
      label: 'Layout',
      description: 'Keep fast edges active while the active layout is still updating positions.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.fastDuringLayout,
    },
    labelsMode: {
      type: 'string',
      label: 'Labels',
      description: 'Choose whether labels are off, automatically ranked, or limited to selected nodes.',
      defaultValue: 'off',
    },
    labelsSelectedOnlySpaceAware: {
      type: 'boolean',
      label: 'Space Aware',
      description: 'When Selected Only is active, use the regular label culling and collision strategy instead of always forcing selected labels through.',
      defaultValue: true,
    },
    labelsEnabled: {
      type: 'boolean',
      label: 'Show Labels',
      description: 'Enable SVG node labels',
      defaultValue: false,
    },
    labelsMaxVisible: {
      type: 'number',
      label: 'Max Labels',
      description: 'Maximum number of labels rendered at once',
      defaultValue: 120,
      domain: { min: 0, max: 5000 },
      recommendedRange: { min: 20, max: 400 },
      step: 1,
    },
    labelsFontSizeScale: {
      type: 'number',
      label: 'Label Size Scale',
      description: 'Global multiplier for label font size',
      defaultValue: 1,
      domain: { min: 0.25, max: 8 },
      recommendedRange: { min: 0.5, max: 2.5 },
      step: 0.05,
    },
    labelsMinScreenRadius: {
      type: 'number',
      label: 'Min Node Radius',
      description: 'Minimum apparent node radius (px) required before labels are considered',
      defaultValue: 0,
      domain: { min: 0, max: 200 },
      recommendedRange: { min: 0, max: 24 },
      step: 0.5,
    },
    labelsOutlineWidth: {
      type: 'number',
      label: 'Label Outline Width',
      description: 'Label stroke/halo width',
      defaultValue: 2,
      domain: { min: 0, max: 16 },
      recommendedRange: { min: 0, max: 6 },
      step: 0.25,
    },
    labelsOffsetRadiusFactor: {
      type: 'number',
      label: 'Label Radius Factor',
      description: 'Scales the node-radius-based vertical anchor used for labels',
      defaultValue: 1,
      domain: { min: -8, max: 8 },
      recommendedRange: { min: -1, max: 1 },
      step: 0.05,
    },
    labelsOffsetPx: {
      type: 'number',
      label: 'Label Pixel Offset',
      description: 'Additional vertical label offset in screen pixels',
      defaultValue: 4,
      domain: { min: -256, max: 256 },
      recommendedRange: { min: -48, max: 48 },
      step: 1,
    },
    labelsMaxChars: {
      type: 'number',
      label: 'Label Max Chars',
      description: 'Maximum characters per row before truncation (0 = unlimited)',
      defaultValue: 45,
      domain: { min: 0, max: 512 },
      recommendedRange: { min: 0, max: 64 },
      step: 1,
    },
    labelsMaxRows: {
      type: 'number',
      label: 'Label Max Rows',
      description: 'Maximum wrapped label rows (uses ellipsis when clipped)',
      defaultValue: 2,
      domain: { min: 1, max: 8 },
      recommendedRange: { min: 1, max: 4 },
      step: 1,
    },
    legendsEnabled: {
      type: 'boolean',
      label: 'Show Legends',
      description: 'Enable SVG overlay legends',
      defaultValue: true,
    },
    background: {
      type: 'color',
      label: 'Background',
      description: 'Renderer clear/background color',
      eventName: 'clearColor',
    },
    clearColor: {
      type: 'color',
      label: 'Background',
      description: 'Renderer clear/background color',
    },
    supersampling: {
      type: 'string',
      label: 'Supersampling',
      description: 'Canvas resolution scaling: Off, Auto, or 2x.',
    },
  });

  /**
   * Return the UI control metadata registered for one Helios setting.
   *
   * @public
   * @apiSection Configuration
   * @param {string} name - UI binding name such as `nodeSizeScale` or `labelsEnabled`.
   * @returns {object|null} Binding descriptor, or `null` when the name is unknown.
   */
  uiBindingInfo(name) {
    return this.constructor.UI_BINDINGS?.[name] ?? null;
  }

  _emitUIBindingChange(name, value, detail = {}) {
    if (this._suppressStateBindingUiEvent > 0) return;
    if (typeof this.dispatchEvent !== 'function') return;
    try {
      const payload = {
        source: detail.source ?? 'program',
        trackOverride: detail.trackOverride !== false,
        ...detail,
        id: `helios.${name}`,
        name,
        value,
      };
      this._handleAutoThemeBindingChange(name, payload);
      this.dispatchEvent(createDetailEvent('ui:binding-change', payload));
    } catch (error) {
      if (
        this.dispatchEvent === EventTarget.prototype.dispatchEvent
        && error instanceof TypeError
        && /undefined \(reading 'get'\)/.test(String(error.message ?? ''))
      ) {
        return;
      }
      console.warn(`Helios: failed to emit UI binding change for "${name}".`, error);
    }
  }

  _emitLayoutChanged(layout = this._layout) {
    const descriptor = typeof layout?.getParameterBindings === 'function'
      ? (layout.getParameterBindings() ?? null)
      : null;
    this.emit(EVENTS.LAYOUT_CHANGED, {
      layout,
      key: descriptor?.key ?? null,
      label: descriptor?.label ?? layout?.constructor?.name ?? null,
    });
  }

  _bindLayoutToHelios(layout) {
    if (layout && typeof layout === 'object') {
      layout.helios = this;
    }
    return layout;
  }

  _wakeLayoutIfIdle(reason = 'layout') {
    const scheduler = this.scheduler ?? null;
    if (!scheduler || typeof scheduler.setLayoutEnabled !== 'function') return false;
    const state = typeof scheduler.getLayoutState === 'function'
      ? scheduler.getLayoutState()
      : (scheduler.layoutEnabled !== false ? 'running' : 'stopped');
    if (state !== 'idle') return false;
    scheduler.setLayoutEnabled(true, reason);
    scheduler.requestLayout?.(reason);
    return true;
  }

  _requestLayoutReheat(reason = 'layout') {
    const layout = this._layout ?? null;
    if (!layout || typeof layout !== 'object') return false;
    if (typeof layout.reheat === 'function') {
      layout.reheat(reason);
      return true;
    }
    layout.requestUpdate?.();
    return false;
  }

  _resumeDynamicLayoutAfterNetworkReplace(previousState, reason = 'network-replaced') {
    if (previousState !== 'idle') return false;
    if (this._layout instanceof StaticLayout) return false;
    const woke = this._wakeLayoutIfIdle(reason);
    const reheated = this._requestLayoutReheat(reason);
    return woke || reheated;
  }

  _activateLayoutAfterNetworkReplace(previousLayoutState, reason = 'network-replaced') {
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    this.scheduler.setLayout(this._layout);
    this._resumeDynamicLayoutAfterNetworkReplace(previousLayoutState, reason);
    this._emitLayoutChanged(this._layout);
  }

  constructor(network, options = {}) {
    if (!network) {
      throw new Error('Helios requires a helios-network instance');
    }
    super();
    this._destroyed = false;
    this._autoCleanupObserver = null;
    if (!Object.prototype.hasOwnProperty.call(options, 'transparencyModeEdges')) {
      options.transparencyModeEdges = 'weighted';
    }
    options.mode = options.mode === '2d' ? '2d' : '3d';
    if (!Object.prototype.hasOwnProperty.call(options, 'layout')) {
      const mode = options.mode;
      options.layout = {
        type: 'gpu-force',
        options: {
          mode,
        },
      };
    }
    const container = options.container ?? document.getElementById('app') ?? document.body;
    const hasExplicitTheme = hasExplicitThemeOption(options);
    const hasExplicitBackground = hasOwnOption(options, 'clearColor') || hasOwnOption(options, 'background');
    this._initialTheme = resolveInitialTheme(options, container);
    this._hasExplicitThemeOption = hasExplicitTheme;
    this._autoThemeDefaults = {
      background: !hasExplicitBackground && !hasExplicitTheme,
      controls: !hasExplicitTheme,
      currentTheme: this._initialTheme,
      cleanup: null,
      stateCleanup: null,
    };
    normalizeInitialClearColorOptions(options, this._initialTheme);
    this.network = network;
    const initialNetworkSource = options.networkSource && typeof options.networkSource === 'object'
      ? options.networkSource
      : {};
    const initialNetworkName = typeof initialNetworkSource.name === 'string' && initialNetworkSource.name.trim()
      ? initialNetworkSource.name.trim()
      : (typeof options.networkName === 'string' && options.networkName.trim() ? options.networkName.trim() : null);
    const initialNetworkBase = typeof initialNetworkSource.baseName === 'string' && initialNetworkSource.baseName.trim()
      ? initialNetworkSource.baseName.trim()
      : (initialNetworkName ? getBaseFilename(initialNetworkName) : null);
    this._lastLoadedNetworkName = initialNetworkName;
    this._lastLoadedNetworkBase = initialNetworkBase;
    this._lastLoadedNetworkFormat = typeof initialNetworkSource.format === 'string'
      ? initialNetworkSource.format
      : inferNetworkFormatFromName(initialNetworkName);
    this.options = options;
    this._initialMode = options.mode === '2d' ? '2d' : '3d';
    this.debugEnabled = options.debug === false
      ? false
      : !(options.debug && typeof options.debug === 'object' && options.debug.enabled === false);
    this.debug = createDebugLogger(options.debug);
    if (this.debugEnabled && typeof window !== 'undefined') {
      window.__helios = this;
    }
    this.debug.log('helios', 'Constructing Helios instance', { mode: this._initialMode });
    this.prewarmPromise = null;
    this.mappersDirty = false;
    this._legendContentVersion = 0;
    this.markMappersDirty = () => {
      this.mappersDirty = true;
      this._legendContentVersion += 1;
      this.prewarmPromise = null;
      this.scheduler?.requestGeometry?.();
      this.emit?.(EVENTS.MAPPERS_CHANGED, {
        node: serializeMapperCollectionState(this.nodeMapper),
        edge: serializeMapperCollectionState(this.edgeMapper),
      });
    };
    this.layers = new LayerManager(container, {
      suppressBrowserGestures: options.suppressBrowserGestures !== false,
      supersampling: options.supersampling,
      forceSupersample: options.forceSupersample,
      supersamplingAutoFactor: options.supersamplingAutoFactor,
      supersamplingAutoThreshold: options.supersamplingAutoThreshold,
    });
    this._networkFileDropOptions = normalizeNetworkFileDropOptions(
      options.fileDrop ?? options.networkFileDrop ?? options.dragAndDropNetwork,
    );
    this._networkFileDropCleanup = null;
    this._networkFileDropOverlay = null;
    this._networkFileDropDepth = 0;
    this._setupAutoCleanup();
    this._setupNetworkFileDrop();
    this.visuals = new VisualAttributes(network, this.debug);
    this.nodeMapper = new MapperCollection('node', network, this.markMappersDirty, this.debug);
    this.edgeMapper = new MapperCollection('edge', network, this.markMappersDirty, this.debug);
    const optionMappers = options.mappers;
    if (optionMappers !== null) {
      const initialMappers = optionMappers ?? createDefaultMappers(network);
      if (initialMappers?.nodeMapper) {
        this.nodeMapper.setDefault(initialMappers.nodeMapper);
      }
      if (initialMappers?.edgeMapper) {
        this.edgeMapper.setDefault(initialMappers.edgeMapper);
      }
    }
    this.mappersDirty = true;
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(options.layout, this.layers.size, options.mode));
    const debugPerformance = options.debugPerformance?? false;
    const performanceWindow = options.performanceWindow ?? 60;
    const performanceLogEvery = options.performanceLogEvery ?? performanceWindow;
    this.performanceMonitor = new PerformanceMonitor({
      enabled: debugPerformance,
      windowSize: performanceWindow,
      logEvery: performanceLogEvery,
    });
    this.attributeUpdateOptions = {
      autoUpdate: options.attributeAutoUpdate === true,
      maxFps: options.attributeAutoUpdateMaxFps ?? null,
      frameSkip: options.attributeAutoUpdateFrameSkip ?? null,
    };
    this.manualRendering = options.manualRendering === true;
    this.scheduler = new Scheduler({
      performanceMonitor: this.performanceMonitor,
      maxFps: options.maxFps,
      debug: this.debug,
      attributeAutoUpdate: this.attributeUpdateOptions.autoUpdate,
      attributeMaxFps: this.attributeUpdateOptions.maxFps,
      attributeFrameSkip: this.attributeUpdateOptions.frameSkip,
    });
    const requestedPositionDelegate = options.positions?.delegate ?? null;
    const initialPositionDelegate = requestedPositionDelegate
      ? this._validatePositionDelegate(requestedPositionDelegate)
      : null;
    const initialPositionSource = options.positions?.source === 'delegate' && initialPositionDelegate
      ? 'delegate'
      : 'network';
    this._positionsConfig = {
      source: initialPositionSource,
      delegate: initialPositionDelegate,
    };
    this._activePositionDelegate = null;
    const interpolationOptions = options.interpolation ?? null;
    const interpolationDurationMode = normalizeInterpolationDurationMode(
      interpolationOptions?.durationMode ?? interpolationOptions?.durationStrategy,
      interpolationOptions?.fixedDurationMs != null
        ? 'fixed'
        : interpolationOptions?.adaptiveDuration === true
          ? 'adaptive'
          : POSITION_INTERPOLATION_DEFAULTS.durationMode,
    );
    this._interpolationConfig = {
      ...POSITION_INTERPOLATION_DEFAULTS,
      ...(interpolationOptions && typeof interpolationOptions === 'object' ? interpolationOptions : {}),
      mode: normalizeInterpolationMode(interpolationOptions?.mode ?? interpolationOptions?.type),
      easing: normalizeInterpolationEasing(interpolationOptions?.easing),
      enabled: interpolationOptions?.enabled === true,
      durationMode: interpolationDurationMode,
      durationMs: normalizeNonNegativeNumber(
        interpolationOptions?.fixedDurationMs ?? interpolationOptions?.durationMs ?? interpolationOptions?.duration,
        POSITION_INTERPOLATION_DEFAULTS.durationMs,
      ),
      adaptiveDuration: interpolationDurationMode === 'adaptive',
      adaptiveDurationSamples: normalizePositiveInteger(
        interpolationOptions?.adaptiveDurationSamples,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationSamples,
        1,
        120,
      ),
      adaptiveDurationWindowMs: normalizeNonNegativeNumber(
        interpolationOptions?.adaptiveDurationWindowMs,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationWindowMs,
        100,
        60000,
      ),
      adaptiveDurationScale: normalizeNonNegativeNumber(
        interpolationOptions?.adaptiveDurationScale,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationScale,
        0,
        16,
      ),
      adaptiveDurationMinMs: normalizeNonNegativeNumber(
        interpolationOptions?.adaptiveDurationMinMs,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationMinMs,
        0,
        60000,
      ),
      adaptiveDurationMaxMs: normalizeNonNegativeNumber(
        interpolationOptions?.adaptiveDurationMaxMs,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationMaxMs,
        0,
        60000,
      ),
      smoothing: normalizeNonNegativeNumber(
        interpolationOptions?.smoothing,
        POSITION_INTERPOLATION_DEFAULTS.smoothing,
      ),
      minDisplacementRatio: normalizeNonNegativeNumber(
        interpolationOptions?.minDisplacementRatio,
        POSITION_INTERPOLATION_DEFAULTS.minDisplacementRatio,
      ),
    };
    this._interpolationRuntime = {
      active: false,
      startedAt: 0,
      lastFrameAt: 0,
      lastTargetUpdateAt: 0,
      layoutElapsedMs: 16,
      sourcePositions: null,
      targetPositions: null,
      mixedPositions: null,
      sourceVersion: 0,
      targetVersion: 0,
      sourceCount: 0,
      factor: 1,
      delegateVersion: null,
      sourceWebGPUBuffer: null,
      sourceWebGLTexture: null,
      sourceTextureMeta: null,
      lastRenderedPositions: null,
      effectiveDurationMs: this._interpolationConfig.durationMs,
      layoutIntervalsMs: [],
    };
    this.scheduler.setRenderPump(({ timestamp }) => this._runInterpolationRenderPump(timestamp));
    if (options.prewarm === true) {
      this.prewarm();
    }
    this._layout = this._bindLayoutToHelios(this.createLayout(options.layout));
    this._enforcePositionSourcePolicy(this._layout, {
      resetInterpolation: false,
      requestRender: false,
      requestGeometry: false,
      requestLabels: false,
    });
    this.renderer = null;
    this.attributeTracker = null;
    this.indexPickingTracker = null;
    this._anyListeners = new Set();
    this._listenHandlers = new Map();
    this._pendingGraphLayerProps = new Map();
    this._pendingRendererProps = new Map();
    this._frameId = 0;
    this._lastRenderTime = performance.now();
    this.counters = {
      geometryFrames: 0,
      renderFrames: 0,
      attributeUpdateTicks: 0,
    };
    this._cameraMoveRaf = null;
    this._cameraTransitionController = null;
    const cameraControlOptions = options.camera ?? options.cameraControls ?? null;
    this._cameraControlConfig = normalizeCameraControlConfig(
      CAMERA_CONTROL_DEFAULTS,
      cameraControlOptions && typeof cameraControlOptions === 'object'
        ? cameraControlOptions
        : {},
    );
    this._cameraControlRuntime = {
      lastAutoFitAt: Number.NEGATIVE_INFINITY,
      lastOrbitAt: 0,
      lastFitSignature: '',
      lastEffectiveIntervalMs: this._cameraControlConfig.autoFitIntervalMs,
      autoFitDirty: false,
      delegateSnapshot: null,
      delegateSnapshotAt: Number.NEGATIVE_INFINITY,
      delegateSnapshotPending: false,
      delegateSnapshotDelegate: null,
      delegateSnapshotRequestId: 0,
      delegateTargetBounds: null,
      delegateTargetBoundsAt: Number.NEGATIVE_INFINITY,
      delegateTargetBoundsPending: false,
      delegateTargetBoundsDelegate: null,
      delegateTargetBoundsSignature: '',
      delegateTargetBoundsRequestId: 0,
      cameraBoundsSnapshot: null,
      cameraBoundsSignature: '',
      cameraBoundsKind: '',
      cameraBoundsDirty: false,
      cameraBoundsPending: false,
      cameraBoundsPreparedAt: Number.NEGATIVE_INFINITY,
      orbitBaseRotation: null,
      appliedOrbitAngle: this._cameraControlConfig.orbitAngle ?? 0,
      suspended: false,
      controlPoseActive: false,
      controlPoseFrom: null,
      controlPoseTo: null,
      controlPoseStartedAt: 0,
      controlPoseDurationMs: 0,
      controlPoseSignature: '',
      largeNetworkStartupActive: false,
      pendingLargeNetworkStartupSettle: null,
      largeNetworkStartupRefreshIteration: -1,
      lastFollowUpdateAt: Number.NEGATIVE_INFINITY,
    };
    this._picking = {
      node: { enabled: false, hoverEnabled: true },
      edge: { enabled: false, hoverEnabled: true },
      options: {
        resolutionScale: 0.5,
        trackDepth: false,
        maxFps: 30,
        clickRequiresStationary: true,
        clickMoveTolerancePx: 4,
        suppressClickAfterWheelMs: 200,
      },
      hover: { kind: null, index: -1, depth: null },
      pointer: { x: 0, y: 0, clientX: 0, clientY: 0, inside: false },
      suppressHover: false,
      cameraIdleTimer: null,
      hoverThrottleTimer: null,
      gesture: createPickingGestureState(),
      _raf: null,
      _inFlight: false,
      _rerun: false,
      _lastPickTime: -Infinity,
    };
    this._pickingListenersAttached = false;
    this._boundPickingHandlers = {
      down: (event) => this._handlePointerDown(event),
      move: (event) => this._handlePointerMove(event),
      up: (event) => this._handlePointerUp(event),
      cancel: (event) => this._handlePointerUp(event),
      leave: () => this._handlePointerLeave(),
      wheel: (event) => this._handleWheel(event),
      click: (event) => this._handlePointerClick(event, false, { synthetic: false }),
      dblclick: (event) => this._handlePointerClick(event, true, { synthetic: false }),
    };
    this._pendingFrameNetwork = null;
    this._graphFilterState = this._graphFilterState ?? {
      enabled: false,
      scope: GRAPH_FILTER_SCOPE_RENDER,
      options: null,
      signature: null,
      nodeIndices: null,
      edgeIndices: null,
      nodeSelector: null,
      edgeSelector: null,
      filteredNetwork: null,
      renderNetwork: network,
      layoutNetwork: network,
      version: 0,
      stats: null,
      lastError: null,
    };
    this._activeHeliosFilter = null;
    this._stateStyleCache = {
      nodeSlots: new Map(),
      edgeSlots: new Map(),
      nodeNoState: null,
      edgeNoState: null,
      nodeHover: null,
      edgeHover: null,
    };
    this._hoverStyleFromHighlight = options.hoverStyleFromHighlight === true;
    this._highlightConnectedEdges = options.highlightConnectedEdges === true;
    this._interactionRenderOrder = {
      enabled: options.interactionRenderOrder !== false && options.renderOrderInteractions !== false,
      promoteHoverConnectedEdges: options.interactionRenderOrderHoverConnectedEdges !== false,
      promoteSelectedConnectedEdges: options.interactionRenderOrderSelectedConnectedEdges !== false,
      promoteHighlightedConnectedEdges: options.interactionRenderOrderHighlightedConnectedEdges !== false,
    };
    this._highlightSources = new Map();
    this._highlightUnion = { nodes: new Set(), edges: new Set() };
    const densityEnabled = options.density === true || options.densityEnabled === true;
    const densityScale = options.densityScale ?? options.densityQualityScale ?? DENSITY_DEFAULTS.qualityScale;
    const densityTopographic = options.topographic === true || options.densityTopographic === true;
    const densityScaleWithZoom = options.densityScaleWithZoom === true
      || options.densityScaleByZoom === true
      || options.scaleDensityWithZoom === true;
    const densityNormalizeVs = options.shallNormalizeVsDensity === true
      || options.vsDensityNormalize === true
      || options.densityNormalizeVs === true;
    const densityComparisonMode = typeof options.densityComparisonMode === 'string' && options.densityComparisonMode.trim()
      ? options.densityComparisonMode.trim()
      : DENSITY_DEFAULTS.comparisonMode;
    const initialCompareProperty = typeof options.vsDensityProperty === 'string' && options.vsDensityProperty.trim()
      ? options.vsDensityProperty.trim()
      : DENSITY_DEFAULTS.compareProperty;
    const initialProperty = typeof options.densityProperty === 'string' && options.densityProperty.trim()
      ? options.densityProperty.trim()
      : DENSITY_DEFAULTS.property;
    const sanitizedInitialCompareProperty = resolveDensityCompareProperty(initialProperty, initialCompareProperty);
    this._densityConfig = {
      ...DENSITY_DEFAULTS,
      enabled: densityEnabled,
      qualityScale: clamp(toFiniteNumber(densityScale, DENSITY_DEFAULTS.qualityScale), 0.03, 1.0),
      topographic: densityTopographic,
      scaleWithZoom: densityScaleWithZoom,
      property: initialProperty,
      compareProperty: sanitizedInitialCompareProperty,
      comparisonMode: resolveDensityComparisonMode(sanitizedInitialCompareProperty, densityComparisonMode),
      normalizeVs: densityNormalizeVs,
      epsilon: clamp(
        toFiniteNumber(options.densityEpsilon ?? options.densityLogRatioEpsilon, DENSITY_DEFAULTS.epsilon),
        1e-12,
        1,
      ),
      logRatioRange: clamp(
        toFiniteNumber(options.densityLogRatioRange, DENSITY_DEFAULTS.logRatioRange),
        1e-3,
        1e3,
      ),
      maskThreshold: clamp(
        toFiniteNumber(options.densityMaskThreshold, DENSITY_DEFAULTS.maskThreshold),
        0,
        1,
      ),
      logRatioZScore: options.densityLogRatioZScore === true
        || options.logRatioZScore === true,
      logRatioSupportCorrection: options.densityLogRatioSupportCorrection !== false
        && options.logRatioSupportCorrection !== false,
      bandwidth: clamp(
        toFiniteNumber(options.densityBandwidth, DENSITY_DEFAULTS.bandwidth),
        0.05,
        1000,
      ),
      weightScale: clamp(
        toFiniteNumber(options.densityWeight, DENSITY_DEFAULTS.weightScale),
        0,
        1e8,
      ),
      colormap: typeof options.densityColormap === 'string' && options.densityColormap.trim()
        ? options.densityColormap.trim()
        : DENSITY_DEFAULTS.colormap,
      logRatioColormap: typeof options.densityLogRatioColormap === 'string' && options.densityLogRatioColormap.trim()
        ? options.densityLogRatioColormap.trim()
        : DENSITY_DEFAULTS.logRatioColormap,
      divergingColormap: typeof options.densityDivergingColormap === 'string' && options.densityDivergingColormap.trim()
        ? options.densityDivergingColormap.trim()
        : DENSITY_DEFAULTS.divergingColormap,
      interactionFilter: typeof options.densityInteractionFilter === 'string'
        ? options.densityInteractionFilter
        : DENSITY_DEFAULTS.interactionFilter,
    };
    this._densityRuntime = { diverging: false, valueDomain: null };
    this._densityLayer = null;
    this.behaviors = new BehaviorManager(this, createDefaultBehaviorRegistry());
    this._initializeBehaviorNamespace();
    this._edgeAdaptiveQualityConfig = normalizeEdgeAdaptiveQualityConfig(
      EDGE_ADAPTIVE_QUALITY_DEFAULTS,
      options.edgeAdaptiveQuality ?? { enabled: options.edgeAdaptiveQualityEnabled },
    );
    this._edgeAdaptiveRuntime = {
      nextProbeAt: Number.NEGATIVE_INFINITY,
      lastRenderMs: null,
      qualityFrameSamples: [],
      qualityFrameAverageMs: null,
      fastFrameSamples: [],
      fastFrameAverageMs: null,
      activityActive: false,
      skipNextQualitySample: false,
      reason: this._edgeAdaptiveQualityConfig.enabled ? 'quality' : 'disabled',
      cameraMovingUntil: Number.NEGATIVE_INFINITY,
      cameraIdleTimer: null,
      probeTimer: null,
      failedProbeCount: 0,
      performanceFallbackAt: Number.NEGATIVE_INFINITY,
      performanceFallbackAlpha: NaN,
      forceHighQuality: false,
    };
    this._baseOverlayInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    this._quickControlsOverlayInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    this._overlayInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    this._quickControlsConfig = normalizeQuickControlsConfig(options.quickControls, {
      ui: options.ui,
      defaultTheme: this._initialTheme,
    });
    this._quickControls = null;
    this._quickControlCleanups = [];
    this._setupQuickControls();
    this.densityMap = {
      setBandwidth: (value) => {
        this.densityBandwidth(value);
        return this.densityMap;
      },
      setKernelWeightScale: (value) => {
        this.densityWeight(value);
        return this.densityMap;
      },
      setColormap: (value) => {
        this.densityColormap(value);
        return this.densityMap;
      },
      divergingColormap: (enabled) => {
        if (enabled === undefined) return this.density().diverging;
        this._densityRuntime = { ...this._densityRuntime, diverging: enabled === true };
        this.requestRender();
        return this.densityMap;
      },
    };
    this._labels = new SvgLabelController(this, options.labels ?? {});
    this._legends = new SvgLegendController(this, options.legends ?? {});
    this.size = { ...this.layers.size };
    this.removeResizeListener = null;
    this.firstGeometryUpdateComplete = false;
    this._startupConfig = normalizeStartupConfig(options.startup, options);
    this._startupGate = this._createStartupGate(this._startupConfig);
    this._startupOverlay = this._createStartupOverlay(this._startupConfig);
    this._startupCanvasPreviousVisibility = null;
    this._applyStartupCanvasVisibility();
    const storageEnabled = shouldEnablePersistence(options);
    const storageConfig = hasOwnOption(options, 'storage')
      ? options.storage
      : (storageEnabled ? { type: 'browser' } : false);
    const storageSessionId = normalizeStorageSessionId(options);
    this.states = new HeliosStateManager({
      now: options.now,
    });
    this._autoThemeDefaults.stateCleanup = this._installAutoThemeStateTracking();
    this.storage = createHeliosStorageManager(storageConfig, {
      helios: this,
      states: this.states,
      workspaceId: options.workspaceId ?? 'default',
      sessionId: storageSessionId,
      persistNetwork: options.persistNetwork === true,
      networkPersistence: options.networkPersistence,
      positionPersistence: options.positionPersistence,
      sessionThumbnail: options.sessionThumbnail,
      overrideTrackingReady: false,
    });
    this._beforeUnloadUnsavedChangesCleanup = null;
    this._installUnsavedSessionBeforeUnloadWarning(options);
    this._registerCoreStateEntries();
    const sessionOptions = storageEnabled ? normalizeSessionPersistenceOptions(options) : false;
    this._sessionPersistenceOptions = sessionOptions || (storageSessionId ? { sessionId: storageSessionId } : false);
    this._initializeDefaultBehaviors(options.behaviors);
    this._initializeBehaviors(options.behaviors);
    this._setupAutoThemeDefaults();
    this.ui = null;
    this.ready = this.initialize();
  }

  _createStartupGate(config = STARTUP_DEFAULTS) {
    let layoutIterations = normalizePositiveInteger(
      config.layoutIterations,
      STARTUP_DEFAULTS.layoutIterations,
      0,
      Number.MAX_SAFE_INTEGER,
    );
    let layoutDurationMs = normalizeNonNegativeNumber(
      config.layoutDurationMs,
      STARTUP_DEFAULTS.layoutDurationMs,
      0,
      60000,
    );
    if (this._isLargeNetworkStartupGraph()) {
      if (config._layoutIterationsExplicit !== true) {
        layoutIterations = STARTUP_DEFAULTS.layoutIterations;
      }
      if (config._layoutDurationMsExplicit !== true) {
        layoutDurationMs = LARGE_NETWORK_STARTUP_LAYOUT_DURATION_MS;
      }
    }
    return {
      active: config.blockRendering === true || config.hideCanvasUntilFirstFrame !== false || config.loadingOverlay !== false || layoutIterations > 0 || layoutDurationMs > 0,
      firstVisibleFrameDrawn: false,
      startedAt: 0,
      layoutIterations: 0,
      targetLayoutIterations: layoutIterations,
      targetLayoutDurationMs: layoutDurationMs,
      blockRendering: config.blockRendering === true,
      hideCanvasUntilFirstFrame: config.hideCanvasUntilFirstFrame !== false,
      loadingOverlay: config.loadingOverlay !== false,
      config,
    };
  }

  _isLargeNetworkStartupGraph() {
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    const { nodeCount, edgeCount } = this._getLargeNetworkStartupCounts?.() ?? {
      nodeCount: Math.max(0, Math.floor(Number(this.network?.nodeCount) || 0)),
      edgeCount: Math.max(0, Math.floor(Number(this.network?.edgeCount) || 0)),
    };
    const nodeThreshold = normalizePositiveInteger(
      config.largeNetworkStartupNodeThreshold,
      LARGE_NETWORK_STARTUP_NODE_THRESHOLD,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const edgeThreshold = normalizePositiveInteger(
      config.largeNetworkStartupEdgeThreshold,
      LARGE_NETWORK_STARTUP_EDGE_THRESHOLD,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    return nodeCount >= nodeThreshold || edgeCount >= edgeThreshold;
  }

  _createStartupOverlay(config = STARTUP_DEFAULTS) {
    if (config.loadingOverlay === false || typeof document === 'undefined') return null;
    const parent = this.layers?.overlay ?? this.layers?.root ?? null;
    if (!parent) return null;
    const overlay = document.createElement('div');
    overlay.className = 'helios-startup-overlay';
    Object.assign(overlay.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: '20',
    });
    const spinner = document.createElement('div');
    spinner.className = 'helios-startup-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    Object.assign(spinner.style, {
      width: '38px',
      height: '38px',
      borderRadius: '50%',
      boxSizing: 'border-box',
      background: 'transparent',
      border: '3px solid var(--helios-startup-spinner-track, rgba(94, 124, 185, 0.24))',
      borderTopColor: 'var(--helios-startup-spinner-accent, #5e7cb9)',
      boxShadow: '0 0 14px var(--helios-startup-spinner-shadow, rgba(31, 35, 40, 0.12))',
      animation: 'helios-startup-spin 0.82s linear infinite',
    });
    overlay.appendChild(spinner);
    parent.appendChild(overlay);
    this._ensureStartupSpinnerStyles();
    return overlay;
  }

  _ensureStartupSpinnerStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('helios-startup-spinner-style')) return;
    const style = document.createElement('style');
    style.id = 'helios-startup-spinner-style';
    style.textContent = '@keyframes helios-startup-spin { to { transform: rotate(360deg); } }';
    document.head?.appendChild(style);
  }

  _applyStartupCanvasVisibility() {
    const canvas = this.layers?.canvas ?? null;
    const gate = this._startupGate ?? null;
    if (!canvas || !gate?.active || gate.hideCanvasUntilFirstFrame === false) return;
    if (canvas.style.visibility !== 'hidden') {
      this._startupCanvasPreviousVisibility = canvas.style.visibility;
    }
    canvas.style.visibility = 'hidden';
  }

  _beginNetworkLoadStartupGate(options = {}) {
    const base = this._startupConfig ?? STARTUP_DEFAULTS;
    const config = {
      ...base,
      loadingOverlay: options.loadingOverlay !== false,
      hideCanvasUntilFirstFrame: options.hideCanvasUntilFirstFrame !== false,
      blockRendering: true,
    };
    if (Object.prototype.hasOwnProperty.call(options, 'layoutIterations')) {
      config.layoutIterations = options.layoutIterations;
      config._layoutIterationsExplicit = true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'layoutDurationMs')) {
      config.layoutDurationMs = options.layoutDurationMs;
      config._layoutDurationMsExplicit = true;
    }
    this._startupOverlay?.remove?.();
    this._startupOverlay = null;
    this._startupGate = this._createStartupGate(config);
    this._startupOverlay = this._createStartupOverlay(config);
    this._applyStartupCanvasVisibility();
    this.scheduler?.requestRender?.();
    return this._startupGate;
  }

  _releaseNetworkLoadStartupGate(gate) {
    if (!gate || this._startupGate !== gate) return;
    const config = {
      ...(gate.config ?? this._startupConfig ?? STARTUP_DEFAULTS),
      blockRendering: false,
    };
    const previousVisibility = this._startupCanvasPreviousVisibility;
    this._startupGate = this._createStartupGate(config);
    this._startupGate.startedAt = performance.now();
    this._startupCanvasPreviousVisibility = previousVisibility;
    if (this._startupGate.active === true) {
      if (!this._startupOverlay && this._startupGate.loadingOverlay !== false) {
        this._startupOverlay = this._createStartupOverlay(config);
      }
      this._applyStartupCanvasVisibility();
    } else {
      this._startupOverlay?.remove?.();
      this._startupOverlay = null;
      const canvas = this.layers?.canvas ?? null;
      if (canvas && this._startupGate.hideCanvasUntilFirstFrame !== false) {
        canvas.style.visibility = previousVisibility ?? '';
      }
    }
    this.scheduler?.requestGeometry?.();
    this.scheduler?.requestRender?.();
  }

  _cancelNetworkLoadStartupGate(gate) {
    if (!gate || this._startupGate !== gate) return;
    gate.blockRendering = false;
    this._finishStartupFirstVisibleFrame();
  }

  _recordStartupLayoutUpdate() {
    const gate = this._startupGate ?? null;
    if (!gate || gate.firstVisibleFrameDrawn === true) return;
    gate.layoutIterations += 1;
  }

  _shouldSuppressStartupRender(now = performance.now()) {
    const gate = this._startupGate ?? null;
    if (!gate || gate.active !== true || gate.firstVisibleFrameDrawn === true) return false;
    const timestamp = Number.isFinite(now) ? now : performance.now();
    if (!Number.isFinite(gate.startedAt) || gate.startedAt <= 0) {
      gate.startedAt = timestamp;
    }
    if (gate.blockRendering === true) {
      return true;
    }
    const hasIterationTarget = gate.targetLayoutIterations > 0;
    const hasTimeTarget = gate.targetLayoutDurationMs > 0;
    if (!hasIterationTarget && !hasTimeTarget) {
      return false;
    }
    if (!this._shouldRunStartupLayoutWarmup()) {
      return false;
    }
    const iterationsReached = hasIterationTarget && gate.layoutIterations >= gate.targetLayoutIterations;
    const timeReached = hasTimeTarget && (timestamp - gate.startedAt) >= gate.targetLayoutDurationMs;
    return !(iterationsReached || timeReached);
  }

  _shouldRunStartupLayoutWarmup() {
    const layout = this._layout ?? null;
    if (!layout || layout instanceof StaticLayout) return false;
    if (this.scheduler?.layoutEnabled === false) return false;
    return true;
  }

  _isStartupLayoutWarmupActive() {
    const gate = this._startupGate ?? null;
    if (!gate || gate.active !== true || gate.firstVisibleFrameDrawn === true) return false;
    const hasIterationTarget = gate.targetLayoutIterations > 0;
    const hasTimeTarget = gate.targetLayoutDurationMs > 0;
    if (!hasIterationTarget && !hasTimeTarget) return false;
    return this._shouldRunStartupLayoutWarmup();
  }

  _finishStartupFirstVisibleFrame() {
    const gate = this._startupGate ?? null;
    if (!gate || gate.firstVisibleFrameDrawn === true) return;
    gate.firstVisibleFrameDrawn = true;
    gate.active = false;
    gate.blockRendering = false;
    const canvas = this.layers?.canvas ?? null;
    if (canvas && gate.hideCanvasUntilFirstFrame !== false) {
      canvas.style.visibility = this._startupCanvasPreviousVisibility ?? '';
    }
    this._startupOverlay?.remove?.();
    this._startupOverlay = null;
    this._queuePendingLargeNetworkStartupSettle();
  }

  _installAutoThemeStateTracking() {
    const states = this.states ?? null;
    if (!states || typeof states.addEventListener !== 'function') return null;
    const handler = (event) => {
      const detail = event?.detail ?? {};
      const key = this.states?.resolveKey?.(detail.key ?? detail.path ?? '') ?? String(detail.key ?? detail.path ?? '');
      const backgroundKey = this.states?.resolveKey?.('appearance.background') ?? 'appearance.background';
      const themeKey = this.states?.resolveKey?.('ui.theme') ?? 'ui.theme';
      if (key === backgroundKey && shouldDisableAutoThemeDefault(detail)) {
        this._autoThemeDefaults.background = false;
      }
      if (key === themeKey && shouldDisableAutoThemeDefault(detail)) {
        this._autoThemeDefaults.controls = false;
      }
    };
    states.addEventListener('change', handler);
    return () => states.removeEventListener?.('change', handler);
  }

  _resolveCurrentAutoTheme() {
    return resolveInitialTheme(this.options ?? {}, this.layers?.root ?? this.layers?.container ?? this.options?.container ?? null);
  }

  _setupAutoThemeDefaults() {
    const state = this._autoThemeDefaults ?? null;
    if (!state || (!state.background && !state.controls)) return null;
    this._applyAutoThemeDefaults(state.currentTheme ?? this._resolveCurrentAutoTheme(), { reason: 'auto-theme:init' });
    if (state.cleanup) return state.cleanup;
    if (typeof document === 'undefined' || typeof window === 'undefined') return null;

    const scheduleUpdate = () => {
      if (this._destroyed) return;
      if (!state.background && !state.controls) return;
      const nextTheme = this._resolveCurrentAutoTheme();
      if (nextTheme === state.currentTheme) return;
      this._applyAutoThemeDefaults(nextTheme);
    };
    const cleanups = [];
    const observerTarget = document.documentElement ?? document.body ?? null;
    if (typeof MutationObserver === 'function' && observerTarget) {
      const observer = new MutationObserver((records) => {
        if (!records.some((record) => ['data-helios-theme', 'data-theme', 'data-md-color-scheme', 'class'].includes(record.attributeName))) {
          return;
        }
        scheduleUpdate();
      });
      observer.observe(observerTarget, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-helios-theme', 'data-theme', 'data-md-color-scheme', 'class'],
      });
      cleanups.push(() => observer.disconnect());
    }
    const addMediaListener = (query) => {
      if (!query) return;
      if (typeof query.addEventListener === 'function') {
        query.addEventListener('change', scheduleUpdate);
        cleanups.push(() => query.removeEventListener?.('change', scheduleUpdate));
      } else if (typeof query.addListener === 'function') {
        query.addListener(scheduleUpdate);
        cleanups.push(() => query.removeListener?.(scheduleUpdate));
      }
    };
    try {
      addMediaListener(window.matchMedia?.('(prefers-color-scheme: dark)'));
      addMediaListener(window.matchMedia?.('(prefers-color-scheme: light)'));
    } catch (_) {
      // Ignore environments with partial matchMedia support.
    }
    state.cleanup = () => {
      for (const cleanup of cleanups.splice(0)) cleanup?.();
      state.cleanup = null;
    };
    return state.cleanup;
  }

  _applyAutoThemeDefaults(theme = 'dark', options = {}) {
    const state = this._autoThemeDefaults ?? null;
    if (!state) return this;
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    state.currentTheme = nextTheme;
    if (state.background) {
      const background = copyDefaultClearColorForTheme(nextTheme);
      const backgroundKey = this.states?.resolveKey?.('appearance.background') ?? 'appearance.background';
      if (typeof this.states?.entry === 'function' && this.states.entry(backgroundKey)) {
        this.states.setDefault?.(backgroundKey, background, {
          source: 'default',
          reason: options.reason ?? 'auto-theme',
          applyBinding: true,
        });
      } else {
        this._setRendererProp('clearColor', background, {
          source: 'default',
          reason: options.reason ?? 'auto-theme',
          trackOverride: false,
        });
      }
    }
    if (state.controls) {
      if (this._quickControlsConfig) this._quickControlsConfig.theme = nextTheme;
      const uiStatus = this.states?.status?.('ui.theme') ?? null;
      const uiHasOverride = uiStatus?.hasOverride === true;
      const themeKey = this.states?.resolveKey?.('ui.theme') ?? 'ui.theme';
      if (typeof this.states?.entry === 'function' && this.states.entry(themeKey)) {
        this.states.setDefault?.(themeKey, nextTheme, {
          source: 'default',
          reason: options.reason ?? 'auto-theme',
          applyBinding: false,
        });
      }
      if (this.ui && !uiHasOverride) {
        this.ui.setTheme?.(nextTheme, {
          source: 'default',
          reason: options.reason ?? 'auto-theme',
          trackOverride: false,
        });
      }
      if (!this.ui || !uiHasOverride) this._syncQuickControlsTheme(nextTheme);
    }
    return this;
  }

  _handleAutoThemeBindingChange(name, detail = {}) {
    const state = this._autoThemeDefaults ?? null;
    if (!state) return;
    const key = name === 'background' || name === 'clearColor'
      ? 'background'
      : (name === 'theme' || name === 'ui.theme' ? 'controls' : null);
    if (!key || !shouldDisableAutoThemeDefault(detail)) return;
    state[key] = false;
  }

  _setupAutoCleanup() {
    if (this.options?.autoCleanup === false) return;
    if (typeof MutationObserver !== 'function') return;
    const root = this.layers?.root ?? null;
    const container = this.layers?.container ?? null;
    if (!root || !container) return;

    const isObservedRemoval = (node) => (
      node === root
      || node === container
      || (typeof node?.contains === 'function' && (node.contains(root) || node.contains(container)))
    );

    const observer = new MutationObserver((records) => {
      if (this._destroyed) {
        observer.disconnect();
        return;
      }
      for (const record of records) {
        for (const node of record.removedNodes ?? []) {
          if (!isObservedRemoval(node)) continue;
          observer.disconnect();
          this.destroy();
          return;
        }
      }
    });

    observer.observe(container, { childList: true });
    if (container.parentNode) {
      observer.observe(container.parentNode, { childList: true });
    }
    this._autoCleanupObserver = observer;
  }

  _installUnsavedSessionBeforeUnloadWarning(options = {}) {
    if (options.warnOnUnsavedSessionChanges === false || options.session?.warnOnUnsavedChanges === false) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    const handler = (event) => {
      if (window.__HELIOS_DESKTOP_ALLOW_UNLOAD__ === true) return undefined;
      const status = this.storage?.persistenceStatus?.() ?? null;
      const networkData = status?.networkData ?? {};
      const hasUnsavedChanges = networkData.dirty === true
        || networkData.positionsDirty === true
        || status?.sessionSync?.pending === true;
      if (!hasUnsavedChanges) return undefined;
      const message = 'This Helios session has unsaved changes. Use Sync or Save Session before closing.';
      event.preventDefault?.();
      event.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handler);
    this._beforeUnloadUnsavedChangesCleanup = () => {
      window.removeEventListener('beforeunload', handler);
    };
  }

  _resolveNetworkFileDropTarget() {
    const configured = this._networkFileDropOptions?.target;
    if (configured && typeof configured === 'object' && typeof configured.addEventListener === 'function') {
      return configured;
    }
    if (typeof configured === 'string' && configured && configured !== 'root') {
      const found = document.querySelector(configured);
      if (found) return found;
    }
    return this.layers?.root ?? null;
  }

  _dragEventHasFiles(event) {
    const types = Array.from(event?.dataTransfer?.types ?? []);
    return types.includes('Files');
  }

  _ensureNetworkFileDropOverlay() {
    if (this._networkFileDropOverlay) return this._networkFileDropOverlay;
    const doc = this.layers?.root?.ownerDocument ?? document;
    const overlay = doc.createElement('div');
    overlay.className = 'helios-network-drop-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.position = 'absolute';
    overlay.style.inset = '8%';
    overlay.style.zIndex = '1500';
    overlay.style.display = 'none';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '8px';
    overlay.style.pointerEvents = 'none';
    overlay.style.border = '2px dashed currentColor';
    overlay.style.borderRadius = '14px';
    overlay.style.background = 'rgba(0, 0, 0, 0.62)';
    overlay.style.color = '#fff';
    overlay.style.textAlign = 'center';
    overlay.style.font = '600 14px/1.35 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    overlay.style.padding = '18px';

    const title = doc.createElement('div');
    title.className = 'helios-network-drop-overlay__title';
    title.textContent = this._networkFileDropOptions?.overlayTitle ?? 'Drop a network file here';
    const subtitle = doc.createElement('div');
    subtitle.className = 'helios-network-drop-overlay__subtitle';
    subtitle.textContent = this._networkFileDropOptions?.overlaySubtitle ?? 'Supported formats: .bxnet, .zxnet, .xnet, .gml, .gt, .gt.zst';
    overlay.appendChild(title);
    overlay.appendChild(subtitle);
    this.layers?.root?.appendChild(overlay);
    this._networkFileDropOverlay = overlay;
    return overlay;
  }

  _setNetworkFileDropActive(active) {
    const overlay = this._ensureNetworkFileDropOverlay();
    overlay.style.display = active ? 'flex' : 'none';
    this.layers?.root?.classList.toggle('helios-network-drop-active', active);
  }

  async _handleNetworkFileDrop(file) {
    if (!file) return null;
    const format = inferNetworkFormatFromName(file.name);
    const supported = this._networkFileDropOptions?.supportedFormats ?? [];
    if (!format || !supported.includes(format)) {
      console.warn('Helios: dropped file ignored because its format is unsupported.', { name: file.name, format });
      return null;
    }
    const replaceOptions = this._networkFileDropOptions?.replaceOptions ?? {};
    const confirmNetworkLoad = replaceOptions.confirmNetworkLoad ?? this._confirmNetworkLoadFromUi;
    if (typeof confirmNetworkLoad === 'function') {
      const confirmed = await confirmNetworkLoad({
        source: file,
        sourceName: file.name,
        format,
        trigger: 'drop',
      });
      if (confirmed !== true) return null;
    }
    const existingUnsyncedConfirmation = replaceOptions.confirmUnsyncedSession;
    const confirmUnsyncedSession = typeof existingUnsyncedConfirmation === 'function'
      ? existingUnsyncedConfirmation
      : (typeof this._confirmUnsyncedSessionFromUi === 'function'
        ? (detail) => this._confirmUnsyncedSessionFromUi({
            ...detail,
            sourceName: file.name,
            trigger: 'drop',
          })
        : undefined);
    return this.loadNetwork(file, {
      ...replaceOptions,
      format,
      showLoadingOverlay: replaceOptions.showLoadingOverlay !== false,
      confirmUnsyncedSession,
    });
  }

  _setupNetworkFileDrop() {
    if (this._networkFileDropOptions?.enabled !== true) return;
    const target = this._resolveNetworkFileDropTarget();
    if (!target) return;

    const prevent = (event) => {
      if (!this._dragEventHasFiles(event)) return false;
      event.preventDefault?.();
      event.stopPropagation?.();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      return true;
    };
    const onDragEnter = (event) => {
      if (!prevent(event)) return;
      this._networkFileDropDepth += 1;
      this._setNetworkFileDropActive(true);
    };
    const onDragOver = (event) => {
      prevent(event);
    };
    const onDragLeave = (event) => {
      if (!prevent(event)) return;
      this._networkFileDropDepth = Math.max(0, this._networkFileDropDepth - 1);
      if (this._networkFileDropDepth === 0) this._setNetworkFileDropActive(false);
    };
    const onDrop = (event) => {
      if (!prevent(event)) return;
      this._networkFileDropDepth = 0;
      this._setNetworkFileDropActive(false);
      const file = event.dataTransfer?.files?.[0] ?? null;
      this._handleNetworkFileDrop(file).catch((error) => {
        console.error('Helios: failed to load dropped network file.', error);
      });
    };

    target.addEventListener('dragenter', onDragEnter);
    target.addEventListener('dragover', onDragOver);
    target.addEventListener('dragleave', onDragLeave);
    target.addEventListener('drop', onDrop);
    this._networkFileDropCleanup = () => {
      target.removeEventListener('dragenter', onDragEnter);
      target.removeEventListener('dragover', onDragOver);
      target.removeEventListener('dragleave', onDragLeave);
      target.removeEventListener('drop', onDrop);
      this._networkFileDropOverlay?.remove?.();
      this._networkFileDropOverlay = null;
      this._networkFileDropDepth = 0;
    };
  }

  _disconnectAutoCleanup() {
    this._autoCleanupObserver?.disconnect?.();
    this._autoCleanupObserver = null;
  }

  _resolveBehavior(name) {
    const id = String(name ?? '').trim();
    if (!id) return null;
    const existing = this.behaviors?.get?.(id) ?? null;
    if (existing) return existing;
    if (this.behaviors?.registry?.has?.(id)) {
      return this.useBehavior(id);
    }
    return null;
  }

  /**
   * Check whether a behavior is active or registered.
   *
   * @public
   * @apiSection Behaviors
   * @param {string} name - Behavior id.
   * @returns {boolean} True when the behavior is active or available in the registry.
   */
  hasBehavior(name) {
    const id = String(name ?? '').trim();
    if (!id) return false;
    return this.behaviors?.has?.(id) === true || this.behaviors?.registry?.has?.(id) === true;
  }

  /**
   * Return an active behavior, lazily creating registered built-ins when needed.
   *
   * @public
   * @apiSection Behaviors
   * @param {string} name - Behavior id.
   * @returns {Behavior|null} Active behavior instance, or `null` when unavailable.
   */
  getBehavior(name) {
    return this._resolveBehavior(name);
  }

  _initializeBehaviorNamespace() {
    this.behavior = createBehaviorNamespace(this);
    return this.behavior;
  }

  /**
   * Register a behavior constructor or factory for later activation.
   *
   * @public
   * @apiSection Behaviors
   * @param {string} name - Behavior id.
   * @param {Function} behaviorCtor - Constructor or factory that creates a behavior.
   * @returns {Helios} This Helios instance.
   */
  registerBehavior(name, behaviorCtor) {
    this.behaviors?.registry?.register?.(name, behaviorCtor);
    return this;
  }

  /**
   * Activate a behavior, update an existing behavior, or return the active one.
   *
   * @public
   * @apiSection Behaviors
   * @param {string} name - Behavior id.
   * @param {Behavior|object|boolean} [behaviorOrOptions] - Behavior instance,
   * behavior options, or `true` to activate with defaults.
   * @returns {Behavior} Active behavior instance.
   * @example
   * const selection = helios.useBehavior('selection', { multiple: true });
   */
  useBehavior(name, behaviorOrOptions) {
    const id = String(name ?? '').trim();
    if (!id) throw new Error('useBehavior(name, behaviorOrOptions) requires a non-empty behavior name');

    if (isBehaviorLike(behaviorOrOptions)) {
      behaviorOrOptions.id = id;
      return this.behaviors.use(behaviorOrOptions);
    }

    const existing = this.behaviors?.get?.(id) ?? null;
    if (existing && behaviorOrOptions && typeof behaviorOrOptions === 'object') {
      existing.update?.(behaviorOrOptions);
      return existing;
    }
    if (existing && (behaviorOrOptions === undefined || behaviorOrOptions === true)) {
      return existing;
    }
    if (!this.behaviors?.registry?.has?.(id)) {
      throw new Error(`Unknown behavior "${id}"`);
    }
    if (behaviorOrOptions === undefined || behaviorOrOptions === true) {
      return this.behaviors.use(id);
    }
    return this.behaviors.use(id, behaviorOrOptions);
  }

  _initializeBehaviors(config) {
    if (!config || config === false) return;
    if (Array.isArray(config)) {
      for (const entry of config) {
        if (typeof entry === 'string') this.useBehavior(entry);
        else if (isBehaviorLike(entry)) this.useBehavior(entry.id ?? entry.constructor?.id, entry);
      }
      return;
    }
    if (typeof config === 'string') {
      this.useBehavior(config);
      return;
    }
    if (typeof config !== 'object') return;

    const reservedKeys = new Set(['use', 'options']);
    for (const [name, value] of Object.entries(config)) {
      if (reservedKeys.has(name) || value === false) continue;
      if (value === true || isBehaviorLike(value)) {
        this.useBehavior(name, value === true ? undefined : value);
        continue;
      }
      this.useBehavior(name, value);
    }

    const useEntries = [];
    if (Array.isArray(config.use)) useEntries.push(...config.use);
    else if (config.use) useEntries.push(config.use);
    if (!useEntries.length && config.selection === true) {
      useEntries.push('selection');
    }
    for (const entry of useEntries) {
      if (typeof entry === 'string') {
        const behaviorOptions = config.options?.[entry];
        this.useBehavior(entry, behaviorOptions);
      } else if (isBehaviorLike(entry)) {
        this.useBehavior(entry.id ?? entry.constructor?.id, entry);
      }
    }
  }

  _initializeDefaultBehaviors(config) {
    if (config === false) return;
    const disabled = new Set();
    const optionOverrides = {};
    if (config && typeof config === 'object' && !Array.isArray(config) && !isBehaviorLike(config)) {
      for (const [name, value] of Object.entries(config)) {
        if (value === false) disabled.add(name);
        else if (value && typeof value === 'object' && !isBehaviorLike(value)) {
          optionOverrides[name] = value;
        }
      }
      if (config.options && typeof config.options === 'object') {
        Object.assign(optionOverrides, config.options);
      }
    }
    if (this.options?.labels && !optionOverrides.labels) optionOverrides.labels = this.options.labels;
    if (this.options?.legends && !optionOverrides.legends) optionOverrides.legends = this.options.legends;

    for (const id of BEHAVIOR_IDS) {
      if (disabled.has(id)) continue;
      this.useBehavior(id, optionOverrides[id]);
    }
  }

  _reapplyBehaviorRendererBindings() {
    const behaviors = this.behaviors?.values?.() ?? [];
    for (const behavior of behaviors) {
      behavior.ensureStateStyleDefaults?.();
      behavior.applyHoverStylePolicy?.();
      behavior.applyHoverLabelConfig?.();
      behavior.applyHoverConnectedEdges?.();
      behavior.applyHighlightConnectedEdges?.();
      behavior.applySelectedConnectedEdges?.();
      behavior.syncPicking?.();
    }
    for (const behavior of behaviors) {
      behavior.applyOtherElementsState?.();
    }
    return this;
  }

  _registerCoreStateEntries() {
    const states = this.states ?? null;
    if (typeof states?.register !== 'function') return;
    states.register(this, 'scene', {
      dimension: {
        description: 'Scene dimensionality.',
        default: this._initialMode === '3d' ? '3d' : '2d',
        type: 'enum',
        scope: 'network',
        ui: {
          label: 'Dimension',
          controller: 'segmented',
          options: ['2d', '3d'],
        },
        getter: () => this.mode(),
        setter: (value, detail = {}) => this.setMode(value === '3d' ? '3d' : '2d', {
          animate: false,
          syncDelegate: false,
          source: detail.source ?? 'state',
          applyState: false,
        }),
        subscribe: (notify) => this.on(EVENTS.MODE_CHANGED, (event) => {
          const detail = event?.detail ?? event ?? {};
          notify(detail.mode === '3d' ? '3d' : '2d', {
            source: 'binding',
            reason: 'mode-changed',
            trackOverride: false,
          });
        }),
      },
    });
    const cameraControlEntries = {};
    const initialControls = this._snapshotCameraControlState();
    const cameraControlSubscribe = (notify) => this.on(EVENTS.CAMERA_CONTROL_CHANGE, () => {
      notify(undefined, {
        source: 'binding',
        reason: 'camera-control-change',
        trackOverride: false,
      });
    });
    for (const key of CAMERA_CONTROL_STATE_KEYS) {
      const value = initialControls?.[key];
      const isArrayValue = Array.isArray(value) || ArrayBuffer.isView(value);
      const type = typeof value === 'boolean'
        ? 'boolean'
        : (typeof value === 'number' ? 'number' : (isArrayValue ? 'array' : 'object'));
      cameraControlEntries[key] = {
        description: `Camera control value: ${key}.`,
        default: cloneSerializable(value),
        type,
        scope: 'session',
        aliases: [`cameraControls.${key}`],
        ui: {
          label: key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase()),
          controller: type === 'boolean' ? 'toggle' : (type === 'number' ? 'number' : 'custom'),
        },
        getter: () => cloneSerializable(this._snapshotCameraControlState()?.[key]),
        setter: (nextValue, detail = {}) => {
          this.cameraControls({ [key]: nextValue }, {
            source: detail.source ?? 'state',
            reason: detail.reason ?? 'state-restore',
            applyState: false,
          });
        },
        subscribe: cameraControlSubscribe,
      };
    }
    states.register(this, 'camera.controls', cameraControlEntries);
    states.register(this, 'camera', {
      pose: {
        description: 'Current camera pose.',
        default: this._snapshotCameraState({ includeViewport: false }),
        type: 'object',
        scope: 'session',
        ui: {
          label: 'Camera Pose',
          controller: 'custom',
          debounceMs: 240,
        },
        getter: () => this._snapshotCameraState({ includeViewport: false }),
        equals: cameraPoseValuesEqual,
        setter: (pose, detail = {}) => this._restoreCameraState(pose, {
          source: detail.source ?? 'state',
          restoreViewport: detail.restoreViewport === true,
        }),
        subscribe: (notify) => {
          let timer = null;
          let pendingPose = null;
          let pendingDetail = null;
          const flush = () => {
            timer = null;
            if (!pendingPose) return;
            const pose = pendingPose;
            const detail = pendingDetail ?? {};
            pendingPose = null;
            pendingDetail = null;
            notify(pose, {
              source: isExplicitCameraStateSource(detail.origin, detail) ? (detail.origin ?? 'interaction') : 'binding',
              reason: 'camera-pose',
              stateKey: 'camera.pose',
              storageKey: 'camera.pose',
              trackOverride: isExplicitCameraStateSource(detail.origin, detail),
              debounceMs: 500,
            });
          };
          const unsubscribe = this.on(EVENTS.CAMERA_MOVE, (event) => {
            const detail = event?.detail ?? event ?? {};
            const pose = this._snapshotCameraState({ includeViewport: false });
            if (!pose) return;
            pendingPose = pose;
            pendingDetail = detail;
            if (timer != null) clearTimeout(timer);
            timer = setTimeout(flush, 120);
          });
          return () => {
            if (timer != null) clearTimeout(timer);
            unsubscribe?.();
          };
        },
      },
    });
    states.register(this, 'layout.runtime', {
      state: {
        description: 'Lightweight layout runtime metadata. Position buffers are not stored in state.',
        default: this.snapshotLayoutRuntimeState({ includePositions: false }),
        type: 'object',
        scope: 'session',
        persist: true,
        getter: () => this.snapshotLayoutRuntimeState({ includePositions: false }),
        setter: (value) => this.restoreLayoutRuntimeState(value, {
          restoreRunState: true,
          reason: 'state-restore',
        }),
        subscribe: (notify) => {
          const handler = (event) => notify(undefined, {
            ...(event?.detail ?? {}),
            source: 'binding',
            reason: 'layout-runtime-change',
            trackOverride: false,
          });
          const cleanups = [
            this.on(EVENTS.LAYOUT_CHANGED, handler),
            this.on(EVENTS.MODE_CHANGED, handler),
          ];
          return () => cleanups.forEach((cleanup) => cleanup?.());
        },
      },
    });
  }

  _snapshotCameraState(options = {}) {
    const camera = this.renderer?.camera ?? null;
    const pose = captureCameraPose(camera);
    if (pose && options.includeViewport !== true) delete pose.viewport;
    return pose;
  }

  _restoreCameraState(state, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const pose = state && options.restoreViewport !== true ? { ...state } : state;
    if (pose && options.restoreViewport !== true) delete pose.viewport;
    this._cameraTransitionController?.stop?.();
    this._stopCameraControlPoseInterpolation();
    applyCameraPose(camera, pose);
    this.scheduler?.requestRender?.();
  }

  _snapshotCameraControlState() {
    return copyCameraControlConfig(this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS);
  }

  _restoreCameraControlState(state) {
    if (!state || typeof state !== 'object') return;
    if (!this._cameraControlRuntime) {
      this._cameraControlConfig = normalizeCameraControlConfig(this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS, state);
      return;
    }
    this.cameraControls?.(state);
  }


  _ensureCameraTransitionController() {
    if (!this._cameraTransitionController) {
      this._cameraTransitionController = new CameraTransitionController({
        requestRender: () => this.scheduler?.requestRender?.(),
      });
    }
    return this._cameraTransitionController;
  }

  _cameraControlsSnapshot() {
    const config = copyCameraControlConfig(this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS);
    const activeTargetNodeIndices = this._resolveActiveCameraTargetNodeIndices();
    return {
      ...config,
      activeTargetNodeIndices,
      effectiveAutoFitIntervalMs: this._resolveCameraAutoFitIntervalMs(activeTargetNodeIndices?.length ?? null),
    };
  }

  _emitCameraControlChange() {
    this.emit(EVENTS.CAMERA_CONTROL_CHANGE, this._cameraControlsSnapshot());
  }

  _resolveActiveCameraTargetNodeIndices() {
    const targetNodeIndices = normalizeNodeIndexList(this._cameraControlConfig?.targetNodeIndices);
    return targetNodeIndices?.length ? targetNodeIndices : null;
  }

  _markAutoFitDirty(requestRender = false) {
    if (!this._cameraControlRuntime) return;
    this._cameraControlRuntime.autoFitDirty = true;
    this._cameraControlRuntime.lastAutoFitAt = Number.NEGATIVE_INFINITY;
    this._invalidateCameraBoundsSnapshot();
    const network = this._getRenderNetwork?.() ?? null;
    if (this._renderNetworkBufferAccessActive(network)) {
      const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
      const request = config.followTarget === true
        ? this._buildCameraFollowBoundsRequest(this._resolveActiveCameraTargetNodeIndices(), config)
        : this._buildCameraAutoFitBoundsRequest(this._resolveActiveCameraTargetNodeIndices(), config);
      if (request) this._scheduleCameraBoundsPreparation(request, { force: true, reason: 'dirty' });
    } else {
      this._prepareCameraControlBoundsSnapshot({ force: true, reason: 'dirty' });
    }
    if (requestRender !== false) {
      this.scheduler?.requestRender?.();
    }
  }

  _invalidateCameraBoundsSnapshot() {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime) return;
    runtime.cameraBoundsSnapshot = null;
    runtime.cameraBoundsSignature = '';
    runtime.cameraBoundsKind = '';
    runtime.cameraBoundsDirty = true;
  }

  _handleResizeAutoFit() {
    const config = this._cameraControlConfig ?? null;
    if (config?.autoFit !== true) return;
    const cameraMode = this.renderer?.camera?.mode ?? null;
    if (cameraMode === '3d') return;
    this._markAutoFitDirty(false);
  }

  _resetCameraDelegateSnapshot() {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime) return;
    runtime.delegateSnapshot = null;
    runtime.delegateSnapshotAt = Number.NEGATIVE_INFINITY;
    runtime.delegateSnapshotPending = false;
    runtime.delegateSnapshotDelegate = null;
    runtime.delegateSnapshotRequestId = (runtime.delegateSnapshotRequestId ?? 0) + 1;
    runtime.delegateTargetBounds = null;
    runtime.delegateTargetBoundsAt = Number.NEGATIVE_INFINITY;
    runtime.delegateTargetBoundsPending = false;
    runtime.delegateTargetBoundsDelegate = null;
    runtime.delegateTargetBoundsSignature = '';
    runtime.delegateTargetBoundsRequestId = (runtime.delegateTargetBoundsRequestId ?? 0) + 1;
  }

  _markRestoredPositionsForCamera() {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime) return;
    this._resetCameraDelegateSnapshot();
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    if (config.autoFit === true || config.followTarget === true) {
      this._markAutoFitDirty(false);
    } else {
      this._invalidateCameraBoundsSnapshot();
    }
  }

  _invalidateCameraOrbitReference() {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime) return;
    runtime.orbitBaseRotation = null;
  }

  _composeOrbitRotation(baseRotation, options = {}) {
    const source = ArrayBuffer.isView(baseRotation) && baseRotation.length >= 4
      ? baseRotation
      : DEFAULT_MODE_SWITCH_3D_ROTATION;
    let nextRotation = new Float32Array(source);
    const yawRadians = Number.isFinite(options.yawRadians) ? Number(options.yawRadians) : 0;
    const pitchRadians = Number.isFinite(options.pitchRadians) ? Number(options.pitchRadians) : 0;
    const orbitAxis = normalizeDirectionInput(options.axis, CAMERA_CONTROL_DEFAULTS.orbitAxis);

    if (Math.abs(yawRadians) > 1e-12) {
      const yaw = quatFromAxisAngle(orbitAxis, yawRadians);
      const rotated = new Float32Array(4);
      quatMultiplyInto(rotated, yaw, nextRotation);
      nextRotation = rotated;
    }
    if (Math.abs(pitchRadians) > 1e-12) {
      const pitch = quatFromAxisAngle([1, 0, 0], pitchRadians);
      const rotated = new Float32Array(4);
      quatMultiplyInto(rotated, nextRotation, pitch);
      nextRotation = rotated;
    }
    quatNormalizeInto(nextRotation, nextRotation);
    return nextRotation;
  }

  _resolveCameraPositionView(options = {}) {
    const runtime = this._cameraControlRuntime ?? null;
    const positionSource = this._positionsConfig ?? { source: 'network', delegate: null };
    if (positionSource.source !== 'delegate') {
      return { source: 'network', view: null };
    }

    const delegate = positionSource.delegate ?? this._activePositionDelegate ?? null;
    if (!delegate) return { source: 'delegate', view: null };

    const context = this._buildPositionDelegateContext(options);
    let view = null;
    try {
      if (typeof delegate.getNodePositionView === 'function') {
        view = delegate.getNodePositionView(context);
      } else if (typeof delegate.getPositionView === 'function') {
        view = delegate.getPositionView(context);
      }
    } catch (error) {
      warnOnce(
        this,
        'delegate-position-view',
        'Helios: failed to read delegate position view; falling back to network positions.',
        { error, delegate },
      );
      view = null;
    }
    if (view && Number.isFinite(view.length) && view.length > 0) {
      return { source: 'delegate-view', view };
    }

    if (options.skipDelegateSnapshot === true) {
      return { source: 'delegate', view: null };
    }
    this._scheduleCameraDelegateSnapshot(delegate, options);
    if (runtime?.delegateSnapshotDelegate === delegate && runtime.delegateSnapshot && runtime.delegateSnapshot.length > 0) {
      return { source: 'delegate-snapshot', view: runtime.delegateSnapshot };
    }
    return { source: 'delegate', view: null };
  }

  _scheduleCameraDelegateSnapshot(delegate, options = {}) {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime || !delegate || typeof this.snapshotDelegatePositions !== 'function') return;
    if (runtime.delegateSnapshotPending && runtime.delegateSnapshotDelegate === delegate) return;

    const now = performance.now();
    const nodeCount = this._resolveActiveCameraTargetNodeIndices()?.length ?? this._getRenderNetwork()?.nodeCount ?? 0;
    const minIntervalMs = clamp(this._resolveCameraAutoFitIntervalMs(nodeCount) * 0.5, 120, 2000);
    if (
      runtime.delegateSnapshotDelegate === delegate
      && Number.isFinite(runtime.delegateSnapshotAt)
      && (now - runtime.delegateSnapshotAt) < minIntervalMs
    ) {
      return;
    }

    runtime.delegateSnapshotPending = true;
    runtime.delegateSnapshotDelegate = delegate;
    const requestId = (runtime.delegateSnapshotRequestId ?? 0) + 1;
    runtime.delegateSnapshotRequestId = requestId;

    Promise.resolve()
      .then(() => this.snapshotDelegatePositions({ ...options, delegate }))
      .then((snapshot) => {
        if (runtime.delegateSnapshotRequestId !== requestId || runtime.delegateSnapshotDelegate !== delegate) return;
        if (snapshot && Number.isFinite(snapshot.length) && snapshot.length > 0) {
          runtime.delegateSnapshot = snapshot;
          runtime.delegateSnapshotAt = performance.now();
          this._markAutoFitDirty(false);
          this.scheduler?.requestRender?.();
          this._tryPendingFrameNetwork?.();
        }
      })
      .catch((error) => {
        warnOnce(
          this,
          'camera-delegate-snapshot',
          'Helios: failed to snapshot delegate positions for camera controls.',
          { error, delegate },
        );
      })
      .finally(() => {
        if (runtime.delegateSnapshotRequestId === requestId && runtime.delegateSnapshotDelegate === delegate) {
          runtime.delegateSnapshotPending = false;
        }
      });
  }

  _shouldDeferDelegateReadbacks(options = {}) {
    if (options.exactReadback === true || options.applyFocusOnResolve === true || options.deferReadback === false) return false;
    if (options.deferReadback === true) return true;
    const now = performance.now();
    const gesture = this._picking?.gesture ?? null;
    if (gesture?.active === true || this._picking?.suppressHover === true) return true;
    if (Number.isFinite(gesture?.lastCameraMoveAt) && now - gesture.lastCameraMoveAt < 250) return true;
    if (Number.isFinite(gesture?.lastWheelAt) && now - gesture.lastWheelAt < 250) return true;
    const edgeAdaptiveRuntime = this._edgeAdaptiveRuntime ?? null;
    if (Number.isFinite(edgeAdaptiveRuntime?.cameraMovingUntil) && now < edgeAdaptiveRuntime.cameraMovingUntil) return true;
    return this._cameraControlRuntime?.controlPoseActive === true;
  }

  _cameraNodeIndexSignature(nodeIndices) {
    if (!nodeIndices?.length) return '';
    return Array.from(nodeIndices, (id) => Math.max(0, Math.floor(Number(id) || 0))).join(',');
  }

  _boundsFromCentroid(centroid, sourceCount = 0, options = {}) {
    if (!Number.isFinite(sourceCount) || sourceCount <= 0) {
      return null;
    }
    if (!centroid || !Number.isFinite(centroid[0]) || !Number.isFinite(centroid[1]) || !Number.isFinite(centroid[2])) {
      return null;
    }
    const paddingRatio = normalizeNonNegativeNumber(options.paddingRatio, 0, 0, 1);
    const viewportWidth = Math.max(1, Number(this.renderer?.camera?.viewport?.width ?? this.size?.width ?? 1));
    const viewportHeight = Math.max(1, Number(this.renderer?.camera?.viewport?.height ?? this.size?.height ?? 1));
    const ratioPaddingPx = Math.min(viewportWidth, viewportHeight) * paddingRatio;
    const paddingPx = Number.isFinite(options.paddingPx)
      ? Math.max(0, Number(options.paddingPx))
      : Math.max(24, ratioPaddingPx);
    const x = centroid[0];
    const y = centroid[1];
    const z = centroid[2];
    return {
      paddingPx,
      coverage: 1,
      sourceCount,
      sampledCount: sourceCount,
      minX: x,
      minY: y,
      minZ: z,
      maxX: x,
      maxY: y,
      maxZ: z,
      fitMinX: x,
      fitMinY: y,
      fitMinZ: z,
      fitMaxX: x,
      fitMaxY: y,
      fitMaxZ: z,
      sumX: x * sourceCount,
      sumY: y * sourceCount,
      sumZ: z * sourceCount,
      count: sourceCount,
      bboxCenter: [x, y, z],
      centroid: [x, y, z],
    };
  }

  _scheduleCameraDelegateTargetBounds(delegate, nodeIndices, options = {}) {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime || !delegate || !nodeIndices?.length || typeof this.snapshotNodeCentroid !== 'function') return;
    const signature = this._cameraNodeIndexSignature(nodeIndices);
    if (!signature) return;
    const exactReadback = options.exactReadback === true;
    if (
      runtime.delegateTargetBoundsPending
      && runtime.delegateTargetBoundsDelegate === delegate
      && runtime.delegateTargetBoundsSignature === signature
      && exactReadback !== true
    ) {
      return;
    }

    const now = performance.now();
    const minIntervalMs = clamp(
      normalizeNonNegativeNumber(
        this._cameraControlConfig?.followUpdateIntervalMs,
        CAMERA_CONTROL_DEFAULTS.followUpdateIntervalMs,
        0,
        60000,
      ) * 0.5,
      60,
      1000,
    );
    if (
      runtime.delegateTargetBoundsDelegate === delegate
      && runtime.delegateTargetBoundsSignature === signature
      && Number.isFinite(runtime.delegateTargetBoundsAt)
      && (now - runtime.delegateTargetBoundsAt) < minIntervalMs
      && exactReadback !== true
    ) {
      return;
    }

    runtime.delegateTargetBoundsPending = true;
    runtime.delegateTargetBoundsDelegate = delegate;
    runtime.delegateTargetBoundsSignature = signature;
    const requestId = (runtime.delegateTargetBoundsRequestId ?? 0) + 1;
    runtime.delegateTargetBoundsRequestId = requestId;

    Promise.resolve()
      .then(() => this.snapshotNodeCentroid(nodeIndices, {
        ...options,
        delegate,
        preferCached: options.preferCached ?? !exactReadback,
        allowStaleVersion: options.allowStaleVersion ?? !exactReadback,
        deferReadback: options.deferReadback ?? (exactReadback ? false : this._shouldDeferDelegateReadbacks(options)),
      }))
      .then((result) => {
        if (
          runtime.delegateTargetBoundsRequestId !== requestId
          || runtime.delegateTargetBoundsDelegate !== delegate
          || runtime.delegateTargetBoundsSignature !== signature
        ) {
          return;
        }
        const bounds = this._boundsFromCentroid(result?.centroid, result?.count ?? nodeIndices.length, options);
        if (!bounds) return;
        runtime.delegateTargetBounds = bounds;
        runtime.delegateTargetBoundsAt = performance.now();
        if (options.applyFocusOnResolve === true) {
          const nextPose = this._resolveCameraFocusPose(bounds, {
            focusMode: 'centroid',
            zoomScale: Number.isFinite(options.zoomScale)
              ? Number(options.zoomScale)
              : Number.isFinite(options.zoomFactor)
                ? Number(options.zoomFactor)
                : 1,
            maxFocusZoom: options.maxFocusZoom,
            minFocusDistance: options.minFocusDistance,
            focusZoomTolerance: options.focusZoomTolerance,
          });
          const animate = options.animate ?? this._cameraControlConfig?.animation === true;
          const durationMs = options.durationMs ?? this._cameraControlConfig?.animationDurationMs;
          if (this._cameraControlConfig?.followTarget === true) {
            this._queueCameraControlPose(nextPose, { animate, durationMs });
          } else {
            this._applyCameraPoseWithOptionalAnimation(nextPose, { animate, durationMs });
          }
        }
        this._markAutoFitDirty(false);
        this.scheduler?.requestRender?.();
      })
      .catch((error) => {
        warnOnce(
          this,
          'camera-delegate-target-bounds',
          'Helios: failed to resolve delegate target bounds for camera controls.',
          { error, delegate, signature },
        );
      })
      .finally(() => {
        if (
          runtime.delegateTargetBoundsRequestId === requestId
          && runtime.delegateTargetBoundsDelegate === delegate
          && runtime.delegateTargetBoundsSignature === signature
        ) {
          runtime.delegateTargetBoundsPending = false;
        }
      });
  }

  _prepareRenderBoundsNodeAttributeAccess(network) {
    const readable = new Map();
    if (this._renderNetworkBufferAccessActive(network)) {
      for (const name of [NODE_SIZE_ATTRIBUTE, NODE_OUTLINE_WIDTH_ATTRIBUTE]) readable.set(name, false);
      return readable;
    }
    for (const name of [NODE_SIZE_ATTRIBUTE, NODE_OUTLINE_WIDTH_ATTRIBUTE]) {
      if (!network || typeof name !== 'string' || !name) {
        readable.set(name, false);
        continue;
      }
      if (network._nodeAttributes?.has?.(name)) {
        if (typeof network.getNodeAttributeInfo === 'function') {
          try {
            readable.set(name, Boolean(network.getNodeAttributeInfo(name)));
          } catch {
            readable.set(name, false);
          }
        } else {
          readable.set(name, true);
        }
        continue;
      }
      if (typeof network.getNodeAttributeInfo === 'function') {
        try {
          readable.set(name, Boolean(network.getNodeAttributeInfo(name)));
        } catch {
          readable.set(name, false);
        }
        continue;
      }
      if (typeof network.hasNodeAttribute === 'function') {
        try {
          readable.set(name, Boolean(network.hasNodeAttribute(name)));
        } catch {
          readable.set(name, false);
        }
        continue;
      }
      readable.set(name, true);
    }
    return readable;
  }

  _renderNetworkBufferAccessActive(network = this._getRenderNetwork?.() ?? null) {
    return Math.max(0, Number(network?._bufferSessionDepth ?? 0) || 0) > 0;
  }

  _sampleRenderBoundsFromPositions(positions, nodeIndices, options = {}) {
    if (!positions || !Number.isFinite(positions.length) || positions.length <= 0) return null;
    const coverage = clamp(Number.isFinite(options.coverage) ? Number(options.coverage) : 1, 0.5, 1);
    const paddingRatio = normalizeNonNegativeNumber(options.paddingRatio, 0, 0, 1);
    const viewportWidth = Math.max(1, Number(this.renderer?.camera?.viewport?.width ?? this.size?.width ?? 1));
    const viewportHeight = Math.max(1, Number(this.renderer?.camera?.viewport?.height ?? this.size?.height ?? 1));
    const ratioPaddingPx = Math.min(viewportWidth, viewportHeight) * paddingRatio;
    const paddingPx = Number.isFinite(options.paddingPx)
      ? Math.max(0, Number(options.paddingPx))
      : Math.max(24, ratioPaddingPx);
    const maxSamples = normalizePositiveInteger(options.maxSamples, CAMERA_FIT_DEFAULT_MAX_SAMPLES, 32, 1000000);
    const stride = 3;
    const step = Math.max(1, Math.ceil(nodeIndices.length / Math.max(1, maxSamples)));
    const sampledPointCapacity = Math.ceil(nodeIndices.length / step);
    const sampledPoints = new Float32Array(Math.max(1, sampledPointCapacity) * 3);

    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    let sumX = 0; let sumY = 0; let sumZ = 0;
    let count = 0;
    let nodeRadiusWorld = 0;
    let found = false;
    const sampleX = coverage < 0.999999 ? new Float32Array(Math.max(1, sampledPointCapacity)) : null;
    const sampleY = coverage < 0.999999 ? new Float32Array(Math.max(1, sampledPointCapacity)) : null;
    const sampleZ = coverage < 0.999999 ? new Float32Array(Math.max(1, sampledPointCapacity)) : null;
    const graphLayer = this.renderer?.graphLayer ?? null;
    const network = this._getRenderNetwork?.() ?? null;
    const nodeAttributeAccess = options.nodeAttributeAccess instanceof Map ? options.nodeAttributeAccess : null;
    const readNodeAttributeView = (name) => {
      if (nodeAttributeAccess?.get(name) === false) return null;
      return network?.getNodeAttributeBuffer?.(name)?.view ?? null;
    };
    const nodeSizeBase = Math.max(0, Number(graphLayer?.nodeSizeBase ?? 0) || 0);
    const nodeSizeScale = Math.max(0, Number(graphLayer?.nodeSizeScale ?? 1) || 0);
    const nodeOutlineBase = Math.max(0, Number(graphLayer?.nodeOutlineWidthBase ?? 0) || 0);
    const nodeOutlineScale = Math.max(0, Number(graphLayer?.nodeOutlineWidthScale ?? 0) || 0);
    const sizeView = readNodeAttributeView(NODE_SIZE_ATTRIBUTE);
    const outlineView = readNodeAttributeView(NODE_OUTLINE_WIDTH_ATTRIBUTE);

    for (let i = 0; i < nodeIndices.length; i += step) {
      const id = nodeIndices[i];
      const o = id * stride;
      if ((o + 2) >= positions.length) continue;
      const x = positions[o];
      const y = positions[o + 1];
      const z = positions[o + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const rawSize = Number.isFinite(sizeView?.[id]) ? Number(sizeView[id]) : DEFAULT_NODE_SIZE;
      const rawOutline = Number.isFinite(outlineView?.[id]) ? Number(outlineView[id]) : DEFAULT_NODE_OUTLINE_WIDTH;
      const fullDiameter = Math.max(1, (nodeSizeBase + nodeSizeScale * rawSize) + Math.max(0, nodeOutlineBase + nodeOutlineScale * rawOutline));
      nodeRadiusWorld = Math.max(nodeRadiusWorld, fullDiameter * 0.5);
      found = true;
      const pointOffset = count * 3;
      sampledPoints[pointOffset] = x;
      sampledPoints[pointOffset + 1] = y;
      sampledPoints[pointOffset + 2] = z;
      sumX += x; sumY += y; sumZ += z;
      count += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      if (sampleX) {
        sampleX[count - 1] = x;
        sampleY[count - 1] = y;
        sampleZ[count - 1] = z;
      }
    }
    if (!found) return null;

    let fitMinX = minX; let fitMinY = minY; let fitMinZ = minZ;
    let fitMaxX = maxX; let fitMaxY = maxY; let fitMaxZ = maxZ;
    if (sampleX && count >= 4) {
      const trim = (1 - coverage) * 0.5;
      fitMinX = quantileFromValues(sampleX, count, trim);
      fitMaxX = quantileFromValues(sampleX, count, 1 - trim);
      fitMinY = quantileFromValues(sampleY, count, trim);
      fitMaxY = quantileFromValues(sampleY, count, 1 - trim);
      fitMinZ = quantileFromValues(sampleZ, count, trim);
      fitMaxZ = quantileFromValues(sampleZ, count, 1 - trim);
    }

    const bboxCx = (fitMinX + fitMaxX) * 0.5;
    const bboxCy = (fitMinY + fitMaxY) * 0.5;
    const bboxCz = (fitMinZ + fitMaxZ) * 0.5;
    const centroid = [
      count > 0 ? (sumX / count) : bboxCx,
      count > 0 ? (sumY / count) : bboxCy,
      count > 0 ? (sumZ / count) : bboxCz,
    ];
    return {
      paddingPx,
      coverage,
      nodeRadiusWorld: Number.isFinite(options.nodeRadiusWorld)
        ? Math.max(0, Number(options.nodeRadiusWorld))
        : Math.max(DEFAULT_CAMERA_FIT_NODE_RADIUS_WORLD, nodeRadiusWorld),
      sourceCount: nodeIndices.length,
      sampledCount: count,
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      fitMinX,
      fitMinY,
      fitMinZ,
      fitMaxX,
      fitMaxY,
      fitMaxZ,
      fitPoints: sampledPoints.subarray(0, count * 3),
      sumX,
      sumY,
      sumZ,
      count,
      bboxCenter: [bboxCx, bboxCy, bboxCz],
      centroid,
    };
  }

  _resolveCameraAutoFitIntervalMs(nodeCount = null) {
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    const baseInterval = normalizeNonNegativeNumber(
      config.autoFitIntervalMs,
      CAMERA_CONTROL_DEFAULTS.autoFitIntervalMs,
      0,
      60000,
    );
    const minInterval = normalizeNonNegativeNumber(
      config.autoFitMinIntervalMs,
      CAMERA_CONTROL_DEFAULTS.autoFitMinIntervalMs,
      0,
      60000,
    );
    const maxInterval = normalizeNonNegativeNumber(
      config.autoFitMaxIntervalMs,
      CAMERA_CONTROL_DEFAULTS.autoFitMaxIntervalMs,
      minInterval,
      60000,
    );
    const scaleStrength = normalizeNonNegativeNumber(
      config.autoFitLargeNetworkScale,
      CAMERA_CONTROL_DEFAULTS.autoFitLargeNetworkScale,
      0,
      32,
    );
    const countRef = normalizePositiveInteger(
      config.autoFitIntervalNodeCountRef,
      CAMERA_CONTROL_DEFAULTS.autoFitIntervalNodeCountRef,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const resolvedNodeCount = Math.max(1, Number.isFinite(nodeCount) ? Math.floor(nodeCount) : Math.floor(this._getRenderNetwork()?.nodeCount ?? 1));
    const intervalScale = scaleStrength <= 0
      ? 1
      : Math.max(1, Math.pow(resolvedNodeCount / countRef, 0.5) * scaleStrength);
    const interval = clamp(baseInterval * intervalScale, minInterval, maxInterval);
    if (this._cameraControlRuntime) {
      this._cameraControlRuntime.lastEffectiveIntervalMs = interval;
    }
    return interval;
  }

  _disableAutomaticCameraControlFromInteraction(detail = null) {
    const config = this._cameraControlConfig ?? null;
    if (!config) return false;
    this._invalidateCameraOrbitReference();
    const before = copyCameraControlConfig(config);
    let changed = false;
    const action = detail?.action ?? null;
    const actionTokens = new Set(String(action ?? '').split(/[^a-z0-9]+/i).filter(Boolean));
    const isPan = actionTokens.has('pan') || actionTokens.has('translate');
    const isRotate = actionTokens.has('rotate');
    const isZoom = actionTokens.has('zoom');
    const isDolly = actionTokens.has('dolly');
    const is2DMovementWithoutAction = detail?.mode === '2d'
      && (detail?.type === 'pointer' || detail?.type === 'touch' || detail?.type === 'wheel')
      && !action;
    if (isPan || isRotate || isZoom || isDolly || is2DMovementWithoutAction) {
      this._stopCameraControlPoseInterpolation();
    }
    if (config.autoFit === true && (isPan || isRotate || isZoom || isDolly || is2DMovementWithoutAction)) {
      config.autoFit = false;
      changed = true;
    }
    if (config.orbit === true && !isZoom && !isDolly) {
      config.orbit = false;
      changed = true;
    }
    if (config.followTarget === true && (isPan || isZoom || isDolly || is2DMovementWithoutAction)) {
      config.followTarget = false;
      config.targetNodeIndices = null;
      changed = true;
    }
    if (changed) {
      this._markAutoFitDirty(false);
      this._emitCameraControlChange();
      if (typeof this.states?.set === 'function') {
        const detailSource = isExplicitCameraStateSource(detail?.origin, detail) ? (detail.origin ?? 'interaction') : 'interaction';
        for (const key of ['autoFit', 'orbit', 'followTarget', 'targetNodeIndices']) {
          if (JSON.stringify(before?.[key]) === JSON.stringify(this._snapshotCameraControlState()?.[key])) continue;
          this.states.set(`camera.controls.${key}`, cloneSerializable(this._snapshotCameraControlState()?.[key]), {
            source: detailSource === 'test' ? 'program' : detailSource,
            reason: 'camera-interaction',
            trackOverride: true,
            applyBinding: false,
            debounceMs: 500,
            journal: false,
          });
        }
      }
      this.scheduler?.requestRender?.();
    }
    return changed;
  }

  _sampleRenderBounds(options = {}) {
    const network = this._getRenderNetwork();
    const requestedNodeIndices = normalizeNodeIndexList(options.nodeIndices);
    const nodeAttributeAccess = this._prepareRenderBoundsNodeAttributeAccess(network);
    const sampleOptions = { ...options, nodeAttributeAccess };
    if (requestedNodeIndices?.length) {
      const resolved = this._resolveCameraPositionView({ ...sampleOptions, skipDelegateSnapshot: true });
      if (resolved?.source === 'network') {
        return this._withRenderNetworkBufferAccess(network, () => {
          const positions = this._readNodePositionViewUnsafe();
          return this._sampleRenderBoundsFromPositions(positions, requestedNodeIndices, sampleOptions);
        });
      }
      if (!resolved?.view) {
        const delegate = this._positionsConfig?.delegate ?? this._activePositionDelegate ?? null;
        this._scheduleCameraDelegateTargetBounds(delegate, requestedNodeIndices, sampleOptions);
        if (sampleOptions.exactReadback === true) {
          return null;
        }
        const runtime = this._cameraControlRuntime ?? null;
        const signature = this._cameraNodeIndexSignature(requestedNodeIndices);
        if (
          runtime?.delegateTargetBoundsDelegate === delegate
          && runtime.delegateTargetBoundsSignature === signature
          && runtime.delegateTargetBounds
        ) {
          return runtime.delegateTargetBounds;
        }
        return null;
      }
      return this._withRenderNetworkBufferAccess(network, () => (
        this._sampleRenderBoundsFromPositions(resolved.view, requestedNodeIndices, sampleOptions)
      ));
    }

    const resolved = this._resolveCameraPositionView(sampleOptions);
    if (resolved?.source === 'network') {
      return this._withRenderNetworkBufferAccess(network, () => {
        const positions = this._readNodePositionViewUnsafe();
        const nodeIndices = network?.nodeIndices ?? null;
        return this._sampleRenderBoundsFromPositions(positions, nodeIndices, sampleOptions);
      });
    }
    let nodeIndices = null;
    this._withPositionBufferAccess(() => {
      const active = network?.nodeIndices ?? null;
      if (!active?.length) return;
      nodeIndices = ArrayBuffer.isView(active)
        ? new Uint32Array(active)
        : Array.from(active);
    });
    if (!nodeIndices?.length || !resolved?.view) return null;
    return this._withRenderNetworkBufferAccess(network, () => (
      this._sampleRenderBoundsFromPositions(resolved.view, nodeIndices, sampleOptions)
    ));
  }

  _cameraBoundsRequestSignature(request = {}) {
    const options = request.options ?? {};
    const nodeIndices = normalizeNodeIndexList(request.nodeIndices);
    const graphLayer = this.renderer?.graphLayer ?? null;
    const viewport = this.renderer?.camera?.viewport ?? this.size ?? {};
    return JSON.stringify({
      kind: request.kind ?? 'bounds',
      nodeIndices: nodeIndices?.length ? this._cameraNodeIndexSignature(nodeIndices) : '',
      coverage: Number.isFinite(options.coverage) ? Number(options.coverage) : null,
      paddingRatio: Number.isFinite(options.paddingRatio) ? Number(options.paddingRatio) : null,
      paddingPx: Number.isFinite(options.paddingPx) ? Number(options.paddingPx) : null,
      maxSamples: Number.isFinite(options.maxSamples) ? Math.floor(Number(options.maxSamples)) : null,
      nodeRadiusWorld: Number.isFinite(options.nodeRadiusWorld) ? Number(options.nodeRadiusWorld) : null,
      viewportWidth: Number(viewport.width ?? this.size?.width ?? 0) || 0,
      viewportHeight: Number(viewport.height ?? this.size?.height ?? 0) || 0,
      nodeSizeBase: Number(graphLayer?.nodeSizeBase ?? 0) || 0,
      nodeSizeScale: Number(graphLayer?.nodeSizeScale ?? 1) || 0,
      nodeOutlineWidthBase: Number(graphLayer?.nodeOutlineWidthBase ?? 0) || 0,
      nodeOutlineWidthScale: Number(graphLayer?.nodeOutlineWidthScale ?? 0) || 0,
    });
  }

  _prepareCameraBoundsSnapshot(request, options = {}) {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime || !request) return null;
    const signature = this._cameraBoundsRequestSignature(request);
    if (
      options.force !== true
      && runtime.cameraBoundsDirty !== true
      && runtime.cameraBoundsSignature === signature
      && runtime.cameraBoundsSnapshot
    ) {
      return runtime.cameraBoundsSnapshot;
    }
    if (this._renderNetworkBufferAccessActive()) {
      this._scheduleCameraBoundsPreparation(request, { ...options, force: true });
      return runtime.cameraBoundsSnapshot ?? null;
    }
    const bounds = this._sampleRenderBounds({
      ...(request.options ?? {}),
      nodeIndices: request.nodeIndices ?? undefined,
    });
    runtime.cameraBoundsPreparedAt = Number.isFinite(options.now) ? Number(options.now) : performance.now();
    runtime.cameraBoundsPending = false;
    runtime.cameraBoundsKind = request.kind ?? 'bounds';
    runtime.cameraBoundsSignature = signature;
    runtime.cameraBoundsSnapshot = bounds ?? null;
    runtime.cameraBoundsDirty = bounds ? false : true;
    return bounds ?? null;
  }

  _scheduleCameraBoundsPreparation(request, options = {}) {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime || !request || runtime.cameraBoundsPending === true) return false;
    runtime.cameraBoundsPending = true;
    const run = () => {
      const current = this._cameraControlRuntime ?? null;
      if (!current) return;
      try {
        this._prepareCameraBoundsSnapshot(request, { ...options, force: true });
      } finally {
        current.cameraBoundsPending = false;
      }
      this.scheduler?.requestRender?.();
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else Promise.resolve().then(run);
    return true;
  }

  _getPreparedCameraBoundsSnapshot(request) {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime || !request) return null;
    const signature = this._cameraBoundsRequestSignature(request);
    if (runtime.cameraBoundsSignature !== signature) return null;
    return runtime.cameraBoundsSnapshot ?? null;
  }

  _buildCameraFollowBoundsRequest(nodeIndices, config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS) {
    const normalized = normalizeNodeIndexList(nodeIndices);
    if (!normalized?.length) return null;
    return {
      kind: 'follow',
      nodeIndices: normalized,
      options: {
        coverage: 1,
        paddingRatio: 0,
        maxSamples: config.autoFitMaxSamples,
      },
    };
  }

  _buildCameraAutoFitBoundsRequest(nodeIndices = null, config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS) {
    const normalized = normalizeNodeIndexList(nodeIndices);
    return {
      kind: 'autoFit',
      nodeIndices: normalized?.length ? normalized : null,
      options: {
        coverage: config.autoFitCoverage,
        paddingRatio: config.autoFitPaddingRatio,
        maxSamples: config.autoFitMaxSamples,
      },
    };
  }

  _prepareCameraControlBoundsSnapshot(options = {}) {
    const runtime = this._cameraControlRuntime ?? null;
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    if (!runtime || runtime.suspended === true) return null;
    if (config.followTarget === true) {
      const targetNodeIndices = this._resolveActiveCameraTargetNodeIndices();
      const request = this._buildCameraFollowBoundsRequest(targetNodeIndices, config);
      return request ? this._prepareCameraBoundsSnapshot(request, options) : null;
    }
    if (config.autoFit !== true || runtime.autoFitDirty !== true || runtime.largeNetworkStartupActive === true) {
      return null;
    }
    const targetNodeIndices = this._resolveActiveCameraTargetNodeIndices();
    const request = this._buildCameraAutoFitBoundsRequest(targetNodeIndices, config);
    return this._prepareCameraBoundsSnapshot(request, options);
  }

  _resolveCameraFocusPose(bounds, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const captured = captureCameraPose(camera);
    const current = options.basePose ? mergeCameraPose(captured, options.basePose) : captured;
    if (!camera || !current || !bounds) return null;
    const focusMode = options.focusMode === 'centroid' ? 'centroid' : 'bbox';
    const center = focusMode === 'centroid'
      ? copyVec3(bounds.centroid ?? bounds.bboxCenter ?? [0, 0, 0], 0)
      : copyVec3(bounds.bboxCenter ?? bounds.centroid ?? [0, 0, 0], 0);
    const zoomScale = Math.max(1e-6, Number.isFinite(options.zoomScale) ? Number(options.zoomScale) : 1);
    const focusZoomTolerance = normalizeNonNegativeNumber(options.focusZoomTolerance, 0, 0, 1);
    if (camera.mode === '2d') {
      let desiredZoom = current.zoom * zoomScale;
      if (zoomScale > 1 && Number.isFinite(options.maxFocusZoom)) {
        const maxFocusZoom = Math.max(camera.minZoom ?? 1e-6, Number(options.maxFocusZoom));
        const closeEnoughZoom = current.zoom >= (maxFocusZoom / (1 + focusZoomTolerance));
        desiredZoom = closeEnoughZoom ? current.zoom : Math.min(desiredZoom, maxFocusZoom);
      }
      const nextZoom = Math.min(camera.maxZoom ?? desiredZoom, Math.max(camera.minZoom ?? desiredZoom, desiredZoom));
      return mergeCameraPose(current, {
        mode: '2d',
        projection: 'orthographic',
        target: new Float32Array(center),
        pan3D: new Float32Array([0, 0, 0]),
        pan2D: new Float32Array([
          -center[0] * nextZoom,
          -center[1] * nextZoom,
          0,
        ]),
        zoom: nextZoom,
      });
    }
    let desiredDistance = current.distance / zoomScale;
    if (zoomScale > 1 && Number.isFinite(options.minFocusDistance)) {
      const minFocusDistance = Math.max(camera.minDistance ?? 1e-6, Number(options.minFocusDistance));
      const closeEnoughDistance = current.distance <= (minFocusDistance * (1 + focusZoomTolerance));
      desiredDistance = closeEnoughDistance ? current.distance : Math.max(desiredDistance, minFocusDistance);
    }
    const nextDistance = Math.min(camera.maxDistance ?? desiredDistance, Math.max(camera.minDistance ?? desiredDistance, desiredDistance));
    return mergeCameraPose(current, {
      mode: '3d',
      target: new Float32Array(center),
      pan3D: new Float32Array([0, 0, 0]),
      distance: nextDistance,
    });
  }

  _resolveCameraFitPose(bounds, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current || !bounds) return null;

    const focusMode = options.focusMode === 'centroid' ? 'centroid' : 'bbox';
    const center = focusMode === 'centroid'
      ? copyVec3(bounds.centroid ?? bounds.bboxCenter ?? [0, 0, 0], 0)
      : copyVec3(bounds.bboxCenter ?? bounds.centroid ?? [0, 0, 0], 0);
    const fitWidth = Math.max(1e-6, bounds.fitMaxX - bounds.fitMinX);
    const fitHeight = Math.max(1e-6, bounds.fitMaxY - bounds.fitMinY);
    const fitDepth = Math.max(1e-6, bounds.fitMaxZ - bounds.fitMinZ);
    const nodeRadiusWorld = Math.max(0, Number(bounds.nodeRadiusWorld ?? 0) || 0);

    if (camera.mode === '2d') {
      const fitZoomMargin = Math.max(
        1,
        Number.isFinite(options.zoomMargin)
          ? Number(options.zoomMargin)
          : CAMERA_FIT_DEFAULT_2D_ZOOM_MARGIN,
      );
      const viewportW = Math.max(1, camera.viewport?.width ?? this.size?.width ?? 1);
      const viewportH = Math.max(1, camera.viewport?.height ?? this.size?.height ?? 1);
      const availW = Math.max(1, viewportW - bounds.paddingPx * 2);
      const availH = Math.max(1, viewportH - bounds.paddingPx * 2);
      const zoomX = availW / Math.max(1e-6, fitWidth + nodeRadiusWorld * 2);
      const zoomY = availH / Math.max(1e-6, fitHeight + nodeRadiusWorld * 2);
      const nextZoom = Math.min(zoomX, zoomY) / fitZoomMargin;
      const clampedZoom = Math.min(camera.maxZoom ?? nextZoom, Math.max(camera.minZoom ?? nextZoom, nextZoom));
      return mergeCameraPose(current, {
        mode: '2d',
        projection: 'orthographic',
        target: new Float32Array(center),
        pan3D: new Float32Array([0, 0, 0]),
        pan2D: new Float32Array([
          -center[0] * clampedZoom,
          -center[1] * clampedZoom,
          0,
        ]),
        zoom: clampedZoom,
      });
    }

    const viewportW = Math.max(1, camera.viewport?.width ?? this.size?.width ?? 1);
    const viewportH = Math.max(1, camera.viewport?.height ?? this.size?.height ?? 1);
    const availW = Math.max(1, viewportW - bounds.paddingPx * 2);
    const availH = Math.max(1, viewportH - bounds.paddingPx * 2);
    const aspect = Math.max(1e-3, viewportW / viewportH);
    const fitRotation = options.resetOrientation === true
      ? DEFAULT_MODE_SWITCH_3D_ROTATION
      : current.rotation;
    const basis = resolveCameraBasisForRotation(fitRotation);
    let maxAbsX = 0;
    let maxAbsY = 0;
    let requiredPerspectiveDistance = 0;
    const fovRad = (Number.isFinite(camera.fov) ? camera.fov : 60) * (Math.PI / 180);
    const tanHalfY = Math.max(1e-3, Math.tan(fovRad * 0.5));
    const tanHalfX = Math.max(1e-3, tanHalfY * aspect);
    const effectiveTanX = Math.max(1e-3, tanHalfX * (availW / viewportW));
    const effectiveTanY = Math.max(1e-3, tanHalfY * (availH / viewportH));
    const includeFitPoint = (x, y, z) => {
      const delta = [x - center[0], y - center[1], z - center[2]];
      const viewX = dotVec3Array(delta, basis.right);
      const viewY = dotVec3Array(delta, basis.up);
      const viewForward = dotVec3Array(delta, basis.forward);
      maxAbsX = Math.max(maxAbsX, Math.abs(viewX) + nodeRadiusWorld);
      maxAbsY = Math.max(maxAbsY, Math.abs(viewY) + nodeRadiusWorld);
      requiredPerspectiveDistance = Math.max(
        requiredPerspectiveDistance,
        ((Math.abs(viewX) + nodeRadiusWorld) / effectiveTanX) - viewForward,
        ((Math.abs(viewY) + nodeRadiusWorld) / effectiveTanY) - viewForward,
      );
    };
    let includedFitPoints = 0;
    const fitPoints = bounds.fitPoints;
    if (fitPoints && Number.isFinite(fitPoints.length) && fitPoints.length >= 3) {
      const epsilon = 1e-6;
      for (let i = 0; (i + 2) < fitPoints.length; i += 3) {
        const x = fitPoints[i];
        const y = fitPoints[i + 1];
        const z = fitPoints[i + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        if (
          x < (bounds.fitMinX - epsilon) || x > (bounds.fitMaxX + epsilon)
          || y < (bounds.fitMinY - epsilon) || y > (bounds.fitMaxY + epsilon)
          || z < (bounds.fitMinZ - epsilon) || z > (bounds.fitMaxZ + epsilon)
        ) {
          continue;
        }
        includeFitPoint(x, y, z);
        includedFitPoints += 1;
      }
    }
    if (includedFitPoints <= 0) {
      for (const x of [bounds.fitMinX, bounds.fitMaxX]) {
        for (const y of [bounds.fitMinY, bounds.fitMaxY]) {
          for (const z of [bounds.fitMinZ, bounds.fitMaxZ]) {
            includeFitPoint(x, y, z);
          }
        }
      }
    }
    const desired = camera.projection === 'orthographic'
      ? Math.max(
          (maxAbsY * viewportH) / availH,
          (maxAbsX * viewportW) / (availW * aspect),
        )
      : requiredPerspectiveDistance;
    const distance = Math.min(camera.maxDistance ?? desired, Math.max(camera.minDistance ?? desired, desired));
    return mergeCameraPose(current, {
      mode: '3d',
      target: new Float32Array(center),
      pan3D: new Float32Array([0, 0, 0]),
      pan2D: options.resetOrientation === true ? new Float32Array([0, 0, 0]) : current.pan2D,
      distance,
      rotation: options.resetOrientation === true
        ? new Float32Array(fitRotation)
        : current.rotation,
    });
  }

  _applyCameraPoseWithOptionalAnimation(nextPose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current || !nextPose) return false;
    const animate = options.animate === true;
    const durationMs = normalizeNonNegativeNumber(
      options.durationMs,
      this._cameraControlConfig?.animationDurationMs ?? CAMERA_CONTROL_DEFAULTS.animationDurationMs,
      0,
      60000,
    );
    if (animate && durationMs > 0) {
      this._ensureCameraTransitionController().transition(camera, {
        fromPose: current,
        toPose: nextPose,
        durationMs,
      });
    } else {
      applyCameraPose(camera, nextPose);
      this.scheduler?.requestRender?.();
    }
    return true;
  }

  _getLargeNetworkStartupCounts(targetNodeIndices = null) {
    const network = this._getRenderNetwork?.() ?? this.network ?? null;
    const nodeCount = targetNodeIndices?.length ?? Math.max(0, Math.floor(Number(network?.nodeCount) || 0));
    const edgeCount = targetNodeIndices?.length ? 0 : Math.max(0, Math.floor(Number(network?.edgeCount) || 0));
    return { nodeCount, edgeCount };
  }

  _shouldUseLargeNetworkStartupFit(options = {}, targetNodeIndices = null) {
    if (targetNodeIndices?.length) return false;
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    if (options.largeNetworkStartupFit !== true || config.largeNetworkStartupFit === false) return false;
    if (config.autoFit !== true) return false;
    const { nodeCount, edgeCount } = this._getLargeNetworkStartupCounts(targetNodeIndices);
    const nodeThreshold = normalizePositiveInteger(
      config.largeNetworkStartupNodeThreshold,
      LARGE_NETWORK_STARTUP_NODE_THRESHOLD,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const edgeThreshold = normalizePositiveInteger(
      config.largeNetworkStartupEdgeThreshold,
      LARGE_NETWORK_STARTUP_EDGE_THRESHOLD,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    return nodeCount >= nodeThreshold || edgeCount >= edgeThreshold;
  }

  _resolveLargeNetworkStartupPose(fitPose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    if (!camera || !fitPose) return null;
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    const scale = normalizeNonNegativeNumber(
      options.largeNetworkStartupScale ?? config.largeNetworkStartupScale,
      LARGE_NETWORK_STARTUP_SCALE,
      1,
      64,
    );
    if (scale <= 1) return null;
    if (fitPose.mode === '2d') {
      const zoom = Math.max(camera.minZoom ?? 1e-6, Number(fitPose.zoom ?? camera.zoom ?? 1) / scale);
      const sourceZoom = Math.max(1e-6, Number(fitPose.zoom ?? 1) || 1);
      const panScale = zoom / sourceZoom;
      return mergeCameraPose(fitPose, {
        zoom,
        pan2D: new Float32Array([
          (Number(fitPose.pan2D?.[0]) || 0) * panScale,
          (Number(fitPose.pan2D?.[1]) || 0) * panScale,
          (Number(fitPose.pan2D?.[2]) || 0) * panScale,
        ]),
      });
    }
    const distance = Math.min(
      camera.maxDistance ?? Number.POSITIVE_INFINITY,
      Math.max(camera.minDistance ?? 1e-6, Number(fitPose.distance ?? camera.distance ?? 800) * scale),
    );
    return mergeCameraPose(fitPose, { distance });
  }

  _applyLargeNetworkStartupFit(fitPose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const runtime = this._cameraControlRuntime ?? null;
    if (!camera || !fitPose) return false;
    const startPose = this._resolveLargeNetworkStartupPose(fitPose, options);
    if (!startPose) return false;
    const durationMs = normalizeNonNegativeNumber(
      options.largeNetworkStartupDurationMs ?? this._cameraControlConfig?.largeNetworkStartupDurationMs,
      LARGE_NETWORK_STARTUP_DURATION_MS,
      0,
      60000,
    );
    this._stopCameraControlPoseInterpolation();
    applyCameraPose(camera, startPose);
    const gate = this._startupGate ?? null;
    const delaySettleUntilFirstVisibleFrame = gate?.active === true && gate.firstVisibleFrameDrawn !== true;
    if (delaySettleUntilFirstVisibleFrame && runtime) {
      runtime.pendingLargeNetworkStartupSettle = { pose: fitPose, durationMs };
    } else {
      this._queueCameraControlPose(fitPose, {
        animate: durationMs > 0,
        durationMs,
      });
    }
    if (runtime) {
      runtime.largeNetworkStartupActive = durationMs > 0
        && (runtime.controlPoseActive === true || runtime.pendingLargeNetworkStartupSettle != null);
      runtime.autoFitDirty = false;
      runtime.lastAutoFitAt = performance.now();
      runtime.lastFitSignature = this._cameraFitSignature(fitPose);
    }
    this.scheduler?.requestRender?.();
    return true;
  }

  _refreshLargeNetworkStartupFit(options = {}) {
    const gate = this._startupGate ?? null;
    const runtime = this._cameraControlRuntime ?? null;
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    const camera = this.renderer?.camera ?? null;
    if (!gate || gate.active !== true || gate.firstVisibleFrameDrawn === true) return false;
    if (!runtime || !camera || config.largeNetworkStartupFit === false || config.autoFit !== true) return false;
    if (!this._shouldUseLargeNetworkStartupFit({ largeNetworkStartupFit: true }, null)) return false;
    const layoutIteration = Math.max(0, Math.floor(Number(gate.layoutIterations) || 0));
    if (
      options.force !== true
      && runtime.largeNetworkStartupRefreshIteration === layoutIteration
      && runtime.pendingLargeNetworkStartupSettle
    ) {
      return false;
    }
    const sampledBounds = this._sampleRenderBounds({
      coverage: config.autoFitCoverage,
      paddingRatio: config.autoFitPaddingRatio,
      maxSamples: config.autoFitMaxSamples,
    });
    if (!sampledBounds) return false;
    const fitPose = this._resolveCameraFitPose(sampledBounds, {
      resetOrientation: false,
      focusMode: 'bbox',
    });
    if (!fitPose) return false;
    const refreshed = this._applyLargeNetworkStartupFit(fitPose, {
      largeNetworkStartupFit: true,
      largeNetworkStartupScale: config.largeNetworkStartupScale,
      largeNetworkStartupDurationMs: config.largeNetworkStartupDurationMs,
    });
    if (refreshed) {
      runtime.largeNetworkStartupRefreshIteration = layoutIteration;
    }
    return refreshed;
  }

  _queuePendingLargeNetworkStartupSettle() {
    const runtime = this._cameraControlRuntime ?? null;
    const pending = runtime?.pendingLargeNetworkStartupSettle ?? null;
    if (!runtime || !pending?.pose) return false;
    runtime.pendingLargeNetworkStartupSettle = null;
    const queued = this._queueCameraControlPose(pending.pose, {
      animate: pending.durationMs > 0,
      durationMs: pending.durationMs,
    });
    runtime.largeNetworkStartupActive = queued && pending.durationMs > 0 && runtime.controlPoseActive === true;
    return queued;
  }

  _cameraPoseSignature(pose) {
    if (!pose) return '';
    return JSON.stringify([
      pose.mode,
      pose.projection,
      Number(pose.zoom ?? 0).toFixed(6),
      Number(pose.distance ?? 0).toFixed(6),
      ...(Array.from(pose.target ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.pan2D ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.pan3D ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.rotation ?? []).map((value) => Number(value).toFixed(6))),
    ]);
  }

  _cameraFitSignature(pose) {
    if (!pose) return '';
    return JSON.stringify([
      pose.mode,
      pose.projection,
      Number(pose.zoom ?? 0).toFixed(6),
      Number(pose.distance ?? 0).toFixed(6),
      ...(Array.from(pose.target ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.pan2D ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.pan3D ?? []).map((value) => Number(value).toFixed(6))),
    ]);
  }

  _stopCameraControlPoseInterpolation() {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime) return;
    runtime.controlPoseActive = false;
    runtime.controlPoseFrom = null;
    runtime.controlPoseTo = null;
    runtime.controlPoseStartedAt = 0;
    runtime.controlPoseDurationMs = 0;
    runtime.controlPoseSignature = '';
    runtime.controlPosePreserveRotation = false;
    runtime.largeNetworkStartupActive = false;
    runtime.pendingLargeNetworkStartupSettle = null;
    runtime.largeNetworkStartupRefreshIteration = -1;
  }

  _preserveCurrentCameraRotation(pose) {
    const camera = this.renderer?.camera ?? null;
    if (!pose || camera?.mode !== '3d') return pose;
    const current = captureCameraPose(camera);
    if (!current?.rotation) return pose;
    return mergeCameraPose(pose, { rotation: current.rotation });
  }

  _resolveCameraControlPoseInterpolation(timestamp = performance.now()) {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime || runtime.controlPoseActive !== true || !runtime.controlPoseFrom || !runtime.controlPoseTo) {
      return { pose: null, active: false, changed: false };
    }
    const durationMs = Math.max(0, Number(runtime.controlPoseDurationMs) || 0);
    if (durationMs <= 0) {
      const pose = runtime.controlPosePreserveRotation === true
        ? this._preserveCurrentCameraRotation(runtime.controlPoseTo)
        : runtime.controlPoseTo;
      runtime.controlPoseActive = false;
      runtime.controlPoseFrom = null;
      runtime.controlPoseTo = null;
      runtime.controlPosePreserveRotation = false;
      runtime.largeNetworkStartupActive = false;
      return { pose, active: false, changed: true };
    }
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const t = clamp((now - runtime.controlPoseStartedAt) / durationMs, 0, 1);
    let pose = interpolateCameraPose(runtime.controlPoseFrom, runtime.controlPoseTo, t);
    if (runtime.controlPosePreserveRotation === true) {
      pose = this._preserveCurrentCameraRotation(pose);
    }
    if (t >= 1) {
      const completedPose = runtime.controlPosePreserveRotation === true
        ? this._preserveCurrentCameraRotation(runtime.controlPoseTo)
        : runtime.controlPoseTo;
      runtime.controlPoseActive = false;
      runtime.controlPoseFrom = null;
      runtime.controlPoseTo = null;
      runtime.controlPosePreserveRotation = false;
      runtime.largeNetworkStartupActive = false;
      return { pose: completedPose ?? pose, active: false, changed: true };
    }
    return { pose, active: true, changed: true };
  }

  _queueCameraControlPose(nextPose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const runtime = this._cameraControlRuntime ?? null;
    if (!camera || !runtime || !nextPose) return false;
    const preserveRotation = options.preserveRotation === true && camera.mode === '3d';
    const signature = preserveRotation
      ? `${this._cameraFitSignature(nextPose)}|preserve-rotation`
      : this._cameraPoseSignature(nextPose);
    const animate = options.animate === true;
    const durationMs = normalizeNonNegativeNumber(
      options.durationMs,
      this._cameraControlConfig?.animationDurationMs ?? CAMERA_CONTROL_DEFAULTS.animationDurationMs,
      0,
      60000,
    );
    if (signature === runtime.controlPoseSignature && runtime.controlPoseActive === (animate && durationMs > 0)) {
      return false;
    }
    if (!(animate && durationMs > 0)) {
      this._stopCameraControlPoseInterpolation();
      runtime.controlPoseSignature = signature;
      applyCameraPose(camera, preserveRotation ? this._preserveCurrentCameraRotation(nextPose) : nextPose);
      this.scheduler?.requestRender?.();
      return true;
    }
    const now = performance.now();
    const currentPose = runtime.controlPoseActive === true
      ? (this._resolveCameraControlPoseInterpolation(now).pose ?? captureCameraPose(camera))
      : captureCameraPose(camera);
    runtime.controlPoseActive = true;
    runtime.controlPoseFrom = currentPose;
    runtime.controlPoseTo = nextPose;
    runtime.controlPoseStartedAt = now;
    runtime.controlPoseDurationMs = durationMs;
    runtime.controlPoseSignature = signature;
    runtime.controlPosePreserveRotation = preserveRotation;
    this.scheduler?.requestRender?.();
    return true;
  }

  _stepCameraControlPoseInterpolation(timestamp = performance.now()) {
    const camera = this.renderer?.camera ?? null;
    if (!camera) return false;
    const resolved = this._resolveCameraControlPoseInterpolation(timestamp);
    if (!resolved.pose) return false;
    applyCameraPose(camera, resolved.pose);
    return resolved.active === true;
  }

  _stepCameraControlRenderPump(timestamp = performance.now()) {
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const camera = this.renderer?.camera ?? null;
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    const runtime = this._cameraControlRuntime ?? null;
    if (!camera || !runtime) return false;
    if (runtime.suspended === true) return false;
    let wantsRender = false;

    if (config.followTarget === true) {
      const activeTargetNodeIndices = this._resolveActiveCameraTargetNodeIndices();
      if (activeTargetNodeIndices?.length) {
        const followIntervalMs = normalizeNonNegativeNumber(
          config.followUpdateIntervalMs,
          CAMERA_CONTROL_DEFAULTS.followUpdateIntervalMs,
          0,
          60000,
        );
        if (
          !Number.isFinite(runtime.lastFollowUpdateAt)
          || followIntervalMs <= 0
          || (now - runtime.lastFollowUpdateAt) >= followIntervalMs
        ) {
          runtime.lastFollowUpdateAt = now;
          const boundsRequest = this._buildCameraFollowBoundsRequest(activeTargetNodeIndices, config);
          const sampledBounds = this._getPreparedCameraBoundsSnapshot(boundsRequest);
          if (!sampledBounds) {
            this._scheduleCameraBoundsPreparation(boundsRequest, { now, reason: 'follow' });
          }
          const followPose = this._resolveCameraFocusPose(sampledBounds, {
            focusMode: 'centroid',
            basePose: runtime.controlPoseTo ?? null,
          });
          if (followPose) {
            const currentSignature = this._cameraPoseSignature(captureCameraPose(camera));
            const followSignature = this._cameraPoseSignature(followPose);
            if (followSignature && followSignature !== currentSignature) {
              const queued = this._queueCameraControlPose(followPose, {
                animate: config.animation,
                durationMs: config.animationDurationMs,
                preserveRotation: camera.mode === '3d',
              });
              wantsRender ||= queued;
            }
          }
        }
      }
    } else if (
      config.autoFit === true
      && runtime.autoFitDirty === true
      && runtime.largeNetworkStartupActive !== true
    ) {
      const activeTargetNodeIndices = this._resolveActiveCameraTargetNodeIndices();
      const nodeCount = activeTargetNodeIndices?.length ?? this._getRenderNetwork()?.nodeCount ?? 0;
      const effectiveIntervalMs = this._resolveCameraAutoFitIntervalMs(nodeCount);
      if (!Number.isFinite(runtime.lastAutoFitAt) || (now - runtime.lastAutoFitAt) >= effectiveIntervalMs) {
        runtime.lastAutoFitAt = now;
        const boundsRequest = this._buildCameraAutoFitBoundsRequest(activeTargetNodeIndices, config);
        const sampledBounds = this._getPreparedCameraBoundsSnapshot(boundsRequest);
        if (!sampledBounds) {
          runtime.autoFitDirty = nodeCount > 0;
          this._scheduleCameraBoundsPreparation(boundsRequest, { now, reason: 'auto-fit' });
        } else {
          const fitPose = this._resolveCameraFitPose(sampledBounds, {
            resetOrientation: false,
            focusMode: activeTargetNodeIndices?.length ? 'centroid' : 'bbox',
          });
          const fitSignature = this._cameraFitSignature(fitPose);
          const currentFitSignature = this._cameraFitSignature(captureCameraPose(camera));
          if (fitSignature) {
            runtime.lastFitSignature = fitSignature;
          }
          runtime.autoFitDirty = false;
          if (fitSignature && fitPose && fitSignature !== currentFitSignature) {
            this._queueCameraControlPose(fitPose, {
              animate: config.animation,
              durationMs: config.animationDurationMs,
              preserveRotation: camera.mode === '3d',
            });
          }
        }
      }
    }

    const interpolated = this._resolveCameraControlPoseInterpolation(now);
    let finalPose = interpolated.pose ?? captureCameraPose(camera);
    wantsRender ||= interpolated.active === true;
    if (!finalPose) return wantsRender;

    if (camera.mode === '3d') {
      const lastOrbitAt = Number.isFinite(runtime.lastOrbitAt) && runtime.lastOrbitAt > 0 ? runtime.lastOrbitAt : now;
      const deltaMs = Math.max(0, now - lastOrbitAt);
      const deltaSeconds = Math.max(0, Math.min(0.1, deltaMs / 1000));
      runtime.lastOrbitAt = now;

      const previousOrbitAngle = clamp(
        toFiniteNumber(runtime.appliedOrbitAngle, config.orbitAngle ?? 0),
        -89,
        89,
      );
      const targetOrbitAngle = clamp(toFiniteNumber(config.orbitAngle, previousOrbitAngle), -89, 89);
      let nextOrbitAngle = targetOrbitAngle;
      if (config.animation === true) {
        const durationMs = normalizeNonNegativeNumber(
          config.animationDurationMs,
          CAMERA_CONTROL_DEFAULTS.animationDurationMs,
          0,
          60000,
        );
        if (durationMs > 0 && deltaMs > 0) {
          const tauMs = Math.max(1, durationMs / 4);
          const alpha = 1 - Math.exp(-deltaMs / tauMs);
          nextOrbitAngle = previousOrbitAngle + ((targetOrbitAngle - previousOrbitAngle) * clamp(alpha, 0, 1));
        }
      }
      runtime.appliedOrbitAngle = nextOrbitAngle;

      const pitchRadians = (nextOrbitAngle - previousOrbitAngle) * (Math.PI / 180);
      const yawRadians = config.orbit === true && deltaSeconds > 0 && config.orbitSpeed > 0
        ? (Math.PI * 2) * config.orbitSpeed * config.orbitDirection * deltaSeconds
        : 0;
      if (Math.abs(yawRadians) > 1e-12 || Math.abs(pitchRadians) > 1e-12) {
        finalPose = mergeCameraPose(finalPose, {
          rotation: this._composeOrbitRotation(finalPose.rotation, {
            yawRadians,
            pitchRadians,
            axis: config.orbitAxis ?? CAMERA_CONTROL_DEFAULTS.orbitAxis,
          }),
        });
        wantsRender = true;
      }
    } else {
      runtime.lastOrbitAt = now;
      runtime.appliedOrbitAngle = clamp(toFiniteNumber(config.orbitAngle, 0), -89, 89);
    }

    if (interpolated.changed === true || wantsRender) {
      applyCameraPose(camera, finalPose);
    }

    return wantsRender;
  }

  _collapseNodeDepthTo2DPlane(zValue = 0) {
    const targetZ = Number.isFinite(zValue) ? zValue : 0;
    let changed = false;
    this._withPositionBufferAccess(() => {
      const positions = this._readNodePositionViewUnsafe();
      if (!positions?.length) return;
      for (let offset = 0; offset < positions.length; offset += 3) {
        if (!Number.isFinite(positions[offset + 2])) continue;
        if (Math.abs(positions[offset + 2] - targetZ) <= 1e-9) continue;
        positions[offset + 2] = targetZ;
        changed = true;
      }
    });

    if (changed) {
      this.visuals?.markPositionsDirty?.();
    }
    return changed;
  }

  async _collapseDelegateDepthTo2DPlane(delegate, zValue = 0) {
    if (!delegate || typeof delegate.flattenNodeDepthToPlane !== 'function') return false;
    try {
      return (await delegate.flattenNodeDepthToPlane(
        this._buildPositionDelegateContext({ reason: 'mode-switch' }),
        zValue,
      )) === true;
    } catch (error) {
      console.warn('Helios.setMode(): failed to collapse delegate depth while switching to 2D.', error);
      return false;
    }
  }

  async _collapseActivePositionDepthTo2DPlane(zValue = 0, delegate = null) {
    const collapsedNetwork = this._collapseNodeDepthTo2DPlane(zValue);
    const collapsedDelegate = await this._collapseDelegateDepthTo2DPlane(delegate, zValue);
    if (collapsedDelegate) {
      this.visuals?.markPositionsDirty?.();
    }
    if (collapsedNetwork || collapsedDelegate) {
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
    }
    return collapsedNetwork || collapsedDelegate;
  }

  _build3DModeTransitionPoses(bounds, projection = 'perspective') {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current) return null;

    const centerZ = Number.isFinite(bounds?.sumZ) && Number.isFinite(bounds?.count) && bounds.count > 0
      ? (bounds.sumZ / bounds.count)
      : 0;
    const startCenter = current.mode === '3d'
      ? resolve3DCenterFromPose(current)
      : resolve2DCenterFromPose(current, centerZ);
    const startDistance = current.mode === '3d'
      ? Math.max(camera.minDistance ?? (10 / 3), current.distance)
      : clamp(
        estimate3DDistanceFrom2DZoom(current),
        camera.minDistance ?? (10 / 3),
        camera.maxDistance ?? 75000,
      );

    const startPose = {
      ...current,
      mode: '3d',
      projection,
      target: new Float32Array(startCenter),
      pan3D: new Float32Array([0, 0, 0]),
      pan2D: copyVec3(current.pan2D),
      distance: startDistance,
      rotation: current.mode === '3d'
        ? current.rotation
        : new Float32Array([0, 0, 0, 1]),
    };

    const targetDistance = bounds
      ? (() => {
        const w = Math.max(1e-6, bounds.maxX - bounds.minX);
        const h = Math.max(1e-6, bounds.maxY - bounds.minY);
        const dz = Math.max(1e-6, bounds.maxZ - bounds.minZ);
        const radius = 0.5 * Math.hypot(w, h, dz);
        const fovRad = (Number.isFinite(current.fov) ? current.fov : 60) * (Math.PI / 180);
        const distPerspective = radius / Math.max(1e-3, Math.tan(fovRad * 0.5));
        const desired = projection === 'orthographic' ? radius * 1.2 : distPerspective * 1.25;
        return clamp(
          desired,
          camera.minDistance ?? desired,
          camera.maxDistance ?? desired,
        );
      })()
      : startDistance;
    const targetCenter = bounds
      ? [
        Number.isFinite(bounds.sumX) && bounds.count > 0 ? (bounds.sumX / bounds.count) : startCenter[0],
        Number.isFinite(bounds.sumY) && bounds.count > 0 ? (bounds.sumY / bounds.count) : startCenter[1],
        centerZ,
      ]
      : startCenter;

    return {
      startPose,
      endPose: {
        ...startPose,
        target: new Float32Array(targetCenter),
        pan3D: new Float32Array([0, 0, 0]),
        distance: targetDistance,
        rotation: new Float32Array(DEFAULT_MODE_SWITCH_3D_ROTATION),
        pan2D: new Float32Array([0, 0, 0]),
      },
    };
  }

  _build2DModeTransitionPoses(bounds) {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current) return null;

    const source3D = current.mode === '3d'
      ? current
      : this._build3DModeTransitionPoses(bounds, 'perspective')?.endPose ?? null;
    if (!source3D) return null;

    const center = bounds
      ? [
        Number.isFinite(bounds.sumX) && bounds.count > 0 ? (bounds.sumX / bounds.count) : resolve3DCenterFromPose(source3D)[0],
        Number.isFinite(bounds.sumY) && bounds.count > 0 ? (bounds.sumY / bounds.count) : resolve3DCenterFromPose(source3D)[1],
        Number.isFinite(bounds.sumZ) && bounds.count > 0 ? (bounds.sumZ / bounds.count) : resolve3DCenterFromPose(source3D)[2],
      ]
      : resolve3DCenterFromPose(source3D);

    const zoom = bounds
      ? (() => {
        const w = Math.max(1e-6, bounds.maxX - bounds.minX);
        const h = Math.max(1e-6, bounds.maxY - bounds.minY);
        const viewportW = Math.max(1, current.viewport?.width ?? this.size?.width ?? 1);
        const viewportH = Math.max(1, current.viewport?.height ?? this.size?.height ?? 1);
        const availW = Math.max(1, viewportW - 48);
        const availH = Math.max(1, viewportH - 48);
        return clamp(
          Math.min(availW / w, availH / h) / CAMERA_FIT_DEFAULT_2D_ZOOM_MARGIN,
          camera.minZoom ?? (0.001 / 3),
          camera.maxZoom ?? 30,
        );
      })()
      : clamp(
        estimate2DZoomFrom3DDistance(source3D),
        camera.minZoom ?? (0.001 / 3),
        camera.maxZoom ?? 30,
      );

    const matchedPerspectiveDistance = clamp(
      estimate3DDistanceFrom2DZoom({
        ...current,
        zoom,
      }),
      camera.minDistance ?? (10 / 3),
      camera.maxDistance ?? 75000,
    );

    const pre2D3D = {
      ...source3D,
      mode: '3d',
      projection: 'perspective',
      target: new Float32Array(center),
      pan3D: new Float32Array([0, 0, 0]),
      distance: matchedPerspectiveDistance,
      rotation: new Float32Array([0, 0, 0, 1]),
    };

    return {
      startPose: source3D,
      pre2D3D,
      start2DPose: {
        ...pre2D3D,
        mode: '2d',
        projection: 'orthographic',
        target: new Float32Array(center),
        pan3D: new Float32Array([0, 0, 0]),
        pan2D: new Float32Array([
          -center[0] * zoom,
          -center[1] * zoom,
          0,
        ]),
        zoom,
        rotation: new Float32Array([0, 0, 0, 1]),
      },
      endPose: {
        ...current,
        mode: '2d',
        projection: 'orthographic',
        target: new Float32Array(center),
        pan3D: new Float32Array([0, 0, 0]),
        pan2D: new Float32Array([
          -center[0] * zoom,
          -center[1] * zoom,
          0,
        ]),
        zoom,
        rotation: new Float32Array([0, 0, 0, 1]),
      },
    };
  }

  _applyModeToLayoutOptions(mode) {
    const layoutOption = this.options?.layout ?? null;
    if (!layoutOption || isLayoutInstance(layoutOption) || typeof layoutOption !== 'object') return;
    const nextMode = mode === '3d' ? '3d' : '2d';
    layoutOption.options = { ...(layoutOption.options ?? {}) };
    if (
      layoutOption.type === 'gpu-force'
      || layoutOption.type === 'gpuforce'
      || layoutOption.type === 'worker'
      || layoutOption.type === 'd3force3d'
      || layoutOption.type === 'd3-force-3d'
    ) {
      layoutOption.options.mode = nextMode;
    }
    if (layoutOption.type === 'd3force3d' || layoutOption.type === 'd3-force-3d') {
      layoutOption.options.settings = {
        ...(layoutOption.options.settings ?? {}),
        use2D: nextMode !== '3d',
      };
    }
  }

  _applyModeToActiveLayout(mode) {
    const layout = this._layout ?? null;
    const nextMode = mode === '3d' ? '3d' : '2d';
    if (!layout || typeof layout !== 'object') return false;
    if (layout instanceof D3Force3DLayout) {
      layout.setSettings?.({ mode: nextMode, use2D: nextMode !== '3d' });
      return true;
    }
    if (layout instanceof GpuForceLayout || layout instanceof WorkerLayout) {
      layout.setSettings?.({ mode: nextMode });
      return true;
    }
    if (typeof layout.setSettings === 'function') {
      layout.setSettings({ mode: nextMode });
      return true;
    }
    return false;
  }

  async _createRendererAndTrackers(options = {}) {
    const extraStateSlotsRaw = this.options.extraStateSlots ?? 1;
    const extraStateSlots = Number.isFinite(extraStateSlotsRaw) ? Math.max(0, Math.floor(extraStateSlotsRaw)) : 1;
    const stateSlots = Math.min(32, 3 + extraStateSlots);
    const renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
      forceWebGPU: this.options.renderer === 'webgpu',
      mode: this.options.mode ?? '3d',
      projection: this.options.projection ?? 'perspective',
      suppressBrowserGestures: this.options.suppressBrowserGestures !== false,
      antialias: this.options.antialias,
      powerPreference: this.options.powerPreference,
      webglContextAttributes: this.options.webglContextAttributes,
      webgpuAdapterOptions: this.options.webgpuAdapterOptions,
      webgpuDeviceDescriptor: this.options.webgpuDeviceDescriptor,
      webgpuCanvasConfiguration: this.options.webgpuCanvasConfiguration,
      supersampling: this.options.supersampling,
      forceSupersample: this.options.forceSupersample,
      supersamplingAutoFactor: this.options.supersamplingAutoFactor,
      supersamplingAutoThreshold: this.options.supersamplingAutoThreshold,
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
      edgeEndpointTrim: this.options.edgeEndpointTrim,
      edgeWidthClampToNodeDiameter: this.options.edgeWidthClampToNodeDiameter,
      nodeBlendWithEdges: this.options.nodeBlendWithEdges,
      edgeDepthWrite: this.options.edgeDepthWrite,
      edgeFastRendering: this.options.edgeFastRendering,
      ambientOcclusionEnabled: this.options.ambientOcclusionEnabled,
      ambientOcclusionNodes: this.options.ambientOcclusionNodes,
      ambientOcclusionEdges: this.options.ambientOcclusionEdges,
      ambientOcclusionStrength: this.options.ambientOcclusionStrength,
      ambientOcclusionRadius: this.options.ambientOcclusionRadius,
      ambientOcclusionBias: this.options.ambientOcclusionBias,
      ambientOcclusionMode: this.options.ambientOcclusionMode,
      ambientOcclusionIntensityScale: this.options.ambientOcclusionIntensityScale,
      ambientOcclusionIntensityShift: this.options.ambientOcclusionIntensityShift,
      ambientOcclusionQuality: this.options.ambientOcclusionQuality,
      stateSlots,
      ...options,
    });
    this.renderer = renderer;
    this._applyPendingRendererProps();
    this._applyPositionPipelineToRenderer();
    this._attachDensityLayer();
    this._refreshUIBindings();
    this._applyCachedStateStyles();
    if (this._hoverStyleFromHighlight === true) this._copyHighlightStyleToHover();
    this.attributeTracker?.destroy?.();
    this.attributeTracker = new AttributeTracker(this.renderer);
    this.attributeTracker.resize(this.layers.size);
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
    }
    this._reapplyBehaviorRendererBindings();
    if (this.mappersDirty) {
      this._applyMappersSafely();
    }
    if (this.renderer?.camera?.setChangeListener) {
      this.renderer.camera.setChangeListener((detail) => {
        this.scheduler.requestRender();
        if (detail?.origin === 'interaction') {
          this._disableAutomaticCameraControlFromInteraction(detail);
        }
        this._scheduleCameraMove(detail);
        this.debug.log('helios', 'Camera change requested render');
      });
    }
    this._applyPickingConfig();
    this._labels?.requestFullReselect?.('renderer-created');
  }

  _resetMappersToDefault(network = this.network) {
    const defaults = createDefaultMappers(network);
    this.nodeMapper = new MapperCollection('node', network, this.markMappersDirty, this.debug);
    this.edgeMapper = new MapperCollection('edge', network, this.markMappersDirty, this.debug);
    if (defaults?.nodeMapper) this.nodeMapper.setDefault(defaults.nodeMapper);
    if (defaults?.edgeMapper) this.edgeMapper.setDefault(defaults.edgeMapper);
    this.mappersDirty = true;
  }

  _applyMappersSafely() {
    if (!this.mappersDirty) return true;
    if (!this.visuals) return false;
    try {
      const nodeMapper = this.nodeMapper.toCombinedMapper();
      const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
      this.visuals.applyMappers({ nodeMapper, edgeMapper });
      this.mappersDirty = false;
      return true;
    } catch (error) {
      this.debug?.log?.('mapper', 'Failed to apply mappers; falling back to defaults', {
        error,
        nodeCount: this.network?.nodeCount ?? 0,
        edgeCount: this.network?.edgeCount ?? 0,
      });
      console.warn('Helios: failed to apply active mappers; falling back to default mappers.', error);
      try {
        this._resetMappersToDefault(this.network);
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
        return true;
      } catch (fallbackError) {
        // Last resort: avoid crashing the scheduler loop.
        this.mappersDirty = false;
        console.warn('Helios: failed to apply default mappers after fallback.', fallbackError);
        // eslint-disable-next-line no-console
        console.error('Failed to apply default mappers after fallback', fallbackError);
        return false;
      }
    }
  }

  _ensureGraphFilterState() {
    if (this._graphFilterState) return this._graphFilterState;
    const baseNetwork = this.network ?? null;
    this._graphFilterState = {
      enabled: false,
      scope: GRAPH_FILTER_SCOPE_RENDER,
      options: null,
      signature: null,
      nodeIndices: null,
      edgeIndices: null,
      nodeSelector: null,
      edgeSelector: null,
      filteredNetwork: null,
      renderNetwork: baseNetwork,
      layoutNetwork: baseNetwork,
      version: 0,
      stats: null,
      lastError: null,
    };
    return this._graphFilterState;
  }

  _disposeSelector(selector) {
    if (!selector || typeof selector !== 'object') return;
    try {
      selector.dispose?.();
    } catch (error) {
      warnOnce(
        this,
        'graph-filter-selector-dispose',
        'Helios: failed to dispose graph filter selector.',
        { error },
      );
    }
  }

  _disposeGraphFilterSelectors(state) {
    if (!state || typeof state !== 'object') return;
    this._disposeSelector(state.nodeSelector);
    this._disposeSelector(state.edgeSelector);
    state.nodeSelector = null;
    state.edgeSelector = null;
  }

  _captureGraphFilterSignature(state) {
    const network = this.network ?? null;
    let topologyNode = 0;
    let topologyEdge = 0;
    if (typeof network?.getTopologyVersions === 'function') {
      try {
        const versions = network.getTopologyVersions() ?? {};
        topologyNode = safeNumber(versions.node, 0);
        topologyEdge = safeNumber(versions.edge, 0);
      } catch (error) {
        warnOnce(
          this,
          'graph-filter-topology-versions',
          'Helios: failed to read graph-filter topology versions; using zero versions.',
          { error },
        );
        topologyNode = 0;
        topologyEdge = 0;
      }
    } else {
      topologyNode = safeNumber(network?.nodeCount, 0);
      topologyEdge = safeNumber(network?.edgeCount, 0);
    }
    const options = state?.options ?? {};
    const nodeSelector = options?.nodeSelector ?? null;
    const edgeSelector = options?.edgeSelector ?? null;
    const nodeSelection = options?.nodeSelection ?? null;
    const edgeSelection = options?.edgeSelection ?? null;
    return {
      topologyNode,
      topologyEdge,
      nodeSelectorRef: nodeSelector,
      edgeSelectorRef: edgeSelector,
      nodeSelectorVersion: safeNumber(nodeSelector?.version, 0),
      edgeSelectorVersion: safeNumber(edgeSelector?.version, 0),
      nodeSelectionRef: nodeSelection,
      edgeSelectionRef: edgeSelection,
      nodeSelectionVersion: safeNumber(nodeSelection?.version, 0),
      edgeSelectionVersion: safeNumber(edgeSelection?.version, 0),
      nodeSelectionLength: safeLength(nodeSelection),
      edgeSelectionLength: safeLength(edgeSelection),
    };
  }

  _isSameGraphFilterSignature(a, b) {
    if (!a || !b) return false;
    return (
      a.topologyNode === b.topologyNode
      && a.topologyEdge === b.topologyEdge
      && a.nodeSelectorRef === b.nodeSelectorRef
      && a.edgeSelectorRef === b.edgeSelectorRef
      && a.nodeSelectorVersion === b.nodeSelectorVersion
      && a.edgeSelectorVersion === b.edgeSelectorVersion
      && a.nodeSelectionRef === b.nodeSelectionRef
      && a.edgeSelectionRef === b.edgeSelectionRef
      && a.nodeSelectionVersion === b.nodeSelectionVersion
      && a.edgeSelectionVersion === b.edgeSelectionVersion
      && a.nodeSelectionLength === b.nodeSelectionLength
      && a.edgeSelectionLength === b.edgeSelectionLength
    );
  }

  _createFilteredNetworkProxy({
    baseNetwork,
    nodeIndices = null,
    edgeIndices = null,
    nodeSelector = null,
    edgeSelector = null,
    version,
  }) {
    const fallbackNodeIndices = nodeIndices instanceof Uint32Array ? nodeIndices : new Uint32Array(0);
    const fallbackEdgeIndices = edgeIndices instanceof Uint32Array ? edgeIndices : new Uint32Array(0);
    const selectorNode = nodeSelector && typeof nodeSelector === 'object' ? nodeSelector : null;
    const selectorEdge = edgeSelector && typeof edgeSelector === 'object' ? edgeSelector : null;
    const emptyIndices = new Uint32Array(0);
    const orderVersions = { node: 0, edge: 0 };
    const dirtyRanges = { node: null, edge: null };
    const currentVersion = (scope) => `${safeNumber(version, 0)}:${orderVersions[scope] ?? 0}`;
    const mergeDirtyRange = (scope, start, count) => {
      if (!(count > 0)) return null;
      const current = dirtyRanges[scope] ?? null;
      const nextStart = Math.max(0, Math.floor(Number(start) || 0));
      const nextEnd = nextStart + Math.max(0, Math.floor(Number(count) || 0));
      const mergedStart = current ? Math.min(current.start, nextStart) : nextStart;
      const mergedEnd = current ? Math.max(current.start + current.count, nextEnd) : nextEnd;
      const merged = {
        start: mergedStart,
        count: mergedEnd - mergedStart,
        version: currentVersion(scope),
      };
      dirtyRanges[scope] = merged;
      return merged;
    };
    const buildSelectorView = (selector, fallback) => {
      if (!selector) {
        try {
          fallback.version = currentVersion(fallback === fallbackNodeIndices ? 'node' : 'edge');
        } catch (_) {
          // ignore non-extensible typed arrays
        }
        return fallback;
      }
      if ((baseNetwork?._bufferSessionDepth ?? 0) <= 0) {
        throw new Error('Cannot access filtered active indices outside buffer access');
      }
      const count = Math.max(0, Math.floor(Number(selector.count) || 0));
      const dataPointer = Math.max(0, Math.floor(Number(selector.dataPointer) || 0));
      const heap = selector.module?.HEAPU32?.buffer ?? null;
      if (!count || !dataPointer || !heap) return fallback;
      const view = new Uint32Array(heap, dataPointer, count);
      try {
        view.version = currentVersion(selector === selectorNode ? 'node' : 'edge');
      } catch (_) {
        // ignore non-extensible typed arrays
      }
      return view;
    };
    const copySelection = (scope, target) => {
      if (!(target instanceof Uint32Array)) {
        throw new Error(`${scope} buffer must be a Uint32Array`);
      }
      const wasmHeap = baseNetwork?.module?.HEAPU32?.buffer ?? null;
      if (wasmHeap && target.buffer !== wasmHeap) {
        throw new Error(`${scope} buffer must live in the WASM heap (module.HEAPU32.buffer)`);
      }
      const selector = scope === 'node' ? selectorNode : selectorEdge;
      const fallback = scope === 'node' ? fallbackNodeIndices : fallbackEdgeIndices;
      const countFromSelector = safeNumber(selector?.count, NaN);
      const count = Number.isFinite(countFromSelector) ? Math.max(0, Math.floor(countFromSelector)) : fallback.length;
      if (count > target.length) return count;
      if (!count) return 0;

      const dataPointer = safeNumber(selector?.dataPointer, 0);
      const sourceHeap = selector?.module?.HEAPU32?.buffer ?? null;
      if (dataPointer > 0 && sourceHeap) {
        const view = new Uint32Array(sourceHeap, dataPointer, count);
        target.set(view);
        return count;
      }
      target.set(fallback.subarray(0, count));
      return count;
    };
    const materializeSelection = (scope) => {
      const selector = scope === 'node' ? selectorNode : selectorEdge;
      const fallback = scope === 'node' ? fallbackNodeIndices : fallbackEdgeIndices;
      if (typeof selector?.toTypedArray === 'function') {
        return selector.toTypedArray();
      }
      return fallback.slice();
    };
    const fillSelection = (scope, indices) => {
      const selector = scope === 'node' ? selectorNode : selectorEdge;
      if (!selector || typeof selector.fillFromArray !== 'function') return false;
      selector.fillFromArray(baseNetwork, indices);
      return true;
    };
    const promoteSelectionToEnd = (scope, indices) => {
      const requested = new Set(Array.from(indices || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0));
      const current = materializeSelection(scope);
      if (!requested.size || !current.length) {
        return { changed: false, start: 0, count: 0, version: currentVersion(scope) };
      }
      const kept = [];
      const promoted = [];
      for (let i = 0; i < current.length; i += 1) {
        const value = current[i] >>> 0;
        if (requested.has(value)) promoted.push(value);
        else kept.push(value);
      }
      if (!promoted.length) {
        return { changed: false, start: 0, count: 0, version: currentVersion(scope) };
      }
      const next = Uint32Array.from([...kept, ...promoted]);
      let first = -1;
      let last = -1;
      for (let i = 0; i < next.length; i += 1) {
        if (next[i] !== current[i]) {
          if (first < 0) first = i;
          last = i;
        }
      }
      if (first < 0 || !fillSelection(scope, next)) {
        return { changed: false, start: 0, count: 0, version: currentVersion(scope) };
      }
      orderVersions[scope] += 1;
      const changed = mergeDirtyRange(scope, first, last - first + 1);
      return { changed: true, ...changed };
    };
    const normalizeDirection = (value) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (value === 0) return 'out';
        if (value === 1) return 'in';
        return 'both';
      }
      const normalized = String(value ?? 'both').trim().toLowerCase();
      if (normalized === 'out' || normalized === 'outgoing') return 'out';
      if (normalized === 'in' || normalized === 'incoming') return 'in';
      return 'both';
    };
    const resolveIncidentEdges = (nodeIds, direction) => {
      const nodes = new Set(Array.from(nodeIds || [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0));
      if (!nodes.size) return emptyIndices;
      const activeEdges = materializeSelection('edge');
      if (!activeEdges.length) return emptyIndices;
      const mode = normalizeDirection(direction);
      const result = [];
      baseNetwork.withBufferAccess(() => {
        const endpoints = baseNetwork.edgesView ?? null;
        if (!endpoints) return;
        for (let i = 0; i < activeEdges.length; i += 1) {
          const edge = activeEdges[i] >>> 0;
          const source = endpoints[edge * 2] >>> 0;
          const target = endpoints[(edge * 2) + 1] >>> 0;
          if (
            (mode !== 'in' && nodes.has(source))
            || (mode !== 'out' && nodes.has(target))
          ) {
            result.push(edge);
          }
        }
      }, { edgesView: true });
      return result.length ? Uint32Array.from(result) : emptyIndices;
    };
    return new Proxy(baseNetwork, {
      get(target, property) {
        if (property === 'nodeIndices') return buildSelectorView(selectorNode, fallbackNodeIndices);
        if (property === 'edgeIndices') return buildSelectorView(selectorEdge, fallbackEdgeIndices);
        if (property === 'nodeCount') {
          return selectorNode
            ? Math.max(0, Math.floor(Number(selectorNode?.count) || 0))
            : fallbackNodeIndices.length;
        }
        if (property === 'edgeCount') {
          return selectorEdge
            ? Math.max(0, Math.floor(Number(selectorEdge?.count) || 0))
            : fallbackEdgeIndices.length;
        }
        if (property === '__heliosFilteredNodeSelector') return selectorNode;
        if (property === '__heliosFilteredEdgeSelector') return selectorEdge;
        if (property === '__heliosFilterVersion') return safeNumber(version, 0);
        if (property === '__heliosBaseNetwork') return target;
        if (property === 'writeActiveNodes') {
          return (buffer) => copySelection('node', buffer);
        }
        if (property === 'writeActiveEdges') {
          return (buffer) => copySelection('edge', buffer);
        }
        if (property === 'promoteActiveNodesToRenderEnd') {
          return (indices) => promoteSelectionToEnd('node', indices);
        }
        if (property === 'promoteActiveEdgesToRenderEnd') {
          return (indices) => promoteSelectionToEnd('edge', indices);
        }
        if (property === 'promoteActiveEdgesForNodesToRenderEnd') {
          return (indices, options = {}) => promoteSelectionToEnd('edge', resolveIncidentEdges(indices, options.direction ?? 'both'));
        }
        if (property === 'getActiveIndexDirtyRange') {
          return (scope) => {
            if (scope === 'node' || scope === 'edge') {
              return dirtyRanges[scope] ? { ...dirtyRanges[scope] } : null;
            }
            return null;
          };
        }
        if (property === 'getTopologyVersions') {
          return () => {
            let raw = { node: 0, edge: 0 };
            if (typeof target.getTopologyVersions === 'function') {
              try {
                raw = target.getTopologyVersions() ?? raw;
              } catch (error) {
                warnOnce(
                  this,
                  'filtered-network-topology-versions',
                  'Helios: filtered network proxy failed to read topology versions; using zero versions.',
                  { error },
                );
                raw = { node: 0, edge: 0 };
              }
            }
            return {
              node: computeFilterTopologyVersion(raw.node, version),
              edge: computeFilterTopologyVersion(raw.edge, version),
            };
          };
        }
        const value = Reflect.get(target, property, target);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target);
      },
    });
  }

  _refreshGraphFilterNetworks({ force = false, throwOnError = false } = {}) {
    const state = this._ensureGraphFilterState();
    const baseNetwork = this.network ?? null;
    if (!baseNetwork || state.enabled !== true || !state.options) {
      this._disposeGraphFilterSelectors(state);
      state.signature = null;
      state.nodeIndices = null;
      state.edgeIndices = null;
      state.filteredNetwork = null;
      state.renderNetwork = baseNetwork;
      state.layoutNetwork = baseNetwork;
      state.stats = null;
      state.lastError = null;
      if (this._syncLayoutNetworkFromFilter()) {
        this._requestLayoutReheat('filter-sync');
        this.scheduler?.requestLayout?.('filter-sync');
      }
      return state;
    }

    const nextSignature = this._captureGraphFilterSignature(state);
    const unchanged = !force && this._isSameGraphFilterSignature(nextSignature, state.signature);
    if (unchanged) {
      state.renderNetwork = state.filteredNetwork ?? baseNetwork;
      state.layoutNetwork = state.scope === GRAPH_FILTER_SCOPE_RENDER_LAYOUT
        ? (state.renderNetwork ?? baseNetwork)
        : baseNetwork;
      if (this._syncLayoutNetworkFromFilter()) {
        this._requestLayoutReheat('filter-sync');
        this.scheduler?.requestLayout?.('filter-sync');
      }
      return state;
    }

    let pendingNodeSelector = null;
    let pendingEdgeSelector = null;
    try {
      if (typeof baseNetwork.filterSubgraph !== 'function') {
        throw new Error('Current helios-network build does not support filterSubgraph(options)');
      }
      const previousNodeSelector = state.nodeSelector ?? null;
      const previousEdgeSelector = state.edgeSelector ?? null;
      const result = baseNetwork.filterSubgraph({ ...state.options, asSelector: true });
      const hasSelectorResult = Boolean(
        result
        && typeof result === 'object'
        && result.nodes
        && typeof result.nodes.count === 'number'
        && result.edges
        && typeof result.edges.count === 'number',
      );
      const nextNodeSelector = hasSelectorResult ? result.nodes : null;
      const nextEdgeSelector = hasSelectorResult ? result.edges : null;
      pendingNodeSelector = nextNodeSelector;
      pendingEdgeSelector = nextEdgeSelector;
      const nodeIndices = hasSelectorResult
        ? null
        : (result?.nodeIndices instanceof Uint32Array ? result.nodeIndices : new Uint32Array(0));
      const edgeIndices = hasSelectorResult
        ? null
        : (result?.edgeIndices instanceof Uint32Array ? result.edgeIndices : new Uint32Array(0));
      state.version = bumpVersionCounter(state.version);
      state.nodeIndices = nodeIndices;
      state.edgeIndices = edgeIndices;
      state.nodeSelector = nextNodeSelector;
      state.edgeSelector = nextEdgeSelector;
      state.filteredNetwork = this._createFilteredNetworkProxy({
        baseNetwork,
        nodeIndices,
        edgeIndices,
        nodeSelector: nextNodeSelector,
        edgeSelector: nextEdgeSelector,
        version: state.version,
      });
      state.renderNetwork = state.filteredNetwork;
      state.layoutNetwork = state.scope === GRAPH_FILTER_SCOPE_RENDER_LAYOUT
        ? state.filteredNetwork
        : baseNetwork;
      state.signature = nextSignature;
      state.lastError = null;
      state.stats = {
        nodeCount: nextNodeSelector
          ? Math.max(0, Math.floor(Number(nextNodeSelector?.count) || 0))
          : nodeIndices.length,
        edgeCount: nextEdgeSelector
          ? Math.max(0, Math.floor(Number(nextEdgeSelector?.count) || 0))
          : edgeIndices.length,
        baseNodeCount: Math.max(0, Math.floor(Number(baseNetwork?.nodeCount) || 0)),
        baseEdgeCount: Math.max(0, Math.floor(Number(baseNetwork?.edgeCount) || 0)),
      };
      if (previousNodeSelector && previousNodeSelector !== nextNodeSelector) {
        this._disposeSelector(previousNodeSelector);
      }
      if (previousEdgeSelector && previousEdgeSelector !== nextEdgeSelector) {
        this._disposeSelector(previousEdgeSelector);
      }
      pendingNodeSelector = null;
      pendingEdgeSelector = null;
      if (this._syncLayoutNetworkFromFilter()) {
        this._requestLayoutReheat('filter-sync');
        this.scheduler?.requestLayout?.('filter-sync');
      }
      return state;
    } catch (error) {
      if (throwOnError) {
        if (pendingNodeSelector && pendingNodeSelector !== state.nodeSelector) {
          this._disposeSelector(pendingNodeSelector);
        }
        if (pendingEdgeSelector && pendingEdgeSelector !== state.edgeSelector) {
          this._disposeSelector(pendingEdgeSelector);
        }
        throw error;
      }
      this._disposeGraphFilterSelectors(state);
      state.lastError = error;
      state.signature = nextSignature;
      state.nodeIndices = null;
      state.edgeIndices = null;
      state.nodeSelector = null;
      state.edgeSelector = null;
      state.filteredNetwork = null;
      state.renderNetwork = baseNetwork;
      state.layoutNetwork = baseNetwork;
      state.stats = null;
      if (this._syncLayoutNetworkFromFilter()) {
        this._requestLayoutReheat('filter-sync');
        this.scheduler?.requestLayout?.('filter-sync');
      }
      warnOnce(
        this,
        'graph-filter-refresh',
        'Helios: graph filter refresh failed; falling back to the base network.',
        { error },
      );
      this.debug?.log?.('helios', 'Graph filter refresh failed; falling back to base network', { error });
      return state;
    }
  }

  _syncLayoutNetworkFromFilter() {
    const layout = this._layout ?? null;
    if (!layout || typeof layout !== 'object') return false;
    const nextLayoutNetwork = this._ensureGraphFilterState().layoutNetwork ?? this.network ?? null;
    if (!nextLayoutNetwork || layout.network === nextLayoutNetwork) return false;
    layout.network = nextLayoutNetwork;
    layout.syncAutoSettingsForNetwork?.(nextLayoutNetwork);
    this._enforcePositionSourcePolicy(layout, { resetInterpolation: false });
    return true;
  }

  _afterGraphFilterMutation(reason = 'filter') {
    this._refreshGraphFilterNetworks({ force: false, throwOnError: false });
    const layoutNetworkChanged = this._syncLayoutNetworkFromFilter();
    const filterScope = this._ensureGraphFilterState().scope;
    this._markAutoFitDirty(false);
    if (layoutNetworkChanged || filterScope === GRAPH_FILTER_SCOPE_RENDER_LAYOUT) {
      this._requestLayoutReheat('filter');
    }
    this.scheduler?.requestGeometry?.();
    if (layoutNetworkChanged) {
      this.scheduler?.requestLayout?.('filter');
    } else if (filterScope === GRAPH_FILTER_SCOPE_RENDER_LAYOUT) {
      this.scheduler?.requestLayout?.('filter');
    }
    this.scheduler?.requestRender?.();
    this._labels?.requestFullReselect?.(`graph-filter:${reason}`);
    this.emit(EVENTS.GRAPH_FILTER_CHANGED, this.getGraphFilter());
  }

  _getRenderNetwork() {
    return this._refreshGraphFilterNetworks().renderNetwork ?? this.network ?? null;
  }

  _getLayoutNetwork() {
    return this._refreshGraphFilterNetworks().layoutNetwork ?? this.network ?? null;
  }

  /**
   * Return the active graph filter state and filtered graph sizes.
   *
   * @public
   * @apiSection Filtering And State
   * @returns {object} Filter state with `enabled`, `scope`, normalized
   * `options`, filtered/base node and edge counts, and the last filter error.
   * @example
   * const state = helios.getGraphFilter();
   * if (state.enabled) console.log(state.nodeCount, state.edgeCount);
   */
  getGraphFilter() {
    const state = this._refreshGraphFilterNetworks();
    const options = state.options ? { ...state.options } : null;
    if (options) {
      options.scope = state.scope;
    }
    return {
      enabled: state.enabled === true,
      scope: state.scope ?? GRAPH_FILTER_SCOPE_RENDER,
      options,
      nodeCount: Math.max(0, Math.floor(Number(state.stats?.nodeCount ?? state.renderNetwork?.nodeCount) || 0)),
      edgeCount: Math.max(0, Math.floor(Number(state.stats?.edgeCount ?? state.renderNetwork?.edgeCount) || 0)),
      baseNodeCount: Math.max(0, Math.floor(Number(state.stats?.baseNodeCount ?? this.network?.nodeCount) || 0)),
      baseEdgeCount: Math.max(0, Math.floor(Number(state.stats?.baseEdgeCount ?? this.network?.edgeCount) || 0)),
      error: state.lastError ? (state.lastError.message ?? String(state.lastError)) : null,
    };
  }

  /**
   * Read or replace the active graph filter.
   *
   * @public
   * @apiSection Filtering And State
   * @param {object|false|null} [options] - Filter options, `false`, or `null`.
   * Omit the argument to read the current state.
   * @returns {object|Helios} Current filter state when called without
   * arguments, otherwise this Helios instance for chaining.
   * @example
   * helios.graphFilter({
   *   nodeRules: [{ attribute: 'degree', operator: '>=', value: 3 }],
   *   scope: 'render',
   * });
   */
  graphFilter(options) {
    if (arguments.length === 0) {
      return this.getGraphFilter();
    }
    if (options == null || options === false || options?.enabled === false) {
      return this.clearGraphFilter();
    }
    return this.setGraphFilter(options);
  }

  /**
   * Apply a render or render-and-layout graph filter.
   *
   * @public
   * @apiSection Filtering And State
   * @param {object|HeliosFilter} options - Filter rule set or reusable
   * `HeliosFilter` instance.
   * @param {Array<object>} [options.nodeRules] - Node rules to apply.
   * @param {Array<object>} [options.edgeRules] - Edge rules to apply.
   * @param {'render'|'render+layout'} [options.scope] - Filter scope.
   * @returns {Helios} This Helios instance.
   * @remarks `render` hides filtered items without changing dynamic layout
   * forces. `render+layout` also feeds the filtered graph to the active layout.
   * @example
   * helios.setGraphFilter({
   *   nodeRules: [{ attribute: 'group', operator: '==', value: 'core' }],
   *   scope: 'render+layout',
   * });
   */
  setGraphFilter(options = {}) {
    if (options == null || options === false) {
      return this.clearGraphFilter();
    }
    let preserveActiveFilterRef = false;
    if (options instanceof HeliosFilter) {
      this._activeHeliosFilter = options;
      options = options.toGraphFilterOptions();
      preserveActiveFilterRef = true;
    }
    if (typeof options !== 'object') {
      throw new TypeError('setGraphFilter(options) expects an object or null');
    }
    if (!preserveActiveFilterRef) {
      this._activeHeliosFilter = null;
    }
    const scope = normalizeGraphFilterScope(options.scope, this._ensureGraphFilterState().scope);
    const filterOptions = normalizeGraphFilterOptions(options);
    if (!hasGraphFilterCriteria(filterOptions)) {
      return this.clearGraphFilter();
    }

    const state = this._ensureGraphFilterState();
    const previous = { ...state };
    state.enabled = true;
    state.scope = scope;
    state.options = filterOptions;
    state.signature = null;
    state.lastError = null;

    try {
      this._refreshGraphFilterNetworks({ force: true, throwOnError: true });
    } catch (error) {
      Object.assign(state, previous);
      throw error;
    }
    this._afterGraphFilterMutation('set');
    return this;
  }

  /**
   * Activate a reusable `HeliosFilter` instance.
   *
   * @public
   * @apiSection Filtering And State
   * @param {HeliosFilter|null|false} filter - Filter instance to activate, or
   * `null`/`false` to clear filtering.
   * @returns {Helios} This Helios instance.
   * @example
   * const filter = new HeliosFilter({ nodeRules: [{ attribute: 'kind', value: 'paper' }] });
   * helios.activateHeliosFilter(filter);
   */
  activateHeliosFilter(filter) {
    if (filter == null || filter === false) {
      this._activeHeliosFilter = null;
      return this.clearGraphFilter();
    }
    if (!(filter instanceof HeliosFilter)) {
      throw new TypeError('activateHeliosFilter(filter) expects a HeliosFilter instance or null');
    }
    return this.setGraphFilter(filter);
  }

  /**
   * Return the reusable filter currently attached to this view.
   *
   * @public
   * @apiSection Filtering And State
   * @returns {HeliosFilter|null} Active reusable filter, if one was supplied.
   */
  getActiveHeliosFilter() {
    return this._activeHeliosFilter ?? null;
  }

  /**
   * Re-run the active reusable filter after its rules or source data changed.
   *
   * @public
   * @apiSection Filtering And State
   * @returns {Helios} This Helios instance.
   */
  reapplyActiveHeliosFilter() {
    if (!this._activeHeliosFilter) return this;
    return this.activateHeliosFilter(this._activeHeliosFilter);
  }

  /**
   * Remove the active graph filter and restore the base graph view.
   *
   * @public
   * @apiSection Filtering And State
   * @returns {Helios} This Helios instance.
   * @example
   * helios.clearGraphFilter();
   */
  clearGraphFilter() {
    const state = this._ensureGraphFilterState();
    const hadFilter = state.enabled === true || state.filteredNetwork != null || state.options != null;
    this._disposeGraphFilterSelectors(state);
    state.enabled = false;
    state.scope = GRAPH_FILTER_SCOPE_RENDER;
    state.options = null;
    state.signature = null;
    state.nodeIndices = null;
    state.edgeIndices = null;
    state.nodeSelector = null;
    state.edgeSelector = null;
    state.filteredNetwork = null;
    state.renderNetwork = this.network ?? null;
    state.layoutNetwork = this.network ?? null;
    state.stats = null;
    state.lastError = null;
    if (hadFilter) {
      this._afterGraphFilterMutation('clear');
    }
    return this;
  }

  /**
   * Replace the graph store while preserving visualization state by default.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {import('helios-network').default} nextNetwork - Replacement graph.
   * @param {object} [options] - Replacement behavior options.
   * @param {boolean} [options.disposeOld=true] - Dispose the previous network.
   * @param {boolean} [options.keepCamera=true] - Preserve the current camera.
   * @param {boolean} [options.keepMappers=true] - Preserve mapper settings.
   * @param {boolean} [options.markNetworkDirty=true] - Mark persistence network data dirty after replacement.
   * @returns {Promise<Helios>} This Helios instance after the renderer and
   * layout are rebound to the new graph.
   * @example
   * await helios.replaceNetwork(nextNetwork, { keepCamera: false });
   */
  async replaceNetwork(nextNetwork, options = {}) {
    if (!nextNetwork) {
      throw new Error('replaceNetwork requires a helios-network instance');
    }
    if (options.allowDuringInitialize !== true) {
      await this.ready;
    }

    const disposeOld = options.disposeOld !== false;
    const keepCamera = options.keepCamera !== false;
    const keepMappers = options.keepMappers !== false;
    const recreateRenderer = options.recreateRenderer !== false;
    const frameNetwork = options.frame ?? (!keepCamera);
    const layoutOption = options.layout ?? this.options.layout;
    if (isLayoutInstance(layoutOption)) {
      throw new Error('replaceNetwork requires options.layout when Helios was constructed with a layout instance');
    }
    const activePositionDelegate =
      this._positionsConfig?.source === 'delegate' ? this._positionsConfig.delegate : null;

    const wasRunning = !this.manualRendering && this.scheduler?.running === true;
    const previousLayoutState = typeof this.scheduler?.getLayoutState === 'function'
      ? this.scheduler.getLayoutState()
      : (this.scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
    const cameraState = keepCamera ? this._snapshotCameraState() : null;
    const attributeConfig = this.attributeTracker
      ? { node: this.attributeTracker.nodeAttribute, edge: this.attributeTracker.edgeAttribute, options: { ...this.attributeTracker.options } }
      : null;
    const pickingConfig = {
      node: this._picking?.node?.enabled === true,
      edge: this._picking?.edge?.enabled === true,
      options: { ...(this._picking?.options ?? {}) },
    };

    this._detachPositionDelegate(activePositionDelegate);

    this.scheduler?.stop?.();
    this._detachPickingListeners();
    this.indexPickingTracker?.destroy?.();
    this.indexPickingTracker = null;
    this.attributeTracker?.destroy?.();
    this.attributeTracker = null;
    this._resetHover?.('network-replaced');

    if (recreateRenderer) {
      this.renderer?.destroy?.();
      this.renderer = null;
    }

    this._layout?.dispose?.();

    const prevNetwork = this.network;
    this.network = nextNetwork;
    this._ensureGraphFilterState().renderNetwork = nextNetwork;
    this._ensureGraphFilterState().layoutNetwork = nextNetwork;
    this._refreshGraphFilterNetworks({ force: true, throwOnError: false });
    this.visuals = new VisualAttributes(nextNetwork, this.debug);
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(layoutOption, this.layers.size, this.options.mode));
    this._resetInterpolationRuntime({ keepIntervalHistory: false });
    this._labels?.requestFullReselect?.('network-replaced');

    if (options.mappers === null) {
      this.nodeMapper = new MapperCollection('node', nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = new MapperCollection('edge', nextNetwork, this.markMappersDirty, this.debug);
      this.mappersDirty = false;
    } else if (options.mappers) {
      this.nodeMapper = new MapperCollection('node', nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = new MapperCollection('edge', nextNetwork, this.markMappersDirty, this.debug);
      if (options.mappers?.nodeMapper) this.nodeMapper.setDefault(options.mappers.nodeMapper);
      if (options.mappers?.edgeMapper) this.edgeMapper.setDefault(options.mappers.edgeMapper);
      this.mappersDirty = true;
    } else if (keepMappers) {
      this.nodeMapper = cloneMapperCollection(this.nodeMapper, nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = cloneMapperCollection(this.edgeMapper, nextNetwork, this.markMappersDirty, this.debug);
      this.mappersDirty = true;
    } else {
      this._resetMappersToDefault(nextNetwork);
    }

    this.firstGeometryUpdateComplete = false;

    this._layout = this._bindLayoutToHelios(this.createLayout(layoutOption));
    this._syncLayoutNetworkFromFilter();
    if (this._layout?.setUpdateListener) {
      this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    }
    await this._layout?.initialize?.();
    this._layout?.resize?.(this.layers.size);
    this._activateLayoutAfterNetworkReplace(previousLayoutState, 'network-replaced');

    if (recreateRenderer) {
      await this._createRendererAndTrackers();
      this._applyPositionPipelineToRenderer();
      this._refreshUIBindings();
      if (frameNetwork) {
        this.requestFrameNetwork({ paddingPx: options.framePaddingPx ?? 24 });
      } else {
        this._restoreCameraState(cameraState);
      }
    } else if (this.renderer) {
      this.attributeTracker = new AttributeTracker(this.renderer);
      this.attributeTracker.resize(this.layers.size);
      this._applyPickingConfig();
      this._applyPositionPipelineToRenderer();
      this._refreshUIBindings();
      this._reapplyBehaviorRendererBindings();
      if (frameNetwork) {
        this.requestFrameNetwork({ paddingPx: options.framePaddingPx ?? 24 });
      } else {
        this._restoreCameraState(cameraState);
      }
    }

    // Apply visuals immediately so first render and exports are non-empty even if the scheduler
    // hasn't ticked yet; also catches incompatible mappers early.
    this._applyMappersSafely();

    if (attributeConfig && this.attributeTracker) {
      this.enableAttributeTracking(attributeConfig.node, attributeConfig.edge, attributeConfig.options);
    }
    if (pickingConfig.node) this.enableNodePicking(pickingConfig.options);
    if (pickingConfig.edge) this.enableEdgePicking(pickingConfig.options);

    if (wasRunning) {
      this.scheduler.start();
    }
    this.scheduler.requestGeometry();
    this.scheduler.requestRender();
    this._resetCameraDelegateSnapshot();
    this._invalidateCameraOrbitReference();
    this._markAutoFitDirty(false);

    this.emit(EVENTS.NETWORK_REPLACED, {
      oldNetwork: prevNetwork ?? null,
      network: nextNetwork,
      oldNodeCount: prevNetwork?.nodeCount ?? null,
      oldEdgeCount: prevNetwork?.edgeCount ?? null,
      nodeCount: nextNetwork?.nodeCount ?? null,
      edgeCount: nextNetwork?.edgeCount ?? null,
    });
    if (options.markNetworkDirty !== false) {
      this.storage?.markNetworkDirty?.('network-replaced');
    }
    this._labels?.requestFullReselect?.('network-replaced-emitted');

    if (disposeOld && prevNetwork && typeof prevNetwork.dispose === 'function') {
      try {
        prevNetwork.dispose();
      } catch (error) {
        warnOnce(
          this,
          'previous-network-dispose',
          'Helios: previous network disposal failed after network replacement.',
          { error },
        );
      }
    }
  }

  _tryPendingFrameNetwork() {
    const pending = this._pendingFrameNetwork;
    if (!pending) return false;
    if (!this.renderer?.camera) return false;
    const size = this.size ?? this.layers?.size ?? null;
    if (!size || size.width <= 2 || size.height <= 2) return false;

    pending.attempts += 1;
    const ok = this.frameNetwork(pending.options);
    if (ok) {
      this._pendingFrameNetwork = null;
      return true;
    }
    if (pending.attempts >= pending.maxAttempts) {
      this._pendingFrameNetwork = null;
    }
    return false;
  }

  /**
   * Queue a camera fit once the renderer and graph bounds are ready.
   *
   * @public
   * @apiSection Camera And View
   * @param {object} [options] - Camera fit options.
   * @param {number} [options.maxAttempts=25] - Maximum geometry ticks to retry.
   * @returns {Helios} This Helios instance.
   */
  requestFrameNetwork(options = {}) {
    const maxAttempts = Number.isFinite(options.maxAttempts) ? Math.max(1, Math.floor(options.maxAttempts)) : 25;
    const { maxAttempts: _ignored, ...frameOptions } = options ?? {};
    this._pendingFrameNetwork = { options: frameOptions, attempts: 0, maxAttempts };
    const ok = this._tryPendingFrameNetwork();
    if (!ok) {
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  _requestInitialCameraFit() {
    this.requestFrameNetwork({
      animate: false,
      resetOrientation: this.mode() === '3d',
      largeNetworkStartupFit: true,
      maxAttempts: 60,
    });
  }

  _requestStartupInitialCameraFit() {
    if (this._sessionRestoreResult || this._startupConfig?.initialCameraFit === false) return;
    this._requestInitialCameraFit();
  }

  /**
   * Fit the camera to the current visible graph or selected node set.
   *
   * @public
   * @apiSection Camera And View
   * @param {object} [options] - Camera fit options.
   * @param {Array<number>|TypedArray} [options.nodeIndices] - Node indices to frame.
   * @param {boolean} [options.animate=false] - Animate the transition.
   * @param {number} [options.paddingRatio] - Extra viewport padding ratio.
   * @returns {boolean} True when a camera pose was applied.
   * @example
   * helios.frameNetwork({ animate: true, paddingRatio: 0.08 });
   */
  frameNetwork(options = {}) {
    const camera = this.renderer?.camera ?? null;
    if (!camera) return false;
    const targetNodeIndices = options.nodeIndices != null
      ? normalizeNodeIndexList(options.nodeIndices)
      : this._resolveActiveCameraTargetNodeIndices();
    const sampledBounds = this._sampleRenderBounds({
      ...options,
      nodeIndices: targetNodeIndices ?? undefined,
      coverage: Number.isFinite(options.coverage)
        ? Number(options.coverage)
        : (this._cameraControlConfig?.autoFitCoverage ?? CAMERA_CONTROL_DEFAULTS.autoFitCoverage),
      paddingRatio: Number.isFinite(options.paddingRatio)
        ? Number(options.paddingRatio)
        : (this._cameraControlConfig?.autoFitPaddingRatio ?? CAMERA_CONTROL_DEFAULTS.autoFitPaddingRatio),
      maxSamples: options.maxSamples ?? this._cameraControlConfig?.autoFitMaxSamples ?? CAMERA_FIT_DEFAULT_MAX_SAMPLES,
    });
    if (!sampledBounds) return false;
    const nextPose = this._resolveCameraFitPose(sampledBounds, {
      resetOrientation: options.resetOrientation ?? (camera.mode === '3d'),
      focusMode: options.focusMode ?? (targetNodeIndices?.length ? 'centroid' : 'bbox'),
    });
    if (this._shouldUseLargeNetworkStartupFit(options, targetNodeIndices)) {
      const applied = this._applyLargeNetworkStartupFit(nextPose, options);
      if (applied) return true;
    }
    return this._applyCameraPoseWithOptionalAnimation(nextPose, {
      animate: options.animate === true,
      durationMs: options.durationMs,
    });
  }

  /**
   * Load a serialized network and replace the active graph.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {Blob|ArrayBuffer|string|File} source - Network payload or file-like object.
   * @param {object} [options] - Load and replacement options.
   * @param {'xnet'|'zxnet'|'bxnet'|'gml'|'gt'} [options.format] - Input format when it
   * cannot be inferred from `source.name`.
   * @param {boolean} [options.showLoadingOverlay=false] - Hide the canvas,
   * show the startup spinner, and suppress rendering until the loaded network
   * has replaced the active graph and state restoration has finished.
   * @returns {Promise<HeliosNetwork>} Loaded network instance.
   * @example
   * const network = await helios.loadNetwork(file, { format: 'bxnet' });
   */
  async loadNetwork(source, options = {}) {
    const requestedFormat = options.format ?? null;
    const sourceNameOption = typeof options.name === 'string'
      ? options.name
      : (typeof options.filename === 'string' ? options.filename : null);
    const sourceNameForMetadata = source && typeof source === 'object' && typeof source.name === 'string'
      ? source.name
      : sourceNameOption;
    const formatFromName = typeof sourceNameForMetadata === 'string'
      ? inferNetworkFormatFromName(sourceNameForMetadata)
      : null;
    const format = requestedFormat ?? formatFromName;
    if (!format) {
      throw new Error('loadNetwork requires a format ("xnet", "zxnet", "bxnet", "gml", "gt") or a filename with a supported extension such as ".gt.zst"');
    }
    const loadStartupGate = options.showLoadingOverlay === true || options.blockRenderingDuringLoad === true
      ? this._beginNetworkLoadStartupGate(options.loadingOverlayOptions)
      : null;
    try {
      const { default: HeliosNetwork } = await import('helios-network');
      const normalized = format.toLowerCase();
      let next = null;
      if (normalized === 'bxnet') next = await HeliosNetwork.fromBXNet(source);
      else if (normalized === 'zxnet') next = await HeliosNetwork.fromZXNet(source);
      else if (normalized === 'xnet') next = await HeliosNetwork.fromXNet(source);
      else if (normalized === 'gml') next = await HeliosNetwork.fromGML(source);
      else if (normalized === 'gt') next = await HeliosNetwork.fromGT(source);
      else throw new Error(`Unsupported network format: ${format}`);
      const sourceName = sourceNameForMetadata;
      const sourceBase = sourceName ? getBaseFilename(sourceName) : null;
      const sessionNickname = options.sessionNickname ?? sourceBase ?? sourceName ?? `${normalized.toUpperCase()} network`;
      const shouldCreateSession = options.allowDuringInitialize !== true
        && options.preserveSession !== true
        && options.createSession !== false
        && options.newSession !== false;
      if (shouldCreateSession && typeof this.storage?.startNewSession === 'function') {
        await this.storage.startNewSession({
          nickname: sessionNickname,
          name: sourceName,
          flushPrevious: options.flushPreviousSession !== false,
          saveInitialSession: false,
          replaceUrlSession: options.replaceUrlSession !== false,
          confirmUnsyncedSession: options.confirmUnsyncedSession,
          continueOnFlushError: options.continueOnFlushError,
          discardPreviousUnsynced: options.discardPreviousUnsynced,
          confirmedDiscardPrevious: options.confirmedDiscardPrevious,
          previousFlushReason: options.previousFlushReason ?? 'network-load-session-switch',
        });
      }
      if (sourceName) {
        this._lastLoadedNetworkName = sourceName;
        this._lastLoadedNetworkBase = sourceBase;
        this._lastLoadedNetworkFormat = inferNetworkFormatFromName(sourceName);
      } else {
        this._lastLoadedNetworkName = null;
        this._lastLoadedNetworkBase = null;
        this._lastLoadedNetworkFormat = normalized;
      }
      await this.replaceNetwork(next, options);
      if (options.restoreVisualizationState !== false) {
        const attachedState = this.getAttachedVisualizationState(next);
        if (attachedState) {
          await this.importVisualizationState(attachedState, { reason: 'network-load' });
        }
        await this.storage?.restorePortableStateFromNetwork?.({ network: next });
      }
      if (shouldCreateSession) {
        await this.storage?.setSessionNickname?.(sessionNickname);
      }
      this._releaseNetworkLoadStartupGate(loadStartupGate);
      return next;
    } catch (error) {
      this._cancelNetworkLoadStartupGate(loadStartupGate);
      throw error;
    }
  }

  /**
   * Serialize the active graph in a Helios Network format.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {'xnet'|'zxnet'|'bxnet'|'gml'|'gt'} [format='bxnet'] - Output format.
   * @param {object} [options] - Save options forwarded to the network serializer.
   * @returns {Promise<Blob|string|ArrayBuffer>} Serialized network payload.
   */
  async saveNetwork(format = 'bxnet', options = {}) {
    const normalized = String(format).toLowerCase();
    if (!this.network) throw new Error('saveNetwork requires an active network');
    // Ensure visuals exist and mappers have been applied before serializing.
    this.visuals?.seedMissingPositions?.(this.layers?.size);
    this._applyMappersSafely();
    const output = options.output ?? 'blob';
    const saveOptions = { ...(options.saveOptions ?? {}), format: output };
    if (normalized === 'bxnet') {
      if (typeof this.network.saveBXNet !== 'function') throw new Error('Network does not support saveBXNet()');
      return this.network.saveBXNet(saveOptions);
    }
    if (normalized === 'zxnet') {
      if (typeof this.network.saveZXNet !== 'function') throw new Error('Network does not support saveZXNet()');
      return this.network.saveZXNet(saveOptions);
    }
    if (normalized === 'xnet') {
      if (typeof this.network.saveXNet !== 'function') throw new Error('Network does not support saveXNet()');
      return this.network.saveXNet(saveOptions);
    }
    if (normalized === 'gml') {
      if (typeof this.network.saveGML !== 'function') throw new Error('Network does not support saveGML()');
      return this.network.saveGML(saveOptions);
    }
    if (normalized === 'gt') {
      if (typeof this.network.saveGT !== 'function') throw new Error('Network does not support saveGT()');
      return this.network.saveGT(saveOptions);
    }
    throw new Error(`Unsupported network format: ${format}`);
  }

  /**
   * Serialize state held by active behaviors.
   *
   * @public
   * @apiSection Behaviors
   * @returns {object} Behavior state keyed by behavior id.
   */
  serializeBehaviorState() {
    return this.behaviors?.serialize?.() ?? {};
  }

  /**
   * Restore state for active behaviors.
   *
   * @public
   * @apiSection Behaviors
   * @param {object} [snapshot] - Behavior state keyed by behavior id.
   * @returns {Helios} This Helios instance.
   */
  restoreBehaviorState(snapshot = {}) {
    this.behaviors?.restore?.(snapshot);
    return this;
  }

  _capturePersistenceNetworkSource(extra = {}) {
    return createDefaultNetworkSource({
      name: this._lastLoadedNetworkName ?? null,
      baseName: this._lastLoadedNetworkBase ?? null,
      format: this._lastLoadedNetworkFormat ?? null,
      nodeCount: this.network?.nodeCount ?? null,
      edgeCount: this.network?.edgeCount ?? null,
      portableVisualizationAttached: this.network?.hasNetworkAttribute?.(NETWORK_VISUALIZATION_STATE_ATTRIBUTE) === true,
      ...extra,
    });
  }

  _snapshotStorageState(options = {}) {
    if (typeof this.storage?.serializeSnapshot !== 'function') return null;
    const snapshot = this.storage.serializeSnapshot({
      includeNetwork: false,
      ...(options ?? {}),
    });
    return snapshot ? cloneSerializable(snapshot) : null;
  }

  _trackedVisualizationOverrides() {
    const storageOverrides = this.states?.getOverrides?.({ aliases: 'preferred' }) ?? {};
    const overrides = {
      ...cloneSerializable(storageOverrides),
    };
    const hasCameraControlOverride = this.states?.status?.('camera.controls')?.hasOverride === true
      || this.states?.status?.('cameraControls')?.hasOverride === true;
    if (hasCameraControlOverride && !Object.prototype.hasOwnProperty.call(overrides, 'camera.pose')) {
      const pose = this._snapshotCameraState({ includeViewport: false });
      if (pose) overrides['camera.pose'] = cloneSerializable(pose);
    }
    return overrides;
  }

  /**
   * Build a portable visualization-state envelope.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object} [options] - Serialization options.
   * @returns {object} Visualization-state envelope containing UI, behavior,
   * camera, and network-source state.
   */
  serializeVisualizationState(options = {}) {
    const preferences = options.preferences ?? this.storage?.getPreferences?.() ?? createDefaultPreferencesState();
    const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      preferences,
      responsivePreferences: preferences?.responsive ?? null,
      uiState: this.ui?.serializeState?.() ?? this.behaviors?.ui?.serializeState?.() ?? {},
      behaviorState: this.serializeBehaviorState(),
      cameraState: this._snapshotCameraState(options.camera ?? {}),
      cameraControlState: this._snapshotCameraControlState(),
      networkSource: this._capturePersistenceNetworkSource(),
      layoutRuntimeState: this.snapshotLayoutRuntimeState(options.layoutRuntime ?? {}),
      storageState: this._snapshotStorageState(options.storage ?? {}),
    }, {
      source: 'helios',
    });
    return envelope;
  }

  /**
   * Build a portable visualization-state envelope and await async layout snapshots.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object} [options] - Serialization options.
   * @returns {Promise<object>} Visualization-state envelope containing UI,
   * behavior, camera, network-source, storage, and async layout runtime state.
   */
  async serializeVisualizationStateAsync(options = {}) {
    const preferences = options.preferences ?? this.storage?.getPreferences?.() ?? createDefaultPreferencesState();
    return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      preferences,
      responsivePreferences: preferences?.responsive ?? null,
      uiState: this.ui?.serializeState?.() ?? this.behaviors?.ui?.serializeState?.() ?? {},
      behaviorState: this.serializeBehaviorState(),
      cameraState: this._snapshotCameraState(options.camera ?? {}),
      cameraControlState: this._snapshotCameraControlState(),
      networkSource: this._capturePersistenceNetworkSource(),
      layoutRuntimeState: await this.snapshotLayoutRuntimeStateAsync(options.layoutRuntime ?? {}),
      storageState: this._snapshotStorageState(options.storage ?? {}),
    }, {
      source: 'helios',
    });
  }

  /**
   * Import a visualization-state envelope and apply it to this view.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object|string|Blob} source - Visualization-state envelope or JSON payload.
   * @param {object} [options] - Restore options forwarded to behaviors.
   * @returns {Promise<object>} Parsed persistence envelope.
   */
  async importVisualizationState(source, options = {}) {
    const envelope = parsePersistenceEnvelope(source, PERSISTENCE_KINDS.visualization);
    const payload = envelope.payload;
    const sparseOverrides = payload?.storageState?.state?.overrides && typeof payload.storageState.state.overrides === 'object'
      ? payload.storageState.state.overrides
      : (payload?.overrides && typeof payload.overrides === 'object' ? payload.overrides : null);
    const applyVisualizationState = async () => {
      const restoredMode = payload.cameraState?.mode;
      if (
        options.restoreMode !== false
        && (restoredMode === '2d' || restoredMode === '3d')
        && restoredMode !== this.mode()
        && typeof this.setMode === 'function'
      ) {
        await this.setMode(restoredMode, {
          animate: false,
          syncDelegate: false,
          ...(options.modeOptions ?? {}),
        });
      }
      let restoredStorageState = false;
      if (sparseOverrides && options.restoreStorage !== false) {
        if (payload.storageState && typeof this.storage?.restoreSnapshot === 'function') {
          this.storage.restoreSnapshot(payload.storageState, {
            source: options.source ?? 'restore',
            reason: options.reason ?? 'visualization-state-restore',
            trackOverride: options.trackOverride,
          });
          restoredStorageState = true;
        } else if (typeof this.states?.restore === 'function') {
          this.states.restore(sparseOverrides, {
            source: options.source ?? 'restore',
            reason: options.reason ?? 'visualization-state-restore',
            trackOverride: options.trackOverride,
          });
        }
      }
      if (payload.behaviorState && typeof payload.behaviorState === 'object') {
        this.restoreBehaviorState(payload.behaviorState);
      }
      if (typeof this.behaviors?.ui?.restoreState === 'function') {
        this.behaviors.ui.restoreState(payload.uiState, options);
      } else if (payload.uiState && typeof payload.uiState === 'object') {
        this._pendingVisualizationUiState = cloneSerializable(payload.uiState);
        if (options.hydratePersistence === false) this._pendingPersistenceBaselineRefresh = true;
      }
      if (payload.cameraControlState) this._restoreCameraControlState(payload.cameraControlState);
      if (payload.cameraState) this._restoreCameraState(payload.cameraState, { restoreViewport: options.restoreCameraViewport === true });
      if (payload.layoutRuntimeState && options.restoreLayoutRuntime !== false) {
        await this.restoreLayoutRuntimeState(payload.layoutRuntimeState, {
          reason: options.reason ?? 'visualization-state-restore',
          ...(Object.prototype.hasOwnProperty.call(options, 'restoreLayoutRunState')
            ? { restoreRunState: options.restoreLayoutRunState === true }
            : {}),
        });
      }
      if (!restoredStorageState && !sparseOverrides && payload.storageState && options.restoreStorage !== false && typeof this.storage?.restoreSnapshot === 'function') {
        this.storage.restoreSnapshot(payload.storageState, {
          source: 'restore',
          reason: options.reason ?? 'visualization-state-restore',
          trackOverride: options.trackOverride,
        });
      }
    };
    await applyVisualizationState();
    return envelope;
  }

  /**
   * Alias for `importVisualizationState`.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object|string|Blob} source - Visualization-state envelope or JSON payload.
   * @param {object} [options] - Restore options.
   * @returns {Promise<object>} Parsed persistence envelope.
   */
  async restoreVisualizationState(source, options = {}) {
    return this.importVisualizationState(source, options);
  }

  /**
   * Export visualization state as an object, JSON string, or Blob.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object} [options] - Export options.
   * @param {'object'|'string'|'blob'} [options.format='object'] - Output shape.
   * @returns {object|string|Blob} Visualization-state payload.
   */
  exportVisualizationState(options = {}) {
    const envelope = this.serializeVisualizationState(options);
    const format = options.format ?? 'object';
    if (format === 'string') return serializePersistenceEnvelope(envelope, options.pretty !== false);
    if (format === 'blob') {
      return new Blob([serializePersistenceEnvelope(envelope, options.pretty !== false)], { type: 'application/json' });
    }
    return envelope;
  }

  /**
   * Build a sparse visualization-state envelope from tracked state overrides.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object} [options] - Serialization options.
   * @param {boolean} [options.includeLayoutRuntime=true] - Include layout runtime state.
   * @returns {object} Sparse visualization-state envelope suitable for portable state attachment.
   */
  serializeTrackedVisualizationState(options = {}) {
    const preferences = options.preferences ?? this.storage?.getPreferences?.() ?? createDefaultPreferencesState();
    const includeLayoutRuntime = options.includeLayoutRuntime !== false;
    return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      preferences,
      responsivePreferences: preferences?.responsive ?? null,
      uiState: {},
      behaviorState: {},
      cameraState: this._snapshotCameraState(options.camera ?? {}),
      cameraControlState: this._snapshotCameraControlState(),
      networkSource: this._capturePersistenceNetworkSource(),
      overrides: this._trackedVisualizationOverrides(),
      layoutRuntimeState: includeLayoutRuntime ? this.snapshotLayoutRuntimeState(options.layoutRuntime ?? {}) : null,
      storageState: this._snapshotStorageState(options.storage ?? {}),
    }, {
      source: 'helios',
      sparse: true,
    });
  }

  /**
   * Build a sparse visualization-state envelope and await async layout snapshots.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object} [options] - Serialization options.
   * @param {boolean} [options.includeLayoutRuntime=true] - Include layout runtime state.
   * @returns {Promise<object>} Sparse visualization-state envelope suitable for portable state attachment.
   */
  async serializeTrackedVisualizationStateAsync(options = {}) {
    const preferences = options.preferences ?? this.storage?.getPreferences?.() ?? createDefaultPreferencesState();
    const includeLayoutRuntime = options.includeLayoutRuntime !== false;
    return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      preferences,
      responsivePreferences: preferences?.responsive ?? null,
      uiState: {},
      behaviorState: {},
      cameraState: this._snapshotCameraState(options.camera ?? {}),
      cameraControlState: this._snapshotCameraControlState(),
      networkSource: this._capturePersistenceNetworkSource(),
      overrides: this._trackedVisualizationOverrides(),
      layoutRuntimeState: includeLayoutRuntime ? await this.snapshotLayoutRuntimeStateAsync(options.layoutRuntime ?? {}) : null,
      storageState: this._snapshotStorageState(options.storage ?? {}),
    }, {
      source: 'helios',
      sparse: true,
    });
  }

  /**
   * Read a visualization-state envelope stored on a network attribute.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {HeliosNetwork} [network=this.network] - Network to inspect.
   * @param {object} [options] - Attribute lookup options.
   * @returns {object|null} Parsed envelope, or `null` when no valid state is attached.
   */
  getAttachedVisualizationState(network = this.network, options = {}) {
    if (!network?.hasNetworkAttribute?.(options.attributeName ?? NETWORK_VISUALIZATION_STATE_ATTRIBUTE)) return null;
    const raw = network.getNetworkStringAttribute(options.attributeName ?? NETWORK_VISUALIZATION_STATE_ATTRIBUTE);
    if (!raw) return null;
    try {
      return parsePersistenceEnvelope(raw, PERSISTENCE_KINDS.visualization);
    } catch (error) {
      console.warn('Failed to parse attached visualization state', error);
      return null;
    }
  }

  /**
   * Store visualization state on a network string attribute.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object|null} [snapshot=null] - Existing envelope, or `null` to capture current state.
   * @param {object} [options] - Attachment options.
   * @returns {Helios} This Helios instance.
   */
  attachVisualizationStateToNetwork(snapshot = null, options = {}) {
    const network = options.network ?? this.network;
    if (!network) throw new Error('attachVisualizationStateToNetwork requires an active network');
    const attributeName = options.attributeName ?? NETWORK_VISUALIZATION_STATE_ATTRIBUTE;
    if (!network.hasNetworkAttribute?.(attributeName)) {
      network.defineNetworkAttribute(attributeName, AttributeType.String, 1);
    }
    const state = snapshot ?? this.serializeVisualizationState(options);
    network.setNetworkStringAttribute(attributeName, serializePersistenceEnvelope(state, options.pretty !== false));
    return this;
  }

  /**
   * Remove visualization state attached to the active network.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object} [options] - Attribute removal options.
   * @returns {Helios} This Helios instance.
   */
  clearAttachedVisualizationState(options = {}) {
    const network = options.network ?? this.network;
    const attributeName = options.attributeName ?? NETWORK_VISUALIZATION_STATE_ATTRIBUTE;
    if (!network?.hasNetworkAttribute?.(attributeName)) return this;
    network.removeNetworkAttribute(attributeName);
    return this;
  }

  /**
   * Save the graph with optional embedded visualization state.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {'xnet'|'zxnet'|'bxnet'|'gml'|'gt'} [format='bxnet'] - Output network format.
   * @param {object} [options] - Portable save options.
   * @param {boolean} [options.includeVisualization=false] - Attach current
   * visualization state before saving.
   * @returns {Promise<Blob|string|ArrayBuffer>} Serialized network payload.
   */
  async savePortableNetwork(format = 'bxnet', options = {}) {
    if (!this.network) throw new Error('savePortableNetwork requires an active network');
    const normalizedFormat = String(format ?? 'bxnet').toLowerCase();
    const attributeName = options.attributeName ?? NETWORK_VISUALIZATION_STATE_ATTRIBUTE;
    const saveOptions = { ...(options.saveOptions ?? {}) };
    const ignoreAttributes = {
      ...(saveOptions.ignoreAttributes ?? {}),
      network: Array.isArray(saveOptions.ignoreAttributes?.network)
        ? [...saveOptions.ignoreAttributes.network]
        : [],
    };
    const output = options.output ?? 'blob';
    if ((normalizedFormat === 'gml' || normalizedFormat === 'gt') && options.includeVisualization === true) {
      console.warn(`Helios: ${normalizedFormat.toUpperCase()} export is lossy and cannot preserve full Helios visualization state.`);
      return this.saveNetwork(format, { output, saveOptions });
    }
    if (options.includeVisualization !== true) {
      if (!ignoreAttributes.network.includes(attributeName)) ignoreAttributes.network.push(attributeName);
      let previousPositions = null;
      let wroteCurrentPositionsForSave = false;
      try {
        if (options.includeCurrentPositions === true) {
          const currentPositionOptions = {
            ...options,
            layoutRuntime: {
              ...(options.layoutRuntime ?? {}),
              preferDelegate: true,
            },
          };
          const useTrackedVisualization = options.fullVisualizationState !== true && options.trackedOnly !== false;
          const visualizationState = options.visualizationState
            ?? await (useTrackedVisualization
              ? this.serializeTrackedVisualizationStateAsync(currentPositionOptions)
              : this.serializeVisualizationStateAsync(currentPositionOptions));
          const layoutPositions = visualizationState?.payload?.layoutRuntimeState?.positions ?? null;
          if (layoutPositions?.encoding === 'float32-base64' && typeof layoutPositions.data === 'string') {
            const stateWriter = this.storage;
            (stateWriter?.recordPortableState ?? stateWriter?.set)?.call(stateWriter, 'positions.current', layoutPositions, {
              scope: 'network',
              source: 'system',
              reason: 'portable-network-save',
              autosave: false,
            });
            const currentPositions = decodeFloat32ArrayBase64(layoutPositions.data, layoutPositions.length);
            if (currentPositions instanceof Float32Array && currentPositions.length > 0) {
              this.visuals?.seedMissingPositions?.(this.layers?.size);
              previousPositions = this._snapshotNodePositions();
              if (previousPositions instanceof Float32Array && previousPositions.length === currentPositions.length) {
                wroteCurrentPositionsForSave = this._writeNodePositions(currentPositions);
              }
            }
          }
        }
        return await this.saveNetwork(format, {
          output,
          saveOptions: {
            ...saveOptions,
            ignoreAttributes,
          },
        });
      } finally {
        if (wroteCurrentPositionsForSave && previousPositions instanceof Float32Array) {
          try {
            this._writeNodePositions(previousPositions);
          } catch (error) {
            warnOnce(
              this,
              'portable-save-position-restore',
              'Helios: failed to restore node positions after portable network save.',
              { error },
            );
          }
        }
      }
    }

    const saveWithVisualizationAttribute = async () => {
      const hadExisting = this.network.hasNetworkAttribute?.(attributeName) === true;
      const previousValue = hadExisting ? this.network.getNetworkStringAttribute(attributeName) : null;
      let previousPositions = null;
      let wroteCurrentPositionsForSave = false;
      try {
        const useTrackedVisualization = options.fullVisualizationState !== true && options.trackedOnly !== false;
        const visualizationState = options.visualizationState
          ?? await (useTrackedVisualization
            ? this.serializeTrackedVisualizationStateAsync({
              ...options,
              layoutRuntime: {
                ...(options.layoutRuntime ?? {}),
                preferDelegate: true,
              },
            })
            : this.serializeVisualizationStateAsync({
              ...options,
              layoutRuntime: {
                ...(options.layoutRuntime ?? {}),
                preferDelegate: true,
              },
            }));
        const layoutPositions = visualizationState?.payload?.layoutRuntimeState?.positions ?? null;
        if (
          options.includeCurrentPositions !== false
          && layoutPositions?.encoding === 'float32-base64'
          && typeof layoutPositions.data === 'string'
        ) {
          const stateWriter = this.storage;
          (stateWriter?.recordPortableState ?? stateWriter?.set)?.call(stateWriter, 'positions.current', layoutPositions, {
            scope: 'network',
            source: 'system',
            reason: 'portable-network-save',
            autosave: false,
          });
          const currentPositions = decodeFloat32ArrayBase64(layoutPositions.data, layoutPositions.length);
          if (currentPositions instanceof Float32Array && currentPositions.length > 0) {
            this.visuals?.seedMissingPositions?.(this.layers?.size);
            previousPositions = this._snapshotNodePositions();
            if (previousPositions instanceof Float32Array && previousPositions.length === currentPositions.length) {
              wroteCurrentPositionsForSave = this._writeNodePositions(currentPositions);
            }
          }
        }
        const portableVisualizationState = await (this.storage?.serializeNetworkSnapshot?.({
          ...options,
          includeNetwork: true,
          includeCurrentPositions: options.includeCurrentPositions !== false,
        }) ?? visualizationState);
        await (this.storage?.attachVisualizationStateToNetwork?.(portableVisualizationState, {
          attributeName,
          pretty: options.pretty,
        }) ?? this.attachVisualizationStateToNetwork(portableVisualizationState, {
          attributeName,
          pretty: options.pretty,
        }));
        return await this.saveNetwork(format, { output, saveOptions });
      } finally {
        if (wroteCurrentPositionsForSave && previousPositions instanceof Float32Array) {
          try {
            this._writeNodePositions(previousPositions);
          } catch (error) {
            warnOnce(
              this,
              'portable-save-visualization-position-restore',
              'Helios: failed to restore node positions after visualization network save.',
              { error },
            );
          }
        }
        if (hadExisting) {
          try {
            this.network.setNetworkStringAttribute(attributeName, previousValue);
          } catch (error) {
            warnOnce(
              this,
              'portable-save-visualization-attribute-restore',
              'Helios: failed to restore previous attached visualization state after network save.',
              { error, attributeName },
            );
          }
        } else if (this.network.hasNetworkAttribute?.(attributeName)) {
          try {
            this.network.removeNetworkAttribute(attributeName);
          } catch (error) {
            warnOnce(
              this,
              'portable-save-visualization-attribute-remove',
              'Helios: failed to remove temporary attached visualization state after network save.',
              { error, attributeName },
            );
          }
        }
      }
    };
    return await saveWithVisualizationAttribute();
  }

  /**
   * Return renderer-aware figure export limits and preset availability.
   *
   * @public
   * @apiSection Figure Export
   * @param {{supersampling?: number|string}} [options] - Supersampling request
   * used when computing max safe output dimensions.
   * @returns {{maxBitmapDimension:number,maxFigureDimension:number,defaultPreset:string,presets:Array<object>}}
   * Export capability record for the current renderer and viewport.
   * @remarks WebGL and WebGPU expose different maximum texture dimensions, so
   * this method should be called after `await helios.ready` and whenever
   * supersampling changes.
   */
  getFigureExportCapabilities(options = {}) {
    const supersampling = Number(options.supersampling ?? 1);
    const capability = getFigureExportCapability(this.renderer, supersampling);
    return {
      ...capability,
      windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
      defaultPreset: resolveFigureExportOptions({}, {
        renderer: this.renderer,
        capability: {
          ...capability,
          windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
        },
        windowSize: this.layers?.size ?? this.size ?? {},
        windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
      }).preset,
      presets: buildFigureExportPresetList(
        this.layers?.size ?? this.size ?? {},
        {
          ...capability,
          windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
        },
        supersampling,
      ),
    };
  }

  _resolveFigureExportOptions(options = {}) {
    const supersampling = Number(options.supersampling ?? 1);
    const capability = getFigureExportCapability(this.renderer, supersampling);
    return resolveFigureExportOptions(options, {
      renderer: this.renderer,
      capability,
      windowSize: this.layers?.size ?? this.size ?? { width: 1, height: 1 },
      windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
    });
  }

  async _prepareFigureExportFrame() {
    if (typeof document === 'undefined') {
      throw new Error('Figure export requires a browser environment');
    }
    if (!this.renderer || !this.scheduler) {
      throw new Error('Figure export requires an initialized renderer');
    }
    if (!this.network) {
      throw new Error('Figure export requires an active network');
    }
    this.visuals?.seedMissingPositions?.(this.layers?.size ?? this.size);
    this._applyMappersSafely();
    const frame = this.scheduler.geometryCallback?.() ?? this.scheduler.currentFrame ?? null;
    if (!frame) {
      throw new Error('Figure export requires an available render frame');
    }
    return frame;
  }

  _buildFigureExportCamera(sourceCamera, options = {}) {
    const exportViewport = options.exportFigureLogicalViewport ?? buildExportLogicalViewport(options);
    if (!sourceCamera?.getUniforms) return sourceCamera;

    const sourceUniforms = sourceCamera.getUniforms();
    if (!sourceUniforms?.viewProjection || !sourceUniforms?.view || !sourceUniforms?.projection) {
      return sourceCamera;
    }
    if (sourceCamera.mode !== '3d') {
      return sourceCamera;
    }

    const liveViewport = sourceCamera.viewport ?? sourceUniforms.viewport ?? null;
    const previewRect = options.previewRect ?? null;
    if (!liveViewport || !previewRect) {
      return sourceCamera;
    }

    const projectionMatrix = new Float32Array(sourceUniforms.projection);
    const viewMatrix = new Float32Array(sourceUniforms.view);
    const nextProjection = createMat4Identity();

    if (sourceCamera.projection === 'orthographic') {
      const liveBounds = deriveOrthographicBounds(projectionMatrix);
      if (!liveBounds) return sourceCamera;
      const exportBounds = interpolateFrameBounds(liveBounds, previewRect, liveViewport);
      mat4Ortho(
        nextProjection,
        exportBounds.left,
        exportBounds.right,
        exportBounds.bottom,
        exportBounds.top,
        Number(sourceCamera.near ?? 0.1),
        Number(sourceCamera.far ?? 100000),
      );
    } else {
      const near = Math.max(1e-6, Number(sourceCamera.near ?? 0.1));
      const liveBounds = derivePerspectiveBounds(projectionMatrix, near);
      if (!liveBounds) return sourceCamera;
      const exportBounds = interpolateFrameBounds(liveBounds, previewRect, liveViewport);
      mat4Frustum(
        nextProjection,
        exportBounds.left,
        exportBounds.right,
        exportBounds.bottom,
        exportBounds.top,
        near,
        Math.max(near + 1e-6, Number(sourceCamera.far ?? 100000)),
      );
    }

    const nextViewProjection = createMat4Identity();
    mat4Multiply(nextViewProjection, nextProjection, viewMatrix);

    const exportUniforms = {
      ...sourceUniforms,
      view: viewMatrix,
      projection: nextProjection,
      viewProjection: nextViewProjection,
      position: new Float32Array(sourceUniforms.position),
      right: new Float32Array(sourceUniforms.right),
      up: new Float32Array(sourceUniforms.up),
      viewport: {
        ...(sourceUniforms.viewport ?? {}),
        ...exportViewport,
      },
    };

    return {
      mode: sourceCamera.mode,
      projection: sourceCamera.projection,
      viewport: { ...exportUniforms.viewport },
      near: sourceCamera.near,
      far: sourceCamera.far,
      setViewport(size) {
        if (!size) return;
        this.viewport = { ...this.viewport, ...size };
        exportUniforms.viewport = { ...exportUniforms.viewport, ...size };
      },
      getUniforms() {
        return {
          ...exportUniforms,
          viewport: { ...exportUniforms.viewport },
        };
      },
    };
  }

  async _captureFigureBitmap(options, frame) {
    const renderer = this.renderer ?? null;
    if (!renderer?.camera) throw new Error('Figure export requires an initialized camera');

    const framebuffer = renderer.createFramebuffer(options.framebufferWidth, options.framebufferHeight);
    const previousClearColor = Array.isArray(renderer.clearColor) ? [...renderer.clearColor] : null;
    const exportFigureLogicalViewport = options.exportFigureLogicalViewport ?? null;
    const sourceCamera = frame?.camera ?? renderer.camera;
    const exportCamera = this._buildFigureExportCamera(sourceCamera, options);
    const exportFrame = exportCamera === sourceCamera ? frame : { ...frame, camera: exportCamera };
    const previousCameraViewport = sourceCamera?.viewport ? { ...sourceCamera.viewport } : null;
    const graphLayer = renderer.graphLayer ?? null;
    const previousManualFastEdges = graphLayer?.edgeFastRendering === true;
    const previousAdaptiveFastEdges = graphLayer?.edgeAdaptiveFastRendering === true;
    const previousForceHighQuality = this._edgeAdaptiveRuntime?.forceHighQuality === true;
    try {
      if (this._edgeAdaptiveRuntime) {
        this._edgeAdaptiveRuntime.forceHighQuality = true;
      }
      if (graphLayer) {
        graphLayer.setEdgeFastRendering?.(false);
        graphLayer.setAdaptiveEdgeFastRendering?.(false);
      }
      if (options.transparentBackground === true) {
        renderer.clearColor = [0, 0, 0, 0];
      }
      if (framebuffer && typeof framebuffer === 'object') {
        framebuffer.exportFigureLogicalViewport = exportFigureLogicalViewport
          ? {
              width: Math.max(1, Number(exportFigureLogicalViewport.width ?? 1)),
              height: Math.max(1, Number(exportFigureLogicalViewport.height ?? 1)),
              devicePixelRatio: Math.max(1, Number(exportFigureLogicalViewport.devicePixelRatio ?? 1)),
            }
          : null;
      }
      if (exportFigureLogicalViewport && typeof exportCamera?.setViewport === 'function') {
        exportCamera.setViewport(exportFigureLogicalViewport);
      }
      renderer.setRenderTarget(framebuffer);
      renderer.render(exportFrame);
      const pixels = await renderer.readPixels(framebuffer, {
        x: options.cropRect.x,
        y: options.cropRect.y,
        width: options.cropRect.width,
        height: options.cropRect.height,
      });
      return pixelsToCanvas(
        pixels,
        options.cropRect.width,
        options.cropRect.height,
        options.width,
        options.height,
        {
          flipY: renderer.device?.type === 'webgl2',
          swizzleBGRA: renderer.device?.type === 'webgpu' && String(renderer.device?.format ?? '').startsWith('bgra'),
          alphaMode: options.transparentBackground === true ? options.alphaMode : 'straight',
        },
      );
    } finally {
      const cleanup = (key, message, fn) => {
        try {
          fn();
        } catch (error) {
          warnOnce(this, key, message, { error });
        }
      };
      cleanup('figure-export-edge-quality-restore', 'Helios: failed to restore edge quality settings after figure export.', () => {
        if (graphLayer) {
          graphLayer.setEdgeFastRendering?.(previousManualFastEdges);
          graphLayer.setAdaptiveEdgeFastRendering?.(previousAdaptiveFastEdges);
        }
        if (this._edgeAdaptiveRuntime) {
          this._edgeAdaptiveRuntime.forceHighQuality = previousForceHighQuality;
        }
      });
      if (previousClearColor) {
        cleanup('figure-export-clear-color-restore', 'Helios: failed to restore renderer clear color after figure export.', () => {
          renderer.clearColor = previousClearColor;
        });
      }
      if (exportCamera === sourceCamera && previousCameraViewport && typeof sourceCamera?.setViewport === 'function') {
        cleanup('figure-export-camera-viewport-restore', 'Helios: failed to restore camera viewport after figure export.', () => {
          sourceCamera.setViewport(previousCameraViewport);
        });
      }
      cleanup('figure-export-render-target-reset', 'Helios: failed to reset render target after figure export.', () => {
        renderer.setRenderTarget(null);
      });
      cleanup('figure-export-framebuffer-destroy', 'Helios: failed to destroy figure export framebuffer resources.', () => {
        const device = renderer.device ?? null;
        if (framebuffer?.type === 'webgl2') {
          const gl = device?.gl ?? null;
          if (gl) {
            if (framebuffer.handle) gl.deleteFramebuffer?.(framebuffer.handle);
            if (framebuffer.texture) gl.deleteTexture?.(framebuffer.texture);
            if (framebuffer.depth) gl.deleteRenderbuffer?.(framebuffer.depth);
          }
        } else if (framebuffer?.type === 'webgpu') {
          framebuffer.texture?.destroy?.();
          framebuffer.depthTexture?.destroy?.();
        }
      });
    }
  }

  _captureFigureOverlay(options) {
    if (typeof document === 'undefined') return null;
    const renderer = this.renderer ?? null;
    if (!renderer?.camera) return null;
    const labelBaseConfig = this._labels?.getConfig?.() ?? {};
    const legendBaseConfig = this._legends?.getConfig?.() ?? { scale: 1 };
    const exportReferenceSize = {
      width: options.width,
      height: options.height,
    };
    const viewReferenceSize = renderer.camera?.viewport ?? this.layers?.size ?? this.size ?? exportReferenceSize;
    const exportRelativeScale = resolveFigureRelativeOverlayScale(exportReferenceSize, viewReferenceSize, 1);
    const legendScale = Math.max(
      0.25,
      Number(legendBaseConfig.scale ?? 1)
        * exportRelativeScale
        * Number(options.legendScale ?? 1),
    );
    const targetSize = {
      width: options.width,
      height: options.height,
      devicePixelRatio: 1,
    };
    const exportFigureLogicalViewport = options.exportFigureLogicalViewport ?? buildExportLogicalViewport(options);
    const previousCameraViewport = renderer.camera?.viewport ? { ...renderer.camera.viewport } : null;
    const exportCamera = this._buildFigureExportCamera(renderer.camera, options);
    let exportUniforms = null;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', `${options.width}`);
    svg.setAttribute('height', `${options.height}`);
    svg.setAttribute('viewBox', `0 0 ${options.width} ${options.height}`);

    if (options.includeLabels) {
      try {
        if (exportCamera !== renderer.camera) {
          exportCamera.setViewport?.(exportFigureLogicalViewport);
          exportUniforms = exportCamera.getUniforms?.() ?? null;
        } else if (exportFigureLogicalViewport && typeof renderer.camera?.setViewport === 'function') {
          renderer.camera.setViewport(exportFigureLogicalViewport);
          exportUniforms = renderer.camera.getUniforms?.() ?? null;
        }
        const labelGroup = this._labels?.createSnapshot?.({
          timestamp: performance.now(),
          uniforms: exportUniforms,
          config: {
            fontFamily: options.format === 'svg'
              ? ILLUSTRATOR_EXPORT_FONT_FAMILY
              : labelBaseConfig.fontFamily,
            illustratorCompatible: options.format === 'svg',
          },
        });
        if (labelGroup) svg.appendChild(labelGroup);
      } finally {
        if (previousCameraViewport && typeof renderer.camera?.setViewport === 'function') {
          try {
            renderer.camera.setViewport(previousCameraViewport);
          } catch (error) {
            warnOnce(
              this,
              'figure-overlay-camera-viewport-restore',
              'Helios: failed to restore camera viewport after overlay capture.',
              { error },
            );
          }
        }
      }
    }
    if (options.includeLegends) {
      const exportInsets = options.includeInterface === true
        ? {
            top: Math.max(0, Number(this._overlayInsets?.top ?? 0)),
            right: Math.max(0, Number(this._overlayInsets?.right ?? 0)),
            bottom: Math.max(0, Number(this._overlayInsets?.bottom ?? 0)),
            left: Math.max(0, Number(this._overlayInsets?.left ?? 0)),
          }
        : { top: 0, right: 0, bottom: 0, left: 0 };
      const legendGroup = this._legends?.createSnapshot?.({
        size: targetSize,
        insets: exportInsets,
        viewportHeight: options.height * Number(options.legendScale ?? 1),
        config: {
          enabled: true,
          respectDockInsets: options.includeInterface === true,
          margin: Number(legendBaseConfig.margin ?? 12) * exportRelativeScale,
          gap: Number(legendBaseConfig.gap ?? 12) * exportRelativeScale,
          scale: legendScale,
          maxScale: 64,
          scalePreviewLegends: true,
          illustratorCompatible: options.format === 'svg',
          fontFamily: options.format === 'svg' ? ILLUSTRATOR_EXPORT_FONT_FAMILY : legendBaseConfig.fontFamily,
        },
      });
      if (legendGroup) {
        legendGroup.dataset.exportLegendScale = `${legendScale}`;
      }
      if (legendGroup) svg.appendChild(legendGroup);
    }
    if (!svg.childNodes.length) return null;
    return svg;
  }

  async _composeFigurePng(canvas, overlaySvg, options = {}) {
    if (!overlaySvg) {
      if (options.transparentBackground === true) {
        return canvasToBlob(canvas, 'image/png');
      }
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = canvas.width;
      outputCanvas.height = canvas.height;
      const ctx = outputCanvas.getContext('2d');
      if (!ctx) throw new Error('Unable to create a 2D canvas context for PNG export');
      ctx.fillStyle = resolveExportBackgroundColor(options.backgroundColor).css;
      ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
      ctx.drawImage(canvas, 0, 0);
      return canvasToBlob(outputCanvas, 'image/png');
    }
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = canvas.width;
    outputCanvas.height = canvas.height;
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) throw new Error('Unable to create a 2D canvas context for PNG export');
    if (options.transparentBackground !== true) {
      ctx.fillStyle = resolveExportBackgroundColor(options.backgroundColor).css;
      ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    }
    ctx.drawImage(canvas, 0, 0);
    const overlayImage = await loadSvgImage(elementToMarkup(overlaySvg));
    ctx.drawImage(overlayImage, 0, 0, outputCanvas.width, outputCanvas.height);
    return canvasToBlob(outputCanvas, 'image/png');
  }

  _composeFigureSvg(canvas, overlaySvg, options) {
    const bitmapHref = canvas.toDataURL('image/png');
    const overlays = overlaySvg
      ? Array.from(overlaySvg.childNodes).map((node) => elementToMarkup(node)).join('')
      : '';
    const backgroundRect = options.transparentBackground === true
      ? ''
      : `<rect width="${options.width}" height="${options.height}" fill="${resolveExportBackgroundColor(options.backgroundColor).css}" />`;
    const svgText = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">`,
      backgroundRect,
      `<image width="${options.width}" height="${options.height}" href="${bitmapHref}" xlink:href="${bitmapHref}" />`,
      overlays,
      '</svg>',
    ].join('');
    return new Blob([svgText], { type: 'image/svg+xml' });
  }

  /**
   * Capture the current visualization as a PNG or SVG `Blob`.
   *
   * @public
   * @apiSection Figure Export
   * @param {object} [options] - Figure export options including `format`,
   * `preset`, `width`, `height`, `supersampling`, `includeLabels`,
   * `includeLegends`, `includeInterface`, `transparentBackground`, and
   * `legendScale`.
   * @returns {Promise<Blob>} Image blob for the requested figure.
   * @throws {Error} When the browser, renderer, network, camera, or requested
   * dimensions cannot support the export.
   * @example
   * const blob = await helios.exportFigureBlob({
   *   format: 'png',
   *   width: 1920,
   *   height: 1080,
   *   includeLabels: true,
   *   includeLegends: true,
   * });
   */
  async exportFigureBlob(options = {}) {
    const resolved = this._resolveFigureExportOptions(options);
    const exportOptions = {
      ...resolved,
      backgroundColor: Array.isArray(this.renderer?.clearColor) ? [...this.renderer.clearColor] : [1, 1, 1, 1],
      exportFigureLogicalViewport: buildExportLogicalViewport({
        ...resolved,
        devicePixelRatio: 1,
      }),
    };
    if (!exportOptions.fitsCapability) {
      throw new Error(
        `Requested export requires ${exportOptions.bitmapWidth}x${exportOptions.bitmapHeight} raster pixels, `
        + `but the current renderer is capped at ${exportOptions.capability.maxBitmapDimension}px per dimension.`,
      );
    }
    try {
      const frame = await this._prepareFigureExportFrame();
      const bitmapCanvas = await this._captureFigureBitmap(exportOptions, frame);
      const overlaySvg = this._captureFigureOverlay(exportOptions);
      return exportOptions.format === 'svg'
        ? this._composeFigureSvg(bitmapCanvas, overlaySvg, exportOptions)
        : await this._composeFigurePng(bitmapCanvas, overlaySvg, exportOptions);
    } finally {
      this.scheduler?.requestRender?.();
    }
  }

  /**
   * Capture a scaled PNG preview for a full-size figure export request.
   *
   * @public
   * @apiSection Figure Export
   * @param {object} [options] - Full export options that should be previewed.
   * @param {{maxWidth?:number,maxHeight?:number,supersampling?:number|string}} [previewOptions]
   * Preview output constraints.
   * @returns {Promise<Blob>} PNG preview blob.
   * @remarks Preview capture keeps the full export's framing and overlay intent
   * while using smaller raster dimensions for UI previews.
   */
  async exportFigurePreviewBlob(options = {}, previewOptions = {}) {
    const resolved = this._resolveFigureExportOptions(options);
    const fullExportOptions = {
      ...resolved,
      format: 'png',
      backgroundColor: Array.isArray(this.renderer?.clearColor) ? [...this.renderer.clearColor] : [1, 1, 1, 1],
      exportFigureLogicalViewport: buildExportLogicalViewport({
        ...resolved,
        devicePixelRatio: 1,
      }),
    };
    const previewRequest = resolveFigurePreviewThumbnailOptions(fullExportOptions, previewOptions);
    const previewResolved = this._resolveFigureExportOptions(previewRequest);
    const previewExportOptions = {
      ...previewResolved,
      format: 'png',
      includeLabels: fullExportOptions.includeLabels,
      includeLegends: fullExportOptions.includeLegends,
      legendScale: fullExportOptions.legendScale,
      transparentBackground: fullExportOptions.transparentBackground,
      alphaMode: fullExportOptions.alphaMode,
      backgroundColor: fullExportOptions.backgroundColor,
      exportFigureLogicalViewport: buildExportLogicalViewport({
        width: fullExportOptions.width ?? previewResolved.width,
        height: fullExportOptions.height ?? previewResolved.height,
        bitmapWidth: previewResolved.bitmapWidth,
        bitmapHeight: previewResolved.bitmapHeight,
        logicalWidth: fullExportOptions.exportFigureLogicalViewport?.width,
        logicalHeight: fullExportOptions.exportFigureLogicalViewport?.height,
        devicePixelRatio: 1,
      }),
    };

    const frame = await this._prepareFigureExportFrame();
    const bitmapCanvas = await this._captureFigureBitmap(previewExportOptions, frame);
    const overlaySvg = this._captureFigureOverlay(fullExportOptions);
    return await this._composeFigurePng(bitmapCanvas, overlaySvg, previewExportOptions);
  }

  async captureSessionThumbnailBlob(options = {}) {
    try {
      const blob = await scaledCanvasThumbnailBlob(this._getInteractionCanvas?.(), options);
      return blob ?? null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Capture and download the current visualization.
   *
   * @public
   * @apiSection Figure Export
   * @param {string|object} [filenameOrOptions] - Download filename or figure
   * export options.
   * @param {object} [maybeOptions] - Figure export options when the first
   * argument is a filename.
   * @returns {Promise<object>} Download metadata containing `blob`, `filename`,
   * `format`, logical dimensions, bitmap dimensions, and supersampling.
   * @remarks In non-browser runtimes the method still creates the figure blob
   * and returns metadata, but no download link is clicked.
   */
  async exportFigure(filenameOrOptions, maybeOptions = {}) {
    const options = typeof filenameOrOptions === 'string'
      ? { ...maybeOptions, filename: filenameOrOptions }
      : { ...(filenameOrOptions ?? {}) };
    const resolved = this._resolveFigureExportOptions(options);
    const blob = await this.exportFigureBlob(options);
    if (typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = resolved.filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    }
    return {
      blob,
      filename: resolved.filename,
      format: resolved.format,
      width: resolved.width,
      height: resolved.height,
      bitmapWidth: resolved.bitmapWidth,
      bitmapHeight: resolved.bitmapHeight,
      supersampling: resolved.supersampling,
    };
  }

  /**
   * Add an event listener and receive an unsubscribe function.
   *
   * @public
   * @apiSection Events
   * @param {string} type - Event type, usually one of the `EVENTS` constants.
   * @param {Function} handler - Listener function.
   * @param {object|boolean} [options] - DOM `addEventListener` options.
   * @returns {Function} Function that removes the listener.
   * @example
   * const unsubscribe = helios.on(EVENTS.NODE_CLICK, (event) => {
   *   console.log(event.detail.index);
   * });
   */
  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    if (options?.signal && typeof options.signal.addEventListener === 'function') {
      const signal = options.signal;
      if (signal.aborted) {
        this.removeEventListener(type, handler, options);
      } else {
        signal.addEventListener('abort', () => this.removeEventListener(type, handler, options), { once: true });
      }
    }
    return () => this.off(type, handler, options);
  }

  /**
   * Add or replace a namespaced event listener.
   *
   * @public
   * @apiSection Events
   * @param {string} typeWithNamespace - Event type, optionally followed by
   * `.namespace` for replacement/removal.
   * @param {Function|null} handler - Listener function, or `null` to remove.
   * @param {object|boolean} [options] - DOM listener options.
   * @returns {Helios} This Helios instance.
   * @example
   * helios.listen(`${EVENTS.NODE_HOVER}.tooltip`, ({ detail }) => {
   *   updateTooltip(detail);
   * });
   */
  listen(typeWithNamespace, handler, options) {
    const parsed = parseNamespacedEventType(typeWithNamespace);
    const namespace = parsed.namespace ?? '';
    const key = `${parsed.type}\u0000${namespace}`;
    const capture = options === true ? true : Boolean(options?.capture);

    const existing = this._listenHandlers.get(key);
    if (existing) {
      this.removeEventListener(parsed.type, existing.listener, existing.capture);
      existing.unsubscribeSignal?.();
      this._listenHandlers.delete(key);
    }

    if (handler == null) {
      return this;
    }
    if (typeof handler !== 'function') {
      throw new TypeError('listen() handler must be a function or null');
    }

    const listener = (event) => handler(event);
    const listenerOptions = options === true || options === false
      ? options
      : { ...options, signal: undefined };
    this.addEventListener(parsed.type, listener, listenerOptions);

    let unsubscribeSignal = null;
    const signal = options?.signal;
    if (signal && typeof signal.addEventListener === 'function') {
      if (signal.aborted) {
        this.removeEventListener(parsed.type, listener, capture);
      } else {
        const onAbort = () => this.listen(typeWithNamespace, null);
        signal.addEventListener('abort', onAbort, { once: true });
        unsubscribeSignal = () => signal.removeEventListener?.('abort', onAbort);
      }
    }

    this._listenHandlers.set(key, {
      type: parsed.type,
      namespace,
      listener,
      capture,
      unsubscribeSignal,
    });

    return this;
  }

  /**
   * Remove an event listener.
   *
   * @public
   * @apiSection Events
   * @param {string} type - Event type.
   * @param {Function} handler - Listener function originally registered.
   * @param {object|boolean} [options] - DOM listener options.
   */
  off(type, handler, options) {
    this.removeEventListener(type, handler, options);
  }

  /**
   * Observe every event emitted through Helios.
   *
   * @public
   * @apiSection Events
   * @param {Function} handler - Listener receiving `{ type, detail, event, target }`.
   * @param {object} [options] - Listener options, including `signal`.
   * @returns {Function} Function that removes the listener.
   */
  onAny(handler, options) {
    if (typeof handler !== 'function') return () => {};
    this._anyListeners.add(handler);
    const unsubscribe = () => this._anyListeners.delete(handler);
    if (options?.signal && typeof options.signal.addEventListener === 'function') {
      const signal = options.signal;
      if (signal.aborted) {
        unsubscribe();
      } else {
        signal.addEventListener('abort', unsubscribe, { once: true });
      }
    }
    return unsubscribe;
  }

  /**
   * Dispatch a Helios event.
   *
   * @public
   * @apiSection Events
   * @param {string} type - Event type.
   * @param {object} [detail] - Event detail payload.
   * @returns {CustomEvent} Dispatched event object.
   */
  emit(type, detail) {
    const event = new CustomEvent(type, { detail });
    this.dispatchEvent(event);
    if (this._anyListeners?.size) {
      for (const handler of this._anyListeners) {
        try {
          handler({ type, detail, event, target: this });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Helios onAny handler failed', error);
        }
      }
    }
    return event;
  }

  /**
   * Initialize layout, renderer, picking, attribute tracking, and scheduler state.
   *
   * @public
   * @apiSection Lifecycle
   * @returns {Promise<void>} Resolves when the first renderer and layout setup is complete.
   * @remarks The constructor calls this automatically and exposes the promise as
   * `helios.ready`; applications usually await `ready` instead of calling this directly.
   */
  async initialize() {
    this.debug.log('helios', 'Initializing layout');
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    if (this._layout?.setUpdateListener) {
      this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    }
    await this._layout?.initialize?.();
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    this.debug.log('helios', 'Layout initialized', { layout: this._layout?.constructor?.name });
    this._layout?.resize?.(this.layers.size);
    this.debug.log('layout', 'Layout resized to initial viewport', this.layers.size);

    this.debug.log('helios', 'Creating renderer', {
      mode: this.options.mode ?? '3d',
      projection: this.options.projection ?? 'perspective',
      renderer: this.options.renderer ?? 'auto',
    });
    const extraStateSlotsRaw = this.options.extraStateSlots ?? 1;
    const extraStateSlots = Number.isFinite(extraStateSlotsRaw) ? Math.max(0, Math.floor(extraStateSlotsRaw)) : 1;
    const stateSlots = Math.min(32, 3 + extraStateSlots);
    this.renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
      forceWebGPU: this.options.renderer === 'webgpu',
      mode: this.options.mode ?? '3d',
      projection: this.options.projection ?? 'perspective',
      suppressBrowserGestures: this.options.suppressBrowserGestures !== false,
      antialias: this.options.antialias,
      powerPreference: this.options.powerPreference,
      webglContextAttributes: this.options.webglContextAttributes,
      webgpuAdapterOptions: this.options.webgpuAdapterOptions,
      webgpuDeviceDescriptor: this.options.webgpuDeviceDescriptor,
      webgpuCanvasConfiguration: this.options.webgpuCanvasConfiguration,
      supersampling: this.options.supersampling,
      forceSupersample: this.options.forceSupersample,
      supersamplingAutoFactor: this.options.supersamplingAutoFactor,
      supersamplingAutoThreshold: this.options.supersamplingAutoThreshold,
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
      edgeEndpointTrim: this.options.edgeEndpointTrim,
      edgeWidthClampToNodeDiameter: this.options.edgeWidthClampToNodeDiameter,
      edgeFastRendering: this.options.edgeFastRendering,
      stateSlots,
    });
    this.debug.log('helios', 'Renderer created', { renderer: this.renderer?.constructor?.name });
    this._applyPendingRendererProps();
    this._applyPositionPipelineToRenderer();
    this._attachDensityLayer();
    this._applyCachedStateStyles();
    this.attributeTracker = new AttributeTracker(this.renderer);
    this.attributeTracker.resize(this.layers.size);
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
    }
    this._reapplyBehaviorRendererBindings();
    if (this.mappersDirty) {
      this._applyMappersSafely();
    }
    this.scheduler.setAttributeCallback(
      (frame) => {
        if (!frame) return;
        this.counters.attributeUpdateTicks = bumpCounter(this.counters.attributeUpdateTicks);
        this.attributeTracker?.render(frame, false);
        this.indexPickingTracker?.render(frame, false);
      },
      {
        autoUpdate: this.attributeUpdateOptions.autoUpdate,
        maxFps: this.attributeUpdateOptions.maxFps,
        frameSkip: this.attributeUpdateOptions.frameSkip,
      },
    );
    this.scheduler.setLayoutEventHandlers({
      start: (payload) => {
        this.emit(EVENTS.LAYOUT_START, { ...payload, algo: this._layout?.constructor?.name ?? null });
      },
      stop: (payload) => {
        this.emit(EVENTS.LAYOUT_STOP, { ...payload, algo: this._layout?.constructor?.name ?? null });
        this.scheduler?.requestRender?.();
      },
    });
    if (this.renderer?.camera?.setChangeListener) {
      this.renderer.camera.setChangeListener((detail) => {
        this.scheduler.requestRender();
        this._markEdgeAdaptiveCameraInteraction(detail);
        if (detail?.origin === 'interaction') {
          this._disableAutomaticCameraControlFromInteraction(detail);
        }
        this._scheduleCameraMove(detail);
        this.debug.log('helios', 'Camera change requested render');
      });
    }

    this.removeResizeListener = this.layers.onResize((size) => {
      this.size = size;
      if (this.renderer?.resize) {
        this.renderer.resize(size);
      }
      this.attributeTracker?.resize(size);
      this.indexPickingTracker?.resize(size);
      this._layout?.resize?.(size);
      this._labels?.requestFullReselect?.('resize');
      this._tryPendingFrameNetwork();
      this._handleResizeAutoFit();
      if (!this.manualRendering) {
        this.scheduler.requestGeometry();
        this.scheduler.requestRender();
        this.debug.log('helios', 'Resize requested geometry/render', size);
      }
      this.emit(EVENTS.RESIZE, { size: { ...size } });
    });

    this.debug.log('scheduler', 'Setting scheduler callbacks');
    this.scheduler.setLayout(this._layout);
    this.scheduler.setGeometryCallback(() => {
      this.counters.geometryFrames = bumpCounter(this.counters.geometryFrames);
      if (this.mappersDirty) {
        this.debug.log('mapper', 'Applying mappers to visuals');
        this._applyMappersSafely();
      }
      const renderNetwork = this._getRenderNetwork();
      const frame = {
        network: renderNetwork,
        timestamp: performance.now(),
        camera: this.renderer?.camera,
      };
      if (!this.firstGeometryUpdateComplete) {
        this.firstGeometryUpdateComplete = true;
        this.debug.log('scheduler', 'First geometry frame ready', {
          nodes: renderNetwork?.nodeCount ?? this.network?.nodeCount,
          edges: renderNetwork?.edgeCount ?? this.network?.edgeCount,
        });
      } else {
        this.debug.log('scheduler', 'Geometry frame prepared', {
          nodes: renderNetwork?.nodeCount ?? this.network?.nodeCount,
          edges: renderNetwork?.edgeCount ?? this.network?.edgeCount,
        });
      }
      this._tryPendingFrameNetwork();
      return frame;
    });
    this.scheduler.setRenderCallback((frame) => {
      const now = performance.now();
      if (this._shouldSuppressStartupRender(now)) {
        this._refreshLargeNetworkStartupFit();
        return false;
      }
      this._refreshLargeNetworkStartupFit({ force: true });
      this._finishStartupFirstVisibleFrame();
      this.debug.log('scheduler', 'Rendering frame', {
        renderer: this.renderer?.constructor?.name,
        size: this.size,
      });
      if (this.firstGeometryUpdateComplete && this.renderer && typeof this.renderer.render === 'function') {
        this.counters.renderFrames = bumpCounter(this.counters.renderFrames);
        const dt = now - this._lastRenderTime;
        this._lastRenderTime = now;
        this._frameId += 1;
        this._updateEdgeAdaptiveQualityBeforeRender(now);
        this.emit(EVENTS.BEFORE_RENDER, { frameId: this._frameId, dt, frame, size: { ...this.size } });
        const renderStart = performance.now();
        this.renderer.render(frame, this.size);
        const renderEnd = performance.now();
        this._updateEdgeAdaptiveQualityAfterRender(
          this._resolveEdgeAdaptiveFrameCostMs(renderEnd - renderStart, dt),
          renderEnd,
        );
        this._labels?.update?.({ timestamp: now });
        this._legends?.update?.({ timestamp: now });
        this.emit(EVENTS.AFTER_RENDER, { frameId: this._frameId, dt, frame, size: { ...this.size } });
      }
    });
    let storageSessionsActive = false;
    if (this.storage?.ready && typeof this.storage.ready.then === 'function') {
      await this.storage.ready.catch((error) => {
        console.warn('[HeliosStorage] Initial storage restore failed', error);
        return null;
      });
    }
    const sessionOptions = this._sessionPersistenceOptions && typeof this._sessionPersistenceOptions === 'object'
      ? this._sessionPersistenceOptions
      : {};
    if (this._sessionPersistenceOptions !== false) {
      const configured = this.storage?.configureSession?.({
        ...sessionOptions,
        deferRestore: true,
      });
      storageSessionsActive = configured != null && this.storage?.capabilities?.sessions === true;
    }
    await this._initializeOptionalUI();
    if (storageSessionsActive) {
      if (sessionOptions.restore !== false) {
        this._sessionRestoreResult = await this.storage?.restoreActiveSession?.({
          ...sessionOptions,
          restoreNetwork: sessionOptions.restoreNetwork === true,
        });
      } else if (sessionOptions.saveInitialManifest !== false) {
        await this.storage?.saveSession?.({
          ...sessionOptions,
          id: sessionOptions.id ?? sessionOptions.sessionId ?? this.storage?.sessionId ?? undefined,
          networkFormat: sessionOptions.networkFormat ?? sessionOptions.networkPersistence?.format,
        });
      }
      const sessionStatus = this.storage?.persistenceStatus?.() ?? {};
      const networkData = sessionStatus.networkData ?? {};
      const shouldAutosaveInitialNetwork = sessionOptions.saveInitialNetwork !== false
        && this.storage?.get?.('network.persistence.autosave', true) === true
        && sessionStatus.explicitSessionInvalid !== true
        && networkData.status !== 'saved'
        && networkData.status !== 'skipped'
        && networkData.status !== 'error';
      if (shouldAutosaveInitialNetwork) {
        this.storage?.markNetworkDirty?.(networkData.reason ?? 'session-initial-network');
      }
    }
    this._requestStartupInitialCameraFit();
    if (!this.manualRendering) {
      this.scheduler.start();
      this.scheduler.requestGeometry();
      this.debug.log('scheduler', 'Scheduler started (auto rendering)');
    } else {
      // In manual mode, run initial geometry setup but don't start scheduler
      if (this.mappersDirty) {
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
      }
      this.firstGeometryUpdateComplete = true;
      this.debug.log('helios', 'Manual rendering enabled, initial geometry applied');
    }
    this._applyPickingConfig();
    this._scheduleStorageOverrideTrackingReady();
    this.debug.log('helios', 'Initialization complete');
    return this;
  }

  _applyCachedStateStyles() {
    const layer = this.renderer?.graphLayer ?? null;
    if (!layer) return false;
    const cached = this._stateStyleCache;
    if (!cached) return false;
    if (!cached.nodeSlots.size && !cached.edgeSlots.size && !cached.nodeNoState && !cached.edgeNoState && !cached.nodeHover && !cached.edgeHover) {
      return false;
    }
    layer.resetStateStyles?.();
    if (cached.nodeNoState) {
      layer.setNodeNoStateStyle?.(cached.nodeNoState);
    }
    if (cached.edgeNoState) {
      layer.setEdgeNoStateStyle?.(cached.edgeNoState);
    }
    if (cached.nodeHover) {
      layer.setNodeHoverStyle?.(cached.nodeHover);
    }
    if (cached.edgeHover) {
      layer.setEdgeHoverStyle?.(cached.edgeHover);
    }
    for (const [slot, style] of cached.nodeSlots.entries()) {
      layer.setNodeStateStyle?.(slot, style);
    }
    for (const [slot, style] of cached.edgeSlots.entries()) {
      layer.setEdgeStateStyle?.(slot, style);
    }
    return true;
  }

  _withPositionBufferAccess(fn) {
    if (typeof this.visuals?.withBufferAccess === 'function') {
      return this.visuals.withBufferAccess(fn);
    }
    if (typeof this.network?.withBufferAccess === 'function') {
      return this.network.withBufferAccess(fn);
    }
    return fn();
  }

  _withRenderNetworkBufferAccess(network, fn) {
    if (typeof network?.withBufferAccess === 'function') {
      return network.withBufferAccess(fn);
    }
    return this._withPositionBufferAccess(fn);
  }

  _readNodePositionViewUnsafe() {
    try {
      return this.network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
    } catch (error) {
      warnOnce(
        this,
        'node-position-view',
        'Helios: failed to read node position view.',
        { error },
      );
      return null;
    }
  }

  _snapshotNodePositions(reuseBuffer = null) {
    let snapshot = null;
    this._withPositionBufferAccess(() => {
      const view = this._readNodePositionViewUnsafe();
      if (!view || !Number.isFinite(view.length) || view.length <= 0) {
        snapshot = null;
        return;
      }
      const out = reuseBuffer && reuseBuffer.length === view.length
        ? reuseBuffer
        : new Float32Array(view.length);
      out.set(view);
      snapshot = out;
    });
    return snapshot;
  }

  _buildLayoutRuntimeState(snapshot, options = {}) {
    const layout = this._layout ?? null;
    const scheduler = this.scheduler ?? null;
    const layoutState = typeof scheduler?.getLayoutState === 'function'
      ? scheduler.getLayoutState()
      : (scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
    const maxPositionBytes = Number.isFinite(options.maxPositionBytes)
      ? Math.max(0, Number(options.maxPositionBytes))
      : DEFAULT_LAYOUT_RUNTIME_POSITION_LIMIT_BYTES;
    const alpha = this._readLayoutAlpha(layout);
    const center = this._computePositionSnapshotCenter(snapshot, this.network);
    const layoutBehavior = this.behaviors?.get?.('layout') ?? this.behaviors?.layout ?? null;
    const explicitPositionSource = options.positionSource === 'delegate'
      ? 'delegate'
      : (options.positionSource === 'network' ? 'network' : null);
    const positionSource = explicitPositionSource ?? (this._positionsConfig?.source === 'delegate' ? 'delegate' : 'network');
    const delegate = positionSource === 'delegate'
      ? (options.delegate ?? this._positionsConfig?.delegate ?? this._activePositionDelegate ?? layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null)
      : null;
    const state = {
      schema: 'helios-web.layout-runtime-state',
      version: 1,
      capturedAt: Date.now(),
      layoutType: layoutBehavior?.type?.() ?? layout?.constructor?.name ?? null,
      positionSource,
      delegateType: delegate?.constructor?.name ?? null,
      mode: this.mode?.() === '3d' ? '3d' : '2d',
      layoutState,
      layoutEnabled: scheduler?.layoutEnabled !== false,
      running: layoutState === 'running',
      nodeCount: Number.isFinite(this.network?.nodeCount) ? Number(this.network.nodeCount) : null,
      alpha: Number.isFinite(alpha) ? alpha : null,
      center,
      positions: null,
    };
    if (snapshot instanceof Float32Array && snapshot.length > 0) {
      if (snapshot.byteLength <= maxPositionBytes) {
        state.positions = {
          encoding: 'float32-base64',
          length: snapshot.length,
          byteLength: snapshot.byteLength,
          data: encodeFloat32ArrayBase64(snapshot),
        };
      } else {
        state.positionsSkipped = {
          reason: 'size-limit',
          byteLength: snapshot.byteLength,
          maxBytes: maxPositionBytes,
        };
      }
    }
    return state;
  }

  /**
   * Capture scheduler, layout, and optional node-position runtime state for persistence.
   *
   * @public
   * @apiSection State And Persistence
   * @param {object} [options] - Snapshot controls.
   * @param {boolean} [options.includePositions=true] - Include packed node positions when they fit within `maxPositionBytes`.
   * @param {number} [options.maxPositionBytes] - Maximum encoded position payload size.
   * @returns {object} Serializable layout runtime snapshot.
   */
  snapshotLayoutRuntimeState(options = {}) {
    const snapshot = options.includePositions === false ? null : this._snapshotNodePositions();
    return this._buildLayoutRuntimeState(snapshot, options);
  }

  /**
   * Capture layout runtime state, preferring async delegate readback when active.
   *
   * @public
   * @apiSection State And Persistence
   * @param {object} [options] - Snapshot controls and optional delegate override.
   * @param {boolean} [options.preferDelegate] - Read positions from the active delegate even when network positions are available.
   * @param {Float32Array} [options.positions] - Pre-captured packed `x,y,z` positions to encode.
   * @returns {Promise<object>} Serializable layout runtime snapshot.
   */
  async snapshotLayoutRuntimeStateAsync(options = {}) {
    if (options.includePositions === false) return this._buildLayoutRuntimeState(null, options);
    let snapshot = null;
    let positionSource = 'network';
    let snapshotDelegate = null;
    if (options.positions instanceof Float32Array) {
      snapshot = new Float32Array(options.positions);
      positionSource = options.positionSource === 'delegate' ? 'delegate' : 'network';
      snapshotDelegate = options.delegate ?? null;
    } else {
      const source = this._positionsConfig ?? { source: 'network', delegate: null };
      const layout = this._layout ?? null;
      const delegate = options.delegate
        ?? source.delegate
        ?? this._activePositionDelegate
        ?? layout?.getPositionDelegate?.()
        ?? layout?.positionDelegate
        ?? null;
      const shouldUseDelegate = delegate && (
        source.source === 'delegate'
        || options.preferDelegate === true
        || this.mode?.() === '3d'
      );
      if (shouldUseDelegate) {
        try {
          snapshot = await this.snapshotDelegatePositions({
            ...options,
            delegate,
            scope: options.scope ?? 'layout-runtime',
            reason: options.reason ?? 'layout-runtime-snapshot',
          });
          if (snapshot instanceof Float32Array && snapshot.length > 0) {
            positionSource = 'delegate';
            snapshotDelegate = delegate;
          }
        } catch (error) {
          console.warn('Helios: failed to snapshot delegate positions for persistence; falling back to network positions.', error);
        }
      }
      if (!(snapshot instanceof Float32Array) || snapshot.length <= 0) {
        snapshot = this._snapshotNodePositions();
        positionSource = 'network';
        snapshotDelegate = null;
      }
    }
    return this._buildLayoutRuntimeState(snapshot, {
      ...options,
      positionSource,
      delegate: snapshotDelegate,
    });
  }

  /**
   * Restore scheduler, layout, and encoded position state from a previous snapshot.
   *
   * @public
   * @apiSection State And Persistence
   * @param {object} [state={}] - Snapshot returned by `snapshotLayoutRuntimeState*`.
   * @param {object} [options] - Restore controls.
   * @param {string} [options.reason] - Diagnostic reason passed to position delegates.
   * @returns {boolean} `true` when any runtime state or positions were restored.
   */
  restoreLayoutRuntimeState(state = {}, options = {}) {
    if (!state || typeof state !== 'object') return false;
    const layout = this._layout ?? null;
    const scheduler = this.scheduler ?? null;
    let restoredPositions = false;
    const encoded = state.positions && typeof state.positions === 'object' ? state.positions : null;
    if (encoded?.encoding === 'float32-base64' && typeof encoded.data === 'string') {
      const snapshot = decodeFloat32ArrayBase64(encoded.data, encoded.length);
      const current = this._snapshotNodePositions();
      if (
        snapshot instanceof Float32Array
        && current instanceof Float32Array
        && snapshot.length === current.length
      ) {
        const currentMode = this.mode?.() === '3d' ? '3d' : '2d';
        if (currentMode === '3d') {
          applyPlanarDepthJitter(snapshot, computeGpuForceModeSwitchDepthJitter(layout));
        }
        const delegate = this._positionsConfig?.source === 'delegate'
          ? (this._positionsConfig?.delegate ?? layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null)
          : (layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null);
        if (delegate && typeof delegate.writePositionSnapshot === 'function') {
          const beforeDelegateVersion = Number(delegate.version);
          restoredPositions = delegate.writePositionSnapshot(snapshot, {
            ...this._buildPositionDelegateContext({
              scope: 'layout-runtime-restore',
              reason: options.reason ?? 'layout-runtime-restore',
            }),
            center: Array.isArray(state.center) ? state.center : undefined,
            outputScale: layout?.options?.outputScale ?? delegate?.options?.outputScale,
          }) === true;
          if (
            restoredPositions
            && typeof delegate.bumpVersion === 'function'
            && Number(delegate.version) === beforeDelegateVersion
          ) {
            delegate.bumpVersion();
          }
        }
        const wroteLayout = layout?.seedFromPositionSnapshot?.(snapshot, {
          emitUpdate: false,
          requestUpdate: false,
        }) === true;
        const wroteNetwork = this._writeNodePositions(snapshot);
        restoredPositions = restoredPositions || wroteLayout || wroteNetwork;
        if (restoredPositions) {
          const runtime = this._resetInterpolationRuntime({ keepLastRendered: false, keepIntervalHistory: true });
          runtime.lastRenderedPositions = new Float32Array(snapshot);
          this._interpolationRuntime = runtime;
          this.visuals?.markPositionsDirty?.();
          this.visuals?.bumpNodeAttributes?.(NODE_POSITION_ATTRIBUTE);
          this._applyPositionPipelineToRenderer();
          this._markRestoredPositionsForCamera();
          this.scheduler?.requestGeometry?.();
          this.scheduler?.requestRender?.();
          this._labels?.requestFullReselect?.(options.reason ?? 'layout-runtime-restore');
        }
      }
    }

    const alpha = Number(state.alpha);
    if (Number.isFinite(alpha)) {
      const center = Array.isArray(state.center) ? state.center : undefined;
      if (typeof layout?.adoptHandoffState === 'function') {
        layout.adoptHandoffState({ alpha, center });
      }
      const delegate = layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null;
      delegate?.updateOptions?.({ alpha });
    }

    if (scheduler && options.restoreRunState !== false) {
      if (state.layoutState === 'running' || state.running === true) {
        scheduler.setLayoutEnabled?.(true, options.reason ?? 'layout-runtime-restore');
        scheduler.requestLayout?.(options.reason ?? 'layout-runtime-restore');
      } else if (state.layoutState === 'idle') {
        scheduler.setLayoutEnabled?.(false, 'idle');
      } else {
        scheduler.setLayoutEnabled?.(false, options.reason ?? 'layout-runtime-restore');
      }
    }
    return restoredPositions;
  }

  _adoptNetworkPositionsAsLayoutBaseline(options = {}) {
    const snapshot = this._snapshotNodePositions();
    if (!(snapshot instanceof Float32Array) || snapshot.length <= 0) return false;
    const layout = this._layout ?? null;
    const runtimeState = options.layoutRuntimeState && typeof options.layoutRuntimeState === 'object'
      ? options.layoutRuntimeState
      : {};
    let adopted = false;
    const delegate = layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null;
    if (delegate && typeof delegate.writePositionSnapshot === 'function') {
      adopted = delegate.writePositionSnapshot(snapshot, {
        ...this._buildPositionDelegateContext({
          scope: 'session-restore',
          reason: options.reason ?? 'session-network-restore',
        }),
        center: Array.isArray(runtimeState.center) ? runtimeState.center : undefined,
        outputScale: layout?.options?.outputScale ?? delegate?.options?.outputScale,
      }) === true || adopted;
    }
    adopted = layout?.seedFromPositionSnapshot?.(snapshot, {
      emitUpdate: false,
      requestUpdate: false,
    }) === true || adopted;
    if (!adopted) return false;
    const runtime = this._resetInterpolationRuntime({ keepLastRendered: false, keepIntervalHistory: true });
    runtime.lastRenderedPositions = new Float32Array(snapshot);
    this._interpolationRuntime = runtime;
    this._applyPositionPipelineToRenderer();
    this._markRestoredPositionsForCamera();
    this.scheduler?.requestGeometry?.();
    this.scheduler?.requestRender?.();
    this._labels?.requestFullReselect?.(options.reason ?? 'session-network-restore');
    return true;
  }

  _writeNodePositions(values) {
    if (!values || !Number.isFinite(values.length) || values.length <= 0) return false;
    let wrote = false;
    this._withPositionBufferAccess(() => {
      const view = this._readNodePositionViewUnsafe();
      if (!view || !Number.isFinite(view.length) || view.length <= 0) return;
      const count = Math.min(view.length, values.length);
      if (count <= 0) return;
      view.set(values.subarray(0, count), 0);
      wrote = true;
    });
    return wrote;
  }

  _recordLayoutIntervalSample(intervalMs, now = performance.now()) {
    const runtime = this._interpolationRuntime ?? {};
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const dt = Number(intervalMs);
    if (!Number.isFinite(dt) || dt <= 0) return;
    const maxSamples = normalizePositiveInteger(
      config.adaptiveDurationSamples,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationSamples,
      1,
      120,
    );
    const windowMs = normalizeNonNegativeNumber(
      config.adaptiveDurationWindowMs,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationWindowMs,
      100,
      60000,
    );
    const samples = Array.isArray(runtime.layoutIntervalsMs) ? runtime.layoutIntervalsMs : [];
    samples.push({ dt, ts: now });
    const cutoff = now - windowMs;
    const recent = samples.filter((entry) => entry && Number.isFinite(entry.ts) && entry.ts >= cutoff);
    if (recent.length > maxSamples) {
      recent.splice(0, recent.length - maxSamples);
    }
    runtime.layoutIntervalsMs = recent;
    this._interpolationRuntime = runtime;
  }

  _resolveInterpolationDurationMs(now = performance.now()) {
    const runtime = this._interpolationRuntime ?? {};
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const durationMode = resolveInterpolationDurationMode(config);
    const fixedDuration = normalizeNonNegativeNumber(
      config.durationMs,
      POSITION_INTERPOLATION_DEFAULTS.durationMs,
      0,
      60000,
    );
    if (durationMode !== 'adaptive') {
      return fixedDuration;
    }
    const samples = Array.isArray(runtime.layoutIntervalsMs) ? runtime.layoutIntervalsMs : [];
    if (samples.length === 0) {
      return fixedDuration;
    }
    const maxSamples = normalizePositiveInteger(
      config.adaptiveDurationSamples,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationSamples,
      1,
      120,
    );
    const windowMs = normalizeNonNegativeNumber(
      config.adaptiveDurationWindowMs,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationWindowMs,
      100,
      60000,
    );
    const cutoff = now - windowMs;
    const recent = samples.filter((entry) => entry && Number.isFinite(entry.ts) && entry.ts >= cutoff);
    if (recent.length === 0) {
      return fixedDuration;
    }
    const windowed = recent.length > maxSamples ? recent.slice(recent.length - maxSamples) : recent;
    const sum = windowed.reduce((acc, entry) => acc + entry.dt, 0);
    const average = sum / windowed.length;
    const scale = normalizeNonNegativeNumber(
      config.adaptiveDurationScale,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationScale,
      0,
      16,
    );
    const minDuration = normalizeNonNegativeNumber(
      config.adaptiveDurationMinMs,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationMinMs,
      0,
      60000,
    );
    const maxDuration = normalizeNonNegativeNumber(
      config.adaptiveDurationMaxMs,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationMaxMs,
      minDuration,
      60000,
    );
    const adaptive = average * scale;
    if (!Number.isFinite(adaptive)) return fixedDuration;
    return Math.max(minDuration, Math.min(maxDuration, adaptive));
  }

  _computeInterpolationFactor(now = performance.now()) {
    const runtime = this._interpolationRuntime ?? null;
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    if (!runtime) return 1;
    const durationMs = Number.isFinite(runtime.effectiveDurationMs)
      ? Math.max(0, Number(runtime.effectiveDurationMs))
      : this._resolveInterpolationDurationMs(now);
    runtime.effectiveDurationMs = durationMs;
    if (durationMs <= 0) return 1;
    const startedAt = Number.isFinite(runtime.startedAt) ? runtime.startedAt : now;
    const elapsed = Math.max(0, now - startedAt);
    const linear = clamp01(elapsed / durationMs, 1);
    return applyInterpolationEasing(config.easing, linear);
  }

  _resolveInterpolationSourceSnapshot(now, targetPositions) {
    if (!targetPositions || !targetPositions.length) return null;
    const runtime = this._interpolationRuntime ?? null;
    if (!runtime) return new Float32Array(targetPositions);
    const count = targetPositions.length;
    const source = runtime.sourcePositions;
    const target = runtime.targetPositions;
    if (
      runtime.active === true
      && source && target
      && source.length === count
      && target.length === count
    ) {
      const factor = this._computeInterpolationFactor(now);
      const mixed = new Float32Array(count);
      mixPositionsArray(source, target, mixed, factor);
      return mixed;
    }
    if (runtime.lastRenderedPositions && runtime.lastRenderedPositions.length === count) {
      return new Float32Array(runtime.lastRenderedPositions);
    }
    return new Float32Array(targetPositions);
  }

  _prepareInterpolationRuntimeForTarget(targetPositions, now, layoutElapsedMs) {
    const runtime = this._interpolationRuntime ?? {};
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const sourcePositions = this._resolveInterpolationSourceSnapshot(now, targetPositions);
    const sourceCount = Math.floor((targetPositions?.length ?? 0) / 3);
    const displacementRatio = computePositionDisplacementRatio(sourcePositions, targetPositions);
    const minDisplacement = Number.isFinite(config.minDisplacementRatio)
      ? Math.max(0, Number(config.minDisplacementRatio))
      : POSITION_INTERPOLATION_DEFAULTS.minDisplacementRatio;
    const durationMs = this._resolveInterpolationDurationMs(now);
    const shouldInterpolate = Boolean(
      config.enabled === true
      && sourcePositions
      && targetPositions
      && sourcePositions.length === targetPositions.length
      && durationMs > 0
      && displacementRatio >= minDisplacement
      && !arePositionArraysEqual(sourcePositions, targetPositions),
    );

    runtime.active = shouldInterpolate;
    runtime.startedAt = now;
    runtime.lastFrameAt = now;
    runtime.lastTargetUpdateAt = now;
    runtime.layoutElapsedMs = Number.isFinite(layoutElapsedMs) ? Math.max(1, layoutElapsedMs) : 16;
    runtime.sourcePositions = sourcePositions;
    runtime.targetPositions = targetPositions;
    runtime.mixedPositions = runtime.mixedPositions && runtime.mixedPositions.length === targetPositions.length
      ? runtime.mixedPositions
      : new Float32Array(targetPositions.length);
    runtime.sourceVersion = ((runtime.sourceVersion ?? 0) + 1) % Number.MAX_SAFE_INTEGER;
    runtime.targetVersion = ((runtime.targetVersion ?? 0) + 1) % Number.MAX_SAFE_INTEGER;
    runtime.sourceCount = sourceCount;
    runtime.factor = shouldInterpolate ? 0 : 1;
    runtime.sourceWebGPUBuffer = null;
    runtime.sourceWebGLTexture = null;
    runtime.sourceTextureMeta = null;
    runtime.delegateVersion = null;
    runtime.effectiveDurationMs = durationMs;
    runtime.lastRenderedPositions = sourcePositions
      ? new Float32Array(shouldInterpolate ? sourcePositions : targetPositions)
      : null;
    this._interpolationRuntime = runtime;

    return { shouldInterpolate, mode: 'gpu', displacementRatio, durationMs };
  }

  _stepGpuInterpolation(now) {
    const runtime = this._interpolationRuntime ?? null;
    if (!runtime?.sourcePositions || !runtime?.targetPositions) return false;
    const factor = this._computeInterpolationFactor(now);
    runtime.factor = factor;
    runtime.lastFrameAt = now;
    if (
      runtime.lastRenderedPositions
      && runtime.lastRenderedPositions.length === runtime.targetPositions.length
    ) {
      mixPositionsArray(
        runtime.sourcePositions,
        runtime.targetPositions,
        runtime.lastRenderedPositions,
        factor,
      );
    } else {
      runtime.lastRenderedPositions = new Float32Array(runtime.targetPositions);
      mixPositionsArray(
        runtime.sourcePositions,
        runtime.targetPositions,
        runtime.lastRenderedPositions,
        factor,
      );
    }
    return factor < 1;
  }

  _runInterpolationRenderPump(timestamp = performance.now()) {
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const runtime = this._interpolationRuntime ?? null;
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const cameraKeepRunning = this._stepCameraControlRenderPump(now);
    if (!runtime || config.enabled !== true || runtime.active !== true) {
      this._applyPositionPipelineToRenderer();
      return cameraKeepRunning;
    }
    const mode = normalizeInterpolationMode(config.mode);
    const keepRunning = this._stepGpuInterpolation(now);
    runtime.active = keepRunning;
    if (!keepRunning) {
      runtime.factor = 1;
      if (runtime.targetPositions) {
        runtime.lastRenderedPositions = new Float32Array(runtime.targetPositions);
      }
      runtime.sourcePositions = null;
      runtime.targetPositions = null;
      runtime.mixedPositions = null;
      runtime.sourceCount = 0;
      runtime.sourceWebGPUBuffer = null;
      runtime.sourceWebGLTexture = null;
      runtime.sourceTextureMeta = null;
    }
    this._applyPositionPipelineToRenderer();
    return keepRunning || cameraKeepRunning;
  }

  _handleLayoutUpdate(payload = {}) {
    const pendingHandoff = this._pendingLayoutHandoff ?? null;
    if (pendingHandoff && pendingHandoff.nextLayout === this._layout) {
      return;
    }
    this._recordStartupLayoutUpdate();
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: true });
    const now = Number.isFinite(payload?.timestamp) ? Number(payload.timestamp) : performance.now();
    const previousTargetAt = Number.isFinite(this._interpolationRuntime?.lastTargetUpdateAt)
      ? this._interpolationRuntime.lastTargetUpdateAt
      : now;
    const layoutElapsedMs = Number.isFinite(payload?.layoutElapsedMs)
      ? Math.max(1, Number(payload.layoutElapsedMs))
      : Math.max(1, now - previousTargetAt);
    this._recordLayoutIntervalSample(layoutElapsedMs, now);
    this._markAutoFitDirty(false);
    const delegateSourceActive = this._positionsConfig?.source === 'delegate'
      && Boolean(this._positionsConfig?.delegate);
    const targetPositions = delegateSourceActive ? null : this._snapshotNodePositions();
    const handoffAdopted = payload?.handoffAdopted === true;
    if (targetPositions && handoffAdopted) {
      const runtime = this._interpolationRuntime ?? {};
      runtime.active = false;
      runtime.factor = 1;
      runtime.lastTargetUpdateAt = now;
      runtime.layoutElapsedMs = layoutElapsedMs;
      runtime.effectiveDurationMs = this._resolveInterpolationDurationMs(now);
      runtime.lastRenderedPositions = new Float32Array(targetPositions);
      runtime.sourcePositions = null;
      runtime.targetPositions = null;
      runtime.mixedPositions = null;
      runtime.sourceCount = Math.floor(targetPositions.length / 3);
      runtime.sourceVersion = ((runtime.sourceVersion ?? 0) + 1) % Number.MAX_SAFE_INTEGER;
      runtime.sourceWebGPUBuffer = null;
      runtime.sourceWebGLTexture = null;
      runtime.sourceTextureMeta = null;
      this._interpolationRuntime = runtime;
      this._applyPositionPipelineToRenderer();
      this.visuals.markPositionsDirty();
      this.storage?.markPositionsDirty?.('layout-update');
      this.scheduler.requestGeometry();
      this._labels?.requestFullReselect?.('layout-update');
      this.debug.log('layout', 'Layout update adopted handoff baseline without interpolation');
      return;
    }
    if (targetPositions && this._interpolationConfig?.enabled === true) {
      const { shouldInterpolate, mode, displacementRatio, durationMs } = this._prepareInterpolationRuntimeForTarget(
        targetPositions,
        now,
        layoutElapsedMs,
      );
      if (shouldInterpolate) {
        this.scheduler.requestRender();
      }
      this.debug.log('layout', 'Layout update prepared interpolation', {
        mode,
        enabled: shouldInterpolate,
        displacementRatio,
        durationMs,
        durationMode: resolveInterpolationDurationMode(this._interpolationConfig),
        adaptiveDuration: this._interpolationConfig?.adaptiveDuration === true,
      });
    } else if (targetPositions || delegateSourceActive) {
      const runtime = this._interpolationRuntime ?? {};
      runtime.active = false;
      runtime.factor = 1;
      runtime.lastTargetUpdateAt = now;
      runtime.layoutElapsedMs = layoutElapsedMs;
      runtime.effectiveDurationMs = this._resolveInterpolationDurationMs(now);
      runtime.lastRenderedPositions = targetPositions ? new Float32Array(targetPositions) : null;
      runtime.sourcePositions = null;
      runtime.targetPositions = null;
      runtime.mixedPositions = null;
      if (delegateSourceActive) {
        runtime.sourceVersion = ((runtime.sourceVersion ?? 0) + 1) % Number.MAX_SAFE_INTEGER;
      }
      runtime.sourceCount = targetPositions
        ? Math.floor(targetPositions.length / 3)
        : Math.max(0, Math.floor(Number(this._getRenderNetwork()?.nodeCount ?? 0)));
      runtime.sourceWebGPUBuffer = null;
      runtime.sourceWebGLTexture = null;
      runtime.sourceTextureMeta = null;
      this._interpolationRuntime = runtime;
    }
    this._applyPositionPipelineToRenderer();
    if (!delegateSourceActive) {
      this.visuals.markPositionsDirty();
    }
    this.storage?.markPositionsDirty?.('layout-update');
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('layout-update');
    this.debug.log('layout', 'Layout requested geometry update');
  }

  _applyPendingRendererProps() {
    const renderer = this.renderer;
    const graphLayer = renderer?.graphLayer;
    if (renderer && this._pendingRendererProps.size) {
      for (const [key, value] of this._pendingRendererProps.entries()) {
        renderer[key] = value;
      }
      this._pendingRendererProps.clear();
    }
    if (graphLayer && this._pendingGraphLayerProps.size) {
      for (const [key, value] of this._pendingGraphLayerProps.entries()) {
        graphLayer[key] = value;
      }
      this._pendingGraphLayerProps.clear();
    }
  }

  _invokePositionDelegateHook(delegate, hookNames) {
    if (!delegate || !hookNames?.length) return;
    const context = this._buildPositionDelegateContext();
    for (const hookName of hookNames) {
      if (typeof delegate?.[hookName] !== 'function') continue;
      try {
        delegate[hookName](context);
      } catch (error) {
        warnOnce(
          this,
          `position-delegate-hook:${hookName}`,
          `Helios: position delegate hook "${hookName}" failed.`,
          { error },
        );
        this.debug.log('layout', `Position delegate ${hookName} failed`, { error });
      }
      return;
    }
  }

  _buildPositionDelegateContext(extra = {}) {
    const renderer = this.renderer ?? null;
    const rendererDevice = renderer?.device ?? null;
    const scope = extra?.scope ?? null;
    const activeLayoutDelegate = this._layout && typeof this._layout.getPositionDelegate === 'function'
      ? (this._layout.getPositionDelegate() ?? null)
      : null;
    const usesLayoutDelegate = activeLayoutDelegate
      && activeLayoutDelegate === (this._positionsConfig?.delegate ?? null);
    const defaultNetwork = scope === 'layout' || usesLayoutDelegate
      ? this._getLayoutNetwork()
      : this._getRenderNetwork();
    return {
      helios: this,
      network: extra.network ?? defaultNetwork,
      visuals: this.visuals,
      renderer,
      scheduler: this.scheduler ?? null,
      backend: rendererDevice?.type ?? null,
      device: rendererDevice?.device ?? null,
      gl: rendererDevice?.gl ?? null,
      ...extra,
    };
  }

  _validatePositionDelegate(delegate) {
    if (!delegate) return null;
    if (!(delegate instanceof PositionDelegate)) {
      throw new TypeError(
        'positions({ source: "delegate" }) expects delegate to be an instance of PositionDelegate',
      );
    }
    const hasProvider = (
      typeof delegate.getNodePositionView === 'function'
      || typeof delegate.getPositionView === 'function'
      || typeof delegate.getWebGPUPositionBuffer === 'function'
      || typeof delegate.getWebGLPositionTexture === 'function'
      || typeof delegate.getGpuPositionResource === 'function'
      || typeof delegate.getPositionResource === 'function'
    );
    if (!hasProvider) {
      throw new Error(
        'PositionDelegate must expose at least one position provider (CPU view, WebGL texture, or WebGPU buffer)',
      );
    }
    return delegate;
  }

  _resolveLayoutPositionPolicy(layout = this._layout) {
    if (!layout || typeof layout !== 'object') {
      return { source: 'network', delegate: null };
    }
    if (typeof layout.getPositionDelegate !== 'function') {
      return { source: 'network', delegate: null };
    }
    const delegate = layout.getPositionDelegate() ?? null;
    if (!delegate) {
      return { source: 'network', delegate: null };
    }
    return {
      source: 'delegate',
      delegate: this._validatePositionDelegate(delegate),
    };
  }

  _enforcePositionSourcePolicy(layout = this._layout, options = {}) {
    const current = this._positionsConfig ?? { source: 'network', delegate: null };
    const policy = this._resolveLayoutPositionPolicy(layout);
    const prevActiveDelegate = current.source === 'delegate' ? (current.delegate ?? null) : null;
    const nextActiveDelegate = policy.source === 'delegate' ? (policy.delegate ?? null) : null;
    const changed = current.source !== policy.source || current.delegate !== policy.delegate;
    if (!changed) {
      this._applyPositionPipelineToRenderer();
      return false;
    }
    if (prevActiveDelegate && prevActiveDelegate !== nextActiveDelegate) {
      this._detachPositionDelegate(prevActiveDelegate);
    }
    this._positionsConfig = {
      source: policy.source,
      delegate: policy.delegate ?? null,
    };
    this._resetCameraDelegateSnapshot();
    if (nextActiveDelegate && nextActiveDelegate !== prevActiveDelegate) {
      this._attachPositionDelegate(nextActiveDelegate);
    }
    if (options.resetInterpolation !== false) {
      this._resetInterpolationRuntime({ keepLastRendered: false });
    } else {
      this._applyPositionPipelineToRenderer();
    }
    if (options.requestGeometry !== false) {
      this.scheduler?.requestGeometry?.();
    }
    if (options.requestRender !== false) {
      this.scheduler?.requestRender?.();
    }
    if (options.requestLabels !== false) {
      this._labels?.requestFullReselect?.('positions-policy');
    }
    return true;
  }

  _attachPositionDelegate(delegate) {
    const next = delegate ?? null;
    if (!next || this._activePositionDelegate === next) return;
    this._activePositionDelegate = next;
    this._invokePositionDelegateHook(next, ['onAttach', 'attach']);
  }

  _detachPositionDelegate(delegate) {
    const active = delegate ?? this._activePositionDelegate ?? null;
    if (!active) return;
    this._invokePositionDelegateHook(active, ['onDetach', 'detach']);
    if (this._activePositionDelegate === active) {
      this._activePositionDelegate = null;
    }
  }

  _resolveLayoutHandoffContext() {
    const pending = this._pendingLayoutHandoff ?? null;
    const currentPositions = this._positionsConfig ?? { source: 'network', delegate: null };
    const outgoingDelegate = currentPositions.source === 'delegate'
      ? (currentPositions.delegate ?? null)
      : null;
    const retainedLayout = pending?.retainedDelegate && pending.retainedDelegate === outgoingDelegate
      ? (pending.retainedLayout ?? null)
      : null;
    return {
      pending,
      outgoingDelegate,
      outgoingLayout: retainedLayout ?? this._layout ?? null,
      staleLayout: retainedLayout && retainedLayout !== this._layout
        ? this._layout ?? null
        : null,
    };
  }

  _disposePendingLayoutHandoff(options = {}) {
    const pending = this._pendingLayoutHandoff ?? null;
    this._pendingLayoutHandoff = null;
    if (pending?.retainedLayout && options.disposeRetained !== false) {
      pending.retainedLayout.dispose?.();
    }
    if (pending?.staleLayout && pending.staleLayout !== pending.retainedLayout) {
      pending.staleLayout.dispose?.();
    }
    return pending;
  }

  _startLayoutPositionHandoff({ previousLayout = null, previousDelegate = null, nextLayout = null } = {}) {
    if (!previousDelegate || !nextLayout || typeof this.snapshotDelegatePositions !== 'function') {
      return false;
    }

    this._disposePendingLayoutHandoff();
    const token = ((this._layoutHandoffToken ?? 0) + 1) >>> 0;
    this._layoutHandoffToken = token;
    nextLayout.beginPositionHandoff?.();
    nextLayout.adoptHandoffState?.({
      alpha: this._readLayoutAlpha(previousLayout),
    });
    this._pendingLayoutHandoff = {
      token,
      retainedLayout: previousLayout,
      retainedDelegate: previousDelegate,
      staleLayout: null,
      nextLayout,
    };

    Promise.resolve()
      .then(() => this.snapshotDelegatePositions({
        delegate: previousDelegate,
        network: previousLayout?.network ?? previousDelegate?._context?.network ?? this._getLayoutNetwork(),
        scope: 'layout',
      }))
      .catch((error) => {
        console.warn('Helios.layout(): failed to snapshot delegate positions during layout handoff.', error);
        return null;
      })
      .then((snapshot) => {
        this._finishLayoutPositionHandoff(token, snapshot);
      })
      .catch((error) => {
        warnOnce(this, 'layout-position-handoff-finish', 'Helios.layout(): failed to finish delegate position handoff.', { error });
      });

    return true;
  }

  _readLayoutAlpha(layout = null) {
    const direct = Number(layout?.alpha);
    if (Number.isFinite(direct)) return direct;
    const settings = Number(layout?.settings?.alpha);
    if (Number.isFinite(settings)) return settings;
    const delegate = layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null;
    const delegateAlpha = Number(delegate?.alpha);
    if (Number.isFinite(delegateAlpha)) return delegateAlpha;
    const options = Number(layout?.options?.alpha);
    if (Number.isFinite(options)) return options;
    return NaN;
  }

  _computePositionSnapshotCenter(snapshot = null, network = null) {
    if (!(snapshot instanceof Float32Array) || snapshot.length < 3) return null;
    const readNodeIndices = () => network?.nodeIndices instanceof Uint32Array ? network.nodeIndices : null;
    let nodeIndices = null;
    if (typeof network?.withBufferAccess === 'function') {
      network.withBufferAccess(() => {
        nodeIndices = readNodeIndices();
      });
    } else {
      nodeIndices = readNodeIndices();
    }

    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let count = 0;
    const visitNode = (nodeId) => {
      const base = (nodeId >>> 0) * 3;
      if ((base + 2) >= snapshot.length) return;
      const x = Number(snapshot[base]);
      const y = Number(snapshot[base + 1]);
      const z = Number(snapshot[base + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
      sumX += x;
      sumY += y;
      sumZ += z;
      count += 1;
    };

    if (nodeIndices?.length) {
      for (let i = 0; i < nodeIndices.length; i += 1) {
        visitNode(nodeIndices[i]);
      }
    } else {
      const nodeCount = Math.floor(snapshot.length / 3);
      for (let nodeId = 0; nodeId < nodeCount; nodeId += 1) {
        visitNode(nodeId);
      }
    }

    if (count <= 0) return null;
    return [sumX / count, sumY / count, sumZ / count];
  }

  _finishLayoutPositionHandoff(token, snapshot = null) {
    const pending = this._pendingLayoutHandoff ?? null;
    if (!pending || pending.token !== token) return false;
    this._pendingLayoutHandoff = null;

    const nextLayout = pending.nextLayout ?? null;
    if (nextLayout && this._layout === nextLayout) {
      const snapshotCenter = this._computePositionSnapshotCenter(snapshot, nextLayout?.network ?? null);
      if (snapshotCenter) {
        nextLayout.adoptHandoffState?.({ center: snapshotCenter });
      }
      nextLayout.completePositionHandoff?.(snapshot, { emitUpdate: false });
      this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
      const runtime = this._resetInterpolationRuntime({ keepLastRendered: false, keepIntervalHistory: true });
      if (snapshot instanceof Float32Array && snapshot.length > 0) {
        runtime.lastRenderedPositions = new Float32Array(snapshot);
      }
      this._interpolationRuntime = runtime;
      this._applyPositionPipelineToRenderer();
      this.scheduler?.requestLayout?.('layout-handoff');
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
      this._labels?.requestFullReselect?.('layout-handoff');
    }

    pending.retainedLayout?.dispose?.();
    if (pending.staleLayout && pending.staleLayout !== pending.retainedLayout) {
      pending.staleLayout.dispose?.();
    }
    return true;
  }

  _resetInterpolationRuntime({ keepLastRendered = false, keepIntervalHistory = true } = {}) {
    const runtime = this._interpolationRuntime ?? {};
    const previousIntervals = Array.isArray(runtime.layoutIntervalsMs) ? runtime.layoutIntervalsMs : [];
    runtime.active = false;
    runtime.startedAt = 0;
    runtime.lastFrameAt = 0;
    runtime.lastTargetUpdateAt = 0;
    runtime.layoutElapsedMs = 16;
    runtime.sourcePositions = null;
    runtime.targetPositions = null;
    runtime.mixedPositions = null;
    runtime.sourceVersion = 0;
    runtime.targetVersion = 0;
    runtime.sourceCount = 0;
    runtime.factor = 1;
    runtime.delegateVersion = null;
    runtime.sourceWebGPUBuffer = null;
    runtime.sourceWebGLTexture = null;
    runtime.sourceTextureMeta = null;
    runtime.effectiveDurationMs = this._resolveInterpolationDurationMs(performance.now());
    runtime.layoutIntervalsMs = keepIntervalHistory ? previousIntervals : [];
    if (!keepLastRendered) {
      runtime.lastRenderedPositions = null;
    }
    this._interpolationRuntime = runtime;
    this._applyPositionPipelineToRenderer();
    return runtime;
  }

  _applyPositionPipelineToRenderer() {
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (!graphLayer) return false;
    const activeDelegate = this._positionsConfig?.source === 'delegate'
      ? (this._positionsConfig?.delegate ?? null)
      : null;
    if (typeof graphLayer.setPositionDelegate === 'function') {
      graphLayer.setPositionDelegate(activeDelegate);
    } else {
      graphLayer.positionDelegate = activeDelegate;
    }

    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const runtime = this._interpolationRuntime ?? {};
    const useGpuInterpolation = config.enabled === true
      && normalizeInterpolationMode(config.mode) === 'gpu'
      && runtime.active === true;
    const interpolationState = {
      enabled: useGpuInterpolation,
      factor: useGpuInterpolation ? clamp01(runtime.factor, 1) : 1,
      sourceVersion: Number.isFinite(runtime.sourceVersion) ? runtime.sourceVersion : 0,
      sourceCount: Number.isFinite(runtime.sourceCount) ? runtime.sourceCount : 0,
      sourceView: useGpuInterpolation ? (runtime.sourcePositions ?? null) : null,
      sourceWebGPUBuffer: useGpuInterpolation ? (runtime.sourceWebGPUBuffer ?? null) : null,
      sourceWebGLTexture: useGpuInterpolation ? (runtime.sourceWebGLTexture ?? null) : null,
      sourceTextureMeta: useGpuInterpolation ? (runtime.sourceTextureMeta ?? null) : null,
    };
    if (typeof graphLayer.setPositionInterpolationState === 'function') {
      graphLayer.setPositionInterpolationState(interpolationState);
    } else {
      graphLayer.positionInterpolation = interpolationState;
    }
    return true;
  }

  _refreshUIBindings() {
    const bindings = this.constructor.UI_BINDINGS ?? null;
    if (!bindings) return;
    for (const name of Object.keys(bindings)) {
      if (typeof this[name] !== 'function') continue;
      const value = this[name]();
      this._emitUIBindingChange(name, value, { source: 'refresh', trackOverride: false });
    }
  }

  _attachDensityLayer() {
    const renderer = this.renderer ?? null;
    if (!renderer || typeof renderer.addLayer !== 'function') return false;
    const existing = this._densityLayer ?? null;
    if (existing && existing.device === renderer.device) {
      this._applyDensityConfigToLayer();
      return true;
    }
    if (existing) {
      try {
        renderer.removeLayer(existing);
      } catch (error) {
        warnOnce(
          this,
          'density-layer-remove',
          'Helios: failed to remove the previous density layer before attaching a new one.',
          { error },
        );
      }
      this._densityLayer = null;
    }
    const densityLayer = new DensityLayer({
      initialConfig: this._densityConfig,
      getGraphLayer: () => this.renderer?.graphLayer ?? null,
      withBufferAccess: (fn) => this._withPositionBufferAccess(fn),
      getNodePositionView: (network) => {
        if (!network) return null;
        try {
          return network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
        } catch (error) {
          warnOnce(
            this,
            'density-node-position-view',
            'Helios density layer: failed to read node position view.',
            { error },
          );
          return null;
        }
      },
      getNodePositionInfo: (network) => {
        if (!network) return { view: null, version: null, count: 0 };
        try {
          const buffer = network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE) ?? null;
          const view = buffer?.view ?? null;
          const count = view && Number.isFinite(view.length) ? Math.floor(view.length / 3) : 0;
          const version = Number.isFinite(buffer?.version) ? Number(buffer.version) : null;
          return { view, version, count };
        } catch (error) {
          warnOnce(
            this,
            'density-node-position-info',
            'Helios density layer: failed to read node position metadata.',
            { error },
          );
          return { view: null, version: null, count: 0 };
        }
      },
      onRuntimeState: (state) => {
        if (!state || typeof state !== 'object') return;
        const previousDiverging = this._densityRuntime?.diverging === true;
        const previousDomain = Array.isArray(this._densityRuntime?.valueDomain)
          ? this._densityRuntime.valueDomain
          : null;
        this._densityRuntime = { ...this._densityRuntime, ...state };
        const nextDomain = Array.isArray(this._densityRuntime?.valueDomain)
          ? this._densityRuntime.valueDomain
          : null;
        const domainChanged = previousDomain?.length !== nextDomain?.length
          || (previousDomain ?? []).some((value, index) => value !== nextDomain?.[index]);
        if ((this._densityRuntime?.diverging === true) !== previousDiverging || domainChanged) {
          this._legendContentVersion += 1;
        }
      },
    });
    renderer.addLayer(densityLayer, { before: renderer.graphLayer ?? 'graph-layer' });
    this._densityLayer = densityLayer;
    this._applyDensityConfigToLayer();
    return true;
  }

  _applyDensityConfigToLayer() {
    this._densityLayer?.setConfig?.(this._densityConfig);
  }

  _queueRenderRequest() {
    if (!this.scheduler?.requestRender) return;
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => this.scheduler?.requestRender?.());
      return;
    }
    Promise.resolve().then(() => this.scheduler?.requestRender?.());
  }

  _clearEdgeAdaptiveTimer(name) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const timer = runtime?.[name] ?? null;
    if (timer != null) {
      clearTimeout(timer);
      runtime[name] = null;
    }
  }

  _scheduleEdgeAdaptiveCameraIdleRender() {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    if (!runtime || !config.enabled || config.fastDuringCamera !== true) return;
    this._clearEdgeAdaptiveTimer('cameraIdleTimer');
    const delay = Math.max(0, Number(config.interactionHoldMs ?? 0));
    runtime.cameraIdleTimer = setTimeout(() => {
      runtime.cameraIdleTimer = null;
      this.scheduler?.requestRender?.();
    }, delay);
  }

  _scheduleEdgeAdaptiveProbe() {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    if (!runtime) return;
    this._clearEdgeAdaptiveTimer('probeTimer');
    if (!Number.isFinite(runtime.nextProbeAt)) return;
    const delay = Math.max(0, runtime.nextProbeAt - performance.now());
    runtime.probeTimer = setTimeout(() => {
      runtime.probeTimer = null;
      this.scheduler?.requestRender?.();
    }, delay);
  }

  _markEdgeAdaptiveCameraInteraction(detail = null, now = performance.now()) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    if (!runtime || config.enabled !== true || config.fastDuringCamera !== true) return false;
    if (detail?.origin !== 'interaction') return false;
    const holdMs = Number(config.interactionHoldMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.interactionHoldMs);
    runtime.cameraMovingUntil = now + Math.max(0, Number.isFinite(holdMs) ? holdMs : 0);
    this._scheduleEdgeAdaptiveCameraIdleRender();
    return true;
  }

  _edgeAdaptiveEdgesVisible() {
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (!graphLayer || typeof graphLayer.shouldRenderEdges !== 'function') return false;
    try {
      return graphLayer.shouldRenderEdges() === true;
    } catch (error) {
      warnOnce(
        this,
        'edge-visibility-probe',
        'Helios: failed to evaluate edge visibility; treating edges as hidden.',
        { error },
      );
      return false;
    }
  }

  _clearEdgeAdaptiveQualitySamples() {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    if (!runtime) return;
    runtime.qualityFrameSamples = [];
    runtime.qualityFrameAverageMs = null;
    runtime.fastFrameSamples = [];
    runtime.fastFrameAverageMs = null;
  }

  _resolveEdgeAdaptiveActivity(now = performance.now()) {
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const layoutState = typeof this.scheduler?.getLayoutState === 'function'
      ? this.scheduler.getLayoutState()
      : (this.scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
    const layoutActive = config.fastDuringLayout === true && layoutState === 'running';
    const cameraActive = config.fastDuringCamera === true
      && Number.isFinite(runtime?.cameraMovingUntil)
      && now < runtime.cameraMovingUntil;
    return {
      layoutActive,
      cameraActive,
      active: layoutActive || cameraActive,
    };
  }

  _pushEdgeAdaptiveQualitySample(renderMs) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    if (!runtime || !Number.isFinite(renderMs)) {
      return { averageMs: null, sampleCount: 0, targetCount: 0 };
    }
    const targetCount = normalizePositiveInteger(
      config.averageWindowFrames ?? config.slowFrameConsecutiveFrames,
      EDGE_ADAPTIVE_QUALITY_DEFAULTS.averageWindowFrames,
      1,
      240,
    );
    const samples = Array.isArray(runtime.qualityFrameSamples) ? runtime.qualityFrameSamples : [];
    samples.push(Number(renderMs));
    if (samples.length > targetCount) {
      samples.splice(0, samples.length - targetCount);
    }
    runtime.qualityFrameSamples = samples;
    runtime.qualityFrameAverageMs = samples.length > 0
      ? (samples.reduce((sum, value) => sum + value, 0) / samples.length)
      : null;
    return {
      averageMs: runtime.qualityFrameAverageMs,
      sampleCount: samples.length,
      targetCount,
    };
  }

  _pushEdgeAdaptiveFastSample(renderMs) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    if (!runtime || !Number.isFinite(renderMs)) {
      return { averageMs: null, sampleCount: 0, targetCount: 0 };
    }
    const targetCount = normalizePositiveInteger(
      config.averageWindowFrames ?? config.slowFrameConsecutiveFrames,
      EDGE_ADAPTIVE_QUALITY_DEFAULTS.averageWindowFrames,
      1,
      240,
    );
    const samples = Array.isArray(runtime.fastFrameSamples) ? runtime.fastFrameSamples : [];
    samples.push(Number(renderMs));
    if (samples.length > targetCount) {
      samples.splice(0, samples.length - targetCount);
    }
    runtime.fastFrameSamples = samples;
    runtime.fastFrameAverageMs = samples.length > 0
      ? (samples.reduce((sum, value) => sum + value, 0) / samples.length)
      : null;
    return {
      averageMs: runtime.fastFrameAverageMs,
      sampleCount: samples.length,
      targetCount,
    };
  }

  _resolveEdgeAdaptiveFrameCostMs(renderMs, frameIntervalMs) {
    const renderDuration = Number(renderMs);
    const frameInterval = Number(frameIntervalMs);
    const hasRenderDuration = Number.isFinite(renderDuration) && renderDuration >= 0;
    const hasFrameInterval = Number.isFinite(frameInterval) && frameInterval >= 0;
    if (hasRenderDuration && hasFrameInterval) return Math.max(renderDuration, frameInterval);
    if (hasRenderDuration) return renderDuration;
    if (hasFrameInterval) return frameInterval;
    return null;
  }

  _readLayoutAlphaMin(layout = null) {
    const settings = Number(layout?.settings?.alphaMin);
    if (Number.isFinite(settings)) return settings;
    const options = Number(layout?.options?.alphaMin);
    if (Number.isFinite(options)) return options;
    const delegate = layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null;
    const delegateAlphaMin = Number(delegate?.alphaMin);
    if (Number.isFinite(delegateAlphaMin)) return delegateAlphaMin;
    return NaN;
  }

  _computeEdgeAdaptiveProbeDelay(failedProbeCount = 0) {
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const base = Math.max(0, Number(config.probeIntervalMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.probeIntervalMs));
    if (!(base > 0)) return 0;
    const failures = Math.max(0, Math.floor(Number(failedProbeCount) || 0));
    const scaled = base * (EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.backoffFactor ** failures);
    return Math.min(
      Math.max(base, scaled),
      EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.maxBackoffMs,
    );
  }

  _shouldAttemptEdgeAdaptiveLayoutProbe(now = performance.now()) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    if (!runtime) return false;
    if (!(Number.isFinite(runtime.nextProbeAt) && now >= runtime.nextProbeAt)) return false;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const targetFastAverage = Number(config.slowFrameThresholdMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.slowFrameThresholdMs)
      * EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.exitThresholdFactor;
    const fastAverage = Number(runtime.fastFrameAverageMs);
    if (Number.isFinite(fastAverage) && fastAverage > targetFastAverage) return false;
    const currentAlpha = this._readLayoutAlpha(this._layout ?? null);
    if (Number.isFinite(currentAlpha)) {
      const fallbackAlpha = Number.isFinite(runtime.performanceFallbackAlpha)
        ? runtime.performanceFallbackAlpha
        : currentAlpha;
      const alphaMin = this._readLayoutAlphaMin(this._layout ?? null);
      const alphaThreshold = Math.max(
        fallbackAlpha * EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.alphaProbeFactor,
        Number.isFinite(alphaMin)
          ? alphaMin * EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.alphaMinMultiplier
          : Number.NEGATIVE_INFINITY,
      );
      if (currentAlpha > alphaThreshold) return false;
    }
    return true;
  }

  _emitEdgeAdaptiveQualityChange() {
    this._emitUIBindingChange('edgeAdaptiveQuality', this.edgeAdaptiveQuality(), {
      source: 'runtime',
      trackOverride: false,
    });
  }

  _emitEdgeAdaptiveQualityConfigBindings() {
    const value = this.edgeAdaptiveQuality();
    this._emitUIBindingChange('edgeAdaptiveQuality', value);
    this._emitUIBindingChange('edgeAdaptiveQualityEnabled', value.enabled);
    this._emitUIBindingChange('edgeAdaptiveQualitySlowFrameThresholdMs', value.slowFrameThresholdMs);
    this._emitUIBindingChange('edgeAdaptiveQualitySlowFrameConsecutiveFrames', value.slowFrameConsecutiveFrames);
    this._emitUIBindingChange('edgeAdaptiveQualityProbeIntervalMs', value.probeIntervalMs);
    this._emitUIBindingChange('edgeAdaptiveQualityInteractionHoldMs', value.interactionHoldMs);
    this._emitUIBindingChange('edgeAdaptiveQualityFastDuringCamera', value.fastDuringCamera);
    this._emitUIBindingChange('edgeAdaptiveQualityFastDuringLayout', value.fastDuringLayout);
  }

  _setAdaptiveEdgeFastRendering(enabled, reason = null, options = {}) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const graphLayer = this.renderer?.graphLayer ?? null;
    const next = enabled === true;
    const previous = graphLayer?.edgeAdaptiveFastRendering === true;
    const previousReason = runtime?.reason ?? null;
    if (graphLayer) {
      graphLayer.setAdaptiveEdgeFastRendering?.(next);
    } else {
      this._pendingGraphLayerProps.set('edgeAdaptiveFastRendering', next);
    }
    if (runtime) {
      runtime.reason = reason ?? (next ? 'performance' : 'quality');
    }
    const changed = previous !== next || previousReason !== (runtime?.reason ?? null);
    if (changed) {
      this._emitEdgeAdaptiveQualityChange();
      if (options.requestRender === true) {
        this._queueRenderRequest();
      }
    }
    return changed;
  }

  _resolveEdgeAdaptiveFastState(now = performance.now()) {
    const graphLayer = this.renderer?.graphLayer ?? null;
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const manualFast = graphLayer?.edgeFastRendering === true;
    const adaptiveFast = graphLayer?.edgeAdaptiveFastRendering === true;
    if (runtime?.forceHighQuality === true) {
      return { fast: false, reason: 'export' };
    }
    if (!this._edgeAdaptiveEdgesVisible()) {
      return { fast: false, reason: 'hidden' };
    }
    if (manualFast) {
      return { fast: false, reason: 'manual' };
    }
    if (!(this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS).enabled) {
      return { fast: false, reason: 'disabled' };
    }
    const activity = this._resolveEdgeAdaptiveActivity(now);
    if (!activity.active) {
      return { fast: false, reason: 'quality' };
    }
    if (adaptiveFast && runtime?.reason === 'performance') {
      if (
        activity.layoutActive
        && !activity.cameraActive
        && this._shouldAttemptEdgeAdaptiveLayoutProbe(now)
      ) {
        return { fast: false, reason: 'probe' };
      }
      return { fast: true, reason: 'performance' };
    }
    return { fast: false, reason: 'quality' };
  }

  _updateEdgeAdaptiveQualityBeforeRender(now = performance.now()) {
    const graphLayer = this.renderer?.graphLayer ?? null;
    const wasAdaptiveFast = graphLayer?.edgeAdaptiveFastRendering === true;
    const previousReason = this._edgeAdaptiveRuntime?.reason ?? null;
    const activity = this._resolveEdgeAdaptiveActivity(now);
    if (this._edgeAdaptiveRuntime) {
      if (activity.active !== (this._edgeAdaptiveRuntime.activityActive === true)) {
        this._edgeAdaptiveRuntime.activityActive = activity.active;
        this._edgeAdaptiveRuntime.skipNextQualitySample = activity.active === true;
        this._clearEdgeAdaptiveQualitySamples();
      }
    }
    const decision = this._resolveEdgeAdaptiveFastState(now);
    if (
      this._edgeAdaptiveRuntime
      && wasAdaptiveFast
      && decision.fast !== true
      && this._edgeAdaptiveRuntime.reason === 'performance'
    ) {
      this._edgeAdaptiveRuntime.nextProbeAt = Number.NEGATIVE_INFINITY;
      this._clearEdgeAdaptiveTimer('probeTimer');
      this._clearEdgeAdaptiveQualitySamples();
    }
    if (
      this._edgeAdaptiveRuntime
      && wasAdaptiveFast
      && decision.fast !== true
      && decision.reason === 'probe'
      && previousReason === 'performance'
    ) {
      this._edgeAdaptiveRuntime.skipNextQualitySample = true;
      this._clearEdgeAdaptiveQualitySamples();
    }
    this._setAdaptiveEdgeFastRendering(decision.fast, decision.reason, { requestRender: false });
    return decision;
  }

  _updateEdgeAdaptiveQualityAfterRender(renderMs, now = performance.now()) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (!runtime || !graphLayer) return;
    runtime.lastRenderMs = Number.isFinite(renderMs) ? renderMs : null;
    const edgesVisible = this._edgeAdaptiveEdgesVisible();
    const manualFast = graphLayer.edgeFastRendering === true;
    const adaptiveFast = graphLayer.edgeAdaptiveFastRendering === true;
    const activity = this._resolveEdgeAdaptiveActivity(now);
    if (runtime.forceHighQuality === true || !config.enabled || manualFast || !edgesVisible) {
      runtime.nextProbeAt = Number.NEGATIVE_INFINITY;
      this._clearEdgeAdaptiveTimer('probeTimer');
      this._clearEdgeAdaptiveQualitySamples();
      runtime.failedProbeCount = 0;
      runtime.performanceFallbackAt = Number.NEGATIVE_INFINITY;
      runtime.performanceFallbackAlpha = NaN;
      return;
    }
    if (!activity.active) {
      runtime.nextProbeAt = Number.NEGATIVE_INFINITY;
      this._clearEdgeAdaptiveTimer('probeTimer');
      this._clearEdgeAdaptiveQualitySamples();
      runtime.failedProbeCount = 0;
      runtime.performanceFallbackAt = Number.NEGATIVE_INFINITY;
      runtime.performanceFallbackAlpha = NaN;
      return;
    }
    if (adaptiveFast) {
      if (runtime.reason === 'performance') {
        this._pushEdgeAdaptiveFastSample(renderMs);
      }
      return;
    }
    if (runtime.skipNextQualitySample === true) {
      runtime.skipNextQualitySample = false;
      runtime.lastRenderMs = Number.isFinite(renderMs) ? renderMs : null;
      return;
    }
    const { averageMs, sampleCount, targetCount } = this._pushEdgeAdaptiveQualitySample(renderMs);
    if (sampleCount < targetCount || !Number.isFinite(averageMs)) {
      return;
    }
    const slowThreshold = Number(config.slowFrameThresholdMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.slowFrameThresholdMs);
    const exitThreshold = slowThreshold * EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.exitThresholdFactor;
    if (runtime.reason === 'probe') {
      if (averageMs <= exitThreshold) {
        runtime.reason = 'quality';
        runtime.failedProbeCount = 0;
        runtime.nextProbeAt = Number.NEGATIVE_INFINITY;
        runtime.performanceFallbackAt = Number.NEGATIVE_INFINITY;
        runtime.performanceFallbackAlpha = NaN;
        runtime.fastFrameSamples = [];
        runtime.fastFrameAverageMs = null;
        this._clearEdgeAdaptiveTimer('probeTimer');
        return;
      }
      runtime.reason = 'performance';
      runtime.failedProbeCount = Math.max(0, Math.floor(Number(runtime.failedProbeCount) || 0)) + 1;
      runtime.nextProbeAt = now + this._computeEdgeAdaptiveProbeDelay(runtime.failedProbeCount);
      runtime.performanceFallbackAt = now;
      runtime.performanceFallbackAlpha = this._readLayoutAlpha(this._layout ?? null);
      runtime.fastFrameSamples = [];
      runtime.fastFrameAverageMs = null;
      this._clearEdgeAdaptiveQualitySamples();
      this._setAdaptiveEdgeFastRendering(true, 'performance', { requestRender: true });
      return;
    }
    if (averageMs > slowThreshold) {
      runtime.failedProbeCount = 0;
      runtime.performanceFallbackAt = now;
      runtime.performanceFallbackAlpha = this._readLayoutAlpha(this._layout ?? null);
      runtime.nextProbeAt = now + this._computeEdgeAdaptiveProbeDelay(0);
      runtime.fastFrameSamples = [];
      runtime.fastFrameAverageMs = null;
      this._clearEdgeAdaptiveQualitySamples();
      this._setAdaptiveEdgeFastRendering(true, 'performance', { requestRender: true });
      return;
    }
  }

  _getGraphLayerProp(name) {
    if (this.renderer?.graphLayer && name in this.renderer.graphLayer) {
      return this.renderer.graphLayer[name];
    }
    return this._pendingGraphLayerProps.get(name);
  }

  _requestGraphPropLabelReselect(reason) {
    if (this._suppressStateBindingUiEvent > 0) {
      this._pendingStateBindingLabelReselectReason = reason;
      if (this._pendingStateBindingLabelReselect) return;
      this._pendingStateBindingLabelReselect = true;
      const schedule = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback) => setTimeout(callback, 16);
      schedule(() => {
        this._pendingStateBindingLabelReselect = false;
        const nextReason = this._pendingStateBindingLabelReselectReason ?? reason;
        this._pendingStateBindingLabelReselectReason = null;
        this._labels?.requestFullReselect?.(nextReason);
      });
      return;
    }
    this._labels?.requestFullReselect?.(reason);
  }

  _setGraphLayerProp(name, value) {
    if (this.renderer?.graphLayer && name in this.renderer.graphLayer) {
      this.renderer.graphLayer[name] = value;
      this.scheduler.requestRender();
      this._requestGraphPropLabelReselect(`graph-prop:${name}`);
      this._emitUIBindingChange(name, value);
      return this;
    }
    this._pendingGraphLayerProps.set(name, value);
    this._requestGraphPropLabelReselect(`graph-prop-pending:${name}`);
    this._emitUIBindingChange(name, value);
    return this;
  }

  _getRendererProp(name) {
    if (this.renderer && name in this.renderer) {
      return this.renderer[name];
    }
    return this._pendingRendererProps.get(name);
  }

  _setRendererProp(name, value, detail = {}) {
    if (this.renderer && name in this.renderer) {
      this.renderer[name] = value;
      this.scheduler.requestRender();
      this._emitUIBindingChange(name, value, detail);
      return this;
    }
    this._pendingRendererProps.set(name, value);
    this._emitUIBindingChange(name, value, detail);
    return this;
  }

  /**
   * Read or set the multiplier applied to edge width attributes.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Edge width scale multiplier.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeWidthScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeWidthScale');
    return this._setGraphLayerProp('edgeWidthScale', Number(value));
  }

  /**
   * Read or set the constant edge width added before scaling.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Base edge width in render units.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeWidthBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeWidthBase');
    return this._setGraphLayerProp('edgeWidthBase', Number(value));
  }

  /**
   * Read or set the multiplier applied to edge opacity attributes.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Edge opacity scale multiplier.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeOpacityScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeOpacityScale');
    return this._setGraphLayerProp('edgeOpacityScale', Number(value));
  }

  /**
   * Read or set the constant edge opacity added before scaling.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Base edge opacity.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeOpacityBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeOpacityBase');
    return this._setGraphLayerProp('edgeOpacityBase', Number(value));
  }

  /**
   * Read or set the multiplier applied to node opacity attributes.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Node opacity scale multiplier.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  nodeOpacityScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOpacityScale');
    return this._setGraphLayerProp('nodeOpacityScale', Number(value));
  }

  /**
   * Read or set the constant node opacity added before scaling.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Base node opacity.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  nodeOpacityBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOpacityBase');
    return this._setGraphLayerProp('nodeOpacityBase', Number(value));
  }

  /**
   * Read or set the multiplier applied to node size attributes.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Node size scale multiplier.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  nodeSizeScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeSizeScale');
    return this._setGraphLayerProp('nodeSizeScale', Number(value));
  }

  /**
   * Read or set the constant node radius added before scaling.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Base node radius in render units.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  nodeSizeBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeSizeBase');
    return this._setGraphLayerProp('nodeSizeBase', Number(value));
  }

  /**
   * Read or set semantic zoom compensation for node and label sizing.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Exponent controlling how strongly zoom affects apparent size.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  semanticZoomExponent(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('semanticZoomExponent');
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('semanticZoomExponent', numeric);
  }

  /**
   * Read or set the multiplier applied to node outline width attributes.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Node outline width scale multiplier.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  nodeOutlineWidthScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineWidthScale');
    return this._setGraphLayerProp('nodeOutlineWidthScale', Number(value));
  }

  /**
   * Read or set the constant node outline width added before scaling.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Base node outline width in render units.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  nodeOutlineWidthBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineWidthBase');
    return this._setGraphLayerProp('nodeOutlineWidthBase', Number(value));
  }

  /**
   * Read or set the default node outline color.
   *
   * @public
   * @apiSection Appearance
   * @param {string|Array<number>} [color] - CSS hex color or normalized RGBA tuple.
   * @returns {Array<number>|Helios} Current RGBA color when omitted; otherwise this Helios instance.
   */
  nodeOutlineColor(color) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineColor');
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('nodeOutlineColor(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setGraphLayerProp('nodeOutlineColor', normalized);
  }

  /**
   * Read or set whether outline attributes participate in node styling.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable outline attribute mapping.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  nodeOutlineUseAttributes(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineUseAttributes');
    return this._setGraphLayerProp('nodeOutlineUseAttributes', Boolean(value));
  }

  /**
   * Read or set how far edge geometry is trimmed away from node centers.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Trim amount in node-radius units.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeEndpointTrim(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeEndpointTrim');
    return this._setGraphLayerProp('edgeEndpointTrim', Number(value));
  }

  /**
   * Read or set whether rendered edge width is clamped by endpoint node diameter.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Clamp thick edges to avoid overpowering small nodes.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeWidthClampToNodeDiameter(value) {
    if (arguments.length === 0) {
      const current = this._getGraphLayerProp('edgeWidthClampToNodeDiameter');
      return current == null ? true : current !== false;
    }
    return this._setGraphLayerProp('edgeWidthClampToNodeDiameter', value !== false);
  }

  /**
   * Read or set whether node rendering blends visually with adjacent edges.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable node/edge blending.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  nodeBlendWithEdges(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeBlendWithEdges');
    return this._setGraphLayerProp('nodeBlendWithEdges', Boolean(value));
  }

  /**
   * Read or set whether edge fragments write to the depth buffer.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable depth writes for edges.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeDepthWrite(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeDepthWrite');
    return this._setGraphLayerProp('edgeDepthWrite', Boolean(value));
  }

  /**
   * Read or set the manual fast edge-rendering override.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable the fast edge rendering path.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeFastRendering(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeFastRendering');
    return this._setGraphLayerProp('edgeFastRendering', Boolean(value));
  }

  /**
   * Read or set whether shaded rendering is enabled.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable lighting-based shading.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedEnabled(value) {
    if (arguments.length === 0) {
      const current = this._getGraphLayerProp('shadedEnabled');
      return current == null ? false : current === true;
    }
    return this._setGraphLayerProp('shadedEnabled', Boolean(value));
  }

  /**
   * Read or set whether node geometry receives shaded lighting.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable shading for nodes.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedNodes(value) {
    if (arguments.length === 0) {
      const current = this._getGraphLayerProp('shadedNodes');
      return current == null ? true : current !== false;
    }
    return this._setGraphLayerProp('shadedNodes', value !== false);
  }

  /**
   * Read or set whether edge geometry receives shaded lighting.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable shading for edges.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedEdges(value) {
    if (arguments.length === 0) {
      const current = this._getGraphLayerProp('shadedEdges');
      return current === true;
    }
    return this._setGraphLayerProp('shadedEdges', value === true);
  }

  /**
   * Read or set the directional light vector used by shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {Array<number>|object} [value] - Light direction as `[x,y,z]` or direction-like object.
   * @returns {Array<number>|Helios} Current direction when omitted; otherwise this Helios instance.
   */
  shadedLightDirection(value) {
    if (arguments.length === 0) {
      return normalizeDirectionInput(this._getGraphLayerProp('shadedLightDirection'), SHADED_LIGHT_DIRECTION_DEFAULT);
    }
    return this._setGraphLayerProp('shadedLightDirection', normalizeDirectionInput(value, SHADED_LIGHT_DIRECTION_DEFAULT));
  }

  /**
   * Read or set the x component of the shaded light direction.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - X component.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedLightDirectionX(value) {
    if (arguments.length === 0) return this.shadedLightDirection()[0];
    const next = this.shadedLightDirection();
    next[0] = Number(value);
    return this.shadedLightDirection(next);
  }

  /**
   * Read or set the y component of the shaded light direction.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Y component.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedLightDirectionY(value) {
    if (arguments.length === 0) return this.shadedLightDirection()[1];
    const next = this.shadedLightDirection();
    next[1] = Number(value);
    return this.shadedLightDirection(next);
  }

  /**
   * Read or set the z component of the shaded light direction.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Z component.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedLightDirectionZ(value) {
    if (arguments.length === 0) return this.shadedLightDirection()[2];
    const next = this.shadedLightDirection();
    next[2] = Number(value);
    return this.shadedLightDirection(next);
  }

  /**
   * Read or set the direct light color used by shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {string|Array<number>} [color] - CSS hex color or normalized RGBA tuple.
   * @returns {Array<number>|Helios} Current RGBA color when omitted; otherwise this Helios instance.
   */
  shadedLightColor(color) {
    if (arguments.length === 0) {
      return cloneColorInput(this._getGraphLayerProp('shadedLightColor'), SHADED_LIGHT_COLOR_DEFAULT);
    }
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('shadedLightColor(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setGraphLayerProp('shadedLightColor', normalized);
  }

  /**
   * Read or set the upper hemisphere ambient color for shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {string|Array<number>} [color] - CSS hex color or normalized RGBA tuple.
   * @returns {Array<number>|Helios} Current RGBA color when omitted; otherwise this Helios instance.
   */
  shadedAmbientTopColor(color) {
    if (arguments.length === 0) {
      return cloneColorInput(this._getGraphLayerProp('shadedAmbientTopColor'), SHADED_AMBIENT_TOP_COLOR_DEFAULT);
    }
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('shadedAmbientTopColor(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setGraphLayerProp('shadedAmbientTopColor', normalized);
  }

  /**
   * Read or set the lower hemisphere ambient color for shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {string|Array<number>} [color] - CSS hex color or normalized RGBA tuple.
   * @returns {Array<number>|Helios} Current RGBA color when omitted; otherwise this Helios instance.
   */
  shadedAmbientBottomColor(color) {
    if (arguments.length === 0) {
      return cloneColorInput(this._getGraphLayerProp('shadedAmbientBottomColor'), SHADED_AMBIENT_BOTTOM_COLOR_DEFAULT);
    }
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('shadedAmbientBottomColor(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setGraphLayerProp('shadedAmbientBottomColor', normalized);
  }

  /**
   * Read or set diffuse lighting strength for shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Non-negative diffuse strength.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedDiffuseStrength(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('shadedDiffuseStrength'));
      return Number.isFinite(current) ? current : SHADED_DIFFUSE_STRENGTH_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('shadedDiffuseStrength', Math.max(0, numeric));
  }

  /**
   * Read or set ambient lighting strength for shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Non-negative ambient strength.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedAmbientStrength(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('shadedAmbientStrength'));
      return Number.isFinite(current) ? current : SHADED_AMBIENT_STRENGTH_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('shadedAmbientStrength', Math.max(0, numeric));
  }

  /**
   * Read or set the specular highlight color for shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {string|Array<number>} [color] - CSS hex color or normalized RGBA tuple.
   * @returns {Array<number>|Helios} Current RGBA color when omitted; otherwise this Helios instance.
   */
  shadedSpecularColor(color) {
    if (arguments.length === 0) {
      return cloneColorInput(this._getGraphLayerProp('shadedSpecularColor'), SHADED_SPECULAR_COLOR_DEFAULT);
    }
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('shadedSpecularColor(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setGraphLayerProp('shadedSpecularColor', normalized);
  }

  /**
   * Read or set specular highlight strength for shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Non-negative specular strength.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedSpecularStrength(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('shadedSpecularStrength'));
      return Number.isFinite(current) ? current : SHADED_SPECULAR_STRENGTH_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('shadedSpecularStrength', Math.max(0, numeric));
  }

  /**
   * Read or set specular shininess for shaded rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Shininess exponent.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  shadedShininess(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('shadedShininess'));
      return Number.isFinite(current) ? current : SHADED_SHININESS_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('shadedShininess', Math.max(1, numeric));
  }

  /**
   * Read or set whether screen-space ambient occlusion is enabled.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable ambient occlusion when the renderer supports it.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  ambientOcclusionEnabled(value) {
    if (arguments.length === 0) {
      const current = this._getGraphLayerProp('ambientOcclusionEnabled');
      return current === true;
    }
    return this._setGraphLayerProp('ambientOcclusionEnabled', Boolean(value));
  }

  /**
   * Read or set whether ambient occlusion is applied to nodes.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable node occlusion.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  ambientOcclusionNodes(value) {
    if (arguments.length === 0) {
      const current = this._getGraphLayerProp('ambientOcclusionNodes');
      return current == null ? true : current !== false;
    }
    return this._setGraphLayerProp('ambientOcclusionNodes', value !== false);
  }

  /**
   * Read or set whether ambient occlusion is applied to edges.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable edge occlusion.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  ambientOcclusionEdges(value) {
    if (arguments.length === 0) {
      const current = this._getGraphLayerProp('ambientOcclusionEdges');
      return current === true;
    }
    return this._setGraphLayerProp('ambientOcclusionEdges', value === true);
  }

  /**
   * Read or set ambient occlusion strength.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Non-negative occlusion strength.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  ambientOcclusionStrength(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('ambientOcclusionStrength'));
      return Number.isFinite(current) ? current : AMBIENT_OCCLUSION_STRENGTH_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('ambientOcclusionStrength', Math.max(0, numeric));
  }

  /**
   * Read or set ambient occlusion sampling radius.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Radius in screen-space sample units.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  ambientOcclusionRadius(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('ambientOcclusionRadius'));
      return Number.isFinite(current) ? current : AMBIENT_OCCLUSION_RADIUS_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('ambientOcclusionRadius', Math.max(1, numeric));
  }

  /**
   * Read or set ambient occlusion depth bias.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Non-negative depth bias.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  ambientOcclusionBias(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('ambientOcclusionBias'));
      return Number.isFinite(current) ? current : AMBIENT_OCCLUSION_BIAS_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('ambientOcclusionBias', Math.max(0, numeric));
  }

  /**
   * Read or set ambient occlusion compositing mode.
   *
   * @public
   * @apiSection Appearance
   * @param {string} [value] - Ambient occlusion mode identifier.
   * @returns {string|Helios} Current mode when omitted; otherwise this Helios instance.
   */
  ambientOcclusionMode(value) {
    if (arguments.length === 0) {
      return normalizeAmbientOcclusionMode(
        this._getGraphLayerProp('ambientOcclusionMode'),
        AMBIENT_OCCLUSION_MODE_DEFAULT,
      );
    }
    const normalized = normalizeAmbientOcclusionMode(value, null);
    if (!normalized) return this;
    return this._setGraphLayerProp('ambientOcclusionMode', normalized);
  }

  /**
   * Read or set ambient occlusion intensity scaling.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Non-negative intensity multiplier.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  ambientOcclusionIntensityScale(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('ambientOcclusionIntensityScale'));
      return Number.isFinite(current) ? current : AMBIENT_OCCLUSION_INTENSITY_SCALE_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('ambientOcclusionIntensityScale', Math.max(0, numeric));
  }

  /**
   * Read or set ambient occlusion intensity offset.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Non-negative intensity offset.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  ambientOcclusionIntensityShift(value) {
    if (arguments.length === 0) {
      const current = Number(this._getGraphLayerProp('ambientOcclusionIntensityShift'));
      return Number.isFinite(current) ? current : AMBIENT_OCCLUSION_INTENSITY_SHIFT_DEFAULT;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('ambientOcclusionIntensityShift', Math.max(0, numeric));
  }

  /**
   * Read or set ambient occlusion quality preset.
   *
   * @public
   * @apiSection Appearance
   * @param {string} [value] - Ambient occlusion quality preset.
   * @returns {string|Helios} Current quality when omitted; otherwise this Helios instance.
   */
  ambientOcclusionQuality(value) {
    if (arguments.length === 0) {
      return normalizeAmbientOcclusionQuality(
        this._getGraphLayerProp('ambientOcclusionQuality'),
        AMBIENT_OCCLUSION_QUALITY_DEFAULT,
      );
    }
    const normalized = normalizeAmbientOcclusionQuality(value, null);
    if (!normalized) return this;
    return this._setGraphLayerProp('ambientOcclusionQuality', normalized);
  }

  /**
   * Read or update the adaptive edge-quality policy used to switch fast edge rendering on slow frames.
   *
   * @public
   * @apiSection Appearance
   * @param {object} [options] - Adaptive quality configuration. Omit to read the current configuration and runtime status.
   * @returns {object|Helios} Current policy snapshot when omitted; otherwise this Helios instance.
   */
  edgeAdaptiveQuality(options) {
    if (arguments.length === 0) {
      const config = { ...(this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS) };
      const runtime = this._edgeAdaptiveRuntime ?? null;
      return {
        ...config,
        slowFrameConsecutiveFrames: config.averageWindowFrames,
        cameraIdleMs: config.interactionHoldMs,
        active: this.renderer?.graphLayer?.edgeAdaptiveFastRendering === true,
        manualFastRendering: this.renderer?.graphLayer?.edgeFastRendering === true,
        reason: runtime?.reason ?? null,
        lastRenderMs: Number.isFinite(runtime?.lastRenderMs) ? runtime.lastRenderMs : null,
        qualityFrameAverageMs: Number.isFinite(runtime?.qualityFrameAverageMs) ? runtime.qualityFrameAverageMs : null,
        qualityFrameSampleCount: Array.isArray(runtime?.qualityFrameSamples) ? runtime.qualityFrameSamples.length : 0,
      };
    }
    const current = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const next = normalizeEdgeAdaptiveQualityConfig(current, options);
    this._edgeAdaptiveQualityConfig = next;
    this.options ??= {};
    this.options.edgeAdaptiveQuality = { ...next };
    if (this._edgeAdaptiveRuntime) {
      if (next.enabled !== true) {
        this._edgeAdaptiveRuntime.nextProbeAt = Number.NEGATIVE_INFINITY;
        this._clearEdgeAdaptiveTimer('probeTimer');
        this._clearEdgeAdaptiveQualitySamples();
        this._setAdaptiveEdgeFastRendering(false, 'disabled', { requestRender: false });
      }
      this._edgeAdaptiveRuntime.reason = next.enabled ? this._edgeAdaptiveRuntime.reason ?? 'quality' : 'disabled';
    }
    this._emitEdgeAdaptiveQualityConfigBindings();
    this.scheduler?.requestRender?.();
    return this;
  }

  /**
   * Read or set whether adaptive edge quality is enabled.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Enable adaptive edge quality.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeAdaptiveQualityEnabled(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().enabled;
    this.edgeAdaptiveQuality({ enabled: Boolean(value) });
    return this;
  }

  /**
   * Read or set the frame-time threshold that counts as slow for adaptive edge quality.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Slow-frame threshold in milliseconds.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeAdaptiveQualitySlowFrameThresholdMs(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().slowFrameThresholdMs;
    this.edgeAdaptiveQuality({ slowFrameThresholdMs: Number(value) });
    return this;
  }

  /**
   * Read or set how many recent frames are averaged before adaptive quality changes.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Frame sample window size.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeAdaptiveQualitySlowFrameConsecutiveFrames(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().averageWindowFrames;
    this.edgeAdaptiveQuality({ averageWindowFrames: Number(value) });
    return this;
  }

  /**
   * Read or set how often adaptive quality probes full-quality edge rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Probe interval in milliseconds.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeAdaptiveQualityProbeIntervalMs(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().probeIntervalMs;
    this.edgeAdaptiveQuality({ probeIntervalMs: Number(value) });
    return this;
  }

  /**
   * Read or set how long adaptive quality stays fast after interaction.
   *
   * @public
   * @apiSection Appearance
   * @param {number} [value] - Hold duration in milliseconds.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeAdaptiveQualityInteractionHoldMs(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().interactionHoldMs;
    this.edgeAdaptiveQuality({ interactionHoldMs: Number(value) });
    return this;
  }

  /**
   * Read or set whether camera interaction forces fast edge rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Use fast edges while the camera is moving.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeAdaptiveQualityFastDuringCamera(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().fastDuringCamera;
    this.edgeAdaptiveQuality({ fastDuringCamera: Boolean(value) });
    return this;
  }

  /**
   * Read or set whether active layout ticks force fast edge rendering.
   *
   * @public
   * @apiSection Appearance
   * @param {boolean} [value] - Use fast edges while layout is running.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  edgeAdaptiveQualityFastDuringLayout(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().fastDuringLayout;
    this.edgeAdaptiveQuality({ fastDuringLayout: Boolean(value) });
    return this;
  }

  /**
   * Read or set the renderer background color.
   *
   * @public
   * @apiSection Appearance
   * @param {string|Array<number>} [color] - CSS hex color or normalized RGBA tuple.
   * @returns {Array<number>|Helios} Current RGBA color when omitted; otherwise this Helios instance.
   */
  background(color) {
    if (arguments.length === 0) return this._getRendererProp('clearColor');
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('background(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setRendererProp('clearColor', normalized);
  }

  /**
   * Alias for `background(color)`.
   *
   * @public
   * @apiSection Appearance
   * @param {string|Array<number>} [color] - CSS hex color or normalized RGBA tuple.
   * @returns {Array<number>|Helios} Current RGBA color when omitted; otherwise this Helios instance.
   */
  clearColor(color) {
    if (arguments.length === 0) return this.background();
    return this.background(color);
  }

  /**
   * Read or set the renderer supersampling preset.
   *
   * @public
   * @apiSection Appearance
   * @param {'auto'|'on'|'off'|boolean} [value] - Supersampling preset or legacy boolean.
   * @returns {string|Helios} Current preset when omitted; otherwise this Helios instance.
   */
  supersampling(value) {
    if (arguments.length === 0) {
      return resolveSupersamplingPreset(this.options?.supersampling, {
        forceSupersample: this.options?.forceSupersample === true,
      });
    }
    const preset = resolveSupersamplingPreset(value, {
      forceSupersample: this.options?.forceSupersample === true,
    });
    this.options.supersampling = supersamplingPresetToOption(preset, {
      forceSupersample: this.options?.forceSupersample === true,
    });
    this.options.forceSupersample = false;
    this.layers?.setSupersampling?.(this.options.supersampling);
    this._emitUIBindingChange('supersampling', preset);
    return this;
  }

  /**
   * Capture the current camera pose.
   *
   * @public
   * @apiSection Camera And View
   * @returns {object|null} Serializable camera pose, or `null` before a renderer is available.
   */
  cameraPose() {
    return captureCameraPose(this.renderer?.camera ?? null);
  }

  /**
   * Read or update automatic camera-control policy.
   *
   * @public
   * @apiSection Camera And View
   * @param {object} [options] - Camera-control fields to update. Omit to read the current snapshot.
   * @param {object} [stateOptions] - State tracking options for persistence-aware writes.
   * @returns {object|Helios} Current camera-control snapshot when called without arguments; otherwise this Helios instance.
   */
  cameraControls(options, stateOptions = {}) {
    if (arguments.length === 0) {
      return this._cameraControlsSnapshot();
    }
    if (!options || typeof options !== 'object') return this;
    const previousSnapshot = this._cameraControlsSnapshot();
    const previous = JSON.stringify(previousSnapshot);
    this._cameraControlConfig = normalizeCameraControlConfig(this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS, options);
    const orbitAngleChanged = (this._cameraControlConfig.orbitAngle ?? 0) !== (previousSnapshot.orbitAngle ?? 0);
    const followChanged = this._cameraControlConfig.followTarget !== previousSnapshot.followTarget
      || JSON.stringify(this._cameraControlConfig.targetNodeIndices ?? null) !== JSON.stringify(previousSnapshot.targetNodeIndices ?? null);
    if (this._cameraControlConfig.orbit !== true) {
      this._cameraControlRuntime.lastOrbitAt = 0;
    }
    if (followChanged) {
      this._cameraControlRuntime.lastFollowUpdateAt = Number.NEGATIVE_INFINITY;
    }
    if (orbitAngleChanged && this.renderer?.camera?.mode === '3d') {
      this.scheduler?.requestRender?.();
    }
    this._markAutoFitDirty(false);
    const next = this._cameraControlsSnapshot();
    if (JSON.stringify(next) !== previous) {
      this._emitCameraControlChange();
      if (stateOptions.applyState !== false && typeof this.states?.set === 'function') {
        const source = stateOptions.source ?? 'program';
        const trackOverride = stateOptions.trackOverride ?? isExplicitCameraStateSource(source, stateOptions);
        for (const key of CAMERA_CONTROL_STATE_KEYS) {
          if (!Object.prototype.hasOwnProperty.call(options, key)) continue;
          if (JSON.stringify(previousSnapshot?.[key]) === JSON.stringify(next?.[key])) continue;
          this.states.set(`camera.controls.${key}`, cloneSerializable(next[key]), {
            source,
            reason: stateOptions.reason ?? 'camera-controls',
            trackOverride,
            applyBinding: false,
            debounceMs: stateOptions.debounceMs ?? 500,
            journal: stateOptions.journal ?? false,
          });
        }
      }
    }
    if (this._cameraControlConfig.autoFit === true) {
      this.scheduler?.requestRender?.();
    }
    if (this._cameraControlConfig.followTarget === true) {
      this.scheduler?.requestRender?.();
    }
    if (this._cameraControlConfig.orbit === true && this.renderer?.camera?.mode === '3d') {
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  /**
   * Focus the camera on a set of node indices.
   *
   * @public
   * @apiSection Camera And View
   * @param {Array<number>|TypedArray} [nodeIndices] - Node indices to target. Omit to read the current target list.
   * @param {object} [options] - Focus, zoom, animation, and follow options.
   * @returns {Array<number>|Helios} Current target list when called without arguments; otherwise this Helios instance.
   */
  cameraTargetNodes(nodeIndices, options = {}) {
    if (arguments.length === 0) {
      return [...(this._cameraControlConfig?.targetNodeIndices ?? [])];
    }
    const normalized = normalizeNodeIndexList(nodeIndices);
    const followTarget = (options.follow === true || options.followTarget === true) && normalized?.length > 0;
    this.cameraControls({
      targetNodeIndices: normalized,
      followTarget,
      ...(followTarget && Number.isFinite(options.followUpdateIntervalMs) ? { followUpdateIntervalMs: options.followUpdateIntervalMs } : {}),
      ...(followTarget ? { autoFit: false } : {}),
    });
    const zoomScale = Number.isFinite(options.zoomScale)
      ? Number(options.zoomScale)
      : Number.isFinite(options.zoomFactor)
        ? Number(options.zoomFactor)
        : 1;
    const exactReadback = normalized?.length > 0 && options.exactReadback !== false;
    const animate = options.animate ?? this._cameraControlConfig?.animation === true;
    const durationMs = options.durationMs ?? this._cameraControlConfig?.animationDurationMs;
    const bounds = this._sampleRenderBounds({
      nodeIndices: normalized?.length ? normalized : undefined,
      coverage: 1,
      maxSamples: this._cameraControlConfig?.autoFitMaxSamples ?? CAMERA_FIT_DEFAULT_MAX_SAMPLES,
      applyFocusOnResolve: normalized?.length > 0,
      exactReadback,
      preferCached: options.preferCached ?? !exactReadback,
      allowStaleVersion: options.allowStaleVersion ?? !exactReadback,
      deferReadback: options.deferReadback ?? (exactReadback ? false : undefined),
      zoomScale,
      maxFocusZoom: options.maxFocusZoom,
      minFocusDistance: options.minFocusDistance,
      focusZoomTolerance: options.focusZoomTolerance,
      animate,
      durationMs,
    });
    const nextPose = this._resolveCameraFocusPose(bounds, {
      focusMode: normalized?.length ? 'centroid' : 'bbox',
      zoomScale,
      maxFocusZoom: options.maxFocusZoom,
      minFocusDistance: options.minFocusDistance,
      focusZoomTolerance: options.focusZoomTolerance,
    });
    if (followTarget) {
      this._queueCameraControlPose(nextPose, { animate, durationMs });
    } else {
      this._applyCameraPoseWithOptionalAnimation(nextPose, { animate, durationMs });
    }
    return this;
  }

  /**
   * Keep the camera centered on moving node indices.
   *
   * @public
   * @apiSection Camera And View
   * @param {Array<number>|TypedArray} [nodeIndices] - Node indices to follow. Pass an empty list to disable following.
   * @param {object} [options] - Follow interval, framing, zoom, and animation options.
   * @returns {Array<number>|Helios} Current followed node list when called without arguments; otherwise this Helios instance.
   */
  cameraFollowNodes(nodeIndices, options = {}) {
    if (arguments.length === 0) {
      return this._cameraControlConfig?.followTarget === true
        ? [...(this._cameraControlConfig?.targetNodeIndices ?? [])]
        : [];
    }
    const normalized = normalizeNodeIndexList(nodeIndices);
    if (!normalized?.length) {
      this.cameraControls({ targetNodeIndices: null, followTarget: false });
      this._stopCameraControlPoseInterpolation();
      if (options.frame !== false) {
        this.frameNetwork({
          animate: options.animate ?? this._cameraControlConfig?.animation === true,
          durationMs: options.durationMs ?? this._cameraControlConfig?.animationDurationMs,
          resetOrientation: options.resetOrientation ?? false,
        });
      }
      return this;
    }
    return this.cameraTargetNodes(normalized, {
      ...options,
      follow: true,
      followUpdateIntervalMs: Number.isFinite(options.followUpdateIntervalMs)
        ? Number(options.followUpdateIntervalMs)
        : (this._cameraControlConfig?.followUpdateIntervalMs ?? CAMERA_CONTROL_DEFAULTS.followUpdateIntervalMs),
      zoomScale: Number.isFinite(options.zoomScale)
        ? Number(options.zoomScale)
        : Number.isFinite(options.zoomFactor)
          ? Number(options.zoomFactor)
          : 1.35,
    });
  }

  /**
   * Apply a camera pose immediately.
   *
   * @public
   * @apiSection Camera And View
   * @param {object} pose - Camera pose fields to merge into the current pose.
   * @param {object} [options] - Render, state tracking, and manual-interaction options.
   * @returns {Helios} This Helios instance.
   */
  setCameraPose(pose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    if (!camera || !pose || typeof pose !== 'object') return this;
    if (
      options.source === 'ui'
      || options.source === 'interaction'
      || options.source === 'cli'
      || options.manual === true
      || Object.prototype.hasOwnProperty.call(pose, 'rotation')
    ) {
      this._invalidateCameraOrbitReference();
      this._stopCameraControlPoseInterpolation();
    }
    const nextPose = mergeCameraPose(captureCameraPose(camera), pose);
    if ('_pendingChangeDetail' in camera && (options.source || options.manual === true)) {
      camera._pendingChangeDetail = {
        origin: options.source ?? 'interaction',
        type: 'api',
        action: Object.prototype.hasOwnProperty.call(pose, 'zoom')
          ? 'zoom'
          : Object.prototype.hasOwnProperty.call(pose, 'distance')
            ? 'dolly'
            : 'pan',
        mode: nextPose.mode ?? camera.mode,
      };
    }
    applyCameraPose(camera, nextPose, { update: options.update !== false });
    if (
      options.applyState !== false
      && typeof this.states?.set === 'function'
      && isExplicitCameraStateSource(options.source, options)
    ) {
      this.states.set('camera.pose', this._snapshotCameraState({ includeViewport: false }), {
        source: options.source === 'test' ? 'program' : (options.source ?? 'program'),
        reason: options.reason ?? 'camera-pose',
        trackOverride: true,
        applyBinding: false,
        debounceMs: options.debounceMs ?? 500,
        journal: options.journal ?? false,
      });
    }
    if (options.source === 'ui' || options.source === 'interaction' || options.source === 'cli' || options.manual === true) {
      this._disableAutomaticCameraControlFromInteraction({
        origin: options.source ?? 'interaction',
        action: Object.prototype.hasOwnProperty.call(pose, 'zoom') ? 'zoom' : Object.prototype.hasOwnProperty.call(pose, 'distance') ? 'dolly' : 'pan',
      });
    }
    if (options.requestRender !== false) {
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  /**
   * Animate the camera from its current pose to a target pose.
   *
   * @public
   * @apiSection Camera And View
   * @param {object} pose - Target camera pose fields.
   * @param {object} [options] - Transition duration, starting pose, render, and interaction options.
   * @returns {Promise<Helios>} This Helios instance after the transition completes.
   */
  async transitionCamera(pose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    if (!camera || !pose || typeof pose !== 'object') return this;
    this._stopCameraControlPoseInterpolation();
    const fromPose = mergeCameraPose(captureCameraPose(camera), options.fromPose ?? {});
    const toPose = mergeCameraPose(fromPose, pose);
    await this._ensureCameraTransitionController().transition(camera, {
      fromPose,
      toPose,
      durationMs: options.durationMs ?? DEFAULT_MODE_SWITCH_DURATION_MS,
    });
    if (options.source === 'ui' || options.source === 'interaction' || options.source === 'cli' || options.manual === true) {
      this._disableAutomaticCameraControlFromInteraction({
        origin: options.source ?? 'interaction',
        action: Object.prototype.hasOwnProperty.call(pose, 'zoom') ? 'zoom' : Object.prototype.hasOwnProperty.call(pose, 'distance') ? 'dolly' : 'pan',
      });
    }
    if (options.requestRender !== false) {
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  /**
   * Stop any active camera transition.
   *
   * @public
   * @apiSection Camera And View
   * @returns {Helios} This Helios instance.
   */
  stopCameraTransition() {
    this._cameraTransitionController?.stop?.();
    return this;
  }

  /**
   * Return the active dimensional rendering mode.
   *
   * @public
   * @apiSection Camera And View
   * @returns {'2d'|'3d'} Current camera/rendering mode.
   */
  mode() {
    return this.options?.mode === '2d' ? '2d' : '3d';
  }

  /**
   * Switch between 2D and 3D rendering modes.
   *
   * @public
   * @apiSection Camera And View
   * @param {'2d'|'3d'} mode - Target dimensional mode.
   * @param {object} [options] - Animation, delegate-sync, and camera framing options.
   * @returns {Promise<Helios>} This Helios instance after the mode switch completes.
   */
  async setMode(mode, options = {}) {
    const nextMode = mode === '3d' ? '3d' : '2d';
    const previousMode = this.mode();
    if (nextMode === previousMode) return this;
    if (this._cameraControlRuntime) {
      this._cameraControlRuntime.suspended = true;
      this._stopCameraControlPoseInterpolation();
    }

    try {
      const positionSource = this.positions?.() ?? { source: 'network', delegate: null };
      const activeDelegate = positionSource.source === 'delegate' ? (positionSource.delegate ?? null) : null;
      if (positionSource.source === 'delegate' && options.syncDelegate !== false) {
        try {
          await this.syncDelegatePositionsToNetwork();
        } catch (error) {
          console.warn('Helios.setMode(): failed to sync delegate positions back to the network before switching modes.', error);
        }
      }

      this.options.mode = nextMode;
      const nextProjection = options.projection ?? (nextMode === '3d' ? 'perspective' : 'orthographic');
      this.options.projection = nextProjection;
      let cameraControlChanged = false;
      if (nextMode !== '3d' && this._cameraControlConfig?.orbit === true) {
        this._cameraControlConfig.orbit = false;
        cameraControlChanged = true;
      }
      if (nextMode !== '3d') {
        this._invalidateCameraOrbitReference();
      }
      this._markAutoFitDirty(false);
      this._applyModeToLayoutOptions(nextMode);
      this.visuals?.seedMissingPositions?.(
        resolveSeedBoundsForLayout(this.options.layout, this.layers?.size, nextMode),
      );

      const layoutChanged = this._applyModeToActiveLayout(nextMode);
      if (
        previousMode === '2d'
        && nextMode === '3d'
        && this._layout instanceof GpuForceLayout
      ) {
        const jitterAmplitude = computeGpuForceModeSwitchDepthJitter(this._layout);
        const delegate = this._layout?.getPositionDelegate?.() ?? this._layout?.positionDelegate ?? null;
        await delegate?.injectPlanarDepthJitter?.(this._buildPositionDelegateContext({ scope: 'layout' }), jitterAmplitude);
      }
      if (layoutChanged && options.reheat !== false) {
        this._requestLayoutReheat('mode');
      }
      this._layout?.requestUpdate?.();
      this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestLayout?.('mode');
      this.scheduler?.requestRender?.();
      this._labels?.requestFullReselect?.('mode');
      this._refreshUIBindings?.();

      const camera = this.renderer?.camera ?? null;
      const animateCamera = options.animate !== false;
      if (camera) {
        const bounds = this._sampleRenderBounds(options.frame ?? {}) ?? null;
        if (nextMode === '3d') {
          const plan = this._build3DModeTransitionPoses(bounds, nextProjection);
          if (plan) {
            if (animateCamera) {
              await this._ensureCameraTransitionController().transition(camera, {
                fromPose: plan.startPose,
                toPose: plan.endPose,
                durationMs: options.cameraDurationMs ?? DEFAULT_MODE_SWITCH_DURATION_MS,
              });
            } else {
              applyCameraPose(camera, plan.endPose);
            }
          } else {
            applyCameraPose(camera, {
              ...captureCameraPose(camera),
              mode: '3d',
              projection: nextProjection,
            });
          }
        } else {
          const plan = this._build2DModeTransitionPoses(bounds);
          if (plan) {
            if (animateCamera) {
              const durationMs = options.cameraDurationMs ?? DEFAULT_MODE_SWITCH_DURATION_MS;
              const controller = this._ensureCameraTransitionController();
              await controller.transition(camera, {
                fromPose: plan.startPose,
                toPose: plan.pre2D3D,
                durationMs: durationMs * 0.7,
              });
            }
            if (options.flattenDepth !== false) {
              await this._collapseActivePositionDepthTo2DPlane(0, activeDelegate);
            }
            if (animateCamera) {
              await this._ensureCameraTransitionController().transition(camera, {
                fromPose: plan.start2DPose,
                toPose: plan.endPose,
                durationMs: (options.cameraDurationMs ?? DEFAULT_MODE_SWITCH_DURATION_MS) * 0.3,
              });
            } else {
              applyCameraPose(camera, plan.endPose);
            }
          } else {
            if (options.flattenDepth !== false) {
              await this._collapseActivePositionDepthTo2DPlane(0, activeDelegate);
            }
            applyCameraPose(camera, {
              ...captureCameraPose(camera),
              mode: '2d',
              projection: nextProjection,
            });
          }
        }
      }

      if (layoutChanged) {
        this._emitLayoutChanged(this._layout);
      }
      if (cameraControlChanged) {
        this._emitCameraControlChange();
      }
      this.emit(EVENTS.MODE_CHANGED, {
        mode: nextMode,
        previousMode,
        projection: nextProjection,
      });
      if (options.applyState !== false && typeof this.states?.set === 'function') {
        this.states.set('scene.dimension', nextMode, {
          source: options.source === 'test' ? 'program' : (options.source ?? 'program'),
          reason: options.reason ?? 'mode',
          trackOverride: options.trackOverride ?? true,
          applyBinding: false,
          debounceMs: options.debounceMs ?? 0,
          journal: options.journal ?? false,
        });
      }
      return this;
    } finally {
      if (this._cameraControlRuntime) {
        this._cameraControlRuntime.suspended = false;
      }
      this._markAutoFitDirty(false);
      this.scheduler?.requestRender?.();
    }
  }

  /**
   * Read or update the screen-space density overlay configuration.
   *
   * @public
   * @apiSection Density And Labels
   * @param {object|false|null} [options] - Density configuration, or `false`/`null` to disable the overlay.
   * @param {boolean} [options.enabled] - Enable density rendering.
   * @param {number} [options.qualityScale] - Density texture scale relative to the viewport.
   * @param {string} [options.property] - Node attribute used as the primary density weight.
   * @param {string} [options.compareProperty] - Optional comparison attribute for diverging/log-ratio density.
   * @param {string} [options.colormap] - Sequential colormap name.
   * @param {string} [options.divergingColormap] - Diverging colormap name.
   * @returns {object|Helios} Current density snapshot when omitted; otherwise this Helios instance.
   */
  density(options) {
    if (arguments.length === 0) {
      const config = this._densityConfig ?? DENSITY_DEFAULTS;
      const compareProperty = resolveDensityCompareProperty(config.property, config.compareProperty);
      const comparisonMode = resolveDensityComparisonMode(compareProperty, config.comparisonMode);
      const usesLogRatioColormap = usesLogRatioDensityColormap({ ...config, compareProperty, comparisonMode });
      const diverging = this._densityRuntime?.diverging === true || comparisonMode === 'logRatio';
      return {
        ...config,
        compareProperty,
        comparisonMode,
        diverging,
        valueDomain: Array.isArray(this._densityRuntime?.valueDomain) ? [...this._densityRuntime.valueDomain] : null,
        activeColormap: resolveDensityActiveColormap({ ...config, compareProperty, comparisonMode }, this._densityRuntime),
      };
    }

    if (options == null || options === false) {
      this._densityConfig = { ...this._densityConfig, enabled: false };
      this._densityRuntime = { ...this._densityRuntime, valueDomain: null };
      this._legendContentVersion += 1;
      this._applyDensityConfigToLayer();
      this.scheduler?.requestRender?.();
      return this;
    }

    if (typeof options !== 'object') {
      throw new TypeError('density(options) expects an object, null, or false');
    }

    const current = this._densityConfig ?? DENSITY_DEFAULTS;
    const next = { ...current };

    if (Object.prototype.hasOwnProperty.call(options, 'enabled')) next.enabled = options.enabled === true;
    if (Object.prototype.hasOwnProperty.call(options, 'density')) next.enabled = options.density === true;
    if (Object.prototype.hasOwnProperty.call(options, 'qualityScale')) {
      next.qualityScale = clamp(toFiniteNumber(options.qualityScale, next.qualityScale), 0.03, 1.0);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityScale')) {
      next.qualityScale = clamp(toFiniteNumber(options.densityScale, next.qualityScale), 0.03, 1.0);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'topographic')) next.topographic = options.topographic === true;
    if (Object.prototype.hasOwnProperty.call(options, 'scaleWithZoom')) next.scaleWithZoom = options.scaleWithZoom === true;
    if (Object.prototype.hasOwnProperty.call(options, 'densityScaleWithZoom')) {
      next.scaleWithZoom = options.densityScaleWithZoom === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityScaleByZoom')) {
      next.scaleWithZoom = options.densityScaleByZoom === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'bandwidth')) {
      next.bandwidth = clamp(toFiniteNumber(options.bandwidth, next.bandwidth), 0.05, 1000);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'weightScale')) {
      next.weightScale = clamp(toFiniteNumber(options.weightScale, next.weightScale), 0, 1e8);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityWeight')) {
      next.weightScale = clamp(toFiniteNumber(options.densityWeight, next.weightScale), 0, 1e8);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'property') && typeof options.property === 'string') {
      const trimmed = options.property.trim();
      if (trimmed) next.property = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityProperty') && typeof options.densityProperty === 'string') {
      const trimmed = options.densityProperty.trim();
      if (trimmed) next.property = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'compareProperty') && typeof options.compareProperty === 'string') {
      const trimmed = options.compareProperty.trim();
      if (trimmed) next.compareProperty = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'vsDensityProperty') && typeof options.vsDensityProperty === 'string') {
      const trimmed = options.vsDensityProperty.trim();
      if (trimmed) next.compareProperty = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'normalizeVs')) next.normalizeVs = options.normalizeVs === true;
    if (Object.prototype.hasOwnProperty.call(options, 'shallNormalizeVsDensity')) {
      next.normalizeVs = options.shallNormalizeVsDensity === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'comparisonMode')) {
      next.comparisonMode = options.comparisonMode === 'logRatio' ? 'logRatio' : 'difference';
    }
    if (Object.prototype.hasOwnProperty.call(options, 'epsilon')) {
      next.epsilon = clamp(toFiniteNumber(options.epsilon, next.epsilon), 1e-12, 1);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityEpsilon')) {
      next.epsilon = clamp(toFiniteNumber(options.densityEpsilon, next.epsilon), 1e-12, 1);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'logRatioRange')) {
      next.logRatioRange = clamp(toFiniteNumber(options.logRatioRange, next.logRatioRange), 1e-3, 1e3);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityLogRatioRange')) {
      next.logRatioRange = clamp(toFiniteNumber(options.densityLogRatioRange, next.logRatioRange), 1e-3, 1e3);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'maskThreshold')) {
      next.maskThreshold = clamp(toFiniteNumber(options.maskThreshold, next.maskThreshold), 0, 1);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityMaskThreshold')) {
      next.maskThreshold = clamp(toFiniteNumber(options.densityMaskThreshold, next.maskThreshold), 0, 1);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'logRatioZScore')) {
      next.logRatioZScore = options.logRatioZScore === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityLogRatioZScore')) {
      next.logRatioZScore = options.densityLogRatioZScore === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'logRatioSupportCorrection')) {
      next.logRatioSupportCorrection = options.logRatioSupportCorrection !== false;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityLogRatioSupportCorrection')) {
      next.logRatioSupportCorrection = options.densityLogRatioSupportCorrection !== false;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'colormap') && typeof options.colormap === 'string') {
      const trimmed = options.colormap.trim();
      if (trimmed) next.colormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityColormap') && typeof options.densityColormap === 'string') {
      const trimmed = options.densityColormap.trim();
      if (trimmed) next.colormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'divergingColormap') && typeof options.divergingColormap === 'string') {
      const trimmed = options.divergingColormap.trim();
      if (trimmed) next.divergingColormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityDivergingColormap') && typeof options.densityDivergingColormap === 'string') {
      const trimmed = options.densityDivergingColormap.trim();
      if (trimmed) next.divergingColormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'logRatioColormap') && typeof options.logRatioColormap === 'string') {
      const trimmed = options.logRatioColormap.trim();
      if (trimmed) next.logRatioColormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityLogRatioColormap') && typeof options.densityLogRatioColormap === 'string') {
      const trimmed = options.densityLogRatioColormap.trim();
      if (trimmed) next.logRatioColormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'interactionFilter') && typeof options.interactionFilter === 'string') {
      next.interactionFilter = options.interactionFilter;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityInteractionFilter') && typeof options.densityInteractionFilter === 'string') {
      next.interactionFilter = options.densityInteractionFilter;
    }

    next.compareProperty = resolveDensityCompareProperty(next.property, next.compareProperty);
    next.comparisonMode = resolveDensityComparisonMode(next.compareProperty, next.comparisonMode);

    this._densityConfig = next;
    if (next.comparisonMode !== 'logRatio') {
      this._densityRuntime = { ...this._densityRuntime, diverging: false, valueDomain: null };
    }
    this._legendContentVersion += 1;
    this._applyDensityConfigToLayer();
    this.scheduler?.requestRender?.();
    return this;
  }

  /**
   * Read or set whether the density overlay is enabled.
   *
   * @public
   * @apiSection Density And Labels
   * @param {boolean} [value] - Enable density rendering.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  densityEnabled(value) {
    if (arguments.length === 0) return this.density().enabled === true;
    return this.density({ enabled: value === true });
  }

  /**
   * Read or set the density overlay quality scale.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Texture scale relative to the viewport.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  densityScale(value) {
    if (arguments.length === 0) return this.density().qualityScale;
    return this.density({ qualityScale: value });
  }

  /**
   * Read or set whether density is rendered with topographic contours.
   *
   * @public
   * @apiSection Density And Labels
   * @param {boolean} [value] - Enable contour-style rendering.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  densityTopographic(value) {
    if (arguments.length === 0) return this.density().topographic === true;
    return this.density({ topographic: value === true });
  }

  /**
   * Read or set whether density bandwidth scales with camera zoom.
   *
   * @public
   * @apiSection Density And Labels
   * @param {boolean} [value] - Scale density evaluation with zoom.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  densityScaleWithZoom(value) {
    if (arguments.length === 0) return this.density().scaleWithZoom === true;
    return this.density({ scaleWithZoom: value === true });
  }

  /**
   * Read or set the density kernel bandwidth.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Positive kernel bandwidth.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  densityBandwidth(value) {
    if (arguments.length === 0) return this.density().bandwidth;
    return this.density({ bandwidth: value });
  }

  /**
   * Read or set the scalar multiplier applied to density weights.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Density weight multiplier.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  densityWeight(value) {
    if (arguments.length === 0) return this.density().weightScale;
    return this.density({ weightScale: value });
  }

  /**
   * Read or set the node attribute used as the primary density property.
   *
   * @public
   * @apiSection Density And Labels
   * @param {string} [value] - Node attribute name.
   * @returns {string|Helios} Current attribute name when omitted; otherwise this Helios instance.
   */
  densityProperty(value) {
    if (arguments.length === 0) return this.density().property;
    return this.density({ property: value });
  }

  /**
   * Read or set the comparison property used for diverging density views.
   *
   * @public
   * @apiSection Density And Labels
   * @param {string} [value] - Node attribute name to compare against the primary property.
   * @returns {string|Helios} Current comparison attribute when omitted; otherwise this Helios instance.
   */
  densityVsProperty(value) {
    if (arguments.length === 0) return this.density().compareProperty;
    return this.density({ compareProperty: value });
  }

  /**
   * Read or set whether comparison density values are normalized before differencing.
   *
   * @public
   * @apiSection Density And Labels
   * @param {boolean} [value] - Normalize comparison density.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  densityNormalizeVs(value) {
    if (arguments.length === 0) return this.density().normalizeVs === true;
    return this.density({ normalizeVs: value === true });
  }

  /**
   * Read or set the sequential colormap used by the density overlay.
   *
   * @public
   * @apiSection Density And Labels
   * @param {string} [value] - Colormap name.
   * @returns {string|Helios} Current colormap when omitted; otherwise this Helios instance.
   */
  densityColormap(value) {
    if (arguments.length === 0) return this.density().colormap;
    return this.density({ colormap: value });
  }

  /**
   * Read or set the diverging colormap used by comparison density overlays.
   *
   * @public
   * @apiSection Density And Labels
   * @param {string} [value] - Diverging colormap name.
   * @returns {string|Helios} Current colormap when omitted; otherwise this Helios instance.
   */
  densityDivergingColormap(value) {
    if (arguments.length === 0) return this.density().divergingColormap;
    return this.density({ divergingColormap: value });
  }

  /**
   * Request a density overlay update on the next render frame.
   *
   * @public
   * @apiSection Density And Labels
   * @returns {Helios} This Helios instance.
   */
  updateDensityMap() {
    this.scheduler?.requestRender?.();
    return this;
  }

  /**
   * Alias for `updateDensityMap()`.
   *
   * @public
   * @apiSection Density And Labels
   * @returns {Helios} This Helios instance.
   */
  redrawDensityMap() {
    this.scheduler?.requestRender?.();
    return this;
  }

  /**
   * Read or set the edge transparency compositing mode.
   *
   * @public
   * @apiSection Appearance
   * @param {string} [mode] - Transparency mode supported by the active renderer.
   * @returns {string|Helios} Current mode when omitted; otherwise this Helios instance.
   */
  edgeTransparencyMode(mode) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeTransparencyMode');
    const next = String(mode ?? '');
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (graphLayer?.isSupportedTransparencyMode && !graphLayer.isSupportedTransparencyMode(next)) {
      return this;
    }
    return this._setGraphLayerProp('edgeTransparencyMode', next);
  }

  /**
   * Read or update label rendering options.
   *
   * @public
   * @apiSection Density And Labels
   * @param {object|null} [options] - Label options, or `null` to disable labels.
   * @param {boolean} [options.enabled] - Enable ranked or selected labels.
   * @param {'ranked'|'selected-only'} [options.selectionMode] - Label selection policy.
   * @param {number} [options.maxVisible] - Maximum number of labels to render.
   * @param {string|Function} [options.source] - Attribute name or callback used for label text.
   * @returns {object|Helios} Current label configuration when omitted; otherwise this Helios instance.
   */
  labels(options) {
    const labelsBehavior = this.behavior?.labels ?? null;
    if (arguments.length === 0) {
      return labelsBehavior?.labels?.() ?? this._getLabelsControllerConfig();
    }
    if (labelsBehavior) {
      labelsBehavior.labels(options);
      return this;
    }
    return this._applyLabelsControllerConfig(options == null ? { enabled: false, hoveredNodeEnabled: false } : options);
  }

  _getLabelsControllerConfig() {
    return this._labels?.getConfig?.() ?? { enabled: false };
  }

  _applyLabelsControllerConfig(options, { silent = false } = {}) {
    if (options == null) {
      this._labels?.setConfig?.({ enabled: false, hoveredNodeEnabled: false });
    } else if (typeof options === 'object') {
      this._labels?.setConfig?.(options);
    } else {
      throw new TypeError('labels(options) expects an object or null');
    }
    this._labels?.requestFullReselect?.('api');
    this.scheduler?.requestRender?.();
    if (!silent) this._refreshUIBindings();
    return this;
  }

  _getLegendsControllerConfig() {
    return this._legends?.getConfig?.() ?? { enabled: true };
  }

  _applyLegendsControllerConfig(options, { silent = false } = {}) {
    if (options === false || options == null) {
      this._legends?.setConfig?.({ enabled: false });
    } else if (typeof options === 'object') {
      this._legends?.setConfig?.(options);
    } else {
      throw new TypeError('legends(options) expects an object, false, or null');
    }
    this.scheduler?.requestRender?.();
    if (!silent) this._refreshUIBindings();
    return this;
  }

  _getLegendItems(options = {}) {
    return this._legends?.deriveItems?.(options) ?? [];
  }

  /**
   * Read or update legend rendering options.
   *
   * @public
   * @apiSection Density And Labels
   * @param {object|false|null} [options] - Legend configuration, or `false`/`null` to disable legends.
   * @param {boolean} [options.enabled] - Enable legend rendering.
   * @returns {object|Helios} Current legend configuration when omitted; otherwise this Helios instance.
   */
  legends(options) {
    const legendsBehavior = this.behavior?.legends ?? null;
    if (arguments.length === 0) {
      return legendsBehavior?.legends?.() ?? this._getLegendsControllerConfig();
    }
    if (legendsBehavior) {
      legendsBehavior.legends(options);
      return this;
    }
    return this._applyLegendsControllerConfig(options);
  }

  /**
   * Read or set whether legends are enabled.
   *
   * @public
   * @apiSection Density And Labels
   * @param {boolean} [value] - Enable legends.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  legendsEnabled(value) {
    if (arguments.length === 0) return this.legends()?.enabled === true;
    return this.legends({ enabled: value === true });
  }

  _quickControlsStyleText() {
    return `
.helios-quick-controls {
  --helios-quick-bg: rgba(12, 14, 18, 0.72);
  --helios-quick-bg-solid: rgba(12, 14, 18, 0.94);
  --helios-quick-fg: rgba(244, 246, 250, 0.92);
  --helios-quick-border: color-mix(in srgb, var(--helios-quick-fg) 12%, transparent);
  --helios-quick-accent: #38bdf8;
  --helios-quick-shadow: 0 12px 30px rgba(0, 0, 0, 0.25);
  --helios-quick-blur: 14px;
  position: absolute;
  z-index: 40;
  display: grid;
  gap: var(--helios-quick-gap, 8px);
  pointer-events: none;
  font: 700 15px/1 var(--helios-ui-font, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
}
.helios-quick-controls[data-theme="light"] {
  --helios-quick-bg: rgba(247, 247, 249, 0.78);
  --helios-quick-bg-solid: rgba(247, 247, 249, 0.97);
  --helios-quick-fg: #1f2328;
  --helios-quick-border: #e6e6ea;
  --helios-quick-accent: #5e7cb9;
  --helios-quick-shadow: 0 12px 30px rgba(31, 35, 40, 0.12);
}
.helios-quick-controls__button {
  width: var(--helios-quick-size, 44px);
  height: var(--helios-quick-size, 44px);
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--helios-quick-accent) 38%, var(--helios-quick-border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--helios-quick-accent) 16%, var(--helios-quick-bg-solid));
  color: var(--helios-quick-fg);
  box-shadow: var(--helios-quick-shadow);
  backdrop-filter: blur(var(--helios-quick-blur));
  -webkit-backdrop-filter: blur(var(--helios-quick-blur));
  cursor: pointer;
  pointer-events: auto;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}
.helios-quick-controls__button:hover,
.helios-quick-controls__button:focus-visible,
.helios-quick-controls__button.is-active {
  border-color: color-mix(in srgb, var(--helios-quick-accent) 55%, var(--helios-quick-border));
  background: color-mix(in srgb, var(--helios-quick-accent) 22%, var(--helios-quick-bg-solid));
  color: var(--helios-quick-fg);
  outline: none;
}
.helios-quick-controls__button:focus-visible {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--helios-quick-accent) 22%, transparent), var(--helios-quick-shadow);
}
.helios-quick-controls__button.is-active {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--helios-quick-accent) 28%, transparent), var(--helios-quick-shadow);
}
.helios-quick-controls__button svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 2.25;
}
.helios-quick-controls__button--layout svg {
  fill: currentColor;
  stroke: none;
}
.helios-quick-controls__button--zoom {
  font-size: 21px;
  font-weight: 700;
}
.helios-quick-controls__button--helios svg {
  width: 20px;
  height: 20px;
  fill: currentColor;
  stroke: currentColor;
}
.helios-quick-controls__menu {
  position: absolute;
  top: 0;
  right: calc(var(--helios-quick-size, 44px) + var(--helios-quick-gap, 8px) + 4px);
  min-width: 172px;
  display: grid;
  gap: 4px;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--helios-quick-accent) 32%, var(--helios-quick-border));
  border-radius: 10px;
  background: var(--helios-quick-bg-solid);
  box-shadow: var(--helios-quick-shadow);
  backdrop-filter: blur(var(--helios-quick-blur));
  -webkit-backdrop-filter: blur(var(--helios-quick-blur));
  pointer-events: auto;
}
.helios-quick-controls__menu[hidden] {
  display: none;
}
.helios-quick-controls__menu-button {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--helios-quick-fg);
  font: 600 12px/1.1 var(--helios-ui-font, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  text-align: left;
  cursor: pointer;
}
.helios-quick-controls__menu-button:hover,
.helios-quick-controls__menu-button:focus-visible {
  background: color-mix(in srgb, var(--helios-quick-accent) 18%, transparent);
  outline: none;
}
`;
  }

  _quickControlButton(doc, { name, label, className = '', html = '', text = '' }) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `helios-quick-controls__button ${className}`.trim();
    button.dataset.heliosQuickControl = name;
    button.setAttribute('aria-label', label);
    button.title = label;
    if (html) button.innerHTML = html;
    else button.textContent = text;
    return button;
  }

  _quickControlsHeliosIconMarkup() {
    return `
<svg viewBox="0 0 600 600" aria-hidden="true">
  <path d="M245 331 124 103" fill="none" stroke-width="32" />
  <path d="M245 331 62 482" fill="none" stroke-width="22" />
  <path d="M279 358 482 495" fill="none" stroke-width="30" />
  <circle cx="245" cy="331" r="104" stroke="none" />
  <circle cx="124" cy="103" r="58" stroke="none" />
  <circle cx="480" cy="493" r="58" stroke="none" />
  <circle cx="62" cy="478" r="27" stroke="none" />
  <path d="M367 331a122 122 0 1 1-122-122v-34a156 156 0 1 0 156 156h-34Z" stroke="none" />
  <path d="M533 54h36v278h-36zM281 175h287v34H281zM367 54h34v241h-34z" stroke="none" />
</svg>`;
  }

  _quickControlsMenuButton(doc, { label, url }) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'helios-quick-controls__menu-button';
    button.dataset.url = url;
    button.setAttribute('role', 'menuitem');
    button.textContent = label;
    return button;
  }

  _openQuickControlUrl(url) {
    const win = this.layers?.root?.ownerDocument?.defaultView ?? globalThis.window ?? globalThis;
    const opened = typeof win?.open === 'function'
      ? win.open(url, '_blank', 'noopener,noreferrer')
      : null;
    if (opened && typeof opened === 'object') opened.opener = null;
    return opened;
  }

  _setupQuickControls() {
    const config = this._quickControlsConfig ?? QUICK_CONTROL_DEFAULTS;
    if (config.enabled !== true || !this.layers?.root) {
      this._setQuickControlsOverlayInsets({ top: 0, right: 0, bottom: 0, left: 0 });
      return null;
    }
    const doc = this.layers.root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.createElement !== 'function') return null;

    this._destroyQuickControls();

    const root = doc.createElement('div');
    root.className = 'helios-quick-controls';
    root.dataset.theme = this._resolveQuickControlsTheme();
    root.style.setProperty('--helios-quick-size', `${config.buttonSize}px`);
    root.style.setProperty('--helios-quick-gap', `${config.gap}px`);

    const style = doc.createElement('style');
    style.textContent = this._quickControlsStyleText();
    root.appendChild(style);

    const buttons = {};
    let heliosMenu = null;
    buttons.helios = this._quickControlButton(doc, {
      name: 'helios',
      label: 'Helios links',
      className: 'helios-quick-controls__button--helios',
      html: this._quickControlsHeliosIconMarkup(),
    });
    buttons.helios.setAttribute('aria-haspopup', 'menu');
    buttons.helios.setAttribute('aria-expanded', 'false');
    root.appendChild(buttons.helios);
    heliosMenu = doc.createElement('div');
    heliosMenu.className = 'helios-quick-controls__menu';
    heliosMenu.setAttribute('role', 'menu');
    heliosMenu.hidden = true;
    const websiteButton = this._quickControlsMenuButton(doc, {
      label: 'Go to heliosweb.io',
      url: QUICK_CONTROL_HELIOS_URL,
    });
    const issueButton = this._quickControlsMenuButton(doc, {
      label: 'Report a problem',
      url: QUICK_CONTROL_ISSUE_URL,
    });
    heliosMenu.appendChild(websiteButton);
    heliosMenu.appendChild(issueButton);
    root.appendChild(heliosMenu);
    if (config.autoFit) {
      buttons.autoFit = this._quickControlButton(doc, {
        name: 'auto-fit',
        label: 'Toggle automatic fit',
        className: 'helios-quick-controls__button--fit',
        html: `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M8 4H4v4" />
  <path d="M16 4h4v4" />
  <path d="M20 16v4h-4" />
  <path d="M4 16v4h4" />
</svg>`,
      });
      root.appendChild(buttons.autoFit);
    }
    if (config.layout) {
      buttons.layout = this._quickControlButton(doc, {
        name: 'layout',
        label: 'Pause layout',
        className: 'helios-quick-controls__button--layout',
      });
      root.appendChild(buttons.layout);
    }
    if (config.zoom) {
      buttons.zoomIn = this._quickControlButton(doc, {
        name: 'zoom-in',
        label: 'Zoom in',
        className: 'helios-quick-controls__button--zoom',
        text: '+',
      });
      buttons.zoomOut = this._quickControlButton(doc, {
        name: 'zoom-out',
        label: 'Zoom out',
        className: 'helios-quick-controls__button--zoom',
        text: '-',
      });
      root.appendChild(buttons.zoomIn);
      root.appendChild(buttons.zoomOut);
    }

    const addCleanup = (cleanup) => {
      if (typeof cleanup === 'function') this._quickControlCleanups.push(cleanup);
    };
    const listenButton = (button, type, handler) => {
      if (!button || typeof button.addEventListener !== 'function') return;
      button.addEventListener(type, handler);
      addCleanup(() => button.removeEventListener?.(type, handler));
    };

    const setHeliosMenuOpen = (open) => {
      if (!heliosMenu || !buttons.helios) return;
      heliosMenu.hidden = open !== true;
      buttons.helios.setAttribute('aria-expanded', open === true ? 'true' : 'false');
      buttons.helios.classList?.toggle?.('is-active', open === true);
    };
    const openMenuUrl = (url) => {
      setHeliosMenuOpen(false);
      this._openQuickControlUrl(url);
    };

    listenButton(buttons.helios, 'click', (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      setHeliosMenuOpen(heliosMenu?.hidden === true);
    });
    listenButton(websiteButton, 'click', () => openMenuUrl(QUICK_CONTROL_HELIOS_URL));
    listenButton(issueButton, 'click', () => openMenuUrl(QUICK_CONTROL_ISSUE_URL));
    listenButton(buttons.autoFit, 'click', () => {
      const next = this.cameraControls?.().autoFit !== true;
      this.cameraControls?.({ autoFit: next, followTarget: false, targetNodeIndices: null });
      this._syncQuickControls();
      if (next) {
        this.requestFrameNetwork?.({
          animate: this._cameraControlConfig?.animation === true,
          resetOrientation: this.mode?.() === '3d',
        });
      }
    });
    listenButton(buttons.layout, 'click', () => {
      const running = this._quickControlsLayoutRunning();
      if (running) this.stopLayout?.('quick-controls');
      else this.startLayout?.();
      this._syncQuickControls();
    });
    listenButton(buttons.zoomIn, 'click', () => this._applyQuickZoom(1));
    listenButton(buttons.zoomOut, 'click', () => this._applyQuickZoom(-1));

    addCleanup(this.on?.(EVENTS.CAMERA_CONTROL_CHANGE, () => this._syncQuickControls()));
    addCleanup(this.on?.(EVENTS.LAYOUT_START, () => this._syncQuickControls()));
    addCleanup(this.on?.(EVENTS.LAYOUT_STOP, () => this._syncQuickControls()));
    addCleanup(this.on?.(EVENTS.LAYOUT_CHANGED, () => this._syncQuickControls()));
    if (typeof doc.addEventListener === 'function') {
      const closeHeliosMenu = (event) => {
        if (heliosMenu?.hidden === true) return;
        const target = event?.target ?? null;
        if (target && typeof root.contains === 'function' && root.contains(target)) return;
        setHeliosMenuOpen(false);
      };
      doc.addEventListener('pointerdown', closeHeliosMenu);
      addCleanup(() => doc.removeEventListener?.('pointerdown', closeHeliosMenu));
    }

    if (typeof this.layers.addLayer === 'function') this.layers.addLayer('quick-controls', root);
    else this.layers.root.appendChild(root);
    this._quickControls = { root, buttons };
    this._updateQuickControlsPlacement();
    this._updateQuickControlsOverlayInsets();
    this._syncQuickControls();
    return root;
  }

  _resolveQuickControlsTheme() {
    const uiTheme = typeof this.ui?.theme === 'string' && this.ui.theme ? this.ui.theme : null;
    return uiTheme ?? this._quickControlsConfig?.theme ?? QUICK_CONTROL_DEFAULTS.theme;
  }

  _syncQuickControlsTheme(theme = null) {
    const root = this._quickControls?.root ?? null;
    if (!root) return this;
    root.dataset.theme = (typeof theme === 'string' && theme) ? theme : this._resolveQuickControlsTheme();
    return this;
  }

  _destroyQuickControls() {
    for (const cleanup of this._quickControlCleanups ?? []) cleanup?.();
    this._quickControlCleanups = [];
    if (this._quickControls?.root) {
      if (typeof this.layers?.removeLayer === 'function') this.layers.removeLayer('quick-controls');
      else this._quickControls.root.remove?.();
    }
    this._quickControls = null;
    this._setQuickControlsOverlayInsets({ top: 0, right: 0, bottom: 0, left: 0 });
  }

  _quickControlsLayoutRunning() {
    const scheduler = this.scheduler ?? null;
    const state = typeof scheduler?.getLayoutState === 'function'
      ? scheduler.getLayoutState()
      : (scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
    return state !== 'stopped';
  }

  _syncQuickControls() {
    const buttons = this._quickControls?.buttons ?? {};
    if (buttons.autoFit) {
      const active = this.cameraControls?.().autoFit === true;
      buttons.autoFit.classList?.toggle?.('is-active', active);
      buttons.autoFit.setAttribute?.('aria-pressed', String(active));
      const label = active ? 'Auto fit is on' : 'Auto fit is off';
      buttons.autoFit.title = label;
      buttons.autoFit.setAttribute?.('aria-label', label);
    }
    if (buttons.layout) {
      const running = this._quickControlsLayoutRunning();
      buttons.layout.classList?.toggle?.('is-active', running);
      buttons.layout.setAttribute?.('aria-pressed', String(running));
      const label = running ? 'Pause layout' : 'Run layout';
      buttons.layout.title = label;
      buttons.layout.setAttribute?.('aria-label', label);
      buttons.layout.innerHTML = running
        ? `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <rect x="7" y="5" width="3.6" height="14" rx="0.9" />
  <rect x="13.4" y="5" width="3.6" height="14" rx="0.9" />
</svg>`
        : `
<svg viewBox="0 0 24 24" aria-hidden="true">
  <path d="M8 5.5v13l10-6.5Z" />
</svg>`;
    }
    this._syncQuickControlsTheme();
  }

  _applyQuickZoom(direction) {
    const camera = this.renderer?.camera ?? null;
    if (!camera) return false;
    const factor = this._quickControlsConfig?.zoomFactor ?? QUICK_CONTROL_DEFAULTS.zoomFactor;
    const scale = direction >= 0 ? factor : (1 / factor);
    const pose = this.cameraPose?.() ?? captureCameraPose(camera);
    if (pose?.mode === '3d') {
      const current = Number.isFinite(pose.distance) ? pose.distance : Number(camera.distance);
      if (!Number.isFinite(current)) return false;
      const min = Math.max(1e-6, Number(camera.minDistance ?? 1e-6));
      const max = Math.max(min, Number(camera.maxDistance ?? Number.POSITIVE_INFINITY));
      const nextDistance = clamp(current / scale, min, max);
      if (Math.abs(nextDistance - current) <= 1e-9) return false;
      this.setCameraPose?.({ distance: nextDistance }, { source: 'ui' });
    } else {
      const current = Number.isFinite(pose?.zoom) ? pose.zoom : Number(camera.zoom);
      if (!Number.isFinite(current)) return false;
      const min = Math.max(1e-6, Number(camera.minZoom ?? 1e-6));
      const max = Math.max(min, Number(camera.maxZoom ?? Number.POSITIVE_INFINITY));
      const nextZoom = clamp(current * scale, min, max);
      if (Math.abs(nextZoom - current) <= 1e-9) return false;
      this.setCameraPose?.({ zoom: nextZoom }, { source: 'ui' });
    }
    this._syncQuickControls();
    return true;
  }

  _updateQuickControlsPlacement() {
    const root = this._quickControls?.root ?? null;
    if (!root?.style) return;
    const config = this._quickControlsConfig ?? QUICK_CONTROL_DEFAULTS;
    const overlay = normalizeInsets(this._baseOverlayInsets);
    const viewport = normalizeInsets(this.layers?.viewportInsets);
    const placement = {
      top: Math.max(overlay.top, viewport.top),
      right: Math.max(overlay.right, viewport.right),
      bottom: Math.max(overlay.bottom, viewport.bottom),
      left: Math.max(overlay.left, viewport.left),
    };
    root.style.top = `${placement.top + config.margin}px`;
    root.style.right = `${placement.right + config.margin}px`;
  }

  _updateQuickControlsOverlayInsets() {
    const config = this._quickControlsConfig ?? QUICK_CONTROL_DEFAULTS;
    if (config.enabled !== true || config.reserveLegendSpace !== true || !this._quickControls?.root) {
      this._setQuickControlsOverlayInsets({ top: 0, right: 0, bottom: 0, left: 0 });
      return;
    }
    this._setQuickControlsOverlayInsets({
      top: 0,
      right: config.margin + config.buttonSize + config.gap + config.legendOffset,
      bottom: 0,
      left: 0,
    });
  }

  _setQuickControlsOverlayInsets(insets) {
    this._quickControlsOverlayInsets = normalizeInsets(insets);
    this._applyOverlayInsets();
  }

  _applyOverlayInsets() {
    const next = mergeOverlayInsets(this._baseOverlayInsets, this._quickControlsOverlayInsets);
    const prev = this._overlayInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    if (
      prev.top === next.top
      && prev.right === next.right
      && prev.bottom === next.bottom
      && prev.left === next.left
    ) {
      this._updateQuickControlsPlacement();
      return this;
    }
    this._overlayInsets = next;
    this._updateQuickControlsPlacement();
    this.scheduler?.requestRender?.();
    return this;
  }

  /**
   * Read or set reserved viewport insets for overlays such as labels and legends.
   *
   * @public
   * @apiSection Density And Labels
   * @param {object} [insets] - Insets in CSS pixels.
   * @param {number} [insets.top] - Top inset.
   * @param {number} [insets.right] - Right inset.
   * @param {number} [insets.bottom] - Bottom inset.
   * @param {number} [insets.left] - Left inset.
   * @returns {object|Helios} Current inset object when omitted; otherwise this Helios instance.
   */
  overlayInsets(insets) {
    if (arguments.length === 0) return { ...this._overlayInsets };
    const next = normalizeInsets(insets);
    const prev = this._baseOverlayInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    if (
      prev.top === next.top
      && prev.right === next.right
      && prev.bottom === next.bottom
      && prev.left === next.left
    ) {
      return this;
    }
    this._baseOverlayInsets = next;
    return this._applyOverlayInsets();
  }

  /**
   * Read or set whether labels are enabled.
   *
   * @public
   * @apiSection Density And Labels
   * @param {boolean} [value] - Enable labels.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsEnabled(value) {
    const labelsBehavior = this.behavior?.labels ?? null;
    if (arguments.length === 0) return labelsBehavior?.enabled?.() ?? (this.labelsMode() !== 'off');
    labelsBehavior?.enabled?.(value);
    if (labelsBehavior) return this;
    return this.labelsMode(value === true ? 'auto' : 'off');
  }

  /**
   * Read or set the label selection mode.
   *
   * @public
   * @apiSection Density And Labels
   * @param {'auto'|'selected-only'|'off'} [value] - Label mode.
   * @returns {string|Helios} Current mode when omitted; otherwise this Helios instance.
   */
  labelsMode(value) {
    const labelsBehavior = this.behavior?.labels ?? null;
    if (arguments.length === 0) {
      if (labelsBehavior) return labelsBehavior.mode();
      const labels = this.labels?.() ?? { enabled: false };
      if (labels.enabled !== true) return 'off';
      return labels.selectionMode === 'selected-only' ? 'selected-only' : 'auto';
    }
    if (labelsBehavior) {
      labelsBehavior.mode(value);
      return this;
    }
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'selected' || raw === 'selected-only' || raw === 'selected_only') {
      return this.labels({ enabled: true, selectionMode: 'selected-only' });
    }
    if (raw === 'off' || raw === 'none' || raw === 'disabled' || raw === 'false') {
      return this.labels({ enabled: false });
    }
    return this.labels({ enabled: true, selectionMode: 'ranked' });
  }

  /**
   * Read or set the maximum number of visible labels.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Maximum label count.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsMaxVisible(value) {
    if (arguments.length === 0) return Number(this.labels()?.maxVisible ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ maxVisible: Math.max(0, Math.floor(numeric)) });
  }

  /**
   * Read or set whether selected-only labels still avoid spatial collisions.
   *
   * @public
   * @apiSection Density And Labels
   * @param {boolean} [value] - Enable collision-aware selected labels.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsSelectedOnlySpaceAware(value) {
    if (arguments.length === 0) return this.labels()?.selectedOnlySpaceAware === true;
    return this.labels({ selectedOnlySpaceAware: value === true });
  }

  /**
   * Read or set the label font-size multiplier.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Font-size scale.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsFontSizeScale(value) {
    if (arguments.length === 0) return Number(this.labels()?.fontSizeScale ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ fontSizeScale: Math.max(0.25, numeric) });
  }

  /**
   * Read or set the minimum on-screen node radius required for label candidates.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Minimum radius in CSS pixels.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsMinScreenRadius(value) {
    if (arguments.length === 0) return Number(this.labels()?.minScreenRadiusPx ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ minScreenRadiusPx: Math.max(0, numeric) });
  }

  /**
   * Read or set label outline width.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Outline width in CSS pixels.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsOutlineWidth(value) {
    if (arguments.length === 0) return Number(this.labels()?.outlineWidth ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ outlineWidth: Math.max(0, numeric) });
  }

  /**
   * Read or set the radial node-size multiplier used to offset labels.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Offset radius multiplier.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsOffsetRadiusFactor(value) {
    if (arguments.length === 0) return Number(this.labels()?.offsetRadiusFactor ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ offsetRadiusFactor: numeric });
  }

  /**
   * Read or set the fixed pixel offset added to label placement.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Offset in CSS pixels.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsOffsetPx(value) {
    if (arguments.length === 0) return Number(this.labels()?.offsetPx ?? 4);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ offsetPx: numeric });
  }

  /**
   * Read or set the maximum number of characters per label row.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Maximum characters, or zero for no truncation.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsMaxChars(value) {
    if (arguments.length === 0) return Number(this.labels()?.maxChars ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ maxChars: Math.max(0, Math.floor(numeric)) });
  }

  /**
   * Read or set the maximum number of rows per wrapped label.
   *
   * @public
   * @apiSection Density And Labels
   * @param {number} [value] - Maximum rows.
   * @returns {number|Helios} Current value when omitted; otherwise this Helios instance.
   */
  labelsMaxRows(value) {
    if (arguments.length === 0) return Number(this.labels()?.maxRows ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ maxRows: Math.max(1, Math.floor(numeric)) });
  }

  /**
   * Read or set label fill color.
   *
   * @public
   * @apiSection Density And Labels
   * @param {string|Array<number>} [color] - CSS color string or normalized RGBA tuple.
   * @returns {string|Array<number>|Helios|null} Current color when omitted; otherwise this Helios instance.
   */
  labelFill(color) {
    if (arguments.length === 0) return this.labels()?.fill ?? null;
    if (typeof color === 'string' && color.trim()) return this.labels({ fill: color.trim() });
    const normalized = normalizeColorInput(color);
    if (normalized) return this.labels({ fill: normalized });
    throw new Error('labelFill(color) expects a CSS color string or [r,g,b(,a)]');
  }

  /**
   * Read or set label outline color.
   *
   * @public
   * @apiSection Density And Labels
   * @param {string|Array<number>} [color] - CSS color string or normalized RGBA tuple.
   * @returns {string|Array<number>|Helios|null} Current color when omitted; otherwise this Helios instance.
   */
  labelOutlineColor(color) {
    if (arguments.length === 0) return this.labels()?.outlineColor ?? null;
    if (typeof color === 'string' && color.trim()) return this.labels({ outlineColor: color.trim() });
    const normalized = normalizeColorInput(color);
    if (normalized) return this.labels({ outlineColor: normalized });
    throw new Error('labelOutlineColor(color) expects a CSS color string or [r,g,b(,a)]');
  }

  /**
   * Read or set the CSS font-family used by labels.
   *
   * @public
   * @apiSection Density And Labels
   * @param {string} [value] - Font family string.
   * @returns {string|Helios} Current font family when omitted; otherwise this Helios instance.
   */
  labelFontFamily(value) {
    if (arguments.length === 0) return this.labels()?.fontFamily ?? '';
    const next = String(value ?? '').trim();
    return this.labels({ fontFamily: next });
  }

  /**
   * Read or set the label text source.
   *
   * @public
   * @apiSection Density And Labels
   * @param {string|Function|null} [value] - Attribute name, callback, or `null` for default labels.
   * @returns {string|Function|null|Helios} Current source when omitted; otherwise this Helios instance.
   */
  labelSource(value) {
    if (arguments.length === 0) return this.labels()?.source ?? null;
    if (typeof value === 'function') return this.labels({ source: value });
    const next = value == null ? null : String(value).trim();
    return this.labels({ source: next || null });
  }

  /**
   * Pre-runs mapper application before first render. Useful for large graphs
   * where the first geometry pass is expensive.
   * Can be awaited before `helios.ready` to shorten time to first render.
   *
   * @public
   * @apiSection Lifecycle
   * @param {object} [options] - Reserved for future prewarm controls.
   * @returns {Promise<void>} Resolves when mapper prewarm work has completed.
   */
  async prewarm(options = {}) {
    if (this.prewarmPromise) return this.prewarmPromise;
    this.debug.log('helios', 'Prewarming visuals before ready', {
      updateLegacyBuffers: false,
    });
    this.prewarmPromise = (async () => {
      if (this.mappersDirty) {
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
      }
      this.scheduler?.requestGeometry?.();
    })();
    try {
      await this.prewarmPromise;
    } catch (error) {
      this.prewarmPromise = null;
      this.debug.log('helios', 'Prewarm failed', { error });
      throw error;
    }
    return this.prewarmPromise;
  }

  /**
   * Create a layout instance from a layout option object or return an existing layout.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {object|Layout} layoutOption - Layout instance or descriptor such as `{ type: 'gpu-force' }`.
   * @returns {Layout} Layout instance bound to the current render network.
   */
  createLayout(layoutOption) {
    const layoutNetwork = this._getLayoutNetwork();
    if (isLayoutInstance(layoutOption)) {
      if (layoutNetwork && layoutOption.network !== layoutNetwork) {
        layoutOption.network = layoutNetwork;
      }
      return layoutOption;
    }
    if (layoutOption?.type === 'gpu-force' || layoutOption?.type === 'gpuforce') {
      const requestedOptions = {
        ...(layoutOption.options ?? {}),
        mode: this.options.mode ?? '3d',
        helios: this,
      };
      const gpuOptions = resolveGpuForceLayoutOptionsFromNetwork(layoutNetwork, requestedOptions);
      this.debug.log('layout', 'Using GPU force layout', { ...gpuOptions, helios: undefined });
      return new GpuForceLayout(layoutNetwork, this.visuals, gpuOptions);
    }
    if (layoutOption?.type === 'worker') {
      const workerOptions = { ...(layoutOption.options ?? {}), mode: this.options.mode ?? '3d' };
      this.debug.log('layout', 'Using worker layout', workerOptions);
      return new WorkerLayout(layoutNetwork, this.visuals, workerOptions);
    }
    if (layoutOption?.type === 'd3force3d' || layoutOption?.type === 'd3-force-3d') {
      const workerOptions = { ...(layoutOption.options ?? {}), mode: this.options.mode ?? '3d', helios: this };
      this.debug.log('layout', 'Using d3-force-3d layout', workerOptions);
      return new D3Force3DLayout(layoutNetwork, this.visuals, workerOptions);
    }
    const w = this.layers.size.width;
    const h = this.layers.size.height;
    this.debug.log('layout', 'Using static layout', { width: w, height: h });
    return new StaticLayout(layoutNetwork, this.visuals, {
      bounds: [-w * 0.5, -h * 0.5, w * 0.5, h * 0.5],
    });
  }

  /**
   * Add nodes to the backing network and initialize their visual state.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {number} count - Number of nodes to add.
   * @param {Function} [initializer] - Optional callback receiving created node ids and the visual attribute manager.
   * @returns {Uint32Array} Created node indices.
   */
  addNodes(count, initializer) {
    const nodes = this.network.addNodes(count);
    this.debug.log('helios', 'Adding nodes', { count });
    this.visuals.applyNodeDefaults(nodes);
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(this.options.layout, this.layers.size, this.options.mode));
    if (initializer) {
      initializer(nodes, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this.storage?.markNetworkDirty?.('add-nodes');
    this._markAutoFitDirty(false);
    this._layout?.syncAutoSettingsForNetwork?.();
    this.mappersDirty = true;
    this._requestLayoutReheat('data');
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('add-nodes');
    return nodes;
  }

  /**
   * Add edges to the backing network and initialize their visual state.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {Array<Array<number>>|TypedArray} edges - Edge pairs to insert.
   * @param {Function} [initializer] - Optional callback receiving created edge ids and the visual attribute manager.
   * @returns {Uint32Array} Created edge indices.
   */
  addEdges(edges, initializer) {
    const edgeIndices = this.network.addEdges(edges);
    this.debug.log('helios', 'Adding edges', { count: edgeIndices?.length ?? 0 });
    this.visuals.applyEdgeDefaults(edgeIndices);
    if (initializer) {
      initializer(edgeIndices, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this.storage?.markNetworkDirty?.('add-edges');
    this._markAutoFitDirty(false);
    this.mappersDirty = true;
    this._requestLayoutReheat('data');
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('add-edges');
    return edgeIndices;
  }

  notifyNetworkChanged({
    nodes,
    edges,
    topology = false,
    attributes = false,
    categories = false,
    reason = 'network-changed',
  } = {}) {
    const hasNodeChange = nodes != null && nodes !== false;
    const hasEdgeChange = edges != null && edges !== false;
    const nodeDefaults = hasNodeChange && nodes !== true ? nodes : null;
    const edgeDefaults = hasEdgeChange && edges !== true ? edges : null;
    const oldNodeCount = null;
    const oldEdgeCount = null;

    if (hasNodeChange) {
      this.debug.log('helios', 'Network nodes changed', { count: nodes.length ?? nodes.size ?? nodes });
      if (nodeDefaults) this.visuals.applyNodeDefaults(nodeDefaults);
      this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(this.options.layout, this.layers.size, this.options.mode));
    }
    if (hasEdgeChange) {
      this.debug.log('helios', 'Network edges changed', { count: edges.length ?? edges.size ?? edges });
      if (edgeDefaults) this.visuals.applyEdgeDefaults(edgeDefaults);
    }
    this.visuals.markPositionsDirty();
    if (hasNodeChange || hasEdgeChange || topology || attributes || categories) {
      this.storage?.markNetworkDirty?.(reason);
    }
    this._markAutoFitDirty(false);
    if (hasNodeChange || topology) {
      this._layout?.syncAutoSettingsForNetwork?.();
    }
    if (topology || attributes || categories) {
      this._refreshGraphFilterNetworks?.({ force: true, throwOnError: false });
      this._syncLayoutNetworkFromFilter?.();
    }
    this.mappersDirty = true;
    this._requestLayoutReheat('data');
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    this.scheduler.requestRender();
    this._labels?.requestFullReselect?.('network-changed');
    this.emit(EVENTS.NETWORK_REPLACED, {
      oldNetwork: this.network ?? null,
      network: this.network ?? null,
      oldNodeCount,
      oldEdgeCount,
      nodeCount: this.network?.nodeCount ?? null,
      edgeCount: this.network?.edgeCount ?? null,
      live: true,
      reason,
    });
  }

  /**
   * Read or set whether selected and highlighted items are promoted later in render order.
   *
   * @public
   * @apiSection Interaction
   * @param {boolean} [value] - Enable interaction-aware render-order promotion.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  interactionRenderOrder(value) {
    if (arguments.length === 0) return this._interactionRenderOrder?.enabled === true;
    this._interactionRenderOrder ??= {};
    this._interactionRenderOrder.enabled = value === true;
    this.options ??= {};
    this.options.interactionRenderOrder = this._interactionRenderOrder.enabled;
    this._emitUIBindingChange?.('interactionRenderOrder', this._interactionRenderOrder.enabled);
    if (this._interactionRenderOrder.enabled) this._reprioritizePersistentInteractionRenderOrder?.();
    this.scheduler?.requestRender?.();
    return this;
  }

  _shouldPromoteInteractionRenderOrder() {
    return this._interactionRenderOrder?.enabled === true;
  }

  _promoteInteractionNodes(indices, options = {}) {
    if (!this._shouldPromoteInteractionRenderOrder() || !indices) return null;
    const network = this._getRenderNetwork?.() ?? this.network ?? null;
    if (typeof network?.promoteActiveNodesToRenderEnd !== 'function') return null;
    const result = network.promoteActiveNodesToRenderEnd(indices);
    if (result?.changed) this.scheduler?.requestRender?.();
    if (
      options.connectedEdges === true
      && typeof network.promoteActiveEdgesForNodesToRenderEnd === 'function'
    ) {
      const edgeResult = network.promoteActiveEdgesForNodesToRenderEnd(indices, { direction: options.direction ?? 'both' });
      if (edgeResult?.changed) this.scheduler?.requestRender?.();
    }
    return result;
  }

  _promoteInteractionEdges(indices) {
    if (!this._shouldPromoteInteractionRenderOrder() || !indices) return null;
    const network = this._getRenderNetwork?.() ?? this.network ?? null;
    if (typeof network?.promoteActiveEdgesToRenderEnd !== 'function') return null;
    const result = network.promoteActiveEdgesToRenderEnd(indices);
    if (result?.changed) this.scheduler?.requestRender?.();
    return result;
  }

  _reprioritizePersistentInteractionRenderOrder() {
    if (!this._shouldPromoteInteractionRenderOrder()) return;
    const highlighted = this._highlightUnion ?? null;
    if (highlighted?.nodes?.size) {
      this._promoteInteractionNodes(Array.from(highlighted.nodes), {
        connectedEdges: this._interactionRenderOrder?.promoteHighlightedConnectedEdges === true && this._highlightConnectedEdges === true,
      });
    }
    if (highlighted?.edges?.size) this._promoteInteractionEdges(Array.from(highlighted.edges));
    const selection = this.behaviors?.get?.('selection')?.state ?? null;
    if (selection?.selectedNodes?.size) {
      this._promoteInteractionNodes(Array.from(selection.selectedNodes), {
        connectedEdges: this._interactionRenderOrder?.promoteSelectedConnectedEdges !== false
          && this.renderer?.graphLayer?.propagateSelectedNodesToEdges === true,
      });
    }
    if (selection?.selectedEdges?.size) this._promoteInteractionEdges(Array.from(selection.selectedEdges));
  }

  /**
   * Apply a state bitmask to node indices.
   *
   * @public
   * @apiSection Interaction
   * @param {Array<number>|TypedArray|number} indices - Node indices to update.
   * @param {number|string|Array<string>} mask - State bitmask or named state such as `SELECTED` or `HIGHLIGHTED`.
   * @param {object} [options] - State update options.
   * @param {'replace'|'add'|'remove'|'toggle'} [options.mode='replace'] - How to combine the mask with the existing state.
   * @returns {Helios} This Helios instance.
   */
  nodeState(indices, mask, options = {}) {
    const mode = options.mode ?? 'replace';
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    this.network.withBufferAccess(() => {
      const view = this.network.getNodeAttributeBuffer(NODE_STATE_ATTRIBUTE)?.view;
      if (!view) return;
      const usesBigInt = typeof view[0] === 'bigint';
      const valueBig = usesBigInt ? BigInt(value) : null;
      forEachIndex(indices, (index) => {
        const id = Number(index);
        if (!Number.isFinite(id) || id < 0) return;
        const current = view[id] ?? (usesBigInt ? 0n : 0);
        switch (mode) {
          case 'add':
            view[id] = usesBigInt ? (current | valueBig) : ((current | value) >>> 0);
            break;
          case 'remove':
            view[id] = usesBigInt ? (current & (~valueBig)) : ((current & (~value)) >>> 0);
            break;
          case 'toggle':
            view[id] = usesBigInt ? (current ^ valueBig) : ((current ^ value) >>> 0);
            break;
          default:
            view[id] = usesBigInt ? valueBig : value;
            break;
        }
      });
      this.visuals.bumpNodeAttributes(NODE_STATE_ATTRIBUTE);
    });
    if (mode !== 'remove' && (value & this.constructor.STATES.HIGHLIGHTED) !== 0) {
      this._promoteInteractionNodes?.(indices, {
        connectedEdges: this._interactionRenderOrder?.promoteHighlightedConnectedEdges === true && this._highlightConnectedEdges === true,
      });
      this._reprioritizePersistentInteractionRenderOrder?.();
    }
    if (mode !== 'remove' && (value & this.constructor.STATES.SELECTED) !== 0) {
      this._promoteInteractionNodes?.(indices, {
        connectedEdges: this._interactionRenderOrder?.promoteSelectedConnectedEdges !== false
          && this.renderer?.graphLayer?.propagateSelectedNodesToEdges === true,
      });
    }
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('node-state');
    return this;
  }

  /**
   * Apply a state bitmask to edge indices.
   *
   * @public
   * @apiSection Interaction
   * @param {Array<number>|TypedArray|number} indices - Edge indices to update.
   * @param {number|string|Array<string>} mask - State bitmask or named state such as `SELECTED` or `HIGHLIGHTED`.
   * @param {object} [options] - State update options.
   * @param {'replace'|'add'|'remove'|'toggle'} [options.mode='replace'] - How to combine the mask with the existing state.
   * @returns {Helios} This Helios instance.
   */
  edgeState(indices, mask, options = {}) {
    const mode = options.mode ?? 'replace';
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    this.network.withBufferAccess(() => {
      const view = this.network.getEdgeAttributeBuffer(EDGE_STATE_ATTRIBUTE)?.view;
      if (!view) return;
      const usesBigInt = typeof view[0] === 'bigint';
      const valueBig = usesBigInt ? BigInt(value) : null;
      forEachIndex(indices, (index) => {
        const id = Number(index);
        if (!Number.isFinite(id) || id < 0) return;
        const current = view[id] ?? (usesBigInt ? 0n : 0);
        switch (mode) {
          case 'add':
            view[id] = usesBigInt ? (current | valueBig) : ((current | value) >>> 0);
            break;
          case 'remove':
            view[id] = usesBigInt ? (current & (~valueBig)) : ((current & (~value)) >>> 0);
            break;
          case 'toggle':
            view[id] = usesBigInt ? (current ^ valueBig) : ((current ^ value) >>> 0);
            break;
          default:
            view[id] = usesBigInt ? valueBig : value;
            break;
        }
      });
      this.visuals.bumpEdgeAttributes(EDGE_STATE_ATTRIBUTE);
    });
    if (mode !== 'remove' && (value & (this.constructor.STATES.HIGHLIGHTED | this.constructor.STATES.SELECTED)) !== 0) {
      this._promoteInteractionEdges?.(indices);
      if ((value & this.constructor.STATES.HIGHLIGHTED) !== 0) this._reprioritizePersistentInteractionRenderOrder?.();
    }
    this.scheduler.requestGeometry();
    return this;
  }

  /**
   * Set transient hover state for a node.
   *
   * @public
   * @apiSection Interaction
   * @param {number|null} index - Hovered node index, or `null` to clear.
   * @param {number|string|Array<string>} [mask='HOVERED'] - State mask applied while hovered.
   * @returns {Helios} This Helios instance.
   */
  hoverNodeState(index, mask) {
    const resolvedIndex = index == null || Number(index) < 0 ? 0xffffffff : (Number(index) >>> 0);
    const isVirtual = mask === 'HOVER';
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    const layer = this.renderer?.graphLayer ?? null;
    if (layer && 'hoveredNodeIndex' in layer) {
      layer.hoveredNodeIndex = resolvedIndex;
      layer.hoveredNodeState = value;
      layer.hoveredNodeIsVirtual = isVirtual && resolvedIndex !== 0xffffffff;
      if (resolvedIndex !== 0xffffffff) {
        this._promoteInteractionNodes?.([resolvedIndex], {
          connectedEdges: this._interactionRenderOrder?.promoteHoverConnectedEdges !== false
            && layer.propagateHoveredNodeToEdges === true,
        });
        this._reprioritizePersistentInteractionRenderOrder?.();
      }
      this.scheduler.requestRender();
      return this;
    }
    this._pendingGraphLayerProps.set('hoveredNodeIndex', resolvedIndex);
    this._pendingGraphLayerProps.set('hoveredNodeState', value);
    this._pendingGraphLayerProps.set('hoveredNodeIsVirtual', isVirtual && resolvedIndex !== 0xffffffff);
    if (resolvedIndex !== 0xffffffff) {
      this._promoteInteractionNodes?.([resolvedIndex]);
      this._reprioritizePersistentInteractionRenderOrder?.();
    }
    return this;
  }

  /**
   * Set transient hover state for an edge.
   *
   * @public
   * @apiSection Interaction
   * @param {number|null} index - Hovered edge index, or `null` to clear.
   * @param {number|string|Array<string>} [mask='HOVERED'] - State mask applied while hovered.
   * @returns {Helios} This Helios instance.
   */
  hoverEdgeState(index, mask) {
    const resolvedIndex = index == null || Number(index) < 0 ? 0xffffffff : (Number(index) >>> 0);
    const isVirtual = mask === 'HOVER';
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    const layer = this.renderer?.graphLayer ?? null;
    if (layer && 'hoveredEdgeIndex' in layer) {
      layer.hoveredEdgeIndex = resolvedIndex;
      layer.hoveredEdgeState = value;
      layer.hoveredEdgeIsVirtual = isVirtual && resolvedIndex !== 0xffffffff;
      if (resolvedIndex !== 0xffffffff) {
        this._promoteInteractionEdges?.([resolvedIndex]);
        this._reprioritizePersistentInteractionRenderOrder?.();
      }
      this.scheduler.requestRender();
      return this;
    }
    this._pendingGraphLayerProps.set('hoveredEdgeIndex', resolvedIndex);
    this._pendingGraphLayerProps.set('hoveredEdgeState', value);
    this._pendingGraphLayerProps.set('hoveredEdgeIsVirtual', isVirtual && resolvedIndex !== 0xffffffff);
    if (resolvedIndex !== 0xffffffff) {
      this._promoteInteractionEdges?.([resolvedIndex]);
      this._reprioritizePersistentInteractionRenderOrder?.();
    }
    return this;
  }

  _setHighlightSource(source, { nodes = [], edges = [] } = {}) {
    const key = String(source ?? '').trim();
    if (!key) return this;
    this._highlightSources.set(key, {
      nodes: new Set(Array.from(nodes ?? []).map(Number).filter((id) => Number.isInteger(id) && id >= 0)),
      edges: new Set(Array.from(edges ?? []).map(Number).filter((id) => Number.isInteger(id) && id >= 0)),
    });
    return this._applyHighlightSources();
  }

  _collectConnectedHighlightEdges(nodeIds) {
    const network = this._getRenderNetwork?.() ?? this.network ?? null;
    const nodes = new Set(Array.from(nodeIds ?? []).map(Number).filter((id) => Number.isInteger(id) && id >= 0));
    if (!network || !nodes.size) return [];
    return network.withBufferAccess?.(() => {
      const ids = network.edgeIndices ?? [];
      const edges = network.edgesView ?? null;
      if (!edges) return [];
      const matches = [];
      for (const edgeRaw of ids) {
        const edge = Number(edgeRaw);
        const source = Number(edges[edge * 2]);
        const target = Number(edges[edge * 2 + 1]);
        if (nodes.has(source) || nodes.has(target)) matches.push(edge);
      }
      return matches;
    }) ?? [];
  }

  _clearHighlightSource(source) {
    const key = String(source ?? '').trim();
    if (!key || !this._highlightSources?.has(key)) return this;
    this._highlightSources.delete(key);
    return this._applyHighlightSources();
  }

  _applyHighlightSources() {
    const nextNodes = new Set();
    const nextEdges = new Set();
    for (const entry of this._highlightSources?.values?.() ?? []) {
      for (const id of entry.nodes ?? []) nextNodes.add(id);
      for (const id of entry.edges ?? []) nextEdges.add(id);
    }
    if (this._highlightConnectedEdges === true) {
      for (const edge of this._collectConnectedHighlightEdges(nextNodes)) nextEdges.add(edge);
    }
    const prev = this._highlightUnion ?? { nodes: new Set(), edges: new Set() };
    const removeNodes = Array.from(prev.nodes).filter((id) => !nextNodes.has(id));
    const addNodes = Array.from(nextNodes).filter((id) => !prev.nodes.has(id));
    const removeEdges = Array.from(prev.edges).filter((id) => !nextEdges.has(id));
    const addEdges = Array.from(nextEdges).filter((id) => !prev.edges.has(id));
    if (removeNodes.length) this.nodeState(removeNodes, 'HIGHLIGHTED', { mode: 'remove' });
    if (addNodes.length) this.nodeState(addNodes, 'HIGHLIGHTED', { mode: 'add' });
    if (removeEdges.length) this.edgeState(removeEdges, 'HIGHLIGHTED', { mode: 'remove' });
    if (addEdges.length) this.edgeState(addEdges, 'HIGHLIGHTED', { mode: 'add' });
    this._highlightUnion = { nodes: nextNodes, edges: nextEdges };
    this._reprioritizePersistentInteractionRenderOrder?.();
    this.emit?.('highlight:change', {
      nodes: Array.from(nextNodes),
      edges: Array.from(nextEdges),
      addedNodes: addNodes,
      removedNodes: removeNodes,
      addedEdges: addEdges,
      removedEdges: removeEdges,
    });
    return this;
  }

  /**
   * Read or set whether highlighted nodes also highlight their connected edges.
   *
   * @public
   * @apiSection Interaction
   * @param {boolean} [value] - Enable connected-edge highlighting.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  highlightConnectedEdges(value) {
    if (arguments.length === 0) return this._highlightConnectedEdges === true;
    this._highlightConnectedEdges = value === true;
    this.options ??= {};
    this.options.highlightConnectedEdges = this._highlightConnectedEdges;
    this._applyHighlightSources();
    this._emitUIBindingChange?.('highlightConnectedEdges', this._highlightConnectedEdges);
    this.scheduler?.requestRender?.();
    return this;
  }

  /**
   * Read or set styling for nodes carrying a state bit.
   *
   * @public
   * @apiSection Interaction
   * @param {number|string} slot - State slot index or name.
   * @param {object} [style] - Node state style with scale, opacity, outline, discard, and color fields.
   * @returns {object|null|Helios} Current style when `style` is omitted; otherwise this Helios instance.
   */
  nodeStateStyle(slot, style) {
    if (arguments.length < 2) {
      const layer = this.renderer?.graphLayer;
      const index = Number(resolveStateSlot(slot, this.constructor.STATES));
      if (!Number.isInteger(index) || index < 0) return null;
      if (!layer) {
        return this._stateStyleCache?.nodeSlots?.get(index) ?? null;
      }
      if (index >= layer.stateSlotCount) return null;
      const o = index * 4;
      const forceMask = layer.nodeStateForceMaxAlphaMask >>> 0;
      return {
        sizeMul: layer.nodeStateScale[o + 0],
        opacityMul: layer.nodeStateScale[o + 1],
        outlineMul: layer.nodeStateScale[o + 2],
        discard: layer.nodeStateScale[o + 3] === 1,
        forceMaxAlpha: ((forceMask >> index) & 1) === 1,
        colorMul: Array.from(layer.nodeStateColorMul.slice(o, o + 4)),
        colorAdd: Array.from(layer.nodeStateColorAdd.slice(o, o + 4)),
      };
    }
    const resolvedSlot = resolveStateSlot(slot, this.constructor.STATES);
    if (this._stateStyleCache?.nodeSlots) {
      this._stateStyleCache.nodeSlots.set(resolvedSlot, style);
    }
    this.renderer?.graphLayer?.setNodeStateStyle?.(resolvedSlot, style);
    if (
      this._hoverStyleFromHighlight === true
      && resolvedSlot === resolveStateSlot('HIGHLIGHTED', this.constructor.STATES)
    ) {
      this.nodeHoverStyle(style);
    }
    this.scheduler.requestRender();
    return this;
  }

  /**
   * Read or set styling for nodes with no active state bits.
   *
   * @public
   * @apiSection Interaction
   * @param {object} [style] - Node style applied to unselected/unhighlighted nodes.
   * @returns {object|null|Helios} Current style when omitted; otherwise this Helios instance.
   */
  nodeNoStateStyle(style) {
    if (arguments.length === 0) {
      const layer = this.renderer?.graphLayer;
      if (!layer) return this._stateStyleCache?.nodeNoState ?? null;
      return {
        sizeMul: layer.nodeNoStateScale[0],
        opacityMul: layer.nodeNoStateScale[1],
        outlineMul: layer.nodeNoStateScale[2],
        discard: layer.nodeNoStateScale[3] === 1,
        colorMul: Array.from(layer.nodeNoStateColorMul.slice(0, 4)),
        colorAdd: Array.from(layer.nodeNoStateColorAdd.slice(0, 4)),
      };
    }
    if (this._stateStyleCache) {
      this._stateStyleCache.nodeNoState = style;
    }
    const layer = this.renderer?.graphLayer;
    layer?.setNodeNoStateStyle?.(style);
    if (layer && style?.enabled !== false) layer.nodeNoStateStyleEnabled = true;
    this.scheduler.requestRender();
    return this;
  }

  /**
   * Read or set styling for edges carrying a state bit.
   *
   * @public
   * @apiSection Interaction
   * @param {number|string} slot - State slot index or name.
   * @param {object} [style] - Edge state style with width, opacity, discard, and color fields.
   * @returns {object|null|Helios} Current style when `style` is omitted; otherwise this Helios instance.
   */
  edgeStateStyle(slot, style) {
    if (arguments.length < 2) {
      const layer = this.renderer?.graphLayer;
      const index = Number(resolveStateSlot(slot, this.constructor.STATES));
      if (!Number.isInteger(index) || index < 0) return null;
      if (!layer) {
        return this._stateStyleCache?.edgeSlots?.get(index) ?? null;
      }
      if (index >= layer.stateSlotCount) return null;
      const o = index * 4;
      const forceMask = layer.edgeStateForceMaxAlphaMask >>> 0;
      return {
        widthMul: layer.edgeStateScale[o + 0],
        opacityMul: layer.edgeStateScale[o + 1],
        discard: layer.edgeStateScale[o + 3] === 1,
        forceMaxAlpha: ((forceMask >> index) & 1) === 1,
        colorMul: Array.from(layer.edgeStateColorMul.slice(o, o + 4)),
        colorAdd: Array.from(layer.edgeStateColorAdd.slice(o, o + 4)),
      };
    }
    const resolvedSlot = resolveStateSlot(slot, this.constructor.STATES);
    if (this._stateStyleCache?.edgeSlots) {
      this._stateStyleCache.edgeSlots.set(resolvedSlot, style);
    }
    this.renderer?.graphLayer?.setEdgeStateStyle?.(resolvedSlot, style);
    if (
      this._hoverStyleFromHighlight === true
      && resolvedSlot === resolveStateSlot('HIGHLIGHTED', this.constructor.STATES)
    ) {
      this.edgeHoverStyle(style);
    }
    this.scheduler.requestRender();
    return this;
  }

  /**
   * Read or set styling for edges with no active state bits.
   *
   * @public
   * @apiSection Interaction
   * @param {object} [style] - Edge style applied to unselected/unhighlighted edges.
   * @returns {object|null|Helios} Current style when omitted; otherwise this Helios instance.
   */
  edgeNoStateStyle(style) {
    if (arguments.length === 0) {
      const layer = this.renderer?.graphLayer;
      if (!layer) return this._stateStyleCache?.edgeNoState ?? null;
      return {
        widthMul: layer.edgeNoStateScale[0],
        opacityMul: layer.edgeNoStateScale[1],
        discard: layer.edgeNoStateScale[3] === 1,
        colorMul: Array.from(layer.edgeNoStateColorMul.slice(0, 4)),
        colorAdd: Array.from(layer.edgeNoStateColorAdd.slice(0, 4)),
      };
    }
    if (this._stateStyleCache) {
      this._stateStyleCache.edgeNoState = style;
    }
    const layer = this.renderer?.graphLayer;
    layer?.setEdgeNoStateStyle?.(style);
    if (layer && style?.enabled !== false) layer.edgeNoStateStyleEnabled = true;
    this.scheduler.requestRender();
    return this;
  }

  /**
   * Read or set the transient hover style for nodes.
   *
   * @public
   * @apiSection Interaction
   * @param {object} [style] - Node hover style.
   * @returns {object|null|Helios} Current style when omitted; otherwise this Helios instance.
   */
  nodeHoverStyle(style) {
    if (arguments.length === 0) {
      const layer = this.renderer?.graphLayer;
      if (!layer || !layer.nodeHoverScale || !layer.nodeHoverColorMul || !layer.nodeHoverColorAdd) {
        return this._stateStyleCache?.nodeHover ?? null;
      }
      return {
        sizeMul: layer.nodeHoverScale[0],
        opacityMul: layer.nodeHoverScale[1],
        outlineMul: layer.nodeHoverScale[2],
        forceMaxAlpha: layer.nodeHoverForceMaxAlpha === true,
        colorMul: Array.from(layer.nodeHoverColorMul.slice(0, 4)),
        colorAdd: Array.from(layer.nodeHoverColorAdd.slice(0, 4)),
      };
    }
    if (this._stateStyleCache) this._stateStyleCache.nodeHover = style;
    this.renderer?.graphLayer?.setNodeHoverStyle?.(style);
    this.scheduler.requestRender();
    return this;
  }

  /**
   * Read or set the transient hover style for edges.
   *
   * @public
   * @apiSection Interaction
   * @param {object} [style] - Edge hover style.
   * @returns {object|null|Helios} Current style when omitted; otherwise this Helios instance.
   */
  edgeHoverStyle(style) {
    if (arguments.length === 0) {
      const layer = this.renderer?.graphLayer;
      if (!layer || !layer.edgeHoverScale || !layer.edgeHoverColorMul || !layer.edgeHoverColorAdd) {
        return this._stateStyleCache?.edgeHover ?? null;
      }
      return {
        widthMul: layer.edgeHoverScale[0],
        opacityMul: layer.edgeHoverScale[1],
        forceMaxAlpha: layer.edgeHoverForceMaxAlpha === true,
        colorMul: Array.from(layer.edgeHoverColorMul.slice(0, 4)),
        colorAdd: Array.from(layer.edgeHoverColorAdd.slice(0, 4)),
      };
    }
    if (this._stateStyleCache) this._stateStyleCache.edgeHover = style;
    this.renderer?.graphLayer?.setEdgeHoverStyle?.(style);
    this.scheduler.requestRender();
    return this;
  }

  _copyHighlightStyleToHover() {
    const nodeStyle = this.nodeStateStyle?.('HIGHLIGHTED') ?? null;
    const edgeStyle = this.edgeStateStyle?.('HIGHLIGHTED') ?? null;
    if (nodeStyle) this.nodeHoverStyle(nodeStyle);
    if (edgeStyle) this.edgeHoverStyle(edgeStyle);
    return this;
  }

  /**
   * Read or set whether hover style follows the highlighted-state style.
   *
   * @public
   * @apiSection Interaction
   * @param {boolean} [value] - Copy highlighted styles into hover styles.
   * @returns {boolean|Helios} Current value when omitted; otherwise this Helios instance.
   */
  hoverStyleFromHighlight(value) {
    if (arguments.length === 0) return this._hoverStyleFromHighlight === true;
    this._hoverStyleFromHighlight = value === true;
    this.options ??= {};
    this.options.hoverStyleFromHighlight = this._hoverStyleFromHighlight;
    if (this._hoverStyleFromHighlight) this._copyHighlightStyleToHover();
    this._emitUIBindingChange?.('hoverStyleFromHighlight', this._hoverStyleFromHighlight);
    this.scheduler?.requestRender?.();
    return this;
  }

  /**
   * Reset all node and edge state styles to renderer defaults.
   *
   * @public
   * @apiSection Interaction
   * @returns {Helios} This Helios instance.
   */
  resetStateStyles() {
    if (this._stateStyleCache) {
      this._stateStyleCache.nodeSlots.clear();
      this._stateStyleCache.edgeSlots.clear();
      this._stateStyleCache.nodeNoState = null;
      this._stateStyleCache.edgeNoState = null;
      this._stateStyleCache.nodeHover = null;
      this._stateStyleCache.edgeHover = null;
    }
    this.renderer?.graphLayer?.resetStateStyles?.();
    this.scheduler.requestRender();
    return this;
  }

  /**
   * Read, replace, or reset the default node and edge mapper collections.
   *
   * @public
   * @apiSection Mappers
   * @param {object} [mappers] - Mapper replacements. Omit to read active mapper collections.
   * @param {Mapper} [mappers.nodeMapper] - Replacement default node mapper.
   * @param {Mapper} [mappers.edgeMapper] - Replacement default edge mapper.
   * @returns {object|Helios} Current mapper collections when omitted; otherwise this Helios instance.
   */
  mappers({ nodeMapper, edgeMapper } = {}) {
    if (arguments.length === 0) {
      return { nodeMapper: this.nodeMapper, edgeMapper: this.edgeMapper };
    }
    if (nodeMapper === null && edgeMapper === null) {
      this.debug.log('mapper', 'Resetting mappers to defaults');
      this.nodeMapper = new MapperCollection('node', this.network, () => {
        this.markMappersDirty();
      }, this.debug);
      this.edgeMapper = new MapperCollection('edge', this.network, () => {
        this.markMappersDirty();
      }, this.debug);
      this.mappersDirty = true;
      this.emit(EVENTS.MAPPERS_CHANGED, {
        node: serializeMapperCollectionState(this.nodeMapper),
        edge: serializeMapperCollectionState(this.edgeMapper),
      });
      this.scheduler?.requestGeometry?.();
      this.scheduler.requestGeometry();
      return this;
    }
    if (nodeMapper) {
      this.debug.log('mapper', 'Replacing node mapper');
      this.nodeMapper.setDefault(nodeMapper);
    }
    if (edgeMapper) {
      this.debug.log('mapper', 'Replacing edge mapper');
      this.edgeMapper.setDefault(edgeMapper);
    }
    this.mappersDirty = true;
    this.emit(EVENTS.MAPPERS_CHANGED, {
      node: serializeMapperCollectionState(this.nodeMapper),
      edge: serializeMapperCollectionState(this.edgeMapper),
    });
    this.scheduler.requestGeometry();
    return this;
  }

  /**
   * Read or replace the active layout instance.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {Layout} [layout] - Layout instance extending the Helios layout base class.
   * @returns {Layout|Helios} Current layout when omitted; otherwise this Helios instance.
   */
  layout(layout) {
    if (arguments.length === 0) {
      return this._layout;
    }
    if (!isLayoutInstance(layout)) {
      throw new Error('Layout must extend the Layout base class');
    }
    const handoff = this._resolveLayoutHandoffContext();
    const nextPolicy = this._resolveLayoutPositionPolicy(layout);
    const shouldHandoffDelegatePositions = handoff.outgoingDelegate
      && nextPolicy.source !== 'delegate';

    if (handoff.pending && !shouldHandoffDelegatePositions) {
      this._disposePendingLayoutHandoff();
    } else if (handoff.pending) {
      this._pendingLayoutHandoff = null;
    }
    if (handoff.staleLayout && handoff.staleLayout !== handoff.outgoingLayout) {
      handoff.staleLayout.dispose?.();
    }
    if (!shouldHandoffDelegatePositions) {
      handoff.outgoingLayout?.dispose?.();
    }

    this._layout = this._bindLayoutToHelios(layout);
    this.debug.log('layout', 'Layout replaced', { layout: layout?.constructor?.name });
    this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    this.debug.log('layout', 'Initializing new layout instance');
    this._layout.initialize?.();
    this._layout.resize?.(this.layers.size);
    if (!shouldHandoffDelegatePositions) {
      this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: true });
      this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    } else {
      this._startLayoutPositionHandoff({
        previousLayout: handoff.outgoingLayout,
        previousDelegate: handoff.outgoingDelegate,
        nextLayout: this._layout,
      });
    }
    this.debug.log('layout', 'Layout initialized and resized', this.layers.size);
    this.scheduler.setLayout(this._layout);
    this._emitLayoutChanged(this._layout);
    this.scheduler.requestLayout('user');
    this.scheduler.requestRender();
    return this;
  }

  /**
   * List node attributes that can seed layout positions.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {object} [options] - Choice discovery options.
   * @param {HeliosNetwork} [options.network] - Network to inspect. Defaults to the active network.
   * @param {'2d'|'3d'} [options.mode] - Mode used to label random seed choices.
   * @returns {Array<object>} Position choices with `value`, `label`, and `dimension` fields.
   */
  getLayoutPositionAttributeChoices(options = {}) {
    const network = options.network ?? this.network ?? null;
    const mode = (options.mode ?? this.options?.mode) === '3d' ? '3d' : '2d';
    const currentChoice = {
      value: NODE_POSITION_ATTRIBUTE,
      label: 'Current positions',
      dimension: 3,
    };
    const randomChoice = {
      value: RANDOM_LAYOUT_POSITION_CHOICE,
      label: mode === '3d' ? 'Random positions (3D cube)' : 'Random positions (2D square)',
      dimension: mode === '3d' ? 3 : 2,
    };
    if (!network || typeof network.getNodeAttributeNames !== 'function') {
      return [currentChoice, randomChoice];
    }

    const names = new Set(network.getNodeAttributeNames?.() ?? []);
    names.add(NODE_POSITION_ATTRIBUTE);

    const choices = [randomChoice];
    for (const name of names) {
      const info = network.getNodeAttributeInfo?.(name) ?? null;
      const dimension = Number(info?.dimension ?? 0);
      if (!Number.isFinite(dimension) || (dimension !== 2 && dimension !== 3)) continue;
      if (info?.complex === true) continue;
      if (!isNumericLayoutPositionAttributeType(info?.type)) continue;
      choices.push({
        value: name,
        label: name === NODE_POSITION_ATTRIBUTE ? 'Current positions' : `${name} (${dimension}D)`,
        dimension,
      });
    }

    choices.sort((a, b) => {
      if (a.value === NODE_POSITION_ATTRIBUTE) return -1;
      if (b.value === NODE_POSITION_ATTRIBUTE) return 1;
      if (a.value === RANDOM_LAYOUT_POSITION_CHOICE) return -1;
      if (b.value === RANDOM_LAYOUT_POSITION_CHOICE) return 1;
      return String(a.label).localeCompare(String(b.label));
    });

    return choices.length ? choices : [currentChoice, randomChoice];
  }

  /**
   * Copy a numeric node attribute into the canonical layout-position attribute.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {string} name - Source node attribute name, or the random seed choice value.
   * @param {object} [options] - Position-copy options.
   * @param {HeliosNetwork} [options.network] - Network to update. Defaults to the active network.
   * @returns {boolean} `true` when positions were written.
   */
  setLayoutPositionsFromNodeAttribute(name, options = {}) {
    const network = options.network ?? this.network ?? null;
    const visuals = this.visuals ?? null;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!network || !trimmed) return false;

    const seedBounds = resolveSeedBoundsForLayout(
      this.options?.layout,
      this.layers?.size,
      this.options?.mode,
    );
    if (trimmed === RANDOM_LAYOUT_POSITION_CHOICE) {
      visuals?.ensureNodeAttribute?.(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);

      let wrote = false;
      const applyRandomSeed = () => {
        const targetBuffer = network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE) ?? null;
        const targetView = targetBuffer?.view ?? null;
        const nodeIndices = network.nodeIndices ?? null;
        if (!targetView || !nodeIndices?.length) return;

        const center = Array.isArray(seedBounds.center) ? seedBounds.center : [0, 0, 0];
        const cx = Number.isFinite(center[0]) ? center[0] : 0;
        const cy = Number.isFinite(center[1]) ? center[1] : 0;
        const cz = Number.isFinite(center[2]) ? center[2] : 0;
        const safeMode = seedBounds.mode === '3d' ? '3d' : '2d';
        const side = safeMode === '3d'
          ? Math.max(
              1,
              Number(seedBounds.width) || 1,
              Number(seedBounds.height) || 1,
              Number(seedBounds.depth) || 0,
            )
          : Math.max(1, Math.min(
              Number(seedBounds.width) || 1,
              Number(seedBounds.height) || 1,
            ));
        const halfSide = side * 0.5;

        for (let i = 0; i < nodeIndices.length; i += 1) {
          const nodeId = nodeIndices[i];
          const offset = nodeId * 3;
          targetView[offset] = cx + ((Math.random() * 2 - 1) * halfSide);
          targetView[offset + 1] = cy + ((Math.random() * 2 - 1) * halfSide);
          targetView[offset + 2] = safeMode === '3d'
            ? cz + ((Math.random() * 2 - 1) * halfSide)
            : 0;
          wrote = true;
        }
      };

      if (typeof network.withBufferAccess === 'function') {
        network.withBufferAccess(applyRandomSeed);
      } else {
        applyRandomSeed();
      }

      if (!wrote) return false;

      this._resetInterpolationRuntime({ keepLastRendered: false, keepIntervalHistory: true });
      visuals?.markPositionsDirty?.();
      visuals?.bumpNodeAttributes?.(NODE_POSITION_ATTRIBUTE);
      this._markAutoFitDirty(false);
      this._layout?.seedFromNetworkPositions?.();
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
      this._labels?.requestFullReselect?.('layout-position-random');
      return true;
    }

    const info = network.getNodeAttributeInfo?.(trimmed) ?? null;
    const dimension = Number(info?.dimension ?? 0);
    if (!info) {
      throw new Error(`Unknown node attribute "${trimmed}"`);
    }
    if (!isNumericLayoutPositionAttributeType(info.type) || info.complex === true || (dimension !== 2 && dimension !== 3)) {
      throw new Error(`Node attribute "${trimmed}" must be a numeric 2D or 3D vector attribute`);
    }

    visuals?.ensureNodeAttribute?.(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);

    let wrote = false;
    const apply = () => {
      const sourceBuffer = network.getNodeAttributeBuffer?.(trimmed) ?? null;
      const targetBuffer = network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE) ?? null;
      const sourceView = sourceBuffer?.view ?? null;
      const targetView = targetBuffer?.view ?? null;
      if (!sourceView || !targetView) return;

      const sourceCount = Math.floor(sourceView.length / dimension);
      const targetCount = Math.floor(targetView.length / 3);
      const count = Math.min(sourceCount, targetCount);
      if (count <= 0) return;

      for (let index = 0; index < count; index += 1) {
        const sourceOffset = index * dimension;
        const targetOffset = index * 3;
        const x = Number(sourceView[sourceOffset]);
        const y = Number(sourceView[sourceOffset + 1]);
        const z = dimension === 3 ? Number(sourceView[sourceOffset + 2]) : 0;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        targetView[targetOffset] = x;
        targetView[targetOffset + 1] = y;
        targetView[targetOffset + 2] = z;
        wrote = true;
      }
    };

    if (typeof network.withBufferAccess === 'function') {
      network.withBufferAccess(apply);
    } else {
      apply();
    }

    if (!wrote) return false;

    this._resetInterpolationRuntime({ keepLastRendered: false, keepIntervalHistory: true });
    visuals?.markPositionsDirty?.();
    visuals?.bumpNodeAttributes?.(NODE_POSITION_ATTRIBUTE);
    this._markAutoFitDirty(false);
    this._layout?.seedFromNetworkPositions?.();
    this.scheduler?.requestGeometry?.();
    this.scheduler?.requestRender?.();
    this._labels?.requestFullReselect?.('layout-position-attribute');
    return true;
  }

  /**
   * Read or update the active position source used for rendering and layout handoff.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {object|null} [options] - Position pipeline options, or `null` to reset to network-backed positions.
   * @param {'network'|'delegate'} [options.source] - Source for current positions.
   * @param {PositionDelegate} [options.delegate] - Delegate used when `source` is `delegate`.
   * @returns {object|Helios} Current position source when omitted; otherwise this Helios instance.
   */
  positions(options) {
    if (arguments.length === 0) {
      return {
        source: this._positionsConfig?.source ?? 'network',
        delegate: this._positionsConfig?.delegate ?? null,
      };
    }
    if (options == null) {
      options = { source: 'network', delegate: null };
    }
    if (typeof options !== 'object') {
      throw new TypeError('positions(options) expects an object or null');
    }
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    this._applyPositionPipelineToRenderer();
    this._markAutoFitDirty(false);
    this.scheduler.requestGeometry();
    this.scheduler.requestRender();
    this._labels?.requestFullReselect?.('positions-config');
    return this;
  }

  /**
   * Snapshot all node positions from the active or supplied position delegate.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {object} [options] - Delegate readback options.
   * @param {PositionDelegate} [options.delegate] - Delegate to read. Defaults to the active delegate.
   * @returns {Promise<Float32Array|null>} Packed `x,y,z` positions, or `null` when no delegate is available.
   */
  async snapshotDelegatePositions(options = {}) {
    const delegate = options?.delegate ?? this._positionsConfig?.delegate ?? this._activePositionDelegate ?? null;
    if (!delegate) return null;
    const context = this._buildPositionDelegateContext(options);
    if (typeof delegate.snapshotNodePositions === 'function') {
      return delegate.snapshotNodePositions(context);
    }
    let view = null;
    if (typeof delegate.getNodePositionView === 'function') {
      view = delegate.getNodePositionView(context);
    } else if (typeof delegate.getPositionView === 'function') {
      view = delegate.getPositionView(context);
    }
    if (!view || !Number.isFinite(view.length) || view.length <= 0) return null;
    return new Float32Array(view);
  }

  /**
   * Snapshot selected node positions from the active position source.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {Array<number>|TypedArray|number} nodeIds - Node indices to read.
   * @param {object} [options] - Readback options.
   * @param {Float32Array} [options.out] - Optional output buffer.
   * @param {PositionDelegate} [options.delegate] - Delegate override.
   * @returns {Promise<object>} Readback result with ids, packed positions, count, version, and source.
   */
  async snapshotNodePositions(nodeIds, options = {}) {
    const ids = normalizeReadbackNodeIndexList(nodeIds);
    const count = ids.length;
    const source = this._positionsConfig ?? { source: 'network', delegate: null };
    const delegate = options?.delegate ?? source.delegate ?? this._activePositionDelegate ?? null;
    const out = options?.out instanceof Float32Array ? options.out : null;
    if (delegate && (options?.delegate || source.source === 'delegate')) {
      const context = this._buildPositionDelegateContext(options);
      if (typeof delegate.snapshotNodePositionsById === 'function') {
        const result = await delegate.snapshotNodePositionsById(context, ids, options);
        if (result?.deferred === true) {
          return {
            ids: result.ids ?? Uint32Array.from(ids),
            positions: null,
            count: Number.isFinite(result.count) ? result.count : count,
            version: Number.isFinite(result.version) ? result.version : delegate.version ?? 0,
            source: result.source ?? 'delegate-deferred',
            deferred: true,
          };
        }
        if (result?.positions instanceof Float32Array) {
          return {
            ids: result.ids ?? Uint32Array.from(ids),
            positions: result.positions,
            count: Number.isFinite(result.count) ? result.count : count,
            version: Number.isFinite(result.version) ? result.version : delegate.version ?? 0,
            source: result.source ?? 'delegate',
          };
        }
      }
      let view = null;
      if (typeof delegate.getNodePositionView === 'function') {
        view = delegate.getNodePositionView(context);
      } else if (typeof delegate.getPositionView === 'function') {
        view = delegate.getPositionView(context);
      }
      if (view && Number.isFinite(view.length) && view.length > 0) {
        return {
          ids: Uint32Array.from(ids),
          positions: copyReadbackPositionsFromView(view, ids, out),
          count,
          version: Number.isFinite(delegate.version) ? delegate.version : 0,
          source: 'delegate-view',
        };
      }
      const snapshot = await this.snapshotDelegatePositions({ ...options, delegate });
      return {
        ids: Uint32Array.from(ids),
        positions: copyReadbackPositionsFromView(snapshot, ids, out),
        count,
        version: Number.isFinite(delegate.version) ? delegate.version : 0,
        source: 'snapshot-fallback',
      };
    }

    const network = this._getRenderNetwork?.() ?? this.network ?? null;
    let positions = null;
    const read = () => {
      const view = network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
      positions = copyReadbackPositionsFromView(view, ids, out);
    };
    if (typeof network?.withBufferAccess === 'function') {
      network.withBufferAccess(read);
    } else {
      read();
    }
    return {
      ids: Uint32Array.from(ids),
      positions: positions ?? resolveFloat32Out(out, count * 3),
      count,
      version: Number.isFinite(network?.getNodeAttributeVersion?.(NODE_POSITION_ATTRIBUTE))
        ? network.getNodeAttributeVersion(NODE_POSITION_ATTRIBUTE)
        : 0,
      source: 'network',
    };
  }

  /**
   * Snapshot one node position from the active position source.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {number} nodeId - Node index to read.
   * @param {object} [options] - Readback options.
   * @param {Float32Array} [options.out] - Optional output buffer with length at least three.
   * @returns {Promise<object>} Readback result with id, position, version, and source.
   */
  async snapshotNodePosition(nodeId, options = {}) {
    const id = Math.floor(Number(nodeId));
    const safeId = Number.isFinite(id) && id >= 0 ? id : -1;
    const out = options?.out instanceof Float32Array && options.out.length >= 3
      ? options.out
      : new Float32Array(3);
    const result = safeId >= 0
      ? await this.snapshotNodePositions([safeId], { ...options, out })
      : null;
    if (!result) {
      out[0] = 0;
      out[1] = 0;
      out[2] = 0;
    }
    return {
      id: safeId,
      position: result?.positions ?? out,
      version: result?.version ?? 0,
      source: result?.source ?? 'invalid',
    };
  }

  /**
   * Compute the centroid of selected nodes from the active position source.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {Array<number>|TypedArray|number} nodeIds - Node indices to include.
   * @param {object} [options] - Readback options.
   * @param {Float32Array} [options.out] - Optional output buffer with length at least three.
   * @returns {Promise<object>} Centroid result with centroid, count, version, and source.
   */
  async snapshotNodeCentroid(nodeIds, options = {}) {
    const ids = normalizeReadbackNodeIndexList(nodeIds);
    const count = ids.length;
    const source = this._positionsConfig ?? { source: 'network', delegate: null };
    const delegate = options?.delegate ?? source.delegate ?? this._activePositionDelegate ?? null;
    const out = options?.out instanceof Float32Array ? options.out : null;
    if (delegate && (options?.delegate || source.source === 'delegate') && typeof delegate.snapshotNodeCentroidById === 'function') {
      const context = this._buildPositionDelegateContext(options);
      const result = await delegate.snapshotNodeCentroidById(context, ids, options);
      if (result?.deferred === true) {
        return {
          centroid: null,
          count: Number.isFinite(result.count) ? result.count : 0,
          version: Number.isFinite(result.version) ? result.version : delegate.version ?? 0,
          source: result.source ?? 'delegate-deferred',
          deferred: true,
        };
      }
      if (result?.centroid instanceof Float32Array) {
        return {
          centroid: result.centroid,
          count: Number.isFinite(result.count) ? result.count : count,
          version: Number.isFinite(result.version) ? result.version : delegate.version ?? 0,
          source: result.source ?? 'delegate',
        };
      }
    }
    const positions = await this.snapshotNodePositions(ids, options);
    const result = centroidFromPackedReadback(positions?.positions, positions?.count ?? count, out);
    return {
      centroid: result.centroid,
      count: result.count,
      version: positions?.version ?? 0,
      source: positions?.source ?? 'network',
    };
  }

  /**
   * Write the active delegate position snapshot back into the network position attribute.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {object} [options] - Delegate synchronization options.
   * @param {PositionDelegate} [options.delegate] - Delegate to synchronize. Defaults to the active delegate.
   * @returns {Promise<boolean>} `true` when network positions were updated.
   */
  async syncDelegatePositionsToNetwork(options = {}) {
    const delegate = options?.delegate ?? this._positionsConfig?.delegate ?? this._activePositionDelegate ?? null;
    if (!delegate) return false;
    const context = this._buildPositionDelegateContext(options);
    let wrote = false;
    if (typeof delegate.synchronizeNodePositionsToNetwork === 'function') {
      wrote = await delegate.synchronizeNodePositionsToNetwork(context);
    } else {
      const snapshot = await this.snapshotDelegatePositions({ ...options, delegate });
      wrote = this._writeNodePositions(snapshot);
    }
    if (!wrote) return false;
    this.visuals?.markPositionsDirty?.();
    this._markAutoFitDirty(false);
    this.scheduler?.requestGeometry?.();
    this.scheduler?.requestRender?.();
    return true;
  }

  /**
   * Read or update GPU position interpolation settings.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {object|string|null} [options] - Interpolation options, mode string, or `null` to disable interpolation.
   * @param {boolean} [options.enabled] - Enable position interpolation.
   * @param {'adaptive'|'fixed'} [options.durationMode] - Duration strategy.
   * @param {number} [options.durationMs] - Fixed interpolation duration in milliseconds.
   * @returns {object|Helios} Current interpolation snapshot when omitted; otherwise this Helios instance.
   */
  interpolation(options) {
    if (arguments.length === 0) {
      const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
      const durationMode = resolveInterpolationDurationMode(config);
      return {
        ...config,
        durationMode,
        adaptiveDuration: durationMode === 'adaptive',
        fixedDurationMs: config.durationMs,
        active: this._interpolationRuntime?.active === true,
        factor: clamp01(this._interpolationRuntime?.factor, 1),
        effectiveDurationMs: Number.isFinite(this._interpolationRuntime?.effectiveDurationMs)
          ? this._interpolationRuntime.effectiveDurationMs
          : this._resolveInterpolationDurationMs(performance.now()),
      };
    }
    let updates = options;
    if (typeof updates === 'string') {
      updates = { mode: updates, enabled: true };
    }
    if (updates == null) {
      updates = { enabled: false };
    }
    if (typeof updates !== 'object') {
      throw new TypeError('interpolation(options) expects an object, string mode, or null');
    }
    const current = this._interpolationConfig ?? { ...POSITION_INTERPOLATION_DEFAULTS };
    const next = { ...current };
    if (Object.prototype.hasOwnProperty.call(updates, 'enabled')) {
      next.enabled = updates.enabled === true;
    }
    const hasDurationModeUpdate = (
      Object.prototype.hasOwnProperty.call(updates, 'durationMode')
      || Object.prototype.hasOwnProperty.call(updates, 'durationStrategy')
    );
    const hasAdaptiveDurationUpdate = Object.prototype.hasOwnProperty.call(updates, 'adaptiveDuration');
    const hasFixedDurationUpdate = Object.prototype.hasOwnProperty.call(updates, 'fixedDurationMs');
    if (
      Object.prototype.hasOwnProperty.call(updates, 'mode')
      || Object.prototype.hasOwnProperty.call(updates, 'type')
    ) {
      next.mode = normalizeInterpolationMode(updates.mode ?? updates.type);
    }
    if (hasDurationModeUpdate) {
      next.durationMode = normalizeInterpolationDurationMode(
        updates.durationMode ?? updates.durationStrategy,
        resolveInterpolationDurationMode(current),
      );
      next.adaptiveDuration = next.durationMode === 'adaptive';
    }
    if (hasAdaptiveDurationUpdate) {
      next.adaptiveDuration = updates.adaptiveDuration === true;
      next.durationMode = next.adaptiveDuration ? 'adaptive' : 'fixed';
    }
    if (
      Object.prototype.hasOwnProperty.call(updates, 'durationMs')
      || Object.prototype.hasOwnProperty.call(updates, 'duration')
      || Object.prototype.hasOwnProperty.call(updates, 'fixedDurationMs')
    ) {
      next.durationMs = normalizeNonNegativeNumber(
        updates.fixedDurationMs ?? updates.durationMs ?? updates.duration,
        current.durationMs,
        0,
        60000,
      );
    }
    if (hasFixedDurationUpdate && !hasDurationModeUpdate && !hasAdaptiveDurationUpdate) {
      next.durationMode = 'fixed';
      next.adaptiveDuration = false;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationSamples')) {
      next.adaptiveDurationSamples = normalizePositiveInteger(
        updates.adaptiveDurationSamples,
        current.adaptiveDurationSamples,
        1,
        120,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationWindowMs')) {
      next.adaptiveDurationWindowMs = normalizeNonNegativeNumber(
        updates.adaptiveDurationWindowMs,
        current.adaptiveDurationWindowMs,
        100,
        60000,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationScale')) {
      next.adaptiveDurationScale = normalizeNonNegativeNumber(
        updates.adaptiveDurationScale,
        current.adaptiveDurationScale,
        0,
        16,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationMinMs')) {
      next.adaptiveDurationMinMs = normalizeNonNegativeNumber(
        updates.adaptiveDurationMinMs,
        current.adaptiveDurationMinMs,
        0,
        60000,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationMaxMs')) {
      next.adaptiveDurationMaxMs = normalizeNonNegativeNumber(
        updates.adaptiveDurationMaxMs,
        current.adaptiveDurationMaxMs,
        0,
        60000,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'easing')) {
      next.easing = normalizeInterpolationEasing(updates.easing, current.easing);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'smoothing')) {
      next.smoothing = normalizeNonNegativeNumber(updates.smoothing, current.smoothing);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'minDisplacementRatio')) {
      next.minDisplacementRatio = normalizeNonNegativeNumber(
        updates.minDisplacementRatio,
        current.minDisplacementRatio,
      );
    }
    next.durationMode = normalizeInterpolationDurationMode(
      next.durationMode,
      next.adaptiveDuration === true ? 'adaptive' : 'fixed',
    );
    next.adaptiveDuration = next.durationMode === 'adaptive';
    next.mode = 'gpu';
    const modeChanged = normalizeInterpolationMode(current.mode) !== normalizeInterpolationMode(next.mode);
    const disabled = current.enabled === true && next.enabled !== true;
    this._interpolationConfig = next;
    if (modeChanged || disabled) {
      this._resetInterpolationRuntime({ keepLastRendered: true });
    } else if (this._interpolationRuntime) {
      this._interpolationRuntime.effectiveDurationMs = this._resolveInterpolationDurationMs(performance.now());
    }
    this._applyPositionPipelineToRenderer();
    this.scheduler.requestRender();
    return this;
  }

  // Backwards-compatible aliases.
  /**
   * Alias for `layout(layout)`.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {Layout} layout - Replacement layout.
   * @returns {Layout|Helios} Result of `layout(layout)`.
   */
  setLayout(layout) { return this.layout(layout); }
  /**
   * Alias for `positions(options)`.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {object|null} options - Position pipeline options.
   * @returns {object|Helios} Result of `positions(options)`.
   */
  setPositions(options) { return this.positions(options); }
  /**
   * Alias for `interpolation(options)`.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {object|string|null} options - Interpolation options.
   * @returns {object|Helios} Result of `interpolation(options)`.
   */
  setInterpolation(options) { return this.interpolation(options); }
  /**
   * Alias for `density(options)`.
   *
   * @public
   * @apiSection Density And Labels
   * @param {object|false|null} options - Density options.
   * @returns {object|Helios} Result of `density(options)`.
   */
  setDensity(options) { return this.density(options); }
  /**
   * Alias for `labels(options)`.
   *
   * @public
   * @apiSection Density And Labels
   * @param {object|null} options - Label options.
   * @returns {object|Helios} Result of `labels(options)`.
   */
  setLabels(options) { return this.labels(options); }
  /**
   * Alias for `legends(options)`.
   *
   * @public
   * @apiSection Density And Labels
   * @param {object|false|null} options - Legend options.
   * @returns {object|Helios} Result of `legends(options)`.
   */
  setLegends(options) { return this.legends(options); }
  /**
   * Alias for `mappers(mappers)`.
   *
   * @public
   * @apiSection Mappers
   * @param {object} mappers - Mapper replacements.
   * @returns {object|Helios} Result of `mappers(mappers)`.
   */
  setMappers(mappers) { return this.mappers(mappers); }
  /**
   * Alias for `nodeState(indices, mask, options)`.
   *
   * @public
   * @apiSection Interaction
   * @param {Array<number>|TypedArray|number} indices - Node indices.
   * @param {number|string|Array<string>} mask - State mask.
   * @param {object} [options] - State options.
   * @returns {Helios} This Helios instance.
   */
  setNodeState(indices, mask, options) { return this.nodeState(indices, mask, options); }
  /**
   * Alias for `edgeState(indices, mask, options)`.
   *
   * @public
   * @apiSection Interaction
   * @param {Array<number>|TypedArray|number} indices - Edge indices.
   * @param {number|string|Array<string>} mask - State mask.
   * @param {object} [options] - State options.
   * @returns {Helios} This Helios instance.
   */
  setEdgeState(indices, mask, options) { return this.edgeState(indices, mask, options); }
  /**
   * Alias for `nodeStateStyle(slot, style)`.
   *
   * @public
   * @apiSection Interaction
   * @param {number|string} slot - State slot.
   * @param {object} style - Node style.
   * @returns {object|null|Helios} Result of `nodeStateStyle(slot, style)`.
   */
  setNodeStateStyle(slot, style) { return this.nodeStateStyle(slot, style); }
  /**
   * Alias for `edgeStateStyle(slot, style)`.
   *
   * @public
   * @apiSection Interaction
   * @param {number|string} slot - State slot.
   * @param {object} style - Edge style.
   * @returns {object|null|Helios} Result of `edgeStateStyle(slot, style)`.
   */
  setEdgeStateStyle(slot, style) { return this.edgeStateStyle(slot, style); }
  /**
   * Alias for `nodeNoStateStyle(style)`.
   *
   * @public
   * @apiSection Interaction
   * @param {object} style - Node style.
   * @returns {object|null|Helios} Result of `nodeNoStateStyle(style)`.
   */
  setNodeNoStateStyle(style) { return this.nodeNoStateStyle(style); }
  /**
   * Alias for `edgeNoStateStyle(style)`.
   *
   * @public
   * @apiSection Interaction
   * @param {object} style - Edge style.
   * @returns {object|null|Helios} Result of `edgeNoStateStyle(style)`.
   */
  setEdgeNoStateStyle(style) { return this.edgeNoStateStyle(style); }
  /**
   * Alias for `nodeHoverStyle(style)`.
   *
   * @public
   * @apiSection Interaction
   * @param {object} style - Node hover style.
   * @returns {object|null|Helios} Result of `nodeHoverStyle(style)`.
   */
  setNodeHoverStyle(style) { return this.nodeHoverStyle(style); }
  /**
   * Alias for `edgeHoverStyle(style)`.
   *
   * @public
   * @apiSection Interaction
   * @param {object} style - Edge hover style.
   * @returns {object|null|Helios} Result of `edgeHoverStyle(style)`.
   */
  setEdgeHoverStyle(style) { return this.edgeHoverStyle(style); }
  /**
   * Alias for `hoverStyleFromHighlight(value)`.
   *
   * @public
   * @apiSection Interaction
   * @param {boolean} value - Enable hover style from highlight.
   * @returns {boolean|Helios} Result of `hoverStyleFromHighlight(value)`.
   */
  setHoverStyleFromHighlight(value) { return this.hoverStyleFromHighlight(value); }
  /**
   * Alias for `highlightConnectedEdges(value)`.
   *
   * @public
   * @apiSection Interaction
   * @param {boolean} value - Enable connected-edge highlighting.
   * @returns {boolean|Helios} Result of `highlightConnectedEdges(value)`.
   */
  setHighlightConnectedEdges(value) { return this.highlightConnectedEdges(value); }

  /**
   * Enable layout execution and optionally request a layout algorithm or parameters.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {string|object|null} [algo=null] - Optional layout type or parameter object.
   * @param {object|null} [params=null] - Optional parameters when `algo` is a string.
   * @returns {Helios} This Helios instance.
   */
  startLayout(algo = null, params = null) {
    const requestedAlgo = typeof algo === 'string' ? algo : null;
    const requestedParams = params ?? (requestedAlgo ? null : algo);
    this.scheduler.setLayoutEnabled(true, 'user');
    this._requestLayoutReheat('user');
    this.scheduler.requestLayout('user');
    if (requestedAlgo || requestedParams) {
      this.debug.log('layout', 'startLayout called', { algo: requestedAlgo, params: requestedParams });
    }
    return this;
  }

  /**
   * Disable layout execution.
   *
   * @public
   * @apiSection Layout And Positions
   * @param {string} [reason='user'] - Reason recorded for the scheduler state change.
   * @returns {Helios} This Helios instance.
   */
  stopLayout(reason = 'user') {
    this.scheduler.setLayoutEnabled(false, reason);
    return this;
  }

  /**
   * Schedule a render frame.
   *
   * @public
   * @apiSection Rendering And Picking
   * @returns {Helios} This Helios instance.
   */
  requestRender() {
    this.scheduler.requestRender();
    return this;
  }

  /**
   * Render one frame immediately when manual rendering is enabled.
   *
   * @public
   * @apiSection Rendering And Picking
   * @returns {void}
   */
  performRendering() {
    if (!this.manualRendering) {
      console.warn('performRendering() should only be called when manualRendering option is enabled');
      return;
    }
    if (!this.firstGeometryUpdateComplete) {
      console.warn('performRendering() called before initialization is complete');
      return;
    }
    // Update geometry if needed
    // if (this.mappersDirty) {
    //   this.visuals.applyMappers({
    //     nodeMapper: this.nodeMapper.toCombinedMapper(),
    //     edgeMapper: this.edgeMapper.toCombinedMapper(),
    //   });
    //   this.mappersDirty = false;
    // }
    const timestamp = performance.now();
    if (this._shouldSuppressStartupRender(timestamp)) {
      this._refreshLargeNetworkStartupFit();
      return;
    }
    this._refreshLargeNetworkStartupFit({ force: true });
    this._runInterpolationRenderPump(timestamp);
    this._finishStartupFirstVisibleFrame();
    const renderNetwork = this._getRenderNetwork();
    // Create frame and render
    const frame = {
      network: renderNetwork,
      timestamp,
      camera: this.renderer?.camera,
    };
    this.attributeTracker?.render(frame, true);
    if (this.renderer && typeof this.renderer.render === 'function') {
      this.counters.renderFrames = bumpCounter(this.counters.renderFrames);
      this.renderer.render(frame, this.size);
    }
  }

  /**
   * Enable offscreen attribute tracking for picking.
   *
   * @public
   * @apiSection Rendering And Picking
   * @param {string} [nodeAttribute='$index'] - Node attribute to encode into the tracking target.
   * @param {string|null} [edgeAttribute=null] - Edge attribute to encode into the tracking target.
   * @param {object} [options] - Tracking resolution and auto-update options.
   * @returns {AttributeTracker|null} Attribute tracker instance, or `null` before renderer initialization.
   */
  enableAttributeTracking(nodeAttribute = '$index', edgeAttribute = null, options = {}) {
    if (!this.attributeTracker && this.renderer) {
      this.attributeTracker = new AttributeTracker(this.renderer);
    }
    this.attributeTracker?.enable(nodeAttribute, edgeAttribute, options);
    const updateOptions = {
      autoUpdate: options.autoUpdate ?? this.attributeUpdateOptions.autoUpdate,
      maxFps: options.autoUpdateMaxFps ?? this.attributeUpdateOptions.maxFps,
      frameSkip: options.autoUpdateFrameSkip ?? this.attributeUpdateOptions.frameSkip,
    };
    this.attributeUpdateOptions = updateOptions;
    this.scheduler.configureAttributeUpdates(updateOptions);
    return this.attributeTracker;
  }

  /**
   * Disable attribute tracking for a scope or for all scopes.
   *
   * @public
   * @apiSection Rendering And Picking
   * @param {'node'|'edge'|string} [scope] - Scope to disable. Omit to disable all configured tracking.
   * @returns {void}
   */
  disableAttributeTracking(scope) {
    this.attributeTracker?.disable(scope);
  }

  /**
   * Render the attribute-tracking target for the current frame.
   *
   * @public
   * @apiSection Rendering And Picking
   * @returns {Promise<object|null>} Tracking render result, or `null` when tracking is disabled.
   */
  async renderAttributeTracking() {
    if (!this.attributeTracker) return null;
    const renderNetwork = this._getRenderNetwork();
    const frame = {
      network: renderNetwork,
      timestamp: performance.now(),
      camera: this.renderer?.camera,
    };
    return this.attributeTracker.render(frame, true);
  }

  /**
   * Pick encoded node and edge attributes at viewport coordinates.
   *
   * @public
   * @apiSection Rendering And Picking
   * @param {number} clientX - Viewport x coordinate.
   * @param {number} clientY - Viewport y coordinate.
   * @returns {Promise<{node:number, edge:number}>} Picked node and edge ids, or `-1` for misses.
   */
  async pickAttributesAt(clientX, clientY) {
    if (!this.attributeTracker) return { node: -1, edge: -1 };
    await this.renderAttributeTracking();
    return this.attributeTracker.pick(clientX, clientY);
  }

  /**
   * Returns a Map of framebuffer/attachment references to monotonically
   * increasing "version" counters (wrapping at Number.MAX_SAFE_INTEGER).
   *
   * Keys are live object references (e.g. RenderTarget instances, WebGLFramebuffer,
   * GPUTexture) so they can be used for identity comparisons.
   */
  getFramebufferVersionsByRefMap() {
    const versions = new Map();

    const addAttributeTrackerTargets = (tracker) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      if (targets.node) versions.set(targets.node, counters.node ?? 0);
      if (targets.edge) versions.set(targets.edge, counters.edge ?? 0);
      if (targets.depthTargets?.node) versions.set(targets.depthTargets.node, counters.nodeDepth ?? 0);
      if (targets.depthTargets?.edge) versions.set(targets.depthTargets.edge, counters.edgeDepth ?? 0);
    };

    addAttributeTrackerTargets(this.attributeTracker);
    addAttributeTrackerTargets(this.indexPickingTracker);

    if (this.renderer?.renderTarget) {
      versions.set(this.renderer.renderTarget, this.counters?.renderFrames ?? 0);
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      versions.set(graphLayer.weightedFramebuffer, graphLayer.counters?.weightedFramebufferRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.color) {
      versions.set(graphLayer.weightedTextures.color, graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.weight) {
      versions.set(graphLayer.weightedTextures.weight, graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }

    return versions;
  }

  /**
   * Returns framebuffer/attachment information keyed by a meaningful name.
   * Values include the version counter and a minimal shape description.
   *
   * Key format conventions:
   * - `attributes.<attributeName>.<scope>.<tracking|picking>[.<depth>]`
   * - `render.<variation>`
   */
  getFramebufferInformation() {
    const info = {};

    const set = (key, value) => {
      if (!key) return;
      info[key] = value;
    };

    const describeRenderTarget = (target, extra = {}) => {
      if (!target) return { version: 0, ...extra };
      const base = {
        type: target.type ?? null,
        width: target.width ?? null,
        height: target.height ?? null,
      };
      return { ...base, ...extra };
    };

    const addTracker = (tracker, variant) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      const nodeAttr = tracker.nodeAttribute ?? null;
      const edgeAttr = tracker.edgeAttribute ?? null;
      if (nodeAttr && targets.node) {
        set(
          `attributes.${nodeAttr}.node.${variant}`,
          { ...describeRenderTarget(targets.node), version: counters.node ?? 0 },
        );
      }
      if (edgeAttr && targets.edge) {
        set(
          `attributes.${edgeAttr}.edge.${variant}`,
          { ...describeRenderTarget(targets.edge), version: counters.edge ?? 0 },
        );
      }
      if (tracker.options?.trackDepth === true) {
        if (nodeAttr && targets.depthTargets?.node) {
          set(
            `attributes.${nodeAttr}.node.${variant}.depth`,
            { ...describeRenderTarget(targets.depthTargets.node), version: counters.nodeDepth ?? 0 },
          );
        }
        if (edgeAttr && targets.depthTargets?.edge) {
          set(
            `attributes.${edgeAttr}.edge.${variant}.depth`,
            { ...describeRenderTarget(targets.depthTargets.edge), version: counters.edgeDepth ?? 0 },
          );
        }
      }
    };

    addTracker(this.attributeTracker, 'tracking');
    addTracker(this.indexPickingTracker, 'picking');

    const device = this.renderer?.device ?? null;
    const renderTarget = this.renderer?.renderTarget ?? null;
    if (device?.type === 'webgl2') {
      set(
        renderTarget ? 'render.webgl.target' : 'render.webgl.default',
        { ...describeRenderTarget(renderTarget, { type: 'webgl2' }), version: device.counters?.beginFrame ?? 0 },
      );
      set('render.webgl.present', { type: 'webgl2', version: device.counters?.presentFramebuffer ?? 0 });
    } else if (device?.type === 'webgpu') {
      set(
        renderTarget ? 'render.webgpu.target' : 'render.webgpu.swapchain',
        { ...describeRenderTarget(renderTarget, { type: 'webgpu' }), version: device.counters?.beginFrame ?? 0 },
      );
      set(
        'render.webgpu.depth',
        {
          type: 'webgpu',
          width: renderTarget?.width ?? this.size?.width ?? null,
          height: renderTarget?.height ?? this.size?.height ?? null,
          version: device.counters?.beginFrame ?? 0,
        },
      );
      set('render.webgpu.present', { type: 'webgpu', version: device.counters?.presentFramebuffer ?? 0 });
    } else if (this.renderer) {
      set('render.main', { type: 'unknown', version: this.counters?.renderFrames ?? 0 });
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      set(
        'render.weighted.webgl.framebuffer',
        {
          type: 'webgl2',
          width: graphLayer.weightedSize?.width ?? null,
          height: graphLayer.weightedSize?.height ?? null,
          version: graphLayer.counters?.weightedFramebufferRenders ?? 0,
        },
      );
    }
    if (graphLayer?.weightedTextures?.color) {
      set(
        'render.weighted.webgpu.color',
        {
          type: 'webgpu',
          width: graphLayer.weightedTextures?.width ?? null,
          height: graphLayer.weightedTextures?.height ?? null,
          format: graphLayer.weightedTextures?.color?.format ?? null,
          version: graphLayer.counters?.weightedAttachmentRenders ?? 0,
        },
      );
    }
    if (graphLayer?.weightedTextures?.weight) {
      set(
        'render.weighted.webgpu.weight',
        {
          type: 'webgpu',
          width: graphLayer.weightedTextures?.width ?? null,
          height: graphLayer.weightedTextures?.height ?? null,
          format: graphLayer.weightedTextures?.weight?.format ?? null,
          version: graphLayer.counters?.weightedAttachmentRenders ?? 0,
        },
      );
    }

    return info;
  }

  /**
   * Returns an object keyed by a meaningful framebuffer name, where each value
   * is the version counter.
   *
   * Key format conventions:
   * - `attributes.<attributeName>.<scope>.<tracking|picking>[.<depth>]`
   * - `render.<variation>`
   */
  getFramebufferVersions() {
    const summary = {};

    const addEntry = (key, version) => {
      if (!key) return;
      summary[key] = version ?? 0;
    };

    const addTracker = (tracker, variant) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      const nodeAttr = tracker.nodeAttribute ?? null;
      const edgeAttr = tracker.edgeAttribute ?? null;
      if (nodeAttr && targets.node) {
        addEntry(`attributes.${nodeAttr}.node.${variant}`, counters.node ?? 0);
      }
      if (edgeAttr && targets.edge) {
        addEntry(`attributes.${edgeAttr}.edge.${variant}`, counters.edge ?? 0);
      }
      if (tracker.options?.trackDepth === true) {
        if (nodeAttr && targets.depthTargets?.node) {
          addEntry(`attributes.${nodeAttr}.node.${variant}.depth`, counters.nodeDepth ?? 0);
        }
        if (edgeAttr && targets.depthTargets?.edge) {
          addEntry(`attributes.${edgeAttr}.edge.${variant}.depth`, counters.edgeDepth ?? 0);
        }
      }
    };

    addTracker(this.attributeTracker, 'tracking');
    addTracker(this.indexPickingTracker, 'picking');

    const device = this.renderer?.device ?? null;
    const renderTarget = this.renderer?.renderTarget ?? null;
    if (device?.type === 'webgl2') {
      addEntry(renderTarget ? 'render.webgl.target' : 'render.webgl.default', device.counters?.beginFrame ?? 0);
      addEntry('render.webgl.present', device.counters?.presentFramebuffer ?? 0);
    } else if (device?.type === 'webgpu') {
      addEntry(renderTarget ? 'render.webgpu.target' : 'render.webgpu.swapchain', device.counters?.beginFrame ?? 0);
      addEntry('render.webgpu.depth', device.counters?.beginFrame ?? 0);
      addEntry('render.webgpu.present', device.counters?.presentFramebuffer ?? 0);
    } else if (this.renderer) {
      addEntry('render.main', this.counters?.renderFrames ?? 0);
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      addEntry('render.weighted.webgl.framebuffer', graphLayer.counters?.weightedFramebufferRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.color) {
      addEntry('render.weighted.webgpu.color', graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.weight) {
      addEntry('render.weighted.webgpu.weight', graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }

    return summary;
  }

  // Backwards-compatible alias: use getFramebufferInformation() for string-keyed details.
  /**
   * Return framebuffer resource versions keyed by reference for renderer diagnostics.
   *
   * @public
   * @apiSection Rendering And Picking
   * @returns {object} Plain object mapping framebuffer references to version numbers.
   */
  getFramebufferVersionsByRef() {
    return this.getFramebufferInformation();
  }

  /**
   * Enable pointer picking for nodes.
   *
   * @public
   * @apiSection Rendering And Picking
   * @param {object} [options] - Picking behavior options.
   * @returns {Helios} This Helios instance.
   */
  enableNodePicking(options = {}) {
    this._picking.node.enabled = true;
    this._picking.node.hoverEnabled = options.hoverEnabled !== false && options.trackHover !== false;
    this._mergePickingOptions(options);
    this._applyPickingConfig();
    return this;
  }

  /**
   * Enable pointer picking for edges.
   *
   * @public
   * @apiSection Rendering And Picking
   * @param {object} [options] - Picking behavior options.
   * @returns {Helios} This Helios instance.
   */
  enableEdgePicking(options = {}) {
    this._picking.edge.enabled = true;
    this._picking.edge.hoverEnabled = options.hoverEnabled !== false && options.trackHover !== false;
    this._mergePickingOptions(options);
    this._applyPickingConfig();
    return this;
  }

  /**
   * Disable node pointer picking.
   *
   * @public
   * @apiSection Rendering And Picking
   * @returns {Helios} This Helios instance.
   */
  disableNodePicking() {
    this._picking.node.enabled = false;
    this._applyPickingConfig();
    return this;
  }

  /**
   * Disable edge pointer picking.
   *
   * @public
   * @apiSection Rendering And Picking
   * @returns {Helios} This Helios instance.
   */
  disableEdgePicking() {
    this._picking.edge.enabled = false;
    this._applyPickingConfig();
    return this;
  }

  _mergePickingOptions(options = {}) {
    if (!options) return;
    if (options.resolutionScale != null) {
      const scale = Number(options.resolutionScale);
      if (Number.isFinite(scale) && scale > 0) {
        this._picking.options.resolutionScale = scale;
      }
    }
    if (options.trackDepth != null) {
      this._picking.options.trackDepth = options.trackDepth === true;
    }
    if (options.maxFps != null) {
      const maxFps = Number(options.maxFps);
      if (Number.isFinite(maxFps) && maxFps > 0) {
        this._picking.options.maxFps = Math.floor(maxFps);
      }
    }
    if (options.clickRequiresStationary != null) {
      this._picking.options.clickRequiresStationary = options.clickRequiresStationary !== false;
    }
    if (options.clickMoveTolerancePx != null) {
      const tolerance = Number(options.clickMoveTolerancePx);
      if (Number.isFinite(tolerance) && tolerance >= 0) {
        this._picking.options.clickMoveTolerancePx = tolerance;
      }
    }
    if (options.suppressClickAfterWheelMs != null) {
      const ms = Number(options.suppressClickAfterWheelMs);
      if (Number.isFinite(ms) && ms >= 0) {
        this._picking.options.suppressClickAfterWheelMs = ms;
      }
    }
  }

  _applyPickingConfig() {
    const nodeEnabled = this._picking.node.enabled;
    const edgeEnabled = this._picking.edge.enabled;
    if (!nodeEnabled && !edgeEnabled) {
      this._detachPickingListeners();
      this._resetHover('disabled');
      this.indexPickingTracker?.destroy?.();
      this.indexPickingTracker = null;
      this._reconcileAttributeUpdateConfig();
      return;
    }
    if (!this.renderer) {
      this.ready?.then?.(() => this._applyPickingConfig());
      return;
    }
    if (!this.indexPickingTracker) {
      this.indexPickingTracker = new AttributeTracker(this.renderer);
    }
    this.indexPickingTracker.enable(nodeEnabled ? '$index' : null, edgeEnabled ? '$index' : null, {
      resolutionScale: this._picking.options.resolutionScale,
      trackDepth: this._picking.options.trackDepth,
      autoRender: true,
    });
    this.indexPickingTracker.resize(this.size);
    this._attachPickingListeners();
    this._syncHoverTrackingState('config');
    this._reconcileAttributeUpdateConfig();
    this.scheduler.requestRender();
  }

  _reconcileAttributeUpdateConfig() {
    const manual = this.attributeUpdateOptions ?? { autoUpdate: false, maxFps: null, frameSkip: null };
    const pickingEnabled = this._hasHoverPickingEnabled();
    const picking = pickingEnabled
      ? { autoUpdate: true, maxFps: this._picking.options.maxFps ?? 30, frameSkip: 0 }
      : { autoUpdate: false, maxFps: null, frameSkip: null };
    const autoUpdate = manual.autoUpdate === true || picking.autoUpdate === true;
    if (!autoUpdate) {
      this.scheduler.configureAttributeUpdates({ autoUpdate: false });
      return;
    }
    const enabledMaxFps = [];
    if (manual.autoUpdate === true) enabledMaxFps.push(manual.maxFps);
    if (picking.autoUpdate === true) enabledMaxFps.push(picking.maxFps);
    const effectiveFps = enabledMaxFps.map((value) => (Number.isFinite(value) && value > 0 ? value : 60));
    const combinedMaxFps = Math.max(...effectiveFps);
    const frameSkip = 0;
    this.scheduler.configureAttributeUpdates({ autoUpdate: true, maxFps: combinedMaxFps, frameSkip });
  }

  _getInteractionCanvas() {
    return this.layers?.canvas ?? this.renderer?.canvas ?? null;
  }

  _hasHoverPickingEnabled() {
    return (
      (this._picking.node.enabled === true && this._picking.node.hoverEnabled !== false)
      || (this._picking.edge.enabled === true && this._picking.edge.hoverEnabled !== false)
    );
  }

  _resolveHoverHit(picked) {
    if (!picked) return null;
    const nodeEnabled = this._picking.node.enabled === true && this._picking.node.hoverEnabled !== false;
    const edgeEnabled = this._picking.edge.enabled === true && this._picking.edge.hoverEnabled !== false;
    const nodeHit = nodeEnabled ? picked.node : -1;
    const edgeHit = edgeEnabled ? picked.edge : -1;
    const nodeDepth = picked.nodeDepth;
    const edgeDepth = picked.edgeDepth;
    if (nodeHit < 0 && edgeHit < 0) return { kind: null, index: -1, depth: null };
    const trackDepth = this._picking.options.trackDepth === true;
    if (trackDepth && nodeHit >= 0 && edgeHit >= 0 && Number.isFinite(nodeDepth) && Number.isFinite(edgeDepth)) {
      return nodeDepth <= edgeDepth
        ? { kind: 'node', index: nodeHit, depth: nodeDepth }
        : { kind: 'edge', index: edgeHit, depth: edgeDepth };
    }
    if (nodeHit >= 0) return { kind: 'node', index: nodeHit, depth: Number.isFinite(nodeDepth) ? nodeDepth : null };
    return { kind: 'edge', index: edgeHit, depth: Number.isFinite(edgeDepth) ? edgeDepth : null };
  }

  _syncHoverTrackingState(reason = 'config') {
    if (!this._hasHoverPickingEnabled()) {
      if (this._picking.hoverThrottleTimer) {
        clearTimeout(this._picking.hoverThrottleTimer);
        this._picking.hoverThrottleTimer = null;
      }
      if (this._picking.cameraIdleTimer) {
        clearTimeout(this._picking.cameraIdleTimer);
        this._picking.cameraIdleTimer = null;
      }
      this._picking._rerun = false;
      this._resetHover(reason);
      return;
    }
    const prev = this._picking.hover;
    if (prev.kind === 'node' && this._picking.node.hoverEnabled === false) {
      this._resetHover(reason);
      return;
    }
    if (prev.kind === 'edge' && this._picking.edge.hoverEnabled === false) {
      this._resetHover(reason);
    }
  }

  _attachPickingListeners() {
    const canvas = this._getInteractionCanvas();
    if (!canvas || this._pickingListenersAttached) return;
    canvas.addEventListener('pointerdown', this._boundPickingHandlers.down, { passive: true });
    canvas.addEventListener('pointermove', this._boundPickingHandlers.move, { passive: true });
    canvas.addEventListener('pointerup', this._boundPickingHandlers.up, { passive: true });
    canvas.addEventListener('pointercancel', this._boundPickingHandlers.cancel, { passive: true });
    canvas.addEventListener('pointerleave', this._boundPickingHandlers.leave, { passive: true });
    canvas.addEventListener('wheel', this._boundPickingHandlers.wheel, { passive: true });
    canvas.addEventListener('click', this._boundPickingHandlers.click);
    canvas.addEventListener('dblclick', this._boundPickingHandlers.dblclick);
    this._pickingListenersAttached = true;
  }

  _detachPickingListeners() {
    const canvas = this._getInteractionCanvas();
    if (!canvas || !this._pickingListenersAttached) return;
    canvas.removeEventListener('pointerdown', this._boundPickingHandlers.down);
    canvas.removeEventListener('pointermove', this._boundPickingHandlers.move);
    canvas.removeEventListener('pointerup', this._boundPickingHandlers.up);
    canvas.removeEventListener('pointercancel', this._boundPickingHandlers.cancel);
    canvas.removeEventListener('pointerleave', this._boundPickingHandlers.leave);
    canvas.removeEventListener('wheel', this._boundPickingHandlers.wheel);
    canvas.removeEventListener('click', this._boundPickingHandlers.click);
    canvas.removeEventListener('dblclick', this._boundPickingHandlers.dblclick);
    this._pickingListenersAttached = false;
  }

  _handlePointerDown(event) {
    const g = this._picking.gesture;
    if (g.pointers.size === 0) {
      g.moved = false;
      g.cameraMoved = false;
    }
    g.active = true;
    g.pointers.set(event.pointerId, {
      pointerId: event.pointerId,
      pointerType: event.pointerType ?? 'mouse',
      startClientX: event.clientX ?? 0,
      startClientY: event.clientY ?? 0,
      clientX: event.clientX ?? 0,
      clientY: event.clientY ?? 0,
    });
    // Keep wheelZoomed/lastWheelAt so we can suppress click after a zoom gesture.
  }

  async _handlePointerUp(event) {
    const g = this._picking.gesture;
    const pointer = g.pointers.get(event?.pointerId);
    if (pointer && pointer.pointerType === 'touch') {
      g.lastTouchAt = performance.now();
    }
    if (event?.type !== 'pointercancel' && pointer && pointer.pointerType === 'touch' && !g.moved && !g.cameraMoved) {
      await this._handleTouchTap(event, pointer);
    }
    g.pointers.delete(event?.pointerId);
    g.active = g.pointers.size > 0;
  }

  _handlePointerMove(event) {
    const canvas = this._getInteractionCanvas();
    if (!canvas) return;
    const g = this._picking.gesture;
    const pointer = g.pointers.get(event.pointerId);
    if (pointer) {
      const startPoints = Array.from(g.pointers.values(), (entry) => ({
        pointerId: entry.pointerId,
        clientX: entry.startClientX,
        clientY: entry.startClientY,
      }));
      pointer.clientX = event.clientX ?? 0;
      pointer.clientY = event.clientY ?? 0;
      const classification = classifyGestureForSuppression(
        startPoints,
        g.pointers.values(),
        this._picking.options.clickMoveTolerancePx ?? 4,
      );
      if (classification.moved) {
        g.moved = true;
        g.cameraMoved = true;
      }
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this._picking.pointer = {
      x,
      y,
      clientX: event.clientX,
      clientY: event.clientY,
      inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
    };
    const touchActive = Array.from(g.pointers.values()).some((entry) => entry.pointerType === 'touch');
    // Suppress hover while dragging or during touch gestures.
    if ((event.buttons && event.buttons !== 0) || touchActive) {
      this._picking.suppressHover = true;
      this._resetHover('camera');
      return;
    }
    this._picking.suppressHover = false;
    this._scheduleHoverPick();
  }

  _handlePointerLeave() {
    this._picking.pointer.inside = false;
    this._picking.suppressHover = false;
    if (this._picking.hoverThrottleTimer) {
      clearTimeout(this._picking.hoverThrottleTimer);
      this._picking.hoverThrottleTimer = null;
    }
    this._picking.gesture.active = false;
    this._picking.gesture.pointers.clear();
    this._resetHover('leave');
  }

  _handleWheel(_) {
    // Zoom can trigger camera changes; avoid hover spam while the camera is moving.
    this._picking.suppressHover = true;
    this._picking.gesture.wheelZoomed = true;
    this._picking.gesture.lastWheelAt = performance.now();
    this._resetHover('camera');
    this._scheduleCameraIdleHoverPick();
  }

  async _handleTouchTap(event, pointer) {
    const g = this._picking.gesture;
    const now = performance.now();
    g.suppressNativeClickUntil = now + 700;
    const dx = (event.clientX ?? 0) - (g.lastTapClientX ?? 0);
    const dy = (event.clientY ?? 0) - (g.lastTapClientY ?? 0);
    const isDouble = Number.isFinite(g.lastTapAt) && now - g.lastTapAt <= 320 && Math.hypot(dx, dy) <= 24;
    g.lastTapAt = now;
    g.lastTapClientX = event.clientX ?? pointer?.clientX ?? 0;
    g.lastTapClientY = event.clientY ?? pointer?.clientY ?? 0;
    await this._handlePointerClick({
      ...event,
      button: 0,
      altKey: event.altKey === true,
      ctrlKey: event.ctrlKey === true,
      metaKey: event.metaKey === true,
      shiftKey: event.shiftKey === true,
      clientX: event.clientX ?? pointer?.clientX ?? 0,
      clientY: event.clientY ?? pointer?.clientY ?? 0,
      pointerType: 'touch',
    }, isDouble, { synthetic: true });
  }

  async _handlePointerClick(event, isDouble, options = {}) {
    if (!this.indexPickingTracker) return;
    const synthetic = options.synthetic === true;
    const clickRequiresStationary = this._picking.options.clickRequiresStationary !== false;
    const g = this._picking.gesture;
    const now = performance.now();
    if (!synthetic && Number.isFinite(g.suppressNativeClickUntil) && now <= g.suppressNativeClickUntil) {
      return;
    }
    if (clickRequiresStationary && !isDouble) {
      const suppressWheelMs = this._picking.options.suppressClickAfterWheelMs ?? 200;
      const wheelRecently = Number.isFinite(g.lastWheelAt) && now - g.lastWheelAt <= suppressWheelMs;
      if (g.cameraMoved || g.moved || wheelRecently) {
        return;
      }
    }
    const canvas = this._getInteractionCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    await this._ensureIndexPickingTargets();
    const picked = await this.indexPickingTracker.pick(x, y);
    const hit = this._resolvePrimaryHit(picked);
    const resolved = hit ?? { kind: null, index: -1, depth: null };
    const baseDetail = {
      kind: resolved.kind,
      index: resolved.index,
      node: resolved.kind === 'node' ? resolved.index : -1,
      edge: resolved.kind === 'edge' ? resolved.index : -1,
      depth: resolved.depth ?? null,
      x,
      y,
      clientX: event.clientX,
      clientY: event.clientY,
      modifiers: {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      },
      button: event.button,
    };

    this.emit(isDouble ? EVENTS.GRAPH_DBLCLICK : EVENTS.GRAPH_CLICK, baseDetail);

    if (resolved.kind === 'node' && resolved.index >= 0) {
      this.emit(isDouble ? EVENTS.NODE_DBLCLICK : EVENTS.NODE_CLICK, baseDetail);
    } else if (resolved.kind === 'edge' && resolved.index >= 0) {
      this.emit(isDouble ? EVENTS.EDGE_DBLCLICK : EVENTS.EDGE_CLICK, baseDetail);
    }
  }

  _scheduleCameraMove(changeDetail = null) {
    if (changeDetail?.origin || !this._pendingCameraMoveDetail) {
      this._pendingCameraMoveDetail = changeDetail ?? null;
    }
    if (this._cameraMoveRaf != null) return;
    this._cameraMoveRaf = requestAnimationFrame((ts) => {
      this._cameraMoveRaf = null;
      const cameraChange = this._pendingCameraMoveDetail ?? null;
      this._pendingCameraMoveDetail = null;
      const camera = this.renderer?.camera ?? null;
      const detail = {
        timestamp: ts,
        camera,
        origin: cameraChange?.origin ?? null,
        action: cameraChange?.action ?? null,
        change: cameraChange,
        state: camera
          ? {
              mode: camera.mode,
              projection: camera.projection,
              zoom: camera.zoom,
              distance: camera.distance,
              viewport: camera.viewport ? { ...camera.viewport } : null,
            }
          : null,
      };
      this.emit(EVENTS.CAMERA_MOVE, detail);
      // Avoid hover spam during camera movement; resample once the camera settles.
      this._picking.suppressHover = true;
      const g = this._picking.gesture;
      g.lastCameraMoveAt = performance.now();
      if (g.active) {
        g.cameraMoved = true;
      }
      this._resetHover('camera');
      this._scheduleCameraIdleHoverPick();
    });
  }

  _scheduleCameraIdleHoverPick() {
    if (!this._hasHoverPickingEnabled()) return;
    if (this._picking.cameraIdleTimer) {
      clearTimeout(this._picking.cameraIdleTimer);
    }
    this._picking.cameraIdleTimer = setTimeout(() => {
      this._picking.cameraIdleTimer = null;
      this._picking.suppressHover = false;
      if (this._picking.pointer.inside) {
        this._scheduleHoverPick();
      }
    }, 80);
  }

  _scheduleHoverPick() {
    if (!this._hasHoverPickingEnabled()) return;
    if (this._picking._raf != null) return;
    this._picking._raf = requestAnimationFrame(() => {
      this._picking._raf = null;
      void this._runHoverPick();
    });
  }

  async _ensureIndexPickingTargets() {
    if (!this.indexPickingTracker) return;
    const base = this.scheduler?.currentFrame ?? null;
    const renderNetwork = this._getRenderNetwork();
    // Scheduler.currentFrame may exist before the renderer/camera is ready.
    // Always force a current camera/network so the AttributeTracker can render.
    const frame = {
      ...(base ?? null),
      network: renderNetwork,
      timestamp: performance.now(),
      camera: this.renderer?.camera,
    };
    await this.indexPickingTracker.render(frame, true);
  }

  _resolvePrimaryHit(picked) {
    if (!picked) return null;
    const nodeEnabled = this._picking.node.enabled;
    const edgeEnabled = this._picking.edge.enabled;
    const nodeHit = nodeEnabled ? picked.node : -1;
    const edgeHit = edgeEnabled ? picked.edge : -1;
    const nodeDepth = picked.nodeDepth;
    const edgeDepth = picked.edgeDepth;
    if (nodeHit < 0 && edgeHit < 0) return { kind: null, index: -1, depth: null };
    const trackDepth = this._picking.options.trackDepth === true;
    if (trackDepth && nodeHit >= 0 && edgeHit >= 0 && Number.isFinite(nodeDepth) && Number.isFinite(edgeDepth)) {
      return nodeDepth <= edgeDepth
        ? { kind: 'node', index: nodeHit, depth: nodeDepth }
        : { kind: 'edge', index: edgeHit, depth: edgeDepth };
    }
    if (nodeHit >= 0) return { kind: 'node', index: nodeHit, depth: Number.isFinite(nodeDepth) ? nodeDepth : null };
    return { kind: 'edge', index: edgeHit, depth: Number.isFinite(edgeDepth) ? edgeDepth : null };
  }

  async _runHoverPick() {
    if (!this.indexPickingTracker) return;
    if (!this._hasHoverPickingEnabled()) return;
    if (this._picking.suppressHover) return;
    if (!this._picking.pointer.inside) {
      this._resetHover('outside');
      return;
    }
    const maxFps = this._picking.options.maxFps ?? 30;
    const interval = maxFps > 0 ? (1000 / maxFps) : 0;
    const now = performance.now();
    if (interval > 0 && now - this._picking._lastPickTime < interval) {
      if (!this._picking.hoverThrottleTimer) {
        const remaining = Math.max(0, interval - (now - this._picking._lastPickTime));
        this._picking.hoverThrottleTimer = setTimeout(() => {
          this._picking.hoverThrottleTimer = null;
          this._scheduleHoverPick();
        }, remaining);
      }
      return;
    }
    if (this._picking._inFlight) {
      this._picking._rerun = true;
      return;
    }
    this._picking._inFlight = true;
    this._picking._lastPickTime = now;
    try {
      await this._ensureIndexPickingTargets();
      const { x, y, clientX, clientY } = this._picking.pointer;
      const picked = await this.indexPickingTracker.pick(x, y);
      const hit = this._resolveHoverHit(picked);
      const prev = this._picking.hover;
      const next = hit ?? { kind: null, index: -1, depth: null };
      if (prev.kind === next.kind && prev.index === next.index) return;
      if (prev.kind === 'node' && prev.index >= 0) {
        this.emit(EVENTS.NODE_HOVER, { state: 'out', index: prev.index, depth: prev.depth, x, y, clientX, clientY });
      } else if (prev.kind === 'edge' && prev.index >= 0) {
        this.emit(EVENTS.EDGE_HOVER, { state: 'out', index: prev.index, depth: prev.depth, x, y, clientX, clientY });
      }
      if (next.kind === 'node' && next.index >= 0) {
        this.emit(EVENTS.NODE_HOVER, { state: 'in', index: next.index, depth: next.depth, x, y, clientX, clientY });
      } else if (next.kind === 'edge' && next.index >= 0) {
        this.emit(EVENTS.EDGE_HOVER, { state: 'in', index: next.index, depth: next.depth, x, y, clientX, clientY });
      }
      this._picking.hover = { ...next };
      this._labels?.requestFullReselect?.('hover-change');
      this.scheduler?.requestRender?.();
    } finally {
      this._picking._inFlight = false;
      if (this._picking._rerun) {
        this._picking._rerun = false;
        this._scheduleHoverPick();
      }
    }
  }

  _resetHover(reason) {
    const prev = this._picking.hover;
    const { x, y, clientX, clientY } = this._picking.pointer ?? {};
    if (prev.kind === 'node' && prev.index >= 0) {
      this.emit(EVENTS.NODE_HOVER, {
        state: 'out',
        index: prev.index,
        depth: prev.depth,
        reason,
        x,
        y,
        clientX,
        clientY,
      });
    } else if (prev.kind === 'edge' && prev.index >= 0) {
      this.emit(EVENTS.EDGE_HOVER, {
        state: 'out',
        index: prev.index,
        depth: prev.depth,
        reason,
        x,
        y,
        clientX,
        clientY,
      });
    }
    this._picking.hover = { kind: null, index: -1, depth: null };
    this._labels?.requestFullReselect?.('hover-reset');
    this.scheduler?.requestRender?.();
  }

  async _initializeOptionalUI() {
    const requested = this.options?.ui ?? (this.debugEnabled ? true : false);
    if (requested === false || requested == null) return null;
    if (this.ui) return this.ui;
    const uiOptions = requested === true
      ? {}
      : (requested && typeof requested === 'object' ? requested : {});
    const hasUiTheme = hasOwnStringOption(uiOptions, 'theme');
    const themeOption = this._hasExplicitThemeOption && !hasUiTheme
      ? { theme: this._initialTheme ?? 'dark' }
      : {};
    const ui = new HeliosUI({ helios: this, ...themeOption, ...uiOptions });
    this.ui = ui;
    this._applyAutoThemeDefaults(this._autoThemeDefaults?.currentTheme ?? this._initialTheme ?? 'dark');
    this._syncQuickControlsTheme(ui.theme);
    const panels = Object.prototype.hasOwnProperty.call(uiOptions, 'panels')
      ? uiOptions.panels
      : (requested === true ? true : false);
    this._createOptionalUIPanels(ui, panels, uiOptions.panelOptions ?? uiOptions.panelsOptions ?? {});
    this._refreshPersistenceBaselineAfterUiInit();
    return ui;
  }

  _refreshPersistenceBaselineAfterUiInit() {
    this._pendingPersistenceBaselineRefresh = false;
  }

  _scheduleStorageOverrideTrackingReady() {
    if (typeof this.storage?.setOverrideTrackingReady !== 'function') return;
    this.storage.setOverrideTrackingReady(true);
  }

  _createOptionalUIPanels(ui, panels, panelOptions = {}) {
    if (!ui || panels === false || panels == null) return;
    const fullPanelList = ['demo', 'metrics', 'mappers', 'layout', 'legends', 'filter', 'camera', 'selection'];
    const normalizedBase = panels === true || panels === 'default' || panels === 'all'
      ? fullPanelList
      : (Array.isArray(panels) ? panels : [panels]);
    const normalized = normalizedBase.slice();
    if (this.debugEnabled && !normalized.some((entry) => String(entry ?? '').trim().toLowerCase() === 'debug')) {
      normalized.push('debug');
    }
    const creators = {
      demo: 'createDemoPanel',
      scene: 'createDemoPanel',
      data: 'createDemoPanel',
      mappers: 'createMappersPanel',
      layout: 'createLayoutPanel',
      legends: 'createLegendsPanel',
      filter: 'createFilterPanel',
      filters: 'createFilterPanel',
      camera: 'createCameraPanel',
      selection: 'createSelectionPanel',
      metrics: 'createMetricsPanel',
      debug: 'createDebugPanel',
    };
    for (const entry of normalized) {
      const key = String(entry ?? '').trim().toLowerCase();
      const method = creators[key];
      if (!method || typeof ui[method] !== 'function') continue;
      ui[method](panelOptions?.[key] ?? {});
    }
  }

  /**
   * Dispose renderer resources, UI bindings, workers, timers, and event listeners owned by this instance.
   *
   * @public
   * @apiSection Lifecycle
   * @returns {void}
   */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this._disconnectAutoCleanup();
    this._networkFileDropCleanup?.();
    this._networkFileDropCleanup = null;
    this._autoThemeDefaults?.cleanup?.();
    this._autoThemeDefaults?.stateCleanup?.();
    if (this._autoThemeDefaults) {
      this._autoThemeDefaults.cleanup = null;
      this._autoThemeDefaults.stateCleanup = null;
    }
    this.scheduler.stop();
    this.behaviors?.destroy?.();
    this._clearEdgeAdaptiveTimer('cameraIdleTimer');
    this._clearEdgeAdaptiveTimer('probeTimer');
    this._detachPositionDelegate(this._activePositionDelegate ?? this._positionsConfig?.delegate ?? null);
    this._activePositionDelegate = null;
    this._layout?.dispose?.();
    for (const entry of this._listenHandlers.values()) {
      this.removeEventListener(entry.type, entry.listener, entry.capture);
      entry.unsubscribeSignal?.();
    }
    this._listenHandlers.clear();
    this._pendingGraphLayerProps.clear();
    this._pendingRendererProps.clear();
    if (this.removeResizeListener) {
      this.removeResizeListener();
      this.removeResizeListener = null;
    }
    this._beforeUnloadUnsavedChangesCleanup?.();
    this._beforeUnloadUnsavedChangesCleanup = null;
    this._detachPickingListeners();
    this._destroyQuickControls();
    this._startupOverlay?.remove?.();
    this._startupOverlay = null;
    this.attributeTracker?.destroy?.();
    this.indexPickingTracker?.destroy?.();
    this.indexPickingTracker = null;
    this.storage?.destroy?.();
    this.ui?.destroy?.();
    this.ui = null;
    if (this.debugEnabled && typeof window !== 'undefined' && window.__helios === this) {
      delete window.__helios;
    }
    this.renderer?.destroy?.();
    this._densityLayer = null;
    this._labels?.destroy?.();
    this._labels = null;
    this._legends?.destroy?.();
    this._legends = null;
    if (this.options?.disposeNetworkOnDestroy !== false && this.network && typeof this.network.dispose === 'function') {
      try {
        this.network.dispose();
      } catch (error) {
        warnOnce(
          this,
          'destroy-network-dispose',
          'Helios: network disposal failed during destroy.',
          { error },
        );
      }
    }
    this.network = null;
    this.layers.destroy();
  }
}

export default Helios;
