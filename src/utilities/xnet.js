"use strict";

let textSplit2 = (text) => {
	let entries = text.split(/\s/)
	if (entries.length < 2) {
		return null;
	}
	return [+entries[0], +entries[1]];
};

let textSplit3 = (text) => {
	let entries = text.split(/\s/)
	if (entries.length < 3) {
		return null;
	}
	return [+entries[0], +entries[1], +entries[2]];
};

let readNumberIgnoringNone = (text) => {
	if (isNaN(text)) {
		return 0.0;
	} else {
		return +text;
	}
};


let propertyHeaderRegular = /#([ve]) \"(.+)\" ([sn]|v2|v3)/;
let propertyFunctions = {
	"s": String,
	"n": readNumberIgnoringNone,
	"v2": textSplit2,
	"v3": textSplit3
};



let readXNETVerticesHeader = (status) => {
	while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
		status.lineIndex++;
	}

	let headerLine = status.lines[status.lineIndex];
	let headerEntries = headerLine.split(/\s/);
	let nodeCount = 0;
	
	if (headerEntries.length == 0 || headerEntries[0].toLowerCase() != "#vertices" ||
		isNaN(headerEntries[1]) || !Number.isInteger(+headerEntries[1])) {
		throw `Malformed xnet data (Reading Vertices Header)[line: ${status.lineIndex}]\n\t> ${status.lines[status.lineIndex]}`;
	}
	nodeCount = +headerEntries[1];
	status.lineIndex++;
	return nodeCount;
};

let readXNETLabels = (status) => {
	let labels = [];
	while (status.lineIndex < status.lines.length) {
		let currentLine = status.lines[status.lineIndex];
		let lineLength = currentLine.length;
		if (lineLength == 0) {
			status.lineIndex++;
			continue;
		}
		if (currentLine[0] == "#") {
			break;
		}
		var label = currentLine;
		if (currentLine[0] == "\"" && currentLine[lineLength - 1] == "\"") {
			label = currentLine.slice(1, -1);
		}
		labels.push(label);
		status.lineIndex++;
	}
	return labels;
};

let readXNETEdgesHeader = (status) => {
	while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
		status.lineIndex++;
	}

	let headerLine = status.lines[status.lineIndex];
	let headerEntries = headerLine.split(/\s/);

	let weighted = false;
	let directed = false;

	if (headerEntries.length == 0 || headerEntries[0].toLowerCase() != "#edges") {
		throw `Malformed xnet data (Reading Edges Header)[line: ${status.lineIndex}]\n\t> ${status.lines[status.lineIndex]}`;
	}

	headerEntries.forEach(headerEntry => {
		if (headerEntry.toLowerCase() == "weighted") {
			weighted = true;
		}
		if (headerEntry.toLowerCase() == "nonweighted") {
			weighted = false;
		}
		if (headerEntry.toLowerCase() == "directed") {
			directed = true;
		}
		if (headerEntry.toLowerCase() == "undirected") {
			directed = false;
		}
	});
	status.lineIndex++;
	return { weighted: weighted, directed: directed };
};


let readXNETEdges = (status) => {
	let edges = [];
	let weights = [];
	while (status.lineIndex < status.lines.length) {
		let currentLine = status.lines[status.lineIndex];
		let lineLength = currentLine.length;
		if (lineLength == 0) {
			status.lineIndex++;
			continue;
		}
		if (currentLine[0] == "#") {
			break;
		}
		let entries = currentLine.split(/\s/);
		let weight = 1.0;
		
		if (entries.length < 2) {
			throw `Malformed xnet data (Reading Edges)[line: ${status.lineIndex}]\n\t> ${status.lines[status.lineIndex]}`;
		}
		if (entries.length > 2) {
			weight = +entries[2];
		}
		edges.push([+entries[0], +entries[1]]);
		weights.push(weight);
		status.lineIndex++;
	}
	return { edges: edges, weights: weights };
};


let readXNETPropertyHeader = (status) => {
	while (status.lineIndex + 1 < status.lines.length && status.lines[status.lineIndex].length == 0) {
		status.lineIndex++;
	}

	let headerEntries = propertyHeaderRegular.exec(status.lines[status.lineIndex]);

	if (headerEntries.length != 4) {
		throw `Malformed xnet data [line: ${status.lineIndex}]\n\t> ${status.lines[status.lineIndex]}`;
	}
	let propertyType = headerEntries[1];
	let propertyKey = headerEntries[2];
	let propertyFormat = headerEntries[3];

	status.lineIndex++;

	return { type: propertyType, key: propertyKey, format: propertyFormat };
};



let readXNETProperty = (status, propertyHeader) => {
	let properties = [];
	let propertyFunction = propertyFunctions[propertyHeader.format];
	while (status.lineIndex < status.lines.length) {
		let currentLine = status.lines[status.lineIndex];
		let lineLength = currentLine.length;
		if (lineLength == 0) {
			status.lineIndex++;
			continue;
		}
		if (currentLine[0] == "#") {
			break;
		}
		let value = currentLine;
		if (value[0] == "\"" && value[lineLength - 1] == "\"") {
			value = value.slice(1, -1);
		}
		properties.push(propertyFunction(value));
		status.lineIndex++;
	}
	return properties;
};



let loadXNET = (data) => {
	let status = { lineIndex:0, lines: data.split("\n") };
	let nodesCount = readXNETVerticesHeader(status);
	let labels = readXNETLabels(status);

	let network = { nodesCount: nodesCount, verticesProperties: {}, edgesProperties: {} }

	if (labels.length > 0) {
		if (labels.length < nodesCount) {
			throw `Malformed xnet data [line: ${status.lineIndex}]\n\t> ${status.lines[status.lineIndex]}`;
		} else {
			network.labels = labels;
		}
	}
	let edgesHeader = readXNETEdgesHeader(status);
	network.directed = edgesHeader.directed;
	network.weighted = edgesHeader.weighted;

	let edgesData = readXNETEdges(status);
	network.edges = edgesData.edges;
	if (network.weighted) {
		network.weights = edgesData.weights;
	}

	do{
		while (status.lineIndex < status.lines.length && status.lines[status.lineIndex].length == 0) {
			status.lineIndex++;
		}
		if(!(status.lineIndex < status.lines.length)){
			break;
		}
		let propertyHeader = readXNETPropertyHeader(status);
		let propertyData = readXNETProperty(status, propertyHeader);
		//console.log(propertyHeader);
		if (propertyHeader.type == "e") {
			network.edgesProperties[propertyHeader.key] = propertyData;
		} else if (propertyHeader.type == "v") {
			network.verticesProperties[propertyHeader.key] = propertyData;
		}
		// status.lineIndex++;
	}while (status.lineIndex < status.lines.length);
	return network;
};


async function loadXNETFile(networkFile){
	let networkData = await fetch(networkFile)
		.then(response => response.text());
		// .then();
	return loadXNET(networkData);
}

export {loadXNET,loadXNETFile}