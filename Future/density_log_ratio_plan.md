# Density Log-Ratio / Log-Odds Map — Plan

## Goal
Add a new density comparison mode that supports a real-valued spatial enrichment surface with a real numeric colorbar.

Phase 1 should add:
- A **log-density-ratio** mode for density maps.
- Real numeric legend domains instead of the current fixed `[-1, 1]` diverging scale.
- Low-density masking / stabilization so the output remains interpretable.
- Baseline choices that support the common “overrepresented vs baseline” use case.

This work must preserve the current density map behavior and performance by default.

## Non-negotiables
- Keep the current density pipeline working exactly as it does now.
- Do not degrade the current default path in WebGL or WebGPU.
- Use **specialization** for new behavior so the current normalized-difference path stays on its existing fast path.
- Do not force new allocations, passes, or shader branches on the current mode.
- Keep public API behavior stable for existing calls to `helios.density(...)`.

## Current Behavior
The current density comparison path computes a per-node signed value on CPU, splats it into a single density field, then normalizes/clamps it into a diverging display scale.

Current comparison semantics:
- Single-property density: normalized positive mass.
- Comparison density: signed difference between `compareProperty` and `property`.
- Diverging display: clamped to `[-1, 1]`.

This is good for qualitative comparison, but it is not a true log-ratio or log-odds surface and it cannot drive a real numeric colorbar.

## Phase 1 Product Definition
Phase 1 should add a new specialized density comparison mode:
- `difference`
  - Existing behavior.
- `logRatio`
  - New behavior.

Recommended user-facing interpretation:
- `logRatio` means a spatial enrichment surface:
  - positive = locally overrepresented
  - zero = matches baseline locally
  - negative = locally underrepresented

For Phase 1, prefer the mathematically clean formulation:
- `A vs B` on normalized KDEs:
  - `pA(x) = KDE_A(x) / sum(A weights)`
  - `pB(x) = KDE_B(x) / sum(B weights)`
  - `score(x) = log((pA(x) + eps) / (pB(x) + eps))`

This is closer to a **log-density ratio / local log-lift** than a strict discrete-count log-odds. That is acceptable for Phase 1 and is likely sufficient for the intended visualization task.

## Baseline Options
Phase 1 should support explicit baseline specialization rather than overloading current semantics.

Recommended options:
- `baselineMode: 'compareProperty'`
  - Use `property` vs `compareProperty`.
- `baselineMode: 'rest'`
  - Use `property` vs “all active nodes excluding property mass”.
- `baselineMode: 'all'`
  - Use `property` vs pooled active mass.

Suggested implementation scope for Phase 1:
- Implement `compareProperty` first.
- Add `all` / `rest` only if they can be done without complicating the first rollout too much.

## API Shape
Keep the existing config intact and extend it conservatively.

Additions:
- `comparisonMode`
  - `'difference' | 'logRatio'`
  - default: `'difference'`
- `baselineMode`
  - `'compareProperty' | 'all' | 'rest'`
  - default: `'compareProperty'`
- `epsilon`
  - small stabilizer for log ratio
- `maskThreshold`
  - threshold below which pixels are hidden or faded
- `legendDomainMode`
  - `'auto' | 'fixed'`
- `legendDomain`
  - explicit numeric domain for fixed mode, usually symmetric

Existing fields to preserve:
- `property`
- `compareProperty`
- `bandwidth`
- `qualityScale`
- `topographic`
- `scaleWithZoom`
- `colormap`
- `divergingColormap`

Compatibility rules:
- If `comparisonMode` is omitted, use current behavior.
- Existing `normalizeVs` remains meaningful only for `difference` mode unless a future use emerges for it in `logRatio`.

## Renderer / Pipeline Design
### Core requirement
The new mode must not reuse the current signed single-field accumulation path. A real log-ratio requires:
- one accumulated field for numerator density
- one accumulated field for baseline density
- the log transform after smoothing

This implies a new specialized path:
- current mode:
  - one weight field
  - current shaders unchanged
- log-ratio mode:
  - two fields
  - specialized composite shader

### Why specialization is required
The current path computes:
- per-node scalar weights
- one additive splat target

The new path requires:
- two normalized weight streams
- two additive splat targets or two passes into separate targets
- post-KDE ratio in composite

Trying to force both behaviors through one generic path would likely:
- add branching in hot shaders
- complicate resource binding
- risk regressions in the current path

Instead:
- keep current `difference` path untouched
- add a distinct log-ratio execution path selected once per frame/config

## Phase 1 Technical Plan
### 1. Config and runtime specialization
Extend density config and runtime state with:
- `comparisonMode`
- `baselineMode`
- `epsilon`
- `maskThreshold`
- legend domain metadata

Do not change the default config behavior.

### 2. CPU-side weight preparation
Add a specialized preparation step for log-ratio mode that produces:
- active node indices
- numerator weights
- denominator weights
- normalization totals for both

Rules:
- Only allow nonnegative source weights in Phase 1.
- Clamp invalid / negative values to zero unless explicitly rejected.
- Normalize numerator and denominator independently before splatting.

### 3. WebGL specialized accumulation path
Add a log-ratio-specific path that accumulates:
- numerator density texture
- denominator density texture

Preferred options:
- Separate accumulation targets with separate passes, or
- MRT if it is clean and safe on supported hardware.

Recommendation:
- Start with the simpler safer route if it keeps behavior predictable.
- Optimize later only if profiling shows a need.

### 4. WebGPU specialized accumulation path
Mirror the same separation:
- numerator density texture
- denominator density texture

The bind group / pipeline layout should be specialized for this path rather than merged into the current path.

### 5. Specialized composite shader
Add a dedicated composite shader for log-ratio mode:
- read both smoothed fields
- compute `log((num + eps) / (den + eps))`
- apply mask where denominator or pooled support is too low
- map values into the colormap using the active legend domain

Do not clamp to `[-1, 1]` internally unless the chosen legend domain requires it.

### 6. Legend integration
Update density legend derivation so log-ratio mode can expose:
- true numeric domain
- real tick labels
- optional symmetric domain around zero

Legend policy for Phase 1:
- default to symmetric auto domain around zero
- allow future fixed-domain comparison across views

### 7. UI
Add a small, controlled set of controls:
- comparison mode
- epsilon
- mask threshold
- legend domain mode
- optional fixed domain

Keep the current density UI intact for existing mode.
Hide or disable controls that are not applicable to the active mode.

## Domain / Colorbar Policy
Because log-ratio values are unbounded, the renderer still needs a display domain.

Phase 1 recommended policy:
- Compute observed finite min/max after masking.
- Use a symmetric domain around zero:
  - `[-maxAbs, maxAbs]`
- Feed that domain into:
  - shader mapping
  - legend labels

Future option:
- fixed symmetric domain, such as `[-4, 4]`, for cross-view comparability

This gives:
- a real colorbar
- meaningful zero point
- readable saturation behavior

## Reliability / Masking
Phase 1 should not attempt full statistical standardization.

Instead:
- use `epsilon` to stabilize near-zero values
- mask or fade pixels where denominator support is too low
- optionally mask by pooled support instead of denominator alone if that proves more stable

This should be treated as a visualization reliability guard, not a significance estimate.

## Why Not Standardized Log-Odds in Phase 1
A standardized surface would require uncertainty estimation per pixel.
In KDE space that is expensive and statistically more subtle than the discrete count case.

Defensible options would be:
- permutation
- bootstrap

Those are likely too expensive and too invasive for the first product version.

So Phase 1 should stop at:
- real log-ratio values
- real legend
- stabilization
- masking

## Performance Strategy
The new mode will be inherently heavier than the current mode because it needs two fields.
That is acceptable as long as:
- the current mode remains unchanged and fast
- the new cost is paid only when the new mode is enabled

Guidelines:
- no extra work for `comparisonMode: 'difference'`
- separate cached resources for the new mode
- reuse density resolution and bandwidth machinery
- avoid per-frame reallocation when the mode remains stable
- profile WebGL and WebGPU separately before broadening scope

## Testing Plan
Add targeted tests for the new mode without weakening current density coverage.

### Unit / logic
- config parsing defaults
- mode specialization selection
- normalized numerator / denominator weight generation
- epsilon handling
- mask behavior
- legend domain derivation

### Rendering / e2e
- WebGL log-ratio path renders and does not error
- WebGPU log-ratio path renders and does not error
- current difference mode still behaves as before
- colorbar displays real numeric ticks for log-ratio mode
- masking suppresses unstable low-support regions

### Regression focus
- current density enable/disable tests still pass unchanged
- current difference mode output remains visually stable
- no extra errors from unsupported MRT / float attachment combinations

## Rollout Plan
### Phase 1
- Add specialized log-ratio mode
- Real numeric legend
- Epsilon stabilization
- Low-support masking
- Preserve current mode unchanged

### Phase 2
- Add fixed-domain comparison support
- Add `vs all` and `vs rest` baseline shortcuts if not already included
- Add better UX for interpreting numeric values

### Phase 3
- Add approximate reliability overlays or confidence heuristics
- Consider permutation / bootstrap tooling for offline or explicit analysis workflows

## Recommended First Implementation Slice
1. Add config fields and runtime specialization.
2. Implement CPU-side split-weight preparation.
3. Add WebGL specialized log-ratio accumulation + composite path.
4. Mirror in WebGPU.
5. Wire legend domain and numeric labels.
6. Add UI controls.
7. Add regression tests proving current mode is untouched.

## Definition of Done for Phase 1
- Existing density mode works exactly as before with no required API changes.
- New log-ratio mode is opt-in.
- New log-ratio mode shows real numeric values in the legend.
- Zero on the legend means local parity with baseline.
- Positive values indicate overrepresentation and negative values indicate underrepresentation.
- Low-support areas are stabilized and masked well enough to avoid obvious artifacts.
- WebGL and WebGPU both support the new mode.
- Tests cover the new mode and confirm no regression to the current path.
