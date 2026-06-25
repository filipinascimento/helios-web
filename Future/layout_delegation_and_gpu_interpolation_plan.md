# Layout Delegation Plan (Helios Web Next)

**Date:** 2026-01-26

## Goals
- Make layout algorithms modular by delegating position ownership to a pluggable object.
- Allow renderer/layout to consume positions from network attributes or a delegate.
- Ensure delegated positions respond to network structural changes before the next render.

## Non‑Goals (for initial rollout)
- Breaking the existing public API for layouts/rendering.
- Requiring helios-network to change its internal storage unless necessary.

---

## 1) Position Delegation Interface (runtime)
**Objective:** Standardize how a delegate owns and serves positions, subscribes to network events, and synchronizes with the network when requested.

### Interface (conceptual)
- `attach(network, options)`
  - Initializes internal state using current positions.
  - Registers for network change events.
- `detach()`
  - Unsubscribes from network events, releases resources.
- `onNetworkEvent(event)`
  - Handles node/edge additions/removals and attribute changes.
- `getPositionSource()`
  - Returns a `PositionSource` compatible view (CPU array, GPU buffer handle, or proxy object).
- `syncFromNetwork()`
  - Pulls positions from network once (initialization / resync).
- `syncToNetwork()`
  - Pushes delegate positions into network positions attribute (explicit call only).

### Notes
- Delegation is opt‑in. Default path remains network-owned positions.
- Delegate should keep its own buffers and avoid duplication when possible.

---

## 2) PositionSource Abstraction
**Objective:** Layout algorithms and renderer should read positions through a uniform source, regardless of ownership.

### Proposed components
- `PositionSource` interface
  - `getView()` → CPU view
  - `getGpuHandle()` → optional GPU handle
  - `getMeta()` → metadata (stride, dtype, count)

- Implementations
  - `NetworkPositionSource` (current behavior)
  - `DelegatePositionSource` (wraps `PositionDelegate`)

### Integration steps
- Update layout runners to accept `positionSource`.
- Provide compatibility shim so existing algorithms continue to work until refactor.
- Rendering pipeline checks for delegate-provided GPU buffers and can render directly from them when available.

---

## 3) Network Event Bridge
**Objective:** Delegate receives incremental changes without polling.

### Tasks
- Implement an adapter mapping network events to `onNetworkEvent`.
- Normalize payloads: `{type, nodeIds, edgeIds, attributes}`.
- Ensure deterministic event ordering.
- Guarantee delegate updates complete before the next render pass when structural changes occur.

---

## 4) Renderer/Layout Integration
**Objective:** Make selection of position ownership and interpolation explicit.

### Proposed config
```
positions: {
  source: "network" | "delegate",
  delegate?: PositionDelegate,
}
interpolation: {
  enabled: boolean,
  type: "cpu",
}
```

### Rendering pipeline behavior
- Prefer delegate buffers when present.
- Allow direct rendering from delegate-owned GPU buffers if compatible with the active backend.

---

## 5) Tests
- Unit tests for `PositionDelegate` lifecycle.
- Renderer tests for interpolated position selection.
- Event bridge tests with simulated network changes.
- Add a small set of delegation examples for testing:
  - Example A: CPU delegate that mirrors positions with minimal logic.

---

## 6) Docs
- Add a new doc describing delegation usage.
- Document buffer-copy tradeoffs (worker snapshots, CPU interpolation snapshots, sparse/indexed repacks).

---

## Phased Delivery
**Phase 1:** Delegation + PositionSource + event bridge (CPU only).

**Phase 2:** Tighten APIs + finalize docs/examples.
