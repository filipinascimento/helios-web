const NODE_SHADER = /* wgsl */ `
struct Viewport {
  size: vec2<f32>,
  pixelRatio: f32,
  pad: f32,
};

struct NodeIndices {
  data: array<u32>,
};

struct NodePositions {
  data: array<vec2<f32>>,
};

struct NodeSizes {
  data: array<f32>,
};

struct NodeColors {
  data: array<vec4<f32>>,
};

@group(0) @binding(0) var<uniform> viewport : Viewport;
@group(0) @binding(1) var<storage, read> nodeIndices : NodeIndices;
@group(0) @binding(2) var<storage, read> nodePositions : NodePositions;
@group(0) @binding(3) var<storage, read> nodeSizes : NodeSizes;
@group(0) @binding(4) var<storage, read> nodeColors : NodeColors;

struct VertexInput {
  @location(0) corner : vec2<f32>,
  @builtin(instance_index) instance : u32,
};

struct VertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
  @location(1) local : vec2<f32>,
};

fn toClipSpace(value : vec2<f32>) -> vec4<f32> {
  let x = (value.x / viewport.size.x) * 2.0 - 1.0;
  let y = (value.y / viewport.size.y) * -2.0 + 1.0;
  return vec4<f32>(x, y, 0.0, 1.0);
}

@vertex
fn nodeVertex(input : VertexInput) -> VertexOutput {
  let index = nodeIndices.data[input.instance];
  let basePosition = nodePositions.data[index];
  let diameter = max(1.0, nodeSizes.data[index]);
  let radius = diameter * 0.5;
  let offset = input.corner * radius;
  var output : VertexOutput;
  output.position = toClipSpace(basePosition + offset);
  output.color = nodeColors.data[index];
  output.local = input.corner;
  return output;
}

@fragment
fn nodeFragment(input : VertexOutput) -> @location(0) vec4<f32> {
  let dist = length(input.local);
  if (dist > 1.0) {
    discard;
  }
  return input.color;
}`;

const EDGE_SHADER = /* wgsl */ `
struct Viewport {
  size: vec2<f32>,
  pixelRatio: f32,
  pad: f32,
};

struct EdgeSegments {
  data: array<vec4<f32>>,
};

struct EdgeColors {
  data: array<vec4<f32>>,
};

struct EdgeIndices {
  data: array<u32>,
};

@group(0) @binding(0) var<uniform> viewport : Viewport;
@group(0) @binding(1) var<storage, read> edgeIndices : EdgeIndices;
@group(0) @binding(2) var<storage, read> edgeSegments : EdgeSegments;
@group(0) @binding(3) var<storage, read> edgeColors : EdgeColors;

struct EdgeVertexOutput {
  @builtin(position) position : vec4<f32>,
  @location(0) color : vec4<f32>,
};

fn toClipSpace(value : vec2<f32>) -> vec4<f32> {
  let x = (value.x / viewport.size.x) * 2.0 - 1.0;
  let y = (value.y / viewport.size.y) * -2.0 + 1.0;
  return vec4<f32>(x, y, 0.0, 1.0);
}

@vertex
fn edgeVertex(@builtin(vertex_index) vertexIndex : u32) -> EdgeVertexOutput {
  let edgeSlot = vertexIndex / 2u;
  let edgeId = edgeIndices.data[edgeSlot];
  let segment = edgeSegments.data[edgeId];
  var position = vec2<f32>(segment.xy);
  if ((vertexIndex & 1u) == 1u) {
    position = vec2<f32>(segment.zw);
  }
  var output : EdgeVertexOutput;
  output.position = toClipSpace(position);
  output.color = edgeColors.data[edgeId];
  return output;
}

@fragment
fn edgeFragment(input : EdgeVertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color.rgb, input.color.a);
}`;

export class WebGPURenderer {
  constructor(canvas, options = {}) {
    const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.canvas = canvas;
    this.options = options;
    this.adapter = null;
    this.device = null;
    this.context = null;
    this.format = null;
    this.viewportBuffer = null;
    this.viewportArray = new Float32Array([1, 1, pixelRatio, 0]);
    this.nodeBuffers = {};
    this.edgeBuffers = {};
    this.clearColor = options.clearColor ?? { r: 0.01, g: 0.01, b: 0.02, a: 1 };
    this.quadVertexBuffer = null;
    this.nodePipeline = null;
    this.edgePipeline = null;
    this.nodeBindGroup = null;
    this.edgeBindGroup = null;
    this.size = { width: 1, height: 1, devicePixelRatio: pixelRatio };
  }

  static async isSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  async initialize() {
    if (!(await WebGPURenderer.isSupported())) {
      throw new Error('WebGPU is not available in this environment');
    }
    this.adapter = await navigator.gpu.requestAdapter();
    if (!this.adapter) {
      throw new Error('Unable to acquire GPU adapter');
    }
    this.device = await this.adapter.requestDevice();
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) {
      throw new Error('Unable to create WebGPU context');
    }
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
    });
    this.viewportBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.createQuadBuffer();
    this.createPipelines();
  }

  resize(size) {
    if (!this.device) return;
    this.size = size;
    this.viewportArray[0] = size.width;
    this.viewportArray[1] = size.height;
    this.viewportArray[2] = size.devicePixelRatio;
    this.device.queue.writeBuffer(this.viewportBuffer, 0, this.viewportArray);
  }

  createQuadBuffer() {
    const vertices = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]);
    this.quadVertexBuffer = this.device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.quadVertexBuffer.getMappedRange()).set(vertices);
    this.quadVertexBuffer.unmap();
  }

  createPipelines() {
    this.nodeBindGroupLayout = this.device.createBindGroupLayout({
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

    this.edgeBindGroupLayout = this.device.createBindGroupLayout({
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

    const nodeModule = this.device.createShaderModule({ code: NODE_SHADER });
    const edgeModule = this.device.createShaderModule({ code: EDGE_SHADER });

    this.nodePipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.nodeBindGroupLayout] }),
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
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-list' },
    });

    this.edgePipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: { module: edgeModule, entryPoint: 'edgeVertex' },
      fragment: {
        module: edgeModule,
        entryPoint: 'edgeFragment',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'line-list' },
    });
  }

  ensureBuffer(entry, requiredBytes, usage) {
    const aligned = Math.max(256, Math.ceil(requiredBytes / 256) * 256);
    if (!entry || aligned > entry.size) {
      entry?.buffer?.destroy?.();
      return {
        buffer: this.device.createBuffer({ size: aligned, usage }),
        size: aligned,
      };
    }
    return entry;
  }

  updateNodeBuffers(nodes) {
    const { positions, sizes, colors, indices } = nodes;
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.nodeBuffers.indices = this.ensureBuffer(this.nodeBuffers.indices, indices.byteLength, storageUsage);
    this.nodeBuffers.positions = this.ensureBuffer(this.nodeBuffers.positions, positions.byteLength, storageUsage);
    this.nodeBuffers.sizes = this.ensureBuffer(this.nodeBuffers.sizes, sizes.byteLength, storageUsage);
    this.nodeBuffers.colors = this.ensureBuffer(this.nodeBuffers.colors, colors.byteLength, storageUsage);

    this.device.queue.writeBuffer(this.nodeBuffers.indices.buffer, 0, indices);
    this.device.queue.writeBuffer(this.nodeBuffers.positions.buffer, 0, positions);
    this.device.queue.writeBuffer(this.nodeBuffers.sizes.buffer, 0, sizes);
    this.device.queue.writeBuffer(this.nodeBuffers.colors.buffer, 0, colors);

    this.nodeBindGroup = this.device.createBindGroup({
      layout: this.nodeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.viewportBuffer } },
        { binding: 1, resource: { buffer: this.nodeBuffers.indices.buffer } },
        { binding: 2, resource: { buffer: this.nodeBuffers.positions.buffer } },
        { binding: 3, resource: { buffer: this.nodeBuffers.sizes.buffer } },
        { binding: 4, resource: { buffer: this.nodeBuffers.colors.buffer } },
      ],
    });
  }

  updateEdgeBuffers(edges) {
    const { segments, colors, indices } = edges;
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.edgeBuffers.indices = this.ensureBuffer(this.edgeBuffers.indices, indices.byteLength, storageUsage);
    this.edgeBuffers.segments = this.ensureBuffer(this.edgeBuffers.segments, segments.byteLength, storageUsage);
    this.edgeBuffers.colors = this.ensureBuffer(this.edgeBuffers.colors, colors.byteLength, storageUsage);
    this.device.queue.writeBuffer(this.edgeBuffers.indices.buffer, 0, indices);
    this.device.queue.writeBuffer(this.edgeBuffers.segments.buffer, 0, segments);
    this.device.queue.writeBuffer(this.edgeBuffers.colors.buffer, 0, colors);

    this.edgeBindGroup = this.device.createBindGroup({
      layout: this.edgeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.viewportBuffer } },
        { binding: 1, resource: { buffer: this.edgeBuffers.indices.buffer } },
        { binding: 2, resource: { buffer: this.edgeBuffers.segments.buffer } },
        { binding: 3, resource: { buffer: this.edgeBuffers.colors.buffer } },
      ],
    });
  }

  render(frame) {
    if (!this.device) return;
    const { geometry } = frame;
    this.device.queue.writeBuffer(this.viewportBuffer, 0, this.viewportArray);
    if (geometry.nodes.count) {
      this.updateNodeBuffers(geometry.nodes);
    }
    if (geometry.edges.count) {
      this.updateEdgeBuffers(geometry.edges);
    }

    const commandEncoder = this.device.createCommandEncoder();
    const pass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: this.clearColor,
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    if (geometry.edges.count && this.edgeBindGroup) {
      pass.setPipeline(this.edgePipeline);
      pass.setBindGroup(0, this.edgeBindGroup);
      pass.draw(geometry.edges.count * 2, 1, 0, 0);
    }

    if (geometry.nodes.count && this.nodeBindGroup) {
      pass.setPipeline(this.nodePipeline);
      pass.setBindGroup(0, this.nodeBindGroup);
      pass.setVertexBuffer(0, this.quadVertexBuffer);
      pass.draw(6, geometry.nodes.count, 0, 0);
    }

    pass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  destroy() {
    this.nodeBuffers.indices?.buffer?.destroy?.();
    this.nodeBuffers.positions?.buffer?.destroy?.();
    this.nodeBuffers.sizes?.buffer?.destroy?.();
    this.nodeBuffers.colors?.buffer?.destroy?.();
    this.edgeBuffers.indices?.buffer?.destroy?.();
    this.edgeBuffers.segments?.buffer?.destroy?.();
    this.edgeBuffers.colors?.buffer?.destroy?.();
    this.viewportBuffer?.destroy?.();
  }
}
