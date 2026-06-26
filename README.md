<p align="center">
  <a href="https://heliosweb.io/">
    <img src="./media/helios_logo.svg" alt="Helios Web" width="360">
  </a>
</p>

# Helios Web

Helios Web is the browser visualization package for Helios. It connects the
`helios-network` WebAssembly graph store to an interactive renderer that prefers
WebGPU and falls back to WebGL2.

It is designed for large, dynamic network visualization in real applications:
the hosted app, custom browser tools, documentation examples, notebooks, and
desktop or CLI-driven workflows all use the same renderer package.

Helios Web is the successor to
[Networks 3D](https://github.com/filipinascimento/Networks3D/) and
[Networks Web](https://github.com/filipinascimento/networks/).

## Links

- Website: <https://heliosweb.io/>
- App: <https://heliosweb.io/app/>
- Documentation: <https://heliosweb.io/docs/>
- Examples: <https://heliosweb.io/docs/examples/>
- API reference: <https://heliosweb.io/docs/api/>
- npm package: <https://www.npmjs.com/package/helios-web>

## Install

Install the renderer from npm:

```bash
npm install helios-web
```

Most applications also create or load graph data with `helios-network`:

```bash
npm install helios-web helios-network
```

## Basic Usage

Create an element for the renderer:

```html
<div id="app" style="width: 100%; height: 600px;"></div>
<script type="module" src="./main.js"></script>
```

Then create a network and pass it to Helios:

```js
import HeliosNetwork from 'helios-network';
import { Helios } from 'helios-web';

const network = await HeliosNetwork.create({ directed: false });

const nodes = network.addNodes(8);
network.addEdges([
  [nodes[0], nodes[1]], [nodes[1], nodes[2]], [nodes[2], nodes[3]],
  [nodes[3], nodes[4]], [nodes[4], nodes[5]], [nodes[5], nodes[6]],
  [nodes[6], nodes[7]], [nodes[7], nodes[0]], [nodes[0], nodes[4]],
]);

const helios = new Helios(network, {
  container: document.querySelector('#app'),
});

await helios.ready;
helios.frameNetwork({ animate: false });
```

The full app at <https://heliosweb.io/app/> starts with a 10k-node
Watts-Strogatz network and includes the standard panels for layout, mappers,
filters, export, persistence, and interaction.

## Documentation

The maintained documentation lives at <https://heliosweb.io/docs/>. Start with:

- Getting started: <https://heliosweb.io/docs/getting-started/>
- Examples: <https://heliosweb.io/docs/examples/>
- API reference: <https://heliosweb.io/docs/api/>
- Persistence: <https://heliosweb.io/docs/guides/persistence/>

## Development

```bash
npm install
npm run dev
npm run build
npm test
```

Useful browser checks:

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:webgpu
```

## Citing

If you use Helios Web in academic work, please cite the software release you
used. A formal archived citation will be added for the 0.10 release train.

```bibtex
@software{helios_web,
  title = {Helios Web: WebGPU/WebGL Network Visualization},
  author = {Silva, Filipi Nascimento},
  url = {https://github.com/filipinascimento/helios-web},
  version = {0.10.0},
  year = {2026}
}
```

## License

MIT
