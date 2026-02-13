# WebGPU Backend Evolution Plan

This document tracks follow-up work for the current WebGPU renderer architecture.

## Current baseline

- Rendering uses sparse/indexed data (`nodeIndices`, `edgeIndices`, `edgesView`, sparse attribute buffers).
- Edge channel sourcing is mapper-driven through `__heliosVisualConfig`.
- Node-to-edge passthrough behavior is resolved in shader variants.

## Goals

- Increase graph-size headroom without changing visual semantics.
- Keep mapper behavior stable across channel source combinations.
- Reduce CPU overhead during uploads and variant switching.
- Keep picking/tracking behavior consistent with scene rendering.

## Non-goals

- Introducing a parallel backend family.
- Silent fallback behavior on resource-limit failures.

## Planned milestones

### Phase 1: Resource headroom

- Improve shard planning and upload scheduling for large buffers.
- Add clearer diagnostics for binding-size and buffer-size limits.
- Keep hard errors actionable and deterministic.

### Phase 2: Variant stability

- Tighten variant keys and pipeline cache invalidation.
- Verify runtime mapper edits trigger only necessary recompiles/rebinds.
- Add variant-change telemetry for debugging.

### Phase 3: Attribute tracking alignment

- Keep tracking/picking on the same sparse/indexed data model as the graph pass.
- Remove avoidable CPU prep in non-direct tracking paths.
- Validate parity across `r32uint` and RGBA fallback targets.

### Phase 4: Performance hardening

- Reduce per-frame bind group churn.
- Audit upload paths for redundant work.
- Profile and optimize large-graph interaction scenarios.

## Test plan

- Extend regression tests for node-sourced edge channels.
- Add large-graph coverage for limit-handling and sharding.
- Add tracking/picking parity tests across format paths.
- Keep WebGL2/WebGPU visual parity checks in CI.

## Open decisions

- Shard sizing policy: exact fit vs buffered headroom.
- Preferred preallocation strategy for shard resources.
- Additional diagnostics surface for runtime variant/resource state.
