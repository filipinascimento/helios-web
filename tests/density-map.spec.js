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
  test('enables density in WebGL renderer', async ({ page }) => {
    const errors = captureBrowserErrors(page);
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&nodes=120&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.error ?? null).toBeNull();
    expect(String(diagnostics.renderer).toLowerCase()).toContain('webgl');

    await enableDensityFromPanel(page);
    expect(errors).toHaveLength(0);
  });

  test('enables density in WebGPU renderer @webgpu', async ({ page }) => {
    const errors = captureBrowserErrors(page);
    await page.goto('/tests/fixtures/demo.html?renderer=webgpu&layout=none&nodes=120&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.error ?? null).toBeNull();
    const renderer = String(diagnostics.renderer).toLowerCase();
    expect(renderer).toContain('webgpu');

    await enableDensityFromPanel(page);
    expect(errors).toHaveLength(0);
  });
});
