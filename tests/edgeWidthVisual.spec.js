import { test, expect } from '@playwright/test';

test('edges render with correct relative widths', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.setViewportSize({ width: 400, height: 300 });

  const setup = await page.evaluate(async () => {
    if (window.__helios) {
      window.__helios.destroy();
    }
    document.body.innerHTML = '<div id="app" style="width:400px;height:300px;"></div>';
    const { createDeterministicHelios } = await import('/src/tests/deterministicNetwork.js');
    const { helios } = await createDeterministicHelios(document.getElementById('app'), 'webgl');
    const network = helios.network;
    const edges = network.addEdges([
      { from: 0, to: 1 },
      { from: 2, to: 3 },
    ]);
    network.withBufferAccess(() => {
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
      writeColor(edges[0], [1, 0, 0, 1]);
      writeWidth(edges[0], 1);
      writeColor(edges[1], [0, 0.25, 1, 1]);
      writeWidth(edges[1], 10);
      opacities.set([1, 1], edges[0] * 2);
      opacities.set([1, 1], edges[1] * 2);
      window.__edgeColorSample = {
        edge0: Array.from(colors.slice(edges[0] * 8, edges[0] * 8 + 8)),
        edge1: Array.from(colors.slice(edges[1] * 8, edges[1] * 8 + 8)),
        widths: Array.from(widths.slice(edges[0] * 2, edges[1] * 2 + 2)),
      };
    });
    if (!helios.renderer?.graphLayer) {
      throw new Error('Renderer graph layer unavailable');
    }
    helios.renderer.graphLayer.edgeWidthBase = 0;
    helios.renderer.graphLayer.edgeWidthScale = 1;
    helios.renderer.graphLayer.nodeOpacityBase = 0;
    helios.renderer.graphLayer.nodeOpacityScale = 0;
    helios.renderer.graphLayer.edgeOpacityBase = 0;
    helios.renderer.graphLayer.edgeOpacityScale = 1;
    helios.renderer.graphLayer.edgeRendering = 'quad';
    helios.visuals.markEdgeAttributesDirty(
      '_helios_visuals_edge_color',
      '_helios_visuals_edge_width',
      '_helios_visuals_edge_opacity',
    );
    helios.visuals.markPositionsDirty();
    helios.visuals.markAllDenseDirty();
    helios.scheduler.requestGeometry();
    window.__edgeIds = Array.from(edges);
    window.__helios = helios;
    return { edges: Array.from(edges), samples: window.__edgeColorSample };
  });

  await page.waitForFunction(() => {
    const h = window.__helios;
    if (!h) return false;
    if (!h.renderer || typeof h.renderer.render !== 'function') throw new Error('Renderer unavailable');
    return true;
  }, { timeout: 5000 });
  await page.waitForTimeout(150);

  const metrics = await page.evaluate(async () => {
    const helios = window.__helios;
    if (!helios) throw new Error('Helios instance missing');
    const renderer = helios.renderer;
    if (!renderer || typeof renderer.render !== 'function') throw new Error('Renderer missing');
    const frame = { network: helios.network, timestamp: performance.now(), camera: renderer.camera };
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    renderer.render(frame);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const { width, height } = renderer.size ?? { width: 0, height: 0 };
    const rect = { x: 0, y: 0, width, height };
    const data = await Promise.resolve(renderer.readPixels(null, rect));
    let denseEdgeCount = 0;
    helios.network.updateDenseEdgeIndexBuffer();
    helios.network.withBufferAccess(() => {
      denseEdgeCount = helios.network.getDenseEdgeIndexView()?.count ?? 0;
    });
    if (!data || !width || !height) {
      return {
        width,
        height,
        hasData: !!data,
        nonWhite: 0,
        redCount: 0,
        blueCount: 0,
        redMax: 0,
        blueMax: 0,
        edgeIds: window.__edgeIds ?? [],
        denseEdgeCount,
        samples: window.__edgeColorSample ?? null,
        dataLength: data ? data.length : 0,
      };
    }
    let redCount = 0;
    let blueCount = 0;
    let nonWhite = 0;
    let redMax = 0;
    let blueMax = 0;
    const dataLength = data.length;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r || g || b) nonWhite += 1;
      if (r > g + b + 10 && r > 20) redCount += 1;
      if (b > r + g + 10 && b > 40) blueCount += 1;
      redMax = Math.max(redMax, r);
      blueMax = Math.max(blueMax, b);
    }
    return {
      width,
      height,
      hasData: !!data,
      nonWhite,
      redCount,
      blueCount,
      redMax,
      blueMax,
      edgeIds: window.__edgeIds ?? [],
      denseEdgeCount,
      samples: window.__edgeColorSample ?? null,
      dataLength,
    };
  });

  await testInfo.attach('edge-width-metrics', {
    body: JSON.stringify({ ...metrics, edges: setup.edges, samples: setup.samples }, null, 2),
    contentType: 'application/json',
  });
  // eslint-disable-next-line no-console
  console.log('edge-width-metrics', metrics);

  expect(metrics.hasData).toBeTruthy();
  expect(metrics.width).toBeGreaterThan(0);
  expect(metrics.height).toBeGreaterThan(0);
  expect(metrics.nonWhite).toBeGreaterThan(0);
  expect(metrics.redCount).toBeGreaterThan(0);
  expect(metrics.blueCount).toBeGreaterThan(0);
  expect(metrics.blueCount).toBeGreaterThan(metrics.redCount * 1.4);
});
