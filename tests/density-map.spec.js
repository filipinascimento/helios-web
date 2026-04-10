import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

function captureBrowserErrors(page) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = String(msg.text() ?? '');
    if (text.includes('Failed to load resource') && text.includes('404')) return;
    errors.push(new Error(`console.error: ${text}`));
  });
  return errors;
}

async function ensureToggleEnabled(scope, selector) {
  const toggle = scope.locator(`${selector} [role="switch"], ${selector} input[type="checkbox"]`).first();
  await expect(toggle).toBeVisible();
  const tag = await toggle.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'input') {
    if (!(await toggle.isChecked())) await toggle.check();
    return;
  }
  if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
}

async function ensureToggleDisabled(scope, selector) {
  const toggle = scope.locator(`${selector} [role="switch"], ${selector} input[type="checkbox"]`).first();
  await expect(toggle).toBeVisible();
  const tag = await toggle.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'input') {
    if (await toggle.isChecked()) await toggle.uncheck();
    return;
  }
  if ((await toggle.getAttribute('aria-checked')) !== 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
}

async function enableDensityFromPanel(page) {
  const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
  await expect(panel).toBeVisible();

  const densityTabButton = panel.locator('button', { hasText: 'Density' }).first();
  await densityTabButton.click();

  const enabledRow = panel.locator('.helios-ui-row', {
    has: page.locator('.helios-ui-label__title', { hasText: 'Enabled' }),
  }).first();
  await expect(enabledRow).toBeVisible();
  await ensureToggleEnabled(enabledRow, ':scope');

  await expect.poll(
    () => page.evaluate(() => window.__helios?.density?.().enabled === true),
    { timeout: 5000 },
  ).toBe(true);

  return panel;
}

test.describe('density map panel', () => {
  test('applies Map BG only while density is enabled', async ({ page }) => {
    const errors = captureBrowserErrors(page);
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&nodes=120&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.error ?? null).toBeNull();
    expect(String(diagnostics.renderer).toLowerCase()).toContain('webgl');

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
    await expect(panel).toBeVisible();
    await panel.locator('button', { hasText: 'Density' }).first().click();
    const densityTab = panel.locator('.helios-ui-tabpanel[data-tab-id="density"][data-active="true"]').first();
    await expect(densityTab).toBeVisible();

    const enabledRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Enabled' }),
    }).first();
    const mapBgRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Map BG' }),
    }).first();
    await expect(enabledRow).toBeVisible();
    await expect(mapBgRow).toBeVisible();

    const manualBackground = await page.evaluate(() => window.__helios?.clearColor?.() ?? null);
    await ensureToggleEnabled(mapBgRow, ':scope');

    const colormapDisplay = densityTab.locator('button.helios-ui-colormap-picker__display').first();
    await expect(colormapDisplay).toBeVisible();
    await colormapDisplay.click();

    const popover = page.locator('.helios-ui-colormap-popover:visible').first();
    await expect(popover).toBeVisible();
    const colormapSearch = popover.locator('input.helios-ui-colormap-popover__search').first();
    await expect(colormapSearch).toBeVisible();
    await colormapSearch.fill('viridis');
    await popover.locator('.helios-ui-colormap-picker__item', {
      has: page.locator('.helios-ui-colormap-picker__item-title', { hasText: 'Viridis' }),
    }).first().click();

    await expect.poll(() => page.evaluate((expected) => {
      const current = window.__helios?.clearColor?.() ?? null;
      if (!Array.isArray(current) || !Array.isArray(expected)) return false;
      return (
        Math.abs(Number(current[0] ?? 0) - Number(expected[0] ?? 0)) <= 0.02
        && Math.abs(Number(current[1] ?? 0) - Number(expected[1] ?? 0)) <= 0.02
        && Math.abs(Number(current[2] ?? 0) - Number(expected[2] ?? 0)) <= 0.02
        && Math.abs(Number(current[3] ?? 0) - Number(expected[3] ?? 0)) <= 0.02
      );
    }, manualBackground), { timeout: 5000 }).toBe(true);

    await ensureToggleEnabled(enabledRow, ':scope');

    await expect.poll(async () => page.evaluate(async () => {
      const { resolveColormap } = await import('/src/colors/colormaps.js');
      const expected = resolveColormap('interpolateViridis')?.interpolate?.(0) ?? [0, 0, 0, 1];
      const actual = window.__helios?.clearColor?.() ?? [0, 0, 0, 1];
      if (!Array.isArray(expected) || !Array.isArray(actual)) return false;
      return (
        Math.abs(Number(expected[0] ?? 0) - Number(actual[0] ?? 0)) <= 0.02
        && Math.abs(Number(expected[1] ?? 0) - Number(actual[1] ?? 0)) <= 0.02
        && Math.abs(Number(expected[2] ?? 0) - Number(actual[2] ?? 0)) <= 0.02
      );
    }), { timeout: 5000 }).toBe(true);

    await ensureToggleDisabled(enabledRow, ':scope');

    await expect.poll(() => page.evaluate((expected) => {
      const current = window.__helios?.clearColor?.() ?? null;
      if (!Array.isArray(current) || !Array.isArray(expected)) return false;
      return (
        Math.abs(Number(current[0] ?? 0) - Number(expected[0] ?? 0)) <= 0.02
        && Math.abs(Number(current[1] ?? 0) - Number(expected[1] ?? 0)) <= 0.02
        && Math.abs(Number(current[2] ?? 0) - Number(expected[2] ?? 0)) <= 0.02
        && Math.abs(Number(current[3] ?? 0) - Number(expected[3] ?? 0)) <= 0.02
      );
    }, manualBackground), { timeout: 5000 }).toBe(true);

    expect(errors).toHaveLength(0);
  });

  test('enables density in WebGL renderer', async ({ page }) => {
    const errors = captureBrowserErrors(page);
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&nodes=120&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.error ?? null).toBeNull();
    expect(String(diagnostics.renderer).toLowerCase()).toContain('webgl');

    const panel = await enableDensityFromPanel(page);

    const densityTab = panel.locator('.helios-ui-tabpanel[data-tab-id="density"][data-active="true"]').first();
    await expect(densityTab).toBeVisible();

    const resolutionRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Resolution' }),
    }).first();
    await expect(resolutionRow).toBeVisible();
    const resolutionSlider = resolutionRow.locator('input[type="range"]').first();
    await expect(resolutionSlider).toBeVisible();
    await resolutionSlider.evaluate((el) => {
      el.value = '4';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await expect.poll(
      () => page.evaluate(() => Number(window.__helios?.density?.().qualityScale ?? 0)),
      { timeout: 5000 },
    ).toBeCloseTo(1 / 3, 3);

    const zoomRow = densityTab.locator('.helios-ui-row').filter({ hasText: 'Zoom' }).first();
    await expect(zoomRow).toBeVisible();
    await ensureToggleEnabled(zoomRow, ':scope');
    await expect.poll(
      () => page.evaluate(() => window.__helios?.density?.().scaleWithZoom === true),
      { timeout: 5000 },
    ).toBe(true);

    const scaledBandwidth = await page.evaluate(() => {
      const helios = window.__helios;
      const camera = helios?.renderer?.camera;
      const layer = helios?._densityLayer;
      if (!helios || !camera || !layer) return null;
      camera.setMode?.('2d');
      camera.zoom = 2;
      camera.updateMatrices?.();
      const uniforms = camera.getUniforms?.();
      return layer.resolveSplatBandwidthPx?.(camera, uniforms) ?? null;
    });

    await ensureToggleDisabled(zoomRow, ':scope');
    await expect.poll(
      () => page.evaluate(() => window.__helios?.density?.().scaleWithZoom === false),
      { timeout: 5000 },
    ).toBe(true);
    const fixedBandwidth = await page.evaluate(() => {
      const helios = window.__helios;
      const camera = helios?.renderer?.camera;
      const layer = helios?._densityLayer;
      if (!helios || !camera || !layer) return null;
      camera.setMode?.('2d');
      camera.zoom = 2;
      camera.updateMatrices?.();
      const uniforms = camera.getUniforms?.();
      return layer.resolveSplatBandwidthPx?.(camera, uniforms) ?? null;
    });
    expect(Number.isFinite(scaledBandwidth)).toBe(true);
    expect(Number.isFinite(fixedBandwidth)).toBe(true);
    expect(Number(scaledBandwidth)).toBeGreaterThan(Number(fixedBandwidth) * 1.5);

    const manualBackground = await page.evaluate(() => window.__helios?.clearColor?.() ?? null);

    const autoBgRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Map BG' }),
    }).first();
    await expect(autoBgRow).toBeVisible();
    await ensureToggleEnabled(autoBgRow, ':scope');

    const colormapDisplay = densityTab.locator('button.helios-ui-colormap-picker__display').first();
    await expect(colormapDisplay).toBeVisible();
    await colormapDisplay.click();

    const popover = page.locator('.helios-ui-colormap-popover:visible').first();
    await expect(popover).toBeVisible();
    const colormapSearch = popover.locator('input.helios-ui-colormap-popover__search').first();
    await expect(colormapSearch).toBeVisible();
    await colormapSearch.fill('viridis');
    await popover.locator('.helios-ui-colormap-picker__item', {
      has: page.locator('.helios-ui-colormap-picker__item-title', { hasText: 'Viridis' }),
    }).first().click();

    await expect.poll(async () => page.evaluate(async () => {
      const { resolveColormap } = await import('/src/colors/colormaps.js');
      const cfg = window.__helios?.density?.() ?? {};
      if (cfg.colormap !== 'interpolateViridis') return false;
      const expected = resolveColormap('interpolateViridis')?.interpolate?.(0) ?? [0, 0, 0, 1];
      const actual = window.__helios?.clearColor?.() ?? [0, 0, 0, 1];
      if (!Array.isArray(expected) || !Array.isArray(actual)) return false;
      const er = Number(expected[0] ?? 0);
      const eg = Number(expected[1] ?? 0);
      const eb = Number(expected[2] ?? 0);
      const ar = Number(actual[0] ?? 0);
      const ag = Number(actual[1] ?? 0);
      const ab = Number(actual[2] ?? 0);
      return (
        Math.abs(er - ar) <= 0.02
        && Math.abs(eg - ag) <= 0.02
        && Math.abs(eb - ab) <= 0.02
      );
    }), { timeout: 5000 }).toBe(true);

    const autoBgToggle = autoBgRow.locator('[role="switch"], input[type="checkbox"]').first();
    const autoBgTag = await autoBgToggle.evaluate((el) => el.tagName.toLowerCase());
    if (autoBgTag === 'input') {
      await autoBgToggle.uncheck();
    } else {
      if ((await autoBgToggle.getAttribute('aria-checked')) === 'true') await autoBgToggle.click();
      await expect(autoBgToggle).toHaveAttribute('aria-checked', 'false');
    }

    await expect.poll(() => page.evaluate((expected) => {
      const current = window.__helios?.clearColor?.() ?? null;
      if (!Array.isArray(current) || !Array.isArray(expected)) return false;
      return (
        Math.abs(Number(current[0] ?? 0) - Number(expected[0] ?? 0)) <= 0.02
        && Math.abs(Number(current[1] ?? 0) - Number(expected[1] ?? 0)) <= 0.02
        && Math.abs(Number(current[2] ?? 0) - Number(expected[2] ?? 0)) <= 0.02
        && Math.abs(Number(current[3] ?? 0) - Number(expected[3] ?? 0)) <= 0.02
      );
    }, manualBackground), { timeout: 5000 }).toBe(true);

    expect(errors).toHaveLength(0);
  });

  test('switches the density panel into log-ratio mode without breaking WebGL rendering', async ({ page }) => {
    const errors = captureBrowserErrors(page);
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&nodes=120&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.error ?? null).toBeNull();
    expect(String(diagnostics.renderer).toLowerCase()).toContain('webgl');

    const panel = await enableDensityFromPanel(page);
    const densityTab = panel.locator('.helios-ui-tabpanel[data-tab-id="density"][data-active="true"]').first();
    await expect(densityTab).toBeVisible();

    const propertyRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Density' }),
    }).first();
    await expect(propertyRow).toBeVisible();
    await propertyRow.locator('select').selectOption('Degree');

    const compareRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'vs' }),
    }).first();
    await expect(compareRow).toBeVisible();
    await expect(compareRow.locator('option[value="Degree"]')).toHaveCount(0);
    await compareRow.locator('select').selectOption('Uniform');

    const modeRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Mode' }),
    }).first();
    await expect(modeRow).toBeVisible();
    await modeRow.locator('select').selectOption('logRatio');

    await expect.poll(
      () => page.evaluate(() => {
        const state = window.__helios?.density?.() ?? null;
        return state
          ? {
              comparisonMode: state.comparisonMode,
              diverging: state.diverging,
              valueDomain: state.valueDomain,
            }
          : null;
      }),
      { timeout: 5000 },
    ).toEqual({
      comparisonMode: 'logRatio',
      diverging: true,
      valueDomain: [-3, 3],
    });

    const weightRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Weight' }),
    }).first();
    const epsilonRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Epsilon' }),
    }).first();
    const zScoreRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Z-score' }),
    }).first();
    const supportRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Support' }),
    }).first();
    await expect(weightRow).toHaveCSS('opacity', '0.55');
    await expect(epsilonRow).toHaveCSS('opacity', '1');
    await expect(zScoreRow).toBeVisible();
    await expect(supportRow).toBeVisible();

    await ensureToggleEnabled(zScoreRow, ':scope');
    await expect.poll(
      () => page.evaluate(() => window.__helios?.density?.().logRatioZScore === true),
      { timeout: 5000 },
    ).toBe(true);
    await ensureToggleDisabled(zScoreRow, ':scope');
    await expect.poll(
      () => page.evaluate(() => window.__helios?.density?.().logRatioZScore === false),
      { timeout: 5000 },
    ).toBe(true);

    await ensureToggleDisabled(supportRow, ':scope');
    await expect.poll(
      () => page.evaluate(() => window.__helios?.density?.().logRatioSupportCorrection === false),
      { timeout: 5000 },
    ).toBe(true);
    await ensureToggleEnabled(supportRow, ':scope');
    await expect.poll(
      () => page.evaluate(() => window.__helios?.density?.().logRatioSupportCorrection === true),
      { timeout: 5000 },
    ).toBe(true);

    await compareRow.locator('select').selectOption('None');

    await expect.poll(
      () => page.evaluate(() => {
        const state = window.__helios?.density?.() ?? null;
        return state
          ? {
              comparisonMode: state.comparisonMode,
              diverging: state.diverging,
              valueDomain: state.valueDomain,
            }
          : null;
      }),
      { timeout: 5000 },
    ).toEqual({
      comparisonMode: 'difference',
      diverging: false,
      valueDomain: null,
    });

    await expect(modeRow).toBeHidden();
    await expect(weightRow).toHaveCSS('opacity', '1');
    await expect(epsilonRow).toBeHidden();
    await expect(zScoreRow).toBeHidden();
    await expect(supportRow).toBeHidden();

    expect(errors).toHaveLength(0);
  });

  test('restores the previous difference colormap when leaving log-ratio mode', async ({ page }) => {
    const errors = captureBrowserErrors(page);
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&nodes=120&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.error ?? null).toBeNull();

    const panel = await enableDensityFromPanel(page);
    const densityTab = panel.locator('.helios-ui-tabpanel[data-tab-id="density"][data-active="true"]').first();
    await expect(densityTab).toBeVisible();

    const propertyRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Density' }),
    }).first();
    await propertyRow.locator('select').selectOption('Degree');

    const compareRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'vs' }),
    }).first();
    await compareRow.locator('select').selectOption('Uniform');

    const colormapDisplay = densityTab.locator('button.helios-ui-colormap-picker__display').first();
    await colormapDisplay.click();
    let popover = page.locator('.helios-ui-colormap-popover:visible').first();
    await popover.locator('input.helios-ui-colormap-popover__search').first().fill('rdbu');
    await popover.locator('.helios-ui-colormap-picker__item', {
      has: page.locator('.helios-ui-colormap-picker__item-title', { hasText: 'RdBu' }),
    }).first().click();

    await expect.poll(() => page.evaluate(() => window.__helios?.density?.().activeColormap ?? null)).toBe('interpolateRdBu');

    const modeRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Mode' }),
    }).first();
    await modeRow.locator('select').selectOption('logRatio');
    await expect.poll(() => page.evaluate(() => window.__helios?.density?.().activeColormap ?? null)).toBe('cmasher:prinsenvlag');

    await colormapDisplay.click();
    popover = page.locator('.helios-ui-colormap-popover:visible').first();
    await popover.locator('input.helios-ui-colormap-popover__search').first().fill('spectral');
    await popover.locator('.helios-ui-colormap-picker__item', {
      has: page.locator('.helios-ui-colormap-picker__item-title', { hasText: 'Spectral' }),
    }).first().click();

    await expect.poll(() => page.evaluate(() => window.__helios?.density?.().activeColormap ?? null)).toBe('interpolateSpectral');

    await modeRow.locator('select').selectOption('difference');
    await expect.poll(
      () => page.evaluate(() => ({
        activeColormap: window.__helios?.density?.().activeColormap ?? null,
        comparisonMode: window.__helios?._densityLayer?.config?.comparisonMode ?? null,
        valueDomain: window.__helios?.density?.().valueDomain ?? null,
      })),
      { timeout: 5000 },
    ).toEqual({
      activeColormap: 'interpolateRdBu',
      comparisonMode: 'difference',
      valueDomain: null,
    });

    expect(errors).toHaveLength(0);
  });

  test('enables density in WebGPU renderer @webgpu', async ({ page }) => {
    const errors = captureBrowserErrors(page);
    await page.goto('/tests/fixtures/demo.html?renderer=webgpu&layout=none&nodes=120&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.error ?? null).toBeNull();
    const renderer = String(diagnostics.renderer).toLowerCase();
    expect(renderer).toContain('webgpu');

    const panel = await enableDensityFromPanel(page);
    const densityTab = panel.locator('.helios-ui-tabpanel[data-tab-id="density"][data-active="true"]').first();
    await expect(densityTab).toBeVisible();

    const propertyRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Density' }),
    }).first();
    await expect(propertyRow).toBeVisible();
    await propertyRow.locator('select').selectOption('Degree');

    const compareRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'vs' }),
    }).first();
    await expect(compareRow).toBeVisible();
    await expect(compareRow.locator('option[value="Degree"]')).toHaveCount(0);
    await compareRow.locator('select').selectOption('Uniform');

    const modeRow = densityTab.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Mode' }),
    }).first();
    await expect(modeRow).toBeVisible();
    await modeRow.locator('select').selectOption('logRatio');

    await expect.poll(
      () => page.evaluate(() => {
        const state = window.__helios?.density?.() ?? null;
        return state
          ? {
              comparisonMode: state.comparisonMode,
              diverging: state.diverging,
              valueDomain: state.valueDomain,
            }
          : null;
      }),
      { timeout: 5000 },
    ).toEqual({
      comparisonMode: 'logRatio',
      diverging: true,
      valueDomain: [-3, 3],
    });

    expect(errors).toHaveLength(0);
  });
});
