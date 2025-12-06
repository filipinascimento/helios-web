export const NODE_WGSL = /* wgsl */ `
struct Camera {
  viewProjection: mat4x4<f32>,
  view: mat4x4<f32>,
  position: vec4<f32>,
  up: vec4<f32>,
  right: vec4<f32>,
  // viewport.xy = width/height in pixels, viewport.zw = 1/width,1/height
  viewport: vec4<f32>,
};

struct Globals {
  nodeOpacity: vec2<f32>, // base, scale
  nodeSize: vec2<f32>, // base, scale
  nodeOutline: vec2<f32>, // base, scale (applied to node size attribute)
  edgeOpacity: vec2<f32>, // base, scale
  edgeWidth: vec2<f32>, // base, scale
  nodeOutlineColor: vec4<f32>,
  edgeTrim: f32,
  _pad: vec3<f32>,
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
@group(0) @binding(5) var<uniform> globals : Globals;

struct VertexInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
  @location(1) local : vec2<f32>,
  @location(2) outlineColor : vec4<f32>,
  @location(3) outlineThreshold : f32,
};

@vertex
fn nodeVertex(input : VertexInput) -> VertexOutput {
  let index = nodeIndices.data[input.instance];
  let basePosition = nodePositions.data[index].xyz;
  let rawSize = nodeSizes.data[index];
  let diameter = max(1.0, globals.nodeSize.x + globals.nodeSize.y * rawSize);
  let outlineWidth = max(0.0, globals.nodeOutline.x + globals.nodeOutline.y * rawSize);
  let fullDiameter = diameter + outlineWidth;
  let radius = fullDiameter * 0.5;
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
  let baseColor = nodeColors.data[index];
  let alpha = clamp(globals.nodeOpacity.x + globals.nodeOpacity.y * baseColor.a, 0.0, 1.0);
  output.color = vec4<f32>(baseColor.rgb, alpha);
  output.local = input.corner;
  let outlineAlpha = clamp(globals.nodeOpacity.x + globals.nodeOpacity.y * globals.nodeOutlineColor.a, 0.0, 1.0);
  output.outlineColor = vec4<f32>(globals.nodeOutlineColor.rgb, outlineAlpha);
  output.outlineThreshold = select(0.0, outlineWidth / max(fullDiameter, 1e-5), outlineWidth > 0.0);
  return output;
}

@fragment
fn nodeFragment(input : VertexOutput) -> @location(0) vec4<f32> {
  let dist = length(input.local);
  if (dist > 1.0) {
    discard;
  }
  if (input.outlineThreshold > 0.0 && dist > (1.0 - input.outlineThreshold)) {
    return input.outlineColor;
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
  // viewport.xy = width/height in pixels, viewport.zw = 1/width,1/height
  viewport: vec4<f32>,
};

struct Globals {
  nodeOpacity: vec2<f32>, // base, scale
  nodeSize: vec2<f32>, // base, scale
  nodeOutline: vec2<f32>, // base, scale (applied to node size attribute)
  edgeOpacity: vec2<f32>, // base, scale
  edgeWidth: vec2<f32>, // base, scale
  nodeOutlineColor: vec4<f32>,
  edgeTrim: f32,
  _pad: vec3<f32>,
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

struct EdgeWidths {
  data: array<f32>,
};

struct EdgeEndpointSizes {
  data: array<vec2<f32>>,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<storage, read> edgeIndices : EdgeIndices;
@group(0) @binding(2) var<storage, read> edgeSegments : EdgeSegments;
@group(0) @binding(3) var<storage, read> edgeColors : EdgeColors;
@group(0) @binding(4) var<storage, read> edgeWidths : EdgeWidths;
@group(0) @binding(5) var<storage, read> edgeEndpointSizes : EdgeEndpointSizes;
@group(0) @binding(6) var<uniform> globals : Globals;

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
};

@vertex
fn edgeVertex(@builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  let edgeSlot = vertexIndex / 2u;
  let edgeId = edgeIndices.data[edgeSlot];
  let segment = edgeSegments.data[edgeId];
  let endpointSize = edgeEndpointSizes.data[edgeId];
  let width = globals.edgeWidth.x + globals.edgeWidth.y * edgeWidths.data[edgeId];
  let dirRaw = segment.end.xyz - segment.start.xyz;
  let dirLen = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLen);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.x, 0.0) * 0.5;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.y, 0.0) * 0.5;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  let startPos = segment.start.xyz + dir * trimStart;
  let endPos = segment.end.xyz - dir * trimEnd;
  var position = startPos;
  if ((vertexIndex & 1u) == 1u) {
    position = endPos;
  }
  let baseColor = edgeColors.data[edgeId];
  let alpha = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * baseColor.a + width * 0.0, 0.0, 1.0);
  var output : EdgeVertexOutput;
  output.position = camera.viewProjection * vec4<f32>(position, 1.0);
  output.color = vec4<f32>(baseColor.rgb, alpha);
  return output;
}

struct EdgeQuadInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

@vertex
fn edgeQuadVertex(input : EdgeQuadInput) -> EdgeVertexOutput {
  let edgeId = edgeIndices.data[input.instance];
  let segment = edgeSegments.data[edgeId];
  let endpointSize = edgeEndpointSizes.data[edgeId];
  let width = max(globals.edgeWidth.x + globals.edgeWidth.y * edgeWidths.data[edgeId], 1e-3);
  let dirRaw = segment.end.xyz - segment.start.xyz;
  let dirLenWorld = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLenWorld);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.x, 0.0) * 0.5;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.y, 0.0) * 0.5;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  let startPos = segment.start.xyz + dir * trimStart;
  let endPos = segment.end.xyz - dir * trimEnd;

  let clipStart = camera.viewProjection * vec4<f32>(startPos, 1.0);
  let clipEnd = camera.viewProjection * vec4<f32>(endPos, 1.0);
  let ndcStart = clipStart.xy / clipStart.w;
  let ndcEnd = clipEnd.xy / clipEnd.w;
  var ndcDir = ndcEnd - ndcStart;
  let lenDir = max(length(ndcDir), 1e-5);
  ndcDir = ndcDir / vec2<f32>(lenDir);
  let perp = vec2<f32>(-ndcDir.y, ndcDir.x);
  let halfWidth = max(width, 1.0) * 0.5;
  let pixelToNdc = vec2<f32>(2.0 / max(camera.viewport.x, 1.0), 2.0 / max(camera.viewport.y, 1.0));
  let offsetNdc = perp * halfWidth * pixelToNdc;
  let t = clamp(input.corner.x, 0.0, 1.0);
  var clipPos = clipStart + (clipEnd - clipStart) * t;
  let adjusted = clipPos.xy + offsetNdc * input.corner.y * 1.5;
  clipPos = vec4<f32>(adjusted.x, adjusted.y, clipPos.z, clipPos.w);
  var output : EdgeVertexOutput;
  output.position = clipPos;
  let baseColor = edgeColors.data[edgeId];
  let alpha = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * baseColor.a, 0.0, 1.0);
  output.color = vec4<f32>(baseColor.rgb, alpha);
  return output;
}

@fragment
fn edgeFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color.rgb, input.color.a);
}`;
