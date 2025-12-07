export const NODE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_corner;
layout (location = 1) in vec3 a_position;
layout (location = 2) in vec4 a_color;
layout (location = 3) in float a_size;

uniform mat4 u_viewProjection;
uniform mat4 u_view;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
uniform bool u_is2D;
uniform float u_nodeOpacityBase;
uniform float u_nodeOpacityScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_outlineWidthBase;
uniform float u_outlineWidthScale;
uniform vec4 u_outlineColor;

out vec4 v_color;
out vec2 v_local;
out vec4 v_outlineColor;
out float v_outlineThreshold;

void main() {
  float baseSize = u_nodeSizeBase + u_nodeSizeScale * a_size;
  float outlineWidth = max(0.0, u_outlineWidthBase + u_outlineWidthScale * a_size);
  float fullSize = baseSize + outlineWidth;
  float radius = max(1.0, fullSize) * 0.5;
  vec3 right = u_cameraRight;
  vec3 up = u_cameraUp;
  if (u_is2D) {
    right = normalize(right);
    up = normalize(up);
  } else {
    vec3 viewDir = u_cameraPosition - a_position;
    float viewLen = length(viewDir);
    viewDir = viewLen > 1e-5 ? viewDir / viewLen : vec3(0.0, 0.0, 1.0);
    right = u_cameraRight - viewDir * dot(u_cameraRight, viewDir);
    float rightLen = length(right);
    right = rightLen > 1e-5 ? right / rightLen : normalize(cross(u_cameraUp, viewDir));
    up = normalize(cross(viewDir, right));
  }
  vec3 world = a_position + (right * a_corner.x + up * a_corner.y) * radius;
  gl_Position = u_viewProjection * vec4(world, 1.0);
  float alpha = clamp(u_nodeOpacityBase + u_nodeOpacityScale * a_color.a, 0.0, 1.0);
  v_color = vec4(a_color.rgb, alpha);
  float outlineAlpha = clamp(u_nodeOpacityBase + u_nodeOpacityScale * u_outlineColor.a, 0.0, 1.0);
  v_outlineColor = vec4(u_outlineColor.rgb, outlineAlpha);
  v_outlineThreshold = outlineWidth / max(fullSize, 1e-5);
  v_local = a_corner;
}`;

export const NODE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_local;
in vec4 v_outlineColor;
in float v_outlineThreshold;
out vec4 fragColor;

void main() {
  float dist = length(v_local);
  if (dist > 1.0) {
    discard;
  }
  if (v_outlineThreshold > 0.0 && dist > (1.0 - v_outlineThreshold)) {
    fragColor = v_outlineColor;
    return;
  }
  fragColor = v_color;
}`;

export const EDGE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec3 a_start;
layout (location = 1) in vec3 a_end;
layout (location = 2) in vec4 a_colorStart;
layout (location = 3) in vec4 a_colorEnd;
layout (location = 4) in vec2 a_width;
layout (location = 5) in vec2 a_endpointSize;
layout (location = 6) in vec2 a_opacity;

uniform mat4 u_viewProjection;
uniform float u_edgeOpacityBase;
uniform float u_edgeOpacityScale;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;

out vec4 v_color;

void main() {
  vec3 dir = a_end - a_start;
  float dirLen = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLen;
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * a_endpointSize.x, 0.0) * 0.5;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * a_endpointSize.y, 0.0) * 0.5;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = a_start + dirN * trimStart;
  vec3 endPos = a_end - dirN * trimEnd;
  bool isEnd = (gl_VertexID & 1) == 1;
  vec3 pos = isEnd ? endPos : startPos;
  vec4 color = isEnd ? a_colorEnd : a_colorStart;
  float width = isEnd ? a_width.y : a_width.x;
  gl_Position = u_viewProjection * vec4(pos, 1.0);
  float rawOpacity = isEnd ? a_opacity.y : a_opacity.x;
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * rawOpacity, 0.0, 1.0);
  float alpha = clamp(opacity * color.a, 0.0, 1.0);
  v_color = vec4(color.rgb, alpha);
}`;

export const EDGE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}`;

export const EDGE_QUAD_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_corner;
layout (location = 1) in vec3 a_start;
layout (location = 2) in vec3 a_end;
layout (location = 3) in vec2 a_width;
layout (location = 4) in vec4 a_colorStart;
layout (location = 5) in vec4 a_colorEnd;
layout (location = 6) in vec2 a_endpointSize;
layout (location = 7) in vec2 a_opacity;

uniform mat4 u_viewProjection;
uniform vec2 u_viewport;
uniform float u_edgeOpacityBase;
uniform float u_edgeOpacityScale;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;

out vec4 v_color;

void main() {
  vec3 dir = a_end - a_start;
  float dirLenWorld = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLenWorld;
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * a_endpointSize.x, 0.0) * 0.5;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * a_endpointSize.y, 0.0) * 0.5;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = a_start + dirN * trimStart;
  vec3 endPos = a_end - dirN * trimEnd;

  float segmentMix = clamp(a_corner.x, 0.0, 1.0);
  float width = max(u_edgeWidthBase + u_edgeWidthScale * mix(a_width.x, a_width.y, segmentMix), 0.0);
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
  vec4 blended = mix(a_colorStart, a_colorEnd, segmentMix);
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * mix(a_opacity.x, a_opacity.y, segmentMix), 0.0, 1.0);
  float alpha = clamp(opacity * blended.a, 0.0, 1.0);
  v_color = vec4(blended.rgb, alpha);
}`;

export const EDGE_QUAD_FRAGMENT_SOURCE = EDGE_FRAGMENT_SOURCE;
