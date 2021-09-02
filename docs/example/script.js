import { Helios, xnet } from "../../src/core/Helios"
import * as d3Chromatic from "d3-scale-chromatic"
import { scaleOrdinal as d3ScaleOrdinal, scaleSequential as d3ScaleSequential} from "d3-scale"
import { select as d3Select } from "d3-selection"
import { rgb as d3rgb } from "d3-color"



function sortByCount(anArray){
	let map = anArray.reduce((p, c)=>{
		p.set(c,(p.get(c) || 0) + 1);
		return p;
	}, new Map());

	let newArray = Array.from(map.keys()).sort((a, b)=>map.get(b)- map.get(a));
	return newArray;
}



// let networkNames = [
// 	"web-EPA",
// 	"Airports",
// 	"bio-dmela",
// 	"bio-yeast-protein-inter",
// 	"ca-Erdos992",
// 	"econ-orani678",
// 	"econ-poli-",
// 	"econ-poli",
// 	"Facebook_combined",
// 	"fb-pages-politician",
// 	"fb-pages-public-figure",
// 	"ia-fb-messages",
// 	"mammalia-voles-kcs-trapping",
// 	"OClinks_w",
// 	"power-eris1176",
// 	"road-euroroad",
// 	"RVOR",
// 	"soc-advogato",
// 	"socfb-nips-ego",
// 	"socfb-Oberlin44",
// 	"tech-routers-rf",
// 	"USairport_2010",
// ]
////
let networkName = "WS_10000_10_001";
// let networkName = "Simple"
// let networkName = "lynyrdskynyrd__freebird"
// let networkName = "Simple"
// let networkName = "latticeToroidalBC"
// let networkName = "net_Olivetti_cosine_k_5"
xnet.loadXNETFile(networkName + ".xnet").then(async network => {
	let colorProperty = "index";
	let sequencialColormap = "interpolateInferno";
	let categoricalColormap = "schemeCategory10";
	let useCategoricalColormap = false;
	let defaultOutline = 0.20;
	console.log(network)

	let nodeCount = network.nodesCount;

	let nodes = {};
	let edges = [];
	for (let index = 0; index < nodeCount; index++) {
		nodes["" + index] = {
			ID: "" + index,
			rand: ""+Math.round(Math.random()*10),
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

	let tooltipElement = document.getElementById("tooltip");

	console.log(Object.entries(d3Chromatic));
	let colorScale = d3ScaleOrdinal(d3Chromatic.schemeCategory10);
	let helios = new Helios({
		elementID: "netviz",
		nodes: nodes,
		edges: edges,
		use2D: false,
	})
		.onNodeHoverStart((node, event) => {
			if (event) {
				tooltipElement.style.left = event.pageX + "px";
				tooltipElement.style.top = event.pageY + "px";
			}
			if (node) {
				tooltipElement.style.display = "block";
				tooltipElement.style.color = d3rgb(node.color[0] * 255, node.color[1] * 255, node.color[2] * 255).darker(1).formatRgb();
				tooltipElement.textContent = node.ID;
				node.originalSize = node.size;
				node.size = 2.0 * node.originalSize;
				node.outlineWidth = 0.25 * node.originalSize;
				// helios.nodeSize(,node.ID);
				helios.update();
				helios.render();
			} else {
				tooltipElement.style.display = "none";
			}
			// console.log(`Start: ${node.ID}`);
		})
		.onNodeHoverMove((node, event) => {
			if (event) {
				tooltipElement.style.left = event.pageX + "px";
				tooltipElement.style.top = event.pageY + "px";
			}
			if (node) {
				// tooltipElement.style.display = "block";
				tooltipElement.textContent = node.ID;
			} else {
				tooltipElement.style.display = "none";
			}
			// console.log(`Move: ${node.ID}`);
		})
		.onNodeHoverEnd((node, event) => {
			if (event) {
				tooltipElement.style.left = event.pageX + "px";
				tooltipElement.style.top = event.pageY + "px";
			}
			if (node) {
				node.size = 1.0 * node.originalSize;
				node.outlineWidth = defaultOutline * node.originalSize;
				
				helios.update();
				helios.render();
			}
			tooltipElement.style.display = "none";

			// console.log(`End: ${node.ID}`);
		})
		.onNodeClick((node, event) => {
			// console.log(`Clicked: ${node.ID}`);
		})
		// .onLayoutStart(()=>console.log("Layout start"))
		// .onLayoutFinish(()=>console.log("Layout end"))
		.backgroundColor([1.0, 1.0, 1.0, 1.0]) // set background color
		// .nodeColor(node=>{ // Example on how to define colors
		// 	let color = d3rgb(colorScale(node.ID));
		// 	// console.log(""+[color.r,color.g,color.b])
		// 	return [color.r/255,color.g/255,color.b/255];
		// })
		// .nodeSize(node=>{ // Example on how to define size
		// 	return Math.random()*5+1.0;
		// })
		.edgesIntensity(1.0) // set edges intensity);
		.nodeOutlineWidth(node=>node.size*defaultOutline)
		// .nodeOutlineColor([1.0,0.0,0.0,1.0]);


	let buttonInformation = {
		"Export": {
			name: "Export",
			mapColor: "#B1C3B6",
			color: "#008758",
			action: selection => {
				console.log("Action!");
				let dpr = window.devicePixelRatio || 1;
				helios.exportFigure(networkName + ".png", {
					scale: 2.0,
					// width: 2048,
					// height: 2048,
					supersampleFactor: 2.0,
					backgroundColor: [1.0, 1.0, 1.0, 1.0],
				});
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
					.attr("value", "0")
					.attr("id", "nodeSizeSlider")
					.classed("slider", true)
					.style("min-width", "60px")
					.on("input", (event, d) => {
						helios.nodeSize(Math.pow(10, parseFloat(d3Select("#nodeSizeSlider").property("value"))));
						helios.nodeOutlineWidth(node=>node.size*defaultOutline);
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
					.filter(d => d[0] != "ID")
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
				// 	helios.edgesIntensity(Math.pow(10,parseFloat(d3Select("#edgeOpacitySlider").property("value"))));
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
					.attr("value", "1")
					.attr("id", "edgeOpacitySlider")
					.classed("slider", true)
					.style("min-width", "60px")
					.on("input", (event, d) => {
						// helios.edgesIntensity(Math.pow(10,parseFloat(d3Select("#edgeOpacitySlider").property("value"))));
						helios.edgesIntensity(parseFloat(d3Select("#edgeOpacitySlider").property("value")));
						helios.update();
						helios.render();
						event.stopPropagation();
					});
			}
		},
	}
	// window.d3Chromatic = d3Chromatic;
	function updateCategoricalColors(){
		let propertyArray = [];
		for (let [key, node] of Object.entries(helios.network.nodes)) {
			propertyArray.push(node[colorProperty]);
		}
		let sortedItems = sortByCount(propertyArray);
		console.log(sortedItems);
		let scheme = d3Chromatic[categoricalColormap];
		let arraysCount = scheme.filter(Array.isArray).length;

		if(arraysCount>0){
			let firstIndex = scheme.findIndex(d=> (typeof d!=="undefined"));
			if(typeof scheme[sortedItems.length-1] !== "undefined"){
				scheme = scheme[sortedItems.length-1];
			}else{
				if(sortedItems.length-1<firstIndex){
					scheme = scheme[firstIndex];
				}else{
					scheme = scheme[scheme.length-1];
				}
			}
		}
		// let maxColors = const [lastItem] = arr.slice(-1)
		let colorMap = d3ScaleOrdinal(scheme);
		let property2color = new Map();
		sortedItems.forEach((d, i) => {
			if(i<scheme.length){
				property2color.set(d,colorMap(d));
			}else{
				property2color.set(d,"#bbbbbb");;
			}
		});
		helios.nodeColor(node => {
			let color = d3rgb(property2color.get(node[colorProperty]));
			// console.log(""+[color.r,color.g,color.b])
			return [color.r/255,color.g/255,color.b/255];
		});
		helios.update();
		helios.render();
	}


	function updateSequencialColors(){
		let propertyArray = [];
		let maxValue = -Infinity;
		let minValue = Infinity;
		for (let [key, node] of Object.entries(helios.network.nodes)) {
			propertyArray.push(node[colorProperty]);
			maxValue = Math.max(maxValue, node[colorProperty]);
			minValue = Math.min(minValue, node[colorProperty]);
		}
		let scheme = d3Chromatic[sequencialColormap];
		let cScale = d3ScaleSequential(scheme)
		.domain([minValue,maxValue]);
		helios.nodeColor(node => {
			let color = d3rgb(cScale(node[colorProperty]));
			// console.log(""+[color.r,color.g,color.b])
			return [color.r/255,color.g/255,color.b/255];
		});
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
			.data(Object.entries(d3Chromatic).filter(d => d[0].startsWith(categorical ? "scheme" : "interpolate")))
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
				buttonInformation[d].action(d3Select(this), d);
			}
		})
		.classed("hasAction", true);

		helios.onReady(() => updateColorSelection());
});

// d3Select("#selectionmenu")
// 	.append("a")
// 	.style("--color","red")
// 	.append("slider")
// 	.attr("type","range")
// 	.attr("min","-2")
// 	.attr("max","2")
// 	.attr("step","0.1")
// 	.attr("value","0")
// 	.attr("ID","myRange");


