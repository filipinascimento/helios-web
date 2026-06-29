# HeliosUI (Optional Interface System)

HeliosUI is an optional, framework-agnostic HTML overlay for `helios-web`. It provides:

- A panel manager (floating panels + docking)
- A simple “tracked attribute” model for controls (`UIAttribute`)
- Optional layout helpers for composing panels (`TabbedPanel`, `PanelStack`)
- A minimal default theme (light/dark) via CSS variables (fully overrideable)

The core renderer stays UI-free; HeliosUI is just another DOM layer on top of Helios.

## Quick Start

```js
import HeliosNetwork from 'helios-network';
import { Helios, HeliosUI } from 'helios-web';

const network = await HeliosNetwork.create();
const helios = new Helios(network, { container: document.querySelector('#app') });
await helios.ready;

const ui = new HeliosUI({ helios, theme: 'dark' });
ui.createDemoPanel(); // "Scene" panel (tabbed controls) + "Data" panel (network I/O, live attribute metadata, figure export, and a throttled preview thumbnail)
ui.createLayoutPanel(); // Layout picker + per-layout live controls + start/stop actions
ui.createLegendsPanel(); // Legend toggles + text/layout controls for the SVG legend overlay
ui.createCameraPanel(); // Camera distance + collapsible auto-fit/animation/orbit controls, including a compact orbit-axis selector
ui.createSelectionPanel(); // Root selection status/actions, saved-selection save/restore, selector rules, and grouped interaction/selected/highlight/other-elements style controls
ui.createMetricsPanel(); // "Metrics" panel (Degree, Strength, Clustering, Eigenvector, Betweenness, Leiden, Dimensionality)
```

For the smallest visible UI, create the camera panel only:

```js
const ui = new HeliosUI({ helios, theme: 'dark' });
ui.createCameraPanel();
```

You can also let `Helios` create and retain the UI instance:

```js
const helios = new Helios(network, {
  container: document.querySelector('#app'),
  ui: true, // creates helios.ui with the standard panel set
});
await helios.ready;
```

To tune which panels are created, pass panel names explicitly:

```js
const helios = new Helios(network, {
  container: document.querySelector('#app'),
  ui: {
    theme: 'dark',
    panels: ['camera', 'layout', 'legends', 'selection'],
  },
});
await helios.ready;
```

HeliosUI attaches to Helios’ built-in HTML overlay layer by default (via `helios.layers.addLayer('ui', ...)`).
When panels are docked to the left or right edge, HeliosUI also feeds those insets back into Helios so SVG legends can stay inside the usable viewport automatically.

Responsive interface presentation uses three layouts. `Full` keeps normal desktop placement with dock columns on both sides, `Mid` collapses all side-docked panels onto one chosen side while leaving free panels windowed, and `Mobile` opens controls as a full-screen stacked surface from the controls button. The side-switch control only appears in `Mid`, and mobile presentation temporarily treats every panel as docked until the viewport grows back to `Mid` or `Full`.

On iPhone Safari, make the host graph container use a dynamic viewport height such as `height: 100dvh` instead of only `height: 100%` or `100vh`. Safari's browser chrome changes the visual viewport height at runtime, and a static layout viewport can make the mobile panel stack appear compressed instead of leaving one continuous vertical scroller.

The Labels tab now separates regular label mode from hover labels. Regular labels can be `Off`, `Auto Labels` (ranked from the visible graph), or `Selected Only`, while the Selection panel’s hover-label toggle remains a separate hovered-node overlay that reuses the same text styling options. When `Selected Only` is active, the Labels tab also exposes a `Use Available Space` toggle so selected labels can use the same collision and space-availability strategy as regular auto labels instead of always forcing every selected label through; this is enabled by default. The Selection panel only keeps hover picking active for the hover-driven features that are currently enabled. If you leave click selection on but disable node-hover highlight, hover labels, and hovered-edge propagation, Helios keeps click picking enabled without scheduling node-hover updates. When hover labels are enabled through that panel, they use a dedicated hovered-node path instead of the general ranked-label selection pass.

Selection-panel state-style sliders use suggested ranges rather than hidden caps. For example, node and edge `Opacity Gain` suggest `0..5` on the slider while still accepting any non-negative typed value. Controls with real bounded domains, such as color alpha or auto-mix amounts, continue to use explicit min/max domains.

Edge blend mode now defaults to weighted transparency (`Smooth`) when supported. If weighted accumulation is unavailable in the active renderer/backend, Helios automatically falls back to `Alpha`, and the Scene panel reflects that resolved mode. In the Selection panel, the repeated `Node ...` / `Edge ...` labels were removed from state-style controls because those controls already live inside `Nodes` and `Edges` sections. The `forceMaxAlpha` toggle is presented as `Visibility Boost`, which keeps normal blending fully opaque and also applies a strong weighted-transparency accumulation boost for dense overlaps.

The Scene panel’s Appearance tab now includes a `Shaded` subsection with a header toggle that enables or disables shader-specialized lighting globally. Inside that subsection, `Nodes` shading defaults to on, `Edges` shading defaults to off, diffuse strength defaults to `0.5`, ambient-top defaults to white, ambient-bottom defaults to `rgb(163, 163, 163)`, ambient strength defaults to `1.0`, and specular strength defaults to `0.0`. You can tune the light direction with a compact sphere-style drag control or with X/Y/Z numeric fields, plus shaded colors, strengths, and shininess. When the header toggle is off, the extra shaded shader paths and bindings are omitted from the compiled render variants.

Appearance → Advanced includes `Clamp Edge Widths`, on by default. It caps the final rendered edge width to the interpolated diameter of its endpoint nodes after width mapping, state styling, and semantic zoom.

The same Appearance tab now also includes an `Ambient Occlusion` subsection with its own header toggle. AO stays off by default, runs as a separate screen-space post stack so it can layer on top of the existing alpha/weighted multipass edge rendering, and lets you choose whether `Nodes` and `Edges` participate in the AO depth prepass. `Nodes` default to on inside the subsection, `Edges` default to off, and the mode defaults to `Fast SSAO`, with `Smooth SSAO` available when stability is preferred. The exposed controls tune the quality tier, strength, screen-space radius, and bias of the effect; strength defaults to `1.5` with a suggested `0.2..3.0` slider range, and radius defaults to `50` with a suggested `4..100` slider range. `Medium` and higher keep the AO pass at final framebuffer resolution; `Ultra` adds a larger sample kernel for closer VTK-style fidelity.

The Selection panel now seeds stronger built-in defaults for explicit selected/highlighted elements: selected nodes start at `Size 2` and `Outline 2`, highlighted nodes start at `Size 1.5` and `Outline 1.25`, and highlighted edges start at `Width 1.25` with `Opacity Gain 50`. When `Other Elements` uses `Auto Color`, changing the scene background immediately recomputes the active tint/blend treatment for the current selected/highlighted context.

The Selection panel now keeps `Status`, `Clear`, `Expand Neighbors`, and saved-selection controls directly at the panel root. Selector rules live under a `Selectors` section with the add-rule menu in the section header, while interaction and selected/highlight/other-elements styling are grouped under a single `Style` section.

Saved selections are stored in boolean node/edge attributes using the chosen attribute name. The menu always includes `Current Selection`; choosing any saved boolean selection attribute immediately restores that selection. The `Save` action overwrites the currently selected saved attribute, while `Shift` + `Save` or saving from `Current Selection` opens a naming dialog with a suggested incremented name.

The Data panel now includes an `Attributes` tab with a live table of node, edge, and network attributes, including type and dimension metadata. A toggle lets you reveal hidden app/internal attributes whose names start with `_`.

Layout parameter bindings can describe how a control should be rendered. Numeric bindings may opt into `scale: 'log'` and `notation: 'scientific'`, which makes the Layout panel render a log slider with scientific-notation input while keeping the binding contract layout-agnostic.

The Layout panel includes a `Pause on input` toggle. It is enabled by default
when the active network has at least one million nodes and disabled below that
threshold until the user chooses otherwise. When enabled, manual camera pan,
rotate, wheel zoom, and pinch gestures pause layout updates while the gesture is
active, then resume after a short camera-idle delay. Automatic camera orbit and
camera transitions do not trigger the pause.

Storage-backed panel controls resolve display labels from panel item labels first,
then storage `ui.label` metadata, then a humanized fallback. Internal accessor
names such as `edgeAdaptiveQualitySlowFrameThresholdMs` are not shown directly
in the Scene, Appearance, Labels, Legends, Mappers, Filters, Selection, or
Layout controls. Complex panel markers use declarative schemas and stable
storage prefixes, so mapper channel, filter rule, selected-item, selector-rule,
and label-style restores mark the same panels as UI edits.

The Mappers panel’s Density tab supports both the legacy `Difference` mode and the new `Log Ratio` mode. `Difference` preserves the existing normalized comparison path, while `Log Ratio` switches to a specialized dual-density comparison path with a real-valued numeric legend. In `Log Ratio` mode, the density panel exposes `Epsilon`, `Range`, `Z-score`, and `Support` controls and disables the legacy `Weight` / `Norm.` controls because those would break the interpretation of the numeric colorbar. `Z-score` switches the display from the raw log-ratio to a fast approximate local z-score derived from the same two density fields. `Support` enables or disables the automatic pooled-support correction that fades unstable sparse tails without changing the raw values in well-supported areas. The lower Density controls include `Focus`, which selects whether density uses auto focus, all active nodes, selected nodes, highlighted nodes, or selected-then-highlighted nodes. Density comparison colormap picking keeps the active search/filter state between openings, highlights the selected colormap, and includes a `Diverging` filter inside the picker.

The Filter panel renders categorical attributes as compact checklist controls
with per-category active-node counts, `All` and `None` actions, and a summary
such as `All 12 selected` or `3 of 12 selected`. This matches the funding
science project pattern while still keeping a hidden select bridge for existing
rule collection and tests. Numeric ranges and raw query controls continue to use
the shared debounced rule editor, so changing a categorical checklist does not
force a network serialization; it only updates filter rules through the normal
throttled filter path.

The Filter panel also exposes a `Comp. size` slider for minimum
connected-component size. A value of `1` keeps all components and disables the
extra component-size pruning work. Values above `1` are stored as
`filters.minComponentSize` and passed to the active graph filter independently
of node and edge rules. This lets `render+layout` filters hide singleton or
small active components while preserving the same filtered topology used by
dynamic layouts.

Categorical node-color legend rows can be hovered to highlight matching nodes, clicked to keep a category highlighted, and Shift-clicked to add or remove categories from the persistent legend highlight. Set `legendClickAction: 'select'` to make clicks replace or extend the selection instead. Hovered rows show a gray outline; active categories keep a theme-aware gray outline without changing label size or style. Density defaults to `interactionFilter: 'auto'`, which focuses on selected nodes first, then real highlighted nodes, then all active nodes.

## Attaching / Placement

### Attach to Helios (recommended)

```js
const ui = new HeliosUI({ helios });
```

### Attach to a custom container (not tied to Helios)

```js
const uiLayer = document.querySelector('#my-ui-layer');
const ui = new HeliosUI({ container: uiLayer });
```

## Creating Panels

```js
const panel = ui.createPanel({
  id: 'globals',
  title: 'Globals',
  position: { x: 16, y: 16 },
  content: document.createElement('div'),
});
```

### Docking / snapping to edges

Panels automatically “snap” to sides/corners when dragged near the overlay edges.

- Docked panels lose rounded corners.
- Hold `Shift` while dragging to keep the panel as a free-floating window (no docking).
- Panels are resizable in width (drag the side handle); a minimum width is enforced.
- Side/corner-docked panels are automatically stacked in dock columns (left/right, top/bottom corners).
- Panel bodies scroll when content exceeds available height.

You can disable drag/docking globally:

```js
const ui = new HeliosUI({
  helios,
  allowDrag: false, // prevents moving panels
  // allowDock: false, // if you expose this option in your app’s PanelManager usage
});
```

## Theming & Styling

HeliosUI’s default look is CSS-variable driven. You can override variables on the UI container:

```js
ui.container.style.setProperty('--helios-ui-accent', '#00d4ff');
ui.container.style.setProperty('--helios-ui-radius', '14px');
```

Switch themes at runtime:

```js
ui.setTheme('light'); // or 'dark'
ui.toggleTheme();
```

Named two-way choices such as `Light`/`Dark`, `2D`/`3D`, or `Raw`/`Normalized` now use a segmented controller that shows both options at once instead of a single-label on/off switch.

If you don’t want the built-in stylesheet injection, pass:

```js
const ui = new HeliosUI({ helios, styles: null });
```

Then provide your own CSS for `.helios-ui` / `.helios-ui-panel` etc.

## Web Components (Reusable UI building blocks)

HeliosUI is built from plain DOM + CSS, but it now also exposes a small set of Web Components so people can build Helios-like controllers/panels outside Helios itself.

### Register elements

```js
import { defineHeliosWebComponents } from 'helios-web';

defineHeliosWebComponents(document);
```

This defines (at least) the custom element:

- `<helios-panel>`

### Use `<helios-panel>` standalone

`<helios-panel>` is a Light DOM custom element (no Shadow DOM yet). That means:

- It works with the existing HeliosUI stylesheet selectors (e.g. `.helios-ui-panel`, `.helios-ui-panel__header`).
- It still benefits from the same CSS variables used by HeliosUI.

Example:

```js
import { defineHeliosWebComponents, ensureDefaultStyles } from 'helios-web';

defineHeliosWebComponents(document);
ensureDefaultStyles(document);

const uiRoot = document.createElement('div');
uiRoot.className = 'helios-ui';
uiRoot.dataset.theme = 'dark';
document.body.appendChild(uiRoot);

const panel = document.createElement('helios-panel');
panel.setAttribute('heading', 'My Panel');
panel.style.left = '16px';
panel.style.top = '16px';

panel.bodyEl.appendChild(document.createTextNode('Hello!'));
uiRoot.appendChild(panel);
```

## Building Controls (UIAttribute)

HeliosUI is designed around “attributes” that can be read, optionally written, and subscribed to.

### Reactive sync (no polling)

HeliosUI can stay in sync with changes made outside the UI as long as the app changes values through Helios’ accessor methods (e.g. `helios.nodeSizeScale(1.2)`).

Under the hood, Helios emits a `ui:binding-change` event when these accessors are set, and HeliosUI routes the event by `id` so only the affected control updates (no polling, no “update everything” loop).

### Bind to Helios accessors

Helios exposes D3-style accessors like `helios.nodeSizeScale()` (get) and `helios.nodeSizeScale(v)` (set).
HeliosUI can wrap those as `UIAttribute`s:

```js
const nodeSizeScale = ui.bindHeliosAccessor('nodeSizeScale', {
  label: 'Node Size Scale',
  recommendedRange: { min: 0.25, max: 3.0 },
  step: 0.01,
});
```

### Example: create a new controller (checkbox)

Controllers are just DOM that read/write a `UIAttribute`. Here is a minimal checkbox row:

```js
import { UIAttribute } from 'helios-web';

function createCheckboxRow(attribute, { title = attribute.label } = {}) {
  const row = document.createElement('div');
  row.className = 'helios-ui-row';
  row.style.gridTemplateColumns = '1fr auto';

  const label = document.createElement('div');
  label.className = 'helios-ui-label';
  const labelTitle = document.createElement('div');
  labelTitle.className = 'helios-ui-label__title';
  labelTitle.textContent = title;
  label.appendChild(labelTitle);

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.disabled = attribute.readOnly;

  const unsub = attribute.subscribe((value) => { input.checked = Boolean(value); });
  input.addEventListener('change', () => attribute.write(input.checked, { source: 'ui', event: 'change' }));

  row.appendChild(label);
  row.appendChild(input);
  return { element: row, destroy: () => unsub() };
}

// Example attribute:
let enabled = true;
const attr = UIAttribute.boolean({
  id: 'myFeature.enabled',
  label: 'Feature Enabled',
  get: () => enabled,
  set: (v) => { enabled = Boolean(v); },
});
```

### `domain` vs `recommendedRange`

- `domain`: strict min/max used for UI clamping (e.g. slider min/max)
- `recommendedRange`: a softer “typical” range hint (e.g. for suggested defaults / UX hints)

### Organizing panels (recommended direction)

As the system grows, it’s typical to group panels by responsibility:

- `Globals` (theme, background, global size multipliers)
- `Layout` (layout selection + parameters)
- `Mappers` (node/edge mapping controls)
- `Picking` / `Interaction` (hover/selection, thresholds)
- `Selection` (node/edge selection, hover labels, connected-edge hover propagation, separate hover/selected/highlighted/normal state styles)
- `Performance` (fps, quality knobs, debug toggles)

The initial shipped demo panel is just a starting point and is meant to be replaced/extended.

### Mappers panel options

When creating the built-in Mappers panel, you can pass a few UI options:

- `showDistributions` (default: `true`): render a small histogram above domain sliders when attribute data is available.

## Composing panels (tabs and stacks)

If you want to group multiple “sub-panels” inside a single panel, you can use the helpers exported from the package:

### Tabs

```js
import { TabbedPanel } from 'helios-web';

const tabs = new TabbedPanel({
  tabs: [
    { id: 'globals', title: 'Globals', content: document.createElement('div') },
    { id: 'layout', title: 'Layout', content: document.createElement('div') },
  ],
});

ui.createPanel({ id: 'controls', title: 'Controls', content: tabs.element });
```

### Stack (collapsible sections)

```js
import { PanelStack } from 'helios-web';

const stack = new PanelStack();
stack.add({ id: 'globals', title: 'Globals', content: document.createElement('div') });
stack.add({ id: 'layout', title: 'Layout', content: document.createElement('div'), collapsed: true });

ui.createPanel({ id: 'controls', title: 'Controls', content: stack.element });
```
