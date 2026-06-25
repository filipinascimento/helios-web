import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  HELIOS_PERF_HISTORY: '1',
  HELIOS_PERF_RENDERER: process.env.HELIOS_PERF_RENDERER || 'webgpu',
};

const project = process.env.HELIOS_PERF_PROJECT || 'chromium-webgpu-headed';
const args = [
  'playwright',
  'test',
  'tests/performance-history.spec.js',
  `--project=${project}`,
  ...process.argv.slice(2),
];

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
