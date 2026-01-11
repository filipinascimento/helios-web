import { test, expect } from '@playwright/test';

async function waitForReady(page) {
  await page.waitForFunction(() => window.__HELIOS_DIAGNOSTICS__ != null);
  const diag = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
  expect(diag?.ready, diag?.error ?? 'fixture did not become ready').toBe(true);
}

test.describe('wheel gestures', () => {
  test('suppresses wheel bubbling by default', async ({ page }) => {
    await page.goto('/tests/fixtures/wheel-gestures.html?suppress=1&renderer=webgl');
    await waitForReady(page);

    const root = page.locator('.helios-root');
    await expect(root).toBeVisible();
    await expect(root).toHaveCSS('overscroll-behavior', 'none');

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas.helios-layer-canvas3d');
      if (!canvas) throw new Error('missing helios canvas');
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true }));
    });

    const bubbled = await page.evaluate(() => window.__wheelBubbled);
    expect(bubbled).toBe(0);
  });

  test('can opt out and allow wheel bubbling', async ({ page }) => {
    await page.goto('/tests/fixtures/wheel-gestures.html?suppress=0&renderer=webgl');
    await waitForReady(page);

    await page.evaluate(() => {
      const canvas = document.querySelector('canvas.helios-layer-canvas3d');
      if (!canvas) throw new Error('missing helios canvas');
      canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true }));
    });

    const bubbled = await page.evaluate(() => window.__wheelBubbled);
    expect(bubbled).toBeGreaterThan(0);
  });
});
