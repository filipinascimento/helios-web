import { VisualAttributeMapper } from './VisualAttributeMapper.js';
import { GeometryBuilder } from './geometry/GeometryBuilder.js';
import { EdgeExpansionStage } from './stages/EdgeExpansionStage.js';
import { EDGE_GEOMETRY_ATTRIBUTE, NODE_POSITION_ATTRIBUTE } from './constants.js';

/**
 * High-level orchestrator responsible for mapping Helios network attributes to
 * drawable geometry buffers.
 */
export class Pipeline {
  constructor(network) {
    this.network = network;
    this.mapper = new VisualAttributeMapper(network);
    this.geometryBuilder = new GeometryBuilder(network, this.mapper);
    this.stages = [new EdgeExpansionStage()];

    // Initialize visuals for existing graph content.
    this.mapper.applyNodeDefaults();
    this.mapper.applyEdgeDefaults();
  }

  get visuals() {
    return this.mapper;
  }

  markPositionsDirty() {
    this.geometryBuilder.markNodePositionsDirty();
    if (typeof this.network?.markDenseNodeAttributeDirty === 'function') {
      try {
        this.network.markDenseNodeAttributeDirty(NODE_POSITION_ATTRIBUTE);
      } catch (_) {
        // Ignore if dense buffers are unavailable.
      }
    }
    if (typeof this.network?.markDenseEdgeAttributeDirty === 'function') {
      try {
        this.network.markDenseEdgeAttributeDirty(EDGE_GEOMETRY_ATTRIBUTE);
      } catch (_) {
        // Ignore if dense buffers are unavailable.
      }
    }
  }

  /**
   * Runs the geometry builder and any additional processing stages before
   * returning a frame payload for the renderer.
   * @param {boolean} [force]
   */
  buildFrame(force = false) {
    let geometry = this.geometryBuilder.build(force);
    for (const stage of this.stages) {
      geometry = stage.process(geometry);
    }
    return {
      geometry,
      timestamp: performance.now(),
    };
  }
}
