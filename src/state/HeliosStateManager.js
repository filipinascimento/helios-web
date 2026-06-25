function createDetailEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
  if (typeof Event === 'function') {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

export function cloneStateValue(value) {
  if (value == null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_) {
      // Fall through to JSON clone for plain serializable values.
    }
  }
  return JSON.parse(JSON.stringify(value));
}

export function valuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}

export function normalizeStateKey(key) {
  return String(key ?? '').trim().replace(/^\.+|\.+$/g, '');
}

export function joinStateKey(prefix, key) {
  const left = normalizeStateKey(prefix);
  const right = normalizeStateKey(key);
  if (!left) return right;
  if (!right) return left;
  if (right === left || right.startsWith(`${left}.`)) return right;
  return `${left}.${right}`;
}

function normalizeScope(scope) {
  const value = String(scope ?? '').trim();
  return ['user', 'workspace', 'network', 'session'].includes(value) ? value : 'session';
}

function normalizeType(type) {
  const value = String(type ?? '').trim();
  return ['number', 'boolean', 'string', 'enum', 'object', 'array'].includes(value) ? value : 'object';
}

export function isExplicitStateOverrideSource(source) {
  const value = String(source ?? '').trim();
  return value === 'ui' || value === 'program' || value === 'cli' || value === 'state';
}

export function normalizeStateChangeOrigin(detail = {}) {
  const source = String(detail.source ?? '').trim() || 'state';
  const origin = String(detail.origin ?? source).trim() || source;
  const reason = String(detail.reason ?? '').trim() || 'set';
  const defaultLike = source === 'default'
    || source === 'restore'
    || source === 'binding'
    || source === 'refresh'
    || reason.includes('default')
    || reason.includes('restore');
  const explicit = detail.intentional === true
    || detail.userInitiated === true
    || isExplicitStateOverrideSource(source)
    || isExplicitStateOverrideSource(origin);
  return {
    source,
    origin,
    reason,
    defaultLike,
    explicit,
  };
}

function keyMatchesSubscription(key, target, requestedKey, keyAliases = new Map()) {
  if (!target) return true;
  if (key === target || key.startsWith(`${target}.`)) return true;
  const requested = normalizeStateKey(requestedKey);
  if (!requested) return false;
  if (key === requested || key.startsWith(`${requested}.`)) return true;
  if (key === `behaviors.${requested}` || key.startsWith(`behaviors.${requested}.`)) return true;
  if (requested === 'camera' && (key === 'cameraControls' || key.startsWith('cameraControls.'))) return true;
  for (const alias of keyAliases.get(key) ?? []) {
    if (alias === requested || alias.startsWith(`${requested}.`) || requested.startsWith(`${alias}.`)) {
      return true;
    }
  }
  return false;
}

function assertStateEntryHasNoPlacement(key, entry) {
  const ui = entry?.ui && typeof entry.ui === 'object' ? entry.ui : {};
  if (
    Object.prototype.hasOwnProperty.call(entry ?? {}, 'panel')
    || Object.prototype.hasOwnProperty.call(entry ?? {}, 'section')
    || Object.prototype.hasOwnProperty.call(ui, 'panel')
    || Object.prototype.hasOwnProperty.call(ui, 'section')
  ) {
    throw new Error(`State entry "${key}" must not define panel or section placement; use a UI panel schema instead.`);
  }
}

function normalizeStateEntry(key, entry = {}, owner = null, localName = '') {
  assertStateEntryHasNoPlacement(key, entry);
  const hasDefault = Object.prototype.hasOwnProperty.call(entry, 'default');
  const hasDefaultValue = Object.prototype.hasOwnProperty.call(entry, 'defaultValue');
  const defaultValue = hasDefault ? entry.default : (hasDefaultValue ? entry.defaultValue : null);
  const aliases = Array.isArray(entry.aliases)
    ? entry.aliases.map((alias) => normalizeStateKey(alias)).filter(Boolean)
    : [];
  const methodName = normalizeStateKey(entry.method ?? localName).split('.').pop();
  const inferredGetterSetter = owner && methodName && typeof owner[methodName] === 'function'
    ? owner[methodName].bind(owner)
    : null;
  return {
    key,
    aliases,
    description: typeof entry.description === 'string' ? entry.description : '',
    default: cloneStateValue(defaultValue),
    type: normalizeType(entry.type),
    scope: normalizeScope(entry.scope),
    persist: entry.persist !== false,
    ui: entry.ui && typeof entry.ui === 'object' ? { ...entry.ui } : {},
    getter: typeof entry.getter === 'function'
      ? entry.getter
      : (typeof entry.get === 'function' ? entry.get : (inferredGetterSetter ? () => inferredGetterSetter() : null)),
    setter: typeof entry.setter === 'function'
      ? entry.setter
      : (typeof entry.set === 'function' ? entry.set : (inferredGetterSetter ? (value, options) => inferredGetterSetter(value, options) : null)),
    subscribe: typeof entry.subscribe === 'function' ? entry.subscribe : null,
    binder: typeof entry.binder === 'function' ? entry.binder : null,
    bindProperty: entry.bindProperty === true,
    property: typeof entry.property === 'string' ? entry.property : methodName,
    serialize: typeof entry.serialize === 'function' ? entry.serialize : null,
    deserialize: typeof entry.deserialize === 'function' ? entry.deserialize : null,
    equals: typeof entry.equals === 'function' ? entry.equals : valuesEqual,
  };
}

export function detailTargetsStateKey(detail = {}, target = '', manager = null) {
  const keys = [];
  if (typeof detail.storageKey === 'string') keys.push(detail.storageKey);
  if (typeof detail.stateKey === 'string') keys.push(detail.stateKey);
  if (Array.isArray(detail.storageKeys)) {
    for (const key of detail.storageKeys) {
      if (typeof key === 'string') keys.push(key);
    }
  }
  if (Array.isArray(detail.stateKeys)) {
    for (const key of detail.stateKeys) {
      if (typeof key === 'string') keys.push(key);
    }
  }
  if (!keys.length) return false;
  return keys.some((key) => manager?.resolveKey?.(key) === target);
}

function detailHasStateKeys(detail = {}) {
  return typeof detail.storageKey === 'string'
    || typeof detail.stateKey === 'string'
    || (Array.isArray(detail.storageKeys) && detail.storageKeys.some((key) => typeof key === 'string'))
    || (Array.isArray(detail.stateKeys) && detail.stateKeys.some((key) => typeof key === 'string'));
}

/**
 * Central live state graph for Helios defaults, bindings, overrides, and reset status.
 *
 * @public
 * @apiSection Persistence
 */
export class HeliosStateManager extends EventTarget {
  constructor(options = {}) {
    super();
    this.entries = new Map();
    this.values = new Map();
    this.overrides = new Map();
    this.aliases = new Map();
    this.keyAliases = new Map();
    this.owners = new Map();
    this.parentKeys = new Set();
    this.overrideDescendantCounts = new Map();
    this.now = options.now ?? (() => Date.now());
    this.nextSeq = 1;
    this.journal = [];
    this.recentChanges = [];
    this.subscriptions = new Set();
    this.subscriptionsByTarget = new Map();
    this.bindings = new StateBindingController(this);
    this._transaction = null;
    this.overrideTrackingReady = options.overrideTrackingReady !== false;
  }

  setOverrideTrackingReady(ready = true) {
    this.overrideTrackingReady = ready !== false;
    return this.overrideTrackingReady;
  }

  register(owner, prefix, entries = {}) {
    let actualOwner = owner;
    let actualPrefix = prefix;
    let actualEntries = entries;
    if (entries == null || typeof entries !== 'object') {
      actualEntries = prefix;
      actualPrefix = owner;
      actualOwner = null;
    }
    const cleanups = [];
    for (const [name, descriptor] of Object.entries(actualEntries ?? {})) {
      const key = joinStateKey(actualPrefix, name);
      if (!key) continue;
      const previousEntry = this.entries.get(key) ?? null;
      const previousValue = this.values.has(key) ? this.values.get(key) : undefined;
      const entry = normalizeStateEntry(key, descriptor, actualOwner, name);
      this.entries.set(key, entry);
      this._trackKnownStateKey(key);
      for (const alias of entry.aliases) {
        if (alias === key) continue;
        this.aliases.set(alias, key);
        const keyAliases = this.keyAliases.get(key) ?? new Set();
        keyAliases.add(alias);
        this.keyAliases.set(key, keyAliases);
        if (this.values.has(alias)) {
          this.values.set(key, cloneStateValue(this.values.get(alias)));
          this.values.delete(alias);
        }
        if (this.overrides.has(alias)) {
          this.overrides.set(key, cloneStateValue(this.overrides.get(alias)));
          this.overrides.delete(alias);
          this._rebuildOverrideDescendantCounts();
        }
      }
      if (actualOwner) {
        const ownerKeys = this.owners.get(actualOwner) ?? new Set();
        ownerKeys.add(key);
        this.owners.set(actualOwner, ownerKeys);
      }
      const initial = entry.getter ? entry.getter() : entry.default;
      const initialValue = cloneStateValue(initial == null ? entry.default : initial);
      if (!this.values.has(key)) {
        this.values.set(key, initialValue);
      } else if (
        !this.overrides.has(key)
        && previousEntry
        && (previousValue == null || previousEntry.equals(previousValue, previousEntry.default))
      ) {
        this.values.set(key, initialValue);
      }
      const bindingCleanup = this.bindings.bind(key, entry, actualOwner);
      if (this.overrides.has(key)) {
        const overrideValue = cloneStateValue(this.overrides.get(key));
        const restoredValue = entry.deserialize ? entry.deserialize(overrideValue, {
          source: 'restore',
          reason: 'register-existing-override',
        }) : overrideValue;
        this.values.set(key, cloneStateValue(restoredValue));
        this.bindings.apply(key, restoredValue, {
          source: 'restore',
          reason: 'register-existing-override',
          applyBinding: true,
          trackOverride: false,
        });
      }
      cleanups.push(() => {
        bindingCleanup?.();
        for (const alias of this.keyAliases.get(key) ?? []) {
          this.aliases.delete(alias);
        }
        this.keyAliases.delete(key);
        this.entries.delete(key);
        this.values.delete(key);
        this._deleteOverride(key);
      });
    }
    return () => {
      for (const cleanup of cleanups) cleanup();
      if (actualOwner) this.owners.delete(actualOwner);
      this._emit('change', { reason: 'unregister', owner: actualOwner ?? null });
    };
  }

  entry(key) {
    const target = this.resolveKey(key);
    const entry = this.entries.get(target);
    return entry ? { ...entry, ui: { ...(entry.ui ?? {}) } } : null;
  }

  entriesFor(prefix = '') {
    const target = this.resolveKey(prefix);
    return Array.from(this.entries.entries())
      .filter(([key]) => !target || key === target || key.startsWith(`${target}.`))
      .map(([key, entry]) => [key, { ...entry, ui: { ...(entry.ui ?? {}) } }]);
  }

  get(key, fallback = undefined) {
    const target = this.resolveKey(key);
    if (this.values.has(target)) return this.values.get(target);
    const entry = this.entries.get(target);
    if (entry) return entry.default;
    return fallback;
  }

  set(key, value, options = {}) {
    return this._setOne(key, value, options);
  }

  setDefault(key, value, options = {}) {
    const requestedKey = normalizeStateKey(key);
    const target = this.resolveKey(requestedKey);
    if (!target) return null;
    const previous = this.entries.get(target) ?? normalizeStateEntry(target, {});
    const entry = { ...previous, default: cloneStateValue(value) };
    this.entries.set(target, entry);
    if (!this.overrides.has(target)) {
      this.values.set(target, cloneStateValue(value));
      this.bindings.apply(target, value, {
        source: options.source ?? 'default',
        reason: options.reason ?? 'set-default',
        applyBinding: true,
      });
    }
    const detail = {
      key: target,
      path: target,
      requestedKey,
      value: this.get(target),
      default: cloneStateValue(value),
      source: options.source ?? 'default',
      reason: options.reason ?? 'set-default',
      trackOverride: false,
      overrideChanged: false,
      status: this.status(target),
    };
    this._emit('change', detail);
    return detail;
  }

  reset(keyOrPrefix, options = {}) {
    const target = this.resolveKey(keyOrPrefix);
    if (!target) return { reset: false, entries: [] };
    const keys = this._matchingKeys(target);
    const entries = [];
    for (const key of keys) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      const result = this._setOne(key, cloneStateValue(entry.default), {
        ...options,
        source: options.source ?? 'reset',
        reason: options.reason ?? 'reset',
        trackOverride: false,
        clearOverride: true,
      });
      if (result?.event) entries.push(result.event);
    }
    return { reset: entries.length > 0, entries };
  }

  resetToDefault(keyOrPrefix, options = {}) {
    return this.reset(keyOrPrefix, options);
  }

  status(keyOrPrefix) {
    const requestedKey = normalizeStateKey(keyOrPrefix);
    const target = this.resolveKey(requestedKey);
    const entry = this.entries.get(target) ?? null;
    const hasOverride = this.overrides.has(target);
    if (entry || this.values.has(target)) {
      const changedChildren = this.overrideDescendantCounts.get(target) ?? 0;
      return {
        key: requestedKey || target,
        canonicalKey: target,
        state: hasOverride ? 'changed' : (changedChildren > 0 ? 'partial' : 'default'),
        hasOverride: hasOverride || changedChildren > 0,
        value: this.get(target),
        default: entry?.default ?? null,
        defaultValue: entry?.default ?? null,
      };
    }
    const exactOverride = this.overrides.has(target);
    const changed = (this.overrideDescendantCounts.get(target) ?? 0) + (exactOverride ? 1 : 0);
    return {
      key: target,
      canonicalKey: target,
      state: exactOverride ? 'changed' : (changed > 0 ? 'partial' : 'default'),
      hasOverride: changed > 0,
      value: undefined,
      default: undefined,
      defaultValue: undefined,
    };
  }

  dirtyState() {
    const controls = {};
    const sections = {};
    const panels = {};
    for (const key of this.overrides.keys()) {
      controls[key] = 'changed';
      for (const alias of this.keyAliases.get(key) ?? []) {
        controls[alias] = 'changed';
      }
      const parts = key.split('.');
      if (parts[0]) panels[parts[0]] = panels[parts[0]] === 'changed' ? 'changed' : 'partial';
      if (parts[0] && parts[1]) sections[`${parts[0]}.${parts[1]}`] = 'partial';
    }
    return { controls, sections, panels };
  }

  subscribe(keyOrPrefix, callback, options = {}) {
    const requestedKey = normalizeStateKey(keyOrPrefix);
    const target = this.resolveKey(requestedKey);
    if (typeof callback !== 'function') return () => {};
    const subscription = { requestedKey, target, callback };
    this.subscriptions.add(subscription);
    const targetSubscriptions = this.subscriptionsByTarget.get(target) ?? new Set();
    targetSubscriptions.add(subscription);
    this.subscriptionsByTarget.set(target, targetSubscriptions);
    if (options.immediate === true && target) callback(this.get(target), { key: requestedKey || target, canonicalKey: target, reason: 'subscribe' });
    return () => {
      this.subscriptions.delete(subscription);
      const subscriptions = this.subscriptionsByTarget.get(target);
      subscriptions?.delete(subscription);
      if (subscriptions && subscriptions.size <= 0) this.subscriptionsByTarget.delete(target);
    };
  }

  transaction(options = {}, callback = null) {
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (typeof callback !== 'function') return null;
    if (this._transaction) {
      const tx = new StateTransaction(this, this._transaction.options);
      callback(tx);
      return tx.result();
    }
    const previous = this._transaction;
    const transaction = { options, events: [] };
    this._transaction = transaction;
    try {
      const tx = new StateTransaction(this, options);
      callback(tx);
      const events = transaction.events.slice();
      if (events.length) {
        this._emit('transaction', {
          source: options.source ?? 'state',
          reason: options.reason ?? 'transaction',
          events: events.map((event) => cloneStateValue(event)),
          keys: Array.from(new Set(events.map((event) => event.key))),
        });
      }
      return tx.result();
    } finally {
      this._transaction = previous;
    }
  }

  restore(snapshot = {}, options = {}) {
    const source = snapshot?.overrides && typeof snapshot.overrides === 'object'
      ? snapshot.overrides
      : snapshot;
    const restored = [];
    this.transaction({
      source: options.source ?? 'restore',
      reason: options.reason ?? 'restore',
    }, (tx) => {
      for (const [key, value] of Object.entries(source ?? {})) {
        const result = tx.set(key, value, {
          source: options.source ?? 'restore',
          reason: options.reason ?? 'restore',
          trackOverride: options.trackOverride,
          applyBinding: options.applyBinding,
        });
        if (result?.key) restored.push(result.key);
      }
    });
    return restored;
  }

  snapshot(options = {}) {
    const snapshot = {
      schema: 'helios-web.state',
      version: 1,
      overrides: this.getOverrides(options),
    };
    if (options.includeValues === true) {
      snapshot.values = Object.fromEntries(Array.from(this.values.entries(), ([key, value]) => [key, cloneStateValue(value)]));
    }
    if (options.includeJournal === true) {
      snapshot.journal = this.journal.map((entry) => cloneStateValue(entry));
    }
    return snapshot;
  }

  serialize() {
    return {
      values: Object.fromEntries(Array.from(this.values.entries(), ([key, value]) => [key, cloneStateValue(value)])),
      overrides: Object.fromEntries(Array.from(this.overrides.entries(), ([key, value]) => [key, cloneStateValue(value)])),
      journal: this.journal.map((entry) => cloneStateValue(entry)),
    };
  }

  preferredKey(key) {
    const target = this.resolveKey(key);
    const aliases = this.keyAliases.get(target);
    return aliases?.values?.().next?.().value ?? target;
  }

  overrideKeys() {
    return Array.from(this.overrides.keys());
  }

  getOverrides(options = {}) {
    const aliases = options.aliases ?? 'preferred';
    const output = {};
    for (const [key, value] of this.overrides.entries()) {
      const clonedValue = cloneStateValue(value);
      const aliasList = Array.from(this.keyAliases.get(key) ?? []);
      if (aliases === 'all') {
        output[key] = clonedValue;
        for (const alias of aliasList) output[alias] = cloneStateValue(value);
      } else if (aliases === true || aliases === 'preferred') {
        output[aliasList[0] ?? key] = clonedValue;
      } else {
        output[key] = clonedValue;
      }
    }
    return output;
  }

  resolveKey(key) {
    const target = normalizeStateKey(key);
    if (!target) return '';
    if (this.aliases.has(target)) return this.aliases.get(target);
    let bestAlias = '';
    let bestKey = target;
    for (const [alias, canonical] of this.aliases.entries()) {
      if (!target.startsWith(`${alias}.`)) continue;
      if (alias.length <= bestAlias.length) continue;
      bestAlias = alias;
      bestKey = `${canonical}${target.slice(alias.length)}`;
    }
    return bestKey;
  }

  _setOne(key, value, options = {}) {
    const requestedKey = normalizeStateKey(key);
    const target = this.resolveKey(requestedKey);
    if (!target) return null;
    const entry = this.entries.get(target) ?? normalizeStateEntry(target, {});
    if (!this.entries.has(target)) {
      this.entries.set(target, entry);
      this._trackKnownStateKey(target);
    }
    const nextValue = entry.deserialize ? entry.deserialize(value, options) : value;
    const oldValue = this.values.has(target) ? this.values.get(target) : entry.default;
    const serializedOverride = entry.serialize ? entry.serialize(nextValue, options) : nextValue;
    const trackOverride = entry.persist !== false && this._shouldTrackOverride(options);
    const origin = normalizeStateChangeOrigin(options);
    const hadOverride = this.overrides.has(target);
    const overrideChanged = trackOverride
      ? (!hadOverride || !entry.equals(this.overrides.get(target), serializedOverride))
      : options.clearOverride === true && hadOverride;
    if (entry.equals(oldValue, nextValue) && !overrideChanged) {
      return { changed: false, key: target, value: nextValue, state: this.status(target).state };
    }
    this.values.set(target, nextValue);
    if (trackOverride) {
      this._setOverride(target, serializedOverride);
    } else if (options.clearOverride === true) {
      this._deleteOverride(target);
    }
    const event = {
      seq: this.nextSeq,
      timestamp: this.now(),
      key: target,
      path: target,
      requestedKey,
      oldValue,
      newValue: nextValue,
      value: nextValue,
      source: options.source ?? 'state',
      origin: options.origin ?? origin.origin,
      reason: options.reason ?? 'set',
      defaultLike: origin.defaultLike,
      explicit: origin.explicit,
      applyBinding: options.applyBinding !== false,
      trackOverride,
      overrideChanged,
      overrideDelta: overrideChanged
        ? {
            key: target,
            value: trackOverride ? serializedOverride : undefined,
            deleted: !trackOverride && options.clearOverride === true,
          }
        : null,
      autosave: options.autosave,
      debounceMs: options.debounceMs ?? options.persistenceDebounceMs,
      status: null,
    };
    event.status = this.status(target);
    this.nextSeq += 1;
    if (options.journal !== false) this._recordJournal(event);
    this._recordRecentChange(event);
    if (event.applyBinding !== false) this.bindings.apply(target, nextValue, event);
    this._emit('change', event);
    if (this._transaction) this._transaction.events.push(event);
    return { changed: true, key: target, value: nextValue, state: event.status.state, event };
  }

  _matchingKeys(prefix) {
    const requested = normalizeStateKey(prefix);
    const target = this.resolveKey(requested);
    const keys = new Set([...this.entries.keys(), ...this.values.keys(), ...this.overrides.keys()]);
    for (const [alias, key] of this.aliases.entries()) {
      if (alias === requested || alias.startsWith(`${requested}.`)) keys.add(key);
    }
    return Array.from(keys).filter((key) => key === target || key.startsWith(`${target}.`) || this._keyMatchesAliasPrefix(key, requested));
  }

  _trackKnownStateKey(key) {
    const parts = normalizeStateKey(key).split('.').filter(Boolean);
    for (let i = 1; i < parts.length; i += 1) {
      this.parentKeys.add(parts.slice(0, i).join('.'));
    }
  }

  _ancestorsForKey(key) {
    const parts = normalizeStateKey(key).split('.').filter(Boolean);
    const ancestors = [];
    for (let i = 1; i < parts.length; i += 1) {
      ancestors.push(parts.slice(0, i).join('.'));
    }
    return ancestors;
  }

  _setOverride(key, value) {
    const target = normalizeStateKey(key);
    const hadOverride = this.overrides.has(target);
    this.overrides.set(target, value);
    if (hadOverride) return;
    for (const ancestor of this._overrideCountAncestors(target)) {
      this.overrideDescendantCounts.set(ancestor, (this.overrideDescendantCounts.get(ancestor) ?? 0) + 1);
    }
  }

  _deleteOverride(key) {
    const target = normalizeStateKey(key);
    if (!this.overrides.delete(target)) return;
    for (const ancestor of this._overrideCountAncestors(target)) {
      const next = (this.overrideDescendantCounts.get(ancestor) ?? 0) - 1;
      if (next > 0) this.overrideDescendantCounts.set(ancestor, next);
      else this.overrideDescendantCounts.delete(ancestor);
    }
  }

  _rebuildOverrideDescendantCounts() {
    this.overrideDescendantCounts.clear();
    for (const key of this.overrides.keys()) {
      for (const ancestor of this._overrideCountAncestors(key)) {
        this.overrideDescendantCounts.set(ancestor, (this.overrideDescendantCounts.get(ancestor) ?? 0) + 1);
      }
    }
  }

  _overrideCountAncestors(key) {
    const ancestors = new Set(this._ancestorsForKey(key));
    if (key === 'cameraControls' || key.startsWith('cameraControls.')) {
      ancestors.add('camera');
      const suffix = key.slice('cameraControls'.length).replace(/^\./u, '');
      if (suffix) {
        for (const ancestor of this._ancestorsForKey(`camera.controls.${suffix}`)) ancestors.add(ancestor);
      }
    }
    for (const alias of this.keyAliases.get(key) ?? []) {
      for (const ancestor of this._ancestorsForKey(alias)) ancestors.add(ancestor);
    }
    return ancestors;
  }

  _recordJournal(event) {
    this.journal.push(event);
    const max = 1000;
    if (this.journal.length > max) this.journal.splice(0, this.journal.length - max);
  }

  _recordRecentChange(event) {
    this.recentChanges.push({
      timestamp: event.timestamp,
      key: event.key,
      source: event.source,
      origin: event.origin,
      reason: event.reason,
      trackOverride: event.trackOverride,
      overrideChanged: event.overrideChanged,
      defaultLike: event.defaultLike,
    });
    const cutoff = this.now() - (10 * 60 * 1000);
    while (this.recentChanges.length > 0 && this.recentChanges[0].timestamp < cutoff) {
      this.recentChanges.shift();
    }
    const max = 2000;
    if (this.recentChanges.length > max) this.recentChanges.splice(0, this.recentChanges.length - max);
  }

  debugStats(options = {}) {
    const windowMs = Number.isFinite(options.windowMs) ? Math.max(0, Number(options.windowMs)) : 5 * 60 * 1000;
    const cutoff = this.now() - windowMs;
    const recent = this.recentChanges.filter((entry) => entry.timestamp >= cutoff);
    return {
      windowMs,
      trackedStateCount: this.overrides.size,
      trackedKeys: Array.from(this.overrides.keys()),
      stateChangeCount: recent.length,
      uiChangeCount: recent.filter((entry) => entry.source === 'ui' || entry.origin === 'ui').length,
      recentChanges: recent.map((entry) => cloneStateValue(entry)),
    };
  }

  _subscriptionTargetsForKey(key) {
    const targets = new Set();
    const addPrefixes = (value) => {
      const parts = normalizeStateKey(value).split('.').filter(Boolean);
      for (let i = 1; i <= parts.length; i += 1) {
        targets.add(parts.slice(0, i).join('.'));
      }
    };
    addPrefixes(key);
    for (const alias of this.keyAliases.get(key) ?? []) addPrefixes(alias);
    if (key === 'cameraControls' || key.startsWith('cameraControls.')) targets.add('camera');
    if (key.startsWith('behaviors.')) addPrefixes(key.replace(/^behaviors\./u, ''));
    return targets;
  }

  _shouldTrackOverride(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, 'trackOverride')) {
      return options.trackOverride !== false;
    }
    const origin = normalizeStateChangeOrigin(options);
    if (origin.defaultLike) return false;
    if (this.overrideTrackingReady === false && !origin.explicit) {
      return false;
    }
    if (
      this.overrideTrackingReady === false
      && (origin.source === 'state' || origin.origin === 'state')
      && options.intentional !== true
      && options.trackOverride !== true
    ) {
      return false;
    }
    return origin.explicit;
  }

  _keyMatchesAliasPrefix(key, prefix) {
    if (!prefix) return true;
    if (key === `behaviors.${prefix}` || key.startsWith(`behaviors.${prefix}.`)) return true;
    if (prefix === 'camera' && (key === 'cameraControls' || key.startsWith('cameraControls.'))) return true;
    for (const alias of this.keyAliases.get(key) ?? []) {
      if (alias === prefix || alias.startsWith(`${prefix}.`)) return true;
    }
    return false;
  }

  _emit(type, detail) {
    this.dispatchEvent(createDetailEvent(type, detail));
    if (type === 'change') this._notifySubscriptions(detail);
  }

  _notifySubscriptions(detail = {}) {
    const key = normalizeStateKey(detail?.key ?? '');
    const subscriptions = key
      ? new Set(Array.from(this._subscriptionTargetsForKey(key))
        .flatMap((target) => Array.from(this.subscriptionsByTarget.get(target) ?? [])))
      : new Set(this.subscriptions);
    for (const subscription of subscriptions) {
      if (key && !keyMatchesSubscription(key, subscription.target, subscription.requestedKey, this.keyAliases)) continue;
      const value = key && key === subscription.target && Object.prototype.hasOwnProperty.call(detail, 'value')
        ? detail.value
        : this.get(subscription.target || key);
      subscription.callback(value, detail);
    }
  }
}

/**
 * Helper passed to `HeliosStateManager.transaction()` for grouped state writes.
 *
 * @public
 * @apiSection Persistence
 */
export class StateTransaction {
  constructor(manager, options = {}) {
    this.manager = manager;
    this.options = options;
    this.events = [];
  }

  set(key, value, options = {}) {
    const result = this.manager._setOne(key, value, { ...this.options, ...options });
    if (result?.event) this.events.push(result.event);
    return result;
  }

  reset(keyOrPrefix, options = {}) {
    return this.manager.reset(keyOrPrefix, { ...this.options, ...options });
  }

  result() {
    return {
      changed: this.events.length > 0,
      events: this.events.map((event) => cloneStateValue(event)),
      keys: Array.from(new Set(this.events.map((event) => event.key))),
    };
  }
}

/**
 * Binding controller that keeps registered state entries synchronized with runtime owners.
 *
 * @public
 * @apiSection Persistence
 */
export class StateBindingController {
  constructor(manager) {
    this.manager = manager;
    this.cleanups = new Map();
    this.applying = new Set();
    this.bindings = new Map();
  }

  bind(key, entry, owner = null) {
    const target = normalizeStateKey(key);
    if (!target || !entry) return () => {};
    this.unbind(target);
    const cleanups = [];
    const applyValue = (value, options = {}) => this.apply(target, value, options);
    this.bindings.set(target, { entry, owner, applyValue });
    const notify = (value, detail = {}) => {
      if (this.applying.has(target)) return;
      const nextValue = value === undefined && typeof entry.getter === 'function' ? entry.getter() : value;
      const origin = normalizeStateChangeOrigin(detail);
      if (
        detail.trackOverride !== false
        && origin.explicit
        && !origin.defaultLike
        && !detailHasStateKeys(detail)
        && typeof console !== 'undefined'
        && typeof console.warn === 'function'
      ) {
        console.warn(`[HeliosState] Ignoring broad explicit binding notification for "${target}". State changes must include storageKey/stateKey.`);
      }
      const shouldTrackOverride = detail.trackOverride === false
        ? false
        : (detail.trackOverride === true || (origin.explicit && !origin.defaultLike))
        && detailTargetsStateKey(detail, target, this.manager);
      this.manager.set(target, nextValue, {
        source: detail.source ?? 'binding',
        origin: detail.origin ?? origin.origin,
        reason: detail.reason ?? 'bound-change',
        trackOverride: shouldTrackOverride,
        applyBinding: false,
      });
    };
    if (typeof entry.binder === 'function') {
      const cleanup = entry.binder({
        key: target,
        state: this.manager,
        manager: this.manager,
        notify,
        apply: applyValue,
      });
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    } else if (typeof entry.subscribe === 'function') {
      const cleanup = entry.subscribe((value, detail) => notify(value, detail));
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    } else if (owner && typeof owner.bind === 'function') {
      const cleanup = owner.bind(target.split('.').pop(), (value, detail) => notify(value, detail));
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }
    const cleanup = () => {
      for (const fn of cleanups.splice(0)) fn?.();
      this.bindings.delete(target);
      this.cleanups.delete(target);
    };
    this.cleanups.set(target, cleanup);
    return cleanup;
  }

  apply(key, value, options = {}) {
    const target = normalizeStateKey(key);
    const binding = this.bindings.get(target);
    if (!binding || this.applying.has(target)) return;
    const { entry, owner } = binding;
    this.applying.add(target);
    try {
      if (typeof entry.setter === 'function') {
        entry.setter(value, options);
      } else if (entry.bindProperty && owner && entry.property) {
        owner[entry.property] = value;
      }
    } finally {
      this.applying.delete(target);
    }
  }

  unbind(key) {
    const target = normalizeStateKey(key);
    const cleanup = this.cleanups.get(target);
    cleanup?.();
    return Boolean(cleanup);
  }

  destroy() {
    for (const cleanup of Array.from(this.cleanups.values())) cleanup?.();
    this.cleanups.clear();
    this.bindings.clear();
  }
}

export default HeliosStateManager;
