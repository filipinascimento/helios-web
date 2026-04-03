import { test, expect } from '@playwright/test';

async function waitForExample(page) {
  await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=180');
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && (diag.ready || diag.error);
  }, null, { timeout: 60000 });
  const diagnostics = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
  expect(diagnostics.error ?? null).toBeNull();
  expect(diagnostics.ready).toBe(true);
}

async function findNodeHits(page, count = 2) {
  return page.evaluate(async (needed) => {
    const helios = window.__helios;
    await helios._ensureIndexPickingTargets?.();
    const targets = helios.indexPickingTracker?.lastTargets;
    const target = targets?.node;
    if (!target || !helios.renderer?.readPixels) return [];

    const decode = (bytes, offset = 0) => {
      const r = bytes[offset] ?? 0;
      const g = bytes[offset + 1] ?? 0;
      const b = bytes[offset + 2] ?? 0;
      const a = bytes[offset + 3] ?? 0;
      return r + (g << 8) + (b << 16) + (a << 24) - 1;
    };

    const all = await helios.renderer.readPixels(target, {
      x: 0,
      y: 0,
      width: target.width,
      height: target.height,
    });
    const bytes = all instanceof Uint8Array ? all : new Uint8Array(all);
    const found = [];
    const seen = new Set();
    for (let y = 0; y < target.height && found.length < needed; y += 1) {
      for (let x = 0; x < target.width && found.length < needed; x += 1) {
        const value = decode(bytes, (y * target.width + x) * 4);
        if (value < 0 || seen.has(value)) continue;
        seen.add(value);
        found.push({ x, y, value });
      }
    }

    const size = helios.size ?? helios.renderer?.size ?? { width: 1, height: 1, devicePixelRatio: 1 };
    const pixelRatio = size.devicePixelRatio ?? 1;
    const scale = helios._picking?.options?.resolutionScale ?? 1;
    const isWebGL = helios.renderer?.device?.type === 'webgl2';

    return found.map((entry) => ({
      index: entry.value,
      x: entry.x / (pixelRatio * scale),
      y: (isWebGL ? (target.height - 1 - entry.y) : entry.y) / (pixelRatio * scale),
    }));
  }, count);
}

async function findEdgeOnlyHit(page) {
  return page.evaluate(async () => {
    const helios = window.__helios;
    await helios._ensureIndexPickingTargets?.();
    const targets = helios.indexPickingTracker?.lastTargets;
    const nodeTarget = targets?.node;
    const edgeTarget = targets?.edge;
    if (!nodeTarget || !edgeTarget || !helios.renderer?.readPixels) return null;

    const decode = (bytes, offset = 0) => {
      const r = bytes[offset] ?? 0;
      const g = bytes[offset + 1] ?? 0;
      const b = bytes[offset + 2] ?? 0;
      const a = bytes[offset + 3] ?? 0;
      return r + (g << 8) + (b << 16) + (a << 24) - 1;
    };

    const [nodePixelsRaw, edgePixelsRaw] = await Promise.all([
      helios.renderer.readPixels(nodeTarget, {
        x: 0,
        y: 0,
        width: nodeTarget.width,
        height: nodeTarget.height,
      }),
      helios.renderer.readPixels(edgeTarget, {
        x: 0,
        y: 0,
        width: edgeTarget.width,
        height: edgeTarget.height,
      }),
    ]);

    const nodePixels = nodePixelsRaw instanceof Uint8Array ? nodePixelsRaw : new Uint8Array(nodePixelsRaw);
    const edgePixels = edgePixelsRaw instanceof Uint8Array ? edgePixelsRaw : new Uint8Array(edgePixelsRaw);

    let hit = null;
    for (let y = 0; y < edgeTarget.height && !hit; y += 1) {
      for (let x = 0; x < edgeTarget.width; x += 1) {
        const offset = (y * edgeTarget.width + x) * 4;
        const edgeValue = decode(edgePixels, offset);
        const nodeValue = decode(nodePixels, offset);
        if (edgeValue >= 0 && nodeValue < 0) {
          hit = { x, y, value: edgeValue };
          break;
        }
      }
    }
    if (!hit) return null;

    const size = helios.size ?? helios.renderer?.size ?? { width: 1, height: 1, devicePixelRatio: 1 };
    const pixelRatio = size.devicePixelRatio ?? 1;
    const scale = helios._picking?.options?.resolutionScale ?? 1;
    const isWebGL = helios.renderer?.device?.type === 'webgl2';

    return {
      index: hit.value,
      x: hit.x / (pixelRatio * scale),
      y: (isWebGL ? (edgeTarget.height - 1 - hit.y) : hit.y) / (pixelRatio * scale),
    };
  });
}

async function dispatchCanvasEvent(page, { type, x, y, shiftKey = false }) {
  await page.evaluate(({ type: eventType, x: canvasX, y: canvasY, shiftKey: useShift }) => {
    const canvas = document.querySelector('canvas.helios-layer-canvas3d, canvas');
    if (!canvas) throw new Error('Canvas not found');
    const rect = canvas.getBoundingClientRect();
    const clientX = rect.left + canvasX;
    const clientY = rect.top + canvasY;
    if (eventType === 'pointermove') {
      canvas.dispatchEvent(new PointerEvent('pointermove', {
        clientX,
        clientY,
        bubbles: true,
        shiftKey: useShift,
      }));
      return;
    }
    canvas.dispatchEvent(new MouseEvent(eventType, {
      clientX,
      clientY,
      bubbles: true,
      button: 0,
      shiftKey: useShift,
    }));
  }, { type, x, y, shiftKey });
}

async function countSelected(page, scope) {
  return page.evaluate((kind) => {
    const helios = window.__helios;
    const stateMask = Number(helios.constructor.STATES.SELECTED) >>> 0;
    return helios.network.withBufferAccess(() => {
      const view = kind === 'node'
        ? helios.network.getNodeAttributeBuffer('_helios_visuals_state').view
        : helios.network.getEdgeAttributeBuffer('_helios_visuals_edge_state').view;
      let count = 0;
      for (let i = 0; i < view.length; i += 1) {
        if (((Number(view[i]) >>> 0) & stateMask) !== 0) count += 1;
      }
      return count;
    });
  }, scope);
}

async function countStateBit(page, scope, stateName) {
  return page.evaluate(({ kind, maskName }) => {
    const helios = window.__helios;
    const stateMask = Number(helios.constructor.STATES[maskName]) >>> 0;
    return helios.network.withBufferAccess(() => {
      const view = kind === 'node'
        ? helios.network.getNodeAttributeBuffer('_helios_visuals_state').view
        : helios.network.getEdgeAttributeBuffer('_helios_visuals_edge_state').view;
      let count = 0;
      for (let i = 0; i < view.length; i += 1) {
        if (((Number(view[i]) >>> 0) & stateMask) !== 0) count += 1;
      }
      return count;
    });
  }, { kind: scope, maskName: stateName });
}

async function countNodePickPixels(page, nodeIndex) {
  return page.evaluate(async (targetIndex) => {
    const helios = window.__helios;
    await helios._ensureIndexPickingTargets?.();
    const target = helios.indexPickingTracker?.lastTargets?.node;
    if (!target || !helios.renderer?.readPixels) return 0;

    const decode = (bytes, offset = 0) => {
      const r = bytes[offset] ?? 0;
      const g = bytes[offset + 1] ?? 0;
      const b = bytes[offset + 2] ?? 0;
      const a = bytes[offset + 3] ?? 0;
      return r + (g << 8) + (b << 16) + (a << 24) - 1;
    };

    const raw = await helios.renderer.readPixels(target, {
      x: 0,
      y: 0,
      width: target.width,
      height: target.height,
    });
    const pixels = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    let count = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (decode(pixels, offset) === targetIndex) count += 1;
    }
    return count;
  }, nodeIndex);
}

function subpanelForHeader(header) {
  return header.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " helios-ui-subpanel ")][1]');
}

test.describe('basic example selection panel', () => {
  test('specializes node picking down to click-only when all node-hover features are disabled', async ({ page }) => {
    await waitForExample(page);

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-selection"]').first();
    await expect(panel).toBeVisible();

    const nodeHoverToggle = panel.locator('[role="switch"][aria-label="Node hover highlight"]').first();
    const hoverLabelToggle = panel.locator('[role="switch"][aria-label="Hover label"]').first();
    const hoverConnectedEdgesToggle = panel.locator('[role="switch"][aria-label="Connected edges on hover"]').first();

    await nodeHoverToggle.click();
    await hoverLabelToggle.click();
    await hoverConnectedEdgesToggle.click();

    await expect.poll(async () => page.evaluate(() => ({
      nodeClick: window.__heliosSelectionPanel?.selectionState?.nodeClick ?? null,
      nodeHover: window.__heliosSelectionPanel?.selectionState?.nodeHover ?? null,
      hoverLabel: window.__heliosSelectionPanel?.selectionState?.hoverLabel ?? null,
      hoverConnectedEdges: window.__heliosSelectionPanel?.selectionState?.hoverConnectedEdges ?? null,
      nodeHoverEnabled: window.__helios?._picking?.node?.hoverEnabled ?? null,
      status: Array.from(document.querySelectorAll('.helios-ui-panel[data-panel-id="helios-ui-selection"] .helios-ui-row')).find((row) => {
        return row.querySelector('.helios-ui-label__title')?.textContent?.trim() === 'Status';
      })?.textContent?.replace(/\s+/g, ' ')?.trim() ?? null,
    }))).toEqual({
      nodeClick: true,
      nodeHover: false,
      hoverLabel: false,
      hoverConnectedEdges: false,
      nodeHoverEnabled: false,
      status: 'Status0 nodes selected • 0 edges selected',
    });

    const [nodeHit] = await findNodeHits(page, 1);
    expect(nodeHit).toBeTruthy();

    await dispatchCanvasEvent(page, { type: 'pointermove', x: nodeHit.x, y: nodeHit.y });

    await expect.poll(async () => page.evaluate(() => ({
      hoveredNode: window.__heliosSelectionPanel?.selectionState?.hoveredNode ?? -1,
      pickingHoverKind: window.__helios?._picking?.hover?.kind ?? null,
      pickingHoverIndex: window.__helios?._picking?.hover?.index ?? -1,
      status: Array.from(document.querySelectorAll('.helios-ui-panel[data-panel-id="helios-ui-selection"] .helios-ui-row')).find((row) => {
        return row.querySelector('.helios-ui-label__title')?.textContent?.trim() === 'Status';
      })?.textContent?.replace(/\s+/g, ' ')?.trim() ?? null,
    }))).toEqual({
      hoveredNode: -1,
      pickingHoverKind: null,
      pickingHoverIndex: -1,
      status: 'Status0 nodes selected • 0 edges selected',
    });
  });

  test('ships the expected selection defaults and distinct state styles', async ({ page }) => {
    await waitForExample(page);

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-selection"]').first();
    await expect(panel).toBeVisible();

    await expect.poll(async () => page.evaluate(() => ({
      hoverLabel: window.__heliosSelectionPanel?.selectionState?.hoverLabel ?? null,
      hoverLabelSource: window.__heliosSelectionPanel?.selectionState?.hoverLabelSource ?? null,
      nodeClick: window.__heliosSelectionPanel?.selectionState?.nodeClick ?? null,
      nodeHover: window.__heliosSelectionPanel?.selectionState?.nodeHover ?? null,
      edgeClick: window.__heliosSelectionPanel?.selectionState?.edgeClick ?? null,
      edgeHover: window.__heliosSelectionPanel?.selectionState?.edgeHover ?? null,
      hoverConnectedEdges: window.__heliosSelectionPanel?.selectionState?.hoverConnectedEdges ?? null,
      selectedConnectedEdges: window.__heliosSelectionPanel?.selectionState?.selectedConnectedEdges ?? null,
      otherSelectedNodeTone: window.__heliosSelectionPanel?.selectionState?.otherSelectedNodeTone ?? null,
      nodeNoStateEnabled: window.__helios.renderer?.graphLayer?.nodeNoStateStyleEnabled ?? null,
      edgeNoStateEnabled: window.__helios.renderer?.graphLayer?.edgeNoStateStyleEnabled ?? null,
      propagateHoveredNodeToEdges: window.__helios.renderer?.graphLayer?.propagateHoveredNodeToEdges ?? null,
      propagateSelectedNodesToEdges: window.__helios.renderer?.graphLayer?.propagateSelectedNodesToEdges ?? null,
      status: Array.from(document.querySelectorAll('.helios-ui-panel[data-panel-id="helios-ui-selection"] .helios-ui-row')).find((row) => {
        return row.querySelector('.helios-ui-label__title')?.textContent?.trim() === 'Status';
      })?.textContent?.replace(/\s+/g, ' ')?.trim() ?? null,
    }))).toEqual({
      hoverLabel: true,
      hoverLabelSource: 'auto',
      nodeClick: true,
      nodeHover: true,
      edgeClick: false,
      edgeHover: false,
      hoverConnectedEdges: true,
      selectedConnectedEdges: true,
      otherSelectedNodeTone: { enabled: true, amount: 0.38 },
      nodeNoStateEnabled: false,
      edgeNoStateEnabled: false,
      propagateHoveredNodeToEdges: true,
      propagateSelectedNodesToEdges: true,
      status: 'Status0 nodes selected • 0 edges selected',
    });

    const styles = await page.evaluate(() => ({
      selectedNode: window.__helios.nodeStateStyle?.('SELECTED'),
      highlightedNode: window.__helios.nodeStateStyle?.('HIGHLIGHTED'),
      selectedEdge: window.__helios.edgeStateStyle?.('SELECTED'),
      highlightedEdge: window.__helios.edgeStateStyle?.('HIGHLIGHTED'),
    }));
    expect(styles.selectedNode.forceMaxAlpha).toBe(true);
    expect(styles.highlightedNode.forceMaxAlpha).toBe(false);
    expect(styles.selectedEdge.forceMaxAlpha).toBe(true);
    expect(styles.highlightedEdge.forceMaxAlpha).toBe(false);
    expect(styles.selectedNode.sizeMul).toBeGreaterThan(styles.highlightedNode.sizeMul);
    expect(styles.selectedNode.outlineMul).toBeGreaterThan(styles.highlightedNode.outlineMul);
    expect(styles.selectedEdge.widthMul).toBeGreaterThan(styles.highlightedEdge.widthMul);
    expect(styles.selectedNode.sizeMul).toBeCloseTo(1.55, 1);
    expect(styles.highlightedNode.sizeMul).toBeCloseTo(1.42, 1);
    expect(styles.selectedEdge.widthMul).toBeCloseTo(1.5, 1);
    expect(styles.highlightedEdge.widthMul).toBeCloseTo(1.25, 1);

    const selectedHeader = panel.locator('button.helios-ui-subpanel__header', { hasText: 'Selected Style' });
    const selectedSubpanel = subpanelForHeader(selectedHeader);
    const selectedSizeRow = selectedSubpanel.locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Node Size"))').first();
    const selectedSizeInput = selectedSizeRow.locator('input[type="number"]').first();
    await selectedSizeInput.fill('2.1');
    await selectedSizeInput.dispatchEvent('change');

    await expect.poll(async () => page.evaluate(() => window.__helios.nodeStateStyle?.('SELECTED')?.sizeMul ?? null)).toBeCloseTo(2.1, 1);

    const nodeHitsRaw = await findNodeHits(page, 12);
    expect(nodeHitsRaw.length).toBeGreaterThanOrEqual(2);
    let nodeHits = nodeHitsRaw.slice(0, 2);
    for (let i = 0; i < nodeHitsRaw.length; i += 1) {
      for (let j = i + 1; j < nodeHitsRaw.length; j += 1) {
        const dx = nodeHitsRaw[i].x - nodeHitsRaw[j].x;
        const dy = nodeHitsRaw[i].y - nodeHitsRaw[j].y;
        if (Math.hypot(dx, dy) >= 32) {
          nodeHits = [nodeHitsRaw[i], nodeHitsRaw[j]];
          i = nodeHitsRaw.length;
          break;
        }
      }
    }
    const pickPixelsBefore = await countNodePickPixels(page, nodeHits[0].index);

    await dispatchCanvasEvent(page, { type: 'click', x: nodeHits[0].x, y: nodeHits[0].y });
    await expect.poll(async () => countSelected(page, 'node')).toBe(1);
    await expect.poll(async () => page.evaluate(() => window.__helios.renderer?.graphLayer?.nodeNoStateStyleEnabled ?? null)).toBe(true);
    await expect.poll(async () => countNodePickPixels(page, nodeHits[0].index)).toBeGreaterThan(pickPixelsBefore);

    const secondNodeHits = await findNodeHits(page, 16);
    const secondNode = secondNodeHits.find((entry) => entry.index !== nodeHits[0].index) ?? nodeHits[1];
    await dispatchCanvasEvent(page, { type: 'click', x: secondNode.x, y: secondNode.y, shiftKey: true });
    await expect.poll(async () => countSelected(page, 'node')).toBe(2);
    await dispatchCanvasEvent(page, { type: 'pointermove', x: nodeHits[0].x, y: nodeHits[0].y });
    await expect.poll(async () => page.evaluate(() => window.__heliosSelectionPanel?.selectionState?.hoveredNode ?? -1)).toBe(nodeHits[0].index);

    await expect.poll(async () => page.evaluate(() => {
      const config = window.__helios.labels?.() ?? null;
      return {
        enabled: config?.enabled ?? false,
        maxVisible: config?.maxVisible ?? null,
      };
    })).toEqual({
      enabled: true,
      maxVisible: 1,
    });

    const edgeClickToggle = panel.locator('[role="switch"][aria-label="Edge click selection"]').first();
    const edgeHoverToggle = panel.locator('[role="switch"][aria-label="Edge hover highlight"]').first();
    await edgeClickToggle.click();
    await edgeHoverToggle.click();

    await expect.poll(async () => page.evaluate(() => ({
      edgeClick: window.__heliosSelectionPanel?.selectionState?.edgeClick ?? false,
      edgeHover: window.__heliosSelectionPanel?.selectionState?.edgeHover ?? false,
      edgePicking: window.__helios?._picking?.edge?.enabled ?? false,
    }))).toEqual({
      edgeClick: true,
      edgeHover: true,
      edgePicking: true,
    });

    const edgeHit = await findEdgeOnlyHit(page);
    expect(edgeHit).toBeTruthy();

    await dispatchCanvasEvent(page, { type: 'pointermove', x: edgeHit.x, y: edgeHit.y });
    await expect.poll(async () => page.evaluate(() => window.__heliosSelectionPanel?.selectionState?.hoveredEdge ?? -1)).toBe(edgeHit.index);

    await dispatchCanvasEvent(page, { type: 'click', x: edgeHit.x, y: edgeHit.y });
    await expect.poll(async () => countSelected(page, 'edge')).toBe(1);
  });

  test('gates normal-state styling and keeps connected-edge propagation shader-only', async ({ page }) => {
    await waitForExample(page);

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-selection"]').first();
    await expect(panel).toBeVisible();

    const nodeHits = await findNodeHits(page, 1);
    expect(nodeHits.length).toBe(1);

    const highlightedEdgesBefore = await countStateBit(page, 'edge', 'HIGHLIGHTED');
    await dispatchCanvasEvent(page, { type: 'pointermove', x: nodeHits[0].x, y: nodeHits[0].y });
    await expect.poll(async () => page.evaluate(() => ({
      hoveredNode: window.__heliosSelectionPanel?.selectionState?.hoveredNode ?? -1,
      propagateHoveredNodeToEdges: window.__helios.renderer?.graphLayer?.propagateHoveredNodeToEdges ?? null,
      propagateSelectedNodesToEdges: window.__helios.renderer?.graphLayer?.propagateSelectedNodesToEdges ?? null,
      nodeNoStateEnabled: window.__helios.renderer?.graphLayer?.nodeNoStateStyleEnabled ?? null,
      edgeNoStateEnabled: window.__helios.renderer?.graphLayer?.edgeNoStateStyleEnabled ?? null,
      highlightedEdges: window.__helios.network.withBufferAccess(() => {
        const view = window.__helios.network.getEdgeAttributeBuffer('_helios_visuals_edge_state').view;
        const mask = Number(window.__helios.constructor.STATES.HIGHLIGHTED) >>> 0;
        let count = 0;
        for (let i = 0; i < view.length; i += 1) {
          if (((Number(view[i]) >>> 0) & mask) !== 0) count += 1;
        }
        return count;
      }),
    }))).toEqual({
      hoveredNode: nodeHits[0].index,
      propagateHoveredNodeToEdges: true,
      propagateSelectedNodesToEdges: true,
      nodeNoStateEnabled: true,
      edgeNoStateEnabled: true,
      highlightedEdges: highlightedEdgesBefore,
    });

    const hoverConnectedEdgesToggle = panel.locator('[role="switch"][aria-label="Connected edges on hover"]').first();
    await hoverConnectedEdgesToggle.click();

    await expect.poll(async () => page.evaluate(() => ({
      propagateHoveredNodeToEdges: window.__helios.renderer?.graphLayer?.propagateHoveredNodeToEdges ?? null,
      highlightedEdges: window.__helios.network.withBufferAccess(() => {
        const view = window.__helios.network.getEdgeAttributeBuffer('_helios_visuals_edge_state').view;
        const mask = Number(window.__helios.constructor.STATES.HIGHLIGHTED) >>> 0;
        let count = 0;
        for (let i = 0; i < view.length; i += 1) {
          if (((Number(view[i]) >>> 0) & mask) !== 0) count += 1;
        }
        return count;
      }),
    }))).toEqual({
      propagateHoveredNodeToEdges: false,
      highlightedEdges: highlightedEdgesBefore,
    });

    const selectedConnectedEdgesToggle = panel.locator('[role="switch"][aria-label="Connected edges on selection"]').first();
    await dispatchCanvasEvent(page, { type: 'click', x: nodeHits[0].x, y: nodeHits[0].y });
    await expect.poll(async () => page.evaluate(() => window.__helios.renderer?.graphLayer?.propagateSelectedNodesToEdges ?? null)).toBe(true);
    await selectedConnectedEdgesToggle.click();
    await expect.poll(async () => page.evaluate(() => window.__helios.renderer?.graphLayer?.propagateSelectedNodesToEdges ?? null)).toBe(false);
    await dispatchCanvasEvent(page, { type: 'click', x: 0, y: 0 });

    await dispatchCanvasEvent(page, { type: 'pointermove', x: 0, y: 0 });
    await expect.poll(async () => page.evaluate(() => ({
      hoveredNode: window.__heliosSelectionPanel?.selectionState?.hoveredNode ?? -1,
      nodeNoStateEnabled: window.__helios.renderer?.graphLayer?.nodeNoStateStyleEnabled ?? null,
      edgeNoStateEnabled: window.__helios.renderer?.graphLayer?.edgeNoStateStyleEnabled ?? null,
    }))).toEqual({
      hoveredNode: -1,
      nodeNoStateEnabled: false,
      edgeNoStateEnabled: false,
    });

    const edgeClickToggle = panel.locator('[role="switch"][aria-label="Edge click selection"]').first();
    const edgeHoverToggle = panel.locator('[role="switch"][aria-label="Edge hover highlight"]').first();
    await edgeClickToggle.click();
    await edgeHoverToggle.click();

    const edgeHit = await findEdgeOnlyHit(page);
    expect(edgeHit).toBeTruthy();
    await dispatchCanvasEvent(page, { type: 'pointermove', x: edgeHit.x, y: edgeHit.y });
    await dispatchCanvasEvent(page, { type: 'click', x: edgeHit.x, y: edgeHit.y });

    await expect.poll(async () => countSelected(page, 'edge')).toBe(1);
    await expect.poll(async () => page.evaluate(() => ({
      nodeNoStateEnabled: window.__helios.renderer?.graphLayer?.nodeNoStateStyleEnabled ?? null,
      edgeNoStateEnabled: window.__helios.renderer?.graphLayer?.edgeNoStateStyleEnabled ?? null,
    }))).toEqual({
      nodeNoStateEnabled: true,
      edgeNoStateEnabled: true,
    });
  });
});
