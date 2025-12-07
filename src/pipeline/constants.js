export const NODE_POSITION_ATTRIBUTE = '_helios_visuals_position';
export const NODE_COLOR_ATTRIBUTE = '_helios_visuals_color';
export const NODE_SIZE_ATTRIBUTE = '_helios_visuals_size';
export const NODE_OUTLINE_WIDTH_ATTRIBUTE = '_helios_visuals_outline_width';
export const NODE_OUTLINE_COLOR_ATTRIBUTE = '_helios_visuals_outline_color';
export const EDGE_COLOR_ATTRIBUTE = '_helios_visuals_edge_color';
export const EDGE_WIDTH_ATTRIBUTE = '_helios_visuals_edge_width';
export const EDGE_OPACITY_ATTRIBUTE = '_helios_visuals_edge_opacity';
export const EDGE_ENDPOINTS_POSITION_ATTRIBUTE = '_helios_visuals_edge_endpoints_position';
export const EDGE_ENDPOINTS_SIZE_ATTRIBUTE = '_helios_visuals_edge_endpoints_size';

// Aggregate export so callers can grab all visual attribute names from a single import.
export const VISUAL_ATTRIBUTE_NAMES = {
  NODE_POSITION_ATTRIBUTE,
  NODE_COLOR_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
};

export const DEFAULT_NODE_COLOR = [0.9, 0.2, 1, 1];
export const DEFAULT_EDGE_COLOR = [0.4, 0.4, 0.9, 0.5];
export const DEFAULT_EDGE_OPACITY = 0.5;
export const DEFAULT_NODE_SIZE = 8;
export const DEFAULT_EDGE_WIDTH = 1;
export const DEFAULT_NODE_OUTLINE_WIDTH = 0.1;
export const DEFAULT_NODE_OUTLINE_COLOR = [0, 0, 0, 1];

// Aggregate defaults for convenience imports.
export const DEFAULT_VISUALS = {
  DEFAULT_NODE_COLOR,
  DEFAULT_EDGE_COLOR,
  DEFAULT_EDGE_OPACITY,
  DEFAULT_NODE_SIZE,
  DEFAULT_EDGE_WIDTH,
  DEFAULT_NODE_OUTLINE_WIDTH,
  DEFAULT_NODE_OUTLINE_COLOR,
};

export const VISUAL_ATTRIBUTE_MAP = {
  color: NODE_COLOR_ATTRIBUTE,
  size: NODE_SIZE_ATTRIBUTE,
  outline: NODE_OUTLINE_WIDTH_ATTRIBUTE,
  outlineColor: NODE_OUTLINE_COLOR_ATTRIBUTE,
  position: NODE_POSITION_ATTRIBUTE,
  edgeColor: EDGE_COLOR_ATTRIBUTE,
  edgeWidth: EDGE_WIDTH_ATTRIBUTE,
  edgeOpacity: EDGE_OPACITY_ATTRIBUTE,
  edgeEndpointPosition: EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  edgeEndpointSize: EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
};
