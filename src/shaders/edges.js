



//
// EDGES VERTEX SHADER
//

let vertexShader = /*glsl*/`
uniform mat4 projectionViewMatrix;

attribute vec4 vertex;
attribute vec4 color;
attribute float size;
attribute vec4 encodedIndex;

varying vec4 vColor;
varying float vSize;
varying vec4 vEncodedIndex;


//varying float vZComponent;

void main(void){
	vColor = color;
	vSize = size;
	vEncodedIndex = encodedIndex;
	//vZComponent = viewVertex.z;
	gl_Position =   projectionViewMatrix * vertex;
}
`;


//
// EDGES FRAGMENT SHADER
//

let fragmentShader = /*glsl*/`
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
uniform float globalOpacity;
varying vec4 vEncodedIndex;
varying vec4 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vec4(vColor.xyz,globalOpacity*vColor.w);
}
`;



//
// EDGES PICKING FRAGMENT SHADER
//

let pickingShader = /*glsl*/`
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
varying vec4 vEncodedIndex;
varying vec4 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vEncodedIndex;
	
}
`;


//
// EDGES FAST VERTEX SHADER
//

let fastVertexShader = /*glsl*/`
uniform mat4 projectionViewMatrix;

attribute vec4 vertex;
attribute vec4 color;
varying vec4 vColor;

varying vec4 vEncodedIndex;

//varying float vZComponent;

void main(void){
	vColor = color;
	//vZComponent = viewVertex.z;
	gl_Position =   projectionViewMatrix * vertex;
}
`;


//
// EDGES FAST FRAGMENT SHADER
//

let fastFragmentShader = /*glsl*/`
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
uniform float globalOpacity;
varying vec4 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vec4(vColor.xyz,globalOpacity*vColor.w);
}

`;



export {fragmentShader,vertexShader,pickingShader,fastFragmentShader,fastVertexShader};