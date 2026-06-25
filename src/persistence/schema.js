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
  if (ArrayBuffer.isView(value)) return Array.from(value);
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = cloneSerializable(entry);
    return next;
  }
  return value;
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

const CANONICAL_BEHAVIOR_OVERRIDE_IDS = new Set(['layout', 'legends', 'filters', 'selection', 'mappers']);

function isPathWithinPrefixes(path, prefixes) {
  const target = String(path ?? '');
  return prefixes.some((prefix) => target === prefix || target.startsWith(`${prefix}.`));
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

function normalizeOverrideMap(map = {}) {
  const next = pruneVolatileOverrides(map);
  const hasCameraPoseOverride = Object.keys(next).some((path) => isPathWithinPrefixes(path, CAMERA_POSE_OVERRIDE_PREFIXES));
  if (hasCameraPoseOverride && !Object.prototype.hasOwnProperty.call(next, 'cameraControls.autoFit')) {
    next['cameraControls.autoFit'] = false;
  }
  return next;
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

/**
 * Normalize a visualization-state payload into the current persistence shape.
 *
 * @public
 * @param {object} [value] - Partial visualization payload or legacy snapshot.
 * @returns {object} Normalized visualization state.
 */
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
    storageState: source.storageState && typeof source.storageState === 'object'
      ? cloneSerializable(source.storageState)
      : null,
  };
}

/**
 * Normalize a session payload into the current persisted session shape.
 *
 * @public
 * @param {object} [value] - Partial session payload or legacy session record.
 * @returns {object} Normalized session state with network and position records.
 */
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
        dataRef: typeof source.networkData.dataRef === 'string' ? source.networkData.dataRef : null,
        byteLength: Number.isFinite(source.networkData.byteLength) ? Number(source.networkData.byteLength) : null,
      }
      : {
        format: typeof source.networkFormat === 'string' ? source.networkFormat : 'bxnet',
        data: source.networkBytes ?? null,
        dataRef: null,
        byteLength: null,
      },
    positionData: source.positionData && typeof source.positionData === 'object'
      ? {
        schema: typeof source.positionData.schema === 'string' ? source.positionData.schema : 'helios-web.session-position-data',
        version: Number.isFinite(source.positionData.version) ? Number(source.positionData.version) : 1,
        encoding: typeof source.positionData.encoding === 'string' ? source.positionData.encoding : 'float32',
        compression: typeof source.positionData.compression === 'string' ? source.positionData.compression : 'none',
        data: source.positionData.data ?? null,
        dataRef: typeof source.positionData.dataRef === 'string' ? source.positionData.dataRef : null,
        length: Number.isFinite(source.positionData.length) ? Number(source.positionData.length) : null,
        byteLength: Number.isFinite(source.positionData.byteLength) ? Number(source.positionData.byteLength) : null,
        storedByteLength: Number.isFinite(source.positionData.storedByteLength) ? Number(source.positionData.storedByteLength) : null,
        dimension: Number.isFinite(source.positionData.dimension) ? Number(source.positionData.dimension) : 3,
        nodeCount: Number.isFinite(source.positionData.nodeCount) ? Number(source.positionData.nodeCount) : null,
        capturedAt: Number.isFinite(source.positionData.capturedAt) ? Number(source.positionData.capturedAt) : null,
        runtimeState: source.positionData.runtimeState && typeof source.positionData.runtimeState === 'object'
          ? cloneSerializable(source.positionData.runtimeState)
          : null,
      }
      : null,
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
 * portable network visualization attachments. Unknown payload fields are
 * normalized rather than passed through blindly.
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
 * Normalize a partial persistence object into the current envelope.
 *
 * @public
 * @param {object} input - Existing envelope or partial payload.
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
 * Flatten visualization state into sparse dotted override paths.
 *
 * @public
 * @param {object} source - Visualization state to flatten.
 * @returns {object} Dotted-path override map.
 */
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

/**
 * Compute sparse override differences between two flattened override maps.
 *
 * @public
 * @param {object} [base] - Baseline dotted-path values.
 * @param {object} [current] - Current dotted-path values.
 * @returns {object} Dotted paths whose values differ from the baseline.
 */
export function diffOverrideMaps(base = {}, current = {}) {
  const paths = new Set([...Object.keys(base), ...Object.keys(current)]);
  const diff = {};
  for (const path of paths) {
    if (JSON.stringify(base[path]) === JSON.stringify(current[path])) continue;
    if (Object.prototype.hasOwnProperty.call(current, path)) {
      diff[path] = cloneSerializable(current[path]);
    }
  }
  return diff;
}

/**
 * Apply sparse dotted-path overrides to a visualization state object.
 *
 * @public
 * @param {object} source - Base visualization state.
 * @param {object} [overrides] - Dotted-path override map.
 * @returns {object} Visualization state with overrides applied.
 */
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

/**
 * Serialize a persistence envelope to JSON.
 *
 * @public
 * @param {object} envelope - Envelope or partial payload to normalize first.
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
 * @param {string|object} source - JSON string, current envelope, or partial
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
