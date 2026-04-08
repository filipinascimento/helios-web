/** @typedef {import('helios-network').default} HeliosNetwork */
import { AttributeType } from 'helios-network';
import { LayerManager } from './layers/LayerManager.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { StaticLayout, WorkerLayout } from './layouts/Layout.js';
import { D3Force3DLayout } from './layouts/d3force3dLayoutWorker.js';
import { GpuForceLayout } from './layouts/GpuForceLayout.js';
import { createRenderer } from './rendering/createRenderer.js';
import { resolveSupersamplingPreset, supersamplingPresetToOption } from './rendering/qualityOptions.js';
import {
  CameraTransitionController,
  applyCameraPose,
  captureCameraPose,
  createYawPitchQuaternion,
  interpolateCameraPose,
  mergeCameraPose,
} from './rendering/CameraTransitionController.js';
import { AttributeTracker } from './rendering/AttributeTracker.js';
import { PerformanceMonitor } from './utilities/PerformanceMonitor.js';
import { bumpCounter } from './utilities/counters.js';
import { VisualAttributes } from './pipeline/VisualAttributes.js';
import { createDefaultMappers, MapperCollection } from './pipeline/Mapper.js';
import { createDebugLogger } from './utilities/DebugLogger.js';
import { PositionDelegate } from './delegates/PositionDelegate.js';
import { VISUAL_ATTRIBUTE_NAMES } from './pipeline/constants.js';
import { SvgLabelController } from './labels/SvgLabelController.js';
import { SvgLegendController } from './legends/SvgLegendController.js';
import { HeliosFilter } from './filters/HeliosFilter.js';
import { DensityLayer } from './rendering/engine/DensityLayer.js';
import {
  buildFigureExportPresetList,
  getFigureExportCapability,
  resolveFigureExportOptions,
  resolveFigureRelativeOverlayScale,
  resolveFigurePreviewThumbnailOptions,
} from './export/figureExport.js';

const {
  NODE_POSITION_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  EDGE_STATE_ATTRIBUTE,
  EDGE_ENDPOINTS_POSITION_ATTRIBUTE,
  EDGE_ENDPOINTS_STATE_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

const UMAP_FORCE_FLAG_ATTRIBUTE = 'umap';
const DEFAULT_UMAP_EDGE_WEIGHT_ATTRIBUTE = 'umap_weight';
const DEFAULT_UMAP_NODE_MASS_ATTRIBUTE = 'umap_mass';
const RANDOM_LAYOUT_POSITION_CHOICE = '$random';
const DEFAULT_UMAP_FORCE_OPTIONS = Object.freeze({
  umapA: 1.5769434601962196,
  umapB: 0.8950608779914887,
  umapGamma: 1,
  umapNegativeSampleRate: 5,
  umapNeighborCount: 15,
  umapEpochs: null,
});

function isLayoutInstance(candidate) {
  return candidate && typeof candidate.step === 'function' && typeof candidate.initialize === 'function';
}

function forEachIndex(indices, visitor) {
  if (indices == null) return;
  if (typeof indices === 'number') {
    visitor(indices);
    return;
  }
  if (Array.isArray(indices) || ArrayBuffer.isView(indices)) {
    for (let i = 0; i < indices.length; i += 1) visitor(indices[i]);
    return;
  }
  if (typeof indices[Symbol.iterator] === 'function') {
    for (const index of indices) visitor(index);
  }
}

function parseNamespacedEventType(type) {
  if (typeof type !== 'string') {
    throw new TypeError('Event type must be a string');
  }
  const trimmed = type.trim();
  if (!trimmed) {
    throw new Error('Event type cannot be empty');
  }
  if (/\s/.test(trimmed)) {
    throw new Error('Namespaced event types cannot contain whitespace');
  }
  const dot = trimmed.indexOf('.');
  if (dot === -1) return { type: trimmed, namespace: '' };
  const base = trimmed.slice(0, dot);
  const namespace = trimmed.slice(dot + 1);
  if (!base) {
    throw new Error('Namespaced event types must include a base type before the "."');
  }
  return { type: base, namespace };
}

function resolveStateMask(mask, states) {
  if (typeof mask === 'string') {
    const value = states?.[mask];
    if (value == null) {
      throw new Error(`Unknown state name "${mask}"`);
    }
    return value;
  }
  if (Array.isArray(mask)) {
    let combined = 0;
    for (const entry of mask) {
      combined |= (Number(resolveStateMask(entry, states)) >>> 0);
    }
    return combined >>> 0;
  }
  return mask;
}

function resolveStateSlot(slot, states) {
  if (typeof slot !== 'string') return slot;
  const mask = Number(resolveStateMask(slot, states)) >>> 0;
  if (!mask || (mask & (mask - 1)) !== 0) {
    throw new Error(`State "${slot}" must map to a single-bit mask to be used as a style slot`);
  }
  return 31 - Math.clz32(mask);
}

function normalizeColorInput(color) {
  if (color == null) return null;
  if (Array.isArray(color) || ArrayBuffer.isView(color)) {
    const r = Number(color[0]);
    const g = Number(color[1]);
    const b = Number(color[2]);
    const a = color.length >= 4 ? Number(color[3]) : 1;
    if (![r, g, b, a].every(Number.isFinite)) return null;
    const max = Math.max(r, g, b, a);
    if (max > 1.0) {
      return [r / 255, g / 255, b / 255, a / 255];
    }
    return [r, g, b, a];
  }
  if (typeof color === 'string') {
    const hex = color.trim();
    if (!hex.startsWith('#')) return null;
    const raw = hex.slice(1);
    const expand = (c) => `${c}${c}`;
    let r = 0; let g = 0; let b = 0; let a = 255;
    if (raw.length === 3 || raw.length === 4) {
      r = parseInt(expand(raw[0]), 16);
      g = parseInt(expand(raw[1]), 16);
      b = parseInt(expand(raw[2]), 16);
      if (raw.length === 4) a = parseInt(expand(raw[3]), 16);
    } else if (raw.length === 6 || raw.length === 8) {
      r = parseInt(raw.slice(0, 2), 16);
      g = parseInt(raw.slice(2, 4), 16);
      b = parseInt(raw.slice(4, 6), 16);
      if (raw.length === 8) a = parseInt(raw.slice(6, 8), 16);
    } else {
      return null;
    }
    if (![r, g, b, a].every(Number.isFinite)) return null;
    return [r / 255, g / 255, b / 255, a / 255];
  }
  return null;
}

function normalizeInsets(insets) {
  if (!insets || typeof insets !== 'object') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const coerce = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
  };
  return {
    top: coerce(insets.top),
    right: coerce(insets.right),
    bottom: coerce(insets.bottom),
    left: coerce(insets.left),
  };
}

function createDetailEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
  if (typeof Event === 'function') {
    const event = new Event(type);
    event.detail = detail;
    return event;
  }
  return { type, detail };
}

function cloneMapperCollection(previous, network, onChange, debug) {
  const collection = new MapperCollection(previous?.mode ?? 'node', network, onChange, debug);
  if (!previous?.mappers || previous.mappers.size === 0) {
    return collection;
  }
  collection.mappers.clear();
  collection.defaultMapper = null;
  for (const [key, mapper] of previous.mappers.entries()) {
    const cloned = collection.createMapper(key);
    for (const [channelName, config] of mapper?.channels?.entries?.() ?? []) {
      if (!channelName || !config) continue;
      cloned.setChannel(channelName, { ...config, attributes: config.attributes ?? config.from });
    }
    if (!collection.defaultMapper && (key === 'default' || mapper === previous.defaultMapper)) {
      collection.defaultMapper = cloned;
    }
  }
  if (!collection.defaultMapper) {
    collection.defaultMapper = collection.mappers.get('default') ?? collection.mappers.values().next().value ?? null;
  }
  return collection;
}

function inferNetworkFormatFromName(name) {
  if (typeof name !== 'string') return null;
  const lower = name.trim().toLowerCase();
  if (lower.endsWith('.bxnet')) return 'bxnet';
  if (lower.endsWith('.zxnet')) return 'zxnet';
  if (lower.endsWith('.xnet')) return 'xnet';
  return null;
}

function elementToMarkup(element) {
  if (!element) return '';
  return new XMLSerializer().serializeToString(element);
}

function normalizeExportPixels(pixels, width, height, options = {}) {
  const source = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels);
  const normalized = new Uint8ClampedArray(width * height * 4);
  const flipY = options.flipY === true;
  const swizzleBGRA = options.swizzleBGRA === true;
  const alphaMode = String(options.alphaMode ?? 'straight').trim().toLowerCase();
  for (let row = 0; row < height; row += 1) {
    const srcRow = flipY ? (height - 1 - row) : row;
    for (let col = 0; col < width; col += 1) {
      const srcOffset = (srcRow * width + col) * 4;
      const dstOffset = (row * width + col) * 4;
      let red;
      let green;
      let blue;
      const alpha = source[srcOffset + 3];
      if (swizzleBGRA) {
        red = source[srcOffset + 2];
        green = source[srcOffset + 1];
        blue = source[srcOffset];
      } else {
        red = source[srcOffset];
        green = source[srcOffset + 1];
        blue = source[srcOffset + 2];
      }
      if (alphaMode === 'straight') {
        if (alpha <= 0) {
          red = 0;
          green = 0;
          blue = 0;
        } else if (alpha < 255) {
          const scale = 255 / alpha;
          red = Math.min(255, Math.round(red * scale));
          green = Math.min(255, Math.round(green * scale));
          blue = Math.min(255, Math.round(blue * scale));
        }
      }
      normalized[dstOffset] = red;
      normalized[dstOffset + 1] = green;
      normalized[dstOffset + 2] = blue;
      normalized[dstOffset + 3] = alpha;
    }
  }
  return normalized;
}

function pixelsToCanvas(pixels, width, height, outputWidth, outputHeight, options = {}) {
  const normalizedPixels = normalizeExportPixels(pixels, width, height, options);
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = Math.max(1, width);
  fullCanvas.height = Math.max(1, height);
  const fullCtx = fullCanvas.getContext('2d', { willReadFrequently: true });
  if (!fullCtx) throw new Error('Unable to create a 2D canvas context for figure export');
  fullCtx.putImageData(new ImageData(normalizedPixels, width, height), 0, 0);

  if (width === outputWidth && height === outputHeight) {
    return fullCanvas;
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = Math.max(1, outputWidth);
  outputCanvas.height = Math.max(1, outputHeight);
  const outputCtx = outputCanvas.getContext('2d');
  if (!outputCtx) throw new Error('Unable to create an output canvas for figure export');
  outputCtx.imageSmoothingEnabled = true;
  if (typeof outputCtx.imageSmoothingQuality !== 'undefined') outputCtx.imageSmoothingQuality = 'high';
  outputCtx.drawImage(fullCanvas, 0, 0, outputCanvas.width, outputCanvas.height);
  return outputCanvas;
}

function canvasToBlob(canvas, type) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error(`Failed to encode figure as ${type}`));
    }, type);
  });
}

function loadSvgImage(svgText) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error instanceof Error ? error : new Error('Failed to rasterize SVG overlay'));
    };
    image.src = url;
  });
}

const ILLUSTRATOR_EXPORT_FONT_FAMILY = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function resolveExportBackgroundColor(backgroundColor) {
  const source = Array.isArray(backgroundColor) ? backgroundColor : [1, 1, 1, 1];
  const red = Math.max(0, Math.min(255, Math.round(Number(source[0] ?? 0) * 255)));
  const green = Math.max(0, Math.min(255, Math.round(Number(source[1] ?? 0) * 255)));
  const blue = Math.max(0, Math.min(255, Math.round(Number(source[2] ?? 0) * 255)));
  return {
    red,
    green,
    blue,
    css: `rgb(${red} ${green} ${blue})`,
  };
}

function buildExportLogicalViewport(options = {}) {
  const width = Math.max(
    1,
    Number(options.logicalWidth ?? options.width ?? options.bitmapWidth ?? options.previewRect?.width ?? 1),
  );
  const height = Math.max(
    1,
    Number(options.logicalHeight ?? options.height ?? options.bitmapHeight ?? options.previewRect?.height ?? 1),
  );
  const bitmapWidth = Math.max(1, Number(options.bitmapWidth ?? width));
  const bitmapHeight = Math.max(1, Number(options.bitmapHeight ?? height));
  const devicePixelRatio = Math.max(
    1,
    Number(options.devicePixelRatio ?? Math.max(bitmapWidth / width, bitmapHeight / height, 1)),
  );
  return { width, height, devicePixelRatio };
}

function createMat4Identity() {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

function safeSignedDivisor(value, epsilon = 1e-12) {
  if (!Number.isFinite(value)) return epsilon;
  if (Math.abs(value) >= epsilon) return value;
  return value < 0 ? -epsilon : epsilon;
}

function mat4Multiply(out, a, b) {
  const a00 = a[0];
  const a01 = a[1];
  const a02 = a[2];
  const a03 = a[3];
  const a10 = a[4];
  const a11 = a[5];
  const a12 = a[6];
  const a13 = a[7];
  const a20 = a[8];
  const a21 = a[9];
  const a22 = a[10];
  const a23 = a[11];
  const a30 = a[12];
  const a31 = a[13];
  const a32 = a[14];
  const a33 = a[15];

  const b00 = b[0];
  const b01 = b[1];
  const b02 = b[2];
  const b03 = b[3];
  const b10 = b[4];
  const b11 = b[5];
  const b12 = b[6];
  const b13 = b[7];
  const b20 = b[8];
  const b21 = b[9];
  const b22 = b[10];
  const b23 = b[11];
  const b30 = b[12];
  const b31 = b[13];
  const b32 = b[14];
  const b33 = b[15];

  out[0] = a00 * b00 + a10 * b01 + a20 * b02 + a30 * b03;
  out[1] = a01 * b00 + a11 * b01 + a21 * b02 + a31 * b03;
  out[2] = a02 * b00 + a12 * b01 + a22 * b02 + a32 * b03;
  out[3] = a03 * b00 + a13 * b01 + a23 * b02 + a33 * b03;
  out[4] = a00 * b10 + a10 * b11 + a20 * b12 + a30 * b13;
  out[5] = a01 * b10 + a11 * b11 + a21 * b12 + a31 * b13;
  out[6] = a02 * b10 + a12 * b11 + a22 * b12 + a32 * b13;
  out[7] = a03 * b10 + a13 * b11 + a23 * b12 + a33 * b13;
  out[8] = a00 * b20 + a10 * b21 + a20 * b22 + a30 * b23;
  out[9] = a01 * b20 + a11 * b21 + a21 * b22 + a31 * b23;
  out[10] = a02 * b20 + a12 * b21 + a22 * b22 + a32 * b23;
  out[11] = a03 * b20 + a13 * b21 + a23 * b22 + a33 * b23;
  out[12] = a00 * b30 + a10 * b31 + a20 * b32 + a30 * b33;
  out[13] = a01 * b30 + a11 * b31 + a21 * b32 + a31 * b33;
  out[14] = a02 * b30 + a12 * b31 + a22 * b32 + a32 * b33;
  out[15] = a03 * b30 + a13 * b31 + a23 * b32 + a33 * b33;
  return out;
}

function mat4Frustum(out, left, right, bottom, top, near, far) {
  const rl = 1 / safeSignedDivisor(right - left);
  const tb = 1 / safeSignedDivisor(top - bottom);
  const nf = 1 / safeSignedDivisor(near - far);
  out[0] = (2 * near) * rl;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = (2 * near) * tb;
  out[6] = 0;
  out[7] = 0;
  out[8] = (right + left) * rl;
  out[9] = (top + bottom) * tb;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[12] = 0;
  out[13] = 0;
  out[14] = (2 * far * near) * nf;
  out[15] = 0;
  return out;
}

function mat4Ortho(out, left, right, bottom, top, near, far) {
  const lr = 1 / safeSignedDivisor(left - right);
  const bt = 1 / safeSignedDivisor(bottom - top);
  const nf = 1 / safeSignedDivisor(near - far);
  out[0] = -2 * lr;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 0;
  out[5] = -2 * bt;
  out[6] = 0;
  out[7] = 0;
  out[8] = 0;
  out[9] = 0;
  out[10] = 2 * nf;
  out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

function interpolateFrameBounds(bounds, previewRect, liveViewport) {
  const liveWidth = Math.max(1, Number(liveViewport?.width ?? 1));
  const liveHeight = Math.max(1, Number(liveViewport?.height ?? 1));
  const x = Math.min(Math.max(0, Number(previewRect?.x ?? 0)), liveWidth);
  const y = Math.min(Math.max(0, Number(previewRect?.y ?? 0)), liveHeight);
  const width = Math.min(
    Math.max(1e-6, Number(previewRect?.width ?? liveWidth)),
    Math.max(1e-6, liveWidth - x),
  );
  const height = Math.min(
    Math.max(1e-6, Number(previewRect?.height ?? liveHeight)),
    Math.max(1e-6, liveHeight - y),
  );

  const u0 = x / liveWidth;
  const u1 = (x + width) / liveWidth;
  const v0 = y / liveHeight;
  const v1 = (y + height) / liveHeight;

  return {
    left: bounds.left + ((bounds.right - bounds.left) * u0),
    right: bounds.left + ((bounds.right - bounds.left) * u1),
    top: bounds.top + ((bounds.bottom - bounds.top) * v0),
    bottom: bounds.top + ((bounds.bottom - bounds.top) * v1),
  };
}

function derivePerspectiveBounds(projectionMatrix, near) {
  const m00 = Number(projectionMatrix?.[0] ?? 0);
  const m11 = Number(projectionMatrix?.[5] ?? 0);
  const m20 = Number(projectionMatrix?.[8] ?? 0);
  const m21 = Number(projectionMatrix?.[9] ?? 0);
  if (!Number.isFinite(m00) || !Number.isFinite(m11) || Math.abs(m00) < 1e-12 || Math.abs(m11) < 1e-12) {
    return null;
  }
  return {
    left: near * ((m20 - 1) / m00),
    right: near * ((m20 + 1) / m00),
    bottom: near * ((m21 - 1) / m11),
    top: near * ((m21 + 1) / m11),
  };
}

function deriveOrthographicBounds(projectionMatrix) {
  const m00 = Number(projectionMatrix?.[0] ?? 0);
  const m11 = Number(projectionMatrix?.[5] ?? 0);
  const m30 = Number(projectionMatrix?.[12] ?? 0);
  const m31 = Number(projectionMatrix?.[13] ?? 0);
  if (!Number.isFinite(m00) || !Number.isFinite(m11) || Math.abs(m00) < 1e-12 || Math.abs(m11) < 1e-12) {
    return null;
  }
  return {
    left: (-1 - m30) / m00,
    right: (1 - m30) / m00,
    bottom: (-1 - m31) / m11,
    top: (1 - m31) / m11,
  };
}

function normalizeTruthyNetworkFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    return Number(value) !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (['1', 'true', 'yes', 'y', 'on', 'enabled', 'umap'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) return false;
  }
  return false;
}

function normalizeForceModel(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'umap') return 'umap';
  if (normalized === 'linear' || normalized === 'force' || normalized === 'gpu-force') return 'linear';
  return null;
}

function readNetworkAttributeValue(network, name) {
  if (!network || typeof name !== 'string' || !name.trim()) return undefined;
  const info = network.getNetworkAttributeInfo?.(name) ?? null;
  if (!info || Number(info.dimension ?? 1) !== 1) return undefined;
  if (Number(info.type) === AttributeType.String || Number(info.type) === AttributeType.Category) {
    return network.getNetworkStringAttribute?.(name);
  }
  let value;
  const read = () => {
    const buffer = network.getNetworkAttributeBuffer?.(name) ?? null;
    value = buffer?.view?.[0];
  };
  try {
    if (typeof network.withBufferAccess === 'function') network.withBufferAccess(read);
    else read();
  } catch (error) {
    console.warn(`Helios: failed to read network attribute "${name}".`, error);
    return undefined;
  }
  return value;
}

function readNetworkStringAttributeValue(network, name) {
  const value = readNetworkAttributeValue(network, name);
  if (value == null) return null;
  return String(value).trim() || null;
}

function readNetworkNumberAttribute(network, name, fallback) {
  const value = Number(readNetworkAttributeValue(network, name));
  return Number.isFinite(value) ? value : fallback;
}

function resolveGpuForceLayoutOptionsFromNetwork(network, requestedOptions = {}) {
  const explicitModel = normalizeForceModel(requestedOptions.forceModel);
  const enabledByGraph = normalizeTruthyNetworkFlag(readNetworkAttributeValue(network, UMAP_FORCE_FLAG_ATTRIBUTE));
  if (explicitModel === 'linear') {
    return { ...requestedOptions, forceModel: 'linear' };
  }
  if (!enabledByGraph && explicitModel !== 'umap') {
    return { ...requestedOptions, forceModel: 'linear' };
  }
  if (!enabledByGraph) {
    console.warn('Helios: ignoring gpu-force UMAP mode because the graph-level "umap" attribute is not enabled.');
    return { ...requestedOptions, forceModel: 'linear' };
  }

  const edgeWeightAttribute = String(
    requestedOptions.edgeWeightAttribute
      ?? readNetworkStringAttributeValue(network, 'umap_edge_weight_attr')
      ?? DEFAULT_UMAP_EDGE_WEIGHT_ATTRIBUTE,
  ).trim();
  if (!edgeWeightAttribute || !network?.hasEdgeAttribute?.(edgeWeightAttribute)) {
    console.warn(
      `Helios: ignoring gpu-force UMAP mode because edge attribute "${edgeWeightAttribute || DEFAULT_UMAP_EDGE_WEIGHT_ATTRIBUTE}" is unavailable.`,
    );
    return { ...requestedOptions, forceModel: 'linear' };
  }

  const requestedMassAttribute = requestedOptions.nodeMassAttribute ?? readNetworkStringAttributeValue(network, 'umap_node_mass_attr');
  const normalizedMassAttribute = typeof requestedMassAttribute === 'string' && requestedMassAttribute.trim()
    ? requestedMassAttribute.trim()
    : DEFAULT_UMAP_NODE_MASS_ATTRIBUTE;
  const nodeMassAttribute = network?.hasNodeAttribute?.(normalizedMassAttribute)
    ? normalizedMassAttribute
    : null;
  const requestedPositionAttribute = requestedOptions.umapPositionAttribute
    ?? readNetworkStringAttributeValue(network, 'umap_position_attr');
  const normalizedPositionAttribute = typeof requestedPositionAttribute === 'string' && requestedPositionAttribute.trim()
    ? requestedPositionAttribute.trim()
    : null;
  const umapHasInitialPositions = Boolean(
    normalizedPositionAttribute
    && network?.hasNodeAttribute?.(normalizedPositionAttribute),
  );

  return {
    ...requestedOptions,
    forceModel: 'umap',
    edgeWeightAttribute,
    nodeMassAttribute,
    umapPositionAttribute: umapHasInitialPositions ? normalizedPositionAttribute : null,
    umapHasInitialPositions,
    umapA: readNetworkNumberAttribute(network, 'umap_a', requestedOptions.umapA ?? DEFAULT_UMAP_FORCE_OPTIONS.umapA),
    umapB: readNetworkNumberAttribute(network, 'umap_b', requestedOptions.umapB ?? DEFAULT_UMAP_FORCE_OPTIONS.umapB),
    umapGamma: readNetworkNumberAttribute(network, 'umap_gamma', requestedOptions.umapGamma ?? DEFAULT_UMAP_FORCE_OPTIONS.umapGamma),
    umapNeighborCount: readNetworkNumberAttribute(
      network,
      'umap_n_neighbors',
      requestedOptions.umapNeighborCount ?? DEFAULT_UMAP_FORCE_OPTIONS.umapNeighborCount,
    ),
    umapNegativeSampleRate: readNetworkNumberAttribute(
      network,
      'umap_negative_sample_rate',
      requestedOptions.umapNegativeSampleRate ?? DEFAULT_UMAP_FORCE_OPTIONS.umapNegativeSampleRate,
    ),
    umapEpochs: readNetworkNumberAttribute(
      network,
      'umap_n_epochs',
      requestedOptions.umapEpochs ?? DEFAULT_UMAP_FORCE_OPTIONS.umapEpochs,
    ),
    kAttraction: Number.isFinite(Number(requestedOptions.kAttraction)) ? requestedOptions.kAttraction : 1,
    kRepulsion: Number.isFinite(Number(requestedOptions.kRepulsion)) ? requestedOptions.kRepulsion : 1,
    kGravity: Number.isFinite(Number(requestedOptions.kGravity)) ? requestedOptions.kGravity : 0,
  };
}

function computeGpuForceModeSwitchDepthJitter(layout) {
  const depth = Math.max(0, Number(layout?.options?.depth ?? 0) || 0);
  const radius = Math.max(0, Number(layout?.options?.radius ?? 0) || 0);
  const jitterBase = depth > 1e-6 ? depth : Math.max(1, radius * 0.25);
  return Math.max(1e-4, jitterBase * 0.005);
}

function resolveSeedBoundsForLayout(layoutOption, size, mode) {
  const safeMode = mode === '3d' ? '3d' : '2d';
  const width = Math.max(1, size?.width ?? 1)*0.01;
  const height = Math.max(1, size?.height ?? 1)*0.01;
  const minSide = Math.max(1, Math.min(width, height));
  const base = { width: minSide, height: minSide, depth: 0, mode: safeMode, center: [0, 0, 0] };

  if (!layoutOption || isLayoutInstance(layoutOption)) return base;
  if (layoutOption?.type === 'worker') {
    const opts = layoutOption.options ?? {};
    const radius = Number.isFinite(opts.radius) ? Math.max(1, opts.radius) : 150;
    const depth = Number.isFinite(opts.depth) ? Math.max(0, opts.depth) : 0;
    const center = Array.isArray(opts.center) ? opts.center : [0, 0, 0];
    return {
      width: radius,
      height: radius,
      depth: safeMode === '3d' ? depth : 0,
      mode: safeMode,
      center,
    };
  }
  if (layoutOption?.type === 'gpu-force' || layoutOption?.type === 'gpuforce') {
    const opts = layoutOption.options ?? {};
    const radius = Number.isFinite(opts.radius) ? Math.max(1, opts.radius) : 150;
    const depth = Number.isFinite(opts.depth) ? Math.max(0, opts.depth) : 0;
    const center = Array.isArray(opts.center) ? opts.center : [0, 0, 0];
    return {
      width: radius,
      height: radius,
      depth: safeMode === '3d' ? depth : 0,
      mode: safeMode,
      center,
    };
  }

  if (layoutOption?.type === 'd3force3d' || layoutOption?.type === 'd3-force-3d') {
    const bounds = layoutOption?.options?.bounds ?? null;
    if (Array.isArray(bounds) && bounds.length >= 4) {
      const minX = Number(bounds[0]);
      const minY = Number(bounds[1]);
      const maxX = Number(bounds[2]);
      const maxY = Number(bounds[3]);
      if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
        return {
          width: Math.max(1, maxX - minX),
          height: Math.max(1, maxY - minY),
          depth: 0,
          mode: safeMode,
          center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, 0],
        };
      }
    }
  }

  const bounds = layoutOption?.options?.bounds ?? null;
  if (Array.isArray(bounds) && bounds.length >= 4) {
    const minX = Number(bounds[0]);
    const minY = Number(bounds[1]);
    const maxX = Number(bounds[2]);
    const maxY = Number(bounds[3]);
    if ([minX, minY, maxX, maxY].every(Number.isFinite)) {
      return {
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        depth: 0,
        mode: safeMode,
        center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, 0],
      };
    }
  }

  return base;
}

function isNumericLayoutPositionAttributeType(type) {
  return type === AttributeType.Float
    || type === AttributeType.Double
    || type === AttributeType.Integer
    || type === AttributeType.UnsignedInteger
    || type === AttributeType.BigInteger
    || type === AttributeType.UnsignedBigInteger;
}

function getBaseFilename(name) {
  if (typeof name !== 'string') return 'network';
  const trimmed = name.trim();
  if (!trimmed) return 'network';
  const withoutKnown = trimmed.replace(/\.(bxnet|zxnet|xnet)$/i, '');
  if (withoutKnown !== trimmed) return withoutKnown;
  return trimmed.replace(/\.[^/.]+$/, '') || trimmed;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function copyVec3(value, fallback = 0) {
  return [
    Number.isFinite(value?.[0]) ? value[0] : fallback,
    Number.isFinite(value?.[1]) ? value[1] : fallback,
    Number.isFinite(value?.[2]) ? value[2] : fallback,
  ];
}

function resolve2DCenterFromPose(pose, fallbackZ = 0) {
  const zoom = Math.max(1e-6, Number.isFinite(pose?.zoom) ? pose.zoom : 1);
  const pan = pose?.pan2D ?? [0, 0, 0];
  return [
    -(Number(pan[0]) || 0) / zoom,
    -(Number(pan[1]) || 0) / zoom,
    Number.isFinite(fallbackZ) ? fallbackZ : 0,
  ];
}

function resolve3DCenterFromPose(pose) {
  const target = pose?.target ?? [0, 0, 0];
  const pan = pose?.pan3D ?? [0, 0, 0];
  return [
    (Number(target[0]) || 0) + (Number(pan[0]) || 0),
    (Number(target[1]) || 0) + (Number(pan[1]) || 0),
    (Number(target[2]) || 0) + (Number(pan[2]) || 0),
  ];
}

function estimate3DDistanceFrom2DZoom(pose) {
  const viewportHeight = Math.max(1, Number(pose?.viewport?.height) || 1);
  const zoom = Math.max(1e-6, Number.isFinite(pose?.zoom) ? pose.zoom : 1);
  const fovRad = ((Number.isFinite(pose?.fov) ? pose.fov : 60) * Math.PI) / 180;
  const tanHalfFov = Math.max(1e-6, Math.tan(fovRad * 0.5));
  return viewportHeight / (2 * zoom * tanHalfFov);
}

function estimate2DZoomFrom3DDistance(pose) {
  const viewportHeight = Math.max(1, Number(pose?.viewport?.height) || 1);
  const distance = Math.max(1e-6, Number.isFinite(pose?.distance) ? pose.distance : 800);
  const fovRad = ((Number.isFinite(pose?.fov) ? pose.fov : 60) * Math.PI) / 180;
  const worldHeight = Math.max(1e-6, 2 * distance * Math.tan(fovRad * 0.5));
  return viewportHeight / worldHeight;
}

const DEFAULT_MODE_SWITCH_DURATION_MS = 360;
const DEFAULT_MODE_SWITCH_3D_ROTATION = createYawPitchQuaternion(-0.55, 0.42);
const CAMERA_FIT_DEFAULT_MAX_SAMPLES = 50000;
const CAMERA_CONTROL_DEFAULTS = Object.freeze({
  autoFit: true,
  autoFitCoverage: 0.95,
  autoFitPaddingRatio: 0.05,
  autoFitIntervalMs: 900,
  autoFitMinIntervalMs: 250,
  autoFitMaxIntervalMs: 6000,
  autoFitLargeNetworkScale: 1,
  autoFitIntervalNodeCountRef: 5000,
  autoFitMaxSamples: CAMERA_FIT_DEFAULT_MAX_SAMPLES,
  animation: true,
  animationDurationMs: 280,
  orbit: false,
  orbitAngle: 0,
  orbitSpeed: 0.08,
  orbitDirection: 1,
  targetNodeIndices: null,
});

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

const POSITION_INTERPOLATION_DEFAULTS = Object.freeze({
  enabled: false,
  mode: 'gpu',
  durationMode: 'fixed',
  durationMs: 140,
  adaptiveDuration: false,
  adaptiveDurationSamples: 5,
  adaptiveDurationWindowMs: 5000,
  adaptiveDurationScale: 1,
  adaptiveDurationMinMs: 16,
  adaptiveDurationMaxMs: 5000,
  easing: 'linear',
  smoothing: 6,
  minDisplacementRatio: 0.0005,
});

const DENSITY_DEFAULTS = Object.freeze({
  enabled: false,
  qualityScale: 0.1,
  topographic: false,
  scaleWithZoom: false,
  bandwidth: 28.1,
  weightScale: 398.1071705534973,
  property: 'Uniform',
  compareProperty: 'None',
  comparisonMode: 'difference',
  normalizeVs: false,
  epsilon: 1e-6,
  logRatioRange: 3,
  maskThreshold: 0,
  logRatioSupportCorrection: true,
  colormap: 'interpolateOrRd',
  logRatioColormap: 'cmasher:prinsenvlag',
  divergingColormap: 'cmasher:prinsenvlag',
});

function hasDensityComparisonTarget(compareProperty) {
  return typeof compareProperty === 'string'
    && compareProperty.trim().length > 0
    && compareProperty.trim() !== 'None';
}

function resolveDensityCompareProperty(property, compareProperty) {
  const propertyKey = typeof property === 'string' ? property.trim() : '';
  const compareKey = typeof compareProperty === 'string' ? compareProperty.trim() : '';
  if (!compareKey || compareKey === 'None') return 'None';
  if (propertyKey && compareKey === propertyKey) return 'None';
  return compareKey;
}

function resolveDensityComparisonMode(compareProperty, requestedMode) {
  return hasDensityComparisonTarget(compareProperty) && requestedMode === 'logRatio'
    ? 'logRatio'
    : 'difference';
}

function usesLogRatioDensityColormap(config) {
  return resolveDensityComparisonMode(config?.compareProperty, config?.comparisonMode) === 'logRatio';
}

function resolveDensityActiveColormap(config, runtime) {
  if (usesLogRatioDensityColormap(config)) {
    return config?.logRatioColormap ?? config?.divergingColormap ?? config?.colormap;
  }
  if (runtime?.diverging === true) {
    return config?.divergingColormap ?? config?.colormap;
  }
  return config?.colormap;
}

const EDGE_ADAPTIVE_QUALITY_DEFAULTS = Object.freeze({
  enabled: true,
  slowFrameThresholdMs: 66,
  averageWindowFrames: 12,
  probeIntervalMs: 900,
  interactionHoldMs: 180,
  fastDuringCamera: true,
  fastDuringLayout: true,
});

const EDGE_ADAPTIVE_LAYOUT_HYSTERESIS = Object.freeze({
  exitThresholdFactor: 0.75,
  alphaProbeFactor: 0.5,
  alphaMinMultiplier: 4,
  backoffFactor: 2,
  maxBackoffMs: 12000,
});

function normalizeNodeIndexList(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    const numeric = Math.floor(value);
    return Number.isFinite(numeric) && numeric >= 0 ? [numeric] : [];
  }
  const next = [];
  const seen = new Set();
  forEachIndex(value, (entry) => {
    const numeric = Math.floor(Number(entry));
    if (!Number.isFinite(numeric) || numeric < 0 || seen.has(numeric)) return;
    seen.add(numeric);
    next.push(numeric);
  });
  return next;
}

function normalizeOrbitAngleDegrees(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, -89, 89);
}

function normalizeCameraControlConfig(base = {}, patch = {}) {
  const next = { ...base };
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFit')) {
    next.autoFit = patch.autoFit === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitCoverage')) {
    next.autoFitCoverage = clamp(
      normalizeNonNegativeNumber(patch.autoFitCoverage, next.autoFitCoverage ?? CAMERA_CONTROL_DEFAULTS.autoFitCoverage, 0.5, 1),
      0.5,
      1,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitPaddingRatio')) {
    next.autoFitPaddingRatio = normalizeNonNegativeNumber(patch.autoFitPaddingRatio, next.autoFitPaddingRatio ?? 0, 0, 1);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitIntervalMs')) {
    next.autoFitIntervalMs = normalizeNonNegativeNumber(patch.autoFitIntervalMs, next.autoFitIntervalMs ?? 0, 0, 60000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitMinIntervalMs')) {
    next.autoFitMinIntervalMs = normalizeNonNegativeNumber(patch.autoFitMinIntervalMs, next.autoFitMinIntervalMs ?? 0, 0, 60000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitMaxIntervalMs')) {
    next.autoFitMaxIntervalMs = normalizeNonNegativeNumber(patch.autoFitMaxIntervalMs, next.autoFitMaxIntervalMs ?? 0, 0, 60000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitLargeNetworkScale')) {
    next.autoFitLargeNetworkScale = normalizeNonNegativeNumber(patch.autoFitLargeNetworkScale, next.autoFitLargeNetworkScale ?? 1, 0, 32);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitIntervalNodeCountRef')) {
    next.autoFitIntervalNodeCountRef = normalizePositiveInteger(
      patch.autoFitIntervalNodeCountRef,
      next.autoFitIntervalNodeCountRef ?? 1,
      1,
      Number.MAX_SAFE_INTEGER,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoFitMaxSamples')) {
    next.autoFitMaxSamples = normalizePositiveInteger(
      patch.autoFitMaxSamples,
      next.autoFitMaxSamples ?? CAMERA_FIT_DEFAULT_MAX_SAMPLES,
      32,
      1000000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'animation')) {
    next.animation = patch.animation === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'animationDurationMs')) {
    next.animationDurationMs = normalizeNonNegativeNumber(patch.animationDurationMs, next.animationDurationMs ?? 0, 0, 60000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbit')) {
    next.orbit = patch.orbit === true;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbitAngle')) {
    next.orbitAngle = normalizeOrbitAngleDegrees(
      patch.orbitAngle,
      next.orbitAngle ?? CAMERA_CONTROL_DEFAULTS.orbitAngle,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbitSpeed')) {
    next.orbitSpeed = normalizeNonNegativeNumber(patch.orbitSpeed, next.orbitSpeed ?? 0, 0, 10);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orbitDirection')) {
    next.orbitDirection = Number(patch.orbitDirection) < 0 ? -1 : 1;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'targetNodeIndices')) {
    next.targetNodeIndices = normalizeNodeIndexList(patch.targetNodeIndices);
  }

  next.autoFitMinIntervalMs = Math.min(next.autoFitMinIntervalMs ?? 0, next.autoFitMaxIntervalMs ?? 0);
  next.autoFitMaxIntervalMs = Math.max(next.autoFitMaxIntervalMs ?? 0, next.autoFitMinIntervalMs ?? 0);
  return next;
}

function copyCameraControlConfig(config = {}) {
  return {
    ...config,
    targetNodeIndices: Array.isArray(config.targetNodeIndices) ? [...config.targetNodeIndices] : null,
  };
}

function quantileFromSorted(sorted, t) {
  if (!Array.isArray(sorted) || sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const clamped = clamp(Number(t), 0, 1);
  const index = clamped * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  const factor = index - lo;
  return sorted[lo] + ((sorted[hi] - sorted[lo]) * factor);
}

function quatNormalizeInto(out, q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len > 0) {
    const inv = 1 / len;
    out[0] = q[0] * inv;
    out[1] = q[1] * inv;
    out[2] = q[2] * inv;
    out[3] = q[3] * inv;
  } else {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
  }
  return out;
}

function quatMultiplyInto(out, a, b) {
  const ax = a[0];
  const ay = a[1];
  const az = a[2];
  const aw = a[3];
  const bx = b[0];
  const by = b[1];
  const bz = b[2];
  const bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

function quatFromAxisAngle(axis, radians) {
  const out = new Float32Array(4);
  const ax = Number(axis?.[0]) || 0;
  const ay = Number(axis?.[1]) || 0;
  const az = Number(axis?.[2]) || 0;
  const len = Math.hypot(ax, ay, az);
  if (len <= 1e-12) {
    out[3] = 1;
    return out;
  }
  const half = radians * 0.5;
  const scale = Math.sin(half) / len;
  out[0] = ax * scale;
  out[1] = ay * scale;
  out[2] = az * scale;
  out[3] = Math.cos(half);
  return out;
}

function normalizeInterpolationMode(value, fallback = POSITION_INTERPOLATION_DEFAULTS.mode) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (!raw) return 'gpu';
  if (raw === 'javascript' || raw === 'js' || raw === 'cpu') return 'gpu';
  if (raw === 'network' || raw === 'wasm' || raw === 'native') return 'gpu';
  if (raw === 'gpu' || raw === 'shader') return 'gpu';
  return 'gpu';
}

function normalizeInterpolationDurationMode(value, fallback = POSITION_INTERPOLATION_DEFAULTS.durationMode) {
  if (typeof value === 'boolean') {
    return value ? 'adaptive' : 'fixed';
  }
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'adaptive' || raw === 'auto' || raw === 'dynamic') return 'adaptive';
  if (raw === 'fixed' || raw === 'manual' || raw === 'constant') return 'fixed';
  return fallback;
}

function normalizeInterpolationEasing(value, fallback = POSITION_INTERPOLATION_DEFAULTS.easing) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (!raw) return 'linear';
  // Smoothstep looked unstable for frequent layout updates; keep a single interpolation curve for now.
  return 'linear';
}

function clamp01(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric <= 0) return 0;
  if (numeric >= 1) return 1;
  return numeric;
}

function normalizeNonNegativeNumber(value, fallback, min = 0, max = Number.POSITIVE_INFINITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const clampedMin = Math.max(min, numeric);
  return Math.min(max, clampedMin);
}

function normalizePositiveInteger(value, fallback, min = 1, max = Number.POSITIVE_INFINITY) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.floor(numeric);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

function normalizeEdgeAdaptiveQualityConfig(base = {}, patch = {}) {
  if (patch === true || patch === false) {
    return {
      ...base,
      enabled: patch === true,
    };
  }
  if (!patch || typeof patch !== 'object') {
    return { ...base };
  }
  const next = { ...base };
  if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
    next.enabled = patch.enabled !== false;
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'slowFrameThresholdMs')
    || Object.prototype.hasOwnProperty.call(patch, 'thresholdMs')
  ) {
    next.slowFrameThresholdMs = normalizeNonNegativeNumber(
      patch.slowFrameThresholdMs ?? patch.thresholdMs,
      next.slowFrameThresholdMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.slowFrameThresholdMs,
      0,
      10000,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'probeIntervalMs')
    || Object.prototype.hasOwnProperty.call(patch, 'retryDelayMs')
  ) {
    next.probeIntervalMs = normalizeNonNegativeNumber(
      patch.probeIntervalMs ?? patch.retryDelayMs,
      next.probeIntervalMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.probeIntervalMs,
      0,
      60000,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'averageWindowFrames')
    || Object.prototype.hasOwnProperty.call(patch, 'slowFrameConsecutiveFrames')
  ) {
    next.averageWindowFrames = normalizePositiveInteger(
      patch.averageWindowFrames ?? patch.slowFrameConsecutiveFrames,
      next.averageWindowFrames ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.averageWindowFrames,
      1,
      240,
    );
  }
  if (
    Object.prototype.hasOwnProperty.call(patch, 'interactionHoldMs')
    || Object.prototype.hasOwnProperty.call(patch, 'cameraIdleMs')
  ) {
    next.interactionHoldMs = normalizeNonNegativeNumber(
      patch.interactionHoldMs ?? patch.cameraIdleMs,
      next.interactionHoldMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.interactionHoldMs,
      0,
      5000,
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fastDuringCamera')) {
    next.fastDuringCamera = patch.fastDuringCamera !== false;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'fastDuringLayout')) {
    next.fastDuringLayout = patch.fastDuringLayout !== false;
  }
  return next;
}

function resolveInterpolationDurationMode(config) {
  const fallback = config?.adaptiveDuration === true ? 'adaptive' : POSITION_INTERPOLATION_DEFAULTS.durationMode;
  return normalizeInterpolationDurationMode(config?.durationMode, fallback);
}

function applyInterpolationEasing(mode, t) {
  const clamped = clamp01(t, 0);
  if (mode !== 'linear') return clamped;
  return clamped;
}

function arePositionArraysEqual(a, b, epsilon = 1e-6) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Math.abs((a[i] ?? 0) - (b[i] ?? 0)) > epsilon) return false;
  }
  return true;
}

function mixPositionsArray(from, to, out, t) {
  if (!from || !to || !out) return out;
  const factor = clamp01(t, 1);
  const count = Math.min(from.length, to.length, out.length);
  for (let i = 0; i < count; i += 1) {
    out[i] = from[i] + (to[i] - from[i]) * factor;
  }
  return out;
}

function computePositionDisplacementRatio(from, to) {
  if (!from || !to || from.length !== to.length || from.length === 0) return 0;
  let maxDelta = 0;
  let maxMagnitude = 0;
  for (let i = 0; i < from.length; i += 1) {
    const a = Number(from[i] ?? 0);
    const b = Number(to[i] ?? 0);
    const delta = Math.abs(b - a);
    if (delta > maxDelta) maxDelta = delta;
    const magnitude = Math.max(Math.abs(a), Math.abs(b));
    if (magnitude > maxMagnitude) maxMagnitude = magnitude;
  }
  if (maxDelta <= 0) return 0;
  return maxDelta / Math.max(1, maxMagnitude);
}

const GRAPH_FILTER_SCOPE_RENDER = 'render';
const GRAPH_FILTER_SCOPE_RENDER_LAYOUT = 'render+layout';
const GRAPH_FILTER_ALLOWED_OPTION_KEYS = Object.freeze([
  'nodeQuery',
  'edgeQuery',
  'nodeSelector',
  'edgeSelector',
  'nodeSelection',
  'edgeSelection',
  'orderNodesBy',
  'orderEdgesBy',
]);

function normalizeGraphFilterScope(value, fallback = GRAPH_FILTER_SCOPE_RENDER) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (raw === GRAPH_FILTER_SCOPE_RENDER_LAYOUT || raw === 'layout' || raw === 'render_layout') {
    return GRAPH_FILTER_SCOPE_RENDER_LAYOUT;
  }
  return GRAPH_FILTER_SCOPE_RENDER;
}

function normalizeGraphFilterOptions(options = {}) {
  const out = {};
  for (const key of GRAPH_FILTER_ALLOWED_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      out[key] = options[key];
    }
  }
  return out;
}

function hasGraphFilterCriteria(options = {}) {
  for (const key of GRAPH_FILTER_ALLOWED_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      return true;
    }
  }
  return false;
}

function safeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function safeLength(value) {
  const length = Number(value?.length);
  return Number.isFinite(length) && length >= 0 ? Math.floor(length) : 0;
}

function computeFilterTopologyVersion(baseVersion, filterVersion) {
  const base = safeNumber(baseVersion, 0);
  const delta = safeNumber(filterVersion, 0);
  const sum = base + delta;
  if (sum >= Number.MAX_SAFE_INTEGER) {
    return sum % Number.MAX_SAFE_INTEGER;
  }
  if (sum < 0) return 0;
  return sum;
}

function bumpVersionCounter(value) {
  const current = safeNumber(value, 0);
  if (current >= Number.MAX_SAFE_INTEGER - 1) return 0;
  return current + 1;
}

export const EVENTS = Object.freeze({
  LAYOUT_START: 'layout:start',
  LAYOUT_STOP: 'layout:stop',
  LAYOUT_CHANGED: 'layout:changed',
  MODE_CHANGED: 'mode:changed',

  NODE_HOVER: 'node:hover',
  EDGE_HOVER: 'edge:hover',

  GRAPH_CLICK: 'graph:click',
  GRAPH_DBLCLICK: 'graph:dblclick',

  NODE_CLICK: 'node:click',
  EDGE_CLICK: 'edge:click',

  NODE_DBLCLICK: 'node:dblclick',
  EDGE_DBLCLICK: 'edge:dblclick',

  BEFORE_RENDER: 'render:before',
  AFTER_RENDER: 'render:after',

  RESIZE: 'resize',
  CAMERA_MOVE: 'camera:move',
  CAMERA_CONTROL_CHANGE: 'camera:control-change',
  NETWORK_REPLACED: 'network:replaced',
  GRAPH_FILTER_CHANGED: 'graph:filter-changed',
});

export class Helios extends EventTarget {
  static STATES = Object.freeze({
    FILTERED: 1 << 0,
    SELECTED: 1 << 1,
    HIGHLIGHTED: 1 << 2,
  });

  static STATE_BITS = Helios.STATES;

  static UI_BINDINGS = Object.freeze({
    edgeWidthScale: {
      type: 'number',
      label: 'Edge Width Scale',
      description: 'Scales mapped edge widths',
      defaultValue: 1,
      domain: { min: 0, max: 10 },
      recommendedRange: { min: 0.0, max: 4.0 },
      step: 0.01,
    },
    edgeWidthBase: {
      type: 'number',
      label: 'Edge Width Base',
      description: 'Adds a constant to mapped edge widths',
      defaultValue: 0,
      domain: { min: 0, max: 20 },
      recommendedRange: { min: 0.0, max: 6.0 },
      step: 0.01,
    },
    edgeOpacityScale: {
      type: 'number',
      label: 'Edge Opacity Scale',
      description: 'Scales mapped edge opacity',
      defaultValue: 0.5,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
      meta: { inputMin: 0, inputMax: null },
    },
    edgeOpacityBase: {
      type: 'number',
      label: 'Edge Opacity Base',
      description: 'Adds a constant to mapped edge opacity',
      defaultValue: 0,
      domain: { min: 0, max: 1 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
    },
    nodeOpacityScale: {
      type: 'number',
      label: 'Node Opacity Scale',
      description: 'Scales mapped node opacity',
      defaultValue: 1,
      domain: { min: 0, max: 4 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
      meta: { inputMin: 0, inputMax: null },
    },
    nodeOpacityBase: {
      type: 'number',
      label: 'Node Opacity Base',
      description: 'Adds a constant to mapped node opacity',
      defaultValue: 0,
      domain: { min: 0, max: 1 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
    },
    nodeSizeScale: {
      type: 'number',
      label: 'Node Size Scale',
      description: 'Scales mapped node sizes',
      defaultValue: 1,
      domain: { min: 0, max: 100 },
      recommendedRange: { min: 0.25, max: 3.0 },
      step: 0.01,
    },
    nodeSizeBase: {
      type: 'number',
      label: 'Node Size Base',
      description: 'Adds a constant to mapped node sizes',
      defaultValue: 0,
      domain: { min: 0, max: 50 },
      recommendedRange: { min: 0.0, max: 10.0 },
      step: 0.01,
    },
    semanticZoomExponent: {
      type: 'number',
      label: 'Semantic Zoom Exponent',
      description: 'Compensates node and edge sizes as camera zoom changes (0 = geometric zoom only)',
      defaultValue: 0,
      domain: { min: 0, max: 2 },
      recommendedRange: { min: 0.0, max: 1.0 },
      step: 0.01,
    },
    nodeOutlineWidthScale: {
      type: 'number',
      label: 'Outline Width Scale',
      description: 'Scales mapped outline widths',
      defaultValue: 0,
      domain: { min: 0, max: 10 },
      recommendedRange: { min: 0.0, max: 10.0 },
      step: 0.01,
    },
    nodeOutlineWidthBase: {
      type: 'number',
      label: 'Outline Width Base',
      description: 'Adds a constant to mapped outline widths',
      defaultValue: 0,
      domain: { min: 0, max: 20 },
      recommendedRange: { min: 0.0, max: 4.0 },
      step: 0.01,
    },
    edgeEndpointTrim: {
      type: 'number',
      label: 'Edge Endpoint Trim',
      description: 'Trims edge endpoints so edges don’t overlap nodes',
      defaultValue: 0.8,
      domain: { min: 0, max: 3 },
      recommendedRange: { min: 0.0, max: 1.5 },
      step: 0.01,
    },
    nodeBlendWithEdges: {
      type: 'boolean',
      label: 'Blend Nodes With Edges',
      description: 'Blend nodes using the edge transparency mode (weighted modes still use alpha; disables node depth testing)',
      defaultValue: false,
    },
    edgeDepthWrite: {
      type: 'boolean',
      label: 'Edge Depth Write',
      description: 'Enable depth testing and depth writes for edges (best for solid edges)',
      defaultValue: false,
    },
    edgeFastRendering: {
      type: 'boolean',
      label: 'Fast Edge Lines',
      description: 'Use a reduced-cost edge path for large interactive graphs. Forces thin line rendering and disables expensive edge effects.',
      defaultValue: false,
    },
    edgeAdaptiveQualityEnabled: {
      type: 'boolean',
      label: 'Adaptive Edges',
      description: 'Automatically switch to fast edge lines only after repeated slow high-quality frames.',
      defaultValue: true,
    },
    edgeAdaptiveQualitySlowFrameThresholdMs: {
      type: 'number',
      label: 'Slow Frame',
      description: 'A high-quality edge frame slower than this counts toward adaptive fallback.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.slowFrameThresholdMs,
      domain: { min: 0, max: 200 },
      recommendedRange: { min: 8, max: 60 },
      step: 1,
    },
    edgeAdaptiveQualitySlowFrameConsecutiveFrames: {
      type: 'number',
      label: 'Avg Frames',
      description: 'How many recent high-quality edge frames are averaged before deciding to switch to fast edges.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.averageWindowFrames,
      domain: { min: 1, max: 60 },
      recommendedRange: { min: 4, max: 24 },
      step: 1,
    },
    edgeAdaptiveQualityProbeIntervalMs: {
      type: 'number',
      label: 'Hold Time',
      description: 'How long to stay in fast-edge mode before probing high-quality edges again.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.probeIntervalMs,
      domain: { min: 0, max: 5000 },
      recommendedRange: { min: 100, max: 2000 },
      step: 10,
    },
    edgeAdaptiveQualityInteractionHoldMs: {
      type: 'number',
      label: 'Interaction Hold',
      description: 'Debounce after camera movement before trying high-quality edges again.',
      defaultValue: EDGE_ADAPTIVE_QUALITY_DEFAULTS.interactionHoldMs,
      domain: { min: 0, max: 2000 },
      recommendedRange: { min: 0, max: 500 },
      step: 10,
    },
    edgeAdaptiveQualityFastDuringCamera: {
      type: 'boolean',
      label: 'Camera',
      description: 'Keep fast edges active during panning, zooming, rotating, and nearby interaction bursts.',
      defaultValue: true,
    },
    edgeAdaptiveQualityFastDuringLayout: {
      type: 'boolean',
      label: 'Layout',
      description: 'Keep fast edges active while the active layout is still updating positions.',
      defaultValue: true,
    },
    labelsMode: {
      type: 'string',
      label: 'Labels',
      description: 'Choose whether labels are off, automatically ranked, or limited to selected nodes.',
      defaultValue: 'off',
    },
    labelsSelectedOnlySpaceAware: {
      type: 'boolean',
      label: 'Space Aware',
      description: 'When Selected Only is active, use the regular label culling and collision strategy instead of always forcing selected labels through.',
      defaultValue: false,
    },
    labelsEnabled: {
      type: 'boolean',
      label: 'Show Labels',
      description: 'Enable SVG node labels',
      defaultValue: false,
    },
    labelsMaxVisible: {
      type: 'number',
      label: 'Max Labels',
      description: 'Maximum number of labels rendered at once',
      defaultValue: 120,
      domain: { min: 0, max: 5000 },
      recommendedRange: { min: 20, max: 400 },
      step: 1,
    },
    labelsFontSizeScale: {
      type: 'number',
      label: 'Label Size Scale',
      description: 'Global multiplier for label font size',
      defaultValue: 1,
      domain: { min: 0.25, max: 8 },
      recommendedRange: { min: 0.5, max: 2.5 },
      step: 0.05,
    },
    labelsMinScreenRadius: {
      type: 'number',
      label: 'Min Node Radius',
      description: 'Minimum apparent node radius (px) required before labels are considered',
      defaultValue: 0,
      domain: { min: 0, max: 200 },
      recommendedRange: { min: 0, max: 24 },
      step: 0.5,
    },
    labelsOutlineWidth: {
      type: 'number',
      label: 'Label Outline Width',
      description: 'Label stroke/halo width',
      defaultValue: 2,
      domain: { min: 0, max: 16 },
      recommendedRange: { min: 0, max: 6 },
      step: 0.25,
    },
    labelsOffsetRadiusFactor: {
      type: 'number',
      label: 'Label Radius Factor',
      description: 'Scales the node-radius-based vertical anchor used for labels',
      defaultValue: 1,
      domain: { min: -8, max: 8 },
      recommendedRange: { min: -1, max: 1 },
      step: 0.05,
    },
    labelsOffsetPx: {
      type: 'number',
      label: 'Label Pixel Offset',
      description: 'Additional vertical label offset in screen pixels',
      defaultValue: 4,
      domain: { min: -256, max: 256 },
      recommendedRange: { min: -48, max: 48 },
      step: 1,
    },
    labelsMaxChars: {
      type: 'number',
      label: 'Label Max Chars',
      description: 'Maximum characters per row before truncation (0 = unlimited)',
      defaultValue: 0,
      domain: { min: 0, max: 512 },
      recommendedRange: { min: 0, max: 64 },
      step: 1,
    },
    labelsMaxRows: {
      type: 'number',
      label: 'Label Max Rows',
      description: 'Maximum wrapped label rows (uses ellipsis when clipped)',
      defaultValue: 1,
      domain: { min: 1, max: 8 },
      recommendedRange: { min: 1, max: 4 },
      step: 1,
    },
    legendsEnabled: {
      type: 'boolean',
      label: 'Show Legends',
      description: 'Enable SVG overlay legends',
      defaultValue: true,
    },
    background: {
      type: 'color',
      label: 'Background',
      description: 'Renderer clear/background color',
      eventName: 'clearColor',
    },
    clearColor: {
      type: 'color',
      label: 'Background',
      description: 'Renderer clear/background color',
    },
    supersampling: {
      type: 'string',
      label: 'Supersampling',
      description: 'Canvas resolution scaling: Off, Auto, or 2x.',
    },
  });

  uiBindingInfo(name) {
    return this.constructor.UI_BINDINGS?.[name] ?? null;
  }

  _emitUIBindingChange(name, value) {
    if (typeof this.dispatchEvent !== 'function') return;
    try {
      this.dispatchEvent(createDetailEvent('ui:binding-change', { id: `helios.${name}`, name, value }));
    } catch {
      // Avoid breaking tests that create Helios-shaped objects without EventTarget internals.
    }
  }

  _emitLayoutChanged(layout = this._layout) {
    const descriptor = typeof layout?.getParameterBindings === 'function'
      ? (layout.getParameterBindings() ?? null)
      : null;
    this.emit(EVENTS.LAYOUT_CHANGED, {
      layout,
      key: descriptor?.key ?? null,
      label: descriptor?.label ?? layout?.constructor?.name ?? null,
    });
  }

  _bindLayoutToHelios(layout) {
    if (layout && typeof layout === 'object') {
      layout.helios = this;
    }
    return layout;
  }

  _wakeLayoutIfIdle(reason = 'layout') {
    const scheduler = this.scheduler ?? null;
    if (!scheduler || typeof scheduler.setLayoutEnabled !== 'function') return false;
    const state = typeof scheduler.getLayoutState === 'function'
      ? scheduler.getLayoutState()
      : (scheduler.layoutEnabled !== false ? 'running' : 'stopped');
    if (state !== 'idle') return false;
    scheduler.setLayoutEnabled(true, reason);
    scheduler.requestLayout?.(reason);
    return true;
  }

  _requestLayoutReheat(reason = 'layout') {
    const layout = this._layout ?? null;
    if (!layout || typeof layout !== 'object') return false;
    if (typeof layout.reheat === 'function') {
      layout.reheat(reason);
      return true;
    }
    layout.requestUpdate?.();
    return false;
  }

  _resumeDynamicLayoutAfterNetworkReplace(previousState, reason = 'network-replaced') {
    if (previousState !== 'idle') return false;
    if (this._layout instanceof StaticLayout) return false;
    const woke = this._wakeLayoutIfIdle(reason);
    const reheated = this._requestLayoutReheat(reason);
    return woke || reheated;
  }

  _activateLayoutAfterNetworkReplace(previousLayoutState, reason = 'network-replaced') {
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    this.scheduler.setLayout(this._layout);
    this._resumeDynamicLayoutAfterNetworkReplace(previousLayoutState, reason);
    this._emitLayoutChanged(this._layout);
  }

  constructor(network, options = {}) {
    if (!network) {
      throw new Error('Helios requires a helios-network instance');
    }
    super();
    if (!Object.prototype.hasOwnProperty.call(options, 'transparencyModeEdges')) {
      options.transparencyModeEdges = 'weighted';
    }
    if (!Object.prototype.hasOwnProperty.call(options, 'layout')) {
      const mode = options.mode ?? '2d';
      options.layout = {
        type: 'gpu-force',
        options: {
          mode,
        },
      };
    }
    this.network = network;
    this.options = options;
    this.debug = createDebugLogger(options.debug);
    this.debug.log('helios', 'Constructing Helios instance', { mode: options.mode ?? '2d' });
    this.prewarmPromise = null;
    this.mappersDirty = false;
    this.markMappersDirty = () => {
      this.mappersDirty = true;
      this.prewarmPromise = null;
      this.scheduler?.requestGeometry?.();
    };
    const container = options.container ?? document.getElementById('app') ?? document.body;
    this.layers = new LayerManager(container, {
      suppressBrowserGestures: options.suppressBrowserGestures !== false,
      supersampling: options.supersampling,
      forceSupersample: options.forceSupersample,
      supersamplingAutoFactor: options.supersamplingAutoFactor,
      supersamplingAutoThreshold: options.supersamplingAutoThreshold,
    });
    this.visuals = new VisualAttributes(network, this.debug);
    this.nodeMapper = new MapperCollection('node', network, this.markMappersDirty, this.debug);
    this.edgeMapper = new MapperCollection('edge', network, this.markMappersDirty, this.debug);
    const optionMappers = options.mappers;
    if (optionMappers !== null) {
      const initialMappers = optionMappers ?? createDefaultMappers(network);
      if (initialMappers?.nodeMapper) {
        this.nodeMapper.setDefault(initialMappers.nodeMapper);
      }
      if (initialMappers?.edgeMapper) {
        this.edgeMapper.setDefault(initialMappers.edgeMapper);
      }
    }
    this.mappersDirty = true;
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(options.layout, this.layers.size, options.mode));
    const debugPerformance = options.debugPerformance?? false;
    const performanceWindow = options.performanceWindow ?? 60;
    const performanceLogEvery = options.performanceLogEvery ?? performanceWindow;
    this.performanceMonitor = new PerformanceMonitor({
      enabled: debugPerformance,
      windowSize: performanceWindow,
      logEvery: performanceLogEvery,
    });
    this.attributeUpdateOptions = {
      autoUpdate: options.attributeAutoUpdate === true,
      maxFps: options.attributeAutoUpdateMaxFps ?? null,
      frameSkip: options.attributeAutoUpdateFrameSkip ?? null,
    };
    this.manualRendering = options.manualRendering === true;
    this.scheduler = new Scheduler({
      performanceMonitor: this.performanceMonitor,
      maxFps: options.maxFps,
      debug: this.debug,
      attributeAutoUpdate: this.attributeUpdateOptions.autoUpdate,
      attributeMaxFps: this.attributeUpdateOptions.maxFps,
      attributeFrameSkip: this.attributeUpdateOptions.frameSkip,
    });
    const requestedPositionDelegate = options.positions?.delegate ?? null;
    const initialPositionDelegate = requestedPositionDelegate
      ? this._validatePositionDelegate(requestedPositionDelegate)
      : null;
    const initialPositionSource = options.positions?.source === 'delegate' && initialPositionDelegate
      ? 'delegate'
      : 'network';
    this._positionsConfig = {
      source: initialPositionSource,
      delegate: initialPositionDelegate,
    };
    this._activePositionDelegate = null;
    const interpolationOptions = options.interpolation ?? null;
    const interpolationDurationMode = normalizeInterpolationDurationMode(
      interpolationOptions?.durationMode ?? interpolationOptions?.durationStrategy,
      interpolationOptions?.fixedDurationMs != null
        ? 'fixed'
        : interpolationOptions?.adaptiveDuration === true
          ? 'adaptive'
          : POSITION_INTERPOLATION_DEFAULTS.durationMode,
    );
    this._interpolationConfig = {
      ...POSITION_INTERPOLATION_DEFAULTS,
      ...(interpolationOptions && typeof interpolationOptions === 'object' ? interpolationOptions : {}),
      mode: normalizeInterpolationMode(interpolationOptions?.mode ?? interpolationOptions?.type),
      easing: normalizeInterpolationEasing(interpolationOptions?.easing),
      enabled: interpolationOptions?.enabled === true,
      durationMode: interpolationDurationMode,
      durationMs: normalizeNonNegativeNumber(
        interpolationOptions?.fixedDurationMs ?? interpolationOptions?.durationMs ?? interpolationOptions?.duration,
        POSITION_INTERPOLATION_DEFAULTS.durationMs,
      ),
      adaptiveDuration: interpolationDurationMode === 'adaptive',
      adaptiveDurationSamples: normalizePositiveInteger(
        interpolationOptions?.adaptiveDurationSamples,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationSamples,
        1,
        120,
      ),
      adaptiveDurationWindowMs: normalizeNonNegativeNumber(
        interpolationOptions?.adaptiveDurationWindowMs,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationWindowMs,
        100,
        60000,
      ),
      adaptiveDurationScale: normalizeNonNegativeNumber(
        interpolationOptions?.adaptiveDurationScale,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationScale,
        0,
        16,
      ),
      adaptiveDurationMinMs: normalizeNonNegativeNumber(
        interpolationOptions?.adaptiveDurationMinMs,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationMinMs,
        0,
        60000,
      ),
      adaptiveDurationMaxMs: normalizeNonNegativeNumber(
        interpolationOptions?.adaptiveDurationMaxMs,
        POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationMaxMs,
        0,
        60000,
      ),
      smoothing: normalizeNonNegativeNumber(
        interpolationOptions?.smoothing,
        POSITION_INTERPOLATION_DEFAULTS.smoothing,
      ),
      minDisplacementRatio: normalizeNonNegativeNumber(
        interpolationOptions?.minDisplacementRatio,
        POSITION_INTERPOLATION_DEFAULTS.minDisplacementRatio,
      ),
    };
    this._interpolationRuntime = {
      active: false,
      startedAt: 0,
      lastFrameAt: 0,
      lastTargetUpdateAt: 0,
      layoutElapsedMs: 16,
      sourcePositions: null,
      targetPositions: null,
      mixedPositions: null,
      sourceVersion: 0,
      targetVersion: 0,
      sourceCount: 0,
      factor: 1,
      delegateVersion: null,
      sourceWebGPUBuffer: null,
      sourceWebGLTexture: null,
      sourceTextureMeta: null,
      lastRenderedPositions: null,
      effectiveDurationMs: this._interpolationConfig.durationMs,
      layoutIntervalsMs: [],
    };
    this.scheduler.setRenderPump(({ timestamp }) => this._runInterpolationRenderPump(timestamp));
    if (options.prewarm === true) {
      this.prewarm();
    }
    this._layout = this._bindLayoutToHelios(this.createLayout(options.layout));
    this._enforcePositionSourcePolicy(this._layout, {
      resetInterpolation: false,
      requestRender: false,
      requestGeometry: false,
      requestLabels: false,
    });
    this.renderer = null;
    this.attributeTracker = null;
    this.indexPickingTracker = null;
    this._anyListeners = new Set();
    this._listenHandlers = new Map();
    this._pendingGraphLayerProps = new Map();
    this._pendingRendererProps = new Map();
    this._frameId = 0;
    this._lastRenderTime = performance.now();
    this.counters = {
      geometryFrames: 0,
      renderFrames: 0,
      attributeUpdateTicks: 0,
    };
    this._cameraMoveRaf = null;
    this._cameraTransitionController = null;
    const cameraControlOptions = options.camera ?? options.cameraControls ?? null;
    this._cameraControlConfig = normalizeCameraControlConfig(
      CAMERA_CONTROL_DEFAULTS,
      cameraControlOptions && typeof cameraControlOptions === 'object'
        ? cameraControlOptions
        : {},
    );
    this._cameraControlRuntime = {
      lastAutoFitAt: Number.NEGATIVE_INFINITY,
      lastOrbitAt: 0,
      lastFitSignature: '',
      lastEffectiveIntervalMs: this._cameraControlConfig.autoFitIntervalMs,
      autoFitDirty: false,
      delegateSnapshot: null,
      delegateSnapshotAt: Number.NEGATIVE_INFINITY,
      delegateSnapshotPending: false,
      delegateSnapshotDelegate: null,
      delegateSnapshotRequestId: 0,
      orbitBaseRotation: null,
      appliedOrbitAngle: this._cameraControlConfig.orbitAngle ?? 0,
      suspended: false,
      controlPoseActive: false,
      controlPoseFrom: null,
      controlPoseTo: null,
      controlPoseStartedAt: 0,
      controlPoseDurationMs: 0,
      controlPoseSignature: '',
    };
    this._picking = {
      node: { enabled: false, hoverEnabled: true },
      edge: { enabled: false, hoverEnabled: true },
      options: {
        resolutionScale: 0.5,
        trackDepth: false,
        maxFps: 30,
        clickRequiresStationary: true,
        clickMoveTolerancePx: 4,
        suppressClickAfterWheelMs: 200,
      },
      hover: { kind: null, index: -1, depth: null },
      pointer: { x: 0, y: 0, clientX: 0, clientY: 0, inside: false },
      suppressHover: false,
      cameraIdleTimer: null,
      hoverThrottleTimer: null,
      gesture: {
        active: false,
        startClientX: 0,
        startClientY: 0,
        moved: false,
        cameraMoved: false,
        wheelZoomed: false,
        lastWheelAt: -Infinity,
        lastCameraMoveAt: -Infinity,
      },
      _raf: null,
      _inFlight: false,
      _rerun: false,
      _lastPickTime: -Infinity,
    };
    this._pickingListenersAttached = false;
    this._boundPickingHandlers = {
      down: (event) => this._handlePointerDown(event),
      move: (event) => this._handlePointerMove(event),
      up: () => this._handlePointerUp(),
      cancel: () => this._handlePointerUp(),
      leave: () => this._handlePointerLeave(),
      wheel: (event) => this._handleWheel(event),
      click: (event) => this._handlePointerClick(event, false),
      dblclick: (event) => this._handlePointerClick(event, true),
    };
    this._pendingFrameNetwork = null;
    this._graphFilterState = this._graphFilterState ?? {
      enabled: false,
      scope: GRAPH_FILTER_SCOPE_RENDER,
      options: null,
      signature: null,
      nodeIndices: null,
      edgeIndices: null,
      nodeSelector: null,
      edgeSelector: null,
      filteredNetwork: null,
      renderNetwork: network,
      layoutNetwork: network,
      version: 0,
      stats: null,
      lastError: null,
    };
    this._activeHeliosFilter = null;
    this._stateStyleCache = {
      nodeSlots: new Map(),
      edgeSlots: new Map(),
      nodeNoState: null,
      edgeNoState: null,
    };
    const densityEnabled = options.density === true || options.densityEnabled === true;
    const densityScale = options.densityScale ?? options.densityQualityScale ?? DENSITY_DEFAULTS.qualityScale;
    const densityTopographic = options.topographic === true || options.densityTopographic === true;
    const densityScaleWithZoom = options.densityScaleWithZoom === true
      || options.densityScaleByZoom === true
      || options.scaleDensityWithZoom === true;
    const densityNormalizeVs = options.shallNormalizeVsDensity === true
      || options.vsDensityNormalize === true
      || options.densityNormalizeVs === true;
    const densityComparisonMode = typeof options.densityComparisonMode === 'string' && options.densityComparisonMode.trim()
      ? options.densityComparisonMode.trim()
      : DENSITY_DEFAULTS.comparisonMode;
    const initialCompareProperty = typeof options.vsDensityProperty === 'string' && options.vsDensityProperty.trim()
      ? options.vsDensityProperty.trim()
      : DENSITY_DEFAULTS.compareProperty;
    const initialProperty = typeof options.densityProperty === 'string' && options.densityProperty.trim()
      ? options.densityProperty.trim()
      : DENSITY_DEFAULTS.property;
    const sanitizedInitialCompareProperty = resolveDensityCompareProperty(initialProperty, initialCompareProperty);
    this._densityConfig = {
      ...DENSITY_DEFAULTS,
      enabled: densityEnabled,
      qualityScale: clamp(toFiniteNumber(densityScale, DENSITY_DEFAULTS.qualityScale), 0.03, 1.0),
      topographic: densityTopographic,
      scaleWithZoom: densityScaleWithZoom,
      property: initialProperty,
      compareProperty: sanitizedInitialCompareProperty,
      comparisonMode: resolveDensityComparisonMode(sanitizedInitialCompareProperty, densityComparisonMode),
      normalizeVs: densityNormalizeVs,
      epsilon: clamp(
        toFiniteNumber(options.densityEpsilon ?? options.densityLogRatioEpsilon, DENSITY_DEFAULTS.epsilon),
        1e-12,
        1,
      ),
      logRatioRange: clamp(
        toFiniteNumber(options.densityLogRatioRange, DENSITY_DEFAULTS.logRatioRange),
        1e-3,
        1e3,
      ),
      maskThreshold: clamp(
        toFiniteNumber(options.densityMaskThreshold, DENSITY_DEFAULTS.maskThreshold),
        0,
        1,
      ),
      logRatioSupportCorrection: options.densityLogRatioSupportCorrection !== false
        && options.logRatioSupportCorrection !== false,
      bandwidth: clamp(
        toFiniteNumber(options.densityBandwidth, DENSITY_DEFAULTS.bandwidth),
        0.05,
        1000,
      ),
      weightScale: clamp(
        toFiniteNumber(options.densityWeight, DENSITY_DEFAULTS.weightScale),
        0,
        1e8,
      ),
      colormap: typeof options.densityColormap === 'string' && options.densityColormap.trim()
        ? options.densityColormap.trim()
        : DENSITY_DEFAULTS.colormap,
      logRatioColormap: typeof options.densityLogRatioColormap === 'string' && options.densityLogRatioColormap.trim()
        ? options.densityLogRatioColormap.trim()
        : DENSITY_DEFAULTS.logRatioColormap,
      divergingColormap: typeof options.densityDivergingColormap === 'string' && options.densityDivergingColormap.trim()
        ? options.densityDivergingColormap.trim()
        : DENSITY_DEFAULTS.divergingColormap,
    };
    this._densityRuntime = { diverging: false, valueDomain: null };
    this._densityLayer = null;
    this._edgeAdaptiveQualityConfig = normalizeEdgeAdaptiveQualityConfig(
      EDGE_ADAPTIVE_QUALITY_DEFAULTS,
      options.edgeAdaptiveQuality ?? { enabled: options.edgeAdaptiveQualityEnabled },
    );
    this._edgeAdaptiveRuntime = {
      nextProbeAt: Number.NEGATIVE_INFINITY,
      lastRenderMs: null,
      qualityFrameSamples: [],
      qualityFrameAverageMs: null,
      fastFrameSamples: [],
      fastFrameAverageMs: null,
      activityActive: false,
      skipNextQualitySample: false,
      reason: this._edgeAdaptiveQualityConfig.enabled ? 'quality' : 'disabled',
      cameraMovingUntil: Number.NEGATIVE_INFINITY,
      cameraIdleTimer: null,
      probeTimer: null,
      failedProbeCount: 0,
      performanceFallbackAt: Number.NEGATIVE_INFINITY,
      performanceFallbackAlpha: NaN,
      forceHighQuality: false,
    };
    this._overlayInsets = { top: 0, right: 0, bottom: 0, left: 0 };
    this.densityMap = {
      setBandwidth: (value) => {
        this.densityBandwidth(value);
        return this.densityMap;
      },
      setKernelWeightScale: (value) => {
        this.densityWeight(value);
        return this.densityMap;
      },
      setColormap: (value) => {
        this.densityColormap(value);
        return this.densityMap;
      },
      divergingColormap: (enabled) => {
        if (enabled === undefined) return this.density().diverging;
        this._densityRuntime = { ...this._densityRuntime, diverging: enabled === true };
        this.requestRender();
        return this.densityMap;
      },
    };
    this._labels = new SvgLabelController(this, options.labels ?? {});
    this._legends = new SvgLegendController(this, options.legends ?? {});
    this.size = { ...this.layers.size };
    this.removeResizeListener = null;
    this.firstGeometryUpdateComplete = false;
    this.ready = this.initialize();
  }

  _snapshotCameraState() {
    const camera = this.renderer?.camera ?? null;
    return captureCameraPose(camera);
  }

  _restoreCameraState(state) {
    const camera = this.renderer?.camera ?? null;
    applyCameraPose(camera, state);
  }

  _ensureCameraTransitionController() {
    if (!this._cameraTransitionController) {
      this._cameraTransitionController = new CameraTransitionController({
        requestRender: () => this.scheduler?.requestRender?.(),
      });
    }
    return this._cameraTransitionController;
  }

  _cameraControlsSnapshot() {
    const config = copyCameraControlConfig(this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS);
    const activeTargetNodeIndices = this._resolveActiveCameraTargetNodeIndices();
    return {
      ...config,
      activeTargetNodeIndices,
      effectiveAutoFitIntervalMs: this._resolveCameraAutoFitIntervalMs(activeTargetNodeIndices?.length ?? null),
    };
  }

  _emitCameraControlChange() {
    this.emit(EVENTS.CAMERA_CONTROL_CHANGE, this._cameraControlsSnapshot());
  }

  _resolveActiveCameraTargetNodeIndices() {
    const targetNodeIndices = normalizeNodeIndexList(this._cameraControlConfig?.targetNodeIndices);
    return targetNodeIndices?.length ? targetNodeIndices : null;
  }

  _markAutoFitDirty(requestRender = false) {
    if (!this._cameraControlRuntime) return;
    this._cameraControlRuntime.autoFitDirty = true;
    this._cameraControlRuntime.lastAutoFitAt = Number.NEGATIVE_INFINITY;
    if (requestRender !== false) {
      this.scheduler?.requestRender?.();
    }
  }

  _handleResizeAutoFit() {
    const config = this._cameraControlConfig ?? null;
    if (config?.autoFit !== true) return;
    const cameraMode = this.renderer?.camera?.mode ?? null;
    if (cameraMode === '3d') return;
    this._markAutoFitDirty(false);
  }

  _resetCameraDelegateSnapshot() {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime) return;
    runtime.delegateSnapshot = null;
    runtime.delegateSnapshotAt = Number.NEGATIVE_INFINITY;
    runtime.delegateSnapshotPending = false;
    runtime.delegateSnapshotDelegate = null;
    runtime.delegateSnapshotRequestId = (runtime.delegateSnapshotRequestId ?? 0) + 1;
  }

  _invalidateCameraOrbitReference() {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime) return;
    runtime.orbitBaseRotation = null;
  }

  _composeOrbitRotation(baseRotation, options = {}) {
    const source = ArrayBuffer.isView(baseRotation) && baseRotation.length >= 4
      ? baseRotation
      : DEFAULT_MODE_SWITCH_3D_ROTATION;
    let nextRotation = new Float32Array(source);
    const yawRadians = Number.isFinite(options.yawRadians) ? Number(options.yawRadians) : 0;
    const pitchRadians = Number.isFinite(options.pitchRadians) ? Number(options.pitchRadians) : 0;

    if (Math.abs(yawRadians) > 1e-12) {
      const yaw = quatFromAxisAngle([0, 1, 0], yawRadians);
      const rotated = new Float32Array(4);
      quatMultiplyInto(rotated, yaw, nextRotation);
      nextRotation = rotated;
    }
    if (Math.abs(pitchRadians) > 1e-12) {
      const pitch = quatFromAxisAngle([1, 0, 0], pitchRadians);
      const rotated = new Float32Array(4);
      quatMultiplyInto(rotated, nextRotation, pitch);
      nextRotation = rotated;
    }
    quatNormalizeInto(nextRotation, nextRotation);
    return nextRotation;
  }

  _resolveCameraPositionView(options = {}) {
    const runtime = this._cameraControlRuntime ?? null;
    const positionSource = this._positionsConfig ?? { source: 'network', delegate: null };
    if (positionSource.source !== 'delegate') {
      return { source: 'network', view: null };
    }

    const delegate = positionSource.delegate ?? this._activePositionDelegate ?? null;
    if (!delegate) return { source: 'delegate', view: null };

    const context = this._buildPositionDelegateContext(options);
    let view = null;
    try {
      if (typeof delegate.getNodePositionView === 'function') {
        view = delegate.getNodePositionView(context);
      } else if (typeof delegate.getPositionView === 'function') {
        view = delegate.getPositionView(context);
      }
    } catch (_) {
      view = null;
    }
    if (view && Number.isFinite(view.length) && view.length > 0) {
      return { source: 'delegate-view', view };
    }

    this._scheduleCameraDelegateSnapshot(delegate, options);
    if (runtime?.delegateSnapshotDelegate === delegate && runtime.delegateSnapshot && runtime.delegateSnapshot.length > 0) {
      return { source: 'delegate-snapshot', view: runtime.delegateSnapshot };
    }
    return { source: 'delegate', view: null };
  }

  _scheduleCameraDelegateSnapshot(delegate, options = {}) {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime || !delegate || typeof this.snapshotDelegatePositions !== 'function') return;
    if (runtime.delegateSnapshotPending && runtime.delegateSnapshotDelegate === delegate) return;

    const now = performance.now();
    const nodeCount = this._resolveActiveCameraTargetNodeIndices()?.length ?? this._getRenderNetwork()?.nodeCount ?? 0;
    const minIntervalMs = clamp(this._resolveCameraAutoFitIntervalMs(nodeCount) * 0.5, 120, 2000);
    if (
      runtime.delegateSnapshotDelegate === delegate
      && Number.isFinite(runtime.delegateSnapshotAt)
      && (now - runtime.delegateSnapshotAt) < minIntervalMs
    ) {
      return;
    }

    runtime.delegateSnapshotPending = true;
    runtime.delegateSnapshotDelegate = delegate;
    const requestId = (runtime.delegateSnapshotRequestId ?? 0) + 1;
    runtime.delegateSnapshotRequestId = requestId;

    Promise.resolve()
      .then(() => this.snapshotDelegatePositions({ ...options, delegate }))
      .then((snapshot) => {
        if (runtime.delegateSnapshotRequestId !== requestId || runtime.delegateSnapshotDelegate !== delegate) return;
        if (snapshot && Number.isFinite(snapshot.length) && snapshot.length > 0) {
          runtime.delegateSnapshot = snapshot;
          runtime.delegateSnapshotAt = performance.now();
          this._markAutoFitDirty(false);
          this.scheduler?.requestRender?.();
          this._tryPendingFrameNetwork?.();
        }
      })
      .catch(() => {})
      .finally(() => {
        if (runtime.delegateSnapshotRequestId === requestId && runtime.delegateSnapshotDelegate === delegate) {
          runtime.delegateSnapshotPending = false;
        }
      });
  }

  _sampleRenderBoundsFromPositions(positions, nodeIndices, options = {}) {
    if (!positions || !Number.isFinite(positions.length) || positions.length <= 0) return null;
    const coverage = clamp(Number.isFinite(options.coverage) ? Number(options.coverage) : 1, 0.5, 1);
    const paddingRatio = normalizeNonNegativeNumber(options.paddingRatio, 0, 0, 1);
    const viewportWidth = Math.max(1, Number(this.renderer?.camera?.viewport?.width ?? this.size?.width ?? 1));
    const viewportHeight = Math.max(1, Number(this.renderer?.camera?.viewport?.height ?? this.size?.height ?? 1));
    const ratioPaddingPx = Math.min(viewportWidth, viewportHeight) * paddingRatio;
    const paddingPx = Number.isFinite(options.paddingPx)
      ? Math.max(0, Number(options.paddingPx))
      : Math.max(24, ratioPaddingPx);
    const maxSamples = normalizePositiveInteger(options.maxSamples, CAMERA_FIT_DEFAULT_MAX_SAMPLES, 32, 1000000);
    const stride = 3;
    const step = Math.max(1, Math.ceil(nodeIndices.length / Math.max(1, maxSamples)));

    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    let sumX = 0; let sumY = 0; let sumZ = 0;
    let count = 0;
    let found = false;
    const sampleX = coverage < 0.999999 ? [] : null;
    const sampleY = coverage < 0.999999 ? [] : null;
    const sampleZ = coverage < 0.999999 ? [] : null;

    for (let i = 0; i < nodeIndices.length; i += step) {
      const id = nodeIndices[i];
      const o = id * stride;
      if ((o + 2) >= positions.length) continue;
      const x = positions[o];
      const y = positions[o + 1];
      const z = positions[o + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      found = true;
      sumX += x; sumY += y; sumZ += z;
      count += 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      if (sampleX) {
        sampleX.push(x);
        sampleY.push(y);
        sampleZ.push(z);
      }
    }
    if (!found) return null;

    let fitMinX = minX; let fitMinY = minY; let fitMinZ = minZ;
    let fitMaxX = maxX; let fitMaxY = maxY; let fitMaxZ = maxZ;
    if (sampleX?.length >= 4) {
      const trim = (1 - coverage) * 0.5;
      sampleX.sort((a, b) => a - b);
      sampleY.sort((a, b) => a - b);
      sampleZ.sort((a, b) => a - b);
      fitMinX = quantileFromSorted(sampleX, trim);
      fitMaxX = quantileFromSorted(sampleX, 1 - trim);
      fitMinY = quantileFromSorted(sampleY, trim);
      fitMaxY = quantileFromSorted(sampleY, 1 - trim);
      fitMinZ = quantileFromSorted(sampleZ, trim);
      fitMaxZ = quantileFromSorted(sampleZ, 1 - trim);
    }

    const bboxCx = (fitMinX + fitMaxX) * 0.5;
    const bboxCy = (fitMinY + fitMaxY) * 0.5;
    const bboxCz = (fitMinZ + fitMaxZ) * 0.5;
    const centroid = [
      count > 0 ? (sumX / count) : bboxCx,
      count > 0 ? (sumY / count) : bboxCy,
      count > 0 ? (sumZ / count) : bboxCz,
    ];
    return {
      paddingPx,
      coverage,
      sourceCount: nodeIndices.length,
      sampledCount: count,
      minX,
      minY,
      minZ,
      maxX,
      maxY,
      maxZ,
      fitMinX,
      fitMinY,
      fitMinZ,
      fitMaxX,
      fitMaxY,
      fitMaxZ,
      sumX,
      sumY,
      sumZ,
      count,
      bboxCenter: [bboxCx, bboxCy, bboxCz],
      centroid,
    };
  }

  _resolveCameraAutoFitIntervalMs(nodeCount = null) {
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    const baseInterval = normalizeNonNegativeNumber(
      config.autoFitIntervalMs,
      CAMERA_CONTROL_DEFAULTS.autoFitIntervalMs,
      0,
      60000,
    );
    const minInterval = normalizeNonNegativeNumber(
      config.autoFitMinIntervalMs,
      CAMERA_CONTROL_DEFAULTS.autoFitMinIntervalMs,
      0,
      60000,
    );
    const maxInterval = normalizeNonNegativeNumber(
      config.autoFitMaxIntervalMs,
      CAMERA_CONTROL_DEFAULTS.autoFitMaxIntervalMs,
      minInterval,
      60000,
    );
    const scaleStrength = normalizeNonNegativeNumber(
      config.autoFitLargeNetworkScale,
      CAMERA_CONTROL_DEFAULTS.autoFitLargeNetworkScale,
      0,
      32,
    );
    const countRef = normalizePositiveInteger(
      config.autoFitIntervalNodeCountRef,
      CAMERA_CONTROL_DEFAULTS.autoFitIntervalNodeCountRef,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const resolvedNodeCount = Math.max(1, Number.isFinite(nodeCount) ? Math.floor(nodeCount) : Math.floor(this._getRenderNetwork()?.nodeCount ?? 1));
    const intervalScale = scaleStrength <= 0
      ? 1
      : Math.max(1, Math.pow(resolvedNodeCount / countRef, 0.5) * scaleStrength);
    const interval = clamp(baseInterval * intervalScale, minInterval, maxInterval);
    if (this._cameraControlRuntime) {
      this._cameraControlRuntime.lastEffectiveIntervalMs = interval;
    }
    return interval;
  }

  _disableAutomaticCameraControlFromInteraction(detail = null) {
    const config = this._cameraControlConfig ?? null;
    if (!config) return false;
    this._invalidateCameraOrbitReference();
    let changed = false;
    const action = detail?.action ?? null;
    if (config.autoFit === true && (action === 'pan' || action === 'zoom' || action === 'dolly')) {
      config.autoFit = false;
      changed = true;
    }
    if (config.orbit === true && action !== 'zoom' && action !== 'dolly') {
      config.orbit = false;
      changed = true;
    }
    if (changed) {
      this._markAutoFitDirty(false);
      this._emitCameraControlChange();
      this.scheduler?.requestRender?.();
    }
    return changed;
  }

  _sampleRenderBounds(options = {}) {
    const network = this._getRenderNetwork();
    const requestedNodeIndices = normalizeNodeIndexList(options.nodeIndices);
    if (requestedNodeIndices?.length) {
      const resolved = this._resolveCameraPositionView(options);
      if (resolved?.source === 'network') {
        return this._withPositionBufferAccess(() => {
          const positions = this._readNodePositionViewUnsafe();
          return this._sampleRenderBoundsFromPositions(positions, requestedNodeIndices, options);
        });
      }
      if (!resolved?.view) return null;
      return this._sampleRenderBoundsFromPositions(resolved.view, requestedNodeIndices, options);
    }

    const resolved = this._resolveCameraPositionView(options);
    if (resolved?.source === 'network') {
      return this._withPositionBufferAccess(() => {
        const positions = this._readNodePositionViewUnsafe();
        const nodeIndices = network?.nodeIndices ?? null;
        return this._sampleRenderBoundsFromPositions(positions, nodeIndices, options);
      });
    }
    let nodeIndices = null;
    this._withPositionBufferAccess(() => {
      const active = network?.nodeIndices ?? null;
      if (!active?.length) return;
      nodeIndices = ArrayBuffer.isView(active)
        ? new Uint32Array(active)
        : Array.from(active);
    });
    if (!nodeIndices?.length || !resolved?.view) return null;
    return this._sampleRenderBoundsFromPositions(resolved.view, nodeIndices, options);
  }

  _resolveCameraFocusPose(bounds, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current || !bounds) return null;
    const focusMode = options.focusMode === 'centroid' ? 'centroid' : 'bbox';
    const center = focusMode === 'centroid'
      ? copyVec3(bounds.centroid ?? bounds.bboxCenter ?? [0, 0, 0], 0)
      : copyVec3(bounds.bboxCenter ?? bounds.centroid ?? [0, 0, 0], 0);
    if (camera.mode === '2d') {
      return mergeCameraPose(current, {
        mode: '2d',
        projection: 'orthographic',
        target: new Float32Array(center),
        pan3D: new Float32Array([0, 0, 0]),
        pan2D: new Float32Array([
          -center[0] * current.zoom,
          -center[1] * current.zoom,
          0,
        ]),
      });
    }
    return mergeCameraPose(current, {
      mode: '3d',
      target: new Float32Array(center),
      pan3D: new Float32Array([0, 0, 0]),
    });
  }

  _resolveCameraFitPose(bounds, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current || !bounds) return null;

    const focusMode = options.focusMode === 'centroid' ? 'centroid' : 'bbox';
    const center = focusMode === 'centroid'
      ? copyVec3(bounds.centroid ?? bounds.bboxCenter ?? [0, 0, 0], 0)
      : copyVec3(bounds.bboxCenter ?? bounds.centroid ?? [0, 0, 0], 0);
    const fitWidth = Math.max(1e-6, bounds.fitMaxX - bounds.fitMinX);
    const fitHeight = Math.max(1e-6, bounds.fitMaxY - bounds.fitMinY);
    const fitDepth = Math.max(1e-6, bounds.fitMaxZ - bounds.fitMinZ);

    if (camera.mode === '2d') {
      const viewportW = Math.max(1, camera.viewport?.width ?? this.size?.width ?? 1);
      const viewportH = Math.max(1, camera.viewport?.height ?? this.size?.height ?? 1);
      const availW = Math.max(1, viewportW - bounds.paddingPx * 2);
      const availH = Math.max(1, viewportH - bounds.paddingPx * 2);
      const zoomX = availW / fitWidth;
      const zoomY = availH / fitHeight;
      const nextZoom = Math.min(zoomX, zoomY);
      const clampedZoom = Math.min(camera.maxZoom ?? nextZoom, Math.max(camera.minZoom ?? nextZoom, nextZoom));
      return mergeCameraPose(current, {
        mode: '2d',
        projection: 'orthographic',
        target: new Float32Array(center),
        pan3D: new Float32Array([0, 0, 0]),
        pan2D: new Float32Array([
          -center[0] * clampedZoom,
          -center[1] * clampedZoom,
          0,
        ]),
        zoom: clampedZoom,
      });
    }

    const radius = 0.5 * Math.hypot(fitWidth, fitHeight, fitDepth);
    const fovRad = (Number.isFinite(camera.fov) ? camera.fov : 60) * (Math.PI / 180);
    const distPerspective = radius / Math.max(1e-3, Math.tan(fovRad * 0.5));
    const desired = camera.projection === 'orthographic' ? radius * 1.2 : distPerspective * 1.25;
    const distance = Math.min(camera.maxDistance ?? desired, Math.max(camera.minDistance ?? desired, desired));
    const resetOrientation = options.resetOrientation === true;
    return mergeCameraPose(current, {
      mode: '3d',
      target: new Float32Array(center),
      pan3D: new Float32Array([0, 0, 0]),
      pan2D: resetOrientation ? new Float32Array([0, 0, 0]) : current.pan2D,
      distance,
      rotation: resetOrientation
        ? new Float32Array(DEFAULT_MODE_SWITCH_3D_ROTATION)
        : current.rotation,
    });
  }

  _applyCameraPoseWithOptionalAnimation(nextPose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current || !nextPose) return false;
    const animate = options.animate === true;
    const durationMs = normalizeNonNegativeNumber(
      options.durationMs,
      this._cameraControlConfig?.animationDurationMs ?? CAMERA_CONTROL_DEFAULTS.animationDurationMs,
      0,
      60000,
    );
    if (animate && durationMs > 0) {
      this._ensureCameraTransitionController().transition(camera, {
        fromPose: current,
        toPose: nextPose,
        durationMs,
      });
    } else {
      applyCameraPose(camera, nextPose);
      this.scheduler?.requestRender?.();
    }
    return true;
  }

  _cameraPoseSignature(pose) {
    if (!pose) return '';
    return JSON.stringify([
      pose.mode,
      pose.projection,
      Number(pose.zoom ?? 0).toFixed(6),
      Number(pose.distance ?? 0).toFixed(6),
      ...(Array.from(pose.target ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.pan2D ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.pan3D ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.rotation ?? []).map((value) => Number(value).toFixed(6))),
    ]);
  }

  _cameraFitSignature(pose) {
    if (!pose) return '';
    return JSON.stringify([
      pose.mode,
      pose.projection,
      Number(pose.zoom ?? 0).toFixed(6),
      Number(pose.distance ?? 0).toFixed(6),
      ...(Array.from(pose.target ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.pan2D ?? []).map((value) => Number(value).toFixed(6))),
      ...(Array.from(pose.pan3D ?? []).map((value) => Number(value).toFixed(6))),
    ]);
  }

  _stopCameraControlPoseInterpolation() {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime) return;
    runtime.controlPoseActive = false;
    runtime.controlPoseFrom = null;
    runtime.controlPoseTo = null;
    runtime.controlPoseStartedAt = 0;
    runtime.controlPoseDurationMs = 0;
    runtime.controlPoseSignature = '';
  }

  _resolveCameraControlPoseInterpolation(timestamp = performance.now()) {
    const runtime = this._cameraControlRuntime ?? null;
    if (!runtime || runtime.controlPoseActive !== true || !runtime.controlPoseFrom || !runtime.controlPoseTo) {
      return { pose: null, active: false, changed: false };
    }
    const durationMs = Math.max(0, Number(runtime.controlPoseDurationMs) || 0);
    if (durationMs <= 0) {
      const pose = runtime.controlPoseTo;
      runtime.controlPoseActive = false;
      runtime.controlPoseFrom = null;
      runtime.controlPoseTo = null;
      return { pose, active: false, changed: true };
    }
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const t = clamp((now - runtime.controlPoseStartedAt) / durationMs, 0, 1);
    const pose = interpolateCameraPose(runtime.controlPoseFrom, runtime.controlPoseTo, t);
    if (t >= 1) {
      const completedPose = runtime.controlPoseTo;
      runtime.controlPoseActive = false;
      runtime.controlPoseFrom = null;
      runtime.controlPoseTo = null;
      return { pose: completedPose ?? pose, active: false, changed: true };
    }
    return { pose, active: true, changed: true };
  }

  _queueCameraControlPose(nextPose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    const runtime = this._cameraControlRuntime ?? null;
    if (!camera || !runtime || !nextPose) return false;
    const signature = this._cameraPoseSignature(nextPose);
    const animate = options.animate === true;
    const durationMs = normalizeNonNegativeNumber(
      options.durationMs,
      this._cameraControlConfig?.animationDurationMs ?? CAMERA_CONTROL_DEFAULTS.animationDurationMs,
      0,
      60000,
    );
    if (signature === runtime.controlPoseSignature && runtime.controlPoseActive === (animate && durationMs > 0)) {
      return false;
    }
    if (!(animate && durationMs > 0)) {
      this._stopCameraControlPoseInterpolation();
      runtime.controlPoseSignature = signature;
      applyCameraPose(camera, nextPose);
      this.scheduler?.requestRender?.();
      return true;
    }
    runtime.controlPoseActive = true;
    runtime.controlPoseFrom = captureCameraPose(camera);
    runtime.controlPoseTo = nextPose;
    runtime.controlPoseStartedAt = performance.now();
    runtime.controlPoseDurationMs = durationMs;
    runtime.controlPoseSignature = signature;
    this.scheduler?.requestRender?.();
    return true;
  }

  _stepCameraControlPoseInterpolation(timestamp = performance.now()) {
    const camera = this.renderer?.camera ?? null;
    if (!camera) return false;
    const resolved = this._resolveCameraControlPoseInterpolation(timestamp);
    if (!resolved.pose) return false;
    applyCameraPose(camera, resolved.pose);
    return resolved.active === true;
  }

  _stepCameraControlRenderPump(timestamp = performance.now()) {
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const camera = this.renderer?.camera ?? null;
    const config = this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS;
    const runtime = this._cameraControlRuntime ?? null;
    if (!camera || !runtime) return false;
    if (runtime.suspended === true) return false;

    if (config.autoFit === true && runtime.autoFitDirty === true) {
      const activeTargetNodeIndices = this._resolveActiveCameraTargetNodeIndices();
      const nodeCount = activeTargetNodeIndices?.length ?? this._getRenderNetwork()?.nodeCount ?? 0;
      const effectiveIntervalMs = this._resolveCameraAutoFitIntervalMs(nodeCount);
      if (!Number.isFinite(runtime.lastAutoFitAt) || (now - runtime.lastAutoFitAt) >= effectiveIntervalMs) {
        runtime.lastAutoFitAt = now;
        const sampledBounds = this._sampleRenderBounds({
          nodeIndices: activeTargetNodeIndices,
          coverage: config.autoFitCoverage,
          paddingRatio: config.autoFitPaddingRatio,
          maxSamples: config.autoFitMaxSamples,
        });
        if (!sampledBounds) {
          runtime.autoFitDirty = nodeCount > 0;
        } else {
          const fitPose = this._resolveCameraFitPose(sampledBounds, {
            resetOrientation: false,
            focusMode: activeTargetNodeIndices?.length ? 'centroid' : 'bbox',
          });
          const fitSignature = this._cameraFitSignature(fitPose);
          const currentFitSignature = this._cameraFitSignature(captureCameraPose(camera));
          if (fitSignature) {
            runtime.lastFitSignature = fitSignature;
          }
          runtime.autoFitDirty = false;
          if (fitSignature && fitPose && fitSignature !== currentFitSignature) {
            this._queueCameraControlPose(fitPose, {
              animate: config.animation,
              durationMs: config.animationDurationMs,
            });
          }
        }
      }
    }

    const interpolated = this._resolveCameraControlPoseInterpolation(now);
    let finalPose = interpolated.pose ?? captureCameraPose(camera);
    let wantsRender = interpolated.active === true;
    if (!finalPose) return wantsRender;

    if (camera.mode === '3d') {
      const lastOrbitAt = Number.isFinite(runtime.lastOrbitAt) && runtime.lastOrbitAt > 0 ? runtime.lastOrbitAt : now;
      const deltaMs = Math.max(0, now - lastOrbitAt);
      const deltaSeconds = Math.max(0, Math.min(0.1, deltaMs / 1000));
      runtime.lastOrbitAt = now;

      const previousOrbitAngle = clamp(
        toFiniteNumber(runtime.appliedOrbitAngle, config.orbitAngle ?? 0),
        -89,
        89,
      );
      const targetOrbitAngle = clamp(toFiniteNumber(config.orbitAngle, previousOrbitAngle), -89, 89);
      let nextOrbitAngle = targetOrbitAngle;
      if (config.animation === true) {
        const durationMs = normalizeNonNegativeNumber(
          config.animationDurationMs,
          CAMERA_CONTROL_DEFAULTS.animationDurationMs,
          0,
          60000,
        );
        if (durationMs > 0 && deltaMs > 0) {
          const tauMs = Math.max(1, durationMs / 4);
          const alpha = 1 - Math.exp(-deltaMs / tauMs);
          nextOrbitAngle = previousOrbitAngle + ((targetOrbitAngle - previousOrbitAngle) * clamp(alpha, 0, 1));
        }
      }
      runtime.appliedOrbitAngle = nextOrbitAngle;

      const pitchRadians = (nextOrbitAngle - previousOrbitAngle) * (Math.PI / 180);
      const yawRadians = config.orbit === true && deltaSeconds > 0 && config.orbitSpeed > 0
        ? (Math.PI * 2) * config.orbitSpeed * config.orbitDirection * deltaSeconds
        : 0;
      if (Math.abs(yawRadians) > 1e-12 || Math.abs(pitchRadians) > 1e-12) {
        finalPose = mergeCameraPose(finalPose, {
          rotation: this._composeOrbitRotation(finalPose.rotation, {
            yawRadians,
            pitchRadians,
          }),
        });
        wantsRender = true;
      }
    } else {
      runtime.lastOrbitAt = now;
      runtime.appliedOrbitAngle = clamp(toFiniteNumber(config.orbitAngle, 0), -89, 89);
    }

    if (interpolated.changed === true || wantsRender) {
      applyCameraPose(camera, finalPose);
    }

    return wantsRender;
  }

  _collapseNodeDepthTo2DPlane(zValue = 0) {
    const targetZ = Number.isFinite(zValue) ? zValue : 0;
    let changed = false;
    this._withPositionBufferAccess(() => {
      const positions = this._readNodePositionViewUnsafe();
      if (!positions?.length) return;
      for (let offset = 0; offset < positions.length; offset += 3) {
        if (!Number.isFinite(positions[offset + 2])) continue;
        if (Math.abs(positions[offset + 2] - targetZ) <= 1e-9) continue;
        positions[offset + 2] = targetZ;
        changed = true;
      }
    });

    if (changed) {
      this.visuals?.markPositionsDirty?.();
    }
    return changed;
  }

  async _collapseDelegateDepthTo2DPlane(delegate, zValue = 0) {
    if (!delegate || typeof delegate.flattenNodeDepthToPlane !== 'function') return false;
    try {
      return (await delegate.flattenNodeDepthToPlane(
        this._buildPositionDelegateContext({ reason: 'mode-switch' }),
        zValue,
      )) === true;
    } catch (error) {
      console.warn('Helios.setMode(): failed to collapse delegate depth while switching to 2D.', error);
      return false;
    }
  }

  async _collapseActivePositionDepthTo2DPlane(zValue = 0, delegate = null) {
    const collapsedNetwork = this._collapseNodeDepthTo2DPlane(zValue);
    const collapsedDelegate = await this._collapseDelegateDepthTo2DPlane(delegate, zValue);
    if (collapsedDelegate) {
      this.visuals?.markPositionsDirty?.();
    }
    if (collapsedNetwork || collapsedDelegate) {
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
    }
    return collapsedNetwork || collapsedDelegate;
  }

  _build3DModeTransitionPoses(bounds, projection = 'perspective') {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current) return null;

    const centerZ = Number.isFinite(bounds?.sumZ) && Number.isFinite(bounds?.count) && bounds.count > 0
      ? (bounds.sumZ / bounds.count)
      : 0;
    const startCenter = current.mode === '3d'
      ? resolve3DCenterFromPose(current)
      : resolve2DCenterFromPose(current, centerZ);
    const startDistance = current.mode === '3d'
      ? Math.max(camera.minDistance ?? 10, current.distance)
      : clamp(
        estimate3DDistanceFrom2DZoom(current),
        camera.minDistance ?? 10,
        camera.maxDistance ?? 25000,
      );

    const startPose = {
      ...current,
      mode: '3d',
      projection,
      target: new Float32Array(startCenter),
      pan3D: new Float32Array([0, 0, 0]),
      pan2D: copyVec3(current.pan2D),
      distance: startDistance,
      rotation: current.mode === '3d'
        ? current.rotation
        : new Float32Array([0, 0, 0, 1]),
    };

    const targetDistance = bounds
      ? (() => {
        const w = Math.max(1e-6, bounds.maxX - bounds.minX);
        const h = Math.max(1e-6, bounds.maxY - bounds.minY);
        const dz = Math.max(1e-6, bounds.maxZ - bounds.minZ);
        const radius = 0.5 * Math.hypot(w, h, dz);
        const fovRad = (Number.isFinite(current.fov) ? current.fov : 60) * (Math.PI / 180);
        const distPerspective = radius / Math.max(1e-3, Math.tan(fovRad * 0.5));
        const desired = projection === 'orthographic' ? radius * 1.2 : distPerspective * 1.25;
        return clamp(
          desired,
          camera.minDistance ?? desired,
          camera.maxDistance ?? desired,
        );
      })()
      : startDistance;
    const targetCenter = bounds
      ? [
        Number.isFinite(bounds.sumX) && bounds.count > 0 ? (bounds.sumX / bounds.count) : startCenter[0],
        Number.isFinite(bounds.sumY) && bounds.count > 0 ? (bounds.sumY / bounds.count) : startCenter[1],
        centerZ,
      ]
      : startCenter;

    return {
      startPose,
      endPose: {
        ...startPose,
        target: new Float32Array(targetCenter),
        pan3D: new Float32Array([0, 0, 0]),
        distance: targetDistance,
        rotation: new Float32Array(DEFAULT_MODE_SWITCH_3D_ROTATION),
        pan2D: new Float32Array([0, 0, 0]),
      },
    };
  }

  _build2DModeTransitionPoses(bounds) {
    const camera = this.renderer?.camera ?? null;
    const current = captureCameraPose(camera);
    if (!camera || !current) return null;

    const source3D = current.mode === '3d'
      ? current
      : this._build3DModeTransitionPoses(bounds, 'perspective')?.endPose ?? null;
    if (!source3D) return null;

    const center = bounds
      ? [
        Number.isFinite(bounds.sumX) && bounds.count > 0 ? (bounds.sumX / bounds.count) : resolve3DCenterFromPose(source3D)[0],
        Number.isFinite(bounds.sumY) && bounds.count > 0 ? (bounds.sumY / bounds.count) : resolve3DCenterFromPose(source3D)[1],
        Number.isFinite(bounds.sumZ) && bounds.count > 0 ? (bounds.sumZ / bounds.count) : resolve3DCenterFromPose(source3D)[2],
      ]
      : resolve3DCenterFromPose(source3D);

    const zoom = bounds
      ? (() => {
        const w = Math.max(1e-6, bounds.maxX - bounds.minX);
        const h = Math.max(1e-6, bounds.maxY - bounds.minY);
        const viewportW = Math.max(1, current.viewport?.width ?? this.size?.width ?? 1);
        const viewportH = Math.max(1, current.viewport?.height ?? this.size?.height ?? 1);
        const availW = Math.max(1, viewportW - 48);
        const availH = Math.max(1, viewportH - 48);
        return clamp(
          Math.min(availW / w, availH / h),
          camera.minZoom ?? 0.001,
          camera.maxZoom ?? 10,
        );
      })()
      : clamp(
        estimate2DZoomFrom3DDistance(source3D),
        camera.minZoom ?? 0.001,
        camera.maxZoom ?? 10,
      );

    const matchedPerspectiveDistance = clamp(
      estimate3DDistanceFrom2DZoom({
        ...current,
        zoom,
      }),
      camera.minDistance ?? 10,
      camera.maxDistance ?? 25000,
    );

    const pre2D3D = {
      ...source3D,
      mode: '3d',
      projection: 'perspective',
      target: new Float32Array(center),
      pan3D: new Float32Array([0, 0, 0]),
      distance: matchedPerspectiveDistance,
      rotation: new Float32Array([0, 0, 0, 1]),
    };

    return {
      startPose: source3D,
      pre2D3D,
      start2DPose: {
        ...pre2D3D,
        mode: '2d',
        projection: 'orthographic',
        target: new Float32Array(center),
        pan3D: new Float32Array([0, 0, 0]),
        pan2D: new Float32Array([
          -center[0] * zoom,
          -center[1] * zoom,
          0,
        ]),
        zoom,
        rotation: new Float32Array([0, 0, 0, 1]),
      },
      endPose: {
        ...current,
        mode: '2d',
        projection: 'orthographic',
        target: new Float32Array(center),
        pan3D: new Float32Array([0, 0, 0]),
        pan2D: new Float32Array([
          -center[0] * zoom,
          -center[1] * zoom,
          0,
        ]),
        zoom,
        rotation: new Float32Array([0, 0, 0, 1]),
      },
    };
  }

  _applyModeToLayoutOptions(mode) {
    const layoutOption = this.options?.layout ?? null;
    if (!layoutOption || isLayoutInstance(layoutOption) || typeof layoutOption !== 'object') return;
    const nextMode = mode === '3d' ? '3d' : '2d';
    layoutOption.options = { ...(layoutOption.options ?? {}) };
    if (
      layoutOption.type === 'gpu-force'
      || layoutOption.type === 'gpuforce'
      || layoutOption.type === 'worker'
      || layoutOption.type === 'd3force3d'
      || layoutOption.type === 'd3-force-3d'
    ) {
      layoutOption.options.mode = nextMode;
    }
    if (layoutOption.type === 'd3force3d' || layoutOption.type === 'd3-force-3d') {
      layoutOption.options.settings = {
        ...(layoutOption.options.settings ?? {}),
        use2D: nextMode !== '3d',
      };
    }
  }

  _applyModeToActiveLayout(mode) {
    const layout = this._layout ?? null;
    const nextMode = mode === '3d' ? '3d' : '2d';
    if (!layout || typeof layout !== 'object') return false;
    if (layout instanceof D3Force3DLayout) {
      layout.setSettings?.({ mode: nextMode, use2D: nextMode !== '3d' });
      return true;
    }
    if (layout instanceof GpuForceLayout || layout instanceof WorkerLayout) {
      layout.setSettings?.({ mode: nextMode });
      return true;
    }
    if (typeof layout.setSettings === 'function') {
      layout.setSettings({ mode: nextMode });
      return true;
    }
    return false;
  }

  async _createRendererAndTrackers(options = {}) {
    const extraStateSlotsRaw = this.options.extraStateSlots ?? 1;
    const extraStateSlots = Number.isFinite(extraStateSlotsRaw) ? Math.max(0, Math.floor(extraStateSlotsRaw)) : 1;
    const stateSlots = Math.min(32, 3 + extraStateSlots);
    const renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
      forceWebGPU: this.options.renderer === 'webgpu',
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      suppressBrowserGestures: this.options.suppressBrowserGestures !== false,
      antialias: this.options.antialias,
      supersampling: this.options.supersampling,
      forceSupersample: this.options.forceSupersample,
      supersamplingAutoFactor: this.options.supersamplingAutoFactor,
      supersamplingAutoThreshold: this.options.supersamplingAutoThreshold,
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
      edgeEndpointTrim: this.options.edgeEndpointTrim,
      nodeBlendWithEdges: this.options.nodeBlendWithEdges,
      edgeDepthWrite: this.options.edgeDepthWrite,
      edgeFastRendering: this.options.edgeFastRendering,
      stateSlots,
      ...options,
    });
    this.renderer = renderer;
    this._applyPendingRendererProps();
    this._applyPositionPipelineToRenderer();
    this._attachDensityLayer();
    this._refreshUIBindings();
    this._applyCachedStateStyles();
    this.attributeTracker?.destroy?.();
    this.attributeTracker = new AttributeTracker(this.renderer);
    this.attributeTracker.resize(this.layers.size);
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
    }
    if (this.mappersDirty) {
      this._applyMappersSafely();
    }
    if (this.renderer?.camera?.setChangeListener) {
      this.renderer.camera.setChangeListener((detail) => {
        this.scheduler.requestRender();
        if (detail?.origin === 'interaction') {
          this._disableAutomaticCameraControlFromInteraction(detail);
        }
        this._scheduleCameraMove();
        this.debug.log('helios', 'Camera change requested render');
      });
    }
    this._applyPickingConfig();
    this._labels?.requestFullReselect?.('renderer-created');
  }

  _resetMappersToDefault(network = this.network) {
    const defaults = createDefaultMappers(network);
    this.nodeMapper = new MapperCollection('node', network, this.markMappersDirty, this.debug);
    this.edgeMapper = new MapperCollection('edge', network, this.markMappersDirty, this.debug);
    if (defaults?.nodeMapper) this.nodeMapper.setDefault(defaults.nodeMapper);
    if (defaults?.edgeMapper) this.edgeMapper.setDefault(defaults.edgeMapper);
    this.mappersDirty = true;
  }

  _applyMappersSafely() {
    if (!this.mappersDirty) return true;
    if (!this.visuals) return false;
    try {
      const nodeMapper = this.nodeMapper.toCombinedMapper();
      const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
      this.visuals.applyMappers({ nodeMapper, edgeMapper });
      this.mappersDirty = false;
      return true;
    } catch (error) {
      this.debug?.log?.('mapper', 'Failed to apply mappers; falling back to defaults', {
        error,
        nodeCount: this.network?.nodeCount ?? 0,
        edgeCount: this.network?.edgeCount ?? 0,
      });
      console.warn('Helios: failed to apply active mappers; falling back to default mappers.', error);
      try {
        this._resetMappersToDefault(this.network);
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
        return true;
      } catch (fallbackError) {
        // Last resort: avoid crashing the scheduler loop.
        this.mappersDirty = false;
        console.warn('Helios: failed to apply default mappers after fallback.', fallbackError);
        // eslint-disable-next-line no-console
        console.error('Failed to apply default mappers after fallback', fallbackError);
        return false;
      }
    }
  }

  _ensureGraphFilterState() {
    if (this._graphFilterState) return this._graphFilterState;
    const baseNetwork = this.network ?? null;
    this._graphFilterState = {
      enabled: false,
      scope: GRAPH_FILTER_SCOPE_RENDER,
      options: null,
      signature: null,
      nodeIndices: null,
      edgeIndices: null,
      nodeSelector: null,
      edgeSelector: null,
      filteredNetwork: null,
      renderNetwork: baseNetwork,
      layoutNetwork: baseNetwork,
      version: 0,
      stats: null,
      lastError: null,
    };
    return this._graphFilterState;
  }

  _disposeSelector(selector) {
    if (!selector || typeof selector !== 'object') return;
    try {
      selector.dispose?.();
    } catch (_) {
      // ignore selector cleanup failures
    }
  }

  _disposeGraphFilterSelectors(state) {
    if (!state || typeof state !== 'object') return;
    this._disposeSelector(state.nodeSelector);
    this._disposeSelector(state.edgeSelector);
    state.nodeSelector = null;
    state.edgeSelector = null;
  }

  _captureGraphFilterSignature(state) {
    const network = this.network ?? null;
    let topologyNode = 0;
    let topologyEdge = 0;
    if (typeof network?.getTopologyVersions === 'function') {
      try {
        const versions = network.getTopologyVersions() ?? {};
        topologyNode = safeNumber(versions.node, 0);
        topologyEdge = safeNumber(versions.edge, 0);
      } catch (_) {
        topologyNode = 0;
        topologyEdge = 0;
      }
    } else {
      topologyNode = safeNumber(network?.nodeCount, 0);
      topologyEdge = safeNumber(network?.edgeCount, 0);
    }
    const options = state?.options ?? {};
    const nodeSelector = options?.nodeSelector ?? null;
    const edgeSelector = options?.edgeSelector ?? null;
    const nodeSelection = options?.nodeSelection ?? null;
    const edgeSelection = options?.edgeSelection ?? null;
    return {
      topologyNode,
      topologyEdge,
      nodeSelectorRef: nodeSelector,
      edgeSelectorRef: edgeSelector,
      nodeSelectorVersion: safeNumber(nodeSelector?.version, 0),
      edgeSelectorVersion: safeNumber(edgeSelector?.version, 0),
      nodeSelectionRef: nodeSelection,
      edgeSelectionRef: edgeSelection,
      nodeSelectionVersion: safeNumber(nodeSelection?.version, 0),
      edgeSelectionVersion: safeNumber(edgeSelection?.version, 0),
      nodeSelectionLength: safeLength(nodeSelection),
      edgeSelectionLength: safeLength(edgeSelection),
    };
  }

  _isSameGraphFilterSignature(a, b) {
    if (!a || !b) return false;
    return (
      a.topologyNode === b.topologyNode
      && a.topologyEdge === b.topologyEdge
      && a.nodeSelectorRef === b.nodeSelectorRef
      && a.edgeSelectorRef === b.edgeSelectorRef
      && a.nodeSelectorVersion === b.nodeSelectorVersion
      && a.edgeSelectorVersion === b.edgeSelectorVersion
      && a.nodeSelectionRef === b.nodeSelectionRef
      && a.edgeSelectionRef === b.edgeSelectionRef
      && a.nodeSelectionVersion === b.nodeSelectionVersion
      && a.edgeSelectionVersion === b.edgeSelectionVersion
      && a.nodeSelectionLength === b.nodeSelectionLength
      && a.edgeSelectionLength === b.edgeSelectionLength
    );
  }

  _createFilteredNetworkProxy({
    baseNetwork,
    nodeIndices = null,
    edgeIndices = null,
    nodeSelector = null,
    edgeSelector = null,
    version,
  }) {
    const fallbackNodeIndices = nodeIndices instanceof Uint32Array ? nodeIndices : new Uint32Array(0);
    const fallbackEdgeIndices = edgeIndices instanceof Uint32Array ? edgeIndices : new Uint32Array(0);
    const selectorNode = nodeSelector && typeof nodeSelector === 'object' ? nodeSelector : null;
    const selectorEdge = edgeSelector && typeof edgeSelector === 'object' ? edgeSelector : null;
    const emptyIndices = new Uint32Array(0);
    const buildSelectorView = (selector, fallback) => {
      if (!selector) return fallback;
      if ((baseNetwork?._bufferSessionDepth ?? 0) <= 0) {
        throw new Error('Cannot access filtered active indices outside buffer access');
      }
      const count = Math.max(0, Math.floor(Number(selector.count) || 0));
      const dataPointer = Math.max(0, Math.floor(Number(selector.dataPointer) || 0));
      const heap = selector.module?.HEAPU32?.buffer ?? null;
      if (!count || !dataPointer || !heap) return fallback;
      const view = new Uint32Array(heap, dataPointer, count);
      try {
        view.version = safeNumber(version, 0);
      } catch (_) {
        // ignore non-extensible typed arrays
      }
      return view;
    };
    const copySelection = (scope, target) => {
      if (!(target instanceof Uint32Array)) {
        throw new Error(`${scope} buffer must be a Uint32Array`);
      }
      const wasmHeap = baseNetwork?.module?.HEAPU32?.buffer ?? null;
      if (wasmHeap && target.buffer !== wasmHeap) {
        throw new Error(`${scope} buffer must live in the WASM heap (module.HEAPU32.buffer)`);
      }
      const selector = scope === 'node' ? selectorNode : selectorEdge;
      const fallback = scope === 'node' ? fallbackNodeIndices : fallbackEdgeIndices;
      const countFromSelector = safeNumber(selector?.count, NaN);
      const count = Number.isFinite(countFromSelector) ? Math.max(0, Math.floor(countFromSelector)) : fallback.length;
      if (count > target.length) return count;
      if (!count) return 0;

      const dataPointer = safeNumber(selector?.dataPointer, 0);
      const sourceHeap = selector?.module?.HEAPU32?.buffer ?? null;
      if (dataPointer > 0 && sourceHeap) {
        const view = new Uint32Array(sourceHeap, dataPointer, count);
        target.set(view);
        return count;
      }
      target.set(fallback.subarray(0, count));
      return count;
    };
    return new Proxy(baseNetwork, {
      get(target, property) {
        if (property === 'nodeIndices') return buildSelectorView(selectorNode, fallbackNodeIndices);
        if (property === 'edgeIndices') return buildSelectorView(selectorEdge, fallbackEdgeIndices);
        if (property === 'nodeCount') {
          return selectorNode
            ? Math.max(0, Math.floor(Number(selectorNode?.count) || 0))
            : fallbackNodeIndices.length;
        }
        if (property === 'edgeCount') {
          return selectorEdge
            ? Math.max(0, Math.floor(Number(selectorEdge?.count) || 0))
            : fallbackEdgeIndices.length;
        }
        if (property === '__heliosFilteredNodeSelector') return selectorNode;
        if (property === '__heliosFilteredEdgeSelector') return selectorEdge;
        if (property === '__heliosFilterVersion') return safeNumber(version, 0);
        if (property === '__heliosBaseNetwork') return target;
        if (property === 'writeActiveNodes') {
          return (buffer) => copySelection('node', buffer);
        }
        if (property === 'writeActiveEdges') {
          return (buffer) => copySelection('edge', buffer);
        }
        if (property === 'getTopologyVersions') {
          return () => {
            let raw = { node: 0, edge: 0 };
            if (typeof target.getTopologyVersions === 'function') {
              try {
                raw = target.getTopologyVersions() ?? raw;
              } catch (_) {
                raw = { node: 0, edge: 0 };
              }
            }
            return {
              node: computeFilterTopologyVersion(raw.node, version),
              edge: computeFilterTopologyVersion(raw.edge, version),
            };
          };
        }
        const value = Reflect.get(target, property, target);
        if (typeof value === 'function') {
          return value.bind(target);
        }
        return value;
      },
      set(target, property, value) {
        return Reflect.set(target, property, value, target);
      },
    });
  }

  _refreshGraphFilterNetworks({ force = false, throwOnError = false } = {}) {
    const state = this._ensureGraphFilterState();
    const baseNetwork = this.network ?? null;
    if (!baseNetwork || state.enabled !== true || !state.options) {
      this._disposeGraphFilterSelectors(state);
      state.signature = null;
      state.nodeIndices = null;
      state.edgeIndices = null;
      state.filteredNetwork = null;
      state.renderNetwork = baseNetwork;
      state.layoutNetwork = baseNetwork;
      state.stats = null;
      state.lastError = null;
      if (this._syncLayoutNetworkFromFilter()) {
        this._requestLayoutReheat('filter-sync');
        this.scheduler?.requestLayout?.('filter-sync');
      }
      return state;
    }

    const nextSignature = this._captureGraphFilterSignature(state);
    const unchanged = !force && this._isSameGraphFilterSignature(nextSignature, state.signature);
    if (unchanged) {
      state.renderNetwork = state.filteredNetwork ?? baseNetwork;
      state.layoutNetwork = state.scope === GRAPH_FILTER_SCOPE_RENDER_LAYOUT
        ? (state.renderNetwork ?? baseNetwork)
        : baseNetwork;
      if (this._syncLayoutNetworkFromFilter()) {
        this._requestLayoutReheat('filter-sync');
        this.scheduler?.requestLayout?.('filter-sync');
      }
      return state;
    }

    let pendingNodeSelector = null;
    let pendingEdgeSelector = null;
    try {
      if (typeof baseNetwork.filterSubgraph !== 'function') {
        throw new Error('Current helios-network build does not support filterSubgraph(options)');
      }
      const previousNodeSelector = state.nodeSelector ?? null;
      const previousEdgeSelector = state.edgeSelector ?? null;
      const result = baseNetwork.filterSubgraph({ ...state.options, asSelector: true });
      const hasSelectorResult = Boolean(
        result
        && typeof result === 'object'
        && result.nodes
        && typeof result.nodes.count === 'number'
        && result.edges
        && typeof result.edges.count === 'number',
      );
      const nextNodeSelector = hasSelectorResult ? result.nodes : null;
      const nextEdgeSelector = hasSelectorResult ? result.edges : null;
      pendingNodeSelector = nextNodeSelector;
      pendingEdgeSelector = nextEdgeSelector;
      const nodeIndices = hasSelectorResult
        ? null
        : (result?.nodeIndices instanceof Uint32Array ? result.nodeIndices : new Uint32Array(0));
      const edgeIndices = hasSelectorResult
        ? null
        : (result?.edgeIndices instanceof Uint32Array ? result.edgeIndices : new Uint32Array(0));
      state.version = bumpVersionCounter(state.version);
      state.nodeIndices = nodeIndices;
      state.edgeIndices = edgeIndices;
      state.nodeSelector = nextNodeSelector;
      state.edgeSelector = nextEdgeSelector;
      state.filteredNetwork = this._createFilteredNetworkProxy({
        baseNetwork,
        nodeIndices,
        edgeIndices,
        nodeSelector: nextNodeSelector,
        edgeSelector: nextEdgeSelector,
        version: state.version,
      });
      state.renderNetwork = state.filteredNetwork;
      state.layoutNetwork = state.scope === GRAPH_FILTER_SCOPE_RENDER_LAYOUT
        ? state.filteredNetwork
        : baseNetwork;
      state.signature = nextSignature;
      state.lastError = null;
      state.stats = {
        nodeCount: nextNodeSelector
          ? Math.max(0, Math.floor(Number(nextNodeSelector?.count) || 0))
          : nodeIndices.length,
        edgeCount: nextEdgeSelector
          ? Math.max(0, Math.floor(Number(nextEdgeSelector?.count) || 0))
          : edgeIndices.length,
        baseNodeCount: Math.max(0, Math.floor(Number(baseNetwork?.nodeCount) || 0)),
        baseEdgeCount: Math.max(0, Math.floor(Number(baseNetwork?.edgeCount) || 0)),
      };
      if (previousNodeSelector && previousNodeSelector !== nextNodeSelector) {
        this._disposeSelector(previousNodeSelector);
      }
      if (previousEdgeSelector && previousEdgeSelector !== nextEdgeSelector) {
        this._disposeSelector(previousEdgeSelector);
      }
      pendingNodeSelector = null;
      pendingEdgeSelector = null;
      if (this._syncLayoutNetworkFromFilter()) {
        this._requestLayoutReheat('filter-sync');
        this.scheduler?.requestLayout?.('filter-sync');
      }
      return state;
    } catch (error) {
      if (throwOnError) {
        if (pendingNodeSelector && pendingNodeSelector !== state.nodeSelector) {
          this._disposeSelector(pendingNodeSelector);
        }
        if (pendingEdgeSelector && pendingEdgeSelector !== state.edgeSelector) {
          this._disposeSelector(pendingEdgeSelector);
        }
        throw error;
      }
      this._disposeGraphFilterSelectors(state);
      state.lastError = error;
      state.signature = nextSignature;
      state.nodeIndices = null;
      state.edgeIndices = null;
      state.nodeSelector = null;
      state.edgeSelector = null;
      state.filteredNetwork = null;
      state.renderNetwork = baseNetwork;
      state.layoutNetwork = baseNetwork;
      state.stats = null;
      if (this._syncLayoutNetworkFromFilter()) {
        this._requestLayoutReheat('filter-sync');
        this.scheduler?.requestLayout?.('filter-sync');
      }
      this.debug?.log?.('helios', 'Graph filter refresh failed; falling back to base network', { error });
      return state;
    }
  }

  _syncLayoutNetworkFromFilter() {
    const layout = this._layout ?? null;
    if (!layout || typeof layout !== 'object') return false;
    const nextLayoutNetwork = this._ensureGraphFilterState().layoutNetwork ?? this.network ?? null;
    if (!nextLayoutNetwork || layout.network === nextLayoutNetwork) return false;
    layout.network = nextLayoutNetwork;
    layout.syncAutoSettingsForNetwork?.(nextLayoutNetwork);
    this._enforcePositionSourcePolicy(layout, { resetInterpolation: false });
    return true;
  }

  _afterGraphFilterMutation(reason = 'filter') {
    this._refreshGraphFilterNetworks({ force: false, throwOnError: false });
    const layoutNetworkChanged = this._syncLayoutNetworkFromFilter();
    const filterScope = this._ensureGraphFilterState().scope;
    this._markAutoFitDirty(false);
    if (layoutNetworkChanged || filterScope === GRAPH_FILTER_SCOPE_RENDER_LAYOUT) {
      this._requestLayoutReheat('filter');
    }
    this.scheduler?.requestGeometry?.();
    if (layoutNetworkChanged) {
      this.scheduler?.requestLayout?.('filter');
    } else if (filterScope === GRAPH_FILTER_SCOPE_RENDER_LAYOUT) {
      this.scheduler?.requestLayout?.('filter');
    }
    this.scheduler?.requestRender?.();
    this._labels?.requestFullReselect?.(`graph-filter:${reason}`);
    this.emit(EVENTS.GRAPH_FILTER_CHANGED, this.getGraphFilter());
  }

  _getRenderNetwork() {
    return this._refreshGraphFilterNetworks().renderNetwork ?? this.network ?? null;
  }

  _getLayoutNetwork() {
    return this._refreshGraphFilterNetworks().layoutNetwork ?? this.network ?? null;
  }

  getGraphFilter() {
    const state = this._refreshGraphFilterNetworks();
    const options = state.options ? { ...state.options } : null;
    if (options) {
      options.scope = state.scope;
    }
    return {
      enabled: state.enabled === true,
      scope: state.scope ?? GRAPH_FILTER_SCOPE_RENDER,
      options,
      nodeCount: Math.max(0, Math.floor(Number(state.stats?.nodeCount ?? state.renderNetwork?.nodeCount) || 0)),
      edgeCount: Math.max(0, Math.floor(Number(state.stats?.edgeCount ?? state.renderNetwork?.edgeCount) || 0)),
      baseNodeCount: Math.max(0, Math.floor(Number(state.stats?.baseNodeCount ?? this.network?.nodeCount) || 0)),
      baseEdgeCount: Math.max(0, Math.floor(Number(state.stats?.baseEdgeCount ?? this.network?.edgeCount) || 0)),
      error: state.lastError ? (state.lastError.message ?? String(state.lastError)) : null,
    };
  }

  graphFilter(options) {
    if (arguments.length === 0) {
      return this.getGraphFilter();
    }
    if (options == null || options === false || options?.enabled === false) {
      return this.clearGraphFilter();
    }
    return this.setGraphFilter(options);
  }

  setGraphFilter(options = {}) {
    if (options == null || options === false) {
      return this.clearGraphFilter();
    }
    let preserveActiveFilterRef = false;
    if (options instanceof HeliosFilter) {
      this._activeHeliosFilter = options;
      options = options.toGraphFilterOptions();
      preserveActiveFilterRef = true;
    }
    if (typeof options !== 'object') {
      throw new TypeError('setGraphFilter(options) expects an object or null');
    }
    if (!preserveActiveFilterRef) {
      this._activeHeliosFilter = null;
    }
    const scope = normalizeGraphFilterScope(options.scope, this._ensureGraphFilterState().scope);
    const filterOptions = normalizeGraphFilterOptions(options);
    if (!hasGraphFilterCriteria(filterOptions)) {
      return this.clearGraphFilter();
    }

    const state = this._ensureGraphFilterState();
    const previous = { ...state };
    state.enabled = true;
    state.scope = scope;
    state.options = filterOptions;
    state.signature = null;
    state.lastError = null;

    try {
      this._refreshGraphFilterNetworks({ force: true, throwOnError: true });
    } catch (error) {
      Object.assign(state, previous);
      throw error;
    }
    this._afterGraphFilterMutation('set');
    return this;
  }

  activateHeliosFilter(filter) {
    if (filter == null || filter === false) {
      this._activeHeliosFilter = null;
      return this.clearGraphFilter();
    }
    if (!(filter instanceof HeliosFilter)) {
      throw new TypeError('activateHeliosFilter(filter) expects a HeliosFilter instance or null');
    }
    return this.setGraphFilter(filter);
  }

  getActiveHeliosFilter() {
    return this._activeHeliosFilter ?? null;
  }

  reapplyActiveHeliosFilter() {
    if (!this._activeHeliosFilter) return this;
    return this.activateHeliosFilter(this._activeHeliosFilter);
  }

  clearGraphFilter() {
    const state = this._ensureGraphFilterState();
    const hadFilter = state.enabled === true || state.filteredNetwork != null || state.options != null;
    this._disposeGraphFilterSelectors(state);
    state.enabled = false;
    state.scope = GRAPH_FILTER_SCOPE_RENDER;
    state.options = null;
    state.signature = null;
    state.nodeIndices = null;
    state.edgeIndices = null;
    state.nodeSelector = null;
    state.edgeSelector = null;
    state.filteredNetwork = null;
    state.renderNetwork = this.network ?? null;
    state.layoutNetwork = this.network ?? null;
    state.stats = null;
    state.lastError = null;
    if (hadFilter) {
      this._afterGraphFilterMutation('clear');
    }
    return this;
  }

  async replaceNetwork(nextNetwork, options = {}) {
    if (!nextNetwork) {
      throw new Error('replaceNetwork requires a helios-network instance');
    }
    await this.ready;

    const disposeOld = options.disposeOld !== false;
    const keepCamera = options.keepCamera !== false;
    const keepMappers = options.keepMappers !== false;
    const recreateRenderer = options.recreateRenderer !== false;
    const frameNetwork = options.frame ?? (!keepCamera);
    const layoutOption = options.layout ?? this.options.layout;
    if (isLayoutInstance(layoutOption)) {
      throw new Error('replaceNetwork requires options.layout when Helios was constructed with a layout instance');
    }
    const activePositionDelegate =
      this._positionsConfig?.source === 'delegate' ? this._positionsConfig.delegate : null;

    const wasRunning = !this.manualRendering && this.scheduler?.running === true;
    const previousLayoutState = typeof this.scheduler?.getLayoutState === 'function'
      ? this.scheduler.getLayoutState()
      : (this.scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
    const cameraState = keepCamera ? this._snapshotCameraState() : null;
    const attributeConfig = this.attributeTracker
      ? { node: this.attributeTracker.nodeAttribute, edge: this.attributeTracker.edgeAttribute, options: { ...this.attributeTracker.options } }
      : null;
    const pickingConfig = {
      node: this._picking?.node?.enabled === true,
      edge: this._picking?.edge?.enabled === true,
      options: { ...(this._picking?.options ?? {}) },
    };

    this._detachPositionDelegate(activePositionDelegate);

    this.scheduler?.stop?.();
    this._detachPickingListeners();
    this.indexPickingTracker?.destroy?.();
    this.indexPickingTracker = null;
    this.attributeTracker?.destroy?.();
    this.attributeTracker = null;
    this._resetHover?.('network-replaced');

    if (recreateRenderer) {
      this.renderer?.destroy?.();
      this.renderer = null;
    }

    this._layout?.dispose?.();

    const prevNetwork = this.network;
    this.network = nextNetwork;
    this._ensureGraphFilterState().renderNetwork = nextNetwork;
    this._ensureGraphFilterState().layoutNetwork = nextNetwork;
    this._refreshGraphFilterNetworks({ force: true, throwOnError: false });
    this.visuals = new VisualAttributes(nextNetwork, this.debug);
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(layoutOption, this.layers.size, this.options.mode));
    this._resetInterpolationRuntime({ keepIntervalHistory: false });
    this._labels?.requestFullReselect?.('network-replaced');

    if (options.mappers === null) {
      this.nodeMapper = new MapperCollection('node', nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = new MapperCollection('edge', nextNetwork, this.markMappersDirty, this.debug);
      this.mappersDirty = false;
    } else if (options.mappers) {
      this.nodeMapper = new MapperCollection('node', nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = new MapperCollection('edge', nextNetwork, this.markMappersDirty, this.debug);
      if (options.mappers?.nodeMapper) this.nodeMapper.setDefault(options.mappers.nodeMapper);
      if (options.mappers?.edgeMapper) this.edgeMapper.setDefault(options.mappers.edgeMapper);
      this.mappersDirty = true;
    } else if (keepMappers) {
      this.nodeMapper = cloneMapperCollection(this.nodeMapper, nextNetwork, this.markMappersDirty, this.debug);
      this.edgeMapper = cloneMapperCollection(this.edgeMapper, nextNetwork, this.markMappersDirty, this.debug);
      this.mappersDirty = true;
    } else {
      this._resetMappersToDefault(nextNetwork);
    }

    this.firstGeometryUpdateComplete = false;

    this._layout = this._bindLayoutToHelios(this.createLayout(layoutOption));
    this._syncLayoutNetworkFromFilter();
    if (this._layout?.setUpdateListener) {
      this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    }
    await this._layout?.initialize?.();
    this._layout?.resize?.(this.layers.size);
    this._activateLayoutAfterNetworkReplace(previousLayoutState, 'network-replaced');

    if (recreateRenderer) {
      await this._createRendererAndTrackers();
      this._applyPositionPipelineToRenderer();
      this._refreshUIBindings();
      if (frameNetwork) {
        this.requestFrameNetwork({ paddingPx: options.framePaddingPx ?? 24 });
      } else {
        this._restoreCameraState(cameraState);
      }
    } else if (this.renderer) {
      this.attributeTracker = new AttributeTracker(this.renderer);
      this.attributeTracker.resize(this.layers.size);
      this._applyPickingConfig();
      this._applyPositionPipelineToRenderer();
      this._refreshUIBindings();
      if (frameNetwork) {
        this.requestFrameNetwork({ paddingPx: options.framePaddingPx ?? 24 });
      } else {
        this._restoreCameraState(cameraState);
      }
    }

    // Apply visuals immediately so first render and exports are non-empty even if the scheduler
    // hasn't ticked yet; also catches incompatible mappers early.
    this._applyMappersSafely();

    if (attributeConfig && this.attributeTracker) {
      this.enableAttributeTracking(attributeConfig.node, attributeConfig.edge, attributeConfig.options);
    }
    if (pickingConfig.node) this.enableNodePicking(pickingConfig.options);
    if (pickingConfig.edge) this.enableEdgePicking(pickingConfig.options);

    if (wasRunning) {
      this.scheduler.start();
    }
    this.scheduler.requestGeometry();
    this.scheduler.requestRender();
    this._resetCameraDelegateSnapshot();
    this._invalidateCameraOrbitReference();
    this._markAutoFitDirty(false);

    this.emit(EVENTS.NETWORK_REPLACED, {
      oldNetwork: prevNetwork ?? null,
      network: nextNetwork,
      oldNodeCount: prevNetwork?.nodeCount ?? null,
      oldEdgeCount: prevNetwork?.edgeCount ?? null,
      nodeCount: nextNetwork?.nodeCount ?? null,
      edgeCount: nextNetwork?.edgeCount ?? null,
    });
    this._labels?.requestFullReselect?.('network-replaced-emitted');

    if (disposeOld && prevNetwork && typeof prevNetwork.dispose === 'function') {
      try {
        prevNetwork.dispose();
      } catch (_) {
        // ignore disposal failures
      }
    }
  }

  _tryPendingFrameNetwork() {
    const pending = this._pendingFrameNetwork;
    if (!pending) return false;
    if (!this.renderer?.camera) return false;
    const size = this.size ?? this.layers?.size ?? null;
    if (!size || size.width <= 2 || size.height <= 2) return false;

    pending.attempts += 1;
    const ok = this.frameNetwork(pending.options);
    if (ok) {
      this._pendingFrameNetwork = null;
      return true;
    }
    if (pending.attempts >= pending.maxAttempts) {
      this._pendingFrameNetwork = null;
    }
    return false;
  }

  requestFrameNetwork(options = {}) {
    const maxAttempts = Number.isFinite(options.maxAttempts) ? Math.max(1, Math.floor(options.maxAttempts)) : 25;
    const { maxAttempts: _ignored, ...frameOptions } = options ?? {};
    this._pendingFrameNetwork = { options: frameOptions, attempts: 0, maxAttempts };
    const ok = this._tryPendingFrameNetwork();
    if (!ok) {
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  _requestInitialCameraFit() {
    this.requestFrameNetwork({
      animate: false,
      resetOrientation: this.mode() === '3d',
      maxAttempts: 60,
    });
  }

  frameNetwork(options = {}) {
    const camera = this.renderer?.camera ?? null;
    if (!camera) return false;
    const targetNodeIndices = options.nodeIndices != null
      ? normalizeNodeIndexList(options.nodeIndices)
      : this._resolveActiveCameraTargetNodeIndices();
    const sampledBounds = this._sampleRenderBounds({
      ...options,
      nodeIndices: targetNodeIndices ?? undefined,
      coverage: Number.isFinite(options.coverage)
        ? Number(options.coverage)
        : (this._cameraControlConfig?.autoFitCoverage ?? CAMERA_CONTROL_DEFAULTS.autoFitCoverage),
      paddingRatio: Number.isFinite(options.paddingRatio)
        ? Number(options.paddingRatio)
        : (this._cameraControlConfig?.autoFitPaddingRatio ?? CAMERA_CONTROL_DEFAULTS.autoFitPaddingRatio),
      maxSamples: options.maxSamples ?? this._cameraControlConfig?.autoFitMaxSamples ?? CAMERA_FIT_DEFAULT_MAX_SAMPLES,
    });
    if (!sampledBounds) return false;
    const nextPose = this._resolveCameraFitPose(sampledBounds, {
      resetOrientation: options.resetOrientation ?? (camera.mode === '3d'),
      focusMode: options.focusMode ?? (targetNodeIndices?.length ? 'centroid' : 'bbox'),
    });
    return this._applyCameraPoseWithOptionalAnimation(nextPose, {
      animate: options.animate === true,
      durationMs: options.durationMs,
    });
  }

  async loadNetwork(source, options = {}) {
    const requestedFormat = options.format ?? null;
    const formatFromName = source && typeof source === 'object' && typeof source.name === 'string'
      ? inferNetworkFormatFromName(source.name)
      : null;
    const format = requestedFormat ?? formatFromName;
    if (!format) {
      throw new Error('loadNetwork requires a format ("xnet", "zxnet", "bxnet") or a filename with a supported extension');
    }
    const { default: HeliosNetwork } = await import('helios-network');
    const normalized = format.toLowerCase();
    let next = null;
    if (normalized === 'bxnet') next = await HeliosNetwork.fromBXNet(source);
    else if (normalized === 'zxnet') next = await HeliosNetwork.fromZXNet(source);
    else if (normalized === 'xnet') next = await HeliosNetwork.fromXNet(source);
    else throw new Error(`Unsupported network format: ${format}`);
    await this.replaceNetwork(next, options);
    if (typeof source?.name === 'string') {
      this._lastLoadedNetworkName = source.name;
      this._lastLoadedNetworkBase = getBaseFilename(source.name);
      this._lastLoadedNetworkFormat = inferNetworkFormatFromName(source.name);
    }
    return next;
  }

  async saveNetwork(format = 'bxnet', options = {}) {
    const normalized = String(format).toLowerCase();
    if (!this.network) throw new Error('saveNetwork requires an active network');
    // Ensure visuals exist and mappers have been applied before serializing.
    this.visuals?.seedMissingPositions?.(this.layers?.size);
    this._applyMappersSafely();
    const output = options.output ?? 'blob';
    const saveOptions = { ...(options.saveOptions ?? {}), format: output };
    if (normalized === 'bxnet') {
      if (typeof this.network.saveBXNet !== 'function') throw new Error('Network does not support saveBXNet()');
      return this.network.saveBXNet(saveOptions);
    }
    if (normalized === 'zxnet') {
      if (typeof this.network.saveZXNet !== 'function') throw new Error('Network does not support saveZXNet()');
      return this.network.saveZXNet(saveOptions);
    }
    if (normalized === 'xnet') {
      if (typeof this.network.saveXNet !== 'function') throw new Error('Network does not support saveXNet()');
      return this.network.saveXNet(saveOptions);
    }
    throw new Error(`Unsupported network format: ${format}`);
  }

  getFigureExportCapabilities(options = {}) {
    const supersampling = Number(options.supersampling ?? 1);
    const capability = getFigureExportCapability(this.renderer, supersampling);
    return {
      ...capability,
      windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
      defaultPreset: resolveFigureExportOptions({}, {
        renderer: this.renderer,
        capability: {
          ...capability,
          windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
        },
        windowSize: this.layers?.size ?? this.size ?? {},
        windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
      }).preset,
      presets: buildFigureExportPresetList(
        this.layers?.size ?? this.size ?? {},
        {
          ...capability,
          windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
        },
        supersampling,
      ),
    };
  }

  _resolveFigureExportOptions(options = {}) {
    const supersampling = Number(options.supersampling ?? 1);
    const capability = getFigureExportCapability(this.renderer, supersampling);
    return resolveFigureExportOptions(options, {
      renderer: this.renderer,
      capability,
      windowSize: this.layers?.size ?? this.size ?? { width: 1, height: 1 },
      windowDevicePixelRatio: globalThis.window?.devicePixelRatio ?? 1,
    });
  }

  async _prepareFigureExportFrame() {
    if (typeof document === 'undefined') {
      throw new Error('Figure export requires a browser environment');
    }
    if (!this.renderer || !this.scheduler) {
      throw new Error('Figure export requires an initialized renderer');
    }
    if (!this.network) {
      throw new Error('Figure export requires an active network');
    }
    this.visuals?.seedMissingPositions?.(this.layers?.size ?? this.size);
    this._applyMappersSafely();
    const frame = this.scheduler.geometryCallback?.() ?? this.scheduler.currentFrame ?? null;
    if (!frame) {
      throw new Error('Figure export requires an available render frame');
    }
    return frame;
  }

  _buildFigureExportCamera(sourceCamera, options = {}) {
    const exportViewport = options.exportFigureLogicalViewport ?? buildExportLogicalViewport(options);
    if (!sourceCamera?.getUniforms) return sourceCamera;

    const sourceUniforms = sourceCamera.getUniforms();
    if (!sourceUniforms?.viewProjection || !sourceUniforms?.view || !sourceUniforms?.projection) {
      return sourceCamera;
    }
    if (sourceCamera.mode !== '3d') {
      return sourceCamera;
    }

    const liveViewport = sourceCamera.viewport ?? sourceUniforms.viewport ?? null;
    const previewRect = options.previewRect ?? null;
    if (!liveViewport || !previewRect) {
      return sourceCamera;
    }

    const projectionMatrix = new Float32Array(sourceUniforms.projection);
    const viewMatrix = new Float32Array(sourceUniforms.view);
    const nextProjection = createMat4Identity();

    if (sourceCamera.projection === 'orthographic') {
      const liveBounds = deriveOrthographicBounds(projectionMatrix);
      if (!liveBounds) return sourceCamera;
      const exportBounds = interpolateFrameBounds(liveBounds, previewRect, liveViewport);
      mat4Ortho(
        nextProjection,
        exportBounds.left,
        exportBounds.right,
        exportBounds.bottom,
        exportBounds.top,
        Number(sourceCamera.near ?? 0.1),
        Number(sourceCamera.far ?? 100000),
      );
    } else {
      const near = Math.max(1e-6, Number(sourceCamera.near ?? 0.1));
      const liveBounds = derivePerspectiveBounds(projectionMatrix, near);
      if (!liveBounds) return sourceCamera;
      const exportBounds = interpolateFrameBounds(liveBounds, previewRect, liveViewport);
      mat4Frustum(
        nextProjection,
        exportBounds.left,
        exportBounds.right,
        exportBounds.bottom,
        exportBounds.top,
        near,
        Math.max(near + 1e-6, Number(sourceCamera.far ?? 100000)),
      );
    }

    const nextViewProjection = createMat4Identity();
    mat4Multiply(nextViewProjection, nextProjection, viewMatrix);

    const exportUniforms = {
      ...sourceUniforms,
      view: viewMatrix,
      projection: nextProjection,
      viewProjection: nextViewProjection,
      position: new Float32Array(sourceUniforms.position),
      right: new Float32Array(sourceUniforms.right),
      up: new Float32Array(sourceUniforms.up),
      viewport: {
        ...(sourceUniforms.viewport ?? {}),
        ...exportViewport,
      },
    };

    return {
      mode: sourceCamera.mode,
      projection: sourceCamera.projection,
      viewport: { ...exportUniforms.viewport },
      near: sourceCamera.near,
      far: sourceCamera.far,
      setViewport(size) {
        if (!size) return;
        this.viewport = { ...this.viewport, ...size };
        exportUniforms.viewport = { ...exportUniforms.viewport, ...size };
      },
      getUniforms() {
        return {
          ...exportUniforms,
          viewport: { ...exportUniforms.viewport },
        };
      },
    };
  }

  async _captureFigureBitmap(options, frame) {
    const renderer = this.renderer ?? null;
    if (!renderer?.camera) throw new Error('Figure export requires an initialized camera');

    const framebuffer = renderer.createFramebuffer(options.framebufferWidth, options.framebufferHeight);
    const previousClearColor = Array.isArray(renderer.clearColor) ? [...renderer.clearColor] : null;
    const exportFigureLogicalViewport = options.exportFigureLogicalViewport ?? null;
    const sourceCamera = frame?.camera ?? renderer.camera;
    const exportCamera = this._buildFigureExportCamera(sourceCamera, options);
    const exportFrame = exportCamera === sourceCamera ? frame : { ...frame, camera: exportCamera };
    const previousCameraViewport = sourceCamera?.viewport ? { ...sourceCamera.viewport } : null;
    const graphLayer = renderer.graphLayer ?? null;
    const previousManualFastEdges = graphLayer?.edgeFastRendering === true;
    const previousAdaptiveFastEdges = graphLayer?.edgeAdaptiveFastRendering === true;
    const previousForceHighQuality = this._edgeAdaptiveRuntime?.forceHighQuality === true;
    try {
      if (this._edgeAdaptiveRuntime) {
        this._edgeAdaptiveRuntime.forceHighQuality = true;
      }
      if (graphLayer) {
        graphLayer.setEdgeFastRendering?.(false);
        graphLayer.setAdaptiveEdgeFastRendering?.(false);
      }
      if (options.transparentBackground === true) {
        renderer.clearColor = [0, 0, 0, 0];
      }
      if (framebuffer && typeof framebuffer === 'object') {
        framebuffer.exportFigureLogicalViewport = exportFigureLogicalViewport
          ? {
              width: Math.max(1, Number(exportFigureLogicalViewport.width ?? 1)),
              height: Math.max(1, Number(exportFigureLogicalViewport.height ?? 1)),
              devicePixelRatio: Math.max(1, Number(exportFigureLogicalViewport.devicePixelRatio ?? 1)),
            }
          : null;
      }
      if (exportFigureLogicalViewport && typeof exportCamera?.setViewport === 'function') {
        exportCamera.setViewport(exportFigureLogicalViewport);
      }
      renderer.setRenderTarget(framebuffer);
      renderer.render(exportFrame);
      const pixels = await renderer.readPixels(framebuffer, {
        x: options.cropRect.x,
        y: options.cropRect.y,
        width: options.cropRect.width,
        height: options.cropRect.height,
      });
      return pixelsToCanvas(
        pixels,
        options.cropRect.width,
        options.cropRect.height,
        options.width,
        options.height,
        {
          flipY: renderer.device?.type === 'webgl2',
          swizzleBGRA: renderer.device?.type === 'webgpu' && String(renderer.device?.format ?? '').startsWith('bgra'),
          alphaMode: options.transparentBackground === true ? options.alphaMode : 'straight',
        },
      );
    } finally {
      if (graphLayer) {
        graphLayer.setEdgeFastRendering?.(previousManualFastEdges);
        graphLayer.setAdaptiveEdgeFastRendering?.(previousAdaptiveFastEdges);
      }
      if (this._edgeAdaptiveRuntime) {
        this._edgeAdaptiveRuntime.forceHighQuality = previousForceHighQuality;
      }
      if (previousClearColor) {
        renderer.clearColor = previousClearColor;
      }
      if (exportCamera === sourceCamera && previousCameraViewport && typeof sourceCamera?.setViewport === 'function') {
        sourceCamera.setViewport(previousCameraViewport);
      }
      renderer.setRenderTarget(null);
      const device = renderer.device ?? null;
      if (framebuffer?.type === 'webgl2') {
        const gl = device?.gl ?? null;
        if (gl) {
          if (framebuffer.handle) gl.deleteFramebuffer?.(framebuffer.handle);
          if (framebuffer.texture) gl.deleteTexture?.(framebuffer.texture);
          if (framebuffer.depth) gl.deleteRenderbuffer?.(framebuffer.depth);
        }
      } else if (framebuffer?.type === 'webgpu') {
        framebuffer.texture?.destroy?.();
        framebuffer.depthTexture?.destroy?.();
      }
    }
  }

  _captureFigureOverlay(options) {
    if (typeof document === 'undefined') return null;
    const renderer = this.renderer ?? null;
    if (!renderer?.camera) return null;
    const labelBaseConfig = this._labels?.getConfig?.() ?? {};
    const legendBaseConfig = this._legends?.getConfig?.() ?? { scale: 1 };
    const exportReferenceSize = {
      width: options.width,
      height: options.height,
    };
    const viewReferenceSize = renderer.camera?.viewport ?? this.layers?.size ?? this.size ?? exportReferenceSize;
    const exportRelativeScale = resolveFigureRelativeOverlayScale(exportReferenceSize, viewReferenceSize, 1);
    const legendScale = Math.max(
      0.25,
      Number(legendBaseConfig.scale ?? 1)
        * exportRelativeScale
        * Number(options.legendScale ?? 1),
    );
    const targetSize = {
      width: options.width,
      height: options.height,
      devicePixelRatio: 1,
    };
    const exportFigureLogicalViewport = options.exportFigureLogicalViewport ?? buildExportLogicalViewport(options);
    const previousCameraViewport = renderer.camera?.viewport ? { ...renderer.camera.viewport } : null;
    const exportCamera = this._buildFigureExportCamera(renderer.camera, options);
    let exportUniforms = null;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', `${options.width}`);
    svg.setAttribute('height', `${options.height}`);
    svg.setAttribute('viewBox', `0 0 ${options.width} ${options.height}`);

    if (options.includeLabels) {
      try {
        if (exportCamera !== renderer.camera) {
          exportCamera.setViewport?.(exportFigureLogicalViewport);
          exportUniforms = exportCamera.getUniforms?.() ?? null;
        } else if (exportFigureLogicalViewport && typeof renderer.camera?.setViewport === 'function') {
          renderer.camera.setViewport(exportFigureLogicalViewport);
          exportUniforms = renderer.camera.getUniforms?.() ?? null;
        }
        const labelGroup = this._labels?.createSnapshot?.({
          timestamp: performance.now(),
          uniforms: exportUniforms,
          config: {
            fontFamily: options.format === 'svg'
              ? ILLUSTRATOR_EXPORT_FONT_FAMILY
              : labelBaseConfig.fontFamily,
            illustratorCompatible: options.format === 'svg',
          },
        });
        if (labelGroup) svg.appendChild(labelGroup);
      } finally {
        if (previousCameraViewport && typeof renderer.camera?.setViewport === 'function') {
          renderer.camera.setViewport(previousCameraViewport);
        }
      }
    }
    if (options.includeLegends) {
      const legendGroup = this._legends?.createSnapshot?.({
        size: targetSize,
        insets: { top: 0, right: 0, bottom: 0, left: 0 },
        viewportHeight: options.height * Number(options.legendScale ?? 1),
        config: {
          enabled: true,
          respectDockInsets: false,
          margin: Number(legendBaseConfig.margin ?? 12) * exportRelativeScale,
          gap: Number(legendBaseConfig.gap ?? 12) * exportRelativeScale,
          scale: legendScale,
          maxScale: 64,
          scalePreviewLegends: true,
          illustratorCompatible: options.format === 'svg',
          fontFamily: options.format === 'svg' ? ILLUSTRATOR_EXPORT_FONT_FAMILY : legendBaseConfig.fontFamily,
        },
      });
      if (legendGroup) {
        legendGroup.dataset.exportLegendScale = `${legendScale}`;
      }
      if (legendGroup) svg.appendChild(legendGroup);
    }
    if (!svg.childNodes.length) return null;
    return svg;
  }

  async _composeFigurePng(canvas, overlaySvg, options = {}) {
    if (!overlaySvg) {
      if (options.transparentBackground === true) {
        return canvasToBlob(canvas, 'image/png');
      }
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = canvas.width;
      outputCanvas.height = canvas.height;
      const ctx = outputCanvas.getContext('2d');
      if (!ctx) throw new Error('Unable to create a 2D canvas context for PNG export');
      ctx.fillStyle = resolveExportBackgroundColor(options.backgroundColor).css;
      ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
      ctx.drawImage(canvas, 0, 0);
      return canvasToBlob(outputCanvas, 'image/png');
    }
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = canvas.width;
    outputCanvas.height = canvas.height;
    const ctx = outputCanvas.getContext('2d');
    if (!ctx) throw new Error('Unable to create a 2D canvas context for PNG export');
    if (options.transparentBackground !== true) {
      ctx.fillStyle = resolveExportBackgroundColor(options.backgroundColor).css;
      ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    }
    ctx.drawImage(canvas, 0, 0);
    const overlayImage = await loadSvgImage(elementToMarkup(overlaySvg));
    ctx.drawImage(overlayImage, 0, 0, outputCanvas.width, outputCanvas.height);
    return canvasToBlob(outputCanvas, 'image/png');
  }

  _composeFigureSvg(canvas, overlaySvg, options) {
    const bitmapHref = canvas.toDataURL('image/png');
    const overlays = overlaySvg
      ? Array.from(overlaySvg.childNodes).map((node) => elementToMarkup(node)).join('')
      : '';
    const backgroundRect = options.transparentBackground === true
      ? ''
      : `<rect width="${options.width}" height="${options.height}" fill="${resolveExportBackgroundColor(options.backgroundColor).css}" />`;
    const svgText = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">`,
      backgroundRect,
      `<image width="${options.width}" height="${options.height}" href="${bitmapHref}" xlink:href="${bitmapHref}" />`,
      overlays,
      '</svg>',
    ].join('');
    return new Blob([svgText], { type: 'image/svg+xml' });
  }

  async exportFigureBlob(options = {}) {
    const resolved = this._resolveFigureExportOptions(options);
    const exportOptions = {
      ...resolved,
      backgroundColor: Array.isArray(this.renderer?.clearColor) ? [...this.renderer.clearColor] : [1, 1, 1, 1],
      exportFigureLogicalViewport: buildExportLogicalViewport({
        ...resolved,
        devicePixelRatio: 1,
      }),
    };
    if (!exportOptions.fitsCapability) {
      throw new Error(
        `Requested export requires ${exportOptions.bitmapWidth}x${exportOptions.bitmapHeight} raster pixels, `
        + `but the current renderer is capped at ${exportOptions.capability.maxBitmapDimension}px per dimension.`,
      );
    }
    try {
      const frame = await this._prepareFigureExportFrame();
      const bitmapCanvas = await this._captureFigureBitmap(exportOptions, frame);
      const overlaySvg = this._captureFigureOverlay(exportOptions);
      return exportOptions.format === 'svg'
        ? this._composeFigureSvg(bitmapCanvas, overlaySvg, exportOptions)
        : await this._composeFigurePng(bitmapCanvas, overlaySvg, exportOptions);
    } finally {
      this.scheduler?.requestRender?.();
    }
  }

  async exportFigurePreviewBlob(options = {}, previewOptions = {}) {
    const resolved = this._resolveFigureExportOptions(options);
    const fullExportOptions = {
      ...resolved,
      format: 'png',
      backgroundColor: Array.isArray(this.renderer?.clearColor) ? [...this.renderer.clearColor] : [1, 1, 1, 1],
      exportFigureLogicalViewport: buildExportLogicalViewport({
        ...resolved,
        devicePixelRatio: 1,
      }),
    };
    const previewRequest = resolveFigurePreviewThumbnailOptions(fullExportOptions, previewOptions);
    const previewResolved = this._resolveFigureExportOptions(previewRequest);
    const previewExportOptions = {
      ...previewResolved,
      format: 'png',
      includeLabels: fullExportOptions.includeLabels,
      includeLegends: fullExportOptions.includeLegends,
      legendScale: fullExportOptions.legendScale,
      transparentBackground: fullExportOptions.transparentBackground,
      alphaMode: fullExportOptions.alphaMode,
      backgroundColor: fullExportOptions.backgroundColor,
      exportFigureLogicalViewport: buildExportLogicalViewport({
        width: fullExportOptions.width ?? previewResolved.width,
        height: fullExportOptions.height ?? previewResolved.height,
        bitmapWidth: previewResolved.bitmapWidth,
        bitmapHeight: previewResolved.bitmapHeight,
        logicalWidth: fullExportOptions.exportFigureLogicalViewport?.width,
        logicalHeight: fullExportOptions.exportFigureLogicalViewport?.height,
        devicePixelRatio: 1,
      }),
    };

    const frame = await this._prepareFigureExportFrame();
    const bitmapCanvas = await this._captureFigureBitmap(previewExportOptions, frame);
    const overlaySvg = this._captureFigureOverlay(fullExportOptions);
    return await this._composeFigurePng(bitmapCanvas, overlaySvg, previewExportOptions);
  }

  async exportFigure(filenameOrOptions, maybeOptions = {}) {
    const options = typeof filenameOrOptions === 'string'
      ? { ...maybeOptions, filename: filenameOrOptions }
      : { ...(filenameOrOptions ?? {}) };
    const resolved = this._resolveFigureExportOptions(options);
    const blob = await this.exportFigureBlob(options);
    if (typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = resolved.filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    }
    return {
      blob,
      filename: resolved.filename,
      format: resolved.format,
      width: resolved.width,
      height: resolved.height,
      bitmapWidth: resolved.bitmapWidth,
      bitmapHeight: resolved.bitmapHeight,
      supersampling: resolved.supersampling,
    };
  }

  on(type, handler, options) {
    this.addEventListener(type, handler, options);
    if (options?.signal && typeof options.signal.addEventListener === 'function') {
      const signal = options.signal;
      if (signal.aborted) {
        this.removeEventListener(type, handler, options);
      } else {
        signal.addEventListener('abort', () => this.removeEventListener(type, handler, options), { once: true });
      }
    }
    return () => this.off(type, handler, options);
  }

  listen(typeWithNamespace, handler, options) {
    const parsed = parseNamespacedEventType(typeWithNamespace);
    const namespace = parsed.namespace ?? '';
    const key = `${parsed.type}\u0000${namespace}`;
    const capture = options === true ? true : Boolean(options?.capture);

    const existing = this._listenHandlers.get(key);
    if (existing) {
      this.removeEventListener(parsed.type, existing.listener, existing.capture);
      existing.unsubscribeSignal?.();
      this._listenHandlers.delete(key);
    }

    if (handler == null) {
      return this;
    }
    if (typeof handler !== 'function') {
      throw new TypeError('listen() handler must be a function or null');
    }

    const listener = (event) => handler(event);
    const listenerOptions = options === true || options === false
      ? options
      : { ...options, signal: undefined };
    this.addEventListener(parsed.type, listener, listenerOptions);

    let unsubscribeSignal = null;
    const signal = options?.signal;
    if (signal && typeof signal.addEventListener === 'function') {
      if (signal.aborted) {
        this.removeEventListener(parsed.type, listener, capture);
      } else {
        const onAbort = () => this.listen(typeWithNamespace, null);
        signal.addEventListener('abort', onAbort, { once: true });
        unsubscribeSignal = () => signal.removeEventListener?.('abort', onAbort);
      }
    }

    this._listenHandlers.set(key, {
      type: parsed.type,
      namespace,
      listener,
      capture,
      unsubscribeSignal,
    });

    return this;
  }

  off(type, handler, options) {
    this.removeEventListener(type, handler, options);
  }

  onAny(handler, options) {
    if (typeof handler !== 'function') return () => {};
    this._anyListeners.add(handler);
    const unsubscribe = () => this._anyListeners.delete(handler);
    if (options?.signal && typeof options.signal.addEventListener === 'function') {
      const signal = options.signal;
      if (signal.aborted) {
        unsubscribe();
      } else {
        signal.addEventListener('abort', unsubscribe, { once: true });
      }
    }
    return unsubscribe;
  }

  emit(type, detail) {
    const event = new CustomEvent(type, { detail });
    this.dispatchEvent(event);
    if (this._anyListeners.size) {
      for (const handler of this._anyListeners) {
        try {
          handler({ type, detail, event, target: this });
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('Helios onAny handler failed', error);
        }
      }
    }
    return event;
  }

  async initialize() {
    this.debug.log('helios', 'Initializing layout');
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    if (this._layout?.setUpdateListener) {
      this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    }
    await this._layout?.initialize?.();
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    this.debug.log('helios', 'Layout initialized', { layout: this._layout?.constructor?.name });
    this._layout?.resize?.(this.layers.size);
    this.debug.log('layout', 'Layout resized to initial viewport', this.layers.size);

    this.debug.log('helios', 'Creating renderer', {
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      renderer: this.options.renderer ?? 'auto',
    });
    const extraStateSlotsRaw = this.options.extraStateSlots ?? 1;
    const extraStateSlots = Number.isFinite(extraStateSlotsRaw) ? Math.max(0, Math.floor(extraStateSlotsRaw)) : 1;
    const stateSlots = Math.min(32, 3 + extraStateSlots);
    this.renderer = await createRenderer(this.layers.canvas, {
      clearColor: this.options.clearColor,
      forceWebGL: this.options.renderer === 'webgl',
      forceWebGPU: this.options.renderer === 'webgpu',
      mode: this.options.mode ?? '2d',
      projection: this.options.projection ?? 'perspective',
      suppressBrowserGestures: this.options.suppressBrowserGestures !== false,
      antialias: this.options.antialias,
      supersampling: this.options.supersampling,
      forceSupersample: this.options.forceSupersample,
      supersamplingAutoFactor: this.options.supersamplingAutoFactor,
      supersamplingAutoThreshold: this.options.supersamplingAutoThreshold,
      edgeRendering: this.options.edgeRendering,
      transparencyModeEdges: this.options.transparencyModeEdges,
      edgeEndpointTrim: this.options.edgeEndpointTrim,
      edgeFastRendering: this.options.edgeFastRendering,
      stateSlots,
    });
    this.debug.log('helios', 'Renderer created', { renderer: this.renderer?.constructor?.name });
    this._applyPendingRendererProps();
    this._applyPositionPipelineToRenderer();
    this._attachDensityLayer();
    this._applyCachedStateStyles();
    this.attributeTracker = new AttributeTracker(this.renderer);
    this.attributeTracker.resize(this.layers.size);
    if (typeof this.renderer.resize === 'function') {
      this.renderer.resize(this.layers.size);
    }
    if (this.mappersDirty) {
      this._applyMappersSafely();
    }
    this.scheduler.setAttributeCallback(
      (frame) => {
        if (!frame) return;
        this.counters.attributeUpdateTicks = bumpCounter(this.counters.attributeUpdateTicks);
        this.attributeTracker?.render(frame, false);
        this.indexPickingTracker?.render(frame, false);
      },
      {
        autoUpdate: this.attributeUpdateOptions.autoUpdate,
        maxFps: this.attributeUpdateOptions.maxFps,
        frameSkip: this.attributeUpdateOptions.frameSkip,
      },
    );
    this.scheduler.setLayoutEventHandlers({
      start: (payload) => {
        this.emit(EVENTS.LAYOUT_START, { ...payload, algo: this._layout?.constructor?.name ?? null });
      },
      stop: (payload) => {
        this.emit(EVENTS.LAYOUT_STOP, { ...payload, algo: this._layout?.constructor?.name ?? null });
        this.scheduler?.requestRender?.();
      },
    });
    if (this.renderer?.camera?.setChangeListener) {
      this.renderer.camera.setChangeListener((detail) => {
        this.scheduler.requestRender();
        if (this._edgeAdaptiveRuntime) {
          const now = performance.now();
          const holdMs = Number(
            this._edgeAdaptiveQualityConfig?.interactionHoldMs
              ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.interactionHoldMs,
          );
          this._edgeAdaptiveRuntime.cameraMovingUntil = now + holdMs;
          this._scheduleEdgeAdaptiveCameraIdleRender();
        }
        if (detail?.origin === 'interaction') {
          this._disableAutomaticCameraControlFromInteraction(detail);
        }
        this._scheduleCameraMove();
        this.debug.log('helios', 'Camera change requested render');
      });
    }

    this.removeResizeListener = this.layers.onResize((size) => {
      this.size = size;
      if (this.renderer?.resize) {
        this.renderer.resize(size);
      }
      this.attributeTracker?.resize(size);
      this.indexPickingTracker?.resize(size);
      this._layout?.resize?.(size);
      this._labels?.requestFullReselect?.('resize');
      this._tryPendingFrameNetwork();
      this._handleResizeAutoFit();
      if (!this.manualRendering) {
        this.scheduler.requestGeometry();
        this.scheduler.requestRender();
        this.debug.log('helios', 'Resize requested geometry/render', size);
      }
      this.emit(EVENTS.RESIZE, { size: { ...size } });
    });

    this.debug.log('scheduler', 'Setting scheduler callbacks');
    this.scheduler.setLayout(this._layout);
    this.scheduler.setGeometryCallback(() => {
      this.counters.geometryFrames = bumpCounter(this.counters.geometryFrames);
      if (this.mappersDirty) {
        this.debug.log('mapper', 'Applying mappers to visuals');
        this._applyMappersSafely();
      }
      const renderNetwork = this._getRenderNetwork();
      const frame = {
        network: renderNetwork,
        timestamp: performance.now(),
        camera: this.renderer?.camera,
      };
      if (!this.firstGeometryUpdateComplete) {
        this.firstGeometryUpdateComplete = true;
        this.debug.log('scheduler', 'First geometry frame ready', {
          nodes: renderNetwork?.nodeCount ?? this.network?.nodeCount,
          edges: renderNetwork?.edgeCount ?? this.network?.edgeCount,
        });
      } else {
        this.debug.log('scheduler', 'Geometry frame prepared', {
          nodes: renderNetwork?.nodeCount ?? this.network?.nodeCount,
          edges: renderNetwork?.edgeCount ?? this.network?.edgeCount,
        });
      }
      this._tryPendingFrameNetwork();
      return frame;
    });
    this.scheduler.setRenderCallback((frame) => {
      this.debug.log('scheduler', 'Rendering frame', {
        renderer: this.renderer?.constructor?.name,
        size: this.size,
      });
      if (this.firstGeometryUpdateComplete && this.renderer && typeof this.renderer.render === 'function') {
        this.counters.renderFrames = bumpCounter(this.counters.renderFrames);
        const now = performance.now();
        const dt = now - this._lastRenderTime;
        this._lastRenderTime = now;
        this._frameId += 1;
        this._updateEdgeAdaptiveQualityBeforeRender(now);
        this.emit(EVENTS.BEFORE_RENDER, { frameId: this._frameId, dt, frame, size: { ...this.size } });
        this.renderer.render(frame, this.size);
        this._updateEdgeAdaptiveQualityAfterRender(
          Number.isFinite(dt) ? dt : null,
          performance.now(),
        );
        this._labels?.update?.({ timestamp: now });
        this._legends?.update?.({ timestamp: now });
        this.emit(EVENTS.AFTER_RENDER, { frameId: this._frameId, dt, frame, size: { ...this.size } });
      }
    });
    this._requestInitialCameraFit();
    if (!this.manualRendering) {
      this.scheduler.start();
      this.scheduler.requestGeometry();
      this.debug.log('scheduler', 'Scheduler started (auto rendering)');
    } else {
      // In manual mode, run initial geometry setup but don't start scheduler
      if (this.mappersDirty) {
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
      }
      this.firstGeometryUpdateComplete = true;
      this.debug.log('helios', 'Manual rendering enabled, initial geometry applied');
    }
    this.debug.log('helios', 'Initialization complete');
    this._applyPickingConfig();
  }

  _applyCachedStateStyles() {
    const layer = this.renderer?.graphLayer ?? null;
    if (!layer) return false;
    const cached = this._stateStyleCache;
    if (!cached) return false;
    if (!cached.nodeSlots.size && !cached.edgeSlots.size && !cached.nodeNoState && !cached.edgeNoState) {
      return false;
    }
    layer.resetStateStyles?.();
    if (cached.nodeNoState) {
      layer.setNodeNoStateStyle?.(cached.nodeNoState);
    }
    if (cached.edgeNoState) {
      layer.setEdgeNoStateStyle?.(cached.edgeNoState);
    }
    for (const [slot, style] of cached.nodeSlots.entries()) {
      layer.setNodeStateStyle?.(slot, style);
    }
    for (const [slot, style] of cached.edgeSlots.entries()) {
      layer.setEdgeStateStyle?.(slot, style);
    }
    return true;
  }

  _withPositionBufferAccess(fn) {
    if (typeof this.visuals?.withBufferAccess === 'function') {
      return this.visuals.withBufferAccess(fn);
    }
    if (typeof this.network?.withBufferAccess === 'function') {
      return this.network.withBufferAccess(fn);
    }
    return fn();
  }

  _readNodePositionViewUnsafe() {
    try {
      return this.network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
    } catch (_) {
      return null;
    }
  }

  _snapshotNodePositions(reuseBuffer = null) {
    let snapshot = null;
    this._withPositionBufferAccess(() => {
      const view = this._readNodePositionViewUnsafe();
      if (!view || !Number.isFinite(view.length) || view.length <= 0) {
        snapshot = null;
        return;
      }
      const out = reuseBuffer && reuseBuffer.length === view.length
        ? reuseBuffer
        : new Float32Array(view.length);
      out.set(view);
      snapshot = out;
    });
    return snapshot;
  }

  _writeNodePositions(values) {
    if (!values || !Number.isFinite(values.length) || values.length <= 0) return false;
    let wrote = false;
    this._withPositionBufferAccess(() => {
      const view = this._readNodePositionViewUnsafe();
      if (!view || !Number.isFinite(view.length) || view.length <= 0) return;
      const count = Math.min(view.length, values.length);
      if (count <= 0) return;
      view.set(values.subarray(0, count), 0);
      wrote = true;
    });
    return wrote;
  }

  _recordLayoutIntervalSample(intervalMs, now = performance.now()) {
    const runtime = this._interpolationRuntime ?? {};
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const dt = Number(intervalMs);
    if (!Number.isFinite(dt) || dt <= 0) return;
    const maxSamples = normalizePositiveInteger(
      config.adaptiveDurationSamples,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationSamples,
      1,
      120,
    );
    const windowMs = normalizeNonNegativeNumber(
      config.adaptiveDurationWindowMs,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationWindowMs,
      100,
      60000,
    );
    const samples = Array.isArray(runtime.layoutIntervalsMs) ? runtime.layoutIntervalsMs : [];
    samples.push({ dt, ts: now });
    const cutoff = now - windowMs;
    const recent = samples.filter((entry) => entry && Number.isFinite(entry.ts) && entry.ts >= cutoff);
    if (recent.length > maxSamples) {
      recent.splice(0, recent.length - maxSamples);
    }
    runtime.layoutIntervalsMs = recent;
    this._interpolationRuntime = runtime;
  }

  _resolveInterpolationDurationMs(now = performance.now()) {
    const runtime = this._interpolationRuntime ?? {};
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const durationMode = resolveInterpolationDurationMode(config);
    const fixedDuration = normalizeNonNegativeNumber(
      config.durationMs,
      POSITION_INTERPOLATION_DEFAULTS.durationMs,
      0,
      60000,
    );
    if (durationMode !== 'adaptive') {
      return fixedDuration;
    }
    const samples = Array.isArray(runtime.layoutIntervalsMs) ? runtime.layoutIntervalsMs : [];
    if (samples.length === 0) {
      return fixedDuration;
    }
    const maxSamples = normalizePositiveInteger(
      config.adaptiveDurationSamples,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationSamples,
      1,
      120,
    );
    const windowMs = normalizeNonNegativeNumber(
      config.adaptiveDurationWindowMs,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationWindowMs,
      100,
      60000,
    );
    const cutoff = now - windowMs;
    const recent = samples.filter((entry) => entry && Number.isFinite(entry.ts) && entry.ts >= cutoff);
    if (recent.length === 0) {
      return fixedDuration;
    }
    const windowed = recent.length > maxSamples ? recent.slice(recent.length - maxSamples) : recent;
    const sum = windowed.reduce((acc, entry) => acc + entry.dt, 0);
    const average = sum / windowed.length;
    const scale = normalizeNonNegativeNumber(
      config.adaptiveDurationScale,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationScale,
      0,
      16,
    );
    const minDuration = normalizeNonNegativeNumber(
      config.adaptiveDurationMinMs,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationMinMs,
      0,
      60000,
    );
    const maxDuration = normalizeNonNegativeNumber(
      config.adaptiveDurationMaxMs,
      POSITION_INTERPOLATION_DEFAULTS.adaptiveDurationMaxMs,
      minDuration,
      60000,
    );
    const adaptive = average * scale;
    if (!Number.isFinite(adaptive)) return fixedDuration;
    return Math.max(minDuration, Math.min(maxDuration, adaptive));
  }

  _computeInterpolationFactor(now = performance.now()) {
    const runtime = this._interpolationRuntime ?? null;
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    if (!runtime) return 1;
    const durationMs = Number.isFinite(runtime.effectiveDurationMs)
      ? Math.max(0, Number(runtime.effectiveDurationMs))
      : this._resolveInterpolationDurationMs(now);
    runtime.effectiveDurationMs = durationMs;
    if (durationMs <= 0) return 1;
    const startedAt = Number.isFinite(runtime.startedAt) ? runtime.startedAt : now;
    const elapsed = Math.max(0, now - startedAt);
    const linear = clamp01(elapsed / durationMs, 1);
    return applyInterpolationEasing(config.easing, linear);
  }

  _resolveInterpolationSourceSnapshot(now, targetPositions) {
    if (!targetPositions || !targetPositions.length) return null;
    const runtime = this._interpolationRuntime ?? null;
    if (!runtime) return new Float32Array(targetPositions);
    const count = targetPositions.length;
    const source = runtime.sourcePositions;
    const target = runtime.targetPositions;
    if (
      runtime.active === true
      && source && target
      && source.length === count
      && target.length === count
    ) {
      const factor = this._computeInterpolationFactor(now);
      const mixed = new Float32Array(count);
      mixPositionsArray(source, target, mixed, factor);
      return mixed;
    }
    if (runtime.lastRenderedPositions && runtime.lastRenderedPositions.length === count) {
      return new Float32Array(runtime.lastRenderedPositions);
    }
    return new Float32Array(targetPositions);
  }

  _prepareInterpolationRuntimeForTarget(targetPositions, now, layoutElapsedMs) {
    const runtime = this._interpolationRuntime ?? {};
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const sourcePositions = this._resolveInterpolationSourceSnapshot(now, targetPositions);
    const sourceCount = Math.floor((targetPositions?.length ?? 0) / 3);
    const displacementRatio = computePositionDisplacementRatio(sourcePositions, targetPositions);
    const minDisplacement = Number.isFinite(config.minDisplacementRatio)
      ? Math.max(0, Number(config.minDisplacementRatio))
      : POSITION_INTERPOLATION_DEFAULTS.minDisplacementRatio;
    const durationMs = this._resolveInterpolationDurationMs(now);
    const shouldInterpolate = Boolean(
      config.enabled === true
      && sourcePositions
      && targetPositions
      && sourcePositions.length === targetPositions.length
      && durationMs > 0
      && displacementRatio >= minDisplacement
      && !arePositionArraysEqual(sourcePositions, targetPositions),
    );

    runtime.active = shouldInterpolate;
    runtime.startedAt = now;
    runtime.lastFrameAt = now;
    runtime.lastTargetUpdateAt = now;
    runtime.layoutElapsedMs = Number.isFinite(layoutElapsedMs) ? Math.max(1, layoutElapsedMs) : 16;
    runtime.sourcePositions = sourcePositions;
    runtime.targetPositions = targetPositions;
    runtime.mixedPositions = runtime.mixedPositions && runtime.mixedPositions.length === targetPositions.length
      ? runtime.mixedPositions
      : new Float32Array(targetPositions.length);
    runtime.sourceVersion = ((runtime.sourceVersion ?? 0) + 1) % Number.MAX_SAFE_INTEGER;
    runtime.targetVersion = ((runtime.targetVersion ?? 0) + 1) % Number.MAX_SAFE_INTEGER;
    runtime.sourceCount = sourceCount;
    runtime.factor = shouldInterpolate ? 0 : 1;
    runtime.sourceWebGPUBuffer = null;
    runtime.sourceWebGLTexture = null;
    runtime.sourceTextureMeta = null;
    runtime.delegateVersion = null;
    runtime.effectiveDurationMs = durationMs;
    runtime.lastRenderedPositions = sourcePositions
      ? new Float32Array(shouldInterpolate ? sourcePositions : targetPositions)
      : null;
    this._interpolationRuntime = runtime;

    return { shouldInterpolate, mode: 'gpu', displacementRatio, durationMs };
  }

  _stepGpuInterpolation(now) {
    const runtime = this._interpolationRuntime ?? null;
    if (!runtime?.sourcePositions || !runtime?.targetPositions) return false;
    const factor = this._computeInterpolationFactor(now);
    runtime.factor = factor;
    runtime.lastFrameAt = now;
    if (
      runtime.lastRenderedPositions
      && runtime.lastRenderedPositions.length === runtime.targetPositions.length
    ) {
      mixPositionsArray(
        runtime.sourcePositions,
        runtime.targetPositions,
        runtime.lastRenderedPositions,
        factor,
      );
    } else {
      runtime.lastRenderedPositions = new Float32Array(runtime.targetPositions);
      mixPositionsArray(
        runtime.sourcePositions,
        runtime.targetPositions,
        runtime.lastRenderedPositions,
        factor,
      );
    }
    return factor < 1;
  }

  _runInterpolationRenderPump(timestamp = performance.now()) {
    const now = Number.isFinite(timestamp) ? timestamp : performance.now();
    const runtime = this._interpolationRuntime ?? null;
    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const cameraKeepRunning = this._stepCameraControlRenderPump(now);
    if (!runtime || config.enabled !== true || runtime.active !== true) {
      this._applyPositionPipelineToRenderer();
      return cameraKeepRunning;
    }
    const mode = normalizeInterpolationMode(config.mode);
    const keepRunning = this._stepGpuInterpolation(now);
    runtime.active = keepRunning;
    if (!keepRunning) {
      runtime.factor = 1;
      if (runtime.targetPositions) {
        runtime.lastRenderedPositions = new Float32Array(runtime.targetPositions);
      }
      runtime.sourcePositions = null;
      runtime.targetPositions = null;
      runtime.mixedPositions = null;
      runtime.sourceCount = 0;
      runtime.sourceWebGPUBuffer = null;
      runtime.sourceWebGLTexture = null;
      runtime.sourceTextureMeta = null;
    }
    this._applyPositionPipelineToRenderer();
    return keepRunning || cameraKeepRunning;
  }

  _handleLayoutUpdate(payload = {}) {
    const pendingHandoff = this._pendingLayoutHandoff ?? null;
    if (pendingHandoff && pendingHandoff.nextLayout === this._layout) {
      return;
    }
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: true });
    const now = Number.isFinite(payload?.timestamp) ? Number(payload.timestamp) : performance.now();
    const previousTargetAt = Number.isFinite(this._interpolationRuntime?.lastTargetUpdateAt)
      ? this._interpolationRuntime.lastTargetUpdateAt
      : now;
    const layoutElapsedMs = Number.isFinite(payload?.layoutElapsedMs)
      ? Math.max(1, Number(payload.layoutElapsedMs))
      : Math.max(1, now - previousTargetAt);
    this._recordLayoutIntervalSample(layoutElapsedMs, now);
    this._markAutoFitDirty(false);
    const delegateSourceActive = this._positionsConfig?.source === 'delegate'
      && Boolean(this._positionsConfig?.delegate);
    const targetPositions = delegateSourceActive ? null : this._snapshotNodePositions();
    const handoffAdopted = payload?.handoffAdopted === true;
    if (targetPositions && handoffAdopted) {
      const runtime = this._interpolationRuntime ?? {};
      runtime.active = false;
      runtime.factor = 1;
      runtime.lastTargetUpdateAt = now;
      runtime.layoutElapsedMs = layoutElapsedMs;
      runtime.effectiveDurationMs = this._resolveInterpolationDurationMs(now);
      runtime.lastRenderedPositions = new Float32Array(targetPositions);
      runtime.sourcePositions = null;
      runtime.targetPositions = null;
      runtime.mixedPositions = null;
      runtime.sourceCount = Math.floor(targetPositions.length / 3);
      runtime.sourceVersion = ((runtime.sourceVersion ?? 0) + 1) % Number.MAX_SAFE_INTEGER;
      runtime.sourceWebGPUBuffer = null;
      runtime.sourceWebGLTexture = null;
      runtime.sourceTextureMeta = null;
      this._interpolationRuntime = runtime;
      this._applyPositionPipelineToRenderer();
      this.visuals.markPositionsDirty();
      this.scheduler.requestGeometry();
      this._labels?.requestFullReselect?.('layout-update');
      this.debug.log('layout', 'Layout update adopted handoff baseline without interpolation');
      return;
    }
    if (targetPositions && this._interpolationConfig?.enabled === true) {
      const { shouldInterpolate, mode, displacementRatio, durationMs } = this._prepareInterpolationRuntimeForTarget(
        targetPositions,
        now,
        layoutElapsedMs,
      );
      if (shouldInterpolate) {
        this.scheduler.requestRender();
      }
      this.debug.log('layout', 'Layout update prepared interpolation', {
        mode,
        enabled: shouldInterpolate,
        displacementRatio,
        durationMs,
        durationMode: resolveInterpolationDurationMode(this._interpolationConfig),
        adaptiveDuration: this._interpolationConfig?.adaptiveDuration === true,
      });
    } else if (targetPositions || delegateSourceActive) {
      const runtime = this._interpolationRuntime ?? {};
      runtime.active = false;
      runtime.factor = 1;
      runtime.lastTargetUpdateAt = now;
      runtime.layoutElapsedMs = layoutElapsedMs;
      runtime.effectiveDurationMs = this._resolveInterpolationDurationMs(now);
      runtime.lastRenderedPositions = targetPositions ? new Float32Array(targetPositions) : null;
      runtime.sourcePositions = null;
      runtime.targetPositions = null;
      runtime.mixedPositions = null;
      if (delegateSourceActive) {
        runtime.sourceVersion = ((runtime.sourceVersion ?? 0) + 1) % Number.MAX_SAFE_INTEGER;
      }
      runtime.sourceCount = targetPositions
        ? Math.floor(targetPositions.length / 3)
        : Math.max(0, Math.floor(Number(this._getRenderNetwork()?.nodeCount ?? 0)));
      runtime.sourceWebGPUBuffer = null;
      runtime.sourceWebGLTexture = null;
      runtime.sourceTextureMeta = null;
      this._interpolationRuntime = runtime;
    }
    this._applyPositionPipelineToRenderer();
    this.visuals.markPositionsDirty();
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('layout-update');
    this.debug.log('layout', 'Layout requested geometry update');
  }

  _applyPendingRendererProps() {
    const renderer = this.renderer;
    const graphLayer = renderer?.graphLayer;
    if (renderer && this._pendingRendererProps.size) {
      for (const [key, value] of this._pendingRendererProps.entries()) {
        renderer[key] = value;
      }
      this._pendingRendererProps.clear();
    }
    if (graphLayer && this._pendingGraphLayerProps.size) {
      for (const [key, value] of this._pendingGraphLayerProps.entries()) {
        graphLayer[key] = value;
      }
      this._pendingGraphLayerProps.clear();
    }
  }

  _invokePositionDelegateHook(delegate, hookNames) {
    if (!delegate || !hookNames?.length) return;
    const context = this._buildPositionDelegateContext();
    for (const hookName of hookNames) {
      if (typeof delegate?.[hookName] !== 'function') continue;
      try {
        delegate[hookName](context);
      } catch (error) {
        this.debug.log('layout', `Position delegate ${hookName} failed`, { error });
      }
      return;
    }
  }

  _buildPositionDelegateContext(extra = {}) {
    const renderer = this.renderer ?? null;
    const rendererDevice = renderer?.device ?? null;
    const scope = extra?.scope ?? null;
    const activeLayoutDelegate = this._layout && typeof this._layout.getPositionDelegate === 'function'
      ? (this._layout.getPositionDelegate() ?? null)
      : null;
    const usesLayoutDelegate = activeLayoutDelegate
      && activeLayoutDelegate === (this._positionsConfig?.delegate ?? null);
    const defaultNetwork = scope === 'layout' || usesLayoutDelegate
      ? this._getLayoutNetwork()
      : this._getRenderNetwork();
    return {
      helios: this,
      network: extra.network ?? defaultNetwork,
      visuals: this.visuals,
      renderer,
      scheduler: this.scheduler ?? null,
      backend: rendererDevice?.type ?? null,
      device: rendererDevice?.device ?? null,
      gl: rendererDevice?.gl ?? null,
      ...extra,
    };
  }

  _validatePositionDelegate(delegate) {
    if (!delegate) return null;
    if (!(delegate instanceof PositionDelegate)) {
      throw new TypeError(
        'positions({ source: "delegate" }) expects delegate to be an instance of PositionDelegate',
      );
    }
    const hasProvider = (
      typeof delegate.getNodePositionView === 'function'
      || typeof delegate.getPositionView === 'function'
      || typeof delegate.getWebGPUPositionBuffer === 'function'
      || typeof delegate.getWebGLPositionTexture === 'function'
      || typeof delegate.getGpuPositionResource === 'function'
      || typeof delegate.getPositionResource === 'function'
    );
    if (!hasProvider) {
      throw new Error(
        'PositionDelegate must expose at least one position provider (CPU view, WebGL texture, or WebGPU buffer)',
      );
    }
    return delegate;
  }

  _resolveLayoutPositionPolicy(layout = this._layout) {
    if (!layout || typeof layout !== 'object') {
      return { source: 'network', delegate: null };
    }
    if (typeof layout.getPositionDelegate !== 'function') {
      return { source: 'network', delegate: null };
    }
    const delegate = layout.getPositionDelegate() ?? null;
    if (!delegate) {
      return { source: 'network', delegate: null };
    }
    return {
      source: 'delegate',
      delegate: this._validatePositionDelegate(delegate),
    };
  }

  _enforcePositionSourcePolicy(layout = this._layout, options = {}) {
    const current = this._positionsConfig ?? { source: 'network', delegate: null };
    const policy = this._resolveLayoutPositionPolicy(layout);
    const prevActiveDelegate = current.source === 'delegate' ? (current.delegate ?? null) : null;
    const nextActiveDelegate = policy.source === 'delegate' ? (policy.delegate ?? null) : null;
    const changed = current.source !== policy.source || current.delegate !== policy.delegate;
    if (!changed) {
      this._applyPositionPipelineToRenderer();
      return false;
    }
    if (prevActiveDelegate && prevActiveDelegate !== nextActiveDelegate) {
      this._detachPositionDelegate(prevActiveDelegate);
    }
    this._positionsConfig = {
      source: policy.source,
      delegate: policy.delegate ?? null,
    };
    this._resetCameraDelegateSnapshot();
    if (nextActiveDelegate && nextActiveDelegate !== prevActiveDelegate) {
      this._attachPositionDelegate(nextActiveDelegate);
    }
    if (options.resetInterpolation !== false) {
      this._resetInterpolationRuntime({ keepLastRendered: false });
    } else {
      this._applyPositionPipelineToRenderer();
    }
    if (options.requestGeometry !== false) {
      this.scheduler?.requestGeometry?.();
    }
    if (options.requestRender !== false) {
      this.scheduler?.requestRender?.();
    }
    if (options.requestLabels !== false) {
      this._labels?.requestFullReselect?.('positions-policy');
    }
    return true;
  }

  _attachPositionDelegate(delegate) {
    const next = delegate ?? null;
    if (!next || this._activePositionDelegate === next) return;
    this._activePositionDelegate = next;
    this._invokePositionDelegateHook(next, ['onAttach', 'attach']);
  }

  _detachPositionDelegate(delegate) {
    const active = delegate ?? this._activePositionDelegate ?? null;
    if (!active) return;
    this._invokePositionDelegateHook(active, ['onDetach', 'detach']);
    if (this._activePositionDelegate === active) {
      this._activePositionDelegate = null;
    }
  }

  _resolveLayoutHandoffContext() {
    const pending = this._pendingLayoutHandoff ?? null;
    const currentPositions = this._positionsConfig ?? { source: 'network', delegate: null };
    const outgoingDelegate = currentPositions.source === 'delegate'
      ? (currentPositions.delegate ?? null)
      : null;
    const retainedLayout = pending?.retainedDelegate && pending.retainedDelegate === outgoingDelegate
      ? (pending.retainedLayout ?? null)
      : null;
    return {
      pending,
      outgoingDelegate,
      outgoingLayout: retainedLayout ?? this._layout ?? null,
      staleLayout: retainedLayout && retainedLayout !== this._layout
        ? this._layout ?? null
        : null,
    };
  }

  _disposePendingLayoutHandoff(options = {}) {
    const pending = this._pendingLayoutHandoff ?? null;
    this._pendingLayoutHandoff = null;
    if (pending?.retainedLayout && options.disposeRetained !== false) {
      pending.retainedLayout.dispose?.();
    }
    if (pending?.staleLayout && pending.staleLayout !== pending.retainedLayout) {
      pending.staleLayout.dispose?.();
    }
    return pending;
  }

  _startLayoutPositionHandoff({ previousLayout = null, previousDelegate = null, nextLayout = null } = {}) {
    if (!previousDelegate || !nextLayout || typeof this.snapshotDelegatePositions !== 'function') {
      return false;
    }

    this._disposePendingLayoutHandoff();
    const token = ((this._layoutHandoffToken ?? 0) + 1) >>> 0;
    this._layoutHandoffToken = token;
    nextLayout.beginPositionHandoff?.();
    nextLayout.adoptHandoffState?.({
      alpha: this._readLayoutAlpha(previousLayout),
    });
    this._pendingLayoutHandoff = {
      token,
      retainedLayout: previousLayout,
      retainedDelegate: previousDelegate,
      staleLayout: null,
      nextLayout,
    };

    Promise.resolve()
      .then(() => this.snapshotDelegatePositions({
        delegate: previousDelegate,
        network: previousLayout?.network ?? previousDelegate?._context?.network ?? this._getLayoutNetwork(),
        scope: 'layout',
      }))
      .catch((error) => {
        console.warn('Helios.layout(): failed to snapshot delegate positions during layout handoff.', error);
        return null;
      })
      .then((snapshot) => {
        this._finishLayoutPositionHandoff(token, snapshot);
      })
      .catch(() => {});

    return true;
  }

  _readLayoutAlpha(layout = null) {
    const direct = Number(layout?.alpha);
    if (Number.isFinite(direct)) return direct;
    const settings = Number(layout?.settings?.alpha);
    if (Number.isFinite(settings)) return settings;
    const delegate = layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null;
    const delegateAlpha = Number(delegate?.alpha);
    if (Number.isFinite(delegateAlpha)) return delegateAlpha;
    const options = Number(layout?.options?.alpha);
    if (Number.isFinite(options)) return options;
    return NaN;
  }

  _computePositionSnapshotCenter(snapshot = null, network = null) {
    if (!(snapshot instanceof Float32Array) || snapshot.length < 3) return null;
    const readNodeIndices = () => network?.nodeIndices instanceof Uint32Array ? network.nodeIndices : null;
    let nodeIndices = null;
    if (typeof network?.withBufferAccess === 'function') {
      network.withBufferAccess(() => {
        nodeIndices = readNodeIndices();
      });
    } else {
      nodeIndices = readNodeIndices();
    }

    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let count = 0;
    const visitNode = (nodeId) => {
      const base = (nodeId >>> 0) * 3;
      if ((base + 2) >= snapshot.length) return;
      const x = Number(snapshot[base]);
      const y = Number(snapshot[base + 1]);
      const z = Number(snapshot[base + 2]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
      sumX += x;
      sumY += y;
      sumZ += z;
      count += 1;
    };

    if (nodeIndices?.length) {
      for (let i = 0; i < nodeIndices.length; i += 1) {
        visitNode(nodeIndices[i]);
      }
    } else {
      const nodeCount = Math.floor(snapshot.length / 3);
      for (let nodeId = 0; nodeId < nodeCount; nodeId += 1) {
        visitNode(nodeId);
      }
    }

    if (count <= 0) return null;
    return [sumX / count, sumY / count, sumZ / count];
  }

  _finishLayoutPositionHandoff(token, snapshot = null) {
    const pending = this._pendingLayoutHandoff ?? null;
    if (!pending || pending.token !== token) return false;
    this._pendingLayoutHandoff = null;

    const nextLayout = pending.nextLayout ?? null;
    if (nextLayout && this._layout === nextLayout) {
      const snapshotCenter = this._computePositionSnapshotCenter(snapshot, nextLayout?.network ?? null);
      if (snapshotCenter) {
        nextLayout.adoptHandoffState?.({ center: snapshotCenter });
      }
      nextLayout.completePositionHandoff?.(snapshot, { emitUpdate: false });
      this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
      const runtime = this._resetInterpolationRuntime({ keepLastRendered: false, keepIntervalHistory: true });
      if (snapshot instanceof Float32Array && snapshot.length > 0) {
        runtime.lastRenderedPositions = new Float32Array(snapshot);
      }
      this._interpolationRuntime = runtime;
      this._applyPositionPipelineToRenderer();
      this.scheduler?.requestLayout?.('layout-handoff');
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
      this._labels?.requestFullReselect?.('layout-handoff');
    }

    pending.retainedLayout?.dispose?.();
    if (pending.staleLayout && pending.staleLayout !== pending.retainedLayout) {
      pending.staleLayout.dispose?.();
    }
    return true;
  }

  _resetInterpolationRuntime({ keepLastRendered = false, keepIntervalHistory = true } = {}) {
    const runtime = this._interpolationRuntime ?? {};
    const previousIntervals = Array.isArray(runtime.layoutIntervalsMs) ? runtime.layoutIntervalsMs : [];
    runtime.active = false;
    runtime.startedAt = 0;
    runtime.lastFrameAt = 0;
    runtime.lastTargetUpdateAt = 0;
    runtime.layoutElapsedMs = 16;
    runtime.sourcePositions = null;
    runtime.targetPositions = null;
    runtime.mixedPositions = null;
    runtime.sourceVersion = 0;
    runtime.targetVersion = 0;
    runtime.sourceCount = 0;
    runtime.factor = 1;
    runtime.delegateVersion = null;
    runtime.sourceWebGPUBuffer = null;
    runtime.sourceWebGLTexture = null;
    runtime.sourceTextureMeta = null;
    runtime.effectiveDurationMs = this._resolveInterpolationDurationMs(performance.now());
    runtime.layoutIntervalsMs = keepIntervalHistory ? previousIntervals : [];
    if (!keepLastRendered) {
      runtime.lastRenderedPositions = null;
    }
    this._interpolationRuntime = runtime;
    this._applyPositionPipelineToRenderer();
    return runtime;
  }

  _applyPositionPipelineToRenderer() {
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (!graphLayer) return false;
    const activeDelegate = this._positionsConfig?.source === 'delegate'
      ? (this._positionsConfig?.delegate ?? null)
      : null;
    if (typeof graphLayer.setPositionDelegate === 'function') {
      graphLayer.setPositionDelegate(activeDelegate);
    } else {
      graphLayer.positionDelegate = activeDelegate;
    }

    const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
    const runtime = this._interpolationRuntime ?? {};
    const useGpuInterpolation = config.enabled === true
      && normalizeInterpolationMode(config.mode) === 'gpu'
      && runtime.active === true;
    const interpolationState = {
      enabled: useGpuInterpolation,
      factor: useGpuInterpolation ? clamp01(runtime.factor, 1) : 1,
      sourceVersion: Number.isFinite(runtime.sourceVersion) ? runtime.sourceVersion : 0,
      sourceCount: Number.isFinite(runtime.sourceCount) ? runtime.sourceCount : 0,
      sourceView: useGpuInterpolation ? (runtime.sourcePositions ?? null) : null,
      sourceWebGPUBuffer: useGpuInterpolation ? (runtime.sourceWebGPUBuffer ?? null) : null,
      sourceWebGLTexture: useGpuInterpolation ? (runtime.sourceWebGLTexture ?? null) : null,
      sourceTextureMeta: useGpuInterpolation ? (runtime.sourceTextureMeta ?? null) : null,
    };
    if (typeof graphLayer.setPositionInterpolationState === 'function') {
      graphLayer.setPositionInterpolationState(interpolationState);
    } else {
      graphLayer.positionInterpolation = interpolationState;
    }
    return true;
  }

  _refreshUIBindings() {
    const bindings = this.constructor.UI_BINDINGS ?? null;
    if (!bindings) return;
    for (const name of Object.keys(bindings)) {
      if (typeof this[name] !== 'function') continue;
      const value = this[name]();
      this._emitUIBindingChange(name, value);
    }
  }

  _attachDensityLayer() {
    const renderer = this.renderer ?? null;
    if (!renderer || typeof renderer.addLayer !== 'function') return false;
    const existing = this._densityLayer ?? null;
    if (existing && existing.device === renderer.device) {
      this._applyDensityConfigToLayer();
      return true;
    }
    if (existing) {
      try {
        renderer.removeLayer(existing);
      } catch (_) {
        // ignore: layer may belong to a previous renderer instance
      }
      this._densityLayer = null;
    }
    const densityLayer = new DensityLayer({
      initialConfig: this._densityConfig,
      getGraphLayer: () => this.renderer?.graphLayer ?? null,
      withBufferAccess: (fn) => this._withPositionBufferAccess(fn),
      getNodePositionView: (network) => {
        if (!network) return null;
        try {
          return network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view ?? null;
        } catch (_) {
          return null;
        }
      },
      getNodePositionInfo: (network) => {
        if (!network) return { view: null, version: null, count: 0 };
        try {
          const buffer = network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE) ?? null;
          const view = buffer?.view ?? null;
          const count = view && Number.isFinite(view.length) ? Math.floor(view.length / 3) : 0;
          const version = Number.isFinite(buffer?.version) ? Number(buffer.version) : null;
          return { view, version, count };
        } catch (_) {
          return { view: null, version: null, count: 0 };
        }
      },
      onRuntimeState: (state) => {
        if (!state || typeof state !== 'object') return;
        this._densityRuntime = { ...this._densityRuntime, ...state };
      },
    });
    renderer.addLayer(densityLayer, { before: renderer.graphLayer ?? 'graph-layer' });
    this._densityLayer = densityLayer;
    this._applyDensityConfigToLayer();
    return true;
  }

  _applyDensityConfigToLayer() {
    this._densityLayer?.setConfig?.(this._densityConfig);
  }

  _queueRenderRequest() {
    if (!this.scheduler?.requestRender) return;
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => this.scheduler?.requestRender?.());
      return;
    }
    Promise.resolve().then(() => this.scheduler?.requestRender?.());
  }

  _clearEdgeAdaptiveTimer(name) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const timer = runtime?.[name] ?? null;
    if (timer != null) {
      clearTimeout(timer);
      runtime[name] = null;
    }
  }

  _scheduleEdgeAdaptiveCameraIdleRender() {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    if (!runtime || !config.enabled || config.fastDuringCamera !== true) return;
    this._clearEdgeAdaptiveTimer('cameraIdleTimer');
    const delay = Math.max(0, Number(config.interactionHoldMs ?? 0));
    runtime.cameraIdleTimer = setTimeout(() => {
      runtime.cameraIdleTimer = null;
      this.scheduler?.requestRender?.();
    }, delay);
  }

  _scheduleEdgeAdaptiveProbe() {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    if (!runtime) return;
    this._clearEdgeAdaptiveTimer('probeTimer');
    if (!Number.isFinite(runtime.nextProbeAt)) return;
    const delay = Math.max(0, runtime.nextProbeAt - performance.now());
    runtime.probeTimer = setTimeout(() => {
      runtime.probeTimer = null;
      this.scheduler?.requestRender?.();
    }, delay);
  }

  _edgeAdaptiveEdgesVisible() {
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (!graphLayer || typeof graphLayer.shouldRenderEdges !== 'function') return false;
    try {
      return graphLayer.shouldRenderEdges() === true;
    } catch (_) {
      return false;
    }
  }

  _clearEdgeAdaptiveQualitySamples() {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    if (!runtime) return;
    runtime.qualityFrameSamples = [];
    runtime.qualityFrameAverageMs = null;
    runtime.fastFrameSamples = [];
    runtime.fastFrameAverageMs = null;
  }

  _resolveEdgeAdaptiveActivity(now = performance.now()) {
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const layoutState = typeof this.scheduler?.getLayoutState === 'function'
      ? this.scheduler.getLayoutState()
      : (this.scheduler?.layoutEnabled !== false ? 'running' : 'stopped');
    const layoutActive = config.fastDuringLayout === true && layoutState === 'running';
    const cameraActive = config.fastDuringCamera === true
      && Number.isFinite(runtime?.cameraMovingUntil)
      && now < runtime.cameraMovingUntil;
    return {
      layoutActive,
      cameraActive,
      active: layoutActive || cameraActive,
    };
  }

  _pushEdgeAdaptiveQualitySample(renderMs) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    if (!runtime || !Number.isFinite(renderMs)) {
      return { averageMs: null, sampleCount: 0, targetCount: 0 };
    }
    const targetCount = normalizePositiveInteger(
      config.averageWindowFrames ?? config.slowFrameConsecutiveFrames,
      EDGE_ADAPTIVE_QUALITY_DEFAULTS.averageWindowFrames,
      1,
      240,
    );
    const samples = Array.isArray(runtime.qualityFrameSamples) ? runtime.qualityFrameSamples : [];
    samples.push(Number(renderMs));
    if (samples.length > targetCount) {
      samples.splice(0, samples.length - targetCount);
    }
    runtime.qualityFrameSamples = samples;
    runtime.qualityFrameAverageMs = samples.length > 0
      ? (samples.reduce((sum, value) => sum + value, 0) / samples.length)
      : null;
    return {
      averageMs: runtime.qualityFrameAverageMs,
      sampleCount: samples.length,
      targetCount,
    };
  }

  _pushEdgeAdaptiveFastSample(renderMs) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    if (!runtime || !Number.isFinite(renderMs)) {
      return { averageMs: null, sampleCount: 0, targetCount: 0 };
    }
    const targetCount = normalizePositiveInteger(
      config.averageWindowFrames ?? config.slowFrameConsecutiveFrames,
      EDGE_ADAPTIVE_QUALITY_DEFAULTS.averageWindowFrames,
      1,
      240,
    );
    const samples = Array.isArray(runtime.fastFrameSamples) ? runtime.fastFrameSamples : [];
    samples.push(Number(renderMs));
    if (samples.length > targetCount) {
      samples.splice(0, samples.length - targetCount);
    }
    runtime.fastFrameSamples = samples;
    runtime.fastFrameAverageMs = samples.length > 0
      ? (samples.reduce((sum, value) => sum + value, 0) / samples.length)
      : null;
    return {
      averageMs: runtime.fastFrameAverageMs,
      sampleCount: samples.length,
      targetCount,
    };
  }

  _readLayoutAlphaMin(layout = null) {
    const settings = Number(layout?.settings?.alphaMin);
    if (Number.isFinite(settings)) return settings;
    const options = Number(layout?.options?.alphaMin);
    if (Number.isFinite(options)) return options;
    const delegate = layout?.getPositionDelegate?.() ?? layout?.positionDelegate ?? null;
    const delegateAlphaMin = Number(delegate?.alphaMin);
    if (Number.isFinite(delegateAlphaMin)) return delegateAlphaMin;
    return NaN;
  }

  _computeEdgeAdaptiveProbeDelay(failedProbeCount = 0) {
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const base = Math.max(0, Number(config.probeIntervalMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.probeIntervalMs));
    if (!(base > 0)) return 0;
    const failures = Math.max(0, Math.floor(Number(failedProbeCount) || 0));
    const scaled = base * (EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.backoffFactor ** failures);
    return Math.min(
      Math.max(base, scaled),
      EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.maxBackoffMs,
    );
  }

  _shouldAttemptEdgeAdaptiveLayoutProbe(now = performance.now()) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    if (!runtime) return false;
    if (!(Number.isFinite(runtime.nextProbeAt) && now >= runtime.nextProbeAt)) return false;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const targetFastAverage = Number(config.slowFrameThresholdMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.slowFrameThresholdMs)
      * EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.exitThresholdFactor;
    const fastAverage = Number(runtime.fastFrameAverageMs);
    if (Number.isFinite(fastAverage) && fastAverage > targetFastAverage) return false;
    const currentAlpha = this._readLayoutAlpha(this._layout ?? null);
    if (Number.isFinite(currentAlpha)) {
      const fallbackAlpha = Number.isFinite(runtime.performanceFallbackAlpha)
        ? runtime.performanceFallbackAlpha
        : currentAlpha;
      const alphaMin = this._readLayoutAlphaMin(this._layout ?? null);
      const alphaThreshold = Math.max(
        fallbackAlpha * EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.alphaProbeFactor,
        Number.isFinite(alphaMin)
          ? alphaMin * EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.alphaMinMultiplier
          : Number.NEGATIVE_INFINITY,
      );
      if (currentAlpha > alphaThreshold) return false;
    }
    return true;
  }

  _emitEdgeAdaptiveQualityChange() {
    this._emitUIBindingChange('edgeAdaptiveQuality', this.edgeAdaptiveQuality());
  }

  _emitEdgeAdaptiveQualityConfigBindings() {
    const value = this.edgeAdaptiveQuality();
    this._emitUIBindingChange('edgeAdaptiveQuality', value);
    this._emitUIBindingChange('edgeAdaptiveQualityEnabled', value.enabled);
    this._emitUIBindingChange('edgeAdaptiveQualitySlowFrameThresholdMs', value.slowFrameThresholdMs);
    this._emitUIBindingChange('edgeAdaptiveQualitySlowFrameConsecutiveFrames', value.slowFrameConsecutiveFrames);
    this._emitUIBindingChange('edgeAdaptiveQualityProbeIntervalMs', value.probeIntervalMs);
    this._emitUIBindingChange('edgeAdaptiveQualityInteractionHoldMs', value.interactionHoldMs);
    this._emitUIBindingChange('edgeAdaptiveQualityFastDuringCamera', value.fastDuringCamera);
    this._emitUIBindingChange('edgeAdaptiveQualityFastDuringLayout', value.fastDuringLayout);
  }

  _setAdaptiveEdgeFastRendering(enabled, reason = null, options = {}) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const graphLayer = this.renderer?.graphLayer ?? null;
    const next = enabled === true;
    const previous = graphLayer?.edgeAdaptiveFastRendering === true;
    const previousReason = runtime?.reason ?? null;
    if (graphLayer) {
      graphLayer.setAdaptiveEdgeFastRendering?.(next);
    } else {
      this._pendingGraphLayerProps.set('edgeAdaptiveFastRendering', next);
    }
    if (runtime) {
      runtime.reason = reason ?? (next ? 'performance' : 'quality');
    }
    const changed = previous !== next || previousReason !== (runtime?.reason ?? null);
    if (changed) {
      this._emitEdgeAdaptiveQualityChange();
      if (options.requestRender === true) {
        this._queueRenderRequest();
      }
    }
    return changed;
  }

  _resolveEdgeAdaptiveFastState(now = performance.now()) {
    const graphLayer = this.renderer?.graphLayer ?? null;
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const manualFast = graphLayer?.edgeFastRendering === true;
    const adaptiveFast = graphLayer?.edgeAdaptiveFastRendering === true;
    if (runtime?.forceHighQuality === true) {
      return { fast: false, reason: 'export' };
    }
    if (!this._edgeAdaptiveEdgesVisible()) {
      return { fast: false, reason: 'hidden' };
    }
    if (manualFast) {
      return { fast: false, reason: 'manual' };
    }
    if (!(this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS).enabled) {
      return { fast: false, reason: 'disabled' };
    }
    const activity = this._resolveEdgeAdaptiveActivity(now);
    if (!activity.active) {
      return { fast: false, reason: 'quality' };
    }
    if (adaptiveFast && runtime?.reason === 'performance') {
      if (
        activity.layoutActive
        && !activity.cameraActive
        && this._shouldAttemptEdgeAdaptiveLayoutProbe(now)
      ) {
        return { fast: false, reason: 'probe' };
      }
      return { fast: true, reason: 'performance' };
    }
    return { fast: false, reason: 'quality' };
  }

  _updateEdgeAdaptiveQualityBeforeRender(now = performance.now()) {
    const graphLayer = this.renderer?.graphLayer ?? null;
    const wasAdaptiveFast = graphLayer?.edgeAdaptiveFastRendering === true;
    const previousReason = this._edgeAdaptiveRuntime?.reason ?? null;
    const activity = this._resolveEdgeAdaptiveActivity(now);
    if (this._edgeAdaptiveRuntime) {
      if (activity.active !== (this._edgeAdaptiveRuntime.activityActive === true)) {
        this._edgeAdaptiveRuntime.activityActive = activity.active;
        this._edgeAdaptiveRuntime.skipNextQualitySample = activity.active === true;
        this._clearEdgeAdaptiveQualitySamples();
      }
    }
    const decision = this._resolveEdgeAdaptiveFastState(now);
    if (
      this._edgeAdaptiveRuntime
      && wasAdaptiveFast
      && decision.fast !== true
      && this._edgeAdaptiveRuntime.reason === 'performance'
    ) {
      this._edgeAdaptiveRuntime.nextProbeAt = Number.NEGATIVE_INFINITY;
      this._clearEdgeAdaptiveTimer('probeTimer');
      this._clearEdgeAdaptiveQualitySamples();
    }
    if (
      this._edgeAdaptiveRuntime
      && wasAdaptiveFast
      && decision.fast !== true
      && decision.reason === 'probe'
      && previousReason === 'performance'
    ) {
      this._edgeAdaptiveRuntime.skipNextQualitySample = true;
      this._clearEdgeAdaptiveQualitySamples();
    }
    this._setAdaptiveEdgeFastRendering(decision.fast, decision.reason, { requestRender: false });
    return decision;
  }

  _updateEdgeAdaptiveQualityAfterRender(renderMs, now = performance.now()) {
    const runtime = this._edgeAdaptiveRuntime ?? null;
    const config = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (!runtime || !graphLayer) return;
    runtime.lastRenderMs = Number.isFinite(renderMs) ? renderMs : null;
    const edgesVisible = this._edgeAdaptiveEdgesVisible();
    const manualFast = graphLayer.edgeFastRendering === true;
    const adaptiveFast = graphLayer.edgeAdaptiveFastRendering === true;
    const activity = this._resolveEdgeAdaptiveActivity(now);
    if (runtime.forceHighQuality === true || !config.enabled || manualFast || !edgesVisible) {
      runtime.nextProbeAt = Number.NEGATIVE_INFINITY;
      this._clearEdgeAdaptiveTimer('probeTimer');
      this._clearEdgeAdaptiveQualitySamples();
      runtime.failedProbeCount = 0;
      runtime.performanceFallbackAt = Number.NEGATIVE_INFINITY;
      runtime.performanceFallbackAlpha = NaN;
      return;
    }
    if (!activity.active) {
      runtime.nextProbeAt = Number.NEGATIVE_INFINITY;
      this._clearEdgeAdaptiveTimer('probeTimer');
      this._clearEdgeAdaptiveQualitySamples();
      runtime.failedProbeCount = 0;
      runtime.performanceFallbackAt = Number.NEGATIVE_INFINITY;
      runtime.performanceFallbackAlpha = NaN;
      return;
    }
    if (adaptiveFast) {
      if (runtime.reason === 'performance') {
        this._pushEdgeAdaptiveFastSample(renderMs);
      }
      return;
    }
    if (runtime.skipNextQualitySample === true) {
      runtime.skipNextQualitySample = false;
      runtime.lastRenderMs = Number.isFinite(renderMs) ? renderMs : null;
      return;
    }
    const { averageMs, sampleCount, targetCount } = this._pushEdgeAdaptiveQualitySample(renderMs);
    if (sampleCount < targetCount || !Number.isFinite(averageMs)) {
      return;
    }
    const slowThreshold = Number(config.slowFrameThresholdMs ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS.slowFrameThresholdMs);
    const exitThreshold = slowThreshold * EDGE_ADAPTIVE_LAYOUT_HYSTERESIS.exitThresholdFactor;
    if (runtime.reason === 'probe') {
      if (averageMs <= exitThreshold) {
        runtime.reason = 'quality';
        runtime.failedProbeCount = 0;
        runtime.nextProbeAt = Number.NEGATIVE_INFINITY;
        runtime.performanceFallbackAt = Number.NEGATIVE_INFINITY;
        runtime.performanceFallbackAlpha = NaN;
        runtime.fastFrameSamples = [];
        runtime.fastFrameAverageMs = null;
        this._clearEdgeAdaptiveTimer('probeTimer');
        return;
      }
      runtime.reason = 'performance';
      runtime.failedProbeCount = Math.max(0, Math.floor(Number(runtime.failedProbeCount) || 0)) + 1;
      runtime.nextProbeAt = now + this._computeEdgeAdaptiveProbeDelay(runtime.failedProbeCount);
      runtime.performanceFallbackAt = now;
      runtime.performanceFallbackAlpha = this._readLayoutAlpha(this._layout ?? null);
      runtime.fastFrameSamples = [];
      runtime.fastFrameAverageMs = null;
      this._clearEdgeAdaptiveQualitySamples();
      this._setAdaptiveEdgeFastRendering(true, 'performance', { requestRender: true });
      return;
    }
    if (averageMs > slowThreshold) {
      runtime.failedProbeCount = 0;
      runtime.performanceFallbackAt = now;
      runtime.performanceFallbackAlpha = this._readLayoutAlpha(this._layout ?? null);
      runtime.nextProbeAt = now + this._computeEdgeAdaptiveProbeDelay(0);
      runtime.fastFrameSamples = [];
      runtime.fastFrameAverageMs = null;
      this._clearEdgeAdaptiveQualitySamples();
      this._setAdaptiveEdgeFastRendering(true, 'performance', { requestRender: true });
      return;
    }
  }

  _getGraphLayerProp(name) {
    if (this.renderer?.graphLayer && name in this.renderer.graphLayer) {
      return this.renderer.graphLayer[name];
    }
    return this._pendingGraphLayerProps.get(name);
  }

  _setGraphLayerProp(name, value) {
    if (this.renderer?.graphLayer && name in this.renderer.graphLayer) {
      this.renderer.graphLayer[name] = value;
      this.scheduler.requestRender();
      this._labels?.requestFullReselect?.(`graph-prop:${name}`);
      this._emitUIBindingChange(name, value);
      return this;
    }
    this._pendingGraphLayerProps.set(name, value);
    this._labels?.requestFullReselect?.(`graph-prop-pending:${name}`);
    this._emitUIBindingChange(name, value);
    return this;
  }

  _getRendererProp(name) {
    if (this.renderer && name in this.renderer) {
      return this.renderer[name];
    }
    return this._pendingRendererProps.get(name);
  }

  _setRendererProp(name, value) {
    if (this.renderer && name in this.renderer) {
      this.renderer[name] = value;
      this.scheduler.requestRender();
      this._emitUIBindingChange(name, value);
      return this;
    }
    this._pendingRendererProps.set(name, value);
    this._emitUIBindingChange(name, value);
    return this;
  }

  edgeWidthScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeWidthScale');
    return this._setGraphLayerProp('edgeWidthScale', Number(value));
  }

  edgeWidthBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeWidthBase');
    return this._setGraphLayerProp('edgeWidthBase', Number(value));
  }

  edgeOpacityScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeOpacityScale');
    return this._setGraphLayerProp('edgeOpacityScale', Number(value));
  }

  edgeOpacityBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeOpacityBase');
    return this._setGraphLayerProp('edgeOpacityBase', Number(value));
  }

  nodeOpacityScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOpacityScale');
    return this._setGraphLayerProp('nodeOpacityScale', Number(value));
  }

  nodeOpacityBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOpacityBase');
    return this._setGraphLayerProp('nodeOpacityBase', Number(value));
  }

  nodeSizeScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeSizeScale');
    return this._setGraphLayerProp('nodeSizeScale', Number(value));
  }

  nodeSizeBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeSizeBase');
    return this._setGraphLayerProp('nodeSizeBase', Number(value));
  }

  semanticZoomExponent(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('semanticZoomExponent');
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this._setGraphLayerProp('semanticZoomExponent', numeric);
  }

  nodeOutlineWidthScale(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineWidthScale');
    return this._setGraphLayerProp('nodeOutlineWidthScale', Number(value));
  }

  nodeOutlineWidthBase(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineWidthBase');
    return this._setGraphLayerProp('nodeOutlineWidthBase', Number(value));
  }

  nodeOutlineColor(color) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineColor');
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('nodeOutlineColor(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setGraphLayerProp('nodeOutlineColor', normalized);
  }

  nodeOutlineUseAttributes(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeOutlineUseAttributes');
    return this._setGraphLayerProp('nodeOutlineUseAttributes', Boolean(value));
  }

  edgeEndpointTrim(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeEndpointTrim');
    return this._setGraphLayerProp('edgeEndpointTrim', Number(value));
  }

  nodeBlendWithEdges(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('nodeBlendWithEdges');
    return this._setGraphLayerProp('nodeBlendWithEdges', Boolean(value));
  }

  edgeDepthWrite(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeDepthWrite');
    return this._setGraphLayerProp('edgeDepthWrite', Boolean(value));
  }

  edgeFastRendering(value) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeFastRendering');
    return this._setGraphLayerProp('edgeFastRendering', Boolean(value));
  }

  edgeAdaptiveQuality(options) {
    if (arguments.length === 0) {
      const config = { ...(this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS) };
      const runtime = this._edgeAdaptiveRuntime ?? null;
      return {
        ...config,
        slowFrameConsecutiveFrames: config.averageWindowFrames,
        cameraIdleMs: config.interactionHoldMs,
        active: this.renderer?.graphLayer?.edgeAdaptiveFastRendering === true,
        manualFastRendering: this.renderer?.graphLayer?.edgeFastRendering === true,
        reason: runtime?.reason ?? null,
        lastRenderMs: Number.isFinite(runtime?.lastRenderMs) ? runtime.lastRenderMs : null,
        qualityFrameAverageMs: Number.isFinite(runtime?.qualityFrameAverageMs) ? runtime.qualityFrameAverageMs : null,
        qualityFrameSampleCount: Array.isArray(runtime?.qualityFrameSamples) ? runtime.qualityFrameSamples.length : 0,
      };
    }
    const current = this._edgeAdaptiveQualityConfig ?? EDGE_ADAPTIVE_QUALITY_DEFAULTS;
    const next = normalizeEdgeAdaptiveQualityConfig(current, options);
    this._edgeAdaptiveQualityConfig = next;
    this.options ??= {};
    this.options.edgeAdaptiveQuality = { ...next };
    if (this._edgeAdaptiveRuntime) {
      if (next.enabled !== true) {
        this._edgeAdaptiveRuntime.nextProbeAt = Number.NEGATIVE_INFINITY;
        this._clearEdgeAdaptiveTimer('probeTimer');
        this._clearEdgeAdaptiveQualitySamples();
        this._setAdaptiveEdgeFastRendering(false, 'disabled', { requestRender: false });
      }
      this._edgeAdaptiveRuntime.reason = next.enabled ? this._edgeAdaptiveRuntime.reason ?? 'quality' : 'disabled';
    }
    this._emitEdgeAdaptiveQualityConfigBindings();
    this.scheduler?.requestRender?.();
    return this;
  }

  edgeAdaptiveQualityEnabled(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().enabled;
    this.edgeAdaptiveQuality({ enabled: Boolean(value) });
    return this;
  }

  edgeAdaptiveQualitySlowFrameThresholdMs(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().slowFrameThresholdMs;
    this.edgeAdaptiveQuality({ slowFrameThresholdMs: Number(value) });
    return this;
  }

  edgeAdaptiveQualitySlowFrameConsecutiveFrames(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().averageWindowFrames;
    this.edgeAdaptiveQuality({ averageWindowFrames: Number(value) });
    return this;
  }

  edgeAdaptiveQualityProbeIntervalMs(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().probeIntervalMs;
    this.edgeAdaptiveQuality({ probeIntervalMs: Number(value) });
    return this;
  }

  edgeAdaptiveQualityInteractionHoldMs(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().interactionHoldMs;
    this.edgeAdaptiveQuality({ interactionHoldMs: Number(value) });
    return this;
  }

  edgeAdaptiveQualityFastDuringCamera(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().fastDuringCamera;
    this.edgeAdaptiveQuality({ fastDuringCamera: Boolean(value) });
    return this;
  }

  edgeAdaptiveQualityFastDuringLayout(value) {
    if (arguments.length === 0) return this.edgeAdaptiveQuality().fastDuringLayout;
    this.edgeAdaptiveQuality({ fastDuringLayout: Boolean(value) });
    return this;
  }

  background(color) {
    if (arguments.length === 0) return this._getRendererProp('clearColor');
    const normalized = normalizeColorInput(color);
    if (!normalized) {
      throw new Error('background(color) expects #rgb/#rgba/#rrggbb/#rrggbbaa or [r,g,b(,a)]');
    }
    return this._setRendererProp('clearColor', normalized);
  }

  clearColor(color) {
    if (arguments.length === 0) return this.background();
    return this.background(color);
  }

  supersampling(value) {
    if (arguments.length === 0) {
      return resolveSupersamplingPreset(this.options?.supersampling, {
        forceSupersample: this.options?.forceSupersample === true,
      });
    }
    const preset = resolveSupersamplingPreset(value, {
      forceSupersample: this.options?.forceSupersample === true,
    });
    this.options.supersampling = supersamplingPresetToOption(preset, {
      forceSupersample: this.options?.forceSupersample === true,
    });
    this.options.forceSupersample = false;
    this.layers?.setSupersampling?.(this.options.supersampling);
    this._emitUIBindingChange('supersampling', preset);
    return this;
  }

  cameraPose() {
    return captureCameraPose(this.renderer?.camera ?? null);
  }

  cameraControls(options) {
    if (arguments.length === 0) {
      return this._cameraControlsSnapshot();
    }
    if (!options || typeof options !== 'object') return this;
    const previousSnapshot = this._cameraControlsSnapshot();
    const previous = JSON.stringify(previousSnapshot);
    this._cameraControlConfig = normalizeCameraControlConfig(this._cameraControlConfig ?? CAMERA_CONTROL_DEFAULTS, options);
    const orbitAngleChanged = (this._cameraControlConfig.orbitAngle ?? 0) !== (previousSnapshot.orbitAngle ?? 0);
    if (this._cameraControlConfig.orbit !== true) {
      this._cameraControlRuntime.lastOrbitAt = 0;
    }
    if (orbitAngleChanged && this.renderer?.camera?.mode === '3d') {
      this.scheduler?.requestRender?.();
    }
    this._markAutoFitDirty(false);
    const next = this._cameraControlsSnapshot();
    if (JSON.stringify(next) !== previous) {
      this._emitCameraControlChange();
    }
    if (this._cameraControlConfig.autoFit === true) {
      this.scheduler?.requestRender?.();
    }
    if (this._cameraControlConfig.orbit === true && this.renderer?.camera?.mode === '3d') {
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  cameraTargetNodes(nodeIndices, options = {}) {
    if (arguments.length === 0) {
      return [...(this._cameraControlConfig?.targetNodeIndices ?? [])];
    }
    const normalized = normalizeNodeIndexList(nodeIndices);
    this.cameraControls({ targetNodeIndices: normalized });
    const bounds = this._sampleRenderBounds({
      nodeIndices: normalized?.length ? normalized : undefined,
      coverage: 1,
      maxSamples: this._cameraControlConfig?.autoFitMaxSamples ?? CAMERA_FIT_DEFAULT_MAX_SAMPLES,
    });
    const nextPose = this._resolveCameraFocusPose(bounds, {
      focusMode: normalized?.length ? 'centroid' : 'bbox',
    });
    this._applyCameraPoseWithOptionalAnimation(nextPose, {
      animate: options.animate ?? this._cameraControlConfig?.animation === true,
      durationMs: options.durationMs ?? this._cameraControlConfig?.animationDurationMs,
    });
    return this;
  }

  setCameraPose(pose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    if (!camera || !pose || typeof pose !== 'object') return this;
    if (
      options.source === 'ui'
      || options.source === 'interaction'
      || options.manual === true
      || Object.prototype.hasOwnProperty.call(pose, 'rotation')
    ) {
      this._invalidateCameraOrbitReference();
      this._stopCameraControlPoseInterpolation();
    }
    const nextPose = mergeCameraPose(captureCameraPose(camera), pose);
    applyCameraPose(camera, nextPose, { update: options.update !== false });
    if (options.source === 'ui' || options.source === 'interaction' || options.manual === true) {
      this._disableAutomaticCameraControlFromInteraction({
        origin: options.source ?? 'interaction',
        action: Object.prototype.hasOwnProperty.call(pose, 'zoom') ? 'zoom' : Object.prototype.hasOwnProperty.call(pose, 'distance') ? 'dolly' : 'pan',
      });
    }
    if (options.requestRender !== false) {
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  async transitionCamera(pose, options = {}) {
    const camera = this.renderer?.camera ?? null;
    if (!camera || !pose || typeof pose !== 'object') return this;
    this._stopCameraControlPoseInterpolation();
    const fromPose = mergeCameraPose(captureCameraPose(camera), options.fromPose ?? {});
    const toPose = mergeCameraPose(fromPose, pose);
    await this._ensureCameraTransitionController().transition(camera, {
      fromPose,
      toPose,
      durationMs: options.durationMs ?? DEFAULT_MODE_SWITCH_DURATION_MS,
    });
    if (options.source === 'ui' || options.source === 'interaction' || options.manual === true) {
      this._disableAutomaticCameraControlFromInteraction({
        origin: options.source ?? 'interaction',
        action: Object.prototype.hasOwnProperty.call(pose, 'zoom') ? 'zoom' : Object.prototype.hasOwnProperty.call(pose, 'distance') ? 'dolly' : 'pan',
      });
    }
    if (options.requestRender !== false) {
      this.scheduler?.requestRender?.();
    }
    return this;
  }

  stopCameraTransition() {
    this._cameraTransitionController?.stop?.();
    return this;
  }

  mode() {
    return this.options?.mode === '3d' ? '3d' : '2d';
  }

  async setMode(mode, options = {}) {
    const nextMode = mode === '3d' ? '3d' : '2d';
    const previousMode = this.mode();
    if (nextMode === previousMode) return this;
    if (this._cameraControlRuntime) {
      this._cameraControlRuntime.suspended = true;
      this._stopCameraControlPoseInterpolation();
    }

    try {
      const positionSource = this.positions?.() ?? { source: 'network', delegate: null };
      const activeDelegate = positionSource.source === 'delegate' ? (positionSource.delegate ?? null) : null;
      if (positionSource.source === 'delegate' && options.syncDelegate !== false) {
        try {
          await this.syncDelegatePositionsToNetwork();
        } catch (error) {
          console.warn('Helios.setMode(): failed to sync delegate positions back to the network before switching modes.', error);
        }
      }

      this.options.mode = nextMode;
      const nextProjection = options.projection ?? (nextMode === '3d' ? 'perspective' : 'orthographic');
      this.options.projection = nextProjection;
      let cameraControlChanged = false;
      if (nextMode !== '3d' && this._cameraControlConfig?.orbit === true) {
        this._cameraControlConfig.orbit = false;
        cameraControlChanged = true;
      }
      if (nextMode !== '3d') {
        this._invalidateCameraOrbitReference();
      }
      this._markAutoFitDirty(false);
      this._applyModeToLayoutOptions(nextMode);
      this.visuals?.seedMissingPositions?.(
        resolveSeedBoundsForLayout(this.options.layout, this.layers?.size, nextMode),
      );

      const layoutChanged = this._applyModeToActiveLayout(nextMode);
      if (
        previousMode === '2d'
        && nextMode === '3d'
        && this._layout instanceof GpuForceLayout
      ) {
        const jitterAmplitude = computeGpuForceModeSwitchDepthJitter(this._layout);
        const delegate = this._layout?.getPositionDelegate?.() ?? this._layout?.positionDelegate ?? null;
        await delegate?.injectPlanarDepthJitter?.(this._buildPositionDelegateContext({ scope: 'layout' }), jitterAmplitude);
      }
      if (layoutChanged && options.reheat !== false) {
        this._requestLayoutReheat('mode');
      }
      this._layout?.requestUpdate?.();
      this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestLayout?.('mode');
      this.scheduler?.requestRender?.();
      this._labels?.requestFullReselect?.('mode');
      this._refreshUIBindings?.();

      const camera = this.renderer?.camera ?? null;
      const animateCamera = options.animate !== false;
      if (camera) {
        const bounds = this._sampleRenderBounds(options.frame ?? {}) ?? null;
        if (nextMode === '3d') {
          const plan = this._build3DModeTransitionPoses(bounds, nextProjection);
          if (plan) {
            if (animateCamera) {
              await this._ensureCameraTransitionController().transition(camera, {
                fromPose: plan.startPose,
                toPose: plan.endPose,
                durationMs: options.cameraDurationMs ?? DEFAULT_MODE_SWITCH_DURATION_MS,
              });
            } else {
              applyCameraPose(camera, plan.endPose);
            }
          } else {
            applyCameraPose(camera, {
              ...captureCameraPose(camera),
              mode: '3d',
              projection: nextProjection,
            });
          }
        } else {
          const plan = this._build2DModeTransitionPoses(bounds);
          if (plan) {
            if (animateCamera) {
              const durationMs = options.cameraDurationMs ?? DEFAULT_MODE_SWITCH_DURATION_MS;
              const controller = this._ensureCameraTransitionController();
              await controller.transition(camera, {
                fromPose: plan.startPose,
                toPose: plan.pre2D3D,
                durationMs: durationMs * 0.7,
              });
            }
            if (options.flattenDepth !== false) {
              await this._collapseActivePositionDepthTo2DPlane(0, activeDelegate);
            }
            if (animateCamera) {
              await this._ensureCameraTransitionController().transition(camera, {
                fromPose: plan.start2DPose,
                toPose: plan.endPose,
                durationMs: (options.cameraDurationMs ?? DEFAULT_MODE_SWITCH_DURATION_MS) * 0.3,
              });
            } else {
              applyCameraPose(camera, plan.endPose);
            }
          } else {
            if (options.flattenDepth !== false) {
              await this._collapseActivePositionDepthTo2DPlane(0, activeDelegate);
            }
            applyCameraPose(camera, {
              ...captureCameraPose(camera),
              mode: '2d',
              projection: nextProjection,
            });
          }
        }
      }

      if (layoutChanged) {
        this._emitLayoutChanged(this._layout);
      }
      if (cameraControlChanged) {
        this._emitCameraControlChange();
      }
      this.emit(EVENTS.MODE_CHANGED, {
        mode: nextMode,
        previousMode,
        projection: nextProjection,
      });
      return this;
    } finally {
      if (this._cameraControlRuntime) {
        this._cameraControlRuntime.suspended = false;
      }
      this._markAutoFitDirty(false);
      this.scheduler?.requestRender?.();
    }
  }

  density(options) {
    if (arguments.length === 0) {
      const config = this._densityConfig ?? DENSITY_DEFAULTS;
      const compareProperty = resolveDensityCompareProperty(config.property, config.compareProperty);
      const comparisonMode = resolveDensityComparisonMode(compareProperty, config.comparisonMode);
      const usesLogRatioColormap = usesLogRatioDensityColormap({ ...config, compareProperty, comparisonMode });
      const diverging = this._densityRuntime?.diverging === true || comparisonMode === 'logRatio';
      return {
        ...config,
        compareProperty,
        comparisonMode,
        diverging,
        valueDomain: Array.isArray(this._densityRuntime?.valueDomain) ? [...this._densityRuntime.valueDomain] : null,
        activeColormap: resolveDensityActiveColormap({ ...config, compareProperty, comparisonMode }, this._densityRuntime),
      };
    }

    if (options == null || options === false) {
      this._densityConfig = { ...this._densityConfig, enabled: false };
      this._densityRuntime = { ...this._densityRuntime, valueDomain: null };
      this._applyDensityConfigToLayer();
      this.scheduler?.requestRender?.();
      return this;
    }

    if (typeof options !== 'object') {
      throw new TypeError('density(options) expects an object, null, or false');
    }

    const current = this._densityConfig ?? DENSITY_DEFAULTS;
    const next = { ...current };

    if (Object.prototype.hasOwnProperty.call(options, 'enabled')) next.enabled = options.enabled === true;
    if (Object.prototype.hasOwnProperty.call(options, 'density')) next.enabled = options.density === true;
    if (Object.prototype.hasOwnProperty.call(options, 'qualityScale')) {
      next.qualityScale = clamp(toFiniteNumber(options.qualityScale, next.qualityScale), 0.03, 1.0);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityScale')) {
      next.qualityScale = clamp(toFiniteNumber(options.densityScale, next.qualityScale), 0.03, 1.0);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'topographic')) next.topographic = options.topographic === true;
    if (Object.prototype.hasOwnProperty.call(options, 'scaleWithZoom')) next.scaleWithZoom = options.scaleWithZoom === true;
    if (Object.prototype.hasOwnProperty.call(options, 'densityScaleWithZoom')) {
      next.scaleWithZoom = options.densityScaleWithZoom === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityScaleByZoom')) {
      next.scaleWithZoom = options.densityScaleByZoom === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'bandwidth')) {
      next.bandwidth = clamp(toFiniteNumber(options.bandwidth, next.bandwidth), 0.05, 1000);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'weightScale')) {
      next.weightScale = clamp(toFiniteNumber(options.weightScale, next.weightScale), 0, 1e8);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityWeight')) {
      next.weightScale = clamp(toFiniteNumber(options.densityWeight, next.weightScale), 0, 1e8);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'property') && typeof options.property === 'string') {
      const trimmed = options.property.trim();
      if (trimmed) next.property = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityProperty') && typeof options.densityProperty === 'string') {
      const trimmed = options.densityProperty.trim();
      if (trimmed) next.property = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'compareProperty') && typeof options.compareProperty === 'string') {
      const trimmed = options.compareProperty.trim();
      if (trimmed) next.compareProperty = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'vsDensityProperty') && typeof options.vsDensityProperty === 'string') {
      const trimmed = options.vsDensityProperty.trim();
      if (trimmed) next.compareProperty = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'normalizeVs')) next.normalizeVs = options.normalizeVs === true;
    if (Object.prototype.hasOwnProperty.call(options, 'shallNormalizeVsDensity')) {
      next.normalizeVs = options.shallNormalizeVsDensity === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'comparisonMode')) {
      next.comparisonMode = options.comparisonMode === 'logRatio' ? 'logRatio' : 'difference';
    }
    if (Object.prototype.hasOwnProperty.call(options, 'epsilon')) {
      next.epsilon = clamp(toFiniteNumber(options.epsilon, next.epsilon), 1e-12, 1);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityEpsilon')) {
      next.epsilon = clamp(toFiniteNumber(options.densityEpsilon, next.epsilon), 1e-12, 1);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'logRatioRange')) {
      next.logRatioRange = clamp(toFiniteNumber(options.logRatioRange, next.logRatioRange), 1e-3, 1e3);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityLogRatioRange')) {
      next.logRatioRange = clamp(toFiniteNumber(options.densityLogRatioRange, next.logRatioRange), 1e-3, 1e3);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'maskThreshold')) {
      next.maskThreshold = clamp(toFiniteNumber(options.maskThreshold, next.maskThreshold), 0, 1);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityMaskThreshold')) {
      next.maskThreshold = clamp(toFiniteNumber(options.densityMaskThreshold, next.maskThreshold), 0, 1);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'logRatioSupportCorrection')) {
      next.logRatioSupportCorrection = options.logRatioSupportCorrection !== false;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityLogRatioSupportCorrection')) {
      next.logRatioSupportCorrection = options.densityLogRatioSupportCorrection !== false;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'colormap') && typeof options.colormap === 'string') {
      const trimmed = options.colormap.trim();
      if (trimmed) next.colormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityColormap') && typeof options.densityColormap === 'string') {
      const trimmed = options.densityColormap.trim();
      if (trimmed) next.colormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'divergingColormap') && typeof options.divergingColormap === 'string') {
      const trimmed = options.divergingColormap.trim();
      if (trimmed) next.divergingColormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityDivergingColormap') && typeof options.densityDivergingColormap === 'string') {
      const trimmed = options.densityDivergingColormap.trim();
      if (trimmed) next.divergingColormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'logRatioColormap') && typeof options.logRatioColormap === 'string') {
      const trimmed = options.logRatioColormap.trim();
      if (trimmed) next.logRatioColormap = trimmed;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'densityLogRatioColormap') && typeof options.densityLogRatioColormap === 'string') {
      const trimmed = options.densityLogRatioColormap.trim();
      if (trimmed) next.logRatioColormap = trimmed;
    }

    next.compareProperty = resolveDensityCompareProperty(next.property, next.compareProperty);
    next.comparisonMode = resolveDensityComparisonMode(next.compareProperty, next.comparisonMode);

    this._densityConfig = next;
    if (next.comparisonMode !== 'logRatio') {
      this._densityRuntime = { ...this._densityRuntime, diverging: false, valueDomain: null };
    }
    this._applyDensityConfigToLayer();
    this.scheduler?.requestRender?.();
    return this;
  }

  densityEnabled(value) {
    if (arguments.length === 0) return this.density().enabled === true;
    return this.density({ enabled: value === true });
  }

  densityScale(value) {
    if (arguments.length === 0) return this.density().qualityScale;
    return this.density({ qualityScale: value });
  }

  densityTopographic(value) {
    if (arguments.length === 0) return this.density().topographic === true;
    return this.density({ topographic: value === true });
  }

  densityScaleWithZoom(value) {
    if (arguments.length === 0) return this.density().scaleWithZoom === true;
    return this.density({ scaleWithZoom: value === true });
  }

  densityBandwidth(value) {
    if (arguments.length === 0) return this.density().bandwidth;
    return this.density({ bandwidth: value });
  }

  densityWeight(value) {
    if (arguments.length === 0) return this.density().weightScale;
    return this.density({ weightScale: value });
  }

  densityProperty(value) {
    if (arguments.length === 0) return this.density().property;
    return this.density({ property: value });
  }

  densityVsProperty(value) {
    if (arguments.length === 0) return this.density().compareProperty;
    return this.density({ compareProperty: value });
  }

  densityNormalizeVs(value) {
    if (arguments.length === 0) return this.density().normalizeVs === true;
    return this.density({ normalizeVs: value === true });
  }

  densityColormap(value) {
    if (arguments.length === 0) return this.density().colormap;
    return this.density({ colormap: value });
  }

  densityDivergingColormap(value) {
    if (arguments.length === 0) return this.density().divergingColormap;
    return this.density({ divergingColormap: value });
  }

  updateDensityMap() {
    this.scheduler?.requestRender?.();
    return this;
  }

  redrawDensityMap() {
    this.scheduler?.requestRender?.();
    return this;
  }

  edgeTransparencyMode(mode) {
    if (arguments.length === 0) return this._getGraphLayerProp('edgeTransparencyMode');
    const next = String(mode ?? '');
    const graphLayer = this.renderer?.graphLayer ?? null;
    if (graphLayer?.isSupportedTransparencyMode && !graphLayer.isSupportedTransparencyMode(next)) {
      return this;
    }
    return this._setGraphLayerProp('edgeTransparencyMode', next);
  }

  labels(options) {
    if (arguments.length === 0) {
      return this._labels?.getConfig?.() ?? { enabled: false };
    }
    if (options == null) {
      this._labels?.setConfig?.({ enabled: false, hoveredNodeEnabled: false });
    } else if (typeof options === 'object') {
      this._labels?.setConfig?.(options);
    } else {
      throw new TypeError('labels(options) expects an object or null');
    }
    this._labels?.requestFullReselect?.('api');
    this.scheduler?.requestRender?.();
    this._refreshUIBindings();
    return this;
  }

  legends(options) {
    if (arguments.length === 0) {
      return this._legends?.getConfig?.() ?? { enabled: true };
    }
    if (options === false || options == null) {
      this._legends?.setConfig?.({ enabled: false });
    } else if (typeof options === 'object') {
      this._legends?.setConfig?.(options);
    } else {
      throw new TypeError('legends(options) expects an object, false, or null');
    }
    this.scheduler?.requestRender?.();
    this._refreshUIBindings();
    return this;
  }

  legendsEnabled(value) {
    if (arguments.length === 0) return this.legends()?.enabled === true;
    return this.legends({ enabled: value === true });
  }

  overlayInsets(insets) {
    if (arguments.length === 0) return { ...this._overlayInsets };
    const next = normalizeInsets(insets);
    const prev = this._overlayInsets ?? { top: 0, right: 0, bottom: 0, left: 0 };
    if (
      prev.top === next.top
      && prev.right === next.right
      && prev.bottom === next.bottom
      && prev.left === next.left
    ) {
      return this;
    }
    this._overlayInsets = next;
    this.scheduler?.requestRender?.();
    return this;
  }

  labelsEnabled(value) {
    if (arguments.length === 0) return this.labelsMode() !== 'off';
    return this.labelsMode(value === true ? 'auto' : 'off');
  }

  labelsMode(value) {
    if (arguments.length === 0) {
      const labels = this.labels?.() ?? { enabled: false };
      if (labels.enabled !== true) return 'off';
      return labels.selectionMode === 'selected-only' ? 'selected-only' : 'auto';
    }
    const raw = String(value ?? '').trim().toLowerCase();
    if (raw === 'selected' || raw === 'selected-only' || raw === 'selected_only') {
      return this.labels({ enabled: true, selectionMode: 'selected-only' });
    }
    if (raw === 'off' || raw === 'none' || raw === 'disabled' || raw === 'false') {
      return this.labels({ enabled: false });
    }
    return this.labels({ enabled: true, selectionMode: 'ranked' });
  }

  labelsMaxVisible(value) {
    if (arguments.length === 0) return Number(this.labels()?.maxVisible ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ maxVisible: Math.max(0, Math.floor(numeric)) });
  }

  labelsSelectedOnlySpaceAware(value) {
    if (arguments.length === 0) return this.labels()?.selectedOnlySpaceAware === true;
    return this.labels({ selectedOnlySpaceAware: value === true });
  }

  labelsFontSizeScale(value) {
    if (arguments.length === 0) return Number(this.labels()?.fontSizeScale ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ fontSizeScale: Math.max(0.25, numeric) });
  }

  labelsMinScreenRadius(value) {
    if (arguments.length === 0) return Number(this.labels()?.minScreenRadiusPx ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ minScreenRadiusPx: Math.max(0, numeric) });
  }

  labelsOutlineWidth(value) {
    if (arguments.length === 0) return Number(this.labels()?.outlineWidth ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ outlineWidth: Math.max(0, numeric) });
  }

  labelsOffsetRadiusFactor(value) {
    if (arguments.length === 0) return Number(this.labels()?.offsetRadiusFactor ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ offsetRadiusFactor: numeric });
  }

  labelsOffsetPx(value) {
    if (arguments.length === 0) return Number(this.labels()?.offsetPx ?? 4);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ offsetPx: numeric });
  }

  labelsMaxChars(value) {
    if (arguments.length === 0) return Number(this.labels()?.maxChars ?? 0);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ maxChars: Math.max(0, Math.floor(numeric)) });
  }

  labelsMaxRows(value) {
    if (arguments.length === 0) return Number(this.labels()?.maxRows ?? 1);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return this;
    return this.labels({ maxRows: Math.max(1, Math.floor(numeric)) });
  }

  labelFill(color) {
    if (arguments.length === 0) return this.labels()?.fill ?? null;
    if (typeof color === 'string' && color.trim()) return this.labels({ fill: color.trim() });
    const normalized = normalizeColorInput(color);
    if (normalized) return this.labels({ fill: normalized });
    throw new Error('labelFill(color) expects a CSS color string or [r,g,b(,a)]');
  }

  labelOutlineColor(color) {
    if (arguments.length === 0) return this.labels()?.outlineColor ?? null;
    if (typeof color === 'string' && color.trim()) return this.labels({ outlineColor: color.trim() });
    const normalized = normalizeColorInput(color);
    if (normalized) return this.labels({ outlineColor: normalized });
    throw new Error('labelOutlineColor(color) expects a CSS color string or [r,g,b(,a)]');
  }

  labelFontFamily(value) {
    if (arguments.length === 0) return this.labels()?.fontFamily ?? '';
    const next = String(value ?? '').trim();
    return this.labels({ fontFamily: next });
  }

  labelSource(value) {
    if (arguments.length === 0) return this.labels()?.source ?? null;
    if (typeof value === 'function') return this.labels({ source: value });
    const next = value == null ? null : String(value).trim();
    return this.labels({ source: next || null });
  }

  /**
   * Pre-runs mapper application before first render. Useful for large graphs
   * where the first geometry pass is expensive.
   * Can be awaited before `helios.ready` to shorten time to first render.
   */
  async prewarm(options = {}) {
    if (this.prewarmPromise) return this.prewarmPromise;
    this.debug.log('helios', 'Prewarming visuals before ready', {
      updateLegacyBuffers: false,
    });
    this.prewarmPromise = (async () => {
      if (this.mappersDirty) {
        const nodeMapper = this.nodeMapper.toCombinedMapper();
        const edgeMapper = this.edgeMapper.toCombinedMapper({ nodeMapper });
        this.visuals.applyMappers({ nodeMapper, edgeMapper });
        this.mappersDirty = false;
      }
      this.scheduler?.requestGeometry?.();
    })();
    try {
      await this.prewarmPromise;
    } catch (error) {
      this.prewarmPromise = null;
      this.debug.log('helios', 'Prewarm failed', { error });
      throw error;
    }
    return this.prewarmPromise;
  }

  createLayout(layoutOption) {
    const layoutNetwork = this._getLayoutNetwork();
    if (isLayoutInstance(layoutOption)) {
      if (layoutNetwork && layoutOption.network !== layoutNetwork) {
        layoutOption.network = layoutNetwork;
      }
      return layoutOption;
    }
    if (layoutOption?.type === 'gpu-force' || layoutOption?.type === 'gpuforce') {
      const requestedOptions = {
        ...(layoutOption.options ?? {}),
        mode: this.options.mode ?? '2d',
        helios: this,
      };
      const gpuOptions = resolveGpuForceLayoutOptionsFromNetwork(layoutNetwork, requestedOptions);
      this.debug.log('layout', 'Using GPU force layout', { ...gpuOptions, helios: undefined });
      return new GpuForceLayout(layoutNetwork, this.visuals, gpuOptions);
    }
    if (layoutOption?.type === 'worker') {
      const workerOptions = { ...(layoutOption.options ?? {}), mode: this.options.mode ?? '2d' };
      this.debug.log('layout', 'Using worker layout', workerOptions);
      return new WorkerLayout(layoutNetwork, this.visuals, workerOptions);
    }
    if (layoutOption?.type === 'd3force3d' || layoutOption?.type === 'd3-force-3d') {
      const workerOptions = { ...(layoutOption.options ?? {}), mode: this.options.mode ?? '2d', helios: this };
      this.debug.log('layout', 'Using d3-force-3d layout', workerOptions);
      return new D3Force3DLayout(layoutNetwork, this.visuals, workerOptions);
    }
    const w = this.layers.size.width;
    const h = this.layers.size.height;
    this.debug.log('layout', 'Using static layout', { width: w, height: h });
    return new StaticLayout(layoutNetwork, this.visuals, {
      bounds: [-w * 0.5, -h * 0.5, w * 0.5, h * 0.5],
    });
  }

  addNodes(count, initializer) {
    const nodes = this.network.addNodes(count);
    this.debug.log('helios', 'Adding nodes', { count });
    this.visuals.applyNodeDefaults(nodes);
    this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(this.options.layout, this.layers.size, this.options.mode));
    if (initializer) {
      initializer(nodes, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this._markAutoFitDirty(false);
    this._layout?.syncAutoSettingsForNetwork?.();
    this.mappersDirty = true;
    this._requestLayoutReheat('data');
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('add-nodes');
    return nodes;
  }

  addEdges(edges, initializer) {
    const edgeIndices = this.network.addEdges(edges);
    this.debug.log('helios', 'Adding edges', { count: edgeIndices?.length ?? 0 });
    this.visuals.applyEdgeDefaults(edgeIndices);
    if (initializer) {
      initializer(edgeIndices, this.visuals);
    }
    this.visuals.markPositionsDirty();
    this._markAutoFitDirty(false);
    this.mappersDirty = true;
    this._requestLayoutReheat('data');
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('add-edges');
    return edgeIndices;
  }

  notifyNetworkChanged({ nodes, edges } = {}) {
    if (nodes) {
      this.debug.log('helios', 'Network nodes changed', { count: nodes.length ?? nodes.size ?? nodes });
      this.visuals.applyNodeDefaults(nodes);
      this.visuals.seedMissingPositions(resolveSeedBoundsForLayout(this.options.layout, this.layers.size, this.options.mode));
    }
    if (edges) {
      this.debug.log('helios', 'Network edges changed', { count: edges.length ?? edges.size ?? edges });
      this.visuals.applyEdgeDefaults(edges);
    }
    this.visuals.markPositionsDirty();
    this._markAutoFitDirty(false);
    if (nodes) {
      this._layout?.syncAutoSettingsForNetwork?.();
    }
    this.mappersDirty = true;
    this._requestLayoutReheat('data');
    this.scheduler.requestLayout('data');
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('network-changed');
  }

  nodeState(indices, mask, options = {}) {
    const mode = options.mode ?? 'replace';
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    this.network.withBufferAccess(() => {
      const view = this.network.getNodeAttributeBuffer(NODE_STATE_ATTRIBUTE)?.view;
      if (!view) return;
      const usesBigInt = typeof view[0] === 'bigint';
      const valueBig = usesBigInt ? BigInt(value) : null;
      forEachIndex(indices, (index) => {
        const id = Number(index);
        if (!Number.isFinite(id) || id < 0) return;
        const current = view[id] ?? (usesBigInt ? 0n : 0);
        switch (mode) {
          case 'add':
            view[id] = usesBigInt ? (current | valueBig) : ((current | value) >>> 0);
            break;
          case 'remove':
            view[id] = usesBigInt ? (current & (~valueBig)) : ((current & (~value)) >>> 0);
            break;
          case 'toggle':
            view[id] = usesBigInt ? (current ^ valueBig) : ((current ^ value) >>> 0);
            break;
          default:
            view[id] = usesBigInt ? valueBig : value;
            break;
        }
      });
      this.visuals.bumpNodeAttributes(NODE_STATE_ATTRIBUTE);
      // Endpoint states are derived via node-to-edge mapping; bump versions so edge state consumers notice.
      this.visuals.bumpEdgeAttributes(EDGE_ENDPOINTS_STATE_ATTRIBUTE);
    });
    this.scheduler.requestGeometry();
    this._labels?.requestFullReselect?.('node-state');
    return this;
  }

  edgeState(indices, mask, options = {}) {
    const mode = options.mode ?? 'replace';
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    this.network.withBufferAccess(() => {
      const view = this.network.getEdgeAttributeBuffer(EDGE_STATE_ATTRIBUTE)?.view;
      if (!view) return;
      const usesBigInt = typeof view[0] === 'bigint';
      const valueBig = usesBigInt ? BigInt(value) : null;
      forEachIndex(indices, (index) => {
        const id = Number(index);
        if (!Number.isFinite(id) || id < 0) return;
        const current = view[id] ?? (usesBigInt ? 0n : 0);
        switch (mode) {
          case 'add':
            view[id] = usesBigInt ? (current | valueBig) : ((current | value) >>> 0);
            break;
          case 'remove':
            view[id] = usesBigInt ? (current & (~valueBig)) : ((current & (~value)) >>> 0);
            break;
          case 'toggle':
            view[id] = usesBigInt ? (current ^ valueBig) : ((current ^ value) >>> 0);
            break;
          default:
            view[id] = usesBigInt ? valueBig : value;
            break;
        }
      });
      this.visuals.bumpEdgeAttributes(EDGE_STATE_ATTRIBUTE);
    });
    this.scheduler.requestGeometry();
    return this;
  }

  hoverNodeState(index, mask) {
    const resolvedIndex = index == null || Number(index) < 0 ? 0xffffffff : (Number(index) >>> 0);
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    const layer = this.renderer?.graphLayer ?? null;
    if (layer && 'hoveredNodeIndex' in layer) {
      layer.hoveredNodeIndex = resolvedIndex;
      layer.hoveredNodeState = value;
      this.scheduler.requestRender();
      return this;
    }
    this._pendingGraphLayerProps.set('hoveredNodeIndex', resolvedIndex);
    this._pendingGraphLayerProps.set('hoveredNodeState', value);
    return this;
  }

  hoverEdgeState(index, mask) {
    const resolvedIndex = index == null || Number(index) < 0 ? 0xffffffff : (Number(index) >>> 0);
    const value = (Number(resolveStateMask(mask, this.constructor.STATES)) >>> 0);
    const layer = this.renderer?.graphLayer ?? null;
    if (layer && 'hoveredEdgeIndex' in layer) {
      layer.hoveredEdgeIndex = resolvedIndex;
      layer.hoveredEdgeState = value;
      this.scheduler.requestRender();
      return this;
    }
    this._pendingGraphLayerProps.set('hoveredEdgeIndex', resolvedIndex);
    this._pendingGraphLayerProps.set('hoveredEdgeState', value);
    return this;
  }

  nodeStateStyle(slot, style) {
    if (arguments.length < 2) {
      const layer = this.renderer?.graphLayer;
      const index = Number(resolveStateSlot(slot, this.constructor.STATES));
      if (!Number.isInteger(index) || index < 0) return null;
      if (!layer) {
        return this._stateStyleCache?.nodeSlots?.get(index) ?? null;
      }
      if (index >= layer.stateSlotCount) return null;
      const o = index * 4;
      const forceMask = layer.nodeStateForceMaxAlphaMask >>> 0;
      return {
        sizeMul: layer.nodeStateScale[o + 0],
        opacityMul: layer.nodeStateScale[o + 1],
        outlineMul: layer.nodeStateScale[o + 2],
        discard: layer.nodeStateScale[o + 3] === 1,
        forceMaxAlpha: ((forceMask >> index) & 1) === 1,
        colorMul: Array.from(layer.nodeStateColorMul.slice(o, o + 4)),
        colorAdd: Array.from(layer.nodeStateColorAdd.slice(o, o + 4)),
      };
    }
    const resolvedSlot = resolveStateSlot(slot, this.constructor.STATES);
    if (this._stateStyleCache?.nodeSlots) {
      this._stateStyleCache.nodeSlots.set(resolvedSlot, style);
    }
    this.renderer?.graphLayer?.setNodeStateStyle?.(resolvedSlot, style);
    this.scheduler.requestRender();
    return this;
  }

  nodeNoStateStyle(style) {
    if (arguments.length === 0) {
      const layer = this.renderer?.graphLayer;
      if (!layer) return this._stateStyleCache?.nodeNoState ?? null;
      return {
        sizeMul: layer.nodeNoStateScale[0],
        opacityMul: layer.nodeNoStateScale[1],
        outlineMul: layer.nodeNoStateScale[2],
        discard: layer.nodeNoStateScale[3] === 1,
        colorMul: Array.from(layer.nodeNoStateColorMul.slice(0, 4)),
        colorAdd: Array.from(layer.nodeNoStateColorAdd.slice(0, 4)),
      };
    }
    if (this._stateStyleCache) {
      this._stateStyleCache.nodeNoState = style;
    }
    this.renderer?.graphLayer?.setNodeNoStateStyle?.(style);
    this.scheduler.requestRender();
    return this;
  }

  edgeStateStyle(slot, style) {
    if (arguments.length < 2) {
      const layer = this.renderer?.graphLayer;
      const index = Number(resolveStateSlot(slot, this.constructor.STATES));
      if (!Number.isInteger(index) || index < 0) return null;
      if (!layer) {
        return this._stateStyleCache?.edgeSlots?.get(index) ?? null;
      }
      if (index >= layer.stateSlotCount) return null;
      const o = index * 4;
      const forceMask = layer.edgeStateForceMaxAlphaMask >>> 0;
      return {
        widthMul: layer.edgeStateScale[o + 0],
        opacityMul: layer.edgeStateScale[o + 1],
        discard: layer.edgeStateScale[o + 3] === 1,
        forceMaxAlpha: ((forceMask >> index) & 1) === 1,
        colorMul: Array.from(layer.edgeStateColorMul.slice(o, o + 4)),
        colorAdd: Array.from(layer.edgeStateColorAdd.slice(o, o + 4)),
      };
    }
    const resolvedSlot = resolveStateSlot(slot, this.constructor.STATES);
    if (this._stateStyleCache?.edgeSlots) {
      this._stateStyleCache.edgeSlots.set(resolvedSlot, style);
    }
    this.renderer?.graphLayer?.setEdgeStateStyle?.(resolvedSlot, style);
    this.scheduler.requestRender();
    return this;
  }

  edgeNoStateStyle(style) {
    if (arguments.length === 0) {
      const layer = this.renderer?.graphLayer;
      if (!layer) return this._stateStyleCache?.edgeNoState ?? null;
      return {
        widthMul: layer.edgeNoStateScale[0],
        opacityMul: layer.edgeNoStateScale[1],
        discard: layer.edgeNoStateScale[3] === 1,
        colorMul: Array.from(layer.edgeNoStateColorMul.slice(0, 4)),
        colorAdd: Array.from(layer.edgeNoStateColorAdd.slice(0, 4)),
      };
    }
    if (this._stateStyleCache) {
      this._stateStyleCache.edgeNoState = style;
    }
    this.renderer?.graphLayer?.setEdgeNoStateStyle?.(style);
    this.scheduler.requestRender();
    return this;
  }

  resetStateStyles() {
    if (this._stateStyleCache) {
      this._stateStyleCache.nodeSlots.clear();
      this._stateStyleCache.edgeSlots.clear();
      this._stateStyleCache.nodeNoState = null;
      this._stateStyleCache.edgeNoState = null;
    }
    this.renderer?.graphLayer?.resetStateStyles?.();
    this.scheduler.requestRender();
    return this;
  }

  mappers({ nodeMapper, edgeMapper } = {}) {
    if (arguments.length === 0) {
      return { nodeMapper: this.nodeMapper, edgeMapper: this.edgeMapper };
    }
    if (nodeMapper === null && edgeMapper === null) {
      this.debug.log('mapper', 'Resetting mappers to defaults');
      this.nodeMapper = new MapperCollection('node', this.network, () => {
        this.markMappersDirty();
      }, this.debug);
      this.edgeMapper = new MapperCollection('edge', this.network, () => {
        this.markMappersDirty();
      }, this.debug);
      this.mappersDirty = true;
      this.scheduler?.requestGeometry?.();
      this.scheduler.requestGeometry();
      return this;
    }
    if (nodeMapper) {
      this.debug.log('mapper', 'Replacing node mapper');
      this.nodeMapper.setDefault(nodeMapper);
    }
    if (edgeMapper) {
      this.debug.log('mapper', 'Replacing edge mapper');
      this.edgeMapper.setDefault(edgeMapper);
    }
    this.mappersDirty = true;
    this.scheduler.requestGeometry();
    return this;
  }

  layout(layout) {
    if (arguments.length === 0) {
      return this._layout;
    }
    if (!isLayoutInstance(layout)) {
      throw new Error('Layout must extend the Layout base class');
    }
    const handoff = this._resolveLayoutHandoffContext();
    const nextPolicy = this._resolveLayoutPositionPolicy(layout);
    const shouldHandoffDelegatePositions = handoff.outgoingDelegate
      && nextPolicy.source !== 'delegate';

    if (handoff.pending && !shouldHandoffDelegatePositions) {
      this._disposePendingLayoutHandoff();
    } else if (handoff.pending) {
      this._pendingLayoutHandoff = null;
    }
    if (handoff.staleLayout && handoff.staleLayout !== handoff.outgoingLayout) {
      handoff.staleLayout.dispose?.();
    }
    if (!shouldHandoffDelegatePositions) {
      handoff.outgoingLayout?.dispose?.();
    }

    this._layout = this._bindLayoutToHelios(layout);
    this.debug.log('layout', 'Layout replaced', { layout: layout?.constructor?.name });
    this._layout.setUpdateListener((payload) => this._handleLayoutUpdate(payload));
    this.debug.log('layout', 'Initializing new layout instance');
    this._layout.initialize?.();
    this._layout.resize?.(this.layers.size);
    if (!shouldHandoffDelegatePositions) {
      this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: true });
      this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    } else {
      this._startLayoutPositionHandoff({
        previousLayout: handoff.outgoingLayout,
        previousDelegate: handoff.outgoingDelegate,
        nextLayout: this._layout,
      });
    }
    this.debug.log('layout', 'Layout initialized and resized', this.layers.size);
    this.scheduler.setLayout(this._layout);
    this._emitLayoutChanged(this._layout);
    this.scheduler.requestLayout('user');
    this.scheduler.requestRender();
    return this;
  }

  getLayoutPositionAttributeChoices(options = {}) {
    const network = options.network ?? this.network ?? null;
    const mode = (options.mode ?? this.options?.mode) === '3d' ? '3d' : '2d';
    const currentChoice = {
      value: NODE_POSITION_ATTRIBUTE,
      label: 'Current positions',
      dimension: 3,
    };
    const randomChoice = {
      value: RANDOM_LAYOUT_POSITION_CHOICE,
      label: mode === '3d' ? 'Random positions (3D cube)' : 'Random positions (2D square)',
      dimension: mode === '3d' ? 3 : 2,
    };
    if (!network || typeof network.getNodeAttributeNames !== 'function') {
      return [currentChoice, randomChoice];
    }

    const names = new Set(network.getNodeAttributeNames?.() ?? []);
    names.add(NODE_POSITION_ATTRIBUTE);

    const choices = [randomChoice];
    for (const name of names) {
      const info = network.getNodeAttributeInfo?.(name) ?? null;
      const dimension = Number(info?.dimension ?? 0);
      if (!Number.isFinite(dimension) || (dimension !== 2 && dimension !== 3)) continue;
      if (info?.complex === true) continue;
      if (!isNumericLayoutPositionAttributeType(info?.type)) continue;
      choices.push({
        value: name,
        label: name === NODE_POSITION_ATTRIBUTE ? 'Current positions' : `${name} (${dimension}D)`,
        dimension,
      });
    }

    choices.sort((a, b) => {
      if (a.value === NODE_POSITION_ATTRIBUTE) return -1;
      if (b.value === NODE_POSITION_ATTRIBUTE) return 1;
      if (a.value === RANDOM_LAYOUT_POSITION_CHOICE) return -1;
      if (b.value === RANDOM_LAYOUT_POSITION_CHOICE) return 1;
      return String(a.label).localeCompare(String(b.label));
    });

    return choices.length ? choices : [currentChoice, randomChoice];
  }

  setLayoutPositionsFromNodeAttribute(name, options = {}) {
    const network = options.network ?? this.network ?? null;
    const visuals = this.visuals ?? null;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!network || !trimmed) return false;

    const seedBounds = resolveSeedBoundsForLayout(
      this.options?.layout,
      this.layers?.size,
      this.options?.mode,
    );
    if (trimmed === RANDOM_LAYOUT_POSITION_CHOICE) {
      visuals?.ensureNodeAttribute?.(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);

      let wrote = false;
      const applyRandomSeed = () => {
        const targetBuffer = network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE) ?? null;
        const targetView = targetBuffer?.view ?? null;
        const nodeIndices = network.nodeIndices ?? null;
        if (!targetView || !nodeIndices?.length) return;

        const center = Array.isArray(seedBounds.center) ? seedBounds.center : [0, 0, 0];
        const cx = Number.isFinite(center[0]) ? center[0] : 0;
        const cy = Number.isFinite(center[1]) ? center[1] : 0;
        const cz = Number.isFinite(center[2]) ? center[2] : 0;
        const safeMode = seedBounds.mode === '3d' ? '3d' : '2d';
        const squareSide = Math.max(1, Math.min(
          Number(seedBounds.width) || 1,
          Number(seedBounds.height) || 1,
        ));
        const cubeSide = Math.max(
          squareSide,
          Number(seedBounds.depth) || 0,
        );
        const halfSquare = squareSide * 0.5;
        const halfCube = cubeSide * 0.5;

        for (let i = 0; i < nodeIndices.length; i += 1) {
          const nodeId = nodeIndices[i];
          const offset = nodeId * 3;
          targetView[offset] = cx + ((Math.random() * 2 - 1) * halfSquare);
          targetView[offset + 1] = cy + ((Math.random() * 2 - 1) * halfSquare);
          targetView[offset + 2] = safeMode === '3d'
            ? cz + ((Math.random() * 2 - 1) * halfCube)
            : 0;
          wrote = true;
        }
      };

      if (typeof network.withBufferAccess === 'function') {
        network.withBufferAccess(applyRandomSeed);
      } else {
        applyRandomSeed();
      }

      if (!wrote) return false;

      visuals?.markPositionsDirty?.();
      visuals?.bumpNodeAttributes?.(NODE_POSITION_ATTRIBUTE);
      visuals?.bumpEdgeAttributes?.(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
      this._markAutoFitDirty(false);
      this._layout?.seedFromNetworkPositions?.();
      this.scheduler?.requestGeometry?.();
      this.scheduler?.requestRender?.();
      this._labels?.requestFullReselect?.('layout-position-random');
      return true;
    }

    const info = network.getNodeAttributeInfo?.(trimmed) ?? null;
    const dimension = Number(info?.dimension ?? 0);
    if (!info) {
      throw new Error(`Unknown node attribute "${trimmed}"`);
    }
    if (!isNumericLayoutPositionAttributeType(info.type) || info.complex === true || (dimension !== 2 && dimension !== 3)) {
      throw new Error(`Node attribute "${trimmed}" must be a numeric 2D or 3D vector attribute`);
    }

    visuals?.ensureNodeAttribute?.(NODE_POSITION_ATTRIBUTE, AttributeType.Float, 3);

    let wrote = false;
    const apply = () => {
      const sourceBuffer = network.getNodeAttributeBuffer?.(trimmed) ?? null;
      const targetBuffer = network.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE) ?? null;
      const sourceView = sourceBuffer?.view ?? null;
      const targetView = targetBuffer?.view ?? null;
      if (!sourceView || !targetView) return;

      const sourceCount = Math.floor(sourceView.length / dimension);
      const targetCount = Math.floor(targetView.length / 3);
      const count = Math.min(sourceCount, targetCount);
      if (count <= 0) return;

      for (let index = 0; index < count; index += 1) {
        const sourceOffset = index * dimension;
        const targetOffset = index * 3;
        const x = Number(sourceView[sourceOffset]);
        const y = Number(sourceView[sourceOffset + 1]);
        const z = dimension === 3 ? Number(sourceView[sourceOffset + 2]) : 0;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
        targetView[targetOffset] = x;
        targetView[targetOffset + 1] = y;
        targetView[targetOffset + 2] = z;
        wrote = true;
      }
    };

    if (typeof network.withBufferAccess === 'function') {
      network.withBufferAccess(apply);
    } else {
      apply();
    }

    if (!wrote) return false;

    visuals?.markPositionsDirty?.();
    visuals?.bumpNodeAttributes?.(NODE_POSITION_ATTRIBUTE);
    visuals?.bumpEdgeAttributes?.(EDGE_ENDPOINTS_POSITION_ATTRIBUTE);
    this._markAutoFitDirty(false);
    this._layout?.seedFromNetworkPositions?.();
    this.scheduler?.requestGeometry?.();
    this.scheduler?.requestRender?.();
    this._labels?.requestFullReselect?.('layout-position-attribute');
    return true;
  }

  positions(options) {
    if (arguments.length === 0) {
      return {
        source: this._positionsConfig?.source ?? 'network',
        delegate: this._positionsConfig?.delegate ?? null,
      };
    }
    if (options == null) {
      options = { source: 'network', delegate: null };
    }
    if (typeof options !== 'object') {
      throw new TypeError('positions(options) expects an object or null');
    }
    this._enforcePositionSourcePolicy(this._layout, { resetInterpolation: false });
    this._applyPositionPipelineToRenderer();
    this._markAutoFitDirty(false);
    this.scheduler.requestGeometry();
    this.scheduler.requestRender();
    this._labels?.requestFullReselect?.('positions-config');
    return this;
  }

  async snapshotDelegatePositions(options = {}) {
    const delegate = options?.delegate ?? this._positionsConfig?.delegate ?? this._activePositionDelegate ?? null;
    if (!delegate) return null;
    const context = this._buildPositionDelegateContext(options);
    if (typeof delegate.snapshotNodePositions === 'function') {
      return delegate.snapshotNodePositions(context);
    }
    let view = null;
    if (typeof delegate.getNodePositionView === 'function') {
      view = delegate.getNodePositionView(context);
    } else if (typeof delegate.getPositionView === 'function') {
      view = delegate.getPositionView(context);
    }
    if (!view || !Number.isFinite(view.length) || view.length <= 0) return null;
    return new Float32Array(view);
  }

  async syncDelegatePositionsToNetwork(options = {}) {
    const delegate = options?.delegate ?? this._positionsConfig?.delegate ?? this._activePositionDelegate ?? null;
    if (!delegate) return false;
    const context = this._buildPositionDelegateContext(options);
    let wrote = false;
    if (typeof delegate.synchronizeNodePositionsToNetwork === 'function') {
      wrote = await delegate.synchronizeNodePositionsToNetwork(context);
    } else {
      const snapshot = await this.snapshotDelegatePositions({ ...options, delegate });
      wrote = this._writeNodePositions(snapshot);
    }
    if (!wrote) return false;
    this.visuals?.markPositionsDirty?.();
    this._markAutoFitDirty(false);
    this.scheduler?.requestGeometry?.();
    this.scheduler?.requestRender?.();
    return true;
  }

  interpolation(options) {
    if (arguments.length === 0) {
      const config = this._interpolationConfig ?? POSITION_INTERPOLATION_DEFAULTS;
      const durationMode = resolveInterpolationDurationMode(config);
      return {
        ...config,
        durationMode,
        adaptiveDuration: durationMode === 'adaptive',
        fixedDurationMs: config.durationMs,
        active: this._interpolationRuntime?.active === true,
        factor: clamp01(this._interpolationRuntime?.factor, 1),
        effectiveDurationMs: Number.isFinite(this._interpolationRuntime?.effectiveDurationMs)
          ? this._interpolationRuntime.effectiveDurationMs
          : this._resolveInterpolationDurationMs(performance.now()),
      };
    }
    let updates = options;
    if (typeof updates === 'string') {
      updates = { mode: updates, enabled: true };
    }
    if (updates == null) {
      updates = { enabled: false };
    }
    if (typeof updates !== 'object') {
      throw new TypeError('interpolation(options) expects an object, string mode, or null');
    }
    const current = this._interpolationConfig ?? { ...POSITION_INTERPOLATION_DEFAULTS };
    const next = { ...current };
    if (Object.prototype.hasOwnProperty.call(updates, 'enabled')) {
      next.enabled = updates.enabled === true;
    }
    const hasDurationModeUpdate = (
      Object.prototype.hasOwnProperty.call(updates, 'durationMode')
      || Object.prototype.hasOwnProperty.call(updates, 'durationStrategy')
    );
    const hasAdaptiveDurationUpdate = Object.prototype.hasOwnProperty.call(updates, 'adaptiveDuration');
    const hasFixedDurationUpdate = Object.prototype.hasOwnProperty.call(updates, 'fixedDurationMs');
    if (
      Object.prototype.hasOwnProperty.call(updates, 'mode')
      || Object.prototype.hasOwnProperty.call(updates, 'type')
    ) {
      next.mode = normalizeInterpolationMode(updates.mode ?? updates.type);
    }
    if (hasDurationModeUpdate) {
      next.durationMode = normalizeInterpolationDurationMode(
        updates.durationMode ?? updates.durationStrategy,
        resolveInterpolationDurationMode(current),
      );
      next.adaptiveDuration = next.durationMode === 'adaptive';
    }
    if (hasAdaptiveDurationUpdate) {
      next.adaptiveDuration = updates.adaptiveDuration === true;
      next.durationMode = next.adaptiveDuration ? 'adaptive' : 'fixed';
    }
    if (
      Object.prototype.hasOwnProperty.call(updates, 'durationMs')
      || Object.prototype.hasOwnProperty.call(updates, 'duration')
      || Object.prototype.hasOwnProperty.call(updates, 'fixedDurationMs')
    ) {
      next.durationMs = normalizeNonNegativeNumber(
        updates.fixedDurationMs ?? updates.durationMs ?? updates.duration,
        current.durationMs,
        0,
        60000,
      );
    }
    if (hasFixedDurationUpdate && !hasDurationModeUpdate && !hasAdaptiveDurationUpdate) {
      next.durationMode = 'fixed';
      next.adaptiveDuration = false;
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationSamples')) {
      next.adaptiveDurationSamples = normalizePositiveInteger(
        updates.adaptiveDurationSamples,
        current.adaptiveDurationSamples,
        1,
        120,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationWindowMs')) {
      next.adaptiveDurationWindowMs = normalizeNonNegativeNumber(
        updates.adaptiveDurationWindowMs,
        current.adaptiveDurationWindowMs,
        100,
        60000,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationScale')) {
      next.adaptiveDurationScale = normalizeNonNegativeNumber(
        updates.adaptiveDurationScale,
        current.adaptiveDurationScale,
        0,
        16,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationMinMs')) {
      next.adaptiveDurationMinMs = normalizeNonNegativeNumber(
        updates.adaptiveDurationMinMs,
        current.adaptiveDurationMinMs,
        0,
        60000,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'adaptiveDurationMaxMs')) {
      next.adaptiveDurationMaxMs = normalizeNonNegativeNumber(
        updates.adaptiveDurationMaxMs,
        current.adaptiveDurationMaxMs,
        0,
        60000,
      );
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'easing')) {
      next.easing = normalizeInterpolationEasing(updates.easing, current.easing);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'smoothing')) {
      next.smoothing = normalizeNonNegativeNumber(updates.smoothing, current.smoothing);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'minDisplacementRatio')) {
      next.minDisplacementRatio = normalizeNonNegativeNumber(
        updates.minDisplacementRatio,
        current.minDisplacementRatio,
      );
    }
    next.durationMode = normalizeInterpolationDurationMode(
      next.durationMode,
      next.adaptiveDuration === true ? 'adaptive' : 'fixed',
    );
    next.adaptiveDuration = next.durationMode === 'adaptive';
    next.mode = 'gpu';
    const modeChanged = normalizeInterpolationMode(current.mode) !== normalizeInterpolationMode(next.mode);
    const disabled = current.enabled === true && next.enabled !== true;
    this._interpolationConfig = next;
    if (modeChanged || disabled) {
      this._resetInterpolationRuntime({ keepLastRendered: true });
    } else if (this._interpolationRuntime) {
      this._interpolationRuntime.effectiveDurationMs = this._resolveInterpolationDurationMs(performance.now());
    }
    this._applyPositionPipelineToRenderer();
    this.scheduler.requestRender();
    return this;
  }

  // Backwards-compatible aliases.
  setLayout(layout) { return this.layout(layout); }
  setPositions(options) { return this.positions(options); }
  setInterpolation(options) { return this.interpolation(options); }
  setDensity(options) { return this.density(options); }
  setLabels(options) { return this.labels(options); }
  setLegends(options) { return this.legends(options); }
  setMappers(mappers) { return this.mappers(mappers); }
  setNodeState(indices, mask, options) { return this.nodeState(indices, mask, options); }
  setEdgeState(indices, mask, options) { return this.edgeState(indices, mask, options); }
  setNodeStateStyle(slot, style) { return this.nodeStateStyle(slot, style); }
  setEdgeStateStyle(slot, style) { return this.edgeStateStyle(slot, style); }
  setNodeNoStateStyle(style) { return this.nodeNoStateStyle(style); }
  setEdgeNoStateStyle(style) { return this.edgeNoStateStyle(style); }

  startLayout(algo = null, params = null) {
    const requestedAlgo = typeof algo === 'string' ? algo : null;
    const requestedParams = params ?? (requestedAlgo ? null : algo);
    this.scheduler.setLayoutEnabled(true, 'user');
    this._requestLayoutReheat('user');
    this.scheduler.requestLayout('user');
    if (requestedAlgo || requestedParams) {
      this.debug.log('layout', 'startLayout called', { algo: requestedAlgo, params: requestedParams });
    }
    return this;
  }

  stopLayout(reason = 'user') {
    this.scheduler.setLayoutEnabled(false, reason);
    return this;
  }

  requestRender() {
    this.scheduler.requestRender();
    return this;
  }

  performRendering() {
    if (!this.manualRendering) {
      console.warn('performRendering() should only be called when manualRendering option is enabled');
      return;
    }
    if (!this.firstGeometryUpdateComplete) {
      console.warn('performRendering() called before initialization is complete');
      return;
    }
    // Update geometry if needed
    // if (this.mappersDirty) {
    //   this.visuals.applyMappers({
    //     nodeMapper: this.nodeMapper.toCombinedMapper(),
    //     edgeMapper: this.edgeMapper.toCombinedMapper(),
    //   });
    //   this.mappersDirty = false;
    // }
    const timestamp = performance.now();
    this._runInterpolationRenderPump(timestamp);
    const renderNetwork = this._getRenderNetwork();
    // Create frame and render
    const frame = {
      network: renderNetwork,
      timestamp,
      camera: this.renderer?.camera,
    };
    this.attributeTracker?.render(frame, true);
    if (this.renderer && typeof this.renderer.render === 'function') {
      this.counters.renderFrames = bumpCounter(this.counters.renderFrames);
      this.renderer.render(frame, this.size);
    }
  }

  enableAttributeTracking(nodeAttribute = '$index', edgeAttribute = null, options = {}) {
    if (!this.attributeTracker && this.renderer) {
      this.attributeTracker = new AttributeTracker(this.renderer);
    }
    this.attributeTracker?.enable(nodeAttribute, edgeAttribute, options);
    const updateOptions = {
      autoUpdate: options.autoUpdate ?? this.attributeUpdateOptions.autoUpdate,
      maxFps: options.autoUpdateMaxFps ?? this.attributeUpdateOptions.maxFps,
      frameSkip: options.autoUpdateFrameSkip ?? this.attributeUpdateOptions.frameSkip,
    };
    this.attributeUpdateOptions = updateOptions;
    this.scheduler.configureAttributeUpdates(updateOptions);
    return this.attributeTracker;
  }

  disableAttributeTracking(scope) {
    this.attributeTracker?.disable(scope);
  }

  async renderAttributeTracking() {
    if (!this.attributeTracker) return null;
    const renderNetwork = this._getRenderNetwork();
    const frame = {
      network: renderNetwork,
      timestamp: performance.now(),
      camera: this.renderer?.camera,
    };
    return this.attributeTracker.render(frame, true);
  }

  async pickAttributesAt(clientX, clientY) {
    if (!this.attributeTracker) return { node: -1, edge: -1 };
    await this.renderAttributeTracking();
    return this.attributeTracker.pick(clientX, clientY);
  }

  /**
   * Returns a Map of framebuffer/attachment references to monotonically
   * increasing "version" counters (wrapping at Number.MAX_SAFE_INTEGER).
   *
   * Keys are live object references (e.g. RenderTarget instances, WebGLFramebuffer,
   * GPUTexture) so they can be used for identity comparisons.
   */
  getFramebufferVersionsByRefMap() {
    const versions = new Map();

    const addAttributeTrackerTargets = (tracker) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      if (targets.node) versions.set(targets.node, counters.node ?? 0);
      if (targets.edge) versions.set(targets.edge, counters.edge ?? 0);
      if (targets.depthTargets?.node) versions.set(targets.depthTargets.node, counters.nodeDepth ?? 0);
      if (targets.depthTargets?.edge) versions.set(targets.depthTargets.edge, counters.edgeDepth ?? 0);
    };

    addAttributeTrackerTargets(this.attributeTracker);
    addAttributeTrackerTargets(this.indexPickingTracker);

    if (this.renderer?.renderTarget) {
      versions.set(this.renderer.renderTarget, this.counters?.renderFrames ?? 0);
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      versions.set(graphLayer.weightedFramebuffer, graphLayer.counters?.weightedFramebufferRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.color) {
      versions.set(graphLayer.weightedTextures.color, graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.weight) {
      versions.set(graphLayer.weightedTextures.weight, graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }

    return versions;
  }

  /**
   * Returns framebuffer/attachment information keyed by a meaningful name.
   * Values include the version counter and a minimal shape description.
   *
   * Key format conventions:
   * - `attributes.<attributeName>.<scope>.<tracking|picking>[.<depth>]`
   * - `render.<variation>`
   */
  getFramebufferInformation() {
    const info = {};

    const set = (key, value) => {
      if (!key) return;
      info[key] = value;
    };

    const describeRenderTarget = (target, extra = {}) => {
      if (!target) return { version: 0, ...extra };
      const base = {
        type: target.type ?? null,
        width: target.width ?? null,
        height: target.height ?? null,
      };
      return { ...base, ...extra };
    };

    const addTracker = (tracker, variant) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      const nodeAttr = tracker.nodeAttribute ?? null;
      const edgeAttr = tracker.edgeAttribute ?? null;
      if (nodeAttr && targets.node) {
        set(
          `attributes.${nodeAttr}.node.${variant}`,
          { ...describeRenderTarget(targets.node), version: counters.node ?? 0 },
        );
      }
      if (edgeAttr && targets.edge) {
        set(
          `attributes.${edgeAttr}.edge.${variant}`,
          { ...describeRenderTarget(targets.edge), version: counters.edge ?? 0 },
        );
      }
      if (tracker.options?.trackDepth === true) {
        if (nodeAttr && targets.depthTargets?.node) {
          set(
            `attributes.${nodeAttr}.node.${variant}.depth`,
            { ...describeRenderTarget(targets.depthTargets.node), version: counters.nodeDepth ?? 0 },
          );
        }
        if (edgeAttr && targets.depthTargets?.edge) {
          set(
            `attributes.${edgeAttr}.edge.${variant}.depth`,
            { ...describeRenderTarget(targets.depthTargets.edge), version: counters.edgeDepth ?? 0 },
          );
        }
      }
    };

    addTracker(this.attributeTracker, 'tracking');
    addTracker(this.indexPickingTracker, 'picking');

    const device = this.renderer?.device ?? null;
    const renderTarget = this.renderer?.renderTarget ?? null;
    if (device?.type === 'webgl2') {
      set(
        renderTarget ? 'render.webgl.target' : 'render.webgl.default',
        { ...describeRenderTarget(renderTarget, { type: 'webgl2' }), version: device.counters?.beginFrame ?? 0 },
      );
      set('render.webgl.present', { type: 'webgl2', version: device.counters?.presentFramebuffer ?? 0 });
    } else if (device?.type === 'webgpu') {
      set(
        renderTarget ? 'render.webgpu.target' : 'render.webgpu.swapchain',
        { ...describeRenderTarget(renderTarget, { type: 'webgpu' }), version: device.counters?.beginFrame ?? 0 },
      );
      set(
        'render.webgpu.depth',
        {
          type: 'webgpu',
          width: renderTarget?.width ?? this.size?.width ?? null,
          height: renderTarget?.height ?? this.size?.height ?? null,
          version: device.counters?.beginFrame ?? 0,
        },
      );
      set('render.webgpu.present', { type: 'webgpu', version: device.counters?.presentFramebuffer ?? 0 });
    } else if (this.renderer) {
      set('render.main', { type: 'unknown', version: this.counters?.renderFrames ?? 0 });
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      set(
        'render.weighted.webgl.framebuffer',
        {
          type: 'webgl2',
          width: graphLayer.weightedSize?.width ?? null,
          height: graphLayer.weightedSize?.height ?? null,
          version: graphLayer.counters?.weightedFramebufferRenders ?? 0,
        },
      );
    }
    if (graphLayer?.weightedTextures?.color) {
      set(
        'render.weighted.webgpu.color',
        {
          type: 'webgpu',
          width: graphLayer.weightedTextures?.width ?? null,
          height: graphLayer.weightedTextures?.height ?? null,
          format: graphLayer.weightedTextures?.color?.format ?? null,
          version: graphLayer.counters?.weightedAttachmentRenders ?? 0,
        },
      );
    }
    if (graphLayer?.weightedTextures?.weight) {
      set(
        'render.weighted.webgpu.weight',
        {
          type: 'webgpu',
          width: graphLayer.weightedTextures?.width ?? null,
          height: graphLayer.weightedTextures?.height ?? null,
          format: graphLayer.weightedTextures?.weight?.format ?? null,
          version: graphLayer.counters?.weightedAttachmentRenders ?? 0,
        },
      );
    }

    return info;
  }

  /**
   * Returns an object keyed by a meaningful framebuffer name, where each value
   * is the version counter.
   *
   * Key format conventions:
   * - `attributes.<attributeName>.<scope>.<tracking|picking>[.<depth>]`
   * - `render.<variation>`
   */
  getFramebufferVersions() {
    const summary = {};

    const addEntry = (key, version) => {
      if (!key) return;
      summary[key] = version ?? 0;
    };

    const addTracker = (tracker, variant) => {
      if (!tracker?.lastTargets) return;
      const targets = tracker.lastTargets;
      const counters = tracker.counters ?? {};
      const nodeAttr = tracker.nodeAttribute ?? null;
      const edgeAttr = tracker.edgeAttribute ?? null;
      if (nodeAttr && targets.node) {
        addEntry(`attributes.${nodeAttr}.node.${variant}`, counters.node ?? 0);
      }
      if (edgeAttr && targets.edge) {
        addEntry(`attributes.${edgeAttr}.edge.${variant}`, counters.edge ?? 0);
      }
      if (tracker.options?.trackDepth === true) {
        if (nodeAttr && targets.depthTargets?.node) {
          addEntry(`attributes.${nodeAttr}.node.${variant}.depth`, counters.nodeDepth ?? 0);
        }
        if (edgeAttr && targets.depthTargets?.edge) {
          addEntry(`attributes.${edgeAttr}.edge.${variant}.depth`, counters.edgeDepth ?? 0);
        }
      }
    };

    addTracker(this.attributeTracker, 'tracking');
    addTracker(this.indexPickingTracker, 'picking');

    const device = this.renderer?.device ?? null;
    const renderTarget = this.renderer?.renderTarget ?? null;
    if (device?.type === 'webgl2') {
      addEntry(renderTarget ? 'render.webgl.target' : 'render.webgl.default', device.counters?.beginFrame ?? 0);
      addEntry('render.webgl.present', device.counters?.presentFramebuffer ?? 0);
    } else if (device?.type === 'webgpu') {
      addEntry(renderTarget ? 'render.webgpu.target' : 'render.webgpu.swapchain', device.counters?.beginFrame ?? 0);
      addEntry('render.webgpu.depth', device.counters?.beginFrame ?? 0);
      addEntry('render.webgpu.present', device.counters?.presentFramebuffer ?? 0);
    } else if (this.renderer) {
      addEntry('render.main', this.counters?.renderFrames ?? 0);
    }

    const graphLayer = this.renderer?.graphLayer;
    if (graphLayer?.weightedFramebuffer) {
      addEntry('render.weighted.webgl.framebuffer', graphLayer.counters?.weightedFramebufferRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.color) {
      addEntry('render.weighted.webgpu.color', graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }
    if (graphLayer?.weightedTextures?.weight) {
      addEntry('render.weighted.webgpu.weight', graphLayer.counters?.weightedAttachmentRenders ?? 0);
    }

    return summary;
  }

  // Backwards-compatible alias: use getFramebufferInformation() for string-keyed details.
  getFramebufferVersionsByRef() {
    return this.getFramebufferInformation();
  }

  enableNodePicking(options = {}) {
    this._picking.node.enabled = true;
    this._picking.node.hoverEnabled = options.hoverEnabled !== false && options.trackHover !== false;
    this._mergePickingOptions(options);
    this._applyPickingConfig();
    return this;
  }

  enableEdgePicking(options = {}) {
    this._picking.edge.enabled = true;
    this._picking.edge.hoverEnabled = options.hoverEnabled !== false && options.trackHover !== false;
    this._mergePickingOptions(options);
    this._applyPickingConfig();
    return this;
  }

  disableNodePicking() {
    this._picking.node.enabled = false;
    this._applyPickingConfig();
    return this;
  }

  disableEdgePicking() {
    this._picking.edge.enabled = false;
    this._applyPickingConfig();
    return this;
  }

  _mergePickingOptions(options = {}) {
    if (!options) return;
    if (options.resolutionScale != null) {
      const scale = Number(options.resolutionScale);
      if (Number.isFinite(scale) && scale > 0) {
        this._picking.options.resolutionScale = scale;
      }
    }
    if (options.trackDepth != null) {
      this._picking.options.trackDepth = options.trackDepth === true;
    }
    if (options.maxFps != null) {
      const maxFps = Number(options.maxFps);
      if (Number.isFinite(maxFps) && maxFps > 0) {
        this._picking.options.maxFps = Math.floor(maxFps);
      }
    }
    if (options.clickRequiresStationary != null) {
      this._picking.options.clickRequiresStationary = options.clickRequiresStationary !== false;
    }
    if (options.clickMoveTolerancePx != null) {
      const tolerance = Number(options.clickMoveTolerancePx);
      if (Number.isFinite(tolerance) && tolerance >= 0) {
        this._picking.options.clickMoveTolerancePx = tolerance;
      }
    }
    if (options.suppressClickAfterWheelMs != null) {
      const ms = Number(options.suppressClickAfterWheelMs);
      if (Number.isFinite(ms) && ms >= 0) {
        this._picking.options.suppressClickAfterWheelMs = ms;
      }
    }
  }

  _applyPickingConfig() {
    const nodeEnabled = this._picking.node.enabled;
    const edgeEnabled = this._picking.edge.enabled;
    if (!nodeEnabled && !edgeEnabled) {
      this._detachPickingListeners();
      this._resetHover('disabled');
      this.indexPickingTracker?.destroy?.();
      this.indexPickingTracker = null;
      this._reconcileAttributeUpdateConfig();
      return;
    }
    if (!this.renderer) {
      this.ready?.then?.(() => this._applyPickingConfig());
      return;
    }
    if (!this.indexPickingTracker) {
      this.indexPickingTracker = new AttributeTracker(this.renderer);
    }
    this.indexPickingTracker.enable(nodeEnabled ? '$index' : null, edgeEnabled ? '$index' : null, {
      resolutionScale: this._picking.options.resolutionScale,
      trackDepth: this._picking.options.trackDepth,
      autoRender: true,
    });
    this.indexPickingTracker.resize(this.size);
    this._attachPickingListeners();
    this._syncHoverTrackingState('config');
    this._reconcileAttributeUpdateConfig();
    this.scheduler.requestRender();
  }

  _reconcileAttributeUpdateConfig() {
    const manual = this.attributeUpdateOptions ?? { autoUpdate: false, maxFps: null, frameSkip: null };
    const pickingEnabled = this._hasHoverPickingEnabled();
    const picking = pickingEnabled
      ? { autoUpdate: true, maxFps: this._picking.options.maxFps ?? 30, frameSkip: 0 }
      : { autoUpdate: false, maxFps: null, frameSkip: null };
    const autoUpdate = manual.autoUpdate === true || picking.autoUpdate === true;
    if (!autoUpdate) {
      this.scheduler.configureAttributeUpdates({ autoUpdate: false });
      return;
    }
    const enabledMaxFps = [];
    if (manual.autoUpdate === true) enabledMaxFps.push(manual.maxFps);
    if (picking.autoUpdate === true) enabledMaxFps.push(picking.maxFps);
    const effectiveFps = enabledMaxFps.map((value) => (Number.isFinite(value) && value > 0 ? value : 60));
    const combinedMaxFps = Math.max(...effectiveFps);
    const frameSkip = 0;
    this.scheduler.configureAttributeUpdates({ autoUpdate: true, maxFps: combinedMaxFps, frameSkip });
  }

  _getInteractionCanvas() {
    return this.layers?.canvas ?? this.renderer?.canvas ?? null;
  }

  _hasHoverPickingEnabled() {
    return (
      (this._picking.node.enabled === true && this._picking.node.hoverEnabled !== false)
      || (this._picking.edge.enabled === true && this._picking.edge.hoverEnabled !== false)
    );
  }

  _resolveHoverHit(picked) {
    if (!picked) return null;
    const nodeEnabled = this._picking.node.enabled === true && this._picking.node.hoverEnabled !== false;
    const edgeEnabled = this._picking.edge.enabled === true && this._picking.edge.hoverEnabled !== false;
    const nodeHit = nodeEnabled ? picked.node : -1;
    const edgeHit = edgeEnabled ? picked.edge : -1;
    const nodeDepth = picked.nodeDepth;
    const edgeDepth = picked.edgeDepth;
    if (nodeHit < 0 && edgeHit < 0) return { kind: null, index: -1, depth: null };
    const trackDepth = this._picking.options.trackDepth === true;
    if (trackDepth && nodeHit >= 0 && edgeHit >= 0 && Number.isFinite(nodeDepth) && Number.isFinite(edgeDepth)) {
      return nodeDepth <= edgeDepth
        ? { kind: 'node', index: nodeHit, depth: nodeDepth }
        : { kind: 'edge', index: edgeHit, depth: edgeDepth };
    }
    if (nodeHit >= 0) return { kind: 'node', index: nodeHit, depth: Number.isFinite(nodeDepth) ? nodeDepth : null };
    return { kind: 'edge', index: edgeHit, depth: Number.isFinite(edgeDepth) ? edgeDepth : null };
  }

  _syncHoverTrackingState(reason = 'config') {
    if (!this._hasHoverPickingEnabled()) {
      if (this._picking.hoverThrottleTimer) {
        clearTimeout(this._picking.hoverThrottleTimer);
        this._picking.hoverThrottleTimer = null;
      }
      if (this._picking.cameraIdleTimer) {
        clearTimeout(this._picking.cameraIdleTimer);
        this._picking.cameraIdleTimer = null;
      }
      this._picking._rerun = false;
      this._resetHover(reason);
      return;
    }
    const prev = this._picking.hover;
    if (prev.kind === 'node' && this._picking.node.hoverEnabled === false) {
      this._resetHover(reason);
      return;
    }
    if (prev.kind === 'edge' && this._picking.edge.hoverEnabled === false) {
      this._resetHover(reason);
    }
  }

  _attachPickingListeners() {
    const canvas = this._getInteractionCanvas();
    if (!canvas || this._pickingListenersAttached) return;
    canvas.addEventListener('pointerdown', this._boundPickingHandlers.down, { passive: true });
    canvas.addEventListener('pointermove', this._boundPickingHandlers.move, { passive: true });
    canvas.addEventListener('pointerup', this._boundPickingHandlers.up, { passive: true });
    canvas.addEventListener('pointercancel', this._boundPickingHandlers.cancel, { passive: true });
    canvas.addEventListener('pointerleave', this._boundPickingHandlers.leave, { passive: true });
    canvas.addEventListener('wheel', this._boundPickingHandlers.wheel, { passive: true });
    canvas.addEventListener('click', this._boundPickingHandlers.click);
    canvas.addEventListener('dblclick', this._boundPickingHandlers.dblclick);
    this._pickingListenersAttached = true;
  }

  _detachPickingListeners() {
    const canvas = this._getInteractionCanvas();
    if (!canvas || !this._pickingListenersAttached) return;
    canvas.removeEventListener('pointerdown', this._boundPickingHandlers.down);
    canvas.removeEventListener('pointermove', this._boundPickingHandlers.move);
    canvas.removeEventListener('pointerup', this._boundPickingHandlers.up);
    canvas.removeEventListener('pointercancel', this._boundPickingHandlers.cancel);
    canvas.removeEventListener('pointerleave', this._boundPickingHandlers.leave);
    canvas.removeEventListener('wheel', this._boundPickingHandlers.wheel);
    canvas.removeEventListener('click', this._boundPickingHandlers.click);
    canvas.removeEventListener('dblclick', this._boundPickingHandlers.dblclick);
    this._pickingListenersAttached = false;
  }

  _handlePointerDown(event) {
    const g = this._picking.gesture;
    g.active = true;
    g.startClientX = event.clientX ?? 0;
    g.startClientY = event.clientY ?? 0;
    g.moved = false;
    g.cameraMoved = false;
    // Keep wheelZoomed/lastWheelAt so we can suppress click after a zoom gesture.
  }

  _handlePointerUp() {
    this._picking.gesture.active = false;
  }

  _handlePointerMove(event) {
    const canvas = this._getInteractionCanvas();
    if (!canvas) return;
    const g = this._picking.gesture;
    if (g.active) {
      const dx = (event.clientX ?? 0) - g.startClientX;
      const dy = (event.clientY ?? 0) - g.startClientY;
      const dist = Math.hypot(dx, dy);
      if (dist > (this._picking.options.clickMoveTolerancePx ?? 4)) {
        g.moved = true;
        g.cameraMoved = true;
      }
    }
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    this._picking.pointer = {
      x,
      y,
      clientX: event.clientX,
      clientY: event.clientY,
      inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height,
    };
    // Suppress hover while panning/rotating (mouse button down).
    if (event.buttons && event.buttons !== 0) {
      this._picking.suppressHover = true;
      this._resetHover('camera');
      return;
    }
    this._picking.suppressHover = false;
    this._scheduleHoverPick();
  }

  _handlePointerLeave() {
    this._picking.pointer.inside = false;
    this._picking.suppressHover = false;
    if (this._picking.hoverThrottleTimer) {
      clearTimeout(this._picking.hoverThrottleTimer);
      this._picking.hoverThrottleTimer = null;
    }
    this._picking.gesture.active = false;
    this._resetHover('leave');
  }

  _handleWheel(_) {
    // Zoom can trigger camera changes; avoid hover spam while the camera is moving.
    this._picking.suppressHover = true;
    this._picking.gesture.wheelZoomed = true;
    this._picking.gesture.lastWheelAt = performance.now();
    this._resetHover('camera');
    this._scheduleCameraIdleHoverPick();
  }

  async _handlePointerClick(event, isDouble) {
    if (!this.indexPickingTracker) return;
    const clickRequiresStationary = this._picking.options.clickRequiresStationary !== false;
    if (clickRequiresStationary) {
      const g = this._picking.gesture;
      const now = performance.now();
      const suppressWheelMs = this._picking.options.suppressClickAfterWheelMs ?? 200;
      const wheelRecently = Number.isFinite(g.lastWheelAt) && now - g.lastWheelAt <= suppressWheelMs;
      if (g.cameraMoved || g.moved || wheelRecently) {
        return;
      }
    }
    const canvas = this._getInteractionCanvas();
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    await this._ensureIndexPickingTargets();
    const picked = await this.indexPickingTracker.pick(x, y);
    const hit = this._resolvePrimaryHit(picked);
    const resolved = hit ?? { kind: null, index: -1, depth: null };
    const baseDetail = {
      kind: resolved.kind,
      index: resolved.index,
      node: resolved.kind === 'node' ? resolved.index : -1,
      edge: resolved.kind === 'edge' ? resolved.index : -1,
      depth: resolved.depth ?? null,
      x,
      y,
      clientX: event.clientX,
      clientY: event.clientY,
      modifiers: {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      },
      button: event.button,
    };

    this.emit(isDouble ? EVENTS.GRAPH_DBLCLICK : EVENTS.GRAPH_CLICK, baseDetail);

    if (resolved.kind === 'node' && resolved.index >= 0) {
      this.emit(isDouble ? EVENTS.NODE_DBLCLICK : EVENTS.NODE_CLICK, baseDetail);
    } else if (resolved.kind === 'edge' && resolved.index >= 0) {
      this.emit(isDouble ? EVENTS.EDGE_DBLCLICK : EVENTS.EDGE_CLICK, baseDetail);
    }
  }

  _scheduleCameraMove() {
    if (this._cameraMoveRaf != null) return;
    this._cameraMoveRaf = requestAnimationFrame((ts) => {
      this._cameraMoveRaf = null;
      const camera = this.renderer?.camera ?? null;
      const detail = {
        timestamp: ts,
        camera,
        state: camera
          ? {
              mode: camera.mode,
              projection: camera.projection,
              zoom: camera.zoom,
              distance: camera.distance,
              viewport: camera.viewport ? { ...camera.viewport } : null,
            }
          : null,
      };
      this.emit(EVENTS.CAMERA_MOVE, detail);
      // Avoid hover spam during camera movement; resample once the camera settles.
      this._picking.suppressHover = true;
      const g = this._picking.gesture;
      g.lastCameraMoveAt = performance.now();
      if (g.active) {
        g.cameraMoved = true;
      }
      this._resetHover('camera');
      this._scheduleCameraIdleHoverPick();
    });
  }

  _scheduleCameraIdleHoverPick() {
    if (!this._hasHoverPickingEnabled()) return;
    if (this._picking.cameraIdleTimer) {
      clearTimeout(this._picking.cameraIdleTimer);
    }
    this._picking.cameraIdleTimer = setTimeout(() => {
      this._picking.cameraIdleTimer = null;
      this._picking.suppressHover = false;
      if (this._picking.pointer.inside) {
        this._scheduleHoverPick();
      }
    }, 80);
  }

  _scheduleHoverPick() {
    if (!this._hasHoverPickingEnabled()) return;
    if (this._picking._raf != null) return;
    this._picking._raf = requestAnimationFrame(() => {
      this._picking._raf = null;
      void this._runHoverPick();
    });
  }

  async _ensureIndexPickingTargets() {
    if (!this.indexPickingTracker) return;
    const base = this.scheduler?.currentFrame ?? null;
    const renderNetwork = this._getRenderNetwork();
    // Scheduler.currentFrame may exist before the renderer/camera is ready.
    // Always force a current camera/network so the AttributeTracker can render.
    const frame = {
      ...(base ?? null),
      network: renderNetwork,
      timestamp: performance.now(),
      camera: this.renderer?.camera,
    };
    await this.indexPickingTracker.render(frame, true);
  }

  _resolvePrimaryHit(picked) {
    if (!picked) return null;
    const nodeEnabled = this._picking.node.enabled;
    const edgeEnabled = this._picking.edge.enabled;
    const nodeHit = nodeEnabled ? picked.node : -1;
    const edgeHit = edgeEnabled ? picked.edge : -1;
    const nodeDepth = picked.nodeDepth;
    const edgeDepth = picked.edgeDepth;
    if (nodeHit < 0 && edgeHit < 0) return { kind: null, index: -1, depth: null };
    const trackDepth = this._picking.options.trackDepth === true;
    if (trackDepth && nodeHit >= 0 && edgeHit >= 0 && Number.isFinite(nodeDepth) && Number.isFinite(edgeDepth)) {
      return nodeDepth <= edgeDepth
        ? { kind: 'node', index: nodeHit, depth: nodeDepth }
        : { kind: 'edge', index: edgeHit, depth: edgeDepth };
    }
    if (nodeHit >= 0) return { kind: 'node', index: nodeHit, depth: Number.isFinite(nodeDepth) ? nodeDepth : null };
    return { kind: 'edge', index: edgeHit, depth: Number.isFinite(edgeDepth) ? edgeDepth : null };
  }

  async _runHoverPick() {
    if (!this.indexPickingTracker) return;
    if (!this._hasHoverPickingEnabled()) return;
    if (this._picking.suppressHover) return;
    if (!this._picking.pointer.inside) {
      this._resetHover('outside');
      return;
    }
    const maxFps = this._picking.options.maxFps ?? 30;
    const interval = maxFps > 0 ? (1000 / maxFps) : 0;
    const now = performance.now();
    if (interval > 0 && now - this._picking._lastPickTime < interval) {
      if (!this._picking.hoverThrottleTimer) {
        const remaining = Math.max(0, interval - (now - this._picking._lastPickTime));
        this._picking.hoverThrottleTimer = setTimeout(() => {
          this._picking.hoverThrottleTimer = null;
          this._scheduleHoverPick();
        }, remaining);
      }
      return;
    }
    if (this._picking._inFlight) {
      this._picking._rerun = true;
      return;
    }
    this._picking._inFlight = true;
    this._picking._lastPickTime = now;
    try {
      await this._ensureIndexPickingTargets();
      const { x, y, clientX, clientY } = this._picking.pointer;
      const picked = await this.indexPickingTracker.pick(x, y);
      const hit = this._resolveHoverHit(picked);
      const prev = this._picking.hover;
      const next = hit ?? { kind: null, index: -1, depth: null };
      if (prev.kind === next.kind && prev.index === next.index) return;
      if (prev.kind === 'node' && prev.index >= 0) {
        this.emit(EVENTS.NODE_HOVER, { state: 'out', index: prev.index, depth: prev.depth, x, y, clientX, clientY });
      } else if (prev.kind === 'edge' && prev.index >= 0) {
        this.emit(EVENTS.EDGE_HOVER, { state: 'out', index: prev.index, depth: prev.depth, x, y, clientX, clientY });
      }
      if (next.kind === 'node' && next.index >= 0) {
        this.emit(EVENTS.NODE_HOVER, { state: 'in', index: next.index, depth: next.depth, x, y, clientX, clientY });
      } else if (next.kind === 'edge' && next.index >= 0) {
        this.emit(EVENTS.EDGE_HOVER, { state: 'in', index: next.index, depth: next.depth, x, y, clientX, clientY });
      }
      this._picking.hover = { ...next };
      this._labels?.requestFullReselect?.('hover-change');
      this.scheduler?.requestRender?.();
    } finally {
      this._picking._inFlight = false;
      if (this._picking._rerun) {
        this._picking._rerun = false;
        this._scheduleHoverPick();
      }
    }
  }

  _resetHover(reason) {
    const prev = this._picking.hover;
    const { x, y, clientX, clientY } = this._picking.pointer ?? {};
    if (prev.kind === 'node' && prev.index >= 0) {
      this.emit(EVENTS.NODE_HOVER, {
        state: 'out',
        index: prev.index,
        depth: prev.depth,
        reason,
        x,
        y,
        clientX,
        clientY,
      });
    } else if (prev.kind === 'edge' && prev.index >= 0) {
      this.emit(EVENTS.EDGE_HOVER, {
        state: 'out',
        index: prev.index,
        depth: prev.depth,
        reason,
        x,
        y,
        clientX,
        clientY,
      });
    }
    this._picking.hover = { kind: null, index: -1, depth: null };
    this._labels?.requestFullReselect?.('hover-reset');
    this.scheduler?.requestRender?.();
  }

  destroy() {
    this.scheduler.stop();
    this._clearEdgeAdaptiveTimer('cameraIdleTimer');
    this._clearEdgeAdaptiveTimer('probeTimer');
    this._detachPositionDelegate(this._activePositionDelegate ?? this._positionsConfig?.delegate ?? null);
    this._activePositionDelegate = null;
    this._layout?.dispose?.();
    for (const entry of this._listenHandlers.values()) {
      this.removeEventListener(entry.type, entry.listener, entry.capture);
      entry.unsubscribeSignal?.();
    }
    this._listenHandlers.clear();
    this._pendingGraphLayerProps.clear();
    this._pendingRendererProps.clear();
    if (this.removeResizeListener) {
      this.removeResizeListener();
      this.removeResizeListener = null;
    }
    this._detachPickingListeners();
    this.attributeTracker?.destroy?.();
    this.indexPickingTracker?.destroy?.();
    this.indexPickingTracker = null;
    this.renderer?.destroy?.();
    this._densityLayer = null;
    this._labels?.destroy?.();
    this._labels = null;
    this._legends?.destroy?.();
    this._legends = null;
    this.layers.destroy();
  }
}

export default Helios;
