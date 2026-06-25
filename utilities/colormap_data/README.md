Colormap datasets bundled for preprocessing:

- CET: Derived from Peter Kovesi's CET perceptual colormaps; color names were suggested by an LLM to make the names more appealing.
- cmasher: Palettes sourced from the `cmasher` Python library.
- helios: Additional ad-hoc palettes curated for Helios.

Run `node ../convert_colors.cjs` to encode every JSON file in this folder into `src/colors/ColormapData.json` with names prefixed by the file stem (e.g., `cmasher_amber`).
