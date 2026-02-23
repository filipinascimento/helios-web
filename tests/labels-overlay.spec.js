import { test, expect } from '@playwright/test';

async function waitForHelios(page) {
  await page.waitForFunction(() =>
    Boolean(window.__helios && window.__helios.ready && window.__HELIOS_DIAGNOSTICS__?.ready === true),
  );
}

async function enableLabels(page, options = {}) {
  await page.evaluate((cfg) => {
    window.__helios.labels({ enabled: true, maxVisible: 24, ...cfg });
    window.__helios.requestRender();
  }, options);
}

async function readLabelSnapshot(page) {
  return page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-label-layer text'));
    return texts
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => ({
        id: Number(el.dataset.nodeId),
        text: el.textContent ?? '',
        x: Number(el.getAttribute('x') ?? NaN),
        y: Number(el.getAttribute('y') ?? NaN),
      }));
  });
}

test.describe('svg labels overlay', () => {
  test('labels are optional, capped, and deterministic for same view', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=800');
    await waitForHelios(page);

    const initialCount = (await readLabelSnapshot(page)).length;
    expect(initialCount).toBe(0);

    await enableLabels(page, { maxVisible: 25 });
    await page.waitForFunction(() => {
      const texts = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-label-layer text'));
      return texts.filter((el) => getComputedStyle(el).display !== 'none').length > 0;
    });

    const first = await readLabelSnapshot(page);
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(25);
    for (const entry of first) {
      expect(Number.isFinite(entry.id)).toBeTruthy();
      expect(Number.isFinite(entry.x)).toBeTruthy();
      expect(Number.isFinite(entry.y)).toBeTruthy();
    }

    const idsA = first.map((entry) => entry.id);
    await page.evaluate(() => {
      window.__helios.labels({ enabled: false });
      window.__helios.requestRender();
    });
    await page.waitForFunction(() => {
      const texts = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-label-layer text'));
      return texts.filter((el) => getComputedStyle(el).display !== 'none').length === 0;
    });

    await enableLabels(page, { maxVisible: 25 });
    await page.waitForFunction(() => {
      const texts = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-label-layer text'));
      return texts.filter((el) => getComputedStyle(el).display !== 'none').length > 0;
    });
    const idsB = (await readLabelSnapshot(page)).map((entry) => entry.id);
    expect(idsB).toEqual(idsA);
  });

  test('labels reposition when camera pans', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=800');
    await waitForHelios(page);
    await enableLabels(page, { maxVisible: 20 });
    await page.waitForFunction(() => {
      const texts = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-label-layer text'));
      return texts.filter((el) => getComputedStyle(el).display !== 'none').length > 0;
    });

    const before = await readLabelSnapshot(page);
    const first = before[0];
    expect(first).toBeTruthy();

    const canvas = page.locator('canvas.helios-layer-canvas3d').first();
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 100, box.y + box.height * 0.5 + 40);
    await page.mouse.up();

    await page.waitForTimeout(120);
    const after = await readLabelSnapshot(page);
    const match = after.find((entry) => entry.id === first.id);
    expect(match).toBeTruthy();
    expect(Math.abs(match.x - first.x) + Math.abs(match.y - first.y)).toBeGreaterThan(1);
  });
});
