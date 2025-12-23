const STATE_SLOTS = 8;

export const NODE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_corner;
layout (location = 1) in vec3 a_position;
layout (location = 2) in vec4 a_color;
layout (location = 3) in float a_size;
layout (location = 4) in uint a_state;

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
uniform vec4 u_nodeStateScale[${STATE_SLOTS}]; // x=sizeMul y=opacityMul z=outlineMul w=reserved
uniform vec4 u_nodeStateColorMul[${STATE_SLOTS}];
uniform vec4 u_nodeStateColorAdd[${STATE_SLOTS}];

out vec4 v_color;
out vec2 v_local;
out vec4 v_outlineColor;
out float v_outlineThreshold;
out vec3 v_centerWorld;
out vec3 v_rightWorld;
out vec3 v_upWorld;
out vec3 v_viewDir;
out float v_radius;

void main() {
  float sizeMul = 1.0;
  float opacityMul = 1.0;
  float outlineMul = 1.0;
  vec3 rgbMul = vec3(1.0);
  vec3 rgbAdd = vec3(0.0);
  if (a_state != 0u) {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabled = float((a_state >> uint(i)) & 1u);
      vec4 scale = u_nodeStateScale[i];
      sizeMul *= mix(1.0, scale.x, enabled);
      opacityMul *= mix(1.0, scale.y, enabled);
      outlineMul *= mix(1.0, scale.z, enabled);
      rgbMul *= mix(vec3(1.0), u_nodeStateColorMul[i].rgb, enabled);
      rgbAdd += u_nodeStateColorAdd[i].rgb * enabled;
    }
  }

  float baseSize = (u_nodeSizeBase + u_nodeSizeScale * a_size) * sizeMul;
  float outlineWidth = max(0.0, (u_outlineWidthBase + u_outlineWidthScale * a_size) * outlineMul);
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
  vec3 rgb = clamp(a_color.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  float alpha = clamp(u_nodeOpacityBase + u_nodeOpacityScale * a_color.a, 0.0, 1.0) * opacityMul;
  v_color = vec4(rgb, clamp(alpha, 0.0, 1.0));
  float outlineAlpha = clamp(u_nodeOpacityBase + u_nodeOpacityScale * u_outlineColor.a, 0.0, 1.0) * opacityMul;
  v_outlineColor = vec4(u_outlineColor.rgb, clamp(outlineAlpha, 0.0, 1.0));
  v_outlineThreshold = outlineWidth / max(fullSize, 1e-5);
  v_local = a_corner;
  v_centerWorld = a_position;
  v_rightWorld = right;
  v_upWorld = up;
  v_viewDir = viewDir;
  v_radius = radius;
}`;

export const NODE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_local;
in vec4 v_outlineColor;
in float v_outlineThreshold;
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
  if (v_outlineThreshold > 0.0 && dist > (1.0 - v_outlineThreshold)) {
    fragColor = v_outlineColor;
    return;
  }
  fragColor = v_color;

  // Write depth as if the quad represents a sphere in 3D mode.
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
}`;

export const EDGE_WEIGHTED_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;

in vec4 v_color;
layout (location = 0) out vec4 fragAccum;
layout (location = 1) out vec4 fragWeight;

void main() {
  float weight = v_color.a;
  fragAccum = vec4(v_color.rgb * weight, weight);
  fragWeight = vec4(weight, 0.0, 0.0, 0.0);
}`;

export const EDGE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec3 a_start;
layout (location = 1) in vec3 a_end;
layout (location = 2) in vec4 a_colorStart;
layout (location = 3) in vec4 a_colorEnd;
layout (location = 4) in vec2 a_width;
layout (location = 5) in vec2 a_endpointSize;
layout (location = 6) in vec2 a_opacity;
layout (location = 7) in uint a_state;
layout (location = 8) in uvec2 a_endpointState;

uniform mat4 u_viewProjection;
uniform float u_edgeOpacityBase;
uniform float u_edgeOpacityScale;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;
uniform vec4 u_nodeStateScale[${STATE_SLOTS}]; // x=sizeMul (used for endpoint sizes)
uniform vec4 u_edgeStateScale[${STATE_SLOTS}]; // x=widthMul y=opacityMul
uniform vec4 u_edgeStateColorMul[${STATE_SLOTS}];
uniform vec4 u_edgeStateColorAdd[${STATE_SLOTS}];

out vec4 v_color;

void main() {
  float widthMul = 1.0;
  float opacityMul = 1.0;
  vec3 rgbMul = vec3(1.0);
  vec3 rgbAdd = vec3(0.0);
  if (a_state != 0u) {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabled = float((a_state >> uint(i)) & 1u);
      vec4 scale = u_edgeStateScale[i];
      widthMul *= mix(1.0, scale.x, enabled);
      opacityMul *= mix(1.0, scale.y, enabled);
      rgbMul *= mix(vec3(1.0), u_edgeStateColorMul[i].rgb, enabled);
      rgbAdd += u_edgeStateColorAdd[i].rgb * enabled;
    }
  }

  float startSizeMul = 1.0;
  float endSizeMul = 1.0;
  if ((a_endpointState.x | a_endpointState.y) != 0u) {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabledStart = float((a_endpointState.x >> uint(i)) & 1u);
      float enabledEnd = float((a_endpointState.y >> uint(i)) & 1u);
      float slotMul = u_nodeStateScale[i].x;
      startSizeMul *= mix(1.0, slotMul, enabledStart);
      endSizeMul *= mix(1.0, slotMul, enabledEnd);
    }
  }

  vec3 dir = a_end - a_start;
  float dirLen = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLen;
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * a_endpointSize.x, 0.0) * 0.5 * startSizeMul;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * a_endpointSize.y, 0.0) * 0.5 * endSizeMul;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = a_start + dirN * trimStart;
  vec3 endPos = a_end - dirN * trimEnd;
  bool isEnd = (gl_VertexID & 1) == 1;
  vec3 pos = isEnd ? endPos : startPos;
  vec4 baseColor = isEnd ? a_colorEnd : a_colorStart;
  vec3 rgb = clamp(baseColor.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  vec4 color = vec4(rgb, baseColor.a);
  float width = (isEnd ? a_width.y : a_width.x) * widthMul;
  gl_Position = u_viewProjection * vec4(pos, 1.0);
  float rawOpacity = isEnd ? a_opacity.y : a_opacity.x;
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * rawOpacity, 0.0, 1.0) * opacityMul;
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
layout (location = 8) in uint a_state;
layout (location = 9) in uvec2 a_endpointState;

uniform mat4 u_viewProjection;
uniform vec2 u_viewport;
uniform float u_edgeOpacityBase;
uniform float u_edgeOpacityScale;
uniform float u_edgeWidthBase;
uniform float u_edgeWidthScale;
uniform float u_nodeSizeBase;
uniform float u_nodeSizeScale;
uniform float u_edgeEndpointTrim;
uniform vec4 u_nodeStateScale[${STATE_SLOTS}]; // x=sizeMul (used for endpoint sizes)
uniform vec4 u_edgeStateScale[${STATE_SLOTS}]; // x=widthMul y=opacityMul
uniform vec4 u_edgeStateColorMul[${STATE_SLOTS}];
uniform vec4 u_edgeStateColorAdd[${STATE_SLOTS}];

out vec4 v_color;

void main() {
  float widthMul = 1.0;
  float opacityMul = 1.0;
  vec3 rgbMul = vec3(1.0);
  vec3 rgbAdd = vec3(0.0);
  if (a_state != 0u) {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabled = float((a_state >> uint(i)) & 1u);
      vec4 scale = u_edgeStateScale[i];
      widthMul *= mix(1.0, scale.x, enabled);
      opacityMul *= mix(1.0, scale.y, enabled);
      rgbMul *= mix(vec3(1.0), u_edgeStateColorMul[i].rgb, enabled);
      rgbAdd += u_edgeStateColorAdd[i].rgb * enabled;
    }
  }

  float startSizeMul = 1.0;
  float endSizeMul = 1.0;
  if ((a_endpointState.x | a_endpointState.y) != 0u) {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabledStart = float((a_endpointState.x >> uint(i)) & 1u);
      float enabledEnd = float((a_endpointState.y >> uint(i)) & 1u);
      float slotMul = u_nodeStateScale[i].x;
      startSizeMul *= mix(1.0, slotMul, enabledStart);
      endSizeMul *= mix(1.0, slotMul, enabledEnd);
    }
  }

  vec3 dir = a_end - a_start;
  float dirLenWorld = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLenWorld;
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * a_endpointSize.x, 0.0) * 0.5 * startSizeMul;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * a_endpointSize.y, 0.0) * 0.5 * endSizeMul;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = a_start + dirN * trimStart;
  vec3 endPos = a_end - dirN * trimEnd;

  float segmentMix = clamp(a_corner.x, 0.0, 1.0);
  float width = max((u_edgeWidthBase + u_edgeWidthScale * mix(a_width.x, a_width.y, segmentMix)) * widthMul, 0.0);
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
  vec3 rgb = clamp(blended.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * mix(a_opacity.x, a_opacity.y, segmentMix), 0.0, 1.0) * opacityMul;
  float alpha = clamp(opacity * blended.a, 0.0, 1.0);
  v_color = vec4(rgb, alpha);
}`;

export const EDGE_QUAD_FRAGMENT_SOURCE = EDGE_FRAGMENT_SOURCE;

export const EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE = EDGE_WEIGHTED_FRAGMENT_SOURCE;

export const EDGE_RESOLVE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_position;
layout (location = 1) in vec2 a_uv;
out vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}`;

export const EDGE_RESOLVE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;
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
}`;

// Simple Reinhard tone map after normalization.
export const EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_colorAccum;
uniform sampler2D u_weightAccum;
out vec4 fragColor;

void main() {
  vec3 accum = texture(u_colorAccum, v_uv).rgb;
  float weight = texture(u_weightAccum, v_uv).r;
  float denom = max(weight, 1e-4);
  vec3 resolved = accum / denom;
  // Reinhard tone map
  vec3 tonemapped = resolved / (resolved + vec3(1.0));
  float alpha = clamp(weight, 0.0, 1.0);
  fragColor = vec4(tonemapped, alpha);
}`;

// Normalize then boost by weight before tone mapping to brighten overlaps.
export const EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;
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
  // Tone map to avoid infinite growth.
  vec3 tonemapped = boosted / (boosted + vec3(1.0));
  float alpha = clamp(weight, 0.0, 1.0);
  fragColor = vec4(tonemapped, alpha);
}`;
