import { bumpCounter } from '../../utilities/counters.js';
import { ResourceCache } from '../resources/ResourceCache.js';
import { resolveWebGPUAdapterOptions, resolveWebGPUCanvasSampleCount, resolveWebGPURequestAdapterArgument } from '../qualityOptions.js';

const PRESENT_WGSL = /* wgsl */ `
struct VertexOut {
  @builtin(position) position : vec4<f32>,
  @location(0) uv : vec2<f32>,
};

@vertex
fn vs(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VertexOut {
  var output : VertexOut;
  output.position = vec4<f32>(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}

@group(0) @binding(0) var textureSampler : sampler;
@group(0) @binding(1) var textureData : texture_2d<f32>;

@fragment
fn fs(input : VertexOut) -> @location(0) vec4<f32> {
  return textureSample(textureData, textureSampler, input.uv);
}`;

function objectOption(value) {
  return value && typeof value === 'object' ? value : {};
}

export class WebGPUDevice {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = options;
    this.adapter = null;
    this.device = null;
    this.context = null;
    this.format = null;
    this.quadVertexBuffer = null;
    this.presentPipeline = null;
    this.presentBindGroup = null;
    this.presentLayout = null;
    this.sampler = null;
    this.type = 'webgpu';
    this.size = { width: 1, height: 1, devicePixelRatio: 1 };
    this.depthTexture = null;
    this.depthSize = { width: 0, height: 0, sampleCount: 1 };
    this.colorTexture = null;
    this.colorSize = { width: 0, height: 0, sampleCount: 1 };
    this.depthFormat = 'depth24plus';
    this.limits = null;
    this.maxStorageBufferBindingSize = null;
    this.requestedLimits = null;
    this.counters = { beginFrame: 0, presentFramebuffer: 0 };
    this.resourceCache = new ResourceCache(this.type);
    this.sampleCount = 1;
    this.adapterOptions = null;
    this.deviceDescriptor = null;
    this.canvasConfiguration = null;
  }

  static async isSupported() {
    return typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  }

  async initialize() {
    if (!(await WebGPUDevice.isSupported())) {
      throw new Error('WebGPU is not available in this environment');
    }
    this.adapterOptions = resolveWebGPUAdapterOptions(this.options);
    this.adapter = await navigator.gpu.requestAdapter(resolveWebGPURequestAdapterArgument(this.options));
    if (!this.adapter) {
      throw new Error('Unable to acquire GPU adapter');
    }
    const storageLimitRatio = Math.min(Math.max(this.options.storageBufferLimitRatio ?? 0.75, 0), 1);
    const bufferLimitRatio = Math.min(Math.max(this.options.bufferLimitRatio ?? 1, 0), 1);
    const adapterStorageLimit = this.adapter.limits?.maxStorageBufferBindingSize;
    const adapterBufferLimit = this.adapter.limits?.maxBufferSize;
    const adapterStorageBuffersPerStage = this.adapter.limits?.maxStorageBuffersPerShaderStage;
    // Request higher limits (browser default is often 128 MB for storage and 256 MB for buffers).
    const baseStorageLimit = 128 * 1024 * 1024;
    const baseBufferLimit = 256 * 1024 * 1024;
    const requestedStorageLimit = adapterStorageLimit
      ? Math.min(adapterStorageLimit, Math.max(baseStorageLimit, Math.floor(adapterStorageLimit * storageLimitRatio)))
      : null;
    const requestedBufferLimit = adapterBufferLimit
      ? Math.min(adapterBufferLimit, Math.max(baseBufferLimit, Math.floor(adapterBufferLimit * bufferLimitRatio)))
      : null;
    const requiredLimits = {};
    if (requestedStorageLimit) {
      requiredLimits.maxStorageBufferBindingSize = requestedStorageLimit;
    }
    if (requestedBufferLimit) {
      requiredLimits.maxBufferSize = requestedBufferLimit;
    }
    if (adapterStorageBuffersPerStage && adapterStorageBuffersPerStage > 8) {
      requiredLimits.maxStorageBuffersPerShaderStage = Math.min(adapterStorageBuffersPerStage, 10);
    }
    const descriptor = { ...objectOption(this.options.webgpuDeviceDescriptor) };
    const requestedLimits = {
      ...requiredLimits,
      ...objectOption(descriptor.requiredLimits),
    };
    this.requestedLimits = Object.keys(requestedLimits).length ? requestedLimits : null;
    if (this.requestedLimits) {
      descriptor.requiredLimits = this.requestedLimits;
    }
    this.deviceDescriptor = descriptor;
    this.device = await this.adapter.requestDevice(descriptor);
    this.limits = this.device.limits;
    this.maxStorageBufferBindingSize = this.device.limits?.maxStorageBufferBindingSize ?? null;
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) {
      throw new Error('Unable to create WebGPU context');
    }
    const canvasConfigOverrides = objectOption(this.options.webgpuCanvasConfiguration);
    this.format = canvasConfigOverrides.format ?? navigator.gpu.getPreferredCanvasFormat();
    this.sampleCount = resolveWebGPUCanvasSampleCount(this.options);
    this.canvasConfiguration = {
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
      ...canvasConfigOverrides,
    };
    this.canvasConfiguration.device = this.device;
    this.format = this.canvasConfiguration.format;
    this.context.configure(this.canvasConfiguration);
    this.createQuadBuffer();
    this.createPresentPipeline();
  }

  createQuadBuffer() {
    // Triangle strip quad
    const vertices = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      1, 1, 1, 1,
    ]);
    this.quadVertexBuffer = this.device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.quadVertexBuffer.getMappedRange()).set(vertices);
    this.quadVertexBuffer.unmap();
  }

  createPresentPipeline() {
    const shaderModule = this.device.createShaderModule({ code: PRESENT_WGSL });
    this.sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.presentLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    });
    const pipelineLayout = this.device.createPipelineLayout({ bindGroupLayouts: [this.presentLayout] });
    this.presentPipeline = this.device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: 16,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs',
        targets: [{ format: this.format }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  resize(size) {
    this.size = size;
  }

  resolveFrameExtent(renderTarget, targetTexture) {
    const textureWidth = Number.isFinite(targetTexture?.width) ? targetTexture.width : null;
    const textureHeight = Number.isFinite(targetTexture?.height) ? targetTexture.height : null;
    return {
      width: renderTarget?.width ?? textureWidth ?? this.canvas.width,
      height: renderTarget?.height ?? textureHeight ?? this.canvas.height,
    };
  }

  beginFrame(renderTarget, clearColor, rect) {
    this.counters.beginFrame = bumpCounter(this.counters.beginFrame);
    const targetTexture = renderTarget ? renderTarget.texture : this.context.getCurrentTexture();
    const { width, height } = this.resolveFrameExtent(renderTarget, targetTexture);
    const sampleCount = renderTarget ? 1 : this.sampleCount;
    const colorTexture = sampleCount > 1
      ? this.ensureColorTexture(width, height, sampleCount)
      : targetTexture;
    const colorView = colorTexture.createView();
    const resolveTargetView = sampleCount > 1 ? targetTexture.createView() : null;
    const depthView = renderTarget?.depthTexture
      ? renderTarget.depthTexture.createView()
      : this.ensureDepthTexture(width, height, sampleCount)?.createView();

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: colorView,
          ...(resolveTargetView ? { resolveTarget: resolveTargetView } : {}),
          clearValue: clearColor
            ? { r: clearColor[0], g: clearColor[1], b: clearColor[2], a: clearColor[3] }
            : { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      ...(depthView
        ? {
            depthStencilAttachment: {
              view: depthView,
              depthClearValue: 1.0,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
            },
          }
        : {}),
    });

    if (rect) {
      pass.setViewport(rect.x, rect.y, rect.width, rect.height, 0, 1);
    }

    return {
      type: 'webgpu',
      device: this.device,
      passEncoder: pass,
      commandEncoder: encoder,
      format: this.format,
      quad: this.quadVertexBuffer,
      target: renderTarget,
      colorView,
      resolveTargetView,
      depthView,
      width,
      height,
      viewport: rect ?? null,
      sampleCount,
    };
  }

  endFrame(context) {
    if (context.passEncoder) {
      context.passEncoder.end();
    }
    this.device.queue.submit([context.commandEncoder.finish()]);
  }

  destroy() {
    this.resourceCache?.destroy(this);
    this.quadVertexBuffer?.destroy?.();
    this.colorTexture?.destroy?.();
    this.colorTexture = null;
    this.depthTexture?.destroy?.();
    this.depthTexture = null;
  }

  createFramebuffer(width, height) {
    const texture = this.device.createTexture({
      size: { width, height },
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    const depthTexture = this.device.createTexture({
      size: { width, height, depthOrArrayLayers: 1 },
      format: this.depthFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    return {
      type: 'webgpu',
      texture,
      depthTexture,
      width,
      height,
    };
  }

  presentFramebuffer(framebuffer, rect) {
    if (!framebuffer?.texture) return;
    this.counters.presentFramebuffer = bumpCounter(this.counters.presentFramebuffer);
    const view = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    if (rect) {
      pass.setViewport(rect.x, rect.y, rect.width, rect.height, 0, 1);
    }
    const bindGroup = this.device.createBindGroup({
      layout: this.presentLayout,
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: framebuffer.texture.createView() },
      ],
    });
    pass.setPipeline(this.presentPipeline);
    pass.setVertexBuffer(0, this.quadVertexBuffer);
    pass.setBindGroup(0, bindGroup);
    pass.draw(4, 1, 0, 0);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  async readPixels(framebuffer, rect) {
    const targetTexture = framebuffer?.texture ?? this.context.getCurrentTexture();
    const width = rect?.width ?? framebuffer?.width ?? this.canvas.width;
    const height = rect?.height ?? framebuffer?.height ?? this.canvas.height;
    const x = rect?.x ?? 0;
    const y = rect?.y ?? 0;
    const encoder = this.device.createCommandEncoder();
    const bytesPerPixel = 4;
    const alignedBytesPerRow = Math.ceil((width * bytesPerPixel) / 256) * 256;
    const readBuffer = this.device.createBuffer({
      size: alignedBytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyTextureToBuffer(
      { texture: targetTexture, origin: { x, y, z: 0 } },
      { buffer: readBuffer, bytesPerRow: alignedBytesPerRow },
      { width, height, depthOrArrayLayers: 1 },
    );
    this.device.queue.submit([encoder.finish()]);
    await readBuffer.mapAsync(GPUMapMode.READ);
    const mapped = new Uint8Array(readBuffer.getMappedRange());
    const result = new Uint8Array(width * height * bytesPerPixel);
    for (let row = 0; row < height; row += 1) {
      const srcStart = row * alignedBytesPerRow;
      const dstStart = row * width * bytesPerPixel;
      result.set(mapped.subarray(srcStart, srcStart + width * bytesPerPixel), dstStart);
    }
    readBuffer.destroy();
    return result;
  }

  ensureDepthTexture(width, height, sampleCount = 1) {
    if (!width || !height) return null;
    if (
      !this.depthTexture
      || this.depthSize.width !== width
      || this.depthSize.height !== height
      || this.depthSize.sampleCount !== sampleCount
    ) {
      this.depthTexture?.destroy?.();
      this.depthTexture = this.device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format: this.depthFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        sampleCount,
      });
      this.depthSize = { width, height, sampleCount };
    }
    return this.depthTexture;
  }

  ensureColorTexture(width, height, sampleCount = 1) {
    if (!width || !height || sampleCount <= 1) return null;
    if (
      !this.colorTexture
      || this.colorSize.width !== width
      || this.colorSize.height !== height
      || this.colorSize.sampleCount !== sampleCount
    ) {
      this.colorTexture?.destroy?.();
      this.colorTexture = this.device.createTexture({
        size: { width, height, depthOrArrayLayers: 1 },
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
        sampleCount,
      });
      this.colorSize = { width, height, sampleCount };
    }
    return this.colorTexture;
  }
}
