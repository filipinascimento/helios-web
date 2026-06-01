import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_NODE_COUNTS = [10_000, 100_000, 1_000_000];
const DEFAULT_HISTORY_FILE = path.join(REPO_ROOT, 'artifacts/performance-history/helios-main-example.jsonl');

const enabled = process.env.HELIOS_PERF_HISTORY === '1';
const nodeCounts = parseNumberList(process.env.HELIOS_PERF_NODE_COUNTS, DEFAULT_NODE_COUNTS);
const sampleMs = parsePositiveInt(process.env.HELIOS_PERF_SAMPLE_MS, 5_000);
const warmupMs = parsePositiveInt(process.env.HELIOS_PERF_WARMUP_MS, 1_000);
const caseTimeoutMs = parsePositiveInt(process.env.HELIOS_PERF_CASE_TIMEOUT_MS, 10 * 60_000);
const historyFile = path.resolve(process.env.HELIOS_PERF_HISTORY_FILE || DEFAULT_HISTORY_FILE);
const latestFile = historyFile.endsWith('.jsonl')
  ? historyFile.replace(/\.jsonl$/, '.latest.json')
  : `${historyFile}.latest.json`;

test.describe.configure({ timeout: parsePositiveInt(process.env.HELIOS_PERF_TIMEOUT_MS, 45 * 60_000) });

function parsePositiveInt(raw, fallback) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function parseNumberList(raw, fallback) {
  if (!raw) return fallback;
  const values = String(raw)
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.floor(value));
  return values.length ? values : fallback;
}

function git(args, fallback = null) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch (_) {
    return fallback;
  }
}

function buildMainExampleUrl(nodeCount) {
  const params = new URLSearchParams({ nodes: String(nodeCount) });
  params.set('renderer', process.env.HELIOS_PERF_RENDERER || 'webgpu');
  if (process.env.HELIOS_PERF_LAYOUT) params.set('layout', process.env.HELIOS_PERF_LAYOUT);
  if (process.env.HELIOS_PERF_MODE) params.set('mode', process.env.HELIOS_PERF_MODE);
  if (process.env.HELIOS_PERF_DATASET) params.set('dataset', process.env.HELIOS_PERF_DATASET);
  return `/?${params.toString()}`;
}

function currentMachineInfo() {
  const cpus = os.cpus() ?? [];
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpuModel: cpus[0]?.model ?? null,
    cpuCount: cpus.length,
    totalMemoryBytes: os.totalmem(),
  };
}

async function waitForMainExample(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  }, null, { timeout: caseTimeoutMs });
  const diagnostics = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
  if (diagnostics?.error) throw new Error(`main example failed: ${diagnostics.error}`);
  await page.waitForFunction(async () => {
    const helios = window.__helios;
    if (!helios?.ready) return false;
    await helios.ready;
    return Boolean(window.__heliosUI);
  }, null, { timeout: caseTimeoutMs });
  return diagnostics;
}

async function collectPageInfo(page) {
  return page.evaluate(() => {
    const helios = window.__helios;
    const layout = typeof helios?.layout === 'function' ? helios.layout() : null;
    const positions = helios?.positions?.() ?? null;
    const renderer = helios?.renderer ?? null;
    const gl = (() => {
      try {
        return document.createElement('canvas').getContext('webgl2');
      } catch (_) {
        return null;
      }
    })();
    const debugInfo = gl?.getExtension?.('WEBGL_debug_renderer_info') ?? null;
    return {
      url: window.location.href,
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      screen: {
        width: window.screen?.width ?? null,
        height: window.screen?.height ?? null,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      browserHardwareConcurrency: navigator.hardwareConcurrency ?? null,
      browserDeviceMemory: navigator.deviceMemory ?? null,
      webgpuAvailable: Boolean(navigator.gpu),
      webglVendor: debugInfo && gl ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
      webglRenderer: debugInfo && gl ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
      diagnostics: window.__HELIOS_DIAGNOSTICS__ ?? null,
      datasetInfo: window.__HELIOS_DATASET_INFO__ ?? null,
      renderer: {
        className: renderer?.constructor?.name ?? null,
        deviceType: renderer?.device?.type ?? null,
        graphLayer: renderer?.graphLayer?.constructor?.name ?? null,
      },
      layout: {
        className: layout?.constructor?.name ?? null,
        state: helios?.scheduler?.getLayoutState?.() ?? null,
        alpha: Number(layout?.alpha ?? layout?.positionDelegate?.alpha ?? NaN),
      },
      positions: {
        source: positions?.source ?? null,
        hasDelegate: Boolean(positions?.delegate),
        delegateClassName: positions?.delegate?.constructor?.name ?? null,
        delegateExecutionMode: positions?.delegate?._webgl?.getExecutionMode?.() ?? null,
      },
      graph: {
        nodes: helios?.network?.nodeCount ?? null,
        edges: helios?.network?.edgeCount ?? null,
      },
      counters: { ...(helios?.counters ?? {}) },
    };
  });
}

async function setLayoutRunning(page, running) {
  await page.evaluate((nextRunning) => {
    const helios = window.__helios;
    helios.performanceMonitor?.setEnabled?.(true);
    helios.performanceMonitor?.samples?.clear?.();
    if (nextRunning) {
      helios.startLayout?.('performance-history');
      helios.layout?.()?.reheat?.('performance-history');
    } else {
      helios.stopLayout?.('performance-history');
      helios.requestRender?.();
    }
  }, running);
  await page.waitForTimeout(warmupMs);
}

async function measureFrames(page, label) {
  return page.evaluate(async ({ label: sampleLabel, durationMs }) => {
    const helios = window.__helios;
    const monitor = helios.performanceMonitor ?? null;
    monitor?.setEnabled?.(true);
    monitor?.samples?.clear?.();
    const startCounters = { ...(helios.counters ?? {}) };
    const startRenderFrames = Number(startCounters.renderFrames ?? 0);
    const startGeometryFrames = Number(startCounters.geometryFrames ?? 0);
    const start = performance.now();
    let previous = null;
    let rafFrames = 0;
    const intervals = [];

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

    const end = performance.now();
    const actualDurationMs = end - start;
    const endCounters = { ...(helios.counters ?? {}) };
    const renderFrames = Number(endCounters.renderFrames ?? 0) - startRenderFrames;
    const geometryFrames = Number(endCounters.geometryFrames ?? 0) - startGeometryFrames;
    const sorted = intervals.slice().sort((a, b) => a - b);
    const quantile = (q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] : null;
    return {
      label: sampleLabel,
      durationMs: actualDurationMs,
      rafFrames,
      rafFps: rafFrames / (actualDurationMs / 1000),
      renderFrames,
      renderFps: renderFrames / (actualDurationMs / 1000),
      geometryFrames,
      frameIntervalMs: {
        avg: intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, intervals.length),
        p50: quantile(0.50),
        p95: quantile(0.95),
        max: sorted.length ? sorted[sorted.length - 1] : null,
      },
      performanceSummary: monitor?.getSummary?.() ?? {},
      layoutState: helios.scheduler?.getLayoutState?.() ?? null,
      counters: endCounters,
    };
  }, { label, durationMs: sampleMs });
}

async function measureMouseAction(page, name, action) {
  const beforeFrames = await page.evaluate(() => window.__helios?.counters?.renderFrames ?? 0);
  const started = performance.now();
  await action();
  const actionMs = performance.now() - started;
  let nextRenderMs = null;
  try {
    await page.waitForFunction((before) => (window.__helios?.counters?.renderFrames ?? 0) > before, beforeFrames, { timeout: 5_000 });
    nextRenderMs = performance.now() - started;
  } catch (_) {
    nextRenderMs = null;
  }
  const afterFrames = await page.evaluate(() => window.__helios?.counters?.renderFrames ?? 0);
  return {
    name,
    actionMs,
    nextRenderMs,
    renderFrames: afterFrames - beforeFrames,
  };
}

async function measureBrowserAction(page, name, body) {
  return page.evaluate(async ({ actionName, bodySource }) => {
    const fn = new Function(`return (${bodySource});`)();
    const helios = window.__helios;
    const beforeFrames = helios?.counters?.renderFrames ?? 0;
    const started = performance.now();
    const result = await fn(helios);
    await new Promise((resolve) => {
      const deadline = performance.now() + 5_000;
      const tick = () => {
        if ((helios?.counters?.renderFrames ?? 0) > beforeFrames || performance.now() >= deadline) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
    return {
      name: actionName,
      actionMs: performance.now() - started,
      renderFrames: (helios?.counters?.renderFrames ?? 0) - beforeFrames,
      result,
    };
  }, { actionName: name, bodySource: body.toString() });
}

async function measureActions(page) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + box.width * 0.44;
  const startY = box.y + box.height * 0.52;
  return [
    await measureMouseAction(page, 'pan-drag', async () => {
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX + 96, startY + 42, { steps: 8 });
      await page.mouse.up();
    }),
    await measureMouseAction(page, 'wheel-zoom', async () => {
      await page.mouse.move(startX, startY);
      await page.mouse.wheel(0, -450);
    }),
    await measureBrowserAction(page, 'frame-network', (helios) => helios.frameNetwork?.({ animate: false, resetOrientation: false }) ?? false),
  ];
}

async function measureScenario(page, running) {
  await setLayoutRunning(page, running);
  const before = await collectPageInfo(page);
  const frameStats = await measureFrames(page, running ? 'layout-running' : 'layout-stopped');
  const actions = await measureActions(page);
  const after = await collectPageInfo(page);
  return {
    layoutRunning: running,
    before,
    frameStats,
    actions,
    after,
  };
}

async function runNodeCountCase(browser, nodeCount, browserName) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error?.stack ?? error?.message ?? String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  const started = performance.now();
  try {
    const url = buildMainExampleUrl(nodeCount);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: caseTimeoutMs });
    const diagnostics = await waitForMainExample(page);
    const readyMs = performance.now() - started;
    const initial = await collectPageInfo(page);
    const scenarios = [
      await measureScenario(page, true),
      await measureScenario(page, false),
    ];
    return {
      nodeCount,
      browserName,
      url,
      readyMs,
      diagnostics,
      initial,
      scenarios,
      pageErrors,
      status: 'ok',
    };
  } catch (error) {
    return {
      nodeCount,
      browserName,
      readyMs: performance.now() - started,
      pageErrors,
      status: 'error',
      error: error?.stack ?? error?.message ?? String(error),
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function appendHistory(entry) {
  await fs.mkdir(path.dirname(historyFile), { recursive: true });
  await fs.appendFile(historyFile, `${JSON.stringify(entry)}\n`);
  await writeLatestHistory(entry);
}

async function writeLatestHistory(entry) {
  await fs.mkdir(path.dirname(latestFile), { recursive: true });
  await fs.writeFile(latestFile, `${JSON.stringify(entry, null, 2)}\n`);
}

test.describe('main example performance history', () => {
  test.skip(!enabled, 'Set HELIOS_PERF_HISTORY=1 to run the machine-specific 10k/100k/1M performance benchmark.');

  test('records default-configuration visualization performance history @webgpu', async ({ browser, browserName }, testInfo) => {
    const entry = {
      schema: 'helios-web-next.performance-history.v1',
      recordedAt: new Date().toISOString(),
      machine: currentMachineInfo(),
      build: {
        commit: git(['rev-parse', 'HEAD']),
        shortCommit: git(['rev-parse', '--short', 'HEAD']),
        branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
        dirty: Boolean(git(['status', '--porcelain'], '')),
      },
      config: {
        nodeCounts,
        sampleMs,
        warmupMs,
        defaultUrl: '/',
        rendererOverride: process.env.HELIOS_PERF_RENDERER ?? 'webgpu',
        layoutOverride: process.env.HELIOS_PERF_LAYOUT ?? null,
        modeOverride: process.env.HELIOS_PERF_MODE ?? null,
        datasetOverride: process.env.HELIOS_PERF_DATASET ?? null,
      },
      status: 'running',
      cases: [],
    };

    try {
      for (const nodeCount of nodeCounts) {
        console.log(`[perf-history] start ${nodeCount.toLocaleString()} nodes`);
        const result = await runNodeCountCase(browser, nodeCount, browserName);
        entry.cases.push(result);
        entry.status = 'running';
        await writeLatestHistory(entry);
        console.log(`[perf-history] ${result.status} ${nodeCount.toLocaleString()} nodes in ${Math.round(result.readyMs)}ms`);
        await testInfo.attach(`performance-${nodeCount}`, {
          body: JSON.stringify(result, null, 2),
          contentType: 'application/json',
        });
        expect(result.status, result.error ?? '').toBe('ok');
      }
      entry.status = 'complete';
    } finally {
      await appendHistory(entry);
      await testInfo.attach('performance-history-entry', {
        body: JSON.stringify(entry, null, 2),
        contentType: 'application/json',
      });
      await testInfo.attach('performance-history-path', {
        body: historyFile,
        contentType: 'text/plain',
      });
    }
  });
});
