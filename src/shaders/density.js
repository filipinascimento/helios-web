
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


// TERRAIN SHADER
let topographicFragmentShader = /*glsl*/`#extension GL_OES_standard_derivatives : enable
precision highp float;


uniform sampler2D input_tex; // Elevation data
uniform sampler2D lut_tex;   // Color map
uniform float diverging;     // If diverging
varying vec2 tex_coord;      // Texture coordinate

// Simple directional light properties
vec3 lightDir = normalize(vec3(-0.5, 0.77777, 0.88888)); // Light direction
// use the time of the day to calculate the light direction

vec3 ambientColor = vec3(0.6, 0.6, 0.6); // Ambient light color
vec3 lightColor = vec3(0.6, 0.6, 0.6); // Diffuse light color

void main() {
    float val = texture2D(input_tex, tex_coord).r + 0.5 * diverging;

    // Approximate the gradient (slope) of the elevation
    float dx = dFdx(val*1000.0); // Change in x direction
    float dy = dFdy(val*1000.0); // Change in y direction

    // Compute normal vector from gradient
    vec3 normal = normalize(vec3(-dx, -dy, 1.0));

    // Compute lighting
    float diff = max(dot(normal, lightDir), 0.0); // Diffuse lighting
    vec3 lighting = ambientColor + (lightColor * diff); // Total lighting

    // Lookup the color from the LUT based on elevation
    vec4 baseColor = texture2D(lut_tex, vec2(val, 0.5));

    // Apply lighting to the base color
    vec3 finalColor = baseColor.rgb * lighting;

    gl_FragColor = vec4(finalColor, 1.0);
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

export { fragmentShader, vertexShader, textureFragmentShader, textureVertexShader,topographicFragmentShader};

