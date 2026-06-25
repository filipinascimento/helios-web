# SVG Labels Overlay Plan (Helios Web Next)

**Date:** 2026-02-22

## Goals
- Add node labels without disrupting the current WebGPU/WebGL rendering pipeline.
- Allow any node attribute that resolves to `string` or integer-like values to be used as label text.
- Default label source priority: `Label` attribute, then `Name`, then node id.
- Render labels in the existing SVG layer (`LayerManager.svg`) above the canvas.
- Keep labels performant: only render a bounded subset by importance/visibility.
- Keep label positions updated as camera/layout changes.

## Non-goals (initial rollout)
- Full text rendering on GPU.
- Labeling every node at once.
- Perfect cartographic placement in dense clusters.

---

## Recommended Approach: CPU Selection + SVG Placement (Event-Driven)

This aligns best with the current architecture:
- `LayerManager` already exposes an SVG overlay.
- `Helios` already emits `render:after`, `camera:move`, `resize`, and `network:replaced`.
- We can keep all GPU graph passes untouched.

### High-level design
- Add a lightweight label controller that:
1. Resolves label text for candidate nodes.
2. Projects candidate node positions to screen space.
3. Ranks candidates by importance.
4. Applies a fast screen-space collision pass.
5. Updates/reuses SVG `<text>` elements from a small pool.

### Suggested modules
- `src/labels/LabelResolver.js`
  - Resolves text from configured attribute or fallback chain.
  - Handles string/integer/category mapping.
  - Uses version-aware caching to avoid repeated string fetches.
- `src/labels/LabelProjector.js`
  - World -> screen projection using camera matrices and viewport.
  - 2D fast path + 3D matrix path.
- `src/labels/LabelPlacement.js`
  - Budgeted ranking + occupancy-grid collision culling.
- `src/labels/SvgLabelLayer.js`
  - Owns SVG group and pooled text nodes.
  - Applies minimal DOM diffs.
- `src/labels/index.js`
  - Public API surface used by `Helios`.

### Public API sketch
- `helios.labels()` -> get current config.
- `helios.labels(options)` -> set config.

Config sketch:
- `enabled: boolean`
- `source: string | ((nodeId, network) => string | number | null)` (optional)
- `fallbackSources: ['Label', 'Name', '$id']` (default)
- `strategy: 'auto' | 'selected' | 'largest' | 'hybrid'`
- `maxVisible: number` (default 120)
- `minScreenRadiusPx: number` (default 8)
- `maxUpdateFps: number` (default 20)
- `alwaysInclude: { selected?: boolean, hovered?: boolean }`
- `style: { fontSizePx, fontFamily, fill, halo }`

---

## Candidate Selection Strategy

### Default (`hybrid`) behavior
- Always include hovered and selected nodes (if any).
- Add top nodes by projected size until `maxVisible`.
- Drop labels that fail viewport or min-size thresholds.
- Run collision culling in screen-space grid.

### Ranking score (default)
- `score = projectedRadiusPx^2 * stateBoost * manualWeight`
- `stateBoost`: selected > hovered > normal.
- `manualWeight`: optional attribute-driven multiplier (future extension).

### Why projected size
- Matches your “largest entries / taking some screen” intuition.
- Naturally adapts as zoom changes.
- No graph metric computation required in the hot path.

---

## Label Text Resolution Rules

### Supported defaults
- If `source` provided, use it.
- Else fallback:
1. `Label` (case-sensitive exact match first, then case-insensitive scan option)
2. `Name`
3. Node id (`String(nodeId)`)

### Type handling
- `AttributeType.String`: use `getNodeStringAttribute`.
- `AttributeType.Integer` / `UnsignedInteger` / `Category` / bigint types: read from typed buffer and stringify.
- Non-scalar dimensions: ignore for v1 (or use first component only if explicitly configured).

### Performance rule
- Never call string getters for all nodes every frame.
- Resolve text lazily for shortlisted candidates and cache.
- Invalidate cache when source attribute version changes or network is replaced.

---

## Position Updates and Scheduling

### Trigger sources
- `render:after`: keeps labels in sync with final rendered positions.
- `camera:move`: request label refresh (coalesced).
- `resize`: recompute viewport-dependent thresholds/cells.
- `network:replaced`: rebuild caches/indexes.

### Update pacing
- Coalesce updates with `requestAnimationFrame`.
- Throttle to `maxUpdateFps` while camera/layout is active.
- Allow a lower idle refresh rate (or no refresh) when scene is static.

### Important detail
- Use the same active position source used by rendering (`network` or delegate) to avoid drift.

---

## Projection Plan (All Layout Types)

### 1) Unified position sampler
- Add a small internal sampler used by labels only:
  - `network` source: read `NODE_POSITION_ATTRIBUTE` inside `withBufferAccess(...)`.
  - `delegate` source: call `delegate.getNodePositionView(context)` when available.
  - delegate GPU-only fallback: use cached `snapshotNodePositions(context)` at low rate.
- This keeps compatibility with:
  - precomputed/static layouts (positions already in network buffers),
  - worker/d3/gpu-force layouts that write network positions,
  - delegated layouts through `positions({ source: 'delegate' })`.

### 2) Camera projection math
- Use `camera.getUniforms().viewProjection` and viewport for world->screen projection:
  - `clip = VP * vec4(x, y, z, 1)`
  - `ndc = clip.xyz / clip.w`
  - `screenX = (ndc.x * 0.5 + 0.5) * viewport.width`
  - `screenY = (1 - (ndc.y * 0.5 + 0.5)) * viewport.height`
- This works for 2D/3D and perspective/orthographic because it uses the active camera matrices.

### 3) Keep label positions synced with camera changes
- Run a cheap reprojection pass for currently visible labels on every `render:after` while camera moves.
- Trigger full reselection (all-candidate ranking) at lower rate (`maxUpdateFps`) or on major view/data changes.
- Result: labels visually stick to nodes during pan/zoom/orbit without full rescoring every frame.

### 4) Interpolation compatibility
- When position interpolation is active, labels should use rendered/interpolated positions, not just target positions.
- For v1:
  - if GPU interpolation is active, compute per-node mixed position on demand with the same `mix(from, to, factor)` logic for shortlisted ids.
  - otherwise read current network/delegate view directly.
- This avoids label-node drift during animated layout transitions.

---

## Importance + Stability Plan

### Importance score (projection-aware)
- Default score uses current projected size:
  - `score = projectedRadiusPx^2 * stateBoost * manualWeight`
- `projectedRadiusPx` computed by projecting:
  - node center
  - node center + camera-right * worldRadius
- This tracks "nodes that take screen space" across zoom levels.

### Deterministic ranking (same view => same labels)
- Sort by:
1. quantized score descending
2. node id ascending (strict tie-breaker)
- Collision culling runs in that stable order with fixed grid parameters.
- No randomness, no insertion-order dependence.

### View-state stability cache
- Build a quantized view signature from camera state + viewport + relevant visual scales.
- If signature and relevant versions are unchanged, reuse previous label id set directly.
- Relevant versions include:
  - topology/index versions,
  - position version (network attribute version or delegate version),
  - label source attribute version.
- This guarantees stable repeatability for identical (or effectively identical) views.

### Hysteresis to reduce flicker near thresholds
- Use two thresholds:
  - enter threshold (higher) for new labels,
  - keep threshold (lower) for already-visible labels.
- Existing labels remain unless clearly less important; this prevents rapid churn while zooming.

---

## DOM and Layout Performance Guardrails

- Keep a fixed pool of SVG text nodes (`maxVisible + slack`) and reuse nodes.
- Update only changed attributes (`x`, `y`, `textContent`, visibility class).
- Keep `pointer-events: none` on SVG layer.
- Use a single `<g>` container for labels.
- Optional: use `transform: translate(...)` on `<text>` for cheaper updates if profiling shows wins.

---

## Alternatives Considered

## A) Minimal mode: selected/hovered-only labels
- Pros: lowest CPU/DOM cost, easiest rollout.
- Cons: does not satisfy “largest visible entries” discovery use case.

## B) Full GPU-assisted label candidate extraction
- Pros: scales to huge graphs; can avoid CPU full scans.
- Cons: significantly higher complexity, backend divergence (WebGL/WebGPU), larger maintenance cost.

## C) HTML labels instead of SVG
- Pros: easier styling.
- Cons: generally heavier layout/reflow cost for many labels than pooled SVG text.

## Recommendation
- Start with CPU + SVG hybrid strategy (this plan), keep selected/hovered-first behavior, and add GPU-assisted candidate extraction only if profiling justifies it.

---

## Phased Delivery

### Phase 1: Foundations
- Add label config API and `SvgLabelLayer` with pooled text nodes.
- Implement fallback text resolution (`Label` -> `Name` -> id).
- Implement selected/hovered-only mode.
- Add unit tests for resolver and fallback logic.

### Phase 2: Smart subset rendering
- Add projected-size ranking + viewport/min-size culling.
- Add collision grid culling.
- Add throttled update scheduler tied to render/camera events.
- Add Playwright tests for zoom/pan correctness and non-overdraw bounds.

### Phase 3: Performance hardening
- Add instrumentation hooks (update time, candidate count, shown count).
- Tune defaults for large graphs.
- Add stress tests (large node counts, rapid camera motion).

### Phase 4: Optional enhancements
- Weight attribute for ranking.
- Label fade-in/out and smooth repositioning.
- Optional edge labels or pinned user labels.

---

## Validation / Test Plan

### Unit tests (`tests/*.test.js`)
- Fallback source selection order and case handling.
- Type conversions for string/int/category.
- Cache invalidation on attribute version change.
- Collision grid behavior (deterministic culling).

### E2E tests (`tests/*.spec.js`)
- Labels track nodes while panning/zooming.
- Labels update after layout movement.
- Selected/hovered labels always appear (within cap policy).
- Label count never exceeds `maxVisible`.

### Performance checks
- Measure label update cost in ms/frame under:
  - static camera
  - continuous pan/zoom
  - active layout updates
- Ensure graph render FPS regressions stay within an agreed budget.

---

## Open Decisions

- Case-insensitive fallback matching scope (`label/name` variants) vs strict keys only.
- Whether `Category` labels default to dictionary label or numeric code.
- Default `maxVisible` for 2D vs 3D modes.
- Whether to expose pin/unpin labels in v1 or later.
