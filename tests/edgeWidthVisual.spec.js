import { test, expect } from '@playwright/test';

test('edges render with correct relative widths', async ({ page }, testInfo) => {
  await page.goto('/tests/fixtures/blank.html');
  await page.setViewportSize({ width: 400, height: 300 });

  await page.evaluate(async () => {
    if (window.__helios) {
      window.__helios.destroy();
    }
    document.body.innerHTML = '<div id="app" style="width:400px;height:300px;"></div>';
    const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
    const { helios } = await createDeterministicHelios(document.getElementById('app'), 'webgl');
    const network = helios.network;
    let edges = [];
    network.withBufferAccess(() => {
      edges = Array.from(network.edgeIndices ?? []).slice(0, 2);
      if (edges.length < 2) {
        throw new Error(`Expected deterministic fixture to expose 2 edges, received ${edges.length}`);
      }
      const positions = network.getNodeAttributeBuffer('_helios_visuals_position')?.view;
      const colors = network.getEdgeAttributeBuffer('_helios_visuals_edge_color')?.view;
      const widths = network.getEdgeAttributeBuffer('_helios_visuals_edge_width')?.view;
      const opacities = network.getEdgeAttributeBuffer('_helios_visuals_edge_opacity')?.view;
      if (!positions || !colors || !widths || !opacities) {
        throw new Error('Buffers unavailable for position/color/width/opacity');
      }
      // Center the nodes around the origin so the default camera sees both edges.
      const placements = [
        [-80, -40, 0],
        [80, -40, 0],
        [-80, 40, 0],
        [80, 40, 0],
      ];
      placements.forEach(([x, y, z], idx) => {
        const base = idx * 3;
        positions[base] = x;
        positions[base + 1] = y;
        positions[base + 2] = z;
      });
      const writeColor = (edgeId, rgba) => {
        const offset = edgeId * 8;
        colors.set(rgba, offset);
        colors.set(rgba, offset + 4);
      };
      const writeWidth = (edgeId, value) => {
        const offset = edgeId * 2;
        widths[offset] = value;
        widths[offset + 1] = value;
      };
      writeColor(edges[0], [0, 0.25, 1, 1]);
      writeWidth(edges[0], 1);
      writeColor(edges[1], [0, 0, 0, 0]);
      writeWidth(edges[1], 1);
      opacities.set([1, 1], edges[0] * 2);
      opacities.set([0, 0], edges[1] * 2);
      window.__edgeColorSample = {
        edge0: Array.from(colors.slice(edges[0] * 8, edges[0] * 8 + 8)),
        edge1: Array.from(colors.slice(edges[1] * 8, edges[1] * 8 + 8)),
        widths: Array.from(widths.slice(edges[0] * 2, edges[1] * 2 + 2)),
      };
    });
    if (!helios.renderer?.graphLayer) {
      throw new Error('Renderer graph layer unavailable');
    }
    helios.renderer.setEdgeRenderingMode?.('quad');
    helios.renderer.setEdgeTransparencyMode?.('alpha');
    helios.renderer.graphLayer.edgeWidthBase = 0;
    helios.renderer.graphLayer.edgeWidthScale = 1;
    helios.renderer.graphLayer.nodeOpacityBase = 0;
    helios.renderer.graphLayer.nodeOpacityScale = 0;
    helios.renderer.graphLayer.edgeOpacityBase = 0;
    helios.renderer.graphLayer.edgeOpacityScale = 1;
    helios.visuals.bumpEdgeAttributes(
      '_helios_visuals_edge_color',
      '_helios_visuals_edge_width',
      '_helios_visuals_edge_opacity',
    );
    helios.visuals.markPositionsDirty();
    helios.scheduler.requestGeometry();
    window.__helios = helios;
  });

  await page.waitForFunction(() => {
    const h = window.__helios;
    if (!h) return false;
    if (!h.renderer || typeof h.renderer.render !== 'function') throw new Error('Renderer unavailable');
    return true;
  }, { timeout: 5000 });
  await page.waitForTimeout(150);

  const measureBlueCoverage = async () => page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios) throw new Error('Helios instance missing');
    const renderer = helios.renderer;
    if (!renderer || typeof renderer.render !== 'function') throw new Error('Renderer missing');
    helios.scheduler?.requestRender?.();
    await new Promise((resolve) => {
      let attempts = 0;
      const waitFrame = () => {
        if (helios.scheduler?._needsRender === false || attempts > 10) {
          resolve();
          return;
        }
        attempts += 1;
        requestAnimationFrame(waitFrame);
      };
      requestAnimationFrame(waitFrame);
    });
    const { width, height } = renderer.size ?? { width: 0, height: 0 };
    const rect = { x: 0, y: 0, width, height };
    const data = await Promise.resolve(renderer.readPixels(null, rect));
    if (!data || !width || !height) return { width, height, hasData: !!data, blueCount: 0 };
    let blueCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (b > r + g + 10 && b > 40) blueCount += 1;
    }
    return { width, height, hasData: !!data, blueCount };
  });

  await page.evaluate(() => {
    const helios = window.__helios;
    const network = helios?.network;
    if (!helios || !network) throw new Error('Helios instance missing');
    network.withBufferAccess(() => {
      const edges = Array.from(network.edgeIndices ?? []).slice(0, 2);
      const widths = network.getEdgeAttributeBuffer('_helios_visuals_edge_width')?.view;
      if (!widths || edges.length < 1) throw new Error('Edge width buffer unavailable');
      widths[edges[0] * 2] = 1;
      widths[edges[0] * 2 + 1] = 1;
    });
    helios.visuals.bumpEdgeAttributes('_helios_visuals_edge_width');
    helios.scheduler.requestGeometry();
  });
  const narrowMetrics = await measureBlueCoverage();

  await page.evaluate(() => {
    const helios = window.__helios;
    const network = helios?.network;
    if (!helios || !network) throw new Error('Helios instance missing');
    network.withBufferAccess(() => {
      const edges = Array.from(network.edgeIndices ?? []).slice(0, 2);
      const widths = network.getEdgeAttributeBuffer('_helios_visuals_edge_width')?.view;
      if (!widths || edges.length < 1) throw new Error('Edge width buffer unavailable');
      widths[edges[0] * 2] = 10;
      widths[edges[0] * 2 + 1] = 10;
    });
    helios.visuals.bumpEdgeAttributes('_helios_visuals_edge_width');
    helios.scheduler.requestGeometry();
  });
  const wideMetrics = await measureBlueCoverage();

  await testInfo.attach('edge-width-metrics', {
    body: JSON.stringify({ narrow: narrowMetrics, wide: wideMetrics }, null, 2),
    contentType: 'application/json',
  });

  expect(narrowMetrics.hasData).toBeTruthy();
  expect(narrowMetrics.width).toBeGreaterThan(0);
  expect(narrowMetrics.height).toBeGreaterThan(0);
  expect(narrowMetrics.blueCount).toBeGreaterThan(0);
  expect(wideMetrics.blueCount).toBeGreaterThan(narrowMetrics.blueCount * 1.8);
});

test('supersampling does not change apparent edge width', async ({ page }, testInfo) => {
  await page.goto('/tests/fixtures/blank.html');
  await page.setViewportSize({ width: 400, height: 300 });

  await page.evaluate(async () => {
    if (window.__helios) {
      window.__helios.destroy();
    }
    document.body.innerHTML = '<div id="app" style="width:400px;height:300px;"></div>';
    const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
    const { helios } = await createDeterministicHelios(document.getElementById('app'), 'webgl');
    const network = helios.network;
    let edgeId = -1;
    let secondaryEdgeId = -1;
    network.withBufferAccess(() => {
      const edges = Array.from(network.edgeIndices ?? []).slice(0, 2);
      if (edges.length < 1) {
        throw new Error(`Expected deterministic fixture to expose at least 1 edge, received ${edges.length}`);
      }
      edgeId = edges[0];
      secondaryEdgeId = edges[1] ?? -1;
      const positions = network.getNodeAttributeBuffer('_helios_visuals_position')?.view;
      const colors = network.getEdgeAttributeBuffer('_helios_visuals_edge_color')?.view;
      const widths = network.getEdgeAttributeBuffer('_helios_visuals_edge_width')?.view;
      const opacities = network.getEdgeAttributeBuffer('_helios_visuals_edge_opacity')?.view;
      if (!positions || !colors || !widths || !opacities) {
        throw new Error('Buffers unavailable for position/color/width/opacity');
      }
      positions.set([
        -90, 0, 0,
        90, 0, 0,
        -90, 80, 0,
        90, 80, 0,
      ]);
      colors.set([0, 0.35, 1, 1, 0, 0.35, 1, 1], edgeId * 8);
      widths.set([16, 16], edgeId * 2);
      opacities.set([1, 1], edgeId * 2);
      if (secondaryEdgeId >= 0) {
        colors.set([0, 0, 0, 0, 0, 0, 0, 0], secondaryEdgeId * 8);
        widths.set([1, 1], secondaryEdgeId * 2);
        opacities.set([0, 0], secondaryEdgeId * 2);
      }
    });
    helios.renderer.setEdgeRenderingMode?.('quad');
    helios.renderer.setEdgeTransparencyMode?.('alpha');
    helios.renderer.graphLayer.edgeWidthBase = 0;
    helios.renderer.graphLayer.edgeWidthScale = 1;
    helios.renderer.graphLayer.nodeOpacityBase = 0;
    helios.renderer.graphLayer.nodeOpacityScale = 0;
    helios.renderer.graphLayer.edgeOpacityBase = 0;
    helios.renderer.graphLayer.edgeOpacityScale = 1;
    helios.visuals.bumpEdgeAttributes(
      '_helios_visuals_edge_color',
      '_helios_visuals_edge_width',
      '_helios_visuals_edge_opacity',
    );
    helios.visuals.markPositionsDirty();
    helios.scheduler.requestGeometry();
    window.__helios = helios;
  });

  const readBlueCoverage = async () => page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios) throw new Error('Helios instance missing');
    helios.scheduler?.requestRender?.();
    await new Promise((resolve) => {
      let attempts = 0;
      const waitFrame = () => {
        if (helios.scheduler?._needsRender === false || attempts > 10) {
          resolve();
          return;
        }
        attempts += 1;
        requestAnimationFrame(waitFrame);
      };
      requestAnimationFrame(waitFrame);
    });
    const renderer = helios.renderer;
    const { width, height } = renderer.size ?? { width: 0, height: 0 };
    const data = await Promise.resolve(renderer.readPixels(null, { x: 0, y: 0, width, height }));
    let blueCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (b > r + g + 10 && b > 30) blueCount += 1;
    }
    return { blueCount, width, height };
  });

  await page.waitForTimeout(150);
  await page.evaluate(() => window.__helios.supersampling('off'));
  const offMetrics = await readBlueCoverage();

  await page.evaluate(() => window.__helios.supersampling('2x'));
  await page.waitForTimeout(150);
  const twoXMetrics = await readBlueCoverage();

  await testInfo.attach('edge-width-supersampling-metrics', {
    body: JSON.stringify({ off: offMetrics, twoX: twoXMetrics }, null, 2),
    contentType: 'application/json',
  });

  expect(offMetrics.width).toBeGreaterThan(0);
  expect(offMetrics.height).toBeGreaterThan(0);
  expect(offMetrics.blueCount).toBeGreaterThan(0);
  expect(twoXMetrics.blueCount).toBeGreaterThan(0);
  const ratio = twoXMetrics.blueCount / offMetrics.blueCount;
  expect(ratio).toBeGreaterThan(0.7);
  expect(ratio).toBeLessThan(1.2);
});
