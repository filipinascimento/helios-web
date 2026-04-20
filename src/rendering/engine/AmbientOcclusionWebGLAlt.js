import { invertMat4, resolveContextViewport } from './AmbientOcclusionCommon.js';
import { normalizeAmbientOcclusionMode } from './AmbientOcclusionMode.js';
import { getAmbientOcclusionQualityPreset } from './AmbientOcclusionQuality.js';

function formatFloat(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.0';
  const fixed = numeric.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  return fixed.includes('.') ? fixed : `${fixed}.0`;
}

function createSmoothAoFragmentSource(preset) {
  const kernel = preset.smoothKernel
    .map(([x, y]) => `  vec2(${formatFloat(x)}, ${formatFloat(y)})`)
    .join(',\n');
  return `#version 300 es
precision highp float;

in vec2 v_uv;

uniform mat4 u_invViewProjection;
uniform vec4 u_sizes;
uniform vec4 u_params;
uniform vec3 u_cameraPosition;
uniform sampler2D u_depthTex;

out vec4 fragColor;

const int SAMPLE_COUNT = ${preset.smoothSampleCount};
const vec2 KERNEL[SAMPLE_COUNT] = vec2[SAMPLE_COUNT](
${kernel}
);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + vec3(33.33));
  return fract((p3.x + p3.y) * p3.z);
}

ivec2 fullSize() {
  return ivec2(int(u_sizes.x), int(u_sizes.y));
}

ivec2 aoSize() {
  return ivec2(int(u_sizes.z), int(u_sizes.w));
}

float readDepthFromUv(vec2 uv) {
  ivec2 size = fullSize();
  ivec2 px = clamp(ivec2(vec2(size) * clamp(uv, vec2(0.0), vec2(1.0))), ivec2(0), size - ivec2(1));
  return texelFetch(u_depthTex, px, 0).r;
}

vec3 reconstructWorld(vec2 uv, float depth) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = u_invViewProjection * clip;
  return world.xyz / max(world.w, 1e-6);
}

vec3 reconstructNormal(vec2 uv, vec3 center) {
  vec2 texel = vec2(1.0 / max(u_sizes.x, 1.0), 1.0 / max(u_sizes.y, 1.0));
  vec3 px = reconstructWorld(uv + vec2(texel.x, 0.0), readDepthFromUv(uv + vec2(texel.x, 0.0)));
  vec3 py = reconstructWorld(uv + vec2(0.0, texel.y), readDepthFromUv(uv + vec2(0.0, texel.y)));
  vec3 dx = px - center;
  vec3 dy = py - center;
  vec3 n = cross(dx, dy);
  float lenN = length(n);
  if (!(lenN > 1e-6)) {
    return vec3(0.0, 0.0, 1.0);
  }
  n /= lenN;
  vec3 viewDir = normalize(u_cameraPosition - center);
  if (dot(n, viewDir) < 0.0) {
    n = -n;
  }
  return n;
}

void main() {
  vec2 pixel = gl_FragCoord.xy - vec2(0.5);
  vec2 uv = gl_FragCoord.xy / vec2(aoSize());
  float centerDepth = readDepthFromUv(uv);
  if (centerDepth >= 0.999999) {
    fragColor = vec4(1.0);
    return;
  }

  vec3 center = reconstructWorld(uv, centerDepth);
  vec3 normal = reconstructNormal(uv, center);
  vec2 fullTexel = vec2(1.0 / max(u_sizes.x, 1.0), 1.0 / max(u_sizes.y, 1.0));
  float radius = max(u_params.x, 1.0);
  float bias = max(u_params.y, 0.0);
  float angle = hash12(pixel + center.xy) * 6.28318530718;
  mat2 rot = mat2(
    vec2(cos(angle), sin(angle)),
    vec2(-sin(angle), cos(angle))
  );

  float occlusion = 0.0;
  float weightSum = 0.0;
  for (int i = 0; i < SAMPLE_COUNT; i += 1) {
    vec2 offset = rot * KERNEL[i] * (radius * fullTexel);
    vec2 sampleUv = clamp(uv + offset, vec2(0.0), vec2(1.0));
    float sampleDepth = readDepthFromUv(sampleUv);
    if (sampleDepth >= 0.999999) {
      continue;
    }
    vec3 samplePos = reconstructWorld(sampleUv, sampleDepth);
    vec3 delta = samplePos - center;
    float distanceSq = max(dot(delta, delta), 1e-5);
    vec3 deltaDir = normalize(delta);
    float angular = max(dot(normal, deltaDir) - bias, 0.0);
    float attenuation = 1.0 / (1.0 + distanceSq * 0.2);
    occlusion += angular * attenuation;
    weightSum += attenuation;
  }

  float ao = 1.0;
  if (weightSum > 1e-5) {
    ao = clamp(1.0 - (occlusion / weightSum) * ${formatFloat(preset.occlusionScale)}, 0.0, 1.0);
  }
  fragColor = vec4(vec3(ao), 1.0);
}`;
}

function createAltAoFragmentSource(preset) {
  const kernel = preset.altKernel
    .map(([x, y, z]) => `  vec3(${formatFloat(x)}, ${formatFloat(y)}, ${formatFloat(z)})`)
    .join(',\n');
  return `#version 300 es
precision highp float;

in vec2 v_uv;

uniform mat4 u_invViewProjection;
uniform mat4 u_viewProjection;
uniform mat4 u_view;
uniform vec4 u_sizes;
uniform vec4 u_params;
uniform vec4 u_altParams;
uniform vec3 u_cameraPosition;
uniform sampler2D u_depthTex;

out vec4 fragColor;

const int SAMPLE_COUNT = ${preset.altSampleCount};
const vec3 KERNEL[SAMPLE_COUNT] = vec3[SAMPLE_COUNT](
${kernel}
);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + vec3(33.33));
  return fract((p3.x + p3.y) * p3.z);
}

ivec2 fullSize() {
  return ivec2(int(u_sizes.x), int(u_sizes.y));
}

ivec2 aoSize() {
  return ivec2(int(u_sizes.z), int(u_sizes.w));
}

float readDepthFromUv(vec2 uv) {
  ivec2 size = fullSize();
  ivec2 px = clamp(ivec2(vec2(size) * clamp(uv, vec2(0.0), vec2(1.0))), ivec2(0), size - ivec2(1));
  return texelFetch(u_depthTex, px, 0).r;
}

vec3 reconstructWorld(vec2 uv, float depth) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = u_invViewProjection * clip;
  return world.xyz / max(world.w, 1e-6);
}

vec3 reconstructNormal(vec2 uv, vec3 center) {
  vec2 texel = vec2(1.0 / max(u_sizes.x, 1.0), 1.0 / max(u_sizes.y, 1.0));
  vec3 px = reconstructWorld(uv + vec2(texel.x, 0.0), readDepthFromUv(uv + vec2(texel.x, 0.0)));
  vec3 py = reconstructWorld(uv + vec2(0.0, texel.y), readDepthFromUv(uv + vec2(0.0, texel.y)));
  vec3 dx = px - center;
  vec3 dy = py - center;
  vec3 n = cross(dx, dy);
  float lenN = length(n);
  if (!(lenN > 1e-6)) {
    return vec3(0.0, 0.0, 1.0);
  }
  n /= lenN;
  vec3 viewDir = normalize(u_cameraPosition - center);
  if (dot(n, viewDir) < 0.0) {
    n = -n;
  }
  return n;
}

vec3 orthogonal(vec3 normal) {
  if (abs(normal.z) < 0.999) {
    return normalize(cross(normal, vec3(0.0, 0.0, 1.0)));
  }
  return normalize(cross(normal, vec3(0.0, 1.0, 0.0)));
}

vec3 worldToView(vec3 world) {
  return (u_view * vec4(world, 1.0)).xyz;
}

void main() {
  vec2 pixel = gl_FragCoord.xy - vec2(0.5);
  vec2 uv = gl_FragCoord.xy / vec2(aoSize());
  float centerDepth = readDepthFromUv(uv);
  if (centerDepth >= 0.999999) {
    fragColor = vec4(1.0);
    return;
  }

  vec3 center = reconstructWorld(uv, centerDepth);
  vec3 centerView = worldToView(center);
  vec3 normal = reconstructNormal(uv, center);
  vec2 fullTexel = vec2(1.0 / max(u_sizes.x, 1.0), 1.0 / max(u_sizes.y, 1.0));
  vec3 px = reconstructWorld(uv + vec2(fullTexel.x, 0.0), readDepthFromUv(uv + vec2(fullTexel.x, 0.0)));
  vec3 py = reconstructWorld(uv + vec2(0.0, fullTexel.y), readDepthFromUv(uv + vec2(0.0, fullTexel.y)));
  float pixelWorld = max(0.5 * (length(px - center) + length(py - center)), 1e-4);
  float worldRadius = max(u_params.x, 1.0) * pixelWorld;
  float bias = max(u_params.y, 0.0);

  float angle = hash12(pixel + center.xy) * 6.28318530718;
  vec3 randomVec = vec3(cos(angle), sin(angle), 0.0);
  vec3 tangent = randomVec - normal * dot(randomVec, normal);
  float tangentLength = length(tangent);
  if (!(tangentLength > 1e-6)) {
    tangent = orthogonal(normal);
  } else {
    tangent /= tangentLength;
  }
  vec3 bitangent = normalize(cross(normal, tangent));
  mat3 tbn = mat3(tangent, bitangent, normal);

  float occlusion = 0.0;
  for (int i = 0; i < SAMPLE_COUNT; i += 1) {
    vec3 sampleWorld = center + (tbn * KERNEL[i]) * worldRadius;
    vec4 sampleClip = u_viewProjection * vec4(sampleWorld, 1.0);
    if (!(sampleClip.w > 1e-6)) {
      continue;
    }
    vec3 sampleNdc = sampleClip.xyz / sampleClip.w;
    vec2 sampleUv = sampleNdc.xy * 0.5 + 0.5;
    if (any(lessThan(sampleUv, vec2(0.0))) || any(greaterThan(sampleUv, vec2(1.0)))) {
      continue;
    }
    float sampleDepth = readDepthFromUv(sampleUv);
    if (sampleDepth >= 0.999999) {
      continue;
    }
    vec3 occluderWorld = reconstructWorld(sampleUv, sampleDepth);
    vec3 occluderView = worldToView(occluderWorld);
    vec3 sampleView = worldToView(sampleWorld);
    float rangeCheck = smoothstep(0.0, 1.0, worldRadius / max(abs(centerView.z - occluderView.z), 1e-4));
    float blocked = occluderView.z >= sampleView.z + bias ? 1.0 : 0.0;
    occlusion += blocked * rangeCheck;
  }

  float occ = occlusion / float(SAMPLE_COUNT);
  float ao = 1.0 - clamp((occ - u_altParams.y) * u_altParams.x, 0.0, 1.0);
  fragColor = vec4(vec3(ao), 1.0);
}`;
}

function createBlurFragmentSource(preset) {
  const radius = preset.blurRadius;
  const weights = preset.blurWeights.map((value) => formatFloat(value)).join(', ');
  return `#version 300 es
precision highp float;

in vec2 v_uv;

uniform vec4 u_sizes;
uniform vec4 u_params;
uniform vec2 u_direction;
uniform sampler2D u_depthTex;
uniform sampler2D u_aoTex;

out vec4 fragColor;

const int BLUR_RADIUS = ${radius};
const float BLUR_WEIGHTS[${radius + 1}] = float[${radius + 1}](${weights});

ivec2 fullSize() {
  return ivec2(int(u_sizes.x), int(u_sizes.y));
}

ivec2 aoSize() {
  return ivec2(int(u_sizes.z), int(u_sizes.w));
}

float readDepthFromUv(vec2 uv) {
  ivec2 size = fullSize();
  ivec2 px = clamp(ivec2(vec2(size) * clamp(uv, vec2(0.0), vec2(1.0))), ivec2(0), size - ivec2(1));
  return texelFetch(u_depthTex, px, 0).r;
}

float readAo(ivec2 coord) {
  ivec2 size = aoSize();
  ivec2 clamped = clamp(coord, ivec2(0), size - ivec2(1));
  return texelFetch(u_aoTex, clamped, 0).r;
}

void main() {
  ivec2 size = aoSize();
  ivec2 coord = clamp(ivec2(gl_FragCoord.xy - vec2(0.5)), ivec2(0), size - ivec2(1));
  vec2 uv = gl_FragCoord.xy / vec2(size);
  float centerDepth = readDepthFromUv(uv);
  float sum = readAo(coord) * BLUR_WEIGHTS[0];
  float weightSum = BLUR_WEIGHTS[0];
  for (int i = 1; i <= BLUR_RADIUS; i += 1) {
    float spatial = BLUR_WEIGHTS[i];
    ivec2 delta = ivec2(round(u_direction * float(i)));
    ivec2 coordA = coord + delta;
    ivec2 coordB = coord - delta;
    vec2 uvA = (vec2(coordA) + 0.5) / vec2(size);
    vec2 uvB = (vec2(coordB) + 0.5) / vec2(size);
    float depthA = readDepthFromUv(uvA);
    float depthB = readDepthFromUv(uvB);
    float weightA = spatial * exp(-abs(depthA - centerDepth) * u_params.z);
    float weightB = spatial * exp(-abs(depthB - centerDepth) * u_params.z);
    sum += readAo(coordA) * weightA;
    sum += readAo(coordB) * weightB;
    weightSum += weightA + weightB;
  }
  float ao = sum / max(weightSum, 1e-5);
  fragColor = vec4(vec3(ao), 1.0);
}`;
}

const FULLSCREEN_VERTEX_SOURCE = `#version 300 es
layout (location = 0) in vec2 a_position;
layout (location = 1) in vec2 a_uv;

out vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}`;

const COMPOSITE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_aoTex;
uniform float u_strength;

out vec4 fragColor;

void main() {
  float ao = texture(u_aoTex, v_uv).r;
  float alpha = clamp((1.0 - ao) * u_strength, 0.0, 1.0);
  fragColor = vec4(0.0, 0.0, 0.0, alpha);
}`;

function createTexture(gl, width, height, internalFormat, format, type, filter = gl.LINEAR) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);
  return texture;
}

function deleteFramebuffer(gl, framebuffer) {
  if (framebuffer) gl.deleteFramebuffer(framebuffer);
}

function deleteTexture(gl, texture) {
  if (texture) gl.deleteTexture(texture);
}

export class AmbientOcclusionWebGLAlt {
  constructor(device) {
    this.device = device;
    this.gl = device?.gl ?? null;
    this.prepassFramebuffer = null;
    this.prepassColor = null;
    this.prepassDepth = null;
    this.aoRawFramebuffer = null;
    this.aoRaw = null;
    this.aoPingFramebuffer = null;
    this.aoPing = null;
    this.aoPongFramebuffer = null;
    this.aoPong = null;
    this.fullSize = { width: 0, height: 0 };
    this.aoSize = { width: 0, height: 0 };
    this.aoPrograms = new Map();
    this.blurPrograms = new Map();
    this.compositeProgram = null;
    this.fullscreenVao = null;
    this.fullscreenBuffer = null;
    this._ownedPrograms = new Set();
    this.invViewProjection = new Float32Array(16);
  }

  destroy() {
    const { gl } = this;
    if (!gl) return;
    this.destroyTargets();
    for (const program of this._ownedPrograms) {
      gl.deleteProgram(program);
    }
    this._ownedPrograms.clear();
    this.aoPrograms.clear();
    this.blurPrograms.clear();
    this.compositeProgram = null;
    if (this.fullscreenVao) gl.deleteVertexArray(this.fullscreenVao);
    if (this.fullscreenBuffer) gl.deleteBuffer(this.fullscreenBuffer);
    this.fullscreenVao = null;
    this.fullscreenBuffer = null;
  }

  destroyTargets() {
    const { gl } = this;
    if (!gl) return;
    deleteFramebuffer(gl, this.prepassFramebuffer);
    deleteTexture(gl, this.prepassColor);
    deleteTexture(gl, this.prepassDepth);
    deleteFramebuffer(gl, this.aoRawFramebuffer);
    deleteTexture(gl, this.aoRaw);
    deleteFramebuffer(gl, this.aoPingFramebuffer);
    deleteTexture(gl, this.aoPing);
    deleteFramebuffer(gl, this.aoPongFramebuffer);
    deleteTexture(gl, this.aoPong);
    this.prepassFramebuffer = null;
    this.prepassColor = null;
    this.prepassDepth = null;
    this.aoRawFramebuffer = null;
    this.aoRaw = null;
    this.aoPingFramebuffer = null;
    this.aoPing = null;
    this.aoPongFramebuffer = null;
    this.aoPong = null;
    this.fullSize = { width: 0, height: 0 };
    this.aoSize = { width: 0, height: 0 };
  }

  ensureFullscreenGeometry() {
    const { gl } = this;
    if (!gl || this.fullscreenVao) return;
    this.fullscreenVao = gl.createVertexArray();
    this.fullscreenBuffer = gl.createBuffer();
    gl.bindVertexArray(this.fullscreenVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fullscreenBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  createProgram(fragmentSource, uniformNames) {
    const program = this.device.createProgram(FULLSCREEN_VERTEX_SOURCE, fragmentSource);
    const uniforms = {};
    for (const name of uniformNames) {
      uniforms[name] = this.gl.getUniformLocation(program, name);
    }
    this._ownedPrograms.add(program);
    return { program, uniforms };
  }

  ensurePrograms(mode, quality) {
    this.ensureFullscreenGeometry();
    const aoKey = `${mode}|${quality.key}`;
    if (!this.aoPrograms.has(aoKey)) {
      this.aoPrograms.set(
        aoKey,
        this.createProgram(
          mode === 'fast' ? createAltAoFragmentSource(quality) : createSmoothAoFragmentSource(quality),
          [
            'u_invViewProjection',
            'u_viewProjection',
            'u_view',
            'u_sizes',
            'u_params',
            'u_altParams',
            'u_cameraPosition',
            'u_depthTex',
          ],
        ),
      );
    }
    if (!this.blurPrograms.has(quality.key)) {
      this.blurPrograms.set(
        quality.key,
        this.createProgram(createBlurFragmentSource(quality), [
          'u_sizes',
          'u_params',
          'u_direction',
          'u_depthTex',
          'u_aoTex',
        ]),
      );
    }
    if (!this.compositeProgram) {
      this.compositeProgram = this.createProgram(COMPOSITE_FRAGMENT_SOURCE, ['u_aoTex', 'u_strength']);
    }
    return true;
  }

  ensureTargets(width, height, quality) {
    const { gl } = this;
    if (!gl) return false;
    const fullWidth = Math.max(1, Math.floor(width));
    const fullHeight = Math.max(1, Math.floor(height));
    const aoWidth = Math.max(1, Math.round(fullWidth * quality.resolutionScale));
    const aoHeight = Math.max(1, Math.round(fullHeight * quality.resolutionScale));
    const recreateFull = this.fullSize.width !== fullWidth || this.fullSize.height !== fullHeight;
    const recreateAo = this.aoSize.width !== aoWidth || this.aoSize.height !== aoHeight;

    if (recreateFull) {
      deleteFramebuffer(gl, this.prepassFramebuffer);
      deleteTexture(gl, this.prepassColor);
      deleteTexture(gl, this.prepassDepth);

      this.prepassFramebuffer = gl.createFramebuffer();
      this.prepassColor = createTexture(gl, fullWidth, fullHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
      this.prepassDepth = createTexture(
        gl,
        fullWidth,
        fullHeight,
        gl.DEPTH_COMPONENT24,
        gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.prepassFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.prepassColor, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.prepassDepth, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn('AmbientOcclusionWebGLAlt: prepass framebuffer incomplete.', status);
        this.destroyTargets();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return false;
      }
      this.fullSize = { width: fullWidth, height: fullHeight };
    }

    if (recreateAo) {
      deleteFramebuffer(gl, this.aoRawFramebuffer);
      deleteTexture(gl, this.aoRaw);
      deleteFramebuffer(gl, this.aoPingFramebuffer);
      deleteTexture(gl, this.aoPing);
      deleteFramebuffer(gl, this.aoPongFramebuffer);
      deleteTexture(gl, this.aoPong);

      this.aoRawFramebuffer = gl.createFramebuffer();
      this.aoRaw = createTexture(gl, aoWidth, aoHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoRawFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.aoRaw, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn('AmbientOcclusionWebGLAlt: raw AO framebuffer incomplete.');
        this.destroyTargets();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return false;
      }

      this.aoPingFramebuffer = gl.createFramebuffer();
      this.aoPing = createTexture(gl, aoWidth, aoHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoPingFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.aoPing, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn('AmbientOcclusionWebGLAlt: ping AO framebuffer incomplete.');
        this.destroyTargets();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return false;
      }

      this.aoPongFramebuffer = gl.createFramebuffer();
      this.aoPong = createTexture(gl, aoWidth, aoHeight, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoPongFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.aoPong, 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn('AmbientOcclusionWebGLAlt: pong AO framebuffer incomplete.');
        this.destroyTargets();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return false;
      }

      this.aoSize = { width: aoWidth, height: aoHeight };
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  setAoUniforms(uniforms, cameraUniforms, strength, radius, bias, quality, intensityScale, intensityShift) {
    const { gl } = this;
    if (!gl || !invertMat4(this.invViewProjection, cameraUniforms?.viewProjection)) {
      return false;
    }
    gl.uniformMatrix4fv(uniforms.u_invViewProjection, false, this.invViewProjection);
    if (uniforms.u_viewProjection) {
      gl.uniformMatrix4fv(uniforms.u_viewProjection, false, cameraUniforms?.viewProjection ?? this.invViewProjection);
    }
    if (uniforms.u_view) {
      gl.uniformMatrix4fv(uniforms.u_view, false, cameraUniforms?.view ?? this.invViewProjection);
    }
    if (uniforms.u_cameraPosition) {
      gl.uniform3f(
        uniforms.u_cameraPosition,
        cameraUniforms?.position?.[0] ?? 0,
        cameraUniforms?.position?.[1] ?? 0,
        cameraUniforms?.position?.[2] ?? 1,
      );
    }
    gl.uniform4f(uniforms.u_sizes, this.fullSize.width, this.fullSize.height, this.aoSize.width, this.aoSize.height);
    gl.uniform4f(
      uniforms.u_params,
      Math.max(1, Number(radius) || 1),
      Math.max(0, Number(bias) || 0),
      quality.depthSharpness,
      Math.max(0, Number(strength) || 0),
    );
    if (uniforms.u_altParams) {
      gl.uniform4f(
        uniforms.u_altParams,
        Math.max(0, Number(intensityScale) || 0),
        Math.max(0, Number(intensityShift) || 0),
        0,
        0,
      );
    }
    return true;
  }

  drawFullscreen() {
    this.gl.bindVertexArray(this.fullscreenVao);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  render(context, options = {}) {
    const { gl } = this;
    if (!gl) return false;
    const requestedMode = normalizeAmbientOcclusionMode(options.mode);
    const quality = getAmbientOcclusionQualityPreset(options.quality);
    const viewport = resolveContextViewport(
      context,
      context?.target?.width ?? gl.canvas?.width ?? 1,
      context?.target?.height ?? gl.canvas?.height ?? 1,
    );
    if (!this.ensurePrograms(requestedMode, quality)) return false;
    if (!this.ensureTargets(viewport.width, viewport.height, quality)) return false;

    const aoEntry = this.aoPrograms.get(`${requestedMode}|${quality.key}`);
    const blurEntry = this.blurPrograms.get(quality.key);
    const compositeEntry = this.compositeProgram;
    if (!aoEntry?.program || !blurEntry?.program || !compositeEntry?.program) return false;
    gl.useProgram(aoEntry.program);
    if (!this.setAoUniforms(
      aoEntry.uniforms,
      options.cameraUniforms,
      options.strength,
      options.radius,
      options.bias,
      quality,
      options.intensityScale,
      options.intensityShift,
    )) {
      return false;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.prepassFramebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, viewport.width, viewport.height);
    gl.colorMask(true, true, true, true);
    gl.depthMask(true);
    gl.clearColor(1, 1, 1, 1);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    if (options.selection?.nodes) options.drawNodes?.({ depthOnly: true });
    if (options.selection?.edges) {
      options.drawEdges?.({
        depthOnly: true,
        weighted: false,
        passViewportWidth: viewport.width,
        passViewportHeight: viewport.height,
      });
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoRawFramebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(0, 0, this.aoSize.width, this.aoSize.height);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.BLEND);
    gl.useProgram(aoEntry.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.prepassDepth);
    gl.uniform1i(aoEntry.uniforms.u_depthTex, 0);
    this.drawFullscreen();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoPingFramebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.useProgram(blurEntry.program);
    gl.uniform4f(blurEntry.uniforms.u_sizes, this.fullSize.width, this.fullSize.height, this.aoSize.width, this.aoSize.height);
    gl.uniform4f(
      blurEntry.uniforms.u_params,
      Math.max(1, Number(options.radius) || 1),
      Math.max(0, Number(options.bias) || 0),
      quality.depthSharpness,
      Math.max(0, Number(options.strength) || 0),
    );
    gl.uniform2f(blurEntry.uniforms.u_direction, 1, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.prepassDepth);
    gl.uniform1i(blurEntry.uniforms.u_depthTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.aoRaw);
    gl.uniform1i(blurEntry.uniforms.u_aoTex, 1);
    this.drawFullscreen();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.aoPongFramebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.uniform2f(blurEntry.uniforms.u_direction, 0, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.aoPing);
    this.drawFullscreen();

    const outputFramebuffer = context.target?.handle ?? null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
    if (outputFramebuffer) gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    if (typeof gl.blendFuncSeparate === 'function') {
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    gl.colorMask(true, true, true, false);
    gl.useProgram(compositeEntry.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.aoPong);
    gl.uniform1i(compositeEntry.uniforms.u_aoTex, 0);
    gl.uniform1f(compositeEntry.uniforms.u_strength, Math.max(0, Number(options.strength) || 0));
    this.drawFullscreen();
    gl.colorMask(true, true, true, true);
    return true;
  }
}

export default AmbientOcclusionWebGLAlt;
