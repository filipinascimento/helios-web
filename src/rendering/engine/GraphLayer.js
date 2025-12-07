import { Layer } from './Layer.js';

export { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './GraphLayerCommon.js';

export class GraphLayer extends Layer {
  constructor(options = {}) {
    super('graph-layer');
    this.cpuArrays = {};
    this.edgeRenderingMode = options.edgeRendering === 'line' ? 'line' : 'quad';
    this.nodeOpacityBase = 0;
    this.nodeOpacityScale = 1;
    this.nodeSizeBase = 0;
    this.nodeSizeScale = 1;
    this.nodeOutlineWidthBase = 0;
    this.nodeOutlineWidthScale = 0;
    this.nodeOutlineColor = options.nodeOutlineColor ?? [0, 0, 0, 1];
    this.edgeOpacityBase = 0;
    this.edgeOpacityScale = 1;
    this.edgeWidthBase = 0;
    this.edgeWidthScale = 1;
    this.edgeEndpointTrim = 1;
    this.fallbackCameraUniforms = null;
  }

  setEdgeRenderingMode(mode) {
    if (mode === 'line' || mode === 'quad') {
      this.edgeRenderingMode = mode;
    }
  }

  getCameraUniforms(camera) {
    if (camera?.getUniforms) {
      const uniforms = camera.getUniforms();
      if (!this.ensureFinite(uniforms?.viewProjection) || !this.ensureFinite(uniforms?.view)) {
        console.warn('GraphLayer: camera matrices invalid, falling back to identity.', {
          view: uniforms?.view,
          projection: uniforms?.projection,
          viewProjection: uniforms?.viewProjection,
        });
        return this.getFallbackCameraUniforms();
      }
      return uniforms;
    }
    return this.getFallbackCameraUniforms();
  }

  ensureFinite(array) {
    if (!array) return false;
    for (let i = 0; i < array.length; i += 1) {
      if (!Number.isFinite(array[i])) return false;
    }
    return true;
  }

  getFallbackCameraUniforms() {
    if (!this.fallbackCameraUniforms) {
      const identity = new Float32Array(16);
      identity[0] = 1;
      identity[5] = 1;
      identity[10] = 1;
      identity[15] = 1;
      this.fallbackCameraUniforms = {
        view: identity,
        projection: identity,
        viewProjection: identity,
        position: new Float32Array([0, 0, 1]),
        right: new Float32Array([1, 0, 0]),
        up: new Float32Array([0, 1, 0]),
        mode: '2d',
        projectionType: 'orthographic',
        viewport: { width: 1, height: 1, devicePixelRatio: 1 },
      };
    }
    return this.fallbackCameraUniforms;
  }
}
