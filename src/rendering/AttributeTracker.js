import { EDGE_WIDTH_SCALE_MULTIPLIER_GLOBAL } from './engine/GraphLayerCommon.js';
import { RenderTargetPool } from './engine/RenderTargetPool.js';
import { FrameGraphRunner } from './engine/framegraph/FrameGraphRunner.js';
import { bumpCounter } from '../utilities/counters.js';
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
import { VISUAL_ATTRIBUTE_NAMES } from '../pipeline/constants.js';

const {
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_WIDTH_ATTRIBUTE,
  EDGE_ENDPOINTS_SIZE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

const PACK_DEPTH_GLSL = /* glsl */ `
vec4 packDepthToRGBA(const in float v) {
  const vec4 bitShift = vec4(256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0);
  const vec4 bitMask = vec4(0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0);
  vec4 res = fract(v * bitShift);
  res -= res.xxyz * bitMask;
  return res;
}`;

const NODE_DEPTH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
${PACK_DEPTH_GLSL}

in vec2 v_local;
in vec3 v_centerWorld;
in vec3 v_rightWorld;
in vec3 v_upWorld;
in vec3 v_viewDir;
in float v_radius;

uniform mat4 u_viewProjection;
uniform bool u_is2D;

out vec4 fragColor;

void main() {
  float dist = length(v_local);
  if (dist > 1.0) {
    discard;
  }
  if (!u_is2D) {
    float radius = v_radius;
    float xyLenSq = dot(v_local * radius, v_local * radius);
    float zOffset = sqrt(max(radius * radius - xyLenSq, 0.0));
    vec3 worldPos = v_centerWorld
      + (v_rightWorld * v_local.x + v_upWorld * v_local.y) * radius
      + normalize(v_viewDir) * zOffset;
    vec4 clip = u_viewProjection * vec4(worldPos, 1.0);
    float depth = clip.z / clip.w;
    gl_FragDepth = depth * 0.5 + 0.5;
  }
  fragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

const EDGE_DEPTH_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
${PACK_DEPTH_GLSL}
out vec4 fragColor;
void main() {
  fragColor = packDepthToRGBA(gl_FragCoord.z);
}`;

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

function unpackDepthRGBA(bytes, offset = 0) {
  const inv255 = 1 / 255;
  const r = (bytes[offset] ?? 0) * inv255;
  const g = (bytes[offset + 1] ?? 0) * inv255;
  const b = (bytes[offset + 2] ?? 0) * inv255;
  const a = (bytes[offset + 3] ?? 0) * inv255;
  // Inverse of packDepthToRGBA bit packing.
  return (r * (1 / (256 * 256 * 256))) + (g * (1 / (256 * 256))) + (b * (1 / 256)) + a;
}

function getEncodedName(scope, sourceName) {
  return `_helios_encoded_${scope}_${sourceName || 'index'}`;
}

function getEncodedDesc(network, scope, attrName) {
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
  return desc ?? null;
}

function ensureEncodedDesc(network, scope, attrName, count) {
  if (!attrName || !count) return null;
  const encodedDesc = getEncodedDesc(network, scope, attrName);
  if (!encodedDesc?.view) {
    throw new Error(`Encoded ${scope} attribute "${attrName}" not available; expected dense color encoding from helios-network.`);
  }
  return encodedDesc;
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
  constructor(graphLayer, pool, runner) {
    this.graphLayer = graphLayer;
    this.pool = pool;
    this.runner = runner; // Added runner parameter
    this.gl = null;
    this.device = null;
    this.trackDepth = false;
    this.depthBits = 16;
    this.depthReadSupported = true;
    this.depthTargets = { node: null, edge: null };
    this.nodeProgram = null;
    this.nodeDepthProgram = null;
    this.edgeProgram = null;
    this.edgeDepthProgram = null;
    this.edgeQuadProgram = null;
    this.edgeQuadDepthProgram = null;
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
    const cache = device.resourceCache?.webgl;
    const getProgram = (key, vert, frag) => {
      if (!cache) return device.createProgram(vert, frag);
      return cache.getOrCreateProgram(`attr:webgl:program:${key}`, () => ({ program: device.createProgram(vert, frag) }))?.program;
    };
    this.nodeProgram = getProgram('node', NODE_ATTRIBUTE_VERTEX, NODE_ATTRIBUTE_FRAGMENT);
    this.nodeDepthProgram = getProgram('nodeDepth', NODE_ATTRIBUTE_VERTEX, NODE_DEPTH_FRAGMENT);
    this.edgeProgram = getProgram('edge', EDGE_ATTRIBUTE_VERTEX, EDGE_ATTRIBUTE_FRAGMENT);
    this.edgeDepthProgram = getProgram('edgeDepth', EDGE_ATTRIBUTE_VERTEX, EDGE_DEPTH_FRAGMENT);
    this.edgeQuadProgram = getProgram('edgeQuad', EDGE_ATTRIBUTE_QUAD_VERTEX, EDGE_ATTRIBUTE_QUAD_FRAGMENT);
    this.edgeQuadDepthProgram = getProgram('edgeQuadDepth', EDGE_ATTRIBUTE_QUAD_VERTEX, EDGE_DEPTH_FRAGMENT);

    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    const nodeQuadBuffer = gl.createBuffer();
    this.nodeQuadBuffer = nodeQuadBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeQuadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    this.nodeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.nodeVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, nodeQuadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const shared = device.resourceCache?.webgl;
    this.nodeBuffers.positions = shared?.ensureBuffer(gl, 'dense:node:positions') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    this.nodeBuffers.sizes = shared?.ensureBuffer(gl, 'dense:node:sizes') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(2, 1);

    // Encoded buffers are keyed per attribute name at render time; initialize with a stable fallback.
    this.nodeBuffers.encoded = shared?.ensureBuffer(gl, 'attr:webgl:node:encoded:fallback') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.encoded);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, 4, 0);
    gl.vertexAttribDivisor(3, 1);
    gl.bindVertexArray(null);

    this.edgeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.edgeVAO);
    this.edgeBuffers.segments = shared?.ensureBuffer(gl, 'dense:edge:segments') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.vertexAttribDivisor(1, 1);

    this.edgeBuffers.widths = shared?.ensureBuffer(gl, 'dense:edge:widths') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(2, 1);

    this.edgeBuffers.endpointSizes = shared?.ensureBuffer(gl, 'dense:edge:endpointSizes') ?? gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 2, gl.FLOAT, false, 8, 0);
    gl.vertexAttribDivisor(3, 1);

    // Encoded buffers are keyed per attribute name at render time; initialize with a stable fallback.
    this.edgeBuffers.encoded = shared?.ensureBuffer(gl, 'attr:webgl:edge:encoded:fallback') ?? gl.createBuffer();
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
    if (this.edgeQuadBuffer) gl.deleteBuffer(this.edgeQuadBuffer);
    if (this.nodeQuadBuffer) gl.deleteBuffer(this.nodeQuadBuffer);
    // Shared buffers/programs are owned by the device-level resource cache.
    // Do not delete them here.
    this.nodeVAO = null;
    this.edgeVAO = null;
    this.edgeQuadVAO = null;
    this.targets = { node: null, edge: null };
    this.depthTargets = { node: null, edge: null };
  }

  resize(size, scale, trackDepth) {
    if (!size) return;
    this.trackDepth = trackDepth === true;
    const pixelRatio = size.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.floor((size.width ?? 1) * pixelRatio * scale));
    const height = Math.max(1, Math.floor((size.height ?? 1) * pixelRatio * scale));
    this.size = { width, height };
    const tagNode = this.trackDepth ? 'attr-node-depth-cap' : 'attr-node';
    const tagEdge = this.trackDepth ? 'attr-edge-depth-cap' : 'attr-edge';
    this.targets.node = this.pool.get(this.device, tagNode, width, height, { depth: true, filter: 'nearest' });
    this.targets.edge = this.pool.get(this.device, tagEdge, width, height, { depth: true, filter: 'nearest' });
    this.depthTargets.node = this.trackDepth
      ? this.pool.get(this.device, 'attr-node-depth-color', width, height, { depth: true, filter: 'nearest' })
      : null;
    this.depthTargets.edge = this.trackDepth
      ? this.pool.get(this.device, 'attr-edge-depth-color', width, height, { depth: true, filter: 'nearest' })
      : null;
    this.depthBits = this.trackDepth ? 16 : this.depthBits;
  }

  encodeAttributes(network, geometry, config) {
    const nodeCount = geometry?.nodes?.count ?? 0;
    const edgeCount = geometry?.edges?.count ?? 0;
    const nodeEncoded = ensureEncodedDesc(network, 'node', config.nodeAttribute, nodeCount);
    const edgeEncoded = ensureEncodedDesc(network, 'edge', config.edgeAttribute, edgeCount);
    return { nodeEncoded, edgeEncoded };
  }

  render(frame, size, config) {
    if (!this.gl || !frame?.network) return null;
    const network = frame.network;
    const camera = frame.camera;
    const scale = config.resolutionScale ?? 1;
    this.resize(size, scale, config.trackDepth);
    const cameraUniforms = this.graphLayer.getCameraUniforms(camera);
    if (!cameraUniforms) return null;

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

    ensureEncodedReady(network, 'node', config.nodeAttribute);
    ensureEncodedReady(network, 'edge', config.edgeAttribute);

    const denseRequests = [];
    if (config.nodeAttribute || config.edgeAttribute) {
      denseRequests.push(['node', NODE_POSITION_ATTRIBUTE], ['node', NODE_SIZE_ATTRIBUTE]);
    }
    if (config.edgeAttribute) {
      denseRequests.push(
        ['edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE],
        ['edge', EDGE_WIDTH_ATTRIBUTE],
        ['edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE],
      );
    }

    return this.graphLayer.withDenseGraph(network, (geometry) => {
      if (!geometry) return null;
      const encoded = this.encodeAttributes(network, geometry, config);
      const passes = [];
      const cache = this.device?.resourceCache?.webgl;

      if (geometry.nodes.count && encoded.nodeEncoded && config.nodeAttribute) {
        passes.push(() => {
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
        if (cache) {
          cache.uploadArrayBuffer(gl, 'dense:node:positions', geometry.nodes.positions, {
            version: geometry.nodes.versions?.positions ?? 0,
            topologyVersion: geometry.nodes.versions?.topology ?? 0,
            count: geometry.nodes.count,
            trackViewIdentity: true,
          });
          cache.uploadArrayBuffer(gl, 'dense:node:sizes', geometry.nodes.sizes, {
            version: geometry.nodes.versions?.sizes ?? 0,
            topologyVersion: geometry.nodes.versions?.topology ?? 0,
            count: geometry.nodes.count,
            trackViewIdentity: true,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.positions, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.sizes, gl.DYNAMIC_DRAW);
        }
        // Encoded buffer can vary by attribute name; bind the correct shared buffer into the VAO.
        const nodeEncodedKey = `attr:webgl:node:encoded:${config.nodeAttribute || 'index'}`;
        const nodeEncodedBuffer = cache?.ensureBuffer(gl, nodeEncodedKey);
        if (cache && nodeEncodedBuffer) {
          gl.bindVertexArray(this.nodeVAO);
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeEncodedBuffer);
          gl.enableVertexAttribArray(3);
          gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, 4, 0);
          gl.vertexAttribDivisor(3, 1);
        }
        if (cache) {
          cache.uploadArrayBuffer(gl, nodeEncodedKey, encoded.nodeEncoded.view, {
            version: encoded.nodeEncoded.version ?? 0,
            count: geometry.nodes.count,
            // Do not rely on view identity alone: WASM may reuse the same memory region.
            trackViewIdentity: false,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.encoded);
          gl.bufferData(gl.ARRAY_BUFFER, encoded.nodeEncoded.view, gl.DYNAMIC_DRAW);
        }
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.nodes.count);
        });
      }

      if (geometry.edges.count && encoded.edgeEncoded && config.edgeAttribute) {
        // Depth test/write for edges so overlaps are correct in attribute targets.
        passes.push(() => {
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets.edge?.handle ?? null);
        gl.viewport(0, 0, this.size.width, this.size.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // First draw nodes into the edge target with zero-encoded color so they occlude edges.
        if (geometry.nodes.count) {
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
          if (cache) {
            cache.uploadArrayBuffer(gl, 'dense:node:positions', geometry.nodes.positions, {
              version: geometry.nodes.versions?.positions ?? 0,
              topologyVersion: geometry.nodes.versions?.topology ?? 0,
              count: geometry.nodes.count,
              trackViewIdentity: true,
            });
            cache.uploadArrayBuffer(gl, 'dense:node:sizes', geometry.nodes.sizes, {
              version: geometry.nodes.versions?.sizes ?? 0,
              topologyVersion: geometry.nodes.versions?.topology ?? 0,
              count: geometry.nodes.count,
              trackViewIdentity: true,
            });
          } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
            gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.positions, gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
            gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.sizes, gl.DYNAMIC_DRAW);
          }
          const zeroEncoded = (this._zeroNodeEncoded?.length === geometry.nodes.count * 4)
            ? this._zeroNodeEncoded
            : new Uint8Array(geometry.nodes.count * 4);
          zeroEncoded.fill(0);
          this._zeroNodeEncoded = zeroEncoded;
          const zeroKey = 'attr:webgl:node:encoded:__zero';
          const zeroBuffer = cache?.ensureBuffer(gl, zeroKey);
          if (cache && zeroBuffer) {
            gl.bindVertexArray(this.nodeVAO);
            gl.bindBuffer(gl.ARRAY_BUFFER, zeroBuffer);
            gl.enableVertexAttribArray(3);
            gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, 4, 0);
            gl.vertexAttribDivisor(3, 1);
          }
          if (cache) {
            cache.uploadArrayBuffer(gl, zeroKey, zeroEncoded, {
              version: geometry.nodes.versions?.topology ?? 0,
              count: geometry.nodes.count,
              trackViewIdentity: false,
            });
          } else {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.encoded);
            gl.bufferData(gl.ARRAY_BUFFER, zeroEncoded, gl.DYNAMIC_DRAW);
          }
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.nodes.count);
        }
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
        if (cache) {
          cache.uploadArrayBuffer(gl, 'dense:edge:segments', geometry.edges.segments, {
            version: geometry.edges.versions?.segments ?? 0,
            topologyVersion: geometry.edges.versions?.topology ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: true,
          });
          cache.uploadArrayBuffer(gl, 'dense:edge:widths', geometry.edges.widths, {
            version: geometry.edges.versions?.widths ?? 0,
            topologyVersion: geometry.edges.versions?.topology ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: true,
          });
          cache.uploadArrayBuffer(gl, 'dense:edge:endpointSizes', geometry.edges.endpointSizes, {
            version: geometry.edges.versions?.endpointSizes ?? 0,
            topologyVersion: geometry.edges.versions?.topology ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: true,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.segments, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.widths, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.endpointSizes, gl.DYNAMIC_DRAW);
        }
        const edgeEncodedKey = `attr:webgl:edge:encoded:${config.edgeAttribute || 'index'}`;
        const edgeEncodedBuffer = cache?.ensureBuffer(gl, edgeEncodedKey);
        if (cache && edgeEncodedBuffer) {
          const vao = useQuads ? this.edgeQuadVAO : this.edgeVAO;
          const loc = useQuads ? 5 : 4;
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, edgeEncodedBuffer);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribIPointer(loc, 4, gl.UNSIGNED_BYTE, 4, 0);
          gl.vertexAttribDivisor(loc, 1);
        }
        if (cache) {
          cache.uploadArrayBuffer(gl, edgeEncodedKey, encoded.edgeEncoded.view, {
            version: encoded.edgeEncoded.version ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: false,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
          gl.bufferData(gl.ARRAY_BUFFER, encoded.edgeEncoded.view, gl.DYNAMIC_DRAW);
        }
        if (useQuads) {
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.edges.count);
        } else {
          gl.drawArraysInstanced(gl.LINES, 0, 2, geometry.edges.count);
        }
      });
    }

    // Optional depth-to-color fallback: render packed depth into a color target for robust readback.
      const renderDepthColor = (target, isNode, useQuads) => {
      if (!target) return;
      const program = isNode
        ? this.nodeDepthProgram
        : (useQuads ? this.edgeQuadDepthProgram : this.edgeDepthProgram);
      if (!program) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.handle);
      gl.viewport(0, 0, this.size.width, this.size.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewProjection'), false, cameraUniforms.viewProjection);
      gl.uniform1i(gl.getUniformLocation(program, 'u_is2D'), is2D ? 1 : 0);
      if (isNode) {
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_view'), false, cameraUniforms.view);
        gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraPosition'), cameraUniforms.position);
        gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraUp'), cameraUniforms.up);
        gl.uniform3fv(gl.getUniformLocation(program, 'u_cameraRight'), cameraUniforms.right);
        gl.uniform1f(gl.getUniformLocation(program, 'u_nodeSizeBase'), this.graphLayer.nodeSizeBase);
        gl.uniform1f(gl.getUniformLocation(program, 'u_nodeSizeScale'), this.graphLayer.nodeSizeScale);
        gl.uniform1f(gl.getUniformLocation(program, 'u_outlineWidthBase'), this.graphLayer.nodeOutlineWidthBase);
        gl.uniform1f(gl.getUniformLocation(program, 'u_outlineWidthScale'), this.graphLayer.nodeOutlineWidthScale);
        gl.bindVertexArray(this.nodeVAO);
        if (cache) {
          cache.uploadArrayBuffer(gl, 'dense:node:positions', geometry.nodes.positions, {
            version: geometry.nodes.versions?.positions ?? 0,
            topologyVersion: geometry.nodes.versions?.topology ?? 0,
            count: geometry.nodes.count,
            trackViewIdentity: true,
          });
          cache.uploadArrayBuffer(gl, 'dense:node:sizes', geometry.nodes.sizes, {
            version: geometry.nodes.versions?.sizes ?? 0,
            topologyVersion: geometry.nodes.versions?.topology ?? 0,
            count: geometry.nodes.count,
            trackViewIdentity: true,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.positions);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.positions, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.sizes);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.nodes.sizes, gl.DYNAMIC_DRAW);
        }
        const nodeEncodedKey = `attr:webgl:node:encoded:${config.nodeAttribute || 'index'}`;
        const nodeEncodedBuffer = cache?.ensureBuffer(gl, nodeEncodedKey);
        if (cache && nodeEncodedBuffer) {
          gl.bindVertexArray(this.nodeVAO);
          gl.bindBuffer(gl.ARRAY_BUFFER, nodeEncodedBuffer);
          gl.enableVertexAttribArray(3);
          gl.vertexAttribIPointer(3, 4, gl.UNSIGNED_BYTE, 4, 0);
          gl.vertexAttribDivisor(3, 1);
        }
        if (cache) {
          cache.uploadArrayBuffer(gl, nodeEncodedKey, encoded.nodeEncoded.view, {
            version: encoded.nodeEncoded.version ?? 0,
            count: geometry.nodes.count,
            trackViewIdentity: false,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.nodeBuffers.encoded);
          gl.bufferData(gl.ARRAY_BUFFER, encoded.nodeEncoded.view, gl.DYNAMIC_DRAW);
        }
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.nodes.count);
      } else {
        const widthBaseLocation = 'u_edgeWidthBase';
        const widthScaleLocation = 'u_edgeWidthScale';
        const nodeSizeBaseLocation = 'u_nodeSizeBase';
        const nodeSizeScaleLocation = 'u_nodeSizeScale';
        const endpointLocation = 'u_edgeEndpointTrim';
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
        if (cache) {
          cache.uploadArrayBuffer(gl, 'dense:edge:segments', geometry.edges.segments, {
            version: geometry.edges.versions?.segments ?? 0,
            topologyVersion: geometry.edges.versions?.topology ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: true,
          });
          cache.uploadArrayBuffer(gl, 'dense:edge:widths', geometry.edges.widths, {
            version: geometry.edges.versions?.widths ?? 0,
            topologyVersion: geometry.edges.versions?.topology ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: true,
          });
          cache.uploadArrayBuffer(gl, 'dense:edge:endpointSizes', geometry.edges.endpointSizes, {
            version: geometry.edges.versions?.endpointSizes ?? 0,
            topologyVersion: geometry.edges.versions?.topology ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: true,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.segments);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.segments, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.widths);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.widths, gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.endpointSizes);
          gl.bufferData(gl.ARRAY_BUFFER, geometry.edges.endpointSizes, gl.DYNAMIC_DRAW);
        }
        const edgeEncodedKey = `attr:webgl:edge:encoded:${config.edgeAttribute || 'index'}`;
        const edgeEncodedBuffer = cache?.ensureBuffer(gl, edgeEncodedKey);
        if (cache && edgeEncodedBuffer) {
          const vao = useQuads ? this.edgeQuadVAO : this.edgeVAO;
          const loc = useQuads ? 5 : 4;
          gl.bindVertexArray(vao);
          gl.bindBuffer(gl.ARRAY_BUFFER, edgeEncodedBuffer);
          gl.enableVertexAttribArray(loc);
          gl.vertexAttribIPointer(loc, 4, gl.UNSIGNED_BYTE, 4, 0);
          gl.vertexAttribDivisor(loc, 1);
        }
        if (cache) {
          cache.uploadArrayBuffer(gl, edgeEncodedKey, encoded.edgeEncoded.view, {
            version: encoded.edgeEncoded.version ?? 0,
            count: geometry.edges.count,
            trackViewIdentity: false,
          });
        } else {
          gl.bindBuffer(gl.ARRAY_BUFFER, this.edgeBuffers.encoded);
          gl.bufferData(gl.ARRAY_BUFFER, encoded.edgeEncoded.view, gl.DYNAMIC_DRAW);
        }
        if (useQuads) {
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, geometry.edges.count);
        } else {
          gl.drawArraysInstanced(gl.LINES, 0, 2, geometry.edges.count);
        }
      }
    };

      if (config.trackDepth) {
        if (geometry.nodes.count && this.depthTargets.node) {
          passes.push(() => renderDepthColor(this.depthTargets.node, true, false));
        }
        if (geometry.edges.count && this.depthTargets.edge) {
          const useQuads = this.graphLayer.edgeRenderingMode === 'quad';
          passes.push(() => {
            // Draw occluding nodes into the edge depth-color target before edges.
            if (geometry.nodes.count && this.depthTargets.edge) {
              renderDepthColor(this.depthTargets.edge, true, false);
            }
            renderDepthColor(this.depthTargets.edge, false, useQuads);
          });
        }
      }

      passes.push(() => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindVertexArray(null);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
      });

      this.runner?.run?.(passes, { gl, device: this.device });
      return { ...this.targets, depthTargets: this.depthTargets };
    }, denseRequests);
  }

  readDepth(target, x, y) {
    if (!this.trackDepth || !this.depthReadSupported) return null;
    if (!target?.depthTexture && !target?.depthRenderbuffer) return null;
    const { gl } = this;
    const type = target.depthType
      ?? (target.depthFormat === gl.DEPTH_COMPONENT32F ? gl.FLOAT : gl.UNSIGNED_SHORT);
    const pixel = type === gl.UNSIGNED_INT
      ? new Uint32Array(1)
      : (type === gl.UNSIGNED_SHORT ? new Uint16Array(1) : new Float32Array(1));
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
      const canTryFloat = target.depthFormat === gl.DEPTH_COMPONENT32F && type !== gl.FLOAT;
      if (canTryFloat) {
        return this.readDepth({ ...target, depthType: gl.FLOAT }, x, y);
      }
      console.warn('AttributeTracker: depth readPixels error', { postErr, type, depthFormat: target.depthFormat });
      this.depthReadSupported = false; // stop spamming on platforms that reject depth readback
      return null;
    }
    let depth = pixel[0];
    if (type === gl.UNSIGNED_INT || type === gl.UNSIGNED_SHORT) {
      const bits = target.depthBits ?? this.depthBits ?? (type === gl.UNSIGNED_SHORT ? 16 : 24);
      const maxVal = Math.max(1, (2 ** bits) - 1);
      depth = depth / maxVal;
    }
    return Number.isFinite(depth) ? depth : null;
  }
}

class WebGPUAttributeRenderer {
  constructor(graphLayer, pool, runner) {
    this.graphLayer = graphLayer;
    this.pool = pool;
    this.runner = runner;
    this.device = null;
    this.targetFormat = 'rgba8unorm';
    this.trackDepth = false;
    this.nodePipeline = null;
    this.nodeDepthPipeline = null;
    this.edgePipeline = null;
    this.edgeDepthPipeline = null;
    this.edgeQuadPipeline = null;
    this.edgeQuadDepthPipeline = null;
    this.nodeBindGroupLayout = null;
    this.edgeBindGroupLayout = null;
    this.nodeBindGroup = null;
    this.edgeBindGroup = null;
	    this.nodeBuffers = {};
	    this.edgeBuffers = {};
	    this.nodeCache = {};
	    this.edgeCache = {};
    this.zeroEncodedCount = 0;
    this._zeroEncodedU8 = null;
    this.cornerBuffer = null;
    this.edgeCornerBuffer = null;
    this.targets = { node: null, edge: null };
    this.depthTargets = { node: null, edge: null };
    this.size = null;
  }

  initialize(device) {
    if (this.device) return;
    if (!device || device.type !== 'webgpu') return;
    this.device = device;
    // Prefer a linear format for attribute targets so encoded indices round-trip without swizzling/gamma.
    const preferredFormat = (device.format && !device.format.includes('srgb')) ? device.format : null;
    this.targetFormat = preferredFormat && preferredFormat.startsWith('rgba') ? preferredFormat : 'rgba8unorm';
    const cache = device.resourceCache?.webgpu;
    const quad = new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]);
    const cornerUsage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
    if (cache) {
      cache.ensureBuffer(device.device, 'attr:webgpu:corner', quad.byteLength, cornerUsage, 'AttributeTracker corner buffer');
      cache.uploadBuffer(device.device, device.device.queue, 'attr:webgpu:corner', quad, {
        label: 'AttributeTracker corner buffer',
        version: 1,
        topologyVersion: 0,
        count: 4,
        trackViewIdentity: true,
      }, cornerUsage);
      this.cornerBuffer = cache.buffers.get('attr:webgpu:corner')?.buffer ?? null;
    } else {
      this.cornerBuffer = device.device.createBuffer({
        size: quad.byteLength,
        usage: cornerUsage,
        mappedAtCreation: true,
      });
      new Float32Array(this.cornerBuffer.getMappedRange()).set(quad);
      this.cornerBuffer.unmap();
    }

    const edgeQuad = new Float32Array([
      0, 1,
      0, -1,
      1, 1,
      1, -1,
    ]);
    if (cache) {
      cache.ensureBuffer(device.device, 'attr:webgpu:edgeCorner', edgeQuad.byteLength, cornerUsage, 'AttributeTracker edge corner buffer');
      cache.uploadBuffer(device.device, device.device.queue, 'attr:webgpu:edgeCorner', edgeQuad, {
        label: 'AttributeTracker edge corner buffer',
        version: 1,
        topologyVersion: 0,
        count: 4,
        trackViewIdentity: true,
      }, cornerUsage);
      this.edgeCornerBuffer = cache.buffers.get('attr:webgpu:edgeCorner')?.buffer ?? null;
    } else {
      this.edgeCornerBuffer = device.device.createBuffer({
        size: edgeQuad.byteLength,
        usage: cornerUsage,
        mappedAtCreation: true,
      });
      new Float32Array(this.edgeCornerBuffer.getMappedRange()).set(edgeQuad);
      this.edgeCornerBuffer.unmap();
    }

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
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }], stepMode: 'instance' },
          { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }], stepMode: 'instance' },
          { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: 'uint8x4' }], stepMode: 'instance' },
        ],
      },
      fragment: { module: nodeModule, entryPoint: 'nodeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: device.depthFormat ?? 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });

    this.nodeDepthPipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.nodeBindGroupLayout] }),
      vertex: {
        module: nodeModule,
        entryPoint: 'nodeVertex',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }], stepMode: 'instance' },
          { arrayStride: 4, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32' }], stepMode: 'instance' },
          { arrayStride: 4, attributes: [{ shaderLocation: 3, offset: 0, format: 'uint8x4' }], stepMode: 'instance' },
        ],
      },
      fragment: { module: nodeModule, entryPoint: 'nodeDepthFragment', targets: [{ format: this.targetFormat }] },
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
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
            stepMode: 'instance',
          },
          { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }], stepMode: 'instance' },
          { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }], stepMode: 'instance' },
          { arrayStride: 4, attributes: [{ shaderLocation: 4, offset: 0, format: 'uint8x4' }], stepMode: 'instance' },
        ],
      },
      fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: device.depthFormat ?? 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'line-list' },
    });

    this.edgeDepthPipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: {
        module: edgeModule,
        entryPoint: 'edgeVertex',
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
            stepMode: 'instance',
          },
          { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x2' }], stepMode: 'instance' },
          { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }], stepMode: 'instance' },
          { arrayStride: 4, attributes: [{ shaderLocation: 4, offset: 0, format: 'uint8x4' }], stepMode: 'instance' },
        ],
      },
      fragment: { module: edgeModule, entryPoint: 'edgeDepthFragment', targets: [{ format: this.targetFormat }] },
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
            arrayStride: 24,
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' },
              { shaderLocation: 2, offset: 12, format: 'float32x3' },
            ],
            stepMode: 'instance',
          },
          { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }], stepMode: 'instance' },
          { arrayStride: 8, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x2' }], stepMode: 'instance' },
          { arrayStride: 4, attributes: [{ shaderLocation: 5, offset: 0, format: 'uint8x4' }], stepMode: 'instance' },
        ],
      },
      fragment: { module: edgeModule, entryPoint: 'edgeFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: device.depthFormat ?? 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });

    this.edgeQuadDepthPipeline = device.device.createRenderPipeline({
      layout: device.device.createPipelineLayout({ bindGroupLayouts: [this.edgeBindGroupLayout] }),
      vertex: {
        module: edgeModule,
        entryPoint: 'edgeQuadVertex',
        buffers: [
          { arrayStride: 8, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }], stepMode: 'vertex' },
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' },
              { shaderLocation: 2, offset: 12, format: 'float32x3' },
            ],
            stepMode: 'instance',
          },
          { arrayStride: 8, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x2' }], stepMode: 'instance' },
          { arrayStride: 8, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x2' }], stepMode: 'instance' },
          { arrayStride: 4, attributes: [{ shaderLocation: 5, offset: 0, format: 'uint8x4' }], stepMode: 'instance' },
        ],
      },
      fragment: { module: edgeModule, entryPoint: 'edgeDepthFragment', targets: [{ format: this.targetFormat }] },
      depthStencil: { format: device.depthFormat ?? 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' },
      primitive: { topology: 'triangle-strip' },
    });
  }

	  ensureVertexBuffer(map, key, requiredBytes) {
	    // Align to 256 bytes to avoid borderline validation issues on some WebGPU implementations
	    // when vertex buffers are exactly the minimum required size.
	    const aligned = Math.ceil(Math.max(4, requiredBytes) / 256) * 256;
	    const size = Math.max(256, aligned);
	    const current = map[key];
	    if (!current || size > current.size) {
	      if (current?.buffer) current.buffer.destroy();
	      else current?.destroy?.();
	      map[key] = {
        buffer: this.device.device.createBuffer({ size, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }),
        size,
      };
    }
    return map[key];
  }

  uploadVertexBuffer(map, key, source) {
    if (!source) return null;
    const bytes = source.byteLength ?? (source.length * source.BYTES_PER_ELEMENT) ?? 0;
    if (!bytes) return null;
    const entry = this.ensureVertexBuffer(map, key, bytes);
    this.device.device.queue.writeBuffer(entry.buffer, 0, source);
    return entry.buffer;
  }

	  uploadVertexBufferCached(map, key, source, cache, count, version = null) {
	    if (!source) return null;
	    const prev = cache[key];
	    const sameView = prev
	      && prev.buffer === source.buffer
	      && prev.byteOffset === source.byteOffset
	      && prev.byteLength === source.byteLength;
	    const sameCount = prev && prev.count === count;
	    const sameVersion = version == null || (prev && prev.version === version);
	    if (sameView && sameCount && sameVersion && map[key]?.buffer) {
	      return map[key].buffer;
	    }
	    const buffer = this.uploadVertexBuffer(map, key, source);
	    cache[key] = {
	      buffer: source.buffer,
	      byteOffset: source.byteOffset,
	      byteLength: source.byteLength,
	      count,
	      version,
	    };
	    return buffer;
	  }

  uploadZeroEncoded(count) {
    if (!count) return null;
    const shared = this.device?.resourceCache?.webgpu;
    if (shared) {
      const required = count * 4;
      if (!this._zeroEncodedU8 || this._zeroEncodedU8.byteLength < required) {
        this._zeroEncodedU8 = new Uint8Array(required);
      } else {
        this._zeroEncodedU8.fill(0, 0, required);
      }
      const key = 'attr:webgpu:node:encoded:__zero';
      const usage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
      return shared.uploadBuffer(this.device.device, this.device.device.queue, key, this._zeroEncodedU8.subarray(0, required), {
        label: 'AttributeTracker zero encoded',
        version: count,
        topologyVersion: 0,
        count,
        trackViewIdentity: false,
      }, usage);
    }
    if (this.zeroEncodedCount === count && this.nodeBuffers.zeroEncoded?.buffer) {
      return this.nodeBuffers.zeroEncoded.buffer;
    }
    const required = count * 4;
    if (!this._zeroEncodedU8 || this._zeroEncodedU8.byteLength < required) {
      this._zeroEncodedU8 = new Uint8Array(required);
    } else {
      this._zeroEncodedU8.fill(0, 0, required);
    }
    const entry = this.ensureVertexBuffer(this.nodeBuffers, 'zeroEncoded', required);
    this.device.device.queue.writeBuffer(entry.buffer, 0, this._zeroEncodedU8.subarray(0, required));
    this.zeroEncodedCount = count;
    return entry.buffer;
  }

  destroy() {
    const shared = this.device?.resourceCache?.webgpu;
    // Shared buffers are owned by the device cache.
    if (!shared) {
      const destroyEntry = (entry) => {
        if (!entry) return;
        if (entry.buffer) {
          entry.buffer.destroy();
        } else {
          entry.destroy?.();
        }
      };
      destroyEntry(this.cornerBuffer);
      destroyEntry(this.edgeCornerBuffer);
      Object.values(this.nodeBuffers).forEach(destroyEntry);
      Object.values(this.edgeBuffers).forEach(destroyEntry);
    }
    this.cornerBuffer = null;
    this.edgeCornerBuffer = null;
    this.depthTargets = { node: null, edge: null };
  }

  resize(size, scale, trackDepth) {
    if (!size || !this.device) return;
    const pixelRatio = size.devicePixelRatio ?? 1;
    const width = Math.max(1, Math.floor((size.width ?? 1) * pixelRatio * scale));
    const height = Math.max(1, Math.floor((size.height ?? 1) * pixelRatio * scale));
    if (this.size && this.size.width === width && this.size.height === height && this.trackDepth === (trackDepth === true)) {
      return;
    }
    this.size = { width, height };
    this.trackDepth = trackDepth === true;
    this.targets.node = this.pool.get(this.device, 'attr-node', width, height, {
      depth: true,
      filter: 'nearest',
      format: this.targetFormat,
    });
    this.targets.edge = this.pool.get(this.device, 'attr-edge', width, height, {
      depth: true,
      filter: 'nearest',
      format: this.targetFormat,
    });
    this.depthTargets.node = this.trackDepth
      ? this.pool.get(this.device, 'attr-node-depth-color', width, height, {
        depth: true,
        filter: 'nearest',
        format: this.targetFormat,
      })
      : null;
    this.depthTargets.edge = this.trackDepth
      ? this.pool.get(this.device, 'attr-edge-depth-color', width, height, {
        depth: true,
        filter: 'nearest',
        format: this.targetFormat,
      })
      : null;
  }

  encodeAttributes(network, geometry, config) {
    const { nodeAttribute, edgeAttribute } = config;
    const nodeCount = geometry.nodes.count ?? 0;
    const edgeCount = geometry.edges.count ?? 0;
    const nodeEncoded = ensureEncodedDesc(network, 'node', nodeAttribute, nodeCount);
    const edgeEncoded = ensureEncodedDesc(network, 'edge', edgeAttribute, edgeCount);
    return { nodeEncoded, edgeEncoded };
  }

  render(frame, size, config) {
    if (!this.device || !frame?.network) return null;
    const network = frame.network;
    const camera = frame.camera;
    const scale = config.resolutionScale ?? 1;
    this.resize(size, scale, config.trackDepth);
    const cameraUniforms = this.graphLayer.getCameraUniforms(camera);
    if (!cameraUniforms) return null;
    ensureEncodedReady(network, 'node', config.nodeAttribute);
    ensureEncodedReady(network, 'edge', config.edgeAttribute);

    const denseRequests = [];
    if (config.nodeAttribute || config.edgeAttribute) {
      denseRequests.push(['node', NODE_POSITION_ATTRIBUTE], ['node', NODE_SIZE_ATTRIBUTE]);
    }
    if (config.edgeAttribute) {
      denseRequests.push(
        ['edge', EDGE_ENDPOINTS_POSITION_ATTRIBUTE],
        ['edge', EDGE_WIDTH_ATTRIBUTE],
        ['edge', EDGE_ENDPOINTS_SIZE_ATTRIBUTE],
      );
    }

    return this.graphLayer.withDenseGraph(network, (geometry) => {
      if (!geometry) return null;
      const encoded = this.encodeAttributes(network, geometry, config);

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

    // Bind groups depend on per-frame camera/global buffers; refresh every render.
    this.nodeBindGroup = gpu.createBindGroup({
      layout: this.nodeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: globalsBuffer } },
      ],
    });
    this.edgeBindGroup = geometry.edges.count
      ? gpu.createBindGroup({
        layout: this.edgeBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: cameraBuffer } },
          { binding: 1, resource: { buffer: globalsBuffer } },
        ],
      })
      : null;

    const encoder = gpu.createCommandEncoder();
    const passes = [];

      const resourceCache = this.device?.resourceCache?.webgpu;
      const vertexUsage = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
      const uploadVertex = (key, source, meta) => {
        if (!resourceCache || !source) return null;
        return resourceCache.uploadBuffer(gpu, gpu.queue, key, source, { ...meta, trackViewIdentity: true }, vertexUsage);
      };

      const nodePositionBuffer = geometry.nodes.count
        ? uploadVertex('attr:webgpu:node:positions', geometry.nodes.positions, {
          label: 'AttributeTracker node positions',
          version: geometry.nodes.versions?.positions ?? 0,
          topologyVersion: geometry.nodes.versions?.topology ?? 0,
          count: geometry.nodes.count,
        })
        : null;
      const nodeSizeBuffer = geometry.nodes.count
        ? uploadVertex('attr:webgpu:node:sizes', geometry.nodes.sizes, {
          label: 'AttributeTracker node sizes',
          version: geometry.nodes.versions?.sizes ?? 0,
          topologyVersion: geometry.nodes.versions?.topology ?? 0,
          count: geometry.nodes.count,
        })
        : null;
      const nodeEncodedBuffer = (geometry.nodes.count && encoded.nodeEncoded?.view && config.nodeAttribute)
        ? resourceCache?.uploadBuffer(
          gpu,
          gpu.queue,
          `attr:webgpu:node:encoded:${config.nodeAttribute || 'index'}`,
          encoded.nodeEncoded.view,
          {
            label: 'AttributeTracker node encoded',
            version: encoded.nodeEncoded.version ?? 0,
            topologyVersion: 0,
            count: geometry.nodes.count,
            // Do not rely on view identity alone: WASM may reuse the same backing memory.
            trackViewIdentity: false,
          },
          vertexUsage,
        )
        : null;

      const edgeSegmentsBuffer = geometry.edges.count
        ? uploadVertex('attr:webgpu:edge:segments', geometry.edges.segments, {
          label: 'AttributeTracker edge segments',
          version: geometry.edges.versions?.segments ?? 0,
          topologyVersion: geometry.edges.versions?.topology ?? 0,
          count: geometry.edges.count,
        })
        : null;
      const edgeWidthsBuffer = geometry.edges.count
        ? uploadVertex('attr:webgpu:edge:widths', geometry.edges.widths, {
          label: 'AttributeTracker edge widths',
          version: geometry.edges.versions?.widths ?? 0,
          topologyVersion: geometry.edges.versions?.topology ?? 0,
          count: geometry.edges.count,
        })
        : null;
      const edgeEndpointSizeBuffer = geometry.edges.count
        ? uploadVertex('attr:webgpu:edge:endpointSizes', geometry.edges.endpointSizes, {
          label: 'AttributeTracker edge endpoint sizes',
          version: geometry.edges.versions?.endpointSizes ?? 0,
          topologyVersion: geometry.edges.versions?.topology ?? 0,
          count: geometry.edges.count,
        })
        : null;
      const edgeEncodedBuffer = (geometry.edges.count && encoded.edgeEncoded?.view && config.edgeAttribute)
        ? resourceCache?.uploadBuffer(
          gpu,
          gpu.queue,
          `attr:webgpu:edge:encoded:${config.edgeAttribute || 'index'}`,
          encoded.edgeEncoded.view,
          {
            label: 'AttributeTracker edge encoded',
            version: encoded.edgeEncoded.version ?? 0,
            topologyVersion: 0,
            count: geometry.edges.count,
            trackViewIdentity: false,
          },
          vertexUsage,
        )
        : null;

	    const shouldRenderNodes = geometry.nodes.count
	      && nodeEncodedBuffer
	      && nodePositionBuffer
	      && nodeSizeBuffer
	      && config.nodeAttribute;
	    const shouldRenderEdges = geometry.edges.count
	      && edgeEncodedBuffer
	      && edgeSegmentsBuffer
	      && edgeWidthsBuffer
	      && edgeEndpointSizeBuffer
	      && config.edgeAttribute;

	    // Render node ids into a temp target and copy into the dedicated node target.
	    // This avoids intermittent cases where directly rendering into the node target yields an empty texture.
	    if (shouldRenderNodes) {
	      passes.push(() => {
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
	        pass.setPipeline(this.nodePipeline);
	        pass.setBindGroup(0, this.nodeBindGroup);
	        pass.setVertexBuffer(0, this.cornerBuffer);
	        pass.setVertexBuffer(1, nodePositionBuffer);
	        pass.setVertexBuffer(2, nodeSizeBuffer);
	        pass.setVertexBuffer(3, nodeEncodedBuffer);
	        pass.draw(4, geometry.nodes.count, 0, 0);
	        pass.end();
	      });

	      passes.push(() => {
	        encoder.copyTextureToTexture(
	          { texture: this.targets.edge.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
	          { texture: this.targets.node.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
	          { width: this.targets.edge.width, height: this.targets.edge.height, depthOrArrayLayers: 1 },
	        );
	      });
	    }

	    if (shouldRenderEdges) {
	      passes.push(() => {
	        const zeroNodeEncodedBuffer = geometry.nodes.count
	          ? this.uploadZeroEncoded(geometry.nodes.count)
	          : null;
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
	        // Match the WebGL path: draw nodes with a zero-encoded color so they occlude edges via depth,
	        // but keep the edge target reserved for edge ids.
	        if (geometry.nodes.count && this.nodeBindGroup && nodePositionBuffer && nodeSizeBuffer && zeroNodeEncodedBuffer) {
	          pass.setPipeline(this.nodePipeline);
	          pass.setBindGroup(0, this.nodeBindGroup);
	          pass.setVertexBuffer(0, this.cornerBuffer);
	          pass.setVertexBuffer(1, nodePositionBuffer);
	          pass.setVertexBuffer(2, nodeSizeBuffer);
	          pass.setVertexBuffer(3, zeroNodeEncodedBuffer);
	          pass.draw(4, geometry.nodes.count, 0, 0);
	        }

	        const useQuad = this.graphLayer.edgeRenderingMode === 'quad';
	        pass.setPipeline(useQuad ? this.edgeQuadPipeline : this.edgePipeline);
	        pass.setBindGroup(0, this.edgeBindGroup);
        if (useQuad) {
          pass.setVertexBuffer(0, this.edgeCornerBuffer);
          pass.setVertexBuffer(1, edgeSegmentsBuffer);
          pass.setVertexBuffer(2, edgeWidthsBuffer);
          pass.setVertexBuffer(3, edgeEndpointSizeBuffer);
          pass.setVertexBuffer(4, edgeEncodedBuffer);
          pass.draw(4, geometry.edges.count, 0, 0);
        } else {
          pass.setVertexBuffer(0, edgeSegmentsBuffer);
          pass.setVertexBuffer(1, edgeWidthsBuffer);
          pass.setVertexBuffer(2, edgeEndpointSizeBuffer);
          pass.setVertexBuffer(3, edgeEncodedBuffer);
          pass.draw(2, geometry.edges.count, 0, 0);
        }
	        pass.end();
	      });
	    }

	    if (config.trackDepth) {
	      const zeroNodeEncodedBuffer = geometry.nodes.count
	        ? this.uploadZeroEncoded(geometry.nodes.count)
	        : null;
	      const shouldRenderNodeDepth = geometry.nodes.count
	        && this.depthTargets.node
	        && this.nodeBindGroup
	        && nodePositionBuffer
	        && nodeSizeBuffer
	        && (nodeEncodedBuffer || zeroNodeEncodedBuffer);
	      const shouldRenderEdgeDepth = geometry.edges.count
	        && this.depthTargets.edge
	        && this.edgeBindGroup
	        && edgeSegmentsBuffer
	        && edgeWidthsBuffer
	        && edgeEndpointSizeBuffer
	        && edgeEncodedBuffer;

	      if (shouldRenderNodeDepth && this.depthTargets.edge) {
	        passes.push(() => {
	          const pass = encoder.beginRenderPass({
	            colorAttachments: [{
	              view: this.depthTargets.edge.texture.createView(),
	              clearValue: { r: 0, g: 0, b: 0, a: 0 },
	              loadOp: 'clear',
	              storeOp: 'store',
	            }],
	            depthStencilAttachment: {
	              view: this.depthTargets.edge.depthTexture.createView(),
	              depthClearValue: 1,
	              depthLoadOp: 'clear',
	              depthStoreOp: 'store',
	            },
	          });
	          pass.setPipeline(this.nodeDepthPipeline);
	          pass.setBindGroup(0, this.nodeBindGroup);
	          pass.setVertexBuffer(0, this.cornerBuffer);
	          pass.setVertexBuffer(1, nodePositionBuffer);
	          pass.setVertexBuffer(2, nodeSizeBuffer);
	          pass.setVertexBuffer(3, nodeEncodedBuffer || zeroNodeEncodedBuffer);
	          pass.draw(4, geometry.nodes.count, 0, 0);
	          pass.end();
	        });

	        passes.push(() => {
	          encoder.copyTextureToTexture(
	            { texture: this.depthTargets.edge.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
	            { texture: this.depthTargets.node.texture, mipLevel: 0, origin: { x: 0, y: 0, z: 0 } },
	            { width: this.depthTargets.edge.width, height: this.depthTargets.edge.height, depthOrArrayLayers: 1 },
	          );
	        });
	      }

	      if (shouldRenderEdgeDepth) {
	        passes.push(() => {
	          const useQuad = this.graphLayer.edgeRenderingMode === 'quad';
	          const zeroEncoded = geometry.nodes.count && nodePositionBuffer && nodeSizeBuffer && zeroNodeEncodedBuffer
	            ? zeroNodeEncodedBuffer
	            : null;
	          const pass = encoder.beginRenderPass({
	            colorAttachments: [{
	              view: this.depthTargets.edge.texture.createView(),
	              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store',
            }],
            depthStencilAttachment: {
              view: this.depthTargets.edge.depthTexture.createView(),
              depthClearValue: 1,
              depthLoadOp: 'clear',
              depthStoreOp: 'store',
            },
	          });
	          // Depth-only nodes first (packed depth in color) so edge depth is occluded by nodes.
	          if (geometry.nodes.count && this.nodeBindGroup && nodePositionBuffer && nodeSizeBuffer && zeroEncoded) {
	            pass.setPipeline(this.nodeDepthPipeline);
	            pass.setBindGroup(0, this.nodeBindGroup);
	            pass.setVertexBuffer(0, this.cornerBuffer);
	            pass.setVertexBuffer(1, nodePositionBuffer);
	            pass.setVertexBuffer(2, nodeSizeBuffer);
	            pass.setVertexBuffer(3, zeroEncoded);
	            pass.draw(4, geometry.nodes.count, 0, 0);
	          }
	          pass.setPipeline(useQuad ? this.edgeQuadDepthPipeline : this.edgeDepthPipeline);
	          pass.setBindGroup(0, this.edgeBindGroup);
	          if (useQuad) {
	            pass.setVertexBuffer(0, this.edgeCornerBuffer);
            pass.setVertexBuffer(1, edgeSegmentsBuffer);
            pass.setVertexBuffer(2, edgeWidthsBuffer);
            pass.setVertexBuffer(3, edgeEndpointSizeBuffer);
            pass.setVertexBuffer(4, edgeEncodedBuffer);
            pass.draw(4, geometry.edges.count, 0, 0);
          } else {
            pass.setVertexBuffer(0, edgeSegmentsBuffer);
            pass.setVertexBuffer(1, edgeWidthsBuffer);
            pass.setVertexBuffer(2, edgeEndpointSizeBuffer);
            pass.setVertexBuffer(3, edgeEncodedBuffer);
            pass.draw(2, geometry.edges.count, 0, 0);
          }
	          pass.end();
	        });
	      }
	    }

    passes.push(() => {
      gpu.queue.submit([encoder.finish()]);
      cameraBuffer.destroy();
      globalsBuffer.destroy();
    });

      this.runner?.run?.(passes, { device: this.device });
      return { ...this.targets, depthTargets: this.depthTargets };
    }, denseRequests);
  }
}

export class AttributeTracker {
  constructor(renderer) {
    this.renderer = renderer;
    this.graphLayer = renderer?.graphLayer ?? null;
    this.nodeAttribute = null;
    this.edgeAttribute = null;
    this.options = { resolutionScale: 0.5, autoRender: true };
    this.webgl = null;
    this.webgpu = null;
    this.size = renderer?.size ?? null;
    this.lastTargets = null;
    this.targetPool = new RenderTargetPool();
    this.runner = new FrameGraphRunner();
    this.counters = {
      renders: 0,
      node: 0,
      edge: 0,
      nodeDepth: 0,
      edgeDepth: 0,
    };
    this._lastSignature = null;
  }

  _hashMat4(mat) {
    if (!mat || mat.length < 16) return 0;
    let hash = 2166136261;
    for (let i = 0; i < 16; i += 1) {
      const v = mat[i] ?? 0;
      const n = Number.isFinite(v) ? v : 0;
      const bits = (Math.fround(n) * 1e6) | 0;
      hash ^= bits;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  _safeVersion(fn) {
    try {
      const v = fn();
      return Number.isFinite(v) ? v : 0;
    } catch (_) {
      return 0;
    }
  }

  _computeSignature(frame, size, options) {
    const network = frame?.network;
    if (!network || !this.graphLayer) return null;
    const camera = frame?.camera ?? this.renderer?.camera ?? null;
    const scale = options.resolutionScale ?? 1;
    const pixelRatio = (size?.devicePixelRatio ?? 1);
    const widthPx = Math.max(1, Math.floor((size?.width ?? 1) * pixelRatio * scale));
    const heightPx = Math.max(1, Math.floor((size?.height ?? 1) * pixelRatio * scale));
    const trackDepth = options.trackDepth === true ? 1 : 0;

    const topology = this._safeVersion(() => {
      const t = network.getTopologyVersions?.();
      return t ? ((t.node ?? 0) * 1315423911) ^ (t.edge ?? 0) : 0;
    });

    const visuals = VISUAL_ATTRIBUTE_NAMES;
    const nodePos = this._safeVersion(() => network.getNodeAttributeVersion?.(visuals.NODE_POSITION_ATTRIBUTE));
    const nodeSize = this._safeVersion(() => network.getNodeAttributeVersion?.(visuals.NODE_SIZE_ATTRIBUTE));
    const nodeState = this._safeVersion(() => network.getNodeAttributeVersion?.(visuals.NODE_STATE_ATTRIBUTE));
    const nodeOutline = this._safeVersion(() => network.getNodeAttributeVersion?.(visuals.NODE_OUTLINE_WIDTH_ATTRIBUTE));
    const edgeSeg = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_ENDPOINTS_POSITION_ATTRIBUTE));
    const edgeWidth = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_WIDTH_ATTRIBUTE));
    const edgeEndSize = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_ENDPOINTS_SIZE_ATTRIBUTE));
    const edgeEndState = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_ENDPOINTS_STATE_ATTRIBUTE));
    const edgeState = this._safeVersion(() => network.getEdgeAttributeVersion?.(visuals.EDGE_STATE_ATTRIBUTE));

    const nodeAttr = this.nodeAttribute ?? '';
    const edgeAttr = this.edgeAttribute ?? '';
    const nodeAttrVer = nodeAttr === '$index'
      ? this._safeVersion(() => network.getTopologyVersions?.()?.node ?? 0)
      : (nodeAttr ? this._safeVersion(() => network.getNodeAttributeVersion?.(nodeAttr)) : 0);
    const edgeAttrVer = edgeAttr === '$index'
      ? this._safeVersion(() => network.getTopologyVersions?.()?.edge ?? 0)
      : (edgeAttr ? this._safeVersion(() => network.getEdgeAttributeVersion?.(edgeAttr)) : 0);

    const camHash = this._hashMat4(camera?.viewProjectionMatrix);
    const edgeMode = this.graphLayer.edgeRenderingMode ?? 'quad';
    const projection = camera?.projection ?? '';
    const mode = camera?.mode ?? '';

    return [
      this.renderer?.device?.type ?? '',
      widthPx,
      heightPx,
      scale,
      trackDepth,
      mode,
      projection,
      camHash,
      edgeMode,
      // Visuals drive geometry; include their versions.
      topology,
      nodePos,
      nodeSize,
      nodeState,
      nodeOutline,
      edgeSeg,
      edgeWidth,
      edgeEndSize,
      edgeEndState,
      edgeState,
      // Tracked attributes drive encoded buffers.
      nodeAttr,
      nodeAttrVer,
      edgeAttr,
      edgeAttrVer,
    ].join('|');
  }

  enable(nodeAttribute, edgeAttribute, options = {}) {
    this.nodeAttribute = nodeAttribute || null;
    this.edgeAttribute = edgeAttribute || null;
    this._lastSignature = null;
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
    this._lastSignature = null;
  }

  resize(size) {
    this.size = size;
    this.webgl?.resize?.(size, this.options.resolutionScale);
    this.webgpu?.resize?.(size, this.options.resolutionScale);
    this._lastSignature = null;
  }

  async render(frame, force = false) {
    if (!this.renderer?.device || !this.graphLayer || (!this.nodeAttribute && !this.edgeAttribute)) return null;
    const signature = this._computeSignature(frame, this.size ?? this.renderer.size, this.options);
    if (signature && this.lastTargets && signature === this._lastSignature) {
      return this.lastTargets;
    }
    if (!this.options.autoRender && !force) return this.lastTargets;
    const device = this.renderer.device;
    const hadNode = Boolean(this.nodeAttribute);
    const hadEdge = Boolean(this.edgeAttribute);
    const trackDepth = this.options.trackDepth === true;
    let didRender = false;
    if (device.type === 'webgl2') {
      if (!this.webgl) {
        this.webgl = new WebGLAttributeRenderer(this.graphLayer, this.targetPool, this.runner);
        this.webgl.initialize(device);
      }
      this.lastTargets = this.webgl.render(frame, this.size ?? this.renderer.size, {
        nodeAttribute: this.nodeAttribute,
        edgeAttribute: this.edgeAttribute,
        resolutionScale: this.options.resolutionScale,
        trackDepth: this.options.trackDepth,
      });
      didRender = Boolean(this.lastTargets);
    } else if (device.type === 'webgpu') {
      if (!this.webgpu) {
        this.webgpu = new WebGPUAttributeRenderer(this.graphLayer, this.targetPool, this.runner);
        this.webgpu.initialize(device);
      }
      this.lastTargets = this.webgpu.render(frame, this.size ?? this.renderer.size, {
        nodeAttribute: this.nodeAttribute,
        edgeAttribute: this.edgeAttribute,
        resolutionScale: this.options.resolutionScale,
        trackDepth: this.options.trackDepth,
      });
      didRender = Boolean(this.lastTargets);
    }
    if (didRender) {
      this._lastSignature = signature;
      this.counters.renders = bumpCounter(this.counters.renders);
      if (hadNode) {
        this.counters.node = bumpCounter(this.counters.node);
        if (trackDepth) this.counters.nodeDepth = bumpCounter(this.counters.nodeDepth);
      }
      if (hadEdge) {
        this.counters.edge = bumpCounter(this.counters.edge);
        if (trackDepth) this.counters.edgeDepth = bumpCounter(this.counters.edgeDepth);
      }
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
      const format = device.type === 'webgpu'
        ? (this.webgpu?.targetFormat || device.format)
        : device.format;
      const useBgra = device.type === 'webgpu' && typeof format === 'string' && format.startsWith('bgra');
      const decoded = useBgra
        ? decodePacked(new Uint8Array([pixels[2], pixels[1], pixels[0], pixels[3]]), 0)
        : decodePacked(pixels, 0);
      results[key] = decoded;
      if (this.options.trackDepth) {
        if (device.type === 'webgl2') {
          const depthTarget = key === 'node' ? this.webgl?.depthTargets?.node : this.webgl?.depthTargets?.edge;
          if (depthTarget) {
            const depthPixels = await device.readPixels(depthTarget, { x: clampedX, y: clampedY, width: 1, height: 1 });
            const depthBytes = depthPixels instanceof Uint8Array ? depthPixels : new Uint8Array(depthPixels);
            const reordered = useBgra
              ? new Uint8Array([depthBytes[2], depthBytes[1], depthBytes[0], depthBytes[3]])
              : depthBytes;
            results[`${key}Depth`] = unpackDepthRGBA(reordered, 0);
          } else {
            const depth = this.webgl?.readDepth?.(target, clampedX, clampedY);
            results[`${key}Depth`] = depth;
          }
        } else if (device.type === 'webgpu') {
          const depthTarget = key === 'node' ? this.webgpu?.depthTargets?.node : this.webgpu?.depthTargets?.edge;
          if (depthTarget?.texture) {
            const depthPixels = await device.readPixels(depthTarget, { x: clampedX, y: clampedY, width: 1, height: 1 });
            const depthBytes = depthPixels instanceof Uint8Array ? depthPixels : new Uint8Array(depthPixels);
            const reordered = useBgra
              ? new Uint8Array([depthBytes[2], depthBytes[1], depthBytes[0], depthBytes[3]])
              : depthBytes;
            results[`${key}Depth`] = unpackDepthRGBA(reordered, 0);
          }
        }
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
    this.targetPool?.releaseAll?.(this.renderer?.device);
  }
}
