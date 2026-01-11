# WebGPU performance improvements (Safari-focused)

This note tracks actionable ideas from profiling a very large graph (e.g. ~2M nodes) where Safari/WebGL2 outperforms Safari/WebGPU under comparable render settings (including weighted transparency).

## Current observations (from this repo’s code paths)

- Dense buffers are now snapshotted via `updateAndGetDenseBufferViews()` and consumed as typed views in one call (`src/rendering/engine/GraphLayer.js`), reducing JS↔WASM crossings and per-buffer name lookups.
- WebGPU can now skip `nodeIndices` / `edgeIndices` indirection when dense packing is identity/contiguous (via `getDenseNodePackingInfo()` / `getDenseEdgePackingInfo()`), avoiding extra storage reads in the vertex stage.
- WebGL2 path uses classic instanced vertex attributes (VAO + divisors) and does not do a storage-buffer “vertex pulling + indirection” pattern (`src/rendering/engine/GraphLayerWebGL.js`).
- WebGPU weighted transparency path does multipass rendering every frame and currently recreates a weighted resolve bind group (and texture views) every frame (`src/rendering/engine/GraphLayerWebGPU.js:961`).

## Why WebGL2 can beat WebGPU on Safari (likely reasons)

- WebGPU vertex stage is doing storage-buffer reads plus an extra indirection (`indices[instance] -> id -> fetch positions/colors/...`), which can be slower than the WebGL instanced-attribute path on Apple GPUs.
- Weighted transparency adds extra render passes and format/attachment overhead; Safari’s WebGPU pipeline/pass overhead can be higher than the mature WebGL driver stack.
- CPU-side per-frame overhead from `updateDenseGraphBuffers()` can be non-trivial because `helios-network` alias descriptors still call into WASM to resolve pointers/versions.

## Potential improvements in `helios-web-next` (no `helios-network` changes required)

Ordered roughly by expected FPS / interaction gains for large, mostly-static graphs on Safari.

### 1) LOD / interaction heuristics during camera motion (highest perceived win)

During active camera drag/zoom:
- temporarily reduce edge cost (lower internal resolution for weighted pass, drop weighted mode, or draw fewer edges)
- restore full quality after a short idle delay

### 2) WebGPU vertex-buffer instancing path (match WebGL2’s access pattern)

Longer-term: store positions/colors/sizes/states as vertex buffers with `stepMode: 'instance'` rather than storage buffers.

This makes WebGPU’s fetch path much closer to the WebGL2 instanced-attribute path that Safari performs well on.

### 3) Remove per-frame weighted bind group/view churn on WebGPU

In `GraphLayerWebGPU`:
- Cache `GPUTextureView`s for the weighted textures and recreate only on resize/reallocation.
- Only recreate the weighted resolve bind group when its resources change (resize, texture recreated), not every frame.

### 4) Don’t call `updateDenseGraphBuffers()` every frame unless needed (CPU-side win)

Idea: gate `GraphLayer.updateDenseGraphBuffers(network)` behind a cached “dense signature” (topology versions + visuals versions) and only call updates when something changes.

Considerations:
- Pure version gating is risky if WASM memory grows and invalidates typed-array views without bumping attribute versions.
- A safer gate can include a “heap identity” check when available (e.g. `network.module.HEAPU8.buffer` pointer identity, if exposed), or a network-provided “memory generation” counter.

## Recommendations for `helios-network` (things to consider upstream)

These were addressed in `helios-network` and are no longer tracked here (fast pointer/version access, cached valid-range queries, aliased descriptor early-outs, and identity/contiguous packing info).

## Suggested measurement checklist (so changes are measurable)

- Split CPU vs GPU time: toggle nodes-only, edges-only, and weighted off/on.
- Compare WebGPU shader variants:
  - with vs without `nodeIndices` / `edgeIndices`
  - storage buffers vs instanced vertex buffers (if prototyped)
- Measure `updateDenseGraphBuffers` time with:
  - current per-frame calls
  - gated calls (version + safety key)
  - upstream reduced string/WASM lookup overhead (if adopted in `helios-network`)
