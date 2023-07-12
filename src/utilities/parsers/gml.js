/*
 * The GML software is based on the code from https://github.com/mobenar/mobenga-gml
 *
 * MIT License
 *
 * Copyright (c) [year] [author]
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

/**
 * Parses GML string.
 *
 * @param {String} gml
 * @returns {Object}
 * @throws {SyntaxError}
 */

function GMLParse(gml) {

	var json = ('{\n' + gml + '\n}')
		.replace(/^(\s*)(\w+)\s*\[/gm, '$1"$2": {')
		.replace(/^(\s*)\]/gm, '$1},')
		.replace(/^(\s*)(\w+)\s+(.+)$/gm, '$1"$2": $3,')
		.replace(/,(\s*)\}/g, '$1}');

	var graph = {};
	var nodes = [];
	var edges = [];
	var i = 0;
	var parsed;

	json = json.replace(/^(\s*)"node"/gm, function (all, indent) {

		return (indent + '"node[' + (i++) + ']"');
	});

	i = 0;

	json = json.replace(/^(\s*)"edge"/gm, function (all, indent) {

		return (indent + '"edge[' + (i++) + ']"');
	});
	//replace NaN with null
	json = json.replace(/: NaN/g, ': null');
	
	try {
		parsed = JSON.parse(json);
	}
	catch (err) {
		throw new SyntaxError('bad format');
	}
	if (!isObject(parsed.graph)) {
		throw new SyntaxError('no graph tag');
	}

	forIn(parsed.graph, function (key, value) {

		var matches = key.match(/^(\w+)\[(\d+)\]$/);
		var name;
		var i;

		if (matches) {
			name = matches[1];
			i = parseInt(matches[2], 10);

			if (name === 'node') {
				nodes[i] = value;
			}
			else if (name === 'edge') {
				edges[i] = value;
			}
			else {
				graph[key] = value;
			}
		}
		else {
			graph[key] = value;
		}
	});
	let nodesDictionary = {};
	nodes.forEach(function (node) {
		nodesDictionary[node.id] = node;
	});
	graph.nodes = nodesDictionary;
	graph.edges = edges;

	return graph;
};

/**
 * Stringifies GML object.
 *
 * @param {Object} graph
 * @param {Object} [options]
 * @returns {String}
 */
function GMLStringify(graph, options) {

	if (typeof graph.toJSON === 'function') {
		graph = graph.toJSON();
	}

	options = options || {};

	var nodes = graph.nodes || [];
	var edges = graph.edges || [];
	var indent1 = (typeof options.indent === 'string' ? options.indent : '  ');
	var indent2 = indent1 + indent1;
	var getGraphAttributes = options.graphAttributes || null;
	var getNodeAttributes = options.nodeAttributes || null;
	var getEdgeAttributes = options.edgeAttributes || null;
	var lines = ['graph ['];

	function addAttribute(key, value, indent) {

		if (isObject(value)) {
			lines.push(indent + key + ' [');

			forIn(value, function (key, value) {

				addAttribute(key, value, indent + indent1);
			});

			lines.push(indent + ']');
		}
		else {
			lines.push(indent + attribute(key, value));
		}
	}

	forIn(graph, function (key, value) {

		if (key !== 'nodes' && key !== 'edges') {
			addAttribute(key, value, indent1);
		}
	});

	if (getGraphAttributes) {
		forIn(getGraphAttributes(graph), function (key, value) {

			addAttribute(key, value, indent1);
		});
	}

	nodes.forEach(function (node) {

		lines.push(indent1 + 'node [');

		// addAttribute('id', node.id, indent2);
		// addAttribute('label', node.label, indent2);

		if (getNodeAttributes) {
			// getNodeAttributes
			getNodeAttributes.forEach(function (key) {

				addAttribute(key, node[key], indent2);
			});
		}

		lines.push(indent1 + ']');
	});

	edges.forEach(function (edge) {

		lines.push(indent1 + 'edge [');

		addAttribute('source', edge.source, indent2);
		addAttribute('target', edge.target, indent2);
		// addAttribute('label', edge.label, indent2);

		if (getEdgeAttributes) {
			getEdgeAttributes.forEach(function (key) {

				addAttribute(key, edge[key], indent2);
			});
		}

		lines.push(indent1 + ']');
	});

	lines.push(']');

	return lines.join('\n');
};

function isObject(value) {

	return (value && Object.prototype.toString.call(value) === '[object Object]');
}

function forIn(object, callback) {

	Object.keys(object).forEach(function (key) {

		callback(key, object[key]);
	});
}

function attribute(key, value) {

	if (typeof value === 'boolean') {
		value = Number(value);
	}
	else {
		value = JSON.stringify(value);
	}

	return (key + ' ' + value);
}



function loadGML(networkData) {
	return GMLParse(networkData);
}


async function loadGMLFile(networkFile) {
	let networkData = await fetch(networkFile)
		.then(response => {
			return response.text();
		});
	return loadGML(networkData);
}

export { loadGML, loadGMLFile, GMLStringify };