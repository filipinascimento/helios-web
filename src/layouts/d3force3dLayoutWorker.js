importScripts("https://cdn.jsdelivr.net/npm/d3-dispatch@3");
importScripts("https://cdn.jsdelivr.net/npm/d3-quadtree@3");
importScripts("https://cdn.jsdelivr.net/npm/d3-timer@3");
importScripts("https://cdn.jsdelivr.net/npm/d3-force@3");
importScripts("https://unpkg.com/d3-binarytree");
importScripts("https://unpkg.com/d3-octree");
importScripts("https://unpkg.com/d3-force-3d");

"use strict"

self.onmessage = function (msg) {
	console.log("RECEIVED:", msg.data.type);
	if (msg.data.type == "import") {
		// self.importScripts(new URL('../layouts/libs/ngraph.graph.min.js', msg.data.location));
		// self.importScripts(new URL('../layouts/libs/ngraph.forcelayout.min.js', msg.data.location));
		console.log("IMPORTING...")
	} else if (msg.data.type == "init") {
		console.log("INIT");
		let network = msg.data.network;
		let nodes = [];
		let links = [];

		Object.entries(network.nodes).forEach(entry => {
			// console.log(entry);
			let [key, node] = entry;
			node.id = key;

			node.x = 400 * (Math.random() * 1.0 - 0.5);
			node.y = 400 * (Math.random() * 1.0 - 0.5);
			node.z = 400 * (Math.random() * 1.0 - 0.5);
			node.vz = 0;
			node.index = network.node2index[key];
			nodes.push(node);
		});

		for (let index = 0; index < network.indexedEdges.length / 2; index++) {
			let edgeFrom = (network.indexedEdges[index * 2]);
			let edgeTo = (network.indexedEdges[index * 2 + 1]);
			let edgeObject = {
				source: edgeFrom,
				target: edgeTo,
			}
			links.push(edgeObject);
		}

		const simulation = d3.forceSimulation(nodes)
			.numDimensions(3)
			.force("charge", d3.forceManyBody())
			.force("link", d3.forceLink(links)
				// .id(d => d.index)
			)
			.force("center", d3.forceCenter())
			.on("tick", async () => {
				for (let vertexIndex = 0; vertexIndex < nodes.length; vertexIndex++) {
					const node = nodes[vertexIndex];
					network.positions[vertexIndex * 3 + 0] = node.x / 10;
					network.positions[vertexIndex * 3 + 1] = node.y / 10;
					network.positions[vertexIndex * 3 + 2] = node.z / 10;
				}
				self.postMessage({ type: "layoutStep", positions: network.positions });
			});
	}
	self.postMessage("test");
}
console.log("TESTE");