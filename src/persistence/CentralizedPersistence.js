import { AttributeType } from 'helios-network';

export const PERSISTENCE_SCOPES = Object.freeze(['defaults', 'user', 'workspace', 'network', 'session']);
export const PERSISTENCE_SCOPE_RANK = Object.freeze({
  defaults: 0,
  user: 1,
  workspace: 2,
  network: 3,
  session: 4,
});

export const NETWORK_PERSISTENCE_ATTRIBUTE = '_helios_persistence_state';
export const NETWORK_ID_ATTRIBUTE = '_helios_network_id';

function cloneSerializable(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneSerializable(entry));
  if (value && typeof value === 'object') {
    const next = {};
    for (const [key, entry] of Object.entries(value)) next[key] = cloneSerializable(entry);
    return next;
  }
  return value;
}

function valuesEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeScope(scope, fallback = 'session') {
  const value = String(scope ?? '').trim();
  return Object.prototype.hasOwnProperty.call(PERSISTENCE_SCOPE_RANK, value) ? value : fallback;
}

function normalizePath(path) {
  return String(path ?? '').trim();
}

function createEmptyLayers() {
  return {
    defaults: {},
    user: {},
    workspace: {},
    network: {},
    session: {},
  };
}

function setNetworkStringAttribute(network, name, value) {
  if (!network?.hasNetworkAttribute?.(name)) {
    network?.defineNetworkAttribute?.(name, AttributeType.String, 1);
  }
  network?.setNetworkStringAttribute?.(name, value);
}

function readNetworkStringAttribute(network, name) {
  if (!network?.hasNetworkAttribute?.(name)) return null;
  return network.getNetworkStringAttribute?.(name) ?? null;
}

function defaultId(prefix = 'helios') {
  if (globalThis.crypto?.randomUUID) return `${prefix}:${globalThis.crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

export function createPersistenceRecord({ workspaceId = null, networkId = null, layers = {}, metadata = {} } = {}) {
  return {
    schema: 'helios-web.centralized-persistence',
    version: 1,
    workspaceId: workspaceId ?? null,
    networkId: networkId ?? null,
    updatedAt: Date.now(),
    layers: {
      ...createEmptyLayers(),
      ...(layers && typeof layers === 'object' ? cloneSerializable(layers) : {}),
    },
    metadata: metadata && typeof metadata === 'object' ? cloneSerializable(metadata) : {},
  };
}

export function normalizePersistenceRecord(source = {}) {
  const record = source && typeof source === 'object' ? source : {};
  const rawLayers = record.layers && typeof record.layers === 'object' ? record.layers : record;
  const layers = createEmptyLayers();
  for (const scope of PERSISTENCE_SCOPES) {
    if (rawLayers[scope] && typeof rawLayers[scope] === 'object') {
      layers[scope] = cloneSerializable(rawLayers[scope]);
    }
  }
  return createPersistenceRecord({
    workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : null,
    networkId: typeof record.networkId === 'string' ? record.networkId : null,
    layers,
    metadata: record.metadata,
  });
}

export class PersistenceBackend {
  constructor(options = {}) {
    this.id = options.id ?? options.name ?? 'backend';
    this.type = options.type ?? this.constructor.name;
    this.scopes = Array.isArray(options.scopes) ? options.scopes.map((scope) => normalizeScope(scope, null)).filter(Boolean) : ['user', 'workspace', 'network', 'session'];
    this.writable = options.writable !== false;
    this.lastStatus = {
      id: this.id,
      type: this.type,
      ok: true,
      state: 'idle',
      updatedAt: null,
      error: null,
    };
  }

  supportsScope(scope) {
    return this.scopes.includes(scope);
  }

  status() {
    return { ...this.lastStatus };
  }

  _setStatus(patch = {}) {
    this.lastStatus = {
      ...this.lastStatus,
      ...patch,
      id: this.id,
      type: this.type,
      updatedAt: patch.updatedAt ?? Date.now(),
    };
    return this.status();
  }

  async load() {
    return createPersistenceRecord();
  }

  async save() {
    return this._setStatus({ ok: true, state: 'saved', error: null });
  }
}

export class CustomPersistenceBackend extends PersistenceBackend {
  constructor(options = {}) {
    super({
      id: options.id ?? 'custom',
      type: 'custom',
      scopes: options.scopes ?? ['user', 'workspace', 'network', 'session'],
      writable: options.writable,
    });
    this.read = options.read ?? options.load ?? null;
    this.write = options.write ?? options.save ?? null;
    this.storage = options.storage ?? null;
    this.storageKey = options.storageKey ?? 'helios-web:persistence:custom';
    this.value = options.value ? normalizePersistenceRecord(options.value) : createPersistenceRecord();
  }

  async load(context = {}) {
    try {
      if (typeof this.read === 'function') {
        this.value = normalizePersistenceRecord(await this.read(context));
      } else if (this.storage?.getItem) {
        const raw = this.storage.getItem(this.storageKey);
        if (raw) this.value = normalizePersistenceRecord(JSON.parse(raw));
      }
      this._setStatus({ ok: true, state: 'loaded', error: null });
      return this.value;
    } catch (error) {
      this._setStatus({ ok: false, state: 'error', error: error?.message ?? String(error) });
      return createPersistenceRecord();
    }
  }

  async save(record, context = {}) {
    if (!this.writable) return this.status();
    try {
      this.value = normalizePersistenceRecord(record);
      if (typeof this.write === 'function') await this.write(this.value, context);
      else if (this.storage?.setItem) this.storage.setItem(this.storageKey, JSON.stringify(this.value));
      return this._setStatus({ ok: true, state: 'saved', error: null });
    } catch (error) {
      return this._setStatus({ ok: false, state: 'error', error: error?.message ?? String(error) });
    }
  }
}

export class BrowserPersistenceBackend extends CustomPersistenceBackend {
  constructor(options = {}) {
    const workspaceId = options.workspaceId ?? 'default';
    super({
      ...options,
      id: options.id ?? 'browser',
      scopes: options.scopes ?? ['user', 'workspace', 'session'],
      storage: options.storage ?? globalThis.localStorage ?? null,
      storageKey: options.storageKey ?? `helios-web:persistence:registry:${workspaceId}`,
    });
    this.type = 'browser';
    this.lastStatus.type = 'browser';
  }
}

export class RemotePersistenceBackend extends PersistenceBackend {
  constructor(options = {}) {
    super({
      id: options.id ?? 'remote',
      type: 'remote',
      scopes: options.scopes ?? ['user', 'workspace', 'network', 'session'],
      writable: options.writable,
    });
    this.url = options.url ? String(options.url).replace(/\/+$/, '') : null;
    this.key = options.key ?? options.apiKey ?? options.token ?? null;
    this.headers = options.headers && typeof options.headers === 'object' ? { ...options.headers } : {};
    this.enabled = options.enabled !== false && Boolean(this.url);
  }

  _headers(extra = {}) {
    const headers = { ...this.headers, ...extra };
    if (this.key && !headers.Authorization) headers.Authorization = `Bearer ${this.key}`;
    return headers;
  }

  async load(context = {}) {
    if (!this.enabled) return createPersistenceRecord();
    try {
      const workspace = encodeURIComponent(context.workspaceId ?? 'default');
      const response = await fetch(`${this.url}/persistence/${workspace}`, {
        headers: this._headers(),
      });
      if (response.status === 404) return createPersistenceRecord({ workspaceId: context.workspaceId });
      if (!response.ok) throw new Error(`Remote persistence load failed (${response.status})`);
      const record = normalizePersistenceRecord(await response.json());
      this._setStatus({ ok: true, state: 'loaded', error: null });
      return record;
    } catch (error) {
      this._setStatus({ ok: false, state: 'error', error: error?.message ?? String(error) });
      return createPersistenceRecord({ workspaceId: context.workspaceId });
    }
  }

  async save(record, context = {}) {
    if (!this.enabled || !this.writable) return this.status();
    try {
      const workspace = encodeURIComponent(context.workspaceId ?? record?.workspaceId ?? 'default');
      const response = await fetch(`${this.url}/persistence/${workspace}`, {
        method: 'PUT',
        headers: this._headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(normalizePersistenceRecord(record)),
      });
      if (!response.ok) throw new Error(`Remote persistence save failed (${response.status})`);
      return this._setStatus({ ok: true, state: 'saved', error: null });
    } catch (error) {
      return this._setStatus({ ok: false, state: 'error', error: error?.message ?? String(error) });
    }
  }
}

export class NetworkAttributePersistenceBackend extends PersistenceBackend {
  constructor(options = {}) {
    super({
      id: options.id ?? 'network-attributes',
      type: 'network',
      scopes: options.scopes ?? ['network'],
      writable: options.writable,
    });
    this.network = options.network ?? null;
    this.attributeName = options.attributeName ?? NETWORK_PERSISTENCE_ATTRIBUTE;
    this.idAttributeName = options.idAttributeName ?? NETWORK_ID_ATTRIBUTE;
  }

  setNetwork(network) {
    this.network = network ?? null;
  }

  ensureNetworkId(network = this.network) {
    if (!network) return null;
    let id = readNetworkStringAttribute(network, this.idAttributeName);
    if (!id) {
      id = defaultId('helios-network');
      try {
        setNetworkStringAttribute(network, this.idAttributeName, id);
      } catch (_) {
        const nodeCount = Number.isFinite(network.nodeCount) ? network.nodeCount : 0;
        const edgeCount = Number.isFinite(network.edgeCount) ? network.edgeCount : 0;
        id = `helios-network:readonly:${nodeCount}:${edgeCount}`;
      }
    }
    return id;
  }

  async load(context = {}) {
    const network = context.network ?? this.network;
    if (!network) return createPersistenceRecord({ workspaceId: context.workspaceId });
    const networkId = this.ensureNetworkId(network);
    const raw = readNetworkStringAttribute(network, this.attributeName);
    if (!raw) return createPersistenceRecord({ workspaceId: context.workspaceId, networkId });
    try {
      const record = normalizePersistenceRecord(JSON.parse(raw));
      record.networkId = record.networkId ?? networkId;
      this._setStatus({ ok: true, state: 'loaded', error: null });
      return record;
    } catch (error) {
      this._setStatus({ ok: false, state: 'error', error: error?.message ?? String(error) });
      return createPersistenceRecord({ workspaceId: context.workspaceId, networkId });
    }
  }

  async save(record, context = {}) {
    const network = context.network ?? this.network;
    if (!network || !this.writable) return this.status();
    try {
      const networkId = this.ensureNetworkId(network);
      const portable = normalizePersistenceRecord({
        ...record,
        networkId,
        layers: {
          network: record?.layers?.network ?? {},
        },
        metadata: {
          ...(record?.metadata ?? {}),
          portable: true,
        },
      });
      setNetworkStringAttribute(network, this.attributeName, JSON.stringify(portable));
      return this._setStatus({ ok: true, state: 'saved', error: null });
    } catch (error) {
      return this._setStatus({ ok: false, state: 'error', error: error?.message ?? String(error) });
    }
  }
}

export function createPersistenceBackend(config = {}, context = {}) {
  if (config instanceof PersistenceBackend) return config;
  if (config?.kind === 'remote' || config?.type === 'remote' || config?.url) return new RemotePersistenceBackend(config);
  if (config?.kind === 'network' || config?.type === 'network') {
    return new NetworkAttributePersistenceBackend({ network: context.network, ...config });
  }
  if (config?.kind === 'custom' || config?.type === 'custom' || config?.read || config?.write) return new CustomPersistenceBackend(config);
  return new BrowserPersistenceBackend({ workspaceId: context.workspaceId, ...config });
}

export class PersistenceRegistry extends EventTarget {
  constructor(options = {}) {
    super();
    this.workspaceId = options.workspaceId ?? 'default';
    this.network = options.network ?? null;
    this.layers = createEmptyLayers();
    this.keys = new Map();
    this.bindings = new Map();
    this.backends = [];
    this.journal = [];
    this.nextSeq = 1;
    this.checkpointSeq = 0;
    this.autosave = options.autosave !== false;
    this.shouldDeferSync = typeof options.shouldDeferSync === 'function' ? options.shouldDeferSync : null;
    this.syncDeferDelay = typeof options.syncDeferDelay === 'function' ? options.syncDeferDelay : null;
    this.saveTimer = null;
    this.syncPromise = null;
    this.syncPendingOptions = null;
    this.statusFlags = {
      networkDirty: false,
      positionsDirty: false,
      syncing: false,
      lastSyncedAt: null,
      lastError: null,
    };
  }

  configure(options = {}) {
    if (options.workspaceId) this.workspaceId = options.workspaceId;
    if (Object.prototype.hasOwnProperty.call(options, 'network')) this.network = options.network;
    if (Object.prototype.hasOwnProperty.call(options, 'autosave')) this.autosave = options.autosave !== false;
    if (typeof options.shouldDeferSync === 'function') this.shouldDeferSync = options.shouldDeferSync;
    if (typeof options.syncDeferDelay === 'function') this.syncDeferDelay = options.syncDeferDelay;
    if (Object.prototype.hasOwnProperty.call(options, 'network')) {
      for (const backend of this.backends) {
        if (typeof backend.setNetwork === 'function') backend.setNetwork(this.network);
      }
    }
    if (Array.isArray(options.backends)) {
      this.backends = options.backends.map((backend) => createPersistenceBackend(backend, {
        workspaceId: this.workspaceId,
        network: this.network,
      }));
    }
    if (options.remote) this.addBackend(new RemotePersistenceBackend(options.remote));
    if (options.customBackend) this.addBackend(createPersistenceBackend({ type: 'custom', ...options.customBackend }, {
      workspaceId: this.workspaceId,
      network: this.network,
    }));
    if (options.browser !== false && !this.backends.some((backend) => backend.type === 'browser')) {
      this.addBackend(new BrowserPersistenceBackend({ workspaceId: this.workspaceId, ...(options.browser ?? {}) }));
    }
    if (options.networkAttributes !== false && !this.backends.some((backend) => backend.type === 'network')) {
      this.addBackend(new NetworkAttributePersistenceBackend({ network: this.network, ...(options.networkAttributes ?? {}) }));
    }
    this._emit('config', this.status());
    return this;
  }

  addBackend(backend) {
    if (!backend) return null;
    this.backends.push(backend);
    return backend;
  }

  context() {
    return {
      workspaceId: this.workspaceId,
      network: this.network,
    };
  }

  registerKey(path, options = {}) {
    const target = normalizePath(path);
    if (!target) throw new Error('registerKey requires a non-empty path');
    const previous = this.keys.get(target) ?? {};
    const entry = {
      path: target,
      scope: normalizeScope(options.scope, previous.scope ?? 'session'),
      targets: Array.isArray(options.targets) ? options.targets : (previous.targets ?? null),
      debounceMs: Number.isFinite(options.debounceMs) ? Math.max(0, Number(options.debounceMs)) : (previous.debounceMs ?? 100),
      validate: typeof options.validate === 'function' ? options.validate : previous.validate,
      serialize: typeof options.serialize === 'function' ? options.serialize : previous.serialize,
      deserialize: typeof options.deserialize === 'function' ? options.deserialize : previous.deserialize,
      metadata: { ...(previous.metadata ?? {}), ...(options.metadata ?? {}) },
    };
    this.keys.set(target, entry);
    if (Object.prototype.hasOwnProperty.call(options, 'defaultValue')) {
      const hasMutableValue = ['user', 'workspace', 'network', 'session']
        .some((scope) => Object.prototype.hasOwnProperty.call(this.layers[scope], target));
      if (!(options.preserveOverrides === true && hasMutableValue)) {
        this.layers.defaults[target] = cloneSerializable(options.defaultValue);
      }
      if (options.preserveOverrides !== true) {
        for (const scope of ['user', 'workspace', 'network', 'session']) {
          if (!Object.prototype.hasOwnProperty.call(this.layers[scope], target)) continue;
          const lower = this._lowerValue(scope, target);
          if (valuesEqual(lower, this.layers[scope][target])) delete this.layers[scope][target];
        }
      }
    }
    return entry;
  }

  _lowerValue(scope, path) {
    const rank = PERSISTENCE_SCOPE_RANK[scope] ?? PERSISTENCE_SCOPE_RANK.session;
    for (let i = rank - 1; i >= 0; i -= 1) {
      const lowerScope = PERSISTENCE_SCOPES[i];
      if (Object.prototype.hasOwnProperty.call(this.layers[lowerScope], path)) {
        return this.layers[lowerScope][path];
      }
    }
    return undefined;
  }

  _resolveEntry(path) {
    for (let i = PERSISTENCE_SCOPES.length - 1; i >= 0; i -= 1) {
      const scope = PERSISTENCE_SCOPES[i];
      if (Object.prototype.hasOwnProperty.call(this.layers[scope], path)) {
        return { scope, value: cloneSerializable(this.layers[scope][path]) };
      }
    }
    return { scope: null, value: undefined };
  }

  get(path, fallback = undefined) {
    const target = normalizePath(path);
    const { value } = this._resolveEntry(target);
    if (value === undefined) return fallback;
    const config = this.keys.get(target);
    return config?.deserialize ? config.deserialize(value) : value;
  }

  set(path, value, options = {}) {
    const target = normalizePath(path);
    if (!target) return null;
    const config = this.keys.get(target) ?? this.registerKey(target, {});
    const scope = normalizeScope(options.scope, config.scope ?? 'session');
    const next = config.serialize ? config.serialize(value) : value;
    if (config.validate && config.validate(next) === false) {
      throw new Error(`Invalid persistence value for "${target}"`);
    }
    const oldValue = this.get(target, undefined);
    const lower = this._lowerValue(scope, target);
    if (valuesEqual(lower, next)) delete this.layers[scope][target];
    else this.layers[scope][target] = cloneSerializable(next);
    const newValue = this.get(target, undefined);
    if (valuesEqual(oldValue, newValue)) return { path: target, scope, value: cloneSerializable(newValue), changed: false };
    const entry = {
      seq: this.nextSeq,
      timestamp: Date.now(),
      source: options.source ?? 'user',
      path: target,
      scope,
      oldValue: cloneSerializable(oldValue ?? null),
      newValue: cloneSerializable(newValue ?? null),
      reason: options.reason ?? 'set',
      status: 'pending',
    };
    this.nextSeq += 1;
    const pendingIndex = this.journal.findIndex((item) => (
      item?.status === 'pending'
      && item.path === entry.path
      && item.scope === entry.scope
    ));
    if (pendingIndex >= 0) {
      this.journal[pendingIndex] = {
        ...entry,
        seq: this.journal[pendingIndex].seq ?? entry.seq,
        oldValue: cloneSerializable(this.journal[pendingIndex].oldValue ?? entry.oldValue),
      };
    } else {
      this.journal.push(entry);
    }
    this._applyBinding(target, newValue, options);
    this._emit('change', { entries: [entry], path: target, scope, value: cloneSerializable(newValue) });
    if (this.autosave && options.autosave !== false) this.scheduleSync(config.debounceMs);
    return { path: target, scope, value: cloneSerializable(newValue), changed: true };
  }

  reset(pathOrScope, options = {}) {
    const target = normalizePath(pathOrScope);
    const resettingWholeScope = !Object.prototype.hasOwnProperty.call(options, 'scope')
      && Object.prototype.hasOwnProperty.call(PERSISTENCE_SCOPE_RANK, target);
    const scope = resettingWholeScope ? target : normalizeScope(options.scope, 'session');
    const pathPrefix = resettingWholeScope ? '' : target;
    const removed = [];
    for (const path of Object.keys(this.layers[scope])) {
      if (pathPrefix === '' || path === pathPrefix || path.startsWith(`${pathPrefix}.`)) {
        const oldValue = this.get(path, undefined);
        delete this.layers[scope][path];
        const newValue = this.get(path, undefined);
        removed.push({
          seq: this.nextSeq,
          timestamp: Date.now(),
          source: options.source ?? 'user',
          path,
          scope,
          oldValue: cloneSerializable(oldValue ?? null),
          newValue: cloneSerializable(newValue ?? null),
          reason: 'reset',
          status: 'pending',
        });
        this.nextSeq += 1;
        this._applyBinding(path, newValue, options);
      }
    }
    if (removed.length) {
      this.journal.push(...removed);
      this._emit('change', { entries: removed, path: target, scope });
      if (this.autosave && options.autosave !== false) this.scheduleSync(0);
    }
    return { reset: removed.length > 0, entries: removed };
  }

  keyStatus(pathOrScope, options = {}) {
    const target = normalizePath(pathOrScope);
    const mode = options.mode === 'scope' ? 'scope' : 'control';
    const mutableScopes = ['user', 'workspace', 'network', 'session'];
    if (!target) {
      return { path: target, state: 'default', scope: null, value: undefined, defaultValue: undefined };
    }
    const exactScope = mutableScopes.find((scope) => (
      Object.prototype.hasOwnProperty.call(this.layers[scope], target)
      && !valuesEqual(this.layers[scope][target], this._lowerValue(scope, target))
    )) ?? null;
    const hasDescendant = mode === 'scope' && mutableScopes.some((scope) => (
      Object.keys(this.layers[scope]).some((path) => (
        path !== target
        && path.startsWith(`${target}.`)
        && !valuesEqual(this.layers[scope][path], this._lowerValue(scope, path))
      ))
    ));
    const state = exactScope ? 'changed' : (hasDescendant ? 'partial' : 'default');
    const resolved = this._resolveEntry(target);
    return {
      path: target,
      state,
      scope: exactScope ?? resolved.scope,
      value: cloneSerializable(resolved.value),
      defaultValue: cloneSerializable(this.layers.defaults[target]),
      hasOverride: Boolean(exactScope),
      hasDescendantOverride: Boolean(hasDescendant),
    };
  }

  subscribe(path, callback, options = {}) {
    const target = normalizePath(path);
    const handler = (event) => {
      const entries = event?.detail?.entries ?? [];
      if (entries.some((entry) => entry.path === target || entry.path.startsWith(`${target}.`))) {
        callback(this.get(target), event.detail);
      }
    };
    this.addEventListener('change', handler);
    if (options.immediate !== false) callback(this.get(target), { immediate: true });
    return () => this.removeEventListener('change', handler);
  }

  bindKey(path, binding = {}) {
    const target = normalizePath(path);
    if (!target) throw new Error('bindKey requires a non-empty path');
    this.registerKey(target, binding);
    const bindings = this.bindings.get(target) ?? new Set();
    bindings.add(binding);
    this.bindings.set(target, bindings);
    if (typeof binding.read === 'function') {
      const current = binding.read();
      if (current !== undefined && this.get(target) === undefined) {
        this.set(target, current, { scope: binding.scope ?? 'defaults', source: 'binding', autosave: false });
      }
    }
    if (typeof binding.apply === 'function') {
      const resolved = this._resolveEntry(target);
      if (resolved.value !== undefined && (resolved.scope !== 'defaults' || binding.applyDefault === true)) {
        binding.apply(this.get(target), { reason: 'bind' });
      }
    }
    const unsubs = [];
    if (typeof binding.events === 'function') {
      const notify = () => {
        if (typeof binding.read === 'function') {
          this.set(target, binding.read(), { scope: binding.scope ?? 'session', source: binding.source ?? 'binding', reason: 'event' });
        }
      };
      const cleanup = binding.events(notify);
      if (typeof cleanup === 'function') unsubs.push(cleanup);
    }
    const events = Array.isArray(binding.events) ? binding.events : [];
    for (const eventBinding of events) {
      const source = eventBinding?.target ?? binding.target;
      const type = eventBinding?.type ?? eventBinding;
      if (!source || typeof type !== 'string') continue;
      const listener = () => {
        if (typeof binding.read === 'function') {
          this.set(target, binding.read(), { scope: binding.scope ?? 'session', source: binding.source ?? 'binding', reason: type });
        }
      };
      source.addEventListener?.(type, listener);
      unsubs.push(() => source.removeEventListener?.(type, listener));
    }
    return () => {
      const current = this.bindings.get(target);
      current?.delete(binding);
      for (const unsub of unsubs) unsub();
    };
  }

  refreshBoundKeys(options = {}) {
    const entries = [];
    for (const [path, bindings] of this.bindings.entries()) {
      for (const binding of bindings) {
        if (typeof binding.read !== 'function') continue;
        const value = binding.read();
        if (value === undefined) continue;
        const result = this.set(path, value, {
          scope: binding.scope ?? this.keys.get(path)?.scope ?? 'session',
          source: options.source ?? binding.source ?? 'binding',
          reason: options.reason ?? 'refresh-bound',
          autosave: options.autosave ?? false,
        });
        if (result?.changed) entries.push(result);
      }
    }
    return entries;
  }

  _applyBinding(path, value, options = {}) {
    const bindings = this.bindings.get(path);
    if (!bindings) return;
    for (const binding of bindings) {
      if (typeof binding.apply !== 'function') continue;
      binding.apply(value, options);
    }
  }

  async load() {
    const context = this.context();
    for (const backend of this.backends) {
      const record = normalizePersistenceRecord(await backend.load(context));
      for (const scope of PERSISTENCE_SCOPES) {
        if (!backend.supportsScope(scope)) continue;
        this.layers[scope] = {
          ...this.layers[scope],
          ...(record.layers?.[scope] ?? {}),
        };
      }
    }
    this._emit('change', { entries: [], reason: 'load' });
    return this.status();
  }

  toRecord() {
    return createPersistenceRecord({
      workspaceId: this.workspaceId,
      networkId: this.backends.find((backend) => backend instanceof NetworkAttributePersistenceBackend)?.ensureNetworkId?.(this.network) ?? null,
      layers: this.layers,
    });
  }

  _mergeSyncOptions(current = null, next = {}) {
    return {
      ...(current ?? {}),
      ...(next ?? {}),
      includeNetwork: current?.includeNetwork === true || next?.includeNetwork === true,
      includePositions: current?.includePositions === true || next?.includePositions === true,
    };
  }

  sync(options = {}) {
    if (this.syncPromise) {
      this.syncPendingOptions = this._mergeSyncOptions(this.syncPendingOptions, options);
      return this.syncPromise.then(() => {
        const pending = this.syncPendingOptions;
        if (!pending) return this.status();
        this.syncPendingOptions = null;
        return this.sync(pending);
      });
    }
    this.syncPromise = this._syncNow(options).finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  async _syncNow(options = {}) {
    const clearNetworkDirty = options.includeNetwork === true;
    const clearPositionsDirty = options.includePositions === true;
    this.statusFlags.syncing = true;
    this._emit('sync', this.status());
    const record = this.toRecord();
    const statuses = [];
    for (const backend of this.backends) {
      const filtered = createPersistenceRecord({
        workspaceId: record.workspaceId,
        networkId: record.networkId,
        layers: Object.fromEntries(PERSISTENCE_SCOPES.map((scope) => [
          scope,
          backend.supportsScope(scope) ? record.layers[scope] : {},
        ])),
      });
      statuses.push(await backend.save(filtered, this.context()));
    }
    for (const entry of this.journal) {
      if (entry.status === 'pending') entry.status = 'saved';
    }
    const failed = statuses.find((status) => status?.ok === false);
    if (failed) {
      console.error('[HeliosPersistence] Backend sync failed', {
        backend: failed,
        statuses,
        options,
      });
    }
    if (!failed) {
      if (clearNetworkDirty) this.statusFlags.networkDirty = false;
      if (clearPositionsDirty) this.statusFlags.positionsDirty = false;
      if (clearNetworkDirty) delete this.layers.session['network.persistence.dirty'];
      if (clearPositionsDirty) delete this.layers.session['positions.persistence.dirty'];
    }
    this.statusFlags.syncing = false;
    this.statusFlags.lastSyncedAt = failed ? this.statusFlags.lastSyncedAt : Date.now();
    this.statusFlags.lastError = failed?.error ?? null;
    this._emit('sync', this.status());
    return this.status();
  }

  flush(options = {}) {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    return this.sync(options);
  }

  scheduleSync(delay = 100) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (this.shouldDeferSync?.() === true) {
        this.scheduleSync(this.syncDeferDelay?.() ?? delay);
        return;
      }
      this.sync().catch((error) => {
        this.statusFlags.lastError = error?.message ?? String(error);
        console.error('[HeliosPersistence] Scheduled sync failed', error);
        this._emit('sync', this.status());
      });
    }, Math.max(0, Number(delay) || 0));
  }

  markNetworkDirty(reason = 'network') {
    this.statusFlags.networkDirty = true;
    this.statusFlags.networkReason = reason;
    this.set('network.persistence.dirty', true, { scope: 'session', source: 'system', reason, autosave: false });
    this._emit('change', { entries: [], reason });
  }

  markPositionsDirty(reason = 'positions') {
    this.statusFlags.positionsDirty = true;
    this.statusFlags.positionsReason = reason;
    this.set('positions.persistence.dirty', true, { scope: 'session', source: 'system', reason, autosave: false });
    this._emit('change', { entries: [], reason });
  }

  backendStatus() {
    return this.backends.map((backend) => backend.status());
  }

  getChangeJournal(options = {}) {
    let entries = this.journal;
    if (Number.isFinite(options.since)) entries = entries.filter((entry) => entry.seq > Number(options.since));
    if (options.sinceCheckpoint === true) entries = entries.filter((entry) => entry.seq > this.checkpointSeq);
    if (typeof options.source === 'string') entries = entries.filter((entry) => entry.source === options.source);
    if (Number.isFinite(options.limit)) entries = entries.slice(-Math.max(0, Number(options.limit)));
    return cloneSerializable(entries);
  }

  checkpoint(seq = null) {
    const maxSeq = this.journal.reduce((max, entry) => Math.max(max, entry.seq), 0);
    this.checkpointSeq = Number.isFinite(seq) ? Math.max(0, Number(seq)) : maxSeq;
    if (this.autosave) this.scheduleSync(0);
    return { checkpointSeq: this.checkpointSeq };
  }

  dirtyState() {
    const controls = {};
    const sections = {};
    const panels = {};
    for (const scope of ['user', 'workspace', 'network', 'session']) {
      for (const path of Object.keys(this.layers[scope])) {
        if (valuesEqual(this.layers[scope][path], this._lowerValue(scope, path))) continue;
        controls[path] = 'changed';
        const [panel, section] = path.split('.');
        if (panel) panels[panel] = panels[panel] === 'changed' ? 'changed' : 'partial';
        if (panel && section) sections[`${panel}.${section}`] = 'partial';
      }
    }
    return { controls, sections, panels };
  }

  status() {
    return {
      workspaceId: this.workspaceId,
      overrideCount: Object.keys(this.layers.session).length + Object.keys(this.layers.network).length + Object.keys(this.layers.workspace).length + Object.keys(this.layers.user).length,
      journalCount: this.journal.length,
      checkpointSeq: this.checkpointSeq,
      dirtyState: this.dirtyState(),
      backendStatus: this.backendStatus(),
      networkData: {
        enabled: this.get('network.persistence.enabled', true),
        dirty: this.statusFlags.networkDirty,
        positionsDirty: this.statusFlags.positionsDirty,
        status: this.statusFlags.syncing ? 'syncing' : (this.statusFlags.lastError ? 'error' : (this.statusFlags.lastSyncedAt ? 'saved' : 'idle')),
        savedAt: this.statusFlags.lastSyncedAt,
        remoteWarning: this.statusFlags.lastError,
      },
      pendingSave: Boolean(this.saveTimer),
      syncing: this.statusFlags.syncing,
      lastSyncedAt: this.statusFlags.lastSyncedAt,
      lastError: this.statusFlags.lastError,
    };
  }

  _emit(type, detail) {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent(type, { detail })
      : new Event(type);
    if (!event.detail) event.detail = detail;
    this.dispatchEvent(event);
  }
}
