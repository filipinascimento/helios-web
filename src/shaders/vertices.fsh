#ifdef GL_ES
	precision highp float;
#endif
varying vec3 vColor;
varying float vIntensity;
varying vec3 vNormal;
varying vec3 vEye;
varying float vScale;
varying vec2 vOffset;



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
	
	// gl_FragColor = vec4(newColor,vIntensity);
	// gl_FragColor = vec4(eye,intensity);
	//gl_FragData[0] = vec4(newColor,intensity);

// Renaming variables passed from the Vertex Shader

	// vec3 cameraPos;
	// vec3 cameraNormal;

	// float lensqr = dot(vOffset, vOffset);

	// if(lensqr > 1.0)
	// 		discard;
		
	// cameraNormal = vec3(vOffset, sqrt(1.0 - lensqr));
	// cameraPos = (cameraNormal * scale) + cameraSpherePos;

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
	
	if(lensqr < 1.0){
		gl_FragColor = vec4(vColor,vIntensity);
	}else{
		gl_FragColor = vec4(1.0,1.0,1.0,vIntensity);
	}
  // gl_FragDepthEXT = 0.5; 
}

