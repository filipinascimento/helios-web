function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || 'Shader compilation error');
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(log || 'Program link error');
  }
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

const PRESENT_VERT = `#version 300 es
precision highp float;
layout (location = 0) in vec2 a_position;
layout (location = 1) in vec2 a_uv;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = a_uv;
}`;

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_texture;
out vec4 fragColor;
void main() {
  fragColor = texture(u_texture, v_uv);
}`;

/**
 * Thin wrapper around a WebGL2RenderingContext that exposes a consistent API
 * for the modular renderer.
 */
export class WebGL2Device {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    this.gl = null;
    this.presentProgram = null;
    this.presentVAO = null;
    this.presentTextureLocation = null;
    this.size = { width: 1, height: 1, devicePixelRatio: 1 };
    this.type = 'webgl2';
  }

  async initialize() {
    const gl = this.canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true });
    if (!gl) {
      throw new Error('WebGL2 is not available in this environment');
    }
    this.gl = gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1.0);
    this.setupPresentPipeline();
  }

  setupPresentPipeline() {
    const { gl } = this;
    this.presentProgram = createProgram(gl, PRESENT_VERT, PRESENT_FRAG);
    this.presentTextureLocation = gl.getUniformLocation(this.presentProgram, 'u_texture');
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const vertices = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    this.presentVAO = vao;
  }

  resize(size) {
    this.size = size;
    if (!this.gl) return;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  beginFrame(renderTarget, clearColor, rect) {
    const { gl } = this;
    const target = renderTarget?.handle ?? null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    const viewport = rect
      ? [rect.x, rect.y, rect.width, rect.height]
      : [0, 0, renderTarget?.width ?? this.canvas.width, renderTarget?.height ?? this.canvas.height];
    gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    if (clearColor) {
      gl.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    } else {
      gl.clear(gl.DEPTH_BUFFER_BIT);
    }
    return {
      type: 'webgl2',
      gl,
      target: renderTarget,
      viewport,
    };
  }

  endFrame(context) {
    context.gl.bindVertexArray(null);
  }

  createProgram(vertexSource, fragmentSource) {
    return createProgram(this.gl, vertexSource, fragmentSource);
  }

  createFramebuffer(width, height) {
    const { gl } = this;
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    const depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      type: 'webgl2',
      handle: framebuffer,
      texture,
      depth,
      width,
      height,
    };
  }

  presentFramebuffer(framebuffer, rect) {
    if (!framebuffer?.texture) return;
    const { gl } = this;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const width = rect?.width ?? this.canvas.width;
    const height = rect?.height ?? this.canvas.height;
    const x = rect?.x ?? 0;
    const y = rect?.y ?? 0;
    gl.viewport(x, y, width, height);
    gl.useProgram(this.presentProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, framebuffer.texture);
    gl.uniform1i(this.presentTextureLocation, 0);
    gl.bindVertexArray(this.presentVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  async readPixels(framebuffer, rect) {
    const { gl } = this;
    const target = framebuffer?.handle ?? null;
    const width = rect?.width ?? (framebuffer?.width ?? this.canvas.width);
    const height = rect?.height ?? (framebuffer?.height ?? this.canvas.height);
    const x = rect?.x ?? 0;
    const y = rect?.y ?? 0;
    const data = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target);
    gl.readBuffer?.(gl.COLOR_ATTACHMENT0);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return data;
  }

  destroy() {
    const { gl } = this;
    if (!gl) return;
    if (this.presentVAO) gl.deleteVertexArray(this.presentVAO);
    if (this.presentProgram) gl.deleteProgram(this.presentProgram);
  }
}
