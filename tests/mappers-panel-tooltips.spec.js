import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

test.describe('mappers panel', () => {
  test('shows tooltips for editor labels', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&nodes=50&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.ready).toBe(true);

    const typeLabel = page.locator('.helios-ui-label__title', { hasText: 'Type' }).first();
    await expect(typeLabel).toBeVisible();

    await typeLabel.hover();

    const tooltip = page.locator('.helios-ui-tooltip[data-open="true"]');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Select how this channel is driven');
  });
});

