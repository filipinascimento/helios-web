export interface NodeGeometry {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
  indices: Uint32Array;
}

export interface EdgeGeometry {
  colors: Float32Array;
  widths: Float32Array;
  segments: Float32Array;
  count: number;
  indices: Uint32Array;
}

export interface GeometryBuffers {
  nodes: NodeGeometry;
  edges: EdgeGeometry;
}

export interface PipelineStage {
  readonly name: string;
  process(buffers: GeometryBuffers): GeometryBuffers;
}

export interface PipelineFrame {
  geometry: GeometryBuffers;
  timestamp: number;
}
