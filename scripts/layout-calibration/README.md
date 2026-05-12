# Layout Calibration

This folder contains the offline calibration pipeline used to generate the
cheap runtime tuning model for the default linear `gpu-force` layout.

## What Gets Generated

`generate-layout-calibration.mjs` creates synthetic graph specs and copies a
bounded set of real `.xnet` networks into ignored working data:

- `data/generated/specs.json`
- `data/real-networks/`
- `data/real-networks/manifest.json`

The `data/` and `results/` folders are intentionally gitignored. Only scripts,
tests, docs, and the compact generated runtime model are tracked.

## Synthetic Networks

The synthetic sample covers representative, not exhaustive, combinations of:

- Node counts: `5`, `10`, `100`, `1000`, `10000`
- Average degree targets: `5`, `10`, `20`, `50`, clamped for tiny graphs
- ER: Erdos-Renyi-style random graphs across sparse and dense regimes
- BA: Barabasi-Albert preferential attachment, with `m ~= <k>/2`
- Watts-Strogatz: ring-lattice graphs with rewiring probabilities around
  `0.01`, `0.05`, and `0.2`
- SBM: stochastic block models with `C = 2`, `4`, or `10` communities where
  possible

Large sparse ER/SBM specs use target-edge sampling instead of all-pairs loops,
so generation remains practical for 10k-node calibration cases.

## Real Networks

The generator copies a bounded curated subset from:

- `/Users/filipinascimentosilva/Downloads/REDES`
- `/Users/filipinascimentosilva/Downloads/new-helios-web/helios-web-old/public/docs/example/networks`

The current preferred list includes small examples, airports, roads/spatial
networks, wiki/science networks, social/community graphs, and synthetic
large-network references such as BA, ER, and small-world `.xnet` files. The
copied files are local calibration inputs only and are not tracked.

## Calibration Runner

`run-layout-calibration.mjs` starts a local Vite server, opens
`calibration-page.html` in Playwright, creates each graph in the browser, and
runs the actual Helios GPU-force layout. It sweeps a compact candidate set for:

- `outputScale`

All other force parameters stay at their runtime defaults during calibration.
Each result records projected visual metrics after the layout has run.

## Scoring

The primary score is a sampled aesthetic score:

1. Read final layout positions from the actual GPU-force delegate.
2. Frame the network with the normal Helios camera.
3. Project nodes to screen space.
4. Measure edge visibility, edge-length uniformity, non-edge separation,
   sampled graph-distance stress, node overlap, viewport spread, and projected
   edge crossings.
5. Reward visibility and separation while penalizing stress, overlap, crossings,
   and excessive spread.

The expensive parts are bounded by samples, so the same scoring path works for
2D and 3D calibration runs without all-pairs layout statistics.

## Runtime Model

`fit-layout-model.mjs` selects the best output-scale candidate per graph and
fits a small regularized linear model over the log-scaled multiplier. The tracked
runtime artifact is:

`../../src/layouts/layoutTuningModel.generated.js`

At runtime the model is deliberately cheap. It uses:

- `nodeCount`
- `edgeCount`
- density
- average degree
- a bounded edge sample, when an edge view is already available, to estimate
  rough degree variance and isolate/component proxy features

It does not build full degree arrays, full connected components, or full
all-pairs statistics for large networks. Explicit `outputScale` always wins.
`layout.options.tuningModel = false` disables the generated model. UMAP force
mode and UMAP-flagged embedded-position graphs skip the generic model.

## Commands

```sh
npm run calibration:generate
npm run calibration:run
npm run calibration:fit
```

For faster checks:

```sh
node scripts/layout-calibration/generate-layout-calibration.mjs --smoke
node scripts/layout-calibration/run-layout-calibration.mjs --smoke --max-specs 1 --duration-ms 120
npm run test:e2e:layout-calibration
```
