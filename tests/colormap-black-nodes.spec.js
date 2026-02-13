import { test, expect } from '@playwright/test';

async function waitForDiagnostics(page) {
  await page.waitForFunction(() => {
    const diag = window.__HELIOS_DIAGNOSTICS__;
    return diag && diag.ready;
  });
  return page.evaluate(() => window.__HELIOS_DIAGNOSTICS__);
}

test.describe('colormap regressions', () => {
  test('does not upload black node colors for CET_R1-BalancedRainbow at 20k nodes (WebGL)', async ({ page }) => {
    await page.goto('/tests/fixtures/demo.html?renderer=webgl&nodes=20000&layout=none');
    const diagnostics = await waitForDiagnostics(page);
    expect(diagnostics.ready).toBe(true);

      const result = await page.evaluate(async () => {
      const ids = [
        18435, 19220, 19219, 18405, 18376, 19357, 19385, 19356, 18574, 18635, 18669, 19398, 18475, 19082, 18329,
        18493,
      ];

      const helios = window.__helios;
      if (!helios?.network?.withBufferAccess) {
        return { error: 'Missing network buffer access' };
      }

      const { createColormapScale } = await import('/src/colors/colormaps.js');
      const expectedScale = createColormapScale('CET_R1-BalancedRainbow', { domain: [0, 19999], alpha: 1, clamp: true });

      // Apply mapper (color from $index through CET_R1-BalancedRainbow).
      helios.nodeMapper.channel('color').from('$index').colormap('CET_R1-BalancedRainbow', { domain: [0, 19999], alpha: 1, clamp: true }).done();
      // Stabilize size so we render nodes similarly across environments.
      helios.nodeMapper.channel('size').constant(12).done();
      helios.requestRender();

      // Wait for mapper + buffer upload to complete.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      const nodeCount = helios.network?.nodeCount ?? 0;
      if (!nodeCount) return { error: 'Node count unavailable' };

      let mappedColors = null;
      helios.network.withBufferAccess(() => {
        const view = helios.network.getNodeAttributeBuffer('_helios_visuals_color')?.view ?? null;
        if (!view) return;
        mappedColors = new Float32Array(view.length);
        mappedColors.set(view);
      });
      if (!mappedColors) {
        return { error: 'Missing mapped node colors buffer' };
      }

      const bad = [];
      const maxAbsDiff = (a, b) => Math.max(
        Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]),
        Math.abs(a[3] - b[3]),
      );

      for (const id of ids) {
        const offset = id * 4;
        const actual = [
          mappedColors[offset],
          mappedColors[offset + 1],
          mappedColors[offset + 2],
          mappedColors[offset + 3],
        ];
        const expected = expectedScale(id);
        const diff = maxAbsDiff(actual, expected);
        const isBlack = actual[0] === 0 && actual[1] === 0 && actual[2] === 0;
        if (isBlack || !Number.isFinite(diff) || diff > 0.05) {
          bad.push({ id, actual, expected, diff });
        }
      }

      return { bad };
    });

    expect(result?.error).toBeFalsy();
    expect(result.bad, `Unexpected black/mismatched colors: ${JSON.stringify(result.bad, null, 2)}`).toEqual([]);
  });
});
