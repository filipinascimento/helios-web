export interface NodeGeometry {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  indices: Uint32Array;
  count: number;
}

export interface EdgeGeometry {
  segments: Float32Array;
  colors: Float32Array;
  widths: Float32Array;
  endpointSizes: Float32Array;
  indices: Uint32Array;
  count: number;
}

export interface GeometryBuffers {
  nodes: NodeGeometry;
  edges: EdgeGeometry;
}

export interface PipelineFrame {
  geometry: GeometryBuffers;
  timestamp: number;
}
