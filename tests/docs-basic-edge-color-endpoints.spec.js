import { test, expect } from '@playwright/test';

test.describe('docs basic demo mappers', () => {
  test('edge color node passthrough endpoints update dense buffers', async ({ page }) => {
    await page.goto('/?nodes=200&mode=2d&renderer=webgl');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

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

    const nodeAttrSelectIndex = await selectLocator.evaluateAll((selects) => {
      const isNodeAttributeSelect = (sel) => {
        const optionLabels = Array.from(sel.options ?? []).map((opt) => (opt.textContent ?? '').trim());
        const blank = optionLabels[0] ?? '';
        return blank.toLowerCase().includes('select node attribute');
      };
      return selects.findIndex(isNodeAttributeSelect);
    });
    expect(nodeAttrSelectIndex).toBeGreaterThanOrEqual(0);
    const nodeAttrOptions = await selectLocator.nth(nodeAttrSelectIndex).evaluate((sel) => {
      return Array.from(sel.options ?? []).map((opt) => (opt.textContent ?? '').trim());
    });
    expect(nodeAttrOptions).not.toContain('position');

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

    const readFirstEdge = async () => page.evaluate(() => {
      const net = window.__helios?.network;
      if (!net) throw new Error('missing helios network');
      net.updateDenseEdgeIndexBuffer();
      const edgeId = net.getDenseEdgeIndexView().view[0];
      const edgesView = net.edgesView;
      const src = edgesView[edgeId * 2];
      const dst = edgesView[edgeId * 2 + 1];

      const nodeColor = net.getNodeAttributeBuffer('_helios_visuals_color').view;
      const srcNode = Array.from(nodeColor.subarray(src * 4, src * 4 + 4));
      const dstNode = Array.from(nodeColor.subarray(dst * 4, dst * 4 + 4));

      net.updateDenseEdgeAttributeBuffer('_helios_visuals_edge_color');
      const dense = net.getDenseEdgeAttributeView('_helios_visuals_edge_color').view;
      const start = Array.from(dense.subarray(0, 4));
      const end = Array.from(dense.subarray(4, 8));
      return { edgeId, src, dst, srcNode, dstNode, start, end };
    });

    const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

    await endpointsSelect.selectOption({ label: 'Both' });
    await applyButton.click();
    const both = await readFirstEdge();
    expect(close(both.start, both.srcNode)).toBe(true);
    expect(close(both.end, both.dstNode)).toBe(true);

    await endpointsSelect.selectOption({ label: 'Target' });
    await applyButton.click();
    const target = await readFirstEdge();
    expect(close(target.start, target.dstNode)).toBe(true);
    expect(close(target.end, target.dstNode)).toBe(true);
  });
});
