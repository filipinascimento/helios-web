

//
// NODES VERTEX SHADER
//

let vertexShader = /*glsl*/`
// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;
// uniform mat3 normalMatrix;


// attribute vec4 vertex;
// attribute vec3 normal;
// attribute vec3 position;
// attribute vec3 color;
// attribute float size;
// attribute float Opacity;

// varying vec3 vNormal;
// varying vec3 vEye;

// varying vec3 vColor;
// varying float vSize;
// varying float vOpacity;

// void main(void){
// 	vec4 viewVertex = viewMatrix * (vertex*vec4(vec3(size),1.0) + vec4(position,0.0));
// 	vNormal = normalMatrix * normal;
// 	vEye = -vec3(viewVertex);
// 	vOpacity = Opacity;
// 	vColor = color;
// 	gl_Position =   projectionMatrix * viewVertex;
// }

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

uniform float globalOpacityScale;
uniform float globalSizeScale;
uniform float globalOutlineWidthScale;

uniform float globalOpacityBase;
uniform float globalSizeBase;
uniform float globalOutlineWidthBase;

attribute vec2 vertex;
// attribute vec3 normal;
attribute vec3 position;
attribute vec4 color;
attribute float size;
attribute float outlineWidth;
attribute vec4 outlineColor;
attribute vec4 encodedIndex;

varying vec3 vNormal;
varying vec3 vEye;
varying vec4 vColor;
varying vec2 vOffset;
varying float vSize;
varying vec4 vEncodedIndex;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;
varying vec4 vPosition;

void main(void){
	float BoxCorrection = 1.5;
	vec2 offset = vertex;
	float updatedSize = globalSizeScale*size+globalSizeBase;
	float updatedOutlineWidth = globalOutlineWidthScale*outlineWidth+globalOutlineWidthBase;
	float fullSize = updatedSize + updatedOutlineWidth;
	// vec4 viewCenters = viewMatrix*vec4(position,1);
	// vec3 viewCenters = position;
	// fragCenter = viewCenters
	// float scalingFactor = 1.0 / abs(centers.x)*0.001;
	// offset*=scalingFactor;
	vec3 cameraRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
	vec3 cameraUp = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));

	// viewCenters.xy += offset*updatedSize*CameraRight_worldspace;
	
	vec4 viewCenters = viewMatrix*vec4(position+BoxCorrection*fullSize*(cameraRight*offset.x + cameraUp*offset.y),1.0);
	vNormal = vec3(0.0,0.0,1.0); //normalMatrix * normal;
	vEye = -vec3(offset,0.0);
	vEncodedIndex = encodedIndex;
	vColor = color;
	vColor.w = clamp(globalOpacityBase+globalOpacityScale*vColor.w,0.0,1.0);
	vOutlineColor.w = clamp(globalOpacityBase+globalOpacityScale*vOutlineColor.w,0.0,1.0);
	vOffset = vertex;
	vSize = updatedSize;
	vOutlineThreshold = updatedOutlineWidth/fullSize;

	vOutlineColor = outlineColor;
	vPosition = projectionMatrix * viewCenters;

	// vec4 temp_pos = vPosition;
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
	// vPosition.xy = (dir2).xy;
	// vPosition.z = 0.0;
	// vPosition.w = 1.0;
	gl_Position = vPosition;
}
`;


//
// NODES VERTEX SHADER HYPERBOLIC
//

let vertexHyperbolicShader = /*glsl*/`
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

uniform float globalOpacityScale;
uniform float globalSizeScale;
uniform float globalOutlineWidthScale;

uniform float globalOpacityBase;
uniform float globalSizeBase;
uniform float globalOutlineWidthBase;

attribute vec2 vertex;
// attribute vec3 normal;
attribute vec3 position;
attribute vec4 color;
attribute float size;
attribute float outlineWidth;
attribute vec4 outlineColor;
attribute vec4 encodedIndex;

varying vec3 vNormal;
varying vec3 vEye;
varying vec4 vColor;
varying vec2 vOffset;
varying float vSize;
varying vec4 vEncodedIndex;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;
varying vec4 vPosition;

vec2 hyperbolicNormFactor(vec2 vertex, float scaling){
	vec2 pos = vertex.xy;
	float r = length(pos.xy);
	// //polar
	// vec2 normFactor = (r+scaling)*vec2(1.0,1.0);
	// catersian
	vec2 normFactor = sqrt(vertex.xy*vertex.xy+scaling*scaling);
	return normFactor;
}

void main(void){
	float BoxCorrection = 1.5;
	vec2 offset = vertex;
	float updatedSize = globalSizeScale*size+globalSizeBase;
	float updatedOutlineWidth = globalOutlineWidthScale*outlineWidth+globalOutlineWidthBase;
	float fullSize = updatedSize + updatedOutlineWidth;
	// vec4 viewCenters = viewMatrix*vec4(position,1);
	// vec3 viewCenters = position;
	// fragCenter = viewCenters
	// float scalingFactor = 1.0 / abs(centers.x)*0.001;
	// offset*=scalingFactor;
	vec3 cameraRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
	vec3 cameraUp = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));

	// viewCenters.xy += offset*updatedSize*CameraRight_worldspace;
	


	// temp_pos.z = 0.0;
	// temp_pos.w = 1.0;



	vec4 viewCenters = viewMatrix*vec4(position.xyz,1.0);
	float scaling = -viewMatrix[3][2];
	vec4 temp_pos = viewCenters;
	
	vec2 normFactor = hyperbolicNormFactor(viewCenters.xy, scaling);
	// catersian
	// vec2 normFactor = sqrt(temp_pos.xy*temp_pos.xy+scaling*scaling);
	temp_pos.xy = temp_pos.xy/normFactor;

	viewCenters.xy = temp_pos.xy/vec2(projectionMatrix[0][0],projectionMatrix[1][1]);
	viewCenters.xy+=BoxCorrection*fullSize*offset.xy/length(normFactor)*scaling;
	

	vNormal = vec3(0.0,0.0,1.0); //normalMatrix * normal;
	vEye = -vec3(offset,0.0);
	vEncodedIndex = encodedIndex;
	vColor = color;
	vColor.w = clamp(globalOpacityBase+globalOpacityScale*vColor.w,0.0,1.0);
	vOutlineColor.w = clamp(globalOpacityBase+globalOpacityScale*vOutlineColor.w,0.0,1.0);
	vOffset = vertex;
	vSize = updatedSize;
	vOutlineThreshold = updatedOutlineWidth/fullSize;

	vOutlineColor = outlineColor;
	vPosition = projectionMatrix * viewCenters;

	gl_Position = vPosition;
}
`;




//
// NODES FRAGMENT SHADER (SHADED)
//

let fragmentShader = /*glsl*/`// #ifdef GL_ES
// 	precision highp float;
// #endif

precision mediump float;
varying vec4 vColor;
varying vec4 vEncodedIndex;
varying vec3 vNormal;
varying vec3 vEye;
varying float vSize;
varying vec2 vOffset;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;
varying vec4 vPosition;



void main(){
	// const vec3 lightDirection = vec3(0.577350269,0.577350269,0.577350269);
	// const float ambientFactor = 0.6;
	
	// vec3 normal = normalize(vNormal);
	// vec3 eye = normalize(vEye);
	
	// //Ambient+Diffuse
	// float cosTheta = max(dot(lightDirection,normal),0.0);
	// vec3 newColor = vColor*(ambientFactor+cosTheta);
	
	// //Specular
	// vec3 reflection = reflect(-lightDirection, normal);
	// float eyeDotReflection = max(dot(eye, reflection), 0.0);
	// newColor +=  vec3(0.5)* pow(eyeDotReflection, 60.0);
	
	// gl_FragColor = vec4(newColor,vOpacity);
	// gl_FragColor = vec4(eye,Opacity);
	//gl_FragData[0] = vec4(newColor,Opacity);

// Renaming variables passed from the Vertex Shader

	// vec3 cameraPos;
	// vec3 cameraNormal;

	// float lensqr = dot(vOffset, vOffset);

	// if(lensqr > 1.0)
	// 		discard;
		
	// cameraNormal = vec3(vOffset, sqrt(1.0 - lensqr));
	// cameraPos = (cameraNormal * size) + cameraSpherePos;

	// float len = length(point);
	// // VTK Fake Spheres
	// float radius = 1.;
	// if(len > radius)
	// 		discard;
	// vec3 normalizedPoint = normalize(vec3(point.xy, sqrt(1. - len)));
	// vec3 direction = normalize(vec3(1., 1., 1.));
	// float df2 = max(0, dot(direction, normalizedPoint));
	// float sf2 = pow(df2, 90);
	// fragOutput0 = vec4(max((df2+0.3) * color, sf2 * vec3(1)), 1);

	// fragOutput1 = vec4(vertexVC.xyz, 1.0);
	// fragOutput2 = vec4(normalVCVSOutput, 1.0);
	
	float lensqr = dot(vOffset, vOffset);

	if(lensqr > 1.0)
		discard;
	

	vec3 normalizedPoint = normalize(vec3(vOffset.xy, sqrt(1. - lensqr)));
	const vec3 lightDirection = vec3(0.577350269,0.577350269,0.577350269);
	const float ambientFactor = 0.6;
	
	vec3 normal = normalizedPoint;
	vec3 eye = normalize(vEye);
	
	//Ambient+Diffuse
	float cosTheta = max(dot(lightDirection,normal),0.0);
	vec3 newColor = vColor.xyz*(ambientFactor+cosTheta);
	
	//Specular
	vec3 reflection = reflect(-lightDirection, normal);
	float eyeDotReflection = max(dot(eye, reflection), 0.0);
	newColor +=  vec3(0.5)* pow(eyeDotReflection, 60.0);
	
	
	
	if(lensqr < 1.0-vOutlineThreshold){
		// gl_FragColor = vec4(vColor,vOpacity)
		gl_FragColor = vec4(newColor,vColor.w);;
	}else{
		gl_FragColor = vec4(vOutlineColor.xyz,vOutlineColor.w);
	}
	// gl_FragDepthEXT = 0.5; 
}
`;


//
// NODES PICKING SHADER
//

let pickingShader = /*glsl*/`
// #ifdef GL_ES
// 	precision highp float;
// #endif

precision mediump float;
varying vec4 vColor;
varying vec4 vEncodedIndex;
varying vec3 vNormal;
varying vec3 vEye;
varying float vSize;
varying vec2 vOffset;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;

void main(){
	float lensqr = dot(vOffset, vOffset);

	if(lensqr > 1.0)
			discard;
	
	gl_FragColor = vEncodedIndex;
}
`;


//
// NODES FAST FRAGMENT SHADER
//


let fastFragmentShader = /*glsl*/`
// #ifdef GL_ES
// 	precision highp float;
// #endif

precision mediump float;
varying vec4 vColor;
varying vec4 vEncodedIndex;
varying vec3 vNormal;
varying vec3 vEye;
varying float vSize;
varying vec2 vOffset;
varying float vOutlineThreshold;
varying vec4 vOutlineColor;
varying vec4 vPosition;



void main(){
	
	float lensqr = dot(vOffset, vOffset);

	if(lensqr > 1.0)
			discard;
	
	if(lensqr < 1.0-vOutlineThreshold){
		// gl_FragColor = vec4(vColor,vOpacity)
		gl_FragColor = vColor;
	}else{
		gl_FragColor = vOutlineColor;
	}
	// gl_FragDepthEXT = 0.5; 
}
`;

let fastVertexShader = vertexShader;

export {fragmentShader, vertexShader,
		pickingShader,fastFragmentShader,
		fastVertexShader, vertexHyperbolicShader};