import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BehaviorManager,
  BehaviorRegistry,
  InterfaceBehavior,
  createDefaultBehaviorRegistry,
} from '../src/behaviors/index.js';

class MockStorageService {
  constructor() {
    this.capabilities = {
      persistent: true,
      sessions: true,
      network: false,
      remote: false,
    };
    this.requestedSessionId = null;
    this.explicitSessionInvalid = false;
    this.preferences = {
      theme: null,
      autosave: false,
      responsive: {
        compactDockSide: null,
        preferredMode: null,
        lastViewportClass: null,
      },
    };
    this.calls = {
      loadPreferences: 0,
      updatePreferences: [],
      getRestorableSession: 0,
      getResumePrompt: 0,
      restoreSession: [],
      resumeSession: [],
      markSessionFinished: [],
      deleteSession: [],
    };
    this.restorableSession = null;
  }

  async loadPreferences() {
    this.calls.loadPreferences += 1;
    return {
      ...this.preferences,
      responsive: { ...this.preferences.responsive },
    };
  }

  async updatePreferences(patch = {}) {
    this.calls.updatePreferences.push(patch);
    this.preferences = {
      ...this.preferences,
      ...(patch && typeof patch === 'object' ? patch : {}),
      responsive: {
        ...this.preferences.responsive,
        ...((patch && typeof patch.responsive === 'object') ? patch.responsive : {}),
      },
    };
    return this.preferences;
  }

  async getRestorableSession() {
    this.calls.getRestorableSession += 1;
    return this.restorableSession;
  }

  async getResumePrompt() {
    this.calls.getResumePrompt += 1;
    const session = this.restorableSession;
    if (!session?.payload?.session?.id) return null;
    return {
      visible: true,
      sessionId: session.payload.session.id,
      updatedAt: session.payload.session.updatedAt ?? null,
      networkSource: session.payload.networkSource ?? null,
      sessions: [{
        id: session.payload.session.id,
        updatedAt: session.payload.session.updatedAt ?? null,
        networkSource: session.payload.networkSource ?? null,
        label: session.payload.networkSource?.name ?? session.payload.session.id,
      }],
    };
  }

  async resumeSession(id, options = {}) {
    this.calls.resumeSession.push({ id, options });
    return { restored: id };
  }

  async restoreSession(id, options = {}) {
    this.calls.restoreSession.push({ id, options });
    return { restored: id };
  }

  async markSessionFinished(id) {
    this.calls.markSessionFinished.push(id);
    return { finished: id };
  }

  async deleteSession(id) {
    this.calls.deleteSession.push(id);
    return true;
  }
}
class MockUI {
  constructor(width = 1440) {
    this.width = width;
    this.applied = [];
  }

  getViewportWidth() {
    return this.width;
  }

  applyInterfaceBehaviorState(snapshot) {
    this.applied.push({
      dockSide: snapshot.dockSide,
      mode: snapshot.mode,
      controlsOpen: snapshot.controlsOpen,
      activePanelId: snapshot.activePanelId,
      focused: snapshot.focused,
      interfaceVisible: snapshot.interfaceVisible,
      resumePrompt: snapshot.resumePrompt ? { ...snapshot.resumePrompt } : null,
    });
  }
}

class MockHelios extends EventTarget {
  constructor({ width = 1440 } = {}) {
    super();
    this.storage = new MockStorageService();
    this.ui = new MockUI(width);
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    return () => this.removeEventListener(type, handler, options);
  }
}

function attachInterfaceBehavior(options = {}) {
  const helios = new MockHelios({ width: options.width ?? 1440 });
  if (options.preferences) {
    helios.storage.preferences = {
      ...helios.storage.preferences,
      ...options.preferences,
      responsive: {
        ...helios.storage.preferences.responsive,
        ...(options.preferences?.responsive ?? {}),
      },
    };
  }
  helios.storage.restorableSession = options.restorableSession ?? null;
  const registry = new BehaviorRegistry().register('interface', InterfaceBehavior);
  const manager = new BehaviorManager(helios, registry);
  manager.setUI(helios.ui);
  const behavior = manager.use('interface', options.behaviorOptions ?? {});
  behavior.bindUI(helios.ui);
  return { helios, manager, behavior };
}

test('default behavior registry includes InterfaceBehavior', () => {
  const registry = createDefaultBehaviorRegistry();
  assert.equal(registry.has('interface'), true);
});

test('interface behavior attaches and exposes dock-side public accessors', async () => {
  const { helios, manager, behavior } = attachInterfaceBehavior();
  await behavior.ensurePersistenceReady();

  assert.ok(behavior instanceof InterfaceBehavior);
  assert.equal(manager.get('interface'), behavior);
  assert.equal(behavior.dockSide(), 'left');

  behavior.dockSide('right');

  assert.equal(behavior.dockSide(), 'right');
  assert.equal(helios.storage.calls.updatePreferences.at(-1).responsive.compactDockSide, 'right');
});

test('interface behavior can switch compact dock side back from right to left', async () => {
  const { helios, behavior } = attachInterfaceBehavior();
  await behavior.ensurePersistenceReady();

  behavior.dockSide('right');
  behavior.dockSide('left');

  assert.equal(behavior.dockSide(), 'left');
  assert.equal(helios.storage.calls.updatePreferences.at(-1).responsive.compactDockSide, 'left');
});

test('interface behavior transitions across desktop, compact, and fullscreen breakpoints', async () => {
  const { behavior } = attachInterfaceBehavior();
  await behavior.ensurePersistenceReady();

  behavior.setViewportWidth(1360);
  assert.equal(behavior.mode(), 'desktop');

  behavior.setViewportWidth(960);
  assert.equal(behavior.mode(), 'compact');

  behavior.setViewportWidth(640);
  assert.equal(behavior.mode(), 'fullscreen');
});

test('compact mode keeps side-docked controls policy on one preferred side', async () => {
  const { helios, behavior } = attachInterfaceBehavior({ width: 920 });
  await behavior.ensurePersistenceReady();
  behavior.setViewportWidth(920);
  behavior.dockSide('right');

  const lastApplied = helios.ui.applied.at(-1);
  assert.equal(lastApplied.mode, 'compact');
  assert.equal(lastApplied.dockSide, 'right');
  assert.equal(lastApplied.controlsOpen, false);
});

test('fullscreen controls mode supports an active focused control state', async () => {
  const { helios, behavior } = attachInterfaceBehavior({ width: 640 });
  await behavior.ensurePersistenceReady();
  behavior.setViewportWidth(640);
  behavior.openControlsSurface();
  behavior.activateControl('selection');

  const lastApplied = helios.ui.applied.at(-1);
  assert.equal(lastApplied.mode, 'fullscreen');
  assert.equal(lastApplied.controlsOpen, true);
  assert.equal(lastApplied.activePanelId, 'selection');
  assert.equal(lastApplied.focused, true);
});

test('compact mode ignores active-control focus requests', async () => {
  const { helios, behavior } = attachInterfaceBehavior({ width: 920 });
  await behavior.ensurePersistenceReady();
  behavior.setViewportWidth(920);
  behavior.activateControl('selection');

  const lastApplied = helios.ui.applied.at(-1);
  assert.equal(lastApplied.mode, 'compact');
  assert.equal(lastApplied.controlsOpen, false);
  assert.equal(lastApplied.activePanelId, null);
  assert.equal(lastApplied.focused, false);
});

test('returning to desktop clears fullscreen control focus and launcher state', async () => {
  const { helios, behavior } = attachInterfaceBehavior({ width: 640 });
  await behavior.ensurePersistenceReady();
  behavior.setViewportWidth(640);
  behavior.openControlsSurface();
  behavior.activateControl('selection');
  behavior.setViewportWidth(1440);

  const lastApplied = helios.ui.applied.at(-1);
  assert.equal(behavior.mode(), 'desktop');
  assert.equal(lastApplied.mode, 'desktop');
  assert.equal(lastApplied.controlsOpen, false);
  assert.equal(lastApplied.activePanelId, null);
  assert.equal(lastApplied.focused, false);
});

test('interface behavior restores persisted dock-side preferences', async () => {
  const { behavior } = attachInterfaceBehavior({
    preferences: {
      responsive: {
        compactDockSide: 'right',
      },
    },
  });
  await behavior.ensurePersistenceReady();

  assert.equal(behavior.dockSide(), 'right');
});

test('interface behavior surfaces unfinished-session resume prompts and can resume', async () => {
  const { helios, behavior } = attachInterfaceBehavior({
    restorableSession: {
      payload: {
        session: { id: 'session-42', updatedAt: 1234 },
        networkSource: { name: 'demo.xnet', format: 'xnet' },
      },
    },
  });
  await behavior.ensurePersistenceReady();

  assert.equal(behavior.resumePrompt().sessionId, 'session-42');
  assert.equal(helios.ui.applied.at(-1).resumePrompt.sessionId, 'session-42');

  const restored = await behavior.resumeSession({ markFinished: false });
  assert.deepEqual(restored, { restored: 'session-42' });
  assert.deepEqual(helios.storage.calls.resumeSession, [{
    id: 'session-42',
    options: { markFinished: false },
  }]);
  assert.equal(behavior.resumePrompt(), null);
});

test('interface behavior does not serialize resume prompts as durable UI state', async () => {
  const { behavior } = attachInterfaceBehavior({
    restorableSession: {
      payload: {
        session: { id: 'session-ephemeral', updatedAt: 1234 },
        networkSource: { name: 'ephemeral.xnet', format: 'xnet' },
      },
    },
  });
  await behavior.ensurePersistenceReady();

  assert.equal(behavior.resumePrompt().sessionId, 'session-ephemeral');
  assert.equal(behavior.serializeInterfaceState().resumePrompt, null);
  assert.equal(behavior.serializeInterfaceState({ includeResumePrompt: true }).resumePrompt.sessionId, 'session-ephemeral');
});

test('interface behavior ignores stale serialized resume prompts for explicit URL sessions', async () => {
  const { helios, behavior } = attachInterfaceBehavior();
  helios.storage.requestedSessionId = 'valid-session';
  helios.storage.explicitSessionInvalid = false;

  behavior.restoreInterfaceState({
    resumePrompt: {
      visible: true,
      sessionId: 'stale-session',
      status: 'prompt',
      updatedAt: 1234,
      networkSource: { name: 'old.xnet' },
    },
  });

  assert.equal(behavior.resumePrompt(), null);
  assert.equal(helios.ui.applied.at(-1).resumePrompt, null);
});

test('interface behavior does not ask for resume when an explicit session is valid', async () => {
  const { helios, behavior } = attachInterfaceBehavior({
    restorableSession: {
      payload: {
        session: { id: 'other-session', updatedAt: 1234 },
        networkSource: { name: 'other.xnet' },
      },
    },
  });
  helios.storage.requestedSessionId = 'valid-session';
  helios.storage.explicitSessionInvalid = false;

  await behavior.ensurePersistenceReady();

  assert.equal(behavior.resumePrompt(), null);
  assert.equal(helios.storage.calls.getResumePrompt, 0);
  assert.equal(helios.ui.applied.at(-1).resumePrompt, null);
});

test('interface behavior can start fresh from a pending unfinished session prompt', async () => {
  const { helios, behavior } = attachInterfaceBehavior({
    restorableSession: {
      payload: {
        session: { id: 'session-9', updatedAt: 9876 },
        networkSource: { name: 'stale.xnet', format: 'xnet' },
      },
    },
  });
  await behavior.ensurePersistenceReady();
  await behavior.startFresh();

  assert.deepEqual(helios.storage.calls.markSessionFinished, []);
  assert.equal(behavior.resumePrompt(), null);
});

test('interface behavior can explicitly mark a pending session finished when starting fresh', async () => {
  const { helios, behavior } = attachInterfaceBehavior({
    restorableSession: {
      payload: {
        session: { id: 'session-finish', updatedAt: 9876 },
        networkSource: { name: 'stale.xnet', format: 'xnet' },
      },
    },
  });
  await behavior.ensurePersistenceReady();
  await behavior.startFresh({ markFinished: true });

  assert.deepEqual(helios.storage.calls.markSessionFinished, ['session-finish']);
  assert.equal(behavior.resumePrompt(), null);
});

test('restoring serialized interface state respects persisted dock side and recomputed viewport mode', async () => {
  const { helios, behavior } = attachInterfaceBehavior({ width: 680 });
  await behavior.ensurePersistenceReady();
  behavior.restoreInterfaceState({
    dockSide: 'right',
    controlsOpen: true,
    activePanelId: 'layout',
    focused: true,
  });

  const lastApplied = helios.ui.applied.at(-1);
  assert.equal(lastApplied.dockSide, 'right');
  assert.equal(lastApplied.mode, 'fullscreen');
  assert.equal(lastApplied.controlsOpen, true);
  assert.equal(lastApplied.activePanelId, 'layout');
});
