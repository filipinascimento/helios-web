import { test, expect } from '@playwright/test';
import {
  installStorageInstrumentation,
  readStorageInstrumentation,
  resetStorageInstrumentation,
  settleAndResetStorageInstrumentation,
  waitForHelios,
} from './helpers/storageInstrumentation.js';

test.describe.configure({ timeout: 120000 });

function count(snapshot, label) {
  return snapshot?.counters?.[label] ?? 0;
}

function recordsFor(snapshot, label, reasons = null) {
  return (snapshot?.records ?? []).filter((record) => {
    if (record.label !== label) return false;
    if (!reasons) return true;
    return reasons.has(record.reason);
  });
}

function maxDurationForPath(snapshot, label, path) {
  const records = (snapshot?.records ?? [])
    .filter((record) => record.label === label && (path == null || record.path === path));
  return records.reduce((max, record) => Math.max(max, Number(record.durationMs) || 0), 0);
}

async function installCounters(page) {
  await installStorageInstrumentation(page);
}

async function resetCounters(page) {
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const storage = window.__helios.storage;
    await storage.flush({
      id: storage.sessionId,
      includeNetwork: false,
      captureThumbnail: false,
      snapshotLayoutRuntime: false,
      reason: 'large-grid-clear-pending',
    });
  });
  await resetStorageInstrumentation(page);
}

async function readCounters(page) {
  return readStorageInstrumentation(page);
}

test('node size slider updates live state without synchronous storage snapshot fan-out', async ({ page }) => {
  await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=240&session=1&restoreNetwork=0');
  await waitForHelios(page);
  await installCounters(page);
  await resetCounters(page);

  const result = await page.evaluate(async () => {
    const rows = Array.from(document.querySelectorAll('.helios-ui-row'));
    const row = rows.find((entry) => entry.textContent?.includes('Node Size Scale'));
    const slider = row?.querySelector('input[type="range"]');
    if (!slider) throw new Error('Node Size Scale slider not found');
    const values = [1.1, 1.2, 1.3, 1.4, 1.5, 1.6];
    for (const value of values) {
      slider.value = String(value);
      slider.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 10; i += 1) {
      if (Math.abs((window.__helios.behavior?.appearance?.nodeSizeScale?.() ?? 0) - 1.6) < 1e-6) break;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return {
      liveValue: window.__helios.behavior?.appearance?.nodeSizeScale?.(),
      storageValue: window.__helios.states.get('appearance.nodeStyle.sizeScale'),
      counters: window.__heliosStorageInstrumentation.snapshot(),
    };
  });

  expect(result.liveValue).toBeCloseTo(1.6, 6);
  expect(result.storageValue).toBeCloseTo(1.6, 6);
  expect(result.counters.stateSetByPath['appearance.nodeStyle.sizeScale']).toBeLessThanOrEqual(7);
  expect(maxDurationForPath(result.counters, 'states.set', 'appearance.nodeStyle.sizeScale')).toBeLessThan(8);
  expect(result.counters.storageSetByPath['appearance.nodeStyle.sizeScale'] ?? 0).toBe(0);
  expect(count(result.counters, 'helios.serializeVisualizationState')).toBe(0);
  expect(count(result.counters, 'helios.serializeVisualizationStateAsync')).toBe(0);
  expect(count(result.counters, 'storage.captureSessionThumbnail')).toBe(0);
  expect(count(result.counters, 'helios.savePortableNetwork')).toBe(0);

  await page.waitForTimeout(260);
  const afterDebounce = await readCounters(page);
  expect(count(afterDebounce, 'helios.serializeVisualizationState')).toBe(0);
  expect(count(afterDebounce, 'helios.serializeVisualizationStateAsync')).toBe(0);
  expect(count(afterDebounce, 'storage.captureSessionThumbnail')).toBe(0);
  expect(count(afterDebounce, 'helios.savePortableNetwork')).toBe(0);
});

test('session=0 node size slider updates live state immediately without storage writes', async ({ page }) => {
  await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=240&session=0&restoreNetwork=0');
  await waitForHelios(page);
  await installCounters(page);
  await resetStorageInstrumentation(page);

  const result = await page.evaluate(async () => {
    const row = Array.from(document.querySelectorAll('.helios-ui-row'))
      .find((entry) => entry.textContent?.includes('Node Size Scale'));
    const slider = row?.querySelector('input[type="range"]');
    if (!slider) throw new Error('Node Size Scale slider not found');
    slider.value = '1.8';
    slider.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      liveValue: window.__helios.behavior?.appearance?.nodeSizeScale?.(),
      stateValue: window.__helios.states.get('appearance.nodeStyle.sizeScale'),
      storageValue: window.__helios.states.get('appearance.nodeStyle.sizeScale'),
      storageCapabilities: window.__helios.storage.capabilities,
      counters: window.__heliosStorageInstrumentation.snapshot(),
    };
  });

  expect(result.liveValue).toBeCloseTo(1.8, 6);
  expect(result.stateValue).toBeCloseTo(1.8, 6);
  expect(result.storageValue).toBeCloseTo(1.8, 6);
  expect(result.storageCapabilities.sessions).toBe(false);
  expect(result.counters.stateSetByPath['appearance.nodeStyle.sizeScale']).toBe(1);
  expect(maxDurationForPath(result.counters, 'states.set', 'appearance.nodeStyle.sizeScale')).toBeLessThan(8);
  expect(result.counters.storageSetByPath['appearance.nodeStyle.sizeScale'] ?? 0).toBe(0);
  expect(count(result.counters, 'storage.saveSession')).toBe(0);
  expect(count(result.counters, 'storage.serializeSessionSnapshot')).toBe(0);
  expect(count(result.counters, 'storage.captureSessionThumbnail')).toBe(0);
  expect(count(result.counters, 'helios.serializeVisualizationState')).toBe(0);
  expect(count(result.counters, 'helios.savePortableNetwork')).toBe(0);
});

test('background color input updates live state without per-input serialization', async ({ page }) => {
  await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=240&session=1&restoreNetwork=0');
  await waitForHelios(page);
  await installCounters(page);
  await resetCounters(page);

  const result = await page.evaluate(async () => {
    const toHex = (value) => {
      if (typeof value === 'string') return value.toLowerCase();
      if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        return `#${Array.from(value).slice(0, 3).map((part) => Math.round(Math.max(0, Math.min(1, Number(part) || 0)) * 255).toString(16).padStart(2, '0')).join('')}`;
      }
      return String(value ?? '').toLowerCase();
    };
    for (const value of ['#112233', '#223344', '#334455']) {
      window.__helios.states.set('appearance.background', `${value}ff`, {
        source: 'ui',
        reason: 'background',
      });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      liveValue: toHex(window.__helios.behavior?.appearance?.background?.()),
      storageValue: toHex(window.__helios.states.get('appearance.background')),
      counters: window.__heliosStorageInstrumentation.snapshot(),
    };
  });

  expect(result.liveValue).toContain('334455');
  expect(result.storageValue).toContain('334455');
  expect(result.counters.stateSetByPath['appearance.background']).toBeLessThanOrEqual(4);
  expect(maxDurationForPath(result.counters, 'states.set', 'appearance.background')).toBeLessThan(8);
  expect(result.counters.storageSetByPath['appearance.background'] ?? 0).toBe(0);
  expect(count(result.counters, 'helios.serializeVisualizationState')).toBe(0);
  expect(count(result.counters, 'helios.serializeVisualizationStateAsync')).toBe(0);
  expect(count(result.counters, 'storage.captureSessionThumbnail')).toBe(0);
  expect(count(result.counters, 'helios.savePortableNetwork')).toBe(0);

  await page.waitForTimeout(260);
  const afterDebounce = await readCounters(page);
  expect(count(afterDebounce, 'helios.serializeVisualizationState')).toBe(0);
  expect(count(afterDebounce, 'helios.serializeVisualizationStateAsync')).toBe(0);
  expect(count(afterDebounce, 'storage.captureSessionThumbnail')).toBe(0);
  expect(count(afterDebounce, 'helios.savePortableNetwork')).toBe(0);
});

test('large grid hot controls and camera interaction coalesce storage autosave after idle', async ({ page }) => {
  test.setTimeout(180000);
  const workspaceId = `large-grid-${Date.now()}`;
  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=100000&dataset=grid&session=1&restoreNetwork=0&workspaceId=${workspaceId}`);
  await waitForHelios(page, 150000);
  await installCounters(page);
  await page.evaluate(() => {
    window.__helios.storage.configureSession({
      autosyncInteractionIdleMs: 30000,
      sessionThumbnail: {
        enabled: true,
        autosaveMinIntervalMs: false,
        maxWidth: 96,
        maxHeight: 54,
      },
    });
  });
  await settleAndResetStorageInstrumentation(page);

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box.x + box.width * 0.45;
  const y = box.y + box.height * 0.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y + 45, { steps: 10 });
  await page.mouse.up();

  const immediate = await page.evaluate(async () => {
    const rows = Array.from(document.querySelectorAll('.helios-ui-row'));
    const row = rows.find((entry) => entry.textContent?.includes('Node Size Scale'));
    const slider = row?.querySelector('input[type="range"]');
    if (!slider) throw new Error('Node Size Scale slider not found');
    for (const value of [1.05, 1.1, 1.15, 1.2, 1.25, 1.3]) {
      slider.value = String(value);
      slider.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    for (const value of ['#101820ff', '#203040ff', '#304860ff']) {
      window.__helios.states.set('appearance.background', value, {
        source: 'ui',
        reason: 'large-grid-background',
      });
    }
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return window.__heliosStorageInstrumentation.snapshot();
  });

  const hotReasons = new Set(['camera:move', 'camera:control-change', 'control', 'large-grid-background']);
  expect(recordsFor(immediate, 'storage.saveSession', hotReasons)).toHaveLength(0);
  expect(recordsFor(immediate, 'storage.serializeSessionSnapshot', hotReasons)).toHaveLength(0);
  expect(count(immediate, 'storage.captureSessionThumbnail')).toBe(0);
  expect(count(immediate, 'helios.savePortableNetwork')).toBe(0);
  expect(recordsFor(immediate, 'helios.serializeVisualizationState', hotReasons)).toHaveLength(0);
  expect(recordsFor(immediate, 'helios.serializeVisualizationStateAsync', hotReasons)).toHaveLength(0);
  expect(count(immediate, 'helios.snapshotDelegatePositions')).toBe(0);
  expect(count(immediate, 'delegate.snapshotNodePositions')).toBe(0);

  await page.evaluate(async () => {
    const storage = window.__helios.storage;
    await storage.flush({
      id: storage.sessionId,
      includeNetwork: false,
      captureThumbnail: false,
      snapshotLayoutRuntime: false,
      reason: 'large-grid-clear-pending',
    });
    storage.configureSession({
      autosyncInteractionIdleMs: 750,
      sessionThumbnail: {
        enabled: true,
        autosaveMinIntervalMs: false,
        maxWidth: 96,
        maxHeight: 54,
      },
    });
  });
  await resetStorageInstrumentation(page);
  await page.evaluate(() => {
    for (const value of [0.85, 0.8, 0.75, 0.7]) {
      window.__helios.states.set('appearance.edgeStyle.opacityScale', value, {
        source: 'ui',
        reason: 'large-grid-coalesce-check',
      });
    }
  });
  await page.waitForTimeout(4800);
  const afterIdle = await readCounters(page);
  expect(count(afterIdle, 'storage.saveSession')).toBe(0);
  expect(count(afterIdle, 'storage.serializeSessionSnapshot')).toBe(0);
  expect(count(afterIdle, 'SessionStore.put')).toBe(1);
  expect(count(afterIdle, 'helios.serializeVisualizationStateAsync')).toBe(0);
  expect(count(afterIdle, 'helios.savePortableNetwork')).toBe(0);
  expect(count(afterIdle, 'storage.captureSessionThumbnail')).toBe(0);
  expect(count(afterIdle, 'helios.snapshotDelegatePositions')).toBe(0);
  expect(count(afterIdle, 'delegate.snapshotNodePositions')).toBe(0);
});

test('browser autosave thumbnail policy respects interaction, idle, and throttle gates', async ({ page }) => {
  const workspaceId = `thumbnail-policy-${Date.now()}`;
  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=600&dataset=grid&session=1&restoreNetwork=0&workspaceId=${workspaceId}`);
  await waitForHelios(page);
  await installCounters(page);
  await page.evaluate(async () => {
    const storage = window.__helios.storage;
    storage.configureSession({
      autosyncInteractionIdleMs: 500,
      autosyncMinIntervalMs: 0,
      sessionThumbnail: {
        enabled: true,
        autosaveMinIntervalMs: 0,
        maxWidth: 64,
        maxHeight: 36,
      },
    });
    await storage.flush({
      id: storage.sessionId,
      includeNetwork: false,
      captureThumbnail: true,
      snapshotLayoutRuntime: false,
      reason: 'thumbnail-policy-baseline',
    });
  });
  const baseline = await page.evaluate(() => window.__helios.storage.getSession(window.__helios.storage.sessionId));
  expect(baseline.payload.thumbnail?.capturedAt).toBeTruthy();
  let baselineThumbnailCapturedAt = baseline.payload.thumbnail.capturedAt;

  await resetStorageInstrumentation(page);
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.evaluate(() => {
    window.__helios.states.set('appearance.nodeStyle.sizeScale', 1.25, {
      source: 'ui',
      reason: 'thumbnail-policy-active-interaction',
    });
  });
  await page.waitForTimeout(1200);
  const activeInteraction = await readCounters(page);
  expect(count(activeInteraction, 'storage.saveSession')).toBe(0);
  expect(count(activeInteraction, 'storage.captureSessionThumbnail')).toBe(0);
  await page.mouse.up();
  await expect.poll(async () => {
    const snapshot = await readCounters(page);
    return count(snapshot, 'storage.captureSessionThumbnail');
  }, { timeout: 5000 }).toBe(1);
  await page.waitForFunction(async (capturedAt) => {
    const session = await window.__helios.storage.getSession(window.__helios.storage.sessionId);
    return Number(session?.payload?.thumbnail?.capturedAt) > Number(capturedAt);
  }, baselineThumbnailCapturedAt, { timeout: 5000 });
  baselineThumbnailCapturedAt = await page.evaluate(async () => {
    const session = await window.__helios.storage.getSession(window.__helios.storage.sessionId);
    return session?.payload?.thumbnail?.capturedAt;
  });

  await page.evaluate(() => {
    window.__helios.storage.configureSession({
      autosyncInteractionIdleMs: 250,
      autosyncMinIntervalMs: 0,
      sessionThumbnail: {
        enabled: true,
        autosaveMinIntervalMs: 500,
        maxWidth: 64,
        maxHeight: 36,
      },
    });
  });
  await page.waitForTimeout(650);
  await resetStorageInstrumentation(page);
  await page.evaluate(() => {
    window.__helios.states.set('appearance.edgeStyle.opacityScale', 0.7, {
      source: 'ui',
      reason: 'thumbnail-policy-idle',
    });
  });
  await page.waitForTimeout(1000);
  const idleCapture = await readCounters(page);
  expect(count(idleCapture, 'storage.captureSessionThumbnail')).toBe(1);
  await page.waitForFunction(async (capturedAt) => {
    const session = await window.__helios.storage.getSession(window.__helios.storage.sessionId);
    return Number(session?.payload?.thumbnail?.capturedAt) > Number(capturedAt);
  }, baselineThumbnailCapturedAt, { timeout: 5000 });
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    window.__helios.storage.configureSession({
      autosyncInteractionIdleMs: 250,
      autosyncMinIntervalMs: 0,
      sessionThumbnail: {
        enabled: true,
        autosaveMinIntervalMs: 30000,
        maxWidth: 64,
        maxHeight: 36,
      },
    });
  });
  const previousThumbnail = await page.evaluate(async () => {
    const session = await window.__helios.storage.getSession(window.__helios.storage.sessionId);
    return session.payload.thumbnail;
  });
  await resetStorageInstrumentation(page);
  await page.evaluate(() => {
    for (const value of [1.3, 1.35, 1.4]) {
      window.__helios.states.set('appearance.nodeStyle.sizeScale', value, {
        source: 'ui',
        reason: 'thumbnail-policy-throttle',
      });
    }
  });
  await page.waitForTimeout(1000);
  const throttled = await readCounters(page);
  const currentThumbnail = await page.evaluate(async () => {
    const session = await window.__helios.storage.getSession(window.__helios.storage.sessionId);
    return session.payload.thumbnail;
  });
  expect(count(throttled, 'storage.saveSession')).toBe(0);
  expect(count(throttled, 'SessionStore.put')).toBe(1);
  expect(count(throttled, 'storage.captureSessionThumbnail')).toBe(0);
  expect(currentThumbnail).toEqual(previousThumbnail);
});
