uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;

uniform float scale;
uniform vec3 position;

attribute vec4 vertex;
attribute vec3 normal;
uniform vec3 color;
varying vec3 vColor;

void main(void){
	vec4 viewVertex = viewMatrix * (vertex*vec4(vec3(scale),1.0) + vec4(position,0.0));
	vColor = color;
	gl_Position =   projectionMatrix * viewVertex;
}
