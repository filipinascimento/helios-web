export const NODE_POSITION_ATTRIBUTE = '_helios_visuals_position';
export const NODE_COLOR_ATTRIBUTE = '_helios_visuals_color';
export const NODE_SIZE_ATTRIBUTE = '_helios_visuals_size';
export const NODE_OUTLINE_WIDTH_ATTRIBUTE = '_helios_visuals_outline_width';
export const NODE_OUTLINE_COLOR_ATTRIBUTE = '_helios_visuals_outline_color';
export const EDGE_COLOR_ATTRIBUTE = '_helios_visuals_edge_color';
export const EDGE_WIDTH_ATTRIBUTE = '_helios_visuals_edge_width';
export const EDGE_ENDPOINTS_POSITION_ATTRIBUTE = '_helios_visuals_edge_endpoints_position';
export const EDGE_ENDPOINTS_SIZE_ATTRIBUTE = '_helios_visuals_edge_endpoints_size';

export const DEFAULT_NODE_COLOR = [0.9, 0.2, 1, 1];
export const DEFAULT_EDGE_COLOR = [0.4, 0.4, 0.9, 0.5];
export const DEFAULT_NODE_SIZE = 8;
export const DEFAULT_EDGE_WIDTH = 1;
export const DEFAULT_NODE_OUTLINE_WIDTH = 0.1;
export const DEFAULT_NODE_OUTLINE_COLOR = [0, 0, 0, 1];

export const VISUAL_ATTRIBUTE_MAP = {
  color: NODE_COLOR_ATTRIBUTE,
  size: NODE_SIZE_ATTRIBUTE,
  outline: NODE_OUTLINE_WIDTH_ATTRIBUTE,
  outlineColor: NODE_OUTLINE_COLOR_ATTRIBUTE,
  position: NODE_POSITION_ATTRIBUTE,
  edgeColor: EDGE_COLOR_ATTRIBUTE,
  edgeWidth: EDGE_WIDTH_ATTRIBUTE,
  edgeEndpointPosition: EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  edgeEndpointSize: EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
};
