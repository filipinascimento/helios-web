import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCalibrationSampleSpecs,
  extractSpecFeatures,
  generateBarabasiAlbert,
  generateErdosRenyi,
  generateStochasticBlockModel,
  generateWattsStrogatz,
} from '../scripts/layout-calibration/graph-generators.mjs';
import {
  scoreProjectedLayout,
} from '../scripts/layout-calibration/calibration-runner.mjs';
import {
  extractLayoutTuningFeatures,
  predictLayoutTuningOptions,
} from '../src/layouts/layoutTuningModel.generated.js';

function assertValidSpec(spec) {
  assert.ok(spec.nodeCount >= 0);
  const seen = new Set();
  for (const [source, target] of spec.edges) {
    assert.ok(source >= 0 && source < spec.nodeCount);
    assert.ok(target >= 0 && target < spec.nodeCount);
    assert.notEqual(source, target);
    const key = `${Math.min(source, target)},${Math.max(source, target)}`;
    assert.equal(seen.has(key), false);
    seen.add(key);
  }
  assert.equal(spec.edgeCount, spec.edges.length);
}

function networkFromSpec(spec) {
  const nodeIndices = new Uint32Array(spec.nodeCount);
  for (let i = 0; i < nodeIndices.length; i += 1) nodeIndices[i] = i;
  return {
    nodeCapacity: spec.nodeCount,
    nodeIndices,
    edgeIndices: new Uint32Array(spec.edges.length),
    edgesView: new Uint32Array(spec.edges.flat()),
    withBufferAccess(fn) {
      return fn();
    },
  };
}

function createScoreCamera() {
  return {
    viewport: { width: 800, height: 600 },
    getUniforms() {
      return {
        viewProjection: [
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1,
        ],
      };
    },
  };
}

test('layout calibration graph generators produce valid simple edge lists', () => {
  for (const spec of [
    generateErdosRenyi({ nodeCount: 10, avgDegree: 5, seed: 1 }),
    generateBarabasiAlbert({ nodeCount: 10, avgDegree: 5, seed: 1 }),
    generateWattsStrogatz({ nodeCount: 10, avgDegree: 4, rewiringProbability: 0.05, seed: 1 }),
    generateStochasticBlockModel({ nodeCount: 12, avgDegree: 5, communities: 4, seed: 1 }),
  ]) {
    assertValidSpec(spec);
  }
});

test('layout calibration sample generation includes varied families and large sparse graphs', () => {
  const specs = createCalibrationSampleSpecs({ seeds: [1], includeLarge: true });
  assert.ok(specs.some((spec) => spec.family === 'er'));
  assert.ok(specs.some((spec) => spec.family === 'ba'));
  assert.ok(specs.some((spec) => spec.family === 'ws'));
  assert.ok(specs.some((spec) => spec.family === 'sbm'));
  assert.ok(specs.some((spec) => spec.nodeCount === 10000));
  for (const spec of specs.slice(0, 12)) assertValidSpec(spec);
});

test('layout calibration feature extraction handles isolates and dense graphs', () => {
  const isolates = extractSpecFeatures({ nodeCount: 5, edges: [] });
  assert.equal(isolates.avgDegree, 0);
  assert.equal(isolates.isolateFraction, 1);

  const dense = generateErdosRenyi({ nodeCount: 8, avgDegree: 7, seed: 3 });
  const denseFeatures = extractSpecFeatures(dense);
  assert.ok(denseFeatures.density > 0.7);
  assert.ok(denseFeatures.degreeVariance >= 0);
});

test('runtime layout tuning features and predictions are deterministic and finite', () => {
  const spec = generateStochasticBlockModel({ nodeCount: 20, avgDegree: 6, communities: 4, seed: 4 });
  const network = networkFromSpec(spec);
  const features = extractLayoutTuningFeatures(network, { communityCount: 4 });
  assert.equal(features.nodeCount, 20);
  assert.ok(features.avgDegree > 0);
  const a = predictLayoutTuningOptions(network);
  const b = predictLayoutTuningOptions(network);
  assert.deepEqual(a, b);
  for (const value of Object.values(a)) {
    assert.ok(Number.isFinite(value));
  }
});

test('layout calibration aesthetic scoring returns sampled 2D/3D quality metrics', () => {
  const spec = {
    nodeCount: 4,
    edges: [[0, 1], [1, 2], [2, 3]],
  };
  const camera = createScoreCamera();
  const separated = scoreProjectedLayout(
    spec,
    new Float32Array([
      -0.6, -0.2, 0.1,
      -0.2, 0.2, -0.1,
      0.2, -0.2, 0.1,
      0.6, 0.2, -0.1,
    ]),
    camera,
  );
  const overlapped = scoreProjectedLayout(
    spec,
    new Float32Array([
      0, 0, 0,
      0.001, 0.001, 0.001,
      0.002, 0.002, 0.002,
      0.003, 0.003, 0.003,
    ]),
    camera,
  );

  for (const key of [
    'score',
    'edgeVisibility',
    'edgeLengthUniformity',
    'neighborhoodSeparation',
    'overlapPenalty',
    'stressPenalty',
    'spreadPenalty',
    'crossingPenalty',
  ]) {
    assert.ok(Number.isFinite(separated[key]), key);
  }
  assert.ok(separated.score > overlapped.score);
  assert.ok(overlapped.overlapPenalty >= separated.overlapPenalty);
});
