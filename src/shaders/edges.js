



let fragmentShader = /*glsl*/`
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
uniform float linesIntensity;
varying vec4 vEncodedIndex;

varying vec3 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vec4(vColor,linesIntensity);
}
`;


let vertexShader = /*glsl*/`
uniform mat4 projectionViewMatrix;

attribute vec4 vertex;
attribute vec3 color;
attribute vec4 encodedIndex;

varying vec3 vColor;

varying vec4 vEncodedIndex;

//varying float vZComponent;

void main(void){
	vColor = color;
	vEncodedIndex = encodedIndex;
	//vZComponent = viewVertex.z;
	gl_Position =   projectionViewMatrix * vertex;
}
`;


let pickingShader = /*glsl*/`
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
varying vec4 vEncodedIndex;
uniform float linesIntensity;

varying vec3 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vEncodedIndex;
	
}
`;


let fastFragmentShader = /*glsl*/`
#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
uniform float linesIntensity;
varying vec4 vEncodedIndex;

varying vec3 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vec4(vColor,linesIntensity);
	
}

`;


let fastVertexShader = /*glsl*/`
uniform mat4 projectionViewMatrix;

attribute vec4 vertex;
attribute vec3 color;

varying vec3 vColor;

varying vec4 vEncodedIndex;

//varying float vZComponent;

void main(void){
	vColor = color;
	//vZComponent = viewVertex.z;
	gl_Position =   projectionViewMatrix * vertex;
}

`;



export {fragmentShader,vertexShader,pickingShader,fastFragmentShader,fastVertexShader};