
<p float="left">
<img width="50%" style="max-width:450px" alt="Helios-Web" src="https://github.com/filipinascimento/helios-web/raw/main/media/helios-web-logo.svg">
<img width="25%" alt="Helios Web demo" src="https://github.com/filipinascimento/helios-web/raw/main/media/WS_very_low.gif">
</p>

<!-- Create a table centered text saying use Helios-Web experimental version here. Just drag and drop your gml, xnet or gexf file. Then it should point to Dark and Light versions as columns and with Density and without density as rows. All links should point to  http://heliosweb.io/docs/example/?advanced -->
Test the preliminary version of Helios Web here:

|         | Light Version | Dark Version |
|---------|---------------|--------------|
| No Density | [Light](http://heliosweb.io/docs/example/?advanced) | [Dark](http://heliosweb.io/docs/example/?advanced&dark) |
| Density | [Light & Density](http://heliosweb.io/docs/example/?advanced&density) | [Dark & Density](http://heliosweb.io/docs/example/?advanced&dark&density) |

You an drag and drop your own network in gml, xnet or gexf formats.


Helios Web is a web-based library to visualize dynamic networks in real-time. Helios-web is under active development and aims to provide a simple API and optimized implementation to be integrated into other systems and render and layout large networks. This is the successor to the [Networks 3D project](https://filipinascimento.github.io/networks3d/) and the [Networks Web project](https://filipinascimento.github.io/software/networksweb/).

Check out the demo https://filipinascimento.github.io/helios-web/docs/example/

Documentation now available at https://filipinascimento.github.io/helios-web/docs/api/

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
npm run build
```

# Development and testing
To test the environment use `npm run dev`.
Then go to `http://localhost:8080/docs/example/` in your browser (or use the provided hostname and port).

# Usage
To use it in your project you can load it as a module in modern browsers via skypack:

```html
<script type="module">

import {Helios} from "https://cdn.skypack.dev/helios-web?min";
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
You can find a bare-minimal example at https://jsfiddle.net/yatk8jcb/14/ and a more advanced example at https://jsfiddle.net/filsilva/djfomsgw/69/ (Zachary's karate club network).

Full documentation is available at https://filipinascimento.github.io/helios-web/docs/api/

Helios web is also available as a npm package:

```bash
npm install helios-web
```
then you can use it in your project by importing using the same syntax as above:
```javascript
import {Helios} from "helios-web";

//...

```

# Citing Helios-Web

If you use Helios-Web in your research, please include the following citation in your publication:

```text
Silva, F.N. (2023). Helios-Web (Version 0.7.9) [Computer software].
GitHub. http://heliosweb.io. https://doi.org/10.5281/zenodo.8251049
```

Note: A paper on Helios-Web is in progress. We will provide an updated citation once the paper is published.





