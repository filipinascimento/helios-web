# Interpolation pipelines (CPU vs. network/WASM)

This document explains how Helios’ position interpolation works end‑to‑end, including the CPU (JavaScript) pipeline and the network/WASM pipeline. It details the flow, timing, buffer ownership, and where allocations occur.

## Glossary

- **Network backend**: The WASM/C interpolation path, driven by `helios-network`.
- **CPU backend**: The JavaScript interpolator path, driven by `CpuLinearPositionInterpolator`.
- **GPU backend**: A shader‑side interpolation path (WebGL2/WebGPU) that blends source/target positions in the vertex shader.
- **Target positions**: The latest layout output (the “goal” positions to interpolate toward).
- **Source positions**: The positions currently in the renderer/visual buffers.
- **Delegate**: A `PositionDelegate` that can mirror positions on the JS side.
- **Dense overrides**: CPU‑side packed buffers used by the renderer to update GPU data.
- **Layout cadence**: The time between layout iterations (used to set interpolation duration).

---

## 1) High‑level architecture

### 1.1 Where interpolation lives

- **CPU pipeline** lives entirely in `helios-web-next` (JavaScript).
- **Network/WASM pipeline** lives in `helios-network-v2` (C/WASM), with JavaScript glue in `helios-network` and orchestration in `helios-web-next`.

### 1.2 Who triggers interpolation

Both pipelines are triggered by layout updates. The layout emits a “positions updated” signal and the `Helios` instance chooses one of two pipelines based on configuration:

- `interpolation.backend: 'cpu'` → CPU pipeline.
- `interpolation.backend: 'network'` → WASM pipeline (if supported).
- `interpolation.backend: 'gpu'` → Shader pipeline (WebGL2/WebGPU).
- `interpolation.backend: 'auto'` (default) → WASM if available, otherwise CPU.

---

## 2) CPU interpolation pipeline (JavaScript)

### 2.1 Lifecycle summary

1. **Layout updates positions** (in JS) and calls `emitUpdate(payload)`.
2. `Helios._handleLayoutUpdate(payload)` is invoked.
3. A **snapshot of the current positions** is captured.
4. The **CPU interpolator** starts blending from the snapshot to the new target.
5. Each render frame requests interpolated overrides and pushes them to the renderer.

### 2.2 Step‑by‑step flow

1. **Layout produces new positions**
   - Layouts (static or worker) write into `visuals.nodePositions`.
   - Then they call `emitUpdate({ positions, timestamp })`.

2. **Handle layout update**
   - `Helios._handleLayoutUpdate(payload)` checks if CPU backend is active.
   - It estimates **layout cadence** from recent layout timestamps (average of last 5 intervals).
   - If no explicit `interpolation.durationMs` is set, it sets `durationMs` to that average cadence.

3. **Snapshot creation (CPU)**
   - `_capturePositionSnapshot()` captures dense overrides into the interpolator.
   - This is the **source** buffer for blending.

4. **Rendering loop**
   - During render, the CPU interpolator computes interpolated positions for the current time.
   - The overrides are applied to rendering buffers and uploaded to the GPU.

### 2.3 Timing model

- If `durationMs` is not provided, it is derived from the **average of the last 5 layout intervals**.
- The interpolation fraction is linear in time across `durationMs`.

### 2.4 Buffer usage and memory

**Where buffers live:**

- Source: CPU dense overrides (JS memory)
- Target: layout‑generated positions (JS memory)
- Interpolated output: dense overrides (JS memory)
- GPU uploads: created by the renderer

**Allocations:**

- CPU pipeline allocates JS arrays for overrides and interpolated results.
- No WASM memory allocations are required.

---

## 3) Network/WASM interpolation pipeline (C/WASM)

### 3.1 Lifecycle summary

1. **Layout produces new positions** and emits `payload`.
2. `Helios._handleLayoutUpdate(payload)` captures the **target positions** into a WASM buffer.
3. A render loop advances the interpolation in WASM via `network.interpolateNodeAttribute(...)`.
4. The renderer uses the updated attribute buffer directly for GPU uploads.

### 3.2 Step‑by‑step flow

1. **Layout produces new positions**
   - Same as CPU: layout writes into `visuals.nodePositions`.
   - `emitUpdate({ positions, timestamp })` is called.

2. **Capture target (WASM)**
   - `Helios._captureNetworkInterpolationTarget(payload, timestamp)` is called.
   - It ensures a WASM buffer exists for the target positions.
   - It copies the latest positions into that buffer.

3. **Interpolation step**
   - On each render tick, `Helios._advanceNetworkInterpolation()` calls:
     
     `network.interpolateNodeAttribute(name, target, { elapsedMs, layoutElapsedMs, smoothing, minDisplacementRatio })`

4. **WASM interpolator updates the attribute buffer**
   - The C code blends the existing attribute buffer toward the target buffer.
   - It returns whether additional steps are required.

### 3.3 Timing model (WASM)

- `elapsedMs` = time since last interpolation step.
- `layoutElapsedMs` = **average of the last 5 layout intervals** (same window as CPU).
- `smoothing` and `minDisplacementRatio` shape the exponential easing.

#### Exponential rule

The WASM pipeline uses an exponential decay, where the remaining displacement after one layout interval is approximately:

$$
\text{remaining} = e^{-\text{smoothing}}
$$

If `autoSmoothing` is enabled in JS, it maps a desired remaining ratio to `smoothing`:

$$
\text{smoothing} = -\ln(\text{targetRemaining})
$$

### 3.4 Buffer usage and memory

**Where buffers live:**

- **Source attribute** (current positions): the *node position attribute buffer* in WASM memory, owned by `helios-network`.
- **Target buffer**: a private node attribute named like `__helios_target_<attr>` allocated via the normal attribute pipeline.

**Do we have two buffers?**

Yes—during network interpolation there are *two* relevant buffers in WASM memory:

1. **Current positions** (the node position attribute buffer).
2. **Target positions** (the interpolation target buffer allocated by Helios).

There is **no third “previous” buffer** stored in WASM for interpolation. The current positions live in the attribute buffer itself and are updated in place each interpolation step.

**Allocations and updates:**

- Target buffer allocation happens through the normal attribute pipeline when the private attribute is defined.
- Layout updates pass the latest JS positions to `interpolateNodeAttribute(...)`.
- `helios-network` writes those values into the private target attribute buffer.
- The C interpolator reads from the target buffer and **writes into the node position attribute buffer**.
- The renderer reads the node position attribute buffer for GPU uploads.

**Important rule:**

When `withBufferAccess()` is active, allocation is forbidden. The code avoids allocating inside buffer‑access sessions, and will reuse pre‑allocated target buffers.

---

## 4) Buffer access safety and guards

### 4.1 Why buffer access is guarded

In `helios-network`, any allocation can trigger a WASM memory growth. That invalidates TypedArray views pointing at old buffers.

To avoid this:

- `network.withBufferAccess(fn)` increments a guard depth.
- During guarded access, allocation‑prone methods throw.
- Interpolation target allocation is avoided in guarded blocks.

### 4.2 Where guard enforcement happens

- `helios-network` throws inside `_assertCanAllocate()` when allocations are attempted during buffer access.
- Helios JS now checks the buffer access depth before allocating a new target buffer.

---

## 5) Comparison summary

| Aspect | CPU pipeline | Network/WASM pipeline |
|---|---|---|
| Interpolator | JS linear interpolator | C/WASM exponential interpolator |
| Target buffer | JS typed arrays | WASM buffer (`_malloc`) |
| Source buffer | JS overrides | WASM attribute buffer |
| Timing | Linear over `durationMs` | Exponential with `elapsedMs` + `layoutElapsedMs` |
| Allocation risk | Low | Must avoid during `withBufferAccess()` |
| GPU upload | Dense overrides | Attribute buffer directly |

---

## 6) Where to look in code

### Helios Web Next

- Pipeline selection: `Helios._configurePositioning()`
- Layout update handler: `Helios._handleLayoutUpdate()`
- Network target capture: `Helios._captureNetworkInterpolationTarget()`
- Network advance: `Helios._advanceNetworkInterpolation()`
- CPU interpolator: `CpuLinearPositionInterpolator`

### Helios Network v2

- JS wrapper: `HeliosNetwork.interpolateNodeAttribute()`
- WASM interpolation: `CXAttributeInterpolateFloatBuffer` (C)
- Buffer access guard: `withBufferAccess()` / `_assertCanAllocate()`

---

## 7) Practical notes

- If interpolation is **choppy**, check layout update cadence and smoothing settings.
- If you see **detached buffer errors**, it usually means a new allocation happened while views were still in use.
- For very large networks, prefer the network/WASM pipeline for performance, but ensure target buffers are preallocated.
