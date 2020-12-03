// uniform mat4 projectionMatrix;
// uniform mat4 viewMatrix;
// uniform mat3 normalMatrix;


// attribute vec4 vertex;
// attribute vec3 normal;
// attribute vec3 position;
// attribute vec3 color;
// attribute float scale;
// attribute float intensity;

// varying vec3 vNormal;
// varying vec3 vEye;

// varying vec3 vColor;
// varying float vScale;
// varying float vIntensity;

// void main(void){
// 	vec4 viewVertex = viewMatrix * (vertex*vec4(vec3(scale),1.0) + vec4(position,0.0));
// 	vNormal = normalMatrix * normal;
// 	vEye = -vec3(viewVertex);
// 	vIntensity = intensity;
// 	vColor = color;
// 	gl_Position =   projectionMatrix * viewVertex;
// }

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

attribute vec2 vertex;
// attribute vec3 normal;
attribute vec3 position;
attribute vec3 color;
attribute float scale;
attribute float intensity;

varying vec3 vNormal;
varying vec3 vEye;
varying vec3 vColor;
varying vec2 vOffset;
varying float vScale;
varying float vIntensity;

void main(void){
	float BoxCorrection = 1.5;
	vec2 offset = vertex;
	// vec4 viewCenters = viewMatrix*vec4(position,1);
	// vec3 viewCenters = position;
	// fragCenter = viewCenters
	// float scalingFactor = 1.0 / abs(centers.x)*0.001;
	// offset*=scalingFactor;
	vec3 cameraRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
  vec3 cameraUp = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));

	// viewCenters.xy += offset*scale*CameraRight_worldspace;
	
	vec4 viewCenters = viewMatrix*vec4(position+BoxCorrection*scale*(cameraRight*offset.x + cameraUp*offset.y),1.0);
	vNormal = vec3(0.0,0.0,1.0); //normalMatrix * normal;
	vEye = -vec3(offset,0.0);
	vIntensity = intensity;
	vColor = color;
	vOffset = vertex;
	vScale = scale;
	gl_Position = projectionMatrix * viewCenters;
}
