import { test, expect } from '@playwright/test';

test.describe('docs basic demo mappers', () => {
  test('node color starts as a serializable colormap mapper', async ({ page }) => {
    await page.goto('/?nodes=2000&mode=3d&edgeTransparency=weighted&renderer=webgl');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
    await expect(panel).toBeVisible();

    const editorToggle = panel.getByRole('button', { name: 'Editor' }).first();
    await expect(editorToggle).toBeVisible();
    if ((await editorToggle.getAttribute('aria-expanded')) === 'false') {
      await editorToggle.click();
    }

    const typeValue = await panel.locator('select').evaluateAll((selects) => {
      const isTypeSelect = (sel) => {
        const options = Array.from(sel.options ?? []);
        const hasPassthrough = options.some((opt) => opt.textContent === 'Passthrough');
        const hasColormap = options.some((opt) => opt.textContent === 'Colormap');
        return hasPassthrough && hasColormap;
      };
      const typeSelect = selects.find(isTypeSelect) ?? null;
      return typeSelect ? typeSelect.value : null;
    });
    expect(typeValue).toBe('colormap');
  });
});
