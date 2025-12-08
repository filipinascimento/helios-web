# Utilities

Helper scripts used to preprocess assets for helios-web (e.g., colormaps). More tools will land here over time.

## Colormap encoding
- Run `node utilities/convert_colors.cjs` from the repo root.
- Input: every JSON file in `utilities/colormap_data/` (supports RGB text blocks, `#rrggbb` strings, or `[r,g,b]` arrays).
- Output: aggregated `src/colors/ColormapData.json` with colormap names prefixed by their source file (e.g., `cmasher_amber_`).
