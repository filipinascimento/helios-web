
import { createColorMap, linearScale } from "@colormap/core";
import {inferno} from "@colormap/presets";

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
	constructor(nodes, edges, directed = false, weighted = false){
		this.ID2index = new Object();
		this.indexedNodes = [];
		// DEPRECATED: Changed to index2Node kept for backwards compatibility
		this.index2Node = this.indexedNodes;
		this.directed = directed;
		// weighted defined if edge.weight is present
		if(edges.length > 0 && edges[0].hasOwnProperty("weight")){
			this.weighted = true;
		}
		for (const [nodeID, node] of Object.entries(nodes)) {
			if(!this.ID2index.hasOwnProperty(nodeID)){
				let nodeIndex = this.indexedNodes.length;
				this.ID2index[nodeID] = nodeIndex;
				node.index = nodeIndex;
				node.ID = nodeID;
				this.indexedNodes.push(node);
				node.neighbors = [];
				node.edges = [];
			}
		}

		this.indexedEdges = new Int32Array(edges.length*2);
		this.edgeWeights = new Float32Array(edges.length);
		this.edgeAttributes = {};
		
		for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
			const edge = edges[edgeIndex];
			// console.log(this.indexedNodes)
			let fromIndex =this.ID2index[edge.source];
			let toIndex = this.ID2index[edge.target];
			// let fromNode = this.indexedNodes[fromIndex];
			// let toNode = this.indexedNodes[toIndex];
			this.indexedEdges[edgeIndex*2] = fromIndex;
			this.indexedEdges[edgeIndex*2+1] = toIndex;
			if(this.weighted){
				this.edgeWeights[edgeIndex] = edge.weight;
			}
			for (const [edgeProperty, value] of Object.entries(edge)) {
				if(edgeProperty == "source" || edgeProperty == "target" || edgeProperty == "weight"){
					continue;
				}
				if(!this.edgeAttributes.hasOwnProperty(edgeProperty)){
					this.edgeAttributes[edgeProperty] = new Array(edges.length);
				}
				this.edgeAttributes[edgeProperty][edgeIndex] = value;
			}
		}

		this.positions = new Float32Array(3*this.indexedNodes.length);
		this.colors = new Float32Array(4*this.indexedNodes.length);
		this.sizes = new Float32Array(this.indexedNodes.length);
		this.outlineColors = new Float32Array(4*this.indexedNodes.length);
		//set intensities to 1.0
		for (let nodeIndex=0; nodeIndex<this.indexedNodes.length;nodeIndex++){
			this.colors[nodeIndex*4+3] = 1.0;
			this.outlineColors[nodeIndex*4+3] = 1.0;
		}

		this.outlineWidths = new Float32Array(this.indexedNodes.length);
		
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
		
		let colorScale = linearScale([0, this.indexedNodes.length], [0, 1]);
		let colorMap = createColorMap(inferno, colorScale);
		for (let index = 0; index < this.indexedNodes.length; index++) {
			let node = this.indexedNodes[index];
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
			this.indexedNodes[index] = newNode;
			this.nodes[node.ID] = newNode;
		}
		for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
			const edge = edges[edgeIndex];
			// console.log(this.indexedNodes)
			let fromIndex =this.ID2index[edge.source];
			let toIndex = this.ID2index[edge.target];
			let fromNode = this.indexedNodes[fromIndex];
			let toNode = this.indexedNodes[toIndex];
			fromNode.neighbors.push(toNode);
			fromNode.edges.push(edgeIndex);
			if(!this.directed){
				toNode.neighbors.push(fromNode);
				toNode.edges.push(edgeIndex);
			}
		}

		// if weighted make edgeSizes proportional
		if(this.weighted){
			if (this.edgeSizes == null) {
				this.edgeSizes = new Float32Array(this.indexedEdges.length);
			}
			let edgeWeights = this.edgeWeights;
			let edgeSizes = this.edgeSizes;
			let maxWeight = -Infinity;
			for (let i = 0; i < edgeWeights.length; i++) {
			  if (edgeWeights[i] > maxWeight) {
				maxWeight = edgeWeights[i];
			  }
			}
			for (let edgeIndex = 0; edgeIndex < edgeWeights.length; edgeIndex++) {
				edgeSizes[edgeIndex*2] = edgeWeights[edgeIndex]/maxWeight;
				edgeSizes[edgeIndex*2+1] = edgeWeights[edgeIndex]/maxWeight;

			}
		}
	}

	get nodeCount(){
		return this.indexedNodes.length;
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
		// console.log("UPDATING EDGE SIZES...");
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
	


	updateEdgeOpacity() {
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
	
	edgeAttribute(attributeName, value){
		// Get or set the following attribute to all edges in the network, if value is function call it for each edge
		const edges = this.indexedEdges;
		if(value === undefined){
			// Get attribute for all edges in network
			return this.edgeAttributes[attributeName];
		} else {
			// Set attribute for all edges in network
			if(typeof value === "function"){
				for(let i = 0; i < edges.length; i++){
					const edgeIndex = edges[i];
					this.edgeAttributes[attributeName][edgeIndex] = value(this.edgeAttributes[attributeName][edgeIndex]);
				}
			} else {
				for(let i = 0; i < edges.length; i++){
					const edgeIndex = edges[i];
					this.edgeAttributes[attributeName][edgeIndex] = value;
				}
			}
		}
		return this; // For chaining
	}

	mapEdges(attributeName, visualAttribute, transformFunction){
		// Map the edges to a visual attribute based on the attribute name
		// The transform function will be passed the attribute value and should return the visual attribute value
		if(!this.edgeAttributes.hasOwnProperty(attributeName)){
			throw new Error(`Attribute ${attributeName} does not exist`);
		}
		if(visualAttribute == "color"){
			this.edgeColors = new Float32Array(4*this.indexedEdges.length);
			const edgeColors = this.edgeColors;
			const edgeAttributes = this.edgeAttributes[attributeName];
			for(let edgeIndex = 0; edgeIndex < this.indexedEdges.length/2; edgeIndex++){
				const attributeValue = edgeAttributes[edgeIndex];
				const visualAttributeValue = transformFunction(attributeValue);
				edgeColors[edgeIndex*4*2+0] = visualAttributeValue[0];
				edgeColors[edgeIndex*4*2+1] = visualAttributeValue[1];
				edgeColors[edgeIndex*4*2+2] = visualAttributeValue[2];
				
				edgeColors[edgeIndex*4*2+4] = visualAttributeValue[0];
				edgeColors[edgeIndex*4*2+5] = visualAttributeValue[1];
				edgeColors[edgeIndex*4*2+6] = visualAttributeValue[2];


				if(visualAttributeValue.length > 3){
					edgeColors[edgeIndex*4*2+3] = visualAttributeValue[3];
					edgeColors[edgeIndex*4*2+7] = visualAttributeValue[3];
				}else{
					edgeColors[edgeIndex*4*2+3]=1.0;
					edgeColors[edgeIndex*4*2+7]=1.0;
				}
			}
		}else if(visualAttribute == "size" || visualAttribute == "width"){
			this.edgeSizes = new Float32Array(this.indexedEdges.length);
			const edgeSizes = this.edgeSizes;
			const edgeAttributes = this.edgeAttributes[attributeName];
			for(let edgeIndex = 0; edgeIndex < this.indexedEdges.length/2; edgeIndex++){
				const attributeValue = edgeAttributes[edgeIndex];
				const visualAttributeValue = transformFunction(attributeValue);
				edgeSizes[edgeIndex*2] = visualAttributeValue;
				edgeSizes[edgeIndex*2+1] = visualAttributeValue;
			}
		}else if(visualAttribute == "opacity"){
			this.edgeColors = new Float32Array(4*this.indexedEdges.length);
			const edges = this.indexedEdges;
			const edgeColors = this.edgeColors;
			const edgeAttributes = this.edgeAttributes[attributeName];
			for(let edgeIndex = 0; edgeIndex < this.indexedEdges.length/2; edgeIndex++){
				const attributeValue = edgeAttributes[edgeIndex];
				const visualAttributeValue = transformFunction(attributeValue);
				edgeColors[edgeIndex*4*2+3] = visualAttributeValue;
				edgeColors[edgeIndex*4*2+7] = visualAttributeValue;
			}
		}
		else{
			throw new Error(`Visual attribute ${visualAttribute} is not supported`);
		}
		return this; // For chaining
	}
}


// Create a class for a Node Selector
class NodeSelector{
	constructor(network,{nodeIndices = [], nodeIDs = []}){ //NodeIndices or nodeIDs, not both
		this._network = network;
		// Check if nodeIndices and nodeIDs are provided
		if(nodeIndices.length > 0 && nodeIDs.length > 0){
			throw new Error("NodeSelector can only be initialized with nodeIndices or nodeIDs, not both");
		}
		this._nodeIndices = nodeIndices;
		if(nodeIDs.length > 0){
			this._nodeIndices = nodeIDs.map(id => this._network.ID2index[id]);
		}
	}

	includeNodeID(nodeID){
		this._nodeIndices.push(this._network.ID2index[nodeID]);
	}

	includeNode(node){
		this._nodeIndices.push(node.index);
	}

	includeNodeIndex(nodeIndex){
		this._nodeIndices.push(nodeIndex);
	}

	filter(selectorFunction){
		// will select a subset of the nodes based on a function
		// the function will be passed a node object and should return true or false

		const nodes = this._network.nodes;
		const nodeIndices = this._nodeIndices;
		const selectedNodeIndices = [];
		for(let i = 0; i < nodeIndices.length; i++){
			const nodeIndex = nodeIndices[i];
			if(selectorFunction(nodes[nodeIndex])){
				selectedNodeIndices.push(nodeIndex);
			}
		}
		return new NodeSelector(this._network,{nodeIndices: selectedNodeIndices});
	}

	selectFromAttributes(attributeNames, selectorFunction){
		// Use a list of attributes that will be passed to selectorFunction to check if a node should be selected or not
		// selectorFunction will be passed an object with the attributes as properties

		const nodes = this._network.nodes;
		const nodeIndices = this._nodeIndices;
		const selectedNodeIndices = [];
		for(let i = 0; i < nodeIndices.length; i++){
			const nodeIndex = nodeIndices[i];
			const node = nodes[nodeIndex];
			const nodeAttributes = {};
			for(let j = 0; j < attributeNames.length; j++){
				const attributeName = attributeNames[j];
				nodeAttributes[attributeName] = node[attributeName];
			}
			if(selectorFunction(nodeAttributes)){
				selectedNodeIndices.push(nodeIndex);
			}
		}
		return new NodeSelector(this._network,{nodeIndices: selectedNodeIndices});
	}

	get indices (){
		return this._nodeIndices;
	}

	get nodes(){
		return this._nodeIndices.map(nodeIndex => this._network.nodes[nodeIndex]);
	}

	get nodeIDs(){
		return this._nodeIndices.map(nodeIndex => this._network.nodes[nodeIndex].ID);
	}

	nodeAttribute(attributeName, value){
		// Get or set the following attribute to all nodes in the selector, if value is function call it for each node
		const nodes = this._network.nodes;
		const nodeIndices = this._nodeIndices;
		if(value === undefined){
			// Get attribute for all nodes in selector
			const attributeValues = [];
			for(let i = 0; i < nodeIndices.length; i++){
				const nodeIndex = nodeIndices[i];
				attributeValues.push(nodes[nodeIndex][attributeName]);
			}
			return attributeValues;
		} else {
			// Set attribute for all nodes in selector
			if(typeof value === "function"){
				for(let i = 0; i < nodeIndices.length; i++){
					const nodeIndex = nodeIndices[i];
					nodes[nodeIndex][attributeName] = value(nodes[nodeIndex]);
				}
			} else {
				for(let i = 0; i < nodeIndices.length; i++){
					const nodeIndex = nodeIndices[i];
					nodes[nodeIndex][attributeName] = value;
				}
			}
		}
		return this; // For chaining
	}
}





