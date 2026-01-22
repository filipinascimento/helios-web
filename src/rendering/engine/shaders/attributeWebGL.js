export function createAttributeWebGLSources(options = {}) {
  const nodeOptions = options?.node && typeof options.node === 'object' ? options.node : {};
  const edgeOptions = options?.edge && typeof options.edge === 'object' ? options.edge : {};

  const useNodeSizeAttribute = nodeOptions.size !== 'uniform';
  const useNodeOutlineAttribute = nodeOptions.outline !== 'uniform';
  const useNodeEncodedAttribute = nodeOptions.encoded !== 'none';
  const useEdgeWidthAttribute = edgeOptions.width !== 'uniform';
  const useEdgeEndpointSizeAttribute = edgeOptions.endpointSize !== 'uniform';

  const NODE_VERTEX_SIZE_DECL = useNodeSizeAttribute
    ? /* glsl */ 'layout (location = 2) in float a_size;\n'
    : /* glsl */ 'uniform float u_nodeSize;\n';
  const NODE_VERTEX_SIZE_EXPR = useNodeSizeAttribute ? 'a_size' : 'u_nodeSize';

  const NODE_VERTEX_OUTLINE_DECL = useNodeOutlineAttribute
    ? /* glsl */ 'layout (location = 4) in float a_outline;\n'
    : /* glsl */ 'uniform float u_nodeOutline;\n';
  const NODE_VERTEX_OUTLINE_EXPR = useNodeOutlineAttribute ? 'a_outline' : 'u_nodeOutline';

  const EDGE_VERTEX_ENDPOINT_DECL = useEdgeEndpointSizeAttribute
    ? /* glsl */ 'layout (location = 3) in vec2 a_endpointSize;\n'
    : /* glsl */ 'uniform vec2 u_edgeEndpointSize;\n';
  const EDGE_VERTEX_ENDPOINT_EXPR = useEdgeEndpointSizeAttribute ? 'a_endpointSize' : 'u_edgeEndpointSize';

  const EDGE_QUAD_WIDTH_DECL = useEdgeWidthAttribute
    ? /* glsl */ 'layout (location = 3) in vec2 a_width;\n'
    : /* glsl */ 'uniform vec2 u_edgeWidth;\n';
  const EDGE_QUAD_WIDTH_EXPR = useEdgeWidthAttribute ? 'a_width' : 'u_edgeWidth';

  const EDGE_QUAD_ENDPOINT_DECL = useEdgeEndpointSizeAttribute
    ? /* glsl */ 'layout (location = 4) in vec2 a_endpointSize;\n'
    : /* glsl */ 'uniform vec2 u_edgeEndpointSize;\n';
  const EDGE_QUAD_ENDPOINT_EXPR = useEdgeEndpointSizeAttribute ? 'a_endpointSize' : 'u_edgeEndpointSize';

  const NODE_VERTEX_ENCODED_DECL = useNodeEncodedAttribute
    ? /* glsl */ 'layout (location = 3) in uvec4 a_encoded;\n'
    : /* glsl */ '';

  const NODE_VERTEX_ENCODED_VARYING = useNodeEncodedAttribute
    ? /* glsl */ 'flat out uvec4 v_encoded;\n'
    : /* glsl */ '';

  const NODE_VERTEX_ENCODED_ASSIGN = useNodeEncodedAttribute
    ? /* glsl */ '  v_encoded = a_encoded;\n'
    : /* glsl */ '';

  const nodeVertex = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_corner;
layout (location = 1) in vec3 a_position;
${NODE_VERTEX_SIZE_DECL}${NODE_VERTEX_ENCODED_DECL}
${NODE_VERTEX_OUTLINE_DECL}

uniform mat4 u_viewProjection;
uniform mat4 u_view;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
uniform bool u_is2D;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_outlineWidthBase;
uniform float u_outlineWidthScale;

out vec2 v_local;
out vec3 v_centerWorld;
out vec3 v_rightWorld;
out vec3 v_upWorld;
out vec3 v_viewDir;
out float v_radius;
${NODE_VERTEX_ENCODED_VARYING}

void main() {
  float baseSize = u_nodeSizeBase + u_nodeSizeScale * ${NODE_VERTEX_SIZE_EXPR};
  float outlineWidth = max(0.0, u_outlineWidthBase + u_outlineWidthScale * ${NODE_VERTEX_OUTLINE_EXPR});
  float fullSize = baseSize + outlineWidth;
  float radius = max(1.0, fullSize) * 0.5;
  vec3 right = u_cameraRight;
  vec3 up = u_cameraUp;
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  if (u_is2D) {
    right = normalize(right);
    up = normalize(up);
  } else {
    viewDir = u_cameraPosition - a_position;
    float viewLen = length(viewDir);
    viewDir = viewLen > 1e-5 ? viewDir / viewLen : vec3(0.0, 0.0, 1.0);
    right = u_cameraRight - viewDir * dot(u_cameraRight, viewDir);
    float rightLen = length(right);
    right = rightLen > 1e-5 ? right / rightLen : normalize(cross(u_cameraUp, viewDir));
    up = normalize(cross(viewDir, right));
  }
  vec3 world = a_position + (right * a_corner.x + up * a_corner.y) * radius;
  gl_Position = u_viewProjection * vec4(world, 1.0);
  v_local = a_corner;
  v_centerWorld = a_position;
  v_rightWorld = right;
  v_upWorld = up;
  v_viewDir = viewDir;
  v_radius = radius;
${NODE_VERTEX_ENCODED_ASSIGN}
}`;

  const edgeVertex = /* glsl */ `#version 300 es
layout (location = 0) in vec3 a_start;
layout (location = 1) in vec3 a_end;
${EDGE_VERTEX_ENDPOINT_DECL}layout (location = 4) in uvec4 a_encoded;

uniform mat4 u_viewProjection;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;

flat out uvec4 v_encoded;

void main() {
  vec3 dir = a_end - a_start;
  float dirLen = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLen;
  vec2 endpointSizePair = ${EDGE_VERTEX_ENDPOINT_EXPR};
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.x, 0.0) * 0.5;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.y, 0.0) * 0.5;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = a_start + dirN * trimStart;
  vec3 endPos = a_end - dirN * trimEnd;
  bool isEnd = (gl_VertexID & 1) == 1;
  vec3 pos = isEnd ? endPos : startPos;
  gl_Position = u_viewProjection * vec4(pos, 1.0);
  v_encoded = a_encoded;
}`;

  const edgeQuadVertex = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_corner;
layout (location = 1) in vec3 a_start;
layout (location = 2) in vec3 a_end;
${EDGE_QUAD_WIDTH_DECL}${EDGE_QUAD_ENDPOINT_DECL}layout (location = 5) in uvec4 a_encoded;

uniform mat4 u_viewProjection;
uniform vec2 u_viewport;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;

flat out uvec4 v_encoded;

void main() {
  vec3 dir = a_end - a_start;
  float dirLenWorld = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLenWorld;
  vec2 endpointSizePair = ${EDGE_QUAD_ENDPOINT_EXPR};
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.x, 0.0) * 0.5;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.y, 0.0) * 0.5;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = a_start + dirN * trimStart;
  vec3 endPos = a_end - dirN * trimEnd;

  float segmentMix = clamp(a_corner.x, 0.0, 1.0);
  vec2 widthPair = ${EDGE_QUAD_WIDTH_EXPR};
  float width = max(u_edgeWidthBase + u_edgeWidthScale * mix(widthPair.x, widthPair.y, segmentMix), 0.0);
  vec4 clipStart = u_viewProjection * vec4(startPos, 1.0);
  vec4 clipEnd = u_viewProjection * vec4(endPos, 1.0);
  vec2 ndcStart = clipStart.xy / clipStart.w;
  vec2 ndcEnd = clipEnd.xy / clipEnd.w;
  vec2 ndcDir = ndcEnd - ndcStart;
  float dirLen = max(length(ndcDir), 1e-5);
  vec2 perp = vec2(-ndcDir.y, ndcDir.x) / dirLen;
  float halfWidth = max(width, 1.0) * 0.5;
  vec2 pixelToNdc = vec2(2.0 / max(u_viewport.x, 1.0), 2.0 / max(u_viewport.y, 1.0));
  vec2 offsetNdc = perp * halfWidth * pixelToNdc;
  vec4 clipPos = mix(clipStart, clipEnd, segmentMix);
  clipPos.xy += offsetNdc * a_corner.y * 1.5;
  gl_Position = clipPos;
  v_encoded = a_encoded;
}`;

  return { nodeVertex, edgeVertex, edgeQuadVertex };
}

const DEFAULT_SOURCES = createAttributeWebGLSources();
export const NODE_ATTRIBUTE_VERTEX = DEFAULT_SOURCES.nodeVertex;

export const NODE_ATTRIBUTE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_local;
in vec3 v_centerWorld;
in vec3 v_rightWorld;
in vec3 v_upWorld;
in vec3 v_viewDir;
in float v_radius;
flat in uvec4 v_encoded;

uniform mat4 u_viewProjection;
uniform bool u_is2D;

out vec4 fragColor;

void main() {
  float dist = length(v_local);
  if (dist > 1.0) {
    discard;
  }
  if (!u_is2D) {
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
  fragColor = vec4(vec4(v_encoded) / 255.0);
}`;
  export const EDGE_ATTRIBUTE_VERTEX = DEFAULT_SOURCES.edgeVertex;

export const EDGE_ATTRIBUTE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
flat in uvec4 v_encoded;
out vec4 fragColor;
void main() {
  fragColor = vec4(vec4(v_encoded) / 255.0);
}`;
export const EDGE_ATTRIBUTE_QUAD_VERTEX = DEFAULT_SOURCES.edgeQuadVertex;

export const EDGE_ATTRIBUTE_QUAD_FRAGMENT = EDGE_ATTRIBUTE_FRAGMENT;
