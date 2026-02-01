# Basic Example

This example mirrors the snippet in the main README and exercises the mapper +
visuals flow that feeds dense buffers directly from `helios-network` each frame:

1. Creates a `helios-network` instance.
2. Defines float attributes on nodes and edges.
3. Mutates buffers directly to assign random values.
4. Boots a `Helios` renderer with the worker layout.
5. Maps the attributes to node and edge colors via `Mapper` descriptors.

The source lives in [`docs/examples/basic/main.js`](../../../for_reference/older-tests/main_debug_backup.js). Start the Vite dev server and visit `http://localhost:5173` to see it in action.

For details on how the node colors and sizes are mapped (including the colormap used in this example), see [`docs/MAPPERS.md`](../MAPPERS.md).

### Layout controls

- The example now defaults to a 3D-ready force-directed layout with Barnes–Hut repulsion and damping safeguards.
- Pass `?layout=jitter` to switch back to the legacy jitter layout.
- Pass `?layout=d3force3d` to use the d3-force-3d worker layout.
- Pass `?mode=3d` to enable the depth axis; otherwise it runs in 2D.
- Pass `?edgeTransparency=weighted` to enable weighted blended transparency for edges (falls back to alpha if unsupported; implemented as an offscreen accumulate + resolve pass).
