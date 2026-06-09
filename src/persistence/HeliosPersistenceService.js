import {
  LocalStoragePreferenceStore,
  IndexedDBSessionStore,
} from './storage.js';
import {
  PERSISTENCE_KINDS,
  createDefaultPreferencesState,
  createPersistenceEnvelope,
  migratePersistenceEnvelope,
  parsePersistenceEnvelope,
  serializePersistenceEnvelope,
} from './schema.js';
import {
  HeliosSessionController,
  flattenVisualizationOverrides,
} from './HeliosSessionController.js';
import {
  BrowserPersistenceBackend,
  CustomPersistenceBackend,
  NetworkAttributePersistenceBackend,
  PersistenceRegistry,
  RemotePersistenceBackend,
} from './CentralizedPersistence.js';

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = cloneSerializable(entry);
    return next;
  }
  return value;
}

function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}

function defaultIdFactory() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `helios-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_NETWORK_AUTOSYNC_DEBOUNCE_MS = 2000;
const DEFAULT_POSITION_AUTOSYNC_DEBOUNCE_MS = 750;
const DEFAULT_SESSION_AUTOSYNC_DEBOUNCE_MS = 750;
const DEFAULT_AUTOSYNC_INTERACTION_IDLE_MS = 1000;
const DEFAULT_SESSION_RETENTION_MAX_SESSIONS = 20;
const DEFAULT_SESSION_RETENTION_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_SESSION_THUMBNAIL_MAX_WIDTH = 96;
const DEFAULT_SESSION_THUMBNAIL_MAX_HEIGHT = 64;
const DEFAULT_SESSION_THUMBNAIL_MAX_BYTES = 24 * 1024;
const LEGACY_UNFINISHED_WORKSPACES = new Set(['default', 'helios-web-next-basic-demo']);
const PERSISTENCE_STATUS_ALIASES = Object.freeze({
  camera: ['camera.pose', 'camera.controls', 'cameraControls', 'scene.dimension'],
  filter: ['filters', 'behaviors.filters.state'],
  filters: ['filter', 'behaviors.filters.state'],
  layout: ['behaviors.layout.state'],
  legends: ['behaviors.legends.state'],
  selection: ['behaviors.selection.state'],
  mappers: ['behaviors.mappers.state'],
  metrics: ['metrics.lastOutput'],
});

const BEHAVIOR_PERSISTENCE_ROOTS = Object.freeze({
  layout: 'layout',
  legends: 'legends',
  filters: 'filters',
  selection: 'selection',
});

function statusAliasTargets(path) {
  const target = String(path ?? '').trim();
  if (!target) return [];
  const aliases = PERSISTENCE_STATUS_ALIASES[target] ?? [];
  return Array.from(new Set([target, ...aliases].filter(Boolean)));
}

function mergeKeyState(a = 'default', b = 'default') {
  if (a === 'changed' || b === 'changed') return 'changed';
  if (a === 'partial' || b === 'partial') return 'partial';
  return 'default';
}

function applyDirtyAliases(dirtyState) {
  const next = {
    controls: { ...(dirtyState?.controls ?? {}) },
    sections: { ...(dirtyState?.sections ?? {}) },
    panels: { ...(dirtyState?.panels ?? {}) },
  };
  for (const root of Object.keys(PERSISTENCE_STATUS_ALIASES)) {
    const aliases = statusAliasTargets(root).filter((entry) => entry !== root);
    let state = next.panels[root] ?? next.sections[root] ?? next.controls[root] ?? 'default';
    for (const alias of aliases) {
      if (next.controls[alias] === 'changed') state = 'changed';
      else if (next.panels[alias] === 'changed' || next.sections[alias] === 'changed') state = 'changed';
      else if (state !== 'changed' && (next.panels[alias] === 'partial' || next.sections[alias] === 'partial')) state = 'partial';
      for (const path of Object.keys(next.controls)) {
        if (path === alias || path.startsWith(`${alias}.`)) {
          state = state === 'changed' || path === alias ? 'changed' : 'partial';
        }
      }
    }
    if (state !== 'default') next.panels[root] = state;
  }
  return next;
}

function normalizeSessionNickname(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function flattenObject(value, prefix, output) {
  if (!prefix) return;
  if (value instanceof Set) {
    output[prefix] = Array.from(value);
    return;
  }
  if (Array.isArray(value) || !value || typeof value !== 'object') {
    output[prefix] = cloneSerializable(value);
    return;
  }
  const entries = Object.entries(value);
  if (!entries.length) {
    output[prefix] = {};
    return;
  }
  for (const [key, entry] of entries) {
    flattenObject(entry, `${prefix}.${key}`, output);
  }
}

function behaviorScope(id) {
  const behaviorId = String(id ?? '').trim();
  if (behaviorId === 'interface' || behaviorId === 'exporter') return 'user';
  if (behaviorId === 'layout' && arguments.length > 1 && arguments[1] === 'running') return 'session';
  return 'network';
}

function behaviorDebounceMs(id) {
  return String(id ?? '').trim() === 'layout' ? 300 : 400;
}

function behaviorSnapshotForPersistence(id, behavior) {
  if (!behavior) return null;
  if (String(id ?? behavior.id ?? '') === 'interface' && typeof behavior.serializeInterfaceState === 'function') {
    return behavior.serializeInterfaceState();
  }
  if (typeof behavior.serialize === 'function') return behavior.serialize();
  if (typeof behavior.getPublicState === 'function') return behavior.getPublicState();
  return behavior.state ?? null;
}

function flattenBehaviorAliases(id, snapshot) {
  const behaviorId = String(id ?? '').trim();
  const root = BEHAVIOR_PERSISTENCE_ROOTS[behaviorId];
  if (!root || !snapshot || typeof snapshot !== 'object') return {};
  const aliases = {};
  if (behaviorId === 'layout') {
    const options = snapshot.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    if (Object.prototype.hasOwnProperty.call(options, 'layoutType')) aliases['layout.layoutType'] = options.layoutType;
    if (Object.prototype.hasOwnProperty.call(options, 'positionAttribute')) aliases['layout.positionAttribute'] = options.positionAttribute;
    if (Object.prototype.hasOwnProperty.call(options, 'running')) aliases['layout.running'] = options.running === true;
    if (options.parameters && typeof options.parameters === 'object') {
      for (const [key, value] of Object.entries(options.parameters)) {
        aliases[`layout.parameters.${key}`] = cloneSerializable(value);
      }
    }
    return aliases;
  }
  if (behaviorId === 'filters') {
    const filter = snapshot.filter && typeof snapshot.filter === 'object' ? snapshot.filter : {};
    const options = snapshot.options && typeof snapshot.options === 'object' ? snapshot.options : {};
    aliases['filters.scope'] = filter.scope ?? 'render';
    aliases['filters.rules'] = cloneSerializable(filter.rules ?? []);
    if (Object.prototype.hasOwnProperty.call(options, 'id')) aliases['filters.id'] = options.id;
    if (Object.prototype.hasOwnProperty.call(options, 'name')) aliases['filters.name'] = options.name;
    return aliases;
  }
  flattenObject(snapshot.options && typeof snapshot.options === 'object' ? snapshot.options : snapshot, root, aliases);
  if (behaviorId === 'selection') {
    if (Object.prototype.hasOwnProperty.call(snapshot, 'selectedNodes')) {
      aliases['selection.selectedNodes'] = cloneSerializable(snapshot.selectedNodes);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'selectedEdges')) {
      aliases['selection.selectedEdges'] = cloneSerializable(snapshot.selectedEdges);
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'savedSelectionAttribute')) {
      aliases['selection.savedSelectionAttribute'] = snapshot.savedSelectionAttribute;
    }
    if (Object.prototype.hasOwnProperty.call(snapshot, 'lastNamedSelectionAttribute')) {
      aliases['selection.lastNamedSelectionAttribute'] = snapshot.lastNamedSelectionAttribute;
    }
  }
  return aliases;
}

function applyBehaviorSnapshot(behavior, snapshot) {
  if (!behavior) return false;
  if (typeof behavior.restore === 'function') {
    behavior.restore(snapshot);
    return true;
  }
  if (typeof behavior.update === 'function') {
    behavior.update(snapshot?.options && typeof snapshot.options === 'object' ? snapshot.options : snapshot);
    return true;
  }
  return false;
}

function applyBehaviorAlias(id, behavior, path, value) {
  const behaviorId = String(id ?? '').trim();
  const target = String(path ?? '').trim();
  if (!behavior || !target) return false;
  if (behaviorId === 'layout') {
    if (target === 'layout.layoutType') return Boolean(behavior.type?.(value));
    if (target === 'layout.positionAttribute') return Boolean(behavior.positionAttribute?.(value));
    if (target === 'layout.running') {
      if (value === true) {
        behavior.start?.();
      } else {
        behavior.stop?.('persistence');
      }
      return true;
    }
    if (target.startsWith('layout.parameters.')) {
      const key = target.slice('layout.parameters.'.length);
      return Boolean(key && behavior.parameter?.(key, value));
    }
  }
  const snapshot = behaviorSnapshotForPersistence(behaviorId, behavior);
  if (!snapshot || typeof snapshot !== 'object') return false;
  if (behaviorId === 'filters') {
    const next = cloneSerializable(snapshot);
    if (!next.filter || typeof next.filter !== 'object') next.filter = {};
    if (target === 'filters.scope') next.filter.scope = value;
    else if (target === 'filters.rules') next.filter.rules = cloneSerializable(value);
    else if (target === 'filters.id' || target === 'filters.name') {
      if (!next.options || typeof next.options !== 'object') next.options = {};
      next.options[target.slice('filters.'.length)] = value;
    } else {
      return false;
    }
    return applyBehaviorSnapshot(behavior, next);
  }
  if (behaviorId === 'selection') {
    const next = cloneSerializable(snapshot);
    if (target === 'selection.selectedNodes') next.selectedNodes = cloneSerializable(value);
    else if (target === 'selection.selectedEdges') next.selectedEdges = cloneSerializable(value);
    else if (target === 'selection.savedSelectionAttribute') next.savedSelectionAttribute = value;
    else if (target === 'selection.lastNamedSelectionAttribute') next.lastNamedSelectionAttribute = value;
    else if (target.startsWith('selection.')) {
      if (!next.options || typeof next.options !== 'object') next.options = {};
      next.options[target.slice('selection.'.length)] = cloneSerializable(value);
    } else {
      return false;
    }
    return applyBehaviorSnapshot(behavior, next);
  }
  const root = BEHAVIOR_PERSISTENCE_ROOTS[behaviorId];
  if (root && target.startsWith(`${root}.`)) {
    const key = target.slice(root.length + 1);
    return Boolean(behavior.update?.({ [key]: cloneSerializable(value) }));
  }
  return false;
}

function estimateStoredByteLength(value) {
  if (!value) return 0;
  if (typeof value.byteLength === 'number') return Math.max(0, Number(value.byteLength) || 0);
  if (typeof value.size === 'number') return Math.max(0, Number(value.size) || 0);
  if (typeof value === 'string') return value.length * 2;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  try {
    return JSON.stringify(value).length * 2;
  } catch (_) {
    return 0;
  }
}

function estimateSessionEnvelopeBytes(envelope) {
  const networkData = envelope?.payload?.networkData?.data ?? null;
  const networkBytes = estimateStoredByteLength(networkData);
  try {
    const shallow = {
      ...envelope,
      payload: {
        ...(envelope?.payload ?? {}),
        networkData: {
          ...(envelope?.payload?.networkData ?? {}),
          data: null,
        },
      },
    };
    return networkBytes + JSON.stringify(shallow).length * 2;
  } catch (_) {
    return networkBytes;
  }
}

function normalizeSessionRetention(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: source.enabled !== false,
    maxSessions: Number.isFinite(Number(source.maxSessions))
      ? Math.max(1, Math.floor(Number(source.maxSessions)))
      : DEFAULT_SESSION_RETENTION_MAX_SESSIONS,
    maxBytes: Number.isFinite(Number(source.maxBytes))
      ? Math.max(0, Math.floor(Number(source.maxBytes)))
      : DEFAULT_SESSION_RETENTION_MAX_BYTES,
  };
}

function normalizeSessionThumbnailOptions(value = {}) {
  if (value === false) return { enabled: false };
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: source.enabled !== false,
    maxWidth: Number.isFinite(Number(source.maxWidth))
      ? Math.max(16, Math.floor(Number(source.maxWidth)))
      : DEFAULT_SESSION_THUMBNAIL_MAX_WIDTH,
    maxHeight: Number.isFinite(Number(source.maxHeight))
      ? Math.max(16, Math.floor(Number(source.maxHeight)))
      : DEFAULT_SESSION_THUMBNAIL_MAX_HEIGHT,
    maxBytes: Number.isFinite(Number(source.maxBytes))
      ? Math.max(0, Math.floor(Number(source.maxBytes)))
      : DEFAULT_SESSION_THUMBNAIL_MAX_BYTES,
    includeLabels: source.includeLabels === true,
    includeLegends: source.includeLegends === true,
    includeInterface: source.includeInterface === true,
  };
}

function normalizeInteractionIdleMs(value) {
  if (value === false) return 0;
  if (Number.isFinite(Number(value))) return Math.max(0, Number(value));
  return DEFAULT_AUTOSYNC_INTERACTION_IDLE_MS;
}

function normalizeFeaturePersistence(options = {}, defaults = {}) {
  const config = options && typeof options === 'object' ? options : {};
  const debounceCandidate = config.autosaveDebounceMs ?? config.debounceMs ?? config.idleMs;
  const debounceMs = Number.isFinite(Number(debounceCandidate))
    ? Math.max(0, Number(debounceCandidate))
    : defaults.debounceMs;
  return {
    ...config,
    enabled: config.enabled !== false,
    autosave: Object.prototype.hasOwnProperty.call(config, 'autosave')
      ? config.autosave === true
      : defaults.autosave === true,
    debounceMs,
  };
}

function mergeFeaturePersistence(current, next, defaults) {
  if (!next || typeof next !== 'object') return current;
  return normalizeFeaturePersistence({ ...current, ...next }, defaults);
}

function mergeSyncOptions(current = null, next = {}) {
  return {
    ...(current ?? {}),
    ...(next ?? {}),
    includeRegistry: current?.includeRegistry === true || next.includeRegistry === true,
    includeSession: current?.includeSession === true || next.includeSession === true,
    includeNetwork: current?.includeNetwork === true || next.includeNetwork === true,
    includePositions: current?.includePositions === true || next.includePositions === true,
  };
}

async function blobToDataUrl(blob) {
  if (!blob) return null;
  if (typeof FileReader !== 'undefined') {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read thumbnail blob'));
      reader.readAsDataURL(blob);
    });
  }
  if (typeof blob.arrayBuffer === 'function') {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    const encoded = typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
    return `data:${blob.type || 'image/png'};base64,${encoded}`;
  }
  return null;
}

/**
 * Persistence coordinator for preferences, visualization snapshots, and sessions.
 *
 * @public
 * @param {object} [options] - Optional `helios` instance, preference/session
 * stores, defaults, id factory, and clock factory.
 * @returns {HeliosPersistenceService} Service that can run attached to Helios
 * or standalone with injected stores.
 * @remarks Browser builds default to localStorage for preferences and IndexedDB
 * for sessions. Tests and non-browser shells can inject memory stores created
 * by `createMemoryStorage()` and `createMemoryIndexedDBFactory()`.
 * @example
 * const persistence = new HeliosPersistenceService({ helios });
 * const snapshot = persistence.exportVisualizationState({ format: 'string' });
 */
export class HeliosPersistenceService {
  constructor(options = {}) {
    this.helios = options.helios ?? null;
    this.preferenceStore = options.preferenceStore ?? new LocalStoragePreferenceStore(options.preferences ?? {});
    this.sessionStore = options.sessionStore ?? new IndexedDBSessionStore(options.sessions ?? {});
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.now = options.now ?? (() => Date.now());
    this.preferences = createDefaultPreferencesState(options.defaults);
    this.sessionController = null;
    this.workspaceId = options.workspaceId ?? options.session?.workspaceId ?? 'default';
    this.browserBackendEnabled = options.browser !== false;
    this.networkAttributeBackendEnabled = options.networkAttributes !== false;
    this.sessionRetention = normalizeSessionRetention(options.sessionRetention ?? options.session?.retention);
    this.sessionThumbnail = normalizeSessionThumbnailOptions(options.sessionThumbnail ?? options.session?.thumbnail);
    this.autosyncInteractionIdleMs = normalizeInteractionIdleMs(
      options.autosyncInteractionIdleMs
        ?? options.interactionIdleMs
        ?? options.session?.autosyncInteractionIdleMs
        ?? options.session?.interactionIdleMs,
    );
    this.networkPersistence = normalizeFeaturePersistence(options.networkPersistence, {
      autosave: true,
      debounceMs: DEFAULT_NETWORK_AUTOSYNC_DEBOUNCE_MS,
    });
    this.positionPersistence = normalizeFeaturePersistence(options.positionPersistence, {
      autosave: true,
      debounceMs: DEFAULT_POSITION_AUTOSYNC_DEBOUNCE_MS,
    });
    this._hydratedSessionOverrideGroups = new Map();
    this._autosyncTimer = null;
    this._autosyncPending = null;
    this._autosyncPromise = null;
    this._autosyncPaused = false;
    this._autosyncPauseReason = null;
    this._lastInteractionAt = 0;
    this._interactionCleanup = null;
    this._sessionControllerBridgeCleanup = null;
    this._behaviorPersistenceBindings = new Map();
    this._persistenceRestoreSuspendDepth = 0;
    this.registry = new PersistenceRegistry({
      workspaceId: this.workspaceId,
      network: options.network ?? options.helios?.network ?? null,
      autosave: false,
      shouldDeferSync: () => this.shouldDeferSyncForInteraction(),
      syncDeferDelay: () => this.interactionIdleRemainingMs(),
    });
    this.registryAutosave = options.autosave !== false;
    this._configureRegistryBackends(options);
    this.registerKey('ui.theme', { defaultValue: this.preferences.theme, scope: 'user' });
    this.registerKey('network.persistence.enabled', { defaultValue: this.networkPersistence.enabled, scope: 'workspace' });
    this.registerKey('network.persistence.autosave', { defaultValue: this.networkPersistence.autosave, scope: 'workspace' });
    this.registerKey('positions.persistence.enabled', { defaultValue: this.positionPersistence.enabled, scope: 'workspace' });
    this.registerKey('positions.persistence.autosave', { defaultValue: this.positionPersistence.autosave, scope: 'workspace' });
    this._attachInteractionTracking();
  }

  legacyUnfinishedSessionFallbackEnabled() {
    return LEGACY_UNFINISHED_WORKSPACES.has(String(this.workspaceId ?? 'default'));
  }

  getUnfinishedSessionId() {
    return this.preferenceStore.getUnfinishedSessionId?.(this.workspaceId, {
      includeLegacy: this.legacyUnfinishedSessionFallbackEnabled(),
    }) ?? Promise.resolve(null);
  }

  setUnfinishedSessionId(id) {
    return this.preferenceStore.setUnfinishedSessionId?.(id, this.workspaceId) ?? Promise.resolve(id ?? null);
  }

  _configureRegistryBackends(options = {}) {
    const configured = [];
    if (Array.isArray(options.backends)) configured.push(...options.backends);
    if (options.customBackend) {
      configured.push(options.customBackend instanceof CustomPersistenceBackend
        ? options.customBackend
        : new CustomPersistenceBackend(options.customBackend));
    }
    if (options.remote) {
      configured.push(options.remote instanceof RemotePersistenceBackend
        ? options.remote
        : new RemotePersistenceBackend(options.remote));
    }
    if (options.browser !== false) {
      configured.push(new BrowserPersistenceBackend({
        workspaceId: this.workspaceId,
        ...(options.browser && typeof options.browser === 'object' ? options.browser : {}),
      }));
    }
    if (options.networkAttributes !== false) {
      configured.push(new NetworkAttributePersistenceBackend({
        network: options.network ?? options.helios?.network ?? null,
        ...(options.networkAttributes && typeof options.networkAttributes === 'object' ? options.networkAttributes : {}),
      }));
    }
    this.registry.configure({
      workspaceId: this.workspaceId,
      network: options.network ?? options.helios?.network ?? null,
      browser: false,
      networkAttributes: false,
      backends: configured,
      autosave: false,
    });
  }

  configure(options = {}) {
    if (options.workspaceId) this.workspaceId = options.workspaceId;
    if (Object.prototype.hasOwnProperty.call(options, 'browser')) this.browserBackendEnabled = options.browser !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'networkAttributes')) this.networkAttributeBackendEnabled = options.networkAttributes !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'networkPersistence')) {
      this.networkPersistence = mergeFeaturePersistence(this.networkPersistence, options.networkPersistence, {
        autosave: true,
        debounceMs: DEFAULT_NETWORK_AUTOSYNC_DEBOUNCE_MS,
      });
      this.registerKey('network.persistence.enabled', { defaultValue: this.networkPersistence.enabled, scope: 'workspace' });
      this.registerKey('network.persistence.autosave', { defaultValue: this.networkPersistence.autosave, scope: 'workspace' });
    }
    if (Object.prototype.hasOwnProperty.call(options, 'positionPersistence')) {
      this.positionPersistence = mergeFeaturePersistence(this.positionPersistence, options.positionPersistence, {
        autosave: true,
        debounceMs: DEFAULT_POSITION_AUTOSYNC_DEBOUNCE_MS,
      });
      this.registerKey('positions.persistence.enabled', { defaultValue: this.positionPersistence.enabled, scope: 'workspace' });
      this.registerKey('positions.persistence.autosave', { defaultValue: this.positionPersistence.autosave, scope: 'workspace' });
    }
    this.registry.configure({
      ...options,
      workspaceId: this.workspaceId,
      network: options.network ?? this.helios?.network ?? null,
      autosave: false,
      browser: Object.prototype.hasOwnProperty.call(options, 'browser') ? options.browser : this.browserBackendEnabled,
      networkAttributes: Object.prototype.hasOwnProperty.call(options, 'networkAttributes')
        ? options.networkAttributes
        : this.networkAttributeBackendEnabled,
    });
    if (Object.prototype.hasOwnProperty.call(options, 'autosave')) {
      this.registryAutosave = options.autosave !== false;
    }
    return this;
  }

  async load() {
    return this.registry.load();
  }

  registerKey(path, options = {}) {
    return this.registry.registerKey(path, options);
  }

  bindKey(path, binding = {}) {
    return this.registry.bindKey(path, binding);
  }

  isPersistenceRestoreSuspended() {
    return this._persistenceRestoreSuspendDepth > 0
      || this.sessionController?.restoring === true
      || this.sessionController?.initialPersistenceReady === false;
  }

  runWithPersistenceRestoreSuspended(fn) {
    if (typeof fn !== 'function') return undefined;
    this._persistenceRestoreSuspendDepth += 1;
    let result;
    try {
      result = fn();
    } catch (error) {
      this._persistenceRestoreSuspendDepth = Math.max(0, this._persistenceRestoreSuspendDepth - 1);
      throw error;
    }
    if (result && typeof result.then === 'function') {
      return result.finally(() => {
        this._persistenceRestoreSuspendDepth = Math.max(0, this._persistenceRestoreSuspendDepth - 1);
      });
    }
    this._persistenceRestoreSuspendDepth = Math.max(0, this._persistenceRestoreSuspendDepth - 1);
    return result;
  }

  bindBehaviorState(id, behavior, options = {}) {
    const behaviorId = String(id ?? behavior?.id ?? '').trim();
    if (!behaviorId || !behavior) return null;
    const existing = this._behaviorPersistenceBindings.get(behaviorId);
    if (existing?.behavior === behavior) return existing.cleanup;
    existing?.cleanup?.();

    const primaryPath = behaviorId === 'interface' ? 'interface.state' : `behaviors.${behaviorId}.state`;
    const scope = options.scope ?? behaviorScope(behaviorId);
    const debounceMs = options.debounceMs ?? behaviorDebounceMs(behaviorId);
    const readSnapshot = () => behaviorSnapshotForPersistence(behaviorId, behavior);
    const bindingCleanups = [];
    const appliedAliasPaths = new Set();
    const addApplyBinding = (path, apply) => {
      const target = String(path ?? '').trim();
      if (!target || typeof apply !== 'function') return;
      const binding = {
        apply: (value, applyOptions = {}) => {
          if (applyOptions.source === 'behavior' || applyOptions.source === 'binding') return;
          apply(value, applyOptions);
        },
      };
      const bindings = this.registry.bindings.get(target) ?? new Set();
      bindings.add(binding);
      this.registry.bindings.set(target, bindings);
      bindingCleanups.push(() => {
        const current = this.registry.bindings.get(target);
        current?.delete(binding);
      });
    };
    const registerPath = (path, defaultValue, pathOptions = {}) => {
      const status = this.registry.keyStatus?.(path) ?? null;
      const shouldKeepDefault = !status?.hasOverride && defaultValue !== undefined;
      this.registerKey(path, {
        scope: pathOptions.scope ?? scope,
        debounceMs: pathOptions.debounceMs ?? debounceMs,
        preserveOverrides: true,
        ...(shouldKeepDefault ? { defaultValue: cloneSerializable(defaultValue) } : {}),
        metadata: {
          behavior: behaviorId,
          alias: path !== primaryPath,
          ...(pathOptions.metadata ?? {}),
        },
      });
    };
    const writePath = (path, value, pathOptions = {}) => this.set(path, value, {
      scope: pathOptions.scope ?? scope,
      source: options.source ?? 'behavior',
      reason: pathOptions.reason ?? options.reason ?? `behavior:${behaviorId}`,
      autosave: options.autosave,
    });
    const registerAliases = (snapshot, { defaults = false } = {}) => {
      const aliases = flattenBehaviorAliases(behaviorId, snapshot);
      for (const [path, value] of Object.entries(aliases)) {
        registerPath(path, defaults ? value : undefined, {
          scope: path === 'layout.running' ? 'session' : scope,
          metadata: { behaviorAlias: path },
        });
        if (!appliedAliasPaths.has(path)) {
          appliedAliasPaths.add(path);
          addApplyBinding(path, (nextValue) => applyBehaviorAlias(behaviorId, behavior, path, nextValue));
        }
      }
      return aliases;
    };

    const initialSnapshot = readSnapshot();
    registerPath(primaryPath, initialSnapshot);
    addApplyBinding(primaryPath, (value) => applyBehaviorSnapshot(behavior, value));
    registerAliases(initialSnapshot, { defaults: true });
    let previousSignature = valuesEqual(initialSnapshot, undefined) ? '' : JSON.stringify(initialSnapshot);
    const onChange = (event) => {
      const snapshot = readSnapshot();
      let signature = '';
      try {
        signature = JSON.stringify(snapshot);
      } catch (_) {
        signature = String(snapshot);
      }
      if (signature === previousSignature) return;
      previousSignature = signature;
      if (this.isPersistenceRestoreSuspended()) {
        registerAliases(snapshot);
        return;
      }
      writePath(primaryPath, snapshot, { reason: `behavior:${event?.detail?.reason ?? event?.reason ?? 'change'}` });
      const aliases = registerAliases(snapshot);
      for (const [path, value] of Object.entries(aliases)) {
        writePath(path, value, {
          scope: path === 'layout.running' ? 'session' : scope,
          reason: `behavior:${event?.detail?.reason ?? event?.reason ?? 'change'}`,
        });
      }
    };
    const unsubscribe = typeof behavior.on === 'function'
      ? behavior.on('change', onChange)
      : (() => {
        behavior.addEventListener?.('change', onChange);
        return () => behavior.removeEventListener?.('change', onChange);
      })();
    const cleanup = () => {
      unsubscribe?.();
      for (const clean of bindingCleanups) clean();
      this._behaviorPersistenceBindings.delete(behaviorId);
    };
    this._behaviorPersistenceBindings.set(behaviorId, { behavior, cleanup });
    return cleanup;
  }

  unbindBehaviorState(id, behavior = null) {
    const behaviorId = String(id ?? behavior?.id ?? '').trim();
    const existing = this._behaviorPersistenceBindings.get(behaviorId);
    if (!existing || (behavior && existing.behavior !== behavior)) return false;
    existing.cleanup?.();
    return true;
  }

  get(path, fallback = undefined) {
    return this.registry.get(path, fallback);
  }

  set(path, value, options = {}) {
    const result = this.registry.set(path, value, options);
    const target = String(path ?? '').trim();
    if (target === 'network.persistence.autosave') {
      this.networkPersistence.autosave = value === true;
      if (value !== true) this._dropAutosyncPending('network');
      else if (this.registry.statusFlags.networkDirty) {
        this.scheduleAutosync({
          includeNetwork: true,
          includePositions: this._featureEnabled('positions'),
          reason: options.reason ?? 'autosave-enabled',
        });
      }
    } else if (target === 'positions.persistence.autosave') {
      this.positionPersistence.autosave = value === true;
      if (value !== true) this._dropAutosyncPending('positions');
      else if (this.registry.statusFlags.positionsDirty) {
        this.scheduleAutosync({
          includePositions: true,
          reason: options.reason ?? 'autosave-enabled',
        });
      }
    }
    if (result?.changed && options.autosave !== false && this.registryAutosave !== false) {
      const debounceMs = this.registry.keys?.get?.(target)?.debounceMs;
      this.scheduleAutosync({
        includeRegistry: true,
        debounceMs,
        reason: options.reason ?? 'registry-set',
        source: options.source ?? 'registry',
      });
    }
    return result;
  }

  reset(pathOrScope, options = {}) {
    const result = this.registry.reset(pathOrScope, options);
    if (result?.reset && options.autosave !== false && this.registryAutosave !== false) {
      this.scheduleAutosync({
        includeRegistry: true,
        reason: options.reason ?? 'registry-reset',
        source: options.source ?? 'registry',
        debounceMs: 0,
      });
    }
    return result;
  }

  subscribe(path, callback, options = {}) {
    return this.registry.subscribe(path, callback, options);
  }

  addEventListener(type, listener, options) {
    this.registry.addEventListener?.(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.registry.removeEventListener?.(type, listener, options);
  }

  keyStatus(path, options = {}) {
    const aliasTargets = statusAliasTargets(path);
    const registryStatuses = aliasTargets.map((target) => this.registry.keyStatus?.(target, options) ?? { path: target, state: 'default' });
    const registryStatus = registryStatuses[0] ?? { state: 'default' };
    const legacyDirtyState = this.sessionController?.getDirtyState?.() ?? { controls: {}, sections: {}, panels: {} };
    const target = String(path ?? '').trim();
    const mode = options.mode === 'scope' ? 'scope' : 'control';
    let legacyState = 'default';
    for (const candidate of aliasTargets) {
      if (candidate && legacyDirtyState.controls?.[candidate]) legacyState = 'changed';
      else if (mode === 'scope') {
        const scope = candidate === target ? String(options.scope ?? path ?? '').trim() : candidate;
        if (scope && legacyDirtyState.sections?.[scope]) legacyState = mergeKeyState(legacyState, legacyDirtyState.sections[scope]);
        else if (candidate && legacyDirtyState.panels?.[candidate]) legacyState = mergeKeyState(legacyState, legacyDirtyState.panels[candidate]);
      }
      if (legacyState === 'changed') break;
    }
    if (legacyState === 'changed' && target && registryStatus?.defaultValue !== undefined) {
      const currentValue = this.get(target, registryStatus.defaultValue);
      if (valuesEqual(currentValue, registryStatus.defaultValue)) legacyState = 'default';
    }
    const registryState = registryStatuses.reduce((state, status) => mergeKeyState(state, status?.state), 'default');
    const state = mergeKeyState(registryState, legacyState);
    return { ...registryStatus, state, legacyState };
  }

  backendStatus() {
    return this.registry.backendStatus();
  }

  status() {
    return this.persistenceStatus();
  }

  async loadPreferences() {
    const stored = await this.preferenceStore.read();
    const envelope = migratePersistenceEnvelope(stored ?? {}, PERSISTENCE_KINDS.preferences);
    this.preferences = envelope.payload;
    return cloneSerializable(this.preferences);
  }

  async savePreferences(nextPreferences = this.preferences) {
    const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.preferences, nextPreferences);
    await this.preferenceStore.write(envelope);
    this.preferences = envelope.payload;
    return cloneSerializable(this.preferences);
  }

  getPreferences() {
    return cloneSerializable(this.preferences);
  }

  async updatePreferences(patch = {}) {
    this.preferences = createDefaultPreferencesState({
      ...this.preferences,
      ...(patch && typeof patch === 'object' ? patch : {}),
      responsive: {
        ...(this.preferences?.responsive ?? {}),
        ...((patch && typeof patch.responsive === 'object') ? patch.responsive : {}),
      },
    });
    await this.savePreferences(this.preferences);
    if (Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      this.set('ui.theme', patch.theme, { scope: 'user', source: 'preferences', reason: 'preferences' });
    }
    return this.getPreferences();
  }

  exportVisualizationState(options = {}) {
    if (!this.helios || typeof this.helios.serializeVisualizationState !== 'function') {
      throw new Error('Persistence service requires a Helios instance to export visualization state');
    }
    const envelope = this.helios.serializeVisualizationState({
      preferences: options.preferences ?? this.preferences,
    });
    if (options.format === 'string') return serializePersistenceEnvelope(envelope, options.pretty !== false);
    if (options.format === 'blob') {
      return new Blob([serializePersistenceEnvelope(envelope, options.pretty !== false)], { type: 'application/json' });
    }
    return envelope;
  }

  async exportVisualizationStateAsync(options = {}) {
    if (!this.helios) {
      throw new Error('Persistence service requires a Helios instance to export visualization state');
    }
    const serializer = typeof this.helios.serializeVisualizationStateAsync === 'function'
      ? this.helios.serializeVisualizationStateAsync.bind(this.helios)
      : this.helios.serializeVisualizationState?.bind(this.helios);
    if (typeof serializer !== 'function') {
      throw new Error('Persistence service requires a Helios instance to export visualization state');
    }
    const envelope = await serializer({
      preferences: options.preferences ?? this.preferences,
    });
    if (options.format === 'string') return serializePersistenceEnvelope(envelope, options.pretty !== false);
    if (options.format === 'blob') {
      return new Blob([serializePersistenceEnvelope(envelope, options.pretty !== false)], { type: 'application/json' });
    }
    return envelope;
  }

  async importVisualizationState(source, options = {}) {
    if (!this.helios || typeof this.helios.importVisualizationState !== 'function') {
      throw new Error('Persistence service requires a Helios instance to import visualization state');
    }
    const envelope = parsePersistenceEnvelope(source, PERSISTENCE_KINDS.visualization);
    await this.helios.importVisualizationState(envelope, options);
    return envelope;
  }

  configureSession(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'retention') || Object.prototype.hasOwnProperty.call(options, 'sessionRetention')) {
      this.sessionRetention = normalizeSessionRetention(options.retention ?? options.sessionRetention);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'thumbnail') || Object.prototype.hasOwnProperty.call(options, 'sessionThumbnail')) {
      this.sessionThumbnail = normalizeSessionThumbnailOptions(options.thumbnail ?? options.sessionThumbnail);
    }
    if (
      Object.prototype.hasOwnProperty.call(options, 'autosyncInteractionIdleMs')
      || Object.prototype.hasOwnProperty.call(options, 'interactionIdleMs')
    ) {
      this.autosyncInteractionIdleMs = normalizeInteractionIdleMs(
        options.autosyncInteractionIdleMs ?? options.interactionIdleMs,
      );
    }
    if (Object.prototype.hasOwnProperty.call(options, 'networkPersistence')) {
      this.networkPersistence = mergeFeaturePersistence(this.networkPersistence, options.networkPersistence, {
        autosave: true,
        debounceMs: DEFAULT_NETWORK_AUTOSYNC_DEBOUNCE_MS,
      });
      this.registerKey('network.persistence.enabled', { defaultValue: this.networkPersistence.enabled, scope: 'workspace' });
      this.registerKey('network.persistence.autosave', { defaultValue: this.networkPersistence.autosave, scope: 'workspace' });
    }
    if (Object.prototype.hasOwnProperty.call(options, 'positionPersistence')) {
      this.positionPersistence = mergeFeaturePersistence(this.positionPersistence, options.positionPersistence, {
        autosave: true,
        debounceMs: DEFAULT_POSITION_AUTOSYNC_DEBOUNCE_MS,
      });
      this.registerKey('positions.persistence.enabled', { defaultValue: this.positionPersistence.enabled, scope: 'workspace' });
      this.registerKey('positions.persistence.autosave', { defaultValue: this.positionPersistence.autosave, scope: 'workspace' });
    }
    if (!this.sessionController) {
      this.sessionController = new HeliosSessionController({
        helios: this.helios,
        persistence: this,
        sessionStore: this.sessionStore,
        now: this.now,
        ...(options.controllerOptions ?? {}),
      });
      this._attachSessionControllerBridge();
    }
    this.registry.configure({
      workspaceId: options.workspaceId ?? this.workspaceId,
      network: this.helios?.network ?? null,
      autosave: false,
      shouldDeferSync: () => this.shouldDeferSyncForInteraction(),
      syncDeferDelay: () => this.interactionIdleRemainingMs(),
      browser: Object.prototype.hasOwnProperty.call(options, 'browser') ? options.browser : this.browserBackendEnabled,
      networkAttributes: Object.prototype.hasOwnProperty.call(options, 'networkAttributes')
        ? options.networkAttributes
        : this.networkAttributeBackendEnabled,
    });
    if (this.sessionController.sessionId) return this.sessionController.updateConfig(options);
    return this.sessionController.configure(options);
  }

  _attachSessionControllerBridge() {
    this._sessionControllerBridgeCleanup?.();
    this._sessionControllerBridgeCleanup = null;
    const controller = this.sessionController;
    if (!controller || typeof controller.addEventListener !== 'function') return;
    const emitChange = (event) => {
      this.registry?._emit?.('change', {
        ...(event?.detail && typeof event.detail === 'object' ? event.detail : {}),
        reason: event?.detail?.reason ?? `session-${event?.type ?? 'change'}`,
        sessionStatus: controller.status?.() ?? null,
      });
    };
    const emitSync = (event) => {
      this.registry?._emit?.('sync', {
        ...(event?.detail && typeof event.detail === 'object' ? event.detail : {}),
        sessionStatus: controller.status?.() ?? null,
        status: this.persistenceStatus(),
      });
    };
    const emitConfig = (event) => {
      this.registry?._emit?.('config', {
        ...(event?.detail && typeof event.detail === 'object' ? event.detail : {}),
        sessionStatus: controller.status?.() ?? null,
      });
    };
    controller.addEventListener('change', emitChange);
    controller.addEventListener('sync', emitSync);
    controller.addEventListener('config', emitConfig);
    this._sessionControllerBridgeCleanup = () => {
      controller.removeEventListener?.('change', emitChange);
      controller.removeEventListener?.('sync', emitSync);
      controller.removeEventListener?.('config', emitConfig);
    };
  }

  _attachInteractionTracking() {
    this._interactionCleanup?.();
    this._interactionCleanup = null;
    const helios = this.helios ?? null;
    if (!helios || typeof helios.addEventListener !== 'function') return;
    const markInteraction = (event) => {
      const detail = event?.detail ?? {};
      if (detail?.origin && detail.origin !== 'interaction') return;
      this.markInteractionActive(detail);
    };
    helios.addEventListener('camera:move', markInteraction);
    this._interactionCleanup = () => {
      helios.removeEventListener?.('camera:move', markInteraction);
    };
  }

  markInteractionActive() {
    this._lastInteractionAt = this.now();
    return this._lastInteractionAt;
  }

  interactionIdleRemainingMs() {
    const idleMs = Math.max(0, Number(this.autosyncInteractionIdleMs) || 0);
    if (idleMs <= 0 || !this._lastInteractionAt) return 0;
    return Math.max(0, (this._lastInteractionAt + idleMs) - this.now());
  }

  shouldDeferSyncForInteraction(options = {}) {
    if (options.force === true || options.deferForInteraction === false) return false;
    return this.interactionIdleRemainingMs() > 0;
  }

  getOverrides() {
    return {
      ...(this.registry.layers?.user ?? {}),
      ...(this.registry.layers?.workspace ?? {}),
      ...(this.registry.layers?.network ?? {}),
      ...(this.registry.layers?.session ?? {}),
      ...(this.sessionController?.getOverrides?.() ?? {}),
    };
  }

  getDirtyState() {
    const legacy = this.sessionController?.getDirtyState?.() ?? { controls: {}, sections: {}, panels: {} };
    const next = this.registry.dirtyState();
    return applyDirtyAliases({
      controls: { ...legacy.controls, ...next.controls },
      sections: { ...legacy.sections, ...next.sections },
      panels: { ...legacy.panels, ...next.panels },
    });
  }

  getChangeJournal(options = {}) {
    const registryEntries = this.registry.getChangeJournal(options);
    const legacyEntries = this.sessionController?.getChangeJournal?.(options) ?? [];
    return [...legacyEntries, ...registryEntries].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  }

  checkpoint(seq = null) {
    const legacy = this.sessionController?.checkpoint?.(seq) ?? { checkpointSeq: 0 };
    const registry = this.registry.checkpoint(seq);
    if (this.registryAutosave !== false) {
      this.scheduleAutosync({ includeRegistry: true, reason: 'checkpoint', debounceMs: 0 });
    }
    return { checkpointSeq: Math.max(legacy.checkpointSeq ?? 0, registry.checkpointSeq ?? 0) };
  }

  resetOverride(pathOrScope) {
    const targets = statusAliasTargets(pathOrScope);
    const legacy = Promise.all(targets.map((target) => (
      this.sessionController?.resetOverride?.(target) ?? Promise.resolve({ reset: false })
    ))).then((results) => ({
      reset: results.some((result) => result?.reset === true),
      overrides: this.getOverrides(),
      dirtyState: this.getDirtyState(),
    }));
    return Promise.resolve(legacy).then((legacyResult) => {
      const registryResults = [];
      for (const target of targets) {
        for (const scope of ['session', 'network', 'workspace', 'user']) {
          registryResults.push(this.reset(target, { scope }));
        }
      }
      const registryReset = registryResults.some((result) => result.reset);
      return {
        ...legacyResult,
        reset: Boolean(legacyResult?.reset || registryReset),
        overrides: this.getOverrides(),
        dirtyState: this.getDirtyState(),
      };
    });
  }

  async _capturePortablePositions(options = {}) {
    if (options.includePositions !== true && options.includeNetwork !== true) return null;
    if (options.capturePositions === false) return null;
    if (!this.helios || typeof this.helios.snapshotLayoutRuntimeStateAsync !== 'function') return null;
    const state = await this.helios.snapshotLayoutRuntimeStateAsync({
      includePositions: true,
      reason: options.reason ?? 'persistence-sync',
      maxPositionBytes: options.maxPositionBytes,
    });
    if (state?.positions?.encoding === 'float32-base64') {
      this.set('positions.current', state.positions, {
        scope: 'network',
        source: 'system',
        reason: options.reason ?? 'persistence-sync',
        autosave: false,
      });
    }
    return state;
  }

  flush(options = {}) {
    if (this._autosyncTimer) {
      clearTimeout(this._autosyncTimer);
      this._autosyncTimer = null;
    }
    this._autosyncPending = null;
    const legacy = this.sessionController?.flush?.(options) ?? Promise.resolve(null);
    return Promise.resolve(legacy).then(async (legacyResult) => {
      await this._capturePortablePositions(options);
      const registryResult = await this.registry.flush({
        includeNetwork: options.includeNetwork === true,
        includePositions: options.includePositions === true || options.includeNetwork === true,
      });
      return legacyResult ?? registryResult;
    });
  }

  sync(options = {}) {
    return this.flush(options);
  }

  _featureEnabled(kind) {
    if (kind === 'network') {
      return this.networkPersistence.enabled !== false
        && this.get('network.persistence.enabled', this.networkPersistence.enabled) !== false;
    }
    return this.positionPersistence.enabled !== false
      && this.get('positions.persistence.enabled', this.positionPersistence.enabled) !== false;
  }

  _featureAutosaveEnabled(kind) {
    if (kind === 'network') {
      return this.networkPersistence.autosave === true
        && this.get('network.persistence.autosave', this.networkPersistence.autosave) === true
        && this._featureEnabled('network');
    }
    return this.positionPersistence.autosave === true
      && this.get('positions.persistence.autosave', this.positionPersistence.autosave) === true
      && this._featureEnabled('positions');
  }

  _dropAutosyncPending(kind) {
    if (!this._autosyncPending) return;
    const next = { ...this._autosyncPending };
    if (kind === 'network') next.includeNetwork = false;
    if (kind === 'positions') next.includePositions = false;
    if (next.includeRegistry !== true
      && next.includeSession !== true
      && next.includeNetwork !== true
      && next.includePositions !== true) {
      this._autosyncPending = null;
      if (this._autosyncTimer) {
        clearTimeout(this._autosyncTimer);
        this._autosyncTimer = null;
      }
      return;
    }
    this._autosyncPending = next;
  }

  _autosyncDebounceMs(options = {}) {
    if (Number.isFinite(Number(options.debounceMs))) return Math.max(0, Number(options.debounceMs));
    const delays = [];
    if (options.includeNetwork === true) delays.push(this.networkPersistence.debounceMs);
    if (options.includePositions === true) delays.push(this.positionPersistence.debounceMs);
    if (options.includeSession === true) delays.push(DEFAULT_SESSION_AUTOSYNC_DEBOUNCE_MS);
    if (options.includeRegistry === true) delays.push(100);
    return Math.max(0, ...delays.map((delay) => Number(delay) || 0));
  }

  autosyncStatus() {
    return {
      enabled: this.registryAutosave !== false,
      paused: this._autosyncPaused === true,
      pauseReason: this._autosyncPauseReason,
      pending: cloneSerializable(this._autosyncPending),
      running: Boolean(this._autosyncPromise),
      interactionIdleRemainingMs: this.interactionIdleRemainingMs(),
    };
  }

  pauseAutosync(reason = 'manual') {
    this._autosyncPaused = true;
    this._autosyncPauseReason = reason ?? 'manual';
    if (this._autosyncTimer) {
      clearTimeout(this._autosyncTimer);
      this._autosyncTimer = null;
    }
    this.registry?._emit?.('config', { autosync: this.autosyncStatus() });
    return this.autosyncStatus();
  }

  resumeAutosync(options = {}) {
    this._autosyncPaused = false;
    this._autosyncPauseReason = null;
    if (this._autosyncPending) {
      this.scheduleAutosync({
        ...this._autosyncPending,
        debounceMs: options.debounceMs ?? 0,
        reason: options.reason ?? this._autosyncPending.reason ?? 'autosync-resume',
      });
    }
    this.registry?._emit?.('config', { autosync: this.autosyncStatus() });
    return this.autosyncStatus();
  }

  cancelAutosync() {
    if (this._autosyncTimer) {
      clearTimeout(this._autosyncTimer);
      this._autosyncTimer = null;
    }
    this._autosyncPending = null;
    this.registry?._emit?.('config', { autosync: this.autosyncStatus() });
    return this.autosyncStatus();
  }

  scheduleAutosync(options = {}) {
    if (this.registryAutosave === false && options.force !== true) return this.autosyncStatus();
    if (options.includeRegistry !== true
      && options.includeSession !== true
      && options.includeNetwork !== true
      && options.includePositions !== true) {
      return this.autosyncStatus();
    }
    this._autosyncPending = mergeSyncOptions(this._autosyncPending, {
      ...options,
      reason: options.reason ?? 'autosave',
      source: options.source ?? 'autosave',
    });
    if (this._autosyncPaused === true && options.force !== true) return this.autosyncStatus();
    const delay = this._autosyncDebounceMs(options);
    if (this._autosyncTimer) clearTimeout(this._autosyncTimer);
    this._autosyncTimer = setTimeout(() => {
      this._autosyncTimer = null;
      this._runAutosync();
    }, delay);
    return this.autosyncStatus();
  }

  _scheduleAutosync(options = {}) {
    return this.scheduleAutosync(options);
  }

  async flushAutosync(options = {}) {
    if (this._autosyncTimer) {
      clearTimeout(this._autosyncTimer);
      this._autosyncTimer = null;
    }
    if (options && Object.keys(options).length) {
      this._autosyncPending = mergeSyncOptions(this._autosyncPending, { ...options, force: true });
    } else if (this._autosyncPending) {
      this._autosyncPending = { ...this._autosyncPending, force: true };
    }
    return this._runAutosync({ force: true });
  }

  _runAutosync(runOptions = {}) {
    if (this._autosyncPromise) return this._autosyncPromise;
    const pending = this._autosyncPending;
    if (!pending) return Promise.resolve(this.persistenceStatus());
    if (this._autosyncPaused === true && runOptions.force !== true && pending.force !== true) {
      return Promise.resolve(this.persistenceStatus());
    }
    const interactionDelay = this.interactionIdleRemainingMs();
    if (pending.force !== true && pending.deferForInteraction !== false && interactionDelay > 0) {
      if (this._autosyncTimer) clearTimeout(this._autosyncTimer);
      this._autosyncTimer = setTimeout(() => {
        this._autosyncTimer = null;
        this._runAutosync();
      }, interactionDelay);
      return Promise.resolve(this.persistenceStatus());
    }
    this._autosyncPending = null;
    this._autosyncPromise = this._runAutosyncNow(pending).catch((error) => {
      this.registry.statusFlags.lastError = error?.message ?? String(error);
      console.error('[HeliosPersistence] Autosync failed', error);
      this.registry._emit?.('sync', this.registry.status());
      return this.persistenceStatus();
    }).finally(() => {
      this._autosyncPromise = null;
      if (this._autosyncPending && !this._autosyncTimer) {
        const delay = this.interactionIdleRemainingMs();
        this._autosyncTimer = setTimeout(() => {
          this._autosyncTimer = null;
          this._runAutosync();
        }, delay);
      }
    });
    return this._autosyncPromise;
  }

  async _runAutosyncNow(options = {}) {
    let result = null;
    if (options.includeNetwork === true || options.includePositions === true) {
      result = await this.sync(options);
    } else {
      if (options.includeSession === true && this.sessionController?.saveManifest) {
        if (this.sessionController.saveTimer) {
          clearTimeout(this.sessionController.saveTimer);
          this.sessionController.saveTimer = null;
        }
        result = await this.sessionController.saveManifest({
          snapshotLayoutRuntime: options.snapshotLayoutRuntime !== false,
          emitSyncEvents: options.emitSyncEvents !== false,
        });
      }
      if (options.includeRegistry === true) {
        result = await this.registry.flush(options);
      }
    }
    return result ?? this.persistenceStatus();
  }

  persistenceStatus() {
    const registry = this.registry.status();
    const legacy = this.sessionController?.status?.() ?? {};
    const checkpointSeq = Math.max(Number(legacy.checkpointSeq) || 0, Number(registry.checkpointSeq) || 0);
    const overrides = this.getOverrides();
    const journal = this.getChangeJournal({ sinceCheckpoint: false });
    const legacyNetworkData = legacy.networkData ?? {};
    const registryNetworkData = registry.networkData ?? {};
    const legacyStatus = legacyNetworkData.status;
    const registryStatus = registryNetworkData.status;
    const sessionSync = legacy.sessionSync ?? {};
    const sessionSyncStatus = sessionSync.status;
    const savedAtCandidates = [
      legacyNetworkData.savedAt,
      sessionSync.savedAt,
      legacy.sessionSavedAt,
      registryNetworkData.savedAt,
      registry.lastSyncedAt,
    ].map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
    const mergedSavedAt = savedAtCandidates.length ? Math.max(...savedAtCandidates) : null;
    const hasLegacyNetworkSave = legacyNetworkData.savedAt != null
      || legacyStatus === 'saved'
      || legacyStatus === 'skipped'
      || legacyStatus === 'error'
      || legacyNetworkData.dirty === true;
    const mergedNetworkStatus = registry.syncing || legacyStatus === 'syncing' || sessionSyncStatus === 'syncing'
      ? 'syncing'
      : legacyStatus === 'error' || sessionSyncStatus === 'error' || registry.lastError || registryStatus === 'error'
        ? 'error'
        : hasLegacyNetworkSave && legacyStatus && legacyStatus !== 'idle'
          ? legacyStatus
          : mergedSavedAt
            ? 'saved'
          : 'idle';
    return {
      ...legacy,
      ...registry,
      sessionId: legacy.sessionId ?? registry.workspaceId,
      checkpointSeq,
      overrideCount: Object.keys(overrides).length,
      journalCount: journal.length,
      local: legacy.local ?? true,
      remote: legacy.remote ?? registry.backendStatus.find((backend) => backend.type === 'remote') ?? null,
      syncing: Boolean(registry.syncing || sessionSyncStatus === 'syncing'),
      lastError: registry.lastError ?? sessionSync.error ?? null,
      lastSyncedAt: mergedSavedAt,
      networkData: {
        ...registryNetworkData,
        ...legacyNetworkData,
        dirty: Boolean(legacyNetworkData.dirty || registryNetworkData.dirty),
        positionsDirty: Boolean(legacyNetworkData.positionsDirty || registryNetworkData.positionsDirty),
        status: mergedNetworkStatus,
        savedAt: legacyNetworkData.savedAt ?? registryNetworkData.savedAt ?? null,
        registrySavedAt: registryNetworkData.savedAt ?? null,
        remoteWarning: legacyNetworkData.remoteWarning ?? registryNetworkData.remoteWarning ?? null,
      },
    };
  }

  recordSessionChange(detail = {}) {
    const entries = this.sessionController?.recordSnapshotChange?.(detail) ?? [];
    for (const entry of entries) {
      this.set(entry.path, entry.newValue, {
        scope: detail.scope ?? 'session',
        source: entry.source ?? detail.source ?? 'user',
        reason: entry.reason ?? detail.reason ?? 'change',
        autosave: false,
      });
    }
    if (entries.length && this.registryAutosave !== false) {
      this.scheduleAutosync({
        includeRegistry: true,
        reason: detail.reason ?? 'session-change',
        source: detail.source ?? 'session',
      });
    }
    return entries;
  }

  hydrateSessionOverrides(overrides = {}, options = {}) {
    const group = String(options.group ?? 'overrides');
    const nextOverrides = overrides && typeof overrides === 'object' ? cloneSerializable(overrides) : {};
    const sessionLayer = this.registry?.layers?.session;
    if (!sessionLayer) return false;
    const previousOverrides = this._hydratedSessionOverrideGroups.get(group) ?? {};
    this._hydratedSessionOverrideGroups.set(group, nextOverrides);
    const paths = new Set(Object.keys(previousOverrides));
    for (const values of this._hydratedSessionOverrideGroups.values()) {
      for (const path of Object.keys(values)) paths.add(path);
    }
    for (const path of paths) delete sessionLayer[path];
    const combined = {};
    for (const values of this._hydratedSessionOverrideGroups.values()) {
      Object.assign(combined, values);
    }
    for (const [path, value] of Object.entries(combined)) {
      const lower = this.registry._lowerValue?.('session', path);
      if (!valuesEqual(lower, value)) sessionLayer[path] = cloneSerializable(value);
    }
    this.registry._emit?.('change', {
      entries: [],
      reason: options.reason ?? 'session-overrides-hydrate',
      overrides: cloneSerializable(nextOverrides),
    });
    return true;
  }

  hydrateVisualizationState(source, options = {}) {
    const flattened = flattenVisualizationOverrides(source);
    return this.hydrateSessionOverrides(flattened, {
      ...options,
      group: options.group ?? 'visualization',
      reason: options.reason ?? 'visualization-restore',
    });
  }

  refreshBoundKeys(options = {}) {
    return this.registry.refreshBoundKeys?.({
      source: options.source ?? 'restore',
      reason: options.reason ?? 'refresh-bound',
      autosave: options.autosave ?? false,
    }) ?? [];
  }

  setSessionOverride(path, value, detail = {}) {
    const result = this.set(path, value, {
      scope: detail.scope ?? 'session',
      source: detail.source ?? 'user',
      reason: detail.reason ?? 'set-override',
    });
    if (result?.changed) return this.registry.getChangeJournal({ limit: 1 });
    return this.sessionController?.setOverride?.(path, value, detail) ?? [];
  }

  runWithSessionSource(source, fn) {
    if (this.sessionController?.runWithSource) return this.sessionController.runWithSource(source, fn);
    return Promise.resolve().then(fn);
  }

  async _captureSessionThumbnail(options = {}) {
    const config = normalizeSessionThumbnailOptions(options.thumbnail ?? options.sessionThumbnail ?? this.sessionThumbnail);
    if (config.enabled === false || options.captureThumbnail === false) return null;
    if (!this.helios || typeof this.helios.exportFigurePreviewBlob !== 'function') return null;
    try {
      const blob = await this.helios.exportFigurePreviewBlob({
        format: 'png',
        preset: 'custom',
        width: config.maxWidth,
        height: config.maxHeight,
        includeLabels: config.includeLabels,
        includeLegends: config.includeLegends,
        includeInterface: config.includeInterface,
        transparentBackground: false,
        supersampling: 1,
      }, {
        maxWidth: config.maxWidth,
        maxHeight: config.maxHeight,
        supersampling: 1,
      });
      const bytes = estimateStoredByteLength(blob);
      if (config.maxBytes > 0 && bytes > config.maxBytes) return null;
      const dataUrl = await blobToDataUrl(blob);
      if (!dataUrl) return null;
      return {
        type: blob?.type || 'image/png',
        encoding: 'data-url',
        width: config.maxWidth,
        height: config.maxHeight,
        byteLength: bytes,
        dataUrl,
        capturedAt: this.now(),
      };
    } catch (error) {
      console.warn('Helios: failed to capture session thumbnail.', error);
      return null;
    }
  }

  async saveSession(options = {}) {
    if (!this.helios) throw new Error('Persistence service requires a Helios instance to save sessions');
    const id = typeof options.id === 'string' && options.id.trim() ? options.id.trim() : this.idFactory();
    const createdAt = Number.isFinite(options.createdAt) ? Number(options.createdAt) : this.now();
    const updatedAt = Number.isFinite(options.updatedAt) ? Number(options.updatedAt) : this.now();
    const networkFormat = typeof options.networkFormat === 'string' ? options.networkFormat : 'zxnet';
    const networkData = options.networkData ?? await this.helios.savePortableNetwork(networkFormat, {
      includeVisualization: false,
      output: 'uint8array',
    });
    const visualizationState = options.visualizationState ?? await this.exportVisualizationStateAsync({ format: 'object' });
    const visualizationPayload = migratePersistenceEnvelope(visualizationState, PERSISTENCE_KINDS.visualization).payload;
    const networkSource = options.networkSource ?? visualizationPayload.networkSource;
    const nickname = normalizeSessionNickname(options.nickname ?? options.name ?? options.label)
      ?? normalizeSessionNickname(networkSource?.baseName ?? networkSource?.name)
      ?? normalizeSessionNickname(this.helios?._lastLoadedNetworkBase ?? this.helios?._lastLoadedNetworkName);
    const thumbnail = options.thumbnail && typeof options.thumbnail === 'object' && options.thumbnail.dataUrl
      ? cloneSerializable(options.thumbnail)
      : await this._captureSessionThumbnail(options);
    const payload = {
      session: {
        id,
        createdAt,
        updatedAt,
        workspaceId: this.workspaceId,
        nickname,
        unfinished: options.unfinished !== false,
        status: options.status ?? 'active',
      },
      preferences: options.preferences ?? this.preferences,
      responsivePreferences: options.responsivePreferences ?? this.preferences?.responsive,
      uiState: options.uiState ?? visualizationPayload.uiState,
      behaviorState: options.behaviorState ?? visualizationPayload.behaviorState,
      networkSource,
      networkData: {
        format: networkFormat,
        data: networkData,
      },
      thumbnail,
      visualizationState,
    };
    const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.session, payload);
    envelope.id = id;
    envelope.payload.session.bytes = estimateSessionEnvelopeBytes(envelope);
    await this.sessionStore.put(envelope);
    if (envelope.payload.session.unfinished) {
      await this.setUnfinishedSessionId(id);
    }
    await this.pruneSessions({
      ...this.sessionRetention,
      ...(options.retention && typeof options.retention === 'object' ? options.retention : {}),
      currentSessionId: id,
    });
    return envelope;
  }

  async getSession(id) {
    const stored = await this.sessionStore.get(id);
    return stored ? migratePersistenceEnvelope(stored, PERSISTENCE_KINDS.session) : null;
  }

  async deleteSession(id, options = {}) {
    const target = typeof id === 'string' ? id.trim() : String(id ?? '').trim();
    if (!target) return false;
    const existing = await this.getSession(target);
    if (!existing && options.requireExisting === true) return false;
    if (typeof this.sessionStore?.delete === 'function') {
      await this.sessionStore.delete(target);
    }
    await this.sessionController?.deleteStoredManifest?.(target);
    if (this.sessionController?.local !== false && this.sessionController?.storage) {
      for (const keyFactory of ['manifestKey', 'manifestBackupKey', 'manifestPendingKey']) {
        try {
          const key = this.sessionController[keyFactory]?.(target);
          if (key) this.sessionController.storage.removeItem?.(key);
        } catch (_) {
          // Ignore best-effort local manifest cleanup failures.
        }
      }
    }
    const unfinished = await this.getUnfinishedSessionId?.();
    if (unfinished != null && String(unfinished) === target) {
      await this.setUnfinishedSessionId?.(null);
    }
    if (options.remote === true && this.sessionController?.remote?.enabled && this.sessionController?.remote?.url) {
      try {
        const headers = { ...(this.sessionController.remote.headers ?? {}) };
        if (this.sessionController.remote.key) headers.Authorization = `Bearer ${this.sessionController.remote.key}`;
        await fetch(`${this.sessionController.remote.url}/sessions/${encodeURIComponent(target)}`, {
          method: 'DELETE',
          headers,
        });
      } catch (error) {
        console.warn('Helios: failed to delete remote session.', error);
      }
    }
    this.registry?._emit?.('change', { entries: [], path: 'sessions', reason: 'session-delete', id: target });
    return Boolean(existing) || options.requireExisting !== true;
  }

  async listSessions(options = {}) {
    const records = await this.sessionStore.getAll();
    const workspaceId = options.workspaceId ?? this.workspaceId ?? null;
    const sessions = records
      .filter((entry) => entry?.kind !== 'session-manifest' && !String(entry?.id ?? '').startsWith('helios-web:session-manifest-record:'))
      .map((entry) => migratePersistenceEnvelope(entry, PERSISTENCE_KINDS.session))
      .filter((entry) => {
        if (options.includeAllWorkspaces === true || workspaceId == null) return true;
        const entryWorkspace = entry?.payload?.session?.workspaceId ?? null;
        if (entryWorkspace == null) {
          return options.includeLegacySessions === true
            || workspaceId === 'default'
            || workspaceId === 'helios-web-next-basic-demo';
        }
        return String(entryWorkspace) === String(workspaceId);
      })
      .filter((entry) => options.includeFinished === true || entry.payload.session.unfinished !== false)
      .sort((a, b) => (b.payload.session.updatedAt ?? 0) - (a.payload.session.updatedAt ?? 0));
    if (Number.isFinite(options.limit)) {
      return sessions.slice(0, Math.max(0, Number(options.limit)));
    }
    return sessions;
  }

  sessionSummary(envelope, options = {}) {
    const entry = migratePersistenceEnvelope(envelope, PERSISTENCE_KINDS.session);
    const session = entry?.payload?.session ?? {};
    const networkSource = entry?.payload?.networkSource ?? {};
    const nickname = normalizeSessionNickname(session.nickname);
    return {
      id: session.id ?? entry.id ?? null,
      workspaceId: session.workspaceId ?? entry?.payload?.workspaceId ?? null,
      nickname,
      label: nickname ?? networkSource.name ?? networkSource.baseName ?? session.id ?? 'session',
      createdAt: Number.isFinite(session.createdAt) ? Number(session.createdAt) : null,
      updatedAt: Number.isFinite(session.updatedAt) ? Number(session.updatedAt) : null,
      unfinished: session.unfinished !== false,
      status: session.status ?? 'active',
      bytes: Number.isFinite(session.bytes) ? Number(session.bytes) : estimateSessionEnvelopeBytes(entry),
      current: options.currentSessionId != null && String(options.currentSessionId) === String(session.id ?? entry.id),
      networkSource: cloneSerializable(networkSource),
      thumbnail: entry?.payload?.thumbnail ? cloneSerializable(entry.payload.thumbnail) : null,
    };
  }

  async startNewSession(options = {}) {
    const controller = this.sessionController;
    if (!controller) return null;
    const previousId = controller.sessionId ?? null;
    if (options.flushPrevious !== false && previousId) {
      const includeNetwork = options.includePreviousNetwork !== false;
      await controller.flush({
        includeNetwork,
        snapshotLayoutRuntime: options.snapshotPreviousLayoutRuntime === true,
        retention: options.preservePreviousRetention === false ? undefined : { enabled: false },
      }).catch((error) => {
        console.warn('Helios: failed to flush previous session before starting a new session.', error);
      });
    }
    const id = typeof options.id === 'string' && options.id.trim() ? options.id.trim() : this.idFactory();
    const nickname = normalizeSessionNickname(options.nickname ?? options.name ?? options.label);
    controller.updateConfig({
      id,
      nickname,
      restore: false,
      replaceUrlSession: options.replaceUrlSession !== false,
    });
    controller.resetTrackingBaseline?.(null, { clearJournal: true });
    await this.setUnfinishedSessionId(id);
    return {
      id,
      previousId,
      nickname,
      status: controller.status?.() ?? null,
    };
  }

  async setSessionNickname(nickname) {
    const normalized = normalizeSessionNickname(nickname);
    if (!this.sessionController) return null;
    this.sessionController.updateConfig({
      nickname: normalized,
      replaceUrlSession: false,
    });
    await this.sessionController.saveManifest?.({ snapshotLayoutRuntime: false });
    return normalized;
  }

  async listSessionSummaries(options = {}) {
    const currentSessionId = options.currentSessionId ?? this.sessionController?.sessionId ?? null;
    const sessions = await this.listSessions(options);
    return sessions.map((entry) => this.sessionSummary(entry, { currentSessionId }));
  }

  async getRestorableSessions(options = {}) {
    const currentSessionId = options.currentSessionId ?? this.sessionController?.sessionId ?? null;
    const sessions = await this.listSessions({
      ...options,
      includeFinished: options.includeFinished === true,
      limit: undefined,
    });
    const filtered = sessions.filter((entry) => {
      const id = entry?.payload?.session?.id ?? entry?.id ?? null;
      if (options.excludeCurrent === true && currentSessionId != null && String(id) === String(currentSessionId)) return false;
      return true;
    });
    const limited = Number.isFinite(options.limit)
      ? filtered.slice(0, Math.max(0, Number(options.limit)))
      : filtered;
    return limited;
  }

  async getRestorableSession(options = {}) {
    const unfinishedId = await this.getUnfinishedSessionId();
    const currentSessionId = options.currentSessionId ?? this.sessionController?.sessionId ?? null;
    if (unfinishedId) {
      const stored = await this.getSession(unfinishedId);
      if (
        stored?.payload?.session?.unfinished !== false
        && !(options.excludeCurrent === true && currentSessionId != null && String(unfinishedId) === String(currentSessionId))
      ) return stored;
    }
    const [latest] = await this.getRestorableSessions({
      ...options,
      includeFinished: false,
      limit: 1,
      excludeCurrent: options.excludeCurrent === true,
      currentSessionId,
    });
    return latest ?? null;
  }

  async getResumeSessions(options = {}) {
    const currentSessionId = options.currentSessionId ?? this.sessionController?.sessionId ?? null;
    const sessions = await this.getRestorableSessions({
      excludeCurrent: true,
      limit: options.limit ?? 8,
      ...options,
      currentSessionId,
    });
    return sessions.map((entry) => this.sessionSummary(entry, { currentSessionId }));
  }

  async getResumePrompt(options = {}) {
    if (this.sessionController?.shouldShowRestorePrompt?.() === false) return null;
    const sessions = await this.getResumeSessions(options);
    const first = sessions[0] ?? null;
    if (!first?.id) return null;
    return {
      visible: true,
      sessionId: first.id,
      status: 'prompt',
      updatedAt: first.updatedAt ?? null,
      networkSource: cloneSerializable(first.networkSource),
      sessions: cloneSerializable(sessions),
    };
  }

  async resumeSession(sessionId, options = {}) {
    const target = sessionId ?? this.sessionController?.sessionId ?? null;
    if (!target) return null;
    return this.restoreSession(target, {
      replaceUrlSession: true,
      ...options,
    });
  }

  async restoreActiveSession(options = {}) {
    const controller = this.sessionController ?? null;
    if (!controller) return null;
    controller.captureBaseline?.();
    if (options.restore === false) {
      if (options.saveInitialManifest !== false) {
        await controller.saveManifest?.({ snapshotLayoutRuntime: options.snapshotLayoutRuntime !== false });
      }
      return null;
    }
    const restored = await controller.restore?.(controller.sessionId, {
      applyNetwork: options.restoreNetwork === true,
      ...options,
    });
    if (!restored && controller.explicitSessionRequested === true && controller.explicitSessionInvalid === true) {
      console.warn(`[HeliosPersistence] Explicit session id "${controller.requestedSessionId ?? controller.sessionId}" was not found; showing resume prompt instead.`);
      controller.explicitSessionRequested = false;
      const interfaceBehavior = this.helios?.behavior?.interface ?? this.helios?.getBehavior?.('interface') ?? null;
      if (interfaceBehavior) {
        interfaceBehavior._persistenceReady = null;
        await interfaceBehavior.ensurePersistenceReady?.();
      }
    } else if (restored && controller.explicitSessionRequested === true) {
      const interfaceBehavior = this.helios?.behavior?.interface ?? this.helios?.getBehavior?.('interface') ?? null;
      interfaceBehavior?.dismissResumePrompt?.();
    }
    return restored ?? null;
  }

  async restoreSession(idOrEnvelope, options = {}) {
    if (!this.helios) throw new Error('Persistence service requires a Helios instance to restore sessions');
    const envelope = typeof idOrEnvelope === 'string'
      ? await this.getSession(idOrEnvelope)
      : migratePersistenceEnvelope(idOrEnvelope, PERSISTENCE_KINDS.session);
    if (!envelope) {
      if (typeof idOrEnvelope === 'string' && this.sessionController?.restore) {
        return this.sessionController.restore(idOrEnvelope, options);
      }
      return null;
    }
    const payload = envelope.payload;
    await this.helios.loadNetwork(payload.networkData.data, {
      format: payload.networkData.format,
      disposeOld: options.disposeOld !== false,
      recreateRenderer: options.recreateRenderer !== false,
      keepCamera: true,
      frame: false,
      restoreVisualizationState: false,
      allowDuringInitialize: true,
      markNetworkDirty: false,
    });
    if (options.restoreVisualizationState !== false) {
      await this.helios.importVisualizationState(payload.visualizationState, {
        ...options,
        restoreLayoutRunState: options.restoreLayoutRunState === true,
        hydratePersistence: false,
        refreshPersistence: false,
      });
      this.hydrateSessionOverrides({}, {
        group: 'visualization',
        reason: 'session-restore-baseline',
      });
      const baseline = this.helios.serializeVisualizationState?.({
        layoutRuntime: { includePositions: false },
      });
      if (baseline) this.sessionController?.captureBaseline?.(baseline);
    }
    if (options.restoreOverrides !== false && this.sessionController?.restore) {
      await this.sessionController.restore(payload.session.id, { ...options, applyNetwork: false });
    }
    if (this.sessionController?.updateConfig) {
      this.sessionController.updateConfig({
        id: payload.session.id,
        nickname: payload.session.nickname ?? payload.networkSource?.baseName ?? payload.networkSource?.name ?? null,
        restore: false,
        replaceUrlSession: options.replaceUrlSession !== false,
      });
      this.sessionController.explicitSessionRequested = true;
      this.sessionController.requestedSessionId = payload.session.id;
    }
    this.preferences = createDefaultPreferencesState(payload.preferences);
    await this.savePreferences(this.preferences);
    if (options.markFinished === true) {
      payload.session.unfinished = false;
      payload.session.status = 'restored';
      const next = createPersistenceEnvelope(PERSISTENCE_KINDS.session, payload);
      next.id = payload.session.id;
      await this.sessionStore.put(next);
      await this.setUnfinishedSessionId(null);
      return next;
    }
    await this.setUnfinishedSessionId(payload.session.id);
    if (options.autosyncAfterRestore !== false && this._featureAutosaveEnabled('network')) {
      this.markNetworkDirty('session-restored');
    }
    if (payload.preferences?.theme) {
      this.set('ui.theme', payload.preferences.theme, {
        scope: 'user',
        source: 'session-restore',
        reason: 'theme-restore',
        autosave: false,
      });
    }
    return envelope;
  }

  async restoreUnfinishedSession(options = {}) {
    const envelope = await this.getRestorableSession();
    if (!envelope) return null;
    return this.restoreSession(envelope, options);
  }

  async markSessionFinished(id) {
    const session = await this.getSession(id);
    if (!session) return null;
    session.payload.session.unfinished = false;
    session.payload.session.status = 'finished';
    const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.session, session.payload);
    envelope.id = session.payload.session.id;
    await this.sessionStore.put(envelope);
    const currentUnfinished = await this.getUnfinishedSessionId();
    if (currentUnfinished === id) {
      await this.setUnfinishedSessionId(null);
    }
    return envelope;
  }

  async pruneSessions(options = {}) {
    const retention = normalizeSessionRetention(options);
    if (retention.enabled === false) return { deleted: [], totalBytes: 0 };
    const currentSessionId = options.currentSessionId ?? this.sessionController?.sessionId ?? null;
    const workspaceSessions = await this.listSessions({ includeFinished: true });
    const workspaceIds = new Set(workspaceSessions.map((entry) => String(entry?.payload?.session?.id ?? entry?.id ?? '')));
    const allSessions = await this.listSessions({ includeFinished: true, includeAllWorkspaces: true });
    const summaries = allSessions.map((entry) => ({
      envelope: entry,
      summary: this.sessionSummary(entry, { currentSessionId }),
      inWorkspace: workspaceIds.has(String(entry?.payload?.session?.id ?? entry?.id ?? '')),
    }));
    let totalBytes = summaries.reduce((total, entry) => total + (entry.summary.bytes ?? 0), 0);
    const workspaceNewestFirst = summaries
      .filter((entry) => entry.inWorkspace)
      .slice()
      .sort((a, b) => (b.summary.updatedAt ?? 0) - (a.summary.updatedAt ?? 0));
    const keep = new Set();
    for (let i = 0; i < workspaceNewestFirst.length && i < retention.maxSessions; i += 1) {
      if (workspaceNewestFirst[i].summary.id) keep.add(String(workspaceNewestFirst[i].summary.id));
    }
    if (currentSessionId != null) keep.add(String(currentSessionId));

    let workspaceRemaining = workspaceNewestFirst.length;
    const candidates = summaries
      .filter((entry) => entry.summary.id && String(entry.summary.id) !== String(currentSessionId))
      .sort((a, b) => {
        if (a.inWorkspace !== b.inWorkspace) return a.inWorkspace ? 1 : -1;
        return (a.summary.updatedAt ?? 0) - (b.summary.updatedAt ?? 0);
      });
    const deleted = [];
    for (const entry of candidates) {
      const id = String(entry.summary.id);
      const tooMany = entry.inWorkspace && workspaceRemaining > retention.maxSessions && !keep.has(id);
      const tooLarge = retention.maxBytes > 0 && totalBytes > retention.maxBytes;
      if (!tooMany && !tooLarge) continue;
      await this.deleteSession(id);
      deleted.push(id);
      totalBytes = Math.max(0, totalBytes - (entry.summary.bytes ?? 0));
      if (entry.inWorkspace) workspaceRemaining = Math.max(0, workspaceRemaining - 1);
    }
    return { deleted, totalBytes };
  }

  markNetworkDirty(reason = 'network') {
    this.registry.markNetworkDirty(reason);
    this.sessionController?.markNetworkDirty?.(reason);
    if (this._featureAutosaveEnabled('network')) {
      this.scheduleAutosync({
        includeNetwork: true,
        includePositions: this._featureEnabled('positions'),
        reason,
      });
    }
    return this.persistenceStatus();
  }

  markPositionsDirty(reason = 'positions') {
    this.registry.markPositionsDirty(reason);
    if (this._featureAutosaveEnabled('positions')) {
      this.scheduleAutosync({
        includePositions: true,
        reason,
      });
    }
    return this.persistenceStatus();
  }

  destroy() {
    if (this._autosyncTimer) {
      clearTimeout(this._autosyncTimer);
      this._autosyncTimer = null;
    }
    this._autosyncPending = null;
    this._interactionCleanup?.();
    this._interactionCleanup = null;
    this._sessionControllerBridgeCleanup?.();
    this._sessionControllerBridgeCleanup = null;
    for (const binding of this._behaviorPersistenceBindings.values()) {
      binding.cleanup?.();
    }
    this._behaviorPersistenceBindings.clear();
  }

  savePortableStateToNetwork(options = {}) {
    return this.registry.sync({ ...options, includeNetwork: true, includePositions: options.includePositions !== false });
  }

  async restorePortableStateFromNetwork(options = {}) {
    await this.registry.load(options);
    const positions = this.get('positions.current');
    if (positions && this.helios && typeof this.helios.restoreLayoutRuntimeState === 'function') {
      this.helios.restoreLayoutRuntimeState({ positions }, {
        reason: options.reason ?? 'central-persistence-restore',
      });
    }
    return this.persistenceStatus();
  }
}

export default HeliosPersistenceService;
