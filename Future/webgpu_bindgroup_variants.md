# WebGPU: Variant-Specific BindGroup Layouts (Future)

## Context
We already support mapper-driven **uniform vs per-item-buffer** selection.

- WebGL: constant channels avoid attribute uploads/binds (true “don’t bind what you don’t need”).
- WebGPU: constant channels avoid unnecessary updates/uploads **and** compile shader variants that do not read per-item buffers, but we still bind a “full” bind group layout that includes bindings for those buffers.

This is correct and usually fast enough, but it does not fully satisfy the aesthetic/CPU-side goal: **don’t bind what you don’t need**.

## Current behavior (WebGPU)
In `GraphLayerWebGPU`, the node/edge shader modules and pipelines are keyed by a `variant` (e.g. color buffer vs uniform, size buffer vs uniform, etc). This means:

- If a channel is constant, the WGSL variant uses uniforms and should not read storage buffers for that channel.
- We already avoid uploading those channel buffers (upload is gated by the same variant flags).
- However, the bind group layout and bind group entries are currently “superset” layouts, so we still bind storage buffers for channels that the shader won’t read.

## Why consider changing this?
Potential wins:
- Slight CPU-side reduction: fewer bind group entries, less bookkeeping.
- Cleaner invariant: bound resources reflect actual shader usage.

Potential non-wins / costs:
- Likely small or unmeasurable improvement compared to the already-achieved wins (fewer updates + no redundant upload + shader variant).
- More bind group layouts and bind groups to cache/manage.
- More pipeline layouts (because pipeline layouts depend on bind group layouts).

## Proposed approach
Introduce **variant-specific bind group layouts** (and bind groups) that match the same variant key used for shader module/pipeline selection.

### Node pass
- Today:
  - `nodeBindGroupLayout` and `nodeBindGroupLayoutOutline` are fixed.
- Proposed:
  - Create a function that builds a node bind group layout for a given variant:
    - Always: camera, indices/identity, positions, states, globals, hover.
    - Conditionally include: sizes, colors.
    - Conditionally include outline buffers (and keep the existing outline/non-outline split or fold it into the variant key).
  - Cache layouts: `nodeBindGroupLayoutsByKey: Map<variantKey, GPUBindGroupLayout>`.
  - Cache bind groups: `nodeBindGroupsByKey: Map<variantKey, GPUBindGroup>`.

### Edge pass
- Similarly build/cache per-variant edge bind group layouts:
  - Always: camera, indices/identity, segments, states, globals, hover.
  - Conditionally include: colors, widths, opacities, endpointSizes.

### Resource reuse / constraints
- Keep existing `device.resourceCache.webgpu` keying strategy stable (for example by channel + scope + usage).
- No changes to the “no JS copies of renderer buffers” rule: uploads must still come directly from typed-array views.
- Bind group differences should only affect which buffers are *bound*, not how buffers are allocated or uploaded.

## What to test / measure
Functional:
- Existing E2E suites (WebGPU headed when available) should remain stable.
- Specific focus: toggling channels between constant/buffer at runtime (via UI) should not leak resources or break picking.

Performance:
- Large graph stress test with frequent config changes.
- Metrics:
  - CPU frame time (JS) before/after.
  - Number of bind group recreations per frame.
  - Any GPU validation warnings.

Regression risk areas:
- Pipeline layout cache keys must exactly match bind group layout keys.
- Outline path (currently already split) must remain consistent.

## Decision
Leave as-is for now (correctness + major performance wins already achieved). Revisit after we have a measurement harness that can detect small CPU-side differences.
