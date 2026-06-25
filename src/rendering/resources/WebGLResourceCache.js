export class WebGLResourceCache {
  constructor() {
    this.buffers = new Map();
    this.programs = new Map();
  }

  ensureBuffer(gl, key) {
    if (!gl) return null;
    const existing = this.buffers.get(key);
    if (existing?.buffer) return existing.buffer;
    const buffer = gl.createBuffer();
    const entry = existing && typeof existing === 'object' ? existing : {};
    entry.buffer = buffer;
    entry.byteLength = 0;
    entry.version = null;
    entry.topologyVersion = null;
    entry.count = null;
    entry.viewSig = null;
    this.buffers.set(key, entry);
    return buffer;
  }

  uploadArrayBuffer(gl, key, typedArray, meta = {}) {
    if (!gl || !typedArray) return null;
    const buffer = this.ensureBuffer(gl, key);
    if (!buffer) return null;

    const byteLength = typedArray.byteLength ?? 0;
    if (!byteLength) return buffer;

    const version = meta.version ?? null;
    const topologyVersion = meta.topologyVersion ?? null;
    const count = meta.count ?? null;
    const viewSig = meta.trackViewIdentity
      ? `${typedArray.buffer}|${typedArray.byteOffset}|${typedArray.byteLength}`
      : null;

    const entry = this.buffers.get(key);
    const sameBytes = entry?.byteLength === byteLength;
    const sameVersion = version == null || entry?.version === version;
    const sameTopo = topologyVersion == null || entry?.topologyVersion === topologyVersion;
    const sameCount = count == null || entry?.count === count;
    const sameView = viewSig == null || entry?.viewSig === viewSig;

    if (sameBytes && sameVersion && sameTopo && sameCount && sameView) {
      return buffer;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, typedArray, gl.DYNAMIC_DRAW);

    entry.byteLength = byteLength;
    entry.version = version;
    entry.topologyVersion = topologyVersion;
    entry.count = count;
    entry.viewSig = viewSig;
    this.buffers.set(key, entry);
    return buffer;
  }

  getOrCreateProgram(key, factory) {
    if (this.programs.has(key)) return this.programs.get(key);
    const created = factory();
    this.programs.set(key, created);
    return created;
  }

  destroy(gl) {
    if (!gl) return;
    for (const entry of this.buffers.values()) {
      if (entry?.buffer) gl.deleteBuffer(entry.buffer);
    }
    for (const entry of this.programs.values()) {
      if (entry?.program) gl.deleteProgram(entry.program);
    }
    this.buffers.clear();
    this.programs.clear();
  }
}
