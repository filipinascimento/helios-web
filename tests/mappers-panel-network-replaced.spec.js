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

async function ensureMappersPanelVisible(page) {
  const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
  if (await panel.isVisible()) return panel;
  await page.evaluate(() => {
    const behavior = window.__helios?.behavior?.interface;
    behavior?.openControlsSurface?.();
    behavior?.activateControl?.('helios-ui-mappers');
  });
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('mappers panel', () => {
  test('remains usable after network replacement disposes old network', async ({ page }, testInfo) => {
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

    const panel = await ensureMappersPanelVisible(page);

    const domainInputsBefore = panel.locator('.helios-ui-range2__values').first().locator('input[type="number"]');
    await expect(domainInputsBefore).toHaveCount(2);
    const domainMaxBefore = await domainInputsBefore.nth(1).inputValue();
    expect(Number(domainMaxBefore)).toBeGreaterThanOrEqual(49);

    await page.evaluate(async () => {
      const HeliosNetwork = window.__helios?.network?.constructor;
      if (!HeliosNetwork?.create) throw new Error('Unable to access HeliosNetwork constructor');
      const network = await HeliosNetwork.create({ directed: false, initialNodes: 0 });
      const nodes = network.addNodes(32);
      const edges = [];
      for (let i = 0; i < nodes.length; i += 1) {
        edges.push([nodes[i], nodes[(i + 1) % nodes.length]]);
      }
      network.addEdges(edges);
      await window.__helios.replaceNetwork(network, { disposeOld: true, keepCamera: true });
    });

    await page.waitForFunction(() => window.__helios?.network?.nodeCount === 32);
    const domainInputsAfter = panel.locator('.helios-ui-range2__values').first().locator('input[type="number"]');
    await expect(domainInputsAfter).toHaveCount(2);
    await expect(domainInputsAfter.nth(1)).toHaveValue('31');

    const sourceSelect = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Attribute' }),
    }).locator('select').first();
    const typeSelect = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Type' }),
    }).locator('select').first();

    await sourceSelect.selectOption('$constant');
    await expect(typeSelect).toHaveValue('constant');

    await sourceSelect.selectOption('color');
    await expect(typeSelect).toHaveValue('passthrough');

    await sourceSelect.selectOption('$index');
    await expect(typeSelect).toHaveValue('colormap');

    if (errors.length) {
      await testInfo.attach('browser-errors', {
        body: formatBrowserErrors(errors),
        contentType: 'text/plain',
      });
    }
    expect(errors, formatBrowserErrors(errors)).toHaveLength(0);
  });
});
