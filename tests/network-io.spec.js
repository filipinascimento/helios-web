import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

function parseScreenshot(buffer) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (error, data) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(data);
    });
  });
}

test.describe('network load/save', () => {
  test('keeps persistence storage and sessions off for library-style construction by default', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=24');
    await waitForDiagnostics(page);

    const status = await page.evaluate(() => ({
      backendCount: window.__helios.persistence?.backendStatus?.().length ?? -1,
      hasSessionController: Boolean(window.__helios.persistence?.sessionController),
      networkAutosave: window.__helios.persistence?.get?.('network.persistence.autosave', null),
      positionAutosave: window.__helios.persistence?.get?.('positions.persistence.autosave', null),
    }));

    expect(status.backendCount).toBe(0);
    expect(status.hasSessionController).toBe(false);
    expect(status.networkAutosave).toBe(false);
    expect(status.positionAutosave).toBe(false);
  });

  test('round-trips via XNET and replaces the network in-place', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=64');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.nodeCount).toBeGreaterThan(10);

    const result = await page.evaluate(async () => {
      const helios = window.__helios;
      const before = { nodes: helios.network.nodeCount, edges: helios.network.edgeCount };

      const xnetBlob = await helios.saveNetwork('xnet', { output: 'blob' });
      const xnetText = await xnetBlob.text();

      await helios.loadNetwork(xnetBlob, { format: 'xnet', disposeOld: true, recreateRenderer: true });

      const after = { nodes: helios.network.nodeCount, edges: helios.network.edgeCount };
      let colorSum = 0;
      helios.network.withBufferAccess(() => {
        const nodeColors = helios.network.getNodeAttributeBuffer('_helios_visuals_color')?.view ?? null;
        colorSum = nodeColors
          ? Array.from(nodeColors.slice(0, Math.min(nodeColors.length, 256))).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0)
          : 0;
      });
      const targets = await helios.renderAttributeTracking?.();
      const bxnetBlob = await helios.saveNetwork('bxnet', { output: 'blob' });

      return {
        before,
        after,
        xnetHeader: xnetText.slice(0, 16),
        colorSum,
        hasTargets: Boolean(targets),
        bxnetSize: bxnetBlob.size,
      };
    });

    expect(result.xnetHeader).toContain('#XNET');
    expect(result.after.nodes).toBe(result.before.nodes);
    expect(result.after.edges).toBe(result.before.edges);
    expect(result.colorSum).toBeGreaterThan(0);
    expect(result.hasTargets).toBe(true);
    expect(result.bxnetSize).toBeGreaterThan(16);
  });

  test('loadNetwork uses the loaded file basename for network metadata', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=32');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const helios = window.__helios;
      const blob = await helios.saveNetwork('xnet', { output: 'blob' });
      const file = new File([blob], 'loaded-example-network.xnet', { type: 'application/octet-stream' });
      await helios.loadNetwork(file, {
        disposeOld: true,
        recreateRenderer: true,
        keepCamera: false,
      });
      const afterFile = {
        name: helios._lastLoadedNetworkName,
        base: helios._lastLoadedNetworkBase,
        format: helios._lastLoadedNetworkFormat,
      };
      const optionBlob = await helios.saveNetwork('xnet', { output: 'blob' });
      await helios.loadNetwork(optionBlob, {
        name: 'named-option-network.xnet',
        disposeOld: true,
        recreateRenderer: true,
        keepCamera: false,
      });
      return {
        afterFile,
        afterOption: {
          name: helios._lastLoadedNetworkName,
          base: helios._lastLoadedNetworkBase,
          format: helios._lastLoadedNetworkFormat,
        },
      };
    });

    expect(result.afterFile.name).toBe('loaded-example-network.xnet');
    expect(result.afterFile.base).toBe('loaded-example-network');
    expect(result.afterFile.format).toBe('xnet');
    expect(result.afterOption.name).toBe('named-option-network.xnet');
    expect(result.afterOption.base).toBe('named-option-network');
    expect(result.afterOption.format).toBe('xnet');
  });

  test('Data Network filename updates after programmatic named network load', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=32&session=0');
    await page.waitForFunction(() => window.__helios?.network?.nodeCount > 0);

    const dataPanel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-data"]').first();
    const nameInput = dataPanel.locator('.helios-ui-network__name input').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill('old-title');
    await nameInput.blur();
    await expect(nameInput).toHaveValue('old-title');

    await page.evaluate(async () => {
      const helios = window.__helios;
      const blob = await helios.saveNetwork('xnet', { output: 'blob' });
      const file = new File([blob], 'fresh-programmatic-title.xnet', { type: 'application/octet-stream' });
      await helios.loadNetwork(file, {
        disposeOld: true,
        recreateRenderer: true,
        keepCamera: false,
      });
    });

    await expect(nameInput).toHaveValue('fresh-programmatic-title');
  });

  test('imports and exports GML through the public network API', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=48');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const helios = window.__helios;
      const before = { nodes: helios.network.nodeCount, edges: helios.network.edgeCount };
      const gmlBlob = await helios.saveNetwork('gml', { output: 'blob' });
      const gmlText = await gmlBlob.text();
      await helios.loadNetwork(gmlBlob, {
        format: 'gml',
        disposeOld: true,
        recreateRenderer: true,
        keepCamera: false,
      });
      return {
        before,
        after: { nodes: helios.network.nodeCount, edges: helios.network.edgeCount },
        header: gmlText.slice(0, 64),
        size: gmlBlob.size,
      };
    });

    expect(result.header.toLowerCase()).toContain('graph');
    expect(result.size).toBeGreaterThan(16);
    expect(result.after.nodes).toBe(result.before.nodes);
    expect(result.after.edges).toBe(result.before.edges);
  });

  test('shows the GML lossy-export warning only as an icon when GML is selected', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=48&session=0');
    await page.waitForFunction(() => window.__helios?.network?.nodeCount > 0);
    const networkControls = page.locator('.helios-ui-network').first();
    const formatSelect = networkControls.locator('select').first();
    const warning = networkControls.locator('.helios-ui-network__format-warning').first();

    await expect(formatSelect).toBeVisible();
    await expect(warning).toBeHidden();
    await formatSelect.selectOption('gml');
    await expect(warning).toBeVisible();
    await expect(warning.locator('svg')).toHaveCount(1);
    await expect(warning).toHaveText('');
    await formatSelect.selectOption('bxnet');
    await expect(warning).toBeHidden();
  });

  test('loads a dropped GML file when fileDrop is enabled', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=24&fileDrop=1');
    await waitForDiagnostics(page);

    await page.evaluate(async () => {
      const helios = window.__helios;
      const HeliosNetwork = helios.network.constructor;
      const next = await HeliosNetwork.create({ directed: false, initialNodes: 0 });
      next.addNodes(5);
      next.addEdges([[0, 1], [1, 2], [2, 3], [3, 4]]);
      const blob = await next.saveGML({ format: 'blob' });
      next.dispose?.();
      const file = new File([blob], 'dropped-network.gml', { type: 'text/plain' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      const root = document.querySelector('.helios-root');
      root.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }));
    });

    await expect(page.locator('.helios-network-drop-overlay')).toBeVisible();

    await page.evaluate(() => {
      const overlayData = new DataTransfer();
      return window.__helios.network.constructor.create({ directed: false, initialNodes: 0 }).then(async (next) => {
        next.addNodes(5);
        next.addEdges([[0, 1], [1, 2], [2, 3], [3, 4]]);
        const blob = await next.saveGML({ format: 'blob' });
        next.dispose?.();
        overlayData.items.add(new File([blob], 'dropped-network.gml', { type: 'text/plain' }));
        document.querySelector('.helios-root').dispatchEvent(new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: overlayData,
        }));
      });
    });

    await expect(page.locator('.helios-network-drop-overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__helios.network.nodeCount)).toBe(5);
    await expect.poll(() => page.evaluate(() => window.__helios.network.edgeCount)).toBe(4);
  });

  test('still renders pixels after replacing the network', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=600');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.nodeCount).toBeGreaterThan(100);
    expect(diagnostics.renderer.toLowerCase()).toContain('webgl');

    await page.waitForTimeout(500);
    const beforeScreenshot = await page.screenshot({ fullPage: false });

    await page.evaluate(async () => {
      const helios = window.__helios;
      const xnetBlob = await helios.saveNetwork('xnet', { output: 'blob' });
      await helios.loadNetwork(xnetBlob, { format: 'xnet', disposeOld: true, recreateRenderer: true });
      helios.requestRender?.();
    });

    await page.waitForTimeout(750);
    const afterScreenshot = await page.screenshot({ fullPage: false });

    const countNonBackground = async (buffer) => {
      const png = await parseScreenshot(buffer);
      let nonBackground = 0;
      const threshold = 10;
      for (let i = 0; i < png.data.length; i += 4) {
        const r = png.data[i];
        const g = png.data[i + 1];
        const b = png.data[i + 2];
        if (r > threshold || g > threshold || b > threshold) nonBackground += 1;
      }
      return nonBackground;
    };

    const beforeNonBackground = await countNonBackground(beforeScreenshot);
    const afterNonBackground = await countNonBackground(afterScreenshot);

    expect(beforeNonBackground).toBeGreaterThan(500);
    expect(afterNonBackground).toBeGreaterThan(500);
  });

  test('frames the camera when loading a differently-scaled network', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&layout=none&mode=2d&nodes=400');
    await waitForDiagnostics(page);

    await page.evaluate(async () => {
      const helios = window.__helios;
      const network = helios.network;
      network.withBufferAccess(() => {
        const active = network.nodeIndices || [];
        const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
        for (let i = 0; i < active.length; i += 1) {
          const id = active[i];
          const o = id * 3;
          pos[o] = pos[o] * 1e6 + 5e6;
          pos[o + 1] = pos[o + 1] * 1e6 - 5e6;
          pos[o + 2] = 0;
        }
        network.bumpNodeAttributeVersion?.('_helios_visuals_position');
      });
      const blob = await helios.saveNetwork('xnet', { output: 'blob' });
      await helios.loadNetwork(blob, { format: 'xnet', disposeOld: true, recreateRenderer: true, keepCamera: false });
    });

    await page.waitForTimeout(750);
    const screenshot = await page.screenshot({ fullPage: false });
    const png = await parseScreenshot(screenshot);
    let nonBackground = 0;
    const threshold = 10;
    for (let i = 0; i < png.data.length; i += 4) {
      const r = png.data[i];
      const g = png.data[i + 1];
      const b = png.data[i + 2];
      if (r > threshold || g > threshold || b > threshold) nonBackground += 1;
    }
    expect(nonBackground).toBeGreaterThan(500);
  });
});
