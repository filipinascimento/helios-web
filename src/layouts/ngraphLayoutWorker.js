"use strict"
self.onmessage = function(msg){
	console.log("RECEIVED:",msg.data.type);
	if(msg.data.type == "import"){
		self.importScripts(new URL('../layouts/libs/ngraph.graph.min.js', msg.data.location) );
		self.importScripts(new URL('../layouts/libs/ngraph.forcelayout.min.js', msg.data.location) );
		createGraph()
		console.log("IMPORTING...")
	}else if(msg.data.type == "init"){
		console.log("INIT");
		self.ngraph = createGraph();
		let network = msg.data.network;
		let nodes = [];
		let links = [];
		self.ngraph.beginUpdate();

		Object.entries(network.nodes).forEach(entry => {
			// console.log(entry);
			let [key, node] = entry;
			// node.ID = value;

			node.x = 400*(Math.random()*1.0-0.5);
			node.y = 400*(Math.random()*1.0-0.5);
			node.z = 400*(Math.random()*1.0-0.5);
			node.vz = 0;
			node.index = network.ID2index[key];
			// console.log(node.index,node);
			self.ngraph.addNode(""+node.index,node);
			// console.log(node,this.network.ID2index[node])
			nodes.push(key);
		});
		
		for (let index = 0; index < network.indexedEdges.length/2; index++) {
			let edgeFrom = (network.indexedEdges[index*2]);
			let edgeTo = (network.indexedEdges[index*2+1]);
			let edgeObject = {
				source: edgeFrom,
				target: edgeTo,
			}
			links.push(edgeObject);
			self.ngraph.addLink(""+edgeFrom, ""+edgeTo);
		}
		self.ngraph.endUpdate();
		
		self.layout = ngraphCreateLayout(self.ngraph,{dimensions: 3});
		let repeatOften = async ()=> {
			// Do whatever
			self.layout.step();
			self.ngraph.forEachNode((node)=>{
				let nodePosition = self.layout.getNodePosition(node.ID);
				let vertexIndex = node.data.index;
				network.positions[vertexIndex*3+0] = nodePosition.x;
				network.positions[vertexIndex*3+1] = nodePosition.y;
				network.positions[vertexIndex*3+2] = nodePosition.z;

			});
			self.postMessage({type:"layoutStep",positions:network.positions});
			// repeatOften();
		}
		// repeatOften();
		setInterval(repeatOften,1);
		console.log(self.ngraph);
	}
	self.postMessage("test");
}
console.log("TESTE");