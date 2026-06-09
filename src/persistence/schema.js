const PERSISTENCE_SCHEMA = 'helios-web.persistence';
/**
 * Current schema version for Helios Web persistence envelopes.
 *
 * @public
 */
export const PERSISTENCE_SCHEMA_VERSION = 1;
/**
 * Supported persistence envelope kinds.
 *
 * @public
 * @remarks Preferences, visualization snapshots, and full sessions share the
 * same envelope shape but validate different payload structures.
 */
export const PERSISTENCE_KINDS = Object.freeze({
  preferences: 'preferences',
  visualization: 'visualization',
  session: 'session',
});

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = cloneSerializable(entry);
    return next;
  }
  return value;
}

function normalizeResponsivePreferences(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    compactDockSide: typeof source.compactDockSide === 'string' ? source.compactDockSide : null,
    preferredMode: typeof source.preferredMode === 'string' ? source.preferredMode : null,
    lastViewportClass: typeof source.lastViewportClass === 'string' ? source.lastViewportClass : null,
  };
}

/**
 * Normalize a preferences payload into the current public preference shape.
 *
 * @public
 * @param {object} [value] - Partial preferences payload.
 * @returns {object} Preferences state with theme, autosave, and responsive
 * preference fields populated.
 */
export function createDefaultPreferencesState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    theme: typeof source.theme === 'string' ? source.theme : null,
    autosave: source.autosave === true,
    responsive: normalizeResponsivePreferences(source.responsive),
  };
}

/**
 * Normalize a UI payload into the current serializable UI state shape.
 *
 * @public
 * @param {object} [value] - Partial UI state from a session or app shell.
 * @returns {object} UI state with panel, dock-order, and interface records.
 */
export function createDefaultUIState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    theme: typeof source.theme === 'string' ? source.theme : null,
    panels: source.panels && typeof source.panels === 'object' ? cloneSerializable(source.panels) : {},
    dockOrder: source.dockOrder && typeof source.dockOrder === 'object' ? cloneSerializable(source.dockOrder) : {},
    interface: source.interface && typeof source.interface === 'object' ? cloneSerializable(source.interface) : {},
  };
}

/**
 * Normalize source-network metadata stored with visualization state.
 *
 * @public
 * @param {object} [value] - Partial source metadata.
 * @returns {object} Network source metadata including name, format, counts,
 * and whether portable visualization state was attached.
 */
export function createDefaultNetworkSource(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    name: typeof source.name === 'string' ? source.name : null,
    baseName: typeof source.baseName === 'string' ? source.baseName : null,
    format: typeof source.format === 'string' ? source.format : null,
    nodeCount: Number.isFinite(source.nodeCount) ? Number(source.nodeCount) : null,
    edgeCount: Number.isFinite(source.edgeCount) ? Number(source.edgeCount) : null,
    portableVisualizationAttached: source.portableVisualizationAttached === true,
    loadedAt: Number.isFinite(source.loadedAt) ? Number(source.loadedAt) : null,
  };
}

export function normalizeVisualizationPayload(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const preferences = createDefaultPreferencesState(source.preferences);
  return {
    preferences,
    responsivePreferences: normalizeResponsivePreferences(source.responsivePreferences ?? preferences.responsive),
    uiState: createDefaultUIState(source.uiState ?? source.ui),
    behaviorState: source.behaviorState && typeof source.behaviorState === 'object'
      ? cloneSerializable(source.behaviorState)
      : (source.behaviors && typeof source.behaviors === 'object' ? cloneSerializable(source.behaviors) : {}),
    overrides: source.overrides && typeof source.overrides === 'object'
      ? cloneSerializable(source.overrides)
      : null,
    cameraState: source.cameraState && typeof source.cameraState === 'object'
      ? cloneSerializable(source.cameraState)
      : (source.camera && typeof source.camera === 'object' ? cloneSerializable(source.camera) : null),
    cameraControlState: source.cameraControlState && typeof source.cameraControlState === 'object'
      ? cloneSerializable(source.cameraControlState)
      : (source.cameraControls && typeof source.cameraControls === 'object' ? cloneSerializable(source.cameraControls) : null),
    networkSource: createDefaultNetworkSource(source.networkSource ?? source.source),
    layoutRuntimeState: source.layoutRuntimeState && typeof source.layoutRuntimeState === 'object'
      ? cloneSerializable(source.layoutRuntimeState)
      : null,
  };
}

export function normalizeSessionPayload(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const preferences = createDefaultPreferencesState(source.preferences);
  const visualizationState = migratePersistenceEnvelope(
    source.visualizationState ?? source.visualization ?? {},
    PERSISTENCE_KINDS.visualization,
  );
  return {
    session: {
      id: typeof source.session?.id === 'string' ? source.session.id : (typeof source.id === 'string' ? source.id : null),
      createdAt: Number.isFinite(source.session?.createdAt) ? Number(source.session.createdAt) : (Number.isFinite(source.createdAt) ? Number(source.createdAt) : null),
      updatedAt: Number.isFinite(source.session?.updatedAt) ? Number(source.session.updatedAt) : (Number.isFinite(source.updatedAt) ? Number(source.updatedAt) : null),
      workspaceId: typeof source.session?.workspaceId === 'string' ? source.session.workspaceId : (typeof source.workspaceId === 'string' ? source.workspaceId : null),
      nickname: typeof source.session?.nickname === 'string' ? source.session.nickname : (typeof source.nickname === 'string' ? source.nickname : null),
      unfinished: source.session?.unfinished !== false && source.unfinished !== false,
      status: typeof source.session?.status === 'string' ? source.session.status : (typeof source.status === 'string' ? source.status : 'active'),
      bytes: Number.isFinite(source.session?.bytes) ? Number(source.session.bytes) : (Number.isFinite(source.bytes) ? Number(source.bytes) : undefined),
    },
    preferences,
    responsivePreferences: normalizeResponsivePreferences(source.responsivePreferences ?? preferences.responsive),
    uiState: createDefaultUIState(source.uiState ?? source.ui),
    behaviorState: source.behaviorState && typeof source.behaviorState === 'object'
      ? cloneSerializable(source.behaviorState)
      : (source.behaviors && typeof source.behaviors === 'object' ? cloneSerializable(source.behaviors) : {}),
    networkSource: createDefaultNetworkSource(source.networkSource ?? source.source),
    networkData: source.networkData && typeof source.networkData === 'object'
      ? {
        format: typeof source.networkData.format === 'string' ? source.networkData.format : 'bxnet',
        data: source.networkData.data ?? null,
      }
      : {
        format: typeof source.networkFormat === 'string' ? source.networkFormat : 'bxnet',
        data: source.networkBytes ?? null,
      },
    thumbnail: source.thumbnail && typeof source.thumbnail === 'object'
      ? cloneSerializable(source.thumbnail)
      : null,
    visualizationState,
  };
}

/**
 * Create a versioned persistence envelope.
 *
 * @public
 * @param {string} kind - One of `preferences`, `visualization`, or `session`.
 * @param {object} payload - Payload to normalize for the selected kind.
 * @param {object} [metadata] - Caller-owned metadata copied into the envelope.
 * @returns {object} Current-schema persistence envelope.
 * @remarks Envelopes are the boundary used by Helios persistence APIs and by
 * portable network visualization attachments. Unknown or legacy payload fields
 * are normalized rather than passed through blindly.
 */
export function createPersistenceEnvelope(kind, payload, metadata = {}) {
  return {
    schema: PERSISTENCE_SCHEMA,
    version: PERSISTENCE_SCHEMA_VERSION,
    kind,
    metadata: metadata && typeof metadata === 'object' ? cloneSerializable(metadata) : {},
    payload: kind === PERSISTENCE_KINDS.preferences
      ? createDefaultPreferencesState(payload)
      : kind === PERSISTENCE_KINDS.visualization
        ? normalizeVisualizationPayload(payload)
        : normalizeSessionPayload(payload),
  };
}

function migratePreferencesPayloadV0(value) {
  return createDefaultPreferencesState(value);
}

function migrateVisualizationPayloadV0(value) {
  return normalizeVisualizationPayload(value);
}

function migrateSessionPayloadV0(value) {
  return normalizeSessionPayload(value);
}

/**
 * Migrate a legacy or partial persistence object into the current envelope.
 *
 * @public
 * @param {object} input - Existing envelope or legacy payload.
 * @param {string|null} [expectedKind] - Kind to enforce during migration.
 * @returns {object} Current-schema envelope.
 */
export function migratePersistenceEnvelope(input, expectedKind = null) {
  const source = input && typeof input === 'object' ? input : {};
  const kind = expectedKind ?? source.kind ?? PERSISTENCE_KINDS.visualization;

  if (source.schema === PERSISTENCE_SCHEMA && Number(source.version) === PERSISTENCE_SCHEMA_VERSION) {
    return createPersistenceEnvelope(kind, source.payload, source.metadata);
  }

  const version = Number.isFinite(source.version) ? Number(source.version) : 0;
  const payload = source.schema === PERSISTENCE_SCHEMA ? source.payload : source;
  if (kind === PERSISTENCE_KINDS.preferences) {
    if (version <= 0) return createPersistenceEnvelope(kind, migratePreferencesPayloadV0(payload), source.metadata);
  }
  if (kind === PERSISTENCE_KINDS.visualization) {
    if (version <= 0) return createPersistenceEnvelope(kind, migrateVisualizationPayloadV0(payload), source.metadata);
  }
  if (kind === PERSISTENCE_KINDS.session) {
    if (version <= 0) return createPersistenceEnvelope(kind, migrateSessionPayloadV0(payload), source.metadata);
  }

  return createPersistenceEnvelope(kind, payload, source.metadata);
}

/**
 * Serialize a persistence envelope to JSON.
 *
 * @public
 * @param {object} envelope - Envelope or legacy payload to migrate first.
 * @param {boolean} [pretty=true] - Whether to emit indented JSON.
 * @returns {string} Stable JSON string.
 */
export function serializePersistenceEnvelope(envelope, pretty = true) {
  return JSON.stringify(migratePersistenceEnvelope(envelope, envelope?.kind ?? null), null, pretty ? 2 : 0);
}

/**
 * Parse and migrate persistence input.
 *
 * @public
 * @param {string|object} source - JSON string, current envelope, or legacy
 * payload object.
 * @param {string|null} [expectedKind] - Optional kind to validate/migrate to.
 * @returns {object} Current-schema envelope.
 */
export function parsePersistenceEnvelope(source, expectedKind = null) {
  if (typeof source === 'string') {
    return migratePersistenceEnvelope(JSON.parse(source), expectedKind);
  }
  return migratePersistenceEnvelope(source, expectedKind);
}
