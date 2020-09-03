import * as d3 from "d3"
import * as glm from "gl-matrix"
import { Network } from "./Network"
import * as glUtils from "../utils/webglutils"

export class Helios {
	constructor(
		elementID,
		nodes = [],
		edges = [],
		onNodeClick = null,
		onEdgeClick = null,
		display = [],
	) {
		this.element = document.getElementById(elementID);
		this.element.innerHTML = '';
		this.canvasElement = document.createElement("canvas");
		this.element.appendChild(this.canvasElement);
		this.network = new Network(nodes, edges);
		// this.onNodeClick = onNodeClick;
		// this.onEdgeClick = onEdgeClick;
		this.display = display;

		this.rotationMatrix = glm.mat4.create();
		this.translatePosition = glm.vec3.create();

		this.gl = glUtils.createWebGLContext(this.canvasElement, {
			antialias: true,
			powerPreference: "high-performance",
			desynchronized: true
		});
		console.log(this.gl);
		this.initialize();
	}

	async initialize(){
		await this._setupShaders();
		await this._buildGeometry();
		await this.willResizeEvent(0);

		await this.redraw()
	}
	async _setupShaders() {
		let edgesShaderVertex = await glUtils.getShader(this.gl, "edges-vertex");
		let edgesShaderFragment = await glUtils.getShader(this.gl, "edges-fragment");
		console.log(edgesShaderFragment)
		this.edgesShaderProgram = new glUtils.ShaderProgram(
				edgesShaderVertex,
				edgesShaderFragment,
				["projectionViewMatrix","nearFar","linesIntensity"],
				["vertex","color"],
				this.gl);
		//Initializing vertices shaders
		let verticesShaderVertex = await glUtils.getShader(this.gl, "vertices-vertex");
		let verticesShaderFragment = await glUtils.getShader(this.gl, "vertices-fragment");
		
		this.verticesShaderProgram = new glUtils.ShaderProgram(verticesShaderVertex,verticesShaderFragment,
										["viewMatrix","projectionMatrix","normalMatrix",
										"position","color","intensity","scale"],
										["vertex","normal"],this.gl);
			
	}

	async _buildGeometry(){
		let gl = this.gl;
		let sphereQuality=15;
		this.vertexGeometry = glUtils.makeSphere(gl, 1.0, sphereQuality, sphereQuality);
		//vertexShape = makeBox(gl);
		
		//Depth test is essential for the desired effects
		gl.enable(gl.DEPTH_TEST);
		gl.enable(gl.CULL_FACE);
		gl.frontFace(gl.CW);
	}

	async resizeGL(newWidth, newHeight){
		this.gl.viewport(0, 0, newWidth, newHeight);
		this.redraw()
	}

	

	willResizeEvent(event){
		//requestAnimFrame(function(){
			let dpr = window.devicePixelRatio || 1;
			this.canvasElement.style.width = this.element.clientWidth+"px";
			this.canvasElement.style.height = this.element.clientHeight+"px";
			this.canvasElement.width = dpr*this.element.clientWidth;
			this.canvasElement.height = dpr*this.element.clientHeight;
			this.resizeGL(this.canvasElement.width,this.canvasElement.height);
		//});
	}

	async redraw(){
		let gl = this.gl;
		let cameraDistance = 6;

		gl.depthMask(true);
		gl.clearColor(0.5, 0.5, 0.5, 1.0);

		
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		
		gl.lineWidth(1.0);
	
		this.projectionMatrix = glm.mat4.create();
		this.viewMatrix = glm.mat4.create();
		
		glm.mat4.perspective(this.projectionMatrix, 60, this.canvasElement.width / this.canvasElement.height, 0.005, 100.0);
		glm.mat4.identity(this.viewMatrix);
		glm.mat4.translate(this.viewMatrix,this.viewMatrix, [0, 0, -cameraDistance]);

		
		glm.mat4.multiply(this.viewMatrix,this.viewMatrix, this.rotationMatrix);
		glm.mat4.scale(this.viewMatrix,this.viewMatrix,[0.01,0.01,0.01]);
		glm.mat4.translate(this.viewMatrix,this.viewMatrix,this.translatePosition);
		

		console.log(this.verticesShaderProgram);
		this.verticesShaderProgram.use(gl);
		this.verticesShaderProgram.attributes.enable("vertex");
		this.verticesShaderProgram.attributes.enable("normal");
			
		gl.disable(gl.BLEND);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexGeometry.vertexObject);
		gl.vertexAttribPointer(this.verticesShaderProgram.attributes.vertex, 3, gl.FLOAT, false, 0, 0);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexGeometry.normalObject);
		gl.vertexAttribPointer(this.verticesShaderProgram.attributes.normal, 3, gl.FLOAT, false, 0, 0);
		
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.vertexGeometry.indexObject);
	
		gl.uniformMatrix4fv(this.verticesShaderProgram.uniforms.projectionMatrix, false, this.projectionMatrix);
		gl.uniformMatrix4fv(this.verticesShaderProgram.uniforms.viewMatrix, false, this.viewMatrix);
		

		let normalMatrix = glm.mat3.create();
		glm.mat3.normalFromMat4(normalMatrix,this.viewMatrix);
		gl.uniformMatrix3fv(this.verticesShaderProgram.uniforms.normalMatrix, false, normalMatrix);
			
			// Geometry Mutators and colors obtained from the network properties
		let colorsArray = this.network.colors;
		let positionsArray = this.network.positions;
		let scaleValue = this.network.scales;
		let intensityValue = this.network.intensities;

		//Positions
		for(let i=0;i<this.network.positions.length;i+=3){
			let color = [colorsArray[i],colorsArray[i+1],colorsArray[i+2]];
			let position = [positionsArray[i],positionsArray[i+1],positionsArray[i+2]];
			let scale = scaleValue[i/3];
			let intensity = scaleValue[i/3];
			
			gl.uniform1f(this.verticesShaderProgram.uniforms.scale,scale);
			gl.uniform1f(this.verticesShaderProgram.uniforms.intensity,intensity);

			gl.uniform3fv(this.verticesShaderProgram.uniforms.color,color);
			gl.uniform3fv(this.verticesShaderProgram.uniforms.position,position);
			//draw the geometry for every position 
			//FIXME: drawElement overhead is very critical on javascript (needs to reduce drawElements calling)
			gl.drawElements(gl.TRIANGLES, this.vertexGeometry.numIndices, this.vertexGeometry.indexType, 0);
		}
			// Disable attributes
		this.verticesShaderProgram.attributes.disable("vertex");
		this.verticesShaderProgram.attributes.disable("normal");
		
		
		// projectionViewMatrix = mat4.create(projectionMatrix);
		// mat4.multiply(projectionViewMatrix,viewMatrix);
		
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
}