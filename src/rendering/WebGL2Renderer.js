import { LayeredRenderer } from './engine/LayeredRenderer.js';

/**
 * WebGL-focused renderer that still benefits from the modular render layers and
 * framebuffer utilities exposed by the LayeredRenderer.
 */
export class WebGL2Renderer extends LayeredRenderer {
  constructor(canvas, options = {}) {
    super(canvas, { ...options, forceWebGL: true });
  }
}

export default WebGL2Renderer;
