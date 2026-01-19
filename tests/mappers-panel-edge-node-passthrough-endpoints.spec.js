import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

function formatBrowserErrors(errors) {
  return errors.map((e) => {
    if (!e) return 'Unknown error';
    const message = String(e.message ?? e);
    const stack = e.stack ? `\n${e.stack}` : '';
    return `${message}${stack}`;
  }).join('\n\n');
}

test.describe('mappers panel', () => {
  test('allows applying edge node passthrough endpoint changes', async ({ page }, testInfo) => {
    const errors = [];

    page.on('pageerror', (error) => {
      errors.push(error);
    });

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      errors.push(new Error(`console.error: ${msg.text()}`));
    });

    await page.goto('/tests/fixtures/demo.html?renderer=webgl&nodes=50&mappers=1&layout=none');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.ready).toBe(true);

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
    await expect(panel).toBeVisible();

    const editorToggle = panel.getByRole('button', { name: 'Editor' }).first();
    await expect(editorToggle).toBeVisible();
    if ((await editorToggle.getAttribute('aria-expanded')) === 'false') {
      await editorToggle.click();
    }

    const edgesTab = panel.getByRole('button', { name: 'Edges' }).first();
    await expect(edgesTab).toBeVisible();
    await edgesTab.click();

    const selectLocator = panel.locator('select');

    const channelSelectIndex = await selectLocator.evaluateAll((selects) => {
      const isChannelSelect = (sel) => {
        const labels = new Set(Array.from(sel.options ?? []).map((opt) => (opt.textContent ?? '').trim()));
        return labels.has('Color') && labels.has('Width') && labels.has('Opacity');
      };
      return selects.findIndex(isChannelSelect);
    });
    expect(channelSelectIndex).toBeGreaterThanOrEqual(0);
    await selectLocator.nth(channelSelectIndex).selectOption({ label: 'Color' });

    const endpointsSelectIndex = await selectLocator.evaluateAll((selects) => {
      const isEndpointsSelect = (sel) => {
        const labels = new Set(Array.from(sel.options ?? []).map((opt) => (opt.textContent ?? '').trim()));
        return labels.has('Both') && labels.has('Source') && labels.has('Target');
      };
      return selects.findIndex(isEndpointsSelect);
    });
    expect(endpointsSelectIndex).toBeGreaterThanOrEqual(0);

    const applyButton = panel.getByRole('button', { name: 'Apply' }).first();
    await expect(applyButton).toBeVisible();

    const endpointsSelect = selectLocator.nth(endpointsSelectIndex);
    await endpointsSelect.selectOption({ label: 'Source' });
    await expect(applyButton).toBeEnabled();

    await endpointsSelect.selectOption({ label: 'Target' });
    await expect(applyButton).toBeEnabled();

    if (errors.length) {
      await testInfo.attach('browser-errors', {
        body: formatBrowserErrors(errors),
        contentType: 'text/plain',
      });
    }
    expect(errors, formatBrowserErrors(errors)).toHaveLength(0);
  });
});

