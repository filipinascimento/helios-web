import {
  NODE_FRAGMENT_SOURCE,
  NODE_VERTEX_SOURCE,
  EDGE_FRAGMENT_SOURCE,
  EDGE_VERTEX_SOURCE,
} from './shaders/graphWebGL.js';
import { NODE_WGSL, EDGE_WGSL } from './shaders/graphWebGPU.js';

export class GraphLayer {
  constructor() {
    this.name = 'graph-layer';
    this.device = null;
    this.size = null;
    this.cpuArrays = {};

    // WebGL2 resources
    this.nodeProgram = null;
    this.edgeProgram = null;
    this.nodeUniformViewProjection = null;
    this.nodeUniformView = null;
    this.nodeUniformCameraPosition = null;
    this.nodeUniformCameraUp = null;
    this.nodeUniformCameraRight = null;
    this.nodeUniformIs2D = null;
    this.edgeUniformViewProjection = null;
    this.nodeVAO = null;
    this.nodeBuffers = {};
    this.edgeVAO = null;
    this.edgeBuffers = {};
    this.nodeCount = 0;
    this.edgeCount = 0;

    // WebGPU resources
    this.nodeBindGroupLayout = null;
    this.edgeBindGroupLayout = null;
    this.nodePipeline = null;
    this.edgePipeline = null;
    this.nodeBindGroup = null;
    this.edgeBindGroup = null;
    this.cameraArray = null;
    this.cameraBuffer = null;
    this.nodeBuffersGpu = {};
    this.edgeBuffersGpu = {};
    this.nodeQuadBufferGpu = null;
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
      if (this.nodeProgram) gl.deleteProgram(this.nodeProgram);
      if (this.edgeProgram) gl.deleteProgram(this.edgeProgram);
      if (this.nodeQuadBuffer) gl.deleteBuffer(this.nodeQuadBuffer);
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
      this.cameraBuffer?.destroy?.();
      this.nodeQuadBufferGpu?.destroy?.();
    }
  }

  initializeWebGL2(gl) {
    this.nodeProgram = this.device.createProgram(NODE_VERTEX_SOURCE, NODE_FRAGMENT_SOURCE);
    this.edgeProgram = this.device.createProgram(EDGE_VERTEX_SOURCE, EDGE_FRAGMENT_SOURCE);
    this.nodeUniformViewProjection = gl.getUniformLocation(this.nodeProgram, 'u_viewProjection');
    this.nodeUniformView = gl.getUniformLocation(this.nodeProgram, 'u_view');
    this.nodeUniformCameraPosition = gl.getUniformLocation(this.nodeProgram, 'u_cameraPosition');
    this.nodeUniformCameraUp = gl.getUniformLocation(this.nodeProgram, 'u_cameraUp');
    this.nodeUniformCameraRight = gl.getUniformLocation(this.nodeProgram, 'u_cameraRight');
    this.nodeUniformIs2D = gl.getUniformLocation(this.nodeProgram, 'u_is2D');
    this.edgeUniformViewProjection = gl.getUniformLocation(this.edgeProgram, 'u_viewProjection');

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
    gl.bindVertexArray(null);
  }

  renderWebGL2(gl, geometry, camera) {
    if (!geometry) return;
    const cameraUniforms = this.getCameraUniforms(camera);
    if (!cameraUniforms) return;
    const is2D = cameraUniforms.mode === '2d';
    if (is2D) {
      gl.disable(gl.DEPTH_TEST);
    }
    gl.clear(gl.DEPTH_BUFFER_BIT);
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

    if (this.edgeCount) {
      gl.useProgram(this.edgeProgram);
      gl.uniformMatrix4fv(this.edgeUniformViewProjection, false, cameraUniforms.viewProjection);
      gl.bindVertexArray(this.edgeVAO);
      gl.drawArraysInstanced(gl.LINES, 0, 2, this.edgeCount);
    }

    if (this.nodeCount) {
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
      gl.bindVertexArray(this.nodeVAO);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);
    }

    gl.bindVertexArray(null);
    if (is2D) {
      gl.enable(gl.DEPTH_TEST);
    }
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
      segmentOffset += 8;
    }

    gl.bindVertexArray(this.edgeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.bufferData(gl.ARRAY_BUFFER, segmentData.subarray(0, count * 8), gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.bufferData(gl.ARRAY_BUFFER, colorData.subarray(0, count * 4), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
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
      depthStencil,
      primitive: { topology: 'line-list' },
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
      ],
    });
  }

  updateEdgeBuffersGpu(edges, device, maxBindingSize) {
    const { segments, colors, indices } = edges;
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
    device.queue.writeBuffer(this.edgeBuffersGpu.indices.buffer, 0, indices);
    device.queue.writeBuffer(this.edgeBuffersGpu.segments.buffer, 0, segments);
    device.queue.writeBuffer(this.edgeBuffersGpu.colors.buffer, 0, colors);

    this.edgeBindGroup = device.createBindGroup({
      layout: this.edgeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cameraBuffer } },
        { binding: 1, resource: { buffer: this.edgeBuffersGpu.indices.buffer } },
        { binding: 2, resource: { buffer: this.edgeBuffersGpu.segments.buffer } },
        { binding: 3, resource: { buffer: this.edgeBuffersGpu.colors.buffer } },
      ],
    });
  }

  renderWebGPU(context, geometry, camera) {
    const { device } = this.device;
    const maxBindingSize = device.limits?.maxStorageBufferBindingSize;
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

    if (geometry.edges.count && this.edgeBindGroup) {
      context.passEncoder.setPipeline(this.edgePipeline);
      context.passEncoder.setBindGroup(0, this.edgeBindGroup);
      context.passEncoder.draw(geometry.edges.count * 2, 1, 0, 0);
    }

    if (geometry.nodes.count && this.nodeBindGroup) {
      context.passEncoder.setPipeline(this.nodePipeline);
      context.passEncoder.setBindGroup(0, this.nodeBindGroup);
      context.passEncoder.setVertexBuffer(0, this.nodeQuadBufferGpu);
      context.passEncoder.draw(4, geometry.nodes.count, 0, 0);
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
    this.device.device.queue.writeBuffer(this.cameraBuffer, 0, this.cameraArray);
  }
}
