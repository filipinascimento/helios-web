import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { test, expect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveModuleUrl(baseURL, absolutePath) {
  if (baseURL) {
    const root = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
    return new URL(`/@fs${absolutePath}`, root).href;
  }
  return pathToFileURL(absolutePath).href;
}

test('edges render with correct relative widths', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const heliosPath = resolveModuleUrl(baseURL, path.resolve(__dirname, '../src/index.js'));
  const networkPath = resolveModuleUrl(
    baseURL,
    path.resolve(__dirname, '../node_modules/helios-network/dist/helios-network.js'),
  );

  if (baseURL) {
    await page.goto(baseURL);
  } else {
    await page.goto('about:blank');
  }
  await page.setViewportSize({ width: 400, height: 300 });

  await page.setContent(`
    <html>
      <head></head>
      <body style="margin:0; padding:0; background:white;">
        <div id="app" style="width:400px;height:300px;"></div>
        <script type="module">
          window.__helios?.destroy?.();
          window.__helios = undefined;
          const { Helios } = await import('${heliosPath}');
          const { default: HeliosNetwork, AttributeType } = await import('${networkPath}');

          const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 2 });
          network.nodeActivityView?.fill(0);
          network.edgeActivityView?.fill(0);
          network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 3);
          network.defineNodeAttribute('_helios_visuals_color', AttributeType.Float, 4);
          network.defineNodeAttribute('_helios_visuals_size', AttributeType.Float, 1);
          network.defineEdgeAttribute('_helios_visuals_edge_color', AttributeType.Float, 8);
          network.defineEdgeAttribute('_helios_visuals_edge_width', AttributeType.Float, 2);
          network.defineNodeToEdgeAttribute('_helios_visuals_position', '_helios_visuals_edge_endpoints_position', 'both');
          network.defineNodeToEdgeAttribute('_helios_visuals_size', '_helios_visuals_edge_endpoints_size', 'both');

          const nodes = network.addNodes(4);
          // Activate nodes explicitly.
          if (network.nodeActivityView) {
            network.nodeActivityView.fill(0);
            nodes.forEach((id) => { network.nodeActivityView[id] = 1; });
          }

          const edges = network.addEdges([
            { from: nodes[0], to: nodes[1] },
            { from: nodes[2], to: nodes[3] },
          ]);
          if (network.edgeActivityView) {
            network.edgeActivityView.fill(0);
            edges.forEach((id) => { network.edgeActivityView[id] = 1; });
          }
          const helios = new Helios(network, {
            container: document.getElementById('app'),
            renderer: 'webgl',
            mode: '2d',
            projection: 'orthographic',
            edgeRendering: 'quad',
            mappers: null,
          });
          await helios.ready;
          const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
          const sizes = network.getNodeAttributeBuffer('_helios_visuals_size').view;
          const nodeColors = network.getNodeAttributeBuffer('_helios_visuals_color').view;
          const edgeColors = network.getEdgeAttributeBuffer('_helios_visuals_edge_color').view;
          const edgeWidths = network.getEdgeAttributeBuffer('_helios_visuals_edge_width').view;
          // Two horizontal edges at different y positions.
          const placements = [
            [120, 140], [280, 140], // Edge 1 (red, thin)
            [120, 190], [280, 190], // Edge 2 (blue, thick)
          ];
          nodes.forEach((id, i) => {
            const base = id * 3;
            pos[base + 0] = placements[i][0];
            pos[base + 1] = placements[i][1];
            pos[base + 2] = 0;
            sizes[id] = 10;
            const c = base; // reuse position as offset to write color alpha 0
            nodeColors[c + 0] = 1;
            nodeColors[c + 1] = 1;
            nodeColors[c + 2] = 1;
            nodeColors[c + 3] = 0;
          });
          const writeColor = (edgeId, rgba) => {
            const offset = edgeId * 8;
            edgeColors.set(rgba, offset);
            edgeColors.set(rgba, offset + 4);
          };
          const writeWidth = (edgeId, value) => {
            const offset = edgeId * 2;
            edgeWidths[offset] = value;
            edgeWidths[offset + 1] = value;
          };
          // Thin red edge
          writeColor(edges[0], [1, 0, 0, 1]);
          writeWidth(edges[0], 2);
          // Thick blue edge
          writeColor(edges[1], [0, 0.2, 1, 1]);
          writeWidth(edges[1], 6);
          if (helios.renderer?.graphLayer) {
            // Keep global scaling neutral so per-edge widths dominate.
            helios.renderer.graphLayer.edgeWidthBase = 0;
            helios.renderer.graphLayer.edgeWidthScale = 1;
            helios.renderer.graphLayer.nodeOpacityBase = 0;
            helios.renderer.graphLayer.nodeOpacityScale = 0;
          }
          helios.visuals.markPositionsDirty();
          helios.visuals.markEdgeAttributesDirty(
            '_helios_visuals_edge_color',
            '_helios_visuals_edge_width',
          );
          helios.scheduler.requestGeometry();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          window.__helios = helios;
        </script>
      </body>
    </html>
  `);

  await page.waitForFunction(
    () => window.__helios?.layers?.container?.isConnected === true,
    { timeout: 5000 },
  );
  const counts = await page.evaluate(() => {
    const frame = { network: window.__helios?.network, timestamp: performance.now() };
    window.__helios?.renderer?.render?.(frame);
    const net = window.__helios?.network;
    let edgeCount = 0;
    try {
      net?.updateDenseEdgeIndexBuffer?.();
      net?.withBufferAccess?.(() => {
        edgeCount = net?.getDenseEdgeIndexView?.()?.count ?? 0;
      });
    } catch (_) {
      edgeCount = 0;
    }
    return { edgeCount };
  });
  expect(counts.edgeCount).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(200);

  const {
    thinWidth,
    thickWidth,
    width,
    height,
    hasData,
    nonWhite,
    canvas,
    rendererType,
    hasCanvas,
    layerCanvas,
    canvasCount,
    bodyHtml,
    containerId,
    containerConnected,
  } = await page.evaluate(() => {
    const frame = { network: window.__helios?.network, timestamp: performance.now() };
    window.__helios?.renderer?.render?.(frame);
    const { width, height } = window.__helios?.renderer?.size ?? { width: 0, height: 0 };
    const canvas = (() => {
      const el = document.querySelector('canvas');
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height, clientWidth: el.width, clientHeight: el.height };
    })();
    const dataPromise = window.__helios?.renderer?.readPixels?.() ?? null;
    let edgeCount = 0;
    try {
      window.__helios?.network?.updateDenseEdgeIndexBuffer?.();
      window.__helios?.network?.withBufferAccess?.(() => {
        edgeCount = window.__helios?.network?.getDenseEdgeIndexView?.()?.count ?? 0;
      });
    } catch (_) {
      edgeCount = 0;
    }
    const measure = (data, x, matchFn) => {
      let longest = 0;
      let current = 0;
      for (let y = 0; y < height; y += 1) {
        const idx = (width * y + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        if (matchFn(r, g, b, a)) {
          current += 1;
          longest = Math.max(longest, current);
        } else {
          current = 0;
        }
      }
      return longest;
    };
    return Promise.resolve(dataPromise).then((data) => {
      if (!data || !width || !height) {
          return {
            thinWidth: 0, thickWidth: 0, width, height, hasData: !!data, nonWhite: 0, canvas,
            rendererType: window.__helios?.renderer?.device?.type ?? null,
            hasCanvas: !!document.querySelector('canvas'),
            layerCanvas: !!window.__helios?.layers?.canvas,
          canvasCount: document.querySelectorAll('canvas').length,
          bodyHtml: document.body?.innerHTML ?? '',
          containerId: window.__helios?.layers?.container?.id ?? null,
          containerConnected: window.__helios?.layers?.container?.isConnected ?? null,
          redMax: 0,
          blueMax: 0,
          redCount: 0,
          blueCount: 0,
        };
      }
      const mid = Math.floor((120 + 280) / 2);
      const thinWidth = measure(data, mid, (r, g, b) => r > g + b + 10 && r > 20);
      const thickWidth = measure(data, mid, (r, g, b) => b > r + g + 10 && b > 50);
      let nonWhite = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r || g || b) nonWhite += 1;
      }
        return {
          thinWidth,
          thickWidth,
        width,
        height,
        hasData: !!data,
        nonWhite,
        canvas,
        rendererType: window.__helios?.renderer?.device?.type ?? null,
        hasCanvas: !!document.querySelector('canvas'),
        layerCanvas: !!window.__helios?.layers?.canvas,
          canvasCount: document.querySelectorAll('canvas').length,
          bodyHtml: document.body?.innerHTML ?? '',
          containerId: window.__helios?.layers?.container?.id ?? null,
          containerConnected: window.__helios?.layers?.container?.isConnected ?? null,
          edgeCount,
        };
      });
  });

  // Measure vertical thickness at the edge center line.
  expect(hasData).toBeTruthy();
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(nonWhite).toBeGreaterThan(0);
  expect(thinWidth).toBeGreaterThanOrEqual(1);
  expect(thickWidth).toBeGreaterThan(thinWidth);
});
