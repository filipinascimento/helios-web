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
  selectionMode: 'ranked',
  pinnedNodes: [],
  selectedOnlySpaceAware: true,
  hoveredNodeEnabled: false,
  hoveredNodeSource: null,
  fallbackSources: ['Label', 'Name', '$id'],
  maxVisible: 120,
  minScreenRadiusPx: 0,
  maxUpdateFps: 20,
  keepBoost: 1.08,
  selectedBoost: 2.0,
  hoveredBoost: 3.0,
  fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
  illustratorCompatible: false,
  fontSizeScale: 1,
  fill: '#f4f7ff',
  outlineColor: '#001426cc',
  outlineWidth: 2,
  offsetRadiusFactor: 1,
  offsetPx: 4,
  maxChars: 45,
  maxRows: 2,
  collisionPaddingPx: 2,
  collisionCellPx: 18,
  delegateSnapshotMaxFps: 4,
});

const LARGE_GRAPH_LABEL_RANK_NODE_THRESHOLD = 100_000;
const LARGE_GRAPH_LABEL_INTERACTION_FULL_FPS = 2;
const LARGE_GRAPH_LABEL_VIEW_SETTLE_MS = 160;
const LARGE_GRAPH_LABEL_PROGRESSIVE_CHUNK_SIZE = 20_000;

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

function normalizePinnedNodes(value) {
  return Array.from(new Set(Array.from(value ?? [], (entry) => Number(entry))
    .filter((entry) => Number.isInteger(entry) && entry >= 0)));
}

function colorStringToSvgPaint(value, fallback = '#000000') {
  const raw = String(value ?? '').trim();
  if (!raw) return { color: fallback, opacity: null };
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    if (hex.length === 8) {
      const color = `#${hex.slice(0, 6)}`;
      const alpha = Number.parseInt(hex.slice(6, 8), 16) / 255;
      return { color, opacity: Number.isFinite(alpha) && alpha < 1 ? alpha : null };
    }
    if (hex.length === 4) {
      const color = `#${hex.slice(0, 3)}`;
      const alpha = Number.parseInt(`${hex[3]}${hex[3]}`, 16) / 255;
      return { color, opacity: Number.isFinite(alpha) && alpha < 1 ? alpha : null };
    }
    return { color: raw, opacity: null };
  }
  const rgba = /^rgba?\(([^)]+)\)$/iu.exec(raw);
  if (rgba) {
    const parts = rgba[1].split(',').map((part) => part.trim());
    if (parts.length >= 3) {
      const r = clampInt(parts[0], 0, 255);
      const g = clampInt(parts[1], 0, 255);
      const b = clampInt(parts[2], 0, 255);
      const a = parts.length >= 4 ? clamp01(parts[3]) : 1;
      return {
        color: `rgb(${r}, ${g}, ${b})`,
        opacity: a < 1 ? a : null,
      };
    }
  }
  return { color: raw, opacity: null };
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

function projectPointInto(out, viewProjection, width, height, x, y, z) {
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
  out.ndcX = ndcX;
  out.ndcY = ndcY;
  out.ndcZ = ndcZ;
  out.w = cw;
  out.screenX = screenX;
  out.screenY = screenY;
  return out;
}

function readPositionInto(positions, id, out) {
  if (!positions) return null;
  if (typeof positions.getInto === 'function') return positions.getInto(id, out);
  const point = positions.get?.(id);
  if (!point) return null;
  out[0] = point[0];
  out[1] = point[1];
  out[2] = point[2];
  return out;
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

function normalizeSelectionMode(value, fallback = DEFAULT_CONFIG.selectionMode) {
  const raw = String(value ?? fallback).trim().toLowerCase();
  if (raw === 'hover' || raw === 'hovered' || raw === 'hovered-node' || raw === 'hovered_node') {
    return 'hovered-node';
  }
  if (raw === 'selected' || raw === 'selected-only' || raw === 'selected_only') {
    return 'selected-only';
  }
  return 'ranked';
}

export class SvgLabelController {
  constructor(helios, options = {}) {
    this.helios = helios ?? null;
    this._config = { ...DEFAULT_CONFIG };
    this._needsFullReselect = true;
    this._viewSignature = '';
    this._dataSignature = '';
    this._lastFullUpdateAt = -Infinity;
    this._viewSettleTimer = null;
    this._lastRankedCandidateCount = 0;
    this._progressiveRankJob = null;
    this._progressiveRankTimer = null;
    this._progressiveRankSerial = 0;
    this._lastVisibleSet = new Set();
    this._visibleEntries = [];
    this._pool = [];
    this._scratchCollision = new Set();
    this._lastReason = 'init';
    this._delegateSnapshot = null;
    this._delegateSnapshotAt = -Infinity;
    this._delegateSnapshotPending = false;
    this._sparsePositionSnapshot = null;
    this._sparsePositionSignature = '';
    this._sparsePositionAt = -Infinity;
    this._sparsePositionPending = false;
    this._sparsePositionSnapshots = new Map();
    this._sparsePositionPendingSignatures = new Set();
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
    this._clearViewSettleTimer();
    this._cancelProgressiveRankJob();
    this._visibleEntries.length = 0;
    this._lastVisibleSet.clear();
    this._pool.length = 0;
    this._delegateSnapshot = null;
    this._sparsePositionSnapshot = null;
    this._sparsePositionSignature = '';
    this._sparsePositionPending = false;
    this._sparsePositionSnapshots?.clear?.();
    this._sparsePositionPendingSignatures?.clear?.();
    if (this.group) {
      this.group.remove();
    }
    this.group = null;
    this.svg = null;
  }

  requestFullReselect(reason = 'manual') {
    this._cancelProgressiveRankJob();
    this._needsFullReselect = true;
    this._lastReason = reason;
  }

  getConfig() {
    return {
      ...this._config,
      pinnedNodes: [...this._config.pinnedNodes],
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
    if (Object.prototype.hasOwnProperty.call(options, 'selectionMode')) {
      next.selectionMode = normalizeSelectionMode(options.selectionMode, this._config.selectionMode);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'selectedOnlySpaceAware')) {
      next.selectedOnlySpaceAware = options.selectedOnlySpaceAware === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'pinnedNodes')) {
      next.pinnedNodes = normalizePinnedNodes(options.pinnedNodes);
    }
    if (Object.prototype.hasOwnProperty.call(options, 'hoveredNodeEnabled')) {
      next.hoveredNodeEnabled = options.hoveredNodeEnabled === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'hoveredNodeSource')) {
      const value = options.hoveredNodeSource;
      next.hoveredNodeSource = typeof value === 'function'
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
    if (Object.prototype.hasOwnProperty.call(options, 'illustratorCompatible')) {
      next.illustratorCompatible = options.illustratorCompatible === true;
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
    if (!this._usesBaseLabels() && !this._usesHoveredNodeOverlay()) {
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
    if (this._progressiveRankJob && (viewChanged || dataChanged || this._needsFullReselect)) {
      this._cancelProgressiveRankJob();
    }
    const network = this._getRenderNetwork();
    const useAdaptiveViewUpdates = this._shouldUseAdaptiveViewUpdates(network, viewChanged, dataChanged);
    const fullIntervalMs = this._resolveFullUpdateIntervalMs(useAdaptiveViewUpdates);
    const canRunPeriodicFull = (now - this._lastFullUpdateAt) >= fullIntervalMs;
    const runFull = this._needsFullReselect || dataChanged || (viewChanged && canRunPeriodicFull);

    let changed = false;
    if (runFull) {
      this._clearViewSettleTimer();
      changed = this._runFullUpdate(uniforms, now) || changed;
      this._lastFullUpdateAt = now;
      this._needsFullReselect = false;
    } else if (viewChanged) {
      changed = this._reprojectVisible(uniforms, now) || changed;
      if (useAdaptiveViewUpdates) this._scheduleViewSettleFullReselect();
    }

    this._viewSignature = viewSignature;
    this._dataSignature = dataSignature;
    return changed;
  }

  _resolveFullUpdateIntervalMs(useAdaptiveViewUpdates = false) {
    const maxUpdateFps = Math.max(1, this._config.maxUpdateFps);
    const fps = useAdaptiveViewUpdates
      ? Math.min(maxUpdateFps, LARGE_GRAPH_LABEL_INTERACTION_FULL_FPS)
      : maxUpdateFps;
    return 1000 / Math.max(1, fps);
  }

  _shouldUseAdaptiveViewUpdates(network, viewChanged, dataChanged) {
    if (!viewChanged || dataChanged || this._needsFullReselect) return false;
    if (!this._visibleEntries.length) return false;
    if (!this._usesBaseLabels()) return false;
    return this._isLargeGraphLabelRanking(network);
  }

  _isLargeGraphLabelRanking(network) {
    if (this._usesSelectedOnlySelectionMode() && this._hasSparseSelectedNodeSource()) return false;
    const nodeCount = toFinite(network?.nodeCount, 0);
    const rankedCount = toFinite(this._lastRankedCandidateCount, 0);
    return Math.max(nodeCount, rankedCount) >= LARGE_GRAPH_LABEL_RANK_NODE_THRESHOLD;
  }

  _scheduleViewSettleFullReselect() {
    if (!this.helios?.scheduler?.requestRender) return;
    this._clearViewSettleTimer();
    this._viewSettleTimer = setTimeout(() => {
      this._viewSettleTimer = null;
      if (!this.group || !this.helios) return;
      this.requestFullReselect('view-settle');
      this.helios?.scheduler?.requestRender?.();
    }, LARGE_GRAPH_LABEL_VIEW_SETTLE_MS);
    this._viewSettleTimer?.unref?.();
  }

  _clearViewSettleTimer() {
    if (this._viewSettleTimer != null) {
      clearTimeout(this._viewSettleTimer);
      this._viewSettleTimer = null;
    }
  }

  _cancelProgressiveRankJob() {
    if (this._progressiveRankTimer != null) {
      clearTimeout(this._progressiveRankTimer);
      this._progressiveRankTimer = null;
    }
    if (this._progressiveRankJob) {
      this._progressiveRankJob.cancelled = true;
      this._progressiveRankJob = null;
    }
  }

  createSnapshot(options = {}) {
    if (!this.helios || typeof document === 'undefined') return null;
    const renderer = this.helios.renderer ?? null;
    const camera = renderer?.camera ?? null;
    const uniforms = options.uniforms ?? camera?.getUniforms?.() ?? null;
    if (!renderer || !camera || !uniforms?.viewProjection || !uniforms?.viewport) return null;

    const previousConfig = this._config;
    if (options.config && typeof options.config === 'object') {
      this._config = { ...this._config, ...options.config };
    }

    try {
      if (!this._usesBaseLabels() && !this._usesHoveredNodeOverlay()) return null;
      const now = Number.isFinite(options.timestamp) ? Number(options.timestamp) : performance.now();
      const network = this._getRenderNetwork();
      if (!network) return null;
      const run = () => this._runFullUpdateUnsafe(uniforms, now, { render: false, progressive: false });
      if (typeof network.withBufferAccess === 'function') {
        try {
          network.withBufferAccess(run, { nodeIndices: this._needsNodeIndicesForFullUpdate() });
        } catch {
          run();
        }
      } else {
        run();
      }
      if (!this._visibleEntries.length) return null;
      return this._buildSnapshotGroup(this._visibleEntries);
    } finally {
      this._config = previousConfig;
    }
  }

  _currentHoveredNode() {
    const hover = this.helios?._picking?.hover ?? null;
    if (hover?.kind === 'node' && Number.isInteger(hover.index) && hover.index >= 0) {
      return hover.index;
    }
    return -1;
  }

  _getRenderNetwork() {
    return this.helios?._getRenderNetwork?.() ?? this.helios?.network ?? null;
  }

  _composeDataSignature() {
    const network = this._getRenderNetwork();
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
      this._config.pinnedNodes.join(','),
    ].join('|');
  }

  _usesHoveredNodeSelectionMode() {
    return this._config.selectionMode === 'hovered-node' && this._usesHoveredNodeOverlay() !== true;
  }

  _usesBaseLabels() {
    if (this._config.enabled !== true) return false;
    if (this._usesHoveredNodeSelectionMode()) return true;
    return this._config.maxVisible > 0;
  }

  _usesSelectedOnlySelectionMode() {
    return this._config.selectionMode === 'selected-only';
  }

  _getSelectionSelectedNodes() {
    const selection = this.helios?.behaviors?.get?.('selection') ?? this.helios?.behavior?.selection ?? null;
    const selectedNodes = selection?.state?.selectedNodes ?? null;
    if (!selectedNodes || typeof selectedNodes[Symbol.iterator] !== 'function') return null;
    return selectedNodes;
  }

  _hasSparseSelectedNodeSource() {
    return this._getSelectionSelectedNodes() != null;
  }

  _filterSparseNodeIdsForRenderNetwork(network, ids) {
    if (!ids.length) return ids;
    if (typeof network?.hasNodeIndices === 'function') {
      const visible = this._safe(() => network.hasNodeIndices(ids), null);
      if (Array.isArray(visible) || ArrayBuffer.isView(visible)) {
        return ids.filter((id, index) => visible[index] === true);
      }
    }
    if (typeof network?.hasNodeIndex === 'function') {
      return ids.filter((id) => this._safe(() => network.hasNodeIndex(id), false) === true);
    }
    return ids;
  }

  _collectSparseSelectedNodeIds(network, pinnedNodes) {
    const selectedNodes = this._getSelectionSelectedNodes();
    if (!selectedNodes) return null;
    const ids = [];
    const seen = new Set();
    const selectedSet = new Set();
    const add = (raw, selected = false) => {
      const id = Number(raw);
      if (!Number.isInteger(id) || id < 0) return;
      if (selected) selectedSet.add(id);
      if (seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };
    for (const id of selectedNodes) add(id, true);
    for (const id of pinnedNodes) add(id, false);
    return {
      ids: this._filterSparseNodeIdsForRenderNetwork(network, ids),
      selectedSet,
    };
  }

  _usesHoveredNodeOverlay() {
    return this._config.hoveredNodeEnabled === true;
  }

  _resolveLabelSourceVersion() {
    const network = this._getRenderNetwork();
    if (!network) return 0;
    let sum = this._sumLabelSourceVersion(network, this._config.source);
    if (this._usesHoveredNodeOverlay()) {
      sum += this._sumLabelSourceVersion(network, this._config.hoveredNodeSource);
    }
    return sum;
  }

  _sumLabelSourceVersion(network, configuredSource) {
    const resolved = this._resolveCandidateSourceNames(network, configuredSource);
    let sum = 0;
    for (let i = 0; i < resolved.length; i += 1) {
      const name = resolved[i];
      if (!name || name === '$id') continue;
      sum += toFinite(this._safe(() => network.getNodeAttributeVersion?.(name), 0), 0);
    }
    return sum;
  }

  _runFullUpdate(uniforms, now) {
    const network = this._getRenderNetwork();
    const viewport = uniforms?.viewport ?? null;
    if (!network || !viewport) {
      this._hideAll();
      return false;
    }
    const run = () => this._runFullUpdateUnsafe(uniforms, now);
    if (typeof network.withBufferAccess === 'function') {
      try {
        return Boolean(network.withBufferAccess(run, { nodeIndices: this._needsNodeIndicesForFullUpdate() }));
      } catch {
        return Boolean(run());
      }
    }
    return Boolean(run());
  }

  _needsNodeIndicesForFullUpdate() {
    if (!this._usesBaseLabels() || this._usesHoveredNodeSelectionMode()) return false;
    return !(this._usesSelectedOnlySelectionMode() && this._hasSparseSelectedNodeSource());
  }

  _runHoveredNodeUpdate(uniforms, now, options = {}) {
    const network = this._getRenderNetwork();
    const viewport = uniforms?.viewport ?? null;
    if (!network || !viewport) {
      this._hideAll();
      return false;
    }
    const run = () => this._runHoveredNodeUpdateUnsafe(uniforms, now, options);
    if (typeof network.withBufferAccess === 'function') {
      try {
        return Boolean(network.withBufferAccess(run));
      } catch {
        return Boolean(run());
      }
    }
    return Boolean(run());
  }

  _runHoveredNodeUpdateUnsafe(uniforms, now, options = {}) {
    const network = this._getRenderNetwork();
    if (!network) return false;
    const entries = this._collectHoveredNodeEntriesUnsafe(network, uniforms, now);
    if (!entries.length) {
      this._hideAll();
      return false;
    }
    this._visibleEntries = entries;
    this._lastVisibleSet = new Set(entries.map((entry) => entry.id));
    if (options.render !== false) this._renderVisible();
    return true;
  }

  _collectHoveredNodeEntriesUnsafe(network, uniforms, now, options = {}) {
    const entry = this._resolveHoveredNodeEntry(network, uniforms, now, options);
    return entry ? [entry] : [];
  }

  _resolveHoveredNodeEntry(network, uniforms, now, options = {}) {
    const hoveredNode = this._hoveredNode;
    if (!Number.isInteger(hoveredNode) || hoveredNode < 0) return null;

    const context = this.helios?._buildPositionDelegateContext?.() ?? {};
    const positions = this._resolvePositionAccessor(context, now, [hoveredNode], { allowFullSnapshot: false });
    const scratchPoint = [0, 0, 0];
    const point = readPositionInto(positions, hoveredNode, scratchPoint);
    if (!point) return null;
    const x = point[0];
    const y = point[1];
    const z = point[2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;

    const viewProjection = uniforms.viewProjection;
    const width = Math.max(1, Math.floor(uniforms.viewport?.width ?? this.helios?.size?.width ?? 1));
    const height = Math.max(1, Math.floor(uniforms.viewport?.height ?? this.helios?.size?.height ?? 1));
    const projectionType = uniforms.projectionType ?? 'perspective';
    const right = uniforms.right ?? [1, 0, 0];
    const cameraMode = uniforms.mode ?? '2d';
    const zoom = toFinite(this.helios?.renderer?.camera?.zoom, 1);
    const semanticZoomExponent = toFinite(this.helios?.semanticZoomExponent?.(), 0);
    const semanticScale = (cameraMode === '2d' && semanticZoomExponent > 0)
      ? (1 / Math.pow(Math.max(zoom, 1e-3), semanticZoomExponent))
      : 1;

    const center = projectPointInto({}, viewProjection, width, height, x, y, z);
    if (!center) return null;
    if (projectionType !== 'orthographic' && center.w <= 1e-6) return null;
    if (center.ndcZ < -1.05 || center.ndcZ > 1.05) return null;
    if (center.ndcX < -1.2 || center.ndcX > 1.2 || center.ndcY < -1.2 || center.ndcY > 1.2) return null;

    const nodeSizes = this._safe(() => network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE)?.view, null);
    const nodeOutlines = this._safe(() => network.getNodeAttributeBuffer(NODE_OUTLINE_WIDTH_ATTRIBUTE)?.view, null);
    const nodeSizeBase = toFinite(this.helios?.nodeSizeBase?.(), 0);
    const nodeSizeScale = toFinite(this.helios?.nodeSizeScale?.(), 1);
    const nodeOutlineBase = toFinite(this.helios?.nodeOutlineWidthBase?.(), 0);
    const nodeOutlineScale = toFinite(this.helios?.nodeOutlineWidthScale?.(), 0);
    const rawSize = toFinite(nodeSizes?.[hoveredNode], DEFAULT_NODE_SIZE);
    const rawOutline = toFinite(nodeOutlines?.[hoveredNode], DEFAULT_NODE_OUTLINE_WIDTH);
    const outlineWidth = Math.max(0, nodeOutlineBase + nodeOutlineScale * rawOutline);
    const fullSize = Math.max(0, (nodeSizeBase + nodeSizeScale * rawSize) + outlineWidth) * semanticScale;
    const worldRadius = Math.max(0, fullSize * 0.5);

    const edgePoint = projectPointInto(
      {},
      viewProjection,
      width,
      height,
      x + right[0] * worldRadius,
      y + right[1] * worldRadius,
      z + right[2] * worldRadius,
    );
    if (!edgePoint) return null;
    const radiusPx = Math.max(0, Math.hypot(edgePoint.screenX - center.screenX, edgePoint.screenY - center.screenY));
    const minRadiusPx = Math.max(0, this._config.minScreenRadiusPx);
    if (radiusPx < minRadiusPx) return null;

    const sourceAccessors = this._buildLabelSourceAccessors(network, options.source ?? this._config.source);
    const text = this._resolveLabelText(sourceAccessors, hoveredNode);
    if (!text) return null;
    const fontSizePx = 12 * this._config.fontSizeScale;
    const formatted = this._formatLabelText(text, fontSizePx);
    if (!formatted) return null;

    const labelX = center.screenX;
    const labelY = this._computeLabelScreenY(center.screenY, radiusPx);
    if (
      labelX + formatted.widthPx * 0.5 < 0
      || labelX - formatted.widthPx * 0.5 > width
      || labelY + formatted.heightPx * 0.5 < 0
      || labelY - formatted.heightPx * 0.5 > height
    ) {
      return null;
    }

    return {
      id: hoveredNode,
      text: formatted.text,
      lines: formatted.lines,
      x: labelX,
      y: labelY,
      worldRadius,
      score: radiusPx * radiusPx,
    };
  }

  _runFullUpdateUnsafe(uniforms, now, options = {}) {
    const network = this._getRenderNetwork();
    if (!network) return false;
    let nextVisible = [];
    if (this._usesBaseLabels()) {
      if (this._usesHoveredNodeSelectionMode()) {
        nextVisible = this._collectHoveredNodeEntriesUnsafe(network, uniforms, now, {
          source: this._config.source,
        });
      } else {
        const nodeIndices = this._needsNodeIndicesForFullUpdate()
          ? this._safe(() => network.nodeIndices, null)
          : null;
        if (nodeIndices?.length || (this._usesSelectedOnlySelectionMode() && this._hasSparseSelectedNodeSource())) {
          if (options.progressive !== false && this._maybeStartProgressiveRankJob(network, uniforms, now, nodeIndices)) {
            return false;
          }
          nextVisible = this._collectRankedEntriesUnsafe(network, uniforms, now, nodeIndices);
        }
      }
    }
    if (this._usesHoveredNodeOverlay()) {
      nextVisible = this._mergeVisibleEntries(
        nextVisible,
        this._collectHoveredNodeEntriesUnsafe(network, uniforms, now, {
          source: this._config.hoveredNodeSource,
        }),
      );
    }
    if (!nextVisible.length) {
      if (this._visibleEntries.length && this._hasPendingPositionReadback()) {
        if (options.render !== false) this._renderVisible();
        return false;
      }
      this._hideAll();
      return false;
    }
    this._visibleEntries = nextVisible;
    this._lastVisibleSet = new Set(nextVisible.map((entry) => entry.id));
    if (options.render !== false) this._renderVisible();
    return true;
  }

  _hasPendingPositionReadback() {
    return this._delegateSnapshotPending === true || this._sparsePositionPending === true;
  }

  _maybeStartProgressiveRankJob(network, uniforms, now, nodeIndices) {
    if (!this._shouldUseProgressiveRankJob(network, nodeIndices)) return false;
    const count = Number(nodeIndices?.length ?? 0);
    const viewProjection = uniforms?.viewProjection ?? null;
    if (!viewProjection || count <= 0) return false;

    this._cancelProgressiveRankJob();
    const width = Math.max(1, Math.floor(uniforms.viewport?.width ?? this.helios?.size?.width ?? 1));
    const height = Math.max(1, Math.floor(uniforms.viewport?.height ?? this.helios?.size?.height ?? 1));
    const cameraMode = uniforms.mode ?? '2d';
    const zoom = toFinite(this.helios?.renderer?.camera?.zoom, 1);
    const semanticZoomExponent = toFinite(this.helios?.semanticZoomExponent?.(), 0);
    const serial = this._progressiveRankSerial + 1;
    this._progressiveRankSerial = serial;
    this._lastRankedCandidateCount = count;
    this._progressiveRankJob = {
      serial,
      cancelled: false,
      cursor: 0,
      count,
      viewSignature: composeViewSignature(uniforms),
      dataSignature: this._composeDataSignature(),
      viewProjection: Float32Array.from(viewProjection),
      width,
      height,
      cameraMode,
      projectionType: uniforms.projectionType ?? 'perspective',
      right: Array.from(uniforms.right ?? [1, 0, 0]),
      semanticScale: (cameraMode === '2d' && semanticZoomExponent > 0)
        ? (1 / Math.pow(Math.max(zoom, 1e-3), semanticZoomExponent))
        : 1,
      nodeSizeBase: toFinite(this.helios?.nodeSizeBase?.(), 0),
      nodeSizeScale: toFinite(this.helios?.nodeSizeScale?.(), 1),
      nodeOutlineBase: toFinite(this.helios?.nodeOutlineWidthBase?.(), 0),
      nodeOutlineScale: toFinite(this.helios?.nodeOutlineWidthScale?.(), 0),
      selectedMask: toFinite(this.helios?.constructor?.STATES?.SELECTED, 1 << 1) >>> 0,
      hoveredNode: this._hoveredNode,
      pinnedNodes: new Set(this._config.pinnedNodes),
      prevVisible: new Set(this._lastVisibleSet),
      selectedBoost: this._config.selectedBoost,
      hoveredBoost: this._config.hoveredBoost,
      keepBoost: this._config.keepBoost,
      minRadiusPx: Math.max(0, this._config.minScreenRadiusPx),
      maxVisible: this._config.maxVisible,
      heapCap: Math.max(this._config.maxVisible * 6, this._config.maxVisible + 24),
      heap: [],
      mustInclude: [],
      source: this._config.source,
      fontSizePx: 12 * this._config.fontSizeScale,
      collisionCellPx: Math.max(4, this._config.collisionCellPx),
      startedAt: now,
    };
    this._scheduleProgressiveRankStep(this._progressiveRankJob);
    return true;
  }

  _shouldUseProgressiveRankJob(network, nodeIndices) {
    if (!network || !nodeIndices?.length) return false;
    if (!this._usesBaseLabels() || this._usesHoveredNodeSelectionMode()) return false;
    if (this._usesSelectedOnlySelectionMode()) return false;
    const source = this.helios?.positions?.() ?? { source: 'network', delegate: null };
    if (source.source === 'delegate') return false;
    return nodeIndices.length >= LARGE_GRAPH_LABEL_RANK_NODE_THRESHOLD;
  }

  _scheduleProgressiveRankStep(job) {
    if (!job || job.cancelled || this._progressiveRankJob !== job) return;
    this._progressiveRankTimer = setTimeout(() => {
      this._progressiveRankTimer = null;
      this._runProgressiveRankStep(job);
    }, 0);
    this._progressiveRankTimer?.unref?.();
  }

  _runProgressiveRankStep(job) {
    if (!this._isProgressiveRankJobCurrent(job)) return;
    const network = this._getRenderNetwork();
    if (!network) {
      this._cancelProgressiveRankJob();
      return;
    }
    const currentDataSignature = this._composeDataSignature();
    const currentUniforms = this.helios?.renderer?.camera?.getUniforms?.() ?? null;
    const currentViewSignature = currentUniforms ? composeViewSignature(currentUniforms) : job.viewSignature;
    if (currentDataSignature !== job.dataSignature || currentViewSignature !== job.viewSignature) {
      this._cancelProgressiveRankJob();
      this.requestFullReselect('progressive-rank-stale');
      this.helios?.scheduler?.requestRender?.();
      return;
    }

    const run = () => {
      const nodeIndices = this._safe(() => network.nodeIndices, null);
      if (!nodeIndices?.length || nodeIndices.length !== job.count) {
        job.cancelled = true;
        return;
      }
      const context = this.helios?._buildPositionDelegateContext?.() ?? {};
      const positions = this._resolvePositionAccessor(context, performance.now(), null, { allowFullSnapshot: true });
      if (!positions) {
        job.cancelled = true;
        return;
      }
      const nodeSizes = this._safe(() => network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE)?.view, null);
      const nodeOutlines = this._safe(() => network.getNodeAttributeBuffer(NODE_OUTLINE_WIDTH_ATTRIBUTE)?.view, null);
      const nodeStates = this._safe(() => network.getNodeAttributeBuffer(NODE_STATE_ATTRIBUTE)?.view, null);
      const start = job.cursor;
      const end = Math.min(job.count, start + LARGE_GRAPH_LABEL_PROGRESSIVE_CHUNK_SIZE);
      this._processProgressiveRankRange(job, nodeIndices, positions, nodeSizes, nodeOutlines, nodeStates, start, end);
      job.cursor = end;
    };

    if (typeof network.withBufferAccess === 'function') {
      try {
        network.withBufferAccess(run, { nodeIndices: true });
      } catch {
        run();
      }
    } else {
      run();
    }

    if (this._progressiveRankJob !== job || job.serial !== this._progressiveRankSerial) return;
    if (job.cancelled) {
      this._cancelProgressiveRankJob();
      this.requestFullReselect('progressive-rank-cancelled');
      this.helios?.scheduler?.requestRender?.();
      return;
    }
    if (job.cursor < job.count) {
      this._scheduleProgressiveRankStep(job);
      return;
    }
    this._finishProgressiveRankJob(job);
  }

  _isProgressiveRankJobCurrent(job) {
    return !!job && !job.cancelled && this._progressiveRankJob === job && job.serial === this._progressiveRankSerial;
  }

  _processProgressiveRankRange(job, nodeIndices, positions, nodeSizes, nodeOutlines, nodeStates, start, end) {
    const scratchPoint = [0, 0, 0];
    const scratchCenter = {};
    const scratchOffset = {};
    const right = job.right;
    for (let i = start; i < end; i += 1) {
      const id = Number(nodeIndices[i]);
      if (!Number.isInteger(id) || id < 0) continue;

      const selected = maskHasSelected(nodeStates, id, job.selectedMask);
      const pinned = job.pinnedNodes.has(id);
      const point = readPositionInto(positions, id, scratchPoint);
      if (!point) continue;
      const x = point[0];
      const y = point[1];
      const z = point[2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

      const center = projectPointInto(scratchCenter, job.viewProjection, job.width, job.height, x, y, z);
      if (!center) continue;
      if (job.projectionType !== 'orthographic' && center.w <= 1e-6) continue;
      if (center.ndcZ < -1.05 || center.ndcZ > 1.05) continue;
      if (center.ndcX < -1.2 || center.ndcX > 1.2 || center.ndcY < -1.2 || center.ndcY > 1.2) continue;

      const rawSize = toFinite(nodeSizes?.[id], DEFAULT_NODE_SIZE);
      const rawOutline = toFinite(nodeOutlines?.[id], DEFAULT_NODE_OUTLINE_WIDTH);
      const outlineWidth = Math.max(0, job.nodeOutlineBase + job.nodeOutlineScale * rawOutline);
      const fullSize = Math.max(0, (job.nodeSizeBase + job.nodeSizeScale * rawSize) + outlineWidth) * job.semanticScale;
      const worldRadius = Math.max(0, fullSize * 0.5);
      const offset = projectPointInto(
        scratchOffset,
        job.viewProjection,
        job.width,
        job.height,
        x + right[0] * worldRadius,
        y + right[1] * worldRadius,
        z + right[2] * worldRadius,
      );
      if (!offset) continue;
      const radiusPx = Math.max(0, Math.hypot(offset.screenX - center.screenX, offset.screenY - center.screenY));
      const hovered = job.hoveredNode === id;
      if (!selected && !pinned && !hovered && radiusPx < job.minRadiusPx) continue;

      let score = radiusPx * radiusPx;
      if (selected) score *= job.selectedBoost;
      if (hovered) score *= job.hoveredBoost;
      if (job.prevVisible.has(id)) score *= job.keepBoost;
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
      if (selected || pinned || hovered) {
        job.mustInclude.push(entry);
        continue;
      }
      if (job.heap.length < job.heapCap) {
        pushMinHeap(job.heap, entry);
      } else if (
        score > job.heap[0].score
        || (score === job.heap[0].score && id < job.heap[0].id)
      ) {
        replaceHeapRoot(job.heap, entry);
      }
    }
  }

  _finishProgressiveRankJob(job) {
    if (!this._isProgressiveRankJobCurrent(job)) return;
    const network = this._getRenderNetwork();
    if (!network) {
      this._cancelProgressiveRankJob();
      return;
    }
    const currentUniforms = this.helios?.renderer?.camera?.getUniforms?.() ?? null;
    const currentViewSignature = currentUniforms ? composeViewSignature(currentUniforms) : job.viewSignature;
    if (this._composeDataSignature() !== job.dataSignature || currentViewSignature !== job.viewSignature) {
      this._cancelProgressiveRankJob();
      this.requestFullReselect('progressive-rank-stale');
      this.helios?.scheduler?.requestRender?.();
      return;
    }

    job.mustInclude.sort((a, b) => (b.score - a.score) || (a.id - b.id));
    job.heap.sort((a, b) => (b.score - a.score) || (a.id - b.id));
    const ordered = job.mustInclude.concat(job.heap);
    const sourceAccessors = this._buildLabelSourceAccessors(network, job.source);
    const nextVisible = [];
    const occupied = this._scratchCollision;
    occupied.clear();

    for (let i = 0; i < ordered.length && nextVisible.length < job.maxVisible; i += 1) {
      const entry = ordered[i];
      const text = this._resolveLabelText(sourceAccessors, entry.id);
      if (!text) continue;
      const formatted = this._formatLabelText(text, job.fontSizePx);
      if (!formatted) continue;
      const x = entry.x;
      const y = this._computeLabelScreenY(entry.y, entry.radiusPx);
      const labelW = formatted.widthPx;
      const labelH = formatted.heightPx;
      if (x + labelW * 0.5 < 0 || x - labelW * 0.5 > job.width || y + labelH * 0.5 < 0 || y - labelH * 0.5 > job.height) {
        continue;
      }
      if (!entry.selected && !job.pinnedNodes.has(entry.id) && !entry.hovered) {
        if (this._collides(occupied, x, y, labelW, labelH, job.collisionCellPx)) continue;
      }
      this._occupy(occupied, x, y, labelW, labelH, job.collisionCellPx);
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

    this._progressiveRankJob = null;
    this._visibleEntries = nextVisible;
    this._lastVisibleSet = new Set(nextVisible.map((entry) => entry.id));
    this._lastFullUpdateAt = performance.now();
    this._needsFullReselect = false;
    if (nextVisible.length) {
      this._renderVisible();
    } else {
      this._hideAll();
    }
  }

  _collectRankedEntriesUnsafe(network, uniforms, now, nodeIndices) {
    const context = this.helios?._buildPositionDelegateContext?.() ?? {};
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
    const pinnedNodes = new Set(this._config.pinnedNodes);
    const prevVisible = this._lastVisibleSet;
    const selectedOnly = this._usesSelectedOnlySelectionMode();
    const selectedOnlySpaceAware = selectedOnly && this._config.selectedOnlySpaceAware === true;
    const sparseSelectedOnly = selectedOnly && this._hasSparseSelectedNodeSource();

    const nodeSizes = this._safe(() => network.getNodeAttributeBuffer(NODE_SIZE_ATTRIBUTE)?.view, null);
    const nodeOutlines = this._safe(() => network.getNodeAttributeBuffer(NODE_OUTLINE_WIDTH_ATTRIBUTE)?.view, null);
    const nodeStates = sparseSelectedOnly ? null : this._safe(() => network.getNodeAttributeBuffer(NODE_STATE_ATTRIBUTE)?.view, null);
    let iterationNodeIndices = nodeIndices;
    let positions = null;
    let sparseSelectedSet = null;
    if (selectedOnly) {
      const sparseSelected = this._collectSparseSelectedNodeIds(network, pinnedNodes);
      const selectedIds = [];
      if (sparseSelected) {
        selectedIds.push(...sparseSelected.ids);
        sparseSelectedSet = sparseSelected.selectedSet;
      } else {
        if (!nodeIndices?.length) return [];
        for (let i = 0; i < nodeIndices.length; i += 1) {
          const id = Number(nodeIndices[i]);
          if (!Number.isInteger(id) || id < 0) continue;
          if (maskHasSelected(nodeStates, id, selectedMask) || pinnedNodes.has(id)) selectedIds.push(id);
        }
      }
      if (!selectedIds.length) return [];
      iterationNodeIndices = selectedIds;
      positions = this._resolvePositionAccessor(context, now, selectedIds, { allowFullSnapshot: false });
    } else {
      positions = this._resolvePositionAccessor(context, now, null, { allowFullSnapshot: true });
    }
    this._lastRankedCandidateCount = Number(iterationNodeIndices?.length ?? 0);
    if (!positions) return [];

    const fontSizePx = 12 * this._config.fontSizeScale;
    const maxVisible = this._config.maxVisible;
    const heapCap = Math.max(maxVisible * 6, maxVisible + 24);
    const heap = [];
    const mustInclude = [];
    const sourceAccessors = this._buildLabelSourceAccessors(network, this._config.source);
    const collisionCellPx = Math.max(4, this._config.collisionCellPx);
    const minRadiusPx = Math.max(0, this._config.minScreenRadiusPx);
    const scratchPoint = [0, 0, 0];
    const scratchCenter = {};
    const scratchOffset = {};

    for (let i = 0; i < iterationNodeIndices.length; i += 1) {
      const id = Number(iterationNodeIndices[i]);
      if (!Number.isInteger(id) || id < 0) continue;

      const selected = sparseSelectedSet ? sparseSelectedSet.has(id) : maskHasSelected(nodeStates, id, selectedMask);
      const pinned = pinnedNodes.has(id);
      if (selectedOnly && !selected && !pinned) continue;

      const point = readPositionInto(positions, id, scratchPoint);
      if (!point) continue;
      const x = point[0];
      const y = point[1];
      const z = point[2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

      const center = projectPointInto(scratchCenter, viewProjection, width, height, x, y, z);
      if (!center) continue;
      if (projectionType !== 'orthographic' && center.w <= 1e-6) continue;
      if (center.ndcZ < -1.05 || center.ndcZ > 1.05) continue;
      if (center.ndcX < -1.2 || center.ndcX > 1.2 || center.ndcY < -1.2 || center.ndcY > 1.2) continue;

      const rawSize = toFinite(nodeSizes?.[id], DEFAULT_NODE_SIZE);
      const rawOutline = toFinite(nodeOutlines?.[id], DEFAULT_NODE_OUTLINE_WIDTH);
      const outlineWidth = Math.max(0, nodeOutlineBase + nodeOutlineScale * rawOutline);
      const fullSize = Math.max(0, (nodeSizeBase + nodeSizeScale * rawSize) + outlineWidth) * semanticScale;
      const worldRadius = Math.max(0, fullSize * 0.5);

      const offset = projectPointInto(
        scratchOffset,
        viewProjection,
        width,
        height,
        x + right[0] * worldRadius,
        y + right[1] * worldRadius,
        z + right[2] * worldRadius,
      );
      if (!offset) continue;
      const radiusPx = Math.max(0, Math.hypot(offset.screenX - center.screenX, offset.screenY - center.screenY));

      const hovered = hoveredNode === id;
      if (selectedOnlySpaceAware) {
        if (radiusPx < minRadiusPx) continue;
      } else if (!selected && !pinned && !hovered && radiusPx < minRadiusPx) {
        continue;
      }

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
      if (((selected || pinned) && !selectedOnlySpaceAware) || (!selectedOnly && hovered)) {
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
      if (((entry.selected || pinnedNodes.has(entry.id)) && !selectedOnlySpaceAware) || entry.hovered) {
        // Keep explicit selected or hovered labels unoccluded unless selected-only is using the regular space-aware strategy.
      } else {
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
    return nextVisible;
  }

  _mergeVisibleEntries(baseEntries, overlayEntries) {
    if (!overlayEntries?.length) return baseEntries ?? [];
    if (!baseEntries?.length) return [...overlayEntries];
    const merged = [...baseEntries];
    const indices = new Map();
    for (let i = 0; i < merged.length; i += 1) {
      indices.set(merged[i].id, i);
    }
    for (let i = 0; i < overlayEntries.length; i += 1) {
      const entry = overlayEntries[i];
      const existingIndex = indices.get(entry.id);
      if (existingIndex == null) {
        indices.set(entry.id, merged.length);
        merged.push(entry);
      } else {
        merged[existingIndex] = entry;
      }
    }
    return merged;
  }

  _reprojectVisible(uniforms, now) {
    if (!this._visibleEntries.length) return false;
    const network = this._getRenderNetwork();
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
    const visibleIds = this._visibleEntries.map((entry) => entry.id);
    const positions = this._resolvePositionAccessor(context, now, visibleIds, { allowFullSnapshot: false });
    if (!positions) {
      return false;
    }
    const width = Math.max(1, Math.floor(uniforms.viewport?.width ?? this.helios?.size?.width ?? 1));
    const height = Math.max(1, Math.floor(uniforms.viewport?.height ?? this.helios?.size?.height ?? 1));
    const viewProjection = uniforms.viewProjection;
    const right = uniforms.right ?? [1, 0, 0];
    const projectionType = uniforms.projectionType ?? 'perspective';

    const next = [];
    const scratchPoint = [0, 0, 0];
    const scratchCenter = {};
    const scratchOffset = {};
    for (let i = 0; i < this._visibleEntries.length; i += 1) {
      const entry = this._visibleEntries[i];
      const id = entry.id;
      const point = readPositionInto(positions, id, scratchPoint);
      if (!point) continue;
      const x = point[0];
      const y = point[1];
      const z = point[2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
      const center = projectPointInto(scratchCenter, viewProjection, width, height, x, y, z);
      if (!center) continue;
      if (projectionType !== 'orthographic' && center.w <= 1e-6) continue;
      if (center.ndcZ < -1.05 || center.ndcZ > 1.05) continue;
      const offset = projectPointInto(
        scratchOffset,
        viewProjection,
        width,
        height,
        x + right[0] * entry.worldRadius,
        y + right[1] * entry.worldRadius,
        z + right[2] * entry.worldRadius,
      );
      if (!offset) continue;
      const radiusPx = Math.max(0, Math.hypot(offset.screenX - center.screenX, offset.screenY - center.screenY));
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
    const network = this._getRenderNetwork();
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

  _positionIdSignature(nodeIds) {
    if (!nodeIds?.length) return '';
    return Array.from(nodeIds, (id) => Math.max(0, Math.floor(Number(id) || 0))).join(',');
  }

  _resolvePositionAccessor(context, now, nodeIds = null, options = {}) {
    const source = this.helios?.positions?.() ?? { source: 'network', delegate: null };
    const network = this._getRenderNetwork();
    if (source.source !== 'delegate') {
      const view = this._safe(() => network?.getNodeAttributeBuffer?.(NODE_POSITION_ATTRIBUTE)?.view, null);
      if (!view) return null;
      return {
        source: 'network',
        getInto: (id, out) => {
          const offset = id * 3;
          if (offset + 2 >= view.length) return null;
          out[0] = view[offset];
          out[1] = view[offset + 1];
          out[2] = view[offset + 2];
          return out;
        },
        get(id) {
          return this.getInto(id, [0, 0, 0]);
        },
      };
    }

    const delegate = source.delegate ?? null;
    if (!delegate) return null;
    let view = null;
    if (typeof delegate.getNodePositionView === 'function') {
      view = this._safe(() => delegate.getNodePositionView(context), null);
    } else if (typeof delegate.getPositionView === 'function') {
      view = this._safe(() => delegate.getPositionView(context), null);
    }
    if (view && Number.isFinite(view.length) && view.length > 0) {
      return {
        source: 'delegate-view',
        getInto: (id, out) => {
          const offset = id * 3;
          if (offset + 2 >= view.length) return null;
          out[0] = view[offset];
          out[1] = view[offset + 1];
          out[2] = view[offset + 2];
          return out;
        },
        get(id) {
          return this.getInto(id, [0, 0, 0]);
        },
      };
    }

    if (nodeIds?.length) {
      const signature = this._positionIdSignature(nodeIds);
      this._scheduleSparsePositionSnapshot(delegate, nodeIds, signature, now);
      const snapshot = this._sparsePositionSnapshots?.get?.(signature) ?? (
        this._sparsePositionSignature === signature ? this._sparsePositionSnapshot : null
      );
      if (snapshot?.positions instanceof Float32Array) {
        const positions = snapshot.positions;
        const offsets = snapshot.offsets;
        return {
          source: 'delegate-sparse',
          getInto: (id, out) => {
            const packedIndex = offsets.get(id);
            if (packedIndex == null) return null;
            const offset = packedIndex * 3;
            if (offset + 2 >= positions.length) return null;
            out[0] = positions[offset];
            out[1] = positions[offset + 1];
            out[2] = positions[offset + 2];
            return out;
          },
          get(id) {
            return this.getInto(id, [0, 0, 0]);
          },
        };
      }
      return null;
    }

    if (options.allowFullSnapshot !== false) {
      const resolved = this._resolvePositionView(context, now);
      const fullView = resolved?.view ?? null;
      if (!fullView) return null;
      return {
        source: resolved.source,
        getInto: (id, out) => {
          const offset = id * 3;
          if (offset + 2 >= fullView.length) return null;
          out[0] = fullView[offset];
          out[1] = fullView[offset + 1];
          out[2] = fullView[offset + 2];
          return out;
        },
        get(id) {
          return this.getInto(id, [0, 0, 0]);
        },
      };
    }
    return null;
  }

  _scheduleSparsePositionSnapshot(delegate, nodeIds, signature, now) {
    if (!delegate || !nodeIds?.length || !signature) return;
    if (this._sparsePositionPendingSignatures?.has?.(signature)) return;
    const maxFps = Math.max(1, this._config.delegateSnapshotMaxFps);
    const minIntervalMs = 1000 / Math.max(maxFps, 12);
    const cached = this._sparsePositionSnapshots?.get?.(signature) ?? (
      this._sparsePositionSignature === signature ? this._sparsePositionSnapshot : null
    );
    if (cached && now - (cached.at ?? this._sparsePositionAt) < minIntervalMs) return;
    if (!this.helios || typeof this.helios.snapshotNodePositions !== 'function') return;
    const ids = Array.from(nodeIds);
    this._sparsePositionPending = true;
    this._sparsePositionSignature = signature;
    this._sparsePositionPendingSignatures.add(signature);
    Promise.resolve()
      .then(() => this.helios.snapshotNodePositions(ids, { delegate }))
      .then((result) => {
        const positions = result?.positions ?? null;
        if (!(positions instanceof Float32Array)) return;
        const offsets = new Map();
        for (let i = 0; i < ids.length; i += 1) {
          if (!offsets.has(ids[i])) offsets.set(ids[i], i);
        }
        const at = performance.now();
        const snapshot = { positions, offsets, at };
        this._sparsePositionSnapshot = snapshot;
        this._sparsePositionSnapshots.set(signature, snapshot);
        this._pruneSparsePositionSnapshots();
        this._sparsePositionAt = performance.now();
        this.requestFullReselect('delegate-sparse-position');
        this.helios?.scheduler?.requestRender?.();
      })
      .catch(() => {})
      .finally(() => {
        this._sparsePositionPendingSignatures.delete(signature);
        this._sparsePositionPending = this._sparsePositionPendingSignatures.size > 0;
      });
  }

  _pruneSparsePositionSnapshots() {
    const snapshots = this._sparsePositionSnapshots;
    if (!snapshots || snapshots.size <= 8) return;
    const entries = Array.from(snapshots.entries())
      .sort((a, b) => (b[1]?.at ?? 0) - (a[1]?.at ?? 0));
    snapshots.clear();
    for (let i = 0; i < Math.min(8, entries.length); i += 1) {
      snapshots.set(entries[i][0], entries[i][1]);
    }
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

  _resolveCandidateSourceNames(network, configuredSource = this._config.source) {
    const configured = typeof configuredSource === 'string' ? configuredSource.trim() : configuredSource;
    if (typeof configured === 'string' && configured && configured.toLowerCase() !== 'auto') {
      return [configured, '$id'];
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

  _buildLabelSourceAccessors(network, configured = this._config.source) {
    if (typeof configured === 'function') {
      return [{ key: '$fn', type: 'function', get: configured }];
    }
    const names = this._resolveCandidateSourceNames(network, configured);
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
    const network = this._getRenderNetwork();
    for (let i = 0; i < accessors.length; i += 1) {
      const accessor = accessors[i];
      let value = null;
      try {
        value = accessor.get(id, network);
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
    this._applyGroupStyles(this.group);
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

  _buildSnapshotGroup(entries) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'helios-label-layer');
    group.setAttribute('pointer-events', 'none');
    if (this._config.illustratorCompatible === true) {
      const outlineLayer = document.createElementNS(SVG_NS, 'g');
      const fillLayer = document.createElementNS(SVG_NS, 'g');
      outlineLayer.setAttribute('class', 'helios-label-layer__outline');
      fillLayer.setAttribute('class', 'helios-label-layer__fill');
      const fillPaint = colorStringToSvgPaint(this._config.fill, '#ffffff');
      const outlinePaint = colorStringToSvgPaint(this._config.outlineColor, '#000000');
      outlineLayer.setAttribute('font-family', this._config.fontFamily);
      outlineLayer.setAttribute('font-size', `${12 * this._config.fontSizeScale}`);
      outlineLayer.setAttribute('fill', outlinePaint.color);
      outlineLayer.setAttribute('stroke', outlinePaint.color);
      outlineLayer.setAttribute('stroke-width', `${this._config.outlineWidth}`);
      outlineLayer.setAttribute('stroke-linejoin', 'round');
      outlineLayer.setAttribute('stroke-linecap', 'round');
      if (outlinePaint.opacity != null) {
        outlineLayer.setAttribute('fill-opacity', `${outlinePaint.opacity}`);
        outlineLayer.setAttribute('stroke-opacity', `${outlinePaint.opacity}`);
      }
      fillLayer.setAttribute('font-family', this._config.fontFamily);
      fillLayer.setAttribute('font-size', `${12 * this._config.fontSizeScale}`);
      fillLayer.setAttribute('fill', fillPaint.color);
      fillLayer.setAttribute('stroke', 'none');
      if (fillPaint.opacity != null) fillLayer.setAttribute('fill-opacity', `${fillPaint.opacity}`);
      group.appendChild(outlineLayer);
      group.appendChild(fillLayer);
      for (const entry of entries) {
        const outlineNode = document.createElementNS(SVG_NS, 'text');
        outlineNode.setAttribute('class', 'helios-label helios-label--outline');
        outlineNode.setAttribute('text-anchor', 'middle');
        outlineNode.setAttribute('dominant-baseline', 'middle');
        outlineNode.dataset.nodeId = String(entry.id);
        outlineNode.setAttribute('x', `${entry.x}`);
        outlineNode.setAttribute('y', `${entry.y}`);
        this._syncTextContent(outlineNode, entry);
        outlineLayer.appendChild(outlineNode);

        const fillNode = document.createElementNS(SVG_NS, 'text');
        fillNode.setAttribute('class', 'helios-label helios-label--fill');
        fillNode.setAttribute('text-anchor', 'middle');
        fillNode.setAttribute('dominant-baseline', 'middle');
        fillNode.dataset.nodeId = String(entry.id);
        fillNode.setAttribute('x', `${entry.x}`);
        fillNode.setAttribute('y', `${entry.y}`);
        this._syncTextContent(fillNode, entry);
        fillLayer.appendChild(fillNode);
      }
      return group;
    }
    this._applyGroupStyles(group);
    for (const entry of entries) {
      const node = document.createElementNS(SVG_NS, 'text');
      node.setAttribute('class', 'helios-label');
      node.setAttribute('text-anchor', 'middle');
      node.setAttribute('dominant-baseline', 'middle');
      node.dataset.nodeId = String(entry.id);
      node.setAttribute('x', `${entry.x}`);
      node.setAttribute('y', `${entry.y}`);
      this._syncTextContent(node, entry);
      group.appendChild(node);
    }
    return group;
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

  _applyGroupStyles(group = this.group) {
    if (!group) return;
    const fillPaint = colorStringToSvgPaint(this._config.fill, '#ffffff');
    const outlinePaint = colorStringToSvgPaint(this._config.outlineColor, '#000000');
    group.setAttribute('font-family', this._config.fontFamily);
    group.setAttribute('font-size', `${12 * this._config.fontSizeScale}`);
    group.setAttribute('fill', fillPaint.color);
    group.setAttribute('stroke', outlinePaint.color);
    group.setAttribute('stroke-width', `${this._config.outlineWidth}`);
    group.setAttribute('stroke-linejoin', 'round');
    group.setAttribute('stroke-linecap', 'round');
    if (fillPaint.opacity != null) group.setAttribute('fill-opacity', `${fillPaint.opacity}`);
    else group.removeAttribute('fill-opacity');
    if (outlinePaint.opacity != null) group.setAttribute('stroke-opacity', `${outlinePaint.opacity}`);
    else group.removeAttribute('stroke-opacity');
    if (this._config.illustratorCompatible === true) group.removeAttribute('paint-order');
    else group.setAttribute('paint-order', this._config.outlineWidth > 0 ? 'stroke fill' : 'fill');
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
