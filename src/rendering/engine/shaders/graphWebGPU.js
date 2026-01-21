export function createGraphWebGPUSources(stateSlots = 4, options = {}) {
  const STATE_SLOTS = Math.max(0, Math.min(32, Math.floor(Number(stateSlots) || 0)));
  const useNodeIndices = options.useNodeIndices !== false;
  const useEdgeIndices = options.useEdgeIndices !== false;

  const nodeOptions = options?.node && typeof options.node === 'object' ? options.node : {};
  const edgeOptions = options?.edge && typeof options.edge === 'object' ? options.edge : {};

  // Back-compat: previous API used a single toggle for outline width + outline color from buffers.
  if (options?.useNodeOutlineAttributes === true) {
    if (nodeOptions.outline == null) nodeOptions.outline = 'buffer';
    if (nodeOptions.outlineColor == null) nodeOptions.outlineColor = 'buffer';
  }

  const useNodeColorBuffer = nodeOptions.color !== 'uniform';
  const useNodeSizeBuffer = nodeOptions.size !== 'uniform';
  // Default outline to uniform unless explicitly marked as buffer.
  const useNodeOutlineWidthBuffer = nodeOptions.outline === 'buffer';
  const useNodeOutlineColorBuffer = nodeOptions.outlineColor === 'buffer';

  const useEdgeColorBuffer = edgeOptions.color !== 'uniform';
  const useEdgeWidthBuffer = edgeOptions.width !== 'uniform';
  const useEdgeOpacityBuffer = edgeOptions.opacity !== 'uniform';
  const useEdgeEndpointSizeBuffer = edgeOptions.endpointSize !== 'uniform';

  // Existing optional extra bindings for outline buffers.
  const useNodeOutlineAttributes = useNodeOutlineWidthBuffer || useNodeOutlineColorBuffer;

  const NODE_OUTLINE_STORAGE_BINDINGS = useNodeOutlineAttributes
    ? '@group(0) @binding(8) var<storage, read> nodeOutlineWidths : NodeOutlineWidths;\n\t@group(0) @binding(9) var<storage, read> nodeOutlineColors : NodeOutlineColors;'
    : '';

  const NODE_OUTLINE_RAW_EXPR = useNodeOutlineWidthBuffer
    ? 'let outlineRaw = nodeOutlineWidths.data[index];'
    : 'let outlineRaw = globals.nodeRaw.y;';

  const NODE_OUTLINE_BASE_COLOR_EXPR = useNodeOutlineColorBuffer
    ? 'let outlineBaseColor = nodeOutlineColors.data[index];'
    : 'let outlineBaseColor = globals.nodeOutlineColor;';

  const NODE_WGSL = /* wgsl */ `
const USE_NODE_INDICES : bool = ${useNodeIndices ? 'true' : 'false'};
const USE_NODE_COLOR_BUFFER : bool = ${useNodeColorBuffer ? 'true' : 'false'};
const USE_NODE_SIZE_BUFFER : bool = ${useNodeSizeBuffer ? 'true' : 'false'};
const USE_NODE_OUTLINE_WIDTH_BUFFER : bool = ${useNodeOutlineWidthBuffer ? 'true' : 'false'};
const USE_NODE_OUTLINE_COLOR_BUFFER : bool = ${useNodeOutlineColorBuffer ? 'true' : 'false'};

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
  _pad0: vec2<f32>,
  nodeColor: vec4<f32>,
  nodeRaw: vec2<f32>, // x=nodeSizeRaw y=nodeOutlineRaw
  _pad1: vec2<f32>,
  nodeOutlineColor: vec4<f32>,
  edgeColorStart: vec4<f32>,
  edgeColorEnd: vec4<f32>,
  edgeWidthRaw: vec2<f32>,
  edgeOpacityRaw: vec2<f32>,
  edgeEndpointSizeRaw: vec2<f32>,
  _pad2: vec2<f32>,
  edgeTrim: vec4<f32>, // edgeTrim.x used, rest padding
  nodeNoStateScale: vec4<f32>, // x=sizeMul y=opacityMul z=outlineMul w=discard(>0.5)
  nodeNoStateColorMul: vec4<f32>,
  nodeNoStateColorAdd: vec4<f32>,
  edgeNoStateScale: vec4<f32>, // x=widthMul y=opacityMul w=discard(>0.5)
  edgeNoStateColorMul: vec4<f32>,
  edgeNoStateColorAdd: vec4<f32>,
  nodeStateScale: array<vec4<f32>, ${STATE_SLOTS}>,
  nodeStateColorMul: array<vec4<f32>, ${STATE_SLOTS}>,
  nodeStateColorAdd: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateScale: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateColorMul: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateColorAdd: array<vec4<f32>, ${STATE_SLOTS}>,
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

	struct NodeStates {
	  data: array<u32>,
	};

  struct NodeOutlineWidths {
    data: array<f32>,
  };

  struct NodeOutlineColors {
    data: array<vec4<f32>>,
  };

	@group(0) @binding(0) var<uniform> camera : Camera;
	@group(0) @binding(1) var<storage, read> nodeIndices : NodeIndices;
	@group(0) @binding(2) var<storage, read> nodePositions : NodePositions;
	@group(0) @binding(3) var<storage, read> nodeSizes : NodeSizes;
	@group(0) @binding(4) var<storage, read> nodeColors : NodeColors;
	@group(0) @binding(5) var<storage, read> nodeStates : NodeStates;
  ${NODE_OUTLINE_STORAGE_BINDINGS}
	@group(0) @binding(6) var<uniform> globals : Globals;
	struct Hover {
	  nodeIndex: u32,
	  nodeState: u32,
	  edgeIndex: u32,
	  edgeState: u32,
	};
	@group(0) @binding(7) var<uniform> hover : Hover;

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
  @location(9) @interpolate(flat) discardFlag : u32,
};

@vertex
fn nodeVertex(input : VertexInput) -> VertexOutput {
  var index = input.instance;
  if (USE_NODE_INDICES) {
    index = nodeIndices.data[input.instance];
  }
  let baseOffset = index * 3u;
  let basePosition = vec3<f32>(
    nodePositions.data[baseOffset + 0u],
    nodePositions.data[baseOffset + 1u],
    nodePositions.data[baseOffset + 2u]
  );
  let rawSize = select(globals.nodeRaw.x, nodeSizes.data[index], USE_NODE_SIZE_BUFFER);
	  var state = nodeStates.data[index];
	  if (hover.nodeIndex != 0xffffffffu && index == hover.nodeIndex) {
	    state = state | hover.nodeState;
	  }
	  var sizeMul = 1.0;
	  var opacityMul = 1.0;
	  var outlineMul = 1.0;
	  var rgbMul = vec3<f32>(1.0, 1.0, 1.0);
	  var rgbAdd = vec3<f32>(0.0, 0.0, 0.0);
  var discardFlag = 0u;
  if (state == 0u) {
    let scale = globals.nodeNoStateScale;
    sizeMul = sizeMul * scale.x;
    opacityMul = opacityMul * scale.y;
    outlineMul = outlineMul * scale.z;
    rgbMul = rgbMul * globals.nodeNoStateColorMul.rgb;
    rgbAdd = rgbAdd + globals.nodeNoStateColorAdd.rgb;
    discardFlag = select(0u, 1u, scale.w > 0.5);
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let enabled = (state >> i) & 1u;
      if (enabled == 1u) {
        let scale = globals.nodeStateScale[i];
        sizeMul = sizeMul * scale.x;
        opacityMul = opacityMul * scale.y;
        outlineMul = outlineMul * scale.z;
        rgbMul = rgbMul * globals.nodeStateColorMul[i].rgb;
        rgbAdd = rgbAdd + globals.nodeStateColorAdd[i].rgb;
        if (scale.w > 0.5) {
          discardFlag = 1u;
        }
      }
    }
  }

  let diameter = max(1.0, (globals.nodeSize.x + globals.nodeSize.y * rawSize) * sizeMul);
  ${NODE_OUTLINE_RAW_EXPR}
  let outlineWidth = max(0.0, (globals.nodeOutline.x + globals.nodeOutline.y * outlineRaw) * outlineMul);
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
  let baseColor = select(globals.nodeColor, nodeColors.data[index], USE_NODE_COLOR_BUFFER);
  let alpha = clamp(globals.nodeOpacity.x + globals.nodeOpacity.y * baseColor.a, 0.0, 1.0) * opacityMul;
  let rgb = clamp(baseColor.rgb * rgbMul + rgbAdd, vec3<f32>(0.0), vec3<f32>(1.0));
  output.color = vec4<f32>(rgb, clamp(alpha, 0.0, 1.0));
  output.local = input.corner;
  ${NODE_OUTLINE_BASE_COLOR_EXPR}
  let outlineAlpha = clamp(globals.nodeOpacity.x + globals.nodeOpacity.y * outlineBaseColor.a, 0.0, 1.0) * opacityMul;
  output.outlineColor = vec4<f32>(outlineBaseColor.rgb, clamp(outlineAlpha, 0.0, 1.0));
  output.outlineThreshold = select(0.0, outlineWidth / max(fullDiameter, 1e-5), outlineWidth > 0.0);
  output.centerWorld = basePosition;
  output.rightWorld = right;
  output.upWorld = up;
  output.viewDir = viewDir;
  output.radius = radius;
  output.discardFlag = discardFlag;
  return output;
}

struct NodeFragmentOutput {
  @location(0) color : vec4<f32>,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn nodeFragment(input : VertexOutput) -> NodeFragmentOutput {
  var output : NodeFragmentOutput;
  if (input.discardFlag == 1u) {
    discard;
  }
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

  const EDGE_WGSL = /* wgsl */ `
const USE_EDGE_INDICES : bool = ${useEdgeIndices ? 'true' : 'false'};
const USE_EDGE_COLOR_BUFFER : bool = ${useEdgeColorBuffer ? 'true' : 'false'};
const USE_EDGE_WIDTH_BUFFER : bool = ${useEdgeWidthBuffer ? 'true' : 'false'};
const USE_EDGE_OPACITY_BUFFER : bool = ${useEdgeOpacityBuffer ? 'true' : 'false'};
const USE_EDGE_ENDPOINT_SIZE_BUFFER : bool = ${useEdgeEndpointSizeBuffer ? 'true' : 'false'};

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
  _pad0: vec2<f32>,
  nodeColor: vec4<f32>,
  nodeRaw: vec2<f32>, // x=nodeSizeRaw y=nodeOutlineRaw
  _pad1: vec2<f32>,
  nodeOutlineColor: vec4<f32>,
  edgeColorStart: vec4<f32>,
  edgeColorEnd: vec4<f32>,
  edgeWidthRaw: vec2<f32>,
  edgeOpacityRaw: vec2<f32>,
  edgeEndpointSizeRaw: vec2<f32>,
  _pad2: vec2<f32>,
  edgeTrim: vec4<f32>, // edgeTrim.x used, rest padding
  nodeNoStateScale: vec4<f32>, // x=sizeMul y=opacityMul z=outlineMul w=discard(>0.5)
  nodeNoStateColorMul: vec4<f32>,
  nodeNoStateColorAdd: vec4<f32>,
  edgeNoStateScale: vec4<f32>, // x=widthMul y=opacityMul w=discard(>0.5)
  edgeNoStateColorMul: vec4<f32>,
  edgeNoStateColorAdd: vec4<f32>,
  nodeStateScale: array<vec4<f32>, ${STATE_SLOTS}>,
  nodeStateColorMul: array<vec4<f32>, ${STATE_SLOTS}>,
  nodeStateColorAdd: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateScale: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateColorMul: array<vec4<f32>, ${STATE_SLOTS}>,
  edgeStateColorAdd: array<vec4<f32>, ${STATE_SLOTS}>,
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

struct EdgeStates {
  data: array<u32>,
};

	struct EdgeEndpointStates {
	  data: array<vec2<u32>>,
	};

	struct Hover {
	  nodeIndex: u32,
	  nodeState: u32,
	  edgeIndex: u32,
	  edgeState: u32,
	};

	@group(0) @binding(0) var<uniform> camera : Camera;
	@group(0) @binding(1) var<storage, read> edgeIndices : EdgeIndices;
	@group(0) @binding(2) var<storage, read> edgeSegments : EdgeSegments;
	@group(0) @binding(3) var<storage, read> edgeColors : EdgeColors;
	@group(0) @binding(4) var<storage, read> edgeWidths : EdgeWidths;
@group(0) @binding(5) var<storage, read> edgeEndpointSizes : EdgeEndpointSizes;
	@group(0) @binding(6) var<storage, read> edgeOpacities : EdgeOpacities;
	@group(0) @binding(7) var<storage, read> edgeStates : EdgeStates;
	@group(0) @binding(8) var<storage, read> edgeEndpointStates : EdgeEndpointStates;
	@group(0) @binding(9) var<uniform> globals : Globals;
	@group(0) @binding(10) var<uniform> hover : Hover;

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
  @location(1) @interpolate(flat) discardFlag : u32,
};

@vertex
fn edgeVertex(@builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  let edgeSlot = vertexIndex / 2u;
  var edgeId = edgeSlot;
  if (USE_EDGE_INDICES) {
    edgeId = edgeIndices.data[edgeSlot];
  }
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
	  var state = edgeStates.data[edgeId];
	  if (hover.edgeIndex != 0xffffffffu && edgeId == hover.edgeIndex) {
	    state = state | hover.edgeState;
	  }
	  var widthMul = 1.0;
	  var opacityMul = 1.0;
	  var rgbMul = vec3<f32>(1.0, 1.0, 1.0);
	  var rgbAdd = vec3<f32>(0.0, 0.0, 0.0);
	  var discardFlag = 0u;
  if (state == 0u) {
    let scale = globals.edgeNoStateScale;
    widthMul = widthMul * scale.x;
    opacityMul = opacityMul * scale.y;
    rgbMul = rgbMul * globals.edgeNoStateColorMul.rgb;
    rgbAdd = rgbAdd + globals.edgeNoStateColorAdd.rgb;
    discardFlag = select(0u, 1u, scale.w > 0.5);
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let enabled = (state >> i) & 1u;
      if (enabled == 1u) {
        let scale = globals.edgeStateScale[i];
        widthMul = widthMul * scale.x;
        opacityMul = opacityMul * scale.y;
        rgbMul = rgbMul * globals.edgeStateColorMul[i].rgb;
        rgbAdd = rgbAdd + globals.edgeStateColorAdd[i].rgb;
        if (scale.w > 0.5) {
          discardFlag = 1u;
        }
      }
    }
  }

  let endpointSize = select(globals.edgeEndpointSizeRaw, edgeEndpointSizes.data[edgeId], USE_EDGE_ENDPOINT_SIZE_BUFFER);
  let endpointState = edgeEndpointStates.data[edgeId];
  var startSizeMul = 1.0;
  var endSizeMul = 1.0;
  if (endpointState.x == 0u) {
    startSizeMul = startSizeMul * globals.nodeNoStateScale.x;
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let slotMul = globals.nodeStateScale[i].x;
      if (((endpointState.x >> i) & 1u) == 1u) {
        startSizeMul = startSizeMul * slotMul;
      }
    }
  }
  if (endpointState.y == 0u) {
    endSizeMul = endSizeMul * globals.nodeNoStateScale.x;
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let slotMul = globals.nodeStateScale[i].x;
      if (((endpointState.y >> i) & 1u) == 1u) {
        endSizeMul = endSizeMul * slotMul;
      }
    }
  }
  let dirRaw = endPos - startPos;
  let dirLen = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLen);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.x, 0.0) * 0.5 * startSizeMul;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.y, 0.0) * 0.5 * endSizeMul;
  let trimStart = startRadius * globals.edgeTrim.x;
  let trimEnd = endRadius * globals.edgeTrim.x;
  startPos = startPos + dir * trimStart;
  endPos = endPos - dir * trimEnd;
  var position = startPos;
  if ((vertexIndex & 1u) == 1u) {
    position = endPos;
  }
  let colorStart = select(globals.edgeColorStart, edgeColors.data[edgeId * 2u], USE_EDGE_COLOR_BUFFER);
  let colorEnd = select(globals.edgeColorEnd, edgeColors.data[edgeId * 2u + 1u], USE_EDGE_COLOR_BUFFER);
  let endpointWidth = select(globals.edgeWidthRaw, edgeWidths.data[edgeId], USE_EDGE_WIDTH_BUFFER);
  let opacityPair = select(globals.edgeOpacityRaw, edgeOpacities.data[edgeId], USE_EDGE_OPACITY_BUFFER);
  let color = select(colorStart, colorEnd, (vertexIndex & 1u) == 1u);
  let width = (globals.edgeWidth.x + globals.edgeWidth.y * select(endpointWidth.x, endpointWidth.y, (vertexIndex & 1u) == 1u)) * widthMul;
  let attrOpacity = select(opacityPair.x, opacityPair.y, (vertexIndex & 1u) == 1u);
  let opacity = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * attrOpacity, 0.0, 1.0) * opacityMul;
  let rgb = clamp(color.rgb * rgbMul + rgbAdd, vec3<f32>(0.0), vec3<f32>(1.0));
  let alpha = clamp(opacity * color.a, 0.0, 1.0);
  var output : EdgeVertexOutput;
  output.position = camera.viewProjection * vec4<f32>(position, 1.0);
  output.color = vec4<f32>(rgb, alpha);
  output.discardFlag = discardFlag;
  return output;
}

struct EdgeQuadInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

@vertex
fn edgeQuadVertex(input : EdgeQuadInput) -> EdgeVertexOutput {
  var edgeId = input.instance;
  if (USE_EDGE_INDICES) {
    edgeId = edgeIndices.data[input.instance];
  }
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
	  var state = edgeStates.data[edgeId];
	  if (hover.edgeIndex != 0xffffffffu && edgeId == hover.edgeIndex) {
	    state = state | hover.edgeState;
	  }
	  var widthMul = 1.0;
	  var opacityMul = 1.0;
	  var rgbMul = vec3<f32>(1.0, 1.0, 1.0);
	  var rgbAdd = vec3<f32>(0.0, 0.0, 0.0);
	  var discardFlag = 0u;
  if (state == 0u) {
    let scale = globals.edgeNoStateScale;
    widthMul = widthMul * scale.x;
    opacityMul = opacityMul * scale.y;
    rgbMul = rgbMul * globals.edgeNoStateColorMul.rgb;
    rgbAdd = rgbAdd + globals.edgeNoStateColorAdd.rgb;
    discardFlag = select(0u, 1u, scale.w > 0.5);
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let enabled = (state >> i) & 1u;
      if (enabled == 1u) {
        let scale = globals.edgeStateScale[i];
        widthMul = widthMul * scale.x;
        opacityMul = opacityMul * scale.y;
        rgbMul = rgbMul * globals.edgeStateColorMul[i].rgb;
        rgbAdd = rgbAdd + globals.edgeStateColorAdd[i].rgb;
        if (scale.w > 0.5) {
          discardFlag = 1u;
        }
      }
    }
  }

  let endpointSize = select(globals.edgeEndpointSizeRaw, edgeEndpointSizes.data[edgeId], USE_EDGE_ENDPOINT_SIZE_BUFFER);
  let endpointWidth = select(globals.edgeWidthRaw, edgeWidths.data[edgeId], USE_EDGE_WIDTH_BUFFER);
  let opacityPair = select(globals.edgeOpacityRaw, edgeOpacities.data[edgeId], USE_EDGE_OPACITY_BUFFER);
  let endpointState = edgeEndpointStates.data[edgeId];
  var startSizeMul = 1.0;
  var endSizeMul = 1.0;
  if (endpointState.x == 0u) {
    startSizeMul = startSizeMul * globals.nodeNoStateScale.x;
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let slotMul = globals.nodeStateScale[i].x;
      if (((endpointState.x >> i) & 1u) == 1u) {
        startSizeMul = startSizeMul * slotMul;
      }
    }
  }
  if (endpointState.y == 0u) {
    endSizeMul = endSizeMul * globals.nodeNoStateScale.x;
  } else {
    for (var i = 0u; i < ${STATE_SLOTS}u; i = i + 1u) {
      let slotMul = globals.nodeStateScale[i].x;
      if (((endpointState.y >> i) & 1u) == 1u) {
        endSizeMul = endSizeMul * slotMul;
      }
    }
  }
  let t = clamp(input.corner.x, 0.0, 1.0);
  let width = max((globals.edgeWidth.x + globals.edgeWidth.y * mix(endpointWidth.x, endpointWidth.y, t)) * widthMul, 1e-3);
  let dirRaw = endPos - startPos;
  let dirLenWorld = max(length(dirRaw), 1e-5);
  let dir = dirRaw / vec3<f32>(dirLenWorld);
  let startRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.x, 0.0) * 0.5 * startSizeMul;
  let endRadius = max(globals.nodeSize.x + globals.nodeSize.y * endpointSize.y, 0.0) * 0.5 * endSizeMul;
  let trimStart = startRadius * globals.edgeTrim.x;
  let trimEnd = endRadius * globals.edgeTrim.x;
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
  let colorStart = select(globals.edgeColorStart, edgeColors.data[edgeId * 2u], USE_EDGE_COLOR_BUFFER);
  let colorEnd = select(globals.edgeColorEnd, edgeColors.data[edgeId * 2u + 1u], USE_EDGE_COLOR_BUFFER);
  let blended = mix(colorStart, colorEnd, t);
  let blendedOpacity = mix(opacityPair.x, opacityPair.y, t);
  let opacity = clamp(globals.edgeOpacity.x + globals.edgeOpacity.y * blendedOpacity, 0.0, 1.0) * opacityMul;
  let alpha = clamp(opacity * blended.a, 0.0, 1.0);
  let rgb = clamp(blended.rgb * rgbMul + rgbAdd, vec3<f32>(0.0), vec3<f32>(1.0));
  output.color = vec4<f32>(rgb, alpha);
  output.discardFlag = discardFlag;
  return output;
}

@fragment
fn edgeFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  if (input.discardFlag == 1u) {
    discard;
  }
  return vec4<f32>(input.color.rgb, input.color.a);
}

@fragment
fn edgePremulFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  if (input.discardFlag == 1u) {
    discard;
  }
  return vec4<f32>(input.color.rgb * input.color.a, input.color.a);
}
`;

  const EDGE_WEIGHTED_WGSL = /* wgsl */ `
${EDGE_WGSL}

struct EdgeWeightedOutput {
  @location(0) colorAccum : vec4<f32>,
  @location(1) weightAccum : vec4<f32>,
};

@fragment
fn edgeWeightedFragment(input : EdgeVertexOutput) -> EdgeWeightedOutput {
  if (input.discardFlag == 1u) {
    discard;
  }
  let weight = input.color.a;
  var output : EdgeWeightedOutput;
  output.colorAccum = vec4<f32>(input.color.rgb * weight, weight);
  output.weightAccum = vec4<f32>(weight, 0.0, 0.0, 0.0);
  return output;
}`;

  return {
    NODE_WGSL,
    EDGE_WGSL,
    EDGE_WEIGHTED_WGSL,
  };
}

const EDGE_WEIGHTED_RESOLVE_SHARED_WGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VertexOut {
  var output : VertexOut;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}

@group(0) @binding(0) var textureSampler : sampler;
@group(0) @binding(1) var colorTexture : texture_2d<f32>;
@group(0) @binding(2) var weightTexture : texture_2d<f32>;

fn resolveWeighted(uv : vec2<f32>) -> vec4<f32> {
  // Render targets in WebGPU are addressed with a top-left origin, so the
  // fullscreen quad UVs must flip Y to match clip-space rasterization.
  let uvFlipped = vec2<f32>(uv.x, 1.0 - uv.y);
  let accum = textureSample(colorTexture, textureSampler, uvFlipped).rgb;
  let weight = textureSample(weightTexture, textureSampler, uvFlipped).r;
  let denom = max(weight, 1e-4);
  let resolved = accum / vec3<f32>(denom);
  let alpha = clamp(weight, 0.0, 1.0);
  return vec4<f32>(resolved * alpha, alpha);
}
`;

export const EDGE_WEIGHTED_RESOLVE_WGSL = /* wgsl */ `
${EDGE_WEIGHTED_RESOLVE_SHARED_WGSL}

@fragment
fn fs(input : VertexOut) -> @location(0) vec4<f32> {
  return resolveWeighted(input.uv);
}`;

export function createEdgeWeightedResolveTonemapWGSL(options) {
  const boost = options === 'boost' || options?.boost === true;
  if (boost) {
    return /* wgsl */ `
${EDGE_WEIGHTED_RESOLVE_SHARED_WGSL}

@fragment
fn fs(input : VertexOut) -> @location(0) vec4<f32> {
  let base = resolveWeighted(input.uv);
  let alpha = base.a;
  let unpremul = base.rgb / vec3<f32>(max(alpha, 1e-4));
  let boost = clamp(alpha, 0.0, 4.0);
  let boosted = unpremul * boost;
  let tonemapped = boosted / (boosted + vec3<f32>(1.0));
  return vec4<f32>(tonemapped * alpha, alpha);
}`;
  }
  return /* wgsl */ `
${EDGE_WEIGHTED_RESOLVE_SHARED_WGSL}

@fragment
fn fs(input : VertexOut) -> @location(0) vec4<f32> {
  let base = resolveWeighted(input.uv);
  let alpha = base.a;
  let unpremul = base.rgb / vec3<f32>(max(alpha, 1e-4));
  let tonemapped = unpremul / (unpremul + vec3<f32>(1.0));
  return vec4<f32>(tonemapped * alpha, alpha);
}`;
}
