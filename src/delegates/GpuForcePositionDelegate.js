import { NODE_POSITION_ATTRIBUTE } from '../pipeline/constants.js';
import { PositionDelegate } from './PositionDelegate.js';

const WORKGROUP_SIZE = 64;
const STORAGE_FLAG = 0x80;
const COPY_SRC_FLAG = 0x04;
const COPY_DST_FLAG = 0x08;
const UNIFORM_FLAG = 0x40;
const MAP_READ_FLAG = 0x01;
const PARTIAL_CENTROID_CPU_THRESHOLD = 256;

const DEFAULT_OPTIONS = {
  mode: '2d',
  forceModel: 'linear',
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
  kRepulsion: 1,
  kAttraction: 0.62,
  kGravity: 0.001,
  edgeWeightAttribute: null,
  nodeMassAttribute: null,
  forceNormalizationType: 'local-degree',
  umapA: 1.5769434601962196,
  umapB: 0.8950608779914887,
  umapGamma: 1,
  umapNeighborCount: 15,
  umapNegativeSampleRate: 5,
  umapEpochs: null,
  eta: 0.4,
  damping: 0.82,
  maxStep: 2.5,
  minDistance: 0.15,
  alpha: 1,
  alphaDecay: 0.005,
  alphaTarget: 0,
  alphaMin: 0.001,
  recenter: true,
  rotationDamping: 0.6,
  resetAlphaOnTopologyChange: true,
  seed: 0,
  umapHasInitialPositions: false,
};

const DEFAULT_UMAP_EPOCHS_SMALL = 500;
const DEFAULT_UMAP_EPOCHS_LARGE = 200;
const DEFAULT_UMAP_SAMPLE_CHURN = 0.01;
const DEFAULT_UMAP_ALPHA_DECAY = 0.0025;

function buildComputeWgsl({ umap = false, scalar = false, normalized = false } = {}) {
  return /* wgsl */ `
struct Params {
  counts : vec4<u32>,
  flags : vec4<u32>,
  dispatch : vec4<u32>,
  constantsA : vec4<f32>,
  constantsB : vec4<f32>,
  center : vec4<f32>,
  constantsC : vec4<f32>,
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
${umap
  ? '@group(0) @binding(9) var<storage, read> scalarWeights : array<f32>;\n@group(0) @binding(10) var<uniform> params : Params;'
  : scalar
    ? '@group(0) @binding(9) var<storage, read> neighborEdges : array<u32>;\n@group(0) @binding(10) var<storage, read> scalarValues : array<f32>;\n@group(0) @binding(11) var<uniform> params : Params;'
    : '@group(0) @binding(9) var<uniform> params : Params;'}

fn hash32(value : u32) -> u32 {
  var x = value;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

fn clipGradient(value : f32) -> f32 {
  return clamp(value, -4.0, 4.0);
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

fn sampleNeighborIndex(start : u32, limit : u32, nodeId : u32, iter : u32, seed : u32, sampleFrame : u32) -> u32 {
  if (limit == 0u) {
    return start;
  }
  let mixed = hash32(seed + nodeId * 2246822519u + iter * 3266489917u + sampleFrame * 668265263u);
  return start + (mixed % limit);
}

fn samplesDue(epoch : f32, interval : f32) -> u32 {
  if (!(interval > 0.0)) {
    return 0u;
  }
  let previousEpoch = max(0.0, epoch - 1.0);
  let previousBucket = floor(previousEpoch / interval);
  let currentBucket = floor(epoch / interval);
  return u32(max(0.0, currentBucket - previousBucket));
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
  let scalarFlags = params.dispatch.w;
  let normalizationMode = scalarFlags & 255u;
  let hasEdgeWeights = (scalarFlags & 256u) != 0u;

  var pos = loadPosition(nodeId);
  var vel = loadVelocity(nodeId);
  if (use3D == 0u) {
    pos.z = params.center.z;
    vel.z = 0.0;
  }

  var force = vec3<f32>(0.0, 0.0, 0.0);
  let minDist = max(1e-5, params.constantsB.z);
  let minDistSq = minDist * minDist;
${umap
  ? `  let umapA = max(1e-6, params.constantsC.x);
  let umapB = max(1e-6, params.constantsC.y);
  let umapGamma = max(0.0, params.constantsC.z);
  let umapNegativeSampleRate = max(0.0, params.constantsC.w);
  let umapEpochs = max(1.0, params.constantsB.w);
  let minEdgeWeight = 1.0 / umapEpochs;
  let currentEpoch = f32(sampleFrame + 1u);`
  : ''}

${umap
  ? ''
  : `  if (activeCount > 1u) {
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
  }`}
  let start = neighborStarts[nodeId];
  let degree = neighborCounts[nodeId];
  let limit = min(degree, maxNeighbors);
  if (limit > 0u) {
${umap
  ? `  var n : u32 = 0u;
    loop {
      if (n >= limit) {
        break;
      }
      let edgeIndex = start + n;
      let otherId = neighbors[edgeIndex];
      if (otherId != nodeId) {
        let edgeWeight = max(0.0, scalarWeights[nodeCapacity + edgeIndex]);
        if (edgeWeight >= minEdgeWeight) {
          let positiveInterval = 1.0 / max(edgeWeight, 1e-6);
          let positiveDue = samplesDue(currentEpoch, positiveInterval);
          if (positiveDue > 0u) {
            var delta = loadPosition(otherId) - pos;
            if (use3D == 0u) {
              delta.z = 0.0;
            }
            let distSq = max(dot(delta, delta), minDistSq);
            let springScale = params.constantsA.y
              * f32(positiveDue)
              * (2.0 * umapA * umapB * pow(distSq, umapB - 1.0))
              / (1.0 + (umapA * pow(distSq, umapB)));
            force = force + delta * springScale;
          }

          if (umapNegativeSampleRate > 0.0 && activeCount > 1u) {
            let negativeInterval = positiveInterval / umapNegativeSampleRate;
            let negativeDue = samplesDue(currentEpoch, negativeInterval);
            var p : u32 = 0u;
            loop {
              if (p >= negativeDue) {
                break;
              }
              let negativeIter = edgeIndex + p * maxNeighbors;
              let negativeId = sampleActiveId(nodeId, negativeIter, activeCount, seed + sampleFrame * 668265263u);
              if (negativeId != nodeId) {
                var negativeDelta = pos - loadPosition(negativeId);
                if (use3D == 0u) {
                  negativeDelta.z = 0.0;
                }
                let negativeDistSq = max(dot(negativeDelta, negativeDelta), minDistSq);
                let repulsionScale = params.constantsA.x
                  * (2.0 * umapGamma * umapB)
                  / ((0.001 + negativeDistSq) * (1.0 + (umapA * pow(negativeDistSq, umapB))));
                force = force + negativeDelta * repulsionScale;
              }
              p = p + 1u;
            }
          }
        }
      }
      n = n + 1u;
    }`
  : `    var n : u32 = 0u;
    loop {
      if (n >= limit) {
        break;
      }
      let neighborIndex = start + n;
      let otherId = neighbors[neighborIndex];
      if (otherId != nodeId) {
        var delta = loadPosition(otherId) - pos;
        if (use3D == 0u) {
          delta.z = 0.0;
        }
        let distSq = max(dot(delta, delta), minDistSq);
        let dist = sqrt(distSq);
        let invDist = 1.0 / dist;
${scalar
    ? `        let edgeId = neighborEdges[neighborIndex];
        let edgeWeight = select(
          1.0,
          max(0.0, scalarValues[nodeCapacity + edgeId]),
          hasEdgeWeights,
        );
        let otherDegree = neighborCounts[otherId];
        let endpointDegreeNorm = max(1.0, f32(min(degree, otherDegree)));
        let endpointStrengthNorm = max(1.0, min(
          max(0.0, scalarValues[nodeId]),
          max(0.0, scalarValues[otherId]),
        ));
        let degreeNorm = select(
          max(1.0, f32(limit)),
          endpointDegreeNorm,
          normalizationMode == 1u,
        );
        let strengthOrDegreeNorm = select(
          degreeNorm,
          endpointStrengthNorm,
          normalizationMode == 2u,
        );
        let finalNorm = select(
          strengthOrDegreeNorm,
          1.0,
          normalizationMode == 3u,
        );`
    : normalized
      ? `        let otherDegree = neighborCounts[otherId];
        let endpointDegreeNorm = max(1.0, f32(min(degree, otherDegree)));
        let localDegreeNorm = max(1.0, f32(limit));
        let degreeNorm = select(
          localDegreeNorm,
          endpointDegreeNorm,
          normalizationMode == 1u,
        );
        let finalNorm = select(
          degreeNorm,
          1.0,
          normalizationMode == 3u,
        );
        let edgeWeight = 1.0;`
      : `        let finalNorm = max(1.0, f32(limit));
        let edgeWeight = 1.0;`}
        let stretch = dist - params.constantsB.w;
        let springScale = (params.constantsA.y * edgeWeight * stretch * invDist) / finalNorm;
        force = force + delta * springScale;
      }
      n = n + 1u;
    }`}
  }

  var gravityDelta = params.center.xyz - pos;
  if (use3D == 0u) {
    gravityDelta.z = 0.0;
  }
  force = force + gravityDelta * params.constantsA.z;

${umap
  ? `  let eta = params.constantsA.w;
  var nextDelta = vec3<f32>(
    clipGradient(force.x) * eta,
    clipGradient(force.y) * eta,
    clipGradient(force.z) * eta,
  );
  let speed = length(nextDelta);
  let maxStep = max(1e-5, params.constantsB.y);
  if (speed > maxStep) {
    nextDelta = nextDelta * (maxStep / speed);
  }
  if (use3D == 0u) {
    nextDelta.z = 0.0;
  }

  var nextVel = nextDelta;
  var nextPos = pos + nextDelta;
  if (use3D == 0u) {
    nextPos.z = params.center.z;
  }`
  : `  let eta = params.constantsA.w;
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
  }`}

  storePosition(nodeId, nextPos);
  storeVelocity(nodeId, nextVel);
}
`;
}

function buildCentroidReductionWgsl() {
  return /* wgsl */ `
struct Params {
  count : u32,
  nodeCapacity : u32,
  _pad0 : u32,
  _pad1 : u32,
};

@group(0) @binding(0) var<storage, read> positions : array<f32>;
@group(0) @binding(1) var<storage, read> nodeIds : array<u32>;
@group(0) @binding(2) var<storage, read_write> partialSums : array<vec4<f32>>;
@group(0) @binding(3) var<uniform> params : Params;

var<workgroup> localX : array<f32, ${PARTIAL_CENTROID_CPU_THRESHOLD}>;
var<workgroup> localY : array<f32, ${PARTIAL_CENTROID_CPU_THRESHOLD}>;
var<workgroup> localZ : array<f32, ${PARTIAL_CENTROID_CPU_THRESHOLD}>;
var<workgroup> localCount : array<f32, ${PARTIAL_CENTROID_CPU_THRESHOLD}>;

@compute @workgroup_size(${PARTIAL_CENTROID_CPU_THRESHOLD})
fn main(
  @builtin(global_invocation_id) globalId : vec3<u32>,
  @builtin(local_invocation_id) localId : vec3<u32>,
  @builtin(workgroup_id) workgroupId : vec3<u32>
) {
  let localIndex = localId.x;
  let index = globalId.x;
  var x = 0.0;
  var y = 0.0;
  var z = 0.0;
  var c = 0.0;
  if (index < params.count) {
    let nodeId = nodeIds[index];
    if (nodeId < params.nodeCapacity) {
      let base = nodeId * 3u;
      x = positions[base + 0u];
      y = positions[base + 1u];
      z = positions[base + 2u];
      c = 1.0;
    }
  }
  localX[localIndex] = x;
  localY[localIndex] = y;
  localZ[localIndex] = z;
  localCount[localIndex] = c;
  workgroupBarrier();

  var stride = ${PARTIAL_CENTROID_CPU_THRESHOLD / 2}u;
  loop {
    if (stride == 0u) {
      break;
    }
    if (localIndex < stride) {
      localX[localIndex] = localX[localIndex] + localX[localIndex + stride];
      localY[localIndex] = localY[localIndex] + localY[localIndex + stride];
      localZ[localIndex] = localZ[localIndex] + localZ[localIndex + stride];
      localCount[localIndex] = localCount[localIndex] + localCount[localIndex + stride];
    }
    workgroupBarrier();
    stride = stride / 2u;
  }

  if (localIndex == 0u) {
    partialSums[workgroupId.x] = vec4<f32>(localX[0], localY[0], localZ[0], localCount[0]);
  }
}
`;
}

const COMPUTE_WGSL_LINEAR = buildComputeWgsl();
const COMPUTE_WGSL_LINEAR_NORMALIZED = buildComputeWgsl({ normalized: true });
const COMPUTE_WGSL_LINEAR_SCALAR = buildComputeWgsl({ scalar: true });
const COMPUTE_WGSL_UMAP = buildComputeWgsl({ umap: true });

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

const RECENTER_WGSL_BASE = /* wgsl */ `
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

const RECENTER_WGSL_ROTATION = /* wgsl */ `
struct RecenterParams {
  counts : vec4<u32>,
  center : vec4<f32>,
  rotation : vec4<f32>,
};

@group(0) @binding(0) var<storage, read_write> positions : array<f32>;
@group(0) @binding(1) var<storage, read_write> velocities : array<f32>;
@group(0) @binding(2) var<storage, read> activeIds : array<u32>;
@group(0) @binding(3) var<uniform> params : RecenterParams;

var<workgroup> partialX : array<f32, ${WORKGROUP_SIZE}>;
var<workgroup> partialY : array<f32, ${WORKGROUP_SIZE}>;
var<workgroup> partialZ : array<f32, ${WORKGROUP_SIZE}>;
var<workgroup> partialTorqueX : array<f32, ${WORKGROUP_SIZE}>;
var<workgroup> partialTorqueY : array<f32, ${WORKGROUP_SIZE}>;
var<workgroup> partialTorqueZ : array<f32, ${WORKGROUP_SIZE}>;
var<workgroup> partialRadiusSq : array<f32, ${WORKGROUP_SIZE}>;

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
  var torqueX = 0.0;
  var torqueY = 0.0;
  var torqueZ = 0.0;
  var radiusSq = 0.0;
  index = tid;
  loop {
    if (index >= activeCount) {
      break;
    }
    let nodeId = activeIds[index];
    let base = nodeId * 3u;
    var pos = vec3<f32>(
      positions[base + 0u] - shiftX,
      positions[base + 1u] - shiftY,
      positions[base + 2u] - shiftZ,
    );
    var vel = vec3<f32>(
      velocities[base + 0u],
      velocities[base + 1u],
      velocities[base + 2u],
    );
    if (params.counts.y == 0u) {
      pos.z = params.center.z;
      vel.z = 0.0;
    }
    let r = pos - params.center.xyz;
    let torque = cross(r, vel);
    torqueX = torqueX + torque.x;
    torqueY = torqueY + torque.y;
    torqueZ = torqueZ + torque.z;
    radiusSq = radiusSq + dot(r, r);
    index = index + ${WORKGROUP_SIZE}u;
  }

  partialTorqueX[tid] = torqueX;
  partialTorqueY[tid] = torqueY;
  partialTorqueZ[tid] = torqueZ;
  partialRadiusSq[tid] = radiusSq;
  workgroupBarrier();

  stride = ${WORKGROUP_SIZE / 2}u;
  loop {
    if (stride == 0u) {
      break;
    }
    if (tid < stride) {
      partialTorqueX[tid] = partialTorqueX[tid] + partialTorqueX[tid + stride];
      partialTorqueY[tid] = partialTorqueY[tid] + partialTorqueY[tid + stride];
      partialTorqueZ[tid] = partialTorqueZ[tid] + partialTorqueZ[tid + stride];
      partialRadiusSq[tid] = partialRadiusSq[tid] + partialRadiusSq[tid + stride];
    }
    workgroupBarrier();
    stride = stride >> 1u;
  }

  if (tid == 0u) {
    let invRadiusSq = select(0.0, 1.0 / partialRadiusSq[0], partialRadiusSq[0] > 1e-6);
    partialTorqueX[0] = partialTorqueX[0] * invRadiusSq;
    partialTorqueY[0] = partialTorqueY[0] * invRadiusSq;
    partialTorqueZ[0] = partialTorqueZ[0] * invRadiusSq;
  }
  workgroupBarrier();

  let omega = vec3<f32>(partialTorqueX[0], partialTorqueY[0], partialTorqueZ[0]);
  let rotationDamping = clamp(params.rotation.x, 0.0, 1.0);
  index = tid;
  loop {
    if (index >= activeCount) {
      break;
    }
    let nodeId = activeIds[index];
    let base = nodeId * 3u;
    var pos = vec3<f32>(
      positions[base + 0u] - shiftX,
      positions[base + 1u] - shiftY,
      positions[base + 2u] - shiftZ,
    );
    var vel = vec3<f32>(
      velocities[base + 0u],
      velocities[base + 1u],
      velocities[base + 2u],
    );
    let r = pos - params.center.xyz;
    let correction = cross(omega, r) * rotationDamping;
    pos = pos - correction;
    vel = vel - correction;
    positions[base + 0u] = pos.x;
    positions[base + 1u] = pos.y;
    if (params.counts.y != 0u) {
      positions[base + 2u] = pos.z;
      velocities[base + 0u] = vel.x;
      velocities[base + 1u] = vel.y;
      velocities[base + 2u] = vel.z;
    } else {
      positions[base + 2u] = params.center.z;
      velocities[base + 0u] = vel.x;
      velocities[base + 1u] = vel.y;
      velocities[base + 2u] = 0.0;
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

function isUmapForceModel(value) {
  return String(value ?? '').trim().toLowerCase() === 'umap';
}

function normalizeForceNormalizationType(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'degree' || normalized === 'endpoint-degree') return 'degree';
  if (normalized === 'strength' || normalized === 'weighted-strength') return 'strength';
  if (normalized === 'none' || normalized === 'off' || normalized === 'disabled') return 'none';
  return 'local-degree';
}

function forceNormalizationMode(value) {
  const normalized = normalizeForceNormalizationType(value);
  if (normalized === 'degree') return 1;
  if (normalized === 'strength') return 2;
  if (normalized === 'none') return 3;
  return 0;
}

function normalizeAttributeName(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
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

function normalizeReadbackNodeIds(nodeIds) {
  if (nodeIds == null) return createEmptyUintArray();
  if (typeof nodeIds === 'number') {
    const numeric = Math.floor(nodeIds);
    return Number.isFinite(numeric) && numeric >= 0 ? new Uint32Array([numeric]) : createEmptyUintArray();
  }
  const values = [];
  const push = (value) => {
    const numeric = Math.floor(Number(value));
    values.push(Number.isFinite(numeric) && numeric >= 0 ? numeric >>> 0 : 0xffffffff);
  };
  if (Array.isArray(nodeIds) || ArrayBuffer.isView(nodeIds)) {
    for (let i = 0; i < nodeIds.length; i += 1) push(nodeIds[i]);
  } else if (typeof nodeIds?.[Symbol.iterator] === 'function') {
    for (const value of nodeIds) push(value);
  }
  return values.length ? Uint32Array.from(values) : createEmptyUintArray();
}

function resolveReadbackOut(out, length) {
  if (out instanceof Float32Array && out.length >= length) return out;
  return new Float32Array(Math.max(0, length));
}

function copyPositionsFromFullSnapshot(snapshot, ids, out = null) {
  const count = ids?.length ?? 0;
  const positions = resolveReadbackOut(out, count * 3);
  positions.fill(0, 0, count * 3);
  if (!snapshot || !Number.isFinite(snapshot.length)) return positions;
  for (let i = 0; i < count; i += 1) {
    const id = ids[i];
    const src = id * 3;
    const dst = i * 3;
    if (id === 0xffffffff || src + 2 >= snapshot.length) continue;
    positions[dst] = snapshot[src] ?? 0;
    positions[dst + 1] = snapshot[src + 1] ?? 0;
    positions[dst + 2] = snapshot[src + 2] ?? 0;
  }
  return positions;
}

function centroidFromPackedPositions(positions, count, out = null) {
  const centroid = resolveReadbackOut(out, 3);
  centroid[0] = 0;
  centroid[1] = 0;
  centroid[2] = 0;
  const safeCount = Math.max(0, Math.min(Math.floor(Number(count) || 0), Math.floor((positions?.length ?? 0) / 3)));
  if (safeCount <= 0) return { centroid, count: 0 };
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  let found = 0;
  for (let i = 0; i < safeCount; i += 1) {
    const offset = i * 3;
    const x = positions[offset];
    const y = positions[offset + 1];
    const z = positions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    sumX += x;
    sumY += y;
    sumZ += z;
    found += 1;
  }
  if (found > 0) {
    centroid[0] = sumX / found;
    centroid[1] = sumY / found;
    centroid[2] = sumZ / found;
  }
  return { centroid, count: found };
}

function readScalarViewValue(view, index, fallback = 0) {
  if (!view || index == null || index < 0) return fallback;
  const value = Number(view[index]);
  return Number.isFinite(value) ? value : fallback;
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
  } catch (error) {
    return fallback;
  }
}

const SAFE_READ_WARNED_KEYS = new Set();

function safeReadWithWarning(fn, fallback, warningKey, warningMessage) {
  try {
    const value = fn();
    return value ?? fallback;
  } catch (error) {
    if (warningKey && !SAFE_READ_WARNED_KEYS.has(warningKey)) {
      SAFE_READ_WARNED_KEYS.add(warningKey);
      console.warn(warningMessage, error);
    }
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
  const snapshot = safeReadWithWarning(
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
    'gpu-force:snapshot-topology-inputs',
    'GpuForcePositionDelegate: failed to snapshot active node/edge indices. Falling back to empty topology inputs.',
  );
  const nodeIndices = snapshot.nodeIndices;
  const edgeIndices = snapshot.edgeIndices;
  const nodeCapacityRaw = Number(safeReadWithWarning(
    () => network?.nodeCapacity,
    0,
    'gpu-force:node-capacity',
    'GpuForcePositionDelegate: failed to read network.nodeCapacity. Falling back to 0.',
  ));
  const nodeCapacity = Number.isFinite(nodeCapacityRaw) && nodeCapacityRaw > 0
    ? Math.floor(nodeCapacityRaw)
    : 0;
  const inferredCapacity = Math.max(0, Math.floor(nodeIndices.length));
  const edgeCapacityRaw = Number(safeReadWithWarning(
    () => network?.edgeCapacity,
    0,
    'gpu-force:edge-capacity',
    'GpuForcePositionDelegate: failed to read network.edgeCapacity. Falling back to active edge count.',
  ));
  const edgeCapacity = Number.isFinite(edgeCapacityRaw) && edgeCapacityRaw > 0
    ? Math.floor(edgeCapacityRaw)
    : Math.max(0, Math.floor(edgeIndices.length));
  return {
    nodeCapacity: Math.max(nodeCapacity, inferredCapacity),
    edgeCapacity,
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
    edgeCapacity = 0,
    positionView = null,
    edgeWeightView = null,
    nodeMassView = null,
    nodeStrengthView = null,
  } = topologyInputs ?? {};
  const umapModel = isUmapForceModel(options.forceModel);
  const forceNormalizationType = normalizeForceNormalizationType(options.forceNormalizationType);
  const useLinearScalarInputs = !umapModel && (
    Boolean(normalizeAttributeName(options.edgeWeightAttribute))
    || forceNormalizationType === 'strength'
  );
  const useExplicitInitialPositions = !umapModel
    || options.umapHasInitialPositions === true
    || options.forceInitialPositions === true;
  const edgeWeightAttribute = normalizeAttributeName(options.edgeWeightAttribute);
  const nodeMassAttribute = normalizeAttributeName(options.nodeMassAttribute);

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
  let nodeMass = createEmptyFloatArray();
  let maxUmapEdgeWeight = 0;
  if (umapModel) {
    nodeMass = ensureFloat32Capacity(scratch.nodeMass, nodeCapacity);
    scratch.nodeMass = nodeMass;
    nodeMass.fill(0, 0, nodeCapacity);
  } else {
    scratch.nodeMass = createEmptyFloatArray();
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
    const weight = umapModel
      ? readScalarViewValue(edgeWeightView, edgeId, 0)
      : 1;
    if (!(weight > 0)) continue;
    if (umapModel && weight > maxUmapEdgeWeight) {
      maxUmapEdgeWeight = weight;
    }
  }

  const umapEpochs = umapModel
    ? resolveUmapEpochCount(options.umapEpochs, activeCount)
    : 0;
  const minUmapEdgeWeight = umapModel && maxUmapEdgeWeight > 0
    ? (maxUmapEdgeWeight / Math.max(1, umapEpochs))
    : 0;

  for (let i = 0; i < edgeIndices.length; i += 1) {
    const edgeId = edgeIndices[i] >>> 0;
    const base = edgeId * 2;
    if (base + 1 >= edgesView.length) continue;
    const source = edgesView[base] >>> 0;
    const target = edgesView[base + 1] >>> 0;
    if (source >= nodeCapacity || target >= nodeCapacity) continue;
    if (!activeMask[source] || !activeMask[target]) continue;
    if (source === target) continue;
    const weight = umapModel
      ? readScalarViewValue(edgeWeightView, edgeId, 0)
      : 1;
    if (!(weight > 0)) continue;
    if (umapModel && weight < minUmapEdgeWeight) continue;
    neighborCounts[source] += 1;
    neighborCounts[target] += 1;
    if (umapModel && !nodeMassAttribute) {
      nodeMass[source] += weight;
      nodeMass[target] += weight;
    }
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
  const neighborEdges = useLinearScalarInputs
    ? ensureUint32Capacity(scratch.neighborEdges, neighborLength)
    : createEmptyUintArray();
  scratch.neighborEdges = neighborEdges;
  let neighborWeights = createEmptyFloatArray();
  if (umapModel) {
    neighborWeights = ensureFloat32Capacity(scratch.neighborWeights, neighborLength);
    scratch.neighborWeights = neighborWeights;
  } else {
    scratch.neighborWeights = createEmptyFloatArray();
  }
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
    const weight = umapModel
      ? readScalarViewValue(edgeWeightView, edgeId, 0)
      : 1;
    if (!(weight > 0)) continue;
    if (umapModel && weight < minUmapEdgeWeight) continue;
    const sourceCursor = cursor[source]++;
    const targetCursor = cursor[target]++;
    neighbors[sourceCursor] = target;
    neighbors[targetCursor] = source;
    if (useLinearScalarInputs) {
      neighborEdges[sourceCursor] = edgeId;
      neighborEdges[targetCursor] = edgeId;
    }
    if (umapModel) {
      const normalizedWeight = maxUmapEdgeWeight > 0 ? (weight / maxUmapEdgeWeight) : 0;
      neighborWeights[sourceCursor] = normalizedWeight;
      neighborWeights[targetCursor] = normalizedWeight;
    }
  }

  if (umapModel && nodeMassAttribute) {
    for (let nodeId = 0; nodeId < nodeCapacity; nodeId += 1) {
      nodeMass[nodeId] = Math.max(0, readScalarViewValue(nodeMassView, nodeId, 0));
    }
  } else if (!umapModel) {
    nodeMass.fill(1, 0, nodeCapacity);
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
    const x = useExplicitInitialPositions ? positionView?.[sourceOffset] : undefined;
    const y = useExplicitInitialPositions ? positionView?.[sourceOffset + 1] : undefined;
    const z = useExplicitInitialPositions ? positionView?.[sourceOffset + 2] : undefined;
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

  if (umapModel && options.umapHasInitialPositions !== true && options.forceInitialPositions !== true) {
    const warmScratch = scratch.umapWarmStart ?? {};
    scratch.umapWarmStart = warmScratch;
    if (warmStartUmapPositionsFromTopology({
      nodeCapacity,
      activeIds,
      activeCount,
      neighborStarts,
      neighborCounts,
      neighbors,
      neighborWeights,
      positions: packedOutputPositions,
      center,
      radius,
      depth,
      mode: options.mode,
      scratch: warmScratch,
    })) {
      for (let nodeId = 0; nodeId < nodeCapacity; nodeId += 1) {
        const offset = nodeId * 3;
        const seedX = packedOutputPositions[offset];
        const seedY = packedOutputPositions[offset + 1];
        const seedZ = packedOutputPositions[offset + 2];
        if (normalizeInputByOutputScale) {
          packedPositions[offset] = center[0] + ((seedX - center[0]) / outputScale);
          packedPositions[offset + 1] = center[1] + ((seedY - center[1]) / outputScale);
          packedPositions[offset + 2] = is3D
            ? (center[2] + ((seedZ - center[2]) / outputScale))
            : center[2];
        } else {
          packedPositions[offset] = seedX;
          packedPositions[offset + 1] = seedY;
          packedPositions[offset + 2] = is3D ? seedZ : center[2];
        }
      }
    }
  }

  return {
    umapModel,
    nodeCapacity,
    activeCount,
    activeIds,
    activeMask,
    neighborStarts,
    neighborCounts,
    neighbors,
    neighborEdges,
    neighborWeights,
    nodeMass,
    nodeStrength: ArrayBuffer.isView(nodeStrengthView) ? nodeStrengthView : createEmptyFloatArray(),
    edgeWeightValues: ArrayBuffer.isView(edgeWeightView) ? edgeWeightView : createEmptyFloatArray(),
    edgeCapacity: Math.max(0, Math.floor(Number(edgeCapacity) || 0)),
    forceNormalizationType,
    linearScalarInputs: useLinearScalarInputs,
    linearNormalizedInputs: !umapModel && !useLinearScalarInputs && forceNormalizationType !== 'local-degree',
    linearHasEdgeWeights: !umapModel && Boolean(edgeWeightAttribute),
    packedPositions,
    packedOutputPositions,
    neighborLength,
    umapEpochs,
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

function hashToSignedUnit(value) {
  return ((((hash32(value >>> 0) + 0.5) / 4294967296) * 2) - 1);
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

function resolveUmapSampleCount(negativeSampleRate, neighborCount, maxNeighborsPerNode) {
  const safeNegativeRate = Math.max(0, Number(negativeSampleRate) || 0);
  const positiveSampleCount = Math.max(
    1,
    Math.min(
      Math.max(1, Math.floor(Number(maxNeighborsPerNode) || 0)),
      Math.max(1, Math.floor(Number(neighborCount) || 0)),
    ),
  );
  return Math.max(1, Math.round(safeNegativeRate * positiveSampleCount));
}

export function resolveUmapEpochCount(value, nodeCount = 0) {
  const explicit = Number(value);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.floor(explicit));
  }
  const safeNodeCount = Math.max(0, Math.floor(Number(nodeCount) || 0));
  return safeNodeCount > 10000 ? DEFAULT_UMAP_EPOCHS_LARGE : DEFAULT_UMAP_EPOCHS_SMALL;
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

export function warmStartUmapPositionsFromTopology({
  nodeCapacity = 0,
  activeIds = createEmptyUintArray(),
  activeCount = 0,
  neighborStarts = createEmptyUintArray(),
  neighborCounts = createEmptyUintArray(),
  neighbors = createEmptyUintArray(),
  neighborWeights = null,
  positions = null,
  center = [0, 0, 0],
  radius = DEFAULT_OPTIONS.radius,
  depth = DEFAULT_OPTIONS.depth,
  mode = '2d',
  scratch = {},
} = {}) {
  if (!(positions instanceof Float32Array) || activeCount <= 1 || nodeCapacity <= 1) {
    return false;
  }

  const is3D = mode === '3d';
  const signalX = ensureFloat32Capacity(scratch.signalX, nodeCapacity);
  const signalY = ensureFloat32Capacity(scratch.signalY, nodeCapacity);
  const nextX = ensureFloat32Capacity(scratch.nextX, nodeCapacity);
  const nextY = ensureFloat32Capacity(scratch.nextY, nodeCapacity);
  scratch.signalX = signalX;
  scratch.signalY = signalY;
  scratch.nextX = nextX;
  scratch.nextY = nextY;

  let signalZ = null;
  let nextZ = null;
  if (is3D) {
    signalZ = ensureFloat32Capacity(scratch.signalZ, nodeCapacity);
    nextZ = ensureFloat32Capacity(scratch.nextZ, nodeCapacity);
    scratch.signalZ = signalZ;
    scratch.nextZ = nextZ;
  }

  for (let i = 0; i < activeCount; i += 1) {
    const nodeId = activeIds[i] >>> 0;
    signalX[nodeId] = hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 2654435761));
    signalY[nodeId] = hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 1597334677));
    if (is3D && signalZ) {
      signalZ[nodeId] = hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 2246822519));
    }
  }

  const passes = Math.max(4, Math.min(8, Math.ceil(Math.log2(Math.max(2, activeCount)))));
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 0; i < activeCount; i += 1) {
      const nodeId = activeIds[i] >>> 0;
      const start = neighborStarts[nodeId] ?? 0;
      const degree = neighborCounts[nodeId] ?? 0;
      if (degree <= 0) {
        nextX[nodeId] = signalX[nodeId];
        nextY[nodeId] = signalY[nodeId];
        if (is3D && nextZ && signalZ) nextZ[nodeId] = signalZ[nodeId];
        continue;
      }

      let sumWeight = 0;
      let sumX = 0;
      let sumY = 0;
      let sumZ = 0;
      for (let n = 0; n < degree; n += 1) {
        const offset = start + n;
        const otherId = neighbors[offset] >>> 0;
        if (otherId >= nodeCapacity) continue;
        const weight = neighborWeights instanceof Float32Array
          ? Math.max(0, neighborWeights[offset] ?? 0)
          : 1;
        if (!(weight > 0)) continue;
        sumWeight += weight;
        sumX += signalX[otherId] * weight;
        sumY += signalY[otherId] * weight;
        if (is3D && signalZ) sumZ += signalZ[otherId] * weight;
      }

      if (!(sumWeight > 0)) {
        nextX[nodeId] = signalX[nodeId];
        nextY[nodeId] = signalY[nodeId];
        if (is3D && nextZ && signalZ) nextZ[nodeId] = signalZ[nodeId];
        continue;
      }

      nextX[nodeId] = (signalX[nodeId] * 0.3) + ((sumX / sumWeight) * 0.7);
      nextY[nodeId] = (signalY[nodeId] * 0.3) + ((sumY / sumWeight) * 0.7);
      if (is3D && nextZ && signalZ) {
        nextZ[nodeId] = (signalZ[nodeId] * 0.3) + ((sumZ / sumWeight) * 0.7);
      }
    }

    for (let i = 0; i < activeCount; i += 1) {
      const nodeId = activeIds[i] >>> 0;
      signalX[nodeId] = nextX[nodeId];
      signalY[nodeId] = nextY[nodeId];
      if (is3D && signalZ && nextZ) signalZ[nodeId] = nextZ[nodeId];
    }
  }

  let meanX = 0;
  let meanY = 0;
  let meanZ = 0;
  for (let i = 0; i < activeCount; i += 1) {
    const nodeId = activeIds[i] >>> 0;
    meanX += signalX[nodeId];
    meanY += signalY[nodeId];
    if (is3D && signalZ) meanZ += signalZ[nodeId];
  }
  meanX /= activeCount;
  meanY /= activeCount;
  if (is3D) meanZ /= activeCount;

  let maxPlanarNorm = 0;
  let maxDepthNorm = 0;
  for (let i = 0; i < activeCount; i += 1) {
    const nodeId = activeIds[i] >>> 0;
    const centeredX = (signalX[nodeId] - meanX) + (hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 3266489917)) * 0.08);
    const centeredY = (signalY[nodeId] - meanY) + (hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 668265263)) * 0.08);
    maxPlanarNorm = Math.max(maxPlanarNorm, Math.hypot(centeredX, centeredY));
    if (is3D && signalZ) {
      const centeredZ = (signalZ[nodeId] - meanZ) + (hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 374761393)) * 0.08);
      maxDepthNorm = Math.max(maxDepthNorm, Math.abs(centeredZ));
    }
  }

  if (!(maxPlanarNorm > 1e-6)) {
    return false;
  }

  const planarScale = (Math.max(1, radius) * 0.42) / maxPlanarNorm;
  const depthScale = is3D
    ? ((Math.max(1, depth || (radius * 0.35)) * 0.42) / Math.max(1e-6, maxDepthNorm || 1))
    : 0;

  for (let i = 0; i < activeCount; i += 1) {
    const nodeId = activeIds[i] >>> 0;
    const base = nodeId * 3;
    const currentX = positions[base] - center[0];
    const currentY = positions[base + 1] - center[1];
    const currentZ = positions[base + 2] - center[2];
    const warmX = ((signalX[nodeId] - meanX) + (hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 3266489917)) * 0.08)) * planarScale;
    const warmY = ((signalY[nodeId] - meanY) + (hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 668265263)) * 0.08)) * planarScale;
    const warmZ = is3D && signalZ
      ? (((signalZ[nodeId] - meanZ) + (hashToSignedUnit(Math.imul((nodeId + 1) >>> 0, 374761393)) * 0.08)) * depthScale)
      : 0;

    positions[base] = center[0] + (warmX * 0.85) + (currentX * 0.15);
    positions[base + 1] = center[1] + (warmY * 0.85) + (currentY * 0.15);
    positions[base + 2] = is3D
      ? (center[2] + (warmZ * 0.85) + (currentZ * 0.15))
      : center[2];
  }

  recenterActivePositions(positions, activeIds, activeCount, center, is3D);
  return true;
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

function buildWebglComputeFragment({ umap = false, scalar = false, normalized = false } = {}) {
  return `#version 300 es
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
${umap ? 'uniform sampler2D u_nodeMass;\nuniform sampler2D u_neighborWeights;\n' : ''}
${scalar ? 'uniform usampler2D u_neighborEdges;\nuniform sampler2D u_scalarValues;\n' : ''}

uniform ivec2 u_nodeTexSize;
uniform ivec2 u_activeIdsTexSize;
uniform ivec2 u_neighborTexSize;
${scalar ? 'uniform ivec2 u_scalarTexSize;\n' : ''}

uniform int u_nodeCapacity;
uniform int u_activeCount;
uniform int u_sampleCount;
uniform int u_maxNeighbors;
uniform int u_use3D;
uniform int u_exactRepulsionThreshold;
uniform int u_sampleChurnCount;
uniform int u_forceNormalizationMode;
uniform int u_hasEdgeWeights;

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
${umap ? 'uniform float u_umapA;\nuniform float u_umapB;\nuniform float u_umapGamma;\nuniform float u_umapNegativeSampleRate;\nuniform float u_umapEpochs;\n' : ''}

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

float clipGradient(float value) {
  return clamp(value, -4.0, 4.0);
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

int sampleNeighborIndex(int start, int limit, int nodeId, int iter, uint seed, uint sampleFrame) {
  if (limit <= 0) {
    return start;
  }
  uint mixed = hash32(seed + uint(nodeId) * 2246822519u + uint(iter) * 3266489917u + sampleFrame * 668265263u);
  return start + int(mixed % uint(limit));
}

int samplesDue(float epoch, float interval) {
  if (!(interval > 0.0)) {
    return 0;
  }
  float previousEpoch = max(0.0, epoch - 1.0);
  float previousBucket = floor(previousEpoch / interval);
  float currentBucket = floor(epoch / interval);
  return int(max(0.0, currentBucket - previousBucket));
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

${scalar ? `uint fetchNeighborEdge(int index) {
  return texelFetch(u_neighborEdges, textureCoord(u_neighborTexSize, index), 0).x;
}

float fetchScalarNode(int nodeId) {
  return texelFetch(u_scalarValues, textureCoord(u_nodeTexSize, nodeId), 0).x;
}

float fetchScalarEdge(int edgeId) {
  int offset = u_nodeCapacity + edgeId;
  return texelFetch(u_scalarValues, textureCoord(u_scalarTexSize, offset), 0).x;
}

` : ''}
${umap ? `float fetchNodeMass(int nodeId) {
  return texelFetch(u_nodeMass, textureCoord(u_nodeTexSize, nodeId), 0).x;
}

float fetchNeighborWeight(int index) {
  return texelFetch(u_neighborWeights, textureCoord(u_neighborTexSize, index), 0).x;
}

` : ''}void main() {
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
${umap ? `  float umapA = max(0.000001, u_umapA);
  float umapB = max(0.000001, u_umapB);
  float umapGamma = max(0.0, u_umapGamma);
  float umapNegativeSampleRate = max(0.0, u_umapNegativeSampleRate);
  float umapEpochs = max(1.0, u_umapEpochs);
  float minEdgeWeight = 1.0 / umapEpochs;
  float currentEpoch = float(u_sampleFrame + 1u);
` : ''}

${umap
  ? ''
  : `  if (u_activeCount > 1) {
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
        float repulsionScale = (u_kRepulsion * repulsionNormalization * invDist * invDist * invDist);
        force += delta * repulsionScale;
      }
      s += 1;
    }
  }`}
  int start = int(fetchNodeUint(u_neighborStarts, nodeId));
  int degree = int(fetchNodeUint(u_neighborCounts, nodeId));
  int limit = min(degree, u_maxNeighbors);
  if (limit > 0) {
${umap
  ? `  int n = 0;
    while (n < limit) {
      int edgeIndex = start + n;
      int otherId = int(fetchNeighborValue(edgeIndex));
      if (otherId != nodeId && otherId >= 0 && otherId < u_nodeCapacity) {
        float edgeWeight = max(0.0, fetchNeighborWeight(edgeIndex));
        if (edgeWeight >= minEdgeWeight) {
          float positiveInterval = 1.0 / max(edgeWeight, 0.000001);
          int positiveDue = samplesDue(currentEpoch, positiveInterval);
          if (positiveDue > 0) {
            vec3 delta = fetchPosition(otherId) - pos;
            if (u_use3D == 0) {
              delta.z = 0.0;
            }
            float distSq = max(dot(delta, delta), minDistSq);
            float springScale = (
              u_kAttraction
              * float(positiveDue)
              * (2.0 * umapA * umapB * pow(distSq, umapB - 1.0))
              / (1.0 + (umapA * pow(distSq, umapB)))
            );
            force += delta * springScale;
          }

          if (umapNegativeSampleRate > 0.0 && u_activeCount > 1) {
            float negativeInterval = positiveInterval / umapNegativeSampleRate;
            int negativeDue = samplesDue(currentEpoch, negativeInterval);
            int p = 0;
            while (p < negativeDue) {
              int negativeIter = edgeIndex + (p * max(u_maxNeighbors, 1));
              int negativeId = int(sampleActiveId(nodeId, negativeIter, u_activeCount, u_seed + (u_sampleFrame * 668265263u)));
              if (negativeId != nodeId && negativeId >= 0 && negativeId < u_nodeCapacity) {
                vec3 negativeDelta = pos - fetchPosition(negativeId);
                if (u_use3D == 0) {
                  negativeDelta.z = 0.0;
                }
                float negativeDistSq = max(dot(negativeDelta, negativeDelta), minDistSq);
                float repulsionScale = (
                  u_kRepulsion
                  * (2.0 * umapGamma * umapB)
                  / ((0.001 + negativeDistSq) * (1.0 + (umapA * pow(negativeDistSq, umapB))))
                );
                force += negativeDelta * repulsionScale;
              }
              p += 1;
            }
          }
        }
      }
      n += 1;
    }`
  : `    int n = 0;
    while (n < limit) {
      int neighborIndex = start + n;
      int otherId = int(fetchNeighborValue(neighborIndex));
      if (otherId != nodeId && otherId >= 0 && otherId < u_nodeCapacity) {
        vec3 delta = fetchPosition(otherId) - pos;
        if (u_use3D == 0) {
          delta.z = 0.0;
        }
        float distSq = max(dot(delta, delta), minDistSq);
        float dist = sqrt(distSq);
        float invDist = 1.0 / max(0.00000001, dist);
        float stretch = dist - u_linkDistance;
${scalar
    ? `        uint edgeId = fetchNeighborEdge(neighborIndex);
        float edgeWeight = u_hasEdgeWeights != 0 ? max(0.0, fetchScalarEdge(int(edgeId))) : 1.0;
        float endpointDegreeNorm = max(1.0, float(min(uint(degree), fetchNodeUint(u_neighborCounts, otherId))));
        float endpointStrengthNorm = max(1.0, min(max(0.0, fetchScalarNode(nodeId)), max(0.0, fetchScalarNode(otherId))));
        float degreeNorm = max(1.0, float(limit));
        if (u_forceNormalizationMode == 1) {
          degreeNorm = endpointDegreeNorm;
        } else if (u_forceNormalizationMode == 2) {
          degreeNorm = endpointStrengthNorm;
        } else if (u_forceNormalizationMode == 3) {
          degreeNorm = 1.0;
        }`
    : normalized
      ? `        float edgeWeight = 1.0;
        float endpointDegreeNorm = max(1.0, float(min(uint(degree), fetchNodeUint(u_neighborCounts, otherId))));
        float degreeNorm = max(1.0, float(limit));
        if (u_forceNormalizationMode == 1) {
          degreeNorm = endpointDegreeNorm;
        } else if (u_forceNormalizationMode == 3) {
          degreeNorm = 1.0;
        }`
      : `        float edgeWeight = 1.0;
        float degreeNorm = max(1.0, float(limit));`}
        float springScale = ((u_kAttraction * edgeWeight * stretch * invDist) / degreeNorm);
        force += delta * springScale;
      }
      n += 1;
    }`}
  }

  vec3 gravityDelta = u_center - pos;
  if (u_use3D == 0) {
    gravityDelta.z = 0.0;
  }
  force += gravityDelta * u_kGravity;

${umap
  ? `  vec3 nextDelta = vec3(
    clipGradient(force.x) * u_eta,
    clipGradient(force.y) * u_eta,
    clipGradient(force.z) * u_eta
  );
  float speed = length(nextDelta);
  if (speed > u_maxStep) {
    nextDelta *= u_maxStep / max(speed, 0.00000001);
  }
  if (u_use3D == 0) {
    nextDelta.z = 0.0;
  }

  vec3 nextVel = nextDelta;
  vec3 nextPos = pos + nextDelta;
  if (u_use3D == 0) {
    nextPos.z = u_center.z;
  }`
  : `  vec3 nextVel = vel * u_damping + force * u_eta;
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
  }`}

  vec3 outputPos = nextPos;
  outputPos.xy = u_center.xy + (nextPos.xy - u_center.xy) * u_outputScale;
  outputPos.z = u_use3D != 0
    ? (u_center.z + (nextPos.z - u_center.z) * u_outputScale)
    : u_center.z;

  outPosition = vec4(nextPos, 1.0);
  outVelocity = vec4(nextVel, 1.0);
  outOutputPosition = vec4(outputPos, 1.0);
}`;
}

const WEBGL_FORCE_COMPUTE_FRAGMENT_LINEAR = buildWebglComputeFragment();
const WEBGL_FORCE_COMPUTE_FRAGMENT_LINEAR_NORMALIZED = buildWebglComputeFragment({ normalized: true });
const WEBGL_FORCE_COMPUTE_FRAGMENT_LINEAR_SCALAR = buildWebglComputeFragment({ scalar: true });
const WEBGL_FORCE_COMPUTE_FRAGMENT_UMAP = buildWebglComputeFragment({ umap: true });

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

const WEBGL_FORCE_ANGULAR_REDUCTION_INIT_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_positions;
uniform sampler2D u_velocities;
uniform sampler2D u_centroid;
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
  vec4 angular = vec4(0.0);
  vec4 centroidData = texelFetch(u_centroid, ivec2(0, 0), 0);
  float count = max(centroidData.w, 1.0);
  vec3 centroidValue = centroidData.xyz / count;
  vec3 shift = centroidValue - u_center;
  if (u_use3D == 0) {
    shift.z = 0.0;
  }

  for (int dy = 0; dy < 2; dy += 1) {
    for (int dx = 0; dx < 2; dx += 1) {
      ivec2 srcCoord = baseCoord + ivec2(dx, dy);
      if (srcCoord.x < u_nodeTexSize.x && srcCoord.y < u_nodeTexSize.y) {
        int nodeId = srcCoord.x + srcCoord.y * max(u_nodeTexSize.x, 1);
        if (nodeId >= 0 && nodeId < u_nodeCapacity) {
          uint activeFlag = texelFetch(u_activeMask, textureCoord(u_nodeTexSize, nodeId), 0).x;
          if (activeFlag != 0u) {
            vec3 pos = texelFetch(u_positions, textureCoord(u_nodeTexSize, nodeId), 0).xyz - shift;
            vec3 vel = texelFetch(u_velocities, textureCoord(u_nodeTexSize, nodeId), 0).xyz;
            if (u_use3D == 0) {
              pos.z = u_center.z;
              vel.z = 0.0;
            }
            vec3 r = pos - u_center;
            angular.xyz += cross(r, vel);
            angular.w += dot(r, r);
          }
        }
      }
    }
  }

  fragColor = angular;
}`;

const WEBGL_FORCE_RECENTER_FRAGMENT_BASE = `#version 300 es
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

const WEBGL_FORCE_RECENTER_FRAGMENT_ROTATION = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform sampler2D u_positions;
uniform sampler2D u_velocities;
uniform sampler2D u_centroid;
uniform sampler2D u_angular;
uniform usampler2D u_activeMask;
uniform ivec2 u_nodeTexSize;
uniform int u_nodeCapacity;
uniform int u_use3D;
uniform vec3 u_center;
uniform float u_outputScale;
uniform float u_rotationDamping;

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
  vec4 angularData = texelFetch(u_angular, ivec2(0, 0), 0);
  float invRadiusSq = angularData.w > 0.000001 ? (1.0 / angularData.w) : 0.0;
  vec3 omega = angularData.xyz * invRadiusSq;
  if (u_use3D == 0) {
    shift.z = 0.0;
  }

  if (texelFetch(u_activeMask, textureCoord(u_nodeTexSize, nodeId), 0).x != 0u) {
    pos -= shift;
    vec3 r = pos - u_center;
    vec3 correction = cross(omega, r) * clamp(u_rotationDamping, 0.0, 1.0);
    pos -= correction;
    vel -= correction;
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
    this.scalarLayout = { width: 1, height: 1 };

    this.positionTextures = [null, null];
    this.velocityTextures = [null, null];
    this.outputPositionTexture = null;
    this.activeIdsTexture = null;
    this.activeMaskTexture = null;
    this.neighborStartsTexture = null;
    this.neighborCountsTexture = null;
    this.neighborsTexture = null;
    this.neighborEdgesTexture = null;
    this.nodeMassTexture = null;
    this.neighborWeightsTexture = null;
    this.scalarValuesTexture = null;
    this.framebuffer = null;
    this.readbackFramebuffer = null;
    this.fullscreenVao = null;
    this._reductionTargets = [
      { texture: null, framebuffer: null, width: 1, height: 1 },
      { texture: null, framebuffer: null, width: 1, height: 1 },
    ];
    this._angularReductionTargets = [
      { texture: null, framebuffer: null, width: 1, height: 1 },
      { texture: null, framebuffer: null, width: 1, height: 1 },
    ];
    this._positionUploadScratch = new Float32Array(0);
    this._velocityUploadScratch = new Float32Array(0);
    this._outputUploadScratch = new Float32Array(0);
    this._nodeMassUploadScratch = new Float32Array(0);
    this._neighborWeightUploadScratch = new Float32Array(0);
    this._scalarValuesUploadScratch = new Float32Array(0);
    this._scalarValuesLinearScratch = new Float32Array(0);
    this._uintUploadScratch = new Uint32Array(0);
    this._readbackScratch = new Float32Array(0);
    this._sparseReadbackScratch = new Float32Array(0);
    this._centroidPositionScratch = new Float32Array(0);
    this._textureSizes = new Map();
    this.readIndex = 0;
    this.umapEnabled = false;
    this.computePrograms = {
      linear: null,
      linearNormalized: null,
      linearScalar: null,
      umap: null,
    };
    this.computeUniforms = {
      linear: null,
      linearNormalized: null,
      linearScalar: null,
      umap: null,
    };
    this.reductionInitProgram = createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_REDUCTION_INIT_FRAGMENT);
    this.reductionCombineProgram = createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_REDUCTION_COMBINE_FRAGMENT);
    this.angularReductionInitProgram = createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_ANGULAR_REDUCTION_INIT_FRAGMENT);
    this.recenterPrograms = {
      base: createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_RECENTER_FRAGMENT_BASE),
      rotation: createWebGLProgram(gl, WEBGL_FORCE_FULLSCREEN_VERTEX, WEBGL_FORCE_RECENTER_FRAGMENT_ROTATION),
    };
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
    this.angularReductionInitUniforms = this._cacheUniforms(this.angularReductionInitProgram, [
      'u_positions',
      'u_velocities',
      'u_centroid',
      'u_activeMask',
      'u_nodeTexSize',
      'u_outputSize',
      'u_nodeCapacity',
      'u_use3D',
      'u_center',
    ]);
    this.recenterUniforms = {
      base: this._cacheUniforms(this.recenterPrograms.base, [
        'u_positions',
        'u_velocities',
        'u_centroid',
        'u_activeMask',
        'u_nodeTexSize',
        'u_nodeCapacity',
        'u_use3D',
        'u_center',
        'u_outputScale',
      ]),
      rotation: this._cacheUniforms(this.recenterPrograms.rotation, [
      'u_positions',
      'u_velocities',
      'u_centroid',
      'u_angular',
      'u_activeMask',
      'u_nodeTexSize',
      'u_nodeCapacity',
      'u_use3D',
      'u_center',
      'u_outputScale',
      'u_rotationDamping',
      ]),
    };

    this.framebuffer = gl.createFramebuffer();
    this.readbackFramebuffer = gl.createFramebuffer();
    this.fullscreenVao = gl.createVertexArray();
    this._ensureComputeProgram(false);
  }

  _cacheUniforms(program, names) {
    const map = Object.create(null);
    for (const name of names) {
      map[name] = this.gl.getUniformLocation(program, name);
    }
    return map;
  }

  _ensureComputeProgram(useUmap = false, useLinearScalar = false, useLinearNormalized = false) {
    const key = useUmap ? 'umap' : useLinearScalar ? 'linearScalar' : useLinearNormalized ? 'linearNormalized' : 'linear';
    if (this.computePrograms[key]) return;
    const program = createWebGLProgram(
      this.gl,
      WEBGL_FORCE_FULLSCREEN_VERTEX,
      useUmap
        ? WEBGL_FORCE_COMPUTE_FRAGMENT_UMAP
        : useLinearScalar
          ? WEBGL_FORCE_COMPUTE_FRAGMENT_LINEAR_SCALAR
          : useLinearNormalized
            ? WEBGL_FORCE_COMPUTE_FRAGMENT_LINEAR_NORMALIZED
            : WEBGL_FORCE_COMPUTE_FRAGMENT_LINEAR,
    );
    const uniformNames = [
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
      ...(useLinearScalar ? ['u_scalarTexSize'] : []),
      'u_nodeCapacity',
      'u_activeCount',
      'u_sampleCount',
      'u_maxNeighbors',
      'u_use3D',
      'u_exactRepulsionThreshold',
      'u_sampleChurnCount',
      'u_forceNormalizationMode',
      'u_hasEdgeWeights',
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
      ...(useUmap ? ['u_nodeMass', 'u_neighborWeights', 'u_umapA', 'u_umapB', 'u_umapGamma', 'u_umapNegativeSampleRate', 'u_umapEpochs'] : []),
      ...(useLinearScalar ? ['u_neighborEdges', 'u_scalarValues'] : []),
    ];
    this.computePrograms[key] = program;
    this.computeUniforms[key] = this._cacheUniforms(program, uniformNames);
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

  _ensureReductionTarget(index, width, height, targets = this._reductionTargets) {
    const gl = this.gl;
    const target = targets[index];
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

  _packScalarSource(source, count, texelCount, field) {
    const target = this._ensurePackedFloatScratch(field, texelCount);
    target.fill(0, 0, texelCount * 4);
    const limit = Math.max(0, Math.min(count, Math.floor(source?.length ?? 0)));
    for (let i = 0; i < limit; i += 1) {
      const dst = i * 4;
      target[dst] = Number(source[i] ?? 0);
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

  _releaseUmapTextures() {
    const gl = this.gl;
    if (!gl) return;
    if (this.nodeMassTexture) gl.deleteTexture(this.nodeMassTexture);
    if (this.neighborWeightsTexture) gl.deleteTexture(this.neighborWeightsTexture);
    this.nodeMassTexture = null;
    this.neighborWeightsTexture = null;
    this._textureSizes.delete('nodeMassTexture');
    this._textureSizes.delete('neighborWeightsTexture');
    this._nodeMassUploadScratch = new Float32Array(0);
    this._neighborWeightUploadScratch = new Float32Array(0);
  }

  _releaseLinearScalarTextures() {
    const gl = this.gl;
    if (!gl) return;
    if (this.neighborEdgesTexture) gl.deleteTexture(this.neighborEdgesTexture);
    if (this.scalarValuesTexture) gl.deleteTexture(this.scalarValuesTexture);
    this.neighborEdgesTexture = null;
    this.scalarValuesTexture = null;
    this._textureSizes.delete('neighborEdgesTexture');
    this._textureSizes.delete('scalarValuesTexture');
    this._scalarValuesUploadScratch = new Float32Array(0);
    this._scalarValuesLinearScratch = new Float32Array(0);
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
    const useUmap = payload.umapModel === true;
    const useLinearScalar = !useUmap && payload.linearScalarInputs === true;
    const useLinearNormalized = !useUmap && !useLinearScalar && payload.linearNormalizedInputs === true;
    this.umapEnabled = useUmap;
    this._ensureComputeProgram(useUmap, useLinearScalar, useLinearNormalized);
    this.nodeCapacity = Math.max(0, payload.nodeCapacity | 0);
    this.activeCount = Math.max(0, payload.activeCount | 0);
    this.nodeLayout = resolveWebGLTextureLayout(this.gl, Math.max(1, this.nodeCapacity));
    this.activeLayout = resolveWebGLTextureLayout(this.gl, Math.max(1, this.activeCount));
    this.neighborLayout = resolveWebGLTextureLayout(this.gl, Math.max(1, payload.neighborLength | 0));
    const scalarValueCount = useLinearScalar
      ? (this.nodeCapacity + Math.max(0, payload.edgeCapacity | 0))
      : 0;
    this.scalarLayout = resolveWebGLTextureLayout(this.gl, Math.max(1, scalarValueCount));

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
    if (useLinearScalar) {
      this._ensureUintTexture('neighborEdgesTexture', this.neighborLayout.width, this.neighborLayout.height);
      this._ensureFloatTexture('scalarValuesTexture', this.scalarLayout.width, this.scalarLayout.height);
      this._uploadUintTexture(this.neighborEdgesTexture, this.neighborLayout, payload.neighborEdges);
      const scalarValues = ensureFloat32Capacity(this._scalarValuesLinearScratch, scalarValueCount);
      this._scalarValuesLinearScratch = scalarValues;
      scalarValues.fill(0, 0, scalarValueCount);
      if (this.nodeCapacity > 0 && ArrayBuffer.isView(payload.nodeStrength)) {
        const nodeLimit = Math.min(this.nodeCapacity, payload.nodeStrength.length);
        for (let i = 0; i < nodeLimit; i += 1) {
          const value = Number(payload.nodeStrength[i]);
          scalarValues[i] = Number.isFinite(value) ? value : 0;
        }
      }
      if (payload.linearHasEdgeWeights && ArrayBuffer.isView(payload.edgeWeightValues)) {
        const edgeLimit = Math.min(Math.max(0, payload.edgeCapacity | 0), payload.edgeWeightValues.length);
        for (let i = 0; i < edgeLimit; i += 1) {
          const value = Number(payload.edgeWeightValues[i]);
          scalarValues[this.nodeCapacity + i] = Number.isFinite(value) ? value : 0;
        }
      }
      const scalarValuesPacked = this._packScalarSource(
        scalarValues,
        scalarValueCount,
        this.scalarLayout.width * this.scalarLayout.height,
        '_scalarValuesUploadScratch',
      );
      this._uploadPackedFloatTexture(
        this.scalarValuesTexture,
        scalarValuesPacked,
        this.scalarLayout.width,
        this.scalarLayout.height,
      );
    } else {
      this._releaseLinearScalarTextures();
    }
    if (useUmap) {
      this._ensureFloatTexture('nodeMassTexture', this.nodeLayout.width, this.nodeLayout.height);
      this._ensureFloatTexture('neighborWeightsTexture', this.neighborLayout.width, this.neighborLayout.height);
      const nodeMassPacked = this._packScalarSource(
        payload.nodeMass,
        this.nodeCapacity,
        this.nodeLayout.width * this.nodeLayout.height,
        '_nodeMassUploadScratch',
      );
      const neighborWeightPacked = this._packScalarSource(
        payload.neighborWeights,
        payload.neighborLength | 0,
        this.neighborLayout.width * this.neighborLayout.height,
        '_neighborWeightUploadScratch',
      );
      this._uploadPackedFloatTexture(this.nodeMassTexture, nodeMassPacked, this.nodeLayout.width, this.nodeLayout.height);
      this._uploadPackedFloatTexture(
        this.neighborWeightsTexture,
        neighborWeightPacked,
        this.neighborLayout.width,
        this.neighborLayout.height,
      );
    } else {
      this._releaseUmapTextures();
    }

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
      const target = this._ensureReductionTarget(targetIndex, targetWidth, targetHeight, this._reductionTargets);
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

  _runAngularReduction(positionTexture, velocityTexture, centroidTexture, is3D, center) {
    const gl = this.gl;
    let sourceTexture = null;
    let sourceWidth = this.nodeLayout.width;
    let sourceHeight = this.nodeLayout.height;
    let sourceIsInitial = true;
    let targetIndex = 0;

    while (sourceWidth > 1 || sourceHeight > 1) {
      const targetWidth = Math.max(1, Math.ceil(sourceWidth / 2));
      const targetHeight = Math.max(1, Math.ceil(sourceHeight / 2));
      const target = this._ensureReductionTarget(targetIndex, targetWidth, targetHeight, this._angularReductionTargets);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, targetWidth, targetHeight);
      gl.useProgram(sourceIsInitial ? this.angularReductionInitProgram : this.reductionCombineProgram);
      gl.bindVertexArray(this.fullscreenVao);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

      if (sourceIsInitial) {
        this._bindTexture(0, positionTexture);
        this._bindTexture(1, velocityTexture);
        this._bindTexture(2, centroidTexture);
        this._bindTexture(3, this.activeMaskTexture);
        gl.uniform1i(this.angularReductionInitUniforms.u_positions, 0);
        gl.uniform1i(this.angularReductionInitUniforms.u_velocities, 1);
        gl.uniform1i(this.angularReductionInitUniforms.u_centroid, 2);
        gl.uniform1i(this.angularReductionInitUniforms.u_activeMask, 3);
        gl.uniform2i(this.angularReductionInitUniforms.u_nodeTexSize, this.nodeLayout.width, this.nodeLayout.height);
        gl.uniform2i(this.angularReductionInitUniforms.u_outputSize, targetWidth, targetHeight);
        gl.uniform1i(this.angularReductionInitUniforms.u_nodeCapacity, this.nodeCapacity);
        gl.uniform1i(this.angularReductionInitUniforms.u_use3D, is3D ? 1 : 0);
        gl.uniform3f(this.angularReductionInitUniforms.u_center, center[0], center[1], center[2]);
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
      const useUmap = isUmapForceModel(stepOptions.forceModel);
      const useLinearScalar = !useUmap && stepOptions.linearScalarInputs === true;
      const useLinearNormalized = !useUmap && !useLinearScalar && stepOptions.linearNormalizedInputs === true;
      this._ensureComputeProgram(useUmap, useLinearScalar, useLinearNormalized);
      const computeKey = useUmap ? 'umap' : useLinearScalar ? 'linearScalar' : useLinearNormalized ? 'linearNormalized' : 'linear';
      const computeProgram = this.computePrograms[computeKey];
      const computeUniforms = this.computeUniforms[computeKey];
      const outputScale = Math.max(0.0001, toFinite(stepOptions.outputScale, DEFAULT_OPTIONS.outputScale));
      const rotationDamping = clamp(stepOptions.rotationDamping, 0, 1, DEFAULT_OPTIONS.rotationDamping);
      const useRotationDamping = rotationDamping > 1e-6;

      this._prepareMainFramebuffer(positionsOut, velocitiesOut, this.outputPositionTexture);
      gl.viewport(0, 0, this.nodeLayout.width, this.nodeLayout.height);
      gl.useProgram(computeProgram);
      this._bindTexture(0, positionsIn);
      this._bindTexture(1, velocitiesIn);
      this._bindTexture(2, this.activeIdsTexture);
      this._bindTexture(3, this.activeMaskTexture);
      this._bindTexture(4, this.neighborStartsTexture);
      this._bindTexture(5, this.neighborCountsTexture);
      this._bindTexture(6, this.neighborsTexture);
      gl.uniform1i(computeUniforms.u_positions, 0);
      gl.uniform1i(computeUniforms.u_velocities, 1);
      gl.uniform1i(computeUniforms.u_activeIds, 2);
      gl.uniform1i(computeUniforms.u_activeMask, 3);
      gl.uniform1i(computeUniforms.u_neighborStarts, 4);
      gl.uniform1i(computeUniforms.u_neighborCounts, 5);
      gl.uniform1i(computeUniforms.u_neighbors, 6);
      if (useUmap) {
        this._bindTexture(7, this.nodeMassTexture);
        this._bindTexture(8, this.neighborWeightsTexture);
        gl.uniform1i(computeUniforms.u_nodeMass, 7);
        gl.uniform1i(computeUniforms.u_neighborWeights, 8);
      } else if (useLinearScalar) {
        this._bindTexture(7, this.neighborEdgesTexture);
        this._bindTexture(8, this.scalarValuesTexture);
        gl.uniform1i(computeUniforms.u_neighborEdges, 7);
        gl.uniform1i(computeUniforms.u_scalarValues, 8);
      }
      gl.uniform2i(computeUniforms.u_nodeTexSize, this.nodeLayout.width, this.nodeLayout.height);
      gl.uniform2i(computeUniforms.u_activeIdsTexSize, this.activeLayout.width, this.activeLayout.height);
      gl.uniform2i(computeUniforms.u_neighborTexSize, this.neighborLayout.width, this.neighborLayout.height);
      if (useLinearScalar) {
        gl.uniform2i(computeUniforms.u_scalarTexSize, this.scalarLayout.width, this.scalarLayout.height);
      }
      gl.uniform1i(computeUniforms.u_nodeCapacity, this.nodeCapacity);
      gl.uniform1i(computeUniforms.u_activeCount, this.activeCount);
      gl.uniform1i(computeUniforms.u_sampleCount, sampleCount);
      gl.uniform1i(computeUniforms.u_maxNeighbors, maxNeighborsPerNode);
      gl.uniform1i(computeUniforms.u_use3D, is3D ? 1 : 0);
      gl.uniform1i(computeUniforms.u_exactRepulsionThreshold, exactRepulsionThreshold);
      gl.uniform1i(computeUniforms.u_sampleChurnCount, sampleChurnCount);
      if (!useUmap) {
        gl.uniform1i(computeUniforms.u_forceNormalizationMode, forceNormalizationMode(stepOptions.forceNormalizationType));
        gl.uniform1i(computeUniforms.u_hasEdgeWeights, stepOptions.hasEdgeWeights ? 1 : 0);
      }
      gl.uniform1ui(computeUniforms.u_seed, this.seed >>> 0);
      gl.uniform1ui(computeUniforms.u_sampleFrame, this.sampleFrame >>> 0);
      gl.uniform3f(computeUniforms.u_center, center[0], center[1], center[2]);
      gl.uniform1f(computeUniforms.u_outputScale, outputScale);
      gl.uniform1f(computeUniforms.u_linkDistance, Math.max(0.0001, toFinite(stepOptions.linkDistance, DEFAULT_OPTIONS.linkDistance)));
      gl.uniform1f(computeUniforms.u_minDistance, Math.max(0.0001, toFinite(stepOptions.minDistance, DEFAULT_OPTIONS.minDistance)));
      gl.uniform1f(computeUniforms.u_kRepulsion, toFinite(stepOptions.kRepulsion, DEFAULT_OPTIONS.kRepulsion));
      gl.uniform1f(computeUniforms.u_kAttraction, toFinite(stepOptions.kAttraction, DEFAULT_OPTIONS.kAttraction));
      gl.uniform1f(computeUniforms.u_kGravity, toFinite(stepOptions.kGravity, DEFAULT_OPTIONS.kGravity));
      gl.uniform1f(computeUniforms.u_eta, toFinite(stepOptions.eta, DEFAULT_OPTIONS.eta));
      gl.uniform1f(computeUniforms.u_damping, clamp(stepOptions.damping, 0, 1, DEFAULT_OPTIONS.damping));
      gl.uniform1f(computeUniforms.u_maxStep, Math.max(0.001, toFinite(stepOptions.maxStep, DEFAULT_OPTIONS.maxStep)));
      if (useUmap) {
        gl.uniform1f(computeUniforms.u_umapA, Math.max(0.000001, toFinite(stepOptions.umapA, DEFAULT_OPTIONS.umapA)));
        gl.uniform1f(computeUniforms.u_umapB, Math.max(0.000001, toFinite(stepOptions.umapB, DEFAULT_OPTIONS.umapB)));
        gl.uniform1f(computeUniforms.u_umapGamma, Math.max(0, toFinite(stepOptions.umapGamma, DEFAULT_OPTIONS.umapGamma)));
        gl.uniform1f(
          computeUniforms.u_umapNegativeSampleRate,
          Math.max(0, toFinite(stepOptions.umapNegativeSampleRate, DEFAULT_OPTIONS.umapNegativeSampleRate)),
        );
        gl.uniform1f(computeUniforms.u_umapEpochs, Math.max(1, toFinite(stepOptions.umapEpochs, DEFAULT_UMAP_EPOCHS_SMALL)));
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (stepOptions.recenter === true) {
        const centroidTexture = this._runReduction(positionsOut, is3D, center);
        const angularTexture = useRotationDamping
          ? this._runAngularReduction(positionsOut, velocitiesOut, centroidTexture, is3D, center)
          : null;
        const recenterProgram = useRotationDamping ? this.recenterPrograms.rotation : this.recenterPrograms.base;
        const recenterUniforms = useRotationDamping ? this.recenterUniforms.rotation : this.recenterUniforms.base;
        this._prepareMainFramebuffer(this.positionTextures[readIndex], this.velocityTextures[readIndex], this.outputPositionTexture);
        gl.viewport(0, 0, this.nodeLayout.width, this.nodeLayout.height);
        gl.useProgram(recenterProgram);
        this._bindTexture(0, positionsOut);
        this._bindTexture(1, velocitiesOut);
        this._bindTexture(2, centroidTexture);
        if (useRotationDamping) {
          this._bindTexture(3, angularTexture);
          this._bindTexture(4, this.activeMaskTexture);
        } else {
          this._bindTexture(3, this.activeMaskTexture);
        }
        gl.uniform1i(recenterUniforms.u_positions, 0);
        gl.uniform1i(recenterUniforms.u_velocities, 1);
        gl.uniform1i(recenterUniforms.u_centroid, 2);
        if (useRotationDamping) {
          gl.uniform1i(recenterUniforms.u_angular, 3);
          gl.uniform1i(recenterUniforms.u_activeMask, 4);
        } else {
          gl.uniform1i(recenterUniforms.u_activeMask, 3);
        }
        gl.uniform2i(recenterUniforms.u_nodeTexSize, this.nodeLayout.width, this.nodeLayout.height);
        gl.uniform1i(recenterUniforms.u_nodeCapacity, this.nodeCapacity);
        gl.uniform1i(recenterUniforms.u_use3D, is3D ? 1 : 0);
        gl.uniform3f(recenterUniforms.u_center, center[0], center[1], center[2]);
        gl.uniform1f(recenterUniforms.u_outputScale, outputScale);
        if (useRotationDamping) {
          gl.uniform1f(recenterUniforms.u_rotationDamping, rotationDamping);
        }
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

  readNodePositionsById(nodeIds, options = {}) {
    if (!this.outputPositionTexture || this.nodeCapacity <= 0) return null;
    const ids = normalizeReadbackNodeIds(nodeIds);
    const count = ids.length;
    const output = resolveReadbackOut(options.out, count * 3);
    output.fill(0, 0, count * 3);
    if (count <= 0) return output;

    const gl = this.gl;
    const width = this.nodeLayout.width;
    const required = count * 4;
    if (!(this._sparseReadbackScratch instanceof Float32Array) || this._sparseReadbackScratch.length < required) {
      this._sparseReadbackScratch = new Float32Array(required);
    }
    const state = this._saveState();
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.readbackFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outputPositionTexture, 0);
      gl.readBuffer(gl.COLOR_ATTACHMENT0);
      for (let i = 0; i < count; i += 1) {
        const id = ids[i];
        if (id === 0xffffffff || id >= this.nodeCapacity) continue;
        const x = id % width;
        const y = Math.floor(id / width);
        const target = this._sparseReadbackScratch.subarray(i * 4, (i * 4) + 4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, target);
      }
    } finally {
      this._restoreState(state);
    }
    for (let i = 0; i < count; i += 1) {
      const id = ids[i];
      if (id === 0xffffffff || id >= this.nodeCapacity) continue;
      const src = i * 4;
      const dst = i * 3;
      output[dst] = this._sparseReadbackScratch[src] ?? 0;
      output[dst + 1] = this._sparseReadbackScratch[src + 1] ?? 0;
      output[dst + 2] = this._sparseReadbackScratch[src + 2] ?? 0;
    }
    return output;
  }

  readNodeCentroidById(nodeIds, options = {}) {
    const ids = normalizeReadbackNodeIds(nodeIds);
    const count = ids.length;
    if (count <= 0) {
      const centroid = resolveReadbackOut(options.out, 3);
      centroid[0] = 0;
      centroid[1] = 0;
      centroid[2] = 0;
      return { centroid, count: 0 };
    }
    if (count > PARTIAL_CENTROID_CPU_THRESHOLD && count > Math.max(1, this.nodeCapacity * 0.25)) {
      const snapshot = this.readPositionSnapshot();
      const packed = copyPositionsFromFullSnapshot(snapshot, ids, this._centroidPositionScratch);
      this._centroidPositionScratch = packed;
      return centroidFromPackedPositions(packed, count, options.out);
    }
    const packed = this.readNodePositionsById(ids, { out: this._centroidPositionScratch });
    this._centroidPositionScratch = packed;
    return centroidFromPackedPositions(packed, count, options.out);
  }

  writePositionSnapshot(snapshot, options = {}) {
    if (!(snapshot instanceof Float32Array) || this.nodeCapacity <= 0) return false;
    const center = normalizeCenter(options.center);
    const outputScale = Math.max(0.0001, toFinite(options.outputScale, DEFAULT_OPTIONS.outputScale));
    const normalizeInputByOutputScale = Math.abs(outputScale - 1.0) > 1e-6;
    const vec3Count = Math.max(1, this.nodeCapacity) * 3;
    const positions = ensureFloat32Capacity(this._positionWriteScratch, vec3Count);
    const outputPositions = ensureFloat32Capacity(this._outputPositionWriteScratch, vec3Count);
    positions.fill(0, 0, vec3Count);
    outputPositions.fill(0, 0, vec3Count);
    const limit = Math.max(0, Math.min(this.nodeCapacity, Math.floor(snapshot.length / 3)));
    for (let i = 0; i < limit; i += 1) {
      const src = i * 3;
      const x = Number(snapshot[src] ?? center[0]);
      const y = Number(snapshot[src + 1] ?? center[1]);
      const z = Number(snapshot[src + 2] ?? center[2]);
      const safeX = Number.isFinite(x) ? x : center[0];
      const safeY = Number.isFinite(y) ? y : center[1];
      const safeZ = Number.isFinite(z) ? z : center[2];
      outputPositions[src] = safeX;
      outputPositions[src + 1] = safeY;
      outputPositions[src + 2] = safeZ;
      if (normalizeInputByOutputScale) {
        positions[src] = center[0] + ((safeX - center[0]) / outputScale);
        positions[src + 1] = center[1] + ((safeY - center[1]) / outputScale);
        positions[src + 2] = center[2] + ((safeZ - center[2]) / outputScale);
      } else {
        positions[src] = safeX;
        positions[src + 1] = safeY;
        positions[src + 2] = safeZ;
      }
    }

    const positionPacked = this._packVec3Source(positions, this.nodeCapacity, '_positionUploadScratch');
    const outputPacked = this._packVec3Source(outputPositions, this.nodeCapacity, '_outputUploadScratch');
    this._uploadPackedFloatTexture(this.positionTextures[0], positionPacked, this.nodeLayout.width, this.nodeLayout.height);
    this._uploadPackedFloatTexture(this.positionTextures[1], positionPacked, this.nodeLayout.width, this.nodeLayout.height);
    this._uploadPackedFloatTexture(this.outputPositionTexture, outputPacked, this.nodeLayout.width, this.nodeLayout.height);
    this.textureVersion += 1;
    return true;
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
    if (this.neighborEdgesTexture) gl.deleteTexture(this.neighborEdgesTexture);
    if (this.nodeMassTexture) gl.deleteTexture(this.nodeMassTexture);
    if (this.neighborWeightsTexture) gl.deleteTexture(this.neighborWeightsTexture);
    if (this.scalarValuesTexture) gl.deleteTexture(this.scalarValuesTexture);
    for (const target of this._reductionTargets) {
      if (target.texture) gl.deleteTexture(target.texture);
      if (target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
    }
    for (const target of this._angularReductionTargets) {
      if (target.texture) gl.deleteTexture(target.texture);
      if (target.framebuffer) gl.deleteFramebuffer(target.framebuffer);
    }
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.readbackFramebuffer) gl.deleteFramebuffer(this.readbackFramebuffer);
    if (this.fullscreenVao) gl.deleteVertexArray(this.fullscreenVao);
    if (this.computePrograms.linear) gl.deleteProgram(this.computePrograms.linear);
    if (this.computePrograms.linearNormalized) gl.deleteProgram(this.computePrograms.linearNormalized);
    if (this.computePrograms.linearScalar) gl.deleteProgram(this.computePrograms.linearScalar);
    if (this.computePrograms.umap) gl.deleteProgram(this.computePrograms.umap);
    if (this.reductionInitProgram) gl.deleteProgram(this.reductionInitProgram);
    if (this.reductionCombineProgram) gl.deleteProgram(this.reductionCombineProgram);
    if (this.angularReductionInitProgram) gl.deleteProgram(this.angularReductionInitProgram);
    if (this.recenterPrograms?.base) gl.deleteProgram(this.recenterPrograms.base);
    if (this.recenterPrograms?.rotation) gl.deleteProgram(this.recenterPrograms.rotation);

    this.positionTextures = [null, null];
    this.velocityTextures = [null, null];
    this.outputPositionTexture = null;
    this.activeIdsTexture = null;
    this.activeMaskTexture = null;
    this.neighborStartsTexture = null;
    this.neighborCountsTexture = null;
    this.neighborsTexture = null;
    this.neighborEdgesTexture = null;
    this.nodeMassTexture = null;
    this.neighborWeightsTexture = null;
    this.scalarValuesTexture = null;
    this.computePrograms = { linear: null, linearNormalized: null, linearScalar: null, umap: null };
    this.computeUniforms = { linear: null, linearNormalized: null, linearScalar: null, umap: null };
    this.framebuffer = null;
    this.readbackFramebuffer = null;
    this.fullscreenVao = null;
    this.angularReductionInitProgram = null;
    this.recenterPrograms = null;
    this.recenterUniforms = null;
    this.textureVersion = 0;
    this._textureSizes.clear();
  }
}

class WebGLForceComputeBackend {
  constructor(gl) {
    this.gl = gl;
    this._gpu = canUseWebGLTextureCompute(gl) ? new WebGLTextureComputePath(gl) : null;
    this._warnedUnavailable = false;
  }

  get seed() {
    return this._gpu?.seed ?? 0;
  }

  set seed(value) {
    if (this._gpu) this._gpu.seed = value >>> 0;
  }

  get sampleFrame() {
    return this._gpu?.sampleFrame ?? 0;
  }

  set sampleFrame(value) {
    if (this._gpu) this._gpu.sampleFrame = value >>> 0;
  }

  get nodeCapacity() {
    return this._gpu?.nodeCapacity ?? 0;
  }

  get activeCount() {
    return this._gpu?.activeCount ?? 0;
  }

  _warnUnavailable() {
    if (this._warnedUnavailable === true) return;
    this._warnedUnavailable = true;
    console.warn('GpuForcePositionDelegate: WebGL gpu-force requires float texture compute support; no CPU fallback is available.');
  }

  syncTopology(payload, options = {}) {
    if (!this._gpu) {
      this._warnUnavailable();
      return false;
    }
    return this._gpu.syncTopology(payload, options);
  }

  step(stepOptions = {}) {
    if (!this._gpu) {
      this._warnUnavailable();
      return false;
    }
    return this._gpu.step(stepOptions);
  }

  getPositionTexture() {
    return this._gpu?.getPositionTexture?.() ?? null;
  }

  getPositionTextureMeta() {
    return this._gpu?.getPositionTextureMeta?.() ?? null;
  }

  readPositionSnapshot() {
    return this._gpu?.readPositionSnapshot?.() ?? null;
  }

  readNodePositionsById(nodeIds, options = {}) {
    return this._gpu?.readNodePositionsById?.(nodeIds, options) ?? null;
  }

  readNodeCentroidById(nodeIds, options = {}) {
    return this._gpu?.readNodeCentroidById?.(nodeIds, options) ?? null;
  }

  writePositionSnapshot(snapshot, options = {}) {
    if (!this._gpu) {
      this._warnUnavailable();
      return false;
    }
    return this._gpu.writePositionSnapshot?.(snapshot, options) ?? false;
  }

  getExecutionMode() {
    return this._gpu?.getExecutionMode?.() ?? 'unavailable';
  }

  dispose() {
    this._gpu?.dispose?.();
    this._gpu = null;
    this._warnedUnavailable = false;
  }
}

class WebGPUForceComputeBackend {
  constructor(device) {
    this.device = device;
    this.linearPipeline = null;
    this.linearNormalizedPipeline = null;
    this.linearBindGroupLayout = null;
    this.linearBindGroup = null;
    this.linearScalarPipeline = null;
    this.linearScalarBindGroupLayout = null;
    this.linearScalarBindGroup = null;
    this.umapPipeline = null;
    this.umapBindGroupLayout = null;
    this.umapBindGroup = null;
    this.outputScalePipeline = null;
    this.outputScaleBindGroupLayout = null;
    this.outputScaleBindGroup = null;
    this.recenterBasePipeline = null;
    this.recenterBaseBindGroupLayout = null;
    this.recenterBaseBindGroup = null;
    this.recenterRotationPipeline = null;
    this.recenterRotationBindGroupLayout = null;
    this.recenterRotationBindGroup = null;
    this.centroidPipeline = null;
    this.centroidBindGroupLayout = null;
    this.paramsBuffer = null;
    this.outputScaleParamsBuffer = null;
    this.recenterParamsBuffer = null;
    this.centroidParamsBuffer = null;
    this.centroidIdsBuffer = null;
    this.centroidPartialBuffer = null;
    this.centroidReadbackBuffer = null;
    this.positionReadbackBuffer = null;
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
    this.neighborEdgesBuffer = null;
    this.scalarWeightsBuffer = null;
    this.nodeCapacity = 0;
    this.activeCount = 0;
    this.umapEnabled = false;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.sampleFrame = 0;
    this.zeroVelocities = createEmptyFloatArray();
    this.scalarWeightsUpload = createEmptyFloatArray();
    this._readbackChain = Promise.resolve();
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

    this._ensurePipeline(false);
    this._ensureOutputScalePipeline();
    this._ensureRecenterPipeline(false);
    this._ensureRecenterPipeline(true);
    this._ensureCentroidPipeline();
  }

  _ensurePipeline(useUmap = false, useLinearScalar = false, useLinearNormalized = false) {
    if (!this.device) return;
    const pipelineField = useUmap ? 'umapPipeline' : useLinearScalar ? 'linearScalarPipeline' : useLinearNormalized ? 'linearNormalizedPipeline' : 'linearPipeline';
    const layoutField = useUmap ? 'umapBindGroupLayout' : useLinearScalar ? 'linearScalarBindGroupLayout' : 'linearBindGroupLayout';
    if (this[pipelineField]) return;
    const entries = [
      { binding: 0, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
      { binding: 3, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
      { binding: 4, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
      { binding: 6, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
      { binding: 7, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
      { binding: 8, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
      ...(useUmap
        ? [{ binding: 9, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } }]
        : useLinearScalar
          ? [
            { binding: 9, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
            { binding: 10, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
          ]
        : []),
      { binding: useUmap ? 10 : useLinearScalar ? 11 : 9, visibility: this.shaderVisibility, buffer: { type: 'uniform' } },
    ];
    this[layoutField] = this.device.createBindGroupLayout({ entries });
    const module = this.device.createShaderModule({
      code: useUmap
        ? COMPUTE_WGSL_UMAP
        : useLinearScalar
          ? COMPUTE_WGSL_LINEAR_SCALAR
          : useLinearNormalized
            ? COMPUTE_WGSL_LINEAR_NORMALIZED
            : COMPUTE_WGSL_LINEAR,
    });
    this[pipelineField] = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this[layoutField]] }),
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

  _ensureRecenterPipeline(useRotation = false) {
    if (!this.device) return;
    const pipelineField = useRotation ? 'recenterRotationPipeline' : 'recenterBasePipeline';
    const layoutField = useRotation ? 'recenterRotationBindGroupLayout' : 'recenterBaseBindGroupLayout';
    if (this[pipelineField]) return;
    const entries = useRotation
      ? [
        { binding: 0, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
        { binding: 1, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
        { binding: 2, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: this.shaderVisibility, buffer: { type: 'uniform' } },
      ]
      : [
        { binding: 0, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
        { binding: 1, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: this.shaderVisibility, buffer: { type: 'uniform' } },
      ];
    this[layoutField] = this.device.createBindGroupLayout({ entries });
    const module = this.device.createShaderModule({ code: useRotation ? RECENTER_WGSL_ROTATION : RECENTER_WGSL_BASE });
    this[pipelineField] = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this[layoutField]] }),
      compute: { module, entryPoint: 'main' },
    });
  }

  _ensureCentroidPipeline() {
    if (!this.device || this.centroidPipeline) return;
    this.centroidBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: this.shaderVisibility, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: this.shaderVisibility, buffer: { type: 'storage' } },
        { binding: 3, visibility: this.shaderVisibility, buffer: { type: 'uniform' } },
      ],
    });
    const module = this.device.createShaderModule({ code: buildCentroidReductionWgsl() });
    this.centroidPipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.centroidBindGroupLayout] }),
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

  _releaseUmapBuffer() {
    this.neighborEdgesBuffer?.destroy?.();
    this.scalarWeightsBuffer?.destroy?.();
    this.neighborEdgesBuffer = null;
    this.scalarWeightsBuffer = null;
    this.scalarWeightsUpload = createEmptyFloatArray();
    this.umapBindGroup = null;
    this.linearScalarBindGroup = null;
  }

  _releaseLinearScalarBuffer() {
    this.neighborEdgesBuffer?.destroy?.();
    this.neighborEdgesBuffer = null;
    this.linearScalarBindGroup = null;
  }

  _rebuildBindGroup(useUmap = false, useLinearScalar = false) {
    const layout = useUmap ? this.umapBindGroupLayout : useLinearScalar ? this.linearScalarBindGroupLayout : this.linearBindGroupLayout;
    if (!layout) return;
    const entries = [
      { binding: 0, resource: { buffer: this.positionBuffer } },
      { binding: 1, resource: { buffer: this.velocityBuffer } },
      { binding: 2, resource: { buffer: this.scratchPositionBuffer } },
      { binding: 3, resource: { buffer: this.scratchVelocityBuffer } },
      { binding: 4, resource: { buffer: this.activeIdsBuffer } },
      { binding: 5, resource: { buffer: this.activeMaskBuffer } },
      { binding: 6, resource: { buffer: this.neighborStartsBuffer } },
      { binding: 7, resource: { buffer: this.neighborCountsBuffer } },
      { binding: 8, resource: { buffer: this.neighborsBuffer } },
      ...(useUmap ? [{ binding: 9, resource: { buffer: this.scalarWeightsBuffer } }] : []),
      ...(!useUmap && useLinearScalar ? [
        { binding: 9, resource: { buffer: this.neighborEdgesBuffer } },
        { binding: 10, resource: { buffer: this.scalarWeightsBuffer } },
      ] : []),
      { binding: useUmap ? 10 : useLinearScalar ? 11 : 9, resource: { buffer: this.paramsBuffer } },
    ];
    const bindGroup = this.device.createBindGroup({ layout, entries });
    if (useUmap) this.umapBindGroup = bindGroup;
    else if (useLinearScalar) this.linearScalarBindGroup = bindGroup;
    else this.linearBindGroup = bindGroup;
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

  _rebuildRecenterBindGroup(useRotation = false) {
    const layout = useRotation ? this.recenterRotationBindGroupLayout : this.recenterBaseBindGroupLayout;
    if (!layout) return;
    if (!this.positionBuffer || !this.activeIdsBuffer || !this.recenterParamsBuffer) return;
    if (useRotation && !this.velocityBuffer) return;
    const bindGroup = this.device.createBindGroup({
      layout,
      entries: useRotation
        ? [
          { binding: 0, resource: { buffer: this.positionBuffer } },
          { binding: 1, resource: { buffer: this.velocityBuffer } },
          { binding: 2, resource: { buffer: this.activeIdsBuffer } },
          { binding: 3, resource: { buffer: this.recenterParamsBuffer } },
        ]
        : [
          { binding: 0, resource: { buffer: this.positionBuffer } },
          { binding: 1, resource: { buffer: this.activeIdsBuffer } },
          { binding: 2, resource: { buffer: this.recenterParamsBuffer } },
        ],
    });
    if (useRotation) this.recenterRotationBindGroup = bindGroup;
    else this.recenterBaseBindGroup = bindGroup;
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
      neighborEdges,
      nodeMass,
      neighborWeights,
      nodeStrength,
      edgeWeightValues,
      packedPositions,
      packedOutputPositions,
    } = payload;
    const preserveDynamicState = options?.preserveDynamicState === true;
    const previousNodeCapacity = this.nodeCapacity;
    const useUmap = payload.umapModel === true;
    const useLinearScalar = !useUmap && payload.linearScalarInputs === true;
    const useLinearNormalized = !useUmap && !useLinearScalar && payload.linearNormalizedInputs === true;
    this.umapEnabled = useUmap;
    this._ensurePipeline(useUmap, useLinearScalar, useLinearNormalized);

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
    if (useLinearScalar) {
      this._ensureBuffer(
        'neighborEdgesBuffer',
        Math.max(1, neighborEdges.length) * 4,
        this.storageUsage,
        'layout:gpu-force:neighbor-edges',
      );
    } else {
      this._releaseLinearScalarBuffer();
    }
    const scalarWeightCount = useUmap
      ? (this.nodeCapacity + Math.max(0, payload.neighborLength | 0))
      : useLinearScalar
        ? (this.nodeCapacity + Math.max(0, payload.edgeCapacity | 0))
        : 0;
    if (useUmap || useLinearScalar) {
      this.scalarWeightsUpload = ensureFloat32Capacity(this.scalarWeightsUpload, scalarWeightCount);
      this._ensureBuffer(
        'scalarWeightsBuffer',
        Math.max(1, scalarWeightCount) * 4,
        this.storageUsage,
        'layout:gpu-force:scalar-weights',
      );
    } else {
      this._releaseUmapBuffer();
    }
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
      if (useLinearScalar) {
        queue.writeBuffer(this.neighborEdgesBuffer, 0, neighborEdges.buffer, neighborEdges.byteOffset, payload.neighborLength * 4);
      }
    }
    if (useUmap && scalarWeightCount > 0) {
      const scalarWeights = this.scalarWeightsUpload;
      scalarWeights.fill(0, 0, scalarWeightCount);
      if (this.nodeCapacity > 0) {
        scalarWeights.set(nodeMass.subarray(0, this.nodeCapacity), 0);
      }
      if (payload.neighborLength > 0) {
        scalarWeights.set(neighborWeights.subarray(0, payload.neighborLength), this.nodeCapacity);
      }
      queue.writeBuffer(
        this.scalarWeightsBuffer,
        0,
        scalarWeights.buffer,
        scalarWeights.byteOffset,
        scalarWeightCount * 4,
      );
    } else if (useLinearScalar && scalarWeightCount > 0) {
      const scalarWeights = this.scalarWeightsUpload;
      scalarWeights.fill(0, 0, scalarWeightCount);
      if (this.nodeCapacity > 0 && ArrayBuffer.isView(nodeStrength)) {
        const limit = Math.min(this.nodeCapacity, nodeStrength.length);
        for (let i = 0; i < limit; i += 1) {
          const value = Number(nodeStrength[i]);
          scalarWeights[i] = Number.isFinite(value) ? value : 0;
        }
      }
      if (payload.linearHasEdgeWeights && ArrayBuffer.isView(edgeWeightValues)) {
        const edgeLimit = Math.min(Math.max(0, payload.edgeCapacity | 0), edgeWeightValues.length);
        for (let i = 0; i < edgeLimit; i += 1) {
          const value = Number(edgeWeightValues[i]);
          scalarWeights[this.nodeCapacity + i] = Number.isFinite(value) ? value : 0;
        }
      }
      queue.writeBuffer(
        this.scalarWeightsBuffer,
        0,
        scalarWeights.buffer,
        scalarWeights.byteOffset,
        scalarWeightCount * 4,
      );
    }

    this._rebuildBindGroup(useUmap, useLinearScalar);
    this._rebuildOutputScaleBindGroup();
    this._rebuildRecenterBindGroup(false);
    this._rebuildRecenterBindGroup(true);
    return true;
  }

  step(stepOptions = {}) {
    if (!this.device) return false;
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
    const forceModel = isUmapForceModel(stepOptions.forceModel) ? 1 : 0;
    const useUmap = forceModel === 1;
    const useLinearScalar = !useUmap && stepOptions.linearScalarInputs === true;
    const useLinearNormalized = !useUmap && !useLinearScalar && stepOptions.linearNormalizedInputs === true;
    const pipeline = useUmap ? this.umapPipeline : useLinearScalar ? this.linearScalarPipeline : useLinearNormalized ? this.linearNormalizedPipeline : this.linearPipeline;
    const bindGroup = useUmap ? this.umapBindGroup : useLinearScalar ? this.linearScalarBindGroup : this.linearBindGroup;
    if (!pipeline || !bindGroup) return false;

    const dispatchShape = resolveComputeDispatchShape(
      this.nodeCapacity,
      WORKGROUP_SIZE,
      this.maxComputeWorkgroupsPerDimension,
    );
    const paramsBuffer = new ArrayBuffer(28 * 4);
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
    paramsU32[11] = useUmap
      ? (forceModel >>> 0)
      : useLinearScalar
      ? ((forceNormalizationMode(stepOptions.forceNormalizationType) & 255) | (stepOptions.hasEdgeWeights ? 256 : 0))
      : useLinearNormalized
        ? (forceNormalizationMode(stepOptions.forceNormalizationType) & 255)
        : (forceModel >>> 0);

    paramsF32[12] = toFinite(stepOptions.kRepulsion, DEFAULT_OPTIONS.kRepulsion);
    paramsF32[13] = toFinite(stepOptions.kAttraction, DEFAULT_OPTIONS.kAttraction);
    paramsF32[14] = toFinite(stepOptions.kGravity, DEFAULT_OPTIONS.kGravity);
    paramsF32[15] = toFinite(stepOptions.eta, DEFAULT_OPTIONS.eta);

    paramsF32[16] = clamp(stepOptions.damping, 0, 1, DEFAULT_OPTIONS.damping);
    paramsF32[17] = Math.max(0.001, toFinite(stepOptions.maxStep, DEFAULT_OPTIONS.maxStep));
    paramsF32[18] = Math.max(0.0001, toFinite(stepOptions.minDistance, DEFAULT_OPTIONS.minDistance));
    paramsF32[19] = useUmap
      ? Math.max(1, toFinite(stepOptions.umapEpochs, DEFAULT_UMAP_EPOCHS_SMALL))
      : Math.max(0.0001, toFinite(stepOptions.linkDistance, DEFAULT_OPTIONS.linkDistance));

    const center = normalizeCenter(stepOptions.center);
    paramsF32[20] = center[0];
    paramsF32[21] = center[1];
    paramsF32[22] = center[2];
    paramsF32[23] = Math.max(0.001, toFinite(stepOptions.dt, 1 / 60));

    paramsF32[24] = Math.max(0.000001, toFinite(stepOptions.umapA, DEFAULT_OPTIONS.umapA));
    paramsF32[25] = Math.max(0.000001, toFinite(stepOptions.umapB, DEFAULT_OPTIONS.umapB));
    paramsF32[26] = Math.max(0, toFinite(stepOptions.umapGamma, DEFAULT_OPTIONS.umapGamma));
    paramsF32[27] = Math.max(
      0,
      toFinite(stepOptions.umapNegativeSampleRate, DEFAULT_OPTIONS.umapNegativeSampleRate),
    );

    const outputScale = Math.max(0.0001, toFinite(stepOptions.outputScale, DEFAULT_OPTIONS.outputScale));
    const rotationDamping = clamp(stepOptions.rotationDamping, 0, 1, DEFAULT_OPTIONS.rotationDamping);
    const useRotationDamping = rotationDamping > 1e-6;

    this.device.queue.writeBuffer(this.paramsBuffer, 0, paramsBuffer);

    const encoder = this.device.createCommandEncoder({ label: 'layout:gpu-force:step' });
    const pass = encoder.beginComputePass({ label: 'layout:gpu-force:compute' });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(dispatchShape.x, dispatchShape.y, dispatchShape.z);
    pass.end();

    const bytes = Math.max(1, this.nodeCapacity) * 12;
    encoder.copyBufferToBuffer(this.scratchPositionBuffer, 0, this.positionBuffer, 0, bytes);
    encoder.copyBufferToBuffer(this.scratchVelocityBuffer, 0, this.velocityBuffer, 0, bytes);

    if (stepOptions.recenter === true) {
      this._ensureRecenterPipeline(useRotationDamping);
      this._rebuildRecenterBindGroup(useRotationDamping);
      const recenterPipeline = useRotationDamping ? this.recenterRotationPipeline : this.recenterBasePipeline;
      const recenterBindGroup = useRotationDamping ? this.recenterRotationBindGroup : this.recenterBaseBindGroup;
      if (!recenterPipeline || !recenterBindGroup || !this.recenterParamsBuffer) {
        return false;
      }
      const recenterParamsBuffer = new ArrayBuffer(useRotationDamping ? (12 * 4) : (8 * 4));
      const recenterParamsU32 = new Uint32Array(recenterParamsBuffer);
      const recenterParamsF32 = new Float32Array(recenterParamsBuffer);
      recenterParamsU32[0] = this.activeCount >>> 0;
      recenterParamsU32[1] = stepOptions.mode === '3d' ? 1 : 0;
      recenterParamsF32[4] = center[0];
      recenterParamsF32[5] = center[1];
      recenterParamsF32[6] = center[2];
      if (useRotationDamping) {
        recenterParamsF32[8] = rotationDamping;
      }
      this.device.queue.writeBuffer(this.recenterParamsBuffer, 0, recenterParamsBuffer);

      const recenterPass = encoder.beginComputePass({ label: 'layout:gpu-force:recenter' });
      recenterPass.setPipeline(recenterPipeline);
      recenterPass.setBindGroup(0, recenterBindGroup);
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
    return this._enqueueReadback(() => this._readPositionSnapshot());
  }

  async _readPositionSnapshot() {
    const sourceBuffer = this.getPositionBuffer();
    if (!this.device || !sourceBuffer || this.nodeCapacity <= 0) return null;
    const byteLength = Math.max(1, this.nodeCapacity) * 12;
    const staging = this._ensureBuffer(
      'positionReadbackBuffer',
      byteLength,
      getGpuUsage('MAP_READ', MAP_READ_FLAG) | getGpuUsage('COPY_DST', COPY_DST_FLAG),
      'layout:gpu-force:positions-readback',
    );
    const encoder = this.device.createCommandEncoder({ label: 'layout:gpu-force:readback' });
    encoder.copyBufferToBuffer(sourceBuffer, 0, staging, 0, byteLength);
    this.device.queue.submit([encoder.finish()]);
    if (typeof staging.mapAsync !== 'function' || typeof staging.getMappedRange !== 'function') {
      return new Float32Array(Math.max(1, this.nodeCapacity) * 3);
    }
    await staging.mapAsync(getGpuMapMode('READ', MAP_READ_FLAG), 0, byteLength);
    const mapped = staging.getMappedRange(0, byteLength);
    const copy = new Float32Array(mapped.slice(0));
    staging.unmap?.();
    return copy;
  }

  async readNodePositionsById(nodeIds, options = {}) {
    return this._enqueueReadback(() => this._readNodePositionsById(nodeIds, options));
  }

  async _readNodePositionsById(nodeIds, options = {}) {
    const sourceBuffer = this.getPositionBuffer();
    if (!this.device || !sourceBuffer || this.nodeCapacity <= 0) return null;
    const ids = normalizeReadbackNodeIds(nodeIds);
    const count = ids.length;
    const output = resolveReadbackOut(options.out, count * 3);
    output.fill(0, 0, count * 3);
    if (count <= 0) return output;

    const byteLength = Math.max(4, count * 12);
    const staging = this._ensureBuffer(
      'positionReadbackBuffer',
      byteLength,
      getGpuUsage('MAP_READ', MAP_READ_FLAG) | getGpuUsage('COPY_DST', COPY_DST_FLAG),
      'layout:gpu-force:positions-readback',
    );
    const encoder = this.device.createCommandEncoder({ label: 'layout:gpu-force:partial-readback' });
    for (let i = 0; i < count; i += 1) {
      const id = ids[i];
      if (id === 0xffffffff || id >= this.nodeCapacity) continue;
      encoder.copyBufferToBuffer(sourceBuffer, id * 12, staging, i * 12, 12);
    }
    this.device.queue.submit([encoder.finish()]);
    if (typeof staging.mapAsync !== 'function' || typeof staging.getMappedRange !== 'function') {
      return output;
    }
    await staging.mapAsync(getGpuMapMode('READ', MAP_READ_FLAG), 0, byteLength);
    const mapped = staging.getMappedRange(0, byteLength);
    const mappedFloats = new Float32Array(mapped, 0, count * 3);
    for (let i = 0; i < count; i += 1) {
      const id = ids[i];
      if (id === 0xffffffff || id >= this.nodeCapacity) continue;
      const offset = i * 3;
      output[offset] = mappedFloats[offset] ?? 0;
      output[offset + 1] = mappedFloats[offset + 1] ?? 0;
      output[offset + 2] = mappedFloats[offset + 2] ?? 0;
    }
    staging.unmap?.();
    return output;
  }

  async readNodeCentroidById(nodeIds, options = {}) {
    return this._enqueueReadback(() => this._readNodeCentroidById(nodeIds, options));
  }

  async _readNodeCentroidById(nodeIds, options = {}) {
    const ids = normalizeReadbackNodeIds(nodeIds);
    const count = ids.length;
    if (count <= 0) {
      const centroid = resolveReadbackOut(options.out, 3);
      centroid[0] = 0;
      centroid[1] = 0;
      centroid[2] = 0;
      return { centroid, count: 0 };
    }
    if (count <= PARTIAL_CENTROID_CPU_THRESHOLD) {
      const packed = await this._readNodePositionsById(ids);
      return centroidFromPackedPositions(packed, count, options.out);
    }
    const reduced = await this._readNodeCentroidByIdGpuReduction(ids, options);
    if (reduced) return reduced;
    const packed = await this._readNodePositionsById(ids);
    return centroidFromPackedPositions(packed, count, options.out);
  }

  _enqueueReadback(fn) {
    const previous = this._readbackChain ?? Promise.resolve();
    const current = previous.catch(() => {}).then(fn);
    this._readbackChain = current.catch(() => {});
    return current;
  }

  async _readNodeCentroidByIdGpuReduction(ids, options = {}) {
    const sourceBuffer = this.getPositionBuffer();
    if (!this.device || !sourceBuffer || !this.centroidPipeline || !this.centroidBindGroupLayout) return null;
    const count = ids.length;
    const groupCount = Math.max(1, Math.ceil(count / PARTIAL_CENTROID_CPU_THRESHOLD));
    const idsByteLength = Math.max(4, count * 4);
    const partialByteLength = Math.max(16, groupCount * 16);
    const paramsByteLength = 16;
    const idsBuffer = this._ensureBuffer(
      'centroidIdsBuffer',
      idsByteLength,
      getGpuUsage('STORAGE', STORAGE_FLAG) | getGpuUsage('COPY_DST', COPY_DST_FLAG),
      'layout:gpu-force:centroid-ids',
    );
    const partialBuffer = this._ensureBuffer(
      'centroidPartialBuffer',
      partialByteLength,
      getGpuUsage('STORAGE', STORAGE_FLAG) | getGpuUsage('COPY_SRC', COPY_SRC_FLAG),
      'layout:gpu-force:centroid-partials',
    );
    const paramsBuffer = this._ensureBuffer(
      'centroidParamsBuffer',
      paramsByteLength,
      getGpuUsage('UNIFORM', UNIFORM_FLAG) | getGpuUsage('COPY_DST', COPY_DST_FLAG),
      'layout:gpu-force:centroid-params',
    );
    const readbackBuffer = this._ensureBuffer(
      'centroidReadbackBuffer',
      partialByteLength,
      getGpuUsage('MAP_READ', MAP_READ_FLAG) | getGpuUsage('COPY_DST', COPY_DST_FLAG),
      'layout:gpu-force:centroid-readback',
    );

    this.device.queue.writeBuffer(idsBuffer, 0, ids.buffer, ids.byteOffset, idsByteLength);
    const params = new Uint32Array([count >>> 0, this.nodeCapacity >>> 0, 0, 0]);
    this.device.queue.writeBuffer(paramsBuffer, 0, params);
    const bindGroup = this.device.createBindGroup({
      layout: this.centroidBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: sourceBuffer } },
        { binding: 1, resource: { buffer: idsBuffer } },
        { binding: 2, resource: { buffer: partialBuffer } },
        { binding: 3, resource: { buffer: paramsBuffer } },
      ],
    });
    const encoder = this.device.createCommandEncoder({ label: 'layout:gpu-force:centroid-readback' });
    const pass = encoder.beginComputePass({ label: 'layout:gpu-force:centroid-reduce' });
    pass.setPipeline(this.centroidPipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(groupCount);
    pass.end();
    encoder.copyBufferToBuffer(partialBuffer, 0, readbackBuffer, 0, partialByteLength);
    this.device.queue.submit([encoder.finish()]);
    if (typeof readbackBuffer.mapAsync !== 'function' || typeof readbackBuffer.getMappedRange !== 'function') {
      return null;
    }
    await readbackBuffer.mapAsync(getGpuMapMode('READ', MAP_READ_FLAG), 0, partialByteLength);
    const mapped = readbackBuffer.getMappedRange(0, partialByteLength);
    const partials = new Float32Array(mapped);
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let found = 0;
    for (let i = 0; i < groupCount; i += 1) {
      const offset = i * 4;
      sumX += partials[offset] ?? 0;
      sumY += partials[offset + 1] ?? 0;
      sumZ += partials[offset + 2] ?? 0;
      found += partials[offset + 3] ?? 0;
    }
    readbackBuffer.unmap?.();
    const centroid = resolveReadbackOut(options.out, 3);
    if (found > 0) {
      centroid[0] = sumX / found;
      centroid[1] = sumY / found;
      centroid[2] = sumZ / found;
    } else {
      centroid[0] = 0;
      centroid[1] = 0;
      centroid[2] = 0;
    }
    return { centroid, count: found };
  }

  writePositionSnapshot(snapshot, options = {}) {
    if (!(snapshot instanceof Float32Array) || !this.device || this.nodeCapacity <= 0) return false;
    const center = normalizeCenter(options.center);
    const outputScale = Math.max(0.0001, toFinite(options.outputScale, DEFAULT_OPTIONS.outputScale));
    const normalizeInputByOutputScale = Math.abs(outputScale - 1.0) > 1e-6;
    const vec3Count = Math.max(1, this.nodeCapacity) * 3;
    const positions = ensureFloat32Capacity(this._positionWriteScratch, vec3Count);
    const outputPositions = ensureFloat32Capacity(this._outputPositionWriteScratch, vec3Count);
    positions.fill(0, 0, vec3Count);
    outputPositions.fill(0, 0, vec3Count);
    const limit = Math.max(0, Math.min(this.nodeCapacity, Math.floor(snapshot.length / 3)));
    for (let i = 0; i < limit; i += 1) {
      const src = i * 3;
      const x = Number(snapshot[src] ?? center[0]);
      const y = Number(snapshot[src + 1] ?? center[1]);
      const z = Number(snapshot[src + 2] ?? center[2]);
      const safeX = Number.isFinite(x) ? x : center[0];
      const safeY = Number.isFinite(y) ? y : center[1];
      const safeZ = Number.isFinite(z) ? z : center[2];
      outputPositions[src] = safeX;
      outputPositions[src + 1] = safeY;
      outputPositions[src + 2] = safeZ;
      if (normalizeInputByOutputScale) {
        positions[src] = center[0] + ((safeX - center[0]) / outputScale);
        positions[src + 1] = center[1] + ((safeY - center[1]) / outputScale);
        positions[src + 2] = center[2] + ((safeZ - center[2]) / outputScale);
      } else {
        positions[src] = safeX;
        positions[src + 1] = safeY;
        positions[src + 2] = safeZ;
      }
    }

    const byteLength = Math.max(4, this.nodeCapacity * 12);
    this.device.queue.writeBuffer(this.positionBuffer, 0, positions.buffer, positions.byteOffset, byteLength);
    this.device.queue.writeBuffer(this.outputPositionBuffer, 0, outputPositions.buffer, outputPositions.byteOffset, byteLength);
    this.device.queue.writeBuffer(this.scratchPositionBuffer, 0, positions.buffer, positions.byteOffset, byteLength);
    return true;
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
    this._releaseUmapBuffer();
    this.paramsBuffer?.destroy?.();
    this.outputScaleParamsBuffer?.destroy?.();
    this.recenterParamsBuffer?.destroy?.();
    this.centroidParamsBuffer?.destroy?.();
    this.centroidIdsBuffer?.destroy?.();
    this.centroidPartialBuffer?.destroy?.();
    this.centroidReadbackBuffer?.destroy?.();
    this.positionReadbackBuffer?.destroy?.();

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
    this.scalarWeightsBuffer = null;
    this.paramsBuffer = null;
    this.outputScaleParamsBuffer = null;
    this.recenterParamsBuffer = null;
    this.centroidParamsBuffer = null;
    this.centroidIdsBuffer = null;
    this.centroidPartialBuffer = null;
    this.centroidReadbackBuffer = null;
    this.positionReadbackBuffer = null;
    this.linearBindGroup = null;
    this.umapBindGroup = null;
    this.outputScaleBindGroup = null;
    this.recenterBaseBindGroup = null;
    this.recenterRotationBindGroup = null;
    this.linearPipeline = null;
    this.umapPipeline = null;
    this.outputScalePipeline = null;
    this.recenterBasePipeline = null;
    this.recenterRotationPipeline = null;
    this.centroidPipeline = null;
    this.linearBindGroupLayout = null;
    this.umapBindGroupLayout = null;
    this.outputScaleBindGroupLayout = null;
    this.recenterBaseBindGroupLayout = null;
    this.recenterRotationBindGroupLayout = null;
    this.centroidBindGroupLayout = null;
    this.nodeCapacity = 0;
    this.activeCount = 0;
    this.sampleFrame = 0;
    this.zeroVelocities = createEmptyFloatArray();
    this.scalarWeightsUpload = createEmptyFloatArray();
    this._readbackChain = Promise.resolve();
  }
}

/**
 * Position delegate used by GPU force layouts.
 *
 * @public
 * @param {object} [options] - GPU force layout delegate options and resource
 * handles.
 * @returns {GpuForcePositionDelegate} Delegate that synchronizes graph topology
 * to GPU buffers and exposes position snapshots to Helios renderers.
 * @remarks This is a low-level extension point. Most applications configure it
 * indirectly through `GpuForceLayout` or `LayoutBehavior`.
 */
export class GpuForcePositionDelegate extends PositionDelegate {
  constructor(options = {}) {
    super();
    const normalizedOptions = {
      ...DEFAULT_OPTIONS,
      ...options,
      center: normalizeCenter(options.center ?? DEFAULT_OPTIONS.center),
      mode: options.mode === '3d' ? '3d' : '2d',
    };
    if (isUmapForceModel(normalizedOptions.forceModel)) {
      if (options.kRepulsion == null) normalizedOptions.kRepulsion = 1;
      if (options.kAttraction == null) normalizedOptions.kAttraction = 1;
      if (options.kGravity == null) normalizedOptions.kGravity = 0;
      if (options.eta == null) normalizedOptions.eta = 1;
      if (options.alphaDecay == null) normalizedOptions.alphaDecay = DEFAULT_UMAP_ALPHA_DECAY;
      if (options.sampleChurn == null) normalizedOptions.sampleChurn = DEFAULT_UMAP_SAMPLE_CHURN;
    }
    this.options = normalizedOptions;
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
      neighborEdges: createEmptyUintArray(),
      neighborWeights: createEmptyFloatArray(),
      nodeMass: createEmptyFloatArray(),
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
    const prevForceModel = this.options.forceModel;
    const prevEdgeWeightAttribute = this.options.edgeWeightAttribute;
    const prevNodeMassAttribute = this.options.nodeMassAttribute;
    const prevForceNormalizationType = this.options.forceNormalizationType;
    this.options = {
      ...this.options,
      ...next,
      center: normalizeCenter(next.center ?? this.options.center),
      mode: (next.mode ?? this.options.mode) === '3d' ? '3d' : '2d',
    };
    if (isUmapForceModel(this.options.forceModel) && !isUmapForceModel(prevForceModel)) {
      if (next.kRepulsion == null) this.options.kRepulsion = 1;
      if (next.kAttraction == null) this.options.kAttraction = 1;
      if (next.kGravity == null) this.options.kGravity = 0;
      if (next.eta == null) this.options.eta = 1;
      if (next.alphaDecay == null) this.options.alphaDecay = DEFAULT_UMAP_ALPHA_DECAY;
      if (next.sampleChurn == null) this.options.sampleChurn = DEFAULT_UMAP_SAMPLE_CHURN;
    }
    if (next.alpha != null) {
      this.alpha = clamp(next.alpha, 0, 1, this.alpha);
    }
    const centerChanged = (
      prevCenter[0] !== this.options.center[0]
      || prevCenter[1] !== this.options.center[1]
      || prevCenter[2] !== this.options.center[2]
    );
    const modelChanged = prevForceModel !== this.options.forceModel;
    const edgeWeightChanged = prevEdgeWeightAttribute !== this.options.edgeWeightAttribute;
    const nodeMassChanged = prevNodeMassAttribute !== this.options.nodeMassAttribute;
    const forceNormalizationChanged = prevForceNormalizationType !== this.options.forceNormalizationType;
    if (prevMode !== this.options.mode || centerChanged || modelChanged || edgeWeightChanged || nodeMassChanged || forceNormalizationChanged) {
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
      neighborEdges: createEmptyUintArray(),
      neighborWeights: createEmptyFloatArray(),
      nodeMass: createEmptyFloatArray(),
      cursor: createEmptyUintArray(),
      packedPositions: createEmptyFloatArray(),
      packedOutputPositions: createEmptyFloatArray(),
    };
  }

  resetDynamicStateFromNetwork(context = {}) {
    this.markTopologyDirty('position-seed');
    this.ensureSynchronized({
      ...context,
      forceInitialPositions: context.forceInitialPositions !== false,
    });
    return this;
  }

  resetAnnealing() {
    if (this._webgpu) {
      this._webgpu.sampleFrame = 0;
    }
    if (this._webgl) {
      this._webgl.sampleFrame = 0;
    }
    return this;
  }

  getCompletedEpochs() {
    const backend = this._webgpu ?? this._webgl;
    return Math.max(0, Math.floor(Number(backend?.sampleFrame) || 0));
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

  captureNetworkVersionSnapshot(network) {
    const snapshot = super.captureNetworkVersionSnapshot(network);
    const forceNormalizationType = normalizeForceNormalizationType(this.options.forceNormalizationType);
    const usesLinearStrength = !isUmapForceModel(this.options.forceModel) && forceNormalizationType === 'strength';
    const usesLinearEdgeWeights = !isUmapForceModel(this.options.forceModel)
      && Boolean(normalizeAttributeName(this.options.edgeWeightAttribute));
    if (!isUmapForceModel(this.options.forceModel) && !usesLinearStrength && !usesLinearEdgeWeights) {
      return {
        ...snapshot,
        edgeWeightAttributeVersion: 0,
        nodeMassAttributeVersion: 0,
        nodeStrengthAttributeVersion: 0,
      };
    }
    const edgeWeightAttribute = normalizeAttributeName(this.options.edgeWeightAttribute);
    const nodeMassAttribute = normalizeAttributeName(this.options.nodeMassAttribute);
    let nodeStrengthAttributeVersion = 0;
    if (usesLinearStrength && typeof network?.__heliosResolveLayoutStrengthAttribute === 'function') {
      try {
        nodeStrengthAttributeVersion = toFinite(
          network.__heliosResolveLayoutStrengthAttribute(edgeWeightAttribute)?.version,
          0,
        );
      } catch (_) {
        nodeStrengthAttributeVersion = 0;
      }
    }
    return {
      ...snapshot,
      edgeWeightAttributeVersion: edgeWeightAttribute && typeof network?.getEdgeAttributeVersion === 'function'
        ? toFinite(network.getEdgeAttributeVersion(edgeWeightAttribute), 0)
        : 0,
      nodeMassAttributeVersion: nodeMassAttribute && typeof network?.getNodeAttributeVersion === 'function'
        ? toFinite(network.getNodeAttributeVersion(nodeMassAttribute), 0)
        : 0,
      nodeStrengthAttributeVersion,
    };
  }

  _snapshotKey(snapshot) {
    return [
      super._snapshotKey(snapshot),
      toFinite(snapshot?.edgeWeightAttributeVersion, 0),
      toFinite(snapshot?.nodeMassAttributeVersion, 0),
      toFinite(snapshot?.nodeStrengthAttributeVersion, 0),
    ].join('|');
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
    const forceNormalizationType = normalizeForceNormalizationType(this.options.forceNormalizationType);
    const linearEdgeWeightAttribute = !isUmapForceModel(this.options.forceModel)
      ? normalizeAttributeName(this.options.edgeWeightAttribute)
      : null;
    let layoutStrengthAttribute = null;
    if (
      !isUmapForceModel(this.options.forceModel)
      && forceNormalizationType === 'strength'
      && typeof network.__heliosResolveLayoutStrengthAttribute === 'function'
    ) {
      layoutStrengthAttribute = network.__heliosResolveLayoutStrengthAttribute(linearEdgeWeightAttribute)?.name ?? null;
    }
    const materializePayload = () => {
      // Access attribute buffers before taking WASM-backed topology views so
      // hidden metadata allocation cannot stale a previously captured edgesView.
      topologyInputs.positionView = network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
      if (isUmapForceModel(this.options.forceModel)) {
        const edgeWeightAttribute = normalizeAttributeName(this.options.edgeWeightAttribute);
        const nodeMassAttribute = normalizeAttributeName(this.options.nodeMassAttribute);
        topologyInputs.edgeWeightView = edgeWeightAttribute
          ? (network?.getEdgeAttributeBuffer?.(edgeWeightAttribute)?.view ?? null)
          : null;
        topologyInputs.nodeMassView = nodeMassAttribute
          ? (network?.getNodeAttributeBuffer?.(nodeMassAttribute)?.view ?? null)
          : null;
        topologyInputs.nodeStrengthView = null;
      } else {
        topologyInputs.edgeWeightView = linearEdgeWeightAttribute
          ? (network?.getEdgeAttributeBuffer?.(linearEdgeWeightAttribute)?.view ?? null)
          : null;
        topologyInputs.nodeMassView = null;
        topologyInputs.nodeStrengthView = layoutStrengthAttribute
          ? (network?.getNodeAttributeBuffer?.(layoutStrengthAttribute)?.view ?? null)
          : null;
      }
      topologyInputs.edgesView = network?.edgesView instanceof Uint32Array ? network.edgesView : createEmptyUintArray();
      payload = buildTopologyPayload({
        ...topologyInputs,
      }, {
        ...this.options,
        forceInitialPositions: context.forceInitialPositions === true,
      }, this._topologyScratch);
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
      && synchronizeReason !== 'position-seed'
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

    const umapForceModel = isUmapForceModel(this.options.forceModel);
    const forceNormalizationType = normalizeForceNormalizationType(this.options.forceNormalizationType);
    const hasLinearEdgeWeights = !umapForceModel && Boolean(normalizeAttributeName(this.options.edgeWeightAttribute));
    const linearScalarInputs = !umapForceModel && (
      hasLinearEdgeWeights
      || forceNormalizationType === 'strength'
    );
    const linearNormalizedInputs = !umapForceModel
      && !linearScalarInputs
      && forceNormalizationType !== 'local-degree';
    const alphaTarget = clamp(this.options.alphaTarget, 0, 1, DEFAULT_OPTIONS.alphaTarget);
    const alphaDecay = clamp(this.options.alphaDecay, 0, 1, DEFAULT_OPTIONS.alphaDecay);
    const alphaMin = clamp(this.options.alphaMin, 0, 1, DEFAULT_OPTIONS.alphaMin);
    const umapEpochs = umapForceModel
      ? resolveUmapEpochCount(this.options.umapEpochs, this._activeCount)
      : 0;
    this.alpha += (alphaTarget - this.alpha) * alphaDecay;
    if (this.alpha < alphaMin) this.alpha = alphaMin;

    const maxNeighborsPerNode = Math.max(1, Math.floor(toFinite(this.options.maxNeighborsPerNode, DEFAULT_OPTIONS.maxNeighborsPerNode)));
    const explicitSampleCountValue = this.options.sampleCount;
    const explicitSampleCount = explicitSampleCountValue == null || explicitSampleCountValue === ''
      ? NaN
      : Number(explicitSampleCountValue);
    const sampleCount = umapForceModel
      ? resolveUmapSampleCount(
        toFinite(this.options.umapNegativeSampleRate, DEFAULT_OPTIONS.umapNegativeSampleRate),
        toFinite(this.options.umapNeighborCount, DEFAULT_OPTIONS.umapNeighborCount),
        maxNeighborsPerNode,
      )
      : (Number.isFinite(explicitSampleCount)
        ? Math.max(1, Math.floor(explicitSampleCount))
        : (this.options.mode === '3d'
          ? Math.max(1, Math.floor(toFinite(this.options.sampleCount3D, DEFAULT_OPTIONS.sampleCount3D)))
          : Math.max(1, Math.floor(toFinite(this.options.sampleCount2D, DEFAULT_OPTIONS.sampleCount2D)))));
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
    const exactRepulsionScale = !umapForceModel && this._activeCount > 1 && this._activeCount <= exactDecisionCount
      ? Math.sqrt(this._activeCount / Math.max(1, exactDecisionCount))
      : 1;
    const minDistance = umapForceModel
      ? 0.001
      : Math.max(0.0001, toFinite(this.options.minDistance, DEFAULT_OPTIONS.minDistance));

    const stepPayload = {
      mode: this.options.mode,
      forceModel: umapForceModel ? 'umap' : 'linear',
      forceNormalizationType,
      linearScalarInputs,
      linearNormalizedInputs,
      hasEdgeWeights: hasLinearEdgeWeights,
      center: this.options.center,
      recenter: this.options.recenter === true,
      rotationDamping: clamp(this.options.rotationDamping, 0, 1, DEFAULT_OPTIONS.rotationDamping),
      sampleCount,
      sampleChurn: clamp(this.options.sampleChurn, 0, 1, DEFAULT_OPTIONS.sampleChurn),
      exactRepulsionThreshold,
      maxNeighborsPerNode,
      outputScale: Math.max(0.0001, toFinite(this.options.outputScale, DEFAULT_OPTIONS.outputScale)),
      linkDistance: Math.max(0.0001, toFinite(this.options.linkDistance, DEFAULT_OPTIONS.linkDistance)),
      kRepulsion: toFinite(this.options.kRepulsion, DEFAULT_OPTIONS.kRepulsion) * this.alpha * exactRepulsionScale,
      kAttraction: toFinite(this.options.kAttraction, DEFAULT_OPTIONS.kAttraction) * this.alpha,
      kGravity: toFinite(this.options.kGravity, DEFAULT_OPTIONS.kGravity) * this.alpha,
      umapA: Math.max(0.000001, toFinite(this.options.umapA, DEFAULT_OPTIONS.umapA)),
      umapB: Math.max(0.000001, toFinite(this.options.umapB, DEFAULT_OPTIONS.umapB)),
      umapGamma: Math.max(0, toFinite(this.options.umapGamma, DEFAULT_OPTIONS.umapGamma)),
      umapEpochs,
      umapNegativeSampleRate: Math.max(
        0,
        toFinite(this.options.umapNegativeSampleRate, DEFAULT_OPTIONS.umapNegativeSampleRate),
      ),
      eta: umapForceModel ? 1 : (toFinite(this.options.eta, DEFAULT_OPTIONS.eta) * dtScale),
      damping: clamp(this.options.damping, 0, 1, DEFAULT_OPTIONS.damping),
      maxStep: umapForceModel
        ? Math.max(4, toFinite(this.options.maxStep, DEFAULT_OPTIONS.maxStep))
        : Math.max(0.001, toFinite(this.options.maxStep, DEFAULT_OPTIONS.maxStep) * dtScale),
      minDistance,
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
      forceModel: stepPayload.forceModel,
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

  async snapshotNodePositionsById(context = {}, nodeIds = [], options = {}) {
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    const ids = normalizeReadbackNodeIds(nodeIds);
    const count = ids.length;
    const version = this.version;
    if (this._webgpu) {
      const positions = await this._webgpu.readNodePositionsById(ids, options);
      return positions
        ? { ids, positions, count, version, source: 'webgpu' }
        : { ids, positions: resolveReadbackOut(options.out, count * 3), count, version, source: 'webgpu' };
    }
    if (this._webgl) {
      const positions = this._webgl.readNodePositionsById(ids, options);
      return positions
        ? { ids, positions, count, version, source: 'webgl2' }
        : { ids, positions: resolveReadbackOut(options.out, count * 3), count, version, source: 'webgl2' };
    }
    const view = this.getNodePositionView(context);
    const positions = copyPositionsFromFullSnapshot(view, ids, options.out);
    return { ids, positions, count, version, source: 'cpu' };
  }

  async snapshotNodeCentroidById(context = {}, nodeIds = [], options = {}) {
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    const ids = normalizeReadbackNodeIds(nodeIds);
    const count = ids.length;
    const version = this.version;
    if (count <= 0) {
      const centroid = resolveReadbackOut(options.out, 3);
      centroid[0] = 0;
      centroid[1] = 0;
      centroid[2] = 0;
      return { centroid, count: 0, version, source: this._webgpu ? 'webgpu' : this._webgl ? 'webgl2' : 'cpu' };
    }
    if (this._webgpu) {
      const result = await this._webgpu.readNodeCentroidById(ids, options);
      return {
        centroid: result?.centroid ?? resolveReadbackOut(options.out, 3),
        count: result?.count ?? 0,
        version,
        source: 'webgpu',
      };
    }
    if (this._webgl) {
      const result = this._webgl.readNodeCentroidById(ids, options);
      return {
        centroid: result?.centroid ?? resolveReadbackOut(options.out, 3),
        count: result?.count ?? 0,
        version,
        source: 'webgl2',
      };
    }
    const view = this.getNodePositionView(context);
    const packed = copyPositionsFromFullSnapshot(view, ids);
    const result = centroidFromPackedPositions(packed, count, options.out);
    return { centroid: result.centroid, count: result.count, version, source: 'cpu' };
  }

  writePositionSnapshot(snapshot, options = {}) {
    if (!(snapshot instanceof Float32Array) || snapshot.length <= 0) return false;
    const context = options && typeof options === 'object' ? options : {};
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    const backend = this._webgpu ?? this._webgl;
    if (!backend || typeof backend.writePositionSnapshot !== 'function') return false;
    const wroteBackend = backend.writePositionSnapshot(snapshot, {
      center: options.center ?? this.options.center,
      outputScale: options.outputScale ?? this.options.outputScale,
    });
    if (!wroteBackend) return false;
    this.bumpVersion();
    return true;
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

  async flattenNodeDepthToPlane(context = {}, zValue = 0) {
    const targetZ = Number.isFinite(zValue) ? zValue : 0;
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    const backend = this._webgpu ?? this._webgl;
    if (!backend || typeof backend.writePositionSnapshot !== 'function') return false;

    const snapshot = await this.snapshotNodePositions(context);
    if (!(snapshot instanceof Float32Array) || snapshot.length <= 0) return false;

    const network = context.network ?? this._context?.network ?? null;
    let activeIds = null;
    const readActiveIds = () => {
      activeIds = network?.nodeIndices instanceof Uint32Array ? network.nodeIndices : null;
    };
    if (typeof network?.withBufferAccess === 'function') network.withBufferAccess(readActiveIds);
    else readActiveIds();
    const activeCount = activeIds?.length ?? 0;
    if (activeCount <= 0) return false;

    let changed = false;
    for (let i = 0; i < activeCount; i += 1) {
      const nodeId = activeIds[i] >>> 0;
      const offset = (nodeId * 3) + 2;
      const currentZ = Number(snapshot[offset]);
      if (!Number.isFinite(currentZ)) continue;
      if (Math.abs(currentZ - targetZ) <= 1e-9) continue;
      snapshot[offset] = targetZ;
      changed = true;
    }
    if (!changed) return false;

    const wroteBackend = backend.writePositionSnapshot(snapshot, {
      center: this.options.center,
      outputScale: this.options.outputScale,
    });
    if (!wroteBackend) return false;
    this.bumpVersion();
    return true;
  }

  async injectPlanarDepthJitter(context = {}, amplitude = 0) {
    const safeAmplitude = Number(amplitude);
    if (!(safeAmplitude > 0)) return false;
    this._markDirtyForBackend(context);
    this.ensureSynchronized(context);
    const backend = this._webgpu ?? this._webgl;
    if (!backend || typeof backend.writePositionSnapshot !== 'function') return false;
    const snapshot = await this.snapshotNodePositions(context);
    if (!(snapshot instanceof Float32Array) || snapshot.length <= 0) return false;

    const network = context.network ?? this._context?.network ?? null;
    let activeIds = null;
    const readActiveIds = () => {
      activeIds = network?.nodeIndices instanceof Uint32Array ? network.nodeIndices : null;
    };
    if (typeof network?.withBufferAccess === 'function') network.withBufferAccess(readActiveIds);
    else readActiveIds();
    const activeCount = activeIds?.length ?? 0;
    if (activeCount <= 0) return false;

    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < activeCount; i += 1) {
      const nodeId = activeIds[i] >>> 0;
      const z = Number(snapshot[(nodeId * 3) + 2]);
      const safeZ = Number.isFinite(z) ? z : this.options.center[2];
      if (safeZ < minZ) minZ = safeZ;
      if (safeZ > maxZ) maxZ = safeZ;
    }
    const zRange = Number.isFinite(minZ) && Number.isFinite(maxZ) ? (maxZ - minZ) : 0;
    const tolerance = Math.max(1e-6, safeAmplitude * 0.05);
    if (zRange > tolerance) return false;

    let mean = 0;
    for (let i = 0; i < activeCount; i += 1) {
      const nodeId = activeIds[i] >>> 0;
      mean += ((((hash32(nodeId + 1) + 0.5) / 4294967296) - 0.5) * safeAmplitude);
    }
    mean /= Math.max(1, activeCount);

    for (let i = 0; i < activeCount; i += 1) {
      const nodeId = activeIds[i] >>> 0;
      const offset = (nodeId * 3) + 2;
      const currentZ = Number(snapshot[offset]);
      const baseZ = Number.isFinite(currentZ) ? currentZ : this.options.center[2];
      const noise = ((((hash32(nodeId + 1) + 0.5) / 4294967296) - 0.5) * safeAmplitude) - mean;
      snapshot[offset] = baseZ + noise;
    }

    const wroteBackend = backend.writePositionSnapshot(snapshot, {
      center: this.options.center,
      outputScale: this.options.outputScale,
    });
    if (!wroteBackend) return false;
    this.bumpVersion();
    return true;
  }
}

export default GpuForcePositionDelegate;
