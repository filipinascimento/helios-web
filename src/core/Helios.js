


export class Helios{
	constructor(
			element,
			nodes = [],
			edges = [],
			onNodeClick = null,
			onEdgeClick = null,
			display = [],
		){
			this.element = element;
			this.nodes = nodes;
			this.edges = edges;
			this.onNodeClick = onNodeClick;
			this.onEdgeClick = onEdgeClick;
			this.display = display;
		}
	}