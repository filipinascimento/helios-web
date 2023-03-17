
// import * as glm from "gl-matrix"
// import * as glUtils from "../utilities/webgl.js"
// import * as arrayUtils from "../utilities/array.js"


// export class GeometrytAtribute {
// 	constructor(name, size, type, normalized, stride, offset) {
// 		this.name = name;
// 		this.size = size;
// 		this.type = type;
// 		this.normalized = normalized;
// 		this.stride = stride;
// 		this.offset = offset;
// 	}
// }

// /**
//  * Helios Geometry handles the creation of buffers and attributes for a given geometry of nodes or edges
//  */
// export class HeliosGeometry {
// 	//the class constructor
// 	/**
// 	 * constructor description
// 	 * @param {WebGLRenderingContext} gl - The WebGL context
// 	 * @param {Object} config - The configuration object
// 	 * @param {boolean} [config.generateComplexGeometry=true] - Whether to generate complex geometry for nodes
// 	 */
// 	constructor(gl,{
// 		generateComplexGeometry = false,
// 	}) {
// 		this.gl = gl;
// 		this._nodesGlobalOpacityScale = 1.0;
// 		this._nodesGlobalOpacityBase = 0.0;

// 		this._nodesGlobalSizeScale = 1.0;
// 		this._nodesGlobalSizeBase = 0.0;

// 		this._edgesGlobalOpacityScale = 1.0;
// 		this._edgesGlobalOpacityBase = 0.0;
		
// 		this._edgesGlobalWidthScale = 0.25;
// 		this._edgesGlobalWidthBase = 0.0;
		
// 		this._nodesGlobalOutlineWidthScale = 1.0;
// 		this._nodesGlobalOutlineWidthBase = 0.0;


// 		this._nodesCapacity = 100;
// 		this._edgesCapacity = 100;


// 		this.nodesBuffers = {};
// 		this.edgesBuffers = {};

// 		this.nodesData = {};
// 		this.edgesData = {};

// 		this.nodesHintDynamic = {};
// 		this.edgesHintDynamic = {};

// 		this.nodesTransforms = [];
// 		this.edgesTransforms = [];
// 		// transform(node)
// 		// filter(node) 
// 		// Data transformer, Filter, sort, duplication
// 	}

// 	_buildNodesGeometry() {
// 		let gl = this.gl;
// 		this.nodesPositionBuffer = gl.createBuffer();
// 		this.nodesColorBuffer = gl.createBuffer();
// 		this.nodesSizeBuffer = gl.createBuffer();
// 		this.nodesOutlineWidthBuffer = gl.createBuffer();
// 		this.nodesOutlineColorBuffer = gl.createBuffer();
// 		this.nodesIndexBuffer = gl.createBuffer();
// 	}


// }
