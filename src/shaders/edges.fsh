#ifdef GL_ES
	precision highp float;
#endif
//uniform vec2 nearFar;
uniform float linesIntensity;

varying vec3 vColor;
//varying float vZComponent;
//gl_DepthRange.near)/gl_DepthRange.diff
void main(){
	//float w = (-vZComponent-nearFar[0])/(nearFar[1]-nearFar[0]);
	gl_FragColor = vec4(vColor,linesIntensity);
	
}
