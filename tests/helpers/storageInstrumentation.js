export async function waitForHelios(page, timeout = 120_000) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  }, null, { timeout });
  const diagnostics = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
  if (diagnostics?.error) throw new Error(`fixture failed: ${diagnostics.error}`);
  await page.waitForFunction(async () => {
    const helios = window.__helios;
    if (!helios?.ready) return false;
    await helios.ready;
    return Boolean(window.__heliosUI ?? helios.ui);
  }, null, { timeout });
}

export async function installStorageInstrumentation(page) {
  await page.evaluate(() => {
    const helios = window.__helios;
    if (!helios) throw new Error('window.__helios is not available');
    const storage = helios.storage ?? null;
    const existing = window.__heliosStorageInstrumentation;
    if (existing?.installed) {
      existing.refresh?.();
      existing.reset?.();
      return;
    }

    const state = {
      installed: true,
      counters: Object.create(null),
      storageSetByPath: Object.create(null),
      stateSetByPath: Object.create(null),
      records: [],
      reset() {
        this.counters = Object.create(null);
        this.storageSetByPath = Object.create(null);
        this.stateSetByPath = Object.create(null);
        this.records = [];
      },
      count(label, args = []) {
        this.counters[label] = (this.counters[label] ?? 0) + 1;
        if (label === 'storage.set') {
          const path = String(args[0] ?? '');
          this.storageSetByPath[path] = (this.storageSetByPath[path] ?? 0) + 1;
        }
        if (label === 'states.set') {
          const path = String(args[0] ?? '');
          this.stateSetByPath[path] = (this.stateSetByPath[path] ?? 0) + 1;
        }
      },
      record(label, args, started, error = null) {
        const entry = {
          label,
          startedAt: started,
          endedAt: performance.now(),
          durationMs: performance.now() - started,
          path: label === 'storage.set' || label === 'states.set' ? String(args[0] ?? '') : null,
          reason: args?.[0]?.reason ?? args?.[1]?.reason ?? null,
          includeNetwork: args?.[0]?.includeNetwork ?? args?.[1]?.includeNetwork ?? null,
          captureThumbnail: args?.[0]?.captureThumbnail ?? args?.[1]?.captureThumbnail ?? null,
          error: error ? String(error?.message ?? error) : null,
        };
        this.records.push(entry);
      },
      snapshot() {
        return {
          counters: { ...this.counters },
          storageSetByPath: { ...this.storageSetByPath },
          stateSetByPath: { ...this.stateSetByPath },
          records: this.records.map((record) => ({ ...record })),
        };
      },
    };

    const wrapped = new WeakMap();
    const wrap = (target, name, label) => {
      if (!target || typeof target[name] !== 'function') return;
      let names = wrapped.get(target);
      if (!names) {
        names = new Set();
        wrapped.set(target, names);
      }
      if (names.has(name)) return;
      names.add(name);
      const original = target[name];
      target[name] = function instrumentedStorageMethod(...args) {
        const started = performance.now();
        state.count(label, args);
        try {
          const result = original.apply(this, args);
          if (result && typeof result.then === 'function') {
            return result.then(
              (value) => {
                state.record(label, args, started);
                return value;
              },
              (error) => {
                state.record(label, args, started, error);
                throw error;
              },
            );
          }
          state.record(label, args, started);
          return result;
        } catch (error) {
          state.record(label, args, started, error);
          throw error;
        }
      };
    };

    const wrapStorage = () => {
      const currentStorage = helios.storage ?? storage;
      const layout = typeof helios.layout === 'function' ? helios.layout() : null;
      const delegate = helios.positions?.()?.delegate
        ?? layout?.getPositionDelegate?.()
        ?? layout?.positionDelegate
        ?? helios._activePositionDelegate
        ?? null;
      wrap(currentStorage, 'set', 'storage.set');
      wrap(helios.states, 'set', 'states.set');
      wrap(currentStorage, 'saveSession', 'storage.saveSession');
      wrap(currentStorage, 'serializeSessionSnapshot', 'storage.serializeSessionSnapshot');
      wrap(currentStorage, 'captureSessionThumbnail', 'storage.captureSessionThumbnail');
      wrap(currentStorage?.sessionStore, 'put', 'SessionStore.put');
      wrap(currentStorage?.sessionStore, '_putRaw', 'SessionStore._putRaw');
      wrap(helios, 'savePortableNetwork', 'helios.savePortableNetwork');
      wrap(helios, 'serializeVisualizationState', 'helios.serializeVisualizationState');
      wrap(helios, 'serializeVisualizationStateAsync', 'helios.serializeVisualizationStateAsync');
      wrap(helios, 'snapshotLayoutRuntimeState', 'helios.snapshotLayoutRuntimeState');
      wrap(helios, 'snapshotLayoutRuntimeStateAsync', 'helios.snapshotLayoutRuntimeStateAsync');
      wrap(helios, 'snapshotDelegatePositions', 'helios.snapshotDelegatePositions');
      wrap(helios, 'snapshotNodePositions', 'helios.snapshotNodePositions');
      wrap(helios, 'snapshotNodePosition', 'helios.snapshotNodePosition');
      wrap(helios, 'snapshotNodeCentroid', 'helios.snapshotNodeCentroid');
      wrap(helios, 'syncDelegatePositionsToNetwork', 'helios.syncDelegatePositionsToNetwork');
      wrap(delegate, 'snapshotNodePositions', 'delegate.snapshotNodePositions');
      wrap(delegate, 'snapshotNodePositionsById', 'delegate.snapshotNodePositionsById');
      wrap(delegate, 'getNodePositionView', 'delegate.getNodePositionView');
      wrap(delegate, 'getPositionView', 'delegate.getPositionView');
      wrap(delegate, 'writePositionSnapshot', 'delegate.writePositionSnapshot');
      wrap(delegate, 'synchronizeNodePositionsToNetwork', 'delegate.synchronizeNodePositionsToNetwork');
    };

    state.refresh = wrapStorage;
    wrapStorage();
    window.__heliosStorageInstrumentation = state;
  });
}

export async function resetStorageInstrumentation(page) {
  await page.evaluate(() => window.__heliosStorageInstrumentation?.reset?.());
}

export async function readStorageInstrumentation(page) {
  return page.evaluate(() => window.__heliosStorageInstrumentation?.snapshot?.() ?? {
    counters: {},
    storageSetByPath: {},
    stateSetByPath: {},
    records: [],
  });
}

export async function settleAndResetStorageInstrumentation(page) {
  await page.evaluate(async () => {
    const helios = window.__helios;
    const storage = helios?.storage;
    if (!storage?.saveSession) return;
    await storage.flush?.({
      id: storage.sessionId ?? undefined,
      includeNetwork: false,
      captureThumbnail: false,
      snapshotLayoutRuntime: false,
      reason: 'test-instrumentation-baseline',
    });
  });
  await page.waitForTimeout(100);
  await resetStorageInstrumentation(page);
}
