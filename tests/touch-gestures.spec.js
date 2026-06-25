import { test, expect } from '@playwright/test';

async function setup(page, query = '') {
  await page.goto(`/tests/fixtures/standalone-pick.html${query}`);
  await page.waitForFunction(() => window.__HELIOS_DIAGNOSTICS__ != null, { timeout: 5000 });
  const diagnostics = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
  expect(diagnostics?.ready, diagnostics?.error ?? 'fixture did not become ready').toBe(true);
}

async function findNodeHit(page) {
  return page.evaluate(async () => {
    const helios = window.__helios;
    await helios.renderAttributeTracking();
    const targets = helios.attributeTracker?.lastTargets;
    const all = await helios.renderer.readPixels(targets.node, {
      x: 0,
      y: 0,
      width: targets.node.width,
      height: targets.node.height,
    });
    const bytes = all instanceof Uint8Array ? all : new Uint8Array(all);
    const decode = (offset) => bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] << 24) - 1;
    for (let y = 0; y < targets.node.height; y += 1) {
      for (let x = 0; x < targets.node.width; x += 1) {
        const index = decode((y * targets.node.width + x) * 4);
        if (index >= 0) {
          return { x, y, index };
        }
      }
    }
    return null;
  });
}

async function dispatchTouchSequence(page, steps) {
  await page.evaluate(async (inputSteps) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('missing canvas');
    const dispatch = (target, type, point) => {
      target.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: point.pointerId,
        pointerType: 'touch',
        isPrimary: point.pointerId === 1,
        clientX: point.clientX,
        clientY: point.clientY,
        button: 0,
        buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      }));
    };
    for (const step of inputSteps) {
      for (const point of step.points) {
        dispatch(canvas, step.type, point);
      }
      await new Promise((resolve) => setTimeout(resolve, step.waitMs ?? 16));
    }
  }, steps);
}

test.describe('touch gestures', () => {
  test('2D touch pinch changes camera zoom and suppresses click after movement on WebGL', async ({ page }) => {
    await setup(page, '?renderer=webgl&mode=2d&suppress=1');
    const hit = await findNodeHit(page);
    expect(hit).not.toBeNull();

    await page.evaluate(() => {
      window.__touchEvents = { click: 0, dblclick: 0 };
      const helios = window.__helios;
      helios.on('node:click', () => { window.__touchEvents.click += 1; });
      helios.on('node:dblclick', () => { window.__touchEvents.dblclick += 1; });
    });

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    const centerX = box.x + hit.x;
    const centerY = box.y + hit.y;

    const before = await page.evaluate(() => ({
      zoom: window.__helios.renderer.camera.zoom,
      pan2D: Array.from(window.__helios.renderer.camera.pan2D),
    }));

    await dispatchTouchSequence(page, [
      { type: 'pointerdown', points: [{ pointerId: 1, clientX: centerX - 20, clientY: centerY }, { pointerId: 2, clientX: centerX + 20, clientY: centerY }] },
      { type: 'pointermove', points: [{ pointerId: 1, clientX: centerX - 40, clientY: centerY - 10 }, { pointerId: 2, clientX: centerX + 40, clientY: centerY - 10 }] },
      { type: 'pointerup', points: [{ pointerId: 1, clientX: centerX - 40, clientY: centerY - 10 }, { pointerId: 2, clientX: centerX + 40, clientY: centerY - 10 }] },
    ]);

    const after = await page.evaluate(() => ({
      zoom: window.__helios.renderer.camera.zoom,
      pan2D: Array.from(window.__helios.renderer.camera.pan2D),
      clicks: window.__touchEvents.click,
    }));
    expect(after.zoom).toBeGreaterThan(before.zoom);
    expect(Math.abs(after.pan2D[1])).toBeGreaterThan(Math.abs(before.pan2D[1]));
    expect(after.clicks).toBe(0);
  });

  test('3D touch drag rotates on the active renderer', async ({ page }) => {
    await setup(page, '?mode=3d&suppress=1');
    const hit = await findNodeHit(page);
    expect(hit).not.toBeNull();
    const diagnostics = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
    expect(diagnostics.renderer).toBeTruthy();

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    const clientX = box.x + hit.x;
    const clientY = box.y + hit.y;

    const before = await page.evaluate(() => Array.from(window.__helios.renderer.camera.rotation));
    await dispatchTouchSequence(page, [
      { type: 'pointerdown', points: [{ pointerId: 1, clientX, clientY }] },
      { type: 'pointermove', points: [{ pointerId: 1, clientX: clientX + 30, clientY: clientY + 12 }] },
      { type: 'pointerup', points: [{ pointerId: 1, clientX: clientX + 30, clientY: clientY + 12 }] },
    ]);
    const afterRotate = await page.evaluate(() => Array.from(window.__helios.renderer.camera.rotation));
    expect(afterRotate).not.toEqual(before);
  });

  test('@webgpu WebGPU touch pinch path runs when WebGPU is available', async ({ page }) => {
    await setup(page, '?renderer=webgpu&mode=2d&suppress=1');
    const supported = await page.evaluate(async () => Boolean(navigator.gpu) && Boolean(await navigator.gpu?.requestAdapter?.()));
    test.skip(!supported, 'WebGPU not available in browser');
    const hit = await findNodeHit(page);
    expect(hit).not.toBeNull();
    const diagnostics = await page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
    if (diagnostics.renderer !== 'webgpu') {
      test.skip(true, `WebGPU initialization unavailable (${diagnostics.renderer})`);
    }

    const box = await page.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    const centerX = box.x + hit.x;
    const centerY = box.y + hit.y;
    const beforeZoom = await page.evaluate(() => window.__helios.renderer.camera.zoom);

    await dispatchTouchSequence(page, [
      { type: 'pointerdown', points: [{ pointerId: 1, clientX: centerX - 16, clientY: centerY }, { pointerId: 2, clientX: centerX + 16, clientY: centerY }] },
      { type: 'pointermove', points: [{ pointerId: 1, clientX: centerX - 34, clientY: centerY }, { pointerId: 2, clientX: centerX + 34, clientY: centerY }] },
      { type: 'pointerup', points: [{ pointerId: 1, clientX: centerX - 34, clientY: centerY }, { pointerId: 2, clientX: centerX + 34, clientY: centerY }] },
    ]);

    const afterZoom = await page.evaluate(() => window.__helios.renderer.camera.zoom);
    expect(afterZoom).toBeGreaterThan(beforeZoom);
  });
});
