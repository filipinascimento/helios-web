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
helios.setMappers({ nodeMapper: mapper });
```

Key entry points:

- `Helios` – prepares layers, connects the scheduler, kick-starts rendering
- `StaticLayout`, `WorkerLayout` – ready-to-use layout implementations
- `Mapper` – flexible mapping utility for visual channels; mapped values land in
  sparse attributes and trigger dense buffer rebuilds automatically

## Mapper + Colormaps

Color channels can now consume colormap names, objects, or custom functions. All
colormaps shipped in `ColormapData.json` (CET, cmasher, helios) plus the entire
`d3-scale-chromatic` catalog are available via the exported `colormaps` object.

```js
import { Mapper, colormaps, createColormapScale, colormapToScheme } from 'helios-web-next';

// Continuous values → RGBA via an interpolated colormap
mapper
  .channel('color')
  .from('weight')
  .colormap('interpolateViridis', { domain: [minWeight, maxWeight], alpha: 0.9 })
  .done();

// Turn a continuous map into a categorical palette for discrete types
const palette = colormapToScheme(colormaps.cmasher.cmasher_amber, 8);
mapper.channel('color').categorical(['A', 'B', 'C'], palette).done();

// Or pass a custom function directly
const scale = createColormapScale((t) => (t < 0.5 ? '#ff7f00' : '#1f78b4'));
mapper.channel('color').from('flag').scale(scale).done();
```

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
