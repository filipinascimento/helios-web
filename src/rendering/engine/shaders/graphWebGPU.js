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
  data: array<f32>, // packed xyz triplets
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
  @location(4) centerWorld : vec3<f32>,
  @location(5) rightWorld : vec3<f32>,
  @location(6) upWorld : vec3<f32>,
  @location(7) viewDir : vec3<f32>,
  @location(8) radius : f32,
};

@vertex
fn nodeVertex(input : VertexInput) -> VertexOutput {
  let index = nodeIndices.data[input.instance];
  let baseOffset = index * 3u;
  let basePosition = vec3<f32>(
    nodePositions.data[baseOffset + 0u],
    nodePositions.data[baseOffset + 1u],
    nodePositions.data[baseOffset + 2u]
  );
  let rawSize = nodeSizes.data[index];
  let diameter = max(1.0, globals.nodeSize.x + globals.nodeSize.y * rawSize);
  let outlineWidth = max(0.0, globals.nodeOutline.x + globals.nodeOutline.y * rawSize);
  let fullDiameter = diameter + outlineWidth;
  let radius = fullDiameter * 0.5;
  let is2D = camera.position.w > 0.5;
  var right = camera.right.xyz;
  var up = camera.up.xyz;
  var viewDir = vec3<f32>(0.0, 0.0, 1.0);
  if (is2D) {
    right = normalize(right);
    up = normalize(up);
  } else {
    viewDir = camera.position.xyz - basePosition;
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
  output.centerWorld = basePosition;
  output.rightWorld = right;
  output.upWorld = up;
  output.viewDir = viewDir;
  output.radius = radius;
  return output;
}

struct NodeFragmentOutput {
  @location(0) color : vec4<f32>,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn nodeFragment(input : VertexOutput) -> NodeFragmentOutput {
  var output : NodeFragmentOutput;
  let dist = length(input.local);
  if (dist > 1.0) {
    discard;
  }
  if (input.outlineThreshold > 0.0 && dist > (1.0 - input.outlineThreshold)) {
    output.color = input.outlineColor;
  } else {
    output.color = input.color;
  }
  // Depth as a sphere in 3D; retain default depth in 2D (where depth test is disabled).
  if (camera.position.w < 0.5) {
    let radius = input.radius;
    let xyLenSq = dot(input.local * radius, input.local * radius);
    let zOffset = sqrt(max(radius * radius - xyLenSq, 0.0));
    let worldPos = input.centerWorld
      + (input.rightWorld * input.local.x + input.upWorld * input.local.y) * radius
      + normalize(input.viewDir) * zOffset;
    let clip = camera.viewProjection * vec4<f32>(worldPos, 1.0);
    output.depth = clip.z / clip.w;
  } else {
    output.depth = input.position.z / input.position.w;
  }
  return output;
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

struct EdgeSegments {
  data: array<f32>, // packed start/end xyz
};

struct EdgeColors {
  data: array<vec4<f32>>,
};

struct EdgeIndices {
  data: array<u32>,
};

struct EdgeWidths {
  data: array<vec2<f32>>,
};

struct EdgeEndpointSizes {
  data: array<vec2<f32>>,
};

struct EdgeOpacities {
  data: array<vec2<f32>>,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<storage, read> edgeIndices : EdgeIndices;
@group(0) @binding(2) var<storage, read> edgeSegments : EdgeSegments;
@group(0) @binding(3) var<storage, read> edgeColors : EdgeColors;
@group(0) @binding(4) var<storage, read> edgeWidths : EdgeWidths;
@group(0) @binding(5) var<storage, read> edgeEndpointSizes : EdgeEndpointSizes;
@group(0) @binding(6) var<storage, read> edgeOpacities : EdgeOpacities;
@group(0) @binding(7) var<uniform> globals : Globals;

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
};

@vertex
fn edgeVertex(@builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  let edgeSlot = vertexIndex / 2u;
  let edgeId = edgeIndices.data[edgeSlot];
  let base = edgeId * 6u;
  var startPos = vec3<f32>(
    edgeSegments.data[base + 0u],
    edgeSegments.data[base + 1u],
    edgeSegments.data[base + 2u]
  );
  var endPos = vec3<f32>(
    edgeSegments.data[base + 3u],
    edgeSegments.data[base + 4u],
    edgeSegments.data[base + 5u]
  );
  let endpointSize = edgeEndpointSizes.data[edgeId];
  let dirRaw = endPos - startPos;
  let dirLen = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLen);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.x, 0.0) * 0.5;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.y, 0.0) * 0.5;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  startPos = startPos + dir * trimStart;
  endPos = endPos - dir * trimEnd;
  var position = startPos;
  if ((vertexIndex & 1u) == 1u) {
    position = endPos;
  }
  let colorStart = edgeColors.data[edgeId * 2u];
  let colorEnd = edgeColors.data[edgeId * 2u + 1u];
  let endpointWidth = edgeWidths.data[edgeId];
  let opacityPair = edgeOpacities.data[edgeId];
  let color = select(colorStart, colorEnd, (vertexIndex & 1u) == 1u);
  let width = globals.edgeWidth.x + globals.edgeWidth.y * select(endpointWidth.x, endpointWidth.y, (vertexIndex & 1u) == 1u);
  let attrOpacity = select(opacityPair.x, opacityPair.y, (vertexIndex & 1u) == 1u);
  let opacity = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * attrOpacity, 0.0, 1.0);
  let alpha = clamp(opacity * color.a, 0.0, 1.0);
  var output : EdgeVertexOutput;
  output.position = camera.viewProjection * vec4<f32>(position, 1.0);
  output.color = vec4<f32>(color.rgb, alpha);
  return output;
}

struct EdgeQuadInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

@vertex
fn edgeQuadVertex(input : EdgeQuadInput) -> EdgeVertexOutput {
  let edgeId = edgeIndices.data[input.instance];
  let base = edgeId * 6u;
  var startPos = vec3<f32>(
    edgeSegments.data[base + 0u],
    edgeSegments.data[base + 1u],
    edgeSegments.data[base + 2u]
  );
  var endPos = vec3<f32>(
    edgeSegments.data[base + 3u],
    edgeSegments.data[base + 4u],
    edgeSegments.data[base + 5u]
  );
  let endpointSize = edgeEndpointSizes.data[edgeId];
  let endpointWidth = edgeWidths.data[edgeId];
  let opacityPair = edgeOpacities.data[edgeId];
  let t = clamp(input.corner.x, 0.0, 1.0);
  let width = max(globals.edgeWidth.x + globals.edgeWidth.y * mix(endpointWidth.x, endpointWidth.y, t), 1e-3);
  let dirRaw = endPos - startPos;
  let dirLenWorld = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLenWorld);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.x, 0.0) * 0.5;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.y, 0.0) * 0.5;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  startPos = startPos + dir * trimStart;
  endPos = endPos - dir * trimEnd;

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
  var clipPos = clipStart + (clipEnd - clipStart) * t;
  let adjusted = clipPos.xy + offsetNdc * input.corner.y * 1.5;
  clipPos = vec4<f32>(adjusted.x, adjusted.y, clipPos.z, clipPos.w);
  var output : EdgeVertexOutput;
  output.position = clipPos;
  let colorStart = edgeColors.data[edgeId * 2u];
  let colorEnd = edgeColors.data[edgeId * 2u + 1u];
  let blended = mix(colorStart, colorEnd, t);
  let blendedOpacity = mix(opacityPair.x, opacityPair.y, t);
  let opacity = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * blendedOpacity, 0.0, 1.0);
  let alpha = clamp(opacity * blended.a, 0.0, 1.0);
  output.color = vec4<f32>(blended.rgb, alpha);
  return output;
}

@fragment
fn edgeFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color.rgb, input.color.a);
}`;

export const EDGE_WEIGHTED_WGSL = /* wgsl */ `
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

struct EdgeSegments {
  data: array<f32>, // packed start/end xyz
};

struct EdgeColors {
  data: array<vec4<f32>>,
};

struct EdgeIndices {
  data: array<u32>,
};

struct EdgeWidths {
  data: array<vec2<f32>>,
};

struct EdgeEndpointSizes {
  data: array<vec2<f32>>,
};

struct EdgeOpacities {
  data: array<vec2<f32>>,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<storage, read> edgeIndices : EdgeIndices;
@group(0) @binding(2) var<storage, read> edgeSegments : EdgeSegments;
@group(0) @binding(3) var<storage, read> edgeColors : EdgeColors;
@group(0) @binding(4) var<storage, read> edgeWidths : EdgeWidths;
@group(0) @binding(5) var<storage, read> edgeEndpointSizes : EdgeEndpointSizes;
@group(0) @binding(6) var<storage, read> edgeOpacities : EdgeOpacities;
@group(0) @binding(7) var<uniform> globals : Globals;

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
};

@vertex
fn edgeVertex(@builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  let edgeSlot = vertexIndex / 2u;
  let edgeId = edgeIndices.data[edgeSlot];
  let base = edgeId * 6u;
  var startPos = vec3<f32>(
    edgeSegments.data[base + 0u],
    edgeSegments.data[base + 1u],
    edgeSegments.data[base + 2u]
  );
  var endPos = vec3<f32>(
    edgeSegments.data[base + 3u],
    edgeSegments.data[base + 4u],
    edgeSegments.data[base + 5u]
  );
  let endpointSize = edgeEndpointSizes.data[edgeId];
  let dirRaw = endPos - startPos;
  let dirLen = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLen);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.x, 0.0) * 0.5;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.y, 0.0) * 0.5;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  startPos = startPos + dir * trimStart;
  endPos = endPos - dir * trimEnd;
  var position = startPos;
  if ((vertexIndex & 1u) == 1u) {
    position = endPos;
  }
  let colorStart = edgeColors.data[edgeId * 2u];
  let colorEnd = edgeColors.data[edgeId * 2u + 1u];
  let endpointWidth = edgeWidths.data[edgeId];
  let opacityPair = edgeOpacities.data[edgeId];
  let color = select(colorStart, colorEnd, (vertexIndex & 1u) == 1u);
  let width = globals.edgeWidth.x + globals.edgeWidth.y * select(endpointWidth.x, endpointWidth.y, (vertexIndex & 1u) == 1u);
  let attrOpacity = select(opacityPair.x, opacityPair.y, (vertexIndex & 1u) == 1u);
  let opacity = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * attrOpacity, 0.0, 1.0);
  let alpha = clamp(opacity * color.a, 0.0, 1.0);
  var output : EdgeVertexOutput;
  output.position = camera.viewProjection * vec4<f32>(position, 1.0);
  output.color = vec4<f32>(color.rgb, alpha);
  return output;
}

struct EdgeQuadInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

@vertex
fn edgeQuadVertex(input : EdgeQuadInput) -> EdgeVertexOutput {
  let edgeId = edgeIndices.data[input.instance];
  let base = edgeId * 6u;
  var startPos = vec3<f32>(
    edgeSegments.data[base + 0u],
    edgeSegments.data[base + 1u],
    edgeSegments.data[base + 2u]
  );
  var endPos = vec3<f32>(
    edgeSegments.data[base + 3u],
    edgeSegments.data[base + 4u],
    edgeSegments.data[base + 5u]
  );
  let endpointSize = edgeEndpointSizes.data[edgeId];
  let endpointWidth = edgeWidths.data[edgeId];
  let opacityPair = edgeOpacities.data[edgeId];
  let t = clamp(input.corner.x, 0.0, 1.0);
  let width = max(globals.edgeWidth.x + globals.edgeWidth.y * mix(endpointWidth.x, endpointWidth.y, t), 1e-3);
  let dirRaw = endPos - startPos;
  let dirLenWorld = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLenWorld);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.x, 0.0) * 0.5;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.y, 0.0) * 0.5;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  startPos = startPos + dir * trimStart;
  endPos = endPos - dir * trimEnd;

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
  var clipPos = clipStart + (clipEnd - clipStart) * t;
  let adjusted = clipPos.xy + offsetNdc * input.corner.y * 1.5;
  clipPos = vec4<f32>(adjusted.x, adjusted.y, clipPos.z, clipPos.w);
  var output : EdgeVertexOutput;
  output.position = clipPos;
  let colorStart = edgeColors.data[edgeId * 2u];
  let colorEnd = edgeColors.data[edgeId * 2u + 1u];
  let blended = mix(colorStart, colorEnd, t);
  let blendedOpacity = mix(opacityPair.x, opacityPair.y, t);
  let opacity = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * blendedOpacity, 0.0, 1.0);
  let alpha = clamp(opacity * blended.a, 0.0, 1.0);
  output.color = vec4<f32>(blended.rgb, alpha);
  return output;
}

struct EdgeWeightedOutput {
  @location(0) colorAccum : vec4<f32>,
  @location(1) weightAccum : vec4<f32>,
};

@fragment
fn edgeWeightedFragment(input : EdgeVertexOutput) -> EdgeWeightedOutput {
  let weight = input.color.a;
  var output : EdgeWeightedOutput;
  output.colorAccum = vec4<f32>(input.color.rgb * weight, weight);
  output.weightAccum = vec4<f32>(weight, 0.0, 0.0, 0.0);
  return output;
}`;

export const EDGE_WEIGHTED_RESOLVE_WGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@group(0) @binding(0) var textureSampler : sampler;
@group(0) @binding(1) var colorAccum : texture_2d<f32>;
@group(0) @binding(2) var weightAccum : texture_2d<f32>;

@vertex
fn vs(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VertexOut {
  var output : VertexOut;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}

@fragment
fn fs(input : VertexOut) -> @location(0) vec4<f32> {
  // Flip Y to account for WebGPU texture coordinates so offscreen edges align with on-screen nodes.
  let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
  let accumColor = textureSample(colorAccum, textureSampler, uv).rgb;
  let weight = textureSample(weightAccum, textureSampler, uv).x;
  let denom = max(weight, 1e-4);
  let resolved = accumColor / vec3<f32>(denom);
  let alpha = clamp(weight, 0.0, 1.0);
  return vec4<f32>(resolved * alpha, alpha);
}`;

export function createEdgeWeightedResolveTonemapWGSL(options = {}) {
  const boost = options.boost === true;
  const body = boost
    ? `
  let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
  let accumColor = textureSample(colorAccum, textureSampler, uv).rgb;
  let weight = textureSample(weightAccum, textureSampler, uv).x;
  let denom = max(weight, 1e-4);
  let resolved = accumColor / vec3<f32>(denom);
  let scaled = resolved * clamp(weight, 0.0, 4.0);
  let tonemapped = scaled / (scaled + vec3<f32>(1.0));
  let alpha = clamp(weight, 0.0, 1.0);
  return vec4<f32>(tonemapped, alpha);`
    : `
  let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
  let accumColor = textureSample(colorAccum, textureSampler, uv).rgb;
  let weight = textureSample(weightAccum, textureSampler, uv).x;
  let denom = max(weight, 1e-4);
  let resolved = accumColor / vec3<f32>(denom);
  let tonemapped = resolved / (resolved + vec3<f32>(1.0));
  let alpha = clamp(weight, 0.0, 1.0);
  return vec4<f32>(tonemapped, alpha);`;

  return /* wgsl */ `
struct VertexOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@group(0) @binding(0) var textureSampler : sampler;
@group(0) @binding(1) var colorAccum : texture_2d<f32>;
@group(0) @binding(2) var weightAccum : texture_2d<f32>;

@vertex
fn vs(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VertexOut {
  var output : VertexOut;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}

@fragment
fn fs(input : VertexOut) -> @location(0) vec4<f32> {
  ${body}
}`;
}
