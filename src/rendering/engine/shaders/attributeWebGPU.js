export function createAttributeWebGPUSources(options = {}) {
  const nodeOptions = options?.node && typeof options.node === 'object' ? options.node : {};
  const edgeOptions = options?.edge && typeof options.edge === 'object' ? options.edge : {};
  const encodedOutputMode = options?.encodedOutputMode === 'uint32' ? 'uint32' : 'rgba8';
  const encodedInputMode = options?.encodedInputMode === 'uint32' ? 'uint32' : 'u8x4';
  const useUintTarget = encodedOutputMode === 'uint32';
  const useUintInput = encodedInputMode === 'uint32';

  const useNodeSizeBuffer = nodeOptions.size !== 'uniform';
  const useNodeOutlineBuffer = nodeOptions.outline !== 'uniform';
  const useNodeEncodedBuffer = nodeOptions.encoded !== 'none';
  const nodeIndexEncodedRaw = nodeOptions.indexEncodedRaw === true;
  const useEdgeWidthBuffer = edgeOptions.width !== 'uniform';
  const useEdgeEndpointSizeBuffer = edgeOptions.endpointSize !== 'uniform';
  const edgeIndexEncodedRaw = edgeOptions.indexEncodedRaw === true;

  const NODE_ENCODED_INPUT_DECL = useNodeEncodedBuffer
    ? (useUintInput ? '@location(3) encoded : u32,' : '@location(3) encoded : vec4<u32>,')
    : '';
  const EDGE_ENCODED_INPUT_DECL = useUintInput ? 'u32' : 'vec4<u32>';
  const NODE_ENCODED_ASSIGN = useNodeEncodedBuffer
    ? (useUintInput
      ? `output.encoded = input.encoded${nodeIndexEncodedRaw ? ' + 1u' : ''};`
      : 'output.encoded = input.encoded;')
    : '/* no encoded: occlusion pass */';
  const EDGE_ENCODED_ASSIGN = useUintInput
    ? `output.encoded = input.encoded${edgeIndexEncodedRaw ? ' + 1u' : ''};`
    : 'output.encoded = input.encoded;';
  const NODE_ENCODED_VARYING_DECL = useNodeEncodedBuffer
    ? (useUintInput
      ? '@location(6) @interpolate(flat) encoded : u32,'
      : '@location(6) @interpolate(flat) encoded : vec4<u32>,')
    : '';
  const EDGE_ENCODED_VARYING_DECL = useUintInput ? 'u32' : 'vec4<u32>';
  const NODE_FRAGMENT_COLOR_TYPE = useUintTarget ? 'u32' : 'vec4<f32>';
  const NODE_FRAGMENT_ENCODED_EXPR = useNodeEncodedBuffer
    ? (
      useUintTarget
        ? (
          useUintInput
            ? 'output.color = input.encoded;'
            : 'output.color = input.encoded.x | (input.encoded.y << 8u) | (input.encoded.z << 16u) | (input.encoded.w << 24u);'
        )
        : (
          useUintInput
            ? 'output.color = vec4<f32>(f32(input.encoded & 255u), f32((input.encoded >> 8u) & 255u), f32((input.encoded >> 16u) & 255u), f32((input.encoded >> 24u) & 255u)) / vec4<f32>(255.0);'
            : 'output.color = vec4<f32>(vec4<f32>(input.encoded) / vec4<f32>(255.0));'
        )
    )
    : (useUintTarget ? 'output.color = 0u;' : 'output.color = vec4<f32>(0.0, 0.0, 0.0, 0.0);');
  const EDGE_FRAGMENT_ENCODED_EXPR = useUintTarget
    ? (
      useUintInput
        ? 'return input.encoded;'
        : 'return input.encoded.x | (input.encoded.y << 8u) | (input.encoded.z << 16u) | (input.encoded.w << 24u);'
    )
    : (
      useUintInput
        ? 'return vec4<f32>(f32(input.encoded & 255u), f32((input.encoded >> 8u) & 255u), f32((input.encoded >> 16u) & 255u), f32((input.encoded >> 24u) & 255u)) / vec4<f32>(255.0);'
        : 'return vec4<f32>(vec4<f32>(input.encoded) / vec4<f32>(255.0));'
    );

  const NODE_VERTEX_INPUT = `
struct VertexInput {
  @location(0) corner : vec2<f32>,
  @location(1) position : vec3<f32>,
  ${useNodeSizeBuffer ? '@location(2) size : f32,' : ''}
  ${NODE_ENCODED_INPUT_DECL}
  ${useNodeOutlineBuffer ? '@location(4) outline : f32,' : ''}
};
`;

  const NODE_SIZE_RAW_EXPR = useNodeSizeBuffer ? 'input.size' : 'globals.nodeRaw.x';
  const NODE_OUTLINE_RAW_EXPR = useNodeOutlineBuffer ? 'input.outline' : 'globals.nodeRaw.y';

  const EDGE_VERTEX_INPUT = `
struct EdgeVertexInput {
  @location(0) start : vec3<f32>,
  @location(1) end : vec3<f32>,
  ${useEdgeEndpointSizeBuffer ? '@location(3) endpointSize : vec2<f32>,' : ''}
  @location(4) encoded : ${EDGE_ENCODED_INPUT_DECL},
};
`;

  const EDGE_QUAD_VERTEX_INPUT = `
struct EdgeQuadVertexInput {
  @location(0) corner : vec2<f32>,
  @location(1) start : vec3<f32>,
  @location(2) end : vec3<f32>,
  ${useEdgeWidthBuffer ? '@location(3) width : vec2<f32>,' : ''}
  ${useEdgeEndpointSizeBuffer ? '@location(4) endpointSize : vec2<f32>,' : ''}
  @location(5) encoded : ${EDGE_ENCODED_INPUT_DECL},
};
`;

  const EDGE_WIDTH_PAIR_EXPR = useEdgeWidthBuffer ? 'input.width' : 'globals.edgeWidthRaw';
  const EDGE_ENDPOINT_SIZE_PAIR_EXPR = useEdgeEndpointSizeBuffer ? 'input.endpointSize' : 'globals.edgeEndpointSizeRaw';

  const NODE_WGSL = /* wgsl */ `
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
  nodeRaw: vec2<f32>, // x=nodeSizeRaw y=nodeOutlineRaw
  nodeOutlineColor: vec4<f32>,
  edgeTrim: f32,
  _pad0: f32,
  edgeWidthRaw: vec2<f32>,
  edgeEndpointSizeRaw: vec2<f32>,
  _pad1: vec2<f32>,
};

fn semanticZoomScale(camera : Camera, globals : Globals) -> f32 {
  let is2D = camera.position.w > 0.5;
  if (!is2D) {
    return 1.0;
  }
  let exponent = globals._pad0;
  if (exponent <= 0.0 || exponent != exponent) {
    return 1.0;
  }
  let zoom2D = max(abs(camera.view[0][0]), 1e-3);
  if (exponent == 1.0) {
    return 1.0 / zoom2D;
  }
  return 1.0 / pow(zoom2D, exponent);
}

${NODE_VERTEX_INPUT}

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) centerWorld : vec3<f32>,
  @location(2) rightWorld : vec3<f32>,
  @location(3) upWorld : vec3<f32>,
  @location(4) viewDir : vec3<f32>,
  @location(5) radius : f32,
  ${NODE_ENCODED_VARYING_DECL}
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> globals : Globals;

@vertex
fn nodeVertex(input : VertexInput) -> VertexOutput {
  let semanticScale = semanticZoomScale(camera, globals);
  let baseSize = globals.nodeSize.x + globals.nodeSize.y * ${NODE_SIZE_RAW_EXPR};
  let outlineWidth = max(0.0, globals.nodeOutline.x + globals.nodeOutline.y * ${NODE_OUTLINE_RAW_EXPR});
  let fullSize = (baseSize + outlineWidth) * semanticScale;
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
  ${NODE_ENCODED_ASSIGN}
  return output;
}

struct FragmentOutput {
  @location(0) color : ${NODE_FRAGMENT_COLOR_TYPE},
  @builtin(frag_depth) depth : f32,
};

struct DepthFragmentOutput {
  @location(0) color : vec4<f32>,
  @builtin(frag_depth) depth : f32,
};

fn packDepthToRGBA(v : f32) -> vec4<f32> {
  let bitShift = vec4<f32>(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
  let bitMask = vec4<f32>(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
  var res = fract(v * bitShift);
  res = res - res.xxyz * bitMask;
  return res;
}

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
  ${NODE_FRAGMENT_ENCODED_EXPR}
  return output;
}

@fragment
fn nodeDepthFragment(input : VertexOutput) -> DepthFragmentOutput {
  var output : DepthFragmentOutput;
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
  output.color = packDepthToRGBA(output.depth);
  return output;
}
`;

  const EDGE_WGSL = /* wgsl */ `
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
  nodeRaw: vec2<f32>,
  nodeOutlineColor: vec4<f32>,
  edgeTrim: f32,
  _pad0: f32,
  edgeWidthRaw: vec2<f32>,
  edgeEndpointSizeRaw: vec2<f32>,
  _pad1: vec2<f32>,
};

fn semanticZoomScale(camera : Camera, globals : Globals) -> f32 {
  let is2D = camera.position.w > 0.5;
  if (!is2D) {
    return 1.0;
  }
  let exponent = globals._pad0;
  if (exponent <= 0.0 || exponent != exponent) {
    return 1.0;
  }
  let zoom2D = max(abs(camera.view[0][0]), 1e-3);
  if (exponent == 1.0) {
    return 1.0 / zoom2D;
  }
  return 1.0 / pow(zoom2D, exponent);
}

${EDGE_VERTEX_INPUT}

${EDGE_QUAD_VERTEX_INPUT}

fn packDepthToRGBA(v : f32) -> vec4<f32> {
  let bitShift = vec4<f32>(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
  let bitMask = vec4<f32>(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
  var res = fract(v * bitShift);
  res = res - res.xxyz * bitMask;
  return res;
}

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) @interpolate(flat) encoded : ${EDGE_ENCODED_VARYING_DECL},
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> globals : Globals;

@vertex
fn edgeVertex(input : EdgeVertexInput, @builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  var output : EdgeVertexOutput;
  let dir = input.end - input.start;
  let dirLen = max(length(dir), 1e-5);
  let dirN = dir / vec3<f32>(dirLen);
  let endpointSizePair = ${EDGE_ENDPOINT_SIZE_PAIR_EXPR};
  let semanticScale = semanticZoomScale(camera, globals);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSizePair.x, 0.0) * 0.5 * semanticScale;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSizePair.y, 0.0) * 0.5 * semanticScale;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  let startPos = input.start + dirN * trimStart;
  let endPos = input.end - dirN * trimEnd;
  let isEnd = (vertexIndex & 1u) == 1u;
  let pos = select(startPos, endPos, isEnd);
  output.position = camera.viewProjection * vec4<f32>(pos, 1.0);
  ${EDGE_ENCODED_ASSIGN}
  return output;
}

@vertex
fn edgeQuadVertex(input : EdgeQuadVertexInput) -> EdgeVertexOutput {
  var output : EdgeVertexOutput;
  let dir = input.end - input.start;
  let dirLenWorld = max(length(dir), 1e-5);
  let dirN = dir / vec3<f32>(dirLenWorld);
  let endpointSizePair = ${EDGE_ENDPOINT_SIZE_PAIR_EXPR};
  let semanticScale = semanticZoomScale(camera, globals);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSizePair.x, 0.0) * 0.5 * semanticScale;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSizePair.y, 0.0) * 0.5 * semanticScale;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  let startPos = input.start + dirN * trimStart;
  let endPos = input.end - dirN * trimEnd;
  let segmentMix = clamp(input.corner.x, 0.0, 1.0);
  let widthPair = ${EDGE_WIDTH_PAIR_EXPR};
  let width = max(globals.edgeWidth.x + globals.edgeWidth.y * mix(widthPair.x, widthPair.y, segmentMix), 0.0) * semanticScale;
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
  ${EDGE_ENCODED_ASSIGN}
  return output;
}

@fragment
fn edgeFragment(input : EdgeVertexOutput) -> @location(0) ${useUintTarget ? 'u32' : 'vec4<f32>'} {
  ${EDGE_FRAGMENT_ENCODED_EXPR}
}

@fragment
fn edgeDepthFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  return packDepthToRGBA(input.position.z / input.position.w);
}
`;

  return { nodeWGSL: NODE_WGSL, edgeWGSL: EDGE_WGSL };
}

export function createAttributeWebGPUTrackSources(options = {}) {
  const node = options?.node && typeof options.node === 'object' ? options.node : {};
  const edge = options?.edge && typeof options.edge === 'object' ? options.edge : {};
  const encodedOutputMode = options?.encodedOutputMode === 'uint32' ? 'uint32' : 'rgba8';
  const useUintTarget = encodedOutputMode === 'uint32';

  const nodeUseSizeBuffer = node.size !== 'uniform';
  const nodeUseOutlineBuffer = node.outline !== 'uniform';
  const nodeTrackedMode = node.trackedMode === 'int'
    ? 'int'
    : (node.trackedMode === 'uint' ? 'uint' : 'index');

  const edgeUseWidthBuffer = edge.width !== 'uniform';
  const edgeUseEndpointSizeBuffer = edge.endpointSize !== 'uniform';
  const edgeWidthSource = edge.widthSource === 'node' ? 'node' : 'edge';
  const edgeEndpointSizeSource = edge.endpointSizeSource === 'node' ? 'node' : 'edge';
  const edgeWidthEndpoints = Number.isFinite(edge.widthEndpointsMode) ? Number(edge.widthEndpointsMode) : 0;
  const edgeEndpointSizeEndpoints = Number.isFinite(edge.endpointSizeEndpointsMode)
    ? Number(edge.endpointSizeEndpointsMode)
    : 0;
  const edgeTrackedMode = edge.trackedMode === 'int'
    ? 'int'
    : (edge.trackedMode === 'uint' ? 'uint' : 'index');

  const NODE_TRACKED_EXPR = nodeTrackedMode === 'int'
    ? 'bitcast<u32>(nodeTrackedInt.data[nodeId] + 1)'
    : (nodeTrackedMode === 'uint' ? '(nodeTrackedUint.data[nodeId] + 1u)' : '(nodeId + 1u)');
  const EDGE_TRACKED_EXPR = edgeTrackedMode === 'int'
    ? 'bitcast<u32>(edgeTrackedInt.data[edgeId] + 1)'
    : (edgeTrackedMode === 'uint' ? '(edgeTrackedUint.data[edgeId] + 1u)' : '(edgeId + 1u)');

  const NODE_SIZE_EXPR = nodeUseSizeBuffer ? 'nodeSizes.data[nodeId]' : 'globals.nodeRaw.x';
  const NODE_OUTLINE_EXPR = nodeUseOutlineBuffer ? 'nodeOutlineWidths.data[nodeId]' : 'globals.nodeRaw.y';

  const EDGE_WIDTH_PAIR_EXPR = !edgeUseWidthBuffer
    ? 'globals.edgeWidthRaw'
    : (edgeWidthSource === 'node'
      ? `selectNodePair(nodeWidthSource.data[sourceId], nodeWidthSource.data[targetId], ${edgeWidthEndpoints}u)`
      : 'edgeWidths.data[edgeId]');
  const EDGE_ENDPOINT_SIZE_PAIR_EXPR = !edgeUseEndpointSizeBuffer
    ? 'globals.edgeEndpointSizeRaw'
    : (edgeEndpointSizeSource === 'node'
      ? `selectNodePair(nodeEndpointSizeSource.data[sourceId], nodeEndpointSizeSource.data[targetId], ${edgeEndpointSizeEndpoints}u)`
      : 'edgeEndpointSizes.data[edgeId]');

  const ENCODE_OUT_FN = useUintTarget
    ? 'return encoded;'
    : 'return vec4<f32>(f32(encoded & 255u), f32((encoded >> 8u) & 255u), f32((encoded >> 16u) & 255u), f32((encoded >> 24u) & 255u)) / vec4<f32>(255.0);';

  const NODE_COLOR_TYPE = useUintTarget ? 'u32' : 'vec4<f32>';
  const EDGE_COLOR_TYPE = NODE_COLOR_TYPE;

  const COMMON = /* wgsl */ `
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
  nodeRaw: vec2<f32>,
  nodeOutlineColor: vec4<f32>,
  edgeTrim: f32,
  _pad0: f32,
  edgeWidthRaw: vec2<f32>,
  edgeEndpointSizeRaw: vec2<f32>,
  _pad1: vec2<f32>,
};

struct U32Data { data: array<u32>, };
struct I32Data { data: array<i32>, };
struct F32Data { data: array<f32>, };
struct U32PairData { data: array<vec2<u32>>, };
struct F32PairData { data: array<vec2<f32>>, };

fn packDepthToRGBA(v : f32) -> vec4<f32> {
  let bitShift = vec4<f32>(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
  let bitMask = vec4<f32>(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
  var res = fract(v * bitShift);
  res = res - res.xxyz * bitMask;
  return res;
}

fn selectNodePair(sourceValue: f32, targetValue: f32, endpoints: u32) -> vec2<f32> {
  if (endpoints == 0u) {
    return vec2<f32>(sourceValue, targetValue);
  }
  if (endpoints == 1u) {
    return vec2<f32>(sourceValue, sourceValue);
  }
  return vec2<f32>(targetValue, targetValue);
}

fn semanticZoomScale(camera : Camera, globals : Globals) -> f32 {
  let is2D = camera.position.w > 0.5;
  if (!is2D) {
    return 1.0;
  }
  let exponent = globals._pad0;
  if (exponent <= 0.0 || exponent != exponent) {
    return 1.0;
  }
  let zoom2D = max(abs(camera.view[0][0]), 1e-3);
  if (exponent == 1.0) {
    return 1.0 / zoom2D;
  }
  return 1.0 / pow(zoom2D, exponent);
}
`;

  const nodeWGSL = /* wgsl */ `
${COMMON}

struct NodeVertexInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

struct NodeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) centerWorld : vec3<f32>,
  @location(2) rightWorld : vec3<f32>,
  @location(3) upWorld : vec3<f32>,
  @location(4) viewDir : vec3<f32>,
  @location(5) radius : f32,
  @location(6) @interpolate(flat) encoded : u32,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> globals : Globals;
@group(0) @binding(2) var<storage, read> nodeIndices : U32Data;
@group(0) @binding(3) var<storage, read> nodePositions : F32Data;
@group(0) @binding(4) var<storage, read> nodeSizes : F32Data;
@group(0) @binding(5) var<storage, read> nodeOutlineWidths : F32Data;
@group(0) @binding(6) var<storage, read> nodeTrackedInt : I32Data;
@group(0) @binding(7) var<storage, read> nodeTrackedUint : U32Data;

@vertex
fn nodeVertex(input : NodeVertexInput) -> NodeVertexOutput {
  let nodeId = nodeIndices.data[input.instance];
  let base = nodeId * 3u;
  let position = vec3<f32>(
    nodePositions.data[base + 0u],
    nodePositions.data[base + 1u],
    nodePositions.data[base + 2u],
  );
  let rawSize = ${NODE_SIZE_EXPR};
  let rawOutline = ${NODE_OUTLINE_EXPR};
  let semanticScale = semanticZoomScale(camera, globals);
  let outlineWidth = max(0.0, globals.nodeOutline.x + globals.nodeOutline.y * rawOutline);
  let fullSize = max(1.0, globals.nodeSize.x + globals.nodeSize.y * rawSize + outlineWidth) * semanticScale;
  let radius = fullSize * 0.5;

  var right = camera.right.xyz;
  var up = camera.up.xyz;
  var viewDir = vec3<f32>(0.0, 0.0, 1.0);
  let is2D = camera.position.w > 0.5;
  if (is2D) {
    right = normalize(right);
    up = normalize(up);
  } else {
    viewDir = camera.position.xyz - position;
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
  var output : NodeVertexOutput;
  output.position = camera.viewProjection * vec4<f32>(position + offset * radius, 1.0);
  output.local = input.corner;
  output.centerWorld = position;
  output.rightWorld = right;
  output.upWorld = up;
  output.viewDir = viewDir;
  output.radius = radius;
  output.encoded = ${NODE_TRACKED_EXPR};
  return output;
}

struct NodeFragmentOutput {
  @location(0) color : ${NODE_COLOR_TYPE},
  @builtin(frag_depth) depth : f32,
};

struct NodeDepthFragmentOutput {
  @location(0) color : vec4<f32>,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn nodeFragment(input : NodeVertexOutput) -> NodeFragmentOutput {
  var output : NodeFragmentOutput;
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
    output.depth = clip.z / clip.w * 0.5 + 0.5;
  } else {
    output.depth = input.position.z / input.position.w;
  }
  let encoded = input.encoded;
  ${useUintTarget ? 'output.color = encoded;' : 'output.color = vec4<f32>(f32(encoded & 255u), f32((encoded >> 8u) & 255u), f32((encoded >> 16u) & 255u), f32((encoded >> 24u) & 255u)) / vec4<f32>(255.0);'}
  return output;
}

@fragment
fn nodeOcclusionFragment(input : NodeVertexOutput) -> NodeFragmentOutput {
  var output : NodeFragmentOutput;
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
    output.depth = clip.z / clip.w * 0.5 + 0.5;
  } else {
    output.depth = input.position.z / input.position.w;
  }
  ${useUintTarget ? 'output.color = 0u;' : 'output.color = vec4<f32>(0.0, 0.0, 0.0, 0.0);'}
  return output;
}

@fragment
fn nodeDepthFragment(input : NodeVertexOutput) -> NodeDepthFragmentOutput {
  var output : NodeDepthFragmentOutput;
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
    output.depth = clip.z / clip.w * 0.5 + 0.5;
  } else {
    output.depth = input.position.z / input.position.w;
  }
  output.color = packDepthToRGBA(output.depth);
  return output;
}
`;

  const edgeWGSL = /* wgsl */ `
${COMMON}

struct EdgeLineVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) @interpolate(flat) encoded : u32,
};

struct EdgeQuadInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> globals : Globals;
@group(0) @binding(2) var<storage, read> edgeIndices : U32Data;
@group(0) @binding(3) var<storage, read> edgeEndpoints : U32PairData;
@group(0) @binding(4) var<storage, read> nodePositions : F32Data;
@group(0) @binding(5) var<storage, read> edgeWidths : F32PairData;
@group(0) @binding(6) var<storage, read> edgeEndpointSizes : F32PairData;
@group(0) @binding(7) var<storage, read> nodeWidthSource : F32Data;
@group(0) @binding(8) var<storage, read> nodeEndpointSizeSource : F32Data;
@group(0) @binding(9) var<storage, read> edgeTrackedInt : I32Data;
@group(0) @binding(10) var<storage, read> edgeTrackedUint : U32Data;

fn edgeEncoded(edgeId: u32) -> u32 {
  return ${EDGE_TRACKED_EXPR};
}

fn loadPos(nodeId: u32) -> vec3<f32> {
  let base = nodeId * 3u;
  return vec3<f32>(
    nodePositions.data[base + 0u],
    nodePositions.data[base + 1u],
    nodePositions.data[base + 2u],
  );
}

fn edgeWidthPair(edgeId: u32, sourceId: u32, targetId: u32) -> vec2<f32> {
  return ${EDGE_WIDTH_PAIR_EXPR};
}

fn edgeEndpointSizePair(edgeId: u32, sourceId: u32, targetId: u32) -> vec2<f32> {
  return ${EDGE_ENDPOINT_SIZE_PAIR_EXPR};
}

@vertex
fn edgeVertex(@builtin(vertex_index) vertexIndex : u32, @builtin(instance_index) instance : u32) -> EdgeLineVertexOutput {
  let edgeId = edgeIndices.data[instance];
  let endpoints = edgeEndpoints.data[edgeId];
  let sourceId = endpoints.x;
  let targetId = endpoints.y;
  let sourcePos = loadPos(sourceId);
  let targetPos = loadPos(targetId);
  let dirRaw = targetPos - sourcePos;
  let dirLen = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLen);
  let endpointPair = edgeEndpointSizePair(edgeId, sourceId, targetId);
  let semanticScale = semanticZoomScale(camera, globals);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointPair.x, 0.0) * 0.5 * semanticScale;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointPair.y, 0.0) * 0.5 * semanticScale;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  let startPos = sourcePos + dir * trimStart;
  let endPos = targetPos - dir * trimEnd;
  let pos = select(startPos, endPos, (vertexIndex & 1u) == 1u);
  var output : EdgeLineVertexOutput;
  output.position = camera.viewProjection * vec4<f32>(pos, 1.0);
  output.encoded = edgeEncoded(edgeId);
  return output;
}

@vertex
fn edgeQuadVertex(input : EdgeQuadInput) -> EdgeLineVertexOutput {
  let edgeId = edgeIndices.data[input.instance];
  let endpoints = edgeEndpoints.data[edgeId];
  let sourceId = endpoints.x;
  let targetId = endpoints.y;
  let sourcePos = loadPos(sourceId);
  let targetPos = loadPos(targetId);
  let dirRaw = targetPos - sourcePos;
  let dirLenWorld = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLenWorld);
  let endpointPair = edgeEndpointSizePair(edgeId, sourceId, targetId);
  let semanticScale = semanticZoomScale(camera, globals);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointPair.x, 0.0) * 0.5 * semanticScale;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointPair.y, 0.0) * 0.5 * semanticScale;
  let trimStart = startRadius * globals.edgeTrim;
  let trimEnd = endRadius * globals.edgeTrim;
  let startPos = sourcePos + dir * trimStart;
  let endPos = targetPos - dir * trimEnd;
  let segmentMix = clamp(input.corner.x, 0.0, 1.0);
  let widthPair = edgeWidthPair(edgeId, sourceId, targetId);
  let width = max(globals.edgeWidth.x + globals.edgeWidth.y * mix(widthPair.x, widthPair.y, segmentMix), 0.0) * semanticScale;
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
  clipPos = vec4<f32>(clipPos.xy + offsetNdc * input.corner.y * 1.5, clipPos.z, clipPos.w);
  var output : EdgeLineVertexOutput;
  output.position = clipPos;
  output.encoded = edgeEncoded(edgeId);
  return output;
}

@fragment
fn edgeFragment(input : EdgeLineVertexOutput) -> @location(0) ${EDGE_COLOR_TYPE} {
  let encoded = input.encoded;
  ${ENCODE_OUT_FN}
}

@fragment
fn edgeDepthFragment(input : EdgeLineVertexOutput) -> @location(0) vec4<f32> {
  return packDepthToRGBA(input.position.z / input.position.w);
}
`;

  return { nodeWGSL, edgeWGSL };
}

const DEFAULT_SOURCES = createAttributeWebGPUSources();
export const NODE_ATTRIBUTE_WGSL = DEFAULT_SOURCES.nodeWGSL;
export const EDGE_ATTRIBUTE_WGSL = DEFAULT_SOURCES.edgeWGSL;
