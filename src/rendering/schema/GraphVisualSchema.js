import {
  NODE_POSITION_ATTRIBUTE,
  NODE_COLOR_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_ENDPOINTS_STATE_ATTRIBUTE,
} from '../../pipeline/constants.js';

function getMode(entry) {
  return entry && typeof entry === 'object' ? entry.mode : null;
}

function isUniform(entry) {
  return getMode(entry) === 'uniform';
}

export class GraphVisualSchema {
  constructor(options = {}) {
    this.nodeOutlineUseAttributes = options.nodeOutlineUseAttributes === true;
  }

  static fromNetwork(network, options = {}) {
    const schema = new GraphVisualSchema(options);
    schema.visualConfig = (network && network.__heliosVisualConfig && typeof network.__heliosVisualConfig === 'object')
      ? network.__heliosVisualConfig
      : null;
    return schema;
  }

  getNodeVariant() {
    const nodeCfg = this.visualConfig?.node ?? null;
    if (nodeCfg) {
      return {
        colorBuffer: nodeCfg?.color?.mode !== 'uniform',
        sizeBuffer: nodeCfg?.size?.mode !== 'uniform',
        outlineWidthBuffer: nodeCfg?.outline?.mode !== 'uniform',
        outlineColorBuffer: nodeCfg?.outlineColor?.mode !== 'uniform',
      };
    }

    // If no visual config exists, preserve prior behavior: outline can be gated
    // by the global toggle.
    return {
      colorBuffer: true,
      sizeBuffer: true,
      outlineWidthBuffer: this.nodeOutlineUseAttributes === true,
      outlineColorBuffer: this.nodeOutlineUseAttributes === true,
    };
  }

  getEdgeVariant() {
    const edgeCfg = this.visualConfig?.edge ?? null;
    return {
      colorBuffer: !isUniform(edgeCfg?.color),
      widthBuffer: !isUniform(edgeCfg?.width),
      opacityBuffer: !isUniform(edgeCfg?.opacity),
      endpointSizeBuffer: !isUniform(edgeCfg?.endpointSize),
    };
  }

  getDenseRequests() {
    const nodeVariant = this.getNodeVariant();
    const edgeVariant = this.getEdgeVariant();
    const requests = [];

    // Nodes: positions + states are always needed for layout/state coloring.
    requests.push(['node', NODE_POSITION_ATTRIBUTE]);
    requests.push(['node', NODE_STATE_ATTRIBUTE]);
    if (nodeVariant.sizeBuffer) requests.push(['node', NODE_SIZE_ATTRIBUTE]);
    if (nodeVariant.colorBuffer) requests.push(['node', NODE_COLOR_ATTRIBUTE]);
    if (nodeVariant.outlineWidthBuffer) requests.push(['node', NODE_OUTLINE_WIDTH_ATTRIBUTE]);
    if (nodeVariant.outlineColorBuffer) requests.push(['node', NODE_OUTLINE_COLOR_ATTRIBUTE]);

    // Edges: geometry + states always needed.
    requests.push(['edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE]);
    requests.push(['edge', EDGE_ENDPOINTS_STATE_ATTRIBUTE]);
    requests.push(['edge', EDGE_STATE_ATTRIBUTE]);

    if (edgeVariant.colorBuffer) requests.push(['edge', EDGE_COLOR_ATTRIBUTE]);
    if (edgeVariant.opacityBuffer) requests.push(['edge', EDGE_OPACITY_ATTRIBUTE]);
    if (edgeVariant.widthBuffer) requests.push(['edge', EDGE_WIDTH_ATTRIBUTE]);
    if (edgeVariant.endpointSizeBuffer) requests.push(['edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE]);

    return { requests, nodeVariant, edgeVariant };
  }
}
