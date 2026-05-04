# Helios Web Next Documentation

Helios Web Next wraps the [`helios-network`](https://www.npmjs.com/package/helios-network) core in a renderer that prefers WebGPU and gracefully falls back to WebGL2. This directory collects library-focused documentation so the package can be consumed without digging through the source tree.

## Installation

```bash
npm install helios-network helios-web-next
```

The renderer expects an initialized `helios-network` instance. In many cases that network already lives elsewhere in your application, but the example below shows how to set one up from scratch.

## Basic Usage

```js
import HeliosNetwork from 'helios-network';
import { Helios, Mapper } from 'helios-web-next';

const network = await HeliosNetwork.create();
network.addNodes(5);

const helios = new Helios(network, {
  container: document.querySelector('#app'),
  layout: { type: 'gpu-force', options: { mode: '2d' } },
});
await helios.ready;

const mapper = new Mapper({ mode: 'node', network });
mapper.channel('color').constant('#ff3366').done();
helios.mappers({ nodeMapper: mapper });
```

## Preventing Browser Scroll / Back Gestures

Helios suppresses wheel scroll chaining/bubbling on its own root element by default (`suppressBrowserGestures: true`) to avoid aggressive trackpad gestures leaking into page scroll or browser back/forward navigation.

If you need to opt out (for example, you want the page to scroll when the pointer is over the graph), pass:

```js
const helios = new Helios(network, { suppressBrowserGestures: false });
```

For full-screen apps, also disabling scroll + overscroll on the page is a good belt-and-suspenders option:

```css
html, body {
  overflow: hidden;
  overscroll-behavior: none;
}
```

Key entry points:

- `Helios` – prepares layers, connects the scheduler, kick-starts rendering
- `StaticLayout`, `WorkerLayout`, `D3Force3DLayout`, `GpuForceLayout` – ready-to-use layout implementations
- `Mapper` – flexible mapping utility for visual channels; mapped values land in
  sparse attributes
- `HeliosUI` – optional HTML overlay UI (panel manager + attribute bindings)

By default, Helios uses the d3-force-3d worker layout.

## Events

Helios uses the standard `EventTarget` API and provides two orthogonal helper methods:

- `helios.on(type, handler, options)` registers a listener and returns an unsubscribe function.
- `helios.listen(type[.namespace], handler, options)` is D3-style and chainable:
  - One handler per `(type, namespace)` key (rebinding replaces the prior `listen` handler for that key).
  - `helios.listen(type[.namespace], null)` removes the `listen` handler for that key.
  - `on()` and `listen()` never remove/replace each other’s handlers; on dispatch, both run (in DOM listener registration order).
  - Supports `AbortSignal` via `options.signal`.

## Renderer Convenience Accessors

Some common renderer/graph-layer “global” knobs are available directly on `Helios` as D3-style accessors:

- Getter: `helios.edgeWidthScale()`
- Setter (chainable): `helios.edgeWidthScale(1.0).edgeWidthBase(0)`
- Background/clear color: `helios.background('#0b1020')` (alias: `helios.clearColor(...)`)
- Scene dimension: `helios.mode()` / `await helios.setMode('3d')`
- Camera poses/transitions: `helios.cameraPose()` / `helios.setCameraPose(...)` / `await helios.transitionCamera(...)`
- Camera automation: `helios.cameraControls({...})` / `helios.cameraTargetNodes([...])` / `helios.cameraFollowNodes([...])` / `helios.frameNetwork({ animate: true, resetOrientation: false })` including delegate-aware auto-fit, moving node-centroid follow, and 3D orbit axis control
- Narrow position readback: `await helios.snapshotNodePosition(id)`, `await helios.snapshotNodePositions(ids)`, and `await helios.snapshotNodeCentroid(ids)` for selection/camera work without full delegate snapshots
- Clamp edge widths to endpoint node diameters after mapping/state styles: `helios.edgeWidthClampToNodeDiameter(true)` (default)
- Blend nodes with edge transparency modes: `helios.nodeBlendWithEdges(true)`
- Allow edges to write depth: `helios.edgeDepthWrite(true)` (best for solid edges)
- Enable reduced-cost interaction edges: `helios.edgeFastRendering(true)` (forces a lightweight thin-line edge path)
- Enable shader-specialized lighting: `helios.shadedEnabled(true)`, `helios.shadedNodes(true)`, `helios.shadedEdges(true)`
- Tune shaded lighting: `helios.shadedLightDirection([x, y, z])`, `helios.shadedLightColor(...)`, `helios.shadedDiffuseStrength(...)`, `helios.shadedAmbientTopColor(...)`, `helios.shadedAmbientBottomColor(...)`, `helios.shadedAmbientStrength(...)`, `helios.shadedSpecularColor(...)`, `helios.shadedSpecularStrength(...)`, `helios.shadedShininess(...)`
- Enable screen-space ambient occlusion: `helios.ambientOcclusionEnabled(true)`, `helios.ambientOcclusionNodes(true)`, `helios.ambientOcclusionEdges(true)`
- Tune ambient occlusion: `helios.ambientOcclusionMode('fast'|'smooth')`, `helios.ambientOcclusionQuality('low'|'medium'|'high'|'ultra')`, `helios.ambientOcclusionStrength(...)`, `helios.ambientOcclusionRadius(...)`, `helios.ambientOcclusionBias(...)`
- Tune Fast SSAO response: `helios.ambientOcclusionIntensityScale(...)`, `helios.ambientOcclusionIntensityShift(...)` (WebGPU and WebGL)
- Configure adaptive edge fallback: `helios.edgeAdaptiveQuality({...})` (enabled by default; switches after repeated slow high-quality render durations during camera or layout activity, returns to high-quality edges after activity stops, and export still forces high-quality edges)
- Configure pointer hover styling separately from real group highlight: `helios.nodeHoverStyle(...)`, `helios.edgeHoverStyle(...)`; opt into legacy parity with `helios.hoverStyleFromHighlight(true)`, and tune source-managed highlight edge propagation with `helios.highlightConnectedEdges(...)`

## Mapper docs

See [`docs/MAPPERS.md`](./MAPPERS.md) for channel mapping patterns, colormap helpers, and
the node-color ramp used in the Basic example.

## UI docs

See [`docs/UI.md`](./UI.md) for the optional `HeliosUI` overlay (panels, docking, theming, and attribute bindings).

## State docs

See [`docs/states.md`](./states.md) for the bitmask-based node/edge state system (selected/highlighted/filtered/custom) and shader-applied styling.

## Legends and Density Focus

Categorical node-color legends are interactive by default. Hovering a category
sets real `HIGHLIGHTED` state for matching nodes. Connected edges can opt into
the same real highlighted state with `helios.highlightConnectedEdges(true)`.
clicking selects that category, and Shift-click adds or removes categories from
the current selection. Hovered rows show a gray outline; fully selected
categories keep a theme-aware gray outline. Disable this with
`legends({ interactiveCategorical: false })`, or tune hover and click separately
with `legendHoverHighlight` and `legendClickSelect`.

Density uses `interactionFilter: 'auto'` by default: selected nodes contribute
when any are selected, otherwise real highlighted nodes contribute when present,
otherwise the active/render-filtered graph contributes. Virtual `HOVER` does not
change density. Other modes are `off`, `selected`, `highlighted`, and
`selected-or-highlighted`.

## Backend and mode requirements

See [`docs/rendering-mode-requirements.md`](./rendering-mode-requirements.md) for indirect WebGPU/WebGL requirements, extension gates, and sizing limits.

## GPU Force layout internals

See [`docs/gpu-force-layout.md`](./gpu-force-layout.md) for the WebGPU force algorithm details (equations, parameters, GPU/CPU split, and delegate synchronization behavior).
For a prose-first deep dive with full equation listing and pseudo algorithms, see [`docs/gpu-force-layout-prose.md`](./gpu-force-layout-prose.md).

## Comparing with legacy Helios Web

See [`docs/HELIOS_WEB_NEXT_VS_LEGACY.md`](./HELIOS_WEB_NEXT_VS_LEGACY.md) for a high-level summary of the biggest architectural differences and what Helios Web Next enables.

## Example Catalog

- [`docs/examples/basic`](./examples/basic/README.md) – creates a handful of nodes, randomizes attributes, and maps them to colors so you can see both node and edge styling.

To run the bundled example locally:

```bash
npm install
npm run dev
# open http://localhost:5173
```

The Vite dev server serves `index.html`, which bootstraps the Basic example under `docs/examples/basic`.

## Development Notes

- `npm run build` compiles the package into `dist/` for consumption via bundlers or CDN.
- The build targets WebGPU first; WebGL2 is activated automatically when necessary.
- Geometry buffers live directly on the `helios-network` object to avoid copies between layout, visuals, and renderer stages.

Use this directory as the canonical reference when publishing or sharing package usage instructions.
