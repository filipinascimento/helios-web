const NODE_VERTEX_SOURCE = `#version 300 es
layout (location = 0) in vec2 a_position;
layout (location = 1) in vec4 a_color;
layout (location = 2) in float a_size;

uniform vec2 u_resolution;

out vec4 v_color;

vec4 toClip(vec2 value) {
  vec2 clip = vec2(
    (value.x / u_resolution.x) * 2.0 - 1.0,
    (value.y / u_resolution.y) * -2.0 + 1.0
  );
  return vec4(clip, 0.0, 1.0);
}

void main() {
  gl_Position = toClip(a_position);
  gl_PointSize = max(1.0, a_size);
  v_color = a_color;
}`;

const NODE_FRAGMENT_SOURCE = `#version 300 es
precision highp float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  vec2 coord = gl_PointCoord * 2.0 - 1.0;
  if (dot(coord, coord) > 1.0) {
    discard;
  }
  fragColor = v_color;
}`;

const EDGE_VERTEX_SOURCE = `#version 300 es
layout (location = 0) in vec2 a_position;
layout (location = 1) in vec4 a_color;

uniform vec2 u_resolution;

out vec4 v_color;

vec4 toClip(vec2 value) {
  vec2 clip = vec2(
    (value.x / u_resolution.x) * 2.0 - 1.0,
    (value.y / u_resolution.y) * -2.0 + 1.0
  );
  return vec4(clip, 0.0, 1.0);
}

void main() {
  gl_Position = toClip(a_position);
  v_color = a_color;
}`;

const EDGE_FRAGMENT_SOURCE = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 fragColor;

void main() {
  fragColor = v_color;
}`;

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

export class WebGL2Renderer {
  constructor(canvas, options = {}) {
    const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.canvas = canvas;
    this.options = options;
    this.gl = null;
    this.clearColor = options.clearColor ?? [0.01, 0.01, 0.02, 1];
    this.programs = {};
    this.buffers = {};
    this.uniforms = {};
    this.cpuArrays = {};
    this.size = { width: 1, height: 1, devicePixelRatio: pixelRatio };
  }

  async initialize() {
    const gl = this.canvas.getContext('webgl2', { antialias: true, premultipliedAlpha: true });
    if (!gl) {
      throw new Error('WebGL2 is not available in this environment');
    }
    this.gl = gl;
    this.setupState();
    this.createPrograms();
    this.createBuffers();
  }

  setupState() {
    const { gl } = this;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(...this.clearColor);
  }

  createPrograms() {
    const { gl } = this;
    const nodeProgram = createProgram(gl, NODE_VERTEX_SOURCE, NODE_FRAGMENT_SOURCE);
    const edgeProgram = createProgram(gl, EDGE_VERTEX_SOURCE, EDGE_FRAGMENT_SOURCE);
    this.programs = { nodeProgram, edgeProgram };
    this.uniforms.nodeResolution = gl.getUniformLocation(nodeProgram, 'u_resolution');
    this.uniforms.edgeResolution = gl.getUniformLocation(edgeProgram, 'u_resolution');
  }

  createBuffers() {
    const { gl } = this;
    const nodeVAO = gl.createVertexArray();
    gl.bindVertexArray(nodeVAO);
    const nodePositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nodePositionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const nodeColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeColorBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

    const nodeSizeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeSizeBuffer);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

    const edgeVAO = gl.createVertexArray();
    gl.bindVertexArray(edgeVAO);
    const edgePositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, edgePositionBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const edgeColorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, edgeColorBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    this.buffers = {
      nodeVAO,
      nodePositionBuffer,
      nodeColorBuffer,
      nodeSizeBuffer,
      edgeVAO,
      edgePositionBuffer,
      edgeColorBuffer,
    };
  }

  resize(size) {
    this.size = size;
    if (!this.gl) return;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  getCpuArray(name, length) {
    const existing = this.cpuArrays[name];
    if (!existing || existing.length < length) {
      this.cpuArrays[name] = new Float32Array(length);
      return this.cpuArrays[name];
    }
    return existing;
  }

  uploadNodes(nodes) {
    const { gl } = this;
    const count = nodes.indices.length;
    if (!count) return count;
    const positionData = this.getCpuArray('nodePositions', count * 2);
    const colorData = this.getCpuArray('nodeColors', count * 4);
    const sizeData = this.getCpuArray('nodeSizes', count);
    for (let i = 0; i < count; i += 1) {
      const nodeIndex = nodes.indices[i];
      const posOffset = nodeIndex * 2;
      const colorOffset = nodeIndex * 4;
      const sizeOffset = nodeIndex;
      positionData[i * 2] = nodes.positions[posOffset];
      positionData[i * 2 + 1] = nodes.positions[posOffset + 1];
      colorData[i * 4] = nodes.colors[colorOffset];
      colorData[i * 4 + 1] = nodes.colors[colorOffset + 1];
      colorData[i * 4 + 2] = nodes.colors[colorOffset + 2];
      colorData[i * 4 + 3] = nodes.colors[colorOffset + 3];
      sizeData[i] = nodes.sizes[sizeOffset];
    }
    gl.bindVertexArray(this.buffers.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.nodePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positionData.subarray(0, count * 2), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.nodeColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colorData.subarray(0, count * 4), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.nodeSizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizeData.subarray(0, count), gl.DYNAMIC_DRAW);
    return count;
  }

  uploadEdges(edges) {
    const { gl } = this;
    const count = edges.indices.length;
    if (!count) return 0;
    const vertexCount = count * 2;
    const positionData = this.getCpuArray('edgePositions', vertexCount * 2);
    const colorData = this.getCpuArray('edgeColors', vertexCount * 4);
    let vertex = 0;
    for (let i = 0; i < count; i += 1) {
      const edgeIndex = edges.indices[i];
      const geomOffset = edgeIndex * 4;
      const colorOffset = edgeIndex * 4;
      positionData[vertex * 2] = edges.segments[geomOffset];
      positionData[vertex * 2 + 1] = edges.segments[geomOffset + 1];
      colorData[vertex * 4] = edges.colors[colorOffset];
      colorData[vertex * 4 + 1] = edges.colors[colorOffset + 1];
      colorData[vertex * 4 + 2] = edges.colors[colorOffset + 2];
      colorData[vertex * 4 + 3] = edges.colors[colorOffset + 3];
      vertex += 1;

      positionData[vertex * 2] = edges.segments[geomOffset + 2];
      positionData[vertex * 2 + 1] = edges.segments[geomOffset + 3];
      colorData[vertex * 4] = edges.colors[colorOffset];
      colorData[vertex * 4 + 1] = edges.colors[colorOffset + 1];
      colorData[vertex * 4 + 2] = edges.colors[colorOffset + 2];
      colorData[vertex * 4 + 3] = edges.colors[colorOffset + 3];
      vertex += 1;
    }
    gl.bindVertexArray(this.buffers.edgeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.edgePositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positionData.subarray(0, vertexCount * 2), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.edgeColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colorData.subarray(0, vertexCount * 4), gl.DYNAMIC_DRAW);
    return vertexCount;
  }

  render(frame) {
    if (!this.gl) return;
    const { gl } = this;
    const { geometry } = frame;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (geometry.edges.count) {
      const vertices = this.uploadEdges(geometry.edges);
      if (vertices) {
        gl.useProgram(this.programs.edgeProgram);
        gl.uniform2f(this.uniforms.edgeResolution, this.size.width, this.size.height);
        gl.bindVertexArray(this.buffers.edgeVAO);
        gl.drawArrays(gl.LINES, 0, vertices);
      }
    }

    if (geometry.nodes.count) {
      const vertexCount = this.uploadNodes(geometry.nodes);
      if (vertexCount) {
        gl.useProgram(this.programs.nodeProgram);
        gl.uniform2f(this.uniforms.nodeResolution, this.size.width, this.size.height);
        gl.bindVertexArray(this.buffers.nodeVAO);
        gl.drawArrays(gl.POINTS, 0, vertexCount);
      }
    }

    gl.bindVertexArray(null);
  }

  destroy() {
    const { gl } = this;
    if (!gl) return;
    if (this.buffers.nodeVAO) gl.deleteVertexArray(this.buffers.nodeVAO);
    if (this.buffers.edgeVAO) gl.deleteVertexArray(this.buffers.edgeVAO);
    if (this.buffers.nodePositionBuffer) gl.deleteBuffer(this.buffers.nodePositionBuffer);
    if (this.buffers.nodeColorBuffer) gl.deleteBuffer(this.buffers.nodeColorBuffer);
    if (this.buffers.nodeSizeBuffer) gl.deleteBuffer(this.buffers.nodeSizeBuffer);
    if (this.buffers.edgePositionBuffer) gl.deleteBuffer(this.buffers.edgePositionBuffer);
    if (this.buffers.edgeColorBuffer) gl.deleteBuffer(this.buffers.edgeColorBuffer);
    if (this.programs.nodeProgram) gl.deleteProgram(this.programs.nodeProgram);
    if (this.programs.edgeProgram) gl.deleteProgram(this.programs.edgeProgram);
  }
}
