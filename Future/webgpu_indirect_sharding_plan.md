# WebGPU Indirect Sharding Plan (Future)

This document proposes a path to support graphs larger than a single
`maxStorageBufferBindingSize` limit in the WebGPU indirect backend by splitting
data into shards.

## Short answer: is this possible?

Yes. It is technically feasible, but it is not a small change. A safe path is:

1. Add edge sharding first (low risk, immediate win for large edge sets).
2. Add full node+edge sharding with per-shard remapping (higher complexity).

## Why this is needed

Current WebGPU indirect code validates each storage buffer against
`maxStorageBufferBindingSize` and throws if exceeded.

This means a single large attribute buffer (for example edge colors in varying
mode) can fail even when total GPU memory is still available.

## Goals

- Remove single-buffer size ceilings as the primary blocker for WebGPU indirect.
- Keep visual behavior and mapper semantics unchanged.
- Preserve current backend selection (`webgpuBackend: 'indirect'`).
- Avoid silent fallbacks.

## Non-goals (first cut)

- Rewriting dense backend sharding in the same milestone.
- Automatic multi-adapter/multi-device support.
- Perfectly minimizing draw-call count in v1.

## Constraints

- `maxStorageBufferBindingSize` remains a hard per-binding cap.
- `maxBufferSize` remains a hard per-buffer cap.
- Shader storage binding count per stage (`maxStorageBuffersPerShaderStage`)
  must not be exceeded when adding new remap/lookup buffers.
- Node-sourced edge channels in indirect mode require consistent node lookup for
  source/target IDs.

## Recommended rollout

### Phase 1: Edge-only sharding (v1)

Scope:

- Keep node buffers global (single buffers).
- Split edge buffers into shards when any edge channel exceeds binding limit.
- Render edge pass in multiple draws (one draw per edge shard).

Benefits:

- Immediate support for much larger edge counts when node-side buffers still fit.
- Smaller implementation surface than full remap.

Limit:

- Node buffers can still become the next ceiling.

### Phase 2: Full sharding with node remap (v2)

Scope:

- Split node buffers into shards too.
- For each edge shard, build a compact node subset and remap
  global node IDs -> local shard node IDs.
- Edge shader reads local node buffers through remapped IDs.

Benefits:

- Removes both node and edge single-buffer ceilings.

Cost:

- More CPU preprocessing and more complex pipeline/bindings.

## Data model proposal

Add sharding metadata for indirect resources:

- `nodeShards[]`: `{ shardId, nodeStart, nodeCount }`
- `edgeShards[]`: `{ shardId, edgeStart, edgeCount }`
- Phase 2 only:
  - `edgeShardNodeIndex[]` (local->global node id table)
  - `edgeShardNodeRemap[]` (per edge endpoint remap)

Resource cache keys become shard-aware:

- `indirect:edge:colors:shard:${id}`
- `indirect:edge:endpoints:shard:${id}`
- `indirect:node:positions:shard:${id}`

## Renderer changes (high level)

Primary file: `src/rendering/engine/GraphLayerWebGPUIndirect.js`

- Add shard planner:
  - Compute max entities per channel from `maxStorageBufferBindingSize`.
  - Pick shard size from strictest active channel in current variant.
- Upload shard buffers instead of one monolithic buffer.
- Build bind groups per shard (or shared layouts + per-shard entries).
- Render loop iterates shards:
  - Node pass: one draw per node shard (phase 2) or unchanged (phase 1).
  - Edge pass: one draw per edge shard.

Potential shared helper:

- `src/rendering/resources/WebGPUSharding.js` for shard math and split helpers.

## Shader changes

Phase 1:

- Minimal shader changes if each edge shard preserves current indexing model
  within its own edge range.

Phase 2:

- Add remap path for edge endpoint node lookups:
  - Read local endpoint ids or remap global ids through a lookup table.
- Keep mapper-driven variant behavior intact (uniform/buffer/node-sourced).

## Picking / AttributeTracker impact

- Attribute tracker indirect path must match draw sharding so pick IDs remain
  correct.
- Recommended approach:
  - Keep original global indices in encoded/pick outputs.
  - Ensure shard-local draw index does not leak into public IDs.

## Performance expectations

Expected:

- Slight CPU overhead from planning and more draw calls.
- Lower risk of hard failures on large graphs.

Likely tradeoff:

- At medium graph sizes, monolithic buffers may remain faster.
- At large graph sizes, sharding enables rendering that currently fails.

## Test plan

Unit:

- Shard planner computes channel-safe shard sizes for active variants.
- Buffer split utilities preserve exact data and ordering.
- Remap tables are correct (phase 2).

Integration:

- Existing indirect visual tests still pass with sharding disabled.
- New large-graph tests force sharding and verify:
  - no binding-size exceptions,
  - stable rendering output,
  - correct picking IDs.

Stress:

- Toggle mapper variants at runtime to ensure shard replan/rebind correctness.

## Rollout strategy

1. Add behind a flag:
   - `webgpuIndirectSharding: 'off' | 'auto'` (default `off` initially).
2. Enable `auto` once test coverage is stable.
3. Keep clear diagnostics:
   - whether sharding was used,
   - shard counts,
   - limiting channel.

## Open decisions

- Shard size policy:
  - fixed budget ratio (for headroom), or exact cap fit.
- Whether to preallocate shard buffers across frames or grow lazily.
- Whether phase 2 remap should be mandatory for very sparse/high-id graphs.
