# Helios Web Next vs “Legacy” Helios Web (for_reference)

This document summarizes the biggest changes between **Helios Web Next** (this repo) and the previous **Helios Web** implementation kept under `for_reference/helios-web-older-for-reference/`.

The goal of Helios Web Next is not “the same code, updated” — it’s a cleaner, more modular renderer scaffold that:

- Wraps the **`helios-network` WASM core** (graph + typed attributes + serialization)
- Uses a **layered rendering stack** that targets **WebGPU first** and falls back to **WebGL2**
- Makes visuals and interactivity more scalable via **mappers**, **indirect sparse/indexed pipelines**, and **bitmask states**
- Has a strong emphasis on **repeatable correctness** via Playwright E2E tests

## Biggest architectural shifts

### 1) Core graph engine: JS Network → `helios-network` (WASM)

**Legacy Helios Web** ships its own JS-side `Network` implementation (see `for_reference/.../src/core/Network.js`) and a large WebGL-driven core class (see `for_reference/.../src/core/HeliosCore.js`).

**Helios Web Next** instead expects an initialized `helios-network` instance:

- Graph structure + attributes live in WASM-managed memory.
- Visual attributes are treated as **typed, dimensioned attributes**.
- Many operations can avoid object-per-node overhead and can be expressed as bulk typed buffer updates.

**Why this matters**

- Better scaling characteristics for large graphs (especially for attribute-heavy workloads).
- Cleaner integration: your app can “own” the network core and plug it into Helios for rendering.
- A single source-of-truth for data, layouts, and visuals (less duplication / conversion).

### 2) Rendering: monolithic WebGL core → modular layered renderer (WebGPU-first)

Legacy Helios Web is primarily a **WebGL** renderer embedded directly into the main Helios class (manual shader programs, WebGL context management, plus specialized features like density rendering).

Helios Web Next uses a **LayerManager + LayeredRenderer** approach:

- A stack of DOM layers (canvas + HTML overlay + optional SVG/other overlays)
- A renderer backend that prefers **WebGPU** when available and automatically falls back to **WebGL2**
- A more explicit separation between:
  - camera/projection
  - GPU resources
  - graph layer draw logic
  - UI overlay

**What this enables**

- Progressive enhancement: WebGPU when possible, WebGL2 otherwise.
- Easier extension points: additional rendering passes, frame capture, debug overlays, custom graph layers.
- Less coupling between UI, data, and GPU implementation details.

### 3) Visual pipeline: ad-hoc per-feature updates → mappers + indirect sparse/indexed model

Legacy Helios Web computes/updates many visual properties inside the renderer-driven core and maintains a mixture of buffers and per-feature logic.

Helios Web Next formalizes this via the pipeline in `src/pipeline/`:

- **`Mapper`** utilities convert arbitrary node/edge attributes into visual channels (color, size, width, etc.).
- Mapped values are written into **sparse visual attributes** on the `helios-network`.
- The renderer consumes **indirect sparse/indexed buffers** built directly from those attributes.

**Advantages**

- Mapping logic becomes composable and testable (instead of being hidden inside rendering code).
- Visual changes are expressed as attribute transforms, which scales better and is easier to serialize.
- Clear separation of concerns: “derive visuals” vs “upload/draw visuals”.

### 4) Interaction styling: heavyweight rewrites → `u32` bitmask states (shader-driven)

Legacy Helios Web includes interaction/picking infrastructure and feature flags, but state-driven styling is typically expressed by updating buffers/values.

Helios Web Next introduces a fast **bitmask state system** (`docs/states.md`):

- One `u32` per node/edge encodes multiple states (selected/highlighted/filtered/custom).
- Styles are applied in shaders via “slots”.
- Supports an **ephemeral hover state** that can be applied in shaders **without writing to buffers**.

**Why this matters**

- Common UX patterns (“dim all, highlight selection”) are cheap even for large graphs.
- Hover effects don’t require writing large buffers every mousemove.
- Provides a consistent, high-level API for selection/highlight/filter without special-case code.

### 5) Layout execution: main-thread heavy logic → explicit worker layout support

Legacy Helios Web uses worker-based layout support (e.g., `d3force3dLayoutWorker.js`) but it is tightly integrated into the core.

Helios Web Next provides a clearer layout abstraction:

- `StaticLayout` fallback
- `WorkerLayout` that proxies work to a layout worker
- A scheduler that sequences layout ticks, buffer updates, and renders

**What this enables**

- Keeping long-running layouts off the main thread.
- A simpler story for adding new layout families (worker or non-worker).

### 6) Optional UI system: “demo/UI inside core” → HeliosUI overlay + Web Components

Legacy Helios Web shipped UI elements and demo tooling, but the UI was not designed as a reusable, framework-agnostic overlay layer.

Helios Web Next includes an optional **HeliosUI** overlay (`docs/UI.md`):

- Dockable, resizable panels (panel manager)
- `UIAttribute` binding model (read/write/subscribe)
- Reactive sync via Helios accessor events (no polling)
- A minimal theming system driven by CSS variables
- A small set of reusable Web Components (e.g. `<helios-panel>`)

**Advantages**

- The renderer stays UI-free; UI is “just another layer”.
- You can embed Helios UI in apps without adopting a framework.
- Stronger reusability for internal tools (inspector panels, mapping editors, metrics, etc.).

### 7) Testing & stability: limited coverage → Playwright E2E matrix

Helios Web Next has a much more explicit testing posture:

- Node unit tests (`node --test`)
- Extensive Playwright coverage for real rendering behavior (picking, resizing, UI, rendering options, weighted transparency, etc.)

**Why this matters**

- Helps prevent regressions in GPU backends, interactions, and docs examples.
- Encourages building features “with an assertion”, not just “works on my machine”.

## Feature-level highlights in Helios Web Next

Concrete capabilities visible in `docs/` and `tests/` include:

- WebGPU-first renderer with WebGL2 fallback
- Robust picking (including attribute picking) + resize correctness tests
- Mapper-driven visuals (channels, colormaps, previews)
- Bitmask states with shader styling slots + hover-without-writes
- Network I/O oriented around `helios-network` formats (`.xnet`, `.zxnet`, `.bxnet`) and UI wiring for file load/save
- A dockable, themeable UI overlay with bindings to Helios “global knobs”

## What the legacy version had (and what may differ today)

A few notable legacy capabilities visible in the `for_reference` snapshot:

- Parsing/import helpers for formats like **GML** and **GEXF** (`src/utilities/parsers/*`)
- A **density rendering** path (`DensityGL`) tightly integrated into the WebGL renderer
- A larger collection of demos/examples and a published docs site focused on those demos
- Additional experimental renderer modes/flags (e.g. hyperbolic/topographic options in the core constructor)

Helios Web Next intentionally focuses on a smaller, more maintainable core and pushes format support + specialized rendering modes toward clearer, modular integration points.

## Practical “why you’d choose Next”

If you’re building a product/tool around Helios (not just running a demo), Helios Web Next is geared toward:

- **Better integration**: apps can own the graph core (`helios-network`) and plug in rendering.
- **Backend flexibility**: WebGPU where available, without dropping WebGL2 users.
- **Scalable interaction**: state-driven styling and fast hover patterns.
- **Composable visuals**: mapping rules are explicit and reusable.
- **Maintainability**: the codebase is partitioned into layers/pipeline/rendering/ui.
- **Confidence**: automated tests that exercise real browser/GPU behavior.

## Migration notes (high-level)

- **API shape changes**: legacy `new Helios({ nodes, edges, elementID, use2D, ... })` becomes `new Helios(network, { container, ... })`.
- **Data model changes**: instead of free-form node objects, visuals and layout use typed attributes stored in `helios-network`.
- **File formats**: legacy exposed GML/GEXF parsing; Next currently emphasizes `.xnet/.zxnet/.bxnet` via `helios-network`.

If you want, I can also add a short “migration checklist” section based on the most common legacy usage patterns (nodes/edges objects, density mode, 2D mode, file import, etc.).
