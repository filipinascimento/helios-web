import { test, expect } from '@playwright/test';

function formatBrowserErrors(errors) {
  return errors.map((e) => {
    if (!e) return 'Unknown error';
    const message = String(e.message ?? e);
    const stack = e.stack ? `\n${e.stack}` : '';
    return `${message}${stack}`;
  }).join('\n\n');
}

test.describe('ui boot', () => {
  test('docs basic demo boots without errors', async ({ page }, testInfo) => {
    const errors = [];

    page.on('pageerror', (error) => {
      errors.push(error);
    });

    page.on('console', (msg) => {
      // Fail on console.error; keep warnings/info for normal debugging.
      if (msg.type() !== 'error') return;
      errors.push(new Error(`console.error: ${msg.text()}`));
    });

    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=2000');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    // Sanity check that at least one UI panel exists.
    const panelCount = await page.locator('.helios-ui-panel').count();
    expect(panelCount).toBeGreaterThan(0);
    await expect(page.locator('.helios-ui-panel[data-panel-id="helios-ui-debug"]').first()).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator('.helios-ui-panel[data-panel-id="helios-ui-metrics"]').first()).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator('.helios-ui-panel[data-panel-id="helios-ui-camera"]').first()).toHaveAttribute('data-collapsed', 'true');

    if (errors.length) {
      await testInfo.attach('browser-errors', {
        body: formatBrowserErrors(errors),
        contentType: 'text/plain',
      });
    }

    expect(errors, formatBrowserErrors(errors)).toHaveLength(0);
  });
});
