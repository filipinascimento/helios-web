import { test, expect } from '@playwright/test';

function panelById(page, id) {
  return page.locator(`.helios-ui-panel[data-panel-id="${id}"]`).first();
}

async function waitForHelios(page) {
  await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
}

async function ensurePanelVisible(page, id) {
  const panel = panelById(page, id);
  if (await panel.isVisible()) return panel;
  await page.evaluate((panelId) => {
    const behavior = window.__helios?.behavior?.interface;
    behavior?.openControlsSurface?.();
    behavior?.activateControl?.(panelId);
  }, id);
  await expect(panel).toBeVisible();
  return panel;
}

test.describe('mappers panel', () => {
  test('repairs stale categorical ranges when switching node size back to scale', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&nodes=120&mappers=1');
    await waitForHelios(page);

    await page.evaluate(() => {
      window.__mappersBehaviorCalls = [];
      const behavior = window.__helios?.behavior?.mappers;
      const original = behavior?.setChannelConfig?.bind(behavior);
      behavior.setChannelConfig = function setChannelConfigSpy(mode, channel, config) {
        window.__mappersBehaviorCalls.push({
          mode,
          channel,
          type: config?.type ?? config?.mode ?? null,
          attributes: config?.attributes ?? null,
        });
        return original(mode, channel, config);
      };
    });

    await page.evaluate(() => {
      const mapper = window.__helios?.nodeMapper?.defaultMapper;
      if (!mapper) throw new Error('Node mapper unavailable');
      mapper.setChannel('size', {
        name: 'size',
        type: 'categorical',
        attributes: 'bogus_category',
        domain: [0, 1, 2],
        range: [4, 8, 12],
      });
    });

    const panel = await ensurePanelVisible(page, 'helios-ui-mappers');

    const channelSelect = panel.locator('select').first();
    await channelSelect.selectOption({ label: 'Size' });

    const attributeSelect = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Attribute' }),
    }).locator('select').first();
    await attributeSelect.selectOption('$index');

    const typeSelect = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Type' }),
    }).locator('select').first();
    await expect(typeSelect).toHaveValue('linear');

    const rangeInputs = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Range' }),
    }).locator('input[type="number"]:visible');
    await expect(rangeInputs).toHaveCount(2);
    await expect(rangeInputs.nth(0)).toHaveValue('1');
    await expect(rangeInputs.nth(1)).toHaveValue('20');

    const applyButton = panel.getByRole('button', { name: 'Apply' }).first();
    await expect(applyButton).toBeEnabled();
    await applyButton.click();

    await expect.poll(async () => page.evaluate(() => window.__mappersBehaviorCalls.at(-1) ?? null)).toEqual({
      mode: 'node',
      channel: 'size',
      type: 'linear',
      attributes: '$index',
    });

    await expect.poll(async () => page.evaluate(() => {
      const cfg = window.__helios?.nodeMapper?.defaultMapper?.getChannel?.('size');
      return cfg
        ? {
            type: cfg.type ?? cfg.mode ?? null,
            attributes: cfg.attributes ?? null,
            range: Array.isArray(cfg.range) ? [...cfg.range] : null,
          }
        : null;
    })).toEqual({
      type: 'linear',
      attributes: '$index',
      range: [1, 20],
    });
  });

  test('refreshes open editor when mapper changes externally', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&nodes=60&mappers=1');
    await waitForHelios(page);

    const panel = await ensurePanelVisible(page, 'helios-ui-mappers');
    const attributeSelect = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Attribute' }),
    }).locator('select').first();
    const typeSelect = panel.locator('.helios-ui-row', {
      has: page.locator('.helios-ui-label__title', { hasText: 'Type' }),
    }).locator('select').first();

    await expect(attributeSelect).toHaveValue('$index');
    await expect(typeSelect).toHaveValue('colormap');

    await page.evaluate(() => {
      const helios = window.__helios;
      const network = helios?.network;
      if (!network) throw new Error('Network unavailable');
      network.defineNodeAttribute('panel_class', 0, 1);
      const labels = ['Alpha', 'Beta', 'Gamma'];
      for (let i = 0; i < network.nodeCount; i += 1) {
        network.setNodeStringAttribute('panel_class', i, labels[i % labels.length]);
      }
      network.categorizeNodeAttribute('panel_class', { sortOrder: 'natural' });
      helios.behavior.mappers.setChannelConfig('node', 'color', {
        type: 'categorical',
        attributes: 'panel_class',
        domain: [0, 1, 2],
        range: ['#1f77b4ff', '#ff7f0eff', '#2ca02cff'],
        defaultValue: '#888888ff',
        meta: {
          categorical: {
            palette: 'category18',
            preferScheme: true,
          },
        },
      });
    });

    await expect(attributeSelect).toHaveValue('panel_class');
    await expect(typeSelect).toHaveValue('categorical');
    await expect(panel.getByText('Others')).toBeVisible();
  });
});
