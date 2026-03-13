import { createColormapScale } from '../colors/colormaps.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  respectDockInsets: true,
  margin: 12,
  gap: 12,
  maxChars: 24,
  maxRows: 2,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: 12,
  scale: 1,
  continuousHeight: 132,
  zoomAwareSizeIn2D: true,
  showPanel: false,
  panelOpacity: 0.14,
  textOutline: true,
  textOutlineWidth: 1.35,
  showNodeColor: true,
  showDensity: true,
  showEdgeColor: true,
  showNodeSize: false,
  showEdgeWidth: false,
  placements: Object.freeze({
    nodeColor: 'auto',
    density: 'auto',
    edgeColor: 'auto',
    nodeSize: 'auto',
    edgeWidth: 'auto',
  }),
});

const LEGEND_ORDER = ['nodeColor', 'edgeColor', 'nodeSize', 'edgeWidth', 'density'];
const LEGEND_SLOT_DEFAULTS = Object.freeze({
  nodeColor: 'top-left',
  edgeColor: 'top-right',
  nodeSize: 'bottom-left',
  edgeWidth: 'bottom-left',
  density: 'bottom-right',
});
const GUIDE_VALUES = new Set([
  'top-left',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-right',
]);

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function clampInt(value, min, max) {
  return Math.round(clamp(value, min, max));
}

function toFinite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeInsets(insets) {
  if (!insets || typeof insets !== 'object') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  return {
    top: Math.max(0, toFinite(insets.top, 0)),
    right: Math.max(0, toFinite(insets.right, 0)),
    bottom: Math.max(0, toFinite(insets.bottom, 0)),
    left: Math.max(0, toFinite(insets.left, 0)),
  };
}

function rgbaArrayToCss(color, fallback = 'rgba(120, 120, 120, 1)') {
  if (typeof color === 'string' && color.trim()) return color.trim();
  if (!(Array.isArray(color) || ArrayBuffer.isView(color))) return fallback;
  const r = Math.round(clamp((color[0] ?? 0) * 255, 0, 255));
  const g = Math.round(clamp((color[1] ?? 0) * 255, 0, 255));
  const b = Math.round(clamp((color[2] ?? 0) * 255, 0, 255));
  const a = clamp(color[3] ?? 1, 0, 1);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function estimateTextWidthPx(text, fontSize) {
  return Math.max(8, String(text ?? '').length * Number(fontSize) * 0.6);
}

function truncateLine(text, maxChars) {
  const raw = String(text ?? '');
  if (maxChars <= 0 || raw.length <= maxChars) return raw;
  if (maxChars <= 3) return '.'.repeat(maxChars);
  return `${raw.slice(0, maxChars - 3)}...`;
}

function trimTrailingZeros(text) {
  const raw = String(text ?? '');
  if (!raw.includes('.')) return raw;
  return raw.replace(/(\.\d*?[1-9])0+$/u, '$1').replace(/\.0+$/u, '');
}

function sanitizeExponential(text) {
  return String(text ?? '')
    .replace(/(\.\d*?[1-9])0+e/u, '$1e')
    .replace(/\.0+e/u, 'e')
    .replace(/e\+/u, 'e');
}

function isNearlyInteger(value, epsilon = 1e-9) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return false;
  return approximatelyEqual(numeric, Math.round(numeric), epsilon);
}

function wrapTextLines(text, maxChars = 24, maxRows = 2) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const safeMaxChars = clampInt(maxChars, 0, 512);
  const safeMaxRows = clampInt(maxRows, 1, 8);
  if (safeMaxRows <= 1) return [truncateLine(raw, safeMaxChars)];
  if (safeMaxChars <= 0) return [raw];

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const lines = [];
  let current = '';
  let index = 0;
  let overflowed = false;

  while (index < tokens.length && lines.length < safeMaxRows) {
    const token = tokens[index];
    if (!current) {
      if (token.length <= safeMaxChars) {
        current = token;
        index += 1;
        continue;
      }
      if (lines.length >= safeMaxRows - 1) {
        lines.push(truncateLine(token, safeMaxChars));
        overflowed = true;
        index = tokens.length;
        break;
      }
      lines.push(token.slice(0, safeMaxChars));
      tokens[index] = token.slice(safeMaxChars);
      continue;
    }
    const next = `${current} ${token}`;
    if (next.length <= safeMaxChars) {
      current = next;
      index += 1;
      continue;
    }
    lines.push(current);
    current = '';
  }

  if (current && lines.length < safeMaxRows) lines.push(current);
  if (index < tokens.length) overflowed = true;
  if (overflowed && lines.length) {
    lines[lines.length - 1] = truncateLine(lines[lines.length - 1], safeMaxChars);
  }
  return lines.slice(0, safeMaxRows);
}

function formatNumber(value, stepHint = null) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (Math.abs(numeric) < 1e-12) return '0';
  const abs = Math.abs(numeric);
  const step = Math.abs(Number(stepHint));
  const safeStep = Number.isFinite(step) && step > 0 ? step : abs;
  if (abs >= 1e6 || (abs > 0 && abs < 1e-4) || (safeStep > 0 && safeStep < 1e-4)) {
    const precision = clampInt(4 - Math.floor(Math.log10(Math.max(safeStep, Number.EPSILON))), 1, 4);
    return sanitizeExponential(numeric.toExponential(precision));
  }
  const decimals = safeStep >= 1
    ? 0
    : clampInt(Math.ceil(-Math.log10(Math.max(safeStep, Number.EPSILON))) + (safeStep < 0.1 ? 1 : 0), 0, 6);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: isNearlyInteger(safeStep) && isNearlyInteger(numeric) ? 0 : decimals,
  }).format(numeric);
}

function approximatelyEqual(a, b, epsilon = 1e-9) {
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= (epsilon * scale);
}

function dedupeTicks(values) {
  const ticks = [];
  for (const value of values) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    if (ticks.some((entry) => approximatelyEqual(entry, numeric))) continue;
    ticks.push(numeric);
  }
  return ticks.sort((a, b) => a - b);
}

function niceStep(span, count) {
  const safeSpan = Math.abs(Number(span));
  if (!Number.isFinite(safeSpan) || safeSpan <= 0) return 1;
  const raw = safeSpan / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const error = raw / power;
  let factor = 1;
  if (error >= 7.5) factor = 10;
  else if (error >= 3.5) factor = 5;
  else if (error >= 1.5) factor = 2;
  return factor * power;
}

function generateNiceTicks(lo, hi, desiredCount = 4) {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (approximatelyEqual(lo, hi)) return [lo];
  const min = Math.min(lo, hi);
  const max = Math.max(lo, hi);
  const step = niceStep(max - min, desiredCount);
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let value = start; value <= max + (step * 1e-6); value += step) {
    const normalized = Math.abs(value) < (step * 1e-6) ? 0 : value;
    ticks.push(Number(normalized.toPrecision(12)));
  }
  return ticks.length >= 2 ? dedupeTicks(ticks) : [min, max];
}

function continuousTickValues(domain, { divergent = false } = {}) {
  const lo = Number(domain?.[0] ?? 0);
  const hi = Number(domain?.[1] ?? 1);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (approximatelyEqual(lo, hi)) return [lo];
  if (divergent && lo < 0 && hi > 0) return dedupeTicks([lo, 0, hi]);
  return generateNiceTicks(lo, hi, 4);
}

function continuousTickLabels(ticks) {
  const safeTicks = Array.isArray(ticks) ? ticks : [];
  if (safeTicks.length <= 1) return safeTicks.map((tick) => formatNumber(tick));
  return safeTicks.map((tick, index) => {
    const prev = safeTicks[index - 1];
    const next = safeTicks[index + 1];
    const stepHint = prev == null
      ? Math.abs((next ?? tick) - tick)
      : (next == null ? Math.abs(tick - prev) : Math.min(Math.abs(tick - prev), Math.abs(next - tick)));
    return formatNumber(tick, stepHint);
  });
}

function computeNodeSizeLegendPreview(range, runtime) {
  if (!runtime || runtime.enabled !== true) return null;
  if (runtime.mode !== '2d' || runtime.projection !== 'orthographic') return null;
  const viewportHeight = Math.max(1, Number(runtime.viewportHeight ?? 0));
  const zoom = Math.max(1e-6, Number(runtime.zoom ?? 1));
  const distance = Math.max(1e-6, Number(runtime.distance ?? 1));
  const semanticZoomExponent = Math.max(0, Number(runtime.semanticZoomExponent ?? 0));
  const semanticScale = semanticZoomExponent > 0
    ? (1 / Math.pow(zoom, semanticZoomExponent))
    : 1;
  const pixelFactor = (viewportHeight * zoom * semanticScale) / (2 * distance);
  const base = Math.max(0, Number(runtime.nodeSizeBase ?? 0)) * pixelFactor;
  const scale = Math.max(0, Number(runtime.nodeSizeScale ?? 1)) * pixelFactor;
  const safeRange = Array.isArray(range) ? range : [0, 1];
  return {
    base,
    scale,
    apparentRange: safeRange.map((value) => Math.max(1, base + scale * Math.max(0, Number(value) || 0))),
  };
}

export function scalarSampleValues(domain, count, { omitZeroMin = false, readableMinRatio = 0 } = {}) {
  const domainMin = Number(domain?.[0] ?? 0);
  const domainMax = Number(domain?.[1] ?? 1);
  if (!Number.isFinite(domainMin) || !Number.isFinite(domainMax)) return [0, 1];
  if (approximatelyEqual(domainMin, domainMax)) return [domainMax];
  const safeCount = clampInt(count, 1, 3);
  let samples = safeCount >= 3
    ? [domainMin, (domainMin + domainMax) * 0.5, domainMax]
    : [domainMin, domainMax];
  if (omitZeroMin && approximatelyEqual(domainMin, 0)) {
    samples = safeCount >= 3
      ? [(domainMin + domainMax) * 0.5, domainMax]
      : [domainMax * 0.5, domainMax];
  }
  if (readableMinRatio > 0 && samples.length >= 2) {
    const low = Number(samples[0]);
    const high = Number(samples[samples.length - 1]);
    if (low > 0 && high > 0 && (low / high) < readableMinRatio) {
      samples[0] = high * 0.5;
    }
  }
  return dedupeTicks(samples);
}

function inferLabelFromAttributes(attributes, fallback) {
  const list = Array.isArray(attributes) ? attributes : (attributes != null ? [attributes] : []);
  if (!list.length) return fallback;
  const first = list.find((entry) => typeof entry === 'string' && entry.trim());
  if (!first) return fallback;
  return first
    .replace(/^[@$]/, '')
    .replace(/^nodes?\./, '')
    .replace(/_/g, ' ');
}

function primaryAttributeName(attributes) {
  const list = Array.isArray(attributes) ? attributes : (attributes != null ? [attributes] : []);
  const first = list.find((entry) => typeof entry === 'string' && entry.trim());
  if (!first) return '';
  return String(first)
    .trim()
    .replace(/^[@$]/, '')
    .replace(/^node\./, '')
    .replace(/^edge\./, '')
    .replace(/^network\./, '');
}

function categoricalLegendEntries(channel, network, scope) {
  const domain = Array.isArray(channel?.domain) ? channel.domain : [];
  const range = Array.isArray(channel?.range) ? channel.range : [];
  if (!domain.length || !range.length) return [];
  const attributeName = primaryAttributeName(channel?.attributes ?? channel?.from);
  const getter = scope === 'edge'
    ? network?.getEdgeAttributeCategoryDictionary
    : network?.getNodeAttributeCategoryDictionary;
  let labelsById = null;
  if (attributeName && typeof getter === 'function') {
    try {
      const dictionary = getter.call(network, attributeName, { sortById: false }) ?? {};
      const entries = Array.isArray(dictionary.entries) ? dictionary.entries : [];
      labelsById = new Map(entries.map((entry) => [Number(entry?.id), String(entry?.label ?? '')]));
    } catch {
      labelsById = null;
    }
  }
  return domain.map((value, index) => {
    const numericValue = Number(value);
    const label = labelsById?.get(numericValue) || String(value);
    return {
      label,
      color: rgbaArrayToCss(range[index % range.length]),
    };
  });
}

function combineMapperChannels(collection) {
  const out = new Map();
  if (!collection?.mappers?.values) return out;
  for (const mapper of collection.mappers.values()) {
    if (!mapper?.channels?.entries) continue;
    for (const [name, config] of mapper.channels.entries()) {
      out.set(name, { ...config, attributes: config.attributes ?? config.from });
    }
  }
  return out;
}

function normalizePlacementValue(value) {
  if (value && typeof value === 'object') {
    const x = Number(value.x);
    const y = Number(value.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  }
  const stringValue = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!stringValue || stringValue === 'auto') return 'auto';
  if (GUIDE_VALUES.has(stringValue)) return stringValue;
  return 'auto';
}

function normalizePlacements(placements) {
  const next = {};
  for (const kind of LEGEND_ORDER) {
    next[kind] = normalizePlacementValue(placements?.[kind] ?? DEFAULT_CONFIG.placements[kind]);
  }
  return next;
}

function withAlpha(color, alpha) {
  if (typeof color !== 'string') return color;
  const rgba = /rgba?\(([^)]+)\)/u.exec(color);
  if (!rgba) return color;
  const parts = rgba[1].split(',').map((part) => part.trim());
  if (parts.length < 3) return color;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${clamp(alpha, 0, 1)})`;
}

function legendMetrics(config, options = {}) {
  const baseScale = clamp(toFinite(config?.scale, DEFAULT_CONFIG.scale), 0.6, 3);
  const scale = options.ignoreScale === true ? 1 : baseScale;
  const fontSize = Math.max(10, toFinite(config?.fontSize, DEFAULT_CONFIG.fontSize) * scale);
  const lineHeight = fontSize * 1.18;
  return {
    baseScale,
    scale,
    fontSize,
    lineHeight,
    paddingX: 6 * scale,
    paddingY: 4 * scale,
    titleGap: 5 * scale,
    entryGap: 4 * scale,
    swatchSize: Math.max(12, Math.round(fontSize * 0.95)),
    swatchGap: 8 * scale,
    barWidth: 10 * scale,
    barHeight: clamp(toFinite(config?.continuousHeight, DEFAULT_CONFIG.continuousHeight * scale), 72, 320),
    tickLength: 10 * scale,
    tickGap: 3 * scale,
    labelGap: 4 * scale,
    continuousTitleGap: 8 * scale,
    scalarWidth: 84 * scale,
    scalarGap: 8 * scale,
    scalarBaselineOffset: 8 * scale,
  };
}

function safeRectFromSize(size, insets, config) {
  const width = Math.max(1, Math.floor(size?.width ?? 1));
  const height = Math.max(1, Math.floor(size?.height ?? 1));
  const useInsets = config?.respectDockInsets !== false;
  const appliedInsets = useInsets ? normalizeInsets(insets) : { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    x: appliedInsets.left,
    y: appliedInsets.top,
    width: Math.max(1, width - appliedInsets.left - appliedInsets.right),
    height: Math.max(1, height - appliedInsets.top - appliedInsets.bottom),
  };
}

function layoutAnchoredLegends(items, safeRect, config) {
  const margin = Math.max(0, toFinite(config?.margin, DEFAULT_CONFIG.margin));
  const gap = Math.max(0, toFinite(config?.gap, DEFAULT_CONFIG.gap));
  const placements = normalizePlacements(config?.placements);
  const groups = new Map();
  const positioned = [];

  for (const item of items) {
    const placement = placements[item.kind] ?? 'auto';
    if (placement && typeof placement === 'object') {
      positioned.push({
        ...item,
        x: clamp(safeRect.x + placement.x, safeRect.x, safeRect.x + safeRect.width - item.box.width),
        y: clamp(safeRect.y + placement.y, safeRect.y, safeRect.y + safeRect.height - item.box.height),
      });
      continue;
    }
    const slot = placement === 'auto' ? LEGEND_SLOT_DEFAULTS[item.kind] : placement;
    if (!groups.has(slot)) groups.set(slot, []);
    groups.get(slot).push(item);
  }

  for (const [slot, slotItems] of groups.entries()) {
    const totalHeight = slotItems.reduce((sum, item) => sum + item.box.height, 0) + ((slotItems.length - 1) * gap);
    let cursorY = safeRect.y + margin;
    if (slot.startsWith('bottom')) {
      cursorY = safeRect.y + safeRect.height - margin - totalHeight;
    } else if (slot.startsWith('middle')) {
      cursorY = safeRect.y + ((safeRect.height - totalHeight) * 0.5);
    }
    for (const item of slotItems) {
      const itemX = slot.endsWith('right')
        ? safeRect.x + safeRect.width - margin - item.box.width
        : safeRect.x + margin;
      positioned.push({
        ...item,
        x: clamp(itemX, safeRect.x, safeRect.x + safeRect.width - item.box.width),
        y: clamp(cursorY, safeRect.y, safeRect.y + safeRect.height - item.box.height),
      });
      cursorY += item.box.height + gap;
    }
  }

  return positioned.sort((a, b) => LEGEND_ORDER.indexOf(a.kind) - LEGEND_ORDER.indexOf(b.kind));
}

export function deriveLegendItems({ nodeChannels, edgeChannels, densityConfig, densityRuntime, visualConfig, config, legendRuntime = null, network = null }) {
  const items = [];
  const edgeColorSource = visualConfig?.edge?.color?.source ?? 'edge';

  const pushColorLegend = (kind, channel, fallbackTitle) => {
    if (!channel || channel.type === 'constant' || typeof channel.scale === 'function') return;
    if (channel.type === 'categorical') {
      const scope = kind.startsWith('edge') ? 'edge' : 'node';
      const entries = categoricalLegendEntries(channel, network, scope);
      if (!entries.length) return;
      items.push({
        kind,
        legendType: 'categorical',
        title: inferLabelFromAttributes(channel.attributes, fallbackTitle),
        entries,
      });
      return;
    }
    if (channel.type === 'colormap' || channel.colormap) {
      const domain = Array.isArray(channel.domain) ? channel.domain : [0, 1];
      const ticks = continuousTickValues(domain, { divergent: channel.divergent === true });
      items.push({
        kind,
        legendType: 'continuous',
        title: inferLabelFromAttributes(channel.attributes, fallbackTitle),
        colormap: channel.colormap ?? channel.scale ?? channel.range,
        domain,
        divergent: channel.divergent === true,
        ticks,
        tickLabels: continuousTickLabels(ticks),
      });
    }
  };

  const pushScalarLegend = (kind, channel, fallbackTitle, shape) => {
    if (!channel || channel.type !== 'linear' || !Array.isArray(channel.domain) || !Array.isArray(channel.range)) return;
    const domain = [channel.domain[0] ?? 0, channel.domain[1] ?? 1];
    const range = [channel.range[0] ?? 0, channel.range[1] ?? 1];
    items.push({
      kind,
      legendType: 'scalar',
      shape,
      title: inferLabelFromAttributes(channel.attributes, fallbackTitle),
      domain,
      range,
      preview: kind === 'nodeSize' && shape === 'circle'
        ? computeNodeSizeLegendPreview(range, legendRuntime)
        : null,
    });
  };

  if (config?.showNodeColor !== false) pushColorLegend('nodeColor', nodeChannels.get('color'), 'Node Color');
  if (config?.showEdgeColor !== false && edgeColorSource !== 'node') pushColorLegend('edgeColor', edgeChannels.get('color'), 'Edge Color');
  if (config?.showNodeSize === true) pushScalarLegend('nodeSize', nodeChannels.get('size'), 'Node Size', 'circle');
  if (config?.showEdgeWidth === true) pushScalarLegend('edgeWidth', edgeChannels.get('width'), 'Edge Width', 'line');

  if (config?.showDensity !== false && densityConfig?.enabled === true) {
    const diverging = densityRuntime?.diverging === true;
    const lowLabel = diverging ? String(densityConfig.compareProperty ?? '-') : '0';
    const highLabel = diverging ? String(densityConfig.property ?? '+') : '+';
    items.push({
      kind: 'density',
      legendType: 'continuous',
      title: diverging
        ? `${densityConfig.property ?? 'Density'} vs ${densityConfig.compareProperty ?? ''}`.trim()
        : String(densityConfig.property ?? 'Density'),
      colormap: diverging ? (densityConfig.divergingColormap ?? densityConfig.colormap) : densityConfig.colormap,
      domain: diverging ? [-1, 1] : [0, 1],
      divergent: diverging,
      ticks: diverging ? [-1, 0, 1] : [0, 1],
      tickLabels: diverging ? [lowLabel, '0', highLabel] : ['0', highLabel],
    });
  }

  return items;
}

export function layoutLegendItems(items, safeRect, config) {
  const measured = items.map((item) => {
    const metrics = legendMetrics(config, { ignoreScale: item.legendType === 'scalar' && Boolean(item.preview) });
    const { fontSize, lineHeight } = metrics;
    if (item.legendType === 'categorical') {
      const titleLines = wrapTextLines(item.title, config?.maxChars, config?.maxRows);
      const titleWidth = Math.max(0, ...titleLines.map((line) => estimateTextWidthPx(line, fontSize)));
      let maxLabelWidth = 0;
      let totalEntryHeight = 0;
      const entries = item.entries.map((entry) => {
        const lines = wrapTextLines(entry.label, config?.maxChars, config?.maxRows);
        maxLabelWidth = Math.max(maxLabelWidth, ...lines.map((line) => estimateTextWidthPx(line, fontSize)));
        totalEntryHeight += Math.max(metrics.swatchSize, lines.length * lineHeight);
        return { ...entry, lines };
      });
      const width = Math.ceil(metrics.paddingX * 2 + metrics.swatchSize + metrics.swatchGap + Math.max(titleWidth, maxLabelWidth));
      const titleHeight = titleLines.length * lineHeight;
      const height = Math.ceil(
        (metrics.paddingY * 2)
        + titleHeight
        + (entries.length && titleLines.length ? metrics.titleGap : 0)
        + totalEntryHeight
        + Math.max(0, entries.length - 1) * metrics.entryGap,
      );
      return {
        ...item,
        titleLines,
        entries,
        box: {
          width: Math.max(84, width),
          height: Math.max(28, height),
        },
      };
    }
    if (item.legendType === 'scalar') {
      const titleLines = wrapTextLines(item.title, config?.maxChars, config?.maxRows);
      const titleWidth = Math.max(0, ...titleLines.map((line) => estimateTextWidthPx(line, fontSize)));
      const sampleLabels = scalarSampleValues(item.domain, metrics.scalarWidth >= 116 ? 3 : 2, {
        omitZeroMin: item.shape === 'line',
        readableMinRatio: item.shape === 'line' ? 0.2 : 0,
      }).map((sample) => formatNumber(sample));
      const labelWidth = Math.max(
        0,
        ...sampleLabels.map((label) => estimateTextWidthPx(label, fontSize - 1)),
      );
      const visualWidth = item.shape === 'line'
        ? Math.max(metrics.scalarWidth, labelWidth + 28)
        : Math.max(metrics.scalarWidth, labelWidth * 2 + metrics.scalarGap + 26);
      const height = item.shape === 'line'
        ? Math.ceil((metrics.paddingY * 2) + 26 + sampleLabels.length * ((fontSize - 1) + 14) + metrics.fontSize)
        : Math.ceil((metrics.paddingY * 2) + 58 + (fontSize - 1) * 2.2);
      return {
        ...item,
        titleLines,
        box: {
          width: Math.ceil(Math.max((metrics.paddingX * 2) + titleWidth, (metrics.paddingX * 2) + visualWidth)),
          height: Math.max(72, height),
        },
      };
    }
    const titleLines = wrapTextLines(item.title, config?.maxChars, config?.maxRows);
    const titleText = titleLines.join(' ').trim();
    const titleSpan = estimateTextWidthPx(titleText, fontSize);
    const tickLabels = Array.isArray(item.tickLabels) ? item.tickLabels : [];
    const tickWidth = Math.max(0, ...tickLabels.map((line) => estimateTextWidthPx(line, fontSize - 1)));
    const titleColumn = fontSize + metrics.continuousTitleGap;
    const width = Math.ceil(metrics.paddingX * 2 + titleColumn + metrics.barWidth + metrics.tickGap + metrics.tickLength + metrics.labelGap + tickWidth);
    const height = Math.ceil((metrics.paddingY * 2) + Math.max(metrics.barHeight, titleSpan));
    return {
      ...item,
      titleLines,
      box: {
        width: Math.max(88, width),
        height: Math.max(108, height),
      },
    };
  });
  return layoutAnchoredLegends(measured, safeRect, config);
}

export class SvgLegendController {
  constructor(helios, options = {}) {
    this.helios = helios ?? null;
    this._config = {
      ...DEFAULT_CONFIG,
      placements: normalizePlacements(DEFAULT_CONFIG.placements),
    };
    this._lastSignature = '';

    const svg = this.helios?.layers?.svg ?? null;
    if (!svg || typeof document === 'undefined') {
      this.svg = null;
      this.group = null;
      this.defs = null;
      return;
    }
    this.svg = svg;
    this.group = document.createElementNS(SVG_NS, 'g');
    this.group.setAttribute('class', 'helios-legends-layer');
    this.group.setAttribute('pointer-events', 'none');
    this.defs = document.createElementNS(SVG_NS, 'defs');
    this.group.appendChild(this.defs);
    this.svg.appendChild(this.group);
    this.setConfig(options);
  }

  destroy() {
    this.group?.remove?.();
    this.group = null;
    this.defs = null;
    this.svg = null;
  }

  getConfig() {
    return {
      ...this._config,
      placements: { ...this._config.placements },
    };
  }

  setConfig(options = {}) {
    const next = {
      ...this._config,
      placements: { ...this._config.placements },
    };
    if (Object.prototype.hasOwnProperty.call(options, 'enabled')) next.enabled = options.enabled === true;
    if (Object.prototype.hasOwnProperty.call(options, 'respectDockInsets')) next.respectDockInsets = options.respectDockInsets !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'margin')) next.margin = clamp(options.margin, 0, 128);
    if (Object.prototype.hasOwnProperty.call(options, 'gap')) next.gap = clamp(options.gap, 0, 64);
    if (Object.prototype.hasOwnProperty.call(options, 'maxChars')) next.maxChars = clampInt(options.maxChars, 0, 512);
    if (Object.prototype.hasOwnProperty.call(options, 'maxRows')) next.maxRows = clampInt(options.maxRows, 1, 8);
    if (Object.prototype.hasOwnProperty.call(options, 'fontFamily')) {
      const family = String(options.fontFamily ?? '').trim();
      next.fontFamily = family || DEFAULT_FONT_FAMILY;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'fontSize')) next.fontSize = clamp(options.fontSize, 10, 32);
    if (Object.prototype.hasOwnProperty.call(options, 'scale')) next.scale = clamp(options.scale, 0.6, 3);
    if (Object.prototype.hasOwnProperty.call(options, 'continuousHeight')) next.continuousHeight = clamp(options.continuousHeight, 72, 320);
    if (Object.prototype.hasOwnProperty.call(options, 'zoomAwareSizeIn2D')) next.zoomAwareSizeIn2D = options.zoomAwareSizeIn2D !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'showPanel')) next.showPanel = options.showPanel === true;
    if (Object.prototype.hasOwnProperty.call(options, 'panelOpacity')) next.panelOpacity = clamp(options.panelOpacity, 0, 1);
    if (Object.prototype.hasOwnProperty.call(options, 'textOutline')) next.textOutline = options.textOutline !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'textOutlineWidth')) next.textOutlineWidth = clamp(options.textOutlineWidth, 0, 4);
    if (Object.prototype.hasOwnProperty.call(options, 'showNodeColor')) next.showNodeColor = options.showNodeColor !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'showDensity')) next.showDensity = options.showDensity !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'showEdgeColor')) next.showEdgeColor = options.showEdgeColor !== false;
    if (Object.prototype.hasOwnProperty.call(options, 'showNodeSize')) next.showNodeSize = options.showNodeSize === true;
    if (Object.prototype.hasOwnProperty.call(options, 'showEdgeWidth')) next.showEdgeWidth = options.showEdgeWidth === true;
    if (Object.prototype.hasOwnProperty.call(options, 'placements')) {
      next.placements = normalizePlacements({ ...next.placements, ...options.placements });
    }
    this._config = next;
  }

  update() {
    if (!this.group || !this.helios) return false;
    if (this._config.enabled !== true) {
      this._clear();
      return false;
    }
    const size = this.helios.size ?? this.helios.layers?.size ?? { width: 1, height: 1 };
    const safeRect = safeRectFromSize(
      size,
      typeof this.helios.overlayInsets === 'function' ? this.helios.overlayInsets() : null,
      this._config,
    );
    const items = deriveLegendItems({
      nodeChannels: combineMapperChannels(this.helios.nodeMapper),
      edgeChannels: combineMapperChannels(this.helios.edgeMapper),
      densityConfig: typeof this.helios.density === 'function' ? this.helios.density() : null,
      densityRuntime: this.helios._densityRuntime ?? null,
      visualConfig: this.helios.network?.__heliosVisualConfig ?? null,
      network: this.helios.network ?? null,
      config: this._config,
      legendRuntime: {
        enabled: this._config.zoomAwareSizeIn2D !== false,
        mode: typeof this.helios.mode === 'function' ? this.helios.mode() : this.helios.options?.mode,
        projection: this.helios.renderer?.camera?.projection ?? null,
        zoom: this.helios.renderer?.camera?.zoom ?? 1,
        distance: this.helios.renderer?.camera?.distance ?? 1,
        viewportHeight: size?.height ?? 1,
        nodeSizeBase: typeof this.helios.nodeSizeBase === 'function' ? this.helios.nodeSizeBase() : 0,
        nodeSizeScale: typeof this.helios.nodeSizeScale === 'function' ? this.helios.nodeSizeScale() : 1,
        semanticZoomExponent: typeof this.helios.semanticZoomExponent === 'function' ? this.helios.semanticZoomExponent() : 0,
      },
    });
    if (!items.length) {
      this._clear();
      return false;
    }
    const positioned = layoutLegendItems(items, safeRect, this._config);
    const signature = JSON.stringify({
      positioned,
      safeRect,
      insets: typeof this.helios.overlayInsets === 'function' ? this.helios.overlayInsets() : null,
      background: this.helios.background?.() ?? null,
      config: this._config,
    });
    if (signature === this._lastSignature) return false;
    this._lastSignature = signature;
    this._render(positioned);
    return true;
  }

  _clear() {
    this._lastSignature = '';
    if (!this.group) return;
    for (const child of Array.from(this.group.children)) {
      if (child !== this.defs) child.remove();
    }
    this.defs?.replaceChildren?.();
  }

  _theme() {
    const background = this.helios?.background?.();
    const color = Array.isArray(background) || ArrayBuffer.isView(background) ? background : [0, 0, 0, 1];
    const luminance = (0.2126 * toFinite(color[0], 0)) + (0.7152 * toFinite(color[1], 0)) + (0.0722 * toFinite(color[2], 0));
    if (luminance > 0.55) {
      return {
        panelFill: withAlpha('rgba(252, 253, 255, 1)', this._config.panelOpacity),
        panelStroke: withAlpha('rgba(20, 24, 32, 1)', Math.min(0.26, this._config.panelOpacity + 0.08)),
        text: 'rgba(16, 20, 28, 0.96)',
        textOutline: 'rgba(255, 255, 255, 0.96)',
        barOuterStroke: 'rgba(255, 255, 255, 0.98)',
        barOuterWidth: 2.6,
        barInnerStroke: 'rgba(16, 20, 28, 0.96)',
        barInnerWidth: 1.25,
        tickOutline: 'rgba(255, 255, 255, 0.96)',
        accentOuter: 'rgba(255, 255, 255, 0.98)',
        accentInner: 'rgba(16, 20, 28, 0.96)',
        muted: 'rgba(16, 20, 28, 0.74)',
        guide: 'rgba(16, 20, 28, 0.6)',
      };
    }
    return {
      panelFill: withAlpha('rgba(14, 18, 24, 1)', this._config.panelOpacity),
      panelStroke: withAlpha('rgba(255, 255, 255, 1)', Math.min(0.22, this._config.panelOpacity + 0.08)),
      text: 'rgba(246, 248, 252, 0.96)',
      textOutline: 'rgba(5, 8, 12, 0.96)',
      barOuterStroke: 'rgba(5, 8, 12, 0.96)',
      barOuterWidth: 2.6,
      barInnerStroke: 'rgba(255, 255, 255, 0.98)',
      barInnerWidth: 1.25,
      tickOutline: 'rgba(5, 8, 12, 0.96)',
      accentOuter: 'rgba(255, 255, 255, 0.98)',
      accentInner: 'rgba(5, 8, 12, 0.96)',
      muted: 'rgba(246, 248, 252, 0.8)',
      guide: 'rgba(255, 255, 255, 0.74)',
    };
  }

  _createTextElement({
    x,
    y,
    lines,
    fill,
    fontWeight = '400',
    fontSize = this._config.fontSize,
    anchor = 'start',
    baseline = 'hanging',
    rotation = null,
  }) {
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', `${x}`);
    text.setAttribute('y', `${y}`);
    text.setAttribute('fill', fill);
    text.setAttribute('font-family', this._config.fontFamily);
    text.setAttribute('font-size', `${fontSize}`);
    text.setAttribute('font-weight', fontWeight);
    text.setAttribute('text-anchor', anchor);
    text.setAttribute('dominant-baseline', baseline);
    if (rotation != null) text.setAttribute('transform', `rotate(${rotation}, ${x}, ${y})`);
    const safeLines = Array.isArray(lines) ? lines : [String(lines ?? '')];
    safeLines.forEach((line, index) => {
      const tspan = document.createElementNS(SVG_NS, 'tspan');
      tspan.setAttribute('x', `${x}`);
      tspan.setAttribute('dy', `${index === 0 ? 0 : fontSize * 1.2}`);
      tspan.textContent = String(line ?? '');
      text.appendChild(tspan);
    });
    return text;
  }

  _appendText(group, {
    x,
    y,
    lines,
    fill,
    outline = null,
    fontWeight = '400',
    fontSize = this._config.fontSize,
    anchor = 'start',
    baseline = 'hanging',
    rotation = null,
  }) {
    const appended = [];
    if (this._config.textOutline !== false && outline) {
      const outlineText = this._createTextElement({
        x, y, lines, fill: outline, fontWeight, fontSize, anchor, baseline, rotation,
      });
      outlineText.setAttribute('stroke', outline);
      outlineText.setAttribute('stroke-width', `${Math.max(0, this._config.textOutlineWidth) * 2}`);
      outlineText.setAttribute('stroke-linejoin', 'round');
      outlineText.setAttribute('paint-order', 'stroke');
      group.appendChild(outlineText);
      appended.push(outlineText);
    }
    const text = this._createTextElement({
      x, y, lines, fill, fontWeight, fontSize, anchor, baseline, rotation,
    });
    group.appendChild(text);
    appended.push(text);
    return appended;
  }

  _render(positioned) {
    this._clear();
    if (!this.group) return;
    const theme = this._theme();
    for (const item of positioned) {
      const legendGroup = document.createElementNS(SVG_NS, 'g');
      legendGroup.setAttribute('class', 'helios-legend');
      legendGroup.dataset.legendKind = item.kind;
      legendGroup.setAttribute('transform', `translate(${item.x}, ${item.y})`);

      if (this._config.showPanel === true) {
        const panel = document.createElementNS(SVG_NS, 'rect');
        panel.dataset.legendFrame = 'true';
        panel.setAttribute('width', `${item.box.width}`);
        panel.setAttribute('height', `${item.box.height}`);
        panel.setAttribute('rx', '6');
        panel.setAttribute('ry', '6');
        panel.setAttribute('fill', theme.panelFill);
        panel.setAttribute('stroke', theme.panelStroke);
        legendGroup.appendChild(panel);
      }

      if (item.legendType === 'categorical') this._renderCategoricalLegend(legendGroup, item, theme);
      else if (item.legendType === 'scalar') this._renderScalarLegend(legendGroup, item, theme);
      else this._renderContinuousLegend(legendGroup, item, theme);

      this.group.appendChild(legendGroup);
    }
  }

  _renderCategoricalLegend(group, item, theme) {
    const metrics = legendMetrics(this._config);
    this._appendText(group, {
      x: metrics.paddingX,
      y: metrics.paddingY,
      lines: item.titleLines,
      fill: theme.text,
      outline: theme.textOutline,
      fontWeight: '600',
      fontSize: metrics.fontSize,
    });
    let y = metrics.paddingY + (item.titleLines.length * metrics.lineHeight) + (item.entries.length ? metrics.titleGap : 0);
    for (const entry of item.entries) {
      const rowHeight = Math.max(metrics.swatchSize, entry.lines.length * metrics.lineHeight);
      const singleLine = entry.lines.length === 1;
      const firstLineCenterY = y + (metrics.fontSize * 0.68);
      const rowCenterY = y + (rowHeight * 0.5);
      const swatchY = singleLine
        ? rowCenterY - (metrics.swatchSize * 0.5)
        : firstLineCenterY - (metrics.swatchSize * 0.5);
      const swatch = document.createElementNS(SVG_NS, 'rect');
      swatch.setAttribute('x', `${metrics.paddingX}`);
      swatch.setAttribute('y', `${swatchY}`);
      swatch.setAttribute('width', `${metrics.swatchSize}`);
      swatch.setAttribute('height', `${metrics.swatchSize}`);
      swatch.setAttribute('rx', '3');
      swatch.setAttribute('ry', '3');
      swatch.setAttribute('fill', entry.color);
      swatch.setAttribute('stroke', withAlpha(theme.textOutline, 0.35));
      group.appendChild(swatch);
      this._appendText(group, {
        x: metrics.paddingX + metrics.swatchSize + metrics.swatchGap,
        y: (singleLine ? rowCenterY : firstLineCenterY) + (metrics.fontSize * 0.34),
        lines: entry.lines,
        fill: theme.text,
        outline: theme.textOutline,
        fontSize: metrics.fontSize,
        baseline: 'alphabetic',
      });
      y += rowHeight + metrics.entryGap;
    }
  }

  _renderContinuousLegend(group, item, theme) {
    const metrics = legendMetrics(this._config);
    const titleText = item.titleLines.join(' ').trim();
    const barX = metrics.paddingX + metrics.fontSize + metrics.continuousTitleGap;
    const barY = metrics.paddingY + Math.max(0, (item.box.height - (metrics.paddingY * 2) - metrics.barHeight) * 0.5);
    const barHeight = metrics.barHeight;
    this._appendText(group, {
      x: metrics.paddingX + (metrics.fontSize * 0.5),
      y: barY + barHeight,
      lines: [titleText],
      fill: theme.text,
      outline: theme.textOutline,
      fontWeight: '600',
      fontSize: metrics.fontSize,
      anchor: 'start',
      baseline: 'middle',
      rotation: -90,
    });
    const gradientId = `helios-legend-gradient-${item.kind}-${Math.random().toString(36).slice(2, 8)}`;
    const gradient = document.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '100%');
    gradient.setAttribute('x2', '0%');
    gradient.setAttribute('y2', '0%');
    const scale = createColormapScale(item.colormap, { domain: item.domain, clamp: true });
    const steps = item.divergent ? [0, 0.5, 1] : [0, 0.2, 0.4, 0.6, 0.8, 1];
    steps.forEach((step) => {
      const stop = document.createElementNS(SVG_NS, 'stop');
      const value = (item.domain[0] ?? 0) + ((item.domain[1] ?? 1) - (item.domain[0] ?? 0)) * step;
      stop.setAttribute('offset', `${step * 100}%`);
      stop.setAttribute('stop-color', rgbaArrayToCss(scale(value)));
      gradient.appendChild(stop);
    });
    this.defs.appendChild(gradient);

    const bar = document.createElementNS(SVG_NS, 'rect');
    bar.setAttribute('x', `${barX}`);
    bar.setAttribute('y', `${barY}`);
    bar.setAttribute('width', `${metrics.barWidth}`);
    bar.setAttribute('height', `${barHeight}`);
    bar.setAttribute('rx', '2');
    bar.setAttribute('ry', '2');
    bar.setAttribute('fill', `url(#${gradientId})`);
    group.appendChild(bar);

    const barOuter = document.createElementNS(SVG_NS, 'rect');
    barOuter.setAttribute('x', `${barX}`);
    barOuter.setAttribute('y', `${barY}`);
    barOuter.setAttribute('width', `${metrics.barWidth}`);
    barOuter.setAttribute('height', `${barHeight}`);
    barOuter.setAttribute('rx', '2');
    barOuter.setAttribute('ry', '2');
    barOuter.setAttribute('fill', 'none');
    barOuter.setAttribute('stroke', theme.barOuterStroke);
    barOuter.setAttribute('stroke-width', `${theme.barOuterWidth ?? 2.25}`);
    group.appendChild(barOuter);

    const barInner = document.createElementNS(SVG_NS, 'rect');
    barInner.setAttribute('x', `${barX}`);
    barInner.setAttribute('y', `${barY}`);
    barInner.setAttribute('width', `${metrics.barWidth}`);
    barInner.setAttribute('height', `${barHeight}`);
    barInner.setAttribute('rx', '2');
    barInner.setAttribute('ry', '2');
    barInner.setAttribute('fill', 'none');
    barInner.setAttribute('stroke', theme.barInnerStroke);
    barInner.setAttribute('stroke-width', `${theme.barInnerWidth ?? 1.5}`);
    group.appendChild(barInner);

    const lo = Number(item.domain?.[0] ?? 0);
    const hi = Number(item.domain?.[1] ?? 1);
    const span = hi - lo || 1;
    (item.ticks ?? []).forEach((tick, index) => {
      const normalized = clamp((Number(tick) - lo) / span, 0, 1);
      const y = barY + barHeight - (normalized * barHeight);
      const tickStart = barX - 1;
      const tickEnd = barX + metrics.barWidth + metrics.tickGap + metrics.tickLength;
      const tickOutline = document.createElementNS(SVG_NS, 'line');
      tickOutline.setAttribute('x1', `${tickStart}`);
      tickOutline.setAttribute('x2', `${tickEnd}`);
      tickOutline.setAttribute('y1', `${y}`);
      tickOutline.setAttribute('y2', `${y}`);
      tickOutline.setAttribute('stroke', theme.tickOutline);
      tickOutline.setAttribute('stroke-width', '3');
      tickOutline.setAttribute('stroke-linecap', 'round');
      group.appendChild(tickOutline);
      const tickLine = document.createElementNS(SVG_NS, 'line');
      tickLine.setAttribute('x1', `${tickStart}`);
      tickLine.setAttribute('x2', `${tickEnd}`);
      tickLine.setAttribute('y1', `${y}`);
      tickLine.setAttribute('y2', `${y}`);
      tickLine.setAttribute('stroke', theme.text);
      tickLine.setAttribute('stroke-width', '1.5');
      tickLine.setAttribute('stroke-linecap', 'round');
      group.appendChild(tickLine);
      this._appendText(group, {
        x: tickEnd + metrics.labelGap,
        y,
        lines: [item.tickLabels?.[index] ?? formatNumber(tick)],
        fill: theme.text,
        fontSize: Math.max(10, metrics.fontSize - 1),
        outline: theme.textOutline,
        baseline: 'middle',
      });
    });
  }

  _renderScalarLegend(group, item, theme) {
    const metrics = legendMetrics(this._config, { ignoreScale: Boolean(item.preview) });
    const labelFontSize = Math.max(10, metrics.fontSize - 1);
    const titleText = item.titleLines.join(' ').trim();
    const minRange = Math.min(Number(item.range?.[0] ?? 0), Number(item.range?.[1] ?? 1));
    const maxRange = Math.max(Number(item.range?.[0] ?? 0), Number(item.range?.[1] ?? 1));
    const previewBase = Number(item.preview?.base ?? 0);
    const previewScale = Number(item.preview?.scale ?? 1);
    const domainMin = Number(item.domain?.[0] ?? 0);
    const domainMax = Number(item.domain?.[1] ?? 1);
    const sampleCount = item.box.width >= 116 ? 3 : 2;
    const samples = scalarSampleValues(item.domain, sampleCount, {
      omitZeroMin: item.shape === 'line',
      readableMinRatio: item.shape === 'line' ? 0.2 : 0,
    });
    const rangeSpan = Math.max(1e-9, maxRange - minRange);
    const maxRadius = Math.min(26, (item.box.width - (metrics.paddingX * 2)) * 0.48);
    const minRadius = Math.max(6, maxRadius * 0.28);
    const radii = samples.map((sample) => {
      if (samples.length === 1) return maxRadius;
      const t = (sample - domainMin) / Math.max(1e-9, domainMax - domainMin || 1);
      const source = minRange + (rangeSpan * t);
      const apparentDiameter = item.preview
        ? Math.max(1, previewBase + previewScale * Math.max(0, source))
        : null;
      if (apparentDiameter != null) return clamp(apparentDiameter * 0.5, minRadius, maxRadius);
      return clamp(minRadius + ((source - minRange) / rangeSpan) * (maxRadius - minRadius), minRadius, maxRadius);
    });
    const cx = item.box.width * 0.5;

    if (item.shape === 'circle') {
      const labelMaxY = metrics.paddingY + metrics.scalarBaselineOffset + 8;
      const visualY = labelMaxY + 16;
      const baselineY = visualY + Math.max(...radii) + 2;
      samples
        .map((sample, index) => ({ sample, radius: radii[index] }))
        .sort((a, b) => b.radius - a.radius)
        .forEach(({ radius }) => {
          const circle = document.createElementNS(SVG_NS, 'circle');
          circle.setAttribute('cx', `${cx}`);
          circle.setAttribute('cy', `${baselineY - radius}`);
          circle.setAttribute('r', `${radius}`);
          circle.setAttribute('fill', 'rgba(24, 28, 36, 0.26)');
          circle.setAttribute('stroke', withAlpha(theme.accentOuter, 0.85));
          circle.setAttribute('stroke-width', '2');
          group.appendChild(circle);
        });
      samples
        .map((sample, index) => ({ sample, radius: radii[index] }))
        .sort((a, b) => b.radius - a.radius)
        .forEach(({ sample, radius }) => {
          this._appendText(group, {
            x: cx,
            y: baselineY - (radius * 2) - 8,
            lines: [formatNumber(sample)],
            fill: theme.text,
            outline: theme.textOutline,
            fontSize: labelFontSize,
            anchor: 'middle',
            baseline: 'middle',
          });
        });

      this._appendText(group, {
        x: cx,
        y: baselineY + 18,
        lines: [titleText],
        fill: theme.text,
        outline: theme.textOutline,
        fontWeight: '600',
        fontSize: metrics.fontSize,
        anchor: 'middle',
        baseline: 'middle',
      });
      return;
    }

    const lineLength = Math.max(32, Math.min(item.box.width - (metrics.paddingX * 2), metrics.scalarWidth * 0.56));
    const topY = metrics.paddingY + labelFontSize;
    const entries = samples
      .map((sample) => {
        const t = (sample - domainMin) / Math.max(1e-9, domainMax - domainMin || 1);
        const source = minRange + (rangeSpan * t);
        return {
          sample,
          strokeWidth: clamp(source, 1.5, 12),
        };
      })
      .sort((a, b) => b.sample - a.sample);

    let cursorY = topY;
    entries.forEach((entry, index) => {
      const labelY = cursorY;
      const lineY = labelY + Math.max(8, labelFontSize * 0.82);
      this._appendText(group, {
        x: cx,
        y: labelY,
        lines: [formatNumber(entry.sample)],
        fill: theme.text,
        outline: theme.textOutline,
        fontSize: labelFontSize,
        anchor: 'middle',
        baseline: 'middle',
      });
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', `${cx - lineLength * 0.5}`);
      line.setAttribute('x2', `${cx + lineLength * 0.5}`);
      line.setAttribute('y1', `${lineY}`);
      line.setAttribute('y2', `${lineY}`);
      line.setAttribute('stroke', theme.text);
      line.setAttribute('stroke-width', `${entry.strokeWidth}`);
      line.setAttribute('stroke-linecap', 'square');
      group.appendChild(line);

      const nextStrokeWidth = entries[index + 1]?.strokeWidth ?? 0;
      cursorY = lineY + (entry.strokeWidth * 0.5) + (nextStrokeWidth * 0.5) + labelFontSize + 4;
    });

    const titleY = cursorY - 2;
    this._appendText(group, {
      x: cx,
      y: titleY,
      lines: [titleText],
      fill: theme.text,
      outline: theme.textOutline,
      fontWeight: '600',
      fontSize: metrics.fontSize,
      anchor: 'middle',
      baseline: 'middle',
    });
  }
}

export default SvgLegendController;
