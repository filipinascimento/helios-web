import { createColorMap, linearScale } from "@colormap/core";
import { inferno } from "@colormap/presets";
import HeliosNetwork, { AttributeType, getHeliosModule as getHeliosNetworkModule } from "helios-network";

const POSITION_ATTRIBUTE = "__helios_position";
const COLOR_ATTRIBUTE = "__helios_color";
const OUTLINE_COLOR_ATTRIBUTE = "__helios_outline_color";
const OUTLINE_WIDTH_ATTRIBUTE = "__helios_outline_width";
const SIZE_ATTRIBUTE = "__helios_size";
const EDGE_WEIGHT_ATTRIBUTE = "__helios_edge_weight";
const LABEL_ATTRIBUTE = "Label";
const IGNORED_NODE_PROPERTIES = new Set(["Color", "Size", "size", "Position", "OutlineColor", "OutlineWidth"]);

const heliosModuleReady = getHeliosNetworkModule();
await heliosModuleReady;

class Node {
	constructor(originalObject, ID, index, network) {
		const safeObject = originalObject || {};
		for (const [nodeProperty, value] of Object.entries(safeObject)) {
			if (IGNORED_NODE_PROPERTIES.has(nodeProperty)) {
				continue;
			}
			this[nodeProperty] = value;
		}
		this._network = network;
		this.ID = ID;
		this.index = index;
	}

	set color(newColor) {
		const nodeIndex = this.index;
		const colors = this._network.colors;
		const base = nodeIndex * 4;
		colors[base + 0] = newColor[0];
		colors[base + 1] = newColor[1];
		colors[base + 2] = newColor[2];
		colors[base + 3] = newColor.length > 3 ? newColor[3] : colors[base + 3];
	}

	get color() {
		const nodeIndex = this.index;
		const colors = this._network.colors;
		const base = nodeIndex * 4;
		return [colors[base], colors[base + 1], colors[base + 2], colors[base + 3]];
	}

	set opacity(newOpacity) {
		this._network.colors[this.index * 4 + 3] = newOpacity;
	}

	get opacity() {
		return this._network.colors[this.index * 4 + 3];
	}

	set size(newSize) {
		this._network.sizes[this.index] = newSize;
	}

	get size() {
		return this._network.sizes[this.index];
	}

	set outlineColor(newColor) {
		const nodeIndex = this.index;
		const outlineColors = this._network.outlineColors;
		const base = nodeIndex * 4;
		outlineColors[base + 0] = newColor[0];
		outlineColors[base + 1] = newColor[1];
		outlineColors[base + 2] = newColor[2];
		outlineColors[base + 3] = newColor.length > 3 ? newColor[3] : outlineColors[base + 3];
	}

	get outlineColor() {
		const nodeIndex = this.index;
		const outlineColors = this._network.outlineColors;
		const base = nodeIndex * 4;
		return [outlineColors[base], outlineColors[base + 1], outlineColors[base + 2], outlineColors[base + 3]];
	}

	set outlineWidth(newWidth) {
		this._network.outlineWidths[this.index] = newWidth;
	}

	get outlineWidth() {
		return this._network.outlineWidths[this.index];
	}

	get network() {
		return this._network;
	}

	set position(newPosition) {
		const nodeIndex = this.index * 3;
		const positions = this._network.positions;
		positions[nodeIndex + 0] = newPosition[0];
		positions[nodeIndex + 1] = newPosition[1];
		positions[nodeIndex + 2] = newPosition[2];
	}

	get position() {
		const nodeIndex = this.index * 3;
		const positions = this._network.positions;
		return [positions[nodeIndex], positions[nodeIndex + 1], positions[nodeIndex + 2]];
	}
}

export class Network {
	constructor(nodes = {}, edges = [], directed = false, weighted = false, options = {}) {
		this.directed = Boolean(options.heliosInstance?.directed ?? directed);
		this.nodes = {};
		this.indexedNodes = [];
		this.index2Node = this.indexedNodes;
		this.ID2index = {};
		this.edgeAttributes = {};
		this.edgePositions = null;
		this.edgeColors = null;
		this.edgeSizes = null;

		if (options.heliosInstance) {
			this._helios = options.heliosInstance;
			this.weighted = Boolean(this._edgeAttributeExists(EDGE_WEIGHT_ATTRIBUTE));
			this._initFromHeliosInstance();
		} else {
			const normalizedNodes = nodes ?? {};
			const normalizedEdges = edges ?? [];
			this.weighted = Boolean(weighted || (normalizedEdges.length > 0 && normalizedEdges[0].hasOwnProperty("weight")));
			this._helios = HeliosNetwork.createSync({
				directed: this.directed,
				initialNodes: Object.keys(normalizedNodes).length,
				initialEdges: normalizedEdges.length,
			});
			this._hydrateFromLegacyData(normalizedNodes, normalizedEdges);
		}
	}

	static async fromBXNet(source, options = {}) {
		await heliosModuleReady;
		const heliosInstance = await HeliosNetwork.fromBXNet(source, options);
		return new Network({}, [], heliosInstance.directed, false, { heliosInstance });
	}

	static async fromZXNet(source, options = {}) {
		await heliosModuleReady;
		const heliosInstance = await HeliosNetwork.fromZXNet(source, options);
		return new Network({}, [], heliosInstance.directed, false, { heliosInstance });
	}

	static async fromXNet(source, options = {}) {
		await heliosModuleReady;
		const heliosInstance = await HeliosNetwork.fromXNet(source, options);
		return new Network({}, [], heliosInstance.directed, false, { heliosInstance });
	}

	async saveBXNet(options = {}) {
		return this._helios.saveBXNet(options);
	}

	async saveZXNet(options = {}) {
		return this._helios.saveZXNet(options);
	}

	async saveXNet(options = {}) {
		return this._helios.saveXNet(options);
	}

	get nodeCount() {
		return this.indexedNodes.length;
	}

	_initFromHeliosInstance() {
		const nodeCount = this._helios.nodeCount;
		this.indexedNodes = new Array(nodeCount);
		this.index2Node = this.indexedNodes;
		this.nodes = {};
		this.ID2index = {};
		this._initCanonicalBuffers(nodeCount, { initialize: false });
		const idAccessor = this._getStringAttributeAccessor("node", "ID");
		const labelAccessor = this._getStringAttributeAccessor("node", LABEL_ATTRIBUTE);

		for (let index = 0; index < nodeCount; index++) {
			const nodeData = {};
			const resolvedID = idAccessor ? idAccessor(index) : null;
			const nodeID = resolvedID && resolvedID.length ? resolvedID : `${index}`;
			if (labelAccessor) {
				const label = labelAccessor(index);
				if (label) {
					nodeData.Label = label;
				}
			}
			const node = new Node(nodeData, nodeID, index, this);
			node.neighbors = [];
			node.edges = [];
			this.indexedNodes[index] = node;
			this.nodes[nodeID] = node;
			this.ID2index[nodeID] = index;
		}

		this._syncEdgesFromHelios();
		this.edgeAttributes = {};
		this._populateEdgeLabelsFromHelios();
		if (this.indexedEdges.length > 0 && this._edgeAttributeExists(EDGE_WEIGHT_ATTRIBUTE)) {
			const weightView = this._ensureEdgeAttributeView(EDGE_WEIGHT_ATTRIBUTE, AttributeType.Float, 1);
			this.edgeWeights = weightView.subarray(0, this.indexedEdges.length / 2);
			this.weighted = true;
		} else {
			this.edgeWeights = null;
		}
		this._linkNeighbors();
	}

	_hydrateFromLegacyData(nodes, edges) {
		const nodeIDs = Object.keys(nodes);
		const nodeCount = nodeIDs.length;
		this.indexedNodes = new Array(nodeCount);
		this.index2Node = this.indexedNodes;
		this.nodes = {};
		this.ID2index = {};
		this._initCanonicalBuffers(nodeCount, { initialize: true });

		const colorScale = linearScale([0, Math.max(nodeCount, 1)], [0, 1]);
		const colorMap = createColorMap(inferno, colorScale);

		for (let index = 0; index < nodeCount; index++) {
			const nodeID = nodeIDs[index];
			const rawNode = nodes[nodeID] ?? {};
			const node = new Node(rawNode, nodeID, index, this);
			node.neighbors = [];
			node.edges = [];
			this.indexedNodes[index] = node;
			this.nodes[nodeID] = node;
			this.ID2index[nodeID] = index;
			this._applyNodePosition(rawNode, index);
			this._applyNodeColor(rawNode, index, colorMap(index));
			this._applyNodeSize(rawNode, index);
			this._applyOutline(rawNode, index);
		}

		this._populateEdgesFromData(edges);
	}

	_initCanonicalBuffers(nodeCount, { initialize }) {
		this.positions = this._ensureNodeAttributeView(POSITION_ATTRIBUTE, AttributeType.Float, 3).subarray(0, nodeCount * 3);
		this.colors = this._ensureNodeAttributeView(COLOR_ATTRIBUTE, AttributeType.Float, 4).subarray(0, nodeCount * 4);
		this.sizes = this._ensureNodeAttributeView(SIZE_ATTRIBUTE, AttributeType.Float, 1).subarray(0, nodeCount);
		this.outlineColors = this._ensureNodeAttributeView(OUTLINE_COLOR_ATTRIBUTE, AttributeType.Float, 4).subarray(0, nodeCount * 4);
		this.outlineWidths = this._ensureNodeAttributeView(OUTLINE_WIDTH_ATTRIBUTE, AttributeType.Float, 1).subarray(0, nodeCount);

		if (initialize) {
			for (let index = 0; index < nodeCount; index++) {
				this.colors[index * 4 + 3] = 1.0;
				this.outlineColors[index * 4 + 3] = 1.0;
			}
		}
	}

	_ensureNodeAttributeView(name, type, dimension) {
		let buffer;
		try {
			buffer = this._helios.getNodeAttributeBuffer(name);
		} catch (error) {
			if (!error?.message?.includes("Unknown")) {
				throw error;
			}
			this._helios.defineNodeAttribute(name, type, dimension);
			buffer = this._helios.getNodeAttributeBuffer(name);
		}
		if (buffer.type !== type || buffer.dimension !== dimension) {
			throw new Error(`Attribute ${name} has an unexpected layout`);
		}
		return buffer.view;
	}

	_ensureEdgeAttributeView(name, type, dimension) {
		let buffer;
		try {
			buffer = this._helios.getEdgeAttributeBuffer(name);
		} catch (error) {
			if (!error?.message?.includes("Unknown")) {
				throw error;
			}
			this._helios.defineEdgeAttribute(name, type, dimension);
			buffer = this._helios.getEdgeAttributeBuffer(name);
		}
		if (buffer.type !== type || buffer.dimension !== dimension) {
			throw new Error(`Edge attribute ${name} has an unexpected layout`);
		}
		return buffer.view;
	}

	_applyNodePosition(node, index) {
		const position = Array.isArray(node.Position) ? node.Position : null;
		const fallback = this._randomPosition();
		const [x, y, z] = position ?? [
			node.posx ?? fallback[0],
			node.posy ?? fallback[1],
			node.posz ?? fallback[2],
		];
		const base = index * 3;
		this.positions[base + 0] = x;
		this.positions[base + 1] = y;
		this.positions[base + 2] = position && position.length > 2 ? position[2] : z;
	}

	_applyNodeColor(node, index, defaultColor) {
		let color = null;
		if (Array.isArray(node.Color)) {
			color = node.Color;
		}
		const base = index * 4;
		const source = color ?? defaultColor;
		this.colors[base + 0] = source[0] ?? defaultColor[0];
		this.colors[base + 1] = source[1] ?? defaultColor[1];
		this.colors[base + 2] = source[2] ?? defaultColor[2];
		this.colors[base + 3] = source.length > 3 ? source[3] : (color ? 1.0 : this.colors[base + 3]);
		if (!color) {
			this.colors[base + 3] = 1.0;
		}
	}

	_applyNodeSize(node, index) {
		if (typeof node.Size === "number") {
			this.sizes[index] = node.Size * 0.2;
		} else if (typeof node.size === "number") {
			this.sizes[index] = node.size * 0.2;
		} else {
			this.sizes[index] = 1.0;
		}
	}

	_applyOutline(node, index) {
		const hasOutlineColor = Array.isArray(node.OutlineColor);
		const base = index * 4;
		if (hasOutlineColor) {
			this.outlineColors[base + 0] = node.OutlineColor[0];
			this.outlineColors[base + 1] = node.OutlineColor[1];
			this.outlineColors[base + 2] = node.OutlineColor[2];
			this.outlineColors[base + 3] = node.OutlineColor.length > 3 ? node.OutlineColor[3] : 1.0;
		} else {
			this.outlineColors[base + 0] = 1.0;
			this.outlineColors[base + 1] = 1.0;
			this.outlineColors[base + 2] = 1.0;
			this.outlineColors[base + 3] = 1.0;
		}
		this.outlineWidths[index] = typeof node.OutlineWidth === "number" ? node.OutlineWidth : 0.0;
	}

	_randomPosition() {
		return [
			(Math.random() - 0.5) * 400,
			(Math.random() - 0.5) * 400,
			(Math.random() - 0.5) * 400,
		];
	}

	_populateEdgesFromData(edges) {
		const edgeCount = edges.length;
		if (edgeCount === 0) {
			this.indexedEdges = new Int32Array();
			this.edgeWeights = null;
			this.edgeAttributes = {};
			return;
		}

		const flatEdges = new Uint32Array(edgeCount * 2);
		const weights = this.weighted ? new Float32Array(edgeCount) : null;
		const attributeStore = {};

		for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
			const edge = edges[edgeIndex];
			const fromIndex = this._resolveNodeIndex(edge.source);
			const toIndex = this._resolveNodeIndex(edge.target);
			flatEdges[edgeIndex * 2] = fromIndex;
			flatEdges[edgeIndex * 2 + 1] = toIndex;
			if (weights) {
				weights[edgeIndex] = typeof edge.weight === "number" ? edge.weight : 1.0;
			}
			for (const [property, value] of Object.entries(edge)) {
				if (property === "source" || property === "target" || property === "weight") {
					continue;
				}
				if (!attributeStore[property]) {
					attributeStore[property] = new Array(edgeCount);
				}
				attributeStore[property][edgeIndex] = value;
			}
		}

		this._helios.addEdges(flatEdges);
		this._syncEdgesFromHelios();
		this.edgeAttributes = attributeStore;

		if (weights) {
			const view = this._ensureEdgeAttributeView(EDGE_WEIGHT_ATTRIBUTE, AttributeType.Float, 1);
			this.edgeWeights = view.subarray(0, edgeCount);
			this.edgeWeights.set(weights);
		} else {
			this.edgeWeights = null;
		}

		this._linkNeighbors();
	}

	_syncEdgesFromHelios() {
		const edgeCount = this._helios.edgeCount;
		if (edgeCount === 0) {
			this.indexedEdges = new Int32Array();
			return;
		}
		const buffer = this._helios.edgesView;
		this.indexedEdges = new Int32Array(buffer.buffer, buffer.byteOffset, edgeCount * 2);
	}

	_linkNeighbors() {
		const edgeCount = this.indexedEdges.length / 2;
		for (const node of this.indexedNodes) {
			if (!node) {
				continue;
			}
			node.neighbors = [];
			node.edges = [];
		}
		for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
			const fromNode = this.indexedNodes[this.indexedEdges[edgeIndex * 2]];
			const toNode = this.indexedNodes[this.indexedEdges[edgeIndex * 2 + 1]];
			if (!fromNode || !toNode) {
				continue;
			}
			fromNode.neighbors.push(toNode);
			fromNode.edges.push(edgeIndex);
			if (!this.directed) {
				toNode.neighbors.push(fromNode);
				toNode.edges.push(edgeIndex);
			}
		}
	}

	_populateEdgeLabelsFromHelios() {
		const labelAccessor = this._getStringAttributeAccessor("edge", LABEL_ATTRIBUTE);
		if (!labelAccessor) {
			return;
		}
		const edgeCount = this._helios.edgeCount;
		const labels = new Array(edgeCount);
		for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
			labels[edgeIndex] = labelAccessor(edgeIndex);
		}
		this.edgeAttributes[LABEL_ATTRIBUTE] = labels;
	}

	_getStringAttributeAccessor(scope, name) {
		try {
			const buffer = scope === "node"
				? this._helios.getNodeAttributeBuffer(name)
				: this._helios.getEdgeAttributeBuffer(name);
			if (buffer.type !== AttributeType.String) {
				return null;
			}
			if (scope === "node") {
				return (index) => this._helios.getNodeStringAttribute(name, index);
			}
			return (index) => this._helios.getEdgeStringAttribute(name, index);
		} catch (_) {
			return null;
		}
	}

	_edgeAttributeExists(name) {
		try {
			this._helios.getEdgeAttributeBuffer(name);
			return true;
		} catch (_) {
			return false;
		}
	}

	_resolveNodeIndex(reference) {
		if (typeof reference === "number" && Number.isInteger(reference)) {
			return reference;
		}
		if (typeof reference === "string" && this.ID2index.hasOwnProperty(reference)) {
			return this.ID2index[reference];
		}
		if (reference && typeof reference === "object") {
			if (typeof reference.index === "number") {
				return reference.index;
			}
			if (reference.ID && this.ID2index.hasOwnProperty(reference.ID)) {
				return this.ID2index[reference.ID];
			}
		}
		throw new Error("Unable to resolve node reference for edge");
	}

	updateEdgePositions() {
		if (this.edgePositions == null) {
			this.edgePositions = new Float32Array(3 * this.indexedEdges.length);
		}

		const edgesLength = this.indexedEdges.length;
		const nodePositions = this.positions;
		const edgePositions = this.edgePositions;
		for (let edgeIndex = 0; edgeIndex < edgesLength / 2; edgeIndex++) {
			const fromIndex = this.indexedEdges[edgeIndex * 2] * 3;
			const toIndex = this.indexedEdges[edgeIndex * 2 + 1] * 3;
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
		for (let edgeIndex = 0; edgeIndex < edgesLength / 2; edgeIndex++) {
			const fromIndex = this.indexedEdges[edgeIndex * 2] * 4;
			const toIndex = this.indexedEdges[edgeIndex * 2 + 1] * 4;
			const edgeFromColorIndex = edgeIndex * 8;
			const edgeToColorIndex = edgeFromColorIndex + 4;

			edgeColors[edgeFromColorIndex] = nodeColors[fromIndex];
			edgeColors[edgeFromColorIndex + 1] = nodeColors[fromIndex + 1];
			edgeColors[edgeFromColorIndex + 2] = nodeColors[fromIndex + 2];

			edgeColors[edgeToColorIndex] = nodeColors[toIndex];
			edgeColors[edgeToColorIndex + 1] = nodeColors[toIndex + 1];
			edgeColors[edgeToColorIndex + 2] = nodeColors[toIndex + 2];

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
		const edgeSizes = this.edgeSizes;
		const nodeSizes = this.sizes;
		for (let edgeIndex = 0; edgeIndex < edgesLength / 2; edgeIndex++) {
			const fromIndex = this.indexedEdges[edgeIndex * 2];
			const toIndex = this.indexedEdges[edgeIndex * 2 + 1];
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
		for (let edgeIndex = 0; edgeIndex < edgesLength / 2; edgeIndex++) {
			const fromIndex = this.indexedEdges[edgeIndex * 2] * 4;
			const toIndex = this.indexedEdges[edgeIndex * 2 + 1] * 4;
			edgeColors[edgeIndex * 8 + 3] = nodeColors[fromIndex + 3];
			edgeColors[edgeIndex * 8 + 7] = nodeColors[toIndex + 3];
		}
	}

	edgeAttribute(attributeName, value) {
		const edgeCount = this.indexedEdges.length / 2;
		if (value === undefined) {
			return this.edgeAttributes[attributeName];
		}
		if (!this.edgeAttributes.hasOwnProperty(attributeName)) {
			this.edgeAttributes[attributeName] = new Array(edgeCount);
		}
		if (typeof value === "function") {
			for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
				this.edgeAttributes[attributeName][edgeIndex] = value(this.edgeAttributes[attributeName][edgeIndex]);
			}
		} else {
			for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
				this.edgeAttributes[attributeName][edgeIndex] = value;
			}
		}
		return this;
	}

	mapEdges(attributeName, visualAttribute, transformFunction) {
		if (!this.edgeAttributes.hasOwnProperty(attributeName)) {
			throw new Error(`Attribute ${attributeName} does not exist`);
		}
		const edgeCount = this.indexedEdges.length / 2;
		if (visualAttribute === "color") {
			this.edgeColors = new Float32Array(4 * this.indexedEdges.length);
			const edgeColors = this.edgeColors;
			const edgeAttributes = this.edgeAttributes[attributeName];
			for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
				const visualAttributeValue = transformFunction(edgeAttributes[edgeIndex]);
				const base = edgeIndex * 8;
				edgeColors[base + 0] = visualAttributeValue[0];
				edgeColors[base + 1] = visualAttributeValue[1];
				edgeColors[base + 2] = visualAttributeValue[2];
				edgeColors[base + 4] = visualAttributeValue[0];
				edgeColors[base + 5] = visualAttributeValue[1];
				edgeColors[base + 6] = visualAttributeValue[2];
				edgeColors[base + 3] = visualAttributeValue.length > 3 ? visualAttributeValue[3] : 1.0;
				edgeColors[base + 7] = visualAttributeValue.length > 3 ? visualAttributeValue[3] : 1.0;
			}
		} else if (visualAttribute === "size" || visualAttribute === "width") {
			this.edgeSizes = new Float32Array(this.indexedEdges.length);
			const edgeSizes = this.edgeSizes;
			const edgeAttributes = this.edgeAttributes[attributeName];
			for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
				const visualAttributeValue = transformFunction(edgeAttributes[edgeIndex]);
				edgeSizes[edgeIndex * 2] = visualAttributeValue;
				edgeSizes[edgeIndex * 2 + 1] = visualAttributeValue;
			}
		} else if (visualAttribute === "opacity") {
			this.edgeColors = new Float32Array(4 * this.indexedEdges.length);
			const edgeColors = this.edgeColors;
			const edgeAttributes = this.edgeAttributes[attributeName];
			for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
				const visualAttributeValue = transformFunction(edgeAttributes[edgeIndex]);
				edgeColors[edgeIndex * 8 + 3] = visualAttributeValue;
				edgeColors[edgeIndex * 8 + 7] = visualAttributeValue;
			}
		} else {
			throw new Error(`Visual attribute ${visualAttribute} is not supported`);
		}
		return this;
	}
}

class NodeSelector {
	constructor(network, { nodeIndices = [], nodeIDs = [] }) {
		this._network = network;
		if (nodeIndices.length > 0 && nodeIDs.length > 0) {
			throw new Error("NodeSelector can only be initialized with nodeIndices or nodeIDs, not both");
		}
		this._nodeIndices = nodeIndices;
		if (nodeIDs.length > 0) {
			this._nodeIndices = nodeIDs.map((id) => this._network.ID2index[id]);
		}
	}

	includeNodeID(nodeID) {
		this._nodeIndices.push(this._network.ID2index[nodeID]);
	}

	includeNode(node) {
		this._nodeIndices.push(node.index);
	}

	includeNodeIndex(nodeIndex) {
		this._nodeIndices.push(nodeIndex);
	}

	filter(selectorFunction) {
		const nodes = this._network.nodes;
		const nodeIndices = this._nodeIndices;
		const selectedNodeIndices = [];
		for (let i = 0; i < nodeIndices.length; i++) {
			const nodeIndex = nodeIndices[i];
			if (selectorFunction(nodes[nodeIndex])) {
				selectedNodeIndices.push(nodeIndex);
			}
		}
		return new NodeSelector(this._network, { nodeIndices: selectedNodeIndices });
	}

	selectFromAttributes(attributeNames, selectorFunction) {
		const nodes = this._network.nodes;
		const nodeIndices = this._nodeIndices;
		const selectedNodeIndices = [];
		for (let i = 0; i < nodeIndices.length; i++) {
			const nodeIndex = nodeIndices[i];
			const node = nodes[nodeIndex];
			const nodeAttributes = {};
			for (let j = 0; j < attributeNames.length; j++) {
				const attributeName = attributeNames[j];
				nodeAttributes[attributeName] = node[attributeName];
			}
			if (selectorFunction(nodeAttributes)) {
				selectedNodeIndices.push(nodeIndex);
			}
		}
		return new NodeSelector(this._network, { nodeIndices: selectedNodeIndices });
	}

	get indices() {
		return this._nodeIndices;
	}

	get nodes() {
		return this._nodeIndices.map((nodeIndex) => this._network.nodes[nodeIndex]);
	}

	get nodeIDs() {
		return this._nodeIndices.map((nodeIndex) => this._network.nodes[nodeIndex].ID);
	}

	nodeAttribute(attributeName, value) {
		const nodes = this._network.nodes;
		const nodeIndices = this._nodeIndices;
		if (value === undefined) {
			const attributeValues = [];
			for (let i = 0; i < nodeIndices.length; i++) {
				const nodeIndex = nodeIndices[i];
				attributeValues.push(nodes[nodeIndex][attributeName]);
			}
			return attributeValues;
		}
		if (typeof value === "function") {
			for (let i = 0; i < nodeIndices.length; i++) {
				const nodeIndex = nodeIndices[i];
				nodes[nodeIndex][attributeName] = value(nodes[nodeIndex]);
			}
		} else {
			for (let i = 0; i < nodeIndices.length; i++) {
				const nodeIndex = nodeIndices[i];
				nodes[nodeIndex][attributeName] = value;
			}
		}
		return this;
	}
}
