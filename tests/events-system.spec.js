import { test, expect } from '@playwright/test';

async function setupStandalone(page) {
  await page.goto('/tests/fixtures/standalone-pick.html');
  await page.waitForFunction(() => window.__helios || window.__heliosError, { timeout: 5000 });
  const ok = await page.evaluate(() => Boolean(window.__helios));
  if (!ok) {
    const err = await page.evaluate(() => window.__heliosError);
    throw new Error(`Helios did not initialize: ${err}`);
  }
}

async function findNodeHitInCanvasCoords(page) {
  return page.evaluate(async () => {
    const helios = window.__helios;
    await helios.renderAttributeTracking();
    const targets = helios.attributeTracker?.lastTargets;
    if (!targets?.node || !helios.renderer?.readPixels) return null;

    const decode = (bytes, offset = 0) => {
      const r = bytes[offset] ?? 0;
      const g = bytes[offset + 1] ?? 0;
      const b = bytes[offset + 2] ?? 0;
      const a = bytes[offset + 3] ?? 0;
      return r + (g << 8) + (b << 16) + (a << 24) - 1;
    };
    const all = await helios.renderer.readPixels(targets.node, {
      x: 0,
      y: 0,
      width: targets.node.width,
      height: targets.node.height,
    });
    const bytes = all instanceof Uint8Array ? all : new Uint8Array(all);
    let hit = null;
    for (let y = 0; y < targets.node.height && !hit; y += 1) {
      for (let x = 0; x < targets.node.width; x += 1) {
        const idx = (y * targets.node.width + x) * 4;
        const value = decode(bytes, idx);
        if (value >= 0) {
          hit = { x, y, value };
          break;
        }
      }
    }
    if (!hit) return null;

    const size = helios.size ?? helios.renderer?.size ?? { width: 1, height: 1, devicePixelRatio: 1 };
    const pixelRatio = size.devicePixelRatio ?? 1;
    const scale = helios.attributeTracker?.options?.resolutionScale ?? 1;
    const isWebGL = helios.renderer?.device?.type === 'webgl2';
    const yCanvas = (isWebGL ? (targets.node.height - 1 - hit.y) : hit.y) / (pixelRatio * scale);
    const xCanvas = hit.x / (pixelRatio * scale);
    return { x: xCanvas, y: yCanvas, value: hit.value };
  });
}

async function findBlankInCanvasCoords(page) {
  return page.evaluate(async () => {
    const helios = window.__helios;
    await helios.renderAttributeTracking();
    const targets = helios.attributeTracker?.lastTargets;
    if (!targets?.node || !helios.renderer?.readPixels) return null;

    const decode = (bytes, offset = 0) => {
      const r = bytes[offset] ?? 0;
      const g = bytes[offset + 1] ?? 0;
      const b = bytes[offset + 2] ?? 0;
      const a = bytes[offset + 3] ?? 0;
      return r + (g << 8) + (b << 16) + (a << 24) - 1;
    };
    const all = await helios.renderer.readPixels(targets.node, {
      x: 0,
      y: 0,
      width: targets.node.width,
      height: targets.node.height,
    });
    const bytes = all instanceof Uint8Array ? all : new Uint8Array(all);
    let blank = null;
    // Sample a coarse grid to find a blank pixel quickly.
    const stepX = Math.max(1, Math.floor(targets.node.width / 24));
    const stepY = Math.max(1, Math.floor(targets.node.height / 24));
    for (let y = 0; y < targets.node.height && !blank; y += stepY) {
      for (let x = 0; x < targets.node.width; x += stepX) {
        const idx = (y * targets.node.width + x) * 4;
        const value = decode(bytes, idx);
        if (value === -1) {
          blank = { x, y };
          break;
        }
      }
    }
    if (!blank) return null;

    const size = helios.size ?? helios.renderer?.size ?? { width: 1, height: 1, devicePixelRatio: 1 };
    const pixelRatio = size.devicePixelRatio ?? 1;
    const scale = helios.attributeTracker?.options?.resolutionScale ?? 1;
    const isWebGL = helios.renderer?.device?.type === 'webgl2';
    const yCanvas = (isWebGL ? (targets.node.height - 1 - blank.y) : blank.y) / (pixelRatio * scale);
    const xCanvas = blank.x / (pixelRatio * scale);
    return { x: xCanvas, y: yCanvas };
  });
}

test('EventTarget API + picking events + AbortController teardown', async ({ page }) => {
  await setupStandalone(page);
  await page.evaluate(() => {
    const helios = window.__helios;
    window.__events = {
      any: 0,
      hoverIn: 0,
      hoverOut: 0,
      click: 0,
      dblclick: 0,
      graphClick: 0,
      graphDblClick: 0,
      bgClick: 0,
      bgDblClick: 0,
      camera: 0,
    };
    const counts = window.__events;
    const abort = new AbortController();
    window.__abort = abort;

    helios.onAny(() => { counts.any += 1; }, { signal: abort.signal });
    helios.on('node:hover', (e) => {
      if (e?.detail?.state === 'in') counts.hoverIn += 1;
      if (e?.detail?.state === 'out') counts.hoverOut += 1;
    }, { signal: abort.signal });
    helios.on('node:click', () => { counts.click += 1; }, { signal: abort.signal });
    helios.on('node:dblclick', () => { counts.dblclick += 1; }, { signal: abort.signal });
    helios.on('graph:click', (e) => {
      counts.graphClick += 1;
      if (!e?.detail?.kind) counts.bgClick += 1;
    }, { signal: abort.signal });
    helios.on('graph:dblclick', (e) => {
      counts.graphDblClick += 1;
      if (!e?.detail?.kind) counts.bgDblClick += 1;
    }, { signal: abort.signal });
    helios.on('camera:move', () => { counts.camera += 1; }, { signal: abort.signal });

    helios.enableNodePicking({ resolutionScale: 1, trackDepth: true, maxFps: 60 });
  });

  const hit = await findNodeHitInCanvasCoords(page);
  expect(hit).not.toBeNull();
  const blank = await findBlankInCanvasCoords(page);
  expect(blank).not.toBeNull();

  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + hit.x, box.y + hit.y);
  await page.waitForFunction(() => window.__events?.hoverIn > 0, null, { timeout: 5000 });

  await page.mouse.move(box.x + blank.x, box.y + blank.y);
  await page.waitForFunction(() => window.__events?.hoverOut > 0, null, { timeout: 5000 });

  await page.mouse.click(box.x + hit.x, box.y + hit.y);
  await page.waitForFunction(() => window.__events?.click > 0, null, { timeout: 5000 });
  await page.waitForFunction(() => window.__events?.graphClick > 0, null, { timeout: 5000 });

  // Ensure "click after drag/camera move" is suppressed by the picking click guard.
  const clickBeforeDrag = await page.evaluate(() => window.__events?.click ?? 0);
  await page.evaluate(({ hit, box }) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const clientX = box.x + hit.x;
    const clientY = box.y + hit.y;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, buttons: 1, button: 0, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: clientX + 30, clientY, buttons: 1, button: 0, bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: clientX + 30, clientY, buttons: 0, button: 0, bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX: clientX + 30, clientY, button: 0, bubbles: true }));
  }, { hit, box });
  await page.waitForTimeout(150);
  const clickAfterDrag = await page.evaluate(() => window.__events?.click ?? 0);
  expect(clickAfterDrag).toBe(clickBeforeDrag);

  // Sub-threshold pointer drift should remain a click, not a camera gesture.
  const beforeTinyMove = await page.evaluate(() => ({
    bgClick: window.__events?.bgClick ?? 0,
    camera: window.__events?.camera ?? 0,
  }));
  await page.evaluate(({ blank, box }) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const clientX = box.x + blank.x;
    const clientY = box.y + blank.y;
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX, clientY, buttons: 1, button: 0, pointerId: 99, pointerType: 'mouse', bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: clientX + 2, clientY: clientY + 1, buttons: 1, button: 0, pointerId: 99, pointerType: 'mouse', bubbles: true }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: clientX + 2, clientY: clientY + 1, buttons: 0, button: 0, pointerId: 99, pointerType: 'mouse', bubbles: true }));
    canvas.dispatchEvent(new MouseEvent('click', { clientX: clientX + 2, clientY: clientY + 1, button: 0, bubbles: true }));
  }, { blank, box });
  await page.waitForFunction(({ start }) => (window.__events?.bgClick ?? 0) > start, { start: beforeTinyMove.bgClick }, { timeout: 5000 });
  const afterTinyMove = await page.evaluate(() => ({
    bgClick: window.__events?.bgClick ?? 0,
    camera: window.__events?.camera ?? 0,
  }));
  expect(afterTinyMove.camera).toBe(beforeTinyMove.camera);

  // Background clicks/double-clicks should still emit graph events (kind === null).
  const bgBefore = await page.evaluate(() => ({ bgClick: window.__events?.bgClick ?? 0, bgDblClick: window.__events?.bgDblClick ?? 0 }));
  await page.mouse.click(box.x + blank.x, box.y + blank.y);
  await page.waitForFunction(({ start }) => (window.__events?.bgClick ?? 0) > start, { start: bgBefore.bgClick }, { timeout: 5000 });
  await page.mouse.dblclick(box.x + blank.x, box.y + blank.y);
  await page.waitForFunction(({ start }) => (window.__events?.bgDblClick ?? 0) > start, { start: bgBefore.bgDblClick }, { timeout: 5000 });

  // Force a camera change to ensure camera:move is emitted (coalesced to rAF).
  await page.evaluate(() => {
    const helios = window.__helios;
    const camera = helios.renderer?.camera;
    if (!camera) return;
    // Use a public API that always triggers a change notification.
    camera.setTarget?.([camera.target?.[0] ?? 0, camera.target?.[1] ?? 0, camera.target?.[2] ?? 0]);
  });
  await page.waitForFunction(() => window.__events?.camera > 0, null, { timeout: 5000 });

  const beforeAbort = await page.evaluate(() => ({ ...window.__events }));
  await page.evaluate(() => window.__abort.abort());
  await page.waitForTimeout(50);
  await page.mouse.move(box.x + hit.x + 1, box.y + hit.y + 1);
  await page.mouse.click(box.x + hit.x + 1, box.y + hit.y + 1);
  await page.waitForTimeout(200);
  const afterAbort = await page.evaluate(() => ({ ...window.__events }));
  expect({
    hoverIn: afterAbort.hoverIn,
    hoverOut: afterAbort.hoverOut,
    click: afterAbort.click,
    dblclick: afterAbort.dblclick,
    graphClick: afterAbort.graphClick,
    graphDblClick: afterAbort.graphDblClick,
    bgClick: afterAbort.bgClick,
    bgDblClick: afterAbort.bgDblClick,
    camera: afterAbort.camera,
  }).toEqual({
    hoverIn: beforeAbort.hoverIn,
    hoverOut: beforeAbort.hoverOut,
    click: beforeAbort.click,
    dblclick: beforeAbort.dblclick,
    graphClick: beforeAbort.graphClick,
    graphDblClick: beforeAbort.graphDblClick,
    bgClick: beforeAbort.bgClick,
    bgDblClick: beforeAbort.bgDblClick,
    camera: beforeAbort.camera,
  });

  const anyAfterAbort = await page.evaluate(() => {
    const helios = window.__helios;
    let count = 0;
    const abort = new AbortController();
    helios.onAny(() => { count += 1; }, { signal: abort.signal });
    abort.abort();
    helios.emit('events:test-abort-probe', {});
    return count;
  });
  expect(anyAfterAbort).toBe(0);
});
