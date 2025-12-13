export const NODE_ATTRIBUTE_WGSL = /* wgsl */ `
struct Camera {
  viewProjection: mat4x4<f32>,
  view: mat4x4<f32>,
  position: vec4<f32>,
  up: vec4<f32>,
  right: vec4<f32>,
  viewport: vec4<f32>,
};

struct Globals {
  nodeOpacity: vec2<f32>,
  nodeSize: vec2<f32>,
  nodeOutline: vec2<f32>,
  edgeOpacity: vec2<f32>,
  edgeWidth: vec2<f32>,
  nodeOutlineColor: vec4<f32>,
  edgeTrim: f32,
  _pad: vec3<f32>,
};

struct VertexInput {
  @location(0) corner : vec2<f32>,
  @location(1) position : vec3<f32>,
  @location(2) size : f32,
  @location(3) encoded : vec4<u32>,
};

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) centerWorld : vec3<f32>,
  @location(2) rightWorld : vec3<f32>,
  @location(3) upWorld : vec3<f32>,
  @location(4) viewDir : vec3<f32>,
  @location(5) radius : f32,
  @location(6) @interpolate(flat) encoded : vec4<u32>,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> globals : Globals;

@vertex
fn nodeVertex(input : VertexInput) -> VertexOutput {
  let baseSize = globals.nodeSize.x + globals.nodeSize.y * input.size;
  let outlineWidth = max(0.0, globals.nodeOutline.x + globals.nodeOutline.y * input.size);
  let fullSize = baseSize + outlineWidth;
  let radius = max(1.0, fullSize) * 0.5;
  var right = camera.right.xyz;
  var up = camera.up.xyz;
  var viewDir = vec3<f32>(0.0, 0.0, 1.0);
  let is2D = camera.position.w > 0.5;
  if (is2D) {
    right = normalize(right);
    up = normalize(up);
  } else {
    viewDir = camera.position.xyz - input.position;
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
  output.position = camera.viewProjection * vec4<f32>(input.position + offset * radius, 1.0);
  output.local = input.corner;
  output.centerWorld = input.position;
  output.rightWorld = right;
  output.upWorld = up;
  output.viewDir = viewDir;
  output.radius = radius;
  output.encoded = input.encoded;
  return output;
}

struct FragmentOutput {
  @location(0) color : vec4<f32>,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn nodeFragment(input : VertexOutput) -> FragmentOutput {
  var output : FragmentOutput;
  let dist = length(input.local);
  if (dist > 1.0) {
    discard;
  }
  let is2D = camera.position.w > 0.5;
  if (!is2D) {
    let radius = input.radius;
    let xyLenSq = dot(input.local * radius, input.local * radius);
    let zOffset = sqrt(max(radius * radius - xyLenSq, 0.0));
    let worldPos = input.centerWorld
      + (input.rightWorld * input.local.x + input.upWorld * input.local.y) * radius
      + normalize(input.viewDir) * zOffset;
    let clip = camera.viewProjection * vec4<f32>(worldPos, 1.0);
    let depth = clip.z / clip.w;
    output.depth = depth * 0.5 + 0.5;
  } else {
    output.depth = input.position.z / input.position.w;
  }
  output.color = vec4<f32>(vec4<f32>(input.encoded) / vec4<f32>(255.0));
  return output;
}`;

export const EDGE_ATTRIBUTE_WGSL = /* wgsl */ `
struct Camera {
  viewProjection: mat4x4<f32>,
  view: mat4x4<f32>,
  position: vec4<f32>,
  up: vec4<f32>,
  right: vec4<f32>,
  viewport: vec4<f32>,
};

struct Globals {
  nodeOpacity: vec2<f32>,
  nodeSize: vec2<f32>,
  nodeOutline: vec2<f32>,
  edgeOpacity: vec2<f32>,
  edgeWidth: vec2<f32>,
  nodeOutlineColor: vec4<f32>,
  edgeTrim: f32,
  _pad: vec3<f32>,
};

struct EdgeVertexInput {
  @location(0) start : vec3<f32>,
  @location(1) end : vec3<f32>,
  @location(2) width : vec2<f32>,
  @location(3) endpointSize : vec2<f32>,
  @location(4) encoded : vec4<u32>,
};

struct EdgeQuadVertexInput {
  @location(0) corner : vec2<f32>,
  @location(1) start : vec3<f32>,
  @location(2) end : vec3<f32>,
  @location(3) width : vec2<f32>,
  @location(4) endpointSize : vec2<f32>,
  @location(5) encoded : vec4<u32>,
};

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) @interpolate(flat) encoded : vec4<u32>,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> globals : Globals;

@vertex
fn edgeVertex(input : EdgeVertexInput, @builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  var output : EdgeVertexOutput;
  let dir = input.end - input.start;
  let dirLen = max(length(dir), 1e-5);
  let dirN = dir / vec3<f32>(dirLen);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * input.endpointSize.x, 0.0) * 0.5;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * input.endpointSize.y, 0.0) * 0.5;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  let startPos = input.start + dirN * trimStart;
  let endPos = input.end - dirN * trimEnd;
  let isEnd = (vertexIndex & 1u) == 1u;
  let pos = select(startPos, endPos, isEnd);
  output.position = camera.viewProjection * vec4<f32>(pos, 1.0);
  output.encoded = input.encoded;
  return output;
}

@vertex
fn edgeQuadVertex(input : EdgeQuadVertexInput) -> EdgeVertexOutput {
  var output : EdgeVertexOutput;
  let dir = input.end - input.start;
  let dirLenWorld = max(length(dir), 1e-5);
  let dirN = dir / vec3<f32>(dirLenWorld);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * input.endpointSize.x, 0.0) * 0.5;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * input.endpointSize.y, 0.0) * 0.5;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  let startPos = input.start + dirN * trimStart;
  let endPos = input.end - dirN * trimEnd;
  let segmentMix = clamp(input.corner.x, 0.0, 1.0);
  let width = max(globals.edgeWidth.x + globals.edgeWidth.y * mix(input.width.x, input.width.y, segmentMix), 0.0);
  let clipStart = camera.viewProjection * vec4<f32>(startPos, 1.0);
  let clipEnd = camera.viewProjection * vec4<f32>(endPos, 1.0);
  let ndcStart = clipStart.xy / clipStart.w;
  let ndcEnd = clipEnd.xy / clipEnd.w;
  let ndcDir = ndcEnd - ndcStart;
  let dirLen = max(length(ndcDir), 1e-5);
  let perp = vec2<f32>(-ndcDir.y, ndcDir.x) / dirLen;
  let halfWidth = max(width, 1.0) * 0.5;
  let pixelToNdc = vec2<f32>(2.0 / max(camera.viewport.x, 1.0), 2.0 / max(camera.viewport.y, 1.0));
  let offsetNdc = perp * halfWidth * pixelToNdc;
  var clipPos = mix(clipStart, clipEnd, segmentMix);
  let offsetXY = offsetNdc * input.corner.y * 1.5;
  clipPos = vec4<f32>(clipPos.xy + offsetXY, clipPos.z, clipPos.w);
  output.position = clipPos;
  output.encoded = input.encoded;
  return output;
}

@fragment
fn edgeFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(vec4<f32>(input.encoded) / vec4<f32>(255.0));
}`;
