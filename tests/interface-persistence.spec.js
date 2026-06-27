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
    return Boolean(window.__heliosUI ?? helios.ui);
  }, null, { timeout: 60000 });
}

async function waitForStoredSessionNetwork(page, sessionId) {
  await expect.poll(() => page.evaluate(async (id) => {
    const stored = await window.__helios.storage.getSession(id);
    return stored?.payload?.networkData?.data?.byteLength
      ?? stored?.payload?.networkData?.data?.length
      ?? 0;
  }, sessionId), { timeout: 10000 }).toBeGreaterThan(100);
}

function panel(page, id) {
  return page.locator(`.helios-ui-panel[data-panel-id="${id}"]`).first();
}

async function expandPanel(panelLocator) {
  await expect(panelLocator).toBeVisible();
  if ((await panelLocator.getAttribute('data-collapsed')) === 'true') {
    await panelLocator.locator('.helios-ui-panel__actions .helios-ui-button').first().click();
  }
  await expect(panelLocator).toHaveAttribute('data-collapsed', 'false');
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
    const storedSession = await helios.storage?.getSession?.(id);
    const pose = helios.cameraPose?.() ?? {};
    return {
      nodeCount: helios.network?.nodeCount ?? 0,
      shaded: helios.shadedEnabled?.() ?? null,
      nodeSizeScale: helios.nodeSizeScale?.() ?? null,
      nodeSizeStatus: helios.states?.status?.('appearance.nodeStyle.sizeScale') ?? null,
      cameraControls: helios.cameraControls?.() ?? {},
      cameraPose: {
        mode: pose.mode,
        projection: pose.projection,
        zoom: pose.zoom,
        pan2D: Array.from(pose.pan2D ?? []),
      },
      status: helios.storage?.persistenceStatus?.() ?? null,
      manifest: null,
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
  await expandPanel(cameraPanel);
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
  await page.waitForFunction(() => {
    const helios = window.__helios;
    const startup = helios?._startupGate;
    const canvasEl = document.querySelector('canvas');
    return Boolean(canvasEl)
      && getComputedStyle(canvasEl).visibility !== 'hidden'
      && (!startup || startup.active !== true || startup.firstVisibleFrameDrawn === true);
  }, null, { timeout: 15000 });
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
    const storedSession = await helios.storage?.getSession?.(id);
    const nodeSize = helios.behavior?.mappers?.getSerializedChannelConfig?.('node', 'size')
      ?? helios.nodeMapper?.defaultMapper?.getChannel?.('size')
      ?? null;
    return {
      nodeCount: helios.network?.nodeCount ?? 0,
      edgeWidthScale: helios.edgeWidthScale?.() ?? null,
      edgeOpacityScale: helios.edgeOpacityScale?.() ?? null,
      nodeSize,
      layoutType: helios.behavior?.layout?.type?.() ?? null,
      layoutJitter: helios.behavior?.layout?.parameter?.('jitter') ?? null,
      themeStatus: helios.states?.status?.('ui.theme') ?? null,
      edgeWidthStatus: helios.states?.status?.('appearance.edgeStyle.widthScale') ?? null,
      nodeSizeStatus: helios.states?.status?.('mappers.node.size') ?? null,
      filtersScopeStatus: helios.states?.status?.('filters.scope') ?? null,
      selectionNodesStatus: helios.states?.status?.('selection.selectedNodes') ?? null,
      labelsFillStatus: helios.states?.status?.('labels.fill') ?? null,
      layoutTypeStatus: helios.states?.status?.('layout.layoutType') ?? null,
      layoutParameterStatus: helios.states?.status?.('layout.parameters.jitter') ?? null,
      storedNodeSize: storedSession?.payload?.visualizationState?.payload?.storageState?.state?.overrides?.['mappers.node.size']
        ?? storedSession?.payload?.visualizationState?.payload?.overrides?.['mappers.node.size']
        ?? null,
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
      dimensionStatus: helios.states?.status?.('scene.dimension') ?? null,
    };
  }, limit);
}

async function collectPositionSample(page, limit = 48) {
  return page.evaluate(async (sampleLimit) => {
    const helios = window.__helios;
    const nodeCount = Math.max(0, helios.network?.nodeCount ?? 0);
    const ids = Array.from({ length: Math.min(sampleLimit, nodeCount) }, (_, index) => index);
    const snapshot = ids.length > 0
      ? await helios.snapshotNodePositions(ids)
      : { positions: new Float32Array(), source: 'none' };
    return {
      source: snapshot?.source ?? null,
      positions: Array.from(snapshot?.positions ?? []),
      alpha: Number(helios._layout?.positionDelegate?.alpha ?? helios._layout?.alpha ?? NaN),
      layoutState: helios.scheduler?.getLayoutState?.() ?? null,
    };
  }, limit);
}

async function collectStoredRuntimePositionSample(page, sessionId, limit = 48) {
  return page.evaluate(async ({ id, sampleLimit }) => {
    const storedSession = await window.__helios.storage?.getSession?.(id);
    const runtime = storedSession?.payload?.visualizationState?.payload?.layoutRuntimeState ?? null;
    const encoded = runtime?.positions ?? null;
    if (encoded?.encoding !== 'float32-base64' || typeof encoded.data !== 'string') {
      return {
        positions: [],
        alpha: runtime?.alpha ?? null,
        layoutState: runtime?.layoutState ?? null,
        source: runtime?.positionSource ?? null,
      };
    }
    const binary = atob(encoded.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const values = new Float32Array(bytes.buffer);
    const sampleLength = Math.min(values.length, sampleLimit * 3);
    return {
      positions: Array.from(values.slice(0, sampleLength)),
      alpha: runtime?.alpha ?? null,
      layoutState: runtime?.layoutState ?? null,
      source: runtime?.positionSource ?? null,
    };
  }, { id: sessionId, sampleLimit: limit });
}

function meanPositionDelta(a, b) {
  const left = Array.isArray(a?.positions) ? a.positions : [];
  const right = Array.isArray(b?.positions) ? b.positions : [];
  const count = Math.min(left.length, right.length);
  if (count < 3) return Infinity;
  let total = 0;
  let samples = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const dx = Number(left[i]) - Number(right[i]);
    const dy = Number(left[i + 1]) - Number(right[i + 1]);
    const dz = Number(left[i + 2]) - Number(right[i + 2]);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) continue;
    total += Math.hypot(dx, dy, dz);
    samples += 1;
  }
  return samples > 0 ? total / samples : Infinity;
}

async function collectStoredDepthState(page, sessionId) {
  return page.evaluate(async (id) => {
    const storedSession = await window.__helios.storage?.getSession?.(id);
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
    window.__helios.storage.status()?.networkData?.status ?? 'idle'
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
    const stored = await helios.storage.getSession(id);
    return {
      networkBytes: stored?.payload?.networkData?.data?.byteLength
        ?? stored?.payload?.networkData?.data?.length
        ?? 0,
      networkFormat: stored?.payload?.networkData?.format ?? null,
      status: helios.storage.status()?.networkData?.status ?? null,
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
    () => page.evaluate(() => window.__helios.storage.status()?.networkData?.status ?? null),
    { timeout: 15000 },
  ).toBe('saved');
  const restored = await collectState(page, sessionId);
  expect(restored.storedSession.networkBytes).toBeGreaterThan(100);
  expect(restored.status.networkData.status).toBe('saved');
});

test('same-session reload continues layout from saved positions and runtime state', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-layout-continue-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-layout-continue-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const delegate = window.__helios._layout?.positionDelegate ?? null;
    delegate?.updateOptions?.({ alpha: 0.001 });
  });
  await page.evaluate(async () => {
    await window.__helios.storage.flush({
      includeNetwork: true,
      snapshotLayoutRuntime: true,
      captureThumbnail: false,
      reason: 'layout-continue-browser-test',
    });
  });
  const storedBefore = await collectStoredRuntimePositionSample(page, sessionId);
  expect(storedBefore.positions.length).toBeGreaterThan(0);
  expect(storedBefore.source).toBe('delegate');
  expect(['running', 'idle']).toContain(storedBefore.layoutState);
  expect(Number(storedBefore.alpha)).toBeLessThan(0.005);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  const after = await collectPositionSample(page);
  const delta = meanPositionDelta(storedBefore, after);

  expect(after.positions.length).toBe(storedBefore.positions.length);
  expect(delta).toBeLessThan(10);
  expect(Number.isFinite(after.alpha)).toBe(true);
  expect(Math.abs(after.alpha - Number(storedBefore.alpha))).toBeLessThan(0.003);
});

test('autosync restores displayed delegate positions after same-session reload without manual flush', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const sessionId = `interface-layout-autosync-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-layout-autosync-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

  await page.goto(`/?${params.toString()}`);
  await waitForHelios(page);
  await waitForStoredSessionNetwork(page, sessionId);
  await page.evaluate(() => {
    window.__helios.storage.configureSession?.({ autosyncInteractionIdleMs: 300 });
  });
  const baselinePersistenceChanges = await page.evaluate(() => (
    window.__helios.storage.debugStats?.().persistenceChangeCount ?? 0
  ));
  const initial = await collectPositionSample(page);

  await expect.poll(async () => {
    const current = await collectPositionSample(page);
    return meanPositionDelta(initial, current);
  }, { timeout: 15000 }).toBeGreaterThan(5);
  await expect.poll(() => page.evaluate(() => (
    window.__helios.storage.status()?.networkData?.status ?? null
  )), { timeout: 15000 }).toBe('dirty');
  await page.evaluate(() => {
    const delegate = window.__helios._layout?.positionDelegate ?? null;
    delegate?.updateOptions?.({ alpha: 0.001 });
    window.__helios.stopLayout?.('browser-test-freeze');
  });
  await expect.poll(() => page.evaluate((baseline) => {
    const storage = window.__helios.storage;
    const stats = storage.debugStats?.() ?? {};
    const syncText = document.querySelector('.helios-ui-network-persistence__status')?.textContent ?? '';
    return {
      status: storage.status()?.networkData?.status ?? null,
      positionsDirty: storage.status()?.networkData?.positionsDirty === true,
      persistenceChanges: stats.persistenceChangeCount ?? 0,
      syncText,
      wroteAfterBaseline: (stats.persistenceChangeCount ?? 0) > baseline,
    };
  }, baselinePersistenceChanges), { timeout: 25000 }).toMatchObject({
    status: 'saved',
    positionsDirty: false,
    wroteAfterBaseline: true,
    syncText: 'Synced',
  });

  const beforeReload = await collectPositionSample(page);
  expect(beforeReload.positions.length).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  const afterReload = await collectPositionSample(page);
  const delta = meanPositionDelta(beforeReload, afterReload);

  expect(afterReload.positions.length).toBe(beforeReload.positions.length);
  expect(delta).toBeLessThan(100);
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
    await window.__helios.storage.flush({
      includeNetwork: true,
      snapshotLayoutRuntime: true,
      network: { format: 'zxnet' },
    });
  });
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    await window.__helios.storage.flush({
      includeNetwork: true,
      snapshotLayoutRuntime: true,
      captureThumbnail: false,
      network: { format: 'zxnet' },
      reason: '3d-depth-explicit-runtime-save',
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
  expect(['default', 'changed']).toContain(restored.dimensionStatus?.state);
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
  await expect.poll(() => page.evaluate(() => window.__helios.storage.status()?.sessionId ?? null))
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
  await expect.poll(() => page.evaluate(() => window.__helios.storage.status()?.sessionId ?? null))
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
  await page.evaluate(async () => {
    await window.__helios.storage.flush({
      includeNetwork: true,
      network: { format: 'zxnet' },
      snapshotLayoutRuntime: true,
    });
  });

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

test('autosync restores camera after panning a fresh session without manual flush', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const workspaceId = `interface-fresh-pan-autosync-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=180&session=1&restoreNetwork=1&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  const sessionId = await page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId'));
  expect(sessionId).toBeTruthy();
  await waitForStoredSessionNetwork(page, sessionId);
  await page.evaluate(() => {
    window.__helios.storage.configureSession?.({ autosyncInteractionIdleMs: 300 });
  });

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
  expect(changed.cameraControls.autoFit).toBe(false);
  expect(Math.hypot(...changed.cameraPose.pan2D)).toBeGreaterThan(1);

  await expect.poll(async () => page.evaluate(async (id) => {
    const stored = await window.__helios.storage.getSession(id);
    const payload = stored?.payload?.visualizationState?.payload ?? {};
    return {
      autoFit: payload.cameraControlState?.autoFit,
      pan2D: Array.from(payload.cameraState?.pan2D ?? []),
      status: window.__helios.storage.status()?.networkData?.status ?? null,
    };
  }, sessionId), { timeout: 10000 }).toMatchObject({
    autoFit: false,
    pan2D: [
      expect.closeTo(changed.cameraPose.pan2D[0], 1),
      expect.closeTo(changed.cameraPose.pan2D[1], 1),
      expect.closeTo(changed.cameraPose.pan2D[2] ?? 0, 1),
    ],
    status: 'saved',
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  const restored = await collectState(page, sessionId);
  await testInfo.attach('fresh-pan-autosync-reload-state', {
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
    await window.__helios.storage.flush({ snapshotLayoutRuntime: false });
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
  await page.evaluate(async () => {
    window.__helios.storage.configureSession?.({ autosyncInteractionIdleMs: 3000 });
    await window.__helios.storage.flushAutosync?.({ force: true });
  });

  const dataPanel = panel(page, 'helios-ui-data');
  await expect(dataPanel).toBeVisible();
  const syncStatus = dataPanel.locator('.helios-ui-network-persistence__status').first();
  const oldSavedAt = await page.evaluate(() => {
    const savedAt = Date.now() - 65000;
    const storage = window.__helios.storage;
    storage.sessionSavedAt = savedAt;
    storage.networkData = {
      ...(storage.networkData ?? {}),
      enabled: true,
      status: 'saved',
      dirty: false,
      positionsDirty: false,
      savedAt,
      dirtyAt: null,
    };
    storage.dispatchEvent(new CustomEvent('change', { detail: { reason: 'session-save', status: storage.persistenceStatus() } }));
    return savedAt;
  });
  await expect(syncStatus).toHaveText('Synced');

  await page.waitForTimeout(600);
  await panCanvas(page, 72, 31);
  await expect.poll(() => page.evaluate(() => (
    window.__helios.storage.status()?.sessionSync?.savedAt ?? 0
  )), { timeout: 300 }).toBe(oldSavedAt);
  await expect(syncStatus).toHaveText('Synced');
  await expect.poll(() => page.evaluate(() => (
    window.__helios.storage.status()?.sessionSync?.savedAt ?? 0
  )), { timeout: 10000 }).toBeGreaterThan(oldSavedAt);
  await expect(syncStatus).toHaveText('Synced', { timeout: 10000 });

  await page.evaluate(() => {
    const storage = window.__helios.storage;
    const statusEl = document.querySelector('.helios-ui-network-persistence__status');
    if (statusEl) statusEl.textContent = 'Syncing...';
    storage.networkData = {
      ...(storage.networkData ?? {}),
      enabled: true,
      status: 'dirty',
      dirty: true,
      networkDirty: false,
      positionsDirty: true,
      dirtyAt: Date.now(),
      reason: 'layout-update',
      syncing: false,
    };
    storage.dispatchEvent(new CustomEvent('change', {
      detail: { reason: 'session-save-finish', status: storage.persistenceStatus() },
    }));
  });
  await expect(syncStatus).toHaveText('Unsynced positions');
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
      await helios.storage.saveSession({
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
    await window.__helios.storage.listSessionSummaries({ includeFinished: true })
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
    helios.behavior.filters.setScope('render+layout');
    helios.behavior.selection.selectNodes([0, 1, 2], { mode: 'replace' });
    helios.behavior.selection.setSelectorRules([{ scope: 'node', type: 'query', query: '$index < 5' }]);
    helios.behavior.labels.fill('#123456ff');
    helios.behavior.legends.legends({ showNodeSize: true, scale: 1.4 });
    helios.behavior.layout.type('worker:jitter');
    helios.behavior.layout.parameter('jitter', 4.5);
    helios.behavior.layout.positionAttribute('$random');
    await new Promise((resolve) => setTimeout(resolve, 550));
    await helios.storage.flush({
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
  expect(saved.layoutType).toBe('worker:jitter');
  expect(saved.layoutJitter).toBeCloseTo(4.5, 3);
  expect(saved.themeStatus.state).toBe('default');
  expect(saved.edgeWidthStatus.state).toBe('changed');
  expect(saved.nodeSizeStatus.state).toBe('changed');
  expect(saved.filtersScopeStatus.state).toBe('changed');
  expect(saved.selectionNodesStatus.state).toBe('changed');
  expect(saved.labelsFillStatus.state).toBe('changed');
  expect(saved.layoutTypeStatus.state).toBe('changed');
  expect(saved.layoutParameterStatus.state).toBe('changed');

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
  expect(restored.layoutType).toBe('worker:jitter');
  expect([3, 4.5]).toContain(restored.layoutJitter);
  expect(restored.storedNodeSize?.type).toBe('constant');
  expect(restored.storedNodeSize?.value).toBe(7);
  expect(restored.themeStatus.state).toBe('default');
  expect(restored.nodeSizeStatus.state).toBe('changed');
  expect(restored.filtersScopeStatus.state).toBe('changed');
  expect(restored.selectionNodesStatus.state).toBe('changed');
  expect(restored.labelsFillStatus.state).toBe('changed');
  expect(restored.layoutTypeStatus.state).toBe('changed');
  expect(restored.layoutParameterStatus.state).toBe('changed');

  const scenePanel = panel(page, 'helios-ui-demo');
  await scenePanel.getByRole('button', { name: 'Appearance' }).click();
  await expect(scenePanel).not.toContainText('edgeAdaptiveQualitySlowFrameThresholdMs');
  await expect(scenePanel).not.toContainText('shadedAmbientTopColor');
  await expect(scenePanel).not.toContainText('ambientOcclusionIntensityScale');
  await expect(scenePanel).toContainText('Slow Frame Threshold');
  await expect(scenePanel).toContainText('Ambient Top');
  await expect(scenePanel).toContainText('Fast Scale');
  await expect(scenePanel.locator('.helios-ui-dirty-indicator[data-path="ui.theme"]').first())
    .toHaveAttribute('data-state', 'default');
  await expect(scenePanel.locator('.helios-ui-panel__persistence-indicator[data-schema="scene"]').first())
    .not.toHaveAttribute('data-state', 'default');
  await expect(scenePanel.locator('.helios-ui-tab .helios-ui-dirty-indicator')).toHaveCount(0);
  await scenePanel.getByRole('button', { name: 'Labels' }).click();
  await expect(scenePanel.locator('.helios-ui-tab .helios-ui-dirty-indicator')).toHaveCount(0);

  const mappersPanel = panel(page, 'helios-ui-mappers');
  await expect(mappersPanel.locator('.helios-ui-panel__persistence-indicator[data-schema="mappers"]').first())
    .not.toHaveAttribute('data-state', 'default');
  await expect(mappersPanel.locator('.helios-ui-tab .helios-ui-dirty-indicator')).toHaveCount(0);

  const filterPanel = panel(page, 'helios-ui-filter');
  await expect(filterPanel.locator('.helios-ui-panel__persistence-indicator[data-schema="filters"]').first())
    .not.toHaveAttribute('data-state', 'default');

  const selectionPanel = panel(page, 'helios-ui-selection');
  await expect(selectionPanel.locator('.helios-ui-panel__persistence-indicator[data-schema="selection"]').first())
    .not.toHaveAttribute('data-state', 'default');

  const legendsPanel = panel(page, 'helios-ui-legends');
  await expect(legendsPanel.locator('.helios-ui-panel__persistence-indicator[data-schema="legends"]').first())
    .not.toHaveAttribute('data-state', 'default');

  const layoutPanel = panel(page, 'helios-ui-layout');
  await expect(layoutPanel).not.toContainText('layout.parameters.jitter');
  await expect(layoutPanel).not.toContainText('kRepulsion');
  await expect(layoutPanel).toContainText('Jitter');
  await expect(layoutPanel.locator('.helios-ui-panel__persistence-indicator[data-schema="layout"]').first())
    .not.toHaveAttribute('data-state', 'default');
  await expect(layoutPanel.locator('.helios-ui-dirty-indicator[data-path="layout.parameters.jitter"]').first())
    .toHaveAttribute('data-state', 'changed');
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
    helios.behavior.layout.type('worker:jitter');
    helios.behavior.filters.setScope('render+layout');
    helios.behavior.selection.selectNodes([0], { mode: 'replace' });
    helios.states.set('cameraControls.autoFit', false, {
      scope: 'network',
      source: 'program',
      reason: 'camera-controls',
    });
    helios.states.set('metrics.lastOutput', {
      metric: 'degree',
      attributes: ['degree'],
      updatedAt: Date.now(),
    }, {
      scope: 'network',
      source: 'program',
      reason: 'metrics',
    });
  });

  const paths = ['mappers', 'legends', 'layout', 'filters', 'selection', 'camera', 'metrics'];
  await expect.poll(() => page.evaluate((targets) => targets.every((path) => (
    window.__helios.states.status(path, { mode: 'scope' }).state !== 'default'
  )), paths), { timeout: 10000 }).toBe(true);

  const panelIds = {
    mappers: 'helios-ui-mappers',
    legends: 'helios-ui-legends',
    layout: 'helios-ui-layout',
    filters: 'helios-ui-filter',
    selection: 'helios-ui-selection',
    camera: 'helios-ui-camera',
    metrics: 'helios-ui-metrics',
  };
  for (const path of paths) {
    const schemaPanels = ['mappers', 'legends', 'layout', 'filters', 'selection'];
    const indicator = schemaPanels.includes(path)
      ? panel(page, panelIds[path]).locator(`.helios-ui-panel__persistence-indicator[data-schema="${path}"]`).first()
      : panel(page, panelIds[path]).locator(`.helios-ui-panel__persistence-indicator[data-path="${path}"]`).first();
    await expect(indicator).not.toHaveAttribute('data-state', 'default');
    const matchesRegistry = await indicator.evaluate(async (el) => {
      if (el.dataset.path) {
        return el.dataset.state === window.__helios.states.status(el.dataset.path, {
          scope: el.dataset.scope,
          mode: el.dataset.mode,
        })?.state;
      }
      const {
        FILTERS_PANEL_SCHEMA,
        LAYOUT_PANEL_SCHEMA,
        LEGENDS_PANEL_SCHEMA,
        MAPPERS_PANEL_SCHEMA,
        SELECTION_PANEL_SCHEMA,
        panelSchemaStatus,
      } = await import('/src/ui/panels/panelSchema.js');
      const schema = el.dataset.schema === 'layout'
        ? LAYOUT_PANEL_SCHEMA
        : el.dataset.schema === 'legends'
          ? LEGENDS_PANEL_SCHEMA
          : el.dataset.schema === 'mappers'
            ? MAPPERS_PANEL_SCHEMA
            : el.dataset.schema === 'filters'
              ? FILTERS_PANEL_SCHEMA
              : (el.dataset.schema === 'selection' ? SELECTION_PANEL_SCHEMA : null);
      return Boolean(schema) && el.dataset.state === panelSchemaStatus(schema, window.__helios.states).panel;
    });
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
    await window.__helios.storage.flush({
      includeNetwork: true,
      network: { format: 'xnet' },
      snapshotLayoutRuntime: false,
    });
  });
  await waitForStoredSessionNetwork(page, previousSessionId);

  await page.goto(sessionUrl(currentSessionId, 220, workspaceId));
  await waitForHelios(page);
  const prompt = page.locator('.helios-ui-resume-prompt').first();
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
    const persistence = helios.storage;
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
    await window.__helios.storage.flush({
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
    await window.__helios.storage.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
  ).map((entry) => entry.id));
  const currentBeforeSave = await page.evaluate(() => window.__helios.storage.sessionId ?? null);
  await newSessionButton.click();
  await expect.poll(
    () => page.evaluate((knownIds) => (
      window.__helios.storage.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
        .then((sessions) => sessions.find((entry) => entry?.id && !knownIds.includes(entry.id))?.id ?? null)
    ), beforeSessionIds),
    { timeout: 15000 },
  ).not.toBeNull();
  const activeSessionId = await page.evaluate(() => window.__helios.storage.sessionId ?? null);
  expect(activeSessionId).toBe(currentBeforeSave);
  await expect(newSessionButton).toBeEnabled();

  const previousRow = dataPanel.locator(`.helios-ui-session-tab__row[data-session-id="${previousSessionId}"]`).first();
  await expect(previousRow).toBeVisible();
  await expect(previousRow).not.toContainText(workspaceId);
  await expect(previousRow.locator('.helios-ui-session-tab__title')).toContainText('Grid 180');
  await expect(previousRow.locator('.helios-ui-session-tab__title')).toContainText(' - ');
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
    () => page.evaluate(() => window.__helios.storage.status()?.networkData?.status ?? null),
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
    window.__helios.storage.getSession(id).then((session) => session == null)
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
    await window.__helios.storage.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
  ).map((entry) => entry.id));
  await saveSessionButton.click();
  await expect(saveSessionButton).toBeEnabled();
  await expect.poll(
    () => page.evaluate((knownIds) => (
      window.__helios.storage.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
        .then((sessions) => sessions.find((entry) => entry?.id && !knownIds.includes(entry.id))?.id ?? null)
    ), beforeSessionIds),
    { timeout: 15000 },
  ).not.toBeNull();

  const snapshotSessionId = await page.evaluate((knownIds) => (
    window.__helios.storage.listSessionSummaries({ includeFinished: true, includeAllWorkspaces: true })
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
    () => page.evaluate(() => window.__helios.storage.sessionId ?? null),
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
    await window.__helios.storage.flush({
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
  await prompt.getByRole('button', { name: 'Start Fresh' }).click();
  await expect(prompt).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount), { timeout: 15000 }).toBe(220);
  await expect.poll(
    () => page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId')),
    { timeout: 15000 },
  ).toBe(currentSessionId);
});

test('generated URL session autosync restores first-run camera and appearance changes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const workspaceId = `interface-generated-autosync-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(`/?renderer=webgl&mode=2d&nodes=800&restoreNetwork=1&maxSessionBytes=0&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  const sessionId = await page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId'));
  expect(sessionId).toBeTruthy();
  await page.evaluate(() => {
    window.__helios.storage.configureSession?.({ autosyncInteractionIdleMs: 300 });
  });

  await panCanvas(page, 88, 39);
  await page.evaluate(() => {
    window.__helios.nodeSizeScale?.(1.42);
  });
  const changed = await collectState(page, sessionId);
  expect(changed.cameraControls.autoFit).toBe(false);
  expect(Math.hypot(...changed.cameraPose.pan2D)).toBeGreaterThan(1);
  expect(changed.nodeSizeStatus?.state).toBe('changed');

  await expect.poll(async () => page.evaluate(async (id) => {
    const helios = window.__helios;
    const session = await helios.storage.getSession(id);
    const payload = session?.payload?.visualizationState?.payload ?? {};
    const overrides = payload.storageState?.state?.overrides ?? {};
    return {
      nodeSizeScale: overrides['appearance.nodeStyle.sizeScale']
        ?? overrides['behaviors.appearance.nodeSizeScale']
        ?? null,
      autoFit: payload.cameraControlState?.autoFit,
      pan2D: Array.from(payload.cameraState?.pan2D ?? []),
    };
  }, sessionId), { timeout: 30000 }).toMatchObject({
    nodeSizeScale: 1.42,
    autoFit: false,
    pan2D: [
      expect.closeTo(changed.cameraPose.pan2D[0], 1),
      expect.closeTo(changed.cameraPose.pan2D[1], 1),
      expect.closeTo(changed.cameraPose.pan2D[2] ?? 0, 1),
    ],
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForHelios(page);
  const restored = await collectState(page, sessionId);

  expect(restored.status?.sessionId).toBe(sessionId);
  expect(restored.cameraControls.autoFit).toBe(false);
  expect(restored.cameraPose.pan2D[0]).toBeCloseTo(changed.cameraPose.pan2D[0], 1);
  expect(restored.cameraPose.pan2D[1]).toBeCloseTo(changed.cameraPose.pan2D[1], 1);
  expect(restored.nodeSizeScale).toBeCloseTo(1.42, 2);
  expect(restored.nodeSizeStatus?.state).toBe('changed');
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
    await window.__helios.storage.flush({
      includeNetwork: true,
      network: { format: 'xnet' },
      snapshotLayoutRuntime: false,
    });
  });

  await page.goto(sessionUrl(currentSessionId, 220, workspaceId));
  await waitForHelios(page);
  await page.evaluate(() => window.__helios.behavior?.interface?.dockSide?.('right'));
  const prompt = page.locator('.helios-ui-resume-prompt').first();
  await expect(prompt).toBeHidden();

  await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=220&session=1&restoreNetwork=1&maxSessionBytes=0&workspaceId=${encodeURIComponent(workspaceId)}`);
  await waitForHelios(page);
  await page.evaluate(() => window.__helios.behavior?.interface?.dockSide?.('right'));
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

test('quick controls stay inside the visible graph area with a right dock at narrow width', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 900 });
  const sessionId = `interface-quick-controls-right-dock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-quick-controls-right-dock-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(sessionId, 220, workspaceId));
  await waitForHelios(page);
  await page.evaluate(() => window.__helios.behavior?.interface?.dockSide?.('right'));

  const controls = page.locator('.helios-quick-controls').first();
  await expect(controls).toBeVisible();

  const metrics = await controls.evaluate((el) => {
    const controlsRect = el.getBoundingClientRect();
    const ui = document.querySelector('.helios-ui') ?? document.body;
    const uiRect = ui.getBoundingClientRect();
    const style = getComputedStyle(ui);
    const rightDockWidth = Number.parseFloat(style.getPropertyValue('--helios-ui-right-dock-width')) || 0;
    const dockLeft = uiRect.right - rightDockWidth;
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
      controls: {
        left: controlsRect.left,
        right: controlsRect.right,
        top: controlsRect.top,
        bottom: controlsRect.bottom,
      },
      dockLeft,
      buttonRects,
    };
  });

  expect(metrics.controls.right).toBeLessThanOrEqual(metrics.dockLeft + 1);
  for (const button of metrics.buttonRects) {
    expect(button.left).toBeGreaterThanOrEqual(metrics.controls.left - 1);
    expect(button.right).toBeLessThanOrEqual(metrics.controls.right + 1);
    expect(button.top).toBeGreaterThanOrEqual(metrics.controls.top - 1);
    expect(button.bottom).toBeLessThanOrEqual(metrics.controls.bottom + 1);
  }
});

test('compact dock resize keeps graph viewport aligned with the resized panel', async ({ page }) => {
  await page.setViewportSize({ width: 980, height: 900 });
  const sessionId = `interface-compact-dock-resize-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workspaceId = `interface-compact-dock-resize-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  await page.goto(sessionUrl(sessionId, 220, workspaceId));
  await waitForHelios(page);
  await page.evaluate(() => window.__helios.behavior?.interface?.dockSide?.('left'));

  const dataPanel = panel(page, 'helios-ui-data');
  await expect(dataPanel).toBeVisible();
  const resizeHandle = dataPanel.locator('.helios-ui-resize-handle[data-edge="right"]').first();
  await expect(resizeHandle).toBeVisible();
  const handleBox = await resizeHandle.boundingBox();
  expect(handleBox).not.toBeNull();

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 220, handleBox.y + handleBox.height / 2, { steps: 12 });
  await page.mouse.up();

  const metrics = await page.evaluate(() => {
    const panelEl = document.querySelector('.helios-ui-panel[data-panel-id="helios-ui-data"]');
    const dock = document.querySelector('.helios-ui-dock--left');
    const viewport = document.querySelector('.helios-layer-viewport');
    const rect = (el) => {
      const value = el?.getBoundingClientRect?.();
      return value ? {
        left: value.left,
        right: value.right,
        width: value.width,
      } : null;
    };
    return {
      panel: rect(panelEl),
      dock: rect(dock),
      viewport: rect(viewport),
      layersSize: window.__helios.layers.size,
      viewportInsets: window.__helios.layers.viewportInsets,
    };
  });

  expect(metrics.panel.width).toBeGreaterThan(430);
  expect(Math.abs(metrics.dock.right - metrics.panel.right)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(metrics.viewport.left - metrics.panel.right)).toBeLessThanOrEqual(1.5);
  expect(metrics.viewport.width).toBeGreaterThanOrEqual(179);
  expect(metrics.layersSize.width).toBeGreaterThanOrEqual(179);
  expect(metrics.viewportInsets.left).toBeCloseTo(metrics.panel.width, 0);

  const expandedHandleBox = await resizeHandle.boundingBox();
  expect(expandedHandleBox).not.toBeNull();
  await page.mouse.move(
    expandedHandleBox.x + expandedHandleBox.width / 2,
    expandedHandleBox.y + expandedHandleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    expandedHandleBox.x + expandedHandleBox.width / 2 - 260,
    expandedHandleBox.y + expandedHandleBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  const shrunkenMetrics = await page.evaluate(() => {
    const panelEls = Array.from(document.querySelectorAll('.helios-ui-dock--left .helios-ui-panel'));
    const dock = document.querySelector('.helios-ui-dock--left');
    const viewport = document.querySelector('.helios-layer-viewport');
    const rect = (el) => {
      const value = el?.getBoundingClientRect?.();
      return value ? {
        left: value.left,
        right: value.right,
        width: value.width,
      } : null;
    };
    return {
      panels: panelEls.map((el) => rect(el)),
      dock: rect(dock),
      viewport: rect(viewport),
      layersSize: window.__helios.layers.size,
      viewportInsets: window.__helios.layers.viewportInsets,
    };
  });

  for (const panelRect of shrunkenMetrics.panels) {
    expect(Math.abs(panelRect.right - shrunkenMetrics.dock.right)).toBeLessThanOrEqual(1.5);
  }
  expect(Math.abs(shrunkenMetrics.viewport.left - shrunkenMetrics.dock.right)).toBeLessThanOrEqual(1.5);
  expect(shrunkenMetrics.viewport.width).toBeGreaterThanOrEqual(179);
  expect(shrunkenMetrics.layersSize.width).toBeGreaterThanOrEqual(179);
  expect(shrunkenMetrics.viewportInsets.left).toBeCloseTo(shrunkenMetrics.dock.width, 0);
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
  await page.evaluate(async () => {
    await window.__helios.storage.flush({
      includeNetwork: true,
      network: { format: 'zxnet' },
      snapshotLayoutRuntime: true,
    });
  });

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
  const loadedSessionId = await page.evaluate(() => window.__helios.storage.status().sessionId);
  expect(loadedSessionId).not.toBe(sessionId);
  await expect.poll(() => page.evaluate(async (oldId) => {
    const oldSession = await window.__helios.storage.getSession(oldId);
    return oldSession?.payload?.session?.id === oldId;
  }, sessionId)).toBe(true);
  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get('sessionId'))).toBe(loadedSessionId);

  await performInterfaceChanges(page);
  await page.waitForTimeout(400);

  const beforeReload = await page.evaluate(async () => {
    const helios = window.__helios;
    await helios.storage.flush({
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
    () => page.evaluate(() => window.__helios.storage.status()?.networkData?.status ?? null),
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
