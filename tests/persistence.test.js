import test from 'node:test';
import assert from 'node:assert/strict';
import HeliosNetwork from 'helios-network';
import { Helios } from '../src/index.js';
import {
  BehaviorManager,
  createDefaultBehaviorRegistry,
} from '../src/behaviors/index.js';
import {
  HeliosPersistenceService,
  LocalStoragePreferenceStore,
  IndexedDBSessionStore,
  PERSISTENCE_KINDS,
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

class FakeHelios {
  constructor() {
    this.loaded = [];
    this.importedVisualization = [];
    this.currentBehaviorState = {
      selection: { options: { nodeClick: true }, selectedNodes: [1, 3] },
      hover: { options: { hoverLabel: true } },
    };
  }

  serializeVisualizationState(options = {}) {
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
      cameraState: { zoom: 3 },
      networkSource: { name: 'demo.xnet', format: 'xnet', nodeCount: 4, edgeCount: 2 },
    });
  }

  async importVisualizationState(source) {
    const envelope = parsePersistenceEnvelope(source, PERSISTENCE_KINDS.visualization);
    this.importedVisualization.push(envelope);
    return envelope;
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
  assert.equal(helios.importedVisualization[0].payload.uiState.theme, 'dark');
});

test('savePortableNetwork supports graph-only exports and graph-plus-visualization exports', async () => {
  const network = await HeliosNetwork.create({ directed: true, initialNodes: 0, initialEdges: 0 });
  try {
    const nodes = network.addNodes(3);
    network.addEdges([[nodes[0], nodes[1]], [nodes[1], nodes[2]]]);
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
    helios.persistence = {
      getPreferences: () => ({ autosave: true, responsive: { compactDockSide: 'left' } }),
    };
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
