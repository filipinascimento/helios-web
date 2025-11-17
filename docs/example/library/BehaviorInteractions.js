
// for (let [key, node] of Object.entries(helios.network.nodes)) {
// 	let nodeDegree = node.edges.length;
// 	// check if nodes have property Size
// 	if (node.size) {
// 		node._originalSize = node.size;
// 	} else {
// 		node._originalSize = defaultNodeScale * (1.0 + Math.log10(nodeDegree + 1.0));
// 	}
// }

// let updateNodeSelectionStyle = (node) => {
// 	// Hovering
// 	if ((typeof node._highlighted === 'undefined')) {
// 		node._highlighted = false;
// 	}
// 	if ((typeof node._filtered === 'undefined')) {
// 		node._filtered = false;
// 	}
// 	// After double click
// 	if ((typeof node._selected === 'undefined')) {
// 		node._selected = false;
// 	}
// 	// After double click
// 	if ((typeof node._selectedNeighbor === 'undefined')) {
// 		node._selectedNeighbor = false;
// 	}

// 	let nodeSize = node._originalSize;
// 	let nodeOutlineWidth = defaultOutlineWidthFactor;
// 	let nodeOpacity = defaultNodeOpacity;

// 	if (node._selected) {
// 		nodeSize *= selectedNodeScale;
// 		nodeOpacity *= selectedNodeOpacityScale;
// 		node.outlineColor = selectedOutlineColor;
// 		nodeOutlineWidth *= selectedNodeScale;
// 	} else if (node._selectedNeighbor) {
// 		nodeSize *= selectedNeighborNodeSizeScale;
// 		nodeOpacity *= selectedNeighborNodeOpacityScale;
// 		node.outlineColor = defaultOutlineColor;
// 		nodeOutlineWidth *= selectedNeighborNodeSizeScale;
// 	} else {
// 		node.outlineColor = defaultOutlineColor;
// 	}

// 	if (node._highlighted) {
// 		nodeSize *= highlightNodeScale;
// 		nodeOpacity *= highlightNodeOpacityScale;
// 		nodeOutlineWidth *= highlightNodeScale;
// 	}

// 	if (node._filtered) {
// 		nodeSize *= 0.0;
// 		nodeOpacity *= 1.0;
// 		nodeOutlineWidth *= 0.0;
// 	}


// 	node.size = nodeSize;
// 	node.opacity = nodeOpacity;
// 	node.outlineWidth = nodeOutlineWidth;
// };

// let nodesHighlight = (nodes, shallHighlight, shallUpdate = true) => {

// 	nodes.forEach(node => {
// 		node._highlighted = shallHighlight;
// 		updateNodeSelectionStyle(node);
// 	});

// 	if (onHighlightChangeColorsEnabled) {
// 		if ((nodes?.length) && shallHighlight) {
// 			updateNodeSelectionOrHighlightedColors(true);
// 		} else {
// 			updateNodeSelectionOrHighlightedColors();
// 		}
// 	}

// 	if (shallUpdate) {
// 		helios.update();
// 		helios.render();
// 	}
// };


// let behaviorFilter = new BehaviorFilter(helios);

// let nodesSelect = (nodes, shallSelect, shallUpdate = true) => {
// 	nodes.forEach(node => {
// 		node._selected = shallSelect;
// 		node._selectedNeighbor = shallSelect;
// 		node.neighbors.forEach(neighNode => {
// 			neighNode._selectedNeighbor = shallSelect;
// 			updateNodeSelectionStyle(neighNode);
// 		});
// 		updateNodeSelectionStyle(node);
// 	})

// 	if ((nodes?.length) && shallSelect) {
// 		updateNodeSelectionGlobalStyle(true);
// 		if (onSelectionChangeColorsEnabled) {
// 			updateNodeSelectionOrHighlightedColors(true);
// 		}
// 	} else {
// 		updateNodeSelectionGlobalStyle();
// 		if (onSelectionChangeColorsEnabled) {
// 			updateNodeSelectionOrHighlightedColors();
// 		}
// 	}

// 	if (shallUpdate) {
// 		helios.update();
// 		helios.render();
// 	}
// };


export class nodeState{
	// Inputs
	// nodeColor
	// nodeSize
	// nodeOpacity
	// nodeOutlineColor
	// nodeOutlineWidth
	// same outputs
	constructor(helios, {
		nodeColor,
		nodeSize,
		nodeOpacity,
		nodeOutlineColor,
		nodeOutlineWidth
	}){
		this._helios = helios;
		this._nodeColor = nodeColor;
		this._nodeSize = nodeSize;
		this._nodeOpacity = nodeOpacity;
		this._nodeOutlineColor = nodeOutlineColor;
		this._nodeOutlineWidth = nodeOutlineWidth;
	}

	// applyNodeStyle method


	// applyGlobalStyle method
}
export class BehaviorNodeStates{
	constructor(helios,{
		states={
			"selected": {},
			"selected.neighbor": {},
			"highlighted": {},
			"filtered": {}
		},
		defaultNodeScale = 1.0,
		defaultNodeOpacity = 1.0,
		defaultOutlineColor = undefined,
		defaultOutlineWidthFactor = 0.5
	}){
		// let defaultNodeScale = 1.0;
		// let defaultNodeOpacity = 1.0;
		// let defaultOutlineColor = settings.backgroundColor;
		// let defaultOutlineWidthFactor = 0.5;
		this._helios = helios;
		this._interactions = {
			select,
			highlight,
			neighborSelect,
			filtered
		};

		this._defaults = {
			nodeScale,
			nodeOpacity,
			outlineColor,
			outlineWidthFactor
		};

		if(this._defaults.outlineColor === undefined){
			this._defaults.outlineColor = this._helios.backgroundColor();
		}



	}

	addInteraction(interaction){
		this._interactions.push(interaction);
	}

	get interactions(){
		return this._interactions;
	}
}