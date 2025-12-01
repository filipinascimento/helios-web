import {
  NODE_FRAGMENT_SOURCE,
  NODE_VERTEX_SOURCE,
  EDGE_FRAGMENT_SOURCE,
  EDGE_VERTEX_SOURCE,
  EDGE_QUAD_FRAGMENT_SOURCE,
  EDGE_QUAD_VERTEX_SOURCE,
} from './shaders/graphWebGL.js';
import { NODE_WGSL, EDGE_WGSL } from './shaders/graphWebGPU.js';

export const EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL = 300.0;

export class GraphLayer {
  constructor(options = {}) {
    this.name = 'graph-layer';
    this.device = null;
    this.size = null;
    this.cpuArrays = {};
    this.edgeRenderingMode = options.edgeRendering === 'line' ? 'line' : 'quad';
    this.nodeOpacityBase = 0;
    this.nodeOpacityScale = 1;
    this.nodeSizeBase = 0;
    this.nodeSizeScale = 1;
    this.nodeOutlineWidthBase = 0;
    this.nodeOutlineWidthScale = 0;
    this.nodeOutlineColor = options.nodeOutlineColor ?? [0, 0, 0, 1];
    this.edgeOpacityBase = 0;
    this.edgeOpacityScale = 1;
    this.edgeWidthBase = 0;
    this.edgeWidthScale = 1;

    // WebGL2 resources
    this.nodeProgram = null;
    this.edgeProgram = null;
    this.edgeQuadProgram = null;
    this.nodeUniformViewProjection = null;
    this.nodeUniformView = null;
    this.nodeUniformCameraPosition = null;
    this.nodeUniformCameraUp = null;
    this.nodeUniformCameraRight = null;
    this.nodeUniformIs2D = null;
    this.nodeUniformOpacityBase = null;
    this.nodeUniformOpacityScale = null;
    this.nodeUniformSizeBase = null;
    this.nodeUniformSizeScale = null;
    this.nodeUniformOutlineWidthBase = null;
    this.nodeUniformOutlineWidthScale = null;
    this.nodeUniformOutlineColor = null;
    this.edgeUniformViewProjection = null;
    this.edgeUniformOpacityBase = null;
    this.edgeUniformOpacityScale = null;
    this.edgeUniformWidthBase = null;
    this.edgeUniformWidthScale = null;
    this.edgeQuadUniformViewProjection = null;
    this.edgeQuadUniformViewport = null;
    this.edgeQuadUniformCameraUp = null;
    this.edgeQuadUniformCameraRight = null;
    this.edgeQuadUniformIs2D = null;
    this.edgeQuadUniformOpacityBase = null;
    this.edgeQuadUniformOpacityScale = null;
    this.edgeQuadUniformWidthBase = null;
    this.edgeQuadUniformWidthScale = null;
    this.nodeVAO = null;
    this.nodeBuffers = {};
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.edgeBuffers = {};
    this.nodeCount = 0;
    this.edgeCount = 0;

    // WebGPU resources
    this.nodeBindGroupLayout = null;
    this.edgeBindGroupLayout = null;
    this.nodePipeline = null;
    this.edgePipeline = null;
    this.edgeQuadPipeline = null;
    this.nodeBindGroup = null;
    this.edgeBindGroup = null;
    this.cameraArray = null;
    this.cameraBuffer = null;
    this.globalsArray = null;
    this.globalsBuffer = null;
    this.nodeBuffersGpu = {};
    this.edgeBuffersGpu = {};
    this.nodeQuadBufferGpu = null;
    this.edgeQuadBufferGpu = null;
  }

  initialize(device, size) {
    this.device = device;
    this.size = size;
    if (device.type === 'webgl2') {
      this.initializeWebGL2(device.gl);
    } else if (device.type === 'webgpu') {
      this.initializeWebGPU(device);
    }
    this.resize(size, device);
  }

  resize(size) {
    this.size = size;
    // Matrices are updated per-frame from the camera.
  }

  render(context, frame) {
    if (!frame?.geometry) return;
    if (context.type === 'webgl2') {
      this.renderWebGL2(context.gl, frame.geometry, frame.camera);
    } else if (context.type === 'webgpu') {
      this.renderWebGPU(context, frame.geometry, frame.camera);
    }
  }

  destroy() {
    if (this.device?.type === 'webgl2') {
      const gl = this.device.gl;
      if (this.nodeVAO) gl.deleteVertexArray(this.nodeVAO);
      if (this.edgeVAO) gl.deleteVertexArray(this.edgeVAO);
      if (this.edgeQuadVAO) gl.deleteVertexArray(this.edgeQuadVAO);
      if (this.nodeProgram) gl.deleteProgram(this.nodeProgram);
      if (this.edgeProgram) gl.deleteProgram(this.edgeProgram);
      if (this.edgeQuadProgram) gl.deleteProgram(this.edgeQuadProgram);
      if (this.nodeQuadBuffer) gl.deleteBuffer(this.nodeQuadBuffer);
      if (this.edgeQuadBuffer) gl.deleteBuffer(this.edgeQuadBuffer);
      Object.values(this.nodeBuffers).forEach((buffer) => buffer && gl.deleteBuffer(buffer));
      Object.values(this.edgeBuffers).forEach((buffer) => buffer && gl.deleteBuffer(buffer));
    } else if (this.device?.type === 'webgpu') {
      this.nodeBuffersGpu.indices?.buffer?.destroy?.();
    this.nodeBuffersGpu.positions?.buffer?.destroy?.();
    this.nodeBuffersGpu.sizes?.buffer?.destroy?.();
    this.nodeBuffersGpu.colors?.buffer?.destroy?.();
    this.edgeBuffersGpu.indices?.buffer?.destroy?.();
    this.edgeBuffersGpu.segments?.buffer?.destroy?.();
    this.edgeBuffersGpu.colors?.buffer?.destroy?.();
    this.edgeBuffersGpu.widths?.buffer?.destroy?.();
    this.cameraBuffer?.destroy?.();
    this.globalsBuffer?.destroy?.();
    this.nodeQuadBufferGpu?.destroy?.();
    this.edgeQuadBufferGpu?.destroy?.();
  }
}

  initializeWebGL2(gl) {
    this.nodeProgram = this.device.createProgram(NODE_VERTEX_SOURCE, NODE_FRAGMENT_SOURCE);
    this.edgeProgram = this.device.createProgram(EDGE_VERTEX_SOURCE, EDGE_FRAGMENT_SOURCE);
    this.edgeQuadProgram = this.device.createProgram(EDGE_QUAD_VERTEX_SOURCE, EDGE_QUAD_FRAGMENT_SOURCE);
    this.nodeUniformViewProjection = gl.getUniformLocation(this.nodeProgram, 'u_viewProjection');
    this.nodeUniformView = gl.getUniformLocation(this.nodeProgram, 'u_view');
    this.nodeUniformCameraPosition = gl.getUniformLocation(this.nodeProgram, 'u_cameraPosition');
    this.nodeUniformCameraUp = gl.getUniformLocation(this.nodeProgram, 'u_cameraUp');
    this.nodeUniformCameraRight = gl.getUniformLocation(this.nodeProgram, 'u_cameraRight');
    this.nodeUniformIs2D = gl.getUniformLocation(this.nodeProgram, 'u_is2D');
    this.nodeUniformOpacityBase = gl.getUniformLocation(this.nodeProgram, 'u_nodeOpacityBase');
    this.nodeUniformOpacityScale = gl.getUniformLocation(this.nodeProgram, 'u_nodeOpacityScale');
    this.nodeUniformSizeBase = gl.getUniformLocation(this.nodeProgram, 'u_nodeSizeBase');
    this.nodeUniformSizeScale = gl.getUniformLocation(this.nodeProgram, 'u_nodeSizeScale');
    this.nodeUniformOutlineWidthBase = gl.getUniformLocation(this.nodeProgram, 'u_outlineWidthBase');
    this.nodeUniformOutlineWidthScale = gl.getUniformLocation(this.nodeProgram, 'u_outlineWidthScale');
    this.nodeUniformOutlineColor = gl.getUniformLocation(this.nodeProgram, 'u_outlineColor');
    this.edgeUniformViewProjection = gl.getUniformLocation(this.edgeProgram, 'u_viewProjection');
    this.edgeUniformOpacityBase = gl.getUniformLocation(this.edgeProgram, 'u_edgeOpacityBase');
    this.edgeUniformOpacityScale = gl.getUniformLocation(this.edgeProgram, 'u_edgeOpacityScale');
    this.edgeUniformWidthBase = gl.getUniformLocation(this.edgeProgram, 'u_edgeWidthBase');
    this.edgeUniformWidthScale = gl.getUniformLocation(this.edgeProgram, 'u_edgeWidthScale');
    this.edgeQuadUniformViewProjection = gl.getUniformLocation(this.edgeQuadProgram, 'u_viewProjection');
    this.edgeQuadUniformViewport = gl.getUniformLocation(this.edgeQuadProgram, 'u_viewport');
    this.edgeQuadUniformOpacityBase = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeOpacityBase');
    this.edgeQuadUniformOpacityScale = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeOpacityScale');
    this.edgeQuadUniformWidthBase = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeWidthBase');
    this.edgeQuadUniformWidthScale = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeWidthScale');

    // Quad geometry for node billboards (triangle strip)
    this.nodeQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    // Nodes (instanced quads)
    this.nodeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVAO);
    // per-vertex corner
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // per-instance data
    this.nodeBuffers.positions = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    this.nodeBuffers.colors = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.colors);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    this.nodeBuffers.sizes = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);

    // Edges (instanced: two vertices per edge)
    this.edgeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeVAO);
    this.edgeBuffers.segments = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(0, 1);

    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(1, 1);

    this.edgeBuffers.colors = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);
    this.edgeBuffers.widths = this.edgeBuffers.widths || gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);

    // Edge rectangles (instanced quads)
    this.edgeQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeQuadBuffer);
    const edgeQuad = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, edgeQuad, gl.STATIC_DRAW);

    this.edgeQuadVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeQuadVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
  }

  renderWebGL2(gl, geometry, camera) {
    if (!geometry) return;
    const cameraUniforms = this.getCameraUniforms(camera);
    if (!cameraUniforms) return;
    const is2D = cameraUniforms.mode === '2d';

    // Keep depth handling aligned with legacy: always clear with writes enabled
    // and use LEQUAL for a stable depth compare.
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    if (is2D) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
    } else {
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    }
    if (geometry.edges.count) {
      this.uploadEdgesWebGL2(gl, geometry.edges);
    } else {
      this.edgeCount = 0;
    }
    if (geometry.nodes.count) {
      this.uploadNodesWebGL2(gl, geometry.nodes);
    } else {
      this.nodeCount = 0;
    }

    const drawNodes = () => {
      if (!this.nodeCount) return;
      gl.useProgram(this.nodeProgram);
      gl.uniformMatrix4fv(this.nodeUniformViewProjection, false, cameraUniforms.viewProjection);
      gl.uniformMatrix4fv(this.nodeUniformView, false, cameraUniforms.view);
      if (this.nodeUniformCameraPosition) {
        gl.uniform3fv(this.nodeUniformCameraPosition, cameraUniforms.position);
      }
      if (this.nodeUniformCameraUp) {
        gl.uniform3fv(this.nodeUniformCameraUp, cameraUniforms.up);
      }
      if (this.nodeUniformCameraRight) {
        gl.uniform3fv(this.nodeUniformCameraRight, cameraUniforms.right);
      }
      if (this.nodeUniformIs2D) {
        gl.uniform1i(this.nodeUniformIs2D, is2D ? 1 : 0);
      }
      gl.uniform1f(this.nodeUniformOpacityBase, this.nodeOpacityBase);
      gl.uniform1f(this.nodeUniformOpacityScale, this.nodeOpacityScale);
      gl.uniform1f(this.nodeUniformSizeBase, this.nodeSizeBase);
      gl.uniform1f(this.nodeUniformSizeScale, this.nodeSizeScale);
      gl.uniform1f(this.nodeUniformOutlineWidthBase, this.nodeOutlineWidthBase);
      gl.uniform1f(this.nodeUniformOutlineWidthScale, this.nodeOutlineWidthScale);
      gl.uniform4f(
        this.nodeUniformOutlineColor,
        this.nodeOutlineColor[0] ?? 0,
        this.nodeOutlineColor[1] ?? 0,
        this.nodeOutlineColor[2] ?? 0,
        this.nodeOutlineColor[3] ?? 1,
      );
      gl.bindVertexArray(this.nodeVAO);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);
    };

    const drawEdges = () => {
      if (!this.edgeCount) return;
      // Prevent edges from writing to depth; they will still be depth-tested against nodes.
      gl.depthMask(false);
      const useQuads = this.edgeRenderingMode === 'quad';
      const globalEdgeWidthBase = this.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL;
      const globalEdgeWidthScale = this.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL;
      if (useQuads) {
        gl.useProgram(this.edgeQuadProgram);
        gl.uniformMatrix4fv(this.edgeQuadUniformViewProjection, false, cameraUniforms.viewProjection);
        if (this.edgeQuadUniformViewport) {
          const viewportWidth = gl.drawingBufferWidth || this.size?.width || 1;
          const viewportHeight = gl.drawingBufferHeight || this.size?.height || 1;
          gl.uniform2f(this.edgeQuadUniformViewport, viewportWidth, viewportHeight);
        }
        gl.uniform1f(this.edgeQuadUniformOpacityBase, this.edgeOpacityBase);
        gl.uniform1f(this.edgeQuadUniformOpacityScale, this.edgeOpacityScale);
        gl.uniform1f(this.edgeQuadUniformWidthBase, globalEdgeWidthBase);
        gl.uniform1f(this.edgeQuadUniformWidthScale, globalEdgeWidthScale);
        gl.bindVertexArray(this.edgeQuadVAO);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.edgeCount);
      } else {
        gl.useProgram(this.edgeProgram);
        gl.uniformMatrix4fv(this.edgeUniformViewProjection, false, cameraUniforms.viewProjection);
        gl.uniform1f(this.edgeUniformOpacityBase, this.edgeOpacityBase);
        gl.uniform1f(this.edgeUniformOpacityScale, this.edgeOpacityScale);
        gl.uniform1f(this.edgeUniformWidthBase, globalEdgeWidthBase);
        gl.uniform1f(this.edgeUniformWidthScale, globalEdgeWidthScale);
        gl.bindVertexArray(this.edgeVAO);
        gl.drawArraysInstanced(gl.LINES, 0, 2, this.edgeCount);
      }
    };

    if (is2D) {
      // In 2D, draw edges first and keep depth disabled so nodes always sit on top.
      drawEdges();
      drawNodes();
    } else {
      // In 3D, draw nodes into depth first, then overlay edges without writing depth.
      drawNodes();
      drawEdges();
    }

    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.DEPTH_TEST);
  }

  uploadNodesWebGL2(gl, nodes) {
    const count = nodes.indices.length;
    this.nodeCount = count;
    if (!count) return;
    const positionData = this.getCpuArray('nodePositions', count * 4);
    const colorData = this.getCpuArray('nodeColors', count * 4);
    const sizeData = this.getCpuArray('nodeSizes', count);
    for (let i = 0; i < count; i += 1) {
      const nodeIndex = nodes.indices[i];
      const posOffset = nodeIndex * 4;
      const colorOffset = nodeIndex * 4;
      const sizeOffset = nodeIndex;
      const dstPos = i * 4;
      positionData[dstPos] = nodes.positions[posOffset];
      positionData[dstPos + 1] = nodes.positions[posOffset + 1];
      positionData[dstPos + 2] = nodes.positions[posOffset + 2];
      positionData[dstPos + 3] = 1;
      colorData[i * 4] = nodes.colors[colorOffset];
      colorData[i * 4 + 1] = nodes.colors[colorOffset + 1];
      colorData[i * 4 + 2] = nodes.colors[colorOffset + 2];
      colorData[i * 4 + 3] = nodes.colors[colorOffset + 3];
      sizeData[i] = nodes.sizes[sizeOffset];
    }
    gl.bindVertexArray(this.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
    gl.bufferData(gl.ARRAY_BUFFER, positionData.subarray(0, count * 4), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.colors);
    gl.bufferData(gl.ARRAY_BUFFER, colorData.subarray(0, count * 4), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
    gl.bufferData(gl.ARRAY_BUFFER, sizeData.subarray(0, count), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
  }

  uploadEdgesWebGL2(gl, edges) {
    const count = edges.indices.length;
    this.edgeCount = count;
    if (!count) return;
    const segmentData = this.getCpuArray('edgeSegments', count * 8);
    const colorData = this.getCpuArray('edgeColors', count * 4);
    const widthData = this.getCpuArray('edgeWidths', count);
    let segmentOffset = 0;
    for (let i = 0; i < count; i += 1) {
      const edgeIndex = edges.indices[i];
      const geomOffset = edgeIndex * 8;
      const colorOffset = edgeIndex * 4;
      segmentData[segmentOffset + 0] = edges.segments[geomOffset];
      segmentData[segmentOffset + 1] = edges.segments[geomOffset + 1];
      segmentData[segmentOffset + 2] = edges.segments[geomOffset + 2];
      segmentData[segmentOffset + 3] = 1;
      segmentData[segmentOffset + 4] = edges.segments[geomOffset + 4];
      segmentData[segmentOffset + 5] = edges.segments[geomOffset + 5];
      segmentData[segmentOffset + 6] = edges.segments[geomOffset + 6];
      segmentData[segmentOffset + 7] = 1;

      const colorWrite = i * 4;
      colorData[colorWrite + 0] = edges.colors[colorOffset];
      colorData[colorWrite + 1] = edges.colors[colorOffset + 1];
      colorData[colorWrite + 2] = edges.colors[colorOffset + 2];
      colorData[colorWrite + 3] = edges.colors[colorOffset + 3];
      widthData[i] = Math.max(1e-3, edges.widths?.[edgeIndex] ?? 1);
      segmentOffset += 8;
    }

    gl.bindVertexArray(this.edgeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.bufferData(gl.ARRAY_BUFFER, segmentData.subarray(0, count * 8), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.bufferData(gl.ARRAY_BUFFER, colorData.subarray(0, count * 4), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.bufferData(gl.ARRAY_BUFFER, widthData.subarray(0, count), gl.DYNAMIC_DRAW);
  }

  getCpuArray(name, length) {
    const existing = this.cpuArrays[name];
    if (!existing || existing.length < length) {
      this.cpuArrays[name] = new Float32Array(length);
      return this.cpuArrays[name];
    }
    return existing;
  }

  // WebGPU helpers
  initializeWebGPU(device) {
    this.cameraArray = new Float32Array(48);
    this.cameraBuffer = device.device.createBuffer({
      size: this.cameraArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.globalsArray = new Float32Array(16);
    this.globalsBuffer = device.device.createBuffer({
      size: this.globalsArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    this.nodeQuadBufferGpu = device.device.createBuffer({
      size: quad.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.nodeQuadBufferGpu.getMappedRange()).set(quad);
    this.nodeQuadBufferGpu.unmap();
    const edgeQuad = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    this.edgeQuadBufferGpu = device.device.createBuffer({
      size: edgeQuad.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.edgeQuadBufferGpu.getMappedRange()).set(edgeQuad);
    this.edgeQuadBufferGpu.unmap();

    this.nodeBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // indices
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // positions
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // sizes
        {
          binding: 4,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' },
        }, // colors
        { binding: 5, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // globals
      ],
    });

    this.edgeBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // indices
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // segments
        {
          binding: 3,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' },
        }, // colors
        { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } }, // widths
        { binding: 5, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }, // globals
      ],
    });

    const nodeModule = device.device.createShaderModule({ code: NODE_WGSL });
    const edgeModule = device.device.createShaderModule({ code: EDGE_WGSL });
    const depthStencil = {
      format: device.depthFormat ?? 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less-equal',
    };

    this.nodePipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.nodeBindGroupLayout] }),
      vertex: {
        module: nodeModule,
        entryPoint: 'nodeVertex',
        buffers: [
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
            stepMode: 'vertex',
          },
        ],
      },
      fragment: {
        module: nodeModule,
        entryPoint: 'nodeFragment',
        targets: [{ format: device.format }],
      },
      depthStencil,
      primitive: { topology: 'triangle-strip' },
    });

    this.edgePipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: { module: edgeModule, entryPoint: 'edgeVertex' },
      fragment: {
        module: edgeModule,
        entryPoint: 'edgeFragment',
        targets: [{ format: device.format }],
      },
      depthStencil: { ...depthStencil, depthWriteEnabled: false },
      primitive: { topology: 'line-list' },
    });

    this.edgeQuadPipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: {
        module: edgeModule,
        entryPoint: 'edgeQuadVertex',
        buffers: [
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
            stepMode: 'vertex',
          },
        ],
      },
      fragment: {
        module: edgeModule,
        entryPoint: 'edgeFragment',
        targets: [{ format: device.format }],
      },
      depthStencil: { ...depthStencil, depthWriteEnabled: false },
      primitive: { topology: 'triangle-strip' },
    });
  }

  ensureBufferGpu(entry, requiredBytes, usage, device, maxBindingSize, label = 'storage buffer') {
    const aligned = Math.max(256, Math.ceil(requiredBytes / 256) * 256);
    if ((usage & GPUBufferUsage.STORAGE) && maxBindingSize && aligned > maxBindingSize) {
      const message = `${label} requires ${aligned} bytes, exceeding maxStorageBufferBindingSize (${maxBindingSize}).`;
      console.warn(message);
      throw new Error(message);
    }
    if (!entry || aligned > entry.size) {
      entry?.buffer?.destroy?.();
      return {
        buffer: device.createBuffer({ size: aligned, usage }),
        size: aligned,
      };
    }
    return entry;
  }

  updateNodeBuffersGpu(nodes, device, maxBindingSize) {
    const { positions, sizes, colors, indices } = nodes;
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.nodeBuffersGpu.indices = this.ensureBufferGpu(
      this.nodeBuffersGpu.indices,
      indices.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Node index buffer',
    );
    this.nodeBuffersGpu.positions = this.ensureBufferGpu(
      this.nodeBuffersGpu.positions,
      positions.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Node position buffer',
    );
    this.nodeBuffersGpu.sizes = this.ensureBufferGpu(
      this.nodeBuffersGpu.sizes,
      sizes.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Node size buffer',
    );
    this.nodeBuffersGpu.colors = this.ensureBufferGpu(
      this.nodeBuffersGpu.colors,
      colors.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Node color buffer',
    );

    device.queue.writeBuffer(this.nodeBuffersGpu.indices.buffer, 0, indices);
    device.queue.writeBuffer(this.nodeBuffersGpu.positions.buffer, 0, positions);
    device.queue.writeBuffer(this.nodeBuffersGpu.sizes.buffer, 0, sizes);
    device.queue.writeBuffer(this.nodeBuffersGpu.colors.buffer, 0, colors);

    this.nodeBindGroup = device.createBindGroup({
      layout: this.nodeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.nodeBuffersGpu.indices.buffer } },
        { binding: 2, resource: { buffer: this.nodeBuffersGpu.positions.buffer } },
        { binding: 3, resource: { buffer: this.nodeBuffersGpu.sizes.buffer } },
        { binding: 4, resource: { buffer: this.nodeBuffersGpu.colors.buffer } },
        { binding: 5, resource: { buffer: this.globalsBuffer } },
      ],
    });
  }

  updateEdgeBuffersGpu(edges, device, maxBindingSize) {
    const { segments, colors, indices, widths } = edges;
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.edgeBuffersGpu.indices = this.ensureBufferGpu(
      this.edgeBuffersGpu.indices,
      indices.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge index buffer',
    );
    this.edgeBuffersGpu.segments = this.ensureBufferGpu(
      this.edgeBuffersGpu.segments,
      segments.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge segment buffer',
    );
    this.edgeBuffersGpu.colors = this.ensureBufferGpu(
      this.edgeBuffersGpu.colors,
      colors.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge color buffer',
    );
    this.edgeBuffersGpu.widths = this.ensureBufferGpu(
      this.edgeBuffersGpu.widths,
      widths.byteLength,
      storageUsage,
      device,
      maxBindingSize,
      'Edge width buffer',
    );
    device.queue.writeBuffer(this.edgeBuffersGpu.indices.buffer, 0, indices);
    device.queue.writeBuffer(this.edgeBuffersGpu.segments.buffer, 0, segments);
    device.queue.writeBuffer(this.edgeBuffersGpu.colors.buffer, 0, colors);
    device.queue.writeBuffer(this.edgeBuffersGpu.widths.buffer, 0, widths);

    this.edgeBindGroup = device.createBindGroup({
      layout: this.edgeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.edgeBuffersGpu.indices.buffer } },
        { binding: 2, resource: { buffer: this.edgeBuffersGpu.segments.buffer } },
        { binding: 3, resource: { buffer: this.edgeBuffersGpu.colors.buffer } },
        { binding: 4, resource: { buffer: this.edgeBuffersGpu.widths.buffer } },
        { binding: 5, resource: { buffer: this.globalsBuffer } },
      ],
    });
  }

  renderWebGPU(context, geometry, camera) {
    const { device } = this.device;
    const maxBindingSize = device.limits?.maxStorageBufferBindingSize;
    this.updateGlobalsGpu(device);
    this.updateCameraUniformsGpu(camera);
    if (!this.cameraBuffer) return;
    if (geometry.nodes.count) {
      this.updateNodeBuffersGpu(geometry.nodes, device, maxBindingSize);
    } else {
      this.nodeBindGroup = null;
    }
    if (geometry.edges.count) {
      this.updateEdgeBuffersGpu(geometry.edges, device, maxBindingSize);
    } else {
      this.edgeBindGroup = null;
    }

    if (geometry.nodes.count && this.nodeBindGroup) {
      context.passEncoder.setPipeline(this.nodePipeline);
      context.passEncoder.setBindGroup(0, this.nodeBindGroup);
      context.passEncoder.setVertexBuffer(0, this.nodeQuadBufferGpu);
      context.passEncoder.draw(4, geometry.nodes.count, 0, 0);
    }

    if (geometry.edges.count && this.edgeBindGroup) {
      if (this.edgeRenderingMode === 'quad' && this.edgeQuadPipeline) {
        context.passEncoder.setPipeline(this.edgeQuadPipeline);
        context.passEncoder.setBindGroup(0, this.edgeBindGroup);
        context.passEncoder.setVertexBuffer(0, this.edgeQuadBufferGpu);
        context.passEncoder.draw(4, geometry.edges.count, 0, 0);
      } else {
        context.passEncoder.setPipeline(this.edgePipeline);
        context.passEncoder.setBindGroup(0, this.edgeBindGroup);
        context.passEncoder.draw(geometry.edges.count * 2, 1, 0, 0);
      }
    }
  }

  getCameraUniforms(camera) {
    if (camera?.getUniforms) {
      const uniforms = camera.getUniforms();
      if (!this.ensureFinite(uniforms?.viewProjection) || !this.ensureFinite(uniforms?.view)) {
        console.warn('GraphLayer: camera matrices invalid, falling back to identity.', {
          view: uniforms?.view,
          projection: uniforms?.projection,
          viewProjection: uniforms?.viewProjection,
        });
        return this.getFallbackCameraUniforms();
      }
      return uniforms;
    }
    return this.getFallbackCameraUniforms();
  }

  ensureFinite(array) {
    if (!array) return false;
    for (let i = 0; i < array.length; i += 1) {
      if (!Number.isFinite(array[i])) return false;
    }
    return true;
  }

  getFallbackCameraUniforms() {
    if (!this.fallbackCameraUniforms) {
      const identity = new Float32Array(16);
      identity[0] = 1;
      identity[5] = 1;
      identity[10] = 1;
      identity[15] = 1;
      this.fallbackCameraUniforms = {
        view: identity,
        projection: identity,
        viewProjection: identity,
        position: new Float32Array([0, 0, 1]),
        right: new Float32Array([1, 0, 0]),
        up: new Float32Array([0, 1, 0]),
        mode: '2d',
        projectionType: 'orthographic',
        viewport: { width: 1, height: 1, devicePixelRatio: 1 },
      };
    }
    return this.fallbackCameraUniforms;
  }

  updateCameraUniformsGpu(camera) {
    if (!this.device?.device || !this.cameraBuffer || !this.cameraArray) return;
    const source = this.getCameraUniforms(camera);
    if (!source) return;
    this.cameraArray.set(source.viewProjection, 0);
    this.cameraArray.set(source.view, 16);
    this.cameraArray[32] = source.position?.[0] ?? 0;
    this.cameraArray[33] = source.position?.[1] ?? 0;
    this.cameraArray[34] = source.position?.[2] ?? 0;
    this.cameraArray[35] = source.mode === '2d' ? 1 : 0;
    this.cameraArray[36] = source.up?.[0] ?? 0;
    this.cameraArray[37] = source.up?.[1] ?? 1;
    this.cameraArray[38] = source.up?.[2] ?? 0;
    this.cameraArray[39] = 0;
    this.cameraArray[40] = source.right?.[0] ?? 1;
    this.cameraArray[41] = source.right?.[1] ?? 0;
    this.cameraArray[42] = source.right?.[2] ?? 0;
    this.cameraArray[43] = 0;
    const viewportWidth = source.viewport?.width ?? this.size?.width ?? 1;
    const viewportHeight = source.viewport?.height ?? this.size?.height ?? 1;
    const pixelRatio = source.viewport?.devicePixelRatio ?? this.size?.devicePixelRatio ?? 1;
    const drawWidth = viewportWidth * pixelRatio;
    const drawHeight = viewportHeight * pixelRatio;
    this.cameraArray[44] = drawWidth;
    this.cameraArray[45] = drawHeight;
    this.cameraArray[46] = drawWidth > 0 ? 1 / drawWidth : 0;
    this.cameraArray[47] = drawHeight > 0 ? 1 / drawHeight : 0;
    this.device.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraArray);
  }

  setEdgeRenderingMode(mode) {
    if (mode === 'line' || mode === 'quad') {
      this.edgeRenderingMode = mode;
    }
  }

  updateGlobalsGpu(device) {
    if (!device || !this.globalsBuffer || !this.globalsArray) return;
    const outlineColor = this.nodeOutlineColor || [0, 0, 0, 1];
    this.globalsArray[0] = this.nodeOpacityBase;
    this.globalsArray[1] = this.nodeOpacityScale;
    this.globalsArray[2] = this.nodeSizeBase;
    this.globalsArray[3] = this.nodeSizeScale;
    this.globalsArray[4] = this.nodeOutlineWidthBase;
    this.globalsArray[5] = this.nodeOutlineWidthScale;
    this.globalsArray[6] = this.edgeOpacityBase;
    this.globalsArray[7] = this.edgeOpacityScale;
    this.globalsArray[8] = this.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL;
    this.globalsArray[9] = this.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL;
    this.globalsArray[10] = outlineColor[0] ?? 0;
    this.globalsArray[11] = outlineColor[1] ?? 0;
    this.globalsArray[12] = outlineColor[2] ?? 0;
    this.globalsArray[13] = outlineColor[3] ?? 1;
    this.globalsArray[14] = 0;
    this.globalsArray[15] = 0;
    device.queue.writeBuffer(this.globalsBuffer, 0, this.globalsArray);
  }
}
