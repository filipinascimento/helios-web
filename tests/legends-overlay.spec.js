import { test, expect } from '@playwright/test';

async function waitForHelios(page) {
  await page.waitForFunction(() =>
    Boolean(window.__helios && window.__helios.ready && window.__HELIOS_DIAGNOSTICS__?.ready === true),
  );
}

async function readLegends(page) {
  return page.evaluate(() => {
    const groups = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-legends-layer .helios-legend'));
    return groups.map((group) => {
      const transform = group.getAttribute('transform') ?? '';
      const match = /translate\(([-0-9.]+),\s*([-0-9.]+)\)/.exec(transform);
      const box = group.getBBox();
      return {
        kind: group.dataset.legendKind ?? '',
        x: match ? Number(match[1]) : NaN,
        y: match ? Number(match[2]) : NaN,
        width: Number(box?.width ?? NaN),
        height: Number(box?.height ?? NaN),
      };
    });
  });
}

test.describe('legends overlay', () => {
  test('legends panel binds to LegendsBehavior instead of owning legend policy', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=800');
    await waitForHelios(page);

    await expect.poll(async () => page.evaluate(() => ({
      sameInstance: window.__heliosUI?._lastLegendsPanel?.legendsBehavior === window.__helios?.behavior?.legends,
      exposedState: window.__heliosUI?._lastLegendsPanel?.legendsBehavior?.state === window.__heliosUI?._lastLegendsPanel?.state,
    }))).toEqual({
      sameInstance: true,
      exposedState: true,
    });
  });

  test('renders default node color legend and keeps density legend inside the dock-adjusted view', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=800');
    await waitForHelios(page);

    await page.waitForFunction(() => {
      const legends = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-legends-layer .helios-legend'));
      return legends.some((el) => el.dataset.legendKind === 'nodeColor');
    });

    await expect(page.locator('svg.helios-layer-svg .helios-legends-layer [data-legend-frame="true"]')).toHaveCount(0);

    await page.evaluate(() => {
      window.__helios.density({ enabled: true, property: 'weight' });
      window.__helios.requestRender();
    });

    await page.waitForFunction(() => {
      const legends = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-legends-layer .helios-legend'));
      return legends.some((el) => el.dataset.legendKind === 'density');
    });

    const legends = await readLegends(page);
    const densityLegend = legends.find((entry) => entry.kind === 'density');
    expect(densityLegend).toBeTruthy();

    const metrics = await page.evaluate(() => ({
      width: window.__helios.size.width,
      insets: window.__heliosUI.panelManager.getDockInsets(),
    }));
    expect(densityLegend.x + densityLegend.width).toBeLessThanOrEqual(metrics.width - metrics.insets.right + 1);
  });

  test('legend visibility can be toggled from the legends panel', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=800');
    await waitForHelios(page);

    await page.waitForFunction(() => {
      const legends = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-legends-layer .helios-legend'));
      return legends.length > 0;
    });

    const legendsPanel = page.locator('helios-panel[heading="Legends"]').first();
    await expect(legendsPanel).toBeVisible();

    const visibleRow = legendsPanel.locator('.helios-ui-row', { hasText: 'Visible' }).first();
    await visibleRow.getByRole('switch').click();

    await page.waitForFunction(() => {
      const legends = Array.from(document.querySelectorAll('svg.helios-layer-svg .helios-legends-layer .helios-legend'));
      return legends.length === 0;
    });
  });
});
