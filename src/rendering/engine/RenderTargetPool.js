export class RenderTargetPool {
  constructor() {
    this.cache = new Map();
  }

  get(device, tag, width, height, options = {}) {
    if (!device || !width || !height) return null;
    const key = this.#makeKey(device.type, tag, width, height, options);
    const existing = this.cache.get(key);
    if (existing) return existing;
    const created = device.type === 'webgl2'
      ? this.#createWebGLTarget(device, width, height, options)
      : this.#createWebGPUTarget(device, width, height, options);
    this.cache.set(key, created);
    return created;
  }

  releaseAll(device) {
    if (!device) return;
    for (const target of this.cache.values()) {
      if (device.type === 'webgl2') {
        const gl = device.gl;
        if (target.handle) gl.deleteFramebuffer(target.handle);
        if (target.texture) gl.deleteTexture(target.texture);
        if (target.depth) gl.deleteRenderbuffer?.(target.depth);
      } else if (device.type === 'webgpu') {
        target.texture?.destroy?.();
        target.depthTexture?.destroy?.();
      }
    }
    this.cache.clear();
  }

  #makeKey(type, tag, width, height, options) {
    const fmt = options.format ?? 'default';
    const samples = options.samples ?? 1;
    const depth = options.depth ? 'd1' : 'd0';
    const filter = options.filter === 'nearest' ? 'n' : 'l';
    return `${type}|${tag}|${width}x${height}|${fmt}|s${samples}|${depth}|f${filter}`;
  }

  #createWebGLTarget(device, width, height, options) {
    const { gl } = device;
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const filter = options.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    let depth = null;
    if (options.depth) {
      depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      type: 'webgl2',
      handle: framebuffer,
      texture,
      depth,
      width,
      height,
    };
  }

	  #createWebGPUTarget(device, width, height, options) {
	    const format = options.format ?? device.format ?? 'rgba8unorm';
	    const usage =
	      GPUTextureUsage.RENDER_ATTACHMENT
	      | GPUTextureUsage.TEXTURE_BINDING
	      | GPUTextureUsage.COPY_SRC
	      | GPUTextureUsage.COPY_DST;
	    const texture = device.device.createTexture({
	      size: { width, height },
	      format,
	      usage,
      sampleCount: options.samples ?? 1,
    });
    const depthTexture = options.depth
      ? device.device.createTexture({
          size: { width, height, depthOrArrayLayers: 1 },
          format: device.depthFormat ?? 'depth24plus',
          usage: GPUTextureUsage.RENDER_ATTACHMENT,
          sampleCount: options.samples ?? 1,
        })
      : null;
    return {
      type: 'webgpu',
      texture,
      depthTexture,
      width,
      height,
    };
  }
}
