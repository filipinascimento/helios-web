# Mapper Editor Panel — Plan (Nodes + Edges)

## Goal
Add a **Mapper Editor** panel to HeliosUI that lets users edit **node mappers** and **edge mappers** interactively.

It should:
- Edit mappings per visual channel (node: `color`, `size`, `outline`, `outlineColor`, `position`; edge: `color`, `opacity`, `width`, `endpointPosition`, `endpointSize`).
- Support mapper variants: **constant**, **passthrough** (attribute passthrough), **linear**, **categorical**, **colormap**, **custom function**, and **rules**.
- Provide **basic + advanced** sections for each mapping.
- Provide an explicit **Apply** action (auto-apply checkbox later).

This should align with the current runtime mapper format in [src/pipeline/Mapper.js](src/pipeline/Mapper.js).

## Non-goals (for first version)
- No auto-apply (explicit Apply only).
- No “global editor for all channels at once”; editing is per-channel.
- No persistence/export format guarantees (functions can’t serialize safely); state stays in-memory.

## Existing primitives / constraints (important)
- Mapper config supports:
  - `type`: `constant`, `passthrough`, `linear`, `categorical`, `colormap`, `nodeToEdge`, `nodeAttribute`
  - `attributes` (aka `from`), `transform`, `scale`, `domain`, `range`, `alpha`, `clamp`, `defaultValue`, `rules`
  - `rules[]` can include `when` (function), `attributes`, `transform`, `scale`, `domain`, `range`, `defaultValue`, or `value`.
- Special edge/node endpoint addressing is already supported via attribute names:
  - `@node.<attr>` / `@nodes.<attr>` resolves to `[sourceValue, targetValue]`.
  - `$index` is a valid input.
- Private attribute names:
  - **Only expose attributes that do not start with `__`**.
  - (Note: Helios internal visuals often use `_helios_*`, which are not excluded by this rule; the editor should still hide them by default via a “system/internal” group or a second filter to avoid footguns. See “Extra safety features”.)

## UX: panel layout
### Panel structure
- Create a new panel: **“Mappers”** (docked like existing panels).
- Inside, provide tabs or a segmented control:
  - **Nodes**
  - **Edges**

### Channel list + selection
- Left/top section: list the channels for the chosen mode.
  - Each channel row shows:
    - Channel name
    - Short summary of current mapping (e.g. `colormap: cmasher:rainforest (domain: 0..1)`, `linear weight → [1..5]`, `passthrough: Sizes`)
    - An **Edit** action (click row is fine).

### Editor surface
- Below: editor for the selected channel.
- The editor starts with a **“Source / Type” picker**:
  - **Attribute** (passthrough)
  - **Constant**
  - **Linear scale**
  - **Colormap** (continuous)
  - **Categorical palette**
  - **Custom function**
  - **Rules**
  - (Edges only) **Node→Edge** / **Node attribute** modes, when compatible.

- Below the type picker:
  - A type-specific form.
  - An **Apply** button (disabled until changes).
  - A **Revert** button (discard pending edits).
  - (Optional but useful) a **Reset to defaults** button.

### Basic vs Advanced
Each type gets:
- **Basic**: the minimum required fields to get a sensible mapping.
- **Advanced**: toggle/collapsible area with less-common fields:
  - `defaultValue`
  - `clamp`
  - `alpha` (colormap)
  - edge endpoint options (`endpoints`, `doubleWidth`) when applicable
  - rules list and “special values” overrides
  - transform selection and parameters

Implementation note: HeliosUI already has `PanelStack` for collapsible sections; reuse that.

## Attribute selection rules
### Attribute list sources
- Node mode: list from `helios.network` node attributes.
- Edge mode: list from `helios.network` edge attributes.
- Additionally expose these “virtual” options:
  - `$index`
  - (Edges) `@node.<attr>` / `@nodes.<attr>` variants for node-driven mappings when channel supports it.

### Privacy filtering
- Only show attribute names where `!name.startsWith('__')`.
- Still allow selecting passthrough for public attributes exactly as-is (no transform).

### Passthrough behavior
- Uses mapper config `type: 'passthrough'` and `attributes: <attributeName>`.
- If attribute has dimension > 1 and channel expects scalar, provide a simple component picker:
  - e.g. “use component 0 / 1 / 2 …” (implemented via a generated `transform(inputs) => inputs[i]`).

## Mapper type support matrix (channel compatibility)
This matters because not all combinations are valid.

### Numeric scalar targets (node `size`, node `outline`, edge `width`, edge `opacity`)
Allow:
- constant number
- passthrough numeric attribute (optionally with transform)
- linear (domain/range numbers)
- categorical (domain = categories, range = numbers)
- custom function returning number
- rules

### Color targets (node `color`, node `outlineColor`)
Allow:
- constant color (`#rrggbb` + alpha)
- colormap (numeric input → RGBA)
- categorical palette (categories → colors)
- custom function returning color (hex or `[r,g,b,a]`)
- rules

### Vector targets (node `position` dimension 3)
Allow (initially):
- passthrough only (vector attribute or a custom function)
- custom function
- rules (advanced)

### Edge `color` (dimension 8, typically source+target RGBA)
Allow:
- constant (one color expanded to both ends, or allow separate source/target constants)
- node-driven passthrough:
  - `nodeToEdge()` from `@node.color` (default)
  - `nodeAttribute(name, endpoints)` for scalar node attrs mapped into edge endpoints, when channel expects endpoint pairs
- colormap / categorical / custom function returning either:
  - single RGBA (expanded), or
  - `{ source: RGBA, target: RGBA }`, or
  - packed array length 8

Implementation note: the editor should guide output shape per channel and show validation errors.

## Domain/range UI (range selector)
### Requirements
- Domain/range selectors for numeric mapping types.
- Ranges should adapt to the **min/max of the selected attribute**.

### Proposed implementation
- When an attribute is selected, compute stats:
  - min, max, count of finite values, count of null/undefined/NaN
  - optional percentiles (p1/p99) for robust defaults (helps outliers)
- Use these stats to set:
  - default `domain = [min, max]` (or `[p1, p99]` if enabled)
  - slider bounds in the UI (so “Domain min/max” sliders are meaningful)

Implementation detail:
- Compute stats from `network.getNodeAttributeBuffer(name)` / `getEdgeAttributeBuffer(name)`.
- Cache stats per attribute name + revision (invalidate when network changes).

## Transformations (log/exp/logit/log1p/power)
### User-facing
- Provide a “Transform” dropdown:
  - None
  - `log(x)` (guard for `x <= 0`)
  - `exp(x)`
  - `logit(x)` (guard for `x<=0 || x>=1`)
  - `log1p(x)` (guard for `x <= -1`)
  - `power(x, p)` (parameter `p`)
- Some transforms have parameters (e.g. `power p`).

### How it maps to current Mapper implementation
- The runtime mapper expects `transform` as a function.
- The editor should store a **transform spec** in UI state and compile it into a function on Apply:
  - `config.transform = (inputs) => applyTransform(resolveInputsToScalar(inputs), spec)`

### Handling invalid values
Two supported strategies:
1. **Default-value fallback**: transform returns `undefined` for invalid → mapper uses `defaultValue`.
2. **Special values mapping** (see next section): invalid cases become rule overrides.

## Special values (e.g. -1 = invalid)
Support “special value overrides” as a convenience UI that compiles into rules:
- UI: a list of overrides (value → output)
  - Example: `-1 → color #888888` or `-1 → size 0.5`
- Compiles to `rules[]` inserted before the main mapping:
  - `when: (v) => v === -1`, `value: <mapped>`

Also support `null/undefined/NaN` special case via a built-in predicate.

## Rules editor
Rules are already supported in Mapper config; the editor should expose them.

### MVP rules UI
- A rules list with add/remove/reorder.
- Each rule has:
  - **Condition**: dropdown with simple predicates:
    - equals / not equals
    - < / <= / > / >=
    - is nullish / is NaN / is invalid for transform
  - Optional “rule attributes” override (defaults to base attributes)
  - **Output**: one of:
    - constant value
    - linear / categorical / colormap
    - passthrough
    - custom function

### Advanced rules
- Optional: “Custom predicate” code editor for `when(inputs, item, context)`.

## Custom function editor
### Requirement
Support “custom (function with a simple editor)” with a boilerplate immutable function.

### Recommendation
- Prefer **CodeMirror 6** (ESM-friendly, modular, lighter than Monaco).
- Editor contents compile into a function on Apply using `new Function(...)`.

### Boilerplate
Provide an immutable wrapper like:
```js
/**
 * @param {any} valueOrInputs
 * @param {any} item
 * @param {any} context
 */
export function map(valueOrInputs, item, context) {
  // return a number, hex string, [r,g,b,a], or {source,target}
  return valueOrInputs;
}
```

Implementation detail:
- For security, this is inherently “execute user code”. This is expected for a local tool, but the UI should:
  - clearly label it
  - keep it opt-in
  - catch and surface exceptions

## Color picker
### Requirement
Small, simple color selector.

### Recommendation
Use native inputs for MVP:
- `<input type="color">` for RGB
- separate slider/number input for alpha

This avoids a dependency. If we later need better UX (HSV, palettes), evaluate a lightweight package.

## Colormap selector
### Requirements
- Select colormap and preview it.
- Pre-draw previews so they are not continuously redrawn.

### Plan
- Build a colormap registry list from `colormaps` and/or supported `createColormapScale` names.
- Create a small “colormap gallery” popup:
  - each entry shows name + a tiny gradient strip image
- Pre-render each strip once into a cached `ImageBitmap` / data URL.

## Custom categorical colormap selector
For categorical mapping:
- User selects attribute (categorical)
- UI lists observed categories (up to a cap, e.g. first 200 unique values)
- For each category, user assigns a color

Options:
- “Auto-fill palette” (use sampling from a selected colormap via `colormapToScheme`, or simple default palette)
- “Edit unknown category default” → mapper `defaultValue`

## Edge-specific: from/to passthroughs
### Requirement
For edges allow selection of “fromTo attributes passthroughs”.

### Interpretation aligned to current Mapper behavior
- Edge channels that represent endpoint pairs (e.g. edge `color` as 8 floats, endpointPosition as 6 floats, endpointSize as 2 floats) can be driven by node attributes via:
  - `nodeToEdge()`
  - `nodeAttribute(name, endpoints)`
  - `passthrough` with `attributes: '@node.<attr>'` / `@nodes.<attr>`

Editor UI should expose:
- A “Node source” attribute picker (node attributes only)
- Endpoints: `source` / `destination` / `both`
- Double-width: checkbox (when it affects expected dimension)

If we later need “different attribute for source vs target”, we can support it via a custom function or a dedicated UI that produces `transform(inputs) => ({source: ..., target: ...})`.

## Applying changes (wiring)
### Apply semantics
- The editor maintains a **pending config** separate from the live mapper.
- Clicking **Apply** updates the appropriate channel via `mapper.setChannel(channelName, config)`.

### Where to apply
In Helios, mappers are typically set via `helios.mappers({ nodeMapper, edgeMapper })`.
- If Helios exposes `helios.mappers()` accessor-like set/get, bind to that.
- Otherwise, update the existing mapper object already held by Helios and trigger a redraw/rebuild.

(Implementation should follow existing patterns used for UI-bound accessors in HeliosUI.)

## Extra safety features (recommended)
These help avoid confusing/unsafe selections without changing the core UX.
- Hide system/internal attributes by default:
  - in addition to `__*`, optionally hide `_helios_*` and known visuals attributes unless “Show internal” toggle is enabled.
- Show validation errors inline:
  - wrong output shape (e.g. color channel expects RGBA)
  - domain min >= max
  - invalid transform domain
- Provide a tiny “preview” row:
  - show min/mid/max input values and corresponding mapped outputs

## Step-by-step implementation plan (simple → complex)

### Step 0 — Confirm integration points (no UI yet)
- Identify the “source of truth” for mappers in `Helios`:
  - is it a direct `Mapper`, a `MapperCollection`, or a `{ nodeMapper, edgeMapper }` object?
- Define the minimal operations the editor needs:
  - read current channel config (`getChannel(name)`)
  - write new channel config (`setChannel(name, config)` or collection builder + `.done()`)
  - trigger “visuals update” / redraw if needed.

**Done when:** we know exactly how to read + write node/edge mapper channels from the UI layer.

### Step 1 — Panel skeleton + channel browser (read-only)
- Add `HeliosUI.createMappersPanel()`.
- Show two modes (Nodes / Edges) and list available channels for that mode.
- For each channel, display a short “current mapping summary” derived from `mapper.getChannel(name)`.
- Clicking a channel selects it and shows an empty editor placeholder.

**Done when:** the panel opens and you can select channels without mutating anything.

### Step 2 — Attribute picker utilities (read-only)
- Implement attribute listing for the relevant scope:
  - Nodes → node attributes
  - Edges → edge attributes
- Filter out private attributes: exclude names starting with `__`.
- Add optional “Show internal” toggle (off by default) that also hides `_helios_*` and known visuals attributes.

**Done when:** the UI can list eligible attributes for selection.

### Step 3 — Minimal editing model: pending config + Apply/Revert
- Keep a “pending channel config” separate from the live mapper config.
- Add **Apply** (writes mapper) and **Revert** (reloads from live mapper).
- Disable Apply unless there are changes.

**Done when:** Apply/Revert plumbing works with a trivial config edit.

### Step 4 — MVP mapping types (no stats, no rules)
Implement the simplest, highest-value mapping types first:

1) **Constant**
- Numbers for scalar channels (size/width/opacity/outline)
- Color + alpha for color channels

2) **Passthrough (attribute)**
- Choose an attribute name; config becomes `{ type: 'passthrough', attributes: name }`.

3) **Linear** (numeric → numeric)
- Domain + range numeric inputs.

4) **Colormap** (numeric → RGBA)
- Colormap name selector + domain inputs + alpha/clamp in Advanced.

**Done when:** you can change a channel to any of the above and see the graph update after clicking Apply.

### Step 5 — Auto domain/range defaults from attribute stats (numeric inputs)
- Compute min/max for the selected numeric attribute from the attribute buffer.
- When switching an attribute, offer “Use data min/max” to populate domain.
- Use stats to set sensible slider bounds for domain/range inputs.

**Done when:** domain/range controls adapt to the selected attribute’s observed min/max.

### Step 6 — Categorical mapping (palette)
- Support `{ type: 'categorical', domain: [...], range: [...] }`.
- Add a categorical domain builder:
  - detect unique values (up to a cap) from the attribute buffer
  - allow manual add/remove/edit ordering
- Add a palette editor:
  - range entries are numbers (scalar channels) or colors (color channels)
  - include `defaultValue` (unknown category fallback)

**Done when:** categorical attributes can map to distinct numbers/colors with a clear fallback.

### Step 7 — Transformations (as a pre-scale step)
- Add transform dropdown (none/log/exp/logit/log1p/power) with parameters.
- Compile transform spec into `config.transform`.
- Handle invalid transform inputs via `defaultValue` (MVP behavior).

**Done when:** transforms work for linear + colormap mappings.

### Step 8 — Special values UI (compiles to rules)
- Add “Special values” list (e.g. `-1`, `null`, `NaN`) mapping to constant outputs.
- Compile these entries into `rules[]` inserted before the base mapping.

**Done when:** sentinel values override the main mapping predictably.

### Step 9 — Rules editor (structured rules, no custom code yet)
- Add rules list with add/remove/reorder.
- Provide simple predicates (equals, ranges, nullish).
- Provide rule output options: constant / passthrough / linear / categorical / colormap.

**Done when:** users can express common conditional mappings without writing code.

### Step 10 — Edge node-endpoint modes (“fromTo” / node-driven)
- For eligible edge channels, support:
  - `nodeToEdge()`
  - `nodeAttribute(name, endpoints)`
  - passthrough from `@node.<attr>` / `@nodes.<attr>`
- Expose endpoints (`source`/`destination`/`both`) and double-width (when needed).

**Done when:** edge endpoints can be driven from node attributes through a guided UI.

### Step 11 — Custom function editor (advanced / power-user)
- Add “Custom function” mapping type.
- Choose editor tech (recommend CodeMirror 6).
- Provide boilerplate function and runtime validation + error surfacing.

**Done when:** custom mapping functions can be edited and applied safely (with error feedback).

### Step 12 — Polish + testing
- Add inline validation + a lightweight preview row (min/mid/max → outputs).
- Add Playwright coverage for:
  - opening the panel
  - changing at least one node channel and one edge channel
  - applying and observing a stable visual change (non-blank / changed pixels / changed buffer state).

**Done when:** the workflow is stable and covered by basic E2E tests.

---

## Notes / Open questions
- **Where are mappers stored on Helios?** (single Mapper vs MapperCollection). The editor should support both:
  - if collection exists: edit the default mapper (`collection.channel(name) ... done()`)
  - else: edit direct `Mapper` instance.
- **Attribute types available** depend on helios-network; initial gating should be conservative.
- **Custom code execution** is powerful; keep it clearly separated behind “Custom function” and “Custom rule predicate”.
