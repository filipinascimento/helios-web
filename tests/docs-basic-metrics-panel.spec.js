import { test, expect } from '@playwright/test';

async function ensureToggleOn(locator) {
  await expect(locator).toBeVisible();
  const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
  if (tag === 'input') {
    if (!(await locator.isChecked())) await locator.check();
    return;
  }
  if ((await locator.getAttribute('aria-checked')) !== 'true') await locator.click();
  await expect(locator).toHaveAttribute('aria-checked', 'true');
}

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

  test('can run dimensionality and write optional node outputs', async ({ page }, testInfo) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=1800');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-metrics"]');
    await expect(panel).toBeVisible();

    const dimHeader = panel.locator('button.helios-ui-subpanel__header', { hasText: 'Dimensionality' });
    const dimItem = dimHeader.locator('..');
    if ((await dimItem.getAttribute('data-collapsed')) === 'true') {
      await dimHeader.click();
    }

    await panel.locator('[data-testid="metrics-dimension-method"]').selectOption('leastsquares');
    await panel.locator('[data-testid="metrics-dimension-maxLevel"]').fill('6');
    await panel.locator('[data-testid="metrics-dimension-order"]').fill('2');

    const advancedHeader = dimItem.locator('button.helios-ui-subpanel__header', { hasText: 'Advanced' });
    const advancedItem = advancedHeader.locator('..');
    if ((await advancedItem.getAttribute('data-collapsed')) === 'true') {
      await advancedHeader.click();
    }

    await panel.locator('[data-testid="metrics-dimension-yieldMs"]').fill('5');
    await panel.locator('[data-testid="metrics-dimension-timeoutMs"]').fill('1');
    await panel.locator('[data-testid="metrics-dimension-chunkBudget"]').fill('100');
    await panel.locator('[data-testid="metrics-dimension-outMaxAttr"]').fill('dim_max_test');
    const saveLevels = panel.locator('[data-testid="metrics-dimension-saveLevels"]');
    await ensureToggleOn(saveLevels);
    await panel.locator('[data-testid="metrics-dimension-outLevelsAttr"]').fill('dim_levels_test');
    await panel.locator('[data-testid="metrics-dimension-levelsEncoding"]').selectOption('string');
    await panel.locator('[data-testid="metrics-dimension-levelsPrecision"]').fill('4');

    await panel.locator('[data-testid="metrics-dimension-calc"]').click();

    const status = panel.locator('[data-testid="metrics-dimension-status"]');
    await expect(status).toBeVisible();
    await expect(status).toHaveText(/Running…|Done|Canceled|Session canceled/i, { timeout: 20_000 });
    await expect(status).toHaveText(/Done/i, { timeout: 60_000 });

    const globalMax = panel.locator('[data-testid="metrics-dimension-globalMax"]');
    await expect(globalMax).not.toHaveText('—');

    const snapshot = await page.evaluate(() => {
      const helios = window.__helios;
      const net = helios?.network;
      const node = net?.nodeIndices?.[0] ?? 0;
      let maxValue = null;
      try {
        const buffer = net?.getNodeAttributeBuffer?.('dim_max_test');
        if (buffer?.view) {
          maxValue = Number(buffer.view[node]);
        }
      } catch (_) {
        maxValue = null;
      }
      return {
        node,
        hasDimMaxAttr: Boolean(net?.hasNodeAttribute?.('dim_max_test') || net?._nodeAttributes?.has?.('dim_max_test')),
        hasDimLevelsAttr: Boolean(net?.hasNodeAttribute?.('dim_levels_test') || net?._nodeAttributes?.has?.('dim_levels_test')),
        dimLevelsSample: net?.getNodeStringAttribute?.('dim_levels_test', node) ?? null,
        maxValue,
      };
    });

    await testInfo.attach('dimension-panel-state', {
      body: JSON.stringify(snapshot, null, 2),
      contentType: 'application/json',
    });

    expect(snapshot.hasDimMaxAttr).toBeTruthy();
    expect(snapshot.hasDimLevelsAttr).toBeTruthy();
    expect(snapshot.dimLevelsSample).toMatch(/^\[/);
    expect(Number.isFinite(snapshot.maxValue)).toBeTruthy();
  });

  test('renders new metric interfaces and runs available measurements', async ({ page }, testInfo) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=180');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(() => Boolean(window.__heliosUI));

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-metrics"]');
    await expect(panel).toBeVisible();

    const openSubpanel = async (title) => {
      const header = panel.locator('button.helios-ui-subpanel__header', { hasText: title });
      const item = header.locator('..');
      if ((await item.getAttribute('data-collapsed')) === 'true') {
        await header.click();
      }
      return item;
    };

    const support = await page.evaluate(() => {
      const net = window.__helios?.network;
      return {
        degree: typeof net?.measureDegree === 'function',
        strength: typeof net?.measureStrength === 'function',
        clustering: typeof net?.measureLocalClusteringCoefficient === 'function',
        eigenvector: typeof net?.measureEigenvectorCentrality === 'function',
        betweenness: typeof net?.measureBetweennessCentrality === 'function',
      };
    });

    await page.evaluate(() => {
      const net = window.__helios?.network;
      if (!net || typeof net.defineEdgeAttribute !== 'function' || typeof net.getEdgeAttributeBuffer !== 'function') return;
      try {
        net.getEdgeAttributeBuffer('metrics_weight_test');
      } catch (_) {
        net.defineEdgeAttribute('metrics_weight_test', 2, 1);
      }
      const edgeBuffer = net.getEdgeAttributeBuffer('metrics_weight_test');
      const edgeIndices = net.edgeIndices ?? [];
      for (let i = 0; i < edgeIndices.length; i += 1) {
        const edge = edgeIndices[i];
        edgeBuffer.view[edge] = 1 + ((i % 11) / 10);
      }
      if (typeof edgeBuffer.bumpVersion === 'function') edgeBuffer.bumpVersion();
    });

    const degreeItem = await openSubpanel('Degree');
    const degreeAdvancedHeader = degreeItem.locator('button.helios-ui-subpanel__header', { hasText: 'Advanced' });
    const degreeAdvancedItem = degreeAdvancedHeader.locator('..');
    if ((await degreeAdvancedItem.getAttribute('data-collapsed')) === 'true') {
      await degreeAdvancedHeader.click();
    }
    await panel.locator('[data-testid="metrics-degree-outAttr"]').fill('degree_test');
    await panel.locator('[data-testid="metrics-degree-calc"]').click();

    const strengthItem = await openSubpanel('Strength');
    const strengthAdvancedHeader = strengthItem.locator('button.helios-ui-subpanel__header', { hasText: 'Advanced' });
    const strengthAdvancedItem = strengthAdvancedHeader.locator('..');
    if ((await strengthAdvancedItem.getAttribute('data-collapsed')) === 'true') {
      await strengthAdvancedHeader.click();
    }
    await panel.locator('[data-testid="metrics-strength-weight"]').selectOption('');
    await panel.locator('[data-testid="metrics-strength-outAttr"]').fill('strength_test');
    await panel.locator('[data-testid="metrics-strength-calc"]').click();

    const clusteringItem = await openSubpanel('Local Clustering');
    const clusteringAdvancedHeader = clusteringItem.locator('button.helios-ui-subpanel__header', { hasText: 'Advanced' });
    const clusteringAdvancedItem = clusteringAdvancedHeader.locator('..');
    if ((await clusteringAdvancedItem.getAttribute('data-collapsed')) === 'true') {
      await clusteringAdvancedHeader.click();
    }
    await panel.locator('[data-testid="metrics-clustering-variant"]').selectOption('unweighted');
    await panel.locator('[data-testid="metrics-clustering-outAttr"]').fill('clustering_test');
    await panel.locator('[data-testid="metrics-clustering-calc"]').click();

    const eigenItem = await openSubpanel('Eigenvector Centrality');
    const eigenAdvancedHeader = eigenItem.locator('button.helios-ui-subpanel__header', { hasText: 'Advanced' });
    const eigenAdvancedItem = eigenAdvancedHeader.locator('..');
    if ((await eigenAdvancedItem.getAttribute('data-collapsed')) === 'true') {
      await eigenAdvancedHeader.click();
    }
    await panel.locator('[data-testid="metrics-eigen-maxIterations"]').fill('48');
    await panel.locator('[data-testid="metrics-eigen-tolerance"]').fill('1e-6');
    await panel.locator('[data-testid="metrics-eigen-outAttr"]').fill('eigen_test');
    await panel.locator('[data-testid="metrics-eigen-calc"]').click();

    const betweennessItem = await openSubpanel('Betweenness Centrality');
    const betweennessAdvancedHeader = betweennessItem.locator('button.helios-ui-subpanel__header', { hasText: 'Advanced' });
    const betweennessAdvancedItem = betweennessAdvancedHeader.locator('..');
    if ((await betweennessAdvancedItem.getAttribute('data-collapsed')) === 'true') {
      await betweennessAdvancedHeader.click();
    }
    await panel.locator('[data-testid="metrics-betweenness-weight"]').selectOption('');
    await panel.locator('[data-testid="metrics-betweenness-outAttr"]').fill('betweenness_test');
    await panel.locator('[data-testid="metrics-betweenness-calc"]').click();

    const degreeStatus = panel.locator('[data-testid="metrics-degree-status"]');
    const strengthStatus = panel.locator('[data-testid="metrics-strength-status"]');
    const clusteringStatus = panel.locator('[data-testid="metrics-clustering-status"]');
    const eigenStatus = panel.locator('[data-testid="metrics-eigen-status"]');
    const betweennessStatus = panel.locator('[data-testid="metrics-betweenness-status"]');

    await expect(degreeStatus).toHaveText(/Done|not available/i);
    await expect(strengthStatus).toHaveText(/Done|not available/i);
    await expect(clusteringStatus).toHaveText(/Done|not available/i);
    await expect(eigenStatus).toHaveText(/Done|not available/i);
    await expect(betweennessStatus).toHaveText(/Done|not available/i);

    const snapshot = await page.evaluate(() => {
      const net = window.__helios?.network;
      const node = net?.nodeIndices?.[0] ?? 0;
      const hasAttr = (name) => {
        try {
          return Boolean(net?.hasNodeAttribute?.(name) || net?._nodeAttributes?.has?.(name));
        } catch (_) {
          return false;
        }
      };
      const getValue = (name) => {
        try {
          const view = net?.getNodeAttributeBuffer?.(name)?.view;
          if (!view) return null;
          return Number(view[node]);
        } catch (_) {
          return null;
        }
      };
      return {
        support: {
          degree: typeof net?.measureDegree === 'function',
          strength: typeof net?.measureStrength === 'function',
          clustering: typeof net?.measureLocalClusteringCoefficient === 'function',
          eigenvector: typeof net?.measureEigenvectorCentrality === 'function',
          betweenness: typeof net?.measureBetweennessCentrality === 'function',
        },
        attrs: {
          degree: hasAttr('degree_test'),
          strength: hasAttr('strength_test'),
          clustering: hasAttr('clustering_test'),
          eigenvector: hasAttr('eigen_test'),
          betweenness: hasAttr('betweenness_test'),
        },
        values: {
          degree: getValue('degree_test'),
          strength: getValue('strength_test'),
          clustering: getValue('clustering_test'),
          eigenvector: getValue('eigen_test'),
          betweenness: getValue('betweenness_test'),
        },
      };
    });

    await testInfo.attach('new-metrics-panel-state', {
      body: JSON.stringify({ support, snapshot }, null, 2),
      contentType: 'application/json',
    });

    if (snapshot.support.degree) {
      expect(snapshot.attrs.degree).toBeTruthy();
      expect(Number.isFinite(snapshot.values.degree)).toBeTruthy();
    }
    if (snapshot.support.strength) {
      expect(snapshot.attrs.strength).toBeTruthy();
      expect(Number.isFinite(snapshot.values.strength)).toBeTruthy();
    }
    if (snapshot.support.clustering) {
      expect(snapshot.attrs.clustering).toBeTruthy();
      expect(Number.isFinite(snapshot.values.clustering)).toBeTruthy();
    }
    if (snapshot.support.eigenvector) {
      expect(snapshot.attrs.eigenvector).toBeTruthy();
      expect(Number.isFinite(snapshot.values.eigenvector)).toBeTruthy();
    }
    if (snapshot.support.betweenness) {
      expect(snapshot.attrs.betweenness).toBeTruthy();
      expect(Number.isFinite(snapshot.values.betweenness)).toBeTruthy();
    }
  });
});
