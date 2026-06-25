import { test, expect } from '@playwright/test';

test.describe('docs main app mappers', () => {
  test.describe.configure({ mode: 'serial', timeout: 90000 });

  const demoUrl = '/?nodes=500&mode=3d&edgeTransparency=weighted&renderer=webgl&session=0';

  test('node color starts as a serializable colormap mapper', async ({ page }) => {
    await page.goto(demoUrl);

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
    await expect(panel).toBeVisible();

    const typeRow = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: /^Type$/ }),
    }).first();
    const typeSelect = typeRow.locator('select.helios-ui-select').first();
    await expect(typeSelect).toBeVisible();
    await expect(typeSelect).toHaveValue('colormap');

    const typeOptions = await typeSelect.evaluate((sel) => {
      return Array.from(sel.options ?? []).map((opt) => (opt.textContent ?? '').trim());
    });
    expect(typeOptions).toEqual(['Colormap']);
  });

  test('node color mapper shows a numeric domain histogram', async ({ page }) => {
    await page.goto(demoUrl);

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
    await expect(panel).toBeVisible();

    const attributeRow = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Attribute' }),
    }).first();
    const attributeSelect = attributeRow.locator('select.helios-ui-select').first();
    await expect(attributeSelect).toBeVisible();
    await attributeSelect.selectOption('weight');

    await expect(panel.locator('.helios-ui-range2__histogram:visible').first()).toBeVisible();
  });

  test('main app does not override Helios internal mapper defaults', async ({ page }) => {
    await page.goto(demoUrl);

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    const defaults = await page.evaluate(() => {
      const mappers = window.__helios?.behavior?.mappers;
      return {
        nodeSize: mappers?.getSerializedChannelConfig?.('node', 'size') ?? null,
        edgeWidth: mappers?.getSerializedChannelConfig?.('edge', 'width') ?? null,
        edgeOpacity: mappers?.getSerializedChannelConfig?.('edge', 'opacity') ?? null,
      };
    });

    expect(defaults.nodeSize).toMatchObject({ type: 'constant', value: 8 });
    expect(defaults.nodeSize.attributes ?? null).not.toBe('weight');
    expect(defaults.edgeWidth).toMatchObject({ type: 'constant', value: 1 });
    expect(defaults.edgeOpacity).toMatchObject({ type: 'constant', value: 1 });
  });
});
