import { invertMat4, resolveContextViewport } from './AmbientOcclusionCommon.js';
import { normalizeAmbientOcclusionMode } from './AmbientOcclusionMode.js';
import { getAmbientOcclusionQualityPreset } from './AmbientOcclusionQuality.js';

function formatFloat(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.0';
  const fixed = numeric.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  return fixed.includes('.') ? fixed : `${fixed}.0`;
}

function createSmoothAoComputeSource(preset) {
  const kernel = preset.smoothKernel
    .map(([x, y]) => `  vec2<f32>(${formatFloat(x)}, ${formatFloat(y)})`)
    .join(',\n');
  return /* wgsl */ `
struct AmbientOcclusionSettings {
  invViewProjection : mat4x4<f32>,
  viewProjection : mat4x4<f32>,
  view : mat4x4<f32>,
  cameraPosition : vec4<f32>,
  sizes : vec4<f32>, // fullWidth, fullHeight, aoWidth, aoHeight
  params : vec4<f32>, // radius, bias, depthSharpness, strength
  altParams : vec4<f32>, // intensityScale, intensityShift, reserved, reserved
};

@group(0) @binding(0) var<uniform> settings : AmbientOcclusionSettings;
@group(0) @binding(1) var depthTex : texture_depth_2d;
@group(0) @binding(2) var aoOut : texture_storage_2d<rgba8unorm, write>;

const SAMPLE_COUNT : i32 = ${preset.smoothSampleCount};
const KERNEL : array<vec2<f32>, ${preset.smoothSampleCount}> = array<vec2<f32>, ${preset.smoothSampleCount}>(
${kernel}
);

fn hash12(p : vec2<f32>) -> f32 {
  let p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((q.x + q.y) * q.z);
}

fn fullSize() -> vec2<i32> {
  return vec2<i32>(i32(settings.sizes.x), i32(settings.sizes.y));
}

fn aoSize() -> vec2<i32> {
  return vec2<i32>(i32(settings.sizes.z), i32(settings.sizes.w));
}

fn readDepthFromUv(uv : vec2<f32>) -> f32 {
  let size = fullSize();
  let px = clamp(vec2<i32>(vec2<f32>(size) * uv), vec2<i32>(0), size - vec2<i32>(1));
  return textureLoad(depthTex, px, 0);
}

fn reconstructWorld(uv : vec2<f32>, depth : f32) -> vec3<f32> {
  let uvClip = vec2<f32>(uv.x, 1.0 - uv.y);
  let clip = vec4<f32>(uvClip * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  let world = settings.invViewProjection * clip;
  return world.xyz / max(world.w, 1e-6);
}

fn reconstructNormal(uv : vec2<f32>, centerDepth : f32, center : vec3<f32>) -> vec3<f32> {
  let texel = vec2<f32>(1.0 / settings.sizes.x, 1.0 / settings.sizes.y);
  let uvLeft = clamp(uv - vec2<f32>(texel.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0));
  let uvRight = clamp(uv + vec2<f32>(texel.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0));
  let uvDown = clamp(uv - vec2<f32>(0.0, texel.y), vec2<f32>(0.0), vec2<f32>(1.0));
  let uvUp = clamp(uv + vec2<f32>(0.0, texel.y), vec2<f32>(0.0), vec2<f32>(1.0));
  let depthLeft = readDepthFromUv(uvLeft);
  let depthRight = readDepthFromUv(uvRight);
  let depthDown = readDepthFromUv(uvDown);
  let depthUp = readDepthFromUv(uvUp);
  let pLeft = reconstructWorld(uvLeft, depthLeft);
  let pRight = reconstructWorld(uvRight, depthRight);
  let pDown = reconstructWorld(uvDown, depthDown);
  let pUp = reconstructWorld(uvUp, depthUp);
  var dx = center - pLeft;
  if (abs(depthRight - centerDepth) <= abs(centerDepth - depthLeft)) {
    dx = pRight - center;
  }
  var dy = center - pDown;
  if (abs(depthUp - centerDepth) <= abs(centerDepth - depthDown)) {
    dy = pUp - center;
  }
  var n = cross(dx, dy);
  let lenN = length(n);
  if (!(lenN > 1e-6)) {
    return vec3<f32>(0.0, 0.0, 1.0);
  }
  n = n / lenN;
  let viewDir = normalize(settings.cameraPosition.xyz - center);
  if (dot(n, viewDir) < 0.0) {
    n = -n;
  }
  return n;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let size = aoSize();
  if (i32(gid.x) >= size.x || i32(gid.y) >= size.y) {
    return;
  }
  let pixel = vec2<f32>(f32(gid.x), f32(gid.y));
  let uv = (pixel + 0.5) / vec2<f32>(settings.sizes.z, settings.sizes.w);
  let centerDepth = readDepthFromUv(uv);
  if (centerDepth >= 0.999999) {
    textureStore(aoOut, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(1.0, 1.0, 1.0, 1.0));
    return;
  }

  let center = reconstructWorld(uv, centerDepth);
  let normal = reconstructNormal(uv, centerDepth, center);
  let fullTexel = vec2<f32>(1.0 / settings.sizes.x, 1.0 / settings.sizes.y);
  let radius = max(settings.params.x, 1.0);
  let bias = max(settings.params.y, 0.0);
  let angle = hash12(pixel) * 6.28318530718;
  let rot = mat2x2<f32>(
    vec2<f32>(cos(angle), sin(angle)),
    vec2<f32>(-sin(angle), cos(angle))
  );

  var occlusion = 0.0;
  var weightSum = 0.0;
  for (var i = 0; i < SAMPLE_COUNT; i = i + 1) {
    let offset = rot * KERNEL[i] * (radius * fullTexel);
    let sampleUv = clamp(uv + offset, vec2<f32>(0.0), vec2<f32>(1.0));
    let sampleDepth = readDepthFromUv(sampleUv);
    if (sampleDepth >= 0.999999) {
      continue;
    }
    let samplePos = reconstructWorld(sampleUv, sampleDepth);
    let delta = samplePos - center;
    let distanceSq = max(dot(delta, delta), 1e-5);
    let deltaDir = normalize(delta);
    let angular = max(dot(normal, deltaDir) - bias, 0.0);
    let attenuation = 1.0 / (1.0 + distanceSq * 0.2);
    occlusion = occlusion + angular * attenuation;
    weightSum = weightSum + attenuation;
  }

  var ao = 1.0;
  if (weightSum > 1e-5) {
    ao = clamp(1.0 - (occlusion / weightSum) * ${formatFloat(preset.occlusionScale)}, 0.0, 1.0);
  }
  textureStore(aoOut, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(ao, ao, ao, 1.0));
}`;
}

function createAltAoComputeSource(preset) {
  const kernel = preset.altKernel
    .map(([x, y, z]) => `  vec3<f32>(${formatFloat(x)}, ${formatFloat(y)}, ${formatFloat(z)})`)
    .join(',\n');
  return /* wgsl */ `
struct AmbientOcclusionSettings {
  invViewProjection : mat4x4<f32>,
  viewProjection : mat4x4<f32>,
  view : mat4x4<f32>,
  cameraPosition : vec4<f32>,
  sizes : vec4<f32>,
  params : vec4<f32>,
  altParams : vec4<f32>,
};

@group(0) @binding(0) var<uniform> settings : AmbientOcclusionSettings;
@group(0) @binding(1) var depthTex : texture_depth_2d;
@group(0) @binding(2) var aoOut : texture_storage_2d<rgba8unorm, write>;

const SAMPLE_COUNT : i32 = ${preset.altSampleCount};
const KERNEL : array<vec3<f32>, ${preset.altSampleCount}> = array<vec3<f32>, ${preset.altSampleCount}>(
${kernel}
);

fn hash12(p : vec2<f32>) -> f32 {
  let p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  let q = p3 + dot(p3, p3.yzx + vec3<f32>(33.33));
  return fract((q.x + q.y) * q.z);
}

fn fullSize() -> vec2<i32> {
  return vec2<i32>(i32(settings.sizes.x), i32(settings.sizes.y));
}

fn aoSize() -> vec2<i32> {
  return vec2<i32>(i32(settings.sizes.z), i32(settings.sizes.w));
}

fn readDepthFromUv(uv : vec2<f32>) -> f32 {
  let size = fullSize();
  let px = clamp(vec2<i32>(vec2<f32>(size) * uv), vec2<i32>(0), size - vec2<i32>(1));
  return textureLoad(depthTex, px, 0);
}

fn reconstructWorld(uv : vec2<f32>, depth : f32) -> vec3<f32> {
  let uvClip = vec2<f32>(uv.x, 1.0 - uv.y);
  let clip = vec4<f32>(uvClip * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  let world = settings.invViewProjection * clip;
  return world.xyz / max(world.w, 1e-6);
}

fn reconstructNormal(uv : vec2<f32>, centerDepth : f32, center : vec3<f32>) -> vec3<f32> {
  let texel = vec2<f32>(1.0 / settings.sizes.x, 1.0 / settings.sizes.y);
  let uvLeft = clamp(uv - vec2<f32>(texel.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0));
  let uvRight = clamp(uv + vec2<f32>(texel.x, 0.0), vec2<f32>(0.0), vec2<f32>(1.0));
  let uvDown = clamp(uv - vec2<f32>(0.0, texel.y), vec2<f32>(0.0), vec2<f32>(1.0));
  let uvUp = clamp(uv + vec2<f32>(0.0, texel.y), vec2<f32>(0.0), vec2<f32>(1.0));
  let depthLeft = readDepthFromUv(uvLeft);
  let depthRight = readDepthFromUv(uvRight);
  let depthDown = readDepthFromUv(uvDown);
  let depthUp = readDepthFromUv(uvUp);
  let pLeft = reconstructWorld(uvLeft, depthLeft);
  let pRight = reconstructWorld(uvRight, depthRight);
  let pDown = reconstructWorld(uvDown, depthDown);
  let pUp = reconstructWorld(uvUp, depthUp);
  var dx = center - pLeft;
  if (abs(depthRight - centerDepth) <= abs(centerDepth - depthLeft)) {
    dx = pRight - center;
  }
  var dy = center - pDown;
  if (abs(depthUp - centerDepth) <= abs(centerDepth - depthDown)) {
    dy = pUp - center;
  }
  var n = cross(dx, dy);
  let lenN = length(n);
  if (!(lenN > 1e-6)) {
    return vec3<f32>(0.0, 0.0, 1.0);
  }
  n = n / lenN;
  let viewDir = normalize(settings.cameraPosition.xyz - center);
  if (dot(n, viewDir) < 0.0) {
    n = -n;
  }
  return n;
}

fn orthogonal(normal : vec3<f32>) -> vec3<f32> {
  if (abs(normal.z) < 0.999) {
    return normalize(cross(normal, vec3<f32>(0.0, 0.0, 1.0)));
  }
  return normalize(cross(normal, vec3<f32>(0.0, 1.0, 0.0)));
}

fn worldToView(world : vec3<f32>) -> vec3<f32> {
  return (settings.view * vec4<f32>(world, 1.0)).xyz;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let size = aoSize();
  if (i32(gid.x) >= size.x || i32(gid.y) >= size.y) {
    return;
  }
  let pixel = vec2<f32>(f32(gid.x), f32(gid.y));
  let uv = (pixel + 0.5) / vec2<f32>(settings.sizes.z, settings.sizes.w);
  let centerDepth = readDepthFromUv(uv);
  if (centerDepth >= 0.999999) {
    textureStore(aoOut, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(1.0, 1.0, 1.0, 1.0));
    return;
  }

  let center = reconstructWorld(uv, centerDepth);
  let centerView = worldToView(center);
  let normal = reconstructNormal(uv, centerDepth, center);
  let fullTexel = vec2<f32>(1.0 / settings.sizes.x, 1.0 / settings.sizes.y);
  let px = reconstructWorld(uv + vec2<f32>(fullTexel.x, 0.0), readDepthFromUv(uv + vec2<f32>(fullTexel.x, 0.0)));
  let py = reconstructWorld(uv + vec2<f32>(0.0, fullTexel.y), readDepthFromUv(uv + vec2<f32>(0.0, fullTexel.y)));
  let pixelWorld = max(0.5 * (length(px - center) + length(py - center)), 1e-4);
  let worldRadius = max(settings.params.x, 1.0) * pixelWorld;
  let bias = max(settings.params.y, 0.0);

  let angle = hash12(pixel) * 6.28318530718;
  let randomVec = vec3<f32>(cos(angle), sin(angle), 0.0);
  var tangent = randomVec - normal * dot(randomVec, normal);
  let tangentLength = length(tangent);
  if (!(tangentLength > 1e-6)) {
    tangent = orthogonal(normal);
  } else {
    tangent = tangent / tangentLength;
  }
  let bitangent = normalize(cross(normal, tangent));
  let tbn = mat3x3<f32>(tangent, bitangent, normal);

  var occlusion = 0.0;
  for (var i = 0; i < SAMPLE_COUNT; i = i + 1) {
    let sampleWorld = center + (tbn * KERNEL[i]) * worldRadius;
    let sampleClip = settings.viewProjection * vec4<f32>(sampleWorld, 1.0);
    if (!(sampleClip.w > 1e-6)) {
      continue;
    }
    let sampleNdc = sampleClip.xyz / sampleClip.w;
    let sampleUv = vec2<f32>(sampleNdc.x * 0.5 + 0.5, 1.0 - (sampleNdc.y * 0.5 + 0.5));
    if (any(sampleUv < vec2<f32>(0.0)) || any(sampleUv > vec2<f32>(1.0))) {
      continue;
    }
    let sampleDepth = readDepthFromUv(sampleUv);
    if (sampleDepth >= 0.999999) {
      continue;
    }
    let occluderWorld = reconstructWorld(sampleUv, sampleDepth);
    let occluderView = worldToView(occluderWorld);
    let sampleView = worldToView(sampleWorld);
    let rangeCheck = smoothstep(0.0, 1.0, worldRadius / max(abs(centerView.z - occluderView.z), 1e-4));
    let blocked = select(0.0, 1.0, occluderView.z >= sampleView.z + bias);
    occlusion = occlusion + blocked * rangeCheck;
  }

  let occ = occlusion / f32(SAMPLE_COUNT);
  let ao = 1.0 - clamp((occ - settings.altParams.y) * settings.altParams.x, 0.0, 1.0);
  textureStore(aoOut, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(ao, ao, ao, 1.0));
}`;
}

function createBlurSource(preset) {
  const radius = preset.blurRadius;
  const weights = preset.blurWeights.map((value) => formatFloat(value)).join(', ');
  return /* wgsl */ `
struct AmbientOcclusionSettings {
  invViewProjection : mat4x4<f32>,
  viewProjection : mat4x4<f32>,
  view : mat4x4<f32>,
  cameraPosition : vec4<f32>,
  sizes : vec4<f32>,
  params : vec4<f32>,
  altParams : vec4<f32>,
};

@group(0) @binding(0) var<uniform> settings : AmbientOcclusionSettings;
@group(0) @binding(1) var depthTex : texture_depth_2d;
@group(0) @binding(2) var aoIn : texture_2d<f32>;
@group(0) @binding(3) var aoOut : texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<uniform> direction : vec4<f32>;

const BLUR_RADIUS : i32 = ${radius};
const BLUR_WEIGHTS : array<f32, ${radius + 1}> = array<f32, ${radius + 1}>(${weights});

fn fullSize() -> vec2<i32> {
  return vec2<i32>(i32(settings.sizes.x), i32(settings.sizes.y));
}

fn aoSize() -> vec2<i32> {
  return vec2<i32>(i32(settings.sizes.z), i32(settings.sizes.w));
}

fn readDepthFromUv(uv : vec2<f32>) -> f32 {
  let size = fullSize();
  let px = clamp(vec2<i32>(vec2<f32>(size) * uv), vec2<i32>(0), size - vec2<i32>(1));
  return textureLoad(depthTex, px, 0);
}

fn readAo(coord : vec2<i32>) -> f32 {
  let size = aoSize();
  let clamped = clamp(coord, vec2<i32>(0), size - vec2<i32>(1));
  return textureLoad(aoIn, clamped, 0).x;
}

@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let size = aoSize();
  if (i32(gid.x) >= size.x || i32(gid.y) >= size.y) {
    return;
  }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + 0.5) / vec2<f32>(settings.sizes.z, settings.sizes.w);
  let centerDepth = readDepthFromUv(uv);
  var sum = readAo(coord) * BLUR_WEIGHTS[0];
  var weightSum = BLUR_WEIGHTS[0];
  for (var i = 1; i <= BLUR_RADIUS; i = i + 1) {
    let spatial = BLUR_WEIGHTS[i];
    let delta = vec2<i32>(
      i32(round(direction.x * f32(i))),
      i32(round(direction.y * f32(i)))
    );
    let coordA = coord + delta;
    let coordB = coord - delta;
    let uvA = (vec2<f32>(coordA) + 0.5) / vec2<f32>(settings.sizes.z, settings.sizes.w);
    let uvB = (vec2<f32>(coordB) + 0.5) / vec2<f32>(settings.sizes.z, settings.sizes.w);
    let depthA = readDepthFromUv(uvA);
    let depthB = readDepthFromUv(uvB);
    let weightA = spatial * exp(-abs(depthA - centerDepth) * settings.params.z);
    let weightB = spatial * exp(-abs(depthB - centerDepth) * settings.params.z);
    sum = sum + readAo(coordA) * weightA;
    sum = sum + readAo(coordB) * weightB;
    weightSum = weightSum + weightA + weightB;
  }
  let ao = sum / max(weightSum, 1e-5);
  textureStore(aoOut, coord, vec4<f32>(ao, ao, ao, 1.0));
}`;
}

const AO_COMPOSITE_WGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

struct CompositeSettings {
  strength : vec4<f32>,
};

@group(0) @binding(0) var textureSampler : sampler;
@group(0) @binding(1) var aoTex : texture_2d<f32>;
@group(0) @binding(2) var<uniform> settings : CompositeSettings;

@vertex
fn vs(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VertexOut {
  var output : VertexOut;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}

@fragment
fn fs(input : VertexOut) -> @location(0) vec4<f32> {
  // Offscreen textures are addressed top-left in WebGPU, so fullscreen UVs must flip Y.
  let uvFlipped = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
  let ao = textureSampleLevel(aoTex, textureSampler, uvFlipped, 0.0).x;
  let alpha = clamp((1.0 - ao) * settings.strength.x, 0.0, 1.0);
  return vec4<f32>(0.0, 0.0, 0.0, alpha);
}`;

export class AmbientOcclusionWebGPU {
  constructor(device) {
    this.device = device;
    this.gpu = device?.device ?? null;
    this.sampler = null;
    this.settingsBuffer = null;
    this.settingsArray = new Float32Array(64);
    this.blurHorizontalDirectionBuffer = null;
    this.blurVerticalDirectionBuffer = null;
    this.compositeSettingsBuffer = null;
    this.compositeSettingsArray = new Float32Array(4);
    this.prepassColor = null;
    this.prepassDepth = null;
    this.aoRaw = null;
    this.aoPing = null;
    this.aoPong = null;
    this.fullSize = { width: 0, height: 0 };
    this.aoSize = { width: 0, height: 0 };
    this.aoPipelines = new Map();
    this.blurPipelines = new Map();
    this.compositePipeline = null;
    this.aoBindGroupLayout = null;
    this.blurBindGroupLayout = null;
    this.compositeBindGroupLayout = null;
    this.aoBindGroup = null;
    this.blurHorizontalBindGroup = null;
    this.blurVerticalBindGroup = null;
    this.compositeBindGroup = null;
    this.invViewProjection = new Float32Array(16);
  }

  destroy() {
    this.prepassColor?.destroy?.();
    this.prepassDepth?.destroy?.();
    this.aoRaw?.destroy?.();
    this.aoPing?.destroy?.();
    this.aoPong?.destroy?.();
    this.settingsBuffer?.destroy?.();
    this.blurHorizontalDirectionBuffer?.destroy?.();
    this.blurVerticalDirectionBuffer?.destroy?.();
    this.compositeSettingsBuffer?.destroy?.();
  }

  ensureBuffers() {
    if (!this.gpu || this.settingsBuffer) return;
    this.settingsBuffer = this.gpu.createBuffer({
      size: this.settingsArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.blurHorizontalDirectionBuffer = this.gpu.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.blurVerticalDirectionBuffer = this.gpu.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.gpu.queue.writeBuffer(this.blurHorizontalDirectionBuffer, 0, new Float32Array([1, 0, 0, 0]));
    this.gpu.queue.writeBuffer(this.blurVerticalDirectionBuffer, 0, new Float32Array([0, 1, 0, 0]));
    this.compositeSettingsBuffer = this.gpu.createBuffer({
      size: this.compositeSettingsArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.sampler = this.gpu.createSampler({ magFilter: 'linear', minFilter: 'linear' });
  }

  ensureTextures(width, height, colorFormat, quality) {
    if (!this.gpu) return false;
    const fullWidth = Math.max(1, Math.floor(width));
    const fullHeight = Math.max(1, Math.floor(height));
    const aoWidth = Math.max(1, Math.round(fullWidth * quality.resolutionScale));
    const aoHeight = Math.max(1, Math.round(fullHeight * quality.resolutionScale));

    const recreateFull = this.fullSize.width !== fullWidth || this.fullSize.height !== fullHeight;
    const recreateAo = this.aoSize.width !== aoWidth || this.aoSize.height !== aoHeight;

    if (recreateFull) {
      this.prepassColor?.destroy?.();
      this.prepassDepth?.destroy?.();
      this.prepassColor = this.gpu.createTexture({
        size: { width: fullWidth, height: fullHeight, depthOrArrayLayers: 1 },
        format: colorFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.prepassDepth = this.gpu.createTexture({
        size: { width: fullWidth, height: fullHeight, depthOrArrayLayers: 1 },
        format: this.device.depthFormat ?? 'depth24plus',
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      this.fullSize = { width: fullWidth, height: fullHeight };
    }

    if (recreateAo) {
      this.aoRaw?.destroy?.();
      this.aoPing?.destroy?.();
      this.aoPong?.destroy?.();
      const usage = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC;
      this.aoRaw = this.gpu.createTexture({
        size: { width: aoWidth, height: aoHeight, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage,
      });
      this.aoPing = this.gpu.createTexture({
        size: { width: aoWidth, height: aoHeight, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage,
      });
      this.aoPong = this.gpu.createTexture({
        size: { width: aoWidth, height: aoHeight, depthOrArrayLayers: 1 },
        format: 'rgba8unorm',
        usage,
      });
      this.aoSize = { width: aoWidth, height: aoHeight };
    }
    return true;
  }

  ensurePipelines(mode, format, sampleCount = 1, quality) {
    if (!this.gpu) return false;
    this.ensureBuffers();
    if (!this.aoBindGroupLayout) {
      this.aoBindGroupLayout = this.gpu.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'depth' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
        ],
      });
      this.blurBindGroupLayout = this.gpu.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'depth' } },
          { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
          { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba8unorm' } },
          { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        ],
      });
      this.compositeBindGroupLayout = this.gpu.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        ],
      });
    }
    const aoKey = `${mode}|${quality.key}`;
    if (!this.aoPipelines.has(aoKey)) {
      const module = this.gpu.createShaderModule({
        code: mode === 'fast' ? createAltAoComputeSource(quality) : createSmoothAoComputeSource(quality),
      });
      this.aoPipelines.set(aoKey, this.gpu.createComputePipeline({
        layout: this.gpu.createPipelineLayout({ bindGroupLayouts: [this.aoBindGroupLayout] }),
        compute: { module, entryPoint: 'main' },
      }));
    }
    if (!this.blurPipelines.has(quality.key)) {
      const module = this.gpu.createShaderModule({ code: createBlurSource(quality) });
      this.blurPipelines.set(quality.key, this.gpu.createComputePipeline({
        layout: this.gpu.createPipelineLayout({ bindGroupLayouts: [this.blurBindGroupLayout] }),
        compute: { module, entryPoint: 'main' },
      }));
    }
    const resolvedSampleCount = Number.isFinite(sampleCount) && sampleCount > 1 ? 4 : 1;
    if (!this.compositePipeline || this._compositeKey !== `${format}|${resolvedSampleCount}`) {
      const module = this.gpu.createShaderModule({ code: AO_COMPOSITE_WGSL });
      this.compositePipeline = this.gpu.createRenderPipeline({
        layout: this.gpu.createPipelineLayout({ bindGroupLayouts: [this.compositeBindGroupLayout] }),
        vertex: {
          module,
          entryPoint: 'vs',
          buffers: [
            {
              arrayStride: 16,
              attributes: [
                { shaderLocation: 0, offset: 0, format: 'float32x2' },
                { shaderLocation: 1, offset: 8, format: 'float32x2' },
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [{
            format,
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
            },
            writeMask: GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE,
          }],
        },
        multisample: { count: resolvedSampleCount },
        primitive: { topology: 'triangle-strip' },
      });
      this._compositeKey = `${format}|${resolvedSampleCount}`;
    }
    return true;
  }

  updateSettingsPacked(cameraUniforms, strength, radius, bias, quality, intensityScale, intensityShift) {
    if (!this.gpu || !this.settingsBuffer || !invertMat4(this.invViewProjection, cameraUniforms?.viewProjection)) {
      return false;
    }
    const packed = new Float32Array(64);
    packed.set(this.invViewProjection, 0);
    packed.set(cameraUniforms?.viewProjection ?? new Float32Array(16), 16);
    packed.set(cameraUniforms?.view ?? new Float32Array(16), 32);
    const position = cameraUniforms?.position ?? [0, 0, 1];
    packed[48] = position[0] ?? 0;
    packed[49] = position[1] ?? 0;
    packed[50] = position[2] ?? 1;
    packed[51] = 0;
    packed[52] = this.fullSize.width;
    packed[53] = this.fullSize.height;
    packed[54] = this.aoSize.width;
    packed[55] = this.aoSize.height;
    packed[56] = Math.max(1, Number(radius) || 1);
    packed[57] = Math.max(0, Number(bias) || 0);
    packed[58] = quality.depthSharpness;
    packed[59] = Math.max(0, Number(strength) || 0);
    packed[60] = Math.max(0, Number(intensityScale) || 0);
    packed[61] = Math.max(0, Number(intensityShift) || 0);
    packed[62] = 0;
    packed[63] = 0;
    this.gpu.queue.writeBuffer(this.settingsBuffer, 0, packed);
    return true;
  }

  ensureBindGroups() {
    if (
      !this.gpu
      || !this.settingsBuffer
      || !this.blurHorizontalDirectionBuffer
      || !this.blurVerticalDirectionBuffer
      || !this.prepassDepth
      || !this.aoRaw
      || !this.aoPing
      || !this.aoPong
    ) {
      return false;
    }
    this.aoBindGroup = this.gpu.createBindGroup({
      layout: this.aoBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.settingsBuffer } },
        { binding: 1, resource: this.prepassDepth.createView() },
        { binding: 2, resource: this.aoRaw.createView() },
      ],
    });
    this.blurHorizontalBindGroup = this.gpu.createBindGroup({
      layout: this.blurBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.settingsBuffer } },
        { binding: 1, resource: this.prepassDepth.createView() },
        { binding: 2, resource: this.aoRaw.createView() },
        { binding: 3, resource: this.aoPing.createView() },
        { binding: 4, resource: { buffer: this.blurHorizontalDirectionBuffer } },
      ],
    });
    this.blurVerticalBindGroup = this.gpu.createBindGroup({
      layout: this.blurBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.settingsBuffer } },
        { binding: 1, resource: this.prepassDepth.createView() },
        { binding: 2, resource: this.aoPing.createView() },
        { binding: 3, resource: this.aoPong.createView() },
        { binding: 4, resource: { buffer: this.blurVerticalDirectionBuffer } },
      ],
    });
    this.compositeBindGroup = this.gpu.createBindGroup({
      layout: this.compositeBindGroupLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: this.aoPong.createView() },
        { binding: 2, resource: { buffer: this.compositeSettingsBuffer } },
      ],
    });
    return true;
  }

  render(context, options = {}) {
    if (!this.gpu) return false;
    const mode = normalizeAmbientOcclusionMode(options.mode);
    const quality = getAmbientOcclusionQualityPreset(options.quality);
    const viewport = resolveContextViewport(context, context?.width ?? 1, context?.height ?? 1);
    if (!this.ensureTextures(viewport.width, viewport.height, this.device.format, quality)) return false;
    if (!this.ensurePipelines(mode, context.format, context.sampleCount ?? 1, quality)) return false;
    this.ensureBuffers();
    if (!this.updateSettingsPacked(
      options.cameraUniforms,
      options.strength,
      options.radius,
      options.bias,
      quality,
      options.intensityScale,
      options.intensityShift,
    )) return false;
    this.compositeSettingsArray[0] = Math.max(0, Number(options.strength) || 0);
    this.gpu.queue.writeBuffer(this.compositeSettingsBuffer, 0, this.compositeSettingsArray);
    if (!this.ensureBindGroups()) return false;
    const aoPipeline = this.aoPipelines.get(`${mode}|${quality.key}`);
    const blurPipeline = this.blurPipelines.get(quality.key);
    if (!aoPipeline || !blurPipeline) return false;

    if (context.passEncoder) {
      context.passEncoder.end();
      context.passEncoder = null;
    }

    const commandEncoder = context.commandEncoder;
    const prepass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.prepassColor.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
      depthStencilAttachment: {
        view: this.prepassDepth.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    prepass.setViewport(0, 0, viewport.width, viewport.height, 0, 1);
    if (options.selection?.nodes) options.drawNodes?.(prepass);
    if (options.selection?.edges) options.drawEdges?.(prepass);
    prepass.end();

    const aoPass = commandEncoder.beginComputePass();
    aoPass.setPipeline(aoPipeline);
    aoPass.setBindGroup(0, this.aoBindGroup);
    aoPass.dispatchWorkgroups(Math.ceil(this.aoSize.width / 8), Math.ceil(this.aoSize.height / 8), 1);
    aoPass.end();

    const blurHorizontal = commandEncoder.beginComputePass();
    blurHorizontal.setPipeline(blurPipeline);
    blurHorizontal.setBindGroup(0, this.blurHorizontalBindGroup);
    blurHorizontal.dispatchWorkgroups(Math.ceil(this.aoSize.width / 8), Math.ceil(this.aoSize.height / 8), 1);
    blurHorizontal.end();

    const blurVertical = commandEncoder.beginComputePass();
    blurVertical.setPipeline(blurPipeline);
    blurVertical.setBindGroup(0, this.blurVerticalBindGroup);
    blurVertical.dispatchWorkgroups(Math.ceil(this.aoSize.width / 8), Math.ceil(this.aoSize.height / 8), 1);
    blurVertical.end();

    const compositePass = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.colorView,
        ...(context.resolveTargetView ? { resolveTarget: context.resolveTargetView } : {}),
        loadOp: 'load',
        storeOp: 'store',
      }],
    });
    if (context.viewport) {
      compositePass.setViewport(context.viewport.x, context.viewport.y, context.viewport.width, context.viewport.height, 0, 1);
    }
    compositePass.setPipeline(this.compositePipeline);
    compositePass.setBindGroup(0, this.compositeBindGroup);
    compositePass.setVertexBuffer(0, context.quad);
    compositePass.draw(4, 1, 0, 0);
    context.passEncoder = compositePass;
    return true;
  }
}

export default AmbientOcclusionWebGPU;
