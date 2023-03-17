
//
// TEXTURE SHADER FRAGMENT
//

let textureFragmentShader = /*glsl*/`precision highp float; 

uniform sampler2D input_tex;
uniform sampler2D lut_tex;  
uniform float diverging;  
varying vec2 tex_coord;     
void main(){
	float val = texture2D( input_tex, tex_coord ).r+0.5*diverging;
	vec4 color = texture2D( lut_tex, vec2(val, 0.5) );
	gl_FragColor = vec4(color.rgb,1.0);
}
`;


//
// TEXTURE SHADER VERTEX
//

let textureVertexShader = /*glsl*/`

attribute vec2 vertex;   
attribute vec2 texCoord; 
uniform mat4 uMVMatrix;  
uniform mat4 uPMatrix;   
varying vec2 tex_coord;  
void main(){
	tex_coord = texCoord; 
	gl_Position = uPMatrix * uMVMatrix * vec4( vertex, 0.0, 1.0 ); 
}

`;

//
// FRAGMENT SHADER
//


let fragmentShader = /*glsl*/`precision highp float;

varying vec2 quad_coord; 
varying float v_kernel_weight; 
uniform float kernel_weightScale; 
void main(void) { 
	float len = length( quad_coord ); 
	float nrm = v_kernel_weight * kernel_weightScale * 0.3989422804014327 * exp( -0.5*25.0*len*len ); 
	// gl_FragColor = vec4(1,1,1,1.0);//vec4(nrm,nrm,nrm, nrm );	
	gl_FragColor = vec4(nrm,nrm,nrm, nrm );
	// gl_FragColor = vec4(1,1,1, 1.0 ); 
}

`;

//
// VERTEX SHADER
//


let vertexShader = /*glsl*/`

attribute vec3 position;
attribute float kernel_weight;

attribute vec2 offset;
// attribute vec3 normal;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;

uniform mat4 uMVMatrix; 
uniform mat4 uPMatrix; 
uniform float bandwidthScale; 
uniform vec2 bandwidth; 
varying vec2 quad_coord; 
varying float v_kernel_weight; 

void main(void) { 
	// vec4 viewCenters = viewMatrix*vec4(position,1.0);
	// vec2 pos = (viewCenters).xy; 
	// quad_coord = offset.xy;  
	// pos += bandwidthScale * bandwidth * quad_coord; 
	// gl_Position = uPMatrix * uMVMatrix * vec4( pos, 0.0, 1.0); 
	


	float BoxCorrection = 1.5;
	float fullSize = bandwidthScale * 5.5;
	vec3 cameraRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
	vec3 cameraUp = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
	// vec4 viewCenters = viewMatrix*vec4(position+BoxCorrection*fullSize*(cameraRight*offset.x + cameraUp*offset.y),1.0);
	vec4 viewCenters = viewMatrix*vec4(position,1.0);
	viewCenters.xy += bandwidthScale * bandwidth * offset.xy;
	quad_coord = offset.xy; 
	v_kernel_weight = kernel_weight;
	gl_Position = projectionMatrix * viewCenters;
} 
`;

export { fragmentShader, vertexShader, textureFragmentShader, textureVertexShader };

