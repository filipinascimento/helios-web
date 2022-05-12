# Helios Web
<img width="226" alt="Helios Web demo" src="https://github.com/filipinascimento/helios-web/raw/main/media/WS_very_low.gif">

Helios Web is a web-based library to visualize dynamic networks in real-time. Currently under development it aims to provide a simple API and optimized implementation to be integrated in other systems and render and layout large networks. This is the sucessor to the [Networks 3D project](https://filipinascimento.github.io/networks3d/) and the [Networks Web project](https://filipinascimento.github.io/software/networksweb/).

Check out the demo https://filipinascimento.github.io/helios-web/docs/example/

More demos:

| Network | light | light+2D | dark | dark+2D | dark+blend | dark+blend+2D |
| ------- | ----- | -------- | ---- | ------- | ---------- | ------------- |
| Watts-Strogatz | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=WS_10000_10_001) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=WS_10000_10_001&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=WS_10000_10_001&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=WS_10000_10_001&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=WS_10000_10_001&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=WS_10000_10_001&dark&additive&use2d) |
| Facebook Egos | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=Facebook_combined) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Facebook_combined&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=Facebook_combined&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Facebook_combined&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=Facebook_combined&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Facebook_combined&dark&additive&use2d) |
| Rewired Voronoi | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=RVOR) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=RVOR&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=RVOR&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=RVOR&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=RVOR&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=RVOR&dark&additive&use2d) |
| US Airports | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=USairport_2010) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=USairport_2010&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=USairport_2010&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=USairport_2010&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=USairport_2010&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=USairport_2010&dark&additive&use2d) |
| Global Airports | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=Airports) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Airports&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=Airports&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Airports&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=Airports&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Airports&dark&additive&use2d) |
| Protein-protein | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=bio-dmela) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=bio-dmela&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=bio-dmela&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=bio-dmela&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=bio-dmela&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=bio-dmela&dark&additive&use2d) |
| Erdos collaboration | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=ca-Erdos992) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=ca-Erdos992&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=ca-Erdos992&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=ca-Erdos992&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=ca-Erdos992&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=ca-Erdos992&dark&additive&use2d) |
| Europe roads | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=road-euroroad) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=road-euroroad&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=road-euroroad&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=road-euroroad&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=road-euroroad&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=road-euroroad&dark&additive&use2d) |
| Wiki Sciences\* | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science&dark&additive&use2d) |
| Wiki Sciences (small) | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science_Filtered) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science_Filtered&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science_Filtered&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science_Filtered&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science_Filtered&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=Wiki_Science_Filtered&dark&additive&use2d) |
| APS Citations\* | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=APS) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=APS&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=APS&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=APS&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=APS&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=APS&dark&additive&use2d) |
| COVID Citations\* | [light](https://filipinascimento.github.io/helios-web/docs/example/?network=COVID) | [light+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=COVID&use2d) | [dark](https://filipinascimento.github.io/helios-web/docs/example/?network=COVID&dark) | [dark+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=COVID&dark&use2d) | [dark+blend](https://filipinascimento.github.io/helios-web/docs/example/?network=COVID&dark&additive) | [dark+blend+2D](https://filipinascimento.github.io/helios-web/docs/example/?network=COVID&dark&additive&use2d) |


\* huge, may need a good CPU/GPU  (press space to enable the layout algorithm)


## Building

First install packages
```bash
npm install
```

Build
```bash
npx snowpack build
```

# Development and testing
To test the environment use `npm start` or `npx snowpack dev`.
Then go to `http://localhost:8080/docs/example/` in your browser (or use the provided hostname and port).

# Usage
To use it in your project you can load it as a module in modern browsers via skypack:

**Note: MAJOR changes in version 0.5!** Check [0.5 API Changes](#apichanges)

```html
<script type="module">

import {Helios} from "https://cdn.skypack.dev/helios-web?min";
// Currently not working. please download and follow the build instructions.
// This will be fixed in the next release

// Nodes are dictionaries (any key can be used as node properties)

let nodes = {
  "0": {
    label: "Node 0",
  },
  "1": {
    label: "Node 1",
  },
  "2": {
    label: "Node 2",
  },
}

// Edges are arrays of node ids
let edges = [
  {
    source: "0",
    target: "1",
  },
  {
    source: "1",
    target: "2",
  },
  {
    source: "2",
    target: "0",
  }
];

let helios = new Helios({
		elementID: "netviz", // ID of the element to render the network in
		nodes: nodes, // Dictionary of nodes 
		edges: edges, // Array of edges
		use2D: false, // Choose between 2D or 3D layouts
	});

</script>
```
You can find a bare-minimal example at https://jsfiddle.net/yatk8jcb/14/

Helios web is also available as a npm package:

```bash
npm install helios-web
```
then you can use it in your project by importing using the same syntax as above:
```javascript
import {Helios} from "helios-web";

//...

```

# 0.5 API changes<a id='apichanges'></a>
 - Added support for selectable edge picking via `pickeableEdges`
 - Zoom functtion now uses the same easing as the camera interpolator
   (this will be fixed when camera object is implemented)
 - now, an DOM element can be used as input
   for helios (`element`), `elementID` can still be used.
 - Shaded nodes can be enabled/disabled on demand (`shadedNodes()`)
 - Global Opacity, Size and width (for edges) can be changed  via:
   `nodesGlobalOpacityScale*`, `nodesGlobalSizeScale*`,
   `nodesGlobalOutlineWidthScale*`,
   `edgesGlobalOpacityScale*`, and `edgesGlobalWidthScale*`.
   * can be `Scale` corresponding to a multiplicative factor,
   or `Base`, corresponding to additive factor
 - `nodeOpacity` now sets opacity for individual nodes instead
  of all nodes (works like `nodeColor`).
  
