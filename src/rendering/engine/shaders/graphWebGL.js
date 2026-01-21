export function createGraphWebGLSources(stateSlots = 4, options = {}) {
  const STATE_SLOTS = Math.max(0, Math.min(32, Math.floor(Number(stateSlots) || 0)));

  const nodeOptions = options?.node && typeof options.node === 'object' ? options.node : {};
  const edgeOptions = options?.edge && typeof options.edge === 'object' ? options.edge : {};

  // Back-compat: previous API used a single toggle for outline width + outline color as attributes.
  if (options?.useNodeOutlineAttributes === true) {
    if (nodeOptions.outline == null) nodeOptions.outline = 'attribute';
    if (nodeOptions.outlineColor == null) nodeOptions.outlineColor = 'attribute';
  }

  const useNodeColorAttribute = nodeOptions.color !== 'uniform';
  const useNodeSizeAttribute = nodeOptions.size !== 'uniform';
  const useNodeOutlineWidthAttribute = nodeOptions.outline !== 'uniform';
  const useNodeOutlineColorAttribute = nodeOptions.outlineColor !== 'uniform';

  const useEdgeColorAttribute = edgeOptions.color !== 'uniform';
  const useEdgeWidthAttribute = edgeOptions.width !== 'uniform';
  const useEdgeOpacityAttribute = edgeOptions.opacity !== 'uniform';
  const useEdgeEndpointSizeAttribute = edgeOptions.endpointSize !== 'uniform';

  const NODE_VERTEX_COLOR_DECL = useNodeColorAttribute
    ? /* glsl */ 'layout (location = 2) in vec4 a_color;\n'
    : /* glsl */ 'uniform vec4 u_nodeColor;\n';
  const NODE_VERTEX_COLOR_EXPR = useNodeColorAttribute ? 'a_color' : 'u_nodeColor';

  const NODE_VERTEX_SIZE_DECL = useNodeSizeAttribute
    ? /* glsl */ 'layout (location = 3) in float a_size;\n'
    : /* glsl */ 'uniform float u_nodeSize;\n';
  const NODE_VERTEX_SIZE_EXPR = useNodeSizeAttribute ? 'a_size' : 'u_nodeSize';

  const NODE_VERTEX_OUTLINE_WIDTH_DECL = useNodeOutlineWidthAttribute
    ? /* glsl */ 'layout (location = 5) in float a_outline;\n'
    : /* glsl */ 'uniform float u_nodeOutline;\n';
  const NODE_VERTEX_OUTLINE_RAW_EXPR = useNodeOutlineWidthAttribute ? 'a_outline' : 'u_nodeOutline';

  const NODE_VERTEX_OUTLINE_COLOR_DECL = useNodeOutlineColorAttribute
    ? /* glsl */ 'layout (location = 6) in vec4 a_outlineColor;\n'
    : '';
  const NODE_VERTEX_OUTLINE_COLOR_EXPR = useNodeOutlineColorAttribute ? 'a_outlineColor' : 'u_outlineColor';

  const NODE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_corner;
layout (location = 1) in vec3 a_position;
layout (location = 4) in uint a_state;
${NODE_VERTEX_COLOR_DECL}${NODE_VERTEX_SIZE_DECL}${NODE_VERTEX_OUTLINE_WIDTH_DECL}${NODE_VERTEX_OUTLINE_COLOR_DECL}

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
	uniform uint u_hoverNodeIndex;
	uniform uint u_hoverNodeState;
	uniform vec4 u_nodeNoStateScale; // x=sizeMul y=opacityMul z=outlineMul w=discard(>0.5)
	uniform vec4 u_nodeNoStateColorMul;
	uniform vec4 u_nodeNoStateColorAdd;
	uniform vec4 u_nodeStateScale[${STATE_SLOTS}]; // x=sizeMul y=opacityMul z=outlineMul w=discard(>0.5)
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
flat out uint v_discardFlag;

	void main() {
	  uint state = a_state;
	  if (u_hoverNodeIndex != 4294967295u && uint(gl_InstanceID) == u_hoverNodeIndex) {
	    state |= u_hoverNodeState;
	  }
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
	    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
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

  float baseSize = (u_nodeSizeBase + u_nodeSizeScale * ${NODE_VERTEX_SIZE_EXPR}) * sizeMul;
  float outlineWidth = max(0.0, (u_outlineWidthBase + u_outlineWidthScale * ${NODE_VERTEX_OUTLINE_RAW_EXPR}) * outlineMul);
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
  vec4 baseColorIn = ${NODE_VERTEX_COLOR_EXPR};
  vec3 rgb = clamp(baseColorIn.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  float alpha = clamp(u_nodeOpacityBase + u_nodeOpacityScale * baseColorIn.a, 0.0, 1.0) * opacityMul;
  v_color = vec4(rgb, clamp(alpha, 0.0, 1.0));
  vec4 outlineColorIn = ${NODE_VERTEX_OUTLINE_COLOR_EXPR};
  float outlineAlpha = clamp(u_nodeOpacityBase + u_nodeOpacityScale * outlineColorIn.a, 0.0, 1.0) * opacityMul;
  v_outlineColor = vec4(outlineColorIn.rgb, clamp(outlineAlpha, 0.0, 1.0));
  v_outlineThreshold = outlineWidth / max(fullSize, 1e-5);
  v_local = a_corner;
  v_centerWorld = a_position;
  v_rightWorld = right;
  v_upWorld = up;
  v_viewDir = viewDir;
  v_radius = radius;
}`;

  const NODE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
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
flat in uint v_discardFlag;

uniform mat4 u_viewProjection;
uniform bool u_is2D;

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

  const EDGE_WEIGHTED_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;

in vec4 v_color;
flat in uint v_discardFlag;
layout (location = 0) out vec4 fragAccum;
layout (location = 1) out vec4 fragWeight;

void main() {
  if (v_discardFlag != 0u) {
    discard;
  }
  float weight = v_color.a;
  fragAccum = vec4(v_color.rgb * weight, weight);
  fragWeight = vec4(weight, 0.0, 0.0, 0.0);
}`;

  const EDGE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec3 a_start;
layout (location = 1) in vec3 a_end;
${useEdgeColorAttribute ? 'layout (location = 2) in vec4 a_colorStart;\nlayout (location = 3) in vec4 a_colorEnd;\n' : 'uniform vec4 u_edgeColorStart;\nuniform vec4 u_edgeColorEnd;\n'}
${useEdgeWidthAttribute ? 'layout (location = 4) in vec2 a_width;\n' : 'uniform vec2 u_edgeWidth;\n'}
${useEdgeEndpointSizeAttribute ? 'layout (location = 5) in vec2 a_endpointSize;\n' : 'uniform vec2 u_edgeEndpointSize;\n'}
${useEdgeOpacityAttribute ? 'layout (location = 6) in vec2 a_opacity;\n' : 'uniform vec2 u_edgeOpacity;\n'}
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
	uniform uint u_hoverEdgeIndex;
	uniform uint u_hoverEdgeState;
	uniform vec4 u_nodeNoStateScale; // x=sizeMul used for endpoint sizes
	uniform vec4 u_nodeStateScale[${STATE_SLOTS}]; // x=sizeMul (used for endpoint sizes)
	uniform vec4 u_edgeNoStateScale; // x=widthMul y=opacityMul w=discard(>0.5)
	uniform vec4 u_edgeNoStateColorMul;
	uniform vec4 u_edgeNoStateColorAdd;
	uniform vec4 u_edgeStateScale[${STATE_SLOTS}]; // x=widthMul y=opacityMul w=discard(>0.5)
	uniform vec4 u_edgeStateColorMul[${STATE_SLOTS}];
	uniform vec4 u_edgeStateColorAdd[${STATE_SLOTS}];

out vec4 v_color;
flat out uint v_discardFlag;

	void main() {
	  uint state = a_state;
	  if (u_hoverEdgeIndex != 4294967295u && uint(gl_InstanceID) == u_hoverEdgeIndex) {
	    state |= u_hoverEdgeState;
	  }
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
	    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
	      float enabled = float((state >> uint(i)) & 1u);
	      vec4 scale = u_edgeStateScale[i];
	      widthMul *= mix(1.0, scale.x, enabled);
	      opacityMul *= mix(1.0, scale.y, enabled);
	      rgbMul *= mix(vec3(1.0), u_edgeStateColorMul[i].rgb, enabled);
	      rgbAdd += u_edgeStateColorAdd[i].rgb * enabled;
	      discardFlag |= uint((scale.w > 0.5) && (enabled > 0.5));
	    }
	  }
  v_discardFlag = discardFlag;

  float startSizeMul = 1.0;
  float endSizeMul = 1.0;
  if (a_endpointState.x == 0u) {
    startSizeMul *= u_nodeNoStateScale.x;
  } else {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabledStart = float((a_endpointState.x >> uint(i)) & 1u);
      float slotMul = u_nodeStateScale[i].x;
      startSizeMul *= mix(1.0, slotMul, enabledStart);
    }
  }
  if (a_endpointState.y == 0u) {
    endSizeMul *= u_nodeNoStateScale.x;
  } else {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabledEnd = float((a_endpointState.y >> uint(i)) & 1u);
      float slotMul = u_nodeStateScale[i].x;
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
  vec4 baseColor = isEnd
    ? ${useEdgeColorAttribute ? 'a_colorEnd' : 'u_edgeColorEnd'}
    : ${useEdgeColorAttribute ? 'a_colorStart' : 'u_edgeColorStart'};
  vec3 rgb = clamp(baseColor.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  vec4 color = vec4(rgb, baseColor.a);
  vec2 widthPair = ${useEdgeWidthAttribute ? 'a_width' : 'u_edgeWidth'};
  float width = (isEnd ? widthPair.y : widthPair.x) * widthMul;
  gl_Position = u_viewProjection * vec4(pos, 1.0);
  vec2 opacityPair = ${useEdgeOpacityAttribute ? 'a_opacity' : 'u_edgeOpacity'};
  float rawOpacity = isEnd ? opacityPair.y : opacityPair.x;
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * rawOpacity, 0.0, 1.0) * opacityMul;
  float alpha = clamp(opacity * color.a, 0.0, 1.0);
  v_color = vec4(color.rgb, alpha);
}`;

  const EDGE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;

in vec4 v_color;
flat in uint v_discardFlag;
out vec4 fragColor;

void main() {
  if (v_discardFlag != 0u) {
    discard;
  }
  fragColor = v_color;
}`;

  const EDGE_PREMUL_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
precision mediump float;

in vec4 v_color;
flat in uint v_discardFlag;
out vec4 fragColor;

void main() {
  if (v_discardFlag != 0u) {
    discard;
  }
  fragColor = vec4(v_color.rgb * v_color.a, v_color.a);
}`;

  const EDGE_PREMUL_QUAD_FRAGMENT_SOURCE = EDGE_PREMUL_FRAGMENT_SOURCE;

  const EDGE_QUAD_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_corner;
layout (location = 1) in vec3 a_start;
layout (location = 2) in vec3 a_end;
${useEdgeWidthAttribute ? 'layout (location = 3) in vec2 a_width;\n' : 'uniform vec2 u_edgeWidth;\n'}
${useEdgeColorAttribute ? 'layout (location = 4) in vec4 a_colorStart;\nlayout (location = 5) in vec4 a_colorEnd;\n' : 'uniform vec4 u_edgeColorStart;\nuniform vec4 u_edgeColorEnd;\n'}
${useEdgeEndpointSizeAttribute ? 'layout (location = 6) in vec2 a_endpointSize;\n' : 'uniform vec2 u_edgeEndpointSize;\n'}
${useEdgeOpacityAttribute ? 'layout (location = 7) in vec2 a_opacity;\n' : 'uniform vec2 u_edgeOpacity;\n'}
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
	uniform uint u_hoverEdgeIndex;
	uniform uint u_hoverEdgeState;
	uniform vec4 u_nodeNoStateScale; // x=sizeMul used for endpoint sizes
	uniform vec4 u_nodeStateScale[${STATE_SLOTS}]; // x=sizeMul (used for endpoint sizes)
	uniform vec4 u_edgeNoStateScale; // x=widthMul y=opacityMul w=discard(>0.5)
	uniform vec4 u_edgeNoStateColorMul;
	uniform vec4 u_edgeNoStateColorAdd;
	uniform vec4 u_edgeStateScale[${STATE_SLOTS}]; // x=widthMul y=opacityMul w=discard(>0.5)
	uniform vec4 u_edgeStateColorMul[${STATE_SLOTS}];
	uniform vec4 u_edgeStateColorAdd[${STATE_SLOTS}];

out vec4 v_color;
flat out uint v_discardFlag;

	void main() {
	  uint state = a_state;
	  if (u_hoverEdgeIndex != 4294967295u && uint(gl_InstanceID) == u_hoverEdgeIndex) {
	    state |= u_hoverEdgeState;
	  }
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
	    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
	      float enabled = float((state >> uint(i)) & 1u);
	      vec4 scale = u_edgeStateScale[i];
	      widthMul *= mix(1.0, scale.x, enabled);
	      opacityMul *= mix(1.0, scale.y, enabled);
	      rgbMul *= mix(vec3(1.0), u_edgeStateColorMul[i].rgb, enabled);
	      rgbAdd += u_edgeStateColorAdd[i].rgb * enabled;
	      discardFlag |= uint((scale.w > 0.5) && (enabled > 0.5));
	    }
	  }
  v_discardFlag = discardFlag;

  float startSizeMul = 1.0;
  float endSizeMul = 1.0;
  if (a_endpointState.x == 0u) {
    startSizeMul *= u_nodeNoStateScale.x;
  } else {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabledStart = float((a_endpointState.x >> uint(i)) & 1u);
      float slotMul = u_nodeStateScale[i].x;
      startSizeMul *= mix(1.0, slotMul, enabledStart);
    }
  }
  if (a_endpointState.y == 0u) {
    endSizeMul *= u_nodeNoStateScale.x;
  } else {
    for (int i = 0; i < ${STATE_SLOTS}; i += 1) {
      float enabledEnd = float((a_endpointState.y >> uint(i)) & 1u);
      float slotMul = u_nodeStateScale[i].x;
      endSizeMul *= mix(1.0, slotMul, enabledEnd);
    }
  }

  vec3 dir = a_end - a_start;
  float dirLenWorld = max(length(dir), 1e-5);
  vec3 dirN = dir / dirLenWorld;
  vec2 endpointSizePair = ${useEdgeEndpointSizeAttribute ? 'a_endpointSize' : 'u_edgeEndpointSize'};
  float startRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.x, 0.0) * 0.5 * startSizeMul;
  float endRadius = max(u_nodeSizeBase + u_nodeSizeScale * endpointSizePair.y, 0.0) * 0.5 * endSizeMul;
  float trimStart = startRadius * u_edgeEndpointTrim;
  float trimEnd = endRadius * u_edgeEndpointTrim;
  vec3 startPos = a_start + dirN * trimStart;
  vec3 endPos = a_end - dirN * trimEnd;

  float segmentMix = clamp(a_corner.x, 0.0, 1.0);
  vec2 widthPair = ${useEdgeWidthAttribute ? 'a_width' : 'u_edgeWidth'};
  float width = max((u_edgeWidthBase + u_edgeWidthScale * mix(widthPair.x, widthPair.y, segmentMix)) * widthMul, 0.0);
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
  vec4 colorStart = ${useEdgeColorAttribute ? 'a_colorStart' : 'u_edgeColorStart'};
  vec4 colorEnd = ${useEdgeColorAttribute ? 'a_colorEnd' : 'u_edgeColorEnd'};
  vec4 blended = mix(colorStart, colorEnd, segmentMix);
  vec3 rgb = clamp(blended.rgb * rgbMul + rgbAdd, 0.0, 1.0);
  vec2 opacityPair = ${useEdgeOpacityAttribute ? 'a_opacity' : 'u_edgeOpacity'};
  float opacity = clamp(u_edgeOpacityBase + u_edgeOpacityScale * mix(opacityPair.x, opacityPair.y, segmentMix), 0.0, 1.0) * opacityMul;
  float alpha = clamp(opacity * blended.a, 0.0, 1.0);
  v_color = vec4(rgb, alpha);
}`;

  const EDGE_QUAD_FRAGMENT_SOURCE = EDGE_FRAGMENT_SOURCE;
  const EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE = EDGE_WEIGHTED_FRAGMENT_SOURCE;

  const EDGE_RESOLVE_VERTEX_SOURCE = /* glsl */ `#version 300 es
layout (location = 0) in vec2 a_position;
layout (location = 1) in vec2 a_uv;
out vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}`;

  const EDGE_RESOLVE_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
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

  const EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
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
  vec3 tonemapped = resolved / (resolved + vec3(1.0));
  float alpha = clamp(weight, 0.0, 1.0);
  fragColor = vec4(tonemapped, alpha);
}`;

  const EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE = /* glsl */ `#version 300 es
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
  vec3 tonemapped = boosted / (boosted + vec3(1.0));
  float alpha = clamp(weight, 0.0, 1.0);
  fragColor = vec4(tonemapped, alpha);
}`;

  return {
    NODE_VERTEX_SOURCE,
    NODE_FRAGMENT_SOURCE,
    EDGE_VERTEX_SOURCE,
    EDGE_FRAGMENT_SOURCE,
    EDGE_PREMUL_FRAGMENT_SOURCE,
    EDGE_QUAD_VERTEX_SOURCE,
    EDGE_QUAD_FRAGMENT_SOURCE,
    EDGE_PREMUL_QUAD_FRAGMENT_SOURCE,
    EDGE_WEIGHTED_FRAGMENT_SOURCE,
    EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE,
    EDGE_RESOLVE_VERTEX_SOURCE,
    EDGE_RESOLVE_FRAGMENT_SOURCE,
    EDGE_RESOLVE_TONEMAP_FRAGMENT_SOURCE,
    EDGE_RESOLVE_BOOST_FRAGMENT_SOURCE,
  };
}
