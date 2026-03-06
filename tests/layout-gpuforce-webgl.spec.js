import { test, expect } from '@playwright/test';

test('gpu-force runs with WebGL2 delegate texture resources when renderer=webgl', async ({ page }) => {
  await page.goto('/?nodes=450&mode=2d&renderer=webgl&layout=gpuforce');
  await page.waitForFunction(() => window.__HELIOS_DIAGNOSTICS__?.ready === true);
  await page.waitForTimeout(800);

  const result = await page.evaluate(async () => {
    const helios = window.__helios;
    const network = helios?.network ?? null;
    const renderer = helios?.renderer ?? null;
    const graphLayer = renderer?.graphLayer ?? null;
    const deviceType = renderer?.device?.type ?? null;
    const positionsConfig = helios?.positions?.() ?? null;
    const layout = typeof helios?.layout === 'function' ? helios.layout() : null;
    const delegate = layout?.getPositionDelegate?.() ?? positionsConfig?.delegate ?? null;
    const snapshot = await helios?.snapshotDelegatePositions?.();

    let override = null;
    if (network && graphLayer && typeof network.withBufferAccess === 'function') {
      override = network.withBufferAccess(() => graphLayer.resolvePositionSourceOverride(network, {
        backend: 'webgl2',
        gl: renderer?.device?.gl ?? null,
        device: renderer?.device ?? null,
      }));
    }

    return {
      deviceType,
      positionSource: positionsConfig?.source ?? null,
      hasDelegate: Boolean(delegate),
      delegateSnapshotLength: snapshot instanceof Float32Array ? snapshot.length : 0,
      hasWebglTexture: Boolean(override?.webglTexture),
    };
  });

  expect(result.deviceType).toBe('webgl2');
  expect(result.positionSource).toBe('delegate');
  expect(result.hasDelegate).toBe(true);
  expect(result.delegateSnapshotLength).toBeGreaterThan(0);
  expect(result.hasWebglTexture).toBe(true);
});
