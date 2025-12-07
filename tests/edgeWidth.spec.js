import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveModuleUrl(baseURL, absolutePath) {
  if (baseURL) {
    const root = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
    return new URL(`/@fs${absolutePath}`, root).href;
  }
  return pathToFileURL(absolutePath).href;
}

/**
 * Measures the thickest run of non-white pixels along a vertical scan line.
 * Assumes a white background and a horizontal black edge through the center.
 * @param {Buffer} pngBuffer
 */
function measureEdgeThickness(pngBuffer) {
  const png = PNG.sync.read(pngBuffer);
  const x = Math.floor(png.width / 2);
  let longest = 0;
  let current = 0;
  for (let y = 0; y < png.height; y += 1) {
    const idx = (png.width * y + x) * 4;
    const r = png.data[idx];
    const g = png.data[idx + 1];
    const b = png.data[idx + 2];
    const isEdge = r < 240 || g < 240 || b < 240;
    if (isEdge) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

async function renderAndMeasure(page, { mode, baseURL }) {
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
  await page.setViewportSize({ width: 400, height: 400 });
  await page.setContent(`
    <html>
      <head>
        <script type="importmap">
          {
            "imports": {
              "helios-web-next": "${heliosPath}",
              "helios-network": "${networkPath}"
            }
          }
        </script>
      </head>
      <body style="margin:0; padding:0;">
        <div id="app" style="width:400px;height:400px;"></div>
        <script type="module">
          import { Helios } from 'helios-web-next';
          import HeliosNetwork, { AttributeType } from 'helios-network';

          async function setup(mode) {
            const network = await HeliosNetwork.create({ directed: false, initialNodes: 0, initialEdges: 1 });
            network.defineNodeAttribute('_helios_visuals_position', AttributeType.Float, 3);
            network.defineNodeAttribute('_helios_visuals_color', AttributeType.Float, 4);
            network.defineNodeAttribute('_helios_visuals_size', AttributeType.Float, 1);
            network.defineEdgeAttribute('_helios_visuals_edge_color', AttributeType.Float, 4);
            network.defineEdgeAttribute('_helios_visuals_edge_width', AttributeType.Float, 1);
            network.defineNodeToEdgeAttribute('_helios_visuals_position', '_helios_visuals_edge_endpoints_position', 'both');
            network.defineNodeToEdgeAttribute('_helios_visuals_size', '_helios_visuals_edge_endpoints_size', 'both');
            // Ensure no stray active edges from initial capacity.
            if (network.edgeActivityView) {
              network.edgeActivityView.fill(0);
            }

            const nodes = network.addNodes(2);
            const pos = network.getNodeAttributeBuffer('_helios_visuals_position').view;
            const nodeColors = network.getNodeAttributeBuffer('_helios_visuals_color').view;
            const nodeSizes = network.getNodeAttributeBuffer('_helios_visuals_size').view;
            // Place two nodes horizontally with transparent fill so they don't affect the measurement.
            const placements = [
              [120, 200],
              [280, 200],
            ];
            nodes.forEach((id, i) => {
              const offset = id * 3;
              pos[offset] = placements[i][0];
              pos[offset + 1] = placements[i][1];
              pos[offset + 2] = 0;
              nodeColors[offset] = 1;
              nodeColors[offset + 1] = 1;
              nodeColors[offset + 2] = 1;
              nodeColors[offset + 3] = 0;
              nodeSizes[id] = 20;
            });

            const edgeIds = network.addEdges([{ from: nodes[0], to: nodes[1] }]);
            const edgeColors = network.getEdgeAttributeBuffer('_helios_visuals_edge_color').view;
            const edgeWidths = network.getEdgeAttributeBuffer('_helios_visuals_edge_width').view;
            edgeColors[edgeIds[0] * 4 + 0] = 0;
            edgeColors[edgeIds[0] * 4 + 1] = 0;
            edgeColors[edgeIds[0] * 4 + 2] = 0;
            edgeColors[edgeIds[0] * 4 + 3] = 1;
            edgeWidths[edgeIds[0]] = 1;
            window.__networkDebug = {
              edgeCount: network.edgeCount,
              edgeCapacity: network.edgeCapacity,
              edgeActivity: Array.from(network.edgeActivityView || []),
              denseEdgeIndex: network.updateDenseEdgeIndexBuffer?.()?.count ?? null,
            };

            const helios = new Helios(network, {
              container: document.getElementById('app'),
              renderer: 'webgl',
              clearColor: [1, 1, 1, 1],
              mode,
              projection: 'orthographic',
              layout: { type: 'static', options: { bounds: [0, 0, 400, 400] } },
            });
            await helios.ready;
            window.__helios = helios;

            // Keep global edge width modest and consistent.
            if (helios.renderer?.graphLayer) {
              helios.renderer.graphLayer.edgeWidthBase = 0;
              helios.renderer.graphLayer.edgeWidthScale = 0.01;
            }

            const cam = helios.renderer?.camera;
            if (cam) {
              if (mode === '2d') {
                cam.zoom = 1;
              } else {
                cam.distance = 800;
              }
              cam._needsUpdate = true;
              cam.updateMatrices?.();
            }

            helios.pipeline.markPositionsDirty();
            helios.scheduler.requestGeometry();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }

          setup('${mode}');
        </script>
      </body>
    </html>
  `);

  // Allow rendering to settle and then capture the center line.
  await page.waitForTimeout(200);
  const stats = await page.evaluate(() => {
    const helios = window.__helios;
    const debug = window.__networkDebug;
    const frame = helios?.pipeline?.buildFrame?.();
    const geometry = frame?.geometry;
    const edgeCount = helios?.renderer?.graphLayer?.edgeCount ?? 0;
    const edgeActivity = helios?.network?.edgeActivityView;
    const activeEdges = edgeActivity ? edgeActivity.reduce((sum, value) => sum + value, 0) : 0;
    const edgeCountValue = helios?.network?.edgeCount ?? 0;
    const currentFrameEdges = helios?.scheduler?.currentFrame?.geometry?.edges?.count ?? 0;
    const geometryEdgesCount = geometry?.edges?.count ?? 0;
    const endpointSizes = geometry?.edges?.endpointSizes?.length ?? 0;
    return {
      endpointSizes,
      edgeCount,
      edgeCountValue,
      activeEdges,
      geometryEdgesCount,
      currentFrameEdges,
      debug,
    };
  });
  const buffer = await page.screenshot({ fullPage: false });
  return { width: measureEdgeThickness(buffer), stats };
}

test('2D and 3D edge thickness stay aligned', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  const { width: width2D, stats: stats2D } = await renderAndMeasure(page, { mode: '2d', baseURL });
  const { width: width3D, stats: stats3D } = await renderAndMeasure(page, { mode: '3d', baseURL });
  console.log('edge widths', { width2D, width3D, stats2D, stats3D });
  // Ensure we actually drew an edge in both modes.
  expect(width2D).toBeGreaterThanOrEqual(2);
  expect(width3D).toBeGreaterThanOrEqual(2);
  expect(stats2D.edgeCount).toBeGreaterThan(0);
  expect(stats3D.edgeCount).toBeGreaterThan(0);
  const diff = Math.abs(width2D - width3D);
  expect(diff).toBeLessThanOrEqual(2);
});
