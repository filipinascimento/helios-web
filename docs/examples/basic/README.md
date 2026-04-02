# Basic Example

This example mirrors the snippet in the main README and exercises the mapper +
visuals flow that feeds indirect rendering directly from `helios-network` sparse/indexed buffers:

1. Creates a `helios-network` instance.
2. Defines float attributes on nodes and edges.
3. Mutates buffers directly to assign random values.
4. Boots a `Helios` renderer with the GPU force layout.
5. Maps the attributes to node and edge colors via `Mapper` descriptors.

The source lives in [`docs/examples/basic/main.js`](./main.js). Start the Vite dev server and visit `http://localhost:5173` to see it in action.

For details on how the node colors and sizes are mapped (including the colormap used in this example), see [`docs/MAPPERS.md`](../MAPPERS.md).

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
  - Missing startup positions are seeded deterministically around the center instead of randomly, which reduces the “spinning knot” startup on small graphs.
  - Delegate positions are automatic for GPU-force (no manual position-source toggle).
- In DevTools, use `await window.__snapshotDelegatePositions()` to inspect delegate positions, and `await window.__syncDelegatePositionsToNetwork()` to copy delegate positions into network buffers.
- Pass `?mode=3d` to enable the depth axis; otherwise it runs in 2D.
- Pass `?edgeTransparency=weighted` to enable weighted blended transparency for edges (falls back to alpha if unsupported; implemented as an offscreen accumulate + resolve pass).
- Pass `?interpolationDurationMode=adaptive` (default) to average recent layout update intervals for interpolation timing.
- Pass `?interpolationDurationMode=fixed&interpolationFixedDurationMs=160` to force a fixed interpolation interval.
- The example now includes a Camera panel with top-level zoom/distance control plus collapsible Auto Fit, Animation, and 3D Orbit sections, including an abstract auto-fit update-frequency control instead of raw milliseconds.
- The example also includes a Selection panel that owns the interaction demo: node click-selection, optional edge click/hover actions, shift-click multi-select, hover-only labels, optional hovered-node edge propagation, and selected/highlighted/normal state-style controls for both nodes and edges.
- The Layout panel now reads a shared parameter-binding contract from the active layout instance, so each layout only shows controls it actually supports.
- D3-force and GPU-force expose a small recent-history alpha sparkline (sampled slowly, in log scale) in the panel, and the start/stop actions are available directly from that panel.
- Force magnitude controls such as repulsion, attraction, and gravity now use log sliders with scientific-notation inputs, and the old `Damping` label is exposed as `Velocity retention` to match the solver semantics.
