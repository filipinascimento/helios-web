// #ifdef GL_ES
// 	precision highp float;
// #endif

precision mediump float;
varying vec3 vColor;
varying float vIntensity;
varying vec4 vEncodedIndex;
varying vec3 vNormal;
varying vec3 vEye;
varying float vSize;
varying vec2 vOffset;
varying float vOutlineThreshold;
varying vec3 vOutlineColor;

void main(){
	float lensqr = dot(vOffset, vOffset);

	if(lensqr > 1.0)
			discard;
	
	gl_FragColor = vEncodedIndex;
}

