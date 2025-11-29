import { WebGPURenderer } from './WebGPURenderer.js';
import { WebGL2Renderer } from './WebGL2Renderer.js';

export async function createRenderer(canvas, options = {}) {
  if (!options.forceWebGL && (await WebGPURenderer.isSupported())) {
    try {
      const renderer = new WebGPURenderer(canvas, options);
      await renderer.initialize();
      return renderer;
    } catch (error) {
      console.warn('WebGPU initialization failed, falling back to WebGL2', error);
    }
  }

  const webglRenderer = new WebGL2Renderer(canvas, options);
  await webglRenderer.initialize();
  return webglRenderer;
}
