


export class Network{
	constructor(nodes,edges){
    this.nodes = nodes;
    this.node2index = new Object();
    this.index2node = [];
    this.indexedEdges = new Int32Array(edges.length*2);
    for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
      const edge = edges[edgeIndex];
      if(!this.node2index.hasOwnProperty(edges.source)){
        this.node2index[edges.source] = this.index2node.length;
        this.index2node.push(edges.source);
      }
      if(!this.node2index.hasOwnProperty(edges.target)){
        this.node2index[edges.target] = this.index2node.length;
        this.index2node.push(edges.target);
      }
      this.indexedEdges[edgeIndex*2] = this.node2index[edges.source];
      this.indexedEdges[edgeIndex*2+1] = this.node2index[edges.target];
    }
    
    this.positions = new Float32Array(3*this.index2node.length);
    this.colors = new Float32Array(3*this.index2node.length);
    this.scales = new Float32Array(this.index2node.length);
    this.intensities = new Float32Array(this.index2node.length);
    for (let index = 0; index < this.positions.length; index++) {
      this.positions[index] = (Math.random()-0.5)*2*100;
      this.colors[index] = Math.random()*0.8+0.2;
    }
    for (let index = 0; index < this.scales.length; index++) {
      this.scales[index] = 20+Math.random()*5;
      this.intensities[index] = 1.0;
    }
  }

}
