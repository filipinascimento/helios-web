import * as glm from "gl-matrix"
import { Network } from "./Network.js"
import * as glUtils from "../utils/webglutils.js"
import * as xnet from "../utils/xnet.js"
import { select as d3Select } from "d3-selection";
import {HeliosScheduler} from "./Scheduler.js";
import { zoom as d3Zoom, zoomTransform as d3ZoomTransform, zoomIdentity as d3ZoomIdentity } from "d3-zoom";
import * as d3Ease from "d3-ease";
// import { drag as d3Drag } from "d3-drag";
// import { default as createGraph } from "ngraph.graph"
// import { default as createLayout } from "ngraph.forcelayout"
import {default as Pica} from "pica";
import {layoutWorker as d3ForceLayoutWorker} from "../layouts/d3force3dLayoutWorker.js"
import * as edgesShaders from "../shaders/edges.js"
import * as nodesShaders from "../shaders/nodes.js"
let isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);


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
		element = null,
		elementID = null,
		nodes = {},
		edges = [],
		// use settings
		// displayOptions inside settings
		use2D = false,
		fastEdges = false,
		forceSupersample = false,
		autoStartLayout = true,
		autoCleanup = true, // cleanup helios if canvas or element are removed
		// display = [],
	}) {
		if(element == null){
			this.element = document.getElementById(elementID);
		}else{
			this.element = element;
		}
		this.element.innerHTML = '';
		this.canvasElement = document.createElement("canvas");
		this.element.appendChild(this.canvasElement);

		this.network = new Network(nodes, edges);
		this._autoCleanup = autoCleanup;
		// this.display = display;

		this.rotationMatrix = glm.mat4.create();
		
		this.translatePosition = glm.vec3.create();
		this.lastTranslatePosition = glm.vec3.create();
		this.targetTranslatePosition = glm.vec3.create();

		this.lastPanX = 0;
		this.lastPanY = 0;
		this.panX = 0;
		this.panY = 0;
		this.targetPanX = 0;
		this.targetPanY = 0;

		this.translateTime = 0;
		this.translateDuration = 0;
		this.mouseDown = false;
		this.lastMouseX = null;
		this.lastMouseY = null;
		this.redrawingFromMouseWheelEvent = false;
		this.fastEdges = fastEdges;
		this.animate = false;
		this.useShadedNodes = false;
		this.forceSupersample = forceSupersample;
		this.cameraDistance = 450;
		this._zoomFactor = 1;
		this.interacting = false;
		this.rotateLinearX = 0;
		this.rotateLinearY = 0;

		this.saveResolutionRatio = 1.0;
		this.pickingResolutionRatio = 0.25;


		this._nodesGlobalOpacityScale = 1.0;
		this._nodesGlobalOpacityBase = 0.0;

		this._nodesGlobalSizeScale = 1.0;
		this._nodesGlobalSizeBase = 0.0;

		this._edgesGlobalOpacityScale = 1.0;
		this._edgesGlobalOpacityBase = 0.0;
		
		this._edgesGlobalWidthScale = 0.25;
		this._edgesGlobalWidthBase = 0.0;
		
		this._nodesGlobalOutlineWidthScale = 1.0;
		this._nodesGlobalOutlineWidthBase = 0.0;

		this._backgroundColor = [0.5, 0.5, 0.5, 1.0];

		this._use2D = use2D;
		this._autoStartLayout = autoStartLayout;
		this.useAdditiveBlending = false;
		this._pickeableEdges = new Set();
		this.scheduler = new HeliosScheduler(this,{throttle:false});

		if (this._use2D) {
			for (let vertexIndex = 0; vertexIndex < this.network.positions.length; vertexIndex++) {
				this.network.positions[vertexIndex * 3 + 2] = 0;
			}
		}

		this._edgeIndicesUpdate = true;

		glm.mat4.identity(this.rotationMatrix);
		this.gl = glUtils.createWebGLContext(this.canvasElement, {
			antialias: true,
			powerPreference: "high-performance",
			desynchronized: true
		})

		this._centerNodes = [];
		this._centerNodesTransition = null;

		this.onNodeClickCallback = null;
		this.onNodeDoubleClickCallback = null;
		this.onNodeHoverStartCallback = null;
		this.onNodeHoverMoveCallback = null;
		this.onNodeHoverEndCallback = null;

		this.onEdgeClickCallback = null;
		this.onEdgeDoubleClickCallback = null;
		this.onEdgeHoverStartCallback = null;
		this.onEdgeHoverMoveCallback = null;
		this.onEdgeHoverEndCallback = null;
		
		
		this.onZoomCallback = null;
		this.onRotationCallback = null;
		this.onResizeCallback = null;
		this.onLayoutStartCallback = null;
		this.onLayoutStopCallback = null;
		this.onDrawCallback = null;
		this.onReadyCallback = null;
		this.isReady = false;

		// console.log(this.gl);
		this.initialize();
		this._onresizeEvent = event => {
			this.willResizeEvent(event);
		}
		window.addEventListener('resize', this._onresizeEvent);
	}

	// d3-like function Set/Get
	//zoom()
	//rotate()
	//pan()
	//highlightNodes()
	//centerNode()


	initialize() {
		this._setupShaders();
		this._buildNodesGeometry();
		this._buildPickingBuffers();
		this._buildEdgesGeometry();
		this.willResizeEvent(0);

		this._setupCamera();
		this._setupEvents();
		this._setupLayout();
		this.scheduler.start();
		this.onReadyCallback?.(this);
		// this.redraw();
		this.onReadyCallback = null;
		
		this.isReady = true;
	}

	_setupLayout() {

		// this.layoutWorker = new Worker(new URL('../layouts/ngraphLayoutWorker.js', import.meta.url));
		// this.layoutWorker = new Worker(new URL('../layouts/d3force3dLayoutWorker.js', import.meta.url));
		this.newPositions = this.network.positions.slice(0);
		let onlayoutUpdate = (data) => {
			this.newPositions = data.positions;
			let interpolatorTask = {
				name: "1.1.positionInterpolator",
				callback: (elapsedTime,task)=>{
					let maxDisplacement = 0;
					for (let index = 0; index < this.network.positions.length; index++) {
						let displacement = this.newPositions[index] - this.network.positions[index];
						this.network.positions[index] += 0.01 * (displacement)*elapsedTime/10;
						
						maxDisplacement = Math.max(Math.abs(displacement), maxDisplacement);
					};
					this._updateCenterNodesPosition();
					this.updateCameraInterpolation(true);
					// console.log(this.scheduler._averageFPS);

					if (maxDisplacement < 1) {
						this.scheduler.unschedule("1.1.positionInterpolator");
					}
				},
				delay:0,
				repeat:true,
				synchronized:true,
				immediateUpdates:false,
				redraw: true,
				updateNodesGeometry: true,
				updateEdgesGeometry: true,
			}
			this.scheduler.schedule({
				name: "1.0.positionChange",
				callback: (elapsedTime,task)=>{
					// let maxDisplacement = 0;
					// for (let index = 0; index < this.network.positions.length; index++) {
					// 	let displacement = this.newPositions[index] - this.network.positions[index];
					// 	maxDisplacement = Math.max(Math.abs(displacement), maxDisplacement);
					// };
					this.scheduler.schedule(interpolatorTask);
					// console.log(this.scheduler._averageFPS);
				},
				delay:0,
				repeat:false,
				synchronized:true,
				immediateUpdates:false,
				redraw: false,
				updateNodesGeometry: false,
				updateEdgesGeometry: false,
			});
		};
		
		let onLayoutStop = () =>{
			this.onLayoutStopCallback?.();
		}

		let onLayoutStart = () =>{
			this.onLayoutStartCallback?.();
		}


		this.layoutWorker = new d3ForceLayoutWorker({
			network:this.network,
			onUpdate: onlayoutUpdate,
			onStop: onLayoutStop,
			onStart: onLayoutStart,
			use2D: this._use2D
		});

		if(this._autoStartLayout){
			this.layoutWorker.start();
		}

		
	}

	pauseLayout(){
		// this.layoutWorker.postMessage({ type: "stop"});
		// this.layoutRunning=false;
		this.layoutWorker.pause();
	}

	resumeLayout(){
		// this.layoutWorker.postMessage({ type: "restart" });
		// this.layoutRunning=true;
		this.layoutWorker.resume();
	}

	_callEventFromPickID(pickID, eventType, event) {
		let pickObject = null;
		let isNode = true;
		if(pickID >= 0){
			if (pickID <this.network.nodeCount) {
				isNode = true;
				pickObject = this.network.index2Node[pickID];
			}else if(pickID >=this.network.nodeCount){
				let edgeIndex = pickID - this.network.nodeCount;
				if(edgeIndex<this.network.indexedEdges.length/2){
					let edge = {
						"source": this.network.index2Node[this.network.indexedEdges[2*edgeIndex]],
						"target": this.network.index2Node[this.network.indexedEdges[2*edgeIndex+1]],
						"index": edgeIndex
					}
					isNode = false;
					pickObject = edge;
				}
			}
		}
		// if(eventType!="hoverMove"){
		// 	console.log({
		// 		isNode: isNode,
		// 		eventType: eventType,
		// 		pickObject: pickObject,
		// 	})
		// }
		if(pickObject){
			switch (eventType) {
				case "click":{
					if(isNode){
						this.onNodeClickCallback?.(pickObject, event);
					}else{
						this.onEdgeClickCallback?.(pickObject, event);
					}
					break;
				}
				case "doubleClick":{
					if(isNode){
						this.onNodeDoubleClickCallback?.(pickObject, event);
					}else{
						this.onEdgeDoubleClickCallback?.(pickObject, event);
					}
					break;
				}
				case "hoverStart":{
					if(isNode){
						this.onNodeHoverStartCallback?.(pickObject, event);
					}else{
						this.onEdgeHoverStartCallback?.(pickObject, event);
					}
					break;
				}
				case "hoverMove":{
					if(isNode){
						this.onNodeHoverMoveCallback?.(pickObject, event);
					}else{
						this.onEdgeHoverMoveCallback?.(pickObject, event);
					}
					break;
				}
				case "hoverEnd":{
					if(isNode){
						this.onNodeHoverEndCallback?.(pickObject, event);
					}else{
						this.onEdgeHoverEndCallback?.(pickObject, event);
					}
					break;
				}
				default:
					break;
			}
		}
	}
	_setupEvents() {
		this.lastMouseX = -1;
		this.lastMouseY = -1;

		this.currentHoverIndex = -1;

		if(this._autoCleanup){
			this._mutationObserver = new MutationObserver((events) => {
				for (let index = 0; index < events.length; index++) {
					let event = events[index];
					if(event.type=="childList"){
						if(event.removedNodes.length>0){
							for (let index = 0; index < event.removedNodes.length; index++) {
								let element = event.removedNodes[index];
								if(element == this.canvasElement || element == this.element){
									this._mutationObserver.disconnect();
									this.cleanup();
									return;
								}
							}
						}
					}
				}

				// if (element.removedNodes.length > 0) {
				// 	console.log("Element removed");
				// 	this._mutationObserver.disconnect();
				// 	this.cleanup();
				// }
			});

			this._mutationObserver.observe(this.element, { childList: true });
			this._mutationObserver.observe(this.element.parentNode, { childList: true });
		}
		
		//Event listeners
		this._clickEventListener = (event) => {
			const rect = this.canvasElement.getBoundingClientRect();
			
			this.lastMouseX = event.clientX;
			this.lastMouseY = event.clientY;
			const pickID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
			if(pickID >= 0){
				this._callEventFromPickID(pickID, "click", event);
			}else{
				this.onNodeClickCallback?.(null, event);
				this.onEdgeClickCallback?.(null, event);
			}
		};
		
		this._doubleClickEventListener = (event) => {
			const rect = this.canvasElement.getBoundingClientRect();
			
			this.lastMouseX = event.clientX;
			this.lastMouseY = event.clientY;
			const pickID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
			if(pickID >= 0){
				this._callEventFromPickID(pickID, "doubleClick", event);
			}else{
				this.onNodeDoubleClickCallback?.(null, event);
				this.onEdgeDoubleClickCallback?.(null, event);
			}
		};

		this._hoverMoveEventListener = (event) => {
			this.lastMouseX = event.clientX;
			this.lastMouseY = event.clientY;
			this.triggerHoverEvents(event);
		};
		
		this._hoverLeaveEventListener = (event) => {
			if (this.currentHoverIndex >= 0) {
				this._callEventFromPickID(this.currentHoverIndex, "hoverEnd", event);
				this.currentHoverIndex = -1;
				this.lastMouseX = -1;
				this.lastMouseY = -1;
			}
		};

		this._hoverLeaveWindowEventListener = (event) => {
			if (!event.relatedTarget && !event.toElement) {
				if (this.currentHoverIndex >= 0) {
					this._callEventFromPickID(this.currentHoverIndex, "hoverEnd", event);
					this.currentHoverIndex = -1;
					this.lastMouseX = -1;
					this.lastMouseY = -1;
				}
			}
		};

		// this.canvasElement.onclick = this._clickEventListener;
		// this.canvasElement.ondblclick = this._doubleClickEventListener;

		this.canvasElement.addEventListener("click",this._clickEventListener);
		this.canvasElement.addEventListener("dblclick",this._doubleClickEventListener);

		this.canvasElement.addEventListener("mousemove", this._hoverMoveEventListener);
		this.canvasElement.addEventListener("mouseleave", this._hoverLeaveEventListener);
		document.body.addEventListener("mouseout", this._hoverLeaveWindowEventListener);
	}

	async _downloadImageData(imagedata, filename, supersampleFactor,fileFormat) {
		// let canvas = document.getElementById('SUPERCANVAS');
		let pica = new Pica({
			// features:["all"],
		})
		let canvas = document.createElement('canvas');
		let canvasFullSize = document.createElement('canvas');
		let ctx = canvas.getContext('2d');
		let ctxFullSize = canvasFullSize.getContext('2d');
		canvasFullSize.width = imagedata.width;
		canvasFullSize.height = imagedata.height;
		canvas.width = imagedata.width/supersampleFactor;
		canvas.height = imagedata.height/supersampleFactor;
		ctx.imageSmoothingEnabled = true;
		ctxFullSize.imageSmoothingEnabled = true;
		if(typeof ctx.imageSmoothingQuality !== 'undefined'){
			ctx.imageSmoothingQuality = 'high';
		}
		if(typeof ctxFullSize.imageSmoothingQuality !== 'undefined'){
			ctxFullSize.imageSmoothingQuality = 'high';
		}

		// let dpr = window.devicePixelRatio || 1;
		// canvas.style.width =  canvas.width/dpr/10 + "px";
		// canvas.style.height = canvas.height/dpr/10 + "px";


		ctxFullSize.putImageData(imagedata, 0, 0);
		ctxFullSize.transform(1, 0, 0, -1, 0, canvasFullSize.height)
		ctxFullSize.globalCompositeOperation = "copy"; // if you have transparent pixels
		ctxFullSize.drawImage(ctxFullSize.canvas,0,0);
		ctxFullSize.globalCompositeOperation = "source-over"; // reset to default

		await pica.resize(canvasFullSize,canvas,{
			alpha:true,
		});

		// ctxFullSize.drawImage(canvasFullSize, 0, 0,canvasFullSize.width*0.5,canvasFullSize.height*0.5,0,0,
		// 	imagedata.width/supersampleFactor,
		// 	imagedata.height/supersampleFactor);
		// ctx.drawImage(canvasFullSize, 0, 0,canvasFullSize.width,canvasFullSize.height,0,0,
		// 	imagedata.width/supersampleFactor,
		// 	imagedata.height/supersampleFactor);
		
		
		// let image = new Image();
		// let imageSRC = canvas.toDataURL()
		// image.src = imageSRC;
		let downloadLink = document.createElement('a');
		// console.log(["CANVAS",imageSRC]);

					
		if(isSafari){
			// BUG in Safari
			// console.log("Workaround safari bug...");
			canvas.toDataURL();
		}

		downloadLink.setAttribute('download', filename);
		let blob = await pica.toBlob(canvas,"image/png");
		if(blob){
			if(filename.endsWith("svg")){
				let svgText = `
				<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
				width="${canvas.width}" height="${canvas.width}"
				>
				<image
						width="${canvas.width}" height="${canvas.width}"
						xlink:href="${blob}"
						/>
				</svg>`
				downloadLink.setAttribute('download', filename);
				let blobSVG = new Blob([svgText], {type: 'image/svg+xml'});
				let url = URL.createObjectURL(blobSVG);
				downloadLink.setAttribute('href', url);
				downloadLink.click();
			}else{
				let url = URL.createObjectURL(blob);
				downloadLink.setAttribute('href', url);
				downloadLink.click();
			}
		}else{
			window.alert(`An error occured while trying to download the image. Please try again. (Error: blob is null.)`);
			// console.log("BLOB IS NULL");
		}

		if(filename.endsWith("svg")){
			let svgText = `
			<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
			width="${canvas.width}" height="${canvas.width}"
			>
			<image
					width="${canvas.width}" height="${canvas.width}"
					xlink:href="${canvas.toDataURL()}"
					/>
			</svg>`
			downloadLink.setAttribute('download', filename);
			let blob = new Blob([svgText], {type: 'image/svg+xml'});
			let url = URL.createObjectURL(blob);
			downloadLink.setAttribute('href', url);
			downloadLink.click();
		}else if (false){
			downloadLink.setAttribute('download', filename);
			downloadLink.setAttribute('href', canvas.toDataURL("image/png").replace("image/png", "image/octet-stream"));
			downloadLink.click();
		}else{

			// canvas.toBlob(function(blob) {
			// 	console.log(["CANVAS",blob]);
			// 	let trials = 3;
			// 	let success = false;
			// 	let lastError = null;
			// 	while(trials>0 && !success){
			// 		// FIXME: Safari BUG
			// 		try {
			// 			let url = URL.createObjectURL(blob);
			// 			downloadLink.setAttribute('href', url);
			// 			downloadLink.click();
			// 			success=true;
			// 		} catch (error) {
			// 			lastError = error;
			// 		}
			// 		trials--;
			// 	}
			// 	if(!success){
			// 		window.alert(`An error occured while trying to download the image. Please try again. (Error: ${lastError})`)
			// 	}
			// });
		}
	}

	framebufferImage(framebuffer) { 
		const fbWidth = framebuffer.size.width;
		const fbHeight = framebuffer.size.height;
		const data = new Uint8ClampedArray(4*fbWidth*fbHeight);
		let gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.readPixels(
			0,            // x
			0,            // y
			fbWidth,                 // width
			fbHeight,                 // height
			gl.RGBA,           // format
			gl.UNSIGNED_BYTE,  // type
			data);             // typed array to hold result

		return new ImageData(data, fbWidth, fbHeight);
	}

	exportFigure(filename,{
			scale=1.0,
			supersampleFactor=4.0,
			width=null,
			height=null,
			backgroundColor = null,
		}) {
		if(typeof(scale)==='undefined'){
			scale=1.0;
		}
		if(typeof(supersampleFactor)==='undefined'){
			supersampleFactor=2.0;
		}
		let framebuffer = this.createOffscreenFramebuffer();
		if(width==null && height==null){
			width = this.canvasElement.width;
			height = this.canvasElement.height;
		}else if(width==null){
			width = Math.round(height * this.canvasElement.width/this.canvasElement.height);
		}else if(height==null){
			height = Math.round(width * this.canvasElement.height/this.canvasElement.width);
		}
		if(backgroundColor==null){
			backgroundColor = this.backgroundColor;
		}
		framebuffer.setSize(width*scale*supersampleFactor, height*scale*supersampleFactor);
		framebuffer.backgroundColor = backgroundColor;
		this._redrawAll(framebuffer);
		let image = this.framebufferImage(framebuffer);
		this._downloadImageData(image,filename,supersampleFactor);
		
		framebuffer.discard();
	}

	triggerHoverEvents(event,shallCancel) {
		if(!this.isReady){
			return;
		}
		if(this.lastMouseX==-1 || this.lastMouseY==-1){
			return;
		}

		let pickID = -1;
		if(!this.interacting){
			const rect = this.canvasElement.getBoundingClientRect();
			pickID = this.pickPoint(this.lastMouseX - rect.left, this.lastMouseY - rect.top);
		}
		// let nodesCount = 
		if (pickID >= 0 && this.currentHoverIndex == -1) {
			this.currentHoverIndex = pickID;
			this._callEventFromPickID(pickID, "hoverStart", event);
		} else if (pickID >= 0 && this.currentHoverIndex == pickID) {
			// console.log("mouse: ",this.lastMouseX,this.lastMouseY)
			this._callEventFromPickID(pickID, "hoverMove", event);
		} else if (pickID >= 0 && this.currentHoverIndex != pickID) {
			this._callEventFromPickID(this.currentHoverIndex, "hoverEnd", event);
			this.currentHoverIndex = pickID;
			this._callEventFromPickID(pickID, "hoverStart", event);
		} else if (pickID == -1 && this.currentHoverIndex != pickID) {
			this._callEventFromPickID(this.currentHoverIndex, "hoverEnd", event);
			this.currentHoverIndex = -1;
		}
	}



	_setupShaders() {
		let gl = this.gl;

		this.edgesShaderProgram = new glUtils.ShaderProgram(
			glUtils.getShaderFromString(gl,edgesShaders.vertexShader,gl.VERTEX_SHADER),
			glUtils.getShaderFromString(gl,edgesShaders.fragmentShader,gl.FRAGMENT_SHADER),
			["viewMatrix", "projectionMatrix", "nearFar",
			"globalOpacityScale","globalWidthScale","globalSizeScale","globalOpacityBase","globalWidthBase","globalSizeBase"],
			["fromVertex", "toVertex", "vertexType", "fromColor", "toColor", "fromSize", "toSize", "encodedIndex"],
			this.gl);

		this.edgesFastShaderProgram = new glUtils.ShaderProgram(
			glUtils.getShaderFromString(gl,edgesShaders.fastVertexShader,gl.VERTEX_SHADER),
			glUtils.getShaderFromString(gl,edgesShaders.fastFragmentShader,gl.FRAGMENT_SHADER),
			["projectionViewMatrix", "nearFar", "globalOpacityScale","globalOpacityBase"],
			["vertex", "color"],
			this.gl);

		this.edgesPickingShaderProgram = new glUtils.ShaderProgram(
			glUtils.getShaderFromString(gl,edgesShaders.vertexShader,gl.VERTEX_SHADER),
			glUtils.getShaderFromString(gl,edgesShaders.pickingShader,gl.FRAGMENT_SHADER),
			["viewMatrix", "projectionMatrix", "nearFar",
			"globalOpacityScale","globalWidthScale","globalSizeScale","globalOpacityBase","globalWidthBase","globalSizeBase"],
			["fromVertex", "toVertex", "vertexType", "fromColor", "toColor", "fromSize", "toSize", "encodedIndex"],
			this.gl);


		this.nodesShaderProgram = new glUtils.ShaderProgram(
			glUtils.getShaderFromString(gl,nodesShaders.vertexShader,gl.VERTEX_SHADER),
			glUtils.getShaderFromString(gl,nodesShaders.fragmentShader,gl.FRAGMENT_SHADER),
			["viewMatrix", "projectionMatrix", "normalMatrix",
			"globalOpacityScale","globalSizeScale","globalOutlineWidthScale","globalOpacityBase","globalSizeBase","globalOutlineWidthBase"],
			["vertex", "position", "color", "size", "outlineWidth", "outlineColor", "encodedIndex"], this.gl);

		this.nodesFastShaderProgram = new glUtils.ShaderProgram(
			glUtils.getShaderFromString(gl,nodesShaders.fastVertexShader,gl.VERTEX_SHADER),
			glUtils.getShaderFromString(gl,nodesShaders.fastFragmentShader,gl.FRAGMENT_SHADER),
			["viewMatrix", "projectionMatrix", "normalMatrix",
			"globalOpacityScale","globalSizeScale","globalOutlineWidthScale","globalOpacityBase","globalSizeBase","globalOutlineWidthBase"],
			["vertex", "position", "color", "size", "outlineWidth", "outlineColor", "encodedIndex"], this.gl);
	
		this.nodesPickingShaderProgram = new glUtils.ShaderProgram(
			glUtils.getShaderFromString(gl,nodesShaders.vertexShader,gl.VERTEX_SHADER),
			glUtils.getShaderFromString(gl,nodesShaders.pickingShader,gl.FRAGMENT_SHADER),
			["viewMatrix", "projectionMatrix", "normalMatrix",
			"globalOpacityScale","globalSizeScale","globalOutlineWidthScale","globalOpacityBase","globalSizeBase","globalOutlineWidthBase"],
			["vertex", "position", "color", "size", "outlineWidth", "outlineColor", "encodedIndex"], this.gl);
	}

	_buildPickingBuffers() {
		let gl = this.gl;
		this.pickingFramebuffer = this.createOffscreenFramebuffer();
	}

	createOffscreenFramebuffer() {
		let gl = this.gl;
		let framebuffer = gl.createFramebuffer();
		framebuffer.texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		framebuffer.depthBuffer = gl.createRenderbuffer();
		gl.bindRenderbuffer(gl.RENDERBUFFER, framebuffer.depthBuffer);

		// Create and bind the framebuffer
		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		framebuffer.size = {
			width: 0,
			height: 0,
		};

		framebuffer.setSize = (width, height) => {
			gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
			// define size and format of level 0
			const level = 0;
			const internalFormat = gl.RGBA;
			const border = 0;
			const format = gl.RGBA;
			const type = gl.UNSIGNED_BYTE;
			const data = null;
			const fbWidth = width;
			const fbHeight = height;
			gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
				fbWidth, fbHeight, border, format, type, data);
			gl.bindRenderbuffer(gl.RENDERBUFFER, framebuffer.depthBuffer);
			gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, fbWidth, fbHeight);
			framebuffer.size.width = width;
			framebuffer.size.height = height;
		};

		framebuffer.discard = () =>{
			gl.deleteRenderbuffer(framebuffer.depthBuffer);
			gl.deleteTexture(framebuffer.texture);
			gl.deleteFramebuffer(framebuffer);
		}
		// attach the texture as the first color attachment
		const attachmentPoint = gl.COLOR_ATTACHMENT0;
		const level = 0;
		gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, framebuffer.texture, level);

		// make a depth buffer and the same size as the targetTexture
		gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, framebuffer.depthBuffer);
		return framebuffer;
	}

	_buildNodesGeometry() {
		let gl = this.gl;
		let sphereQuality = 20;
		// this.nodesGeometry = glUtils.makeSphere(gl, 1.0, sphereQuality, sphereQuality);
		this.nodesGeometry = glUtils.makePlane(gl, false, false);
		// //vertexShape = makeBox(gl);



		this.nodesPositionBuffer = gl.createBuffer();
		this.nodesColorBuffer = gl.createBuffer();
		this.nodesSizeBuffer = gl.createBuffer();
		this.nodesOutlineWidthBuffer = gl.createBuffer();
		this.nodesOutlineColorBuffer = gl.createBuffer();
		this.nodesIndexBuffer = gl.createBuffer();

		//encodedIndex
		this.nodesIndexArray = new Float32Array(this.network.index2Node.length * 4);
		for (let ID = 0; ID < this.network.index2Node.length; ID++) {
			this.nodesIndexArray[4 * ID] = (((ID + 1) >> 0) & 0xFF) / 0xFF;
			this.nodesIndexArray[4 * ID + 1] = (((ID + 1) >> 8) & 0xFF) / 0xFF;
			this.nodesIndexArray[4 * ID + 2] = (((ID + 1) >> 16) & 0xFF) / 0xFF;
			this.nodesIndexArray[4 * ID + 3] = (((ID + 1) >> 24) & 0xFF) / 0xFF;
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesIndexBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, this.nodesIndexArray, gl.STATIC_DRAW);
		// console.log(this.nodesIndexArray)

		this.updateNodesGeometry();
	}


	updateNodesGeometry() {
		let gl = this.gl;

		let positions = this.network.positions;

		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesPositionBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);

		let colors = this.network.colors;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesColorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

		let sizes = this.network.sizes;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesSizeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);

		let outlineWidths = this.network.outlineWidths;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineWidthBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, outlineWidths, gl.STATIC_DRAW);
		
		let outlineColors = this.network.outlineColors;
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineColorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, outlineColors, gl.STATIC_DRAW);


		// //Depth test is essential for the desired effects

		// gl.disable(gl.CULL_FACE);
		// gl.frontFace(gl.CCW);

	}

	_buildFastEdgesGeometry(){
		let gl = this.gl;
		let edges = this.network.indexedEdges;
		let positions = this.network.positions;
		let colors = this.network.colors;
		
		let indicesArray;
		this.fastEdgesGeometry = null;
		this.fastEdgesIndicesArray = null;
		let newGeometry = new Object();
		//FIXME: If num of vertices > 65k, we need to store the geometry in two different indices objects
		if (positions.length < 65535) {
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

		this.fastEdgesGeometry = newGeometry;
		this.fastEdgesIndicesArray = indicesArray;

	}

	_buildAdvancedEdgesGeometry() {
		let gl = this.gl;
		let edgeVertexTypeArray = [
			0,1,
			0,0,
			1,1,
			1,0,
		];
		let newGeometry = new Object();
		newGeometry.edgeVertexTypeBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, newGeometry.edgeVertexTypeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(edgeVertexTypeArray), gl.STATIC_DRAW);

		newGeometry.verticesBuffer = gl.createBuffer();
		newGeometry.colorBuffer = gl.createBuffer();
		newGeometry.sizeBuffer = gl.createBuffer();
		// this.nodesOutlineWidthBuffer = gl.createBuffer();
		// this.nodesOutlineColorBuffer = gl.createBuffer();
		newGeometry.indexBuffer = gl.createBuffer();

		this.edgesGeometry = newGeometry;
		this.edgesGeometry.count = this.network.indexedEdges.length/2;

		//encodedIndex
		this.edgesGeometry.edgesIndexArray = new Float32Array(this.network.indexedEdges.length*4/2);
		this._edgeIndicesUpdate = true;
		// console.log(this.nodesIndexArray)
	}

	_buildEdgesGeometry() {
		if(this.fastEdges){
			this._buildFastEdgesGeometry();
		}else{
			this._buildAdvancedEdgesGeometry();
		}
		this.updateEdgesGeometry()
	}

	_updateEdgeIndices(){
		if(this._edgeIndicesUpdate){
			let gl = this.gl;
			for (let ID = 0; ID < this.network.indexedEdges.length/2; ID++) {
				let edgeID = this.network.index2Node.length + ID;
				if(this._pickeableEdges.has(ID)){
					this.edgesGeometry.edgesIndexArray[4 * ID] = (((edgeID + 1) >> 0) & 0xFF) / 0xFF;
					this.edgesGeometry.edgesIndexArray[4 * ID + 1] = (((edgeID + 1) >> 8) & 0xFF) / 0xFF;
					this.edgesGeometry.edgesIndexArray[4 * ID + 2] = (((edgeID + 1) >> 16) & 0xFF) / 0xFF;
					this.edgesGeometry.edgesIndexArray[4 * ID + 3] = (((edgeID + 1) >> 24) & 0xFF) / 0xFF;
				}else{
					this.edgesGeometry.edgesIndexArray[4 * ID] = 0;
					this.edgesGeometry.edgesIndexArray[4 * ID + 1] = 0;
					this.edgesGeometry.edgesIndexArray[4 * ID + 2] = 0;
					this.edgesGeometry.edgesIndexArray[4 * ID + 3] = 0;
				}
			}
			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.indexBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, this.edgesGeometry.edgesIndexArray, gl.DYNAMIC_DRAW);
			this._edgeIndicesUpdate = false;
		}
	}

	updateEdgesGeometry() {
		let gl = this.gl;
		let edges = this.network.indexedEdges;
		let positions = this.network.positions;
		let colors = this.network.colors;
		if(this.fastEdges){
			if(!this.fastEdgesGeometry){
				this._buildEdgesGeometry();
			}
			gl.bindBuffer(gl.ARRAY_BUFFER, this.fastEdgesGeometry.vertexObject);
			gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STREAM_DRAW);
			gl.bindBuffer(gl.ARRAY_BUFFER, this.fastEdgesGeometry.colorObject);
			gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fastEdgesGeometry.indexObject);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.fastEdgesIndicesArray, gl.STREAM_DRAW);
		}else{

			let gl = this.gl;
			this.network.updateEdgePositions();
			this.network.updateEdgeColors();
			this.network.updateEdgeSizes();
			this._updateEdgeIndices();

			let edgePositions = this.network.positions;
			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.verticesBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, this.network.edgePositions, gl.DYNAMIC_DRAW);

			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.colorBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, this.network.edgeColors, gl.DYNAMIC_DRAW);

			// gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.edgesGeometry.indexBuffer);
			// gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.edgesGeometry.edgesIndexArray, gl.DYNAMIC_DRAW);

			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.sizeBuffer);
			gl.bufferData(gl.ARRAY_BUFFER, this.network.edgeSizes, gl.DYNAMIC_DRAW);
		}
		
	}

	resizeGL(newWidth, newHeight) {
		this.pickingFramebuffer.setSize(newWidth*this.pickingResolutionRatio, newHeight*this.pickingResolutionRatio);
		// window.requestAnimationFrame(() => this.redraw());
		this.render(true);
	}



	_setupCamera() {
		// this.canvasElement.onmousedown = event=>this.handleMouseDown(event);
		// document.onmouseup = event=>this.handleMouseUp(event);
		// document.onmousemove = event=>this.handleMouseMove(event);
		// document.onclick = void(0);
		
		
		this.zoom = d3Zoom().on("zoom", event => {
			this.interacting=true;
			this._zoomFactor = event.transform.k;
			this.triggerHoverEvents(event);
			// check if prevX is undefined
			if(this.prevK=== undefined){
				this.prevK = event.transform.k;
			}
			let dx = 0;
			let dy = 0;
			if(this.prevK == event.transform.k){
				if(this.prevX=== undefined){
					dx = event.transform.x;
					dy = event.transform.y;
				}else{
					dx = event.transform.x - this.prevX*this._zoomFactor;
					dy = event.transform.y - this.prevY*this._zoomFactor;
				}
			}else{
			}
			
			this.prevX = event.transform.x/this._zoomFactor;
			this.prevY = event.transform.y/this._zoomFactor;
			this.prevK = event.transform.k;
			
		// 	if (!this.positionInterpolator) {
		// 		this.update();
		// 		this.render();
		// 	}
		// 	// event => event.preventDefault();
		// })
		// // this.drag = d3Drag().on("drag", event => {
		// // 	let dx = event.dx;
		// // 	let dy = event.dy;
		
		// this.zoom2 = d3Zoom().scaleExtent([1.0,1.0]).on("zoom", event => {
		// 	console.log("ZOOM 2")
		// 	// let dx = event.dx;
		// 	// let dy = event.dy;
			// let dx = 0;
			// let dy = 0;
			// if(this.prevX=== undefined){
			// 	dx = event.transform.x;
			// 	dy = event.transform.y;
			// }else{
			// 	dx = event.transform.x - this.prevX;
			// 	dy = event.transform.y - this.prevY;
			// }
			
			let newRotationMatrix = glm.mat4.create();
			// console.log(event.sourceEvent.shiftKey)
			if (this._use2D || event.sourceEvent?.shiftKey) {
				let perspectiveFactor = this.cameraDistance * this._zoomFactor;
				let aspectRatio = this.canvasElement.width / this.canvasElement.height;
				if(this._centerNodes.length==0){
					this.panX = this.panX + dx/this._zoomFactor;///400;
					this.panY = this.panY - dy/this._zoomFactor;///400;
				}
			} else {//pan
				glm.mat4.identity(newRotationMatrix);
				glm.mat4.rotate(newRotationMatrix, newRotationMatrix, glUtils.degToRad( dx/ 2), [0, 1, 0]);
				glm.mat4.rotate(newRotationMatrix, newRotationMatrix, glUtils.degToRad(dy / 2), [1, 0, 0]);

				glm.mat4.multiply(this.rotationMatrix, newRotationMatrix, this.rotationMatrix);
			}
			
			this.update();
			this.render();
			// this.triggerHoverEvents(event);
			event => event.preventDefault();
		})
		// .on("start", event => {
		// 	console.log("start")
		// })
		.on("end", event => {this.interacting=false;});
		
		d3Select(this.canvasElement)//
			// .call(d3ZoomTransform, d3ZoomIdentity.translate(0, 0).scale(this.cameraDistance))
			// .call(this.drag)
			.call(this.zoom)
			// .on("mousedown.drag", null)
			// .on("touchstart.drag", null)
			// .on("touchmove.drag", null)
			// .on("touchend.drag", null)
			.on("dblclick.zoom", null);


		// this.zoomFactor(0.05)
		// this.zoomFactor(1.0,500);
	}
	zoomFactor(zoomFactor,duration){
		if(zoomFactor !== undefined){
			if(duration === undefined){
				d3Select(this.canvasElement).call(this.zoom.transform, d3ZoomIdentity.translate(0, 0).scale(zoomFactor))
			}else{
				d3Select(this.canvasElement).transition().ease(d3Ease.easeLinear).duration(duration).call(this.zoom.transform, d3ZoomIdentity.translate(0, 0).scale(zoomFactor))
			}
			return this;
		}else{
			return this._zoomFactor;
		}
	}

	willResizeEvent(event) {
		//requestAnimFrame(function(){
		let dpr = window.devicePixelRatio || 1;
		if(dpr<2.0 || this.forceSupersample){
			dpr=2.0;
		}
		
		this.canvasElement.style.width = this.element.clientWidth + "px";
		this.canvasElement.style.height = this.element.clientHeight + "px";
		this.canvasElement.width = dpr * this.element.clientWidth;
		this.canvasElement.height = dpr * this.element.clientHeight;
		this.resizeGL(this.canvasElement.width, this.canvasElement.height);
		this.onResizeCallback?.(event);
		//});
	}


	redraw() {
		this._redrawAll(null,false); // Normal
		this._redrawAll(this.pickingFramebuffer,true); // Picking
		this.onDrawCallback?.();
		this.triggerHoverEvents(null);
		return this;
	}


	update(immediate = false, nodes=true, edges=true) {
		this.scheduler.schedule({
			name: "9.0.update",
			callback: null,
			delay:0,
			repeat:false,
			synchronized:true,
			immediateUpdates:immediate,
			// redraw: true,
			updateNodesGeometry: nodes,
			updateEdgesGeometry: edges,
		});
		return this;
	}
	

	render(immediate = false) {
		// if (!this.positionInterpolator) {
		// 	window.requestAnimationFrame(() => this.redraw());
		// }
		
		this.scheduler.schedule({
			name: "9.9.render",
			callback: null,
			delay:0,
			repeat:false,
			synchronized:true,
			immediateUpdates:immediate,
			redraw: true,
			// updateNodesGeometry: true,
			// updateEdgesGeometry: true,
		});
		return this;
	}


	//destination null = normal

	_redrawPrepare(destination,isPicking, viewport) {
		let gl = this.gl;

		const fbWidth = destination?.size.width || this.canvasElement.width;
		const fbHeight = destination?.size.height || this.canvasElement.height;
		if (destination==null) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.clearColor(...this._backgroundColor);
		} else if (isPicking){
			gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
			gl.clearColor(0.0, 0.0, 0.0, 0.0);
		} else {
			gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
			if(typeof destination.backgroundColor === "undefined"){
				gl.clearColor(...this._backgroundColor);
			}else{
				gl.clearColor(...destination.backgroundColor);
			}
		}

		if(typeof viewport=== "undefined"){
			gl.viewport(0, 0, fbWidth, fbHeight);
		}else{
			gl.viewport(...viewport);
		}

		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		gl.depthFunc(gl.LEQUAL);

		this.projectionMatrix = glm.mat4.create();
		this.viewMatrix = glm.mat4.create();

		glm.mat4.perspective(this.projectionMatrix, Math.PI * 2 / 360 * 70, fbWidth / fbHeight, 1.0, 10000.0);
		// let orthoRescaleFactor = isPicking?this.pickingResolutionRatio:1.0;
		// glm.mat4.ortho(this.projectionMatrix,
		// 	-fbWidth / this._zoomFactor/orthoRescaleFactor,
		// 	 fbWidth / this._zoomFactor/orthoRescaleFactor,
		// 	-fbHeight / this._zoomFactor/orthoRescaleFactor,
		// 	 fbHeight / this._zoomFactor/orthoRescaleFactor,
		// 	 -10000.0, 10000.0);

		glm.mat4.identity(this.viewMatrix);
		glm.mat4.translate(this.viewMatrix, this.viewMatrix, [this.panX, this.panY, -this.cameraDistance / this._zoomFactor]);


		glm.mat4.multiply(this.viewMatrix, this.viewMatrix, this.rotationMatrix);
		// glm.mat4.scale(this.viewMatrix, this.viewMatrix, [this._zoomFactor, this._zoomFactor, this._zoomFactor]);
		glm.mat4.translate(this.viewMatrix, this.viewMatrix, this.translatePosition);


	}
	
	_redrawNodes(destination,isPicking) {
		let gl = this.gl;
		let ext = gl.getExtension("ANGLE_instanced_arrays");


		let currentShaderProgram;
		if (!isPicking) {
			// console.log(this.nodesShaderProgram);
			gl.enable(gl.BLEND);
				// if(this.useAdditiveBLending){
			// gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			// 	}else{
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			// gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
			// 	gl.ZERO, gl.ONE);
			// 	}
			if(this.useShadedNodes){
				currentShaderProgram = this.nodesShaderProgram;
			}else{
				currentShaderProgram = this.nodesFastShaderProgram;
			}
		} else {
			gl.disable(gl.BLEND);
			// console.log(this.nodesShaderProgram);
			currentShaderProgram = this.nodesPickingShaderProgram;
		}

		currentShaderProgram.use(gl);
		currentShaderProgram.attributes.enable("vertex");
		// currentShaderProgram.attributes.enable("normal");
		currentShaderProgram.attributes.enable("position");
		currentShaderProgram.attributes.enable("size");
		currentShaderProgram.attributes.enable("outlineWidth");
		currentShaderProgram.attributes.enable("outlineColor");
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
		
		gl.uniform1f(currentShaderProgram.uniforms.globalOpacityScale, this._nodesGlobalOpacityScale);
		gl.uniform1f(currentShaderProgram.uniforms.globalOpacityBase, this._nodesGlobalOpacityBase);

		gl.uniform1f(currentShaderProgram.uniforms.globalSizeScale, this._nodesGlobalSizeScale);
		gl.uniform1f(currentShaderProgram.uniforms.globalSizeBase, this._nodesGlobalSizeBase);

		gl.uniform1f(currentShaderProgram.uniforms.globalOutlineWidthScale, this._nodesGlobalOutlineWidthScale);
		gl.uniform1f(currentShaderProgram.uniforms.globalOutlineWidthBase, this._nodesGlobalOutlineWidthBase);

		let normalMatrix = glm.mat3.create();
		glm.mat3.normalFromMat4(normalMatrix, this.viewMatrix);
		gl.uniformMatrix3fv(currentShaderProgram.uniforms.normalMatrix, false, normalMatrix);

		// Geometry Mutators and colors obtained from the network properties
		let colorsArray = this.network.colors;
		let positionsArray = this.network.positions;
		let sizeValue = this.network.sizes;
		let outlineWidthValue = this.network.outlineWidths;

		// Bind the instance position data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesPositionBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.position);
		gl.vertexAttribPointer(currentShaderProgram.attributes.position, 3, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.position, 1); // This makes it instanced!

		// Bind the instance color data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesColorBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.color);
		gl.vertexAttribPointer(currentShaderProgram.attributes.color, 4, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.color, 1); // This makes it instanced!

		// Bind the instance color data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesSizeBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.size);
		gl.vertexAttribPointer(currentShaderProgram.attributes.size, 1, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.size, 1); // This makes it instanced!

		// Bind the instance color data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineColorBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.outlineColor);
		gl.vertexAttribPointer(currentShaderProgram.attributes.outlineColor, 4, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.outlineColor, 1); // This makes it instanced!

		// Bind the instance color data
		gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesOutlineWidthBuffer);
		gl.enableVertexAttribArray(currentShaderProgram.attributes.outlineWidth);
		gl.vertexAttribPointer(currentShaderProgram.attributes.outlineWidth, 1, gl.FLOAT, false, 0, 0);
		ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.outlineWidth, 1); // This makes it instanced!

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

		// Disable attributes
		currentShaderProgram.attributes.disable("vertex");
		// this.nodesShaderProgram.attributes.disable("normal");
		currentShaderProgram.attributes.disable("position");
		currentShaderProgram.attributes.disable("size");
		currentShaderProgram.attributes.disable("outlineWidth");
		currentShaderProgram.attributes.disable("outlineColor");
		currentShaderProgram.attributes.disable("encodedIndex");
	}

	_redrawEdges(destination,isPicking) {

		let hasEdgeCallbacks = this.onEdgeClickCallback
				|| this.onEdgeHoverMoveCallback
				|| this.onEdgeHoverStartCallback
				|| this.onEdgeHoverEndCallback
				|| this.onEdgeDoubleClickCallback
				|| this.onEdgeClickCallback;
		
		if(isPicking && (this.fastEdges || !hasEdgeCallbacks)) {
			return // no picking for fast edges or no callbacks
		}

		let gl = this.gl;
		let ext = gl.getExtension("ANGLE_instanced_arrays");
		
		let currentShaderProgram;
		if (!isPicking) {
			gl.enable(gl.BLEND);
			// 	//Edges are rendered with additive blending.
			// 	gl.enable(gl.BLEND);
			if(this.useAdditiveBlending) {
				gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
			}else{
				// gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
				// gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
				// gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE ); //Original from Networks 3D
				gl.blendFuncSeparate( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE ); // New (works for transparent background)
			}
			if (this.fastEdges) {
				currentShaderProgram = this.edgesFastShaderProgram;
			}else{
				currentShaderProgram = this.edgesShaderProgram;
			}
		} else {
			gl.disable(gl.BLEND);
			// console.log("PICKING EDGESSSS");
			currentShaderProgram = this.edgesPickingShaderProgram;
		}

		if (this.fastEdges) {
			// console.log(this.edgesShaderProgram)

			currentShaderProgram.use(gl);
			currentShaderProgram.attributes.enable("vertex");
			currentShaderProgram.attributes.enable("color");
			// currentShaderProgram.attributes.enable("encodedIndex");

			
			this.projectionViewMatrix = glm.mat4.create();
			glm.mat4.multiply(this.projectionViewMatrix, this.projectionMatrix, this.viewMatrix);
			
			//bind attributes and unions
			gl.bindBuffer(gl.ARRAY_BUFFER, this.fastEdgesGeometry.vertexObject);
			gl.vertexAttribPointer(currentShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.vertex, 0); // This makes it instanced!

			gl.bindBuffer(gl.ARRAY_BUFFER, this.fastEdgesGeometry.colorObject);
			gl.vertexAttribPointer(currentShaderProgram.attributes.color, 4, gl.FLOAT, false, 0, 0);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.color, 0); // This makes it instanced!

			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.fastEdgesGeometry.indexObject);

			gl.uniformMatrix4fv(currentShaderProgram.uniforms.projectionViewMatrix, false, this.projectionViewMatrix);

			//gl.uniform2fv(edgesShaderProgram.uniforms.nearFar,[0.1,10.0]);
			gl.uniform1f(currentShaderProgram.uniforms.globalOpacityScale, this._edgesGlobalOpacityScale);
			gl.uniform1f(currentShaderProgram.uniforms.globalOpacityBase, this._edgesGlobalOpacityBase);
			

			//drawElements is called only 1 time. no overhead from javascript
			gl.drawElements(gl.LINES, this.fastEdgesGeometry.numIndices, this.fastEdgesGeometry.indexType, 0);

			//disabling attributes
			currentShaderProgram.attributes.disable("vertex");
			currentShaderProgram.attributes.disable("color");
			// currentShaderProgram.attributes.disable("encodedIndex");
		}else{
			currentShaderProgram.use(gl);
			currentShaderProgram.attributes.enable("fromVertex");
			currentShaderProgram.attributes.enable("toVertex");
			currentShaderProgram.attributes.enable("vertexType");
			currentShaderProgram.attributes.enable("fromColor");
			currentShaderProgram.attributes.enable("toColor");
			currentShaderProgram.attributes.enable("fromSize");
			currentShaderProgram.attributes.enable("toSize");
			currentShaderProgram.attributes.enable("encodedIndex");

			// newGeometry.edgeVertexTypeBuffer = gl.createBuffer();
			// newGeometry.verticesBuffer = gl.createBuffer();
			// newGeometry.colorBuffer = gl.createBuffer();
			// newGeometry.sizeBuffer = gl.createBuffer();
			// newGeometry.indexBuffer = gl.createBuffer();
			// console.log(currentShaderProgram.attributes);
			this.projectionViewMatrix = glm.mat4.create();
			glm.mat4.multiply(this.projectionViewMatrix, this.projectionMatrix, this.viewMatrix);

			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.edgeVertexTypeBuffer);
			gl.vertexAttribPointer(currentShaderProgram.attributes.vertexType, 2, gl.FLOAT, false, 0, 0);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.vertexType, 0);
			
			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.verticesBuffer);
			gl.vertexAttribPointer(currentShaderProgram.attributes.fromVertex, 3, gl.FLOAT, false, 4*3*2, 0);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.fromVertex, 1);
			
			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.verticesBuffer);
			gl.vertexAttribPointer(currentShaderProgram.attributes.toVertex, 3, gl.FLOAT, false, 4*3*2, 4*3);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.toVertex, 1);

			
			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.colorBuffer);
			gl.vertexAttribPointer(currentShaderProgram.attributes.fromColor, 4, gl.FLOAT, false, 4*4*2, 0);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.fromColor, 1);
			gl.vertexAttribPointer(currentShaderProgram.attributes.toColor, 4, gl.FLOAT, false, 4*4*2, 4*4);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.toColor, 1);

			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.sizeBuffer);
			gl.vertexAttribPointer(currentShaderProgram.attributes.fromSize, 1, gl.FLOAT, false, 4*2, 0);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.fromSize, 1);
			gl.vertexAttribPointer(currentShaderProgram.attributes.toSize, 1, gl.FLOAT, false, 4*2, 4);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.toSize, 1);


			gl.bindBuffer(gl.ARRAY_BUFFER, this.edgesGeometry.indexBuffer);
			gl.enableVertexAttribArray(currentShaderProgram.attributes.encodedIndex);
			gl.vertexAttribPointer(currentShaderProgram.attributes.encodedIndex, 4, gl.FLOAT, false, 0, 0);
			ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.encodedIndex, 1); // This makes it instanced!

			// gl.bindBuffer(gl.ARRAY_BUFFER, this.nodesGeometry.normalObject);
			// gl.vertexAttribPointer(currentShaderProgram.attributes.normal, 3, gl.FLOAT, false, 0, 0);
			// ext.vertexAttribDivisorANGLE(currentShaderProgram.attributes.normal, 0); 

			gl.uniformMatrix4fv(currentShaderProgram.uniforms.projectionMatrix, false, this.projectionMatrix);
			gl.uniformMatrix4fv(currentShaderProgram.uniforms.viewMatrix, false, this.viewMatrix);

			//gl.uniform2fv(edgesShaderProgram.uniforms.nearFar,[0.1,10.0]);
			gl.uniform1f(currentShaderProgram.uniforms.globalOpacityScale, this._edgesGlobalOpacityScale);
			gl.uniform1f(currentShaderProgram.uniforms.globalOpacityBase, this._edgesGlobalOpacityBase);
			
			gl.uniform1f(currentShaderProgram.uniforms.globalWidthScale, this._edgesGlobalWidthScale);
			gl.uniform1f(currentShaderProgram.uniforms.globalWidthBase, this._edgesGlobalWidthBase);

			gl.uniform1f(currentShaderProgram.uniforms.globalSizeScale, this._nodesGlobalSizeScale);
			gl.uniform1f(currentShaderProgram.uniforms.globalSizeBase, this._nodesGlobalSizeBase);

			// 01,11,21
			// let cameraUp = glm.vec3.fromValues(this.viewMatrix[1], this.viewMatrix[5], this.viewMatrix[9]);
			// // let cameraUp = glm.vec3.fromValues(0, 1.0, 0);
			// // 00,10,20
			// let cameraRight = glm.vec3.fromValues(this.viewMatrix[0], this.viewMatrix[4], this.viewMatrix[8]);
			// let cameraForward = glm.vec3.fromValues(this.viewMatrix[2], this.viewMatrix[6], this.viewMatrix[10]);

			// console.log(cameraUp);
			// glm.vec3.normalize(cameraUp, cameraUp);
			// glm.vec3.normalize(cameraRight, cameraRight);
			// glm.vec3.cross(cameraForward,cameraUp,cameraRight);
			// glm.vec3.normalize(cameraForward, cameraForward);
			// gl.uniform3fv(currentShaderProgram.uniforms.cameraUp, cameraUp);
			// gl.uniform3fv(currentShaderProgram.uniforms.cameraRight, cameraRight);
			// gl.uniform3fv(currentShaderProgram.uniforms.cameraForward, cameraForward);
			// cameraRight;// = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
			// cameraUp;// = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
			// cameraForward;// = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
			
			ext.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, this.edgesGeometry.count);
			
			currentShaderProgram.attributes.disable("fromVertex");
			currentShaderProgram.attributes.disable("toVertex");
			currentShaderProgram.attributes.disable("vertexType");
			currentShaderProgram.attributes.disable("fromColor");
			currentShaderProgram.attributes.disable("toColor");
			currentShaderProgram.attributes.disable("fromSize");
			currentShaderProgram.attributes.disable("toSize");
			currentShaderProgram.attributes.disable("encodedIndex");
			// console.log("PICKING? " + isPicking)
		}
	}

	_redrawAll(destination,isPicking) {
		if(typeof isPicking === 'undefined'){
			isPicking = false;
		}
		let gl = this.gl;
		// isPicking=true;
		this._redrawPrepare(destination,isPicking);
		gl.depthMask(true);
		if(this._use2D){
			gl.disable(gl.DEPTH_TEST);
			gl.depthMask(false);
			this._redrawEdges(destination,isPicking);
			this._redrawNodes(destination,isPicking);
		}else{
			gl.enable(gl.DEPTH_TEST);
			this._redrawNodes(destination,isPicking);
			gl.depthMask(false);
			this._redrawEdges(destination,isPicking);
			gl.depthMask(true);
		}
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
	
	_updateCenterNodesPosition(){
		this.targetTranslatePosition[0] = 0;
		this.targetTranslatePosition[1] = 0;
		this.targetTranslatePosition[2] = 0;
		
		if(this._centerNodes && this._centerNodes.length > 0){
			for (let i = 0; i < this._centerNodes.length; i++) {
				let node = this._centerNodes[i];
				// if node is not of type node, get node by id
				let pos = node.position;
				this.targetTranslatePosition[0] -= pos[0];
				this.targetTranslatePosition[1] -= pos[1];
				this.targetTranslatePosition[2] -= pos[2];
			}
			let lengthSize = this._centerNodes.length;
			this.targetTranslatePosition[0] /= lengthSize;
			this.targetTranslatePosition[1] /= lengthSize;
			this.targetTranslatePosition[2] /= lengthSize;
		}
	}

	centerOnNodes(nodes, duration) {
		//
		this._centerNodes = [];
		for(let i = 0; i < nodes.length; i++){
			let node = nodes[i];
			if (node.ID === undefined) {
				node = this.network.nodes[node];
			}
			this._centerNodes.push(node);
		}
		
		this.lastTranslatePosition[0] = this.translatePosition[0];
		this.lastTranslatePosition[1] = this.translatePosition[1];
		this.lastTranslatePosition[2] = this.translatePosition[2];
		this.lastPanX = this.panX;
		this.lastPanY = this.panY;
		if(duration === undefined || duration<=0){
			this.translateDuration = 0;
			this.translateStartTime = null;
			// this.update(); No need to update?
			// this.render();
		}else{
			this.translateDuration = duration;
			this.translateStartTime = performance.now();
		}
		this.scheduleCameraInterpolation();
		return this;
	}

	centeredNodes(){
		return this._centerNodes;
	}

	updateCameraInterpolation(ignoreInstantaneousUpdate=false) {
		if(this.translateDuration==0){
			if(!ignoreInstantaneousUpdate){
				this.translatePosition[0] = this.targetTranslatePosition[0];
				this.translatePosition[1] = this.targetTranslatePosition[1];
				this.translatePosition[2] = this.targetTranslatePosition[2];
				this.panX = 0;
				this.panY = 0;
			}
			return false; //no need to continue
		}else{
			let elapsedTime = performance.now()-this.translateStartTime;
			let alpha = elapsedTime/this.translateDuration;
			if(alpha>1){
				alpha=1.0;
			}
			// console.log(elapsedTime);
			this.translatePosition[0] = (1.0-alpha)*this.lastTranslatePosition[0];
			this.translatePosition[1] = (1.0-alpha)*this.lastTranslatePosition[1];
			this.translatePosition[2] = (1.0-alpha)*this.lastTranslatePosition[2];

			this.translatePosition[0] += alpha*this.targetTranslatePosition[0];
			this.translatePosition[1] += alpha*this.targetTranslatePosition[1];
			this.translatePosition[2] += alpha*this.targetTranslatePosition[2];
			
			this.panX = (1.0-alpha)*this.lastPanX;
			this.panY = (1.0-alpha)*this.lastPanY;
			this.panX += alpha*this.targetPanX;
			this.panY += alpha*this.targetPanY;

			if(alpha>=1.0){
				return false;
			}else{
				return true;
			}
		}
	}

	scheduleCameraInterpolation(){
		let cameraInterpolatorTask = {
			name: "1.1.cameraInterpolator",
			callback: (elapsedTime,task)=>{
				this._updateCenterNodesPosition();
				if (!this.updateCameraInterpolation()) {

					this.scheduler.unschedule("1.1.cameraInterpolator");
				}
			},
			delay:0,
			repeat:true,
			synchronized:true,
			immediateUpdates:false,
			redraw: true,
			updateNodesGeometry: false,
			updateEdgesGeometry: false,
		}
		this.scheduler.schedule({
			name: "1.0.cameraInterpolator",
			callback: (elapsedTime,task)=>{
				this.scheduler.schedule(cameraInterpolatorTask);
			},
			delay:0,
			repeat:false,
			synchronized:true,
			immediateUpdates:false,
			redraw: false,
			updateNodesGeometry: false,
			updateEdgesGeometry: false,
		});
	}

	onResize(callback) {
		this.onResizeCallback = callback;
		return this;
	}
	onNodeClick(callback) {
		this.onNodeClickCallback = callback;
		return this;
	}
	onNodeDoubleClick(callback) {
		this.onNodeDoubleClickCallback = callback;
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
	

	onEdgeClick(callback) {
		this.onEdgeClickCallback = callback;
		return this;
	}
	onEdgeDoubleClick(callback) {
		this.onEdgeDoubleClickCallback = callback;
		return this;
	}
	onEdgeHoverStart(callback) {
		this.onEdgeHoverStartCallback = callback;
		return this;
	}
	onEdgeHoverEnd(callback) {
		this.onEdgeHoverEndCallback = callback;
		return this;
	}
	onEdgeHoverMove(callback) {
		this.onEdgeHoverMoveCallback = callback;
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
		this?.layoutWorker.onStart(() =>{
			this.onLayoutStartCallback?.();
		});
		return this;
	}
	onLayoutStop(callback) {
		this.onLayoutStopCallback = callback;
		this?.layoutWorker.onStop(() =>{
			this.onLayoutStopCallback?.();
		});
		return this;
	}
	onDraw(callback) {
		this.onDrawCallback = callback;
		return this;
	}
	onReady(callback){
		if(this.isReady){
			callback?.(this);
		}else{
			this.onReadyCallback = callback;
		}
	}

	backgroundColor(color) {
		// check if color is defined
		if (typeof color === "undefined") {
			return this._backgroundColor;
		} else {
			this._backgroundColor = color;
			return this;
		}
	}


	nodeColor(colorInput, nodeID) {
		if (typeof nodeID === "undefined") {
			if (typeof colorInput === "undefined") {
				return this.network.colors;
			} else if (typeof colorInput === "function") {
				// This may be used in future if we want to have a dynamic nodes
				// for (const [nodeID, node] of Object.entries(this.network.nodes)) {
				// 	let nodeIndex = this.network.ID2index[nodeID];

				let allNodes = this.network.index2Node;
				for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
					let node = allNodes[nodeIndex];
					let aColor = colorInput(node, nodeIndex, this.network);
					this.network.colors[nodeIndex * 4 + 0] = aColor[0];
					this.network.colors[nodeIndex * 4 + 1] = aColor[1];
					this.network.colors[nodeIndex * 4 + 2] = aColor[2];
					if(aColor.length > 3){
						this.network.colors[nodeIndex * 4 + 3] = aColor[3];
					}

				}
			} else if (typeof colorInput === "number") {
				//index
				return this.network.colors[this.network.ID2index[colorInput]];
			} else {
				let allNodes = this.network.index2Node;
				for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
					this.network.colors[nodeIndex * 4 + 0] = colorInput[0];
					this.network.colors[nodeIndex * 4 + 1] = colorInput[1];
					this.network.colors[nodeIndex * 4 + 2] = colorInput[2];
					if(colorInput.length > 3){
						this.network.colors[nodeIndex * 4 + 3] = colorInput[3];
					}
				}
			}
		} else {
			if (typeof colorInput === "function") {
				let nodeIndex = this.network.ID2index[nodeID];
				let aColor = colorInput(nodeID, nodeIndex, this.network);
				this.network.colors[nodeIndex * 4 + 0] = aColor[0];
				this.network.colors[nodeIndex * 4 + 1] = aColor[1];
				this.network.colors[nodeIndex * 4 + 2] = aColor[2];
				if(aColor.length > 3){
					this.network.colors[nodeIndex * 4 + 3] = aColor[3];
				}
			} else {
				let nodeIndex = this.network.ID2index[nodeID];
				this.network.colors[nodeIndex * 4 + 0] = colorInput[0];
				this.network.colors[nodeIndex * 4 + 1] = colorInput[1];
				this.network.colors[nodeIndex * 4 + 2] = colorInput[2];
				if(colorInput.length > 3){
					this.network.colors[nodeIndex * 4 + 3] = colorInput[3];
				}
			}
		}
		return this;
	}


	nodeSize(sizeInput, nodeID) {
		if (typeof nodeID === "undefined") {
			if (typeof sizeInput === "undefined") {
				return this.network.sizes;
			} else if (typeof sizeInput === "function") {
				let allNodes = this.network.index2Node;
				for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
					let node = allNodes[nodeIndex];
					let aSize = sizeInput(node, this.network);
					this.network.sizes[nodeIndex] = aSize;
				}
			} else {
				let allNodes = this.network.index2Node;
				for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
					this.network.sizes[nodeIndex] = sizeInput;
				}
			}
		} else {
			if (typeof sizeInput === "function") {
				let aSize = sizeInput(nodeID, this.network);
				let nodeIndex = this.network.ID2index[nodeID];
				this.network.sizes[nodeIndex] = aSize;
			} else {
				let nodeIndex = this.network.ID2index[nodeID];
				this.network.sizes[nodeIndex] = sizeInput;
			}
		}
		return this;
	}


	nodeOutlineColor(colorInput, nodeID) {
		if (typeof nodeID === "undefined") {
			if (typeof colorInput === "undefined") {
				return this.network.outlineColors;
			} else if (typeof colorInput === "function") {
				let allNodes = this.network.index2Node;
				for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
					let node = allNodes[nodeIndex];
					let aColor = colorInput(node, nodeIndex, this.network);
					this.network.outlineColors[nodeIndex * 4 + 0] = aColor[0];
					this.network.outlineColors[nodeIndex * 4 + 1] = aColor[1];
					this.network.outlineColors[nodeIndex * 4 + 2] = aColor[2];
					if(aColor.length > 3){
						this.network.outlineColors[nodeIndex * 4 + 3] = aColor[3];
					}
				}
			} else if (typeof colorInput === "number") {
				//index
				return this.network.outlineColors[this.network.ID2index[colorInput]];
			} else {
				let allNodes = this.network.index2Node;
				for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
					this.network.outlineColors[nodeIndex * 4 + 0] = colorInput[0];
					this.network.outlineColors[nodeIndex * 4 + 1] = colorInput[1];
					this.network.outlineColors[nodeIndex * 4 + 2] = colorInput[2];
					if(colorInput.length > 3){
						this.network.outlineColors[nodeIndex * 4 + 3] = colorInput[3];
					}
				}
			}
		} else {
			if (typeof colorInput === "function") {
				let nodeIndex = this.network.ID2index[nodeID];
				let aColor = colorInput(nodeID, nodeIndex, this.network);
				this.network.outlineColors[nodeIndex * 4 + 0] = aColor[0];
				this.network.outlineColors[nodeIndex * 4 + 1] = aColor[1];
				this.network.outlineColors[nodeIndex * 4 + 2] = aColor[2];
				if(aColor.length > 3){
					this.network.outlineColors[nodeIndex * 4 + 3] = aColor[3];
				}
			} else {
				let nodeIndex = this.network.ID2index[nodeID];
				this.network.outlineColors[nodeIndex * 4 + 0] = colorInput[0];
				this.network.outlineColors[nodeIndex * 4 + 1] = colorInput[1];
				this.network.outlineColors[nodeIndex * 4 + 2] = colorInput[2];
				if(colorInput.length > 3){
					this.network.outlineColors[nodeIndex * 4 + 3] = colorInput[3];
				}
			}
		}
		return this;
	}


	nodeOutlineWidth(widthInput, nodeID) {
		if (typeof nodeID === "undefined") {
			if (typeof widthInput === "undefined") {
				return this.network.outlineWidths;
			} else if (typeof widthInput === "function") {
				let allNodes = this.network.index2Node;
				for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
					let node = allNodes[nodeIndex];
					let aWidth = widthInput(node, this.network);
					this.network.outlineWidths[node.index] = aWidth;
				}
			} else {
				let allNodes = this.network.index2Node;
				for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
					this.network.outlineWidths[nodeIndex] = widthInput;
				}
			}
		} else {
			if (typeof widthInput === "function") {
				let aWidth = widthInput(nodeID, this.network);
				let nodeIndex = this.network.ID2index[nodeID];
				this.network.outlineWidths[nodeIndex] = aWidth;
			} else {
				let nodeIndex = this.network.ID2index[nodeID];
				this.network.outlineWidths[nodeIndex] = widthInput;
			}
		}
		return this;
	}



	pickPoint(x, y) {
		const fbWidth = this.canvasElement.width * this.pickingResolutionRatio;
		const fbHeight = this.canvasElement.height * this.pickingResolutionRatio;
		const pixelX = Math.round(x * fbWidth / this.canvasElement.clientWidth - 0.5);
		const pixelY = Math.round(fbHeight - y * fbHeight / this.canvasElement.clientHeight - 0.5);
		const data = new Uint8Array(4);
		let gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.pickingFramebuffer);
		gl.readPixels(
			pixelX,            // x
			pixelY,            // y
			1,                 // width
			1,                 // height
			gl.RGBA,           // format
			gl.UNSIGNED_BYTE,  // type
			data);             // typed array to hold result
		const ID = (data[0] + (data[1] << 8) + (data[2] << 16) + (data[3] << 24)) - 1;
		return ID;
	}

	edgesGlobalOpacityScale(opacity) {
		// check if color is defined
		if (typeof opacity === "undefined") {
			return this._edgesGlobalOpacityScale;
		} else {
			this._edgesGlobalOpacityScale = opacity;
			return this;
		}
	}

	edgesGlobalOpacityBase(opacity) {
		// check if color is defined
		if (typeof opacity === "undefined") {
			return this._edgesGlobalOpacityBase;
		} else {
			this._edgesGlobalOpacityBase = opacity;
			return this;
		}
	}

	edgesGlobalWidthScale(width) {
		// check if color is defined
		if (typeof width === "undefined") {
			return this._edgesGlobalWidthScale;
		} else {
			this._edgesGlobalWidthScale = width;
			return this;
		}
	}

	edgesGlobalWidthBase(width) {
		// check if color is defined
		if (typeof width === "undefined") {
			return this._edgesGlobalWidthBase;
		} else {
			this._edgesGlobalWidthBase = width;
			return this;
		}
	}


	nodesGlobalOpacityScale(opacity) {
		// check if color is defined
		if (typeof opacity === "undefined") {
			return this._nodesGlobalOpacityScale;
		} else {
			this._nodesGlobalOpacityScale = opacity;
			return this;
		}
	}

	nodesGlobalOpacityBase(opacity) {
		// check if color is defined
		if (typeof opacity === "undefined") {
			return this._nodesGlobalOpacityBase;
		} else {
			this._nodesGlobalOpacityBase = opacity;
			return this;
		}
	}
	
	nodesGlobalSizeScale(size) {
		// check if color is defined
		if (typeof size === "undefined") {
			return this._nodesGlobalSizeScale;
		} else {
			this._nodesGlobalSizeScale = size;
			return this;
		}
	}

	nodesGlobalSizeBase(size) {
		// check if color is defined
		if (typeof size === "undefined") {
			return this._nodesGlobalSizeBase;
		} else {
			this._nodesGlobalSizeBase = size;
			return this;
		}
	}

	nodesGlobalOutlineWidthScale(width) {
		// check if color is defined
		if (typeof width === "undefined") {
			return this._nodesGlobalOutlineWidthScale;
		} else {
			this._nodesGlobalOutlineWidthScale = width;
			return this;
		}
	}

	nodesGlobalOutlineWidthBase(width) {
		// check if color is defined
		if (typeof width === "undefined") {
			return this._nodesGlobalOutlineWidthBase;
		} else {
			this._nodesGlobalOutlineWidthBase = width;
			return this;
		}
	}



	nodeOpacity(colorInput) {
		if (typeof colorInput === "undefined") {
			return this.network.colors.map(color => color[3]);
		} else if (typeof colorInput === "function") {
			let allNodes = this.network.index2Node;
			for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
				let node = allNodes[nodeIndex];
				let anOpacity = colorInput(node, nodeIndex, this.network);
				this.network.colors[nodeIndex * 4 + 3] = anOpacity;
			}
		}else {
			for (let nodeIndex = 0; nodeIndex < allNodes.length; nodeIndex++) {
				this.network.colors[nodeIndex * 4 + 3] = colorInput;
			}
		}
	
		return this;
	}

	additiveBlending(enableAdditiveBlending) {
		// check if color is defined
		if (typeof enableAdditiveBlending === "undefined") {
			return this.useAdditiveBlending;
		} else {
			this.useAdditiveBlending = enableAdditiveBlending;
			return this;
		}
	}
	
	shadedNodes(enableShadedNodes) {
		// check if shaded is defined
		if (typeof enableShadedNodes === "undefined") {
			return this.useShadedNodes;
		} else {
			this.useShadedNodes = enableShadedNodes;
			return this;
		}
	}


	pickeableEdges(pickables) {
		// check if color is defined
		if (typeof pickables === "undefined") {
			return this._pickeableEdges;
		} else {
			if(pickables=="all"){
				// this._pickeableEdges = new Set(pickables);
			}else{
				this._pickeableEdges = new Set(pickables);
				// console.log(this._pickeableEdges);
				this._edgeIndicesUpdate = true;
				this.update();
			}
			return this;
		}
	}

	cleanup(keepGLContext){
		// console.log("Cleanup started");
		this.isReady=false;
		this.layoutWorker.cleanup();
		this.scheduler.stop();
		this.layoutWorker = null;
		let gl = this.gl;
		this.onReadyCallback = null;

		this.onNodeClickCallback = null;
		this.onNodeDoubleClickCallback = null;
		this.onNodeHoverStartCallback = null;
		this.onNodeHoverMoveCallback = null;
		this.onNodeHoverEndCallback = null;

		this.onEdgeClickCallback = null;
		this.onEdgeDoubleClickCallback = null;
		this.onEdgeHoverStartCallback = null;
		this.onEdgeHoverMoveCallback = null;
		this.onEdgeHoverEndCallback = null;
		
		
		this.onZoomCallback = null;
		this.onRotationCallback = null;
		this.onResizeCallback = null;
		this.onLayoutStartCallback = null;
		this.onLayoutStopCallback = null;
		this.onDrawCallback = null;
		this.onReadyCallback = null;
		this.isReady=false;

		window.removeEventListener('resize', this._onresizeEvent);

		if(this.canvasElement){
			this.canvasElement.removeEventListener("click",this._clickEventListener);
			this.canvasElement.removeEventListener("dblclick",this._doubleClickEventListener);

			this.canvasElement.removeEventListener("mousemove", this._hoverMoveEventListener);
			this.canvasElement.removeEventListener("mouseleave", this._hoverLeaveEventListener);
			document.body.removeEventListener("mouseout", this._hoverLeaveWindowEventListener);
		}
		
		if(!keepGLContext && gl){
			let numTextureUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
			this.pickingFramebuffer?.discard();
			for (let unit = 0; unit < numTextureUnits; ++unit) {
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, null);
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
			}

			gl.bindBuffer(gl.ARRAY_BUFFER, null);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
			gl.bindRenderbuffer(gl.RENDERBUFFER, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);

			gl.deleteBuffer(this.nodesPositionBuffer);
			gl.deleteBuffer(this.nodesColorBuffer);
			gl.deleteBuffer(this.nodesSizeBuffer);
			gl.deleteBuffer(this.nodesSizeBuffer);
			gl.deleteBuffer(this.nodesOutlineWidthBuffer);
			gl.deleteBuffer(this.nodesOutlineColorBuffer);
			gl.deleteBuffer(this.nodesIndexBuffer);
			
			if(this.edgesGeometry){
				gl.deleteBuffer(this.edgesGeometry.edgeVertexTypeBuffer);
				gl.deleteBuffer(this.edgesGeometry.verticesBuffer);
				gl.deleteBuffer(this.edgesGeometry.colorBuffer);
				gl.deleteBuffer(this.edgesGeometry.sizeBuffer);
			}
			
			if(this.fastEdgesGeometry){
				gl.deleteBuffer(this.fastEdgesGeometry.indexBuffer);
				gl.deleteBuffer(this.fastEdgesGeometry.vertexObject);
				gl.deleteBuffer(this.fastEdgesGeometry.colorObject);
				gl.deleteBuffer(this.fastEdgesGeometry.indexObject);
			}
		}
		if(this._autoCleanup){
			this._mutationObserver.disconnect();
		}
		if(this.canvasElement){
			this.canvasElement.remove();
		}
	}
}

// Helios.xnet = xnet;
export { xnet };
