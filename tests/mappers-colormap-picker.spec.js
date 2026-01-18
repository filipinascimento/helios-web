import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

test.describe('mappers panel colormap picker', () => {
  test('shows searchable list with thumbnails', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&nodes=50&mappers=1');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.ready).toBe(true);

    const typeRow = page.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Type' }),
    }).first();
    await expect(typeRow).toBeVisible();

    const typeSelect = typeRow.locator('select.helios-ui-select').first();
    await typeSelect.selectOption('colormap');

    const pickerInput = page.locator('input.helios-ui-colormap-picker__input').first();
    await expect(pickerInput).toBeVisible();
    await pickerInput.click();
    await pickerInput.fill('CET');

    const popover = page.locator('.helios-ui-colormap-popover').first();
    await expect(popover).toBeVisible();

    const items = popover.locator('.helios-ui-colormap-picker__item');
    await expect(items.first()).toBeVisible();

    const thumb = items.first().locator('.helios-ui-colormap-thumb--small');
    await expect(thumb).toBeVisible();
    await expect(thumb).toHaveCSS('background-image', /gradient/);

    const dataKey = await items.first().getAttribute('data-key');
    expect(dataKey).toBeTruthy();

    await items.first().click();
    await expect(pickerInput).toHaveValue(dataKey);
  });
});
