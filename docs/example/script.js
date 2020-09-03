import {Helios} from "../../src/core/Helios"




const nodes = {
  "0":{
    "name": "node0",
  },
  "1":{
    "name": "node1",
  },
  "2":{
    "name": "node2",
  },
  "3":{
    "name": "node3",
  },
  "4":{
    "name": "node4",
  },
  "5":{
    "name": "node5",
  },
  "6":{
    "name": "node6",
  }
}
const edges = [
  {
    "source": "0",
    "target": "1",
  },
  {
    "source": "1",
    "target": "2",
  },
  {
    "source": "2",
    "target": "3",
  },
  {
    "source": "3",
    "target": "4",
  },
  {
    "source": "4",
    "target": "5",
  },
  {
    "source": "5",
    "target": "6",
  },
  {
    "source": "6",
    "target": "0",
  },
  {
    "source": "0",
    "target": "3",
  },
]

let helios = new Helios("netviz");
