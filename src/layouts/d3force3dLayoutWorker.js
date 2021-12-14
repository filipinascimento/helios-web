// Temporary fix for
// https://github.com/evanw/esbuild/issues/312
console.log("IMPORTING");
let workerFunction = (function (){

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
		let use2D = false;
		if (msg.data.type == "import") {
			// self.importScripts(new URL('../layouts/libs/ngraph.graph.min.js', msg.data.location));
			// self.importScripts(new URL('../layouts/libs/ngraph.forcelayout.min.js', msg.data.location));
			console.log("IMPORTING...")
		} else if (msg.data.type == "stop") {
			this.simulation.stop();
		} else if (msg.data.type == "restart") {
			this.simulation.restart();
		} else if (msg.data.type == "init") {
			console.log("INIT");
			let inputNodes = msg.data.nodes;
			let inputNodesPositions = msg.data.positions;
			let inputEdges = msg.data.edges;
			// let inputEdgeWeights = msg.data.weights;
			if(msg.data.use2D) {
				use2D = true;
			}
			let nodes = [];
			let links = [];

			Object.entries(inputNodes).forEach(entry => {
				// console.log(entry);
				let [key, node] = entry;
				node.ID = key;

				// node.x = 400 * (Math.random() * 1.0 - 0.5);
				// node.y = 400 * (Math.random() * 1.0 - 0.5);
				// node.z = 400 * (Math.random() * 1.0 - 0.5);
				// node.vz = 0;
				
				node.x = inputNodesPositions[node.index*3+0]*10;//400 * (Math.random() * 1.0 - 0.5);
				node.y = inputNodesPositions[node.index*3+1]*10;//400 * (Math.random() * 1.0 - 0.5);
				node.z = inputNodesPositions[node.index*3+2]*10;//400 * (Math.random() * 1.0 - 0.5);
				node.vz = 0;

				// node.index = network.ID2index[key];
				nodes.push(node);
			});

			for (let index = 0; index < inputEdges.length / 2; index++) {
				let edgeFrom = (inputEdges[index * 2]);
				let edgeTo = (inputEdges[index * 2 + 1]);
				let edgeObject = {
					source: edgeFrom,
					target: edgeTo,
				}
				links.push(edgeObject);
			}

			this.simulation = d3.forceSimulation(nodes)
				.numDimensions(use2D?2:3)
				.force("charge", d3.forceManyBody())
				.force("link", d3.forceLink(links))
				.force("center", d3.forceCenter())
				// .force("collide", d3.forceCollide(d => d.size*4))
				.velocityDecay(0.05)
				.on("tick", async () => {
					for (let vertexIndex = 0; vertexIndex < nodes.length; vertexIndex++) {
						const node = nodes[vertexIndex];
						inputNodesPositions[vertexIndex * 3 + 0] = node.x/10;
						inputNodesPositions[vertexIndex * 3 + 1] = node.y/10;
						if(!use2D) {
							inputNodesPositions[vertexIndex * 3 + 2] = node.z/10;
						}else{
							inputNodesPositions[vertexIndex * 3 + 2] = 0;
						}
					}
					self.postMessage({ type: "layoutStep", positions: inputNodesPositions });
				});
		}
	}
})

let workerFunctionString = workerFunction.toString();
console.log(workerFunctionString)
let workerURL = URL.createObjectURL(new Blob([`(${workerFunctionString})()`], {type:'text/javascript'}));

export {workerURL};