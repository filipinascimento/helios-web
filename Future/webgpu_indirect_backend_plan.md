# WebGPU Indirect Backend Plan (Dense WebGPU + WebGPU Indirect + WebGL2)

This document outlines a plan to add a **separate WebGPU backend** that renders from **sparse buffers + indices** and performs **node→edge passthroughs in shaders**, without CPU-side dense edge buffers or node-to-edge copies.

It is a design note + milestone plan, intended to guide implementation later.

## Goals

- Add a **new backend**: `webgpu-indirect` alongside `webgl2` and existing `webgpu` (dense).
- **No dense node→edge buffers** for passthrough channels (positions, sizes, colors, states, etc.).
- Shader variants must **encode passthrough behavior** based on mapper configuration (similar to constant/buffer logic today).
- Keep current WebGL and WebGPU dense behavior unchanged by default.
- Avoid CPU node→edge copies except when explicitly requested by user code.

## Non-goals (first cut)

- Replace WebGL rendering with indirect buffers.
- Make `AttributeTracker` (picking) fully indirect on day one.
- Auto-fallback between backends without explicit configuration.
- Full feature parity with dense backend for every edge channel on day one.

## Current state (relevant context)

- Dense-only pipeline in `GraphLayerWebGPU` and `GraphLayerWebGL`.
- Dense buffers are produced via `GraphLayer.withDenseGraph(...)`.
- Node→edge passthroughs are materialized in dense edge buffers by `defineNodeToEdgeAttribute` and `updateDenseEdgeAttributeBuffer`.
- Visual mapper config is stored in `network.__heliosVisualConfig` (built in `VisualAttributes`).

## Proposed approach (high level)

- Introduce a **new renderer backend**: `GraphLayerWebGPUIndirect`.
- Use **sparse attribute buffers** from `network.getNodeAttributeBuffer(...)` and `getEdgeAttributeBuffer(...)`.
- Upload **edgesView** (from/to pairs) as a storage buffer.
- Use **dense index buffers** only for active lists (`getDenseNodeIndexView`, `getDenseEdgeIndexView`) so draw calls remain compact.
- Compute all node→edge passthroughs **directly in WGSL** by reading node attributes at `sourceId` / `targetId`.
- Shader variants are selected using an expanded `visualConfig` that encodes data source for each edge channel.

## Backend selection

- Introduce a renderer option, e.g. `webgpuBackend: 'dense' | 'indirect'`.
- `LayeredRenderer.ensureGraphLayer()` should instantiate:
  - `GraphLayerWebGPU` for `'dense'`
  - `GraphLayerWebGPUIndirect` for `'indirect'`
  - `GraphLayerWebGL` for WebGL2

## Visual config extensions

Extend `__heliosVisualConfig` to include **channel source metadata**, for example:

- `edge.color = { mode: 'buffer', source: 'edge' }`
- `edge.color = { mode: 'buffer', source: 'node', nodeAttribute: 'color', endpoints: 'both', doubleWidth: true }`

This mirrors mapper intent and allows shader generation to reflect passthrough settings.

## Shader model (indirect backend)

Edge shaders read:

- `edgesView` for `(sourceId, targetId)`
- `nodePositions` for both endpoints
- Optional node attributes (color/size/state/etc.) for edge channels configured as `source:'node'`
- Edge attributes for channels configured as `source:'edge'`

Derived edge values:

- `edge endpoints position`: always derived from node positions
- `edge endpoints size`: derived from node size when `endpointSize` is node-sourced
- `edge endpoint state`: derived from node state instead of `EDGE_ENDPOINTS_STATE_ATTRIBUTE`

Shader variants are keyed by:

- per-channel source (`node` vs `edge` vs `uniform`)
- endpoints selection (`both` / `source` / `destination`)
- WebGPU edge rendering mode (`line` vs `quad`)
- state slots count

## Data flow (indirect backend)

1. Build active index buffers (dense indices only):
   - `getDenseNodeIndexView()`
   - `getDenseEdgeIndexView()`
2. Read sparse attributes via `getNodeAttributeBuffer` / `getEdgeAttributeBuffer`
3. Upload to GPU storage buffers
4. Render with shader-generated passthrough logic

## Implementation milestones

### Phase 1: Scaffolding + backend switch

- Add renderer option and route to new backend.
- Create `GraphLayerWebGPUIndirect` with shared utilities from `GraphLayerWebGPU`.
- Copy existing WebGPU pipeline structure as a base (camera, globals, bind groups, shader caching).

### Phase 2: Indirect shader sources

- Add a new shader generator `graphWebGPUIndirect.js` or extend `graphWebGPU.js`.
- Implement:
  - edge endpoint positions from node positions
  - node-sourced edge color as a passthrough
  - endpoint-size passthrough (node size)
  - endpoint-state passthrough (node state)

### Phase 3: Visual config propagation

- Update `Mapper` and `VisualAttributes` to record passthrough config into `__heliosVisualConfig`.
- Ensure indirect backend reads that config and builds shader variants.
- Do not register dense edge passthroughs when indirect backend is enabled.

### Phase 4: Data upload path

- Use sparse buffers:
  - `nodePositions`, `nodeColors`, `nodeSizes`, `nodeStates`, optional outlines
  - `edgeColors`, `edgeWidths`, `edgeOpacities`, `edgeStates`
- Upload `edgesView` as `EdgeEndpoints` storage buffer.
- Upload dense index buffers for active lists.

### Phase 5: Feature parity + polish

- Implement all edge channels with `source:'node'` handling.
- Add shader variants for `endpointSize`, `color`, `opacity`, `width` passthrough.
- Make sure mapping changes recompile pipelines.
- Add logging or diagnostics for shader variant changes.

### Phase 6: Picking path (optional in v1)

Option A: keep current `AttributeTracker` on dense buffers.

Option B: add `WebGPUIndirectAttributeRenderer`:
- encode ids directly from node/edge indices with sparse reads
- no dense buffers required

## Memory + limits

Sparse buffers scale with **capacity**. WebGPU `maxStorageBufferBindingSize` may be hit on large graphs.

Plan:
- Detect limit early.
- Hard error with actionable message if buffers exceed limits.
- Avoid silent fallback unless explicitly approved.

### Range slicing optimization (optional but recommended)

We can reduce buffer sizes by slicing sparse buffers to the **active index range** when it is narrower than capacity.

Approach:
- Use `nodeValidRange` / `edgeValidRange` to compute `[start, end)` per scope **before** entering `withBufferAccess`.
- Upload only the subarray slice for each sparse attribute:
  - `baseIndex = start`
  - `count = end - start`
  - `slice = view.subarray(baseIndex * strideElems, (baseIndex + count) * strideElems)`
- Pass `nodeBase` / `edgeBase` to shaders and index with `id - base`.
- Apply the same base offset to:
  - `edgesView` (edge endpoints buffer)
  - edge-sourced attributes
  - node-sourced edge reads (use `nodeBase`)

Notes:
- This does **not** require contiguity of active nodes, only that all active node indices fall within `[start, end)`.
- If the valid range is still large (near capacity), slicing won’t help and the full buffer should be used.

## Testing plan

- Add regression tests for node→edge passthrough channels:
  - edge color from node color
  - edge width from node size
  - edge opacity from node scalar
  - endpoint size from node size
- Add a large-graph test that validates no dense edge passthrough updates occur.
- Update docs to describe backend selection + limitations.

## Decisions (from discussion)

- Backend name: `webgpu-indirect`
- `maxStorageBufferBindingSize` overflow: **hard error + clear message**, no fallback for now.
- `AttributeTracker` timing: **pick the simplest path** at implementation time. If the dense path can remain isolated without correctness regressions, keep it for phase 1; otherwise move it with the renderer.
