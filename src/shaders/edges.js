



//
// EDGES VERTEX SHADER
//

let vertexShader = /*glsl*/`
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
 
uniform float globalWidthScale;

attribute vec3 fromVertex;
attribute vec3 toVertex;
attribute vec2 vertexType;
// 0,1:  0.0, 1.0, // source, top
// 0,0:  0.0, 0.0, // source, bottom
// 1,1:  1.0, 1.0, // target, top
// 1,0:  1.0, 0.0, // target, bottom

attribute vec4 fromColor;
attribute vec4 toColor;
attribute float fromSize;
attribute float toSize;
attribute vec4 encodedIndex;

varying vec4 vColor;
varying float vSize;
varying vec3 vOffset;
varying vec4 vEncodedIndex;


//varying float vZComponent;

void main(void){
	vColor = (fromColor)*vertexType.x + (toColor)*(1.0-vertexType.x);
	vSize = (fromSize)*vertexType.x + (toSize)*(1.0-vertexType.x);
	vEncodedIndex = encodedIndex;
	//vZComponent = viewVertex.z;
	vec3 vertexCenter = fromVertex.xyz*vertexType.x + toVertex.xyz*(1.0-vertexType.x);
	vec3 destinationVertexCenter = fromVertex.xyz*(1.0-vertexType.x) + toVertex.xyz*vertexType.x;
	
	vec3 displacement = (viewMatrix*vec4((destinationVertexCenter-vertexCenter),0.0)).xyz;
	vec3 perpendicularVector = normalize(vec3(-displacement.y, displacement.x, 0.0));
	vec3 offset = globalWidthScale*vSize*(vertexType.x-0.5)*(vertexType.y-0.5)*4.0*1.5*perpendicularVector;
	
	vec4 viewVertex = viewMatrix * vec4(vertexCenter.xyz,1.0)+vec4(offset,0.0);
	float displacementLength = length(displacement);
	vOffset = vec3(vertexType.x,toSize/displacementLength*1.5,fromSize/displacementLength*1.5);
	gl_Position = projectionMatrix*viewVertex;
	
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
varying vec3 vOffset;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	if(vOffset.x<vOffset.y || vOffset.x>(1.0-vOffset.z)){
		discard;
	}

	// gl_FragColor = vec4(vOffset.x,vOffset.x,0,1.0);//vec4(vColor.xyz,globalOpacity*vColor.w);
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
varying vec3 vOffset;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){

	if(vOffset.x<vOffset.y*1.1 || vOffset.x>(1.0-vOffset.z*1.1)){
		discard;
	}
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vEncodedIndex;
	
}
`;


//
// EDGES FAST VERTEX SHADER
//

let fastVertexShader = /*glsl*/`
uniform mat4 projectionViewMatrix;

attribute vec3 vertex;
attribute vec4 color;
varying vec4 vColor;

varying vec4 vEncodedIndex;

//varying float vZComponent;

void main(void){
	vColor = color;
	//vZComponent = viewVertex.z;
	gl_Position =   projectionViewMatrix * vec4(vertex,1.0);
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
	// gl_FragColor = vec4(vEncodedIndex.x/10,0,0,1.0);
}

`;



export {fragmentShader,vertexShader,pickingShader,fastFragmentShader,fastVertexShader};