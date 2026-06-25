# WebGL2 Backend Evolution Plan

This document tracks follow-up work for the current WebGL2 renderer architecture.

## Current baseline

- Rendering uses sparse/indexed inputs via texture-backed fetch.
- Edge channels support mixed source behavior through mapper-derived visual config.
- Tracking/picking follows the same indirect data model.

## Goals

- Improve scalability while preserving rendering semantics.
- Keep shader variant behavior stable under live mapper edits.
- Reduce unnecessary GPU uploads and program churn.
- Maintain picking/tracking correctness under all edge modes.

## Non-goals

- Reintroducing alternate renderer families.
- Automatic backend switching without explicit configuration.

## Planned milestones

### Phase 1: Upload-path efficiency

- Improve texture upload diffing and metadata gating.
- Reduce redundant uploads for stable attributes.
- Strengthen diagnostics for texture-size limits.

### Phase 2: Shader/program variant quality

- Consolidate variant key design for mixed channel sources.
- Ensure runtime channel changes trigger predictable program updates.
- Add debug visibility for active variant state.

### Phase 3: Tracking/picking optimization

- Align attribute-tracker passes with main render data usage.
- Reduce CPU-side prep in fallback paths where possible.
- Validate parity for node/edge picking across edge line/quad modes.

### Phase 4: Large-graph hardening

- Add stress fixtures for high-capacity texture tiling.
- Profile and tune interaction-time behavior.
- Improve failure messages for resource constraints.

## Test plan

- Unit tests for variant-key transitions.
- Integration tests for mixed node/edge source channels.
- E2E checks for picking/tracking under mapper changes.
- Large-graph regressions for texture tiling and stability.

## Open decisions

- Preferred texture layout heuristics for extremely large sparse buffers.
- Thresholds for optional quality/perf interaction modes.
- Extra debug counters to expose in the demo UI.
