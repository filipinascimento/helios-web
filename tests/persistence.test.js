import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  BrowserStorageManager,
  DummyStorageManager,
  PERSISTENCE_KINDS,
  applyOverridesToVisualizationState,
  createMemoryStorage,
  createPersistenceEnvelope,
  diffOverrideMaps,
  flattenVisualizationOverrides,
} from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

test('storage facade persists responsive preferences without a persistence service', async () => {
  const storage = new BrowserStorageManager({
    indexedDB: false,
    storage: createMemoryStorage(),
    restore: false,
  });

  await storage.updatePreferences({
    theme: 'dark',
    autosave: true,
    responsive: {
      compactDockSide: 'right',
      preferredMode: 'compact',
      lastViewportClass: 'desktop',
    },
  });

  assert.deepEqual(await storage.loadPreferences(), {
    theme: 'dark',
    autosave: true,
    responsive: {
      compactDockSide: 'right',
      preferredMode: 'compact',
      lastViewportClass: 'desktop',
    },
  });
  assert.equal(storage.states.status('ui.responsive.compactDockSide').state, 'changed');
});

test('storage facade mutates session nickname in the native session record', async () => {
  const storage = new BrowserStorageManager({
    indexedDB: false,
    storage: createMemoryStorage(),
    restore: false,
  });
  await storage.saveSession({
    id: 'nickname-session',
    nickname: 'Old Name',
    visualizationState: createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
  });

  await storage.setSessionNickname('New Name', 'nickname-session');
  const session = await storage.getSession('nickname-session');
  assert.equal(session.payload.session.nickname, 'New Name');
});

test('storage facade captures thumbnails through Helios figure preview export', async () => {
  const png = new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'image/png' });
  const storage = new DummyStorageManager({
    helios: {
      exportFigurePreviewBlob: async () => png,
    },
    sessionThumbnail: {
      maxWidth: 64,
      maxHeight: 48,
      maxBytes: 1024,
    },
  });

  const thumbnail = await storage.captureSessionThumbnail();
  assert.equal(thumbnail.type, 'image/png');
  assert.equal(thumbnail.encoding, 'data-url');
  assert.equal(thumbnail.width, 64);
  assert.equal(thumbnail.height, 48);
  assert.match(thumbnail.dataUrl, /^data:image\/png;base64,/);
});

test('remote storage manager delegates session blobs to its client', async () => {
  const saved = new Map();
  const storage = new BrowserStorageManager({
    indexedDB: false,
    storage: createMemoryStorage(),
    restore: false,
  });
  const { RemoteStorageManager } = await import('../src/index.js');
  const remote = new RemoteStorageManager({
    restore: false,
    client: {
      putSession: async (record) => {
        saved.set(record.id, record);
        return record;
      },
      getSession: async (id) => saved.get(id) ?? null,
      listSessions: async () => Array.from(saved.values()),
      deleteSession: async (id) => saved.delete(id),
    },
  });
  remote.restoreSnapshot(storage.serializeSnapshot());
  await remote.saveSession({
    id: 'remote-session',
    visualizationState: createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: remote.serializeSnapshot(),
    }),
  });

  assert.equal((await remote.getSession('remote-session')).payload.session.id, 'remote-session');
  assert.deepEqual((await remote.listSessionSummaries()).map((entry) => entry.id), ['remote-session']);
});

test('visualization override helpers are schema-owned and storage-ready', () => {
  const envelope = createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    behaviorState: {
      layout: { options: { parameters: { gravity: 0.5 } } },
    },
    cameraState: { mode: '2d', zoom: 1 },
  });
  const flattened = flattenVisualizationOverrides(envelope);
  assert.equal(flattened['layout.parameters.gravity'], 0.5);
  assert.equal(flattened['scene.dimension'], '2d');

  const diff = diffOverrideMaps(flattened, {
    ...flattened,
    'camera.zoom': 2,
    'scene.dimension': '3d',
  });
  const restored = applyOverridesToVisualizationState(envelope, diff);
  assert.equal(restored.payload.cameraState.zoom, 2);
  assert.equal(restored.payload.cameraState.mode, '3d');
});

test('production source does not reference removed persistence internals', async () => {
  const files = [
    'src/Helios.js',
    'src/index.js',
    'src/persistence/index.js',
    'src/storage/HeliosStorageManager.js',
    'src/ui/HeliosUI.js',
    'src/ui/controls/createDirtyIndicator.js',
    'src/ui/panels/panelSchema.js',
    'src/behaviors/BehaviorManager.js',
    'src/behaviors/InterfaceBehavior.js',
  ];
  const forbidden = [
    'HeliosPersistenceService',
    'HeliosSessionController',
    'PersistenceRegistry',
    'CentralizedPersistence',
    'helios.persistence',
    'recordSessionChange',
    'refreshBoundKeys',
    'hydrateVisualizationState',
    'persistenceService',
  ];

  for (const relative of files) {
    const source = await readFile(path.join(repoRoot, relative), 'utf8');
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${relative} contains ${token}`);
    }
  }
});
