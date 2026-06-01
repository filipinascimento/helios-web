import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const HOST = '127.0.0.1';
const PORT = Number(process.env.HELIOS_PROFILE_PORT || 4173);
const BASE_URL = `http://${HOST}:${PORT}`;
const NODE_COUNT = Number(process.env.HELIOS_PROFILE_NODES || 1_000_000);
const SAMPLE_MS = Number(process.env.HELIOS_PROFILE_SAMPLE_MS || 5_000);
const WARMUP_MS = Number(process.env.HELIOS_PROFILE_WARMUP_MS || 1_000);
const MANUAL_STEPS = Number(process.env.HELIOS_PROFILE_MANUAL_STEPS || 8);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = path.resolve(process.env.HELIOS_PROFILE_OUTPUT_DIR || `artifacts/performance-history/profile-1m-${stamp}`);

const isLinux = process.platform === 'linux';
const chromeArgs = [
  '--enable-unsafe-webgpu',
  '--disable-dawn-features=disallow_unsafe_apis',
  '--use-angle=metal',
  `--unsafely-treat-insecure-origin-as-secure=${BASE_URL}`,
  '--enable-features=AllowUnsafeWebGPU,UnsafeWebGPU',
  ...(isLinux ? ['--enable-features=Vulkan,UseSkiaRenderer'] : []),
];

function percentile(values, q) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
}

function summarizeNumbers(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return { count: 0, avg: null, min: null, p50: null, p95: null, max: null };
  const sum = clean.reduce((total, value) => total + value, 0);
  return {
    count: clean.length,
    avg: sum / clean.length,
    min: Math.min(...clean),
    p50: percentile(clean, 0.5),
    p95: percentile(clean, 0.95),
    max: Math.max(...clean),
  };
}

function summarizeCpuProfile(profile) {
  const nodes = new Map((profile.nodes ?? []).map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes ?? []) {
    for (const child of node.children ?? []) parent.set(child, node.id);
  }
  const self = new Map();
  const total = new Map();
  const samples = profile.samples ?? [];
  const deltas = profile.timeDeltas ?? [];
  const fallbackDelta = samples.length > 0
    ? Math.max(0, ((profile.endTime ?? 0) - (profile.startTime ?? 0)) / samples.length / 1000)
    : 0;
  for (let i = 0; i < samples.length; i += 1) {
    const id = samples[i];
    const ms = Number.isFinite(deltas[i]) ? deltas[i] / 1000 : fallbackDelta;
    self.set(id, (self.get(id) ?? 0) + ms);
    let current = id;
    while (current != null) {
      total.set(current, (total.get(current) ?? 0) + ms);
      current = parent.get(current);
    }
  }
  const rows = Array.from(nodes.values(), (node) => {
    const callFrame = node.callFrame ?? {};
    return {
      id: node.id,
      functionName: callFrame.functionName || '(anonymous)',
      url: callFrame.url || '',
      lineNumber: callFrame.lineNumber ?? null,
      columnNumber: callFrame.columnNumber ?? null,
      selfMs: self.get(node.id) ?? 0,
      totalMs: total.get(node.id) ?? 0,
      hitCount: node.hitCount ?? 0,
    };
  });
  const appRows = rows.filter((row) => row.url.includes('/src/') || row.url.includes('/docs/examples/basic/'));
  const bySelf = (a, b) => b.selfMs - a.selfMs;
  const byTotal = (a, b) => b.totalMs - a.totalMs;
  return {
    sampleCount: samples.length,
    durationMs: Math.max(0, ((profile.endTime ?? 0) - (profile.startTime ?? 0)) / 1000),
    topSelf: rows.slice().sort(bySelf).slice(0, 40),
    topTotal: rows.slice().sort(byTotal).slice(0, 40),
    topAppSelf: appRows.slice().sort(bySelf).slice(0, 40),
    topAppTotal: appRows.slice().sort(byTotal).slice(0, 40),
  };
}

async function waitForServer(processHandle) {
  const deadline = performance.now() + 120_000;
  let lastError = null;
  while (performance.now() < deadline) {
    if (processHandle.exitCode != null) {
      throw new Error(`Vite server exited with code ${processHandle.exitCode}`);
    }
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${BASE_URL}: ${lastError?.message ?? 'no response'}`);
}

function startServer() {
  const child = spawn('npm', ['run', 'dev', '--', '--host', HOST, '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      VITE_HOST: HOST,
      VITE_NODE_COUNT: '2000',
    },
  });
  child.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));
  return child;
}

async function waitForMainExample(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  }, null, { timeout: 180_000 });
  const diagnostics = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
  if (diagnostics?.error) throw new Error(`main example failed: ${diagnostics.error}`);
  await page.waitForFunction(async () => {
    const helios = window.__helios;
    if (!helios?.ready) return false;
    await helios.ready;
    return Boolean(window.__heliosUI);
  }, null, { timeout: 180_000 });
  return diagnostics;
}

async function writeJson(name, data) {
  await fs.mkdir(outputDir, { recursive: true });
  const file = path.join(outputDir, name);
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}

async function profileWindow(cdp, label, body) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  const started = performance.now();
  let result;
  try {
    result = await body();
  } finally {
    const { profile } = await cdp.send('Profiler.stop');
    const elapsedMs = performance.now() - started;
    const cpuSummary = summarizeCpuProfile(profile);
    await writeJson(`${label}.cpuprofile`, profile);
    await writeJson(`${label}.cpu-summary.json`, cpuSummary);
    result = { ...(result ?? {}), elapsedMs, cpuSummaryFile: `${label}.cpu-summary.json`, cpuProfileFile: `${label}.cpuprofile` };
  }
  return result;
}

async function installRuntimeInstrumentation(page) {
  await page.evaluate(() => {
    const existing = window.__heliosRuntimeInstrumentation;
    if (existing?.installed) {
      existing.reset();
      return;
    }
    const state = {
      installed: true,
      records: Object.create(null),
      reset() {
        this.records = Object.create(null);
      },
      record(label, durationMs) {
        const record = this.records[label] ?? {
          label,
          count: 0,
          totalMs: 0,
          maxMs: 0,
          minMs: Infinity,
        };
        record.count += 1;
        record.totalMs += durationMs;
        record.maxMs = Math.max(record.maxMs, durationMs);
        record.minMs = Math.min(record.minMs, durationMs);
        this.records[label] = record;
      },
      snapshot() {
        return Object.values(this.records)
          .map((record) => ({
            ...record,
            avgMs: record.totalMs / Math.max(1, record.count),
            minMs: record.minMs === Infinity ? 0 : record.minMs,
          }))
          .sort((a, b) => b.totalMs - a.totalMs);
      },
    };
    const wrapped = new WeakMap();
    const wrap = (object, name, label) => {
      if (!object || typeof object[name] !== 'function') return;
      let names = wrapped.get(object);
      if (!names) {
        names = new Set();
        wrapped.set(object, names);
      }
      if (names.has(name)) return;
      names.add(name);
      const original = object[name];
      object[name] = function profiledMethod(...args) {
        const started = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          state.record(label, performance.now() - started);
        }
      };
    };
    const helios = window.__helios;
    const renderer = helios?.renderer;
    const graphLayer = renderer?.graphLayer;
    const device = renderer?.device;
    const layout = typeof helios?.layout === 'function' ? helios.layout() : null;
    const delegate = layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null;
    const webgpuBackend = delegate?._webgpu ?? null;
    const scheduler = helios?.scheduler ?? null;

    wrap(scheduler, 'tick', 'scheduler.tick');
    wrap(renderer, 'render', 'renderer.render');
    wrap(device, 'beginFrame', 'webgpu.beginFrame');
    wrap(device, 'endFrame', 'webgpu.endFrame');
    wrap(device, 'presentFramebuffer', 'webgpu.presentFramebuffer');
    wrap(graphLayer, 'render', 'graphLayer.render');
    wrap(graphLayer, 'withSparseGraph', 'graphLayer.withSparseGraph');
    wrap(graphLayer, 'updateNodeBuffersGpuIndirect', 'graphLayer.updateNodeBuffersGpuIndirect');
    wrap(graphLayer, 'updateEdgeBuffersGpuIndirect', 'graphLayer.updateEdgeBuffersGpuIndirect');
    wrap(graphLayer, 'prepareWeightedResources', 'graphLayer.prepareWeightedResources');
    wrap(graphLayer, 'updateGlobalsGpu', 'graphLayer.updateGlobalsGpu');
    wrap(graphLayer, 'updateCameraUniformsGpu', 'graphLayer.updateCameraUniformsGpu');
    wrap(graphLayer, 'getNodePipeline', 'graphLayer.getNodePipeline');
    wrap(graphLayer, 'getEdgePipelinesForMode', 'graphLayer.getEdgePipelinesForMode');
    wrap(graphLayer?.frameGraph, 'run', 'graphLayer.frameGraph.run');
    wrap(layout, 'step', 'layout.step');
    wrap(delegate, 'ensureSynchronized', 'delegate.ensureSynchronized');
    wrap(delegate, 'step', 'delegate.step');
    wrap(webgpuBackend, 'syncTopology', 'webgpuLayout.syncTopology');
    wrap(webgpuBackend, 'step', 'webgpuLayout.step');
    const queue = device?.device?.queue;
    wrap(queue, 'writeBuffer', 'gpu.queue.writeBuffer');
    wrap(queue, 'submit', 'gpu.queue.submit');
    wrap(queue, 'onSubmittedWorkDone', 'gpu.queue.onSubmittedWorkDone');
    window.__heliosRuntimeInstrumentation = state;
  });
}

async function collectState(page) {
  return page.evaluate(() => {
    const helios = window.__helios;
    const renderer = helios?.renderer;
    const graphLayer = renderer?.graphLayer;
    const layout = typeof helios?.layout === 'function' ? helios.layout() : null;
    const delegate = layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null;
    const gl = (() => {
      try { return document.createElement('canvas').getContext('webgl2'); } catch (_) { return null; }
    })();
    const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info') ?? null;
    return {
      url: window.location.href,
      renderer: {
        className: renderer?.constructor?.name ?? null,
        deviceType: renderer?.device?.type ?? null,
        graphLayer: graphLayer?.constructor?.name ?? null,
      },
      webgpuAvailable: Boolean(navigator.gpu),
      webgpuDeviceFeatures: Array.from(renderer?.device?.device?.features ?? []),
      webgpuLimits: renderer?.device?.device?.limits ? {
        maxBufferSize: renderer.device.device.limits.maxBufferSize,
        maxStorageBufferBindingSize: renderer.device.device.limits.maxStorageBufferBindingSize,
        maxStorageBuffersPerShaderStage: renderer.device.device.limits.maxStorageBuffersPerShaderStage,
      } : null,
      webglRenderer: debugInfo && gl ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
      graph: {
        nodes: helios?.network?.nodeCount ?? null,
        edges: helios?.network?.edgeCount ?? null,
      },
      layout: {
        className: layout?.constructor?.name ?? null,
        state: helios?.scheduler?.getLayoutState?.() ?? null,
        alpha: Number(layout?.alpha ?? delegate?.alpha ?? NaN),
        options: layout?.options ? {
          mode: layout.options.mode,
          sampleCount2D: layout.options.sampleCount2D,
          sampleCount3D: layout.options.sampleCount3D,
          sampleChurn: layout.options.sampleChurn,
          maxNeighborsPerNode: layout.options.maxNeighborsPerNode,
          outputScale: layout.options.outputScale,
          recenter: layout.options.recenter,
          rotationDamping: layout.options.rotationDamping,
        } : null,
      },
      graphLayer: graphLayer ? {
        edgeRenderingMode: graphLayer.edgeRenderingMode,
        effectiveEdgeRenderingMode: graphLayer.getEffectiveEdgeRenderingMode?.() ?? null,
        edgeFastRendering: graphLayer.edgeFastRendering,
        edgeAdaptiveFastRendering: graphLayer.edgeAdaptiveFastRendering,
        edgeOpacityBase: graphLayer.edgeOpacityBase,
        edgeOpacityScale: graphLayer.edgeOpacityScale,
        edgeWidthBase: graphLayer.edgeWidthBase,
        edgeWidthScale: graphLayer.edgeWidthScale,
        edgeTransparencyMode: graphLayer.edgeTransparencyMode,
        ambientOcclusionEnabled: graphLayer.ambientOcclusionEnabled,
        nodeBlendWithEdges: graphLayer.nodeBlendWithEdges,
      } : null,
      counters: { ...(helios?.counters ?? {}) },
      runtimeStats: window.__heliosRuntimeInstrumentation?.snapshot?.() ?? [],
      perfSummary: helios?.performanceMonitor?.getSummary?.() ?? {},
    };
  });
}

async function runRafScenario(page, label, { layoutRunning, setupSource }) {
  return profileWindow(await page.context().newCDPSession(page), label, async () => page.evaluate(async ({ durationMs, warmupMs, layoutRunning: shouldRun, setupSource: source }) => {
    const setup = source ? new Function(`return (${source});`)() : null;
    await setup?.(window.__helios);
    const helios = window.__helios;
    const monitor = helios.performanceMonitor;
    window.__heliosRuntimeInstrumentation?.reset?.();
    monitor?.setEnabled?.(true);
    monitor?.samples?.clear?.();
    if (shouldRun) {
      helios.startLayout?.(`profile:${location.search}`);
      helios.layout?.()?.reheat?.('profile');
    } else {
      helios.stopLayout?.('profile-render-only');
    }
    await new Promise((resolve) => setTimeout(resolve, warmupMs));
    const queue = helios.renderer?.device?.device?.queue;
    const startCounters = { ...(helios.counters ?? {}) };
    const startRenderFrames = Number(startCounters.renderFrames ?? 0);
    const startLayoutFrames = Number(startCounters.layoutFrames ?? 0);
    const intervals = [];
    const start = performance.now();
    let previous = null;
    let rafFrames = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        rafFrames += 1;
        if (previous !== null) intervals.push(Math.max(0, now - previous));
        previous = now;
        helios.requestRender?.();
        if (now - start >= durationMs) {
          requestAnimationFrame(resolve);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const queueStart = performance.now();
    await queue?.onSubmittedWorkDone?.();
    const queueDrainMs = performance.now() - queueStart;
    const end = performance.now();
    const endCounters = { ...(helios.counters ?? {}) };
    return {
      label: location.search,
      layoutRunning: shouldRun,
      durationMs: end - start,
      rafFrames,
      rafFps: rafFrames / ((end - start) / 1000),
      renderFrames: Number(endCounters.renderFrames ?? 0) - startRenderFrames,
      renderFps: (Number(endCounters.renderFrames ?? 0) - startRenderFrames) / ((end - start) / 1000),
      layoutFrames: Number(endCounters.layoutFrames ?? 0) - startLayoutFrames,
      queueDrainMs,
      frameIntervalMs: summarizeForPage(intervals),
      perfSummary: monitor?.getSummary?.() ?? {},
      runtimeStats: window.__heliosRuntimeInstrumentation?.snapshot?.() ?? [],
      counters: endCounters,
    };

    function summarizeForPage(values) {
      const clean = values.filter((value) => Number.isFinite(value));
      const sorted = clean.slice().sort((a, b) => a - b);
      const q = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] : null;
      return {
        count: clean.length,
        avg: clean.reduce((sum, value) => sum + value, 0) / Math.max(1, clean.length),
        p50: q(0.5),
        p95: q(0.95),
        max: sorted.length ? sorted[sorted.length - 1] : null,
      };
    }
  }, {
    durationMs: SAMPLE_MS,
    warmupMs: WARMUP_MS,
    layoutRunning,
    setupSource: setupSource?.toString?.() ?? null,
  }));
}

async function measureManualGpuWork(page) {
  return page.evaluate(async ({ steps }) => {
    const helios = window.__helios;
    const scheduler = helios.scheduler;
    const layout = helios.layout?.();
    const queue = helios.renderer?.device?.device?.queue;
    const wasRunning = scheduler?.running === true;
    scheduler?.stop?.();
    window.__heliosRuntimeInstrumentation?.reset?.();
    const layoutSamples = [];
    for (let i = 0; i < steps; i += 1) {
      const start = performance.now();
      layout?.step?.(16);
      await queue?.onSubmittedWorkDone?.();
      layoutSamples.push(performance.now() - start);
    }
    const layoutRuntimeStats = window.__heliosRuntimeInstrumentation?.snapshot?.() ?? [];
    if (wasRunning) scheduler?.start?.();
    helios.stopLayout?.('profile-manual-render');
    await new Promise((resolve) => setTimeout(resolve, 500));
    window.__heliosRuntimeInstrumentation?.reset?.();
    const renderSamples = [];
    for (let i = 0; i < steps; i += 1) {
      const before = Number(helios.counters?.renderFrames ?? 0);
      const start = performance.now();
      helios.requestRender?.();
      await new Promise((resolve) => {
        const deadline = performance.now() + 10_000;
        const tick = () => {
          if (Number(helios.counters?.renderFrames ?? 0) > before || performance.now() > deadline) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await queue?.onSubmittedWorkDone?.();
      renderSamples.push(performance.now() - start);
    }
    const renderRuntimeStats = window.__heliosRuntimeInstrumentation?.snapshot?.() ?? [];
    if (wasRunning) scheduler?.start?.();
    return {
      layoutStepGpuCompleteMs: summarizeForPage(layoutSamples),
      renderFrameGpuCompleteMs: summarizeForPage(renderSamples),
      layoutRuntimeStats,
      renderRuntimeStats,
    };

    function summarizeForPage(values) {
      const clean = values.filter((value) => Number.isFinite(value));
      const sorted = clean.slice().sort((a, b) => a - b);
      const q = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] : null;
      return {
        count: clean.length,
        avg: clean.reduce((sum, value) => sum + value, 0) / Math.max(1, clean.length),
        min: sorted[0] ?? null,
        p50: q(0.5),
        p95: q(0.95),
        max: sorted[sorted.length - 1] ?? null,
        samples: clean,
      };
    }
  }, { steps: MANUAL_STEPS });
}

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const server = startServer();
  let browser;
  try {
    await waitForServer(server);
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: chromeArgs,
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const url = `${BASE_URL}/?nodes=${NODE_COUNT}&renderer=webgpu`;
    const loadResult = await profileWindow(cdp, 'load', async () => {
      const start = performance.now();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
      const diagnostics = await waitForMainExample(page);
      return { readyMs: performance.now() - start, diagnostics };
    });
    await installRuntimeInstrumentation(page);
    const initial = await collectState(page);
    if (initial.renderer.deviceType !== 'webgpu') {
      throw new Error(`Expected WebGPU renderer, got ${initial.renderer.deviceType}`);
    }
    const manualGpu = await measureManualGpuWork(page);
    const scenarios = [];
    scenarios.push({
      name: 'default-layout-running',
      result: await runRafScenario(page, 'default-layout-running', { layoutRunning: true }),
      state: await collectState(page),
    });
    scenarios.push({
      name: 'default-render-only',
      result: await runRafScenario(page, 'default-render-only', { layoutRunning: false }),
      state: await collectState(page),
    });
    scenarios.push({
      name: 'alpha-quad-render-only',
      result: await runRafScenario(page, 'alpha-quad-render-only', {
        layoutRunning: false,
        setupSource: (helios) => {
          helios.edgeOpacityBase?.(0);
          helios.edgeOpacityScale?.(0.5);
          helios.edgeFastRendering?.(false);
          helios.edgeTransparencyMode?.('alpha');
          helios.renderer?.graphLayer?.setEdgeRenderingMode?.('quad');
        },
      }),
      state: await collectState(page),
    });
    scenarios.push({
      name: 'alpha-line-render-only',
      result: await runRafScenario(page, 'alpha-line-render-only', {
        layoutRunning: false,
        setupSource: (helios) => {
          helios.edgeOpacityBase?.(0);
          helios.edgeOpacityScale?.(0.5);
          helios.edgeFastRendering?.(false);
          helios.edgeTransparencyMode?.('alpha');
          helios.renderer?.graphLayer?.setEdgeRenderingMode?.('line');
        },
      }),
      state: await collectState(page),
    });
    scenarios.push({
      name: 'fast-edge-render-only',
      result: await runRafScenario(page, 'fast-edge-render-only', {
        layoutRunning: false,
        setupSource: (helios) => {
          helios.edgeTransparencyMode?.('weighted');
          helios.renderer?.graphLayer?.setEdgeRenderingMode?.('quad');
          helios.edgeOpacityBase?.(0);
          helios.edgeOpacityScale?.(0.5);
          helios.edgeFastRendering?.(true);
        },
      }),
      state: await collectState(page),
    });
    scenarios.push({
      name: 'edges-hidden-render-only',
      result: await runRafScenario(page, 'edges-hidden-render-only', {
        layoutRunning: false,
        setupSource: (helios) => {
          helios.edgeFastRendering?.(false);
          helios.edgeOpacityBase?.(0);
          helios.edgeOpacityScale?.(0);
        },
      }),
      state: await collectState(page),
    });
    const finalState = await collectState(page);
    const report = {
      schema: 'helios-web-next.1m-profile.v1',
      recordedAt: new Date().toISOString(),
      machine: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuModel: os.cpus()?.[0]?.model ?? null,
        cpuCount: os.cpus()?.length ?? null,
        totalMemoryBytes: os.totalmem(),
      },
      config: {
        nodeCount: NODE_COUNT,
        sampleMs: SAMPLE_MS,
        warmupMs: WARMUP_MS,
        manualSteps: MANUAL_STEPS,
        url,
        chromeArgs,
      },
      outputDir,
      load: loadResult,
      initial,
      manualGpu,
      scenarios,
      finalState,
    };
    await writeJson('profile-report.json', report);
    console.log(JSON.stringify({
      outputDir,
      renderer: initial.renderer,
      webglRenderer: initial.webglRenderer,
      loadReadyMs: Math.round(loadResult.readyMs),
      manualGpu: {
        layoutAvgMs: manualGpu.layoutStepGpuCompleteMs.avg,
        renderAvgMs: manualGpu.renderFrameGpuCompleteMs.avg,
      },
      scenarios: scenarios.map((scenario) => ({
        name: scenario.name,
        renderFps: scenario.result.renderFps,
        rafFps: scenario.result.rafFps,
        layoutFrames: scenario.result.layoutFrames,
        queueDrainMs: scenario.result.queueDrainMs,
        perfSummary: scenario.result.perfSummary,
      })),
    }, null, 2));
  } finally {
    await browser?.close().catch(() => {});
    server.kill('SIGTERM');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
