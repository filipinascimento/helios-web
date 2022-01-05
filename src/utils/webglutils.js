


let requestAnimationFrame = (function () {
	return window.requestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.oRequestAnimationFrame ||
		window.msRequestAnimationFrame ||
		function ( /* function FrameRequestCallback */ callback, /* DOMElement Element */ element) {
			return window.setTimeout(callback, 1000 / 60);
		};
})();

let cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame;


function createWebGLContext(canvas, opt_attribs) {
	let names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
	let context = null;
	for (let ii = 0; ii < names.length; ++ii) {
		try {
			context = canvas.getContext(names[ii], opt_attribs);
		} catch(e) {}
		if (context) {
			break;
		}
	}
	return context;
}


// GetShader function obtained from
// https://developer.mozilla.org/en/WebGL/Adding_2D_content_to_a_WebGL_context
// under public domain.
async function getShader(gl, ID) {
	let shaderScript = document.getElementById(ID);
	if (!shaderScript) {
		return null;
	}

	let str = "";
	let k = shaderScript.firstChild;
	while (k) {
		if (k.nodeType == 3) {
			str += k.textContent;
		}
		k = k.nextSibling;
	}
	
	if(shaderScript.src){
		str = await fetch(shaderScript.src).then(response=>response.text());
	}
	
	let shader;
	if (shaderScript.type == "text/glsl-fragment") {
		shader = gl.createShader(gl.FRAGMENT_SHADER);
	} else if (shaderScript.type == "text/glsl-vertex") {
		shader = gl.createShader(gl.VERTEX_SHADER);
	} else {
		return null;
	}
	// console.log(str);

	gl.shaderSource(shader, str);
	gl.compileShader(shader);
	
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.log("ERROR with script: ",ID);
		console.log(gl.getShaderInfoLog(shader));
		return null;
	}

	return shader;
}

//new URL('fancy-button.css', import.meta.url)
async function getShaderFromURL(gl,url,type){ //gl.FRAGMENT_SHADER or gl.VERTEX_SHADER
	let str = await fetch(url).then(r => r.text());
	
	let shader;
	shader = gl.createShader(type);
	
	// console.log(str);

	gl.shaderSource(shader, str);
	gl.compileShader(shader);
	
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.log("ERROR with script: ",url);
		console.log(gl.getShaderInfoLog(shader));
		return null;
	}

	return shader;
}

function getShaderFromString(gl,str,type){ //gl.FRAGMENT_SHADER or gl.VERTEX_SHADER
	let shader;
	// console.log(str);
	shader = gl.createShader(type);
	
	// console.log(str);

	gl.shaderSource(shader, str);
	gl.compileShader(shader);
	
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		console.log("ERROR with script: ",str);
		console.log(gl.getShaderInfoLog(shader));
		return null;
	}

	return shader;
}


function ShaderProgram(vertexShader,fragmentShader, uniforms, attributes, glContext){
  let shaderProgram = glContext.createProgram();
	glContext.attachShader(shaderProgram, vertexShader);
	glContext.attachShader(shaderProgram, fragmentShader);
	glContext.linkProgram(shaderProgram);
	
	
	if (!glContext.getProgramParameter(shaderProgram, glContext.LINK_STATUS)) {
		alert("Shader Compilation Error."+glContext.getProgramInfoLog(shaderProgram));
		 return;
	}
	
	this.ID = shaderProgram;
	
	this.uniforms = new Object();
	this.attributes = new Object();
	
	if(uniforms){
		for(let i=0;i<uniforms.length;i++){
			this.uniforms[uniforms[i]] = glContext.getUniformLocation(this.ID, uniforms[i]);
		}
	}
	
	this.attributes.enable = function(attributeName){
		glContext.enableVertexAttribArray(this[attributeName]);
	}
	
	this.attributes.disable = function(attributeName){
		glContext.disableVertexAttribArray(this[attributeName]);
	}
	
	if(attributes){
		for(let i=0;i<attributes.length;i++){
			this.attributes[attributes[i]] = glContext.getAttribLocation(this.ID, attributes[i]);
		}
	}
	
	this.use = function(glContext){
    glContext.useProgram(this.ID);
	}
}





/*
 * Copyright (C) 2009 Apple Inc. All Rights Reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE INC. ``AS IS'' AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL APPLE INC. OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 * PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY
 * OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
 /*
 	taken from: https://cvs.khronos.org/svn/repos/registry/trunk/public/webgl/sdk/demos/webkit/resources/J3DI.js
 */

//
// makeSphere
//
// Create a sphere with the passed number of latitude and longitude bands and the passed radius.
// Sphere has vertices, normals and texCoords. Create VBOs for each as well as the index array.
// Return an object with the following properties:
//
//  normalObject        WebGLBuffer object for normals
//  texCoordObject      WebGLBuffer object for texCoords
//  vertexObject        WebGLBuffer object for vertices
//  indexObject         WebGLBuffer object for indices
//  numIndices          The number of indices in the indexObject
//
function makeSphere(ctx, radius, lats, longs)
{
    var geometryData = [ ];
    var normalData = [ ];
    var texCoordData = [ ];
    var indexData = [ ];

    for (var latNumber = 0; latNumber <= lats; ++latNumber) {
        for (var longNumber = 0; longNumber <= longs; ++longNumber) {
            var theta = latNumber * Math.PI / lats;
            var phi = longNumber * 2 * Math.PI / longs;
            var sinTheta = Math.sin(theta);
            var sinPhi = Math.sin(phi);
            var cosTheta = Math.cos(theta);
            var cosPhi = Math.cos(phi);

            var x = cosPhi * sinTheta;
            var y = cosTheta;
            var z = sinPhi * sinTheta;
            var u = 1-(longNumber/longs);
            var v = latNumber/lats;

            normalData.push(x);
            normalData.push(y);
            normalData.push(z);
            texCoordData.push(u);
            texCoordData.push(v);
            geometryData.push(radius * x);
            geometryData.push(radius * y);
            geometryData.push(radius * z);
        }
    }

    for (var latNumber = 0; latNumber < lats; ++latNumber) {
        for (var longNumber = 0; longNumber < longs; ++longNumber) {
            var first = (latNumber * (longs+1)) + longNumber;
            var second = first + longs + 1;
            indexData.push(first);
            indexData.push(second);
            indexData.push(first+1);

            indexData.push(second);
            indexData.push(second+1);
            indexData.push(first+1);
        }
    }

    var retval = { };

    retval.normalObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.normalObject);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(normalData), ctx.STATIC_DRAW);

    retval.texCoordObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.texCoordObject);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(texCoordData), ctx.STATIC_DRAW);

    retval.vertexObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.vertexObject);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(geometryData), ctx.STATIC_DRAW);

    retval.numIndices = indexData.length;
    retval.indexObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, retval.indexObject);
    ctx.bufferData(ctx.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexData), ctx.STREAM_DRAW);
    retval.indexType = ctx.UNSIGNED_SHORT;

    return retval;
}





function makePlane(ctx,generateNormal=true,generateTexCoord=true){
    let geometryData = [
			-1.0, 1.0,0.0,
			-1.0,-1.0,0.0,
			 1.0, 1.0,0.0,
			 1.0,-1.0,0.0,
		];
    let normalData = [
			 0.0, 0.0, 1.0,
			 0.0, 0.0, 1.0,
			 0.0, 0.0, 1.0,
			 0.0, 0.0, 1.0,
		];
    let texCoordData = [
			0.0, 1.0, 0.0,
			1.0, 0.0, 0.0,
			1.0, 1.0, 0.0,
			0.0, 0.0, 0.0,
	 ];

    let retval = { };

	 if(generateTexCoord){
    retval.texCoordObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.texCoordObject);
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(texCoordData), ctx.STATIC_DRAW);
	 }

	 if(generateNormal){
    retval.normalObject = ctx.createBuffer();
    ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.normalObject);
		ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(normalData), ctx.STATIC_DRAW);
	 }

	 retval.vertexObject = ctx.createBuffer();
	 ctx.bindBuffer(ctx.ARRAY_BUFFER, retval.vertexObject);
	 ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array(geometryData), ctx.STATIC_DRAW);
		retval.numIndices = 4;

    // retval.numIndices = indexData.length;
    // retval.indexObject = ctx.createBuffer();
    // ctx.bindBuffer(ctx.ELEMENT_ARRAY_BUFFER, retval.indexObject);
    // ctx.bufferData(ctx.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexData), ctx.STREAM_DRAW);
    // retval.indexType = ctx.UNSIGNED_SHORT;

    return retval;
}

// Degrees to Radians convert function
function degToRad(degrees) {
	return degrees * Math.PI / 180;
}

export {
	makeSphere,
	makePlane,
	getShader,
	getShaderFromURL,
	getShaderFromString,
	ShaderProgram,
	requestAnimationFrame,
	cancelAnimationFrame,
	createWebGLContext,
	degToRad
};
