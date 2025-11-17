import { Helios, xnet, gexf, gml, BehaviorFilter} from "../../src/helios.js";
import { getGPUTier } from 'detect-gpu';

// import {Helios,xnet} from "https://cdn.skypack.dev/helios-web?min";
import * as d3Chromatic from "d3-scale-chromatic"
// import d3 min and d3 max
import { min as d3Min, max as d3Max } from "d3-array";
import { scaleLinear as d3ScaleLinear, scaleOrdinal as d3ScaleOrdinal, scaleSequential as d3ScaleSequential, scaleDiverging as d3ScaleDiverging } from "d3-scale"
import { select as d3Select, selectAll as d3SelectAll } from "d3-selection"
import {geoNaturalEarth1 as d3GeoNaturalEarth1, geoPath as d3GeoPath} from "d3-geo"
import { zoomIdentity as d3ZoomIdentity } from "d3-zoom";
import { rgb as d3rgb, hsl as d3hsl } from "d3-color"
import { default as extraColors } from "./library/extraColors"
import { default as autocomplete } from "./library/auto-complete_cache-control.js"
import { default as jsonQuery } from "json-query"
import { default as d3Legend } from "./library/d3_legends.js"
import { default as HeliosUI } from "./library/HeliosUI.js"
import { default as pako } from "pako"
import * as topojson from "topojson-client";
import * as noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css';
import "./css/customSliders.css";
import {default as mapCountries10m} from './maps/countries-50m.json';

let allColors = {}
Object.assign(allColors, d3Chromatic);
Object.assign(allColors, extraColors);

// console.log(allColors);
//remove last color of category10
// allColors["schemeCategory10"].pop();

//sort colors by name
allColors = Object.keys(allColors).sort().reduce((r, k) => (r[k] = allColors[k], r), {});

// allColors["interpolateRedBlackBlue"] = d3ScaleLinear().domain([0,0.5,1.0]).range(["red","black", "blue"])
let ignoredProperties = new Set(["ID", "edges", "neighbors"]);

const originalWidth = document.body.clientWidth;
const originalHeight = document.body.clientHeight;

// console.log(`SVG Width: ${svgWidth}, SVG Height: ${svgHeight}`);
// Set the projection to center of SVG
const globeProjection = d3GeoNaturalEarth1()
	// .scale((svgWidth / 1.3) / (2 * Math.PI)) // tweak scale to fit nicely
	// .translate([-svgWidth / 2, -svgHeight / 2]);
const path = d3GeoPath().projection(globeProjection);
const countries = topojson.feature(mapCountries10m, mapCountries10m.objects.countries).features;

globeProjection.fitSize([originalWidth, originalHeight], {
	type: "FeatureCollection",
	features: countries, // your topojson/geojson features array
});



function throttleLast(func, wait, scope) {
	let timer = null;
	return function () {
		if (timer) clearTimeout(timer);
		let args = arguments;
		timer = setTimeout(function () {
			timer = null;
			func.apply(scope, args);
		}, wait);
	};
};

/*
 * Some auxiliary functions
*/
function sortByCount(anArray) {
	let map = anArray.reduce((p, c) => {
		p.set(c, (p.get(c) || 0) + 1);
		return p;
	}, new Map());

	let newArray = Array.from(map.keys()).sort((a, b) => map.get(b) - map.get(a));

	if (newArray.includes("None")) {
		newArray = newArray.filter(d => d != "None")
		newArray.push("None")
	}

	if (newArray.includes("Other")) {
		newArray = newArray.filter(d => d != "Other")
		newArray.push("Other")
	}
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
	let width = 600;
	let padding = 10
	let self = d3Select(this),
		textLength = self.node().getComputedTextLength(),
		text = self.text();
	while (textLength > (width - 2 * padding) && text.length > 0) {
		text = text.slice(0, -1);
		self.text(text + '…');
		textLength = self.node().getComputedTextLength();
	}
}


/*
 * Reading all parameters from the URL
*/

const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);

const startSettings = {};

startSettings.networkName = "institutions_ROBOTICS"
if (urlParams.has("network")) {
	startSettings.networkName = urlParams.get("network");
}

startSettings.use2D = true;
if (urlParams.has("use2d")) {
	startSettings.use2D = true;
}

if (urlParams.has("2d")) {
	startSettings.use2D = true;
}

if (urlParams.has("format")) {
	startSettings.format = urlParams.get("format");
}


startSettings.searchEnabled = true;
if (urlParams.has("nosearch")) {
	startSettings.searchEnabled = false;
}

startSettings.legendsEnabled = true;
if (urlParams.has("nolegends")) {
	startSettings.legendsEnabled = false;
}


startSettings.hyperbolic = false;
if (urlParams.has("hyperbolic")) {
	startSettings.hyperbolic = true;
}

startSettings.shaded = false;
if (urlParams.has("shaded")) {
	startSettings.shaded = true;
}

startSettings.advancedEdges = false;
if (urlParams.has("advanced")) {
	startSettings.advancedEdges = true;
}


startSettings.definedSize = 0.20;
if (urlParams.has("size")) {
	startSettings.definedSize = +urlParams.get("size");
}


startSettings.definedOpacity = 0.005;
if (urlParams.has("opacity")) {
	startSettings.definedOpacity = +urlParams.get("opacity");
}


startSettings.edgeColorProperty = 0.005;
if (urlParams.has("edgeColorProperty")) {
	startSettings.edgeColorProperty = +urlParams.get("edgeColorProperty");
}

startSettings.edgeWidthProperty = -1;
if (urlParams.has("edgeWidthProperty")) {
	startSettings.edgeWidthProperty = +urlParams.get("edgeWidthProperty");
}


startSettings.edgeFilterProperty = -1;
if (urlParams.has("edgeFilterProperty")) {
	startSettings.edgeFilterProperty = +urlParams.get("edgeFilterProperty");
}

startSettings.startZoomLevel = null;
if (urlParams.has("zoom")) {
	startSettings.startZoomLevel = +urlParams.get("zoom");
}

startSettings.darkBackground = false;
startSettings.backgroundColor = [0.0, 0.0, 0.0, 0.0]

// if (urlParams.has("dark")) {
// 	startSettings.darkBackground = true;
// 	startSettings.backgroundColor = [0.0, 0.0, 0.0, 1.0]
// }

startSettings.densityEnabled = false;
if (urlParams.has("density")) {
	startSettings.densityEnabled = true;
}

startSettings.densityScale = 0.1;
if (urlParams.has("densityScale")) {
	startSettings.densityScale = +urlParams.get("densityScale");
}

startSettings.topographic = false;
if (urlParams.has("topographic")) {
	startSettings.topographic = true;
}


startSettings.additiveBlending = false;
if (urlParams.has("additive") && startSettings.darkBackground) {
	startSettings.additiveBlending = true;
}

startSettings.colorProperty = "year";
if (urlParams.has("colorProperty")) {
	startSettings.colorProperty = urlParams.get("colorProperty");
}

startSettings.edgeColorProperty = "year";
if (urlParams.has("edgeColorProperty")) {
	startSettings.edgeColorProperty = urlParams.get("edgeColorProperty");
}


startSettings.densityProperty = "Uniform";
if (urlParams.has("densityProperty")) {
	startSettings.densityProperty = urlParams.get("densityProperty");
}

startSettings.vsDensityProperty = "None";
if (urlParams.has("vsDensityProperty")) {
	startSettings.vsDensityProperty = urlParams.get("vsDensityProperty");
}

startSettings.shallNormalizeVsDensity = false;
if (urlParams.has("shallNormalizeVsDensity")) {
	startSettings.vsDensityNormalize = urlParams.get("shallNormalizeVsDensity");
}


let visualizeNetwork = async (networkData, settings = startSettings) => {
	
	// apply projection to networkData.nodes[].Position

	const nodes = Object.values(networkData.nodes);
	if (nodes.length > 0) {
		// networkData.nodes is a object with node IDs as keys
		console.log(nodes);
		const scale = 1.0/originalHeight*1000*0.701;
		const tx = originalWidth / 2;
		const ty = -originalHeight / 2;
		nodes.forEach(node => {
			if (node.Position && node.Position.length === 2) {
				let projected = globeProjection([node.Position[0], node.Position[1]]);
				node.Position = [(projected[0]-tx)*scale, (-projected[1]-ty)*scale];
			} else if (node.Position && node.Position.length === 3) {
				let projected = globeProjection([node.Position[1], node.Position[0]]);
				node.Position = [(projected[0]-tx)*scale, -(projected[1]-ty)*scale, node.Position[2]];
			}
		});
	}
	/*
	 * Defining default and initial parameters
	*/

	// Initial property used for coloring
	let colorProperty = settings.colorProperty;
	let edgeColorProperty = settings.edgeColorProperty;
	let edgeDefaultColor = [0.2, 0.2, 0.2, 1.0];
	let edgeDefaultSelectedColor = [0.95, 0.75, 0.1, 100000.0];

	// Default visual properties
	let defaultNodeScale = 1.0;
	let defaultNodeOpacity = 1.0;
	let defaultOutlineColor = [0.25, 0.25, 0.25, 1.0];
	// if (settings.darkBackground) {
	// 	defaultOutlineColor = [0.0, 0.0, 0.0, 1.0];
	// }

	
	let defaultOutlineWidthFactor = 3.0;

	let updateNodeSize = node => node._originalSize;

	let nodesOnScreen = [];
	let selectedOnScreen = new Map();

	let categoriesOnScreen = [];
	
	// shaded mode does not require any outline
	if (settings.shaded) {
		defaultOutlineWidthFactor = 0.0;
	}

	// Zoom level for the whole network
	let defaultZoomLevel = 1.0;
	let defaultZoomLevelBigNetworks = 0.35;

	// Zoom level for centered nodes
	let minCenteredNodeZoomLevel = 4.0;

	// Default node size and Edge Ooacity
	let currentGlobalNodeSizeScale = 1.0;
	let currentGlobalEdgeOpacityScale = 1.0;
	let currentBandwidth = 28.1;//35.0;
	let currentDensityWeight = 398.1071705534973;//2000.0;
	let chosenDensityProperty = settings.densityProperty;
	let chosenVsDensityProperty = settings.vsDensityProperty;
	let shallNormalizeVsDensity = settings.vsDensityNormalize;
	let densityDiverging = true;

	// Scale and Opacity of Highlighted nodes
	let highlightNodeScale = 1.5;
	let highlightNodeOpacityScale = 1e10;// as opaque as possible

	// Scale and Opacity of selected nodes
	let selectedNodeScale = 3.0;
	let selectedNodeOpacityScale = 1e10; // as opaque as possible
	let selectedOutlineColor = [0.9, 0.9, 0.0];

	let selectedNeighborNodeSizeScale = 2.0;
	let selectedNeighborNodeOpacityScale = 1.5;


	// Visual properties of non selected and non highlighted nodes
	let nonSelectedNodeOpacityScale = 1.0;
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
	let sequencialColormap = "interpolateAmber";
	let densityColormap = "interpolateOrRd";
	if (settings.darkBackground) {
		densityColormap = "interpolateInferno";
	}
	let densityDivergingColormap = "interpolatePrinsenvlag";
	if (settings.darkBackground) {
		densityDivergingColormap = "interpolateRedshift";
	}
	let categoricalColormap = "schemeCategory10";

	let edgeCategoricalColormap = "schemeCategory10";
	let edgeSequencialColormap = "interpolateAmber";

	let useCategoricalColormap = false;
	let useEdgeCategoricalColormap = false;





	const gpuTier = await getGPUTier();
	console.log(gpuTier);
	const isHighSpeed = !gpuTier.isMobile && gpuTier.tier > 2;


	let networkName = "Network";
	if (settings.networkName !== null) {
		networkName = settings.networkName;
	}
	// let networkData = xnet.convertXNET2JSON(xnetNetwork);
	let nodeCount = Object.keys(networkData.nodes).length;
	let bigNetwork = nodeCount > 100000;


	/*
	 * Initializing Helios
	*/
	let networkWeighted = false;
	if(networkData.edges.length>0){
		networkWeighted = "weight" in networkData.edges[0];
	}
	console.log(networkData.edges);
	let helios = new Helios({
		elementID: "netviz",
		// densityElementID: "densityRegion",
		density: settings.densityEnabled,
		densityScale: settings.densityScale,
		topographic: settings.topographic,
		nodes: networkData.nodes,
		edges: networkData.edges,
		use2D: settings.use2D,
		tracking: true,
		hyperbolic: settings.hyperbolic,
		// if network is weighted
		edgesWidthFromNodes: !networkWeighted,
		fastEdges: !settings.advancedEdges && bigNetwork,
		forceSupersample: isHighSpeed,
		autoStartLayout: false,
		backgroundLayer: true,
		webGLOptions: {
			alpha:true,
			// depth:true,
			// antialias:true,
			desynchronized:true,
			powerPreference:"high-performance",
			premultipliedAlpha:false,
		}
	});

	let ToBase64 = function (u8) {
		return btoa(String.fromCharCode.apply(null, u8));
	}

	let FromBase64 = function (str) {
		return atob(str).split('').map(function (c) { return c.charCodeAt(0); });
	}

	// console.log(JSON.parse(pako.inflate(FromBase64(ToBase64(pako.deflate(JSON.stringify(helios)))), { to: 'string' })))


	// .edgesColorsFromNodes(false)
	// .edgeColor((edgeIndex,fromNode,toNode)=>{
	// 	if (edges[edgeIndex].weight>5000){
	// 	   return [1,0,0,1]; //red
	// 	}else{
	// 	   return [0,0,1,1]; //blue
	// 	}
	// }).update();

	// Calculating node degree so that 

	for (let [key, node] of Object.entries(helios.network.nodes)) {
		let nodeDegree = node.edges.length;
		// check if nodes have property Size
		if (node.size) {
			node._originalSize = node.size;
		} else {
			node._originalSize = defaultNodeScale * (1.0 + Math.log10(nodeDegree + 1.0));
		}
	}

	let updateNodeSelectionStyle = (node) => {
		// Hovering
		if ((typeof node._highlighted === 'undefined')) {
			node._highlighted = false;
		}
		if ((typeof node._filtered === 'undefined')) {
			node._filtered = false;
		}
		// After double click
		if ((typeof node._selected === 'undefined')) {
			node._selected = false;
		}
		// After double click
		if ((typeof node._selectedNeighbor === 'undefined')) {
			node._selectedNeighbor = false;
		}

		let nodeSize = node._originalSize;
		let nodeOutlineWidth = defaultOutlineWidthFactor;
		let nodeOpacity = defaultNodeOpacity;

		if (node._selected) {
			nodeSize *= selectedNodeScale;
			nodeOpacity *= selectedNodeOpacityScale;
			node.outlineColor = selectedOutlineColor;
			nodeOutlineWidth *= selectedNodeScale;
			// set edge color to black

		} else if (node._selectedNeighbor) {
			nodeSize *= selectedNeighborNodeSizeScale;
			nodeOpacity *= selectedNeighborNodeOpacityScale;
			node.outlineColor = defaultOutlineColor;
			nodeOutlineWidth *= selectedNeighborNodeSizeScale;
		} else {
			node.outlineColor = defaultOutlineColor;
		}

		if (node._highlighted) {
			nodeSize *= highlightNodeScale;
			nodeOpacity *= highlightNodeOpacityScale;
			nodeOutlineWidth *= highlightNodeScale;
		}

		if (node._filtered) {
			nodeSize *= 0.25;
			nodeOpacity *= 1.0;
			nodeOutlineWidth *= 0.0;
		}


		node.size = nodeSize;
		node.opacity = nodeOpacity;
		node.outlineWidth = nodeOutlineWidth;
	};

	let nodesHighlight = (nodes, shallHighlight, shallUpdate = true) => {

		nodes.forEach(node => {
			node._highlighted = shallHighlight;
			updateNodeSelectionStyle(node);
		});
		

		if (onHighlightChangeColorsEnabled) {
			if ((nodes?.length) && shallHighlight) {
				updateNodeSelectionOrHighlightedColors(true);
			} else {
				updateNodeSelectionOrHighlightedColors();
			}
		}

		if (shallUpdate) {
			helios.update();
			helios.render();
		}
		edgesHighlightUpdate();
		updateHighlightedList();
	};

	helios.pickeableEdges([]);

	let behaviorFilter = new BehaviorFilter(helios);


	let edgesHighlightUpdate = ()=>{
		// let updatedEdgeIDs = new Set();
		// helios.network.indexedNodes.forEach(node => {
		// 	if(node._highlighted || node._selected){
		// 		node.edges.forEach(edgeIndex => updatedEdgeIDs.add(edgeIndex));
		// 	}
		// });
		helios.edgeColor((edgeIndex, fromNode, toNode) => {
			if(fromNode._highlighted || fromNode._selected || toNode._highlighted || toNode._selected){
				return edgeDefaultSelectedColor;
			}else{
				return edgeDefaultColor;
			}
		});
	};
	let nodesSelect = (nodes, shallSelect, shallUpdate = true) => {
		nodes.forEach(node => {
			node._selected = shallSelect;
			node._selectedNeighbor = shallSelect;
			node.neighbors.forEach(neighNode => {
				neighNode._selectedNeighbor = shallSelect;
				updateNodeSelectionStyle(neighNode);
			});
			updateNodeSelectionStyle(node);
		});
		
		

		if ((nodes?.length) && shallSelect) {
			updateNodeSelectionGlobalStyle(true);
			if (onSelectionChangeColorsEnabled) {
				updateNodeSelectionOrHighlightedColors(true);
			}
		} else {
			updateNodeSelectionGlobalStyle();
			if (onSelectionChangeColorsEnabled) {
				updateNodeSelectionOrHighlightedColors();
			}
		}
		edgesHighlightUpdate();
		updateHighlightedList();
		if (shallUpdate) {
			helios.update();
			helios.render();
		}
	};

	let centerOnNodes = (nodes) => {
		if (!nodes || nodes.length > 0) {
			if (helios.zoomFactor() < minCenteredNodeZoomLevel) {
				helios.zoomFactor(minCenteredNodeZoomLevel, 500);
			}
			// resetting node selection
			nodesSelect(helios.centeredNodes(), false, false);
			// set selection
			nodesSelect(nodes, true, false);
			helios.centerOnNodes(nodes, 500);
			let pickableSet = new Set();
			nodes.forEach(node => {
				helios.pickeableEdges(node.edges);
			});
			helios.update();
			helios.render();

			selectedOnScreen = new Map(nodes.map(node => [node.index, 1.0]));
			// get neighbors and add them to the selection
			
			let neighbors2Weight = {};
			
			nodes.forEach(node => {
				node.neighbors.forEach(neighNode => {
					selectedOnScreen.set(neighNode.index, 0.75);
				});
			});


			updateLabelsInScreen();
		} else { // Reset
			nodesSelect(helios.centeredNodes(), false, false);
			helios.zoomFactor(defaultZoomLevel, 500);
			helios.centerOnNodes([], 500);
			helios.pickeableEdges([]);
			helios.update();
			helios.render();
			selectedOnScreen = new Map();
			updateLabelsInScreen();
		}
	}

	let getLabelStyleColorAndOutline = (color) => {
		let colorRGB = d3rgb(color[0] * 255, color[1] * 255, color[2] * 255);
		let colorHSL = d3hsl(colorRGB);
		let outlineWidth;
		let outlineColor;
		let textColor;

		if (colorHSL.l > 0.33) {
			textColor = colorRGB.formatRgb();
			outlineColor = "rgba(5,5,5,1.0)";
			outlineWidth = 1.15;
		} else {
			textColor = colorRGB.formatRgb();
			outlineColor = "rgba(250,250,250,1.0)";
			outlineWidth = 1.15;
		}
		return { fill: textColor, stroke: outlineColor, strokeWidth: outlineWidth };
	}

	let stylizeLabel = (element, color) => {
		let colorResult = getLabelStyleColorAndOutline(color);
		let outlineColor = colorResult.stroke;
		let outlineWidth = colorResult.strokeWidth;
		element.style.color = colorResult.fill;
		element.style["text-shadow"] = `-${outlineWidth}px -${outlineWidth}px 1.0px ${outlineColor}, ${outlineWidth}px -${outlineWidth}px 1.0px ${outlineColor}, -${outlineWidth}px ${outlineWidth}px 1.0px ${outlineColor}, ${outlineWidth}px ${outlineWidth}px 1.0px ${outlineColor}`;
	}

	let stylizeTooltip = (label, color, x, y, isnew) => {
		if (label) {
			// tooltipElement.style.left = x + "px";
			// tooltipElement.style.top = y + "px";
			if (typeof x !== 'undefined' && typeof y !== 'undefined') {
				tooltipElement.group.style.transform = `translate(${x+2}px, ${y-25}px)`;
				// tooltipElement.setAttribute('x', x);
				// tooltipElement.setAttribute('y', y);
			}

			if (isnew) {
				// tooltipElement.style.display = "block";
				let styleData = getLabelStyleColorAndOutline(color);
				// tooltipElement.fillText.setAttribute("fill", styleData.fill);
				// tooltipElement.outlineText.setAttribute("stroke", styleData.stroke);
				tooltipElement.fillText.setAttribute("fill", "rgba(255,255,255,1.0)");
				tooltipElement.outlineText.setAttribute("stroke", "rgba(5,5,5,1.0)");
				tooltipElement.outlineText.setAttribute("stroke-width", styleData.strokeWidth * 3.0);
				tooltipElement.group.setAttribute("visibility", "visible");
			}
			tooltipElement.fillText.textContent = label;
			tooltipElement.outlineText.textContent = label;
			// set text of the SVG element
			// if label is too long, it will split it into multiple lines
			let maxLabelLength = 30;
			let labelLines = [];
			if (label.length > maxLabelLength) {
				let words = label.split(" ");
				let line = "";
				words.forEach(word => {
					if (line.length + word.length > maxLabelLength) {
						labelLines.push(line);
						line = "";
					}
					line += word + " ";
				});
				labelLines.push(line);
			} else {
				labelLines.push(label);
			}
			tooltipElement.fillText.innerHTML = "";
			tooltipElement.outlineText.innerHTML = "";

			labelLines.forEach(line => {
				let textElement = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
				textElement.textContent = line;
				textElement.setAttribute("x", 0);
				textElement.setAttribute("dy", "1.2em");
				tooltipElement.fillText.appendChild(textElement);
				tooltipElement.outlineText.appendChild(textElement.cloneNode(true));
			});

		} else {
			tooltipElement.group.setAttribute("visibility", "hidden");
		}
	}

	let showTooltipForNode = (node, x, y, isNew) => {
		if (node) {
			let label = node.Label ?? node.Title ?? node.ID;
			stylizeTooltip(label, node.color, x, y, isNew);
			// nodesHighlight([node],true);
		} else {
			stylizeTooltip(null);
		}
	}

	let showTooltipForEdge = (edge, x, y, isNew) => {
		if (edge) {
			let fromLabel = edge.source.Label ?? edge.source.Title ?? edge.source.ID;
			let toLabel = edge.target.Label ?? edge.target.Title ?? edge.target.ID;
			let label = fromLabel + " - " + toLabel;
			// project nodes
			let projectedNodes = helios.getProjectedPositions([edge.source, edge.target]);
				// if projectedNode[2] is negative, the node is behind the camera
				// if (projectedNode[2] < -1 && !helios._use2D) {
				// 	return null;
				// }
			// console.log(projectedNodes);
			stylizeTooltip(label, edge.source.color, x, y, isNew);
			// nodesHighlight([edge.source,edge.target],true);
		} else {
			stylizeTooltip(null);
		}
	}


	let updateNodeSelectionGlobalStyle = (hasSelection) => {
		// hasSelection not set 
		if (typeof hasSelection === 'undefined') {
			hasSelection = helios.network.indexedNodes.some(node => node._selected);
		}
		if (hasSelection) {
			helios.nodesGlobalOpacityScale(nonSelectedNodeOpacityScale);
			helios.nodesGlobalSizeScale(nonSelectedNodeSizeScale * currentGlobalNodeSizeScale);
			// helios.edgesGlobalWidthScale(nonSelectedNodeSizeScale * currentGlobalNodeSizeScale);
			helios.nodesGlobalOutlineWidthScale(nonSelectedNodeSizeScale * currentGlobalNodeSizeScale);
			helios.edgesGlobalOpacityScale(currentGlobalEdgeOpacityScale * nonSelectedNodeOpacityScale);
		} else {
			helios.nodesGlobalOpacityScale(defaultNodeOpacity);
			helios.nodesGlobalSizeScale(currentGlobalNodeSizeScale);
			// helios.edgesGlobalWidthScale(currentGlobalNodeSizeScale);
			helios.nodesGlobalOutlineWidthScale(currentGlobalNodeSizeScale);
			helios.edgesGlobalOpacityScale(currentGlobalEdgeOpacityScale);
			
		}
	}

	let updateNodeSelectionOrHighlightedColors = (hasSelection) => {
		// hasSelection not set 
		if (typeof hasSelection === 'undefined') {
			hasSelection = helios.network.indexedNodes.some(node => node._selected || node._highlighted || node._selectedNeighbor);
		}
		if (hasSelection) {
			helios.nodeColor(node => {
				// console.log(""+[color.r,color.g,color.b])
				if (node._selected || node._highlighted || node._selectedNeighbor) {
					return node._originalColor;
				} else {
					return settings.darkBackground ? node._darkerColor : node._brighterColor;
				}
			});
		} else {
			helios.nodeColor(node => {
				return node._originalColor;
			});
		}
	}




	let logK = Math.log10(helios.network.indexedEdges.length / helios.network.indexedNodes.length);
	let logN = Math.log10(helios.network.indexedNodes.length);
	let logDensity = Math.log10(2.0 * helios.network.indexedEdges.length / helios.network.indexedNodes.length / (helios.network.indexedNodes.length - 1.0));

	// let estimatedZoom = Math.pow(10,1.3400+0.2144*logK+-0.3623*logN+0.0000*logDensity)
	// let estimatedOpacity = Math.pow(10,1.8854+-0.6344*logK+-0.4964*logN+0.0000*logDensity)
	// // estimatedSize = Math.pow(10,-0.4027+-0.0007*logK+0.0335*logN+0.0000*logDensity)
	// let logZoom =  Math.log10(estimatedZoom);
	// let estimatedSize = Math.pow(10,0.6432+0.1667*logK+-0.2493*logN+-0.7805*logZoom+0.0000*logDensity)

	let estimatedZoom = Math.pow(10, 1.2601 + 0.2488 * logK + -0.3631 * logN + 0.0000 * logDensity)
	let estimatedOpacity = Math.pow(10, 1.9968 + -0.6822 * logK + -0.4954 * logN + 0.0000 * logDensity)

	// Not using estimated zoom
	if (!bigNetwork) {
		estimatedZoom = defaultZoomLevel;
	} else {
		estimatedZoom = defaultZoomLevelBigNetworks;
	}

	let logZoom = Math.log10(estimatedZoom);
	// let estimatedSize = Math.pow(10,-0.2833+-0.0520*logK+0.0347*logN+0.0000*logDensity)

	let estimatedSize = Math.pow(10, 0.8744 + 0.1766 * logK + -0.2989 * logN + -0.9187 * logZoom + 0.0000 * logDensity) * 0.75;

	// estimatedZoom = Math.pow(10,1.2771+0.2415*logK+-0.3629*logN+0.0000*logDensity)
	// estimatedOpacity = Math.pow(10,1.8780+-0.6312*logK+-0.4965*logN+0.0000*logDensity)
	// estimatedSize = Math.pow(10,-0.3259+-0.0337*logK+0.0343*logN+0.0000*logDensity)
	// estimatedSize3 = Math.pow(10,0.7583+0.1713*logK+-0.2738*logN+-0.8489*logZoom+0.0000*logDensity)

	if (settings.definedSize) {
		currentGlobalNodeSizeScale = settings.definedSize;
	} else {
		currentGlobalNodeSizeScale = estimatedSize;
	}

	helios.network.indexedEdges.length

	if (settings.definedOpacity) {
		currentGlobalEdgeOpacityScale = settings.definedOpacity;
	} else {
		currentGlobalEdgeOpacityScale = estimatedOpacity;
	}

	defaultZoomLevel = estimatedZoom;

	helios.onNodeHoverStart((node, event) => {
		showTooltipForNode(node, event?.clientX, event?.clientY, true);
		nodesHighlight([node], true);
		// console.log(`Start: ${node.ID}`);
	});

	helios.onNodeHoverMove((node, event) => {
		showTooltipForNode(node, event?.clientX, event?.clientY, false);
	});

	helios.onNodeHoverEnd((node, event) => {
		if (node) {
			nodesHighlight([node], false);
		}
		showTooltipForNode(null);
		// console.log(`Hover ended: ${node.ID}`);
	});

	helios.onNodeClick((node, event) => {
		if (node) {
			console.log(`Clicked: ${node.Label??node.ID}`);
		} else {
			console.log(`Clicked on background`);
		}
	});

	helios.onNodeDoubleClick((node, event) => {
		if (node) {
			console.log(`Double Clicked: ${node.Label??node.ID}`);
			centerOnNodes([node]);

			// Special function for dealing with MAG/Openalex Citation networks
			if ("mag id" in node) {
				window.open(`https://explore.openalex.org/works/W${node["mag id"]}`, "helios_mag");
			}
		} else {
			console.log(`Double clicked on background`);
			centerOnNodes([]); //Reset centers

		}
	});

	helios.onEdgeHoverStart((edge, event) => {
		showTooltipForEdge(edge, event?.clientX, event?.clientY, true);
		if (edge) {
			// Only the non selected endpoints are highlighted
			nodesHighlight([edge.source, edge.target].filter(node => !node._selected), true);
		}
	});

	helios.onEdgeHoverMove((edge, event) => {
		showTooltipForEdge(edge, event?.clientX, event?.clientY, false);
	});

	helios.onEdgeHoverEnd((edge, event) => {
		if (edge) {
			// Only the non selected endpoints were highlighted
			nodesHighlight([edge.source, edge.target].filter(node => !node._selected), false);
		}
		showTooltipForEdge(null);
	});

	helios.onEdgeClick((edge, event) => {
		console.log("Edge clicked");
		console.log(edge);
		if (edge){
			console.log(`Clicked: ${edge.source.Label??edge.source.ID} - ${edge.target.Label??edge.source.ID}`);
		}
	});

	helios.backgroundColor(settings.backgroundColor) // set background color
		// .nodeColor(node=>{ // Example on how to define colors
		// 	let color = d3rgb(colorScale(node.ID));
		// 	// console.log(""+[color.r,color.g,color.b])
		// 	return [color.r/255,color.g/255,color.b/255];
		// })
		// .nodeSize(node=>{ // Example on how to define size
		// 	return Math.random()*5+1.0;
		// })
		.edgesGlobalOpacityScale(1.0) // set edges intensity);
		.nodeSize(updateNodeSize)
		.nodeOutlineWidth(defaultOutlineWidthFactor)
		.nodeOutlineColor([0.0, 0.0, 0.0, 1.0]) // set outline color
		.additiveBlending(settings.additiveBlending)
		.shadedNodes(settings.shaded)
		.semanticZoomExponent(0.65);
	
	// console.log(helios.nodeOutlineColor(0));


	let buttonInformation = {

		"Load": {
			name: "⬆︎",
			mapColor: "#B1C3B6",
			color: "#008758",
			tooltipText: "Load network",
			action: (selection, d, event) => {
				// Open file upload dialog from scratch
				let fileInput = document.createElement("input");
				// Append fileInput to body (not visible) and then remove it
				fileInput.style.display = "none";
				document.body.appendChild(fileInput);
				fileInput.type = "file";
				fileInput.accept = ".gml,.xnet,.gexf,.json";
				fileInput.onchange = event => {
					let fileObject = event.target.files[0];
					console.log("Loading file");
					loadNetworkFromUploadedFile(fileObject);
					document.body.removeChild(fileInput);
				}
				fileInput.click();
				
			},
			extra: selection => {

			}
		},
		"Save": {
			name: "⬇︎",
			mapColor: "#B1C3B6",
			color: "#A72850",
			tooltipText: "Download network",
			action: (selection, d, event) => {
				if(event?.shiftKey){
					let pos = helios.network.positions;
					let postext = "" ;
					for(let i=0;i<pos.length;i+=3){
						postext+= `${pos[i]} ${pos[i+1]} ${pos[i+2]}\n`;
					}
					downloadText(networkName+"_positions.txt",postext);
				}else{
					let gmlString = saveGML(helios.network);
					downloadText(networkName + "_helios.gml", gmlString);
				}
			},
			extra: selection => {

			}
		},
		"Export": {
			name: "SVG",
			mapColor: "#B1C3B6",
			color: "#777722",
			tooltipText: "Export image",
			action: (selection, d, event) => {
				// if shift is pressed save as png
				let extension = ".svg";
				if (event?.shiftKey) {
					extension = ".png";
				}
				// if option is pressed save with transparent background
				let backgroundColor = settings.backgroundColor;
				if (event?.altKey) {
					backgroundColor = [settings.backgroundColor[0], settings.backgroundColor[1], settings.backgroundColor[2], 0.0];
				}
				let dpr = window.devicePixelRatio || 1;
				helios.exportFigure(networkName + extension, {
					scale: dpr*2.0,
					// width: 2048,
					// height: 2048,
					supersampleFactor: 2.0,
					backgroundColor: backgroundColor,
				});
			},
			extra: selection => {

			}
		},
		"Size": {
			name: "Size",
			mapColor: "#AFB9C9",
			color: "#1E6099",
			tooltipText: "Set node sizes",
			action: null,
			extra: selection => {
				selection.append("input")
					.attr("type", "range")
					.attr("min", "-1")
					.attr("max", "1")
					.attr("step", "0.1")
					.attr("value", "" + Math.log10(currentGlobalNodeSizeScale))
					.attr("id", "nodeSizeSlider")
					.classed("slider", true)
					.style("min-width", "30px")
					.on("input", (event, d) => {
						currentGlobalNodeSizeScale = Math.pow(10, parseFloat(d3Select("#nodeSizeSlider").property("value")));
						// helios.nodesGlobalSizeScale(currentGlobalNodeSizeScale);
						// helios.nodesGlobalOutlineWidthScale(currentGlobalNodeSizeScale);
						updateNodeSelectionGlobalStyle();
						// helios.update();
						helios.render();
						event.stopPropagation();
					});
			}
		},
		"Color": {
			name: "Color",
			mapColor: "#AFB9C9",
			color: "#1E6099",
			tooltipText: "Set color property and colormap",
			action: null,
			extra: selection => {
				selection.append("select")
					.attr("id", "colorSelector")
					.classed("selector", true)
					.style("min-width", "30px")
					.on("change", (event, d) => {
						updateColorSelection();
					})
					.selectAll("option")
					.data(Object.entries(helios.network.indexedNodes[0]))
					.enter()
					.filter(d => !d[0].startsWith("_"))
					.filter(d => !ignoredProperties.has(d[0]) && !d[0].startsWith("_"))
					.append("option")
					.attr("value", d => d[0])
					.property("selected", d => d[0] == colorProperty)
					.text(d => d[0]);

				selection.append("select")
					.attr("id", "colormapSelector")
					.classed("selector", true)
					.style("min-width", "30px");
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
			tooltipText: "Set edges opacity",
			action: null,
			extra: selection => {
				console.log("CALLED");
				selection.append("input")
					.attr("type", "range")
					.attr("min", "0")
					.attr("max", "1")
					.attr("step", (1 / 255) + "")
					.attr("value", "" + (Math.round(255 * currentGlobalEdgeOpacityScale) / 255))
					.attr("id", "edgeOpacitySlider")
					.classed("slider", true)
					.style("min-width", "30px")
					.on("input", (event, d) => {
						// helios.edgesOpacity(Math.pow(10,parseFloat(d3Select("#edgeOpacitySlider").property("value"))));
						currentGlobalEdgeOpacityScale = parseFloat(d3Select("#edgeOpacitySlider").property("value"))

						helios.edgesGlobalOpacityScale(currentGlobalEdgeOpacityScale);
						// helios.update();
						helios.render();
						event.stopPropagation();
					});
			}
		},
		// "E Color": {
		// 	name: "E Color",
		// 	mapColor: "#B1A58C",
		// 	color: "#903C22",
		// 	tooltipText: "Set edge color property and colormap",
		// 	action: null,
		// 	extra: selection => {
		// 		selection.append("select")
		// 			.attr("id", "edgeColorSelector")
		// 			.classed("selector", true)
		// 			.style("min-width", "40px")
		// 			.on("change", (event, d) => {
		// 				// updateColorSelection();
		// 			})
		// 			.selectAll("option")
		// 			.data(Object.entries(helios.network.edgeAttributes))
		// 			.enter()
		// 			.filter(d => !d[0].startsWith("_"))
		// 			.filter(d => !ignoredProperties.has(d[0]) && !d[0].startsWith("_"))
		// 			.append("option")
		// 			.attr("value", d => d[0])
		// 			.property("selected", d => d[0] == colorProperty)
		// 			.text(d => d[0]);

		// 		selection.append("select")
		// 			.attr("id", "edgeColormapSelector")
		// 			.classed("selector", true)
		// 			.style("min-width", "30px");
		// 		// .classed("slider",true)
		// 		// 
		// 		// .on("input", (event,d)=>{
		// 		// 	helios.edgesOpacity(Math.pow(10,parseFloat(d3Select("#edgeOpacitySlider").property("value"))));
		// 		// 	helios.update();
		// 		// 	helios.render();
		// 		// 	event.stopPropagation();
		// 		// });
		// 	}
		// },
		"Filter": {
			name: "",
			mapColor: "#B1A58C",
			color: "rgba(0,0,0,0.0)",
			tooltipText: "",
			action: null,
			extra: selection => {
				selection
					.style("width", "100%")
					.style("height", "100px")
					.style("padding", "55px");
				let panelComponent = selection.append("div")
					.attr("id", "yearSelector")
					.classed("selectorContainer", true)
					.style("width", "100%")
				
				// get edge properties
				let edgeProperties = helios.network.edgeAttributes["year"].map(year => +year);

				let minRangeYear = d3Min(edgeProperties);
				let maxRangeYear = d3Max(edgeProperties);

				let intFormater = { to: d => ("" + Math.round(d)) };
				let timeSlider = noUiSlider.create(panelComponent.node(), {
					start: [minRangeYear, maxRangeYear],
					step: 1,
					behaviour: "tap-drag",
					tooltips: [intFormater, intFormater],
					connect: true,
					range: {
						'min': minRangeYear,
						'max': maxRangeYear
					},
					pips: {
						mode: 'steps',
						density: 2,
						// skip odd years
						// filter: (value, type) => {
						// 	if (type === 0) {
						// 		return value % 2 === 0;
						// 	}
						// 	return true;
						// },
						format: intFormater
					}
				});
				
				timeSlider.on('update', async (values) => {
					let minYear = parseInt(values[0]);
					let maxYear = parseInt(values[1]);
					// filter out nodes 
					helios.network.indexedNodes.forEach(node => {
						if (node.year) {
							node._filtered = node.year < minYear || node.year > maxYear;
						} else {
							node._filtered = true; // if no year property, filter out
						}
						updateNodeSelectionStyle(node);
					});
					
					helios.update();
					helios.render();
				});
			}
		},
		"Density": {
			name: "Density",
			mapColor: "#A1A152",
			color: "#505005",
			tooltipText: "Set the density property",
			action: null,
			extra: selection => {
				selection.append("select")
					.attr("id", "densitySelector")
					.classed("selector", true)
					.style("min-width", "30px")
					.on("change", (event, d) => {
						// updateColorSelection();
						updateDensityAttributes();
						event.stopPropagation();
					})
					.selectAll("option")
					.data(Object.entries(helios.network.indexedNodes[0]).concat([["Uniform", 0], ["Degree", 0]]))
					.enter()
					.filter(d => !d[0].startsWith("_"))
					.filter(d => !ignoredProperties.has(d[0]) && !d[0].startsWith("_"))
					.filter(d => d[0] != "index")
					.filter(d => Number.isFinite(d[1]))
					.append("option")
					.attr("value", d => d[0])
					.property("selected", d => d[0] == chosenDensityProperty)
					.text(d => d[0]);
			}
		},
		"vs": {
			name: "vs",
			mapColor: "#A1A152",
			color: "#505005",
			tooltipText: "Set a second density property to compare with the first one.",
			action: null,
			extra: selection => {
				selection.append("select")
					.attr("id", "vsDensitySelector")
					.classed("selector", true)
					.style("min-width", "30px")
					.on("change", (event, d) => {
						// updateColorSelection();
						updateDensityAttributes();
						event.stopPropagation();
					})
					.selectAll("option")
					.data(Object.entries(helios.network.indexedNodes[0]).concat([["Uniform", 0], ["Degree", 0], ["None", 0]]))
					.enter()
					.filter(d => !d[0].startsWith("_"))
					.filter(d => !ignoredProperties.has(d[0]) && !d[0].startsWith("_"))
					.filter(d => d[0] != "index")
					.filter(d => Number.isFinite(d[1]))
					.append("option")
					.attr("value", d => d[0])
					.property("selected", d => d[0] == chosenVsDensityProperty)
					.text(d => d[0]);
			}
		},
		"Norm.": {
			name: "Norm.",
			mapColor: "#A1A152",
			color: "#505005",
			tooltipText: "Use the checkbox for independent normalization.",
			action: null,
			extra: selection => {
				selection.append("input")
					.attr("type", "checkbox")
					.attr("id", "vsNormCheckbox")
					//set activate according to densityNormalizeV
					.property("checked", shallNormalizeVsDensity)
					.on("change", (event, d) => {
						shallNormalizeVsDensity = d3Select("#vsNormCheckbox").property("checked");
						updateDensityAttributes();
						event.stopPropagation();
					}
					);



			}
		},
		"Bandwidth": {
			name: "Bandwidth",
			mapColor: "#A1A152",
			color: "#505005",
			action: null,
			tooltipText: "Controls the bandwidth of the density map",
			extra: selection => {
				selection.append("input")
					.attr("type", "range")
					.attr("min", "-0.9")
					.attr("max", "2.5")
					.attr("step", 0.05 + "")
					.attr("value", "" + Math.log10(currentBandwidth))
					.attr("id", "densityBandwidthSlider")
					.classed("slider", true)
					.style("min-width", "60px")
					.on("input", (event, d) => {
						// helios.edgesOpacity(Math.pow(10,parseFloat(d3Select("#edgeOpacitySlider").property("value"))));
						currentBandwidth = Math.pow(10, parseFloat(d3Select("#densityBandwidthSlider").property("value")))
						helios.densityMap?.setBandwidth(currentBandwidth);
						// helios.update();
						// helios.redrawDensityMap();
						helios.redraw();
						event.stopPropagation();
					});
				helios.densityMap?.setBandwidth(currentBandwidth);
			}
		},
		"Weight": {
			name: "Weight",
			mapColor: "#A1A152",
			color: "#505005",
			tooltipText: "Controls the intensity of the density map",
			action: null,
			extra: selection => {
				selection.append("input")
					.attr("type", "range")
					.attr("min", "0")
					.attr("max", "10")
					.attr("step", 0.1 + "")
					.attr("value", "" + Math.log10(currentDensityWeight))
					.attr("id", "densityWeightSlider")
					.classed("slider", true)
					.style("min-width", "60px")
					.on("input", (event, d) => {
						// helios.edgesOpacity(Math.pow(10,parseFloat(d3Select("#edgeOpacitySlider").property("value"))));
						currentDensityWeight = Math.pow(10, parseFloat(d3Select("#densityWeightSlider").property("value")))
						helios.densityMap?.setKernelWeightScale(currentDensityWeight);
						// helios.update();
						// helios.redrawDensityMap();
						helios.redraw();
						event.stopPropagation();
					});
				helios.densityMap?.setKernelWeightScale(currentDensityWeight);
			}
		},
		"Map": {
			name: "Map",
			mapColor: "#A1A152",
			color: "#505005",
			action: null,
			tooltipText: "Colormap for the density map",
			extra: selection => {
				selection.append("select")
					.attr("id", "densityColormapSelector")
					.classed("selector", true)
					.style("min-width", "30px")
					.on("change", (event, d) => {
						updateDensityColors();
					});
				updateDensityColorsList();
			}
		},
	}


	// this.buttonsPanelElement = document.createElement("div");
	// this.buttonsPanelElement.classList.add("buttonsPanel");
	// this.inputPanelElement = document.createElement("div");
	// this.inputPanelElement.classList.add("inputPanel");
	// this.sliderElement = document.createElement("div");
	// this.sliderElement.classList.add("timeSlider");

	// this.element.appendChild(this.buttonsPanelElement);
	// this.buttonsPanelElement.appendChild(this.inputPanelElement);
	// this.inputPanelElement.appendChild(this.sliderElement);



	let backgroundLayer = d3Select(helios.backgroundLayer)
	// get body height and width
	// new g element 
	const groupMap = backgroundLayer.append("g")
		.attr("id", "mapLayer")
		// .attr("transform", `translate(${-originalSVGWidth / 2},${-originalSVGHeight / 2})`)
		.attr("vector-effect", "non-scaling-stroke");

	
	let firstDraw = true;
	helios.onDraw(() => {
		if (firstDraw) {

			groupMap.append("path")
			.datum({ type: "Sphere" })
			.attr("d", path)
			.attr("fill", "white")
			.attr("stroke", "none")
			.attr("stroke-width", 0);
			groupMap.selectAll("path.countries")
				.data(countries)
				.enter().append("path")
				.attr("class", "countries")
				.attr("d", path)
				.attr("fill", "#C1AFA8")
				.attr("stroke-linejoin", "round")
				.attr("stroke-linecap", "round")
				.attr("vector-effect", "non-scaling-stroke")
				.attr("stroke", "white");
				
			firstDraw = false;
		}
		let cameraDisplacementFactor = helios.cameraDisplacementFactor();
		let svgWidth = helios.backgroundLayer.clientWidth;
		let svgHeight = helios.backgroundLayer.clientHeight;
		let xoffset=helios._camera.translatePosition[0];
		let yoffset=helios._camera.translatePosition[1];
		let x = (helios._camera.panX+xoffset)/cameraDisplacementFactor+svgWidth / 2;
		let y = -(helios._camera.panY+yoffset)/cameraDisplacementFactor+svgHeight / 2;
		let zoomFactor = helios._camera.zoomFactor;
		// console.log(`x: ${x}, y: ${y}, zoomFactor: ${zoomFactor}`);
		// x += svgWidth / 2;
		// y -= svgHeight / 2;
		// console.log(`helios._camera.panX: ${helios._camera.panX}, helios._camera.panY: ${helios._camera.panY}, helios._camera.zoomFactor: ${helios._camera.zoomFactor}`);
		// console.log(`svgWidth: ${svgWidth}, svgHeight: ${svgHeight}`);
		// console.log(`helios.svgLayer.clientWidth: ${helios.svgLayer.clientWidth}, helios.svgLayer.clientHeight: ${helios.svgLayer.clientHeight}`);
		groupMap
			.attr("transform", `translate(${x},${y}) scale(${zoomFactor*svgHeight/originalHeight}) translate(${-originalWidth / 2},${-originalHeight / 2})`);
	});


	// let legendView = d3Select(helios.overlay).append("svg")
	// 	.attr("id", "legendView")
	// 	.style("position", "absolute")
	// 	.style("left", "10px")
	// 	.style("top", "10px")
	// 	.style("pointer-events", "none")

	// let densityLegendView = d3Select(helios.overlay).append("svg")
	// 	.style("position", "absolute")
	// 	.attr("id", "densityLegendView")
	// 	.style("right", "10px")
	// 	.style("bottom", "25px")
	// 	.style("top", "auto")
	// 	.style("left", "auto")
	// 	.style("pointer-events", "none")

	// now using this.svgLayer instead of overlay and svg creation
	// svgLayer is already an svg, need to use g instead


	let tooltipElement = {
		group: helios.svgLayer.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'g')),
		text: ""
		// .attr("id", "tooltips")
	};

	tooltipElement.group.setAttribute("id", "tooltips");
	tooltipElement.outlineText = tooltipElement.group.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'text'))
	tooltipElement.fillText = tooltipElement.group.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'text'))

	
	let legendView = d3Select(helios.svgLayer).append("g")
		.attr("transform", "translate(10,10)")
		.attr("id", "legendView");

	let densityLegendView = d3Select(helios.svgLayer).append("g")
		.attr("id", "densityLegendView");

	let updateDensityLegendsPosition = () => {
		densityLegendView.attr("transform", "translate(" + (helios.svgLayer.clientWidth - 170) + " " + (helios.svgLayer.clientHeight - 75) + ")")
	}

	// Update densityLegendView position with observer when svgLayer is resized
	let densityLegendViewObserver = new ResizeObserver(entries => {
		if(helios.isReady()){
			for (let entry of entries) {
				updateDensityLegendsPosition();
			}
		}
	});

	updateDensityLegendsPosition();
	densityLegendViewObserver.observe(helios.canvasElement);
	helios.onCleanup(() => {
		densityLegendViewObserver.disconnect();
	})
	
	let holdCategories = [];
	let updateCategoryFilter = (categories) => {
		let allNodes = helios.network.indexedNodes;
		// nodesFiltered(allNodes, true, false);
		if (categories?.length > 0) {
			let setCategories = new Set(categories);
			// nodesFiltered(allNodes.filter(d => setCategories.has(d[colorProperty])), false, false);
			behaviorFilter.setFilter("categoryFilter", node => !setCategories.has(node[colorProperty]), categories);
		} else {
			// nodesFiltered(allNodes.filter(d => d[colorProperty]!="None"), false, false);
			behaviorFilter.setFilter("categoryFilter", node => node[colorProperty] == "None", categories);
		}
		behaviorFilter.applyFilters();
		let updatedNodes = behaviorFilter.updatedNodes();
		updatedNodes.forEach(node => {
			updateNodeSelectionStyle(node);
		});
		updateDensityAttributes(false);
		helios.update();
		helios.render();
	}

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
			.attr("fill", d => property2color.get(d))
			// Add event on hover to highlight the nodes with that propety value
			.on("mouseenter", function (event, d) {
				if (holdCategories.length == 0) {
					d3Select(this).attr("stroke", "#555555");
					d3Select(this).attr("stroke-width", "4px");
					updateCategoryFilter([d]);
				}
			})
			.on("mouseleave", function (event, d) {
				if (holdCategories.length == 0) {
					d3Select(this).attr("stroke", null);
					d3Select(this).attr("stroke-width", null);
					updateCategoryFilter([]);
				}
			}).on("click", function (event, d) {
				// if d not in holdCategories add it, otherwise remove it
				if (holdCategories.indexOf(d) == -1) {
					holdCategories.push(d);
					d3Select(this).attr("stroke", "#555555");
					d3Select(this).attr("stroke-width", "4px");
					updateCategoryFilter(holdCategories);
				} else {
					holdCategories.splice(holdCategories.indexOf(d), 1);
					d3Select(this).attr("stroke", null);
					d3Select(this).attr("stroke-width", null);
					updateCategoryFilter(holdCategories);
				}
			})
			// Force mouse events even if pointer-events is none
			.style("pointer-events", "all");


		legendItems.select("g")
			.attr("transform", (d) => (`translate(${35},${15 / 2})`))
			.select("text")
			.style("font-size", "12px")
			.append('tspan')
			.attr("dy", "0.33em")
			.text(d => d)
			.attr("fill", settings.darkBackground ? "white" : "black")
			.each(wrapText)
	}

	let updateLegendSequencial = (scale, title) => {
		legendView.selectAll("*").remove();
		if (settings.legendsEnabled) {
			d3Legend(scale, {
				svg: legendView,
				title: title,
				orientation: "vertical",
				themeColors: [settings.darkBackground ? "white" : "black", settings.darkBackground ? "black" : "white"]
			});
		}
	}

	let updateDensityDiverging = (useDiverging) => {
		if (useDiverging != densityDiverging) {
			densityDiverging = useDiverging;
			//set densityColormapSelector to the right colormap
			let newColormap = densityDiverging ? densityDivergingColormap : densityColormap;
			d3Select("#densityColormapSelector").property("value", newColormap);
			updateDensityColors();
		}

	}

	densityDiverging = false;
	let updateLegendDensity = () => {
		let scheme = allColors[densityColormap];
		if (densityDiverging) {
			scheme = allColors[densityDivergingColormap];
		}
		let densityColorScale = d3ScaleSequential(scheme).domain([0, 1])

		if (densityDiverging) {
			densityColorScale = d3ScaleDiverging(scheme).domain([-1, 0, 1])
		}
		densityLegendView.selectAll("*").remove();
		let densityLabelRanges = ["-", "0", "+"];
		let title = chosenDensityProperty;
		if (chosenVsDensityProperty != "None") {
			densityLabelRanges = [chosenDensityProperty, 0, chosenVsDensityProperty];
			title = "";
		}
		if (settings.legendsEnabled) {
			d3Legend(densityColorScale, {
				svg: densityLegendView,
				title: title,
				titleAlignment: "end",
				width: 150,
				// ticks:[0,1],
				tickValues: densityDiverging ? [-1, 0, 1] : [0, 1],
				tickFormat: densityDiverging ? d => densityLabelRanges[d + 1] : d => ["0", "+"][d],
				themeColors: [settings.darkBackground ? "white" : "black", settings.darkBackground ? "black" : "white"]
			});
		}
	}


	function updateCategoricalColors() {
		let propertyArray = [];

		console.log(helios.network.nodes);
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

			node._originalColor = [color.r / 255, color.g / 255, color.b / 255];
			node._darkerColor = [darkerColor.r / 255, darkerColor.g / 255, darkerColor.b / 255];
			node._brighterColor = [brighterColor.r / 255, brighterColor.g / 255, brighterColor.b / 255];
		}
		updateNodeSelectionOrHighlightedColors();
		helios.update();
		helios.render();
		updateLegendCategorical(categoricalMap)
	}

	

	function updateSequencialColors() {
		// updateLegendCategorical(new Map());
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

			node._originalColor = [color.r / 255, color.g / 255, color.b / 255];
			node._darkerColor = [darkerColor.r / 255, darkerColor.g / 255, darkerColor.b / 255];
			node._brighterColor = [brighterColor.r / 255, brighterColor.g / 255, brighterColor.b / 255];
		}

		updateLegendSequencial(cScale, colorProperty);
		updateNodeSelectionOrHighlightedColors();
		helios.update();
		helios.render();
	}

	


	function updateSequencialEdgeColors() {
		if(edgeColorProperty == "None"){
			console.warn("No color property selected for edges, cannot update categorical edge colors.");
			helios.edgesColorsFromNodes(true);
			helios.update();
			helios.render();
			return;
		}
		// let propertyArray = helios.network.edgeAttributes[edgeColorProperty];

		// let maxValue = -Infinity;
		// let minValue = Infinity;
		// for (let propertyValue of propertyArray) {
		// 	if (!Number.isFinite(propertyValue)) {
		// 		continue; // skip non-finite values
		// 	}
		// 	maxValue = Math.max(maxValue, propertyValue);
		// 	minValue = Math.min(minValue, propertyValue);
		// }

		// let scheme = allColors[edgeSequencialColormap];
		// let cScale = d3ScaleSequential(scheme)
		// 	.domain([minValue, maxValue]);

		helios.edgesColorsFromNodes(false);
		helios.edgeColor([edgeDefaultColor,edgeDefaultColor]);
		// helios.edgeColor((edgeIndex) => {
		// 	let propertyValue = propertyArray[edgeIndex];
		// 	if (!Number.isFinite(propertyValue)) {
		// 		return [0, 0, 0]; // return black for non-finite values
		// 	}
		// 	let color = d3rgb(cScale(propertyValue));
		// 	return [color.r / 255, color.g / 255, color.b / 255];
		// });
		
		// updateLegendSequencial(cScale, colorProperty);
		// updateNodeSelectionOrHighlightedColors();
		
		helios.update();
		helios.render();
	}


	function updateCategoricalEdgeColors() {
		if(edgeColorProperty == "None"){
			console.warn("No color property selected for edges, cannot update categorical edge colors.");
			helios.edgesColorsFromNodes(true);
			helios.update();
			helios.render();
			return;
		}
		let propertyArray = helios.network.edgeAttributes[colorProperty];

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
		
		// for (let [key, node] of Object.entries(helios.network.nodes)) {
		// 	let color = d3rgb(property2color.get(node[colorProperty]));
		// 	let darkerColor = color.darker(nonSelectedDarkerColorFactor);
		// 	let brighterColor = color.brighter(nonSelectedBrighterColorFactor);

		// 	node._originalColor = [color.r / 255, color.g / 255, color.b / 255];
		// 	node._darkerColor = [darkerColor.r / 255, darkerColor.g / 255, darkerColor.b / 255];
		// 	node._brighterColor = [brighterColor.r / 255, brighterColor.g / 255, brighterColor.b / 255];
		// }
		// updateNodeSelectionOrHighlightedColors();
		helios.edgeColor( (edgeIndex) => {
			let color = d3rgb(property2color.get(propertyArray[edgeIndex]));
			return [color.r / 255, color.g / 255, color.b / 255];
		});
		
		helios.edgesColorsFromNodes(false);
		helios.update();
		helios.render();
		// updateLegendCategorical(categoricalMap)
	}



	function updateDensityColorsList() {
		let colormapSelector = d3Select("#densityColormapSelector")
			.classed("selector", true)
			.style("min-width", "30px")
			.on("change", (event, d) => {
				updateDensityColors();
			})
			.selectAll("option")
			.data(Object.entries(allColors).filter(d => d[0].startsWith("interpolate")))
			.join("option")
			.attr("value", d => d[0])
			.property("selected", d => d[0] == (densityDiverging ? densityDivergingColormap : densityColormap))
			.text(d => d[0].replace("interpolate", "").replace("scheme", ""));
	}

	function updateDensityColors() {
		if (densityDiverging) {
			densityDivergingColormap = d3Select("#densityColormapSelector").property("value");
		} else {
			densityColormap = d3Select("#densityColormapSelector").property("value");
		}
		let colormapName = densityDiverging ? densityDivergingColormap : densityColormap;

		console.log(colormapName)
		let scheme = allColors[colormapName];
		helios.densityMap.setColormap(scheme);

		updateLegendDensity();
		helios.render();
	}

	let updateColormapSelection = () => {
		holdCategories = [];
		updateCategoryFilter([]);
		if (useCategoricalColormap) {
			categoricalColormap = d3Select("#colormapSelector").property("value");
			updateCategoricalColors();
		} else {
			sequencialColormap = d3Select("#colormapSelector").property("value");
			updateSequencialColors();
		}
	}
	let updateEdgeColormapSelection = () => {
		if (useEdgeCategoricalColormap) {
			// categoricalColormap = d3Select("#edgeColormapSelector").property("value");
			updateCategoricalEdgeColors();
		} else {
			// edgeSequencialColormap = d3Select("#edgeColormapSelector").property("value");
			updateSequencialEdgeColors();
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
			.style("min-width", "30px")
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
		updateEdgeColormapSelection();
	}

	function updateDensityAttributes(shallRedraw = true) {
		if (helios.densityMap) {
			let maxValue = -Infinity;
			let minValue = Infinity;
			chosenDensityProperty = d3Select("#densitySelector").property("value");
			chosenVsDensityProperty = d3Select("#vsDensitySelector").property("value");

			for (let index = 0; index < helios.densityWeights.length; index++) {
				helios.densityWeights[index] = 0.0;
			}

			let propertySignals = [];

			if (chosenVsDensityProperty == "None") {
				propertySignals = [
					[chosenDensityProperty, 1]
				];
			} else {
				propertySignals = [
					[chosenVsDensityProperty, 1],
					[chosenDensityProperty, -1]
				];
			}
			for (let [property, signal] of propertySignals) {
				if (property == "Uniform") {
					for (let index = 0; index < helios.densityWeights.length; index++) {
						helios.densityWeights[index] += signal;
					}
				} else if (property == "Degree") {
					for (let [key, node] of Object.entries(helios.network.nodes)) {
						let value = node["edges"].length;
						helios.densityWeights[node.index] += signal * value;
						// maxValue = Math.max(maxValue, value);
						// minValue = Math.min(minValue, value);
					}
				} else {
					for (let [key, node] of Object.entries(helios.network.nodes)) {
						let value = node[property];
						helios.densityWeights[node.index] += signal * value;
						// maxValue = Math.max(maxValue, value);
						// minValue = Math.min(minValue, value);
					}
				}
			}
			// if all values in helios.densityWeights are positive
			// then we can use the density map as a filter
			// otherwise we can only use it as a color map
			let totalWeight = 0;
			let totalPositive = 0;
			let totalNegative = 0;
			for (let [key, node] of Object.entries(helios.network.nodes)) {
				let value = node._filtered ? 0.0 : 1.0;
				helios.densityWeights[node.index] *= value;
				let densityWeight = helios.densityWeights[node.index];
				totalWeight += Math.abs(densityWeight);
				if (densityWeight < 0) {
					totalNegative += densityWeight;
				} else {
					totalPositive += densityWeight;
				}
			}
			if (totalWeight > 0 && totalNegative == 0) {
				for (let [key, node] of Object.entries(helios.network.nodes)) {
					helios.densityWeights[node.index] /= totalWeight;
				}
				helios?.densityMap?.divergingColormap(false);
				updateDensityDiverging(false);
			} else {
				let totalPositiveMax = Math.max(Math.abs(totalNegative), Math.abs(totalPositive));
				let totalNegativeMax = Math.max(Math.abs(totalNegative), Math.abs(totalPositive));
				if (shallNormalizeVsDensity) {
					totalPositiveMax = Math.max(Math.abs(totalPositive));
					totalNegativeMax = Math.max(Math.abs(totalNegative));
				}
				for (let [key, node] of Object.entries(helios.network.nodes)) {
					let densityWeight = helios.densityWeights[node.index];
					if (densityWeight < 0 && totalNegative < 0) {
						helios.densityWeights[node.index] = densityWeight / totalNegativeMax;
					} else if (densityWeight > 0 && totalPositive > 0) {
						helios.densityWeights[node.index] = densityWeight / totalPositiveMax;
					} else {
						helios.densityWeights[node.index] /= totalWeight;
					}
				}
				helios?.densityMap?.divergingColormap(true);
				updateDensityDiverging(true);
			}

			updateLegendDensity();
			helios.updateDensityMap();
			// helios.redrawDensityMap();
			if (shallRedraw) {
				helios.redraw();
			}
		}
	}


	// let buttonOrder = ["Load","Save","Export", "Size", "Color"];
	let buttonOrder = ["Save","Export", "Size", "Color"];
	if (helios.network.indexedEdges.length > 0) {
		buttonOrder.push("Edges");
		buttonOrder.push("Filter");
	}
	if (settings.densityEnabled) {
		// Add these ["Density","Bandwidth","Weight","Map"] to the buttonOrder
		buttonOrder = buttonOrder.concat(["Density", "vs", "Norm.", "Bandwidth", "Weight", "Map"]);
	}

	// Clear the selection menu if needed
	d3Select(helios.overlay).select("div.selectionMenu").remove();
	d3Select(helios.overlay).append("div").classed("selectionMenu",true)
		.selectAll("span.menuEntry")
		// pointer events !important so that the mouseover event is not blocked
		.style("pointer-events", "none")
		.data(buttonOrder)
		.enter()
		.append("span")
		.classed("menuEntry", true)
		.classed("tooltip", d => buttonInformation[d].tooltipText)
		.style("--color", d => buttonInformation[d].color)
		.text(d => buttonInformation[d].name)
		.each(function (d) {
			d3Select(this).call(buttonInformation[d].extra);
		})
		.on('mouseover', function (d, i) {
			let tooltipText = d3Select(this).select('.tooltiptext');
			let rect = this.getBoundingClientRect();
	
			tooltipText.classed('tooltiptop', false);
			tooltipText.classed('tooltipbottom', false);
	
			if (rect.top < window.innerHeight / 2) {
				tooltipText.classed('tooltipbottom', true);
			} else {
				tooltipText.classed('tooltiptop', true);
			}
			tooltipText.classed('leftAlign', false);
			tooltipText.classed('rightAlign', false);
			// If in the first 60px set classed leftAlign
			// If in the last 60px set classed rightAlign
			let averageXPosition = (rect.left+rect.right)/2;
			if (averageXPosition < 60) {
				tooltipText.classed('leftAlign', true);
			}
			if (averageXPosition > window.innerWidth-60) {
				tooltipText.classed('rightAlign', true);
			}
		});

	d3Select(helios.overlay).select("div.selectionMenu")
		.selectAll("span.menuEntry")
		.filter(d => buttonInformation[d].action != null)
		.on("click", (event, d) => {
			if (buttonInformation[d].action) {
				buttonInformation[d].action(d3Select(this), d, event);
			}
		})
		.classed("hasAction", true);

	d3Select(helios.overlay).select("div.selectionMenu")
		.selectAll("span.menuEntry")
		.filter(d => buttonInformation[d].tooltipText)
		.append("span")
		.classed("tooltiptext", true)
		.classed("tooltiptop", true)
		.text(d => buttonInformation[d].tooltipText);

	d3Select(helios.overlay).select("div.selectionMenu")
		.selectAll("span.menuEntry")


	
	// create a div located at the bottom left of the overlay for showing a list of selected nodes
	let highlightedList = d3Select(helios.overlay).append("div")
		.attr("id", "highlightedList")
		.style("position", "absolute")
		.style("left", "10px")
		.style("bottom", "100px")
		.style("max-height", "200px")
		.style("max-width", "300px")
		// min width to 100px min height to 200px
		.style("min-width", "100px")
		.style("min-height", "200px")
		.style("pointer-events", "auto")
		.style("overflow", "auto")
		.style("background-color", settings.darkBackground ? "rgba(50,50,50,0.8)" : "rgba(255,255,255,0.8)")
		.style("padding", "5px")
		.style("border-radius", "5px")
		.style("font-size", "12px")
		.style("display", "none")
		// shadow
		.style("box-shadow", "0px 0px 10px rgba(0,0,0,0.5)");

	let updateHighlightedList = () => {
		let selectedNodes = helios.network.indexedNodes.filter(node => node._selected);
		// get list of neighbors of selected nodes
		let highlightedNodes = [];
		let connectionWeights = [];
		selectedNodes.forEach(node => {
			node.edges.forEach(edgeIndex => {
				let nodeFromIndex = helios.network.indexedEdges[edgeIndex*2];
				let nodeToIndex = helios.network.indexedEdges[edgeIndex*2+1];
				let connectionWeight = helios.network.edgeAttributes["weight_temp"][edgeIndex] ? helios.network.edgeAttributes["weight_temp"][edgeIndex] : 1.0;
				let neighborNode = (nodeFromIndex === node.index) ? helios.network.indexedNodes[nodeToIndex] : helios.network.indexedNodes[nodeFromIndex];
				if (!neighborNode._selected) {
					highlightedNodes.push(neighborNode);
					connectionWeights.push(connectionWeight);
				}
			});
		});
		
		// let highlightedNodes = helios.network.indexedNodes.filter(node => node._selectedNeighbor);
		// merge duplicates
		let highlightedMap = new Map();
		highlightedNodes.forEach((node, i) => {
			if (highlightedMap.has(node.index)) {
				highlightedMap.get(node.index).weight += connectionWeights[i];
			}
			else {
				highlightedMap.set(node.index, {node: node, weight: connectionWeights[i]});
			}
		});
		highlightedNodes = Array.from(highlightedMap.values()).map(d => d.node);
		connectionWeights = Array.from(highlightedMap.values()).map(d => d.weight);
		// sort highlighted nodes by total connection weight
		let highlightedNodesWithWeights = highlightedNodes.map((node, i) => ({node: node, weight: connectionWeights[i]}));
		highlightedNodesWithWeights.sort((a, b) => b.weight - a.weight);
		highlightedNodes = highlightedNodesWithWeights.map(d => d.node);

		let label2weight = new Map();
		highlightedNodesWithWeights.forEach(d => {
			let label = d.node.Label ?? d.node.title ?? d.node.ID;
			label2weight.set(label, d.weight);
		});

		// ... keep everything above unchanged

		if (highlightedNodes.length == 0) {
		highlightedList.style("display", "none");
		return;
		} else {
		highlightedList.style("display", "block");
		}

		// Build table once (thead with tooltip) and keep a tbody for row updates
		let table = highlightedList.select("table.highlightedTable");
		if (table.empty()) {
		table = highlightedList.append("table")
			.attr("class", "highlightedTable")
			.style("width", "100%")
			.style("border-collapse", "collapse")
			.style("font-size", "12px");

		const thead = table.append("thead");
		const trh = thead.append("tr").style("border-bottom", "1px solid #ddd");

		trh.append("th")
			.text("Name")
			.style("text-align", "left")
			.style("padding", "6px 4px");

		const weightHeader = trh.append("th")
			.style("text-align", "right")
			.style("padding", "6px 4px");

		// Header label + tooltip "?"
		weightHeader.append("span").text("Weight ");
		weightHeader.append("span")
			.text("?")
			.attr("title", "Normalized collaboration count where each paper contributes 1 divided by the number of institutions on that paper.")
			.style("display", "inline-block")
			.style("width", "16px")
			.style("height", "16px")
			.style("line-height", "16px")
			.style("text-align", "center")
			.style("border-radius", "50%")
			.style("border", "1px solid #aaa")
			.style("cursor", "help");

		table.append("tbody");
		}

		const tbody = table.select("tbody");

		// Data join for rows (one per highlighted node)
		const rows = tbody.selectAll("tr.highlightedRow")
		.data(highlightedNodesWithWeights, d => d.node.index)
		.join(
			enter => {
			const r = enter.append("tr")
				.attr("class", "highlightedRow")
				.style("border-bottom", "1px solid #f0f0f0")
				.style("cursor", "pointer");

			// Name cell (with a small color dot)
			const nameCell = r.append("td")
				.style("padding", "6px 4px")
				.style("vertical-align", "middle");

			nameCell.append("span")
				.attr("class", "nodeColorDot")
				.style("display", "inline-block")
				.style("width", "10px")
				.style("height", "10px")
				.style("border-radius", "50%")
				.style("margin-right", "6px")
				.style("transform", "translateY(1px)");

			nameCell.append("span").attr("class", "nodeLabelText");

			// Weight cell (right-aligned)
			r.append("td")
				.attr("class", "nodeWeightCell")
				.style("padding", "6px 4px")
				.style("text-align", "right")
				.style("white-space", "nowrap");

			// Click to center
			r.on("click", (event, d) => {
				centerOnNodes([d.node]);
			});

			return r;
			},
			update => update,
			exit => exit.remove()
		);

		// Per-row update
		rows.each(function (d) {
		const row = d3Select(this);
		const node = d.node;
		const label = node.Label ?? node.title ?? node.ID;
		const weight = d.weight ?? 0;

		// Label + color dot
		const color = d3rgb(node.color);
		row.select(".nodeColorDot")
			.style("background-color", `rgb(${color.r}, ${color.g}, ${color.b})`);
		row.select(".nodeLabelText").text(label);

		// Weight cell text with tooltip on the number as well
		row.select(".nodeWeightCell")
			.text(weight.toFixed(2))
			.attr("title", "Normalized collaboration count where each paper contributes 1 divided by the number of institutions on that paper.");
		});
	};


	if (settings.startZoomLevel) {
		defaultZoomLevel = settings.startZoomLevel;
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
	// helios.edgesGlobalWidthScale(currentGlobalNodeSizeScale);
	helios.nodesGlobalOutlineWidthScale(currentGlobalNodeSizeScale);
	helios.edgesGlobalOpacityScale(currentGlobalEdgeOpacityScale);


	if (settings.densityEnabled) {
		helios.densityMap.setColormap(allColors[densityDiverging ? densityDivergingColormap : densityColormap]);

	}




	let minScreenProportion = 0.0005;
	let visibleScreenProportion = 0.001;
	let maxLabels = 100;
	let screenLabelsSmoothness = 2.0;


	let categoricalLabelsGroup = d3Select(helios.svgLayer).append("g")
		.attr("id", "categoricalLabelsGroup")
		.style("text-anchor", "middle")
		// .style("dominant-baseline", "central")
		.style("font-size", 12 + "px")
		.attr("stroke-linejoin", "round")
		.style("font-family", "HelveticaNeue,Roboto,Helvetica,Arial,sans-serif")
		.attr("pointer-events", "none");

	let labelsGroup = d3Select(helios.svgLayer).append("g")
		.attr("id", "labelsGroup")
		.style("text-anchor", "middle")
		// .style("dominant-baseline", "central")
		.style("font-size", 12 + "px")
		.attr("stroke-linejoin", "round")
		.style("font-family", "HelveticaNeue,Roboto,Helvetica,Arial,sans-serif")
		.attr("pointer-events", "none");



	let interpolateProportion = (proportion) => {
		let a = (proportion - minScreenProportion) / (visibleScreenProportion - minScreenProportion);
		return Math.max(0, Math.min(1, a));
	}

	let updateLabelsInScreen = () => {
		// Create and update labels for nodes in screen
		// console.log({ nodesOnScreen, selectedOnScreen });
		let selectedOnScreenArray = Array.from(selectedOnScreen).map(([nodeIndex, weight]) => [nodeIndex, weight]);
		let allNodesOnScreen = nodesOnScreen.concat(selectedOnScreenArray);
		if(selectedOnScreenArray.length>0){
			allNodesOnScreen = selectedOnScreenArray;
		}
		labelsGroup.selectAll(".label")
			.data(allNodesOnScreen, nodeIDsProportion => +nodeIDsProportion[0])
			.join(
				enter => {
					let labelGroup = enter.append("g")
						.classed("label", true);

					let nodeLabel = (nodeIDsProportion) => {
						let node = helios.network.indexedNodes[+nodeIDsProportion[0]];
						return node.Label ?? node.title ?? node.ID;
					}

					labelGroup.append("text").classed("labelOutline", true).attr("dy", "0.25em")
						.attr("stroke-linejoin", "round").text(nodeLabel);

					labelGroup.append("text").classed("labelFill", true).attr("dy", "0.25em")
						.text(nodeLabel);
					
					labelGroup.attr("transform", nodeIDsProportion => {
						let projectedNode = helios.getProjectedPositions([+nodeIDsProportion[0]]);
						// if projectedNode[2] is negative, the node is behind the camera
						if (projectedNode[2] < -1 && !helios._use2D) {
							return null;
						}
						let newScale = interpolateProportion(nodeIDsProportion[1]);
						if(selectedOnScreen.has(+nodeIDsProportion[0])){
							newScale = selectedOnScreen.get(+nodeIDsProportion[0]);
							
						}
						return `translate(${projectedNode[0]} ${projectedNode[1]}) scale(${newScale},${newScale})`;
						// return `translate(${projectedNode[0]} ${projectedNode[1]}) `;
					});
					return labelGroup;
				},
				update => {
					return update;
				},
				exit => exit.remove(),
			)
			.style("opacity", nodeIDsProportion => {
				return interpolateProportion(nodeIDsProportion[1]);
			})
			.each(function (nodeIDsProportion) {
				let node = helios.network.indexedNodes[+nodeIDsProportion[0]];
				// stylizeLabel(this, node.color);
				let labelSelect = d3Select(this);
				let labelFillNode = labelSelect.select(".labelFill").node();
				let labelOutlineNode = labelSelect.select(".labelOutline").node();

				// let outlineColor = "rgba(5,5,5,1.0)";
				let styleData = getLabelStyleColorAndOutline(node.color);
				labelFillNode.style.fill = styleData.fill;
				labelOutlineNode.style.stroke = styleData.stroke;
				labelFillNode.style.fill = "rgba(255,255,255,1.0)";
				labelOutlineNode.style.stroke = "rgba(5,5,5,1.0)";
				labelOutlineNode.style.strokeWidth = styleData.strokeWidth * 3.0;
			})//animate
			// .transition()
			// .duration(33)
			.attr("transform", nodeIDsProportion => {
				let projectedNode = helios.getProjectedPositions([+nodeIDsProportion[0]]);
				// if projectedNode[2] is negative, the node is behind the camera
				if (projectedNode[2] < -1 && !helios._use2D) {
					return null;
				}
				let newScale = interpolateProportion(nodeIDsProportion[1]);
				
				if(selectedOnScreen.has(+nodeIDsProportion[0])){
					newScale = selectedOnScreen.get(+nodeIDsProportion[0]);
				}
				return `translate(${projectedNode[0]} ${projectedNode[1]}) scale(${newScale},${newScale})`;
			});
		// find the element with highest proportion and bring it to front
		// Only bring to front if not already last child
		let maxProportion = -1;
		let maxElement = null;
		labelsGroup.selectAll(".label").each(function (nodeIDsProportion) {
			if (nodeIDsProportion[1] > maxProportion) {
				maxProportion = nodeIDsProportion[1];
				maxElement = this;
			}
		});
		// Move the element with the highest proportion to the front (last child)
		// This ensures it is rendered above others in SVG stacking order
		if (maxElement && maxElement !== maxElement.parentNode.lastChild) {
			maxElement.parentNode.appendChild(maxElement);
		}
		
	}
	// make it available to window
	window.selectNodesOnScreen = filter=>{
		nodesOnScreen = helios.network.indexedNodes.filter(filter).map(node=>[
			node.index,
			1.0]);
		updateLabelsInScreen();
	}

	window.trackLabels = (filter, options) => {
		helios.untrackAttribute("indexTracker");
		nodesOnScreen = helios.network.indexedNodes.filter(filter).map(node=>[
			node.index,
			1.0]);
		updateLabelsInScreen();
		helios.scheduler.schedule({
			name: "9.0.labelsUpdate",
			callback: (elapsedTime, task) => {
				updateLabelsInScreen();
			},
			delay: 0,
			repeatInterval: 20,
			repeat: true,
			synchronized: true,
			immediateUpdates: false,
			redraw: false,
			updateNodesGeometry: false,
			updateEdgesGeometry: false,
		});
	}



	let updateCategoricalGroups = () => {
		// Create and update labels for nodes in screen
		categoricalLabelsGroup.selectAll(".categoryLabel")
			.data(categoriesOnScreen, nodeIDsProportion => +nodeIDsProportion[0])
			.join(
				enter => {
					let labelGroup = enter.append("g")
						.classed("categoryLabel", true);
					labelGroup.append("text").classed("labelOutline", true).attr("dy", "0.25em");
					labelGroup.append("text").classed("labelFill", true).attr("dy", "0.25em");
					return labelGroup;
				},
				update => {
					// stylizeLabel(update.node(),update);
					return update;
				},
				exit => exit.remove(),
			)
			// .style("opacity", nodeIDsProportion => {
			// 	return interpolateProportion(nodeIDsProportion[1]);
			// })

			.attr("transform", nodeIDsProportion => {
				let projectedNode = [nodeIDsProportion[2], nodeIDsProportion[3]]
				// if projectedNode[2] is negative, the node is behind the camera
				let newScale = 1.0;//interpolateProportion(nodeIDsProportion[1]);
				return `translate(${projectedNode[0]} ${projectedNode[1]}) scale(${newScale})`;
			})
			.each(function (nodeIDsProportion) {
				let category = nodeIDsProportion[0];
				// stylizeLabel(this, node.color);
				let labelSelect = d3Select(this);

				let labelFillNode = labelSelect.select(".labelFill").node();
				let labelOutlineNode = labelSelect.select(".labelOutline").node();
				// let styleData = getLabelStyleColorAndOutline(node.color);

				labelFillNode.style.fill = "black";
				labelOutlineNode.style.stroke = "white";
				labelOutlineNode.style.strokeWidth = 3.0;

				labelFillNode.textContent = category;
				labelOutlineNode.textContent = category;
			});

	}



	// let heliosUI = new HeliosUI(helios,{
	// 	collapsed:true,
	// });

	// window.heliosUI = heliosUI;

	helios.onReady(() => {
		helios.trackAttribute("indexTracker", "index", {
			minProportion: minScreenProportion,
			smoothness: screenLabelsSmoothness,
			maxLabels: maxLabels,
			onTrack: (indices, tracker) => {
				nodesOnScreen = indices;
				updateLabelsInScreen();
			}
		});
		
		// helios.trackAttribute("category", "cluster name", {
		// 	maxLabels: maxLabels,
		// 	calculateCentroid:true,
		// 	minProportion: 0.10,
		// 	smoothness: 0.01,
		// 	maxLabels: 5,
		// 	onTrack: (categoriesData, tracker) => {
		// 		// tracker.
		// 		categoriesOnScreen = categoriesData;
		// 		// console.log(categoriesData);
		// 		updateCategoricalGroups();
		// 	}
		// });

		// helios.scheduler.schedule({
		// 	name: "9.0.labelsUpdate",
		// 	callback: (elapsedTime, task) => {

		// 		nodesInScreen = helios.nodesInScreen(minScreenProportion, maxLabels, screenLabelsSmoothness);
		// 		updateLabelsInScreen();
		// 	},
		// 	delay: 0,
		// 	repeatInterval: 20,
		// 	repeat: true,
		// 	synchronized: true,
		// 	immediateUpdates: false,
		// 	redraw: false,
		// 	updateNodesGeometry: false,
		// 	updateEdgesGeometry: false,
		// });
		// helios.onDraw(() => {
		// 	nodesInScreen = helios.nodesInScreen(minScreenProportion, maxLabels, screenLabelsSmoothness);
		// 	updateLabelsInScreen()
		// });

		d3Select("#loadingPanel").style("display", "none");
		if (settings.searchEnabled) {
			d3Select(helios.overlay).select("div.filterPanel").remove();

			//   <div id="filterPanel" style="display:none" class="tooltip">
			//     <form autocomplete='off' action=''>
			// 	<input autocomplete='false' name='hidden' type='text' style='display:none;'>
			// 	<input class='searchSelector' placeholder='Search'>
			// 	<span class="tooltiptext tooltipbottom">Search in labels</span>
			//   </form>
			// </div>

			let searchPanelFormSelector = d3Select(helios.overlay).append("div")
			.classed("filterPanel",true)
			.classed("tooltip",true)
			.append("form")
			.attr("autocomplete","off")
			.attr("action","")

			
			searchPanelFormSelector.append("input")
			.attr("autocomplete","false")
			.attr("name","hidden")
			.attr("type","text")
			.style("display","none")

			searchPanelFormSelector.append("input")
			.classed("searchSelector",true)
			.attr("placeholder","Search")

			searchPanelFormSelector.append("span")
			.classed("tooltiptext",true)
			.classed("tooltipbottom",true)
			.text("Search in labels")
		}

		updateDensityAttributes(false);
		updateColorSelection();
	});



	let updateFilteredNodes = throttleLast(() => {
		let searchTerm = d3Select(helios.overlay).select("div.filterPanel").select(".searchSelector").property("value");
		let allNodes = helios.network.indexedNodes;
		// console.log("searching for " + searchTerm)
		// if query
		if (!searchTerm.startsWith("*")) {
			if (searchTerm.length > 0) {
				searchTerm = searchTerm.toLowerCase();
				// nodesFiltered(allNodes.filter(d => d.label.toLowerCase().includes(searchTerm)), false, false);
				behaviorFilter.setFilter("searchFilter", node => !node.Label.toLowerCase().includes(searchTerm));
			} else {
				// nodesFiltered(allNodes, false, false);
				behaviorFilter.removeFilter("searchFilter");
			}
		} else {
			let query = "node[*" + searchTerm.substring(1) + "]";
			let matched = jsonQuery(query, {
				data: { node: allNodes },
				allowRegexp: true
			});
			// console.log(matched);
			// nodesFiltered(matched.value, false, false);
			let matchedNodesSet = new Set(matched.value);
			behaviorFilter.setFilter("searchFilter", node => !matchedNodesSet.has(node));
		}
		behaviorFilter.applyFilters();
		let updatedNodes = behaviorFilter.updatedNodes();
		updatedNodes.forEach(node => {
			updateNodeSelectionStyle(node);
		});
		updateDensityAttributes(false);
		helios.update();
		helios.render();
	}, 250);

	d3Select(helios.overlay).select("div.filterPanel").select(".searchSelector").on("input", (event, d) => {
		updateFilteredNodes()
	})


	// Temporarily for debugging
	window.helios = helios;
	return helios;
}


/*
	* Initializing the network
*/
let currentHelios = null;
let networkName = startSettings.networkName;
// If extension is provided for networkName, it is removed and format is inferred if not defined
if (!startSettings.format) {
	if (networkName.endsWith(".xnet")) {
		startSettings.format = "xnet";
		networkName = networkName.substring(0, networkName.length - 5);
	} else if (networkName.endsWith(".gexf")) {
		startSettings.format = "gexf";
		networkName = networkName.substring(0, networkName.length - 5);
	} else if (networkName.endsWith(".gml")) {
		startSettings.format = "gml";
		networkName = networkName.substring(0, networkName.length - 4);
	} else if (networkName.endsWith(".json")) {
		startSettings.format = "json";
		networkName = networkName.substring(0, networkName.length - 5);
	} else {
		startSettings.format = "xnet";
	}
}

// Loading the network
let networkData;
if (startSettings.format === "xnet") {
	let xnetData = await xnet.loadXNETFile("networks/" + networkName + ".xnet");
	networkData = xnet.convertXNET2JSON(xnetData);
} else if (startSettings.format === "gexf") {
	let gexfData = await gexf.loadGEXFFile("networks/" + networkName + ".gexf");
	networkData = gexf.convertGEXF2JSON(gexfData);
} else if (startSettings.format === "gml") {
	let gmlData = await gml.loadGMLFile("networks/" + networkName + ".gml");
	// console.log(gmlData);
	// console.error("GML not supported yet");
	networkData = gmlData;
} else if (startSettings.format === "json") {
	networkData = await fetch("networks/" + networkName + ".json").then(response => response.json());
} else {
	console.error("Unknown network format: " + startSettings.format);
}

async function loadNetworkFromContents(fileContents,filenameWithoutExtension,fileExtension) {
	let networkData;
	if (fileExtension === "gml") {
		networkData = gml.loadGML(fileContents);
	} else if (fileExtension === "xnet") {
		let xnetData = xnet.loadXNET(fileContents);
		networkData = xnet.convertXNET2JSON(xnetData);
	} else if (fileExtension === "gexf") {
		let gexfData = gexf.loadGEXF(fileContents);
		networkData = gexf.convertGEXF2JSON(gexfData);
	} else if (fileExtension === "json") {
		networkData = JSON.parse(fileContents);
	}
	startSettings.networkName = filenameWithoutExtension;
	currentHelios = await visualizeNetwork(networkData, startSettings);

}

async function loadNetworkFromUploadedFile(fileObject){
	let fileName = fileObject.name;
	let fileExtension = fileName.split(".").pop().toLowerCase();
	if (fileExtension === "gml" || fileExtension === "xnet" || fileExtension === "gexf" || fileExtension === "json") {

		let filenameWithoutExtension = fileName.substring(0, fileName.length - fileExtension.length - 1);
		// load the file
		d3Select("#loadingPanel").style("display", null);
		currentHelios?.cleanup()
		let fileContents = await fileObject.text();
		loadNetworkFromContents(fileContents,filenameWithoutExtension,fileExtension).catch(error => {
			console.error(error);
			alert("Error loading network: " + error);
			d3Select("#loadingPanel").style("display", "none");

		})
	} else {
		//  Alert the user that the file format is not supported
		alert("File format not supported. Supported formats: gml, xnet, gexf, json");
		d3Select("#loadingPanel").style("display", "none");
	}
}

// make the DOM element ID:"netviz" respond to drag of files show panel centered with msg indicating that
// the file can be dragged and dropped there and gml, xnet, gexf, json are supported
// A msg is shown when dragging a file over the panel incading that the file can be dropped there
// You need to create all the elements and add them to netviz, and remove then after dropping or canceling
// the drag.

let netviz = document.getElementById("netviz");
netviz.addEventListener("dragenter", dragEnter, false);
netviz.addEventListener("dragleave", dragLeave, false);
netviz.addEventListener("dragover", dragOver, false);
netviz.addEventListener("drop", drop, false);

let dropMessageElement = document.createElement("div");
dropMessageElement.classList.add("dragdropmessage");
dropMessageElement.innerHTML = "<h1>Drop a network file here</h1><br/>Supported formats: gml, xnet, gexf, json";

function dragEnter(event) {
	netviz.appendChild(dropMessageElement);
	console.log("Enter");
	event.stopPropagation();
	event.preventDefault();
}

function dragLeave(event) {
	// remove message from netviz
	netviz.removeChild(dropMessageElement);
	console.log("Leave");
	event.stopPropagation();
	event.preventDefault();
}

function dragOver(event) {
	event.stopPropagation();
	event.preventDefault();
}


async function drop(event) {
	event.stopPropagation();
	event.preventDefault();
	console.log("Drop");

	// remove message from netviz

	// get the file
	
	let fileObject = event.dataTransfer.files[0];
	
	loadNetworkFromUploadedFile(fileObject);
	netviz.removeChild(dropMessageElement);
}

function saveGML(network){
	let nodes = [];
	let edges = [];

	let nodeIndex = 0;
	for (let node of network.indexedNodes){
		// filter any attribute starting with _ or named neighbors and edges
		let nodeData = {};
		let allPositions = helios.network.positions;
		for (let [key,value] of Object.entries(node)){
			if (!key.startsWith("_") && !ignoredProperties.has(key)){
				nodeData[key] = value;
			}
			let posx = allPositions[nodeIndex*3];
			let posy = allPositions[nodeIndex*3+1];
			let posz = allPositions[nodeIndex*3+2];
			nodeData.posx = posx;
			nodeData.posy = posy;
			nodeData.posz = posz;
		}

		nodeData.id = nodeIndex;
		if(nodeData.label === undefined){
			nodeData.label = nodeIndex+"";
		}
		nodes.push(nodeData);
		nodeIndex+=1;
	}
	// get edges from helios.network.indexedEdges which is a Int32Array
	// of source,target,source,target,source,target, etc.

	for (let i = 0; i < network.indexedEdges.length; i+=2){
		let source = network.indexedEdges[i];
		let target = network.indexedEdges[i+1];
		edges.push({source:source,target:target});
	}

	let gmlData = gml.GMLStringify({nodes:nodes,edges:edges},{
		nodeAttributes: Object.keys(nodes[0]),
	});

	return gmlData;


}

currentHelios = await visualizeNetwork(networkData, startSettings);




