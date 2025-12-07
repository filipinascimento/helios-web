import {
  NODE_FRAGMENT_SOURCE,
  NODE_VERTEX_SOURCE,
  EDGE_FRAGMENT_SOURCE,
  EDGE_VERTEX_SOURCE,
  EDGE_QUAD_FRAGMENT_SOURCE,
  EDGE_QUAD_VERTEX_SOURCE,
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
    this.nodeVAO = null;
    this.nodeBuffers = {};
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.edgeBuffers = {};
    this.nodeQuadBuffer = null;
    this.edgeQuadBuffer = null;
    this.nodeCount = 0;
    this.edgeCount = 0;
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
    if (this.nodeQuadBuffer) gl.deleteBuffer(this.nodeQuadBuffer);
    if (this.edgeQuadBuffer) gl.deleteBuffer(this.edgeQuadBuffer);
    Object.values(this.nodeBuffers).forEach((buffer) => buffer && gl.deleteBuffer(buffer));
    Object.values(this.edgeBuffers).forEach((buffer) => buffer && gl.deleteBuffer(buffer));
  }

  setEdgeRenderingMode(mode) {
    super.setEdgeRenderingMode(mode);
  }

  initializeWebGL2() {
    const { gl } = this;
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
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);
    this.edgeBuffers.widths = this.edgeBuffers.widths || gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);
    this.edgeBuffers.endpointSizes = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 2, gl.FLOAT, false, 0, 0);
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
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(3, 1);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.colors);
    gl.enableVertexAttribArray(4);
    gl.vertexAttribPointer(4, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(4, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(5, 1);
    gl.bindVertexArray(null);
  }

  render(context, frame) {
    if (!context || context.type !== 'webgl2') return;
    const network = frame?.network;
    if (!network) return;
    const geometry = this.readDenseGraph(network);
    const { camera } = frame ?? {};
    const gl = context.gl;
    const cameraUniforms = this.getCameraUniforms(camera);
    if (!cameraUniforms) return;
    const is2D = cameraUniforms.mode === '2d';
    const zoom2D = is2D ? Math.max(1e-3, cameraUniforms.view?.[0] ?? 1) : 1;
    const edgeWidthFactor = is2D ? (zoom2D / EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL) : 1.0;

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
      const globalEdgeWidthBase = this.edgeWidthBase * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
      const globalEdgeWidthScale = this.edgeWidthScale * EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL * edgeWidthFactor;
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
    if (!edges || !edges.segments || !edges.colors || !edges.widths || !edges.endpointSizes) {
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

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.bufferData(gl.ARRAY_BUFFER, edges.widths, gl.DYNAMIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.bufferData(gl.ARRAY_BUFFER, edges.endpointSizes, gl.DYNAMIC_DRAW);
  }
}
