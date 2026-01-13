# GPU Layout Plan (WebGPU + WebGL2) — Helios “our approach”, scalable to ~2M nodes

This document sketches a plan for implementing a GPU-accelerated force-directed layout that works on both WebGPU and WebGL2 (fallback), while preserving Helios’ current layout philosophy (arbitrary force exponents, optional negative sampling, Barnes–Hut-style approximation).

It is meant as a “design + milestones” note so we can execute on it later.

## Goals

- Support **WebGPU** (preferred) and **WebGL2** (fallback) with one conceptual layout pipeline.
- Keep Helios layout controls (or a superset) including:
  - `repulsionExponent`, `attractionExponent`
  - Barnes–Hut-ish `theta`
  - caps/guards like `minDistance`, `maxForce`, `maxStep`, `damping`, `eta`
  - optional `negativeSampling` mode (to trade accuracy for speed)
- Make **~2M nodes feasible** by avoiding CPU↔GPU readbacks in the hot loop.
- Integrate with existing Helios scheduling (`scheduler.requestLayout`, visuals dirty flags) with minimal disruption.

## Non-goals (first cut)

- Perfect parity with the CPU `WorkerLayout` for every graph and parameter combination.
- 3D octree-quality repulsion at 2M on all devices (start with 2D as the “big data” mode).
- Handling pathological edge distributions (e.g. nodes with 100k+ neighbors) without additional approximations/sampling.

## Current state (relevant context in this repo)

- Layout runs on CPU in a Worker today (`src/layouts/Layout.js`, `src/workers/layoutWorker.js`).
  - It already has Barnes–Hut, “full” repulsion, and a negative-sampling option.
- Rendering already supports WebGPU and WebGL2 and picks WebGPU when available (`Future/multipass-api.md`).
- WebGPU performance notes for very large graphs exist (`Future/performance_webgpu_improvements.md`), including the suggestion to move WebGPU to instanced vertex buffers (to match the faster Safari/WebGL2 access pattern).
- cosmo-graph (in `for_reference/cosmo-graph/`) demonstrates a proven WebGL pattern:
  - Store per-node state in **float textures**.
  - Use **FBO ping-pong** for positions.
  - Compute forces in fragment shaders, sometimes leveraging multi-level “quadtree” textures with additive blending.

## Key design decision: avoid per-frame CPU position copies

The current `WorkerLayout.step()` copies `visuals.nodePositions` into a worker and copies results back. That will not scale to ~2M at interactive rates.

For a GPU layout to make sense at 2M, positions should stay on the GPU for simulation steps, and the renderer should consume them directly.

### Proposed integration approach (recommended)

- Introduce a new layout type: `GpuLayout` (name TBD), with backends:
  - `GpuLayoutWebGPU`
  - `GpuLayoutWebGL2`
  - fallback to `WorkerLayout`/`StaticLayout` if unsupported
- Add an optional “external position source” path to the graph renderer:
  - WebGPU: positions as a `GPUBuffer` (storage and/or vertex buffer).
  - WebGL2: positions as an `RGBA32F` texture (or two textures) sampled in vertex shader.
- Maintain a CPU mirror of positions only when needed:
  - read back infrequently (e.g. on pause, on-demand, or every N frames)
  - or only for small graphs / debugging.

This keeps the public mental model (“layout writes positions”) but changes the plumbing so the write happens on GPU.

## Quick pipeline (GPU sim owns positions; CPU sync is rare)

For large graphs, the fast path should be: **GPU computes positions and the renderer reads them directly**, without copying 2M floats through JS each tick.

### One-time / on graph change (CPU/WASM → GPU)

- Build or update static-ish data:
  - adjacency (CSR / neighbor lists) for attraction
  - per-node flags (pinned/active) and coefficients (mass/charge)
  - layout constants
- Allocate GPU state:
  - WebGPU: `positionBuffer`, `velocityBuffer` (and optional `forceBuffer`), plus repulsion index resources
  - WebGL2: ping-pong position textures (+ velocity texture) and repulsion level FBOs

### Per tick (GPU only)

- Repulsion + attraction + gravity + integrate on GPU.
- Render using the same GPU-resident position resource:
  - WebGPU: ideally via instanced vertex buffers (Safari-friendly), or storage-buffer fetch as a first cut
  - WebGL2: sample positions from float textures in the vertex shader

### Optional / infrequent CPU readback (rare)

Read back GPU positions only when needed:
- export / snapshot
- CPU-only algorithms that truly require positions
- debugging

Good defaults are “on pause”, “on explicit request”, or a low cadence (e.g. every 0.5–2s), not every frame.

## Synchronization model (dirty/versioned, pull-based)

Treat “node positions” as having two possible authorities:

- `positionsSource = 'gpu'`: GPU sim is authoritative; CPU `visuals.nodePositions` may be stale.
- `positionsSource = 'cpu'`: CPU is authoritative (small graphs / debugging / manual edits).

Recommended rules:

- If `positionsSource === 'gpu'`, the renderer consumes GPU positions directly and no per-frame CPU update occurs.
- If the user/host code sets positions on the CPU (or a CPU layout runs), mark positions dirty and upload once to GPU, then continue GPU sim.
- If a consumer asks for CPU positions while `positionsSource === 'gpu'`, do a batched readback and update `visuals.nodePositions` (pull model).

Implementation detail that helps correctness/perf:
- track `positionsVersionCpu` and `positionsVersionGpu`
- re-upload/re-read only when the corresponding version changes or on explicit sync requests

## Topology changes (add/remove nodes/edges) while `positionsSource = 'gpu'`

Positions do not become “invalid” just because the graph topology changes. What changes is which nodes/edges participate and which GPU-side auxiliary structures must be rebuilt.

### Add nodes

- Prefer **capacity-based allocation**: allocate GPU arrays to `nodeCapacity`, not exact `nodeCount`, so adding nodes doesn’t force a full reallocation every time.
- Initialize new nodes’ GPU state:
  - set position (seed near center / random bounds / neighbor-biased seed),
  - set velocity to zero,
  - set flags (active/pinned).
- Rebuild or patch attraction data (CSR):
  - simplest: rebuild CSR in CPU/WASM and re-upload,
  - later: support incremental append in CSR builder.
- Repulsion index:
  - 2D grid pyramid: typically rebuilt every tick (or every N ticks), so no special handling beyond including new active nodes,
  - 3D tree: mark “tree dirty” and rebuild on the next scheduled rebuild cadence.

### Remove nodes

- Avoid frequent shrinking/compaction for large graphs; it is expensive and destabilizes indices.
- Prefer marking nodes inactive (`flags.active = 0`) so both simulation and rendering skip them.
- Run compaction rarely (explicit “pack” operation) if reclaiming memory or densifying indices becomes important.

### Change edges

- Positions remain valid; only attraction inputs change.
- Rebuild/patch CSR and continue; consider throttling CSR rebuilds if edges update frequently.

## Execution context constraints (do these need the same context?)

For zero-copy sharing of positions, **GPU simulation and GPU rendering must run on the same GPU context/device**:

- WebGPU: same `GPUDevice` (and same `GPUQueue`) for the simulation buffers/textures and render pipelines.
- WebGL2: same `WebGL2RenderingContext` for the textures/FBOs and draw calls.

CPU/WASM preprocessing (CSR build, Morton keys, sorting, tree building) can run on the main thread or in a Worker, but the resulting typed arrays must be uploaded into the same rendering/simulation context.

## Data model (GPU-friendly)

### Per-node state (minimum)

- `position`: `vec2` (2D) or `vec3` (3D)
- `velocity`: `vec2`/`vec3`
- `mass` or `charge` (optional per-node coefficient)
- `flags`: pinned/locked, active/inactive

For WebGPU buffers, align to 16 bytes for performance (e.g. store `vec4<f32>` and pack extra fields).
For WebGL2, prefer a single `RGBA32F` texture per array (position, velocity, flags) to keep shaders simple.

### Edges (for attraction)

Attraction needs an adjacency structure that is readable efficiently on GPU:

- Use a CSR-like representation:
  - `nodeEdgeStart[node]` and `nodeEdgeCount[node]`
  - `neighbors[edgeIndex]` (target id)
  - optional per-edge weights/strengths

WebGPU: store CSR arrays in storage buffers.
WebGL2: store CSR arrays in float textures (or integer textures if reliably available), similar to cosmo-graph’s `linkInfoTexture` + `linkIndicesTexture`.

Important: WebGL fragment/vertex shaders need bounded loops; we’ll need either:
- a compile-time `MAX_DEGREE` cap (like cosmo-graph does), plus sampling for high-degree nodes, or
- multi-pass processing (“process neighbors in batches of K per frame”), or
- a hybrid (exact for low degree, sampled for high degree).

## Forces: what we compute on GPU

We want the same conceptual force decomposition the worker uses today:

1) **Repulsion** (dominant cost)
2) **Attraction** along edges
3) **Gravity / centering**
4) Integrate (damping, step caps)
5) Optional recenter / center-of-mass correction

### Arbitrary exponents without killing performance

`pow(dist, exponent)`-style math can be expensive, especially in WebGL. Options:

- **Shader variants**: generate/compile a small set of exponent-specialized shaders where exponent is a compile-time constant (`#define REP_EXP 2.0`), and switch pipelines when the exponent changes.
  - Common fast paths: 0.5, 1, 2, 3 (and maybe 4).
- **Approximate pow**: use `exp2(exponent * log2(x))` where supported; or polynomial approximations for a narrow exponent range.
- **Quantize exponent**: accept a discrete set for GPU mode, while keeping CPU layout fully general (this is a product decision).

Plan: start with shader variants for a small set and fall back to uniform `pow` if needed.

## Repulsion acceleration (Barnes–Hut-like) on GPU

All-pairs repulsion is impossible at 2M. We need an approximation.

### 2D: multilevel grid / quadtree textures (proven)

Borrow the core idea from cosmo-graph:

- Define a simulation “space size” (square domain) and map positions into it.
- Build multiple levels of a grid where each cell stores:
  - sum of positions: `sumX`, `sumY`
  - mass/count: `m`
- Then, for each node, approximate far-field repulsion using cells instead of individual nodes.

There are two usable strategies:

1) **“Sum over levels” (cheap, no recursion)**:
   - For each level `L`, evaluate repulsion from all cells in that level (or a subset of cells around the node).
   - Add contributions across levels.
   - This is closer to a multi-resolution potential approximation than strict Barnes–Hut, but is simple and parallel.

2) **Barnes–Hut traversal (more accurate, more control flow)**:
   - Do a bounded-depth traversal with a `theta` acceptance criterion.
   - In WebGL this usually means “generate unrolled recursion” (cosmo-graph does this by codegen).
   - In WebGPU we can do explicit loops; still needs careful bounds for performance.

Plan: implement #1 first for stability/perf, then add #2 if quality requires it.

### WebGPU implementation sketch (repulsion)

- **Pass A: clear level buffers**
- **Pass B: splat nodes into the finest grid**
  - each node writes into a cell accumulator
  - this ideally needs atomics; WebGPU supports atomics on integers, not float everywhere
  - workaround: use fixed-point integers for `sumX`, `sumY`, `m` (scaled), or do a radix/binning approach
- **Pass C: reduce to coarser levels**
  - compute parent cells by summing 4 child cells (pure compute, no atomics)
- **Pass D: per-node repulsion force**
  - sample a bounded region of cells per level (or BH-style accept/reject)

Atomics are the main complication; we should decide early whether:
- we accept a “texture-like” pipeline in WebGPU too (render passes writing to textures, using blending-like accumulation), or
- we do fixed-point atomics, or
- we do sorting/binning (more complex, potentially fastest long-term).

### WebGL2 implementation sketch (repulsion)

- Use `RGBA32F` FBOs per level.
- Use additive blending (`ONE, ONE`) to accumulate `sumX,sumY,m` into cells (as cosmo-graph does).
- Run one full-screen pass per level to compute repulsion contribution into a velocity/force texture.

This is the most direct path to a reliable WebGL2 fallback, because it uses mature GPU features (textures + blending + FBO ping-pong).

## Attraction (edges) on GPU

At 2M nodes, attraction cost is dominated by total edges and degree distribution.

### WebGPU

Two viable patterns:

- **Node-parallel**: each node iterates its neighbor list (CSR), accumulates force locally.
  - Pros: no atomics needed.
  - Cons: loop length varies; needs degree cap or batching.
- **Edge-parallel**: each edge computes its contribution and atomically adds to both endpoints.
  - Pros: work scales with edge count.
  - Cons: needs float atomics or fixed-point atomics; contention on hubs.

Plan: start with node-parallel + degree cap/sampling for “web” graphs; consider edge-parallel only if WebGPU float atomics become viable (or with fixed-point).

### WebGL2

Node-parallel only, with a compile-time `MAX_DEGREE` (or batched passes). This mirrors cosmo-graph’s approach.

## Integration / timestep / stability

### Integration method

We can keep the worker’s semantics:

- accumulate `force`
- update `velocity = damping * velocity + eta * force`
- clamp `velocity`/`step`
- `position += velocity`

Alternatively, adopt a Verlet-style scheme (cosmo-graph keeps previous positions) which can be stable and avoids storing velocity explicitly. Either is fine; the choice affects interoperability with current parameters.

Plan: implement the worker-like velocity integrator first to preserve parameter meaning.

### Bounding and recentring

- Keep a finite simulation domain (for quadtree levels) and soft-wrap or clamp nodes when they drift too far.
- Recenter can be computed approximately:
  - WebGL2: reduce centroid by rendering to a 1×1 FBO (multi-pass reduction).
  - WebGPU: parallel reduction in compute.

## Scaling to ~2M: practical constraints & knobs

### Memory budget (ballpark)

2M nodes, 2D:
- positions: 2M × 16B (vec4) ≈ 32MB
- velocities: ≈ 32MB
- flags/mass: 8–32MB depending on packing

2M nodes, 3D:
- expect ~1.5×–2× the above.

WebGL2 textures:
- capacity uses `T×T` texels; 2M requires `T=2048` (4.2M texels).
- one `RGBA32F` texture at 2048² is ~2048² × 16B ≈ 67MB.
  - so we must keep texture count low (e.g. 2–3 big textures, not 10).

This strongly suggests: for 2M, prefer 2D and minimize per-node texture count.

Important feasibility note for the “implicit quadtree” (2D grid pyramid):

- Don’t mirror cosmo-graph’s “one texture per level up to `spaceSize×spaceSize`” naively for 2M cases; the largest levels can become enormous.
- Instead, cap the finest grid resolution (e.g. 512² or 1024²), build that level from nodes, then build coarser levels by reduction.
- This trades some accuracy for a large reduction in memory/bandwidth, and is usually the right call for 2M-scale interactive layouts.

### Known “gotchas”

- WebGL2 float texture requirements vary (extensions / platform quirks).
- WebGPU on Safari can have higher per-pass overhead (see `Future/performance_webgpu_improvements.md`).
- Loop bounds in shaders matter a lot; “unbounded neighbor loops” are a non-starter.

## Milestones (so we can implement incrementally)

1) **API + plumbing**
   - Add a `GpuLayout` option and a renderer hook for “external positions” (no simulation yet).
   - Goal: render positions from a GPU resource without going through `visuals.nodePositions`.

2) **WebGPU 2D simulation prototype**
   - Integrator + gravity/centering + simple repulsion approximation (even if crude).
   - Validate stability and that render stays GPU-only.

3) **WebGL2 fallback prototype**
   - Ping-pong position textures + velocity texture.
   - Implement repulsion using a multi-level grid with additive blending (cosmo-style).

4) **Add edge attraction**
   - Start with bounded-degree graphs / sampling.
   - Add CPU preprocessing to build CSR buffers/textures.

5) **Quality + performance tuning**
   - Exponent shader variants.
   - Better repulsion approximation (BH traversal if needed).
   - Parameter mapping so UI controls match existing behavior.

6) **2M validation scenario**
   - Add a dedicated “stress” fixture/demo mode (not necessarily in default docs demo).
   - Add measurement hooks and a “not blank / interactive” Playwright check (tolerant).

## Concrete implementation plan (with `helios-network` subplan)

This is a suggested ordering that keeps WebGL2 feasibility in mind (2D-first) while laying groundwork for WebGPU 3D.

### Phase A — `helios-web-next` (plumbing + 2D GPU layout)

- Add a `GpuLayout` mode that can provide a “position source” to the renderer (buffer/texture), and make the renderer prefer it when present.
- Implement WebGL2 2D simulation using ping-pong float textures + a capped-resolution grid pyramid repulsion.
- Implement WebGPU 2D simulation with equivalent math (compute preferred).
- Add topology-change handling (capacity + active flags + CSR rebuild hooks) without forcing per-frame CPU sync.

### Phase B — `helios-network` (enablers for performance + 3D WebGPU)

- Implement the checklist items below behind versioned, zero-copy views so JS can upload only when needed.
- Prioritize: quantization + Morton keys → radix sort → CSR builder → (optional) flat-tree builder.

### Phase C — WebGPU 3D (optional, WebGPU-only at large N)

- Use Morton sort + flat-tree (LBVH-ish) from `helios-network`.
- Traverse tree in WebGPU compute with `theta`; keep WebGL2 fallback as 2D/2.5D or CPU worker 3D.

## Open questions / decisions to make before coding

- Do we accept “GPU layout mode” having a limited set of exponent values (for shader specialization), or must it be fully continuous?
  - R. Yes, that is fine. We could have different shader pipelines for common exponents (0.5, 1, 1.5, 2).
- Is 2M a hard requirement for **render + layout simultaneously**, or is it acceptable to:
  - render 2M but layout only a subset (“active” nodes), or
  - layout offline then render static? It could be later on.
  - R. let's aim for full 2M first. We can always add “active subset” optimizations later.
- How should positions be shared between layout and renderer?
  - unify on WebGPU instanced vertex buffers (recommended long-term)
  - or keep renderer’s current “dense attribute buffers” and add an override just for positions
- For WebGPU repulsion accumulation: do we commit to fixed-point atomics, or use a render-pass accumulation trick to avoid atomics?

## Summary: recommended approach so far (2D + 3D)

### 2D (the “2M mode”, WebGPU + WebGL2)

- Use an **implicit quadtree**: a pyramid of 2D grid levels storing `sumX,sumY,mass` (cosmo-graph style).
  - WebGL2: build levels by drawing points into per-level FBOs with **additive blending** (scatter-add via blending), then compute forces in fullscreen passes.
  - WebGPU: same conceptual levels, but prefer compute passes; a render-pass accumulation path can be used early if it reduces implementation risk.
- Keep Helios force semantics but expect to use **shader variants** for common exponent values to avoid slow `pow` in hot loops.
- Add a Barnes–Hut-ish `theta` acceptance mode as a higher-quality option:
  - WebGL2: codegen/unrolled traversal (cosmo-graph’s `ForceManyBodyQuadtree` pattern).
  - WebGPU: bounded loops in compute.

### 3D (WebGPU-first; WebGL2 fallback is limited)

- A true “implicit octree” (3D grid pyramid) is conceptually possible but usually not practical at large N:
  - memory and bandwidth grow quickly (`O(res^3)` per level),
  - WebGL2 cannot implement the same 3D accumulation trick cleanly.
- Prefer a **flat octree / BVH built from Morton sort (LBVH-ish)**:
  - build keys + sort + hierarchy (start with CPU/WASM), upload flat arrays to WebGPU, traverse with `theta`.
  - WebGL2 fallback for large 3D is likely “2.5D” (2D repulsion + mild Z forces) or CPU Worker 3D for smaller graphs.

## cosmo-graph’s acceleration trick (how it “builds a quadtree” fast)

cosmo-graph does not build a pointer-based quadtree on CPU. It builds an implicit hierarchy on GPU each tick:

- For each level:
  - clear the level FBO,
  - render all points into that FBO with additive blending so each cell accumulates `sumX,sumY,mass`.
- Then sample these level textures to approximate repulsion, optionally using a `theta`-gated traversal implemented via shader codegen/unrolled loops.

This is fast on WebGL because it uses textures + blending (no compute and no float atomics required).

## `helios-network` (C/WASM) implementation checklist

These items directly support GPU layout (especially 3D/WebGPU) and reduce JS overhead.

### Spatial keys + sorting

1) **Quantization helpers (2D + 3D)**
   - Map positions into a stable integer domain (center/extent or min/max → integer coords).
   - Provide consistent handling for out-of-bounds / NaNs (clamp or sentinel).

2) **Morton key generation**
   - 2D: `u32` keys.
   - 3D: `u64` keys (exposed as two `u32`s).

3) **Radix sort**
   - Sort Morton keys + produce `sortedIndices[u32]`.
   - Optional: `inversePermutation[u32]` to remap per-node arrays efficiently.

4) **Rebuild cadence hooks**
   - Allow callers to rebuild keys only, keys+sort, or full tree at a chosen cadence (every N ticks / when displacement exceeds a threshold).

### Flat tree (3D) construction

5) **LBVH-ish tree builder from Morton-sorted points**
   - Output a flat, GPU-uploadable structure (SoA preferred, 16-byte aligned) with:
     - node ranges / child pointers,
     - `mass` and `centerOfMass`,
     - optional AABBs (useful for `theta` and stability).

6) **Aggregation utilities**
   - Compute global centroid / total mass for recentring and bounding (useful for both CPU and GPU pipelines).

### Edges for attraction

7) **CSR adjacency build optimized for GPU**
   - Build `nodeEdgeStart[u32]`, `nodeEdgeCount[u32]`, `neighbors[u32]`.
   - Optional: `edgeWeight[f32]`, `maxDegree`, and a “clamped degree” neighbor list for WebGL bounded loops.

### Zero-copy + versions

8) **Versioned dense views for new buffers**
   - Expose stable pointers + versions for: Morton keys, sorted indices, CSR arrays, and tree arrays.
   - Make it cheap for JS to detect “needs re-upload to GPU”.
