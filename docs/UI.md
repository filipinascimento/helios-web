# HeliosUI (Optional Interface System)

HeliosUI is an optional, framework-agnostic HTML overlay for `helios-web-next`. It provides:

- A panel manager (floating panels + docking)
- A simple “tracked attribute” model for controls (`UIAttribute`)
- Optional layout helpers for composing panels (`TabbedPanel`, `PanelStack`)
- A minimal default theme (light/dark) via CSS variables (fully overrideable)

The core renderer stays UI-free; HeliosUI is just another DOM layer on top of Helios.

## Quick Start

```js
import HeliosNetwork from 'helios-network';
import { Helios, HeliosUI } from 'helios-web-next';

const network = await HeliosNetwork.create();
const helios = new Helios(network, { container: document.querySelector('#app') });
await helios.ready;

const ui = new HeliosUI({ helios, theme: 'dark' });
ui.createDemoPanel(); // "Scene" panel (tabbed controls) + "Data" panel (network I/O + stats)
ui.createMetricsPanel(); // "Metrics" panel (Degree, Strength, Clustering, Eigenvector, Betweenness, Leiden, Dimensionality)
```

HeliosUI attaches to Helios’ built-in HTML overlay layer by default (via `helios.layers.addLayer('ui', ...)`).

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

If you don’t want the built-in stylesheet injection, pass:

```js
const ui = new HeliosUI({ helios, styles: null });
```

Then provide your own CSS for `.helios-ui` / `.helios-ui-panel` etc.

## Web Components (Reusable UI building blocks)

HeliosUI is built from plain DOM + CSS, but it now also exposes a small set of Web Components so people can build Helios-like controllers/panels outside Helios itself.

### Register elements

```js
import { defineHeliosWebComponents } from 'helios-web-next';

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
import { defineHeliosWebComponents, ensureDefaultStyles } from 'helios-web-next';

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
import { UIAttribute } from 'helios-web-next';

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
- `Performance` (fps, quality knobs, debug toggles)

The initial shipped demo panel is just a starting point and is meant to be replaced/extended.

### Mappers panel options

When creating the built-in Mappers panel, you can pass a few UI options:

- `showDistributions` (default: `true`): render a small histogram above domain sliders when attribute data is available.

## Composing panels (tabs and stacks)

If you want to group multiple “sub-panels” inside a single panel, you can use the helpers exported from the package:

### Tabs

```js
import { TabbedPanel } from 'helios-web-next';

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
import { PanelStack } from 'helios-web-next';

const stack = new PanelStack();
stack.add({ id: 'globals', title: 'Globals', content: document.createElement('div') });
stack.add({ id: 'layout', title: 'Layout', content: document.createElement('div'), collapsed: true });

ui.createPanel({ id: 'controls', title: 'Controls', content: stack.element });
```
