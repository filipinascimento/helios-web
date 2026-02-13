import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

function parseScreenshot(buffer) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

test('root demo renders something with WebGL + weighted in 3D', async ({ page }) => {
  await page.goto('/?nodes=20000&mode=3d&edgeTransparency=weighted&renderer=webgl&layout=none');
  await page.waitForFunction(() => window.__HELIOS_DIAGNOSTICS__?.ready === true, null, { timeout: 30_000 });
  await page.waitForTimeout(750);

  const screenshot = await page.screenshot({ fullPage: false });
  const png = await parseScreenshot(screenshot);
  let nonBackground = 0;
  const total = (png.width ?? 0) * (png.height ?? 0);
  const threshold = 10;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    if (r > threshold || g > threshold || b > threshold) nonBackground += 1;
  }

  expect(total).toBeGreaterThan(0);
  expect(nonBackground).toBeGreaterThan(500);
});
