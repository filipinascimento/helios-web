uniform mat4 projectionViewMatrix;

attribute vec4 vertex;
attribute vec3 color;

varying vec3 vColor;
//varying float vZComponent;

void main(void){
	vColor = color;
	//vZComponent = viewVertex.z;
	gl_Position =   projectionViewMatrix * vertex;
}
