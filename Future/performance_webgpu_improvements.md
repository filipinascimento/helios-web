# WebGPU performance improvements (Safari-focused)

This note tracks actionable ideas from profiling a very large graph (e.g. ~2M nodes) where Safari/WebGL2 outperforms Safari/WebGPU under comparable render settings (including weighted transparency).

## Current observations (from this repo’s code paths)

- `GraphLayer.updateDenseGraphBuffers()` is called every render and is not version-aware on the Helios side (`src/rendering/engine/GraphLayer.js:307`).
- When `helios-network` can “alias” dense buffers, `updateDenseNodeAttributeBuffer()` / `updateDenseEdgeAttributeBuffer()` still does non-trivial work each call:
  - it rebuilds an aliased descriptor via `_buildAliasedDenseAttributeDescriptor()`, which calls `_attributePointers()` (WASM getters + `CString`) and `_getAttributeVersion()` (WASM getter + `CString`)
  - see `node_modules/helios-network/src/js/HeliosNetwork.js:2269`, `:4089`, `:3722`, `:3582`
- WebGPU shaders always fetch per-instance indices from `nodeIndices` / `edgeIndices` storage buffers even when the dense order is identity/contiguous (`src/rendering/engine/shaders/graphWebGPU.js:93` and `:313`/`:420`).
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

### 3) “Identity index” fast path (remove `indices[instance]` indirection)

If dense order is known to be identity/contiguous (common in large static graphs):
- compile/use a pipeline variant that uses `instance_index` directly (no `nodeIndices` buffer)
- similarly for edges, avoid `edgeIndices` when it is identity

This removes one storage read and can improve memory coalescing.

### 4) Remove per-frame weighted bind group/view churn on WebGPU

In `GraphLayerWebGPU`:
- Cache `GPUTextureView`s for the weighted textures and recreate only on resize/reallocation.
- Only recreate the weighted resolve bind group when its resources change (resize, texture recreated), not every frame.

### 5) Don’t call `updateDenseGraphBuffers()` every frame unless needed (CPU-side win)

Idea: gate `GraphLayer.updateDenseGraphBuffers(network)` behind a cached “dense signature” (topology versions + visuals versions) and only call updates when something changes.

Considerations:
- Pure version gating is risky if WASM memory grows and invalidates typed-array views without bumping attribute versions.
- A safer gate can include a “heap identity” check when available (e.g. `network.module.HEAPU8.buffer` pointer identity, if exposed), or a network-provided “memory generation” counter.

## Recommendations for `helios-network` (things to consider upstream)

These aim to reduce the per-frame cost seen in `_buildAliasedDenseAttributeDescriptor()` without relying on unsafe pointer caching.

Ordered roughly by expected impact for render loops that call `updateDense*` every frame.

### A) Avoid repeated `CString` + attribute lookup per frame (highest CPU win)

Right now, both `_attributePointers()` and `_getAttributeVersion()` pay a “string -> WASM lookup” cost every call.

Possible upstream changes:
- Store `attributePtr` in JS metadata in `_ensureAttributeMetadata()` so `_getAttributeVersion()` can call `_CXAttributeVersion(attributePtr)` without re-looking up by name.
- Provide WASM exports that accept `attributePtr` and return:
  - buffer pointer
  - stride
  - (optionally) buffer pointer already offset by `validStart`

This preserves correctness across WASM reallocations (because you still query the current buffer pointer) while removing string overhead.

### B) Provide a bulk “update/render snapshot” API (reduce JS↔WASM crossings)

Instead of calling N separate JS methods each frame, add an API that:
- updates all required dense buffers in one call (or validates aliased descriptors)
- returns a compact snapshot of descriptors/versions needed for rendering

This reduces JS<->WASM crossings and makes it easier for renderers to be version-aware safely.

### C) Add an early-out cache for aliased dense descriptors using a *safety key*

Even if buffer pointers can change, they typically change only when:
- the attribute buffer grows/reallocates, or
- WASM memory grows (new `HEAPU8.buffer`)

An upstream early-out could reuse the previous aliased descriptor when all of these are unchanged:
- `nodeValidRange` / `edgeValidRange` unchanged
- `attributeVersion` unchanged
- WASM heap buffer identity unchanged (`module.HEAPU8.buffer` unchanged)

If any key changes, rebuild pointers/views as today.

### D) Expose “dense indices are identity” / “dense order is contiguous” flags

If `helios-network` can guarantee identity mapping for common cases (e.g. no dense order active, `validStart=0`, `count=nodeCount`):
- expose that explicitly so renderers can skip index indirection/buffers.

## Suggested measurement checklist (so changes are measurable)

- Split CPU vs GPU time: toggle nodes-only, edges-only, and weighted off/on.
- Compare WebGPU shader variants:
  - with vs without `nodeIndices` / `edgeIndices`
  - storage buffers vs instanced vertex buffers (if prototyped)
- Measure `updateDenseGraphBuffers` time with:
  - current per-frame calls
  - gated calls (version + safety key)
  - upstream reduced string/WASM lookup overhead (if adopted in `helios-network`)
