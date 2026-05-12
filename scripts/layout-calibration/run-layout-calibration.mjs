#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { createCalibrationSampleSpecs } from './graph-generators.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const dataDir = path.join(__dirname, 'data');
const resultsDir = path.join(__dirname, 'results');

const BASE_CANDIDATE = Object.freeze({
  linkDistance: 1,
  minDistance: 0.15,
  kRepulsion: 1,
  kAttraction: 0.62,
  kGravity: 0.001,
  outputScale: 6.5,
});

const CANDIDATES = [
  {},
  { outputScale: 4.5 },
  { outputScale: 8 },
  { outputScale: 11 },
  { outputScale: 15 },
  { outputScale: 19 },
];

function parseArgs(argv) {
  const get = (name, fallback = null) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] ?? fallback : fallback;
  };
  return {
    smoke: argv.includes('--smoke'),
    maxSpecs: Number(get('--max-specs', argv.includes('--smoke') ? 4 : 40)),
    durationMs: Number(get('--duration-ms', argv.includes('--smoke') ? 700 : 1400)),
    output: get('--output', null),
  };
}

async function readSpecs(smoke) {
  const filename = path.join(dataDir, 'generated', smoke ? 'specs-smoke.json' : 'specs.json');
  try {
    const parsed = JSON.parse(await readFile(filename, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return createCalibrationSampleSpecs({ seeds: [1], includeLarge: !smoke });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(resultsDir, { recursive: true });
  const specs = (await readSpecs(args.smoke)).slice(0, Math.max(1, args.maxSpecs || 1));
  const server = await createServer({
    root: repoRoot,
    server: { host: '127.0.0.1', port: 0 },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/scripts/layout-calibration/calibration-page.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const measurements = [];
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    for (const spec of specs) {
      for (const patch of CANDIDATES) {
        const candidate = { ...BASE_CANDIDATE, ...patch };
        const result = await page.evaluate(
          ({ graphSpec, layoutCandidate, durationMs }) => window.__runLayoutCalibrationTrial(
            graphSpec,
            layoutCandidate,
            { durationMs, width: 800, height: 600 },
          ),
          { graphSpec: spec, layoutCandidate: candidate, durationMs: args.durationMs },
        );
        measurements.push({
          ...result,
          features: spec.features ?? null,
          timestamp: new Date().toISOString(),
        });
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const output = args.output ?? path.join(resultsDir, args.smoke ? 'measurements-smoke.json' : 'measurements.json');
  await writeFile(output, `${JSON.stringify({ baseCandidate: BASE_CANDIDATE, measurements }, null, 2)}\n`);
  console.log(JSON.stringify({ specs: specs.length, measurements: measurements.length, output }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
