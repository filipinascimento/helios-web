
import { createColorMap, linearScale } from "@colormap/core";
import { viridis, cividis, plasma, inferno, magma, blackWhite } from "@colormap/presets";

//Make a node from a generic object
class Node{
	constructor(originalObject,ID,index,network){
		for (const [nodeProperty, value] of Object.entries(originalObject)) {
			if(nodeProperty == "Color"
			||  nodeProperty == "Size"
			||  nodeProperty == "Position"
			||  nodeProperty == "OutlineColor"
			||  nodeProperty == "OutlineWidth"){
				continue;
			}
			this[nodeProperty] = value;
		}
		this._network = network;
		this.ID = ID;
		this.index = index;
	}

	set color(newColor){
		let nodeIndex = this.index;
		this._network.colors[nodeIndex*4+0] = newColor[0];
		this._network.colors[nodeIndex*4+1] = newColor[1];
		this._network.colors[nodeIndex*4+2] = newColor[2];
		if(newColor.length > 3){
			this._network.colors[nodeIndex*4+3] = newColor[3];
		}
	}

	get color(){
		let nodeIndex = this.index;
		return [this._network.colors[nodeIndex*4+0],this._network.colors[nodeIndex*4+1],this._network.colors[nodeIndex*4+2],this._network.colors[nodeIndex*4+3]];
	}


	set opacity(newOpacity){
		let nodeIndex = this.index;
		this._network.colors[nodeIndex*4+3] = newOpacity;
	}

	get opacity(){
		let nodeIndex = this.index;
		return this._network.colors[nodeIndex*4+3];
	}


	set size(newSize){
		this._network.sizes[this.index] = newSize;
	}

	get size(){
		return this._network.sizes[this.index];
	}

	set outlineColor(newColor){
		let nodeIndex = this.index;
		this._network.outlineColors[nodeIndex*4+0] = newColor[0];
		this._network.outlineColors[nodeIndex*4+1] = newColor[1];
		this._network.outlineColors[nodeIndex*4+2] = newColor[2];
		if(newColor.length > 3){
			this._network.outlineColors[nodeIndex*4+3] = newColor[3];
		}
	}

	get outlineColor(){
		let nodeIndex = this.index;
		return [this._network.outlineColors[nodeIndex*4+0],this._network.outlineColors[nodeIndex*4+1],this._network.outlineColors[nodeIndex*4+2],this._network.outlineColors[nodeIndex*4+3]];
	}

	set outlineWidth(newWidth){
		this._network.outlineWidths[this.index] = newWidth;
	}

	get outlineWidth(){
		return this._network.outlineWidths[this.index];
	}

	get network(){
		return this._network;
	}

	set position(newPosition){
		let nodeIndex = this.index;
		this._network.positions[nodeIndex*3+0] = newPosition[0];
		this._network.positions[nodeIndex*3+1] = newPosition[1];
		this._network.positions[nodeIndex*3+2] = newPosition[2];
	}
	get position(){
		let nodeIndex = this.index;
		return [this._network.positions[nodeIndex*3+0],this._network.positions[nodeIndex*3+1],this._network.positions[nodeIndex*3+2]];
	}
}




export class Network{
	constructor(nodes,edges,properties){
		this.ID2index = new Object();
		this.index2Node = [];
		for (const [nodeID, node] of Object.entries(nodes)) {
			if(!this.ID2index.hasOwnProperty(nodeID)){
				let nodeIndex = this.index2Node.length;
				this.ID2index[nodeID] = nodeIndex;
				node.index = nodeIndex;
				node.ID = nodeID;
				this.index2Node.push(node);
				node.neighbors = [];
				node.edges = [];
			}
		}

		this.indexedEdges = new Int32Array(edges.length*2);
		for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
			const edge = edges[edgeIndex];
			// console.log(this.index2Node)
			let fromIndex =this.ID2index[edge.source];
			let toIndex = this.ID2index[edge.target];
			// let fromNode = this.index2Node[fromIndex];
			// let toNode = this.index2Node[toIndex];
			this.indexedEdges[edgeIndex*2] = fromIndex;
			this.indexedEdges[edgeIndex*2+1] = toIndex;
		}
		
		this.positions = new Float32Array(3*this.index2Node.length);
		this.colors = new Float32Array(4*this.index2Node.length);
		this.sizes = new Float32Array(this.index2Node.length);
		this.outlineColors = new Float32Array(4*this.index2Node.length);
		//set intensities to 1.0
		for (let nodeIndex=0; nodeIndex<this.index2Node.length;nodeIndex++){
			this.colors[nodeIndex*4+3] = 1.0;
			this.outlineColors[nodeIndex*4+3] = 1.0;
		}

		this.outlineWidths = new Float32Array(this.index2Node.length);
		
		this.edgePositions = null; //new Float32Array(3*this.indexedEdges.length);
		this.edgeColors = null; //new Float32Array(3*this.indexedEdges.length);
		this.edgeSizes = null; //new Float32Array(this.indexedEdges.length);
		// this.intensities = new Float32Array(this.indexedEdges.length);
		// this.outlineColors = new Float32Array(3*this.indexedEdges.length);
		// this.outlineWidths = new Float32Array(this.indexedEdges.length);

		// for (let index = 0; index < this.positions.length; index++) {
		//   this.positions[index] = (Math.random()-0.5)*2*200;
		//   this.colors[index] = Math.random()*0.8+0.2;
		// }

		this.nodes = {}
		
		let colorScale = linearScale([0, this.index2Node.length], [0, 1]);
		let colorMap = createColorMap(inferno, colorScale);
		for (let index = 0; index < this.index2Node.length; index++) {
			let node = this.index2Node[index];
			if(node.hasOwnProperty("Position")){
				this.positions[index*3]   = node["Position"][0];
				this.positions[index*3+1] = node["Position"][1];
				this.positions[index*3+2] = node["Position"][2];
			}else{
				if(node.hasOwnProperty("posx") && node.hasOwnProperty("posy")){
					this.positions[index*3]   = node["posx"];
					this.positions[index*3+1] = node["posy"];
					if(node.hasOwnProperty("posz")){
						this.positions[index*3+2] = node["posz"];
					}else{
						this.positions[index*3+2] = 0;
					}
				}else{
					this.positions[index*3+0] = (Math.random()-0.5)*2*200;
					this.positions[index*3+1] = (Math.random()-0.5)*2*200;
					this.positions[index*3+2] = (Math.random()-0.5)*2*200;
				}
			}

			if(node.hasOwnProperty("Color")){
				if(index==0){
					console.log("NODE COLOR:",node["Color"])
				}
				this.colors[index*4+0] = node["Color"][0];
				this.colors[index*4+1] = node["Color"][1];
				this.colors[index*4+2] = node["Color"][2];
				if(node["Color"].length > 3){
					this.colors[index*4+3] = node["Color"][3];
				}else{
					this.colors[index*4+3]=1.0;
				}
			}else{
				let color = colorMap(index);
				this.colors[index*4+0] = color[0];
				this.colors[index*4+1] = color[1];
				this.colors[index*4+2] = color[2];
				if(color.length > 3){
					this.colors[index*4+3] = color[3];
				}else{
					this.colors[index*4+3]=1.0;
				}
			}

			if(node.hasOwnProperty("Size")){
				this.sizes[index] = node["Size"];
			}else{
				this.sizes[index] = 1.0;
			}

			if(node.hasOwnProperty("OutlineColor")){
				this.outlineColors[index*4+0] = node["OutlineColor"][0];
				this.outlineColors[index*4+1] = node["OutlineColor"][1];
				this.outlineColors[index*4+2] = node["OutlineColor"][2];
				if(node["OutlineColor"].length > 3){
					this.outlineColors[index*4+3] = node["OutlineColor"][3];
				}else{
					this.outlineColors[index*4+3]=1.0;
				}
			}else{
				this.outlineColors[index*4+0] = 1.0;
				this.outlineColors[index*4+1] = 1.0;
				this.outlineColors[index*4+2] = 1.0;
				this.outlineColors[index*4+3] = 1.0;
			}

			if(node.hasOwnProperty("OutlineWidth")){
				this.outlineWidths[index] = node["OutlineWidth"];
			}else{
				this.outlineWidths[index] = 0.0;
			}

			let newNode = new Node(node,node.ID,index,this);
			this.index2Node[index] = newNode;
			this.nodes[node.ID] = newNode;
		}
		for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
			const edge = edges[edgeIndex];
			// console.log(this.index2Node)
			let fromIndex =this.ID2index[edge.source];
			let toIndex = this.ID2index[edge.target];
			let fromNode = this.index2Node[fromIndex];
			let toNode = this.index2Node[toIndex];
			fromNode.neighbors.push(toNode);
			toNode.neighbors.push(fromNode);
			fromNode.edges.push(edgeIndex);
			toNode.edges.push(edgeIndex);
		}
	}

	get nodeCount(){
		return this.index2Node.length;
	}

	updateEdgePositions() {
		if (this.edgePositions == null) {
			this.edgePositions = new Float32Array(3 * this.indexedEdges.length);
		}
	
		const edgesLength = this.indexedEdges.length;
		const nodePositions = this.positions;
		const edgePositions = this.edgePositions;
		const indexedEdges = this.indexedEdges;
		for (let edgeIndex = 0; edgeIndex < edgesLength / 2; edgeIndex++) {
			const fromIndex = indexedEdges[edgeIndex * 2] * 3;
			const toIndex = indexedEdges[edgeIndex * 2 + 1] * 3;
			const edgeFromPositionIndex = edgeIndex * 6;
			const edgeToPositionIndex = edgeFromPositionIndex + 3;
	
			edgePositions[edgeFromPositionIndex] = nodePositions[fromIndex];
			edgePositions[edgeFromPositionIndex + 1] = nodePositions[fromIndex + 1];
			edgePositions[edgeFromPositionIndex + 2] = nodePositions[fromIndex + 2];
	
			edgePositions[edgeToPositionIndex] = nodePositions[toIndex];
			edgePositions[edgeToPositionIndex + 1] = nodePositions[toIndex + 1];
			edgePositions[edgeToPositionIndex + 2] = nodePositions[toIndex + 2];
		}
	}
	
	updateEdgeColors(updateOpacity = true) {
		if (this.edgeColors == null) {
			this.edgeColors = new Float32Array(4 * this.indexedEdges.length);
		}
	
		const edgesLength = this.indexedEdges.length;
		const edgeColors = this.edgeColors;
		const nodeColors = this.colors;
		const indexedEdges = this.indexedEdges;
		for (let edgeIndex = 0; edgeIndex < edgesLength / 2; edgeIndex++) {
			const fromIndex = indexedEdges [edgeIndex * 2] * 4;
			const toIndex = indexedEdges [edgeIndex * 2 + 1] * 4;
			const edgeFromColorIndex = edgeIndex * 8;
			const edgeToColorIndex = edgeFromColorIndex + 4;
	
			edgeColors[edgeFromColorIndex]     = nodeColors[fromIndex];
			edgeColors[edgeFromColorIndex + 1] = nodeColors[fromIndex + 1];
			edgeColors[edgeFromColorIndex + 2] = nodeColors[fromIndex + 2];
	
			edgeColors[edgeToColorIndex]     = nodeColors[toIndex];
			edgeColors[edgeToColorIndex + 1] = nodeColors[toIndex + 1];
			edgeColors[edgeToColorIndex + 2] = nodeColors [toIndex + 2];
	
			if (updateOpacity) {
				edgeColors[edgeFromColorIndex + 3] = nodeColors[fromIndex + 3];
				edgeColors[edgeToColorIndex + 3] = nodeColors[toIndex + 3];
			}
		}
	}
	
	updateEdgeSizes() {
		if (this.edgeSizes == null) {
			this.edgeSizes = new Float32Array(this.indexedEdges.length);
		}
	
		const edgesLength = this.indexedEdges.length;
		const edgeSizes  = this.edgeSizes;
		const nodeSizes = this.sizes;
		const indexedEdges = this.indexedEdges;
		for (let edgeIndex = 0; edgeIndex < edgesLength / 2; edgeIndex++) {
			const fromIndex = indexedEdges[edgeIndex * 2];
			const toIndex = indexedEdges[edgeIndex * 2 + 1];
			edgeSizes[edgeIndex * 2] = nodeSizes[fromIndex];
			edgeSizes[edgeIndex * 2 + 1] = nodeSizes[toIndex];
		}
	}
	


	updateEdgeOpacity(updateOpacity) {
		if (this.edgeColors == null) {
			this.edgeColors = new Float32Array(4 * this.indexedEdges.length);
		}
	
		const edgesLength = this.indexedEdges.length;
		const edgeColors = this.edgeColors;
		const nodeColors = this.colors;
		const indexedEdges = this.indexedEdges;
		for (let edgeIndex = 0; edgeIndex < edgesLength / 2; edgeIndex++) {
			const fromIndex = indexedEdges[edgeIndex * 2] * 4;
			const toIndex = indexedEdges[edgeIndex * 2 + 1] * 4;
			edgeColors[edgeIndex * 8 + 3] = nodeColors[fromIndex + 3];
			edgeColors[edgeIndex * 8 + 7] = nodeColors[toIndex + 3];
		}
	}
	
}
