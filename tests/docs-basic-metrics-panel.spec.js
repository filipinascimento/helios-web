import { test, expect } from '@playwright/test';

test.describe('docs basic demo metrics panel', () => {
  test('can start and cancel worker metrics run', async ({ page }, testInfo) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=6000');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-metrics"]');
    await expect(panel).toBeVisible();

    const leidenHeader = panel.locator('button.helios-ui-subpanel__header', { hasText: 'Communities (Leiden)' });
    const leidenItem = leidenHeader.locator('..');
    if ((await leidenItem.getAttribute('data-collapsed')) === 'true') {
      await leidenHeader.click();
    }

    const advancedHeader = leidenItem.locator('button.helios-ui-subpanel__header', { hasText: 'Advanced' });
    const advancedItem = advancedHeader.locator('..');
    if ((await advancedItem.getAttribute('data-collapsed')) === 'true') {
      await advancedHeader.click();
    }
    await panel.locator('[data-testid="metrics-yieldMs"]').fill('25');
    await panel.locator('[data-testid="metrics-timeoutMs"]').fill('1');
    await panel.locator('[data-testid="metrics-chunkBudget"]').fill('200');

    await panel.locator('[data-testid="metrics-calc"]').click();

    const status = panel.locator('[data-testid="metrics-status"]');
    await expect(status).toBeVisible();

    // Ensure the run starts (or finishes extremely quickly).
    await expect(status).toHaveText(/Running…|Done|Canceled|Session canceled/i, { timeout: 20_000 });

    const cancel = panel.locator('[data-testid="metrics-cancel"]');
    const canCancel = await cancel.isEnabled();
    if (canCancel) {
      await cancel.click();
      await expect(status).toHaveText(/Canceled|Session canceled/i, { timeout: 20_000 });
    } else {
      // If the run finished before we could cancel, it must have produced results.
      const modularity = panel.locator('[data-testid="metrics-modularity"]');
      await expect(modularity).not.toHaveText('—');
    }

    const snapshot = await page.evaluate(() => {
      const helios = window.__helios;
      const net = helios?.network;
      return {
        nodes: net?.nodeCount ?? 0,
        edges: net?.edgeCount ?? 0,
        hasCommunityAttr: Boolean(net?.hasNodeAttribute?.('community') || net?._nodeAttributes?.has?.('community')),
      };
    });

    await testInfo.attach('metrics-panel-state', {
      body: JSON.stringify(snapshot, null, 2),
      contentType: 'application/json',
    });

    expect(snapshot.nodes).toBeGreaterThan(0);
    expect(snapshot.edges).toBeGreaterThan(0);
  });
});
