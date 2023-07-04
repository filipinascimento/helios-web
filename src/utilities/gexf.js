import { gexf } from "./parsers/gexf_parser.js";
import { rgb as d3rgb } from "d3-color"


async function loadGEXFFile(networkFile){
  let networkData = await fetch(networkFile)
    .then(response => response.text());
  return gexf.parse(networkData);
}



function convertGEXF2JSON(network){
  /*
  network = {
    nodes: [
      {id: "n0", attributes:{...}},
      {id: "n1", attributes:{...}},
      {id: "n2", attributes:{...}},

    ],
    edges: [
      {id: "e0", source: "n0", target: "n1", attributes:{...}},
      {id: "e1", source: "n1", target: "n2", attributes:{...}},
  }
  */

	let nodes = {};
	let edges = [];
  for (let node of network.nodes) {
    let nodeID = node.id;
    nodes[nodeID] = {};
    // update with attributes
    if (node.attributes) {
      for (const [key, value] of Object.entries(node.attributes||{})) {
        nodes[nodeID][key] = value;
      }
    }
    // update label if exists
    if (node.label) {
      nodes[nodeID].Label = node.label;
    }else if (node?.attributes.name) {
      nodes[nodeID].Label = node.attributes.name;
    }else{
      nodes[nodeID].Label = nodeID;
    }
    if (node.viz?.position) {
      let pos = node.viz?.position;
      nodes[nodeID].Position = [pos?.x||0, pos?.y||0, pos?.z||0];
    }

    if (node.viz?.color) {
      let color = d3rgb(node.viz?.color);
      nodes[nodeID].Color = [color.r/255, color.g/255, color.b/255];
    }
  }


	for (let edge of network.edges||[]) {
    let newEdge = {};
    newEdge.source = edge.source;
    newEdge.target = edge.target;
    for (const [key, value] of Object.entries(edge.attributes||{})) {
      newEdge[key] = value;
    }
    edges.push(newEdge);
	}
	
	return {nodes:nodes,edges:edges};
}

export {loadGEXFFile,convertGEXF2JSON}