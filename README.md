# Helios Web
<img width="226" alt="Helios Web demo" src="https://github.com/filipinascimento/helios-web/raw/main/media/WS_very_low.gif">

Helios Web is a web-based library to visualize dynamic networks in real-time. Currently under development it aims to provide a simple API and optimized implementation to be integrated in other systems and render and layout large networks. This is the sucessor of the [Networks 3D project](https://filipinascimento.github.io/networks3d/) and the [Networks Web project](https://filipinascimento.github.io/software/networksweb/).

Check out the demo https://filipinascimento.github.io/helios-web/docs/example/

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

```html
<script type="module">

import {Helios} from "https://cdn.skypack.dev/helios-web?min";

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

Helios web is also available as a npm package:

```bash
npm install helios-web
```
then you can use it in your project by importing using the same syntax as above:
```javascript
import {Helios} from "helios-web";

//...

```

