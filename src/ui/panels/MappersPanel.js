import { AttributeType } from 'helios-network';
import { PanelStack } from './PanelStack.js';
import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { createTooltipManager } from '../controls/createTooltipManager.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { TwoHandleRange } from '../controls/TwoHandleRange.js';
import { LogSliderControls } from '../controls/LogSliderControls.js';
import { ColormapPickerControl } from '../controls/ColormapPickerControl.js';
import { colormaps, resolveColormap, colormapToScheme } from '../../colors/colormaps.js';
import { VISUAL_ATTRIBUTE_MAP } from '../../pipeline/constants.js';
import { clampNumber } from '../utils/numbers.js';
import { toHex8 } from '../utils/colors.js';
import { isPublicAttributeName } from '../utils/attributes.js';
import { shallowCloneChannelConfig } from '../utils/channelConfig.js';

function buildColormapCatalog() {
  const entries = [];

  const pushEntry = ({ key, label, group, searchExtras = [] }) => {
    if (!key) return;
    const safeLabel = String(label ?? key);
    const terms = new Set([
      String(key),
      safeLabel,
      String(group ?? ''),
      String(group ?? '').toLowerCase(),
      ...searchExtras.map((v) => String(v)),
      ...searchExtras.map((v) => String(v).toLowerCase()),
    ]);
    entries.push({
      key: String(key),
      label: safeLabel,
      group: String(group ?? 'other'),
      search: Array.from(terms).join(' ').toLowerCase(),
    });
  };

  for (const [key, desc] of Object.entries(colormaps?.d3 ?? {})) {
    if (desc?.isScheme) continue;
    if (key.startsWith('scheme')) continue;
    const label = key.startsWith('interpolate') ? key.slice('interpolate'.length) : key;
    pushEntry({ key, label, group: 'd3', searchExtras: ['d3:', 'interpolate', 'scheme'] });
  }

  for (const [key, desc] of Object.entries(colormaps?.cmasher ?? {})) {
    if (desc?.isScheme) continue;
    const label = key.startsWith('cmasher_') ? key.slice('cmasher_'.length) : key;
    const alias = key.startsWith('cmasher_') ? `cmasher:${label}` : key;
    pushEntry({ key: alias, label, group: 'cmasher', searchExtras: [key, 'cmasher:', 'cmasher_'] });
  }

  for (const [key, desc] of Object.entries(colormaps?.CET ?? {})) {
    if (desc?.isScheme) continue;
    const label = key.startsWith('CET_') ? key.slice('CET_'.length) : key;
    pushEntry({ key, label, group: 'CET', searchExtras: ['CET:'] });
  }

  for (const [key, desc] of Object.entries(colormaps?.helios ?? {})) {
    if (desc?.isScheme) continue;
    pushEntry({ key, label: key, group: 'helios', searchExtras: ['helios:'] });
  }

  const byGroup = new Map();
  const byKey = new Map();
  for (const entry of entries) {
    let list = byGroup.get(entry.group);
    if (!list) {
      list = [];
      byGroup.set(entry.group, list);
    }
    list.push(entry);
    byKey.set(entry.key, entry);
  }

  for (const list of byGroup.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  return { entries, byGroup, byKey };
}

function buildCategoricalPaletteCatalog() {
  const entries = [];
  const pushEntry = ({ key, label, group, isScheme }) => {
    if (!key) return;
    entries.push({ key, label: String(label ?? key), group: String(group ?? 'other'), isScheme: Boolean(isScheme) });
  };

  for (const [key, desc] of Object.entries(colormaps?.d3 ?? {})) {
    const isScheme = Boolean(desc?.isScheme);
    const label = key.startsWith('scheme') ? key.slice('scheme'.length) : key;
    pushEntry({ key, label, group: isScheme ? 'd3 schemes' : 'd3 ramps', isScheme });
  }

  for (const [key, desc] of Object.entries(colormaps?.cmasher ?? {})) {
    const isScheme = Boolean(desc?.isScheme);
    const label = key.startsWith('cmasher_') ? key.slice('cmasher_'.length) : key;
    const alias = key.startsWith('cmasher_') ? `cmasher:${label}` : key;
    pushEntry({ key: alias, label, group: isScheme ? 'cmasher schemes' : 'cmasher ramps', isScheme });
  }

  for (const [key, desc] of Object.entries(colormaps?.CET ?? {})) {
    const isScheme = Boolean(desc?.isScheme);
    const label = key.startsWith('CET_') ? key.slice('CET_'.length) : key;
    pushEntry({ key, label, group: isScheme ? 'CET schemes' : 'CET ramps', isScheme });
  }

  for (const [key, desc] of Object.entries(colormaps?.helios ?? {})) {
    const isScheme = Boolean(desc?.isScheme);
    pushEntry({ key, label: key, group: isScheme ? 'helios schemes' : 'helios ramps', isScheme });
  }

  entries.sort((a, b) => a.label.localeCompare(b.label));
  return entries;
}

function isHexColorString(value) {
  if (typeof value !== 'string') return false;
  const hex = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex);
}

function rgbaToHex8(rgba) {
  if (!Array.isArray(rgba) && !ArrayBuffer.isView(rgba)) return '#000000ff';
  const r = Math.round(Math.max(0, Math.min(1, Number(rgba[0] ?? 0))) * 255);
  const g = Math.round(Math.max(0, Math.min(1, Number(rgba[1] ?? 0))) * 255);
  const b = Math.round(Math.max(0, Math.min(1, Number(rgba[2] ?? 0))) * 255);
  const a = Math.round(Math.max(0, Math.min(1, Number(rgba[3] ?? 1))) * 255);
  return `#${[r, g, b, a].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function colorFromIndex(index = 0) {
  const hue = (index * 137.508) % 360;
  const s = 0.6;
  const l = 0.55;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + hue / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return `#${[f(0), f(8), f(4), 255].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function naturalCompare(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  const re = /\d+|\D+/g;
  const aParts = left.match(re) ?? [];
  const bParts = right.match(re) ?? [];
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const av = aParts[i] ?? '';
    const bv = bParts[i] ?? '';
    const aNum = Number(av);
    const bNum = Number(bv);
    const aIsNum = av && Number.isFinite(aNum);
    const bIsNum = bv && Number.isFinite(bNum);
    if (aIsNum && bIsNum && aNum !== bNum) return aNum - bNum;
    if (aIsNum !== bIsNum) return aIsNum ? -1 : 1;
    if (av !== bv) return av.localeCompare(bv);
  }
  return left.localeCompare(right);
}

const isNumericAttributeType = (type) =>
  type === AttributeType.Boolean ||
  type === AttributeType.Float ||
  type === AttributeType.Integer ||
  type === AttributeType.UnsignedInteger ||
  type === AttributeType.Double ||
  type === AttributeType.BigInteger ||
  type === AttributeType.UnsignedBigInteger;
const isIntegerAttributeType = (type) =>
  type === AttributeType.Integer ||
  type === AttributeType.UnsignedInteger ||
  type === AttributeType.BigInteger ||
  type === AttributeType.UnsignedBigInteger;
const isCategoricalAttributeType = (type) => type === AttributeType.Category;
const isStringAttributeType = (type) => type === AttributeType.String;

export class MappersPanel {
  constructor(ui, options = {}) {
    this.ui = ui;
    this.helios = ui?.helios ?? null;
    this.options = options;
  }

  create() {
    const ui = this.ui;
    const helios = this.helios;
    const net = () => helios?.network ?? null;
    const options = this.options ?? {};
    const showDistributions = options.showDistributions !== false;

    const tooltips = createTooltipManager();
    ui._controlCleanups.add(() => tooltips.destroy());

    const createAlignedRow = ({ title, hint, controls }) => createAlignedRowEl({
      title,
      hint,
      controls,
      attachTooltip: tooltips.attachTooltip,
    });

      const createAlignedActionRow = ({ title, hint, controls, action }) => {
      const row = document.createElement('div');
      row.className = 'helios-ui-row helios-ui-row--aligned';
      const label = document.createElement('div');
      label.className = 'helios-ui-label';
      const titleRowEl = document.createElement('div');
      titleRowEl.className = 'helios-ui-label__title-row';
      const titleEl = document.createElement('div');
      titleEl.className = 'helios-ui-label__title';
      titleEl.textContent = title ?? '';
      titleRowEl.appendChild(titleEl);
      if (action) titleRowEl.appendChild(action);
      label.appendChild(titleRowEl);
      if (hint) tooltips.attachTooltip?.(titleEl, hint);

      row.appendChild(label);
      const controlWrap = document.createElement('div');
      controlWrap.className = 'helios-ui-row__controls';
      if (controls) controlWrap.appendChild(controls);
      row.appendChild(controlWrap);
      return { row, titleEl, controlWrap };
    };

    const CHANNEL_LABELS = {
      color: 'Color',
      size: 'Size',
      outline: 'Outline Width',
      outlineColor: 'Outline Color',
      position: 'Position',
      width: 'Width',
      opacity: 'Opacity',
      endpointPosition: 'Endpoint Position',
      endpointSize: 'Endpoint Size',
    };

    const MAPPER_TYPE_LABELS = {
      layout: 'Layout',
      constant: 'Constant',
      passthrough: 'Passthrough',
      nodeAttribute: 'Node Passthrough',
      nodeToEdge: 'Node Passthrough',
      linear: 'Scale',
      colormap: 'Colormap',
      categorical: 'Categorical',
    };

    const nodeChannels = ['color', 'size', 'outline', 'outlineColor', 'position'];
    // Edge endpoint channels are node-derived and intentionally not exposed in the UI.
    const edgeChannels = ['color', 'width', 'opacity'];

    const colormapCatalog = buildColormapCatalog();
    const categoricalPaletteCatalog = buildCategoricalPaletteCatalog();
    const defaultCategoricalPalette =
      categoricalPaletteCatalog.find((entry) => entry.isScheme)?.key || 'schemeTableau10';

    let customPresetCounter = 1;
    const customPresetsByMode = {
      node: new Map(),
      edge: new Map(),
    };

    const getCustomPresetMap = (mode, channel) => {
      const modeMap = customPresetsByMode[mode];
      if (!modeMap) return new Map();
      let byChannel = modeMap.get(channel);
      if (!byChannel) {
        byChannel = new Map();
        modeMap.set(channel, byChannel);
      }
      return byChannel;
    };

	    const isEditorTransferableConfig = (config) => {
	      if (!config) return false;
	      const type = config.type ?? config.mode ?? null;
	      if (type === 'layout') return true;
	      if (type === 'nodeToEdge') return true;

	      const rules = Array.isArray(config.rules) ? config.rules : [];
	      const supportedRules =
	        rules.length === 0 ||
	        rules.every((rule) => {
	          const ui = rule?.__ui && typeof rule.__ui === 'object' ? rule.__ui : null;
	          if (!ui) return false;
	          if (typeof rule.when !== 'function') return false;
	          // MVP: constant output rules only.
	          return rule.value !== undefined;
	        });
	      if (!supportedRules) return false;

      // Any custom function makes the config non-roundtrippable for now.
      if (typeof config.transform === 'function' && !config.transformType) return false;
      if (typeof config.scale === 'function') return false;

      // Cache/internal fields like __colormapScale are ignored.
      if (type === 'constant') return true;
      if (type === 'passthrough') return true;
      if (type === 'linear') return true;
      if (type === 'nodeAttribute') return true;
      if (type === 'categorical') return true;

      if (type === 'colormap' || config.colormap) {
        // Only support selecting named colormaps in the editor for now.
        return typeof (config.colormap ?? config.scale ?? config.range) === 'string';
      }

      return false;
    };

    const isEphemeralCustomPreset = (config) => {
      if (!config) return false;
      if (isEditorTransferableConfig(config)) return false;
      const meta = config.meta && typeof config.meta === 'object' ? config.meta : null;
      if (!meta) return true;
      const keys = Object.keys(meta);
      if (!keys.length) return true;
      const hasLabel =
        (typeof meta.name === 'string' && meta.name.trim()) ||
        (typeof meta.source === 'string' && meta.source.trim()) ||
        (typeof meta.description === 'string' && meta.description.trim());
      return !hasLabel;
    };

    const registerCustomPreset = (mode, channel, config) => {
      if (!config) return null;
      const meta = config.meta && typeof config.meta === 'object' ? config.meta : {};
      const preferredName = typeof meta.name === 'string' ? meta.name.trim() : '';
      const baseId = preferredName || `custom-${customPresetCounter++}`;
      const ephemeral = isEphemeralCustomPreset(config);

      const byId = getCustomPresetMap(mode, channel);
      let id = baseId;
      if (byId.has(id)) {
        const existing = byId.get(id);
        if (existing?.config === config) return id;
        let n = 2;
        while (byId.has(`${baseId} (${n})`)) n += 1;
        id = `${baseId} (${n})`;
      }

      byId.set(id, {
        id,
        label: preferredName || 'custom',
        ephemeral,
        config: shallowCloneChannelConfig(config) ?? config,
      });
      return id;
    };

    const pruneEphemeralCustomPresets = (mode, channel) => {
      const byId = getCustomPresetMap(mode, channel);
      for (const [id, preset] of byId.entries()) {
        if (preset?.ephemeral) byId.delete(id);
      }
    };

    const resolveVisualAlias = (name) => {
      if (typeof name !== 'string') return name;
      return VISUAL_ATTRIBUTE_MAP[name] ?? name;
    };

    const getAttributeInfo = (scope, rawName) => {
      const network = net();
      if (!network) return null;
      if (rawName === '$index') return { dimension: 1, type: null };
      if (typeof rawName !== 'string' || !rawName.length) return null;

      if (scope === 'edge' && rawName.startsWith('@node.')) {
        const key = rawName.slice('@node.'.length);
        const resolved = resolveVisualAlias(key);
        try {
          return network.getNodeAttributeInfo?.(resolved) ?? null;
        } catch (_) {
          return null;
        }
      }

      const resolved = resolveVisualAlias(rawName);
      try {
        return scope === 'edge'
          ? (network.getEdgeAttributeInfo?.(resolved) ?? null)
          : (network.getNodeAttributeInfo?.(resolved) ?? null);
      } catch (_) {
        return null;
      }
    };

    const isCompatibleAttribute = (scope, channel, mapperType, name, { targetMode } = {}) => {
      const info = getAttributeInfo(scope, name);
      if (!info) return false;
      const dim = info.dimension ?? 1;
      if (mapperType === 'categorical') {
        if (scope === 'edge' && typeof name === 'string' && /^@nodes?\./.test(name)) return false;
        if (dim !== 1) return false;
        return isCategoricalAttributeType(info.type) || isStringAttributeType(info.type);
      }

      if (info.type != null && !isNumericAttributeType(info.type)) return false;
      const isEdge = scope === 'edge';
      const edgeContext = isEdge || targetMode === 'edge';
      const isColorChannel = channel === 'color' || channel === 'outlineColor';
      const isPositionChannel = scope === 'node' && channel === 'position';
      const isScalarChannel =
        channel === 'size' ||
        channel === 'outline' ||
        channel === 'width' ||
        channel === 'opacity' ||
        channel === 'endpointSize';
      const isEdgeEndpointPosition = channel === 'endpointPosition';

      if (mapperType === 'colormap') {
        return dim === 1;
      }

      if (mapperType === 'linear') {
        return dim === 1;
      }

      if (mapperType === 'nodeAttribute') {
        if (isColorChannel) {
          if (edgeContext) return dim === 4;
          return dim === 3 || dim === 4;
        }
        if (isScalarChannel) return dim === 1;
        return false;
      }

      if (mapperType === 'passthrough') {
        if (isPositionChannel) {
          return dim === 3;
        }
        if (isColorChannel) {
          if (isEdge && typeof name === 'string' && /^@nodes?\./.test(name)) return false;
          if (isEdge) return dim === 4 || dim === 8;
          return dim === 3 || dim === 4;
        }
        if (isEdgeEndpointPosition) {
          return isEdge && dim === 6;
        }
        if (isScalarChannel) {
          if (isEdge) return dim === 1 || dim === 2;
          return dim === 1;
        }
        return false;
      }

      return true;
    };

    const listAttributeNames = (scope, { channel, mapperType, targetMode } = {}) => {
      const network = net();
      if (!network) return [];
      const getNames = scope === 'edge' ? network.getEdgeAttributeNames : network.getNodeAttributeNames;
      if (typeof getNames !== 'function') return [];
      let raw = [];
      try {
        raw = getNames.call(network) ?? [];
      } catch (_) {
        return [];
      }
      const out = [];

      out.push('$index');
      if (scope === 'node') {
        out.push('color', 'size', 'outline', 'outlineColor', 'position');
      }

      for (const name of raw) {
        if (typeof name !== 'string') continue;
        if (!isPublicAttributeName(name)) continue;
        out.push(name);
      }

      const wantsNodeProxy = scope === 'edge' && mapperType !== 'passthrough';
      if (wantsNodeProxy && typeof network.getNodeAttributeNames === 'function') {
        let nodeRaw = [];
        try {
          nodeRaw = network.getNodeAttributeNames() ?? [];
        } catch (_) {
          nodeRaw = [];
        }
        for (const name of nodeRaw) {
          if (typeof name !== 'string') continue;
          if (!isPublicAttributeName(name)) continue;
          out.push(`@node.${name}`);
        }
      }

      const unique = Array.from(new Set(out));
      unique.sort((a, b) => {
        if (a === '$index') return -1;
        if (b === '$index') return 1;
        return a.localeCompare(b);
      });

      if (channel && mapperType) {
        return unique.filter((name) => isCompatibleAttribute(scope, channel, mapperType, name, { targetMode }));
      }
      return unique;
    };

    const resolveCollection = (mode) => {
      if (!helios) return null;
      return mode === 'edge' ? helios.edgeMapper : helios.nodeMapper;
    };

    const computeScalarExtent = (scope, rawName) => {
      const network = net();
      if (!network) return null;
      if (typeof rawName !== 'string' || !rawName) return null;

      if (rawName === '$index') {
        const count = scope === 'edge'
          ? (network.edgeCount ?? network.edgesCount ?? null)
          : (network.nodeCount ?? network.nodesCount ?? null);
        if (Number.isFinite(count) && count > 0) return { min: 0, max: Math.max(0, count - 1), isInteger: true };
        return null;
      }

      const resolveName = (n) => resolveVisualAlias(n);
      const isNodeProxy = scope === 'edge' && rawName.startsWith('@node.');
      const name = isNodeProxy ? rawName.slice('@node.'.length) : rawName;
      const resolved = resolveName(name);
      const info = getAttributeInfo(scope, rawName);
      const integerType = info?.type != null && isIntegerAttributeType(info.type);
      const indices = scope === 'network'
        ? [0]
        : (isNodeProxy || scope === 'node')
          ? network.nodeIndices
          : network.edgeIndices;
      if (!indices || typeof indices.length !== 'number' || indices.length === 0) return null;

      const compute = () => {
        try {
          const buffer = isNodeProxy
            ? network.getNodeAttributeBuffer?.(resolved)
            : (scope === 'edge' ? network.getEdgeAttributeBuffer?.(resolved) : network.getNodeAttributeBuffer?.(resolved));

          const view = buffer?.view ?? null;
          if (!view || typeof view.length !== 'number' || view.length <= 0) return null;

          let min = Infinity;
          let max = -Infinity;
          for (let i = 0; i < indices.length; i += 1) {
            const idx = indices[i];
            const v = Number(view[idx]);
            if (!Number.isFinite(v)) continue;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
          if (integerType) {
            const minInt = Math.floor(min);
            const maxInt = Math.ceil(max);
            if (minInt === maxInt) return { min: minInt, max: minInt + 1, isInteger: true };
            return { min: minInt, max: maxInt, isInteger: true };
          }
          if (min === max) return { min, max: min + 1 };
          return { min, max };
        } catch (_) {
          return null;
        }
      };

      if (typeof network.withBufferAccess === 'function') {
        return network.withBufferAccess(compute);
      }
      return compute();
    };

    const suggestDomainForAttribute = (scope, rawName) => {
      const extent = computeScalarExtent(scope, rawName);
      if (extent && Number.isFinite(extent.min) && Number.isFinite(extent.max)) return [extent.min, extent.max];
      return [0, 1];
    };

    const resolveAttributeView = (scope, rawName) => {
      if (!rawName) return null;
      const network = net();
      if (!network) return null;
      const isNodeProxy = scope === 'edge' && rawName.startsWith('@node.');
      const name = isNodeProxy ? rawName.slice('@node.'.length) : rawName;
      try {
        const buffer = isNodeProxy
          ? network.getNodeAttributeBuffer?.(name)
          : (scope === 'edge' ? network.getEdgeAttributeBuffer?.(name) : network.getNodeAttributeBuffer?.(name));
        return buffer?.view ?? null;
      } catch (_) {
        return null;
      }
    };

    const CATEGORY_STRING_LIMITS = {
      maxLength: 128,
      maxUnique: 256,
      maxScan: 4000,
    };

    const scanStringCategorization = (scope, rawName) => {
      const network = net();
      if (!network) return { ok: false, reason: 'Network unavailable.' };
      const name = resolveVisualAlias(rawName);
      const read = scope === 'edge'
        ? network.getEdgeStringAttribute?.bind(network)
        : network.getNodeStringAttribute?.bind(network);
      if (typeof read !== 'function') return { ok: false, reason: 'String attribute access is unavailable.' };
      const indices = scope === 'edge' ? network.edgeIndices : network.nodeIndices;
      const limit = Math.min(indices?.length ?? 0, CATEGORY_STRING_LIMITS.maxScan);
      const uniques = new Set();
      let maxLength = 0;
      for (let i = 0; i < limit; i += 1) {
        const idx = indices[i];
        const value = read(name, idx);
        if (typeof value !== 'string') continue;
        const len = value.length;
        if (len > maxLength) maxLength = len;
        if (len > CATEGORY_STRING_LIMITS.maxLength) {
          return { ok: false, reason: `String values exceed ${CATEGORY_STRING_LIMITS.maxLength} characters.` };
        }
        if (value && value !== '__NA__') {
          uniques.add(value);
          if (uniques.size > CATEGORY_STRING_LIMITS.maxUnique) {
            return { ok: false, reason: `More than ${CATEGORY_STRING_LIMITS.maxUnique} unique values detected.` };
          }
        }
      }
      return { ok: true, uniqueCount: uniques.size, maxLength };
    };

    const resolveCategoryDictionary = (scope, rawName) => {
      const network = net();
      if (!network) return [];
      if (typeof rawName !== 'string' || !rawName) return [];
      const name = resolveVisualAlias(rawName);
      try {
        const getter = scope === 'edge'
          ? network.getEdgeAttributeCategoryDictionary
          : network.getNodeAttributeCategoryDictionary;
        if (typeof getter !== 'function') return [];
        const dict = getter.call(network, name);
        return Array.isArray(dict?.entries) ? dict.entries : [];
      } catch (_) {
        return [];
      }
    };

    const computeCategoryCounts = (scope, rawName) => {
      const network = net();
      if (!network) return { counts: new Map(), unknownCount: 0 };
      const isNodeProxy = scope === 'edge' && rawName?.startsWith('@node.');
      const indices = scope === 'network'
        ? [0]
        : (isNodeProxy || scope === 'node')
          ? network.nodeIndices
          : network.edgeIndices;
      if (!indices || typeof indices.length !== 'number') return { counts: new Map(), unknownCount: 0 };
      const compute = () => {
        const name = isNodeProxy ? rawName.slice('@node.'.length) : rawName;
        let view = null;
        try {
          const buffer = isNodeProxy
            ? network.getNodeAttributeBuffer?.(name)
            : (scope === 'edge' ? network.getEdgeAttributeBuffer?.(name) : network.getNodeAttributeBuffer?.(name));
          view = buffer?.view ?? null;
        } catch (_) {
          view = null;
        }
        if (!view || typeof view.length !== 'number') return { counts: new Map(), unknownCount: 0 };
        const counts = new Map();
        let unknownCount = 0;
        for (let i = 0; i < indices.length; i += 1) {
          const idx = indices[i];
          const id = Number(view[idx]);
          if (!Number.isFinite(id)) {
            unknownCount += 1;
            continue;
          }
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        return { counts, unknownCount };
      };
      if (typeof network.withBufferAccess === 'function') {
        return network.withBufferAccess(compute);
      }
      return compute();
    };

    const resolveCategoryEntries = (scope, rawName) => {
      const dictEntries = resolveCategoryDictionary(scope, rawName);
      const { counts, unknownCount } = computeCategoryCounts(scope, rawName);
      const entries = [];
      const seen = new Set();
      for (const entry of dictEntries) {
        if (!entry) continue;
        const id = Number(entry.id);
        if (!Number.isFinite(id)) continue;
        const rawLabel = typeof entry.label === 'string' ? entry.label : null;
        const fallbackLabel = entry.label != null ? String(entry.label) : '';
        const label = rawLabel && rawLabel.trim()
          ? rawLabel
          : (fallbackLabel && fallbackLabel.trim() ? fallbackLabel : `#${id}`);
        entries.push({ id, label, count: counts.get(id) ?? 0 });
        seen.add(id);
      }
      for (const [id, count] of counts.entries()) {
        if (seen.has(id)) continue;
        entries.push({ id, label: `#${id}`, count });
      }
      entries.unknownCount = unknownCount;
      return entries;
    };

    const resolveCategoricalPalette = ({ paletteName, count, preferScheme }) => {
      const resolved = resolveColormap(paletteName) ?? resolveColormap('schemeTableau10');
      if (!resolved) {
        return Array.from({ length: count }, (_, i) => colorFromIndex(i));
      }
      const useScheme = preferScheme && resolved.isScheme && typeof resolved.scheme === 'function';
      const colors = useScheme
        ? resolved.scheme(count)
        : colormapToScheme(resolved, count);
      return colors.map((color, i) => rgbaToHex8(color) ?? colorFromIndex(i));
    };

    const suggestHistogramBins = (count) => {
      if (!Number.isFinite(count) || count <= 1) return 1;
      const bins = Math.round(Math.sqrt(count));
      return Math.max(8, Math.min(40, bins));
    };

    const buildHistogram = (view, min, max, indices) => {
      if (!view || typeof view.length !== 'number' || view.length <= 0) return null;
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
      if (!indices || typeof indices.length !== 'number' || indices.length <= 0) return null;
      const bins = suggestHistogramBins(indices.length);
      const counts = new Array(bins).fill(0);
      const span = max - min;
      let maxCount = 0;
      let seen = 0;
      for (let i = 0; i < indices.length; i += 1) {
        const idxValue = indices[i];
        const v = Number(view[idxValue]);
        if (!Number.isFinite(v)) continue;
        let idx = Math.floor(((v - min) / span) * bins);
        if (idx < 0) idx = 0;
        if (idx >= bins) idx = bins - 1;
        const next = counts[idx] + 1;
        counts[idx] = next;
        if (next > maxCount) maxCount = next;
        seen += 1;
      }
      if (!seen || maxCount <= 0) return null;
      return { counts, maxCount };
    };

    const createRangeHistogram = ({ view, min, max, range, scope, rawName }) => {
      const network = net();
      if (!network) return null;
      const isNodeProxy = scope === 'edge' && rawName?.startsWith('@node.');
      const indices = scope === 'network'
        ? [0]
        : (isNodeProxy || scope === 'node')
          ? network.nodeIndices
          : network.edgeIndices;
      if (!indices || typeof indices.length !== 'number' || indices.length === 0) return null;
      const compute = () => buildHistogram(view, min, max, indices);
      const data = typeof network.withBufferAccess === 'function'
        ? network.withBufferAccess(compute)
        : compute();
      if (!data) return null;
      const histogram = document.createElement('div');
      histogram.className = 'helios-ui-range2__histogram';

      for (const count of data.counts) {
        const bar = document.createElement('div');
        bar.className = 'helios-ui-range2__histogram-bin';
        bar.style.height = `${Math.max(1, Math.round((count / data.maxCount) * 100))}%`;
        histogram.appendChild(bar);
      }

      const minMarker = document.createElement('div');
      minMarker.className = 'helios-ui-range2__histogram-marker';
      const maxMarker = document.createElement('div');
      maxMarker.className = 'helios-ui-range2__histogram-marker';
      histogram.appendChild(minMarker);
      histogram.appendChild(maxMarker);

      const setMarkers = (lo, hi) => {
        const span = max - min;
        const toPct = (value) => {
          if (span === 0) return 0;
          const raw = (value - min) / span;
          return Math.max(0, Math.min(1, raw));
        };
        const toLeft = (pct) =>
          `calc(${pct} * (100% - var(--helios-ui-range2-thumb)) + (var(--helios-ui-range2-thumb) / 2))`;

        const loPct = toPct(lo);
        const hiPct = toPct(hi);
        minMarker.style.left = toLeft(loPct);
        maxMarker.style.left = toLeft(hiPct);
      };
      setMarkers(Number(range?.[0] ?? min), Number(range?.[1] ?? max));

      return { element: histogram, setMarkers };
    };

    const ensureUiMeta = (pending) => {
      if (!pending || typeof pending !== 'object') return null;
      const existing = pending.__ui && typeof pending.__ui === 'object' ? pending.__ui : null;
      if (existing) return existing;
      pending.__ui = {};
      return pending.__ui;
    };

    const markDomainAuto = (pending, enabled) => {
      const uiMeta = ensureUiMeta(pending);
      if (!uiMeta) return;
      uiMeta.domainAuto = Boolean(enabled);
    };

    const suggestRangeForChannel = (mode, channel) => {
      if (mode === 'node') {
        if (channel === 'size') return [1, 20];
        if (channel === 'outline') return [0, 10];
      }
      if (mode === 'edge') {
        if (channel === 'width') return [0.5, 6];
        if (channel === 'opacity') return [0, 1];
      }
      return [0, 1];
    };

    const suggestStepForRange = (min, max, isInteger = false) => {
      if (isInteger) return 1;
      const span = Math.abs(Number(max) - Number(min));
      if (!Number.isFinite(span) || span <= 0) return 0.01;
      const magnitude = Math.floor(Math.log10(span));
      const step = Math.pow(10, magnitude - 3);
      return Math.max(step, 1e-6);
    };

    const isPercentileTransform = (transformType) => transformType === 'percentile' || transformType === 'quantile';

    const formatTransformLabel = (value) => {
      if (value === 'log1p') return 'Log1p';
      if (value === 'percentile' || value === 'quantile') return 'Percentile';
      return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
    };

    const normalizeClampSetting = (clamp) => {
      if (clamp && typeof clamp === 'object') {
        return { min: clamp.min !== false, max: clamp.max !== false };
      }
      if (clamp === false) return { min: false, max: false };
      return { min: true, max: true };
    };

    const resolveDivergentDomain = (domain, extent) => {
      if (!Array.isArray(domain) || domain.length !== 2) {
        const min = extent?.min ?? -1;
        const max = extent?.max ?? 1;
        const maxAbs = Math.max(Math.abs(min), Math.abs(max), 1);
        return [-maxAbs, maxAbs];
      }
      const maxAbs = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
      if (!Number.isFinite(maxAbs) || maxAbs === 0) return [-1, 1];
      return [-maxAbs, maxAbs];
    };

    const resolveDivergentDomainFromSlider = (next, prev) => {
      const prevAbs = Math.abs(prev?.[1] ?? prev?.[0] ?? 0);
      const loAbs = Math.abs(next?.[0] ?? 0);
      const hiAbs = Math.abs(next?.[1] ?? 0);
      const loChanged = Math.abs(loAbs - prevAbs) > 1e-6;
      const hiChanged = Math.abs(hiAbs - prevAbs) > 1e-6;
      const maxAbs = loChanged && !hiChanged
        ? loAbs
        : (hiChanged && !loChanged ? hiAbs : Math.max(loAbs, hiAbs));
      if (!Number.isFinite(maxAbs) || maxAbs === 0) return [-1, 1];
      return [-maxAbs, maxAbs];
    };

    const resolveLiveConfig = (mode, channel) => {
      const collection = resolveCollection(mode);
      const mapper = collection?.defaultMapper ?? null;
      if (!mapper || typeof mapper.getChannel !== 'function') return null;
      return shallowCloneChannelConfig(mapper.getChannel(channel));
    };

    const applyConfig = (mode, channel, config) => {
      const collection = resolveCollection(mode);
      const mapper = collection?.defaultMapper ?? null;
      if (!collection || !mapper || typeof mapper.setChannel !== 'function') return false;
      mapper.setChannel(channel, config);
      collection.touch?.();
      return true;
    };

    const createModeTab = (mode) => {
      const root = document.createElement('div');

      const state = {
        channel: (mode === 'edge' ? (options.defaultEdgeChannel ?? 'color') : (options.defaultNodeChannel ?? 'color')),
        pending: null,
        dirty: false,
      };

    const createSubsectionHeader = ({ title, action, tooltip }) => {
      const wrap = document.createElement('div');
      wrap.style.display = 'grid';
      wrap.style.gap = '8px';
      wrap.style.width = '100%';

      const divider = document.createElement('div');
      divider.style.height = '0';
      divider.style.borderTop = '1px solid color-mix(in srgb, var(--helios-ui-border) 70%, transparent)';
      divider.style.margin = '6px 0 2px';
      wrap.appendChild(divider);

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.gap = '8px';
      header.style.flexWrap = 'wrap';

      const titleEl = document.createElement('div');
      titleEl.textContent = title ?? '';
      titleEl.style.fontWeight = '700';
      titleEl.style.fontSize = '12px';
      titleEl.style.color = 'var(--helios-ui-muted)';
      titleEl.style.letterSpacing = '0.4px';
      titleEl.style.textTransform = 'uppercase';
      if (tooltip) tooltips.attachTooltip?.(titleEl, tooltip);
      header.appendChild(titleEl);
      if (action) {
        action.style.marginLeft = 'auto';
        header.appendChild(action);
      }
      wrap.appendChild(header);
      return { wrap, header, titleEl };
    };

      const channels = mode === 'edge' ? edgeChannels : nodeChannels;
      if (!channels.includes(state.channel)) state.channel = channels[0];

      const editorStack = new PanelStack();
      const editorBody = document.createElement('div');
      editorStack.add({ id: `${mode}-mapper-basic`, title: 'Editor', content: editorBody });
      root.appendChild(editorStack.element);
      ui._controlCleanups.add(() => editorStack.destroy());

      const applyRow = document.createElement('div');
      applyRow.style.display = 'flex';
      applyRow.style.justifyContent = 'flex-end';
      applyRow.style.gap = '8px';
      applyRow.style.marginTop = '10px';

      const revertButton = document.createElement('button');
      revertButton.type = 'button';
      revertButton.className = 'helios-ui-button';
      revertButton.textContent = 'Revert';

      const applyButton = document.createElement('button');
      applyButton.type = 'button';
      applyButton.className = 'helios-ui-button';
      applyButton.textContent = 'Apply';

      applyRow.appendChild(revertButton);
      applyRow.appendChild(applyButton);
      root.appendChild(applyRow);

      const canApplyPending = () => {
        if (!state.pending) return false;
        const collection = resolveCollection(mode);
        const mapper = collection?.defaultMapper ?? null;
        if (!collection || !mapper || typeof mapper.setChannel !== 'function') return false;

        const rawType = state.pending.type ?? state.pending.mode ?? null;
        const type = isEditorTransferableConfig(state.pending) ? (rawType ?? 'passthrough') : 'custom';

        if (mode === 'node' && state.channel === 'position' && type === 'layout') {
          const scheduler = helios?.scheduler ?? null;
          if (!scheduler || typeof scheduler.setLayoutEnabled !== 'function') return false;
          return Boolean(scheduler.layout);
        }

        if (type === 'passthrough') {
          return typeof state.pending.attributes === 'string' && state.pending.attributes.length > 0;
        }

        if (type === 'nodeAttribute') {
          return typeof state.pending.nodeAttribute === 'string' && state.pending.nodeAttribute.length > 0;
        }

        if (type === 'constant') {
          const v = state.pending.value;
          const isArrayLike = Array.isArray(v) || ArrayBuffer.isView(v);
          if (mode === 'node' && state.channel === 'position') {
            return isArrayLike && v.length === 3 && Array.from(v).every((x) => Number.isFinite(x));
          }
          if (isArrayLike) return v.length === 3 || v.length === 4;
          if (v && typeof v === 'object') {
            if (mode === 'edge') {
              if (state.channel === 'color') {
                const src = v.source ?? v.start ?? null;
                const dst = v.target ?? v.end ?? null;
                if (src != null && !isHexColorString(String(src))) return false;
                if (dst != null && !isHexColorString(String(dst))) return false;
                return src != null || dst != null;
              }
              if (state.channel === 'width' || state.channel === 'opacity') {
                const src = Number(v.source ?? v.start);
                const dst = Number(v.target ?? v.end);
                const srcOk = Number.isFinite(src);
                const dstOk = Number.isFinite(dst);
                return srcOk || dstOk;
              }
            }
            return false;
          }
          if (typeof v === 'number') return Number.isFinite(v);
          if (typeof v === 'string') return isHexColorString(v);
          return false;
        }

        if (type === 'linear') {
          if (!(typeof state.pending.attributes === 'string' && state.pending.attributes.length > 0)) return false;
          const domain = state.pending.domain;
          const range = state.pending.range;
          const domainOk = Array.isArray(domain) && domain.length === 2 && domain.every((x) => Number.isFinite(x));
          const rangeOk = Array.isArray(range) && range.length === 2 && range.every((x) => Number.isFinite(x));
          return domainOk && rangeOk;
        }

        if (type === 'colormap') {
          if (!(typeof state.pending.attributes === 'string' && state.pending.attributes.length > 0)) return false;
          if (!(typeof state.pending.colormap === 'string' && state.pending.colormap.length > 0)) return false;
          return true;
        }

        if (type === 'categorical') {
          if (!(typeof state.pending.attributes === 'string' && state.pending.attributes.length > 0)) return false;
          const info = getAttributeInfo(mode, state.pending.attributes);
          if (info && isStringAttributeType(info.type)) return false;
          const domain = state.pending.domain;
          const range = state.pending.range;
          if (!Array.isArray(domain) || !Array.isArray(range)) return false;
          if (domain.length === 0 || domain.length !== range.length) return false;
          const isColorChannel = state.channel === 'color' || state.channel === 'outlineColor';
          return isColorChannel
            ? range.every((value) => typeof value === 'string' && isHexColorString(value))
            : range.every((value) => Number.isFinite(Number(value)));
        }

        if (type === 'custom') {
          return true;
        }

        return true;
      };

      const syncApplyEnabled = () => {
        applyButton.disabled = !canApplyPending();
      };

      const setDirty = (dirty) => {
        state.dirty = Boolean(dirty);
        syncApplyEnabled();
      };

      const resolveAllowedTypes = (channel) => {
        if (mode === 'node' && channel === 'position') return ['layout', 'constant', 'passthrough'];
        const isColor = channel === 'color' || channel === 'outlineColor';
        const isScalar =
          channel === 'size' ||
          channel === 'outline' ||
          channel === 'width' ||
          channel === 'opacity';
        if (mode === 'edge' && isColor) return ['constant', 'passthrough', 'nodeAttribute', 'categorical', 'colormap'];
        if (mode === 'edge' && isScalar) return ['constant', 'passthrough', 'nodeAttribute', 'categorical', 'linear'];
        if (isColor) return ['constant', 'passthrough', 'categorical', 'colormap'];
        if (isScalar) return ['constant', 'passthrough', 'categorical', 'linear'];
        return ['passthrough'];
      };

      const localControls = new Set();
      const registerControl = (control) => {
        if (!control) return;
        localControls.add(control);
      };
	      const destroyControls = () => {
	        for (const control of localControls) {
	          try {
	            control.destroy?.();
	          } catch (_) {
	            // ignore
	          }
	        }
	        localControls.clear();
	      };

	      const extractScalarForRule = (inputs) => {
	        if (inputs == null) return inputs;
	        if (typeof inputs === 'number') return inputs;
	        if (Array.isArray(inputs) || ArrayBuffer.isView(inputs)) return inputs[0];
	        if (typeof inputs === 'object') {
	          const keys = Object.keys(inputs);
	          if (keys.length) return inputs[keys[0]];
	        }
	        return inputs;
	      };

	      const buildRulePredicate = (spec) => {
	        const op = spec?.op ?? 'eq';
	        const rhsRaw = spec?.rhs;
	        const rhs = rhsRaw != null ? Number(rhsRaw) : undefined;
	        return (inputs) => {
	          const vRaw = extractScalarForRule(inputs);
	          if (op === 'nullish') return vRaw == null;
	          if (op === 'nan') return vRaw != null && Number.isNaN(Number(vRaw));
	          const v = Number(vRaw);
	          if (!Number.isFinite(v)) return false;
	          if (op === 'eq') return rhs != null && v === rhs;
	          if (op === 'lt') return rhs != null && v < rhs;
	          if (op === 'lte') return rhs != null && v <= rhs;
	          if (op === 'gt') return rhs != null && v > rhs;
	          if (op === 'gte') return rhs != null && v >= rhs;
	          return false;
	        };
	      };

	      const normalizeRuleList = (pending) => {
	        if (!pending) return { rules: [] };
	        if (!Array.isArray(pending.rules)) {
	          return { ...pending, rules: [] };
	        }
	        return pending;
	      };

	      const createRuleKeyword = (text) => {
	        const el = document.createElement('div');
	        el.className = 'helios-ui-rule-keyword';
	        el.textContent = text;
	        return el;
	      };

        const createHex8ColorEditor = ({ label, value, onChange, showAlphaLabel = false, compact = true }) => {
	        const row = document.createElement('div');
	        row.style.display = 'flex';
          row.style.gap = '4px';
	        row.style.alignItems = 'center';
	        row.style.width = '100%';

	        if (label) {
	          const labelEl = document.createElement('div');
	          labelEl.textContent = label;
	          labelEl.style.fontSize = '12px';
	          labelEl.style.color = 'var(--helios-ui-muted)';
	          labelEl.style.minWidth = '76px';
	          row.appendChild(labelEl);
	        }

	        const swatchWrap = document.createElement('div');
	        swatchWrap.className = 'helios-ui-color-swatch';

	        const swatch = document.createElement('div');
	        swatch.className = 'helios-ui-color-swatch__swatch';

	        const colorInput = document.createElement('input');
	        colorInput.type = 'color';
	        colorInput.className = 'helios-ui-color-swatch__input';
	        colorInput.setAttribute('aria-label', label ? `${label} color` : 'Color');

	        const alphaInput = document.createElement('input');
	        alphaInput.type = 'number';
	        alphaInput.className = 'helios-ui-number';
	        alphaInput.min = '0';
	        alphaInput.max = '1';
	        alphaInput.step = '0.01';
          alphaInput.style.maxWidth = compact ? '36px' : '52px';
	        alphaInput.title = 'Alpha';

	        const alphaLabel = document.createElement('span');
	        alphaLabel.textContent = 'Alpha';
	        alphaLabel.style.color = 'var(--helios-ui-muted)';
	        alphaLabel.style.display = showAlphaLabel ? '' : 'none';

	        const rawValue = typeof value === 'string' ? value : '#ffffff';
	        const raw = rawValue.startsWith('#') ? rawValue.slice(1) : rawValue;
	        const baseHex = raw.length >= 6 ? `#${raw.slice(0, 6)}` : '#ffffff';
	        const alphaHex = raw.length === 8 ? raw.slice(6, 8) : 'ff';
	        const alpha = Math.round(parseInt(alphaHex, 16) / 255 * 100) / 100;

	        colorInput.value = baseHex;
	        alphaInput.value = String(Number.isFinite(alpha) ? alpha : 1);
	        swatch.style.background = colorInput.value;

	        const commit = () => {
	          const a = clampNumber(alphaInput.value, { min: 0, max: 1 });
	          if (a == null) return;
	          onChange(toHex8(colorInput.value, a));
	          setDirty(true);
	          swatch.style.background = colorInput.value;
	        };
	        colorInput.addEventListener('input', commit);
	        alphaInput.addEventListener('change', commit);

	        swatchWrap.appendChild(swatch);
	        swatchWrap.appendChild(colorInput);
	        row.appendChild(swatchWrap);
	        if (showAlphaLabel) row.appendChild(alphaLabel);
	        row.appendChild(alphaInput);
	        return row;
	      };

	      const renderEditor = () => {
	        destroyControls();
	        editorBody.textContent = '';
        const live = resolveLiveConfig(mode, state.channel);

        if (!state.pending) {
          if (mode === 'node' && state.channel === 'position') {
            const scheduler = helios?.scheduler ?? null;
            const hasLayout = Boolean(scheduler?.layout);
            const layoutEnabled = hasLayout && scheduler?.layoutEnabled !== false;
            state.pending = layoutEnabled ? { name: state.channel, type: 'layout' } : (shallowCloneChannelConfig(live) ?? { name: state.channel });
          } else {
            state.pending = shallowCloneChannelConfig(live) ?? { name: state.channel };
          }
        }

        const allowedTypes = resolveAllowedTypes(state.channel);
        const customPresets = getCustomPresetMap(mode, state.channel);

        const resolveCurrentTypeKey = () => {
          const pendingType = state.pending?.type ?? state.pending?.mode ?? null;

          if (pendingType === 'layout' && allowedTypes.includes('layout')) return 'layout';

          if (pendingType === 'nodeToEdge' && allowedTypes.includes('nodeAttribute')) return 'nodeAttribute';

          if (state.pending && isEditorTransferableConfig(state.pending) && allowedTypes.includes(pendingType)) {
            return pendingType;
          }

          const candidate = state.pending ?? live;
          if (candidate && !isEditorTransferableConfig(candidate)) {
            const id = registerCustomPreset(mode, state.channel, candidate);
            if (id) return `custom:${id}`;
          }

          if (live && !isEditorTransferableConfig(live)) {
            const id = registerCustomPreset(mode, state.channel, live);
            if (id) return `custom:${id}`;
          }

          return allowedTypes[0];
        };

        const currentKey = resolveCurrentTypeKey();

        const typeSelect = document.createElement('select');
        typeSelect.className = 'helios-ui-select';

        for (const t of allowedTypes) {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = MAPPER_TYPE_LABELS[t] ?? t;
          typeSelect.appendChild(opt);
        }

        for (const preset of customPresets.values()) {
          const opt = document.createElement('option');
          opt.value = `custom:${preset.id}`;
          const label = typeof preset.label === 'string' ? preset.label.trim() : '';
          opt.textContent = label && label.toLowerCase() !== 'custom' ? `Custom: ${label}` : 'Custom';
          typeSelect.appendChild(opt);
        }

        const availableKeys = [
          ...allowedTypes,
          ...Array.from(customPresets.keys()).map((id) => `custom:${id}`),
        ];
        typeSelect.value = availableKeys.includes(currentKey) ? currentKey : availableKeys[0];

        const buildPendingForType = (nextType) => {
          const prev = state.pending ?? {};
          const base = nextType === 'layout'
            ? { name: state.channel, type: nextType }
            : {
              name: state.channel,
              type: nextType,
              attributes: prev.attributes ?? live?.attributes ?? live?.from,
              defaultValue: prev.defaultValue ?? live?.defaultValue,
            };
          if (nextType === 'constant') {
            base.value = prev.value ?? live?.value;
            if (base.value == null && (state.channel === 'opacity' || state.channel === 'width')) {
              base.value = 1;
            }
          }
          if (nextType === 'nodeAttribute') {
            base.nodeAttribute = prev.nodeAttribute ?? live?.nodeAttribute ?? '';
            base.endpoints = prev.endpoints ?? live?.endpoints ?? 'both';
            if (!base.nodeAttribute) {
              const isColorChannel = state.channel === 'color' || state.channel === 'outlineColor';
              base.nodeAttribute = isColorChannel ? 'color' : 'size';
            }
            base.attributes = [`@node.${base.nodeAttribute}`];
          }
          if (nextType === 'linear') {
            const attr = typeof base.attributes === 'string' ? base.attributes : null;
            base.transformType = prev.transformType ?? live?.transformType ?? 'linear';
            base.transformPower = prev.transformPower ?? live?.transformPower ?? 1;
            const hasDomain = Array.isArray(prev.domain) || Array.isArray(live?.domain);
            base.domain = Array.isArray(prev.domain)
              ? prev.domain
              : (Array.isArray(live?.domain) ? live.domain : suggestDomainForAttribute(mode, attr));
            const suggested = suggestRangeForChannel(mode, state.channel);
            base.range = Array.isArray(prev.range) ? prev.range : (Array.isArray(live?.range) ? live.range : suggested);
            markDomainAuto(base, !hasDomain);
          }
          if (nextType === 'colormap') {
            base.colormap = prev.colormap ?? live?.colormap ?? 'interpolateInferno';
            const attr = typeof base.attributes === 'string' ? base.attributes : null;
            base.transformType = prev.transformType ?? live?.transformType ?? 'linear';
            base.transformPower = prev.transformPower ?? live?.transformPower ?? 1;
            const hasDomain = Array.isArray(prev.domain) || Array.isArray(live?.domain);
            base.domain = Array.isArray(prev.domain)
              ? prev.domain
              : (Array.isArray(live?.domain) ? live.domain : suggestDomainForAttribute(mode, attr));
            base.alpha = prev.alpha ?? live?.alpha ?? 1;
            base.clamp = prev.clamp ?? live?.clamp ?? true;
            markDomainAuto(base, !hasDomain);
          }
          if (nextType === 'categorical') {
            base.attributes = typeof base.attributes === 'string'
              ? base.attributes
              : (typeof prev.attributes === 'string' ? prev.attributes : (typeof live?.attributes === 'string' ? live.attributes : ''));
            base.domain = Array.isArray(prev.domain)
              ? prev.domain
              : (Array.isArray(live?.domain) ? live.domain : []);
            base.range = Array.isArray(prev.range)
              ? prev.range
              : (Array.isArray(live?.range) ? live.range : []);
            base.defaultValue = prev.defaultValue ?? live?.defaultValue ?? '#888888ff';
            const meta = { ...(prev.meta && typeof prev.meta === 'object' ? prev.meta : null), ...(live?.meta && typeof live.meta === 'object' ? live.meta : null) };
            const nextMeta = meta && typeof meta === 'object' ? { ...meta } : {};
            const categorical = nextMeta.categorical && typeof nextMeta.categorical === 'object'
              ? { ...nextMeta.categorical }
              : {};
            if (!categorical.sortOrder) categorical.sortOrder = 'frequency';
            if (categorical.maxCategories == null) categorical.maxCategories = null;
            if (!categorical.palette) categorical.palette = defaultCategoricalPalette;
            if (categorical.preferScheme == null) categorical.preferScheme = true;
            nextMeta.categorical = categorical;
            base.meta = nextMeta;
          }
          return base;
        };

        const setPendingType = (nextType) => {
          state.pending = buildPendingForType(nextType);
          setDirty(true);
          renderEditor();
        };

        typeSelect.addEventListener('change', () => {
          const next = typeSelect.value;
          if (next.startsWith('custom:')) {
            const id = next.slice('custom:'.length);
            const preset = customPresets.get(id) ?? null;
            if (preset?.config) {
              state.pending = shallowCloneChannelConfig(preset.config) ?? preset.config;
              setDirty(true);
              renderEditor();
            }
            return;
          }
          pruneEphemeralCustomPresets(mode, state.channel);
          setPendingType(next);
        });

        editorBody.appendChild(createAlignedRow({
          title: 'Type',
          hint: 'Select how this channel is driven (constant, attribute passthrough, scale, colormap, layout).',
          controls: typeSelect,
        }).row);

        const pendingTypeKey = typeSelect.value;
        const pendingType = pendingTypeKey.startsWith('custom:') ? 'custom' : pendingTypeKey;
        if (pendingType !== 'custom') {
          const rawType = state.pending?.type ?? state.pending?.mode ?? null;
          if (!rawType) {
            state.pending = buildPendingForType(pendingType);
          }
        }
        const isColor = state.channel === 'color' || state.channel === 'outlineColor';
        const isScalar =
          state.channel === 'size' ||
          state.channel === 'outline' ||
          state.channel === 'width' ||
          state.channel === 'opacity';
        const isPosition = mode === 'node' && state.channel === 'position';

        if (pendingType === 'layout') {
          const note = document.createElement('div');
          note.style.color = 'var(--helios-ui-muted)';
          note.textContent = 'Uses the active layout (no position mapper applied).';
          editorBody.appendChild(note);
        }

        if (pendingType === 'custom') {
          const meta = state.pending?.meta && typeof state.pending.meta === 'object' ? state.pending.meta : {};
          const description = typeof meta.description === 'string' ? meta.description : '';
          const source = typeof meta.source === 'string' ? meta.source : '';

          const descEl = document.createElement('div');
          descEl.style.whiteSpace = 'pre-wrap';
          descEl.style.color = 'var(--helios-ui-muted)';
          descEl.textContent = description || '—';
          editorBody.appendChild(createAlignedRow({
            title: 'Description',
            hint: 'Optional: describes what this preset does.',
            controls: descEl,
          }).row);

          const srcEl = document.createElement('div');
          srcEl.style.whiteSpace = 'pre-wrap';
          srcEl.style.color = 'var(--helios-ui-muted)';
          srcEl.textContent = source || '—';
          editorBody.appendChild(createAlignedRow({
            title: 'Source',
            hint: 'Optional: where this preset came from (for your own reference).',
            controls: srcEl,
          }).row);
        }

        if (pendingType === 'passthrough') {
          const attrSelect = document.createElement('select');
          attrSelect.className = 'helios-ui-select';
          const names = listAttributeNames(mode, { channel: state.channel, mapperType: 'passthrough' });
          const current = typeof state.pending.attributes === 'string'
            ? state.pending.attributes
            : (typeof live?.attributes === 'string' ? live.attributes : '');
          const optBlank = document.createElement('option');
          optBlank.value = '';
          optBlank.textContent = names.length ? 'Select attribute…' : 'No attributes';
          attrSelect.appendChild(optBlank);
          for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            attrSelect.appendChild(opt);
          }
          attrSelect.value = names.includes(current) ? current : '';
          attrSelect.addEventListener('change', () => {
            state.pending = { ...state.pending, type: 'passthrough', attributes: attrSelect.value || undefined };
            setDirty(true);
          });
          editorBody.appendChild(createAlignedRow({
            title: 'Attribute',
            hint: 'Pick the attribute used as input for this channel.',
            controls: attrSelect,
          }).row);
        }

          if (pendingType === 'nodeAttribute') {
            const attrSelect = document.createElement('select');
            attrSelect.className = 'helios-ui-select';
            const names = listAttributeNames('node', { channel: state.channel, mapperType: 'nodeAttribute', targetMode: mode });
            const fromAttributes = () => {
            const attrs = state.pending?.attributes ?? live?.attributes ?? live?.from ?? null;
            if (typeof attrs === 'string' && attrs.startsWith('@node.')) return attrs.slice('@node.'.length);
            if (typeof attrs === 'string' && attrs.startsWith('@nodes.')) return attrs.slice('@nodes.'.length);
            if (Array.isArray(attrs)) {
              for (const v of attrs) {
                if (typeof v === 'string' && v.startsWith('@node.')) return v.slice('@node.'.length);
                if (typeof v === 'string' && v.startsWith('@nodes.')) return v.slice('@nodes.'.length);
              }
            }
            return '';
          };
          const current = typeof state.pending.nodeAttribute === 'string'
            ? state.pending.nodeAttribute
            : (typeof live?.nodeAttribute === 'string' ? live.nodeAttribute : fromAttributes());

          const optBlank = document.createElement('option');
          optBlank.value = '';
          optBlank.textContent = names.length ? 'Select node attribute…' : 'No node attributes';
          attrSelect.appendChild(optBlank);

          for (const name of names) {
            const bare = name.startsWith('@node.') ? name.slice('@node.'.length) : name;
            if (bare === '$index') continue;
            const opt = document.createElement('option');
            opt.value = bare;
            opt.textContent = bare;
            attrSelect.appendChild(opt);
          }

          attrSelect.value = current || '';
          attrSelect.addEventListener('change', () => {
            const bare = attrSelect.value || undefined;
            state.pending = {
              ...state.pending,
              type: 'nodeAttribute',
              nodeAttribute: bare,
              endpoints: state.pending.endpoints ?? 'both',
              attributes: bare ? [`@node.${bare}`] : undefined,
            };
            setDirty(true);
          });
            state._nodePassthroughUi = { attrSelect, endpointsSelect: state._nodePassthroughUi?.endpointsSelect ?? null };
            registerControl({
              destroy() {
                if (state._nodePassthroughUi?.attrSelect === attrSelect) {
                  state._nodePassthroughUi = null;
                }
              },
            });
            editorBody.appendChild(createAlignedRow({
              title: 'Node Attribute',
              hint: 'Pick the node attribute to propagate to edge endpoints.',
              controls: attrSelect,
            }).row);

            if (mode === 'edge') {
              const endpointsSelect = document.createElement('select');
              endpointsSelect.className = 'helios-ui-select helios-ui-select--compact';
            const options = [
              { value: 'both', label: 'Both' },
              { value: 'source', label: 'Source' },
              { value: 'destination', label: 'Target' },
            ];
            for (const optInfo of options) {
              const opt = document.createElement('option');
              opt.value = optInfo.value;
              opt.textContent = optInfo.label;
              endpointsSelect.appendChild(opt);
            }
            endpointsSelect.value = String(state.pending.endpoints ?? 'both');
            endpointsSelect.addEventListener('change', () => {
              const bare =
                typeof state.pending.nodeAttribute === 'string' && state.pending.nodeAttribute.length
                  ? state.pending.nodeAttribute
                  : (attrSelect.value || current || undefined);
              state.pending = {
                ...state.pending,
                type: 'nodeAttribute',
                nodeAttribute: bare,
                endpoints: endpointsSelect.value,
                attributes: bare ? [`@node.${bare}`] : undefined,
              };
              try {
                if (window.__HELIOS_DEBUG_MAPPERS_PANEL__) {
                  console.log('[HeliosUI][MappersPanel] endpoints change', {
                    mode,
                    channel: state.channel,
                    nodeAttribute: bare,
                    endpoints: endpointsSelect.value,
                  });
                }
              } catch (_) {
                // ignore
              }
              setDirty(true);
            });
              state._nodePassthroughUi = { attrSelect, endpointsSelect };
              registerControl({
                destroy() {
                  if (state._nodePassthroughUi?.endpointsSelect === endpointsSelect) {
                    state._nodePassthroughUi = null;
                  }
                },
              });
              editorBody.appendChild(createAlignedRow({
                title: 'Endpoints',
                hint: 'Whether the passthrough uses both endpoints or duplicates source/target.',
                controls: endpointsSelect,
              }).row);
            }
          }

        if (pendingType === 'constant' && isScalar) {
          const wrap = document.createElement('div');
          wrap.style.display = 'grid';
          wrap.style.gap = '6px';
          wrap.style.width = '100%';

          const minAllowed = state.channel === 'opacity' ? 0 : 0;
          const maxAllowed = state.channel === 'opacity' ? 1 : null;

          const [suggestMin, suggestMax] = suggestRangeForChannel(mode, state.channel);
          const step = suggestStepForRange(suggestMin, suggestMax);

          const isEdgeSplitCapable = mode === 'edge' && (state.channel === 'width' || state.channel === 'opacity');
          const pendingValue = state.pending.value ?? live?.value;
          const isSplit =
            isEdgeSplitCapable &&
            pendingValue &&
            typeof pendingValue === 'object' &&
            ('source' in pendingValue || 'target' in pendingValue);

          if (isEdgeSplitCapable) {
            const toggle = createToggleControl({
              checked: Boolean(isSplit),
              onLabel: 'Source/Target',
              offLabel: 'Single',
            });
            wrap.appendChild(toggle);

            toggle.addEventListener('change', () => {
              const raw = state.pending.value ?? live?.value;
              const seed = Number.isFinite(Number(raw)) ? Number(raw) : 1;
              if (toggle.checked) {
                state.pending = { ...state.pending, type: 'constant', value: { source: seed, target: seed } };
              } else {
                const src = raw && typeof raw === 'object' ? Number(raw.source ?? raw.start) : seed;
                const next = Number.isFinite(src) ? src : seed;
                state.pending = { ...state.pending, type: 'constant', value: next };
              }
              setDirty(true);
              renderEditor();
            });
          }

          const commit = (value, endpoint) => {
            const n = clampNumber(value, { min: minAllowed, max: maxAllowed });
            if (n == null) return;

            if (isSplit) {
              const current = state.pending.value && typeof state.pending.value === 'object' ? state.pending.value : {};
              const next = endpoint === 'target'
                ? { ...current, target: n }
                : { ...current, source: n };
              state.pending = { ...state.pending, type: 'constant', value: next };
            } else {
              state.pending = { ...state.pending, type: 'constant', value: n };
            }
            setDirty(true);
          };

          const labelStyle = (el) => {
            el.style.fontSize = '12px';
            el.style.color = 'var(--helios-ui-muted)';
          };

          if (isSplit) {
            const srcSeed = Number(pendingValue?.source ?? pendingValue?.start ?? 1);
            const srcValue = Number.isFinite(srcSeed) ? srcSeed : 1;
            const sourceLabel = document.createElement('div');
            sourceLabel.textContent = 'Source';
            labelStyle(sourceLabel);
            wrap.appendChild(sourceLabel);
            const srcControls = new SuggestedSliderControls({
              value: srcValue,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v, 'source'),
            });
            registerControl(srcControls);
            wrap.appendChild(srcControls.element);

            const dstSeed = Number(pendingValue?.target ?? pendingValue?.end ?? srcValue);
            const dstValue = Number.isFinite(dstSeed) ? dstSeed : srcValue;
            const targetLabel = document.createElement('div');
            targetLabel.textContent = 'Target';
            labelStyle(targetLabel);
            wrap.appendChild(targetLabel);
            const dstControls = new SuggestedSliderControls({
              value: dstValue,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v, 'target'),
            });
            registerControl(dstControls);
            wrap.appendChild(dstControls.element);
          } else {
            const fallbackValue = Number.isFinite(Number(live?.value)) ? Number(live.value) : 1;
            const seeded = Number.isFinite(Number(state.pending.value)) ? Number(state.pending.value) : fallbackValue;
            if (!Number.isFinite(Number(state.pending.value))) {
              state.pending = { ...state.pending, type: 'constant', value: seeded };
            }
            const controls = new SuggestedSliderControls({
              value: seeded,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v),
            });
            registerControl(controls);
            wrap.appendChild(controls.element);
          }

          editorBody.appendChild(createAlignedRow({
            title: 'Value',
            hint: 'Use a fixed value for every item (node/edge).',
            controls: wrap,
          }).row);
        }

        if (pendingType === 'constant' && isPosition) {
          const wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.gap = '8px';

          const makeNum = () => {
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'helios-ui-number';
            return input;
          };

          const xInput = makeNum();
          const yInput = makeNum();
          const zInput = makeNum();

          const seeded = (() => {
            const v = state.pending.value ?? live?.value;
            const isArrayLike = Array.isArray(v) || ArrayBuffer.isView(v);
            if (isArrayLike && v.length >= 3) {
              const x = Number(v[0]);
              const y = Number(v[1]);
              const z = Number(v[2]);
              if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) return [x, y, z];
            }
            return [0, 0, 0];
          })();

          if (!Array.isArray(state.pending.value) && !ArrayBuffer.isView(state.pending.value)) {
            state.pending = { ...state.pending, type: 'constant', value: seeded };
          }

          xInput.value = String(seeded[0]);
          yInput.value = String(seeded[1]);
          zInput.value = String(seeded[2]);

          const commit = () => {
            const x = clampNumber(xInput.value);
            const y = clampNumber(yInput.value);
            const z = clampNumber(zInput.value);
            if (x == null || y == null || z == null) return;
            state.pending = { ...state.pending, type: 'constant', value: [x, y, z] };
            setDirty(true);
          };
          xInput.addEventListener('change', commit);
          yInput.addEventListener('change', commit);
          zInput.addEventListener('change', commit);

          wrap.appendChild(xInput);
          wrap.appendChild(yInput);
          wrap.appendChild(zInput);
          editorBody.appendChild(createAlignedRow({
            title: 'Value',
            hint: 'Use a fixed value for every item (node/edge).',
            controls: wrap,
          }).row);
        }

        if (pendingType === 'constant' && isColor) {
          const wrap = document.createElement('div');
          wrap.style.display = 'grid';
          wrap.style.gap = '6px';
          wrap.style.width = '100%';

          const isEdgeSplitCapable = mode === 'edge' && state.channel === 'color';
          const pendingValue = state.pending.value ?? live?.value;
          const isSplit =
            isEdgeSplitCapable &&
            pendingValue &&
            typeof pendingValue === 'object' &&
            ('source' in pendingValue || 'target' in pendingValue);

          const seedSingle = () => {
            const seed = typeof pendingValue === 'string'
              ? pendingValue
              : (typeof live?.value === 'string' ? live.value : '#ffffff');
            return typeof seed === 'string' && seed.length ? seed : '#ffffff';
          };

          if (isEdgeSplitCapable) {
            const toggle = createToggleControl({
              checked: Boolean(isSplit),
              onLabel: 'Source/Target',
              offLabel: 'Single',
            });
            wrap.appendChild(toggle);

            toggle.addEventListener('change', () => {
              const seed = seedSingle();
              if (toggle.checked) {
                state.pending = { ...state.pending, type: 'constant', value: { source: seed, target: seed } };
              } else {
                const raw = state.pending.value ?? live?.value;
                const next = raw && typeof raw === 'object' ? String(raw.source ?? raw.start ?? seed) : seed;
                state.pending = { ...state.pending, type: 'constant', value: next };
              }
              setDirty(true);
              renderEditor();
            });
          }

          const makeColorControls = ({ label, getValue, setValue }) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            row.style.width = '100%';

            if (label) {
              const labelEl = document.createElement('div');
              labelEl.textContent = label;
              labelEl.style.fontSize = '12px';
              labelEl.style.color = 'var(--helios-ui-muted)';
              labelEl.style.minWidth = '52px';
              row.appendChild(labelEl);
            }

            const swatchWrap = document.createElement('div');
            swatchWrap.className = 'helios-ui-color-swatch';

            const swatch = document.createElement('div');
            swatch.className = 'helios-ui-color-swatch__swatch';

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.className = 'helios-ui-color-swatch__input';
            colorInput.setAttribute('aria-label', label ? `${label} color` : 'Color');

            const alphaInput = document.createElement('input');
            alphaInput.type = 'number';
            alphaInput.className = 'helios-ui-number';
            alphaInput.min = '0';
            alphaInput.max = '1';
            alphaInput.step = '0.01';
            alphaInput.style.maxWidth = '88px';
            alphaInput.title = 'Alpha';

            const alphaLabel = document.createElement('span');
            alphaLabel.textContent = 'Alpha';
            alphaLabel.style.color = 'var(--helios-ui-muted)';

            const rawValue = getValue();
            const liveColor = typeof rawValue === 'string' ? rawValue : '#ffffff';
            const raw = liveColor.startsWith('#') ? liveColor.slice(1) : liveColor;
            const baseHex = raw.length >= 6 ? `#${raw.slice(0, 6)}` : '#ffffff';
            const alphaHex = raw.length === 8 ? raw.slice(6, 8) : 'ff';
            const alpha = Math.round(parseInt(alphaHex, 16) / 255 * 100) / 100;

            colorInput.value = baseHex;
            alphaInput.value = String(Number.isFinite(alpha) ? alpha : 1);
            swatch.style.background = colorInput.value;

            const commit = () => {
              const a = clampNumber(alphaInput.value, { min: 0, max: 1 });
              if (a == null) return;
              setValue(toHex8(colorInput.value, a));
              setDirty(true);
              swatch.style.background = colorInput.value;
            };
            colorInput.addEventListener('input', commit);
            alphaInput.addEventListener('change', commit);

            swatchWrap.appendChild(swatch);
            swatchWrap.appendChild(colorInput);
            row.appendChild(swatchWrap);
            row.appendChild(alphaLabel);
            row.appendChild(alphaInput);
            return row;
          };

          if (isSplit) {
            if (!state.pending.value || typeof state.pending.value !== 'object') {
              const seed = seedSingle();
              state.pending = { ...state.pending, type: 'constant', value: { source: seed, target: seed } };
            }
            wrap.appendChild(makeColorControls({
              label: 'Source',
              getValue: () => String(state.pending.value?.source ?? seedSingle()),
              setValue: (v) => {
                state.pending = { ...state.pending, type: 'constant', value: { ...(state.pending.value ?? {}), source: v } };
              },
            }));
            wrap.appendChild(makeColorControls({
              label: 'Target',
              getValue: () => String(state.pending.value?.target ?? state.pending.value?.source ?? seedSingle()),
              setValue: (v) => {
                state.pending = { ...state.pending, type: 'constant', value: { ...(state.pending.value ?? {}), target: v } };
              },
            }));
            editorBody.appendChild(createAlignedRow({
              title: 'Color',
              hint: 'Constant color applied to all items.',
              controls: wrap,
            }).row);
          } else {
            if (!(typeof state.pending.value === 'string' && state.pending.value.length > 0)) {
              state.pending = { ...state.pending, type: 'constant', value: seedSingle() };
            }
            wrap.appendChild(makeColorControls({
              label: null,
              getValue: () => String(state.pending.value ?? seedSingle()),
              setValue: (v) => {
                state.pending = { ...state.pending, type: 'constant', value: v };
              },
            }));
            editorBody.appendChild(createAlignedRow({
              title: 'Color',
              hint: 'Constant color applied to all items.',
              controls: wrap,
            }).row);
          }
	        }

	        if (pendingType === 'linear') {
	          state.pending = normalizeRuleList(state.pending);
	          const srcRow = document.createElement('div');
	          srcRow.style.display = 'grid';
	          srcRow.style.gap = '6px';

          const attrSelect = document.createElement('select');
          attrSelect.className = 'helios-ui-select';
          const names = listAttributeNames(mode, { channel: state.channel, mapperType: 'linear' });
          const current = typeof state.pending.attributes === 'string'
            ? state.pending.attributes
            : (typeof live?.attributes === 'string' ? live.attributes : '');
          const optBlank = document.createElement('option');
          optBlank.value = '';
          optBlank.textContent = names.length ? 'Select attribute…' : 'No attributes';
          attrSelect.appendChild(optBlank);
          for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            attrSelect.appendChild(opt);
          }
          attrSelect.value = names.includes(current) ? current : '';
          attrSelect.addEventListener('change', () => {
            const attr = attrSelect.value || undefined;
            const domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
            const nextPending = { ...state.pending, type: 'linear', attributes: attr, domain };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
            setDirty(true);
            renderEditor();
          });
          editorBody.appendChild(createAlignedRow({
            title: 'Attribute',
            hint: 'Pick the attribute to read values from.',
            controls: attrSelect,
          }).row);

          const transformWrap = document.createElement('div');
          transformWrap.style.display = 'flex';
          transformWrap.style.gap = '8px';
          transformWrap.style.alignItems = 'center';
          transformWrap.style.width = '100%';

          const transformSelect = document.createElement('select');
          transformSelect.className = 'helios-ui-select';
          transformSelect.style.flex = '1 1 auto';
          transformSelect.style.maxWidth = 'none';
          transformSelect.style.minWidth = '0';
          for (const optVal of ['linear', 'log', 'log1p', 'logit', 'power', 'percentile']) {
            const opt = document.createElement('option');
            opt.value = optVal;
            opt.textContent = formatTransformLabel(optVal);
            transformSelect.appendChild(opt);
          }
          const resolvedTransformType = state.pending.transformType === 'quantile'
            ? 'percentile'
            : (state.pending.transformType ?? 'linear');
          transformSelect.value = String(resolvedTransformType);

          const powerInput = document.createElement('input');
          powerInput.type = 'number';
          powerInput.className = 'helios-ui-number';
          powerInput.style.maxWidth = '96px';
          powerInput.style.flex = '0 0 auto';
          powerInput.value = String(Number.isFinite(Number(state.pending.transformPower)) ? state.pending.transformPower : 1);
          powerInput.hidden = transformSelect.value !== 'power';

          transformSelect.addEventListener('change', () => {
            const nextType = transformSelect.value || 'linear';
            const prevType = state.pending.transformType ?? 'linear';
            powerInput.hidden = nextType !== 'power';
            const nextPending = { ...state.pending, type: 'linear', transformType: nextType };
            if (isPercentileTransform(nextType)) {
              nextPending.domain = [0, 1];
              markDomainAuto(nextPending, true);
            } else if (isPercentileTransform(prevType)) {
              const attr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
              nextPending.domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
              markDomainAuto(nextPending, true);
            }
            state.pending = nextPending;
            if (nextType !== 'power') {
              state.pending = { ...state.pending, type: 'linear', transformPower: undefined };
            } else {
              state.pending = { ...state.pending, type: 'linear', transformPower: Number(powerInput.value) || 1 };
            }
            setDirty(true);
            renderEditor();
          });

          powerInput.addEventListener('change', () => {
            const p = clampNumber(powerInput.value);
            if (p == null) return;
            state.pending = { ...state.pending, type: 'linear', transformType: 'power', transformPower: p };
            setDirty(true);
            renderEditor();
          });

          transformWrap.appendChild(transformSelect);
          transformWrap.appendChild(powerInput);
          editorBody.appendChild(createAlignedRow({
            title: 'Transform',
            hint: 'Optional pre-transform applied before scaling.',
            controls: transformWrap,
          }).row);

          const domainWrap = document.createElement('div');
          domainWrap.style.display = 'grid';
          domainWrap.style.gap = '2px';
          domainWrap.style.width = '100%';

          const domainAttr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
          const transformType = state.pending.transformType ?? 'linear';
          const percentile = isPercentileTransform(transformType);
          const extent = percentile ? { min: 0, max: 1 } : computeScalarExtent(mode, domainAttr);
          const min = extent?.min ?? 0;
          const max = extent?.max ?? 1;
          const isIntegerDomain = Boolean(extent?.isInteger);
          const step = percentile ? 0.01 : suggestStepForRange(min, max, isIntegerDomain);

          if (percentile && (!Array.isArray(state.pending.domain) || state.pending.domain[0] !== 0 || state.pending.domain[1] !== 1)) {
            const nextPending = { ...state.pending, type: 'linear', domain: [0, 1] };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
          } else if (!Array.isArray(state.pending.domain) && domainAttr) {
            const nextPending = { ...state.pending, type: 'linear', domain: [min, max] };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
          }
          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : [min, max];

          const domainHistogram = (showDistributions && domainAttr)
            ? createRangeHistogram({
              view: resolveAttributeView(mode, domainAttr),
              min,
              max,
              range: domain,
              scope: mode,
              rawName: domainAttr,
            })
            : null;
          if (domainHistogram) domainWrap.appendChild(domainHistogram.element);

          const slider = new TwoHandleRange({
            min,
            max,
            step,
            value: domain,
            onChange: (next) => {
              const nextPending = { ...state.pending, type: 'linear', domain: next };
              markDomainAuto(nextPending, false);
              state.pending = nextPending;
              setDirty(true);
              d0.value = String(next[0]);
              d1.value = String(next[1]);
              domainHistogram?.setMarkers(next[0], next[1]);
            },
          });
          registerControl(slider);

          const domainValues = document.createElement('div');
          domainValues.className = 'helios-ui-range2__values';
          const d0 = document.createElement('input');
          d0.type = 'number';
          d0.className = 'helios-ui-number';
          d0.style.maxWidth = '96px';
          const d1 = document.createElement('input');
          d1.type = 'number';
          d1.className = 'helios-ui-number';
          d1.style.maxWidth = '96px';

          d0.value = String(domain[0] ?? min);
          d1.value = String(domain[1] ?? max);

          const commitDomainTyped = () => {
            const a = clampNumber(d0.value);
            const b = clampNumber(d1.value);
            if (a == null || b == null) return;
            let lo = Math.min(a, b);
            let hi = Math.max(a, b);
            if (isIntegerDomain) {
              lo = Math.round(lo);
              hi = Math.round(hi);
            }
            const loSlider = Math.max(min, Math.min(max, lo));
            const hiSlider = Math.max(min, Math.min(max, hi));
            slider.aInput.value = String(loSlider);
            slider.bInput.value = String(hiSlider);
            slider.setVisual(loSlider, hiSlider);
            const nextPending = { ...state.pending, type: 'linear', domain: [lo, hi] };
            markDomainAuto(nextPending, false);
            state.pending = nextPending;
            setDirty(true);
            domainHistogram?.setMarkers(lo, hi);
          };
          d0.addEventListener('change', commitDomainTyped);
          d1.addEventListener('change', commitDomainTyped);

          domainValues.appendChild(d0);
          domainValues.appendChild(d1);
          domainWrap.appendChild(slider.element);
          domainWrap.appendChild(domainValues);
          editorBody.appendChild(createAlignedRow({
            title: 'Domain',
            hint: 'Input range used for scaling (min/max).',
            controls: domainWrap,
          }).row);

          const rangeWrap = document.createElement('div');
          rangeWrap.style.display = 'grid';
          rangeWrap.style.gap = '2px';
          rangeWrap.style.width = '100%';

          const minAllowed = state.channel === 'opacity' ? 0 : 0;
          const maxAllowed = state.channel === 'opacity' ? 1 : null;

          const suggestedRange = suggestRangeForChannel(mode, state.channel);
          const sliderMin = suggestedRange[0];
          const sliderMax = suggestedRange[1];
          const stepOut = suggestStepForRange(sliderMin, sliderMax);

          const range = Array.isArray(state.pending.range) ? state.pending.range : suggestedRange;
          if (!Array.isArray(state.pending.range)) {
            state.pending = { ...state.pending, type: 'linear', range };
          }

          const rangeSlider = new TwoHandleRange({
            min: sliderMin,
            max: sliderMax,
            step: stepOut,
            value: range,
            onChange: (next) => {
              state.pending = { ...state.pending, type: 'linear', range: next };
              setDirty(true);
              r0.value = String(next[0]);
              r1.value = String(next[1]);
            },
          });
          registerControl(rangeSlider);

          const rangeValues = document.createElement('div');
          rangeValues.className = 'helios-ui-range2__values';
          const r0 = document.createElement('input');
          r0.type = 'number';
          r0.className = 'helios-ui-number';
          r0.style.maxWidth = '96px';
          r0.step = String(stepOut);
          if (minAllowed != null) r0.min = String(minAllowed);
          if (maxAllowed != null) r0.max = String(maxAllowed);
          const r1 = document.createElement('input');
          r1.type = 'number';
          r1.className = 'helios-ui-number';
          r1.style.maxWidth = '96px';
          r1.step = String(stepOut);
          if (minAllowed != null) r1.min = String(minAllowed);
          if (maxAllowed != null) r1.max = String(maxAllowed);

          r0.value = String(range[0] ?? suggestedRange[0]);
          r1.value = String(range[1] ?? suggestedRange[1]);

          const commitRangeTyped = () => {
            const a = clampNumber(r0.value, { min: minAllowed, max: maxAllowed });
            const b = clampNumber(r1.value, { min: minAllowed, max: maxAllowed });
            if (a == null || b == null) return;
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            const loSlider = Math.max(sliderMin, Math.min(sliderMax, lo));
            const hiSlider = Math.max(sliderMin, Math.min(sliderMax, hi));
            rangeSlider.aInput.value = String(loSlider);
            rangeSlider.bInput.value = String(hiSlider);
            rangeSlider.setVisual(loSlider, hiSlider);
            state.pending = { ...state.pending, type: 'linear', range: [lo, hi] };
            setDirty(true);
          };
          r0.addEventListener('change', commitRangeTyped);
          r1.addEventListener('change', commitRangeTyped);

          rangeValues.appendChild(r0);
          rangeValues.appendChild(r1);
          rangeWrap.appendChild(rangeSlider.element);
          rangeWrap.appendChild(rangeValues);

          editorBody.appendChild(createAlignedRow({
            title: 'Range',
            hint: 'Output range produced after scaling.',
            controls: rangeWrap,
	          }).row);

	          const advanced = document.createElement('div');

		          const defaultWrap = document.createElement('div');
		          defaultWrap.style.display = 'flex';
		          defaultWrap.style.gap = '8px';
		          defaultWrap.style.alignItems = 'center';
		          defaultWrap.style.width = '100%';

		          const defaultInput = document.createElement('input');
		          defaultInput.type = 'number';
		          defaultInput.className = 'helios-ui-number';
		          defaultInput.style.width = '100%';
		          defaultInput.style.flex = '1 1 auto';
		          defaultInput.style.minWidth = '0';
	          const defaultSeed = Number.isFinite(Number(state.pending.defaultValue)) ? Number(state.pending.defaultValue) : 0;
	          defaultInput.value = String(defaultSeed);
	          defaultInput.addEventListener('change', () => {
	            const v = clampNumber(defaultInput.value);
	            if (v == null) return;
	            state.pending = { ...state.pending, type: 'linear', defaultValue: v };
	            setDirty(true);
	          });

		          const clearDefault = document.createElement('button');
		          clearDefault.type = 'button';
		          clearDefault.className = 'helios-ui-button helios-ui-button--compact';
		          clearDefault.textContent = '×';
		          clearDefault.setAttribute('aria-label', 'Clear default value');
		          clearDefault.addEventListener('click', () => {
		            state.pending = { ...state.pending, type: 'linear', defaultValue: undefined };
		            setDirty(true);
		            renderEditor();
		          });
		          tooltips.attachTooltip(clearDefault, 'Clear the default value.');

		          defaultWrap.appendChild(defaultInput);
		          defaultWrap.appendChild(clearDefault);
		          advanced.appendChild(createAlignedRow({
		            title: 'Default',
		            hint: 'Fallback value when input is missing/invalid.',
		            controls: defaultWrap,
		          }).row);

		          const rulesWrap = document.createElement('div');
		          rulesWrap.style.display = 'grid';
		          rulesWrap.style.gap = '8px';
		          rulesWrap.style.width = '100%';

		          const rulesList = document.createElement('div');
		          rulesList.style.display = 'grid';
		          rulesList.style.gap = '8px';
		          rulesWrap.appendChild(rulesList);

	          const renderRulesList = () => {
	            rulesList.textContent = '';
	            const rules = Array.isArray(state.pending.rules) ? state.pending.rules : [];
	            for (let i = 0; i < rules.length; i += 1) {
	              const rule = rules[i];
	              const spec = rule?.__ui && typeof rule.__ui === 'object'
	                ? rule.__ui
	                : { op: 'eq', rhs: -1, out: 0 };

	              const item = document.createElement('div');
              item.style.display = 'grid';
              item.style.gap = '6px';
              item.style.position = 'relative';
              item.style.padding = '8px';
              item.style.paddingRight = '36px';
	              item.style.borderRadius = '10px';
	              item.style.border = '1px solid color-mix(in srgb, var(--helios-ui-border) 70%, transparent)';
	              item.style.background = 'color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent)';

	              const top = document.createElement('div');
              top.style.display = 'grid';
              top.style.gap = '8px';
              top.style.alignItems = 'center';
              top.style.gridTemplateColumns = 'auto minmax(0, 1fr)';

              const condRow = document.createElement('div');
              condRow.style.display = 'grid';
              condRow.style.gridTemplateColumns = 'auto minmax(0, 1fr) minmax(0, 1fr)';
              condRow.style.gap = '6px';
              condRow.style.alignItems = 'center';
              condRow.style.minWidth = '0';

	              const opSelect = document.createElement('select');
              opSelect.className = 'helios-ui-select helios-ui-select--compact';
              opSelect.style.maxWidth = '56px';
              opSelect.style.width = '100%';
	              const ops = [
	                { value: 'eq', label: '=' },
	                { value: 'lt', label: '<' },
	                { value: 'lte', label: '≤' },
	                { value: 'gt', label: '>' },
	                { value: 'gte', label: '≥' },
	                { value: 'nan', label: 'NaN' },
	                { value: 'nullish', label: 'null' },
	              ];
	              for (const op of ops) {
	                const opt = document.createElement('option');
	                opt.value = op.value;
	                opt.textContent = op.label;
	                opSelect.appendChild(opt);
	              }
	              opSelect.value = ops.some((o) => o.value === spec.op) ? spec.op : 'eq';

	              const rhsInput = document.createElement('input');
	              rhsInput.type = 'number';
	              rhsInput.className = 'helios-ui-number';
              rhsInput.style.maxWidth = 'none';
              rhsInput.style.width = '100%';
	              rhsInput.value = spec.rhs != null ? String(spec.rhs) : '';
	              rhsInput.placeholder = 'value';

	              const outInput = document.createElement('input');
	              outInput.type = 'number';
	              outInput.className = 'helios-ui-number';
              outInput.style.maxWidth = '140px';
              outInput.style.flex = '1 1 96px';
              outInput.style.minWidth = '0';
	              outInput.value = spec.out != null ? String(spec.out) : String(rule.value ?? 0);
	              outInput.placeholder = 'output';

	              const rhsVisible = () => ['eq', 'lt', 'lte', 'gt', 'gte'].includes(opSelect.value);
	              rhsInput.style.display = rhsVisible() ? '' : 'none';

	              const getLiveSpec = () => {
	                const current = state.pending?.rules?.[i]?.__ui;
	                return current && typeof current === 'object' ? current : spec;
	              };

	              const commitRule = (nextSpec) => {
	                const predicate = buildRulePredicate(nextSpec);
	                const out = nextSpec.out != null ? Number(nextSpec.out) : undefined;
	                const nextRule = {
	                  ...rule,
	                  __ui: nextSpec,
	                  when: (inputs) => predicate(inputs),
	                  value: out,
	                };
	                const nextRules = rules.slice();
	                nextRules[i] = nextRule;
	                state.pending = { ...state.pending, type: 'linear', rules: nextRules };
	                setDirty(true);
	              };

	              opSelect.addEventListener('change', () => {
	                rhsInput.style.display = rhsVisible() ? '' : 'none';
	                commitRule({ ...getLiveSpec(), op: opSelect.value });
	              });

	              rhsInput.addEventListener('change', () => {
	                const rhs = clampNumber(rhsInput.value);
	                commitRule({ ...getLiveSpec(), rhs });
	              });

	              outInput.addEventListener('change', () => {
	                const out = clampNumber(outInput.value);
	                commitRule({ ...getLiveSpec(), out });
	              });

	              const ifLabel = createRuleKeyword(i === 0 ? 'if' : 'else if');
              condRow.appendChild(ifLabel);
              condRow.appendChild(opSelect);
              condRow.appendChild(rhsInput);
              tooltips.attachTooltip(opSelect, 'Condition operator.');
              tooltips.attachTooltip(rhsInput, 'Comparison value.');
              tooltips.attachTooltip(outInput, 'Override output.');

              const remove = document.createElement('button');
              remove.type = 'button';
              remove.className = 'helios-ui-button helios-ui-button--compact';
              remove.textContent = '×';
              remove.setAttribute('aria-label', 'Remove override');
              tooltips.attachTooltip(remove, 'Remove this override.');
              remove.style.position = 'absolute';
              remove.style.top = '8px';
              remove.style.right = '8px';
	              remove.addEventListener('click', () => {
	                const nextRules = rules.filter((_, idx) => idx !== i);
	                state.pending = { ...state.pending, type: 'linear', rules: nextRules };
	                setDirty(true);
	                renderRulesList();
	              });

              top.appendChild(condRow);

              const outWrap = document.createElement('div');
              outWrap.style.display = 'grid';
              outWrap.style.gridTemplateColumns = 'auto minmax(0, 1fr)';
              outWrap.style.gap = '6px';
              outWrap.style.alignItems = 'center';
              outWrap.style.width = '100%';

              outInput.style.width = '100%';

              outWrap.appendChild(createRuleKeyword('then'));
              outWrap.appendChild(outInput);

              item.appendChild(top);
              item.appendChild(outWrap);
              item.appendChild(remove);
              rulesList.appendChild(item);
            }
          };

	          const addRuleButton = document.createElement('button');
	          addRuleButton.type = 'button';
	          addRuleButton.className = 'helios-ui-button helios-ui-button--compact';
	          addRuleButton.textContent = 'Add';
	          addRuleButton.setAttribute('aria-label', 'Add override');
	          tooltips.attachTooltip(addRuleButton, 'Add a value override (rule).');
	          addRuleButton.addEventListener('click', () => {
	            const spec = { op: 'eq', rhs: -1, out: 0 };
	            const predicate = buildRulePredicate(spec);
	            const nextRule = { __ui: spec, when: (inputs) => predicate(inputs), value: spec.out };
	            const nextRules = [...(state.pending.rules ?? []), nextRule];
	            state.pending = { ...state.pending, type: 'linear', rules: nextRules };
	            setDirty(true);
	            renderRulesList();
	          });

	          renderRulesList();
	          const overridesSection = createSubsectionHeader({
	            title: 'Overrides',
	            tooltip: 'Rules applied before the base mapping.',
	            action: addRuleButton,
	          });
	          overridesSection.wrap.appendChild(rulesWrap);
	          advanced.appendChild(overridesSection.wrap);

	          const advancedStack = new PanelStack();
	          advancedStack.add({ id: `${mode}-mapper-advanced`, title: 'Advanced', collapsed: true, content: advanced });
	          editorBody.appendChild(advancedStack.element);
	          ui._controlCleanups.add(() => advancedStack.destroy());
		        }

          if (pendingType === 'categorical') {
            const ensureCategoricalMeta = () => {
              const meta = state.pending.meta && typeof state.pending.meta === 'object' ? { ...state.pending.meta } : {};
              const categorical = meta.categorical && typeof meta.categorical === 'object' ? { ...meta.categorical } : {};
              if (!categorical.sortOrder) categorical.sortOrder = 'frequency';
              if (categorical.maxCategories == null) categorical.maxCategories = null;
              if (!categorical.palette) categorical.palette = defaultCategoricalPalette;
              if (categorical.preferScheme == null) categorical.preferScheme = true;
              if (!categorical.numericDirection) categorical.numericDirection = 'asc';
              if (categorical.numericRange == null) categorical.numericRange = null;
              meta.categorical = categorical;
              return meta;
            };

            const updatePendingMeta = (meta) => {
              state.pending = { ...state.pending, type: 'categorical', meta };
            };

            if (!state.pending.meta || typeof state.pending.meta !== 'object') {
              state.pending = { ...state.pending, type: 'categorical', meta: ensureCategoricalMeta() };
            }
            const getCategoricalSettings = () => {
              const metaNow = ensureCategoricalMeta();
              const categoricalNow = metaNow.categorical ?? {};
              const paletteNameNow = categoricalNow.palette ?? defaultCategoricalPalette;
              const preferSchemeNow = categoricalNow.preferScheme !== false;
              const sortOrderNow = categoricalNow.sortOrder ?? 'frequency';
              const rawMax = categoricalNow.maxCategories;
              const parsedMax = rawMax == null || rawMax === '' ? null : Number(rawMax);
              const maxCategoriesNow = Number.isFinite(parsedMax)
                ? Math.max(1, Math.floor(parsedMax))
                : null;
              return {
                meta: metaNow,
                categorical: categoricalNow,
                paletteName: paletteNameNow,
                preferScheme: preferSchemeNow,
                sortOrder: sortOrderNow,
                maxCategories: maxCategoriesNow,
              };
            };

            const { paletteName, preferScheme, sortOrder, maxCategories } = getCategoricalSettings();

            const attrSelect = document.createElement('select');
            attrSelect.className = 'helios-ui-select';
            const names = listAttributeNames(mode, { channel: state.channel, mapperType: 'categorical' });
            const current = typeof state.pending.attributes === 'string'
              ? state.pending.attributes
              : (typeof live?.attributes === 'string' ? live.attributes : '');
            const optBlank = document.createElement('option');
            optBlank.value = '';
            optBlank.textContent = names.length ? 'Select attribute…' : 'No categorical attributes';
            attrSelect.appendChild(optBlank);
            for (const name of names) {
              const opt = document.createElement('option');
              opt.value = name;
              opt.textContent = name;
              attrSelect.appendChild(opt);
            }
            attrSelect.value = names.includes(current) ? current : '';
            attrSelect.addEventListener('change', () => {
              const attr = attrSelect.value || undefined;
              const nextMeta = ensureCategoricalMeta();
              state.pending = {
                ...state.pending,
                type: 'categorical',
                attributes: attr,
                domain: [],
                range: [],
                meta: nextMeta,
              };
              setDirty(true);
              renderEditor();
            });
            editorBody.appendChild(createAlignedRow({
              title: 'Attribute',
              hint: 'Pick the categorical attribute to drive colors.',
              controls: attrSelect,
            }).row);

            const attrName = attrSelect.value || '';
            const attrInfo = attrName ? getAttributeInfo(mode, attrName) : null;
            if (!attrName) {
              const note = document.createElement('div');
              note.style.color = 'var(--helios-ui-muted)';
              note.textContent = 'Select a categorical attribute to configure colors.';
              editorBody.appendChild(note);
            }

            if (attrName && attrInfo && isStringAttributeType(attrInfo.type)) {
              const scan = scanStringCategorization(mode, attrName);
              const note = document.createElement('div');
              note.style.color = 'var(--helios-ui-muted)';
              note.textContent = scan.ok
                ? `String attribute detected. ${scan.uniqueCount ?? 0} unique values (max length ${scan.maxLength ?? 0}).`
                : `Cannot categorize: ${scan.reason}`;
              editorBody.appendChild(note);

              const convertButton = document.createElement('button');
              convertButton.type = 'button';
              convertButton.className = 'helios-ui-button helios-ui-button--compact';
              convertButton.textContent = 'Convert to categorical';
              convertButton.disabled = !scan.ok;
              convertButton.addEventListener('click', () => {
                const network = net();
                if (!network) return;
                const order = sortOrder === 'manual' ? 'frequency' : sortOrder;
                try {
                  if (mode === 'edge') {
                    network.categorizeEdgeAttribute?.(attrName, { sortOrder: order });
                  } else {
                    network.categorizeNodeAttribute?.(attrName, { sortOrder: order });
                  }
                  state.pending = { ...state.pending, type: 'categorical', domain: [], range: [] };
                  setDirty(true);
                  renderEditor();
                } catch (error) {
                  console.warn('Failed to categorize string attribute', error);
                }
              });
              editorBody.appendChild(createAlignedRow({
                title: 'Categorize',
                hint: 'Convert string values to categorical codes for mapping.',
                controls: convertButton,
              }).row);
              syncApplyEnabled();
              return;
            }

            if (attrName && attrInfo && !isCategoricalAttributeType(attrInfo.type)) {
              const note = document.createElement('div');
              note.style.color = 'var(--helios-ui-muted)';
              note.textContent = 'Selected attribute is not categorical.';
              editorBody.appendChild(note);
              syncApplyEnabled();
              return;
            }

            const entriesRaw = attrName ? resolveCategoryEntries(mode, attrName) : [];
            if (!entriesRaw.length) {
              const note = document.createElement('div');
              note.style.color = 'var(--helios-ui-muted)';
              note.textContent = 'No categories found for this attribute.';
              editorBody.appendChild(note);
              syncApplyEnabled();
              return;
            }

            const pendingDomain = Array.isArray(state.pending.domain) ? state.pending.domain : [];
            const entries = entriesRaw;
            if (!entries.length) {
              const note = document.createElement('div');
              note.style.color = 'var(--helios-ui-muted)';
              note.textContent = 'No categories found for this attribute.';
              editorBody.appendChild(note);
              syncApplyEnabled();
              return;
            }
            const pendingRange = Array.isArray(state.pending.range) ? state.pending.range : [];
            const entryIds = new Set(entries.map((entry) => entry.id));
            const hasMissing = pendingDomain.some((id) => !entryIds.has(id));
            const hasNew = entries.some((entry) => !pendingDomain.includes(entry.id));
            const needsRebuild =
              pendingDomain.length === 0 ||
              pendingRange.length !== pendingDomain.length ||
              hasMissing ||
              hasNew;

            const AUTO_MAX_CATEGORIES = 20;
            const resolveMaxCategories = (count) => {
              const { maxCategories, preferScheme, paletteName } = getCategoricalSettings();
              if (maxCategories) return Math.min(count, maxCategories);
              let cap = count;
              if (preferScheme) {
                const resolved = resolveColormap(paletteName);
                if (resolved?.isScheme && typeof resolved.scheme === 'function') {
                  const scheme = resolved.scheme();
                  if (Array.isArray(scheme) && scheme.length) cap = Math.min(cap, scheme.length);
                }
              }
              if (cap > AUTO_MAX_CATEGORIES) cap = AUTO_MAX_CATEGORIES;
              return cap;
            };

            const buildOrderedEntries = () => {
              const { sortOrder } = getCategoricalSettings();
              const list = entries.slice();
              if (sortOrder === 'alphabetical') {
                list.sort((a, b) => a.label.localeCompare(b.label));
              } else if (sortOrder === 'natural') {
                list.sort((a, b) => naturalCompare(a.label, b.label));
              } else if (sortOrder === 'manual') {
                const order = Array.isArray(state.pending.domain) ? state.pending.domain : [];
                const byId = new Map(list.map((entry) => [entry.id, entry]));
                const ordered = order.map((id) => byId.get(id)).filter(Boolean);
                const seen = new Set(ordered.map((entry) => entry.id));
                for (const entry of list) {
                  if (!seen.has(entry.id)) ordered.push(entry);
                }
                return ordered.slice(0, resolveMaxCategories(ordered.length));
              } else {
                list.sort((a, b) => (b.count - a.count) || a.label.localeCompare(b.label));
              }
              return list.slice(0, resolveMaxCategories(list.length));
            };

            const isColorChannel = state.channel === 'color' || state.channel === 'outlineColor';
            const [suggestMin, suggestMax] = suggestRangeForChannel(mode, state.channel);
            const numericStep = suggestStepForRange(suggestMin, suggestMax);
            const resolveNumericSettings = () => {
              const { categorical } = getCategoricalSettings();
              const raw = Array.isArray(categorical?.numericRange) ? categorical.numericRange : [];
              let min = Number(raw[0]);
              let max = Number(raw[1]);
              if (!Number.isFinite(min)) min = suggestMin;
              if (!Number.isFinite(max)) max = suggestMax;
              if (min === max) max = min + 1;
              const direction = categorical?.numericDirection === 'desc' ? 'desc' : 'asc';
              return { min, max, direction };
            };
            const buildNumericPalette = (count) => {
              const { min, max, direction } = resolveNumericSettings();
              if (!Number.isFinite(count) || count <= 1) return [min];
              const span = max - min;
              const values = Array.from({ length: count }, (_, i) => min + (span * i) / (count - 1));
              return direction === 'desc' ? values.reverse() : values;
            };

            const applyOrdering = ({ forcePalette = false } = {}) => {
              const { paletteName, preferScheme } = getCategoricalSettings();
              const ordered = buildOrderedEntries();
              const currentDomain = Array.isArray(state.pending.domain) ? state.pending.domain : [];
              const currentRange = Array.isArray(state.pending.range) ? state.pending.range : [];
              const colorById = new Map();
              for (let i = 0; i < currentDomain.length; i += 1) {
                colorById.set(currentDomain[i], currentRange[i]);
              }
              const palette = isColorChannel
                ? resolveCategoricalPalette({
                    paletteName,
                    count: ordered.length,
                    preferScheme,
                  })
                : buildNumericPalette(ordered.length);
              const domain = ordered.map((entry) => entry.id);
              const range = ordered.map((entry, idx) => {
                if (!forcePalette && colorById.has(entry.id)) return colorById.get(entry.id);
                if (isColorChannel) return palette[idx] ?? colorFromIndex(idx);
                return palette[idx] ?? suggestMin;
              });
              const nextMeta = ensureCategoricalMeta();
              const nextPending = { ...state.pending, type: 'categorical', domain, range, meta: nextMeta };
              state.pending = nextPending;
              setDirty(true);
            };

            if (needsRebuild) {
              applyOrdering({ forcePalette: pendingDomain.length === 0 || pendingRange.length !== pendingDomain.length });
            }

            const orderSelect = document.createElement('select');
            orderSelect.className = 'helios-ui-select';
            const orderOptions = [
              { value: 'frequency', label: 'Frequency' },
              { value: 'alphabetical', label: 'Alphabetical' },
              { value: 'natural', label: 'Natural' },
              { value: 'manual', label: 'Manual' },
            ];
            for (const optInfo of orderOptions) {
              const opt = document.createElement('option');
              opt.value = optInfo.value;
              opt.textContent = optInfo.label;
              orderSelect.appendChild(opt);
            }
            orderSelect.value = orderOptions.some((o) => o.value === sortOrder) ? sortOrder : 'frequency';
            orderSelect.addEventListener('change', () => {
              const nextMeta = ensureCategoricalMeta();
              nextMeta.categorical.sortOrder = orderSelect.value;
              updatePendingMeta(nextMeta);
              applyOrdering({ forcePalette: false });
              renderEditor();
            });
            const maxWrap = document.createElement('div');
            maxWrap.style.display = 'flex';
            maxWrap.style.gap = '8px';
            maxWrap.style.alignItems = 'center';
            maxWrap.style.width = '100%';
            const maxInput = document.createElement('input');
            maxInput.type = 'number';
            maxInput.className = 'helios-ui-number';
            maxInput.min = '1';
            maxInput.placeholder = 'Auto';
            maxInput.value = maxCategories ? String(maxCategories) : '';
            maxInput.addEventListener('change', () => {
              const value = clampNumber(maxInput.value, { min: 1 });
              const nextMeta = ensureCategoricalMeta();
              nextMeta.categorical.maxCategories = Number.isFinite(value) ? Math.floor(value) : null;
              updatePendingMeta(nextMeta);
              applyOrdering({ forcePalette: false });
              renderEditor();
            });
            maxWrap.appendChild(maxInput);
            const buildFullWidthControl = ({ label, hint, control, alignRight = false }) => {
              const wrap = document.createElement('div');
              wrap.style.display = 'grid';
              wrap.style.gap = '1px';
              wrap.style.width = '100%';
              const labelEl = document.createElement('div');
              labelEl.textContent = label ?? '';
              labelEl.style.fontSize = '12px';
              labelEl.style.color = 'var(--helios-ui-muted)';
              if (alignRight) {
                labelEl.style.textAlign = 'right';
                labelEl.style.alignSelf = 'end';
              }
              if (hint) tooltips.attachTooltip?.(labelEl, hint);
              wrap.appendChild(labelEl);
              wrap.appendChild(control);
              return wrap;
            };

            let applyPaletteButton = null;
            if (isColorChannel) {
              const paletteEntries = categoricalPaletteCatalog.map((entry) => ({
                ...entry,
                search: `${entry.key} ${entry.label} ${entry.group}`.toLowerCase(),
              }));
              const paletteCatalog = (() => {
                const byGroup = new Map();
                const byKey = new Map();
                for (const entry of paletteEntries) {
                  const list = byGroup.get(entry.group) ?? [];
                  list.push(entry);
                  byGroup.set(entry.group, list);
                  byKey.set(entry.key, entry);
                }
                for (const list of byGroup.values()) {
                  list.sort((a, b) => a.label.localeCompare(b.label));
                }
                return { entries: paletteEntries, byGroup, byKey };
              })();

              const palettePicker = document.createElement('div');
              palettePicker.className = 'helios-ui-colormap-picker';
              const paletteDisplay = document.createElement('button');
              paletteDisplay.type = 'button';
              paletteDisplay.className = 'helios-ui-select helios-ui-colormap-picker__display';
	
              const paletteDisplayLabel = document.createElement('span');
              paletteDisplayLabel.className = 'helios-ui-ellipsis';
              paletteDisplay.appendChild(paletteDisplayLabel);

              const palettePreview = document.createElement('div');
              palettePreview.className = 'helios-ui-colormap-picker__preview helios-ui-colormap-thumb';

              const palettePopover = document.createElement('div');
              palettePopover.className = 'helios-ui-colormap-popover';
              palettePopover.hidden = true;

              const palettePopoverPanel = document.createElement('div');
              palettePopoverPanel.className = 'helios-ui-colormap-popover__panel';
              palettePopover.appendChild(palettePopoverPanel);

              const paletteHeader = document.createElement('div');
              paletteHeader.className = 'helios-ui-colormap-popover__header';
              const paletteSearch = document.createElement('input');
              paletteSearch.type = 'text';
              paletteSearch.className = 'helios-ui-text helios-ui-colormap-popover__search';
              paletteSearch.placeholder = 'Search palettes (e.g. tableau, scheme)…';
              paletteHeader.appendChild(paletteSearch);
              palettePopoverPanel.appendChild(paletteHeader);

              const paletteList = document.createElement('div');
              paletteList.className = 'helios-ui-colormap-popover__list';
              palettePopoverPanel.appendChild(paletteList);

              const palettePortal = ui?.container ?? document.body;
              palettePortal.appendChild(palettePopover);
              const paletteCleanups = [];
              const registerPaletteCleanup = (fn) => {
                if (typeof fn === 'function') paletteCleanups.push(fn);
              };
              registerPaletteCleanup(() => palettePopover.remove());

              const paletteToCssGradient = (palette, { isScheme = false } = {}) => {
                if (!Array.isArray(palette) || palette.length === 0) {
                  return 'linear-gradient(90deg, rgba(120,120,120,1), rgba(40,40,40,1))';
                }
                if (palette.length === 1) {
                  return `linear-gradient(90deg, ${palette[0]}, ${palette[0]})`;
                }
                if (isScheme) {
                  const step = 100 / palette.length;
                  const stops = palette.flatMap((color, idx) => {
                    const start = (idx * step).toFixed(2);
                    const end = ((idx + 1) * step).toFixed(2);
                    return [`${color} ${start}%`, `${color} ${end}%`];
                  });
                  return `linear-gradient(90deg, ${stops.join(', ')})`;
                }
                const stops = palette.map((color, idx) => {
                  const pct = (idx / (palette.length - 1)) * 100;
                  return `${color} ${pct.toFixed(2)}%`;
                });
                return `linear-gradient(90deg, ${stops.join(', ')})`;
              };

              const resolvePaletteDisplay = (keyRaw) => {
                const key = String(keyRaw ?? '').trim();
                if (!key) return '';
                const entry = paletteCatalog.byKey.get(key);
                if (!entry) return key;
                return `${entry.group}: ${entry.label}`;
              };

              const updatePalettePreview = (keyRaw) => {
                const key = String(keyRaw ?? '').trim() || defaultCategoricalPalette;
                const resolved = resolveColormap(key);
                const palette = resolveCategoricalPalette({
                  paletteName: key,
                  count: 8,
                  preferScheme,
                });
                palettePreview.style.backgroundImage = paletteToCssGradient(palette, { isScheme: resolved?.isScheme });
              };

              const applyPaletteUi = (keyRaw) => {
                const key = String(keyRaw ?? '').trim() || defaultCategoricalPalette;
                paletteDisplayLabel.textContent = resolvePaletteDisplay(key);
                paletteDisplay.title = paletteDisplayLabel.textContent;
                paletteDisplay.dataset.colormapKey = key;
                updatePalettePreview(key);
              };

              const setSelectedPalette = (keyRaw) => {
                const key = String(keyRaw ?? '').trim() || defaultCategoricalPalette;
                const nextMeta = ensureCategoricalMeta();
                nextMeta.categorical.palette = key;
                updatePendingMeta(nextMeta);
                applyPaletteUi(key);
                applyOrdering({ forcePalette: true });
                setDirty(true);
              };

              applyPaletteUi(paletteName);

              let paletteObserver = null;
              const ensurePaletteObserver = () => {
                if (paletteObserver) return paletteObserver;
                if (typeof IntersectionObserver !== 'function') return null;
                paletteObserver = new IntersectionObserver((entries) => {
                  for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const el = entry.target;
                    const key = el?.dataset?.colormapKey;
                    if (!key) continue;
                    if (el.dataset.colormapReady === '1') continue;
                    el.dataset.colormapReady = '1';
                    const resolved = resolveColormap(key);
                    const previewPalette = resolveCategoricalPalette({
                      paletteName: key,
                      count: 8,
                      preferScheme,
                    });
                    el.style.backgroundImage = paletteToCssGradient(previewPalette, { isScheme: resolved?.isScheme });
                    paletteObserver.unobserve(el);
                  }
                }, { root: palettePopoverPanel, rootMargin: '64px' });
                registerPaletteCleanup(() => {
                  paletteObserver?.disconnect?.();
                  paletteObserver = null;
                });
                return paletteObserver;
              };

              const renderPalettePopover = (queryRaw) => {
                paletteList.replaceChildren();
                const query = String(queryRaw ?? '').trim().toLowerCase();
                const tokens = query.split(/\s+/).filter(Boolean);
                const matches = paletteCatalog.entries.filter((entry) => {
                  if (preferScheme && !String(entry.key).startsWith('scheme')) return false;
                  if (!tokens.length) return true;
                  return tokens.every((t) => entry.search.includes(t));
                });
	
                if (!matches.length) {
                  const note = document.createElement('div');
                  note.className = 'helios-ui-colormap-picker__note';
                  note.textContent = 'No matches.';
                  paletteList.appendChild(note);
                  return;
                }

                const groupOrder = ['d3 schemes', 'd3 ramps', 'cmasher schemes', 'cmasher ramps', 'CET schemes', 'CET ramps', 'helios schemes', 'helios ramps', 'other'];
                const matchesByGroup = new Map();
                for (const entry of matches) {
                  const list = matchesByGroup.get(entry.group) ?? [];
                  list.push(entry);
                  matchesByGroup.set(entry.group, list);
                }
                for (const list of matchesByGroup.values()) {
                  list.sort((a, b) => a.label.localeCompare(b.label));
                }

                const capPerGroup = tokens.length ? 60 : 5000;
                const capTotal = tokens.length ? 220 : 5000;
                let total = 0;
                const observer = ensurePaletteObserver();

                for (const group of groupOrder) {
                  const list = matchesByGroup.get(group);
                  if (!list?.length) continue;

                  const section = document.createElement('div');
                  section.className = 'helios-ui-colormap-section';
	
                  const title = document.createElement('div');
                  title.className = 'helios-ui-colormap-section__title';
                  title.textContent = group;
                  section.appendChild(title);
	
                  const body = document.createElement('div');
                  body.className = 'helios-ui-colormap-section__body';
	
                  const visible = list.slice(0, capPerGroup);
                  for (const entry of visible) {
                    if (total >= capTotal) break;
                    total += 1;

                    const item = document.createElement('button');
                    item.type = 'button';
                    item.className = 'helios-ui-colormap-picker__item';
                    item.dataset.key = entry.key;

                    const itemTitle = document.createElement('div');
                    itemTitle.className = 'helios-ui-colormap-picker__item-title helios-ui-ellipsis';
                    itemTitle.textContent = entry.label;
                    itemTitle.title = `${entry.key}`;

                    const itemThumb = document.createElement('div');
                    itemThumb.className = 'helios-ui-colormap-thumb helios-ui-colormap-thumb--small';
                    itemThumb.dataset.colormapKey = entry.key;
                    itemThumb.dataset.colormapReady = '0';
                    itemThumb.style.backgroundImage = 'linear-gradient(90deg, rgba(60,60,60,1), rgba(30,30,30,1))';
                    observer?.observe?.(itemThumb);

                    item.appendChild(itemTitle);
                    item.appendChild(itemThumb);

                    item.addEventListener('pointerdown', (e) => {
                      e.preventDefault();
                      setSelectedPalette(entry.key);
                      palettePopover.hidden = true;
                    });

                    body.appendChild(item);
                  }

                  if (list.length > capPerGroup) {
                    const note = document.createElement('div');
                    note.className = 'helios-ui-colormap-picker__note';
                    note.textContent = `Showing ${capPerGroup} of ${list.length} in ${group}.`;
                    body.appendChild(note);
                  }

                  section.appendChild(body);
                  paletteList.appendChild(section);
                  if (total >= capTotal) break;
                }

                if (matches.length > capTotal) {
                  const note = document.createElement('div');
                  note.className = 'helios-ui-colormap-picker__note';
                  note.textContent = `Showing ${capTotal} of ${matches.length}. Refine your search.`;
                  paletteList.appendChild(note);
                }
              };

              const paletteOffset = 6;
              const paletteMargin = 10;
              const paletteMinHeight = 180;
              const paletteMinWidth = 240;
              const paletteMaxWidth = 420;
              const paletteMaxHeight = 420;

              const positionPalettePopover = () => {
                if (palettePopover.hidden) return;
                const anchor = paletteDisplay.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;

                const spaceBelow = vh - anchor.bottom - paletteMargin;
                const spaceAbove = anchor.top - paletteMargin;
                const spaceRight = vw - anchor.right - paletteMargin;
                const spaceLeft = anchor.left - paletteMargin;

                palettePopover.style.width = `${Math.max(paletteMinWidth, Math.min(paletteMaxWidth, anchor.width))}px`;
                palettePopover.style.left = '0px';
                palettePopover.style.top = '0px';
                palettePopover.hidden = false;

                const measured = palettePopoverPanel.getBoundingClientRect();
                const desiredW = measured.width || Math.max(paletteMinWidth, Math.min(paletteMaxWidth, anchor.width));
                const desiredH = palettePopoverPanel.scrollHeight || measured.height || paletteMinHeight;

                const canVertical = Math.max(spaceBelow, spaceAbove) >= paletteMinHeight;
                const preferBelow = spaceBelow >= spaceAbove;
                const canHorizontal = Math.max(spaceRight, spaceLeft) >= paletteMinWidth;
                const preferRight = spaceRight >= spaceLeft;

                let placement = 'bottom';
                if (canVertical) {
                  placement = preferBelow ? 'bottom' : 'top';
                } else if (canHorizontal) {
                  placement = preferRight ? 'right' : 'left';
                } else {
                  const best = [
                    { side: 'bottom', size: spaceBelow },
                    { side: 'top', size: spaceAbove },
                    { side: 'right', size: spaceRight },
                    { side: 'left', size: spaceLeft },
                  ].sort((a, b) => b.size - a.size)[0];
                  placement = best?.side ?? 'bottom';
                }

                let left = anchor.left;
                let top = anchor.bottom + paletteOffset;
                let maxH = Math.max(80, spaceBelow);
	
                if (placement === 'top') {
                  maxH = Math.max(80, spaceAbove);
                  top = Math.max(paletteMargin, anchor.top - paletteOffset - Math.min(desiredH, maxH));
                } else if (placement === 'right') {
                  left = anchor.right + paletteOffset;
                  top = anchor.top;
                  maxH = Math.max(80, vh - 2 * paletteMargin);
                } else if (placement === 'left') {
                  left = Math.max(paletteMargin, anchor.left - paletteOffset - desiredW);
                  top = anchor.top;
                  maxH = Math.max(80, vh - 2 * paletteMargin);
                }

                left = Math.max(paletteMargin, Math.min(vw - paletteMargin - desiredW, left));
                top = Math.max(paletteMargin, Math.min(vh - paletteMargin - 80, top));
	
                palettePopover.style.width = `${Math.min(desiredW, vw - 2 * paletteMargin)}px`;
                palettePopover.style.left = `${left}px`;
                palettePopover.style.top = `${top}px`;
	
                const bottomLimit = placement === 'top' ? Math.max(paletteMargin, anchor.top - paletteOffset) : vh - paletteMargin;
                const availableH = Math.max(120, bottomLimit - top);
                palettePopoverPanel.style.maxHeight = `${Math.min(paletteMaxHeight, availableH)}px`;
                paletteList.style.maxHeight = '';
              };

              const closePalettePopover = () => {
                palettePopover.hidden = true;
              };

              const onPaletteDocPointerDown = (e) => {
                const target = e.target;
                if (palettePopover.hidden) return;
                if (target && (palettePopover.contains(target) || palettePicker.contains(target))) return;
                closePalettePopover();
              };

              let pendingPalettePosition = false;
              const schedulePalettePosition = () => {
                if (pendingPalettePosition) return;
                pendingPalettePosition = true;
                requestAnimationFrame(() => {
                  pendingPalettePosition = false;
                  positionPalettePopover();
                });
              };

              const onPaletteDocScroll = (e) => {
                if (palettePopover.hidden) return;
                const target = e?.target;
                if (target && palettePopoverPanel.contains(target)) return;
                schedulePalettePosition();
              };
              const onPaletteResize = () => schedulePalettePosition();

              document.addEventListener('pointerdown', onPaletteDocPointerDown, true);
              document.addEventListener('scroll', onPaletteDocScroll, true);
              window.addEventListener('resize', onPaletteResize);
              registerPaletteCleanup(() => document.removeEventListener('pointerdown', onPaletteDocPointerDown, true));
              registerPaletteCleanup(() => document.removeEventListener('scroll', onPaletteDocScroll, true));
              registerPaletteCleanup(() => window.removeEventListener('resize', onPaletteResize));

              const openPalettePopover = ({ seedQuery } = {}) => {
                palettePopover.hidden = false;
                paletteSearch.value = seedQuery != null ? String(seedQuery) : '';
                renderPalettePopover(paletteSearch.value);
                positionPalettePopover();
                queueMicrotask(() => paletteSearch.focus());
              };

              const onPaletteDisplayClick = () => openPalettePopover();
              const onPalettePreviewClick = () => openPalettePopover();
              const onPaletteDisplayKeyDown = (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openPalettePopover();
                  return;
                }
                if (e.key && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
                  e.preventDefault();
                  openPalettePopover({ seedQuery: e.key });
                }
              };

              paletteDisplay.addEventListener('click', onPaletteDisplayClick);
              palettePreview.addEventListener('click', onPalettePreviewClick);
              paletteDisplay.addEventListener('keydown', onPaletteDisplayKeyDown);
              registerPaletteCleanup(() => paletteDisplay.removeEventListener('click', onPaletteDisplayClick));
              registerPaletteCleanup(() => palettePreview.removeEventListener('click', onPalettePreviewClick));
              registerPaletteCleanup(() => paletteDisplay.removeEventListener('keydown', onPaletteDisplayKeyDown));

              const onPaletteSearch = () => {
                renderPalettePopover(paletteSearch.value);
                positionPalettePopover();
              };
              paletteSearch.addEventListener('input', onPaletteSearch);
              registerPaletteCleanup(() => paletteSearch.removeEventListener('input', onPaletteSearch));

              const onPaletteSearchKeyDown = (e) => {
                if (e.key === 'Escape') {
                  closePalettePopover();
                  paletteDisplay.focus();
                }
                if (e.key === 'Enter' && (paletteSearch.value ?? '').trim()) {
                  closePalettePopover();
                  const typed = String(paletteSearch.value ?? '').trim();
                  if (paletteCatalog.byKey.has(typed)) setSelectedPalette(typed);
                }
              };
              paletteSearch.addEventListener('keydown', onPaletteSearchKeyDown);
              registerPaletteCleanup(() => paletteSearch.removeEventListener('keydown', onPaletteSearchKeyDown));

              const onPaletteFocusOut = () => {
                queueMicrotask(() => {
                  if (!palettePicker.contains(document.activeElement) && !palettePopover.contains(document.activeElement)) {
                    closePalettePopover();
                  }
                });
              };
              palettePicker.addEventListener('focusout', onPaletteFocusOut);
              registerPaletteCleanup(() => palettePicker.removeEventListener('focusout', onPaletteFocusOut));

              registerControl({
                destroy() {
                  for (const cleanup of paletteCleanups.splice(0)) {
                    try {
                      cleanup();
                    } catch (_) {
                      // ignore
                    }
                  }
                },
              });

              palettePicker.appendChild(paletteDisplay);
              palettePicker.appendChild(palettePreview);

              editorBody.appendChild(createAlignedRow({
                title: 'Palette',
                hint: 'Pick a categorical palette (schemes preferred when available).',
                controls: palettePicker,
              }).row);

              const preferSchemeInput = createToggleControl({
                checked: preferScheme,
                onLabel: 'Prefer Scheme',
                offLabel: 'Use Order',
              });
              preferSchemeInput.addEventListener('change', () => {
                const nextMeta = ensureCategoricalMeta();
                nextMeta.categorical.preferScheme = preferSchemeInput.checked;
                updatePendingMeta(nextMeta);
                applyOrdering({ forcePalette: true });
                renderEditor();
              });
              editorBody.appendChild(createAlignedRow({
                title: 'Scheme',
                hint: 'Prefer discrete scheme colors when available for the selected palette.',
                controls: preferSchemeInput,
              }).row);

              applyPaletteButton = document.createElement('button');
              applyPaletteButton.type = 'button';
              applyPaletteButton.className = 'helios-ui-button helios-ui-button--compact';
              applyPaletteButton.textContent = 'Apply palette';
              applyPaletteButton.addEventListener('click', () => {
                applyOrdering({ forcePalette: true });
                renderEditor();
              });
            }

            const orderedEntries = buildOrderedEntries();
            const domain = Array.isArray(state.pending.domain) ? state.pending.domain : [];
            const range = Array.isArray(state.pending.range) ? state.pending.range : [];

            const list = document.createElement('div');
            list.style.display = 'grid';
            list.style.gap = '4px';
            list.style.width = '100%';
            orderedEntries.forEach((entry, idx) => {
              const row = document.createElement('div');
              row.style.display = 'grid';
              row.style.gridTemplateColumns = 'minmax(0, 1fr) auto auto';
              row.style.alignItems = 'center';
              row.style.gap = '4px';
	
              const labelWrap = document.createElement('div');
              labelWrap.style.display = 'grid';
              labelWrap.style.gap = '1px';
              labelWrap.style.minWidth = '0';
              labelWrap.style.textAlign = 'right';
              labelWrap.style.justifyItems = 'end';
              const labelEl = document.createElement('div');
              labelEl.className = 'helios-ui-ellipsis';
              labelEl.textContent = entry.label ?? `#${entry.id}`;
              labelEl.title = `${entry.label ?? entry.id} (id ${entry.id})`;
              const countEl = document.createElement('div');
              countEl.style.fontSize = '11px';
              countEl.style.color = 'var(--helios-ui-muted)';
              countEl.textContent = `count: ${entry.count ?? 0}`;
              labelWrap.appendChild(labelEl);
              labelWrap.appendChild(countEl);
	
              const valueEditor = (() => {
                if (isColorChannel) {
                  return createHex8ColorEditor({
                    label: null,
                    value: range[idx] ?? colorFromIndex(idx),
                    onChange: (v) => {
                      const nextDomain = domain.slice();
                      const nextRange = range.slice();
                      nextDomain[idx] = entry.id;
                      nextRange[idx] = v;
                      state.pending = { ...state.pending, type: 'categorical', domain: nextDomain, range: nextRange };
                      setDirty(true);
                    },
                    compact: true,
                  });
                }
                const raw = range[idx];
                const seeded = Number.isFinite(Number(raw)) ? Number(raw) : (buildNumericPalette(orderedEntries.length)[idx] ?? suggestMin);
                const controls = new SuggestedSliderControls({
                  value: seeded,
                  suggested: [suggestMin, suggestMax],
                  step: numericStep,
                  inputMin: suggestMin,
                  inputMax: suggestMax,
                  onCommit: (v) => {
                    const n = clampNumber(v, { min: suggestMin, max: suggestMax });
                    if (n == null) return;
                    const nextDomain = domain.slice();
                    const nextRange = range.slice();
                    nextDomain[idx] = entry.id;
                    nextRange[idx] = n;
                    state.pending = { ...state.pending, type: 'categorical', domain: nextDomain, range: nextRange };
                    setDirty(true);
                  },
                });
                registerControl(controls);
                controls.element.style.maxWidth = '150px';
                controls.element.style.gap = '6px';
                controls.input.style.maxWidth = '60px';
                controls.input.style.height = '28px';
                return controls.element;
              })();

              const buttons = document.createElement('div');
              buttons.style.display = 'grid';
              buttons.style.gap = '-2px';
              buttons.style.width = '18px';
              const up = document.createElement('button');
              up.type = 'button';
              up.className = 'helios-ui-button helios-ui-button--compact';
              up.textContent = '↑';
              up.disabled = idx === 0;
              const down = document.createElement('button');
              down.type = 'button';
              down.className = 'helios-ui-button helios-ui-button--compact';
              down.textContent = '↓';
              down.disabled = idx === orderedEntries.length - 1;
              up.style.padding = '0px 4px';
              down.style.padding = '0px 4px';
              up.style.lineHeight = '1';
              down.style.lineHeight = '1';
              up.style.minWidth = '0';
              down.style.minWidth = '0';
              up.style.height = '16px';
              down.style.height = '16px';
              up.style.border = 'none';
              down.style.border = 'none';
              up.style.background = 'transparent';
              down.style.background = 'transparent';
              up.style.cursor = 'pointer';
              down.style.cursor = 'pointer';
              up.style.color = 'var(--helios-ui-text)';
              down.style.color = 'var(--helios-ui-text)';
              up.style.opacity = up.disabled ? '0.4' : '1';
              down.style.opacity = down.disabled ? '0.4' : '1';
              const move = (delta) => {
                const nextDomain = domain.slice();
                const nextRange = range.slice();
                const a = idx;
                const b = idx + delta;
                [nextDomain[a], nextDomain[b]] = [nextDomain[b], nextDomain[a]];
                [nextRange[a], nextRange[b]] = [nextRange[b], nextRange[a]];
                const nextMeta = ensureCategoricalMeta();
                nextMeta.categorical.sortOrder = 'manual';
                state.pending = { ...state.pending, type: 'categorical', domain: nextDomain, range: nextRange, meta: nextMeta };
                setDirty(true);
                renderEditor();
              };
              up.addEventListener('click', () => move(-1));
              down.addEventListener('click', () => move(1));
              buttons.appendChild(up);
              buttons.appendChild(down);

              row.appendChild(labelWrap);
              row.appendChild(valueEditor);
              row.appendChild(buttons);
              list.appendChild(row);
            });

            const visibleIds = new Set(orderedEntries.map((entry) => entry.id));
            let hiddenCount = 0;
            for (const entry of entries) {
              if (!visibleIds.has(entry.id)) hiddenCount += Number(entry.count ?? 0) || 0;
            }
            const othersCount = hiddenCount;
            const othersRow = document.createElement('div');
            othersRow.style.display = 'grid';
            othersRow.style.gridTemplateColumns = 'minmax(0, 1fr) auto auto';
            othersRow.style.alignItems = 'center';
            othersRow.style.gap = '4px';

            const othersLabelWrap = document.createElement('div');
            othersLabelWrap.style.display = 'grid';
            othersLabelWrap.style.gap = '1px';
            othersLabelWrap.style.minWidth = '0';
            othersLabelWrap.style.textAlign = 'right';
            othersLabelWrap.style.justifyItems = 'end';
            const othersLabel = document.createElement('div');
            othersLabel.className = 'helios-ui-ellipsis';
            othersLabel.textContent = 'Others';
            othersLabel.title = 'Others (default)';
            const othersCountEl = document.createElement('div');
            othersCountEl.style.fontSize = '11px';
            othersCountEl.style.color = 'var(--helios-ui-muted)';
            othersCountEl.textContent = `count: ${othersCount}`;
            othersLabelWrap.appendChild(othersLabel);
            othersLabelWrap.appendChild(othersCountEl);

            const othersEditor = (() => {
              if (isColorChannel) {
                return createHex8ColorEditor({
                  label: null,
                  value: typeof state.pending.defaultValue === 'string' ? state.pending.defaultValue : '#888888ff',
                  onChange: (v) => {
                    state.pending = { ...state.pending, type: 'categorical', defaultValue: v };
                    setDirty(true);
                  },
                  compact: true,
                });
              }
              const fallback = Number.isFinite(Number(state.pending.defaultValue))
                ? Number(state.pending.defaultValue)
                : suggestMin;
              const controls = new SuggestedSliderControls({
                value: fallback,
                suggested: [suggestMin, suggestMax],
                step: numericStep,
                inputMin: suggestMin,
                inputMax: suggestMax,
                onCommit: (v) => {
                  const n = clampNumber(v, { min: suggestMin, max: suggestMax });
                  if (n == null) return;
                  state.pending = { ...state.pending, type: 'categorical', defaultValue: n };
                  setDirty(true);
                },
              });
              registerControl(controls);
              controls.element.style.maxWidth = '150px';
              controls.element.style.gap = '6px';
              controls.input.style.maxWidth = '60px';
              controls.input.style.height = '28px';
              return controls.element;
            })();

            const othersSpacer = document.createElement('div');
            othersSpacer.style.width = '18px';
            othersSpacer.style.height = '18px';

            othersRow.appendChild(othersLabelWrap);
            othersRow.appendChild(othersEditor);
            othersRow.appendChild(othersSpacer);
            list.appendChild(othersRow);

            const listWrap = document.createElement('div');
            listWrap.style.maxHeight = '240px';
            listWrap.style.overflowY = 'auto';
            listWrap.style.paddingRight = '4px';
            listWrap.appendChild(list);

            orderSelect.style.maxWidth = '170px';
            orderSelect.style.width = '100%';
            orderSelect.style.height = '34px';
            maxInput.style.maxWidth = '100px';
            maxInput.style.height = '34px';

            let distributeButton = null;
            if (!isColorChannel) {
              distributeButton = document.createElement('button');
              distributeButton.type = 'button';
              distributeButton.className = 'helios-ui-button helios-ui-button--compact';
              distributeButton.textContent = 'Distribute';
              distributeButton.addEventListener('click', () => {
                applyOrdering({ forcePalette: true });
                renderEditor();
              });
            }

            const categoriesSection = createSubsectionHeader({
              title: 'Categories',
              tooltip: 'Edit category colors and reorder manually when needed.',
              action: isColorChannel ? applyPaletteButton : distributeButton,
            });
            const sectionBody = document.createElement('div');
            sectionBody.style.display = 'grid';
            sectionBody.style.gap = '8px';
            sectionBody.style.width = '100%';

            const topRow = document.createElement('div');
            topRow.style.display = 'grid';
            topRow.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
            topRow.style.gap = '4px';
            topRow.style.alignItems = 'end';
            topRow.appendChild(buildFullWidthControl({
              label: 'Order',
              hint: 'Sort categories by frequency (default), alphabetical, natural, or manual order.',
              control: orderSelect,
              alignRight: false,
            }));
            topRow.appendChild(buildFullWidthControl({
              label: 'Max',
              hint: 'Limit categories to a maximum (auto uses the palette size when applicable). Leave empty for auto.',
              control: maxWrap,
              alignRight: true,
            }));
            sectionBody.appendChild(topRow);

            if (!isColorChannel) {
              const { min: numericMin, max: numericMax, direction: numericDirection } = resolveNumericSettings();
              const rangeWrap = document.createElement('div');
              rangeWrap.style.display = 'flex';
              rangeWrap.style.gap = '6px';
              rangeWrap.style.alignItems = 'center';
              const minInput = document.createElement('input');
              minInput.type = 'number';
              minInput.className = 'helios-ui-number';
              minInput.value = String(numericMin);
              const maxInput = document.createElement('input');
              maxInput.type = 'number';
              maxInput.className = 'helios-ui-number';
              maxInput.value = String(numericMax);
              minInput.style.maxWidth = '80px';
              maxInput.style.maxWidth = '80px';
              minInput.style.height = '30px';
              maxInput.style.height = '30px';

              const updateNumericRange = () => {
                const minVal = clampNumber(minInput.value);
                const maxVal = clampNumber(maxInput.value);
                const nextMeta = ensureCategoricalMeta();
                if (Number.isFinite(minVal) && Number.isFinite(maxVal)) {
                  nextMeta.categorical.numericRange = [minVal, maxVal];
                } else {
                  nextMeta.categorical.numericRange = null;
                }
                updatePendingMeta(nextMeta);
              };
              minInput.addEventListener('change', () => {
                updateNumericRange();
              });
              maxInput.addEventListener('change', () => {
                updateNumericRange();
              });
              rangeWrap.appendChild(minInput);
              rangeWrap.appendChild(maxInput);

              const directionSelect = document.createElement('select');
              directionSelect.className = 'helios-ui-select';
              const ascOpt = document.createElement('option');
              ascOpt.value = 'asc';
              ascOpt.textContent = 'Ascending';
              const descOpt = document.createElement('option');
              descOpt.value = 'desc';
              descOpt.textContent = 'Descending';
              directionSelect.appendChild(ascOpt);
              directionSelect.appendChild(descOpt);
              directionSelect.value = numericDirection;
              directionSelect.style.maxWidth = '140px';
              directionSelect.style.height = '34px';
              directionSelect.addEventListener('change', () => {
                const nextMeta = ensureCategoricalMeta();
                nextMeta.categorical.numericDirection = directionSelect.value === 'desc' ? 'desc' : 'asc';
                updatePendingMeta(nextMeta);
              });

              const numericRow = document.createElement('div');
              numericRow.style.display = 'grid';
              numericRow.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
              numericRow.style.gap = '4px';
              numericRow.style.alignItems = 'end';
              numericRow.appendChild(buildFullWidthControl({
                label: 'Range',
                hint: 'Range used when distributing category values.',
                control: rangeWrap,
                alignRight: false,
              }));
              numericRow.appendChild(buildFullWidthControl({
                label: 'Direction',
                hint: 'Distribute values in ascending or descending order.',
                control: directionSelect,
                alignRight: true,
              }));
              sectionBody.appendChild(numericRow);
            }
            sectionBody.appendChild(listWrap);
            categoriesSection.wrap.appendChild(sectionBody);
            editorBody.appendChild(categoriesSection.wrap);

          }

	        if (pendingType === 'colormap') {
	          state.pending = normalizeRuleList(state.pending);
	          const attrSelect = document.createElement('select');
	          attrSelect.className = 'helios-ui-select';
	          const names = listAttributeNames(mode, { channel: state.channel, mapperType: 'colormap' });
          const current = typeof state.pending.attributes === 'string'
            ? state.pending.attributes
            : (typeof live?.attributes === 'string' ? live.attributes : '');
          const optBlank = document.createElement('option');
          optBlank.value = '';
          optBlank.textContent = names.length ? 'Select attribute…' : 'No attributes';
          attrSelect.appendChild(optBlank);
          for (const name of names) {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            attrSelect.appendChild(opt);
          }
          attrSelect.value = names.includes(current) ? current : '';
          attrSelect.addEventListener('change', () => {
            const attr = attrSelect.value || undefined;
            const domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
            const nextPending = { ...state.pending, type: 'colormap', attributes: attr, domain };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
            setDirty(true);
            renderEditor();
          });
          editorBody.appendChild(createAlignedRow({
            title: 'Attribute',
            hint: 'Pick the attribute to map through a colormap.',
            controls: attrSelect,
          }).row);

          const transformWrap = document.createElement('div');
          transformWrap.style.display = 'flex';
          transformWrap.style.gap = '8px';
          transformWrap.style.alignItems = 'center';
          transformWrap.style.width = '100%';

          const transformSelect = document.createElement('select');
          transformSelect.className = 'helios-ui-select';
          transformSelect.style.flex = '1 1 auto';
          transformSelect.style.maxWidth = 'none';
          transformSelect.style.minWidth = '0';
          for (const optVal of ['linear', 'log', 'log1p', 'logit', 'power', 'percentile']) {
            const opt = document.createElement('option');
            opt.value = optVal;
            opt.textContent = formatTransformLabel(optVal);
            transformSelect.appendChild(opt);
          }
          const resolvedTransformType = state.pending.transformType === 'quantile'
            ? 'percentile'
            : (state.pending.transformType ?? 'linear');
          transformSelect.value = String(resolvedTransformType);

          const powerInput = document.createElement('input');
          powerInput.type = 'number';
          powerInput.className = 'helios-ui-number';
          powerInput.style.maxWidth = '96px';
          powerInput.style.flex = '0 0 auto';
          powerInput.value = String(Number.isFinite(Number(state.pending.transformPower)) ? state.pending.transformPower : 1);
          powerInput.hidden = transformSelect.value !== 'power';

          transformSelect.addEventListener('change', () => {
            const nextType = transformSelect.value || 'linear';
            const prevType = state.pending.transformType ?? 'linear';
            powerInput.hidden = nextType !== 'power';
            const nextPending = { ...state.pending, type: 'colormap', transformType: nextType };
            if (isPercentileTransform(nextType)) {
              nextPending.domain = [0, 1];
              markDomainAuto(nextPending, true);
            } else if (isPercentileTransform(prevType)) {
              const attr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
              nextPending.domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
              markDomainAuto(nextPending, true);
            }
            state.pending = nextPending;
            if (nextType !== 'power') {
              state.pending = { ...state.pending, type: 'colormap', transformPower: undefined };
            } else {
              state.pending = { ...state.pending, type: 'colormap', transformPower: Number(powerInput.value) || 1 };
            }
            setDirty(true);
            renderEditor();
          });

          powerInput.addEventListener('change', () => {
            const p = clampNumber(powerInput.value);
            if (p == null) return;
            state.pending = { ...state.pending, type: 'colormap', transformType: 'power', transformPower: p };
            setDirty(true);
            renderEditor();
          });

          transformWrap.appendChild(transformSelect);
          transformWrap.appendChild(powerInput);
          editorBody.appendChild(createAlignedRow({
            title: 'Transform',
            hint: 'Optional pre-transform applied before colormapping.',
            controls: transformWrap,
          }).row);

          const colormapPicker = new ColormapPickerControl({
            catalog: colormapCatalog,
            portalRoot: ui?.container ?? document.body,
            value: state.pending.colormap ?? 'interpolateInferno',
            fallbackValue: 'interpolateInferno',
            searchPlaceholder: 'Search colormaps (e.g. viridis, CET, cmasher)…',
            onChange: (key) => {
              state.pending = { ...state.pending, type: 'colormap', colormap: key };
              setDirty(true);
            },
          });
          registerControl(colormapPicker);

          editorBody.appendChild(createAlignedRow({
            title: 'Colormap',
            hint: 'Choose the named colormap/interpolator to use.',
            controls: colormapPicker.element,
          }).row);

          const domainWrap = document.createElement('div');
          domainWrap.style.display = 'grid';
          domainWrap.style.gap = '2px';
          domainWrap.style.width = '100%';

          const domainAttr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
          const transformType = state.pending.transformType ?? 'linear';
          const percentile = isPercentileTransform(transformType);
          const allowDivergent = !percentile;
          const divergent = Boolean(state.pending.divergent) && allowDivergent;
          const extent = percentile ? { min: 0, max: 1 } : computeScalarExtent(mode, domainAttr);
          const min = extent?.min ?? 0;
          const max = extent?.max ?? 1;
          const extentAbs = divergent ? Math.max(Math.abs(min), Math.abs(max), 1) : null;
          const sliderMin = divergent ? -extentAbs : min;
          const sliderMax = divergent ? extentAbs : max;
          const isIntegerDomain = Boolean(extent?.isInteger);
          const step = percentile ? 0.01 : suggestStepForRange(sliderMin, sliderMax, isIntegerDomain);

          if (percentile && (!Array.isArray(state.pending.domain) || state.pending.domain[0] !== 0 || state.pending.domain[1] !== 1)) {
            const nextPending = { ...state.pending, type: 'colormap', domain: [0, 1] };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
          } else if (!Array.isArray(state.pending.domain) && domainAttr) {
            const nextDomain = divergent ? resolveDivergentDomain([min, max], extent) : [min, max];
            const nextPending = { ...state.pending, type: 'colormap', domain: nextDomain };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
          } else if (divergent && Array.isArray(state.pending.domain)) {
            const nextPending = { ...state.pending, type: 'colormap', domain: resolveDivergentDomain(state.pending.domain, extent) };
            markDomainAuto(nextPending, false);
            state.pending = nextPending;
          }

          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : (divergent ? resolveDivergentDomain([min, max], extent) : [min, max]);

          const domainHistogram = (!percentile && showDistributions && domainAttr)
            ? createRangeHistogram({
              view: resolveAttributeView(mode, domainAttr),
              min,
              max,
              range: domain,
              scope: mode,
              rawName: domainAttr,
            })
            : null;
          if (domainHistogram) domainWrap.appendChild(domainHistogram.element);

          const slider = new TwoHandleRange({
            min: sliderMin,
            max: sliderMax,
            step,
            value: domain,
            allowRangeDrag: !divergent,
            onChange: (next) => {
              const prevDomain = Array.isArray(state.pending.domain) ? state.pending.domain : domain;
              let nextDomain = divergent ? resolveDivergentDomainFromSlider(next, prevDomain) : next;
              if (isIntegerDomain) {
                nextDomain = [Math.round(nextDomain[0]), Math.round(nextDomain[1])];
              }
              const nextPending = { ...state.pending, type: 'colormap', domain: nextDomain };
              markDomainAuto(nextPending, false);
              state.pending = nextPending;
              setDirty(true);
              d0.value = String(nextDomain[0]);
              d1.value = String(nextDomain[1]);
              if (divergent) {
                slider.aInput.value = String(nextDomain[0]);
                slider.bInput.value = String(nextDomain[1]);
                slider.setVisual(nextDomain[0], nextDomain[1]);
              }
              domainHistogram?.setMarkers(nextDomain[0], nextDomain[1]);
            },
          });
          registerControl(slider);

          const values = document.createElement('div');
          values.className = 'helios-ui-range2__values';
          const d0 = document.createElement('input');
          d0.type = 'number';
          d0.className = 'helios-ui-number';
          d0.style.maxWidth = '96px';
          const d1 = document.createElement('input');
          d1.type = 'number';
          d1.className = 'helios-ui-number';
          d1.style.maxWidth = '96px';

          d0.value = String(domain[0] ?? min);
          d1.value = String(domain[1] ?? max);

          const commitDomainTyped = () => {
            const a = clampNumber(d0.value);
            const b = clampNumber(d1.value);
            if (a == null || b == null) return;
            let lo = Math.min(a, b);
            let hi = Math.max(a, b);
            if (isIntegerDomain) {
              lo = Math.round(lo);
              hi = Math.round(hi);
            }
            const maxAbs = divergent ? Math.max(Math.abs(lo), Math.abs(hi)) : null;
            const nextDomain = divergent ? [-maxAbs, maxAbs] : [lo, hi];
            const loSlider = Math.max(sliderMin, Math.min(sliderMax, nextDomain[0]));
            const hiSlider = Math.max(sliderMin, Math.min(sliderMax, nextDomain[1]));
            slider.aInput.value = String(loSlider);
            slider.bInput.value = String(hiSlider);
            slider.setVisual(loSlider, hiSlider);
            const nextPending = { ...state.pending, type: 'colormap', domain: nextDomain };
            markDomainAuto(nextPending, false);
            state.pending = nextPending;
            setDirty(true);
            d0.value = String(nextDomain[0]);
            d1.value = String(nextDomain[1]);
            domainHistogram?.setMarkers(nextDomain[0], nextDomain[1]);
          };
          d0.addEventListener('change', commitDomainTyped);
          d1.addEventListener('change', commitDomainTyped);

          values.appendChild(d0);
          values.appendChild(d1);
          domainWrap.appendChild(slider.element);
          domainWrap.appendChild(values);
          editorBody.appendChild(createAlignedRow({
            title: 'Domain',
            hint: percentile
              ? 'Percentile range used to map values into the colormap (0 to 1).'
              : (divergent
                ? 'Symmetric range around zero used for divergent colormaps.'
                : 'Input range used to map values into the colormap (min/max).'),
            controls: domainWrap,
          }).row);

          const advanced = document.createElement('div');
          const divergentInput = createToggleControl({
            checked: Boolean(state.pending.divergent) && allowDivergent,
            disabled: !allowDivergent,
            onLabel: 'Divergent',
            offLabel: 'Sequential',
          });

          const clampWrap = document.createElement('div');
          clampWrap.style.display = 'inline-flex';
          clampWrap.style.alignItems = 'center';
          clampWrap.style.gap = '10px';
          const clampState = normalizeClampSetting(state.pending.clamp);
          const clampMinInput = createToggleControl({
            checked: clampState.min,
            onLabel: 'Min Clamp',
            offLabel: 'Min Free',
          });
          const clampMaxInput = createToggleControl({
            checked: clampState.max,
            onLabel: 'Max Clamp',
            offLabel: 'Max Free',
          });

          clampWrap.appendChild(clampMinInput);
          clampWrap.appendChild(clampMaxInput);

          const alphaSeed = clampNumber(state.pending.alpha ?? 1, { min: 0, max: 1 }) ?? 1;
          const alphaControls = new SuggestedSliderControls({
            value: alphaSeed,
            suggested: [0, 1],
            step: 0.01,
            inputMin: 0,
            inputMax: 1,
            onCommit: (v) => {
              const a = clampNumber(v, { min: 0, max: 1 });
              if (a == null) return;
              state.pending = { ...state.pending, type: 'colormap', alpha: a };
              setDirty(true);
            },
          });
          registerControl(alphaControls);

          const commitClamp = () => {
            const nextClamp = { min: clampMinInput.checked, max: clampMaxInput.checked };
            state.pending = { ...state.pending, type: 'colormap', clamp: nextClamp };
            setDirty(true);
          };
          clampMinInput.addEventListener('change', commitClamp);
          clampMaxInput.addEventListener('change', commitClamp);

          divergentInput.addEventListener('change', () => {
            const nextDivergent = divergentInput.checked;
            const fallbackDomain = domainAttr ? suggestDomainForAttribute(mode, domainAttr) : [0, 1];
            const baseDomain = Array.isArray(state.pending.domain) ? state.pending.domain : fallbackDomain;
            const nextDomain = nextDivergent ? resolveDivergentDomain(baseDomain, extent) : fallbackDomain;
            const nextPending = { ...state.pending, type: 'colormap', divergent: nextDivergent, domain: nextDomain };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
            setDirty(true);
            renderEditor();
          });

          advanced.appendChild(createAlignedRow({
            title: 'Divergent',
            hint: allowDivergent
              ? 'Lock the domain to a symmetric range around zero (for divergent colormaps).'
              : 'Divergent mode is unavailable for percentile transforms.',
            controls: divergentInput,
          }).row);

          advanced.appendChild(createAlignedRow({
            title: 'Clamp',
            hint: 'Clamp values outside the domain to the nearest end of the colormap.',
            controls: clampWrap,
          }).row);
	          advanced.appendChild(createAlignedRow({
	            title: 'Alpha',
	            hint: 'Overall opacity multiplier applied after colormapping.',
	            controls: alphaControls.element,
	          }).row);

		          const defaultWrap = document.createElement('div');
		          defaultWrap.style.display = 'flex';
		          defaultWrap.style.gap = '8px';
		          defaultWrap.style.alignItems = 'center';
		          defaultWrap.style.width = '100%';

		          const defaultSeed = typeof state.pending.defaultValue === 'string' ? state.pending.defaultValue : '#888888ff';
		          const defaultEditor = createHex8ColorEditor({
		            label: null,
		            value: defaultSeed,
		            onChange: (v) => {
		              state.pending = { ...state.pending, type: 'colormap', defaultValue: v };
		            },
		          });
		          defaultEditor.style.flex = '1 1 auto';
		          defaultEditor.style.minWidth = '0';

		          const clearDefault = document.createElement('button');
		          clearDefault.type = 'button';
		          clearDefault.className = 'helios-ui-button helios-ui-button--compact';
		          clearDefault.textContent = '×';
		          clearDefault.setAttribute('aria-label', 'Clear default value');
		          clearDefault.addEventListener('click', () => {
		            state.pending = { ...state.pending, type: 'colormap', defaultValue: undefined };
		            setDirty(true);
		            renderEditor();
		          });
		          tooltips.attachTooltip(clearDefault, 'Clear the default value.');

		          defaultWrap.appendChild(defaultEditor);
		          defaultWrap.appendChild(clearDefault);

		          advanced.appendChild(createAlignedRow({
		            title: 'Default',
		            hint: 'Fallback color when input is missing/invalid.',
		            controls: defaultWrap,
		          }).row);

		          const rulesWrap = document.createElement('div');
		          rulesWrap.style.display = 'grid';
		          rulesWrap.style.gap = '8px';
		          rulesWrap.style.width = '100%';

		          const rulesList = document.createElement('div');
		          rulesList.style.display = 'grid';
		          rulesList.style.gap = '8px';
		          rulesWrap.appendChild(rulesList);

		          const renderRulesList = () => {
		            rulesList.textContent = '';
		            const rules = Array.isArray(state.pending.rules) ? state.pending.rules : [];
		            for (let i = 0; i < rules.length; i += 1) {
		              const rule = rules[i];
		              const spec = rule?.__ui && typeof rule.__ui === 'object'
		                ? rule.__ui
		                : { op: 'eq', rhs: -1, out: '#888888ff' };

		              const item = document.createElement('div');
		              item.style.display = 'grid';
		              item.style.gap = '6px';
		              item.style.position = 'relative';
		              item.style.padding = '8px';
		              item.style.paddingRight = '36px';
		              item.style.borderRadius = '10px';
		              item.style.border = '1px solid color-mix(in srgb, var(--helios-ui-border) 70%, transparent)';
		              item.style.background = 'color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent)';

		              const top = document.createElement('div');
		              top.style.display = 'grid';
		              top.style.gap = '8px';
		              top.style.alignItems = 'center';
		              top.style.gridTemplateColumns = 'auto minmax(0, 1fr)';

		              const condRow = document.createElement('div');
		              condRow.style.display = 'grid';
		              condRow.style.gridTemplateColumns = 'auto minmax(0, 1fr) minmax(0, 1fr)';
		              condRow.style.gap = '6px';
		              condRow.style.alignItems = 'center';
		              condRow.style.minWidth = '0';

		              const opSelect = document.createElement('select');
	              opSelect.className = 'helios-ui-select helios-ui-select--compact';
	              opSelect.style.maxWidth = '56px';
	              opSelect.style.width = '100%';
		              const ops = [
		                { value: 'eq', label: '=' },
		                { value: 'lt', label: '<' },
		                { value: 'lte', label: '≤' },
	                { value: 'gt', label: '>' },
	                { value: 'gte', label: '≥' },
	                { value: 'nan', label: 'NaN' },
	                { value: 'nullish', label: 'null' },
	              ];
	              for (const op of ops) {
	                const opt = document.createElement('option');
	                opt.value = op.value;
	                opt.textContent = op.label;
	                opSelect.appendChild(opt);
	              }
	              opSelect.value = ops.some((o) => o.value === spec.op) ? spec.op : 'eq';

		              const rhsInput = document.createElement('input');
		              rhsInput.type = 'number';
		              rhsInput.className = 'helios-ui-number';
		              rhsInput.style.maxWidth = 'none';
		              rhsInput.style.width = '100%';
		              rhsInput.value = spec.rhs != null ? String(spec.rhs) : '';
		              rhsInput.placeholder = 'value';

	              const rhsVisible = () => ['eq', 'lt', 'lte', 'gt', 'gte'].includes(opSelect.value);
	              rhsInput.style.display = rhsVisible() ? '' : 'none';

	              const getLiveSpec = () => {
	                const current = state.pending?.rules?.[i]?.__ui;
	                return current && typeof current === 'object' ? current : spec;
	              };

		              const commitRule = (nextSpec) => {
		                const predicate = buildRulePredicate(nextSpec);
		                const nextRule = {
		                  ...rule,
	                  __ui: nextSpec,
	                  when: (inputs) => predicate(inputs),
	                  value: nextSpec.out ?? rule.value,
	                };
	                const nextRules = rules.slice();
	                nextRules[i] = nextRule;
	                state.pending = { ...state.pending, type: 'colormap', rules: nextRules };
	                setDirty(true);
	              };

	              opSelect.addEventListener('change', () => {
	                rhsInput.style.display = rhsVisible() ? '' : 'none';
	                commitRule({ ...getLiveSpec(), op: opSelect.value });
	              });

		              rhsInput.addEventListener('change', () => {
		                const rhs = clampNumber(rhsInput.value);
		                commitRule({ ...getLiveSpec(), rhs });
		              });

		              const ifLabel = createRuleKeyword(i === 0 ? 'if' : 'else if');
		              condRow.appendChild(ifLabel);
		              condRow.appendChild(opSelect);
		              condRow.appendChild(rhsInput);
		              tooltips.attachTooltip(opSelect, 'Condition operator.');
		              tooltips.attachTooltip(rhsInput, 'Comparison value.');

		              const remove = document.createElement('button');
		              remove.type = 'button';
		              remove.className = 'helios-ui-button helios-ui-button--compact';
		              remove.textContent = '×';
		              remove.setAttribute('aria-label', 'Remove override');
		              tooltips.attachTooltip(remove, 'Remove this override.');
		              remove.style.position = 'absolute';
		              remove.style.top = '8px';
		              remove.style.right = '8px';
		              remove.addEventListener('click', () => {
		                const nextRules = rules.filter((_, idx) => idx !== i);
		                state.pending = { ...state.pending, type: 'colormap', rules: nextRules };
		                setDirty(true);
		                renderRulesList();
		              });

		              top.appendChild(condRow);

		              const outRow = createHex8ColorEditor({
		                label: null,
		                value: typeof spec.out === 'string' ? spec.out : String(rule.value ?? '#888888ff'),
		                onChange: (v) => {
		                  commitRule({ ...getLiveSpec(), out: v });
		                },
		                showAlphaLabel: false,
		                compact: true,
		              });

		              const outWrap = document.createElement('div');
		              outWrap.style.display = 'grid';
		              outWrap.style.gridTemplateColumns = 'auto minmax(0, 1fr)';
		              outWrap.style.gap = '6px';
		              outWrap.style.alignItems = 'center';
		              outWrap.style.width = '100%';

		              outRow.style.width = '100%';

		              outWrap.appendChild(createRuleKeyword('then'));
		              outWrap.appendChild(outRow);

		              item.appendChild(top);
		              item.appendChild(outWrap);
		              item.appendChild(remove);
		              rulesList.appendChild(item);
		            }
		          };

		          renderRulesList();
		          const addRuleButton = document.createElement('button');
		          addRuleButton.type = 'button';
		          addRuleButton.className = 'helios-ui-button helios-ui-button--compact';
		          addRuleButton.textContent = 'Add';
		          addRuleButton.setAttribute('aria-label', 'Add override');
		          tooltips.attachTooltip(addRuleButton, 'Add a value override (rule).');
		          addRuleButton.addEventListener('click', () => {
		            const spec = { op: 'eq', rhs: -1, out: '#888888ff' };
		            const predicate = buildRulePredicate(spec);
		            const nextRule = { __ui: spec, when: (inputs) => predicate(inputs), value: spec.out };
		            const nextRules = [...(state.pending.rules ?? []), nextRule];
		            state.pending = { ...state.pending, type: 'colormap', rules: nextRules };
		            setDirty(true);
		            renderRulesList();
		          });

		          const overridesSection = createSubsectionHeader({
		            title: 'Overrides',
		            tooltip: 'Rules applied before the base mapping.',
		            action: addRuleButton,
		          });
		          overridesSection.wrap.appendChild(rulesWrap);
		          advanced.appendChild(overridesSection.wrap);

		          const advancedStack = new PanelStack();
		          advancedStack.add({ id: `${mode}-mapper-advanced`, title: 'Advanced', collapsed: true, content: advanced });
		          editorBody.appendChild(advancedStack.element);
		          ui._controlCleanups.add(() => advancedStack.destroy());
	        }

        if (!isColor && !isScalar && pendingType !== 'passthrough') {
          const note = document.createElement('div');
          note.style.color = 'var(--helios-ui-muted)';
          note.textContent = 'This channel is passthrough-only in the current MVP.';
          editorBody.appendChild(note);
        }

        syncApplyEnabled();
      };

      const resetPendingFromLive = () => {
        if (mode === 'node' && state.channel === 'position') {
          const scheduler = helios?.scheduler ?? null;
          const hasLayout = Boolean(scheduler?.layout);
          const layoutEnabled = hasLayout && scheduler?.layoutEnabled !== false;
          state.pending = layoutEnabled ? { name: state.channel, type: 'layout' } : (resolveLiveConfig(mode, state.channel) ?? { name: state.channel });
        } else {
          state.pending = resolveLiveConfig(mode, state.channel) ?? { name: state.channel };
        }
        setDirty(false);
        renderEditor();
      };

      const setChannel = (next) => {
        if (!channels.includes(next)) return;
        state.channel = next;
        resetPendingFromLive();
      };

      revertButton.addEventListener('click', () => {
        resetPendingFromLive();
      });

      applyButton.addEventListener('click', () => {
        if (!state.pending) return;
        if (
          mode === 'edge' &&
          state.pending &&
          (state.pending.type === 'nodeToEdge' || state.pending.type === 'nodeAttribute') &&
          state._nodePassthroughUi
        ) {
          const { attrSelect, endpointsSelect } = state._nodePassthroughUi;
          const bare = attrSelect?.value || state.pending.nodeAttribute || undefined;
          const endpoints = endpointsSelect?.value || state.pending.endpoints || undefined;
          state.pending = {
            ...state.pending,
            type: 'nodeAttribute',
            nodeAttribute: bare,
            endpoints,
            attributes: bare ? [`@node.${bare}`] : state.pending.attributes,
          };
        }

        try {
          if (window.__HELIOS_DEBUG_MAPPERS_PANEL__) {
            console.log('[HeliosUI][MappersPanel] apply click (before)', {
              mode,
              channel: state.channel,
              pending: state.pending,
              live: resolveLiveConfig(mode, state.channel),
            });
          }
        } catch (_) {
          // ignore
        }

        if (mode === 'node' && state.channel === 'position') {
          const scheduler = helios?.scheduler ?? null;
          if (state.pending.type === 'layout') {
            if (scheduler && typeof scheduler.setLayoutEnabled === 'function') {
              scheduler.setLayoutEnabled(true, 'ui:mappers');
              scheduler.requestLayout?.('ui:mappers');
            }
            setDirty(false);
            return;
          }
          if (scheduler && typeof scheduler.setLayoutEnabled === 'function') {
            scheduler.setLayoutEnabled(false, 'ui:mappers');
          }
        }

        const ok = applyConfig(mode, state.channel, state.pending);
        if (ok) {
          try {
            if (window.__HELIOS_DEBUG_MAPPERS_PANEL__) {
              const entry = helios?.network?.getNodeToEdgePassthroughs?.().find((p) => p.edgeName === '_helios_visuals_edge_color');
              console.log('[HeliosUI][MappersPanel] apply click (after)', {
                mode,
                channel: state.channel,
                live: resolveLiveConfig(mode, state.channel),
                nodeToEdgeEdgeColor: entry ?? null,
              });
            }
          } catch (_) {
            // ignore
          }

          // Ensure visuals update immediately even if the scheduler is currently idle.
          helios?.scheduler?.requestGeometry?.();
          helios?.scheduler?.requestRender?.();
          helios?.requestRender?.();

          if (
            mode === 'node' &&
            state.channel === 'outlineColor' &&
            (state.pending.type ?? state.pending.mode) === 'constant' &&
            typeof helios?.nodeOutlineColor === 'function'
          ) {
            try {
              helios.nodeOutlineColor(state.pending.value);
            } catch {
              // Ignore invalid color inputs; mapper validation covers common cases.
            }
          }

          if (mode === 'node' && (state.channel === 'outline' || state.channel === 'outlineColor')) {
            const outlineCfg = resolveLiveConfig('node', 'outline');
            const outlineColorCfg = resolveLiveConfig('node', 'outlineColor');
            const outlineType = outlineCfg?.type ?? outlineCfg?.mode ?? null;
            const outlineColorType = outlineColorCfg?.type ?? outlineColorCfg?.mode ?? null;
            const bothConstant = outlineType === 'constant' && outlineColorType === 'constant';
            if (typeof helios?.nodeOutlineUseAttributes === 'function') {
              helios.nodeOutlineUseAttributes(!bothConstant);
            }
          }
          setDirty(false);
        }
      });

      const updateAutoDomainFromNetwork = () => {
        const pending = state.pending;
        if (!pending) return false;
        const type = pending.type ?? pending.mode ?? null;
        if (type !== 'linear' && type !== 'colormap') return false;
        const attr = typeof pending.attributes === 'string' ? pending.attributes : null;
        if (!attr) return false;

        const uiMeta = pending.__ui && typeof pending.__ui === 'object' ? pending.__ui : null;
        const domainAuto = uiMeta?.domainAuto === true || attr === '$index';
        if (!domainAuto) return false;

        const nextDomain = suggestDomainForAttribute(mode, attr);
        const prevDomain = Array.isArray(pending.domain) ? pending.domain : null;
        if (prevDomain && prevDomain[0] === nextDomain[0] && prevDomain[1] === nextDomain[1]) return false;

        const nextPending = { ...pending, type, domain: nextDomain };
        markDomainAuto(nextPending, true);
        state.pending = nextPending;

        // Keep visuals in sync when the editor wasn't mid-edit.
        if (!state.dirty) {
          applyConfig(mode, state.channel, nextPending);
          setDirty(false);
        }
        return true;
      };

      let networkAttributeUnsub = null;
      const attachNetworkAttributeListeners = () => {
        if (networkAttributeUnsub) {
          networkAttributeUnsub();
          networkAttributeUnsub = null;
        }
        const network = net();
        if (!network) return;
        const handler = (event) => {
          const scope = event?.detail?.scope;
          if (scope && scope !== mode) return;
          const type = event?.type ?? '';
          if (type === 'attribute:changed') {
            const op = event?.detail?.op ?? '';
            if (op !== 'categorize' && op !== 'decategorize') return;
          }
          renderEditor();
        };
        if (typeof network.on === 'function') {
          const unsubs = [
            network.on('attribute:defined', handler),
            network.on('attribute:removed', handler),
            network.on('attribute:changed', handler),
          ];
          networkAttributeUnsub = () => {
            for (const unsub of unsubs) unsub?.();
          };
        } else if (typeof network.addEventListener === 'function') {
          network.addEventListener('attribute:defined', handler);
          network.addEventListener('attribute:removed', handler);
          network.addEventListener('attribute:changed', handler);
          networkAttributeUnsub = () => {
            network.removeEventListener('attribute:defined', handler);
            network.removeEventListener('attribute:removed', handler);
            network.removeEventListener('attribute:changed', handler);
          };
        }
      };

      // Recompute suggested domains when the underlying network changes.
      const onNetworkReplaced = () => {
        updateAutoDomainFromNetwork();
        attachNetworkAttributeListeners();
        renderEditor();
      };
      let unsub = null;
      if (helios?.on) {
        unsub = helios.on('network:replaced', onNetworkReplaced);
      } else if (helios?.addEventListener) {
        helios.addEventListener('network:replaced', onNetworkReplaced);
        unsub = () => helios.removeEventListener('network:replaced', onNetworkReplaced);
      }
      if (unsub) ui._controlCleanups.add(unsub);

      attachNetworkAttributeListeners();
      if (networkAttributeUnsub) ui._controlCleanups.add(() => networkAttributeUnsub?.());

      resetPendingFromLive();
      return { root, state, channels, setChannel };
    };

    const createDensityTab = () => {
      const root = document.createElement('div');
      root.className = 'helios-ui-mapper-tab';

      if (!helios || typeof helios.density !== 'function') {
        const note = document.createElement('div');
        note.style.color = 'var(--helios-ui-muted)';
        note.textContent = 'Density controls are unavailable for this Helios instance.';
        root.appendChild(note);
        return { root, refresh: () => {} };
      }

      const editorStack = new PanelStack();
      const editorBody = document.createElement('div');
      editorStack.add({ id: 'density-mapper-basic', title: 'Editor', content: editorBody });
      root.appendChild(editorStack.element);
      ui._controlCleanups.add(() => editorStack.destroy());

      const localControls = new Set();
      const registerControl = (control) => {
        if (control) localControls.add(control);
      };
      const destroyControls = () => {
        for (const control of localControls) {
          try {
            control.destroy?.();
          } catch (_) {
            // ignore
          }
        }
        localControls.clear();
      };
      ui._controlCleanups.add(() => destroyControls());

      const createCheckboxControl = ({ checked = false, onChange, onLabel = 'On', offLabel = 'Off' }) => {
        const toggle = createToggleControl({
          checked: Boolean(checked),
          onLabel,
          offLabel,
        });
        const onChangeHandler = () => onChange?.(toggle.checked);
        toggle.addEventListener('change', onChangeHandler);
        registerControl({
          destroy() {
            toggle.removeEventListener('change', onChangeHandler);
          },
        });
        return toggle;
      };

      const listDensityAttributes = () => {
        const network = net();
        if (!network || typeof network.getNodeAttributeNames !== 'function') {
          return ['Uniform', 'Degree'];
        }
        const names = ['Uniform', 'Degree'];
        let raw = [];
        try {
          raw = network.getNodeAttributeNames() ?? [];
        } catch (_) {
          raw = [];
        }
        for (const name of raw) {
          if (typeof name !== 'string') continue;
          if (!isPublicAttributeName(name)) continue;
          let info = null;
          try {
            info = network.getNodeAttributeInfo?.(name) ?? null;
          } catch (_) {
            info = null;
          }
          if (!info || (info.dimension ?? 1) !== 1) continue;
          if (!isNumericAttributeType(info.type)) continue;
          names.push(name);
        }
        const unique = Array.from(new Set(names));
        const fixed = unique.filter((name) => name === 'Uniform' || name === 'Degree');
        const attrs = unique.filter((name) => name !== 'Uniform' && name !== 'Degree');
        attrs.sort(naturalCompare);
        return [...fixed, ...attrs];
      };

      const cfg = () => helios.density();
      const applyDensity = (patch) => {
        helios.density(patch);
        helios.scheduler?.requestRender?.();
        helios.requestRender?.();
      };
      const RESOLUTION_PRESETS = [
        { value: 0.05, label: '1/20' },
        { value: 0.1, label: '1/10' },
        { value: 0.2, label: '1/5' },
        { value: 0.25, label: '1/4' },
        { value: 1 / 3, label: '1/3' },
        { value: 0.5, label: '1/2' },
        { value: 1, label: '1' },
      ];
      let autoBackground = false;
      let manualBackgroundColor = null;
      let densityBackgroundApplied = false;

      const clamp01 = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, Math.min(1, numeric));
      };

      const normalizeColormapSample = (sample) => {
        if (Array.isArray(sample) || ArrayBuffer.isView(sample)) {
          const r = clamp01(sample[0] ?? 0);
          const g = clamp01(sample[1] ?? 0);
          const b = clamp01(sample[2] ?? 0);
          const a = clamp01(sample.length >= 4 ? sample[3] : 1);
          return [r, g, b, a];
        }
        if (typeof sample === 'string') {
          const raw = sample.trim();
          const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw);
          if (hexMatch) {
            const hex = hexMatch[1];
            const expand = (c) => `${c}${c}`;
            const normalized = hex.length === 3
              ? hex.split('').map((c) => expand(c)).join('')
              : hex.length === 6
                ? hex
                : hex.slice(0, 6);
            const alphaHex = hex.length === 8 ? hex.slice(6, 8) : 'ff';
            return [
              parseInt(normalized.slice(0, 2), 16) / 255,
              parseInt(normalized.slice(2, 4), 16) / 255,
              parseInt(normalized.slice(4, 6), 16) / 255,
              parseInt(alphaHex, 16) / 255,
            ];
          }
          const rgbMatch = /^rgba?\(([^)]+)\)$/i.exec(raw);
          if (rgbMatch) {
            const parts = rgbMatch[1].split(',').map((v) => Number(v.trim()));
            if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
              const alpha = Number.isFinite(parts[3]) ? parts[3] : 1;
              return [
                clamp01(parts[0] / 255),
                clamp01(parts[1] / 255),
                clamp01(parts[2] / 255),
                clamp01(alpha),
              ];
            }
          }
        }
        return [0, 0, 0, 1];
      };

      const getDensityZeroColor = (state = cfg()) => {
        const key = state?.diverging ? state?.divergingColormap : state?.colormap;
        const resolved = resolveColormap(key) || resolveColormap('interpolateOrRd');
        const sample = resolved?.interpolate?.(0) ?? [0, 0, 0, 1];
        return normalizeColormapSample(sample);
      };

      const readCurrentBackgroundColor = () => {
        const current = helios.clearColor?.();
        if (!(Array.isArray(current) || ArrayBuffer.isView(current))) return null;
        return [
          clamp01(current[0] ?? 0),
          clamp01(current[1] ?? 0),
          clamp01(current[2] ?? 0),
          clamp01(current.length >= 4 ? current[3] : 1),
        ];
      };

      const shouldApplyDensityBackground = (state = cfg()) => autoBackground && state?.enabled === true;

      const captureManualBackground = () => {
        if (densityBackgroundApplied) return;
        const current = readCurrentBackgroundColor();
        if (current) manualBackgroundColor = current;
      };

      captureManualBackground();

      const restoreManualBackground = () => {
        if (!densityBackgroundApplied) return;
        densityBackgroundApplied = false;
        if (!manualBackgroundColor) return;
        try {
          helios.clearColor?.(manualBackgroundColor);
        } catch (_) {
          // ignore invalid background restoration
        }
      };

      const applyDensityBackground = (state = cfg()) => {
        if (!shouldApplyDensityBackground(state)) {
          restoreManualBackground();
          return;
        }
        if (!densityBackgroundApplied) captureManualBackground();
        try {
          helios.clearColor?.(getDensityZeroColor(state));
          densityBackgroundApplied = true;
        } catch (_) {
          // ignore invalid background conversion
        }
      };

      const toResolutionIndex = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 0;
        let bestIndex = 0;
        let bestDistance = Infinity;
        for (let i = 0; i < RESOLUTION_PRESETS.length; i += 1) {
          const dist = Math.abs(RESOLUTION_PRESETS[i].value - numeric);
          if (dist < bestDistance) {
            bestDistance = dist;
            bestIndex = i;
          }
        }
        return bestIndex;
      };

      const enabledToggle = createCheckboxControl({
        checked: cfg().enabled === true,
        onChange: (checked) => {
          applyDensity({ enabled: checked });
          applyDensityBackground();
        },
        onLabel: 'On',
        offLabel: 'Off',
      });
      editorBody.appendChild(createAlignedRow({
        title: 'Enabled',
        hint: 'Enable or disable density rendering.',
        controls: enabledToggle,
      }).row);

      const reliefToggle = createCheckboxControl({
        checked: cfg().topographic === true,
        onChange: (checked) => applyDensity({ topographic: checked }),
        onLabel: 'Relief',
        offLabel: 'Flat',
      });
      editorBody.appendChild(createAlignedRow({
        title: 'Relief',
        hint: 'Draw topographic contour lines over the density map.',
        controls: reliefToggle,
      }).row);

      const autoBackgroundToggle = createCheckboxControl({
        checked: autoBackground,
        onChange: (checked) => {
          autoBackground = checked === true;
          applyDensityBackground();
        },
        onLabel: 'Match',
        offLabel: 'Manual',
      });
      editorBody.appendChild(createAlignedRow({
        title: 'Map BG',
        hint: 'Match background to the zero-value color of the active density colormap.',
        controls: autoBackgroundToggle,
      }).row);

      const propertySelect = document.createElement('select');
      propertySelect.className = 'helios-ui-select';
      editorBody.appendChild(createAlignedRow({
        title: 'Density',
        hint: 'Primary density property.',
        controls: propertySelect,
      }).row);

      const compareSelect = document.createElement('select');
      compareSelect.className = 'helios-ui-select';
      editorBody.appendChild(createAlignedRow({
        title: 'vs',
        hint: 'Second property used for density comparison.',
        controls: compareSelect,
      }).row);

      const normalizeToggle = createCheckboxControl({
        checked: cfg().normalizeVs === true,
        onChange: (checked) => applyDensity({ normalizeVs: checked }),
        onLabel: 'Normalized',
        offLabel: 'Raw',
      });
      editorBody.appendChild(createAlignedRow({
        title: 'Norm.',
        hint: 'Normalize positive/negative comparison sides independently.',
        controls: normalizeToggle,
      }).row);

      const bandwidthControl = new LogSliderControls({
        value: cfg().bandwidth ?? 28.1,
        minExp: -0.9,
        maxExp: 2.5,
        stepExp: 0.05,
        minValue: 0.05,
        maxValue: 1000,
        digits: 2,
        onCommit: (value) => applyDensity({ bandwidth: value }),
      });
      registerControl(bandwidthControl);
      editorBody.appendChild(createAlignedRow({
        title: 'Bandwidth',
        hint: 'Kernel bandwidth (log scale).',
        controls: bandwidthControl.element,
      }).row);

      const zoomScaleToggle = createCheckboxControl({
        checked: cfg().scaleWithZoom === true,
        onChange: (checked) => applyDensity({ scaleWithZoom: checked }),
        onLabel: 'Scale',
        offLabel: 'Fixed',
      });
      editorBody.appendChild(createAlignedRow({
        title: 'Zoom',
        hint: 'Scale bandwidth with 2D zoom so density stays mostly stable while zooming.',
        controls: zoomScaleToggle,
      }).row);

      const weightControl = new LogSliderControls({
        value: cfg().weightScale ?? 398.1071705534973,
        minExp: 0,
        maxExp: 10,
        stepExp: 0.1,
        minValue: 1,
        maxValue: 1e8,
        digits: 2,
        onCommit: (value) => applyDensity({ weightScale: value }),
      });
      registerControl(weightControl);
      editorBody.appendChild(createAlignedRow({
        title: 'Weight',
        hint: 'Density intensity multiplier (log scale).',
        controls: weightControl.element,
      }).row);

      const resolutionWrap = document.createElement('div');
      resolutionWrap.style.display = 'flex';
      resolutionWrap.style.alignItems = 'center';
      resolutionWrap.style.gap = '8px';
      resolutionWrap.style.width = '100%';

      const resolutionSlider = document.createElement('input');
      resolutionSlider.type = 'range';
      resolutionSlider.className = 'helios-ui-slider';
      resolutionSlider.min = '0';
      resolutionSlider.max = String(RESOLUTION_PRESETS.length - 1);
      resolutionSlider.step = '1';
      resolutionSlider.style.flex = '1 1 auto';

      const resolutionLabel = document.createElement('span');
      resolutionLabel.style.color = 'var(--helios-ui-muted)';
      resolutionLabel.style.fontWeight = '600';
      resolutionLabel.style.minWidth = '3ch';
      resolutionLabel.style.textAlign = 'right';

      const setResolutionIndex = (index, { commit = false } = {}) => {
        const clampedIndex = Math.max(0, Math.min(RESOLUTION_PRESETS.length - 1, Math.floor(Number(index) || 0)));
        const entry = RESOLUTION_PRESETS[clampedIndex];
        resolutionSlider.value = String(clampedIndex);
        resolutionLabel.textContent = entry.label;
        if (commit) applyDensity({ qualityScale: entry.value });
      };

      resolutionSlider.addEventListener('input', () => {
        setResolutionIndex(Number(resolutionSlider.value), { commit: true });
      });

      resolutionWrap.appendChild(resolutionSlider);
      resolutionWrap.appendChild(resolutionLabel);
      editorBody.appendChild(createAlignedRow({
        title: 'Resolution',
        hint: 'Density map resolution scale.',
        controls: resolutionWrap,
      }).row);

      const colormapPicker = new ColormapPickerControl({
        catalog: colormapCatalog,
        portalRoot: ui?.container ?? document.body,
        value: cfg().diverging ? cfg().divergingColormap : cfg().colormap,
        fallbackValue: 'interpolateOrRd',
        searchPlaceholder: 'Search colormaps…',
        onChange: (key) => {
          const state = cfg();
          if (state.diverging) {
            applyDensity({ divergingColormap: key });
          } else {
            applyDensity({ colormap: key });
          }
          applyDensityBackground();
          refresh();
        },
      });
      registerControl(colormapPicker);
      editorBody.appendChild(createAlignedRow({
        title: 'Map',
        hint: 'Colormap for the density layer (sequential or diverging when required).',
        controls: colormapPicker.element,
      }).row);

      propertySelect.addEventListener('change', () => {
        applyDensity({ property: propertySelect.value });
        refresh();
      });
      compareSelect.addEventListener('change', () => {
        applyDensity({ compareProperty: compareSelect.value });
        normalizeToggle.disabled = compareSelect.value === 'None';
        refresh();
      });

      const refresh = () => {
        const state = cfg();
        const attrs = listDensityAttributes();
        captureManualBackground();

        const ensureOptionList = (select, values) => {
          const current = select.value;
          select.textContent = '';
          for (const value of values) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = value;
            select.appendChild(opt);
          }
          if (values.includes(current)) select.value = current;
        };

        ensureOptionList(propertySelect, attrs);
        ensureOptionList(compareSelect, ['None', ...attrs]);

        if (!attrs.includes(state.property)) {
          propertySelect.value = 'Uniform';
          applyDensity({ property: 'Uniform' });
        } else {
          propertySelect.value = state.property;
        }

        if (!['None', ...attrs].includes(state.compareProperty)) {
          compareSelect.value = 'None';
          applyDensity({ compareProperty: 'None' });
        } else {
          compareSelect.value = state.compareProperty;
        }

        enabledToggle.checked = state.enabled === true;
        reliefToggle.checked = state.topographic === true;
        normalizeToggle.checked = state.normalizeVs === true;
        zoomScaleToggle.checked = state.scaleWithZoom === true;
        normalizeToggle.disabled = compareSelect.value === 'None';

        bandwidthControl.setValue(Math.max(0.05, Number(state.bandwidth ?? 1)));
        weightControl.setValue(Math.max(1, Number(state.weightScale ?? 1)));
        setResolutionIndex(toResolutionIndex(state.qualityScale), { commit: false });

        const activeColormap = state.diverging ? state.divergingColormap : state.colormap;
        colormapPicker.setValue(activeColormap);
        applyDensityBackground(state);
      };

      const onNetworkReplaced = () => refresh();
      let unsub = null;
      if (helios?.on) {
        unsub = helios.on('network:replaced', onNetworkReplaced);
      } else if (helios?.addEventListener) {
        helios.addEventListener('network:replaced', onNetworkReplaced);
        unsub = () => helios.removeEventListener('network:replaced', onNetworkReplaced);
      }
      if (unsub) ui._controlCleanups.add(unsub);

      refresh();
      return { root, refresh };
    };

    const nodeTab = createModeTab('node');
    const edgeTab = createModeTab('edge');
    const densityTab = createDensityTab();

    let activeMode = 'node';

    const channelSelect = document.createElement('select');
    channelSelect.className = 'helios-ui-select helios-ui-select--compact';
    tooltips.attachTooltip(channelSelect, 'Select which visual channel to edit.');

    const getActiveTab = () => {
      if (activeMode === 'edge') return edgeTab;
      if (activeMode === 'density') return null;
      return nodeTab;
    };

    const syncChannelSelect = () => {
      const tab = getActiveTab();
      if (!tab) {
        channelSelect.disabled = true;
        channelSelect.style.display = 'none';
        return;
      }
      channelSelect.disabled = false;
      channelSelect.style.display = '';
      const { channels, state } = tab;
      channelSelect.textContent = '';
      for (const name of channels) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = CHANNEL_LABELS[name] ?? name;
        channelSelect.appendChild(opt);
      }
      channelSelect.value = channels.includes(state.channel) ? state.channel : channels[0];
    };

    channelSelect.addEventListener('change', () => {
      const tab = getActiveTab();
      if (!tab) return;
      tab.setChannel(channelSelect.value);
      syncChannelSelect();
    });

    syncChannelSelect();

    return ui.createTabbedPanel({
      id: options.id ?? 'helios-ui-mappers',
      title: options.title ?? 'Mappers',
      position: options.position ?? { x: 16, y: 120 },
      dock: options.dock ?? 'top-left',
      barRight: channelSelect,
      onActiveChanged: (tabId) => {
        if (tabId === 'edges') activeMode = 'edge';
        else if (tabId === 'density') activeMode = 'density';
        else activeMode = 'node';
        if (activeMode === 'density') densityTab.refresh?.();
        syncChannelSelect();
      },
      tabs: [
        { id: 'nodes', title: 'Nodes', content: nodeTab.root },
        { id: 'edges', title: 'Edges', content: edgeTab.root },
        { id: 'density', title: 'Density', content: densityTab.root },
      ],
      variant: 'panel',
    });
  }
}
