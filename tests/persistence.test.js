import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork, { AttributeType } from 'helios-network';
import { Helios } from '../src/index.js';
import {
  BehaviorManager,
  createDefaultBehaviorRegistry,
} from '../src/behaviors/index.js';
import {
  HeliosPersistenceService,
  HeliosSessionController,
  LocalStoragePreferenceStore,
  IndexedDBSessionStore,
  PERSISTENCE_KINDS,
  applyOverridesToVisualizationState,
  diffOverrideMaps,
  flattenVisualizationOverrides,
  createMemoryIndexedDBFactory,
  createMemoryStorage,
  createPersistenceEnvelope,
  migratePersistenceEnvelope,
  parsePersistenceEnvelope,
} from '../src/persistence/index.js';

class MockHelios extends EventTarget {
  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  emit(type, detail) {
    const event = new Event(type);
    event.detail = detail;
    this.dispatchEvent(event);
  }
}

class FakeHelios extends MockHelios {
  constructor() {
    super();
    this.loaded = [];
    this.importedVisualization = [];
    this.serializationOptions = [];
    this.layoutRuntimeState = {
      schema: 'helios-web.layout-runtime-state',
      version: 1,
      layoutState: 'running',
      alpha: 0.025,
      positions: {
        encoding: 'float32-base64',
        length: 0,
        byteLength: 0,
        data: '',
      },
    };
    this.restoredLayoutRuntime = [];
    this.currentBehaviorState = {
      selection: { options: { nodeClick: true }, selectedNodes: [1, 3] },
      hover: { options: { hoverLabel: true } },
    };
    this.cameraState = {
      zoom: 3,
      viewport: { width: 640, height: 480, devicePixelRatio: 1 },
    };
  }

  serializeVisualizationState(options = {}) {
    this.serializationOptions.push(options);
    const layoutRuntimeState = options.layoutRuntime?.includePositions === false
      ? { ...this.layoutRuntimeState, positions: null }
      : this.layoutRuntimeState;
    return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      preferences: options.preferences ?? { autosave: true, responsive: { compactDockSide: 'left' } },
      uiState: {
        theme: 'dark',
        panels: {
          scene: { dock: 'left', collapsed: false },
        },
        dockOrder: { left: ['scene'], right: [] },
      },
      behaviorState: this.currentBehaviorState,
      cameraState: this.cameraState,
      networkSource: { name: 'demo.xnet', format: 'xnet', nodeCount: 4, edgeCount: 2 },
      layoutRuntimeState,
    });
  }

  async importVisualizationState(source, options = {}) {
    const envelope = parsePersistenceEnvelope(source, PERSISTENCE_KINDS.visualization);
    this.importedVisualization.push({ envelope, options });
    this.currentBehaviorState = envelope.payload.behaviorState ?? this.currentBehaviorState;
    return envelope;
  }

  snapshotLayoutRuntimeState() {
    return this.layoutRuntimeState;
  }

  async snapshotLayoutRuntimeStateAsync() {
    return this.layoutRuntimeState;
  }

  restoreLayoutRuntimeState(state, options = {}) {
    this.restoredLayoutRuntime.push({ state, options });
    this.layoutRuntimeState = state;
    return true;
  }

  async savePortableNetwork(format, options = {}) {
    this.lastSave = { format, options };
    return Uint8Array.from([1, 2, 3, 4]);
  }

  async loadNetwork(data, options = {}) {
    this.loaded.push({ data, options });
    return { data, options };
  }
}

class DirectResetHelios extends FakeHelios {
  constructor() {
    super();
    this.behaviorUpdates = [];
    this.behaviors = {
      get: (id) => {
        if (id !== 'selection') return null;
        return {
          update: (patch) => {
            this.behaviorUpdates.push({ id, patch });
            this.currentBehaviorState.selection = {
              ...(this.currentBehaviorState.selection ?? {}),
              options: {
                ...(this.currentBehaviorState.selection?.options ?? {}),
                ...patch,
              },
            };
          },
        };
      },
    };
  }
}

function encodeFloat32Base64(values) {
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength).toString('base64');
}

function decodeFloat32Base64(value) {
  const bytes = Buffer.from(value, 'base64');
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

test('persistence schema migrates legacy visualization payloads to the current version', () => {
  const legacy = {
    version: 0,
    behaviors: {
      selection: { selectedNodes: [2] },
      labels: { options: { enabled: true, maxVisible: 12 } },
    },
    ui: {
      theme: 'light',
      panels: {
        scene: { dock: 'left', collapsed: false },
      },
    },
    camera: { zoom: 2 },
    source: { format: 'xnet', name: 'legacy.xnet' },
  };

  const migrated = migratePersistenceEnvelope(legacy, PERSISTENCE_KINDS.visualization);
  assert.equal(migrated.version, 1);
  assert.equal(migrated.kind, PERSISTENCE_KINDS.visualization);
  assert.deepEqual(migrated.payload.behaviorState.selection.selectedNodes, [2]);
  assert.equal(migrated.payload.uiState.theme, 'light');
  assert.equal(migrated.payload.cameraState.zoom, 2);
  assert.equal(migrated.payload.networkSource.format, 'xnet');
});

test('local preference persistence stores small preferences without cookies', async () => {
  const storage = createMemoryStorage();
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });

  await service.updatePreferences({
    theme: 'light',
    autosave: true,
    responsive: { compactDockSide: 'right' },
  });

  const reloaded = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  const preferences = await reloaded.loadPreferences();
  assert.equal(preferences.theme, 'light');
  assert.equal(preferences.autosave, true);
  assert.equal(preferences.responsive.compactDockSide, 'right');
});

test('behavior state round-trips cleanly through the persistence visualization envelope', () => {
  const registry = createDefaultBehaviorRegistry();
  const manager = new BehaviorManager(new MockHelios(), registry);
  manager.use('labels', { enabled: true, maxVisible: 18 });
  manager.use('legends', { enabled: true, titles: { nodeColor: 'Node Color' } });
  manager.use('mappers', {
    node: {
      channels: {
        color: { type: 'colormap', attributes: '$index', colormap: 'interpolateInferno', domain: [0, 3] },
      },
    },
  });
  manager.use('filters', {
    id: 'render-filter',
    name: 'Render Filter',
    scope: 'render',
    rules: [{ id: 'weight', scope: 'node', type: 'numeric', attribute: 'weight', min: 0.1, max: 1 }],
  });
  manager.use('selection', { nodeClick: false }).state.selectedNodes.add(5);
  manager.use('hover', { hoverLabel: false });
  manager.use('appearance', { background: '#112233ff' });
  manager.use('exporter', { baseName: 'figure' });
  manager.use('layout', { layoutType: 'static', positionAttribute: 'position' });

  const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    behaviorState: manager.serialize(),
  });

  const nextManager = new BehaviorManager(new MockHelios(), registry);
  nextManager.restore(envelope.payload.behaviorState);

  assert.equal(nextManager.get('labels').state.maxVisible, 18);
  assert.equal(nextManager.get('legends').state.titles.nodeColor, 'Node Color');
  assert.equal(nextManager.get('selection').state.nodeClick, false);
  assert.deepEqual(Array.from(nextManager.get('selection').state.selectedNodes), [5]);
  assert.equal(nextManager.get('hover').state.hoverLabel, false);
  assert.equal(nextManager.get('appearance').serialize().options.background, '#112233ff');
  assert.equal(nextManager.get('exporter').baseName(), 'figure');
});

test('indexeddb-backed session persistence saves and restores unfinished local sessions', async () => {
  const storage = createMemoryStorage();
  const indexedDB = createMemoryIndexedDBFactory();
  const preferenceStore = new LocalStoragePreferenceStore({ storage });
  const sessionStore = new IndexedDBSessionStore({ indexedDB });
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore,
    sessionStore,
    idFactory: () => 'session-1',
    now: () => 1234,
  });

  await service.updatePreferences({
    autosave: true,
    responsive: { compactDockSide: 'left' },
  });

  const saved = await service.saveSession({ networkFormat: 'zxnet', unfinished: true });
  assert.equal(saved.payload.networkData.format, 'zxnet');

  const persisted = await sessionStore.get('session-1');
  assert.ok(persisted);

  const restoringService = new HeliosPersistenceService({
    helios,
    preferenceStore,
    sessionStore,
  });
  const restored = await restoringService.restoreUnfinishedSession();
  assert.equal(restored.payload.session.id, 'session-1');
  assert.equal(helios.loaded.length, 1);
  assert.equal(helios.loaded[0].options.format, 'zxnet');
  assert.equal(helios.importedVisualization.length, 1);
  assert.equal(helios.importedVisualization[0].envelope.payload.uiState.theme, 'dark');
});

test('session persistence stores sparse overrides and supports checkpoint/reset', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
    now: () => 1000,
  });
  service.configureSession({
    id: 'session-overrides',
    restore: false,
    controllerOptions: { storage },
  });

  const baselineMap = flattenVisualizationOverrides(helios.serializeVisualizationState());
  assert.equal(baselineMap['selection.nodeClick'], true);
  assert.equal(baselineMap['camera.zoom'], 3);
  assert.equal(baselineMap['cameraControls.autoFit'], undefined);
  assert.equal(baselineMap['camera.viewport.width'], undefined);

  helios.currentBehaviorState = {
    ...helios.currentBehaviorState,
    selection: { options: { nodeClick: false }, selectedNodes: [1, 3] },
    appearance: { options: { nodeStyle: { sizeScale: 2 } } },
  };
  const entries = service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'test-change',
  });

  assert.ok(entries.length >= 2);
  assert.deepEqual(service.getOverrides()['selection.nodeClick'], false);
  assert.equal(service.getOverrides()['appearance.nodeStyle.sizeScale'], 2);
  assert.equal(service.getDirtyState().controls['appearance.nodeStyle.sizeScale'], 'changed');
  assert.deepEqual(
    diffOverrideMaps(baselineMap, flattenVisualizationOverrides(helios.serializeVisualizationState()))['appearance.nodeStyle.sizeScale'],
    2,
  );

  const checkpoint = service.checkpoint();
  assert.ok(checkpoint.checkpointSeq > 0);
  assert.deepEqual(service.getChangeJournal({ sinceCheckpoint: true }), []);

  await service.resetOverride('appearance.nodeStyle');
  assert.equal(service.getOverrides()['appearance.nodeStyle.sizeScale'], undefined);
  assert.equal(service.getDirtyState().controls['appearance.nodeStyle.sizeScale'], undefined);
  assert.equal(helios.currentBehaviorState.appearance, undefined);
});

test('session override tracking skips layout position snapshots', () => {
  const helios = new FakeHelios();
  const controller = new HeliosSessionController({
    helios,
    storage: createMemoryStorage(),
    now: () => 1000,
  });
  controller.configure({
    id: 'skip-layout-position-tracking',
    restore: false,
    autosave: false,
  });

  assert.equal(helios.serializationOptions.at(-1)?.layoutRuntime?.includePositions, false);
  assert.equal(controller.baseline.payload.layoutRuntimeState.positions, null);

  helios.currentBehaviorState = {
    ...helios.currentBehaviorState,
    appearance: { options: { nodeStyle: { sizeScale: 1.7 } } },
  };
  const entries = controller.recordCurrentState({
    source: 'user',
    reason: 'command',
    behavior: 'appearance',
  });

  assert.ok(entries.length >= 1);
  assert.equal(helios.serializationOptions.at(-1)?.layoutRuntime?.includePositions, false);
  assert.equal(controller.getOverrides()['appearance.nodeStyle.sizeScale'], 1.7);
});

test('camera viewport is not stored or restored as a sparse override', () => {
  const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    cameraState: {
      mode: '3d',
      zoom: 2,
      viewport: { width: 999, height: 777, devicePixelRatio: 2 },
    },
  });

  const flattened = flattenVisualizationOverrides(envelope);
  assert.equal(flattened['camera.zoom'], 2);
  assert.equal(flattened['camera.viewport.width'], undefined);
  assert.equal(flattened['camera.viewport.devicePixelRatio'], undefined);

  const restored = applyOverridesToVisualizationState(envelope, {
    'camera.zoom': 4,
    'camera.viewport.width': 123,
    'camera.viewport.height': 456,
  });

  assert.equal(restored.payload.cameraState.zoom, 4);
  assert.equal(restored.payload.cameraControlState.autoFit, false);
  assert.deepEqual(restored.payload.cameraState.viewport, { width: 999, height: 777, devicePixelRatio: 2 });
});

test('scoped behavior changes preserve existing camera overrides', () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'scoped-behavior-camera',
    restore: false,
    controllerOptions: { storage },
  });

  helios.cameraState = {
    ...helios.cameraState,
    zoom: 4,
    pan2D: [120, -80, 0],
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'camera',
  });
  assert.equal(service.getOverrides()['camera.zoom'], 4);
  assert.deepEqual(service.getOverrides()['camera.pan2D'], [120, -80, 0]);
  assert.equal(service.getOverrides()['cameraControls.autoFit'], false);

  helios.cameraState = { zoom: 3 };
  helios.currentBehaviorState = {
    ...helios.currentBehaviorState,
    appearance: { options: { nodeStyle: { sizeScale: 2.8 } } },
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'command',
    behavior: 'appearance',
  });

  assert.equal(service.getOverrides()['appearance.nodeStyle.sizeScale'], 2.8);
  assert.equal(service.getOverrides()['camera.zoom'], 4);
  assert.deepEqual(service.getOverrides()['camera.pan2D'], [120, -80, 0]);
  assert.equal(service.getOverrides()['cameraControls.autoFit'], false);
});

test('scoped camera changes preserve unchanged camera overrides', () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'scoped-camera-unchanged-zoom',
    restore: false,
    controllerOptions: { storage },
  });

  helios.cameraState = {
    ...helios.cameraState,
    zoom: 4,
    pan2D: [120, -80, 0],
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'camera',
  });
  assert.equal(service.getOverrides()['camera.zoom'], 4);

  service.sessionController.baselineMap['camera.zoom'] = 4;
  helios.cameraState = {
    ...helios.cameraState,
    zoom: 4,
    pan2D: [180, -120, 0],
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'camera',
  });

  assert.equal(service.getOverrides()['camera.zoom'], 4);
  assert.deepEqual(service.getOverrides()['camera.pan2D'], [180, -120, 0]);
  assert.equal(service.getOverrides()['cameraControls.autoFit'], false);
});

test('unscoped lifecycle snapshots preserve unrelated tracked overrides', () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'lifecycle-preserves-size',
    restore: false,
    controllerOptions: { storage },
  });

  helios.currentBehaviorState = {
    ...helios.currentBehaviorState,
    appearance: { options: { nodeStyle: { sizeScale: 2.4 } } },
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'command',
    behavior: 'appearance',
  });
  assert.equal(service.getOverrides()['appearance.nodeStyle.sizeScale'], 2.4);

  service.sessionController.captureBaseline();
  helios.cameraState = {
    ...helios.cameraState,
    pan2D: [240, -160, 0],
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'lifecycle-flush',
  });

  assert.equal(service.getOverrides()['appearance.nodeStyle.sizeScale'], 2.4);
  assert.deepEqual(service.getOverrides()['camera.pan2D'], [240, -160, 0]);
  assert.equal(service.getOverrides()['cameraControls.autoFit'], false);
});

test('manual camera pan persists current zoom with auto fit disabled', () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'camera-pan-persists-zoom',
    restore: false,
    controllerOptions: { storage },
  });

  service.sessionController.captureBaseline();
  service.sessionController.baselineMap['camera.zoom'] = 2.25;
  helios.cameraState = {
    ...helios.cameraState,
    zoom: 2.25,
    pan2D: [80, -40, 0],
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'camera',
  });

  assert.equal(service.getOverrides()['camera.zoom'], 2.25);
  assert.deepEqual(service.getOverrides()['camera.pan2D'], [80, -40, 0]);
  assert.equal(service.getOverrides()['cameraControls.autoFit'], false);
});

test('manual camera pose overrides imply auto fit disabled on restore', async () => {
  const storage = createMemoryStorage();
  storage.setItem('helios-web:session-manifest:legacy-camera-pan', JSON.stringify({
    schema: 'helios-web.session-manifest',
    version: 1,
    sessionId: 'legacy-camera-pan',
    updatedAt: 1000,
    overrides: { 'camera.pan2D.0': 120, 'camera.pan2D.1': -80 },
    dirtyState: { controls: {}, sections: {}, panels: {} },
    journal: [],
    checkpointSeq: 0,
    networkPersistence: { enabled: false },
    networkData: { enabled: false, status: 'idle' },
    layoutRuntimeState: null,
  }));

  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'legacy-camera-pan',
    controllerOptions: { storage },
  });
  await service.sessionController.ready();

  assert.equal(service.getOverrides()['camera.pan2D.0'], 120);
  assert.equal(service.getOverrides()['cameraControls.autoFit'], false);
  assert.equal(helios.importedVisualization.at(-1).envelope.payload.cameraState.pan2D[0], 120);
  assert.equal(helios.importedVisualization.at(-1).envelope.payload.cameraControlState.autoFit, false);
  assert.equal(service.getDirtyState().controls['cameraControls.autoFit'], 'changed');
});

test('single behavior override reset updates only that behavior path', async () => {
  const storage = createMemoryStorage();
  const helios = new DirectResetHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'direct-reset',
    restore: false,
    controllerOptions: { storage },
  });

  helios.currentBehaviorState = {
    ...helios.currentBehaviorState,
    selection: { options: { nodeClick: false }, selectedNodes: [1, 3] },
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'manual-selection',
  });

  assert.equal(service.getOverrides()['selection.nodeClick'], false);
  await service.resetOverride('selection.nodeClick');

  assert.equal(service.getOverrides()['selection.nodeClick'], undefined);
  assert.equal(helios.currentBehaviorState.selection.options.nodeClick, true);
  assert.deepEqual(helios.behaviorUpdates, [{ id: 'selection', patch: { nodeClick: true } }]);
  assert.equal(helios.importedVisualization.length, 0);
});

test('ui override reset does not restore layout runtime state', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const uiRestores = [];
  helios.behaviors = {
    ui: {
      restoreState(state, options = {}) {
        uiRestores.push({ state, options });
      },
    },
  };
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'theme-reset-no-layout-restore',
    restore: false,
    controllerOptions: { storage },
  });

  const before = helios.serializeVisualizationState();
  helios.serializeVisualizationState = () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    preferences: { autosave: true },
    uiState: { theme: 'light', panels: {}, dockOrder: {}, interface: {} },
    behaviorState: helios.currentBehaviorState,
    cameraState: helios.cameraState,
    networkSource: { name: 'demo.xnet', format: 'xnet', nodeCount: 4, edgeCount: 2 },
    layoutRuntimeState: helios.layoutRuntimeState,
  });
  service.recordSessionChange({
    before,
    after: helios.serializeVisualizationState(),
    source: 'user',
    reason: 'theme',
  });

  assert.equal(service.getOverrides()['ui.theme'], 'light');
  await service.resetOverride('ui.theme');

  assert.equal(service.getOverrides()['ui.theme'], undefined);
  assert.equal(helios.importedVisualization.length, 0);
  assert.deepEqual(uiRestores, [{ state: { theme: 'dark' }, options: { reason: 'override-reset-path' } }]);
  assert.equal(helios.restoredLayoutRuntime.length, 0);
});

test('session persistence restores sparse local overrides by session id', async () => {
  const storage = createMemoryStorage();
  const sessionStore = new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() });
  const firstHelios = new FakeHelios();
  const firstService = new HeliosPersistenceService({
    helios: firstHelios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore,
    now: () => 1000,
  });
  firstService.configureSession({
    id: 'reload-size-scale',
    restore: false,
    controllerOptions: { storage },
  });

  firstHelios.currentBehaviorState = {
    ...firstHelios.currentBehaviorState,
    appearance: { options: { nodeStyle: { sizeScale: 2.25 } } },
  };
  firstHelios.layoutRuntimeState = {
    schema: 'helios-web.layout-runtime-state',
    version: 1,
    layoutState: 'idle',
    running: false,
    alpha: 0.0042,
    nodeCount: 4,
    positions: {
      encoding: 'float32-base64',
      length: 12,
      byteLength: 48,
      data: 'AAAAAAAAAAAAAAAAAACAPwAAgD8AAIA/AABAQAAAQEAAAEBAAACAQAAAgEAAAIBA',
    },
  };
  firstService.recordSessionChange({
    after: firstHelios.serializeVisualizationState(),
    source: 'user',
    reason: 'manual-size-scale',
  });
  await firstService.flush();

  const secondHelios = new FakeHelios();
  const secondService = new HeliosPersistenceService({
    helios: secondHelios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore,
  });
  secondService.configureSession({
    id: 'reload-size-scale',
    controllerOptions: { storage },
  });
  await secondService.sessionController.ready();

  assert.equal(secondService.getOverrides()['appearance.nodeStyle.sizeScale'], 2.25);
  assert.equal(secondHelios.currentBehaviorState.appearance.options.nodeStyle.sizeScale, 2.25);
  assert.equal(secondService.getDirtyState().controls['appearance.nodeStyle.sizeScale'], 'changed');
  assert.equal(secondHelios.restoredLayoutRuntime.length, 1);
  assert.equal(secondHelios.restoredLayoutRuntime[0].state.alpha, 0.0042);
  assert.equal(secondHelios.restoredLayoutRuntime[0].state.layoutState, 'idle');
});

test('session restore suppresses transient camera events before they become overrides', async () => {
  const storage = createMemoryStorage();
  const firstHelios = new FakeHelios();
  const firstService = new HeliosPersistenceService({
    helios: firstHelios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  firstService.configureSession({
    id: 'restore-camera-suppression',
    restore: false,
    controllerOptions: { storage },
  });

  firstHelios.currentBehaviorState = {
    ...firstHelios.currentBehaviorState,
    appearance: { options: { nodeStyle: { sizeScale: 2.25 } } },
  };
  firstService.recordSessionChange({
    after: firstHelios.serializeVisualizationState(),
    source: 'user',
    reason: 'manual-size-scale',
  });
  await firstService.flush();

  const secondHelios = new FakeHelios();
  const secondService = new HeliosPersistenceService({
    helios: secondHelios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  secondService.configureSession({
    id: 'restore-camera-suppression',
    controllerOptions: { storage },
  });
  await secondService.sessionController.ready();

  secondHelios.cameraState = { zoom: 9, viewport: { width: 100, height: 100, devicePixelRatio: 2 } };
  secondHelios.emit('camera:move', { reason: 'restore-renderer-update' });
  await new Promise((resolve) => { setTimeout(resolve, 320); });

  assert.equal(secondService.getOverrides()['appearance.nodeStyle.sizeScale'], 2.25);
  assert.equal(secondService.getOverrides()['camera.zoom'], undefined);
  assert.equal(secondService.getDirtyState().controls['appearance.nodeStyle.sizeScale'], 'changed');
});

test('explicit control changes during restore suppression are still tracked', async () => {
  const storage = createMemoryStorage();
  storage.setItem('helios-web:session-manifest:restore-explicit-change', JSON.stringify({
    schema: 'helios-web.session-manifest',
    version: 1,
    sessionId: 'restore-explicit-change',
    updatedAt: 1000,
    overrides: { 'appearance.nodeStyle.sizeScale': 2 },
    dirtyState: { controls: {}, sections: {}, panels: {} },
    journal: [],
    checkpointSeq: 0,
    networkPersistence: { enabled: false },
    networkData: { enabled: false, status: 'idle' },
    layoutRuntimeState: null,
  }));

  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'restore-explicit-change',
    controllerOptions: { storage },
  });
  await service.sessionController.ready();

  helios.currentBehaviorState = {
    ...helios.currentBehaviorState,
    appearance: { options: { nodeStyle: { sizeScale: 2.6 } } },
  };
  service.recordSessionChange({
    after: helios.serializeVisualizationState(),
    source: 'cli',
    reason: 'cli-rpc',
    behavior: 'appearance',
  });

  assert.equal(service.getOverrides()['appearance.nodeStyle.sizeScale'], 2.6);
  assert.equal(service.getChangeJournal().at(-1).newValue, 2.6);
  assert.equal(service.getDirtyState().controls['appearance.nodeStyle.sizeScale'], 'changed');
});

test('session camera listener records manual camera moves only', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'manual-camera-events',
    restore: false,
    controllerOptions: { storage },
  });

  helios.cameraState = { zoom: 5 };
  helios.emit('camera:move', { origin: null, reason: 'auto-fit' });
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(service.getOverrides()['camera.zoom'], undefined);

  helios.emit('camera:move', { origin: 'interaction', action: 'zoom' });
  await new Promise((resolve) => { setTimeout(resolve, 300); });
  assert.equal(service.getOverrides()['camera.zoom'], 5);
  assert.equal(service.getDirtyState().controls['camera.zoom'], 'changed');
});

test('session lifecycle flush waits until initial restore is complete', async () => {
  const storage = createMemoryStorage();
  const listeners = new Map();
  const previousAdd = globalThis.addEventListener;
  const previousRemove = globalThis.removeEventListener;
  globalThis.addEventListener = (type, handler) => listeners.set(type, handler);
  globalThis.removeEventListener = (type, handler) => {
    if (listeners.get(type) === handler) listeners.delete(type);
  };
  try {
    storage.setItem('helios-web:session-manifest:fast-reload', JSON.stringify({
      schema: 'helios-web.session-manifest',
      version: 1,
      sessionId: 'fast-reload',
      updatedAt: 1000,
      overrides: { 'appearance.nodeStyle.sizeScale': 2 },
      dirtyState: { controls: {}, sections: {}, panels: {} },
      journal: [],
      checkpointSeq: 0,
      networkPersistence: { enabled: false },
      networkData: { enabled: false, status: 'idle' },
      layoutRuntimeState: null,
    }));

    const controller = new HeliosSessionController({
      helios: new FakeHelios(),
      storage,
      now: () => 2000,
    });
    controller.configure({ id: 'fast-reload', deferRestore: true });

    let saveCount = 0;
    const originalSaveManifest = controller.saveManifest.bind(controller);
    controller.saveManifest = async () => {
      saveCount += 1;
      return originalSaveManifest();
    };

    listeners.get('pagehide')?.();
    assert.equal(saveCount, 0);
    assert.equal(JSON.parse(storage.getItem('helios-web:session-manifest:fast-reload')).overrides['appearance.nodeStyle.sizeScale'], 2);

    await controller.restore('fast-reload');
    listeners.get('pagehide')?.();
    assert.equal(saveCount, 1);
  } finally {
    if (previousAdd === undefined) delete globalThis.addEventListener;
    else globalThis.addEventListener = previousAdd;
    if (previousRemove === undefined) delete globalThis.removeEventListener;
    else globalThis.removeEventListener = previousRemove;
  }
});

test('session manifest restore falls back to previous complete commit', () => {
  const storage = createMemoryStorage();
  const controller = new HeliosSessionController({
    helios: new FakeHelios(),
    storage,
    now: () => 3000,
  });
  controller.sessionId = 'commit-restore';

  const complete = {
    schema: 'helios-web.session-manifest',
    version: 1,
    sessionId: 'commit-restore',
    updatedAt: 1000,
    complete: true,
    commit: { id: 'ok', status: 'complete', completedAt: 1000 },
    overrides: { 'appearance.nodeStyle.sizeScale': 2.5 },
    dirtyState: { controls: {}, sections: {}, panels: {} },
    journal: [],
    checkpointSeq: 0,
    networkPersistence: { enabled: false },
    networkData: { enabled: false, status: 'idle' },
    layoutRuntimeState: null,
  };
  const incomplete = {
    ...complete,
    updatedAt: 2000,
    complete: false,
    commit: { id: 'bad', status: 'pending', completedAt: 2000 },
    overrides: {},
  };

  storage.setItem(controller.manifestKey('commit-restore'), JSON.stringify(incomplete));
  storage.setItem(controller.manifestBackupKey('commit-restore'), JSON.stringify(complete));

  assert.equal(controller.loadManifest('commit-restore').overrides['appearance.nodeStyle.sizeScale'], 2.5);
});

test('session lifecycle flush captures latest camera state without layout snapshot', async () => {
  const storage = createMemoryStorage();
  const listeners = new Map();
  const previousAdd = globalThis.addEventListener;
  const previousRemove = globalThis.removeEventListener;
  globalThis.addEventListener = (type, handler) => listeners.set(type, handler);
  globalThis.removeEventListener = (type, handler) => {
    if (listeners.get(type) === handler) listeners.delete(type);
  };
  try {
    const helios = new FakeHelios();
    helios.cameraZoom = 3;
    helios.serializeVisualizationState = (options = {}) => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      preferences: options.preferences ?? { autosave: true },
      uiState: {},
      behaviorState: helios.currentBehaviorState,
      cameraState: { zoom: helios.cameraZoom },
      cameraControlState: { autoFit: false },
      networkSource: {},
      layoutRuntimeState: helios.layoutRuntimeState,
    });
    const controller = new HeliosSessionController({ helios, storage, now: () => 4000 });
    controller.configure({ id: 'camera-lifecycle', restore: false });
    await controller.ready();
    helios.snapshotLayoutRuntimeStateAsync = async () => {
      throw new Error('layout snapshot should not run during lifecycle flush');
    };
    controller.captureBaseline();
    helios.cameraZoom = 7;

    listeners.get('pagehide')?.();

    const manifest = controller.loadManifest('camera-lifecycle');
    assert.equal(manifest.overrides['camera.zoom'], 7);
    assert.equal(manifest.complete, true);
    assert.equal(manifest.commit.status, 'complete');
  } finally {
    if (previousAdd === undefined) delete globalThis.addEventListener;
    else globalThis.addEventListener = previousAdd;
    if (previousRemove === undefined) delete globalThis.removeEventListener;
    else globalThis.removeEventListener = previousRemove;
  }
});

test('debounced session autosave stores sparse overrides without layout snapshots', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  let layoutSnapshots = 0;
  helios.snapshotLayoutRuntimeStateAsync = async () => {
    layoutSnapshots += 1;
    throw new Error('layout snapshot should not run during regular autosave');
  };
  const controller = new HeliosSessionController({
    helios,
    storage,
    now: () => 5000,
  });
  controller.configure({ id: 'sparse-autosave', deferRestore: true });
  controller.captureBaseline();
  controller.setOverride('appearance.nodeStyle.sizeScale', 2, { source: 'user' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  await controller.flush({ includeNetwork: false, snapshotLayoutRuntime: false });

  const manifest = controller.loadManifest('sparse-autosave');
  assert.equal(layoutSnapshots, 0);
  assert.equal(manifest.overrides['appearance.nodeStyle.sizeScale'], 2);
  assert.equal(manifest.layoutRuntimeState, null);
});

test('session journal is bounded and can be disabled', () => {
  const storage = createMemoryStorage();
  const controller = new HeliosSessionController({
    helios: new FakeHelios(),
    storage,
    maxJournalEntries: 3,
    now: () => 6000,
  });
  controller.configure({ id: 'bounded-journal', deferRestore: true });
  controller.captureBaseline();
  for (let i = 0; i < 5; i += 1) {
    controller.setOverride(`appearance.test.value${i}`, i, { source: 'user' });
  }
  const journal = controller.getChangeJournal({});
  assert.equal(journal.length, 3);
  assert.deepEqual(journal.map((entry) => entry.path), [
    'appearance.test.value2',
    'appearance.test.value3',
    'appearance.test.value4',
  ]);
  assert.equal(controller.status().maxJournalEntries, 3);

  controller.updateConfig({ maxJournalEntries: 0 });
  controller.setOverride('appearance.test.off', true, { source: 'user' });
  assert.equal(controller.getChangeJournal({}).length, 0);
});

test('fresh session baseline reset clears bootstrap overrides and journal', () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const controller = new HeliosSessionController({
    helios,
    storage,
    now: () => 7000,
  });
  controller.configure({ id: 'bootstrap-reset', deferRestore: true });
  controller.captureBaseline();
  controller.setOverride('ui.panels.scene.dock', 'right', { source: 'user', reason: 'bootstrap' });
  assert.equal(controller.status().overrideCount, 1);
  assert.equal(controller.status().journalCount, 1);

  controller.resetTrackingBaseline(null, { clearJournal: true });
  assert.equal(controller.status().overrideCount, 0);
  assert.equal(controller.status().journalCount, 0);
  assert.deepEqual(controller.getDirtyState(), { controls: {}, sections: {}, panels: {} });
});

test('network persistence skips oversized graphs without blocking override saves', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'network-limit',
    restore: false,
    networkPersistence: { enabled: true, maxBytes: 2 },
    controllerOptions: { storage },
  });

  const manifest = await service.flush({ includeNetwork: true });
  assert.equal(manifest.networkData.status, 'skipped');
  assert.equal(manifest.networkData.skipped.reason, 'size-limit');
  assert.equal(manifest.networkData.dirty, true);
});

test('savePortableNetwork supports graph-only exports and graph-plus-visualization exports', async () => {
    const network = await HeliosNetwork.create({ directed: true, initialNodes: 0, initialEdges: 0 });
  try {
    const nodes = network.addNodes(3);
    network.addEdges([[nodes[0], nodes[1]], [nodes[1], nodes[2]]]);
    network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 3);
    let positionLength = 0;
    network.withBufferAccess(() => {
      const originalPositions = network.getNodeAttributeBuffer('_helios_visuals_position').view;
      positionLength = originalPositions.length;
      originalPositions.set([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    });
    const savedPositions = new Float32Array(positionLength);
    savedPositions.set([10, 10, 10, 11, 11, 11, 12, 12, 12]);
    const helios = Object.create(Helios.prototype);
    helios.network = network;
    helios.visuals = { seedMissingPositions() {} };
    helios._applyMappersSafely = () => {};
    helios.behaviors = {
      serialize: () => ({
        selection: { selectedNodes: [1] },
        labels: { options: { enabled: true } },
      }),
      ui: {
        serializeState: () => ({ theme: 'dark', panels: { scene: { dock: 'left', collapsed: false } } }),
      },
    };
    let suspendedSaves = 0;
    helios.persistence = {
      getPreferences: () => ({ autosave: true, responsive: { compactDockSide: 'left' } }),
      getOverrides: () => ({ 'appearance.nodeStyle.sizeScale': 2.5 }),
      sessionController: {
        suspendDuring: async (fn) => {
          suspendedSaves += 1;
          return await fn();
        },
      },
    };
    helios.snapshotLayoutRuntimeState = () => ({
      schema: 'helios-web.layout-runtime-state',
      version: 1,
      layoutState: 'idle',
      alpha: 0.001,
      positions: {
        encoding: 'float32-base64',
        length: savedPositions.length,
        byteLength: savedPositions.byteLength,
        data: encodeFloat32Base64(savedPositions),
      },
    });
    helios.snapshotLayoutRuntimeStateAsync = async () => helios.snapshotLayoutRuntimeState();
    helios._snapshotCameraState = () => ({ zoom: 2 });
    helios._lastLoadedNetworkName = 'portable.xnet';
    helios._lastLoadedNetworkBase = 'portable';
    helios._lastLoadedNetworkFormat = 'xnet';

    const graphOnly = await helios.savePortableNetwork('xnet', {
      includeVisualization: false,
      output: 'uint8array',
    });
    const restoredGraphOnly = await HeliosNetwork.fromXNet(graphOnly);
    try {
      assert.equal(restoredGraphOnly.hasNetworkAttribute('_helios_visualization_state'), false);
    } finally {
      restoredGraphOnly.dispose();
    }

    const graphWithVisualization = await helios.savePortableNetwork('xnet', {
      includeVisualization: true,
      output: 'uint8array',
    });
    const restoredGraphWithVisualization = await HeliosNetwork.fromXNet(graphWithVisualization);
    try {
      assert.equal(restoredGraphWithVisualization.hasNetworkAttribute('_helios_visualization_state'), true);
      const attached = restoredGraphWithVisualization.getNetworkStringAttribute('_helios_visualization_state');
      const parsed = parsePersistenceEnvelope(attached, PERSISTENCE_KINDS.visualization);
      assert.equal(parsed.payload.uiState.theme, 'dark');
      assert.deepEqual(parsed.payload.behaviorState.selection.selectedNodes, [1]);
    } finally {
      restoredGraphWithVisualization.dispose();
    }

    const trackedGraph = await helios.savePortableNetwork('xnet', {
      includeVisualization: true,
      trackedOnly: true,
      output: 'uint8array',
    });
    const restoredTrackedGraph = await HeliosNetwork.fromXNet(trackedGraph);
    try {
      const attached = restoredTrackedGraph.getNetworkStringAttribute('_helios_visualization_state');
      const parsed = parsePersistenceEnvelope(attached, PERSISTENCE_KINDS.visualization);
      let persistedPositions = null;
      restoredTrackedGraph.getNodeAttributeInfo?.('_helios_visuals_position');
      restoredTrackedGraph.withBufferAccess(() => {
        persistedPositions = new Float32Array(restoredTrackedGraph.getNodeAttributeBuffer('_helios_visuals_position').view);
      });
      let livePositions = null;
      network.getNodeAttributeInfo?.('_helios_visuals_position');
      network.withBufferAccess(() => {
        livePositions = new Float32Array(network.getNodeAttributeBuffer('_helios_visuals_position').view);
      });
      assert.deepEqual(parsed.payload.overrides, { 'appearance.nodeStyle.sizeScale': 2.5 });
      assert.equal(parsed.payload.layoutRuntimeState.alpha, 0.001);
      assert.equal(parsed.payload.behaviorState.selection, undefined);
      assert.equal(suspendedSaves >= 2, true);
      assert.deepEqual(Array.from(persistedPositions), Array.from(savedPositions));
      assert.deepEqual(Array.from(livePositions.subarray(0, 9)), [0, 0, 0, 1, 1, 1, 2, 2, 2]);
    } finally {
      restoredTrackedGraph.dispose();
    }
  } finally {
    network.dispose();
  }
});

test('restoreVisualizationState is a stable alias for importVisualizationState', async () => {
  const helios = Object.create(Helios.prototype);
  let calls = 0;
  helios.importVisualizationState = async (source, options = {}) => {
    calls += 1;
    return { source, options };
  };

  const result = await helios.restoreVisualizationState({ kind: 'visualization' }, { reason: 'alias-test' });
  assert.equal(calls, 1);
  assert.deepEqual(result, {
    source: { kind: 'visualization' },
    options: { reason: 'alias-test' },
  });
});

test('layout runtime state round-trips positions and temperature without reheating', () => {
  const positions = new Float32Array([0, 1, 2, 3, 4, 5]);
  const helios = Object.create(Helios.prototype);
  helios.network = {
    nodeCount: 2,
    getNodeAttributeBuffer: () => ({ view: positions }),
    withBufferAccess: (fn) => fn(),
  };
  helios.visuals = {
    nodePositions: positions,
    withBufferAccess: (fn) => fn(),
    markPositionsDirtyCalls: 0,
    markPositionsDirty() {
      this.markPositionsDirtyCalls += 1;
    },
    bumpNodeAttributesCalls: [],
    bumpNodeAttributes(name) {
      this.bumpNodeAttributesCalls.push(name);
    },
  };
  helios.behaviors = {
    layout: { type: () => 'gpu-force' },
  };
  helios.scheduler = {
    layoutEnabled: true,
    layoutState: 'running',
    requestedLayout: [],
    requestedGeometry: 0,
    requestedRender: 0,
    getLayoutState() {
      return this.layoutState;
    },
    setLayoutEnabled(enabled, reason) {
      this.layoutEnabled = enabled !== false;
      this.layoutState = this.layoutEnabled ? 'running' : reason;
    },
    requestLayout(reason) {
      this.requestedLayout.push(reason);
    },
    requestGeometry() {
      this.requestedGeometry += 1;
    },
    requestRender() {
      this.requestedRender += 1;
    },
  };
  helios._layout = {
    positionDelegate: {
      alpha: 0.0125,
      updated: [],
      updateOptions(options) {
        this.updated.push(options);
        if (Number.isFinite(options.alpha)) this.alpha = options.alpha;
      },
    },
    reheatCalls: 0,
    reheat() {
      this.reheatCalls += 1;
    },
    seedFromPositionSnapshot(snapshot) {
      positions.set(snapshot);
      return true;
    },
  };
  helios._interpolationRuntime = {};
  helios._applyPositionPipelineToRenderer = () => {};
  helios._labels = { requestFullReselect: () => {} };

  const state = helios.snapshotLayoutRuntimeState();
  assert.equal(state.alpha, 0.0125);
  assert.equal(state.positions.length, positions.length);

  positions.fill(99);
  state.alpha = 0.003;
  state.layoutState = 'idle';
  state.running = false;
  const restored = helios.restoreLayoutRuntimeState(state);

  assert.equal(restored, true);
  assert.deepEqual(Array.from(positions), [0, 1, 2, 3, 4, 5]);
  assert.equal(helios._layout.positionDelegate.alpha, 0.003);
  assert.equal(helios._layout.reheatCalls, 0);
  assert.equal(helios.scheduler.layoutEnabled, false);
  assert.equal(helios.scheduler.layoutState, 'idle');
});

test('layout runtime async snapshot reads active delegate positions', async () => {
  const networkPositions = new Float32Array([0, 0, 0, 0, 0, 0]);
  const delegatePositions = new Float32Array([10, 11, 12, 13, 14, 15]);
  const delegate = { constructor: { name: 'FakeDelegate' } };
  const helios = Object.create(Helios.prototype);
  helios.network = {
    nodeCount: 2,
    getNodeAttributeBuffer: () => ({ view: networkPositions }),
    withBufferAccess: (fn) => fn(),
  };
  helios.visuals = { nodePositions: networkPositions, withBufferAccess: (fn) => fn() };
  helios.behaviors = { layout: { type: () => 'gpu-force' } };
  helios.scheduler = { layoutEnabled: true, getLayoutState: () => 'running' };
  helios._layout = {
    getPositionDelegate: () => delegate,
  };
  helios._positionsConfig = { source: 'delegate', delegate };
  helios.snapshotDelegatePositions = async () => new Float32Array(delegatePositions);

  const state = await helios.snapshotLayoutRuntimeStateAsync();
  assert.equal(state.positionSource, 'delegate');
  assert.equal(state.delegateType, 'FakeDelegate');
  assert.deepEqual(Array.from(decodeFloat32Base64(state.positions.data)), Array.from(delegatePositions));
});

test('layout runtime restore writes active delegate and network positions', () => {
  const networkPositions = new Float32Array([0, 0, 0, 0, 0, 0]);
  const restoredPositions = new Float32Array([1, 2, 3, 4, 5, 6]);
  const delegateWrites = [];
  const delegate = {
    version: 2,
    options: { outputScale: 1 },
    writePositionSnapshot(snapshot, options) {
      delegateWrites.push({ snapshot: new Float32Array(snapshot), options });
      return true;
    },
    bumpVersion() {
      this.version += 1;
    },
    updateOptions(options) {
      this.options = { ...this.options, ...options };
    },
  };
  const helios = Object.create(Helios.prototype);
  helios.network = {
    nodeCount: 2,
    getNodeAttributeBuffer: () => ({ view: networkPositions }),
    withBufferAccess: (fn) => fn(),
  };
  helios.visuals = {
    nodePositions: networkPositions,
    withBufferAccess: (fn) => fn(),
    markPositionsDirty() {},
    bumpNodeAttributes() {},
  };
  helios.scheduler = {
    layoutEnabled: true,
    setLayoutEnabled(enabled) {
      this.layoutEnabled = enabled !== false;
    },
    requestGeometry() {},
    requestRender() {},
  };
  helios._layout = {
    options: { outputScale: 1 },
    getPositionDelegate: () => delegate,
    seedFromPositionSnapshot: () => false,
  };
  helios._buildPositionDelegateContext = (extra = {}) => ({
    network: helios.network,
    ...extra,
  });
  helios._positionsConfig = { source: 'delegate', delegate };
  helios._interpolationRuntime = {};
  helios._applyPositionPipelineToRenderer = () => {};
  helios._labels = { requestFullReselect: () => {} };

  const restored = helios.restoreLayoutRuntimeState({
    positions: {
      encoding: 'float32-base64',
      length: restoredPositions.length,
      byteLength: restoredPositions.byteLength,
      data: encodeFloat32Base64(restoredPositions),
    },
    center: [0, 0, 0],
    alpha: 0.2,
    layoutState: 'stopped',
  });

  assert.equal(restored, true);
  assert.equal(delegateWrites.length, 1);
  assert.deepEqual(Array.from(delegateWrites[0].snapshot), Array.from(restoredPositions));
  assert.deepEqual(Array.from(networkPositions), Array.from(restoredPositions));
  assert.deepEqual(Array.from(helios._interpolationRuntime.lastRenderedPositions), Array.from(restoredPositions));
  assert.equal(delegate.version, 3);
});

test('importVisualizationState applies sparse tracked overrides before layout runtime restore', async () => {
  const calls = [];
  const helios = Object.create(Helios.prototype);
  helios.currentBehaviorState = {
    appearance: { options: { nodeStyle: { sizeScale: 1 } } },
  };
  helios.persistence = { getPreferences: () => null };
  helios.mode = () => '2d';
  helios.serializeBehaviorState = () => helios.currentBehaviorState;
  helios.restoreBehaviorState = (state) => {
    helios.currentBehaviorState = state;
  };
  helios.behaviors = {
    ui: { restoreState: () => {} },
  };
  helios._snapshotCameraState = () => ({});
  helios._capturePersistenceNetworkSource = () => ({});
  helios.snapshotLayoutRuntimeState = () => null;
  helios.restoreLayoutRuntimeState = (state, options = {}) => {
    calls.push({ state, options, sizeScale: helios.currentBehaviorState.appearance.options.nodeStyle.sizeScale });
    return true;
  };
  const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    overrides: { 'appearance.nodeStyle.sizeScale': 2.75 },
    layoutRuntimeState: { alpha: 0.002, positions: null },
  });

  await helios.importVisualizationState(envelope, { reason: 'tracked-import' });

  assert.equal(helios.currentBehaviorState.appearance.options.nodeStyle.sizeScale, 2.75);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].state.alpha, 0.002);
  assert.equal(calls[0].sizeScale, 2.75);
});

test('importVisualizationState restores saved view mode before camera pose', async () => {
  const helios = Object.create(Helios.prototype);
  const calls = [];
  helios.options = { mode: '2d' };
  helios.mode = () => helios.options.mode;
  helios.setMode = async (mode, options = {}) => {
    calls.push({ type: 'setMode', mode, options });
    helios.options.mode = mode;
    return helios;
  };
  helios.restoreBehaviorState = (state) => {
    calls.push({ type: 'restoreBehaviorState', state });
  };
  helios.behaviors = {
    ui: {
      restoreState: (state) => calls.push({ type: 'restoreUiState', state }),
    },
  };
  helios._restoreCameraState = (state) => {
    calls.push({ type: 'restoreCameraState', mode: helios.mode(), state });
  };

  const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    behaviorState: { appearance: { options: { shaded: { enabled: true } } } },
    uiState: { theme: 'dark' },
    cameraState: { mode: '3d', distance: 42 },
  });

  await helios.importVisualizationState(envelope);

  assert.equal(helios.mode(), '3d');
  assert.deepEqual(calls[0], {
    type: 'setMode',
    mode: '3d',
    options: { animate: false, syncDelegate: false },
  });
  assert.equal(calls.at(-1).type, 'restoreCameraState');
  assert.equal(calls.at(-1).mode, '3d');
});

test('camera control state is persisted as sparse overrides and restored', async () => {
  const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    cameraState: { mode: '2d', zoom: 2 },
    cameraControlState: { autoFit: false, animation: true, autoFitIntervalMs: 1200 },
  });
  const flattened = flattenVisualizationOverrides(envelope);
  assert.equal(flattened['camera.zoom'], 2);
  assert.equal(flattened['cameraControls.autoFit'], false);
  assert.equal(flattened['cameraControls.autoFitIntervalMs'], 1200);

  const helios = Object.create(Helios.prototype);
  const calls = [];
  helios.options = { mode: '2d' };
  helios.mode = () => helios.options.mode;
  helios.restoreBehaviorState = () => {};
  helios.behaviors = { ui: { restoreState: () => {} } };
  helios._restoreCameraState = (state) => calls.push({ type: 'camera', state });
  helios._restoreCameraControlState = (state) => calls.push({ type: 'cameraControls', state });

  await helios.importVisualizationState(envelope);

  assert.deepEqual(calls, [
    { type: 'camera', state: { mode: '2d', zoom: 2 } },
    { type: 'cameraControls', state: { autoFit: false, animation: true, autoFitIntervalMs: 1200 } },
  ]);
});
