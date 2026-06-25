# GPU-Side Position Interpolation / Smoothing (WebGPU + WebGL2)

This note captures options for making node motion appear smooth when the **layout updates are slow or bursty** (e.g. seconds between stable states, or worker ticks arriving irregularly).

The goal is to preserve a fast renderer while reducing “choppy” motion from discrete position snapshots.

## Problem statement

- Today, layouts write `_helios_visuals_position` on the CPU/WASM side and the renderer uploads positions to GPU buffers.
- When layout ticks are infrequent or take a long time, positions “jump” in visible steps.
- We want smooth motion at display refresh rate even when layout publishes positions at a lower rate.

## Terminology

- **Layout positions**: the “authoritative” positions produced by the layout algorithm (CPU/WASM for now).
- **Render positions**: positions used by the renderer each frame (can be derived from layout positions).
- **Snapshot**: a full positions array at a given time.

## Option A (recommended first): Shader-only interpolation between snapshots

### Summary

Keep **two GPU-resident position snapshots**:

- `prevPositions`: last snapshot we were rendering from
- `nextPositions`: newest snapshot from the layout

At render time, the vertex shader computes:

`renderPosition = mix(prevPositions[id], nextPositions[id], t)`

Where `t` is a uniform derived from time:

- `t = clamp((now - lastSnapshotTime) / blendDuration, 0..1)`
- Optional: replace linear with `smoothstep`-style easing.

### Why this is the best starting point

- Works on **WebGL2 and WebGPU** with minimal new plumbing.
- No extra compute/transform-feedback pass; no per-frame buffer writes.
- Upload cost happens only when a new layout snapshot arrives.
- Never requires GPU→CPU readback.

### Tradeoffs / constraints

- Requires ~2× memory for positions (two buffers/textures).
- Motion is limited to “between snapshots”. If snapshots are extremely sparse, motion may look like a slow glide toward stale targets (still better than jumping).

### Integration sketch (high level)

- Renderer owns `prev/next` GPU position resources.
- On receiving a new layout snapshot:
  - `prev = next` (swap handles)
  - upload snapshot into `next`
  - reset `lastSnapshotTime = now`
- Per frame:
  - compute `t`
  - render using `mix(prev, next, t)`

### Edges: keep endpoints consistent with interpolated nodes

Edges must use positions that are consistent with the node positions used in the same frame. There are two approaches:

#### A1) Interpolate edge endpoint geometry buffers (minimal change, higher bandwidth)

If edge rendering consumes explicit edge endpoint positions (e.g. an array of `start/end` positions per edge), mirror the node approach:

- Keep `prevEdgeEndpoints` and `nextEdgeEndpoints` GPU buffers/textures.
- On snapshot update: swap `prev <- next`, upload the new edge endpoints into `next`, reset `t`.
- In the edge vertex shader: `start = mix(prevStart, nextStart, t)` and `end = mix(prevEnd, nextEnd, t)`.

This is straightforward but scales poorly when `E` is large because it duplicates edge endpoint storage and increases snapshot upload size (edge endpoints are typically much larger than node positions).

#### A2) Prefer: edges reference node ids and fetch node positions in shader (best scaling)

Instead of storing per-edge endpoint positions, store per-edge endpoint node ids (`from`, `to`) and fetch node positions in the edge shader:

- `start = mix(prevNodePos[from], nextNodePos[from], t)`
- `end   = mix(prevNodePos[to],   nextNodePos[to],   t)`

Benefits:

- Edges are automatically consistent with node interpolation (same buffers, same `t`).
- Snapshot uploads are smaller (no need to upload edge endpoints each tick).
- Doubled memory is only for node positions (not edges).

Backends:

- WebGPU: straightforward via storage-buffer reads by index.
- WebGL2: typically requires storing node positions in a float texture and using `texelFetch` in the vertex shader (or accepting the A1 approach if you stay on explicit edge segments).

## Option B: GPU-resident “render positions” updated every frame (stateful smoothing)

This keeps **render positions fully GPU-owned**, updated every frame toward a target snapshot.

### Summary

Maintain:

- `targetPositions` (uploaded only when layout publishes a new snapshot)
- `renderPositions` (persistent GPU state, updated every frame)
- Optional `velocity` buffer/texture (for spring dynamics)

Per frame, update:

- simple exponential smoothing: `render += alpha(dt) * (target - render)`
- or critically damped spring (more stable across frame rates):
  - integrate `(render, velocity)` toward `target` using `dt`

### WebGPU: compute pass (preferred)

- Compute pipeline reads `renderPositions + targetPositions (+ velocity)` and writes to `renderPositions' (+ velocity')`.
- Ping-pong buffers or use separate read/write buffers and swap each frame.
- Render pass consumes `renderPositions`.

### WebGL2: transform feedback (viable for this use case)

Transform feedback can run a vertex shader over `N` points and capture varyings into buffers:

- Inputs: `renderPos`, optional `vel`, `targetPos`, uniforms (`dt`, parameters)
- Outputs: `newRenderPos`, optional `newVel`
- Use `RASTERIZER_DISCARD` and `gl.drawArrays(gl.POINTS, 0, nodeCount)` to run the update step.
- Ping-pong between A/B buffers each frame.

### Tradeoffs / constraints

- Adds an additional full-buffer read+write each frame (bandwidth heavy at huge node counts).
- WebGL2 TF is more complex to wire and debug than Option A.
- Still requires CPU→GPU upload of `targetPositions` when layout produces a new snapshot (unless layout moves to GPU).

### Edges for Option B

To keep edges consistent, edges should consume the same GPU-resident `renderPositions` that nodes use:

- Prefer the “endpoint ids” representation (A2) so edges fetch positions from `renderPositions` using (`from`, `to`).
- Avoid recomputing and uploading explicit edge endpoint geometry every frame; that defeats the purpose of GPU-resident smoothing.

## Option C: Fully GPU layout (no CPU uploads of positions)

This is the “positions never touch CPU after setup” approach.

- Layout simulation runs on GPU.
- Renderer consumes the same GPU-resident position resource directly.
- CPU-side positions exist only on-demand (export/debug) and are read back rarely (or never).

This is a larger project and is covered more broadly in:

- `Future/gpu_layout_webgpu_webgl_plan.md`

## Picking the right option (practical guidance)

For the near term (CPU/WASM layout stays as-is), start with:

1) **Option A** (two-snapshot shader interpolation) for the highest ROI and lowest risk.
2) Move to **Option B** only if you need more “physical” motion (inertia/springs) or if snapshot cadence is extremely irregular.
3) Consider **Option C** when layout itself becomes the performance bottleneck and you want to eliminate CPU→GPU position uploads.

## Notes for very large graphs

- Option A’s cost is mostly:
  - extra position fetch in the vertex shader
  - ~2× position memory
  - uploads only on snapshot updates
- Option B’s cost is mostly:
  - full-buffer update pass every frame (often the first thing to break at multi-million nodes)
- Prefer 2D mode for “huge N” and treat 3D as a quality mode when N is lower.

## Related implementation touchpoints in this repo (non-exhaustive)

- Layout positions live in `_helios_visuals_position` (see `src/layouts/Layout.js` and `src/pipeline/constants.js`).
- Position-related uploads currently happen in:
  - WebGL: `src/rendering/engine/GraphLayerWebGL.js`
  - WebGPU: `src/rendering/engine/GraphLayerWebGPU.js`
- Position data is read via sparse/indexed graph views and uploaded through the resource cache (`src/rendering/resources/WebGPUResourceCache.js`).
- Edge geometry currently comes from `_helios_visuals_edge_endpoints_position`, which is convenient but makes per-snapshot uploads large for big `E`. For smooth interpolation at scale, prefer edge endpoint ids and shader fetches.

## Recommended future changes to `helios-network` (C/WASM)

These are not required for Option A/B correctness, but would reduce overhead and make renderer-side smoothing easier and safer.

### Minimum recommended set (high ROI)

- `positionsVersion`: monotonic counter for `_helios_visuals_position`.
- `memoryGeneration`: monotonic counter incremented when WASM memory grows or the underlying storage for a returned view can change.
- Optional: `positionsLastUpdatedTimestamp` (layout-side time in ms) if available; otherwise JS can timestamp snapshots on receipt.

### 1) Stable, explicit versions for “layout positions”

Expose a monotonic `positionsVersion` (or `visualsPositionsVersion`) that increments whenever the layout writes `_helios_visuals_position`.

- Today we often rely on “attribute version” plumbing indirectly.
- A dedicated version makes it trivial to detect snapshot changes and avoid redundant uploads.

### 2) Dirty ranges (optional, but valuable at huge N)

Allow layouts to publish which indices/ranges changed since the last snapshot, e.g.:

- a `dirtyMin/dirtyMax` range, or
- a compacted list of dirty node ids (with a cap), or
- a tile-based dirty bitset for large arrays

This enables partial uploads for sparse updates and makes “interactive edits” cheaper.

### 3) A “snapshot without copy” API surface (JS/WASM ergonomics)

Provide a single call that returns:

- typed view (or pointer + length metadata) for `_helios_visuals_position`
- `positionsVersion`
- `nodeCount` / capacity
- a “memory generation” key (changes on WASM heap growth / reallocation)

This avoids repeated name lookups and reduces the risk of caching stale views.

### 4) Optional double-buffered positions in WASM (future)

If CPU layouts remain relevant for medium graphs, consider internally double-buffering positions:

- layout writes to a “back” buffer
- a swap publishes the “front” buffer + version

This can make it easier to:

- keep a stable “prev snapshot” without copying in JS
- coordinate worker/main-thread access with fewer transient arrays

### 5) GPU layout interoperability (later, aligned with Option C)

When we revisit GPU layouts:

- keep `helios-network` as the topology/attribute source of truth,
- but allow the renderer/layout pipeline to treat positions as an “external source” (GPU-owned) with optional readback on demand.

The goal is to avoid forcing GPU layout to continuously synchronize a 2M-node position array back into WASM.
