# Helios Web Next

A fresh boilerplate for the next-generation Helios web renderer. It wires the
[`helios-network`](https://www.npmjs.com/package/helios-network) WASM graph core
into a layered rendering stack that targets WebGPU first with a WebGL2 fallback.

## Getting Started

```bash
npm install
npm run dev    # serves the example under docs/examples/basic via Vite
npm run build  # produces the library bundle in dist/
npm run test:e2e  # launches a headless smoke test (run `npx playwright install` once)
npm run test:e2e:headed  # headed run of the full Playwright suite
npm run test:e2e:webgpu  # headed run with WebGPU flags (chromium-webgpu-headed project)
npm run test:e2e:weighted  # headed weighted-transparency focus
npm run test:e2e:rendering-options  # headed rendering-options focus
npm run test    # runs the node colormap unit test
```

Point your browser at `http://localhost:5173` to interact with the bundled
example (located in `docs/examples/basic`). It creates a sample graph, applies
worker layout updates, and renders it through the indirect pipelines backed by
`helios-network` sparse/indexed buffers so you can verify the stack end-to-end.

## Documentation & Examples

All package-focused notes now live under [`docs/`](./docs/README.md) so you can
ship this as a reusable dependency. The directory includes a growing set of
examples (starting with [`docs/examples/basic`](./docs/examples/basic/)) plus
step-by-step installation and API guidance.

## Using as a Library

The build artifact targets WebGPU first with WebGL2 as a fallback. After running
`npm run build`, you can consume the package exactly like any other module:

```js
import HeliosNetwork from 'helios-network';
import { Helios } from 'helios-web-next';

const network = await HeliosNetwork.create();
network.addNodes(5);

const helios = new Helios(network, { container: '#app' });
await helios.ready;

// Optional SVG labels overlay (off by default).
helios.labels({
  enabled: true,
  maxVisible: 120,
  source: null, // auto fallback: Label -> Name -> id
  offsetRadiusFactor: 1, // (centerY - projectedRadius) * factor
  offsetPx: 4, // additional pixel offset (positive moves up)
  maxChars: 0, // 0 disables truncation
  maxRows: 1, // >1 enables wrapping with ellipsis
});

// Render quality controls:
// - supersampling defaults to "auto": DPR < 2 gets a 2x backing-store boost,
//   retina-class screens stay at native DPR unless you force it on.
// - antialias defaults to WebGL on / WebGPU off unless you opt in.
const crispHelios = new Helios(network, {
  container: '#app',
  antialias: true,     // WebGL context AA, or 4x MSAA on the WebGPU canvas pass
  supersampling: 'auto', // false | true | number | 'auto'
  // forceSupersample: true, // legacy alias for always applying the auto factor
});
```

The same API powers the example under `docs/examples/basic/main.js`, making it
easy to copy-paste a working setup into your own application.

Interpolation is GPU shader based. Timing can run in adaptive mode (average
recent layout intervals) or a fixed override:

```js
helios.interpolation({ durationMode: 'adaptive', adaptiveDurationSamples: 5, adaptiveDurationWindowMs: 5000 });
helios.interpolation({ fixedDurationMs: 160 }); // forces fixed timing
helios.interpolation({ durationMode: 'adaptive' }); // switch back
```

For layout-driven positions:
- GPU-force layout automatically uses a position delegate and keeps it attached.
- Non-delegate layouts automatically use network position buffers.
- Built-in layouts now run at scheduler cadence (no `updateIntervalMs` throttling).

Graph filtering can be applied from Helios with independent node/edge criteria.
Edges are automatically induced by the filtered node set:

```js
helios.setGraphFilter({
  nodeQuery: 'weight >= 0.5',
  edgeQuery: 'intensity >= 0.2',
  scope: 'render+layout', // or 'render'
});

helios.clearGraphFilter();
```

Scene dimension can also be toggled directly from the API. This switches the
camera mode/projection and asks any active dimension-aware layout to move into
the matching 2D/3D mode:

```js
await helios.setMode('3d');
await helios.setMode('2d');
const currentMode = helios.mode(); // '2d' | '3d'
```

For reusable camera animation work, Helios also exposes direct pose capture and
transition helpers:

```js
const pose = helios.cameraPose();

await helios.transitionCamera({
  mode: '3d',
  projection: 'perspective',
  target: [0, 0, 0],
  distance: 900,
}, { durationMs: 600 });
```

For reusable filter presets, use `HeliosFilter` and activate whichever one you need:

```js
import { HeliosFilter } from 'helios-web-next';

const exploratory = new HeliosFilter({ scope: 'render+layout' });
exploratory.addRule({ scope: 'node', type: 'numeric', attribute: 'weight', min: 0.4, max: 1.0, extentMin: 0, extentMax: 1 });
exploratory.addRule({ scope: 'node', type: 'string', attribute: 'label', operator: 'contains', value: 'hub' });

const strict = new HeliosFilter({ scope: 'render' });
strict.addRule({ scope: 'node', type: 'categorical', attribute: 'category', values: ['core'] });

helios.activateHeliosFilter(exploratory);
// later…
helios.activateHeliosFilter(strict);
```

Position delegation now uses an abstract `PositionDelegate` contract, so delegates
can safely synchronize against topology/index version changes before handing
buffers to the renderer.

## Headless Smoke Test

Run `npm run test:e2e` to boot the basic example in a headless Chromium session
via Playwright. The test forces the WebGL renderer, waits for Helios to finish
bootstrapping, and samples pixels from the canvas to ensure the output isn't
stuck at the background color. This provides a quick automated sanity check that
both the rendering stack and the documentation example stay functional.

## Architecture Overview

- **Helios class (`src/Helios.js`)** – public entry point. It accepts an
  existing `helios-network` instance, prepares DOM layers, initializes the
  rendering backend, and wires the scheduler, layout, visuals, and mappers
  together.
- **LayerManager (`src/layers/LayerManager.js`)** – creates the stack of layers
  (WebGPU/WebGL canvas, SVG overlay, HTML overlay) and keeps them sized via a
  `ResizeObserver` hook.
- **Visuals & mapping (`src/pipeline/*.js`)** – ensure visual attributes live
  directly inside the `helios-network` object, seed defaults, validate
  dimensions/types, and keep sparse visual buffers in sync when mappers write
  into attributes
  attributes.
- **Scheduler (`src/scheduler/Scheduler.js`)** – lightweight coordinator that
  sequences layout ticks, geometry updates, and draw calls. Layouts can
  advertise that they should run continuously or only when explicitly marked
  dirty.
- **Layouts (`src/layouts`)** – base class + `StaticLayout` fallback +
  `WorkerLayout` that proxies work to `src/workers/layoutWorker.js`, plus
  `D3Force3DLayout` for the d3-force-3d worker. Workers can push updated
  positions back to the main thread without touching DOM/APIs.

By default, Helios uses the d3-force-3d worker layout.
- **Rendering (`src/rendering`)** – the new modular `LayeredRenderer` chooses
  WebGPU when available (falling back to WebGL2) and exposes layers, materials,
  shader overrides, framebuffer capture/present helpers, and projection
  utilities. The default graph layer still uploads raw attribute views (no
  extra copies) and draws edges before nodes. Force selection via the Helios
  option `renderer: 'webgl' | 'webgpu'` when needed. Helios now runs indirect
  rendering only on both WebGPU and WebGL2.

Development docs and test commands live in `DEVELOPING.md`.
- **Attribute mapping (`src/pipeline/Mapper.js`)** – helper to convert arbitrary
  node/edge attributes into colors or sizes; mapped values are written into
  sparse visual attributes.

The demo in `docs/examples/basic/main.js` showcases how to instantiate a
network, define visual attributes, and kick off Helios with a worker-driven
layout.

## Next Steps

This scaffold is intentionally minimal but structured for future work, such as:

- richer edge-expansion stages (curves, multi-pass rendering)
- import/export helpers that stream buffers into GPU textures
- advanced layout families that use workers or WASM modules
- multi-layer rendering order controls and picking/interaction APIs

Contributions welcome!
