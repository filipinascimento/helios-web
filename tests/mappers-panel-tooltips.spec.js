import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

async function ensureMappersPanelVisible(page) {
  const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
  if (await panel.isVisible()) return panel;
  await page.evaluate(() => {
    const behavior = window.__helios?.behavior?.interface;
    behavior?.openControlsSurface?.();
    behavior?.activateControl?.('helios-ui-mappers');
  });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('mappers panel', () => {
  test('shows tooltips for editor labels', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&nodes=50&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.ready).toBe(true);
    await ensureMappersPanelVisible(page);

    const typeLabel = page.locator('.helios-ui-label__title', { hasText: 'Type' }).first();
    await expect(typeLabel).toBeVisible();

    await typeLabel.hover();

    const tooltips = page.locator('.helios-ui-tooltip[data-open="true"]');
    await expect(tooltips.first()).toBeVisible();
    await expect(tooltips.first()).toContainText('Select the compatible mapper type');
  });
});
