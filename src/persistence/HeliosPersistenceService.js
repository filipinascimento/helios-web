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
import { HeliosSessionController } from './HeliosSessionController.js';

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = cloneSerializable(entry);
    return next;
  }
  return value;
}

function defaultIdFactory() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `helios-session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

  async importVisualizationState(source, options = {}) {
    if (!this.helios || typeof this.helios.importVisualizationState !== 'function') {
      throw new Error('Persistence service requires a Helios instance to import visualization state');
    }
    const envelope = parsePersistenceEnvelope(source, PERSISTENCE_KINDS.visualization);
    await this.helios.importVisualizationState(envelope, options);
    return envelope;
  }

  configureSession(options = {}) {
    if (!this.sessionController) {
      this.sessionController = new HeliosSessionController({
        helios: this.helios,
        persistence: this,
        sessionStore: this.sessionStore,
        now: this.now,
        ...(options.controllerOptions ?? {}),
      });
    }
    if (this.sessionController.sessionId) return this.sessionController.updateConfig(options);
    return this.sessionController.configure(options);
  }

  getOverrides() {
    return this.sessionController?.getOverrides?.() ?? {};
  }

  getDirtyState() {
    return this.sessionController?.getDirtyState?.() ?? { controls: {}, sections: {}, panels: {} };
  }

  getChangeJournal(options = {}) {
    return this.sessionController?.getChangeJournal?.(options) ?? [];
  }

  checkpoint(seq = null) {
    return this.sessionController?.checkpoint?.(seq) ?? { checkpointSeq: 0 };
  }

  resetOverride(pathOrScope) {
    return this.sessionController?.resetOverride?.(pathOrScope) ?? Promise.resolve({ reset: false, overrides: {} });
  }

  flush(options = {}) {
    return this.sessionController?.flush?.(options) ?? Promise.resolve(null);
  }

  persistenceStatus() {
    return this.sessionController?.status?.() ?? null;
  }

  recordSessionChange(detail = {}) {
    return this.sessionController?.recordSnapshotChange?.(detail) ?? [];
  }

  setSessionOverride(path, value, detail = {}) {
    return this.sessionController?.setOverride?.(path, value, detail) ?? [];
  }

  runWithSessionSource(source, fn) {
    if (this.sessionController?.runWithSource) return this.sessionController.runWithSource(source, fn);
    return Promise.resolve().then(fn);
  }

  async saveSession(options = {}) {
    if (!this.helios) throw new Error('Persistence service requires a Helios instance to save sessions');
    const id = typeof options.id === 'string' && options.id.trim() ? options.id.trim() : this.idFactory();
    const createdAt = Number.isFinite(options.createdAt) ? Number(options.createdAt) : this.now();
    const updatedAt = Number.isFinite(options.updatedAt) ? Number(options.updatedAt) : this.now();
    const networkFormat = typeof options.networkFormat === 'string' ? options.networkFormat : 'bxnet';
    const networkData = options.networkData ?? await this.helios.savePortableNetwork(networkFormat, {
      includeVisualization: false,
      output: 'uint8array',
    });
    const visualizationState = options.visualizationState ?? this.exportVisualizationState({ format: 'object' });
    const visualizationPayload = migratePersistenceEnvelope(visualizationState, PERSISTENCE_KINDS.visualization).payload;
    const payload = {
      session: {
        id,
        createdAt,
        updatedAt,
        unfinished: options.unfinished !== false,
        status: options.status ?? 'active',
      },
      preferences: options.preferences ?? this.preferences,
      responsivePreferences: options.responsivePreferences ?? this.preferences?.responsive,
      uiState: options.uiState ?? visualizationPayload.uiState,
      behaviorState: options.behaviorState ?? visualizationPayload.behaviorState,
      networkSource: options.networkSource ?? visualizationPayload.networkSource,
      networkData: {
        format: networkFormat,
        data: networkData,
      },
      visualizationState,
    };
    const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.session, payload);
    envelope.id = id;
    await this.sessionStore.put(envelope);
    if (envelope.payload.session.unfinished) {
      await this.preferenceStore.setUnfinishedSessionId(id);
    }
    return envelope;
  }

  async getSession(id) {
    const stored = await this.sessionStore.get(id);
    return stored ? migratePersistenceEnvelope(stored, PERSISTENCE_KINDS.session) : null;
  }

  async listSessions(options = {}) {
    const records = await this.sessionStore.getAll();
    const sessions = records
      .map((entry) => migratePersistenceEnvelope(entry, PERSISTENCE_KINDS.session))
      .filter((entry) => options.includeFinished === true || entry.payload.session.unfinished !== false)
      .sort((a, b) => (b.payload.session.updatedAt ?? 0) - (a.payload.session.updatedAt ?? 0));
    if (Number.isFinite(options.limit)) {
      return sessions.slice(0, Math.max(0, Number(options.limit)));
    }
    return sessions;
  }

  async getRestorableSession() {
    const unfinishedId = await this.preferenceStore.getUnfinishedSessionId();
    if (unfinishedId) {
      const stored = await this.getSession(unfinishedId);
      if (stored?.payload?.session?.unfinished !== false) return stored;
    }
    const [latest] = await this.listSessions({ includeFinished: false, limit: 1 });
    return latest ?? null;
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
      keepCamera: false,
      restoreVisualizationState: false,
      allowDuringInitialize: true,
    });
    if (options.restoreVisualizationState !== false) {
      await this.helios.importVisualizationState(payload.visualizationState, options);
    }
    if (options.restoreOverrides !== false && this.sessionController?.restore) {
      await this.sessionController.restore(payload.session.id, { ...options, applyNetwork: false });
    }
    this.preferences = createDefaultPreferencesState(payload.preferences);
    await this.savePreferences(this.preferences);
    if (options.markFinished === true) {
      payload.session.unfinished = false;
      payload.session.status = 'restored';
      const next = createPersistenceEnvelope(PERSISTENCE_KINDS.session, payload);
      next.id = payload.session.id;
      await this.sessionStore.put(next);
      await this.preferenceStore.setUnfinishedSessionId(null);
      return next;
    }
    await this.preferenceStore.setUnfinishedSessionId(payload.session.id);
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
    const currentUnfinished = await this.preferenceStore.getUnfinishedSessionId();
    if (currentUnfinished === id) {
      await this.preferenceStore.setUnfinishedSessionId(null);
    }
    return envelope;
  }

  async deleteSession(id) {
    await this.sessionStore.delete(id);
    const currentUnfinished = await this.preferenceStore.getUnfinishedSessionId();
    if (currentUnfinished === id) {
      await this.preferenceStore.setUnfinishedSessionId(null);
    }
    return true;
  }
}

export default HeliosPersistenceService;
