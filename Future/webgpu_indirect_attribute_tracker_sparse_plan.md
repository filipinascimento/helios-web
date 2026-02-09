# WebGPU Indirect AttributeTracker Sparse-Buffer Plan

This note explains why WebGPU indirect attribute tracking still allocates JS typed arrays even when `r32uint` render targets are available, and defines a plan to remove that repacking path.

## Problem statement

Today, `WebGPUAttributeRenderer` in indirect mode prepares packed active buffers on the CPU:

- `packActiveValues(...)`
- `packEdgeSegmentsFromSparse(...)`
- `encodeActiveValuesUint32(...)` (or `encodeActiveValues(...)` when not using `r32uint`)

The key point is that `r32uint` only changes encoded id format. It does **not** change the draw/input model.

## Why `r32uint` does not remove repacking today

Current AttributeTracker WebGPU pipelines are instance-vertex-buffer driven:

- node/edge geometry and encoded ids are bound as `@location(...)` vertex attributes
- draw calls use `instance_count = activeCount`
- instance `i` reads element `i` from each bound vertex buffer

Because sparse graph data is currently provided as:

- full sparse attribute views (`getNodeAttributeBuffer(...).view`, `getEdgeAttributeBuffer(...).view`)
- plus active id lists (`nodeIndices`, `edgeIndices`)

the renderer must repack active rows into contiguous per-instance buffers so instance `i` maps to active item `i`.

So, with current pipeline shape, a simple "switch encoded output to `r32uint`" is insufficient to remove intermediate CPU arrays.

## Can a shader-only change fix it?

Not by itself.

A minimal viable zero-repack approach needs a data-access model change:

- read full sparse attributes via storage buffers
- read active ids via index buffers (node/edge indices)
- fetch attributes in shader by id (`id = indices[instance_index]`)

This is the same model used by the main WebGPU indirect graph renderer, but AttributeTracker currently uses a different pipeline architecture.

## Target architecture

Introduce a dedicated indirect tracker path that is index-driven on GPU:

1. Upload sparse attribute views as storage buffers.
2. Upload active node/edge id arrays as storage buffers (or vertex buffers if preferred, but storage keeps model consistent).
3. In WGSL vertex stage:
   - `activeId = nodeIndices[instance_index]` or `edgeIndices[instance_index]`
   - gather position/size/outline/edge endpoint data from sparse storage buffers.
4. For encoded ids:
   - if `r32uint`: emit packed `u32` directly in shader (or load uint sparse-encoded buffer if available later)
   - else: emit RGBA8-compatible encoding in shader.
5. Remove CPU repacking helpers from indirect path.

## Implementation plan

### Phase 1: Scaffold indirect tracker pipeline family

- Add a new WebGPU AttributeTracker shader source generator for indirect gather mode (or extend existing generator with an indirect branch).
- Create separate pipeline cache keys for:
  - indirect/direct mode
  - edge line/quad
  - uniform/buffer toggles for size/outline/width/endpoint-size
  - encoded output/input mode (`uint32` vs `u8x4`)

### Phase 2: Add storage bindings and GPU gather logic

- Add bind group layout entries for:
  - node indices, edge indices
  - node positions/sizes/outline widths/states
  - edge endpoints/widths/endpoint sizes/states
  - optional node-sourced edge channels
- WGSL vertex logic:
  - gather node attributes by `nodeId`
  - gather edge segment endpoints by `edgeId -> (sourceId,targetId) -> nodePositions`
  - gather width/endpoint size either from edge attribute buffers or node-sourced buffers based on variant

### Phase 3: Move encoded-id generation to GPU path

- `r32uint` mode:
  - pass scalar attribute/index and pack to `u32` in shader
  - avoid `encodeActiveValuesUint32(...)` allocations
- RGBA8 mode:
  - pack bytes in shader to color attachment output
  - avoid `encodeActiveValues(...)` / `packActiveEncodedValues(...)` allocations for indirect mode

### Phase 4: Remove CPU-prep from indirect tracker

- Gate old `buildIndirectPreparedGeometry(...)` path behind legacy flag during migration.
- Switch default indirect tracker to gather pipeline.
- Delete or isolate indirect-only JS repacking helpers once parity is verified.

### Phase 5: Validation and regressions

- Add tests that assert indirect tracker does not allocate packed geometry/encoded arrays in steady-state renders.
- Extend current indirect tests to cover:
  - `r32uint` target path
  - non-`r32uint` fallback path
  - node-sourced edge width/endpoint-size variants
  - picking correctness for node and edge attributes
- Confirm no dense buffers are requested in indirect tracker mode.

## Expected benefits

- Removes per-frame/per-update CPU repacking overhead for indirect tracking.
- Reduces JS heap churn and GC pressure on large active sets.
- Aligns tracker architecture with indirect renderer data model.
- Keeps `r32uint` as a format optimization, not a structural dependency.

## Risks and mitigations

- More complex shader variants:
  - Mitigation: strict pipeline-key structure + focused shader generator tests.
- WebGPU storage buffer limits for very large graphs:
  - Mitigation: keep existing limit checks and fail with clear error messages.
- Behavior drift between direct and indirect trackers:
  - Mitigation: shared encode semantics tests and pixel/picking parity tests.

## Rollout strategy

1. Land indirect gather path behind an internal feature flag.
2. Run existing test suite plus new indirect tracker tests.
3. Enable by default for WebGPU indirect tracker once parity/perf is confirmed.
4. Remove legacy indirect repack path.
