import { test, expect } from '@playwright/test';

async function waitForHelios(page) {
  await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
  await page.waitForFunction(() => Boolean(window.__heliosUI));
}

function panelByTitle(page, title) {
  return page.locator('.helios-ui-panel', {
    has: page.locator('.helios-ui-panel__title', { hasText: title }),
  }).first();
}

test.describe('filter panel', () => {
  test('applies node/edge numeric ranges with debounced auto-filter and layout scope toggle', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=900');
    await waitForHelios(page);

    const filterPanel = panelByTitle(page, 'Filter');
    await expect(filterPanel).toBeVisible();

    const nodeAttr = filterPanel.locator('[data-testid="controls-filter-node-attribute"]').first();
    await expect(nodeAttr).toBeVisible();
    await nodeAttr.selectOption('weight');

    const nodeMinSlider = filterPanel.locator('[data-testid="controls-filter-node-min-slider"]').first();
    await nodeMinSlider.evaluate((el) => {
      el.value = '0.6';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForFunction(() => {
      const filter = window.__helios?.getGraphFilter?.();
      return Boolean(filter && filter.enabled === true && filter.nodeCount < filter.baseNodeCount);
    });

    const filterAfterNode = await page.evaluate(() => window.__helios.getGraphFilter());
    expect(filterAfterNode.enabled).toBe(true);
    expect(filterAfterNode.scope).toBe('render');
    expect(filterAfterNode.nodeCount).toBeLessThan(filterAfterNode.baseNodeCount);

    const layoutCheckbox = filterPanel.locator('[data-testid="controls-filter-layout"]').first();
    await layoutCheckbox.check();

    await page.waitForFunction(() => {
      const filter = window.__helios?.getGraphFilter?.();
      return Boolean(filter && filter.enabled === true && filter.scope === 'render+layout');
    });

    const filterAfterLayoutScope = await page.evaluate(() => ({
      filter: window.__helios.getGraphFilter(),
      layoutUsesFilteredNetwork: window.__helios._layout?.network !== window.__helios.network,
    }));
    expect(filterAfterLayoutScope.filter.enabled).toBe(true);
    expect(filterAfterLayoutScope.filter.scope).toBe('render+layout');
    expect(filterAfterLayoutScope.layoutUsesFilteredNetwork).toBe(true);

    await filterPanel.getByRole('button', { name: 'Edges' }).first().click();
    const edgeAttr = filterPanel.locator('[data-testid="controls-filter-edge-attribute"]').first();
    await expect(edgeAttr).toBeVisible();
    await edgeAttr.selectOption('intensity');

    const edgeMinSlider = filterPanel.locator('[data-testid="controls-filter-edge-min-slider"]').first();
    await edgeMinSlider.evaluate((el) => {
      el.value = '0.7';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForFunction(() => {
      const filter = window.__helios?.getGraphFilter?.();
      return Boolean(filter && filter.enabled === true && filter.edgeCount < filter.baseEdgeCount);
    });

    const filterAfterEdge = await page.evaluate(() => window.__helios.getGraphFilter());
    expect(filterAfterEdge.enabled).toBe(true);
    expect(filterAfterEdge.edgeCount).toBeLessThan(filterAfterEdge.baseEdgeCount);

    await edgeAttr.selectOption('');
    await filterPanel.getByRole('button', { name: 'Nodes' }).first().click();
    await nodeAttr.selectOption('');

    await page.waitForFunction(() => {
      const filter = window.__helios?.getGraphFilter?.();
      return Boolean(filter && filter.enabled === false);
    });

    const filterAfterClear = await page.evaluate(() => ({
      filter: window.__helios.getGraphFilter(),
      layoutUsesBaseNetwork: window.__helios._layout?.network === window.__helios.network,
    }));
    expect(filterAfterClear.filter.enabled).toBe(false);
    expect(filterAfterClear.layoutUsesBaseNetwork).toBe(true);
  });
});
