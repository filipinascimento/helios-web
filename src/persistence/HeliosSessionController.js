import {
  PERSISTENCE_KINDS,
  createPersistenceEnvelope,
  migratePersistenceEnvelope,
  parsePersistenceEnvelope,
  serializePersistenceEnvelope,
} from './schema.js';

const SESSION_MANIFEST_PREFIX = 'helios-web:session-manifest:';
const SESSION_MANIFEST_BACKUP_SUFFIX = ':previous-complete';
const SESSION_MANIFEST_PENDING_SUFFIX = ':pending';
const SESSION_MANIFEST_RECORD_PREFIX = 'helios-web:session-manifest-record:';
const DEFAULT_AUTOSAVE_DELAY_MS = 750;
const DEFAULT_MAX_JOURNAL_ENTRIES = 100;
const DEFAULT_NETWORK_LIMIT_BYTES = 128 * 1024 * 1024;
const MAX_NETWORK_LIMIT_BYTES = 256 * 1024 * 1024;
const IGNORED_CHANGE_REASONS = new Set([
  'attach',
  'attributes',
  'binding',
  'binding-change',
  'layout-start',
  'layout-stop',
  'network-replaced',
  'node-hover',
  'node-hover-clear',
  'edge-hover',
  'edge-hover-clear',
  'persistence-ready',
  'renderer-changed',
  'restore',
  'restore-interface',
  'ui-binding',
  'viewport',
]);
const VOLATILE_OVERRIDE_PATHS = new Set([
  'appearance.edgeStyle.adaptiveQuality.active',
  'appearance.edgeStyle.adaptiveQuality.manualFastRendering',
  'appearance.edgeStyle.adaptiveQuality.reason',
  'appearance.edgeStyle.adaptiveQuality.lastRenderMs',
  'appearance.edgeStyle.adaptiveQuality.qualityFrameAverageMs',
  'appearance.edgeStyle.adaptiveQuality.qualityFrameSampleCount',
]);
const VOLATILE_OVERRIDE_PREFIXES = [
  'camera.viewport',
];
const CAMERA_POSE_OVERRIDE_PREFIXES = [
  'camera.mode',
  'camera.projection',
  'camera.distance',
  'camera.far',
  'camera.fov',
  'camera.near',
  'camera.near2D',
  'camera.far2D',
  'camera.pan2D',
  'camera.pan3D',
  'camera.rotation',
  'camera.target',
  'camera.zoom',
];
const CAMERA_POSE_ESSENTIAL_PREFIXES = [
  'camera.mode',
  'camera.projection',
  'camera.distance',
  'camera.fov',
  'camera.near',
  'camera.far',
  'camera.near2D',
  'camera.far2D',
  'camera.pan2D',
  'camera.pan3D',
  'camera.rotation',
  'camera.target',
  'camera.zoom',
];
const CANONICAL_BEHAVIOR_OVERRIDE_IDS = new Set(['layout', 'legends', 'filters', 'selection', 'mappers']);

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
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseStoredManifest(raw) {
  if (!raw) return null;
  try {
    const manifest = JSON.parse(raw);
    if (!manifest || typeof manifest !== 'object') return null;
    if (manifest.complete === false || manifest.commit?.status === 'pending') return null;
    if (manifest.schema !== 'helios-web.session-manifest') return null;
    return manifest;
  } catch (_) {
    return null;
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function setAtPath(root, segments, value) {
  let target = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (!isPlainObject(target[key])) target[key] = {};
    target = target[key];
  }
  target[segments.at(-1)] = cloneSerializable(value);
}

function setPatchPath(root, segments, value) {
  if (!segments.length) return root;
  let target = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    const nextKey = segments[i + 1];
    const shouldBeArray = /^\d+$/.test(String(nextKey));
    if (shouldBeArray) {
      if (!Array.isArray(target[key])) target[key] = [];
    } else if (!isPlainObject(target[key])) {
      target[key] = {};
    }
    target = target[key];
  }
  target[segments.at(-1)] = cloneSerializable(value);
  return root;
}

function flattenObject(value, prefix, output) {
  if (Array.isArray(value) || !isPlainObject(value)) {
    output[prefix] = cloneSerializable(value);
    return;
  }
  const entries = Object.entries(value);
  if (!entries.length && prefix) {
    output[prefix] = {};
    return;
  }
  for (const [key, entry] of entries) {
    flattenObject(entry, prefix ? `${prefix}.${key}` : key, output);
  }
}

function isVolatileOverridePath(path) {
  const target = String(path ?? '');
  return VOLATILE_OVERRIDE_PATHS.has(target)
    || VOLATILE_OVERRIDE_PREFIXES.some((prefix) => target === prefix || target.startsWith(`${prefix}.`));
}

function pruneVolatileOverrides(map = {}) {
  for (const path of Object.keys(map)) {
    if (isVolatileOverridePath(path)) delete map[path];
  }
  return map;
}

function isPathWithinPrefixes(path, prefixes) {
  const target = String(path ?? '');
  return prefixes.some((prefix) => target === prefix || target.startsWith(`${prefix}.`));
}

function normalizeOverrideMap(map = {}) {
  const next = pruneVolatileOverrides(map);
  const hasCameraPoseOverride = Object.keys(next).some((path) => isPathWithinPrefixes(path, CAMERA_POSE_OVERRIDE_PREFIXES));
  if (hasCameraPoseOverride && !Object.prototype.hasOwnProperty.call(next, 'cameraControls.autoFit')) {
    next['cameraControls.autoFit'] = false;
  }
  return next;
}

function addCameraPoseEssentials(overrides = {}, currentMap = {}) {
  const hasCameraPoseOverride = Object.keys(overrides).some((path) => isPathWithinPrefixes(path, CAMERA_POSE_OVERRIDE_PREFIXES));
  if (!hasCameraPoseOverride) return overrides;
  for (const [path, value] of Object.entries(currentMap)) {
    if (isPathWithinPrefixes(path, CAMERA_POSE_ESSENTIAL_PREFIXES)) {
      overrides[path] = cloneSerializable(value);
    }
  }
  return overrides;
}

function pathMatchesScope(path, scope) {
  const target = String(path ?? '');
  const prefix = String(scope ?? '').trim();
  return Boolean(prefix) && (target === prefix || target.startsWith(`${prefix}.`));
}

function pathMatchesAnyScope(path, scopes = null) {
  if (!Array.isArray(scopes) || scopes.length === 0) return true;
  return scopes.some((scope) => pathMatchesScope(path, scope));
}

function normalizeChangeScopes(scopes) {
  if (!scopes) return null;
  const list = Array.isArray(scopes) ? scopes : [scopes];
  const normalized = [];
  for (const scope of list) {
    const value = String(scope ?? '').trim();
    if (value && !normalized.includes(value)) normalized.push(value);
  }
  return normalized.length ? normalized : null;
}

function scopesForSnapshotChange({ behavior = null, reason = null, method = null, scope = null, scopes = null } = {}) {
  const explicit = normalizeChangeScopes(scopes ?? scope);
  if (explicit) return explicit;
  if (behavior) return normalizeChangeScopes(behavior);
  const reasonKey = String(reason ?? '');
  if (reasonKey === 'camera' || reasonKey === 'camera-controls') return ['camera', 'cameraControls'];
  if (reasonKey === 'mode') return ['camera', 'cameraControls', 'scene'];
  if (method === 'camera.setPose' || method === 'camera.transition' || method === 'camera.frame' || method === 'camera.controls') {
    return ['camera', 'cameraControls'];
  }
  return null;
}

export function flattenVisualizationOverrides(source) {
  const envelope = migratePersistenceEnvelope(source, PERSISTENCE_KINDS.visualization);
  const payload = envelope.payload ?? {};
  const output = {};
  const behaviors = payload.behaviorState && typeof payload.behaviorState === 'object'
    ? payload.behaviorState
    : {};
  for (const [id, snapshot] of Object.entries(behaviors)) {
    if (CANONICAL_BEHAVIOR_OVERRIDE_IDS.has(id) && snapshot && typeof snapshot === 'object') {
      output[`behaviors.${id}.state`] = cloneSerializable(snapshot);
    }
    const options = snapshot?.options && typeof snapshot.options === 'object'
      ? snapshot.options
      : {};
    flattenObject(options, id, output);
    if (id === 'filters' && snapshot?.filter && typeof snapshot.filter === 'object') {
      flattenObject(snapshot.filter, 'filters', output);
    }
    if (id === 'selection') {
      if (Object.prototype.hasOwnProperty.call(snapshot ?? {}, 'selectedNodes')) {
        output['selection.selectedNodes'] = cloneSerializable(snapshot.selectedNodes);
      }
      if (Object.prototype.hasOwnProperty.call(snapshot ?? {}, 'selectedEdges')) {
        output['selection.selectedEdges'] = cloneSerializable(snapshot.selectedEdges);
      }
      if (Object.prototype.hasOwnProperty.call(snapshot ?? {}, 'savedSelectionAttribute')) {
        output['selection.savedSelectionAttribute'] = snapshot.savedSelectionAttribute;
      }
      if (Object.prototype.hasOwnProperty.call(snapshot ?? {}, 'lastNamedSelectionAttribute')) {
        output['selection.lastNamedSelectionAttribute'] = snapshot.lastNamedSelectionAttribute;
      }
    }
  }
  if (payload.uiState) flattenObject(payload.uiState, 'ui', output);
  if (payload.cameraState) {
    flattenObject(payload.cameraState, 'camera', output);
    if (payload.cameraState.mode === '2d' || payload.cameraState.mode === '3d') {
      output['scene.dimension'] = payload.cameraState.mode;
    }
  }
  if (payload.cameraControlState) flattenObject(payload.cameraControlState, 'cameraControls', output);
  return pruneVolatileOverrides(output);
}

export function diffOverrideMaps(base = {}, current = {}) {
  const paths = new Set([...Object.keys(base), ...Object.keys(current)]);
  const diff = {};
  for (const path of paths) {
    if (valuesEqual(base[path], current[path])) continue;
    if (Object.prototype.hasOwnProperty.call(current, path)) {
      diff[path] = cloneSerializable(current[path]);
    }
  }
  return diff;
}

export function applyOverridesToVisualizationState(source, overrides = {}) {
  const envelope = migratePersistenceEnvelope(source, PERSISTENCE_KINDS.visualization);
  const payload = cloneSerializable(envelope.payload ?? {});
  const normalizedOverrides = normalizeOverrideMap(cloneSerializable(overrides ?? {}));
  for (const [path, value] of Object.entries(normalizedOverrides)) {
    if (isVolatileOverridePath(path)) continue;
    const segments = String(path).split('.').filter(Boolean);
    if (!segments.length) continue;
    if (segments[0] === 'ui') {
      if (!payload.uiState) payload.uiState = {};
      setAtPath(payload.uiState, segments.slice(1), value);
      continue;
    }
    if (segments[0] === 'scene' && segments[1] === 'dimension') {
      const mode = value === '3d' ? '3d' : (value === '2d' ? '2d' : null);
      if (mode) {
        if (!payload.cameraState) payload.cameraState = {};
        payload.cameraState.mode = mode;
      }
      continue;
    }
    if (segments[0] === 'camera') {
      if (!payload.cameraState) payload.cameraState = {};
      setAtPath(payload.cameraState, segments.slice(1), value);
      continue;
    }
    if (segments[0] === 'cameraControls') {
      if (!payload.cameraControlState) payload.cameraControlState = {};
      setAtPath(payload.cameraControlState, segments.slice(1), value);
      continue;
    }
    if (segments[0] === 'behaviors' && segments.length >= 3 && segments[2] === 'state') {
      if (!payload.behaviorState) payload.behaviorState = {};
      payload.behaviorState[segments[1]] = cloneSerializable(value);
      continue;
    }
    const behaviorId = segments[0];
    if (!payload.behaviorState) payload.behaviorState = {};
    if (!payload.behaviorState[behaviorId]) payload.behaviorState[behaviorId] = { options: {} };
    if (!payload.behaviorState[behaviorId].options) payload.behaviorState[behaviorId].options = {};
    setAtPath(payload.behaviorState[behaviorId].options, segments.slice(1), value);
  }
  return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, payload, envelope.metadata);
}

function defaultSessionIdFactory() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `helios-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sessionIdFromUrl() {
  try {
    const query = new URLSearchParams(globalThis.location?.search ?? '');
    const explicit = query.get('sessionId') || query.get('heliosSessionId');
    if (explicit) return explicit;
    const session = query.get('session');
    const normalized = String(session ?? '').trim().toLowerCase();
    if (normalized && normalized !== '0' && normalized !== '1' && normalized !== 'true' && normalized !== 'false') {
      return session;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function normalizeUrlSessionRouting(options = {}) {
  const raw = options.url ?? options.urlRouting ?? options.appendToUrl ?? options.urlSession;
  if (raw === true || raw === 'url' || raw === 'replace') {
    return {
      enabled: true,
      param: options.urlSessionParam ?? options.sessionParam ?? 'sessionId',
      replace: true,
    };
  }
  if (!raw || typeof raw !== 'object' || raw.enabled === false) return { enabled: false };
  return {
    enabled: true,
    param: raw.param ?? raw.name ?? options.urlSessionParam ?? 'sessionId',
    replace: raw.replace !== false,
  };
}

function ensureSessionIdInUrl(id, routing) {
  if (!id || routing?.enabled !== true) return;
  try {
    const location = globalThis.location;
    const history = globalThis.history;
    if (!location || !history?.replaceState) return;
    const url = new URL(location.href);
    const param = String(routing.param || 'sessionId');
    if (url.searchParams.get(param) === id) return;
    if (!url.searchParams.has(param) || routing.replaceExisting === true) {
      url.searchParams.set(param, id);
      history.replaceState(history.state, '', url);
    }
  } catch (_) {
    // URL routing is best-effort and should never block persistence setup.
  }
}

function normalizeRemoteConfig(remote) {
  if (!remote || typeof remote !== 'object' || !remote.url) return null;
  const baseUrl = String(remote.url).replace(/\/+$/, '');
  return {
    enabled: remote.enabled !== false,
    url: baseUrl,
    key: typeof (remote.key ?? remote.apiKey ?? remote.token) === 'string'
      ? (remote.key ?? remote.apiKey ?? remote.token)
      : null,
    headers: remote.headers && typeof remote.headers === 'object' ? { ...remote.headers } : {},
  };
}

function normalizeNetworkPersistence(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled: source.enabled !== false,
    format: typeof source.format === 'string' ? source.format : 'zxnet',
    maxBytes: Number.isFinite(source.maxBytes) ? Math.max(0, Number(source.maxBytes)) : null,
    includeVisualization: source.includeVisualization === true,
  };
}

function normalizeMaxJournalEntries(value, fallback = DEFAULT_MAX_JOURNAL_ENTRIES) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(Number(value)));
}

function estimateByteLength(value) {
  if (!value) return 0;
  if (typeof value.byteLength === 'number') return value.byteLength;
  if (typeof value.size === 'number') return value.size;
  if (typeof value.length === 'number') return value.length;
  return 0;
}

function createCommittedManifest(manifest, now = Date.now()) {
  if (!manifest) return manifest;
  if (manifest.complete === true && manifest.commit?.status === 'complete') return manifest;
  const completedAt = now;
  const commitId = `${completedAt}-${Math.random().toString(36).slice(2)}`;
  return {
    ...manifest,
    complete: true,
    commit: {
      id: commitId,
      status: 'complete',
      completedAt,
    },
  };
}

function compactManifestForLocalStorage(manifest) {
  if (!manifest || typeof manifest !== 'object') return manifest;
  const next = cloneSerializable(manifest);
  if (next.layoutRuntimeState?.positions) {
    next.layoutRuntimeState = {
      ...next.layoutRuntimeState,
      positions: null,
      positionsStoredExternally: true,
    };
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

export class HeliosSessionController extends EventTarget {
  constructor(options = {}) {
    super();
    this.helios = options.helios ?? null;
    this.persistence = options.persistence ?? null;
    this.storage = options.storage ?? globalThis.localStorage ?? null;
    this.sessionStore = options.sessionStore ?? this.persistence?.sessionStore ?? null;
    this.idFactory = options.idFactory ?? defaultSessionIdFactory;
    this.now = options.now ?? (() => Date.now());
    this.sessionId = null;
    this.nickname = null;
    this.requestedSessionId = null;
    this.explicitSessionRequested = false;
    this.explicitSessionInvalid = false;
    this.autosave = true;
    this.local = true;
    this.remote = null;
    this.urlRouting = { enabled: false };
    this.networkPersistence = normalizeNetworkPersistence(options.networkPersistence);
    this.baseline = null;
    this.baselineMap = {};
    this.overrides = {};
    this.journal = [];
    this.maxJournalEntries = normalizeMaxJournalEntries(options.maxJournalEntries);
    this.checkpointSeq = 0;
    this.nextSeq = 1;
    this.dirtyState = { controls: {}, sections: {}, panels: {} };
    this.networkData = { enabled: this.networkPersistence.enabled, status: 'idle' };
    this.layoutRuntimeState = null;
    this.pendingSave = null;
    this.sessionSavedAt = null;
    this.sessionSaveError = null;
    this.saveInProgress = false;
    this.readyPromise = null;
    this.saveTimer = null;
    this.initialPersistenceReady = false;
    this.suspended = false;
    this.restoring = false;
    this.restoreEventSuppressed = false;
    this.restoreEventTimer = null;
    this.activeSource = null;
    this.unsubscribers = [];
  }

  configure(options = {}) {
    const urlSessionId = sessionIdFromUrl();
    const explicitSessionId = options.id ?? options.sessionId ?? urlSessionId ?? null;
    this.explicitSessionRequested = explicitSessionId != null && explicitSessionId !== '';
    this.requestedSessionId = this.explicitSessionRequested ? String(explicitSessionId) : null;
    this.explicitSessionInvalid = false;
    this.sessionId = String(explicitSessionId ?? this.idFactory());
    this.nickname = typeof options.nickname === 'string' && options.nickname.trim() ? options.nickname.trim() : null;
    this.urlRouting = normalizeUrlSessionRouting(options);
    ensureSessionIdInUrl(this.sessionId, this.urlRouting);
    this.autosave = options.autosave !== false;
    this.local = options.local !== false;
    this.remote = normalizeRemoteConfig(options.remote);
    this.networkPersistence = normalizeNetworkPersistence(options.networkPersistence ?? this.networkPersistence);
    this.maxJournalEntries = normalizeMaxJournalEntries(options.maxJournalEntries, this.maxJournalEntries);
    this.networkData.enabled = this.networkPersistence.enabled;
    this.captureBaseline();
    this.attachListeners();
    this.attachLifecycleListeners();
    if (options.deferRestore === true) {
      this.initialPersistenceReady = false;
      this.readyPromise = Promise.resolve(null);
      return this.status();
    }
    if (options.restore !== false) {
      this.initialPersistenceReady = false;
      this.readyPromise = this.restore(this.sessionId, { applyNetwork: options.restoreNetwork === true }).catch((error) => {
        console.warn('Helios session restore failed', error);
        this.initialPersistenceReady = true;
        return null;
      });
    } else {
      this.initialPersistenceReady = true;
      this.readyPromise = Promise.resolve(this.saveManifest());
    }
    return this.status();
  }

  updateConfig(options = {}) {
    const nextId = options.id ?? options.sessionId ?? null;
    if (nextId != null && String(nextId) !== this.sessionId) {
      this.sessionId = String(nextId);
      this.captureBaseline();
    }
    if (Object.prototype.hasOwnProperty.call(options, 'nickname')) {
      this.nickname = typeof options.nickname === 'string' && options.nickname.trim() ? options.nickname.trim() : null;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'autosave')) this.autosave = options.autosave !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'local')) this.local = options.local !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'remote')) this.remote = normalizeRemoteConfig(options.remote);
    if (
      Object.prototype.hasOwnProperty.call(options, 'url')
      || Object.prototype.hasOwnProperty.call(options, 'urlRouting')
      || Object.prototype.hasOwnProperty.call(options, 'appendToUrl')
      || Object.prototype.hasOwnProperty.call(options, 'urlSession')
      || Object.prototype.hasOwnProperty.call(options, 'urlSessionParam')
    ) {
      this.urlRouting = normalizeUrlSessionRouting(options);
    }
    ensureSessionIdInUrl(this.sessionId, {
      ...this.urlRouting,
      replaceExisting: options.replaceUrlSession === true || options.replaceUrl === true,
    });
    if (Object.prototype.hasOwnProperty.call(options, 'maxJournalEntries')) {
      this.maxJournalEntries = normalizeMaxJournalEntries(options.maxJournalEntries, this.maxJournalEntries);
      this.trimJournal();
    }
    if (Object.prototype.hasOwnProperty.call(options, 'networkPersistence')) {
      this.networkPersistence = normalizeNetworkPersistence({
        ...this.networkPersistence,
        ...(options.networkPersistence ?? {}),
      });
      this.networkData.enabled = this.networkPersistence.enabled;
    }
    this.dispatchEvent(createDetailEvent('config', this.status()));
    if (options.restore === true && this.sessionId) {
      this.initialPersistenceReady = false;
      this.readyPromise = this.restore(this.sessionId, { applyNetwork: options.restoreNetwork === true }).catch((error) => {
        console.warn('Helios session restore failed', error);
        this.initialPersistenceReady = true;
        return null;
      });
    }
    if (this.autosave) this.scheduleSave(0);
    return this.status();
  }

  hasStoredSessionManifest(id = this.sessionId) {
    return Boolean(this.loadManifest(id));
  }

  shouldShowRestorePrompt() {
    if (this.restoring === true) return false;
    if (this.explicitSessionRequested && this.explicitSessionInvalid !== true) return false;
    return true;
  }

  setOverride(path, value, detail = {}) {
    const target = String(path ?? '').trim();
    if (!target) return [];
    if (isVolatileOverridePath(target)) return [];
    if (!this.baseline) this.captureBaseline();
    const previousOverrides = { ...this.overrides };
    const oldValue = previousOverrides[target] ?? this.baselineMap[target] ?? null;
    if (valuesEqual(oldValue, value)) return [];
    if (valuesEqual(this.baselineMap[target], value)) delete this.overrides[target];
    else this.overrides[target] = cloneSerializable(value);
    this.overrides = normalizeOverrideMap(this.overrides);
    const entry = {
      seq: this.nextSeq,
      timestamp: this.now(),
      source: detail.source ?? this.activeSource ?? 'user',
      path: target,
      oldValue: cloneSerializable(oldValue),
      newValue: cloneSerializable(value),
      method: detail.method ?? null,
      reason: detail.reason ?? 'set-override',
      status: 'pending',
    };
    this.nextSeq += 1;
    this.appendJournalEntries([entry]);
    this.recomputeDirtyState();
    this.dispatchEvent(createDetailEvent('change', { entries: [entry], overrides: this.getOverrides() }));
    if (this.autosave) this.scheduleSave();
    return [cloneSerializable(entry)];
  }

  manifestKey(id = this.sessionId) {
    return `${SESSION_MANIFEST_PREFIX}${id}`;
  }

  manifestBackupKey(id = this.sessionId) {
    return `${this.manifestKey(id)}${SESSION_MANIFEST_BACKUP_SUFFIX}`;
  }

  manifestPendingKey(id = this.sessionId) {
    return `${this.manifestKey(id)}${SESSION_MANIFEST_PENDING_SUFFIX}`;
  }

  manifestRecordKey(id = this.sessionId) {
    return `${SESSION_MANIFEST_RECORD_PREFIX}${encodeURIComponent(String(id ?? ''))}`;
  }

  captureOverrideSnapshot(snapshot = null) {
    if (snapshot) return snapshot;
    return this.helios?.serializeVisualizationState?.({
      layoutRuntime: { includePositions: false },
    }) ?? null;
  }

  captureBaseline(snapshot = null) {
    const state = this.captureOverrideSnapshot(snapshot);
    if (!state) return null;
    this.baseline = migratePersistenceEnvelope(state, PERSISTENCE_KINDS.visualization);
    this.baselineMap = flattenVisualizationOverrides(this.baseline);
    this.recomputeDirtyState();
    return this.baseline;
  }

  resetTrackingBaseline(snapshot = null, { clearJournal = true } = {}) {
    const baseline = this.captureBaseline(snapshot);
    this.overrides = {};
    this.dirtyState = { controls: {}, sections: {}, panels: {} };
    if (clearJournal) {
      this.journal = [];
      this.checkpointSeq = 0;
      this.nextSeq = 1;
    }
    this.dispatchEvent(createDetailEvent('change', { entries: [], overrides: this.getOverrides() }));
    if (this.autosave) this.scheduleSave(0);
    return baseline;
  }

  appendJournalEntries(entries = []) {
    if (!entries?.length || this.maxJournalEntries === 0) return;
    for (const sourceEntry of entries) {
      const entry = cloneSerializable(sourceEntry);
      const pendingIndex = this.journal.findIndex((item) => (
        item?.status === 'pending'
        && item.path === entry.path
      ));
      if (pendingIndex >= 0) {
        this.journal[pendingIndex] = {
          ...entry,
          seq: this.journal[pendingIndex].seq ?? entry.seq,
          oldValue: cloneSerializable(this.journal[pendingIndex].oldValue ?? entry.oldValue),
        };
      } else {
        this.journal.push(entry);
      }
    }
    this.trimJournal();
  }

  trimJournal() {
    if (this.maxJournalEntries === 0) {
      this.journal = [];
      return;
    }
    const overflow = this.journal.length - this.maxJournalEntries;
    if (overflow > 0) this.journal.splice(0, overflow);
  }

  attachListeners() {
    for (const off of this.unsubscribers) off?.();
    this.unsubscribers = [];
    for (const behavior of this.helios?.behaviors?.values?.() ?? []) {
      if (typeof behavior?.on !== 'function') continue;
      this.unsubscribers.push(behavior.on('change', (event) => {
        const detail = event?.detail ?? {};
        if (this.suspended) return;
        if (IGNORED_CHANGE_REASONS.has(detail.reason)) return;
        this.recordCurrentState({
          source: this.activeSource ?? detail.source ?? 'user',
          reason: detail.reason ?? 'behavior-change',
          behavior: behavior.id ?? null,
        });
      }));
    }
    if (this.helios?.on) {
      let cameraMoveTimer = null;
      let cameraControlTimer = null;
      const scheduleCameraSave = () => {
        if (!this.autosave) return;
        const interactionDelay = Math.max(0, Number(this.persistence?.interactionIdleRemainingMs?.()) || 0);
        this.scheduleSave(Math.max(DEFAULT_AUTOSAVE_DELAY_MS, interactionDelay), {
          snapshotLayoutRuntime: false,
          emitSyncEvents: true,
        });
      };
      this.unsubscribers.push(this.helios.on('mode:changed', () => {
        if (!this.suspended) this.recordCurrentState({ source: this.activeSource ?? 'user', reason: 'mode' });
      }));
      this.unsubscribers.push(this.helios.on('camera:control-change', () => {
        if (!this.suspended) {
          const entries = this.recordCurrentState({ source: this.activeSource ?? 'user', reason: 'camera-controls' });
          if (entries.length) scheduleCameraSave();
          if (cameraControlTimer != null) clearTimeout(cameraControlTimer);
          cameraControlTimer = setTimeout(() => {
            cameraControlTimer = null;
            if (this.isChangeSuppressed()) return;
            const lateEntries = this.recordCurrentState({ source: this.activeSource ?? 'user', reason: 'camera' });
            if (lateEntries.length) scheduleCameraSave();
          }, 350);
        }
      }));
      this.unsubscribers.push(this.helios.on('camera:move', (event) => {
        if (this.isChangeSuppressed()) return;
        const detail = event?.detail ?? event ?? {};
        const origin = detail.origin ?? detail.change?.origin ?? null;
        if (origin !== 'interaction' && origin !== 'ui') return;
        const entries = this.recordCurrentState({ source: this.activeSource ?? 'user', reason: 'camera' });
        if (entries.length) scheduleCameraSave();
        if (cameraMoveTimer != null) clearTimeout(cameraMoveTimer);
        cameraMoveTimer = setTimeout(() => {
          cameraMoveTimer = null;
          if (!this.isChangeSuppressed()) {
            const entries = this.recordCurrentState({ source: this.activeSource ?? 'user', reason: 'camera' });
            if (entries.length) scheduleCameraSave();
          }
        }, 250);
      }));
      this.unsubscribers.push(() => {
        if (cameraMoveTimer != null) clearTimeout(cameraMoveTimer);
        cameraMoveTimer = null;
        if (cameraControlTimer != null) clearTimeout(cameraControlTimer);
        cameraControlTimer = null;
      });
      this.unsubscribers.push(this.helios.on('network:replaced', () => {
        if (this.suspended) return;
        this.markNetworkDirty('network-replaced');
      }));
    }
  }

  attachLifecycleListeners() {
    if (typeof globalThis.addEventListener !== 'function') return;
    const flushSmall = () => {
      if (!this.initialPersistenceReady) return;
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      this.recordCurrentState({
        source: this.activeSource ?? 'user',
        reason: 'lifecycle-flush',
      });
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      if (this.autosave && this.sessionId) {
        this.pendingSave = this.saveManifest({ snapshotLayoutRuntime: false });
      }
    };
    const warnPendingNetwork = (event) => {
      flushSmall();
      if (this.networkData?.dirty !== true) return;
      if (this.networkData?.status !== 'dirty') return;
      event.preventDefault?.();
      event.returnValue = '';
      return '';
    };
    globalThis.addEventListener('visibilitychange', flushSmall);
    globalThis.addEventListener('pagehide', flushSmall);
    globalThis.addEventListener('beforeunload', warnPendingNetwork);
    this.unsubscribers.push(() => {
      globalThis.removeEventListener?.('visibilitychange', flushSmall);
      globalThis.removeEventListener?.('pagehide', flushSmall);
      globalThis.removeEventListener?.('beforeunload', warnPendingNetwork);
    });
  }

  runWithSource(source, fn) {
    const previous = this.activeSource;
    this.activeSource = source ?? previous;
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        this.activeSource = previous;
      });
  }

  suspendDuring(fn) {
    const previous = this.suspended;
    this.suspended = true;
    return Promise.resolve()
      .then(fn)
      .finally(() => {
        this.suspended = previous;
      });
  }

  isChangeSuppressed(detail = {}) {
    if (this.suspended) return true;
    if (this.initialPersistenceReady === false && detail.source !== 'cli') return true;
    if (!this.restoreEventSuppressed) return false;
    const source = detail.source ?? this.activeSource ?? null;
    if (source === 'cli') return false;
    const reason = String(detail.reason ?? '');
    if (source === 'user' && reason && reason !== 'camera' && reason !== 'camera-controls' && reason !== 'mode') {
      return false;
    }
    return true;
  }

  suppressTransientRestoreEvents(delayMs = 500) {
    if (this.restoreEventTimer != null) clearTimeout(this.restoreEventTimer);
    this.restoreEventSuppressed = true;
    this.restoreEventTimer = setTimeout(() => {
      this.restoreEventTimer = null;
      this.restoreEventSuppressed = false;
    }, Math.max(0, Number(delayMs) || 0));
    this.restoreEventTimer?.unref?.();
  }

  async ready() {
    await (this.readyPromise ?? Promise.resolve(null));
    return this.status();
  }

  recordCurrentState(detail = {}) {
    if (this.isChangeSuppressed(detail)) return [];
    const snapshot = this.captureOverrideSnapshot();
    if (!snapshot) return [];
    return this.recordSnapshotChange({
      ...detail,
      after: snapshot,
    });
  }

  recordSnapshotChange({
    before = null,
    after = null,
    source = 'user',
    reason = 'change',
    method = null,
    behavior = null,
    scope = null,
    scopes = null,
  } = {}) {
    if (this.isChangeSuppressed({ source, reason, method, behavior, scope, scopes }) || !after) return [];
    if (!this.baseline) this.captureBaseline(before ?? after);
    const previousOverrides = normalizeOverrideMap({ ...this.overrides });
    const currentMap = flattenVisualizationOverrides(after);
    const nextOverrides = normalizeOverrideMap(addCameraPoseEssentials(
      diffOverrideMaps(this.baselineMap, currentMap),
      currentMap,
    ));
    const changeScopes = scopesForSnapshotChange({ behavior, reason, method, scope, scopes });
    const changedPaths = new Set(
      [...Object.keys(previousOverrides), ...Object.keys(nextOverrides)]
        .filter((path) => pathMatchesAnyScope(path, changeScopes)),
    );
    const entries = [];
    for (const path of changedPaths) {
      const hadPreviousOverride = Object.prototype.hasOwnProperty.call(previousOverrides, path);
      const hasNextOverride = Object.prototype.hasOwnProperty.call(nextOverrides, path);
      const oldValue = hadPreviousOverride ? previousOverrides[path] : (this.baselineMap[path] ?? null);
      const nextValue = hasNextOverride ? nextOverrides[path] : (this.baselineMap[path] ?? null);
      if (valuesEqual(oldValue, nextValue)) continue;
      entries.push({
        seq: this.nextSeq,
        timestamp: this.now(),
        source,
        path,
        oldValue: cloneSerializable(oldValue),
        newValue: cloneSerializable(nextValue),
        method,
        reason,
        status: 'pending',
      });
      this.nextSeq += 1;
    }
    if (!entries.length) return [];
    const mergedOverrides = { ...previousOverrides };
    const entryPaths = new Set(entries.map((entry) => entry.path));
    for (const path of entryPaths) {
      delete mergedOverrides[path];
    }
    for (const path of entryPaths) {
      if (Object.prototype.hasOwnProperty.call(nextOverrides, path)) {
        mergedOverrides[path] = cloneSerializable(nextOverrides[path]);
      }
    }
    if (entries.some((entry) => pathMatchesScope(entry.path, 'camera'))) {
      for (const [path, value] of Object.entries(nextOverrides)) {
        if (isPathWithinPrefixes(path, CAMERA_POSE_ESSENTIAL_PREFIXES)) {
          mergedOverrides[path] = cloneSerializable(value);
        }
      }
    }
    this.overrides = normalizeOverrideMap(mergedOverrides);
    this.appendJournalEntries(entries);
    this.recomputeDirtyState();
    this.dispatchEvent(createDetailEvent('change', { entries, overrides: this.getOverrides() }));
    if (this.autosave && reason !== 'camera' && reason !== 'camera-controls') this.scheduleSave();
    return entries;
  }

  recomputeDirtyState() {
    const controls = {};
    const sections = {};
    const panels = {};
    for (const path of Object.keys(this.overrides)) {
      controls[path] = 'changed';
      const [panel, section] = path.split('.');
      if (panel) panels[panel] = panels[panel] === 'changed' ? 'changed' : 'partial';
      if (panel && section) sections[`${panel}.${section}`] = 'partial';
    }
    this.dirtyState = { controls, sections, panels };
    return this.dirtyState;
  }

  getOverrides() {
    return cloneSerializable(this.overrides);
  }

  getDirtyState() {
    return cloneSerializable(this.dirtyState);
  }

  getChangeJournal(options = {}) {
    const since = Number.isFinite(options.since) ? Number(options.since) : null;
    const source = typeof options.source === 'string' ? options.source : null;
    const afterCheckpoint = options.sinceCheckpoint === true ? this.checkpointSeq : null;
    let entries = this.journal;
    if (since != null) entries = entries.filter((entry) => entry.seq > since);
    if (afterCheckpoint != null) entries = entries.filter((entry) => entry.seq > afterCheckpoint);
    if (source) entries = entries.filter((entry) => entry.source === source);
    if (Number.isFinite(options.limit)) entries = entries.slice(-Math.max(0, Number(options.limit)));
    return cloneSerializable(entries);
  }

  checkpoint(seq = null) {
    const maxSeq = this.journal.reduce((max, entry) => Math.max(max, entry.seq), 0);
    this.checkpointSeq = Number.isFinite(seq) ? Math.max(0, Number(seq)) : maxSeq;
    if (this.autosave) this.scheduleSave(0);
    return { checkpointSeq: this.checkpointSeq };
  }

  async resetOverride(pathOrScope) {
    const target = String(pathOrScope ?? '').trim();
    if (!target) return { reset: false, overrides: this.getOverrides() };
    const before = this.helios?.serializeVisualizationState?.();
    const beforeOverrides = { ...this.overrides };
    const removedPaths = new Set();
    for (const path of Object.keys(this.overrides)) {
      if (path === target || path.startsWith(`${target}.`)) {
        delete this.overrides[path];
        removedPaths.add(path);
      }
    }
    const resetCameraPose = target === 'camera'
      || target.startsWith('camera.')
      || isPathWithinPrefixes(target, CAMERA_POSE_OVERRIDE_PREFIXES);
    if (resetCameraPose) {
      const hasCameraPoseOverride = Object.keys(this.overrides)
        .some((path) => isPathWithinPrefixes(path, CAMERA_POSE_OVERRIDE_PREFIXES));
      if (!hasCameraPoseOverride && this.overrides['cameraControls.autoFit'] === false) {
        delete this.overrides['cameraControls.autoFit'];
        removedPaths.add('cameraControls.autoFit');
      }
    }
    this.overrides = normalizeOverrideMap(this.overrides);
    if (target === 'networkPersistence' || target.startsWith('networkPersistence.')) {
      this.networkPersistence = normalizeNetworkPersistence({ enabled: true });
      this.networkData.enabled = true;
    }
    const resetEntries = [];
    for (const [path, value] of Object.entries(beforeOverrides)) {
      if (!removedPaths.has(path)) continue;
      resetEntries.push({
        seq: this.nextSeq,
        timestamp: this.now(),
        source: 'user',
        path,
        oldValue: cloneSerializable(value),
        newValue: cloneSerializable(this.baselineMap[path] ?? null),
        method: null,
        reason: 'reset-override',
        status: 'pending',
      });
      this.nextSeq += 1;
    }
    let appliedDirectly = false;
    if (resetEntries.length === 1) {
      appliedDirectly = this.applyPathValue(resetEntries[0].path, resetEntries[0].newValue);
    }
    if (!appliedDirectly) {
      const restored = applyOverridesToVisualizationState(this.baseline ?? before, this.overrides);
      this.suspended = true;
      try {
        await this.helios?.importVisualizationState?.(restored, {
          reason: 'override-reset',
          restoreLayoutRuntime: false,
        });
      } finally {
        this.suspended = false;
      }
    }
    if (resetEntries.length) this.appendJournalEntries(resetEntries);
    this.recomputeDirtyState();
    this.dispatchEvent(createDetailEvent('change', { entries: resetEntries, overrides: this.getOverrides() }));
    await this.saveManifest({ snapshotLayoutRuntime: false });
    return { reset: true, overrides: this.getOverrides(), dirtyState: this.getDirtyState() };
  }

  applyPathValue(path, value) {
    const segments = String(path ?? '').split('.').filter(Boolean);
    if (segments.length < 2) return false;
    const behaviorId = segments[0];
    if (behaviorId === 'ui') {
      const ui = this.helios?.behaviors?.ui ?? null;
      if (!ui || typeof ui.restoreState !== 'function') return false;
      const patch = {};
      setPatchPath(patch, segments.slice(1), value);
      this.suspended = true;
      try {
        ui.restoreState(patch, { reason: 'override-reset-path' });
      } finally {
        this.suspended = false;
      }
      return true;
    }
    if (behaviorId === 'camera' || behaviorId === 'networkPersistence') return false;
    if (behaviorId === 'behaviors' && segments.length >= 3 && segments[2] === 'state') {
      const behavior = this.helios?.behaviors?.get?.(segments[1]) ?? this.helios?.behavior?.[segments[1]] ?? null;
      if (!behavior) return false;
      this.suspended = true;
      try {
        if (typeof behavior.restore === 'function') behavior.restore(value);
        else if (typeof behavior.update === 'function') behavior.update(value);
        else return false;
      } finally {
        this.suspended = false;
      }
      return true;
    }
    const behavior = this.helios?.behaviors?.get?.(behaviorId) ?? this.helios?.behavior?.[behaviorId] ?? null;
    if (!behavior || typeof behavior.update !== 'function') return false;
    const patch = {};
    setPatchPath(patch, segments.slice(1), value);
    this.suspended = true;
    try {
      behavior.update(patch);
    } finally {
      this.suspended = false;
    }
    return true;
  }

  scheduleSave(delay = DEFAULT_AUTOSAVE_DELAY_MS, options = {}) {
    if (this.persistence?.scheduleAutosync) {
      return this.persistence.scheduleAutosync({
        includeSession: true,
        debounceMs: delay,
        reason: options.reason ?? 'session-autosave',
        source: options.source ?? 'session',
        snapshotLayoutRuntime: options.snapshotLayoutRuntime !== false,
        emitSyncEvents: options.emitSyncEvents !== false,
        deferForInteraction: options.deferForInteraction,
      });
    }
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const lightweightManifestOnly = options.snapshotLayoutRuntime === false;
      if (!lightweightManifestOnly && this.persistence?.shouldDeferSyncForInteraction?.(options) === true) {
        const remaining = Math.max(0, Number(this.persistence?.interactionIdleRemainingMs?.()) || 0);
        this.scheduleSave(remaining, options);
        return;
      }
      this.pendingSave = this.saveManifest({
        snapshotLayoutRuntime: options.snapshotLayoutRuntime === true,
        emitSyncEvents: options.emitSyncEvents !== false,
      });
    }, Math.max(0, Number(delay) || 0));
    return this.pendingSave;
  }

  commitLocalManifest(manifest) {
    const completeManifest = createCommittedManifest(manifest, this.now());
    if (!completeManifest || !this.local || !this.storage || !this.sessionId) return completeManifest;
    const localManifest = compactManifestForLocalStorage(completeManifest);
    const pendingManifest = {
      ...localManifest,
      complete: false,
      commit: {
        ...localManifest.commit,
        status: 'pending',
      },
    };
    const currentKey = this.manifestKey();
    const backupKey = this.manifestBackupKey();
    const pendingKey = this.manifestPendingKey();
    try {
      const previous = this.storage.getItem(currentKey);
      this.storage.setItem(pendingKey, JSON.stringify(pendingManifest));
      if (previous) {
        try {
          this.storage.setItem(backupKey, previous);
        } catch (_) {
          this.storage.removeItem?.(backupKey);
        }
      }
      this.storage.setItem(currentKey, JSON.stringify(localManifest));
      this.storage.removeItem(pendingKey);
    } catch (error) {
      this.storage.removeItem?.(pendingKey);
      this.storage.removeItem?.(backupKey);
      try {
        this.storage.setItem(currentKey, JSON.stringify({
          schema: localManifest.schema,
          version: localManifest.version,
          sessionId: localManifest.sessionId,
          nickname: localManifest.nickname,
          updatedAt: localManifest.updatedAt,
          complete: true,
          commit: localManifest.commit,
          storage: { manifestStoredExternally: true },
        }));
      } catch (fallbackError) {
        console.error('[HeliosPersistence] Failed to commit local session manifest fallback', fallbackError);
        this.storage.removeItem?.(currentKey);
      }
      console.error('[HeliosPersistence] Failed to commit local session manifest', error);
      this.dispatchEvent(createDetailEvent('sync', {
        ...this.status(),
        localManifestWarning: error?.message ?? String(error),
      }));
    }
    return completeManifest;
  }

  async commitManifest(manifest) {
    const completeManifest = createCommittedManifest(manifest, this.now());
    this.commitLocalManifest(completeManifest);
    if (completeManifest && this.sessionStore?.put && this.sessionId) {
      await this.sessionStore.put({
        id: this.manifestRecordKey(this.sessionId),
        kind: 'session-manifest',
        sessionId: this.sessionId,
        updatedAt: completeManifest.updatedAt,
        manifest: completeManifest,
      }).catch((error) => {
        this.sessionSaveError = error?.message ?? String(error);
      });
    }
    return completeManifest;
  }

  async saveManifest(options = {}) {
    if (!this.sessionId) return null;
    const emitSyncEvents = options.emitSyncEvents !== false;
    this.saveInProgress = true;
    this.sessionSaveError = null;
    if (emitSyncEvents) this.dispatchEvent(createDetailEvent('sync', this.status()));
    try {
      for (const entry of this.journal) {
        if (entry.status === 'pending') entry.status = 'saved';
      }
      if (options.snapshotLayoutRuntime !== false) {
        this.layoutRuntimeState = await (
          this.helios?.snapshotLayoutRuntimeStateAsync?.({ reason: 'session-manifest-save' })
            ?? this.helios?.snapshotLayoutRuntimeState?.()
            ?? null
        );
      }
      const manifest = this.toManifest();
      const committed = await this.commitManifest(manifest);
      if (this.remote?.enabled) {
        await this.syncRemoteManifest(committed).catch((error) => {
          this.networkData.remoteWarning = error?.message ?? String(error);
          console.error('[HeliosPersistence] Remote session manifest sync failed', error);
        });
      }
      this.sessionSavedAt = Number(committed?.commit?.completedAt) || Number(committed?.updatedAt) || this.now();
      return committed;
    } catch (error) {
      this.sessionSaveError = error?.message ?? String(error);
      throw error;
    } finally {
      this.saveInProgress = false;
      if (emitSyncEvents) this.dispatchEvent(createDetailEvent('sync', this.status()));
    }
  }

  toManifest() {
    return {
      schema: 'helios-web.session-manifest',
      version: 1,
      sessionId: this.sessionId,
      nickname: this.nickname,
      updatedAt: this.now(),
      overrides: this.getOverrides(),
      dirtyState: this.getDirtyState(),
      journal: this.getChangeJournal({}),
      checkpointSeq: this.checkpointSeq,
      networkPersistence: cloneSerializable(this.networkPersistence),
      networkData: cloneSerializable(this.networkData),
      layoutRuntimeState: cloneSerializable(this.layoutRuntimeState),
    };
  }

  loadManifest(id = this.sessionId) {
    if (!this.storage || !id) return null;
    return parseStoredManifest(this.storage.getItem(this.manifestKey(id)))
      ?? parseStoredManifest(this.storage.getItem(this.manifestBackupKey(id)));
  }

  async loadManifestAsync(id = this.sessionId) {
    if (this.sessionStore?.get && id) {
      const stored = await this.sessionStore.get(this.manifestRecordKey(id)).catch(() => null);
      if (stored?.manifest) return stored.manifest;
    }
    return this.loadManifest(id);
  }

  async deleteStoredManifest(id = this.sessionId) {
    if (!id) return false;
    if (this.sessionStore?.delete) {
      await this.sessionStore.delete(this.manifestRecordKey(id)).catch(() => false);
    }
    if (this.storage) {
      this.storage.removeItem?.(this.manifestKey(id));
      this.storage.removeItem?.(this.manifestBackupKey(id));
      this.storage.removeItem?.(this.manifestPendingKey(id));
    }
    return true;
  }

  async fetchRemoteManifest(id = this.sessionId) {
    if (!this.remote?.enabled || !id) return null;
    const headers = { ...(this.remote.headers ?? {}) };
    if (this.remote.key) headers.Authorization = `Bearer ${this.remote.key}`;
    const response = await fetch(`${this.remote.url}/sessions/${encodeURIComponent(id)}/manifest`, { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Remote manifest restore failed (${response.status})`);
    return response.json();
  }

  async restore(id = this.sessionId, options = {}) {
    this.restoring = true;
    this.dispatchEvent(createDetailEvent('sync', this.status()));
    try {
      return await this._restore(id, options);
    } finally {
      this.restoring = false;
      this.dispatchEvent(createDetailEvent('sync', this.status()));
    }
  }

  async _restore(id = this.sessionId, options = {}) {
    let manifest = await this.loadManifestAsync(id);
    if (!manifest && this.remote?.enabled) {
      manifest = await this.fetchRemoteManifest(id).catch((error) => {
        this.networkData.remoteWarning = error?.message ?? String(error);
        console.error('[HeliosPersistence] Remote session manifest restore failed', error);
        return null;
      });
    }
    if (!manifest && options.applyNetwork === true && this.persistence?.getSession && this.persistence?.restoreSession) {
      const stored = await this.persistence.getSession(id).catch((error) => {
        this.sessionSaveError = error?.message ?? String(error);
        console.error('[HeliosPersistence] Stored session lookup failed during restore', error);
        return null;
      });
      if (stored?.payload?.session?.id) {
        this.suspended = true;
        try {
          await this.persistence.restoreSession(stored, { ...options, restoreOverrides: false });
        } finally {
          this.suspended = false;
        }
        const payload = stored.payload;
        this.sessionId = payload.session.id;
        this.nickname = typeof payload.session.nickname === 'string' && payload.session.nickname.trim()
          ? payload.session.nickname.trim()
          : this.nickname;
        this.sessionSavedAt = Number(payload.session.updatedAt) || this.sessionSavedAt || this.now();
        this.sessionSaveError = null;
        this.explicitSessionInvalid = false;
        ensureSessionIdInUrl(this.sessionId, {
          ...this.urlRouting,
          replaceExisting: options.replaceUrlSession !== false,
        });
        this.networkData = {
          ...(this.networkData ?? {}),
          enabled: true,
          status: 'saved',
          dirty: false,
          savedAt: this.sessionSavedAt,
        };
        this.initialPersistenceReady = true;
        this.dispatchEvent(createDetailEvent('change', { entries: [], overrides: this.getOverrides() }));
        return this.status();
      }
    }
    if (!manifest) {
      if (this.explicitSessionRequested && (!id || String(id) === String(this.requestedSessionId ?? this.sessionId ?? ''))) {
        this.explicitSessionInvalid = true;
      }
      this.initialPersistenceReady = true;
      return null;
    }
    this.explicitSessionInvalid = false;
    this.sessionId = manifest.sessionId ?? id;
    this.nickname = typeof manifest.nickname === 'string' && manifest.nickname.trim() ? manifest.nickname.trim() : this.nickname;
    this.sessionSavedAt = Number(manifest?.commit?.completedAt) || Number(manifest?.updatedAt) || this.sessionSavedAt;
    this.sessionSaveError = null;
    ensureSessionIdInUrl(this.sessionId, {
      ...this.urlRouting,
      replaceExisting: options.replaceUrlSession !== false,
    });
    const manifestOverrides = manifest.overrides && typeof manifest.overrides === 'object' ? cloneSerializable(manifest.overrides) : {};
    const manifestOverrideCount = Object.keys(manifestOverrides).length;
    this.overrides = normalizeOverrideMap(manifestOverrides);
    this.persistence?.hydrateSessionOverrides?.(this.overrides, { group: 'overrides', reason: 'session-restore' });
    this.journal = Array.isArray(manifest.journal) ? cloneSerializable(manifest.journal) : [];
    this.trimJournal();
    this.checkpointSeq = Number.isFinite(manifest.checkpointSeq) ? Number(manifest.checkpointSeq) : 0;
    this.nextSeq = this.journal.reduce((max, entry) => Math.max(max, entry.seq ?? 0), 0) + 1;
    this.networkData = manifest.networkData && typeof manifest.networkData === 'object'
      ? cloneSerializable(manifest.networkData)
      : this.networkData;
    this.layoutRuntimeState = manifest.layoutRuntimeState && typeof manifest.layoutRuntimeState === 'object'
      ? cloneSerializable(manifest.layoutRuntimeState)
      : null;
    if (options.applyNetwork === true && this.sessionStore?.get && this.persistence?.restoreSession) {
      const stored = await this.sessionStore.get(this.sessionId);
      if (stored?.payload?.networkData?.data) {
        this.suspended = true;
        try {
          await this.persistence.restoreSession(stored, { ...options, restoreOverrides: false });
        } finally {
          this.suspended = false;
        }
      } else if (this.networkPersistence.enabled && this.networkData?.status !== 'skipped') {
        this.networkData = {
          ...this.networkData,
          enabled: true,
          dirty: true,
          status: 'dirty',
          reason: 'missing-session-network-data',
          updatedAt: this.now(),
          savedAt: null,
        };
      }
    }
    const base = this.captureOverrideSnapshot();
    if (base) {
      this.captureBaseline(base);
      const restored = applyOverridesToVisualizationState(base, this.overrides);
      this.suspended = true;
      try {
        await this.helios?.importVisualizationState?.(restored, {
          reason: 'session-overrides-restore',
          hydratePersistence: false,
          refreshPersistence: false,
        });
        if (this.layoutRuntimeState) {
          await this.helios?.restoreLayoutRuntimeState?.(this.layoutRuntimeState, {
            reason: 'session-layout-runtime-restore',
            restoreRunState: options.restoreLayoutRunState === true,
          });
        }
      } finally {
        this.suppressTransientRestoreEvents();
        this.suspended = false;
      }
    } else if (this.layoutRuntimeState) {
      await this.helios?.restoreLayoutRuntimeState?.(this.layoutRuntimeState, {
        reason: 'session-layout-runtime-restore',
        restoreRunState: options.restoreLayoutRunState === true,
      });
    }
    if (manifestOverrideCount === 0 && options.applyNetwork === true) {
      this.overrides = {};
      this.dirtyState = { controls: {}, sections: {}, panels: {} };
      this.journal = [];
      this.checkpointSeq = 0;
      this.nextSeq = 1;
      this.persistence?.hydrateSessionOverrides?.({}, { group: 'overrides', reason: 'session-clean-restore' });
      const cleanBaseline = this.captureOverrideSnapshot();
      if (cleanBaseline) this.captureBaseline(cleanBaseline);
    }
    this.recomputeDirtyState();
    this.dispatchEvent(createDetailEvent('change', { entries: [], overrides: this.getOverrides() }));
    this.initialPersistenceReady = true;
    return this.status();
  }

  markNetworkDirty(reason = 'network') {
    this.networkData = {
      ...this.networkData,
      enabled: this.networkPersistence.enabled,
      dirty: true,
      reason,
      status: 'dirty',
      updatedAt: this.now(),
    };
    this.dispatchEvent(createDetailEvent('change', { entries: [], overrides: this.getOverrides(), reason }));
    if (this.autosave) this.scheduleSave();
  }

  async resolveNetworkLimit() {
    if (Number.isFinite(this.networkPersistence.maxBytes)) return this.networkPersistence.maxBytes;
    try {
      const estimate = await globalThis.navigator?.storage?.estimate?.();
      if (Number.isFinite(estimate?.quota)) {
        return Math.min(MAX_NETWORK_LIMIT_BYTES, Math.floor(estimate.quota * 0.2));
      }
    } catch (_) {
      // Ignore quota probing failures.
    }
    return DEFAULT_NETWORK_LIMIT_BYTES;
  }

  async persistNetworkNow(options = {}) {
    if (!this.networkPersistence.enabled && options.force !== true) {
      this.networkData = { ...this.networkData, enabled: false, status: 'disabled' };
      await this.saveManifest();
      return this.networkData;
    }
    if (!this.helios?.savePortableNetwork) {
      this.networkData = { ...this.networkData, status: 'skipped', skipped: { reason: 'unsupported' } };
      await this.saveManifest();
      return this.networkData;
    }
    const format = options.format ?? this.networkPersistence.format ?? 'zxnet';
    const data = await this.helios.savePortableNetwork(format, {
      includeVisualization: this.networkPersistence.includeVisualization === true,
      includeCurrentPositions: true,
      output: 'uint8array',
    });
    const bytes = estimateByteLength(data);
    const maxBytes = await this.resolveNetworkLimit();
    if (bytes > maxBytes) {
      this.networkData = {
        enabled: true,
        status: 'skipped',
        skipped: { reason: 'size-limit', bytes, maxBytes },
        dirty: true,
        updatedAt: this.now(),
      };
      await this.saveManifest();
      return this.networkData;
    }
    if (this.persistence?.saveSession) {
      await this.persistence.saveSession({
        id: this.sessionId,
        nickname: this.nickname,
        networkFormat: format,
        networkData: data,
        unfinished: true,
        status: 'active',
        visualizationState: await (this.helios.serializeVisualizationStateAsync?.()
          ?? this.helios.serializeVisualizationState?.()),
        retention: options.retention,
      });
    }
    if (this.remote?.enabled) {
      const blobId = options.blobId ?? `network-${format}`;
      await this.syncRemoteBlob(blobId, data).catch((error) => {
        this.networkData.remoteWarning = error?.message ?? String(error);
        console.error('[HeliosPersistence] Remote network blob sync failed', error);
      });
    }
    const remoteWarning = this.networkData.remoteWarning;
    this.networkData = {
      enabled: true,
      status: 'saved',
      format,
      blobId: options.blobId ?? `network-${format}`,
      bytes,
      maxBytes,
      dirty: false,
      savedAt: this.now(),
    };
    if (remoteWarning) this.networkData.remoteWarning = remoteWarning;
    await this.saveManifest();
    return this.networkData;
  }

  async flush(options = {}) {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (options.includeNetwork === true) {
      await this.persistNetworkNow({
        ...(options.network ?? {}),
        retention: options.retention,
      });
    }
    return this.saveManifest({
      snapshotLayoutRuntime: options.snapshotLayoutRuntime !== false,
    });
  }

  async syncRemoteManifest(manifest) {
    if (!this.remote?.enabled) return null;
    const headers = { ...(this.remote.headers ?? {}), 'Content-Type': 'application/json' };
    if (this.remote.key) headers.Authorization = `Bearer ${this.remote.key}`;
    const response = await fetch(`${this.remote.url}/sessions/${encodeURIComponent(this.sessionId)}/manifest`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(manifest),
    });
    if (!response.ok) throw new Error(`Remote manifest save failed (${response.status})`);
    if (this.journal.length) {
      await fetch(`${this.remote.url}/sessions/${encodeURIComponent(this.sessionId)}/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ events: this.journal }),
      });
    }
    return true;
  }

  async syncRemoteBlob(blobId, data) {
    if (!this.remote?.enabled) return null;
    const headers = { ...(this.remote.headers ?? {}) };
    if (this.remote.key) headers.Authorization = `Bearer ${this.remote.key}`;
    const response = await fetch(`${this.remote.url}/sessions/${encodeURIComponent(this.sessionId)}/blobs/${encodeURIComponent(blobId)}`, {
      method: 'PUT',
      headers,
      body: data,
    });
    if (!response.ok) throw new Error(`Remote blob save failed (${response.status})`);
    return true;
  }

  status() {
    return {
      sessionId: this.sessionId,
      nickname: this.nickname,
      autosave: this.autosave,
      local: this.local,
      remote: this.remote ? { enabled: this.remote.enabled, url: this.remote.url, hasKey: Boolean(this.remote.key) } : null,
      overrideCount: Object.keys(this.overrides).length,
      journalCount: this.journal.length,
      maxJournalEntries: this.maxJournalEntries,
      checkpointSeq: this.checkpointSeq,
      dirtyState: this.getDirtyState(),
      networkData: cloneSerializable(this.networkData),
      layoutRuntimeState: cloneSerializable(this.layoutRuntimeState),
      pendingSave: Boolean(this.saveTimer || this.saveInProgress),
      restoring: this.restoring === true,
      explicitSessionRequested: this.explicitSessionRequested === true,
      explicitSessionInvalid: this.explicitSessionInvalid === true,
      requestedSessionId: this.requestedSessionId,
      sessionSavedAt: this.sessionSavedAt,
      sessionSync: {
        status: this.saveInProgress ? 'syncing' : (this.sessionSaveError ? 'error' : (this.sessionSavedAt ? 'saved' : 'idle')),
        savedAt: this.sessionSavedAt,
        error: this.sessionSaveError,
        pending: Boolean(this.saveTimer || this.saveInProgress),
      },
    };
  }
}

export default HeliosSessionController;
