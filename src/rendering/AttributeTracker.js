import { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './engine/GraphLayerCommon.js';
import {
  NODE_ATTRIBUTE_VERTEX,
  NODE_ATTRIBUTE_FRAGMENT,
  EDGE_ATTRIBUTE_VERTEX,
  EDGE_ATTRIBUTE_FRAGMENT,
  EDGE_ATTRIBUTE_QUAD_VERTEX,
  EDGE_ATTRIBUTE_QUAD_FRAGMENT,
} from './engine/shaders/attributeWebGL.js';
import {
  NODE_ATTRIBUTE_WGSL,
  EDGE_ATTRIBUTE_WGSL,
} from './engine/shaders/attributeWebGPU.js';

function decodePacked(bytes, offset = 0) {
  const r = bytes[offset] ?? 0;
  const g = bytes[offset + 1] ?? 0;
  const b = bytes[offset + 2] ?? 0;
  const a = bytes[offset + 3] ?? 0;
  const value = r + (g << 8) + (b << 16) + (a << 24);
  return value - 1;
}

const ENCODE_FORMAT = 'u8x4';
const INDEX_SENTINEL = '$index';

function getEncodedName(scope, sourceName) {
  return `_helios_encoded_${scope}_${sourceName || 'index'}`;
}

function getEncodedView(network, scope, attrName) {
  if (!network || !attrName) return null;
  const source = attrName === 'index' ? INDEX_SENTINEL : attrName;
  const encodedName = getEncodedName(scope, source);
  const defineFn = scope === 'node'
    ? 'defineDenseColorEncodedNodeAttribute'
    : 'defineDenseColorEncodedEdgeAttribute';
  const updateFn = scope === 'node'
    ? 'updateDenseColorEncodedNodeAttribute'
    : 'updateDenseColorEncodedEdgeAttribute';
  const getFn = scope === 'node'
    ? 'getDenseColorEncodedNodeAttributeView'
    : 'getDenseColorEncodedEdgeAttributeView';
  const desc = network[getFn]?.(encodedName);
  return desc?.view ?? null;
}

function ensureEncodedView(network, scope, attrName, count) {
  if (!attrName || !count) return null;
  const encoded = getEncodedView(network, scope, attrName);
  if (!encoded) {
    throw new Error(`Encoded ${scope} attribute "${attrName}" not available; expected dense color encoding from helios-network.`);
  }
  return encoded;
}

function ensureEncodedReady(network, scope, attrName) {
  if (!network || !attrName) return;
  const source = attrName === 'index' ? INDEX_SENTINEL : attrName;
  const encodedName = getEncodedName(scope, source);
  const defineFn = scope === 'node'
    ? 'defineDenseColorEncodedNodeAttribute'
    : 'defineDenseColorEncodedEdgeAttribute';
  const updateFn = scope === 'node'
    ? 'updateDenseColorEncodedNodeAttribute'
    : 'updateDenseColorEncodedEdgeAttribute';
  network[defineFn]?.(source, encodedName, { format: ENCODE_FORMAT });
  network[updateFn]?.(encodedName);
}

class WebGLAttributeRenderer {
  constructor(graphLayer) {
    this.graphLayer = graphLayer;
    this.gl = null;
    this.device = null;
    this.trackDepth = false;
    this.nodeProgram = null;
    this.edgeProgram = null;
    this.edgeQuadProgram = null;
    this.nodeVAO = null;
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.nodeBuffers = {};
    this.edgeBuffers = {};
    this.edgeQuadBuffer = null;
    this.targets = { node: null, edge: null };
    this.size = null;
  }

  initialize(device) {
    if (this.gl) return;
    if (!device || device.type !== 'webgl2') return;
    this.device = device;
    this.gl = device.gl;
    const { gl } = this;
    this.nodeProgram = device.createProgram(NODE_ATTRIBUTE_VERTEX, NODE_ATTRIBUTE_FRAGMENT);
    this.edgeProgram = device.createProgram(EDGE_ATTRIBUTE_VERTEX, EDGE_ATTRIBUTE_FRAGMENT);
    this.edgeQuadProgram = device.createProgram(EDGE_ATTRIBUTE_QUAD_VERTEX, EDGE_ATTRIBUTE_QUAD_FRAGMENT);

    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    const nodeQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.nodeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.nodeBuffers.positions = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    this.nodeBuffers.sizes = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    this.nodeBuffers.encoded = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.encoded);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, 4, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);

    this.edgeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeVAO);
    this.edgeBuffers.segments = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(1, 1);

    this.edgeBuffers.widths = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(2, 1);

    this.edgeBuffers.endpointSizes = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(3, 1);

    this.edgeBuffers.encoded = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, 4, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);

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
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(2, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(4, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribIPointer(5, 4, gl.UNSIGNED_BYTE, 4, 0);
    gl.vertexAttribDivisor(5, 1);
    gl.bindVertexArray(null);
  }

  destroy() {
    const { gl } = this;
    if (!gl) return;
    gl.deleteVertexArray(this.nodeVAO);
    gl.deleteVertexArray(this.edgeVAO);
    gl.deleteVertexArray(this.edgeQuadVAO);
    gl.deleteBuffer(this.edgeQuadBuffer);
    Object.values(this.nodeBuffers).forEach((buf) => gl.deleteBuffer(buf));
    Object.values(this.edgeBuffers).forEach((buf) => gl.deleteBuffer(buf));
    gl.deleteProgram(this.nodeProgram);
    gl.deleteProgram(this.edgeProgram);
    gl.deleteProgram(this.edgeQuadProgram);
    this.nodeVAO = null;
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.targets.node && gl.deleteFramebuffer(this.targets.node.handle);
    this.targets.edge && gl.deleteFramebuffer(this.targets.edge.handle);
    if (this.targets.node?.texture) gl.deleteTexture(this.targets.node.texture);
    if (this.targets.edge?.texture) gl.deleteTexture(this.targets.edge.texture);
    if (this.targets.node?.depth) gl.deleteRenderbuffer(this.targets.node.depth);
    if (this.targets.edge?.depth) gl.deleteRenderbuffer(this.targets.edge.depth);
    this.targets = { node: null, edge: null };
  }

  resize(size, scale, trackDepth) {
    if (!size) return;
    this.trackDepth = trackDepth === true;
    const pixelRatio = size.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.floor((size.width ?? 1) * pixelRatio * scale));
    const height = Math.max(1, Math.floor((size.height ?? 1) * pixelRatio * scale));
    if (this.size && this.size.width === width && this.size.height === height) {
      return;
    }
    if (this.targets.node) {
      this.gl.deleteFramebuffer(this.targets.node.handle);
      this.gl.deleteTexture(this.targets.node.texture);
      if (this.targets.node.depth) this.gl.deleteRenderbuffer(this.targets.node.depth);
      if (this.targets.node.depthTexture) this.gl.deleteTexture(this.targets.node.depthTexture);
    }
    if (this.targets.edge) {
      this.gl.deleteFramebuffer(this.targets.edge.handle);
      this.gl.deleteTexture(this.targets.edge.texture);
      if (this.targets.edge.depth) this.gl.deleteRenderbuffer(this.targets.edge.depth);
      if (this.targets.edge.depthTexture) this.gl.deleteTexture(this.targets.edge.depthTexture);
    }
    this.size = { width, height };
    this.targets.node = this.createTarget(width, height);
    this.targets.edge = this.createTarget(width, height);
  }

  createTarget(width, height) {
    if (!this.trackDepth) {
      return this.device.createFramebuffer(width, height);
    }
    const { gl } = this;
    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    // Use depth24/UNSIGNED_INT for broad compatibility; avoid float depth read issues.
    let depthTexture = gl.createTexture();
    const depthFormat = gl.DEPTH_COMPONENT24;
    const depthType = gl.UNSIGNED_INT;
    gl.bindTexture(gl.TEXTURE_2D, depthTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, depthFormat, width, height, 0, gl.DEPTH_COMPONENT, depthType, null);
    const err = gl.getError();
    const isDevEnv = typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';
    if (isDevEnv) {
      console.info('AttributeTracker: depth target format', {
        chosen: depthFormat,
        type: depthType,
        note: 'Using depth24/UNSIGNED_INT for attribute depth readback',
        err,
      });
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);

    // Try a tiny read to confirm depth readback support; if it fails, disable depth tracking.
    let depthReadable = true;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const probe = new Uint32Array(1);
    gl.getError();
    gl.readPixels(0, 0, 1, 1, gl.DEPTH_COMPONENT, depthType, probe);
    const readErr = gl.getError();
    if (readErr !== gl.NO_ERROR) {
      depthReadable = false;
      if (isDevEnv) {
        console.warn('AttributeTracker: depth readPixels unsupported, disabling depth tracking for attribute pass', { readErr, depthFormat, depthType });
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return {
      type: 'webgl2',
      handle: framebuffer,
      texture,
      depthTexture,
      depthFormat,
      depthType,
      depthReadable,
      width,
      height,
    };
  }

  encodeAttributes(network, geometry, config) {
    const nodeCount = geometry?.nodes?.count ?? 0;
    const edgeCount = geometry?.edges?.count ?? 0;
    const nodeEncoded = ensureEncodedView(network, 'node', config.nodeAttribute, nodeCount);
    const edgeEncoded = ensureEncodedView(network, 'edge', config.edgeAttribute, edgeCount);
    return { nodeEncoded, edgeEncoded };
  }

  render(frame, size, config) {
    if (!this.gl || !frame?.network) return null;
    const network = frame.network;
    const camera = frame.camera;
    const scale = config.resolutionScale ?? 1;
    // Prepare encoded buffers outside buffer access to avoid allocation errors.
    ensureEncodedReady(network, 'node', config.nodeAttribute);
    ensureEncodedReady(network, 'edge', config.edgeAttribute);
    this.resize(size, scale, config.trackDepth);
    const cameraUniforms = this.graphLayer.getCameraUniforms(camera);
    if (!cameraUniforms) return null;
    if (!this.graphLayer.updateDenseGraphBuffers(network)) return null;

    let geometry = null;
    let encoded = null;
    network.withBufferAccess(() => {
      geometry = this.graphLayer.readDenseGraph(network);
      encoded = this.encodeAttributes(network, geometry, config);
    });
    if (!geometry) return null;

    const { gl } = this;
    const is2D = cameraUniforms.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
    const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
    const edgeWidthBase = this.graphLayer.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
    const edgeWidthScale = this.graphLayer.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    if (geometry.nodes.count && encoded.nodeEncoded && config.nodeAttribute) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.node?.handle ?? null);
      gl.viewport(0, 0, this.size.width, this.size.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.nodeProgram);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.nodeProgram, 'u_viewProjection'), false, cameraUniforms.viewProjection);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.nodeProgram, 'u_view'), false, cameraUniforms.view);
      gl.uniform3fv(gl.getUniformLocation(this.nodeProgram, 'u_cameraPosition'), cameraUniforms.position);
      gl.uniform3fv(gl.getUniformLocation(this.nodeProgram, 'u_cameraUp'), cameraUniforms.up);
      gl.uniform3fv(gl.getUniformLocation(this.nodeProgram, 'u_cameraRight'), cameraUniforms.right);
      gl.uniform1i(gl.getUniformLocation(this.nodeProgram, 'u_is2D'), is2D ? 1 : 0);
      gl.uniform1f(gl.getUniformLocation(this.nodeProgram, 'u_nodeSizeBase'), this.graphLayer.nodeSizeBase);
      gl.uniform1f(gl.getUniformLocation(this.nodeProgram, 'u_nodeSizeScale'), this.graphLayer.nodeSizeScale);
      gl.uniform1f(gl.getUniformLocation(this.nodeProgram, 'u_outlineWidthBase'), this.graphLayer.nodeOutlineWidthBase);
      gl.uniform1f(gl.getUniformLocation(this.nodeProgram, 'u_outlineWidthScale'), this.graphLayer.nodeOutlineWidthScale);
      gl.bindVertexArray(this.nodeVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.positions, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.sizes, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.encoded);
      gl.bufferData(gl.ARRAY_BUFFER, encoded.nodeEncoded, gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.nodes.count);
    }

    if (geometry.edges.count && encoded.edgeEncoded && config.edgeAttribute) {
      // Depth test/write for edges so overlaps are correct in attribute targets.
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.edge?.handle ?? null);
      gl.viewport(0, 0, this.size.width, this.size.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const useQuads = this.graphLayer.edgeRenderingMode === 'quad';
      const widthBaseLocation = 'u_edgeWidthBase';
      const widthScaleLocation = 'u_edgeWidthScale';
      const nodeSizeBaseLocation = 'u_nodeSizeBase';
      const nodeSizeScaleLocation = 'u_nodeSizeScale';
      const endpointLocation = 'u_edgeEndpointTrim';
      const program = useQuads ? this.edgeQuadProgram : this.edgeProgram;
      gl.useProgram(program);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewProjection'), false, cameraUniforms.viewProjection);
      gl.uniform1f(gl.getUniformLocation(program, widthBaseLocation), edgeWidthBase);
      gl.uniform1f(gl.getUniformLocation(program, widthScaleLocation), edgeWidthScale);
      gl.uniform1f(gl.getUniformLocation(program, nodeSizeBaseLocation), this.graphLayer.nodeSizeBase);
      gl.uniform1f(gl.getUniformLocation(program, nodeSizeScaleLocation), this.graphLayer.nodeSizeScale);
      gl.uniform1f(gl.getUniformLocation(program, endpointLocation), this.graphLayer.edgeEndpointTrim);
      if (useQuads) {
        const viewport = cameraUniforms.viewport;
        const vw = viewport?.width ? viewport.width * (viewport.devicePixelRatio ?? 1) : this.size.width;
        const vh = viewport?.height ? viewport.height * (viewport.devicePixelRatio ?? 1) : this.size.height;
        gl.uniform2f(gl.getUniformLocation(program, 'u_viewport'), vw, vh);
      }
      gl.bindVertexArray(useQuads ? this.edgeQuadVAO : this.edgeVAO);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.segments, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.widths, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.endpointSizes, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
      gl.bufferData(gl.ARRAY_BUFFER, encoded.edgeEncoded, gl.DYNAMIC_DRAW);
      if (useQuads) {
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.edges.count);
      } else {
        gl.drawArraysInstanced(gl.LINES, 0, 2, geometry.edges.count);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    // Restore default blend/depth state expected by the main render pass.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    return this.targets;
  }

  readDepth(target, x, y) {
    if (!this.trackDepth || !target?.depthTexture || target.depthReadable === false) return null;
    const { gl } = this;
    const type = target.depthType ?? gl.FLOAT;
    const pixel = type === gl.UNSIGNED_INT ? new Uint32Array(1) : new Float32Array(1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.handle);
    gl.getError(); // clear previous errors
    try {
      gl.readPixels(x, y, 1, 1, gl.DEPTH_COMPONENT, type, pixel);
    } catch (error) {
      console.warn('AttributeTracker: depth read failed', error);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return null;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const postErr = gl.getError();
    if (postErr !== gl.NO_ERROR) {
      console.warn('AttributeTracker: depth readPixels error', { postErr, type, depthFormat: target.depthFormat });
      return null;
    }
    let depth = pixel[0];
    if (type === gl.UNSIGNED_INT) {
      depth = depth / 0xffffff;
    }
    return Number.isFinite(depth) ? depth : null;
  }
}

class WebGPUAttributeRenderer {
  constructor(graphLayer) {
    this.graphLayer = graphLayer;
    this.device = null;
    this.nodePipeline = null;
    this.edgePipeline = null;
    this.edgeQuadPipeline = null;
    this.nodeBindGroupLayout = null;
    this.edgeBindGroupLayout = null;
    this.nodeBindGroup = null;
    this.edgeBindGroup = null;
    this.nodeBuffers = {};
    this.edgeBuffers = {};
    this.cornerBuffer = null;
    this.edgeCornerBuffer = null;
    this.targets = { node: null, edge: null };
    this.size = null;
  }

  initialize(device) {
    if (this.device) return;
    if (!device || device.type !== 'webgpu') return;
    this.device = device;
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    this.cornerBuffer = device.device.createBuffer({
      size: quad.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.cornerBuffer.getMappedRange()).set(quad);
    this.cornerBuffer.unmap();

    const edgeQuad = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    this.edgeCornerBuffer = device.device.createBuffer({
      size: edgeQuad.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.edgeCornerBuffer.getMappedRange()).set(edgeQuad);
    this.edgeCornerBuffer.unmap();

    this.nodeBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    this.edgeBindGroupLayout = device.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const nodeModule = device.device.createShaderModule({ code: NODE_ATTRIBUTE_WGSL });
    const edgeModule = device.device.createShaderModule({ code: EDGE_ATTRIBUTE_WGSL });
    this.nodePipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.nodeBindGroupLayout] }),
      vertex: {
        module: nodeModule,
        entryPoint: 'nodeVertex',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
          {
            arrayStride: 32,
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' },
              { shaderLocation: 2, offset: 12, format: 'float32' },
              { shaderLocation: 3, offset: 16, format: 'uint32x4' },
            ],
            stepMode: 'instance',
          },
        ],
      },
      fragment: { module: nodeModule, entryPoint: 'nodeFragment', targets: [{ format: device.format }] },
      depthStencil: { format: device.depthFormat ?? 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });

    this.edgePipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: {
        module: edgeModule,
        entryPoint: 'edgeVertex',
        buffers: [
          {
            arrayStride: 56,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
              { shaderLocation: 2, offset: 24, format: 'float32x2' },
              { shaderLocation: 3, offset: 32, format: 'float32x2' },
              { shaderLocation: 4, offset: 40, format: 'uint32x4' },
            ],
            stepMode: 'instance',
          },
        ],
      },
      fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format: device.format }] },
      depthStencil: { format: device.depthFormat ?? 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'line-list' },
    });

    this.edgeQuadPipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: {
        module: edgeModule,
        entryPoint: 'edgeQuadVertex',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
          {
            arrayStride: 56,
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' },
              { shaderLocation: 2, offset: 12, format: 'float32x3' },
              { shaderLocation: 3, offset: 24, format: 'float32x2' },
              { shaderLocation: 4, offset: 32, format: 'float32x2' },
              { shaderLocation: 5, offset: 40, format: 'uint32x4' },
            ],
            stepMode: 'instance',
          },
        ],
      },
      fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format: device.format }] },
      depthStencil: { format: device.depthFormat ?? 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });
  }

  destroy() {
    this.targets.node?.texture?.destroy?.();
    this.targets.edge?.texture?.destroy?.();
    this.targets.node?.depthTexture?.destroy?.();
    this.targets.edge?.depthTexture?.destroy?.();
    this.cornerBuffer?.destroy?.();
    this.edgeCornerBuffer?.destroy?.();
    this.nodeBuffers.instances?.destroy?.();
    this.edgeBuffers.instances?.destroy?.();
    Object.values(this.nodeBuffers).forEach((buf) => buf?.destroy?.());
    Object.values(this.edgeBuffers).forEach((buf) => buf?.destroy?.());
  }

  resize(size, scale) {
    if (!size || !this.device) return;
    const pixelRatio = size.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.floor((size.width ?? 1) * pixelRatio * scale));
    const height = Math.max(1, Math.floor((size.height ?? 1) * pixelRatio * scale));
    if (this.size && this.size.width === width && this.size.height === height) return;
    this.targets.node?.texture?.destroy?.();
    this.targets.edge?.texture?.destroy?.();
    this.targets.node?.depthTexture?.destroy?.();
    this.targets.edge?.depthTexture?.destroy?.();
    this.size = { width, height };
    this.targets.node = this.device.createFramebuffer(width, height);
    this.targets.edge = this.device.createFramebuffer(width, height);
  }

  encodeAttributes(network, geometry, config) {
    const { nodeAttribute, edgeAttribute } = config;
    const nodeCount = geometry.nodes.count ?? 0;
    const edgeCount = geometry.edges.count ?? 0;
    const nodeEncoded = ensureEncodedView(network, 'node', nodeAttribute, nodeCount);
    const edgeEncoded = ensureEncodedView(network, 'edge', edgeAttribute, edgeCount);
    return { nodeEncoded, edgeEncoded };
  }

  render(frame, size, config) {
    if (!this.device || !frame?.network) return null;
    const network = frame.network;
    const camera = frame.camera;
    const scale = config.resolutionScale ?? 1;
    ensureEncodedReady(network, 'node', config.nodeAttribute);
    ensureEncodedReady(network, 'edge', config.edgeAttribute);
    this.resize(size, scale);
    const cameraUniforms = this.graphLayer.getCameraUniforms(camera);
    if (!cameraUniforms) return null;
    if (!this.graphLayer.updateDenseGraphBuffers(network)) return null;
    let geometry = null;
    let encoded = null;
    network.withBufferAccess(() => {
      geometry = this.graphLayer.readDenseGraph(network);
      encoded = this.encodeAttributes(network, geometry, config);
    });
    if (!geometry) return null;

    const gpu = this.device.device;
    const is2D = cameraUniforms.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
    const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
    const edgeWidthBase = this.graphLayer.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
    const edgeWidthScale = this.graphLayer.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;

    const cameraBuffer = gpu.createBuffer({
      size: 48 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    const cameraArray = new Float32Array(cameraBuffer.getMappedRange());
    cameraArray.set(cameraUniforms.viewProjection, 0);
    cameraArray.set(cameraUniforms.view, 16);
    cameraArray.set(cameraUniforms.position ?? [0, 0, 0], 32);
    cameraArray[35] = is2D ? 1 : 0;
    cameraArray.set(cameraUniforms.up ?? [0, 1, 0], 36);
    cameraArray.set(cameraUniforms.right ?? [1, 0, 0], 40);
    const viewportWidth = cameraUniforms.viewport?.width ?? size.width ?? 1;
    const viewportHeight = cameraUniforms.viewport?.height ?? size.height ?? 1;
    const pixelRatio = cameraUniforms.viewport?.devicePixelRatio ?? size.devicePixelRatio ?? 1;
    const drawWidth = viewportWidth * pixelRatio;
    const drawHeight = viewportHeight * pixelRatio;
    cameraArray[44] = drawWidth;
    cameraArray[45] = drawHeight;
    cameraArray[46] = drawWidth > 0 ? 1 / drawWidth : 0;
    cameraArray[47] = drawHeight > 0 ? 1 / drawHeight : 0;
    cameraBuffer.unmap();

    const globalsBuffer = gpu.createBuffer({
      size: 24 * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    const globalsArray = new Float32Array(globalsBuffer.getMappedRange());
    globalsArray[0] = this.graphLayer.nodeOpacityBase;
    globalsArray[1] = this.graphLayer.nodeOpacityScale;
    globalsArray[2] = this.graphLayer.nodeSizeBase;
    globalsArray[3] = this.graphLayer.nodeSizeScale;
    globalsArray[4] = this.graphLayer.nodeOutlineWidthBase;
    globalsArray[5] = this.graphLayer.nodeOutlineWidthScale;
    globalsArray[6] = this.graphLayer.edgeOpacityBase;
    globalsArray[7] = this.graphLayer.edgeOpacityScale;
    globalsArray[8] = edgeWidthBase;
    globalsArray[9] = edgeWidthScale;
    globalsArray[12] = this.graphLayer.nodeOutlineColor?.[0] ?? 0;
    globalsArray[13] = this.graphLayer.nodeOutlineColor?.[1] ?? 0;
    globalsArray[14] = this.graphLayer.nodeOutlineColor?.[2] ?? 0;
    globalsArray[15] = this.graphLayer.nodeOutlineColor?.[3] ?? 1;
    globalsArray[16] = this.graphLayer.edgeEndpointTrim;
    globalsBuffer.unmap();

    const encoder = gpu.createCommandEncoder();
    if (geometry.nodes.count && encoded.nodeEncoded && config.nodeAttribute) {
      this.nodeBuffers.instances?.destroy?.();
      const nodeStrideBytes = 32;
      const nodeStrideFloats = nodeStrideBytes / 4;
      const buffer = new ArrayBuffer(geometry.nodes.count * nodeStrideBytes);
      const floatView = new Float32Array(buffer);
      const uintView = new Uint32Array(buffer);
      for (let i = 0; i < geometry.nodes.count; i += 1) {
        const posBase = i * 3;
        const base = i * nodeStrideFloats;
        floatView[base] = geometry.nodes.positions[posBase];
        floatView[base + 1] = geometry.nodes.positions[posBase + 1];
        floatView[base + 2] = geometry.nodes.positions[posBase + 2];
        floatView[base + 3] = geometry.nodes.sizes[i];
        const encBase = base + 4;
        const srcBase = i * 4;
        uintView[encBase] = encoded.nodeEncoded[srcBase] ?? 0;
        uintView[encBase + 1] = encoded.nodeEncoded[srcBase + 1] ?? 0;
        uintView[encBase + 2] = encoded.nodeEncoded[srcBase + 2] ?? 0;
        uintView[encBase + 3] = encoded.nodeEncoded[srcBase + 3] ?? 0;
      }
      this.nodeBuffers.instances = gpu.createBuffer({
        size: buffer.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Uint8Array(this.nodeBuffers.instances.getMappedRange()).set(new Uint8Array(buffer));
      this.nodeBuffers.instances.unmap();

      this.nodeBindGroup = gpu.createBindGroup({
        layout: this.nodeBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: cameraBuffer } },
          { binding: 1, resource: { buffer: globalsBuffer } },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.targets.node.texture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: this.targets.node.depthTexture.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      pass.setPipeline(this.nodePipeline);
      pass.setBindGroup(0, this.nodeBindGroup);
      pass.setVertexBuffer(0, this.cornerBuffer);
      pass.setVertexBuffer(1, this.nodeBuffers.instances);
      pass.draw(4, geometry.nodes.count, 0, 0);
      pass.end();
    }

    if (geometry.edges.count && encoded.edgeEncoded && config.edgeAttribute) {
      this.edgeBuffers.instances?.destroy?.();
      const edgeStrideBytes = 56;
      const edgeStrideFloats = edgeStrideBytes / 4;
      const buffer = new ArrayBuffer(geometry.edges.count * edgeStrideBytes);
      const floatView = new Float32Array(buffer);
      const uintView = new Uint32Array(buffer);
      for (let i = 0; i < geometry.edges.count; i += 1) {
        const segBase = i * 6;
        const widthBase = i * 2;
        const base = i * edgeStrideFloats;
        floatView[base] = geometry.edges.segments[segBase];
        floatView[base + 1] = geometry.edges.segments[segBase + 1];
        floatView[base + 2] = geometry.edges.segments[segBase + 2];
        floatView[base + 3] = geometry.edges.segments[segBase + 3];
        floatView[base + 4] = geometry.edges.segments[segBase + 4];
        floatView[base + 5] = geometry.edges.segments[segBase + 5];
        floatView[base + 6] = geometry.edges.widths[widthBase];
        floatView[base + 7] = geometry.edges.widths[widthBase + 1];
        floatView[base + 8] = geometry.edges.endpointSizes[widthBase];
        floatView[base + 9] = geometry.edges.endpointSizes[widthBase + 1];
        const encBase = base + 10;
        const srcBase = i * 4;
        uintView[encBase] = encoded.edgeEncoded[srcBase] ?? 0;
        uintView[encBase + 1] = encoded.edgeEncoded[srcBase + 1] ?? 0;
        uintView[encBase + 2] = encoded.edgeEncoded[srcBase + 2] ?? 0;
        uintView[encBase + 3] = encoded.edgeEncoded[srcBase + 3] ?? 0;
      }
      this.edgeBuffers.instances = gpu.createBuffer({
        size: buffer.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Uint8Array(this.edgeBuffers.instances.getMappedRange()).set(new Uint8Array(buffer));
      this.edgeBuffers.instances.unmap();

      this.edgeBindGroup = gpu.createBindGroup({
        layout: this.edgeBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: cameraBuffer } },
          { binding: 1, resource: { buffer: globalsBuffer } },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.targets.edge.texture.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: this.targets.edge.depthTexture.createView(),
          depthClearValue: 1,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      const useQuad = this.graphLayer.edgeRenderingMode === 'quad';
      pass.setPipeline(useQuad ? this.edgeQuadPipeline : this.edgePipeline);
      pass.setBindGroup(0, this.edgeBindGroup);
      if (useQuad) {
        pass.setVertexBuffer(0, this.edgeCornerBuffer);
        pass.setVertexBuffer(1, this.edgeBuffers.instances);
        pass.draw(4, geometry.edges.count, 0, 0);
      } else {
        pass.setVertexBuffer(0, this.edgeBuffers.instances);
        pass.draw(2, geometry.edges.count, 0, 0);
      }
      pass.end();
    }

    gpu.queue.submit([encoder.finish()]);
    cameraBuffer.destroy();
    globalsBuffer.destroy();
    return this.targets;
  }
}

export class AttributeTracker {
  constructor(renderer) {
    this.renderer = renderer;
    this.graphLayer = renderer?.graphLayer ?? null;
    this.nodeAttribute = null;
    this.edgeAttribute = null;
    this.options = { resolutionScale: 1, autoRender: true };
    this.webgl = null;
    this.webgpu = null;
    this.size = renderer?.size ?? null;
    this.lastTargets = null;
  }

  enable(nodeAttribute, edgeAttribute, options = {}) {
    this.nodeAttribute = nodeAttribute || null;
    this.edgeAttribute = edgeAttribute || null;
    if (options.resolutionScale != null) {
      const scale = Number(options.resolutionScale);
      this.options.resolutionScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    }
    this.options.trackDepth = options.trackDepth === true;
    this.options.autoRender = options.autoRender !== false;
    if (options.edgeRenderingMode) {
      this.graphLayer?.setEdgeRenderingMode?.(options.edgeRenderingMode);
    }
    return this;
  }

  disable(scope) {
    if (scope === 'node') {
      this.nodeAttribute = null;
    } else if (scope === 'edge') {
      this.edgeAttribute = null;
    } else {
      this.nodeAttribute = null;
      this.edgeAttribute = null;
    }
  }

  resize(size) {
    this.size = size;
    this.webgl?.resize?.(size, this.options.resolutionScale);
    this.webgpu?.resize?.(size, this.options.resolutionScale);
  }

  async render(frame, force = false) {
    if (!this.renderer?.device || !this.graphLayer || (!this.nodeAttribute && !this.edgeAttribute)) return null;
    if (!this.options.autoRender && !force) return null;
    const device = this.renderer.device;
    if (device.type === 'webgl2') {
      if (!this.webgl) {
        this.webgl = new WebGLAttributeRenderer(this.graphLayer);
        this.webgl.initialize(device);
      }
      this.lastTargets = this.webgl.render(frame, this.size ?? this.renderer.size, {
        nodeAttribute: this.nodeAttribute,
        edgeAttribute: this.edgeAttribute,
        resolutionScale: this.options.resolutionScale,
        trackDepth: this.options.trackDepth,
      });
    } else if (device.type === 'webgpu') {
      if (!this.webgpu) {
        this.webgpu = new WebGPUAttributeRenderer(this.graphLayer);
        this.webgpu.initialize(device);
      }
      this.lastTargets = this.webgpu.render(frame, this.size ?? this.renderer.size, {
        nodeAttribute: this.nodeAttribute,
        edgeAttribute: this.edgeAttribute,
        resolutionScale: this.options.resolutionScale,
        trackDepth: this.options.trackDepth,
      });
    }
    return this.lastTargets;
  }

  async pick(clientX, clientY) {
    if (!this.renderer?.device || !this.lastTargets) {
      return { node: -1, edge: -1 };
    }
    const size = this.size ?? this.renderer.size ?? { width: 1, height: 1, devicePixelRatio: 1 };
    const pixelRatio = size.devicePixelRatio ?? 1;
    const scale = this.options.resolutionScale ?? 1;
    const x = Math.floor(clientX * pixelRatio * scale);
    const yRaw = Math.floor(clientY * pixelRatio * scale);
    const targets = this.lastTargets;
    const results = { node: -1, edge: -1, nodeDepth: null, edgeDepth: null };
    const device = this.renderer.device;
    const readTarget = async (target, key) => {
      if (!target || !target.width || !target.height) return;
      const clampedX = Math.max(0, Math.min(x, target.width - 1));
      const y = device.type === 'webgl2'
        ? Math.max(0, target.height - 1 - yRaw)
        : yRaw;
      const clampedY = Math.max(0, Math.min(y, target.height - 1));
      const pixels = await device.readPixels(target, { x: clampedX, y: clampedY, width: 1, height: 1 });
      const useBgra = device.type === 'webgpu' && typeof device.format === 'string' && device.format.startsWith('bgra');
      const decoded = useBgra
        ? decodePacked(new Uint8Array([pixels[2], pixels[1], pixels[0], pixels[3]]), 0)
        : decodePacked(pixels, 0);
      results[key] = decoded;
      if (this.options.trackDepth && device.type === 'webgl2') {
        const depth = key === 'node'
          ? this.webgl?.readDepth?.(target, clampedX, clampedY)
          : this.webgl?.readDepth?.(target, clampedX, clampedY);
        results[`${key}Depth`] = depth;
      }
    };
    if (this.nodeAttribute) {
      await readTarget(targets.node, 'node');
    }
    if (this.edgeAttribute) {
      await readTarget(targets.edge, 'edge');
    }
    return results;
  }

  destroy() {
    this.webgl?.destroy?.();
    this.webgpu?.destroy?.();
    this.webgl = null;
    this.webgpu = null;
    this.lastTargets = null;
  }
}
