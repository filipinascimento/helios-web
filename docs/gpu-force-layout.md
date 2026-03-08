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

### 4.1 Repulsion (sampled all-pairs approximation)

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

### 4.2 Spring attraction (edge-local)

For each neighbor `j` of `i` (optionally truncated by `maxNeighborsPerNode`):

- `delta = x_j - x_i`
- `dist = max(sqrt(dot(delta, delta)), minDistance)`
- `stretch = dist - linkDistance`
- unit direction `delta / dist`

Contribution:

`F_spring += delta * ((kAttraction * stretch / dist) / degreeNorm)`

with `degreeNorm = max(1, localNeighborLimit)`.

### 4.3 Gravity toward center

`F_gravity = kGravity * (center - x_i)`

In 2D, the `z` component is suppressed.

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
- `outputScale`: `6`
- `linkDistance`: `1`
- `kRepulsion`: `0.07`
- `kAttraction`: `0.62`
- `kGravity`: `0.00035`
- `eta`: `0.04`
- `damping`: `0.92`
- `maxStep`: `2.5`
- `minDistance`: `0.15`
- `alpha`: `1`
- `alphaDecay`: `0.001`
- `alphaTarget`: `0`
- `alphaMin`: `0.001`

Notes:

- `sampleCount` (if finite) overrides mode-specific sample counts.
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
- `helios.syncDelegatePositionsToNetwork()`

These are intended for inspection/export/manual synchronization workflows.

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

If movement stalls:

- increase `eta`
- increase `maxStep`
- reduce `damping` slightly

## 11. Current Limitations

- Topology preprocessing is still CPU-based.
- WebGL2 GPU compute requires `EXT_color_buffer_float`; otherwise it falls back to CPU simulation plus texture upload.
- `recenter` flag is currently reserved/not active in WGSL force step.
