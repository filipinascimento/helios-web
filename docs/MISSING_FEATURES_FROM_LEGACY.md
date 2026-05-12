# Missing Features from Legacy Helios Web

This document tracks features present in `for_reference/helios-web-older-for-reference` that are not present in the current `helios-web-next` implementation as-is.

Scope:
- Legacy source: `for_reference/helios-web-older-for-reference/`
- Current source: `src/`, `docs/`, `tests/`

## Library-level gaps

1. Legacy parser exports for `gml` and `gexf`
- Legacy exported parser modules: `src/helios.js` (`xnet`, `gml`, `gexf`).
- Current public exports do not include parser modules; current network I/O is centered on `helios-network` (`xnet`, `zxnet`, `bxnet`).

2. Legacy constructor style (`new Helios({ nodes, edges, ... })`)
- Legacy constructor accepted raw `nodes` and `edges` and could create an internal `Network`.
- Current constructor requires a `helios-network` instance: `new Helios(network, options)`.

3. Legacy density constructor/API shape (`DensityGL`, `density`, `densityScale`)
- Legacy included density mode in constructor/options (`density`, `densityScale`) and a `DensityGL` path.
- Current implementation has density rendering through the new `DensityLayer` and behavior/UI pipeline, not the legacy constructor/API shape.

4. Topographic density mode
- Legacy supported topographic density rendering (`topographic`).
- Current implementation has no topographic density mode.

5. Hyperbolic rendering mode
- Legacy exposed `hyperbolic` rendering option and shader path.
- Current implementation has no hyperbolic rendering mode option.

6. `BehaviorFilter` utility export
- Legacy exported `BehaviorFilter` from the package entrypoint.
- Current exports do not include an equivalent utility class.

## Demo/UI-level gaps

1. Multi-format upload in legacy demo
- Legacy demo accepted `.gml`, `.xnet`, `.gexf`, `.json` uploads.
- Current UI accepts `.xnet`, `.zxnet`, `.bxnet` only.

2. Legacy map-oriented demo
- Legacy included a map-focused example integrating `d3-geo` and `topojson` overlays.
- Current docs/examples are focused on the basic graph example and core renderer/UI workflows.

3. Large legacy public demo matrix
- Legacy README exposed many preconfigured demo links/variants (light/dark, 2D, additive, density, etc.).
- Current docs intentionally keep a smaller, maintainable example catalog.

## Notes

- Some legacy capabilities were intentionally replaced by the new architecture (WASM-backed `helios-network`, layered renderer, mapper/state pipeline), not accidentally removed.
- This list describes missing feature parity, not necessarily regressions for the new design goals.
- Legends and density are present in the current implementation. They are not listed as missing unless the gap is specifically about the old API shape or demo wiring.

## Evidence pointers

Legacy references:
- `for_reference/helios-web-older-for-reference/src/helios.js`
- `for_reference/helios-web-older-for-reference/src/core/HeliosCore.js`
- `for_reference/helios-web-older-for-reference/docs/example/script.js`
- `for_reference/helios-web-older-for-reference/docs/example/maps_script.js`
- `for_reference/helios-web-older-for-reference/README.md`

Current references:
- `src/index.js`
- `src/Helios.js`
- `src/ui/HeliosUI.js`
- `docs/HELIOS_WEB_NEXT_VS_LEGACY.md`
- `docs/README.md`
