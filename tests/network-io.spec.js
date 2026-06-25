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
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=24&mappers=1');
    await waitForDiagnostics(page);

    const status = await page.evaluate(() => ({
      hasPersistenceFacade: Object.prototype.hasOwnProperty.call(window.__helios, 'persistence'),
      networkAutosave: window.__helios.states?.get?.('network.persistence.autosave', null),
      positionAutosave: window.__helios.states?.get?.('positions.persistence.autosave', null),
      storageType: window.__helios.storage?.type ?? null,
      storageCapabilities: window.__helios.storage?.capabilities ?? null,
    }));

    expect(status.hasPersistenceFacade).toBe(false);
    expect(status.networkAutosave).toBe(false);
    expect(status.positionAutosave).toBe(false);
    expect(status.storageType).toBe('dummy');
    expect(status.storageCapabilities?.persistent).toBe(false);
    expect(status.storageCapabilities?.sessions).toBe(false);
    await expect(page.locator('.helios-ui--storage-disabled')).toHaveCount(1);
    const visibleDirtyIndicators = await page.locator('.helios-ui-dirty-indicator').evaluateAll((nodes) => (
      nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      }).length
    ));
    expect(visibleDirtyIndicators).toBe(0);
    await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();
    await expect(page.locator('.helios-ui-network-persistence')).toHaveCount(0);
  });

  test('dummy storage state round-trips through exported snapshots without durable UI chrome', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=48&mappers=1');
    await waitForDiagnostics(page);

    await expect(page.locator('.helios-ui--storage-disabled')).toHaveCount(1);
    await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();
    await expect(page.locator('.helios-ui-network-persistence')).toHaveCount(0);
    const visibleDirtyIndicators = await page.locator('.helios-ui-dirty-indicator').evaluateAll((nodes) => (
      nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      }).length
    ));
    expect(visibleDirtyIndicators).toBe(0);

    const result = await page.evaluate(async () => {
      const helios = window.__helios;
      const writeEdgeWidth = (value, reason) => {
        helios.states.set('appearance.edgeStyle.widthScale', value, {
          scope: 'workspace',
          source: 'ui',
          reason,
        });
      };
      const readState = () => ({
        value: helios.edgeWidthScale(),
        stored: helios.states.get('appearance.edgeStyle.widthScale'),
        status: helios.states.status('appearance.edgeStyle.widthScale')?.state ?? null,
      });

      writeEdgeWidth(2.75, 'dummy-snapshot-initial');
      const visualizationSnapshot = helios.exportVisualizationState({
        layoutRuntime: { includePositions: false },
      });
      const sessionSnapshot = await helios.storage.serializeSessionSnapshot({
        id: 'dummy-exported-session',
        includeNetwork: false,
        snapshotLayoutRuntime: false,
        captureThumbnail: false,
      });
      const portableNetwork = await helios.savePortableNetwork('xnet', {
        output: 'blob',
        includeVisualization: true,
        includeCurrentPositions: false,
        layoutRuntime: { includePositions: false },
      });

      writeEdgeWidth(1.1, 'dummy-snapshot-reset-before-visualization');
      await helios.importVisualizationState(visualizationSnapshot, {
        restoreLayoutRuntime: false,
        reason: 'dummy-visualization-import',
      });
      const afterVisualization = readState();

      writeEdgeWidth(1.2, 'dummy-snapshot-reset-before-session');
      await helios.storage.restoreSessionSnapshot(sessionSnapshot, {
        restoreLayoutRuntime: false,
        restoreVisualizationState: true,
        markFinished: true,
        reason: 'dummy-session-restore',
      });
      const afterSession = readState();

      writeEdgeWidth(1.3, 'dummy-snapshot-reset-before-network');
      await helios.loadNetwork(portableNetwork, {
        format: 'xnet',
        disposeOld: true,
        recreateRenderer: true,
        keepCamera: false,
        restoreVisualizationState: true,
      });
      const afterNetwork = readState();

      return {
        storageType: helios.storage.type,
        capabilities: helios.storage.capabilities,
        visualizationStorageState: visualizationSnapshot.payload.storageState,
        sessionStorageState: sessionSnapshot.payload.visualizationState.payload.storageState,
        afterVisualization,
        afterSession,
        afterNetwork,
      };
    });

    expect(result.storageType).toBe('dummy');
    expect(result.capabilities.persistent).toBe(false);
    expect(result.capabilities.sessions).toBe(false);
    expect(result.visualizationStorageState.type).toBe('dummy');
    expect(result.sessionStorageState.type).toBe('dummy');
    const readExportedEdgeWidth = (snapshot) => (
      snapshot.state.overrides['appearance.edgeStyle.widthScale']
      ?? snapshot.state.overrides['behaviors.appearance.edgeWidthScale']
    );
    expect(readExportedEdgeWidth(result.visualizationStorageState)).toBeCloseTo(2.75, 3);
    expect(readExportedEdgeWidth(result.sessionStorageState)).toBeCloseTo(2.75, 3);
    expect(result.afterVisualization.value).toBeCloseTo(2.75, 3);
    expect(result.afterVisualization.stored).toBeCloseTo(2.75, 3);
    expect(result.afterVisualization.status).toBe('changed');
    expect(result.afterSession.value).toBeCloseTo(2.75, 3);
    expect(result.afterSession.stored).toBeCloseTo(2.75, 3);
    expect(result.afterNetwork.value).toBeCloseTo(2.75, 3);
    expect(result.afterNetwork.stored).toBeCloseTo(2.75, 3);
    await expect(page.locator('.helios-ui-resume-prompt').first()).toBeHidden();
    await expect(page.locator('.helios-ui-network-persistence')).toHaveCount(0);
    const visibleDirtyIndicatorsAfterRestore = await page.locator('.helios-ui-dirty-indicator').evaluateAll((nodes) => (
      nodes.filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      }).length
    ));
    expect(visibleDirtyIndicatorsAfterRestore).toBe(0);
  });

  test('storage network snapshots save full state and current positions for reload', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=48&mappers=1');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const helios = window.__helios;
      const originalPositions = helios._snapshotNodePositions();
      const savedPositions = new Float32Array(originalPositions);
      for (let i = 0; i < Math.min(savedPositions.length, 18); i += 1) {
        savedPositions[i] = (i + 1) * 11.25;
      }
      helios._writeNodePositions(savedPositions);
      helios.states.set('appearance.edgeStyle.widthScale', 2.625, {
        scope: 'workspace',
        source: 'ui',
        reason: 'network-snapshot-full-state-save',
      });

      const blob = await helios.storage.saveNetworkSnapshot('xnet', {
        output: 'blob',
        includeVisualization: true,
        includeCurrentPositions: true,
        fullVisualizationState: true,
        layoutRuntime: { preferDelegate: true },
        storage: { includeJournal: false },
      });
      const loadedForInspection = await helios.network.constructor.fromXNet(blob);
      const attached = helios.getAttachedVisualizationState(loadedForInspection);
      loadedForInspection.dispose?.();

      const mutatedPositions = new Float32Array(savedPositions);
      for (let i = 0; i < Math.min(mutatedPositions.length, 18); i += 1) {
        mutatedPositions[i] = -1000 - i;
      }
      helios._writeNodePositions(mutatedPositions);
      helios.states.set('appearance.edgeStyle.widthScale', 1.125, {
        scope: 'workspace',
        source: 'ui',
        reason: 'network-snapshot-reset-before-load',
      });

      await helios.loadNetwork(blob, {
        format: 'xnet',
        disposeOld: true,
        recreateRenderer: true,
        keepCamera: false,
        restoreVisualizationState: true,
      });

      return {
        blobSize: blob.size,
        attachedSparse: attached?.metadata?.sparse === true,
        behaviorStateKeys: Object.keys(attached?.payload?.behaviorState ?? {}),
        hasUiState: attached?.payload?.uiState && typeof attached.payload.uiState === 'object',
        positionEncoding: attached?.payload?.layoutRuntimeState?.positions?.encoding ?? null,
        savedHead: Array.from(savedPositions.slice(0, 18)),
        restoredHead: Array.from(helios._snapshotNodePositions().slice(0, 18)),
        edgeWidth: helios.edgeWidthScale(),
        storedEdgeWidth: helios.states.get('appearance.edgeStyle.widthScale'),
        edgeWidthStatus: helios.states.status('appearance.edgeStyle.widthScale')?.state ?? null,
      };
    });

    expect(result.blobSize).toBeGreaterThan(16);
    expect(result.attachedSparse).toBe(false);
    expect(result.behaviorStateKeys.length).toBeGreaterThan(0);
    expect(result.hasUiState).toBe(true);
    expect(result.positionEncoding).toBe('float32-base64');
    expect(result.edgeWidth).toBeCloseTo(2.625, 3);
    expect(result.storedEdgeWidth).toBeCloseTo(2.625, 3);
    expect(result.edgeWidthStatus).toBe('changed');
    for (let i = 0; i < result.savedHead.length; i += 1) {
      expect(result.restoredHead[i]).toBeCloseTo(result.savedHead[i], 4);
    }
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

  test('imports and exports GT through the public network API', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=48');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const helios = window.__helios;
      const before = { nodes: helios.network.nodeCount, edges: helios.network.edgeCount };
      const gtBlob = await helios.saveNetwork('gt', { output: 'blob' });
      await helios.loadNetwork(gtBlob, {
        format: 'gt',
        disposeOld: true,
        recreateRenderer: true,
        keepCamera: false,
      });
      return {
        before,
        after: { nodes: helios.network.nodeCount, edges: helios.network.edgeCount },
        size: gtBlob.size,
      };
    });

    expect(result.size).toBeGreaterThan(16);
    expect(result.after.nodes).toBe(result.before.nodes);
    expect(result.after.edges).toBe(result.before.edges);
  });

  test('loads GT zstd files through filename inference', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?layout=none&mode=2d&nodes=48');
    await waitForDiagnostics(page);

    const result = await page.evaluate(async () => {
      const helios = window.__helios;
      const bytes = Uint8Array.from(
        atob('KLUv/QBofQgA8o0wKpA7B1i1qLvdL2f13wJtPJEw+fNDUqIkCXbKP8LgElq9YTmfa+fwBGokSdroQ/1Gq2OqCR4MBSiAWkiaBnnie2X1IAFSmsjxlflFjouS+B6h4tZZSGV9Eu27nM/r8+b6QeX26wek6QHeIuNW7i7uuhdtTX/puE46vRttZZf1G53lj5870VZ/5bgrEe14YIy23JqxX1oz6ekfsVucdsInNh3jlYwpFFnW/W+IdlsprcHRUidt7/1r6yKmUkd6T9vDAQUiKJBG7G4DEBjjKA0KhQ6LjBNmuZEQhxihLRcUFGMcSzSeYBXpsPASACW2lNDPtcZQMM2WsZzQcVhNbKbFsH2uEglJCwBi2OMXCQ=='),
        (char) => char.charCodeAt(0),
      );
      const file = new File([bytes], 'netzschleuder-sample.gt.zst', { type: 'application/zstd' });
      await helios.loadNetwork(file, {
        disposeOld: true,
        recreateRenderer: true,
        keepCamera: false,
      });
      return {
        nodes: helios.network.nodeCount,
        edges: helios.network.edgeCount,
        format: helios._lastLoadedNetworkFormat,
        base: helios._lastLoadedNetworkBase,
        title: helios.network.getNetworkStringAttribute('title'),
        label: helios.network.getNodeStringAttribute('label', 1),
        ...helios.network.withBufferAccess(() => ({
          score: helios.network.getNodeAttributeBuffer('score').view[2],
          coords: Array.from(helios.network.getNodeAttributeBuffer('coords').view.slice(4, 6)),
          weights: Array.from(helios.network.getEdgeAttributeBuffer('weight').view.slice(0, 3)),
        })),
      };
    });

    expect(result.nodes).toBe(3);
    expect(result.edges).toBe(3);
    expect(result.format).toBe('gt');
    expect(result.base).toBe('netzschleuder-sample');
    expect(result.title).toBe('gt-zst-demo');
    expect(result.label).toBe('Beta');
    expect(result.score).toBeCloseTo(3.75);
    expect(result.coords).toEqual([5, 6]);
    expect(result.weights).toEqual([0.5, 1.5, 2.5]);
  });

  test('shows the lossy-export warning only as an icon when interoperability formats are selected', async ({ page }) => {
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
    await formatSelect.selectOption('gt');
    await expect(warning).toBeVisible();
    await formatSelect.selectOption('bxnet');
    await expect(warning).toBeHidden();
  });

  test('Data panel save uses full storage network snapshot options', async ({ page }) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=32&session=0');
    await page.waitForFunction(() => window.__helios?.network?.nodeCount > 0);

    await page.evaluate(() => {
      const helios = window.__helios;
      const calls = [];
      const original = helios.storage.saveNetworkSnapshot.bind(helios.storage);
      helios.storage.saveNetworkSnapshot = async (format, options = {}) => {
        calls.push({ format, options: structuredClone(options) });
        return new Blob(['stub-network'], { type: 'application/octet-stream' });
      };
      window.__saveNetworkSnapshotCalls = calls;
      window.__restoreSaveNetworkSnapshot = () => {
        helios.storage.saveNetworkSnapshot = original;
      };
    });

    const networkControls = page.locator('.helios-ui-network').first();
    await networkControls.locator('.helios-ui-network__actions select').selectOption('xnet');
    await networkControls.getByRole('button', { name: 'Save network' }).click();
    await expect.poll(() => page.evaluate(() => window.__saveNetworkSnapshotCalls?.length ?? 0)).toBe(1);
    const [call] = await page.evaluate(() => window.__saveNetworkSnapshotCalls);
    await page.evaluate(() => window.__restoreSaveNetworkSnapshot?.());

    expect(call.format).toBe('xnet');
    expect(call.options.output).toBe('blob');
    expect(call.options.includeVisualization).toBe(true);
    expect(call.options.includeCurrentPositions).toBe(true);
    expect(call.options.fullVisualizationState).toBe(true);
    expect(call.options.layoutRuntime).toEqual({ preferDelegate: true });
    expect(call.options.storage).toEqual({ includeJournal: false });
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
