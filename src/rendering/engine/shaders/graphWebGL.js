export const NODE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_corner;
layout (location = 1) in vec4 a_position;
layout (location = 2) in vec4 a_color;
layout (location = 3) in float a_size;

uniform mat4 u_viewProjection;
uniform mat4 u_view;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraUp;
uniform vec3 u_cameraRight;
uniform bool u_is2D;

out vec4 v_color;
out vec2 v_local;

void main() {
  float radius = max(1.0, a_size) * 0.5;
  vec3 right = u_cameraRight;
  vec3 up = u_cameraUp;
  if (u_is2D) {
    right = normalize(right);
    up = normalize(up);
  } else {
    vec3 viewDir = u_cameraPosition - a_position.xyz;
    float viewLen = length(viewDir);
    viewDir = viewLen > 1e-5 ? viewDir / viewLen : vec3(0.0, 0.0, 1.0);
    right = u_cameraRight - viewDir * dot(u_cameraRight, viewDir);
    float rightLen = length(right);
    right = rightLen > 1e-5 ? right / rightLen : normalize(cross(u_cameraUp, viewDir));
    up = normalize(cross(viewDir, right));
  }
  vec3 world = a_position.xyz + (right * a_corner.x + up * a_corner.y) * radius;
  gl_Position = u_viewProjection * vec4(world, 1.0);
  v_color = a_color;
  v_local = a_corner;
}`;

export const NODE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision highp float;

in vec4 v_color;
in vec2 v_local;
out vec4 fragColor;

void main() {
  float dist = length(v_local);
  if (dist > 1.0) {
    discard;
  }
  fragColor = v_color;
}`;

export const EDGE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec4 a_start;
layout (location = 1) in vec4 a_end;
layout (location = 2) in vec4 a_color;

uniform mat4 u_viewProjection;

out vec4 v_color;

void main() {
  bool isEnd = (gl_VertexID & 1) == 1;
  vec3 pos = isEnd ? a_end.xyz : a_start.xyz;
  gl_Position = u_viewProjection * vec4(pos, 1.0);
  v_color = a_color;
}`;

export const EDGE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}`;
