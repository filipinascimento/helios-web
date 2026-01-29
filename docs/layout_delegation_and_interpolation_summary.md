# Layout Delegation & Interpolation Summary

**Date:** 2026-01-28

## Overview
This update introduces a modular layout/position pipeline that can delegate ownership of positions, provide dense position overrides to the renderer, and interpolate positions for smoother visuals. The goal is to decouple layout algorithms from renderer storage, support external position ownership, and allow smoother updates even when layout steps are intermittent.

## What changed
### 1) Position delegation layer
- Added a position delegate interface and basic implementations in:
  - src/layouts/positions/PositionDelegate.js
- Key capabilities:
  - `attach()` / `detach()` lifecycle
  - `getPositionView()` for CPU position access
  - `getDenseOverrides()` to provide dense node/edge position buffers to rendering
  - `onNetworkEvent()` hook for topology changes
  - Optional `syncToNetwork()`
- Included simple delegates for testing:
  - `CpuMirrorPositionDelegate`
  - `ExternalBufferPositionDelegate`

### 2) Interpolation (CPU overrides)
- Added CPU linear interpolator:
  - src/layouts/positions/PositionInterpolator.js
- Captures pre/post position snapshots and provides interpolated dense overrides.
- Enabled via Helios `interpolation()` helper (default backend).

### 3) Interpolation (C core / network backend)
- Added a native helper in the helios-network C core:
  - `CXAttributeInterpolateFloatBuffer(...)` in CXNetwork.c
  - Exported from WASM and surfaced via JS: `HeliosNetwork.interpolateNodeAttribute(...)`
- The interpolator applies a time-scaled exponential smoothing step in-place on a float attribute buffer, bumps the attribute version, and returns whether more steps are recommended.
- Helios supports `interpolation.backend = "network"`:
  - Captures the latest layout positions into a WASM-backed target buffer.
  - Each geometry frame advances `_helios_visuals_position` toward the target using the C helper.
  - The delegate becomes the position source, but visuals come from the network buffer (no renderer overrides).
  - Attribute changes are marked silently (dense buffers update) to avoid event feedback loops.

### 4) Renderer position overrides
- Renderer now accepts position overrides in the frame payload:
  - GraphLayer applies overrides to dense geometry
  - AttributeTracker reuses overrides for picking buffers

### 5) Helios integration
- New Helios helpers:
  - `positions(options)` / `setPositions(options)`
  - `interpolation(options)` / `setInterpolation(options)`
- Layout updates route through a shared handler that:
  - marks position buffers dirty
  - synchronizes delegate (optional)
  - captures interpolation snapshots (CPU backend)
  - captures network interpolation targets (network backend)
  - schedules geometry/render

### 6) UI demo integration
- Added a Layout panel to the basic demo:
  - layout selection (static/jitter/force)
  - interpolation toggle wired to the network backend
  - layout update interval selector to showcase sparse updates
  - docs/examples/basic/main.js

### 7) Tests
- Added unit tests for delegation:
  - tests/positionDelegation.test.js
- Added unit test for network interpolation helper:
  - helios-network-v2/tests/interpolate_positions.test.js

## Timing details
The C interpolator uses layout iteration timing to normalize step size and smooth movement:

- Normalize layout time: $T = \mathrm{clamp}(\text{layoutElapsedMs}, 10, 2500)$
- Clamp step: $\Delta t = \min(\text{elapsedMs}, 20)$
- Compute $dt = \Delta t / T$
- Weight: $w = 1 - e^{-k \cdot dt}$, where $k$ is the smoothing factor (default 6)
- Update: $p_{t+1} = p_t + w \cdot (p_{\text{target}} - p_t)$

This preserves responsiveness when layout updates are sparse while preventing large jumps.

## Event behavior
- The C interpolator bumps the native attribute version so dense buffers update.
- JS marks dependent buffers dirty without emitting `attribute:changed` by default (prevents layout feedback loops).
- Optional emission is available via `emitEvent: true` in `interpolateNodeAttribute`.

## Notes & constraints
- WASM buffer views are accessed within buffer-access guards.
- Delegates prefer passing views instead of copying large buffers.
- Dense overrides avoid duplicating full buffers unless required for interpolation.

## Demo note: why interpolation can look unchanged
The default worker layouts update every tick, so positions are already smooth. To observe interpolation clearly, increase the layout update interval in the demo panel (e.g., 1–2 seconds). This makes layout updates sparse while rendering continues every frame, so interpolation becomes visible.

## Copy & memory notes
- Worker layouts currently copy positions when sending them to the WebWorker. This is required for the structured clone transfer and happens per layout update (not per render frame).
- CPU interpolation snapshots (when `backend: "cpu"`) copy dense buffers into previous/current snapshots.
- `CpuMirrorPositionDelegate.getDenseOverrides()` builds dense buffers by iterating active indices; this is a deliberate, GPU-friendly repack that trades memory for speed.
- Network interpolation can avoid per-frame copies when the target buffer is WASM-backed; only layout-update captures perform a bulk copy into the WASM target.
- Attribute buffers must be iterated through active indices; dense buffers are contiguous but may include gaps and carry a rebuild cost.

## Current limitations
- Network backend interpolation mutates the network’s position attribute (expected for that backend).
- Delegate implementations are still CPU-oriented and do not expose GPU-native buffers.
- Dense overrides are applied at the graph layer level, not per-attribute in shaders.

## Future follow-ups
- GPU-based interpolation in WebGPU/WebGL shader paths.
- Delegate types that expose GPU buffers directly to the renderer.
- Optional network-side ownership flags (explicitly pin visual positions to external buffers).
