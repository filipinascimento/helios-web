# Mappers and Colormaps

Visual mappings convert your graph attributes into colors, sizes, widths, and opacities. Helios ships flexible mapper utilities plus a library of colormaps so you can get sensible visuals without hand-tuning every value.

## Quick start

```js
import { Mapper, createColormapScale, colormaps, colormapToScheme } from 'helios-web-next';

// Continuous values → RGBA via a perceptual colormap
const nodeColor = createColormapScale('cmasher:rainforest', { domain: [0, 1], alpha: 1 });
mapper.channel('color').from('weight').transform((v) => nodeColor(v ?? 0)).done();

// Size from the same attribute
mapper.channel('size').from('weight').linear([0, 1], [1, 5]).done();

// Categorical palette built from a continuous colormap
const palette = colormapToScheme(colormaps.cmasher.cmasher_amber, 8);
mapper.channel('color').categorical(['A', 'B', 'C'], palette).done();
```

Available channels include `color`, `size`, `width`, and `opacity` on both node and edge mappers. Each channel supports either a constant value, a scale/transform function, or a colormap.

## Colormap helpers

- `createColormapScale(nameOrFn, { domain, clamp = true, alpha })` – returns a function mapping numeric values to `[r,g,b,a]` in 0–1 space. Accepts any built-in colormap key (CET, cmasher, helios, d3-scale-chromatic) or a custom interpolator function.
- `colormapToScheme(colormap, count)` – samples a colormap into a categorical palette of `count` colors.
- `colormaps` – registry of available colormaps, including `colormaps.cmasher`, `colormaps.cet`, `colormaps.helios`, and d3 variants like `colormaps.d3.interpolateTurbo`.

Tips:
- Set `domain` to your data min/max so the scale spans your range; leaving it at `[0,1]` assumes normalized inputs.
- Use `alpha` to enforce a uniform opacity while keeping RGB from the colormap.
- For discrete categories, prefer `colormapToScheme` to avoid banding from continuous ramps.

## Example: Basic demo node colors

The bundled basic example (`docs/examples/basic/main.js`) maps node attribute `weight` through `createColormapScale('cmasher:rainforest')` and sizes nodes from the same attribute. Toggle the renderer via `?renderer=webgl` and edge transparency via `?edgeTransparency=weighted` to see how visuals react.

## When things look flat

- Clamp/normalize your data before mapping; out-of-range values compress to the ends of the colormap.
- Try a diverging map (e.g., `d3:interpolatePiYG`) when you have values centered around zero.
- Increase size/width ranges if colors alone aren’t perceptible.

For more end-to-end context, see the example README in `docs/examples/basic/README.md`.
