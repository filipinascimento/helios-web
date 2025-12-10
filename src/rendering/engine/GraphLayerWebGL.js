import {
  NODE_FRAGMENT_SOURCE,
  NODE_VERTEX_SOURCE,
  EDGE_FRAGMENT_SOURCE,
  EDGE_VERTEX_SOURCE,
  EDGE_QUAD_FRAGMENT_SOURCE,
  EDGE_QUAD_VERTEX_SOURCE,
  EDGE_WEIGHTED_FRAGMENT_SOURCE,
  EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE,
  EDGE_RESOLVE_VERTEX_SOURCE,
  EDGE_RESOLVE_FRAGMENT_SOURCE,
} from './shaders/graphWebGL.js';
import { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './GraphLayerCommon.js';
import { GraphLayer } from './GraphLayer.js';

export class GraphLayerWebGL extends GraphLayer {
  constructor(options = {}) {
    super(options);
    this.device = null;
    this.gl = null;

    this.nodeProgram = null;
    this.edgeProgram = null;
    this.edgeQuadProgram = null;
    this.edgeWeightedProgram = null;
    this.edgeWeightedQuadProgram = null;
    this.edgeResolveProgram = null;
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
    this.edgeUniformNodeSizeBase = null;
    this.edgeUniformNodeSizeScale = null;
    this.edgeUniformEndpointTrim = null;
    this.edgeQuadUniformViewProjection = null;
    this.edgeQuadUniformViewport = null;
    this.edgeQuadUniformOpacityBase = null;
    this.edgeQuadUniformOpacityScale = null;
    this.edgeQuadUniformWidthBase = null;
    this.edgeQuadUniformWidthScale = null;
    this.edgeQuadUniformNodeSizeBase = null;
    this.edgeQuadUniformNodeSizeScale = null;
    this.edgeQuadUniformEndpointTrim = null;
    this.edgeWeightedUniformViewProjection = null;
    this.edgeWeightedUniformOpacityBase = null;
    this.edgeWeightedUniformOpacityScale = null;
    this.edgeWeightedUniformWidthBase = null;
    this.edgeWeightedUniformWidthScale = null;
    this.edgeWeightedUniformNodeSizeBase = null;
    this.edgeWeightedUniformNodeSizeScale = null;
    this.edgeWeightedUniformEndpointTrim = null;
    this.edgeWeightedQuadUniformViewProjection = null;
    this.edgeWeightedQuadUniformViewport = null;
    this.edgeWeightedQuadUniformOpacityBase = null;
    this.edgeWeightedQuadUniformOpacityScale = null;
    this.edgeWeightedQuadUniformWidthBase = null;
    this.edgeWeightedQuadUniformWidthScale = null;
    this.edgeWeightedQuadUniformNodeSizeBase = null;
    this.edgeWeightedQuadUniformNodeSizeScale = null;
    this.edgeWeightedQuadUniformEndpointTrim = null;
    this.edgeResolveUniformColor = null;
    this.edgeResolveUniformWeight = null;
    this.edgeResolveVAO = null;
    this.edgeResolveBuffer = null;
    this.nodeVAO = null;
    this.nodeBuffers = {};
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.edgeBuffers = {};
    this.nodeQuadBuffer = null;
    this.edgeQuadBuffer = null;
    this.weightedFramebuffer = null;
    this.weightedColor = null;
    this.weightedWeight = null;
    this.weightedDepth = null;
    this.weightedSize = null;
    this.nodeCount = 0;
    this.edgeCount = 0;
    this.weightedSupported = null;
    this.warnedWeightedFallback = false;
  }

  initialize(device, size) {
    if (device?.type !== 'webgl2') {
      throw new Error('GraphLayerWebGL requires a WebGL2 device.');
    }
    super.initialize(device, size);
    this.device = device;
    this.gl = device.gl;
    this.initializeWebGL2();
    this.resize(size);
  }

  resize(size) {
    super.resize(size);
    // Matrices are updated per-frame from the camera.
  }

  destroy() {
    const gl = this.gl;
    if (!gl) return;
    if (this.nodeVAO) gl.deleteVertexArray(this.nodeVAO);
    if (this.edgeVAO) gl.deleteVertexArray(this.edgeVAO);
    if (this.edgeQuadVAO) gl.deleteVertexArray(this.edgeQuadVAO);
    if (this.nodeProgram) gl.deleteProgram(this.nodeProgram);
    if (this.edgeProgram) gl.deleteProgram(this.edgeProgram);
    if (this.edgeQuadProgram) gl.deleteProgram(this.edgeQuadProgram);
    if (this.edgeWeightedProgram) gl.deleteProgram(this.edgeWeightedProgram);
    if (this.edgeWeightedQuadProgram) gl.deleteProgram(this.edgeWeightedQuadProgram);
    if (this.edgeResolveProgram) gl.deleteProgram(this.edgeResolveProgram);
    if (this.nodeQuadBuffer) gl.deleteBuffer(this.nodeQuadBuffer);
    if (this.edgeQuadBuffer) gl.deleteBuffer(this.edgeQuadBuffer);
    if (this.edgeResolveVAO) gl.deleteVertexArray(this.edgeResolveVAO);
    if (this.edgeResolveBuffer) gl.deleteBuffer(this.edgeResolveBuffer);
    Object.values(this.nodeBuffers).forEach((buffer) => buffer && gl.deleteBuffer(buffer));
    Object.values(this.edgeBuffers).forEach((buffer) => buffer && gl.deleteBuffer(buffer));
    if (this.weightedFramebuffer) gl.deleteFramebuffer(this.weightedFramebuffer);
    if (this.weightedColor) gl.deleteTexture(this.weightedColor);
    if (this.weightedWeight) gl.deleteTexture(this.weightedWeight);
    if (this.weightedDepth) gl.deleteRenderbuffer(this.weightedDepth);
  }

  setEdgeRenderingMode(mode) {
    super.setEdgeRenderingMode(mode);
  }

  initializeWebGL2() {
    const { gl } = this;
    const extColorBufferFloat = gl.getExtension('EXT_color_buffer_float');
    const extColorBufferHalfFloat = gl.getExtension('EXT_color_buffer_half_float');
    const canDrawMultiple = (gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) ?? 1) >= 2;
    this.weightedSupported = Boolean(gl.drawBuffers && canDrawMultiple && (extColorBufferFloat || extColorBufferHalfFloat));
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
    this.edgeUniformNodeSizeBase = gl.getUniformLocation(this.edgeProgram, 'u_nodeSizeBase');
    this.edgeUniformNodeSizeScale = gl.getUniformLocation(this.edgeProgram, 'u_nodeSizeScale');
    this.edgeUniformEndpointTrim = gl.getUniformLocation(this.edgeProgram, 'u_edgeEndpointTrim');
    this.edgeQuadUniformViewProjection = gl.getUniformLocation(this.edgeQuadProgram, 'u_viewProjection');
    this.edgeQuadUniformViewport = gl.getUniformLocation(this.edgeQuadProgram, 'u_viewport');
    this.edgeQuadUniformOpacityBase = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeOpacityBase');
    this.edgeQuadUniformOpacityScale = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeOpacityScale');
    this.edgeQuadUniformWidthBase = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeWidthBase');
    this.edgeQuadUniformWidthScale = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeWidthScale');
    this.edgeQuadUniformNodeSizeBase = gl.getUniformLocation(this.edgeQuadProgram, 'u_nodeSizeBase');
    this.edgeQuadUniformNodeSizeScale = gl.getUniformLocation(this.edgeQuadProgram, 'u_nodeSizeScale');
    this.edgeQuadUniformEndpointTrim = gl.getUniformLocation(this.edgeQuadProgram, 'u_edgeEndpointTrim');

    this.nodeQuadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.nodeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.nodeBuffers.positions = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
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

    this.edgeBuffers.colors = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(3, 1);
    this.edgeBuffers.widths = this.edgeBuffers.widths || gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(4, 1);
    this.edgeBuffers.endpointSizes = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(5, 1);
    this.edgeBuffers.opacities = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.opacities);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(6, 1);
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

    this.edgeResolveBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeResolveBuffer);
    const resolveQuad = new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, resolveQuad, gl.STATIC_DRAW);

    this.edgeResolveVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeResolveVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeResolveBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

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

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(5, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(6);
    gl.vertexAttribPointer(6, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(6, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.opacities);
    gl.enableVertexAttribArray(7);
    gl.vertexAttribPointer(7, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(7, 1);
    gl.bindVertexArray(null);
  }

  render(context, frame) {
    if (!context || context.type !== 'webgl2') return;
    const network = frame?.network;
    if (!network) return;
    if (!this.updateDenseGraphBuffers(network)) return;
    const { camera } = frame ?? {};
    const gl = context.gl;
    const cameraUniforms = this.getCameraUniforms(camera);
    if (!cameraUniforms) return;

    let renderedWeighted = false;
    network.withBufferAccess(() => {
      const geometry = this.readDenseGraph(network);
      const is2D = cameraUniforms.mode === '2d';
      const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
      const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;
      const globalEdgeWidthBase = this.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
      const globalEdgeWidthScale = this.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
      const viewport = context.viewport;
      const viewportWidth = viewport ? viewport[2] : (gl.drawingBufferWidth || this.size?.width || 1);
      const viewportHeight = viewport ? viewport[3] : (gl.drawingBufferHeight || this.size?.height || 1);

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
        this.uploadEdgesWebGL2(geometry.edges);
      } else {
        this.edgeCount = 0;
      }
      if (geometry.nodes.count) {
        this.uploadNodesWebGL2(geometry.nodes);
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
          this.nodeOutlineColor?.[0] ?? 0,
          this.nodeOutlineColor?.[1] ?? 0,
          this.nodeOutlineColor?.[2] ?? 0,
          this.nodeOutlineColor?.[3] ?? 1,
        );
        gl.bindVertexArray(this.nodeVAO);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);
      };

      const drawEdges = () => {
        if (!this.edgeCount) return;
        gl.depthMask(false);
        const useQuads = this.edgeRenderingMode === 'quad';
        if (useQuads) {
          gl.useProgram(this.edgeQuadProgram);
          gl.uniformMatrix4fv(this.edgeQuadUniformViewProjection, false, cameraUniforms.viewProjection);
          if (this.edgeQuadUniformViewport) {
            gl.uniform2f(this.edgeQuadUniformViewport, viewportWidth, viewportHeight);
          }
          gl.uniform1f(this.edgeQuadUniformOpacityBase, this.edgeOpacityBase);
          gl.uniform1f(this.edgeQuadUniformOpacityScale, this.edgeOpacityScale);
          gl.uniform1f(this.edgeQuadUniformWidthBase, globalEdgeWidthBase);
          gl.uniform1f(this.edgeQuadUniformWidthScale, globalEdgeWidthScale);
          gl.uniform1f(this.edgeQuadUniformNodeSizeBase, this.nodeSizeBase);
          gl.uniform1f(this.edgeQuadUniformNodeSizeScale, this.nodeSizeScale);
          gl.uniform1f(this.edgeQuadUniformEndpointTrim, this.edgeEndpointTrim);
          gl.bindVertexArray(this.edgeQuadVAO);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.edgeCount);
        } else {
          gl.useProgram(this.edgeProgram);
          gl.uniformMatrix4fv(this.edgeUniformViewProjection, false, cameraUniforms.viewProjection);
          gl.uniform1f(this.edgeUniformOpacityBase, this.edgeOpacityBase);
          gl.uniform1f(this.edgeUniformOpacityScale, this.edgeOpacityScale);
          gl.uniform1f(this.edgeUniformWidthBase, globalEdgeWidthBase);
          gl.uniform1f(this.edgeUniformWidthScale, globalEdgeWidthScale);
          gl.uniform1f(this.edgeUniformNodeSizeBase, this.nodeSizeBase);
          gl.uniform1f(this.edgeUniformNodeSizeScale, this.nodeSizeScale);
          gl.uniform1f(this.edgeUniformEndpointTrim, this.edgeEndpointTrim);
          gl.bindVertexArray(this.edgeVAO);
          gl.drawArraysInstanced(gl.LINES, 0, 2, this.edgeCount);
        }
      };

      const weightedRequested = this.edgeTransparencyMode === 'weighted';
      const weightedReady = weightedRequested && geometry.edges.count > 0
        ? this.prepareWeightedWebGL(viewportWidth, viewportHeight)
        : false;

      if (weightedReady) {
        this.renderWeightedWebGL(context, {
          geometry,
          is2D,
          cameraUniforms,
          edgeWidthBase: globalEdgeWidthBase,
          edgeWidthScale: globalEdgeWidthScale,
          viewport,
        });
        renderedWeighted = true;
        return;
      }

      if (weightedRequested && geometry.edges.count && !this.warnedWeightedFallback) {
        console.warn('Weighted edge transparency is not available in WebGL2; falling back to alpha.');
        this.warnedWeightedFallback = true;
      }

      if (is2D) {
        drawEdges();
        drawNodes();
      } else {
        drawNodes();
        drawEdges();
      }

      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.DEPTH_TEST);
    });

    if (renderedWeighted) {
      return;
    }
  }

  uploadNodesWebGL2(nodes) {
    const count = nodes?.count ?? 0;
    if (!nodes || !nodes.positions || !nodes.colors || !nodes.sizes) {
      this.nodeCount = 0;
      return;
    }
    this.nodeCount = count;
    if (!count) return;

    const { gl } = this;
    gl.bindVertexArray(this.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
    gl.bufferData(gl.ARRAY_BUFFER, nodes.positions, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.colors);
    gl.bufferData(gl.ARRAY_BUFFER, nodes.colors, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
    gl.bufferData(gl.ARRAY_BUFFER, nodes.sizes, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
  }

  uploadEdgesWebGL2(edges) {
    const count = edges?.count ?? 0;
    if (!edges || !edges.segments || !edges.colors || !edges.opacities || !edges.widths || !edges.endpointSizes) {
      this.edgeCount = 0;
      return;
    }
    this.edgeCount = count;
    if (!count) return;

    const { gl } = this;
    gl.bindVertexArray(this.edgeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.bufferData(gl.ARRAY_BUFFER, edges.segments, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.bufferData(gl.ARRAY_BUFFER, edges.colors, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.opacities);
    gl.bufferData(gl.ARRAY_BUFFER, edges.opacities, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.bufferData(gl.ARRAY_BUFFER, edges.widths, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.bufferData(gl.ARRAY_BUFFER, edges.endpointSizes, gl.DYNAMIC_DRAW);
  }

  ensureWeightedPrograms() {
    const gl = this.gl;
    if (!gl || !this.weightedSupported) return false;
    if (!this.edgeWeightedProgram) {
      this.edgeWeightedProgram = this.device.createProgram(EDGE_VERTEX_SOURCE, EDGE_WEIGHTED_FRAGMENT_SOURCE);
      this.edgeWeightedUniformViewProjection = gl.getUniformLocation(this.edgeWeightedProgram, 'u_viewProjection');
      this.edgeWeightedUniformOpacityBase = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeOpacityBase');
      this.edgeWeightedUniformOpacityScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeOpacityScale');
      this.edgeWeightedUniformWidthBase = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeWidthBase');
      this.edgeWeightedUniformWidthScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeWidthScale');
      this.edgeWeightedUniformNodeSizeBase = gl.getUniformLocation(this.edgeWeightedProgram, 'u_nodeSizeBase');
      this.edgeWeightedUniformNodeSizeScale = gl.getUniformLocation(this.edgeWeightedProgram, 'u_nodeSizeScale');
      this.edgeWeightedUniformEndpointTrim = gl.getUniformLocation(this.edgeWeightedProgram, 'u_edgeEndpointTrim');
    }

    if (!this.edgeWeightedQuadProgram) {
      this.edgeWeightedQuadProgram = this.device.createProgram(
        EDGE_QUAD_VERTEX_SOURCE,
        EDGE_WEIGHTED_QUAD_FRAGMENT_SOURCE,
      );
      this.edgeWeightedQuadUniformViewProjection = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_viewProjection');
      this.edgeWeightedQuadUniformViewport = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_viewport');
      this.edgeWeightedQuadUniformOpacityBase = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeOpacityBase');
      this.edgeWeightedQuadUniformOpacityScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeOpacityScale');
      this.edgeWeightedQuadUniformWidthBase = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeWidthBase');
      this.edgeWeightedQuadUniformWidthScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeWidthScale');
      this.edgeWeightedQuadUniformNodeSizeBase = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_nodeSizeBase');
      this.edgeWeightedQuadUniformNodeSizeScale = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_nodeSizeScale');
      this.edgeWeightedQuadUniformEndpointTrim = gl.getUniformLocation(this.edgeWeightedQuadProgram, 'u_edgeEndpointTrim');
    }

    if (!this.edgeResolveProgram) {
      this.edgeResolveProgram = this.device.createProgram(EDGE_RESOLVE_VERTEX_SOURCE, EDGE_RESOLVE_FRAGMENT_SOURCE);
      this.edgeResolveUniformColor = gl.getUniformLocation(this.edgeResolveProgram, 'u_colorAccum');
      this.edgeResolveUniformWeight = gl.getUniformLocation(this.edgeResolveProgram, 'u_weightAccum');
    }

    return Boolean(this.edgeWeightedProgram && this.edgeWeightedQuadProgram && this.edgeResolveProgram);
  }

  destroyWeightedTargets() {
    const gl = this.gl;
    if (!gl) return;
    if (this.weightedFramebuffer) gl.deleteFramebuffer(this.weightedFramebuffer);
    if (this.weightedColor) gl.deleteTexture(this.weightedColor);
    if (this.weightedWeight) gl.deleteTexture(this.weightedWeight);
    if (this.weightedDepth) gl.deleteRenderbuffer(this.weightedDepth);
    this.weightedFramebuffer = null;
    this.weightedColor = null;
    this.weightedWeight = null;
    this.weightedDepth = null;
    this.weightedSize = null;
  }

  ensureWeightedTargets(width, height) {
    if (!this.weightedSupported) return false;
    const gl = this.gl;
    if (!gl) return false;
    const targetWidth = Math.max(1, Math.floor(width));
    const targetHeight = Math.max(1, Math.floor(height));
    if (this.weightedSize && this.weightedSize.width === targetWidth && this.weightedSize.height === targetHeight) {
      return true;
    }

    this.destroyWeightedTargets();

    const framebuffer = gl.createFramebuffer();
    const color = gl.createTexture();
    const weight = gl.createTexture();
    const depth = gl.createRenderbuffer();

    gl.bindTexture(gl.TEXTURE_2D, color);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, targetWidth, targetHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);

    gl.bindTexture(gl.TEXTURE_2D, weight);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, targetWidth, targetHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);

    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, targetWidth, targetHeight);

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, weight, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.warn('Weighted transparency framebuffer is incomplete, falling back to alpha.', status);
      this.destroyWeightedTargets();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return false;
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.weightedFramebuffer = framebuffer;
    this.weightedColor = color;
    this.weightedWeight = weight;
    this.weightedDepth = depth;
    this.weightedSize = { width: targetWidth, height: targetHeight };
    return true;
  }

  prepareWeightedWebGL(width, height) {
    return this.ensureWeightedPrograms() && this.ensureWeightedTargets(width, height);
  }

  renderWeightedWebGL(context, {
    geometry,
    is2D,
    cameraUniforms,
    edgeWidthBase,
    edgeWidthScale,
    viewport,
  }) {
    const gl = this.gl;
    if (!gl || !this.weightedFramebuffer) return;
    const mainFramebuffer = context.target?.handle ?? null;
    const mainDrawBuffers = mainFramebuffer ? [gl.COLOR_ATTACHMENT0] : [gl.BACK];
    const applyViewport = () => {
      if (viewport) {
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      } else {
        gl.viewport(0, 0, this.weightedSize?.width ?? gl.drawingBufferWidth, this.weightedSize?.height ?? gl.drawingBufferHeight);
      }
    };

    const drawNodesAlpha = () => {
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
        this.nodeOutlineColor?.[0] ?? 0,
        this.nodeOutlineColor?.[1] ?? 0,
        this.nodeOutlineColor?.[2] ?? 0,
        this.nodeOutlineColor?.[3] ?? 1,
      );
      gl.bindVertexArray(this.nodeVAO);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.nodeCount);
    };

    const globalEdgeWidthBase = edgeWidthBase;
    const globalEdgeWidthScale = edgeWidthScale;

    // Draw nodes to the main framebuffer first in 3D to populate color and depth.
    if (!is2D && this.nodeCount) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
      applyViewport();
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawNodesAlpha();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.weightedFramebuffer);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    applyViewport();
    gl.clearBufferfv(gl.COLOR, 0, new Float32Array([0, 0, 0, 0]));
    gl.clearBufferfv(gl.COLOR, 1, new Float32Array([0, 0, 0, 0]));
    gl.clearBufferfv(gl.DEPTH, 0, new Float32Array([1]));

    if (!is2D && this.nodeCount) {
      gl.colorMask(false, false, false, false);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      drawNodesAlpha();
      gl.colorMask(true, true, true, true);
    }

    if (geometry.edges.count) {
      const useQuads = this.edgeRenderingMode === 'quad';
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      if (is2D) {
        gl.disable(gl.DEPTH_TEST);
      } else {
        gl.enable(gl.DEPTH_TEST);
      }
      gl.depthMask(false);

      if (useQuads) {
        gl.useProgram(this.edgeWeightedQuadProgram);
        gl.uniformMatrix4fv(this.edgeWeightedQuadUniformViewProjection, false, cameraUniforms.viewProjection);
        if (this.edgeWeightedQuadUniformViewport) {
          const vw = viewport ? viewport[2] : (this.weightedSize?.width ?? 1);
          const vh = viewport ? viewport[3] : (this.weightedSize?.height ?? 1);
          gl.uniform2f(this.edgeWeightedQuadUniformViewport, vw, vh);
        }
        gl.uniform1f(this.edgeWeightedQuadUniformOpacityBase, this.edgeOpacityBase);
        gl.uniform1f(this.edgeWeightedQuadUniformOpacityScale, this.edgeOpacityScale);
        gl.uniform1f(this.edgeWeightedQuadUniformWidthBase, globalEdgeWidthBase);
        gl.uniform1f(this.edgeWeightedQuadUniformWidthScale, globalEdgeWidthScale);
        gl.uniform1f(this.edgeWeightedQuadUniformNodeSizeBase, this.nodeSizeBase);
        gl.uniform1f(this.edgeWeightedQuadUniformNodeSizeScale, this.nodeSizeScale);
        gl.uniform1f(this.edgeWeightedQuadUniformEndpointTrim, this.edgeEndpointTrim);
        gl.bindVertexArray(this.edgeQuadVAO);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.edgeCount);
      } else {
        gl.useProgram(this.edgeWeightedProgram);
        gl.uniformMatrix4fv(this.edgeWeightedUniformViewProjection, false, cameraUniforms.viewProjection);
        gl.uniform1f(this.edgeWeightedUniformOpacityBase, this.edgeOpacityBase);
        gl.uniform1f(this.edgeWeightedUniformOpacityScale, this.edgeOpacityScale);
        gl.uniform1f(this.edgeWeightedUniformWidthBase, globalEdgeWidthBase);
        gl.uniform1f(this.edgeWeightedUniformWidthScale, globalEdgeWidthScale);
        gl.uniform1f(this.edgeWeightedUniformNodeSizeBase, this.nodeSizeBase);
        gl.uniform1f(this.edgeWeightedUniformNodeSizeScale, this.nodeSizeScale);
        gl.uniform1f(this.edgeWeightedUniformEndpointTrim, this.edgeEndpointTrim);
        gl.bindVertexArray(this.edgeVAO);
        gl.drawArraysInstanced(gl.LINES, 0, 2, this.edgeCount);
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
    gl.drawBuffers(mainDrawBuffers);
    applyViewport();
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.edgeResolveProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.weightedColor);
    gl.uniform1i(this.edgeResolveUniformColor, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.weightedWeight);
    gl.uniform1i(this.edgeResolveUniformWeight, 1);
    gl.bindVertexArray(this.edgeResolveVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if (is2D && this.nodeCount) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(true);
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, mainFramebuffer);
      applyViewport();
      drawNodesAlpha();
    }

    gl.bindVertexArray(null);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthFunc(gl.LEQUAL);
  }
}
