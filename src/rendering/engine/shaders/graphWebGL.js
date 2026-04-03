function resolveNodeOptions(options = {}) {
  const node = options?.node && typeof options.node === 'object' ? options.node : {};
  const mode = (value) => (value === 'uniform' ? 'uniform' : 'buffer');
  return {
    color: mode(node.color),
    size: mode(node.size),
    outline: mode(node.outline),
    outlineColor: mode(node.outlineColor),
  };
}

function resolveEdgeOptions(options = {}) {
  const edge = options?.edge && typeof options.edge === 'object' ? options.edge : {};
  const channel = (entry, fallbackSource = 'edge') => ({
    mode: entry?.mode === 'uniform' ? 'uniform' : 'buffer',
    source: entry?.source === 'node' ? 'node' : fallbackSource,
    endpoints: (entry?.endpoints === 'source' || entry?.endpoints === 'from')
      ? 'source'
      : ((entry?.endpoints === 'destination' || entry?.endpoints === 'target' || entry?.endpoints === 'to')
        ? 'destination'
        : 'both'),
  });
  return {
    color: channel(edge.color, 'edge'),
    width: channel(edge.width, 'edge'),
    opacity: channel(edge.opacity, 'edge'),
    endpointSize: channel(edge.endpointSize, 'edge'),
    fastPath: edge.fastPath === true,
    cameraMode: edge.cameraMode === '2d' ? '2d' : (edge.cameraMode === '3d' ? '3d' : 'dynamic'),
    semanticZoom: edge.semanticZoom !== false,
    trim: edge.trim !== false,
    edgeState: edge.edgeState !== false,
    endpointState: edge.endpointState !== false,
    propagateHoveredNodeToEdges: edge.propagateHoveredNodeToEdges === true,
    propagateSelectedNodesToEdges: edge.propagateSelectedNodesToEdges === true,
  };
}

export function createGraphWebGLSources(options = {}) {
  const node = resolveNodeOptions(options);
  const edge = resolveEdgeOptions(options);
  const stateSlots = Math.max(1, Math.min(32, Number(options?.stateSlots) || 4));
  const forceVisibilityBoost = 1000.0;

  const nodeColorBuffer = node.color !== 'uniform';
  const nodeSizeBuffer = node.size !== 'uniform';
  const nodeOutlineBuffer = node.outline !== 'uniform';
  const nodeOutlineColorBuffer = node.outlineColor !== 'uniform';

  const edgeColorSourceNode = edge.color.source === 'node';
  const edgeWidthSourceNode = edge.width.source === 'node';
  const edgeOpacitySourceNode = edge.opacity.source === 'node';
  const edgeEndpointSizeSourceNode = edge.endpointSize.source === 'node';
  const edgeColorBuffer = edge.color.mode !== 'uniform' && !edgeColorSourceNode;
  const edgeWidthBuffer = edge.width.mode !== 'uniform' && !edgeWidthSourceNode;
  const edgeOpacityBuffer = edge.opacity.mode !== 'uniform' && !edgeOpacitySourceNode;
  const edgeEndpointSizeBuffer = edge.endpointSize.mode !== 'uniform' && !edgeEndpointSizeSourceNode;

  const edgeColorEndpoints = edge.color.endpoints === 'source' ? 1 : (edge.color.endpoints === 'destination' ? 2 : 0);
  const edgeWidthEndpoints = edge.width.endpoints === 'source' ? 1 : (edge.width.endpoints === 'destination' ? 2 : 0);
  const edgeOpacityEndpoints = edge.opacity.endpoints === 'source' ? 1 : (edge.opacity.endpoints === 'destination' ? 2 : 0);
  const edgeEndpointSizeEndpoints = edge.endpointSize.endpoints === 'source'
    ? 1
    : (edge.endpointSize.endpoints === 'destination' ? 2 : 0);
  const fastEdgePath = edge.fastPath === true;
  const edgeCameraMode = edge.cameraMode;
  const edgeSemanticZoomEnabled = !fastEdgePath && edge.semanticZoom === true;
  const edgeTrimEnabled = !fastEdgePath && edge.trim === true;
  const edgeStateEnabled = !fastEdgePath && edge.edgeState === true;
  const edgeEndpointStateEnabled = !fastEdgePath
    && (edge.endpointState === true || edge.propagateSelectedNodesToEdges === true)
    && (edgeTrimEnabled || edge.propagateSelectedNodesToEdges === true);

  const nodeColorDecl = nodeColorBuffer
    ? `
uniform sampler2D u_nodeColors;
uniform int u_hasNodeColors;`
    : '';
  const nodeSizeDecl = nodeSizeBuffer
    ? `
uniform sampler2D u_nodeSizes;
uniform int u_hasNodeSizes;`
    : '';
  const nodeOutlineDecl = nodeOutlineBuffer
    ? `
uniform sampler2D u_nodeOutlineWidths;
uniform int u_hasNodeOutlineWidths;`
    : '';
  const nodeOutlineColorDecl = nodeOutlineColorBuffer
    ? `
uniform sampler2D u_nodeOutlineColors;
uniform int u_hasNodeOutlineColors;`
    : '';

const nodeFetchColor = nodeColorBuffer
    ? `
vec4 fetchNodeColor(uint id) {
  if (u_hasNodeColors == 0) return u_defaultNodeColor;
  return texelFetch(u_nodeColors, textureCoord(u_nodeColors, id), 0);
}`
    : `
vec4 fetchNodeColor(uint id) {
  return u_defaultNodeColor;
}`;

  const nodeFetchSize = nodeSizeBuffer
    ? `
float fetchNodeSize(uint id) {
  if (u_hasNodeSizes == 0) return u_defaultNodeSize;
  return texelFetch(u_nodeSizes, textureCoord(u_nodeSizes, id), 0).x;
}`
    : `
float fetchNodeSize(uint id) {
  return u_defaultNodeSize;
}`;

  const nodeFetchOutline = nodeOutlineBuffer
    ? `
float fetchNodeOutlineWidth(uint id) {
  if (u_hasNodeOutlineWidths == 0) return u_nodeOutline;
  return texelFetch(u_nodeOutlineWidths, textureCoord(u_nodeOutlineWidths, id), 0).x;
}`
    : `
float fetchNodeOutlineWidth(uint id) {
  return u_nodeOutline;
}`;

  const nodeFetchOutlineColor = nodeOutlineColorBuffer
    ? `
vec4 fetchNodeOutlineColor(uint id) {
  if (u_hasNodeOutlineColors == 0) return u_outlineColor;
  return texelFetch(u_nodeOutlineColors, textureCoord(u_nodeOutlineColors, id), 0);
}`
    : `
vec4 fetchNodeOutlineColor(uint id) {
  return u_outlineColor;
}`;

  const nodeFetchState = `
uint fetchNodeState(uint id) {
  if (u_hasNodeStates == 0) return 0u;
  return texelFetch(u_nodeStates, textureCoord(u_nodeStates, id), 0).x;
}`;

  const edgeColorDecl = edgeColorBuffer
    ? `
uniform sampler2D u_edgeColors;
uniform int u_hasEdgeColors;`
    : '';
  const edgeOpacityDecl = edgeOpacityBuffer
    ? `
uniform sampler2D u_edgeOpacities;
uniform int u_hasEdgeOpacities;`
    : '';
  const edgeWidthDecl = edgeWidthBuffer
    ? `
uniform sampler2D u_edgeWidths;
uniform int u_hasEdgeWidths;`
    : '';
  const edgeEndpointSizeDecl = edgeEndpointSizeBuffer
    ? `
uniform sampler2D u_edgeEndpointSizes;
uniform int u_hasEdgeEndpointSizes;`
    : '';

  const edgeFetchColor = edgeColorBuffer
    ? `
vec4 fetchEdgeColor(uint id, bool target) {
  if (u_hasEdgeColors == 0) return target ? u_defaultEdgeColorEnd : u_defaultEdgeColorStart;
  int offset = int(id) * 2 + (target ? 1 : 0);
  return texelFetch(u_edgeColors, textureCoord(u_edgeColors, uint(offset)), 0);
}`
    : `
vec4 fetchEdgeColor(uint id, bool target) {
  return target ? u_defaultEdgeColorEnd : u_defaultEdgeColorStart;
}`;

  const edgeFetchOpacity = edgeOpacityBuffer
    ? `
vec2 fetchEdgeOpacityPair(uint edgeId) {
  if (u_hasEdgeOpacities == 0) return u_defaultEdgeOpacity;
  return texelFetch(u_edgeOpacities, textureCoord(u_edgeOpacities, edgeId), 0).xy;
}`
    : `
vec2 fetchEdgeOpacityPair(uint edgeId) {
  return u_defaultEdgeOpacity;
}`;

  const edgeFetchWidth = edgeWidthBuffer
    ? `
vec2 fetchEdgeWidthPair(uint edgeId) {
  if (u_hasEdgeWidths == 0) return u_defaultEdgeWidth;
  return texelFetch(u_edgeWidths, textureCoord(u_edgeWidths, edgeId), 0).xy;
}`
    : `
vec2 fetchEdgeWidthPair(uint edgeId) {
  return u_defaultEdgeWidth;
}`;

  const edgeFetchEndpointSize = edgeEndpointSizeBuffer
    ? `
vec2 fetchEdgeEndpointSizePair(uint edgeId) {
  if (u_hasEdgeEndpointSizes == 0) return u_defaultEdgeEndpointSize;
  return texelFetch(u_edgeEndpointSizes, textureCoord(u_edgeEndpointSizes, edgeId), 0).xy;
}`
    : `
vec2 fetchEdgeEndpointSizePair(uint edgeId) {
  return u_defaultEdgeEndpointSize;
}`;

  const edgeColorNodeBlock = edgeColorSourceNode
    ? `
  vec4 nodeSourceColor = fetchNodeColor(sourceId);
  vec4 nodeTargetColor = fetchNodeColor(targetId);
  if (${edgeColorEndpoints} == 1) {
    sourceColor = nodeSourceColor;
    targetColor = nodeSourceColor;
  } else if (${edgeColorEndpoints} == 2) {
    sourceColor = nodeTargetColor;
    targetColor = nodeTargetColor;
  } else {
    sourceColor = nodeSourceColor;
    targetColor = nodeTargetColor;
  }`
    : '';

  const TEXTURE_INDEX_HELPERS = `
ivec2 textureCoord(sampler2D tex, uint index) {
  ivec2 size = textureSize(tex, 0);
  int width = max(size.x, 1);
  int i = int(index);
  return ivec2(i % width, i / width);
}

ivec2 textureCoord(usampler2D tex, uint index) {
  ivec2 size = textureSize(tex, 0);
  int width = max(size.x, 1);
  int i = int(index);
  return ivec2(i % width, i / width);
}`;

  const edgeStateUniformDecl = edgeStateEnabled
    ? `
uniform usampler2D u_edgeStates;
uniform int u_hasEdgeStates;
uniform uint u_hoverEdgeIndex;
uniform uint u_hoverEdgeState;
${edge.propagateHoveredNodeToEdges ? 'uniform uint u_hoverNodeIndex;\n' : ''}uniform uint u_edgeStateForceMaxAlphaMask;
uniform vec4 u_edgeNoStateScale;
uniform vec4 u_edgeNoStateColorMul;
uniform vec4 u_edgeNoStateColorAdd;
uniform vec4 u_edgeStateScale[${stateSlots}];
uniform vec4 u_edgeStateColorMul[${stateSlots}];
uniform vec4 u_edgeStateColorAdd[${stateSlots}];`
    : '';

  const edgeStateFetch = edgeStateEnabled
    ? `
uint fetchEdgeState(uint id) {
  if (u_hasEdgeStates == 0) return 0u;
  return texelFetch(u_edgeStates, textureCoord(u_edgeStates, id), 0).x;
}`
    : '';

  const edgeLineStateBlock = edgeStateEnabled
    ? `
  uint state = fetchEdgeState(a_edgeId);
  uvec2 endpointStatePair = ${edgeEndpointStateEnabled ? 'fetchEdgeEndpointStatePair(a_edgeId)' : 'uvec2(0u, 0u)'};
  if (u_hoverEdgeIndex != 4294967295u && a_edgeId == u_hoverEdgeIndex) {
    state |= u_hoverEdgeState;
  }
  ${edge.propagateHoveredNodeToEdges
    ? `
  if (u_hoverNodeIndex != 4294967295u && (sourceId == u_hoverNodeIndex || targetId == u_hoverNodeIndex)) {
    state |= 4u;
  }`
    : ''}
  ${edge.propagateSelectedNodesToEdges
    ? `
  if (((endpointStatePair.x | endpointStatePair.y) & 2u) != 0u) {
    state |= 2u;
  }`
    : ''}
  bool forceMaxAlpha = (state & u_edgeStateForceMaxAlphaMask) != 0u;
  float opacityMul = 1.0;
  vec3 rgbMul = vec3(1.0);
  vec3 rgbAdd = vec3(0.0);
  uint discardFlag = 0u;
  if (state == 0u) {
    vec4 scale = u_edgeNoStateScale;
    opacityMul *= scale.y;
    rgbMul *= u_edgeNoStateColorMul.rgb;
    rgbAdd += u_edgeNoStateColorAdd.rgb;
    discardFlag = uint(scale.w > 0.5);
  } else {
    for (int i = 0; i < ${stateSlots}; i += 1) {
      float enabled = float((state >> uint(i)) & 1u);
      vec4 scale = u_edgeStateScale[i];
      opacityMul *= mix(1.0, scale.y, enabled);
      rgbMul *= mix(vec3(1.0), u_edgeStateColorMul[i].rgb, enabled);
      rgbAdd += u_edgeStateColorAdd[i].rgb * enabled;
      discardFlag |= uint((scale.w > 0.5) && (enabled > 0.5));
    }
  }`
    : `
  bool forceMaxAlpha = false;
  float opacityMul = 1.0;
  vec3 rgbMul = vec3(1.0);
  vec3 rgbAdd = vec3(0.0);
  uint discardFlag = 0u;`;

  const edgeQuadStateBlock = edgeStateEnabled
    ? `
  uint state = fetchEdgeState(a_edgeId);
  uvec2 endpointStatePair = ${edgeEndpointStateEnabled ? 'fetchEdgeEndpointStatePair(a_edgeId)' : 'uvec2(0u, 0u)'};
  if (u_hoverEdgeIndex != 4294967295u && a_edgeId == u_hoverEdgeIndex) {
    state |= u_hoverEdgeState;
  }
  ${edge.propagateHoveredNodeToEdges
    ? `
  if (u_hoverNodeIndex != 4294967295u && (sourceId == u_hoverNodeIndex || targetId == u_hoverNodeIndex)) {
    state |= 4u;
  }`
    : ''}
  ${edge.propagateSelectedNodesToEdges
    ? `
  if (((endpointStatePair.x | endpointStatePair.y) & 2u) != 0u) {
    state |= 2u;
  }`
    : ''}
  bool forceMaxAlpha = (state & u_edgeStateForceMaxAlphaMask) != 0u;
  float widthMul = 1.0;
  float opacityMul = 1.0;
  vec3 rgbMul = vec3(1.0);
  vec3 rgbAdd = vec3(0.0);
  uint discardFlag = 0u;
  if (state == 0u) {
    vec4 scale = u_edgeNoStateScale;
    widthMul *= scale.x;
    opacityMul *= scale.y;
    rgbMul *= u_edgeNoStateColorMul.rgb;
    rgbAdd += u_edgeNoStateColorAdd.rgb;
    discardFlag = uint(scale.w > 0.5);
  } else {
    for (int i = 0; i < ${stateSlots}; i += 1) {
      float enabled = float((state >> uint(i)) & 1u);
      vec4 scale = u_edgeStateScale[i];
      widthMul *= mix(1.0, scale.x, enabled);
      opacityMul *= mix(1.0, scale.y, enabled);
      rgbMul *= mix(vec3(1.0), u_edgeStateColorMul[i].rgb, enabled);
      rgbAdd += u_edgeStateColorAdd[i].rgb * enabled;
      discardFlag |= uint((scale.w > 0.5) && (enabled > 0.5));
    }
  }`
    : `
  bool forceMaxAlpha = false;
  float widthMul = 1.0;
  float opacityMul = 1.0;
  vec3 rgbMul = vec3(1.0);
  vec3 rgbAdd = vec3(0.0);
  uint discardFlag = 0u;`;

  const edgeEndpointStateUniformDecl = edgeEndpointStateEnabled
    ? `
uniform usampler2D u_edgeEndpointStates;
uniform int u_hasEdgeEndpointStates;
uniform vec4 u_nodeNoStateScale;
uniform vec4 u_nodeStateScale[${stateSlots}];`
    : '';

  const edgeEndpointStateFetch = edgeEndpointStateEnabled
    ? `
uvec2 fetchEdgeEndpointStatePair(uint edgeId) {
  if (u_hasEdgeEndpointStates == 0) return uvec2(0u, 0u);
  return texelFetch(u_edgeEndpointStates, textureCoord(u_edgeEndpointStates, edgeId), 0).xy;
}`
    : '';

  const edgeTrimBlock = edgeTrimEnabled
    ? `
  uvec2 endpointStatePair = ${edgeEndpointStateEnabled ? 'fetchEdgeEndpointStatePair(a_edgeId)' : 'uvec2(0u, 0u)'};
  float startSizeMul = 1.0;
  float endSizeMul = 1.0;
  ${edgeEndpointStateEnabled
    ? `
  if (endpointStatePair.x == 0u) {
    startSizeMul *= u_nodeNoStateScale.x;
  } else {
    for (int i = 0; i < ${stateSlots}; i += 1) {
      float enabledStart = float((endpointStatePair.x >> uint(i)) & 1u);
      float slotMul = u_nodeStateScale[i].x;
      startSizeMul *= mix(1.0, slotMul, enabledStart);
    }
  }
  if (endpointStatePair.y == 0u) {
    endSizeMul *= u_nodeNoStateScale.x;
  } else {
    for (int i = 0; i < ${stateSlots}; i += 1) {
      float enabledEnd = float((endpointStatePair.y >> uint(i)) & 1u);
      float slotMul = u_nodeStateScale[i].x;
      endSizeMul *= mix(1.0, slotMul, enabledEnd);
    }
  }`
    : ''}

  vec2 endpointSizePair = ${edgeEndpointSizeSourceNode
    ? `resolveNodePair(
      u_nodeEndpointSizeSource,
      sourceId,
      targetId,
      u_hasNodeEndpointSizeSource,
      ${edgeEndpointSizeEndpoints},
      u_defaultNodeEndpointSizeSource
    )`
    : 'fetchEdgeEndpointSizePair(a_edgeId)'};
  float semanticScale = ${(!edgeSemanticZoomEnabled || edgeCameraMode === '3d')
    ? '1.0'
    : (edgeCameraMode === '2d'
      ? '((u_semanticZoomExponent > 0.0) ? (1.0 / pow(max(u_zoom2D, 1e-3), u_semanticZoomExponent)) : 1.0)'
      : '((u_is2D == 1 && u_semanticZoomExponent > 0.0) ? (1.0 / pow(max(u_zoom2D, 1e-3), u_semanticZoomExponent)) : 1.0)')};
  float startRadius = max((u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.x) * startSizeMul, 0.0) * 0.5 * semanticScale;
  float endRadius = max((u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.y) * endSizeMul, 0.0) * 0.5 * semanticScale;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = sourcePos + dirN * trimStart;
  vec3 endPos = targetPos - dirN * trimEnd;
`
    : `
  float semanticScale = ${(!edgeSemanticZoomEnabled || edgeCameraMode === '3d')
    ? '1.0'
    : (edgeCameraMode === '2d'
      ? '((u_semanticZoomExponent > 0.0) ? (1.0 / pow(max(u_zoom2D, 1e-3), u_semanticZoomExponent)) : 1.0)'
      : '((u_is2D == 1 && u_semanticZoomExponent > 0.0) ? (1.0 / pow(max(u_zoom2D, 1e-3), u_semanticZoomExponent)) : 1.0)')};
  vec3 startPos = sourcePos;
  vec3 endPos = targetPos;
`;

  const edgeQuadWidthDirBlock = edgeCameraMode === '2d'
    ? `
  vec3 widthDir = normalize(vec3(-dirN.y, dirN.x, 0.0));`
    : (edgeCameraMode === '3d'
      ? `
  vec3 viewDir = u_cameraPosition - centerPos;
  float viewDirLen = length(viewDir);
  viewDir = viewDirLen > 1e-5 ? (viewDir / viewDirLen) : vec3(0.0, 0.0, 1.0);
  vec3 widthDir = cross(viewDir, dirN);
  float widthDirLen = length(widthDir);
  if (widthDirLen <= 1e-5) {
    vec3 cameraUp = normalize(u_cameraUp);
    widthDir = cross(cameraUp, dirN);
    widthDirLen = length(widthDir);
  }
  if (widthDirLen <= 1e-5) {
    vec3 cameraRight = normalize(u_cameraRight);
    widthDir = cross(dirN, cameraRight);
    widthDirLen = length(widthDir);
  }
  widthDir = widthDirLen > 1e-5 ? (widthDir / widthDirLen) : vec3(0.0, 1.0, 0.0);`
      : `
  vec3 widthDir;
  if (u_is2D == 1) {
    widthDir = normalize(vec3(-dirN.y, dirN.x, 0.0));
  } else {
    vec3 viewDir = u_cameraPosition - centerPos;
    float viewDirLen = length(viewDir);
    viewDir = viewDirLen > 1e-5 ? (viewDir / viewDirLen) : vec3(0.0, 0.0, 1.0);
    widthDir = cross(viewDir, dirN);
    float widthDirLen = length(widthDir);
    if (widthDirLen <= 1e-5) {
      vec3 cameraUp = normalize(u_cameraUp);
      widthDir = cross(cameraUp, dirN);
      widthDirLen = length(widthDir);
    }
    if (widthDirLen <= 1e-5) {
      vec3 cameraRight = normalize(u_cameraRight);
      widthDir = cross(dirN, cameraRight);
      widthDirLen = length(widthDir);
    }
    widthDir = widthDirLen > 1e-5 ? (widthDir / widthDirLen) : vec3(0.0, 1.0, 0.0);
  }`);

  const NODE_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

layout (location = 0) in vec2 a_corner;
layout (location = 1) in uint a_nodeId;

uniform mat4 u_viewProjection;
uniform sampler2D u_nodePositions;${nodeColorDecl}${nodeSizeDecl}${nodeOutlineDecl}${nodeOutlineColorDecl}
uniform sampler2D u_nodePositionsFrom;
uniform float u_nodeInterpolationFactor;
uniform int u_nodeInterpolationEnabled;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
uniform int u_is2D;
uniform float u_zoom2D;
uniform float u_semanticZoomExponent;
uniform vec4 u_defaultNodeColor;
uniform float u_defaultNodeSize;
uniform float u_nodeOpacityBase;
uniform float u_nodeOpacityScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_nodeOutline;
uniform float u_outlineWidthBase;
uniform float u_outlineWidthScale;
uniform vec4 u_outlineColor;
uniform usampler2D u_nodeStates;
uniform int u_hasNodeStates;
uniform uint u_hoverNodeIndex;
uniform uint u_hoverNodeState;
uniform uint u_nodeStateForceMaxAlphaMask;
uniform vec4 u_nodeNoStateScale;
uniform vec4 u_nodeNoStateColorMul;
uniform vec4 u_nodeNoStateColorAdd;
uniform vec4 u_nodeStateScale[${stateSlots}];
uniform vec4 u_nodeStateColorMul[${stateSlots}];
uniform vec4 u_nodeStateColorAdd[${stateSlots}];

out vec4 v_color;
out vec2 v_local;
out vec4 v_outlineColor;
out float v_outlineThreshold;
out vec3 v_centerWorld;
out vec3 v_rightWorld;
out vec3 v_upWorld;
out vec3 v_viewDir;
out float v_radius;
flat out uint v_discardFlag;
${TEXTURE_INDEX_HELPERS}

vec3 fetchNodePos(uint id) {
  vec3 toPos = texelFetch(u_nodePositions, textureCoord(u_nodePositions, id), 0).xyz;
  if (u_nodeInterpolationEnabled == 0) return toPos;
  vec3 fromPos = texelFetch(u_nodePositionsFrom, textureCoord(u_nodePositionsFrom, id), 0).xyz;
  float t = clamp(u_nodeInterpolationFactor, 0.0, 1.0);
  return mix(fromPos, toPos, t);
}
${nodeFetchColor}
${nodeFetchSize}
${nodeFetchOutline}
${nodeFetchOutlineColor}
${nodeFetchState}

void main() {
  uint state = fetchNodeState(a_nodeId);
  if (u_hoverNodeIndex != 4294967295u && a_nodeId == u_hoverNodeIndex) {
    state |= u_hoverNodeState;
  }
  bool forceMaxAlpha = (state & u_nodeStateForceMaxAlphaMask) != 0u;
  float sizeMul = 1.0;
  float opacityMul = 1.0;
  float outlineMul = 1.0;
  vec3 rgbMul = vec3(1.0);
  vec3 rgbAdd = vec3(0.0);
  uint discardFlag = 0u;
  if (state == 0u) {
    vec4 scale = u_nodeNoStateScale;
    sizeMul *= scale.x;
    opacityMul *= scale.y;
    outlineMul *= scale.z;
    rgbMul *= u_nodeNoStateColorMul.rgb;
    rgbAdd += u_nodeNoStateColorAdd.rgb;
    discardFlag = uint(scale.w > 0.5);
  } else {
    for (int i = 0; i < ${stateSlots}; i += 1) {
      float enabled = float((state >> uint(i)) & 1u);
      vec4 scale = u_nodeStateScale[i];
      sizeMul *= mix(1.0, scale.x, enabled);
      opacityMul *= mix(1.0, scale.y, enabled);
      outlineMul *= mix(1.0, scale.z, enabled);
      rgbMul *= mix(vec3(1.0), u_nodeStateColorMul[i].rgb, enabled);
      rgbAdd += u_nodeStateColorAdd[i].rgb * enabled;
      discardFlag |= uint((scale.w > 0.5) && (enabled > 0.5));
    }
  }
  v_discardFlag = discardFlag;

  vec3 position = fetchNodePos(a_nodeId);
  float semanticScale = (u_is2D == 1 && u_semanticZoomExponent > 0.0)
    ? (1.0 / pow(max(u_zoom2D, 1e-3), u_semanticZoomExponent))
    : 1.0;
  float rawSize = fetchNodeSize(a_nodeId);
  float baseSize = (u_nodeSizeBase + u_nodeSizeScale * rawSize) * sizeMul;
  float rawOutline = fetchNodeOutlineWidth(a_nodeId);
  float outlineWidth = max(0.0, (u_outlineWidthBase + u_outlineWidthScale * rawOutline) * outlineMul);
  float fullSize = (baseSize + outlineWidth) * semanticScale;
  float radius = max(1.0, fullSize) * 0.5;

  vec3 right = u_cameraRight;
  vec3 up = u_cameraUp;
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (u_is2D == 1) {
    right = normalize(right);
    up = normalize(up);
  } else {
    viewDir = u_cameraPosition - position;
    float viewLen = length(viewDir);
    viewDir = viewLen > 1e-5 ? viewDir / viewLen : vec3(0.0, 0.0, 1.0);
    right = u_cameraRight - viewDir * dot(u_cameraRight, viewDir);
    float rightLen = length(right);
    right = rightLen > 1e-5 ? right / rightLen : normalize(cross(u_cameraUp, viewDir));
    up = normalize(cross(viewDir, right));
  }

  vec3 world = position + (right * a_corner.x + up * a_corner.y) * radius;
  gl_Position = u_viewProjection * vec4(world, 1.0);

  vec4 baseColor = fetchNodeColor(a_nodeId);
  vec3 rgb = clamp(baseColor.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  float alpha = clamp(u_nodeOpacityBase + u_nodeOpacityScale * baseColor.a, 0.0, 1.0) * opacityMul;
  v_color = vec4(rgb, forceMaxAlpha ? 1.0 : clamp(alpha, 0.0, 1.0));

  vec4 outlineColorIn = fetchNodeOutlineColor(a_nodeId);
  float outlineAlpha = clamp(u_nodeOpacityBase + u_nodeOpacityScale * outlineColorIn.a, 0.0, 1.0) * opacityMul;
  v_outlineColor = vec4(outlineColorIn.rgb, forceMaxAlpha ? 1.0 : clamp(outlineAlpha, 0.0, 1.0));
  v_outlineThreshold = outlineWidth / max(fullSize, 1e-5);
  v_local = a_corner;
  v_centerWorld = position;
  v_rightWorld = right;
  v_upWorld = up;
  v_viewDir = viewDir;
  v_radius = radius;
}
`;

  const NODE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
precision highp int;

in vec4 v_color;
in vec2 v_local;
in vec4 v_outlineColor;
in float v_outlineThreshold;
in vec3 v_centerWorld;
in vec3 v_rightWorld;
in vec3 v_upWorld;
in vec3 v_viewDir;
in float v_radius;
flat in uint v_discardFlag;

uniform mat4 u_viewProjection;
uniform int u_is2D;

out vec4 fragColor;

void main() {
  if (v_discardFlag != 0u) {
    discard;
  }
  float dist = length(v_local);
  if (dist > 1.0) {
    discard;
  }
  fragColor = v_color;
  if (v_outlineThreshold > 0.0 && dist > (1.0 - v_outlineThreshold)) {
    fragColor = v_outlineColor;
  }
  if (u_is2D == 0) {
    float radius = v_radius;
    float xyLenSq = dot(v_local * radius, v_local * radius);
    float zOffset = sqrt(max(radius * radius - xyLenSq, 0.0));
    vec3 worldPos = v_centerWorld
      + (v_rightWorld * v_local.x + v_upWorld * v_local.y) * radius
      + normalize(v_viewDir) * zOffset;
    vec4 clip = u_viewProjection * vec4(worldPos, 1.0);
    float depth = clip.z / clip.w;
    gl_FragDepth = depth * 0.5 + 0.5;
  }
}
`;

  const EDGE_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

layout (location = 0) in uint a_edgeId;

uniform mat4 u_viewProjection;
uniform sampler2D u_nodePositions;
uniform sampler2D u_nodePositionsFrom;
uniform float u_nodeInterpolationFactor;
uniform int u_nodeInterpolationEnabled;
${edgeColorSourceNode ? 'uniform sampler2D u_nodeEdgeColors;\nuniform int u_hasNodeColors;' : ''}
${edgeOpacitySourceNode ? 'uniform sampler2D u_nodeOpacitySource;\nuniform int u_hasNodeOpacitySource;' : ''}${edgeColorDecl}${edgeOpacityDecl}
uniform usampler2D u_edgeEndpoints;
${edgeStateUniformDecl}
uniform vec4 u_defaultNodeEdgeColor;
uniform vec4 u_defaultEdgeColorStart;
uniform vec4 u_defaultEdgeColorEnd;
uniform vec2 u_defaultEdgeOpacity;
uniform vec2 u_defaultNodeOpacitySource;
uniform float u_edgeOpacityBase;
uniform float u_edgeOpacityScale;

out vec4 v_color;
out float v_weight;
flat out uint v_discardFlag;
${TEXTURE_INDEX_HELPERS}

vec3 fetchNodePos(uint id) {
  vec3 toPos = texelFetch(u_nodePositions, textureCoord(u_nodePositions, id), 0).xyz;
  if (u_nodeInterpolationEnabled == 0) return toPos;
  vec3 fromPos = texelFetch(u_nodePositionsFrom, textureCoord(u_nodePositionsFrom, id), 0).xyz;
  float t = clamp(u_nodeInterpolationFactor, 0.0, 1.0);
  return mix(fromPos, toPos, t);
}

${edgeStateFetch}

${edgeColorSourceNode ? `
vec4 fetchNodeColor(uint id) {
  if (u_hasNodeColors == 0) return u_defaultNodeEdgeColor;
  return texelFetch(u_nodeEdgeColors, textureCoord(u_nodeEdgeColors, id), 0);
}` : ''}

${edgeFetchColor}

${edgeOpacitySourceNode ? `
float fetchNodeOpacity(uint id, float fallbackValue) {
  if (u_hasNodeOpacitySource == 0) return fallbackValue;
  return texelFetch(u_nodeOpacitySource, textureCoord(u_nodeOpacitySource, id), 0).x;
}

vec2 resolveNodeOpacityPair(uint sourceId, uint targetId, int endpointsMode, vec2 fallbackPair) {
  float sourceValue = fetchNodeOpacity(sourceId, fallbackPair.x);
  float targetValue = fetchNodeOpacity(targetId, fallbackPair.y);
  if (endpointsMode == 1) return vec2(sourceValue, sourceValue);
  if (endpointsMode == 2) return vec2(targetValue, targetValue);
  return vec2(sourceValue, targetValue);
}` : ''}

${edgeFetchOpacity}

void main() {
  uvec2 endpoints = texelFetch(u_edgeEndpoints, textureCoord(u_edgeEndpoints, a_edgeId), 0).xy;
  uint sourceId = endpoints.x;
  uint targetId = endpoints.y;
${edgeLineStateBlock}
  uint nodeId = (gl_VertexID & 1) == 0 ? sourceId : targetId;
  vec3 pos = fetchNodePos(nodeId);
  gl_Position = u_viewProjection * vec4(pos, 1.0);

  vec4 sourceColor = fetchEdgeColor(a_edgeId, false);
  vec4 targetColor = fetchEdgeColor(a_edgeId, true);
${edgeColorNodeBlock}
  bool isTarget = (gl_VertexID & 1) == 1;
  vec4 baseColor = isTarget ? targetColor : sourceColor;
  vec2 opacityPair = ${edgeOpacitySourceNode
    ? `resolveNodeOpacityPair(sourceId, targetId, ${edgeOpacityEndpoints}, u_defaultNodeOpacitySource)`
    : 'fetchEdgeOpacityPair(a_edgeId)'};
  float rawOpacity = isTarget ? opacityPair.y : opacityPair.x;
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * rawOpacity, 0.0, 1.0);
  vec3 rgb = clamp(baseColor.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  float weight = max(baseColor.a * opacity * opacityMul, 0.0);
  float alpha = clamp(weight, 0.0, 1.0);
  v_color = vec4(rgb, forceMaxAlpha ? 1.0 : alpha);
  v_weight = forceMaxAlpha ? max(weight, ${forceVisibilityBoost.toFixed(1)}) : weight;
  v_discardFlag = discardFlag;
}
`;

  const EDGE_QUAD_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

layout (location = 0) in vec2 a_corner;
layout (location = 1) in uint a_edgeId;

uniform mat4 u_viewProjection;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
uniform int u_is2D;
uniform vec2 u_viewport;
uniform sampler2D u_nodePositions;
uniform sampler2D u_nodePositionsFrom;
uniform float u_nodeInterpolationFactor;
uniform int u_nodeInterpolationEnabled;
${edgeColorSourceNode ? 'uniform sampler2D u_nodeEdgeColors;\nuniform int u_hasNodeColors;' : ''}
${edgeWidthSourceNode ? 'uniform sampler2D u_nodeWidthSource;\nuniform int u_hasNodeWidthSource;' : ''}
${edgeOpacitySourceNode ? 'uniform sampler2D u_nodeOpacitySource;\nuniform int u_hasNodeOpacitySource;' : ''}
${edgeEndpointSizeSourceNode ? 'uniform sampler2D u_nodeEndpointSizeSource;\nuniform int u_hasNodeEndpointSizeSource;' : ''}${edgeColorDecl}${edgeWidthDecl}${edgeOpacityDecl}${edgeEndpointSizeDecl}
uniform usampler2D u_edgeEndpoints;
${edgeStateUniformDecl}
${edgeEndpointStateUniformDecl}
uniform vec4 u_defaultNodeEdgeColor;
uniform vec4 u_defaultEdgeColorStart;
uniform vec4 u_defaultEdgeColorEnd;
uniform vec2 u_defaultEdgeWidth;
uniform vec2 u_defaultNodeWidthSource;
uniform vec2 u_defaultEdgeOpacity;
uniform vec2 u_defaultNodeOpacitySource;
uniform vec2 u_defaultEdgeEndpointSize;
uniform vec2 u_defaultNodeEndpointSizeSource;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_edgeOpacityBase;
uniform float u_edgeOpacityScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;
uniform float u_zoom2D;
uniform float u_semanticZoomExponent;

out vec4 v_color;
out float v_weight;
flat out uint v_discardFlag;
${TEXTURE_INDEX_HELPERS}

vec3 fetchNodePos(uint id) {
  vec3 toPos = texelFetch(u_nodePositions, textureCoord(u_nodePositions, id), 0).xyz;
  if (u_nodeInterpolationEnabled == 0) return toPos;
  vec3 fromPos = texelFetch(u_nodePositionsFrom, textureCoord(u_nodePositionsFrom, id), 0).xyz;
  float t = clamp(u_nodeInterpolationFactor, 0.0, 1.0);
  return mix(fromPos, toPos, t);
}

${edgeStateFetch}
${edgeEndpointStateFetch}

${edgeColorSourceNode ? `
vec4 fetchNodeColor(uint id) {
  if (u_hasNodeColors == 0) return u_defaultNodeEdgeColor;
  return texelFetch(u_nodeEdgeColors, textureCoord(u_nodeEdgeColors, id), 0);
}` : ''}

${edgeFetchColor}

${edgeWidthSourceNode || edgeOpacitySourceNode || edgeEndpointSizeSourceNode ? `
float fetchNodeScalar(sampler2D sourceTex, uint nodeId, int hasSource, float fallbackValue) {
  if (hasSource == 0) return fallbackValue;
  return texelFetch(sourceTex, textureCoord(sourceTex, nodeId), 0).x;
}

vec2 resolveNodePair(
  sampler2D sourceTex,
  uint sourceId,
  uint targetId,
  int hasSource,
  int endpointsMode,
  vec2 fallbackPair
) {
  float sourceValue = fetchNodeScalar(sourceTex, sourceId, hasSource, fallbackPair.x);
  float targetValue = fetchNodeScalar(sourceTex, targetId, hasSource, fallbackPair.y);
  if (endpointsMode == 1) return vec2(sourceValue, sourceValue);
  if (endpointsMode == 2) return vec2(targetValue, targetValue);
  return vec2(sourceValue, targetValue);
}` : ''}

${edgeFetchWidth}
${edgeFetchOpacity}
${edgeFetchEndpointSize}

void main() {
  uvec2 endpoints = texelFetch(u_edgeEndpoints, textureCoord(u_edgeEndpoints, a_edgeId), 0).xy;
  uint sourceId = endpoints.x;
  uint targetId = endpoints.y;
${edgeQuadStateBlock}

  vec3 sourcePos = fetchNodePos(sourceId);
  vec3 targetPos = fetchNodePos(targetId);
  vec3 dir = targetPos - sourcePos;
  float dirLenWorld = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLenWorld;
${edgeTrimBlock}

  float segmentMix = clamp(a_corner.x, 0.0, 1.0);
  vec2 widthPair = ${edgeWidthSourceNode
    ? `resolveNodePair(
      u_nodeWidthSource,
      sourceId,
      targetId,
      u_hasNodeWidthSource,
      ${edgeWidthEndpoints},
      u_defaultNodeWidthSource
    )`
    : 'fetchEdgeWidthPair(a_edgeId)'};
  float rawWidth = mix(widthPair.x, widthPair.y, segmentMix);
  float width = max((u_edgeWidthBase + u_edgeWidthScale * rawWidth) * widthMul, 0.0) * semanticScale;
  float halfWidth = max(width, 1e-3) * 0.5;
  vec3 centerPos = mix(startPos, endPos, segmentMix);
${edgeQuadWidthDirBlock}
  vec3 worldPos = centerPos + widthDir * halfWidth * a_corner.y;
  gl_Position = u_viewProjection * vec4(worldPos, 1.0);

  vec4 sourceColor = fetchEdgeColor(a_edgeId, false);
  vec4 targetColor = fetchEdgeColor(a_edgeId, true);
${edgeColorNodeBlock}
  vec4 blendedColor = mix(sourceColor, targetColor, segmentMix);
  vec2 opacityPair = ${edgeOpacitySourceNode
    ? `resolveNodePair(
      u_nodeOpacitySource,
      sourceId,
      targetId,
      u_hasNodeOpacitySource,
      ${edgeOpacityEndpoints},
      u_defaultNodeOpacitySource
    )`
    : 'fetchEdgeOpacityPair(a_edgeId)'};
  float rawOpacity = mix(opacityPair.x, opacityPair.y, segmentMix);
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * rawOpacity, 0.0, 1.0);
  vec3 rgb = clamp(blendedColor.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  float weight = max(blendedColor.a * opacity * opacityMul, 0.0);
  float alpha = clamp(weight, 0.0, 1.0);
  v_color = vec4(rgb, forceMaxAlpha ? 1.0 : alpha);
  v_weight = forceMaxAlpha ? max(weight, ${forceVisibilityBoost.toFixed(1)}) : weight;
  v_discardFlag = discardFlag;
}
`;

  const EDGE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec4 v_color;
flat in uint v_discardFlag;
out vec4 fragColor;

void main() {
  if (v_discardFlag != 0u) {
    discard;
  }
  fragColor = v_color;
}
`;

  const EDGE_WEIGHTED_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec4 v_color;
in float v_weight;
flat in uint v_discardFlag;
layout (location = 0) out vec4 fragAccum;
layout (location = 1) out vec4 fragWeight;

void main() {
  if (v_discardFlag != 0u) {
    discard;
  }
  float weight = v_weight;
  fragAccum = vec4(v_color.rgb * weight, weight);
  fragWeight = vec4(weight, 0.0, 0.0, 0.0);
}
`;

  const EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE = EDGE_WEIGHTED_FRAGMENT_SOURCE;

  const EDGE_RESOLVE_VERTEX_SOURCE = `#version 300 es
layout (location = 0) in vec2 a_position;
layout (location = 1) in vec2 a_uv;
out vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}
`;

  const EDGE_RESOLVE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_colorAccum;
uniform sampler2D u_weightAccum;
out vec4 fragColor;

void main() {
  vec3 accum = texture(u_colorAccum, v_uv).rgb;
  float weight = texture(u_weightAccum, v_uv).r;
  float denom = max(weight, 1e-4);
  vec3 resolved = accum / denom;
  float alpha = clamp(weight, 0.0, 1.0);
  fragColor = vec4(resolved * alpha, alpha);
}
`;

  const EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_colorAccum;
uniform sampler2D u_weightAccum;
out vec4 fragColor;

void main() {
  vec3 accum = texture(u_colorAccum, v_uv).rgb;
  float weight = texture(u_weightAccum, v_uv).r;
  float denom = max(weight, 1e-4);
  vec3 resolved = accum / denom;
  vec3 tonemapped = resolved / (resolved + vec3(1.0));
  float alpha = clamp(weight, 0.0, 1.0);
  fragColor = vec4(tonemapped, alpha);
}
`;

  const EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_colorAccum;
uniform sampler2D u_weightAccum;
out vec4 fragColor;

void main() {
  vec3 accum = texture(u_colorAccum, v_uv).rgb;
  float weight = texture(u_weightAccum, v_uv).r;
  float denom = max(weight, 1e-4);
  vec3 resolved = accum / denom;
  float boost = clamp(weight, 0.0, 4.0);
  vec3 boosted = resolved * boost;
  vec3 tonemapped = boosted / (boosted + vec3(1.0));
  float alpha = clamp(weight, 0.0, 1.0);
  fragColor = vec4(tonemapped, alpha);
}
`;

  return {
    NODE_VERTEX_SOURCE,
    NODE_FRAGMENT_SOURCE,
    EDGE_VERTEX_SOURCE,
    EDGE_QUAD_VERTEX_SOURCE,
    EDGE_FRAGMENT_SOURCE,
    EDGE_WEIGHTED_FRAGMENT_SOURCE,
    EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE,
    EDGE_RESOLVE_VERTEX_SOURCE,
    EDGE_RESOLVE_FRAGMENT_SOURCE,
    EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE,
    EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE,
  };
}

export default createGraphWebGLSources;
