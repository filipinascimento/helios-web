import { test, expect } from '@playwright/test';

test.describe('docs basic demo mappers', () => {
  test('edge color node passthrough endpoints update mapper config', async ({ page }) => {
    await page.goto('/?nodes=200&mode=2d&renderer=webgl');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-mappers"]').first();
    await expect(panel).toBeVisible();

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

    const nodeAttrSelectIndex = await selectLocator.evaluateAll((selects) => {
      const isNodeAttributeSelect = (sel) => {
        const optionLabels = Array.from(sel.options ?? []).map((opt) => (opt.textContent ?? '').trim());
        return optionLabels.includes('Node: color') && optionLabels.includes('Node: weight');
      };
      return selects.findIndex(isNodeAttributeSelect);
    });
    expect(nodeAttrSelectIndex).toBeGreaterThanOrEqual(0);
    const nodeAttrOptions = await selectLocator.nth(nodeAttrSelectIndex).evaluate((sel) => {
      return Array.from(sel.options ?? []).map((opt) => (opt.textContent ?? '').trim());
    });
    expect(nodeAttrOptions).not.toContain('Node: position');

    const findEndpointsSelectIndex = async () => selectLocator.evaluateAll((selects) => {
      const isEndpointsSelect = (sel) => {
        const labels = new Set(Array.from(sel.options ?? []).map((opt) => (opt.textContent ?? '').trim()));
        return labels.has('Both') && labels.has('Source') && labels.has('Target');
      };
      return selects.findIndex(isEndpointsSelect);
    });
    let endpointsSelectIndex = await findEndpointsSelectIndex();
    expect(endpointsSelectIndex).toBeGreaterThanOrEqual(0);

    const applyButton = panel.getByRole('button', { name: 'Apply' }).first();
    await expect(applyButton).toBeVisible();

    const readColorChannel = async () => page.evaluate(() => {
      const helios = window.__helios;
      const nodeMapper = helios?.nodeMapper?.toCombinedMapper?.() ?? null;
      const edgeMapper = helios?.edgeMapper?.toCombinedMapper?.({ nodeMapper }) ?? null;
      const channel = edgeMapper?.getChannel?.('color') ?? null;
      if (!channel) throw new Error('missing combined edge color channel');
      return {
        type: channel.type ?? null,
        nodeAttribute: channel.nodeAttribute ?? null,
        attributes: Array.isArray(channel.attributes) ? Array.from(channel.attributes) : channel.attributes ?? null,
        endpoints: channel.endpoints ?? null,
      };
    });

    const nodeAttrSelect = selectLocator.nth(nodeAttrSelectIndex);
    await expect(nodeAttrSelect).toHaveValue('@node.color');

    let endpointsSelect = selectLocator.nth(endpointsSelectIndex);
    await endpointsSelect.selectOption({ label: 'Both' });
    await applyButton.click();
    const both = await readColorChannel();
    expect(both.type).toBe('nodeAttribute');
    expect(both.nodeAttribute).toBeTruthy();
    expect(both.endpoints).toBe('both');

    endpointsSelectIndex = await findEndpointsSelectIndex();
    expect(endpointsSelectIndex).toBeGreaterThanOrEqual(0);
    endpointsSelect = selectLocator.nth(endpointsSelectIndex);
    await endpointsSelect.selectOption({ label: 'Target' });
    await applyButton.click();
    const target = await readColorChannel();
    expect(target.type).toBe('nodeAttribute');
    expect(target.nodeAttribute).toBe(both.nodeAttribute);
    expect(target.endpoints).toBe('destination');
  });
});
