
import { createColorMap, linearScale } from "@colormap/core";
import { viridis, cividis, plasma, inferno, magma, blackWhite } from "@colormap/presets";


export class Network{
	constructor(nodes,edges,properties){
    this.nodes = nodes;
    this.node2index = new Object();
    this.index2node = [];
    this.indexedEdges = new Int32Array(edges.length*2);
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      const edge = edges[edgeIndex];
      if(!this.node2index.hasOwnProperty(edge.source)){
        this.node2index[edge.source] = this.index2node.length;
        this.index2node.push(edge.source);
      }
      if(!this.node2index.hasOwnProperty(edge.target)){
        this.node2index[edge.target] = this.index2node.length;
        this.index2node.push(edge.target);
      }
      // console.log(this.index2node)
      this.indexedEdges[edgeIndex*2] = this.node2index[edge.source];
      this.indexedEdges[edgeIndex*2+1] = this.node2index[edge.target];
    }
    
    this.positions = new Float32Array(3*this.index2node.length);
    this.colors = new Float32Array(3*this.index2node.length);
    this.scales = new Float32Array(this.index2node.length);
    this.intensities = new Float32Array(this.index2node.length);

    // for (let index = 0; index < this.positions.length; index++) {
    //   this.positions[index] = (Math.random()-0.5)*2*200;
    //   this.colors[index] = Math.random()*0.8+0.2;
    // }

    let colorScale = linearScale([0, this.index2node.length], [0, 1]);
    let colorMap = createColorMap(inferno, colorScale);
    for (let index = 0; index < this.index2node.length; index++) {
      let node = this.nodes[this.index2node[index]];
      if(node.hasOwnProperty("position")){
        this.positions[index*3]   = node["position"][0];
        this.positions[index*3+1] = node["position"][1];
        this.positions[index*3+2] = node["position"][2];
      }else{
        this.positions[index*3+0] = (Math.random()-0.5)*2*200;
        this.positions[index*3+1] = (Math.random()-0.5)*2*200;
        this.positions[index*3+2] = (Math.random()-0.5)*2*200;
      }
      if(node.hasOwnProperty("color")){
        this.colors[index*3+0] = node["color"][0];
        this.colors[index*3+1] = node["color"][1];
        this.colors[index*3+2] = node["color"][2];
      }else{
        let color = colorMap(index);
        this.colors[index*3+0] = color[0];
        this.colors[index*3+1] = color[1];
        this.colors[index*3+2] = color[2];
      }

      if(node.hasOwnProperty("scale")){
        this.scales[index] = node["scale"];
      }else{
        this.scales[index] = 1.0;
      }
    }
    for (let index = 0; index < this.scales.length; index++) {
      this.intensities[index] = 1.0;
    }
  }
}
