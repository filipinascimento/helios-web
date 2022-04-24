import { Helios, xnet } from "../../src/helios"

// import {Helios,xnet} from "https://cdn.skypack.dev/helios-web?min";
import * as d3Chromatic from "d3-scale-chromatic"
import { scaleOrdinal as d3ScaleOrdinal, scaleSequential as d3ScaleSequential } from "d3-scale"
import { select as d3Select } from "d3-selection"
import { rgb as d3rgb } from "d3-color"
import * as extraColors from "./extraColors"


let allColors = {}
Object.assign(allColors, d3Chromatic);
Object.assign(allColors, extraColors);
console.log(allColors)

let ignoredProperties = new Set(["ID","edges","neighbors"]);
/*
 * Some auxiliary functions
*/

function sortByCount(anArray) {
	let map = anArray.reduce((p, c) => {
		p.set(c, (p.get(c) || 0) + 1);
		return p;
	}, new Map());

	let newArray = Array.from(map.keys()).sort((a, b) => map.get(b) - map.get(a));
	return newArray;
}

function downloadText(filename, text) {
	var element = document.createElement('a');
	element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
	element.setAttribute('download', filename);

	element.style.display = 'none';
	document.body.appendChild(element);

	element.click();

	document.body.removeChild(element);
}

function wrapText() {
	let width = 300;
	let padding = 10
	let self = d3Select(this),
		textLength = self.node().getComputedTextLength(),
		text = self.text();
	while (textLength > (width - 2 * padding) && text.length > 0) {
		text = text.slice(0, -1);
		self.text(text + '...');
		textLength = self.node().getComputedTextLength();
	}
}


/*
 * Reading all parameters from the URL
*/

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

let networkName = "WS_10000_10_001"
if (urlParams.has("network")) {
	networkName = urlParams.get("network");
}
let use2D = false;
if (urlParams.has("use2d")) {
	use2D = true;
}

let shaded = false;
if (urlParams.has("shaded")) {
	shaded = true;
}

let advancedEdges = false;
if (urlParams.has("advanced")) {
	advancedEdges = true;
}

let startZoomLevel = null;
if (urlParams.has("zoom")) {
	startZoomLevel = +urlParams.get("zoom");
}

let autoStartLayout = null;
if (urlParams.has("layout")) {
	autoStartLayout = ((+urlParams.get("layout")) != 0) ? true : false;
}

let darkBackground = false;
let backgroundColor = [1.0, 1.0, 1.0, 1.0]

if (urlParams.has("dark")) {
	darkBackground = true;
	backgroundColor = [0.0, 0.0, 0.0, 1.0]
}

let additiveBlending = false;
if (urlParams.has("additive") && darkBackground) {
	additiveBlending = true;
}



let visualizeNetwork = (networkName) => {
	xnet.loadXNETFile("networks/" + networkName + ".xnet").then(async network => {

		/*
		 * Defining default and initial parameters
		*/

		// Initial property used for coloring
		let colorProperty = "index";

		// Default visual properties
		let defaultNodeScale = 1.0;
		let defaultNodeOpacity = 1.0;
		let defaultOutlineColor = backgroundColor;
		let defaultOutlineWidthFactor = 0.25;
		// shaded mode does not require any outline
		if(shaded){
			defaultOutlineWidthFactor = 0.0;
		}

		// Zoom level for the whole network
		let defaultZoomLevel = 0.75;
		let defaultZoomLevelBigNetworks = 0.35;

		// Zoom level for centered nodes
		let minCenteredNodeZoomLevel = 4.0;
		
		// Default node size and Edge Ooacity
		let currentGlobalNodeSizeScale = 1.0;
		let currentGlobalEdgeOpacityScale = 1.0;

		// Scale and Opacity of Highlighted nodes
		let highlightNodeScale = 2.0;
		let highlightNodeOpacityScale = 1e10;// as opaque as possible

		// Scale and Opacity of selected nodes
		let selectedNodeScale = 3.0;
		let selectedNodeOpacityScale = 1e10; // as opaque as possible
		let selectedNeighborNodeSizeScale = 2.0;
		let selectedNeighborNodeOpacityScale = 1.5;
		let selectedOutlineColor = [0.9,0.9,0.0];

		
		// Visual properties of non selected and non highlighted nodes
		let nonSelectedNodeOpacityScale = 0.95;
		let nonSelectedNodeSizeScale = 0.5;
		let nonSelectedDarkerColorFactor = 1.5;
		let nonSelectedBrighterColorFactor = 0.5;
		
		// Will make all colors darker or brither (depending on the background)
		// when highligthing nodes
		// can be super slow for large networks
		let onHighlightChangeColorsEnabled = false; 
		// when selecting nodes (double clicking)
		let onSelectionChangeColorsEnabled = true;


		// Initializing other properties
		let sequencialColormap = "interpolateInferno";
		let categoricalColormap = "schemeCategory10";
		let useCategoricalColormap = false;

		let tooltipElement = document.getElementById("tooltip");

		/*
		 * Initializing the network
		*/

		let nodeCount = network.nodesCount;
		let bigNetwork = nodeCount > 100000;

		console.log(network)

		let nodes = {};
		let edges = [];
		for (let index = 0; index < nodeCount; index++) {
			nodes["" + index] = {
				ID: "" + index,
				// position: [0,0,0],//network.verticesProperties["Position"][index],
				// color:[0.0,0.0,0.0]//[network.verticesProperties["Color"][index]],
				// size:1
			};
			if (network.labels) {
				nodes["" + index].label = network.labels[index];
			}
		}
		for (const [key, value] of Object.entries(network.verticesProperties)) {
			for (let index = 0; index < nodeCount; index++) {
				nodes["" + index][key.toLowerCase()] = value[index];
			}
		}

		for (let index = 0; index < network.edges.length; index++) {
			let fromIndex, toIndex;

			edges.push({
				"source": "" + network.edges[index][0],
				"target": "" + network.edges[index][1],
				// directed?
			});
		}

		// console.log(Object.entries(d3Chromatic));
		// autostartlayout is not null
		if (autoStartLayout === null) {
			// only starts if the network is not too big
			autoStartLayout = !bigNetwork;
		}

		let helios = new Helios({
			elementID: "netviz",
			nodes: nodes,
			edges: edges,
			use2D: use2D,
			fastEdges: !advancedEdges&&bigNetwork,
			autoStartLayout: autoStartLayout,
		});

		let updateNodeSelectionStyle = (node) => {
			// Hovering
			if ((typeof node.highlighted === 'undefined')) { 
				node.highlighted = false;
			}
			// After double click
			if ((typeof node.selected === 'undefined')) {
				node.selected = false;
			}
			// After double click
			if ((typeof node.selectedNeighbor === 'undefined')) {
				node.selectedNeighbor = false;
			}

			let nodeSize = defaultNodeScale;
			let nodeOutlineWidth = defaultOutlineWidthFactor;
			let nodeOpacity = defaultNodeOpacity;
			
			if(node.selected){
				nodeSize *= selectedNodeScale;
				nodeOpacity *= selectedNodeOpacityScale;
				node.outlineColor = selectedOutlineColor;
				nodeOutlineWidth *= selectedNodeScale;
			}else if(node.selectedNeighbor){
				nodeSize *= selectedNeighborNodeSizeScale;
				nodeOpacity *= selectedNeighborNodeOpacityScale;
				node.outlineColor = defaultOutlineColor;
				nodeOutlineWidth *= selectedNeighborNodeSizeScale;
			}else{
				node.outlineColor = defaultOutlineColor;
			}

			if(node.highlighted){
				nodeSize *= highlightNodeScale;
				nodeOpacity *= highlightNodeOpacityScale;
				nodeOutlineWidth *= highlightNodeScale;
			}

			node.size = nodeSize;
			node.opacity = nodeOpacity;
			node.outlineWidth = nodeOutlineWidth;
			
		};

		let nodesHighlight = (nodes,shallHighlight,shallUpdate=true) =>{
			
			nodes.forEach(node => {
				node.highlighted = shallHighlight;
				updateNodeSelectionStyle(node);
			});

			if(onHighlightChangeColorsEnabled){
				if((nodes?.length) && shallHighlight){
					updateNodeSelectionOrHighlightedColors(true);
				}else{
					updateNodeSelectionOrHighlightedColors();
				}
			}

			if(shallUpdate){
				helios.update();
				helios.render();
			}
		};

		let nodesSelect = (nodes,shallSelect,shallUpdate=true) => {
			nodes.forEach(node => {
				node.selected = shallSelect;
				node.selectedNeighbor = shallSelect;
				node.neighbors.forEach(neighNode => {
					neighNode.selectedNeighbor = shallSelect;
					updateNodeSelectionStyle(neighNode);
				});
				updateNodeSelectionStyle(node);
			})

			if((nodes?.length) && shallSelect){
				updateNodeSelectionGlobalStyle(true);
				if(onSelectionChangeColorsEnabled){
					updateNodeSelectionOrHighlightedColors(true);
				}
			}else{
				updateNodeSelectionGlobalStyle();
				if(onSelectionChangeColorsEnabled){
					updateNodeSelectionOrHighlightedColors();
				}
			}

			if(shallUpdate){
				helios.update();
				helios.render();
			}
		};

		let centerOnNodes = (nodes) => {
			if(!nodes || nodes.length>0){
				if (helios.zoomFactor() < minCenteredNodeZoomLevel) {
					helios.zoomFactor(minCenteredNodeZoomLevel, 500);
				}
				nodesSelect(helios.centeredNodes(),false,false);
				nodesSelect(nodes,true,false);
				helios.centerOnNodes(nodes, 500);
				nodes.forEach(node => {
					helios.pickeableEdges(node.edges);
				});
				helios.update();
				helios.render();
			}else{ // Reset
				nodesSelect(helios.centeredNodes(),false,false);
				helios.zoomFactor(defaultZoomLevel, 500);
				helios.centerOnNodes([], 500);
				helios.pickeableEdges([]);
				helios.update();
				helios.render();
			}
		}


		let stylizeTooltip = (label,color,x,y,isnew) => {
			if(label){
				tooltipElement.style.left = x + "px";
				tooltipElement.style.top = y + "px";
				if(isnew){
					tooltipElement.style.display = "block";
					if (darkBackground) {
						tooltipElement.style.color = d3rgb(color[0] * 255, color[1] * 255, color[2] * 255).brighter(2).formatRgb();
						tooltipElement.style["text-shadow"] =
							"-1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black, 1px 1px 0 black";
					} else {
						tooltipElement.style.color = d3rgb(color[0] * 255, color[1] * 255, color[2] * 255).darker(2).formatRgb();
						tooltipElement.style["text-shadow"] =
							"-1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white, 1px 1px 0 white";
					}
				}
				tooltipElement.textContent = label;
			}else{
				tooltipElement.style.display = "none";
			}
		}
		
		let showTooltipForNode = (node,x,y,isNew) => {
			if (node) {
				let label = node.label ?? node.title ?? node.ID;
				stylizeTooltip(label,node.color,x,y,isNew);
				// nodesHighlight([node],true);
			} else {
				stylizeTooltip(null);
			}
		}
		
		let showTooltipForEdge = (edge,x,y,isNew) => {
			if (edge) {
				let fromLabel = edge.source.label ?? edge.source.title ?? edge.source.ID;
				let toLabel = edge.target.label ?? edge.target.title ?? edge.target.ID;
				let label = fromLabel + " - " + toLabel;
				stylizeTooltip(label,edge.source.color,x,y,isNew);
				// nodesHighlight([edge.source,edge.target],true);
			} else {
				stylizeTooltip(null);
			}
		}

		
		let updateNodeSelectionGlobalStyle = (hasSelection) =>{
			// hasSelection not set 
			if(typeof hasSelection === 'undefined'){
				hasSelection = helios.network.index2Node.some(node=>node.selected);
			}
			if(hasSelection){
				helios.nodesGlobalOpacityScale(nonSelectedNodeOpacityScale);
				helios.nodesGlobalSizeScale(nonSelectedNodeSizeScale*currentGlobalNodeSizeScale);
				helios.nodesGlobalOutlineWidthScale(nonSelectedNodeSizeScale*currentGlobalNodeSizeScale);
				helios.edgesGlobalOpacityScale(currentGlobalEdgeOpacityScale*nonSelectedNodeOpacityScale);
			}else{
				helios.nodesGlobalOpacityScale(defaultNodeOpacity);
				helios.nodesGlobalSizeScale(currentGlobalNodeSizeScale);
				helios.nodesGlobalOutlineWidthScale(currentGlobalNodeSizeScale);
				helios.edgesGlobalOpacityScale(currentGlobalEdgeOpacityScale);
			}
		}

		let updateNodeSelectionOrHighlightedColors = (hasSelection) =>{
			// hasSelection not set 
			if(typeof hasSelection === 'undefined'){
				hasSelection = helios.network.index2Node.some(node=>node.selected||node.highlighted||node.selectedNeighbor);
			}
			if(hasSelection){
				helios.nodeColor(node => {
					// console.log(""+[color.r,color.g,color.b])
					if(node.selected || node.highlighted || node.selectedNeighbor){
						return node.originalColor;
					}else{
						return darkBackground?node.darkerColor:node.brighterColor;
					}
				});
			}else{
				helios.nodeColor(node => {
					return node.originalColor;
				});
			}
		}




		let logK = Math.log10(helios.network.indexedEdges.length/helios.network.index2Node.length);
		let logN = Math.log10(helios.network.index2Node.length);
		let logDensity = Math.log10(2.0*helios.network.indexedEdges.length/helios.network.index2Node.length/(helios.network.index2Node.length-1.0));
		
		// let estimatedZoom = Math.pow(10,1.3400+0.2144*logK+-0.3623*logN+0.0000*logDensity)
		// let estimatedOpacity = Math.pow(10,1.8854+-0.6344*logK+-0.4964*logN+0.0000*logDensity)
		// // estimatedSize = Math.pow(10,-0.4027+-0.0007*logK+0.0335*logN+0.0000*logDensity)
		// let logZoom =  Math.log10(estimatedZoom);
		// let estimatedSize = Math.pow(10,0.6432+0.1667*logK+-0.2493*logN+-0.7805*logZoom+0.0000*logDensity)

		let estimatedZoom = Math.pow(10,1.2601+0.2488*logK+-0.3631*logN+0.0000*logDensity)
		let estimatedOpacity = Math.pow(10,1.9968+-0.6822*logK+-0.4954*logN+0.0000*logDensity)
		
		// Not using estimated zoom
		if (!bigNetwork) {
			estimatedZoom = defaultZoomLevel;
		}else{
			estimatedZoom = defaultZoomLevelBigNetworks;
		}

		let logZoom =  Math.log10(estimatedZoom);
		// let estimatedSize = Math.pow(10,-0.2833+-0.0520*logK+0.0347*logN+0.0000*logDensity)

		let estimatedSize = Math.pow(10,0.8744+0.1766*logK+-0.2989*logN+-0.9187*logZoom+0.0000*logDensity)

		// estimatedZoom = Math.pow(10,1.2771+0.2415*logK+-0.3629*logN+0.0000*logDensity)
		// estimatedOpacity = Math.pow(10,1.8780+-0.6312*logK+-0.4965*logN+0.0000*logDensity)
		// estimatedSize = Math.pow(10,-0.3259+-0.0337*logK+0.0343*logN+0.0000*logDensity)
		// estimatedSize3 = Math.pow(10,0.7583+0.1713*logK+-0.2738*logN+-0.8489*logZoom+0.0000*logDensity)
		
		currentGlobalNodeSizeScale = estimatedSize;
		currentGlobalEdgeOpacityScale = estimatedOpacity;
		defaultZoomLevel = estimatedZoom;

		helios.onNodeHoverStart((node, event) => {
			showTooltipForNode(node,event?.clientX,event?.clientY,true);
			nodesHighlight([node],true);
			// console.log(`Start: ${node.ID}`);
		});

		helios.onNodeHoverMove((node, event) => {
			showTooltipForNode(node,event?.clientX,event?.clientY,false);
		});

		helios.onNodeHoverEnd((node, event) => {
			if (node) {
				nodesHighlight([node],false);
			}
			showTooltipForNode(null);
			// console.log(`Hover ended: ${node.ID}`);
		});

		helios.onNodeClick((node, event) => {
			if (node) {
				console.log(`Clicked: ${node.ID}`);
			} else {
				console.log(`Clicked on background`);
			}
		});

		helios.onNodeDoubleClick((node, event) => {
			if (node) {
				console.log(`Double Clicked: ${node.ID}`);
				// Special function for dealing with MAG/Openalex Citation networks
				if ("mag id" in node) {
					window.open(`https://explore.openalex.org/works/W${node["mag id"]}`, "helios_mag");
				} else {
					centerOnNodes([node]);
				}
			} else {
				console.log(`Double clicked on background`);
				centerOnNodes([]); //Reset centers

			}
		});

		helios.onEdgeHoverStart((edge, event) => {
			showTooltipForEdge(edge,event?.clientX,event?.clientY,true);
			if(edge){
				// Only the non selected endpoints are highlighted
				nodesHighlight([edge.source,edge.target].filter(node=>!node.selected),true);
			}
		});

		helios.onEdgeHoverMove((edge, event) => {
			showTooltipForEdge(edge,event?.clientX,event?.clientY,false);
		});

		helios.onEdgeHoverEnd((edge, event) => {
			if (edge) {
				// Only the non selected endpoints were highlighted
				nodesHighlight([edge.source,edge.target].filter(node=>!node.selected),false);
			}
			showTooltipForEdge(null);
		});

		helios.onEdgeClick((edge, event) => {
			console.log("Edge clicked");
			console.log(edge);
		});

		helios.onLayoutStart(() => {
			console.log("Layout start");
			d3Select("#loading").style("display", "block");
			d3Select("#message").style("display", "none");
		});

		helios.onLayoutStop(() => {
			console.log("Layout end");
			d3Select("#loading").style("display", "none");
			d3Select("#message").style("display", "block");
		});

		helios.backgroundColor(backgroundColor) // set background color
			// .nodeColor(node=>{ // Example on how to define colors
			// 	let color = d3rgb(colorScale(node.ID));
			// 	// console.log(""+[color.r,color.g,color.b])
			// 	return [color.r/255,color.g/255,color.b/255];
			// })
			// .nodeSize(node=>{ // Example on how to define size
			// 	return Math.random()*5+1.0;
			// })
			.edgesGlobalOpacityScale(1.0) // set edges intensity);
			.nodeSize(defaultNodeScale)
			.nodeOutlineWidth(defaultOutlineWidthFactor)
			.nodeOutlineColor(backgroundColor)
			.additiveBlending(additiveBlending)
			.shadedNodes(shaded);


		let buttonInformation = {
			"Export": {
				name: "Export",
				mapColor: "#B1C3B6",
				color: "#008758",
				action: (selection, d, event) => {
					if (event.shiftKey) {
						let pos = helios.network.positions;
						let postext = "";
						for (let i = 0; i < pos.length; i += 3) {
							postext += `${pos[i]} ${pos[i + 1]} ${pos[i + 2]}\n`;
						}
						downloadText(networkName + "_positions.txt", postext);
					} else {
						console.log("Action!");
						let dpr = window.devicePixelRatio || 1;
						helios.exportFigure(networkName + ".png", {
							scale: 2.0,
							// width: 2048,
							// height: 2048,
							supersampleFactor: 2.0,
							backgroundColor: backgroundColor,
						});
					}
				},
				extra: selection => {

				}
			},
			"Size": {
				name: "Size",
				mapColor: "#AFB9C9",
				color: "#1E6099",
				action: null,
				extra: selection => {
					selection.append("input")
						.attr("type", "range")
						.attr("min", "-1")
						.attr("max", "1")
						.attr("step", "0.1")
						.attr("value", ""+Math.log10(currentGlobalNodeSizeScale))
						.attr("id", "nodeSizeSlider")
						.classed("slider", true)
						.style("min-width", "60px")
						.on("input", (event, d) => {
							currentGlobalNodeSizeScale = Math.pow(10, parseFloat(d3Select("#nodeSizeSlider").property("value")));
							// helios.nodesGlobalSizeScale(currentGlobalNodeSizeScale);
							// helios.nodesGlobalOutlineWidthScale(currentGlobalNodeSizeScale);
							updateNodeSelectionGlobalStyle();
							helios.update();
							helios.render();
							event.stopPropagation();
						});
				}
			},
			"Color": {
				name: "Color",
				mapColor: "#AFB9C9",
				color: "#1E6099",
				action: null,
				extra: selection => {
					selection.append("select")
						.attr("id", "colorSelector")
						.classed("selector", true)
						.style("min-width", "60px")
						.on("change", (event, d) => {
							updateColorSelection();
						})
						.selectAll("option")
						.data(Object.entries(helios.network.index2Node[0]))
						.enter()
						.filter(d => !d[0].startsWith("_"))
						.filter(d => !ignoredProperties.has(d[0]))
						.append("option")
						.attr("value", d => d[0])
						.property("selected", d => d[0] == colorProperty)
						.text(d => d[0]);

					selection.append("select")
						.attr("id", "colormapSelector")
						.classed("selector", true)
						.style("min-width", "60px");
					// .classed("slider",true)
					// 
					// .on("input", (event,d)=>{
					// 	helios.edgesOpacity(Math.pow(10,parseFloat(d3Select("#edgeOpacitySlider").property("value"))));
					// 	helios.update();
					// 	helios.render();
					// 	event.stopPropagation();
					// });
				}
			},
			"Edges": {
				name: "Edges",
				mapColor: "#B1A58C",
				color: "#903C22",
				action: null,
				extra: selection => {
					console.log("CALLED");
					selection.append("input")
						.attr("type", "range")
						.attr("min", "0")
						.attr("max", "1")
						.attr("step", (1 / 255) + "")
						.attr("value", ""+(Math.round(255*currentGlobalEdgeOpacityScale)/255))
						.attr("id", "edgeOpacitySlider")
						.classed("slider", true)
						.style("min-width", "60px")
						.on("input", (event, d) => {
							// helios.edgesOpacity(Math.pow(10,parseFloat(d3Select("#edgeOpacitySlider").property("value"))));
							currentGlobalEdgeOpacityScale = parseFloat(d3Select("#edgeOpacitySlider").property("value"))
							helios.edgesGlobalOpacityScale(currentGlobalEdgeOpacityScale);
							helios.update();
							helios.render();
							event.stopPropagation();
						});
				}
			},
		}

		let legendView = d3Select("body").append("svg")
			.classed("overlay", true)
			.attr("id", "legendView")
			.style("left", "10px")
			.style("top", "10px")
			.style("pointer-events:", "none")
		let updateLegendCategorical = (property2color) => {
			legendView.selectAll("*").remove();
			let legendItems = legendView.selectAll(".legend").data(property2color.keys());

			legendView
				.style("width", 350 + 'px')
				.style("height", (property2color.size + 1) * 20 + 'px');
			let legendEnter = legendItems.enter().append("g")
				.classed("legend", true)
				.attr("transform", (d, i) => ("translate(0," + (i * 20) + ")"));

			legendEnter.append("rect");
			legendEnter.append("g").append("text");
			legendItems = legendItems.merge(legendEnter)

			legendItems.select("rect")
				.attr("x", 0)
				.attr("y", 0)
				.attr("width", 30)
				.attr("height", 15)
				.attr("fill", d => property2color.get(d));

			legendItems.select("g")
				.attr("transform", (d) => (`translate(${35},${15 / 2})`))
				.select("text")
				.style("alignment-baseline", "central")
				.style("font-size", "12px")
				.append('tspan')
				.style("alignment-baseline", "central")
				.text(d => d)
				.attr("fill", darkBackground ? "white" : "black")
				.each(wrapText)
		}

		function updateCategoricalColors() {
			let propertyArray = [];
			for (let [key, node] of Object.entries(helios.network.nodes)) {
				propertyArray.push(node[colorProperty]);
			}
			let sortedItems = sortByCount(propertyArray);
			// console.log(sortedItems);
			let scheme = allColors[categoricalColormap];
			// console.log("Scheme",scheme);
			let arraysCount = scheme.filter(Array.isArray).length;

			if (arraysCount > 0) {
				let firstIndex = scheme.findIndex(d => (typeof d !== "undefined"));
				if (typeof scheme[sortedItems.length - 1] !== "undefined") {
					scheme = scheme[sortedItems.length];
				} else {
					if (sortedItems.length - 1 < firstIndex) {
						scheme = scheme[firstIndex];
					} else {
						scheme = scheme[scheme.length - 1];
					}
				}
			}
			// let maxColors = const [lastItem] = arr.slice(-1)
			// console.log(scheme)
			let colorMap = d3ScaleOrdinal(scheme);
			let property2color = new Map();
			let categoricalMap = new Map();
			sortedItems.forEach((d, i) => {
				if (i < scheme.length) {
					property2color.set(d, colorMap(d));
					categoricalMap.set(d, scheme[i]);
				} else {
					property2color.set(d, "#bbbbbb");;
				}
			});
			if (categoricalMap.size < sortedItems.length) {
				categoricalMap.set("Other", "#bbbbbb")
			}
			for (let [key, node] of Object.entries(helios.network.nodes)) {
				let color = d3rgb(property2color.get(node[colorProperty]));
				let darkerColor = color.darker(nonSelectedDarkerColorFactor);
				let brighterColor = color.brighter(nonSelectedBrighterColorFactor);

				node.originalColor = [color.r / 255, color.g / 255, color.b / 255];
				node.darkerColor = [darkerColor.r / 255, darkerColor.g / 255, darkerColor.b / 255];
				node.brighterColor = [brighterColor.r / 255, brighterColor.g / 255, brighterColor.b / 255];
			}
			updateNodeSelectionOrHighlightedColors();
			helios.update();
			helios.render();
			updateLegendCategorical(categoricalMap)
		}


		function updateSequencialColors() {
			updateLegendCategorical(new Map());
			let propertyArray = [];
			let maxValue = -Infinity;
			let minValue = Infinity;
			for (let [key, node] of Object.entries(helios.network.nodes)) {
				propertyArray.push(node[colorProperty]);
				maxValue = Math.max(maxValue, node[colorProperty]);
				minValue = Math.min(minValue, node[colorProperty]);
			}
			let scheme = allColors[sequencialColormap];
			let cScale = d3ScaleSequential(scheme)
				.domain([minValue, maxValue]);
				
			for (let [key, node] of Object.entries(helios.network.nodes)) {
				let color = d3rgb(cScale(node[colorProperty]));
				let darkerColor = color.darker(nonSelectedDarkerColorFactor);
				let brighterColor = color.brighter(nonSelectedBrighterColorFactor);

				node.originalColor = [color.r / 255, color.g / 255, color.b / 255];
				node.darkerColor = [darkerColor.r / 255, darkerColor.g / 255, darkerColor.b / 255];
				node.brighterColor = [brighterColor.r / 255, brighterColor.g / 255, brighterColor.b / 255];
			}
			updateNodeSelectionOrHighlightedColors();
			helios.update();
			helios.render();
		}

		let updateColormapSelection = () => {
			if (useCategoricalColormap) {
				categoricalColormap = d3Select("#colormapSelector").property("value");
				updateCategoricalColors();
			} else {
				sequencialColormap = d3Select("#colormapSelector").property("value");
				updateSequencialColors();
			}
		}

		let updateColorSelection = () => {
			colorProperty = d3Select("#colorSelector").property("value");
			let categorical = false;
			for (let [key, node] of Object.entries(helios.network.nodes)) {
				if (typeof node[colorProperty] !== 'number') {
					categorical = true;
					// console.log(colorProperty,node);
					break;
				}
			}
			useCategoricalColormap = categorical;
			console.log(categorical ? "categorical" : "continuous");
			let colormapSelector = d3Select("#colormapSelector")
				.classed("selector", true)
				.style("min-width", "60px")
				.on("change", (event, d) => {
					updateColormapSelection();
				})
				.selectAll("option")
				.data(Object.entries(allColors).filter(d => d[0].startsWith(categorical ? "scheme" : "interpolate")))
				.join("option")
				.attr("value", d => d[0])
				.property("selected", d => d[0] == (categorical ? categoricalColormap : sequencialColormap))
				.text(d => d[0].replace("interpolate", "").replace("scheme", ""));
			updateColormapSelection();
		}

		let buttonOrder = ["Export", "Size", "Color", "Edges",];

		d3Select("#selectionmenu")
			.selectAll("span.menuEntry")
			.data(buttonOrder)
			.enter()
			.append("span")
			.classed("menuEntry", true)
			.style("--color", d => buttonInformation[d].color)
			.text(d => buttonInformation[d].name)
			.each(function (d) {
				d3Select(this).call(buttonInformation[d].extra);
			});
		d3Select("#selectionmenu")
			.selectAll("span.menuEntry")
			.filter(d => buttonInformation[d].action != null)
			.on("click", (event, d) => {
				if (buttonInformation[d].action) {
					buttonInformation[d].action(d3Select(this), d, event);
				}
			})
			.classed("hasAction", true);


		document.addEventListener('keyup', event => {
			if (event.code === 'Space') {
				if (helios.layoutWorker.isRunning()) {
					helios.pauseLayout();
				} else {
					helios.resumeLayout();
				}
			}
		});

		if (startZoomLevel) {
			defaultZoomLevel = startZoomLevel;
			helios.zoomFactor(defaultZoomLevel);
		} else {
			if (bigNetwork) {
				//no animation
				helios.zoomFactor(defaultZoomLevel);
				// helios.zoomFactor(0.35);
			} else {
				//animating initial zoom in to the network
				helios.zoomFactor(0.05);
				helios.zoomFactor(defaultZoomLevel, 1000);
			}
		}

		helios.nodesGlobalSizeScale(currentGlobalNodeSizeScale);
		helios.nodesGlobalOutlineWidthScale(currentGlobalNodeSizeScale);
		helios.edgesGlobalOpacityScale(currentGlobalEdgeOpacityScale);

		
		helios.onReady(() => {
			updateColorSelection();
		});

		// Temporarily for debugging
		window.helios = helios;

	});
}

visualizeNetwork(networkName);