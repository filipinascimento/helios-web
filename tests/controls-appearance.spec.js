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

test.describe('scene panel: tabs and appearance controls', () => {
  test('groups controls into Scene tabs and keeps renderer bindings working', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=500');
    await waitForHelios(page);

    const scenePanel = panelByTitle(page, 'Scene');
    await expect(scenePanel).toBeVisible();

    const dataPanel = panelByTitle(page, 'Data');
    await expect(dataPanel).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-stat__label', { hasText: 'Nodes' })).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-button', { hasText: 'Load' })).toBeVisible();
    await expect(dataPanel.locator('.helios-ui-button', { hasText: 'Save' })).toBeVisible();

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

    const dimensionToggle = scenePanel.locator('[role="switch"][aria-label="Scene dimension"]').first();
    await expect(dimensionToggle).toBeVisible();
    await expect(dimensionToggle).toHaveAttribute('aria-checked', 'false');
    await dimensionToggle.click();
    await expect(dimensionToggle).toHaveAttribute('aria-checked', 'true');
    const sceneMode3D = await page.evaluate(() => window.__helios.mode());
    expect(sceneMode3D).toBe('3d');

    await page.evaluate(() => window.__helios.setMode('2d'));
    await expect(dimensionToggle).toHaveAttribute('aria-checked', 'false');

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
    await expect(adaptiveEnabled).toHaveAttribute('aria-checked', 'true');
    await adaptiveEnabled.click();
    await expect(adaptiveEnabled).toHaveAttribute('aria-checked', 'false');

    const adaptiveThresholdRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Slow Frame"))')
      .first();
    await adaptiveThresholdRow.locator('input[type="number"]').fill('28');
    await adaptiveThresholdRow.locator('input[type="number"]').dispatchEvent('change');

    const adaptiveFramesRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Avg Frames"))')
      .first();
    await adaptiveFramesRow.locator('input[type="number"]').fill('4');
    await adaptiveFramesRow.locator('input[type="number"]').dispatchEvent('change');

    const adaptiveRetryRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Hold Time"))')
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
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Max Labels"))')
      .first();
    const maxLabelsInput = maxLabelsRow.locator('input[type="number"]').first();
    await maxLabelsInput.fill('18');
    await maxLabelsInput.dispatchEvent('change');
    const maxLabels = await page.evaluate(() => window.__helios.labels().maxVisible ?? null);
    expect(maxLabels).toBe(18);

    const labelRadiusFactorRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Label Radius Factor"))')
      .first();
    await expect(labelRadiusFactorRow).toBeVisible();
    const labelRadiusFactorInput = labelRadiusFactorRow.locator('input[type="number"]').first();
    await labelRadiusFactorInput.fill('-0.5');
    await labelRadiusFactorInput.dispatchEvent('change');
    const labelRadiusFactor = await page.evaluate(() => window.__helios.labels()?.offsetRadiusFactor ?? null);
    expect(labelRadiusFactor).toBeCloseTo(-0.5, 3);

    const labelPixelOffsetRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Label Pixel Offset"))')
      .first();
    await expect(labelPixelOffsetRow).toBeVisible();
    const labelPixelOffsetInput = labelPixelOffsetRow.locator('input[type="number"]').first();
    await labelPixelOffsetInput.fill('9');
    await labelPixelOffsetInput.dispatchEvent('change');
    const labelPixelOffset = await page.evaluate(() => window.__helios.labels()?.offsetPx ?? null);
    expect(labelPixelOffset).toBe(9);

    const labelMaxCharsRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Label Max Chars"))')
      .first();
    await expect(labelMaxCharsRow).toBeVisible();
    const labelMaxCharsInput = labelMaxCharsRow.locator('input[type="number"]').first();
    await labelMaxCharsInput.fill('12');
    await labelMaxCharsInput.dispatchEvent('change');
    const labelMaxChars = await page.evaluate(() => window.__helios.labels()?.maxChars ?? null);
    expect(labelMaxChars).toBe(12);

    const labelMaxRowsRow = scenePanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Label Max Rows"))')
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
      const original = behavior.legends.bind(behavior);
      behavior.legends = function legendsSpy(options) {
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

    const dimensionToggle = scenePanel.locator('[role="switch"][aria-label="Scene dimension"]').first();
    await expect(dimensionToggle).toHaveAttribute('aria-checked', 'false');

    const beforePixels = await countNonBackgroundPixels(page);
    expect(beforePixels).toBeGreaterThan(500);

    await dimensionToggle.click();
    await expect(dimensionToggle).toHaveAttribute('aria-checked', 'true');
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

    const dimensionToggle = scenePanel.locator('[role="switch"][aria-label="Scene dimension"]').first();
    await expect(dimensionToggle).toHaveAttribute('aria-checked', 'true');

    await dimensionToggle.click();
    await expect(dimensionToggle).toHaveAttribute('aria-checked', 'false');
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
