import * as glm from "gl-matrix"
import { Network } from "./Network"
import * as glUtils from "../utils/webglutils"
import * as xnet from "../utils/xnet"
import { select as d3Select } from "d3-selection";
import { zoom as d3Zoom, zoomTransform as d3ZoomTransform, zoomIdentity as d3ZoomIdentity } from "d3-zoom";
import { drag as d3Drag } from "d3-drag";
import { default as createGraph } from "ngraph.graph"
import { default as createLayout } from "ngraph.forcelayout"
import { forceSimulation, forceManyBody, forceLink, forceCenter } from "d3-force-3d";


// You can associate arbitrary objects with node:


// //dictionary
// elementID,
// nodes = {},
// edges = [],
// // use settings
// // displayOptions inside settings
// onNodeClick = null,
// onEdgeClick = null,
// display = [],
export class Helios {
	constructor({
		elementID,
		nodes = {},
		edges = [],
		// use settings
		// displayOptions inside settings
		// onNodeHover = null,
		// onEdgeHover = null,
		// onDraw  (Maybe)

		display = [],
	}) {
		this.element = document.getElementById(elementID);
		this.element.innerHTML = '';
		this.canvasElement = document.createElement("canvas");
		this.element.appendChild(this.canvasElement);
		this.network = new Network(nodes, edges);
		this.display = display;

		this.rotationMatrix = glm.mat4.create();
		this.translatePosition = glm.vec3.create();
		this.mouseDown = false;
		this.lastMouseX = null;
		this.lastMouseY = null;
		this.redrawingFromMouseWheelEvent = false;
		this.fastEdges = false;
		this.animate = false;
		this.cameraDistance = 1;
		this.zoomFactor = 1;
		this.rotateLinearX = 0;
		this.rotateLinearY = 0;
		this.saveResolutionRatio = 1.0;
		this.pickingResolutionRatio = 0.25;
		this._edgesIntensity = 1.0;



		glm.mat4.identity(this.rotationMatrix);
		var translatePosition = [0, 0, 0];
		this.gl = glUtils.createWebGLContext(this.canvasElement, {
			antialias: true,
			powerPreference: "high-performance",
			desynchronized: true
		});

		console.log(this.gl);
		this.initialize();
		window.onresize = event => {
			this.willResizeEvent(event);
		};

		this.onNodeClickCallback = null;
		this.onNodeHoverStartCallback = null;
		this.onNodeHoverMoveCallback = null;
		this.onNodeHoverEndCallback = null;
		// this.onEdgeClickCallback = null;
		this.onZoomCallback = null;
		this.onRotationCallback = null;
		this.onResizeCallback = null;
		this.onLayoutStartCallback = null;
		this.onLayoutFinishCallback = null;
		this.onDrawCallback = null;
		this._backgroundColor = [0.5, 0.5, 0.5, 1.0];
	}

	// d3-like function Set/Get
	//zoom()
	//rotate()
	//pan()
	//highlightNodes()
	//centerNode()





	async initialize() {
		await this._setupShaders();
		await this._buildGeometry();
		await this._buildPickingBuffers();
		await this._buildEdgesGeometry();
		await this.willResizeEvent(0);

		await this._setupCamera();
		await this._setupEvents();
		await this._setupLayout();

		await this.redraw();
	}

	_setupLayout() {

		// this.layoutWorker = new Worker(new URL('../layouts/ngraphLayoutWorker.js', import.meta.url));
		this.layoutWorker = new Worker(new URL('../layouts/d3force3dLayoutWorker.js', import.meta.url));
		this.newPositions = this.network.positions.slice(0);
		this.positionInterpolator = null;
		this.layoutWorker.onmessage = (msg) => {
			if (msg.data.type == "layoutStep") {
				this.newPositions = msg.data.positions;
				// let newPositions = msg.data.positions;
				// for (let index = 0; index < this.network.positions.length; index++) {
				// 	this.network.positions[index] = newPositions[index];
				// };
				// requestAnimationFrame(()=>{	
				// 	this._updateGeometry();
				// 	this._updateEdgesGeometry();
				// 	this.redraw();
				// });
				// console.log("receiving positions...");
				if (this.positionInterpolator == null) {
					let maxDisplacement = 0;
					for (let index = 0; index < this.network.positions.length; index++) {
						let displacement = this.newPositions[index] - this.network.positions[index];
						maxDisplacement = Math.max(Math.abs(displacement), maxDisplacement);
					};
					if (maxDisplacement > 1) {
						// console.log("Interpolator Started...");
						this.onLayoutStartCallback?.();
						this.positionInterpolator = setInterval(() => {
							let maxDisplacement = 0;
							for (let index = 0; index < this.network.positions.length; index++) {
								let displacement = this.newPositions[index] - this.network.positions[index];
								this.network.positions[index] += 0.025 * (displacement);
								maxDisplacement = Math.max(Math.abs(displacement), maxDisplacement);
							};
							this._updateGeometry();
							this._updateEdgesGeometry();
							requestAnimationFrame(() => {
								this.redraw();
							});
							if (maxDisplacement < 1) {
								// console.log("Interpolator Stopped...");
								this.onLayoutFinishCallback?.();
								clearInterval(this.positionInterpolator);
								this.positionInterpolator = null;
							}
						}, 1000 / 60);
					}
				}
			} else {
				console.log("Received message", msg);
			}
		}
		this.layoutWorker.postMessage({ type: "import", location: import.meta.url });
		this.layoutWorker.postMessage({ type: "init", network: this.network });
	}


	_setupEvents() {
		this.lastMouseX = -1;
		this.lastMouseY = -1;

		this.currentHoverIndex = -1;

		this.canvasElement.onclick = e => {
			const rect = this.canvasElement.getBoundingClientRect();

			this.lastMouseX = e.clientX;
			this.lastMouseY = e.clientY;
			const nodeID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
			if (nodeID >= 0) {
				this.onNodeClickCallback?.(this.network.nodes[this.network.index2node[nodeID]], e);
			}
		};

		this.canvasElement.addEventListener('mousemove', (event) => {
			this.lastMouseX = event.clientX;
			this.lastMouseY = event.clientY;
			this.triggerHoverEvents(event);
		});

		this.canvasElement.addEventListener('mouseout', (e) => {
			if (this.currentHoverIndex >= 0) {
				this.onNodeHoverEndCallback?.(this.network.nodes[this.network.index2node[this.currentHoverIndex]], e);
				this.currentHoverIndex = -1;
				// this.lastMouseX = -1;
				// this.lastMouseY = -1;
			}
		});
	}

	pickPoint(x, y) {
		const fbWidth = this.canvasElement.width * this.pickingResolutionRatio;
		const fbHeight = this.canvasElement.height * this.pickingResolutionRatio;
		const pixelX = x * fbWidth / this.canvasElement.clientWidth;
		const pixelY = fbHeight - y * fbHeight / this.canvasElement.clientHeight - 1;
		const data = new Uint8Array(4);
		let gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
		gl.readPixels(
			Math.round(pixelX),            // x
			Math.round(pixelY),            // y
			1,                 // width
			1,                 // height
			gl.RGBA,           // format
			gl.UNSIGNED_BYTE,  // type
			data);             // typed array to hold result
		const id = (data[0] + (data[1] << 8) + (data[2] << 16) + (data[3] << 24)) - 1;
		return id;
	}

	triggerHoverEvents(event) {
		const rect = this.canvasElement.getBoundingClientRect();
		const nodeID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
		if (nodeID >= 0 && this.currentHoverIndex == -1) {
			this.currentHoverIndex = nodeID;
			this.onNodeHoverStartCallback?.(this.network.nodes[this.network.index2node[nodeID]], event);
		} else if (nodeID >= 0 && this.currentHoverIndex == nodeID) {
			this.onNodeHoverMoveCallback?.(this.network.nodes[this.network.index2node[nodeID]], event);
		} else if (nodeID >= 0 && this.currentHoverIndex != nodeID) {
			this.onNodeHoverEndCallback?.(this.network.nodes[this.network.index2node[this.currentHoverIndex]], event);
			this.currentHoverIndex = nodeID;
			this.onNodeHoverStartCallback?.(this.network.nodes[this.network.index2node[nodeID]], event);
		} else if (nodeID == -1 && this.currentHoverIndex != nodeID) {
			this.onNodeHoverEndCallback?.(this.network.nodes[this.network.index2node[this.currentHoverIndex]], event);
			this.currentHoverIndex = -1;
		}
	}
	async _setupShaders() {
		// let edgesShaderVertex = await glUtils.getShader(this.gl, "edges-vertex");
		// let edgesShaderFragment = await glUtils.getShader(this.gl, "edges-fragment");
		let edgesShaderVertex = await glUtils.getShaderFromURL(this.gl, new URL('../shaders/edges.vsh', import.meta.url), this.gl.VERTEX_SHADER)
		let edgesShaderFragment = await glUtils.getShaderFromURL(this.gl, new URL('../shaders/edges.fsh', import.meta.url), this.gl.FRAGMENT_SHADER) //gl.FRAGMENT_SHADER or 



		this.edgesShaderProgram = new glUtils.ShaderProgram(
			edgesShaderVertex,
			edgesShaderFragment,
			["projectionViewMatrix", "nearFar", "linesIntensity"],
			["vertex", "color"],
			this.gl);

		//Initializing vertices shaders
		// let verticesShaderVertex = await glUtils.getShader(this.gl, "vertices-vertex");
		// let verticesShaderFragment = await glUtils.getShader(this.gl, "vertices-fragment");
		// let pickingShaderFragment = await glUtils.getShader(this.gl, "vertices-fragment-picking");

		let verticesShaderVertex = await glUtils.getShaderFromURL(this.gl, new URL('../shaders/vertices.vsh', import.meta.url), this.gl.VERTEX_SHADER)
		let verticesShaderFragment = await glUtils.getShaderFromURL(this.gl, new URL('../shaders/vertices.fsh', import.meta.url), this.gl.FRAGMENT_SHADER) //gl.FRAGMENT_SHADER or 
		let pickingShaderFragment = await glUtils.getShaderFromURL(this.gl, new URL('../shaders/verticesPicking.fsh', import.meta.url), this.gl.FRAGMENT_SHADER) //gl.FRAGMENT_SHADER or 

		this.verticesShaderProgram = new glUtils.ShaderProgram(verticesShaderVertex, verticesShaderFragment,
			["viewMatrix", "projectionMatrix", "normalMatrix"],
			["vertex", "position", "color", "intensity", "scale", "encodedIndex"], this.gl);

		this.verticesPickingShaderProgram = new glUtils.ShaderProgram(verticesShaderVertex, pickingShaderFragment,
			["viewMatrix", "projectionMatrix", "normalMatrix"],
			["vertex", "position", "color", "intensity", "scale", "encodedIndex"], this.gl);

	}

	async _buildGeometry() {
		let gl = this.gl;
		let sphereQuality = 15;
		// this.nodesGeometry = glUtils.makeSphere(gl, 1.0, sphereQuality, sphereQuality);
		this.nodesGeometry = glUtils.makePlane(gl, false, false);
		// //vertexShape = makeBox(gl);



		this.nodesPositionBuffer = gl.createBuffer();
		this.nodesColorBuffer = gl.createBuffer();
		this.nodesScaleBuffer = gl.createBuffer();
		this.nodesIntensityBuffer = gl.createBuffer();
		this.nodesIndexBuffer = gl.createBuffer();

		//encodedIndex
		this.nodesIndexArray = new Float32Array(this.network.index2node.length * 4);
		for (let id = 0; id < this.network.index2node.length; id++) {
			this.nodesIndexArray[4 * id] = (((id + 1) >> 0) & 0xFF) / 0xFF;
			this.nodesIndexArray[4 * id + 1] = (((id + 1) >> 8) & 0xFF) / 0xFF;
			this.nodesIndexArray[4 * id + 2] = (((id + 1) >> 16) & 0xFF) / 0xFF;
			this.nodesIndexArray[4 * id + 3] = (((id + 1) >> 24) & 0xFF) / 0xFF;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIndexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.nodesIndexArray, gl.STATIC_DRAW);
		console.log(this.nodesIndexArray)

		await this._updateGeometry();
	}
	async _buildPickingBuffers() {
		let gl = this.gl;
		this.pickingTargetTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, this.pickingTargetTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.pickingDepthBuffer = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickingDepthBuffer);

		this.setFramebufferAttachmentSizes = (width, height) => {
			gl.bindTexture(gl.TEXTURE_2D, this.pickingTargetTexture);
			// define size and format of level 0
			const level = 0;
			const internalFormat = gl.RGBA;
			const border = 0;
			const format = gl.RGBA;
			const type = gl.UNSIGNED_BYTE;
			const data = null;
			const fbWidth = Math.round(width * this.pickingResolutionRatio);
			const fbHeight = Math.round(height * this.pickingResolutionRatio);
			gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
				fbWidth, fbHeight, border, format, type, data);
			gl.bindRenderbuffer(gl.RENDERBUFFER, this.pickingDepthBuffer);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fbWidth, fbHeight);
		};

		// Create and bind the framebuffer
		this.pickingFramebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);

		// attach the texture as the first color attachment
		const attachmentPoint = gl.COLOR_ATTACHMENT0;
		const level = 0;
		gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, this.pickingTargetTexture, level);

		// make a depth buffer and the same size as the targetTexture
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.pickingDepthBuffer);

	}

	async _updateGeometry() {
		let gl = this.gl;

		let positions = this.network.positions;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesPositionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

		let colors = this.network.colors;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesColorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

		let scales = this.network.scales;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesScaleBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, scales, gl.STATIC_DRAW);

		let intensities = this.network.intensities;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIntensityBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, intensities, gl.STATIC_DRAW);


		// //Depth test is essential for the desired effects

		gl.enable(gl.DEPTH_TEST);
		// gl.disable(gl.CULL_FACE);
		// gl.frontFace(gl.CCW);

	}

	async _buildEdgesGeometry() {
		let gl = this.gl;
		let edges = this.network.indexedEdges;
		let positions = this.network.positions;
		let colors = this.network.colors;

		let newGeometry = new Object();
		let indicesArray;

		//FIXME: If num of vertices > 65k, we need to store the geometry in two different indices objects
		if (positions.length < 64000) {
			indicesArray = new Uint16Array(edges);
			newGeometry.indexType = gl.UNSIGNED_SHORT;
		} else {
			var uints_for_indices = gl.getExtension("OES_element_index_uint");
			if (uints_for_indices == null) {
				indicesArray = new Uint16Array(edges);
				newGeometry.indexType = gl.UNSIGNED_SHORT;
			} else {
				indicesArray = new Uint32Array(edges);
				newGeometry.indexType = gl.UNSIGNED_INT;
			}
		}

		// create the lines buffer 2 vertices per geometry.
		newGeometry.vertexObject = gl.createBuffer();
		newGeometry.colorObject = gl.createBuffer();
		newGeometry.numIndices = indicesArray.length;
		newGeometry.indexObject = gl.createBuffer();

		this.edgesGeometry = newGeometry;
		this.indicesArray = indicesArray;
		await this._updateEdgesGeometry()
	}

	async _updateEdgesGeometry() {
		let gl = this.gl;
		let edges = this.network.indexedEdges;
		let positions = this.network.positions;
		let colors = this.network.colors;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.vertexObject);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.colorObject);
		gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgesGeometry.indexObject);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indicesArray, gl.STREAM_DRAW);

	}

	async resizeGL(newWidth, newHeight) {
		this.setFramebufferAttachmentSizes(newWidth, newHeight);
		window.requestAnimationFrame(() => this.redraw());
	}


	async _setupCamera() {
		// this.canvasElement.onmousedown = event=>this.handleMouseDown(event);
		// document.onmouseup = event=>this.handleMouseUp(event);
		// document.onmousemove = event=>this.handleMouseMove(event);
		// document.onclick = void(0);

		this.zoom = d3Zoom().on("zoom", event => {
			this.zoomFactor = 1.0 / event.transform.k;
			if (!this.positionInterpolator) {
				window.requestAnimationFrame(() => this.redraw());
			}
			event => event.preventDefault();
		})
		this.drag = d3Drag().on("drag", event => {
			let newRotationMatrix = glm.mat4.create();

			glm.mat4.identity(newRotationMatrix);
			glm.mat4.rotate(newRotationMatrix, newRotationMatrix, glUtils.degToRad(event.dx / 2), [0, 1, 0]);
			glm.mat4.rotate(newRotationMatrix, newRotationMatrix, glUtils.degToRad(event.dy / 2), [1, 0, 0]);

			glm.mat4.multiply(this.rotationMatrix, newRotationMatrix, this.rotationMatrix);
			if (!this.positionInterpolator) {
				window.requestAnimationFrame(() => this.redraw());
			}
			event => event.preventDefault();
		})
		d3Select(this.canvasElement).call(this.drag)
			// .call(d3ZoomTransform, d3ZoomIdentity.translate(0, 0).scale(this.cameraDistance))
			.call(this.zoom)
			.on("dblclick.zoom", null);
	}

	willResizeEvent(event) {
		//requestAnimFrame(function(){
		let dpr = 0.5 * window.devicePixelRatio || 1;
		this.canvasElement.style.width = this.element.clientWidth + "px";
		this.canvasElement.style.height = this.element.clientHeight + "px";
		this.canvasElement.width = dpr * this.element.clientWidth;
		this.canvasElement.height = dpr * this.element.clientHeight;
		this.resizeGL(this.canvasElement.width, this.canvasElement.height);
		this.onResizeCallback?.(event);
		//});
	}


	redraw() {
		this._redrawAll(false);
		this._redrawAll(true);
		this.onDrawCallback?.();
		this.triggerHoverEvents(null);
	}

	update(){
		if (!this.positionInterpolator) {
			this._updateGeometry();
			this._updateEdgesGeometry();
		}
	}
	render(){
		if (!this.positionInterpolator) {
			window.requestAnimationFrame(() => this.redraw());
		}
	}

	async _redrawAll(isPicking) {
		let gl = this.gl;
		let ext = gl.getExtension("ANGLE_instanced_arrays");

		if (!isPicking) {
			gl.viewport(0, 0, this.canvasElement.width, this.canvasElement.height);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.clearColor(...this._backgroundColor);
		} else {
			const fbWidth = Math.round(this.canvasElement.width * this.pickingResolutionRatio);
			const fbHeight = Math.round(this.canvasElement.height * this.pickingResolutionRatio);
			gl.viewport(0, 0, fbWidth, fbHeight);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
			gl.clearColor(0.0, 0.0, 0.0, 0.0);
		}



		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		gl.depthMask(true);
		gl.lineWidth(3.0);

		this.projectionMatrix = glm.mat4.create();
		this.viewMatrix = glm.mat4.create();

		glm.mat4.perspective(this.projectionMatrix, Math.PI * 2 / 360 * 70, this.canvasElement.width / this.canvasElement.height, 0.005, 100.0);
		glm.mat4.identity(this.viewMatrix);
		glm.mat4.translate(this.viewMatrix, this.viewMatrix, [0, 0, -this.cameraDistance * this.zoomFactor]);


		glm.mat4.multiply(this.viewMatrix, this.viewMatrix, this.rotationMatrix);
		glm.mat4.scale(this.viewMatrix, this.viewMatrix, [0.01, 0.01, 0.01]);
		glm.mat4.translate(this.viewMatrix, this.viewMatrix, this.translatePosition);


		let currentShaderProgram;
		if (!isPicking) {
			// console.log(this.verticesShaderProgram);
			gl.enable(gl.BLEND);
			// 	if(useDarkBackground){
			// gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			// 	}else{
			// gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
				gl.ZERO, gl.ONE);
			// 	}
			currentShaderProgram = this.verticesShaderProgram;
		} else {
			gl.disable(gl.BLEND);
			// console.log(this.verticesShaderProgram);
			currentShaderProgram = this.verticesPickingShaderProgram;
		}

		currentShaderProgram.use(gl);
		currentShaderProgram.attributes.enable("vertex");
		// currentShaderProgram.attributes.enable("normal");
		currentShaderProgram.attributes.enable("position");
		currentShaderProgram.attributes.enable("scale");
		currentShaderProgram.attributes.enable("intensity");
		currentShaderProgram.attributes.enable("encodedIndex");


		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesGeometry.vertexObject);
		gl.vertexAttribPointer(currentShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.vertex, 0);

		// gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesGeometry.normalObject);
		// gl.vertexAttribPointer(currentShaderProgram.attributes.normal, 3, gl.FLOAT, false, 0, 0);
		// ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.normal, 0); 

		if (this.nodesGeometry.indexObject) {
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.nodesGeometry.indexObject);
		}

		gl.uniformMatrix4fv(currentShaderProgram.uniforms.projectionMatrix, false, this.projectionMatrix);
		gl.uniformMatrix4fv(currentShaderProgram.uniforms.viewMatrix, false, this.viewMatrix);


		let normalMatrix = glm.mat3.create();
		glm.mat3.normalFromMat4(normalMatrix, this.viewMatrix);
		gl.uniformMatrix3fv(currentShaderProgram.uniforms.normalMatrix, false, normalMatrix);

		// Geometry Mutators and colors obtained from the network properties
		let colorsArray = this.network.colors;
		let positionsArray = this.network.positions;
		let scaleValue = this.network.scales;
		let intensityValue = this.network.intensities;

		// Bind the instance position data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesPositionBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.position);
		gl.vertexAttribPointer(currentShaderProgram.attributes.position, 3, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.position, 1); // This makes it instanced!

		// Bind the instance color data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesColorBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.color);
		gl.vertexAttribPointer(currentShaderProgram.attributes.color, 3, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.color, 1); // This makes it instanced!

		// Bind the instance color data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesScaleBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.scale);
		gl.vertexAttribPointer(currentShaderProgram.attributes.scale, 1, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.scale, 1); // This makes it instanced!

		// Bind the instance color data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIntensityBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.intensity);
		gl.vertexAttribPointer(currentShaderProgram.attributes.intensity, 1, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.intensity, 1); // This makes it instanced!
		// Bind the instance color data

		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIndexBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.encodedIndex);
		gl.vertexAttribPointer(currentShaderProgram.attributes.encodedIndex, 4, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.encodedIndex, 1); // This makes it instanced!

		// console.log(this.network.positions.length/3)
		// Draw the instanced meshes
		if (this.nodesGeometry.indexObject) {
			ext.drawElementsInstancedANGLE(gl.TRIANGLES, this.nodesGeometry.numIndices, this.nodesGeometry.indexType, 0, this.network.positions.length / 3);
		} else {
			ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, this.nodesGeometry.numIndices, this.network.positions.length / 3);
		}
		// //Positions
		// for(let i=0;i<this.network.positions.length;i+=3){
		// 	// console.log(i);
		// 	let color = [colorsArray[i],colorsArray[i+1],colorsArray[i+2]];
		// 	let position = [positionsArray[i],positionsArray[i+1],positionsArray[i+2]];
		// 	let scale = scaleValue[i/3]*0.25;
		// 	let intensity = scaleValue[i/3]*0.25;

		// 	gl.uniform1f(this.verticesShaderProgram.uniforms.scale,scale);
		// 	gl.uniform1f(this.verticesShaderProgram.uniforms.intensity,intensity);

		// 	gl.uniform3fv(this.verticesShaderProgram.uniforms.color,color);
		// 	gl.uniform3fv(this.verticesShaderProgram.uniforms.position,position);
		// 	//draw the geometry for every position 
		// 	//FIXME: drawElement overhead is very critical on javascript (needs to reduce drawElements calling)
		// 	gl.drawElements(gl.TRIANGLES, this.vertexGeometry.numIndices, this.vertexGeometry.indexType, 0);
		// }

		// Disable attributes
		currentShaderProgram.attributes.disable("vertex");
		// this.verticesShaderProgram.attributes.disable("normal");
		currentShaderProgram.attributes.disable("position");
		currentShaderProgram.attributes.disable("scale");
		currentShaderProgram.attributes.disable("intensity");
		currentShaderProgram.attributes.disable("encodedIndex");

		if (!isPicking && !((this.mouseDown || this.redrawingFromMouseWheelEvent) && this.fastEdges)) {
			// console.log(this.edgesShaderProgram)
			this.edgesShaderProgram.use(gl);
			this.edgesShaderProgram.attributes.enable("vertex");
			this.edgesShaderProgram.attributes.enable("color");
			gl.enable(gl.BLEND);
			// 	if(useDarkBackground){
			// gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			// 	}else{
			//gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			// gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
			// 									gl.ZERO, gl.ONE );
			// 	}
			// 	// Enables the use of EdgesDepth (NOTE: edges are not sorted when depth is enabled. Visual artefacts may occurs.)
			// 	if(!useEdgesDepth){
			// gl.depthMask(false);
			// 	}else{
			gl.depthMask(true);
			// 	}
			this.projectionViewMatrix = glm.mat4.create();
			glm.mat4.multiply(this.projectionViewMatrix, this.projectionMatrix, this.viewMatrix);

			//bind attributes and unions
			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.vertexObject);
			gl.vertexAttribPointer(this.edgesShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);
			ext.vertexAttribDivisorANGLE(this.edgesShaderProgram.attributes.vertex, 0); // This makes it instanced!

			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.colorObject);
			gl.vertexAttribPointer(this.edgesShaderProgram.attributes.color, 3, gl.FLOAT, false, 0, 0);
			ext.vertexAttribDivisorANGLE(this.edgesShaderProgram.attributes.color, 0); // This makes it instanced!

			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgesGeometry.indexObject);

			gl.uniformMatrix4fv(this.edgesShaderProgram.uniforms.projectionViewMatrix, false, this.projectionViewMatrix);

			//gl.uniform2fv(edgesShaderProgram.uniforms.nearFar,[0.1,10.0]);
			gl.uniform1f(this.edgesShaderProgram.uniforms.linesIntensity, this._edgesIntensity);

			//drawElements is called only 1 time. no overhead from javascript
			gl.drawElements(gl.LINES, this.edgesGeometry.numIndices, this.edgesGeometry.indexType, 0);

			//disabling attributes
			this.edgesShaderProgram.attributes.disable("vertex");
			this.edgesShaderProgram.attributes.disable("color");
		}

		// //draw of the edges as lines
		// if(edgesGeometry&&linesIntensity>0.0 && showEdges && !((mouseDown||redrawingFromMouseWheelEvent) && fastEdges)){
		// 	edgesShaderProgram.use();

		// 	//Edges are rendered with additive blending.
		// 	gl.enable(gl.BLEND);
		// 	if(useDarkBackground){
		// 		gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		// 	}else{
		// 		//gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		// 		gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
		// 											 gl.ZERO, gl.ONE );
		// 	}
		// 	// Enables the use of EdgesDepth (NOTE: edges are not sorted when depth is enabled. Visual artefacts may occurs.)
		// 	if(!useEdgesDepth){
		// 		gl.depthMask(false);
		// 	}else{
		// 		gl.depthMask(true);
		// 	}

		// 	//Enable attributes (vertex and color)
		// 	edgesShaderProgram.attributes.enable("vertex");
		// 	edgesShaderProgram.attributes.enable("color");

		// 	//bind attributes and unions
		// 	gl.bindBuffer(gl.ARRAY_BUFFER, edgesGeometry.vertexObject);
		// 	gl.vertexAttribPointer(edgesShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);

		// 	gl.bindBuffer(gl.ARRAY_BUFFER, edgesGeometry.colorObjects[currentEdgesColorKey]);
		// 	gl.vertexAttribPointer(edgesShaderProgram.attributes.color, 3, gl.FLOAT, false, 0, 0);

		// 	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgesGeometry.indexObject);

		// 	gl.uniformMatrix4fv(edgesShaderProgram.uniforms.projectionViewMatrix, false, projectionViewMatrix);

		// 	//gl.uniform2fv(edgesShaderProgram.uniforms.nearFar,[0.1,10.0]);
		// 	gl.uniform1f(edgesShaderProgram.uniforms.linesIntensity,linesIntensity/255);

		// 	//drawElements is called only 1 time. no overhead from javascript
		// 	gl.drawElements(gl.LINES, edgesGeometry.numIndices, edgesGeometry.indexType, 0);

		// 	//disabling attributes
		// 	edgesShaderProgram.attributes.disable("vertex");
		// 	edgesShaderProgram.attributes.disable("color");
		// }

		// 	context2d.clearRect(0, 0, networkCanvas2D.width, networkCanvas2D.height);
		// if(displayNames.length>0||displayIndices.length>0){
		// 	context2d.save();
		// 	context2d.strokeStyle = "rgba(255, 255, 255, 0.25)";
		// 	context2d.fillStyle = "rgba(255, 255, 255, 0.25)";
		// 	w2d = networkCanvas2D.width;
		// 	h2d = networkCanvas2D.height;
		// 	/*context2d.shadowBlur=0;
		// 	context2d.shadowColor="rgba(255, 255, 255, 0.5)";
		// 	context2d.shadowOffsetX= 1;
		// 	context2d.shadowOffsetY= 1;

		// 	context2d.shadowColor = "#000000";
		// 	context2d.shadowOffsetX= 0;
		// 	context2d.shadowOffsetY= 0;
		// 	*/
		// 	context2d.font = labelsFont;

		// 	var allDisplayIndices = [];
		// 	/*for(var nexti=0;nexti<displayNames.length;nexti++){
		// 		var i = network.indexNameMap[displayNames[nexti]];
		// 		if(i != undefined && i>=0 && i < network.names.length){
		// 			allDisplayIndices.push(i);
		// 		}
		// 	}
		// 	*/
		// 	var allDisplaysSet = new NSet();
		// 	for(var nexti=0;nexti<displayNames.length;nexti++){
		// 		allDisplaysSet.add(displayNames[nexti]);
		// 	}

		// 	for(var i=0;i<network.names.length;i++){
		// 		if(network.names[i] in allDisplaysSet){
		// 			allDisplayIndices.push(i);
		// 		}
		// 	}

		// 	for(var nexti=0;nexti<allDisplayIndices.length;nexti++){
		// 		var i = allDisplayIndices[nexti];

		// 		var color = [colorsArray[i*3],colorsArray[i*3+1],colorsArray[i*3+2]];
		// 		var position = [positionsArray[i*3],positionsArray[i*3+1],positionsArray[i*3+2],1.0];
		// 		var scale = Math.pow(5*scaleValue[i]/maxScale,scalePropertyCoeff)*verticesScale;
		// 		var dest = [0.0,0.0,0.0,0.0];
		// 		mat4.multiplyVec4(projectionViewMatrix, position, dest);
		// 		if(dest[2]<0){//behind the camera
		// 			continue;
		// 		}
		// 		var x = w2d/2 + dest[0]*w2d/2.0/dest[3];
		// 		var y = h2d/2 - dest[1]*h2d/2.0/dest[3];
		// 		context2d.translate(x,y);


		// 		if(useDarkBackground){
		// 			context2d.strokeStyle = rgba(color[0]*255, color[1]*255, color[2]*255, 0.4);
		// 		}else{
		// 			context2d.strokeStyle = rgba(color[0]*50+205, color[1]*50+205, color[2]*50+205, 0.80);
		// 		}
		// 		context2d.lineWidth = 3;
		// 		context2d.beginPath();
		// 		context2d.arc(0,0,1.0/dest[2]*scale*15*labelSymbolSize,0,2*Math.PI);
		// 		context2d.stroke();

		// 		if(useDarkBackground){
		// 			context2d.strokeStyle = rgba(color[0]*200+55, color[1]*200+55, color[2]*200+55, 0.75);
		// 		}else{
		// 			context2d.strokeStyle = rgba(color[0]*100, color[1]*100, color[2]*100, 0.75);
		// 		}

		// 		context2d.beginPath();
		// 		context2d.arc(0,0,1.0/dest[2]*scale*7.5*labelSymbolSize,0,2*Math.PI);
		// 		context2d.stroke();

		// 		if(useDarkBackground){
		// 			context2d.strokeStyle = rgba(color[0]*200+55, color[1]*200+55, color[2]*200+55, 0.65);
		// 		}else{
		// 			context2d.strokeStyle = rgba(color[0]*50+205, color[1]*50+205, color[2]*50+205, 0.80);
		// 		}

		// 		context2d.beginPath();
		// 		context2d.arc(0,0,1.0/dest[2]*scale*20*labelSymbolSize,0,2*Math.PI);
		// 		context2d.stroke();

		// 		var theName = network.names[i];
		// 		var textSize = context2d.measureText(theName);

		// 		if(useDarkBackground){
		// 			context2d.fillStyle = rgba(color[0]*100, color[1]*100, color[2]*100, 0.75);
		// 			context2d.strokeStyle = rgba(color[0]*255, color[1]*255, color[2]*255, 0.7);
		// 		}else{
		// 			context2d.fillStyle = rgba(color[0]*50+205, color[1]*50+205, color[2]*50+205, 0.80);
		// 			context2d.strokeStyle = rgba(color[0]*50+205, color[1]*50+205, color[2]*50+205, 0.80);
		// 		}
		// 		context2d.fillRect(2,-(labelsBoxSize),textSize.width+6,labelsBoxSize);
		// 		context2d.lineWidth = 1;
		// 		context2d.strokeRect(2,-(labelsBoxSize),textSize.width+6,labelsBoxSize);

		// 		if(useDarkBackground){
		// 			context2d.fillStyle = "rgba(255, 255, 255, 0.6)";
		// 		}else{
		// 			context2d.fillStyle = "rgba(0, 0, 0, 0.9)";
		// 		}

		// 		context2d.fillText(theName,5,-5);
		// 		context2d.translate(-x,-y);
		// 	}
		// 	context2d.restore();
		// }

		// 	redrawingFromMouseWheelEvent=false;

	}



	// onResizeCallback
	// onNodeClickCallback
	// onNodeHoverStartCallback 
	// onNodeHoverEndCallback
	// onNodeHoverMoveCallback
	// onZoomCallback
	// onRotationCallback
	// onLayoutStartCallback
	// onLayoutFinishCallback
	// onDrawCallback

	onResize(callback) {
		this.onResizeCallback = callback;
		return this;
	}
	onNodeClick(callback) {
		this.onNodeClickCallback = callback;
		return this;
	}
	onNodeHoverStart(callback) {
		this.onNodeHoverStartCallback = callback;
		return this;
	}
	onNodeHoverEnd(callback) {
		this.onNodeHoverEndCallback = callback;
		return this;
	}
	onNodeHoverMove(callback) {
		this.onNodeHoverMoveCallback = callback;
		return this;
	}
	onZoom(callback) {
		this.onZoomCallback = callback;
		return this;
	}
	onRotation(callback) {
		this.onRotationCallback = callback;
		return this;
	}
	onLayoutStart(callback) {
		this.onLayoutStartCallback = callback;
		return this;
	}
	onLayoutFinish(callback) {
		this.onLayoutFinishCallback = callback;
		return this;
	}
	onDraw(callback) {
		this.onDrawCallback = callback;
		return this;
	}

	backgroundColor(color) {
		// check if color is defined
		if (color === undefined) {
			return this._backgroundColor;
		} else {
			this._backgroundColor = color;
			return this;
		}
	}


	nodeColor(colorInput, nodeName) {
		if (nodeName === undefined) {
			if (colorInput === undefined) {
				return this.network.colors;
			} else if (typeof colorInput === "function") {
				for (const [nodeName, node] of Object.entries(this.network.nodes)) {
					let nodeIndex = this.network.node2index[nodeName];
					let aColor = colorInput(node, nodeIndex, this.network);
					this.network.colors[nodeIndex * 3 + 0] = aColor[0];
					this.network.colors[nodeIndex * 3 + 1] = aColor[1];
					this.network.colors[nodeIndex * 3 + 2] = aColor[2];
				}
			} else if (colorInput === "number") {
				//index
				return this.network.colors[this.network.node2index[colorInput]];
			} else {
				for (const [nodeName, node] of Object.entries(this.network.nodes)) {
					let nodeIndex = this.network.node2index[nodeName];
					this.network.colors[nodeIndex * 3 + 0] = colorInput[0];
					this.network.colors[nodeIndex * 3 + 1] = colorInput[1];
					this.network.colors[nodeIndex * 3 + 2] = colorInput[2];
				}
			}
		} else {
			if (typeof colorInput === "function") {
				let nodeIndex = this.network.node2index[nodeName];
				let aColor = colorInput(this.network.nodes[nodeName], nodeIndex, this.network);
				this.network.colors[nodeIndex * 3 + 0] = aColor[0];
				this.network.colors[nodeIndex * 3 + 1] = aColor[1];
				this.network.colors[nodeIndex * 3 + 2] = aColor[2];
			} else {
				let nodeIndex = this.network.node2index[nodeName];
				this.network.colors[nodeIndex * 3 + 0] = colorInput[0];
				this.network.colors[nodeIndex * 3 + 1] = colorInput[1];
				this.network.colors[nodeIndex * 3 + 2] = colorInput[2];
			}
		}
		return this;
	}


	nodeScale(scaleInput, nodeName) {
		if (nodeName === undefined) {
			if (scaleInput === undefined) {
				return this.network.scales;
			} else if (typeof scaleInput === "function") {
				for (const [nodeName, node] of Object.entries(this.network.nodes)) {
					let aScale = scaleInput(node, this.network);
					let nodeIndex = this.network.node2index[nodeName];
					this.network.scales[nodeIndex] = aScale;
				}
			} else if (scaleInput === "number") {
				//index
				return this.network.scales[this.network.node2index[scaleInput]];
			} else {
				for (const [nodeName, node] of Object.entries(this.network.nodes)) {
					let nodeIndex = this.network.node2index[nodeName];
					this.network.scales[nodeIndex] = scaleInput;
				}
			}
		} else {
			if (typeof scaleInput === "function") {
				let aScale = scaleInput(this.network.nodes[nodeName], this.network);
				let nodeIndex = this.network.node2index[nodeName];
				this.network.scales[nodeIndex] = aScale;
			} else {
				let nodeIndex = this.network.node2index[nodeName];
				this.network.scales[nodeIndex] = scaleInput;
			}
		}
		return this;
	}

	edgesIntensity(intensity){
		// check if color is defined
		if (intensity === undefined) {
			return this._edgesIntensity;
		} else {
			this._edgesIntensity = intensity;
			return this;
		}
	}
}

// Helios.xnet = xnet;
export { xnet };
