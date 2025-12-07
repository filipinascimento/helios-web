import { VisualAttributeMapper } from './VisualAttributeMapper.js';
import {
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
} from './constants.js';

/**
 * High-level orchestrator responsible for mapping Helios network attributes to
 * drawable geometry buffers.
 */
export class Pipeline {
  constructor(network) {
    this.network = network;
    this.mapper = new VisualAttributeMapper(network);
  }

  get visuals() {
    return this.mapper;
  }

  markPositionsDirty() {
    this.mapper.markNodeAttributesDirty(NODE_POSITION_ATTRIBUTE, NODE_SIZE_ATTRIBUTE);
    this.mapper.markEdgeAttributesDirty(EDGE_ENDPOINTS_POSITION_ATTRIBUTE, EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
  }

  /**
   * Builds dense geometry directly from helios-network dense buffers so
   * renderers never touch sparse attribute storage.
   */
  buildFrame() {
    const geometry = this.mapper.buildDenseGeometry();
    return {
      geometry,
      timestamp: performance.now(),
    };
  }
}
