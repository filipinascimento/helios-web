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

async function waitForStoredSessionNetwork(page, sessionId) {
  await expect.poll(() => page.evaluate(async (id) => {
    const stored = await window.__helios.persistence.getSession(id);
    return stored?.payload?.networkData?.data?.byteLength
      ?? stored?.payload?.networkData?.data?.length
      ?? 0;
  }, sessionId), { timeout: 10000 }).toBeGreaterThan(100);
}

function panel(page, id) {
  return page.locator(`.helios-ui-panel[data-panel-id="${id}"]`).first();
}

function sessionUrl(sessionId, nodes = 180, workspaceId = sessionId) {
  const params = new URLSearchParams({
    renderer: 'webgl',
    layout: 'none',
    mode: '2d',
    nodes: String(nodes),
    session: '1',
    restoreNetwork: '1',
    maxSessionBytes: '0',
    sessionId,
    workspaceId,
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

async function panCanvas(page, dx = 82, dy = 37) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const startX = box.x + box.width * 0.42;
  const startY = box.y + box.height * 0.52;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 });
  await page.mouse.up();
}

async function collectAppearanceMapperState(page, sessionId) {
  return page.evaluate(async (id) => {
    const helios = window.__helios;
    const storedSession = await helios.persistence?.getSession?.(id);
    const nodeSize = helios.behavior?.mappers?.getSerializedChannelConfig?.('node', 'size')
      ?? helios.nodeMapper?.defaultMapper?.getChannel?.('size')
      ?? null;
    return {
      nodeCount: helios.network?.nodeCount ?? 0,
      edgeWidthScale: helios.edgeWidthScale?.() ?? null,
      edgeOpacityScale: helios.edgeOpacityScale?.() ?? null,
      nodeSize,
      themeStatus: helios.persistence?.keyStatus?.('ui.theme') ?? null,
      edgeWidthStatus: helios.persistence?.keyStatus?.('appearance.edgeStyle.widthScale') ?? null,
      storedNodeSize: storedSession?.payload?.behaviorState?.mappers?.options?.node?.mappers
        ? Object.values(storedSession.payload.behaviorState.mappers.options.node.mappers)
            .find((mapper) => mapper?.channels?.size)?.channels?.size
        : null,
    };
  }, sessionId);
}

async function collectDepthState(page, limit = 80) {
  return page.evaluate(async (sampleLimit) => {
    const helios = window.__helios;
    const nodeCount = Math.max(0, helios.network?.nodeCount ?? 0);
    const ids = Array.from({ length: Math.min(sampleLimit, nodeCount) }, (_, index) => index);
    const snapshot = ids.length > 0
      ? await helios.snapshotNodePositions(ids)
      : { positions: new Float32Array(), source: 'none' };
    const positions = snapshot?.positions ?? new Float32Array();
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 2; i < positions.length; i += 3) {
      const z = Number(positions[i]);
      if (!Number.isFinite(z)) continue;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    return {
      mode: helios.mode?.() ?? null,
      source: snapshot?.source ?? null,
      count: ids.length,
      zRange: Number.isFinite(minZ) && Number.isFinite(maxZ) ? maxZ - minZ : 0,
      maxAbsZ: Number.isFinite(minZ) && Number.isFinite(maxZ) ? Math.max(Math.abs(minZ), Math.abs(maxZ)) : 0,
      dimensionStatus: helios.persistence?.keyStatus?.('scene.dimension') ?? null,
    };
  }, limit);
}

async function collectStoredDepthState(page, sessionId) {
  return page.evaluate(async (id) => {
    const storedSession = await window.__helios.persistence?.getSession?.(id);
    const runtime = storedSession?.payload?.visualizationState?.payload?.layoutRuntimeState
      ?? storedSession?.payload?.layoutRuntimeState
      ?? null;
    const encoded = runtime?.positions ?? null;
    if (encoded?.encoding !== 'float32-base64' || typeof encoded.data !== 'string') {
      return {
        positionSource: runtime?.positionSource ?? null,
        zRange: 0,
        length: 0,
      };
    }
    const binary = atob(encoded.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const values = new Float32Array(bytes.buffer);
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 2; i < values.length; i += 3) {
      const z = Number(values[i]);
      if (!Number.isFinite(z)) continue;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    return {
      positionSource: runtime?.positionSource ?? null,
      mode: runtime?.mode ?? null,
      zRange: Number.isFinite(minZ) && Number.isFinite(maxZ) ? maxZ - minZ : 0,
      length: values.length,
    };
  }, sessionId);
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
  await expect.poll(() => page.evaluate(() => (
    window.__helios.persistence.status()?.networkData?.status ?? 'idle'
  )), { timeout: 10000 }).not.toBe('dirty');
  const after = await collectState(page, sessionId);
  await testInfo.attach('immediate-reload-state', {
    body: JSON.stringify({ before, after }, null, 2),
    contentType: 'application/json',
  });
  expect(after.nodeCount).toBe(180);
  expect(after.status?.sessionId).toBe(sessionId);
  expect(after.status?.networkData?.status ?? 'idle').not.toBe('dirty');
});

test('autosaves the current network for same-session reload without manual sync', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-autosave-network-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(sessionId, 180));
  await waitForHelios(page);
  await expect.poll(() => page.evaluate(async (id) => {
    const helios = window.__helios;
    const stored = await helios.persistence.getSession(id);
    return {
      networkBytes: stored?.payload?.networkData?.data?.byteLength
        ?? stored?.payload?.networkData?.data?.length
        ?? 0,
      networkFormat: stored?.payload?.networkData?.format ?? null,
      status: helios.persistence.status()?.networkData?.status ?? null,
    };
  }, sessionId), { timeout: 10000 }).toMatchObject({
    networkFormat: 'zxnet',
    status: 'saved',
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount), { timeout: 15000 })
    .toBe(180);

  await page.goto('/tests/fixtures/blank.html');
  await page.goto(sessionUrl(sessionId, 260));
  await waitForHelios(page);
  await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount)).toBe(180);
  await expect.poll(
    () => page.evaluate(() => window.__helios.persistence.status()?.networkData?.status ?? null),
    { timeout: 15000 },
  ).toBe('saved');
  const restored = await collectState(page, sessionId);
  expect(restored.storedSession.networkBytes).toBeGreaterThan(100);
  expect(restored.status.networkData.status).toBe('saved');
});

test('restores 3D sessions with non-planar positions after reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-3d-depth-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-3d-depth-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const params = new URLSearchParams({
    renderer: 'webgl',
    mode: '2d',
    nodes: '180',
    session: '1',
    restoreNetwork: '1',
    maxSessionBytes: '0',
    sessionId,
    workspaceId,
  });
  const url = `/?${params.toString()}`;

  await page.goto(url);
  await waitForHelios(page);
  await page.evaluate(async () => {
    await window.__helios.setMode('3d', { animate: false });
  });
  await expect.poll(() => collectDepthState(page).then((state) => state.mode)).toBe('3d');
  await expect.poll(() => collectDepthState(page).then((state) => state.zRange), { timeout: 15000 })
    .toBeGreaterThan(1e-5);
  await page.evaluate(async () => {
    await window.__helios.persistence.flush({
      includeNetwork: true,
      snapshotLayoutRuntime: true,
      network: { format: 'zxnet' },
    });
  });
  const storedBeforeReload = await collectStoredDepthState(page, sessionId);
  expect(storedBeforeReload.positionSource).toBe('delegate');
  expect(storedBeforeReload.mode).toBe('3d');
  expect(storedBeforeReload.zRange).toBeGreaterThan(1e-5);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();
  await expect.poll(() => collectDepthState(page).then((state) => state.mode), { timeout: 15000 }).toBe('3d');
  await expect.poll(() => collectDepthState(page).then((state) => state.zRange), { timeout: 15000 })
    .toBeGreaterThan(1e-5);
  const restored = await collectDepthState(page);
  expect(restored.dimensionStatus?.state).toBe('changed');
});

test('generated URL session reload restores directly without a resume prompt', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const workspaceId = `interface-generated-url-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=180&session=1&restoreNetwork=1&maxSessionBytes=0&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  const sessionId = await page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId'));
  expect(sessionId).toBeTruthy();
  await waitForStoredSessionNetwork(page, sessionId);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);

  await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__helios.persistence.status()?.sessionId ?? null))
    .toBe(sessionId);
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount), { timeout: 15000 })
    .toBe(180);
});

test('session URL alias restores directly without showing the resume prompt', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-session-alias-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-session-alias-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(sessionId, 180, workspaceId));
  await waitForHelios(page);
  await waitForStoredSessionNetwork(page, sessionId);

  const params = new URLSearchParams({
    renderer: 'webgl',
    layout: 'none',
    mode: '2d',
    nodes: '260',
    session: sessionId,
    restoreNetwork: '1',
    maxSessionBytes: '0',
    workspaceId,
  });
  await page.goto('/tests/fixtures/blank.html');
  await page.goto(`/?${params.toString()}`);
  await waitForHelios(page);

  await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__helios.persistence.status()?.sessionId ?? null))
    .toBe(sessionId);
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount), { timeout: 15000 })
    .toBe(180);
});

test('restores camera after panning a fresh session and immediately reloading', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const workspaceId = `interface-fresh-pan-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=180&session=1&restoreNetwork=1&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  const sessionId = await page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId'));
  expect(sessionId).toBeTruthy();
  const initial = await collectState(page, sessionId);
  expect(initial.cameraControls.autoFit).toBe(true);

  await panCanvas(page, 96, 44);
  const changed = await page.evaluate(() => {
    const helios = window.__helios;
    const pose = helios.cameraPose?.() ?? {};
    return {
      cameraControls: helios.cameraControls?.() ?? {},
      cameraPose: {
        mode: pose.mode,
        projection: pose.projection,
        zoom: pose.zoom,
        pan2D: Array.from(pose.pan2D ?? []),
      },
    };
  });
  await testInfo.attach('fresh-pan-before-reload-state', {
    body: JSON.stringify({ initial, changed }, null, 2),
    contentType: 'application/json',
  });
  expect(changed.cameraControls.autoFit).toBe(false);
  expect(Math.hypot(...changed.cameraPose.pan2D)).toBeGreaterThan(1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  await page.waitForTimeout(1000);
  const restored = await collectState(page, sessionId);
  await testInfo.attach('fresh-pan-after-reload-state', {
    body: JSON.stringify({ changed, restored }, null, 2),
    contentType: 'application/json',
  });
  expect(restored.cameraControls.autoFit).toBe(false);
  expect(restored.cameraPose.zoom).toBeCloseTo(changed.cameraPose.zoom, 3);
  expect(restored.cameraPose.pan2D[0]).toBeCloseTo(changed.cameraPose.pan2D[0], 1);
  expect(restored.cameraPose.pan2D[1]).toBeCloseTo(changed.cameraPose.pan2D[1], 1);
});

test('restores camera after panning a fresh default-layout session and immediately reloading', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const workspaceId = `interface-fresh-default-pan-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(`/?renderer=webgl&mode=2d&nodes=180&session=1&restoreNetwork=1&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  await page.waitForTimeout(500);
  const sessionId = await page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId'));
  expect(sessionId).toBeTruthy();
  const initial = await collectState(page, sessionId);
  expect(initial.cameraControls.autoFit).toBe(true);

  await panCanvas(page, 96, 44);
  const changed = await page.evaluate(() => {
    const helios = window.__helios;
    const pose = helios.cameraPose?.() ?? {};
    return {
      cameraControls: helios.cameraControls?.() ?? {},
      cameraPose: {
        mode: pose.mode,
        projection: pose.projection,
        zoom: pose.zoom,
        pan2D: Array.from(pose.pan2D ?? []),
      },
    };
  });
  await testInfo.attach('fresh-default-pan-before-reload-state', {
    body: JSON.stringify({ initial, changed }, null, 2),
    contentType: 'application/json',
  });
  expect(changed.cameraControls.autoFit).toBe(false);
  expect(Math.hypot(...changed.cameraPose.pan2D)).toBeGreaterThan(1);
  await page.evaluate(async () => {
    await window.__helios.persistence.flush({ snapshotLayoutRuntime: false });
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  await page.waitForTimeout(1500);
  const restored = await collectState(page, sessionId);
  await testInfo.attach('fresh-default-pan-after-reload-state', {
    body: JSON.stringify({ changed, restored }, null, 2),
    contentType: 'application/json',
  });
  expect(restored.cameraControls.autoFit).toBe(false);
  expect(restored.cameraPose.zoom).toBeCloseTo(changed.cameraPose.zoom, 3);
  expect(restored.cameraPose.pan2D[0]).toBeCloseTo(changed.cameraPose.pan2D[0], 1);
  expect(restored.cameraPose.pan2D[1]).toBeCloseTo(changed.cameraPose.pan2D[1], 1);
});

test('camera interaction updates sync text only after interaction idle', async ({ page }) => {
  const sessionId = `interface-session-sync-status-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-session-sync-status-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.goto(sessionUrl(sessionId, 180, workspaceId));
  await waitForHelios(page);
  await waitForStoredSessionNetwork(page, sessionId);

  const dataPanel = panel(page, 'helios-ui-data');
  await expect(dataPanel).toBeVisible();
  const syncStatus = dataPanel.locator('.helios-ui-network-persistence__status').first();
  const oldSavedAt = await page.evaluate(() => {
    const savedAt = Date.now() - 65000;
    const controller = window.__helios.persistence.sessionController;
    controller.sessionSavedAt = savedAt;
    controller.networkData = {
      ...(controller.networkData ?? {}),
      enabled: true,
      status: 'saved',
      dirty: false,
      positionsDirty: false,
      savedAt,
    };
    window.__helios.persistence.registry.statusFlags.lastSyncedAt = savedAt;
    window.__helios.persistence.registry._emit('sync', window.__helios.persistence.status());
    return savedAt;
  });
  await expect(syncStatus).toHaveText(/Synced 1m ago/);

  await page.waitForTimeout(600);
  await panCanvas(page, 72, 31);
  await expect.poll(() => page.evaluate(() => (
    window.__helios.persistence.status()?.sessionSync?.savedAt ?? 0
  )), { timeout: 300 }).toBe(oldSavedAt);
  await expect(syncStatus).toHaveText(/Synced 1m ago/);
  await expect(syncStatus).not.toHaveText(/Synced just now/);
  await expect.poll(() => page.evaluate(() => (
    window.__helios.persistence.status()?.sessionSync?.savedAt ?? 0
  )), { timeout: 10000 }).toBeGreaterThan(oldSavedAt);
  await expect(syncStatus).toHaveText(/Synced just now/, { timeout: 10000 });
});

test('default retention keeps more than two small browser sessions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const workspaceId = `interface-retention-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=64&session=1&restoreNetwork=1&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  const savedIds = await page.evaluate(async () => {
    const helios = window.__helios;
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      const id = `small-session-${i}-${Date.now()}`;
      ids.push(id);
      await helios.persistence.saveSession({
        id,
        nickname: `small ${i}`,
        networkFormat: 'zxnet',
        networkData: new Uint8Array(400_000),
        visualizationState: helios.serializeVisualizationState(),
      });
    }
    return ids;
  });

  const summaries = await page.evaluate(async () => (
    await window.__helios.persistence.listSessionSummaries({ includeFinished: true })
  ).map((entry) => ({ id: entry.id, bytes: entry.bytes })));
  for (const id of savedIds) {
    expect(summaries.some((entry) => entry.id === id)).toBe(true);
  }
  expect(summaries.filter((entry) => savedIds.includes(entry.id)).length).toBe(5);
});

test('restores edge appearance, mapper state, and default theme marker after URL session reload', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-visual-state-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(sessionId, 180));
  await waitForHelios(page);
  await page.evaluate(async () => {
    const helios = window.__helios;
    helios.edgeWidthScale(2.25);
    helios.edgeOpacityScale(0.35);
    helios.behavior.mappers.setChannelConfig('node', 'size', {
      name: 'size',
      type: 'constant',
      value: 7,
    });
    await new Promise((resolve) => setTimeout(resolve, 550));
    await helios.persistence.flush({
      includeNetwork: true,
      network: { format: 'xnet' },
      snapshotLayoutRuntime: false,
    });
  });
  await waitForStoredSessionNetwork(page, sessionId);
  const saved = await collectAppearanceMapperState(page, sessionId);
  expect(saved.edgeWidthScale).toBeCloseTo(2.25, 3);
  expect(saved.edgeOpacityScale).toBeCloseTo(0.35, 3);
  expect(saved.nodeSize.type).toBe('constant');
  expect(saved.nodeSize.value).toBe(7);
  expect(saved.themeStatus.state).toBe('default');
  expect(saved.edgeWidthStatus.state).toBe('changed');

  await page.goto('/tests/fixtures/blank.html');
  await page.goto(sessionUrl(sessionId, 260));
  await waitForHelios(page);
  await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();

  const restored = await collectAppearanceMapperState(page, sessionId);
  expect(restored.nodeCount).toBe(180);
  expect(restored.edgeWidthScale).toBeCloseTo(2.25, 3);
  expect(restored.edgeOpacityScale).toBeCloseTo(0.35, 3);
  expect(restored.nodeSize.type).toBe('constant');
  expect(restored.nodeSize.value).toBe(7);
  expect(restored.storedNodeSize?.type).toBe('constant');
  expect(restored.storedNodeSize?.value).toBe(7);
  expect(restored.themeStatus.state).toBe('default');

  const scenePanel = panel(page, 'helios-ui-demo');
  await scenePanel.getByRole('button', { name: 'Appearance' }).click();
  await expect(scenePanel.locator('.helios-ui-dirty-indicator[data-path="ui.theme"]').first())
    .toHaveAttribute('data-state', 'default');
});

test('built-in panel persistence markers are driven by centralized scope status', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const workspaceId = `panel-persistence-markers-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=120&session=1&restoreNetwork=1&workspaceId=${workspaceId}&maxSessionBytes=0`);
  await waitForHelios(page);

  await page.evaluate(() => {
    const helios = window.__helios;
    helios.behavior.mappers.setChannelConfig('node', 'size', {
      name: 'size',
      type: 'constant',
      value: 6,
    });
    helios.behavior.legends.legends({ showNodeSize: true });
    helios.behavior.layout.positionAttribute('$random');
    helios.behavior.filters.setScope('render+layout');
    helios.persistence.set('cameraControls.autoFit', false, {
      scope: 'network',
      source: 'test',
      reason: 'camera-controls',
    });
    helios.persistence.set('metrics.lastOutput', {
      metric: 'degree',
      attributes: ['degree'],
      updatedAt: Date.now(),
    }, {
      scope: 'network',
      source: 'test',
      reason: 'metrics',
    });
  });

  const paths = ['mappers', 'legends', 'layout', 'filters', 'camera', 'metrics'];
  await expect.poll(() => page.evaluate((targets) => targets.every((path) => (
    window.__helios.persistence.keyStatus(path, { mode: 'scope' }).state !== 'default'
  )), paths), { timeout: 10000 }).toBe(true);

  const panelIds = {
    mappers: 'helios-ui-mappers',
    legends: 'helios-ui-legends',
    layout: 'helios-ui-layout',
    filters: 'helios-ui-filter',
    camera: 'helios-ui-camera',
    metrics: 'helios-ui-metrics',
  };
  for (const path of paths) {
    const indicator = panel(page, panelIds[path]).locator(`.helios-ui-panel__persistence-indicator[data-path="${path}"]`).first();
    await expect(indicator).not.toHaveAttribute('data-state', 'default');
    const matchesRegistry = await indicator.evaluate((el) => (
      el.dataset.state === window.__helios.persistence.keyStatus(el.dataset.path, {
        scope: el.dataset.scope,
        mode: el.dataset.mode,
      })?.state
    ));
    expect(matchesRegistry).toBe(true);
  }
});

test('start fresh keeps the active URL session and leaves previous sessions available in the Session tab', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const previousSessionId = `interface-start-fresh-old-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const currentSessionId = `interface-start-fresh-new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-start-fresh-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(previousSessionId, 180, workspaceId));
  await waitForHelios(page);
  await page.evaluate(async () => {
    await window.__helios.persistence.flush({
      includeNetwork: true,
      network: { format: 'xnet' },
      snapshotLayoutRuntime: false,
    });
  });
  await waitForStoredSessionNetwork(page, previousSessionId);

  await page.goto(sessionUrl(currentSessionId, 220, workspaceId));
  await waitForHelios(page);
  const prompt = page.locator('.helios-ui-resume-prompt').first();
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('previous session');

  await prompt.getByRole('button', { name: 'Start Fresh' }).click();
  await expect(prompt).toBeHidden();
  await page.waitForTimeout(250);
  await expect(prompt).toBeHidden();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  await expect(prompt).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount), { timeout: 15000 }).toBe(220);

  const dataPanel = panel(page, 'helios-ui-data');
  await dataPanel.getByRole('button', { name: 'Session', exact: true }).click();
  await expect(dataPanel.locator('.helios-ui-session-tab__current-label')).toHaveText('Current');
  await expect(dataPanel.locator('.helios-ui-session-tab__current-id')).toContainText(currentSessionId);
  const listMetrics = await dataPanel.locator('.helios-ui-session-tab__list').evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
    };
  });
  expect(listMetrics.maxHeight).not.toBe('none');
  expect(['auto', 'scroll']).toContain(listMetrics.overflowY);
  const previousRow = dataPanel.locator(`.helios-ui-session-tab__row[data-session-id="${previousSessionId}"]`).first();
  await expect(previousRow).toBeVisible();
  await expect(previousRow).not.toContainText(workspaceId);
  await previousRow.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount), { timeout: 15000 }).toBe(180);
});

test('resume button opens a previous-session chooser when multiple sessions exist', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const olderSessionId = `interface-resume-older-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const latestSessionId = `interface-resume-latest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-resume-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=220&session=1&restoreNetwork=1&maxSessionBytes=0&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  await page.evaluate(async ({ olderSessionId: older, latestSessionId: latest }) => {
    const helios = window.__helios;
    const persistence = helios.persistence;
    const data = await helios.savePortableNetwork('xnet', {
      output: 'uint8array',
      includeVisualization: false,
    });
    const visualizationState = helios.serializeVisualizationState();
    await persistence.saveSession({
      id: older,
      createdAt: Date.now() - 2000,
      updatedAt: Date.now() - 2000,
      networkFormat: 'xnet',
      networkData: data,
      visualizationState,
      networkSource: { name: 'session 05.xnet', format: 'xnet' },
      retention: { enabled: false },
    });
    await persistence.saveSession({
      id: latest,
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
      networkFormat: 'xnet',
      networkData: data,
      visualizationState,
      networkSource: { name: 'session 06.xnet', format: 'xnet' },
      retention: { enabled: false },
    });
    const behavior = helios.behavior?.interface;
    behavior._persistenceReady = null;
    await behavior.ensurePersistenceReady();
  }, { olderSessionId, latestSessionId });
  const prompt = page.locator('.helios-ui-resume-prompt').first();
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText('previous session');
  await prompt.getByRole('button', { name: 'Resume' }).click();
  const menu = prompt.locator('.helios-ui-resume-prompt__menu');
  await expect(menu).toBeVisible();
  await menu.getByRole('button').first().click();
  await expect(prompt).toBeHidden();
});

test('Data Session tab saves a restorable session and resumes an existing one', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const previousSessionId = `interface-session-tab-old-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-session-tab-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(previousSessionId, 180, workspaceId));
  await waitForHelios(page);
  await page.evaluate(async () => {
    await window.__helios.persistence.flush({
      includeNetwork: true,
      network: { format: 'xnet' },
      snapshotLayoutRuntime: false,
    });
  });
  await waitForStoredSessionNetwork(page, previousSessionId);

  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=220&session=1&restoreNetwork=1&maxSessionBytes=0&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  const dataPanel = panel(page, 'helios-ui-data');
  await expect(dataPanel).toBeVisible();
  await dataPanel.getByRole('button', { name: 'Session', exact: true }).click();
  await expect(dataPanel.locator('.helios-ui-session-tab')).toBeVisible();
  await expect(dataPanel.locator('.helios-ui-session-tab__current-label')).toHaveText('Current');
  await expect(dataPanel.locator('.helios-ui-session-tab__current-id')).not.toHaveText('');

  const newSessionButton = dataPanel.getByRole('button', { name: 'Save Session' });
  const beforeSessionIds = await page.evaluate(async () => (
    await window.__helios.persistence.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
  ).map((entry) => entry.id));
  const currentBeforeSave = await page.evaluate(() => window.__helios.persistence.sessionController?.sessionId ?? null);
  await newSessionButton.click();
  await expect.poll(
    () => page.evaluate((knownIds) => (
      window.__helios.persistence.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
        .then((sessions) => sessions.find((entry) => entry?.id && !knownIds.includes(entry.id))?.id ?? null)
    ), beforeSessionIds),
    { timeout: 15000 },
  ).not.toBeNull();
  const activeSessionId = await page.evaluate(() => window.__helios.persistence.sessionController?.sessionId ?? null);
  expect(activeSessionId).toBe(currentBeforeSave);
  await expect(newSessionButton).toBeEnabled();

  const previousRow = dataPanel.locator(`.helios-ui-session-tab__row[data-session-id="${previousSessionId}"]`).first();
  await expect(previousRow).toBeVisible();
  await expect(previousRow).not.toContainText(workspaceId);
  await expect(previousRow.locator('.helios-ui-session-tab__title')).toContainText('WS 180');
  await expect(previousRow.locator('.helios-ui-session-tab__title')).toContainText(' - ');
  await expect(previousRow.locator('.helios-ui-session-tab__thumbnail')).toBeVisible();
  await expect(previousRow.locator('.helios-ui-session-tab__body')).toBeVisible();
  const sessionCardLayout = await previousRow.evaluate((row) => {
    const title = row.querySelector('.helios-ui-session-tab__title');
    const body = row.querySelector('.helios-ui-session-tab__body');
    const rowRect = row.getBoundingClientRect();
    const titleRect = title?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    return {
      titleStartsAtCardLeft: titleRect ? titleRect.left <= rowRect.left + 14 : false,
      titleEndsNearCardRight: titleRect ? titleRect.right >= rowRect.right - 14 : false,
      titleAboveBody: titleRect && bodyRect ? titleRect.bottom <= bodyRect.top : false,
    };
  });
  expect(sessionCardLayout).toEqual({
    titleStartsAtCardLeft: true,
    titleEndsNearCardRight: true,
    titleAboveBody: true,
  });
  const deletePreviousButton = previousRow.getByRole('button', { name: /Delete session/ });
  await expect(deletePreviousButton).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Delete saved session');
    await dialog.dismiss();
  });
  await deletePreviousButton.click();
  await expect(previousRow).toBeVisible();
  const resumePrompt = page.locator('.helios-ui-resume-prompt').first();
  await expect(resumePrompt).toBeVisible();
  await previousRow.getByRole('button', { name: 'Resume' }).click();
  await expect(resumePrompt).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount), { timeout: 15000 }).toBe(180);
  await expect.poll(
    () => page.evaluate(() => window.__helios.persistence.status()?.networkData?.status ?? null),
    { timeout: 15000 },
  ).toBe('saved');

  await dataPanel.getByRole('button', { name: 'Session', exact: true }).click();
  const resumedRow = dataPanel.locator(`.helios-ui-session-tab__row[data-session-id="${previousSessionId}"]`).first();
  await expect(resumedRow).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Delete saved session');
    await dialog.accept();
  });
  await resumedRow.getByRole('button', { name: /Delete session/ }).click();
  await expect(resumedRow).toBeHidden();
  await expect.poll(() => page.evaluate((id) => (
    window.__helios.persistence.getSession(id).then((session) => session == null)
  ), previousSessionId), { timeout: 10000 }).toBe(true);
});

test('Data Session Save Session restores saved camera pose and controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-session-camera-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-session-camera-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(sessionId, 180, workspaceId));
  await waitForHelios(page);
  await performInterfaceChanges(page);
  const savedCamera = await collectState(page, sessionId);
  expect(savedCamera.cameraControls.autoFit).toBe(false);
  expect(Math.hypot(...savedCamera.cameraPose.pan2D)).toBeGreaterThan(1);

  const dataPanel = panel(page, 'helios-ui-data');
  await dataPanel.getByRole('button', { name: 'Session', exact: true }).click();
  const saveSessionButton = dataPanel.getByRole('button', { name: 'Save Session' });
  const beforeSessionIds = await page.evaluate(async () => (
    await window.__helios.persistence.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
  ).map((entry) => entry.id));
  await saveSessionButton.click();
  await expect(saveSessionButton).toBeEnabled();
  await expect.poll(
    () => page.evaluate((knownIds) => (
      window.__helios.persistence.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
        .then((sessions) => sessions.find((entry) => entry?.id && !knownIds.includes(entry.id))?.id ?? null)
    ), beforeSessionIds),
    { timeout: 15000 },
  ).not.toBeNull();

  const snapshotSessionId = await page.evaluate((knownIds) => (
    window.__helios.persistence.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
      .then((sessions) => sessions.find((entry) => entry?.id && !knownIds.includes(entry.id))?.id ?? null)
  ), beforeSessionIds);
  expect(snapshotSessionId).toBeTruthy();

  await page.evaluate(() => {
    const helios = window.__helios;
    helios.setCameraPose?.({ zoom: 0.5, pan2D: [0, 0, 0] }, { source: 'test', manual: true });
    helios.cameraControls?.({ autoFit: true });
  });
  const changedCamera = await collectState(page, sessionId);
  expect(changedCamera.cameraControls.autoFit).toBe(true);
  expect(Math.hypot(...changedCamera.cameraPose.pan2D)).toBeLessThan(1);

  const snapshotRow = dataPanel.locator(`.helios-ui-session-tab__row[data-session-id="${snapshotSessionId}"]`).first();
  await expect(snapshotRow).toBeVisible();
  await snapshotRow.getByRole('button', { name: 'Resume' }).click();
  await expect.poll(
    () => page.evaluate(() => window.__helios.persistence.sessionController?.sessionId ?? null),
    { timeout: 15000 },
  ).toBe(snapshotSessionId);
  const restoredCamera = await collectState(page, snapshotSessionId);
  expect(restoredCamera.cameraControls.autoFit).toBe(false);
  expect(restoredCamera.cameraPose.zoom).toBeCloseTo(savedCamera.cameraPose.zoom, 3);
  expect(restoredCamera.cameraPose.pan2D[0]).toBeCloseTo(savedCamera.cameraPose.pan2D[0], 1);
  expect(restoredCamera.cameraPose.pan2D[1]).toBeCloseTo(savedCamera.cameraPose.pan2D[1], 1);
});

test('main example without a session id creates a new URL session and offers previous sessions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const previousSessionId = `interface-no-url-old-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-no-url-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(previousSessionId, 180, workspaceId));
  await waitForHelios(page);
  await page.evaluate(async () => {
    await window.__helios.persistence.flush({
      includeNetwork: true,
      network: { format: 'xnet' },
      snapshotLayoutRuntime: false,
    });
  });
  await waitForStoredSessionNetwork(page, previousSessionId);

  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=220&session=1&restoreNetwork=1&maxSessionBytes=0&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  const currentSessionId = await page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId'));
  expect(currentSessionId).toBeTruthy();
  expect(currentSessionId).not.toBe(previousSessionId);

  const prompt = page.locator('.helios-ui-resume-prompt').first();
  await expect(prompt).toBeVisible();
  await prompt.getByRole('button', { name: 'Resume' }).click();
  await expect(prompt).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount), { timeout: 15000 }).toBe(180);
  await expect.poll(
    () => page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId')),
    { timeout: 15000 },
  ).toBe(previousSessionId);
});

test('resume prompt stays inside the visible graph area with a right dock at narrow width', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 900 });
  const previousSessionId = `interface-prompt-narrow-old-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const currentSessionId = `interface-prompt-narrow-new-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-prompt-narrow-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(previousSessionId, 180, workspaceId));
  await waitForHelios(page);
  await page.evaluate(async () => {
    window.__helios.behavior?.interface?.dockSide?.('right');
    await window.__helios.persistence.flush({
      includeNetwork: true,
      network: { format: 'xnet' },
      snapshotLayoutRuntime: false,
    });
  });

  await page.goto(sessionUrl(currentSessionId, 220, workspaceId));
  await waitForHelios(page);
  await page.evaluate(() => window.__helios.behavior?.interface?.dockSide?.('right'));
  const prompt = page.locator('.helios-ui-resume-prompt').first();
  await expect(prompt).toBeVisible();

  const metrics = await prompt.evaluate((el) => {
    const promptRect = el.getBoundingClientRect();
    const container = el.closest('.helios-ui') ?? document.body;
    const containerRect = container.getBoundingClientRect();
    const style = getComputedStyle(el);
    const rightDockWidth = Number.parseFloat(style.getPropertyValue('--helios-ui-right-dock-width')) || 0;
    const dockLeft = containerRect.right - rightDockWidth;
    const buttonRects = Array.from(el.querySelectorAll('button')).flatMap((button) => {
      const rect = button.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return [];
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      };
    });
    return {
      prompt: {
        left: promptRect.left,
        right: promptRect.right,
        top: promptRect.top,
        bottom: promptRect.bottom,
      },
      dockLeft,
      buttonRects,
    };
  });

  expect(metrics.prompt.right).toBeLessThanOrEqual(metrics.dockLeft + 1);
  for (const button of metrics.buttonRects) {
    expect(button.left).toBeGreaterThanOrEqual(metrics.prompt.left - 1);
    expect(button.right).toBeLessThanOrEqual(metrics.prompt.right + 1);
    expect(button.top).toBeGreaterThanOrEqual(metrics.prompt.top - 1);
    expect(button.bottom).toBeLessThanOrEqual(metrics.prompt.bottom + 1);
  }
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
  const loadedSessionId = await page.evaluate(() => window.__helios.persistence.status().sessionId);
  expect(loadedSessionId).not.toBe(sessionId);
  await expect.poll(() => page.evaluate(async (oldId) => {
    const oldSession = await window.__helios.persistence.getSession(oldId);
    return oldSession?.payload?.session?.id === oldId;
  }, sessionId)).toBe(true);
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId'))).toBe(loadedSessionId);

  await performInterfaceChanges(page);
  await page.waitForTimeout(400);

  const beforeReload = await page.evaluate(async () => {
    const helios = window.__helios;
    await helios.persistence.flush({
      includeNetwork: true,
      network: { format: 'zxnet' },
      snapshotLayoutRuntime: false,
    });
    return true;
  });
  expect(beforeReload).toBe(true);

  const saved = await collectState(page, loadedSessionId);
  await testInfo.attach('saved-interface-persistence-state', {
    body: JSON.stringify(saved, null, 2),
    contentType: 'application/json',
  });
  expect(saved.nodeCount).toBe(64);
  expect(saved.shaded).toBe(true);
  expect(saved.cameraControls.autoFit).toBe(false);
  expect(Math.hypot(...saved.cameraPose.pan2D)).toBeGreaterThan(1);
  expect(saved.status.networkData.status).toBe('saved');
  expect(saved.storedSession.networkFormat).toBe('zxnet');
  expect(saved.storedSession.networkBytes).toBeGreaterThan(100);

  await page.goto('/tests/fixtures/blank.html');
  await page.goto(sessionUrl(loadedSessionId, 220));
  await waitForHelios(page);
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount)).toBe(64);
  await expect.poll(
    () => page.evaluate(() => window.__helios.persistence.status()?.networkData?.status ?? null),
    { timeout: 15000 },
  ).toBe('saved');

  const restored = await collectState(page, loadedSessionId);
  await testInfo.attach('restored-interface-persistence-state', {
    body: JSON.stringify(restored, null, 2),
    contentType: 'application/json',
  });
  expect(restored.nodeCount).toBe(64);
  expect(restored.shaded).toBe(true);
  expect(restored.cameraControls.autoFit).toBe(false);
  expect(restored.status.overrideCount).toBeGreaterThan(0);
  expect(restored.status.networkData.status).toBe('saved');
  expect(restored.storedSession.networkFormat).toBe('zxnet');
  expect(restored.storedSession.networkBytes).toBeGreaterThan(100);
  expect(restored.cameraPose.mode).toBe(saved.cameraPose.mode);
  expect(restored.cameraPose.projection).toBe(saved.cameraPose.projection);
  expect(restored.cameraPose.zoom).toBeCloseTo(saved.cameraPose.zoom, 3);
  expect(restored.cameraPose.pan2D[0]).toBeCloseTo(saved.cameraPose.pan2D[0], 1);
  expect(restored.cameraPose.pan2D[1]).toBeCloseTo(saved.cameraPose.pan2D[1], 1);
});
