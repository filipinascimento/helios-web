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
}
