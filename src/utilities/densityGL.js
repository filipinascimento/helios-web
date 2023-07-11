
import * as glm from "gl-matrix"
import {makeOrtho, Matrix} from "sylvester-es6"
import * as d3Chromatic from "d3-scale-chromatic"
import { rgb as d3rgb } from "d3-color"
import { scaleOrdinal as d3ScaleOrdinal, scaleSequential as d3ScaleSequential } from "d3-scale"
import * as glUtils from "../utilities/webgl.js"
import * as densityShaders from "../shaders/density.js"





function getShader(gl, code, type) {
    let shader = gl.createShader(type);
    gl.shaderSource(shader, code);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.log(gl.getShaderInfoLog(shader));
        return null;
    }
    return shader;
}


function createShader(gl) {
    //let fragmentShader = getShader(gl, "shader-fs");
    //let vertexShader =   getShader(gl,   "shader-vs");
    let fragmentShader = getShader(gl, densityShaders.fragmentShader, gl.FRAGMENT_SHADER);
    let vertexShader = getShader(gl, densityShaders.vertexShader, gl.VERTEX_SHADER);

    let program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
    }
    gl.useProgram(program);
    program.vertexPositionAttribute = gl.getAttribLocation(program, "position");
    program.vertexKernelWeightAttribute = gl.getAttribLocation(program, "kernel_weight");
    program.vertexOffsetAttribute = gl.getAttribLocation(program, "offset");

    program.pMatrixUniform = gl.getUniformLocation(program, "uPMatrix");
    program.mvMatrixUniform = gl.getUniformLocation(program, "uMVMatrix");
    program.projectionMatrixUniform = gl.getUniformLocation(program, "projectionMatrix");
	program.viewMatrixUniform = gl.getUniformLocation(program, "viewMatrix");
	
    program.bandwidthUniform = gl.getUniformLocation(program, "bandwidth");
    program.bandwidthScaleUniform = gl.getUniformLocation(program, "bandwidthScale");
    program.kernel_weightScaleUniform = gl.getUniformLocation(program, "kernel_weightScale");

    return program;
}

function createShader2Dlut(gl) {
    //    let frags = getShader(gl, "shader-tex-lut-frag");
    //    let verts = getShader(gl, "shader-tex-lut-vert");
    let frags = getShader(gl, densityShaders.textureFragmentShader, gl.FRAGMENT_SHADER);
    let verts = getShader(gl, densityShaders.textureVertexShader, gl.VERTEX_SHADER);

    let program = gl.createProgram();
    gl.attachShader(program, verts);
    gl.attachShader(program, frags);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        alert("Could not initialise shaders");
    }
    gl.useProgram(program);
    program.vertexAttribute = gl.getAttribLocation(program, "vertex");
    program.texCoordAttribute = gl.getAttribLocation(program, "texCoord");
    //gl.enableVertexAttribArray(program.vertexAttribute);
    //gl.enableVertexAttribArray(program.texCoordAttribute);

    program.pMatrixUniform = gl.getUniformLocation(program, "uPMatrix");
    program.mvMatrixUniform = gl.getUniformLocation(program, "uMVMatrix");
    program.input_texUniform = gl.getUniformLocation(program, "input_tex");
    program.lut_texUniform = gl.getUniformLocation(program, "lut_tex");
	program.divergingUniform = gl.getUniformLocation(program, "diverging");
    return program;
}


function log_it(what) {
    console.log(what);
}


export class DensityGL {
	constructor(gl,width,height,qualityScale=0.10) {
		this.gl = gl;
		this.FBO;
		this.lutShader;
		this.shaderProgram;
		this.mvMatrix;
		this.pMatrix;
		this.qualityScale=qualityScale;
		this._divergingColormap = false;


		this.bandwidth = [5.5, 5.5];
		this.bandwidthScale = 5.0;
		this.kernel_weightScale = 0.5;

		this.triangleVertexPositionBuffer;
		this.squareVertexPositionBuffer;

		this.PANEL_TEX_COORDS = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
		this.PANEL_TEX_POS = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0];
		this.QUAD_POS_BUFFER;
		this.QUAD_COORD_BUFFER;
		this.LUT_TEX;

		// DATASET Related:
		this.DATA = null;
		this.kernel_weights = null;

		this.resize(width,height)

		this.shaderProgram = createShader(this.gl);
		this.lutShader = createShader2Dlut(this.gl);
		this.initBuffers();

		// this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
		// this.gl.clearDepth(1.0)
		// this.gl.disable(this.gl.DEPTH_TEST);

		this.setColormap();
	}



	loadIdentity() {
		this.mvMatrix = Matrix.I(4);
	}

	multMatrix(m) {
		this.mvMatrix = this.mvMatrix.x(m);
	}

	mvScale(s) {
		this.mvMatrix.elements[0][0] *= s[0];
		this.mvMatrix.elements[0][1] *= s[0];
		this.mvMatrix.elements[0][2] *= s[0];
		this.mvMatrix.elements[0][3] *= s[0];

		this.mvMatrix.elements[1][0] *= s[1];
		this.mvMatrix.elements[1][1] *= s[1];
		this.mvMatrix.elements[1][2] *= s[1];
		this.mvMatrix.elements[1][3] *= s[1];

		this.mvMatrix.elements[2][0] *= s[2];
		this.mvMatrix.elements[2][1] *= s[2];
		this.mvMatrix.elements[2][2] *= s[2];
		this.mvMatrix.elements[2][3] *= s[2];
	}

	mvTranslate(v) {
		var m = Matrix.Translation($V([v[0], v[1], v[2]])).ensure4x4();
		this.multMatrix(m);
	}

	perspective(fovy, aspect, znear, zfar) {
		this.pMatrix = makePerspective(fovy, aspect, znear, zfar);
	}

	ortho(xmin, xmax, ymin, ymax) {
		this.pMatrix = makeOrtho(xmin, xmax, ymin, ymax, -1, 1);
	}

	setMatrixUniforms(program) {
		this.gl.uniformMatrix4fv(program.pMatrixUniform, false, new Float32Array(this.pMatrix.flatten()));
		this.gl.uniformMatrix4fv(program.mvMatrixUniform, false, new Float32Array(this.mvMatrix.flatten()));
	}

	initBuffers() {
		let gl = this.gl;
		this.triangleVertexPositionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.triangleVertexPositionBuffer);
		var vertices = [
			0.0, 1.0, 0.0, -1.0, -1.0, 0.0,
			1.0, -1.0, 0.0
		];
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
		this.triangleVertexPositionBuffer.itemSize = 3;
		this.triangleVertexPositionBuffer.numItems = 3;

		this.squareVertexPositionBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.squareVertexPositionBuffer);
		vertices = [
			1.0, 1.0, 0.0, -1.0, 1.0, 0.0,
			1.0, -1.0, 0.0, -1.0, -1.0, 0.0
		];
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
		this.squareVertexPositionBuffer.itemSize = 3;
		this.squareVertexPositionBuffer.numItems = 4;

		this.QUAD_POS_BUFFER = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.QUAD_POS_BUFFER);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.PANEL_TEX_POS), gl.STATIC_DRAW);
		this.QUAD_POS_BUFFER.itemSize = 2;
		this.QUAD_POS_BUFFER.numItems = 6;

		this.QUAD_COORD_BUFFER = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, this.QUAD_COORD_BUFFER);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.PANEL_TEX_COORDS), gl.STATIC_DRAW);
		this.QUAD_COORD_BUFFER.itemSize = 2;
		this.QUAD_COORD_BUFFER.numItems = 6;

		this.nodesGeometry = glUtils.makePlane(gl, false, false);
		
	}


	drawScene(projectionMatrix,viewMatrix) {
		let w = this.width;
		let h = this.height;

		let gl = this.gl;

		let ext = gl.getExtension("ANGLE_instanced_arrays");
		//current framebuffer
		let currentFBO = gl.getParameter(gl.FRAMEBUFFER_BINDING);

		//currentViewport
		let currentViewport = gl.getParameter(gl.VIEWPORT);

		gl.viewport(0, 0, w*this.qualityScale, h*this.qualityScale);
		this.ortho(0, w, h, 0);
		this.loadIdentity();

		this.projectionMatrix = projectionMatrix;
		this.viewMatrix = viewMatrix;

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.FBO.id);
		gl.clearColor(0.0, 0.0, 0.0, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE);

		gl.useProgram(this.shaderProgram);
		this.setMatrixUniforms(this.shaderProgram);
		
		//gl.uniform2f(shaderProgram.bandwidthUniform, bandwidth );
		gl.uniform1f(this.shaderProgram.bandwidthScaleUniform, this.bandwidthScale);
		
		// console.log(this.projectionMatrix)
		gl.uniformMatrix4fv(this.shaderProgram.viewMatrixUniform,false, this.viewMatrix);
		gl.uniformMatrix4fv(this.shaderProgram.projectionMatrixUniform, false, this.projectionMatrix)
		gl.uniform2f(this.shaderProgram.bandwidthUniform, this.bandwidth[0], this.bandwidth[1]);
		gl.uniform1f(this.shaderProgram.kernel_weightScaleUniform, this.kernel_weightScale);

		gl.enableVertexAttribArray(this.shaderProgram.vertexPositionAttribute);
		gl.enableVertexAttribArray(this.shaderProgram.vertexKernelWeightAttribute);
		gl.enableVertexAttribArray(this.shaderProgram.vertexOffsetAttribute);


		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesGeometry.vertexObject);
		gl.vertexAttribPointer(this.shaderProgram.vertexOffsetAttribute, 3, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(this.shaderProgram.vertexOffsetAttribute, 0);


		gl.bindBuffer(gl.ARRAY_BUFFER, this.kernelWeightsBuffer);
		gl.vertexAttribPointer(this.shaderProgram.vertexKernelWeightAttribute, 1, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(this.shaderProgram.vertexKernelWeightAttribute, 1);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionsBuffer);
		gl.vertexAttribPointer(this.shaderProgram.vertexPositionAttribute, this.positionsBuffer.itemSize, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(this.shaderProgram.vertexPositionAttribute, 1);

		// for (let i = 0; i < this.BUFFER_LIST.length; i += 1) {
			// let buffer = this.BUFFER_LIST[i];


			
			// gl.drawArrays(gl.TRIANGLES, 0, buffers[0].numItems);
			
			// gl.bindBuffer(gl.ARRAY_BUFFER, buffers[1]);
			// gl.vertexAttribPointer(this.shaderProgram.vertexOffsetAttribute, buffers[1].itemSize, gl.FLOAT, false, 0, 0);
			// gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			if (this.nodesGeometry.indexObject) {
				ext.drawElementsInstancedANGLE(gl.TRIANGLES, this.nodesGeometry.numIndices, this.nodesGeometry.indexType, 0, this.positionsBuffer.numItems);
			} else {
				ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, this.nodesGeometry.numIndices, this.positionsBuffer.numItems);
			}
			ext.vertexAttribDivisorANGLE(this.shaderProgram.vertexPositionAttribute, 0);
			ext.vertexAttribDivisorANGLE(this.shaderProgram.vertexKernelWeightAttribute, 0);
			
		// }
		gl.bindFramebuffer(gl.FRAMEBUFFER, currentFBO);
		gl.disableVertexAttribArray(this.shaderProgram.vertexPositionAttribute);
		gl.disableVertexAttribArray(this.shaderProgram.vertexKernelWeightAttribute);
		gl.disableVertexAttribArray(this.shaderProgram.vertexOffsetAttribute);
		gl.disable(gl.BLEND);
		
		gl.viewport(currentViewport[0], currentViewport[1], currentViewport[2], currentViewport[3]);
		//*
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, this.FBO.tex);
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, this.LUT_TEX);

		gl.useProgram(this.lutShader);
		gl.enableVertexAttribArray(this.lutShader.vertexAttribute);
		gl.enableVertexAttribArray(this.lutShader.texCoordAttribute);
		gl.uniform1i(this.lutShader.input_texUniform, 0);
		gl.uniform1i(this.lutShader.lut_texUniform, 1);
		gl.uniform1f(this.lutShader.divergingUniform, +this._divergingColormap);
		this.ortho(0, 1, 0, 1);
		this.loadIdentity();
		this.setMatrixUniforms(this.lutShader);

		gl.bindBuffer(gl.ARRAY_BUFFER, this.QUAD_POS_BUFFER);
		gl.vertexAttribPointer(this.lutShader.vertexAttribute, this.QUAD_POS_BUFFER.itemSize, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.QUAD_COORD_BUFFER);
		gl.vertexAttribPointer(this.lutShader.texCoordAttribute, this.QUAD_COORD_BUFFER.itemSize, gl.FLOAT, false, 0, 0);
		
		gl.drawArrays(gl.TRIANGLES, 0, this.QUAD_POS_BUFFER.numItems);
		gl.disableVertexAttribArray(this.lutShader.vertexAttribute);
		gl.disableVertexAttribArray(this.lutShader.texCoordAttribute);
		//*/
	}

	resize(width, height, force = false){
		// if properties are not the same, resize the canvas
		if (this.width !== width || this.height !== height || force) {
			if(width>0){
				this.width = width;
			}
			if(height>0){
				this.height = height;
			}
			this.deleteFBO();
			this.create_FBO();
		}
	}

	create_FBO() {
		let fboWidth = this.width*this.qualityScale;
		let fboHeight = this.height*this.qualityScale;
		let gl = this.gl;

		try {
			var FloatingPointTextureExtensionSupported = gl.getExtension("OES_texture_float");
			var FloatingPointTextureExtensionSupportedLinear = gl.getExtension("OES_texture_float_linear");
		} catch (err) {
			var FloatingPointTextureExtensionSupported = false;
			var FloatingPointTextureExtensionSupportedLinear = false;
		}

		let FBO = {};
		FBO.id = gl.createFramebuffer();
		FBO.tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, FBO.tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		//FloatingPointTextureExtensionSupported = false;
		if (FloatingPointTextureExtensionSupported && FloatingPointTextureExtensionSupportedLinear) {
			log_it("[ OK ] Floating point textures (OES_texture_float) is supported");
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fboWidth, fboHeight, 0, gl.RGBA, gl.FLOAT, null);
		} else {
			log_it("[FAIL] Floating point textures (OES_texture_float) is <B>NOT</B> supported, falling back to 8 bit blending. OES_texture_float is supported in Chrome dev version.");
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, fboWidth, fboHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, FBO.id);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, FBO.tex, 0);

		let res = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		if (res == gl.FRAMEBUFFER_COMPLETE)
			log_it("[ OK ] Framebuffer Initialization");
		else if (res == gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT)
			log_it("[FAIL] Framebuffer Creation FAIL GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT <br/> \
              Not all framebuffer attachment points are framebuffer attachment complete.");
		else if (res == gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS)
			log_it("[FAIL] Framebuffer Creation FAIL GL_FRAMEBUFFER_INCOMPLETE_DIMENSIONS <br/> \
              Not all attached images have the same width and height. ");
		else if (res == gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT)
			log_it("[FAIL] Framebuffer Creation FAIL GL_FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT <br/> No images are attached to the framebuffer. ");
		else if (res == gl.FRAMEBUFFER_INCOMPLETE_UNSUPPORTED)
			log_it("[FAIL] Framebuffer Creation FAIL GL_FRAMEBUFFER_INCOMPLETE_UNSUPPORTED <br/> The combination of internal formats of the attached images violates an implementation-dependent set of restrictions.");
		else if (res == gl.FRAMEBUFFER_UNSUPPORTED)
			log_it("[FAIL] Framebuffer Creation FAIL GL_FRAMEBUFFER_UNSUPPORTED <br/> \
            The combination of internal formats of the attached images violates an implementation-dependent set of restrictions.");
		else log_it("[FAIL] Framebuffer Creation FAIL Unknown Error");

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		this.FBO = FBO;
	}

	deleteFBO() {
		if(this.FBO){
			let gl = this.gl;
			gl.deleteFramebuffer(this.FBO.id);
			gl.deleteTexture(this.FBO.tex);
		}
	}

	setBandwidth(value) {
		this.bandwidthScale = value;
	}

	setKernelWeightScale(value) {
		this.kernel_weightScale = value;
	}


	setColormap(interpolateFunction, colorCount = 0) {
		self = this;
		let gl = this.gl;
		let colormapTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, colormapTexture);
		if (colorCount <= 0) {
			colorCount = 1024;
		}
		if (!interpolateFunction) {
			interpolateFunction = d3Chromatic.interpolateInferno;
			// interpolateFunction = d3Chromatic.interpolateCividis;
			// interpolateFunction = d3Chromatic.interpolateGreys;
			// interpolateFunction = d3Chromatic.interpolateGreens;
			
		}
		var colormapValues = new Uint8Array(colorCount * 4);
		for (let i = 0; i < colorCount; i++) {
			let scale = i / (colorCount - 1);
			let rgbColor = d3rgb(interpolateFunction(scale));

			colormapValues[i * 4 + 0] = rgbColor.r;
			colormapValues[i * 4 + 1] = rgbColor.g;
			colormapValues[i * 4 + 2] = rgbColor.b;
			colormapValues[i * 4 + 3] = 0.1;
		}

		//gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, colorCount, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colormapValues);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.bindTexture(gl.TEXTURE_2D, null);
		this.LUT_TEX = colormapTexture;
	}



	setData(newData) {
		this.DATA = newData;
		this.updateTheDatabuffer();

	}

	setWeights(newWeights){
		this.kernel_weights = newWeights;
		this.updateTheKernelWeightsBuffer();
		// console.log(newWeights);
	}


	update_span() {
		let xmin,ymin;
		let xmax,ymax;
		xmin = ymin = 9999999999999;
		xmax = ymax = -9999999999999;
		for (let i = 0; i < this.DATA.length; i += 1) {
			let x = this.DATA[i][0];
			let y = this.DATA[i][1];
			xmin = Math.min(xmin, x);
			xmax = Math.max(xmax, x);
			ymin = Math.min(ymin, y);
			ymax = Math.max(ymax, y);
		}
		//this.bandwidth[0] = (xmax - xmin) * 0.075;
		//this.bandwidth[1] = (ymax - ymin) * 0.075;
		// Please excuse this magic 100
		//this.kernel_weightScale = 100.0 / this.DATA.length;
	}



	updateTheDatabuffer() {
		let gl = this.gl;

		// var flat_array = [];
		// for (let i = 0; i < this.DATA.length; i += 1) {
		// 	let offset = i * 3;
		// 	let offset_offsets = i * 12;
		// 	flat_array[offset + 0] = this.DATA[i][0];
		// 	flat_array[offset + 1] = this.DATA[i][1];
		// 	flat_array[offset + 2] = 0.0;
		// }

		if(!this.positionsBuffer){
			this.positionsBuffer = gl.createBuffer();
			this.positionsBuffer.itemSize = 3;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, this.positionsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.DATA, gl.DYNAMIC_DRAW);
		this.positionsBuffer.numItems = this.DATA.length / 3;

		// this.BUFFER_LIST.pop();
		// this.BUFFER_LIST.push(scatter_vertices);
		this.update_span();
	}


	updateTheKernelWeightsBuffer() {
		let gl = this.gl;
		
		if(!this.kernelWeightsBuffer){
			this.kernelWeightsBuffer = gl.createBuffer();
			this.kernelWeightsBuffer.itemSize = 1;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.kernelWeightsBuffer);
		// if
		gl.bufferData(gl.ARRAY_BUFFER, this.kernel_weights, gl.DYNAMIC_DRAW);
		this.kernelWeightsBuffer.numItems = this.kernel_weights.length;

		// this.BUFFER_LIST.pop();
		// this.BUFFER_LIST.push(scatter_vertices);
		// this.update_span();
	}
	
	qualityScale(value) {
		// return quality scale if value is not provided otherwise set the quality scale
		if (value === undefined) {
			return this.quality_scale;
		}
		if(this.quality_scale!=value){
			this.quality_scale = value;
			this.resize(0,0,true);
		}

		return this;
	}

	divergingColormap(value) {
		// return quality scale if value is not provided otherwise set the quality scale
		if (value === undefined) {
			return this._divergingColormap;
		}
		if(this._divergingColormap!=value){
			this._divergingColormap = value;
			console.log("DIVERGING COLORMAP",value);
		}
		return this;
	}

	cleanup() {
		let gl = this.gl;
		gl.deleteBuffer(this.positionsBuffer);
		gl.deleteBuffer(this.kernelWeightsBuffer);
		gl.deleteTexture(this.LUT_TEX);
		gl.deleteProgram(this.program);
		gl.deleteFramebuffer(this.framebuffer);
		gl.deleteRenderbuffer(this.renderbuffer);
		gl.deleteTexture(this.texture);
		// gl.deleteVertexArray(this.vao);

		this.positionsBuffer = null;
		this.kernelWeightsBuffer = null;
		this.LUT_TEX = null;
		this.program = null;
		this.framebuffer = null;
		this.renderbuffer = null;
		this.texture = null;
		// this.vao = null;

		this.DATA = null;
		this.kernel_weights = null;
		this.BUFFER_LIST = null;

		this.gl = null;
	}

}