# Indirect Interpolation + Position Delegation Plan

## Context

Helios Web Next now uses a single sparse/indexed renderer model for both WebGL2 and WebGPU, and delegate/interpolation runtime hooks were removed.

This plan describes how to re-introduce interpolation and delegate-owned positions in the current sparse/indexed model.

## Goals

- Keep indirect renderers as the only render path.
- Preserve zero-copy behavior where possible.
- Avoid per-frame full-array CPU repacks.
- Work for both WebGL2 indirect and WebGPU indirect.

## Non-goals

- Re-adding legacy pipeline splits.
- Requiring layouts to emit packed position snapshots.

## Design direction

### 1) Reframe delegates around sparse buffers

Use sparse/indexed delegates:

- `getNodePositionView()` -> returns sparse node position buffer view.
- `getVersion()` -> increments when delegate data changes.
- `syncToNetwork()` optional for external ownership mode.

Renderer responsibility:

- Consume delegate sparse positions directly in indirect paths.
- Continue using `nodeIndices` + `edgesView` for active topology.

### 2) Interpolation model for indirect

Prefer GPU-side blending with two sparse position sources:

- `sourcePositions`: currently rendered sparse positions.
- `targetPositions`: latest layout/delegate sparse positions.
- `t`: frame blend factor.

Render-time:

- Node shader reads `mix(source, target, t)`.
- Edge endpoints are resolved from interpolated node positions.

No geometry override layer is needed.

### 3) Backend-specific execution

WebGPU:

- Add optional storage buffer bindings for `targetPositions`.
- Keep `sourcePositions` as existing node position storage.
- Update shader variant key with interpolation toggle.

WebGL2:

- Add optional texture for target node positions.
- Blend in vertex shader using sampled source/target texels.
- Reuse existing texture tiling path for sparse data upload.

## API sketch

```js
helios.positions({
  source: 'network' | 'delegate',
  delegate, // sparse delegate
});

helios.interpolation({
  enabled: true,
  mode: 'gpu',         // default in indirect
  durationMs: 120,
  easing: 'linear',    // future: expo, smoothstep
});
```

Notes:

- `mode: 'gpu'` should be the first/primary implementation.
- CPU fallback can be added later only when GPU resources are unavailable.

## Migration strategy (phased)

1. Phase 1: Sparse delegate contract only (no interpolation)
- Allow layouts to read/write delegate-owned sparse position buffers.
- Render directly from delegate positions.

2. Phase 2: GPU interpolation in WebGPU indirect
- Add target buffer binding + shader blend.
- Drive `t` from scheduler timing.

3. Phase 3: GPU interpolation in WebGL2 indirect
- Add target position texture + shader blend.
- Align behavior with WebGPU.

4. Phase 4: Feature hardening
- Edge cases: topology changes mid-interpolation, layout pause/resume, network replace.
- Add metrics and debug counters.

## Key risks

- Topology churn while an interpolation is active.
- Buffer invalidation when network memory grows.
- Additional shader variants impacting pipeline cache size.

## Test plan

- Unit:
  - Delegate sparse contract (versioning, sync rules).
  - Interpolation timing (`t` progression and reset conditions).
- WebGPU E2E:
  - Visibly smooth transitions after sparse layout ticks.
- WebGL2 E2E:
  - Same behavioral checks under indirect texture path.
- Replacement/regression:
  - `replaceNetwork`, paused layout, manual rendering mode.
