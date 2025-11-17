import * as glm from "gl-matrix"
import * as glUtils from "../utilities/webgl.js"
import * as d3Chromatic from "d3-scale-chromatic"
import { rgb as d3rgb } from "d3-color"
import { scaleOrdinal as d3ScaleOrdinal, scaleSequential as d3ScaleSequential } from "d3-scale"
import * as densityShaders from "../shaders/density.js"

/**
 * An density layer that displays the density of a cloud of points
 */
export class Density {
	//the class constructor
	/**
	 * constructor description
	 * @param {WebGLRenderingContext} gl - the webgl rendering context
	 * @param {object} options - the options object
	 * @param {number} options.width - the width of the canvas
	 * @param {number} options.height - the height of the canvas
	 */
	constructor(gl, options = {}){
		this.gl = gl;
		this.initialize();
	}


	initialize() {
	}

	createFramebuffers(){

	}

	createShaders(){

	}

	createBuffers(){

	}

	resize(width, height){

	}

	update(){

	}

	centers(){

	}

	weights(){

	}

}