import { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './engine/GraphLayerCommon.js';
import { RenderTargetPool } from './engine/RenderTargetPool.js';
import { FrameGraphRunner } from './engine/framegraph/FrameGraphRunner.js';
import { bumpCounter } from '../utilities/counters.js';
import {
  createAttributeWebGLSources,
  NODE_ATTRIBUTE_FRAGMENT,
  EDGE_ATTRIBUTE_FRAGMENT,
  EDGE_ATTRIBUTE_QUAD_FRAGMENT,
} from './engine/shaders/attributeWebGL.js';
import {
  createAttributeWebGPUSources,
  createAttributeWebGPUIndirectTrackSources,
} from './engine/shaders/attributeWebGPU.js';
import { VISUAL_ATTRIBUTE_NAMES } from '../pipeline/constants.js';
import { GraphVisualSchema } from './schema/GraphVisualSchema.js';

const {
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

const PACK_DEPTH_GLSL = /* glsl */ `
vec4 packDepthToRGBA(const in float v) {
  const vec4 bitShift = vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
  const vec4 bitMask = vec4(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
  vec4 res = fract(v * bitShift);
  res -= res.xxyz * bitMask;
  return res;
}`;

const NODE_DEPTH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
${PACK_DEPTH_GLSL}

in vec2 v_local;
in vec3 v_centerWorld;
in vec3 v_rightWorld;
in vec3 v_upWorld;
in vec3 v_viewDir;
in float v_radius;

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
  fragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

const NODE_OCCLUSION_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_local;
in vec3 v_centerWorld;
in vec3 v_rightWorld;
in vec3 v_upWorld;
in vec3 v_viewDir;
in float v_radius;

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
  // Intentionally write zero: nodes are only here to populate depth so they occlude edges.
  fragColor = vec4(0.0);
}`;

const EDGE_DEPTH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
${PACK_DEPTH_GLSL}
out vec4 fragColor;
void main() {
  fragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

const PACK_UINT_GLSL = /* glsl */ `
uvec4 packUintToRGBA(uint value) {
  return uvec4(
    value & 255u,
    (value >> 8u) & 255u,
    (value >> 16u) & 255u,
    (value >> 24u) & 255u
  );
}`;

const INDIRECT_TEXTURE_INDEX_GLSL = /* glsl */ `
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
}

ivec2 textureCoord(isampler2D tex, uint index) {
  ivec2 size = textureSize(tex, 0);
  int width = max(size.x, 1);
  int i = int(index);
  return ivec2(i % width, i / width);
}`;

const WEBGL_INDIRECT_TRACK_NODE_VERTEX = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
precision highp usampler2D;
${PACK_UINT_GLSL}
${INDIRECT_TEXTURE_INDEX_GLSL}

layout(location = 0) in uint a_nodeId;

uniform mat4 u_viewProjection;
uniform sampler2D u_nodePositions;
uniform sampler2D u_nodeSizes;
uniform sampler2D u_nodeOutlineWidths;
uniform usampler2D u_nodeEncoded;
uniform sampler2D u_nodeTrackedFloat;
uniform isampler2D u_nodeTrackedInt;
uniform usampler2D u_nodeTrackedUint;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
uniform int u_is2D;
uniform vec2 u_viewport;
uniform int u_useNodeIdBuffer;
uniform int u_useNodeSize;
uniform int u_useNodeOutline;
uniform int u_useEncodedTexture;
uniform int u_trackedNodeValueMode;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_nodeOutline;
uniform float u_outlineWidthBase;
uniform float u_outlineWidthScale;

out vec4 v_encoded;

uvec4 encodeTrackedNode(uint nodeId) {
  if (u_trackedNodeValueMode == 1) {
    return texelFetch(u_nodeEncoded, textureCoord(u_nodeEncoded, nodeId), 0);
  }
  if (u_trackedNodeValueMode == 2) {
    float raw = texelFetch(u_nodeTrackedFloat, textureCoord(u_nodeTrackedFloat, nodeId), 0).x;
    int packed = int(trunc(raw));
    return packUintToRGBA(uint(packed + 1));
  }
  if (u_trackedNodeValueMode == 3) {
    int raw = texelFetch(u_nodeTrackedInt, textureCoord(u_nodeTrackedInt, nodeId), 0).x;
    return packUintToRGBA(uint(raw + 1));
  }
  if (u_trackedNodeValueMode == 4) {
    uint raw = texelFetch(u_nodeTrackedUint, textureCoord(u_nodeTrackedUint, nodeId), 0).x;
    return packUintToRGBA(raw + 1u);
  }
  return packUintToRGBA(nodeId + 1u);
}

void main() {
  uint nodeId = (u_useNodeIdBuffer == 1) ? a_nodeId : uint(gl_InstanceID);
  vec3 position = texelFetch(u_nodePositions, textureCoord(u_nodePositions, nodeId), 0).xyz;
  float rawSize = (u_useNodeSize == 1)
    ? texelFetch(u_nodeSizes, textureCoord(u_nodeSizes, nodeId), 0).x
    : 1.0;
  float rawOutline = (u_useNodeOutline == 1)
    ? texelFetch(u_nodeOutlineWidths, textureCoord(u_nodeOutlineWidths, nodeId), 0).x
    : u_nodeOutline;
  float outlineWidth = max(0.0, u_outlineWidthBase + u_outlineWidthScale * rawOutline);
  float fullSize = max(1.0, u_nodeSizeBase + u_nodeSizeScale * rawSize + outlineWidth);
  float radius = fullSize * 0.5;
  vec3 right = u_cameraRight;
  if (u_is2D == 0) {
    vec3 viewDir = u_cameraPosition - position;
    float viewLen = length(viewDir);
    viewDir = viewLen > 1e-5 ? viewDir / viewLen : vec3(0.0, 0.0, 1.0);
    right = u_cameraRight - viewDir * dot(u_cameraRight, viewDir);
    float rightLen = length(right);
    right = rightLen > 1e-5 ? right / rightLen : normalize(cross(u_cameraUp, viewDir));
  } else {
    right = normalize(right);
  }
  vec4 clipCenter = u_viewProjection * vec4(position, 1.0);
  vec4 clipOffset = u_viewProjection * vec4(position + right * radius, 1.0);
  vec2 ndcCenter = clipCenter.xy / clipCenter.w;
  vec2 ndcOffset = clipOffset.xy / clipOffset.w;
  vec2 pixelScale = vec2(max(u_viewport.x, 1.0), max(u_viewport.y, 1.0)) * 0.5;
  float radiusPx = length((ndcOffset - ndcCenter) * pixelScale);
  gl_Position = clipCenter;
  gl_PointSize = max(1.0, radiusPx * 2.0);
  uvec4 encoded = encodeTrackedNode(nodeId);
  v_encoded = vec4(encoded) / 255.0;
}`;

const WEBGL_INDIRECT_TRACK_NODE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_encoded;
out vec4 fragColor;

void main() {
  vec2 local = gl_PointCoord * 2.0 - 1.0;
  if (dot(local, local) > 1.0) discard;
  fragColor = v_encoded;
}`;

const WEBGL_INDIRECT_TRACK_NODE_OCCLUSION_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

out vec4 fragColor;

void main() {
  vec2 local = gl_PointCoord * 2.0 - 1.0;
  if (dot(local, local) > 1.0) discard;
  fragColor = vec4(0.0);
}`;

const WEBGL_INDIRECT_TRACK_NODE_DEPTH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
${PACK_DEPTH_GLSL}

out vec4 fragColor;

void main() {
  vec2 local = gl_PointCoord * 2.0 - 1.0;
  if (dot(local, local) > 1.0) discard;
  fragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

const WEBGL_INDIRECT_TRACK_EDGE_VERTEX = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
precision highp usampler2D;
${PACK_UINT_GLSL}
${INDIRECT_TEXTURE_INDEX_GLSL}

layout(location = 0) in uint a_edgeId;

uniform mat4 u_viewProjection;
uniform sampler2D u_nodePositions;
uniform usampler2D u_edgeEndpoints;
uniform usampler2D u_edgeEncoded;
uniform sampler2D u_edgeTrackedFloat;
uniform isampler2D u_edgeTrackedInt;
uniform usampler2D u_edgeTrackedUint;
uniform int u_useEdgeIdBuffer;
uniform int u_useEncodedTexture;
uniform int u_trackedEdgeValueMode;

out vec4 v_encoded;

uvec4 encodeTrackedEdge(uint edgeId) {
  if (u_trackedEdgeValueMode == 1) {
    return texelFetch(u_edgeEncoded, textureCoord(u_edgeEncoded, edgeId), 0);
  }
  if (u_trackedEdgeValueMode == 2) {
    float raw = texelFetch(u_edgeTrackedFloat, textureCoord(u_edgeTrackedFloat, edgeId), 0).x;
    int packed = int(trunc(raw));
    return packUintToRGBA(uint(packed + 1));
  }
  if (u_trackedEdgeValueMode == 3) {
    int raw = texelFetch(u_edgeTrackedInt, textureCoord(u_edgeTrackedInt, edgeId), 0).x;
    return packUintToRGBA(uint(raw + 1));
  }
  if (u_trackedEdgeValueMode == 4) {
    uint raw = texelFetch(u_edgeTrackedUint, textureCoord(u_edgeTrackedUint, edgeId), 0).x;
    return packUintToRGBA(raw + 1u);
  }
  return packUintToRGBA(edgeId + 1u);
}

void main() {
  uint edgeId = (u_useEdgeIdBuffer == 1) ? a_edgeId : uint(gl_InstanceID);
  uvec2 endpoints = texelFetch(u_edgeEndpoints, textureCoord(u_edgeEndpoints, edgeId), 0).xy;
  uint nodeId = ((gl_VertexID & 1) == 0) ? endpoints.x : endpoints.y;
  vec3 position = texelFetch(u_nodePositions, textureCoord(u_nodePositions, nodeId), 0).xyz;
  gl_Position = u_viewProjection * vec4(position, 1.0);
  uvec4 encoded = encodeTrackedEdge(edgeId);
  v_encoded = vec4(encoded) / 255.0;
}`;

const WEBGL_INDIRECT_TRACK_EDGE_QUAD_VERTEX = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
precision highp usampler2D;
${PACK_UINT_GLSL}
${INDIRECT_TEXTURE_INDEX_GLSL}

layout(location = 0) in vec2 a_corner;
layout(location = 1) in uint a_edgeId;

uniform mat4 u_viewProjection;
uniform vec2 u_viewport;
uniform sampler2D u_nodePositions;
uniform usampler2D u_edgeEndpoints;
uniform usampler2D u_edgeEncoded;
uniform sampler2D u_edgeTrackedFloat;
uniform isampler2D u_edgeTrackedInt;
uniform usampler2D u_edgeTrackedUint;
uniform sampler2D u_edgeWidths;
uniform sampler2D u_edgeEndpointSizes;
uniform sampler2D u_nodeWidthSource;
uniform sampler2D u_nodeEndpointSizeSource;
uniform int u_useEdgeIdBuffer;
uniform int u_useEncodedTexture;
uniform int u_trackedEdgeValueMode;
uniform int u_edgeWidthSource;
uniform int u_edgeWidthEndpoints;
uniform int u_edgeEndpointSizeSource;
uniform int u_edgeEndpointSizeEndpoints;
uniform int u_hasEdgeWidths;
uniform int u_hasEdgeEndpointSizes;
uniform int u_hasNodeWidthSource;
uniform int u_hasNodeEndpointSizeSource;
uniform vec2 u_defaultEdgeWidth;
uniform vec2 u_defaultEdgeEndpointSize;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;

out vec4 v_encoded;

vec3 fetchNodePos(uint id) {
  return texelFetch(u_nodePositions, textureCoord(u_nodePositions, id), 0).xyz;
}

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
  return texelFetch(u_edgeWidths, textureCoord(u_edgeWidths, edgeId), 0).xy;
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
  return texelFetch(u_edgeEndpointSizes, textureCoord(u_edgeEndpointSizes, edgeId), 0).xy;
}

uvec4 encodeTrackedEdge(uint edgeId) {
  if (u_trackedEdgeValueMode == 1) {
    return texelFetch(u_edgeEncoded, textureCoord(u_edgeEncoded, edgeId), 0);
  }
  if (u_trackedEdgeValueMode == 2) {
    float raw = texelFetch(u_edgeTrackedFloat, textureCoord(u_edgeTrackedFloat, edgeId), 0).x;
    int packed = int(trunc(raw));
    return packUintToRGBA(uint(packed + 1));
  }
  if (u_trackedEdgeValueMode == 3) {
    int raw = texelFetch(u_edgeTrackedInt, textureCoord(u_edgeTrackedInt, edgeId), 0).x;
    return packUintToRGBA(uint(raw + 1));
  }
  if (u_trackedEdgeValueMode == 4) {
    uint raw = texelFetch(u_edgeTrackedUint, textureCoord(u_edgeTrackedUint, edgeId), 0).x;
    return packUintToRGBA(raw + 1u);
  }
  return packUintToRGBA(edgeId + 1u);
}

void main() {
  uint edgeId = (u_useEdgeIdBuffer == 1) ? a_edgeId : uint(gl_InstanceID);
  uvec2 endpoints = texelFetch(u_edgeEndpoints, textureCoord(u_edgeEndpoints, edgeId), 0).xy;
  uint sourceId = endpoints.x;
  uint targetId = endpoints.y;

  vec3 sourcePos = fetchNodePos(sourceId);
  vec3 targetPos = fetchNodePos(targetId);
  vec3 dir = targetPos - sourcePos;
  float dirLenWorld = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLenWorld;

  vec2 endpointSizePair = fetchEdgeEndpointSizePair(edgeId, sourceId, targetId);
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.x, 0.0) * 0.5;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.y, 0.0) * 0.5;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = sourcePos + dirN * trimStart;
  vec3 endPos = targetPos - dirN * trimEnd;

  float segmentMix = clamp(a_corner.x, 0.0, 1.0);
  vec2 widthPair = fetchEdgeWidthPair(edgeId, sourceId, targetId);
  float rawWidth = mix(widthPair.x, widthPair.y, segmentMix);
  float width = max(u_edgeWidthBase + u_edgeWidthScale * rawWidth, 0.0);

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

  uvec4 encoded = encodeTrackedEdge(edgeId);
  v_encoded = vec4(encoded) / 255.0;
}`;

const WEBGL_INDIRECT_TRACK_EDGE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_encoded;
out vec4 fragColor;

void main() {
  fragColor = v_encoded;
}`;

const WEBGL_INDIRECT_TRACK_EDGE_DEPTH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
${PACK_DEPTH_GLSL}

out vec4 fragColor;

void main() {
  fragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

function decodePacked(bytes, offset = 0) {
  const r = bytes[offset] ?? 0;
  const g = bytes[offset + 1] ?? 0;
  const b = bytes[offset + 2] ?? 0;
  const a = bytes[offset + 3] ?? 0;
  const value = r + (g << 8) + (b << 16) + (a << 24);
  return value - 1;
}

function decodePackedUint32(bytes, offset = 0) {
  if (!bytes) return -1;
  if (bytes instanceof Uint32Array) {
    const raw = bytes[offset] ?? 0;
    return Number(raw) - 1;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset * (bytes.BYTES_PER_ELEMENT ?? 1), 4);
  return Number(view.getUint32(0, true)) - 1;
}

const ENCODE_FORMAT = 'u8x4';
const INDEX_SENTINEL = '$index';
const TRACKED_VALUE_MODE = Object.freeze({
  INDEX: 0,
  ENCODED_TEXTURE: 1,
  FLOAT_TEXTURE: 2,
  INT_TEXTURE: 3,
  UINT_TEXTURE: 4,
});

const TRACKED_SOURCE_MODE = Object.freeze({
  INDEX: 'index',
  INT: 'int',
  UINT: 'uint',
});

function unpackDepthRGBA(bytes, offset = 0) {
  const inv255 = 1 / 255;
  const r = (bytes[offset] ?? 0) * inv255;
  const g = (bytes[offset + 1] ?? 0) * inv255;
  const b = (bytes[offset + 2] ?? 0) * inv255;
  const a = (bytes[offset + 3] ?? 0) * inv255;
  // Inverse of packDepthToRGBA bit packing.
  return (r * (1 / (256 * 256 * 256))) + (g * (1 / (256 * 256))) + (b * (1 / 256)) + a;
}

function getEncodedName(scope, sourceName) {
  return `_helios_encoded_${scope}_${sourceName || 'index'}`;
}

function getEncodedDesc(network, scope, attrName) {
  if (!network || !attrName) return null;
  const source = attrName === 'index' ? INDEX_SENTINEL : attrName;
  const encodedName = getEncodedName(scope, source);
  const defineFn = scope === 'node'
    ? 'defineDenseColorEncodedNodeAttribute'
    : 'defineDenseColorEncodedEdgeAttribute';
  const updateFn = scope === 'node'
    ? 'updateDenseColorEncodedNodeAttribute'
    : 'updateDenseColorEncodedEdgeAttribute';
  const getFn = scope === 'node'
    ? 'getDenseColorEncodedNodeAttributeView'
    : 'getDenseColorEncodedEdgeAttributeView';
  const desc = network[getFn]?.(encodedName);
  return desc ?? null;
}

function ensureEncodedDesc(network, scope, attrName, count) {
  if (!attrName || !count) return null;
  const encodedDesc = getEncodedDesc(network, scope, attrName);
  if (!encodedDesc?.view) {
    throw new Error(`Encoded ${scope} attribute "${attrName}" not available; expected dense color encoding from helios-network.`);
  }
  return encodedDesc;
}

function ensureEncodedReady(network, scope, attrName) {
  if (!network || !attrName) return;
  const source = attrName === 'index' ? INDEX_SENTINEL : attrName;
  const encodedName = getEncodedName(scope, source);
  const defineFn = scope === 'node'
    ? 'defineDenseColorEncodedNodeAttribute'
    : 'defineDenseColorEncodedEdgeAttribute';
  const updateFn = scope === 'node'
    ? 'updateDenseColorEncodedNodeAttribute'
    : 'updateDenseColorEncodedEdgeAttribute';
  network[defineFn]?.(source, encodedName, { format: ENCODE_FORMAT });
  network[updateFn]?.(encodedName);
}

function getSparseEncodedName(scope, sourceName) {
  return `_helios_sparse_encoded_${scope}_${sourceName || 'index'}`;
}

function getSparseEncodedApi(scope) {
  return scope === 'node'
    ? {
      defineFn: 'defineSparseColorEncodedNodeAttribute',
      updateFn: 'updateSparseColorEncodedNodeAttribute',
      getFn: 'getSparseColorEncodedNodeAttributeView',
    }
    : {
      defineFn: 'defineSparseColorEncodedEdgeAttribute',
      updateFn: 'updateSparseColorEncodedEdgeAttribute',
      getFn: 'getSparseColorEncodedEdgeAttributeView',
    };
}

function getSparseEncodedDesc(network, scope, attrName) {
  if (!network || !attrName) return null;
  const source = attrName === 'index' ? INDEX_SENTINEL : attrName;
  const encodedName = getSparseEncodedName(scope, source);
  const api = getSparseEncodedApi(scope);
  const getter = network?.[api.getFn];
  if (typeof getter !== 'function') return null;
  const desc = getter.call(network, encodedName);
  return desc ?? null;
}

function ensureSparseEncodedReady(network, scope, attrName) {
  if (!network || !attrName) return;
  const source = attrName === 'index' ? INDEX_SENTINEL : attrName;
  const encodedName = getSparseEncodedName(scope, source);
  const api = getSparseEncodedApi(scope);
  if (typeof network?.[api.defineFn] === 'function') {
    network[api.defineFn](source, encodedName, { format: ENCODE_FORMAT });
  }
  if (typeof network?.[api.updateFn] === 'function') {
    network[api.updateFn](encodedName);
  }
}

function getAttributeVersionSafe(network, scope, attrName) {
  if (!network || !attrName) return null;
  if (attrName === INDEX_SENTINEL || attrName === 'index' || attrName === '$index') return 0;
  const getter = scope === 'node' ? network.getNodeAttributeVersion : network.getEdgeAttributeVersion;
  if (typeof getter !== 'function') return null;
  try {
    const value = getter.call(network, attrName);
    return Number.isFinite(value) ? Number(value) : null;
  } catch (_) {
    return null;
  }
}

function ensureSparseEncodedReadyCached(cache, network, scope, attrName, topologyVersion = 0) {
  if (!network || !attrName) return;
  const source = attrName === 'index' ? INDEX_SENTINEL : attrName;
  const slot = scope === 'node' ? 'node' : 'edge';
  const topo = Number.isFinite(topologyVersion) ? Number(topologyVersion) : 0;
  const attrVersion = getAttributeVersionSafe(network, scope, source);
  const previous = cache?.[slot] ?? null;
  if (
    previous
    && previous.source === source
    && previous.topologyVersion === topo
    && (attrVersion == null || previous.attrVersion === attrVersion)
  ) {
    const desc = getSparseEncodedDesc(network, scope, attrName);
    if (desc?.view) return;
  }
  ensureSparseEncodedReady(network, scope, attrName);
  if (cache) {
    cache[slot] = {
      source,
      topologyVersion: topo,
      attrVersion,
    };
  }
}

function isIndirectGraphLayer(layer) {
  return Boolean(
    layer
    && typeof layer.withSparseGraph === 'function'
    && typeof layer.resolveIndirectEdgeVariant === 'function',
  );
}

function safeGetAttributeBuffer(network, scope, name) {
  if (!network || !name) return null;
  const getter = scope === 'node' ? network.getNodeAttributeBuffer : network.getEdgeAttributeBuffer;
  if (typeof getter !== 'function') return null;
  try {
    return getter.call(network, name) ?? null;
  } catch (_) {
    return null;
  }
}

function isSupportedTrackedIntegerBuffer(desc) {
  const view = desc?.view ?? null;
  if (!view) return false;
  const dimension = desc?.dimension ?? 1;
  if (dimension !== 1) return false;
  return (
    view instanceof Int8Array
    || view instanceof Int16Array
    || view instanceof Int32Array
    || view instanceof Uint8Array
    || view instanceof Uint16Array
    || view instanceof Uint32Array
  );
}

function resolveTrackedSourceDescriptor(network, scope, attrName) {
  if (!attrName || attrName === INDEX_SENTINEL || attrName === 'index' || attrName === '$index') {
    return { mode: TRACKED_SOURCE_MODE.INDEX, view: null, version: 0, count: 0 };
  }
  const desc = safeGetAttributeBuffer(network, scope, attrName);
  if (!isSupportedTrackedIntegerBuffer(desc)) return null;
  const view = desc.view;
  return {
    mode: (view instanceof Int8Array || view instanceof Int16Array || view instanceof Int32Array)
      ? TRACKED_SOURCE_MODE.INT
      : TRACKED_SOURCE_MODE.UINT,
    view,
    version: desc.version ?? 0,
    count: view.length ?? 0,
  };
}

function normalizeNodeSourceEndpoints(value) {
  if (value === 'source' || value === 'from') return 1;
  if (value === 'destination' || value === 'target' || value === 'to') return 2;
  return 0;
}

function toPackedInteger(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.trunc(numeric);
}

function writeEncodedValue(bytes, offset, value) {
  const packedValue = toPackedInteger(value);
  if (packedValue == null) {
    bytes[offset] = 0;
    bytes[offset + 1] = 0;
    bytes[offset + 2] = 0;
    bytes[offset + 3] = 0;
    return;
  }
  const encoded = (packedValue + 1) >>> 0;
  bytes[offset] = encoded & 0xff;
  bytes[offset + 1] = (encoded >>> 8) & 0xff;
  bytes[offset + 2] = (encoded >>> 16) & 0xff;
  bytes[offset + 3] = (encoded >>> 24) & 0xff;
}

function mixVersions(primary, secondary = 0) {
  const a = Number.isFinite(primary) ? Number(primary) : 0;
  const b = Number.isFinite(secondary) ? Number(secondary) : 0;
  return ((a >>> 0) * 1315423911 + (b >>> 0)) >>> 0;
}

function packActiveValues(source, indices, dimension) {
  if (!source || !indices) return null;
  const count = indices.length ?? 0;
  if (!count) return new Float32Array(0);
  const dim = Math.max(1, Math.floor(dimension || 1));
  const packed = new Float32Array(count * dim);
  for (let i = 0; i < count; i += 1) {
    const sourceIndex = indices[i] ?? 0;
    const sourceBase = sourceIndex * dim;
    const targetBase = i * dim;
    for (let d = 0; d < dim; d += 1) {
      packed[targetBase + d] = source[sourceBase + d] ?? 0;
    }
  }
  return packed;
}

function isIdentityIndices(indices, count) {
  if (!indices) return false;
  const expected = Math.max(0, count ?? 0);
  const length = indices.length ?? 0;
  if (length !== expected) return false;
  for (let i = 0; i < length; i += 1) {
    if ((indices[i] ?? 0) !== i) return false;
  }
  return true;
}

function selectActiveValues(source, indices, dimension) {
  if (!source || !indices) return { view: null, direct: false };
  const dim = Math.max(1, Math.floor(dimension || 1));
  const count = indices.length ?? 0;
  if (!count) return { view: new Float32Array(0), direct: false };
  const sourceCount = Math.floor((source.length ?? 0) / dim);
  if (count === sourceCount && isIdentityIndices(indices, count)) {
    return { view: source, direct: true };
  }
  return { view: packActiveValues(source, indices, dim), direct: false };
}

function packEdgeSegmentsFromSparse(nodePositions, edgeEndpoints, edgeIndices) {
  if (!nodePositions || !edgeEndpoints || !edgeIndices) return null;
  const edgeCount = edgeIndices.length ?? 0;
  if (!edgeCount) return new Float32Array(0);
  const packed = new Float32Array(edgeCount * 6);
  for (let i = 0; i < edgeCount; i += 1) {
    const edgeId = edgeIndices[i] ?? 0;
    const edgeBase = edgeId * 2;
    const sourceId = edgeEndpoints[edgeBase] ?? 0;
    const targetId = edgeEndpoints[edgeBase + 1] ?? 0;
    const sourceBase = sourceId * 3;
    const targetBase = targetId * 3;
    const outBase = i * 6;
    packed[outBase + 0] = nodePositions[sourceBase + 0] ?? 0;
    packed[outBase + 1] = nodePositions[sourceBase + 1] ?? 0;
    packed[outBase + 2] = nodePositions[sourceBase + 2] ?? 0;
    packed[outBase + 3] = nodePositions[targetBase + 0] ?? 0;
    packed[outBase + 4] = nodePositions[targetBase + 1] ?? 0;
    packed[outBase + 5] = nodePositions[targetBase + 2] ?? 0;
  }
  return packed;
}

function packNodeSourcedEdgePairs(nodeValues, edgeEndpoints, edgeIndices, endpointsMode) {
  if (!nodeValues || !edgeEndpoints || !edgeIndices) return null;
  const edgeCount = edgeIndices.length ?? 0;
  if (!edgeCount) return new Float32Array(0);
  const packed = new Float32Array(edgeCount * 2);
  for (let i = 0; i < edgeCount; i += 1) {
    const edgeId = edgeIndices[i] ?? 0;
    const edgeBase = edgeId * 2;
    const sourceId = edgeEndpoints[edgeBase] ?? 0;
    const targetId = edgeEndpoints[edgeBase + 1] ?? 0;
    const sourceValue = nodeValues[sourceId] ?? 0;
    const targetValue = nodeValues[targetId] ?? 0;
    const outBase = i * 2;
    if (endpointsMode === 1) {
      packed[outBase + 0] = sourceValue;
      packed[outBase + 1] = sourceValue;
    } else if (endpointsMode === 2) {
      packed[outBase + 0] = targetValue;
      packed[outBase + 1] = targetValue;
    } else {
      packed[outBase + 0] = sourceValue;
      packed[outBase + 1] = targetValue;
    }
  }
  return packed;
}

function encodeActiveValues(attrName, attrView, activeIndices) {
  if (!attrName || !activeIndices) return null;
  const count = activeIndices.length ?? 0;
  if (!count) return new Uint8Array(0);
  const encoded = new Uint8Array(count * 4);
  const useIndex = attrName === INDEX_SENTINEL || attrName === 'index' || attrName === '$index';
  for (let i = 0; i < count; i += 1) {
    const sourceIndex = activeIndices[i] ?? 0;
    const sourceValue = useIndex ? sourceIndex : attrView?.[sourceIndex];
    writeEncodedValue(encoded, i * 4, sourceValue);
  }
  return encoded;
}

function encodeActiveValuesUint32(attrName, attrView, activeIndices) {
  if (!attrName || !activeIndices) return null;
  const count = activeIndices.length ?? 0;
  if (!count) return new Uint32Array(0);
  const encoded = new Uint32Array(count);
  const useIndex = attrName === INDEX_SENTINEL || attrName === 'index' || attrName === '$index';
  for (let i = 0; i < count; i += 1) {
    const sourceIndex = activeIndices[i] ?? 0;
    const sourceValue = useIndex ? sourceIndex : attrView?.[sourceIndex];
    const packedValue = toPackedInteger(sourceValue);
    encoded[i] = packedValue == null ? 0 : ((packedValue + 1) >>> 0);
  }
  return encoded;
}

function packActiveEncodedValues(encodedDesc, activeIndices) {
  if (!encodedDesc || !activeIndices) return null;
  const count = activeIndices.length ?? 0;
  if (!count) return new Uint8Array(0);
  const source = encodedDesc?.view ?? encodedDesc;
  if (!source || typeof source.length !== 'number') return null;
  const packed = new Uint8Array(count * 4);

  if (source.BYTES_PER_ELEMENT === 1) {
    for (let i = 0; i < count; i += 1) {
      const sourceIndex = activeIndices[i] ?? 0;
      const sourceBase = sourceIndex * 4;
      const outBase = i * 4;
      packed[outBase + 0] = source[sourceBase + 0] ?? 0;
      packed[outBase + 1] = source[sourceBase + 1] ?? 0;
      packed[outBase + 2] = source[sourceBase + 2] ?? 0;
      packed[outBase + 3] = source[sourceBase + 3] ?? 0;
    }
    return packed;
  }

  if (source.BYTES_PER_ELEMENT === 4) {
    for (let i = 0; i < count; i += 1) {
      const sourceIndex = activeIndices[i] ?? 0;
      const value = source[sourceIndex] ?? 0;
      packed[i * 4 + 0] = value & 0xff;
      packed[i * 4 + 1] = (value >>> 8) & 0xff;
      packed[i * 4 + 2] = (value >>> 16) & 0xff;
      packed[i * 4 + 3] = (value >>> 24) & 0xff;
    }
    return packed;
  }

  return null;
}

class WebGLAttributeRenderer {
  constructor(graphLayer, pool, runner) {
    this.graphLayer = graphLayer;
    this.pool = pool;
    this.runner = runner; // Added runner parameter
    this.gl = null;
    this.device = null;
    this.trackDepth = false;
    this.depthBits = 16;
    this.depthReadSupported = true;
    this.depthTargets = { node: null, edge: null };
    this.nodeProgram = null;
    this.nodeDepthProgram = null;
    this.edgeProgram = null;
    this.edgeDepthProgram = null;
    this.edgeQuadProgram = null;
    this.edgeQuadDepthProgram = null;
    this.nodeVAO = null;
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.nodeBuffers = {};
    this.edgeBuffers = {};
    this.edgeQuadBuffer = null;
    this.targets = { node: null, edge: null };
    this.size = null;
    this._outlineFallback = null;
  }

  initialize(device) {
    if (this.gl) return;
    if (!device || device.type !== 'webgl2') return;
    this.device = device;
    this.gl = device.gl;
    const { gl } = this;
    const cache = device.resourceCache?.webgl;
    const getProgram = (key, vert, frag) => {
      if (!cache) return device.createProgram(vert, frag);
      return cache.getOrCreateProgram(`attr:webgl:program:${key}`, () => ({ program: device.createProgram(vert, frag) }))?.program;
    };
    this._getProgram = getProgram;

    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    const nodeQuadBuffer = gl.createBuffer();
    this.nodeQuadBuffer = nodeQuadBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.nodeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const shared = device.resourceCache?.webgl;
    this.nodeBuffers.positions = shared?.ensureBuffer(gl, 'dense:node:positions') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    this.nodeBuffers.sizes = shared?.ensureBuffer(gl, 'dense:node:sizes') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    this.nodeBuffers.outlineWidths = shared?.ensureBuffer(gl, 'dense:node:outlineWidths') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.outlineWidths);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);

    // Encoded buffers are keyed per attribute name at render time; initialize with a stable fallback.
    this.nodeBuffers.encoded = shared?.ensureBuffer(gl, 'attr:webgl:node:encoded:fallback') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.encoded);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, 4, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);

    this.edgeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeVAO);
    this.edgeBuffers.segments = shared?.ensureBuffer(gl, 'dense:edge:segments') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(1, 1);

    this.edgeBuffers.widths = shared?.ensureBuffer(gl, 'dense:edge:widths') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(2, 1);

    this.edgeBuffers.endpointSizes = shared?.ensureBuffer(gl, 'dense:edge:endpointSizes') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(3, 1);

    // Encoded buffers are keyed per attribute name at render time; initialize with a stable fallback.
    this.edgeBuffers.encoded = shared?.ensureBuffer(gl, 'attr:webgl:edge:encoded:fallback') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, 4, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);

    this.edgeQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeQuadBuffer);
    const edgeQuad = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, edgeQuad, gl.STATIC_DRAW);

    this.edgeQuadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeQuadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(2, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(4, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribIPointer(5, 4, gl.UNSIGNED_BYTE, 4, 0);
    gl.vertexAttribDivisor(5, 1);
    gl.bindVertexArray(null);
  }

  destroy() {
    const { gl } = this;
    if (!gl) return;
    gl.deleteVertexArray(this.nodeVAO);
    gl.deleteVertexArray(this.edgeVAO);
    gl.deleteVertexArray(this.edgeQuadVAO);
    if (this.edgeQuadBuffer) gl.deleteBuffer(this.edgeQuadBuffer);
    if (this.nodeQuadBuffer) gl.deleteBuffer(this.nodeQuadBuffer);
    // Shared buffers/programs are owned by the device-level resource cache.
    // Do not delete them here.
    this.nodeVAO = null;
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.targets = { node: null, edge: null };
    this.depthTargets = { node: null, edge: null };
  }

  resize(size, scale, trackDepth) {
    if (!size) return;
    this.trackDepth = trackDepth === true;
    const pixelRatio = size.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.floor((size.width ?? 1) * pixelRatio * scale));
    const height = Math.max(1, Math.floor((size.height ?? 1) * pixelRatio * scale));
    this.size = { width, height };
    const tagNode = this.trackDepth ? 'attr-node-depth-cap' : 'attr-node';
    const tagEdge = this.trackDepth ? 'attr-edge-depth-cap' : 'attr-edge';
    this.targets.node = this.pool.get(this.device, tagNode, width, height, { depth: true, filter: 'nearest' });
    this.targets.edge = this.pool.get(this.device, tagEdge, width, height, { depth: true, filter: 'nearest' });
    this.depthTargets.node = this.trackDepth
      ? this.pool.get(this.device, 'attr-node-depth-color', width, height, { depth: true, filter: 'nearest' })
      : null;
    this.depthTargets.edge = this.trackDepth
      ? this.pool.get(this.device, 'attr-edge-depth-color', width, height, { depth: true, filter: 'nearest' })
      : null;
    this.depthBits = this.trackDepth ? 16 : this.depthBits;
  }

  encodeAttributes(network, geometry, config) {
    const nodeCount = geometry?.nodes?.count ?? 0;
    const edgeCount = geometry?.edges?.count ?? 0;
    const nodeEncoded = ensureEncodedDesc(network, 'node', config.nodeAttribute, nodeCount);
    const edgeEncoded = ensureEncodedDesc(network, 'edge', config.edgeAttribute, edgeCount);
    return { nodeEncoded, edgeEncoded };
  }

  render(frame, size, config) {
    if (!this.gl || !frame?.network) return null;
    const network = frame.network;
    const camera = frame.camera;
    const scale = config.resolutionScale ?? 1;
    this.resize(size, scale, config.trackDepth);
    const cameraUniforms = this.graphLayer.getCameraUniforms(camera);
    if (!cameraUniforms) return null;

    const { gl } = this;
    const is2D = cameraUniforms.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
    const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
    const edgeWidthBase = this.graphLayer.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
    const edgeWidthScale = this.graphLayer.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
    const useQuads = this.graphLayer.edgeRenderingMode === 'quad';

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    ensureEncodedReady(network, 'node', config.nodeAttribute);
    ensureEncodedReady(network, 'edge', config.edgeAttribute);

    const schema = GraphVisualSchema.fromNetwork(network, {
      nodeOutlineUseAttributes: this.graphLayer?.nodeOutlineUseAttributes === true,
    });
    const nodeVariant = schema?.getNodeVariant?.() ?? null;
    const edgeVariant = schema?.getEdgeVariant?.() ?? null;
    const visualConfig = schema?.visualConfig ?? null;
    const nodeCfg = visualConfig?.node ?? null;
    const edgeCfg = visualConfig?.edge ?? null;

    // Match the renderer defaults:
    // - When no visualConfig exists, size/color are buffers; outline buffers depend on the outline toggle.
    // - When visualConfig exists, buffers vs uniforms are driven by `mode`.
    const nodeSizeUniform = nodeVariant ? (nodeVariant.sizeBuffer === false) : false;
    const nodeOutlineUniform = nodeVariant ? (nodeVariant.outlineWidthBuffer === false) : true;
    const edgeWidthUniform = edgeVariant ? (edgeVariant.widthBuffer === false) : false;
    const edgeEndpointSizeUniform = edgeVariant ? (edgeVariant.endpointSizeBuffer === false) : true;

    const nodeSizeRaw = nodeSizeUniform ? Number(nodeCfg?.size?.value ?? 0) : 0;
    const nodeOutlineRaw = nodeOutlineUniform ? Number(nodeCfg?.outline?.value ?? 0) : 0;
    const edgeWidthRaw0 = edgeWidthUniform ? Number(edgeCfg?.width?.value?.[0] ?? 1) : 1;
    const edgeWidthRaw1 = edgeWidthUniform ? Number(edgeCfg?.width?.value?.[1] ?? 1) : 1;
    const edgeEndpointSizeRaw0 = edgeEndpointSizeUniform ? Number(edgeCfg?.endpointSize?.value?.[0] ?? 1) : 1;
    const edgeEndpointSizeRaw1 = edgeEndpointSizeUniform ? Number(edgeCfg?.endpointSize?.value?.[1] ?? 1) : 1;

    const denseRequests = [];
    if (config.nodeAttribute || config.edgeAttribute) {
      denseRequests.push(['node', NODE_POSITION_ATTRIBUTE]);
      if (!nodeSizeUniform) denseRequests.push(['node', NODE_SIZE_ATTRIBUTE]);
      if (!nodeOutlineUniform) denseRequests.push(['node', VISUAL_ATTRIBUTE_NAMES.NODE_OUTLINE_WIDTH_ATTRIBUTE]);
    }
    if (config.edgeAttribute) {
      denseRequests.push(
        ['edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE],
        ...((useQuads && !edgeWidthUniform) ? [['edge', EDGE_WIDTH_ATTRIBUTE]] : []),
        ...(edgeEndpointSizeUniform ? [] : [['edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE]]),
      );
    }

    const overrides = frame?.positionOverrides ?? null;
    return this.graphLayer.withDenseGraph(network, (geometry) => {
      if (!geometry) return null;
      const encoded = this.encodeAttributes(network, geometry, config);
      const passes = [];
      const cache = this.device?.resourceCache?.webgl;

      const variantSources = createAttributeWebGLSources({
        node: {
          size: nodeSizeUniform ? 'uniform' : 'attribute',
          outline: nodeOutlineUniform ? 'uniform' : 'attribute',
        },
        edge: {
          width: (useQuads && edgeWidthUniform) ? 'uniform' : 'attribute',
          endpointSize: edgeEndpointSizeUniform ? 'uniform' : 'attribute',
        },
      });

      const variantKey = [
        nodeSizeUniform ? 'nSizeU' : 'nSizeA',
        nodeOutlineUniform ? 'nOutU' : 'nOutA',
        (useQuads ? 'quad' : 'line'),
        (useQuads && edgeWidthUniform) ? 'eWidthU' : 'eWidthA',
        edgeEndpointSizeUniform ? 'eEndU' : 'eEndA',
      ].join(':');

      const getProgram = this._getProgram;
      const nodeProgram = getProgram?.(`node:${variantKey}`, variantSources.nodeVertex, NODE_ATTRIBUTE_FRAGMENT);
      const nodeDepthProgram = getProgram?.(`nodeDepth:${variantKey}`, variantSources.nodeVertex, NODE_DEPTH_FRAGMENT);
      const edgeProgram = getProgram?.(`edge:${variantKey}`, variantSources.edgeVertex, EDGE_ATTRIBUTE_FRAGMENT);
      const edgeDepthProgram = getProgram?.(`edgeDepth:${variantKey}`, variantSources.edgeVertex, EDGE_DEPTH_FRAGMENT);
      const edgeQuadProgram = getProgram?.(`edgeQuad:${variantKey}`, variantSources.edgeQuadVertex, EDGE_ATTRIBUTE_QUAD_FRAGMENT);
      const edgeQuadDepthProgram = getProgram?.(`edgeQuadDepth:${variantKey}`, variantSources.edgeQuadVertex, EDGE_DEPTH_FRAGMENT);

      const occlusionSources = createAttributeWebGLSources({
        node: {
          size: nodeSizeUniform ? 'uniform' : 'buffer',
          outline: nodeOutlineUniform ? 'uniform' : 'buffer',
          encoded: 'none',
        },
        edge: {
          width: edgeWidthUniform ? 'uniform' : 'buffer',
          endpointSize: edgeEndpointSizeUniform ? 'uniform' : 'buffer',
        },
      });
      const nodeOcclusionProgram = getProgram?.(`nodeOcc:${variantKey}`, occlusionSources.nodeVertex, NODE_OCCLUSION_FRAGMENT);
      const nodeDepthOcclusionProgram = getProgram?.(`nodeDepthOcc:${variantKey}`, occlusionSources.nodeVertex, NODE_DEPTH_FRAGMENT);

      const nodeSizeUniformValue = nodeSizeUniform ? Number(nodeCfg?.size?.value ?? 0) : null;
      const nodeOutlineUniformValue = nodeOutlineUniform ? Number(nodeCfg?.outline?.value ?? 0) : null;
      const edgeWidthUniformPair = (useQuads && edgeWidthUniform) ? (edgeCfg?.width?.value ?? [1, 1]) : null;
      const edgeEndpointUniformPair = edgeEndpointSizeUniform ? (edgeCfg?.endpointSize?.value ?? [1, 1]) : null;

      const nodeSizes = (!nodeSizeUniform) ? geometry.nodes.sizes : null;
      const nodeOutlineWidths = (!nodeOutlineUniform) ? geometry.nodes.outlineWidths : null;
      const edgeWidths = (useQuads && !edgeWidthUniform) ? geometry.edges.widths : null;
      const edgeEndpointSizes = (!edgeEndpointSizeUniform) ? geometry.edges.endpointSizes : null;

      if (!nodeSizeUniform && (!nodeSizes || nodeSizes.length !== geometry.nodes.count)) {
        throw new Error('AttributeTracker: expected dense node sizes buffer but it was missing or wrong length');
      }
      if (!nodeOutlineUniform && (!nodeOutlineWidths || nodeOutlineWidths.length !== geometry.nodes.count)) {
        throw new Error('AttributeTracker: expected dense node outlineWidths buffer but it was missing or wrong length');
      }
      if (config.edgeAttribute) {
        if (useQuads && !edgeWidthUniform) {
          const expected = (geometry.edges.count ?? 0) * 2;
          if (!edgeWidths || edgeWidths.length !== expected) {
            throw new Error('AttributeTracker: expected dense edge widths buffer (vec2 per edge) but it was missing or wrong length');
          }
        }
        if (!edgeEndpointSizeUniform) {
          const expected = (geometry.edges.count ?? 0) * 2;
          if (!edgeEndpointSizes || edgeEndpointSizes.length !== expected) {
            throw new Error('AttributeTracker: expected dense edge endpointSizes buffer (vec2 per edge) but it was missing or wrong length');
          }
        }
      }

      if (geometry.nodes.count && encoded.nodeEncoded && config.nodeAttribute) {
        passes.push(() => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.node?.handle ?? null);
        gl.viewport(0, 0, this.size.width, this.size.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(nodeProgram);
        gl.uniformMatrix4fv(gl.getUniformLocation(nodeProgram, 'u_viewProjection'), false, cameraUniforms.viewProjection);
        gl.uniformMatrix4fv(gl.getUniformLocation(nodeProgram, 'u_view'), false, cameraUniforms.view);
        gl.uniform3fv(gl.getUniformLocation(nodeProgram, 'u_cameraPosition'), cameraUniforms.position);
        gl.uniform3fv(gl.getUniformLocation(nodeProgram, 'u_cameraUp'), cameraUniforms.up);
        gl.uniform3fv(gl.getUniformLocation(nodeProgram, 'u_cameraRight'), cameraUniforms.right);
        gl.uniform1i(gl.getUniformLocation(nodeProgram, 'u_is2D'), is2D ? 1 : 0);
        gl.uniform1f(gl.getUniformLocation(nodeProgram, 'u_nodeSizeBase'), this.graphLayer.nodeSizeBase);
        gl.uniform1f(gl.getUniformLocation(nodeProgram, 'u_nodeSizeScale'), this.graphLayer.nodeSizeScale);
        gl.uniform1f(gl.getUniformLocation(nodeProgram, 'u_outlineWidthBase'), this.graphLayer.nodeOutlineWidthBase);
        gl.uniform1f(gl.getUniformLocation(nodeProgram, 'u_outlineWidthScale'), this.graphLayer.nodeOutlineWidthScale);
        if (nodeSizeUniformValue != null) gl.uniform1f(gl.getUniformLocation(nodeProgram, 'u_nodeSize'), nodeSizeUniformValue);
        if (nodeOutlineUniformValue != null) gl.uniform1f(gl.getUniformLocation(nodeProgram, 'u_nodeOutline'), nodeOutlineUniformValue);
        gl.bindVertexArray(this.nodeVAO);
        if (cache) {
          cache.uploadArrayBuffer(gl, 'dense:node:positions', geometry.nodes.positions, {
            version: geometry.nodes.versions?.positions ?? 0,
            topologyVersion: geometry.nodes.versions?.topology ?? 0,
            count: geometry.nodes.count,
            trackViewIdentity: true,
          });
          if (nodeSizes) {
            cache.uploadArrayBuffer(gl, 'dense:node:sizes', nodeSizes, {
              version: geometry.nodes.versions?.sizes ?? 0,
              topologyVersion: geometry.nodes.versions?.topology ?? 0,
              count: geometry.nodes.count,
              trackViewIdentity: true,
            });
          }
          if (nodeOutlineWidths) {
            cache.uploadArrayBuffer(gl, 'dense:node:outlineWidths', nodeOutlineWidths, {
              version: geometry.nodes.versions?.outlineWidths ?? 0,
              topologyVersion: geometry.nodes.versions?.topology ?? 0,
              count: geometry.nodes.count,
              trackViewIdentity: false,
            });
          }
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.positions, gl.DYNAMIC_DRAW);
          if (nodeSizes) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
            gl.bufferData(gl.ARRAY_BUFFER, nodeSizes, gl.DYNAMIC_DRAW);
          }
          if (nodeOutlineWidths) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.outlineWidths);
            gl.bufferData(gl.ARRAY_BUFFER, nodeOutlineWidths, gl.DYNAMIC_DRAW);
          }
        }
        // Encoded buffer can vary by attribute name; bind the correct shared buffer into the VAO.
        const nodeEncodedKey = `attr:webgl:node:encoded:${config.nodeAttribute || 'index'}`;
        const nodeEncodedBuffer = cache?.ensureBuffer(gl, nodeEncodedKey);
        if (cache && nodeEncodedBuffer) {
          gl.bindVertexArray(this.nodeVAO);
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeEncodedBuffer);
          gl.enableVertexAttribArray(3);
          gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, 4, 0);
          gl.vertexAttribDivisor(3, 1);
        }
        if (cache) {
          cache.uploadArrayBuffer(gl, nodeEncodedKey, encoded.nodeEncoded.view, {
            version: encoded.nodeEncoded.version ?? 0,
            count: geometry.nodes.count,
            // Do not rely on view identity alone: WASM may reuse the same memory region.
            trackViewIdentity: false,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.encoded);
          gl.bufferData(gl.ARRAY_BUFFER, encoded.nodeEncoded.view, gl.DYNAMIC_DRAW);
        }
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.nodes.count);
      });
      }

      if (geometry.edges.count && encoded.edgeEncoded && config.edgeAttribute) {
        // Depth test/write for edges so overlaps are correct in attribute targets.
        passes.push(() => {
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.edge?.handle ?? null);
        gl.viewport(0, 0, this.size.width, this.size.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // First draw nodes into the edge target with zero output color so they occlude edges.
        if (geometry.nodes.count) {
          gl.useProgram(nodeOcclusionProgram);
          gl.uniformMatrix4fv(gl.getUniformLocation(nodeOcclusionProgram, 'u_viewProjection'), false, cameraUniforms.viewProjection);
          gl.uniformMatrix4fv(gl.getUniformLocation(nodeOcclusionProgram, 'u_view'), false, cameraUniforms.view);
          gl.uniform3fv(gl.getUniformLocation(nodeOcclusionProgram, 'u_cameraPosition'), cameraUniforms.position);
          gl.uniform3fv(gl.getUniformLocation(nodeOcclusionProgram, 'u_cameraUp'), cameraUniforms.up);
          gl.uniform3fv(gl.getUniformLocation(nodeOcclusionProgram, 'u_cameraRight'), cameraUniforms.right);
          gl.uniform1i(gl.getUniformLocation(nodeOcclusionProgram, 'u_is2D'), is2D ? 1 : 0);
          gl.uniform1f(gl.getUniformLocation(nodeOcclusionProgram, 'u_nodeSizeBase'), this.graphLayer.nodeSizeBase);
          gl.uniform1f(gl.getUniformLocation(nodeOcclusionProgram, 'u_nodeSizeScale'), this.graphLayer.nodeSizeScale);
          gl.uniform1f(gl.getUniformLocation(nodeOcclusionProgram, 'u_outlineWidthBase'), this.graphLayer.nodeOutlineWidthBase);
          gl.uniform1f(gl.getUniformLocation(nodeOcclusionProgram, 'u_outlineWidthScale'), this.graphLayer.nodeOutlineWidthScale);
          if (nodeSizeUniformValue != null) gl.uniform1f(gl.getUniformLocation(nodeOcclusionProgram, 'u_nodeSize'), nodeSizeUniformValue);
          if (nodeOutlineUniformValue != null) gl.uniform1f(gl.getUniformLocation(nodeOcclusionProgram, 'u_nodeOutline'), nodeOutlineUniformValue);
          gl.bindVertexArray(this.nodeVAO);
          if (cache) {
            cache.uploadArrayBuffer(gl, 'dense:node:positions', geometry.nodes.positions, {
              version: geometry.nodes.versions?.positions ?? 0,
              topologyVersion: geometry.nodes.versions?.topology ?? 0,
              count: geometry.nodes.count,
              trackViewIdentity: true,
            });
            if (nodeSizes) {
              cache.uploadArrayBuffer(gl, 'dense:node:sizes', nodeSizes, {
                version: geometry.nodes.versions?.sizes ?? 0,
                topologyVersion: geometry.nodes.versions?.topology ?? 0,
                count: geometry.nodes.count,
                trackViewIdentity: true,
              });
            }
            if (nodeOutlineWidths) {
              cache.uploadArrayBuffer(gl, 'dense:node:outlineWidths', nodeOutlineWidths, {
                version: geometry.nodes.versions?.outlineWidths ?? 0,
                topologyVersion: geometry.nodes.versions?.topology ?? 0,
                count: geometry.nodes.count,
                trackViewIdentity: false,
              });
            }
          } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
            gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.positions, gl.DYNAMIC_DRAW);
            if (nodeSizes) {
              gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
              gl.bufferData(gl.ARRAY_BUFFER, nodeSizes, gl.DYNAMIC_DRAW);
            }
            if (nodeOutlineWidths) {
              gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.outlineWidths);
              gl.bufferData(gl.ARRAY_BUFFER, nodeOutlineWidths, gl.DYNAMIC_DRAW);
            }
          }
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.nodes.count);
        }
        const widthBaseLocation = 'u_edgeWidthBase';
        const widthScaleLocation = 'u_edgeWidthScale';
        const nodeSizeBaseLocation = 'u_nodeSizeBase';
        const nodeSizeScaleLocation = 'u_nodeSizeScale';
        const endpointLocation = 'u_edgeEndpointTrim';
        const program = useQuads ? edgeQuadProgram : edgeProgram;
        gl.useProgram(program);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewProjection'), false, cameraUniforms.viewProjection);
        gl.uniform1f(gl.getUniformLocation(program, widthBaseLocation), edgeWidthBase);
        gl.uniform1f(gl.getUniformLocation(program, widthScaleLocation), edgeWidthScale);
        gl.uniform1f(gl.getUniformLocation(program, nodeSizeBaseLocation), this.graphLayer.nodeSizeBase);
        gl.uniform1f(gl.getUniformLocation(program, nodeSizeScaleLocation), this.graphLayer.nodeSizeScale);
        gl.uniform1f(gl.getUniformLocation(program, endpointLocation), this.graphLayer.edgeEndpointTrim);
        if (edgeEndpointUniformPair) {
          gl.uniform2f(
            gl.getUniformLocation(program, 'u_edgeEndpointSize'),
            Number(edgeEndpointUniformPair?.[0] ?? 1),
            Number(edgeEndpointUniformPair?.[1] ?? 1),
          );
        }
        if (useQuads) {
          if (edgeWidthUniformPair) {
            gl.uniform2f(
              gl.getUniformLocation(program, 'u_edgeWidth'),
              Number(edgeWidthUniformPair?.[0] ?? 1),
              Number(edgeWidthUniformPair?.[1] ?? 1),
            );
          }
          const viewport = cameraUniforms.viewport;
          const vw = viewport?.width ? viewport.width * (viewport.devicePixelRatio ?? 1) : this.size.width;
          const vh = viewport?.height ? viewport.height * (viewport.devicePixelRatio ?? 1) : this.size.height;
          gl.uniform2f(gl.getUniformLocation(program, 'u_viewport'), vw, vh);
        }
        gl.bindVertexArray(useQuads ? this.edgeQuadVAO : this.edgeVAO);
        if (cache) {
          cache.uploadArrayBuffer(gl, 'dense:edge:segments', geometry.edges.segments, {
            version: geometry.edges.versions?.segments ?? 0,
            topologyVersion: geometry.edges.versions?.topology ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: true,
          });
          if (useQuads && edgeWidths) {
            cache.uploadArrayBuffer(gl, 'dense:edge:widths', edgeWidths, {
              version: geometry.edges.versions?.widths ?? 0,
              topologyVersion: geometry.edges.versions?.topology ?? 0,
              count: geometry.edges.count,
              trackViewIdentity: true,
            });
          }
          if (edgeEndpointSizes) {
            cache.uploadArrayBuffer(gl, 'dense:edge:endpointSizes', edgeEndpointSizes, {
              version: geometry.edges.versions?.endpointSizes ?? 0,
              topologyVersion: geometry.edges.versions?.topology ?? 0,
              count: geometry.edges.count,
              trackViewIdentity: true,
            });
          }
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.segments, gl.DYNAMIC_DRAW);
          if (useQuads && edgeWidths) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
            gl.bufferData(gl.ARRAY_BUFFER, edgeWidths, gl.DYNAMIC_DRAW);
          }
          if (edgeEndpointSizes) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
            gl.bufferData(gl.ARRAY_BUFFER, edgeEndpointSizes, gl.DYNAMIC_DRAW);
          }
        }
        const edgeEncodedKey = `attr:webgl:edge:encoded:${config.edgeAttribute || 'index'}`;
        const edgeEncodedBuffer = cache?.ensureBuffer(gl, edgeEncodedKey);
        if (cache && edgeEncodedBuffer) {
          const vao = useQuads ? this.edgeQuadVAO : this.edgeVAO;
          const loc = useQuads ? 5 : 4;
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, edgeEncodedBuffer);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribIPointer(loc, 4, gl.UNSIGNED_BYTE, 4, 0);
          gl.vertexAttribDivisor(loc, 1);
        }
        if (cache) {
          cache.uploadArrayBuffer(gl, edgeEncodedKey, encoded.edgeEncoded.view, {
            version: encoded.edgeEncoded.version ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: false,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
          gl.bufferData(gl.ARRAY_BUFFER, encoded.edgeEncoded.view, gl.DYNAMIC_DRAW);
        }
        if (useQuads) {
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.edges.count);
        } else {
          gl.drawArraysInstanced(gl.LINES, 0, 2, geometry.edges.count);
        }
      });
    }

    // Optional depth-to-color fallback: render packed depth into a color target for robust readback.
      const renderDepthColor = (target, isNode, useQuads) => {
      if (!target) return;
      const program = isNode
        ? nodeDepthOcclusionProgram
        : (useQuads ? edgeQuadDepthProgram : edgeDepthProgram);
      if (!program) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.handle);
      gl.viewport(0, 0, this.size.width, this.size.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewProjection'), false, cameraUniforms.viewProjection);
      gl.uniform1i(gl.getUniformLocation(program, 'u_is2D'), is2D ? 1 : 0);
      if (isNode) {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_view'), false, cameraUniforms.view);
        gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraPosition'), cameraUniforms.position);
        gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraUp'), cameraUniforms.up);
        gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraRight'), cameraUniforms.right);
        gl.uniform1f(gl.getUniformLocation(program, 'u_nodeSizeBase'), this.graphLayer.nodeSizeBase);
        gl.uniform1f(gl.getUniformLocation(program, 'u_nodeSizeScale'), this.graphLayer.nodeSizeScale);
        gl.uniform1f(gl.getUniformLocation(program, 'u_outlineWidthBase'), this.graphLayer.nodeOutlineWidthBase);
        gl.uniform1f(gl.getUniformLocation(program, 'u_outlineWidthScale'), this.graphLayer.nodeOutlineWidthScale);
        if (nodeSizeUniformValue != null) gl.uniform1f(gl.getUniformLocation(program, 'u_nodeSize'), nodeSizeUniformValue);
        if (nodeOutlineUniformValue != null) gl.uniform1f(gl.getUniformLocation(program, 'u_nodeOutline'), nodeOutlineUniformValue);
        gl.bindVertexArray(this.nodeVAO);
        if (cache) {
          cache.uploadArrayBuffer(gl, 'dense:node:positions', geometry.nodes.positions, {
            version: geometry.nodes.versions?.positions ?? 0,
            topologyVersion: geometry.nodes.versions?.topology ?? 0,
            count: geometry.nodes.count,
            trackViewIdentity: true,
          });
          if (nodeSizes) {
            cache.uploadArrayBuffer(gl, 'dense:node:sizes', nodeSizes, {
              version: geometry.nodes.versions?.sizes ?? 0,
              topologyVersion: geometry.nodes.versions?.topology ?? 0,
              count: geometry.nodes.count,
              trackViewIdentity: true,
            });
          }
          if (nodeOutlineWidths) {
            cache.uploadArrayBuffer(gl, 'dense:node:outlineWidths', nodeOutlineWidths, {
              version: geometry.nodes.versions?.outlineWidths ?? 0,
              topologyVersion: geometry.nodes.versions?.topology ?? 0,
              count: geometry.nodes.count,
              trackViewIdentity: false,
            });
          }
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.positions, gl.DYNAMIC_DRAW);
          if (nodeSizes) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
            gl.bufferData(gl.ARRAY_BUFFER, nodeSizes, gl.DYNAMIC_DRAW);
          }
          if (nodeOutlineWidths) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.outlineWidths);
            gl.bufferData(gl.ARRAY_BUFFER, nodeOutlineWidths, gl.DYNAMIC_DRAW);
          }
        }
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.nodes.count);
      } else {
        const widthBaseLocation = 'u_edgeWidthBase';
        const widthScaleLocation = 'u_edgeWidthScale';
        const nodeSizeBaseLocation = 'u_nodeSizeBase';
        const nodeSizeScaleLocation = 'u_nodeSizeScale';
        const endpointLocation = 'u_edgeEndpointTrim';
        gl.uniform1f(gl.getUniformLocation(program, widthBaseLocation), edgeWidthBase);
        gl.uniform1f(gl.getUniformLocation(program, widthScaleLocation), edgeWidthScale);
        gl.uniform1f(gl.getUniformLocation(program, nodeSizeBaseLocation), this.graphLayer.nodeSizeBase);
        gl.uniform1f(gl.getUniformLocation(program, nodeSizeScaleLocation), this.graphLayer.nodeSizeScale);
        gl.uniform1f(gl.getUniformLocation(program, endpointLocation), this.graphLayer.edgeEndpointTrim);
        if (edgeEndpointUniformPair) {
          gl.uniform2f(
            gl.getUniformLocation(program, 'u_edgeEndpointSize'),
            Number(edgeEndpointUniformPair?.[0] ?? 1),
            Number(edgeEndpointUniformPair?.[1] ?? 1),
          );
        }
        if (useQuads) {
          if (edgeWidthUniformPair) {
            gl.uniform2f(
              gl.getUniformLocation(program, 'u_edgeWidth'),
              Number(edgeWidthUniformPair?.[0] ?? 1),
              Number(edgeWidthUniformPair?.[1] ?? 1),
            );
          }
          const viewport = cameraUniforms.viewport;
          const vw = viewport?.width ? viewport.width * (viewport.devicePixelRatio ?? 1) : this.size.width;
          const vh = viewport?.height ? viewport.height * (viewport.devicePixelRatio ?? 1) : this.size.height;
          gl.uniform2f(gl.getUniformLocation(program, 'u_viewport'), vw, vh);
        }
        gl.bindVertexArray(useQuads ? this.edgeQuadVAO : this.edgeVAO);
        if (cache) {
          cache.uploadArrayBuffer(gl, 'dense:edge:segments', geometry.edges.segments, {
            version: geometry.edges.versions?.segments ?? 0,
            topologyVersion: geometry.edges.versions?.topology ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: true,
          });
          if (useQuads && edgeWidths) {
            cache.uploadArrayBuffer(gl, 'dense:edge:widths', edgeWidths, {
              version: geometry.edges.versions?.widths ?? 0,
              topologyVersion: geometry.edges.versions?.topology ?? 0,
              count: geometry.edges.count,
              trackViewIdentity: true,
            });
          }
          if (edgeEndpointSizes) {
            cache.uploadArrayBuffer(gl, 'dense:edge:endpointSizes', edgeEndpointSizes, {
              version: geometry.edges.versions?.endpointSizes ?? 0,
              topologyVersion: geometry.edges.versions?.topology ?? 0,
              count: geometry.edges.count,
              trackViewIdentity: true,
            });
          }
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.segments, gl.DYNAMIC_DRAW);
          if (useQuads && edgeWidths) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
            gl.bufferData(gl.ARRAY_BUFFER, edgeWidths, gl.DYNAMIC_DRAW);
          }
          if (edgeEndpointSizes) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
            gl.bufferData(gl.ARRAY_BUFFER, edgeEndpointSizes, gl.DYNAMIC_DRAW);
          }
        }
        const edgeEncodedKey = `attr:webgl:edge:encoded:${config.edgeAttribute || 'index'}`;
        const edgeEncodedBuffer = cache?.ensureBuffer(gl, edgeEncodedKey);
        if (cache && edgeEncodedBuffer) {
          const vao = useQuads ? this.edgeQuadVAO : this.edgeVAO;
          const loc = useQuads ? 5 : 4;
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, edgeEncodedBuffer);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribIPointer(loc, 4, gl.UNSIGNED_BYTE, 4, 0);
          gl.vertexAttribDivisor(loc, 1);
        }
        if (cache) {
          cache.uploadArrayBuffer(gl, edgeEncodedKey, encoded.edgeEncoded.view, {
            version: encoded.edgeEncoded.version ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: false,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
          gl.bufferData(gl.ARRAY_BUFFER, encoded.edgeEncoded.view, gl.DYNAMIC_DRAW);
        }
        if (useQuads) {
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.edges.count);
        } else {
          gl.drawArraysInstanced(gl.LINES, 0, 2, geometry.edges.count);
        }
      }
    };

      if (config.trackDepth) {
        if (geometry.nodes.count && this.depthTargets.node) {
          passes.push(() => renderDepthColor(this.depthTargets.node, true, false));
        }
        if (geometry.edges.count && this.depthTargets.edge) {
          const useQuads = this.graphLayer.edgeRenderingMode === 'quad';
          passes.push(() => {
            // Draw occluding nodes into the edge depth-color target before edges.
            if (geometry.nodes.count && this.depthTargets.edge) {
              renderDepthColor(this.depthTargets.edge, true, false);
            }
            renderDepthColor(this.depthTargets.edge, false, useQuads);
          });
        }
      }

      passes.push(() => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
      });

      this.runner?.run?.(passes, { gl, device: this.device });
      return { ...this.targets, depthTargets: this.depthTargets };
    }, denseRequests, overrides);
  }

  readDepth(target, x, y) {
    if (!this.trackDepth || !this.depthReadSupported) return null;
    if (!target?.depthTexture && !target?.depthRenderbuffer) return null;
    const { gl } = this;
    const type = target.depthType
      ?? (target.depthFormat === gl.DEPTH_COMPONENT32F ? gl.FLOAT : gl.UNSIGNED_SHORT);
    const pixel = type === gl.UNSIGNED_INT
      ? new Uint32Array(1)
      : (type === gl.UNSIGNED_SHORT ? new Uint16Array(1) : new Float32Array(1));
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.handle);
    gl.getError(); // clear previous errors
    try {
      gl.readPixels(x, y, 1, 1, gl.DEPTH_COMPONENT, type, pixel);
    } catch (error) {
      console.warn('AttributeTracker: depth read failed', error);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const postErr = gl.getError();
    if (postErr !== gl.NO_ERROR) {
      const canTryFloat = target.depthFormat === gl.DEPTH_COMPONENT32F && type !== gl.FLOAT;
      if (canTryFloat) {
        return this.readDepth({ ...target, depthType: gl.FLOAT }, x, y);
      }
      console.warn('AttributeTracker: depth readPixels error', { postErr, type, depthFormat: target.depthFormat });
      this.depthReadSupported = false; // stop spamming on platforms that reject depth readback
      return null;
    }
    let depth = pixel[0];
    if (type === gl.UNSIGNED_INT || type === gl.UNSIGNED_SHORT) {
      const bits = target.depthBits ?? this.depthBits ?? (type === gl.UNSIGNED_SHORT ? 16 : 24);
      const maxVal = Math.max(1, (2 ** bits) - 1);
      depth = depth / maxVal;
    }
    return Number.isFinite(depth) ? depth : null;
  }
}

export class WebGLIndirectAttributeRenderer {
  constructor(graphLayer, pool, runner) {
    this.graphLayer = graphLayer;
    this.pool = pool;
    this.runner = runner;
    this.gl = null;
    this.device = null;
    this.trackDepth = false;
    this.depthBits = 16;
    this.depthReadSupported = true;
    this.targets = { node: null, edge: null };
    this.depthTargets = { node: null, edge: null };
    this.size = null;

    this.programs = {
      node: null,
      nodeOcclusion: null,
      nodeDepth: null,
      edge: null,
      edgeQuad: null,
      edgeDepth: null,
      edgeQuadDepth: null,
    };
    this.uniforms = {
      node: null,
      nodeOcclusion: null,
      nodeDepth: null,
      edge: null,
      edgeDepth: null,
    };

    this.nodeVao = null;
    this.edgeVao = null;
    this.edgeQuadVao = null;
    this.edgeQuadBuffer = null;
    this.nodeIdBuffer = null;
    this.edgeIdBuffer = null;
    this.bufferMeta = {
      nodeIds: null,
      edgeIds: null,
    };

    this.textures = {
      nodePositions: null,
      nodeSizes: null,
      nodeOutlineWidths: null,
      nodeEncoded: null,
      nodeTrackedFloat: null,
      nodeTrackedInt: null,
      nodeTrackedUint: null,
      edgeEndpoints: null,
      edgeWidths: null,
      edgeEndpointSizes: null,
      nodeWidthSource: null,
      nodeEndpointSizeSource: null,
      edgeEncoded: null,
      edgeTrackedFloat: null,
      edgeTrackedInt: null,
      edgeTrackedUint: null,
    };
    this.textureMeta = {
      nodePositions: null,
      nodeSizes: null,
      nodeOutlineWidths: null,
      nodeEncoded: null,
      nodeTrackedFloat: null,
      nodeTrackedInt: null,
      nodeTrackedUint: null,
      edgeEndpoints: null,
      edgeWidths: null,
      edgeEndpointSizes: null,
      nodeWidthSource: null,
      nodeEndpointSizeSource: null,
      edgeEncoded: null,
      edgeTrackedFloat: null,
      edgeTrackedInt: null,
      edgeTrackedUint: null,
    };
    this.sparseEncodedReadyCache = { node: null, edge: null };
  }

  initialize(device) {
    if (this.gl) return;
    if (!device || device.type !== 'webgl2') return;
    this.device = device;
    this.gl = device.gl;
    this.initializePrograms();
    this.initializeGeometry();
    this.initializeTextures();
  }

  initializePrograms() {
    const { gl, device } = this;
    const resolveUniforms = (program, names) => {
      const out = {};
      for (const name of names) out[name] = gl.getUniformLocation(program, name);
      return out;
    };

    this.programs.node = device.createProgram(
      WEBGL_INDIRECT_TRACK_NODE_VERTEX,
      WEBGL_INDIRECT_TRACK_NODE_FRAGMENT,
    );
    this.programs.nodeOcclusion = device.createProgram(
      WEBGL_INDIRECT_TRACK_NODE_VERTEX,
      WEBGL_INDIRECT_TRACK_NODE_OCCLUSION_FRAGMENT,
    );
    this.programs.nodeDepth = device.createProgram(
      WEBGL_INDIRECT_TRACK_NODE_VERTEX,
      WEBGL_INDIRECT_TRACK_NODE_DEPTH_FRAGMENT,
    );
    this.programs.edge = device.createProgram(
      WEBGL_INDIRECT_TRACK_EDGE_VERTEX,
      WEBGL_INDIRECT_TRACK_EDGE_FRAGMENT,
    );
    this.programs.edgeQuad = device.createProgram(
      WEBGL_INDIRECT_TRACK_EDGE_QUAD_VERTEX,
      WEBGL_INDIRECT_TRACK_EDGE_FRAGMENT,
    );
    this.programs.edgeDepth = device.createProgram(
      WEBGL_INDIRECT_TRACK_EDGE_VERTEX,
      WEBGL_INDIRECT_TRACK_EDGE_DEPTH_FRAGMENT,
    );
    this.programs.edgeQuadDepth = device.createProgram(
      WEBGL_INDIRECT_TRACK_EDGE_QUAD_VERTEX,
      WEBGL_INDIRECT_TRACK_EDGE_DEPTH_FRAGMENT,
    );

    const nodeUniformNames = [
      'u_viewProjection',
      'u_nodePositions',
      'u_nodeSizes',
      'u_nodeOutlineWidths',
      'u_nodeEncoded',
      'u_nodeTrackedFloat',
      'u_nodeTrackedInt',
      'u_nodeTrackedUint',
      'u_cameraPosition',
      'u_cameraUp',
      'u_cameraRight',
      'u_is2D',
      'u_viewport',
      'u_useNodeIdBuffer',
      'u_useNodeSize',
      'u_useNodeOutline',
      'u_useEncodedTexture',
      'u_trackedNodeValueMode',
      'u_nodeSizeBase',
      'u_nodeSizeScale',
      'u_nodeOutline',
      'u_outlineWidthBase',
      'u_outlineWidthScale',
    ];
    this.uniforms.node = resolveUniforms(this.programs.node, nodeUniformNames);
    this.uniforms.nodeOcclusion = resolveUniforms(this.programs.nodeOcclusion, nodeUniformNames);
    this.uniforms.nodeDepth = resolveUniforms(this.programs.nodeDepth, nodeUniformNames);
    this.uniforms.edge = resolveUniforms(this.programs.edge, [
      'u_viewProjection',
      'u_nodePositions',
      'u_edgeEndpoints',
      'u_edgeEncoded',
      'u_edgeTrackedFloat',
      'u_edgeTrackedInt',
      'u_edgeTrackedUint',
      'u_useEdgeIdBuffer',
      'u_useEncodedTexture',
      'u_trackedEdgeValueMode',
    ]);
    this.uniforms.edgeDepth = resolveUniforms(this.programs.edgeDepth, [
      'u_viewProjection',
      'u_nodePositions',
      'u_edgeEndpoints',
      'u_edgeEncoded',
      'u_edgeTrackedFloat',
      'u_edgeTrackedInt',
      'u_edgeTrackedUint',
      'u_useEdgeIdBuffer',
      'u_useEncodedTexture',
      'u_trackedEdgeValueMode',
    ]);
    const edgeQuadUniformNames = [
      'u_viewProjection',
      'u_viewport',
      'u_nodePositions',
      'u_edgeEndpoints',
      'u_edgeEncoded',
      'u_edgeTrackedFloat',
      'u_edgeTrackedInt',
      'u_edgeTrackedUint',
      'u_edgeWidths',
      'u_edgeEndpointSizes',
      'u_nodeWidthSource',
      'u_nodeEndpointSizeSource',
      'u_useEdgeIdBuffer',
      'u_useEncodedTexture',
      'u_trackedEdgeValueMode',
      'u_edgeWidthSource',
      'u_edgeWidthEndpoints',
      'u_edgeEndpointSizeSource',
      'u_edgeEndpointSizeEndpoints',
      'u_hasEdgeWidths',
      'u_hasEdgeEndpointSizes',
      'u_hasNodeWidthSource',
      'u_hasNodeEndpointSizeSource',
      'u_defaultEdgeWidth',
      'u_defaultEdgeEndpointSize',
      'u_edgeWidthBase',
      'u_edgeWidthScale',
      'u_nodeSizeBase',
      'u_nodeSizeScale',
      'u_edgeEndpointTrim',
    ];
    this.uniforms.edgeQuad = resolveUniforms(this.programs.edgeQuad, edgeQuadUniformNames);
    this.uniforms.edgeQuadDepth = resolveUniforms(this.programs.edgeQuadDepth, edgeQuadUniformNames);
  }

  initializeGeometry() {
    const { gl } = this;
    this.nodeIdBuffer = gl.createBuffer();
    this.edgeIdBuffer = gl.createBuffer();
    this.edgeQuadBuffer = gl.createBuffer();

    this.nodeVao = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeIdBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribIPointer(0, 1, gl.UNSIGNED_INT, 4, 0);
    gl.vertexAttribDivisor(0, 1);

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

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  createTexture() {
    const { gl } = this;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  initializeTextures() {
    const { gl } = this;
    this.textures.nodePositions = this.createTexture();
    this.textures.nodeSizes = this.createTexture();
    this.textures.nodeOutlineWidths = this.createTexture();
    this.textures.nodeEncoded = this.createTexture();
    this.textures.nodeTrackedFloat = this.createTexture();
    this.textures.nodeTrackedInt = this.createTexture();
    this.textures.nodeTrackedUint = this.createTexture();
    this.textures.edgeEndpoints = this.createTexture();
    this.textures.edgeWidths = this.createTexture();
    this.textures.edgeEndpointSizes = this.createTexture();
    this.textures.nodeWidthSource = this.createTexture();
    this.textures.nodeEndpointSizeSource = this.createTexture();
    this.textures.edgeEncoded = this.createTexture();
    this.textures.edgeTrackedFloat = this.createTexture();
    this.textures.edgeTrackedInt = this.createTexture();
    this.textures.edgeTrackedUint = this.createTexture();

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodePositions);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, 1, 1, 0, gl.RGB, gl.FLOAT, new Float32Array([0, 0, 0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodeSizes);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodeOutlineWidths);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodeEncoded);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodeTrackedFloat);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodeTrackedInt);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, 1, 1, 0, gl.RED_INTEGER, gl.INT, new Int32Array([0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodeTrackedUint);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, 1, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, new Uint32Array([0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.edgeEndpoints);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32UI, 1, 1, 0, gl.RG_INTEGER, gl.UNSIGNED_INT, new Uint32Array([0, 0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.edgeWidths);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array([1, 1]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.edgeEndpointSizes);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array([1, 1]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodeWidthSource);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.nodeEndpointSizeSource);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([1]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.edgeEncoded);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8UI, 1, 1, 0, gl.RGBA_INTEGER, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.edgeTrackedFloat);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.edgeTrackedInt);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32I, 1, 1, 0, gl.RED_INTEGER, gl.INT, new Int32Array([0]));

    gl.bindTexture(gl.TEXTURE_2D, this.textures.edgeTrackedUint);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, 1, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, new Uint32Array([0]));
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  destroy() {
    const { gl } = this;
    if (!gl) return;
    Object.values(this.programs).forEach((program) => {
      if (program) gl.deleteProgram(program);
    });
    if (this.nodeVao) gl.deleteVertexArray(this.nodeVao);
    if (this.edgeVao) gl.deleteVertexArray(this.edgeVao);
    if (this.edgeQuadVao) gl.deleteVertexArray(this.edgeQuadVao);
    if (this.nodeIdBuffer) gl.deleteBuffer(this.nodeIdBuffer);
    if (this.edgeIdBuffer) gl.deleteBuffer(this.edgeIdBuffer);
    if (this.edgeQuadBuffer) gl.deleteBuffer(this.edgeQuadBuffer);
    Object.values(this.textures).forEach((texture) => {
      if (texture) gl.deleteTexture(texture);
    });
    this.targets = { node: null, edge: null };
    this.depthTargets = { node: null, edge: null };
    this.gl = null;
    this.device = null;
  }

  resize(size, scale, trackDepth) {
    if (!size) return;
    const pixelRatio = size.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.floor((size.width ?? 1) * pixelRatio * scale));
    const height = Math.max(1, Math.floor((size.height ?? 1) * pixelRatio * scale));
    if (this.size && this.size.width === width && this.size.height === height && this.trackDepth === (trackDepth === true)) {
      return;
    }
    this.trackDepth = trackDepth === true;
    this.size = { width, height };
    const tagNode = this.trackDepth ? 'attr-node-indirect-depth-cap' : 'attr-node-indirect';
    const tagEdge = this.trackDepth ? 'attr-edge-indirect-depth-cap' : 'attr-edge-indirect';
    this.targets.node = this.pool.get(this.device, tagNode, width, height, { depth: true, filter: 'nearest' });
    this.targets.edge = this.pool.get(this.device, tagEdge, width, height, { depth: true, filter: 'nearest' });
    this.depthTargets.node = this.trackDepth
      ? this.pool.get(this.device, 'attr-node-indirect-depth-color', width, height, { depth: true, filter: 'nearest' })
      : null;
    this.depthTargets.edge = this.trackDepth
      ? this.pool.get(this.device, 'attr-edge-indirect-depth-color', width, height, { depth: true, filter: 'nearest' })
      : null;
    this.depthBits = this.trackDepth ? 16 : this.depthBits;
  }

  getTextureLayout(count) {
    const max = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) ?? 16384;
    const safeCount = Math.max(1, Math.floor(Number(count) || 0));
    const width = Math.min(max, safeCount);
    const height = Math.ceil(safeCount / width);
    if (height > max) {
      throw new Error(
        `WebGL indirect attribute tracking requires texture dimensions <= MAX_TEXTURE_SIZE (${max}), `
        + `got ${safeCount} texels -> ${width}x${height}.`,
      );
    }
    return { width, height };
  }

  uploadTexture2D(texture, view, components, count, formatInfo, type) {
    const { gl } = this;
    const { width, height } = this.getTextureLayout(count);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    if (height === 1) {
      const valueCount = width * components;
      const directView = (view.length === valueCount) ? view : view.subarray(0, valueCount);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        formatInfo.internalFormat,
        width,
        1,
        0,
        formatInfo.format,
        type,
        directView,
      );
      return;
    }
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      formatInfo.internalFormat,
      width,
      height,
      0,
      formatInfo.format,
      type,
      null,
    );
    let remaining = count;
    let srcOffset = 0;
    for (let y = 0; y < height && remaining > 0; y += 1) {
      const rowTexels = Math.min(width, remaining);
      const valueCount = rowTexels * components;
      const rowView = view.subarray(srcOffset, srcOffset + valueCount);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        y,
        rowTexels,
        1,
        formatInfo.format,
        type,
        rowView,
      );
      srcOffset += valueCount;
      remaining -= rowTexels;
    }
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

  uploadTrackedIntTexture(slot, texture, view, count, version) {
    if (!view || !texture || !count) return false;
    if (this.isSameView(this.textureMeta[slot], view, version, count)) return true;
    const { gl } = this;
    let internalFormat = gl.R32I;
    let type = gl.INT;
    if (view instanceof Int8Array) {
      internalFormat = gl.R8I;
      type = gl.BYTE;
    } else if (view instanceof Int16Array) {
      internalFormat = gl.R16I;
      type = gl.SHORT;
    } else if (!(view instanceof Int32Array)) {
      return false;
    }
    this.uploadTexture2D(
      texture,
      view,
      1,
      count,
      { internalFormat, format: gl.RED_INTEGER },
      type,
    );
    this.rememberView(slot, view, version, count);
    return true;
  }

  uploadTrackedUintTexture(slot, texture, view, count, version) {
    if (!view || !texture || !count) return false;
    if (this.isSameView(this.textureMeta[slot], view, version, count)) return true;
    const { gl } = this;
    let internalFormat = gl.R32UI;
    let type = gl.UNSIGNED_INT;
    if (view instanceof Uint8Array) {
      internalFormat = gl.R8UI;
      type = gl.UNSIGNED_BYTE;
    } else if (view instanceof Uint16Array) {
      internalFormat = gl.R16UI;
      type = gl.UNSIGNED_SHORT;
    } else if (!(view instanceof Uint32Array)) {
      return false;
    }
    this.uploadTexture2D(
      texture,
      view,
      1,
      count,
      { internalFormat, format: gl.RED_INTEGER },
      type,
    );
    this.rememberView(slot, view, version, count);
    return true;
  }

  normalizeEncodedDescriptor(desc) {
    const sourceView = desc?.view ?? null;
    if (!sourceView) return null;
    if (sourceView.BYTES_PER_ELEMENT === 1) {
      const count = Math.floor((sourceView.length ?? 0) / 4);
      return count > 0
        ? { sourceView, bytesView: sourceView, count, version: desc?.version ?? 0 }
        : null;
    }
    if (sourceView.BYTES_PER_ELEMENT === 4) {
      const count = sourceView.length ?? 0;
      const bytesView = new Uint8Array(sourceView.buffer, sourceView.byteOffset, sourceView.byteLength);
      return count > 0
        ? { sourceView, bytesView, count, version: desc?.version ?? 0 }
        : null;
    }
    return null;
  }

  uploadEncodedTexture(slot, texture, encoded) {
    if (!encoded || !texture || !encoded.count) return false;
    if (this.isSameView(this.textureMeta[slot], encoded.sourceView, encoded.version, encoded.count)) return true;
    const { gl } = this;
    this.uploadTexture2D(
      texture,
      encoded.bytesView,
      4,
      encoded.count,
      { internalFormat: gl.RGBA8UI, format: gl.RGBA_INTEGER },
      gl.UNSIGNED_BYTE,
    );
    this.rememberView(slot, encoded.sourceView, encoded.version, encoded.count);
    return true;
  }

  uploadIdBuffer(slot, buffer, view, version, count) {
    if (!view || !buffer) return false;
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
    return true;
  }

  bindTexture(unit, texture) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  isIndexAttribute(name) {
    return name === INDEX_SENTINEL || name === 'index' || name === '$index';
  }

  resolveTrackedAttributeDescriptor(network, scope, attrName) {
    if (!attrName || this.isIndexAttribute(attrName)) return null;
    const desc = safeGetAttributeBuffer(network, scope, attrName);
    const view = desc?.view ?? null;
    if (!view) return null;
    const dimension = desc?.dimension ?? 1;
    if (dimension !== 1) return null;
    const count = view.length ?? 0;
    const version = desc?.version ?? 0;
    if (view instanceof Int8Array || view instanceof Int16Array || view instanceof Int32Array) {
      return { mode: TRACKED_VALUE_MODE.INT_TEXTURE, view, count, version };
    }
    if (view instanceof Uint8Array || view instanceof Uint16Array || view instanceof Uint32Array) {
      return { mode: TRACKED_VALUE_MODE.UINT_TEXTURE, view, count, version };
    }
    return null;
  }

  mapEndpointMode(value) {
    return value === 'source' ? 1 : (value === 'destination' ? 2 : 0);
  }

  getSharedGraphResources() {
    const provider = this.graphLayer?.getSharedSparseResources;
    if (typeof provider !== 'function') return null;
    try {
      return provider.call(this.graphLayer);
    } catch (_) {
      return null;
    }
  }

  resolveSharedTexture({
    slot,
    localTexture,
    sharedResources,
    sharedTextureKey,
    sharedMetaKey,
    view,
    version,
    count,
    upload,
  }) {
    const sharedTexture = sharedResources?.textures?.[sharedTextureKey] ?? null;
    const sharedMeta = sharedResources?.textureMeta?.[sharedMetaKey] ?? null;
    if (sharedTexture && view && count > 0 && this.isSameView(sharedMeta, view, version, count)) {
      // Keep local meta invalidated so fallback uploads cannot be skipped.
      this.textureMeta[slot] = null;
      return sharedTexture;
    }
    upload?.();
    return localTexture;
  }

  toPair(value, fallback = [1, 1]) {
    if (Array.isArray(value)) {
      const a = Number(value[0]);
      const b = Number(value[1]);
      return [Number.isFinite(a) ? a : fallback[0], Number.isFinite(b) ? b : fallback[1]];
    }
    const scalar = Number(value);
    if (Number.isFinite(scalar)) return [scalar, scalar];
    return fallback;
  }

  resolveEdgeVariant(visualConfig) {
    if (typeof this.graphLayer?.resolveIndirectEdgeVariant === 'function') {
      return this.graphLayer.resolveIndirectEdgeVariant(visualConfig);
    }
    const edgeCfg = visualConfig?.edge ?? null;
    const normalize = (entry, fallbackSource = 'edge') => ({
      mode: entry?.mode ?? 'buffer',
      source: entry?.source ?? fallbackSource,
      endpoints: entry?.endpoints ?? 'both',
      nodeAttribute: entry?.nodeAttribute ?? null,
    });
    const color = normalize(edgeCfg?.color, 'edge');
    const width = normalize(edgeCfg?.width, 'edge');
    const opacity = normalize(edgeCfg?.opacity, 'edge');
    const endpointSize = normalize(edgeCfg?.endpointSize, 'edge');
    return {
      colorBuffer: color.mode !== 'uniform',
      colorSource: color.source,
      colorEndpoints: color.endpoints,
      colorNodeAttribute: color.nodeAttribute,
      widthBuffer: width.mode !== 'uniform',
      widthSource: width.source,
      widthEndpoints: width.endpoints,
      widthNodeAttribute: width.nodeAttribute,
      opacityBuffer: opacity.mode !== 'uniform',
      opacitySource: opacity.source,
      opacityEndpoints: opacity.endpoints,
      opacityNodeAttribute: opacity.nodeAttribute,
      endpointSizeBuffer: endpointSize.mode !== 'uniform',
      endpointSizeSource: endpointSize.source,
      endpointSizeEndpoints: endpointSize.endpoints,
      endpointSizeNodeAttribute: endpointSize.nodeAttribute,
    };
  }

  setNodeUniforms(uniforms, cameraUniforms, options) {
    const { gl } = this;
    gl.uniformMatrix4fv(uniforms.u_viewProjection, false, cameraUniforms.viewProjection);
    gl.uniform1i(uniforms.u_nodePositions, 0);
    gl.uniform1i(uniforms.u_nodeSizes, 1);
    gl.uniform1i(uniforms.u_nodeOutlineWidths, 9);
    gl.uniform1i(uniforms.u_nodeEncoded, 2);
    gl.uniform1i(uniforms.u_nodeTrackedFloat, 10);
    gl.uniform1i(uniforms.u_nodeTrackedInt, 11);
    gl.uniform1i(uniforms.u_nodeTrackedUint, 12);
    gl.uniform3f(
      uniforms.u_cameraPosition,
      cameraUniforms.position?.[0] ?? 0,
      cameraUniforms.position?.[1] ?? 0,
      cameraUniforms.position?.[2] ?? 1,
    );
    gl.uniform3f(
      uniforms.u_cameraUp,
      cameraUniforms.up?.[0] ?? 0,
      cameraUniforms.up?.[1] ?? 1,
      cameraUniforms.up?.[2] ?? 0,
    );
    gl.uniform3f(
      uniforms.u_cameraRight,
      cameraUniforms.right?.[0] ?? 1,
      cameraUniforms.right?.[1] ?? 0,
      cameraUniforms.right?.[2] ?? 0,
    );
    gl.uniform1i(uniforms.u_is2D, cameraUniforms.mode === '2d' ? 1 : 0);
    gl.uniform2f(uniforms.u_viewport, this.size.width, this.size.height);
    gl.uniform1i(uniforms.u_useNodeIdBuffer, options.useNodeIdBuffer ? 1 : 0);
    gl.uniform1i(uniforms.u_useNodeSize, options.useNodeSize ? 1 : 0);
    gl.uniform1i(uniforms.u_useNodeOutline, options.useNodeOutline ? 1 : 0);
    gl.uniform1i(uniforms.u_useEncodedTexture, options.useEncodedTexture ? 1 : 0);
    gl.uniform1i(uniforms.u_trackedNodeValueMode, options.trackedNodeValueMode ?? TRACKED_VALUE_MODE.INDEX);
    gl.uniform1f(uniforms.u_nodeSizeBase, this.graphLayer.nodeSizeBase);
    gl.uniform1f(uniforms.u_nodeSizeScale, this.graphLayer.nodeSizeScale);
    gl.uniform1f(uniforms.u_nodeOutline, options.nodeOutlineValue ?? 0);
    gl.uniform1f(uniforms.u_outlineWidthBase, this.graphLayer.nodeOutlineWidthBase ?? 0);
    gl.uniform1f(uniforms.u_outlineWidthScale, this.graphLayer.nodeOutlineWidthScale ?? 0);
  }

  setEdgeUniforms(uniforms, cameraUniforms, options) {
    const { gl } = this;
    gl.uniformMatrix4fv(uniforms.u_viewProjection, false, cameraUniforms.viewProjection);
    gl.uniform1i(uniforms.u_nodePositions, 0);
    gl.uniform1i(uniforms.u_edgeEndpoints, 3);
    gl.uniform1i(uniforms.u_edgeEncoded, 4);
    gl.uniform1i(uniforms.u_edgeTrackedFloat, 10);
    gl.uniform1i(uniforms.u_edgeTrackedInt, 11);
    gl.uniform1i(uniforms.u_edgeTrackedUint, 12);
    gl.uniform1i(uniforms.u_useEdgeIdBuffer, options.useEdgeIdBuffer ? 1 : 0);
    gl.uniform1i(uniforms.u_useEncodedTexture, options.useEncodedTexture ? 1 : 0);
    gl.uniform1i(uniforms.u_trackedEdgeValueMode, options.trackedEdgeValueMode ?? TRACKED_VALUE_MODE.INDEX);
  }

  setEdgeQuadUniforms(uniforms, cameraUniforms, options) {
    const { gl } = this;
    const is2D = cameraUniforms?.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms?.view?.[0] ?? 1) : 1;
    const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
    const globalEdgeWidthBase = (this.graphLayer.edgeWidthBase ?? 0)
      * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL
      * edgeWidthFactor;
    const globalEdgeWidthScale = (this.graphLayer.edgeWidthScale ?? 1)
      * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL
      * edgeWidthFactor;
    gl.uniformMatrix4fv(uniforms.u_viewProjection, false, cameraUniforms.viewProjection);
    gl.uniform2f(uniforms.u_viewport, this.size.width, this.size.height);
    gl.uniform1i(uniforms.u_nodePositions, 0);
    gl.uniform1i(uniforms.u_edgeEndpoints, 3);
    gl.uniform1i(uniforms.u_edgeEncoded, 4);
    gl.uniform1i(uniforms.u_edgeTrackedFloat, 10);
    gl.uniform1i(uniforms.u_edgeTrackedInt, 11);
    gl.uniform1i(uniforms.u_edgeTrackedUint, 12);
    gl.uniform1i(uniforms.u_edgeWidths, 5);
    gl.uniform1i(uniforms.u_edgeEndpointSizes, 6);
    gl.uniform1i(uniforms.u_nodeWidthSource, 7);
    gl.uniform1i(uniforms.u_nodeEndpointSizeSource, 8);
    gl.uniform1i(uniforms.u_useEdgeIdBuffer, options.useEdgeIdBuffer ? 1 : 0);
    gl.uniform1i(uniforms.u_useEncodedTexture, options.useEncodedTexture ? 1 : 0);
    gl.uniform1i(uniforms.u_trackedEdgeValueMode, options.trackedEdgeValueMode ?? TRACKED_VALUE_MODE.INDEX);
    gl.uniform1i(uniforms.u_edgeWidthSource, options.edgeWidthSource === 'node' ? 1 : 0);
    gl.uniform1i(uniforms.u_edgeWidthEndpoints, this.mapEndpointMode(options.edgeWidthEndpoints));
    gl.uniform1i(uniforms.u_edgeEndpointSizeSource, options.edgeEndpointSizeSource === 'node' ? 1 : 0);
    gl.uniform1i(
      uniforms.u_edgeEndpointSizeEndpoints,
      this.mapEndpointMode(options.edgeEndpointSizeEndpoints),
    );
    gl.uniform1i(uniforms.u_hasEdgeWidths, options.hasEdgeWidths ? 1 : 0);
    gl.uniform1i(uniforms.u_hasEdgeEndpointSizes, options.hasEdgeEndpointSizes ? 1 : 0);
    gl.uniform1i(uniforms.u_hasNodeWidthSource, options.hasNodeWidthSource ? 1 : 0);
    gl.uniform1i(
      uniforms.u_hasNodeEndpointSizeSource,
      options.hasNodeEndpointSizeSource ? 1 : 0,
    );
    gl.uniform2f(uniforms.u_defaultEdgeWidth, options.defaultEdgeWidth[0], options.defaultEdgeWidth[1]);
    gl.uniform2f(
      uniforms.u_defaultEdgeEndpointSize,
      options.defaultEdgeEndpointSize[0],
      options.defaultEdgeEndpointSize[1],
    );
    gl.uniform1f(uniforms.u_edgeWidthBase, globalEdgeWidthBase);
    gl.uniform1f(uniforms.u_edgeWidthScale, globalEdgeWidthScale);
    gl.uniform1f(uniforms.u_nodeSizeBase, this.graphLayer.nodeSizeBase ?? 0);
    gl.uniform1f(uniforms.u_nodeSizeScale, this.graphLayer.nodeSizeScale ?? 1);
    gl.uniform1f(uniforms.u_edgeEndpointTrim, this.graphLayer.edgeEndpointTrim ?? 0.8);
  }

  render(frame, size, config) {
    if (!this.gl || !frame?.network) return null;
    const network = frame.network;
    const camera = frame.camera;
    const scale = config.resolutionScale ?? 1;
    this.resize(size, scale, config.trackDepth);
    const cameraUniforms = this.graphLayer.getCameraUniforms(camera);
    if (!cameraUniforms) return null;
    const schema = GraphVisualSchema.fromNetwork(network, {
      nodeOutlineUseAttributes: this.graphLayer?.nodeOutlineUseAttributes === true,
    });
    const visualConfig = schema?.visualConfig ?? null;
    const nodeConfig = visualConfig?.node ?? null;
    const nodeVariant = schema?.getNodeVariant?.() ?? null;
    const edgeConfig = visualConfig?.edge ?? null;
    const edgeVariant = this.resolveEdgeVariant(visualConfig);
    const useQuads = this.graphLayer?.edgeRenderingMode === 'quad';
    const nodeOutlineUniform = nodeVariant ? (nodeVariant.outlineWidthBuffer === false) : true;
    const nodeOutlineValue = nodeConfig?.outline?.mode === 'uniform'
      ? Number(nodeConfig?.outline?.value ?? 0)
      : 0;
    const defaultEdgeWidth = this.toPair(edgeConfig?.width?.value, [1, 1]);
    const defaultEdgeEndpointSize = this.toPair(edgeConfig?.endpointSize?.value, [1, 1]);
    const edgeNodeAttributes = {
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
    const usesDefaultNodeSize = Boolean(
      (edgeNodeAttributes.width && edgeNodeAttributes.width === NODE_SIZE_ATTRIBUTE)
      || (edgeNodeAttributes.opacity && edgeNodeAttributes.opacity === NODE_SIZE_ATTRIBUTE)
      || (edgeNodeAttributes.endpointSize && edgeNodeAttributes.endpointSize === NODE_SIZE_ATTRIBUTE),
    );

    let topologyVersions = { node: 0, edge: 0 };
    if (typeof network.getTopologyVersions === 'function') {
      try {
        topologyVersions = network.getTopologyVersions() ?? topologyVersions;
      } catch (_) {
        topologyVersions = { node: 0, edge: 0 };
      }
    }

    const nodeIsIndex = this.isIndexAttribute(config.nodeAttribute);
    const edgeIsIndex = this.isIndexAttribute(config.edgeAttribute);

    const nodeIndices = network.nodeIndices ?? null;
    const edgeIndices = network.edgeIndices ?? null;
    return this.graphLayer.withSparseGraph(
      network,
      topologyVersions,
      { node: nodeIndices, edge: edgeIndices },
      customEdgeNodeAttributes,
      (sparse) => {
        if (!sparse) return null;
        const { gl } = this;
        const nodes = sparse.nodes ?? {};
        const edges = sparse.edges ?? {};
        const nodePositions = nodes.positions ?? null;
        const nodeSizes = nodes.sizes ?? null;
        const nodeOutlineWidths = nodes.outlineWidths ?? null;
        const nodeWidthSource = sparse.nodeEdgeSources?.width?.view ?? (usesDefaultNodeSize ? nodeSizes : null);
        const nodeEndpointSizeSource = sparse.nodeEdgeSources?.endpointSize?.view
          ?? (usesDefaultNodeSize ? nodeSizes : null);
        const edgeEndpoints = edges.endpoints ?? null;

        const totalNodeCount = Math.floor((nodePositions?.length ?? 0) / 3);
        const totalEdgeCount = Math.floor((edgeEndpoints?.length ?? 0) / 2);
        const drawNodeCount = nodes.indices ? (nodes.indices.length ?? 0) : totalNodeCount;
        const drawEdgeCount = edges.indices ? (edges.indices.length ?? 0) : totalEdgeCount;

        if ((config.nodeAttribute || config.edgeAttribute) && drawNodeCount > 0 && !nodePositions) {
          throw new Error('AttributeTracker: indirect WebGL mode requires sparse node positions.');
        }
        if (config.edgeAttribute && drawEdgeCount > 0 && !edgeEndpoints) {
          throw new Error('AttributeTracker: indirect WebGL mode requires sparse edge endpoints.');
        }

        const sharedResources = this.getSharedGraphResources();
        const drawTextures = {
          nodePositions: this.textures.nodePositions,
          nodeSizes: this.textures.nodeSizes,
          nodeOutlineWidths: this.textures.nodeOutlineWidths,
          nodeEncoded: this.textures.nodeEncoded,
          nodeTrackedFloat: this.textures.nodeTrackedFloat,
          nodeTrackedInt: this.textures.nodeTrackedInt,
          nodeTrackedUint: this.textures.nodeTrackedUint,
          edgeEndpoints: this.textures.edgeEndpoints,
          edgeWidths: this.textures.edgeWidths,
          edgeEndpointSizes: this.textures.edgeEndpointSizes,
          nodeWidthSource: this.textures.nodeWidthSource,
          nodeEndpointSizeSource: this.textures.nodeEndpointSizeSource,
          edgeEncoded: this.textures.edgeEncoded,
          edgeTrackedFloat: this.textures.edgeTrackedFloat,
          edgeTrackedInt: this.textures.edgeTrackedInt,
          edgeTrackedUint: this.textures.edgeTrackedUint,
        };

        const nodePositionVersion = nodes.versions?.positions ?? 0;
        const nodeSizeVersion = nodes.versions?.sizes ?? 0;
        const nodeOutlineVersion = nodes.versions?.outlineWidths ?? 0;
        const nodeWidthSourceVersion = sparse.nodeEdgeSources?.width?.version ?? nodeSizeVersion;
        const nodeEndpointSizeSourceVersion = sparse.nodeEdgeSources?.endpointSize?.version ?? nodeSizeVersion;
        const edgeEndpointsVersion = edges.versions?.endpoints ?? 0;
        const edgeWidthVersion = edges.versions?.widths ?? 0;
        const edgeEndpointSizeVersion = edges.versions?.endpointSizes ?? 0;

        if (totalNodeCount > 0 && nodePositions) {
          drawTextures.nodePositions = this.resolveSharedTexture({
            slot: 'nodePositions',
            localTexture: this.textures.nodePositions,
            sharedResources,
            sharedTextureKey: 'nodePositions',
            sharedMetaKey: 'nodePositions',
            view: nodePositions,
            version: nodePositionVersion,
            count: totalNodeCount,
            upload: () => this.uploadFloatTexture(
              'nodePositions',
              this.textures.nodePositions,
              nodePositions,
              3,
              totalNodeCount,
              nodePositionVersion,
            ),
          });
        }
        if (totalNodeCount > 0 && nodeSizes) {
          const sizeCount = nodeSizes.length ?? 0;
          drawTextures.nodeSizes = this.resolveSharedTexture({
            slot: 'nodeSizes',
            localTexture: this.textures.nodeSizes,
            sharedResources,
            sharedTextureKey: 'nodeSizes',
            sharedMetaKey: 'nodeSizes',
            view: nodeSizes,
            version: nodeSizeVersion,
            count: sizeCount,
            upload: () => this.uploadFloatTexture(
              'nodeSizes',
              this.textures.nodeSizes,
              nodeSizes,
              1,
              sizeCount,
              nodeSizeVersion,
            ),
          });
        }
        if (totalNodeCount > 0 && nodeOutlineWidths) {
          const outlineCount = nodeOutlineWidths.length ?? 0;
          drawTextures.nodeOutlineWidths = this.resolveSharedTexture({
            slot: 'nodeOutlineWidths',
            localTexture: this.textures.nodeOutlineWidths,
            sharedResources,
            sharedTextureKey: 'nodeOutlineWidths',
            sharedMetaKey: 'nodeOutlineWidths',
            view: nodeOutlineWidths,
            version: nodeOutlineVersion,
            count: outlineCount,
            upload: () => this.uploadFloatTexture(
              'nodeOutlineWidths',
              this.textures.nodeOutlineWidths,
              nodeOutlineWidths,
              1,
              outlineCount,
              nodeOutlineVersion,
            ),
          });
        }
        if (totalNodeCount > 0 && nodeWidthSource) {
          const sourceCount = nodeWidthSource.length ?? 0;
          drawTextures.nodeWidthSource = this.resolveSharedTexture({
            slot: 'nodeWidthSource',
            localTexture: this.textures.nodeWidthSource,
            sharedResources,
            sharedTextureKey: 'nodeWidthSource',
            sharedMetaKey: 'nodeEdgeWidths',
            view: nodeWidthSource,
            version: nodeWidthSourceVersion,
            count: sourceCount,
            upload: () => this.uploadFloatTexture(
              'nodeWidthSource',
              this.textures.nodeWidthSource,
              nodeWidthSource,
              1,
              sourceCount,
              nodeWidthSourceVersion,
            ),
          });
        }
        if (totalNodeCount > 0 && nodeEndpointSizeSource) {
          const sourceCount = nodeEndpointSizeSource.length ?? 0;
          drawTextures.nodeEndpointSizeSource = this.resolveSharedTexture({
            slot: 'nodeEndpointSizeSource',
            localTexture: this.textures.nodeEndpointSizeSource,
            sharedResources,
            sharedTextureKey: 'nodeEndpointSizeSource',
            sharedMetaKey: 'nodeEdgeEndpointSizes',
            view: nodeEndpointSizeSource,
            version: nodeEndpointSizeSourceVersion,
            count: sourceCount,
            upload: () => this.uploadFloatTexture(
              'nodeEndpointSizeSource',
              this.textures.nodeEndpointSizeSource,
              nodeEndpointSizeSource,
              1,
              sourceCount,
              nodeEndpointSizeSourceVersion,
            ),
          });
        }
        if (totalEdgeCount > 0 && edgeEndpoints) {
          drawTextures.edgeEndpoints = this.resolveSharedTexture({
            slot: 'edgeEndpoints',
            localTexture: this.textures.edgeEndpoints,
            sharedResources,
            sharedTextureKey: 'edgeEndpoints',
            sharedMetaKey: 'edgeEndpoints',
            view: edgeEndpoints,
            version: edgeEndpointsVersion,
            count: totalEdgeCount,
            upload: () => this.uploadUintTexture(
              'edgeEndpoints',
              this.textures.edgeEndpoints,
              edgeEndpoints,
              2,
              totalEdgeCount,
              edgeEndpointsVersion,
            ),
          });
        }
        if (totalEdgeCount > 0 && edges.widths) {
          const edgeWidthCount = Math.floor((edges.widths.length ?? 0) / 2);
          drawTextures.edgeWidths = this.resolveSharedTexture({
            slot: 'edgeWidths',
            localTexture: this.textures.edgeWidths,
            sharedResources,
            sharedTextureKey: 'edgeWidths',
            sharedMetaKey: 'edgeWidths',
            view: edges.widths,
            version: edgeWidthVersion,
            count: edgeWidthCount,
            upload: () => this.uploadFloatTexture(
              'edgeWidths',
              this.textures.edgeWidths,
              edges.widths,
              2,
              edgeWidthCount,
              edgeWidthVersion,
            ),
          });
        }
        if (totalEdgeCount > 0 && edges.endpointSizes) {
          const edgeEndpointSizeCount = Math.floor((edges.endpointSizes.length ?? 0) / 2);
          drawTextures.edgeEndpointSizes = this.resolveSharedTexture({
            slot: 'edgeEndpointSizes',
            localTexture: this.textures.edgeEndpointSizes,
            sharedResources,
            sharedTextureKey: 'edgeEndpointSizes',
            sharedMetaKey: 'edgeEndpointSizes',
            view: edges.endpointSizes,
            version: edgeEndpointSizeVersion,
            count: edgeEndpointSizeCount,
            upload: () => this.uploadFloatTexture(
              'edgeEndpointSizes',
              this.textures.edgeEndpointSizes,
              edges.endpointSizes,
              2,
              edgeEndpointSizeCount,
              edgeEndpointSizeVersion,
            ),
          });
        }

        const nodeTracked = (!nodeIsIndex && config.nodeAttribute)
          ? this.resolveTrackedAttributeDescriptor(network, 'node', config.nodeAttribute)
          : null;
        const edgeTracked = (!edgeIsIndex && config.edgeAttribute)
          ? this.resolveTrackedAttributeDescriptor(network, 'edge', config.edgeAttribute)
          : null;

        let trackedNodeValueMode = TRACKED_VALUE_MODE.INDEX;
        let trackedEdgeValueMode = TRACKED_VALUE_MODE.INDEX;

        if (config.nodeAttribute && !nodeIsIndex) {
          if (drawNodeCount > 0 && !nodeTracked) {
            throw new Error(
              `AttributeTracker: indirect WebGL tracking attribute "${config.nodeAttribute}" `
              + 'must be a scalar Integer/UnsignedInteger/Category-style buffer.',
            );
          }
          if (nodeTracked?.mode === TRACKED_VALUE_MODE.INT_TEXTURE) {
            this.uploadTrackedIntTexture(
              'nodeTrackedInt',
              this.textures.nodeTrackedInt,
              nodeTracked.view,
              nodeTracked.count,
              nodeTracked.version,
            );
            trackedNodeValueMode = TRACKED_VALUE_MODE.INT_TEXTURE;
          } else if (nodeTracked?.mode === TRACKED_VALUE_MODE.UINT_TEXTURE) {
            this.uploadTrackedUintTexture(
              'nodeTrackedUint',
              this.textures.nodeTrackedUint,
              nodeTracked.view,
              nodeTracked.count,
              nodeTracked.version,
            );
            trackedNodeValueMode = TRACKED_VALUE_MODE.UINT_TEXTURE;
          }
        }

        if (config.edgeAttribute && !edgeIsIndex) {
          if (drawEdgeCount > 0 && !edgeTracked) {
            throw new Error(
              `AttributeTracker: indirect WebGL tracking attribute "${config.edgeAttribute}" `
              + 'must be a scalar Integer/UnsignedInteger/Category-style buffer.',
            );
          }
          if (edgeTracked?.mode === TRACKED_VALUE_MODE.INT_TEXTURE) {
            this.uploadTrackedIntTexture(
              'edgeTrackedInt',
              this.textures.edgeTrackedInt,
              edgeTracked.view,
              edgeTracked.count,
              edgeTracked.version,
            );
            trackedEdgeValueMode = TRACKED_VALUE_MODE.INT_TEXTURE;
          } else if (edgeTracked?.mode === TRACKED_VALUE_MODE.UINT_TEXTURE) {
            this.uploadTrackedUintTexture(
              'edgeTrackedUint',
              this.textures.edgeTrackedUint,
              edgeTracked.view,
              edgeTracked.count,
              edgeTracked.version,
            );
            trackedEdgeValueMode = TRACKED_VALUE_MODE.UINT_TEXTURE;
          }
        }

        const useNodeIdBuffer = Boolean(nodes.indices && drawNodeCount > 0);
        const useEdgeIdBuffer = Boolean(edges.indices && drawEdgeCount > 0);
        if (useNodeIdBuffer) {
          this.uploadIdBuffer('nodeIds', this.nodeIdBuffer, nodes.indices, nodes.versions?.indices, drawNodeCount);
        }
        if (useEdgeIdBuffer) {
          this.uploadIdBuffer('edgeIds', this.edgeIdBuffer, edges.indices, edges.versions?.indices, drawEdgeCount);
        }

        const drawNodeArgs = {
          useNodeIdBuffer,
          useNodeSize: Boolean(nodeSizes),
          useNodeOutline: !nodeOutlineUniform && Boolean(nodeOutlineWidths),
          nodeOutlineValue: nodeOutlineValue,
          useEncodedTexture: trackedNodeValueMode === TRACKED_VALUE_MODE.ENCODED_TEXTURE,
          trackedNodeValueMode,
        };
        const drawEdgeArgs = {
          useEdgeIdBuffer,
          useEncodedTexture: trackedEdgeValueMode === TRACKED_VALUE_MODE.ENCODED_TEXTURE,
          trackedEdgeValueMode,
          useQuads,
          edgeWidthSource: edgeVariant?.widthSource ?? 'edge',
          edgeWidthEndpoints: edgeVariant?.widthEndpoints ?? 'both',
          edgeEndpointSizeSource: edgeVariant?.endpointSizeSource ?? 'edge',
          edgeEndpointSizeEndpoints: edgeVariant?.endpointSizeEndpoints ?? 'both',
          hasEdgeWidths: Boolean(edgeVariant?.widthBuffer && edgeVariant?.widthSource !== 'node' && edges.widths),
          hasEdgeEndpointSizes: Boolean(
            edgeVariant?.endpointSizeBuffer
            && edgeVariant?.endpointSizeSource !== 'node'
            && edges.endpointSizes,
          ),
          hasNodeWidthSource: Boolean(nodeWidthSource),
          hasNodeEndpointSizeSource: Boolean(nodeEndpointSizeSource),
          defaultEdgeWidth,
          defaultEdgeEndpointSize,
        };

        const setupNodeDraw = (program, uniforms) => {
          gl.useProgram(program);
          this.setNodeUniforms(uniforms, cameraUniforms, drawNodeArgs);
          this.bindTexture(0, drawTextures.nodePositions);
          this.bindTexture(1, drawTextures.nodeSizes);
          this.bindTexture(9, drawTextures.nodeOutlineWidths);
          this.bindTexture(2, drawTextures.nodeEncoded);
          this.bindTexture(10, drawTextures.nodeTrackedFloat);
          this.bindTexture(11, drawTextures.nodeTrackedInt);
          this.bindTexture(12, drawTextures.nodeTrackedUint);
          gl.bindVertexArray(this.nodeVao);
          gl.drawArraysInstanced(gl.POINTS, 0, 1, drawNodeCount);
        };

        const setupEdgeDraw = (program, uniforms) => {
          gl.useProgram(program);
          if (drawEdgeArgs.useQuads) {
            this.setEdgeQuadUniforms(uniforms, cameraUniforms, drawEdgeArgs);
          } else {
            this.setEdgeUniforms(uniforms, cameraUniforms, drawEdgeArgs);
          }
          this.bindTexture(0, drawTextures.nodePositions);
          this.bindTexture(3, drawTextures.edgeEndpoints);
          this.bindTexture(4, drawTextures.edgeEncoded);
          this.bindTexture(10, drawTextures.edgeTrackedFloat);
          this.bindTexture(11, drawTextures.edgeTrackedInt);
          this.bindTexture(12, drawTextures.edgeTrackedUint);
          if (drawEdgeArgs.useQuads) {
            this.bindTexture(5, drawTextures.edgeWidths);
            this.bindTexture(6, drawTextures.edgeEndpointSizes);
            this.bindTexture(7, drawTextures.nodeWidthSource);
            this.bindTexture(8, drawTextures.nodeEndpointSizeSource);
            gl.bindVertexArray(this.edgeQuadVao);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, drawEdgeCount);
          } else {
            gl.bindVertexArray(this.edgeVao);
            gl.drawArraysInstanced(gl.LINES, 0, 2, drawEdgeCount);
          }
        };

        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.depthFunc(gl.LEQUAL);

        const passes = [];

        if (config.nodeAttribute && drawNodeCount > 0) {
          passes.push(() => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.node?.handle ?? null);
            gl.viewport(0, 0, this.size.width, this.size.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            setupNodeDraw(this.programs.node, this.uniforms.node);
          });
        }

        if (config.edgeAttribute && drawEdgeCount > 0) {
          passes.push(() => {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.edge?.handle ?? null);
            gl.viewport(0, 0, this.size.width, this.size.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            if (drawNodeCount > 0) {
              setupNodeDraw(this.programs.nodeOcclusion, this.uniforms.nodeOcclusion);
            }
            setupEdgeDraw(
              drawEdgeArgs.useQuads ? this.programs.edgeQuad : this.programs.edge,
              drawEdgeArgs.useQuads ? this.uniforms.edgeQuad : this.uniforms.edge,
            );
          });
        }

        if (config.trackDepth) {
          if (config.nodeAttribute && drawNodeCount > 0 && this.depthTargets.node) {
            passes.push(() => {
              gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthTargets.node.handle);
              gl.viewport(0, 0, this.size.width, this.size.height);
              gl.clearColor(0, 0, 0, 0);
              gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
              setupNodeDraw(this.programs.nodeDepth, this.uniforms.nodeDepth);
            });
          }
          if (config.edgeAttribute && drawEdgeCount > 0 && this.depthTargets.edge) {
            passes.push(() => {
              gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthTargets.edge.handle);
              gl.viewport(0, 0, this.size.width, this.size.height);
              gl.clearColor(0, 0, 0, 0);
              gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
              if (drawNodeCount > 0) {
                setupNodeDraw(this.programs.nodeDepth, this.uniforms.nodeDepth);
              }
              setupEdgeDraw(
                drawEdgeArgs.useQuads ? this.programs.edgeQuadDepth : this.programs.edgeDepth,
                drawEdgeArgs.useQuads ? this.uniforms.edgeQuadDepth : this.uniforms.edgeDepth,
              );
            });
          }
        }

        passes.push(() => {
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          gl.bindVertexArray(null);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.depthMask(true);
          gl.enable(gl.DEPTH_TEST);
          gl.depthFunc(gl.LEQUAL);
        });

        this.runner?.run?.(passes, { gl, device: this.device });
        return { ...this.targets, depthTargets: this.depthTargets };
      },
    );
  }

  readDepth(target, x, y) {
    if (!this.trackDepth || !this.depthReadSupported) return null;
    if (!target?.depthTexture && !target?.depthRenderbuffer) return null;
    const { gl } = this;
    const type = target.depthType
      ?? (target.depthFormat === gl.DEPTH_COMPONENT32F ? gl.FLOAT : gl.UNSIGNED_SHORT);
    const pixel = type === gl.UNSIGNED_INT
      ? new Uint32Array(1)
      : (type === gl.UNSIGNED_SHORT ? new Uint16Array(1) : new Float32Array(1));
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.handle);
    gl.getError();
    try {
      gl.readPixels(x, y, 1, 1, gl.DEPTH_COMPONENT, type, pixel);
    } catch (error) {
      console.warn('AttributeTracker: depth read failed', error);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const postErr = gl.getError();
    if (postErr !== gl.NO_ERROR) {
      const canTryFloat = target.depthFormat === gl.DEPTH_COMPONENT32F && type !== gl.FLOAT;
      if (canTryFloat) {
        return this.readDepth({ ...target, depthType: gl.FLOAT }, x, y);
      }
      console.warn('AttributeTracker: depth readPixels error', { postErr, type, depthFormat: target.depthFormat });
      this.depthReadSupported = false;
      return null;
    }
    let depth = pixel[0];
    if (type === gl.UNSIGNED_INT || type === gl.UNSIGNED_SHORT) {
      const bits = target.depthBits ?? this.depthBits ?? (type === gl.UNSIGNED_SHORT ? 16 : 24);
      const maxVal = Math.max(1, (2 ** bits) - 1);
      depth = depth / maxVal;
    }
    return Number.isFinite(depth) ? depth : null;
  }
}

export class WebGPUAttributeRenderer {
  constructor(graphLayer, pool, runner) {
    this.graphLayer = graphLayer;
    this.pool = pool;
    this.runner = runner;
    this.device = null;
    this.targetFormat = 'rgba8unorm';
    this.depthColorFormat = 'rgba8unorm';
    this.trackDepth = false;
    this.nodePipeline = null;
    this.nodeDepthPipeline = null;
    this.edgePipeline = null;
    this.edgeDepthPipeline = null;
    this.edgeQuadPipeline = null;
    this.edgeQuadDepthPipeline = null;
    this.nodeBindGroupLayout = null;
    this.edgeBindGroupLayout = null;
    this.nodeIndirectBindGroupLayout = null;
    this.edgeIndirectBindGroupLayout = null;
    this.nodeBindGroup = null;
    this.edgeBindGroup = null;
	    this.nodeBuffers = {};
	    this.edgeBuffers = {};
	    this.nodeCache = {};
	    this.edgeCache = {};
    this._outlineFallback = null;
    this._indirectPipelineCache = new Map();
    this._zeroStorageBuffer = null;
    this.cornerBuffer = null;
    this.edgeCornerBuffer = null;
    this.targets = { node: null, edge: null };
    this.depthTargets = { node: null, edge: null };
    this.size = null;
    this.sparseEncodedReadyCache = { node: null, edge: null };
  }

  canUseR32UintTarget(gpu) {
    if (!gpu) return false;
    try {
      const probe = gpu.createTexture({
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        format: 'r32uint',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
      });
      probe.destroy?.();
      return true;
    } catch (_) {
      return false;
    }
  }

  initialize(device) {
    if (this.device) return;
    if (!device || device.type !== 'webgpu') return;
    this.device = device;
    const indirectMode = isIndirectGraphLayer(this.graphLayer);
    if (indirectMode && this.canUseR32UintTarget(device.device)) {
      this.targetFormat = 'r32uint';
      this.depthColorFormat = 'rgba8unorm';
    } else {
      // Prefer a linear format for attribute targets so encoded indices round-trip without swizzling/gamma.
      const preferredFormat = (device.format && !device.format.includes('srgb')) ? device.format : null;
      this.targetFormat = preferredFormat && preferredFormat.startsWith('rgba') ? preferredFormat : 'rgba8unorm';
      this.depthColorFormat = this.targetFormat;
    }
    const cache = device.resourceCache?.webgpu;
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    const cornerUsage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
    if (cache) {
      cache.ensureBuffer(device.device, 'attr:webgpu:corner', quad.byteLength, cornerUsage, 'AttributeTracker corner buffer');
      cache.uploadBuffer(device.device, device.device.queue, 'attr:webgpu:corner', quad, {
        label: 'AttributeTracker corner buffer',
        version: 1,
        topologyVersion: 0,
        count: 4,
        trackViewIdentity: true,
      }, cornerUsage);
      this.cornerBuffer = cache.buffers.get('attr:webgpu:corner')?.buffer ?? null;
    } else {
      this.cornerBuffer = device.device.createBuffer({
        size: quad.byteLength,
        usage: cornerUsage,
        mappedAtCreation: true,
      });
      new Float32Array(this.cornerBuffer.getMappedRange()).set(quad);
      this.cornerBuffer.unmap();
    }

    const edgeQuad = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    if (cache) {
      cache.ensureBuffer(device.device, 'attr:webgpu:edgeCorner', edgeQuad.byteLength, cornerUsage, 'AttributeTracker edge corner buffer');
      cache.uploadBuffer(device.device, device.device.queue, 'attr:webgpu:edgeCorner', edgeQuad, {
        label: 'AttributeTracker edge corner buffer',
        version: 1,
        topologyVersion: 0,
        count: 4,
        trackViewIdentity: true,
      }, cornerUsage);
      this.edgeCornerBuffer = cache.buffers.get('attr:webgpu:edgeCorner')?.buffer ?? null;
    } else {
      this.edgeCornerBuffer = device.device.createBuffer({
        size: edgeQuad.byteLength,
        usage: cornerUsage,
        mappedAtCreation: true,
      });
      new Float32Array(this.edgeCornerBuffer.getMappedRange()).set(edgeQuad);
      this.edgeCornerBuffer.unmap();
    }

    this.nodeBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    this.edgeBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.nodeIndirectBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 7, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this.edgeIndirectBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 7, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 8, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 9, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 10, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this._pipelineCache = new Map();
    this._shaderModuleCache = new Map();
    this._indirectPipelineCache = new Map();
  }

  getPipelinesForVariant({
    nodeSizeUniform,
    nodeOutlineUniform,
    edgeWidthUniform,
    edgeEndpointSizeUniform,
    nodeIndexEncodedRaw = false,
    edgeIndexEncodedRaw = false,
  } = {}) {
    const gpu = this.device?.device;
    if (!gpu) return null;

    const key = [
      nodeSizeUniform ? 'nSizeU' : 'nSizeB',
      nodeOutlineUniform ? 'nOutU' : 'nOutB',
      edgeWidthUniform ? 'eWidthU' : 'eWidthB',
      edgeEndpointSizeUniform ? 'eEndU' : 'eEndB',
      nodeIndexEncodedRaw ? 'nIdxRaw' : 'nIdxEnc',
      edgeIndexEncodedRaw ? 'eIdxRaw' : 'eIdxEnc',
      this.graphLayer?.edgeRenderingMode === 'quad' ? 'quad' : 'line',
      this.targetFormat,
      this.depthColorFormat,
      this.device?.depthFormat ?? 'depth24plus',
    ].join(':');

    if (this._pipelineCache?.has(key)) return this._pipelineCache.get(key);

    const sources = createAttributeWebGPUSources({
      node: {
        size: nodeSizeUniform ? 'uniform' : 'buffer',
        outline: nodeOutlineUniform ? 'uniform' : 'buffer',
        indexEncodedRaw: nodeIndexEncodedRaw,
      },
      edge: {
        width: edgeWidthUniform ? 'uniform' : 'buffer',
        endpointSize: edgeEndpointSizeUniform ? 'uniform' : 'buffer',
        indexEncodedRaw: edgeIndexEncodedRaw,
      },
      encodedOutputMode: this.targetFormat === 'r32uint' ? 'uint32' : 'rgba8',
      encodedInputMode: this.targetFormat === 'r32uint' ? 'uint32' : 'u8x4',
    });

    const nodeModule = gpu.createShaderModule({ code: sources.nodeWGSL });
    const edgeModule = gpu.createShaderModule({ code: sources.edgeWGSL });

    const depthFormat = this.device?.depthFormat ?? 'depth24plus';

    const nodeVertexBuffers = [
      { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }], stepMode: 'instance' },
      ...(!nodeSizeUniform ? [{ arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }], stepMode: 'instance' }] : []),
      { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: this.targetFormat === 'r32uint' ? 'uint32' : 'uint8x4' }], stepMode: 'instance' },
      ...(!nodeOutlineUniform ? [{ arrayStride: 4, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32' }], stepMode: 'instance' }] : []),
    ];
    const nodeSlots = [
      'corner',
      'position',
      ...(!nodeSizeUniform ? ['size'] : []),
      'encoded',
      ...(!nodeOutlineUniform ? ['outline'] : []),
    ];

    const edgeLineVertexBuffers = [
      {
        arrayStride: 24,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
        ],
        stepMode: 'instance',
      },
      ...(!edgeEndpointSizeUniform ? [{ arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }], stepMode: 'instance' }] : []),
      { arrayStride: 4, attributes: [{ shaderLocation: 4, offset: 0, format: this.targetFormat === 'r32uint' ? 'uint32' : 'uint8x4' }], stepMode: 'instance' },
    ];
    const edgeLineSlots = [
      'segments',
      ...(!edgeEndpointSizeUniform ? ['endpointSizes'] : []),
      'encoded',
    ];

    const edgeQuadVertexBuffers = [
      { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
      {
        arrayStride: 24,
        attributes: [
          { shaderLocation: 1, offset: 0, format: 'float32x3' },
          { shaderLocation: 2, offset: 12, format: 'float32x3' },
        ],
        stepMode: 'instance',
      },
      ...(!edgeWidthUniform ? [{ arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }], stepMode: 'instance' }] : []),
      ...(!edgeEndpointSizeUniform ? [{ arrayStride: 8, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x2' }], stepMode: 'instance' }] : []),
      { arrayStride: 4, attributes: [{ shaderLocation: 5, offset: 0, format: this.targetFormat === 'r32uint' ? 'uint32' : 'uint8x4' }], stepMode: 'instance' },
    ];
    const edgeQuadSlots = [
      'edgeCorner',
      'segments',
      ...(!edgeWidthUniform ? ['widths'] : []),
      ...(!edgeEndpointSizeUniform ? ['endpointSizes'] : []),
      'encoded',
    ];

    const nodeLayout = gpu.createPipelineLayout({ bindGroupLayouts: [this.nodeBindGroupLayout] });
    const edgeLayout = gpu.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] });

    const nodePipeline = gpu.createRenderPipeline({
      layout: nodeLayout,
      vertex: { module: nodeModule, entryPoint: 'nodeVertex', buffers: nodeVertexBuffers },
      fragment: { module: nodeModule, entryPoint: 'nodeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });
    const nodeDepthPipeline = gpu.createRenderPipeline({
      layout: nodeLayout,
      vertex: { module: nodeModule, entryPoint: 'nodeVertex', buffers: nodeVertexBuffers },
      fragment: { module: nodeModule, entryPoint: 'nodeDepthFragment', targets: [{ format: this.depthColorFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });

    const edgePipeline = gpu.createRenderPipeline({
      layout: edgeLayout,
      vertex: { module: edgeModule, entryPoint: 'edgeVertex', buffers: edgeLineVertexBuffers },
      fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'line-list' },
    });
    const edgeDepthPipeline = gpu.createRenderPipeline({
      layout: edgeLayout,
      vertex: { module: edgeModule, entryPoint: 'edgeVertex', buffers: edgeLineVertexBuffers },
      fragment: { module: edgeModule, entryPoint: 'edgeDepthFragment', targets: [{ format: this.depthColorFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'line-list' },
    });

    const edgeQuadPipeline = gpu.createRenderPipeline({
      layout: edgeLayout,
      vertex: { module: edgeModule, entryPoint: 'edgeQuadVertex', buffers: edgeQuadVertexBuffers },
      fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });
    const edgeQuadDepthPipeline = gpu.createRenderPipeline({
      layout: edgeLayout,
      vertex: { module: edgeModule, entryPoint: 'edgeQuadVertex', buffers: edgeQuadVertexBuffers },
      fragment: { module: edgeModule, entryPoint: 'edgeDepthFragment', targets: [{ format: this.depthColorFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });

    const entry = {
      key,
      nodePipeline,
      nodeDepthPipeline,
      edgePipeline,
      edgeDepthPipeline,
      edgeQuadPipeline,
      edgeQuadDepthPipeline,
      nodeSlots,
      edgeLineSlots,
      edgeQuadSlots,
    };

    this._pipelineCache?.set(key, entry);
    return entry;
  }

  ensureZeroStorageBuffer() {
    if (this._zeroStorageBuffer) return this._zeroStorageBuffer;
    const gpu = this.device?.device;
    const cache = this.device?.resourceCache?.webgpu;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX;
    if (cache && gpu) {
      const zero = new Uint32Array([0, 0, 0, 0]);
      cache.ensureBuffer(gpu, 'attr:webgpu:zeroStorage', zero.byteLength, usage, 'AttributeTracker zero storage');
      cache.uploadBuffer(gpu, gpu.queue, 'attr:webgpu:zeroStorage', zero, {
        label: 'AttributeTracker zero storage',
        version: 1,
        topologyVersion: 0,
        count: 1,
        trackViewIdentity: false,
      }, usage);
      this._zeroStorageBuffer = cache.buffers.get('attr:webgpu:zeroStorage')?.buffer ?? null;
      return this._zeroStorageBuffer;
    }
    if (!gpu) return null;
    const buffer = gpu.createBuffer({
      size: 16,
      usage,
      mappedAtCreation: true,
    });
    new Uint32Array(buffer.getMappedRange()).set([0, 0, 0, 0]);
    buffer.unmap();
    this._zeroStorageBuffer = buffer;
    return this._zeroStorageBuffer;
  }

  getIndirectPipelinesForVariant({
    nodeSizeUniform,
    nodeOutlineUniform,
    edgeWidthUniform,
    edgeEndpointSizeUniform,
    edgeWidthSource = 'edge',
    edgeEndpointSizeSource = 'edge',
    edgeWidthEndpoints = 0,
    edgeEndpointSizeEndpoints = 0,
    nodeTrackedMode = TRACKED_SOURCE_MODE.INDEX,
    edgeTrackedMode = TRACKED_SOURCE_MODE.INDEX,
  } = {}) {
    const gpu = this.device?.device;
    if (!gpu) return null;
    const key = [
      nodeSizeUniform ? 'nSizeU' : 'nSizeB',
      nodeOutlineUniform ? 'nOutU' : 'nOutB',
      edgeWidthUniform ? 'eWidthU' : 'eWidthB',
      edgeEndpointSizeUniform ? 'eEndU' : 'eEndB',
      `eWsrc:${edgeWidthSource}`,
      `eWend:${edgeWidthEndpoints}`,
      `eEsrc:${edgeEndpointSizeSource}`,
      `eEend:${edgeEndpointSizeEndpoints}`,
      `nTrack:${nodeTrackedMode}`,
      `eTrack:${edgeTrackedMode}`,
      this.targetFormat,
      this.depthColorFormat,
      this.device?.depthFormat ?? 'depth24plus',
    ].join(':');
    if (this._indirectPipelineCache.has(key)) return this._indirectPipelineCache.get(key);

    const sources = createAttributeWebGPUIndirectTrackSources({
      node: {
        size: nodeSizeUniform ? 'uniform' : 'buffer',
        outline: nodeOutlineUniform ? 'uniform' : 'buffer',
        trackedMode: nodeTrackedMode,
      },
      edge: {
        width: edgeWidthUniform ? 'uniform' : 'buffer',
        endpointSize: edgeEndpointSizeUniform ? 'uniform' : 'buffer',
        widthSource: edgeWidthSource,
        endpointSizeSource: edgeEndpointSizeSource,
        widthEndpointsMode: edgeWidthEndpoints,
        endpointSizeEndpointsMode: edgeEndpointSizeEndpoints,
        trackedMode: edgeTrackedMode,
      },
      encodedOutputMode: this.targetFormat === 'r32uint' ? 'uint32' : 'rgba8',
    });

    const nodeModule = gpu.createShaderModule({ code: sources.nodeWGSL });
    const edgeModule = gpu.createShaderModule({ code: sources.edgeWGSL });
    const depthFormat = this.device?.depthFormat ?? 'depth24plus';

    const nodeLayout = gpu.createPipelineLayout({ bindGroupLayouts: [this.nodeIndirectBindGroupLayout] });
    const edgeLayout = gpu.createPipelineLayout({ bindGroupLayouts: [this.edgeIndirectBindGroupLayout] });

    const nodeVertexBuffers = [
      { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
    ];
    const edgeQuadVertexBuffers = [
      { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
    ];

    const nodePipeline = gpu.createRenderPipeline({
      layout: nodeLayout,
      vertex: { module: nodeModule, entryPoint: 'nodeVertex', buffers: nodeVertexBuffers },
      fragment: { module: nodeModule, entryPoint: 'nodeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });
    const nodeOcclusionPipeline = gpu.createRenderPipeline({
      layout: nodeLayout,
      vertex: { module: nodeModule, entryPoint: 'nodeVertex', buffers: nodeVertexBuffers },
      fragment: { module: nodeModule, entryPoint: 'nodeOcclusionFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });
    const nodeDepthPipeline = gpu.createRenderPipeline({
      layout: nodeLayout,
      vertex: { module: nodeModule, entryPoint: 'nodeVertex', buffers: nodeVertexBuffers },
      fragment: { module: nodeModule, entryPoint: 'nodeDepthFragment', targets: [{ format: this.depthColorFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });

    const edgePipeline = gpu.createRenderPipeline({
      layout: edgeLayout,
      vertex: { module: edgeModule, entryPoint: 'edgeVertex', buffers: [] },
      fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'line-list' },
    });
    const edgeDepthPipeline = gpu.createRenderPipeline({
      layout: edgeLayout,
      vertex: { module: edgeModule, entryPoint: 'edgeVertex', buffers: [] },
      fragment: { module: edgeModule, entryPoint: 'edgeDepthFragment', targets: [{ format: this.depthColorFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'line-list' },
    });
    const edgeQuadPipeline = gpu.createRenderPipeline({
      layout: edgeLayout,
      vertex: { module: edgeModule, entryPoint: 'edgeQuadVertex', buffers: edgeQuadVertexBuffers },
      fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });
    const edgeQuadDepthPipeline = gpu.createRenderPipeline({
      layout: edgeLayout,
      vertex: { module: edgeModule, entryPoint: 'edgeQuadVertex', buffers: edgeQuadVertexBuffers },
      fragment: { module: edgeModule, entryPoint: 'edgeDepthFragment', targets: [{ format: this.depthColorFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });

    const entry = {
      key,
      nodePipeline,
      nodeOcclusionPipeline,
      nodeDepthPipeline,
      edgePipeline,
      edgeDepthPipeline,
      edgeQuadPipeline,
      edgeQuadDepthPipeline,
    };
    this._indirectPipelineCache.set(key, entry);
    return entry;
  }

	  ensureVertexBuffer(map, key, requiredBytes) {
	    // Align to 256 bytes to avoid borderline validation issues on some WebGPU implementations
	    // when vertex buffers are exactly the minimum required size.
	    const aligned = Math.ceil(Math.max(4, requiredBytes) / 256) * 256;
	    const size = Math.max(256, aligned);
	    const current = map[key];
	    if (!current || size > current.size) {
	      if (current?.buffer) current.buffer.destroy();
	      else current?.destroy?.();
	      map[key] = {
        buffer: this.device.device.createBuffer({ size, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }),
        size,
      };
    }
    return map[key];
  }

  uploadVertexBuffer(map, key, source) {
    if (!source) return null;
    const bytes = source.byteLength ?? (source.length * source.BYTES_PER_ELEMENT) ?? 0;
    if (!bytes) return null;
    const entry = this.ensureVertexBuffer(map, key, bytes);
    this.device.device.queue.writeBuffer(entry.buffer, 0, source);
    return entry.buffer;
  }

	  uploadVertexBufferCached(map, key, source, cache, count, version = null) {
	    if (!source) return null;
	    const prev = cache[key];
	    const sameView = prev
	      && prev.buffer === source.buffer
	      && prev.byteOffset === source.byteOffset
	      && prev.byteLength === source.byteLength;
	    const sameCount = prev && prev.count === count;
	    const sameVersion = version == null || (prev && prev.version === version);
	    if (sameView && sameCount && sameVersion && map[key]?.buffer) {
	      return map[key].buffer;
	    }
	    const buffer = this.uploadVertexBuffer(map, key, source);
	    cache[key] = {
	      buffer: source.buffer,
	      byteOffset: source.byteOffset,
	      byteLength: source.byteLength,
	      count,
	      version,
	    };
	    return buffer;
	  }

  getNodeOcclusionPipelinesForVariant({
    nodeSizeUniform,
    nodeOutlineUniform,
  } = {}) {
    const gpu = this.device?.device;
    if (!gpu) return null;

    const key = [
      'nodeOcc',
      nodeSizeUniform ? 'nSizeU' : 'nSizeB',
      nodeOutlineUniform ? 'nOutU' : 'nOutB',
      this.targetFormat,
      this.depthColorFormat,
      this.device?.depthFormat ?? 'depth24plus',
    ].join(':');

    this._pipelineCache ??= new Map();
    if (this._pipelineCache.has(key)) return this._pipelineCache.get(key);

    const sources = createAttributeWebGPUSources({
      node: {
        size: nodeSizeUniform ? 'uniform' : 'buffer',
        outline: nodeOutlineUniform ? 'uniform' : 'buffer',
        encoded: 'none',
      },
      edge: {
        width: 'uniform',
        endpointSize: 'uniform',
      },
      encodedOutputMode: this.targetFormat === 'r32uint' ? 'uint32' : 'rgba8',
      encodedInputMode: this.targetFormat === 'r32uint' ? 'uint32' : 'u8x4',
    });

    const nodeModule = gpu.createShaderModule({ code: sources.nodeWGSL });
    const depthFormat = this.device?.depthFormat ?? 'depth24plus';

    const nodeVertexBuffers = [
      { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
      { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }], stepMode: 'instance' },
      ...(!nodeSizeUniform ? [{ arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }], stepMode: 'instance' }] : []),
      ...(!nodeOutlineUniform ? [{ arrayStride: 4, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32' }], stepMode: 'instance' }] : []),
    ];
    const nodeSlots = [
      'corner',
      'position',
      ...(!nodeSizeUniform ? ['size'] : []),
      ...(!nodeOutlineUniform ? ['outline'] : []),
    ];

    const nodeLayout = gpu.createPipelineLayout({ bindGroupLayouts: [this.nodeBindGroupLayout] });
    const nodePipeline = gpu.createRenderPipeline({
      layout: nodeLayout,
      vertex: { module: nodeModule, entryPoint: 'nodeVertex', buffers: nodeVertexBuffers },
      fragment: { module: nodeModule, entryPoint: 'nodeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });
    const nodeDepthPipeline = gpu.createRenderPipeline({
      layout: nodeLayout,
      vertex: { module: nodeModule, entryPoint: 'nodeVertex', buffers: nodeVertexBuffers },
      fragment: { module: nodeModule, entryPoint: 'nodeDepthFragment', targets: [{ format: this.depthColorFormat }] },
      depthStencil: { format: depthFormat, depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });

    const entry = {
      key,
      nodePipeline,
      nodeDepthPipeline,
      nodeSlots,
    };
    this._pipelineCache.set(key, entry);
    return entry;
  }

  destroy() {
    const shared = this.device?.resourceCache?.webgpu;
    // Shared buffers are owned by the device cache.
    if (!shared) {
      const destroyEntry = (entry) => {
        if (!entry) return;
        if (entry.buffer) {
          entry.buffer.destroy();
        } else {
          entry.destroy?.();
        }
      };
      destroyEntry(this.cornerBuffer);
      destroyEntry(this.edgeCornerBuffer);
      Object.values(this.nodeBuffers).forEach(destroyEntry);
      Object.values(this.edgeBuffers).forEach(destroyEntry);
    }
    this.cornerBuffer = null;
    this.edgeCornerBuffer = null;
    this._zeroStorageBuffer = null;
    this._indirectPipelineCache?.clear?.();
    this.depthTargets = { node: null, edge: null };
  }

  resize(size, scale, trackDepth) {
    if (!size || !this.device) return;
    const pixelRatio = size.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.floor((size.width ?? 1) * pixelRatio * scale));
    const height = Math.max(1, Math.floor((size.height ?? 1) * pixelRatio * scale));
    if (this.size && this.size.width === width && this.size.height === height && this.trackDepth === (trackDepth === true)) {
      return;
    }
    this.size = { width, height };
    this.trackDepth = trackDepth === true;
    this.targets.node = this.pool.get(this.device, 'attr-node', width, height, {
      depth: true,
      filter: 'nearest',
      format: this.targetFormat,
    });
    this.targets.edge = this.pool.get(this.device, 'attr-edge', width, height, {
      depth: true,
      filter: 'nearest',
      format: this.targetFormat,
    });
    this.depthTargets.node = this.trackDepth
      ? this.pool.get(this.device, 'attr-node-depth-color', width, height, {
        depth: true,
        filter: 'nearest',
        format: this.depthColorFormat,
      })
      : null;
    this.depthTargets.edge = this.trackDepth
      ? this.pool.get(this.device, 'attr-edge-depth-color', width, height, {
        depth: true,
        filter: 'nearest',
        format: this.depthColorFormat,
      })
      : null;
  }

  encodeAttributes(network, geometry, config) {
    const { nodeAttribute, edgeAttribute } = config;
    const nodeCount = geometry.nodes.count ?? 0;
    const edgeCount = geometry.edges.count ?? 0;
    const nodeEncoded = ensureEncodedDesc(network, 'node', nodeAttribute, nodeCount);
    const edgeEncoded = ensureEncodedDesc(network, 'edge', edgeAttribute, edgeCount);
    return { nodeEncoded, edgeEncoded };
  }

  getIndirectEdgeSourceRequests(edgeVariant) {
    if (!edgeVariant || typeof edgeVariant !== 'object') {
      return { width: null, endpointSize: null };
    }
    const widthSource = edgeVariant.widthSource === 'node'
      ? (edgeVariant.widthNodeAttribute ?? NODE_SIZE_ATTRIBUTE)
      : null;
    const endpointSizeSource = edgeVariant.endpointSizeSource === 'node'
      ? (edgeVariant.endpointSizeNodeAttribute ?? NODE_SIZE_ATTRIBUTE)
      : null;
    return {
      width: widthSource && widthSource !== NODE_SIZE_ATTRIBUTE ? widthSource : null,
      endpointSize: endpointSizeSource && endpointSizeSource !== NODE_SIZE_ATTRIBUTE ? endpointSizeSource : null,
    };
  }

  getSharedGraphResources() {
    const provider = this.graphLayer?.getSharedSparseResources;
    if (typeof provider !== 'function') return null;
    try {
      return provider.call(this.graphLayer);
    } catch (_) {
      return null;
    }
  }

  resolveSharedWebGPUBuffer(sharedResources, candidate, uploadFallback) {
    const key = candidate?.key;
    if (key) {
      const entry = sharedResources?.buffers?.[key] ?? null;
      const vertexUsageBit = (typeof GPUBufferUsage !== 'undefined' && Number.isFinite(GPUBufferUsage?.VERTEX))
        ? GPUBufferUsage.VERTEX
        : 0;
      const hasVertexUsage = (vertexUsageBit === 0 || entry?.usage == null)
        ? true
        : ((entry.usage & vertexUsageBit) !== 0);
      const sameVersion = candidate?.version == null || entry?.version === candidate.version;
      const sameTopology = candidate?.topologyVersion == null || entry?.topologyVersion === candidate.topologyVersion;
      const sameCount = candidate?.count == null || entry?.count === candidate.count;
      const sameByteLength = candidate?.byteLength == null || entry?.byteLength === candidate.byteLength;
      if (entry?.buffer && hasVertexUsage && sameVersion && sameTopology && sameCount && sameByteLength) {
        return entry.buffer;
      }
    }
    return uploadFallback?.() ?? null;
  }

  buildIndirectPreparedGeometry(network, sparse, config, options = {}) {
    const {
      useQuads = true,
      nodeSizeUniform = false,
      nodeOutlineUniform = true,
      edgeWidthUniform = false,
      edgeEndpointSizeUniform = true,
      edgeVariant = null,
      useIntegerEncoding = this.targetFormat === 'r32uint',
    } = options;

    const nodeIndices = sparse?.nodes?.indices ?? null;
    const edgeIndices = sparse?.edges?.indices ?? null;
    const nodeCount = nodeIndices?.length ?? 0;
    const edgeCount = edgeIndices?.length ?? 0;

    const nodePositionsSelection = selectActiveValues(sparse?.nodes?.positions, nodeIndices, 3);
    const nodePositions = nodePositionsSelection.view;
    if (nodeCount && (!nodePositions || nodePositions.length !== nodeCount * 3)) {
      throw new Error('AttributeTracker: indirect mode requires sparse node positions.');
    }

    const nodeSizesSelection = !nodeSizeUniform
      ? selectActiveValues(sparse?.nodes?.sizes, nodeIndices, 1)
      : null;
    const nodeOutlineSelection = !nodeOutlineUniform
      ? selectActiveValues(sparse?.nodes?.outlineWidths, nodeIndices, 1)
      : null;
    const nodeSizes = nodeSizesSelection?.view ?? null;
    const nodeOutlineWidths = nodeOutlineSelection?.view ?? null;
    if (!nodeSizeUniform && nodeCount && (!nodeSizes || nodeSizes.length !== nodeCount)) {
      throw new Error('AttributeTracker: indirect mode requires sparse node sizes.');
    }
    if (!nodeOutlineUniform && nodeCount && (!nodeOutlineWidths || nodeOutlineWidths.length !== nodeCount)) {
      throw new Error('AttributeTracker: indirect mode requires sparse node outline widths.');
    }

    const edgeSegments = (config.edgeAttribute && edgeCount)
      ? packEdgeSegmentsFromSparse(sparse?.nodes?.positions, sparse?.edges?.endpoints, edgeIndices)
      : null;
    if (config.edgeAttribute && edgeCount && (!edgeSegments || edgeSegments.length !== edgeCount * 6)) {
      throw new Error('AttributeTracker: indirect mode requires sparse edge endpoints and node positions.');
    }

    const widthFromNode = edgeVariant?.widthSource === 'node';
    const endpointSizeFromNode = edgeVariant?.endpointSizeSource === 'node';
    const widthEndpointsMode = normalizeNodeSourceEndpoints(edgeVariant?.widthEndpoints);
    const endpointSizeEndpointsMode = normalizeNodeSourceEndpoints(edgeVariant?.endpointSizeEndpoints);

    let edgeWidths = null;
    let edgeWidthsDirect = false;
    if (config.edgeAttribute && useQuads && !edgeWidthUniform) {
      if (widthFromNode) {
        const widthSource = sparse?.nodeEdgeSources?.width?.view ?? sparse?.nodes?.sizes;
        edgeWidths = packNodeSourcedEdgePairs(widthSource, sparse?.edges?.endpoints, edgeIndices, widthEndpointsMode);
      } else {
        const widthSelection = selectActiveValues(sparse?.edges?.widths, edgeIndices, 2);
        edgeWidths = widthSelection.view;
        edgeWidthsDirect = widthSelection.direct;
      }
      if (edgeCount && (!edgeWidths || edgeWidths.length !== edgeCount * 2)) {
        throw new Error('AttributeTracker: indirect mode requires edge widths (or node width source) for quad edges.');
      }
    }

    let edgeEndpointSizes = null;
    let edgeEndpointSizesDirect = false;
    if (config.edgeAttribute && !edgeEndpointSizeUniform) {
      if (endpointSizeFromNode) {
        const endpointSource = sparse?.nodeEdgeSources?.endpointSize?.view ?? sparse?.nodes?.sizes;
        edgeEndpointSizes = packNodeSourcedEdgePairs(
          endpointSource,
          sparse?.edges?.endpoints,
          edgeIndices,
          endpointSizeEndpointsMode,
        );
      } else {
        const endpointSelection = selectActiveValues(sparse?.edges?.endpointSizes, edgeIndices, 2);
        edgeEndpointSizes = endpointSelection.view;
        edgeEndpointSizesDirect = endpointSelection.direct;
      }
      if (edgeCount && (!edgeEndpointSizes || edgeEndpointSizes.length !== edgeCount * 2)) {
        throw new Error('AttributeTracker: indirect mode requires edge endpoint sizes.');
      }
    }

    const nodeAttrName = config.nodeAttribute;
    const edgeAttrName = config.edgeAttribute;
    const nodeIsIndex = nodeAttrName === INDEX_SENTINEL || nodeAttrName === 'index' || nodeAttrName === '$index';
    const edgeIsIndex = edgeAttrName === INDEX_SENTINEL || edgeAttrName === 'index' || edgeAttrName === '$index';
    const sparseNodeEncoded = useIntegerEncoding ? null : getSparseEncodedDesc(network, 'node', nodeAttrName);
    const sparseEdgeEncoded = useIntegerEncoding ? null : getSparseEncodedDesc(network, 'edge', edgeAttrName);

    const nodeAttr = (nodeAttrName && nodeAttrName !== INDEX_SENTINEL && nodeAttrName !== 'index')
      ? safeGetAttributeBuffer(network, 'node', nodeAttrName)
      : null;
    const edgeAttr = (edgeAttrName && edgeAttrName !== INDEX_SENTINEL && edgeAttrName !== 'index')
      ? safeGetAttributeBuffer(network, 'edge', edgeAttrName)
      : null;

    if (nodeAttrName && nodeAttrName !== INDEX_SENTINEL && nodeAttrName !== 'index' && nodeCount && !nodeAttr?.view && !sparseNodeEncoded?.view) {
      throw new Error(`AttributeTracker: missing sparse node attribute "${nodeAttrName}" for indirect tracking.`);
    }
    if (edgeAttrName && edgeAttrName !== INDEX_SENTINEL && edgeAttrName !== 'index' && edgeCount && !edgeAttr?.view && !sparseEdgeEncoded?.view) {
      throw new Error(`AttributeTracker: missing sparse edge attribute "${edgeAttrName}" for indirect tracking.`);
    }
    if (nodeAttrName && nodeAttrName !== INDEX_SENTINEL && nodeAttrName !== 'index' && nodeCount) {
      if (!isSupportedTrackedIntegerBuffer(nodeAttr)) {
        throw new Error(
          `AttributeTracker: indirect WebGPU tracking attribute "${nodeAttrName}" `
          + 'must be a scalar Integer/UnsignedInteger/Category-style buffer.',
        );
      }
    }
    if (edgeAttrName && edgeAttrName !== INDEX_SENTINEL && edgeAttrName !== 'index' && edgeCount) {
      if (!isSupportedTrackedIntegerBuffer(edgeAttr)) {
        throw new Error(
          `AttributeTracker: indirect WebGPU tracking attribute "${edgeAttrName}" `
          + 'must be a scalar Integer/UnsignedInteger/Category-style buffer.',
        );
      }
    }

    const nodeEncodedFromSparse = useIntegerEncoding ? null : packActiveEncodedValues(sparseNodeEncoded, nodeIndices);
    const edgeEncodedFromSparse = useIntegerEncoding ? null : packActiveEncodedValues(sparseEdgeEncoded, edgeIndices);

    const nodeEncodedRawIndex = Boolean(useIntegerEncoding && nodeIsIndex && nodeIndices);
    const edgeEncodedRawIndex = Boolean(useIntegerEncoding && edgeIsIndex && edgeIndices);

    const nodeEncodedView = nodeEncodedRawIndex
      ? nodeIndices
      : (
        useIntegerEncoding
          ? encodeActiveValuesUint32(nodeAttrName, nodeAttr?.view ?? null, nodeIndices)
          : (nodeEncodedFromSparse ?? encodeActiveValues(nodeAttrName, nodeAttr?.view ?? null, nodeIndices))
      );
    const edgeEncodedView = edgeEncodedRawIndex
      ? edgeIndices
      : (
        useIntegerEncoding
          ? encodeActiveValuesUint32(edgeAttrName, edgeAttr?.view ?? null, edgeIndices)
          : (edgeEncodedFromSparse ?? encodeActiveValues(edgeAttrName, edgeAttr?.view ?? null, edgeIndices))
      );

    const nodeTopologyVersion = sparse?.nodes?.versions?.topology ?? 0;
    const edgeTopologyVersion = sparse?.edges?.versions?.topology ?? 0;
    const nodeWidthVersion = sparse?.nodeEdgeSources?.width?.version ?? sparse?.nodes?.versions?.sizes ?? 0;
    const nodeEndpointSizeVersion = sparse?.nodeEdgeSources?.endpointSize?.version ?? sparse?.nodes?.versions?.sizes ?? 0;
    const edgeSegmentVersion = mixVersions(
      sparse?.edges?.versions?.endpoints ?? 0,
      sparse?.nodes?.versions?.positions ?? 0,
    );
    const nodePositionVersion = sparse?.nodes?.versions?.positions ?? 0;
    const nodeSizeVersion = sparse?.nodes?.versions?.sizes ?? 0;
    const nodeOutlineVersion = sparse?.nodes?.versions?.outlineWidths ?? 0;
    const edgeWidthVersion = sparse?.edges?.versions?.widths ?? 0;
    const edgeEndpointSizeVersion = sparse?.edges?.versions?.endpointSizes ?? 0;

    const geometry = {
      nodes: {
        positions: nodePositions,
        sizes: nodeSizes,
        outlineWidths: nodeOutlineWidths,
        count: nodeCount,
        versions: {
          positions: sparse?.nodes?.versions?.positions ?? 0,
          sizes: sparse?.nodes?.versions?.sizes ?? 0,
          outlineWidths: sparse?.nodes?.versions?.outlineWidths ?? 0,
          topology: nodeTopologyVersion,
        },
      },
      edges: {
        segments: edgeSegments,
        widths: edgeWidths,
        endpointSizes: edgeEndpointSizes,
        count: edgeCount,
        versions: {
          segments: edgeSegmentVersion,
          widths: widthFromNode ? nodeWidthVersion : (sparse?.edges?.versions?.widths ?? 0),
          endpointSizes: endpointSizeFromNode ? nodeEndpointSizeVersion : (sparse?.edges?.versions?.endpointSizes ?? 0),
          topology: edgeTopologyVersion,
        },
      },
    };

    const encoded = {
      nodeEncoded: nodeEncodedView
        ? {
          view: nodeEncodedView,
          version: nodeEncodedRawIndex
            ? (sparse?.nodes?.versions?.indices ?? nodeTopologyVersion)
            : mixVersions(
              sparseNodeEncoded?.version ?? nodeAttr?.version ?? nodeTopologyVersion,
              nodeTopologyVersion,
            ),
          rawIndex: nodeEncodedRawIndex,
        }
        : null,
      edgeEncoded: edgeEncodedView
        ? {
          view: edgeEncodedView,
          version: edgeEncodedRawIndex
            ? (sparse?.edges?.versions?.indices ?? edgeTopologyVersion)
            : mixVersions(
              sparseEdgeEncoded?.version ?? edgeAttr?.version ?? edgeTopologyVersion,
              edgeTopologyVersion,
            ),
          rawIndex: edgeEncodedRawIndex,
        }
        : null,
    };

    const shared = {
      nodePositions: nodePositionsSelection.direct
        ? {
          key: 'indirect:node:positions',
          version: nodePositionVersion,
          topologyVersion: nodeTopologyVersion,
          count: nodeCount,
          byteLength: nodePositions?.byteLength ?? 0,
        }
        : null,
      nodeSizes: nodeSizesSelection?.direct
        ? {
          key: 'indirect:node:sizes',
          version: nodeSizeVersion,
          topologyVersion: nodeTopologyVersion,
          count: nodeCount,
          byteLength: nodeSizes?.byteLength ?? 0,
        }
        : null,
      nodeOutlineWidths: nodeOutlineSelection?.direct
        ? {
          key: 'indirect:node:outlineWidths',
          version: nodeOutlineVersion,
          topologyVersion: nodeTopologyVersion,
          count: nodeCount,
          byteLength: nodeOutlineWidths?.byteLength ?? 0,
        }
        : null,
      nodeIndices: nodeEncodedRawIndex
        ? {
          key: 'indirect:node:indices',
          version: sparse?.nodes?.versions?.indices ?? nodeTopologyVersion,
          topologyVersion: nodeTopologyVersion,
          count: nodeCount,
          byteLength: nodeIndices?.byteLength ?? 0,
        }
        : null,
      edgeWidths: (edgeWidthsDirect && !widthFromNode)
        ? {
          key: 'indirect:edge:widths',
          version: edgeWidthVersion,
          topologyVersion: edgeTopologyVersion,
          count: edgeCount,
          byteLength: edgeWidths?.byteLength ?? 0,
        }
        : null,
      edgeEndpointSizes: (edgeEndpointSizesDirect && !endpointSizeFromNode)
        ? {
          key: 'indirect:edge:endpointSizes',
          version: edgeEndpointSizeVersion,
          topologyVersion: edgeTopologyVersion,
          count: edgeCount,
          byteLength: edgeEndpointSizes?.byteLength ?? 0,
        }
        : null,
      edgeIndices: edgeEncodedRawIndex
        ? {
          key: 'indirect:edge:indices',
          version: sparse?.edges?.versions?.indices ?? edgeTopologyVersion,
          topologyVersion: edgeTopologyVersion,
          count: edgeCount,
          byteLength: edgeIndices?.byteLength ?? 0,
        }
        : null,
    };

    return { geometry, encoded, shared };
  }

  renderPreparedGeometry(geometry, encoded, config, options = {}) {
    if (!geometry) return null;
    const {
      size,
      cameraUniforms,
      useQuads,
      nodeSizeUniform,
      nodeOutlineUniform,
      edgeWidthUniform,
      edgeEndpointSizeUniform,
      nodeCfg,
      edgeCfg,
      sharedCandidates = null,
    } = options;

    const nodeSizes = (!nodeSizeUniform) ? geometry.nodes.sizes : null;
    const nodeOutlineWidths = (!nodeOutlineUniform) ? geometry.nodes.outlineWidths : null;
    const edgeWidths = (useQuads && !edgeWidthUniform) ? geometry.edges.widths : null;
    const edgeEndpointSizes = (!edgeEndpointSizeUniform) ? geometry.edges.endpointSizes : null;

    const gpu = this.device.device;

    const pipelines = this.getPipelinesForVariant({
      nodeSizeUniform,
      nodeOutlineUniform,
      edgeWidthUniform,
      edgeEndpointSizeUniform,
      nodeIndexEncodedRaw: encoded.nodeEncoded?.rawIndex === true,
      edgeIndexEncodedRaw: encoded.edgeEncoded?.rawIndex === true,
    });
    if (!pipelines) return null;

    const occlusionPipelines = this.getNodeOcclusionPipelinesForVariant({
      nodeSizeUniform,
      nodeOutlineUniform,
    });
    const is2D = cameraUniforms.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
    const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
    const edgeWidthBase = this.graphLayer.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
    const edgeWidthScale = this.graphLayer.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;

    const cameraBuffer = gpu.createBuffer({
      size: 48 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    const cameraArray = new Float32Array(cameraBuffer.getMappedRange());
    cameraArray.set(cameraUniforms.viewProjection, 0);
    cameraArray.set(cameraUniforms.view, 16);
    cameraArray.set(cameraUniforms.position ?? [0, 0, 0], 32);
    cameraArray[35] = is2D ? 1 : 0;
    cameraArray.set(cameraUniforms.up ?? [0, 1, 0], 36);
    cameraArray.set(cameraUniforms.right ?? [1, 0, 0], 40);
    const viewportWidth = cameraUniforms.viewport?.width ?? size.width ?? 1;
    const viewportHeight = cameraUniforms.viewport?.height ?? size.height ?? 1;
    const pixelRatio = cameraUniforms.viewport?.devicePixelRatio ?? size.devicePixelRatio ?? 1;
    const drawWidth = viewportWidth * pixelRatio;
    const drawHeight = viewportHeight * pixelRatio;
    cameraArray[44] = drawWidth;
    cameraArray[45] = drawHeight;
    cameraArray[46] = drawWidth > 0 ? 1 / drawWidth : 0;
    cameraArray[47] = drawHeight > 0 ? 1 / drawHeight : 0;
    cameraBuffer.unmap();

    const globalsBuffer = gpu.createBuffer({
      size: 24 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    const globalsArray = new Float32Array(globalsBuffer.getMappedRange());
    globalsArray[0] = this.graphLayer.nodeOpacityBase;
    globalsArray[1] = this.graphLayer.nodeOpacityScale;
    globalsArray[2] = this.graphLayer.nodeSizeBase;
    globalsArray[3] = this.graphLayer.nodeSizeScale;
    globalsArray[4] = this.graphLayer.nodeOutlineWidthBase;
    globalsArray[5] = this.graphLayer.nodeOutlineWidthScale;
    globalsArray[6] = this.graphLayer.edgeOpacityBase;
    globalsArray[7] = this.graphLayer.edgeOpacityScale;
    globalsArray[8] = edgeWidthBase;
    globalsArray[9] = edgeWidthScale;
    globalsArray[10] = nodeSizeUniform ? Number(nodeCfg?.size?.value ?? 0) : 0;
    globalsArray[11] = nodeOutlineUniform ? Number(nodeCfg?.outline?.value ?? 0) : 0;
    globalsArray[12] = this.graphLayer.nodeOutlineColor?.[0] ?? 0;
    globalsArray[13] = this.graphLayer.nodeOutlineColor?.[1] ?? 0;
    globalsArray[14] = this.graphLayer.nodeOutlineColor?.[2] ?? 0;
    globalsArray[15] = this.graphLayer.nodeOutlineColor?.[3] ?? 1;
    globalsArray[16] = this.graphLayer.edgeEndpointTrim;
    globalsArray[17] = 0;
    const edgeWidthPair = edgeCfg?.width?.value;
    globalsArray[18] = edgeWidthUniform ? Number(edgeWidthPair?.[0] ?? 1) : 1;
    globalsArray[19] = edgeWidthUniform ? Number(edgeWidthPair?.[1] ?? 1) : 1;
    const edgeEndpointPair = edgeCfg?.endpointSize?.value;
    globalsArray[20] = edgeEndpointSizeUniform ? Number(edgeEndpointPair?.[0] ?? 1) : 1;
    globalsArray[21] = edgeEndpointSizeUniform ? Number(edgeEndpointPair?.[1] ?? 1) : 1;
    globalsArray[22] = 0;
    globalsArray[23] = 0;
    globalsBuffer.unmap();

    this.nodeBindGroup = gpu.createBindGroup({
      layout: this.nodeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: globalsBuffer } },
      ],
    });
    this.edgeBindGroup = geometry.edges.count
      ? gpu.createBindGroup({
        layout: this.edgeBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: cameraBuffer } },
          { binding: 1, resource: { buffer: globalsBuffer } },
        ],
      })
      : null;

    const encoder = gpu.createCommandEncoder();
    const passes = [];

    const resourceCache = this.device?.resourceCache?.webgpu;
    const sharedResources = this.getSharedGraphResources();
    const vertexUsage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
    const uploadVertex = (key, source, meta) => {
      if (!resourceCache || !source) return null;
      return resourceCache.uploadBuffer(gpu, gpu.queue, key, source, { ...meta, trackViewIdentity: true }, vertexUsage);
    };

    const bindVertexSlots = (pass, slots, buffersBySlot) => {
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i];
        const buf = buffersBySlot[slot];
        if (!buf) return false;
        pass.setVertexBuffer(i, buf);
      }
      return true;
    };

    const nodePositionBuffer = geometry.nodes.count
      ? this.resolveSharedWebGPUBuffer(
        sharedResources,
        sharedCandidates?.nodePositions ?? null,
        () => uploadVertex('attr:webgpu:node:positions', geometry.nodes.positions, {
          label: 'AttributeTracker node positions',
          version: geometry.nodes.versions?.positions ?? 0,
          topologyVersion: geometry.nodes.versions?.topology ?? 0,
          count: geometry.nodes.count,
        }),
      )
      : null;

    const needNodeSize = pipelines.nodeSlots.includes('size');
    const needNodeOutline = pipelines.nodeSlots.includes('outline');

    const nodeSizeBuffer = (geometry.nodes.count && needNodeSize)
      ? this.resolveSharedWebGPUBuffer(
        sharedResources,
        sharedCandidates?.nodeSizes ?? null,
        () => uploadVertex('attr:webgpu:node:sizes', nodeSizes, {
          label: 'AttributeTracker node sizes',
          version: geometry.nodes.versions?.sizes ?? 0,
          topologyVersion: geometry.nodes.versions?.topology ?? 0,
          count: geometry.nodes.count,
        }),
      )
      : null;

    const nodeOutlineBuffer = (geometry.nodes.count && needNodeOutline)
      ? this.resolveSharedWebGPUBuffer(
        sharedResources,
        sharedCandidates?.nodeOutlineWidths ?? null,
        () => uploadVertex('attr:webgpu:node:outlineWidths', nodeOutlineWidths, {
          label: 'AttributeTracker node outline widths',
          version: geometry.nodes.versions?.outlineWidths ?? 0,
          topologyVersion: geometry.nodes.versions?.topology ?? 0,
          count: geometry.nodes.count,
        }),
      )
      : null;

    if (needNodeSize && (!nodeSizes || nodeSizes.length !== geometry.nodes.count)) {
      throw new Error('AttributeTracker: expected dense node sizes buffer but it was missing or wrong length');
    }
    if (needNodeOutline && (!nodeOutlineWidths || nodeOutlineWidths.length !== geometry.nodes.count)) {
      throw new Error('AttributeTracker: expected dense node outlineWidths buffer but it was missing or wrong length');
    }
    const nodeEncodedBuffer = (geometry.nodes.count && encoded.nodeEncoded?.view && config.nodeAttribute)
      ? this.resolveSharedWebGPUBuffer(
        sharedResources,
        encoded.nodeEncoded?.rawIndex ? (sharedCandidates?.nodeIndices ?? null) : null,
        () => resourceCache?.uploadBuffer(
          gpu,
          gpu.queue,
          `attr:webgpu:node:encoded:${config.nodeAttribute || 'index'}`,
          encoded.nodeEncoded.view,
          {
            label: 'AttributeTracker node encoded',
            version: encoded.nodeEncoded.version ?? 0,
            topologyVersion: 0,
            count: geometry.nodes.count,
            trackViewIdentity: encoded.nodeEncoded?.rawIndex === true,
          },
          vertexUsage,
        ),
      )
      : null;

    const edgeSegmentsBuffer = (geometry.edges.count && config.edgeAttribute)
      ? uploadVertex('attr:webgpu:edge:segments', geometry.edges.segments, {
        label: 'AttributeTracker edge segments',
        version: geometry.edges.versions?.segments ?? 0,
        topologyVersion: geometry.edges.versions?.topology ?? 0,
        count: geometry.edges.count,
      })
      : null;

    const edgeSlots = config.edgeAttribute
      ? (useQuads ? pipelines.edgeQuadSlots : pipelines.edgeLineSlots)
      : [];
    const needEdgeWidths = config.edgeAttribute && edgeSlots.includes('widths');
    const needEdgeEndpointSizes = config.edgeAttribute && edgeSlots.includes('endpointSizes');

    if (needEdgeWidths) {
      const expected = (geometry.edges.count ?? 0) * 2;
      if (!edgeWidths || edgeWidths.length !== expected) {
        throw new Error('AttributeTracker: expected dense edge widths buffer (vec2 per edge) but it was missing or wrong length');
      }
    }
    if (needEdgeEndpointSizes) {
      const expected = (geometry.edges.count ?? 0) * 2;
      if (!edgeEndpointSizes || edgeEndpointSizes.length !== expected) {
        throw new Error('AttributeTracker: expected dense edge endpointSizes buffer (vec2 per edge) but it was missing or wrong length');
      }
    }

    const edgeWidthsBuffer = (geometry.edges.count && needEdgeWidths)
      ? this.resolveSharedWebGPUBuffer(
        sharedResources,
        sharedCandidates?.edgeWidths ?? null,
        () => uploadVertex('attr:webgpu:edge:widths', edgeWidths, {
          label: 'AttributeTracker edge widths',
          version: geometry.edges.versions?.widths ?? 0,
          topologyVersion: geometry.edges.versions?.topology ?? 0,
          count: geometry.edges.count,
        }),
      )
      : null;

    const edgeEndpointSizeBuffer = (geometry.edges.count && needEdgeEndpointSizes)
      ? this.resolveSharedWebGPUBuffer(
        sharedResources,
        sharedCandidates?.edgeEndpointSizes ?? null,
        () => uploadVertex('attr:webgpu:edge:endpointSizes', edgeEndpointSizes, {
          label: 'AttributeTracker edge endpoint sizes',
          version: geometry.edges.versions?.endpointSizes ?? 0,
          topologyVersion: geometry.edges.versions?.topology ?? 0,
          count: geometry.edges.count,
        }),
      )
      : null;
    const edgeEncodedBuffer = (geometry.edges.count && encoded.edgeEncoded?.view && config.edgeAttribute)
      ? this.resolveSharedWebGPUBuffer(
        sharedResources,
        encoded.edgeEncoded?.rawIndex ? (sharedCandidates?.edgeIndices ?? null) : null,
        () => resourceCache?.uploadBuffer(
          gpu,
          gpu.queue,
          `attr:webgpu:edge:encoded:${config.edgeAttribute || 'index'}`,
          encoded.edgeEncoded.view,
          {
            label: 'AttributeTracker edge encoded',
            version: encoded.edgeEncoded.version ?? 0,
            topologyVersion: 0,
            count: geometry.edges.count,
            trackViewIdentity: encoded.edgeEncoded?.rawIndex === true,
          },
          vertexUsage,
        ),
      )
      : null;

    const nodeBuffersBySlot = {
      corner: this.cornerBuffer,
      position: nodePositionBuffer,
      size: nodeSizeBuffer,
      encoded: nodeEncodedBuffer,
      outline: nodeOutlineBuffer,
    };
    const canBindNode = geometry.nodes.count && config.nodeAttribute
      ? pipelines.nodeSlots.every((slot) => Boolean(nodeBuffersBySlot[slot]))
      : false;

    const edgeLineBuffersBySlot = {
      segments: edgeSegmentsBuffer,
      endpointSizes: edgeEndpointSizeBuffer,
      encoded: edgeEncodedBuffer,
    };
    const edgeQuadBuffersBySlot = {
      edgeCorner: this.edgeCornerBuffer,
      segments: edgeSegmentsBuffer,
      widths: edgeWidthsBuffer,
      endpointSizes: edgeEndpointSizeBuffer,
      encoded: edgeEncodedBuffer,
    };
    const canBindEdge = geometry.edges.count && config.edgeAttribute
      ? (useQuads
        ? pipelines.edgeQuadSlots.every((slot) => Boolean(edgeQuadBuffersBySlot[slot]))
        : pipelines.edgeLineSlots.every((slot) => Boolean(edgeLineBuffersBySlot[slot])))
      : false;

    if (canBindNode) {
      passes.push(() => {
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: this.targets.edge.texture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
          depthStencilAttachment: {
            view: this.targets.edge.depthTexture.createView(),
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });
        pass.setPipeline(pipelines.nodePipeline);
        pass.setBindGroup(0, this.nodeBindGroup);
        bindVertexSlots(pass, pipelines.nodeSlots, nodeBuffersBySlot);
        pass.draw(4, geometry.nodes.count, 0, 0);
        pass.end();
      });

      passes.push(() => {
        encoder.copyTextureToTexture(
          { texture: this.targets.edge.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
          { texture: this.targets.node.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
          { width: this.targets.edge.width, height: this.targets.edge.height, depthOrArrayLayers: 1 },
        );
      });
    }

    if (canBindEdge) {
      passes.push(() => {
        const occlusionNodeBuffers = {
          corner: this.cornerBuffer,
          position: nodePositionBuffer,
          size: nodeSizeBuffer,
          outline: nodeOutlineBuffer,
        };
        const canBindOcclusion = Boolean(occlusionPipelines)
          && occlusionPipelines.nodeSlots.every((slot) => Boolean(occlusionNodeBuffers[slot]));
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: this.targets.edge.texture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
          depthStencilAttachment: {
            view: this.targets.edge.depthTexture.createView(),
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });
        if (geometry.nodes.count && this.nodeBindGroup && canBindOcclusion) {
          pass.setPipeline(occlusionPipelines.nodePipeline);
          pass.setBindGroup(0, this.nodeBindGroup);
          bindVertexSlots(pass, occlusionPipelines.nodeSlots, occlusionNodeBuffers);
          pass.draw(4, geometry.nodes.count, 0, 0);
        }

        const useQuad = this.graphLayer.edgeRenderingMode === 'quad';
        pass.setPipeline(useQuad ? pipelines.edgeQuadPipeline : pipelines.edgePipeline);
        pass.setBindGroup(0, this.edgeBindGroup);
        if (useQuad) {
          bindVertexSlots(pass, pipelines.edgeQuadSlots, edgeQuadBuffersBySlot);
          pass.draw(4, geometry.edges.count, 0, 0);
        } else {
          bindVertexSlots(pass, pipelines.edgeLineSlots, edgeLineBuffersBySlot);
          pass.draw(2, geometry.edges.count, 0, 0);
        }
        pass.end();
      });
    }

    if (config.trackDepth) {
      const nodeDepthBuffersBySlot = {
        ...nodeBuffersBySlot,
      };
      const canBindNodeDepth = geometry.nodes.count
        && this.depthTargets.node
        && this.nodeBindGroup
        && pipelines.nodeSlots.every((slot) => Boolean(nodeDepthBuffersBySlot[slot]));

      const canBindEdgeDepth = geometry.edges.count
        && this.depthTargets.edge
        && this.edgeBindGroup
        && (useQuads
          ? pipelines.edgeQuadSlots.every((slot) => Boolean(edgeQuadBuffersBySlot[slot]))
          : pipelines.edgeLineSlots.every((slot) => Boolean(edgeLineBuffersBySlot[slot])));

      if (canBindNodeDepth && this.depthTargets.edge) {
        passes.push(() => {
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: this.depthTargets.edge.texture.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            }],
            depthStencilAttachment: {
              view: this.depthTargets.edge.depthTexture.createView(),
              depthClearValue: 1,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
            },
          });
          pass.setPipeline(pipelines.nodeDepthPipeline);
          pass.setBindGroup(0, this.nodeBindGroup);
          bindVertexSlots(pass, pipelines.nodeSlots, nodeDepthBuffersBySlot);
          pass.draw(4, geometry.nodes.count, 0, 0);
          pass.end();
        });

        passes.push(() => {
          encoder.copyTextureToTexture(
            { texture: this.depthTargets.edge.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
            { texture: this.depthTargets.node.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
            { width: this.depthTargets.edge.width, height: this.depthTargets.edge.height, depthOrArrayLayers: 1 },
          );
        });
      }

      if (canBindEdgeDepth) {
        passes.push(() => {
          const useQuad = this.graphLayer.edgeRenderingMode === 'quad';
          const occlusionNodeBuffers = {
            corner: this.cornerBuffer,
            position: nodePositionBuffer,
            size: nodeSizeBuffer,
            outline: nodeOutlineBuffer,
          };
          const canBindOcclusion = Boolean(occlusionPipelines)
            && occlusionPipelines.nodeSlots.every((slot) => Boolean(occlusionNodeBuffers[slot]));
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: this.depthTargets.edge.texture.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            }],
            depthStencilAttachment: {
              view: this.depthTargets.edge.depthTexture.createView(),
              depthClearValue: 1,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
            },
          });
          if (geometry.nodes.count && this.nodeBindGroup && canBindOcclusion) {
            pass.setPipeline(occlusionPipelines.nodeDepthPipeline);
            pass.setBindGroup(0, this.nodeBindGroup);
            bindVertexSlots(pass, occlusionPipelines.nodeSlots, occlusionNodeBuffers);
            pass.draw(4, geometry.nodes.count, 0, 0);
          }
          pass.setPipeline(useQuad ? pipelines.edgeQuadDepthPipeline : pipelines.edgeDepthPipeline);
          pass.setBindGroup(0, this.edgeBindGroup);
          if (useQuad) {
            bindVertexSlots(pass, pipelines.edgeQuadSlots, edgeQuadBuffersBySlot);
            pass.draw(4, geometry.edges.count, 0, 0);
          } else {
            bindVertexSlots(pass, pipelines.edgeLineSlots, edgeLineBuffersBySlot);
            pass.draw(2, geometry.edges.count, 0, 0);
          }
          pass.end();
        });
      }
    }

    passes.push(() => {
      gpu.queue.submit([encoder.finish()]);
      cameraBuffer.destroy();
      globalsBuffer.destroy();
    });

    this.runner?.run?.(passes, { device: this.device });
    return { ...this.targets, depthTargets: this.depthTargets };
  }

  renderIndirectSparseGeometry(network, sparse, config, options = {}) {
    if (!sparse) return null;
    const {
      size,
      cameraUniforms,
      useQuads,
      nodeSizeUniform,
      nodeOutlineUniform,
      edgeWidthUniform,
      edgeEndpointSizeUniform,
      nodeCfg,
      edgeCfg,
      edgeVariant = null,
    } = options;
    const gpu = this.device?.device;
    if (!gpu) return null;
    const nodes = sparse.nodes ?? {};
    const edges = sparse.edges ?? {};
    const nodeIndices = nodes.indices ?? null;
    const edgeIndices = edges.indices ?? null;
    const nodeCount = nodeIndices?.length ?? 0;
    const edgeCount = edgeIndices?.length ?? 0;

    if (config.nodeAttribute && nodeCount > 0 && !nodeIndices) {
      throw new Error('AttributeTracker: missing sparse node indices for indirect WebGPU tracking.');
    }
    if (config.edgeAttribute && edgeCount > 0 && !edgeIndices) {
      throw new Error('AttributeTracker: missing sparse edge indices for indirect WebGPU tracking.');
    }

    const nodeTracked = resolveTrackedSourceDescriptor(network, 'node', config.nodeAttribute);
    const edgeTracked = resolveTrackedSourceDescriptor(network, 'edge', config.edgeAttribute);
    if (config.nodeAttribute && nodeCount > 0 && !nodeTracked) {
      throw new Error(
        `AttributeTracker: indirect WebGPU tracking attribute "${config.nodeAttribute}" `
        + 'must be a scalar Integer/UnsignedInteger/Category-style buffer.',
      );
    }
    if (config.edgeAttribute && edgeCount > 0 && !edgeTracked) {
      throw new Error(
        `AttributeTracker: indirect WebGPU tracking attribute "${config.edgeAttribute}" `
        + 'must be a scalar Integer/UnsignedInteger/Category-style buffer.',
      );
    }

    const edgeWidthSource = edgeVariant?.widthSource === 'node' ? 'node' : 'edge';
    const edgeEndpointSizeSource = edgeVariant?.endpointSizeSource === 'node' ? 'node' : 'edge';
    const edgeWidthEndpoints = normalizeNodeSourceEndpoints(edgeVariant?.widthEndpoints);
    const edgeEndpointSizeEndpoints = normalizeNodeSourceEndpoints(edgeVariant?.endpointSizeEndpoints);

    const pipelines = this.getIndirectPipelinesForVariant({
      nodeSizeUniform,
      nodeOutlineUniform,
      edgeWidthUniform,
      edgeEndpointSizeUniform,
      edgeWidthSource,
      edgeEndpointSizeSource,
      edgeWidthEndpoints,
      edgeEndpointSizeEndpoints,
      nodeTrackedMode: nodeTracked?.mode ?? TRACKED_SOURCE_MODE.INDEX,
      edgeTrackedMode: edgeTracked?.mode ?? TRACKED_SOURCE_MODE.INDEX,
    });
    if (!pipelines) return null;

    const is2D = cameraUniforms.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
    const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
    const edgeWidthBase = this.graphLayer.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
    const edgeWidthScale = this.graphLayer.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;

    const cameraBuffer = gpu.createBuffer({
      size: 48 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    const cameraArray = new Float32Array(cameraBuffer.getMappedRange());
    cameraArray.set(cameraUniforms.viewProjection, 0);
    cameraArray.set(cameraUniforms.view, 16);
    cameraArray.set(cameraUniforms.position ?? [0, 0, 0], 32);
    cameraArray[35] = is2D ? 1 : 0;
    cameraArray.set(cameraUniforms.up ?? [0, 1, 0], 36);
    cameraArray.set(cameraUniforms.right ?? [1, 0, 0], 40);
    const viewportWidth = cameraUniforms.viewport?.width ?? size.width ?? 1;
    const viewportHeight = cameraUniforms.viewport?.height ?? size.height ?? 1;
    const pixelRatio = cameraUniforms.viewport?.devicePixelRatio ?? size.devicePixelRatio ?? 1;
    const drawWidth = viewportWidth * pixelRatio;
    const drawHeight = viewportHeight * pixelRatio;
    cameraArray[44] = drawWidth;
    cameraArray[45] = drawHeight;
    cameraArray[46] = drawWidth > 0 ? 1 / drawWidth : 0;
    cameraArray[47] = drawHeight > 0 ? 1 / drawHeight : 0;
    cameraBuffer.unmap();

    const globalsBuffer = gpu.createBuffer({
      size: 24 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    const globalsArray = new Float32Array(globalsBuffer.getMappedRange());
    globalsArray[0] = this.graphLayer.nodeOpacityBase;
    globalsArray[1] = this.graphLayer.nodeOpacityScale;
    globalsArray[2] = this.graphLayer.nodeSizeBase;
    globalsArray[3] = this.graphLayer.nodeSizeScale;
    globalsArray[4] = this.graphLayer.nodeOutlineWidthBase;
    globalsArray[5] = this.graphLayer.nodeOutlineWidthScale;
    globalsArray[6] = this.graphLayer.edgeOpacityBase;
    globalsArray[7] = this.graphLayer.edgeOpacityScale;
    globalsArray[8] = edgeWidthBase;
    globalsArray[9] = edgeWidthScale;
    globalsArray[10] = nodeSizeUniform ? Number(nodeCfg?.size?.value ?? 0) : 0;
    globalsArray[11] = nodeOutlineUniform ? Number(nodeCfg?.outline?.value ?? 0) : 0;
    globalsArray[12] = this.graphLayer.nodeOutlineColor?.[0] ?? 0;
    globalsArray[13] = this.graphLayer.nodeOutlineColor?.[1] ?? 0;
    globalsArray[14] = this.graphLayer.nodeOutlineColor?.[2] ?? 0;
    globalsArray[15] = this.graphLayer.nodeOutlineColor?.[3] ?? 1;
    globalsArray[16] = this.graphLayer.edgeEndpointTrim;
    globalsArray[17] = 0;
    const edgeWidthPair = edgeCfg?.width?.value;
    globalsArray[18] = edgeWidthUniform ? Number(edgeWidthPair?.[0] ?? 1) : 1;
    globalsArray[19] = edgeWidthUniform ? Number(edgeWidthPair?.[1] ?? 1) : 1;
    const edgeEndpointPair = edgeCfg?.endpointSize?.value;
    globalsArray[20] = edgeEndpointSizeUniform ? Number(edgeEndpointPair?.[0] ?? 1) : 1;
    globalsArray[21] = edgeEndpointSizeUniform ? Number(edgeEndpointPair?.[1] ?? 1) : 1;
    globalsArray[22] = 0;
    globalsArray[23] = 0;
    globalsBuffer.unmap();

    const resourceCache = this.device?.resourceCache?.webgpu;
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX;
    const sharedResources = this.getSharedGraphResources();
    const zeroStorage = this.ensureZeroStorageBuffer();

    const uploadStorage = (key, source, meta) => {
      if (!source || !resourceCache) return null;
      return resourceCache.uploadBuffer(gpu, gpu.queue, key, source, { ...meta, trackViewIdentity: false }, storageUsage);
    };

    const resolveStorage = (candidate, fallback) => {
      return this.resolveSharedWebGPUBuffer(sharedResources, candidate, fallback) ?? zeroStorage;
    };

    const nodeTopology = nodes.versions?.topology ?? 0;
    const edgeTopology = edges.versions?.topology ?? 0;

    const nodePositionsView = nodes.positions ?? null;
    const nodeSizesView = nodes.sizes ?? null;
    const nodeOutlineView = nodes.outlineWidths ?? null;
    const edgeEndpointsView = edges.endpoints ?? null;
    const edgeWidthsView = edges.widths ?? null;
    const edgeEndpointSizesView = edges.endpointSizes ?? null;
    const nodeWidthSourceView = sparse.nodeEdgeSources?.width?.view ?? nodeSizesView;
    const nodeEndpointSourceView = sparse.nodeEdgeSources?.endpointSize?.view ?? nodeSizesView;

    if (((config.nodeAttribute && nodeCount > 0) || (config.edgeAttribute && edgeCount > 0)) && !nodePositionsView) {
      throw new Error('AttributeTracker: indirect WebGPU mode requires sparse node positions.');
    }
    if (config.nodeAttribute && nodeCount > 0 && !nodeSizeUniform && !nodeSizesView) {
      throw new Error('AttributeTracker: indirect WebGPU mode requires sparse node sizes.');
    }
    if (config.nodeAttribute && nodeCount > 0 && !nodeOutlineUniform && !nodeOutlineView) {
      throw new Error('AttributeTracker: indirect WebGPU mode requires sparse node outline widths.');
    }
    if (config.edgeAttribute && edgeCount > 0 && !edgeEndpointsView) {
      throw new Error('AttributeTracker: indirect WebGPU mode requires sparse edge endpoints.');
    }
    if (config.edgeAttribute && edgeCount > 0 && !edgeWidthUniform && edgeWidthSource === 'edge' && !edgeWidthsView) {
      throw new Error('AttributeTracker: indirect WebGPU mode requires sparse edge widths.');
    }
    if (config.edgeAttribute && edgeCount > 0 && !edgeWidthUniform && edgeWidthSource === 'node' && !nodeWidthSourceView) {
      throw new Error('AttributeTracker: indirect WebGPU mode requires node width source values.');
    }
    if (config.edgeAttribute && edgeCount > 0 && !edgeEndpointSizeUniform && edgeEndpointSizeSource === 'edge' && !edgeEndpointSizesView) {
      throw new Error('AttributeTracker: indirect WebGPU mode requires sparse edge endpoint sizes.');
    }
    if (config.edgeAttribute && edgeCount > 0 && !edgeEndpointSizeUniform && edgeEndpointSizeSource === 'node' && !nodeEndpointSourceView) {
      throw new Error('AttributeTracker: indirect WebGPU mode requires node endpoint-size source values.');
    }

    const nodeIndicesBuffer = (config.nodeAttribute && nodeCount > 0)
      ? resolveStorage({
        key: 'indirect:node:indices',
        version: nodes.versions?.indices ?? nodeTopology,
        topologyVersion: nodeTopology,
        byteLength: nodeIndices?.byteLength ?? 0,
      }, () => uploadStorage('indirect:node:indices', nodeIndices, {
        label: 'AttributeTracker node indices',
        version: nodes.versions?.indices ?? nodeTopology,
        topologyVersion: nodeTopology,
        count: nodeCount,
      }))
      : zeroStorage;

    const edgeIndicesBuffer = (config.edgeAttribute && edgeCount > 0)
      ? resolveStorage({
        key: 'indirect:edge:indices',
        version: edges.versions?.indices ?? edgeTopology,
        topologyVersion: edgeTopology,
        byteLength: edgeIndices?.byteLength ?? 0,
      }, () => uploadStorage('indirect:edge:indices', edgeIndices, {
        label: 'AttributeTracker edge indices',
        version: edges.versions?.indices ?? edgeTopology,
        topologyVersion: edgeTopology,
        count: edgeCount,
      }))
      : zeroStorage;

    const nodePositionsBuffer = ((config.nodeAttribute && nodeCount > 0) || (config.edgeAttribute && edgeCount > 0))
      ? resolveStorage({
        key: 'indirect:node:positions',
        version: nodes.versions?.positions ?? 0,
        topologyVersion: nodeTopology,
        byteLength: nodePositionsView?.byteLength ?? 0,
      }, () => uploadStorage('indirect:node:positions', nodePositionsView, {
        label: 'AttributeTracker node positions',
        version: nodes.versions?.positions ?? 0,
        topologyVersion: nodeTopology,
        count: nodeCount,
      }))
      : zeroStorage;

    const nodeSizesBuffer = (config.nodeAttribute && !nodeSizeUniform && nodeCount > 0)
      ? resolveStorage({
        key: 'indirect:node:sizes',
        version: nodes.versions?.sizes ?? 0,
        topologyVersion: nodeTopology,
        byteLength: nodeSizesView?.byteLength ?? 0,
      }, () => uploadStorage('indirect:node:sizes', nodeSizesView, {
        label: 'AttributeTracker node sizes',
        version: nodes.versions?.sizes ?? 0,
        topologyVersion: nodeTopology,
        count: nodeCount,
      }))
      : zeroStorage;

    const nodeOutlineBuffer = (config.nodeAttribute && !nodeOutlineUniform && nodeCount > 0)
      ? resolveStorage({
        key: 'indirect:node:outlineWidths',
        version: nodes.versions?.outlineWidths ?? 0,
        topologyVersion: nodeTopology,
        byteLength: nodeOutlineView?.byteLength ?? 0,
      }, () => uploadStorage('indirect:node:outlineWidths', nodeOutlineView, {
        label: 'AttributeTracker node outline widths',
        version: nodes.versions?.outlineWidths ?? 0,
        topologyVersion: nodeTopology,
        count: nodeCount,
      }))
      : zeroStorage;

    const edgeEndpointsBuffer = (config.edgeAttribute && edgeCount > 0)
      ? resolveStorage({
        key: 'indirect:edge:endpoints',
        version: edges.versions?.endpoints ?? edgeTopology,
        topologyVersion: edgeTopology,
        byteLength: edgeEndpointsView?.byteLength ?? 0,
      }, () => uploadStorage('indirect:edge:endpoints', edgeEndpointsView, {
        label: 'AttributeTracker edge endpoints',
        version: edges.versions?.endpoints ?? edgeTopology,
        topologyVersion: edgeTopology,
        count: edgeCount,
      }))
      : zeroStorage;

    const edgeWidthsBuffer = (config.edgeAttribute && edgeCount > 0 && !edgeWidthUniform && edgeWidthSource === 'edge')
      ? resolveStorage({
        key: 'indirect:edge:widths',
        version: edges.versions?.widths ?? 0,
        topologyVersion: edgeTopology,
        byteLength: edgeWidthsView?.byteLength ?? 0,
      }, () => uploadStorage('indirect:edge:widths', edgeWidthsView, {
        label: 'AttributeTracker edge widths',
        version: edges.versions?.widths ?? 0,
        topologyVersion: edgeTopology,
        count: edgeCount,
      }))
      : zeroStorage;

    const edgeEndpointSizesBuffer = (config.edgeAttribute && edgeCount > 0 && !edgeEndpointSizeUniform && edgeEndpointSizeSource === 'edge')
      ? resolveStorage({
        key: 'indirect:edge:endpointSizes',
        version: edges.versions?.endpointSizes ?? 0,
        topologyVersion: edgeTopology,
        byteLength: edgeEndpointSizesView?.byteLength ?? 0,
      }, () => uploadStorage('indirect:edge:endpointSizes', edgeEndpointSizesView, {
        label: 'AttributeTracker edge endpoint sizes',
        version: edges.versions?.endpointSizes ?? 0,
        topologyVersion: edgeTopology,
        count: edgeCount,
      }))
      : zeroStorage;

    const nodeWidthSourceBuffer = (config.edgeAttribute && edgeCount > 0 && !edgeWidthUniform && edgeWidthSource === 'node')
      ? resolveStorage({
        key: 'indirect:node:edgeSource:width',
        version: sparse.nodeEdgeSources?.width?.version ?? nodes.versions?.sizes ?? 0,
        topologyVersion: nodeTopology,
        byteLength: nodeWidthSourceView?.byteLength ?? 0,
      }, () => uploadStorage('indirect:node:edgeSource:width', nodeWidthSourceView, {
        label: 'AttributeTracker node edge width source',
        version: sparse.nodeEdgeSources?.width?.version ?? nodes.versions?.sizes ?? 0,
        topologyVersion: nodeTopology,
        count: nodeCount,
      }))
      : zeroStorage;

    const nodeEndpointSourceBuffer = (config.edgeAttribute && edgeCount > 0 && !edgeEndpointSizeUniform && edgeEndpointSizeSource === 'node')
      ? resolveStorage({
        key: 'indirect:node:edgeSource:endpointSize',
        version: sparse.nodeEdgeSources?.endpointSize?.version ?? nodes.versions?.sizes ?? 0,
        topologyVersion: nodeTopology,
        byteLength: nodeEndpointSourceView?.byteLength ?? 0,
      }, () => uploadStorage('indirect:node:edgeSource:endpointSize', nodeEndpointSourceView, {
        label: 'AttributeTracker node edge endpoint-size source',
        version: sparse.nodeEdgeSources?.endpointSize?.version ?? nodes.versions?.sizes ?? 0,
        topologyVersion: nodeTopology,
        count: nodeCount,
      }))
      : zeroStorage;

    const nodeTrackedIntBuffer = (nodeTracked?.mode === TRACKED_SOURCE_MODE.INT && nodeCount > 0)
      ? uploadStorage(`attr:webgpu:node:trackedInt:${config.nodeAttribute}`, nodeTracked.view, {
        label: 'AttributeTracker node tracked int',
        version: nodeTracked.version ?? 0,
        topologyVersion: nodeTopology,
        count: nodeTracked.count ?? 0,
      })
      : zeroStorage;
    const nodeTrackedUintBuffer = (nodeTracked?.mode === TRACKED_SOURCE_MODE.UINT && nodeCount > 0)
      ? uploadStorage(`attr:webgpu:node:trackedUint:${config.nodeAttribute}`, nodeTracked.view, {
        label: 'AttributeTracker node tracked uint',
        version: nodeTracked.version ?? 0,
        topologyVersion: nodeTopology,
        count: nodeTracked.count ?? 0,
      })
      : zeroStorage;

    const edgeTrackedIntBuffer = (edgeTracked?.mode === TRACKED_SOURCE_MODE.INT && edgeCount > 0)
      ? uploadStorage(`attr:webgpu:edge:trackedInt:${config.edgeAttribute}`, edgeTracked.view, {
        label: 'AttributeTracker edge tracked int',
        version: edgeTracked.version ?? 0,
        topologyVersion: edgeTopology,
        count: edgeTracked.count ?? 0,
      })
      : zeroStorage;
    const edgeTrackedUintBuffer = (edgeTracked?.mode === TRACKED_SOURCE_MODE.UINT && edgeCount > 0)
      ? uploadStorage(`attr:webgpu:edge:trackedUint:${config.edgeAttribute}`, edgeTracked.view, {
        label: 'AttributeTracker edge tracked uint',
        version: edgeTracked.version ?? 0,
        topologyVersion: edgeTopology,
        count: edgeTracked.count ?? 0,
      })
      : zeroStorage;

    const nodeBindGroup = gpu.createBindGroup({
      layout: this.nodeIndirectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: globalsBuffer } },
        { binding: 2, resource: { buffer: nodeIndicesBuffer ?? zeroStorage } },
        { binding: 3, resource: { buffer: nodePositionsBuffer ?? zeroStorage } },
        { binding: 4, resource: { buffer: nodeSizesBuffer ?? zeroStorage } },
        { binding: 5, resource: { buffer: nodeOutlineBuffer ?? zeroStorage } },
        { binding: 6, resource: { buffer: nodeTrackedIntBuffer ?? zeroStorage } },
        { binding: 7, resource: { buffer: nodeTrackedUintBuffer ?? zeroStorage } },
      ],
    });

    const edgeBindGroup = gpu.createBindGroup({
      layout: this.edgeIndirectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: globalsBuffer } },
        { binding: 2, resource: { buffer: edgeIndicesBuffer ?? zeroStorage } },
        { binding: 3, resource: { buffer: edgeEndpointsBuffer ?? zeroStorage } },
        { binding: 4, resource: { buffer: nodePositionsBuffer ?? zeroStorage } },
        { binding: 5, resource: { buffer: edgeWidthsBuffer ?? zeroStorage } },
        { binding: 6, resource: { buffer: edgeEndpointSizesBuffer ?? zeroStorage } },
        { binding: 7, resource: { buffer: nodeWidthSourceBuffer ?? zeroStorage } },
        { binding: 8, resource: { buffer: nodeEndpointSourceBuffer ?? zeroStorage } },
        { binding: 9, resource: { buffer: edgeTrackedIntBuffer ?? zeroStorage } },
        { binding: 10, resource: { buffer: edgeTrackedUintBuffer ?? zeroStorage } },
      ],
    });

    const encoder = gpu.createCommandEncoder();
    const passes = [];
    const canBindNode = Boolean(config.nodeAttribute && nodeCount > 0 && nodeIndicesBuffer && nodePositionsBuffer);
    const canBindEdge = Boolean(config.edgeAttribute && edgeCount > 0 && edgeIndicesBuffer && edgeEndpointsBuffer && nodePositionsBuffer);

    if (canBindNode) {
      passes.push(() => {
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: this.targets.edge.texture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
          depthStencilAttachment: {
            view: this.targets.edge.depthTexture.createView(),
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });
        pass.setPipeline(pipelines.nodePipeline);
        pass.setBindGroup(0, nodeBindGroup);
        pass.setVertexBuffer(0, this.cornerBuffer);
        pass.draw(4, nodeCount, 0, 0);
        pass.end();
      });
      passes.push(() => {
        encoder.copyTextureToTexture(
          { texture: this.targets.edge.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
          { texture: this.targets.node.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
          { width: this.targets.edge.width, height: this.targets.edge.height, depthOrArrayLayers: 1 },
        );
      });
    }

    if (canBindEdge) {
      passes.push(() => {
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: this.targets.edge.texture.createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
          depthStencilAttachment: {
            view: this.targets.edge.depthTexture.createView(),
            depthClearValue: 1,
            depthLoadOp: 'clear',
            depthStoreOp: 'store',
          },
        });
        if (canBindNode) {
          pass.setPipeline(pipelines.nodeOcclusionPipeline);
          pass.setBindGroup(0, nodeBindGroup);
          pass.setVertexBuffer(0, this.cornerBuffer);
          pass.draw(4, nodeCount, 0, 0);
        }
        if (useQuads) {
          pass.setPipeline(pipelines.edgeQuadPipeline);
          pass.setBindGroup(0, edgeBindGroup);
          pass.setVertexBuffer(0, this.edgeCornerBuffer);
          pass.draw(4, edgeCount, 0, 0);
        } else {
          pass.setPipeline(pipelines.edgePipeline);
          pass.setBindGroup(0, edgeBindGroup);
          pass.draw(2, edgeCount, 0, 0);
        }
        pass.end();
      });
    }

    if (config.trackDepth) {
      if (canBindNode && this.depthTargets.edge) {
        passes.push(() => {
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: this.depthTargets.edge.texture.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            }],
            depthStencilAttachment: {
              view: this.depthTargets.edge.depthTexture.createView(),
              depthClearValue: 1,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
            },
          });
          pass.setPipeline(pipelines.nodeDepthPipeline);
          pass.setBindGroup(0, nodeBindGroup);
          pass.setVertexBuffer(0, this.cornerBuffer);
          pass.draw(4, nodeCount, 0, 0);
          pass.end();
        });
        passes.push(() => {
          encoder.copyTextureToTexture(
            { texture: this.depthTargets.edge.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
            { texture: this.depthTargets.node.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
            { width: this.depthTargets.edge.width, height: this.depthTargets.edge.height, depthOrArrayLayers: 1 },
          );
        });
      }
      if (canBindEdge && this.depthTargets.edge) {
        passes.push(() => {
          const pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: this.depthTargets.edge.texture.createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            }],
            depthStencilAttachment: {
              view: this.depthTargets.edge.depthTexture.createView(),
              depthClearValue: 1,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
            },
          });
          if (canBindNode) {
            pass.setPipeline(pipelines.nodeDepthPipeline);
            pass.setBindGroup(0, nodeBindGroup);
            pass.setVertexBuffer(0, this.cornerBuffer);
            pass.draw(4, nodeCount, 0, 0);
          }
          if (useQuads) {
            pass.setPipeline(pipelines.edgeQuadDepthPipeline);
            pass.setBindGroup(0, edgeBindGroup);
            pass.setVertexBuffer(0, this.edgeCornerBuffer);
            pass.draw(4, edgeCount, 0, 0);
          } else {
            pass.setPipeline(pipelines.edgeDepthPipeline);
            pass.setBindGroup(0, edgeBindGroup);
            pass.draw(2, edgeCount, 0, 0);
          }
          pass.end();
        });
      }
    }

    passes.push(() => {
      gpu.queue.submit([encoder.finish()]);
      cameraBuffer.destroy();
      globalsBuffer.destroy();
    });

    this.runner?.run?.(passes, { device: this.device });
    return { ...this.targets, depthTargets: this.depthTargets };
  }

  render(frame, size, config) {
    if (!this.device || !frame?.network) return null;
    const network = frame.network;
    const camera = frame.camera;
    const scale = config.resolutionScale ?? 1;
    this.resize(size, scale, config.trackDepth);
    const cameraUniforms = this.graphLayer.getCameraUniforms(camera);
    if (!cameraUniforms) return null;
    const useQuads = this.graphLayer.edgeRenderingMode === 'quad';
    const indirectMode = isIndirectGraphLayer(this.graphLayer);

    const schema = GraphVisualSchema.fromNetwork(network, {
      nodeOutlineUseAttributes: this.graphLayer?.nodeOutlineUseAttributes === true,
    });
    const nodeVariant = schema?.getNodeVariant?.() ?? null;
    const edgeVariant = schema?.getEdgeVariant?.() ?? null;
    const visualConfig = schema?.visualConfig ?? null;
    const nodeCfg = visualConfig?.node ?? null;
    const edgeCfg = visualConfig?.edge ?? null;

    const nodeSizeUniform = nodeVariant ? (nodeVariant.sizeBuffer === false) : false;
    const nodeOutlineUniform = nodeVariant ? (nodeVariant.outlineWidthBuffer === false) : true;
    const edgeWidthUniform = edgeVariant ? (edgeVariant.widthBuffer === false) : false;
    const edgeEndpointSizeUniform = edgeVariant ? (edgeVariant.endpointSizeBuffer === false) : true;

    const renderOptions = {
      size,
      cameraUniforms,
      useQuads,
      nodeSizeUniform,
      nodeOutlineUniform,
      edgeWidthUniform,
      edgeEndpointSizeUniform,
      nodeCfg,
      edgeCfg,
    };

    if (indirectMode) {
      const useIntegerEncoding = this.targetFormat === 'r32uint';
      const canUseDirectIndirectPath = Boolean(
        this.device?.device
        && this.nodeIndirectBindGroupLayout
        && this.edgeIndirectBindGroupLayout,
      );
      let topologyVersions = { node: 0, edge: 0 };
      if (typeof network.getTopologyVersions === 'function') {
        try {
          topologyVersions = network.getTopologyVersions() ?? topologyVersions;
        } catch (_) {
          topologyVersions = { node: 0, edge: 0 };
        }
      }
      // Only prepare sparse encoded attributes for the legacy prepared-geometry fallback path.
      // The direct indirect path can encode from tracked int/uint sources in-shader even when
      // the target format is rgba8 (i.e. when r32uint attachments are unavailable).
      if (!useIntegerEncoding && !canUseDirectIndirectPath) {
        ensureSparseEncodedReadyCached(
          this.sparseEncodedReadyCache,
          network,
          'node',
          config.nodeAttribute,
          topologyVersions.node,
        );
        ensureSparseEncodedReadyCached(
          this.sparseEncodedReadyCache,
          network,
          'edge',
          config.edgeAttribute,
          topologyVersions.edge,
        );
      }
      const nodeIndices = network.nodeIndices ?? null;
      const edgeIndices = network.edgeIndices ?? null;
      const indirectEdgeVariant = this.graphLayer.resolveIndirectEdgeVariant?.(visualConfig) ?? null;
      const edgeSourceRequests = this.getIndirectEdgeSourceRequests(indirectEdgeVariant);
      return this.graphLayer.withSparseGraph(
        network,
        topologyVersions,
        { node: nodeIndices, edge: edgeIndices },
        edgeSourceRequests,
        (sparseGeometry) => {
          if (!sparseGeometry) return null;
          if (!canUseDirectIndirectPath) {
            const prepared = this.buildIndirectPreparedGeometry(network, sparseGeometry, config, {
              useQuads,
              nodeSizeUniform,
              nodeOutlineUniform,
              edgeWidthUniform,
              edgeEndpointSizeUniform,
              edgeVariant: indirectEdgeVariant,
              useIntegerEncoding,
            });
            return this.renderPreparedGeometry(prepared.geometry, prepared.encoded, config, {
              ...renderOptions,
              sharedCandidates: prepared.shared ?? null,
            });
          }
          return this.renderIndirectSparseGeometry(network, sparseGeometry, config, {
            ...renderOptions,
            edgeVariant: indirectEdgeVariant,
          });
        },
      );
    }

    ensureEncodedReady(network, 'node', config.nodeAttribute);
    ensureEncodedReady(network, 'edge', config.edgeAttribute);

    const denseRequests = [];
    if (config.nodeAttribute || config.edgeAttribute) {
      denseRequests.push(['node', NODE_POSITION_ATTRIBUTE]);
      if (!nodeSizeUniform) denseRequests.push(['node', NODE_SIZE_ATTRIBUTE]);
      if (!nodeOutlineUniform) denseRequests.push(['node', VISUAL_ATTRIBUTE_NAMES.NODE_OUTLINE_WIDTH_ATTRIBUTE]);
    }
    if (config.edgeAttribute) {
      denseRequests.push(
        ['edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE],
        ...((useQuads && !edgeWidthUniform) ? [['edge', EDGE_WIDTH_ATTRIBUTE]] : []),
        ...(edgeEndpointSizeUniform ? [] : [['edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE]]),
      );
    }

    const overrides = frame?.positionOverrides ?? null;

    return this.graphLayer.withDenseGraph(network, (geometry) => {
      if (!geometry) return null;
      const encoded = this.encodeAttributes(network, geometry, config);
      return this.renderPreparedGeometry(geometry, encoded, config, renderOptions);
    }, denseRequests, overrides);
  }
}

export class AttributeTracker {
  constructor(renderer) {
    this.renderer = renderer;
    this.graphLayer = renderer?.graphLayer ?? null;
    this.nodeAttribute = null;
    this.edgeAttribute = null;
    this.options = { resolutionScale: 0.5, autoRender: true };
    this.webgl = null;
    this.webglIndirect = null;
    this._activeWebglRenderer = null;
    this.webgpu = null;
    this.size = renderer?.size ?? null;
    this.lastTargets = null;
    this.targetPool = new RenderTargetPool();
    this.runner = new FrameGraphRunner();
    this.counters = {
      renders: 0,
      node: 0,
      edge: 0,
      nodeDepth: 0,
      edgeDepth: 0,
    };
    this._lastSignature = null;
  }

  _hashMat4(mat) {
    if (!mat || mat.length < 16) return 0;
    let hash = 2166136261;
    for (let i = 0; i < 16; i += 1) {
      const v = mat[i] ?? 0;
      const n = Number.isFinite(v) ? v : 0;
      const bits = (Math.fround(n) * 1e6) | 0;
      hash ^= bits;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  _safeVersion(fn) {
    try {
      const v = fn();
      return Number.isFinite(v) ? v : 0;
    } catch (_) {
      return 0;
    }
  }

  _computeSignature(frame, size, options) {
    const network = frame?.network;
    if (!network || !this.graphLayer) return null;
    const camera = frame?.camera ?? this.renderer?.camera ?? null;
    const scale = options.resolutionScale ?? 1;
    const pixelRatio = (size?.devicePixelRatio ?? 1);
    const widthPx = Math.max(1, Math.floor((size?.width ?? 1) * pixelRatio * scale));
    const heightPx = Math.max(1, Math.floor((size?.height ?? 1) * pixelRatio * scale));
    const trackDepth = options.trackDepth === true ? 1 : 0;

    const topology = this._safeVersion(() => {
      const t = network.getTopologyVersions?.();
      return t ? ((t.node ?? 0) * 1315423911) ^ (t.edge ?? 0) : 0;
    });

    const visuals = VISUAL_ATTRIBUTE_NAMES;
    const nodePos = this._safeVersion(() => network.getNodeAttributeVersion?.(visuals.NODE_POSITION_ATTRIBUTE));
    const nodeSize = this._safeVersion(() => network.getNodeAttributeVersion?.(visuals.NODE_SIZE_ATTRIBUTE));
    const nodeState = this._safeVersion(() => network.getNodeAttributeVersion?.(visuals.NODE_STATE_ATTRIBUTE));
    const nodeOutline = this._safeVersion(() => network.getNodeAttributeVersion?.(visuals.NODE_OUTLINE_WIDTH_ATTRIBUTE));
    const edgeSeg = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_ENDPOINTS_POSITION_ATTRIBUTE));
    const edgeWidth = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_WIDTH_ATTRIBUTE));
    const edgeEndSize = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_ENDPOINTS_SIZE_ATTRIBUTE));
    const edgeEndState = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_ENDPOINTS_STATE_ATTRIBUTE));
    const edgeState = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_STATE_ATTRIBUTE));

    const nodeAttr = this.nodeAttribute ?? '';
    const edgeAttr = this.edgeAttribute ?? '';
    const nodeAttrVer = nodeAttr === '$index'
      ? this._safeVersion(() => network.getTopologyVersions?.()?.node ?? 0)
      : (nodeAttr ? this._safeVersion(() => network.getNodeAttributeVersion?.(nodeAttr)) : 0);
    const edgeAttrVer = edgeAttr === '$index'
      ? this._safeVersion(() => network.getTopologyVersions?.()?.edge ?? 0)
      : (edgeAttr ? this._safeVersion(() => network.getEdgeAttributeVersion?.(edgeAttr)) : 0);

    const camHash = this._hashMat4(camera?.viewProjectionMatrix);
    const edgeMode = this.graphLayer.edgeRenderingMode ?? 'quad';
    const projection = camera?.projection ?? '';
    const mode = camera?.mode ?? '';

    return [
      this.renderer?.device?.type ?? '',
      widthPx,
      heightPx,
      scale,
      trackDepth,
      mode,
      projection,
      camHash,
      edgeMode,
      // Visuals drive geometry; include their versions.
      topology,
      nodePos,
      nodeSize,
      nodeState,
      nodeOutline,
      edgeSeg,
      edgeWidth,
      edgeEndSize,
      edgeEndState,
      edgeState,
      // Tracked attributes drive encoded buffers.
      nodeAttr,
      nodeAttrVer,
      edgeAttr,
      edgeAttrVer,
    ].join('|');
  }

  enable(nodeAttribute, edgeAttribute, options = {}) {
    this.nodeAttribute = nodeAttribute || null;
    this.edgeAttribute = edgeAttribute || null;
    this._lastSignature = null;
    if (options.resolutionScale != null) {
      const scale = Number(options.resolutionScale);
      this.options.resolutionScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    }
    this.options.trackDepth = options.trackDepth === true;
    this.options.autoRender = options.autoRender !== false;
    if (options.edgeRenderingMode) {
      this.graphLayer?.setEdgeRenderingMode?.(options.edgeRenderingMode);
    }
    return this;
  }

  disable(scope) {
    if (scope === 'node') {
      this.nodeAttribute = null;
    } else if (scope === 'edge') {
      this.edgeAttribute = null;
    } else {
      this.nodeAttribute = null;
      this.edgeAttribute = null;
    }
    this._lastSignature = null;
  }

  resize(size) {
    this.size = size;
    this.webgl?.resize?.(size, this.options.resolutionScale);
    this.webglIndirect?.resize?.(size, this.options.resolutionScale);
    this.webgpu?.resize?.(size, this.options.resolutionScale);
    this._lastSignature = null;
  }

  async render(frame, force = false) {
    if (!this.renderer?.device || !this.graphLayer || (!this.nodeAttribute && !this.edgeAttribute)) return null;
    const signature = this._computeSignature(frame, this.size ?? this.renderer.size, this.options);
    if (signature && this.lastTargets && signature === this._lastSignature) {
      return this.lastTargets;
    }
    if (!this.options.autoRender && !force) return this.lastTargets;
    const device = this.renderer.device;
    const hadNode = Boolean(this.nodeAttribute);
    const hadEdge = Boolean(this.edgeAttribute);
    const trackDepth = this.options.trackDepth === true;
    let didRender = false;
    if (device.type === 'webgl2') {
      const indirectMode = isIndirectGraphLayer(this.graphLayer) && this.graphLayer?.isIndirectWebGL === true;
      const webglRenderer = indirectMode ? 'webglIndirect' : 'webgl';
      if (!this[webglRenderer]) {
        this[webglRenderer] = indirectMode
          ? new WebGLIndirectAttributeRenderer(this.graphLayer, this.targetPool, this.runner)
          : new WebGLAttributeRenderer(this.graphLayer, this.targetPool, this.runner);
        this[webglRenderer].initialize(device);
      }
      this._activeWebglRenderer = this[webglRenderer];
      this.lastTargets = this[webglRenderer].render(frame, this.size ?? this.renderer.size, {
        nodeAttribute: this.nodeAttribute,
        edgeAttribute: this.edgeAttribute,
        resolutionScale: this.options.resolutionScale,
        trackDepth: this.options.trackDepth,
      });
      didRender = Boolean(this.lastTargets);
    } else if (device.type === 'webgpu') {
      if (!this.webgpu) {
        this.webgpu = new WebGPUAttributeRenderer(this.graphLayer, this.targetPool, this.runner);
        this.webgpu.initialize(device);
      }
      this.lastTargets = this.webgpu.render(frame, this.size ?? this.renderer.size, {
        nodeAttribute: this.nodeAttribute,
        edgeAttribute: this.edgeAttribute,
        resolutionScale: this.options.resolutionScale,
        trackDepth: this.options.trackDepth,
      });
      didRender = Boolean(this.lastTargets);
    }
    if (didRender) {
      this._lastSignature = signature;
      this.counters.renders = bumpCounter(this.counters.renders);
      if (hadNode) {
        this.counters.node = bumpCounter(this.counters.node);
        if (trackDepth) this.counters.nodeDepth = bumpCounter(this.counters.nodeDepth);
      }
      if (hadEdge) {
        this.counters.edge = bumpCounter(this.counters.edge);
        if (trackDepth) this.counters.edgeDepth = bumpCounter(this.counters.edgeDepth);
      }
    }
    return this.lastTargets;
  }

  async pick(clientX, clientY) {
    if (!this.renderer?.device || !this.lastTargets) {
      return { node: -1, edge: -1 };
    }
    const size = this.size ?? this.renderer.size ?? { width: 1, height: 1, devicePixelRatio: 1 };
    const pixelRatio = size.devicePixelRatio ?? 1;
    const scale = this.options.resolutionScale ?? 1;
    const x = Math.floor(clientX * pixelRatio * scale);
    const yRaw = Math.floor(clientY * pixelRatio * scale);
    const targets = this.lastTargets;
    const results = { node: -1, edge: -1, nodeDepth: null, edgeDepth: null };
    const device = this.renderer.device;
    const readTarget = async (target, key) => {
      if (!target || !target.width || !target.height) return;
      const clampedX = Math.max(0, Math.min(x, target.width - 1));
      const y = device.type === 'webgl2'
        ? Math.max(0, target.height - 1 - yRaw)
        : yRaw;
      const clampedY = Math.max(0, Math.min(y, target.height - 1));
      const pixels = await device.readPixels(target, { x: clampedX, y: clampedY, width: 1, height: 1 });
      const format = device.type === 'webgpu'
        ? (this.webgpu?.targetFormat || device.format)
        : device.format;
      const useUintTarget = device.type === 'webgpu' && format === 'r32uint';
      const useBgra = device.type === 'webgpu' && typeof format === 'string' && format.startsWith('bgra');
      const decoded = useUintTarget
        ? decodePackedUint32(pixels, 0)
        : (useBgra
          ? decodePacked(new Uint8Array([pixels[2], pixels[1], pixels[0], pixels[3]]), 0)
          : decodePacked(pixels, 0));
      results[key] = decoded;
      if (this.options.trackDepth) {
        if (device.type === 'webgl2') {
          const webglTracker = this._activeWebglRenderer ?? this.webglIndirect ?? this.webgl;
          const depthTarget = key === 'node' ? webglTracker?.depthTargets?.node : webglTracker?.depthTargets?.edge;
          if (depthTarget) {
            const depthPixels = await device.readPixels(depthTarget, { x: clampedX, y: clampedY, width: 1, height: 1 });
            const depthBytes = depthPixels instanceof Uint8Array ? depthPixels : new Uint8Array(depthPixels);
            const reordered = useBgra
              ? new Uint8Array([depthBytes[2], depthBytes[1], depthBytes[0], depthBytes[3]])
              : depthBytes;
            results[`${key}Depth`] = unpackDepthRGBA(reordered, 0);
          } else {
            const depth = webglTracker?.readDepth?.(target, clampedX, clampedY);
            results[`${key}Depth`] = depth;
          }
        } else if (device.type === 'webgpu') {
          const depthTarget = key === 'node' ? this.webgpu?.depthTargets?.node : this.webgpu?.depthTargets?.edge;
          if (depthTarget?.texture) {
            const depthPixels = await device.readPixels(depthTarget, { x: clampedX, y: clampedY, width: 1, height: 1 });
            const depthBytes = depthPixels instanceof Uint8Array ? depthPixels : new Uint8Array(depthPixels);
            const reordered = useBgra
              ? new Uint8Array([depthBytes[2], depthBytes[1], depthBytes[0], depthBytes[3]])
              : depthBytes;
            results[`${key}Depth`] = unpackDepthRGBA(reordered, 0);
          }
        }
      }
    };
    if (this.nodeAttribute) {
      await readTarget(targets.node, 'node');
    }
    if (this.edgeAttribute) {
      await readTarget(targets.edge, 'edge');
    }
    return results;
  }

  destroy() {
    this.webgl?.destroy?.();
    this.webglIndirect?.destroy?.();
    this.webgpu?.destroy?.();
    this.webgl = null;
    this.webglIndirect = null;
    this._activeWebglRenderer = null;
    this.webgpu = null;
    this.lastTargets = null;
    this.targetPool?.releaseAll?.(this.renderer?.device);
  }
}
