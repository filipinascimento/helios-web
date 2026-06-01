import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.describe.configure({ timeout: 90000 });

async function waitForHelios(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  }, null, { timeout: 60000 });
  const diagnostics = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
  if (diagnostics?.error) throw new Error(`fixture failed: ${diagnostics.error}`);
  await page.waitForFunction(async () => {
    const helios = window.__helios;
    if (!helios?.ready) return false;
    await helios.ready;
    await helios.persistence?.sessionController?.ready?.();
    return Boolean(window.__heliosUI ?? helios.ui);
  }, null, { timeout: 60000 });
}

function panel(page, id) {
  return page.locator(`.helios-ui-panel[data-panel-id="${id}"]`).first();
}

function sessionUrl(sessionId, nodes = 180) {
  const params = new URLSearchParams({
    renderer: 'webgl',
    layout: 'none',
    mode: '2d',
    nodes: String(nodes),
    session: '1',
    restoreNetwork: '1',
    networkFormat: 'xnet',
    sessionId,
  });
  return `/?${params.toString()}`;
}

async function writeNetworkFile(page, testInfo) {
  await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=64&session=0');
  await waitForHelios(page);
  const bytes = await page.evaluate(async () => {
    const blob = await window.__helios.saveNetwork('xnet', { output: 'blob' });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const filePath = testInfo.outputPath('loaded-network.xnet');
  await fs.writeFile(filePath, Buffer.from(bytes));
  return filePath;
}

async function collectState(page, sessionId) {
  return page.evaluate(async (id) => {
    const helios = window.__helios;
    const controller = helios.persistence?.sessionController ?? null;
    const manifest = controller?.loadManifest?.(id) ?? null;
    const storedSession = await helios.persistence?.getSession?.(id);
    const pose = helios.cameraPose?.() ?? {};
    return {
      nodeCount: helios.network?.nodeCount ?? 0,
      shaded: helios.shadedEnabled?.() ?? null,
      cameraControls: helios.cameraControls?.() ?? {},
      cameraPose: {
        mode: pose.mode,
        projection: pose.projection,
        zoom: pose.zoom,
        pan2D: Array.from(pose.pan2D ?? []),
      },
      status: helios.persistence?.persistenceStatus?.() ?? null,
      manifest,
      storedSession: storedSession
        ? {
            id: storedSession.id,
            networkFormat: storedSession.payload?.networkData?.format ?? null,
            networkBytes: storedSession.payload?.networkData?.data?.byteLength
              ?? storedSession.payload?.networkData?.data?.length
              ?? 0,
          }
        : null,
    };
  }, sessionId);
}

async function performInterfaceChanges(page) {
  const scenePanel = panel(page, 'helios-ui-demo');
  await expect(scenePanel).toBeVisible();
  await scenePanel.getByRole('button', { name: 'Appearance' }).click();

  const shadedToggle = scenePanel.locator('[role="switch"][aria-label="Shaded"]').first();
  await expect(shadedToggle).toBeVisible();
  if ((await shadedToggle.getAttribute('aria-checked')) !== 'true') await shadedToggle.click();

  const cameraPanel = panel(page, 'helios-ui-camera');
  await expect(cameraPanel).toBeVisible();
  const autoFitToggle = cameraPanel.locator('[role="switch"][aria-label="Auto fit"]').first();
  await expect(autoFitToggle).toBeVisible();
  if ((await autoFitToggle.getAttribute('aria-checked')) !== 'false') await autoFitToggle.click();

  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + box.width * 0.42;
  const startY = box.y + box.height * 0.52;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 82, startY + 37, { steps: 8 });
  await page.mouse.up();
}

test('keeps a fresh main-example session usable after an immediate reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-immediate-reload-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(sessionId, 180));
  await waitForHelios(page);
  const before = await collectState(page, sessionId);
  expect(before.nodeCount).toBe(180);
  expect(before.status?.sessionId).toBe(sessionId);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  const after = await collectState(page, sessionId);
  await testInfo.attach('immediate-reload-state', {
    body: JSON.stringify({ before, after }, null, 2),
    contentType: 'application/json',
  });
  expect(after.nodeCount).toBe(180);
  expect(after.status?.sessionId).toBe(sessionId);
  expect(after.status?.networkData?.status ?? 'idle').not.toBe('dirty');
});

test('restores interface and camera changes after changing controls then immediately reloading', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-change-reload-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(sessionId, 180));
  await waitForHelios(page);
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount)).toBe(180);

  await performInterfaceChanges(page);
  const changed = await collectState(page, sessionId);
  expect(changed.shaded).toBe(true);
  expect(changed.cameraControls.autoFit).toBe(false);
  expect(Math.hypot(...changed.cameraPose.pan2D)).toBeGreaterThan(1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);

  const restored = await collectState(page, sessionId);
  await testInfo.attach('change-then-immediate-reload-state', {
    body: JSON.stringify({ changed, restored }, null, 2),
    contentType: 'application/json',
  });
  expect(restored.nodeCount).toBe(180);
  expect(restored.shaded).toBe(true);
  expect(restored.cameraControls.autoFit).toBe(false);
  expect(restored.status.overrideCount).toBeGreaterThan(0);
  expect(restored.cameraPose.zoom).toBeCloseTo(changed.cameraPose.zoom, 3);
  expect(restored.cameraPose.pan2D[0]).toBeCloseTo(changed.cameraPose.pan2D[0], 1);
  expect(restored.cameraPose.pan2D[1]).toBeCloseTo(changed.cameraPose.pan2D[1], 1);
});

test('restores an opened network, interface controls, and panned camera after reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-persistence-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const networkFile = await writeNetworkFile(page, testInfo);

  await page.goto(sessionUrl(sessionId, 180));
  await waitForHelios(page);
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount)).toBe(180);

  const dataPanel = panel(page, 'helios-ui-data');
  await expect(dataPanel).toBeVisible();
  await dataPanel.locator('input[type="file"]').setInputFiles(networkFile);
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount)).toBe(64);

  await performInterfaceChanges(page);
  await page.waitForTimeout(400);

  const beforeReload = await page.evaluate(async () => {
    const helios = window.__helios;
    await helios.persistence.flush({
      includeNetwork: true,
      network: { format: 'xnet' },
      snapshotLayoutRuntime: false,
    });
    return true;
  });
  expect(beforeReload).toBe(true);

  const saved = await collectState(page, sessionId);
  await testInfo.attach('saved-interface-persistence-state', {
    body: JSON.stringify(saved, null, 2),
    contentType: 'application/json',
  });
  expect(saved.nodeCount).toBe(64);
  expect(saved.shaded).toBe(true);
  expect(saved.cameraControls.autoFit).toBe(false);
  expect(Math.hypot(...saved.cameraPose.pan2D)).toBeGreaterThan(1);
  expect(saved.status.networkData.status).toBe('saved');
  expect(saved.storedSession.networkFormat).toBe('xnet');
  expect(saved.storedSession.networkBytes).toBeGreaterThan(100);

  await page.goto('/tests/fixtures/blank.html');
  await page.goto(sessionUrl(sessionId, 220));
  await waitForHelios(page);
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount)).toBe(64);

  const restored = await collectState(page, sessionId);
  await testInfo.attach('restored-interface-persistence-state', {
    body: JSON.stringify(restored, null, 2),
    contentType: 'application/json',
  });
  expect(restored.nodeCount).toBe(64);
  expect(restored.shaded).toBe(true);
  expect(restored.cameraControls.autoFit).toBe(false);
  expect(restored.status.overrideCount).toBeGreaterThan(0);
  expect(restored.status.networkData.status).toBe('saved');
  expect(restored.storedSession.networkFormat).toBe('xnet');
  expect(restored.storedSession.networkBytes).toBeGreaterThan(100);
  expect(restored.cameraPose.mode).toBe(saved.cameraPose.mode);
  expect(restored.cameraPose.projection).toBe(saved.cameraPose.projection);
  expect(restored.cameraPose.zoom).toBeCloseTo(saved.cameraPose.zoom, 3);
  expect(restored.cameraPose.pan2D[0]).toBeCloseTo(saved.cameraPose.pan2D[0], 1);
  expect(restored.cameraPose.pan2D[1]).toBeCloseTo(saved.cameraPose.pan2D[1], 1);
});
