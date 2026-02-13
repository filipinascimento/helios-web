# WebGPU performance improvements (Safari-focused)

This note tracks actionable ideas from profiling a very large graph (for example ~2M nodes) where Safari/WebGL2 can outperform Safari/WebGPU under comparable render settings (including weighted transparency).

## Current observations (from this repo’s code paths)

- WebGL2 uses a mature instanced-attribute path that often maps well to Apple GPU drivers.
- WebGPU weighted transparency remains multipass and can introduce meaningful pass/setup overhead.
- Large sparse/indexed resources can still hit per-binding/per-buffer limits before total memory is exhausted.
- Runtime mapper edits can trigger pipeline/bind-group churn if not tightly cached.

## Why WebGL2 can beat WebGPU on Safari (likely reasons)

- WebGPU vertex pulling through storage buffers can be slower than the WebGL instanced-attribute path on some Apple GPU/driver combinations.
- Weighted transparency adds extra render passes and attachment management.
- CPU overhead from per-frame resource checks/rebinds can become visible at very large scales.

## Potential improvements in `helios-web-next`

Ordered roughly by expected impact for large, mostly-static graphs on Safari.

### 1) LOD / interaction heuristics during camera motion

During active camera drag/zoom:
- temporarily reduce edge cost (internal resolution, edge mode, or sampled edge subset)
- restore full quality after a short idle delay

### 2) WebGPU instancing path prototype

Longer-term: benchmark a path using vertex-buffer instancing (`stepMode: 'instance'`) for frequently-read channels and compare against current storage-buffer pulling.

### 3) Reduce weighted-pass churn

- Cache weighted texture views across frames.
- Recreate resolve bind groups only when resources actually change (resize/reallocation).

### 4) Tighten per-frame resource gating

- Gate uploads by stable signatures (topology + attribute versions + resource shape).
- Keep memory-identity safety checks for view invalidation scenarios.

## Suggested measurement checklist

- Split CPU vs GPU time: nodes-only, edges-only, weighted off/on.
- Compare WebGPU variants with different data access patterns.
- Track bind-group/pipeline cache hit rates during mapper edits.
- Measure upload volume per frame and per interaction state.
