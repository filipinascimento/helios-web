import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() =>
    Boolean(window.__helios && window.__helios.ready && window.__HELIOS_DIAGNOSTICS__?.ready === true),
  );
}

test('8K export availability does not change with window aspect ratio', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=64');
  await waitForDiagnostics(page);

  const maxBitmapDimension = await page.evaluate(() =>
    window.__helios?.getFigureExportCapabilities?.({ supersampling: 1 })?.maxBitmapDimension ?? 0,
  );
  test.skip(maxBitmapDimension < 8192, `Renderer limit is ${maxBitmapDimension}px`);

  const dataPanel = page.locator('helios-panel[heading="Data"]').first();
  await dataPanel.locator('button.helios-ui-tab', { hasText: 'Figure' }).click();
  await dataPanel.locator('.helios-ui-row', { hasText: 'Size' }).locator('select').selectOption('8k');

  const exportButton = dataPanel.locator('button', { hasText: 'Export' });
  await expect(exportButton).toBeEnabled();

  await page.setViewportSize({ width: 1400, height: 800 });
  await expect(exportButton).toBeEnabled();
});
