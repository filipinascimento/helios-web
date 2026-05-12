# GPU Force Layout (WebGPU + WebGL2) - Implementation Notes

This document describes the current `gpu-force` layout implementation in Helios Web Next:

- algorithm and equations
- parameter semantics
- what runs on GPU vs CPU
- how position ownership/synchronization works

The implementation is centered around:

- `src/layouts/GpuForceLayout.js`
- `src/delegates/GpuForcePositionDelegate.js`
- `src/rendering/engine/GraphLayer.js`
- `src/rendering/engine/GraphLayerWebGPU.js`
- `src/Helios.js`

## 1. High-level Architecture

`GpuForceLayout` is a layout wrapper that delegates position evolution to `GpuForcePositionDelegate`.

At runtime, the delegate:

1. Builds a topology payload on CPU when topology changes.
2. Uploads that payload to either WebGPU storage buffers or WebGL2 textures.
3. Runs a GPU simulation step each layout tick:
   - WebGPU: compute shader passes over storage buffers.
   - WebGL2: fragment-shader passes over float textures with MRT ping-pong.
4. Exposes a GPU position resource directly to the renderer:
   - WebGPU position buffer, or
   - WebGL2 position texture.

If WebGL2 float render targets are unavailable, the delegate falls back to the older CPU simulation + texture upload path.

## 2. Data Flow by Stage

### 2.1 Topology sync (CPU -> GPU, on topology/version changes)

On synchronization, CPU builds:

- active node set (`activeIds`, `activeMask`)
- adjacency (`neighborStarts`, `neighborCounts`, `neighbors`)
- seeded positions (`packedPositions`)
- output-visible seeded positions (`packedOutputPositions`)

Then it uploads these arrays to GPU resources:

- WebGPU storage buffers, or
- WebGL2 integer/float textures.

This stage is CPU-heavy by design because topology extraction and adjacency construction currently happen from network views on CPU.

### 2.2 Simulation step (GPU compute, per tick)

Each step executes GPU force integration and produces render-space positions:

- WebGPU: compute pass(es) over storage buffers.
- WebGL2: fragment-shader pass(es) over textures, with MRT outputs for
  simulation positions, velocities, and render-space positions.
- When `recenter` is enabled, a follow-up correction pass recenters the active
  set and can optionally damp fitted rigid-body rotation via `rotationDamping`.

No per-node force math is done on CPU.

### 2.3 Rendering (GPU -> GPU)

The graph layer resolves delegate-provided GPU position resources and binds them directly for drawing.

When a delegate GPU resource exists, the renderer does not upload CPU position views for node positions.

## 3. GPU Resources Used by the Compute Backend

WebGPU path:

- `positionBuffer` (simulation-space positions)
- `outputPositionBuffer` (render-space positions)
- `velocityBuffer`
- `scratchPositionBuffer`
- `scratchVelocityBuffer`
- `activeIdsBuffer`
- `activeMaskBuffer`
- `neighborStartsBuffer`
- `neighborCountsBuffer`
- `neighborsBuffer`
- `paramsBuffer` (uniforms for force step)
- `outputScaleParamsBuffer` (uniforms for output-scale pass)

WebGL2 path:

- ping-pong simulation position textures
- ping-pong velocity textures
- output position texture consumed directly by the renderer
- integer topology textures for active IDs, active mask, neighbor starts/counts, and neighbors
- reduction textures used for optional recentering

## 4. Force Model and Equations

For each active node `i`, total force is:

`F_i = F_repulsion_i + F_spring_i + F_gravity_i`

with velocity-position update:

- `v_i(next) = damping * v_i + eta * F_i`
- cap speed: `|v_i(next)| <= maxStep`
- `x_i(next) = x_i + v_i(next)`

In 2D mode:

- `z` velocity is forced to `0`
- position `z` is clamped to `center.z`

### 4.0 Default layout tuning model

The default linear `gpu-force` layout applies a compact generated tuning model
before the delegate is created. The model estimates graph features such as node
count, edge density, average degree, degree variance, and component structure,
then adjusts only `outputScale`. Force parameters such as `linkDistance`,
`minDistance`, `kRepulsion`, `kAttraction`, and `kGravity` stay at their normal
defaults unless the developer explicitly sets them.

This is primarily meant to keep small and moderately dense graphs from starting
with node disks so close together that connected edges are hidden. Explicit
layout options always win:

```js
new Helios(network, {
  container,
  layout: {
    type: 'gpu-force',
    options: {
      outputScale: 10,
    },
  },
});
```

Disable the generated model with:

```js
new Helios(network, {
  container,
  layout: {
    type: 'gpu-force',
    options: { tuningModel: false },
  },
});
```

Custom model functions can be supplied as `tuningModel`. They receive the
extracted feature object and base options, and return partial layout options.
UMAP force mode and UMAP-flagged embedded graphs skip the generic tuning model
because they are driven by exported UMAP parameters and graph metadata.

### 4.1 UMAP-gated mode selection

The default `gpu-force` behavior is unchanged. Helios only switches into the
UMAP-specific force law when all of the following are true:

- the graph-level network attribute `umap` is truthy (`1`, `true`, `yes`, `on`)
- the graph exposes the required edge-weight attribute
- the layout was not explicitly forced back to the legacy linear model

Expected network metadata:

- `umap=true`
- `umap_edge_weight_attr="umap_weight"` unless overridden
- `umap_node_mass_attr="umap_mass"` when explicit node masses are available
- `umap_a`, `umap_b`, `umap_gamma`, `umap_negative_sample_rate`

Expected per-element attributes:

- edge attribute `umap_weight`
- optional node attribute `umap_mass`

When UMAP mode is active:

- `kAttraction` becomes attraction importance
- `kRepulsion` becomes repulsion importance
- `kGravity` is still available, but the UMAP default is `0`
- `umapNegativeSampleRate` becomes the repulsion sampling control
- `sampleChurn` remains available as negative-sample churn for the interactive solver
- `linkDistance` and exposed `minDistance` tuning are hidden because the force
  law is driven by the exported UMAP parameters instead

### 4.2 Linear force normalization specializations

The non-UMAP linear force model keeps the legacy local-degree normalization by
default. `forceNormalizationType` selects the denominator used for spring
attraction:

- `local-degree`: divide by the sampled/truncated neighbor count for the current
  node. This is the default and keeps the previous GPU-force behavior.
- `degree`: divide by `max(1, min(degree(source), degree(target)))`, using the
  full adjacency counts already uploaded for layout topology.
- `strength`: divide by `max(1, min(strength(source), strength(target)))`.
  Strength is maintained by `helios-network` as an internal sparse node buffer
  derived from the configured edge weights.
- `none`: use no normalization denominator.

For non-UMAP linear attraction, `edgeWeightAttribute` is now reused as a spring
weight source. If it is absent, every edge has weight `1`. If it is present,
the shader reads edge weights indirectly through per-neighbor edge ids, and
the strength buffer sums those same weights for each endpoint. Layout metrics
ignore self-loops and treat directed edges as contributing to both endpoints,
matching the current d3-force-3d convention used by the layout.

For the real exported demo fixtures in `docs/examples/basic`, use:

- `/?nodes=200&mode=2d&renderer=webgpu&layout=gpuforce&dataset=umap-export`
- `/?nodes=2000&mode=2d&renderer=webgpu&layout=gpuforce&dataset=umap-export`
- `/?nodes=20000&mode=2d&renderer=webgpu&layout=gpuforce&dataset=umap-export`

These assets are graph-only UMAP exports. They intentionally omit
`umap_embedding` and `_helios_visuals_position`, so the interactive GPU layout
starts from Helios seeding rather than from a finished offline embedding.

### 4.3 Repulsion (sampled all-pairs approximation)

For each sampled other node `j`:

- `delta = x_i - x_j`
- `dist2 = max(dot(delta, delta), minDistance^2)`
- contribution scales as `delta / dist^(3/2)`

Implemented form:

`F_rep += delta * (kRepulsion * repulsionNormalization * invDist^3)`

where:

- `invDist = 1 / sqrt(dist2)`
- `repulsionNormalization = max(1, activeCount / sampleCount)`

Sampling is hash-based and deterministic for a fixed seed when `sampleChurn = 0`.
With `sampleChurn > 0`, a fraction of repulsion sample slots is progressively
refreshed each step; `0` keeps the sampled set fixed and `1` refreshes all
sample slots every step.

### 4.4 Spring attraction (edge-local)

For each neighbor `j` of `i` (optionally truncated by `maxNeighborsPerNode`):

- `delta = x_j - x_i`
- `dist = max(sqrt(dot(delta, delta)), minDistance)`
- `stretch = dist - linkDistance`
- unit direction `delta / dist`

Contribution:

`F_spring += delta * ((kAttraction * stretch / dist) / degreeNorm)`

with `degreeNorm = max(1, localNeighborLimit)`.

### 4.5 Gravity toward center

`F_gravity = kGravity * (center - x_i)`

In 2D, the `z` component is suppressed.

### 4.6 Post-step rigid rotation damping

After the main force update, the optional recenter pass estimates a coarse
rigid-body angular velocity from the active-set positions and per-step motion
vectors, then subtracts that rotational component:

- `omega ~= sum(cross(r_i, delta_i)) / sum(dot(r_i, r_i))`
- `delta_i(corrected) = delta_i - rotationDamping * cross(omega, r_i)`

where `r_i` is the node position relative to the active-set centroid after
recentering, and `delta_i` is the stored per-step motion vector (`velocity` for
the linear solver, step displacement for the UMAP solver).

The default `rotationDamping = 0.6` removes most fitted rigid-body spin.
`rotationDamping = 0` disables the correction. `rotationDamping = 1` removes
the full fitted rigid spin for that step.

When disabled, the backend uses the simpler centroid-only recenter path and
skips the extra angular-reduction work entirely.

### 4.7 UMAP repulsion and attraction

When `forceModel === 'umap'`, the delegate keeps the same GPU execution path
but swaps in UMAP-style edge attraction and negative-sampling repulsion using
the exported graph attributes:

- repulsion uses `umap_mass`, `umap_gamma`, and `umap_negative_sample_rate`
- attraction uses edge-local `umap_weight`
- `umap_a` and `umap_b` control the distance curve
- `kRepulsion` and `kAttraction` are extra importance multipliers, not aliases for `umap_a` / `umap_b`
- interactive negative sampling uses `umapNegativeSampleRate` as the sampled-repulsion count
- `sampleChurn` is still valid here, but it is an interactive Helios control rather than a canonical `umap-learn` parameter

This applies consistently across:

- WebGPU compute
- WebGL2 shader compute
- the CPU fallback used when WebGL2 float render targets are unavailable

## 5. Integrator Controls Applied in JS Before GPU Step

Per tick, JS computes:

- `dt = clamp(deltaMs * 0.001, 0.008, 0.08)`
- `dtScale = dt * 60`

and sends:

- `kRepulsion * alpha`
- `kAttraction * alpha`
- `kGravity * alpha`
- `eta * dtScale`
- `maxStep * dtScale`

`alpha` follows:

`alpha += (alphaTarget - alpha) * alphaDecay`, then clamped by `alphaMin`.

This provides annealing-like behavior without changing shader structure.

## 6. Output Scaling and Compatibility with Existing Input Positions

The solver can run in an internal scale while exposing a larger render scale via `outputScale`.

Render-space mapping:

`x_out = center + outputScale * (x_sim - center)`

### Important behavior for existing seeds

When topology is synchronized and input positions already exist:

- simulation seed is normalized:
  `x_sim_seed = center + (x_seed - center) / outputScale`
- output buffer seed remains at original:
  `x_out_seed = x_seed`

This avoids first-frame jumps while keeping internal solver scale consistent.

## 7. Parameter Reference (Current Defaults)

From `GpuForceLayout` / `GpuForcePositionDelegate`:

- `mode`: `'2d'` or `'3d'` (default `'2d'`)
- `center`: `[0, 0, 0]`
- `radius`: `220` (seed spread)
- `depth`: `140` (3D seed spread)
- `sampleCount`: `null` (explicit override)
- `sampleCount2D`: `64`
- `sampleCount3D`: `96`
- `sampleChurn`: `0`
- `maxNeighborsPerNode`: `64`
- `outputScale`: `6.5`
- `linkDistance`: `1`
- `kRepulsion`: `1`
- `kAttraction`: `0.62`
- `kGravity`: `0.001`
- `edgeWeightAttribute`: `null`
- `forceNormalizationType`: `'local-degree'`
- `eta`: `0.4`
- `damping`: `0.82`
- `maxStep`: `2.5`
- `minDistance`: `0.15`
- `alpha`: `1`
- `alphaDecay`: `0.005`
- `alphaTarget`: `0`
- `alphaMin`: `0.001`
- `umapA`: `1.5769434601962196`
- `umapB`: `0.8950608779914887`
- `umapGamma`: `1`
- `umapNegativeSampleRate`: `5`

Notes:

- `sampleCount` (if finite) overrides mode-specific sample counts.
- In UMAP mode, `sampleCount2D/3D` is ignored and repulsion sampling is derived from `umapNegativeSampleRate` instead.
- In UMAP mode, `sampleChurn` means negative-sample churn for the interactive approximation.
- In UMAP mode, `kGravity` defaults to `0` unless explicitly overridden.
- `recenter` is currently plumbed in uniforms but not used by the WGSL step logic.

## 8. GPU vs CPU Responsibility Matrix

GPU responsibilities:

- per-node repulsion/spring/gravity force computation
- velocity integration and step clamping
- output-scale transformation pass
- direct rendering consumption of delegate position buffer

CPU responsibilities:

- topology extraction from network buffers
- adjacency list build (`neighborStarts/counts/neighbors`)
- parameter/command encoding and queue submission each tick
- optional readback/sync methods

### CPU readback/transfer policy

Normal GPU delegate rendering path:

- no required per-frame CPU copy of node positions

Explicit APIs that perform GPU -> CPU (or CPU writeback):

- `helios.snapshotDelegatePositions()`
- `helios.snapshotNodePosition(nodeId, { out })`
- `helios.snapshotNodePositions(nodeIds, { out })`
- `helios.snapshotNodeCentroid(nodeIds, { out })`
- `helios.syncDelegatePositionsToNetwork()`

The node-specific APIs use delegate-owned reusable staging buffers where possible,
so selection, camera follow, and hovered/selected labels do not need a full
position snapshot while a GPU layout is running. The full snapshot API remains
intended for inspection/export/manual synchronization workflows.

## 9. Position Ownership in Delegate Mode

When `positions({ source: 'delegate' })` is active:

- layout positions are owned by the delegate resource
- renderer resolves delegate GPU resources first
- layout update handling skips CPU position snapshots for interpolation prep

This keeps the hot path GPU-resident.

## 10. Practical Tuning Guidance

If the layout looks too compact:

- increase `outputScale` first (visual/world scale)

If topology quality is poor (locality collapse):

- avoid only scaling all physical coefficients together
- tune attraction/repulsion balance first, then gravity

If convergence is too noisy:

- increase `sampleCount2D/3D`
- reduce `eta`
- slightly increase `damping`

If UMAP mode is too noisy:

- increase `umapNegativeSampleRate`
- reduce `eta`
- slightly increase `damping`
- lower `sampleChurn` if the negative samples are refreshing too aggressively

If movement stalls:

- increase `eta`
- increase `maxStep`
- reduce `damping` slightly

## 11. Current Limitations

- Topology preprocessing is still CPU-based.
- WebGL2 GPU compute requires `EXT_color_buffer_float`; otherwise it falls back to CPU simulation plus texture upload.
- `recenter` flag is currently reserved/not active in WGSL force step.
