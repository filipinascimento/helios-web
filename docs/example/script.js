import {Helios,xnet} from "../../src/core/Helios"
import {schemeCategory10 as d3SchemeCategory10} from "d3-scale-chromatic"
import {scaleOrdinal as d3ScaleOrdinal} from "d3-scale"
import {rgb as d3rgb} from "d3-color"


xnet.loadXNETFile("WS_10000_10_001.xnet")
// xnet.loadXNETFile("lynyrdskynyrd__freebird.xnet")
// xnet.loadXNETFile("Simple.xnet")
// xnet.loadXNETFile("latticeToroidalBC.xnet")
// xnet.loadXNETFile("net_Olivetti_cosine_k_5.xnet")
.then(network=>{
	console.log(network)

	let nodeCount = network.nodesCount;
	
	let nodes = {};
	let edges = [];
	
	for (let index = 0; index < nodeCount; index++) {
		nodes[""+index] = {
			name:""+index,
			// position: [0,0,0],//network.verticesProperties["Position"][index],
			// color:[0.0,0.0,0.0]//[network.verticesProperties["Color"][index]],
			// scale:1
		};
	}
	
	for (let index = 0; index < network.edges.length; index++) {
		let fromIndex,toIndex;

		edges.push({
				"source": ""+network.edges[index][0],
				"target": ""+network.edges[index][1],
				// directed?
			});
	}
	
	let tooltipElement = document.getElementById("tooltip");

	let colorScale = d3ScaleOrdinal(d3SchemeCategory10);
	let helios = new Helios({
		elementID:"netviz",
		nodes:nodes,
		edges:edges
	})
	.onNodeHoverStart((node,event) => {
		if(event){
			tooltipElement.style.left = event.pageX+"px";
			tooltipElement.style.top = event.pageY+"px";
		}
		if(node){
			tooltipElement.style.display = "block";
			tooltipElement.textContent = node.name;
			helios.nodeScale(1.5,node.name);
			helios.update();
			helios.render();
		}else{
			tooltipElement.style.display = "none";
		}
		// console.log(`Start: ${node.name}`);
	})
	.onNodeHoverMove((node,event) => {
		if(event){
			tooltipElement.style.left = event.pageX+"px";
			tooltipElement.style.top = event.pageY+"px";
		}
		if(node){
			tooltipElement.style.display = "block";
			tooltipElement.textContent = node.name;
		}else{
			tooltipElement.style.display = "none";
		}
		// console.log(`Move: ${node.name}`);
	})
	.onNodeHoverEnd((node,event) => {
		if(event){
			tooltipElement.style.left = event.pageX+"px";
			tooltipElement.style.top = event.pageY+"px";
		}
		if(node){
			helios.nodeScale(1.0,node.name);
			helios.update();
			helios.render();
		}
		tooltipElement.style.display = "none";
		// console.log(`End: ${node.name}`);
	})
	.onNodeClick((node,event) => {
		// console.log(`Clicked: ${node.name}`);
	})
	// .onLayoutStart(()=>console.log("Layout start"))
	// .onLayoutFinish(()=>console.log("Layout end"))
	.backgroundColor([1.0,1.0,1.0,1.0]) // set background color
	// .nodeColor(node=>{ // Example on how to define colors
	// 	let color = d3rgb(colorScale(node.name));
	// 	// console.log(""+[color.r,color.g,color.b])
	// 	return [color.r/255,color.g/255,color.b/255];
	// })
	// .nodeScale(node=>{ // Example on how to define scale
	// 	return Math.random()*5+1.0;
	// })
	.edgesIntensity(0.8);
});

