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
  layout: { type: 'worker', options: { radius: 180 } },
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
- `StaticLayout`, `WorkerLayout`, `D3Force3DLayout` – ready-to-use layout implementations
- `Mapper` – flexible mapping utility for visual channels; mapped values land in
  sparse attributes and trigger dense buffer rebuilds automatically
- `HeliosUI` – optional HTML overlay UI (panel manager + attribute bindings)

By default, Helios uses the d3-force-3d worker layout and interpolation is enabled. Pass
`layout` or `interpolation` options to override.

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
- Blend nodes with edge transparency modes: `helios.nodeBlendWithEdges(true)`
- Allow edges to write depth: `helios.edgeDepthWrite(true)` (best for solid edges)

## Mapper docs

See [`docs/MAPPERS.md`](./MAPPERS.md) for channel mapping patterns, colormap helpers, and
the node-color ramp used in the Basic example.

## UI docs

See [`docs/UI.md`](./UI.md) for the optional `HeliosUI` overlay (panels, docking, theming, and attribute bindings).

## State docs

See [`docs/states.md`](./states.md) for the bitmask-based node/edge state system (selected/highlighted/filtered/custom) and shader-applied styling.

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
