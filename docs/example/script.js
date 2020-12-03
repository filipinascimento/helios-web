import {Helios,xnet} from "../../src/core/Helios"

// xnet.loadXNETFile("AI_Bardosova_positions-3D.xnet")
xnet.loadXNETFile("WS_10000_10_001.xnet")
.then(network=>{
  console.log(network)

  let nodeCount = network.nodesCount;
  
  let nodes = {};
  let edges = [];
  
  for (let index = 0; index < nodeCount; index++) {
    nodes[""+index] = {
      name:""+index,
      position:network.verticesProperties["Position"][index],
      color:network.verticesProperties["Color"][index],
    };
  }
  
  for (let index = 0; index < network.edges.length; index++) {
    let fromIndex,toIndex;

    edges.push({
        "source": ""+network.edges[index][0],
        "target": ""+network.edges[index][1]
      });
  }
  
  let helios = new Helios({
    elementID:"netviz",
    nodes:nodes,
    edges:edges
  });

});

