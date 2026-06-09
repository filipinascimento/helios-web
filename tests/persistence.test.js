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
  CustomPersistenceBackend,
  NetworkAttributePersistenceBackend,
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

class MockBehavior extends EventTarget {
  constructor(id, snapshot) {
    super();
    this.id = id;
    this.snapshot = structuredClone(snapshot);
    this.restored = [];
    this.updated = [];
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }

  serialize() {
    return structuredClone(this.snapshot);
  }

  restore(snapshot) {
    this.restored.push(structuredClone(snapshot));
    this.snapshot = structuredClone(snapshot);
    this.emitChange('restore');
    return this;
  }

  update(patch = {}) {
    this.updated.push(structuredClone(patch));
    this.snapshot = {
      ...this.snapshot,
      options: {
        ...(this.snapshot.options ?? {}),
        ...patch,
      },
    };
    this.emitChange('options');
    return this;
  }

  emitChange(reason = 'test') {
    const event = new Event('change');
    event.detail = { reason };
    this.dispatchEvent(event);
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

test('central persistence resolves VSCode-style scope precedence and resets sparse keys', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
  });
  service.registerKey('appearance.nodeStyle.sizeScale', { defaultValue: 1, scope: 'session' });
  service.set('appearance.nodeStyle.sizeScale', 1.5, { scope: 'user', source: 'test' });
  service.set('appearance.nodeStyle.sizeScale', 2, { scope: 'workspace', source: 'test' });
  service.set('appearance.nodeStyle.sizeScale', 3, { scope: 'network', source: 'test' });
  assert.equal(service.get('appearance.nodeStyle.sizeScale'), 3);
  service.set('appearance.nodeStyle.sizeScale', 4, { scope: 'session', source: 'test' });
  assert.equal(service.get('appearance.nodeStyle.sizeScale'), 4);
  service.reset('appearance.nodeStyle', { scope: 'session' });
  assert.equal(service.get('appearance.nodeStyle.sizeScale'), 3);
});

test('central persistence key status tracks exact overrides and resetOverride clears mutable layers', async () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
  });
  service.registerKey('scene.dimension', { defaultValue: '2d', scope: 'network' });
  service.registerKey('appearance.background', { defaultValue: '#000000ff', scope: 'network' });

  assert.equal(service.keyStatus('scene.dimension').state, 'default');
  service.set('scene.dimension', '3d', { scope: 'network', source: 'test', autosave: false });
  assert.equal(service.keyStatus('scene.dimension').state, 'changed');
  assert.equal(service.keyStatus('appearance.background').state, 'default');

  await service.resetOverride('scene.dimension');
  assert.equal(service.get('scene.dimension'), '2d');
  assert.equal(service.keyStatus('scene.dimension').state, 'default');
  assert.equal(service.keyStatus('appearance.background').state, 'default');
});

test('central persistence markers ignore stale overrides equal to lower layers', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
  });
  service.registerKey('ui.theme', { defaultValue: 'dark', scope: 'user' });
  service.registry.layers.user['ui.theme'] = 'dark';
  service.registry.layers.session['appearance.nodeStyle.sizeScale'] = 1;
  service.registerKey('appearance.nodeStyle.sizeScale', { defaultValue: 1, scope: 'session' });

  assert.equal(service.keyStatus('ui.theme').state, 'default');
  assert.equal(service.keyStatus('appearance.nodeStyle.sizeScale').state, 'default');
  assert.equal(service.getDirtyState().controls['ui.theme'], undefined);
  assert.equal(service.getDirtyState().controls['appearance.nodeStyle.sizeScale'], undefined);
});

test('central persistence clears stale visualization-hydrated markers', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
  });
  service.registerKey('layout.layoutType', { defaultValue: 'force', scope: 'session' });

  service.hydrateVisualizationState(createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    behaviorState: {
      layout: { options: { layoutType: 'radial' } },
    },
  }));
  assert.equal(service.keyStatus('layout.layoutType').state, 'changed');
  assert.equal(service.getDirtyState().controls['layout.layoutType'], 'changed');

  service.hydrateSessionOverrides({}, { group: 'visualization', reason: 'session-baseline' });
  assert.equal(service.keyStatus('layout.layoutType').state, 'default');
  assert.equal(service.getDirtyState().controls['layout.layoutType'], undefined);
});

test('central behavior persistence writes canonical and panel alias keys', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    autosave: false,
  });
  const filter = new MockBehavior('filters', {
    options: { id: 'main', name: 'Main' },
    filter: {
      scope: 'render',
      rules: [],
    },
  });

  service.bindBehaviorState('filters', filter);
  filter.snapshot = {
    options: { id: 'main', name: 'Main' },
    filter: {
      scope: 'render+layout',
      rules: [{ scope: 'node', attribute: 'group', type: 'categorical', values: ['a'] }],
    },
  };
  filter.emitChange('rules');

  assert.deepEqual(service.get('behaviors.filters.state').filter.rules, filter.snapshot.filter.rules);
  assert.equal(service.get('filters.scope'), 'render+layout');
  assert.deepEqual(service.get('filters.rules'), filter.snapshot.filter.rules);
  assert.equal(service.keyStatus('filters', { mode: 'scope' }).state, 'changed');
});

test('central behavior persistence tracks selections and legend options', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    autosave: false,
  });
  const selection = new MockBehavior('selection', {
    options: { nodeClick: true, selectedConnectedEdges: true },
    selectedNodes: [],
    selectedEdges: [],
  });
  const legends = new MockBehavior('legends', {
    options: { enabled: true, showNodeSize: false, scale: 1 },
  });

  service.bindBehaviorState('selection', selection);
  service.bindBehaviorState('legends', legends);
  selection.snapshot.selectedNodes = [1, 3, 5];
  selection.emitChange('node-selection-set');
  legends.snapshot.options.enabled = false;
  legends.snapshot.options.scale = 1.5;
  legends.emitChange('options');

  assert.deepEqual(service.get('selection.selectedNodes'), [1, 3, 5]);
  assert.equal(service.get('legends.enabled'), false);
  assert.equal(service.get('legends.scale'), 1.5);
  assert.equal(service.keyStatus('selection', { mode: 'scope' }).state, 'changed');
  assert.equal(service.keyStatus('legends.enabled').state, 'changed');
});

test('central behavior persistence ignores restore-suspended behavior changes', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    autosave: false,
  });
  const legends = new MockBehavior('legends', {
    options: { enabled: true, scale: 1 },
  });

  service.bindBehaviorState('legends', legends);
  service.runWithPersistenceRestoreSuspended(() => {
    legends.snapshot.options.enabled = false;
    legends.snapshot.options.scale = 1.5;
    legends.emitChange('restore');
  });

  assert.equal(service.keyStatus('legends.enabled').state, 'default');
  assert.equal(service.getDirtyState().controls['legends.enabled'], undefined);

  legends.emitChange('settled-restore');
  assert.equal(service.keyStatus('legends.enabled').state, 'default');
  assert.equal(service.getDirtyState().controls['legends.enabled'], undefined);

  legends.snapshot.options.scale = 2;
  legends.emitChange('user-change');
  assert.equal(service.keyStatus('legends.scale').state, 'changed');
});

test('central behavior persistence can apply canonical and alias keys back to behavior', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    autosave: false,
  });
  const legends = new MockBehavior('legends', {
    options: { enabled: true, scale: 1 },
  });

  service.bindBehaviorState('legends', legends);
  service.set('legends.enabled', false, { scope: 'network', source: 'test', autosave: false });
  assert.deepEqual(legends.updated.at(-1), { enabled: false });

  service.set('behaviors.legends.state', {
    options: { enabled: true, scale: 2 },
  }, { scope: 'network', source: 'test', autosave: false });
  assert.equal(legends.restored.at(-1).options.scale, 2);
});

test('registering controls after restore preserves explicit override markers', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    autosave: false,
  });
  service.registry.layers.network['layout.layoutType'] = 'gpu-force';

  service.registerKey('layout.layoutType', {
    defaultValue: 'gpu-force',
    scope: 'network',
    preserveOverrides: true,
  });

  assert.equal(service.keyStatus('layout.layoutType').state, 'changed');
});

test('central persistence fans writes out to every enabled backend', async () => {
  const writes = [];
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    backends: [
      new CustomPersistenceBackend({
        id: 'a',
        write: (record) => writes.push(['a', record.layers.session['ui.theme']]),
      }),
      new CustomPersistenceBackend({
        id: 'b',
        write: (record) => writes.push(['b', record.layers.session['ui.theme']]),
      }),
    ],
  });
  service.set('ui.theme', 'light', { scope: 'session', source: 'test', autosave: false });
  await service.sync();
  assert.deepEqual(writes, [['a', 'light'], ['b', 'light']]);
});

test('central persistence coalesces overlapping backend syncs into one trailing write', async () => {
  const writes = [];
  let releaseFirstWrite = null;
  let firstWriteStarted = null;
  const firstWriteStartedPromise = new Promise((resolve) => {
    firstWriteStarted = resolve;
  });
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    backends: [
      new CustomPersistenceBackend({
        id: 'slow',
        write: async (record) => {
          writes.push(record.layers.session['ui.theme']);
          if (writes.length === 1) {
            firstWriteStarted();
            await new Promise((resolve) => { releaseFirstWrite = resolve; });
          }
        },
      }),
    ],
  });

  service.set('ui.theme', 'light', { scope: 'session', source: 'test', autosave: false });
  const first = service.sync();
  await firstWriteStartedPromise;
  service.set('ui.theme', 'dark', { scope: 'session', source: 'test', autosave: false });
  const second = service.sync();
  const third = service.sync({ includeNetwork: true });
  releaseFirstWrite();
  await Promise.all([first, second, third]);

  assert.deepEqual(writes, ['light', 'dark']);
});

test('central persistence autosave debounces scheduled backend syncs', async () => {
  const writes = [];
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    backends: [
      new CustomPersistenceBackend({
        id: 'debounced',
        write: (record) => writes.push(record.layers.session['ui.theme']),
      }),
    ],
  });
  service.registerKey('ui.theme', { scope: 'session', debounceMs: 25 });
  service.set('ui.theme', 'light', { scope: 'session', source: 'test' });
  service.set('ui.theme', 'dark', { scope: 'session', source: 'test' });
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.deepEqual(writes, ['dark']);
});

test('central persistence autosave waits until camera interaction is idle', async () => {
  const helios = new FakeHelios();
  const writes = [];
  let syncEvents = 0;
  const service = new HeliosPersistenceService({
    helios,
    browser: false,
    networkAttributes: false,
    autosyncInteractionIdleMs: 60,
    backends: [
      new CustomPersistenceBackend({
        id: 'interaction-idle-registry',
        write: (record) => writes.push(record.layers.session['ui.theme']),
      }),
    ],
  });
  service.addEventListener('sync', () => {
    syncEvents += 1;
  });
  service.registerKey('ui.theme', { scope: 'session', debounceMs: 0 });

  helios.emit('camera:move', { origin: 'interaction', action: 'pan' });
  service.set('ui.theme', 'light', { scope: 'session', source: 'test' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(writes, []);
  assert.equal(syncEvents, 0);

  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.deepEqual(writes, ['light']);
  assert.ok(syncEvents > 0);
});

test('central autosync queue can pause, resume, cancel, and flush pending work', async () => {
  const writes = [];
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    backends: [
      new CustomPersistenceBackend({
        id: 'autosync-controls',
        write: (record) => writes.push(record.layers.session['ui.theme']),
      }),
    ],
  });
  service.registerKey('ui.theme', { scope: 'session', debounceMs: 10 });

  service.pauseAutosync('test');
  service.set('ui.theme', 'light', { scope: 'session', source: 'test' });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(writes, []);
  assert.equal(service.autosyncStatus().paused, true);
  assert.equal(service.autosyncStatus().pending.includeRegistry, true);

  service.resumeAutosync();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(writes, ['light']);

  service.pauseAutosync('cancel');
  service.set('ui.theme', 'dark', { scope: 'session', source: 'test' });
  service.cancelAutosync();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(writes, ['light']);
  assert.equal(service.autosyncStatus().pending, null);

  service.set('ui.theme', 'contrast', { scope: 'session', source: 'test' });
  await service.flushAutosync({ includeRegistry: true });
  assert.deepEqual(writes, ['light', 'contrast']);
});

test('position persistence autosave debounces dirty snapshots and backend syncs', async () => {
  const writes = [];
  const helios = new FakeHelios();
  let snapshots = 0;
  helios.snapshotLayoutRuntimeStateAsync = async () => {
    snapshots += 1;
    return helios.layoutRuntimeState;
  };
  const service = new HeliosPersistenceService({
    helios,
    browser: false,
    networkAttributes: false,
    positionPersistence: { enabled: true, autosave: true, debounceMs: 15 },
    backends: [
      new CustomPersistenceBackend({
        id: 'positions-autosave',
        write: (record) => writes.push(record.layers.network['positions.current']?.encoding ?? null),
      }),
    ],
  });

  service.markPositionsDirty('layout-update');
  service.markPositionsDirty('layout-update');
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(snapshots, 1);
  assert.deepEqual(writes, ['float32-base64']);
  assert.equal(service.status().networkData.positionsDirty, false);
});

test('network persistence autosave defaults on, can be disabled, and is debounced separately from dirty status', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  let saves = 0;
  helios.savePortableNetwork = async (format, options = {}) => {
    saves += 1;
    helios.lastSave = { format, options };
    return Uint8Array.from([1, 2, 3, 4]);
  };
  const service = new HeliosPersistenceService({
    helios,
    browser: false,
    networkAttributes: false,
    networkPersistence: { debounceMs: 15 },
    positionPersistence: { debounceMs: 15 },
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'network-autosync-default',
    restore: false,
    autosave: false,
    networkPersistence: { enabled: true },
    controllerOptions: { storage },
  });

  service.markNetworkDirty('network-replaced');
  service.markNetworkDirty('network-replaced');
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(saves, 1);
  assert.equal(service.status().networkData.dirty, false);

  service.configure({
    networkPersistence: { enabled: true, autosave: false, debounceMs: 15 },
    positionPersistence: { enabled: true, autosave: true, debounceMs: 15 },
  });
  service.markNetworkDirty('network-replaced');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(saves, 1);
  assert.equal(service.status().networkData.dirty, true);

  service.set('network.persistence.autosave', true, { scope: 'workspace', source: 'test' });
  service.markNetworkDirty('network-replaced');
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(saves, 2);
  assert.equal(helios.lastSave.format, 'zxnet');
  assert.equal(service.status().networkData.dirty, false);
  assert.equal(service.status().networkData.positionsDirty, false);
});

test('network autosync waits until camera interaction is idle', async () => {
  const helios = new FakeHelios();
  let saveCount = 0;
  helios.savePortableNetwork = async (format, options = {}) => {
    saveCount += 1;
    helios.lastSave = { format, options };
    return Uint8Array.from([1, 2, 3, 4]);
  };
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage: createMemoryStorage() }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
    networkPersistence: { enabled: true, autosave: true, debounceMs: 0 },
    positionPersistence: { enabled: false, autosave: false },
    autosyncInteractionIdleMs: 60,
  });
  service.configureSession({
    id: 'interaction-idle-sync',
    restore: false,
    networkPersistence: { enabled: true, autosave: true, debounceMs: 0 },
  });

  helios.emit('camera:move', { origin: 'interaction', action: 'pan' });
  service.markNetworkDirty('interaction-idle-test');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(saveCount, 0);

  await new Promise((resolve) => setTimeout(resolve, 90));
  assert.equal(saveCount, 1);
  assert.equal(helios.lastSave.options.includeCurrentPositions, true);
});

test('network attribute persistence stores only portable network scoped settings', async () => {
  const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 0 });
  try {
    const backend = new NetworkAttributePersistenceBackend({ network });
    const service = new HeliosPersistenceService({
      helios: new FakeHelios(),
      browser: false,
      networkAttributes: false,
      backends: [backend],
    });
    service.set('ui.theme', 'light', { scope: 'user', source: 'test', autosave: false });
    service.set('appearance.nodeStyle.sizeScale', 2, { scope: 'network', source: 'test', autosave: false });
    await service.sync();
    const restored = new HeliosPersistenceService({
      helios: new FakeHelios(),
      browser: false,
      networkAttributes: false,
      backends: [new NetworkAttributePersistenceBackend({ network })],
    });
    await restored.load();
    assert.equal(restored.get('appearance.nodeStyle.sizeScale'), 2);
    assert.equal(restored.get('ui.theme'), null);
  } finally {
    network.dispose?.();
  }
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
  assert.equal(helios.loaded[0].options.markNetworkDirty, false);
  assert.equal(helios.importedVisualization.length, 1);
  assert.equal(helios.importedVisualization[0].envelope.payload.uiState.theme, 'dark');
});

test('unfinished session pointers are isolated by workspace', async () => {
  const storage = createMemoryStorage();
  const sessionStore = new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() });
  const preferenceStore = new LocalStoragePreferenceStore({ storage });
  const helios = new FakeHelios();
  const workspaceA = new HeliosPersistenceService({
    helios,
    preferenceStore,
    sessionStore,
    workspaceId: 'workspace-a',
    idFactory: () => 'session-a',
  });
  const workspaceB = new HeliosPersistenceService({
    helios,
    preferenceStore,
    sessionStore,
    workspaceId: 'workspace-b',
    idFactory: () => 'session-b',
  });

  await workspaceA.saveSession({ unfinished: true });
  await workspaceB.saveSession({ unfinished: true });

  assert.equal((await workspaceA.getRestorableSession())?.payload.session.id, 'session-a');
  assert.equal((await workspaceB.getRestorableSession())?.payload.session.id, 'session-b');
  assert.equal(await preferenceStore.getUnfinishedSessionId(), null);
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

test('persistence status aliases behavior and panel-scoped state', () => {
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage: createMemoryStorage() }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });

  service.registerKey('behaviors.mappers.state', { scope: 'network', defaultValue: { node: null, edge: null } });
  service.set('behaviors.mappers.state', { node: { changed: true }, edge: null }, {
    scope: 'network',
    source: 'test',
    reason: 'mappers',
  });
  assert.equal(service.keyStatus('mappers', { mode: 'scope' }).state, 'changed');
  assert.equal(service.getDirtyState().panels.mappers, 'changed');

  service.set('cameraControls.autoFit', false, {
    scope: 'network',
    source: 'test',
    reason: 'camera',
  });
  assert.notEqual(service.keyStatus('camera', { mode: 'scope' }).state, 'default');

  service.registerKey('metrics.lastOutput', { scope: 'network', defaultValue: null });
  service.set('metrics.lastOutput', { metric: 'degree', attributes: ['degree'] }, {
    scope: 'network',
    source: 'test',
    reason: 'metrics',
  });
  assert.notEqual(service.keyStatus('metrics', { mode: 'scope' }).state, 'default');
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

test('pending session and registry changes coalesce by path before save', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'coalesce-pending',
    restore: false,
    autosave: false,
    controllerOptions: { storage },
  });

  service.registerKey('ui.theme', { scope: 'session' });
  service.set('ui.theme', 'light', { scope: 'session', source: 'test' });
  service.set('ui.theme', 'dark', { scope: 'session', source: 'test' });
  const registryThemeEntries = service.registry.getChangeJournal({}).filter((entry) => entry.path === 'ui.theme');
  assert.equal(registryThemeEntries.length, 1);
  assert.equal(registryThemeEntries[0].newValue, 'dark');

  service.sessionController.setOverride('camera.zoom', 4, { source: 'test' });
  service.sessionController.setOverride('camera.zoom', 8, { source: 'test' });
  const cameraEntries = service.sessionController.getChangeJournal({}).filter((entry) => entry.path === 'camera.zoom');
  assert.equal(cameraEntries.length, 1);
  assert.equal(cameraEntries[0].newValue, 8);

  await service.sessionController.saveManifest({ snapshotLayoutRuntime: false });
  service.sessionController.setOverride('camera.zoom', 10, { source: 'test' });
  const savedAndPending = service.sessionController.getChangeJournal({}).filter((entry) => entry.path === 'camera.zoom');
  assert.equal(savedAndPending.length, 2);
  assert.equal(savedAndPending.at(-1).newValue, 10);
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
  assert.equal(secondHelios.restoredLayoutRuntime[0].options.restoreRunState, false);
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

test('session camera checkpoints sync once after interaction idle', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
    autosyncInteractionIdleMs: 120,
  });
  service.configureSession({
    id: 'idle-camera-checkpoints',
    restore: false,
    controllerOptions: { storage },
  });
  await service.sessionController.ready();

  let syncEvents = 0;
  service.addEventListener('sync', () => {
    syncEvents += 1;
  });

  helios.cameraState = { zoom: 8 };
  helios.emit('camera:move', { origin: 'interaction', action: 'pan' });
  await new Promise((resolve) => { setTimeout(resolve, 60); });

  assert.equal(syncEvents, 0);
  assert.equal(service.getOverrides()['camera.zoom'], 8);
  await new Promise((resolve) => { setTimeout(resolve, 900); });
  assert.ok(syncEvents > 0);
  const manifest = service.sessionController.loadManifest('idle-camera-checkpoints');
  assert.equal(manifest.overrides['camera.zoom'], 8);
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

test('explicit URL sessions suppress restore prompt unless the requested session is invalid', async () => {
  const storage = createMemoryStorage();
  storage.setItem('helios-web:session-manifest:url-session-valid', JSON.stringify({
    schema: 'helios-web.session-manifest',
    version: 1,
    sessionId: 'url-session-valid',
    updatedAt: 1000,
    overrides: {},
    dirtyState: { controls: {}, sections: {}, panels: {} },
    journal: [],
    checkpointSeq: 0,
    networkPersistence: { enabled: false },
    networkData: { enabled: false, status: 'idle' },
    layoutRuntimeState: null,
  }));
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const previousHistory = Object.getOwnPropertyDescriptor(globalThis, 'history');
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: {
      href: 'http://localhost/?sessionId=url-session-valid',
      search: '?sessionId=url-session-valid',
    },
  });
  Object.defineProperty(globalThis, 'history', {
    configurable: true,
    value: { replaceState() {} },
  });
  try {
    const valid = new HeliosSessionController({
      helios: new FakeHelios(),
      storage,
    });
    valid.configure({ url: true, deferRestore: true });
    assert.equal(valid.sessionId, 'url-session-valid');
    assert.equal(valid.shouldShowRestorePrompt(), false);
    await valid.restore('url-session-valid');
    assert.equal(valid.explicitSessionInvalid, false);
    assert.equal(valid.shouldShowRestorePrompt(), false);

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: {
        href: 'http://localhost/?sessionId=url-session-missing',
        search: '?sessionId=url-session-missing',
      },
    });
    const invalid = new HeliosSessionController({
      helios: new FakeHelios(),
      storage,
    });
    invalid.configure({ url: true, deferRestore: true });
    assert.equal(invalid.shouldShowRestorePrompt(), false);
    await invalid.restore('url-session-missing');
    assert.equal(invalid.explicitSessionInvalid, true);
    assert.equal(invalid.shouldShowRestorePrompt(), true);
  } finally {
    if (previousLocation) Object.defineProperty(globalThis, 'location', previousLocation);
    else delete globalThis.location;
    if (previousHistory) Object.defineProperty(globalThis, 'history', previousHistory);
    else delete globalThis.history;
  }
});

test('backend sync failures are reported to the console', async () => {
  const previousError = console.error;
  const errors = [];
  console.error = (...args) => {
    errors.push(args);
  };
  try {
    const service = new HeliosPersistenceService({
      helios: new FakeHelios(),
      browser: false,
      networkAttributes: false,
      backends: [
        new CustomPersistenceBackend({
          id: 'failing-test-backend',
          write() {
            throw new Error('backend write failed');
          },
        }),
      ],
    });
    const status = await service.sync();
    assert.equal(status.lastError, 'backend write failed');
    assert.ok(errors.some((entry) => String(entry[0]).includes('Backend sync failed')));
  } finally {
    console.error = previousError;
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

test('session manifest saves update merged persistence status and central sync events', async () => {
  let now = 1000;
  const storage = createMemoryStorage();
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
    now: () => now,
  });
  let syncEvents = 0;
  service.addEventListener('sync', () => {
    syncEvents += 1;
  });
  service.configureSession({
    id: 'session-status-sync',
    restore: false,
    controllerOptions: { storage },
    networkPersistence: { enabled: true },
  });
  await service.sessionController.ready();

  now = 2400;
  await service.sessionController.saveManifest({ snapshotLayoutRuntime: false });

  const status = service.status();
  assert.equal(status.networkData.status, 'saved');
  assert.equal(status.networkData.savedAt, null);
  assert.equal(status.lastSyncedAt, 2400);
  assert.ok(syncEvents >= 1);
});

test('restored session overrides hydrate central key status for dirty markers', async () => {
  const storage = createMemoryStorage();
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    browser: false,
    networkAttributes: false,
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.registerKey('scene.dimension', { defaultValue: '2d', scope: 'session' });
  service.configureSession({
    id: 'marker-restore',
    deferRestore: true,
    controllerOptions: { storage },
  });

  storage.setItem(service.sessionController.manifestKey('marker-restore'), JSON.stringify({
    schema: 'helios-web.session-manifest',
    version: 1,
    sessionId: 'marker-restore',
    updatedAt: 1000,
    complete: true,
    commit: { id: 'ok', status: 'complete', completedAt: 1000 },
    overrides: { 'scene.dimension': '3d' },
    dirtyState: { controls: {}, sections: {}, panels: {} },
    journal: [],
    checkpointSeq: 0,
    networkPersistence: { enabled: false },
    networkData: { enabled: false, status: 'idle' },
    layoutRuntimeState: null,
  }));

  await service.sessionController.restore('marker-restore');

  assert.equal(service.get('scene.dimension'), '3d');
  assert.equal(service.keyStatus('scene.dimension').state, 'changed');
  assert.equal(service.getDirtyState().controls['scene.dimension'], 'changed');
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

test('network persistence session save uses async visualization state for delegate positions', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const syncPositions = new Float32Array([0, 0, 0, 1, 1, 0]);
  const asyncPositions = new Float32Array([0, 0, 5, 1, 1, 7]);
  helios.layoutRuntimeState = {
    ...helios.layoutRuntimeState,
    positionSource: 'network',
    positions: {
      encoding: 'float32-base64',
      length: syncPositions.length,
      byteLength: syncPositions.byteLength,
      data: encodeFloat32Base64(syncPositions),
    },
  };
  helios.serializeVisualizationStateAsync = async (options = {}) => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    preferences: options.preferences ?? { autosave: true },
    uiState: {},
    behaviorState: helios.currentBehaviorState,
    cameraState: helios.cameraState,
    networkSource: { name: 'async.xnet', format: 'xnet', nodeCount: 2, edgeCount: 1 },
    layoutRuntimeState: {
      ...helios.layoutRuntimeState,
      positionSource: 'delegate',
      positions: {
        encoding: 'float32-base64',
        length: asyncPositions.length,
        byteLength: asyncPositions.byteLength,
        data: encodeFloat32Base64(asyncPositions),
      },
    },
  });
  const service = new HeliosPersistenceService({
    helios,
    browser: false,
    networkAttributes: false,
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'async-network-persist',
    restore: false,
    controllerOptions: { storage },
    networkPersistence: { enabled: true, format: 'zxnet' },
  });

  await service.sessionController.persistNetworkNow({ format: 'zxnet', retention: { enabled: false } });

  const stored = await service.getSession('async-network-persist');
  const restoredPositions = decodeFloat32Base64(
    stored.payload.visualizationState.payload.layoutRuntimeState.positions.data,
  );
  assert.equal(stored.payload.visualizationState.payload.layoutRuntimeState.positionSource, 'delegate');
  assert.deepEqual(Array.from(restoredPositions), Array.from(asyncPositions));
});

test('large session manifests survive localStorage quota by using the session store', async () => {
  const baseStorage = createMemoryStorage();
  const quotaStorage = {
    getItem: baseStorage.getItem,
    removeItem: baseStorage.removeItem,
    clear: baseStorage.clear,
    setItem(key, value) {
      if (String(value).length > 200) {
        const error = new Error('Quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }
      return baseStorage.setItem(key, value);
    },
  };
  const sessionStore = new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() });
  const helios = new FakeHelios();
  helios.layoutRuntimeState = {
    schema: 'helios-web.layout-runtime-state',
    version: 1,
    layoutState: 'running',
    alpha: 0.125,
    positions: {
      encoding: 'float32-base64',
      length: 4096,
      byteLength: 16384,
      data: 'x'.repeat(20_000),
    },
  };
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage: quotaStorage }),
    sessionStore,
    now: () => 7000,
  });
  service.configureSession({
    id: 'quota-large-manifest',
    deferRestore: true,
    controllerOptions: { storage: quotaStorage },
  });

  await service.sessionController.saveManifest();
  const stored = await sessionStore.get(service.sessionController.manifestRecordKey('quota-large-manifest'));
  assert.equal(stored.manifest.layoutRuntimeState.positions.data.length, 20_000);

  const secondHelios = new FakeHelios();
  const secondService = new HeliosPersistenceService({
    helios: secondHelios,
    preferenceStore: new LocalStoragePreferenceStore({ storage: quotaStorage }),
    sessionStore,
    now: () => 8000,
  });
  secondService.configureSession({
    id: 'quota-large-manifest',
    deferRestore: true,
    controllerOptions: { storage: quotaStorage },
  });
  await secondService.sessionController.restore('quota-large-manifest');
  assert.equal(secondHelios.restoredLayoutRuntime.at(-1).state.positions.data.length, 20_000);
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

test('network persistence stores current positions in the session network blob without hidden visualization', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'network-current-positions',
    restore: false,
    networkPersistence: { enabled: true, includeVisualization: false },
    controllerOptions: { storage },
  });

  await service.flush({ includeNetwork: true });

  assert.equal(helios.lastSave.options.includeVisualization, false);
  assert.equal(helios.lastSave.options.includeCurrentPositions, true);
});

test('centralized status preserves saved network state when registry is idle', async () => {
  const storage = createMemoryStorage();
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({
    id: 'status-network-saved',
    restore: false,
    networkPersistence: { enabled: true },
    controllerOptions: { storage },
  });
  await service.sessionController.ready();
  service.sessionController.networkData = {
    enabled: true,
    status: 'saved',
    dirty: false,
    format: 'xnet',
    bytes: 512,
    savedAt: 1234,
  };

  const status = service.persistenceStatus();
  assert.equal(status.networkData.status, 'saved');
  assert.equal(status.networkData.format, 'xnet');
  assert.equal(status.networkData.bytes, 512);
  assert.equal(status.networkData.savedAt, 1234);
});

test('session retention prunes oldest sessions when stored bytes exceed the limit', async () => {
  const storage = createMemoryStorage();
  let clock = 1000;
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
    now: () => clock,
    sessionRetention: { maxSessions: 10, maxBytes: 30_000 },
  });

  for (const id of ['session-1', 'session-2', 'session-3']) {
    clock += 1000;
    await service.saveSession({
      id,
      createdAt: clock,
      updatedAt: clock,
      networkFormat: 'xnet',
      networkData: new Uint8Array(10_000),
      visualizationState: service.exportVisualizationState({ format: 'object' }),
    });
  }

  assert.equal(await service.getSession('session-1'), null);
  assert.ok(await service.getSession('session-2'));
  assert.ok(await service.getSession('session-3'));
});

test('session count retention is scoped to the active workspace', async () => {
  const storage = createMemoryStorage();
  const sessionStore = new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() });
  let clock = 1000;
  const serviceA = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore,
    now: () => clock,
    workspaceId: 'workspace-a',
    sessionRetention: { maxSessions: 2, maxBytes: 0 },
  });
  const serviceB = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore,
    now: () => clock,
    workspaceId: 'workspace-b',
    sessionRetention: { maxSessions: 2, maxBytes: 0 },
  });

  for (const id of ['a-1', 'a-2']) {
    clock += 1000;
    await serviceA.saveSession({
      id,
      createdAt: clock,
      updatedAt: clock,
      networkFormat: 'xnet',
      networkData: new Uint8Array(32),
      visualizationState: serviceA.exportVisualizationState({ format: 'object' }),
    });
  }
  for (const id of ['b-1', 'b-2', 'b-3']) {
    clock += 1000;
    await serviceB.saveSession({
      id,
      createdAt: clock,
      updatedAt: clock,
      networkFormat: 'xnet',
      networkData: new Uint8Array(32),
      visualizationState: serviceB.exportVisualizationState({ format: 'object' }),
    });
  }

  assert.ok(await serviceA.getSession('a-1'));
  assert.ok(await serviceA.getSession('a-2'));
  assert.equal(await serviceB.getSession('b-1'), null);
  assert.ok(await serviceB.getSession('b-2'));
  assert.ok(await serviceB.getSession('b-3'));
});

test('restorable session lists exclude the active URL session and expose summaries', async () => {
  const storage = createMemoryStorage();
  let clock = 2000;
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
    now: () => clock,
    sessionRetention: { maxSessions: 10, maxBytes: 10_000 },
  });
  await service.saveSession({
    id: 'older',
    nickname: 'Project Alpha',
    createdAt: clock,
    updatedAt: clock,
    networkFormat: 'xnet',
    networkData: new Uint8Array(32),
    visualizationState: service.exportVisualizationState({ format: 'object' }),
  });
  clock += 1000;
  await service.saveSession({
    id: 'active',
    createdAt: clock,
    updatedAt: clock,
    networkFormat: 'xnet',
    networkData: new Uint8Array(32),
    visualizationState: service.exportVisualizationState({ format: 'object' }),
  });
  service.configureSession({ id: 'active', restore: false, controllerOptions: { storage } });

  const restorable = await service.getRestorableSessions({ excludeCurrent: true });
  assert.deepEqual(restorable.map((entry) => entry.payload.session.id), ['older']);
  const resumeSessions = await service.getResumeSessions();
  assert.deepEqual(resumeSessions.map((entry) => entry.id), ['older']);
  assert.equal(await service.getResumePrompt(), null);
  service.sessionController.explicitSessionRequested = false;
  const resumePrompt = await service.getResumePrompt();
  assert.equal(resumePrompt.sessionId, 'older');
  assert.deepEqual(resumePrompt.sessions.map((entry) => entry.id), ['older']);
  const summaries = await service.listSessionSummaries({ includeFinished: true });
  const active = summaries.find((entry) => entry.id === 'active');
  const older = summaries.find((entry) => entry.id === 'older');
  assert.equal(active.current, true);
  assert.equal(active.label, 'demo.xnet');
  assert.equal(older.label, 'Project Alpha');
  assert.equal(older.nickname, 'Project Alpha');
  assert.equal(typeof active.bytes, 'number');
});

test('saveSession stores a tiny export thumbnail when preview export is available', async () => {
  const helios = new FakeHelios();
  const previewCalls = [];
  helios.exportFigurePreviewBlob = async (options = {}, previewOptions = {}) => {
    previewCalls.push({ options, previewOptions });
    return new Blob([Uint8Array.from([137, 80, 78, 71])], { type: 'image/png' });
  };
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage: createMemoryStorage() }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
    sessionThumbnail: { maxWidth: 72, maxHeight: 48, maxBytes: 4096 },
  });

  const saved = await service.saveSession({
    id: 'thumbnail-session',
    networkFormat: 'xnet',
    networkData: new Uint8Array([1, 2, 3]),
    retention: { enabled: false },
  });
  const stored = await service.getSession('thumbnail-session');
  const summary = service.sessionSummary(stored);

  assert.equal(previewCalls.length, 1);
  assert.equal(previewCalls[0].previewOptions.maxWidth, 72);
  assert.equal(previewCalls[0].previewOptions.maxHeight, 48);
  assert.equal(saved.payload.thumbnail.type, 'image/png');
  assert.match(saved.payload.thumbnail.dataUrl, /^data:image\/png;base64,/);
  assert.equal(stored.payload.thumbnail.dataUrl, saved.payload.thumbnail.dataUrl);
  assert.equal(summary.thumbnail.dataUrl, saved.payload.thumbnail.dataUrl);
});

test('deleteSession removes stored sessions and clears unfinished pointer', async () => {
  const storage = createMemoryStorage();
  const service = new HeliosPersistenceService({
    helios: new FakeHelios(),
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore: new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() }),
  });
  service.configureSession({ id: 'delete-me', restore: false, controllerOptions: { storage } });
  await service.saveSession({
    id: 'delete-me',
    nickname: 'Delete Me',
    networkFormat: 'xnet',
    networkData: new Uint8Array(32),
    visualizationState: service.exportVisualizationState({ format: 'object' }),
  });
  assert.ok(await service.getSession('delete-me'));
  assert.equal(await service.getUnfinishedSessionId(), 'delete-me');

  const result = await service.deleteSession('delete-me');

  assert.equal(result, true);
  assert.equal(await service.getSession('delete-me'), null);
  assert.equal(await service.getUnfinishedSessionId(), null);
});

test('restoring a saved session updates active id without restarting layout run state', async () => {
  const storage = createMemoryStorage();
  const sessionStore = new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() });
  const helios = new FakeHelios();
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore,
  });
  service.configureSession({
    id: 'current-session',
    restore: false,
    controllerOptions: { storage },
  });
  helios.layoutRuntimeState = {
    schema: 'helios-web.layout-runtime-state',
    version: 1,
    layoutState: 'running',
    running: true,
    alpha: 0.02,
    positions: null,
  };
  await service.saveSession({
    id: 'saved-session',
    nickname: 'Saved Network',
    networkFormat: 'xnet',
    networkData: new Uint8Array([4, 3, 2, 1]),
    visualizationState: helios.serializeVisualizationState(),
    retention: { enabled: false },
  });

  const restored = await service.restoreSession('saved-session');

  assert.equal(restored.payload.session.id, 'saved-session');
  assert.equal(service.status().sessionId, 'saved-session');
  assert.equal(service.status().nickname, 'Saved Network');
  assert.equal(helios.loaded.length, 1);
  assert.equal(helios.loaded[0].options.allowDuringInitialize, true);
  assert.equal(helios.importedVisualization.at(-1).options.restoreLayoutRunState, false);
});

test('restoring a saved session treats the saved scene snapshot as baseline', async () => {
  const storage = createMemoryStorage();
  const sessionStore = new IndexedDBSessionStore({ indexedDB: createMemoryIndexedDBFactory() });
  const helios = new FakeHelios();
  helios.currentBehaviorState = {
    ...helios.currentBehaviorState,
    layout: { options: { layoutType: 'radial', parameters: { gravity: -1.2 } } },
    legends: { options: { enabled: false, scale: 1.5 } },
  };
  const service = new HeliosPersistenceService({
    helios,
    preferenceStore: new LocalStoragePreferenceStore({ storage }),
    sessionStore,
  });
  service.registerKey('layout.layoutType', { defaultValue: 'force', scope: 'session' });
  service.registerKey('layout.parameters.gravity', { defaultValue: -0.5, scope: 'session' });
  service.registerKey('legends.enabled', { defaultValue: true, scope: 'session' });
  service.configureSession({
    id: 'current-session',
    restore: false,
    controllerOptions: { storage },
  });
  await service.saveSession({
    id: 'saved-scene-session',
    nickname: 'Saved Scene',
    networkFormat: 'xnet',
    networkData: new Uint8Array([1, 2, 3, 4]),
    visualizationState: helios.serializeVisualizationState(),
    retention: { enabled: false },
  });
  helios.currentBehaviorState = {
    ...helios.currentBehaviorState,
    layout: { options: { layoutType: 'force', parameters: { gravity: -0.5 } } },
    legends: { options: { enabled: true, scale: 1 } },
  };

  await service.restoreSession('saved-scene-session');

  assert.equal(helios.currentBehaviorState.layout.options.layoutType, 'radial');
  assert.equal(helios.currentBehaviorState.layout.options.parameters.gravity, -1.2);
  assert.equal(helios.currentBehaviorState.legends.options.enabled, false);
  assert.equal(service.keyStatus('layout.layoutType').state, 'default');
  assert.equal(service.keyStatus('layout.parameters.gravity').state, 'default');
  assert.equal(service.keyStatus('legends.enabled').state, 'default');
  assert.equal(service.getDirtyState().controls['layout.layoutType'], undefined);
  assert.equal(service.getDirtyState().controls['layout.parameters.gravity'], undefined);
  assert.equal(service.getDirtyState().controls['legends.enabled'], undefined);
  assert.equal(helios.importedVisualization.at(-1).options.hydratePersistence, false);
  assert.equal(helios.importedVisualization.at(-1).options.refreshPersistence, false);
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

test('savePortableNetwork writes async current positions into graph-only payloads', async () => {
  const networkPositions = new Float32Array([1, 2, 0, 4, 5, 0]);
  const delegatePositions = new Float32Array([1, 2, 7, 4, 5, 9]);
  let serializedPositions = null;
  const helios = Object.create(Helios.prototype);
  helios.network = {
    hasNetworkAttribute: () => false,
    getNodeAttributeBuffer: () => ({ view: networkPositions }),
    withBufferAccess: (fn) => fn(),
  };
  helios.visuals = {
    seedMissingPositions() {},
    withBufferAccess: (fn) => fn(),
  };
  helios.layers = { size: { width: 100, height: 100 } };
  helios.persistence = {
    set() {},
  };
  helios.serializeVisualizationStateAsync = async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    layoutRuntimeState: {
      positions: {
        encoding: 'float32-base64',
        length: delegatePositions.length,
        byteLength: delegatePositions.byteLength,
        data: encodeFloat32Base64(delegatePositions),
      },
    },
  });
  helios.saveNetwork = async () => {
    serializedPositions = new Float32Array(networkPositions);
    return Uint8Array.from([1, 2, 3]);
  };

  await helios.savePortableNetwork('xnet', {
    includeVisualization: false,
    includeCurrentPositions: true,
    output: 'uint8array',
  });

  assert.deepEqual(Array.from(serializedPositions), Array.from(delegatePositions));
  assert.deepEqual(Array.from(networkPositions), [1, 2, 0, 4, 5, 0]);
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

test('layout runtime async snapshot prefers active delegate in 3D before source flag catches up', async () => {
  const networkPositions = new Float32Array([0, 0, 0, 0, 0, 0]);
  const delegatePositions = new Float32Array([10, 11, 12, 13, 14, 15]);
  const delegate = { constructor: { name: 'PendingModeDelegate' } };
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
  helios._positionsConfig = { source: 'network', delegate: null };
  helios.mode = () => '3d';
  helios.snapshotDelegatePositions = async () => new Float32Array(delegatePositions);

  const state = await helios.snapshotLayoutRuntimeStateAsync();
  assert.equal(state.positionSource, 'delegate');
  assert.equal(state.delegateType, 'PendingModeDelegate');
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

test('layout runtime restore preserves depth when restoring planar positions into 3D mode', () => {
  const networkPositions = new Float32Array([0, 0, 0, 0, 0, 0]);
  const restoredPositions = new Float32Array([1, 2, 0, 4, 5, 0]);
  const delegateWrites = [];
  const delegate = {
    version: 2,
    options: { outputScale: 1 },
    writePositionSnapshot(snapshot) {
      delegateWrites.push(new Float32Array(snapshot));
      return true;
    },
    bumpVersion() {
      this.version += 1;
    },
  };
  const helios = Object.create(Helios.prototype);
  helios.mode = () => '3d';
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
    options: { radius: 200, depth: 200, outputScale: 1 },
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
  assert.notEqual(delegateWrites[0][2], 0);
  assert.notEqual(delegateWrites[0][5], 0);
  assert.notEqual(networkPositions[2], 0);
  assert.notEqual(networkPositions[5], 0);
  assert.deepEqual(Array.from(networkPositions), Array.from(delegateWrites[0]));
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
    { type: 'cameraControls', state: { autoFit: false, animation: true, autoFitIntervalMs: 1200 } },
    { type: 'camera', state: { mode: '2d', zoom: 2 } },
  ]);
});
