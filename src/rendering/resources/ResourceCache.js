import { WebGLResourceCache } from './WebGLResourceCache.js';
import { WebGPUResourceCache } from './WebGPUResourceCache.js';

export class ResourceCache {
  constructor(type) {
    this.type = type;
    this.webgl = type === 'webgl2' ? new WebGLResourceCache() : null;
    this.webgpu = type === 'webgpu' ? new WebGPUResourceCache() : null;
  }

  destroy(deviceOrGl) {
    if (this.webgl) {
      const gl = deviceOrGl?.gl ?? deviceOrGl;
      this.webgl.destroy(gl);
    }
    if (this.webgpu) {
      this.webgpu.destroy();
    }
  }
}
