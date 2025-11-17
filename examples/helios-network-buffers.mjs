import { Network } from "../src/core/Network.js";

const demoNodes = {
	"0": {
		Label: "Alpha",
		Color: [0.95, 0.5, 0.2, 1],
		Position: [0, 0, 0],
	},
	"1": {
		Label: "Beta",
		Color: [0.2, 0.8, 0.9, 1],
		Position: [25, 10, 0],
	},
	"2": {
		Label: "Gamma",
		Color: [0.2, 0.9, 0.4, 1],
		Position: [-25, -15, 0],
	},
};

const demoEdges = [
	{ source: "0", target: "1", weight: 2.5 },
	{ source: "0", target: "2", label: "aux" },
	{ source: "1", target: "2", weight: 1.25 },
];

async function main() {
	const reference = new Network(demoNodes, demoEdges, false, true);
	console.log(`Original network → nodes: ${reference.nodeCount}, edges: ${reference.indexedEdges.length / 2}`);

	const bxnetPayload = await reference.saveBXNet();
	console.log(`Serialized BXNet payload length: ${bxnetPayload.length} bytes`);
	const zxnetPayload = await reference.saveZXNet();
	console.log(`Serialized ZXNet payload length: ${zxnetPayload.length} bytes`);

	const bxnetClone = await Network.fromBXNet(bxnetPayload);
	console.log(`BXNet clone → nodes: ${bxnetClone.nodeCount}, weighted: ${bxnetClone.weighted}`);

	const zxnetClone = await Network.fromZXNet(zxnetPayload);
	console.log(`ZXNet clone → nodes: ${zxnetClone.nodeCount}, weighted: ${zxnetClone.weighted}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
