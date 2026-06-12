import {
  IndexedDBSessionStore,
  createMemoryStorage,
} from '../persistence/storage.js';
import {
  PERSISTENCE_KINDS,
  createDefaultPreferencesState,
  createPersistenceEnvelope,
  migratePersistenceEnvelope,
} from '../persistence/schema.js';
import {
  HeliosStateManager,
} from '../state/index.js';

function createDetailEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
  if (typeof Event === 'function') {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

function cloneSerializable(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_) {
      // Fall through to JSON clone for plain serializable values.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

function estimateStoredByteLength(value) {
  if (value == null) return 0;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (typeof value === 'string') return value.length * 2;
  try {
    return JSON.stringify(value).length * 2;
  } catch (_) {
    return 0;
  }
}

function uint8ArrayToBase64(value) {
  if (!(value instanceof Uint8Array) || value.length <= 0) return '';
  if (typeof Buffer !== 'undefined') return Buffer.from(value).toString('base64');
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    const chunk = value.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8Array(value) {
  if (typeof value !== 'string' || value.length <= 0) return null;
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeFloat32PositionPayload(encoded = {}) {
  if (encoded?.encoding !== 'float32-base64' || typeof encoded.data !== 'string') return null;
  const bytes = base64ToUint8Array(encoded.data);
  if (!bytes || bytes.byteLength <= 0 || bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) return null;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const values = new Float32Array(copy.buffer);
  if (encoded.length != null && values.length !== Number(encoded.length)) return null;
  return values;
}

function encodeFloat32PositionPayload(values) {
  if (!(values instanceof Float32Array) || values.length <= 0) return null;
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  return {
    encoding: 'float32-base64',
    length: values.length,
    byteLength: values.byteLength,
    data: uint8ArrayToBase64(bytes),
  };
}

async function compressPositionBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0) return null;
  const raw = new Uint8Array(bytes.byteLength);
  raw.set(bytes);
  if (typeof CompressionStream !== 'function' || typeof Response !== 'function' || typeof Blob !== 'function') {
    return { data: raw, compression: 'none' };
  }
  try {
    const compressed = new Uint8Array(await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')),
    ).arrayBuffer());
    if (compressed.byteLength > 0 && compressed.byteLength < raw.byteLength) {
      return { data: compressed, compression: 'gzip' };
    }
  } catch (error) {
    console.warn('Helios: failed to gzip session position payload; storing raw position bytes.', error);
  }
  return { data: raw, compression: 'none' };
}

async function decompressPositionBytes(data, compression = 'none') {
  if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data)) return null;
  const bytes = data instanceof Uint8Array
    ? data
    : (data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  if (compression === 'none' || compression == null || compression === '') {
    const raw = new Uint8Array(bytes.byteLength);
    raw.set(bytes);
    return raw;
  }
  if (compression !== 'gzip') throw new Error(`Unsupported Helios position payload compression: ${compression}`);
  if (typeof DecompressionStream !== 'function' || typeof Response !== 'function' || typeof Blob !== 'function') {
    throw new Error('Cannot restore gzip-compressed Helios positions because DecompressionStream is unavailable.');
  }
  return new Uint8Array(await new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer());
}

function normalizeSessionNickname(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function envelopeSessionId(envelope) {
  return envelope?.payload?.session?.id ?? envelope?.id ?? null;
}

function envelopeUpdatedAt(envelope) {
  const value = envelope?.payload?.session?.updatedAt ?? envelope?.updatedAt ?? null;
  return Number.isFinite(value) ? Number(value) : null;
}

function sessionSummaryFromEnvelope(envelope, options = {}) {
  const entry = migratePersistenceEnvelope(envelope, PERSISTENCE_KINDS.session);
  const session = entry?.payload?.session ?? {};
  const networkSource = entry?.payload?.networkSource ?? {};
  const id = session.id ?? entry.id ?? null;
  const nickname = normalizeSessionNickname(session.nickname);
  const byteStats = sessionStoredByteStats(entry);
  return {
    id,
    workspaceId: session.workspaceId ?? null,
    nickname,
    label: nickname ?? networkSource.name ?? networkSource.baseName ?? id ?? 'session',
    createdAt: Number.isFinite(session.createdAt) ? Number(session.createdAt) : null,
    updatedAt: Number.isFinite(session.updatedAt) ? Number(session.updatedAt) : null,
    unfinished: session.unfinished !== false,
    status: session.status ?? 'active',
    bytes: byteStats.bytes,
    manifestBytes: byteStats.manifestBytes,
    networkBytes: byteStats.networkBytes,
    positionBytes: byteStats.positionBytes,
    current: options.currentSessionId != null && id != null && String(options.currentSessionId) === String(id),
    networkSource: cloneSerializable(networkSource),
    thumbnail: entry?.payload?.thumbnail ? cloneSerializable(entry.payload.thumbnail) : null,
  };
}

function payloadDataByteLength(data) {
  if (data == null) return 0;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (Array.isArray(data) && data.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return data.length;
  }
  return estimateStoredByteLength(data);
}

function finiteStoredByteLength(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return 0;
}

function sessionStoredByteStats(envelope = {}) {
  const entry = cloneSerializable(envelope);
  entry.payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : {};
  const networkData = entry.payload.networkData && typeof entry.payload.networkData === 'object'
    ? entry.payload.networkData
    : null;
  const positionData = entry.payload.positionData && typeof entry.payload.positionData === 'object'
    ? entry.payload.positionData
    : null;
  const networkBytes = networkData
    ? finiteStoredByteLength(networkData.byteLength, payloadDataByteLength(networkData.data))
    : 0;
  const positionBytes = positionData
    ? finiteStoredByteLength(positionData.storedByteLength, payloadDataByteLength(positionData.data), positionData.byteLength)
    : 0;
  if (networkData) networkData.data = null;
  if (positionData) positionData.data = null;
  const manifestBytes = estimateStoredByteLength(entry);
  return {
    manifestBytes,
    networkBytes,
    positionBytes,
    bytes: manifestBytes + networkBytes + positionBytes,
  };
}

function normalizeKey(key) {
  return String(key ?? '').trim().replace(/^\.+|\.+$/g, '');
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
    url.searchParams.set(param, id);
    const mode = routing.replace === false ? 'pushState' : 'replaceState';
    history[mode]?.call(history, history.state, '', url);
  } catch (_) {
    // URL routing is best-effort in browser hosts.
  }
}

const DEFAULT_UI_PERSISTENCE_FORWARD_DEBOUNCE_MS = 180;
const DEFAULT_SESSION_THUMBNAIL_MAX_WIDTH = 320;
const DEFAULT_SESSION_THUMBNAIL_MAX_HEIGHT = 180;
const DEFAULT_SESSION_THUMBNAIL_MAX_BYTES = 256 * 1024;
const DEFAULT_SESSION_THUMBNAIL_AUTOSAVE_MIN_INTERVAL_MS = 30000;
const DEFAULT_AUTOSYNC_INTERACTION_IDLE_MS = 1000;
const DEFAULT_POSITION_AUTOSAVE_DEBOUNCE_MS = 2000;
const DEFAULT_AUTOSYNC_POSITION_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MANUAL_POSITION_MAX_BYTES = Number.MAX_SAFE_INTEGER;
const SESSION_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_SESSION_ID_LENGTH = 10;

function createRandomSessionId(length = DEFAULT_SESSION_ID_LENGTH) {
  const size = Math.max(6, Math.min(32, Math.floor(Number(length) || DEFAULT_SESSION_ID_LENGTH)));
  const bytes = new Uint8Array(size);
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < size; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  let id = '';
  for (let i = 0; i < bytes.length; i += 1) {
    id += SESSION_ID_ALPHABET[bytes[i] % SESSION_ID_ALPHABET.length];
  }
  return id;
}

function isExplicitOverrideSource(source) {
  const value = String(source ?? '').trim();
  return value === 'program' || value === 'cli' || value === 'restore';
}

function isLegacyImplicitAppearanceOverrideSource(source) {
  const value = String(source ?? '').trim();
  return value === '' || value === 'binding' || value === 'refresh' || value === 'config';
}

function isAppearanceOverrideKey(key) {
  const value = String(key ?? '').trim();
  return value === 'behaviors.appearance'
    || value.startsWith('behaviors.appearance.')
    || value === 'appearance'
    || value.startsWith('appearance.');
}

function sanitizeLegacyImplicitAppearanceOverrides(overrides = {}, journal = [], resolveKey = null, entryForKey = null) {
  const canonical = (key) => (typeof resolveKey === 'function' ? (resolveKey(key) || normalizeKey(key)) : normalizeKey(key));
  const next = cloneSerializable(overrides ?? {});
  const appearanceKeys = Object.keys(next).filter((key) => isAppearanceOverrideKey(canonical(key)));
  const pruneDefaultAppearanceClusterValues = () => {
    if (appearanceKeys.length < 4 || typeof entryForKey !== 'function') return;
    for (const key of appearanceKeys) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
      const entry = entryForKey(canonical(key));
      if (!entry?.equals) continue;
      if (entry.equals(next[key], entry.default)) delete next[key];
    }
  };
  if (!journal || !Array.isArray(journal) || journal.length === 0) {
    pruneDefaultAppearanceClusterValues();
    return next;
  }
  const lastEventByKey = new Map();
  for (const event of journal) {
    const key = canonical(event?.key ?? event?.path ?? event?.requestedKey ?? '');
    if (!key || !isAppearanceOverrideKey(key)) continue;
    lastEventByKey.set(key, event);
  }
  for (const key of Object.keys(next)) {
    const target = canonical(key);
    if (!isAppearanceOverrideKey(target)) continue;
    const event = lastEventByKey.get(target);
    if (!event) continue;
    if (event.trackOverride === true) continue;
    if (!isLegacyImplicitAppearanceOverrideSource(event.source)) continue;
    delete next[key];
  }
  pruneDefaultAppearanceClusterValues();
  return next;
}

function mergeDeepObject(base = {}, patch = {}) {
  const output = { ...(base && typeof base === 'object' ? base : {}) };
  for (const [key, value] of Object.entries(patch && typeof patch === 'object' ? patch : {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = mergeDeepObject(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function normalizeSessionThumbnailOptions(value = {}) {
  if (value === false) return { enabled: false };
  const source = value && typeof value === 'object' ? value : {};
  const rawAutosaveMinIntervalMs = source.autosaveMinIntervalMs
    ?? source.minAutosaveIntervalMs
    ?? source.autosave?.minIntervalMs;
  const autosaveEnabled = source.autosaveEnabled !== false
    && source.autosave !== false
    && rawAutosaveMinIntervalMs !== false;
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
    autosaveEnabled,
    autosaveMinIntervalMs: rawAutosaveMinIntervalMs === false
      ? DEFAULT_SESSION_THUMBNAIL_AUTOSAVE_MIN_INTERVAL_MS
      : normalizeNonNegativeMs(rawAutosaveMinIntervalMs, DEFAULT_SESSION_THUMBNAIL_AUTOSAVE_MIN_INTERVAL_MS),
    includeLabels: source.includeLabels === true,
    includeLegends: source.includeLegends === true,
    includeInterface: source.includeInterface === true,
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

function normalizeNonNegativeMs(value, fallback = 0) {
  if (value === false) return 0;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function normalizePositiveByteLimit(value, fallback = 0) {
  if (value === false || value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function normalizeAutosyncPayloadLimits(value = {}) {
  if (value === false) return { enabled: false };
  const source = value && typeof value === 'object' ? value : {};
  const positionMaxBytes = normalizePositiveByteLimit(
    source.positionMaxBytes
      ?? source.maxPositionBytes
      ?? source.positions?.maxBytes
      ?? source.positions?.maxPositionBytes,
    DEFAULT_AUTOSYNC_POSITION_MAX_BYTES,
  );
  const defaultNodeLimit = positionMaxBytes > 0
    ? Math.max(1, Math.floor(positionMaxBytes / (3 * Float32Array.BYTES_PER_ELEMENT)))
    : 0;
  return {
    enabled: source.enabled !== false,
    positionMaxBytes,
    networkMaxNodes: normalizePositiveByteLimit(
      source.networkMaxNodes
        ?? source.maxNetworkNodes
        ?? source.network?.maxNodes,
      defaultNodeLimit,
    ),
  };
}

function isUserInteractionDetail(detail = {}) {
  const source = String(detail.source ?? '').toLowerCase();
  const origin = String(detail.origin ?? detail.change?.origin ?? '').toLowerCase();
  const action = String(detail.action ?? detail.change?.action ?? '').toLowerCase();
  const reason = String(detail.reason ?? '').toLowerCase();
  return origin === 'interaction'
    || source === 'interaction'
    || reason.includes('interaction')
    || ['pan', 'zoom', 'dolly', 'rotate', 'wheel', 'pointer', 'touch', 'gesture'].some((token) => action.includes(token));
}

function mergeCaptureThumbnailMode(previous, next) {
  if (previous === true || next === true) return true;
  if (previous === 'auto' || next === 'auto') return 'auto';
  return next === false || previous === false ? false : undefined;
}

export class SessionStore {
  constructor(options = {}) {
    this.store = options.store ?? null;
    this.storage = options.storage ?? null;
    this.prefix = options.prefix ?? 'helios-web:storage-session:';
    this.indexKey = options.indexKey ?? `${this.prefix}index`;
    this.unfinishedSessionKey = options.unfinishedSessionKey ?? `${this.prefix}unfinished-session`;
  }

  key(id) {
    return `${this.prefix}${encodeURIComponent(String(id))}`;
  }

  networkDataRecordId(id) {
    return `${String(id)}::network-data`;
  }

  positionDataRecordId(id) {
    return `${String(id)}::position-data`;
  }

  unfinishedSessionKeyFor(workspaceId = null) {
    if (workspaceId == null || workspaceId === '') return this.unfinishedSessionKey;
    return `${this.unfinishedSessionKey}:${encodeURIComponent(String(workspaceId))}`;
  }

  _readIndex() {
    if (!this.storage?.getItem) return [];
    try {
      const parsed = JSON.parse(this.storage.getItem(this.indexKey) || '[]');
      return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  _writeIndex(ids = []) {
    if (!this.storage?.setItem) return;
    const unique = Array.from(new Set(ids.map((id) => String(id)).filter(Boolean)));
    this.storage.setItem(this.indexKey, JSON.stringify(unique));
  }

  _addToIndex(id) {
    if (!id) return;
    const ids = this._readIndex();
    if (!ids.includes(String(id))) this._writeIndex([...ids, String(id)]);
  }

  _removeFromIndex(id) {
    if (!id) return;
    const target = String(id);
    this._writeIndex(this._readIndex().filter((entry) => entry !== target));
  }

  _splitSessionPayloadData(record) {
    const id = record?.id ?? envelopeSessionId(record);
    if (!id) return { record, networkRecord: null, positionRecord: null };
    let nextRecord = record;
    let networkRecord = null;
    let positionRecord = null;
    const data = record?.payload?.networkData?.data;
    if (data != null) {
      const networkRecordId = this.networkDataRecordId(id);
      const networkData = record.payload.networkData ?? {};
      networkRecord = {
        id: networkRecordId,
        kind: 'session-network-data',
        sessionId: String(id),
        format: networkData.format ?? null,
        data,
        byteLength: estimateStoredByteLength(data),
        updatedAt: Date.now(),
      };
      nextRecord = {
        ...nextRecord,
        payload: {
          ...(nextRecord.payload ?? {}),
          networkData: {
            ...networkData,
            data: null,
            dataRef: networkRecordId,
            byteLength: networkRecord.byteLength,
          },
        },
      };
    }
    const positionData = nextRecord?.payload?.positionData ?? null;
    if (positionData?.data != null) {
      const positionRecordId = this.positionDataRecordId(id);
      positionRecord = {
        id: positionRecordId,
        kind: 'session-position-data',
        sessionId: String(id),
        schema: positionData.schema ?? 'helios-web.session-position-data',
        version: positionData.version ?? 1,
        data: positionData.data,
        byteLength: estimateStoredByteLength(positionData.data),
        updatedAt: Date.now(),
      };
      nextRecord = {
        ...nextRecord,
        payload: {
          ...(nextRecord.payload ?? {}),
          positionData: {
            ...positionData,
            data: null,
            dataRef: positionRecordId,
            storedByteLength: positionRecord.byteLength,
          },
        },
      };
    }
    return {
      record: nextRecord,
      networkRecord,
      positionRecord,
    };
  }

  async _putRaw(record, options = {}) {
    if (this.store?.put) return this.store.put(record);
    if (this.storage?.setItem) {
      this.storage.setItem(this.key(record.id), JSON.stringify(record));
      if (options.index !== false) this._addToIndex(record.id);
      return record;
    }
    return record;
  }

  async put(record) {
    const split = this._splitSessionPayloadData(record);
    if (split.networkRecord) await this._putRaw(split.networkRecord, { index: false });
    if (split.positionRecord) await this._putRaw(split.positionRecord, { index: false });
    return this._putRaw(split.record, { index: true });
  }

  async _getRaw(id) {
    if (!id) return null;
    if (this.store?.get) return this.store.get(id);
    if (this.storage?.getItem) {
      const raw = this.storage.getItem(this.key(id));
      return raw ? JSON.parse(raw) : null;
    }
    return null;
  }

  async get(id, options = {}) {
    const record = await this._getRaw(id);
    if (!record || options.hydrateNetworkData === false) return record;
    let hydrated = record;
    const networkData = hydrated?.payload?.networkData ?? null;
    const dataRef = networkData?.dataRef ?? null;
    if (dataRef && networkData.data == null) {
      const networkRecord = await this._getRaw(dataRef);
      if (networkRecord?.data != null) {
        hydrated = {
          ...hydrated,
          payload: {
            ...(hydrated.payload ?? {}),
            networkData: {
              ...networkData,
              format: networkData.format ?? networkRecord.format ?? null,
              data: networkRecord.data,
              byteLength: networkData.byteLength ?? networkRecord.byteLength ?? estimateStoredByteLength(networkRecord.data),
            },
          },
        };
      }
    }
    if (options.hydratePositionData === false) return hydrated;
    const positionData = hydrated?.payload?.positionData ?? null;
    const positionDataRef = positionData?.dataRef ?? null;
    if (positionDataRef && positionData.data == null) {
      const positionRecord = await this._getRaw(positionDataRef);
      if (positionRecord?.data != null) {
        hydrated = {
          ...hydrated,
          payload: {
            ...(hydrated.payload ?? {}),
            positionData: {
              ...positionData,
              data: positionRecord.data,
              storedByteLength: positionData.storedByteLength ?? positionRecord.byteLength ?? estimateStoredByteLength(positionRecord.data),
            },
          },
        };
      }
    }
    return hydrated;
  }

  async getAll() {
    if (this.store?.getAll) return this.store.getAll();
    const indexedIds = this._readIndex();
    if (indexedIds.length && this.storage?.getItem) {
      const records = [];
      for (const id of indexedIds) {
        const raw = this.storage.getItem(this.key(id));
        if (raw) records.push(JSON.parse(raw));
      }
      return records;
    }
    if (!this.storage?.getItem || !Number.isFinite(this.storage.length)) return [];
    const records = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key?.(i);
      if (!key || !key.startsWith(this.prefix)) continue;
      const raw = this.storage.getItem(key);
      if (raw) records.push(JSON.parse(raw));
    }
    return records;
  }

  async delete(id) {
    if (this.store?.delete) {
      await this.store.delete(this.networkDataRecordId(id));
      await this.store.delete(this.positionDataRecordId(id));
      return this.store.delete(id);
    }
    this.storage?.removeItem?.(this.key(id));
    this.storage?.removeItem?.(this.key(this.networkDataRecordId(id)));
    this.storage?.removeItem?.(this.key(this.positionDataRecordId(id)));
    this._removeFromIndex(id);
    return true;
  }

  async getUnfinishedSessionId(workspaceId = null) {
    if (this.store?.getUnfinishedSessionId) return this.store.getUnfinishedSessionId(workspaceId);
    if (!this.storage?.getItem) return null;
    return this.storage.getItem(this.unfinishedSessionKeyFor(workspaceId));
  }

  async setUnfinishedSessionId(id, workspaceId = null) {
    if (this.store?.setUnfinishedSessionId) return this.store.setUnfinishedSessionId(id, workspaceId);
    if (!this.storage) return id ?? null;
    const key = this.unfinishedSessionKeyFor(workspaceId);
    if (id == null || id === '') this.storage.removeItem?.(key);
    else this.storage.setItem?.(key, String(id));
    return id ?? null;
  }
}

export class HeliosStorageManager extends EventTarget {
  constructor(options = {}) {
    super();
    this.helios = options.helios ?? null;
    this.type = options.type ?? 'custom';
    this.workspaceId = options.workspaceId ?? 'default';
    this.sessionId = options.sessionId ? String(options.sessionId) : null;
    this.requestedSessionId = this.sessionId;
    this.explicitSessionInvalid = false;
    this.persistNetwork = options.persistNetwork === true;
    this.urlRouting = { enabled: false };
    this.sessionSavedAt = null;
    this.sessionSaveError = null;
    this.networkData = { enabled: this.persistNetwork, status: 'idle', dirty: false, positionsDirty: false, savedAt: null, dirtyAt: null };
    this.capabilities = {
      persistent: options.persistent === true,
      sessions: options.sessions === true,
      network: options.network === true,
      remote: options.remote === true,
    };
    this.overrideTrackingReady = options.overrideTrackingReady !== false;
    this.states = options.states ?? options.registry ?? new HeliosStateManager(options);
    this.states?.setOverrideTrackingReady?.(this.overrideTrackingReady);
    this.sessionStore = options.sessionStore ?? null;
    this.idFactory = options.idFactory ?? createRandomSessionId;
    this._now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.sessionThumbnail = normalizeSessionThumbnailOptions(options.sessionThumbnail ?? options.session?.thumbnail);
    this.autosyncPayloadLimits = normalizeAutosyncPayloadLimits(
      options.autosyncPayloadLimits
        ?? options.session?.autosyncPayloadLimits
        ?? options.session?.autosyncLimits,
    );
    this.autosyncInteractionIdleMs = normalizeNonNegativeMs(
      options.autosyncInteractionIdleMs ?? options.session?.autosyncInteractionIdleMs,
      DEFAULT_AUTOSYNC_INTERACTION_IDLE_MS,
    );
    this.autosyncDisabled = false;
    this.autosyncDisabledReason = null;
    this.ready = Promise.resolve(null);
    this._registryChange = (event) => {
      const detail = event.detail ?? {};
      this._handleStateChangeForStorage(detail);
      if (!this.capabilities.persistent && !this.capabilities.sessions && !this.capabilities.network) return;
      this._emit('change', detail);
    };
    this.states.addEventListener('change', this._registryChange);
    this._sessionAutosaveTimer = null;
    this._sessionAutosaveOptions = null;
    this._interactionAutosaveTimer = null;
    this._pendingInteractionAutosaveOptions = null;
    this._pendingStateOverrideDeltas = new Map();
    this._heliosSessionAutosaveCleanups = [];
    this._sessionThumbnailDirtySinceCapture = false;
    this._lastSessionThumbnailCapturedAt = null;
    this._lastAutosaveThumbnailAttemptAt = null;
    this._lastUserInteractionAt = null;
    this._recentPersistenceChanges = [];
    this._registerDefaultStateEntries();
    this.configure({
      networkPersistence: options.networkPersistence,
      positionPersistence: options.positionPersistence,
    });
    this._installHeliosSessionAutosaveListeners();
  }

  async getUnfinishedSessionId() {
    return this.sessionStore?.getUnfinishedSessionId?.(this.workspaceId) ?? null;
  }

  async setUnfinishedSessionId(id) {
    return this.sessionStore?.setUnfinishedSessionId?.(id, this.workspaceId) ?? (id ?? null);
  }

  setOverrideTrackingReady(ready = true) {
    this.overrideTrackingReady = ready !== false;
    this.states?.setOverrideTrackingReady?.(this.overrideTrackingReady);
    return this.overrideTrackingReady;
  }

  _handleStateChangeForStorage(detail = {}) {
    if (detail?.overrideChanged !== true) return;
    if (detail.autosave === false) return;
    if (detail.trackOverride === false && detail.overrideDelta?.deleted !== true) return;
    this._queueStateOverrideDelta(detail);
    const source = String(detail.source ?? detail.origin ?? '').toLowerCase();
    const pendingPayloadSave = this._sessionAutosaveOptions?.includeNetwork === true
      || this._sessionAutosaveOptions?.includePositions === true
      || detail.includeNetwork === true
      || detail.includePositions === true;
    if (pendingPayloadSave && source === 'ui') this._lastUserInteractionAt = this._now();
    this._scheduleSessionAutosave({
      ...detail,
      includeNetwork: detail.includeNetwork === true,
      autosync: true,
      captureThumbnail: Object.prototype.hasOwnProperty.call(detail, 'captureThumbnail')
        ? detail.captureThumbnail
        : 'auto',
      snapshotLayoutRuntime: false,
    });
  }

  _stateOverrideDeltaKeys(detail = {}) {
    const keys = new Set();
    const add = (value) => {
      const key = normalizeKey(value);
      if (key) keys.add(key);
    };
    const canonical = this.states.resolveKey?.(detail.key ?? detail.path ?? detail.requestedKey) ?? normalizeKey(detail.key ?? detail.path);
    add(canonical);
    add(detail.key);
    add(detail.path);
    add(detail.requestedKey);
    add(this.states.preferredKey?.(canonical));
    for (const alias of this.states.keyAliases?.get?.(canonical) ?? []) add(alias);
    return Array.from(keys);
  }

  _queueStateOverrideDelta(detail = {}) {
    const delta = detail.overrideDelta ?? null;
    if (!delta || !detail.key) return;
    const keys = this._stateOverrideDeltaKeys(detail);
    const canonical = this.states.resolveKey?.(detail.key) ?? normalizeKey(detail.key);
    const preferred = normalizeKey(this.states.preferredKey?.(canonical) ?? canonical);
    for (const key of keys) {
      this._pendingStateOverrideDeltas.set(key, { deleted: true });
    }
    if (delta.deleted !== true && preferred) {
      this._pendingStateOverrideDeltas.set(preferred, {
        deleted: false,
        value: cloneSerializable(delta.value),
      });
    }
  }

  _registerDefaultStateEntries() {
    this.states.register(this, '', {
      'network.persistence.enabled': {
        default: this.networkData.enabled !== false,
        type: 'boolean',
        scope: 'workspace',
      },
      'network.persistence.autosave': {
        default: this.networkData.autosave === true,
        type: 'boolean',
        scope: 'workspace',
      },
      'positions.persistence.enabled': {
        default: true,
        type: 'boolean',
        scope: 'workspace',
      },
      'positions.persistence.autosave': {
        default: this.networkData.positionPersistence?.autosave === true,
        type: 'boolean',
        scope: 'workspace',
      },
      'preferences.autosave': {
        default: false,
        type: 'boolean',
        scope: 'user',
      },
      'ui.theme': {
        default: null,
        type: 'string',
        scope: 'user',
      },
      'ui.responsive.compactDockSide': {
        default: null,
        type: 'string',
        scope: 'user',
      },
      'ui.responsive.preferredMode': {
        default: null,
        type: 'string',
        scope: 'user',
      },
      'ui.responsive.lastViewportClass': {
        default: null,
        type: 'string',
        scope: 'user',
      },
    });
  }

  configure(options = {}) {
    const networkPersistence = options.networkPersistence && typeof options.networkPersistence === 'object'
      ? options.networkPersistence
      : {};
    const positionPersistence = options.positionPersistence && typeof options.positionPersistence === 'object'
      ? options.positionPersistence
      : {};
    this.networkData = {
      ...this.networkData,
      enabled: networkPersistence.enabled !== false,
      autosave: Object.prototype.hasOwnProperty.call(networkPersistence, 'autosave')
        ? networkPersistence.autosave === true
        : this.networkData?.autosave === true,
      positionPersistence: {
        enabled: positionPersistence.enabled !== false,
        autosave: Object.prototype.hasOwnProperty.call(positionPersistence, 'autosave')
          ? positionPersistence.autosave === true
          : this.networkData?.positionPersistence?.autosave === true,
      },
      format: typeof networkPersistence.format === 'string'
        ? networkPersistence.format
        : (this.networkData?.format ?? null),
    };
    if (Object.prototype.hasOwnProperty.call(networkPersistence, 'autosave')) {
      this._setState('network.persistence.autosave', networkPersistence.autosave === true, {
        source: 'config',
        reason: 'network-persistence-config',
        autosave: false,
      });
    }
    if (Object.prototype.hasOwnProperty.call(networkPersistence, 'enabled')) {
      this._setState('network.persistence.enabled', networkPersistence.enabled !== false, {
        source: 'config',
        reason: 'network-persistence-config',
        autosave: false,
      });
    }
    if (Object.prototype.hasOwnProperty.call(positionPersistence, 'autosave')) {
      this._setState('positions.persistence.autosave', positionPersistence.autosave === true, {
        source: 'config',
        reason: 'positions-persistence-config',
        autosave: false,
      });
    }
    if (Object.prototype.hasOwnProperty.call(positionPersistence, 'enabled')) {
      this._setState('positions.persistence.enabled', positionPersistence.enabled !== false, {
        source: 'config',
        reason: 'positions-persistence-config',
        autosave: false,
      });
    }
    this._emit('config', { reason: 'configure', status: this.persistenceStatus() });
    return this.persistenceStatus();
  }

  getPreferences() {
    return createDefaultPreferencesState({
      theme: this.states.get('ui.theme', null),
      autosave: this.states.get('preferences.autosave', false) === true,
      responsive: {
        compactDockSide: this.states.get('ui.responsive.compactDockSide', null),
        preferredMode: this.states.get('ui.responsive.preferredMode', null),
        lastViewportClass: this.states.get('ui.responsive.lastViewportClass', null),
      },
    });
  }

  async loadPreferences() {
    return this.getPreferences();
  }

  async updatePreferences(patch = {}) {
    const next = createDefaultPreferencesState(mergeDeepObject(this.getPreferences(), patch));
    const writePreference = (key, value) => this._setState(key, value, {
      scope: 'user',
      source: 'preferences',
      reason: 'preferences-update',
    });
    if (Object.prototype.hasOwnProperty.call(patch, 'autosave')) {
      writePreference('preferences.autosave', next.autosave === true);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'theme')) {
      writePreference('ui.theme', next.theme ?? null);
    }
    const responsivePatch = patch?.responsive && typeof patch.responsive === 'object'
      ? patch.responsive
      : {};
    if (Object.prototype.hasOwnProperty.call(responsivePatch, 'compactDockSide')) {
      writePreference('ui.responsive.compactDockSide', next.responsive.compactDockSide ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(responsivePatch, 'preferredMode')) {
      writePreference('ui.responsive.preferredMode', next.responsive.preferredMode ?? null);
    }
    if (Object.prototype.hasOwnProperty.call(responsivePatch, 'lastViewportClass')) {
      writePreference('ui.responsive.lastViewportClass', next.responsive.lastViewportClass ?? null);
    }
    return next;
  }

  markNetworkDirty(reason = 'network-change') {
    const dirtyAt = this.networkData?.dirty === true && Number.isFinite(Number(this.networkData?.dirtyAt))
      ? Number(this.networkData.dirtyAt)
      : this._now();
    this.networkData = {
      ...this.networkData,
      enabled: true,
      status: 'dirty',
      dirty: true,
      dirtyAt,
      reason,
    };
    this._emit('change', { reason, status: this.persistenceStatus() });
    this._scheduleSessionAutosave({
      reason,
      source: 'network',
      includeNetwork: true,
      autosync: true,
      captureThumbnail: 'auto',
      snapshotLayoutRuntime: false,
    });
    return this.persistenceStatus();
  }

  markPositionsDirty(reason = 'positions-change') {
    const dirtyAt = this.networkData?.dirty === true && Number.isFinite(Number(this.networkData?.dirtyAt))
      ? Number(this.networkData.dirtyAt)
      : this._now();
    this.networkData = {
      ...this.networkData,
      enabled: true,
      status: 'dirty',
      dirty: true,
      positionsDirty: true,
      dirtyAt,
      reason,
    };
    this._emit('change', { reason, status: this.persistenceStatus() });
    this._scheduleSessionAutosave({
      reason,
      source: 'positions',
      includeNetwork: false,
      includePositions: true,
      autosync: true,
      captureThumbnail: 'auto',
      snapshotLayoutRuntime: true,
      layoutRuntime: {
        includePositions: false,
      },
      debounceMs: DEFAULT_POSITION_AUTOSAVE_DEBOUNCE_MS,
    });
    return this.persistenceStatus();
  }

  async setSessionNickname(nickname, id = this.sessionId) {
    const normalized = normalizeSessionNickname(nickname);
    if (!this.capabilities.sessions || !id) return null;
    const session = await this.getSession(id);
    if (!session) return null;
    session.payload.session.nickname = normalized;
    session.payload.session.updatedAt = Date.now();
    const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.session, session.payload);
    envelope.id = session.payload.session.id;
    await this.sessionStore?.put?.(envelope);
    this.sessionSavedAt = envelopeUpdatedAt(envelope) ?? Date.now();
    this._emit('change', { reason: 'session-nickname', sessionId: id, status: this.persistenceStatus() });
    return envelope;
  }

  _setState(key, value, options = {}) {
    const suppressStartupOverride = this.overrideTrackingReady === false
      && !Object.prototype.hasOwnProperty.call(options, 'trackOverride')
      && !isExplicitOverrideSource(options.source);
    const writeOptions = {
      ...options,
      trackOverride: options.trackOverride ?? !suppressStartupOverride,
    };
    return this.states.set(key, value, writeOptions);
  }

  _estimatePositionPayloadByteLength() {
    const explicitNodeCount = Number(this.helios?.network?.nodeCount);
    if (Number.isFinite(explicitNodeCount) && explicitNodeCount > 0) {
      return Math.floor(explicitNodeCount) * 3 * Float32Array.BYTES_PER_ELEMENT;
    }
    const renderNodeCount = Number(this.helios?._getRenderNetwork?.()?.nodeCount);
    if (Number.isFinite(renderNodeCount) && renderNodeCount > 0) {
      return Math.floor(renderNodeCount) * 3 * Float32Array.BYTES_PER_ELEMENT;
    }
    return null;
  }

  _estimateNetworkNodeCount() {
    const counts = [
      Number(this.helios?.network?.nodeCount),
      Number(this.helios?._getRenderNetwork?.()?.nodeCount),
    ].filter((value) => Number.isFinite(value) && value > 0);
    return counts.length ? Math.max(...counts.map((value) => Math.floor(value))) : null;
  }

  _autosyncSizeLimitSkip(options = {}) {
    if (options.autosync !== true) return null;
    if (this.autosyncPayloadLimits?.enabled === false) return null;
    if (options.includePositions === true) {
      const limit = Number(this.autosyncPayloadLimits?.positionMaxBytes);
      const byteLength = this._estimatePositionPayloadByteLength();
      if (Number.isFinite(limit) && limit > 0 && Number.isFinite(byteLength) && byteLength > limit) {
        return {
          reason: 'size-limit',
          scope: 'positions',
          byteLength,
          maxBytes: limit,
          message: `Position autosync is disabled because the position payload is ${Math.ceil(byteLength / 1024)} KB, above the ${Math.ceil(limit / 1024)} KB autosync limit. Use manual Sync to save it.`,
        };
      }
    }
    if (options.includeNetwork === true) {
      const limit = Number(this.autosyncPayloadLimits?.networkMaxNodes);
      const nodeCount = this._estimateNetworkNodeCount();
      if (Number.isFinite(limit) && limit > 0 && Number.isFinite(nodeCount) && nodeCount > limit) {
        return {
          reason: 'size-limit',
          scope: 'network',
          nodeCount,
          maxNodes: limit,
          message: `Network autosync is disabled because this network has ${nodeCount.toLocaleString()} nodes, above the ${limit.toLocaleString()} node autosync limit. Use manual Sync to save it.`,
        };
      }
    }
    return null;
  }

  _setAutosyncDisabled(skip = {}, options = {}) {
    const reason = {
      reason: skip.reason ?? 'disabled',
      scope: skip.scope ?? 'session',
      byteLength: Number.isFinite(skip.byteLength) ? Number(skip.byteLength) : null,
      maxBytes: Number.isFinite(skip.maxBytes) ? Number(skip.maxBytes) : null,
      nodeCount: Number.isFinite(skip.nodeCount) ? Number(skip.nodeCount) : null,
      maxNodes: Number.isFinite(skip.maxNodes) ? Number(skip.maxNodes) : null,
      message: skip.message ?? 'Auto sync is disabled for this session. Use manual Sync to save changes.',
      disabledAt: this._now(),
    };
    this.autosyncDisabled = true;
    this.autosyncDisabledReason = reason;
    this.networkData = {
      ...this.networkData,
      autosyncDisabled: true,
      autosyncDisabledReason: reason,
      status: options.markDirty === true
        ? 'dirty'
        : (this.networkData.status ?? 'saved'),
      dirty: this.networkData.dirty === true || options.markDirty === true,
      dirtyAt: this.networkData.dirtyAt ?? (options.markDirty === true ? this._now() : null),
      skipped: null,
    };
    this._setState('network.persistence.autosave', false, {
      source: 'system',
      reason: 'autosync-size-limit',
      trackOverride: false,
      autosave: false,
      journal: false,
    });
    this._setState('positions.persistence.autosave', false, {
      source: 'system',
      reason: 'autosync-size-limit',
      trackOverride: false,
      autosave: false,
      journal: false,
    });
    this._emit('change', { reason: 'autosync-size-limit', status: this.persistenceStatus(), skip: reason });
    return reason;
  }

  _scheduleSessionAutosave(options = {}) {
    if (!this.capabilities.sessions || !this.sessionId || !this.sessionStore) return;
    this._markSessionThumbnailDirty();
    const pending = this._sessionAutosaveOptions ?? {};
    const nextOptions = {
      ...pending,
      ...options,
      includeNetwork: pending.includeNetwork === true || options.includeNetwork === true,
      includePositions: pending.includePositions === true || options.includePositions === true,
      captureThumbnail: mergeCaptureThumbnailMode(pending.captureThumbnail, options.captureThumbnail),
      snapshotLayoutRuntime: pending.snapshotLayoutRuntime === true || options.snapshotLayoutRuntime === true,
    };
    this._sessionAutosaveOptions = nextOptions;
    const baseDelay = normalizeNonNegativeMs(options.sessionDebounceMs ?? options.debounceMs, 750);
    const interactionAutosave = isUserInteractionDetail(options) && options.interactionAlreadyIdle !== true;
    if (interactionAutosave) this._lastUserInteractionAt = this._now();
    const delay = interactionAutosave
      ? Math.max(baseDelay, this.autosyncInteractionIdleMs)
      : baseDelay;
    const keepExistingPayloadTimer = this._sessionAutosaveTimer
      && (nextOptions.includeNetwork === true || nextOptions.includePositions === true)
      && (pending.includeNetwork === true || pending.includePositions === true);
    if (this._sessionAutosaveTimer && !keepExistingPayloadTimer) clearTimeout(this._sessionAutosaveTimer);
    const dirtyAt = this.networkData?.dirty === true && Number.isFinite(Number(this.networkData?.dirtyAt))
      ? Number(this.networkData.dirtyAt)
      : this._now();
    this.networkData = {
      ...this.networkData,
      status: this.networkData.status === 'idle' ? 'dirty' : this.networkData.status,
      dirty: true,
      dirtyAt,
    };
    const autosyncSkip = this._autosyncSizeLimitSkip(nextOptions);
    if (autosyncSkip) {
      this._sessionAutosaveOptions = null;
      if (this._sessionAutosaveTimer) {
        clearTimeout(this._sessionAutosaveTimer);
        this._sessionAutosaveTimer = null;
      }
      this._setAutosyncDisabled(autosyncSkip, { markDirty: true });
      return;
    }
    if (this.autosyncDisabled && options.autosync !== false) {
      this.networkData = {
        ...this.networkData,
        autosyncDisabled: true,
        autosyncDisabledReason: this.autosyncDisabledReason,
      };
      this._emit('change', { reason: 'autosync-disabled', status: this.persistenceStatus() });
      return;
    }
    if (!keepExistingPayloadTimer) {
      this._sessionAutosaveTimer = setTimeout(() => this._runScheduledSessionAutosave(nextOptions), delay);
    }
  }

  _scheduleInteractionSessionAutosave(event) {
    if (!this.capabilities.sessions || !this.sessionId || !this.sessionStore) return;
    const now = this._now();
    const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
    const userInteraction = isUserInteractionDetail(detail);
    if (!userInteraction) return;
    this._lastUserInteractionAt = now;
    const dirtyAt = this.networkData?.dirty === true && Number.isFinite(Number(this.networkData?.dirtyAt))
      ? Number(this.networkData.dirtyAt)
      : now;
    this.networkData = {
      ...this.networkData,
      status: this.networkData.status === 'idle' || this.networkData.status === 'saved'
        ? 'dirty'
        : this.networkData.status,
      dirty: true,
      dirtyAt,
      reason: event?.type ?? this.networkData.reason ?? 'helios-change',
    };
    this._emit('change', { reason: event?.type ?? 'helios-change', status: this.persistenceStatus() });
    const pending = this._pendingInteractionAutosaveOptions ?? {};
    const nextOptions = {
      ...pending,
      source: 'helios',
      reason: event?.type ?? pending.reason ?? 'helios-change',
      debounceMs: 0,
      includeNetwork: false,
      includePositions: false,
      captureThumbnail: mergeCaptureThumbnailMode(pending.captureThumbnail, 'auto'),
      snapshotLayoutRuntime: false,
      interactionAlreadyIdle: true,
      autosync: true,
    };
    this._pendingInteractionAutosaveOptions = nextOptions;
    if (this._interactionAutosaveTimer) clearTimeout(this._interactionAutosaveTimer);
    const idleDelay = Math.max(0, this.autosyncInteractionIdleMs ?? DEFAULT_AUTOSYNC_INTERACTION_IDLE_MS);
    this._interactionAutosaveTimer = setTimeout(() => {
      this._interactionAutosaveTimer = null;
      const flushOptions = this._pendingInteractionAutosaveOptions ?? nextOptions;
      this._pendingInteractionAutosaveOptions = null;
      this._scheduleSessionAutosave(flushOptions);
    }, idleDelay);
  }

  _sessionAutosaveDeferDelay(options = {}) {
    const now = this._now();
    const idleMs = this.autosyncInteractionIdleMs ?? 0;
    const payloadPersistence = options.includeNetwork === true || options.includePositions === true;
    if (payloadPersistence) {
      if (this._isSessionUserInteractionActive(options)) {
        this._lastUserInteractionAt = now;
        return Math.max(idleMs, 250);
      }
      if (idleMs > 0 && Number.isFinite(this._lastUserInteractionAt)) {
        const remaining = idleMs - (now - this._lastUserInteractionAt);
        if (remaining > 0) return remaining;
      }
      return 0;
    }
    if (this._isSessionThumbnailInteractionActive(options)) {
      this._lastUserInteractionAt = now;
      return Math.max(idleMs, 250);
    }
    if (idleMs > 0 && Number.isFinite(this._lastUserInteractionAt)) {
      const remaining = idleMs - (now - this._lastUserInteractionAt);
      if (remaining > 0) return remaining;
    }
    return 0;
  }

  _consumePendingStateOverrideDeltas() {
    const deltas = new Map(this._pendingStateOverrideDeltas);
    this._pendingStateOverrideDeltas.clear();
    return deltas;
  }

  _restorePendingStateOverrideDeltas(deltas) {
    for (const [key, delta] of deltas ?? []) {
      this._pendingStateOverrideDeltas.set(key, delta);
    }
  }

  _snapshotLiveSessionRuntime(options = {}) {
    const helios = this.helios;
    if (!helios) return {};
    const readState = (key, fallback = null) => {
      const entry = this.states?.entry?.(key);
      if (!entry) return fallback;
      const value = typeof entry.getter === 'function'
        ? entry.getter()
        : this.states.get(key, fallback);
      return value == null ? fallback : cloneSerializable(value);
    };
    const cameraOptions = options.camera ?? {};
    let cameraState = readState('camera.pose');
    if (!cameraState) {
      if (typeof helios._snapshotCameraState === 'function') {
        cameraState = helios._snapshotCameraState(cameraOptions);
      } else if (typeof helios.cameraPose === 'function') {
        cameraState = helios.cameraPose();
        if (cameraState && cameraOptions.includeViewport !== true) delete cameraState.viewport;
      }
    }
    let cameraControlState = null;
    const cameraControlEntries = typeof this.states?.entriesFor === 'function'
      ? this.states.entriesFor('camera.controls')
      : [];
    if (cameraControlEntries.length > 0) {
      cameraControlState = {};
      for (const [key] of cameraControlEntries) {
        const suffix = key.startsWith('camera.controls.')
          ? key.slice('camera.controls.'.length)
          : '';
        if (!suffix) continue;
        const entry = this.states.entry(key);
        const value = typeof entry?.getter === 'function'
          ? entry.getter()
          : this.states.get(key);
        cameraControlState[suffix] = cloneSerializable(value);
      }
    }
    if (!cameraControlState) {
      if (typeof helios._snapshotCameraControlState === 'function') {
        cameraControlState = helios._snapshotCameraControlState();
      } else if (typeof helios.cameraControls === 'function') {
        cameraControlState = helios.cameraControls();
      }
    }
    let layoutRuntimeState = readState('layout.runtime.state');
    if (options.includeLayoutRuntime !== false && typeof helios.snapshotLayoutRuntimeState === 'function') {
      layoutRuntimeState = layoutRuntimeState ?? helios.snapshotLayoutRuntimeState({
        includePositions: false,
        ...(options.layoutRuntime ?? {}),
      });
    }
    return {
      cameraState: cameraState ? cloneSerializable(cameraState) : null,
      cameraControlState: cameraControlState ? cloneSerializable(cameraControlState) : null,
      layoutRuntimeState: layoutRuntimeState ? cloneSerializable(layoutRuntimeState) : null,
    };
  }

  _refreshVisualizationSessionRuntime(visualizationState, options = {}) {
    if (!visualizationState || typeof visualizationState !== 'object') return visualizationState;
    visualizationState.payload = visualizationState.payload && typeof visualizationState.payload === 'object'
      ? visualizationState.payload
      : {};
    const runtime = this._snapshotLiveSessionRuntime(options);
    if (runtime.cameraState) visualizationState.payload.cameraState = runtime.cameraState;
    if (runtime.cameraControlState) visualizationState.payload.cameraControlState = runtime.cameraControlState;
    if (runtime.layoutRuntimeState) visualizationState.payload.layoutRuntimeState = runtime.layoutRuntimeState;
    return visualizationState;
  }

  async _saveIncrementalSessionState(options = {}, deltas = new Map()) {
    if (!this.capabilities.sessions || !this.sessionId || !this.sessionStore || deltas.size <= 0) return null;
    const id = String(options.id ?? this.sessionId);
    const existingRecord = await this.sessionStore.get?.(id, { hydrateNetworkData: false });
    if (!existingRecord) {
      return this.saveSession({
        ...options,
        id,
        includeNetwork: false,
        captureThumbnail: options.captureThumbnail === true ? true : false,
        snapshotLayoutRuntime: false,
      });
    }
    const envelope = this.deserializeSessionSnapshot(existingRecord);
    const payload = cloneSerializable(envelope?.payload ?? {});
    const now = Date.now();
    payload.session = {
      ...(payload.session ?? {}),
      id,
      updatedAt: Number.isFinite(options.updatedAt) ? Number(options.updatedAt) : now,
      workspaceId: this.workspaceId,
      unfinished: options.unfinished !== false,
      status: options.status ?? payload.session?.status ?? 'active',
    };
    const visualizationState = payload.visualizationState && typeof payload.visualizationState === 'object'
      ? payload.visualizationState
      : createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
          storageState: this.serializeSnapshot(options.storage ?? {}),
        });
    visualizationState.payload = visualizationState.payload && typeof visualizationState.payload === 'object'
      ? visualizationState.payload
      : {};
    const storageState = visualizationState.payload.storageState && typeof visualizationState.payload.storageState === 'object'
      ? visualizationState.payload.storageState
      : this.serializeSnapshot(options.storage ?? {});
    storageState.state = storageState.state && typeof storageState.state === 'object'
      ? storageState.state
      : { schema: 'helios-web.state', version: 1, overrides: {} };
    storageState.state.overrides = storageState.state.overrides && typeof storageState.state.overrides === 'object'
      ? storageState.state.overrides
      : {};
    delete storageState.state.values;
    if (options.includeJournal !== true) delete storageState.state.journal;
    visualizationState.payload.overrides = visualizationState.payload.overrides && typeof visualizationState.payload.overrides === 'object'
      ? visualizationState.payload.overrides
      : {};
    for (const [key, delta] of deltas) {
      if (!key) continue;
      if (delta?.deleted === true) {
        delete storageState.state.overrides[key];
        delete visualizationState.payload.overrides[key];
      } else {
        const value = cloneSerializable(delta.value);
        storageState.state.overrides[key] = value;
        visualizationState.payload.overrides[key] = cloneSerializable(value);
      }
    }
    this._refreshVisualizationSessionRuntime(visualizationState, {
      ...options,
      layoutRuntime: {
        includePositions: false,
        ...(options.layoutRuntime ?? {}),
      },
    });
    visualizationState.payload.storageState = storageState;
    payload.visualizationState = visualizationState;
    payload.thumbnail = await this._resolveSessionSnapshotThumbnail(options, envelope);
    const next = createPersistenceEnvelope(PERSISTENCE_KINDS.session, payload, {
      source: 'helios.storage',
      incremental: true,
    });
    next.id = id;
    next.payload.session.bytes = sessionStoredByteStats(next).bytes;
    await this.sessionStore.put?.(next);
    this._recordPersistenceChange('session-incremental-state-save', {
      id,
      deltaCount: deltas.size,
      reason: options.reason ?? null,
    });
    this.sessionSavedAt = envelopeUpdatedAt(next) ?? now;
    this.sessionSaveError = null;
    const positionsStillDirty = this.networkData?.positionsDirty === true;
    this.networkData = {
      ...this.networkData,
      enabled: true,
      status: positionsStillDirty ? 'dirty' : 'saved',
      dirty: positionsStillDirty,
      dirtyAt: positionsStillDirty ? (this.networkData?.dirtyAt ?? now) : null,
      savedAt: this.sessionSavedAt,
      format: payload.networkData?.format ?? this.networkData.format ?? null,
    };
    await this.setUnfinishedSessionId(next.payload?.session?.unfinished === false ? null : id);
    this._emit('change', { reason: 'session-state-delta-save', sessionId: id, status: this.persistenceStatus() });
    return next;
  }

  _runScheduledSessionAutosave(options = {}) {
    this._sessionAutosaveTimer = null;
    const flushOptions = this._sessionAutosaveOptions ?? options;
    this._sessionAutosaveOptions = null;
    const deferDelay = this._sessionAutosaveDeferDelay(flushOptions);
    if (deferDelay > 0) {
      this._sessionAutosaveOptions = flushOptions;
      this._sessionAutosaveTimer = setTimeout(() => this._runScheduledSessionAutosave(flushOptions), deferDelay);
      return;
    }
    const autosyncSkip = this._autosyncSizeLimitSkip(flushOptions);
    if (autosyncSkip) {
      this._setAutosyncDisabled(autosyncSkip, { markDirty: true });
      return;
    }
    const stateDeltas = this._consumePendingStateOverrideDeltas();
    const canWriteIncrementalState = stateDeltas.size > 0
      && flushOptions.includeNetwork !== true
      && flushOptions.includePositions !== true
      && flushOptions.snapshotLayoutRuntime !== true;
    const savePromise = canWriteIncrementalState
      ? this._saveIncrementalSessionState({
        id: this.sessionId,
        reason: flushOptions.reason ?? 'storage-autosave',
        captureThumbnail: flushOptions.captureThumbnail === true
          ? true
          : (flushOptions.captureThumbnail === 'auto' ? 'auto' : false),
      }, stateDeltas)
      : this.saveSession({
      id: this.sessionId,
      reason: flushOptions.reason ?? 'storage-autosave',
      autosync: flushOptions.autosync === true,
      includeNetwork: flushOptions.includeNetwork === true,
      includePositions: flushOptions.includePositions === true,
      captureThumbnail: flushOptions.captureThumbnail === true
        ? true
        : (flushOptions.captureThumbnail === 'auto' ? 'auto' : false),
      snapshotLayoutRuntime: flushOptions.snapshotLayoutRuntime === true,
      layoutRuntime: flushOptions.layoutRuntime,
      networkFormat: flushOptions.networkFormat ?? flushOptions.network?.format ?? flushOptions.networkPersistence?.format,
      fullVisualizationState: flushOptions.fullVisualizationState === true,
    });
    savePromise.catch((error) => {
      if (canWriteIncrementalState) this._restorePendingStateOverrideDeltas(stateDeltas);
      this.sessionSaveError = error?.message ?? String(error);
      this.networkData = { ...this.networkData, status: 'error', remoteWarning: this.sessionSaveError };
      this._emit('change', { reason: 'session-autosave-error', error: this.sessionSaveError });
    });
  }

  _recordPersistenceChange(type, detail = {}) {
    const timestamp = this._now();
    this._recentPersistenceChanges.push({
      timestamp,
      type,
      ...cloneSerializable(detail),
    });
    const cutoff = timestamp - (10 * 60 * 1000);
    while (this._recentPersistenceChanges.length > 0 && this._recentPersistenceChanges[0].timestamp < cutoff) {
      this._recentPersistenceChanges.shift();
    }
    const max = 1000;
    if (this._recentPersistenceChanges.length > max) {
      this._recentPersistenceChanges.splice(0, this._recentPersistenceChanges.length - max);
    }
  }

  debugStats(options = {}) {
    const windowMs = Number.isFinite(options.windowMs) ? Math.max(0, Number(options.windowMs)) : 5 * 60 * 1000;
    const cutoff = this._now() - windowMs;
    const persistenceChanges = this._recentPersistenceChanges.filter((entry) => entry.timestamp >= cutoff);
    const stateStats = this.states?.debugStats?.({ windowMs }) ?? {
      windowMs,
      trackedStateCount: this.states?.overrideKeys?.().length ?? 0,
      trackedKeys: this.states?.overrideKeys?.() ?? [],
      stateChangeCount: 0,
      uiChangeCount: 0,
    };
    return {
      ...stateStats,
      windowMs,
      persistenceChangeCount: persistenceChanges.length,
      recentPersistenceChanges: persistenceChanges.map((entry) => cloneSerializable(entry)),
      sessionId: this.sessionId ?? null,
      networkData: cloneSerializable(this.networkData),
    };
  }

  _installHeliosSessionAutosaveListeners() {
    const helios = this.helios;
    if (!helios) return;
    const schedule = (event) => {
      this._scheduleInteractionSessionAutosave(event);
    };
    for (const type of ['camera:move', 'camera:control-change']) {
      if (typeof helios.on === 'function') {
        try {
          const unsubscribe = helios.on(type, schedule);
          if (typeof unsubscribe === 'function') this._heliosSessionAutosaveCleanups.push(unsubscribe);
          continue;
        } catch {
          // Unit-test doubles may inherit Helios.prototype without EventTarget initialization.
        }
      }
      if (typeof helios.addEventListener === 'function') {
        try {
          helios.addEventListener(type, schedule);
          this._heliosSessionAutosaveCleanups.push(() => helios.removeEventListener(type, schedule));
        } catch {
          // Ignore non-live EventTarget test doubles.
        }
      }
    }
  }

  recordPortableState(path, value, options = {}) {
    return this._setState(path, value, {
      scope: options.scope ?? 'network',
      source: options.source ?? 'storage',
      reason: options.reason ?? 'portable-state',
      autosave: options.autosave,
    });
  }

  status() {
    return this.persistenceStatus();
  }

  persistenceStatus() {
    return {
      type: this.type,
      capabilities: { ...this.capabilities },
      workspaceId: this.workspaceId,
      sessionId: this.sessionId,
      requestedSessionId: this.requestedSessionId,
      explicitSessionInvalid: this.explicitSessionInvalid,
      overrideCount: this.states.overrideKeys().length,
      dirtyState: this.states.dirtyState(),
      networkData: cloneSerializable(this.networkData),
      sessionSync: {
        status: this.sessionSaveError ? 'error' : (this.sessionSavedAt ? 'saved' : 'idle'),
        savedAt: this.sessionSavedAt,
        error: this.sessionSaveError,
        pending: false,
      },
    };
  }

  serializeSnapshot(options = {}) {
    return {
      schema: 'helios-web.storage',
      version: 1,
      type: this.type,
      workspaceId: this.workspaceId,
      sessionId: this.sessionId,
      state: this.states.snapshot({
        aliases: options.aliases ?? 'preferred',
        includeJournal: options.includeJournal === true,
      }),
      network: options.includeNetwork === true && this.persistNetwork
        ? this.helios?.serializeNetwork?.(options.network ?? {})
        : null,
      metadata: {
        createdAt: Date.now(),
        source: 'helios.storage',
      },
    };
  }

  _markSessionThumbnailDirty() {
    this._sessionThumbnailDirtySinceCapture = true;
  }

  _recordSessionThumbnailCaptured(thumbnail) {
    if (!thumbnail) return;
    const capturedAt = Number.isFinite(Number(thumbnail.capturedAt))
      ? Number(thumbnail.capturedAt)
      : this._now();
    this._lastSessionThumbnailCapturedAt = capturedAt;
    this._sessionThumbnailDirtySinceCapture = false;
  }

  _hasAutosaveInteractionIdleElapsed(now = this._now()) {
    const idleMs = this.autosyncInteractionIdleMs ?? 0;
    if (idleMs <= 0 || !Number.isFinite(this._lastUserInteractionAt)) return true;
    return now - this._lastUserInteractionAt >= idleMs;
  }

  _isSessionThumbnailInteractionActive(options = {}) {
    if (options.interactionActive != null) return options.interactionActive === true;
    const helios = this.helios;
    if (!helios) return false;
    for (const method of [
      'isInteractionActive',
      'isPointerInteractionActive',
      'isCameraInteractionActive',
      'isLayoutInteractionActive',
    ]) {
      if (typeof helios[method] === 'function') {
        try {
          if (helios[method]() === true) return true;
        } catch (_) {
          // Ignore optional host probes that are not available in test doubles.
        }
      }
    }
    const picking = helios._picking ?? null;
    const gesture = picking?.gesture ?? null;
    if (gesture?.active === true) return true;
    if (gesture?.pointers?.size > 0) return true;
    const cameraRuntime = helios._cameraControlRuntime ?? null;
    if (cameraRuntime?.controlPoseActive === true) return true;
    if (helios._cameraMoveRaf != null || helios._pendingCameraMoveDetail) return true;
    const layoutBehavior = helios.behavior?.layout ?? helios.behaviors?.get?.('layout') ?? null;
    if (layoutBehavior?.state?.running === true) return true;
    return false;
  }

  _isSessionUserInteractionActive(options = {}) {
    if (options.interactionActive != null) return options.interactionActive === true;
    const helios = this.helios;
    if (!helios) return false;
    for (const method of [
      'isInteractionActive',
      'isPointerInteractionActive',
      'isCameraInteractionActive',
    ]) {
      if (typeof helios[method] === 'function' && helios[method]() === true) return true;
    }
    const picking = helios._picking ?? null;
    const gesture = picking?.gesture ?? null;
    if (gesture?.active === true) return true;
    if (gesture?.pointers?.size > 0) return true;
    const cameraRuntime = helios._cameraControlRuntime ?? null;
    return cameraRuntime?.controlPoseActive === true;
  }

  _shouldCaptureAutosaveThumbnail(options = {}) {
    const now = this._now();
    this._lastAutosaveThumbnailAttemptAt = now;
    const config = normalizeSessionThumbnailOptions(options.thumbnail ?? options.sessionThumbnail ?? this.sessionThumbnail);
    if (config.enabled === false || config.autosaveEnabled === false) return false;
    if (!this.capabilities.sessions || !this.sessionId || !this.sessionStore) return false;
    if (!this.helios || typeof this.helios.exportFigurePreviewBlob !== 'function') return false;
    if (this.networkData?.dirty !== true) return false;
    if (this._sessionThumbnailDirtySinceCapture !== true) return false;
    if (!this._hasAutosaveInteractionIdleElapsed(now)) return false;
    if (this._isSessionThumbnailInteractionActive(options)) return false;
    if (Number.isFinite(this._lastSessionThumbnailCapturedAt)) {
      const elapsed = now - this._lastSessionThumbnailCapturedAt;
      if (elapsed < config.autosaveMinIntervalMs) return false;
    }
    return true;
  }

  async _resolveSessionSnapshotThumbnail(options = {}, existingEnvelope = null) {
    if (options.thumbnail && typeof options.thumbnail === 'object' && options.thumbnail.dataUrl) {
      const thumbnail = cloneSerializable(options.thumbnail);
      this._recordSessionThumbnailCaptured(thumbnail);
      return thumbnail;
    }
    const invalidateExisting = options.invalidateExistingThumbnail === true;
    const existingThumbnail = invalidateExisting
      ? null
      : cloneSerializable(existingEnvelope?.payload?.thumbnail ?? null);
    if (options.captureThumbnail === false) return existingThumbnail;
    if (options.captureThumbnail === 'auto') {
      if (!this._shouldCaptureAutosaveThumbnail(options)) return existingThumbnail;
      const thumbnail = await this.captureSessionThumbnail({
        ...options,
        captureThumbnail: true,
      });
      return thumbnail ?? existingThumbnail;
    }
    return await this.captureSessionThumbnail(options);
  }

  async _serializeSessionPositionData(options = {}) {
    if (!this.helios?.snapshotLayoutRuntimeStateAsync && !this.helios?.snapshotLayoutRuntimeState) return null;
    const explicitMaxPositionBytes = options.maxPositionBytes ?? options.layoutRuntime?.maxPositionBytes;
    const maxPositionBytes = Number.isFinite(Number(explicitMaxPositionBytes))
      ? Math.max(0, Number(explicitMaxPositionBytes))
      : (options.autosync === true
        ? this.autosyncPayloadLimits?.positionMaxBytes ?? DEFAULT_AUTOSYNC_POSITION_MAX_BYTES
        : DEFAULT_MANUAL_POSITION_MAX_BYTES);
    const runtimeState = await (this.helios.snapshotLayoutRuntimeStateAsync?.({
      reason: options.reason ?? 'session-position-save',
      ...(options.layoutRuntime ?? {}),
      maxPositionBytes,
      includePositions: true,
      preferDelegate: true,
    }) ?? this.helios.snapshotLayoutRuntimeState?.({
      reason: options.reason ?? 'session-position-save',
      ...(options.layoutRuntime ?? {}),
      maxPositionBytes,
      includePositions: true,
      preferDelegate: true,
    }));
    const positions = decodeFloat32PositionPayload(runtimeState?.positions);
    if (!(positions instanceof Float32Array) || positions.length <= 0) return null;
    const positionBytes = new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength);
    const compressed = await compressPositionBytes(positionBytes);
    if (!compressed?.data) return null;
    const runtimeMetadata = cloneSerializable(runtimeState ?? {});
    delete runtimeMetadata.positions;
    delete runtimeMetadata.positionsSkipped;
    return {
      schema: 'helios-web.session-position-data',
      version: 1,
      encoding: 'float32',
      compression: compressed.compression,
      data: compressed.data,
      length: positions.length,
      byteLength: positions.byteLength,
      storedByteLength: compressed.data.byteLength,
      dimension: 3,
      nodeCount: Number.isFinite(runtimeState?.nodeCount)
        ? Number(runtimeState.nodeCount)
        : Math.floor(positions.length / 3),
      capturedAt: Number.isFinite(runtimeState?.capturedAt) ? Number(runtimeState.capturedAt) : this._now(),
      runtimeState: runtimeMetadata,
    };
  }

  async _positionDataToLayoutRuntimeState(positionData = {}) {
    if (!positionData || typeof positionData !== 'object' || positionData.data == null) return null;
    if (positionData.encoding !== 'float32') return null;
    const bytes = await decompressPositionBytes(positionData.data, positionData.compression ?? 'none');
    if (!bytes || bytes.byteLength <= 0 || bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) return null;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const positions = new Float32Array(copy.buffer);
    if (positionData.length != null && positions.length !== Number(positionData.length)) {
      throw new Error(`Helios session position length mismatch: expected ${positionData.length}, got ${positions.length}`);
    }
    return {
      ...(cloneSerializable(positionData.runtimeState ?? {})),
      schema: positionData.runtimeState?.schema ?? 'helios-web.layout-runtime-state',
      version: positionData.runtimeState?.version ?? 1,
      capturedAt: Number.isFinite(positionData.capturedAt) ? Number(positionData.capturedAt) : Date.now(),
      nodeCount: Number.isFinite(positionData.nodeCount)
        ? Number(positionData.nodeCount)
        : Math.floor(positions.length / 3),
      positions: encodeFloat32PositionPayload(positions),
    };
  }

  async serializeSessionSnapshot(options = {}) {
    const id = String(options.id ?? this.idFactory());
    const existingRecord = options.preserveExisting === false || !this.sessionStore?.get
      ? null
      : await this.sessionStore.get(id, { hydrateNetworkData: false });
    const existingEnvelope = existingRecord ? this.deserializeSessionSnapshot(existingRecord) : null;
    if (!this.helios) {
      return createPersistenceEnvelope(PERSISTENCE_KINDS.session, {
        session: {
          id,
          createdAt: Number.isFinite(options.createdAt)
            ? Number(options.createdAt)
            : (Number(existingEnvelope?.payload?.session?.createdAt) || Date.now()),
          updatedAt: Number.isFinite(options.updatedAt) ? Number(options.updatedAt) : Date.now(),
          workspaceId: this.workspaceId,
          nickname: normalizeSessionNickname(options.nickname ?? options.name ?? options.label)
            ?? normalizeSessionNickname(existingEnvelope?.payload?.session?.nickname),
          unfinished: options.unfinished !== false,
          status: options.status ?? 'active',
        },
        visualizationState: options.visualizationState
          ?? createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
            storageState: this.serializeSnapshot(options.storage ?? {}),
          }),
        networkData: existingEnvelope?.payload?.networkData ?? null,
        positionData: existingEnvelope?.payload?.positionData ?? null,
        thumbnail: await this._resolveSessionSnapshotThumbnail(options, existingEnvelope),
      });
    }
    const createdAt = Number.isFinite(options.createdAt)
      ? Number(options.createdAt)
      : (Number(existingEnvelope?.payload?.session?.createdAt) || Date.now());
    const updatedAt = Number.isFinite(options.updatedAt) ? Number(options.updatedAt) : Date.now();
    const networkFormat = typeof options.networkFormat === 'string'
      ? options.networkFormat
      : (typeof options.networkPersistence?.format === 'string'
        ? options.networkPersistence.format
        : (existingEnvelope?.payload?.networkData?.format ?? 'zxnet'));
    const snapshotLayoutRuntime = options.snapshotLayoutRuntime === true;
    const visualizationOptions = snapshotLayoutRuntime
      ? {
          reason: options.reason ?? 'save-session',
          snapshotLayoutRuntime: true,
          layoutRuntime: options.layoutRuntime ?? {},
        }
      : {
          reason: options.reason ?? 'save-session',
          snapshotLayoutRuntime: false,
          layoutRuntime: {
            includePositions: false,
            preferDelegate: false,
            ...(options.layoutRuntime ?? {}),
          },
        };
    const useTrackedVisualization = options.fullVisualizationState !== true && options.trackedOnly !== false;
    const visualizationState = options.visualizationState
      ?? await (useTrackedVisualization
        && (this.helios.serializeTrackedVisualizationStateAsync || this.helios.serializeTrackedVisualizationState)
        ? (this.helios.serializeTrackedVisualizationStateAsync?.(visualizationOptions)
          ?? this.helios.serializeTrackedVisualizationState?.(visualizationOptions))
        : (this.helios.serializeVisualizationStateAsync?.(visualizationOptions)
          ?? this.helios.serializeVisualizationState?.(visualizationOptions)));
    const visualizationPayload = visualizationState?.payload ?? {};
    const networkSource = options.networkSource ?? visualizationPayload.networkSource ?? null;
    const nickname = normalizeSessionNickname(options.nickname ?? options.name ?? options.label)
      ?? normalizeSessionNickname(existingEnvelope?.payload?.session?.nickname)
      ?? normalizeSessionNickname(networkSource?.baseName ?? networkSource?.name)
      ?? normalizeSessionNickname(this.helios?._lastLoadedNetworkBase ?? this.helios?._lastLoadedNetworkName);
    const includePositions = options.includePositions === true && options.positionData !== null;
    const includeNetwork = options.includeNetwork !== false && options.networkData !== null;
    const networkData = Object.prototype.hasOwnProperty.call(options, 'networkData')
      ? options.networkData
      : includeNetwork
        ? await this.helios.savePortableNetwork?.(networkFormat, {
            includeVisualization: false,
            includeCurrentPositions: includePositions ? false : options.includeCurrentPositions !== false,
            output: 'uint8array',
          })
        : null;
    const resolvedNetworkData = networkData != null
      ? {
          format: networkFormat,
          data: networkData,
        }
      : cloneSerializable(existingEnvelope?.payload?.networkData ?? {
          format: networkFormat,
          data: null,
        });
    const positionData = Object.prototype.hasOwnProperty.call(options, 'positionData')
      ? options.positionData
      : includePositions
        ? await this._serializeSessionPositionData({
            ...options,
            reason: options.reason ?? 'save-session',
          })
        : null;
    const resolvedPositionData = positionData != null
      ? positionData
      : cloneSerializable(existingEnvelope?.payload?.positionData ?? null);
    const thumbnail = await this._resolveSessionSnapshotThumbnail({
      ...options,
      invalidateExistingThumbnail: options.invalidateExistingThumbnail === true || networkData != null,
    }, existingEnvelope);
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
      preferences: options.preferences ?? this.getPreferences(),
      responsivePreferences: options.responsivePreferences ?? this.getPreferences().responsive,
      uiState: options.uiState ?? visualizationPayload.uiState,
      behaviorState: options.behaviorState ?? visualizationPayload.behaviorState,
      networkSource,
      networkData: resolvedNetworkData,
      positionData: resolvedPositionData,
      thumbnail,
      visualizationState,
    };
    const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.session, payload, {
      source: 'helios.storage',
    });
    envelope.id = id;
    envelope.payload.session.bytes = sessionStoredByteStats(envelope).bytes;
    Object.defineProperty(envelope, '_heliosSavedPositionData', {
      value: positionData != null,
      enumerable: false,
      configurable: true,
    });
    return envelope;
  }

  deserializeSessionSnapshot(snapshot = {}) {
    return migratePersistenceEnvelope(snapshot, PERSISTENCE_KINDS.session);
  }

  async captureSessionThumbnail(options = {}) {
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
      const thumbnail = {
        type: blob?.type || 'image/png',
        encoding: 'data-url',
        width: config.maxWidth,
        height: config.maxHeight,
        byteLength: bytes,
        dataUrl,
        capturedAt: this._now(),
      };
      this._recordSessionThumbnailCaptured(thumbnail);
      return thumbnail;
    } catch (error) {
      console.warn('Helios: failed to capture session thumbnail.', error);
      return null;
    }
  }

  async saveSessionSnapshot(options = {}) {
    if (!this.capabilities.sessions) return null;
    const envelope = await this.serializeSessionSnapshot(options);
    const id = envelopeSessionId(envelope);
    if (!id) return null;
    envelope.id = id;
    await this.sessionStore?.put?.(envelope);
    this.sessionSavedAt = envelopeUpdatedAt(envelope) ?? Date.now();
    this.sessionSaveError = null;
    const savedPositions = envelope._heliosSavedPositionData === true
      || (Object.prototype.hasOwnProperty.call(options, 'positionData') && options.positionData != null)
      || (options.includeNetwork !== false && options.includeCurrentPositions !== false);
    const positionsStillDirty = this.networkData?.positionsDirty === true && !savedPositions;
    this.networkData = {
      ...this.networkData,
      enabled: true,
      status: positionsStillDirty ? 'dirty' : 'saved',
      dirty: positionsStillDirty,
      positionsDirty: positionsStillDirty,
      dirtyAt: positionsStillDirty ? (this.networkData?.dirtyAt ?? this._now()) : null,
      savedAt: this.sessionSavedAt,
      format: envelope.payload?.networkData?.format ?? this.networkData.format ?? null,
    };
    const shouldActivate = options.activate === true || (this.sessionId != null && String(id) === String(this.sessionId));
    if (shouldActivate) {
      this.sessionId = String(id);
      this.explicitSessionInvalid = false;
    }
    await this.setUnfinishedSessionId(envelope.payload?.session?.unfinished === false ? null : String(id));
    this._emit('change', { reason: 'session-save', sessionId: id, status: this.persistenceStatus() });
    return envelope;
  }

  async restoreSessionSnapshot(snapshot = {}, options = {}) {
    const envelope = this.deserializeSessionSnapshot(snapshot);
    const payload = envelope?.payload ?? null;
    if (!payload?.session?.id) return null;
    if (payload.networkData?.data && this.helios?.loadNetwork) {
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
      this.helios._adoptNetworkPositionsAsLayoutBaseline?.({
        reason: options.reason ?? 'session-network-restore',
        layoutRuntimeState: payload.visualizationState?.payload?.layoutRuntimeState ?? null,
      });
    }
    let restoredPositionRuntimeState = null;
    if (payload.positionData?.data) {
      restoredPositionRuntimeState = await this._positionDataToLayoutRuntimeState(payload.positionData);
      if (restoredPositionRuntimeState && payload.visualizationState?.payload && options.restoreVisualizationState !== false && this.helios?.importVisualizationState) {
        payload.visualizationState.payload.layoutRuntimeState = mergeDeepObject(
          payload.visualizationState.payload.layoutRuntimeState ?? {},
          restoredPositionRuntimeState,
        );
      } else if (restoredPositionRuntimeState && this.helios?.restoreLayoutRuntimeState) {
        this.helios.restoreLayoutRuntimeState(restoredPositionRuntimeState, {
          reason: options.reason ?? 'session-position-restore',
          restoreRunState: options.restoreLayoutRunState !== false,
        });
      }
    }
    if (options.restoreVisualizationState !== false && payload.visualizationState && this.helios?.importVisualizationState) {
      await this.helios.importVisualizationState(payload.visualizationState, {
        ...options,
        restoreLayoutRunState: options.restoreLayoutRunState !== false,
        hydratePersistence: false,
        refreshPersistence: false,
      });
    } else if (payload.visualizationState?.payload?.storageState && options.restoreStorage !== false) {
      this.restoreSnapshot(payload.visualizationState.payload.storageState, {
        source: 'restore',
        reason: options.reason ?? 'session-restore',
      });
    }
    this.sessionId = String(payload.session.id);
    this.explicitSessionInvalid = false;
    this.sessionSavedAt = Number(payload.session.updatedAt) || Date.now();
    this.sessionSaveError = null;
    this.networkData = {
      ...this.networkData,
      enabled: true,
      status: 'saved',
      dirty: false,
      positionsDirty: false,
      dirtyAt: null,
      savedAt: this.sessionSavedAt,
      format: payload.networkData?.format ?? this.networkData.format ?? null,
    };
    const restoredAutosyncSkip = this._autosyncSizeLimitSkip({
      autosync: true,
      includeNetwork: payload.networkData?.data != null || payload.networkData?.dataRef != null,
      includePositions: payload.positionData?.data != null || payload.positionData?.dataRef != null,
    });
    if (restoredAutosyncSkip) {
      this._setAutosyncDisabled(restoredAutosyncSkip, { markDirty: false });
    }
    await this.setUnfinishedSessionId(options.markFinished === true ? null : this.sessionId);
    if (options.markFinished === true) {
      payload.session.unfinished = false;
      payload.session.status = 'restored';
      const next = createPersistenceEnvelope(PERSISTENCE_KINDS.session, payload);
      next.id = payload.session.id;
      await this.sessionStore?.put?.(next);
      return next;
    }
    return envelope;
  }

  /**
   * Serialize a visualization envelope suitable for attachment to a portable
   * network export. The envelope includes the current `storageState` snapshot.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object} [options] - Snapshot options forwarded to Helios.
   * @returns {Promise<object>} Visualization-state envelope.
   */
  async serializeNetworkSnapshot(options = {}) {
    if (!this.helios) {
      return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
        storageState: this.serializeSnapshot(options.storage ?? {}),
      }, {
        source: 'helios.storage',
      });
    }
    const layoutRuntime = {
      ...(options.layoutRuntime ?? {}),
      ...(options.includeCurrentPositions === false ? {} : { preferDelegate: true }),
    };
    const snapshotOptions = {
      ...options,
      layoutRuntime,
      storage: options.storage ?? {},
    };
    const useTrackedVisualization = options.fullVisualizationState !== true && options.trackedOnly !== false;
    if (useTrackedVisualization && (this.helios.serializeTrackedVisualizationStateAsync || this.helios.serializeTrackedVisualizationState)) {
      return await (this.helios.serializeTrackedVisualizationStateAsync?.(snapshotOptions)
        ?? this.helios.serializeTrackedVisualizationState?.(snapshotOptions));
    }
    return await (this.helios.serializeVisualizationStateAsync?.(snapshotOptions)
      ?? this.helios.serializeVisualizationState?.(snapshotOptions));
  }

  /**
   * Attach a visualization-state envelope to the active network.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {object|null} [snapshot=null] - Existing visualization envelope, or
   * `null` to capture one through storage.
   * @param {object} [options] - Attachment options.
   * @returns {Promise<unknown>} The underlying Helios attachment result.
   */
  async attachVisualizationStateToNetwork(snapshot = null, options = {}) {
    if (!this.helios?.attachVisualizationStateToNetwork) return null;
    const visualizationState = snapshot ?? await this.serializeNetworkSnapshot(options);
    return this.helios.attachVisualizationStateToNetwork(visualizationState, options);
  }

  /**
   * Save the active network with visualization state attached.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {string} [format='zxnet'] - Portable network format.
   * @param {object} [options] - Save options forwarded to Helios.
   * @returns {Promise<unknown>} Serialized network payload.
   */
  async saveNetworkSnapshot(format = 'zxnet', options = {}) {
    if (!this.helios?.savePortableNetwork) return null;
    return this.helios.savePortableNetwork(format, {
      ...options,
      trackedOnly: options.fullVisualizationState === true ? false : options.trackedOnly !== false,
      includeVisualization: options.includeVisualization !== false,
    });
  }

  /**
   * Restore a portable network snapshot through Helios network loading.
   *
   * @public
   * @apiSection Network And Persistence
   * @param {unknown} source - Network payload or file-like source.
   * @param {object} [options] - Restore options forwarded to Helios.
   * @returns {Promise<unknown>} Loaded network result.
   */
  async restoreNetworkSnapshot(source, options = {}) {
    if (!this.helios?.loadNetwork) return null;
    return this.helios.loadNetwork(source, {
      ...options,
      restoreVisualizationState: options.restoreVisualizationState !== false,
    });
  }

  restoreSnapshot(snapshot = {}, options = {}) {
    const state = snapshot?.state && typeof snapshot.state === 'object' ? snapshot.state : snapshot;
    const overrides = state?.overrides && typeof state.overrides === 'object' ? state.overrides : {};
    const restoredOverrides = options.sanitizeLegacyImplicitAppearanceOverrides === false
      ? overrides
      : sanitizeLegacyImplicitAppearanceOverrides(
        overrides,
        state?.journal,
        (key) => this.states.resolveKey(key),
        (key) => this.states.entry(key),
      );
    return this.states.restore(restoredOverrides, {
      source: options.source ?? 'restore',
      reason: options.reason ?? 'restore-snapshot',
      trackOverride: options.trackOverride ?? true,
    });
  }

  async loadSession(sessionId = this.sessionId) {
    if (!this.capabilities.sessions || !sessionId) return null;
    const record = await this.sessionStore?.get?.(sessionId);
    if (!record) {
      if (this.requestedSessionId != null && String(sessionId) === String(this.requestedSessionId)) {
        this.explicitSessionInvalid = true;
        console.warn(`[HeliosStorage] Explicit session id "${sessionId}" was not found.`);
      }
      return null;
    }
    this.explicitSessionInvalid = false;
    this.sessionId = String(sessionId);
    const restored = await this.restoreSessionSnapshot(record, { replaceUrlSession: true });
    if (this.requestedSessionId != null && String(sessionId) === String(this.requestedSessionId)) {
      this.helios?.behavior?.interface?.dismissResumePrompt?.();
      this.helios?.behaviors?.get?.('interface')?.dismissResumePrompt?.();
      if (this.helios?._pendingVisualizationUiState?.interface) {
        this.helios._pendingVisualizationUiState.interface.resumePrompt = null;
      }
    }
    return restored;
  }

  configureSession(options = {}) {
    if (
      Object.prototype.hasOwnProperty.call(options, 'autosyncPayloadLimits')
      || Object.prototype.hasOwnProperty.call(options, 'autosyncLimits')
    ) {
      this.autosyncPayloadLimits = normalizeAutosyncPayloadLimits(
        options.autosyncPayloadLimits ?? options.autosyncLimits,
      );
    }
    if (Object.prototype.hasOwnProperty.call(options, 'autosyncInteractionIdleMs')) {
      this.autosyncInteractionIdleMs = normalizeNonNegativeMs(
        options.autosyncInteractionIdleMs,
        DEFAULT_AUTOSYNC_INTERACTION_IDLE_MS,
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(options, 'sessionThumbnail')
      || Object.prototype.hasOwnProperty.call(options, 'thumbnail')
    ) {
      this.sessionThumbnail = normalizeSessionThumbnailOptions(options.sessionThumbnail ?? options.thumbnail);
    }
    const explicitId = options.id ?? options.sessionId ?? this.sessionId ?? this.requestedSessionId ?? null;
    this.urlRouting = normalizeUrlSessionRouting(options);
    if (explicitId != null && explicitId !== '') {
      this.sessionId = String(explicitId);
      this.requestedSessionId = String(explicitId);
    } else if (!this.sessionId) {
      this.sessionId = String(this.idFactory());
      this.requestedSessionId = null;
    }
    ensureSessionIdInUrl(this.sessionId, this.urlRouting);
    return {
      sessionId: this.sessionId,
      requestedSessionId: this.requestedSessionId,
      explicitSessionInvalid: this.explicitSessionInvalid,
    };
  }

  async restoreActiveSession(options = {}) {
    if (!this.capabilities.sessions) return null;
    if (options.restore === false) {
      if (options.saveInitialManifest !== false) {
        await this.saveSession({
          ...options,
          id: options.id ?? this.sessionId ?? this.requestedSessionId ?? undefined,
        });
      }
      return null;
    }
    if (this.requestedSessionId && this.sessionStore) {
      const restored = await this.loadSession(this.requestedSessionId);
      if (restored) return restored;
      if (options.saveInitialManifest !== false) {
        return this.saveSession({
          ...options,
          id: this.requestedSessionId,
          networkFormat: options.networkFormat ?? options.networkPersistence?.format,
        });
      }
      return null;
    }
    if (this.sessionId) {
      const restored = await this.loadSession(this.sessionId);
      if (restored) return restored;
      if (options.saveInitialManifest !== false) {
        return this.saveSession({
          ...options,
          id: this.sessionId,
          networkFormat: options.networkFormat ?? options.networkPersistence?.format,
        });
      }
    }
    return null;
  }

  async startNewSession(options = {}) {
    if (!this.capabilities.sessions) return null;
    const previousId = this.sessionId ?? null;
    if (options.flushPrevious !== false && previousId) {
      await this.flush({
        includeNetwork: options.includePreviousNetwork !== false,
        retention: options.preservePreviousRetention === false ? undefined : { enabled: false },
      }).catch((error) => {
        console.warn('Helios: failed to flush previous storage session before starting a new session.', error);
      });
    }
    const id = typeof options.id === 'string' && options.id.trim() ? options.id.trim() : String(this.idFactory());
    const nickname = normalizeSessionNickname(options.nickname ?? options.name ?? options.label);
    this.sessionId = id;
    this.requestedSessionId = null;
    this.explicitSessionInvalid = false;
    ensureSessionIdInUrl(id, {
      ...this.urlRouting,
      replace: options.replaceUrlSession !== false,
    });
    await this.setUnfinishedSessionId(id);
    await this.saveSession({
      ...options,
      id,
      nickname,
      activate: true,
      networkFormat: options.networkFormat ?? options.networkPersistence?.format,
    });
    return {
      id,
      previousId,
      nickname,
      status: { sessionId: this.sessionId },
    };
  }

  async saveSession(options = {}) {
    if (!this.capabilities.sessions) return null;
    const saveOptions = {
      ...options,
      fullVisualizationState: options.fullVisualizationState === true,
    };
    const saved = await this.saveSessionSnapshot(saveOptions);
    if (saved) {
      this._recordPersistenceChange('session-save', {
        id: envelopeSessionId(saved) ?? options.id ?? this.sessionId ?? null,
        reason: options.reason ?? null,
        includeNetwork: options.includeNetwork !== false,
        includePositions: options.includePositions === true,
      });
    }
    return saved;
  }

  async getSession(id) {
    if (!this.capabilities.sessions || !id) return null;
    const record = await this.sessionStore?.get?.(id);
    if (record) return this.deserializeSessionSnapshot(record);
    return null;
  }

  async listSessions(options = {}) {
    if (!this.capabilities.sessions) return [];
    const records = await this.sessionStore?.getAll?.() ?? [];
    const workspaceId = options.workspaceId ?? this.workspaceId ?? null;
    const sessions = records
      .filter((entry) => entry?.kind !== 'session-manifest'
        && entry?.kind !== 'session-network-data'
        && entry?.kind !== 'session-position-data'
        && !String(entry?.id ?? '').startsWith('helios-web:session-manifest-record:'))
      .map((entry) => this.deserializeSessionSnapshot(entry))
      .filter((entry) => {
        if (options.includeAllWorkspaces === true || workspaceId == null) return true;
        const entryWorkspace = entry?.payload?.session?.workspaceId ?? null;
        if (entryWorkspace == null) return workspaceId === 'default' || options.includeLegacySessions === true;
        return String(entryWorkspace) === String(workspaceId);
      })
      .filter((entry) => options.includeFinished === true || entry.payload.session.unfinished !== false)
      .sort((a, b) => (envelopeUpdatedAt(b) ?? 0) - (envelopeUpdatedAt(a) ?? 0));
    return Number.isFinite(options.limit)
      ? sessions.slice(0, Math.max(0, Number(options.limit)))
      : sessions;
  }

  async listSessionSummaries(options = {}) {
    if (!this.capabilities.sessions) return [];
    const currentSessionId = options.currentSessionId ?? this.sessionId ?? null;
    const sessions = await this.listSessions(options);
    return sessions.map((record) => sessionSummaryFromEnvelope(record, { currentSessionId }));
  }

  async getResumeSessions(options = {}) {
    if (!this.capabilities.sessions) return [];
    const currentSessionId = options.currentSessionId ?? this.sessionId ?? null;
    const unfinishedId = await this.getUnfinishedSessionId();
    const unfinishedRecord = unfinishedId ? await this.getSession(unfinishedId) : null;
    const summaries = await this.listSessionSummaries({
      ...options,
      includeFinished: options.includeFinished === true,
      limit: undefined,
      currentSessionId,
    });
    const filtered = summaries.filter((entry) => {
      if (!entry?.id) return false;
      if (options.excludeCurrent !== false && currentSessionId != null && String(entry.id) === String(currentSessionId)) return false;
      return entry.unfinished !== false || options.includeFinished === true;
    });
    if (
      unfinishedRecord?.payload?.session?.id
      && unfinishedRecord.payload.session.unfinished !== false
      && !filtered.some((entry) => String(entry.id) === String(unfinishedRecord.payload.session.id))
      && !(options.excludeCurrent !== false && currentSessionId != null && String(unfinishedRecord.payload.session.id) === String(currentSessionId))
    ) {
      filtered.unshift(sessionSummaryFromEnvelope(unfinishedRecord, { currentSessionId }));
    }
    return Number.isFinite(options.limit)
      ? filtered.slice(0, Math.max(0, Number(options.limit)))
      : filtered;
  }

  async getResumePrompt(options = {}) {
    if (!this.capabilities.sessions) return null;
    if (this.requestedSessionId) return null;
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
    if (!this.capabilities.sessions) return null;
    return this.loadSession(sessionId ?? this.sessionId);
  }

  async restoreSession(sessionIdOrRecord, options = {}) {
    if (!this.capabilities.sessions) return null;
    if (typeof sessionIdOrRecord === 'string') return this.loadSession(sessionIdOrRecord);
    if (sessionIdOrRecord) return this.restoreSessionSnapshot(sessionIdOrRecord, options);
    return null;
  }

  async deleteSession(id) {
    if (!this.capabilities.sessions || !id) return false;
    const nativeRecord = await this.sessionStore?.get?.(id);
    if (this.sessionStore?.delete) await this.sessionStore.delete(id);
    const unfinishedId = await this.getUnfinishedSessionId();
    if (unfinishedId != null && String(unfinishedId) === String(id)) {
      await this.setUnfinishedSessionId(null);
    }
    return Boolean(nativeRecord);
  }

  async markSessionFinished(id = this.sessionId) {
    if (!this.capabilities.sessions || !id) return null;
    const session = await this.getSession(id);
    if (!session) return null;
    session.payload.session.unfinished = false;
    session.payload.session.status = 'finished';
    const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.session, session.payload);
    envelope.id = session.payload.session.id;
    await this.sessionStore?.put?.(envelope);
    const unfinishedId = await this.getUnfinishedSessionId();
    if (unfinishedId != null && String(unfinishedId) === String(id)) await this.setUnfinishedSessionId(null);
    return envelope;
  }

  async restorePortableStateFromNetwork(options = {}) {
    const network = options.network ?? this.helios?.network ?? null;
    const attached = this.helios?.getAttachedVisualizationState?.(network) ?? null;
    if (!attached?.payload?.storageState) return null;
    this.restoreSnapshot(attached.payload.storageState, {
      source: 'restore',
      reason: options.reason ?? 'portable-network-restore',
    });
    return attached;
  }

  async flush(options = {}) {
    if (this._sessionAutosaveTimer) {
      clearTimeout(this._sessionAutosaveTimer);
      this._sessionAutosaveTimer = null;
    }
    const pending = this._sessionAutosaveOptions ?? {};
    this._sessionAutosaveOptions = null;
    const saveOptions = options.usePendingAutosaveOptions === true
      ? { ...pending, ...options }
      : { ...options };
    delete saveOptions.usePendingAutosaveOptions;
    const stateDeltas = this._consumePendingStateOverrideDeltas();
    if (
      saveOptions.incremental !== false
      && stateDeltas.size > 0
      && saveOptions.includeNetwork !== true
      && saveOptions.includePositions !== true
      && saveOptions.snapshotLayoutRuntime !== true
    ) {
      try {
        return await this._saveIncrementalSessionState({
          ...saveOptions,
          id: saveOptions.id ?? this.sessionId ?? undefined,
        }, stateDeltas);
      } catch (error) {
        this._restorePendingStateOverrideDeltas(stateDeltas);
        throw error;
      }
    }
    if (stateDeltas.size > 0) this._restorePendingStateOverrideDeltas(stateDeltas);
    return this.saveSession({
      ...saveOptions,
      id: saveOptions.id ?? this.sessionId ?? undefined,
      networkFormat: saveOptions.networkFormat ?? saveOptions.network?.format ?? saveOptions.networkPersistence?.format,
      fullVisualizationState: saveOptions.fullVisualizationState === true,
    });
  }

  async sync(options = {}) {
    return this.flush(options);
  }

  async flushAutosync(options = {}) {
    if (this._interactionAutosaveTimer) {
      clearTimeout(this._interactionAutosaveTimer);
      this._interactionAutosaveTimer = null;
    }
    this._pendingInteractionAutosaveOptions = null;
    if (this._sessionAutosaveTimer) {
      clearTimeout(this._sessionAutosaveTimer);
      this._sessionAutosaveTimer = null;
    }
    if (options.force === false && this.networkData?.dirty !== true) return this.persistenceStatus();
    const pending = this._sessionAutosaveOptions ?? {};
    return this.flush({
      ...options,
      reason: options.reason ?? 'session-autosync-flush',
      autosync: true,
      captureThumbnail: Object.prototype.hasOwnProperty.call(options, 'captureThumbnail')
        ? options.captureThumbnail
        : (pending.captureThumbnail ?? 'auto'),
      usePendingAutosaveOptions: true,
    });
  }

  destroy() {
    if (this._interactionAutosaveTimer) clearTimeout(this._interactionAutosaveTimer);
    this._pendingInteractionAutosaveOptions = null;
    if (this._sessionAutosaveTimer) clearTimeout(this._sessionAutosaveTimer);
    this._sessionAutosaveOptions = null;
    for (const cleanup of this._heliosSessionAutosaveCleanups.splice(0)) cleanup?.();
    this.states.removeEventListener('change', this._registryChange);
  }

  _emit(type, detail) {
    this.dispatchEvent(createDetailEvent(type, detail));
  }
}

export class DummyStorageManager extends HeliosStorageManager {
  constructor(options = {}) {
    super({
      ...options,
      type: 'dummy',
      persistent: false,
      sessions: false,
      network: false,
      sessionStore: null,
    });
  }
}

export class BrowserStorageManager extends HeliosStorageManager {
  constructor(options = {}) {
    const indexedDBFactory = options.sessions?.indexedDB ?? options.indexedDB ?? globalThis.indexedDB ?? null;
    const store = options.sessionStore ?? new SessionStore({
      store: options.indexedDB === false || !indexedDBFactory
        ? null
        : new IndexedDBSessionStore({ ...(options.sessions ?? {}), indexedDB: indexedDBFactory }),
      storage: options.storage ?? globalThis.localStorage ?? createMemoryStorage(),
    });
    super({
      ...options,
      type: 'browser',
      persistent: true,
      sessions: true,
      network: options.persistNetwork === true,
      sessionStore: store,
    });
    if (this.sessionId && options.restore !== false) this.ready = this.loadSession(this.sessionId);
  }
}

export class RemoteStorageManager extends HeliosStorageManager {
  constructor(options = {}) {
    const client = options.client ?? {};
    super({
      ...options,
      type: 'remote',
      persistent: true,
      sessions: true,
      network: options.persistNetwork === true,
      remote: true,
      sessionStore: new SessionStore({
        store: {
          put: (record) => client.putSession?.(record) ?? client.saveSession?.(record),
          get: (id) => client.getSession?.(id) ?? client.loadSession?.(id),
          getAll: () => client.listSessions?.() ?? [],
          delete: (id) => client.deleteSession?.(id) ?? false,
          getUnfinishedSessionId: (workspaceId) => client.getUnfinishedSessionId?.(workspaceId) ?? null,
          setUnfinishedSessionId: (id, workspaceId) => client.setUnfinishedSessionId?.(id, workspaceId) ?? (id ?? null),
        },
      }),
    });
    this.client = client;
    if (this.sessionId && options.restore !== false) this.ready = this.loadSession(this.sessionId);
  }
}

export function createHeliosStorageManager(config = undefined, context = {}) {
  if (
    config
    && typeof config === 'object'
    && (
      typeof config.persistenceStatus === 'function'
      || typeof config.saveSession === 'function'
      || typeof config.sync === 'function'
      || config.capabilities
    )
  ) {
    if (!config.helios && context.helios) config.helios = context.helios;
    return config;
  }
  if (config === false || config == null) return new DummyStorageManager(context);
  if (config === true) return new BrowserStorageManager(context);
  const options = config && typeof config === 'object' ? { ...config } : {};
  const type = String(options.type ?? options.kind ?? '').toLowerCase();
  const merged = {
    ...context,
    ...options,
    sessionId: options.sessionId ?? options.id ?? context.sessionId ?? null,
  };
  if (type === 'remote' || options.client) return new RemoteStorageManager(merged);
  if (type === 'dummy' || type === 'memory') return new DummyStorageManager(merged);
  return new BrowserStorageManager(merged);
}

export default HeliosStorageManager;
