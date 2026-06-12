import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrowserStorageManager,
  DummyStorageManager,
  FILTERS_PANEL_SCHEMA,
  Helios,
  HeliosStateManager,
  LABELS_PANEL_SCHEMA,
  LAYOUT_PANEL_SCHEMA,
  LEGENDS_PANEL_SCHEMA,
  MAPPERS_PANEL_SCHEMA,
  PERSISTENCE_KINDS,
  SCENE_PANEL_SCHEMA,
  SELECTION_PANEL_SCHEMA,
  SessionStore,
  createPersistenceEnvelope,
  createMemoryStorage,
  humanizeControlLabel,
  panelSchemaKeys,
  panelSchemaSectionKeys,
  panelSchemaSectionStatus,
  panelSchemaStatus,
  resolvePanelItemLabel,
} from '../src/index.js';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function positionRuntimeState(values, extra = {}) {
  const positions = values instanceof Float32Array ? values : new Float32Array(values);
  return {
    schema: 'helios-web.layout-runtime-state',
    version: 1,
    capturedAt: Date.now(),
    layoutType: 'TestLayout',
    positionSource: 'delegate',
    mode: '2d',
    layoutState: extra.layoutState ?? 'running',
    running: extra.running ?? true,
    alpha: extra.alpha ?? 0.25,
    center: extra.center ?? [0, 0, 0],
    nodeCount: Math.floor(positions.length / 3),
    positions: {
      encoding: 'float32-base64',
      length: positions.length,
      byteLength: positions.byteLength,
      data: Buffer.from(new Uint8Array(positions.buffer, positions.byteOffset, positions.byteLength)).toString('base64'),
    },
  };
}

test('Helios beforeunload warning reflects dirty storage status', () => {
  const previousWindow = globalThis.window;
  let beforeUnloadHandler = null;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener(type, handler) {
        if (type === 'beforeunload') beforeUnloadHandler = handler;
      },
      removeEventListener(type, handler) {
        if (type === 'beforeunload' && beforeUnloadHandler === handler) beforeUnloadHandler = null;
      },
    },
  });
  try {
    const host = {
      storage: {
        persistenceStatus: () => ({
          networkData: {
            dirty: true,
            positionsDirty: false,
          },
          sessionSync: { pending: false },
        }),
      },
      _beforeUnloadUnsavedChangesCleanup: null,
    };
    Helios.prototype._installUnsavedSessionBeforeUnloadWarning.call(host, {});
    assert.equal(typeof beforeUnloadHandler, 'function');
    const event = {
      defaultPrevented: false,
      returnValue: undefined,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    const message = beforeUnloadHandler(event);
    assert.equal(event.defaultPrevented, true);
    assert.match(message, /unsaved changes/i);
    assert.equal(event.returnValue, message);
    host._beforeUnloadUnsavedChangesCleanup();
    assert.equal(beforeUnloadHandler, null);
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});

test('HeliosStateManager tracks defaults, overrides, status, and reset by prefix', () => {
  const registry = new HeliosStateManager({ now: () => 10 });
  registry.register(null, 'behaviors.layout', {
    'parameters.gravity': {
      default: 0.5,
      type: 'number',
      scope: 'workspace',
    },
    running: {
      default: false,
      type: 'boolean',
      scope: 'session',
    },
  });

  assert.equal(registry.get('behaviors.layout.parameters.gravity'), 0.5);
  assert.equal(registry.status('behaviors.layout.parameters.gravity').state, 'default');

  const changed = registry.set('behaviors.layout.parameters.gravity', 0.75, {
    source: 'ui',
    reason: 'slider',
  });
  assert.equal(changed.changed, true);
  assert.equal(registry.status('behaviors.layout.parameters.gravity').state, 'changed');
  assert.equal(registry.status('behaviors.layout.parameters').state, 'partial');

  registry.set('behaviors.layout.running', true);
  assert.equal(registry.status('behaviors.layout').state, 'partial');

  const reset = registry.reset('behaviors.layout.parameters');
  assert.equal(reset.reset, true);
  assert.equal(registry.get('behaviors.layout.parameters.gravity'), 0.5);
  assert.equal(registry.status('behaviors.layout.parameters.gravity').state, 'default');
  assert.equal(registry.status('behaviors.layout').state, 'partial');
});

test('HeliosStateManager keyed subscriptions only notify matching keys and prefixes', () => {
  const registry = new HeliosStateManager();
  registry.register(null, 'appearance', {
    background: { default: '#000000ff', type: 'string' },
    'nodeStyle.sizeScale': { default: 1, type: 'number' },
  });
  registry.register(null, 'layout', {
    running: { default: false, type: 'boolean' },
  });

  let exact = 0;
  let prefix = 0;
  let unrelated = 0;
  const unsubscribeExact = registry.subscribe('appearance.nodeStyle.sizeScale', () => { exact += 1; });
  const unsubscribePrefix = registry.subscribe('appearance', () => { prefix += 1; });
  const unsubscribeUnrelated = registry.subscribe('layout', () => { unrelated += 1; });

  registry.set('appearance.nodeStyle.sizeScale', 2, { source: 'ui' });

  assert.equal(exact, 1);
  assert.equal(prefix, 1);
  assert.equal(unrelated, 0);

  unsubscribeExact();
  unsubscribePrefix();
  unsubscribeUnrelated();
});

test('StateEntry descriptors reject UI placement metadata', () => {
  const registry = new HeliosStateManager();
  assert.throws(() => {
    registry.register(null, 'helios.scene', {
      nodeSizeScale: {
        default: 1,
        ui: { panel: 'scene' },
      },
    });
  }, /must not define panel or section/);
});

test('HeliosStateManager aliases resolve panel keys to canonical state entries', () => {
  const registry = new HeliosStateManager();
  registry.register(null, 'behaviors.legends', {
    enabled: {
      default: true,
      type: 'boolean',
      aliases: ['legends.enabled'],
    },
    scale: {
      default: 1,
      type: 'number',
      aliases: ['legends.scale'],
    },
  });

  assert.equal(registry.entry('legends.enabled').key, 'behaviors.legends.enabled');
  assert.equal(registry.get('legends.enabled'), true);

  const result = registry.set('legends.enabled', false, { source: 'ui' });
  assert.equal(result.key, 'behaviors.legends.enabled');
  assert.equal(registry.get('behaviors.legends.enabled'), false);
  assert.equal(registry.status('legends.enabled').state, 'changed');
  assert.equal(registry.status('legends').state, 'partial');
  assert.equal(registry.dirtyState().controls['legends.enabled'], 'changed');

  registry.reset('legends.enabled');
  assert.equal(registry.get('behaviors.legends.enabled'), true);
  assert.equal(registry.status('behaviors.legends.enabled').state, 'default');
});

test('HeliosStateManager tracks explicit overrides even when the value equals the default', () => {
  const registry = new HeliosStateManager();
  registry.register(null, 'appearance', {
    background: { default: [0, 0, 0, 1], type: 'array' },
  });

  registry.set('appearance.background', [0, 0, 0, 1], { source: 'ui' });
  assert.equal(registry.status('appearance.background').state, 'changed');
  assert.deepEqual(registry.getOverrides(), { 'appearance.background': [0, 0, 0, 1] });

  registry.reset('appearance.background');
  assert.equal(registry.status('appearance.background').state, 'default');
  assert.deepEqual(registry.getOverrides(), {});
});

test('HeliosStorageManager suppresses initialization overrides until tracking is ready', () => {
  const storage = new DummyStorageManager({ overrideTrackingReady: false });
  storage.states.register(null, 'appearance', {
    background: { default: [0, 0, 0, 1], type: 'array' },
  });

  storage.states.set('appearance.background', [0.01, 0.01, 0.02, 1], { source: 'binding' });
  storage.states.set('appearance.background', [0.02, 0.02, 0.03, 1], { source: 'config' });
  storage.states.set('appearance.background', [0.03, 0.03, 0.04, 1]);
  assert.equal(storage.states.status('appearance.background').state, 'default');
  assert.deepEqual(storage.states.getOverrides(), {});

  storage.setOverrideTrackingReady(true);
  storage.states.set('appearance.background', [0.01, 0.01, 0.02, 1], { source: 'program' });
  assert.equal(storage.states.status('appearance.background').state, 'changed');
});

test('HeliosStorageManager tracks explicit program and CLI overrides during startup gate', () => {
  const storage = new DummyStorageManager({ overrideTrackingReady: false });
  storage.states.register(null, 'appearance', {
    background: { default: [0, 0, 0, 1], type: 'array' },
    alpha: { default: 1, type: 'number' },
  });

  storage.states.set('appearance.background', [0, 0, 0, 1], { source: 'program' });
  storage.states.set('appearance.alpha', 1, { source: 'cli' });

  assert.equal(storage.states.status('appearance.background').state, 'changed');
  assert.equal(storage.states.status('appearance.alpha').state, 'changed');
  assert.deepEqual(storage.states.getOverrides(), {
    'appearance.background': [0, 0, 0, 1],
    'appearance.alpha': 1,
  });
});

test('HeliosStateManager exports overrides with alias-preferred keys for sparse snapshots', () => {
  const registry = new HeliosStateManager();
  registry.register(null, 'behaviors.layout', {
    'parameters.gravity': {
      default: 0,
      type: 'number',
      aliases: ['layout.parameters.gravity'],
    },
    running: {
      default: false,
      type: 'boolean',
    },
  });

  registry.set('behaviors.layout.parameters.gravity', -1.25);
  registry.set('behaviors.layout.running', true);

  assert.deepEqual(registry.getOverrides({ aliases: 'preferred' }), {
    'layout.parameters.gravity': -1.25,
    'behaviors.layout.running': true,
  });
  assert.deepEqual(registry.getOverrides({ aliases: false }), {
    'behaviors.layout.parameters.gravity': -1.25,
    'behaviors.layout.running': true,
  });
  assert.deepEqual(registry.getOverrides({ aliases: 'all' }), {
    'behaviors.layout.parameters.gravity': -1.25,
    'layout.parameters.gravity': -1.25,
    'behaviors.layout.running': true,
  });

  const snapshot = registry.snapshot({ aliases: 'preferred' });
  assert.deepEqual(snapshot.overrides, {
    'layout.parameters.gravity': -1.25,
    'behaviors.layout.running': true,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'values'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot, 'journal'), false);
});

test('HeliosStorageManager stores sparse override state, not full live state values', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'appearance', {
    background: { default: [0, 0, 0, 1], type: 'array' },
    'nodeStyle.sizeScale': { default: 1, type: 'number' },
    'edgeStyle.widthScale': { default: 1, type: 'number' },
  });

  storage.states.set('appearance.nodeStyle.sizeScale', 2, { source: 'ui' });
  storage.states.set('appearance.edgeStyle.widthScale', 1, { source: 'ui' });
  storage.states.reset('appearance.edgeStyle.widthScale');

  const snapshot = storage.serializeSnapshot();
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.state, 'values'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot.state, 'journal'), false);
  assert.deepEqual(snapshot.state.overrides, {
    'appearance.nodeStyle.sizeScale': 2,
  });
});

test('HeliosStateManager aggregates child override status under an exact parent entry', () => {
  const registry = new HeliosStateManager();
  registry.register(null, 'behaviors.layout', {
    parameters: {
      default: {},
      type: 'object',
      aliases: ['layout.parameters'],
    },
    'parameters.gravity': {
      default: 0.5,
      type: 'number',
      aliases: ['layout.parameters.gravity'],
    },
  });

  assert.equal(registry.status('layout.parameters').state, 'default');
  registry.set('layout.parameters.gravity', 0.75);
  assert.equal(registry.status('layout.parameters.gravity').state, 'changed');
  assert.equal(registry.status('layout.parameters').state, 'partial');
});

test('HeliosStateManager migrates restored alias values when the canonical entry registers later', () => {
  const registry = new HeliosStateManager();
  registry.restore({
    'layout.parameters.gravity': 0.75,
  });
  assert.equal(registry.status('layout.parameters.gravity').state, 'changed');

  registry.register(null, 'behaviors.layout', {
    'parameters.gravity': {
      default: 0.5,
      type: 'number',
      aliases: ['layout.parameters.gravity'],
    },
  });

  assert.equal(registry.get('behaviors.layout.parameters.gravity'), 0.75);
  assert.equal(registry.status('behaviors.layout.parameters.gravity').state, 'changed');
  assert.deepEqual(registry.getOverrides({ aliases: 'preferred' }), {
    'layout.parameters.gravity': 0.75,
  });
});

test('DummyStorageManager restores snapshots and preserves changed status', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'filters', {
    rules: { default: [], type: 'array' },
  });
  storage.restoreSnapshot({
    state: {
      overrides: {
        'filters.rules': [{ attribute: 'group', op: 'eq', value: 'A' }],
      },
    },
  });

  assert.deepEqual(storage.states.get('filters.rules'), [{ attribute: 'group', op: 'eq', value: 'A' }]);
  assert.equal(storage.states.status('filters.rules').state, 'changed');
});

test('DummyStorageManager can restore snapshot values without tracking overrides', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'appearance', {
    background: { default: '#000000ff', type: 'string' },
    'nodeStyle.sizeScale': { default: 1, type: 'number' },
  });

  storage.restoreSnapshot({
    state: {
      overrides: {
        'appearance.background': '#ffffffff',
        'appearance.nodeStyle.sizeScale': 2,
      },
    },
  }, {
    trackOverride: false,
    reason: 'compatibility-restore',
  });

  assert.equal(storage.states.get('appearance.background'), '#ffffffff');
  assert.equal(storage.states.get('appearance.nodeStyle.sizeScale'), 2);
  assert.equal(storage.states.status('appearance.background').state, 'default');
  assert.equal(storage.states.status('appearance.nodeStyle.sizeScale').state, 'default');
  assert.deepEqual(storage.states.getOverrides(), {});
});

test('Helios importVisualizationState restores storage snapshots through storage sanitization', async () => {
  const states = new HeliosStateManager();
  const helios = Object.create(Helios.prototype);
  Object.assign(helios, {
    states,
    mode: () => '2d',
    behaviors: { restore: () => {} },
    behavior: {},
    _snapshotCameraState: () => null,
    _restoreCameraState: () => {},
    _restoreCameraControlState: () => {},
  });
  helios.storage = new DummyStorageManager({ helios, states });
  states.register(null, 'behaviors.appearance', {
    nodeSizeScale: {
      default: 1,
      type: 'number',
      aliases: ['appearance.nodeStyle.sizeScale'],
    },
    edgeOpacityScale: {
      default: 0.5,
      type: 'number',
      aliases: ['appearance.edgeStyle.opacityScale'],
    },
  });

  await helios.importVisualizationState(createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    behaviorState: {},
    cameraState: null,
    cameraControlState: null,
    layoutRuntimeState: null,
    storageState: {
      state: {
        overrides: {
          'appearance.nodeStyle.sizeScale': 1,
          'appearance.edgeStyle.opacityScale': 0.25,
        },
        journal: [
          {
            requestedKey: 'appearance.nodeStyle.sizeScale',
            source: 'binding',
            reason: 'attach',
          },
          {
            requestedKey: 'appearance.edgeStyle.opacityScale',
            source: 'ui',
            reason: 'slider',
          },
        ],
      },
    },
  }));

  assert.equal(states.status('appearance.nodeStyle.sizeScale').state, 'default');
  assert.equal(states.status('appearance.edgeStyle.opacityScale').state, 'changed');
  assert.deepEqual(states.getOverrides({ aliases: 'preferred' }), {
    'appearance.edgeStyle.opacityScale': 0.25,
  });
});

test('HeliosStorageManager keeps hot UI writes local and cheap', async () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'behaviors.appearance', {
    nodeSizeScale: {
      default: 1,
      type: 'number',
      aliases: ['appearance.nodeStyle.sizeScale'],
      ui: { debounceMs: 20 },
    },
  });

  storage.states.set('appearance.nodeStyle.sizeScale', 2, { source: 'ui' });
  storage.states.set('appearance.nodeStyle.sizeScale', 3, { source: 'ui' });
  storage.states.set('appearance.nodeStyle.sizeScale', 4, { source: 'ui' });

  assert.equal(storage.states.get('appearance.nodeStyle.sizeScale'), 4);
  await wait(35);
  assert.equal(storage.states.get('appearance.nodeStyle.sizeScale'), 4);
  assert.deepEqual(storage.states.getOverrides({ aliases: 'preferred' }), {
    'appearance.nodeStyle.sizeScale': 4,
  });
});

test('HeliosStorageManager can suppress binding echo for already-applied UI writes', () => {
  let liveValue = 1;
  let setterCalls = 0;
  const storage = new DummyStorageManager();
  storage.states.register(null, 'appearance', {
    background: {
      default: '#000000ff',
      type: 'string',
      getter: () => liveValue,
      setter: (value) => {
        setterCalls += 1;
        liveValue = value;
      },
    },
  });

  liveValue = '#111111ff';
  storage.states.set('appearance.background', '#111111ff', {
    source: 'ui',
    applyBinding: false,
  });

  assert.equal(setterCalls, 0);
  assert.equal(storage.states.get('appearance.background'), '#111111ff');

  storage.states.set('appearance.background', '#222222ff', { source: 'program' });
  assert.equal(setterCalls, 1);
  assert.equal(liveValue, '#222222ff');
});

test('HeliosStorageManager binding refreshes do not create overrides unless explicit', () => {
  let notify = null;
  const storage = new DummyStorageManager();
  storage.states.register(null, 'appearance', {
    background: {
      default: [0, 0, 0, 1],
      type: 'array',
      subscribe: (callback) => {
        notify = callback;
        return () => {};
      },
    },
  });

  notify?.([0.01, 0.01, 0.02, 1], { source: 'binding', reason: 'refresh' });
  assert.deepEqual(storage.states.get('appearance.background'), [0.01, 0.01, 0.02, 1]);
  assert.equal(storage.states.status('appearance.background').state, 'default');
  assert.deepEqual(storage.states.getOverrides(), {});

  notify?.([0, 0, 0, 1], {
    source: 'program',
    reason: 'explicit-set',
    storageKeys: ['appearance.background'],
  });
  assert.deepEqual(storage.states.get('appearance.background'), [0, 0, 0, 1]);
  assert.equal(storage.states.status('appearance.background').state, 'changed');
  assert.deepEqual(storage.states.getOverrides(), { 'appearance.background': [0, 0, 0, 1] });
});

test('HeliosStorageManager drops legacy implicit appearance overrides during snapshot restore', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'behaviors.appearance', {
    nodeSizeScale: {
      default: 1,
      type: 'number',
      aliases: ['appearance.nodeStyle.sizeScale'],
    },
    edgeWidthScale: {
      default: 1,
      type: 'number',
      aliases: ['appearance.edgeStyle.widthScale'],
    },
    edgeOpacityScale: {
      default: 0.5,
      type: 'number',
      aliases: ['appearance.edgeStyle.opacityScale'],
    },
  });

  storage.restoreSnapshot({
    state: {
      overrides: {
        'behaviors.appearance.nodeSizeScale': 1,
        'appearance.edgeStyle.widthScale': 1,
        'appearance.edgeStyle.opacityScale': 0.25,
      },
      journal: [
        {
          key: 'behaviors.appearance.nodeSizeScale',
          source: 'binding',
          reason: 'attach',
        },
        {
          key: 'behaviors.appearance.edgeWidthScale',
          requestedKey: 'appearance.edgeStyle.widthScale',
          source: 'binding',
          reason: 'attach',
        },
        {
          key: 'behaviors.appearance.edgeOpacityScale',
          requestedKey: 'appearance.edgeStyle.opacityScale',
          source: 'ui',
          reason: 'control',
        },
      ],
    },
  });

  assert.equal(storage.states.status('appearance.nodeStyle.sizeScale').state, 'default');
  assert.equal(storage.states.status('appearance.edgeStyle.widthScale').state, 'default');
  assert.equal(storage.states.status('appearance.edgeStyle.opacityScale').state, 'changed');
  assert.deepEqual(storage.states.getOverrides({ aliases: 'preferred' }), {
    'appearance.edgeStyle.opacityScale': 0.25,
  });
});

test('HeliosStorageManager repairs broad no-journal legacy appearance default overrides', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'behaviors.appearance', {
    background: {
      default: [0.01, 0.01, 0.02, 1],
      type: 'array',
      aliases: ['appearance.background'],
    },
    edgeTransparencyMode: {
      default: 'weighted',
      type: 'string',
      aliases: ['appearance.edgeTransparencyMode'],
    },
    nodeSizeScale: {
      default: 1,
      type: 'number',
      aliases: ['appearance.nodeStyle.sizeScale'],
    },
    edgeWidthScale: {
      default: 1,
      type: 'number',
      aliases: ['appearance.edgeStyle.widthScale'],
    },
    edgeOpacityScale: {
      default: 0.5,
      type: 'number',
      aliases: ['appearance.edgeStyle.opacityScale'],
    },
  });

  storage.restoreSnapshot({
    state: {
      overrides: {
        'appearance.background': [0.01, 0.01, 0.02, 1],
        'appearance.edgeTransparencyMode': 'weighted',
        'appearance.nodeStyle.sizeScale': 1,
        'appearance.edgeStyle.widthScale': 1,
        'appearance.edgeStyle.opacityScale': 0.25,
      },
    },
  });

  assert.equal(storage.states.status('appearance.background').state, 'default');
  assert.equal(storage.states.status('appearance.edgeTransparencyMode').state, 'default');
  assert.equal(storage.states.status('appearance.nodeStyle.sizeScale').state, 'default');
  assert.equal(storage.states.status('appearance.edgeStyle.widthScale').state, 'default');
  assert.equal(storage.states.status('appearance.edgeStyle.opacityScale').state, 'changed');
  assert.deepEqual(storage.states.getOverrides({ aliases: 'preferred' }), {
    'appearance.edgeStyle.opacityScale': 0.25,
  });
});

test('DummyStorageManager tracks runtime state without persistent UI capabilities', () => {
  const storage = new DummyStorageManager();
  assert.deepEqual(storage.capabilities, {
    persistent: false,
    sessions: false,
    network: false,
    remote: false,
  });
  storage.states.register(null, 'helios.scene', {
    nodeSizeScale: { default: 1, type: 'number' },
  });
  storage.states.set('helios.scene.nodeSizeScale', 2, { source: 'program' });
  assert.equal(storage.states.status('helios.scene.nodeSizeScale').state, 'changed');
  assert.equal(storage.serializeSnapshot().state.overrides['helios.scene.nodeSizeScale'], 2);
});

test('BrowserStorageManager generates short random session ids without a session prefix', () => {
  const storage = new BrowserStorageManager({
    indexedDB: false,
    storage: createMemoryStorage(),
    restore: false,
  });

  const configured = storage.configureSession({});

  assert.match(configured.sessionId, /^[a-z0-9]{10}$/);
  assert.equal(configured.sessionId.includes('session'), false);
  assert.equal(configured.sessionId.includes(':'), false);
  assert.equal(configured.requestedSessionId, null);
});

test('BrowserStorageManager can save and silently load a valid explicit session id', async () => {
  const backing = createMemoryStorage();
  const first = new BrowserStorageManager({
    indexedDB: false,
    storage: backing,
    sessionId: 'valid-session',
    restore: false,
  });
  first.states.register(null, 'helios.theme', {
    value: { default: 'dark', type: 'string' },
  });
  first.states.set('helios.theme.value', 'light');
  await first.saveSession({ id: 'valid-session' });

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const second = new BrowserStorageManager({
      indexedDB: false,
      storage: backing,
      sessionId: 'valid-session',
      restore: false,
    });
    second.states.register(null, 'helios.theme', {
      value: { default: 'dark', type: 'string' },
    });
    await second.restoreActiveSession();
    assert.equal(second.explicitSessionInvalid, false);
    assert.equal(second.states.get('helios.theme.value'), 'light');
    assert.deepEqual(warnings, []);
  } finally {
    console.warn = originalWarn;
  }
});

test('BrowserStorageManager warns for an invalid explicit session id and still exposes resumable sessions', async () => {
  const backing = createMemoryStorage();
  const saved = new BrowserStorageManager({
    indexedDB: false,
    storage: backing,
    restore: false,
  });
  await saved.saveSession({
    id: 'available-session',
    nickname: 'Available',
  });

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    const storage = new BrowserStorageManager({
      indexedDB: false,
      storage: backing,
      sessionId: 'missing-session',
    });
    await storage.ready;
    assert.equal(storage.explicitSessionInvalid, true);
    assert.match(warnings.join('\n'), /missing-session/);
    assert.deepEqual(
      (await storage.getResumeSessions()).map((entry) => entry.id),
      ['available-session'],
    );
  } finally {
    console.warn = originalWarn;
  }
});

test('BrowserStorageManager owns browser session save, list, get, and delete paths', async () => {
  const storage = new BrowserStorageManager({
    indexedDB: false,
    storage: createMemoryStorage(),
    restore: false,
  });
  const saved = await storage.saveSession({
    id: 'native-session',
    nickname: 'Native',
    visualizationState: createPersistenceEnvelope('visualization', {
      storageState: storage.serializeSnapshot(),
    }),
  });
  assert.equal(saved.payload.session.id, 'native-session');
  assert.equal(storage.sessionId, null);
  assert.equal((await storage.getSession('native-session')).payload.session.nickname, 'Native');
  assert.deepEqual((await storage.listSessionSummaries()).map((entry) => entry.id), ['native-session']);
  assert.equal(await storage.deleteSession('native-session'), true);
});

test('BrowserStorageManager session summaries count split binary payloads without JSON inflation', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let storage = null;
  const helios = {
    serializeTrackedVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }, { sparse: true }),
    savePortableNetwork: async () => new Uint8Array(400_000),
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'binary-size-session',
    sessionStore: new SessionStore({ store }),
    restore: false,
  });

  await storage.saveSession({ id: 'binary-size-session', captureThumbnail: false });
  const raw = records.get('binary-size-session');
  const networkRecord = records.get('binary-size-session::network-data');
  const [summary] = await storage.listSessionSummaries({ includeAllWorkspaces: true, includeFinished: true });

  assert.equal(raw.payload.networkData.data, null);
  assert.equal(raw.payload.networkData.byteLength, 400_000);
  assert.equal(networkRecord.data.byteLength, 400_000);
  assert.equal(summary.networkBytes, 400_000);
  assert.equal(summary.positionBytes, 0);
  assert.equal(summary.bytes > 400_000, true);
  assert.equal(summary.bytes < 450_000, true);
});

test('BrowserStorageManager state-only autosave does not rewrite network side records', async () => {
  const records = new Map();
  const putLog = [];
  const store = {
    async put(record) {
      putLog.push({
        id: record.id,
        kind: record.kind ?? null,
        hasNetworkBytes: record?.payload?.networkData?.data != null || record?.data != null,
      });
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let networkSaves = 0;
  const networkSaveOptions = [];
  let thumbnails = 0;
  let visualizationSerializes = 0;
  let storage = null;
  const helios = {
    serializeVisualizationStateAsync: async () => {
      visualizationSerializes += 1;
      return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
        storageState: storage.serializeSnapshot(),
        cameraState: { mode: '2d', zoom: 1 },
        networkSource: { baseName: 'grid', name: 'grid' },
      });
    },
    savePortableNetwork: async (_format, options = {}) => {
      networkSaves += 1;
      networkSaveOptions.push({ ...options });
      return Uint8Array.from([1, 2, 3, 4]);
    },
    exportFigurePreviewBlob: async () => {
      thumbnails += 1;
      return new Blob(['thumbnail'], { type: 'image/png' });
    },
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'incremental-session',
    sessionStore: new SessionStore({ store }),
    sessionThumbnail: {
      autosaveMinIntervalMs: false,
    },
    restore: false,
  });
  storage.states.register(null, 'helios.theme', {
    value: { default: 'dark', type: 'string' },
  });

  storage.markNetworkDirty('network-replaced');
  await wait(800);
  assert.equal(networkSaves, 1);
  assert.equal(thumbnails, 0);
  assert.equal(visualizationSerializes, 1);
  assert.ok(putLog.some((entry) => entry.kind === 'session-network-data' && entry.hasNetworkBytes));

  putLog.length = 0;
  visualizationSerializes = 0;
  storage.states.set('helios.theme.value', 'light', {
    source: 'ui',
    reason: 'theme-control',
    debounceMs: 5,
  });
  await wait(50);
  assert.equal(networkSaves, 1);
  assert.equal(thumbnails, 0);
  assert.equal(visualizationSerializes, 0);
  assert.deepEqual(
    putLog.map((entry) => [entry.id, entry.kind, entry.hasNetworkBytes]),
    [['incremental-session', 'session', false]],
  );

  const restored = await storage.getSession('incremental-session');
  assert.equal(restored.payload.networkData.data.byteLength, 4);
  assert.equal(restored.payload.visualizationState.payload.storageState.state.overrides['helios.theme.value'], 'light');
});

test('BrowserStorageManager position autosave writes separate binary positions without rewriting network payload', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let storage = null;
  const networkSaveOptions = [];
  let networkPayloadByte = 10;
  let currentPositions = new Float32Array([1, 2, 3, 4, 5, 6]);
  const helios = {
    snapshotLayoutRuntimeStateAsync: async () => positionRuntimeState(currentPositions),
    serializeTrackedVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      behaviorState: {},
      cameraState: null,
      layoutRuntimeState: null,
      overrides: storage.states.getOverrides({ aliases: 'preferred' }),
      storageState: storage.serializeSnapshot(),
    }, { sparse: true }),
    savePortableNetwork: async (_format, options = {}) => {
      networkSaveOptions.push({ ...options });
      networkPayloadByte += 1;
      return Uint8Array.from([networkPayloadByte]);
    },
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'position-autosave-session',
    sessionStore: new SessionStore({ store }),
    restore: false,
  });

  await storage.saveSession({ id: 'position-autosave-session' });
  assert.equal((await storage.getSession('position-autosave-session')).payload.networkData.data[0], 11);

  currentPositions = new Float32Array([7, 8, 9, 10, 11, 12]);
  storage.markPositionsDirty('layout-update');
  assert.equal(Number.isFinite(storage.status().networkData.dirtyAt), true);
  await wait(2600);

  const restored = await storage.getSession('position-autosave-session');
  assert.equal(restored.payload.networkData.data[0], 11);
  assert.equal(networkSaveOptions.length, 1);
  assert.equal(restored.payload.positionData.encoding, 'float32');
  assert.equal(restored.payload.positionData.length, currentPositions.length);
  assert.equal(restored.payload.positionData.byteLength, currentPositions.byteLength);
  assert.equal(restored.payload.positionData.data instanceof Uint8Array, true);
  assert.equal(storage.status().networkData.positionsDirty, false);
  assert.equal(storage.status().networkData.status, 'saved');
  assert.equal(storage.status().networkData.dirtyAt, null);
});

test('BrowserStorageManager disables autosync for oversized position payloads but manual sync saves them', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let storage = null;
  const snapshotOptions = [];
  let currentPositions = new Float32Array([1, 2, 0, 3, 4, 0, 5, 6, 0]);
  const helios = {
    network: { nodeCount: 3, edgeCount: 0 },
    snapshotLayoutRuntimeStateAsync: async (options = {}) => {
      snapshotOptions.push({ ...options });
      const maxPositionBytes = Number(options.maxPositionBytes);
      if (Number.isFinite(maxPositionBytes) && currentPositions.byteLength > maxPositionBytes) {
        const skipped = positionRuntimeState(currentPositions);
        delete skipped.positions;
        skipped.positionsSkipped = {
          reason: 'size-limit',
          byteLength: currentPositions.byteLength,
          maxBytes: maxPositionBytes,
        };
        return skipped;
      }
      return positionRuntimeState(currentPositions);
    },
    serializeTrackedVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      behaviorState: {},
      cameraState: null,
      layoutRuntimeState: null,
      overrides: storage.states.getOverrides({ aliases: 'preferred' }),
      storageState: storage.serializeSnapshot(),
    }, { sparse: true }),
    savePortableNetwork: async () => Uint8Array.from([51]),
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'large-position-autosync-session',
    sessionStore: new SessionStore({ store }),
    autosyncPayloadLimits: {
      positionMaxBytes: 24,
      networkMaxNodes: 1000,
    },
    restore: false,
  });

  try {
    await storage.saveSession({
      id: 'large-position-autosync-session',
      captureThumbnail: false,
    });
    currentPositions = new Float32Array([7, 8, 0, 9, 10, 0, 11, 12, 0]);
    storage.markPositionsDirty('layout-update');
    await wait(50);

    let status = storage.status().networkData;
    assert.equal(status.dirty, true);
    assert.equal(status.positionsDirty, true);
    assert.equal(status.autosyncDisabled, true);
    assert.equal(status.autosyncDisabledReason.scope, 'positions');
    assert.equal(storage.states.get('network.persistence.autosave'), false);
    assert.equal(records.has('large-position-autosync-session::position-data'), false);
    assert.equal(snapshotOptions.length, 0);

    await storage.sync({
      includeNetwork: true,
      includePositions: true,
      captureThumbnail: false,
    });

    const restored = await storage.getSession('large-position-autosync-session');
    status = storage.status().networkData;
    assert.equal(status.dirty, false);
    assert.equal(status.positionsDirty, false);
    assert.equal(status.autosyncDisabled, true);
    assert.equal(restored.payload.positionData.encoding, 'float32');
    assert.equal(restored.payload.positionData.length, currentPositions.length);
    assert.equal(records.has('large-position-autosync-session::position-data'), true);
    assert.equal(snapshotOptions.length, 1);
    assert.equal(snapshotOptions[0].maxPositionBytes, Number.MAX_SAFE_INTEGER);

    const restoredStorage = new BrowserStorageManager({
      helios: {
        network: { nodeCount: 3, edgeCount: 0 },
      },
      sessionId: 'large-position-autosync-session',
      sessionStore: new SessionStore({ store }),
      autosyncPayloadLimits: {
        positionMaxBytes: 24,
        networkMaxNodes: 1000,
      },
      restore: false,
    });
    try {
      await restoredStorage.loadSession('large-position-autosync-session');
      const restoredStatus = restoredStorage.status().networkData;
      assert.equal(restoredStatus.dirty, false);
      assert.equal(restoredStatus.positionsDirty, false);
      assert.equal(restoredStatus.status, 'saved');
      assert.equal(restoredStatus.autosyncDisabled, true);
      assert.equal(restoredStatus.autosyncDisabledReason.scope, 'positions');
      assert.equal(restoredStorage.states.get('network.persistence.autosave'), false);
    } finally {
      restoredStorage.destroy();
    }
  } finally {
    storage.destroy();
  }
});

test('BrowserStorageManager position autosave is not starved by merged UI state while layout runs', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let storage = null;
  let networkPayloadByte = 20;
  const networkSaveOptions = [];
  let currentPositions = new Float32Array([1, 1, 0, 2, 2, 0]);
  const helios = {
    behavior: {
      layout: {
        state: { running: true },
      },
    },
    snapshotLayoutRuntimeStateAsync: async () => positionRuntimeState(currentPositions),
    serializeTrackedVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      behaviorState: {},
      cameraState: null,
      layoutRuntimeState: null,
      overrides: storage.states.getOverrides({ aliases: 'preferred' }),
      storageState: storage.serializeSnapshot(),
    }, { sparse: true }),
    savePortableNetwork: async (_format, options = {}) => {
      networkSaveOptions.push({ ...options });
      networkPayloadByte += 1;
      return Uint8Array.from([networkPayloadByte]);
    },
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'position-autosave-merged-ui-session',
    sessionStore: new SessionStore({ store }),
    autosyncInteractionIdleMs: 250,
    restore: false,
  });
  storage.states.register(null, 'ui.responsive', {
    lastViewportClass: { default: null, type: 'string' },
  });

  await storage.saveSession({
    id: 'position-autosave-merged-ui-session',
    captureThumbnail: false,
  });
  assert.equal((await storage.getSession('position-autosave-merged-ui-session')).payload.networkData.data[0], 21);

  currentPositions = new Float32Array([3, 3, 0, 4, 4, 0]);
  storage.markPositionsDirty('layout-update');
  storage.states.set('ui.responsive.lastViewportClass', 'desktop', {
    source: 'ui',
    reason: 'responsive-class',
    debounceMs: 5,
  });
  await wait(2600);

  const restored = await storage.getSession('position-autosave-merged-ui-session');
  assert.equal(restored.payload.networkData.data[0], 21);
  assert.equal(networkSaveOptions.length, 1);
  assert.equal(restored.payload.positionData.encoding, 'float32');
  assert.equal(restored.payload.positionData.length, currentPositions.length);
  assert.equal(restored.payload.visualizationState.payload.storageState.state.overrides['ui.responsive.lastViewportClass'], 'desktop');
  assert.equal(storage.status().networkData.positionsDirty, false);
  assert.equal(storage.status().networkData.status, 'saved');
});

test('BrowserStorageManager position autosave is not starved by camera notifications after interaction idle', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  class FakeHelios extends EventTarget {
    on(type, handler) {
      this.addEventListener(type, handler);
      return () => this.removeEventListener(type, handler);
    }
  }
  let storage = null;
  let networkPayloadByte = 30;
  const networkSaveOptions = [];
  let currentPositions = new Float32Array([1, 0, 0, 2, 0, 0]);
  const helios = new FakeHelios();
  helios.behavior = {
    layout: {
      state: { running: true },
    },
  };
  helios.snapshotLayoutRuntimeStateAsync = async () => positionRuntimeState(currentPositions);
  helios.serializeTrackedVisualizationStateAsync = async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    behaviorState: {},
    cameraState: null,
    layoutRuntimeState: null,
    overrides: storage.states.getOverrides({ aliases: 'preferred' }),
    storageState: storage.serializeSnapshot(),
  }, { sparse: true });
  helios.savePortableNetwork = async (_format, options = {}) => {
    networkSaveOptions.push({ ...options });
    networkPayloadByte += 1;
    return Uint8Array.from([networkPayloadByte]);
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'position-autosave-camera-session',
    sessionStore: new SessionStore({ store }),
    autosyncInteractionIdleMs: 1000,
    restore: false,
  });

  await storage.saveSession({
    id: 'position-autosave-camera-session',
    captureThumbnail: false,
  });
  assert.equal((await storage.getSession('position-autosave-camera-session')).payload.networkData.data[0], 31);

  currentPositions = new Float32Array([5, 0, 0, 6, 0, 0]);
  storage.markPositionsDirty('layout-update');
  const interval = setInterval(() => {
    helios.dispatchEvent(new Event('camera:move'));
  }, 100);
  try {
    await wait(2400);
  } finally {
    clearInterval(interval);
    storage.destroy();
  }

  const restored = await storage.getSession('position-autosave-camera-session');
  assert.equal(restored.payload.networkData.data[0], 31);
  assert.equal(networkSaveOptions.length, 1);
  assert.equal(restored.payload.positionData.encoding, 'float32');
  assert.equal(restored.payload.positionData.length, currentPositions.length);
  assert.equal(storage.status().networkData.positionsDirty, false);
  assert.equal(storage.status().networkData.status, 'saved');
});

test('BrowserStorageManager position autosave waits for user interaction idle debounce', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  class FakeHelios extends EventTarget {
    on(type, handler) {
      this.addEventListener(type, handler);
      return () => this.removeEventListener(type, handler);
    }
  }
  let storage = null;
  let networkPayloadByte = 40;
  let currentPositions = new Float32Array([1, 2, 0, 3, 4, 0]);
  const helios = new FakeHelios();
  helios.snapshotLayoutRuntimeStateAsync = async () => positionRuntimeState(currentPositions);
  helios.serializeTrackedVisualizationStateAsync = async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    behaviorState: {},
    cameraState: null,
    layoutRuntimeState: null,
    overrides: storage.states.getOverrides({ aliases: 'preferred' }),
    storageState: storage.serializeSnapshot(),
  }, { sparse: true });
  helios.savePortableNetwork = async () => {
    networkPayloadByte += 1;
    return Uint8Array.from([networkPayloadByte]);
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'position-autosave-user-idle-session',
    sessionStore: new SessionStore({ store }),
    autosyncInteractionIdleMs: 1000,
    restore: false,
  });

  try {
    await storage.saveSession({
      id: 'position-autosave-user-idle-session',
      captureThumbnail: false,
    });
    assert.equal((await storage.getSession('position-autosave-user-idle-session')).payload.networkData.data[0], 41);

    currentPositions = new Float32Array([8, 9, 0, 10, 11, 0]);
    storage.markPositionsDirty('layout-update');
    await wait(1800);
    helios.dispatchEvent(new CustomEvent('camera:move', {
      detail: { origin: 'interaction', action: 'pan' },
    }));
    await wait(350);
    assert.equal((await storage.getSession('position-autosave-user-idle-session')).payload.networkData.data[0], 41);

    await wait(900);
    const restored = await storage.getSession('position-autosave-user-idle-session');
    assert.equal(restored.payload.networkData.data[0], 41);
    assert.equal(restored.payload.positionData.encoding, 'float32');
    assert.equal(restored.payload.positionData.length, currentPositions.length);
    assert.equal(storage.status().networkData.positionsDirty, false);
    assert.equal(storage.status().networkData.status, 'saved');
  } finally {
    storage.destroy();
  }
});

test('BrowserStorageManager session restore adopts network positions as layout baseline and restores run state', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  const calls = {
    loadNetwork: [],
    adoptBaseline: [],
    importVisualizationState: [],
  };
  const layoutRuntimeState = {
    schema: 'helios-web.layout-runtime-state',
    version: 1,
    layoutState: 'running',
    running: true,
    alpha: 0.12,
    center: [1, 2, 0],
  };
  const visualizationState = createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
    storageState: {
      state: {
        schema: 'helios-web.state',
        version: 1,
        overrides: {},
      },
    },
    layoutRuntimeState,
  });
  const session = createPersistenceEnvelope(PERSISTENCE_KINDS.session, {
    session: {
      id: 'restore-layout-session',
      createdAt: 1,
      updatedAt: 2,
      workspaceId: 'default',
      unfinished: true,
      status: 'active',
    },
    visualizationState,
    networkData: {
      format: 'zxnet',
      data: Uint8Array.from([1, 2, 3]),
    },
  });
  session.id = 'restore-layout-session';
  await store.put(session);

  const helios = {
    loadNetwork: async (data, options) => {
      calls.loadNetwork.push({ data: Array.from(data), options });
    },
    _adoptNetworkPositionsAsLayoutBaseline: (options) => {
      calls.adoptBaseline.push(options);
      return true;
    },
    importVisualizationState: async (_state, options) => {
      calls.importVisualizationState.push(options);
    },
  };
  const storage = new BrowserStorageManager({
    helios,
    sessionId: 'restore-layout-session',
    sessionStore: new SessionStore({ store }),
    restore: false,
  });

  await storage.loadSession('restore-layout-session');

  assert.equal(calls.loadNetwork.length, 1);
  assert.equal(calls.loadNetwork[0].options.markNetworkDirty, false);
  assert.equal(calls.adoptBaseline.length, 1);
  assert.deepEqual(calls.adoptBaseline[0].layoutRuntimeState, layoutRuntimeState);
  assert.equal(calls.importVisualizationState.length, 1);
  assert.equal(calls.importVisualizationState[0].restoreLayoutRunState, true);
  assert.equal(storage.status().networkData.status, 'saved');
});

test('BrowserStorageManager session restore applies separate saved position payload after network load', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let saver = null;
  const savedPositions = new Float32Array([4, 5, 0, 8, 9, 0]);
  const saveHelios = {
    snapshotLayoutRuntimeStateAsync: async () => positionRuntimeState(savedPositions, { alpha: 0.19 }),
    serializeTrackedVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      layoutRuntimeState: positionRuntimeState(savedPositions, { alpha: 0.19, running: true }),
      storageState: saver.serializeSnapshot(),
    }, { sparse: true }),
    savePortableNetwork: async () => Uint8Array.from([101, 102]),
  };
  saver = new BrowserStorageManager({
    helios: saveHelios,
    sessionId: 'restore-position-payload-session',
    sessionStore: new SessionStore({ store }),
    restore: false,
  });
  await saver.saveSession({
    id: 'restore-position-payload-session',
    includePositions: true,
    captureThumbnail: false,
  });

  const calls = {
    loadNetwork: [],
    restoreLayoutRuntimeState: [],
    importVisualizationState: [],
  };
  const restoreHelios = {
    loadNetwork: async (data, options) => {
      calls.loadNetwork.push({ data: Array.from(data), options });
    },
    _adoptNetworkPositionsAsLayoutBaseline: () => true,
    restoreLayoutRuntimeState: (state, options) => {
      calls.restoreLayoutRuntimeState.push({ state, options });
      return true;
    },
    importVisualizationState: async (state, options) => {
      calls.importVisualizationState.push(options);
      if (state?.payload?.layoutRuntimeState) {
        restoreHelios.restoreLayoutRuntimeState(state.payload.layoutRuntimeState, {
          restoreRunState: options.restoreLayoutRunState === true,
        });
      }
    },
  };
  const restorer = new BrowserStorageManager({
    helios: restoreHelios,
    sessionId: 'restore-position-payload-session',
    sessionStore: new SessionStore({ store }),
    restore: false,
  });

  await restorer.loadSession('restore-position-payload-session');

  assert.equal(calls.loadNetwork.length, 1);
  assert.equal(calls.restoreLayoutRuntimeState.length, 1);
  assert.equal(calls.restoreLayoutRuntimeState[0].options.restoreRunState, true);
  assert.equal(calls.restoreLayoutRuntimeState[0].state.alpha, 0.19);
  assert.equal(calls.restoreLayoutRuntimeState[0].state.positions.length, savedPositions.length);
  assert.equal(calls.importVisualizationState.length, 1);
});

test('BrowserStorageManager explicit session save uses sparse state and stores positions in network payload', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let storage = null;
  const calls = [];
  const helios = {
    serializeVisualizationStateAsync: async () => {
      calls.push(['full']);
      return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
        behaviorState: { filters: { rules: [{ attribute: 'bad' }] } },
        cameraState: { zoom: 99 },
        storageState: storage.serializeSnapshot(),
      });
    },
    serializeTrackedVisualizationStateAsync: async () => {
      calls.push(['tracked']);
      return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
        behaviorState: {},
        cameraState: null,
        layoutRuntimeState: null,
        overrides: storage.states.getOverrides({ aliases: 'preferred' }),
        storageState: storage.serializeSnapshot(),
      }, { sparse: true });
    },
    savePortableNetwork: async (_format, options = {}) => {
      calls.push(['network', options.includeCurrentPositions]);
      return Uint8Array.from([9, 8, 7]);
    },
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'sparse-explicit-session',
    sessionStore: new SessionStore({ store }),
    restore: false,
  });
  storage.states.register(null, 'filters', {
    rules: { default: [], type: 'array' },
  });
  storage.states.set('filters.rules', [{ attribute: 'group', op: 'eq', value: 'A' }], { source: 'ui' });

  const saved = await storage.saveSession({ id: 'sparse-explicit-session' });
  assert.deepEqual(calls, [['tracked'], ['network', true]]);
  assert.equal(saved.payload.visualizationState.metadata?.sparse, true);
  assert.deepEqual(saved.payload.visualizationState.payload.behaviorState, {});
  assert.equal(saved.payload.visualizationState.payload.cameraState, null);
  assert.equal(saved.payload.visualizationState.payload.layoutRuntimeState, null);
  assert.deepEqual(saved.payload.visualizationState.payload.storageState.state.overrides['filters.rules'], [{ attribute: 'group', op: 'eq', value: 'A' }]);
  assert.equal(saved.payload.visualizationState.payload.storageState.state.values, undefined);
  assert.equal(saved.payload.networkData.data.byteLength, 3);
});

test('BrowserStorageManager autosave captures a thumbnail after the throttle interval when dirty and idle', async () => {
  let now = 1000;
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let thumbnails = 0;
  let storage = null;
  const helios = {
    serializeVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
    exportFigurePreviewBlob: async () => {
      thumbnails += 1;
      return new Blob([`thumbnail-${thumbnails}`], { type: 'image/png' });
    },
  };
  storage = new BrowserStorageManager({
    helios,
    now: () => now,
    sessionId: 'thumbnail-autosave-session',
    sessionStore: new SessionStore({ store }),
    sessionThumbnail: {
      autosaveMinIntervalMs: 30000,
    },
    restore: false,
  });
  storage.states.register(null, 'helios.theme', {
    value: { default: 'dark', type: 'string' },
  });
  await storage.saveSession({
    id: 'thumbnail-autosave-session',
    thumbnail: {
      type: 'image/png',
      encoding: 'data-url',
      width: 16,
      height: 16,
      byteLength: 1,
      dataUrl: 'data:image/png;base64,b2xk',
      capturedAt: now,
    },
    visualizationState: createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
    includeNetwork: false,
  });

  now += 31000;
  storage.states.set('helios.theme.value', 'light', {
    source: 'ui',
    reason: 'theme-control',
    debounceMs: 5,
  });
  await wait(50);

  const restored = await storage.getSession('thumbnail-autosave-session');
  assert.equal(thumbnails, 1);
  assert.equal(restored.payload.thumbnail.capturedAt, now);
  assert.equal(restored.payload.visualizationState.payload.storageState.state.overrides['helios.theme.value'], 'light');
});

test('BrowserStorageManager autosave preserves the existing thumbnail before the throttle interval', async () => {
  let now = 5000;
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let thumbnails = 0;
  let storage = null;
  const helios = {
    serializeVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
    exportFigurePreviewBlob: async () => {
      thumbnails += 1;
      return new Blob(['new-thumbnail'], { type: 'image/png' });
    },
  };
  storage = new BrowserStorageManager({
    helios,
    now: () => now,
    sessionId: 'thumbnail-throttle-session',
    sessionStore: new SessionStore({ store }),
    sessionThumbnail: {
      autosaveMinIntervalMs: 30000,
    },
    restore: false,
  });
  storage.states.register(null, 'helios.theme', {
    value: { default: 'dark', type: 'string' },
  });
  const existingThumbnail = {
    type: 'image/png',
    encoding: 'data-url',
    width: 16,
    height: 16,
    byteLength: 1,
    dataUrl: 'data:image/png;base64,b2xk',
    capturedAt: now,
  };
  await storage.saveSession({
    id: 'thumbnail-throttle-session',
    thumbnail: existingThumbnail,
    visualizationState: createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
    includeNetwork: false,
  });

  now += 5000;
  storage.states.set('helios.theme.value', 'light', {
    source: 'ui',
    reason: 'theme-control',
    debounceMs: 5,
  });
  await wait(50);

  const restored = await storage.getSession('thumbnail-throttle-session');
  assert.equal(thumbnails, 0);
  assert.deepEqual(restored.payload.thumbnail, existingThumbnail);
  assert.equal(restored.payload.visualizationState.payload.storageState.state.overrides['helios.theme.value'], 'light');
});

test('BrowserStorageManager network saves invalidate stale thumbnails when capture is skipped', async () => {
  let now = 7000;
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let thumbnails = 0;
  let networkByte = 1;
  let storage = null;
  const helios = {
    serializeVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
    savePortableNetwork: async () => Uint8Array.from([networkByte++]),
    exportFigurePreviewBlob: async () => {
      thumbnails += 1;
      return new Blob(['new-thumbnail'], { type: 'image/png' });
    },
  };
  storage = new BrowserStorageManager({
    helios,
    now: () => now,
    sessionId: 'thumbnail-network-session',
    sessionStore: new SessionStore({ store }),
    sessionThumbnail: {
      autosaveMinIntervalMs: 30000,
    },
    restore: false,
  });
  const oldThumbnail = {
    type: 'image/png',
    encoding: 'data-url',
    width: 16,
    height: 16,
    byteLength: 1,
    dataUrl: 'data:image/png;base64,b2xk',
    capturedAt: now,
  };
  await storage.saveSession({
    id: 'thumbnail-network-session',
    thumbnail: oldThumbnail,
    includeNetwork: false,
  });

  now += 5000;
  await storage.saveSession({
    id: 'thumbnail-network-session',
    includeNetwork: true,
    captureThumbnail: 'auto',
  });

  const restored = await storage.getSession('thumbnail-network-session');
  assert.equal(thumbnails, 0);
  assert.equal(restored.payload.networkData.data[0], 1);
  assert.equal(restored.payload.thumbnail, null);
});

test('BrowserStorageManager autosave skips thumbnail capture while interaction is active', async () => {
  let now = 1000;
  let interactionActive = true;
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let thumbnails = 0;
  let storage = null;
  const helios = {
    isInteractionActive: () => interactionActive,
    serializeVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
    exportFigurePreviewBlob: async () => {
      thumbnails += 1;
      return new Blob([`thumbnail-${thumbnails}`], { type: 'image/png' });
    },
  };
  storage = new BrowserStorageManager({
    helios,
    now: () => now,
    sessionId: 'thumbnail-interaction-session',
    sessionStore: new SessionStore({ store }),
    sessionThumbnail: {
      autosaveMinIntervalMs: 30000,
    },
    restore: false,
  });
  storage.states.register(null, 'helios.theme', {
    value: { default: 'dark', type: 'string' },
  });
  const existingThumbnail = {
    type: 'image/png',
    encoding: 'data-url',
    width: 16,
    height: 16,
    byteLength: 1,
    dataUrl: 'data:image/png;base64,b2xk',
    capturedAt: now,
  };
  await storage.saveSession({
    id: 'thumbnail-interaction-session',
    thumbnail: existingThumbnail,
    visualizationState: createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
    includeNetwork: false,
  });

  now += 31000;
  storage.states.set('helios.theme.value', 'light', {
    source: 'ui',
    reason: 'theme-control',
    debounceMs: 5,
  });
  await wait(50);
  assert.equal(thumbnails, 0);
  assert.deepEqual((await storage.getSession('thumbnail-interaction-session')).payload.thumbnail, existingThumbnail);

  interactionActive = false;
  now += 1000;
  storage.states.set('helios.theme.value', 'contrast', {
    source: 'ui',
    reason: 'theme-control',
    debounceMs: 5,
  });
  await wait(50);

  const restored = await storage.getSession('thumbnail-interaction-session');
  assert.equal(thumbnails, 1);
  assert.equal(restored.payload.thumbnail.capturedAt, now);
  assert.equal(restored.payload.visualizationState.payload.storageState.state.overrides['helios.theme.value'], 'contrast');
});

test('BrowserStorageManager explicit Save Session captures a thumbnail immediately', async () => {
  let now = 10000;
  let storage = null;
  let thumbnails = 0;
  const helios = {
    serializeVisualizationStateAsync: async () => createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
    }),
    exportFigurePreviewBlob: async () => {
      thumbnails += 1;
      return new Blob([`explicit-${thumbnails}`], { type: 'image/png' });
    },
  };
  storage = new BrowserStorageManager({
    helios,
    now: () => now,
    sessionId: 'explicit-thumbnail-session',
    sessionStore: new SessionStore({ storage: createMemoryStorage() }),
    sessionThumbnail: {
      autosaveMinIntervalMs: 30000,
    },
    restore: false,
  });
  await storage.saveSession({
    id: 'explicit-thumbnail-session',
    thumbnail: {
      type: 'image/png',
      encoding: 'data-url',
      width: 16,
      height: 16,
      byteLength: 1,
      dataUrl: 'data:image/png;base64,b2xk',
      capturedAt: now,
    },
    includeNetwork: false,
  });

  now += 1000;
  const saved = await storage.saveSession({
    id: 'explicit-thumbnail-session',
    includeNetwork: false,
  });

  assert.equal(thumbnails, 1);
  assert.equal(saved.payload.thumbnail.capturedAt, now);
});

test('BrowserStorageManager coalesces repeated state autosaves to the latest value', async () => {
  const records = new Map();
  const putLog = [];
  const store = {
    async put(record) {
      putLog.push(record.id);
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let storage = null;
  let visualizationSerializes = 0;
  const helios = {
    serializeVisualizationStateAsync: async () => {
      visualizationSerializes += 1;
      return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
        storageState: storage.serializeSnapshot(),
      });
    },
    exportFigurePreviewBlob: async () => new Blob(['thumbnail'], { type: 'image/png' }),
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'coalesced-autosave-session',
    sessionStore: new SessionStore({ store }),
    sessionThumbnail: {
      autosaveMinIntervalMs: false,
    },
    restore: false,
  });
  storage.states.register(null, 'appearance', {
    size: { default: 1, type: 'number' },
  });

  await storage.saveSession({
    id: 'coalesced-autosave-session',
    includeNetwork: false,
    captureThumbnail: false,
  });
  putLog.length = 0;
  visualizationSerializes = 0;
  const baselinePersistenceChanges = storage.debugStats().persistenceChangeCount;

  storage.states.set('appearance.size', 2, { source: 'ui', reason: 'slider', debounceMs: 10 });
  storage.states.set('appearance.size', 3, { source: 'ui', reason: 'slider', debounceMs: 10 });
  storage.states.set('appearance.size', 4, { source: 'ui', reason: 'slider', debounceMs: 10 });
  assert.equal(storage.debugStats().persistenceChangeCount, baselinePersistenceChanges);
  await wait(60);

  const sessionPuts = putLog.filter((id) => id === 'coalesced-autosave-session');
  const restored = await storage.getSession('coalesced-autosave-session');
  assert.equal(sessionPuts.length, 1);
  assert.equal(storage.debugStats().persistenceChangeCount, baselinePersistenceChanges + 1);
  assert.equal(visualizationSerializes, 0);
  assert.equal(restored.payload.visualizationState.payload.storageState.state.overrides['appearance.size'], 4);

  putLog.length = 0;
  const afterOverrideSavePersistenceChanges = storage.debugStats().persistenceChangeCount;
  storage.states.reset('appearance.size', { debounceMs: 10 });
  assert.equal(storage.debugStats().persistenceChangeCount, afterOverrideSavePersistenceChanges);
  await wait(60);
  const resetRestored = await storage.getSession('coalesced-autosave-session');
  assert.equal(putLog.filter((id) => id === 'coalesced-autosave-session').length, 1);
  assert.equal(storage.debugStats().persistenceChangeCount, afterOverrideSavePersistenceChanges + 1);
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      resetRestored.payload.visualizationState.payload.storageState.state.overrides,
      'appearance.size',
    ),
    false,
  );
});

test('BrowserStorageManager incremental autosave refreshes session runtime through state entries', async () => {
  const records = new Map();
  const store = {
    async put(record) {
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let storage = null;
  let trackedSerializes = 0;
  let cameraPose = { mode: '2d', projection: 'orthographic', zoom: 1, pan2D: [0, 0, 0] };
  let cameraControls = { autoFit: true, orbit: false };
  let layoutRuntime = {
    schema: 'helios-web.layout-runtime-state',
    version: 1,
    layoutState: 'running',
    running: true,
    alpha: 0.5,
    center: [0, 0, 0],
    positions: null,
  };
  const helios = {
    serializeTrackedVisualizationStateAsync: async () => {
      trackedSerializes += 1;
      return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
        behaviorState: {},
        cameraState: structuredClone(cameraPose),
        cameraControlState: structuredClone(cameraControls),
        layoutRuntimeState: structuredClone(layoutRuntime),
        overrides: storage.states.getOverrides({ aliases: 'preferred' }),
        storageState: storage.serializeSnapshot(),
      }, { sparse: true });
    },
    _snapshotCameraState: () => structuredClone(cameraPose),
    _snapshotCameraControlState: () => structuredClone(cameraControls),
    snapshotLayoutRuntimeState: () => structuredClone(layoutRuntime),
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'incremental-runtime-session',
    sessionStore: new SessionStore({ store }),
    restore: false,
  });
  storage.states.register(null, 'appearance', {
    size: { default: 1, type: 'number' },
  });
  storage.states.register(null, 'camera', {
    pose: { default: structuredClone(cameraPose), type: 'object' },
  });
  storage.states.register(null, 'camera.controls', {
    autoFit: { default: true, type: 'boolean' },
    orbit: { default: false, type: 'boolean' },
  });
  storage.states.register(null, 'layout.runtime', {
    state: { default: structuredClone(layoutRuntime), type: 'object' },
  });

  await storage.saveSession({
    id: 'incremental-runtime-session',
    includeNetwork: false,
    captureThumbnail: false,
  });
  assert.equal(trackedSerializes, 1);

  cameraPose = { mode: '2d', projection: 'orthographic', zoom: 4, pan2D: [12, -7, 0] };
  cameraControls = { autoFit: false, orbit: false };
  layoutRuntime = {
    ...layoutRuntime,
    layoutState: 'idle',
    running: false,
    alpha: 0.002,
    center: [5, 6, 0],
  };
  storage.states.set('camera.pose', cameraPose, {
    source: 'binding',
    reason: 'camera-pose',
    trackOverride: false,
  });
  storage.states.set('camera.controls.autoFit', false, {
    source: 'binding',
    reason: 'camera-controls',
    trackOverride: false,
  });
  storage.states.set('layout.runtime.state', layoutRuntime, {
    source: 'binding',
    reason: 'layout-runtime-change',
    trackOverride: false,
  });
  storage.states.set('appearance.size', 2, {
    source: 'ui',
    reason: 'slider',
    debounceMs: 10,
  });
  await wait(60);

  const restored = await storage.getSession('incremental-runtime-session');
  const payload = restored.payload.visualizationState.payload;
  assert.equal(trackedSerializes, 1);
  assert.equal(payload.cameraState.zoom, 4);
  assert.deepEqual(payload.cameraState.pan2D, [12, -7, 0]);
  assert.equal(payload.cameraControlState.autoFit, false);
  assert.equal(payload.layoutRuntimeState.layoutState, 'idle');
  assert.equal(payload.layoutRuntimeState.alpha, 0.002);
  assert.equal(payload.layoutRuntimeState.positions, null);
  assert.equal(payload.storageState.state.overrides['appearance.size'], 2);
});

test('BrowserStorageManager coalesces camera autosave notifications before persistence', async () => {
  const records = new Map();
  const putLog = [];
  const store = {
    async put(record) {
      putLog.push(record.id);
      records.set(record.id, structuredClone(record));
      return record;
    },
    async get(id) {
      return records.has(id) ? structuredClone(records.get(id)) : null;
    },
    async getAll() {
      return Array.from(records.values()).map((entry) => structuredClone(entry));
    },
    async delete(id) {
      records.delete(id);
      return true;
    },
  };
  let storage = null;
  let visualizationSerializes = 0;
  class FakeHelios extends EventTarget {
    on(type, handler) {
      this.addEventListener(type, handler);
      return () => this.removeEventListener(type, handler);
    }
  }
  const helios = new FakeHelios();
  helios.serializeVisualizationStateAsync = async () => {
    visualizationSerializes += 1;
    return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
      storageState: storage.serializeSnapshot(),
      cameraState: { mode: '2d', zoom: visualizationSerializes },
    });
  };
  storage = new BrowserStorageManager({
    helios,
    sessionId: 'camera-coalesced-autosave-session',
    sessionStore: new SessionStore({ store }),
    autosyncInteractionIdleMs: 40,
    sessionThumbnail: {
      enabled: false,
    },
    restore: false,
  });

  await storage.saveSession({
    id: 'camera-coalesced-autosave-session',
    includeNetwork: false,
    captureThumbnail: false,
  });
  putLog.length = 0;
  visualizationSerializes = 0;
  const baselinePersistenceChanges = storage.debugStats().persistenceChangeCount;

  for (let i = 0; i < 20; i += 1) {
    helios.dispatchEvent(new CustomEvent('camera:move', {
      detail: { origin: 'interaction', action: 'pan' },
    }));
  }
  assert.equal(putLog.length, 0);
  assert.equal(visualizationSerializes, 0);
  assert.equal(storage.debugStats().persistenceChangeCount, baselinePersistenceChanges);

  await wait(25);
  helios.dispatchEvent(new CustomEvent('camera:control-change', {
    detail: { origin: 'interaction', action: 'pan' },
  }));
  await wait(25);
  assert.equal(putLog.length, 0);
  assert.equal(storage.debugStats().persistenceChangeCount, baselinePersistenceChanges);

  await wait(80);
  assert.equal(putLog.filter((id) => id === 'camera-coalesced-autosave-session').length, 1);
  assert.equal(visualizationSerializes, 1);
  assert.equal(storage.debugStats().persistenceChangeCount, baselinePersistenceChanges + 1);
});

test('BrowserStorageManager keeps unfinished-session pointers in storage-native session store', async () => {
  const backing = createMemoryStorage();
  const storage = new BrowserStorageManager({
    indexedDB: false,
    storage: backing,
    workspaceId: 'workspace-a',
    restore: false,
  });

  await storage.saveSession({
    id: 'unfinished-session',
    nickname: 'Unfinished',
    visualizationState: createPersistenceEnvelope('visualization', {
      storageState: storage.serializeSnapshot(),
    }),
  });
  assert.equal(await storage.getUnfinishedSessionId(), 'unfinished-session');
  assert.deepEqual((await storage.getResumeSessions()).map((entry) => entry.id), ['unfinished-session']);

  await storage.markSessionFinished('unfinished-session');
  assert.equal(await storage.getUnfinishedSessionId(), null);
  assert.deepEqual(await storage.getResumeSessions(), []);

  await storage.saveSession({
    id: 'delete-me',
    visualizationState: createPersistenceEnvelope('visualization', {
      storageState: storage.serializeSnapshot(),
    }),
  });
  assert.equal(await storage.getUnfinishedSessionId(), 'delete-me');
  assert.equal(await storage.deleteSession('delete-me'), true);
  assert.equal(await storage.getUnfinishedSessionId(), null);
});

test('BrowserStorageManager returns null for absent native sessions', async () => {
  const storage = new BrowserStorageManager({
    indexedDB: false,
    storage: createMemoryStorage(),
    restore: false,
  });

  assert.deepEqual(storage.configureSession({ sessionId: 'other-session' }), {
    sessionId: 'other-session',
    requestedSessionId: 'other-session',
    explicitSessionInvalid: false,
  });
  assert.deepEqual(await storage.restoreActiveSession({ restoreNetwork: true, saveInitialManifest: false }), null);
  assert.equal(storage.explicitSessionInvalid, true);
  assert.deepEqual(await storage.getSession('other-session'), null);
  assert.deepEqual(await storage.listSessionSummaries({ includeAllWorkspaces: true }), []);
  assert.deepEqual(await storage.getResumeSessions({ limit: 4 }), []);
  assert.deepEqual(await storage.resumeSession('other-session'), null);
  assert.equal((await storage.saveSession({ id: 'saved-session', nickname: 'Saved' })).payload.session.id, 'saved-session');
  assert.equal(await storage.deleteSession('old-session'), false);
  assert.equal((await storage.sync({ includeNetwork: true })).payload.session.id, 'other-session');
});

test('storage session snapshot round-trips state overrides without persistent sessions', async () => {
  const first = new DummyStorageManager();
  first.states.register(null, 'helios.theme', {
    value: { default: 'dark', type: 'string' },
  });
  first.states.set('helios.theme.value', 'light');
  const snapshot = await first.serializeSessionSnapshot({ id: 'dummy-session' });

  const second = new DummyStorageManager();
  second.states.register(null, 'helios.theme', {
    value: { default: 'dark', type: 'string' },
  });
  await second.restoreSessionSnapshot(snapshot);
  assert.equal(second.states.get('helios.theme.value'), 'light');
  assert.equal(second.states.status('helios.theme.value').state, 'changed');
});

test('storage network snapshots serialize, attach, save, and restore through Helios APIs', async () => {
  const calls = [];
  let storage = null;
  const helios = {
    serializeVisualizationStateAsync: async (options = {}) => {
      calls.push(['serializeVisualizationStateAsync', options.layoutRuntime?.preferDelegate]);
      return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
        behaviorState: { labels: { enabled: true } },
        layoutRuntimeState: { positions: null },
        storageState: storage.serializeSnapshot(),
      });
    },
    serializeTrackedVisualizationStateAsync: async (options = {}) => {
      calls.push(['serializeTrackedVisualizationStateAsync', options.layoutRuntime?.preferDelegate]);
      return createPersistenceEnvelope(PERSISTENCE_KINDS.visualization, {
        overrides: storage.states.getOverrides({ aliases: 'preferred' }),
        storageState: storage.serializeSnapshot(),
      });
    },
    attachVisualizationStateToNetwork: (snapshot, options = {}) => {
      calls.push(['attachVisualizationStateToNetwork', options.attributeName]);
      return { snapshot, options };
    },
    savePortableNetwork: async (format, options = {}) => {
      calls.push(['savePortableNetwork', format, options.includeVisualization, options.trackedOnly]);
      return Uint8Array.from([1, 2, 3]);
    },
    loadNetwork: async (source, options = {}) => {
      calls.push(['loadNetwork', source, options.restoreVisualizationState]);
      return { source, options };
    },
  };
  storage = new DummyStorageManager({ helios });
  storage.states.register(null, 'filters', {
    rules: { default: [], type: 'array' },
  });
  storage.states.set('filters.rules', [{ attribute: 'group', op: 'eq', value: 'A' }]);

  const snapshot = await storage.serializeNetworkSnapshot();
  assert.deepEqual(snapshot.payload.overrides['filters.rules'], [{ attribute: 'group', op: 'eq', value: 'A' }]);
  assert.deepEqual(snapshot.payload.storageState.state.overrides['filters.rules'], [{ attribute: 'group', op: 'eq', value: 'A' }]);
  assert.deepEqual(calls.shift(), ['serializeTrackedVisualizationStateAsync', true]);

  const full = await storage.serializeNetworkSnapshot({ fullVisualizationState: true });
  assert.deepEqual(full.payload.behaviorState, { labels: { enabled: true } });
  assert.deepEqual(calls.shift(), ['serializeVisualizationStateAsync', true]);

  const attached = await storage.attachVisualizationStateToNetwork(snapshot, { attributeName: '_custom_state' });
  assert.equal(attached.snapshot, snapshot);
  assert.deepEqual(calls.shift(), ['attachVisualizationStateToNetwork', '_custom_state']);

  assert.deepEqual(await storage.saveNetworkSnapshot('xnet'), Uint8Array.from([1, 2, 3]));
  assert.deepEqual(calls.shift(), ['savePortableNetwork', 'xnet', true, true]);

  assert.deepEqual(await storage.restoreNetworkSnapshot('payload.xnet'), {
    source: 'payload.xnet',
    options: { restoreVisualizationState: true },
  });
  assert.deepEqual(calls.shift(), ['loadNetwork', 'payload.xnet', true]);

  const portableSnapshot = await storage.serializeNetworkSnapshot();
  await storage.attachVisualizationStateToNetwork(portableSnapshot, { attributeName: '_storage_state' });
  assert.deepEqual(calls.shift(), ['serializeTrackedVisualizationStateAsync', true]);
  assert.deepEqual(calls.shift(), ['attachVisualizationStateToNetwork', '_storage_state']);
});

test('BrowserStorageManager network serialization remains persistNetwork opt-in', () => {
  const helios = {
    serializeNetwork: () => ({ network: true }),
  };
  const disabled = new BrowserStorageManager({
    indexedDB: false,
    storage: createMemoryStorage(),
    helios,
    restore: false,
  });
  assert.equal(disabled.capabilities.network, false);
  assert.equal(disabled.serializeSnapshot({ includeNetwork: true }).network, null);

  const enabled = new BrowserStorageManager({
    indexedDB: false,
    storage: createMemoryStorage(),
    helios,
    persistNetwork: true,
    restore: false,
  });
  assert.equal(enabled.capabilities.network, true);
  assert.deepEqual(enabled.serializeSnapshot({ includeNetwork: true }).network, { network: true });
});

test('DummyStorageManager network export snapshots include storage state without persistent capabilities', async () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'helios.theme', {
    value: { default: 'dark', type: 'string' },
  });
  storage.states.set('helios.theme.value', 'light');

  assert.deepEqual(storage.capabilities, {
    persistent: false,
    sessions: false,
    network: false,
    remote: false,
  });
  const snapshot = await storage.serializeNetworkSnapshot();
  assert.equal(snapshot.payload.storageState.type, 'dummy');
  assert.equal(snapshot.payload.storageState.state.overrides['helios.theme.value'], 'light');
});

test('panel schema grouping is independent from state entries', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'helios.scene', {
    nodeSizeScale: { default: 1, type: 'number' },
    edgeOpacity: { default: 0.8, type: 'number' },
  });
  const schema = {
    id: 'scene',
    title: 'Scene',
    sections: [
      {
        id: 'appearance',
        title: 'Appearance',
        items: [
          'helios.scene.nodeSizeScale',
          'helios.scene.edgeOpacity',
          { type: 'custom', id: 'mapper-editor', keyPrefix: 'mappers.node' },
        ],
      },
    ],
  };
  assert.deepEqual(panelSchemaKeys(schema), [
    'helios.scene.nodeSizeScale',
    'helios.scene.edgeOpacity',
    'mappers.node',
  ]);
  assert.equal(panelSchemaStatus(schema, null).panel, 'default');
  assert.equal(panelSchemaStatus(schema, storage.states).panel, 'default');
  storage.states.set('helios.scene.nodeSizeScale', 2);
  assert.equal(panelSchemaStatus(schema, storage.states).sections.appearance, 'partial');
  assert.equal(panelSchemaStatus(schema, storage.states).panel, 'partial');
});

test('panel item labels prefer schema, then state metadata, then humanized fallback', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'appearance.edgeStyle.adaptiveQuality', {
    slowFrameThresholdMs: {
      default: 16,
      type: 'number',
      ui: { label: 'Slow Frame Threshold' },
    },
  });

  assert.equal(
    resolvePanelItemLabel({
      key: 'appearance.edgeStyle.adaptiveQuality.slowFrameThresholdMs',
      label: 'Panel Override',
    }, storage.states),
    'Panel Override',
  );
  assert.equal(
    resolvePanelItemLabel('appearance.edgeStyle.adaptiveQuality.slowFrameThresholdMs', storage.states),
    'Slow Frame Threshold',
  );
  assert.equal(
    resolvePanelItemLabel({ key: 'appearance.edgeStyle.adaptiveQuality.probeIntervalMs' }, storage.states),
    'Probe Interval ms',
  );
});

test('humanized fallback labels do not expose raw camelCase identifiers', () => {
  assert.equal(humanizeControlLabel('edgeAdaptiveQualitySlowFrameThresholdMs'), 'Edge Adaptive Quality Slow Frame Threshold ms');
  assert.equal(humanizeControlLabel('layout.parameters.kRepulsion'), 'K Repulsion');
  assert.equal(humanizeControlLabel('appearance.ambientOcclusion.intensityScale'), 'Intensity Scale');
  assert.notEqual(humanizeControlLabel('edgeAdaptiveQualitySlowFrameThresholdMs'), 'edgeAdaptiveQualitySlowFrameThresholdMs');
});

test('built-in panel schemas aggregate key and prefix marker status from state', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'appearance.nodeStyle', {
    sizeScale: { default: 1, type: 'number' },
    opacityScale: { default: 1, type: 'number' },
  });
  storage.states.register(null, 'appearance.edgeStyle', {
    widthScale: { default: 1, type: 'number' },
  });
  storage.states.register(null, 'legends', {
    enabled: { default: true, type: 'boolean' },
    scale: { default: 1, type: 'number' },
  });
  storage.states.register(null, 'layout', {
    layoutType: { default: 'static', type: 'string' },
    parameters: { default: { gravity: 0.5 }, type: 'object' },
    'parameters.gravity': { default: 0.5, type: 'number' },
  });
  storage.states.register(null, 'mappers', {
    node: { default: {}, type: 'object' },
  });

  assert.ok(panelSchemaKeys(SCENE_PANEL_SCHEMA).includes('appearance.nodeStyle.sizeScale'));
  assert.ok(panelSchemaSectionKeys(SCENE_PANEL_SCHEMA, 'appearance').includes('mappers.node'));
  assert.equal(panelSchemaSectionStatus(SCENE_PANEL_SCHEMA, 'appearance', storage.states), 'default');
  assert.equal(panelSchemaStatus(LEGENDS_PANEL_SCHEMA, storage.states).panel, 'default');
  assert.equal(panelSchemaStatus(LAYOUT_PANEL_SCHEMA, storage.states).panel, 'default');

  storage.states.set('appearance.edgeStyle.widthScale', 2);
  assert.equal(panelSchemaSectionStatus(SCENE_PANEL_SCHEMA, 'appearance', storage.states), 'partial');
  assert.equal(panelSchemaStatus(SCENE_PANEL_SCHEMA, storage.states).panel, 'partial');

  storage.states.set('legends.scale', 1.4);
  assert.equal(panelSchemaStatus(LEGENDS_PANEL_SCHEMA, storage.states).sections.layout, 'partial');
  assert.equal(panelSchemaStatus(LEGENDS_PANEL_SCHEMA, storage.states).panel, 'partial');

  storage.states.set('layout.parameters', { gravity: 0.75 });
  assert.equal(panelSchemaStatus(LAYOUT_PANEL_SCHEMA, storage.states).sections.parameters, 'changed');
  assert.equal(panelSchemaStatus(LAYOUT_PANEL_SCHEMA, storage.states).panel, 'partial');
  storage.states.reset('layout.parameters');
  storage.states.set('layout.parameters.gravity', 0.8);
  assert.equal(panelSchemaStatus(LAYOUT_PANEL_SCHEMA, storage.states).sections.parameters, 'changed');

  storage.states.set('mappers.node', { size: { type: 'constant', value: 8 } });
  assert.equal(panelSchemaSectionStatus(SCENE_PANEL_SCHEMA, 'appearance', storage.states), 'partial');
});

test('complex panel schemas aggregate mapper, filter, selection, and labels keys', () => {
  const storage = new DummyStorageManager();
  storage.states.register(null, 'behaviors.mappers', {
    'node.color': {
      default: { type: 'constant', value: '#ffffffff' },
      type: 'object',
      aliases: ['mappers.node.color'],
    },
    'edge.width': {
      default: { type: 'constant', value: 1 },
      type: 'object',
      aliases: ['mappers.edge.width'],
    },
  });
  storage.states.register(null, 'behaviors.filters', {
    enabled: { default: false, type: 'boolean', aliases: ['filters.enabled'] },
    scope: { default: 'render', type: 'string', aliases: ['filters.scope'] },
    rules: { default: [], type: 'array', aliases: ['filters.rules'] },
  });
  storage.states.register(null, 'behaviors.selection', {
    selectedNodes: { default: [], type: 'array', aliases: ['selection.selectedNodes'] },
    'selectors.node.rules': { default: [], type: 'array', aliases: ['selection.selectors.node.rules'] },
    nodeClick: { default: true, type: 'boolean', aliases: ['selection.nodeClick'] },
  });
  storage.states.register(null, 'behaviors.labels', {
    mode: { default: 'off', type: 'string', aliases: ['labels.mode'] },
    fill: { default: '#ffffffff', type: 'string', aliases: ['labels.fill'] },
  });

  assert.ok(panelSchemaSectionKeys(MAPPERS_PANEL_SCHEMA, 'nodes').includes('mappers.node.color'));
  assert.ok(panelSchemaSectionKeys(FILTERS_PANEL_SCHEMA, 'runtime').includes('filters.rules'));
  assert.ok(panelSchemaSectionKeys(SELECTION_PANEL_SCHEMA, 'selectors').includes('selection.selectors.node.rules'));
  assert.ok(panelSchemaSectionKeys(LABELS_PANEL_SCHEMA, 'style').includes('labels.fill'));

  storage.states.set('mappers.node.color', { type: 'constant', value: '#ff0000ff' });
  assert.equal(panelSchemaSectionStatus(MAPPERS_PANEL_SCHEMA, 'nodes', storage.states), 'partial');
  assert.equal(panelSchemaStatus(MAPPERS_PANEL_SCHEMA, storage.states).panel, 'partial');

  storage.states.set('filters.rules', [{ scope: 'node', type: 'query', query: 'degree > 3' }]);
  assert.equal(panelSchemaSectionStatus(FILTERS_PANEL_SCHEMA, 'runtime', storage.states), 'partial');

  storage.states.set('selection.selectors.node.rules', [{ scope: 'node', type: 'query', query: 'score > 0' }]);
  assert.equal(panelSchemaSectionStatus(SELECTION_PANEL_SCHEMA, 'selectors', storage.states), 'changed');

  storage.states.set('labels.fill', '#00ff00ff');
  assert.equal(panelSchemaSectionStatus(LABELS_PANEL_SCHEMA, 'style', storage.states), 'partial');
});
