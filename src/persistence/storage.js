function queueTask(callback) {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
    return;
  }
  Promise.resolve().then(callback);
}

export class LocalStoragePreferenceStore {
  constructor(options = {}) {
    this.storage = options.storage ?? globalThis.localStorage ?? null;
    this.key = options.key ?? 'helios-web:persistence:preferences';
    this.unfinishedSessionKey = options.unfinishedSessionKey ?? 'helios-web:persistence:unfinished-session';
  }

  async read() {
    if (!this.storage) return null;
    const raw = this.storage.getItem(this.key);
    return raw ? JSON.parse(raw) : null;
  }

  async write(value) {
    if (!this.storage) return null;
    this.storage.setItem(this.key, JSON.stringify(value));
    return value;
  }

  async clear() {
    this.storage?.removeItem?.(this.key);
  }

  async getUnfinishedSessionId() {
    if (!this.storage) return null;
    return this.storage.getItem(this.unfinishedSessionKey);
  }

  async setUnfinishedSessionId(id) {
    if (!this.storage) return null;
    if (id == null || id === '') this.storage.removeItem(this.unfinishedSessionKey);
    else this.storage.setItem(this.unfinishedSessionKey, String(id));
    return id ?? null;
  }
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export class IndexedDBSessionStore {
  constructor(options = {}) {
    this.indexedDB = options.indexedDB ?? globalThis.indexedDB ?? null;
    this.dbName = options.dbName ?? 'helios-web';
    this.storeName = options.storeName ?? 'sessions';
    this.version = options.version ?? 1;
    this._dbPromise = null;
  }

  async _open() {
    if (!this.indexedDB) {
      throw new Error('IndexedDB is not available in this environment');
    }
    if (this._dbPromise) return this._dbPromise;
    this._dbPromise = new Promise((resolve, reject) => {
      const request = this.indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    });
    return this._dbPromise;
  }

  async put(record) {
    const db = await this._open();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const request = store.put(record);
    await requestToPromise(request);
    return record;
  }

  async get(id) {
    const db = await this._open();
    const tx = db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    const result = await requestToPromise(store.get(id));
    return result ?? null;
  }

  async getAll() {
    const db = await this._open();
    const tx = db.transaction(this.storeName, 'readonly');
    const store = tx.objectStore(this.storeName);
    if (typeof store.getAll === 'function') {
      const result = await requestToPromise(store.getAll());
      return Array.isArray(result) ? result : [];
    }
    return new Promise((resolve, reject) => {
      const values = [];
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(values);
          return;
        }
        values.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error('Failed to list sessions'));
    });
  }

  async delete(id) {
    const db = await this._open();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    await requestToPromise(store.delete(id));
    return true;
  }
}

export function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  };
}

export function createMemoryIndexedDBFactory() {
  class MemoryRequest {
    constructor() {
      this.result = undefined;
      this.error = null;
      this.onsuccess = null;
      this.onerror = null;
      this.onupgradeneeded = null;
    }

    succeed(result, type = 'success') {
      this.result = result;
      queueTask(() => {
        const handler = type === 'upgradeneeded' ? this.onupgradeneeded : this.onsuccess;
        handler?.({ target: this });
      });
    }

    fail(error) {
      this.error = error;
      queueTask(() => this.onerror?.({ target: this }));
    }
  }

  class MemoryCursor {
    constructor(items, request) {
      this._items = items;
      this._request = request;
      this._index = 0;
      this.value = items[0] ?? null;
    }

    continue() {
      this._index += 1;
      const next = this._items[this._index] ?? null;
      queueTask(() => {
        this._request.result = next ? new MemoryCursor(this._items.slice(this._index), this._request) : null;
        this._request.onsuccess?.({ target: this._request });
      });
    }
  }

  class MemoryObjectStore {
    constructor(records, keyPath) {
      this.records = records;
      this.keyPath = keyPath;
    }

    put(value) {
      const request = new MemoryRequest();
      queueTask(() => {
        const key = value?.[this.keyPath];
        this.records.set(key, structuredClone(value));
        request.result = key;
        request.onsuccess?.({ target: request });
      });
      return request;
    }

    get(id) {
      const request = new MemoryRequest();
      queueTask(() => {
        request.result = this.records.has(id) ? structuredClone(this.records.get(id)) : undefined;
        request.onsuccess?.({ target: request });
      });
      return request;
    }

    getAll() {
      const request = new MemoryRequest();
      queueTask(() => {
        request.result = Array.from(this.records.values(), (value) => structuredClone(value));
        request.onsuccess?.({ target: request });
      });
      return request;
    }

    delete(id) {
      const request = new MemoryRequest();
      queueTask(() => {
        this.records.delete(id);
        request.result = undefined;
        request.onsuccess?.({ target: request });
      });
      return request;
    }

    openCursor() {
      const request = new MemoryRequest();
      const items = Array.from(this.records.values(), (value) => structuredClone(value));
      queueTask(() => {
        request.result = items.length ? new MemoryCursor(items, request) : null;
        request.onsuccess?.({ target: request });
      });
      return request;
    }
  }

  class MemoryTransaction {
    constructor(store) {
      this._store = store;
      this.error = null;
      this.oncomplete = null;
      this.onerror = null;
      this.onabort = null;
      queueTask(() => this.oncomplete?.({ target: this }));
    }

    objectStore() {
      return this._store;
    }
  }

  class MemoryDatabase {
    constructor(name, version) {
      this.name = name;
      this.version = version;
      this._stores = new Map();
      this.objectStoreNames = {
        contains: (name) => this._stores.has(name),
      };
    }

    createObjectStore(name, options = {}) {
      const store = new MemoryObjectStore(new Map(), options.keyPath ?? 'id');
      this._stores.set(name, store);
      return store;
    }

    transaction(name) {
      const store = this._stores.get(name);
      if (!store) throw new Error(`Unknown object store "${name}"`);
      return new MemoryTransaction(store);
    }
  }

  const databases = new Map();
  return {
    open(name, version = 1) {
      const request = new MemoryRequest();
      queueTask(() => {
        let db = databases.get(name) ?? null;
        const needsUpgrade = !db || version > db.version;
        if (!db) {
          db = new MemoryDatabase(name, version);
          databases.set(name, db);
        } else if (version > db.version) {
          db.version = version;
        }
        request.result = db;
        if (needsUpgrade) {
          request.onupgradeneeded?.({ target: request });
        }
        request.onsuccess?.({ target: request });
      });
      return request;
    },
  };
}
