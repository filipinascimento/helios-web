# Basic Example

This example mirrors the snippet in the main README and keeps the app setup
minimal:

1. Creates a `helios-network` instance.
2. Defines float attributes on nodes and edges.
3. Mutates buffers directly to assign random values.
4. Boots a `Helios` renderer with the GPU force layout.
5. Boots the standard Helios UI panels.
6. Opts into browser persistence for the example session.
7. Enables network file drag/drop on the visualization surface.

The source lives in [`docs/examples/basic/main.js`](./main.js). Start the Vite dev server and visit `http://localhost:5173` to see it in action.

Mapper, appearance, and edge defaults come from Helios internals rather than
example-specific setup.

### Layout controls

- The example now defaults to the GPU force layout.
- Pass `?layout=jitter` to switch back to the legacy jitter layout.
- Pass `?layout=d3force3d` to use the d3-force-3d worker layout.
- Pass `?layout=gpuforce` to run the GPU-force layout via a position delegate.
  - On WebGPU renderer, it uses the WebGPU backend.
  - On WebGL renderer, it uses the WebGL2 backend.
  - Small active sets now switch to exact all-pairs repulsion before the sample budget would otherwise kick in, which makes small lattices and grids much less noisy.
  - Topology sync now reads the live `edgesView` only after position-buffer lookup, so a late WASM allocation cannot stale the endpoint view used to build GPU-force adjacency.
  - Very small exact-repulsion runs now soften repulsion automatically, so tiny lattices do not blow apart as aggressively as large sampled runs.
  - GPU-force recenters active nodes around the configured layout center by default.
  - GPU-force also exposes a `Rotation damping` slider that removes fitted whole-graph spin without increasing global viscosity.
  - Pass `?forceNormalizationType=degree`, `strength`, `local-degree`, or `none` to exercise GPU-force normalization variants. The synthetic demo uses the `intensity` edge attribute for `strength`.
  - Missing startup positions are seeded deterministically around the center instead of randomly, which reduces the “spinning knot” startup on small graphs.
  - Delegate positions are automatic for GPU-force (no manual position-source toggle).
- In DevTools, use `await window.__snapshotDelegatePositions()` for full delegate inspection, `await window.__helios.snapshotNodeCentroid([0, 1, 2])` for narrow readback, and `await window.__syncDelegatePositionsToNetwork()` to copy delegate positions into network buffers.
- Pass `?mode=3d` to enable the depth axis; otherwise it runs in 2D.
- The example opts into persistence explicitly; library use keeps durable
  persistence off unless the developer enables it. Pass `?workspaceId=...` to
  isolate browser persistence for a demo run.
- Pass `?networkPersistence=0` or `?positionPersistence=0` to disable those
  persistence paths independently.
- Network and position autosave are enabled by default. Pass
  `?networkAutosave=0` or `?positionAutosave=0` to disable either path.
- Browser sessions are enabled by default. The example appends `sessionId` to
  the URL, accepts either `?sessionId=<id>` or `?session=<id>` for direct
  restore, and offers previous sessions from the resume prompt when no valid
  session is provided. Pass `?session=0` to disable this. Session network
  payloads default to `zxnet`; pass
  `?networkFormat=xnet` or another supported format to override this.
- Loading or dropping a network file starts a new session named after that
  network, so the previously open network remains available from the resume
  picker instead of being overwritten.
- The Network tab can load `.xnet`, `.zxnet`, `.bxnet`, and `.gml` files.
  GML export is available with a warning because GML cannot preserve every
  Helios-private setting or every attribute representation.
- The Filter panel uses funding-project-style categorical checklist controls
  with counts and `All` / `None` actions for categorical attributes.
- The example now requests weighted blended transparency for edges by default. Pass `?edgeTransparency=alpha` to compare against classic alpha blending, or use another supported mode explicitly. Weighted mode still falls back to alpha if unsupported.
- Pass `?interpolationDurationMode=adaptive` (default) to average recent layout update intervals for interpolation timing.
- Pass `?interpolationDurationMode=fixed&interpolationFixedDurationMs=160` to force a fixed interpolation interval.
- The example now includes a Camera panel with top-level zoom/distance control plus collapsible Auto Fit, Animation, and 3D Orbit sections, including an abstract auto-fit update-frequency control instead of raw milliseconds.
- The example also includes a Selection panel that owns the interaction demo: node click-selection, double-click selected-node camera follow, optional edge click/hover actions, shift-click multi-select, hover-only labels, optional hovered-node edge propagation, node-selection actions (`Clear`, `Expand Neighbors`, `Center`, rule-based add/replace), and selected/highlighted/normal state-style controls for both nodes and edges.
  - Regular labels are configured separately in the Labels tab as `Off`, `Auto Labels`, or `Selected Only`; the Selection panel defaults them to selected-only labels. Hover labels stay separate and reuse the same label styling options.
  - Click-only picking is specialized: if node hover, hover labels, and hover-connected-edges are all disabled, the demo keeps click picking enabled without running node-hover updates.
  - Hover labels also use a dedicated hovered-node label path instead of the normal ranked label-selection scan.
  - All Selection sub-sections now start collapsed, and the node-selector controls reuse the same rule editor implementation as the Filter panel.
- The Layout panel now reads a shared parameter-binding contract from the active layout instance, so each layout only shows controls it actually supports.
- D3-force and GPU-force expose a small recent-history alpha sparkline (sampled slowly, in log scale) in the panel, and the start/stop actions are available directly from that panel.
- Force magnitude controls such as repulsion, attraction, and gravity now use log sliders with scientific-notation inputs, and the old `Damping` label is exposed as `Velocity retention` to match the solver semantics.

### Performance history

Run the main-example performance history benchmark with:

```bash
npm run perf:history
```

The benchmark loads the default main example at 10k, 100k, and 1M nodes in the headed `chromium-webgpu-headed` Playwright project, requests the WebGPU renderer, samples rendering with the GPU layout running and stopped, times user-like pan/zoom/frame actions, records machine/build/date/browser/GPU metadata, and appends JSONL history to `artifacts/performance-history/helios-main-example.jsonl`.

Useful overrides:

```bash
HELIOS_PERF_NODE_COUNTS=10000,100000 npm run perf:history
HELIOS_PERF_HISTORY_FILE=/tmp/helios-perf.jsonl npm run perf:history
HELIOS_PERF_SAMPLE_MS=10000 npm run perf:history
```
