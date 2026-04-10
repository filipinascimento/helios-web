import { Layer } from './Layer.js';
import { resolveColormap } from '../../colors/colormaps.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolvePackedVec3Count(entry, fallback = 0) {
  const explicit = Math.max(0, Math.floor(Number(entry?.count ?? 0)));
  const byteLength = Math.max(
    0,
    Math.floor(Number(entry?.byteLength ?? entry?.buffer?.size ?? 0)),
  );
  const inferred = byteLength > 0
    ? Math.floor(byteLength / (Float32Array.BYTES_PER_ELEMENT * 3))
    : 0;
  return Math.max(explicit, inferred, Math.max(0, Math.floor(Number(fallback) || 0)));
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || 'Density shader compilation error');
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || 'Density program link error');
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

function getTextureLayout(maxTextureSize, texelCount) {
  const safeCount = Math.max(1, Math.floor(Number(texelCount) || 1));
  const safeMax = Math.max(1, Math.floor(Number(maxTextureSize) || 16384));
  const width = Math.min(safeMax, safeCount);
  const height = Math.ceil(safeCount / width);
  return { width, height, count: safeCount };
}

function matrixHasFiniteValues(matrix) {
  if (!matrix || typeof matrix.length !== 'number') return false;
  for (let i = 0; i < matrix.length; i += 1) {
    if (!Number.isFinite(matrix[i])) return false;
  }
  return true;
}

const LOG_RATIO_AUTO_SUPPORT_FLOOR_MULTIPLIER = 128;
const LOG_RATIO_AUTO_SUPPORT_CEIL_MULTIPLIER = 512;

export function resolveLogRatioSupportWindow(epsilon, maskThreshold = 0, enabled = true) {
  if (enabled !== true) {
    return { floor: 0, ceil: 0 };
  }
  const safeEpsilon = Math.max(toFiniteNumber(epsilon, 1e-6), 1e-12);
  const explicitFloor = Math.max(toFiniteNumber(maskThreshold, 0), 0);
  const autoFloor = safeEpsilon * LOG_RATIO_AUTO_SUPPORT_FLOOR_MULTIPLIER;
  const floor = Math.max(explicitFloor, autoFloor);
  const ceil = Math.max(
    floor * 2,
    safeEpsilon * LOG_RATIO_AUTO_SUPPORT_CEIL_MULTIPLIER,
  );
  return { floor, ceil };
}

export function resolveDensityBandwidthViewport(context, cameraUniforms, fallbackWidth = 1, fallbackHeight = 1) {
  const cameraViewport = cameraUniforms?.viewport ?? null;
  const exportViewport = context?.target?.exportFigureLogicalViewport ?? null;
  const width = Math.max(
    1,
    toFiniteNumber(
      exportViewport?.width ?? cameraViewport?.width,
      fallbackWidth,
    ),
  );
  const height = Math.max(
    1,
    toFiniteNumber(
      exportViewport?.height ?? cameraViewport?.height,
      fallbackHeight,
    ),
  );
  return { width, height };
}

const SPLAT_VERT_WEBGL = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

layout(location = 0) in vec2 a_corner;

uniform mat4 u_viewProjection;
uniform usampler2D u_nodeIndices;
uniform sampler2D u_nodeWeights;
uniform sampler2D u_nodePositions;
uniform vec2 u_viewport;
uniform vec2 u_densitySize;
uniform float u_bandwidthPx;
uniform int u_nodeCount;
uniform int u_indexTexWidth;
uniform int u_weightTexWidth;
uniform int u_positionTexWidth;
uniform int u_positionCount;

out vec2 v_local;
out float v_weight;

ivec2 indexToCoord(int index, int width) {
  int safeWidth = max(width, 1);
  int y = index / safeWidth;
  int x = index - y * safeWidth;
  return ivec2(x, y);
}

bool isFiniteVec4(vec4 value) {
  bvec4 finiteMagnitude = lessThan(abs(value), vec4(1e19));
  bvec4 notNaN = equal(value, value);
  return all(finiteMagnitude) && all(notNaN);
}

void main() {
  int instance = gl_InstanceID;
  if (instance >= u_nodeCount) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    v_local = vec2(0.0);
    v_weight = 0.0;
    return;
  }

  uint nodeId = texelFetch(u_nodeIndices, indexToCoord(instance, u_indexTexWidth), 0).r;
  if (int(nodeId) < 0 || int(nodeId) >= u_positionCount) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    v_local = vec2(0.0);
    v_weight = 0.0;
    return;
  }

  vec3 position = texelFetch(u_nodePositions, indexToCoord(int(nodeId), u_positionTexWidth), 0).xyz;
  float weight = texelFetch(u_nodeWeights, indexToCoord(instance, u_weightTexWidth), 0).r;

  vec4 clip = u_viewProjection * vec4(position, 1.0);
  bool outsideClipDepth = clip.z < -clip.w || clip.z > clip.w;
  if (!isFiniteVec4(clip) || abs(clip.w) < 1e-6 || clip.w <= 0.0 || outsideClipDepth) {
    gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
    v_local = vec2(0.0);
    v_weight = 0.0;
    return;
  }

  vec2 ndc = clip.xy / clip.w;
  vec2 center = vec2(
    (ndc.x * 0.5 + 0.5) * u_densitySize.x,
    (1.0 - (ndc.y * 0.5 + 0.5)) * u_densitySize.y
  );

  float bandwidthScale = u_densitySize.x / max(u_viewport.x, 1.0);
  float sigma = max(0.6, u_bandwidthPx * bandwidthScale);
  vec2 offset = a_corner * (sigma * 3.0);
  vec2 px = center + offset;

  vec2 outNdc = vec2(
    (px.x / max(u_densitySize.x, 1.0)) * 2.0 - 1.0,
    1.0 - (px.y / max(u_densitySize.y, 1.0)) * 2.0
  );

  gl_Position = vec4(outNdc, 0.0, 1.0);
  v_local = offset / max(sigma, 1e-4);
  v_weight = weight;
}
`;

const SPLAT_FRAG_WEBGL = `#version 300 es
precision highp float;

in vec2 v_local;
in float v_weight;
out vec4 fragColor;

void main() {
  float r2 = dot(v_local, v_local);
  if (r2 > 9.0) discard;
  float g = exp(-0.5 * r2);
  fragColor = vec4(v_weight * g, 0.0, 0.0, 1.0);
}
`;

const FULLSCREEN_VERT_WEBGL = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}
`;

const COMPOSITE_FRAG_WEBGL = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_densityTex;
uniform sampler2D u_colormapTex;
uniform float u_weightScale;
uniform int u_diverging;
uniform int u_topographic;
uniform float u_contourLevels;
uniform float u_contourWidth;
out vec4 fragColor;

void main() {
  float raw = texture(u_densityTex, v_uv).r * u_weightScale;
  float s = 0.0;
  float t = 0.0;
  float alpha = 0.0;

  if (u_diverging == 1) {
    s = clamp(raw, -1.0, 1.0);
    t = s * 0.5 + 0.5;
    alpha = abs(s);
  } else {
    s = clamp(raw, 0.0, 1.0);
    t = s;
    alpha = s;
  }

  vec4 color = texture(u_colormapTex, vec2(t, 0.5));

  if (u_topographic == 1) {
    float base = abs(s);
    float phase = fract(base * max(u_contourLevels, 1.0));
    float contour = abs(phase - 0.5) * 2.0;
    float width = max(u_contourWidth, 1e-4);
    float line = clamp((width - contour) / width, 0.0, 1.0);
    color.rgb = mix(color.rgb, vec3(0.0), line * 0.35);
    alpha = clamp(alpha + line * 0.2, 0.0, 1.0);
  }

  fragColor = vec4(color.rgb, alpha * color.a);
}
`;

const COMPOSITE_LOG_RATIO_FRAG_WEBGL = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_numeratorTex;
uniform sampler2D u_denominatorTex;
uniform sampler2D u_colormapTex;
uniform float u_epsilon;
uniform float u_domainMax;
uniform float u_supportFloor;
uniform float u_supportCeil;
uniform float u_numeratorTotal;
uniform float u_denominatorTotal;
uniform int u_supportCorrection;
uniform int u_zScore;
uniform int u_topographic;
uniform float u_contourLevels;
uniform float u_contourWidth;
out vec4 fragColor;

void main() {
  float numerator = texture(u_numeratorTex, v_uv).r;
  float denominator = texture(u_denominatorTex, v_uv).r;
  float support = numerator + denominator;
  float safeDomain = max(u_domainMax, 1e-6);
  float safeSupportFloor = max(u_supportFloor, 0.0);
  float safeSupportCeil = max(u_supportCeil, safeSupportFloor + 1e-9);
  float raw = log((numerator + u_epsilon) / (denominator + u_epsilon));
  float scalar = raw;
  if (u_zScore == 1) {
    float totalScale = max(max(u_numeratorTotal, u_denominatorTotal), 1.0);
    float localEpsilon = max(u_epsilon * totalScale, 1e-12);
    float numeratorCount = max(numerator * max(u_numeratorTotal, 0.0), 0.0);
    float denominatorCount = max(denominator * max(u_denominatorTotal, 0.0), 0.0);
    float variance = (1.0 / max(numeratorCount + localEpsilon, 1e-12))
      + (1.0 / max(denominatorCount + localEpsilon, 1e-12));
    scalar = raw / sqrt(max(variance, 1e-12));
  }
  float supportWeight = u_supportCorrection == 1
    ? smoothstep(safeSupportFloor, safeSupportCeil, support)
    : 1.0;
  float s = clamp(scalar / safeDomain, -1.0, 1.0) * supportWeight;
  float t = s * 0.5 + 0.5;
  float alpha = abs(s);

  vec4 color = texture(u_colormapTex, vec2(t, 0.5));

  if (u_topographic == 1) {
    float base = abs(s);
    float phase = fract(base * max(u_contourLevels, 1.0));
    float contour = abs(phase - 0.5) * 2.0;
    float width = max(u_contourWidth, 1e-4);
    float line = clamp((width - contour) / width, 0.0, 1.0);
    color.rgb = mix(color.rgb, vec3(0.0), line * 0.35);
    alpha = clamp(alpha + line * 0.2, 0.0, 1.0);
  }

  fragColor = vec4(color.rgb, alpha * color.a);
}
`;

const SPLAT_WGSL = /* wgsl */ `
struct DensityCamera {
  viewProjection : mat4x4<f32>,
  viewportDensity : vec4<f32>, // xy viewport, zw density
  params : vec4<f32>, // x bandwidthPx, y nodeCount, z positionCount
};

struct U32Data {
  data : array<u32>,
};

struct F32Data {
  data : array<f32>,
};

@group(0) @binding(0) var<uniform> camera : DensityCamera;
@group(0) @binding(1) var<storage, read> nodeIndices : U32Data;
@group(0) @binding(2) var<storage, read> nodePositions : F32Data;
@group(0) @binding(3) var<storage, read> nodeWeights : F32Data;

struct VSIn {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) local : vec2<f32>,
  @location(1) weight : f32,
};

fn isFiniteVec4(value : vec4<f32>) -> bool {
  let finiteMagnitude = abs(value) < vec4<f32>(1e19);
  let notNaN = value == value;
  return all(finiteMagnitude) && all(notNaN);
}

@vertex
fn vsMain(input : VSIn) -> VSOut {
  var out : VSOut;

  let nodeCount = u32(camera.params.y + 0.5);
  if (input.instance >= nodeCount) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    out.local = vec2<f32>(0.0, 0.0);
    out.weight = 0.0;
    return out;
  }

  let nodeId = nodeIndices.data[input.instance];
  let positionCount = u32(camera.params.z + 0.5);
  if (nodeId >= positionCount) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    out.local = vec2<f32>(0.0, 0.0);
    out.weight = 0.0;
    return out;
  }

  let base = nodeId * 3u;
  let position = vec3<f32>(
    nodePositions.data[base + 0u],
    nodePositions.data[base + 1u],
    nodePositions.data[base + 2u],
  );
  let weight = nodeWeights.data[input.instance];

  let clip = camera.viewProjection * vec4<f32>(position, 1.0);
  let outsideClipDepth = clip.z < -clip.w || clip.z > clip.w;
  if (!isFiniteVec4(clip) || abs(clip.w) < 1e-6 || clip.w <= 0.0 || outsideClipDepth) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    out.local = vec2<f32>(0.0, 0.0);
    out.weight = 0.0;
    return out;
  }

  let ndc = clip.xy / clip.w;
  let densitySize = max(camera.viewportDensity.zw, vec2<f32>(1.0, 1.0));
  let center = vec2<f32>(
    (ndc.x * 0.5 + 0.5) * densitySize.x,
    (1.0 - (ndc.y * 0.5 + 0.5)) * densitySize.y,
  );

  let viewportSize = max(camera.viewportDensity.xy, vec2<f32>(1.0, 1.0));
  let sigma = max(0.6, camera.params.x * (densitySize.x / viewportSize.x));
  let offset = input.corner * (sigma * 3.0);
  let px = center + offset;

  let outNdc = vec2<f32>(
    (px.x / densitySize.x) * 2.0 - 1.0,
    1.0 - (px.y / densitySize.y) * 2.0,
  );

  out.position = vec4<f32>(outNdc, 0.0, 1.0);
  out.local = offset / max(sigma, 1e-4);
  out.weight = weight;
  return out;
}

@fragment
fn fsMain(input : VSOut) -> @location(0) vec4<f32> {
  let r2 = dot(input.local, input.local);
  if (r2 > 9.0) {
    discard;
  }
  let g = exp(-0.5 * r2);
  return vec4<f32>(input.weight * g, 0.0, 0.0, 1.0);
}
`;

const COMPOSITE_WGSL = /* wgsl */ `
struct CompositeParams {
  values : vec4<f32>, // x weightScale, y divergingFlag, z topographicFlag, w contourLevels
  values2 : vec4<f32>, // x contourWidth
};

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vsMain(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VSOut {
  var out : VSOut;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@group(0) @binding(0) var densitySampler : sampler;
@group(0) @binding(1) var densityTexture : texture_2d<f32>;
@group(0) @binding(2) var colormapTexture : texture_2d<f32>;
@group(0) @binding(3) var<uniform> params : CompositeParams;

@fragment
fn fsMain(input : VSOut) -> @location(0) vec4<f32> {
  // WebGPU render targets use a top-left origin; flip Y when resolving from an offscreen texture.
  let uvFlipped = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
  let raw = textureSample(densityTexture, densitySampler, uvFlipped).r * params.values.x;
  let diverging = params.values.y > 0.5;
  let topographic = params.values.z > 0.5;

  var s = 0.0;
  var t = 0.0;
  var alpha = 0.0;

  if (diverging) {
    s = clamp(raw, -1.0, 1.0);
    t = s * 0.5 + 0.5;
    alpha = abs(s);
  } else {
    s = clamp(raw, 0.0, 1.0);
    t = s;
    alpha = s;
  }

  var color = textureSample(colormapTexture, densitySampler, vec2<f32>(t, 0.5));

  if (topographic) {
    let contourLevels = max(params.values.w, 1.0);
    let contourWidth = max(params.values2.x, 1e-4);
    let base = abs(s);
    let phase = fract(base * contourLevels);
    let contour = abs(phase - 0.5) * 2.0;
    let line = clamp((contourWidth - contour) / contourWidth, 0.0, 1.0);
    color = vec4<f32>(mix(color.rgb, vec3<f32>(0.0), line * 0.35), color.a);
    alpha = clamp(alpha + line * 0.2, 0.0, 1.0);
  }

  return vec4<f32>(color.rgb, alpha * color.a);
}
`;

const COMPOSITE_LOG_RATIO_WGSL = /* wgsl */ `
struct LogRatioCompositeParams {
  values : vec4<f32>, // x epsilon, y domainMax, z supportFloor, w topographicFlag
  values2 : vec4<f32>, // x contourLevels, y contourWidth, z supportCeil, w supportCorrectionFlag
  values3 : vec4<f32>, // x numeratorTotal, y denominatorTotal, z zScoreFlag
};

struct VSOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vsMain(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VSOut {
  var out : VSOut;
  out.position = vec4<f32>(position, 0.0, 1.0);
  out.uv = uv;
  return out;
}

@group(0) @binding(0) var densitySampler : sampler;
@group(0) @binding(1) var numeratorTexture : texture_2d<f32>;
@group(0) @binding(2) var denominatorTexture : texture_2d<f32>;
@group(0) @binding(3) var colormapTexture : texture_2d<f32>;
@group(0) @binding(4) var<uniform> params : LogRatioCompositeParams;

@fragment
fn fsMain(input : VSOut) -> @location(0) vec4<f32> {
  let uvFlipped = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
  let numerator = textureSampleLevel(numeratorTexture, densitySampler, uvFlipped, 0.0).r;
  let denominator = textureSampleLevel(denominatorTexture, densitySampler, uvFlipped, 0.0).r;
  let support = numerator + denominator;
  let epsilon = max(params.values.x, 1e-12);
  let domainMax = max(params.values.y, 1e-6);
  let supportFloor = max(params.values.z, 0.0);
  let supportCeil = max(params.values2.z, supportFloor + 1e-9);
  let supportCorrection = params.values2.w > 0.5;
  let numeratorTotal = max(params.values3.x, 0.0);
  let denominatorTotal = max(params.values3.y, 0.0);
  let zScoreEnabled = params.values3.z > 0.5;
  let topographic = params.values.w > 0.5;

  let raw = log((numerator + epsilon) / (denominator + epsilon));
  var scalar = raw;
  if (zScoreEnabled) {
    let totalScale = max(max(numeratorTotal, denominatorTotal), 1.0);
    let localEpsilon = max(epsilon * totalScale, 1e-12);
    let numeratorCount = max(numerator * numeratorTotal, 0.0);
    let denominatorCount = max(denominator * denominatorTotal, 0.0);
    let variance = (1.0 / max(numeratorCount + localEpsilon, 1e-12))
      + (1.0 / max(denominatorCount + localEpsilon, 1e-12));
    scalar = raw / sqrt(max(variance, 1e-12));
  }
  let supportWeight = select(1.0, smoothstep(supportFloor, supportCeil, support), supportCorrection);
  let s = clamp(scalar / domainMax, -1.0, 1.0) * supportWeight;
  let t = s * 0.5 + 0.5;
  var alpha = abs(s);

  var color = textureSampleLevel(colormapTexture, densitySampler, vec2<f32>(t, 0.5), 0.0);

  if (topographic) {
    let contourLevels = max(params.values2.x, 1.0);
    let contourWidth = max(params.values2.y, 1e-4);
    let base = abs(s);
    let phase = fract(base * contourLevels);
    let contour = abs(phase - 0.5) * 2.0;
    let line = clamp((contourWidth - contour) / contourWidth, 0.0, 1.0);
    color = vec4<f32>(mix(color.rgb, vec3<f32>(0.0), line * 0.35), color.a);
    alpha = clamp(alpha + line * 0.2, 0.0, 1.0);
  }

  return vec4<f32>(color.rgb, alpha * color.a);
}
`;

function normalizeComparisonMode(value, fallback = 'difference') {
  if (value === 'logRatio') return 'logRatio';
  if (value === 'difference') return 'difference';
  return fallback;
}

function hasComparisonTarget(compareProperty) {
  return typeof compareProperty === 'string'
    && compareProperty.trim().length > 0
    && compareProperty.trim() !== 'None';
}

function resolveCompareProperty(property, compareProperty) {
  const propertyKey = typeof property === 'string' ? property.trim() : '';
  const compareKey = typeof compareProperty === 'string' ? compareProperty.trim() : '';
  if (!compareKey || compareKey === 'None') return 'None';
  if (propertyKey && compareKey === propertyKey) return 'None';
  return compareKey;
}

function resolveComparisonMode(compareProperty, requestedMode, fallback = 'difference') {
  return hasComparisonTarget(compareProperty) && requestedMode === 'logRatio'
    ? 'logRatio'
    : fallback;
}

function defaultDensityConfig() {
  return {
    enabled: false,
    qualityScale: 0.1,
    topographic: false,
    scaleWithZoom: false,
    bandwidth: 28.1,
    weightScale: 398.1071705534973,
    property: 'Uniform',
    compareProperty: 'None',
    comparisonMode: 'difference',
    normalizeVs: false,
    epsilon: 1e-6,
    logRatioRange: 3,
    maskThreshold: 0,
    logRatioZScore: false,
    logRatioSupportCorrection: true,
    colormap: 'interpolateOrRd',
    logRatioColormap: 'cmasher:prinsenvlag',
    divergingColormap: 'cmasher:prinsenvlag',
  };
}

export class DensityLayer extends Layer {
  constructor(options = {}) {
    super('density-layer');
    this.getGraphLayer = options.getGraphLayer ?? (() => null);
    this.withBufferAccess = options.withBufferAccess ?? ((fn) => fn());
    this.getNodePositionView = options.getNodePositionView ?? (() => null);
    this.getNodePositionInfo = options.getNodePositionInfo ?? null;
    this.onRuntimeState = options.onRuntimeState ?? (() => {});

    this.config = { ...defaultDensityConfig(), ...(options.initialConfig ?? {}) };
    this.runtime = { diverging: false, valueDomain: null };
    this.version = 0;

    this._weightArray = null;
    this._lastWeightCount = 0;
    this._logRatioWeights = {
      count: 0,
      numerator: null,
      denominator: null,
    };
    this._activeNodeIndicesArray = null;
    this._activeEdgeIndicesArray = null;
    this._activeIndexScratch = {
      node: null,
      edge: null,
    };

    this._degreeCache = {
      network: null,
      edgeVersion: -1,
      usesOverride: false,
      values: null,
    };
    this._zoomScaleDistanceRef3D = null;

    this.webgl = {
      ready: false,
      extColorFloat: false,
      programSplat: null,
      programComposite: null,
      programCompositeLogRatio: null,
      vaoSplat: null,
      vaoQuad: null,
      cornerBuffer: null,
      quadBuffer: null,
      densityFbo: null,
      densityTex: null,
      densityWidth: 0,
      densityHeight: 0,
      numeratorFbo: null,
      numeratorTex: null,
      numeratorWidth: 0,
      numeratorHeight: 0,
      denominatorFbo: null,
      denominatorTex: null,
      denominatorWidth: 0,
      denominatorHeight: 0,
      nodeIndicesTex: null,
      nodeIndicesLayout: null,
      nodeIndicesMeta: null,
      nodeWeightsTex: null,
      nodeWeightsLayout: null,
      nodeWeightsMeta: null,
      numeratorWeightsTex: null,
      numeratorWeightsLayout: null,
      numeratorWeightsMeta: null,
      denominatorWeightsTex: null,
      denominatorWeightsLayout: null,
      denominatorWeightsMeta: null,
      fallbackPositionsTex: null,
      fallbackPositionsLayout: null,
      fallbackPositionsMeta: null,
      colormapTex: null,
      colormapKey: null,
      colormapDiverging: null,
      uniforms: {
        splat: {},
        composite: {},
        compositeLogRatio: {},
      },
      fallbackPositionCount: 0,
    };

    this.webgpu = {
      ready: false,
      pipelineSplat: null,
      pipelineComposite: null,
      pipelineCompositeLogRatio: null,
      bindGroupSplat: null,
      bindGroupComposite: null,
      bindGroupCompositeLogRatio: null,
      cameraBuffer: null,
      compositeParamsBuffer: null,
      compositeLogRatioParamsBuffer: null,
      cornersBuffer: null,
      sampler: null,
      densityTexture: null,
      densitySize: { width: 0, height: 0 },
      numeratorTexture: null,
      denominatorTexture: null,
      logRatioSize: { width: 0, height: 0 },
      colormapTexture: null,
      colormapKey: null,
      colormapDiverging: null,
      fallbackNodeIndicesVersion: null,
      fallbackNodePositionVersion: null,
      weightUploadVersion: 0,
    };
  }

  getConfig() {
    return {
      ...this.config,
      diverging: this.runtime.diverging,
      valueDomain: Array.isArray(this.runtime.valueDomain) ? [...this.runtime.valueDomain] : null,
    };
  }

  setConfig(next = {}) {
    if (!next || typeof next !== 'object') return this;
    const wasZoomScaled = this.config.scaleWithZoom === true;
    const merged = { ...this.config, ...next };
    merged.enabled = merged.enabled === true;
    merged.topographic = merged.topographic === true;
    merged.normalizeVs = merged.normalizeVs === true;
    merged.logRatioZScore = merged.logRatioZScore === true;
    merged.logRatioSupportCorrection = merged.logRatioSupportCorrection !== false;
    merged.scaleWithZoom = merged.scaleWithZoom === true;
    merged.comparisonMode = normalizeComparisonMode(merged.comparisonMode, this.config.comparisonMode);
    merged.qualityScale = clamp(toFiniteNumber(merged.qualityScale, this.config.qualityScale), 0.03, 1.0);
    merged.bandwidth = clamp(toFiniteNumber(merged.bandwidth, this.config.bandwidth), 0.05, 1000);
    merged.weightScale = clamp(toFiniteNumber(merged.weightScale, this.config.weightScale), 0, 1e8);
    merged.epsilon = clamp(toFiniteNumber(merged.epsilon, this.config.epsilon), 1e-12, 1);
    merged.logRatioRange = clamp(toFiniteNumber(merged.logRatioRange, this.config.logRatioRange), 1e-3, 1e3);
    merged.maskThreshold = clamp(toFiniteNumber(merged.maskThreshold, this.config.maskThreshold), 0, 1);
    merged.property = typeof merged.property === 'string' && merged.property.trim()
      ? merged.property.trim()
      : 'Uniform';
    merged.compareProperty = typeof merged.compareProperty === 'string' && merged.compareProperty.trim()
      ? merged.compareProperty.trim()
      : 'None';
    merged.compareProperty = resolveCompareProperty(merged.property, merged.compareProperty);
    merged.comparisonMode = resolveComparisonMode(merged.compareProperty, merged.comparisonMode);
    merged.colormap = typeof merged.colormap === 'string' && merged.colormap.trim()
      ? merged.colormap.trim()
      : this.config.colormap;
    merged.logRatioColormap = typeof merged.logRatioColormap === 'string' && merged.logRatioColormap.trim()
      ? merged.logRatioColormap.trim()
      : this.config.logRatioColormap;
    merged.divergingColormap = typeof merged.divergingColormap === 'string' && merged.divergingColormap.trim()
      ? merged.divergingColormap.trim()
      : this.config.divergingColormap;

    this.config = merged;
    if (merged.comparisonMode !== 'logRatio') {
      this.runtime.diverging = false;
      this.runtime.valueDomain = null;
    }
    if (!merged.scaleWithZoom || !wasZoomScaled) {
      this._zoomScaleDistanceRef3D = null;
    }
    this.version += 1;
    return this;
  }

  resolveSplatBandwidthPx(camera, cameraUniforms) {
    const base = clamp(toFiniteNumber(this.config.bandwidth, 28.1), 0.05, 1000);
    if (this.config.scaleWithZoom !== true) return base;

    const mode = cameraUniforms?.mode ?? camera?.mode ?? null;
    if (mode === '2d') {
      this._zoomScaleDistanceRef3D = null;
      const zoomRaw = camera?.zoom ?? cameraUniforms?.view?.[0];
      const zoom = clamp(Math.abs(toFiniteNumber(zoomRaw, 1)), 1e-3, 10);
      return base * zoom;
    }
    if (mode === '3d') {
      const distance = Math.abs(toFiniteNumber(camera?.distance, NaN));
      if (!Number.isFinite(distance) || distance <= 1e-6) return base;
      if (!Number.isFinite(this._zoomScaleDistanceRef3D) || this._zoomScaleDistanceRef3D <= 1e-6) {
        this._zoomScaleDistanceRef3D = distance;
      }
      const factor = clamp(this._zoomScaleDistanceRef3D / distance, 0.1, 20);
      return base * factor;
    }
    return base;
  }

  initialize(device, size) {
    super.initialize(device, size);
    if (device?.type === 'webgl2') {
      this.initializeWebGL(device, size);
    } else if (device?.type === 'webgpu') {
      this.initializeWebGPU(device, size);
    }
  }

  resize(size) {
    super.resize(size);
    this.webgl.densityWidth = 0;
    this.webgl.densityHeight = 0;
    this.webgpu.densitySize = { width: 0, height: 0 };
  }

  destroy() {
    this.destroyWebGL();
    this.destroyWebGPU();
    this.releaseAllActiveIndexScratch();
  }

  render(context, frame) {
    const cfg = this.config;
    if (!cfg.enabled) return;
    const network = frame?.network ?? null;
    const camera = frame?.camera ?? null;
    if (!network || !camera) return;

    const uniforms = camera?.getUniforms?.();
    if (!uniforms || !matrixHasFiniteValues(uniforms.viewProjection)) return;
    this.withBufferAccess(() => {
      const computed = this.computeWeightsUnsafe(network, cfg);
      if (!computed || computed.count <= 0) return;

      this.runtime.diverging = computed.diverging;
      this.runtime.valueDomain = Array.isArray(computed.valueDomain) ? [...computed.valueDomain] : null;
      this.onRuntimeState?.({
        diverging: computed.diverging,
        valueDomain: this.runtime.valueDomain,
      });

      if (context.type === 'webgl2') {
        this.renderWebGL(context, frame, uniforms, computed);
        return;
      }
      if (context.type === 'webgpu') {
        this.renderWebGPU(context, frame, uniforms, computed);
      }
    });
  }

  canUseWasmNodeIndexWriter(network) {
    if (!network) return false;
    const module = network.module ?? null;
    return Boolean(
      module
      && typeof module._malloc === 'function'
      && typeof module._free === 'function'
      && module.HEAPU32
      && typeof network.writeActiveNodes === 'function',
    );
  }

  canUseWasmEdgeIndexWriter(network) {
    if (!network) return false;
    return typeof network.writeActiveEdges === 'function' && this.canUseWasmNodeIndexWriter(network);
  }

  releaseActiveIndexScratch(scope) {
    const current = this._activeIndexScratch?.[scope] ?? null;
    if (!current) return;
    try {
      if (current.ptr && typeof current.module?._free === 'function') {
        current.module._free(current.ptr);
      }
    } catch (_) {
      // ignore allocator teardown errors
    }
    this._activeIndexScratch[scope] = null;
  }

  releaseAllActiveIndexScratch() {
    this.releaseActiveIndexScratch('node');
    this.releaseActiveIndexScratch('edge');
  }

  ensureActiveIndexScratch(network, scope, requiredCount) {
    const module = network?.module ?? null;
    if (!module) return null;
    const nextRequired = Math.max(1, Math.floor(Number(requiredCount) || 0));
    const existing = this._activeIndexScratch?.[scope] ?? null;
    if (existing && existing.module !== module) {
      this.releaseActiveIndexScratch(scope);
    }

    const current = this._activeIndexScratch?.[scope] ?? null;
    if (current?.ptr && current.capacity >= nextRequired) {
      return current;
    }

    const bytes = nextRequired * Uint32Array.BYTES_PER_ELEMENT;
    const ptr = module._malloc(bytes);
    if (!ptr) {
      throw new Error(`Failed to allocate WASM scratch buffer for active ${scope} indices`);
    }
    if (current?.ptr) {
      try {
        current.module?._free?.(current.ptr);
      } catch (_) {
        // ignore allocator teardown errors
      }
    }
    const next = {
      module,
      ptr,
      capacity: nextRequired,
    };
    this._activeIndexScratch[scope] = next;
    return next;
  }

  computeWeights(network, config) {
    return this.withBufferAccess(() => this.computeWeightsUnsafe(network, config));
  }

  computeWeightsUnsafe(network, config) {
    const compareEnabled = config.compareProperty && config.compareProperty !== 'None';
    const needsEdgeIndices = config.property === 'Degree' || (compareEnabled && config.compareProperty === 'Degree');
    const useWasmNodeWriter = this.canUseWasmNodeIndexWriter(network);
    const useWasmEdgeWriter = needsEdgeIndices && this.canUseWasmEdgeIndexWriter(network);

    let fallbackNodeIndices = null;
    let fallbackEdgeIndices = null;
    if (!useWasmNodeWriter) {
      fallbackNodeIndices = network?.nodeIndices ?? null;
    }
    if (needsEdgeIndices && !useWasmEdgeWriter) {
      fallbackEdgeIndices = network?.edgeIndices ?? null;
    }

    if (useWasmNodeWriter) {
      this.ensureActiveIndexScratch(network, 'node', network?.nodeCount ?? 0);
    }
    if (needsEdgeIndices && useWasmEdgeWriter) {
      this.ensureActiveIndexScratch(network, 'edge', network?.edgeCount ?? 0);
    }

    let result = null;
    let overflowRequest = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      overflowRequest = null;
      let nodeIndices = fallbackNodeIndices;
      let edgeIndices = fallbackEdgeIndices;

      if (useWasmNodeWriter) {
        const module = network?.module ?? null;
        const nodeScratch = this._activeIndexScratch?.node ?? null;
        if (!module || !nodeScratch?.ptr || nodeScratch.module !== module) {
          nodeIndices = null;
        } else {
          const target = new Uint32Array(module.HEAPU32.buffer, nodeScratch.ptr, nodeScratch.capacity);
          const required = Math.max(0, Math.floor(Number(network.writeActiveNodes(target) || 0)));
          if (required > nodeScratch.capacity) {
            overflowRequest = { scope: 'node', count: required };
          } else {
            nodeIndices = target.subarray(0, required);
          }
        }
      }

      if (!overflowRequest && needsEdgeIndices && useWasmEdgeWriter) {
        const module = network?.module ?? null;
        const edgeScratch = this._activeIndexScratch?.edge ?? null;
        if (!module || !edgeScratch?.ptr || edgeScratch.module !== module) {
          edgeIndices = null;
        } else {
          const target = new Uint32Array(module.HEAPU32.buffer, edgeScratch.ptr, edgeScratch.capacity);
          const required = Math.max(0, Math.floor(Number(network.writeActiveEdges(target) || 0)));
          if (required > edgeScratch.capacity) {
            overflowRequest = { scope: 'edge', count: required };
          } else {
            edgeIndices = target.subarray(0, required);
          }
        }
      }

      if (overflowRequest) {
        // retry after growing scratch storage
      } else {
        const count = nodeIndices?.length ?? 0;
        if (!count) {
          result = {
            mode: 'difference',
            nodeIndices: null,
            count: 0,
            weights: null,
            diverging: false,
            positionCount: Math.max(0, Math.floor(Number(network?.nodeCount ?? 0))),
            colormapKey: config.colormap,
            valueDomain: null,
          };
        } else {
          result = config.comparisonMode === 'logRatio'
            ? this.buildLogRatioComputed(network, config, nodeIndices, edgeIndices, count)
            : this.buildDifferenceComputed(network, config, nodeIndices, edgeIndices, count);
        }
      }

      if (!overflowRequest) {
        return result ?? {
          mode: 'difference',
          nodeIndices: null,
          count: 0,
          weights: null,
          diverging: false,
          positionCount: Math.max(0, Math.floor(Number(network?.nodeCount ?? 0))),
          colormapKey: config.colormap,
          valueDomain: null,
        };
      }
      this.ensureActiveIndexScratch(network, overflowRequest.scope, overflowRequest.count);
    }

    return result ?? {
      mode: 'difference',
      nodeIndices: null,
      count: 0,
      weights: null,
      diverging: false,
      positionCount: Math.max(0, Math.floor(Number(network?.nodeCount ?? 0))),
      colormapKey: config.colormap,
      valueDomain: null,
    };
  }

  buildDifferenceComputed(network, config, nodeIndices, edgeIndices, count) {
    if (!this._weightArray || this._lastWeightCount !== count) {
      this._weightArray = new Float32Array(count);
      this._lastWeightCount = count;
    }
    const weights = this._weightArray;

    const primaryReader = this.makePropertyReader(network, config.property, edgeIndices);
    const compareReader = config.compareProperty && config.compareProperty !== 'None'
      ? this.makePropertyReader(network, config.compareProperty, edgeIndices)
      : null;

    let totalWeight = 0;
    let totalNegative = 0;
    let totalPositive = 0;

    for (let i = 0; i < count; i += 1) {
      const nodeId = nodeIndices[i] >>> 0;
      const primary = primaryReader(nodeId);
      const compare = compareReader ? compareReader(nodeId) : 0;
      let value = compareReader ? (compare - primary) : primary;
      if (!Number.isFinite(value)) value = 0;
      weights[i] = value;
      const abs = Math.abs(value);
      totalWeight += abs;
      if (value < 0) totalNegative += value;
      else totalPositive += value;
    }

    let diverging = false;
    if (totalWeight > 0 && totalNegative === 0) {
      for (let i = 0; i < count; i += 1) {
        weights[i] /= totalWeight;
      }
      diverging = false;
    } else {
      diverging = totalWeight > 0;
      let totalPositiveMax = Math.max(Math.abs(totalNegative), Math.abs(totalPositive));
      let totalNegativeMax = Math.max(Math.abs(totalNegative), Math.abs(totalPositive));
      if (config.normalizeVs) {
        totalPositiveMax = Math.max(Math.abs(totalPositive), 1e-9);
        totalNegativeMax = Math.max(Math.abs(totalNegative), 1e-9);
      }

      for (let i = 0; i < count; i += 1) {
        const value = weights[i];
        if (value < 0 && totalNegative < 0) {
          weights[i] = value / Math.max(totalNegativeMax, 1e-9);
        } else if (value > 0 && totalPositive > 0) {
          weights[i] = value / Math.max(totalPositiveMax, 1e-9);
        } else if (totalWeight > 0) {
          weights[i] = value / totalWeight;
        } else {
          weights[i] = 0;
        }
      }
    }

    const colormapKey = diverging ? config.divergingColormap : config.colormap;
    return {
      mode: 'difference',
      nodeIndices,
      count,
      weights,
      diverging,
      positionCount: Math.max(0, Math.floor(Number(network?.nodeCount ?? 0))),
      colormapKey,
      valueDomain: null,
    };
  }

  buildLogRatioComputed(network, config, nodeIndices, edgeIndices, count) {
    if (!this._logRatioWeights.numerator || !this._logRatioWeights.denominator || this._logRatioWeights.count !== count) {
      this._logRatioWeights = {
        count,
        numerator: new Float32Array(count),
        denominator: new Float32Array(count),
      };
    }

    const numeratorWeights = this._logRatioWeights.numerator;
    const denominatorWeights = this._logRatioWeights.denominator;
    const numeratorReader = this.makePropertyReader(network, config.property, edgeIndices);
    const baselineKey = config.compareProperty;
    const denominatorReader = this.makePropertyReader(network, baselineKey, edgeIndices);

    let numeratorTotal = 0;
    let denominatorTotal = 0;

    for (let i = 0; i < count; i += 1) {
      const nodeId = nodeIndices[i] >>> 0;
      const numerator = Math.max(0, toFiniteNumber(numeratorReader(nodeId), 0));
      const denominator = Math.max(0, toFiniteNumber(denominatorReader(nodeId), 0));
      numeratorWeights[i] = numerator;
      denominatorWeights[i] = denominator;
      numeratorTotal += numerator;
      denominatorTotal += denominator;
    }

    if (denominatorTotal <= 0) {
      return {
        mode: 'logRatio',
        nodeIndices: null,
        count: 0,
        numeratorWeights: null,
        denominatorWeights: null,
        diverging: true,
        positionCount: Math.max(0, Math.floor(Number(network?.nodeCount ?? 0))),
        colormapKey: config.logRatioColormap ?? config.divergingColormap,
        valueDomain: [-config.logRatioRange, config.logRatioRange],
        baselineLabel: baselineKey,
        numeratorTotal: 0,
        denominatorTotal,
      };
    }

    for (let i = 0; i < count; i += 1) {
      numeratorWeights[i] = numeratorTotal > 0 ? (numeratorWeights[i] / numeratorTotal) : 0;
      denominatorWeights[i] = denominatorWeights[i] / denominatorTotal;
    }

    return {
      mode: 'logRatio',
      nodeIndices,
      count,
      numeratorWeights,
      denominatorWeights,
      diverging: true,
      positionCount: Math.max(0, Math.floor(Number(network?.nodeCount ?? 0))),
      colormapKey: config.logRatioColormap ?? config.divergingColormap,
      valueDomain: [-config.logRatioRange, config.logRatioRange],
      baselineLabel: baselineKey,
      numeratorTotal,
      denominatorTotal,
    };
  }

  makePropertyReader(network, propertyName, edgeIndices = null) {
    const key = typeof propertyName === 'string' ? propertyName.trim() : '';
    if (!key || key === 'Uniform') {
      return () => 1;
    }
    if (key === 'Degree') {
      const degree = this.getDegreeValues(network, edgeIndices);
      return (nodeId) => degree?.[nodeId] ?? 0;
    }

    let buffer = null;
    let dimension = 1;
    try {
      const attrBuffer = network.getNodeAttributeBuffer?.(key) ?? null;
      if (!attrBuffer?.view) {
        return () => 0;
      }
      buffer = attrBuffer.view;
      dimension = Math.max(1, Math.floor(attrBuffer.dimension ?? 1));
    } catch (_) {
      return () => 0;
    }

    return (nodeId) => {
      const offset = nodeId * dimension;
      if (offset < 0 || offset >= buffer.length) return 0;
      const value = buffer[offset];
      return Number.isFinite(value) ? value : 0;
    };
  }

  getDegreeValues(network, edgeIndicesOverride = null) {
    let edgeVersion = 0;
    const usesOverride = edgeIndicesOverride instanceof Uint32Array;
    try {
      edgeVersion = toFiniteNumber(network?.getTopologyVersions?.()?.edge, 0);
    } catch (_) {
      edgeVersion = toFiniteNumber(edgeIndicesOverride?.length ?? network?.edgeCount, 0);
    }

    const sameCache = (
      this._degreeCache.network === network
      && this._degreeCache.edgeVersion === edgeVersion
      && this._degreeCache.usesOverride === usesOverride
      && this._degreeCache.values
    );
    if (sameCache) {
      return this._degreeCache.values;
    }

    const nodeCount = Math.max(0, Math.floor(Number(network?.nodeCount ?? 0)));
    const degrees = new Float32Array(nodeCount);
    this.withBufferAccess(() => {
      const edgeIndices = edgeIndicesOverride ?? network?.edgeIndices ?? null;
      const edgesView = network?.edgesView ?? null;
      if (!edgesView || !edgeIndices || !edgeIndices.length) return;
      for (let i = 0; i < edgeIndices.length; i += 1) {
        const edgeId = edgeIndices[i] >>> 0;
        const base = edgeId * 2;
        const source = edgesView[base] >>> 0;
        const target = edgesView[base + 1] >>> 0;
        if (source < degrees.length) degrees[source] += 1;
        if (target < degrees.length) degrees[target] += 1;
      }
    });

    this._degreeCache = {
      network,
      edgeVersion,
      usesOverride,
      values: degrees,
    };
    return degrees;
  }

  readNodePositionInfo(network) {
    let info = null;
    this.withBufferAccess(() => {
      const supplied = this.getNodePositionInfo?.(network) ?? null;
      if (supplied && typeof supplied === 'object') {
        const view = supplied.view ?? null;
        const fallbackCount = view && Number.isFinite(view.length) ? Math.floor(view.length / 3) : 0;
        const count = Number.isFinite(supplied.count)
          ? Math.max(0, Math.floor(Number(supplied.count)))
          : fallbackCount;
        const version = Number.isFinite(supplied.version) ? Number(supplied.version) : null;
        info = { view, count, version };
        return;
      }

      const view = this.getNodePositionView?.(network) ?? null;
      const count = view && Number.isFinite(view.length) ? Math.floor(view.length / 3) : 0;
      info = { view, count, version: null };
    });
    return info ?? { view: null, count: 0, version: null };
  }

  isDelegatePositionSourceActive(graphLayer) {
    return Boolean(graphLayer?.positionDelegate);
  }

  initializeWebGL(device) {
    const gl = device?.gl;
    if (!gl) return;
    this.webgl.extColorFloat = Boolean(gl.getExtension('EXT_color_buffer_float'));

    this.webgl.programSplat = createProgram(gl, SPLAT_VERT_WEBGL, SPLAT_FRAG_WEBGL);
    this.webgl.programComposite = createProgram(gl, FULLSCREEN_VERT_WEBGL, COMPOSITE_FRAG_WEBGL);
    this.webgl.programCompositeLogRatio = createProgram(gl, FULLSCREEN_VERT_WEBGL, COMPOSITE_LOG_RATIO_FRAG_WEBGL);

    this.webgl.uniforms.splat = {
      u_viewProjection: gl.getUniformLocation(this.webgl.programSplat, 'u_viewProjection'),
      u_nodeIndices: gl.getUniformLocation(this.webgl.programSplat, 'u_nodeIndices'),
      u_nodeWeights: gl.getUniformLocation(this.webgl.programSplat, 'u_nodeWeights'),
      u_nodePositions: gl.getUniformLocation(this.webgl.programSplat, 'u_nodePositions'),
      u_viewport: gl.getUniformLocation(this.webgl.programSplat, 'u_viewport'),
      u_densitySize: gl.getUniformLocation(this.webgl.programSplat, 'u_densitySize'),
      u_bandwidthPx: gl.getUniformLocation(this.webgl.programSplat, 'u_bandwidthPx'),
      u_nodeCount: gl.getUniformLocation(this.webgl.programSplat, 'u_nodeCount'),
      u_indexTexWidth: gl.getUniformLocation(this.webgl.programSplat, 'u_indexTexWidth'),
      u_weightTexWidth: gl.getUniformLocation(this.webgl.programSplat, 'u_weightTexWidth'),
      u_positionTexWidth: gl.getUniformLocation(this.webgl.programSplat, 'u_positionTexWidth'),
      u_positionCount: gl.getUniformLocation(this.webgl.programSplat, 'u_positionCount'),
    };

    this.webgl.uniforms.composite = {
      u_densityTex: gl.getUniformLocation(this.webgl.programComposite, 'u_densityTex'),
      u_colormapTex: gl.getUniformLocation(this.webgl.programComposite, 'u_colormapTex'),
      u_weightScale: gl.getUniformLocation(this.webgl.programComposite, 'u_weightScale'),
      u_diverging: gl.getUniformLocation(this.webgl.programComposite, 'u_diverging'),
      u_topographic: gl.getUniformLocation(this.webgl.programComposite, 'u_topographic'),
      u_contourLevels: gl.getUniformLocation(this.webgl.programComposite, 'u_contourLevels'),
      u_contourWidth: gl.getUniformLocation(this.webgl.programComposite, 'u_contourWidth'),
    };
    this.webgl.uniforms.compositeLogRatio = {
      u_numeratorTex: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_numeratorTex'),
      u_denominatorTex: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_denominatorTex'),
      u_colormapTex: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_colormapTex'),
      u_epsilon: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_epsilon'),
      u_domainMax: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_domainMax'),
      u_supportFloor: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_supportFloor'),
      u_supportCeil: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_supportCeil'),
      u_numeratorTotal: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_numeratorTotal'),
      u_denominatorTotal: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_denominatorTotal'),
      u_supportCorrection: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_supportCorrection'),
      u_zScore: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_zScore'),
      u_topographic: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_topographic'),
      u_contourLevels: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_contourLevels'),
      u_contourWidth: gl.getUniformLocation(this.webgl.programCompositeLogRatio, 'u_contourWidth'),
    };

    const corners = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    const quad = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]);

    this.webgl.cornerBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.webgl.cornerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);

    this.webgl.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.webgl.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.webgl.vaoSplat = gl.createVertexArray();
    gl.bindVertexArray(this.webgl.vaoSplat);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.webgl.cornerBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    gl.bindVertexArray(null);

    this.webgl.vaoQuad = gl.createVertexArray();
    gl.bindVertexArray(this.webgl.vaoQuad);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.webgl.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);

    this.webgl.nodeIndicesTex = this.createWebGLDataTexture(gl, true);
    this.webgl.nodeWeightsTex = this.createWebGLDataTexture(gl, false);
    this.webgl.numeratorWeightsTex = this.createWebGLDataTexture(gl, false);
    this.webgl.denominatorWeightsTex = this.createWebGLDataTexture(gl, false);
    this.webgl.fallbackPositionsTex = this.createWebGLDataTexture(gl, false);
    this.webgl.colormapTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.webgl.colormapTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.webgl.densityFbo = gl.createFramebuffer();
    this.webgl.numeratorFbo = gl.createFramebuffer();
    this.webgl.denominatorFbo = gl.createFramebuffer();

    this.webgl.ready = true;
  }

  createWebGLDataTexture(gl, integer = false) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (integer) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, 1, 1, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, new Uint32Array([0]));
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 1, 1, 0, gl.RED, gl.FLOAT, new Float32Array([0]));
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  destroyWebGL() {
    const gl = this.device?.gl;
    if (!gl) return;

    const w = this.webgl;
    if (w.programSplat) gl.deleteProgram(w.programSplat);
    if (w.programComposite) gl.deleteProgram(w.programComposite);
    if (w.programCompositeLogRatio) gl.deleteProgram(w.programCompositeLogRatio);
    if (w.vaoSplat) gl.deleteVertexArray(w.vaoSplat);
    if (w.vaoQuad) gl.deleteVertexArray(w.vaoQuad);
    if (w.cornerBuffer) gl.deleteBuffer(w.cornerBuffer);
    if (w.quadBuffer) gl.deleteBuffer(w.quadBuffer);
    if (w.densityFbo) gl.deleteFramebuffer(w.densityFbo);
    if (w.numeratorFbo) gl.deleteFramebuffer(w.numeratorFbo);
    if (w.denominatorFbo) gl.deleteFramebuffer(w.denominatorFbo);
    if (w.densityTex) gl.deleteTexture(w.densityTex);
    if (w.numeratorTex) gl.deleteTexture(w.numeratorTex);
    if (w.denominatorTex) gl.deleteTexture(w.denominatorTex);
    if (w.nodeIndicesTex) gl.deleteTexture(w.nodeIndicesTex);
    if (w.nodeWeightsTex) gl.deleteTexture(w.nodeWeightsTex);
    if (w.numeratorWeightsTex) gl.deleteTexture(w.numeratorWeightsTex);
    if (w.denominatorWeightsTex) gl.deleteTexture(w.denominatorWeightsTex);
    if (w.fallbackPositionsTex) gl.deleteTexture(w.fallbackPositionsTex);
    if (w.colormapTex) gl.deleteTexture(w.colormapTex);

    w.ready = false;
  }

  ensureWebGLRenderTarget(gl, {
    textureKey,
    fboKey,
    widthKey,
    heightKey,
    width,
    height,
  }) {
    if (
      this.webgl[textureKey]
      && this.webgl[widthKey] === width
      && this.webgl[heightKey] === height
    ) {
      return true;
    }

    if (this.webgl[textureKey]) {
      gl.deleteTexture(this.webgl[textureKey]);
      this.webgl[textureKey] = null;
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if (this.webgl.extColorFloat) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.webgl[fboKey]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteTexture(tex);
      return false;
    }

    this.webgl[textureKey] = tex;
    this.webgl[widthKey] = width;
    this.webgl[heightKey] = height;
    return true;
  }

  ensureWebGLDensityTarget(gl, width, height) {
    return this.ensureWebGLRenderTarget(gl, {
      textureKey: 'densityTex',
      fboKey: 'densityFbo',
      widthKey: 'densityWidth',
      heightKey: 'densityHeight',
      width,
      height,
    });
  }

  ensureWebGLLogRatioTargets(gl, width, height) {
    const numeratorOk = this.ensureWebGLRenderTarget(gl, {
      textureKey: 'numeratorTex',
      fboKey: 'numeratorFbo',
      widthKey: 'numeratorWidth',
      heightKey: 'numeratorHeight',
      width,
      height,
    });
    if (!numeratorOk) return false;
    return this.ensureWebGLRenderTarget(gl, {
      textureKey: 'denominatorTex',
      fboKey: 'denominatorFbo',
      widthKey: 'denominatorWidth',
      heightKey: 'denominatorHeight',
      width,
      height,
    });
  }

  ensureWebGLColormapTexture(gl, colormapName, diverging) {
    if (
      this.webgl.colormapTex
      && this.webgl.colormapKey === colormapName
      && this.webgl.colormapDiverging === diverging
    ) {
      return;
    }

    const resolved = resolveColormap(colormapName) || resolveColormap('interpolateOrRd');
    const count = 256;
    const data = new Uint8Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const color = resolved?.interpolate?.(t) ?? [0, 0, 0, 1];
      const offset = i * 4;
      data[offset + 0] = clamp(Math.round((color[0] ?? 0) * 255), 0, 255);
      data[offset + 1] = clamp(Math.round((color[1] ?? 0) * 255), 0, 255);
      data[offset + 2] = clamp(Math.round((color[2] ?? 0) * 255), 0, 255);
      data[offset + 3] = clamp(Math.round((color[3] ?? 1) * 255), 0, 255);
    }

    gl.bindTexture(gl.TEXTURE_2D, this.webgl.colormapTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, count, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);

    this.webgl.colormapKey = colormapName;
    this.webgl.colormapDiverging = diverging;
  }

  uploadWebGLUintTexture(gl, texture, typedArray, layout, versionTag) {
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 16384;
    const nextLayout = getTextureLayout(max, layout?.count ?? typedArray.length);
    const sameLayout = layout && layout.width === nextLayout.width && layout.height === nextLayout.height;

    gl.bindTexture(gl.TEXTURE_2D, texture);

    if (!sameLayout) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R32UI,
        nextLayout.width,
        nextLayout.height,
        0,
        gl.RED_INTEGER,
        gl.UNSIGNED_INT,
        null,
      );
    }

    if (nextLayout.height === 1) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        nextLayout.width,
        1,
        gl.RED_INTEGER,
        gl.UNSIGNED_INT,
        typedArray.subarray(0, nextLayout.width),
      );
    } else {
      let offset = 0;
      for (let y = 0; y < nextLayout.height; y += 1) {
        const row = Math.min(nextLayout.width, nextLayout.count - offset);
        if (row <= 0) break;
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          y,
          row,
          1,
          gl.RED_INTEGER,
          gl.UNSIGNED_INT,
          typedArray.subarray(offset, offset + row),
        );
        offset += row;
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    return {
      width: nextLayout.width,
      height: nextLayout.height,
      count: nextLayout.count,
      version: versionTag,
    };
  }

  uploadWebGLFloatTexture(gl, texture, typedArray, layout, versionTag) {
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? 16384;
    const components = Math.max(1, Math.min(4, Math.floor(Number(layout?.components ?? 1))));
    const texelCount = Math.max(1, Math.floor(Number(layout?.count ?? typedArray.length)));
    const nextLayout = getTextureLayout(max, texelCount);
    const sameLayout = layout && layout.width === nextLayout.width && layout.height === nextLayout.height;
    const formatInfo = components === 1
      ? { internalFormat: gl.R32F, format: gl.RED }
      : (components === 2
        ? { internalFormat: gl.RG32F, format: gl.RG }
        : (components === 3
          ? { internalFormat: gl.RGB32F, format: gl.RGB }
          : { internalFormat: gl.RGBA32F, format: gl.RGBA }));

    gl.bindTexture(gl.TEXTURE_2D, texture);

    if (!sameLayout) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        formatInfo.internalFormat,
        nextLayout.width,
        nextLayout.height,
        0,
        formatInfo.format,
        gl.FLOAT,
        null,
      );
    }

    if (nextLayout.height === 1) {
      const valueCount = nextLayout.width * components;
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        nextLayout.width,
        1,
        formatInfo.format,
        gl.FLOAT,
        typedArray.subarray(0, valueCount),
      );
    } else {
      let offset = 0;
      for (let y = 0; y < nextLayout.height; y += 1) {
        const usedTexels = Math.floor(offset / components);
        const row = Math.min(nextLayout.width, nextLayout.count - usedTexels);
        if (row <= 0) break;
        const rowValueCount = row * components;
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          y,
          row,
          1,
          formatInfo.format,
          gl.FLOAT,
          typedArray.subarray(offset, offset + rowValueCount),
        );
        offset += rowValueCount;
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    return {
      width: nextLayout.width,
      height: nextLayout.height,
      count: nextLayout.count,
      version: versionTag,
    };
  }

  resolveWebGLPositionTexture(frame, computed) {
    const graphLayer = this.getGraphLayer?.();
    const shared = graphLayer?.getSharedSparseResources?.() ?? null;
    const delegatePositionSource = this.isDelegatePositionSourceActive(graphLayer);
    const positionInfo = this.readNodePositionInfo(frame?.network);
    const currentPositionVersion = Number.isFinite(positionInfo?.version) ? Number(positionInfo.version) : null;
    const requiredPositionCount = Math.max(
      0,
      Math.floor(Number(positionInfo?.count ?? computed.positionCount ?? 0)),
    );

    const sharedTex = shared?.textures?.nodePositions ?? null;
    const sharedMeta = shared?.textureMeta?.nodePositions ?? null;
    const sharedPositionCount = Math.max(
      0,
      Math.floor(Number(sharedMeta?.count ?? requiredPositionCount ?? computed.positionCount ?? 0)),
    );
    const sharedVersion = Number.isFinite(sharedMeta?.version) ? Number(sharedMeta.version) : null;
    const hasCurrentVersion = Number.isFinite(currentPositionVersion);
    const versionMatches = delegatePositionSource
      || !hasCurrentVersion
      || (Number.isFinite(sharedVersion) && sharedVersion === currentPositionVersion);
    const countMatches = requiredPositionCount <= 0 || sharedPositionCount >= requiredPositionCount;
    if (sharedTex && sharedPositionCount > 0 && versionMatches && countMatches) {
      return {
        texture: sharedTex,
        texWidth: getTextureLayout(this.device.gl.getParameter(this.device.gl.MAX_TEXTURE_SIZE), sharedPositionCount).width,
        positionCount: sharedPositionCount,
      };
    }

    const view = positionInfo?.view ?? null;
    if (!view || view.length < 3) return null;

    const count = Math.max(1, Math.floor(Number(positionInfo?.count ?? Math.floor(view.length / 3))));
    const key = `${view.buffer}|${view.byteOffset}|${view.byteLength}|${count}|${String(currentPositionVersion ?? 'na')}`;
    if (this.webgl.fallbackPositionsMeta?.key !== key || this.webgl.fallbackPositionsMeta?.count !== count) {
      const layout = this.uploadWebGLFloatTexture(
        this.device.gl,
        this.webgl.fallbackPositionsTex,
        view,
        { count, components: 3 },
        key,
      );
      this.webgl.fallbackPositionsLayout = layout;
      this.webgl.fallbackPositionsMeta = { key, count };
    }
    return {
      texture: this.webgl.fallbackPositionsTex,
      texWidth: getTextureLayout(this.device.gl.getParameter(this.device.gl.MAX_TEXTURE_SIZE), count).width,
      positionCount: count,
    };
  }

  uploadWebGLWeightTexture(gl, textureKey, layoutKey, metaKey, weights, count) {
    const weightKey = `${this.version}|${textureKey}|${count}|${this.webgl[metaKey]?.tick ?? 0}`;
    this.webgl[layoutKey] = this.uploadWebGLFloatTexture(
      gl,
      this.webgl[textureKey],
      weights,
      { count },
      weightKey,
    );
    this.webgl[metaKey] = { version: weightKey, tick: (this.webgl[metaKey]?.tick ?? 0) + 1 };
  }

  renderWebGLSplatPass(gl, framebuffer, weightTexture, weightLayout, frame, cameraUniforms, computed, densityWidth, densityHeight, bandwidthViewport, positionBinding) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, densityWidth, densityHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(this.webgl.programSplat);
    gl.bindVertexArray(this.webgl.vaoSplat);

    gl.uniformMatrix4fv(this.webgl.uniforms.splat.u_viewProjection, false, cameraUniforms.viewProjection);
    gl.uniform2f(this.webgl.uniforms.splat.u_viewport, bandwidthViewport.width, bandwidthViewport.height);
    gl.uniform2f(this.webgl.uniforms.splat.u_densitySize, densityWidth, densityHeight);
    const splatBandwidth = this.resolveSplatBandwidthPx(frame?.camera, cameraUniforms);
    gl.uniform1f(this.webgl.uniforms.splat.u_bandwidthPx, splatBandwidth);
    gl.uniform1i(this.webgl.uniforms.splat.u_nodeCount, computed.count);
    gl.uniform1i(this.webgl.uniforms.splat.u_indexTexWidth, this.webgl.nodeIndicesLayout?.width ?? computed.count);
    gl.uniform1i(this.webgl.uniforms.splat.u_weightTexWidth, weightLayout?.width ?? computed.count);
    gl.uniform1i(this.webgl.uniforms.splat.u_positionTexWidth, positionBinding.texWidth);
    gl.uniform1i(this.webgl.uniforms.splat.u_positionCount, positionBinding.positionCount);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.webgl.nodeIndicesTex);
    gl.uniform1i(this.webgl.uniforms.splat.u_nodeIndices, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, weightTexture);
    gl.uniform1i(this.webgl.uniforms.splat.u_nodeWeights, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, positionBinding.texture);
    gl.uniform1i(this.webgl.uniforms.splat.u_nodePositions, 2);

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, computed.count);
  }

  renderWebGL(context, frame, cameraUniforms, computed) {
    const gl = context.gl;
    if (!this.webgl.ready || !gl) return;

    const viewport = context.viewport ?? [0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight];
    const viewportWidth = Math.max(1, viewport[2]);
    const viewportHeight = Math.max(1, viewport[3]);
    const bandwidthViewport = resolveDensityBandwidthViewport(context, cameraUniforms, viewportWidth, viewportHeight);
    const densityResolutionViewport = context?.target?.exportFigureLogicalViewport
      ? bandwidthViewport
      : { width: viewportWidth, height: viewportHeight };
    const densityWidth = Math.max(1, Math.floor(densityResolutionViewport.width * this.config.qualityScale));
    const densityHeight = Math.max(1, Math.floor(densityResolutionViewport.height * this.config.qualityScale));

    const positionBinding = this.resolveWebGLPositionTexture(frame, computed);
    if (!positionBinding?.texture || !positionBinding?.positionCount) {
      return;
    }

    const nodeIndices = computed.nodeIndices;
    const indexKey = `${nodeIndices.buffer}|${nodeIndices.byteOffset}|${nodeIndices.byteLength}|${computed.count}`;
    if (this.webgl.nodeIndicesMeta?.version !== indexKey) {
      this.webgl.nodeIndicesLayout = this.uploadWebGLUintTexture(
        gl,
        this.webgl.nodeIndicesTex,
        nodeIndices,
        { count: computed.count },
        indexKey,
      );
      this.webgl.nodeIndicesMeta = { version: indexKey };
    }

    this.ensureWebGLColormapTexture(gl, computed.colormapKey, computed.diverging);

    const prevBlendEnabled = gl.isEnabled(gl.BLEND);
    const prevDepthEnabled = gl.isEnabled(gl.DEPTH_TEST);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);

    if (computed.mode === 'logRatio') {
      this.renderWebGLLogRatio(context, frame, cameraUniforms, computed, {
        viewport,
        viewportWidth,
        viewportHeight,
        densityWidth,
        densityHeight,
        bandwidthViewport,
        positionBinding,
      });
    } else {
      this.renderWebGLDifference(context, frame, cameraUniforms, computed, {
        viewport,
        viewportWidth,
        viewportHeight,
        densityWidth,
        densityHeight,
        bandwidthViewport,
        positionBinding,
      });
    }

    gl.bindVertexArray(null);
    if (prevDepthEnabled) gl.enable(gl.DEPTH_TEST);
    else gl.disable(gl.DEPTH_TEST);
    if (!prevBlendEnabled) gl.disable(gl.BLEND);
    else gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  renderWebGLDifference(context, frame, cameraUniforms, computed, renderState) {
    const gl = context.gl;
    if (!this.ensureWebGLDensityTarget(gl, renderState.densityWidth, renderState.densityHeight)) {
      return;
    }

    this.uploadWebGLWeightTexture(gl, 'nodeWeightsTex', 'nodeWeightsLayout', 'nodeWeightsMeta', computed.weights, computed.count);
    this.renderWebGLSplatPass(
      gl,
      this.webgl.densityFbo,
      this.webgl.nodeWeightsTex,
      this.webgl.nodeWeightsLayout,
      frame,
      cameraUniforms,
      computed,
      renderState.densityWidth,
      renderState.densityHeight,
      renderState.bandwidthViewport,
      renderState.positionBinding,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, context.target?.handle ?? null);
    gl.viewport(renderState.viewport[0], renderState.viewport[1], renderState.viewportWidth, renderState.viewportHeight);
    gl.useProgram(this.webgl.programComposite);
    gl.bindVertexArray(this.webgl.vaoQuad);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.webgl.densityTex);
    gl.uniform1i(this.webgl.uniforms.composite.u_densityTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.webgl.colormapTex);
    gl.uniform1i(this.webgl.uniforms.composite.u_colormapTex, 1);

    gl.uniform1f(this.webgl.uniforms.composite.u_weightScale, this.config.weightScale);
    gl.uniform1i(this.webgl.uniforms.composite.u_diverging, computed.diverging ? 1 : 0);
    gl.uniform1i(this.webgl.uniforms.composite.u_topographic, this.config.topographic ? 1 : 0);
    gl.uniform1f(this.webgl.uniforms.composite.u_contourLevels, 14.0);
    gl.uniform1f(this.webgl.uniforms.composite.u_contourWidth, 0.18);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  renderWebGLLogRatio(context, frame, cameraUniforms, computed, renderState) {
    const gl = context.gl;
    if (!this.ensureWebGLLogRatioTargets(gl, renderState.densityWidth, renderState.densityHeight)) {
      return;
    }

    this.uploadWebGLWeightTexture(
      gl,
      'numeratorWeightsTex',
      'numeratorWeightsLayout',
      'numeratorWeightsMeta',
      computed.numeratorWeights,
      computed.count,
    );
    this.uploadWebGLWeightTexture(
      gl,
      'denominatorWeightsTex',
      'denominatorWeightsLayout',
      'denominatorWeightsMeta',
      computed.denominatorWeights,
      computed.count,
    );

    this.renderWebGLSplatPass(
      gl,
      this.webgl.numeratorFbo,
      this.webgl.numeratorWeightsTex,
      this.webgl.numeratorWeightsLayout,
      frame,
      cameraUniforms,
      computed,
      renderState.densityWidth,
      renderState.densityHeight,
      renderState.bandwidthViewport,
      renderState.positionBinding,
    );
    this.renderWebGLSplatPass(
      gl,
      this.webgl.denominatorFbo,
      this.webgl.denominatorWeightsTex,
      this.webgl.denominatorWeightsLayout,
      frame,
      cameraUniforms,
      computed,
      renderState.densityWidth,
      renderState.densityHeight,
      renderState.bandwidthViewport,
      renderState.positionBinding,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, context.target?.handle ?? null);
    gl.viewport(renderState.viewport[0], renderState.viewport[1], renderState.viewportWidth, renderState.viewportHeight);
    gl.useProgram(this.webgl.programCompositeLogRatio);
    gl.bindVertexArray(this.webgl.vaoQuad);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.webgl.numeratorTex);
    gl.uniform1i(this.webgl.uniforms.compositeLogRatio.u_numeratorTex, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.webgl.denominatorTex);
    gl.uniform1i(this.webgl.uniforms.compositeLogRatio.u_denominatorTex, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.webgl.colormapTex);
    gl.uniform1i(this.webgl.uniforms.compositeLogRatio.u_colormapTex, 2);

    const supportWindow = resolveLogRatioSupportWindow(
      this.config.epsilon,
      this.config.maskThreshold,
      this.config.logRatioSupportCorrection,
    );
    gl.uniform1f(this.webgl.uniforms.compositeLogRatio.u_epsilon, this.config.epsilon);
    gl.uniform1f(this.webgl.uniforms.compositeLogRatio.u_domainMax, Math.max(Math.abs(computed.valueDomain?.[1] ?? this.config.logRatioRange), 1e-6));
    gl.uniform1f(this.webgl.uniforms.compositeLogRatio.u_supportFloor, supportWindow.floor);
    gl.uniform1f(this.webgl.uniforms.compositeLogRatio.u_supportCeil, supportWindow.ceil);
    gl.uniform1f(this.webgl.uniforms.compositeLogRatio.u_numeratorTotal, Math.max(Number(computed.numeratorTotal ?? 0), 0));
    gl.uniform1f(this.webgl.uniforms.compositeLogRatio.u_denominatorTotal, Math.max(Number(computed.denominatorTotal ?? 0), 0));
    gl.uniform1i(this.webgl.uniforms.compositeLogRatio.u_supportCorrection, this.config.logRatioSupportCorrection ? 1 : 0);
    gl.uniform1i(this.webgl.uniforms.compositeLogRatio.u_zScore, this.config.logRatioZScore ? 1 : 0);
    gl.uniform1i(this.webgl.uniforms.compositeLogRatio.u_topographic, this.config.topographic ? 1 : 0);
    gl.uniform1f(this.webgl.uniforms.compositeLogRatio.u_contourLevels, 14.0);
    gl.uniform1f(this.webgl.uniforms.compositeLogRatio.u_contourWidth, 0.18);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  initializeWebGPU(device) {
    const gpu = device?.device;
    if (!gpu) return;

    this.webgpu.cameraBuffer = gpu.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.webgpu.compositeParamsBuffer = gpu.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.webgpu.compositeLogRatioParamsBuffer = gpu.createBuffer({
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const corners = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    this.webgpu.cornersBuffer = gpu.createBuffer({
      size: corners.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.webgpu.cornersBuffer.getMappedRange()).set(corners);
    this.webgpu.cornersBuffer.unmap();

    this.webgpu.sampler = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    const splatModule = gpu.createShaderModule({ code: SPLAT_WGSL });
    const compositeModule = gpu.createShaderModule({ code: COMPOSITE_WGSL });
    const compositeLogRatioModule = gpu.createShaderModule({ code: COMPOSITE_LOG_RATIO_WGSL });

    const splatLayout = gpu.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    const compositeLayout = gpu.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const compositeLogRatioLayout = gpu.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.webgpu.pipelineSplat = gpu.createRenderPipeline({
      layout: gpu.createPipelineLayout({ bindGroupLayouts: [splatLayout] }),
      vertex: {
        module: splatModule,
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
        }],
      },
      fragment: {
        module: splatModule,
        entryPoint: 'fsMain',
        targets: [{
          format: 'rgba16float',
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
    });

    this.webgpu.pipelineComposite = gpu.createRenderPipeline({
      layout: gpu.createPipelineLayout({ bindGroupLayouts: [compositeLayout] }),
      vertex: {
        module: compositeModule,
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
          ],
        }],
      },
      fragment: {
        module: compositeModule,
        entryPoint: 'fsMain',
        targets: [{
          format: device.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
      depthStencil: {
        format: device.depthFormat ?? 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'always',
      },
    });
    this.webgpu.pipelineCompositeLogRatio = gpu.createRenderPipeline({
      layout: gpu.createPipelineLayout({ bindGroupLayouts: [compositeLogRatioLayout] }),
      vertex: {
        module: compositeLogRatioModule,
        entryPoint: 'vsMain',
        buffers: [{
          arrayStride: 16,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
          ],
        }],
      },
      fragment: {
        module: compositeLogRatioModule,
        entryPoint: 'fsMain',
        targets: [{
          format: device.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-strip' },
      depthStencil: {
        format: device.depthFormat ?? 'depth24plus',
        depthWriteEnabled: false,
        depthCompare: 'always',
      },
    });

    this.webgpu.splatLayout = splatLayout;
    this.webgpu.compositeLayout = compositeLayout;
    this.webgpu.compositeLogRatioLayout = compositeLogRatioLayout;
    this.webgpu.ready = true;
  }

  destroyWebGPU() {
    this.webgpu.cameraBuffer?.destroy?.();
    this.webgpu.compositeParamsBuffer?.destroy?.();
    this.webgpu.compositeLogRatioParamsBuffer?.destroy?.();
    this.webgpu.cornersBuffer?.destroy?.();
    this.webgpu.densityTexture?.destroy?.();
    this.webgpu.numeratorTexture?.destroy?.();
    this.webgpu.denominatorTexture?.destroy?.();
    this.webgpu.colormapTexture?.destroy?.();
    this.webgpu.ready = false;
  }

  ensureWebGPUDensityTexture(width, height) {
    const gpu = this.device?.device;
    if (!gpu) return false;
    if (
      this.webgpu.densityTexture
      && this.webgpu.densitySize.width === width
      && this.webgpu.densitySize.height === height
    ) {
      return true;
    }

    this.webgpu.densityTexture?.destroy?.();
    this.webgpu.densityTexture = gpu.createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.webgpu.densitySize = { width, height };
    return true;
  }

  ensureWebGPULogRatioTextures(width, height) {
    const gpu = this.device?.device;
    if (!gpu) return false;
    if (
      this.webgpu.numeratorTexture
      && this.webgpu.denominatorTexture
      && this.webgpu.logRatioSize.width === width
      && this.webgpu.logRatioSize.height === height
    ) {
      return true;
    }

    this.webgpu.numeratorTexture?.destroy?.();
    this.webgpu.denominatorTexture?.destroy?.();
    this.webgpu.numeratorTexture = gpu.createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.webgpu.denominatorTexture = gpu.createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: 'rgba16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.webgpu.logRatioSize = { width, height };
    return true;
  }

  ensureWebGPUColormapTexture(colormapName, diverging) {
    const gpu = this.device?.device;
    if (!gpu) return false;
    if (
      this.webgpu.colormapTexture
      && this.webgpu.colormapKey === colormapName
      && this.webgpu.colormapDiverging === diverging
    ) {
      return true;
    }

    const resolved = resolveColormap(colormapName) || resolveColormap('interpolateOrRd');
    const count = 256;
    const data = new Uint8Array(count * 4);
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const color = resolved?.interpolate?.(t) ?? [0, 0, 0, 1];
      const offset = i * 4;
      data[offset + 0] = clamp(Math.round((color[0] ?? 0) * 255), 0, 255);
      data[offset + 1] = clamp(Math.round((color[1] ?? 0) * 255), 0, 255);
      data[offset + 2] = clamp(Math.round((color[2] ?? 0) * 255), 0, 255);
      data[offset + 3] = clamp(Math.round((color[3] ?? 1) * 255), 0, 255);
    }

    this.webgpu.colormapTexture?.destroy?.();
    this.webgpu.colormapTexture = gpu.createTexture({
      size: { width: count, height: 1, depthOrArrayLayers: 1 },
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });

    gpu.queue.writeTexture(
      { texture: this.webgpu.colormapTexture },
      data,
      { bytesPerRow: count * 4 },
      { width: count, height: 1, depthOrArrayLayers: 1 },
    );

    this.webgpu.colormapKey = colormapName;
    this.webgpu.colormapDiverging = diverging;
    return true;
  }

  resolveWebGPUPositionAndIndexBuffers(frame, computed) {
    const graphLayer = this.getGraphLayer?.();
    const shared = graphLayer?.getSharedSparseResources?.() ?? null;
    const delegatePositionSource = this.isDelegatePositionSourceActive(graphLayer);
    const sharedBuffers = shared?.buffers ?? null;
    const positionInfo = this.readNodePositionInfo(frame?.network);
    const currentPositionVersion = Number.isFinite(positionInfo?.version) ? Number(positionInfo.version) : null;
    const requiredPositionCount = Math.max(
      0,
      Math.floor(Number(positionInfo?.count ?? computed.positionCount ?? 0)),
    );

    const sharedIndices = sharedBuffers?.['indirect:node:indices'] ?? null;
    const sharedPositions = sharedBuffers?.['indirect:node:positions'] ?? null;
    const sharedPositionCount = resolvePackedVec3Count(
      sharedPositions,
      requiredPositionCount || computed.positionCount || 0,
    );
    const sharedPositionVersion = Number.isFinite(sharedPositions?.version) ? Number(sharedPositions.version) : null;
    const hasCurrentVersion = Number.isFinite(currentPositionVersion);
    const positionVersionMatches = delegatePositionSource
      || !hasCurrentVersion
      || (Number.isFinite(sharedPositionVersion) && sharedPositionVersion === currentPositionVersion);

    const useSharedIndices = sharedIndices?.buffer && Number(sharedIndices?.count) === computed.count;
    const useSharedPositions = sharedPositions?.buffer
      && sharedPositionCount >= requiredPositionCount
      && positionVersionMatches;

    const gpu = this.device?.device;
    const queue = gpu?.queue;
    const resourceCache = this.device?.resourceCache?.webgpu;

    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX;

    let indexBuffer = useSharedIndices ? sharedIndices.buffer : null;
    let positionBuffer = useSharedPositions ? sharedPositions.buffer : null;

    if (!indexBuffer && gpu && queue && resourceCache) {
      indexBuffer = resourceCache.uploadBuffer(
        gpu,
        queue,
        'density:node:indices',
        computed.nodeIndices,
        {
          label: 'Density node indices',
          version: `${computed.nodeIndices.buffer}|${computed.nodeIndices.byteOffset}|${computed.nodeIndices.byteLength}`,
          count: computed.count,
          trackViewIdentity: true,
        },
        storageUsage,
      );
    }

    if (!positionBuffer && gpu && queue && resourceCache) {
      const positionView = positionInfo?.view ?? null;
      if (!positionView || positionView.length < 3) {
        return null;
      }
      const positionCount = Math.max(1, Math.floor(Number(positionInfo?.count ?? Math.floor(positionView.length / 3))));
      positionBuffer = resourceCache.uploadBuffer(
        gpu,
        queue,
        'density:node:positions',
        positionView,
        {
          label: 'Density node positions',
          version: `${positionView.buffer}|${positionView.byteOffset}|${positionView.byteLength}|${String(currentPositionVersion ?? 'na')}`,
          count: positionCount,
          trackViewIdentity: true,
        },
        storageUsage,
      );
      computed.positionCount = positionCount;
    } else if (useSharedPositions) {
      computed.positionCount = sharedPositionCount || computed.positionCount;
    }

    if (!indexBuffer || !positionBuffer) return null;
    return { indexBuffer, positionBuffer };
  }

  renderWebGPUSplatPass(context, bindGroup, targetTexture, computed) {
    const accumulatePass = context.commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: targetTexture.createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    accumulatePass.setPipeline(this.webgpu.pipelineSplat);
    accumulatePass.setBindGroup(0, bindGroup);
    accumulatePass.setVertexBuffer(0, this.webgpu.cornersBuffer);
    accumulatePass.draw(4, computed.count, 0, 0);
    accumulatePass.end();
  }

  renderWebGPU(context, frame, cameraUniforms, computed) {
    if (!this.webgpu.ready) return;
    const gpu = context.device;
    if (!gpu) return;

    const viewport = context.viewport ?? null;
    const width = viewport ? Math.max(1, Math.floor(viewport.width)) : Math.max(1, Math.floor(context.width));
    const height = viewport ? Math.max(1, Math.floor(viewport.height)) : Math.max(1, Math.floor(context.height));
    const bandwidthViewport = resolveDensityBandwidthViewport(context, cameraUniforms, width, height);
    const densityResolutionViewport = context?.target?.exportFigureLogicalViewport
      ? bandwidthViewport
      : { width, height };
    const densityWidth = Math.max(1, Math.floor(densityResolutionViewport.width * this.config.qualityScale));
    const densityHeight = Math.max(1, Math.floor(densityResolutionViewport.height * this.config.qualityScale));

    if (!this.ensureWebGPUColormapTexture(computed.colormapKey, computed.diverging)) return;

    const shared = this.resolveWebGPUPositionAndIndexBuffers(frame, computed);
    if (!shared) return;

    const resourceCache = this.device?.resourceCache?.webgpu;
    if (!resourceCache) return;
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX;

    const cameraData = new Float32Array(24);
    cameraData.set(cameraUniforms.viewProjection, 0);
    cameraData[16] = bandwidthViewport.width;
    cameraData[17] = bandwidthViewport.height;
    cameraData[18] = densityWidth;
    cameraData[19] = densityHeight;
    cameraData[20] = this.resolveSplatBandwidthPx(frame?.camera, cameraUniforms);
    cameraData[21] = computed.count;
    cameraData[22] = computed.positionCount;
    cameraData[23] = 0;
    gpu.queue.writeBuffer(this.webgpu.cameraBuffer, 0, cameraData);

    if (context.passEncoder) {
      context.passEncoder.end();
      context.passEncoder = null;
    }
    let compositePipeline = null;
    let compositeBindGroup = null;

    if (computed.mode === 'logRatio') {
      if (!this.ensureWebGPULogRatioTextures(densityWidth, densityHeight)) {
        return;
      }

      const numeratorBuffer = resourceCache.uploadBuffer(
        gpu,
        gpu.queue,
        'density:logratio:numerator',
        computed.numeratorWeights,
        {
          label: 'Density log-ratio numerator weights',
          version: `${this.version}:logratio:numerator:${this.webgpu.weightUploadVersion}`,
          count: computed.count,
        },
        storageUsage,
      );
      this.webgpu.weightUploadVersion += 1;

      const denominatorBuffer = resourceCache.uploadBuffer(
        gpu,
        gpu.queue,
        'density:logratio:denominator',
        computed.denominatorWeights,
        {
          label: 'Density log-ratio denominator weights',
          version: `${this.version}:logratio:denominator:${this.webgpu.weightUploadVersion}`,
          count: computed.count,
        },
        storageUsage,
      );
      this.webgpu.weightUploadVersion += 1;

      const numeratorBindGroup = gpu.createBindGroup({
        layout: this.webgpu.splatLayout,
        entries: [
          { binding: 0, resource: { buffer: this.webgpu.cameraBuffer } },
          { binding: 1, resource: { buffer: shared.indexBuffer } },
          { binding: 2, resource: { buffer: shared.positionBuffer } },
          { binding: 3, resource: { buffer: numeratorBuffer } },
        ],
      });
      const denominatorBindGroup = gpu.createBindGroup({
        layout: this.webgpu.splatLayout,
        entries: [
          { binding: 0, resource: { buffer: this.webgpu.cameraBuffer } },
          { binding: 1, resource: { buffer: shared.indexBuffer } },
          { binding: 2, resource: { buffer: shared.positionBuffer } },
          { binding: 3, resource: { buffer: denominatorBuffer } },
        ],
      });

      this.renderWebGPUSplatPass(context, numeratorBindGroup, this.webgpu.numeratorTexture, computed);
      this.renderWebGPUSplatPass(context, denominatorBindGroup, this.webgpu.denominatorTexture, computed);

      const supportWindow = resolveLogRatioSupportWindow(
        this.config.epsilon,
        this.config.maskThreshold,
        this.config.logRatioSupportCorrection,
      );
      const compositeData = new Float32Array(12);
      compositeData[0] = this.config.epsilon;
      compositeData[1] = Math.max(Math.abs(computed.valueDomain?.[1] ?? this.config.logRatioRange), 1e-6);
      compositeData[2] = supportWindow.floor;
      compositeData[3] = this.config.topographic ? 1 : 0;
      compositeData[4] = 14.0;
      compositeData[5] = 0.18;
      compositeData[6] = supportWindow.ceil;
      compositeData[7] = this.config.logRatioSupportCorrection ? 1 : 0;
      compositeData[8] = Math.max(Number(computed.numeratorTotal ?? 0), 0);
      compositeData[9] = Math.max(Number(computed.denominatorTotal ?? 0), 0);
      compositeData[10] = this.config.logRatioZScore ? 1 : 0;
      gpu.queue.writeBuffer(this.webgpu.compositeLogRatioParamsBuffer, 0, compositeData);

      this.webgpu.bindGroupCompositeLogRatio = gpu.createBindGroup({
        layout: this.webgpu.compositeLogRatioLayout,
        entries: [
          { binding: 0, resource: this.webgpu.sampler },
          { binding: 1, resource: this.webgpu.numeratorTexture.createView() },
          { binding: 2, resource: this.webgpu.denominatorTexture.createView() },
          { binding: 3, resource: this.webgpu.colormapTexture.createView() },
          { binding: 4, resource: { buffer: this.webgpu.compositeLogRatioParamsBuffer } },
        ],
      });

      compositePipeline = this.webgpu.pipelineCompositeLogRatio;
      compositeBindGroup = this.webgpu.bindGroupCompositeLogRatio;
    } else {
      if (!this.ensureWebGPUDensityTexture(densityWidth, densityHeight)) {
        return;
      }

      const weightsBuffer = resourceCache.uploadBuffer(
        gpu,
        gpu.queue,
        'density:node:weights',
        computed.weights,
        {
          label: 'Density node weights',
          version: `${this.version}:${this.webgpu.weightUploadVersion}`,
          count: computed.count,
        },
        storageUsage,
      );
      this.webgpu.weightUploadVersion += 1;

      this.webgpu.bindGroupSplat = gpu.createBindGroup({
        layout: this.webgpu.splatLayout,
        entries: [
          { binding: 0, resource: { buffer: this.webgpu.cameraBuffer } },
          { binding: 1, resource: { buffer: shared.indexBuffer } },
          { binding: 2, resource: { buffer: shared.positionBuffer } },
          { binding: 3, resource: { buffer: weightsBuffer } },
        ],
      });
      this.renderWebGPUSplatPass(context, this.webgpu.bindGroupSplat, this.webgpu.densityTexture, computed);

      const compositeData = new Float32Array(8);
      compositeData[0] = this.config.weightScale;
      compositeData[1] = computed.diverging ? 1 : 0;
      compositeData[2] = this.config.topographic ? 1 : 0;
      compositeData[3] = 14.0;
      compositeData[4] = 0.18;
      gpu.queue.writeBuffer(this.webgpu.compositeParamsBuffer, 0, compositeData);

      this.webgpu.bindGroupComposite = gpu.createBindGroup({
        layout: this.webgpu.compositeLayout,
        entries: [
          { binding: 0, resource: this.webgpu.sampler },
          { binding: 1, resource: this.webgpu.densityTexture.createView() },
          { binding: 2, resource: this.webgpu.colormapTexture.createView() },
          { binding: 3, resource: { buffer: this.webgpu.compositeParamsBuffer } },
        ],
      });

      compositePipeline = this.webgpu.pipelineComposite;
      compositeBindGroup = this.webgpu.bindGroupComposite;
    }

    const compositePass = context.commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: context.colorView,
        loadOp: 'load',
        storeOp: 'store',
      }],
      ...(context.depthView
        ? {
            depthStencilAttachment: {
              view: context.depthView,
              depthLoadOp: 'load',
              depthStoreOp: 'store',
            },
          }
        : {}),
    });

    if (viewport && compositePass.setViewport) {
      compositePass.setViewport(viewport.x, viewport.y, viewport.width, viewport.height, 0, 1);
    }

    compositePass.setPipeline(compositePipeline);
    compositePass.setBindGroup(0, compositeBindGroup);

    compositePass.setVertexBuffer(0, context.quad);
    compositePass.draw(4, 1, 0, 0);

    context.passEncoder = compositePass;
  }
}

export default DensityLayer;
