
// Temporary fix for
// https://github.com/evanw/esbuild/issues/312
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
		// console.log("RECEIVED:", msg.data.type);
		let use2D = false;
		if (msg.data.type == "pause") {
			// console.log("PAUSING!!!!")
			this.simulation.stop();
		} else if (msg.data.type == "resume") {
			this.simulation.restart();
		} else if (msg.data.type == "start") {
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

			this.repulsiveforce = d3.forceManyBody();
			this.attractiveforce = d3.forceLink(links);
			this.centralForce = d3.forceCenter();
			this.simulation = d3.forceSimulation(nodes)
				.numDimensions(use2D?2:3)
				.force("charge", this.repulsiveforce)
				.force("link", this.attractiveforce)
				.force("center", centralForce)
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
					self.postMessage({ type: "update", positions: inputNodesPositions });
				}).on("end", () => {
					self.postMessage({ type: "stop" });
				});
		}
	}
})

let workerFunctionString = workerFunction.toString();
let workerURL = URL.createObjectURL(new Blob([`(${workerFunctionString})()`], {type:'text/javascript'}));


class d3ForceLayoutWorker {
	constructor({
		network=null,
		onUpdate=null,
		onStop=null,
		onStart=null,
		use2D=false
	}) {
		this._network = network;
		this._onUpdate = onUpdate;
		this._onStop = onStop;
		this._onStart = onStart;
		this._use2D = use2D;

		this._layoutWorker = null;
	}

	start(){
		if(!this._layoutWorker){
			this._layoutWorker = new Worker(workerURL);
			this._layoutWorker.onmessage = (msg) => {
				if (msg.data.type == "update") {
					this._onUpdate?.(msg.data);
				}else if (msg.data.type == "stop") {
					this._onStop?.(msg.data);
					this._layoutRunning = false;
				} else {
					console.log("Layout received Unknown msg: ", msg);
				}
			};

			this._layoutRunning = true;
			this._onStart?.();
			this._layoutWorker.postMessage({
				 type: "start",
				// network: this.network,
				nodes:this._network.nodes,
				positions:this._network.positions,
				edges:this._network.indexedEdges, 
				use2D: this._use2D
			});
		}
	}

	restart(){
		this.stop();
		this.start();
	}

	stop(){
		if(this._layoutRunning){
			this._onStop?.();
		}
		this._layoutWorker.terminate();
		this._layoutRunning = false;
		delete this._layoutWorker;
		this._layoutWorker = null;
	}

	resume() {
		this.start();
		if(!this._layoutRunning){
			this._onStart?.();
		}
		this._layoutWorker.postMessage({ type: "resume" });
		this._layoutRunning=true;
	}

	pause(){
		this._layoutWorker.postMessage({ type: "pause"});
		this._layoutRunning=false;
		this._onStop?.();
	}

	onUpdate(callback) {
		this._onUpdate = callback;
	}
	
	onStop(callback) {
		this._onStop = callback;
	}
	
	onStart(callback) {
		this._onStart = callback;
	}

	isRunning() {
		return this._layoutRunning;
	}
	
	cleanup() {
		this.stop();
	}
}

export {d3ForceLayoutWorker as layoutWorker};