import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  installStorageInstrumentation,
  readStorageInstrumentation,
  settleAndResetStorageInstrumentation,
  waitForHelios,
} from './helpers/storageInstrumentation.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const enabled = process.env.HELIOS_STORAGE_PERF === '1';
const nodeCounts = parseNumberList(process.env.HELIOS_PERF_NODE_COUNTS, [100_000, 1_000_000]);
const sampleMs = parsePositiveInt(process.env.HELIOS_PERF_SAMPLE_MS, 4_000);
const caseTimeoutMs = parsePositiveInt(process.env.HELIOS_PERF_CASE_TIMEOUT_MS, 10 * 60_000);
const historyFile = path.resolve(
  process.env.HELIOS_STORAGE_PERF_HISTORY_FILE
    || path.join(REPO_ROOT, 'artifacts/performance-history/helios-storage-autosave.jsonl'),
);
const latestFile = historyFile.endsWith('.jsonl')
  ? historyFile.replace(/\.jsonl$/, '.latest.json')
  : `${historyFile}.latest.json`;

test.describe.configure({ timeout: parsePositiveInt(process.env.HELIOS_STORAGE_PERF_TIMEOUT_MS, 45 * 60_000) });

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

function count(snapshot, label) {
  return snapshot?.counters?.[label] ?? 0;
}

function buildUrl(spec, nodeCount) {
  const params = new URLSearchParams({
    renderer: process.env.HELIOS_PERF_RENDERER || 'webgpu',
    layout: process.env.HELIOS_PERF_LAYOUT || 'none',
    mode: spec.mode,
    nodes: String(nodeCount),
    dataset: spec.dataset,
    session: '1',
    restoreNetwork: '0',
    workspaceId: `storage-perf-${spec.dataset}-${nodeCount}-${Date.now()}`,
  });
  return `/?${params.toString()}`;
}

function summarizeIntervals(intervals) {
  const clean = intervals
    .map((entry) => Number(entry.deltaMs))
    .filter((value) => Number.isFinite(value));
  const sorted = clean.slice().sort((a, b) => a - b);
  const q = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] : null;
  return {
    count: clean.length,
    avg: clean.reduce((sum, value) => sum + value, 0) / Math.max(1, clean.length),
    p50: q(0.5),
    p95: q(0.95),
    max: sorted[sorted.length - 1] ?? null,
  };
}

async function measureStorageInteractionWindow(page) {
  return page.evaluate(async ({ durationMs }) => {
    const helios = window.__helios;
    const storage = helios.storage;
    const states = helios.states;
    storage.configureSession({
      autosyncInteractionIdleMs: 600,
      sessionThumbnail: {
        enabled: true,
        autosaveMinIntervalMs: 30000,
        maxWidth: 96,
        maxHeight: 54,
      },
    });
    window.__heliosStorageInstrumentation.reset();
    const frameIntervals = [];
    const startedAt = performance.now();
    let previous = null;
    let wrote = false;
    await new Promise((resolve) => {
      const tick = (now) => {
        if (previous != null) {
          frameIntervals.push({
            at: now,
            deltaMs: Math.max(0, now - previous),
          });
        }
        previous = now;
        helios.requestRender?.();
        if (!wrote && now - startedAt >= 300) {
          wrote = true;
          for (const value of [1.05, 1.1, 1.15, 1.2, 1.25, 1.3]) {
            states.set('appearance.nodeStyle.sizeScale', value, {
              source: 'ui',
              reason: 'storage-performance-hot-control',
            });
          }
          for (const value of ['#111827ff', '#1f2937ff', '#374151ff']) {
            states.set('appearance.background', value, {
              source: 'ui',
              reason: 'storage-performance-hot-control',
            });
          }
        }
        if (now - startedAt >= durationMs) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const storageSnapshot = window.__heliosStorageInstrumentation.snapshot();
    const storageWindows = storageSnapshot.records.map((record) => ({
      label: record.label,
      start: record.startedAt,
      end: record.endedAt,
      durationMs: record.durationMs,
    }));
    const stalls = frameIntervals
      .filter((entry) => entry.deltaMs > 50)
      .map((entry) => ({
        ...entry,
        nearbyStorageEvents: storageWindows.filter((record) => {
          const margin = 16;
          return entry.at >= record.start - margin && entry.at <= record.end + margin;
        }),
      }));
    return {
      frameIntervals,
      storageSnapshot,
      stalls,
      renderer: helios.renderer?.device?.type ?? helios.renderer?.constructor?.name ?? null,
      graph: {
        nodes: helios.network?.nodeCount ?? null,
        edges: helios.network?.edgeCount ?? null,
      },
      diagnostics: window.__HELIOS_DIAGNOSTICS__ ?? null,
      datasetInfo: window.__HELIOS_DATASET_INFO__ ?? null,
    };
  }, { durationMs: sampleMs });
}

async function runCase(browser, spec, nodeCount) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error?.stack ?? error?.message ?? String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  const url = buildUrl(spec, nodeCount);
  const startedAt = Date.now();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: caseTimeoutMs });
    await waitForHelios(page, caseTimeoutMs);
    await installStorageInstrumentation(page);
    await settleAndResetStorageInstrumentation(page);
    const measurement = await measureStorageInteractionWindow(page);
    const storage = measurement.storageSnapshot;
    return {
      status: 'ok',
      dataset: spec.dataset,
      mode: spec.mode,
      nodeCount,
      url,
      elapsedMs: Date.now() - startedAt,
      frameIntervalMs: summarizeIntervals(measurement.frameIntervals),
      storageCounters: storage.counters,
      storageRecords: storage.records,
      stalls: measurement.stalls,
      renderer: measurement.renderer,
      graph: measurement.graph,
      diagnostics: measurement.diagnostics,
      datasetInfo: measurement.datasetInfo,
      pageErrors,
    };
  } catch (error) {
    return {
      status: 'error',
      dataset: spec.dataset,
      mode: spec.mode,
      nodeCount,
      url,
      elapsedMs: Date.now() - startedAt,
      error: error?.stack ?? error?.message ?? String(error),
      pageErrors,
    };
  } finally {
    await context.close().catch(() => {});
  }
}

async function writeEntry(entry) {
  await fs.mkdir(path.dirname(historyFile), { recursive: true });
  await fs.writeFile(latestFile, `${JSON.stringify(entry, null, 2)}\n`);
  await fs.appendFile(historyFile, `${JSON.stringify(entry)}\n`);
}

test.describe('storage autosave performance correlation', () => {
  test.skip(!enabled, 'Set HELIOS_STORAGE_PERF=1 to run the optional storage/autosave performance path.');

  test('records storage events next to large-grid frame stalls @webgpu', async ({ browser }, testInfo) => {
    const datasets = [
      { dataset: 'grid', mode: '2d' },
      { dataset: 'grid3d', mode: '3d' },
    ];
    const entry = {
      schema: 'helios-web-next.storage-autosave-performance.v1',
      recordedAt: new Date().toISOString(),
      machine: {
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpuCount: os.cpus()?.length ?? 0,
        totalMemoryBytes: os.totalmem(),
      },
      config: {
        nodeCounts,
        sampleMs,
        renderer: process.env.HELIOS_PERF_RENDERER || 'webgpu',
        layout: process.env.HELIOS_PERF_LAYOUT || 'none',
        datasets,
      },
      cases: [],
      status: 'running',
    };

    try {
      for (const spec of datasets) {
        for (const nodeCount of nodeCounts) {
          const result = await runCase(browser, spec, nodeCount);
          entry.cases.push(result);
          await testInfo.attach(`storage-perf-${spec.dataset}-${nodeCount}`, {
            body: JSON.stringify(result, null, 2),
            contentType: 'application/json',
          });
          expect(result.status, result.error ?? '').toBe('ok');
          expect(result.renderer).toBe('webgpu');
          expect(count({ counters: result.storageCounters }, 'storage.saveSession')).toBeLessThanOrEqual(1);
          expect(count({ counters: result.storageCounters }, 'storage.serializeSessionSnapshot')).toBeLessThanOrEqual(1);
          expect(count({ counters: result.storageCounters }, 'helios.savePortableNetwork')).toBe(0);
          expect(count({ counters: result.storageCounters }, 'storage.captureSessionThumbnail')).toBe(0);
        }
      }
      entry.status = 'complete';
    } finally {
      await writeEntry(entry);
      await testInfo.attach('storage-performance-entry', {
        body: JSON.stringify(entry, null, 2),
        contentType: 'application/json',
      });
      await testInfo.attach('storage-performance-path', {
        body: historyFile,
        contentType: 'text/plain',
      });
    }
  });
});
