# WebGL2 Indirect Backend Plan (Dense WebGL2 + WebGL2 Indirect + WebGPU)

This document proposes a new **WebGL2 indirect backend** that can run alongside the current dense WebGL2 backend.
The goal is to support node-sourced edge passthrough channels and mixed channel sources **without touching dense buffers**.

## Goals

- Add a new backend option for WebGL2: `webglBackend: 'dense' | 'indirect'`.
- Keep current dense WebGL2 behavior as default and unchanged.
- In WebGL2-indirect mode, do not call dense buffer update paths at all.
- Support mixed edge channel sourcing:
  - `edge endpoints position` from node positions (`from/to`)
  - edge channels from either node or edge source (color, width, endpointSize, state, opacity as available)
- Add indirect-compatible attribute tracking and picking paths.

## Hard Rules (Non-negotiable)

- In WebGL2-indirect mode, dense buffers must never be used or touched.
- In WebGL2-indirect mode, do not create intermediate CPU-side packed arrays/buffers for render data.
- Allowed allocations:
  - WebGL GPU objects (textures, buffers, framebuffers, renderbuffers, programs, VAOs)
  - small control/uniform scratch data only
- Forbidden allocations:
  - JS staging arrays that duplicate sparse graph channels
  - CPU repacks like dense edge segment arrays or duplicated passthrough arrays
- Forbidden in indirect mode:
  - `withDenseGraph(...)`
  - `updateDenseNodeAttributeBuffer(...)`
  - `updateDenseEdgeAttributeBuffer(...)`
  - dense passthrough registration/update hooks
- Tracking/picking in indirect mode must not depend on dense attribute buffers.
- Keep existing dense WebGL2 and WebGPU behavior unchanged.

## Scope

### In scope

- New `GraphLayerWebGLIndirect` render layer.
- New backend selection wiring in renderer creation path.
- Texture/buffer data path for sparse node/edge attributes.
- Shader variants for node-sourced vs edge-sourced edge channels.
- New WebGL2 indirect tracking/picking renderer path.

### Out of scope (phase 1)

- Replacing dense backend.
- Auto-fallback between dense and indirect without explicit configuration.
- Feature parity for every edge channel on day one.

## Backend Selection

- WebGL renderer option:
  - `webglBackend: 'dense' | 'indirect'`
- Behavior:
  - `renderer=webgl` + `webglBackend=dense` -> current `GraphLayerWebGL`
  - `renderer=webgl` + `webglBackend=indirect` -> new `GraphLayerWebGLIndirect`
- Existing `webgpuBackend` behavior remains unchanged.

## Data Model for WebGL2-indirect

- Use sparse attribute views from `helios-network` as source of truth.
- Upload sparse data directly from source views to GPU textures/buffers used by shaders via `texelFetch`.
- Keep compact active lists as IDs/indices for draw dispatch.
- Do not materialize CPU intermediate packed representations between source views and GPU uploads.

### Suggested resources

- Node resources:
  - `nodePositionsTex` (`RGB32F` or packed equivalent)
  - `nodeSizesTex`
  - `nodeColorsTex`
  - `nodeStatesTex`
  - optional node outline textures
- Edge resources:
  - `edgeEndpointsTex` (`RG32UI` or `RG32F` packed fallback)
  - `edgeColorsTex`
  - `edgeWidthsTex`
  - `edgeEndpointSizesTex`
  - `edgeStatesTex`
- Draw resources:
  - active node ID stream
  - active edge ID stream
  - static corner quad buffer for billboards/quad edges

## Rendering Model

### Nodes

- Draw with instancing or vertex-ID driven approach.
- Per-node values fetched from node textures using node ID.

### Edges

- For each edge ID:
  - fetch `(sourceId, targetId)` from `edgeEndpointsTex`
  - fetch node positions for `from/to` in shader
- No CPU-side edge segment packing (`[x0,y0,z0,x1,y1,z1]`) in indirect mode.
- For each edge channel:
  - if `source='edge'`: fetch from edge texture
  - if `source='node'`: fetch from node texture at source/target (or both)
- This supports mixed channels in a single pass (example: positions from node, color from edge).

## Visual Config / Variant Keys

- Extend/consume `__heliosVisualConfig` channel source metadata (already used for WebGPU indirect).
- Build WebGL indirect shader variants by:
  - channel source (`node`/`edge`/`uniform`)
  - endpoint mode (`both`/`source`/`destination`)
  - edge mode (`line`/`quad`)
  - state slot count
- Rebuild programs when variant key changes.

## Tracking + Picking (Indirect Path)

Add a `WebGLIndirectAttributeRenderer` (or equivalent mode inside `AttributeTracker`) used only when:
- renderer is WebGL2
- backend is indirect

### Requirements

- No dense attribute dependencies.
- No CPU-side repacked tracking buffers derived from sparse channels.
- Render IDs from indirect node/edge data path.
- Blending disabled in tracking/picking passes.

### Target format strategy

- Tier A (preferred if supported): integer render target path (`RGBA8UI` family) with integer readback.
- Tier B (fallback): RGBA8 normalized encode/decode (current packed approach).

### Depth behavior

- Keep current depth tracking strategy (optional packed depth target) but source geometry from indirect path.

## helios-network Access Rules

- Follow `withBufferAccess(...)` safety in all sparse reads.
- Allocate/upload scheduling first, then take views.
- Do not cache stale views across allocation-prone operations.

## Implementation Phases

### Phase 1: Scaffolding

- Add backend option plumbing for WebGL2.
- Add `GraphLayerWebGLIndirect` class with minimal node+edge draw.
- Keep dense backend untouched.

### Phase 2: Sparse Upload Path

- Build texture upload manager for sparse node/edge channels.
- Add active ID streams for nodes/edges.
- Add change/version checks to avoid redundant uploads.

### Phase 3: Edge Passthrough in Shader

- Implement `from/to` position from node positions texture.
- Add mixed channel source support for edge color/width/endpointSize/state.
- Ensure passthrough behavior matches visual config semantics.

### Phase 4: Tracking/Picking Indirect

- Add WebGL2-indirect tracking renderer path.
- Remove dense dependence in picking for indirect mode.
- Validate node and edge picking under mixed channel modes.

### Phase 5: Guardrails + Diagnostics

- Add runtime assertions in indirect mode for forbidden dense calls.
- Add debug diagnostics that report active backend, variant key, and upload stats.

### Phase 6: Parity + Hardening

- Fill remaining channel gaps.
- Verify interaction with state system and outlines.
- Benchmark and tune hotspots.

## Test Plan

- Unit tests:
  - backend selection for WebGL2 indirect
  - variant key updates on mapper/source changes
  - no-dense-touch assertions in indirect mode
- Integration/E2E tests:
  - mixed source scenario: position from node passthrough + color from edge
  - picking/tracking works in WebGL2-indirect
  - mapper changes trigger shader/program updates
  - dense backend behavior unchanged
- Regression checks:
  - existing WebGL dense tests must still pass
  - existing WebGPU (dense/indirect) tests must still pass

## Risks and Constraints

- WebGL2 lacks WebGPU-style GPU-driven indirect draw semantics.
- `texelFetch` path is valid but may have lower throughput than WebGPU-indirect for large scenes.
- Integer render target support details vary by platform; keep robust fallback.

## Definition of Done

- New WebGL2-indirect backend selectable and stable.
- Dense backend preserved and default.
- In indirect mode, dense buffers are never touched (render + picking/tracking).
- Mixed node/edge channel sourcing works and updates shader variants correctly.
- Required unit and e2e tests pass.
