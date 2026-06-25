#!/usr/bin/env node
import { mkdir, copyFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCalibrationSampleSpecs, extractSpecFeatures } from './graph-generators.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const generatedDir = path.join(dataDir, 'generated');
const realDir = path.join(dataDir, 'real-networks');

const REAL_NETWORK_SOURCES = [
  '/Users/filipinascimentosilva/Downloads/REDES',
  '/Users/filipinascimentosilva/Downloads/new-helios-web/helios-web-old/public/docs/example/networks',
];

const PREFERRED_REAL_NETWORKS = [
  'Simple.xnet',
  'USairport_2010.xnet',
  'Airports.xnet',
  'NetScience_directions_weights.xnet',
  'Facebook_combined.xnet',
  'road-euroroad.xnet',
  'WIKI.xnet',
  'AIR.xnet',
  'San_Joaquin.xnet',
  'LondonNoUnderground.xnet',
  'wiki_Math_Medi_Phys.xnet',
  'BA_N10000_K6.xnet',
  'ER_N5000_K5.xnet',
  'SW2Dp0.100.xnet',
];

function parseArgs(argv) {
  return {
    smoke: argv.includes('--smoke'),
    noReal: argv.includes('--no-real'),
  };
}

async function findPreferredNetwork(name) {
  for (const source of REAL_NETWORK_SOURCES) {
    const direct = path.join(source, name);
    try {
      const info = await stat(direct);
      if (info.isFile()) return direct;
    } catch {
      // Try next source.
    }
  }
  return null;
}

async function copyRealNetworks({ smoke = false, noReal = false } = {}) {
  if (noReal) return [];
  await mkdir(realDir, { recursive: true });
  const selected = smoke ? PREFERRED_REAL_NETWORKS.slice(0, 3) : PREFERRED_REAL_NETWORKS;
  const manifest = [];
  for (const name of selected) {
    const source = await findPreferredNetwork(name);
    if (!source) continue;
    const destination = path.join(realDir, name.replaceAll(' ', '_'));
    await copyFile(source, destination);
    const info = await stat(destination);
    manifest.push({
      id: path.basename(destination, '.xnet'),
      kind: 'real',
      format: 'xnet',
      source,
      path: path.relative(dataDir, destination),
      bytes: info.size,
    });
  }
  await writeFile(path.join(realDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await mkdir(generatedDir, { recursive: true });
  const specs = createCalibrationSampleSpecs({
    seeds: args.smoke ? [1] : [1, 7],
    includeLarge: !args.smoke,
  });
  const payload = specs.map((spec) => ({
    ...spec,
    features: extractSpecFeatures(spec),
  }));
  await writeFile(path.join(generatedDir, args.smoke ? 'specs-smoke.json' : 'specs.json'), `${JSON.stringify(payload, null, 2)}\n`);
  const realNetworks = await copyRealNetworks(args);
  const summary = {
    syntheticSpecs: payload.length,
    realNetworks: realNetworks.length,
    dataDir,
  };
  await writeFile(path.join(dataDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
