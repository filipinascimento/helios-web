export class WebGPUResourceCache {
  constructor() {
    this.buffers = new Map();
    this.shaderModules = new Map();
    this.pipelines = new Map();
  }

  ensureBuffer(device, key, requiredBytes, usage, label = 'buffer') {
    if (!device) return null;
    const aligned = Math.max(256, Math.ceil((requiredBytes ?? 0) / 256) * 256);
    const existing = this.buffers.get(key);
    if (existing?.buffer && existing.size >= aligned && existing.usage === usage) {
      return existing;
    }
    existing?.buffer?.destroy?.();
    const buffer = device.createBuffer({ size: aligned, usage, label: `${label}:${key}` });
    const entry = {
      buffer,
      size: aligned,
      usage,
      byteLength: 0,
      version: null,
      topologyVersion: null,
      count: null,
      viewSig: null,
    };
    this.buffers.set(key, entry);
    return entry;
  }

  uploadBuffer(device, queue, key, typedArray, meta = {}, usage) {
    if (!device || !queue || !typedArray) return null;
    const byteLength = typedArray.byteLength ?? 0;
    const entry = this.ensureBuffer(device, key, byteLength, usage, meta.label ?? 'storage');
    if (!entry || !byteLength) return entry?.buffer ?? null;

    const version = meta.version ?? null;
    const topologyVersion = meta.topologyVersion ?? null;
    const count = meta.count ?? null;
    const viewSig = meta.trackViewIdentity
      ? `${typedArray.buffer}|${typedArray.byteOffset}|${typedArray.byteLength}`
      : null;

    const sameBytes = entry.byteLength === byteLength;
    const sameVersion = version == null || entry.version === version;
    const sameTopo = topologyVersion == null || entry.topologyVersion === topologyVersion;
    const sameCount = count == null || entry.count === count;
    const sameView = viewSig == null || entry.viewSig === viewSig;

    if (sameBytes && sameVersion && sameTopo && sameCount && sameView) {
      return entry.buffer;
    }

    queue.writeBuffer(entry.buffer, 0, typedArray);
    entry.byteLength = byteLength;
    entry.version = version;
    entry.topologyVersion = topologyVersion;
    entry.count = count;
    entry.viewSig = viewSig;
    this.buffers.set(key, entry);
    return entry.buffer;
  }

  getOrCreateShaderModule(device, key, code) {
    if (this.shaderModules.has(key)) return this.shaderModules.get(key);
    const module = device.createShaderModule({ code });
    this.shaderModules.set(key, module);
    return module;
  }

  getOrCreatePipeline(key, factory) {
    if (this.pipelines.has(key)) return this.pipelines.get(key);
    const pipeline = factory();
    this.pipelines.set(key, pipeline);
    return pipeline;
  }

  destroy() {
    for (const entry of this.buffers.values()) {
      entry?.buffer?.destroy?.();
    }
    this.buffers.clear();
    this.shaderModules.clear();
    this.pipelines.clear();
  }
}
