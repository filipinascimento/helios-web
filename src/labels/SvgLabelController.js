import { AttributeType } from 'helios-network';
import { VISUAL_ATTRIBUTE_NAMES, DEFAULT_NODE_SIZE, DEFAULT_NODE_OUTLINE_WIDTH } from '../pipeline/constants.js';

const {
  NODE_POSITION_ATTRIBUTE,
  NODE_SIZE_ATTRIBUTE,
  NODE_STATE_ATTRIBUTE,
  NODE_OUTLINE_WIDTH_ATTRIBUTE,
} = VISUAL_ATTRIBUTE_NAMES;

const SVG_NS = 'http://www.w3.org/2000/svg';

const INTEGER_LIKE_TYPES = new Set([
  AttributeType.Integer,
  AttributeType.UnsignedInteger,
  AttributeType.Category,
  AttributeType.BigInteger,
  AttributeType.UnsignedBigInteger,
]);

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  source: null,
  fallbackSources: ['Label', 'Name', '$id'],
  maxVisible: 120,
  minScreenRadiusPx: 0,
  maxUpdateFps: 20,
  keepBoost: 1.08,
  selectedBoost: 2.0,
  hoveredBoost: 3.0,
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
  fontSizeScale: 1,
  fill: '#f4f7ff',
  outlineColor: '#001426cc',
  outlineWidth: 2,
  offsetRadiusFactor: 1,
  offsetPx: 4,
  maxChars: 0,
  maxRows: 1,
  collisionPaddingPx: 2,
  collisionCellPx: 18,
  delegateSnapshotMaxFps: 4,
});

function clamp(value, min, max) {
  const v = Number(value);
  if (!Number.isFinite(v)) return min;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function clampInt(value, min, max) {
  return Math.floor(clamp(value, min, max));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function quantize(value, step = 1e-3) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / step) * step;
}

function normalizeColorString(value, fallback) {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const r = Math.round(clamp01(value[0]) * 255);
    const g = Math.round(clamp01(value[1]) * 255);
    const b = Math.round(clamp01(value[2]) * 255);
    const a = clamp01(value?.[3] ?? 1);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function composeViewSignature(uniforms) {
  const viewport = uniforms?.viewport ?? {};
  const vp = uniforms?.viewProjection;
  if (!vp) return 'na';
  const parts = [
    `${Math.floor(viewport.width ?? 0)}x${Math.floor(viewport.height ?? 0)}`,
    uniforms?.mode ?? '',
    uniforms?.projectionType ?? '',
  ];
  for (let i = 0; i < 16; i += 1) {
    parts.push(String(quantize(vp[i] ?? 0, 1e-4)));
  }
  return parts.join('|');
}

function projectPoint(viewProjection, width, height, x, y, z) {
  const cx = viewProjection[0] * x + viewProjection[4] * y + viewProjection[8] * z + viewProjection[12];
  const cy = viewProjection[1] * x + viewProjection[5] * y + viewProjection[9] * z + viewProjection[13];
  const cz = viewProjection[2] * x + viewProjection[6] * y + viewProjection[10] * z + viewProjection[14];
  const cw = viewProjection[3] * x + viewProjection[7] * y + viewProjection[11] * z + viewProjection[15];
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz) || !Number.isFinite(cw)) return null;
  if (Math.abs(cw) < 1e-12) return null;
  const invW = 1 / cw;
  const ndcX = cx * invW;
  const ndcY = cy * invW;
  const ndcZ = cz * invW;
  const screenX = (ndcX * 0.5 + 0.5) * width;
  const screenY = (1 - (ndcY * 0.5 + 0.5)) * height;
  return { ndcX, ndcY, ndcZ, w: cw, screenX, screenY };
}

function estimateTextWidthPx(text, fontSizePx) {
  const len = typeof text === 'string' ? text.length : 0;
  return Math.max(6, len * fontSizePx * 0.58 + 4);
}

function pushMinHeap(heap, entry) {
  heap.push(entry);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap[parent].score < heap[i].score) break;
    if (heap[parent].score === heap[i].score && heap[parent].id <= heap[i].id) break;
    const tmp = heap[parent];
    heap[parent] = heap[i];
    heap[i] = tmp;
    i = parent;
  }
}

function replaceHeapRoot(heap, entry) {
  if (!heap.length) return;
  heap[0] = entry;
  let i = 0;
  const n = heap.length;
  while (true) {
    const left = i * 2 + 1;
    const right = left + 1;
    let next = i;
    if (left < n) {
      if (heap[left].score < heap[next].score || (heap[left].score === heap[next].score && heap[left].id < heap[next].id)) {
        next = left;
      }
    }
    if (right < n) {
      if (heap[right].score < heap[next].score || (heap[right].score === heap[next].score && heap[right].id < heap[next].id)) {
        next = right;
      }
    }
    if (next === i) break;
    const tmp = heap[i];
    heap[i] = heap[next];
    heap[next] = tmp;
    i = next;
  }
}

function maskHasSelected(view, id, selectedMask) {
  if (!view) return false;
  const raw = view[id];
  if (typeof raw === 'bigint') {
    return (raw & BigInt(selectedMask)) !== 0n;
  }
  return ((Number(raw ?? 0) >>> 0) & selectedMask) !== 0;
}

function normalizeFallbackSources(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean);
  }
  return [...DEFAULT_CONFIG.fallbackSources];
}

export class SvgLabelController {
  constructor(helios, options = {}) {
    this.helios = helios ?? null;
    this._config = { ...DEFAULT_CONFIG };
    this._needsFullReselect = true;
    this._viewSignature = '';
    this._dataSignature = '';
    this._lastFullUpdateAt = -Infinity;
    this._lastVisibleSet = new Set();
    this._visibleEntries = [];
    this._pool = [];
    this._scratchCollision = new Set();
    this._lastReason = 'init';
    this._delegateSnapshot = null;
    this._delegateSnapshotAt = -Infinity;
    this._delegateSnapshotPending = false;
    this._fallbackNameCache = { key: '', values: ['Label', 'Name'] };
    this._hoveredNode = -1;

    const svg = this.helios?.layers?.svg ?? null;
    if (!svg || typeof document === 'undefined') {
      this.svg = null;
      this.group = null;
      return;
    }
    this.svg = svg;
    this.group = document.createElementNS(SVG_NS, 'g');
    this.group.setAttribute('class', 'helios-label-layer');
    this.group.setAttribute('pointer-events', 'none');
    this.svg.appendChild(this.group);
    this.setConfig(options);
  }

  destroy() {
    this._visibleEntries.length = 0;
    this._lastVisibleSet.clear();
    this._pool.length = 0;
    this._delegateSnapshot = null;
    if (this.group) {
      this.group.remove();
    }
    this.group = null;
    this.svg = null;
  }

  requestFullReselect(reason = 'manual') {
    this._needsFullReselect = true;
    this._lastReason = reason;
  }

  getConfig() {
    return {
      ...this._config,
      fallbackSources: [...this._config.fallbackSources],
    };
  }

  setConfig(options = {}) {
    if (options == null) options = {};
    const next = { ...this._config };
    if (Object.prototype.hasOwnProperty.call(options, 'enabled')) {
      next.enabled = options.enabled === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'source')) {
      const value = options.source;
      next.source = typeof value === 'function'
        ? value
        : (value == null || String(value).trim() === '' ? null : String(value).trim());
    }
    if (Object.prototype.hasOwnProperty.call(options, 'fallbackSources')) {
      next.fallbackSources = normalizeFallbackSources(options.fallbackSources);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'maxVisible')) {
      next.maxVisible = clampInt(options.maxVisible, 0, 5000);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'minScreenRadiusPx')) {
      next.minScreenRadiusPx = clamp(options.minScreenRadiusPx, 0, 500);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'maxUpdateFps')) {
      next.maxUpdateFps = clamp(options.maxUpdateFps, 1, 120);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'keepBoost')) {
      next.keepBoost = clamp(options.keepBoost, 1, 4);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'selectedBoost')) {
      next.selectedBoost = clamp(options.selectedBoost, 1, 8);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'hoveredBoost')) {
      next.hoveredBoost = clamp(options.hoveredBoost, 1, 16);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'fontFamily')) {
      const family = String(options.fontFamily ?? '').trim();
      next.fontFamily = family || DEFAULT_CONFIG.fontFamily;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'fontSizeScale')) {
      next.fontSizeScale = clamp(options.fontSizeScale, 0.25, 8);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'fill')) {
      next.fill = normalizeColorString(options.fill, DEFAULT_CONFIG.fill);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'outlineColor')) {
      next.outlineColor = normalizeColorString(options.outlineColor, DEFAULT_CONFIG.outlineColor);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'outlineWidth')) {
      next.outlineWidth = clamp(options.outlineWidth, 0, 16);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'offsetRadiusFactor')) {
      next.offsetRadiusFactor = clamp(options.offsetRadiusFactor, -8, 8);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'offsetPx')) {
      next.offsetPx = clamp(options.offsetPx, -256, 256);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'maxChars')) {
      next.maxChars = clampInt(options.maxChars, 0, 512);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'maxRows')) {
      next.maxRows = clampInt(options.maxRows, 1, 8);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'collisionPaddingPx')) {
      next.collisionPaddingPx = clamp(options.collisionPaddingPx, 0, 32);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'collisionCellPx')) {
      next.collisionCellPx = clamp(options.collisionCellPx, 4, 128);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'delegateSnapshotMaxFps')) {
      next.delegateSnapshotMaxFps = clamp(options.delegateSnapshotMaxFps, 1, 60);
    }
    this._config = next;
    this._applyGroupStyles();
    this.requestFullReselect('config');
  }

  update({ timestamp } = {}) {
    if (!this.group || !this.helios) return false;
    const now = Number.isFinite(timestamp) ? Number(timestamp) : performance.now();
    if (this._config.enabled !== true || this._config.maxVisible <= 0) {
      this._hideAll();
      return false;
    }
    const renderer = this.helios.renderer ?? null;
    const camera = renderer?.camera ?? null;
    if (!renderer || !camera) {
      this._hideAll();
      return false;
    }
    const uniforms = camera.getUniforms?.() ?? null;
    const viewProjection = uniforms?.viewProjection ?? null;
    const viewport = uniforms?.viewport ?? null;
    if (!viewProjection || !viewport) {
      this._hideAll();
      return false;
    }

    const hoveredNode = this._currentHoveredNode();
    if (hoveredNode !== this._hoveredNode) {
      this._hoveredNode = hoveredNode;
      this.requestFullReselect('hover');
    }

    const viewSignature = composeViewSignature(uniforms);
    const dataSignature = this._composeDataSignature();
    const viewChanged = viewSignature !== this._viewSignature;
    const dataChanged = dataSignature !== this._dataSignature;
    const fullIntervalMs = 1000 / Math.max(1, this._config.maxUpdateFps);
    const canRunPeriodicFull = (now - this._lastFullUpdateAt) >= fullIntervalMs;
    const runFull = this._needsFullReselect || dataChanged || (viewChanged && canRunPeriodicFull);

    let changed = false;
    if (runFull) {
      changed = this._runFullUpdate(uniforms, now) || changed;
      this._lastFullUpdateAt = now;
      this._needsFullReselect = false;
    } else if (viewChanged) {
      changed = this._reprojectVisible(uniforms, now) || changed;
    }

    this._viewSignature = viewSignature;
    this._dataSignature = dataSignature;
    return changed;
  }

  _currentHoveredNode() {
    const hover = this.helios?._picking?.hover ?? null;
    if (hover?.kind === 'node' && Number.isInteger(hover.index) && hover.index >= 0) {
      return hover.index;
    }
    return -1;
  }

  _composeDataSignature() {
    const network = this.helios?.network ?? null;
    const source = this.helios?.positions?.() ?? { source: 'network', delegate: null };
    const topology = this._safe(() => network?.getTopologyVersions?.()) ?? {};
    const topoNode = toFinite(topology.node, 0);
    const topoEdge = toFinite(topology.edge, 0);
    const sizeVersion = this._safe(() => network?.getNodeAttributeVersion?.(NODE_SIZE_ATTRIBUTE), 0);
    const stateVersion = this._safe(() => network?.getNodeAttributeVersion?.(NODE_STATE_ATTRIBUTE), 0);
    const labelVersion = this._resolveLabelSourceVersion();
    const positionVersion = source.source === 'delegate'
      ? toFinite(source?.delegate?.version ?? 0, 0)
      : this._safe(() => network?.getNodeAttributeVersion?.(NODE_POSITION_ATTRIBUTE), 0);
    const nodeCount = toFinite(network?.nodeCount, 0);
    return [
      topoNode,
      topoEdge,
      nodeCount,
      positionVersion,
      sizeVersion,
      stateVersion,
      labelVersion,
      this._hoveredNode,
    ].join('|');
  }

  _resolveLabelSourceVersion() {
    const network = this.helios?.network ?? null;
    if (!network) return 0;
    const resolved = this._resolveCandidateSourceNames(network);
    let sum = 0;
    for (let i = 0; i < resolved.length; i += 1) {
      const name = resolved[i];
      if (!name || name === '$id') continue;
      sum += toFinite(this._safe(() => network.getNodeAttributeVersion?.(name), 0), 0);
    }
    return sum;
  }

  _runFullUpdate(uniforms, now) {
    const network = this.helios?.network ?? null;
    const viewport = uniforms?.viewport ?? null;
    if (!network || !viewport) {
      this._hideAll();
      return false;
    }
    const nodeIndices = this._safe(() => network.nodeIndices, null);
    if (!nodeIndices || !nodeIndices.length) {
      this._hideAll();
      return false;
    }

    const run = () => this._runFullUpdateUnsafe(uniforms, now, nodeIndices);
    if (typeof network.withBufferAccess === 'function') {
      try {
        return Boolean(network.withBufferAccess(run));
      } catch {
        return Boolean(run());
      }
    }
    return Boolean(run());
  }

  _runFullUpdateUnsafe(uniforms, now, nodeIndices) {
    const network = this.helios?.network ?? null;
    if (!network) return false;

    const context = this.helios?._buildPositionDelegateContext?.() ?? {};
    const positions = this._resolvePositionView(context, now);
    if (!positions?.view) {
      this._hideAll();
      return false;
    }

    const view = positions.view;

    const viewProjection = uniforms.viewProjection;
    const width = Math.max(1, Math.floor(uniforms.viewport?.width ?? this.helios?.size?.width ?? 1));
    const height = Math.max(1, Math.floor(uniforms.viewport?.height ?? this.helios?.size?.height ?? 1));
    const cameraMode = uniforms.mode ?? '2d';
    const projectionType = uniforms.projectionType ?? 'perspective';
    const right = uniforms.right ?? [1, 0, 0];
    const zoom = toFinite(this.helios?.renderer?.camera?.zoom, 1);
    const semanticZoomExponent = toFinite(this.helios?.semanticZoomExponent?.(), 0);
    const semanticScale = (cameraMode === '2d' && semanticZoomExponent > 0)
      ? (1 / Math.pow(Math.max(zoom, 1e-3), semanticZoomExponent))
      : 1;

    const nodeSizeBase = toFinite(this.helios?.nodeSizeBase?.(), 0);
    const nodeSizeScale = toFinite(this.helios?.nodeSizeScale?.(), 1);
    const nodeOutlineBase = toFinite(this.helios?.nodeOutlineWidthBase?.(), 0);
    const nodeOutlineScale = toFinite(this.helios?.nodeOutlineWidthScale?.(), 0);
    const selectedMask = toFinite(this.helios?.constructor?.STATES?.SELECTED, 1 << 1) >>> 0;
    const hoveredNode = this._hoveredNode;
    const prevVisible = this._lastVisibleSet;

    const nodeSizes = this._safe(() => network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE)?.view, null);
    const nodeOutlines = this._safe(() => network.getNodeAttributeBuffer(NODE_OUTLINE_WIDTH_ATTRIBUTE)?.view, null);
    const nodeStates = this._safe(() => network.getNodeAttributeBuffer(NODE_STATE_ATTRIBUTE)?.view, null);

    const fontSizePx = 12 * this._config.fontSizeScale;
    const maxVisible = this._config.maxVisible;
    const heapCap = Math.max(maxVisible * 6, maxVisible + 24);
    const heap = [];
    const mustInclude = [];
    const sourceAccessors = this._buildLabelSourceAccessors(network);
    const collisionCellPx = Math.max(4, this._config.collisionCellPx);
    const minRadiusPx = Math.max(0, this._config.minScreenRadiusPx);

    for (let i = 0; i < nodeIndices.length; i += 1) {
      const id = Number(nodeIndices[i]);
      if (!Number.isInteger(id) || id < 0) continue;
      const o = id * 3;
      const x = view[o];
      const y = view[o + 1];
      const z = view[o + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

      const center = projectPoint(viewProjection, width, height, x, y, z);
      if (!center) continue;
      if (projectionType !== 'orthographic' && center.w <= 1e-6) continue;
      if (center.ndcZ < -1.05 || center.ndcZ > 1.05) continue;
      if (center.ndcX < -1.2 || center.ndcX > 1.2 || center.ndcY < -1.2 || center.ndcY > 1.2) continue;

      const rawSize = toFinite(nodeSizes?.[id], DEFAULT_NODE_SIZE);
      const rawOutline = toFinite(nodeOutlines?.[id], DEFAULT_NODE_OUTLINE_WIDTH);
      const outlineWidth = Math.max(0, nodeOutlineBase + nodeOutlineScale * rawOutline);
      const fullSize = Math.max(1, (nodeSizeBase + nodeSizeScale * rawSize) + outlineWidth) * semanticScale;
      const worldRadius = Math.max(0.5, fullSize * 0.5);

      const offset = projectPoint(
        viewProjection,
        width,
        height,
        x + right[0] * worldRadius,
        y + right[1] * worldRadius,
        z + right[2] * worldRadius,
      );
      if (!offset) continue;
      const radiusPx = Math.max(1, Math.hypot(offset.screenX - center.screenX, offset.screenY - center.screenY));

      const selected = maskHasSelected(nodeStates, id, selectedMask);
      const hovered = hoveredNode === id;
      if (!selected && !hovered && radiusPx < minRadiusPx) continue;

      let score = radiusPx * radiusPx;
      if (selected) score *= this._config.selectedBoost;
      if (hovered) score *= this._config.hoveredBoost;
      if (prevVisible.has(id)) score *= this._config.keepBoost;
      score = Math.round(score * 1000) / 1000;

      const entry = {
        id,
        score,
        x: center.screenX,
        y: center.screenY,
        radiusPx,
        worldRadius,
        text: null,
        selected,
        hovered,
      };
      if (selected || hovered) {
        mustInclude.push(entry);
        continue;
      }
      if (heap.length < heapCap) {
        pushMinHeap(heap, entry);
      } else if (
        score > heap[0].score
        || (score === heap[0].score && id < heap[0].id)
      ) {
        replaceHeapRoot(heap, entry);
      }
    }

    mustInclude.sort((a, b) => (b.score - a.score) || (a.id - b.id));
    heap.sort((a, b) => (b.score - a.score) || (a.id - b.id));
    const ordered = mustInclude.concat(heap);

    const nextVisible = [];
    const occupied = this._scratchCollision;
    occupied.clear();
    for (let i = 0; i < ordered.length && nextVisible.length < maxVisible; i += 1) {
      const entry = ordered[i];
      const text = this._resolveLabelText(sourceAccessors, entry.id);
      if (!text) continue;
      const formatted = this._formatLabelText(text, fontSizePx);
      if (!formatted) continue;
      const x = entry.x;
      const y = this._computeLabelScreenY(entry.y, entry.radiusPx);
      const labelW = formatted.widthPx;
      const labelH = formatted.heightPx;
      if (x + labelW * 0.5 < 0 || x - labelW * 0.5 > width || y + labelH * 0.5 < 0 || y - labelH * 0.5 > height) {
        continue;
      }
      if (!entry.selected && !entry.hovered) {
        if (this._collides(occupied, x, y, labelW, labelH, collisionCellPx)) continue;
      }
      this._occupy(occupied, x, y, labelW, labelH, collisionCellPx);
      nextVisible.push({
        id: entry.id,
        text: formatted.text,
        lines: formatted.lines,
        x,
        y,
        worldRadius: entry.worldRadius,
        score: entry.score,
      });
    }

    this._visibleEntries = nextVisible;
    this._lastVisibleSet = new Set(nextVisible.map((entry) => entry.id));
    this._renderVisible();
    return true;
  }

  _reprojectVisible(uniforms, now) {
    if (!this._visibleEntries.length) return false;
    const network = this.helios?.network ?? null;
    if (!network) return false;
    const run = () => this._reprojectVisibleUnsafe(uniforms, now);
    if (typeof network.withBufferAccess === 'function') {
      try {
        return Boolean(network.withBufferAccess(run));
      } catch {
        return Boolean(run());
      }
    }
    return Boolean(run());
  }

  _reprojectVisibleUnsafe(uniforms, now) {
    const context = this.helios?._buildPositionDelegateContext?.() ?? {};
    const positions = this._resolvePositionView(context, now);
    const view = positions?.view ?? null;
    if (!view) {
      this._hideAll();
      return false;
    }
    const width = Math.max(1, Math.floor(uniforms.viewport?.width ?? this.helios?.size?.width ?? 1));
    const height = Math.max(1, Math.floor(uniforms.viewport?.height ?? this.helios?.size?.height ?? 1));
    const viewProjection = uniforms.viewProjection;
    const right = uniforms.right ?? [1, 0, 0];
    const projectionType = uniforms.projectionType ?? 'perspective';

    const next = [];
    for (let i = 0; i < this._visibleEntries.length; i += 1) {
      const entry = this._visibleEntries[i];
      const id = entry.id;
      const o = id * 3;
      const x = view[o];
      const y = view[o + 1];
      const z = view[o + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const center = projectPoint(viewProjection, width, height, x, y, z);
      if (!center) continue;
      if (projectionType !== 'orthographic' && center.w <= 1e-6) continue;
      if (center.ndcZ < -1.05 || center.ndcZ > 1.05) continue;
      const offset = projectPoint(
        viewProjection,
        width,
        height,
        x + right[0] * entry.worldRadius,
        y + right[1] * entry.worldRadius,
        z + right[2] * entry.worldRadius,
      );
      if (!offset) continue;
      const radiusPx = Math.max(1, Math.hypot(offset.screenX - center.screenX, offset.screenY - center.screenY));
      next.push({
        ...entry,
        x: center.screenX,
        y: this._computeLabelScreenY(center.screenY, radiusPx),
      });
    }
    this._visibleEntries = next;
    this._lastVisibleSet = new Set(next.map((entry) => entry.id));
    this._renderVisible();
    return true;
  }

  _resolvePositionView(context, now) {
    const source = this.helios?.positions?.() ?? { source: 'network', delegate: null };
    const network = this.helios?.network ?? null;
    if (source.source !== 'delegate') {
      const view = this._safe(() => network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view, null);
      return { source: 'network', view };
    }
    const delegate = source.delegate ?? null;
    if (!delegate) return { source: 'delegate', view: null };
    let view = null;
    if (typeof delegate.getNodePositionView === 'function') {
      view = this._safe(() => delegate.getNodePositionView(context), null);
    } else if (typeof delegate.getPositionView === 'function') {
      view = this._safe(() => delegate.getPositionView(context), null);
    }
    if (view && Number.isFinite(view.length) && view.length > 0) {
      return { source: 'delegate-view', view };
    }
    this._scheduleDelegateSnapshot(delegate, now);
    if (this._delegateSnapshot && Number.isFinite(this._delegateSnapshot.length) && this._delegateSnapshot.length > 0) {
      return { source: 'delegate-snapshot', view: this._delegateSnapshot };
    }
    return { source: 'delegate', view: null };
  }

  _scheduleDelegateSnapshot(delegate, now) {
    if (this._delegateSnapshotPending) return;
    const maxFps = Math.max(1, this._config.delegateSnapshotMaxFps);
    const minIntervalMs = 1000 / maxFps;
    if (now - this._delegateSnapshotAt < minIntervalMs) return;
    if (!this.helios || typeof this.helios.snapshotDelegatePositions !== 'function') return;
    this._delegateSnapshotPending = true;
    Promise.resolve()
      .then(() => this.helios.snapshotDelegatePositions({ delegate }))
      .then((snapshot) => {
        if (snapshot && Number.isFinite(snapshot.length) && snapshot.length > 0) {
          this._delegateSnapshot = snapshot;
          this._delegateSnapshotAt = performance.now();
          this.requestFullReselect('delegate-snapshot');
          this.helios?.scheduler?.requestRender?.();
        }
      })
      .catch(() => {})
      .finally(() => {
        this._delegateSnapshotPending = false;
      });
  }

  _resolveCandidateSourceNames(network) {
    const configured = this._config.source;
    if (typeof configured === 'string' && configured.trim()) {
      return [configured.trim(), '$id'];
    }
    const topology = this._safe(() => network.getTopologyVersions?.(), null) ?? {};
    const key = `${toFinite(topology.node, 0)}|${toFinite(topology.edge, 0)}`;
    if (this._fallbackNameCache.key === key) {
      return this._fallbackNameCache.values;
    }
    const names = this._safe(() => network.getNodeAttributeNames?.(), []) ?? [];
    const available = new Set(Array.isArray(names) ? names : []);
    const lowered = new Map();
    for (const name of available) {
      lowered.set(String(name).toLowerCase(), name);
    }
    const resolved = [];
    const fallback = this._config.fallbackSources?.length ? this._config.fallbackSources : DEFAULT_CONFIG.fallbackSources;
    for (let i = 0; i < fallback.length; i += 1) {
      const entry = fallback[i];
      if (entry === '$id') {
        resolved.push('$id');
        continue;
      }
      if (available.has(entry)) {
        resolved.push(entry);
        continue;
      }
      const lower = lowered.get(String(entry).toLowerCase());
      if (lower) resolved.push(lower);
    }
    if (!resolved.includes('$id')) resolved.push('$id');
    this._fallbackNameCache = { key, values: resolved };
    return resolved;
  }

  _buildLabelSourceAccessors(network) {
    const configured = this._config.source;
    if (typeof configured === 'function') {
      return [{ key: '$fn', type: 'function', get: configured }];
    }
    const names = this._resolveCandidateSourceNames(network);
    const accessors = [];
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      if (name === '$id') {
        accessors.push({ key: '$id', type: 'id', get: (id) => String(id) });
        continue;
      }
      const info = this._safe(() => network.getNodeAttributeInfo?.(name), null);
      if (!info) continue;
      if (info.type === AttributeType.String) {
        accessors.push({
          key: name,
          type: 'string',
          get: (id) => {
            const value = this._safe(() => network.getNodeStringAttribute?.(name, id), null);
            return value == null || value === '' ? null : String(value);
          },
        });
        continue;
      }
      if (!INTEGER_LIKE_TYPES.has(info.type)) continue;
      const buffer = this._safe(() => network.getNodeAttributeBuffer?.(name), null);
      const view = buffer?.view ?? null;
      if (!view) continue;
      let categoryMap = null;
      if (info.type === AttributeType.Category) {
        const dict = this._safe(() => network.getNodeAttributeCategoryDictionary?.(name), null);
        if (dict?.entries?.length) {
          categoryMap = new Map(dict.entries.map((entry) => [Number(entry.id), String(entry.label)]));
        }
      }
      accessors.push({
        key: name,
        type: 'integer',
        get: (id) => {
          const raw = view[id];
          if (raw == null) return null;
          if (typeof raw === 'bigint') {
            if (raw === 0n) return null;
            return String(raw);
          }
          if (!Number.isFinite(raw)) return null;
          if (categoryMap) {
            const mapped = categoryMap.get(Number(raw));
            if (mapped != null) return mapped;
          }
          return String(Math.trunc(raw));
        },
      });
    }
    if (!accessors.length) {
      accessors.push({ key: '$id', type: 'id', get: (id) => String(id) });
    }
    return accessors;
  }

  _resolveLabelText(accessors, id) {
    for (let i = 0; i < accessors.length; i += 1) {
      const accessor = accessors[i];
      let value = null;
      try {
        value = accessor.get(id, this.helios?.network ?? null);
      } catch {
        value = null;
      }
      if (value == null) continue;
      const text = String(value).trim();
      if (!text) continue;
      return text;
    }
    return null;
  }

  _computeLabelScreenY(centerY, radiusPx) {
    const center = Number(centerY);
    const radius = Number(radiusPx);
    const factor = Number(this._config.offsetRadiusFactor);
    const offsetPx = Number(this._config.offsetPx);
    const safeCenter = Number.isFinite(center) ? center : 0;
    const safeRadius = Number.isFinite(radius) ? radius : 0;
    const safeFactor = Number.isFinite(factor) ? factor : 1;
    const safeOffsetPx = Number.isFinite(offsetPx) ? offsetPx : 0;
    // +factor moves label above node, -factor moves below, 0 stays centered.
    return safeCenter - (safeRadius * safeFactor) - safeOffsetPx;
  }

  _formatLabelText(value, fontSizePx) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const maxChars = clampInt(this._config.maxChars, 0, 512);
    const maxRows = clampInt(this._config.maxRows, 1, 8);
    const lines = this._wrapLabelLines(text, { maxChars, maxRows });
    if (!lines.length) return null;
    const maxLineChars = lines.reduce((acc, line) => Math.max(acc, String(line ?? '').length), 0);
    const lineHeightPx = Math.max(8, Number(fontSizePx) * 1.25);
    return {
      text: lines.join('\n'),
      lines,
      widthPx: estimateTextWidthPx('W'.repeat(maxLineChars || 1), Number(fontSizePx)),
      heightPx: Math.max(8, lineHeightPx * lines.length),
    };
  }

  _wrapLabelLines(text, options = {}) {
    const raw = String(text ?? '').trim();
    if (!raw) return [];
    const maxChars = clampInt(options.maxChars, 0, 512);
    const maxRows = clampInt(options.maxRows, 1, 8);
    if (maxRows <= 1) {
      return [this._truncateLabelLine(raw, maxChars)];
    }
    if (maxChars <= 0) {
      return [raw];
    }

    const tokens = raw.split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];

    const lines = [];
    let index = 0;
    let current = '';
    let overflowed = false;

    const pushCurrent = () => {
      if (!current) return;
      lines.push(current);
      current = '';
    };

    while (index < tokens.length && lines.length < maxRows) {
      let token = tokens[index];
      if (!token) {
        index += 1;
        continue;
      }

      if (!current) {
        if (token.length <= maxChars) {
          current = token;
          index += 1;
          continue;
        }
        if (lines.length >= maxRows - 1) {
          lines.push(this._appendEllipsis(token.slice(0, maxChars), maxChars));
          overflowed = true;
          current = '';
          index = tokens.length;
          break;
        }
        lines.push(token.slice(0, maxChars));
        token = token.slice(maxChars);
        tokens[index] = token;
        continue;
      }

      const next = `${current} ${token}`;
      if (next.length <= maxChars) {
        current = next;
        index += 1;
      } else {
        pushCurrent();
      }
    }

    if (current && lines.length < maxRows) {
      pushCurrent();
    }

    if (index < tokens.length) {
      overflowed = true;
    }

    if (overflowed && lines.length) {
      lines[lines.length - 1] = this._appendEllipsis(lines[lines.length - 1], maxChars);
    }
    return lines.slice(0, maxRows);
  }

  _truncateLabelLine(text, maxChars) {
    const raw = String(text ?? '');
    if (maxChars <= 0 || raw.length <= maxChars) return raw;
    return this._appendEllipsis(raw.slice(0, maxChars), maxChars);
  }

  _appendEllipsis(text, maxChars) {
    const raw = String(text ?? '');
    if (!raw) return '...';
    if (!Number.isFinite(maxChars) || maxChars <= 0) return `${raw}...`;
    if (maxChars <= 3) return '.'.repeat(maxChars);
    if (raw.length >= maxChars) return `${raw.slice(0, maxChars - 3)}...`;
    return `${raw}...`;
  }

  _collides(occupied, x, y, width, height, cellSize) {
    const pad = this._config.collisionPaddingPx;
    const minX = Math.floor((x - width * 0.5 - pad) / cellSize);
    const maxX = Math.floor((x + width * 0.5 + pad) / cellSize);
    const minY = Math.floor((y - height * 0.5 - pad) / cellSize);
    const maxY = Math.floor((y + height * 0.5 + pad) / cellSize);
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        if (occupied.has(`${cx},${cy}`)) return true;
      }
    }
    return false;
  }

  _occupy(occupied, x, y, width, height, cellSize) {
    const pad = this._config.collisionPaddingPx;
    const minX = Math.floor((x - width * 0.5 - pad) / cellSize);
    const maxX = Math.floor((x + width * 0.5 + pad) / cellSize);
    const minY = Math.floor((y - height * 0.5 - pad) / cellSize);
    const maxY = Math.floor((y + height * 0.5 + pad) / cellSize);
    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        occupied.add(`${cx},${cy}`);
      }
    }
  }

  _renderVisible() {
    if (!this.group) return;
    this._applyGroupStyles();
    const entries = this._visibleEntries;
    while (this._pool.length < entries.length) {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('class', 'helios-label');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      this.group.appendChild(text);
      this._pool.push(text);
    }
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const node = this._pool[i];
      node.style.display = '';
      node.dataset.nodeId = String(entry.id);
      node.setAttribute('x', `${entry.x}`);
      node.setAttribute('y', `${entry.y}`);
      this._syncTextContent(node, entry);
    }
    for (let i = entries.length; i < this._pool.length; i += 1) {
      this._pool[i].style.display = 'none';
      this._pool[i].dataset.nodeId = '';
    }
  }

  _hideAll() {
    this._visibleEntries.length = 0;
    this._lastVisibleSet.clear();
    for (let i = 0; i < this._pool.length; i += 1) {
      this._pool[i].style.display = 'none';
      this._pool[i].dataset.nodeId = '';
    }
  }

  _syncTextContent(node, entry) {
    const lines = Array.isArray(entry?.lines) && entry.lines.length
      ? entry.lines.map((line) => String(line ?? ''))
      : [String(entry?.text ?? '')];
    if (lines.length <= 1) {
      if (node.childElementCount > 0) node.replaceChildren();
      const nextText = lines[0] ?? '';
      if (node.textContent !== nextText) node.textContent = nextText;
      node.dataset.multiline = '0';
      node.dataset.multilineSig = '';
      return;
    }

    const signature = lines.join('\n');
    const x = node.getAttribute('x') ?? '0';
    const lineHeightEm = 1.2;
    const firstDy = -((lines.length - 1) * lineHeightEm) / 2;
    if (
      node.dataset.multiline === '1'
      && node.dataset.multilineSig === signature
      && node.childElementCount === lines.length
    ) {
      let idx = 0;
      for (const child of node.children) {
        child.setAttribute('x', x);
        child.setAttribute('dy', `${idx === 0 ? firstDy : lineHeightEm}em`);
        idx += 1;
      }
      return;
    }

    node.textContent = '';
    for (let i = 0; i < lines.length; i += 1) {
      const tspan = document.createElementNS(SVG_NS, 'tspan');
      tspan.setAttribute('x', x);
      tspan.setAttribute('dy', `${i === 0 ? firstDy : lineHeightEm}em`);
      tspan.textContent = lines[i];
      node.appendChild(tspan);
    }
    node.dataset.multiline = '1';
    node.dataset.multilineSig = signature;
  }

  _applyGroupStyles() {
    if (!this.group) return;
    this.group.setAttribute('font-family', this._config.fontFamily);
    this.group.setAttribute('font-size', `${12 * this._config.fontSizeScale}`);
    this.group.setAttribute('fill', this._config.fill);
    this.group.setAttribute('stroke', this._config.outlineColor);
    this.group.setAttribute('stroke-width', `${this._config.outlineWidth}`);
    this.group.setAttribute('stroke-linejoin', 'round');
    this.group.setAttribute('stroke-linecap', 'round');
    this.group.setAttribute('paint-order', this._config.outlineWidth > 0 ? 'stroke fill' : 'fill');
  }

  _safe(fn, fallback = null) {
    try {
      const value = fn();
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  }
}

export default SvgLabelController;
