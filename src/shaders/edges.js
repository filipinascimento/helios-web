



//
// EDGES VERTEX SHADER
//

let vertexShader = /*glsl*/`
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
 
uniform float globalSizeScale;
uniform float globalSizeBase;
uniform float globalWidthScale;
uniform float globalWidthBase;

uniform float globalOpacityScale;
uniform float globalOpacityBase;

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
varying vec3 vOffset;
varying vec4 vEncodedIndex;


//varying float vZComponent;

void main(void){
	vColor = (fromColor)*vertexType.x + (toColor)*(1.0-vertexType.x);
	vColor.w = clamp(globalOpacityBase+globalOpacityScale*vColor.w,0.0,1.0);
	float updatedFromSize = globalSizeScale*fromSize+globalSizeBase;
	float updatedToSize = globalSizeScale*toSize+globalSizeBase;

	float width = globalWidthBase+globalWidthScale*((updatedFromSize)*vertexType.x + (updatedToSize)*(1.0-vertexType.x));
	vEncodedIndex = encodedIndex;
	//vZComponent = viewVertex.z;


	vec3 vertexCenter = fromVertex.xyz*vertexType.x + toVertex.xyz*(1.0-vertexType.x);
	vec3 destinationVertexCenter = fromVertex.xyz*(1.0-vertexType.x) + toVertex.xyz*vertexType.x;
	
	vec3 displacement = (viewMatrix*vec4((destinationVertexCenter-vertexCenter),0.0)).xyz;
	vec3 perpendicularVector = normalize(vec3(-displacement.y, displacement.x, 0.0));
	vec3 offset = width*(vertexType.x-0.5)*(vertexType.y-0.5)*4.0*1.5*perpendicularVector;
	
	vec4 viewVertex = viewMatrix * vec4(vertexCenter.xyz,1.0)+vec4(offset,0.0);
	float displacementLength = length(displacement);
	vOffset = vec3(vertexType.x,updatedToSize/displacementLength*1.5,updatedFromSize/displacementLength*1.5);
	

	vec4 temp_pos = projectionMatrix*viewVertex;
	// vec4 eye_vec = vec4(0.0,0.0,0.0,0);
	// float dist = length(eye_vec);
	// vec4 lookat = eye_vec - temp_pos;
	// vec4 dir = temp_pos - eye_vec;
	// vec4 center = normalize(-eye_vec);
	// vec4 proj = dot(temp_pos, normalize(-lookat)) * normalize(-lookat);
	// vec4 c = temp_pos - proj;
	// float magnitude = 1.0-acos(dot(normalize(-eye_vec), normalize(temp_pos)));

	// c = length(c) * magnitude * normalize(c);
	// vec4 dir2 = normalize(c-lookat);
	// temp_pos.xy = (dir2).xy;
	// temp_pos.z = 0.0;
	// temp_pos.w = 1.0;


	gl_Position = temp_pos;
	
}
`;





//
// EDGES VERTEX SHADER HYPERBOLIC
//

let vertexHyperbolicShader = /*glsl*/`
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
 
uniform float globalSizeScale;
uniform float globalSizeBase;
uniform float globalWidthScale;
uniform float globalWidthBase;

uniform float globalOpacityScale;
uniform float globalOpacityBase;

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
varying vec3 vOffset;
varying vec4 vEncodedIndex;


vec2 hyperbolicNormFactor(vec2 vertex, float scaling){
	vec2 pos = vertex.xy;
	float r = length(pos.xy);
	// //polar
	// vec2 normFactor = (r+scaling)*vec2(1.0,1.0);
	// catersian
	vec2 normFactor = sqrt(vertex.xy*vertex.xy+scaling*scaling);
	return normFactor;
}

//varying float vZComponent;

void main(void){
	vColor = (fromColor)*vertexType.x + (toColor)*(1.0-vertexType.x);
	vColor.w = clamp(globalOpacityBase+globalOpacityScale*vColor.w,0.0,1.0);
	float updatedFromSize = globalSizeScale*fromSize+globalSizeBase;
	float updatedToSize = globalSizeScale*toSize+globalSizeBase;

	float width = globalWidthBase+globalWidthScale*((updatedFromSize)*vertexType.x + (updatedToSize)*(1.0-vertexType.x));
	vEncodedIndex = encodedIndex;
	//vZComponent = viewVertex.z;

	float scaling = -viewMatrix[3][2];
	
	vec4 fromVertexView = viewMatrix * vec4(fromVertex.xyz,1.0);
	vec4 toVertexView = viewMatrix * vec4(toVertex.xyz,1.0);

	vec2 normFactorFrom = hyperbolicNormFactor(fromVertexView.xy, scaling);
	vec2 normFactorTo = hyperbolicNormFactor(toVertexView.xy, scaling);
	
	vec3 vertexCenter = fromVertexView.xyz*vertexType.x + toVertexView.xyz*(1.0-vertexType.x);
	vec3 destinationVertexCenter = fromVertexView.xyz*(1.0-vertexType.x) + toVertexView.xyz*vertexType.x;

	vec2 normFactorCenter = hyperbolicNormFactor(vertexCenter.xy, scaling);
	vec2 normFactorDestinationCenter = hyperbolicNormFactor(destinationVertexCenter.xy, scaling);

	fromVertexView.xy = fromVertexView.xy/normFactorFrom/vec2(projectionMatrix[0][0],projectionMatrix[1][1]);
	toVertexView.xy = toVertexView.xy/normFactorTo/vec2(projectionMatrix[0][0],projectionMatrix[1][1]);
	vertexCenter.xy = vertexCenter.xy/normFactorCenter/vec2(projectionMatrix[0][0],projectionMatrix[1][1]);
	destinationVertexCenter.xy = destinationVertexCenter.xy/normFactorDestinationCenter/vec2(projectionMatrix[0][0],projectionMatrix[1][1]);

	vec3 displacement = vec4((destinationVertexCenter-vertexCenter),0.0).xyz;
	vec3 perpendicularVector = normalize(vec3(-displacement.y, displacement.x, 0.0));
	vec3 offset = width*(vertexType.x-0.5)*(vertexType.y-0.5)*4.0*1.0*perpendicularVector/length(normFactorCenter)*scaling;
	
	vec4 viewVertex = vec4(vertexCenter.xyz,1.0)+vec4(offset,0.0);
	float displacementLength = length(displacement);
	// vOffset = vec3(vertexType.x,updatedToSize/displacementLength*1.0,updatedFromSize/displacementLength*1.0);
	vOffset = vec3(0.0,0.0,0.0);
	viewVertex.zw = vec2(0.0,1.0);
	vec4 temp_pos = projectionMatrix*viewVertex;
	gl_Position = temp_pos;
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
	gl_FragColor = vColor;
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

	if(vOffset.x<vOffset.y*1.1 || vOffset.x>(1.0-vOffset.z*1.1) || (vEncodedIndex.x+vEncodedIndex.y+vEncodedIndex.z+vEncodedIndex.w)<=0.0){
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
uniform float globalOpacityScale;
uniform float globalOpacityBase;

attribute vec3 vertex;
attribute vec4 color;


varying vec4 vColor;
varying vec4 vEncodedIndex;

//varying float vZComponent;

void main(void){
	vColor = color;
	vColor.w = clamp(globalOpacityBase+globalOpacityScale*vColor.w,0.0,1.0);
	//vZComponent = viewVertex.z;
	gl_Position =   projectionViewMatrix * vec4(vertex,1.0);
}
`;


//
// EDGES FAST VERTEX SHADER HYPERBOLIC
//

let fastVertexHyperbolicShader = /*glsl*/`
uniform mat4 projectionViewMatrix;
uniform float globalOpacityScale;
uniform float globalOpacityBase;

attribute vec3 vertex;
attribute vec4 color;


varying vec4 vColor;
varying vec4 vEncodedIndex;

//varying float vZComponent;

void main(void){
	vColor = color;
	vColor.w = clamp(globalOpacityBase+globalOpacityScale*vColor.w,0.0,1.0);
	//vZComponent = viewVertex.z;

	vec4 temp_pos = projectionViewMatrix * vec4(vertex,1.0);
	vec4 eye_vec = vec4(0.0,0.0,1.0,0);
	float dist = length(eye_vec);
	vec4 lookat = eye_vec - temp_pos;
	vec4 dir = temp_pos - eye_vec;
	vec4 center = normalize(-eye_vec);
	vec4 proj = dot(temp_pos, normalize(-lookat)) * normalize(-lookat);
	vec4 c = temp_pos - proj;
	float magnitude = 1.0-acos(dot(normalize(-eye_vec), normalize(temp_pos)));

	c = length(c) * magnitude * normalize(c);
	vec4 dir2 = normalize(c-lookat);
	temp_pos.xy = (dir2).xy;
	temp_pos.z = 0.0;
	temp_pos.w = 1.0;
	gl_Position = temp_pos;
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
varying vec4 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vColor;
	// gl_FragColor = vec4(vEncodedIndex.x/10,0,0,1.0);
}

`;





export {fragmentShader,vertexShader,
	pickingShader,fastFragmentShader,
	fastVertexShader,fastVertexHyperbolicShader,
	vertexHyperbolicShader};
