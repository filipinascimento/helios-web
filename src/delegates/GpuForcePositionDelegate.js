import { NODE_POSITION_ATTRIBUTE } from '../pipeline/constants.js';
import { PositionDelegate } from './PositionDelegate.js';

const WORKGROUP_SIZE = 64;
const STORAGE_FLAG = 0x80;
const COPY_SRC_FLAG = 0x04;
const COPY_DST_FLAG = 0x08;
const UNIFORM_FLAG = 0x40;
const MAP_READ_FLAG = 0x01;

const DEFAULT_OPTIONS = {
  mode: '2d',
  center: [0, 0, 0],
  radius: 220,
  depth: 140,
  sampleCount: null,
  sampleCount2D: 64,
  sampleCount3D: 96,
  maxNeighborsPerNode: 64,
  outputScale: 6,
  linkDistance: 1,
  kRepulsion: 0.07,
  kAttraction: 0.62,
  kGravity: 0.00035,
  eta: 0.04,
  damping: 0.92,
  maxStep: 2.5,
  minDistance: 0.15,
  alpha: 1,
  alphaDecay: 0.001,
  alphaTarget: 0,
  alphaMin: 0.001,
  resetAlphaOnTopologyChange: true,
  seed: 0,
};

const COMPUTE_WGSL = /* wgsl */ `
struct Params {
  counts : vec4<u32>,
  flags : vec4<u32>,
  constantsA : vec4<f32>,
  constantsB : vec4<f32>,
  center : vec4<f32>,
};

@group(0) @binding(0) var<storage, read> positionsIn : array<f32>;
@group(0) @binding(1) var<storage, read> velocitiesIn : array<f32>;
@group(0) @binding(2) var<storage, read_write> positionsOut : array<f32>;
@group(0) @binding(3) var<storage, read_write> velocitiesOut : array<f32>;
@group(0) @binding(4) var<storage, read> activeIds : array<u32>;
@group(0) @binding(5) var<storage, read> activeMask : array<u32>;
@group(0) @binding(6) var<storage, read> neighborStarts : array<u32>;
@group(0) @binding(7) var<storage, read> neighborCounts : array<u32>;
@group(0) @binding(8) var<storage, read> neighbors : array<u32>;
@group(0) @binding(9) var<uniform> params : Params;

fn hash32(value : u32) -> u32 {
  var x = value;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

fn sampleActiveId(nodeId : u32, iter : u32, activeCount : u32, seed : u32) -> u32 {
  if (activeCount == 0u) {
    return nodeId;
  }
  let mixed = hash32(seed + nodeId * 2654435761u + iter * 747796405u);
  let index = mixed % activeCount;
  return activeIds[index];
}

fn loadPosition(nodeId : u32) -> vec3<f32> {
  let base = nodeId * 3u;
  return vec3<f32>(
    positionsIn[base + 0u],
    positionsIn[base + 1u],
    positionsIn[base + 2u],
  );
}

fn loadVelocity(nodeId : u32) -> vec3<f32> {
  let base = nodeId * 3u;
  return vec3<f32>(
    velocitiesIn[base + 0u],
    velocitiesIn[base + 1u],
    velocitiesIn[base + 2u],
  );
}

fn storePosition(nodeId : u32, value : vec3<f32>) {
  let base = nodeId * 3u;
  positionsOut[base + 0u] = value.x;
  positionsOut[base + 1u] = value.y;
  positionsOut[base + 2u] = value.z;
}

fn storeVelocity(nodeId : u32, value : vec3<f32>) {
  let base = nodeId * 3u;
  velocitiesOut[base + 0u] = value.x;
  velocitiesOut[base + 1u] = value.y;
  velocitiesOut[base + 2u] = value.z;
}

@compute @workgroup_size(${WORKGROUP_SIZE}u)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let nodeId = gid.x;
  let nodeCapacity = params.counts.y;
  if (nodeId >= nodeCapacity) {
    return;
  }

  if (activeMask[nodeId] == 0u) {
    storePosition(nodeId, loadPosition(nodeId));
    storeVelocity(nodeId, loadVelocity(nodeId));
    return;
  }

  let activeCount = params.counts.x;
  let sampleCount = params.counts.z;
  let maxNeighbors = params.counts.w;
  let use3D = params.flags.x;
  let seed = params.flags.z;

  var pos = loadPosition(nodeId);
  var vel = loadVelocity(nodeId);
  if (use3D == 0u) {
    pos.z = params.center.z;
    vel.z = 0.0;
  }

  var force = vec3<f32>(0.0, 0.0, 0.0);
  let minDist = max(1e-5, params.constantsB.z);
  let minDistSq = minDist * minDist;

  if (activeCount > 1u && sampleCount > 0u) {
    let repulsionNormalization = max(1.0, f32(activeCount) / max(1.0, f32(sampleCount)));
    var s : u32 = 0u;
    loop {
      if (s >= sampleCount) {
        break;
      }
      let otherId = sampleActiveId(nodeId, s, activeCount, seed);
      if (otherId != nodeId) {
        var delta = pos - loadPosition(otherId);
        if (use3D == 0u) {
          delta.z = 0.0;
        }
        let distSq = max(dot(delta, delta), minDistSq);
        let invDist = inverseSqrt(distSq);
        let repulsionScale = params.constantsA.x * repulsionNormalization * invDist * invDist * invDist;
        force = force + delta * repulsionScale;
      }
      s = s + 1u;
    }
  }

  let start = neighborStarts[nodeId];
  let degree = neighborCounts[nodeId];
  let limit = min(degree, maxNeighbors);
  if (limit > 0u) {
    var n : u32 = 0u;
    loop {
      if (n >= limit) {
        break;
      }
      let otherId = neighbors[start + n];
      if (otherId != nodeId) {
        var delta = loadPosition(otherId) - pos;
        if (use3D == 0u) {
          delta.z = 0.0;
        }
        let distSq = max(dot(delta, delta), minDistSq);
        let dist = sqrt(distSq);
        let invDist = 1.0 / dist;
        let degreeNorm = max(1.0, f32(limit));
        let stretch = dist - params.constantsB.w;
        let springScale = (params.constantsA.y * stretch * invDist) / degreeNorm;
        force = force + delta * springScale;
      }
      n = n + 1u;
    }
  }

  var gravityDelta = params.center.xyz - pos;
  if (use3D == 0u) {
    gravityDelta.z = 0.0;
  }
  force = force + gravityDelta * params.constantsA.z;

  let eta = params.constantsA.w;
  let damping = params.constantsB.x;
  var nextVel = vel * damping + force * eta;

  let speed = length(nextVel);
  let maxStep = max(1e-5, params.constantsB.y);
  if (speed > maxStep) {
    nextVel = nextVel * (maxStep / speed);
  }
  if (use3D == 0u) {
    nextVel.z = 0.0;
  }

  var nextPos = pos + nextVel;
  if (use3D == 0u) {
    nextPos.z = params.center.z;
  }

  storePosition(nodeId, nextPos);
  storeVelocity(nodeId, nextVel);
}
`;

const OUTPUT_SCALE_WGSL = /* wgsl */ `
struct OutputScaleParams {
  counts : vec4<u32>,
  center : vec4<f32>,
  scale : vec4<f32>,
};

@group(0) @binding(0) var<storage, read> positionsIn : array<f32>;
@group(0) @binding(1) var<storage, read_write> positionsOut : array<f32>;
@group(0) @binding(2) var<uniform> params : OutputScaleParams;

@compute @workgroup_size(${WORKGROUP_SIZE}u)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let nodeId = gid.x;
  if (nodeId >= params.counts.x) {
    return;
  }

  let base = nodeId * 3u;
  let source = vec3<f32>(
    positionsIn[base + 0u],
    positionsIn[base + 1u],
    positionsIn[base + 2u],
  );
  let centered = source - params.center.xyz;
  var outputPos = params.center.xyz + centered * params.scale.x;
  if (params.counts.y == 0u) {
    outputPos.z = params.center.z;
  }

  positionsOut[base + 0u] = outputPos.x;
  positionsOut[base + 1u] = outputPos.y;
  positionsOut[base + 2u] = outputPos.z;
}
`;

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max, fallback) {
  const numeric = toFinite(value, fallback);
  if (numeric <= min) return min;
  if (numeric >= max) return max;
  return numeric;
}

function normalizeCenter(value) {
  if (!Array.isArray(value)) return [0, 0, 0];
  return [
    toFinite(value[0], 0),
    toFinite(value[1], 0),
    toFinite(value[2], 0),
  ];
}

function createEmptyUintArray() {
  return new Uint32Array(0);
}

function safeRead(fn, fallback) {
  try {
    const value = fn();
    return value ?? fallback;
  } catch (_) {
    return fallback;
  }
}

function getGpuUsage(name, fallback) {
  if (typeof GPUBufferUsage !== 'undefined' && Number.isFinite(GPUBufferUsage?.[name])) {
    return GPUBufferUsage[name];
  }
  return fallback;
}

function getGpuShaderStage(name, fallback) {
  if (typeof GPUShaderStage !== 'undefined' && Number.isFinite(GPUShaderStage?.[name])) {
    return GPUShaderStage[name];
  }
  return fallback;
}

function getGpuMapMode(name, fallback) {
  if (typeof GPUMapMode !== 'undefined' && Number.isFinite(GPUMapMode?.[name])) {
    return GPUMapMode[name];
  }
  return fallback;
}

function normalizeBackendType(value) {
  if (value === 'webgpu') return 'webgpu';
  if (value === 'webgl' || value === 'webgl2') return 'webgl';
  return value ?? null;
}

function snapshotTopologyInputs(network) {
  const nodeIndices = safeRead(
    () => (network?.nodeIndices instanceof Uint32Array ? network.nodeIndices : createEmptyUintArray()),
    createEmptyUintArray(),
  );
  const edgeIndices = safeRead(
    () => (network?.edgeIndices instanceof Uint32Array ? network.edgeIndices : createEmptyUintArray()),
    createEmptyUintArray(),
  );
  const edgesView = safeRead(
    () => (network?.edgesView instanceof Uint32Array ? network.edgesView : createEmptyUintArray()),
    createEmptyUintArray(),
  );
  const nodeCapacityRaw = Number(safeRead(() => network?.nodeCapacity, 0));
  const nodeCapacity = Number.isFinite(nodeCapacityRaw) && nodeCapacityRaw > 0
    ? Math.floor(nodeCapacityRaw)
    : 0;
  const inferredCapacity = Math.max(0, Math.floor(nodeIndices.length));
  return {
    nodeCapacity: Math.max(nodeCapacity, inferredCapacity),
    nodeIndices,
    edgeIndices,
    edgesView,
    positionView: null,
  };
}

function isSameTopologySnapshot(previous, next) {
  if (!previous || !next) return false;
  return (
    Number(previous.topologyNode) === Number(next.topologyNode)
    && Number(previous.topologyEdge) === Number(next.topologyEdge)
    && Number(previous.nodeIndicesVersion) === Number(next.nodeIndicesVersion)
    && Number(previous.edgeIndicesVersion) === Number(next.edgeIndicesVersion)
    && Number(previous.nodeIndicesCount) === Number(next.nodeIndicesCount)
    && Number(previous.edgeIndicesCount) === Number(next.edgeIndicesCount)
    && Number(previous.nodeIndexAttributeVersion) === Number(next.nodeIndexAttributeVersion)
    && Number(previous.edgeIndexAttributeVersion) === Number(next.edgeIndexAttributeVersion)
  );
}

function buildTopologyPayload(topologyInputs, options = {}) {
  const {
    nodeCapacity = 0,
    nodeIndices = createEmptyUintArray(),
    edgeIndices = createEmptyUintArray(),
    edgesView = createEmptyUintArray(),
    positionView = null,
  } = topologyInputs ?? {};

  const hasExplicitActiveIds = nodeIndices.length > 0;
  const activeIds = hasExplicitActiveIds
    ? new Uint32Array(nodeIndices.length)
    : new Uint32Array(nodeCapacity);
  const activeMask = new Uint32Array(nodeCapacity);
  if (hasExplicitActiveIds) {
    for (let i = 0; i < nodeIndices.length; i += 1) {
      const nodeId = nodeIndices[i] >>> 0;
      activeIds[i] = nodeId;
      if (nodeId < nodeCapacity) {
        activeMask[nodeId] = 1;
      }
    }
  } else {
    for (let nodeId = 0; nodeId < nodeCapacity; nodeId += 1) {
      activeIds[nodeId] = nodeId;
      activeMask[nodeId] = 1;
    }
  }

  const neighborCounts = new Uint32Array(nodeCapacity);
  for (let i = 0; i < edgeIndices.length; i += 1) {
    const edgeId = edgeIndices[i] >>> 0;
    const base = edgeId * 2;
    if (base + 1 >= edgesView.length) continue;
    const source = edgesView[base] >>> 0;
    const target = edgesView[base + 1] >>> 0;
    if (source >= nodeCapacity || target >= nodeCapacity) continue;
    if (!activeMask[source] || !activeMask[target]) continue;
    if (source === target) continue;
    neighborCounts[source] += 1;
    neighborCounts[target] += 1;
  }

  const neighborStarts = new Uint32Array(nodeCapacity);
  let neighborLength = 0;
  for (let nodeId = 0; nodeId < nodeCapacity; nodeId += 1) {
    neighborStarts[nodeId] = neighborLength;
    neighborLength += neighborCounts[nodeId];
  }

  const neighbors = new Uint32Array(Math.max(1, neighborLength));
  const cursor = new Uint32Array(neighborStarts);
  for (let i = 0; i < edgeIndices.length; i += 1) {
    const edgeId = edgeIndices[i] >>> 0;
    const base = edgeId * 2;
    if (base + 1 >= edgesView.length) continue;
    const source = edgesView[base] >>> 0;
    const target = edgesView[base + 1] >>> 0;
    if (source >= nodeCapacity || target >= nodeCapacity) continue;
    if (!activeMask[source] || !activeMask[target]) continue;
    if (source === target) continue;
    neighbors[cursor[source]++] = target;
    neighbors[cursor[target]++] = source;
  }

  const center = normalizeCenter(options.center);
  const radius = Math.max(1, toFinite(options.radius, DEFAULT_OPTIONS.radius));
  const depth = Math.max(0, toFinite(options.depth, DEFAULT_OPTIONS.depth));
  const outputScale = Math.max(0.0001, toFinite(options.outputScale, DEFAULT_OPTIONS.outputScale));
  const normalizeInputByOutputScale = Math.abs(outputScale - 1.0) > 1e-6;
  const is3D = options.mode === '3d';
  const packedPositions = new Float32Array(Math.max(1, nodeCapacity) * 3);
  const packedOutputPositions = new Float32Array(Math.max(1, nodeCapacity) * 3);
  for (let nodeId = 0; nodeId < nodeCapacity; nodeId += 1) {
    const sourceOffset = nodeId * 3;
    const targetOffset = nodeId * 3;
    const x = positionView?.[sourceOffset];
    const y = positionView?.[sourceOffset + 1];
    const z = positionView?.[sourceOffset + 2];
    const fallbackX = center[0] + (Math.random() - 0.5) * radius;
    const fallbackY = center[1] + (Math.random() - 0.5) * radius;
    const fallbackZ = is3D
      ? center[2] + (Math.random() - 0.5) * depth
      : center[2];

    const seedX = Number.isFinite(x) ? x : fallbackX;
    const seedY = Number.isFinite(y) ? y : fallbackY;
    const seedZ = Number.isFinite(z)
      ? (is3D ? z : center[2])
      : fallbackZ;

    packedOutputPositions[targetOffset] = seedX;
    packedOutputPositions[targetOffset + 1] = seedY;
    packedOutputPositions[targetOffset + 2] = seedZ;

    if (normalizeInputByOutputScale) {
      packedPositions[targetOffset] = center[0] + ((seedX - center[0]) / outputScale);
      packedPositions[targetOffset + 1] = center[1] + ((seedY - center[1]) / outputScale);
      packedPositions[targetOffset + 2] = is3D
        ? (center[2] + ((seedZ - center[2]) / outputScale))
        : center[2];
    } else {
      packedPositions[targetOffset] = seedX;
      packedPositions[targetOffset + 1] = seedY;
      packedPositions[targetOffset + 2] = seedZ;
    }
  }

  return {
    nodeCapacity,
    activeCount: activeIds.length,
    activeIds,
    activeMask,
    neighborStarts,
    neighborCounts,
    neighbors,
    packedPositions,
    packedOutputPositions,
    neighborLength,
  };
}

function hash32(value) {
  let x = value >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x >>> 0;
}

function sampleActiveId(nodeId, iter, activeIds, activeCount, seed) {
  if (!activeIds || activeCount <= 0) return nodeId >>> 0;
  const mixed = hash32((seed + Math.imul(nodeId >>> 0, 2654435761) + Math.imul(iter >>> 0, 747796405)) >>> 0);
  const index = mixed % Math.max(1, activeCount);
  return activeIds[index] >>> 0;
}

class WebGLForceComputeBackend {
  constructor(gl) {
    this.gl = gl;
    this.nodeCapacity = 0;
    this.activeCount = 0;
    this.seed = (Math.random() * 0xffffffff) >>> 0;

    this.activeIds = createEmptyUintArray();
    this.activeMask = createEmptyUintArray();
    this.neighborStarts = createEmptyUintArray();
    this.neighborCounts = createEmptyUintArray();
    this.neighbors = createEmptyUintArray();

    this.positions = new Float32Array(0);
    this.outputPositions = new Float32Array(0);
    this.velocities = new Float32Array(0);
    this.scratchPositions = new Float32Array(0);
    this.scratchVelocities = new Float32Array(0);

    this.outputPositionTexture = null;
    this.textureWidth = 1;
    this.textureHeight = 1;
    this.textureVersion = 0;
  }

  _ensureTexture() {
    if (!this.gl || this.outputPositionTexture) return;
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    this.outputPositionTexture = texture;
  }

  _getTextureLayout(count) {
    const gl = this.gl;
    const max = gl?.getParameter?.(gl.MAX_TEXTURE_SIZE) ?? 16384;
    const safeCount = Math.max(1, Math.floor(Number(count) || 0));
    const width = Math.min(max, safeCount);
    const height = Math.ceil(safeCount / Math.max(1, width));
    if (height > max) {
      throw new Error(
        `WebGL2 GPU-force layout requires texture dimensions <= MAX_TEXTURE_SIZE (${max}), `
        + `got ${safeCount} texels -> ${width}x${height}.`,
      );
    }
    return { width, height };
  }

  _uploadOutputTexture() {
    if (!this.gl) return false;
    this._ensureTexture();
    if (!this.outputPositionTexture) return false;

    const gl = this.gl;
    const count = Math.max(1, this.nodeCapacity);
    const { width, height } = this._getTextureLayout(count);
    this.textureWidth = width;
    this.textureHeight = height;

    gl.bindTexture(gl.TEXTURE_2D, this.outputPositionTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);

    if (height === 1) {
      const valueCount = width * 3;
      const directView = this.outputPositions.length === valueCount
        ? this.outputPositions
        : this.outputPositions.subarray(0, valueCount);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB32F,
        width,
        1,
        0,
        gl.RGB,
        gl.FLOAT,
        directView,
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGB32F,
        width,
        height,
        0,
        gl.RGB,
        gl.FLOAT,
        null,
      );
      let remaining = count;
      let srcOffset = 0;
      for (let y = 0; y < height && remaining > 0; y += 1) {
        const rowTexels = Math.min(width, remaining);
        const valueCount = rowTexels * 3;
        const rowView = this.outputPositions.subarray(srcOffset, srcOffset + valueCount);
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          y,
          rowTexels,
          1,
          gl.RGB,
          gl.FLOAT,
          rowView,
        );
        srcOffset += valueCount;
        remaining -= rowTexels;
      }
    }

    this.textureVersion += 1;
    return true;
  }

  syncTopology(payload, options = {}) {
    if (!payload || !this.gl) return false;
    const preserveDynamicState = options?.preserveDynamicState === true;
    const previousNodeCapacity = this.nodeCapacity;
    this.nodeCapacity = Math.max(0, payload.nodeCapacity | 0);
    this.activeCount = Math.max(0, payload.activeCount | 0);
    this.activeIds = payload.activeIds instanceof Uint32Array ? new Uint32Array(payload.activeIds) : createEmptyUintArray();
    this.activeMask = payload.activeMask instanceof Uint32Array ? new Uint32Array(payload.activeMask) : createEmptyUintArray();
    this.neighborStarts = payload.neighborStarts instanceof Uint32Array
      ? new Uint32Array(payload.neighborStarts)
      : createEmptyUintArray();
    this.neighborCounts = payload.neighborCounts instanceof Uint32Array
      ? new Uint32Array(payload.neighborCounts)
      : createEmptyUintArray();
    this.neighbors = payload.neighbors instanceof Uint32Array ? new Uint32Array(payload.neighbors) : createEmptyUintArray();

    const valueCount = Math.max(1, this.nodeCapacity) * 3;
    const canPreserveDynamicState = preserveDynamicState
      && previousNodeCapacity === this.nodeCapacity
      && this.positions instanceof Float32Array
      && this.outputPositions instanceof Float32Array
      && this.velocities instanceof Float32Array
      && this.positions.length >= valueCount
      && this.outputPositions.length >= valueCount
      && this.velocities.length >= valueCount;
    if (!canPreserveDynamicState) {
      this.positions = payload.packedPositions instanceof Float32Array
        ? new Float32Array(payload.packedPositions)
        : new Float32Array(valueCount);
      this.outputPositions = payload.packedOutputPositions instanceof Float32Array
        ? new Float32Array(payload.packedOutputPositions)
        : new Float32Array(this.positions);
      this.velocities = new Float32Array(valueCount);
    }
    this.scratchPositions = new Float32Array(valueCount);
    this.scratchVelocities = new Float32Array(valueCount);
    return this._uploadOutputTexture();
  }

  step(stepOptions = {}) {
    if (!this.gl || this.nodeCapacity <= 0 || this.activeCount <= 0) return false;

    const is3D = stepOptions.mode === '3d';
    const center = normalizeCenter(stepOptions.center);
    const sampleCount = Math.max(1, Math.floor(toFinite(stepOptions.sampleCount, DEFAULT_OPTIONS.sampleCount2D)));
    const maxNeighborsPerNode = Math.max(1, Math.floor(toFinite(
      stepOptions.maxNeighborsPerNode,
      DEFAULT_OPTIONS.maxNeighborsPerNode,
    )));
    const linkDistance = Math.max(0.0001, toFinite(stepOptions.linkDistance, DEFAULT_OPTIONS.linkDistance));
    const minDistance = Math.max(0.0001, toFinite(stepOptions.minDistance, DEFAULT_OPTIONS.minDistance));
    const minDistSq = minDistance * minDistance;
    const kRepulsion = toFinite(stepOptions.kRepulsion, DEFAULT_OPTIONS.kRepulsion);
    const kAttraction = toFinite(stepOptions.kAttraction, DEFAULT_OPTIONS.kAttraction);
    const kGravity = toFinite(stepOptions.kGravity, DEFAULT_OPTIONS.kGravity);
    const eta = toFinite(stepOptions.eta, DEFAULT_OPTIONS.eta);
    const damping = clamp(stepOptions.damping, 0, 1, DEFAULT_OPTIONS.damping);
    const maxStep = Math.max(0.001, toFinite(stepOptions.maxStep, DEFAULT_OPTIONS.maxStep));
    const outputScale = Math.max(0.0001, toFinite(stepOptions.outputScale, DEFAULT_OPTIONS.outputScale));

    const positionsIn = this.positions;
    const velocitiesIn = this.velocities;
    const positionsOut = this.scratchPositions;
    const velocitiesOut = this.scratchVelocities;
    const activeMask = this.activeMask;
    const activeIds = this.activeIds;
    const neighborStarts = this.neighborStarts;
    const neighborCounts = this.neighborCounts;
    const neighbors = this.neighbors;

    const repulsionNormalization = Math.max(1, this.activeCount / Math.max(1, sampleCount));
    this.seed = this.seed >>> 0;

    for (let nodeId = 0; nodeId < this.nodeCapacity; nodeId += 1) {
      const base = nodeId * 3;
      let posX = positionsIn[base] ?? center[0];
      let posY = positionsIn[base + 1] ?? center[1];
      let posZ = positionsIn[base + 2] ?? center[2];
      let velX = velocitiesIn[base] ?? 0;
      let velY = velocitiesIn[base + 1] ?? 0;
      let velZ = velocitiesIn[base + 2] ?? 0;

      if (!is3D) {
        posZ = center[2];
        velZ = 0;
      }

      if (!activeMask[nodeId]) {
        positionsOut[base] = posX;
        positionsOut[base + 1] = posY;
        positionsOut[base + 2] = posZ;
        velocitiesOut[base] = velX;
        velocitiesOut[base + 1] = velY;
        velocitiesOut[base + 2] = velZ;
        continue;
      }

      let forceX = 0;
      let forceY = 0;
      let forceZ = 0;

      if (this.activeCount > 1 && sampleCount > 0) {
        for (let s = 0; s < sampleCount; s += 1) {
          const otherId = sampleActiveId(nodeId, s, activeIds, this.activeCount, this.seed);
          if (otherId === nodeId || otherId >= this.nodeCapacity) continue;
          const otherBase = otherId * 3;
          let deltaX = posX - (positionsIn[otherBase] ?? posX);
          let deltaY = posY - (positionsIn[otherBase + 1] ?? posY);
          let deltaZ = posZ - (positionsIn[otherBase + 2] ?? posZ);
          if (!is3D) deltaZ = 0;
          const distSq = Math.max((deltaX * deltaX) + (deltaY * deltaY) + (deltaZ * deltaZ), minDistSq);
          const invDist = 1 / Math.sqrt(distSq);
          const repulsionScale = kRepulsion * repulsionNormalization * invDist * invDist * invDist;
          forceX += deltaX * repulsionScale;
          forceY += deltaY * repulsionScale;
          forceZ += deltaZ * repulsionScale;
        }
      }

      const start = neighborStarts[nodeId] ?? 0;
      const degree = neighborCounts[nodeId] ?? 0;
      const limit = Math.min(degree, maxNeighborsPerNode);
      if (limit > 0) {
        const degreeNorm = Math.max(1, limit);
        for (let n = 0; n < limit; n += 1) {
          const otherId = neighbors[start + n];
          if (otherId === nodeId || otherId >= this.nodeCapacity) continue;
          const otherBase = otherId * 3;
          let deltaX = (positionsIn[otherBase] ?? posX) - posX;
          let deltaY = (positionsIn[otherBase + 1] ?? posY) - posY;
          let deltaZ = (positionsIn[otherBase + 2] ?? posZ) - posZ;
          if (!is3D) deltaZ = 0;
          const distSq = Math.max((deltaX * deltaX) + (deltaY * deltaY) + (deltaZ * deltaZ), minDistSq);
          const dist = Math.sqrt(distSq);
          const invDist = 1 / Math.max(1e-8, dist);
          const stretch = dist - linkDistance;
          const springScale = (kAttraction * stretch * invDist) / degreeNorm;
          forceX += deltaX * springScale;
          forceY += deltaY * springScale;
          forceZ += deltaZ * springScale;
        }
      }

      let gravityX = center[0] - posX;
      let gravityY = center[1] - posY;
      let gravityZ = center[2] - posZ;
      if (!is3D) gravityZ = 0;
      forceX += gravityX * kGravity;
      forceY += gravityY * kGravity;
      forceZ += gravityZ * kGravity;

      let nextVelX = (velX * damping) + (forceX * eta);
      let nextVelY = (velY * damping) + (forceY * eta);
      let nextVelZ = (velZ * damping) + (forceZ * eta);

      const speed = Math.hypot(nextVelX, nextVelY, nextVelZ);
      if (speed > maxStep) {
        const scale = maxStep / speed;
        nextVelX *= scale;
        nextVelY *= scale;
        nextVelZ *= scale;
      }
      if (!is3D) nextVelZ = 0;

      let nextPosX = posX + nextVelX;
      let nextPosY = posY + nextVelY;
      let nextPosZ = posZ + nextVelZ;
      if (!is3D) nextPosZ = center[2];

      positionsOut[base] = nextPosX;
      positionsOut[base + 1] = nextPosY;
      positionsOut[base + 2] = nextPosZ;
      velocitiesOut[base] = nextVelX;
      velocitiesOut[base + 1] = nextVelY;
      velocitiesOut[base + 2] = nextVelZ;
    }

    const positionsSwap = this.positions;
    this.positions = this.scratchPositions;
    this.scratchPositions = positionsSwap;

    const velocitiesSwap = this.velocities;
    this.velocities = this.scratchVelocities;
    this.scratchVelocities = velocitiesSwap;

    const source = this.positions;
    if (Math.abs(outputScale - 1.0) <= 1e-6) {
      this.outputPositions.set(source);
      if (!is3D) {
        for (let nodeId = 0; nodeId < this.nodeCapacity; nodeId += 1) {
          this.outputPositions[(nodeId * 3) + 2] = center[2];
        }
      }
    } else {
      for (let nodeId = 0; nodeId < this.nodeCapacity; nodeId += 1) {
        const base = nodeId * 3;
        const srcX = source[base];
        const srcY = source[base + 1];
        const srcZ = source[base + 2];
        this.outputPositions[base] = center[0] + ((srcX - center[0]) * outputScale);
        this.outputPositions[base + 1] = center[1] + ((srcY - center[1]) * outputScale);
        this.outputPositions[base + 2] = is3D
          ? (center[2] + ((srcZ - center[2]) * outputScale))
          : center[2];
      }
    }

    return this._uploadOutputTexture();
  }

  getPositionTexture() {
    return this.outputPositionTexture ?? null;
  }

  getPositionTextureMeta() {
    return {
      version: this.textureVersion,
      count: this.nodeCapacity,
      buffer: this.outputPositionTexture,
      byteOffset: 0,
      byteLength: 0,
    };
  }

  readPositionSnapshot() {
    if (!this.outputPositions || this.nodeCapacity <= 0) return null;
    const length = Math.max(1, this.nodeCapacity) * 3;
    return new Float32Array(this.outputPositions.subarray(0, length));
  }

  dispose() {
    if (this.outputPositionTexture && this.gl?.deleteTexture) {
      this.gl.deleteTexture(this.outputPositionTexture);
    }
    this.outputPositionTexture = null;
    this.nodeCapacity = 0;
    this.activeCount = 0;
    this.activeIds = createEmptyUintArray();
    this.activeMask = createEmptyUintArray();
    this.neighborStarts = createEmptyUintArray();
    this.neighborCounts = createEmptyUintArray();
    this.neighbors = createEmptyUintArray();
    this.positions = new Float32Array(0);
    this.outputPositions = new Float32Array(0);
    this.velocities = new Float32Array(0);
    this.scratchPositions = new Float32Array(0);
    this.scratchVelocities = new Float32Array(0);
    this.textureWidth = 1;
    this.textureHeight = 1;
    this.textureVersion = 0;
  }
}

class WebGPUForceComputeBackend {
  constructor(device) {
    this.device = device;
    this.pipeline = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;
    this.outputScalePipeline = null;
    this.outputScaleBindGroupLayout = null;
    this.outputScaleBindGroup = null;
    this.paramsBuffer = null;
    this.outputScaleParamsBuffer = null;
    this.positionBuffer = null;
    this.outputPositionBuffer = null;
    this.velocityBuffer = null;
    this.scratchPositionBuffer = null;
    this.scratchVelocityBuffer = null;
    this.activeIdsBuffer = null;
    this.activeMaskBuffer = null;
    this.neighborStartsBuffer = null;
    this.neighborCountsBuffer = null;
    this.neighborsBuffer = null;
    this.nodeCapacity = 0;
    this.activeCount = 0;
    this.seed = (Math.random() * 0xffffffff) >>> 0;

    const shaderVisibility = getGpuShaderStage('COMPUTE', 0x4);
    this.shaderVisibility = shaderVisibility;
    this.storageUsage = (
      getGpuUsage('STORAGE', STORAGE_FLAG)
      | getGpuUsage('COPY_DST', COPY_DST_FLAG)
      | getGpuUsage('COPY_SRC', COPY_SRC_FLAG)
    );
    this.uniformUsage = (
      getGpuUsage('UNIFORM', UNIFORM_FLAG)
      | getGpuUsage('COPY_DST', COPY_DST_FLAG)
    );

    this._ensurePipeline();
    this._ensureOutputScalePipeline();
  }

  _ensurePipeline() {
    if (!this.device || this.pipeline) return;
    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
        { binding: 3, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
        { binding: 4, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 6, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 7, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 8, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 9, visibility: this.shaderVisibility, buffer: { type: 'uniform' } },
      ],
    });
    const module = this.device.createShaderModule({ code: COMPUTE_WGSL });
    this.pipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] }),
      compute: { module, entryPoint: 'main' },
    });
  }

  _ensureOutputScalePipeline() {
    if (!this.device || this.outputScalePipeline) return;
    this.outputScaleBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
        { binding: 2, visibility: this.shaderVisibility, buffer: { type: 'uniform' } },
      ],
    });
    const module = this.device.createShaderModule({ code: OUTPUT_SCALE_WGSL });
    this.outputScalePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.outputScaleBindGroupLayout] }),
      compute: { module, entryPoint: 'main' },
    });
  }

  _ensureBuffer(field, size, usage, label) {
    const normalizedSize = Math.max(4, Math.ceil((size ?? 0) / 4) * 4);
    const current = this[field] ?? null;
    if (current?.size >= normalizedSize) {
      return current;
    }
    current?.destroy?.();
    const created = this.device.createBuffer({ size: normalizedSize, usage, label });
    this[field] = created;
    return created;
  }

  _rebuildBindGroup() {
    if (!this.bindGroupLayout) return;
    this.bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.velocityBuffer } },
        { binding: 2, resource: { buffer: this.scratchPositionBuffer } },
        { binding: 3, resource: { buffer: this.scratchVelocityBuffer } },
        { binding: 4, resource: { buffer: this.activeIdsBuffer } },
        { binding: 5, resource: { buffer: this.activeMaskBuffer } },
        { binding: 6, resource: { buffer: this.neighborStartsBuffer } },
        { binding: 7, resource: { buffer: this.neighborCountsBuffer } },
        { binding: 8, resource: { buffer: this.neighborsBuffer } },
        { binding: 9, resource: { buffer: this.paramsBuffer } },
      ],
    });
  }

  _rebuildOutputScaleBindGroup() {
    if (!this.outputScaleBindGroupLayout) return;
    if (!this.positionBuffer || !this.outputPositionBuffer || !this.outputScaleParamsBuffer) return;
    this.outputScaleBindGroup = this.device.createBindGroup({
      layout: this.outputScaleBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.outputPositionBuffer } },
        { binding: 2, resource: { buffer: this.outputScaleParamsBuffer } },
      ],
    });
  }

  syncTopology(payload, options = {}) {
    if (!payload || !this.device) return false;
    const {
      nodeCapacity,
      activeCount,
      activeIds,
      activeMask,
      neighborStarts,
      neighborCounts,
      neighbors,
      packedPositions,
      packedOutputPositions,
    } = payload;
    const preserveDynamicState = options?.preserveDynamicState === true;
    const previousNodeCapacity = this.nodeCapacity;

    this.nodeCapacity = Math.max(0, nodeCapacity | 0);
    this.activeCount = Math.max(0, activeCount | 0);

    const nodeVec3Bytes = Math.max(1, this.nodeCapacity) * 12;
    const nodeU32Bytes = Math.max(1, this.nodeCapacity) * 4;

    this._ensureBuffer('positionBuffer', nodeVec3Bytes, this.storageUsage, 'layout:gpu-force:positions');
    this._ensureBuffer('outputPositionBuffer', nodeVec3Bytes, this.storageUsage, 'layout:gpu-force:positions-output');
    this._ensureBuffer('velocityBuffer', nodeVec3Bytes, this.storageUsage, 'layout:gpu-force:velocities');
    this._ensureBuffer('scratchPositionBuffer', nodeVec3Bytes, this.storageUsage, 'layout:gpu-force:scratch-positions');
    this._ensureBuffer('scratchVelocityBuffer', nodeVec3Bytes, this.storageUsage, 'layout:gpu-force:scratch-velocities');

    this._ensureBuffer('activeIdsBuffer', Math.max(1, activeIds.length) * 4, this.storageUsage, 'layout:gpu-force:active-ids');
    this._ensureBuffer('activeMaskBuffer', nodeU32Bytes, this.storageUsage, 'layout:gpu-force:active-mask');
    this._ensureBuffer('neighborStartsBuffer', nodeU32Bytes, this.storageUsage, 'layout:gpu-force:neighbor-starts');
    this._ensureBuffer('neighborCountsBuffer', nodeU32Bytes, this.storageUsage, 'layout:gpu-force:neighbor-counts');
    this._ensureBuffer('neighborsBuffer', Math.max(1, neighbors.length) * 4, this.storageUsage, 'layout:gpu-force:neighbors');
    this._ensureBuffer('paramsBuffer', 256, this.uniformUsage, 'layout:gpu-force:params');
    this._ensureBuffer('outputScaleParamsBuffer', 64, this.uniformUsage, 'layout:gpu-force:output-scale-params');

    const queue = this.device.queue;
    const canPreserveDynamicState = preserveDynamicState
      && previousNodeCapacity === this.nodeCapacity
      && this.positionBuffer
      && this.outputPositionBuffer
      && this.velocityBuffer
      && this.scratchPositionBuffer
      && this.scratchVelocityBuffer;
    if (!canPreserveDynamicState) {
      queue.writeBuffer(this.positionBuffer, 0, packedPositions);
      queue.writeBuffer(this.outputPositionBuffer, 0, packedOutputPositions ?? packedPositions);
      queue.writeBuffer(this.scratchPositionBuffer, 0, packedPositions);

      const zeroVelocities = new Float32Array(Math.max(1, this.nodeCapacity) * 3);
      queue.writeBuffer(this.velocityBuffer, 0, zeroVelocities);
      queue.writeBuffer(this.scratchVelocityBuffer, 0, zeroVelocities);
    }

    if (activeIds.length) {
      queue.writeBuffer(this.activeIdsBuffer, 0, activeIds);
    }
    if (activeMask.length) {
      queue.writeBuffer(this.activeMaskBuffer, 0, activeMask);
      queue.writeBuffer(this.neighborStartsBuffer, 0, neighborStarts);
      queue.writeBuffer(this.neighborCountsBuffer, 0, neighborCounts);
    }
    if (neighbors.length) {
      queue.writeBuffer(this.neighborsBuffer, 0, neighbors);
    }

    this._rebuildBindGroup();
    this._rebuildOutputScaleBindGroup();
    return true;
  }

  step(stepOptions = {}) {
    if (!this.device || !this.pipeline || !this.bindGroup) return false;
    if (this.nodeCapacity <= 0 || this.activeCount <= 0) return false;
    if (!this.outputPositionBuffer) return false;

    const sampleCount = Math.max(1, Math.floor(toFinite(stepOptions.sampleCount, 64)));
    const maxNeighborsPerNode = Math.max(1, Math.floor(toFinite(stepOptions.maxNeighborsPerNode, 64)));
    // Keep sampled repulsion neighborhoods stable across ticks to reduce
    // stochastic force noise and improve convergence.
    this.seed = this.seed >>> 0;

    const paramsBuffer = new ArrayBuffer(20 * 4);
    const paramsU32 = new Uint32Array(paramsBuffer);
    const paramsF32 = new Float32Array(paramsBuffer);

    paramsU32[0] = this.activeCount >>> 0;
    paramsU32[1] = this.nodeCapacity >>> 0;
    paramsU32[2] = sampleCount >>> 0;
    paramsU32[3] = maxNeighborsPerNode >>> 0;

    paramsU32[4] = stepOptions.mode === '3d' ? 1 : 0;
    paramsU32[5] = stepOptions.recenter === true ? 1 : 0;
    paramsU32[6] = this.seed >>> 0;
    paramsU32[7] = 0;

    paramsF32[8] = toFinite(stepOptions.kRepulsion, DEFAULT_OPTIONS.kRepulsion);
    paramsF32[9] = toFinite(stepOptions.kAttraction, DEFAULT_OPTIONS.kAttraction);
    paramsF32[10] = toFinite(stepOptions.kGravity, DEFAULT_OPTIONS.kGravity);
    paramsF32[11] = toFinite(stepOptions.eta, DEFAULT_OPTIONS.eta);

    paramsF32[12] = clamp(stepOptions.damping, 0, 1, DEFAULT_OPTIONS.damping);
    paramsF32[13] = Math.max(0.001, toFinite(stepOptions.maxStep, DEFAULT_OPTIONS.maxStep));
    paramsF32[14] = Math.max(0.0001, toFinite(stepOptions.minDistance, DEFAULT_OPTIONS.minDistance));
    paramsF32[15] = Math.max(0.0001, toFinite(stepOptions.linkDistance, DEFAULT_OPTIONS.linkDistance));

    const center = normalizeCenter(stepOptions.center);
    paramsF32[16] = center[0];
    paramsF32[17] = center[1];
    paramsF32[18] = center[2];
    paramsF32[19] = Math.max(0.001, toFinite(stepOptions.dt, 1 / 60));

    const outputScale = Math.max(0.0001, toFinite(stepOptions.outputScale, DEFAULT_OPTIONS.outputScale));

    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsBuffer);

    const encoder = this.device.createCommandEncoder({ label: 'layout:gpu-force:step' });
    const pass = encoder.beginComputePass({ label: 'layout:gpu-force:compute' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(Math.ceil(this.nodeCapacity / WORKGROUP_SIZE));
    pass.end();

    const bytes = Math.max(1, this.nodeCapacity) * 12;
    encoder.copyBufferToBuffer(this.scratchPositionBuffer, 0, this.positionBuffer, 0, bytes);
    encoder.copyBufferToBuffer(this.scratchVelocityBuffer, 0, this.velocityBuffer, 0, bytes);

    if (Math.abs(outputScale - 1.0) <= 1e-6) {
      encoder.copyBufferToBuffer(this.positionBuffer, 0, this.outputPositionBuffer, 0, bytes);
    } else {
      this._ensureOutputScalePipeline();
      this._rebuildOutputScaleBindGroup();
      if (!this.outputScalePipeline || !this.outputScaleBindGroup || !this.outputScaleParamsBuffer) {
        return false;
      }
      const scaleParamsBuffer = new ArrayBuffer(12 * 4);
      const scaleParamsU32 = new Uint32Array(scaleParamsBuffer);
      const scaleParamsF32 = new Float32Array(scaleParamsBuffer);
      scaleParamsU32[0] = this.nodeCapacity >>> 0;
      scaleParamsU32[1] = stepOptions.mode === '3d' ? 1 : 0;
      scaleParamsF32[4] = center[0];
      scaleParamsF32[5] = center[1];
      scaleParamsF32[6] = center[2];
      scaleParamsF32[8] = outputScale;
      this.device.queue.writeBuffer(this.outputScaleParamsBuffer, 0, scaleParamsBuffer);

      const outputScalePass = encoder.beginComputePass({ label: 'layout:gpu-force:output-scale' });
      outputScalePass.setPipeline(this.outputScalePipeline);
      outputScalePass.setBindGroup(0, this.outputScaleBindGroup);
      outputScalePass.dispatchWorkgroups(Math.ceil(this.nodeCapacity / WORKGROUP_SIZE));
      outputScalePass.end();
    }

    this.device.queue.submit([encoder.finish()]);
    return true;
  }

  getPositionBuffer() {
    return this.outputPositionBuffer ?? this.positionBuffer ?? null;
  }

  async readPositionSnapshot() {
    const sourceBuffer = this.getPositionBuffer();
    if (!this.device || !sourceBuffer || this.nodeCapacity <= 0) return null;
    const byteLength = Math.max(1, this.nodeCapacity) * 12;
    const staging = this.device.createBuffer({
      size: byteLength,
      usage: getGpuUsage('MAP_READ', MAP_READ_FLAG) | getGpuUsage('COPY_DST', COPY_DST_FLAG),
      label: 'layout:gpu-force:positions-readback',
    });
    try {
      const encoder = this.device.createCommandEncoder({ label: 'layout:gpu-force:readback' });
      encoder.copyBufferToBuffer(sourceBuffer, 0, staging, 0, byteLength);
      this.device.queue.submit([encoder.finish()]);
      await staging.mapAsync(getGpuMapMode('READ', MAP_READ_FLAG), 0, byteLength);
      const mapped = staging.getMappedRange(0, byteLength);
      const copy = new Float32Array(mapped.slice(0));
      staging.unmap();
      return copy;
    } finally {
      staging.destroy?.();
    }
  }

  dispose() {
    this.positionBuffer?.destroy?.();
    this.outputPositionBuffer?.destroy?.();
    this.velocityBuffer?.destroy?.();
    this.scratchPositionBuffer?.destroy?.();
    this.scratchVelocityBuffer?.destroy?.();
    this.activeIdsBuffer?.destroy?.();
    this.activeMaskBuffer?.destroy?.();
    this.neighborStartsBuffer?.destroy?.();
    this.neighborCountsBuffer?.destroy?.();
    this.neighborsBuffer?.destroy?.();
    this.paramsBuffer?.destroy?.();
    this.outputScaleParamsBuffer?.destroy?.();

    this.positionBuffer = null;
    this.outputPositionBuffer = null;
    this.velocityBuffer = null;
    this.scratchPositionBuffer = null;
    this.scratchVelocityBuffer = null;
    this.activeIdsBuffer = null;
    this.activeMaskBuffer = null;
    this.neighborStartsBuffer = null;
    this.neighborCountsBuffer = null;
    this.neighborsBuffer = null;
    this.paramsBuffer = null;
    this.outputScaleParamsBuffer = null;
    this.bindGroup = null;
    this.outputScaleBindGroup = null;
    this.pipeline = null;
    this.outputScalePipeline = null;
    this.bindGroupLayout = null;
    this.outputScaleBindGroupLayout = null;
    this.nodeCapacity = 0;
    this.activeCount = 0;
  }
}

export class GpuForcePositionDelegate extends PositionDelegate {
  constructor(options = {}) {
    super();
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      center: normalizeCenter(options.center ?? DEFAULT_OPTIONS.center),
      mode: options.mode === '3d' ? '3d' : '2d',
    };
    this.alpha = clamp(this.options.alpha, 0, 1, DEFAULT_OPTIONS.alpha);
    this._backendType = null;
    this._backendDeviceRef = null;
    this._backendGlRef = null;
    this._webgpu = null;
    this._webgl = null;
    this._activeCount = 0;
    this._nodeCapacity = 0;
  }

  didDetach() {
    this.dispose();
  }

  updateOptions(next = {}) {
    if (!next || typeof next !== 'object') return this;
    const prevMode = this.options.mode;
    const prevCenter = this.options.center;
    this.options = {
      ...this.options,
      ...next,
      center: normalizeCenter(next.center ?? this.options.center),
      mode: (next.mode ?? this.options.mode) === '3d' ? '3d' : '2d',
    };
    if (next.alpha != null) {
      this.alpha = clamp(next.alpha, 0, 1, this.alpha);
    }
    const centerChanged = (
      prevCenter[0] !== this.options.center[0]
      || prevCenter[1] !== this.options.center[1]
      || prevCenter[2] !== this.options.center[2]
    );
    if (prevMode !== this.options.mode || centerChanged) {
      this.markTopologyDirty('options');
    }
    return this;
  }

  dispose() {
    this._webgpu?.dispose?.();
    this._webgl?.dispose?.();
    this._webgpu = null;
    this._webgl = null;
    this._backendType = null;
    this._backendDeviceRef = null;
    this._backendGlRef = null;
    this._activeCount = 0;
    this._nodeCapacity = 0;
  }

  _resolveBackend(context = {}) {
    const renderer = context.renderer ?? context.helios?.renderer ?? null;
    const rendererDevice = renderer?.device ?? null;
    const backend = normalizeBackendType(context.backend ?? rendererDevice?.type ?? null);
    const possibleDevice = context.device ?? rendererDevice?.device ?? null;
    const gpuDevice = possibleDevice
      && typeof possibleDevice.createCommandEncoder === 'function'
      && typeof possibleDevice.createBuffer === 'function'
      ? possibleDevice
      : null;
    const gl = context.gl ?? rendererDevice?.gl ?? null;
    return {
      backend: backend ?? null,
      gpuDevice,
      gl,
    };
  }

  _markDirtyForBackend(context = {}) {
    const resolved = this._resolveBackend(context);
    const changed = (
      this._backendType !== resolved.backend
      || this._backendDeviceRef !== resolved.gpuDevice
      || this._backendGlRef !== resolved.gl
    );
    if (changed) {
      this._backendType = resolved.backend;
      this._backendDeviceRef = resolved.gpuDevice;
      this._backendGlRef = resolved.gl;
      this.markTopologyDirty('backend-change');
    }
    return resolved;
  }

  synchronizeTopology(context = {}) {
    const network = context.network ?? null;
    if (!network) return;
    const versionSnapshot = context.versionSnapshot ?? null;
    const previousVersionSnapshot = context.previousVersionSnapshot ?? null;
    const synchronizeReason = context.reason ?? null;
    const topologyUnchanged = synchronizeReason === 'version-change'
      && isSameTopologySnapshot(previousVersionSnapshot, versionSnapshot);
    const fallbackInputs = snapshotTopologyInputs(network);
    const topologyInputs = {
      ...fallbackInputs,
      nodeIndices: versionSnapshot?.nodeIndicesRef instanceof Uint32Array
        ? versionSnapshot.nodeIndicesRef
        : fallbackInputs.nodeIndices,
      edgeIndices: versionSnapshot?.edgeIndicesRef instanceof Uint32Array
        ? versionSnapshot.edgeIndicesRef
        : fallbackInputs.edgeIndices,
      nodeCapacity: Number.isFinite(versionSnapshot?.nodeIndicesCount)
        ? Math.max(
          fallbackInputs.nodeCapacity,
          Math.floor(Number(versionSnapshot.nodeIndicesCount)),
        )
        : fallbackInputs.nodeCapacity,
      positionView: null,
    };

    const resolved = this._resolveBackend(context);
    const isWebGPU = resolved.backend === 'webgpu' && Boolean(resolved.gpuDevice);
    const isWebGL = resolved.backend === 'webgl' && Boolean(resolved.gl);

    if (!isWebGPU && !isWebGL) {
      this._webgpu?.dispose?.();
      this._webgl?.dispose?.();
      this._webgpu = null;
      this._webgl = null;
      this._activeCount = topologyInputs.nodeIndices.length;
      this._nodeCapacity = topologyInputs.nodeCapacity;
      return;
    }

    if (isWebGPU) {
      this._webgl?.dispose?.();
      this._webgl = null;
      if (!this._webgpu || this._webgpu.device !== resolved.gpuDevice) {
        this._webgpu?.dispose?.();
        this._webgpu = new WebGPUForceComputeBackend(resolved.gpuDevice);
      }
      if (topologyUnchanged && this._webgpu.getPositionBuffer() && this._activeCount > 0) {
        return;
      }
    } else {
      this._webgpu?.dispose?.();
      this._webgpu = null;
      if (!this._webgl || this._webgl.gl !== resolved.gl) {
        this._webgl?.dispose?.();
        this._webgl = new WebGLForceComputeBackend(resolved.gl);
      }
      if (topologyUnchanged && this._webgl.getPositionTexture() && this._activeCount > 0) {
        return;
      }
    }

    let payload = null;
    if (typeof network.withBufferAccess === 'function') {
      network.withBufferAccess(() => {
        topologyInputs.positionView = network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
      });
    } else {
      topologyInputs.positionView = network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
    }
    payload = buildTopologyPayload(topologyInputs, this.options);
    if (!payload) return;

    this._activeCount = payload.activeCount;
    this._nodeCapacity = payload.nodeCapacity;
    const shouldPreferPreserve = synchronizeReason !== 'attach'
      && synchronizeReason !== 'backend-change'
      && synchronizeReason !== 'network:replaced'
      && synchronizeReason !== 'options'
      && synchronizeReason !== 'init';
    const preserveDynamicState = Boolean(shouldPreferPreserve
      && this._nodeCapacity > 0
      && topologyInputs.nodeCapacity === this._nodeCapacity
      && (
        (this._webgpu && this._webgpu.getPositionBuffer?.())
        || (this._webgl && this._webgl.getPositionTexture?.())
      ));
    if (this._webgpu) {
      this._webgpu.syncTopology(payload, { preserveDynamicState });
    } else if (this._webgl) {
      this._webgl.syncTopology(payload, { preserveDynamicState });
    }

    if (this.options.resetAlphaOnTopologyChange !== false) {
      this.alpha = clamp(this.options.alpha, 0, 1, DEFAULT_OPTIONS.alpha);
    }
  }

  step(context = {}) {
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    if ((this._webgpu || this._webgl) && this._nodeCapacity > 0 && this._activeCount <= 0) {
      // Recover if a transient snapshot produced an empty active set.
      this.markTopologyDirty('active-set-empty');
      this.ensureSynchronized(context);
    }
    if (!this._webgpu && !this._webgl) {
      return false;
    }

    const dtMs = Math.max(1, toFinite(context.deltaMs, 16));
    const dt = Math.min(0.08, Math.max(0.008, dtMs * 0.001));
    const dtScale = dt * 60;

    const alphaTarget = clamp(this.options.alphaTarget, 0, 1, DEFAULT_OPTIONS.alphaTarget);
    const alphaDecay = clamp(this.options.alphaDecay, 0, 1, DEFAULT_OPTIONS.alphaDecay);
    const alphaMin = clamp(this.options.alphaMin, 0, 1, DEFAULT_OPTIONS.alphaMin);
    this.alpha += (alphaTarget - this.alpha) * alphaDecay;
    if (this.alpha < alphaMin) this.alpha = alphaMin;

    const explicitSampleCount = Number(this.options.sampleCount);
    const sampleCount = Number.isFinite(explicitSampleCount)
      ? Math.max(1, Math.floor(explicitSampleCount))
      : (this.options.mode === '3d'
        ? Math.max(1, Math.floor(toFinite(this.options.sampleCount3D, DEFAULT_OPTIONS.sampleCount3D)))
        : Math.max(1, Math.floor(toFinite(this.options.sampleCount2D, DEFAULT_OPTIONS.sampleCount2D))));

    const stepPayload = {
      mode: this.options.mode,
      center: this.options.center,
      recenter: this.options.recenter === true,
      sampleCount,
      maxNeighborsPerNode: Math.max(1, Math.floor(toFinite(this.options.maxNeighborsPerNode, DEFAULT_OPTIONS.maxNeighborsPerNode))),
      outputScale: Math.max(0.0001, toFinite(this.options.outputScale, DEFAULT_OPTIONS.outputScale)),
      linkDistance: Math.max(0.0001, toFinite(this.options.linkDistance, DEFAULT_OPTIONS.linkDistance)),
      kRepulsion: toFinite(this.options.kRepulsion, DEFAULT_OPTIONS.kRepulsion) * this.alpha,
      kAttraction: toFinite(this.options.kAttraction, DEFAULT_OPTIONS.kAttraction) * this.alpha,
      kGravity: toFinite(this.options.kGravity, DEFAULT_OPTIONS.kGravity) * this.alpha,
      eta: toFinite(this.options.eta, DEFAULT_OPTIONS.eta) * dtScale,
      damping: clamp(this.options.damping, 0, 1, DEFAULT_OPTIONS.damping),
      maxStep: Math.max(0.001, toFinite(this.options.maxStep, DEFAULT_OPTIONS.maxStep) * dtScale),
      minDistance: Math.max(0.0001, toFinite(this.options.minDistance, DEFAULT_OPTIONS.minDistance)),
      alpha: this.alpha,
      dt,
    };
    const changed = this._webgpu
      ? this._webgpu.step(stepPayload)
      : this._webgl.step(stepPayload);

    if (changed) {
      this.bumpVersion();
    }
    return changed;
  }

  getNodePositionView(context = {}) {
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    if (this._webgpu || this._webgl) return null;

    const network = context.network ?? this._context?.network ?? null;
    if (!network) return null;
    if (typeof network.withBufferAccess === 'function') {
      return network.withBufferAccess(() => network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null);
    }
    return network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
  }

  getWebGPUPositionBuffer(context = {}) {
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    const buffer = this._webgpu?.getPositionBuffer?.() ?? null;
    if (!buffer) return null;
    return {
      buffer,
      count: this._activeCount,
      version: this.version,
    };
  }

  getWebGLPositionTexture(context = {}) {
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    const texture = this._webgl?.getPositionTexture?.() ?? null;
    if (!texture) return null;
    return {
      texture,
      count: this._nodeCapacity,
      version: this.version,
      meta: this._webgl?.getPositionTextureMeta?.() ?? null,
    };
  }

  getGpuPositionResource(context = {}) {
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    if (this._webgpu) {
      const resource = this.getWebGPUPositionBuffer(context);
      if (resource) return resource;
    }
    if (this._webgl) {
      return this.getWebGLPositionTexture(context);
    }
    return null;
  }

  async snapshotNodePositions(context = {}) {
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    if (this._webgpu) {
      return this._webgpu.readPositionSnapshot();
    }
    if (this._webgl) {
      return this._webgl.readPositionSnapshot();
    }
    const view = this.getNodePositionView(context);
    if (!view || !Number.isFinite(view.length) || view.length <= 0) return null;
    return new Float32Array(view);
  }

  async synchronizeNodePositionsToNetwork(context = {}) {
    const network = context.network ?? this._context?.network ?? null;
    if (!network) return false;
    const snapshot = await this.snapshotNodePositions(context);
    if (!snapshot || !Number.isFinite(snapshot.length) || snapshot.length <= 0) return false;

    let wrote = false;
    const apply = () => {
      const buffer = network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE) ?? null;
      const view = buffer?.view ?? null;
      if (!view || !Number.isFinite(view.length) || view.length <= 0) return;
      const count = Math.min(view.length, snapshot.length);
      if (count <= 0) return;
      view.set(snapshot.subarray(0, count), 0);
      wrote = true;
    };

    if (typeof network.withBufferAccess === 'function') {
      network.withBufferAccess(apply);
    } else {
      apply();
    }
    return wrote;
  }
}

export default GpuForcePositionDelegate;
