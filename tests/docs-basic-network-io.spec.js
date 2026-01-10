import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

function parseScreenshot(buffer) {
  return new Promise((resolve, reject) => {
    const png = new PNG();
    png.parse(buffer, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

async function countNonBackground(page) {
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
  return nonBackground;
}

test.describe('docs basic demo network io', () => {
  test('renders after load without requiring save', async ({ page }, testInfo) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=600');

    // Wait for docs example to publish a Helios instance.
    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(async () => {
      const helios = window.__helios;
      await helios.ready;
      return true;
    });
    await page.waitForTimeout(750);

    const before = await page.evaluate(() => {
      const helios = window.__helios;
      return {
        ok: Boolean(helios && helios.network && helios.renderer),
        running: Boolean(helios?.scheduler?.running),
        firstGeometry: Boolean(helios?.firstGeometryUpdateComplete),
        nodes: helios?.network?.nodeCount ?? 0,
        edges: helios?.network?.edgeCount ?? 0,
        camera: helios?.renderer?.camera
          ? {
              mode: helios.renderer.camera.mode,
              projection: helios.renderer.camera.projection,
              zoom: helios.renderer.camera.zoom,
              distance: helios.renderer.camera.distance,
              pan2D: Array.from(helios.renderer.camera.pan2D ?? []),
              target: Array.from(helios.renderer.camera.target ?? []),
            }
          : null,
      };
    });

    const beforePixels = await countNonBackground(page);

    // Create a new network by saving the current one, then load it back.
    const after = await page.evaluate(async () => {
      const helios = window.__helios;
      const blob = await helios.saveNetwork('xnet', { output: 'blob' });
      await helios.loadNetwork(blob, { format: 'xnet', disposeOld: true, recreateRenderer: true, keepCamera: false });
      // Ensure at least one scheduler turn.
      helios.requestRender?.();
      return {
        running: Boolean(helios?.scheduler?.running),
        firstGeometry: Boolean(helios?.firstGeometryUpdateComplete),
        nodes: helios?.network?.nodeCount ?? 0,
        edges: helios?.network?.edgeCount ?? 0,
        camera: helios?.renderer?.camera
          ? {
              mode: helios.renderer.camera.mode,
              projection: helios.renderer.camera.projection,
              zoom: helios.renderer.camera.zoom,
              distance: helios.renderer.camera.distance,
              pan2D: Array.from(helios.renderer.camera.pan2D ?? []),
              target: Array.from(helios.renderer.camera.target ?? []),
            }
          : null,
      };
    });

    await page.waitForTimeout(1000);
    const afterPixels = await countNonBackground(page);

    await testInfo.attach('docs-demo-state', {
      body: JSON.stringify({ before, after, beforePixels, afterPixels }, null, 2),
      contentType: 'application/json',
    });

    expect(before.ok).toBe(true);
    expect(before.nodes).toBeGreaterThan(0);
    expect(beforePixels).toBeGreaterThan(200);
    expect(after.nodes).toBe(before.nodes);
    expect(afterPixels).toBeGreaterThan(200);
  });

  test('frames loaded 2D network into view', async ({ page }, testInfo) => {
    await page.goto('/?renderer=webgl&layout=none&mode=2d&nodes=800');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(async () => {
      const helios = window.__helios;
      await helios.ready;
      return true;
    });

    // Make the active network far from the origin and large, then reload with keepCamera:false.
    await page.evaluate(async () => {
      const helios = window.__helios;
      const net = helios.network;
      const active = Array.from(net.nodeIndices || []);
      net.withBufferAccess(() => {
        const pos = net.getNodeAttributeBuffer('_helios_visuals_position').view;
        for (let i = 0; i < active.length; i += 1) {
          const id = active[i];
          const o = id * 3;
          pos[o] = pos[o] * 250 + 50000;
          pos[o + 1] = pos[o + 1] * 250 + 35000;
          pos[o + 2] = 0;
        }
        net.bumpNodeAttributeVersion?.('_helios_visuals_position');
      });
      const blob = await helios.saveNetwork('xnet', { output: 'blob' });
      await helios.loadNetwork(blob, { format: 'xnet', disposeOld: true, recreateRenderer: true, keepCamera: false });
      helios.requestRender?.();
    });

    await page.waitForTimeout(500);

    const stats = await page.evaluate(() => {
      const helios = window.__helios;
      const net = helios.network;
      const pos = helios.visuals.nodePositions;
      const active = net.nodeIndices || [];
      const camera = helios.renderer.camera;
      const vp = camera.getUniforms?.().viewProjection ?? camera.viewProjectionMatrix;
      const step = Math.max(1, Math.floor(active.length / 2000));

      let sumX = 0;
      let sumY = 0;
      let count = 0;
      let inside = 0;
      for (let i = 0; i < active.length; i += step) {
        const id = active[i];
        const o = id * 3;
        const x = pos[o];
        const y = pos[o + 1];
        const z = pos[o + 2];
        const cx =
          vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
        const cy =
          vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
        const cw =
          vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cw) || Math.abs(cw) < 1e-6) continue;
        const ndcX = cx / cw;
        const ndcY = cy / cw;
        sumX += ndcX;
        sumY += ndcY;
        count += 1;
        if (Math.abs(ndcX) <= 1.0 && Math.abs(ndcY) <= 1.0) inside += 1;
      }
      const ndcX = count ? sumX / count : 0;
      const ndcY = count ? sumY / count : 0;
      const insideRatio = count ? inside / count : 0;
      return {
        ndcX,
        ndcY,
        insideRatio,
        zoom: camera.zoom,
        minZoom: camera.minZoom,
        pan2D: Array.from(camera.pan2D ?? []),
        viewport: camera.viewport ? { ...camera.viewport } : null,
      };
    });

    await testInfo.attach('framing-stats-2d', {
      body: JSON.stringify(stats, null, 2),
      contentType: 'application/json',
    });

    expect(Math.abs(stats.ndcX)).toBeLessThan(0.25);
    expect(Math.abs(stats.ndcY)).toBeLessThan(0.25);
    expect(stats.insideRatio).toBeGreaterThan(0.6);
  });

  test('keeps network centered after first 3D rotate interaction', async ({ page }, testInfo) => {
    await page.goto('/?renderer=webgl&layout=none&mode=3d&nodes=800');

    await page.waitForFunction(() => Boolean(window.__helios && window.__helios.ready));
    await page.waitForFunction(async () => {
      const helios = window.__helios;
      await helios.ready;
      return true;
    });

    // Load a positive-quadrant network so (0,0,0) is a "corner" unless framing sets a proper target.
    await page.evaluate(async () => {
      const helios = window.__helios;
      const net = helios.network;
      const active = Array.from(net.nodeIndices || []);
      net.withBufferAccess(() => {
        const pos = net.getNodeAttributeBuffer('_helios_visuals_position').view;
        for (let i = 0; i < active.length; i += 1) {
          const id = active[i];
          const o = id * 3;
          pos[o] = Math.abs(pos[o]) + 1000;
          pos[o + 1] = Math.abs(pos[o + 1]) + 1000;
          pos[o + 2] = Math.abs(pos[o + 2]) + 1000;
        }
        net.bumpNodeAttributeVersion?.('_helios_visuals_position');
      });
      const blob = await helios.saveNetwork('xnet', { output: 'blob' });
      await helios.loadNetwork(blob, { format: 'xnet', disposeOld: true, recreateRenderer: true, keepCamera: false });
      helios.requestRender?.();
    });

    await page.waitForTimeout(500);

    const centroid = await page.evaluate(() => {
      const helios = window.__helios;
      const net = helios.network;
      const pos = helios.visuals.nodePositions;
      const active = net.nodeIndices || [];
      const camera = helios.renderer.camera;
      const vp = camera.getUniforms?.().viewProjection ?? camera.viewProjectionMatrix;
      const step = Math.max(1, Math.floor(active.length / 2000));
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let i = 0; i < active.length; i += step) {
        const id = active[i];
        const o = id * 3;
        const x = pos[o];
        const y = pos[o + 1];
        const z = pos[o + 2];
        // clip = vp * [x,y,z,1]
        const cx =
          vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
        const cy =
          vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
        const cw =
          vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cw) || Math.abs(cw) < 1e-6) continue;
        sumX += cx / cw;
        sumY += cy / cw;
        count += 1;
      }
      const ndcX = count ? sumX / count : 0;
      const ndcY = count ? sumY / count : 0;
      return {
        ndcX,
        ndcY,
        target: Array.from(camera.target ?? []),
        mode: camera.mode,
      };
    });

    await testInfo.attach('centroid-before', {
      body: JSON.stringify(centroid, null, 2),
      contentType: 'application/json',
    });

    expect(centroid.mode).toBe('3d');
    // Should be centered-ish after framing.
    expect(Math.abs(centroid.ndcX)).toBeLessThan(0.25);
    expect(Math.abs(centroid.ndcY)).toBeLessThan(0.25);

    // First rotate interaction.
    const box = await page.locator('canvas').boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.55, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(250);

    const after = await page.evaluate(() => {
      const helios = window.__helios;
      const net = helios.network;
      const pos = helios.visuals.nodePositions;
      const active = net.nodeIndices || [];
      const camera = helios.renderer.camera;
      const vp = camera.getUniforms?.().viewProjection ?? camera.viewProjectionMatrix;
      const step = Math.max(1, Math.floor(active.length / 2000));
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let i = 0; i < active.length; i += step) {
        const id = active[i];
        const o = id * 3;
        const x = pos[o];
        const y = pos[o + 1];
        const z = pos[o + 2];
        const cx =
          vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
        const cy =
          vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
        const cw =
          vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cw) || Math.abs(cw) < 1e-6) continue;
        sumX += cx / cw;
        sumY += cy / cw;
        count += 1;
      }
      const ndcX = count ? sumX / count : 0;
      const ndcY = count ? sumY / count : 0;
      return {
        ndcX,
        ndcY,
        target: Array.from(camera.target ?? []),
      };
    });

    await testInfo.attach('centroid-after', {
      body: JSON.stringify(after, null, 2),
      contentType: 'application/json',
    });

    // Rotating shouldn't cause a huge "jump" of the projected centroid.
    expect(Math.abs(after.ndcX)).toBeLessThan(0.45);
    expect(Math.abs(after.ndcY)).toBeLessThan(0.45);
    // Target should not change on rotate (only rotation changes).
    expect(after.target).toEqual(centroid.target);
  });
});
