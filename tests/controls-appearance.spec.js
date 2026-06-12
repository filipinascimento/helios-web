import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

async function waitForHelios(page) {
  await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
  await page.waitForFunction(() => Boolean(window.__heliosUI));
}

function panelByTitle(page, title) {
  return page.locator('.helios-ui-panel', {
    has: page.locator('.helios-ui-panel__title', { hasText: title }),
  }).first();
}

function rowByTitle(scope, title) {
  return scope.locator(
    `xpath=.//*[contains(@class,"helios-ui-row")][.//*[contains(@class,"helios-ui-label__title") and normalize-space()="${title}"]]`,
  ).first();
}

function indicatorByPath(scope, path) {
  return scope.locator(`.helios-ui-dirty-indicator[data-path="${path}"]`).first();
}

async function visibleDirtyMarkers(scope) {
  return scope.locator('.helios-ui-dirty-indicator').evaluateAll((els) => (
    els
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0
          && rect.height > 0
          && style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0
          && el.dataset.state !== 'default';
      })
      .map((el) => ({
        path: el.dataset.path ?? null,
        state: el.dataset.state ?? null,
        row: el.closest('.helios-ui-row,.helios-ui-subpanel,.helios-ui-panel')?.textContent?.trim() ?? '',
      }))
  ));
}

async function enableToggle(locator) {
  const toggle = locator.first();
  await expect(toggle).toBeVisible();
  const tag = await toggle.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'input') {
    if (!(await toggle.isChecked())) await toggle.check();
    return;
  }
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

async function disableToggle(locator) {
  const toggle = locator.first();
  await expect(toggle).toBeVisible();
  const tag = await toggle.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'input') {
    if (await toggle.isChecked()) await toggle.uncheck();
    return;
  }
  if ((await toggle.getAttribute('aria-checked')) !== 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
}

function parseScreenshot(buffer) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

async function countNonBackgroundPixels(page) {
  const screenshot = await page.screenshot({ fullPage: false });
  const png = await parseScreenshot(screenshot);
  let nonBackground = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i] > 10 || png.data[i + 1] > 10 || png.data[i + 2] > 10) nonBackground += 1;
  }
  return nonBackground;
}

async function countCanvasBrightPixels(page, threshold = 20) {
  const screenshot = await page.locator('canvas.helios-layer-canvas3d').first().screenshot();
  const png = await parseScreenshot(screenshot);
  let bright = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] > 0 && (png.data[i] > threshold || png.data[i + 1] > threshold || png.data[i + 2] > threshold)) {
      bright += 1;
    }
  }
  return bright;
}

async function hideOverlayChrome(page) {
  await page.evaluate(() => {
    document
      .querySelectorAll('.helios-ui-root, .helios-ui-panel, .helios-quick-controls, .helios-quick-controls-root, .helios-quick-control')
      .forEach((el) => {
        el.style.display = 'none';
      });
  });
}

test.describe('scene panel: tabs and appearance controls', () => {
  test('persistence markers track exact setting defaults and reset without marking sibling rows', async ({ page }) => {
    const workspaceId = `marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=120&session=1&workspaceId=${workspaceId}`);
    await waitForHelios(page);

    const scenePanel = panelByTitle(page, 'Scene');
    await expect(scenePanel).toBeVisible();
    await expect(scenePanel.locator('.helios-ui-tab .helios-ui-dirty-indicator')).toHaveCount(0);
    const dimensionRow = rowByTitle(scenePanel, 'Dimension');
    const dimensionIndicator = indicatorByPath(scenePanel, 'scene.dimension');
    const themeIndicator = indicatorByPath(scenePanel, 'ui.theme');
    const backgroundIndicator = indicatorByPath(scenePanel, 'appearance.background');

    await expect(themeIndicator).toHaveAttribute('data-state', 'default');
    await expect(themeIndicator).toBeHidden();
    await expect(dimensionIndicator).toHaveAttribute('data-state', 'default');
    await expect(dimensionIndicator).toBeHidden();
    await expect(backgroundIndicator).toHaveAttribute('data-state', 'default');
    await expect(backgroundIndicator).toBeHidden();
    await expect(indicatorByPath(scenePanel, 'appearance.edgeStyle.widthScale')).toHaveAttribute('data-state', 'default');
    await expect(indicatorByPath(scenePanel, 'appearance.edgeStyle.opacityScale')).toHaveAttribute('data-state', 'default');

    for (const title of ['Node Size Scale', 'Node Opacity Scale', 'Outline Width Scale', 'Edge Width Scale', 'Edge Opacity Scale']) {
      await expect(rowByTitle(scenePanel, title).locator('input[type="number"]').first()).not.toHaveValue('');
    }

    const mismatchedMarkers = await scenePanel.locator('.helios-ui-dirty-indicator[data-path]').evaluateAll((els) => (
      els
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        })
        .map((el) => ({
          path: el.dataset.path,
          state: el.dataset.state,
          expected: window.__helios?.states?.status?.(el.dataset.path, {
            scope: el.dataset.scope,
            mode: el.dataset.mode,
          })?.state ?? 'default',
        }))
        .filter((entry) => entry.state !== entry.expected)
    ));
    expect(mismatchedMarkers).toEqual([]);

    const dimensionControl = dimensionRow.locator('[role="radiogroup"][aria-label="Scene dimension"]').first();
    await dimensionControl.getByRole('radio', { name: '3D' }).click();
    await expect.poll(() => page.evaluate(() => window.__helios.mode())).toBe('3d');
    await expect(dimensionIndicator).toHaveAttribute('data-state', 'changed');
    await expect(dimensionIndicator).toBeVisible();
    await expect(backgroundIndicator).toHaveAttribute('data-state', 'default');

    await dimensionControl.getByRole('radio', { name: '2D' }).click();
    await expect.poll(() => page.evaluate(() => window.__helios.mode())).toBe('2d');
    await expect(dimensionIndicator).toHaveAttribute('data-state', 'changed');
    await expect(dimensionIndicator).toBeVisible();
    await expect(backgroundIndicator).toHaveAttribute('data-state', 'default');

    await dimensionControl.getByRole('radio', { name: '3D' }).click();
    await expect.poll(() => page.evaluate(() => window.__helios.mode())).toBe('3d');
    await expect(dimensionIndicator).toHaveAttribute('data-state', 'changed');
    await expect(backgroundIndicator).toHaveAttribute('data-state', 'default');

    const colors = await dimensionIndicator.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    });
    expect(colors.backgroundColor).not.toContain('22, 163, 74');
    expect(colors.borderColor).not.toContain('245, 158, 11');

    await dimensionIndicator.click();
    await page.getByRole('button', { name: 'Reset to default' }).click();
    await expect.poll(() => page.evaluate(() => window.__helios.mode())).toBe('2d');
    await expect(dimensionIndicator).toHaveAttribute('data-state', 'default');
    await expect(backgroundIndicator).toHaveAttribute('data-state', 'default');

    const dataPanel = panelByTitle(page, 'Data');
    const nameBar = dataPanel.locator('.helios-ui-network__name').first();
    const syncRow = dataPanel.locator('.helios-ui-network__sync-row').first();
    await expect(syncRow.locator('.helios-ui-network-persistence__status')).toHaveCount(1);
    await expect(syncRow.locator('.helios-ui-network-persistence__sync')).toBeVisible();
    await expect(syncRow.locator('.helios-ui-network-persistence__status')).toHaveText(/^(|Synced|Sync pending|Local saved|Remote failed|Network too large)/);
    await expect(nameBar.locator('.helios-ui-network-persistence__status')).toHaveCount(0);
    const nameOrder = await nameBar.evaluate((el) => Array.from(el.children).map((child) => ({
      tag: child.tagName.toLowerCase(),
      className: child.className,
    })));
    const syncOrder = await syncRow.evaluate((el) => Array.from(el.children).map((child) => ({
      tag: child.tagName.toLowerCase(),
      className: child.className,
    })));
    const inputIndex = nameOrder.findIndex((entry) => entry.tag === 'input');
    expect(inputIndex).toBeGreaterThanOrEqual(0);
    expect(syncOrder.some((entry) => String(entry.className).includes('helios-ui-network-persistence'))).toBe(true);
    expect(syncOrder.some((entry) => String(entry.className).includes('helios-ui-network-autosync'))).toBe(false);
    const persistenceOrder = await syncRow.locator('.helios-ui-network-persistence').first().evaluate((el) => (
      Array.from(el.children).map((child) => child.className)
    ));
    expect(String(persistenceOrder[0])).toContain('helios-ui-network-persistence__controls');
    expect(String(persistenceOrder[1])).toContain('helios-ui-network-persistence__status');
    await expect(syncRow.locator('.helios-ui-network-persistence__controls .helios-ui-network-autosync')).toHaveCount(1);
    const autoSyncToggle = syncRow.getByRole('switch', { name: 'Auto sync network persistence' });
    await expect(autoSyncToggle).toHaveAttribute('aria-checked', 'true');
    await autoSyncToggle.click();
    await expect(autoSyncToggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => page.evaluate(() => window.__helios.states.get('network.persistence.autosave'))).toBe(false);
    await autoSyncToggle.click();
    await expect(autoSyncToggle).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => page.evaluate(() => window.__helios.states.get('network.persistence.autosave'))).toBe(true);
  });

  test('network autosync URL flag initializes the Data sync row toggle', async ({ page }) => {
    const workspaceId = `autosync-off-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=120&session=1&workspaceId=${workspaceId}&networkAutosave=0`);
    await waitForHelios(page);
    const dataPanel = panelByTitle(page, 'Data');
    const autoSyncToggle = dataPanel.locator('.helios-ui-network__sync-row').getByRole('switch', {
      name: 'Auto sync network persistence',
    });
    await expect(autoSyncToggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(() => page.evaluate(() => window.__helios.states.get('network.persistence.autosave'))).toBe(false);
  });

  test('oversized position autosync disables the Data auto sync toggle and keeps dirty age status', async ({ page }) => {
    const workspaceId = `autosync-size-limit-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=120&session=1&workspaceId=${workspaceId}&restoreNetwork=0`);
    await waitForHelios(page);
    const dataPanel = panelByTitle(page, 'Data');
    const syncRow = dataPanel.locator('.helios-ui-network__sync-row').first();
    const status = syncRow.locator('.helios-ui-network-persistence__status');
    const autoSyncToggle = syncRow.getByRole('switch', {
      name: 'Auto sync network persistence',
    });

    await page.evaluate(async () => {
      const helios = window.__helios;
      await helios.storage.sync({
        includeNetwork: true,
        captureThumbnail: false,
        retention: { enabled: false },
      });
      helios.storage.configureSession?.({
        autosyncPayloadLimits: {
          positionMaxBytes: 1,
          networkMaxNodes: 1000,
        },
      });
      helios.storage.markPositionsDirty('test-oversized-positions');
    });

    await expect(autoSyncToggle).toBeDisabled();
    await expect(autoSyncToggle).toHaveAttribute('aria-checked', 'false');
    await expect(autoSyncToggle).toHaveAttribute('title', /Position autosync is disabled/);
    await expect(status).toHaveText(/^Synced \d+s ago$/);
    await expect.poll(() => page.evaluate(() => ({
      dirty: window.__helios.storage.status().networkData.dirty,
      positionsDirty: window.__helios.storage.status().networkData.positionsDirty,
      autosyncDisabled: window.__helios.storage.status().networkData.autosyncDisabled,
      autosave: window.__helios.states.get('network.persistence.autosave'),
    }))).toMatchObject({
      dirty: true,
      positionsDirty: true,
      autosyncDisabled: true,
      autosave: false,
    });
  });

  test('node size scale zero renders nodes with zero radius instead of a hidden size floor', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=120&session=0&restoreNetwork=0');
    await waitForHelios(page);
    await hideOverlayChrome(page);

    await page.evaluate(async () => {
      const helios = window.__helios;
      helios.background?.([0, 0, 0, 1]);
      helios.edgeOpacityScale?.(0);
      helios.edgeWidthScale?.(0);
      helios.nodeSizeBase?.(0);
      helios.nodeOutlineWidthBase?.(0);
      helios.nodeOutlineWidthScale?.(0);
      helios.nodeOpacityScale?.(1);
      helios.nodeSizeScale?.(4);
      helios.requestRender?.('test-node-size-visible');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect.poll(() => page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeWidthScale ?? null)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeOpacityScale ?? null)).toBe(0);
    const visiblePixels = await countCanvasBrightPixels(page);
    expect(visiblePixels).toBeGreaterThan(100);

    await page.evaluate(async () => {
      const helios = window.__helios;
      helios.states.set('appearance.nodeStyle.sizeScale', 0, {
        source: 'ui',
        reason: 'test-zero-node-size',
        journal: false,
      });
      helios.requestRender?.('test-node-size-zero');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await expect.poll(() => page.evaluate(() => window.__helios.nodeSizeScale())).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__helios.renderer?.graphLayer?.nodeSizeScale ?? null)).toBe(0);
    const zeroPixels = await countCanvasBrightPixels(page);
    expect(zeroPixels).toBeLessThan(5000);
    expect(zeroPixels).toBeLessThan(visiblePixels * 0.01);
  });

  test('restored persisted dimension remains marked as changed from defaults', async ({ page }) => {
    const sessionId = `dimension-restore-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const workspaceId = `dimension-restore-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = `/?renderer=webgl&layout=none&mode=2d&nodes=120&session=1&sessionId=${sessionId}&restoreNetwork=1&workspaceId=${workspaceId}&maxSessionBytes=0`;
    await page.goto(url);
    await waitForHelios(page);

    const scenePanel = panelByTitle(page, 'Scene');
    const dimensionRow = rowByTitle(scenePanel, 'Dimension');
    const dimensionIndicator = indicatorByPath(scenePanel, 'scene.dimension');
    const dimensionControl = dimensionRow.locator('[role="radiogroup"][aria-label="Scene dimension"]').first();
    await dimensionControl.getByRole('radio', { name: '3D' }).click();
    await expect.poll(() => page.evaluate(() => window.__helios.mode())).toBe('3d');
    await expect(dimensionIndicator).toHaveAttribute('data-state', 'changed');
    await page.evaluate(async () => {
      await window.__helios.storage.flush({
        includeNetwork: true,
        network: { format: 'zxnet' },
        snapshotLayoutRuntime: true,
      });
    });

    await page.goto('/tests/fixtures/blank.html');
    await page.goto(url);
    await waitForHelios(page);

    const restoredScenePanel = panelByTitle(page, 'Scene');
    const restoredIndicator = indicatorByPath(restoredScenePanel, 'scene.dimension');
    await expect.poll(() => page.evaluate(() => window.__helios.mode()), { timeout: 15000 }).toBe('3d');
    await expect(restoredIndicator).toHaveAttribute('data-state', 'changed');
    await expect.poll(() => page.evaluate(() => window.__helios.states.status('scene.dimension').state))
      .toBe('changed');
  });

  test('restoring node size does not create unrelated layout position markers', async ({ page }) => {
    const sessionId = `node-size-layout-clean-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const workspaceId = `node-size-layout-clean-workspace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const url = `/?renderer=webgl&layout=none&mode=2d&nodes=120&session=1&sessionId=${sessionId}&restoreNetwork=1&workspaceId=${workspaceId}&maxSessionBytes=0`;
    await page.goto(url);
    await waitForHelios(page);

    await page.evaluate(() => {
      window.__helios.nodeSizeScale(1.5);
    });
    await page.evaluate(async () => {
      await window.__helios.storage.flush({
        includeNetwork: true,
        network: { format: 'zxnet' },
        snapshotLayoutRuntime: true,
      });
    });

    await page.goto('/tests/fixtures/blank.html');
    await page.goto(url);
    await waitForHelios(page);

    const scenePanel = panelByTitle(page, 'Scene');
    const layoutPanel = panelByTitle(page, 'Layout');
    await expect(indicatorByPath(scenePanel, 'appearance.nodeStyle.sizeScale')).toHaveAttribute('data-state', 'changed');
    await expect(indicatorByPath(layoutPanel, 'layout.positionAttribute')).toHaveAttribute('data-state', 'default');
    await expect(indicatorByPath(layoutPanel, 'layout.positionAttribute')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__helios.states.status('layout.positionAttribute').state))
      .toBe('default');
  });

  test('node size default-value override stays marked until explicit reset', async ({ page }) => {
    const workspaceId = `node-size-default-reset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto(`/?renderer=webgl&layout=none&mode=2d&nodes=120&session=1&workspaceId=${workspaceId}&restoreNetwork=1&maxSessionBytes=0`);
    await waitForHelios(page);

    const scenePanel = panelByTitle(page, 'Scene');
    const nodeSizeRow = rowByTitle(scenePanel, 'Node Size Scale');
    const nodeSizeInput = nodeSizeRow.locator('input[type="number"]').first();
    const nodeSizeIndicator = indicatorByPath(scenePanel, 'appearance.nodeStyle.sizeScale');
    await expect(nodeSizeIndicator).toHaveAttribute('data-state', 'default');

    await nodeSizeInput.fill('1');
    await nodeSizeInput.press('Enter');

    await expect(nodeSizeInput).toHaveValue('1.000');
    await expect(nodeSizeIndicator).toHaveAttribute('data-state', 'changed');
    await expect.poll(() => page.evaluate(() => (
      window.__helios.states.status('appearance.nodeStyle.sizeScale').state
    ))).toBe('changed');

    await nodeSizeIndicator.click();
    await page.locator('.helios-ui-dirty-menu .helios-ui-dirty-menu__item', { hasText: 'Reset to default' }).click();

    await expect(nodeSizeInput).toHaveValue('1.000');
    await expect(nodeSizeIndicator).toHaveAttribute('data-state', 'default');
    await expect(nodeSizeIndicator).toBeHidden();
    await expect.poll(() => page.evaluate(() => (
      window.__helios.states.status('appearance.nodeStyle.sizeScale').state
    ))).toBe('default');
  });

  test('fresh URL session starts without appearance markers', async ({ page }) => {
    const workspaceId = `fresh-url-marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessionId = `fresh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(`/?renderer=webgl&nodes=10000&workspaceId=${workspaceId}&sessionId=${encodeURIComponent(sessionId)}`);
    await waitForHelios(page);
    await page.waitForTimeout(1000);

    const scenePanel = panelByTitle(page, 'Scene');
    await expect(scenePanel).toBeVisible();
    const visibleAppearanceMarkers = await visibleDirtyMarkers(scenePanel);
    expect(visibleAppearanceMarkers).toEqual([]);
    expect(await page.evaluate(() => window.__helios?.behavior?.interface?.resumePrompt?.() ?? null)).toBeNull();
  });

  test('debug panel is present by default and layout stop/start does not mark appearance', async ({ page }) => {
    const workspaceId = `debug-layout-marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sessionId = `debug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(`/?renderer=webgl&nodes=1000&workspaceId=${workspaceId}&sessionId=${encodeURIComponent(sessionId)}`);
    await waitForHelios(page);

    const debugPanel = panelByTitle(page, 'Debug');
    await expect(debugPanel).toBeVisible();

    const scenePanel = panelByTitle(page, 'Scene');
    await expect(scenePanel).toBeVisible();
    await expect.poll(() => visibleDirtyMarkers(scenePanel)).toEqual([]);

    await page.evaluate(() => {
      window.__helios.stopLayout?.('test-layout-toggle');
      window.__helios.startLayout?.('test-layout-toggle');
    });

    await expect.poll(() => visibleDirtyMarkers(scenePanel)).toEqual([]);
    const appearanceOverrides = await page.evaluate(() => (
      window.__helios.states
        .overrideKeys()
        .filter((key) => key === 'appearance' || key.startsWith('appearance.') || key.startsWith('behaviors.appearance.'))
    ));
    expect(appearanceOverrides).toEqual([]);
  });

  test('layout parameter persistence markers are registry-driven', async ({ page }) => {
    const workspaceId = `layout-marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await page.goto(`/?renderer=webgl&layout=gpuforce&mode=2d&nodes=120&session=1&workspaceId=${workspaceId}`);
    await waitForHelios(page);

    const layoutPanel = panelByTitle(page, 'Layout');
    await expect(layoutPanel).toBeVisible();
    const gravityIndicator = indicatorByPath(layoutPanel, 'layout.parameters.kGravity');
    await expect(gravityIndicator).toHaveAttribute('data-state', 'default');
    await expect.poll(() => page.evaluate(() => (
      window.__helios.states.status('layout.parameters.kGravity')?.defaultValue
    ))).toBeGreaterThan(0);

    const gravityRow = rowByTitle(layoutPanel, 'Gravity');
    const gravityInput = gravityRow.locator('input[type="number"]').first();
    await expect(gravityInput).toBeVisible();
    await gravityInput.fill('0.002');
    await gravityInput.dispatchEvent('change');

    await expect.poll(() => page.evaluate(() => (
      window.__helios.states.get('layout.parameters.kGravity')
    ))).toBeCloseTo(0.002, 6);
    await expect(gravityIndicator).toHaveAttribute('data-state', 'changed');
    const markerMatchesRegistry = await gravityIndicator.evaluate((el) => (
      el.dataset.state === window.__helios.states.status(el.dataset.path, {
        scope: el.dataset.scope,
        mode: el.dataset.mode,
      })?.state
    ));
    expect(markerMatchesRegistry).toBe(true);
  });

  test('groups controls into Scene tabs and keeps renderer bindings working', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=500');
    await waitForHelios(page);

    const scenePanel = panelByTitle(page, 'Scene');
    await expect(scenePanel).toBeVisible();

    const dataPanel = panelByTitle(page, 'Data');
    await expect(dataPanel).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-stat__label', { hasText: 'Nodes' })).toBeVisible();
    await expect(dataPanel.getByRole('button', { name: /Load network/ })).toBeVisible();
    await expect(dataPanel.getByRole('button', { name: 'Save network' })).toBeVisible();

    const metricsPanel = panelByTitle(page, 'Metrics');
    await expect(metricsPanel).toBeVisible();

    const stackGaps = await page.evaluate(() => {
      const ids = ['helios-ui-data', 'helios-ui-demo', 'helios-ui-metrics'];
      const rects = ids
        .map((id) => document.querySelector(`.helios-ui-panel[data-panel-id="${id}"]`))
        .filter(Boolean)
        .map((el) => {
          const rect = el.getBoundingClientRect();
          return {
            id: el.dataset.panelId,
            top: rect.top,
            bottom: rect.bottom,
          };
        })
        .sort((a, b) => a.top - b.top);
      if (rects.length < 3) return null;
      return [
        rects[1].top - rects[0].bottom,
        rects[2].top - rects[1].bottom,
      ];
    });
    expect(stackGaps).not.toBeNull();
    expect(Math.abs(stackGaps[0])).toBeLessThanOrEqual(1.5);
    expect(Math.abs(stackGaps[1])).toBeLessThanOrEqual(1.5);

    const resizeHandle = dataPanel.locator('.helios-ui-resize-handle[data-edge="right"]').first();
    await expect(resizeHandle).toBeVisible();
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2 + 64, handleBox.y + handleBox.height / 2, { steps: 8 });
    await page.mouse.up();

    const dockWidths = await page.evaluate(() => {
      const readWidth = (id) => {
        const el = document.querySelector(`.helios-ui-panel[data-panel-id="${id}"]`);
        return el ? el.getBoundingClientRect().width : null;
      };
      return {
        data: readWidth('helios-ui-data'),
        scene: readWidth('helios-ui-demo'),
        metrics: readWidth('helios-ui-metrics'),
      };
    });
    expect(dockWidths.data).not.toBeNull();
    expect(dockWidths.scene).not.toBeNull();
    expect(dockWidths.metrics).not.toBeNull();
    expect(Math.abs(dockWidths.data - dockWidths.scene)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(dockWidths.data - dockWidths.metrics)).toBeLessThanOrEqual(1.5);

    await expect(scenePanel.getByRole('button', { name: 'Appearance' }).first()).toBeVisible();
    await expect(scenePanel.getByRole('button', { name: 'Labels' }).first()).toBeVisible();
    await expect(scenePanel.getByRole('button', { name: 'Advanced' }).first()).toBeVisible();

    const appearanceTab = scenePanel.getByRole('button', { name: 'Appearance' }).first();
    await appearanceTab.click();

    const appearanceBindingState = await page.evaluate(() => ({
      sameInstance: window.__heliosUI?._lastAppearanceBehavior === window.__helios?.behavior?.appearance,
      blendMode: window.__heliosUI?._lastAppearanceBehavior?.edgeTransparencyMode?.(),
      shadedEnabled: window.__heliosUI?._lastAppearanceBehavior?.shadedEnabled?.(),
    }));
    expect(appearanceBindingState).toEqual({
      sameInstance: true,
      blendMode: 'weighted',
      shadedEnabled: false,
    });

    const labels = await scenePanel.locator('.helios-ui-tabpanel[data-active="true"] .helios-ui-subpanel__label').evaluateAll((els) =>
      els.map((el) => (el.textContent ?? '').trim()).filter(Boolean),
    );

    // Appearance tab should expose collapsible Nodes/Edges groups.
    expect(labels).toContain('Nodes');
    expect(labels).toContain('Edges');
    expect(labels).toContain('Shaded');
    const iNodes = labels.indexOf('Nodes');
    const iEdges = labels.indexOf('Edges');
    const iShaded = labels.indexOf('Shaded');
    expect(iNodes).toBeGreaterThanOrEqual(0);
    expect(iEdges).toBeGreaterThanOrEqual(0);
    expect(iShaded).toBeGreaterThanOrEqual(0);
    expect(iNodes).toBeLessThan(iEdges);
    expect(iEdges).toBeLessThan(iShaded);

    // Theme row is directly visible in Appearance (not in a subpanel).
    await expect(scenePanel.locator('.helios-ui-label__title', { hasText: 'Theme' }).first()).toBeVisible();

    const shadedHeader = scenePanel.getByRole('button', { name: 'Shaded' }).first();
    await expect(shadedHeader).toBeVisible();

    const shadedToggle = scenePanel.locator('[role="switch"][aria-label="Shaded"]').first();
    await expect(shadedToggle).toBeVisible();
    await expect(shadedToggle).toHaveAttribute('aria-checked', 'false');

    if ((await shadedHeader.getAttribute('aria-expanded')) === 'false') {
      await shadedHeader.click();
    }

    const shadedSubpanel = scenePanel
      .locator('.helios-ui-subpanel:has(.helios-ui-subpanel__label:has-text("Shaded"))')
      .first();
    const shadedNodesToggle = shadedSubpanel.locator('[role="switch"][aria-label="Nodes"]').first();
    const shadedEdgesToggle = shadedSubpanel.locator('[role="switch"][aria-label="Edges"]').first();
    await expect(shadedNodesToggle).toBeVisible();
    await expect(shadedEdgesToggle).toBeVisible();
    await expect(shadedNodesToggle).toHaveAttribute('aria-checked', 'true');
    await expect(shadedEdgesToggle).toHaveAttribute('aria-checked', 'false');

    await shadedToggle.click();
    await expect(shadedToggle).toHaveAttribute('aria-checked', 'true');

    const shadedState = await page.evaluate(() => ({
      enabled: window.__helios.shadedEnabled(),
      nodes: window.__helios.shadedNodes(),
      edges: window.__helios.shadedEdges(),
      behaviorEnabled: window.__helios.behavior.appearance.shadedEnabled(),
    }));
    expect(shadedState).toEqual({
      enabled: true,
      nodes: true,
      edges: false,
      behaviorEnabled: true,
    });

    const shadedLightDirectionBefore = await page.evaluate(() => window.__helios.shadedLightDirection());

    const shadedLightDirectionPad = shadedSubpanel.locator('[data-testid="controls-shaded-light-direction"]').first();
    const shadedLightX = shadedSubpanel.locator('[data-testid="controls-shaded-light-direction-x"]').first();
    const shadedLightY = shadedSubpanel.locator('[data-testid="controls-shaded-light-direction-y"]').first();
    const shadedLightZ = shadedSubpanel.locator('[data-testid="controls-shaded-light-direction-z"]').first();
    await expect(shadedLightDirectionPad).toBeVisible();
    await expect(shadedLightX).toBeVisible();
    await expect(shadedLightY).toBeVisible();
    await expect(shadedLightZ).toBeVisible();
    await shadedLightX.fill('0.25');
    await shadedLightX.dispatchEvent('change');

    const shadedLightDirection = await page.evaluate(() => window.__helios.shadedLightDirection());
    expect(shadedLightDirection[0]).not.toBeCloseTo(shadedLightDirectionBefore[0], 3);
    const shadedLightDirectionLength = Math.hypot(
      shadedLightDirection[0],
      shadedLightDirection[1],
      shadedLightDirection[2],
    );
    expect(shadedLightDirectionLength).toBeCloseTo(1, 3);

    const directionBox = await shadedLightDirectionPad.boundingBox();
    expect(directionBox).not.toBeNull();
    await page.mouse.move(directionBox.x + directionBox.width / 2, directionBox.y + directionBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(directionBox.x + directionBox.width * 0.2, directionBox.y + directionBox.height * 0.2, { steps: 4 });
    await page.mouse.up();
    const draggedLightDirection = await page.evaluate(() => window.__helios.shadedLightDirection());
    expect(draggedLightDirection[0]).toBeLessThan(-0.2);
    expect(draggedLightDirection[1]).toBeGreaterThan(0.2);
    expect(Math.hypot(...draggedLightDirection)).toBeCloseTo(1, 3);
    await expect.poll(async () => Number(await shadedLightX.inputValue())).toBeCloseTo(draggedLightDirection[0], 2);
    await expect.poll(async () => Number(await shadedLightY.inputValue())).toBeCloseTo(draggedLightDirection[1], 2);
    await expect.poll(async () => Number(await shadedLightZ.inputValue())).toBeCloseTo(draggedLightDirection[2], 2);

    const shadedDiffuse = shadedSubpanel.locator(
      'xpath=.//*[contains(@class,"helios-ui-row")][.//*[contains(@class,"helios-ui-label__title") and normalize-space()="Diffuse"]]//input[@type="number"]',
    ).first();
    await shadedDiffuse.fill('0.4');
    await shadedDiffuse.dispatchEvent('change');
    await expect.poll(async () => page.evaluate(() => window.__helios.shadedDiffuseStrength())).toBeCloseTo(0.4, 3);

    const shadedAmbient = shadedSubpanel.locator(
      'xpath=.//*[contains(@class,"helios-ui-row")][.//*[contains(@class,"helios-ui-label__title") and normalize-space()="Ambient"]]//input[@type="number"]',
    ).first();
    await shadedAmbient.fill('1.6');
    await shadedAmbient.dispatchEvent('change');
    await expect.poll(async () => page.evaluate(() => window.__helios.shadedAmbientStrength())).toBeCloseTo(1.6, 3);

    await expect(scenePanel.getByRole('button', { name: 'Ambient Occlusion' }).first()).toBeVisible();
    await expect(scenePanel.locator('[role="switch"][aria-label="Ambient Occlusion"]').first()).toBeVisible();

    const dimensionControl = scenePanel.locator('[role="radiogroup"][aria-label="Scene dimension"]').first();
    const to3DOption = dimensionControl.getByRole('radio', { name: '3D' }).first();
    const to2DOption = dimensionControl.getByRole('radio', { name: '2D' }).first();
    await expect(dimensionControl).toBeVisible();
    await expect(to2DOption).toHaveAttribute('aria-checked', 'true');
    await to3DOption.click();
    await expect(to3DOption).toHaveAttribute('aria-checked', 'true');
    const sceneMode3D = await page.evaluate(() => window.__helios.mode());
    expect(sceneMode3D).toBe('3d');

    await page.evaluate(() => window.__helios.setMode('2d'));
    await expect(to2DOption).toHaveAttribute('aria-checked', 'true');

    const nodesHeader = scenePanel.getByRole('button', { name: 'Nodes' }).first();
    if ((await nodesHeader.getAttribute('aria-expanded')) === 'false') {
      await nodesHeader.click();
    }

    // Ensure Theme is not inside Nodes anymore.
    const nodesSubpanel = scenePanel
      .locator('.helios-ui-subpanel:has(.helios-ui-subpanel__label:has-text("Nodes"))')
      .first();
    const nodesTheme = nodesSubpanel.locator('.helios-ui-label__title', { hasText: 'Theme' });
    await expect(nodesTheme).toHaveCount(0);

    // Background color + alpha should update helios renderer clearColor.
    const bgColor = scenePanel.locator('input[type="color"][aria-label="Background color"]').first();
    const bgAlpha = scenePanel.locator('input[type="number"][aria-label="Background color alpha"]').first();

    await expect(bgColor).toBeVisible();
    await expect(bgAlpha).toBeVisible();

    await bgAlpha.fill('0.5');
    await bgAlpha.dispatchEvent('change');

    await bgColor.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, '#ff0000');

    const clearColor = await page.evaluate(() => window.__helios.clearColor());
    expect(clearColor[0]).toBeCloseTo(1, 2);
    expect(clearColor[1]).toBeCloseTo(0, 2);
    expect(clearColor[2]).toBeCloseTo(0, 2);
    expect(clearColor[3]).toBeCloseTo(0.5, 2);

    // Edge transparency mode selector should update graph layer.
    const edgeMode = scenePanel.locator('select[aria-label="Edge transparency mode"]').first();
    await expect(edgeMode).toBeVisible();
    const initialEdgeMode = await page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeTransparencyMode ?? null);
    expect(['weighted', 'alpha']).toContain(initialEdgeMode);
    await expect(edgeMode).toHaveValue(initialEdgeMode);
    await edgeMode.selectOption({ value: 'additive' });

    const mode = await page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeTransparencyMode ?? null);
    expect(mode).toBe('additive');

    // Regression: 'screen' should not throw on selection.
    await edgeMode.selectOption({ value: 'screen' });
    const screenMode = await page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeTransparencyMode ?? null);
    expect(screenMode).toBe('screen');

    const adaptiveHeader = scenePanel.getByRole('button', { name: 'Adaptive' }).first();
    await expect(adaptiveHeader).toBeVisible();
    if ((await adaptiveHeader.getAttribute('aria-expanded')) === 'false') {
      await adaptiveHeader.click();
    }

    const adaptiveEnabled = scenePanel.locator('[role="switch"][aria-label="Adaptive Edges"]').first();
    await expect(adaptiveEnabled).toBeVisible();
    await expect(adaptiveEnabled).toHaveAttribute('aria-checked', 'false');

    const adaptiveThresholdRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Slow Frame"))')
      .first();
    await adaptiveThresholdRow.locator('input[type="number"]').fill('28');
    await adaptiveThresholdRow.locator('input[type="number"]').dispatchEvent('change');

    const adaptiveFramesRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Averaging Frames"))')
      .first();
    await adaptiveFramesRow.locator('input[type="number"]').fill('4');
    await adaptiveFramesRow.locator('input[type="number"]').dispatchEvent('change');

    const adaptiveRetryRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Probe Interval"))')
      .first();
    await adaptiveRetryRow.locator('input[type="number"]').fill('1400');
    await adaptiveRetryRow.locator('input[type="number"]').dispatchEvent('change');

    const adaptiveIdleRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Interaction Hold"))')
      .first();
    await adaptiveIdleRow.locator('input[type="number"]').fill('180');
    await adaptiveIdleRow.locator('input[type="number"]').dispatchEvent('change');

    const adaptiveConfig = await page.evaluate(() => window.__helios.edgeAdaptiveQuality());
    expect(adaptiveConfig.enabled).toBe(false);
    expect(adaptiveConfig.slowFrameThresholdMs).toBe(28);
    expect(adaptiveConfig.slowFrameConsecutiveFrames).toBe(4);
    expect(adaptiveConfig.probeIntervalMs).toBe(1400);
    expect(adaptiveConfig.interactionHoldMs).toBe(180);

    const labelsTab = scenePanel.getByRole('button', { name: 'Labels' }).first();
    await labelsTab.click();

    const labelModeSelect = scenePanel.locator('select[aria-label="Label Mode"]').first();
    await labelModeSelect.selectOption('auto');
    const labelsAuto = await page.evaluate(() => ({
      enabled: window.__helios.labels().enabled === true,
      selectionMode: window.__helios.labels().selectionMode ?? null,
      mode: window.__helios.labelsMode?.() ?? null,
    }));
    expect(labelsAuto).toEqual({
      enabled: true,
      selectionMode: 'ranked',
      mode: 'auto',
    });

    const selectedOnlySpaceAwareRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Use Available Space"))')
      .first();
    await expect(selectedOnlySpaceAwareRow).toBeHidden();

    await labelModeSelect.selectOption('selected-only');
    await expect(selectedOnlySpaceAwareRow).toBeVisible();

    const selectedOnlySpaceAwareToggle = selectedOnlySpaceAwareRow.locator(
      '[role="switch"][aria-label="Selected-only labels use regular space-aware placement"], input[type="checkbox"][aria-label="Selected-only labels use regular space-aware placement"]',
    ).first();
    await enableToggle(selectedOnlySpaceAwareToggle);
    const selectedOnlySpaceAware = await page.evaluate(() => ({
      mode: window.__helios.labelsMode?.() ?? null,
      selectedOnlySpaceAware: window.__helios.labels()?.selectedOnlySpaceAware === true,
    }));
    expect(selectedOnlySpaceAware).toEqual({
      mode: 'selected-only',
      selectedOnlySpaceAware: true,
    });

    const maxLabelsRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Max Visible"))')
      .first();
    const maxLabelsInput = maxLabelsRow.locator('input[type="number"]').first();
    await maxLabelsInput.fill('18');
    await maxLabelsInput.dispatchEvent('change');
    const maxLabels = await page.evaluate(() => window.__helios.labels().maxVisible ?? null);
    expect(maxLabels).toBe(18);

    const labelRadiusFactorRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Offset Radius Factor"))')
      .first();
    await expect(labelRadiusFactorRow).toBeVisible();
    const labelRadiusFactorInput = labelRadiusFactorRow.locator('input[type="number"]').first();
    await labelRadiusFactorInput.fill('-0.5');
    await labelRadiusFactorInput.dispatchEvent('change');
    const labelRadiusFactor = await page.evaluate(() => window.__helios.labels()?.offsetRadiusFactor ?? null);
    expect(labelRadiusFactor).toBeCloseTo(-0.5, 3);

    const labelPixelOffsetRow = rowByTitle(scenePanel, 'Offset');
    await expect(labelPixelOffsetRow).toBeVisible();
    const labelPixelOffsetInput = labelPixelOffsetRow.locator('input[type="number"]').first();
    await labelPixelOffsetInput.fill('9');
    await labelPixelOffsetInput.dispatchEvent('change');
    const labelPixelOffset = await page.evaluate(() => window.__helios.labels()?.offsetPx ?? null);
    expect(labelPixelOffset).toBe(9);

    const labelMaxCharsRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Max Chars"))')
      .first();
    await expect(labelMaxCharsRow).toBeVisible();
    const labelMaxCharsInput = labelMaxCharsRow.locator('input[type="number"]').first();
    await labelMaxCharsInput.fill('12');
    await labelMaxCharsInput.dispatchEvent('change');
    const labelMaxChars = await page.evaluate(() => window.__helios.labels()?.maxChars ?? null);
    expect(labelMaxChars).toBe(12);

    const labelMaxRowsRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Max Rows"))')
      .first();
    await expect(labelMaxRowsRow).toBeVisible();
    const labelMaxRowsInput = labelMaxRowsRow.locator('input[type="number"]').first();
    await labelMaxRowsInput.fill('3');
    await labelMaxRowsInput.dispatchEvent('change');
    const labelMaxRows = await page.evaluate(() => window.__helios.labels()?.maxRows ?? null);
    expect(labelMaxRows).toBe(3);

    const labelSource = scenePanel.locator('select[aria-label="Label source attribute"]').first();
    await expect(labelSource).toBeVisible();
    const sourceValues = await labelSource.locator('option').evaluateAll((opts) => opts.map((opt) => opt.value));
    expect(sourceValues).toContain('');
    expect(sourceValues).toContain('$index');
    await labelSource.selectOption('$index');
    const labelSourceValue = await page.evaluate(() => ({
      accessor: window.__helios.labelSource?.() ?? null,
      behavior: window.__helios.behavior?.labels?.state?.source ?? null,
    }));
    expect(labelSourceValue).toEqual({ accessor: '$id', behavior: '$id' });

    const labelFontFamily = scenePanel.locator('input[aria-label="Label font family"]').first();
    await expect(labelFontFamily).toBeVisible();
    await labelFontFamily.fill('Menlo, monospace');
    await labelFontFamily.dispatchEvent('change');
    const fontFamily = await page.evaluate(() => ({
      accessor: window.__helios.labelFontFamily?.() ?? '',
      behavior: window.__helios.behavior?.labels?.state?.fontFamily ?? '',
    }));
    expect(fontFamily.accessor).toContain('Menlo');
    expect(fontFamily.behavior).toContain('Menlo');

    const labelFill = scenePanel.locator('input[type="color"][aria-label="Label fill color"]').first();
    const labelFillAlpha = scenePanel.locator('input[type="number"][aria-label="Label fill color alpha"]').first();
    await expect(labelFill).toBeVisible();
    await expect(labelFillAlpha).toBeVisible();
    await labelFillAlpha.fill('0.75');
    await labelFillAlpha.dispatchEvent('change');
    await labelFill.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, '#00ff00');
    const labelFillValue = await page.evaluate(() => ({
      accessor: String(window.__helios.labelFill?.() ?? ''),
      behavior: String(window.__helios.behavior?.labels?.state?.fill ?? ''),
    }));
    expect(labelFillValue.accessor.toLowerCase()).toContain('#00ff00');
    expect(labelFillValue.behavior.toLowerCase()).toContain('#00ff00');

    const advancedTab = scenePanel.getByRole('button', { name: 'Advanced' }).first();
    await advancedTab.click();

    const nodeBlendToggle = scenePanel.locator('[aria-label="Blend Nodes"][role="switch"], input[type="checkbox"][aria-label="Blend Nodes"]');
    await enableToggle(nodeBlendToggle);
    const nodeBlendValue = await page.evaluate(() => window.__helios.renderer?.graphLayer?.nodeBlendWithEdges ?? null);
    expect(nodeBlendValue).toBe(true);

    const edgeDepthToggle = scenePanel.locator('[aria-label="Edge Depth Write"][role="switch"], input[type="checkbox"][aria-label="Edge Depth Write"]');
    await enableToggle(edgeDepthToggle);
    const edgeDepthValue = await page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeDepthWrite ?? null);
    expect(edgeDepthValue).toBe(true);

    const edgeWidthClampToggle = scenePanel.locator('[aria-label="Clamp Edge Widths"][role="switch"], input[type="checkbox"][aria-label="Clamp Edge Widths"]');
    await expect(edgeWidthClampToggle).toHaveAttribute('aria-checked', 'true');
    await disableToggle(edgeWidthClampToggle);
    const edgeWidthClampValue = await page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeWidthClampToNodeDiameter ?? null);
    expect(edgeWidthClampValue).toBe(false);

    const semanticZoomRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Semantic Zoom Exp."))')
      .first();
    await expect(semanticZoomRow).toBeVisible();
    const semanticZoomInput = semanticZoomRow.locator('input[type="number"]').first();
    await semanticZoomInput.fill('0.65');
    await semanticZoomInput.dispatchEvent('change');
    const semanticZoomExponent = await page.evaluate(() => window.__helios.renderer?.graphLayer?.semanticZoomExponent ?? null);
    expect(semanticZoomExponent).toBeCloseTo(0.65, 3);

    const supersamplingSelect = scenePanel.locator('select[aria-label="Supersampling"]').first();
    await expect(supersamplingSelect).toBeVisible();

    const initialSampling = await page.evaluate(() => {
      const canvas = document.querySelector('canvas.helios-layer-canvas3d');
      const rect = canvas?.getBoundingClientRect?.();
      return {
        windowDpr: window.devicePixelRatio || 1,
        sizeDpr: window.__helios?.size?.devicePixelRatio ?? null,
        canvasWidth: canvas?.width ?? null,
        cssWidth: rect?.width ?? null,
      };
    });
    expect(initialSampling.sizeDpr).toBeCloseTo(
      initialSampling.windowDpr < 2 ? initialSampling.windowDpr * 2 : initialSampling.windowDpr,
      3,
    );

    await supersamplingSelect.selectOption('off');
    await page.waitForFunction(() => {
      const base = window.devicePixelRatio || 1;
      return Math.abs((window.__helios?.size?.devicePixelRatio ?? 0) - base) < 1e-6;
    });
    const supersamplingOff = await page.evaluate(() => ({
      sizeDpr: window.__helios?.size?.devicePixelRatio ?? null,
      value: window.__helios?.supersampling?.() ?? null,
    }));
    expect(supersamplingOff.value).toBe('off');
    expect(supersamplingOff.sizeDpr).toBeCloseTo(initialSampling.windowDpr, 3);

    await supersamplingSelect.selectOption('2x');
    await page.waitForFunction(() => {
      const base = window.devicePixelRatio || 1;
      return Math.abs((window.__helios?.size?.devicePixelRatio ?? 0) - (base * 2)) < 1e-6;
    });
    const supersampling2x = await page.evaluate(() => ({
      sizeDpr: window.__helios?.size?.devicePixelRatio ?? null,
      value: window.__helios?.supersampling?.() ?? null,
    }));
    expect(supersampling2x.value).toBe('2x');
    expect(supersampling2x.sizeDpr).toBeCloseTo(initialSampling.windowDpr * 2, 3);
  });

  test('legends panel forwards typed values without panel-side clamping', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForHelios(page);

    const legendsPanel = panelByTitle(page, 'Legends');
    await expect(legendsPanel).toBeVisible();

    await page.evaluate(() => {
      window.__legendPatches = [];
      const behavior = window.__helios?.behavior?.legends;
      const original = behavior.update.bind(behavior);
      behavior.update = function legendsUpdateSpy(options) {
        window.__legendPatches.push(JSON.parse(JSON.stringify(options)));
        return original(options);
      };
    });

    const scaleRow = legendsPanel.locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Scale"))').first();
    const scaleInput = scaleRow.locator('input[type="number"]').first();
    await expect(scaleInput).toHaveAttribute('max', '3');
    await scaleInput.fill('5');
    await scaleInput.dispatchEvent('change');

    await expect.poll(async () => page.evaluate(() => window.__legendPatches.at(-1)?.scale ?? null)).toBe(5);
    await expect.poll(async () => page.evaluate(() => window.__helios.behavior?.legends?.state?.scale ?? null)).toBe(3);
  });

  test('dimension toggle animates into 3D and keeps layout=none scenes visible', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForHelios(page);

    const scenePanel = panelByTitle(page, 'Scene');
    await expect(scenePanel).toBeVisible();
    await scenePanel.getByRole('button', { name: 'Appearance' }).first().click();

    const dimensionControl = scenePanel.locator('[role="radiogroup"][aria-label="Scene dimension"]').first();
    const to3DOption = dimensionControl.getByRole('radio', { name: '3D' }).first();
    const to2DOption = dimensionControl.getByRole('radio', { name: '2D' }).first();
    await expect(to2DOption).toHaveAttribute('aria-checked', 'true');

    const beforePixels = await countNonBackgroundPixels(page);
    expect(beforePixels).toBeGreaterThan(500);

    await to3DOption.click();
    await expect(to3DOption).toHaveAttribute('aria-checked', 'true');
    await page.waitForTimeout(80);

    const midTransition = await page.evaluate(() => {
      const camera = window.__helios?.renderer?.camera;
      return camera ? {
        mode: camera.mode,
        projection: camera.projection,
        rotation: Array.from(camera.rotation ?? []),
      } : null;
    });
    expect(midTransition?.mode).toBe('3d');
    expect(midTransition?.projection).toBe('perspective');
    expect(midTransition?.rotation?.some((value) => Math.abs(value) > 1e-3)).toBe(true);

    await page.waitForTimeout(450);
    const afterPixels = await countNonBackgroundPixels(page);
    expect(afterPixels).toBeGreaterThan(500);
  });

  test('camera orbit uses axis selector control', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=3d&nodes=400');
    await waitForHelios(page);

    const cameraPanel = panelByTitle(page, 'Camera');
    await expect(cameraPanel).toBeVisible();

    const orbitHeader = cameraPanel.getByRole('button', { name: 'Orbit' }).first();
    await expect(orbitHeader).toBeVisible();
    if ((await orbitHeader.getAttribute('aria-expanded')) === 'false') {
      await orbitHeader.click();
    }

    await expect(cameraPanel.locator('.helios-ui-label__title', { hasText: 'Orbit Tilt' })).toHaveCount(0);
    const orbitAxisPad = cameraPanel.locator('[data-testid="controls-camera-orbit-axis"]').first();
    const orbitAxisX = cameraPanel.locator('[data-testid="controls-camera-orbit-axis-x"]').first();
    const orbitAxisY = cameraPanel.locator('[data-testid="controls-camera-orbit-axis-y"]').first();
    const orbitAxisZ = cameraPanel.locator('[data-testid="controls-camera-orbit-axis-z"]').first();
    await expect(orbitAxisPad).toBeVisible();
    await expect(orbitAxisX).toBeVisible();
    await expect(orbitAxisY).toBeVisible();
    await expect(orbitAxisZ).toBeVisible();

    await orbitAxisX.fill('0');
    await orbitAxisX.dispatchEvent('change');
    await orbitAxisY.fill('1');
    await orbitAxisY.dispatchEvent('change');
    await orbitAxisZ.fill('0');
    await orbitAxisZ.dispatchEvent('change');

    const verticalAxisAlignment = await page.evaluate(() => {
      const camera = window.__helios.renderer.camera;
      camera.updateBasis();
      const axis = window.__helios.cameraControls().orbitAxis;
      const up = Array.from(camera.up);
      return axis[0] * up[0] + axis[1] * up[1] + axis[2] * up[2];
    });
    expect(verticalAxisAlignment).toBeGreaterThan(0.98);

    const orbitToggle = cameraPanel.locator('[role="switch"][aria-label="Orbit target"]').first();
    await page.evaluate(() => {
      window.__helios.cameraControls({ orbitSpeed: 1 });
    });
    const startRight = await page.evaluate(() => {
      const camera = window.__helios.renderer.camera;
      camera.updateBasis();
      return Array.from(camera.right);
    });
    await orbitToggle.click();
    await expect(orbitToggle).toHaveAttribute('aria-checked', 'true');
    await page.waitForFunction((initialRight) => {
      const camera = window.__helios.renderer.camera;
      camera.updateBasis();
      const right = Array.from(camera.right);
      const dot = right[0] * initialRight[0] + right[1] * initialRight[1] + right[2] * initialRight[2];
      return Math.abs(dot) < 0.35;
    }, startRight);
    await page.evaluate(() => {
      window.__helios.cameraControls({ orbitSpeed: 0 });
    });
    await page.waitForTimeout(80);
    await expect.poll(async () => Number(await orbitAxisY.inputValue())).toBeCloseTo(1, 2);

    await orbitAxisX.fill('1');
    await orbitAxisX.dispatchEvent('change');
    await orbitAxisY.fill('0');
    await orbitAxisY.dispatchEvent('change');
    await orbitAxisZ.fill('0');
    await orbitAxisZ.dispatchEvent('change');

    const activeOrbitAxisAlignment = await page.evaluate(() => {
      const camera = window.__helios.renderer.camera;
      camera.updateBasis();
      const axis = window.__helios.cameraControls().orbitAxis;
      const right = Array.from(camera.right);
      return axis[0] * right[0] + axis[1] * right[1] + axis[2] * right[2];
    });
    expect(activeOrbitAxisAlignment).toBeGreaterThan(0.98);

    await orbitAxisX.fill('0');
    await orbitAxisX.dispatchEvent('change');
    await orbitAxisY.fill('1');
    await orbitAxisY.dispatchEvent('change');
    await orbitAxisZ.fill('0');
    await orbitAxisZ.dispatchEvent('change');

    await orbitToggle.click();
    await expect(orbitToggle).toHaveAttribute('aria-checked', 'false');
    const axisBox = await orbitAxisPad.boundingBox();
    expect(axisBox).not.toBeNull();
    await page.mouse.move(axisBox.x + axisBox.width * 0.5, axisBox.y + axisBox.height * 0.9);
    await page.mouse.down();
    await page.mouse.move(axisBox.x + axisBox.width * 0.9, axisBox.y + axisBox.height * 0.5, { steps: 4 });
    await page.mouse.up();

    const draggedViewAxis = await page.evaluate(() => {
      const camera = window.__helios.renderer.camera;
      camera.updateBasis();
      const axis = window.__helios.cameraControls().orbitAxis;
      const right = Array.from(camera.right);
      const up = Array.from(camera.up);
      const forward = Array.from(camera.forward);
      return [
        axis[0] * right[0] + axis[1] * right[1] + axis[2] * right[2],
        axis[0] * up[0] + axis[1] * up[1] + axis[2] * up[2],
        -(axis[0] * forward[0] + axis[1] * forward[1] + axis[2] * forward[2]),
      ];
    });
    expect(draggedViewAxis[0]).toBeLessThan(-0.5);
    expect(draggedViewAxis[2]).toBeLessThan(-0.1);
  });

  test('dimension toggle keeps layout=none scenes visible when going from 3D to 2D', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=3d&nodes=400');
    await waitForHelios(page);

    const scenePanel = panelByTitle(page, 'Scene');
    await expect(scenePanel).toBeVisible();
    await scenePanel.getByRole('button', { name: 'Appearance' }).first().click();

    const dimensionControl = scenePanel.locator('[role="radiogroup"][aria-label="Scene dimension"]').first();
    const to3DOption = dimensionControl.getByRole('radio', { name: '3D' }).first();
    const to2DOption = dimensionControl.getByRole('radio', { name: '2D' }).first();
    await expect(to3DOption).toHaveAttribute('aria-checked', 'true');

    await to2DOption.click();
    await expect(to2DOption).toHaveAttribute('aria-checked', 'true');
    await page.waitForFunction(() => window.__helios?.renderer?.camera?.mode === '2d');

    const cameraState = await page.evaluate(() => {
      const camera = window.__helios?.renderer?.camera;
      return camera ? { mode: camera.mode, projection: camera.projection } : null;
    });
    expect(cameraState?.mode).toBe('2d');
    expect(cameraState?.projection).toBe('orthographic');

    const pixels = await countNonBackgroundPixels(page);
    expect(pixels).toBeGreaterThan(500);
  });
});
