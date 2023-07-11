import { rgb as d3rgb } from "d3-color"

'use strict';

/**
 * GEXF Parser
 * ============
 *
 * Author: PLIQUE Guillaume (Yomguithereal)
 * URL: https://github.com/Yomguithereal/gexf
 * Version: 0.2.5
 */

/**
 * Helper Namespace
 * -----------------
 *
 * A useful batch of function dealing with DOM operations and types.
 */
let _helpers = {
	getModelTags: function (xml) {
		let attributesTags = xml.getElementsByTagName('attributes'),
			modelTags = {},
			l = attributesTags.length,
			i;

		for (i = 0; i < l; i++)
			modelTags[attributesTags[i].getAttribute('class')] =
				attributesTags[i].childNodes;

		return modelTags;
	},
	nodeListToArray: function (nodeList) {

		// Return array
		let children = [];

		// Iterating
		for (let i = 0, len = nodeList.length; i < len; ++i) {
			if (nodeList[i].nodeName !== '#text')
				children.push(nodeList[i]);
		}

		return children;
	},
	nodeListEach: function (nodeList, func) {

		// Iterating
		for (let i = 0, len = nodeList.length; i < len; ++i) {
			if (nodeList[i].nodeName !== '#text')
				func(nodeList[i]);
		}
	},
	nodeListToHash: function (nodeList, filter) {

		// Return object
		let children = {};

		// Iterating
		for (let i = 0; i < nodeList.length; i++) {
			if (nodeList[i].nodeName !== '#text') {
				let prop = filter(nodeList[i]);
				children[prop.key] = prop.value;
			}
		}

		return children;
	},
	namedNodeMapToObject: function (nodeMap) {

		// Return object
		let attributes = {};

		// Iterating
		for (let i = 0; i < nodeMap.length; i++) {
			attributes[nodeMap[i].name] = nodeMap[i].value;
		}

		return attributes;
	},
	getFirstElementByTagNS: function (node, ns, tag) {
		let el = node.getElementsByTagName(ns + ':' + tag)[0];

		if (!el)
			el = node.getElementsByTagNameNS(ns, tag)[0];

		if (!el)
			el = node.getElementsByTagName(tag)[0];

		return el;
	},
	getAttributeNS: function (node, ns, attribute) {
		let attr_value = node.getAttribute(ns + ':' + attribute);

		if (attr_value === undefined)
			attr_value = node.getAttributeNS(ns, attribute);

		if (attr_value === undefined)
			attr_value = node.getAttribute(attribute);

		return attr_value;
	},
	enforceType: function (type, value) {

		switch (type) {
			case 'boolean':
				value = (value === 'true');
				break;

			case 'integer':
			case 'long':
			case 'float':
			case 'double':
				value = +value;
				break;

			case 'liststring':
				value = value ? value.split('|') : [];
				break;
		}

		return value;
	},
	getRGB: function (values) {
		return (values[3]) ?
			'rgba(' + values.join(',') + ')' :
			'rgb(' + values.slice(0, -1).join(',') + ')';
	}
};


/**
 * Parser Core Functions
 * ----------------------
 *
 * The XML parser's functions themselves.
 */

/**
 * Node structure.
 * A function returning an object guarded with default value.
 *
 * @param  {object} properties The node properties.
 * @return {object}            The guarded node object.
 */
function Node(properties) {

	// Possible Properties
	let node = {
		id: properties.id,
		label: properties.label
	};

	if (properties.viz)
		node.viz = properties.viz;

	if (properties.attributes)
		node.attributes = properties.attributes;

	return node;
}


/**
 * Edge structure.
 * A function returning an object guarded with default value.
 *
 * @param  {object} properties The edge properties.
 * @return {object}            The guarded edge object.
 */
function Edge(properties) {

	// Possible Properties
	let edge = {
		id: properties.id,
		type: properties.type || 'undirected',
		label: properties.label || '',
		source: properties.source,
		target: properties.target,
		weight: +properties.weight || 1.0
	};

	if (properties.viz)
		edge.viz = properties.viz;

	if (properties.attributes)
		edge.attributes = properties.attributes;

	return edge;
}

/**
 * Graph parser.
 * This structure parse a gexf string and return an object containing the
 * parsed graph.
 *
 * @param  {string} xmlString The xml string of the gexf file to parse.
 * @return {object}     The parsed graph.
 */
function Graph(xmlString) {
	let xmlParser = new DOMParser();
  let xml = xmlParser.parseFromString(xmlString,"text/xml");
	let _xml = {};
	console.log(xml);
	// Basic Properties
	//------------------
	_xml.els = {
		root: xml.getElementsByTagName('gexf')[0],
		graph: xml.getElementsByTagName('graph')[0],
		meta: xml.getElementsByTagName('meta')[0],
		nodes: xml.getElementsByTagName('node'),
		edges: xml.getElementsByTagName('edge'),
		model: _helpers.getModelTags(xml)
	};

	// Information
	_xml.hasViz = !!_helpers.getAttributeNS(_xml.els.root, 'xmlns', 'viz');
	_xml.version = _xml.els.root.getAttribute('version') || '1.0';
	_xml.mode = _xml.els.graph.getAttribute('mode') || 'static';

	let edgeType = _xml.els.graph.getAttribute('defaultedgetype');
	_xml.defaultEdgetype = edgeType || 'undirected';

	// Parser Functions
	//------------------

	// Meta Data
	function _metaData() {

		let metas = {};
		if (!_xml.els.meta)
			return metas;

		// Last modified date
		metas.lastmodifieddate = _xml.els.meta.getAttribute('lastmodifieddate');

		// Other information
		_helpers.nodeListEach(_xml.els.meta.childNodes, function (child) {
			metas[child.tagName.toLowerCase()] = child.textContent;
		});

		return metas;
	}

	// Model
	function _model(cls) {
		let attributes = [];

		// Iterating through attributes
		if (_xml.els.model[cls])
			_helpers.nodeListEach(_xml.els.model[cls], function (attr) {

				// Properties
				let properties = {
					id: attr.getAttribute('id') || attr.getAttribute('for'),
					type: attr.getAttribute('type') || 'string',
					title: attr.getAttribute('title') || ''
				};

				// Defaults
				let default_el = _helpers.nodeListToArray(attr.childNodes);

				if (default_el.length > 0)
					properties.defaultValue = default_el[0].textContent;

				// Creating attribute
				attributes.push(properties);
			});

		return attributes.length > 0 ? attributes : false;
	}

	// Data from nodes or edges
	function _data(model, node_or_edge) {

		let data = {};
		let attvalues_els = node_or_edge.getElementsByTagName('attvalue');

		// Getting Node Indicated Attributes
		let ah = _helpers.nodeListToHash(attvalues_els, function (el) {
			let attributes = _helpers.namedNodeMapToObject(el.attributes);
			let key = attributes.id || attributes['for'];

			// Returning object
			return { key: key, value: attributes.value };
		});


		// Iterating through model
		model.map(function (a) {

			// Default value?
			data[a.id] = !(a.id in ah) && 'defaultValue' in a ?
				_helpers.enforceType(a.type, a.defaultValue) :
				_helpers.enforceType(a.type, ah[a.id]);

		});

		return data;
	}

	// Nodes
	function _nodes(model) {
		let nodes = [];

		// Iteration through nodes
		_helpers.nodeListEach(_xml.els.nodes, function (n) {

			// Basic properties
			let properties = {
				id: n.getAttribute('id'),
				label: n.getAttribute('label') || ''
			};

			// Retrieving data from nodes if any
			if (model)
				properties.attributes = _data(model, n);

			// Retrieving viz information
			if (_xml.hasViz)
				properties.viz = _nodeViz(n);

			// Pushing node
			nodes.push(Node(properties));
		});

		return nodes;
	}

	// Viz information from nodes
	function _nodeViz(node) {
		let viz = {};

		// Color
		let color_el = _helpers.getFirstElementByTagNS(node, 'viz', 'color');

		if (color_el) {
			let color = ['r', 'g', 'b', 'a'].map(function (c) {
				return color_el.getAttribute(c);
			});

			viz.color = _helpers.getRGB(color);
		}

		// Position
		let pos_el = _helpers.getFirstElementByTagNS(node, 'viz', 'position');

		if (pos_el) {
			viz.position = {};

			['x', 'y', 'z'].map(function (p) {
				viz.position[p] = +pos_el.getAttribute(p);
			});
		}

		// Size
		let size_el = _helpers.getFirstElementByTagNS(node, 'viz', 'size');
		if (size_el)
			viz.size = +size_el.getAttribute('value');

		// Shape
		let shape_el = _helpers.getFirstElementByTagNS(node, 'viz', 'shape');
		if (shape_el)
			viz.shape = shape_el.getAttribute('value');

		return viz;
	}

	// Edges
	function _edges(model, default_type) {
		let edges = [];

		// Iteration through edges
		_helpers.nodeListEach(_xml.els.edges, function (e) {

			// Creating the edge
			let properties = _helpers.namedNodeMapToObject(e.attributes);
			if (!('type' in properties)) {
				properties.type = default_type;
			}

			// Retrieving edge data
			if (model)
				properties.attributes = _data(model, e);


			// Retrieving viz information
			if (_xml.hasViz)
				properties.viz = _edgeViz(e);

			edges.push(Edge(properties));
		});

		return edges;
	}

	// Viz information from edges
	function _edgeViz(edge) {
		let viz = {};

		// Color
		let color_el = _helpers.getFirstElementByTagNS(edge, 'viz', 'color');

		if (color_el) {
			let color = ['r', 'g', 'b', 'a'].map(function (c) {
				return color_el.getAttribute(c);
			});

			viz.color = _helpers.getRGB(color);
		}

		// Shape
		let shape_el = _helpers.getFirstElementByTagNS(edge, 'viz', 'shape');
		if (shape_el)
			viz.shape = shape_el.getAttribute('value');

		// Thickness
		let thick_el = _helpers.getFirstElementByTagNS(edge, 'viz', 'thickness');
		if (thick_el)
			viz.thickness = +thick_el.getAttribute('value');

		return viz;
	}


	// Returning the Graph
	//---------------------
	let nodeModel = _model('node'),
		edgeModel = _model('edge');

	let graph = {
		version: _xml.version,
		mode: _xml.mode,
		defaultEdgeType: _xml.defaultEdgetype,
		meta: _metaData(),
		model: {},
		nodes: _nodes(nodeModel),
		edges: _edges(edgeModel, _xml.defaultEdgetype)
	};

	if (nodeModel)
		graph.model.node = nodeModel;
	if (edgeModel)
		graph.model.edge = edgeModel;

	return graph;
}


// Parsing the GEXF File
function parse(gexf) {
	return Graph(gexf);
}


/**
 * Exporting
 * ----------
 */
let gexf = {

	// Functions
	parse: parse,

	// Version
	version: '0.2.5'
};



function loadGEXF(networkData){
  return gexf.parse(networkData);
}


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

export {loadGEXFFile,loadGEXF,convertGEXF2JSON}
