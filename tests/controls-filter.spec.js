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

    await filterPanel.locator('[data-testid="controls-filter-edge-numeric-remove"]').first().click();
    await filterPanel.getByRole('button', { name: 'Nodes' }).first().click();
    await filterPanel.locator('[data-testid="controls-filter-node-numeric-remove"]').first().click();

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

  test('supports string, categorical, and raw query filters with add/remove controls', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=900');
    await waitForHelios(page);

    const filterPanel = panelByTitle(page, 'Filter');
    await expect(filterPanel).toBeVisible();

    const nodeAttr = filterPanel.locator('[data-testid="controls-filter-node-attribute"]').first();
    await expect(nodeAttr).toBeVisible();
    await nodeAttr.selectOption('label');
    await filterPanel.locator('[data-testid=\"controls-filter-node-string-operator\"]').first().selectOption('starts_with');
    await filterPanel.locator('[data-testid=\"controls-filter-node-string-value\"]').first().fill('node-1');

    await page.waitForFunction(() => {
      const filter = window.__helios?.getGraphFilter?.();
      return Boolean(filter && filter.enabled === true && filter.nodeCount < filter.baseNodeCount);
    });

    await nodeAttr.selectOption('category');
    const categoryList = filterPanel.locator('[data-testid=\"controls-filter-node-categorical-list\"]').first();
    await categoryList.selectOption('category1');

    await page.waitForFunction(() => {
      const filter = window.__helios?.getGraphFilter?.();
      return Boolean(filter && filter.enabled === true && String(filter.options?.nodeQuery ?? '').includes('category'));
    });

    await nodeAttr.selectOption('__query__');
    await filterPanel.locator('[data-testid=\"controls-filter-node-query\"]').first().fill('weight >= 0.2');

    await page.waitForFunction(() => {
      const filter = window.__helios?.getGraphFilter?.();
      const query = String(filter?.options?.nodeQuery ?? '');
      return Boolean(filter && filter.enabled === true && query.includes('weight >= 0.2'));
    });

    await filterPanel.locator('[data-testid=\"controls-filter-node-string-remove\"]').first().click();
    await filterPanel.locator('[data-testid=\"controls-filter-node-categorical-remove\"]').first().click();
    await filterPanel.locator('[data-testid=\"controls-filter-node-query\"]').first().fill('');

    await page.waitForFunction(() => {
      const filter = window.__helios?.getGraphFilter?.();
      return Boolean(filter && filter.enabled === false);
    });
  });
});
