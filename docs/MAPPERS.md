# Mappers and Colormaps

Visual mappings convert your graph attributes into colors, sizes, widths, and opacities. Helios ships flexible mapper utilities plus a library of colormaps so you can get sensible visuals without hand-tuning every value.

## Quick start

```js
import {
  DEFAULT_NODE_COLORMAP,
  Mapper,
  createColormapScale,
  colormaps,
  colormapToScheme,
} from 'helios-web';

// Continuous values → RGBA via a perceptual colormap
const nodeColor = createColormapScale(DEFAULT_NODE_COLORMAP, { domain: [0, 1], alpha: 1 });
mapper.channel('color').from('weight').transform((v) => nodeColor(v ?? 0)).done();

// Size from the same attribute
mapper.channel('size').from('weight').linear([0, 1], [1, 5]).done();

// Categorical palette built from a continuous colormap
const palette = colormapToScheme(colormaps.cmasher.cmasher_amber, 8);
mapper.channel('color').categorical(['A', 'B', 'C'], palette).done();
```

Available channels include `color`, `size`, `width`, and `opacity` on both node and edge mappers. Each channel supports either a constant value, a scale/transform function, or a colormap.

Mapper-driven visuals allocate attribute buffers on demand. Channels in constant mode use uniforms and won’t create per-node/edge attributes unless another mapper needs them. Once created, buffers are kept around even if you switch back to constants.

## Colormap helpers

- `createColormapScale(nameOrFn, { domain, clamp = true, alpha })` – returns a function mapping numeric values to `[r,g,b,a]` in 0–1 space. Accepts any built-in colormap key (CET, cmasher, helios, d3-scale-chromatic) or a custom interpolator function. `clamp` can be a boolean or `{ min, max }` for one-sided clamping (unclamped values return `undefined`).
- `colormapToScheme(colormap, count)` – samples a colormap into a categorical palette of `count` colors.
- `colormaps` – registry of available colormaps, including `colormaps.cmasher`, `colormaps.cet`, `colormaps.helios`, and d3 variants like `colormaps.d3.interpolateTurbo`.

Tips:
- Set `domain` to your data min/max so the scale spans your range; leaving it at `[0,1]` assumes normalized inputs.
- Use `alpha` to enforce a uniform opacity while keeping RGB from the colormap.
- For discrete categories, prefer `colormapToScheme` to avoid banding from continuous ramps.
- The default node color mapper uses `CET_L08-NeonBurst`; the alias `CET: L08-NeonBurst` resolves to the same built-in ramp.

If you’re using `HeliosUI`, the Mappers panel includes a searchable colormap picker with thumbnail previews to make it easier to browse ramps.

Note: mapper configs that rely on arbitrary JavaScript functions (for example `.transform((v) => ...)` or `.scale((v) => ...)`) are not safely serializable. Persistence stores declarative mappings (`constant`, `passthrough`, `linear`, `categorical`, `colormap`, `nodeAttribute`, and `nodeToEdge`) plus built-in transforms through `transformType`/`transformPower`. Fully custom function channels are marked as unsupported in the serialized snapshot and restore to the existing/default channel instead of being replayed as a partial mapper.

## Categorical mapping

Categorical channels map discrete attribute values to a fixed palette.

`helios-web` also includes a built-in `category18` categorical palette for
community- or cluster-style labeling.

```js
mapper.channel('color').categorical(['A', 'B', 'C'], ['#ff6b6bff', '#4dabf7ff', '#51cf66ff']).done();
```

You can also set a categorical channel via config objects (useful for serialization):

```js
mapper.setChannel('color', {
	attributes: 'community',
	type: 'categorical',
	domain: [0, 1, 2],
	range: ['#ff6b6bff', '#4dabf7ff', '#51cf66ff'],
	defaultValue: '#888888ff',
	meta: {
		categorical: {
			sortOrder: 'frequency',
			maxCategories: null,
			palette: 'cmasher:ember',
			preferScheme: true,
		},
	},
});
```

In `HeliosUI`, the Mappers panel provides:

- Source-first mapper editing: choose the attribute/source first, then choose from compatible mapper types for that source and visual channel.
- A `Special sources` group for fixed values, generated indices, and layout positions without exposing internal source tokens.
- Attribute selection for categorical fields (including string attributes that can be converted to categorical).
- Sorting by frequency, alphabetical, natural, or manual order.
- Palette selection (with scheme preference) and optional max category limits.
- Manual color edits and category reordering.

## Built-in transforms

Mapper channels support `transformType` for common pre-transforms (`log`, `log1p`, `logit`, `power`). Use `transformType: 'percentile'` (or `'quantile'`) to rank values across the current attribute buffer into a 0–1 range before scaling.

## Example: Basic demo node colors

The bundled main app (`docs/app/main.js`) uses Helios internal mapper defaults unless you explicitly change mapper settings through the API or UI. Keep the default renderer path unless you are intentionally comparing backends; for fallback-specific checks, pass `?renderer=webgl`. Compare edge transparency modes with `?edgeTransparency=alpha` or another explicit mode only when you need to isolate that behavior.

## When things look flat

- Clamp/normalize your data before mapping; out-of-range values compress to the ends of the colormap.
- Try a diverging map (e.g., `d3:interpolatePiYG`) when you have values centered around zero.
- Increase size/width ranges if colors alone aren’t perceptible.

For more end-to-end context, see the example README in `docs/app/README.md`.
