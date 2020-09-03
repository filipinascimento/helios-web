#ifdef GL_ES
	precision highp float;
#endif
uniform vec3 color;
uniform float intensity;


varying vec3 vNormal;
varying vec3 vEye;

void main(){
	const vec3 lightDirection = vec3(0.577350269,0.577350269,0.577350269);
	const float ambientFactor = 0.6;
	
	vec3 normal = normalize(vNormal);
	vec3 eye = normalize(vEye);
	
	//Ambient+Diffuse
	float cosTheta = max(dot(lightDirection,normal),0.0);
	vec3 newColor = color*(ambientFactor+cosTheta);
	
	//Specular
	vec3 reflection = reflect(-lightDirection, normal);
	float eyeDotReflection = max(dot(eye, reflection), 0.0);
	newColor +=  vec3(0.5)* pow(eyeDotReflection, 60.0);
	
	gl_FragColor = vec4(newColor,intensity);
	//gl_FragData[0] = vec4(newColor,intensity);
}

