# Horizontal Dock Layout Plan (Top/Bottom)

## Goal
Design and implement a future top/bottom dock system that arranges panels horizontally in a readable, stable layout instead of a single vertical stack. The system should support constrained panel widths, automatic wrapping into multiple columns/rows, and predictable drag interactions.

## Scope
- Add a dedicated layout mode for top and bottom docks.
- Keep existing left/right dock behavior unchanged.
- Reuse current panel component APIs where possible.
- Avoid regressions in resize, collapse, and panel reorder behavior.

## UX Requirements
- Panels docked at top/bottom should be arranged in a horizontal flow.
- Panel widths should be constrained to a configurable min/max range.
- The layout should auto-wrap into additional rows (or columns, depending on chosen axis strategy) when width is insufficient.
- A single scroll axis should be used per dock region where overflow occurs.
- Dragging should show a clear insertion indicator and compact preview, consistent with side dock interactions.
- Reordering should be stable and not jump when crossing wrap boundaries.
- Undocking should only occur when leaving the dock region or using modifier behavior.

## Proposed Layout Model
- Use CSS Grid for deterministic packing in top/bottom docks.
- Define dock-level variables:
  - `--helios-ui-dock-tb-min-panel-width`
  - `--helios-ui-dock-tb-max-panel-width`
  - `--helios-ui-dock-tb-gap`
- Compute effective column count from available dock width and bounded panel width.
- Keep each panel height content-driven (no forced equal heights unless explicitly enabled later).

## Drag/Reorder Strategy
- Create a top/bottom-specific reorder controller in `PanelManager`.
- During drag:
  - Render compact ghost preview under cursor.
  - Render insertion indicator in computed grid slot.
- Use geometry hit-testing against visible panel cells to compute insertion index.
- Support auto-scroll while dragging near dock edges.
- Persist ordering per dock region.

## Data/State Changes
- Extend dock target model with explicit region metadata:
  - side: `left | right | top | bottom`
  - lane/index info for wrapped layouts (derived, not persisted unless needed)
- Keep panel order as a stable array per region.
- Preserve backward compatibility for existing `dock` values.

## Technical Steps
1. Add top/bottom dock containers in `PanelManager` with new class names and region routing.
2. Add grid-based CSS for top/bottom dock layout and panel width constraints.
3. Implement top/bottom reorder controller with preview + insertion line.
4. Unify reorder internals so side and top/bottom share common pointer lifecycle logic.
5. Add configuration options for min/max docked width and gaps.
6. Add tests for docking, wrapping, reorder index stability, and undock transitions.
7. Add docs section in `docs/UI.md` for dock layout behavior and configuration.

## Testing Plan
- Unit tests (`tests/ui-docking.test.js`):
  - Dock mode resolution for top/bottom.
  - Ordering/index calculations under wrapped layout.
- Interaction tests (new or existing browser tests):
  - Drag reorder across rows.
  - Auto-scroll behavior.
  - Undock transitions from top/bottom regions.
- Regression checks:
  - Collapse button behavior after repeated reparenting.
  - Panel resize constraints in all dock modes.

## Risks
- Grid hit-testing can become inconsistent during auto-scroll unless geometry cache is refreshed per move.
- Reorder logic across wrapped rows can feel unintuitive without clear insertion feedback.
- Mixed panel heights may create visual disorder; may require optional row normalization mode later.

## Open Decisions
- Prefer row-wrapping (`grid-auto-flow: row`) vs column-wrapping (`grid-auto-flow: column`) for top/bottom docks.
- Whether width constraints are global or panel-specific.
- Whether top and bottom should share one implementation path or allow distinct strategies.

## Incremental Milestones
- Milestone 1: Static top/bottom grid layout with bounded widths (no drag reorder).
- Milestone 2: Drag reorder with insertion indicator and ghost preview.
- Milestone 3: Auto-scroll + robustness polish + docs/tests completion.
