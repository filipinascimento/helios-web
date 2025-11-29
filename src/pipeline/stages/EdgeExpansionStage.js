/**
 * Placeholder stage that will eventually expand edges into multiple segments or
 * curved splines. For now it simply forwards the geometry buffers untouched.
 */
export class EdgeExpansionStage {
  constructor() {
    this.name = 'edge-expansion';
  }

  /**
   * @param {import('../geometry/GeometryBuilder.js').GeometryBuffers} buffers
   * @returns {import('../geometry/GeometryBuilder.js').GeometryBuffers}
   */
  process(buffers) {
    return buffers;
  }
}
