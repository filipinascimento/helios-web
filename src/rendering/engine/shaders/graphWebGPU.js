export const NODE_WGSL = /* wgsl */ `
struct Camera {
  viewProjection: mat4x4<f32>,
  view: mat4x4<f32>,
  position: vec4<f32>,
  up: vec4<f32>,
  right: vec4<f32>,
};

struct NodeIndices {
  data: array<u32>,
};

struct NodePositions {
  data: array<vec4<f32>>,
};

struct NodeSizes {
  data: array<f32>,
};

struct NodeColors {
  data: array<vec4<f32>>,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<storage, read> nodeIndices : NodeIndices;
@group(0) @binding(2) var<storage, read> nodePositions : NodePositions;
@group(0) @binding(3) var<storage, read> nodeSizes : NodeSizes;
@group(0) @binding(4) var<storage, read> nodeColors : NodeColors;

struct VertexInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
  @location(1) local : vec2<f32>,
};

@vertex
fn nodeVertex(input : VertexInput) -> VertexOutput {
  let index = nodeIndices.data[input.instance];
  let basePosition = nodePositions.data[index].xyz;
  let diameter = max(1.0, nodeSizes.data[index]);
  let radius = diameter * 0.5;
  let is2D = camera.position.w > 0.5;
  var right = camera.right.xyz;
  var up = camera.up.xyz;
  if (is2D) {
    right = normalize(right);
    up = normalize(up);
  } else {
    var viewDir = camera.position.xyz - basePosition;
    let viewLen = length(viewDir);
    if (viewLen > 1e-5) {
      viewDir = viewDir / vec3<f32>(viewLen);
    } else {
      viewDir = vec3<f32>(0.0, 0.0, 1.0);
    }
    right = camera.right.xyz - viewDir * dot(camera.right.xyz, viewDir);
    let rightLen = length(right);
    if (rightLen > 1e-5) {
      right = right / vec3<f32>(rightLen);
    } else {
      right = normalize(cross(camera.up.xyz, viewDir));
    }
    up = normalize(cross(viewDir, right));
  }
  let offset = right * input.corner.x + up * input.corner.y;
  var output : VertexOutput;
  output.position = camera.viewProjection * vec4<f32>(basePosition + offset * radius, 1.0);
  output.color = nodeColors.data[index];
  output.local = input.corner;
  return output;
}

@fragment
fn nodeFragment(input : VertexOutput) -> @location(0) vec4<f32> {
  let dist = length(input.local);
  if (dist > 1.0) {
    discard;
  }
  return input.color;
}`;

export const EDGE_WGSL = /* wgsl */ `
struct Camera {
  viewProjection: mat4x4<f32>,
  view: mat4x4<f32>,
  position: vec4<f32>,
  up: vec4<f32>,
  right: vec4<f32>,
};

struct EdgeSegment {
  start: vec4<f32>,
  end: vec4<f32>,
};

struct EdgeSegments {
  data: array<EdgeSegment>,
};

struct EdgeColors {
  data: array<vec4<f32>>,
};

struct EdgeIndices {
  data: array<u32>,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<storage, read> edgeIndices : EdgeIndices;
@group(0) @binding(2) var<storage, read> edgeSegments : EdgeSegments;
@group(0) @binding(3) var<storage, read> edgeColors : EdgeColors;

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
};

@vertex
fn edgeVertex(@builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  let edgeSlot = vertexIndex / 2u;
  let edgeId = edgeIndices.data[edgeSlot];
  let segment = edgeSegments.data[edgeId];
  var position = segment.start.xyz;
  if ((vertexIndex & 1u) == 1u) {
    position = segment.end.xyz;
  }
  var output : EdgeVertexOutput;
  output.position = camera.viewProjection * vec4<f32>(position, 1.0);
  output.color = edgeColors.data[edgeId];
  return output;
}

@fragment
fn edgeFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color.rgb, input.color.a);
}`;
