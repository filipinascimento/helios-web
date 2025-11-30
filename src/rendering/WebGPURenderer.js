import { LayeredRenderer } from './engine/LayeredRenderer.js';

/**
 * Explicit WebGPU renderer. Will throw if WebGPU is unavailable so callers can
 * decide how to fallback.
 */
export class WebGPURenderer extends LayeredRenderer {
  constructor(canvas, options = {}) {
    super(canvas, { ...options, forceWebGPU: true });
  }
}

export default WebGPURenderer;
