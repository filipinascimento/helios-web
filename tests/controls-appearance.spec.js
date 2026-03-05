import { test, expect } from '@playwright/test';

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

test.describe('controls panel: appearance section', () => {
  test('shows Appearance before Nodes/Edges and controls affect renderer', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=500');
    await waitForHelios(page);

    const controlsPanel = panelByTitle(page, 'Controls');
    await expect(controlsPanel).toBeVisible();

    const labels = await controlsPanel.locator('.helios-ui-subpanel__label').evaluateAll((els) =>
      els.map((el) => (el.textContent ?? '').trim()).filter(Boolean),
    );

    // Network is first; Appearance should come before Nodes/Edges.
    expect(labels).toContain('Appearance');
    const iNetwork = labels.indexOf('Network');
    const iAppearance = labels.indexOf('Appearance');
    const iNodes = labels.indexOf('Nodes');
    const iEdges = labels.indexOf('Edges');
    expect(iNetwork).toBeGreaterThanOrEqual(0);
    expect(iAppearance).toBeGreaterThanOrEqual(0);
    expect(iNodes).toBeGreaterThanOrEqual(0);
    expect(iEdges).toBeGreaterThanOrEqual(0);
    expect(iAppearance).toBeGreaterThan(iNetwork);
    expect(iAppearance).toBeLessThan(iNodes);
    expect(iAppearance).toBeLessThan(iEdges);

    const appearanceHeader = controlsPanel.getByRole('button', { name: 'Appearance' }).first();
    if ((await appearanceHeader.getAttribute('aria-expanded')) === 'false') {
      await appearanceHeader.click();
    }

    // Theme row moved into Appearance.
    const appearanceSubpanel = controlsPanel
      .locator('.helios-ui-subpanel:has(.helios-ui-subpanel__label:has-text("Appearance"))')
      .first();
    await expect(appearanceSubpanel.locator('.helios-ui-label__title', { hasText: 'Theme' })).toBeVisible();

    const nodesHeader = controlsPanel.getByRole('button', { name: 'Nodes' }).first();
    if ((await nodesHeader.getAttribute('aria-expanded')) === 'false') {
      await nodesHeader.click();
    }

    // Ensure Theme is not inside Nodes anymore.
    const nodesSubpanel = controlsPanel
      .locator('.helios-ui-subpanel:has(.helios-ui-subpanel__label:has-text("Nodes"))')
      .first();
    const nodesTheme = nodesSubpanel.locator('.helios-ui-label__title', { hasText: 'Theme' });
    await expect(nodesTheme).toHaveCount(0);

    // Background color + alpha should update helios renderer clearColor.
    const bgColor = controlsPanel.locator('input[type="color"][aria-label="Background color"]').first();
    const bgAlpha = controlsPanel.locator('input[type="number"][aria-label="Background color alpha"]').first();

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
    const edgeMode = controlsPanel.locator('select[aria-label="Edge transparency mode"]').first();
    await expect(edgeMode).toBeVisible();
    await edgeMode.selectOption({ value: 'additive' });

    const mode = await page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeTransparencyMode ?? null);
    expect(mode).toBe('additive');

    // Regression: 'screen' should not throw on selection.
    await edgeMode.selectOption({ value: 'screen' });
    const screenMode = await page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeTransparencyMode ?? null);
    expect(screenMode).toBe('screen');

    const labelsHeader = controlsPanel.getByRole('button', { name: 'Labels' }).first();
    if ((await labelsHeader.getAttribute('aria-expanded')) === 'false') {
      await labelsHeader.click();
    }

    const showLabelsToggle = controlsPanel.locator('[aria-label="Show Labels"][role="switch"], input[type="checkbox"][aria-label="Show Labels"]');
    await enableToggle(showLabelsToggle);
    const labelsEnabled = await page.evaluate(() => window.__helios.labels().enabled === true);
    expect(labelsEnabled).toBe(true);

    const maxLabelsRow = controlsPanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Max Labels"))')
      .first();
    const maxLabelsInput = maxLabelsRow.locator('input[type="number"]').first();
    await maxLabelsInput.fill('18');
    await maxLabelsInput.dispatchEvent('change');
    const maxLabels = await page.evaluate(() => window.__helios.labels().maxVisible ?? null);
    expect(maxLabels).toBe(18);

    const labelSource = controlsPanel.locator('select[aria-label="Label source attribute"]').first();
    await expect(labelSource).toBeVisible();
    const sourceValues = await labelSource.locator('option').evaluateAll((opts) => opts.map((opt) => opt.value));
    expect(sourceValues).toContain('');
    expect(sourceValues).toContain('$index');
    await labelSource.selectOption('$index');
    const labelSourceValue = await page.evaluate(() => window.__helios.labelSource?.() ?? null);
    expect(labelSourceValue).toBe('$id');

    const labelFontFamily = controlsPanel.locator('input[aria-label="Label font family"]').first();
    await expect(labelFontFamily).toBeVisible();
    await labelFontFamily.fill('Menlo, monospace');
    await labelFontFamily.dispatchEvent('change');
    const fontFamily = await page.evaluate(() => window.__helios.labelFontFamily?.() ?? '');
    expect(fontFamily).toContain('Menlo');

    const labelFill = controlsPanel.locator('input[type="color"][aria-label="Label fill color"]').first();
    const labelFillAlpha = controlsPanel.locator('input[type="number"][aria-label="Label fill color alpha"]').first();
    await expect(labelFill).toBeVisible();
    await expect(labelFillAlpha).toBeVisible();
    await labelFillAlpha.fill('0.75');
    await labelFillAlpha.dispatchEvent('change');
    await labelFill.evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, '#00ff00');
    const labelFillValue = await page.evaluate(() => String(window.__helios.labelFill?.() ?? ''));
    expect(labelFillValue.toLowerCase()).toContain('#00ff00');

    const advancedHeader = controlsPanel.getByRole('button', { name: 'Advanced' }).first();
    if ((await advancedHeader.getAttribute('aria-expanded')) === 'false') {
      await advancedHeader.click();
    }

    const nodeBlendToggle = controlsPanel.locator('[aria-label="Blend Nodes With Edges"][role="switch"], input[type="checkbox"][aria-label="Blend Nodes With Edges"]');
    await enableToggle(nodeBlendToggle);
    const nodeBlendValue = await page.evaluate(() => window.__helios.renderer?.graphLayer?.nodeBlendWithEdges ?? null);
    expect(nodeBlendValue).toBe(true);

    const edgeDepthToggle = controlsPanel.locator('[aria-label="Edge Depth Write"][role="switch"], input[type="checkbox"][aria-label="Edge Depth Write"]');
    await enableToggle(edgeDepthToggle);
    const edgeDepthValue = await page.evaluate(() => window.__helios.renderer?.graphLayer?.edgeDepthWrite ?? null);
    expect(edgeDepthValue).toBe(true);

    const semanticZoomRow = controlsPanel
      .locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Semantic Zoom Exponent"))')
      .first();
    await expect(semanticZoomRow).toBeVisible();
    const semanticZoomInput = semanticZoomRow.locator('input[type="number"]').first();
    await semanticZoomInput.fill('0.65');
    await semanticZoomInput.dispatchEvent('change');
    const semanticZoomExponent = await page.evaluate(() => window.__helios.renderer?.graphLayer?.semanticZoomExponent ?? null);
    expect(semanticZoomExponent).toBeCloseTo(0.65, 3);
  });
});
