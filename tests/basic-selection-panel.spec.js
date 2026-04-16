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

async function ensureSectionExpanded(panel, title) {
  const header = panel.locator('button.helios-ui-subpanel__header', { hasText: title }).first();
  const subpanel = subpanelForHeader(header);
  if ((await subpanel.getAttribute('data-collapsed')) === 'true') {
    await header.click();
  }
  await expect(subpanel).toHaveAttribute('data-collapsed', 'false');
}

test.describe('basic example selection panel', () => {
  test('specializes node picking down to click-only when all node-hover features are disabled', async ({ page }) => {
    await waitForExample(page);

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-selection"]').first();
    await expect(panel).toBeVisible();
    await ensureSectionExpanded(panel, 'Style');
    await ensureSectionExpanded(panel, 'Interaction');

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
      status: document
        .querySelector('.helios-ui-panel[data-panel-id="helios-ui-selection"] .helios-ui-selection__status')
        ?.innerText
        ?.replace(/\s+/g, ' ')
        ?.trim() ?? null,
    }))).toEqual({
      nodeClick: true,
      nodeHover: false,
      hoverLabel: false,
      hoverConnectedEdges: false,
      nodeHoverEnabled: false,
      status: 'Status: 0 nodes 0 edges',
    });

    const [nodeHit] = await findNodeHits(page, 1);
    expect(nodeHit).toBeTruthy();

    await dispatchCanvasEvent(page, { type: 'pointermove', x: nodeHit.x, y: nodeHit.y });

    await expect.poll(async () => page.evaluate(() => ({
      hoveredNode: window.__heliosSelectionPanel?.selectionState?.hoveredNode ?? -1,
      pickingHoverKind: window.__helios?._picking?.hover?.kind ?? null,
      pickingHoverIndex: window.__helios?._picking?.hover?.index ?? -1,
      status: document
        .querySelector('.helios-ui-panel[data-panel-id="helios-ui-selection"] .helios-ui-selection__status')
        ?.innerText
        ?.replace(/\s+/g, ' ')
        ?.trim() ?? null,
    }))).toEqual({
      hoveredNode: -1,
      pickingHoverKind: null,
      pickingHoverIndex: -1,
      status: 'Status: 0 nodes 0 edges',
    });
  });

  test('ships the expected selection defaults and distinct state styles', async ({ page }) => {
    await waitForExample(page);

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-selection"]').first();
    await expect(panel).toBeVisible();

    await expect(subpanelForHeader(panel.locator('button.helios-ui-subpanel__header', { hasText: 'Selectors' }).first())).toHaveAttribute('data-collapsed', 'true');
    await expect(subpanelForHeader(panel.locator('button.helios-ui-subpanel__header', { hasText: 'Style' }).first())).toHaveAttribute('data-collapsed', 'true');
    await expect(subpanelForHeader(panel.locator('button.helios-ui-subpanel__header', { hasText: 'Interaction' }).first())).toHaveAttribute('data-collapsed', 'true');
    await expect(subpanelForHeader(panel.locator('button.helios-ui-subpanel__header', { hasText: 'Selected' }).first())).toHaveAttribute('data-collapsed', 'true');
    await expect(subpanelForHeader(panel.locator('button.helios-ui-subpanel__header', { hasText: 'Highlight' }).first())).toHaveAttribute('data-collapsed', 'true');
    await expect(subpanelForHeader(panel.locator('button.helios-ui-subpanel__header', { hasText: 'Other Elements' }).first())).toHaveAttribute('data-collapsed', 'true');

    await expect.poll(async () => page.evaluate(() => ({
      hoverLabel: window.__heliosSelectionPanel?.selectionState?.hoverLabel ?? null,
      hoverLabelSource: window.__heliosSelectionPanel?.selectionState?.hoverLabelSource ?? null,
      nodeClick: window.__heliosSelectionPanel?.selectionState?.nodeClick ?? null,
      nodeHover: window.__heliosSelectionPanel?.selectionState?.nodeHover ?? null,
      edgeClick: window.__heliosSelectionPanel?.selectionState?.edgeClick ?? null,
      edgeHover: window.__heliosSelectionPanel?.selectionState?.edgeHover ?? null,
      hoverConnectedEdges: window.__heliosSelectionPanel?.selectionState?.hoverConnectedEdges ?? null,
      selectedConnectedEdges: window.__heliosSelectionPanel?.selectionState?.selectedConnectedEdges ?? null,
      labelsMode: window.__helios.labelsMode?.() ?? null,
      labelSelectionMode: window.__helios.labels?.()?.selectionMode ?? null,
      hoveredNodeLabels: window.__helios.labels?.()?.hoveredNodeEnabled ?? null,
      maxVisible: window.__helios.labels?.()?.maxVisible ?? null,
      otherSelectedNodeTone: window.__heliosSelectionPanel?.selectionState?.otherSelectedNodeTone ?? null,
      otherSelectedNodeStyle: window.__heliosSelectionPanel?.selectionState?.otherSelectedNodeStyle ?? null,
      otherSelectedEdgeStyle: window.__heliosSelectionPanel?.selectionState?.otherSelectedEdgeStyle ?? null,
      otherHighlightNodeStyle: window.__heliosSelectionPanel?.selectionState?.otherHighlightNodeStyle ?? null,
      otherHighlightEdgeStyle: window.__heliosSelectionPanel?.selectionState?.otherHighlightEdgeStyle ?? null,
      nodeNoStateEnabled: window.__helios.renderer?.graphLayer?.nodeNoStateStyleEnabled ?? null,
      edgeNoStateEnabled: window.__helios.renderer?.graphLayer?.edgeNoStateStyleEnabled ?? null,
      propagateHoveredNodeToEdges: window.__helios.renderer?.graphLayer?.propagateHoveredNodeToEdges ?? null,
      propagateSelectedNodesToEdges: window.__helios.renderer?.graphLayer?.propagateSelectedNodesToEdges ?? null,
      status: document
        .querySelector('.helios-ui-panel[data-panel-id="helios-ui-selection"] .helios-ui-selection__status')
        ?.innerText
        ?.replace(/\s+/g, ' ')
        ?.trim() ?? null,
    }))).toEqual({
      hoverLabel: true,
      hoverLabelSource: 'auto',
      nodeClick: true,
      nodeHover: true,
      edgeClick: false,
      edgeHover: false,
      hoverConnectedEdges: true,
      selectedConnectedEdges: true,
      labelsMode: 'selected-only',
      labelSelectionMode: 'selected-only',
      hoveredNodeLabels: true,
      maxVisible: 120,
      otherSelectedNodeTone: { enabled: true, amount: 0.38 },
      otherSelectedNodeStyle: {
        sizeMul: 0.9,
        opacityMul: 1,
        outlineMul: 0.72,
        discard: false,
        forceMaxAlpha: false,
        colorMul: [1, 1, 1, 1],
        colorAdd: [0, 0, 0, 0],
      },
      otherSelectedEdgeStyle: {
        widthMul: 0.84,
        opacityMul: 0.82,
        discard: false,
        forceMaxAlpha: false,
        colorMul: [1, 1, 1, 1],
        colorAdd: [0, 0, 0, 0],
      },
      otherHighlightNodeStyle: {
        sizeMul: 1,
        opacityMul: 1,
        outlineMul: 1,
        discard: false,
        forceMaxAlpha: false,
        colorMul: [1, 1, 1, 1],
        colorAdd: [0, 0, 0, 0],
      },
      otherHighlightEdgeStyle: {
        widthMul: 1,
        opacityMul: 1,
        discard: false,
        forceMaxAlpha: false,
        colorMul: [1, 1, 1, 1],
        colorAdd: [0, 0, 0, 0],
      },
      nodeNoStateEnabled: false,
      edgeNoStateEnabled: false,
      propagateHoveredNodeToEdges: true,
      propagateSelectedNodesToEdges: true,
      status: 'Status: 0 nodes 0 edges',
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
    expect(styles.selectedNode.sizeMul).toBeCloseTo(2, 3);
    expect(styles.selectedNode.outlineMul).toBeCloseTo(2, 3);
    expect(styles.highlightedNode.sizeMul).toBeCloseTo(1.5, 3);
    expect(styles.highlightedNode.outlineMul).toBeCloseTo(1.25, 3);
    expect(styles.selectedEdge.widthMul).toBeCloseTo(1.5, 1);
    expect(styles.highlightedEdge.opacityMul).toBeCloseTo(50, 3);
    expect(styles.highlightedEdge.widthMul).toBeCloseTo(1.25, 1);

    await ensureSectionExpanded(panel, 'Style');
    await ensureSectionExpanded(panel, 'Selected');
    await ensureSectionExpanded(panel, 'Interaction');

    const selectedHeader = panel.locator('button.helios-ui-subpanel__header', { hasText: 'Selected' });
    const selectedSubpanel = subpanelForHeader(selectedHeader);
    const selectedSizeRow = selectedSubpanel.locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Size"))').first();
    const selectedSizeInput = selectedSizeRow.locator('input[type="number"]').first();
    await selectedSizeInput.fill('2.1');
    await selectedSizeInput.dispatchEvent('change');

    await expect.poll(async () => page.evaluate(() => window.__helios.nodeStateStyle?.('SELECTED')?.sizeMul ?? null)).toBeCloseTo(2.1, 1);

    const selectedEdgeOpacityRow = selectedSubpanel.locator('.helios-ui-row:has(.helios-ui-label__title:has-text("Opacity Gain"))').nth(1);
    await expect(selectedEdgeOpacityRow).toBeVisible();
    const selectedEdgeOpacityInput = selectedEdgeOpacityRow.locator('input[type="number"]').first();
    const selectedEdgeOpacitySlider = selectedEdgeOpacityRow.locator('input[type="range"]').first();
    await expect(selectedEdgeOpacityInput).not.toHaveAttribute('max', /.+/);
    await expect(selectedEdgeOpacitySlider).toHaveAttribute('max', '5');
    await selectedEdgeOpacityInput.fill('1000');
    await selectedEdgeOpacityInput.dispatchEvent('change');

    await expect.poll(async () => page.evaluate(() => window.__helios.edgeStateStyle?.('SELECTED')?.opacityMul ?? null)).toBe(1000);

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
        hoveredNodeEnabled: config?.hoveredNodeEnabled ?? false,
        maxVisible: config?.maxVisible ?? null,
      };
    })).toEqual({
      enabled: true,
      hoveredNodeEnabled: true,
      maxVisible: 120,
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

  test('supports selection actions with reusable selector rules and neighbor expansion', async ({ page }) => {
    await waitForExample(page);

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-selection"]').first();
    await expect(panel).toBeVisible();
    const selectorsHeader = panel.locator('button.helios-ui-subpanel__header', { hasText: 'Selectors' }).first();
    const actionsPanel = subpanelForHeader(selectorsHeader);
    await expect(selectorsHeader).toBeDisabled();
    await expect(actionsPanel).toHaveAttribute('data-collapsed', 'true');

    const addSelector = panel.locator('.helios-ui-subpanel__header-controls select').first();
    await addSelector.selectOption('label');
    await expect(selectorsHeader).not.toBeDisabled();
    await expect(actionsPanel).toHaveAttribute('data-collapsed', 'false');

    const stringOperator = actionsPanel.locator('select').nth(1);
    await stringOperator.selectOption('starts_with');
    await actionsPanel.locator('input[type="text"]').first().fill('node-1');
    await actionsPanel.getByRole('button', { name: 'Replace node selection with selector matches' }).click();

    await expect.poll(async () => countSelected(page, 'node')).toBeGreaterThan(0);
    const selectedAfterReplace = await countSelected(page, 'node');

    await panel.getByRole('button', { name: 'Center on selection' }).click();

    await panel.getByRole('button', { name: 'Expand selection to neighbors' }).click();
    await expect.poll(async () => countSelected(page, 'node')).toBeGreaterThanOrEqual(selectedAfterReplace);

    await panel.getByRole('button', { name: 'Clear selection' }).click();
    await expect.poll(async () => countSelected(page, 'node')).toBe(0);
  });

  test('saves and restores selections through boolean attributes', async ({ page }) => {
    await waitForExample(page);

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-selection"]').first();
    await expect(panel).toBeVisible();

    const [nodeHit] = await findNodeHits(page, 1);
    expect(nodeHit).toBeTruthy();

    await dispatchCanvasEvent(page, { type: 'click', x: nodeHit.x, y: nodeHit.y });
    await expect.poll(async () => countSelected(page, 'node')).toBe(1);

    await panel.getByRole('button', { name: 'Save selection' }).click();
    const dialog = page.locator('dialog.helios-ui-dialog').first();
    await expect(dialog).toHaveAttribute('open', '');
    await dialog.getByRole('textbox', { name: 'Selection attribute name' }).fill('saved_selection');
    await dialog.getByRole('button', { name: 'Confirm save selection' }).click();

    await expect.poll(async () => page.evaluate(() => ({
      savedSelectionAttribute: window.__heliosSelectionPanel?.selectionState?.savedSelectionAttribute ?? '',
      nodeAttributeDefined: Boolean(window.__helios.network.getNodeAttributeInfo?.('saved_selection')),
      edgeAttributeDefined: Boolean(window.__helios.network.getEdgeAttributeInfo?.('saved_selection')),
    }))).toEqual({
      savedSelectionAttribute: 'saved_selection',
      nodeAttributeDefined: true,
      edgeAttributeDefined: true,
    });

    await panel.getByRole('button', { name: 'Clear selection' }).click();
    await expect.poll(async () => countSelected(page, 'node')).toBe(0);
    await expect.poll(async () => page.evaluate(() => window.__heliosSelectionPanel?.selectionState?.savedSelectionAttribute ?? '')).toBe('__current_selection__');

    await panel.locator('select[aria-label="Saved selection attribute"]').selectOption('saved_selection');
    await expect.poll(async () => countSelected(page, 'node')).toBe(1);
    await expect.poll(async () => page.evaluate(() => {
      return window.__helios.network.withBufferAccess(() => {
        const ids = window.__helios.network.nodeIndices ?? [];
        const view = window.__helios.network.getNodeAttributeBuffer('saved_selection').view;
        let count = 0;
        for (let index = 0; index < ids.length; index += 1) {
          if (view[ids[index]]) count += 1;
        }
        return count;
      }, { nodeIndices: true });
    })).toBe(1);
  });

  test('refreshes other-elements auto color when the background changes', async ({ page }) => {
    await waitForExample(page);

    const [nodeHit] = await findNodeHits(page, 1);
    expect(nodeHit).toBeTruthy();

    await dispatchCanvasEvent(page, { type: 'click', x: nodeHit.x, y: nodeHit.y });
    await expect.poll(async () => countSelected(page, 'node')).toBe(1);

    await page.evaluate(() => {
      window.__helios.background([1, 1, 1, 1]);
    });

    await expect.poll(async () => page.evaluate(() => window.__helios.nodeNoStateStyle?.()?.colorAdd?.[0] ?? 0)).toBeGreaterThan(0);
    const before = await page.evaluate(() => window.__helios.nodeNoStateStyle?.() ?? null);
    expect(before).toBeTruthy();
    expect(before.colorAdd?.[0] ?? 0).toBeGreaterThan(0);

    await page.evaluate(() => {
      window.__helios.background([0.08, 0.1, 0.12, 1]);
    });

    await expect.poll(async () => page.evaluate(() => window.__helios.nodeNoStateStyle?.() ?? null)).toMatchObject({
      colorAdd: [0, 0, 0, 0],
    });

    const after = await page.evaluate(() => window.__helios.nodeNoStateStyle?.() ?? null);
    expect(after.colorMul?.[0] ?? 1).toBeLessThan(1);
    expect(after.colorMul?.[1] ?? 1).toBeLessThan(1);
    expect(after.colorMul?.[2] ?? 1).toBeLessThan(1);
  });

  test('gates normal-state styling and keeps connected-edge propagation shader-only', async ({ page }) => {
    await waitForExample(page);

    const panel = page.locator('.helios-ui-panel[data-panel-id="helios-ui-selection"]').first();
    await expect(panel).toBeVisible();
    await ensureSectionExpanded(panel, 'Style');
    await ensureSectionExpanded(panel, 'Interaction');

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
