import { LayeredRenderer } from './engine/LayeredRenderer.js';

export async function createRenderer(canvas, options = {}) {
  const renderer = new LayeredRenderer(canvas, options);
  await renderer.initialize();
  return renderer;
}
