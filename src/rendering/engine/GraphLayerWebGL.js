import { GraphLayer } from './GraphLayer.js';
import { GraphVisualSchema } from '../schema/GraphVisualSchema.js';
import {
  VISUAL_ATTRIBUTE_NAMES,
  DEFAULT_NODE_COLOR,
  DEFAULT_EDGE_COLOR,
  DEFAULT_EDGE_OPACITY,
  DEFAULT_NODE_SIZE,
  DEFAULT_EDGE_WIDTH,
} from '../../pipeline/constants.js';
import { createGraphWebGLSources } from './shaders/graphWebGL.js';

const {
  NODE_COLOR_ATTRIBUTE,
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
  NODE_OUTLINE_COLOR_ATTRIBUTE,
  EDGE_COLOR_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_OPACITY_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
  EDGE_ENDPOINTS_STATE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

function normalizeEndpoints(value) {
  if (value === 'source' || value === 'from') return 'source';
  if (value === 'destination' || value === 'target' || value === 'to') return 'destination';
  return 'both';
}

function clamp01(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toRgba(value, fallback = DEFAULT_EDGE_COLOR) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const len = value.length ?? 0;
    if (len >= 4) {
      return [
        clamp01(value[0], fallback[0] ?? 0),
        clamp01(value[1], fallback[1] ?? 0),
        clamp01(value[2], fallback[2] ?? 0),
        clamp01(value[3], fallback[3] ?? 1),
      ];
    }
    if (len >= 3) {
      return [
        clamp01(value[0], fallback[0] ?? 0),
        clamp01(value[1], fallback[1] ?? 0),
        clamp01(value[2], fallback[2] ?? 0),
        fallback[3] ?? 1,
      ];
    }
  }
  if (value && typeof value === 'object') {
    if ('source' in value) return toRgba(value.source, fallback);
  }
  return [
    clamp01(fallback[0], 0),
    clamp01(fallback[1], 0),
    clamp01(fallback[2], 0),
    clamp01(fallback[3], 1),
  ];
}

function toColorPair(value, fallback = [DEFAULT_EDGE_COLOR, DEFAULT_EDGE_COLOR]) {
  const fallbackStart = toRgba(fallback?.[0] ?? DEFAULT_EDGE_COLOR, DEFAULT_EDGE_COLOR);
  const fallbackEnd = toRgba(fallback?.[1] ?? fallbackStart, fallbackStart);
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const len = value.length ?? 0;
    if (len >= 2 && (Array.isArray(value[0]) || ArrayBuffer.isView(value[0]) || (value[0] && typeof value[0] === 'object'))) {
      const start = toRgba(value[0], fallbackStart);
      const end = toRgba(value[1], start);
      return [start, end];
    }
    if (len >= 8) {
      const start = toRgba([value[0], value[1], value[2], value[3]], fallbackStart);
      const end = toRgba([value[4], value[5], value[6], value[7]], fallbackEnd);
      return [start, end];
    }
    if (len >= 4) {
      const rgba = toRgba(value, fallbackStart);
      return [rgba, rgba];
    }
  }
  if (value && typeof value === 'object') {
    const start = 'source' in value ? toRgba(value.source, fallbackStart) : toRgba(value, fallbackStart);
    const end = 'target' in value ? toRgba(value.target, start) : start;
    return [start, end];
  }
  return [fallbackStart, fallbackEnd];
}

function toScalarPair(value, fallback = [1, 1]) {
  const fallbackA = toNumber(fallback?.[0], 1);
  const fallbackB = toNumber(fallback?.[1], fallbackA);
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const len = value.length ?? 0;
    if (len >= 2) {
      const a = toNumber(value[0], fallbackA);
      const b = toNumber(value[1], a);
      return [a, b];
    }
    if (len >= 1) {
      const scalar = toNumber(value[0], fallbackA);
      return [scalar, scalar];
    }
  }
  if (value && typeof value === 'object') {
    const start = ('source' in value) ? toNumber(value.source, fallbackA) : fallbackA;
    const end = ('target' in value) ? toNumber(value.target, start) : start;
    return [start, end];
  }
  const scalar = toNumber(value, fallbackA);
  return [scalar, scalar];
}

const NODE_UNIFORM_NAMES = [
  'u_viewProjection',
  'u_nodeOutlineWidths',
  'u_nodeOutlineColors',
  'u_nodeStates',
  'u_nodePositions',
  'u_nodePositionsFrom',
  'u_nodeInterpolationFactor',
  'u_nodeInterpolationEnabled',
  'u_nodeColors',
  'u_nodeSizes',
  'u_cameraPosition',
  'u_cameraUp',
  'u_cameraRight',
  'u_is2D',
  'u_zoom2D',
  'u_semanticZoomExponent',
  'u_hasNodeColors',
  'u_hasNodeSizes',
  'u_hasNodeOutlineWidths',
  'u_hasNodeOutlineColors',
  'u_hasNodeStates',
  'u_defaultNodeColor',
  'u_defaultNodeSize',
  'u_hoverNodeIndex',
  'u_hoverNodeState',
  'u_nodeStateForceMaxAlphaMask',
  'u_nodeNoStateScale',
  'u_nodeNoStateColorMul',
  'u_nodeNoStateColorAdd',
  'u_nodeStateScale[0]',
  'u_nodeStateColorMul[0]',
  'u_nodeStateColorAdd[0]',
  'u_nodeOpacityBase',
  'u_nodeOpacityScale',
  'u_nodeSizeBase',
  'u_nodeSizeScale',
  'u_nodeOutline',
  'u_outlineWidthBase',
  'u_outlineWidthScale',
  'u_outlineColor',
];

const EDGE_UNIFORM_NAMES = [
  'u_viewProjection',
  'u_nodePositions',
  'u_nodePositionsFrom',
  'u_nodeInterpolationFactor',
  'u_nodeInterpolationEnabled',
  'u_nodeEdgeColors',
  'u_edgeColors',
  'u_edgeStates',
  'u_edgeOpacities',
  'u_nodeOpacitySource',
  'u_edgeEndpoints',
  'u_hasEdgeStates',
  'u_hoverNodeIndex',
  'u_hoverEdgeIndex',
  'u_hoverEdgeState',
  'u_edgeStateForceMaxAlphaMask',
  'u_edgeNoStateScale',
  'u_edgeNoStateColorMul',
  'u_edgeNoStateColorAdd',
  'u_edgeStateScale[0]',
  'u_edgeStateColorMul[0]',
  'u_edgeStateColorAdd[0]',
  'u_edgeColorSource',
  'u_edgeColorEndpoints',
  'u_edgeOpacitySource',
  'u_edgeOpacityEndpoints',
  'u_hasEdgeColors',
  'u_hasNodeColors',
  'u_hasEdgeOpacities',
  'u_hasNodeOpacitySource',
  'u_defaultNodeEdgeColor',
  'u_defaultEdgeColorStart',
  'u_defaultEdgeColorEnd',
  'u_defaultEdgeOpacity',
  'u_defaultNodeOpacitySource',
  'u_edgeOpacityBase',
  'u_edgeOpacityScale',
];

const EDGE_QUAD_UNIFORM_NAMES = [
  'u_viewProjection',
  'u_cameraPosition',
  'u_cameraUp',
  'u_cameraRight',
  'u_is2D',
  'u_viewport',
  'u_nodePositions',
  'u_nodePositionsFrom',
  'u_nodeInterpolationFactor',
  'u_nodeInterpolationEnabled',
  'u_nodeEdgeColors',
  'u_edgeColors',
  'u_edgeEndpoints',
  'u_edgeStates',
  'u_edgeEndpointStates',
  'u_edgeWidths',
  'u_edgeOpacities',
  'u_edgeEndpointSizes',
  'u_nodeWidthSource',
  'u_nodeOpacitySource',
  'u_nodeEndpointSizeSource',
  'u_edgeColorSource',
  'u_edgeColorEndpoints',
  'u_edgeWidthSource',
  'u_edgeWidthEndpoints',
  'u_edgeOpacitySource',
  'u_edgeOpacityEndpoints',
  'u_edgeEndpointSizeSource',
  'u_edgeEndpointSizeEndpoints',
  'u_hasEdgeColors',
  'u_hasNodeColors',
  'u_hasEdgeStates',
  'u_hasEdgeEndpointStates',
  'u_hasEdgeWidths',
  'u_hasEdgeOpacities',
  'u_hasEdgeEndpointSizes',
  'u_hasNodeWidthSource',
  'u_hasNodeOpacitySource',
  'u_hasNodeEndpointSizeSource',
  'u_defaultNodeEdgeColor',
  'u_defaultEdgeColorStart',
  'u_defaultEdgeColorEnd',
  'u_defaultEdgeWidth',
  'u_defaultNodeWidthSource',
  'u_defaultEdgeOpacity',
  'u_defaultNodeOpacitySource',
  'u_defaultEdgeEndpointSize',
  'u_defaultNodeEndpointSizeSource',
  'u_edgeWidthBase',
  'u_edgeWidthScale',
  'u_edgeOpacityBase',
  'u_edgeOpacityScale',
  'u_nodeSizeBase',
  'u_nodeSizeScale',
  'u_edgeEndpointTrim',
  'u_zoom2D',
  'u_semanticZoomExponent',
  'u_hoverNodeIndex',
  'u_hoverEdgeIndex',
  'u_hoverEdgeState',
  'u_edgeStateForceMaxAlphaMask',
  'u_nodeNoStateScale',
  'u_nodeStateScale[0]',
  'u_edgeNoStateScale',
  'u_edgeNoStateColorMul',
  'u_edgeNoStateColorAdd',
  'u_edgeStateScale[0]',
  'u_edgeStateColorMul[0]',
  'u_edgeStateColorAdd[0]',
];

const DEFAULT_STATE_SCALE = new Float32Array([1, 1, 1, 0]);
const DEFAULT_STATE_COLOR_MUL = new Float32Array([1, 1, 1, 1]);
const DEFAULT_STATE_COLOR_ADD = new Float32Array([0, 0, 0, 0]);

function warnOnce(owner, key, message, detail) {
  if (!owner) return;
  owner._warnedIssues ??= new Set();
  if (owner._warnedIssues.has(key)) return;
  owner._warnedIssues.add(key);
  console.warn(message, detail);
}

function isMissingAttributeError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return (
    message.includes('Unknown node attribute')
    || message.includes('Unknown edge attribute')
    || message.includes('Cannot perform attribute metadata lookup')
  );
}

function isDebugWebGLRenderEnabled() {
  if (globalThis.__HELIOS_DEBUG_WEBGL_RENDER === true) return true;
  try {
    const search = globalThis.location?.search ?? '';
    return search.includes('debugWebGLRender=1');
  } catch (_) {
    return false;
  }
}

function debugWebGLRender(message, detail) {
  if (!isDebugWebGLRenderEnabled()) return;
  console.warn(`[Helios][WebGLRender] ${message}`, detail);
}

const NODE_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;

layout (location = 0) in uint a_nodeId;

uniform mat4 u_viewProjection;
uniform sampler2D u_nodePositions;
uniform sampler2D u_nodeColors;
uniform sampler2D u_nodeSizes;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
uniform int u_is2D;
uniform vec2 u_viewport;
uniform int u_hasNodeColors;
uniform int u_hasNodeSizes;
uniform vec4 u_defaultNodeColor;
uniform float u_defaultNodeSize;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;

out vec4 v_color;

vec3 fetchNodePos(uint id) {
  return texelFetch(u_nodePositions, ivec2(int(id), 0), 0).xyz;
}

vec4 fetchNodeColor(uint id) {
  if (u_hasNodeColors == 0) return u_defaultNodeColor;
  return texelFetch(u_nodeColors, ivec2(int(id), 0), 0);
}

float fetchNodeSize(uint id) {
  if (u_hasNodeSizes == 0) return u_defaultNodeSize;
  return texelFetch(u_nodeSizes, ivec2(int(id), 0), 0).x;
}

void main() {
  vec3 position = fetchNodePos(a_nodeId);
  float rawSize = fetchNodeSize(a_nodeId);
  float fullSize = max(1.0, u_nodeSizeBase + u_nodeSizeScale * rawSize);
  float radius = fullSize * 0.5;

  vec3 right = u_cameraRight;
  vec3 up = u_cameraUp;
  if (u_is2D == 1) {
    right = normalize(right);
    up = normalize(up);
  } else {
    vec3 viewDir = u_cameraPosition - position;
    float viewLen = length(viewDir);
    viewDir = viewLen > 1e-5 ? viewDir / viewLen : vec3(0.0, 0.0, 1.0);
    right = u_cameraRight - viewDir * dot(u_cameraRight, viewDir);
    float rightLen = length(right);
    right = rightLen > 1e-5 ? right / rightLen : normalize(cross(u_cameraUp, viewDir));
    up = normalize(cross(viewDir, right));
  }

  vec4 clipCenter = u_viewProjection * vec4(position, 1.0);
  vec4 clipOffset = u_viewProjection * vec4(position + right * radius, 1.0);
  vec2 ndcCenter = clipCenter.xy / clipCenter.w;
  vec2 ndcOffset = clipOffset.xy / clipOffset.w;
  vec2 pixelScale = vec2(max(u_viewport.x, 1.0), max(u_viewport.y, 1.0)) * 0.5;
  float radiusPx = length((ndcOffset - ndcCenter) * pixelScale);
  gl_PointSize = max(1.0, radiusPx * 2.0);
  gl_Position = clipCenter;
  v_color = fetchNodeColor(a_nodeId);
}
`;

const NODE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  vec2 local = gl_PointCoord * 2.0 - 1.0;
  if (dot(local, local) > 1.0) discard;
  fragColor = v_color;
}
`;

const EDGE_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

layout (location = 0) in uint a_edgeId;

uniform mat4 u_viewProjection;
uniform sampler2D u_nodePositions;
uniform sampler2D u_nodeColors;
uniform sampler2D u_nodeEdgeColors;
uniform sampler2D u_edgeColors;
uniform sampler2D u_edgeOpacities;
uniform sampler2D u_nodeOpacitySource;
uniform usampler2D u_edgeEndpoints;
uniform int u_edgeColorSource; // 0=edge, 1=node
uniform int u_edgeColorEndpoints; // 0=both, 1=source, 2=destination
uniform int u_edgeOpacitySource; // 0=edge, 1=node
uniform int u_edgeOpacityEndpoints; // 0=both, 1=source, 2=destination
uniform int u_hasEdgeColors;
uniform int u_hasNodeColors;
uniform int u_hasEdgeOpacities;
uniform int u_hasNodeOpacitySource;
uniform vec4 u_defaultNodeEdgeColor;
uniform vec4 u_defaultEdgeColorStart;
uniform vec4 u_defaultEdgeColorEnd;
uniform vec2 u_defaultEdgeOpacity;
uniform vec2 u_defaultNodeOpacitySource;
uniform float u_edgeOpacityBase;
uniform float u_edgeOpacityScale;

out vec4 v_color;

vec3 fetchNodePos(uint id) {
  return texelFetch(u_nodePositions, ivec2(int(id), 0), 0).xyz;
}

vec4 fetchNodeColor(uint id) {
  if (u_hasNodeColors == 0) return u_defaultNodeEdgeColor;
  return texelFetch(u_nodeEdgeColors, ivec2(int(id), 0), 0);
}

vec4 fetchEdgeColor(uint id, bool target) {
  if (u_hasEdgeColors == 0) return target ? u_defaultEdgeColorEnd : u_defaultEdgeColorStart;
  int offset = int(id) * 2 + (target ? 1 : 0);
  return texelFetch(u_edgeColors, ivec2(offset, 0), 0);
}

float fetchNodeOpacity(uint id, float fallbackValue) {
  if (u_hasNodeOpacitySource == 0) return fallbackValue;
  return texelFetch(u_nodeOpacitySource, ivec2(int(id), 0), 0).x;
}

vec2 resolveNodeOpacityPair(uint sourceId, uint targetId, int endpointsMode, vec2 fallbackPair) {
  float sourceValue = fetchNodeOpacity(sourceId, fallbackPair.x);
  float targetValue = fetchNodeOpacity(targetId, fallbackPair.y);
  if (endpointsMode == 1) return vec2(sourceValue, sourceValue);
  if (endpointsMode == 2) return vec2(targetValue, targetValue);
  return vec2(sourceValue, targetValue);
}

vec2 fetchEdgeOpacityPair(uint id, uint sourceId, uint targetId) {
  if (u_edgeOpacitySource == 1) {
    return resolveNodeOpacityPair(sourceId, targetId, u_edgeOpacityEndpoints, u_defaultNodeOpacitySource);
  }
  if (u_hasEdgeOpacities == 0) return u_defaultEdgeOpacity;
  return texelFetch(u_edgeOpacities, ivec2(int(id), 0), 0).xy;
}

void main() {
  uvec2 endpoints = texelFetch(u_edgeEndpoints, ivec2(int(a_edgeId), 0), 0).xy;
  uint sourceId = endpoints.x;
  uint targetId = endpoints.y;
  uint nodeId = (gl_VertexID & 1) == 0 ? sourceId : targetId;
  vec3 pos = fetchNodePos(nodeId);
  gl_Position = u_viewProjection * vec4(pos, 1.0);

  vec4 sourceColor = fetchEdgeColor(a_edgeId, false);
  vec4 targetColor = fetchEdgeColor(a_edgeId, true);
  if (u_edgeColorSource == 1) {
    vec4 nodeSourceColor = fetchNodeColor(sourceId);
    vec4 nodeTargetColor = fetchNodeColor(targetId);
    if (u_edgeColorEndpoints == 1) {
      sourceColor = nodeSourceColor;
      targetColor = nodeSourceColor;
    } else if (u_edgeColorEndpoints == 2) {
      sourceColor = nodeTargetColor;
      targetColor = nodeTargetColor;
    } else {
      sourceColor = nodeSourceColor;
      targetColor = nodeTargetColor;
    }
  }
  bool isTarget = (gl_VertexID & 1) == 1;
  vec4 baseColor = isTarget ? targetColor : sourceColor;
  vec2 opacityPair = fetchEdgeOpacityPair(a_edgeId, sourceId, targetId);
  float rawOpacity = isTarget ? opacityPair.y : opacityPair.x;
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * rawOpacity, 0.0, 1.0);
  v_color = vec4(baseColor.rgb, clamp(baseColor.a * opacity, 0.0, 1.0));
}
`;

const EDGE_QUAD_VERTEX_SOURCE = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

layout (location = 0) in vec2 a_corner;
layout (location = 1) in uint a_edgeId;

uniform mat4 u_viewProjection;
uniform vec2 u_viewport;
uniform sampler2D u_nodePositions;
uniform sampler2D u_nodeEdgeColors;
uniform sampler2D u_edgeColors;
uniform usampler2D u_edgeEndpoints;
uniform sampler2D u_edgeWidths;
uniform sampler2D u_edgeOpacities;
uniform sampler2D u_edgeEndpointSizes;
uniform sampler2D u_nodeWidthSource;
uniform sampler2D u_nodeOpacitySource;
uniform sampler2D u_nodeEndpointSizeSource;
uniform int u_edgeColorSource; // 0=edge, 1=node
uniform int u_edgeColorEndpoints; // 0=both, 1=source, 2=destination
uniform int u_edgeWidthSource; // 0=edge, 1=node
uniform int u_edgeWidthEndpoints; // 0=both, 1=source, 2=destination
uniform int u_edgeOpacitySource; // 0=edge, 1=node
uniform int u_edgeOpacityEndpoints; // 0=both, 1=source, 2=destination
uniform int u_edgeEndpointSizeSource; // 0=edge, 1=node
uniform int u_edgeEndpointSizeEndpoints; // 0=both, 1=source, 2=destination
uniform int u_hasEdgeColors;
uniform int u_hasNodeColors;
uniform int u_hasEdgeWidths;
uniform int u_hasEdgeOpacities;
uniform int u_hasEdgeEndpointSizes;
uniform int u_hasNodeWidthSource;
uniform int u_hasNodeOpacitySource;
uniform int u_hasNodeEndpointSizeSource;
uniform vec4 u_defaultNodeEdgeColor;
uniform vec4 u_defaultEdgeColorStart;
uniform vec4 u_defaultEdgeColorEnd;
uniform vec2 u_defaultEdgeWidth;
uniform vec2 u_defaultEdgeOpacity;
uniform vec2 u_defaultNodeOpacitySource;
uniform vec2 u_defaultEdgeEndpointSize;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_edgeOpacityBase;
uniform float u_edgeOpacityScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;

out vec4 v_color;

vec3 fetchNodePos(uint id) {
  return texelFetch(u_nodePositions, ivec2(int(id), 0), 0).xyz;
}

vec4 fetchNodeColor(uint id) {
  if (u_hasNodeColors == 0) return u_defaultNodeEdgeColor;
  return texelFetch(u_nodeEdgeColors, ivec2(int(id), 0), 0);
}

vec4 fetchEdgeColor(uint id, bool target) {
  if (u_hasEdgeColors == 0) return target ? u_defaultEdgeColorEnd : u_defaultEdgeColorStart;
  int offset = int(id) * 2 + (target ? 1 : 0);
  return texelFetch(u_edgeColors, ivec2(offset, 0), 0);
}

float fetchNodeScalar(sampler2D sourceTex, uint nodeId, int hasSource, float fallbackValue) {
  if (hasSource == 0) return fallbackValue;
  return texelFetch(sourceTex, ivec2(int(nodeId), 0), 0).x;
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
}

vec2 fetchEdgeWidthPair(uint edgeId, uint sourceId, uint targetId) {
  if (u_edgeWidthSource == 1) {
    return resolveNodePair(
      u_nodeWidthSource,
      sourceId,
      targetId,
      u_hasNodeWidthSource,
      u_edgeWidthEndpoints,
      u_defaultEdgeWidth
    );
  }
  if (u_hasEdgeWidths == 0) return u_defaultEdgeWidth;
  return texelFetch(u_edgeWidths, ivec2(int(edgeId), 0), 0).xy;
}

vec2 fetchEdgeOpacityPair(uint edgeId, uint sourceId, uint targetId) {
  if (u_edgeOpacitySource == 1) {
    return resolveNodePair(
      u_nodeOpacitySource,
      sourceId,
      targetId,
      u_hasNodeOpacitySource,
      u_edgeOpacityEndpoints,
      u_defaultNodeOpacitySource
    );
  }
  if (u_hasEdgeOpacities == 0) return u_defaultEdgeOpacity;
  return texelFetch(u_edgeOpacities, ivec2(int(edgeId), 0), 0).xy;
}

vec2 fetchEdgeEndpointSizePair(uint edgeId, uint sourceId, uint targetId) {
  if (u_edgeEndpointSizeSource == 1) {
    return resolveNodePair(
      u_nodeEndpointSizeSource,
      sourceId,
      targetId,
      u_hasNodeEndpointSizeSource,
      u_edgeEndpointSizeEndpoints,
      u_defaultEdgeEndpointSize
    );
  }
  if (u_hasEdgeEndpointSizes == 0) return u_defaultEdgeEndpointSize;
  return texelFetch(u_edgeEndpointSizes, ivec2(int(edgeId), 0), 0).xy;
}

void main() {
  uvec2 endpoints = texelFetch(u_edgeEndpoints, ivec2(int(a_edgeId), 0), 0).xy;
  uint sourceId = endpoints.x;
  uint targetId = endpoints.y;

  vec3 sourcePos = fetchNodePos(sourceId);
  vec3 targetPos = fetchNodePos(targetId);
  vec3 dir = targetPos - sourcePos;
  float dirLenWorld = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLenWorld;

  vec2 endpointSizePair = fetchEdgeEndpointSizePair(a_edgeId, sourceId, targetId);
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.x, 0.0) * 0.5;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.y, 0.0) * 0.5;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = sourcePos + dirN * trimStart;
  vec3 endPos = targetPos - dirN * trimEnd;

  float segmentMix = clamp(a_corner.x, 0.0, 1.0);
  vec2 widthPair = fetchEdgeWidthPair(a_edgeId, sourceId, targetId);
  float rawWidth = mix(widthPair.x, widthPair.y, segmentMix);
  float width = max(u_edgeWidthBase + u_edgeWidthScale * rawWidth, 0.0);

  vec4 clipStart = u_viewProjection * vec4(startPos, 1.0);
  vec4 clipEnd = u_viewProjection * vec4(endPos, 1.0);
  vec2 ndcStart = clipStart.xy / clipStart.w;
  vec2 ndcEnd = clipEnd.xy / clipEnd.w;
  vec2 ndcDir = ndcEnd - ndcStart;
  float dirLen = max(length(ndcDir), 1e-5);
  vec2 perp = vec2(-ndcDir.y, ndcDir.x) / dirLen;
  float halfWidth = max(width, 1e-3) * 0.5;
  vec2 pixelToNdc = vec2(2.0 / max(u_viewport.x, 1.0), 2.0 / max(u_viewport.y, 1.0));
  vec2 offsetNdc = perp * halfWidth * pixelToNdc;
  vec4 clipPos = mix(clipStart, clipEnd, segmentMix);
  clipPos.xy += offsetNdc * a_corner.y * 1.5;
  gl_Position = clipPos;

  vec4 sourceColor = fetchEdgeColor(a_edgeId, false);
  vec4 targetColor = fetchEdgeColor(a_edgeId, true);
  if (u_edgeColorSource == 1) {
    vec4 nodeSourceColor = fetchNodeColor(sourceId);
    vec4 nodeTargetColor = fetchNodeColor(targetId);
    if (u_edgeColorEndpoints == 1) {
      sourceColor = nodeSourceColor;
      targetColor = nodeSourceColor;
    } else if (u_edgeColorEndpoints == 2) {
      sourceColor = nodeTargetColor;
      targetColor = nodeTargetColor;
    } else {
      sourceColor = nodeSourceColor;
      targetColor = nodeTargetColor;
    }
  }
  vec4 blendedColor = mix(sourceColor, targetColor, segmentMix);
  vec2 opacityPair = fetchEdgeOpacityPair(a_edgeId, sourceId, targetId);
  float rawOpacity = mix(opacityPair.x, opacityPair.y, segmentMix);
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * rawOpacity, 0.0, 1.0);
  v_color = vec4(blendedColor.rgb, clamp(blendedColor.a * opacity, 0.0, 1.0));
}
`;

const EDGE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}
`;

export class GraphLayerWebGL extends GraphLayer {
  constructor(options = {}) {
    super(options);
    this.device = null;
    this.gl = null;

    this.nodeProgram = null;
    this.edgeProgram = null;
    this.edgeQuadProgram = null;
    this.nodeVao = null;
    this.nodeQuadBuffer = null;
    this.edgeVao = null;
    this.edgeQuadVao = null;
    this.edgeQuadBuffer = null;
    this.nodeIdBuffer = null;
    this.edgeIdBuffer = null;

    this.nodeTextures = {
      positions: null,
      positionsFrom: null,
      colors: null,
      sizes: null,
      states: null,
      outlineWidths: null,
      outlineColors: null,
      edgeColorSource: null,
      edgeWidthSource: null,
      edgeOpacitySource: null,
      edgeEndpointSizeSource: null,
    };
    this.edgeTextures = {
      endpoints: null,
      colors: null,
      widths: null,
      opacities: null,
      endpointSizes: null,
      states: null,
      endpointStates: null,
    };
    this.textureMeta = {
      nodePositions: null,
      nodePositionsFrom: null,
      nodeColors: null,
      nodeSizes: null,
      nodeStates: null,
      nodeOutlineWidths: null,
      nodeOutlineColors: null,
      nodeEdgeColors: null,
      nodeEdgeWidths: null,
      nodeEdgeOpacities: null,
      nodeEdgeEndpointSizes: null,
      edgeEndpoints: null,
      edgeColors: null,
      edgeWidths: null,
      edgeOpacities: null,
      edgeEndpointSizes: null,
      edgeStates: null,
      edgeEndpointStates: null,
    };
    this.bufferMeta = {
      nodeIds: null,
      edgeIds: null,
    };
    this._uploadScratch = new Map();

    this.nodeCount = 0;
    this.edgeCount = 0;
    this.warnedWeightedFallback = false;

    this.nodeProgramCache = new Map();
    this.edgeProgramCache = new Map();
    this.edgeQuadProgramCache = new Map();
    this.edgeWeightedProgramCache = new Map();
    this.edgeWeightedQuadProgramCache = new Map();
    this._ownedPrograms = new Set();

    this.edgeResolveProgram = null;
    this.edgeResolveUniformColor = null;
    this.edgeResolveUniformWeight = null;
    this.edgeResolveTonemapProgram = null;
    this.edgeResolveTonemapUniformColor = null;
    this.edgeResolveTonemapUniformWeight = null;
    this.edgeResolveBoostProgram = null;
    this.edgeResolveBoostUniformColor = null;
    this.edgeResolveBoostUniformWeight = null;
    this.edgeResolveVAO = null;
    this.edgeResolveBuffer = null;
    this.weightedFramebuffer = null;
    this.weightedColor = null;
    this.weightedWeight = null;
    this.weightedDepth = null;
    this.weightedSize = null;
    this.weightedSupported = null;
  }

  initialize(device, size) {
    if (device?.type !== 'webgl2') {
      throw new Error('GraphLayerWebGL requires a WebGL2 device.');
    }
    super.initialize(device, size);
    this.device = device;
    this.gl = device.gl;
    this.initializePrograms();
    this.initializeGeometry();
    this.initializeTextures();
  }

  resize(size) {
    super.resize(size);
  }

  destroy() {
    const { gl } = this;
    if (!gl) return;
    for (const program of this._ownedPrograms) {
      gl.deleteProgram(program);
    }
    this._ownedPrograms.clear();
    this.nodeProgramCache.clear();
    this.edgeProgramCache.clear();
    this.edgeQuadProgramCache.clear();
    this.edgeWeightedProgramCache.clear();
    this.edgeWeightedQuadProgramCache.clear();
    if (this.edgeResolveProgram) gl.deleteProgram(this.edgeResolveProgram);
    if (this.edgeResolveTonemapProgram) gl.deleteProgram(this.edgeResolveTonemapProgram);
    if (this.edgeResolveBoostProgram) gl.deleteProgram(this.edgeResolveBoostProgram);
    if (this.edgeResolveVAO) gl.deleteVertexArray(this.edgeResolveVAO);
    if (this.edgeResolveBuffer) gl.deleteBuffer(this.edgeResolveBuffer);
    this.destroyWeightedTargets();
    if (this.nodeVao) gl.deleteVertexArray(this.nodeVao);
    if (this.nodeQuadBuffer) gl.deleteBuffer(this.nodeQuadBuffer);
    if (this.edgeVao) gl.deleteVertexArray(this.edgeVao);
    if (this.edgeQuadVao) gl.deleteVertexArray(this.edgeQuadVao);
    if (this.edgeQuadBuffer) gl.deleteBuffer(this.edgeQuadBuffer);
    if (this.nodeIdBuffer) gl.deleteBuffer(this.nodeIdBuffer);
    if (this.edgeIdBuffer) gl.deleteBuffer(this.edgeIdBuffer);
    Object.values(this.nodeTextures).forEach((tex) => tex && gl.deleteTexture(tex));
    Object.values(this.edgeTextures).forEach((tex) => tex && gl.deleteTexture(tex));
  }

  initializePrograms() {
    const { gl } = this;
    const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    const extColorBufferHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
    const extFloatBlend = gl.getExtension('EXT_float_blend');
    const canDrawMultiple = (gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) ?? 1) >= 2;
    this.weightedSupported = Boolean(
      gl.drawBuffers
      && canDrawMultiple
      && (extColorBufferFloat || extColorBufferHalfFloat)
      && extFloatBlend,
    );
    this.edgeTransparencyMode = this.normalizeEdgeTransparencyMode(this.edgeTransparencyMode);
    this.nodeProgramCache.clear();
    this.edgeProgramCache.clear();
    this.edgeQuadProgramCache.clear();
    this.edgeWeightedProgramCache.clear();
    this.edgeWeightedQuadProgramCache.clear();
  }

  resolveUniformLocations(program, names) {
    const out = {};
    for (const name of names) {
      out[name] = this.gl.getUniformLocation(program, name);
    }
    return out;
  }

  resolveNodeVariant(visualConfig) {
    const nodeCfg = visualConfig?.node ?? null;
    if (!nodeCfg) {
      return {
        colorBuffer: true,
        sizeBuffer: true,
        outlineWidthBuffer: this.nodeOutlineUseAttributes === true,
        outlineColorBuffer: this.nodeOutlineUseAttributes === true,
      };
    }
    return {
      colorBuffer: nodeCfg?.color?.mode !== 'uniform',
      sizeBuffer: nodeCfg?.size?.mode !== 'uniform',
      outlineWidthBuffer: nodeCfg?.outline?.mode !== 'uniform',
      outlineColorBuffer: nodeCfg?.outlineColor?.mode !== 'uniform',
    };
  }

  getNodeVariantKey(variant) {
    return `c:${variant?.colorBuffer ? 'B' : 'U'}|s:${variant?.sizeBuffer ? 'B' : 'U'}|o:${variant?.outlineWidthBuffer ? 'B' : 'U'}|oc:${variant?.outlineColorBuffer ? 'B' : 'U'}`;
  }

  getEdgeVariantKey(variant) {
    return [
      `f:${variant?.fastPath ? 1 : 0}`,
      `cm:${variant?.cameraMode ?? '3d'}`,
      `sz:${variant?.semanticZoom ? 1 : 0}`,
      `tr:${variant?.trim ? 1 : 0}`,
      `st:${variant?.edgeState ? 1 : 0}`,
      `et:${variant?.endpointState ? 1 : 0}`,
      `ph:${variant?.propagateHoveredNodeToEdges ? 1 : 0}`,
      `ps:${variant?.propagateSelectedNodesToEdges ? 1 : 0}`,
      `c:${variant?.colorBuffer ? 'B' : 'U'}:${variant?.colorSource}:${variant?.colorEndpoints}`,
      `w:${variant?.widthBuffer ? 'B' : 'U'}:${variant?.widthSource}:${variant?.widthEndpoints}`,
      `o:${variant?.opacityBuffer ? 'B' : 'U'}:${variant?.opacitySource}:${variant?.opacityEndpoints}`,
      `es:${variant?.endpointSizeBuffer ? 'B' : 'U'}:${variant?.endpointSizeSource}:${variant?.endpointSizeEndpoints}`,
    ].join('|');
  }

  getProgramEntry(cache, key, buildSources, uniformNames) {
    if (cache.has(key)) return cache.get(key);
    const sharedCache = this.device?.resourceCache?.webgl;
    const sharedKey = `graph:webgl:indirect:${key}`;
    let entry;
    if (sharedCache) {
      entry = sharedCache.getOrCreateProgram(sharedKey, () => {
        const sources = buildSources();
        const program = this.device.createProgram(sources.vertex, sources.fragment);
        const uniforms = this.resolveUniformLocations(program, uniformNames);
        return { program, uniforms };
      });
    } else {
      const sources = buildSources();
      const program = this.device.createProgram(sources.vertex, sources.fragment);
      const uniforms = this.resolveUniformLocations(program, uniformNames);
      entry = { program, uniforms };
      this._ownedPrograms.add(program);
    }
    cache.set(key, entry);
    return entry;
  }

  buildIndirectShaderOptions(nodeVariant, edgeVariant) {
    return {
      stateSlots: this.stateSlotCount,
      node: {
        color: nodeVariant?.colorBuffer ? 'buffer' : 'uniform',
        size: nodeVariant?.sizeBuffer ? 'buffer' : 'uniform',
        outline: nodeVariant?.outlineWidthBuffer ? 'buffer' : 'uniform',
        outlineColor: nodeVariant?.outlineColorBuffer ? 'buffer' : 'uniform',
      },
      edge: {
        color: {
          mode: edgeVariant?.colorBuffer ? 'buffer' : 'uniform',
          source: edgeVariant?.colorSource === 'node' ? 'node' : 'edge',
          endpoints: edgeVariant?.colorEndpoints ?? 'both',
        },
        width: {
          mode: edgeVariant?.widthBuffer ? 'buffer' : 'uniform',
          source: edgeVariant?.widthSource === 'node' ? 'node' : 'edge',
          endpoints: edgeVariant?.widthEndpoints ?? 'both',
        },
        opacity: {
          mode: edgeVariant?.opacityBuffer ? 'buffer' : 'uniform',
          source: edgeVariant?.opacitySource === 'node' ? 'node' : 'edge',
          endpoints: edgeVariant?.opacityEndpoints ?? 'both',
        },
        endpointSize: {
          mode: edgeVariant?.endpointSizeBuffer ? 'buffer' : 'uniform',
          source: edgeVariant?.endpointSizeSource === 'node' ? 'node' : 'edge',
          endpoints: edgeVariant?.endpointSizeEndpoints ?? 'both',
        },
        fastPath: edgeVariant?.fastPath === true,
        cameraMode: edgeVariant?.cameraMode ?? '3d',
        semanticZoom: edgeVariant?.semanticZoom === true,
        trim: edgeVariant?.trim === true,
        edgeState: edgeVariant?.edgeState === true,
        endpointState: edgeVariant?.endpointState === true,
        propagateHoveredNodeToEdges: edgeVariant?.propagateHoveredNodeToEdges === true,
        propagateSelectedNodesToEdges: edgeVariant?.propagateSelectedNodesToEdges === true,
      },
    };
  }

  getNodeProgram(nodeVariant) {
    const key = `node|${this.getNodeVariantKey(nodeVariant)}`;
    return this.getProgramEntry(
      this.nodeProgramCache,
      key,
      () => {
        const sources = createGraphWebGLSources(this.buildIndirectShaderOptions(nodeVariant, null));
        return { vertex: sources.NODE_VERTEX_SOURCE, fragment: sources.NODE_FRAGMENT_SOURCE };
      },
      NODE_UNIFORM_NAMES,
    );
  }

  getEdgeProgram(kind, nodeVariant, edgeVariant, weighted = false) {
    const suffix = kind === 'quad' ? 'edge-quad' : 'edge-line';
    const cache = weighted
      ? (kind === 'quad' ? this.edgeWeightedQuadProgramCache : this.edgeWeightedProgramCache)
      : (kind === 'quad' ? this.edgeQuadProgramCache : this.edgeProgramCache);
    const uniformNames = kind === 'quad' ? EDGE_QUAD_UNIFORM_NAMES : EDGE_UNIFORM_NAMES;
    const key = `${suffix}|${weighted ? 'w' : 'a'}|${this.getNodeVariantKey(nodeVariant)}|${this.getEdgeVariantKey(edgeVariant)}`;
    return this.getProgramEntry(
      cache,
      key,
      () => {
        const sources = createGraphWebGLSources(this.buildIndirectShaderOptions(nodeVariant, edgeVariant));
        return {
          vertex: kind === 'quad' ? sources.EDGE_QUAD_VERTEX_SOURCE : sources.EDGE_VERTEX_SOURCE,
          fragment: weighted
            ? (kind === 'quad' ? sources.EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE : sources.EDGE_WEIGHTED_FRAGMENT_SOURCE)
            : sources.EDGE_FRAGMENT_SOURCE,
        };
      },
      uniformNames,
    );
  }

  applyEdgeBlend(gl, mode) {
    switch (mode) {
      case 'additive':
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        break;
      case 'screen':
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
        break;
      case 'max':
        gl.blendEquation(gl.MAX);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        break;
      default:
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        break;
    }
  }

  destroyWeightedTargets() {
    const { gl } = this;
    if (!gl) return;
    if (this.weightedFramebuffer) gl.deleteFramebuffer(this.weightedFramebuffer);
    if (this.weightedColor) gl.deleteTexture(this.weightedColor);
    if (this.weightedWeight) gl.deleteTexture(this.weightedWeight);
    if (this.weightedDepth) gl.deleteRenderbuffer(this.weightedDepth);
    this.weightedFramebuffer = null;
    this.weightedColor = null;
    this.weightedWeight = null;
    this.weightedDepth = null;
    this.weightedSize = null;
    this._activeNodePositionTexture = null;
    this._activeNodePositionTextureMeta = null;
  }

  ensureWeightedTargets(width, height) {
    if (!this.weightedSupported) return false;
    const { gl } = this;
    if (!gl) return false;
    const targetWidth = Math.max(1, Math.floor(width));
    const targetHeight = Math.max(1, Math.floor(height));
    if (this.weightedSize && this.weightedSize.width === targetWidth && this.weightedSize.height === targetHeight) {
      return true;
    }

    this.destroyWeightedTargets();

    const framebuffer = gl.createFramebuffer();
    const color = gl.createTexture();
    const weight = gl.createTexture();
    const depth = gl.createRenderbuffer();

    gl.bindTexture(gl.TEXTURE_2D, color);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, targetWidth, targetHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);

    gl.bindTexture(gl.TEXTURE_2D, weight);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, targetWidth, targetHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);

    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, targetWidth, targetHeight);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, weight, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.warn('GraphLayerWebGL: weighted framebuffer incomplete, falling back to alpha.', status);
      this.destroyWeightedTargets();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.weightedFramebuffer = framebuffer;
    this.weightedColor = color;
    this.weightedWeight = weight;
    this.weightedDepth = depth;
    this.weightedSize = { width: targetWidth, height: targetHeight };
    return true;
  }

  ensureResolvePrograms() {
    const { gl } = this;
    if (!gl) return false;
    if (this.edgeResolveProgram && this.edgeResolveTonemapProgram && this.edgeResolveBoostProgram) return true;

    const sharedCache = this.device?.resourceCache?.webgl;
    const getProgram = (cacheKey, vert, frag) => {
      if (!sharedCache) return this.device.createProgram(vert, frag);
      const entry = sharedCache.getOrCreateProgram(cacheKey, () => ({ program: this.device.createProgram(vert, frag) }));
      return entry?.program ?? null;
    };
    const sources = createGraphWebGLSources();
    this.edgeResolveProgram = getProgram(
      'graph:webgl:indirect:resolve:base',
      sources.EDGE_RESOLVE_VERTEX_SOURCE,
      sources.EDGE_RESOLVE_FRAGMENT_SOURCE,
    );
    this.edgeResolveTonemapProgram = getProgram(
      'graph:webgl:indirect:resolve:tonemap',
      sources.EDGE_RESOLVE_VERTEX_SOURCE,
      sources.EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE,
    );
    this.edgeResolveBoostProgram = getProgram(
      'graph:webgl:indirect:resolve:boost',
      sources.EDGE_RESOLVE_VERTEX_SOURCE,
      sources.EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE,
    );
    if (!this.edgeResolveProgram || !this.edgeResolveTonemapProgram || !this.edgeResolveBoostProgram) return false;
    this.edgeResolveUniformColor = gl.getUniformLocation(this.edgeResolveProgram, 'u_colorAccum');
    this.edgeResolveUniformWeight = gl.getUniformLocation(this.edgeResolveProgram, 'u_weightAccum');
    this.edgeResolveTonemapUniformColor = gl.getUniformLocation(this.edgeResolveTonemapProgram, 'u_colorAccum');
    this.edgeResolveTonemapUniformWeight = gl.getUniformLocation(this.edgeResolveTonemapProgram, 'u_weightAccum');
    this.edgeResolveBoostUniformColor = gl.getUniformLocation(this.edgeResolveBoostProgram, 'u_colorAccum');
    this.edgeResolveBoostUniformWeight = gl.getUniformLocation(this.edgeResolveBoostProgram, 'u_weightAccum');
    return true;
  }

  prepareWeightedWebGL(width, height) {
    return this.ensureResolvePrograms() && this.ensureWeightedTargets(width, height);
  }

  initializeGeometry() {
    const { gl } = this;
    this.nodeQuadBuffer = gl.createBuffer();
    this.nodeIdBuffer = gl.createBuffer();
    this.edgeIdBuffer = gl.createBuffer();
    this.edgeQuadBuffer = gl.createBuffer();

    const nodeQuad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, nodeQuad, gl.STATIC_DRAW);

    this.nodeVao = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeIdBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 4, 0);
    gl.vertexAttribDivisor(1, 1);

    this.edgeVao = gl.createVertexArray();
    gl.bindVertexArray(this.edgeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeIdBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 1, gl.UNSIGNED_INT, 4, 0);
    gl.vertexAttribDivisor(0, 1);

    const edgeQuadCorners = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, edgeQuadCorners, gl.STATIC_DRAW);

    this.edgeQuadVao = gl.createVertexArray();
    gl.bindVertexArray(this.edgeQuadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeIdBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribIPointer(1, 1, gl.UNSIGNED_INT, 4, 0);
    gl.vertexAttribDivisor(1, 1);

    this.edgeResolveBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeResolveBuffer);
    const resolveQuad = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, resolveQuad, gl.STATIC_DRAW);

    this.edgeResolveVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeResolveVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeResolveBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  createTexture() {
    const tex = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    return tex;
  }

  initializeTextures() {
    this.nodeTextures.positions = this.createTexture();
    this.nodeTextures.positionsFrom = this.createTexture();
    this.nodeTextures.colors = this.createTexture();
    this.nodeTextures.sizes = this.createTexture();
    this.nodeTextures.states = this.createTexture();
    this.nodeTextures.outlineWidths = this.createTexture();
    this.nodeTextures.outlineColors = this.createTexture();
    this.nodeTextures.edgeColorSource = this.createTexture();
    this.nodeTextures.edgeWidthSource = this.createTexture();
    this.nodeTextures.edgeOpacitySource = this.createTexture();
    this.nodeTextures.edgeEndpointSizeSource = this.createTexture();
    this.edgeTextures.endpoints = this.createTexture();
    this.edgeTextures.colors = this.createTexture();
    this.edgeTextures.widths = this.createTexture();
    this.edgeTextures.opacities = this.createTexture();
    this.edgeTextures.endpointSizes = this.createTexture();
    this.edgeTextures.states = this.createTexture();
    this.edgeTextures.endpointStates = this.createTexture();
  }

  resolveEdgeVariant(visualConfig, options = {}) {
    const edgeCfg = visualConfig?.edge ?? null;
    const fastPath = options.fastPath === true || this.isFastEdgeRenderingActive?.() === true;
    const specialization = this.resolveEdgeSpecialization({
      fastPath,
      is2D: options.is2D === true,
    });
    const normalize = (entry, fallbackSource = 'edge') => {
      if (!entry || typeof entry !== 'object') {
        return {
          mode: 'buffer',
          source: fallbackSource,
          endpoints: 'both',
          doubleWidth: true,
          nodeAttribute: null,
        };
      }
      return {
        mode: entry.mode ?? 'buffer',
        source: entry.source ?? fallbackSource,
        endpoints: normalizeEndpoints(entry.endpoints),
        doubleWidth: entry.doubleWidth !== false,
        nodeAttribute: entry.nodeAttribute ?? null,
      };
    };
    const color = normalize(edgeCfg?.color, 'edge');
    const width = normalize(edgeCfg?.width, 'edge');
    const opacity = normalize(edgeCfg?.opacity, 'edge');
    const endpointSize = normalize(edgeCfg?.endpointSize, 'edge');
    if (fastPath) {
      return {
        colorBuffer: color.mode !== 'uniform',
        colorSource: color.source,
        colorEndpoints: color.endpoints,
        colorNodeAttribute: color.nodeAttribute,
        colorDoubleWidth: color.doubleWidth,
        widthBuffer: false,
        widthSource: 'edge',
        widthEndpoints: 'both',
        widthNodeAttribute: null,
        widthDoubleWidth: false,
        opacityBuffer: false,
        opacitySource: 'edge',
        opacityEndpoints: 'both',
        opacityNodeAttribute: null,
        opacityDoubleWidth: false,
        endpointSizeBuffer: false,
        endpointSizeSource: 'edge',
        endpointSizeEndpoints: 'both',
        endpointSizeNodeAttribute: null,
        endpointSizeDoubleWidth: false,
        cameraMode: specialization.cameraMode,
        semanticZoom: specialization.semanticZoom,
        trim: specialization.trim,
        edgeState: specialization.edgeState,
        endpointState: specialization.endpointState,
        propagateHoveredNodeToEdges: specialization.propagateHoveredNodeToEdges,
        propagateSelectedNodesToEdges: specialization.propagateSelectedNodesToEdges,
        fastPath: true,
      };
    }
    return {
      colorBuffer: color.mode !== 'uniform',
      colorSource: color.source,
      colorEndpoints: color.endpoints,
      colorNodeAttribute: color.nodeAttribute,
      colorDoubleWidth: color.doubleWidth,
      widthBuffer: width.mode !== 'uniform',
      widthSource: width.source,
      widthEndpoints: width.endpoints,
      widthNodeAttribute: width.nodeAttribute,
      widthDoubleWidth: width.doubleWidth,
      opacityBuffer: opacity.mode !== 'uniform',
      opacitySource: opacity.source,
      opacityEndpoints: opacity.endpoints,
      opacityNodeAttribute: opacity.nodeAttribute,
      opacityDoubleWidth: opacity.doubleWidth,
      endpointSizeBuffer: specialization.trim && endpointSize.mode !== 'uniform',
      endpointSizeSource: endpointSize.source,
      endpointSizeEndpoints: endpointSize.endpoints,
      endpointSizeNodeAttribute: endpointSize.nodeAttribute,
      endpointSizeDoubleWidth: endpointSize.doubleWidth,
      cameraMode: specialization.cameraMode,
      semanticZoom: specialization.semanticZoom,
      trim: specialization.trim,
      edgeState: specialization.edgeState,
      endpointState: specialization.endpointState,
      propagateHoveredNodeToEdges: specialization.propagateHoveredNodeToEdges,
      propagateSelectedNodesToEdges: specialization.propagateSelectedNodesToEdges,
      fastPath: false,
    };
  }

  withSparseGraph(network, topologyVersions, indices, edgeNodeAttributes, fn) {
    if (!network) return fn(null);
    if (typeof network.withBufferAccess !== 'function') {
      console.warn('GraphLayerWebGL: network does not support buffer access sessions');
      return false;
    }
    const hasNodeAttribute = (name) => (
      Boolean(name) && (network._nodeAttributes?.has?.(name) ?? false)
    );
    const hasEdgeAttribute = (name) => (
      Boolean(name) && (network._edgeAttributes?.has?.(name) ?? false)
    );
    return network.withBufferAccess(() => {
      const nodeIndices = indices?.node ?? network.nodeIndices ?? null;
      const edgeIndices = indices?.edge ?? network.edgeIndices ?? null;
      const safeGet = (scope, name) => {
        if (!name) return null;
        if (scope === 'node' && !hasNodeAttribute(name)) return null;
        if (scope === 'edge' && !hasEdgeAttribute(name)) return null;
        const getter = scope === 'node' ? network.getNodeAttributeBuffer : network.getEdgeAttributeBuffer;
        if (typeof getter !== 'function') return null;
        return getter.call(network, name);
      };

      const nodePositions = safeGet('node', NODE_POSITION_ATTRIBUTE);
      const nodeColors = safeGet('node', NODE_COLOR_ATTRIBUTE);
      const nodeSizes = safeGet('node', NODE_SIZE_ATTRIBUTE);
      const nodeStates = safeGet('node', NODE_STATE_ATTRIBUTE);
      const nodeOutlineWidths = safeGet('node', NODE_OUTLINE_WIDTH_ATTRIBUTE);
      const nodeOutlineColors = safeGet('node', NODE_OUTLINE_COLOR_ATTRIBUTE);
      const edgeColors = safeGet('edge', EDGE_COLOR_ATTRIBUTE);
      const edgeWidths = safeGet('edge', EDGE_WIDTH_ATTRIBUTE);
      const edgeOpacities = safeGet('edge', EDGE_OPACITY_ATTRIBUTE);
      const edgeEndpointSizes = safeGet('edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE);
      const edgeStates = safeGet('edge', EDGE_STATE_ATTRIBUTE);
      const edgeEndpointStates = safeGet('edge', EDGE_ENDPOINTS_STATE_ATTRIBUTE);

      const edgeNodeColor = edgeNodeAttributes?.color ? safeGet('node', edgeNodeAttributes.color) : null;
      const edgeNodeWidth = edgeNodeAttributes?.width ? safeGet('node', edgeNodeAttributes.width) : null;
      const edgeNodeOpacity = edgeNodeAttributes?.opacity ? safeGet('node', edgeNodeAttributes.opacity) : null;
      const edgeNodeEndpointSize = edgeNodeAttributes?.endpointSize
        ? safeGet('node', edgeNodeAttributes.endpointSize)
        : null;
      const positionOverride = this.resolvePositionSourceOverride(network, {
        backend: 'webgl',
        gl: this.gl,
        device: this.device,
      });
      const resolvedNodePositions = positionOverride?.view ?? nodePositions?.view ?? null;
      const resolvedNodePositionVersion = Number.isFinite(positionOverride?.version)
        ? Number(positionOverride.version)
        : (nodePositions?.version ?? 0);
      const resolvedNodePositionTexture = positionOverride?.webglTexture ?? null;
      const resolvedNodePositionTextureVersion = Number.isFinite(positionOverride?.webglTextureVersion)
        ? Number(positionOverride.webglTextureVersion)
        : resolvedNodePositionVersion;
      const resolvedNodePositionTextureCount = Number.isFinite(positionOverride?.webglTextureCount)
        ? Math.max(0, Math.floor(Number(positionOverride.webglTextureCount)))
        : Math.floor((resolvedNodePositions?.length ?? 0) / 3);
      const resolvedNodePositionTextureMeta = positionOverride?.webglTextureMeta ?? null;

      const nodes = {
        positions: resolvedNodePositions,
        colors: nodeColors?.view ?? null,
        sizes: nodeSizes?.view ?? null,
        states: nodeStates?.view ?? null,
        outlineWidths: nodeOutlineWidths?.view ?? null,
        outlineColors: nodeOutlineColors?.view ?? null,
        positionTexture: resolvedNodePositionTexture,
        positionTextureVersion: resolvedNodePositionTextureVersion,
        positionTextureCount: resolvedNodePositionTextureCount,
        positionTextureMeta: resolvedNodePositionTextureMeta,
        indices: nodeIndices,
        count: nodeIndices?.length ?? 0,
        versions: {
          positions: resolvedNodePositionVersion,
          colors: nodeColors?.version ?? 0,
          sizes: nodeSizes?.version ?? 0,
          states: nodeStates?.version ?? 0,
          outlineWidths: nodeOutlineWidths?.version ?? 0,
          outlineColors: nodeOutlineColors?.version ?? 0,
          indices: topologyVersions?.node ?? 0,
          topology: topologyVersions?.node ?? 0,
        },
      };

      const edges = {
        endpoints: network.edgesView ?? null,
        colors: edgeColors?.view ?? null,
        widths: edgeWidths?.view ?? null,
        opacities: edgeOpacities?.view ?? null,
        endpointSizes: edgeEndpointSizes?.view ?? null,
        states: edgeStates?.view ?? null,
        endpointStates: edgeEndpointStates?.view ?? null,
        indices: edgeIndices,
        count: edgeIndices?.length ?? 0,
        versions: {
          endpoints: topologyVersions?.edge ?? 0,
          colors: edgeColors?.version ?? 0,
          widths: edgeWidths?.version ?? 0,
          opacities: edgeOpacities?.version ?? 0,
          endpointSizes: edgeEndpointSizes?.version ?? 0,
          states: edgeStates?.version ?? 0,
          endpointStates: edgeEndpointStates?.version ?? 0,
          indices: topologyVersions?.edge ?? 0,
          topology: topologyVersions?.edge ?? 0,
        },
      };

      const nodeEdgeSources = {
        color: edgeNodeColor?.view
          ? {
            attribute: edgeNodeAttributes.color,
            view: edgeNodeColor.view,
            version: edgeNodeColor.version ?? 0,
          }
          : null,
        width: edgeNodeWidth?.view
          ? {
            attribute: edgeNodeAttributes.width,
            view: edgeNodeWidth.view,
            version: edgeNodeWidth.version ?? 0,
          }
          : null,
        opacity: edgeNodeOpacity?.view
          ? {
            attribute: edgeNodeAttributes.opacity,
            view: edgeNodeOpacity.view,
            version: edgeNodeOpacity.version ?? 0,
          }
          : null,
        endpointSize: edgeNodeEndpointSize?.view
          ? {
            attribute: edgeNodeAttributes.endpointSize,
            view: edgeNodeEndpointSize.view,
            version: edgeNodeEndpointSize.version ?? 0,
          }
          : null,
      };

      return fn({ nodes, edges, nodeEdgeSources });
    });
  }

  getTextureLayout(count) {
    const max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) ?? 16384;
    const safeCount = Math.max(1, Math.floor(Number(count) || 0));
    const width = Math.min(max, safeCount);
    const height = Math.ceil(safeCount / width);
    if (height > max) {
      throw new Error(
        `WebGL2 indirect requires texture dimensions <= MAX_TEXTURE_SIZE (${max}), `
        + `got ${safeCount} texels -> ${width}x${height}.`,
      );
    }
    return { width, height };
  }

  uploadTexture2D(texture, view, components, count, formatInfo, type) {
    const { gl } = this;
    const { width, height } = this.getTextureLayout(count);
    const valueCount = width * height * components;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    const directView = (view.length === valueCount) ? view : this._packTextureUpload(view, valueCount);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      formatInfo.internalFormat,
      width,
      height,
      0,
      formatInfo.format,
      type,
      directView,
    );
  }

  _packTextureUpload(view, valueCount) {
    const ctor = typeof view?.constructor === 'function' ? view.constructor : Float32Array;
    const key = ctor.name || 'TypedArray';
    let scratch = this._uploadScratch.get(key) ?? null;
    if (!(scratch instanceof ctor) || scratch.length < valueCount) {
      scratch = new ctor(valueCount);
      this._uploadScratch.set(key, scratch);
    }
    scratch.fill(0, 0, valueCount);
    if (view && typeof view.subarray === 'function' && view.length > 0) {
      scratch.set(view.subarray(0, Math.min(view.length, valueCount)), 0);
    }
    return scratch.length === valueCount ? scratch : scratch.subarray(0, valueCount);
  }

  isSameView(meta, view, version, count) {
    return Boolean(
      meta
      && meta.version === (version ?? 0)
      && meta.count === count
      && meta.buffer === view?.buffer
      && meta.byteOffset === (view?.byteOffset ?? 0)
      && meta.byteLength === (view?.byteLength ?? 0),
    );
  }

  rememberView(slot, view, version, count) {
    this.textureMeta[slot] = {
      version: version ?? 0,
      count,
      buffer: view?.buffer ?? null,
      byteOffset: view?.byteOffset ?? 0,
      byteLength: view?.byteLength ?? 0,
    };
  }

  uploadFloatTexture(slot, texture, view, components, count, version) {
    if (!view || !texture || !count) return false;
    if (this.isSameView(this.textureMeta[slot], view, version, count)) return true;
    const { gl } = this;
    const formatInfo = components === 1
      ? { internalFormat: gl.R32F, format: gl.RED }
      : (components === 2
        ? { internalFormat: gl.RG32F, format: gl.RG }
        : (components === 3
          ? { internalFormat: gl.RGB32F, format: gl.RGB }
          : { internalFormat: gl.RGBA32F, format: gl.RGBA }));
    this.uploadTexture2D(texture, view, components, count, formatInfo, gl.FLOAT);
    this.rememberView(slot, view, version, count);
    return true;
  }

  uploadUintTexture(slot, texture, view, components, count, version) {
    if (!view || !texture || !count) return false;
    if (this.isSameView(this.textureMeta[slot], view, version, count)) return true;
    const { gl } = this;
    const formatInfo = components === 2
      ? { internalFormat: gl.RG32UI, format: gl.RG_INTEGER }
      : { internalFormat: gl.R32UI, format: gl.RED_INTEGER };
    this.uploadTexture2D(texture, view, components, count, formatInfo, gl.UNSIGNED_INT);
    this.rememberView(slot, view, version, count);
    return true;
  }

  uploadIdBuffer(slot, buffer, view, version, count) {
    if (!view || !buffer) return 0;
    const meta = this.bufferMeta[slot];
    const same = Boolean(
      meta
      && meta.version === (version ?? 0)
      && meta.count === count
      && meta.buffer === view.buffer
      && meta.byteOffset === view.byteOffset
      && meta.byteLength === view.byteLength,
    );
    if (!same) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
      this.gl.bufferData(this.gl.ARRAY_BUFFER, view, this.gl.DYNAMIC_DRAW);
      this.bufferMeta[slot] = {
        version: version ?? 0,
        count,
        buffer: view.buffer,
        byteOffset: view.byteOffset,
        byteLength: view.byteLength,
      };
    }
    return count;
  }

  bindTexture(unit, texture) {
    this.gl.activeTexture(this.gl.TEXTURE0 + unit);
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
  }

  getSharedSparseResources() {
    const nodePositionsTexture = this._activeNodePositionTexture ?? this.nodeTextures.positions ?? null;
    const nodePositionsMeta = this._activeNodePositionTextureMeta ?? this.textureMeta.nodePositions ?? null;
    return {
      textures: {
        nodePositions: nodePositionsTexture,
        nodePositionsFrom: this.nodeTextures.positionsFrom ?? null,
        nodeSizes: this.nodeTextures.sizes ?? null,
        nodeOutlineWidths: this.nodeTextures.outlineWidths ?? null,
        nodeWidthSource: this.nodeTextures.edgeWidthSource ?? null,
        nodeEndpointSizeSource: this.nodeTextures.edgeEndpointSizeSource ?? null,
        edgeEndpoints: this.edgeTextures.endpoints ?? null,
        edgeWidths: this.edgeTextures.widths ?? null,
        edgeEndpointSizes: this.edgeTextures.endpointSizes ?? null,
      },
      textureMeta: {
        nodePositions: nodePositionsMeta,
        nodePositionsFrom: this.textureMeta.nodePositionsFrom ?? null,
        nodeSizes: this.textureMeta.nodeSizes ?? null,
        nodeOutlineWidths: this.textureMeta.nodeOutlineWidths ?? null,
        nodeEdgeWidths: this.textureMeta.nodeEdgeWidths ?? null,
        nodeEdgeEndpointSizes: this.textureMeta.nodeEdgeEndpointSizes ?? null,
        edgeEndpoints: this.textureMeta.edgeEndpoints ?? null,
        edgeWidths: this.textureMeta.edgeWidths ?? null,
        edgeEndpointSizes: this.textureMeta.edgeEndpointSizes ?? null,
      },
    };
  }

  render(context, frame) {
    if (!context || context.type !== 'webgl2') return;
    const network = frame?.network;
    if (!network) return;
    const cameraUniforms = this.getCameraUniforms(frame?.camera, context);
    if (!cameraUniforms) return;
    const is2D = cameraUniforms.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
    const semanticZoomExponent = Number.isFinite(this.semanticZoomExponent) ? this.semanticZoomExponent : 0;

    let topologyVersions = { node: 0, edge: 0 };
    if (typeof network.getTopologyVersions === 'function') {
      try {
        topologyVersions = network.getTopologyVersions() ?? topologyVersions;
      } catch (_) {
        warnOnce(
          this,
          'render-topology-versions',
          'GraphLayerWebGL: failed to read topology versions during render; using zero versions.',
          { network },
        );
        topologyVersions = { node: 0, edge: 0 };
      }
    }
    debugWebGLRender('graph:render:start', {
      target: context.target
        ? {
          width: context.target.width ?? null,
          height: context.target.height ?? null,
          hasHandle: Boolean(context.target.handle),
        }
        : null,
      viewport: context.viewport ?? null,
      topologyVersions,
      drawingBuffer: this.gl
        ? {
          width: this.gl.drawingBufferWidth,
          height: this.gl.drawingBufferHeight,
        }
        : null,
    });
    const schema = GraphVisualSchema.fromNetwork(network, {
      nodeOutlineUseAttributes: this.nodeOutlineUseAttributes === true,
    });
    const visualConfig = schema?.visualConfig ?? null;
    const nodeVariant = this.resolveNodeVariant(visualConfig);
    const nodeConfig = visualConfig?.node ?? null;
    const edgeConfig = visualConfig?.edge ?? null;
    const fastEdges = this.isFastEdgeRenderingActive?.() === true;
    const edgeRenderingMode = this.getEffectiveEdgeRenderingMode?.() ?? this.edgeRenderingMode;
    const edgeVariant = this.resolveEdgeVariant(visualConfig, { fastPath: fastEdges, is2D });
    const nodeProgramEntry = this.getNodeProgram(nodeVariant);
    const edgeLineProgramEntry = this.getEdgeProgram('line', nodeVariant, edgeVariant);
    const edgeQuadProgramEntry = this.getEdgeProgram('quad', nodeVariant, edgeVariant);
    const edgeLineWeightedProgramEntry = this.getEdgeProgram('line', nodeVariant, edgeVariant, true);
    const edgeQuadWeightedProgramEntry = this.getEdgeProgram('quad', nodeVariant, edgeVariant, true);
    const nodeColorBufferEnabled = nodeVariant ? nodeVariant.colorBuffer !== false : true;
    const nodeSizeBufferEnabled = nodeVariant ? nodeVariant.sizeBuffer !== false : true;
    const nodeOutlineBufferEnabled = nodeVariant ? nodeVariant.outlineWidthBuffer === true : false;
    const nodeOutlineColorBufferEnabled = nodeVariant ? nodeVariant.outlineColorBuffer === true : false;

    const nodeDefaultColor = (nodeConfig?.color?.mode === 'uniform')
      ? toRgba(nodeConfig?.color?.value, DEFAULT_NODE_COLOR)
      : toRgba(DEFAULT_NODE_COLOR, DEFAULT_NODE_COLOR);
    const nodeDefaultSize = (nodeConfig?.size?.mode === 'uniform')
      ? toNumber(nodeConfig?.size?.value, DEFAULT_NODE_SIZE)
      : DEFAULT_NODE_SIZE;
    const nodeDefaultOutline = (nodeConfig?.outline?.mode === 'uniform')
      ? toNumber(nodeConfig?.outline?.value, 0)
      : 0;
    const nodeDefaultOutlineColor = (nodeConfig?.outlineColor?.mode === 'uniform')
      ? toRgba(nodeConfig?.outlineColor?.value, this.nodeOutlineColor)
      : toRgba(this.nodeOutlineColor, this.nodeOutlineColor);

    const defaultEdgeColorPair = (edgeConfig?.color?.mode === 'uniform')
      ? toColorPair(edgeConfig?.color?.value, [DEFAULT_EDGE_COLOR, DEFAULT_EDGE_COLOR])
      : [toRgba(DEFAULT_EDGE_COLOR, DEFAULT_EDGE_COLOR), toRgba(DEFAULT_EDGE_COLOR, DEFAULT_EDGE_COLOR)];
    const defaultEdgeWidth = (edgeConfig?.width?.mode === 'uniform')
      ? toScalarPair(edgeConfig?.width?.value, [DEFAULT_EDGE_WIDTH, DEFAULT_EDGE_WIDTH])
      : [DEFAULT_EDGE_WIDTH, DEFAULT_EDGE_WIDTH];
    const defaultEdgeOpacity = (edgeConfig?.opacity?.mode === 'uniform')
      ? toScalarPair(edgeConfig?.opacity?.value, [DEFAULT_EDGE_OPACITY, DEFAULT_EDGE_OPACITY])
      : [DEFAULT_EDGE_OPACITY, DEFAULT_EDGE_OPACITY];
    const defaultEdgeEndpointSize = (edgeConfig?.endpointSize?.mode === 'uniform')
      ? toScalarPair(edgeConfig?.endpointSize?.value, [1, 1])
      : [1, 1];
    const edgeNodeAttributes = {
      color: edgeVariant?.colorSource === 'node'
        ? (edgeVariant.colorNodeAttribute ?? NODE_COLOR_ATTRIBUTE)
        : null,
      width: edgeVariant?.widthSource === 'node'
        ? (edgeVariant.widthNodeAttribute ?? NODE_SIZE_ATTRIBUTE)
        : null,
      opacity: edgeVariant?.opacitySource === 'node'
        ? (edgeVariant.opacityNodeAttribute ?? NODE_SIZE_ATTRIBUTE)
        : null,
      endpointSize: edgeVariant?.endpointSizeSource === 'node'
        ? (edgeVariant.endpointSizeNodeAttribute ?? NODE_SIZE_ATTRIBUTE)
        : null,
    };
    const customEdgeNodeAttributes = {
      color: edgeNodeAttributes.color && edgeNodeAttributes.color !== NODE_COLOR_ATTRIBUTE
        ? edgeNodeAttributes.color
        : null,
      width: edgeNodeAttributes.width && edgeNodeAttributes.width !== NODE_SIZE_ATTRIBUTE
        ? edgeNodeAttributes.width
        : null,
      opacity: edgeNodeAttributes.opacity && edgeNodeAttributes.opacity !== NODE_SIZE_ATTRIBUTE
        ? edgeNodeAttributes.opacity
        : null,
      endpointSize: edgeNodeAttributes.endpointSize && edgeNodeAttributes.endpointSize !== NODE_SIZE_ATTRIBUTE
        ? edgeNodeAttributes.endpointSize
        : null,
    };
    const usesDefaultNodeColor = Boolean(edgeNodeAttributes.color && edgeNodeAttributes.color === NODE_COLOR_ATTRIBUTE);
    const usesDefaultNodeSize = Boolean(
      (edgeNodeAttributes.width && edgeNodeAttributes.width === NODE_SIZE_ATTRIBUTE)
      || (edgeNodeAttributes.opacity && edgeNodeAttributes.opacity === NODE_SIZE_ATTRIBUTE)
      || (edgeNodeAttributes.endpointSize && edgeNodeAttributes.endpointSize === NODE_SIZE_ATTRIBUTE),
    );
    const defaultNodeSourceScalar = toNumber(nodeDefaultSize, DEFAULT_NODE_SIZE);
    const defaultNodeWidth = usesDefaultNodeSize
      ? [defaultNodeSourceScalar, defaultNodeSourceScalar]
      : defaultEdgeWidth;
    const defaultNodeOpacity = usesDefaultNodeSize
      ? [defaultNodeSourceScalar, defaultNodeSourceScalar]
      : defaultEdgeOpacity;
    const defaultNodeEndpointSize = usesDefaultNodeSize
      ? [defaultNodeSourceScalar, defaultNodeSourceScalar]
      : defaultEdgeEndpointSize;

    this.withSparseGraph(
      network,
      topologyVersions,
      null,
      customEdgeNodeAttributes,
      (geometry) => {
        if (!geometry) return false;
        const { gl } = this;
        const nodes = geometry.nodes;
        const edges = geometry.edges;
        debugWebGLRender('graph:render:geometry', {
          nodes: {
            count: nodes.count,
            indices: nodes.indices?.length ?? 0,
            positions: nodes.positions?.length ?? 0,
            colors: nodes.colors?.length ?? 0,
            sizes: nodes.sizes?.length ?? 0,
            states: nodes.states?.length ?? 0,
            positionTexture: Boolean(nodes.positionTexture),
          },
          edges: {
            count: edges.count,
            indices: edges.indices?.length ?? 0,
            colors: edges.colors?.length ?? 0,
            widths: edges.widths?.length ?? 0,
            opacities: edges.opacities?.length ?? 0,
            endpointSizes: edges.endpointSizes?.length ?? 0,
            states: edges.states?.length ?? 0,
          },
          nodeEdgeSources: {
            color: Boolean(geometry.nodeEdgeSources?.color?.view),
            width: Boolean(geometry.nodeEdgeSources?.width?.view),
            opacity: Boolean(geometry.nodeEdgeSources?.opacity?.view),
            endpointSize: Boolean(geometry.nodeEdgeSources?.endpointSize?.view),
          },
        });
        const hasNodeColorsForNodes = Boolean(nodeColorBufferEnabled && nodes.colors);
        const hasNodeSizesForNodes = Boolean(nodeSizeBufferEnabled && nodes.sizes);
        const hasNodeStatesForNodes = Boolean(nodes.states);
        const hasNodeOutlineWidthsForNodes = Boolean(nodeOutlineBufferEnabled && nodes.outlineWidths);
        const hasNodeOutlineColorsForNodes = Boolean(nodeOutlineColorBufferEnabled && nodes.outlineColors);
        const hasNodeColorsForEdges = Boolean(nodes.colors);
        const hasNodeSizesForEdges = Boolean(nodes.sizes);
        const nodeColorSource = geometry.nodeEdgeSources?.color?.view
          ?? (usesDefaultNodeColor ? (hasNodeColorsForEdges ? nodes.colors : null) : null);
        const nodeWidthSource = geometry.nodeEdgeSources?.width?.view
          ?? (usesDefaultNodeSize ? (hasNodeSizesForEdges ? nodes.sizes : null) : null);
        const nodeOpacitySource = geometry.nodeEdgeSources?.opacity?.view
          ?? (usesDefaultNodeSize ? (hasNodeSizesForEdges ? nodes.sizes : null) : null);
        const nodeEndpointSizeSource = geometry.nodeEdgeSources?.endpointSize?.view
          ?? (usesDefaultNodeSize ? (hasNodeSizesForEdges ? nodes.sizes : null) : null);
        const mapEndpointMode = (value) => (value === 'source' ? 1 : (value === 'destination' ? 2 : 0));
        const interpolationState = this.getPositionInterpolationState?.() ?? this.positionInterpolation ?? null;
        const interpolationEnabled = interpolationState?.enabled === true;
        const interpolationFactor = clamp01(interpolationState?.factor, 1);
        const interpolationSourceView = interpolationState?.sourceView ?? null;
        const interpolationSourceVersion = Number.isFinite(interpolationState?.sourceVersion)
          ? Number(interpolationState.sourceVersion)
          : 0;
        const interpolationSourceCount = Number.isFinite(interpolationState?.sourceCount)
          ? Math.max(0, Math.floor(Number(interpolationState.sourceCount)))
          : Math.floor((interpolationSourceView?.length ?? 0) / 3);
        const delegateNodePositionTexture = nodes.positionTexture ?? null;
        const delegateNodeTextureMeta = delegateNodePositionTexture
          ? {
            version: nodes.positionTextureVersion ?? nodes.versions?.positions ?? 0,
            count: nodes.positionTextureCount ?? Math.floor((nodes.positions?.length ?? 0) / 3),
            buffer: delegateNodePositionTexture,
            byteOffset: 0,
            byteLength: 0,
          }
          : null;
        const activeNodePositionTexture = delegateNodePositionTexture ?? this.nodeTextures.positions ?? null;
        const activeNodePositionMeta = delegateNodeTextureMeta ?? this.textureMeta.nodePositions ?? null;
        const interpolationSourceTexture = interpolationState?.sourceWebGLTexture ?? null;
        const interpolationSourceTextureMeta = interpolationState?.sourceTextureMeta ?? null;
        const activeNodePositionFromTexture = interpolationSourceTexture ?? this.nodeTextures.positionsFrom ?? null;
        const resolvedNodePositionFromTexture = interpolationEnabled
          ? (activeNodePositionFromTexture ?? activeNodePositionTexture)
          : activeNodePositionTexture;
        this._activeNodePositionTexture = activeNodePositionTexture;
        this._activeNodePositionTextureMeta = activeNodePositionMeta;

        this.nodeCount = this.uploadIdBuffer('nodeIds', this.nodeIdBuffer, nodes.indices, nodes.versions?.indices, nodes.count);
        this.edgeCount = this.uploadIdBuffer('edgeIds', this.edgeIdBuffer, edges.indices, edges.versions?.indices, edges.count);

        if (this.nodeCount > 0) {
          if (!activeNodePositionTexture) {
            throw new Error('WebGL2 indirect rendering requires a node position texture.');
          }
          if (!delegateNodePositionTexture && !nodes.positions) {
            throw new Error('WebGL2 indirect rendering requires node position values.');
          }
          if (!delegateNodePositionTexture && nodes.positions) {
            const positionCount = Math.floor((nodes.positions.length ?? 0) / 3);
            this.uploadFloatTexture(
              'nodePositions',
              this.nodeTextures.positions,
              nodes.positions,
              3,
              positionCount,
              nodes.versions?.positions ?? 0,
            );
          }
          if (interpolationEnabled && !interpolationSourceTexture && interpolationSourceView) {
            this.uploadFloatTexture(
              'nodePositionsFrom',
              this.nodeTextures.positionsFrom,
              interpolationSourceView,
              3,
              interpolationSourceCount,
              interpolationSourceVersion,
            );
          } else if (interpolationSourceTextureMeta) {
            this.textureMeta.nodePositionsFrom = interpolationSourceTextureMeta;
          } else if (!interpolationEnabled) {
            this.textureMeta.nodePositionsFrom = this.textureMeta.nodePositions;
          }
          if (hasNodeSizesForNodes) {
            const sizeCount = nodes.sizes.length ?? 0;
            this.uploadFloatTexture(
              'nodeSizes',
              this.nodeTextures.sizes,
              nodes.sizes,
              1,
              sizeCount,
              nodes.versions?.sizes ?? 0,
            );
          }
          if (hasNodeStatesForNodes) {
            const stateCount = nodes.states.length ?? 0;
            this.uploadUintTexture(
              'nodeStates',
              this.nodeTextures.states,
              nodes.states,
              1,
              stateCount,
              nodes.versions?.states ?? 0,
            );
          }
          if (hasNodeColorsForNodes) {
            const colorCount = Math.floor((nodes.colors.length ?? 0) / 4);
            this.uploadFloatTexture(
              'nodeColors',
              this.nodeTextures.colors,
              nodes.colors,
              4,
              colorCount,
              nodes.versions?.colors ?? 0,
            );
          }
          if (hasNodeOutlineWidthsForNodes) {
            const outlineCount = nodes.outlineWidths.length ?? 0;
            this.uploadFloatTexture(
              'nodeOutlineWidths',
              this.nodeTextures.outlineWidths,
              nodes.outlineWidths,
              1,
              outlineCount,
              nodes.versions?.outlineWidths ?? 0,
            );
          }
          if (hasNodeOutlineColorsForNodes) {
            const outlineColorCount = Math.floor((nodes.outlineColors.length ?? 0) / 4);
            this.uploadFloatTexture(
              'nodeOutlineColors',
              this.nodeTextures.outlineColors,
              nodes.outlineColors,
              4,
              outlineColorCount,
              nodes.versions?.outlineColors ?? 0,
            );
          }
          if (nodeColorSource) {
            const sourceCount = Math.floor((nodeColorSource.length ?? 0) / 4);
            this.uploadFloatTexture(
              'nodeEdgeColors',
              this.nodeTextures.edgeColorSource,
              nodeColorSource,
              4,
              sourceCount,
              geometry.nodeEdgeSources?.color?.version ?? nodes.versions?.colors ?? 0,
            );
          }
          if (nodeWidthSource) {
            this.uploadFloatTexture(
              'nodeEdgeWidths',
              this.nodeTextures.edgeWidthSource,
              nodeWidthSource,
              1,
              nodeWidthSource.length ?? 0,
              geometry.nodeEdgeSources?.width?.version ?? nodes.versions?.sizes ?? 0,
            );
          }
          if (nodeOpacitySource) {
            this.uploadFloatTexture(
              'nodeEdgeOpacities',
              this.nodeTextures.edgeOpacitySource,
              nodeOpacitySource,
              1,
              nodeOpacitySource.length ?? 0,
              geometry.nodeEdgeSources?.opacity?.version ?? nodes.versions?.sizes ?? 0,
            );
          }
          if (nodeEndpointSizeSource) {
            this.uploadFloatTexture(
              'nodeEdgeEndpointSizes',
              this.nodeTextures.edgeEndpointSizeSource,
              nodeEndpointSizeSource,
              1,
              nodeEndpointSizeSource.length ?? 0,
              geometry.nodeEdgeSources?.endpointSize?.version ?? nodes.versions?.sizes ?? 0,
            );
          }
        }
        if (this.edgeCount > 0 && edges.endpoints) {
          const endpointCount = Math.floor((edges.endpoints.length ?? 0) / 2);
          this.uploadUintTexture(
            'edgeEndpoints',
            this.edgeTextures.endpoints,
            edges.endpoints,
            2,
            endpointCount,
            edges.versions?.endpoints ?? 0,
          );
          if (edges.colors) {
            const edgeColorCount = Math.floor((edges.colors.length ?? 0) / 8);
            this.uploadFloatTexture(
              'edgeColors',
              this.edgeTextures.colors,
              edges.colors,
              4,
              edgeColorCount * 2,
              edges.versions?.colors ?? 0,
            );
          }
          if (edges.widths) {
            const edgeWidthCount = Math.floor((edges.widths.length ?? 0) / 2);
            this.uploadFloatTexture(
              'edgeWidths',
              this.edgeTextures.widths,
              edges.widths,
              2,
              edgeWidthCount,
              edges.versions?.widths ?? 0,
            );
          }
          if (edges.opacities) {
            const edgeOpacityCount = Math.floor((edges.opacities.length ?? 0) / 2);
            this.uploadFloatTexture(
              'edgeOpacities',
              this.edgeTextures.opacities,
              edges.opacities,
              2,
              edgeOpacityCount,
              edges.versions?.opacities ?? 0,
            );
          }
          if (edges.endpointSizes) {
            const edgeEndpointSizeCount = Math.floor((edges.endpointSizes.length ?? 0) / 2);
            this.uploadFloatTexture(
              'edgeEndpointSizes',
              this.edgeTextures.endpointSizes,
              edges.endpointSizes,
              2,
              edgeEndpointSizeCount,
              edges.versions?.endpointSizes ?? 0,
            );
          }
          if (edges.states) {
            const edgeStateCount = edges.states.length ?? 0;
            this.uploadUintTexture(
              'edgeStates',
              this.edgeTextures.states,
              edges.states,
              1,
              edgeStateCount,
              edges.versions?.states ?? 0,
            );
          }
          if (edges.endpointStates) {
            const edgeEndpointStateCount = Math.floor((edges.endpointStates.length ?? 0) / 2);
            this.uploadUintTexture(
              'edgeEndpointStates',
              this.edgeTextures.endpointStates,
              edges.endpointStates,
              2,
              edgeEndpointStateCount,
              edges.versions?.endpointStates ?? 0,
            );
          }
        }

        const viewport = context.viewport;
        const rasterViewportWidth = viewport ? viewport[2] : (gl.drawingBufferWidth || this.size.width || 1);
        const rasterViewportHeight = viewport ? viewport[3] : (gl.drawingBufferHeight || this.size.height || 1);
        const logicalViewport = context.target?.exportFigureLogicalViewport ?? null;
        const screenViewportWidth = Math.max(1, Math.floor(logicalViewport?.width ?? rasterViewportWidth));
        const screenViewportHeight = Math.max(1, Math.floor(logicalViewport?.height ?? rasterViewportHeight));
        const transparencyMode = fastEdges ? 'alpha' : this.edgeTransparencyMode;
        const nodeBlendWithEdges = this.nodeBlendWithEdges === true;
        const edgeDepthWrite = !fastEdges && this.edgeDepthWrite === true;
        debugWebGLRender('graph:render:uploads', {
          nodeCount: this.nodeCount,
          edgeCount: this.edgeCount,
          viewportWidth: rasterViewportWidth,
          viewportHeight: rasterViewportHeight,
          screenViewportWidth,
          screenViewportHeight,
          edgeRenderingMode,
          fastEdges,
          transparencyMode,
          nodeBlendWithEdges,
          edgeDepthWrite,
          textures: {
            nodePositions: Boolean(this.nodeTextures.positions),
            nodeColors: Boolean(this.nodeTextures.colors),
            nodeSizes: Boolean(this.nodeTextures.sizes),
            edgeColors: Boolean(this.edgeTextures.colors),
            edgeWidths: Boolean(this.edgeTextures.widths),
            edgeOpacities: Boolean(this.edgeTextures.opacities),
          },
        });

        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const set1i = (uniforms, name, value) => {
          const loc = uniforms[name];
          if (loc) gl.uniform1i(loc, value);
        };
        const set1f = (uniforms, name, value) => {
          const loc = uniforms[name];
          if (loc) gl.uniform1f(loc, value);
        };
        const set1ui = (uniforms, name, value) => {
          const loc = uniforms[name];
          if (loc) gl.uniform1ui(loc, value >>> 0);
        };
        const set2f = (uniforms, name, a, b) => {
          const loc = uniforms[name];
          if (loc) gl.uniform2f(loc, a, b);
        };
        const set3f = (uniforms, name, a, b, c) => {
          const loc = uniforms[name];
          if (loc) gl.uniform3f(loc, a, b, c);
        };
        const set4f = (uniforms, name, a, b, c, d) => {
          const loc = uniforms[name];
          if (loc) gl.uniform4f(loc, a, b, c, d);
        };
        const set4fv = (uniforms, name, value) => {
          const loc = uniforms[name];
          if (loc) gl.uniform4fv(loc, value);
        };
        const setMat4 = (uniforms, name, value) => {
          const loc = uniforms[name];
          if (loc) gl.uniformMatrix4fv(loc, false, value);
        };

        const drawEdges = ({
          weighted = false,
          passViewportWidth = screenViewportWidth,
          passViewportHeight = screenViewportHeight,
        } = {}) => {
          if (!this.edgeCount || !this.shouldRenderEdges() || !edges.endpoints || !activeNodePositionTexture) return;
          const hasEdgeColors = Boolean(edgeVariant?.colorBuffer && edgeVariant?.colorSource !== 'node' && edges.colors);
          const hasNodeColorsForEdgeChannel = Boolean(nodeColorSource);
          const hasEdgeWidths = Boolean(edgeVariant?.widthBuffer && edgeVariant?.widthSource !== 'node' && edges.widths);
          const hasEdgeOpacities = Boolean(
            edgeVariant?.opacityBuffer
            && edgeVariant?.opacitySource !== 'node'
            && edges.opacities,
          );
          const hasEdgeStates = Boolean(edges.states);
          const hasEdgeEndpointStates = Boolean(edges.endpointStates);
          const hasEdgeEndpointSizes = Boolean(
            edgeVariant?.endpointSizeBuffer
            && edgeVariant?.endpointSizeSource !== 'node'
            && edges.endpointSizes,
          );
          const hasNodeWidthSource = Boolean(nodeWidthSource);
          const hasNodeOpacitySource = Boolean(nodeOpacitySource);
          const hasNodeEndpointSizeSource = Boolean(nodeEndpointSizeSource);
          const colorEndpointMode = mapEndpointMode(edgeVariant?.colorEndpoints);
          const opacityEndpointMode = mapEndpointMode(edgeVariant?.opacityEndpoints);

          if (edgeRenderingMode === 'quad') {
            const edgeEntry = weighted ? edgeQuadWeightedProgramEntry : edgeQuadProgramEntry;
            if (!edgeEntry?.program) return;
            const uniforms = edgeEntry.uniforms;
            gl.useProgram(edgeEntry.program);
            setMat4(uniforms, 'u_viewProjection', cameraUniforms.viewProjection);
            set3f(
              uniforms,
              'u_cameraPosition',
              cameraUniforms.position?.[0] ?? 0,
              cameraUniforms.position?.[1] ?? 0,
              cameraUniforms.position?.[2] ?? 1,
            );
            set3f(
              uniforms,
              'u_cameraUp',
              cameraUniforms.up?.[0] ?? 0,
              cameraUniforms.up?.[1] ?? 1,
              cameraUniforms.up?.[2] ?? 0,
            );
            set3f(
              uniforms,
              'u_cameraRight',
              cameraUniforms.right?.[0] ?? 1,
              cameraUniforms.right?.[1] ?? 0,
              cameraUniforms.right?.[2] ?? 0,
            );
            set1i(uniforms, 'u_is2D', cameraUniforms?.mode === '2d' ? 1 : 0);
            set2f(uniforms, 'u_viewport', passViewportWidth, passViewportHeight);
            set1i(uniforms, 'u_nodePositions', 0);
            set1i(uniforms, 'u_nodePositionsFrom', 12);
            set1f(uniforms, 'u_nodeInterpolationFactor', interpolationFactor);
            set1i(uniforms, 'u_nodeInterpolationEnabled', interpolationEnabled ? 1 : 0);
            set1i(uniforms, 'u_nodeEdgeColors', 5);
            set1i(uniforms, 'u_edgeColors', 2);
            set1i(uniforms, 'u_edgeEndpoints', 3);
            set1i(uniforms, 'u_edgeStates', 15);
            set1i(uniforms, 'u_edgeEndpointStates', 16);
            set1i(uniforms, 'u_edgeWidths', 6);
            set1i(uniforms, 'u_edgeOpacities', 10);
            set1i(uniforms, 'u_edgeEndpointSizes', 7);
            set1i(uniforms, 'u_nodeWidthSource', 8);
            set1i(uniforms, 'u_nodeOpacitySource', 11);
            set1i(uniforms, 'u_nodeEndpointSizeSource', 9);
            set1i(uniforms, 'u_edgeColorSource', edgeVariant?.colorSource === 'node' ? 1 : 0);
            set1i(uniforms, 'u_edgeColorEndpoints', colorEndpointMode);
            set1i(uniforms, 'u_edgeWidthSource', edgeVariant?.widthSource === 'node' ? 1 : 0);
            set1i(uniforms, 'u_edgeWidthEndpoints', mapEndpointMode(edgeVariant?.widthEndpoints));
            set1i(uniforms, 'u_edgeOpacitySource', edgeVariant?.opacitySource === 'node' ? 1 : 0);
            set1i(uniforms, 'u_edgeOpacityEndpoints', opacityEndpointMode);
            set1i(uniforms, 'u_edgeEndpointSizeSource', edgeVariant?.endpointSizeSource === 'node' ? 1 : 0);
            set1i(uniforms, 'u_edgeEndpointSizeEndpoints', mapEndpointMode(edgeVariant?.endpointSizeEndpoints));
            set1i(uniforms, 'u_hasEdgeColors', hasEdgeColors ? 1 : 0);
            set1i(uniforms, 'u_hasNodeColors', hasNodeColorsForEdgeChannel ? 1 : 0);
            set1i(uniforms, 'u_hasEdgeStates', hasEdgeStates ? 1 : 0);
            set1i(uniforms, 'u_hasEdgeEndpointStates', hasEdgeEndpointStates ? 1 : 0);
            set1i(uniforms, 'u_hasEdgeWidths', hasEdgeWidths ? 1 : 0);
            set1i(uniforms, 'u_hasEdgeOpacities', hasEdgeOpacities ? 1 : 0);
            set1i(uniforms, 'u_hasEdgeEndpointSizes', hasEdgeEndpointSizes ? 1 : 0);
            set1i(uniforms, 'u_hasNodeWidthSource', hasNodeWidthSource ? 1 : 0);
            set1i(uniforms, 'u_hasNodeOpacitySource', hasNodeOpacitySource ? 1 : 0);
            set1i(uniforms, 'u_hasNodeEndpointSizeSource', hasNodeEndpointSizeSource ? 1 : 0);
            set1ui(uniforms, 'u_hoverNodeIndex', this.hoveredNodeIndex);
            set1ui(uniforms, 'u_hoverEdgeIndex', this.hoveredEdgeIndex);
            set1ui(uniforms, 'u_hoverEdgeState', this.hoveredEdgeState);
            set1ui(uniforms, 'u_edgeStateForceMaxAlphaMask', this.edgeStateForceMaxAlphaMask >>> 0);
            set4fv(
              uniforms,
              'u_nodeNoStateScale',
              this.nodeNoStateStyleEnabled === true ? this.nodeNoStateScale : DEFAULT_STATE_SCALE,
            );
            set4fv(
              uniforms,
              'u_nodeStateScale[0]',
              (this.nodeStateScale && this.nodeStateScale.length > 0) ? this.nodeStateScale : DEFAULT_STATE_SCALE,
            );
            set4fv(
              uniforms,
              'u_edgeNoStateScale',
              this.edgeNoStateStyleEnabled === true ? this.edgeNoStateScale : DEFAULT_STATE_SCALE,
            );
            set4fv(
              uniforms,
              'u_edgeNoStateColorMul',
              this.edgeNoStateStyleEnabled === true ? this.edgeNoStateColorMul : DEFAULT_STATE_COLOR_MUL,
            );
            set4fv(
              uniforms,
              'u_edgeNoStateColorAdd',
              this.edgeNoStateStyleEnabled === true ? this.edgeNoStateColorAdd : DEFAULT_STATE_COLOR_ADD,
            );
            set4fv(
              uniforms,
              'u_edgeStateScale[0]',
              (this.edgeStateScale && this.edgeStateScale.length > 0) ? this.edgeStateScale : DEFAULT_STATE_SCALE,
            );
            set4fv(
              uniforms,
              'u_edgeStateColorMul[0]',
              (this.edgeStateColorMul && this.edgeStateColorMul.length > 0) ? this.edgeStateColorMul : DEFAULT_STATE_COLOR_MUL,
            );
            set4fv(
              uniforms,
              'u_edgeStateColorAdd[0]',
              (this.edgeStateColorAdd && this.edgeStateColorAdd.length > 0) ? this.edgeStateColorAdd : DEFAULT_STATE_COLOR_ADD,
            );
            set4f(
              uniforms,
              'u_defaultNodeEdgeColor',
              nodeDefaultColor[0],
              nodeDefaultColor[1],
              nodeDefaultColor[2],
              nodeDefaultColor[3],
            );
            set4f(
              uniforms,
              'u_defaultEdgeColorStart',
              defaultEdgeColorPair[0][0],
              defaultEdgeColorPair[0][1],
              defaultEdgeColorPair[0][2],
              defaultEdgeColorPair[0][3],
            );
            set4f(
              uniforms,
              'u_defaultEdgeColorEnd',
              defaultEdgeColorPair[1][0],
              defaultEdgeColorPair[1][1],
              defaultEdgeColorPair[1][2],
              defaultEdgeColorPair[1][3],
            );
            const quadDefaultEdgeWidth = edgeVariant?.widthSource === 'node' ? defaultNodeWidth : defaultEdgeWidth;
            const quadDefaultEdgeEndpointSize = edgeVariant?.endpointSizeSource === 'node'
              ? defaultNodeEndpointSize
              : defaultEdgeEndpointSize;
            set2f(uniforms, 'u_defaultEdgeWidth', quadDefaultEdgeWidth[0], quadDefaultEdgeWidth[1]);
            set2f(uniforms, 'u_defaultNodeWidthSource', defaultNodeWidth[0], defaultNodeWidth[1]);
            set2f(uniforms, 'u_defaultEdgeOpacity', defaultEdgeOpacity[0], defaultEdgeOpacity[1]);
            set2f(uniforms, 'u_defaultNodeOpacitySource', defaultNodeOpacity[0], defaultNodeOpacity[1]);
            set2f(
              uniforms,
              'u_defaultEdgeEndpointSize',
              quadDefaultEdgeEndpointSize[0],
              quadDefaultEdgeEndpointSize[1],
            );
            set2f(
              uniforms,
              'u_defaultNodeEndpointSizeSource',
              defaultNodeEndpointSize[0],
              defaultNodeEndpointSize[1],
            );
            set1f(uniforms, 'u_edgeWidthBase', this.edgeWidthBase);
            set1f(uniforms, 'u_edgeWidthScale', this.edgeWidthScale);
            set1f(uniforms, 'u_edgeOpacityBase', this.edgeOpacityBase);
            set1f(uniforms, 'u_edgeOpacityScale', this.edgeOpacityScale);
            set1f(uniforms, 'u_nodeSizeBase', this.nodeSizeBase);
            set1f(uniforms, 'u_nodeSizeScale', this.nodeSizeScale);
            set1f(uniforms, 'u_edgeEndpointTrim', this.edgeEndpointTrim);
            set1f(uniforms, 'u_zoom2D', zoom2D);
            set1f(uniforms, 'u_semanticZoomExponent', semanticZoomExponent);
            this.bindTexture(0, activeNodePositionTexture);
            this.bindTexture(12, resolvedNodePositionFromTexture ?? activeNodePositionTexture);
            this.bindTexture(5, this.nodeTextures.edgeColorSource);
            this.bindTexture(2, this.edgeTextures.colors);
            this.bindTexture(3, this.edgeTextures.endpoints);
            this.bindTexture(6, this.edgeTextures.widths);
            this.bindTexture(10, this.edgeTextures.opacities);
            this.bindTexture(7, this.edgeTextures.endpointSizes);
            this.bindTexture(8, this.nodeTextures.edgeWidthSource);
            this.bindTexture(11, this.nodeTextures.edgeOpacitySource);
            this.bindTexture(9, this.nodeTextures.edgeEndpointSizeSource);
            this.bindTexture(15, this.edgeTextures.states);
            this.bindTexture(16, this.edgeTextures.endpointStates);
            gl.bindVertexArray(this.edgeQuadVao);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.edgeCount);
            return;
          }

          const edgeEntry = weighted ? edgeLineWeightedProgramEntry : edgeLineProgramEntry;
          if (!edgeEntry?.program) return;
          const uniforms = edgeEntry.uniforms;
          gl.useProgram(edgeEntry.program);
          setMat4(uniforms, 'u_viewProjection', cameraUniforms.viewProjection);
          set1i(uniforms, 'u_nodePositions', 0);
          set1i(uniforms, 'u_nodePositionsFrom', 12);
          set1f(uniforms, 'u_nodeInterpolationFactor', interpolationFactor);
          set1i(uniforms, 'u_nodeInterpolationEnabled', interpolationEnabled ? 1 : 0);
          set1i(uniforms, 'u_nodeEdgeColors', 5);
          set1i(uniforms, 'u_edgeColors', 2);
          set1i(uniforms, 'u_edgeStates', 15);
          set1i(uniforms, 'u_edgeOpacities', 10);
          set1i(uniforms, 'u_nodeOpacitySource', 11);
          set1i(uniforms, 'u_edgeEndpoints', 3);
          set1i(uniforms, 'u_edgeColorSource', edgeVariant?.colorSource === 'node' ? 1 : 0);
          set1i(uniforms, 'u_edgeColorEndpoints', colorEndpointMode);
          set1i(uniforms, 'u_edgeOpacitySource', edgeVariant?.opacitySource === 'node' ? 1 : 0);
          set1i(uniforms, 'u_edgeOpacityEndpoints', opacityEndpointMode);
          set1i(uniforms, 'u_hasEdgeColors', hasEdgeColors ? 1 : 0);
          set1i(uniforms, 'u_hasNodeColors', hasNodeColorsForEdgeChannel ? 1 : 0);
          set1i(uniforms, 'u_hasEdgeStates', hasEdgeStates ? 1 : 0);
          set1i(uniforms, 'u_hasEdgeOpacities', hasEdgeOpacities ? 1 : 0);
          set1i(uniforms, 'u_hasNodeOpacitySource', hasNodeOpacitySource ? 1 : 0);
          set1ui(uniforms, 'u_hoverNodeIndex', this.hoveredNodeIndex);
          set1ui(uniforms, 'u_hoverEdgeIndex', this.hoveredEdgeIndex);
          set1ui(uniforms, 'u_hoverEdgeState', this.hoveredEdgeState);
          set1ui(uniforms, 'u_edgeStateForceMaxAlphaMask', this.edgeStateForceMaxAlphaMask >>> 0);
          set4fv(
            uniforms,
            'u_edgeNoStateScale',
            this.edgeNoStateStyleEnabled === true ? this.edgeNoStateScale : DEFAULT_STATE_SCALE,
          );
          set4fv(
            uniforms,
            'u_edgeNoStateColorMul',
            this.edgeNoStateStyleEnabled === true ? this.edgeNoStateColorMul : DEFAULT_STATE_COLOR_MUL,
          );
          set4fv(
            uniforms,
            'u_edgeNoStateColorAdd',
            this.edgeNoStateStyleEnabled === true ? this.edgeNoStateColorAdd : DEFAULT_STATE_COLOR_ADD,
          );
          set4fv(
            uniforms,
            'u_edgeStateScale[0]',
            (this.edgeStateScale && this.edgeStateScale.length > 0) ? this.edgeStateScale : DEFAULT_STATE_SCALE,
          );
          set4fv(
            uniforms,
            'u_edgeStateColorMul[0]',
            (this.edgeStateColorMul && this.edgeStateColorMul.length > 0) ? this.edgeStateColorMul : DEFAULT_STATE_COLOR_MUL,
          );
          set4fv(
            uniforms,
            'u_edgeStateColorAdd[0]',
            (this.edgeStateColorAdd && this.edgeStateColorAdd.length > 0) ? this.edgeStateColorAdd : DEFAULT_STATE_COLOR_ADD,
          );
          set4f(
            uniforms,
            'u_defaultNodeEdgeColor',
            nodeDefaultColor[0],
            nodeDefaultColor[1],
            nodeDefaultColor[2],
            nodeDefaultColor[3],
          );
          set4f(
            uniforms,
            'u_defaultEdgeColorStart',
            defaultEdgeColorPair[0][0],
            defaultEdgeColorPair[0][1],
            defaultEdgeColorPair[0][2],
            defaultEdgeColorPair[0][3],
          );
          set4f(
            uniforms,
            'u_defaultEdgeColorEnd',
            defaultEdgeColorPair[1][0],
            defaultEdgeColorPair[1][1],
            defaultEdgeColorPair[1][2],
            defaultEdgeColorPair[1][3],
          );
          set2f(uniforms, 'u_defaultEdgeOpacity', defaultEdgeOpacity[0], defaultEdgeOpacity[1]);
          set2f(uniforms, 'u_defaultNodeOpacitySource', defaultNodeOpacity[0], defaultNodeOpacity[1]);
          set1f(uniforms, 'u_edgeOpacityBase', this.edgeOpacityBase);
          set1f(uniforms, 'u_edgeOpacityScale', this.edgeOpacityScale);
          this.bindTexture(0, activeNodePositionTexture);
          this.bindTexture(12, resolvedNodePositionFromTexture ?? activeNodePositionTexture);
          this.bindTexture(5, this.nodeTextures.edgeColorSource);
          this.bindTexture(2, this.edgeTextures.colors);
          this.bindTexture(15, this.edgeTextures.states);
          this.bindTexture(10, this.edgeTextures.opacities);
          this.bindTexture(11, this.nodeTextures.edgeOpacitySource);
          this.bindTexture(3, this.edgeTextures.endpoints);
          gl.bindVertexArray(this.edgeVao);
          gl.drawArraysInstanced(gl.LINES, 0, 2, this.edgeCount);
        };

        const drawNodes = () => {
          if (!this.nodeCount || !activeNodePositionTexture) return;
          const nodeEntry = nodeProgramEntry;
          if (!nodeEntry?.program) return;
          const uniforms = nodeEntry.uniforms;
          gl.useProgram(nodeEntry.program);
          setMat4(uniforms, 'u_viewProjection', cameraUniforms.viewProjection);
          set1i(uniforms, 'u_nodePositions', 0);
          set1i(uniforms, 'u_nodePositionsFrom', 15);
          set1f(uniforms, 'u_nodeInterpolationFactor', interpolationFactor);
          set1i(uniforms, 'u_nodeInterpolationEnabled', interpolationEnabled ? 1 : 0);
          set1i(uniforms, 'u_nodeColors', 1);
          set1i(uniforms, 'u_nodeSizes', 4);
          set1i(uniforms, 'u_nodeOutlineWidths', 12);
          set1i(uniforms, 'u_nodeOutlineColors', 13);
          set1i(uniforms, 'u_nodeStates', 14);
          set3f(
            uniforms,
            'u_cameraPosition',
            cameraUniforms.position?.[0] ?? 0,
            cameraUniforms.position?.[1] ?? 0,
            cameraUniforms.position?.[2] ?? 1,
          );
          set3f(
            uniforms,
            'u_cameraUp',
            cameraUniforms.up?.[0] ?? 0,
            cameraUniforms.up?.[1] ?? 1,
            cameraUniforms.up?.[2] ?? 0,
          );
          set3f(
            uniforms,
            'u_cameraRight',
            cameraUniforms.right?.[0] ?? 1,
            cameraUniforms.right?.[1] ?? 0,
            cameraUniforms.right?.[2] ?? 0,
          );
          set1i(uniforms, 'u_is2D', cameraUniforms?.mode === '2d' ? 1 : 0);
          set1f(uniforms, 'u_zoom2D', zoom2D);
          set1f(uniforms, 'u_semanticZoomExponent', semanticZoomExponent);
          set1i(uniforms, 'u_hasNodeColors', hasNodeColorsForNodes ? 1 : 0);
          set1i(uniforms, 'u_hasNodeSizes', hasNodeSizesForNodes ? 1 : 0);
          set1i(uniforms, 'u_hasNodeOutlineWidths', hasNodeOutlineWidthsForNodes ? 1 : 0);
          set1i(uniforms, 'u_hasNodeOutlineColors', hasNodeOutlineColorsForNodes ? 1 : 0);
          set1i(uniforms, 'u_hasNodeStates', hasNodeStatesForNodes ? 1 : 0);
          set1ui(uniforms, 'u_hoverNodeIndex', this.hoveredNodeIndex);
          set1ui(uniforms, 'u_hoverNodeState', this.hoveredNodeState);
          set1ui(uniforms, 'u_nodeStateForceMaxAlphaMask', this.nodeStateForceMaxAlphaMask >>> 0);
          set4fv(
            uniforms,
            'u_nodeNoStateScale',
            this.nodeNoStateStyleEnabled === true ? this.nodeNoStateScale : DEFAULT_STATE_SCALE,
          );
          set4fv(
            uniforms,
            'u_nodeNoStateColorMul',
            this.nodeNoStateStyleEnabled === true ? this.nodeNoStateColorMul : DEFAULT_STATE_COLOR_MUL,
          );
          set4fv(
            uniforms,
            'u_nodeNoStateColorAdd',
            this.nodeNoStateStyleEnabled === true ? this.nodeNoStateColorAdd : DEFAULT_STATE_COLOR_ADD,
          );
          set4fv(
            uniforms,
            'u_nodeStateScale[0]',
            (this.nodeStateScale && this.nodeStateScale.length > 0) ? this.nodeStateScale : DEFAULT_STATE_SCALE,
          );
          set4fv(
            uniforms,
            'u_nodeStateColorMul[0]',
            (this.nodeStateColorMul && this.nodeStateColorMul.length > 0) ? this.nodeStateColorMul : DEFAULT_STATE_COLOR_MUL,
          );
          set4fv(
            uniforms,
            'u_nodeStateColorAdd[0]',
            (this.nodeStateColorAdd && this.nodeStateColorAdd.length > 0) ? this.nodeStateColorAdd : DEFAULT_STATE_COLOR_ADD,
          );
          set4f(
            uniforms,
            'u_defaultNodeColor',
            nodeDefaultColor[0],
            nodeDefaultColor[1],
            nodeDefaultColor[2],
            nodeDefaultColor[3],
          );
          set1f(uniforms, 'u_defaultNodeSize', nodeDefaultSize);
          set1f(uniforms, 'u_nodeOpacityBase', this.nodeOpacityBase);
          set1f(uniforms, 'u_nodeOpacityScale', this.nodeOpacityScale);
          set1f(uniforms, 'u_nodeSizeBase', this.nodeSizeBase);
          set1f(uniforms, 'u_nodeSizeScale', this.nodeSizeScale);
          set1f(uniforms, 'u_nodeOutline', nodeDefaultOutline);
          set1f(uniforms, 'u_outlineWidthBase', this.nodeOutlineWidthBase);
          set1f(uniforms, 'u_outlineWidthScale', this.nodeOutlineWidthScale);
          set4f(
            uniforms,
            'u_outlineColor',
            nodeDefaultOutlineColor[0],
            nodeDefaultOutlineColor[1],
            nodeDefaultOutlineColor[2],
            nodeDefaultOutlineColor[3],
          );
          this.bindTexture(0, activeNodePositionTexture);
          this.bindTexture(15, resolvedNodePositionFromTexture ?? activeNodePositionTexture);
          this.bindTexture(1, this.nodeTextures.colors);
          this.bindTexture(4, this.nodeTextures.sizes);
          this.bindTexture(12, this.nodeTextures.outlineWidths);
          this.bindTexture(13, this.nodeTextures.outlineColors);
          this.bindTexture(14, this.nodeTextures.states);
          gl.bindVertexArray(this.nodeVao);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);
        };

        const applyViewport = () => {
          if (viewport) {
            gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
          } else {
            gl.viewport(0, 0, rasterViewportWidth, rasterViewportHeight);
          }
        };

        const effectiveEdgeCount = this.shouldRenderEdges() ? this.edgeCount : 0;
        const weightedRequested = !fastEdges && (transparencyMode === 'weighted'
          || transparencyMode === 'additive-normalized'
          || transparencyMode === 'additive-tonemapped'
          || transparencyMode === 'additive-normalized-bright');
        const weightedReady = weightedRequested && effectiveEdgeCount > 0
          ? this.prepareWeightedWebGL(rasterViewportWidth, rasterViewportHeight)
          : false;
        debugWebGLRender('graph:render:mode', {
          weightedRequested,
          weightedReady,
          is2D,
          nodeCount: this.nodeCount,
          edgeCount: effectiveEdgeCount,
        });

        if (weightedReady) {
          if (!this.loggedWeightedActive) {
            console.info(`GraphLayerWebGL: using weighted multipass for '${transparencyMode}'`);
            this.loggedWeightedActive = true;
          }
          const mainFramebuffer = context.target?.handle ?? null;
          const mainDrawBuffers = mainFramebuffer ? [gl.COLOR_ATTACHMENT0] : [gl.BACK];

          if (!is2D && this.nodeCount && !nodeBlendWithEdges) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
            if (mainFramebuffer) gl.drawBuffers(mainDrawBuffers);
            applyViewport();
            gl.enable(gl.DEPTH_TEST);
            gl.depthMask(true);
            gl.depthFunc(gl.LEQUAL);
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            drawNodes();
          }

          gl.bindFramebuffer(gl.FRAMEBUFFER, this.weightedFramebuffer);
          gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
          applyViewport();
          gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 0, 0, 0]));
          gl.clearBufferfv(gl.COLOR, 1, new Float32Array([0, 0, 0, 0]));
          gl.clearBufferfv(gl.DEPTH, 0, new Float32Array([1]));

          if (!is2D && this.nodeCount && !nodeBlendWithEdges) {
            gl.colorMask(false, false, false, false);
            gl.disable(gl.BLEND);
            gl.enable(gl.DEPTH_TEST);
            gl.depthMask(true);
            gl.depthFunc(gl.LEQUAL);
            drawNodes();
            gl.colorMask(true, true, true, true);
          }

          if (this.edgeCount) {
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.ONE, gl.ONE);
            if (is2D) {
              gl.disable(gl.DEPTH_TEST);
              gl.depthMask(false);
            } else {
              gl.enable(gl.DEPTH_TEST);
              gl.depthMask(edgeDepthWrite);
              gl.depthFunc(gl.LEQUAL);
            }
            drawEdges({
              weighted: true,
              passViewportWidth: screenViewportWidth,
              passViewportHeight: screenViewportHeight,
            });
          }

          gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
          if (mainFramebuffer) gl.drawBuffers(mainDrawBuffers);
          applyViewport();
          gl.disable(gl.DEPTH_TEST);
          gl.depthMask(false);
          gl.enable(gl.BLEND);
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

          let resolveProgram = this.edgeResolveProgram;
          let resolveUniformColor = this.edgeResolveUniformColor;
          let resolveUniformWeight = this.edgeResolveUniformWeight;
          if (transparencyMode === 'additive-tonemapped') {
            resolveProgram = this.edgeResolveTonemapProgram ?? resolveProgram;
            resolveUniformColor = this.edgeResolveTonemapUniformColor ?? resolveUniformColor;
            resolveUniformWeight = this.edgeResolveTonemapUniformWeight ?? resolveUniformWeight;
          } else if (transparencyMode === 'additive-normalized-bright') {
            resolveProgram = this.edgeResolveBoostProgram ?? resolveProgram;
            resolveUniformColor = this.edgeResolveBoostUniformColor ?? resolveUniformColor;
            resolveUniformWeight = this.edgeResolveBoostUniformWeight ?? resolveUniformWeight;
          }

          if (resolveProgram) {
            gl.useProgram(resolveProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.weightedColor);
            if (resolveUniformColor) gl.uniform1i(resolveUniformColor, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.weightedWeight);
            if (resolveUniformWeight) gl.uniform1i(resolveUniformWeight, 1);
            gl.bindVertexArray(this.edgeResolveVAO);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
          }

          if ((is2D || nodeBlendWithEdges) && this.nodeCount) {
            gl.enable(gl.BLEND);
            if (nodeBlendWithEdges) {
              this.applyEdgeBlend(gl, transparencyMode);
            } else {
              gl.blendEquation(gl.FUNC_ADD);
              gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            }
            gl.depthMask(false);
            gl.disable(gl.DEPTH_TEST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
            if (mainFramebuffer) gl.drawBuffers(mainDrawBuffers);
            applyViewport();
            drawNodes();
          }
        } else {
          if (weightedRequested && effectiveEdgeCount > 0) {
            this.weightedSupported = false;
            this.edgeTransparencyMode = this.normalizeEdgeTransparencyMode(this.edgeTransparencyMode);
          }
          if (weightedRequested && this.edgeCount > 0 && !this.warnedWeightedFallback) {
            console.warn('Weighted edge transparency is not available in WebGL2 indirect; falling back to alpha.');
            this.warnedWeightedFallback = true;
          }

          const applyNodeBlend = () => {
            if (nodeBlendWithEdges) {
              this.applyEdgeBlend(gl, transparencyMode);
            } else {
              gl.blendEquation(gl.FUNC_ADD);
              gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            }
          };

          const setupNodeDepth = () => {
            if (nodeBlendWithEdges || is2D) {
              gl.disable(gl.DEPTH_TEST);
              gl.depthMask(false);
            } else {
              gl.enable(gl.DEPTH_TEST);
              gl.depthMask(true);
              gl.depthFunc(gl.LEQUAL);
            }
          };

          if (is2D) {
            this.applyEdgeBlend(gl, transparencyMode);
            gl.disable(gl.DEPTH_TEST);
            gl.depthMask(false);
            drawEdges();
            applyNodeBlend();
            setupNodeDepth();
            drawNodes();
          } else {
            applyNodeBlend();
            setupNodeDepth();
            drawNodes();
            this.applyEdgeBlend(gl, transparencyMode);
            gl.enable(gl.DEPTH_TEST);
            gl.depthMask(edgeDepthWrite);
            gl.depthFunc(gl.LEQUAL);
            drawEdges();
          }
        }

        gl.bindVertexArray(null);
        const finalError = gl.getError();
        debugWebGLRender('graph:render:end', {
          finalError,
          nodeCount: this.nodeCount,
          edgeCount: this.edgeCount,
          weightedRequested,
          weightedReady,
        });
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        return true;
      },
    );
  }
}

export default GraphLayerWebGL;
