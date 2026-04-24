const PERSISTENCE_SCHEMA = 'helios-web.persistence';
export const PERSISTENCE_SCHEMA_VERSION = 1;
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

export function createDefaultPreferencesState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    theme: typeof source.theme === 'string' ? source.theme : null,
    autosave: source.autosave === true,
    responsive: normalizeResponsivePreferences(source.responsive),
  };
}

export function createDefaultUIState(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    theme: typeof source.theme === 'string' ? source.theme : null,
    panels: source.panels && typeof source.panels === 'object' ? cloneSerializable(source.panels) : {},
    dockOrder: source.dockOrder && typeof source.dockOrder === 'object' ? cloneSerializable(source.dockOrder) : {},
    interface: source.interface && typeof source.interface === 'object' ? cloneSerializable(source.interface) : {},
  };
}

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
    cameraState: source.cameraState && typeof source.cameraState === 'object'
      ? cloneSerializable(source.cameraState)
      : (source.camera && typeof source.camera === 'object' ? cloneSerializable(source.camera) : null),
    networkSource: createDefaultNetworkSource(source.networkSource ?? source.source),
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
      unfinished: source.session?.unfinished !== false && source.unfinished !== false,
      status: typeof source.session?.status === 'string' ? source.session.status : (typeof source.status === 'string' ? source.status : 'active'),
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
    visualizationState,
  };
}

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

export function serializePersistenceEnvelope(envelope, pretty = true) {
  return JSON.stringify(migratePersistenceEnvelope(envelope, envelope?.kind ?? null), null, pretty ? 2 : 0);
}

export function parsePersistenceEnvelope(source, expectedKind = null) {
  if (typeof source === 'string') {
    return migratePersistenceEnvelope(JSON.parse(source), expectedKind);
  }
  return migratePersistenceEnvelope(source, expectedKind);
}
