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
  sampleChurn: 0,
  exactRepulsionThreshold2D: 256,
  exactRepulsionThreshold3D: 128,
  maxNeighborsPerNode: 64,
  outputScale: 6.5,
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
  recenter: true,
  resetAlphaOnTopologyChange: true,
  seed: 0,
};

const COMPUTE_WGSL = /* wgsl */ `
struct Params {
  counts : vec4<u32>,
  flags : vec4<u32>,
  dispatch : vec4<u32>,
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

fn sampleEpoch(iter : u32, sampleCount : u32, churnCount : u32, sampleFrame : u32) -> u32 {
  if (sampleCount == 0u || churnCount == 0u) {
    return 0u;
  }
  let cappedChurn = min(churnCount, sampleCount);
  return ((sampleFrame * cappedChurn) + (sampleCount - 1u - iter)) / sampleCount;
}

fn sampleActiveIdProgressive(
  nodeId : u32,
  iter : u32,
  activeCount : u32,
  seed : u32,
  sampleCount : u32,
  churnCount : u32,
  sampleFrame : u32,
) -> u32 {
  if (activeCount == 0u) {
    return nodeId;
  }
  let epoch = sampleEpoch(iter, sampleCount, churnCount, sampleFrame);
  let epochSeed = seed + epoch * 1597334677u;
  return sampleActiveId(nodeId, iter, activeCount, epochSeed);
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
  let nodeId = gid.x + (gid.y * params.dispatch.x) + (gid.z * params.dispatch.y);
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
  let sampleChurnCount = params.flags.y;
  let seed = params.flags.z;
  let exactRepulsionThreshold = params.flags.w;
  let sampleFrame = params.dispatch.z;

  var pos = loadPosition(nodeId);
  var vel = loadVelocity(nodeId);
  if (use3D == 0u) {
    pos.z = params.center.z;
    vel.z = 0.0;
  }

  var force = vec3<f32>(0.0, 0.0, 0.0);
  let minDist = max(1e-5, params.constantsB.z);
  let minDistSq = minDist * minDist;

  if (activeCount > 1u) {
    let useExactRepulsion = activeCount <= max(sampleCount, exactRepulsionThreshold);
    let repulsionIterations = select(sampleCount, activeCount, useExactRepulsion);
    if (repulsionIterations > 0u) {
      let repulsionNormalization = select(
        max(1.0, f32(activeCount) / max(1.0, f32(sampleCount))),
        1.0,
        useExactRepulsion,
      );
      var s : u32 = 0u;
      loop {
        if (s >= repulsionIterations) {
          break;
        }
        let otherId = select(
          sampleActiveIdProgressive(nodeId, s, activeCount, seed, sampleCount, sampleChurnCount, sampleFrame),
          activeIds[s],
          useExactRepulsion,
        );
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
  dispatch : vec4<u32>,
  center : vec4<f32>,
  scale : vec4<f32>,
};

@group(0) @binding(0) var<storage, read> positionsIn : array<f32>;
@group(0) @binding(1) var<storage, read_write> positionsOut : array<f32>;
@group(0) @binding(2) var<uniform> params : OutputScaleParams;

@compute @workgroup_size(${WORKGROUP_SIZE}u)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let nodeId = gid.x + (gid.y * params.dispatch.x) + (gid.z * params.dispatch.y);
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

const RECENTER_WGSL = /* wgsl */ `
struct RecenterParams {
  counts : vec4<u32>,
  center : vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> positions : array<f32>;
@group(0) @binding(1) var<storage, read> activeIds : array<u32>;
@group(0) @binding(2) var<uniform> params : RecenterParams;

var<workgroup> partialX : array<f32, ${WORKGROUP_SIZE}>;
var<workgroup> partialY : array<f32, ${WORKGROUP_SIZE}>;
var<workgroup> partialZ : array<f32, ${WORKGROUP_SIZE}>;

@compute @workgroup_size(${WORKGROUP_SIZE}u)
fn main(@builtin(local_invocation_id) lid : vec3<u32>) {
  let tid = lid.x;
  let activeCount = params.counts.x;
  if (activeCount == 0u) {
    return;
  }

  var sumX = 0.0;
  var sumY = 0.0;
  var sumZ = 0.0;
  var index = tid;
  loop {
    if (index >= activeCount) {
      break;
    }
    let nodeId = activeIds[index];
    let base = nodeId * 3u;
    sumX = sumX + positions[base + 0u];
    sumY = sumY + positions[base + 1u];
    sumZ = sumZ + positions[base + 2u];
    index = index + ${WORKGROUP_SIZE}u;
  }

  partialX[tid] = sumX;
  partialY[tid] = sumY;
  partialZ[tid] = sumZ;
  workgroupBarrier();

  var stride = ${WORKGROUP_SIZE / 2}u;
  loop {
    if (stride == 0u) {
      break;
    }
    if (tid < stride) {
      partialX[tid] = partialX[tid] + partialX[tid + stride];
      partialY[tid] = partialY[tid] + partialY[tid + stride];
      partialZ[tid] = partialZ[tid] + partialZ[tid + stride];
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }

  if (tid == 0u) {
    let invCount = 1.0 / max(1.0, f32(activeCount));
    partialX[0] = partialX[0] * invCount - params.center.x;
    partialY[0] = partialY[0] * invCount - params.center.y;
    partialZ[0] = select(0.0, partialZ[0] * invCount - params.center.z, params.counts.y != 0u);
  }
  workgroupBarrier();

  let shiftX = partialX[0];
  let shiftY = partialY[0];
  let shiftZ = partialZ[0];
  index = tid;
  loop {
    if (index >= activeCount) {
      break;
    }
    let nodeId = activeIds[index];
    let base = nodeId * 3u;
    positions[base + 0u] = positions[base + 0u] - shiftX;
    positions[base + 1u] = positions[base + 1u] - shiftY;
    if (params.counts.y != 0u) {
      positions[base + 2u] = positions[base + 2u] - shiftZ;
    } else {
      positions[base + 2u] = params.center.z;
    }
    index = index + ${WORKGROUP_SIZE}u;
  }
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

function createEmptyFloatArray() {
  return new Float32Array(0);
}

function ensureUint32Capacity(view, length) {
  const required = Math.max(1, Math.floor(length || 0));
  if (view instanceof Uint32Array && view.length >= required) {
    return view;
  }
  return new Uint32Array(required);
}

function ensureFloat32Capacity(view, length) {
  const required = Math.max(1, Math.floor(length || 0));
  if (view instanceof Float32Array && view.length >= required) {
    return view;
  }
  return new Float32Array(required);
}

function copyFloat32Values(target, source, length) {
  const limit = Math.max(0, Math.min(length | 0, target?.length ?? 0, source?.length ?? 0));
  for (let i = 0; i < limit; i += 1) {
    target[i] = source[i];
  }
}

function resolveComputeDispatchShape(itemCount, workgroupSize, maxWorkgroupsPerDimension = 65535) {
  const safeCount = Math.max(0, Math.floor(itemCount || 0));
  const safeWorkgroupSize = Math.max(1, Math.floor(workgroupSize || 1));
  const limit = Math.max(1, Math.floor(maxWorkgroupsPerDimension || 65535));
  const totalGroups = Math.max(1, Math.ceil(safeCount / safeWorkgroupSize));
  const x = Math.min(limit, totalGroups);
  const remainingAfterX = Math.max(1, Math.ceil(totalGroups / x));
  const y = Math.min(limit, remainingAfterX);
  const z = Math.max(1, Math.ceil(remainingAfterX / y));
  if (z > limit) {
    throw new Error(
      `GPU-force dispatch requires ${totalGroups} workgroups, exceeding WebGPU grid capacity `
      + `(${limit} per dimension).`,
    );
  }
  const rowStride = x * safeWorkgroupSize;
  const layerStride = rowStride * y;
  return {
    x,
    y,
    z,
    rowStride,
    layerStride,
    totalGroups,
  };
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
  const snapshot = safeRead(
    () => {
      if (typeof network?.withBufferAccess === 'function') {
        return network.withBufferAccess(() => ({
          nodeIndices: network?.nodeIndices instanceof Uint32Array ? network.nodeIndices : createEmptyUintArray(),
          edgeIndices: network?.edgeIndices instanceof Uint32Array ? network.edgeIndices : createEmptyUintArray(),
        }), { nodeIndices: true, edgeIndices: true });
      }
      return {
        nodeIndices: network?.nodeIndices instanceof Uint32Array ? network.nodeIndices : createEmptyUintArray(),
        edgeIndices: network?.edgeIndices instanceof Uint32Array ? network.edgeIndices : createEmptyUintArray(),
      };
    },
    { nodeIndices: createEmptyUintArray(), edgeIndices: createEmptyUintArray() },
  );
  const nodeIndices = snapshot.nodeIndices;
  const edgeIndices = snapshot.edgeIndices;
  const nodeCapacityRaw = Number(safeRead(() => network?.nodeCapacity, 0));
  const nodeCapacity = Number.isFinite(nodeCapacityRaw) && nodeCapacityRaw > 0
    ? Math.floor(nodeCapacityRaw)
    : 0;
  const inferredCapacity = Math.max(0, Math.floor(nodeIndices.length));
  return {
    nodeCapacity: Math.max(nodeCapacity, inferredCapacity),
    nodeIndices,
    edgeIndices,
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

function buildTopologyPayload(topologyInputs, options = {}, scratch = {}) {
  const {
    nodeCapacity = 0,
    nodeIndices = createEmptyUintArray(),
    edgeIndices = createEmptyUintArray(),
    edgesView = createEmptyUintArray(),
    positionView = null,
  } = topologyInputs ?? {};

  const hasExplicitActiveIds = nodeIndices.length > 0;
  const activeCount = hasExplicitActiveIds ? nodeIndices.length : nodeCapacity;
  const activeIds = ensureUint32Capacity(scratch.activeIds, activeCount);
  scratch.activeIds = activeIds;
  const activeMask = ensureUint32Capacity(scratch.activeMask, nodeCapacity);
  scratch.activeMask = activeMask;
  activeMask.fill(0, 0, nodeCapacity);
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

  const neighborCounts = ensureUint32Capacity(scratch.neighborCounts, nodeCapacity);
  scratch.neighborCounts = neighborCounts;
  neighborCounts.fill(0, 0, nodeCapacity);
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

  const neighborStarts = ensureUint32Capacity(scratch.neighborStarts, nodeCapacity);
  scratch.neighborStarts = neighborStarts;
  let neighborLength = 0;
  for (let nodeId = 0; nodeId < nodeCapacity; nodeId += 1) {
    neighborStarts[nodeId] = neighborLength;
    neighborLength += neighborCounts[nodeId];
  }

  const neighbors = ensureUint32Capacity(scratch.neighbors, neighborLength);
  scratch.neighbors = neighbors;
  const cursor = ensureUint32Capacity(scratch.cursor, nodeCapacity);
  scratch.cursor = cursor;
  for (let nodeId = 0; nodeId < nodeCapacity; nodeId += 1) {
    cursor[nodeId] = neighborStarts[nodeId];
  }
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
  const valueCount = Math.max(1, nodeCapacity) * 3;
  const packedPositions = ensureFloat32Capacity(scratch.packedPositions, valueCount);
  scratch.packedPositions = packedPositions;
  const packedOutputPositions = ensureFloat32Capacity(scratch.packedOutputPositions, valueCount);
  scratch.packedOutputPositions = packedOutputPositions;
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

  if (is3D && activeCount > 1) {
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < activeCount; i += 1) {
      const nodeId = activeIds[i] >>> 0;
      const z = packedOutputPositions[(nodeId * 3) + 2];
      if (!Number.isFinite(z)) continue;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const zRange = Number.isFinite(minZ) && Number.isFinite(maxZ) ? (maxZ - minZ) : 0;
    const planarTolerance = Math.max(1e-6, depth * 1e-5, radius * 1e-6);
    if (zRange <= planarTolerance) {
      const jitterBase = depth > 1e-6 ? depth : Math.max(1, radius * 0.25);
      const jitterAmplitude = Math.max(1e-3, jitterBase * 0.04);
      let jitterMean = 0;
      for (let i = 0; i < activeCount; i += 1) {
        const nodeId = activeIds[i] >>> 0;
        jitterMean += (((hash32((nodeId + 1) >>> 0) + 0.5) / 4294967296) - 0.5) * jitterAmplitude;
      }
      jitterMean /= activeCount;

      for (let i = 0; i < activeCount; i += 1) {
        const nodeId = activeIds[i] >>> 0;
        const offset = nodeId * 3;
        const jitter = ((((hash32((nodeId + 1) >>> 0) + 0.5) / 4294967296) - 0.5) * jitterAmplitude) - jitterMean;
        const nextOutputZ = packedOutputPositions[offset + 2] + jitter;
        packedOutputPositions[offset + 2] = nextOutputZ;
        packedPositions[offset + 2] = normalizeInputByOutputScale
          ? (center[2] + ((nextOutputZ - center[2]) / outputScale))
          : nextOutputZ;
      }
    }
  }

  return {
    nodeCapacity,
    activeCount,
    activeIds,
    activeMask,
    neighborStarts,
    neighborCounts,
    neighbors,
    packedPositions,
    packedOutputPositions,
    neighborLength,
    valueCount,
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

function resolveSampleChurnCount(sampleCount, sampleChurn) {
  const safeSampleCount = Math.max(1, Math.floor(Number(sampleCount) || 0));
  const churn = clamp(sampleChurn, 0, 1, DEFAULT_OPTIONS.sampleChurn);
  if (churn <= 0) return 0;
  return Math.min(safeSampleCount, Math.max(1, Math.ceil(safeSampleCount * churn)));
}

function resolveSampleEpoch(iter, sampleCount, churnCount, sampleFrame) {
  const safeSampleCount = Math.max(1, Math.floor(Number(sampleCount) || 0));
  const safeChurnCount = Math.min(safeSampleCount, Math.max(0, Math.floor(Number(churnCount) || 0)));
  if (safeChurnCount <= 0) return 0;
  const safeIter = Math.max(0, Math.floor(Number(iter) || 0));
  const safeFrame = Math.max(0, Math.floor(Number(sampleFrame) || 0));
  return Math.floor(((safeFrame * safeChurnCount) + (safeSampleCount - 1 - safeIter)) / safeSampleCount);
}

function countChangedSampleSlots(sampleCount, churnCount, sampleFrame) {
  const safeSampleCount = Math.max(1, Math.floor(Number(sampleCount) || 0));
  const safeChurnCount = Math.min(safeSampleCount, Math.max(0, Math.floor(Number(churnCount) || 0)));
  const safeFrame = Math.max(0, Math.floor(Number(sampleFrame) || 0));
  if (safeChurnCount <= 0 || safeFrame <= 0) return 0;
  let changed = 0;
  const previousFrame = safeFrame - 1;
  for (let iter = 0; iter < safeSampleCount; iter += 1) {
    const previousEpoch = resolveSampleEpoch(iter, safeSampleCount, safeChurnCount, previousFrame);
    const currentEpoch = resolveSampleEpoch(iter, safeSampleCount, safeChurnCount, safeFrame);
    if (previousEpoch !== currentEpoch) {
      changed += 1;
    }
  }
  return changed;
}

function sampleActiveIdProgressive(nodeId, iter, activeIds, activeCount, seed, sampleCount, churnCount, sampleFrame) {
  const epoch = resolveSampleEpoch(iter, sampleCount, churnCount, sampleFrame);
  if (epoch <= 0) {
    return sampleActiveId(nodeId, iter, activeIds, activeCount, seed);
  }
  const epochSeed = (seed + Math.imul(epoch >>> 0, 1597334677)) >>> 0;
  return sampleActiveId(nodeId, iter, activeIds, activeCount, epochSeed);
}

function recenterActivePositions(positions, activeIds, activeCount, center, is3D) {
  if (!(positions instanceof Float32Array) || !activeIds || activeCount <= 0) return;

  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let validCount = 0;
  for (let i = 0; i < activeCount; i += 1) {
    const nodeId = activeIds[i];
    const base = nodeId * 3;
    if (base + 2 >= positions.length) continue;
    sumX += positions[base];
    sumY += positions[base + 1];
    sumZ += positions[base + 2];
    validCount += 1;
  }

  if (validCount <= 0) return;

  const shiftX = (sumX / validCount) - center[0];
  const shiftY = (sumY / validCount) - center[1];
  const shiftZ = is3D ? ((sumZ / validCount) - center[2]) : 0;
  if (Math.abs(shiftX) <= 1e-9 && Math.abs(shiftY) <= 1e-9 && Math.abs(shiftZ) <= 1e-9) return;

  for (let i = 0; i < activeCount; i += 1) {
    const nodeId = activeIds[i];
    const base = nodeId * 3;
    if (base + 2 >= positions.length) continue;
    positions[base] -= shiftX;
    positions[base + 1] -= shiftY;
    positions[base + 2] = is3D ? (positions[base + 2] - shiftZ) : center[2];
  }
}

function compileWebGLShader(gl, type, source) {
  const shader = gl?.createShader?.(type) ?? null;
  if (!shader) {
    throw new Error('WebGL2 GPU-force shader creation failed.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || 'WebGL2 GPU-force shader compilation failed.');
  }
  return shader;
}

function createWebGLProgram(gl, vertexSource, fragmentSource) {
  const vertex = compileWebGLShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileWebGLShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error(log || 'WebGL2 GPU-force program link failed.');
  }
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

function canUseWebGLTextureCompute(gl) {
  if (!gl) return false;
  if (typeof gl.createShader !== 'function' || typeof gl.drawBuffers !== 'function') return false;
  if (typeof gl.createFramebuffer !== 'function' || typeof gl.readPixels !== 'function') return false;
  if (typeof gl.getExtension === 'function') {
    const ext = gl.getExtension('EXT_color_buffer_float');
    if (!ext) return false;
  } else {
    return false;
  }
  return true;
}

function resolveWebGLTextureLayout(gl, count) {
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

const WEBGL_FORCE_FULLSCREEN_VERTEX = `#version 300 es
void main() {
  vec2 position = vec2(
    gl_VertexID == 2 ? 3.0 : -1.0,
    gl_VertexID == 1 ? 3.0 : -1.0
  );
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const WEBGL_FORCE_COMPUTE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_positions;
uniform sampler2D u_velocities;
uniform usampler2D u_activeIds;
uniform usampler2D u_activeMask;
uniform usampler2D u_neighborStarts;
uniform usampler2D u_neighborCounts;
uniform usampler2D u_neighbors;

uniform ivec2 u_nodeTexSize;
uniform ivec2 u_activeIdsTexSize;
uniform ivec2 u_neighborTexSize;

uniform int u_nodeCapacity;
uniform int u_activeCount;
uniform int u_sampleCount;
uniform int u_maxNeighbors;
uniform int u_use3D;
uniform int u_exactRepulsionThreshold;
uniform int u_sampleChurnCount;

uniform uint u_seed;
uniform uint u_sampleFrame;

uniform vec3 u_center;
uniform float u_outputScale;
uniform float u_linkDistance;
uniform float u_minDistance;
uniform float u_kRepulsion;
uniform float u_kAttraction;
uniform float u_kGravity;
uniform float u_eta;
uniform float u_damping;
uniform float u_maxStep;

layout(location = 0) out vec4 outPosition;
layout(location = 1) out vec4 outVelocity;
layout(location = 2) out vec4 outOutputPosition;

ivec2 textureCoord(ivec2 size, int index) {
  int width = max(size.x, 1);
  return ivec2(index % width, index / width);
}

uint hash32(uint value) {
  uint x = value;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

uint sampleActiveId(int nodeId, int iter, int activeCount, uint seed) {
  if (activeCount <= 0) {
    return uint(max(nodeId, 0));
  }
  uint mixed = hash32(seed + uint(nodeId) * 2654435761u + uint(iter) * 747796405u);
  int index = int(mixed % uint(max(activeCount, 1)));
  return texelFetch(u_activeIds, textureCoord(u_activeIdsTexSize, index), 0).x;
}

int sampleEpoch(int iter, int sampleCount, int churnCount, uint sampleFrame) {
  if (sampleCount <= 0 || churnCount <= 0) {
    return 0;
  }
  int cappedChurn = min(churnCount, sampleCount);
  return int(((sampleFrame * uint(cappedChurn)) + uint(sampleCount - 1 - iter)) / uint(sampleCount));
}

uint sampleActiveIdProgressive(int nodeId, int iter, int activeCount, uint seed, int sampleCount, int churnCount, uint sampleFrame) {
  if (activeCount <= 0) {
    return uint(max(nodeId, 0));
  }
  int epoch = sampleEpoch(iter, sampleCount, churnCount, sampleFrame);
  uint epochSeed = seed + uint(epoch) * 1597334677u;
  return sampleActiveId(nodeId, iter, activeCount, epochSeed);
}

vec3 fetchPosition(int nodeId) {
  return texelFetch(u_positions, textureCoord(u_nodeTexSize, nodeId), 0).xyz;
}

vec3 fetchVelocity(int nodeId) {
  return texelFetch(u_velocities, textureCoord(u_nodeTexSize, nodeId), 0).xyz;
}

uint fetchNodeUint(usampler2D source, int nodeId) {
  return texelFetch(source, textureCoord(u_nodeTexSize, nodeId), 0).x;
}

uint fetchNeighborValue(int index) {
  return texelFetch(u_neighbors, textureCoord(u_neighborTexSize, index), 0).x;
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  int nodeId = coord.x + coord.y * max(u_nodeTexSize.x, 1);
  if (nodeId < 0 || nodeId >= u_nodeCapacity) {
    outPosition = vec4(0.0);
    outVelocity = vec4(0.0);
    outOutputPosition = vec4(0.0);
    return;
  }

  vec3 pos = fetchPosition(nodeId);
  vec3 vel = fetchVelocity(nodeId);
  if (u_use3D == 0) {
    pos.z = u_center.z;
    vel.z = 0.0;
  }

  if (fetchNodeUint(u_activeMask, nodeId) == 0u) {
    vec3 outputPos = pos;
    outputPos.xy = u_center.xy + (outputPos.xy - u_center.xy) * u_outputScale;
    outputPos.z = u_use3D != 0
      ? (u_center.z + (pos.z - u_center.z) * u_outputScale)
      : u_center.z;
    outPosition = vec4(pos, 1.0);
    outVelocity = vec4(vel, 1.0);
    outOutputPosition = vec4(outputPos, 1.0);
    return;
  }

  vec3 force = vec3(0.0);
  float minDist = max(0.00001, u_minDistance);
  float minDistSq = minDist * minDist;

  if (u_activeCount > 1) {
    bool useExactRepulsion = u_activeCount <= max(u_sampleCount, u_exactRepulsionThreshold);
    int repulsionIterations = useExactRepulsion ? u_activeCount : u_sampleCount;
    float repulsionNormalization = useExactRepulsion
      ? 1.0
      : max(1.0, float(u_activeCount) / max(1.0, float(u_sampleCount)));
    int s = 0;
    while (s < repulsionIterations) {
      uint otherIdU = useExactRepulsion
        ? texelFetch(u_activeIds, textureCoord(u_activeIdsTexSize, s), 0).x
        : sampleActiveIdProgressive(
          nodeId,
          s,
          u_activeCount,
          u_seed,
          u_sampleCount,
          u_sampleChurnCount,
          u_sampleFrame
        );
      int otherId = int(otherIdU);
      if (otherId != nodeId && otherId >= 0 && otherId < u_nodeCapacity) {
        vec3 delta = pos - fetchPosition(otherId);
        if (u_use3D == 0) {
          delta.z = 0.0;
        }
        float distSq = max(dot(delta, delta), minDistSq);
        float invDist = inversesqrt(distSq);
        float repulsionScale = u_kRepulsion * repulsionNormalization * invDist * invDist * invDist;
        force += delta * repulsionScale;
      }
      s += 1;
    }
  }

  int start = int(fetchNodeUint(u_neighborStarts, nodeId));
  int degree = int(fetchNodeUint(u_neighborCounts, nodeId));
  int limit = min(degree, u_maxNeighbors);
  if (limit > 0) {
    float degreeNorm = max(1.0, float(limit));
    int n = 0;
    while (n < limit) {
      int otherId = int(fetchNeighborValue(start + n));
      if (otherId != nodeId && otherId >= 0 && otherId < u_nodeCapacity) {
        vec3 delta = fetchPosition(otherId) - pos;
        if (u_use3D == 0) {
          delta.z = 0.0;
        }
        float distSq = max(dot(delta, delta), minDistSq);
        float dist = sqrt(distSq);
        float invDist = 1.0 / max(0.00000001, dist);
        float stretch = dist - u_linkDistance;
        float springScale = (u_kAttraction * stretch * invDist) / degreeNorm;
        force += delta * springScale;
      }
      n += 1;
    }
  }

  vec3 gravityDelta = u_center - pos;
  if (u_use3D == 0) {
    gravityDelta.z = 0.0;
  }
  force += gravityDelta * u_kGravity;

  vec3 nextVel = vel * u_damping + force * u_eta;
  float speed = length(nextVel);
  if (speed > u_maxStep) {
    nextVel *= u_maxStep / max(speed, 0.00000001);
  }
  if (u_use3D == 0) {
    nextVel.z = 0.0;
  }

  vec3 nextPos = pos + nextVel;
  if (u_use3D == 0) {
    nextPos.z = u_center.z;
  }

  vec3 outputPos = nextPos;
  outputPos.xy = u_center.xy + (nextPos.xy - u_center.xy) * u_outputScale;
  outputPos.z = u_use3D != 0
    ? (u_center.z + (nextPos.z - u_center.z) * u_outputScale)
    : u_center.z;

  outPosition = vec4(nextPos, 1.0);
  outVelocity = vec4(nextVel, 1.0);
  outOutputPosition = vec4(outputPos, 1.0);
}`;

const WEBGL_FORCE_REDUCTION_INIT_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_positions;
uniform usampler2D u_activeMask;
uniform ivec2 u_nodeTexSize;
uniform ivec2 u_outputSize;
uniform int u_nodeCapacity;
uniform int u_use3D;
uniform vec3 u_center;

out vec4 fragColor;

ivec2 textureCoord(ivec2 size, int index) {
  int width = max(size.x, 1);
  return ivec2(index % width, index / width);
}

void main() {
  ivec2 outCoord = ivec2(gl_FragCoord.xy);
  ivec2 baseCoord = outCoord * 2;
  vec4 sumValue = vec4(0.0);

  for (int dy = 0; dy < 2; dy += 1) {
    for (int dx = 0; dx < 2; dx += 1) {
      ivec2 srcCoord = baseCoord + ivec2(dx, dy);
      if (srcCoord.x < u_nodeTexSize.x && srcCoord.y < u_nodeTexSize.y) {
        int nodeId = srcCoord.x + srcCoord.y * max(u_nodeTexSize.x, 1);
        if (nodeId >= 0 && nodeId < u_nodeCapacity) {
          uint activeFlag = texelFetch(u_activeMask, textureCoord(u_nodeTexSize, nodeId), 0).x;
          if (activeFlag != 0u) {
            vec3 pos = texelFetch(u_positions, textureCoord(u_nodeTexSize, nodeId), 0).xyz;
            if (u_use3D == 0) {
              pos.z = u_center.z;
            }
            sumValue += vec4(pos, 1.0);
          }
        }
      }
    }
  }

  fragColor = sumValue;
}`;

const WEBGL_FORCE_REDUCTION_COMBINE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;

uniform sampler2D u_source;
uniform ivec2 u_sourceSize;

out vec4 fragColor;

void main() {
  ivec2 outCoord = ivec2(gl_FragCoord.xy);
  ivec2 baseCoord = outCoord * 2;
  vec4 sumValue = vec4(0.0);

  for (int dy = 0; dy < 2; dy += 1) {
    for (int dx = 0; dx < 2; dx += 1) {
      ivec2 srcCoord = baseCoord + ivec2(dx, dy);
      if (srcCoord.x < u_sourceSize.x && srcCoord.y < u_sourceSize.y) {
        sumValue += texelFetch(u_source, srcCoord, 0);
      }
    }
  }

  fragColor = sumValue;
}`;

const WEBGL_FORCE_RECENTER_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_positions;
uniform sampler2D u_velocities;
uniform sampler2D u_centroid;
uniform usampler2D u_activeMask;
uniform ivec2 u_nodeTexSize;
uniform int u_nodeCapacity;
uniform int u_use3D;
uniform vec3 u_center;
uniform float u_outputScale;

layout(location = 0) out vec4 outPosition;
layout(location = 1) out vec4 outVelocity;
layout(location = 2) out vec4 outOutputPosition;

ivec2 textureCoord(ivec2 size, int index) {
  int width = max(size.x, 1);
  return ivec2(index % width, index / width);
}

void main() {
  ivec2 coord = ivec2(gl_FragCoord.xy);
  int nodeId = coord.x + coord.y * max(u_nodeTexSize.x, 1);
  if (nodeId < 0 || nodeId >= u_nodeCapacity) {
    outPosition = vec4(0.0);
    outVelocity = vec4(0.0);
    outOutputPosition = vec4(0.0);
    return;
  }

  vec3 pos = texelFetch(u_positions, textureCoord(u_nodeTexSize, nodeId), 0).xyz;
  vec3 vel = texelFetch(u_velocities, textureCoord(u_nodeTexSize, nodeId), 0).xyz;
  vec4 centroidData = texelFetch(u_centroid, ivec2(0, 0), 0);
  float count = max(centroidData.w, 1.0);
  vec3 centroidValue = centroidData.xyz / count;
  vec3 shift = centroidValue - u_center;
  if (u_use3D == 0) {
    shift.z = 0.0;
  }

  if (texelFetch(u_activeMask, textureCoord(u_nodeTexSize, nodeId), 0).x != 0u) {
    pos -= shift;
  }
  if (u_use3D == 0) {
    pos.z = u_center.z;
    vel.z = 0.0;
  }

  vec3 outputPos = pos;
  outputPos.xy = u_center.xy + (pos.xy - u_center.xy) * u_outputScale;
  outputPos.z = u_use3D != 0
    ? (u_center.z + (pos.z - u_center.z) * u_outputScale)
    : u_center.z;

  outPosition = vec4(pos, 1.0);
  outVelocity = vec4(vel, 1.0);
  outOutputPosition = vec4(outputPos, 1.0);
}`;

class WebGLTextureComputePath {
  constructor(gl) {
    this.gl = gl;
    this.nodeCapacity = 0;
    this.activeCount = 0;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.sampleFrame = 0;
    this.textureVersion = 0;

    this.nodeLayout = { width: 1, height: 1 };
    this.activeLayout = { width: 1, height: 1 };
    this.neighborLayout = { width: 1, height: 1 };

    this.positionTextures = [null, null];
    this.velocityTextures = [null, null];
    this.outputPositionTexture = null;
    this.activeIdsTexture = null;
    this.activeMaskTexture = null;
    this.neighborStartsTexture = null;
    this.neighborCountsTexture = null;
    this.neighborsTexture = null;
    this.framebuffer = null;
    this.readbackFramebuffer = null;
    this.fullscreenVao = null;
    this._reductionTargets = [
      { texture: null, framebuffer: null, width: 1, height: 1 },
      { texture: null, framebuffer: null, width: 1, height: 1 },
    ];
    this._positionUploadScratch = new Float32Array(0);
    this._velocityUploadScratch = new Float32Array(0);
    this._outputUploadScratch = new Float32Array(0);
    this._uintUploadScratch = new Uint32Array(0);
    this._readbackScratch = new Float32Array(0);
    this._textureSizes = new Map();
    this.readIndex = 0;

    this.computeProgram = createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_COMPUTE_FRAGMENT);
    this.reductionInitProgram = createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_REDUCTION_INIT_FRAGMENT);
    this.reductionCombineProgram = createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_REDUCTION_COMBINE_FRAGMENT);
    this.recenterProgram = createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_RECENTER_FRAGMENT);

    this.computeUniforms = this._cacheUniforms(this.computeProgram, [
      'u_positions',
      'u_velocities',
      'u_activeIds',
      'u_activeMask',
      'u_neighborStarts',
      'u_neighborCounts',
      'u_neighbors',
      'u_nodeTexSize',
      'u_activeIdsTexSize',
      'u_neighborTexSize',
      'u_nodeCapacity',
      'u_activeCount',
      'u_sampleCount',
      'u_maxNeighbors',
      'u_use3D',
      'u_exactRepulsionThreshold',
      'u_sampleChurnCount',
      'u_seed',
      'u_sampleFrame',
      'u_center',
      'u_outputScale',
      'u_linkDistance',
      'u_minDistance',
      'u_kRepulsion',
      'u_kAttraction',
      'u_kGravity',
      'u_eta',
      'u_damping',
      'u_maxStep',
    ]);
    this.reductionInitUniforms = this._cacheUniforms(this.reductionInitProgram, [
      'u_positions',
      'u_activeMask',
      'u_nodeTexSize',
      'u_outputSize',
      'u_nodeCapacity',
      'u_use3D',
      'u_center',
    ]);
    this.reductionCombineUniforms = this._cacheUniforms(this.reductionCombineProgram, [
      'u_source',
      'u_sourceSize',
    ]);
    this.recenterUniforms = this._cacheUniforms(this.recenterProgram, [
      'u_positions',
      'u_velocities',
      'u_centroid',
      'u_activeMask',
      'u_nodeTexSize',
      'u_nodeCapacity',
      'u_use3D',
      'u_center',
      'u_outputScale',
    ]);

    this.framebuffer = gl.createFramebuffer();
    this.readbackFramebuffer = gl.createFramebuffer();
    this.fullscreenVao = gl.createVertexArray();
  }

  _cacheUniforms(program, names) {
    const map = Object.create(null);
    for (const name of names) {
      map[name] = this.gl.getUniformLocation(program, name);
    }
    return map;
  }

  _ensureFloatTexture(field, width, height) {
    const gl = this.gl;
    let texture = this[field] ?? null;
    const sizeKey = `${field}`;
    const previousSize = this._textureSizes.get(sizeKey) ?? null;
    const needsAllocation = !texture || !previousSize || previousSize.width !== width || previousSize.height !== height;
    if (!texture) {
      texture = gl.createTexture();
      this[field] = texture;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (needsAllocation) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      this._textureSizes.set(sizeKey, { width, height });
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  _ensureFloatTextureAt(textures, index, width, height) {
    let texture = textures[index] ?? null;
    const gl = this.gl;
    const sizeKey = `float:${index}`;
    const previousSize = this._textureSizes.get(sizeKey) ?? null;
    const needsAllocation = !texture || !previousSize || previousSize.width !== width || previousSize.height !== height;
    if (!texture) {
      texture = gl.createTexture();
      textures[index] = texture;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (needsAllocation) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      this._textureSizes.set(sizeKey, { width, height });
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  _ensureUintTexture(field, width, height) {
    const gl = this.gl;
    let texture = this[field] ?? null;
    const sizeKey = `${field}`;
    const previousSize = this._textureSizes.get(sizeKey) ?? null;
    const needsAllocation = !texture || !previousSize || previousSize.width !== width || previousSize.height !== height;
    if (!texture) {
      texture = gl.createTexture();
      this[field] = texture;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (needsAllocation) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, null);
      this._textureSizes.set(sizeKey, { width, height });
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }

  _ensureReductionTarget(index, width, height) {
    const gl = this.gl;
    const target = this._reductionTargets[index];
    if (!target.texture) {
      target.texture = gl.createTexture();
    }
    if (!target.framebuffer) {
      target.framebuffer = gl.createFramebuffer();
    }
    if (target.width !== width || target.height !== height) {
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      target.width = width;
      target.height = height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('WebGL2 GPU-force reduction framebuffer is incomplete.');
    }
    return target;
  }

  _ensurePackedFloatScratch(field, texelCount) {
    const required = Math.max(1, texelCount) * 4;
    if (!(this[field] instanceof Float32Array) || this[field].length < required) {
      this[field] = new Float32Array(required);
    }
    return this[field];
  }

  _ensurePackedUintScratch(field, texelCount) {
    const required = Math.max(1, texelCount);
    if (!(this[field] instanceof Uint32Array) || this[field].length < required) {
      this[field] = new Uint32Array(required);
    }
    return this[field];
  }

  _packVec3Source(source, count, field) {
    const texelCount = this.nodeLayout.width * this.nodeLayout.height;
    const target = this._ensurePackedFloatScratch(field, texelCount);
    target.fill(0, 0, texelCount * 4);
    const limit = Math.max(0, Math.min(count, Math.floor((source?.length ?? 0) / 3)));
    for (let i = 0; i < limit; i += 1) {
      const src = i * 3;
      const dst = i * 4;
      target[dst] = source[src] ?? 0;
      target[dst + 1] = source[src + 1] ?? 0;
      target[dst + 2] = source[src + 2] ?? 0;
      target[dst + 3] = 1;
    }
    return target;
  }

  _uploadPackedFloatTexture(texture, packed, width, height) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    // Topology sync happens infrequently, so redefining the texture here is an
    // acceptable tradeoff for broader WebGL driver compatibility.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, packed);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  _uploadUintTexture(texture, layout, view) {
    const gl = this.gl;
    const safeLength = Math.max(1, layout.width * layout.height);
    const data = this._ensurePackedUintScratch('_uintUploadScratch', safeLength);
    data.fill(0, 0, safeLength);
    if (view instanceof Uint32Array && view.length > 0) {
      data.set(view.subarray(0, Math.min(view.length, safeLength)), 0);
    }
    const pixels = data.length === safeLength ? data : data.subarray(0, safeLength);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, layout.width, layout.height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, pixels);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  _bindTexture(unit, texture) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  _prepareMainFramebuffer(positionTexture, velocityTexture, outputTexture) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, positionTexture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, velocityTexture, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT2, gl.TEXTURE_2D, outputTexture, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      throw new Error('WebGL2 GPU-force framebuffer is incomplete.');
    }
  }

  _saveState() {
    const gl = this.gl;
    return {
      framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING),
      vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
      program: gl.getParameter(gl.CURRENT_PROGRAM),
      viewport: gl.getParameter(gl.VIEWPORT),
      activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE),
      blendEnabled: gl.isEnabled(gl.BLEND),
      depthEnabled: gl.isEnabled(gl.DEPTH_TEST),
    };
  }

  _restoreState(state) {
    const gl = this.gl;
    if (!state) return;
    if (state.blendEnabled) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
    if (state.depthEnabled) gl.enable(gl.DEPTH_TEST);
    else gl.disable(gl.DEPTH_TEST);
    gl.useProgram(state.program);
    gl.bindVertexArray(state.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffer);
    gl.viewport(state.viewport[0], state.viewport[1], state.viewport[2], state.viewport[3]);
    gl.activeTexture(state.activeTexture);
  }

  syncTopology(payload, options = {}) {
    if (!payload || !this.gl) return false;
    const preserveDynamicState = options?.preserveDynamicState === true;
    const previousNodeCapacity = this.nodeCapacity;
    this.nodeCapacity = Math.max(0, payload.nodeCapacity | 0);
    this.activeCount = Math.max(0, payload.activeCount | 0);
    this.nodeLayout = resolveWebGLTextureLayout(this.gl, Math.max(1, this.nodeCapacity));
    this.activeLayout = resolveWebGLTextureLayout(this.gl, Math.max(1, this.activeCount));
    this.neighborLayout = resolveWebGLTextureLayout(this.gl, Math.max(1, payload.neighborLength | 0));

    this._ensureFloatTextureAt(this.positionTextures, 0, this.nodeLayout.width, this.nodeLayout.height);
    this._ensureFloatTextureAt(this.positionTextures, 1, this.nodeLayout.width, this.nodeLayout.height);
    this._ensureFloatTextureAt(this.velocityTextures, 0, this.nodeLayout.width, this.nodeLayout.height);
    this._ensureFloatTextureAt(this.velocityTextures, 1, this.nodeLayout.width, this.nodeLayout.height);
    this._ensureFloatTexture('outputPositionTexture', this.nodeLayout.width, this.nodeLayout.height);
    this._ensureUintTexture('activeIdsTexture', this.activeLayout.width, this.activeLayout.height);
    this._ensureUintTexture('activeMaskTexture', this.nodeLayout.width, this.nodeLayout.height);
    this._ensureUintTexture('neighborStartsTexture', this.nodeLayout.width, this.nodeLayout.height);
    this._ensureUintTexture('neighborCountsTexture', this.nodeLayout.width, this.nodeLayout.height);
    this._ensureUintTexture('neighborsTexture', this.neighborLayout.width, this.neighborLayout.height);

    this._uploadUintTexture(this.activeIdsTexture, this.activeLayout, payload.activeIds);
    this._uploadUintTexture(this.activeMaskTexture, this.nodeLayout, payload.activeMask);
    this._uploadUintTexture(this.neighborStartsTexture, this.nodeLayout, payload.neighborStarts);
    this._uploadUintTexture(this.neighborCountsTexture, this.nodeLayout, payload.neighborCounts);
    this._uploadUintTexture(this.neighborsTexture, this.neighborLayout, payload.neighbors);

    const canPreserveDynamicState = preserveDynamicState
      && previousNodeCapacity === this.nodeCapacity
      && this.nodeCapacity > 0;
    if (!canPreserveDynamicState) {
      const positionPacked = this._packVec3Source(payload.packedPositions, this.nodeCapacity, '_positionUploadScratch');
      const outputPacked = this._packVec3Source(
        payload.packedOutputPositions ?? payload.packedPositions,
        this.nodeCapacity,
        '_outputUploadScratch',
      );
      const velocityPacked = this._ensurePackedFloatScratch('_velocityUploadScratch', this.nodeLayout.width * this.nodeLayout.height);
      velocityPacked.fill(0, 0, this.nodeLayout.width * this.nodeLayout.height * 4);
      this._uploadPackedFloatTexture(this.positionTextures[0], positionPacked, this.nodeLayout.width, this.nodeLayout.height);
      this._uploadPackedFloatTexture(this.positionTextures[1], positionPacked, this.nodeLayout.width, this.nodeLayout.height);
      this._uploadPackedFloatTexture(this.velocityTextures[0], velocityPacked, this.nodeLayout.width, this.nodeLayout.height);
      this._uploadPackedFloatTexture(this.velocityTextures[1], velocityPacked, this.nodeLayout.width, this.nodeLayout.height);
      this._uploadPackedFloatTexture(this.outputPositionTexture, outputPacked, this.nodeLayout.width, this.nodeLayout.height);
      this.readIndex = 0;
      this.sampleFrame = 0;
      this.textureVersion += 1;
    }
    return true;
  }

  _runReduction(positionTexture, is3D, center) {
    const gl = this.gl;
    let sourceTexture = positionTexture;
    let sourceWidth = this.nodeLayout.width;
    let sourceHeight = this.nodeLayout.height;
    let sourceIsInitial = true;
    let targetIndex = 0;

    while (sourceWidth > 1 || sourceHeight > 1) {
      const targetWidth = Math.max(1, Math.ceil(sourceWidth / 2));
      const targetHeight = Math.max(1, Math.ceil(sourceHeight / 2));
      const target = this._ensureReductionTarget(targetIndex, targetWidth, targetHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, targetWidth, targetHeight);
      gl.useProgram(sourceIsInitial ? this.reductionInitProgram : this.reductionCombineProgram);
      gl.bindVertexArray(this.fullscreenVao);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

      if (sourceIsInitial) {
        this._bindTexture(0, sourceTexture);
        this._bindTexture(1, this.activeMaskTexture);
        gl.uniform1i(this.reductionInitUniforms.u_positions, 0);
        gl.uniform1i(this.reductionInitUniforms.u_activeMask, 1);
        gl.uniform2i(this.reductionInitUniforms.u_nodeTexSize, this.nodeLayout.width, this.nodeLayout.height);
        gl.uniform2i(this.reductionInitUniforms.u_outputSize, targetWidth, targetHeight);
        gl.uniform1i(this.reductionInitUniforms.u_nodeCapacity, this.nodeCapacity);
        gl.uniform1i(this.reductionInitUniforms.u_use3D, is3D ? 1 : 0);
        gl.uniform3f(this.reductionInitUniforms.u_center, center[0], center[1], center[2]);
      } else {
        this._bindTexture(0, sourceTexture);
        gl.uniform1i(this.reductionCombineUniforms.u_source, 0);
        gl.uniform2i(this.reductionCombineUniforms.u_sourceSize, sourceWidth, sourceHeight);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      sourceTexture = target.texture;
      sourceWidth = targetWidth;
      sourceHeight = targetHeight;
      sourceIsInitial = false;
      targetIndex = (targetIndex + 1) % 2;
    }

    return sourceTexture;
  }

  step(stepOptions = {}) {
    if (!this.gl || this.nodeCapacity <= 0 || this.activeCount <= 0) return false;

    const gl = this.gl;
    const state = this._saveState();
    try {
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(this.fullscreenVao);

      const readIndex = this.readIndex;
      const writeIndex = 1 - readIndex;
      const positionsIn = this.positionTextures[readIndex];
      const velocitiesIn = this.velocityTextures[readIndex];
      const positionsOut = this.positionTextures[writeIndex];
      const velocitiesOut = this.velocityTextures[writeIndex];
      const center = normalizeCenter(stepOptions.center);
      const is3D = stepOptions.mode === '3d';
      const sampleCount = Math.max(1, Math.floor(toFinite(stepOptions.sampleCount, DEFAULT_OPTIONS.sampleCount2D)));
      const sampleChurnCount = resolveSampleChurnCount(sampleCount, stepOptions.sampleChurn);
      const exactRepulsionThreshold = Math.max(1, Math.floor(toFinite(
        stepOptions.exactRepulsionThreshold,
        is3D ? DEFAULT_OPTIONS.exactRepulsionThreshold3D : DEFAULT_OPTIONS.exactRepulsionThreshold2D,
      )));
      const maxNeighborsPerNode = Math.max(1, Math.floor(toFinite(
        stepOptions.maxNeighborsPerNode,
        DEFAULT_OPTIONS.maxNeighborsPerNode,
      )));
      const outputScale = Math.max(0.0001, toFinite(stepOptions.outputScale, DEFAULT_OPTIONS.outputScale));

      this._prepareMainFramebuffer(positionsOut, velocitiesOut, this.outputPositionTexture);
      gl.viewport(0, 0, this.nodeLayout.width, this.nodeLayout.height);
      gl.useProgram(this.computeProgram);
      this._bindTexture(0, positionsIn);
      this._bindTexture(1, velocitiesIn);
      this._bindTexture(2, this.activeIdsTexture);
      this._bindTexture(3, this.activeMaskTexture);
      this._bindTexture(4, this.neighborStartsTexture);
      this._bindTexture(5, this.neighborCountsTexture);
      this._bindTexture(6, this.neighborsTexture);
      gl.uniform1i(this.computeUniforms.u_positions, 0);
      gl.uniform1i(this.computeUniforms.u_velocities, 1);
      gl.uniform1i(this.computeUniforms.u_activeIds, 2);
      gl.uniform1i(this.computeUniforms.u_activeMask, 3);
      gl.uniform1i(this.computeUniforms.u_neighborStarts, 4);
      gl.uniform1i(this.computeUniforms.u_neighborCounts, 5);
      gl.uniform1i(this.computeUniforms.u_neighbors, 6);
      gl.uniform2i(this.computeUniforms.u_nodeTexSize, this.nodeLayout.width, this.nodeLayout.height);
      gl.uniform2i(this.computeUniforms.u_activeIdsTexSize, this.activeLayout.width, this.activeLayout.height);
      gl.uniform2i(this.computeUniforms.u_neighborTexSize, this.neighborLayout.width, this.neighborLayout.height);
      gl.uniform1i(this.computeUniforms.u_nodeCapacity, this.nodeCapacity);
      gl.uniform1i(this.computeUniforms.u_activeCount, this.activeCount);
      gl.uniform1i(this.computeUniforms.u_sampleCount, sampleCount);
      gl.uniform1i(this.computeUniforms.u_maxNeighbors, maxNeighborsPerNode);
      gl.uniform1i(this.computeUniforms.u_use3D, is3D ? 1 : 0);
      gl.uniform1i(this.computeUniforms.u_exactRepulsionThreshold, exactRepulsionThreshold);
      gl.uniform1i(this.computeUniforms.u_sampleChurnCount, sampleChurnCount);
      gl.uniform1ui(this.computeUniforms.u_seed, this.seed >>> 0);
      gl.uniform1ui(this.computeUniforms.u_sampleFrame, this.sampleFrame >>> 0);
      gl.uniform3f(this.computeUniforms.u_center, center[0], center[1], center[2]);
      gl.uniform1f(this.computeUniforms.u_outputScale, outputScale);
      gl.uniform1f(this.computeUniforms.u_linkDistance, Math.max(0.0001, toFinite(stepOptions.linkDistance, DEFAULT_OPTIONS.linkDistance)));
      gl.uniform1f(this.computeUniforms.u_minDistance, Math.max(0.0001, toFinite(stepOptions.minDistance, DEFAULT_OPTIONS.minDistance)));
      gl.uniform1f(this.computeUniforms.u_kRepulsion, toFinite(stepOptions.kRepulsion, DEFAULT_OPTIONS.kRepulsion));
      gl.uniform1f(this.computeUniforms.u_kAttraction, toFinite(stepOptions.kAttraction, DEFAULT_OPTIONS.kAttraction));
      gl.uniform1f(this.computeUniforms.u_kGravity, toFinite(stepOptions.kGravity, DEFAULT_OPTIONS.kGravity));
      gl.uniform1f(this.computeUniforms.u_eta, toFinite(stepOptions.eta, DEFAULT_OPTIONS.eta));
      gl.uniform1f(this.computeUniforms.u_damping, clamp(stepOptions.damping, 0, 1, DEFAULT_OPTIONS.damping));
      gl.uniform1f(this.computeUniforms.u_maxStep, Math.max(0.001, toFinite(stepOptions.maxStep, DEFAULT_OPTIONS.maxStep)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (stepOptions.recenter === true) {
        const centroidTexture = this._runReduction(positionsOut, is3D, center);
        this._prepareMainFramebuffer(this.positionTextures[readIndex], this.velocityTextures[readIndex], this.outputPositionTexture);
        gl.viewport(0, 0, this.nodeLayout.width, this.nodeLayout.height);
        gl.useProgram(this.recenterProgram);
        this._bindTexture(0, positionsOut);
        this._bindTexture(1, velocitiesOut);
        this._bindTexture(2, centroidTexture);
        this._bindTexture(3, this.activeMaskTexture);
        gl.uniform1i(this.recenterUniforms.u_positions, 0);
        gl.uniform1i(this.recenterUniforms.u_velocities, 1);
        gl.uniform1i(this.recenterUniforms.u_centroid, 2);
        gl.uniform1i(this.recenterUniforms.u_activeMask, 3);
        gl.uniform2i(this.recenterUniforms.u_nodeTexSize, this.nodeLayout.width, this.nodeLayout.height);
        gl.uniform1i(this.recenterUniforms.u_nodeCapacity, this.nodeCapacity);
        gl.uniform1i(this.recenterUniforms.u_use3D, is3D ? 1 : 0);
        gl.uniform3f(this.recenterUniforms.u_center, center[0], center[1], center[2]);
        gl.uniform1f(this.recenterUniforms.u_outputScale, outputScale);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      } else {
        this.readIndex = writeIndex;
      }

      if (stepOptions.recenter === true) {
        this.readIndex = readIndex;
      }
      this.sampleFrame = (this.sampleFrame + 1) >>> 0;
      this.textureVersion += 1;
      return true;
    } finally {
      this._restoreState(state);
    }
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

  getExecutionMode() {
    return 'gpu';
  }

  readPositionSnapshot() {
    if (!this.outputPositionTexture || this.nodeCapacity <= 0) return null;
    const gl = this.gl;
    const width = this.nodeLayout.width;
    const height = this.nodeLayout.height;
    const texelCount = Math.max(1, width * height);
    const required = texelCount * 4;
    if (!(this._readbackScratch instanceof Float32Array) || this._readbackScratch.length < required) {
      this._readbackScratch = new Float32Array(required);
    }
    const state = this._saveState();
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.readbackFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputPositionTexture, 0);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, this._readbackScratch);
    } finally {
      this._restoreState(state);
    }
    const output = new Float32Array(Math.max(1, this.nodeCapacity) * 3);
    for (let i = 0; i < this.nodeCapacity; i += 1) {
      const src = i * 4;
      const dst = i * 3;
      output[dst] = this._readbackScratch[src] ?? 0;
      output[dst + 1] = this._readbackScratch[src + 1] ?? 0;
      output[dst + 2] = this._readbackScratch[src + 2] ?? 0;
    }
    return output;
  }

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    for (const texture of this.positionTextures) {
      if (texture) gl.deleteTexture(texture);
    }
    for (const texture of this.velocityTextures) {
      if (texture) gl.deleteTexture(texture);
    }
    if (this.outputPositionTexture) gl.deleteTexture(this.outputPositionTexture);
    if (this.activeIdsTexture) gl.deleteTexture(this.activeIdsTexture);
    if (this.activeMaskTexture) gl.deleteTexture(this.activeMaskTexture);
    if (this.neighborStartsTexture) gl.deleteTexture(this.neighborStartsTexture);
    if (this.neighborCountsTexture) gl.deleteTexture(this.neighborCountsTexture);
    if (this.neighborsTexture) gl.deleteTexture(this.neighborsTexture);
    for (const target of this._reductionTargets) {
      if (target.texture) gl.deleteTexture(target.texture);
      if (target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
    }
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.readbackFramebuffer) gl.deleteFramebuffer(this.readbackFramebuffer);
    if (this.fullscreenVao) gl.deleteVertexArray(this.fullscreenVao);
    if (this.computeProgram) gl.deleteProgram(this.computeProgram);
    if (this.reductionInitProgram) gl.deleteProgram(this.reductionInitProgram);
    if (this.reductionCombineProgram) gl.deleteProgram(this.reductionCombineProgram);
    if (this.recenterProgram) gl.deleteProgram(this.recenterProgram);

    this.positionTextures = [null, null];
    this.velocityTextures = [null, null];
    this.outputPositionTexture = null;
    this.activeIdsTexture = null;
    this.activeMaskTexture = null;
    this.neighborStartsTexture = null;
    this.neighborCountsTexture = null;
    this.neighborsTexture = null;
    this.framebuffer = null;
    this.readbackFramebuffer = null;
    this.fullscreenVao = null;
    this.textureVersion = 0;
    this._textureSizes.clear();
  }
}

class WebGLForceComputeBackend {
  constructor(gl) {
    this.gl = gl;
    this._gpu = canUseWebGLTextureCompute(gl) ? new WebGLTextureComputePath(gl) : null;
    this.nodeCapacity = 0;
    this.activeCount = 0;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.sampleFrame = 0;

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
    if (this._gpu) {
      this._gpu.seed = this.seed >>> 0;
      this._gpu.sampleFrame = this.sampleFrame >>> 0;
      const synchronized = this._gpu.syncTopology(payload, options);
      this.seed = this._gpu.seed >>> 0;
      this.sampleFrame = this._gpu.sampleFrame >>> 0;
      this.nodeCapacity = this._gpu.nodeCapacity | 0;
      this.activeCount = this._gpu.activeCount | 0;
      this.textureWidth = this._gpu.nodeLayout?.width ?? 1;
      this.textureHeight = this._gpu.nodeLayout?.height ?? 1;
      this.textureVersion = this._gpu.textureVersion ?? this.textureVersion;
      return synchronized;
    }
    if (!payload || !this.gl) return false;
    const preserveDynamicState = options?.preserveDynamicState === true;
    const previousNodeCapacity = this.nodeCapacity;
    this.nodeCapacity = Math.max(0, payload.nodeCapacity | 0);
    this.activeCount = Math.max(0, payload.activeCount | 0);
    this.activeIds = payload.activeIds instanceof Uint32Array ? payload.activeIds : createEmptyUintArray();
    this.activeMask = payload.activeMask instanceof Uint32Array ? payload.activeMask : createEmptyUintArray();
    this.neighborStarts = payload.neighborStarts instanceof Uint32Array ? payload.neighborStarts : createEmptyUintArray();
    this.neighborCounts = payload.neighborCounts instanceof Uint32Array ? payload.neighborCounts : createEmptyUintArray();
    this.neighbors = payload.neighbors instanceof Uint32Array ? payload.neighbors : createEmptyUintArray();

    const valueCount = Math.max(1, payload.valueCount | 0);
    const canPreserveDynamicState = preserveDynamicState
      && previousNodeCapacity === this.nodeCapacity
      && this.positions instanceof Float32Array
      && this.outputPositions instanceof Float32Array
      && this.velocities instanceof Float32Array
      && this.positions.length >= valueCount
      && this.outputPositions.length >= valueCount
      && this.velocities.length >= valueCount;
    if (!canPreserveDynamicState) {
      this.positions = ensureFloat32Capacity(this.positions, valueCount);
      this.outputPositions = ensureFloat32Capacity(this.outputPositions, valueCount);
      this.velocities = ensureFloat32Capacity(this.velocities, valueCount);
      copyFloat32Values(this.positions, payload.packedPositions, valueCount);
      copyFloat32Values(this.outputPositions, payload.packedOutputPositions ?? payload.packedPositions, valueCount);
      this.velocities.fill(0, 0, valueCount);
      this.sampleFrame = 0;
    }
    this.scratchPositions = ensureFloat32Capacity(this.scratchPositions, valueCount);
    this.scratchVelocities = ensureFloat32Capacity(this.scratchVelocities, valueCount);
    return this._uploadOutputTexture();
  }

  step(stepOptions = {}) {
    if (this._gpu) {
      this._gpu.seed = this.seed >>> 0;
      this._gpu.sampleFrame = this.sampleFrame >>> 0;
      const advanced = this._gpu.step(stepOptions);
      this.seed = this._gpu.seed >>> 0;
      this.sampleFrame = this._gpu.sampleFrame >>> 0;
      this.nodeCapacity = this._gpu.nodeCapacity | 0;
      this.activeCount = this._gpu.activeCount | 0;
      this.textureWidth = this._gpu.nodeLayout?.width ?? 1;
      this.textureHeight = this._gpu.nodeLayout?.height ?? 1;
      this.textureVersion = this._gpu.textureVersion ?? this.textureVersion;
      return advanced;
    }
    if (!this.gl || this.nodeCapacity <= 0 || this.activeCount <= 0) return false;

    const is3D = stepOptions.mode === '3d';
    const center = normalizeCenter(stepOptions.center);
    const sampleCount = Math.max(1, Math.floor(toFinite(stepOptions.sampleCount, DEFAULT_OPTIONS.sampleCount2D)));
    const sampleChurnCount = resolveSampleChurnCount(sampleCount, stepOptions.sampleChurn);
    const exactRepulsionThreshold = Math.max(1, Math.floor(toFinite(
      stepOptions.exactRepulsionThreshold,
      is3D ? DEFAULT_OPTIONS.exactRepulsionThreshold3D : DEFAULT_OPTIONS.exactRepulsionThreshold2D,
    )));
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

    const useExactRepulsion = this.activeCount <= Math.max(sampleCount, exactRepulsionThreshold);
    const repulsionIterations = useExactRepulsion ? this.activeCount : sampleCount;
    const repulsionNormalization = useExactRepulsion
      ? 1
      : Math.max(1, this.activeCount / Math.max(1, sampleCount));
    this.seed = this.seed >>> 0;
    const sampleFrame = this.sampleFrame >>> 0;

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

      if (this.activeCount > 1 && repulsionIterations > 0) {
        for (let s = 0; s < repulsionIterations; s += 1) {
          const otherId = useExactRepulsion
            ? activeIds[s]
            : sampleActiveIdProgressive(
              nodeId,
              s,
              activeIds,
              this.activeCount,
              this.seed,
              sampleCount,
              sampleChurnCount,
              sampleFrame,
            );
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

    if (stepOptions.recenter === true) {
      recenterActivePositions(this.positions, this.activeIds, this.activeCount, center, is3D);
    }

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

    const uploaded = this._uploadOutputTexture();
    if (uploaded) {
      this.sampleFrame = (sampleFrame + 1) >>> 0;
    }
    return uploaded;
  }

  getPositionTexture() {
    if (this._gpu) {
      return this._gpu.getPositionTexture();
    }
    return this.outputPositionTexture ?? null;
  }

  getPositionTextureMeta() {
    if (this._gpu) {
      return this._gpu.getPositionTextureMeta();
    }
    return {
      version: this.textureVersion,
      count: this.nodeCapacity,
      buffer: this.outputPositionTexture,
      byteOffset: 0,
      byteLength: 0,
    };
  }

  readPositionSnapshot() {
    if (this._gpu) {
      return this._gpu.readPositionSnapshot();
    }
    if (!this.outputPositions || this.nodeCapacity <= 0) return null;
    const length = Math.max(1, this.nodeCapacity) * 3;
    return new Float32Array(this.outputPositions.subarray(0, length));
  }

  getExecutionMode() {
    if (this._gpu) return this._gpu.getExecutionMode();
    return 'cpu';
  }

  dispose() {
    this._gpu?.dispose?.();
    this._gpu = null;
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
    this.sampleFrame = 0;
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
    this.recenterPipeline = null;
    this.recenterBindGroupLayout = null;
    this.recenterBindGroup = null;
    this.paramsBuffer = null;
    this.outputScaleParamsBuffer = null;
    this.recenterParamsBuffer = null;
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
    this.sampleFrame = 0;
    this.zeroVelocities = createEmptyFloatArray();
    this.maxComputeWorkgroupsPerDimension = Math.max(
      1,
      Math.floor(device?.limits?.maxComputeWorkgroupsPerDimension ?? 65535),
    );

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
    this._ensureRecenterPipeline();
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

  _ensureRecenterPipeline() {
    if (!this.device || this.recenterPipeline) return;
    this.recenterBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
        { binding: 1, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: this.shaderVisibility, buffer: { type: 'uniform' } },
      ],
    });
    const module = this.device.createShaderModule({ code: RECENTER_WGSL });
    this.recenterPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.recenterBindGroupLayout] }),
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

  _rebuildRecenterBindGroup() {
    if (!this.recenterBindGroupLayout) return;
    if (!this.positionBuffer || !this.activeIdsBuffer || !this.recenterParamsBuffer) return;
    this.recenterBindGroup = this.device.createBindGroup({
      layout: this.recenterBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.positionBuffer } },
        { binding: 1, resource: { buffer: this.activeIdsBuffer } },
        { binding: 2, resource: { buffer: this.recenterParamsBuffer } },
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
    this._ensureBuffer('recenterParamsBuffer', 64, this.uniformUsage, 'layout:gpu-force:recenter-params');

    const queue = this.device.queue;
    const canPreserveDynamicState = preserveDynamicState
      && previousNodeCapacity === this.nodeCapacity
      && this.positionBuffer
      && this.outputPositionBuffer
      && this.velocityBuffer
      && this.scratchPositionBuffer
      && this.scratchVelocityBuffer;
    if (!canPreserveDynamicState) {
      const positionBytes = Math.max(4, Math.min(packedPositions.byteLength, Math.max(1, this.nodeCapacity) * 12));
      queue.writeBuffer(this.positionBuffer, 0, packedPositions.buffer, packedPositions.byteOffset, positionBytes);
      queue.writeBuffer(
        this.outputPositionBuffer,
        0,
        (packedOutputPositions ?? packedPositions).buffer,
        (packedOutputPositions ?? packedPositions).byteOffset,
        positionBytes,
      );
      queue.writeBuffer(this.scratchPositionBuffer, 0, packedPositions.buffer, packedPositions.byteOffset, positionBytes);

      this.zeroVelocities = ensureFloat32Capacity(this.zeroVelocities, Math.max(1, this.nodeCapacity) * 3);
      this.zeroVelocities.fill(0, 0, Math.max(1, this.nodeCapacity) * 3);
      const zeroBytes = Math.max(4, Math.min(this.zeroVelocities.byteLength, Math.max(1, this.nodeCapacity) * 12));
      queue.writeBuffer(this.velocityBuffer, 0, this.zeroVelocities.buffer, this.zeroVelocities.byteOffset, zeroBytes);
      queue.writeBuffer(this.scratchVelocityBuffer, 0, this.zeroVelocities.buffer, this.zeroVelocities.byteOffset, zeroBytes);
      this.sampleFrame = 0;
    }

    if (activeCount > 0) {
      queue.writeBuffer(this.activeIdsBuffer, 0, activeIds.buffer, activeIds.byteOffset, activeCount * 4);
    }
    if (this.nodeCapacity > 0) {
      const nodeU32BytesUsed = this.nodeCapacity * 4;
      queue.writeBuffer(this.activeMaskBuffer, 0, activeMask.buffer, activeMask.byteOffset, nodeU32BytesUsed);
      queue.writeBuffer(this.neighborStartsBuffer, 0, neighborStarts.buffer, neighborStarts.byteOffset, nodeU32BytesUsed);
      queue.writeBuffer(this.neighborCountsBuffer, 0, neighborCounts.buffer, neighborCounts.byteOffset, nodeU32BytesUsed);
    }
    if (payload.neighborLength > 0) {
      queue.writeBuffer(this.neighborsBuffer, 0, neighbors.buffer, neighbors.byteOffset, payload.neighborLength * 4);
    }

    this._rebuildBindGroup();
    this._rebuildOutputScaleBindGroup();
    this._rebuildRecenterBindGroup();
    return true;
  }

  step(stepOptions = {}) {
    if (!this.device || !this.pipeline || !this.bindGroup) return false;
    if (this.nodeCapacity <= 0 || this.activeCount <= 0) return false;
    if (!this.outputPositionBuffer) return false;

    const sampleCount = Math.max(1, Math.floor(toFinite(stepOptions.sampleCount, 64)));
    const sampleChurnCount = resolveSampleChurnCount(sampleCount, stepOptions.sampleChurn);
    const exactRepulsionThreshold = Math.max(1, Math.floor(toFinite(
      stepOptions.exactRepulsionThreshold,
      stepOptions.mode === '3d'
        ? DEFAULT_OPTIONS.exactRepulsionThreshold3D
        : DEFAULT_OPTIONS.exactRepulsionThreshold2D,
    )));
    const maxNeighborsPerNode = Math.max(1, Math.floor(toFinite(stepOptions.maxNeighborsPerNode, 64)));
    // Keep sampled repulsion neighborhoods stable by default, while allowing
    // optional progressive churn to refresh only part of the sample set.
    this.seed = this.seed >>> 0;
    const sampleFrame = this.sampleFrame >>> 0;

    const dispatchShape = resolveComputeDispatchShape(
      this.nodeCapacity,
      WORKGROUP_SIZE,
      this.maxComputeWorkgroupsPerDimension,
    );
    const paramsBuffer = new ArrayBuffer(24 * 4);
    const paramsU32 = new Uint32Array(paramsBuffer);
    const paramsF32 = new Float32Array(paramsBuffer);

    paramsU32[0] = this.activeCount >>> 0;
    paramsU32[1] = this.nodeCapacity >>> 0;
    paramsU32[2] = sampleCount >>> 0;
    paramsU32[3] = maxNeighborsPerNode >>> 0;

    paramsU32[4] = stepOptions.mode === '3d' ? 1 : 0;
    paramsU32[5] = sampleChurnCount >>> 0;
    paramsU32[6] = this.seed >>> 0;
    paramsU32[7] = exactRepulsionThreshold >>> 0;

    paramsU32[8] = dispatchShape.rowStride >>> 0;
    paramsU32[9] = dispatchShape.layerStride >>> 0;
    paramsU32[10] = sampleFrame >>> 0;

    paramsF32[12] = toFinite(stepOptions.kRepulsion, DEFAULT_OPTIONS.kRepulsion);
    paramsF32[13] = toFinite(stepOptions.kAttraction, DEFAULT_OPTIONS.kAttraction);
    paramsF32[14] = toFinite(stepOptions.kGravity, DEFAULT_OPTIONS.kGravity);
    paramsF32[15] = toFinite(stepOptions.eta, DEFAULT_OPTIONS.eta);

    paramsF32[16] = clamp(stepOptions.damping, 0, 1, DEFAULT_OPTIONS.damping);
    paramsF32[17] = Math.max(0.001, toFinite(stepOptions.maxStep, DEFAULT_OPTIONS.maxStep));
    paramsF32[18] = Math.max(0.0001, toFinite(stepOptions.minDistance, DEFAULT_OPTIONS.minDistance));
    paramsF32[19] = Math.max(0.0001, toFinite(stepOptions.linkDistance, DEFAULT_OPTIONS.linkDistance));

    const center = normalizeCenter(stepOptions.center);
    paramsF32[20] = center[0];
    paramsF32[21] = center[1];
    paramsF32[22] = center[2];
    paramsF32[23] = Math.max(0.001, toFinite(stepOptions.dt, 1 / 60));

    const outputScale = Math.max(0.0001, toFinite(stepOptions.outputScale, DEFAULT_OPTIONS.outputScale));

    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsBuffer);

    const encoder = this.device.createCommandEncoder({ label: 'layout:gpu-force:step' });
    const pass = encoder.beginComputePass({ label: 'layout:gpu-force:compute' });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.dispatchWorkgroups(dispatchShape.x, dispatchShape.y, dispatchShape.z);
    pass.end();

    const bytes = Math.max(1, this.nodeCapacity) * 12;
    encoder.copyBufferToBuffer(this.scratchPositionBuffer, 0, this.positionBuffer, 0, bytes);
    encoder.copyBufferToBuffer(this.scratchVelocityBuffer, 0, this.velocityBuffer, 0, bytes);

    if (stepOptions.recenter === true) {
      this._ensureRecenterPipeline();
      this._rebuildRecenterBindGroup();
      if (!this.recenterPipeline || !this.recenterBindGroup || !this.recenterParamsBuffer) {
        return false;
      }
      const recenterParamsBuffer = new ArrayBuffer(8 * 4);
      const recenterParamsU32 = new Uint32Array(recenterParamsBuffer);
      const recenterParamsF32 = new Float32Array(recenterParamsBuffer);
      recenterParamsU32[0] = this.activeCount >>> 0;
      recenterParamsU32[1] = stepOptions.mode === '3d' ? 1 : 0;
      recenterParamsF32[4] = center[0];
      recenterParamsF32[5] = center[1];
      recenterParamsF32[6] = center[2];
      this.device.queue.writeBuffer(this.recenterParamsBuffer, 0, recenterParamsBuffer);

      const recenterPass = encoder.beginComputePass({ label: 'layout:gpu-force:recenter' });
      recenterPass.setPipeline(this.recenterPipeline);
      recenterPass.setBindGroup(0, this.recenterBindGroup);
      recenterPass.dispatchWorkgroups(1);
      recenterPass.end();
    }

    if (Math.abs(outputScale - 1.0) <= 1e-6) {
      encoder.copyBufferToBuffer(this.positionBuffer, 0, this.outputPositionBuffer, 0, bytes);
    } else {
      this._ensureOutputScalePipeline();
      this._rebuildOutputScaleBindGroup();
      if (!this.outputScalePipeline || !this.outputScaleBindGroup || !this.outputScaleParamsBuffer) {
        return false;
      }
      const scaleParamsBuffer = new ArrayBuffer(16 * 4);
      const scaleParamsU32 = new Uint32Array(scaleParamsBuffer);
      const scaleParamsF32 = new Float32Array(scaleParamsBuffer);
      scaleParamsU32[0] = this.nodeCapacity >>> 0;
      scaleParamsU32[1] = stepOptions.mode === '3d' ? 1 : 0;
      scaleParamsU32[4] = dispatchShape.rowStride >>> 0;
      scaleParamsU32[5] = dispatchShape.layerStride >>> 0;
      scaleParamsF32[8] = center[0];
      scaleParamsF32[9] = center[1];
      scaleParamsF32[10] = center[2];
      scaleParamsF32[12] = outputScale;
      this.device.queue.writeBuffer(this.outputScaleParamsBuffer, 0, scaleParamsBuffer);

      const outputScalePass = encoder.beginComputePass({ label: 'layout:gpu-force:output-scale' });
      outputScalePass.setPipeline(this.outputScalePipeline);
      outputScalePass.setBindGroup(0, this.outputScaleBindGroup);
      outputScalePass.dispatchWorkgroups(dispatchShape.x, dispatchShape.y, dispatchShape.z);
      outputScalePass.end();
    }

    this.device.queue.submit([encoder.finish()]);
    this.sampleFrame = (sampleFrame + 1) >>> 0;
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
    this.recenterParamsBuffer?.destroy?.();

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
    this.recenterParamsBuffer = null;
    this.bindGroup = null;
    this.outputScaleBindGroup = null;
    this.recenterBindGroup = null;
    this.pipeline = null;
    this.outputScalePipeline = null;
    this.recenterPipeline = null;
    this.bindGroupLayout = null;
    this.outputScaleBindGroupLayout = null;
    this.recenterBindGroupLayout = null;
    this.nodeCapacity = 0;
    this.activeCount = 0;
    this.sampleFrame = 0;
    this.zeroVelocities = createEmptyFloatArray();
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
    this.debug = options.debug ?? options.helios?.debug ?? null;
    this._backendType = null;
    this._backendDeviceRef = null;
    this._backendGlRef = null;
    this._webgpu = null;
    this._webgl = null;
    this._activeCount = 0;
    this._nodeCapacity = 0;
    this._topologyScratch = {
      activeIds: createEmptyUintArray(),
      activeMask: createEmptyUintArray(),
      neighborStarts: createEmptyUintArray(),
      neighborCounts: createEmptyUintArray(),
      neighbors: createEmptyUintArray(),
      cursor: createEmptyUintArray(),
      packedPositions: createEmptyFloatArray(),
      packedOutputPositions: createEmptyFloatArray(),
    };
    this._sampleDebugFrameInterval = 30;
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
    this._topologyScratch = {
      activeIds: createEmptyUintArray(),
      activeMask: createEmptyUintArray(),
      neighborStarts: createEmptyUintArray(),
      neighborCounts: createEmptyUintArray(),
      neighbors: createEmptyUintArray(),
      cursor: createEmptyUintArray(),
      packedPositions: createEmptyFloatArray(),
      packedOutputPositions: createEmptyFloatArray(),
    };
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
    const materializePayload = () => {
      // Access attribute buffers before taking WASM-backed topology views so
      // hidden metadata allocation cannot stale a previously captured edgesView.
      topologyInputs.positionView = network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
      topologyInputs.edgesView = network?.edgesView instanceof Uint32Array ? network.edgesView : createEmptyUintArray();
      payload = buildTopologyPayload(topologyInputs, this.options, this._topologyScratch);
    };
    if (typeof network.withBufferAccess === 'function') {
      network.withBufferAccess(materializePayload);
    } else {
      materializePayload();
    }
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

    const explicitSampleCountValue = this.options.sampleCount;
    const explicitSampleCount = explicitSampleCountValue == null || explicitSampleCountValue === ''
      ? NaN
      : Number(explicitSampleCountValue);
    const sampleCount = Number.isFinite(explicitSampleCount)
      ? Math.max(1, Math.floor(explicitSampleCount))
      : (this.options.mode === '3d'
        ? Math.max(1, Math.floor(toFinite(this.options.sampleCount3D, DEFAULT_OPTIONS.sampleCount3D)))
        : Math.max(1, Math.floor(toFinite(this.options.sampleCount2D, DEFAULT_OPTIONS.sampleCount2D))));
    const exactRepulsionThreshold = Math.max(
      1,
      Math.floor(
        toFinite(
          this.options.mode === '3d'
            ? this.options.exactRepulsionThreshold3D
            : this.options.exactRepulsionThreshold2D,
          this.options.mode === '3d'
            ? DEFAULT_OPTIONS.exactRepulsionThreshold3D
            : DEFAULT_OPTIONS.exactRepulsionThreshold2D,
        ),
      ),
    );
    const exactDecisionCount = Math.max(sampleCount, exactRepulsionThreshold);
    const exactRepulsionScale = this._activeCount > 1 && this._activeCount <= exactDecisionCount
      ? Math.sqrt(this._activeCount / Math.max(1, exactDecisionCount))
      : 1;

    const stepPayload = {
      mode: this.options.mode,
      center: this.options.center,
      recenter: this.options.recenter === true,
      sampleCount,
      sampleChurn: clamp(this.options.sampleChurn, 0, 1, DEFAULT_OPTIONS.sampleChurn),
      exactRepulsionThreshold,
      maxNeighborsPerNode: Math.max(1, Math.floor(toFinite(this.options.maxNeighborsPerNode, DEFAULT_OPTIONS.maxNeighborsPerNode))),
      outputScale: Math.max(0.0001, toFinite(this.options.outputScale, DEFAULT_OPTIONS.outputScale)),
      linkDistance: Math.max(0.0001, toFinite(this.options.linkDistance, DEFAULT_OPTIONS.linkDistance)),
      kRepulsion: toFinite(this.options.kRepulsion, DEFAULT_OPTIONS.kRepulsion) * this.alpha * exactRepulsionScale,
      kAttraction: toFinite(this.options.kAttraction, DEFAULT_OPTIONS.kAttraction) * this.alpha,
      kGravity: toFinite(this.options.kGravity, DEFAULT_OPTIONS.kGravity) * this.alpha,
      eta: toFinite(this.options.eta, DEFAULT_OPTIONS.eta) * dtScale,
      damping: clamp(this.options.damping, 0, 1, DEFAULT_OPTIONS.damping),
      maxStep: Math.max(0.001, toFinite(this.options.maxStep, DEFAULT_OPTIONS.maxStep) * dtScale),
      minDistance: Math.max(0.0001, toFinite(this.options.minDistance, DEFAULT_OPTIONS.minDistance)),
      alpha: this.alpha,
      dt,
    };
    this._logSamplingTrace(stepPayload);
    const changed = this._webgpu
      ? this._webgpu.step(stepPayload)
      : this._webgl.step(stepPayload);

    if (changed) {
      this.bumpVersion();
    }
    return changed;
  }

  _resolveSampleDebugConfig() {
    const source = globalThis?.__HELIOS_LAYOUT_SAMPLE_DEBUG__;
    const debugEnabled = typeof this.debug?.enabledFor === 'function' && this.debug.enabledFor('layout-sampling');
    if (!source && !debugEnabled) return null;
    if (source === true) {
      return { every: this._sampleDebugFrameInterval, previewCount: 6 };
    }
    if (source && typeof source === 'object') {
      const enabled = source.enabled !== false;
      if (!enabled && !debugEnabled) return null;
      return {
        every: Math.max(1, Math.floor(Number(source.every) || this._sampleDebugFrameInterval)),
        previewCount: Math.max(1, Math.floor(Number(source.previewCount) || 6)),
      };
    }
    return { every: this._sampleDebugFrameInterval, previewCount: 6 };
  }

  _emitSampleDebug(message, payload) {
    const canUseDebugLogger = typeof this.debug?.log === 'function'
      && (typeof this.debug?.enabledFor !== 'function' || this.debug.enabledFor('layout-sampling'));
    if (canUseDebugLogger) {
      this.debug.log('layout-sampling', message, payload);
      return;
    }
    console.debug('[helios:layout-sampling]', message, payload);
  }

  _logSamplingTrace(stepPayload) {
    const config = this._resolveSampleDebugConfig();
    if (!config) return;
    const backend = this._webgpu ? this._webgpu : this._webgl;
    if (!backend) return;
    const sampleFrame = backend.sampleFrame >>> 0;
    if ((sampleFrame % config.every) !== 0) return;
    const sampleCount = Math.max(1, Math.floor(Number(stepPayload.sampleCount) || 0));
    const sampleChurnCount = resolveSampleChurnCount(sampleCount, stepPayload.sampleChurn);
    const exactThreshold = Math.max(1, Math.floor(Number(stepPayload.exactRepulsionThreshold) || 0));
    const useExactRepulsion = this._activeCount <= Math.max(sampleCount, exactThreshold);
    const activeIds = this._topologyScratch.activeIds instanceof Uint32Array
      ? this._topologyScratch.activeIds
      : createEmptyUintArray();
    const previewCount = Math.min(config.previewCount, sampleCount);
    const samplePreview = [];
    for (let iter = 0; iter < previewCount; iter += 1) {
      samplePreview.push({
        slot: iter,
        epoch: resolveSampleEpoch(iter, sampleCount, sampleChurnCount, sampleFrame),
        activeId: activeIds.length > 0
          ? sampleActiveIdProgressive(
            0,
            iter,
            activeIds,
            this._activeCount,
            backend.seed >>> 0,
            sampleCount,
            sampleChurnCount,
            sampleFrame,
          )
          : null,
      });
    }
    this._emitSampleDebug('GPU force sampling', {
      backend: this._webgpu ? 'webgpu' : 'webgl',
      mode: stepPayload.mode,
      activeCount: this._activeCount,
      sampleCount,
      sampleChurn: stepPayload.sampleChurn,
      sampleChurnCount,
      sampleFrame,
      changedSlotCount: countChangedSampleSlots(sampleCount, sampleChurnCount, sampleFrame),
      useExactRepulsion,
      exactRepulsionThreshold: exactThreshold,
      samplePreview,
    });
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
