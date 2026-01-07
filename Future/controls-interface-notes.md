# Helios-Web Optional Interface System — Notes & Options

This document captures a proposal for adding an optional (but complete) interface system to `helios-web-next` for controlling layout, visualization parameters, and mappers, without committing the core library to a specific UI framework.

## Goals

- Provide a **complete control surface** (layout + renderer + camera + picking + mappers) that is **optional**.
- Keep the core **framework-agnostic** and **headless-first**.
- Support **reactive updates**, batching, and two-way sync (UI ⇄ Helios).
- Make controls **composable**: nested, rearrangeable, dockable, movable, and programmatically constructible.
- Make configurations **serializable** for presets, URL sharing, and persistence.

## Observations From Current Code

Helios already exposes effectful APIs that can be driven by a reactive layer:

- Layout:
  - `Helios` can swap layouts via `helios.setLayout(layoutInstance)`.
  - There is a `WorkerLayout` backed by `src/workers/layoutWorker.js` with options such as `layout: 'force3d'|'jitter'`, force constants, etc.
  - Layout lifecycle is already signaled via `EVENTS.LAYOUT_START` / `EVENTS.LAYOUT_STOP`.

- Visual mapping:
  - `MapperCollection` exists (`helios.nodeMapper`, `helios.edgeMapper`).
  - `MapperCollection.add(descriptor)` supports descriptor-driven registration.
  - `Helios` applies combined mappers on geometry frames when dirty.

- Rendering:
  - `LayeredRenderer` exposes edge rendering mode and edge transparency mode setters.
  - `GraphLayer` carries parameters such as edge endpoint trim and state styles.

These are good “effect targets” for a higher-level controls state.

## The Core Recommendation: Separate Control State From Effects

The most robust approach is:

1. **Control State (pure, serializable)**
   - A store with `getState()`, `setState(patch)` (or `dispatch(action)`), and `subscribe(listener)`.
   - Holds both:
     - `settings`: renderer/layout/camera/picking/mappers
     - `uiLayout`: panel/control layout tree (nesting, docking, ordering)

2. **Helios Binding Layer (effectful adapter)**
   - Subscribes to the store, computes diffs, applies changes to Helios.
   - Batches changes and schedules `helios.requestRender()` / `scheduler.requestGeometry()` exactly once per update cycle when possible.
   - Optionally listens to Helios events (e.g. camera changes) and updates store for two-way sync.

This keeps Helios internals out of control widgets and enables multiple frontends.

## “Reactive” Without Choosing a Framework

A minimal store API is enough:

- `subscribe(listener): () => void`
- `getState(): State`
- `setState(patch | (prev) => next)` or `dispatch(action)`

Batching strategies (in the binding layer):

- Microtask batching (queue once per tick)
- `requestAnimationFrame` batching for sliders and high-frequency updates
- Optional debounced “commit” vs “preview” for expensive changes

Avoid relying on `Proxy` magic if serializability and debuggability are priorities.

## Controls As a “Graph” (Supports Nesting & Rearrangement)

To support nested/movable controls, represent the interface as data:

- **Control nodes**: panels/groups/controls
- **Operations**: `moveNode`, `wrapInGroup`, `splitPanel`, `tabify`, `float`

Example node shapes (conceptual):

- `panel`: title + children
- `group`: title + collapsible + children
- `control`: references a control spec by id/kind

This makes rearranging a pure state edit and supports programmatic UI construction.

## Best Developer Interface for Control Authors

Provide a small set of stable primitives:

1. **Typed settings model** (`HeliosSettings`) — serializable
2. **Bindings (lenses)** for controls
   - Controls read/write settings via `binding.get(state)` / `binding.set(value, ctx)`
   - Controls do not call Helios directly
3. **Commands/actions** for non-trivial operations
   - `dispatch({ type: 'ADD_MAPPER', ... })`
   - Enables undo/redo, logging, remote control
4. **Registry / plugin API**
   - `registerControl(kind, { schema, defaults, render? })`
   - `registerCommand(name, handler)`

This yields composability and keeps the UI renderer replaceable.

## Plugin Approaches for Layouts

Layouts are “things that run.” Possible plugin surfaces:

1. **Registry + factory (headless)**
   - `registerLayout(id, { label, schema, create(helios, params) })`
   - UI renders inputs from schema; binding layer calls `helios.setLayout(create(...))`

2. **Worker-layout parameter plugins** (fits current worker)
   - Layout plugin contributes `workerOptionsPatch` + schema
   - Binding layer updates `WorkerLayout` options (either by re-instantiating or via messages)

3. **Full Layout class plugins**
   - Plugin supplies a `Layout` subclass (CPU or worker-backed)
   - UI remains schema-driven; Helios only needs a `Layout` instance

4. **UI component plugins**
   - For complex layouts: plugin supplies its own panel component
   - Still recommended to keep a serializable schema model underneath

## Plugin Approaches for Mappers / Mapper Editor

Mappers are “things that compile to visuals.” Approaches:

1. **Descriptor-first (recommended)**
   - Define a stable JSON mapper format that mirrors `MapperCollection.add(descriptor)`
   - Editor edits descriptor; binding layer compiles/applies to `MapperCollection`

2. **Node-based/DAG editor**
   - Represent mapper as a small graph: Source → Transform/Scale → Channel
   - Serialize the graph; compile to the descriptor format

3. **Extensible operations**
   - `registerMapperOp(id, { label, schema, apply })`
   - Editor offers ops dynamically; compile-time resolves registered ops

4. **Two-tier UX**
   - Simple mode: sliders/selects for common channels
   - Advanced mode: full descriptor/DAG
   - Both output the same canonical mapper representation

## UI Delivery Options (Optional)

1. **Headless only**
   - Ship store + registries + binding layer
   - Host apps implement UI in any framework

2. **Built-in overlay UI via Web Components**
   - Export a separate entrypoint (e.g. `helios-web-next/ui`)
   - Provide `<helios-controls>` / `<helios-panel>` with docking support
   - Uses DOM + CSS; avoids framework lock-in

3. **Separate “Studio” app**
   - Best for power users: presets, inspector views, capture/export, performance
   - Still uses the same headless APIs

4. **Framework adapters**
   - Optional wrappers like `helios-web-next/react` that render the control graph
   - Keep core unchanged

## Theming & Styling (Fully Customizable)

To make the optional UI fully customizable via CSS and/or JavaScript themes, treat visuals as **design tokens** rather than hardcoded styles.

### CSS-first (recommended baseline)

- Use **CSS custom properties** as the primary theming API (colors, spacing, typography, radii, shadows, z-indexes, etc.).\n+- Keep component styles expressed in terms of variables so users can override them globally or per-container.\n+- Provide a small default theme stylesheet (light/dark) that only defines variables.

Example token namespace (conceptual):\n+- `--helios-ui-bg`, `--helios-ui-fg`, `--helios-ui-muted`\n+- `--helios-ui-accent`, `--helios-ui-accent-contrast`\n+- `--helios-ui-border`, `--helios-ui-shadow`\n+- `--helios-ui-radius`, `--helios-ui-gap`, `--helios-ui-font`, `--helios-ui-font-size`

### Web Components considerations

If you ship controls as Web Components:\n+- Prefer **open styling hooks**:\n+  - Set variables on the host element (`<helios-controls style=\"--helios-ui-accent: ...\">`).\n+  - Expose internal elements via `part=\"...\"` and document `::part()` selectors.\n+- If using Shadow DOM, variables still pierce; `::part()` enables targeted customization without leaking DOM structure.\n+- Avoid deeply nested, brittle selectors; tokens + parts are the stable contract.

### JavaScript theme objects

Support a JS theme file/object that maps to CSS variables:\n+- `applyTheme(target, theme)` sets `target.style.setProperty('--helios-ui-accent', theme.accent)` etc.\n+- Allow theme composition/overrides (`baseTheme` + `patchTheme`).\n+- Optionally support persistence (`localStorage`) and runtime switching (light/dark/custom presets).

This keeps the UI framework-agnostic: any renderer (Web Components, React, vanilla) can consume the same theme object and/or CSS variables.

## Suggested Incremental Implementation Plan

1. Define `HeliosSettings` schema (renderer/layout/camera/picking/mappers)
2. Implement a minimal store + `subscribe()`
3. Add binding layer: apply diffs → Helios effects (batched)
4. Add layout + mapper registries (schema + factories)
5. Add serialization: `toJSON()/fromJSON()`, localStorage presets, URL sync
6. Build an optional UI renderer (Web Components or Studio) atop the control graph

## Notes

- Keep a single “apply path” (settings/actions → compile → Helios effects) to avoid drift.
- Prefer serializable state + explicit actions over implicit Proxy-based reactivity.
- In Helios, schedule `requestGeometry()` when changes affect visuals/mappers/layout, and `requestRender()` for pure render tweaks.
