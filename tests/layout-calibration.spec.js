import { test, expect } from '@playwright/test';
import {
  generateBarabasiAlbert,
  generateErdosRenyi,
  generateStochasticBlockModel,
} from '../scripts/layout-calibration/graph-generators.mjs';

test.setTimeout(90_000);

const DEFAULT_CANDIDATE = {
  linkDistance: 1,
  minDistance: 0.15,
  kRepulsion: 1,
  kAttraction: 0.62,
  kGravity: 0.001,
  outputScale: 6.5,
};

const SMALL_GRAPH_CANDIDATE = {
  linkDistance: 1,
  minDistance: 0.15,
  kRepulsion: 1,
  kAttraction: 0.62,
  kGravity: 0.001,
  outputScale: 11,
};

async function runTrial(page, spec, candidate, durationMs = 500) {
  return page.evaluate(
    ({ graphSpec, layoutCandidate, ms }) => window.__runLayoutCalibrationTrial(
      graphSpec,
      layoutCandidate,
      { durationMs: ms, width: 720, height: 520 },
    ),
    { graphSpec: spec, layoutCandidate: candidate, ms: durationMs },
  );
}

test('layout calibration browser helper scores small and medium GPU-force candidates', async ({ page }) => {
  await page.goto('/scripts/layout-calibration/calibration-page.html', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.__runLayoutCalibrationTrial === 'function');

  const smallSpecs = [
    generateErdosRenyi({ nodeCount: 5, avgDegree: 4, seed: 2 }),
    generateBarabasiAlbert({ nodeCount: 10, avgDegree: 5, seed: 2 }),
    generateStochasticBlockModel({ nodeCount: 24, avgDegree: 6, communities: 4, seed: 2 }),
  ];

  for (const spec of smallSpecs) {
    const baseline = await runTrial(page, spec, DEFAULT_CANDIDATE);
    const tuned = await runTrial(page, spec, SMALL_GRAPH_CANDIDATE);
    expect(Number.isFinite(baseline.metrics.score)).toBe(true);
    expect(Number.isFinite(tuned.metrics.score)).toBe(true);
    expect(tuned.metrics.edgeVisibility).toBeGreaterThanOrEqual(baseline.metrics.edgeVisibility - 0.05);
  }

  const medium = generateErdosRenyi({ nodeCount: 100, avgDegree: 8, seed: 4 });
  const baseline = await runTrial(page, medium, DEFAULT_CANDIDATE, 450);
  const tuned = await runTrial(page, medium, SMALL_GRAPH_CANDIDATE, 450);
  expect(tuned.metrics.spreadFill).toBeLessThanOrEqual(Math.max(1.25, baseline.metrics.spreadFill + 0.35));
});
