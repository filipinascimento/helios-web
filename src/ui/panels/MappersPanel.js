import { PanelStack } from './PanelStack.js';
import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { createTooltipManager } from '../controls/createTooltipManager.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { TwoHandleRange } from '../controls/TwoHandleRange.js';
import { colormaps } from '../../colors/colormaps.js';
import { VISUAL_ATTRIBUTE_MAP } from '../../pipeline/constants.js';
import { clampNumber } from '../utils/numbers.js';
import { toHex8 } from '../utils/colors.js';
import { isPublicAttributeName } from '../utils/attributes.js';
import { shallowCloneChannelConfig } from '../utils/channelConfig.js';
import { colormapToCssGradient } from '../utils/colormapPreview.js';

function collectColormapSuggestionNames() {
  const names = new Set();
  const add = (value) => {
    if (!value) return;
    names.add(String(value));
  };
  for (const key of Object.keys(colormaps?.d3 ?? {})) add(key);
  for (const key of Object.keys(colormaps?.CET ?? {})) add(key);
  for (const key of Object.keys(colormaps?.helios ?? {})) add(key);
  for (const key of Object.keys(colormaps?.cmasher ?? {})) {
    add(key);
    if (key.startsWith('cmasher_')) {
      add(`cmasher:${key.slice('cmasher_'.length)}`);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

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

function isHexColorString(value) {
  if (typeof value !== 'string') return false;
  const hex = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex);
}

const isNumericAttributeType = (type) => typeof type === 'number';

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
    };

    const nodeChannels = ['color', 'size', 'outline', 'outlineColor', 'position'];
    // Edge endpoint channels are node-derived and intentionally not exposed in the UI.
    const edgeChannels = ['color', 'width', 'opacity'];

    const colormapNames = collectColormapSuggestionNames();
    const colormapCatalog = buildColormapCatalog();

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

    const isCompatibleAttribute = (scope, channel, mapperType, name) => {
      const info = getAttributeInfo(scope, name);
      if (!info) return false;
      if (info.type != null && !isNumericAttributeType(info.type)) return false;

      const dim = info.dimension ?? 1;
      const isEdge = scope === 'edge';
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
        if (isColorChannel) return dim === 3 || dim === 4;
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

    const listAttributeNames = (scope, { channel, mapperType } = {}) => {
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
        return unique.filter((name) => isCompatibleAttribute(scope, channel, mapperType, name));
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
        if (Number.isFinite(count) && count > 0) return { min: 0, max: Math.max(1, count) };
        return null;
      }

      const resolveName = (n) => resolveVisualAlias(n);
      const isNodeProxy = scope === 'edge' && rawName.startsWith('@node.');
      const name = isNodeProxy ? rawName.slice('@node.'.length) : rawName;
      const resolved = resolveName(name);

      try {
        const buffer = isNodeProxy
          ? network.getNodeAttributeBuffer?.(resolved)
          : (scope === 'edge' ? network.getEdgeAttributeBuffer?.(resolved) : network.getNodeAttributeBuffer?.(resolved));

        const view = buffer?.view ?? null;
        if (!view || typeof view.length !== 'number' || view.length <= 0) return null;

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < view.length; i += 1) {
          const v = Number(view[i]);
          if (!Number.isFinite(v)) continue;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
        if (min === max) return { min, max: min + 1 };
        return { min, max };
      } catch (_) {
        return null;
      }
    };

    const suggestDomainForAttribute = (scope, rawName) => {
      const extent = computeScalarExtent(scope, rawName);
      if (extent && Number.isFinite(extent.min) && Number.isFinite(extent.max)) return [extent.min, extent.max];
      return [0, 1];
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
        if (channel === 'outline') return [0, 6];
      }
      if (mode === 'edge') {
        if (channel === 'width') return [0.5, 6];
        if (channel === 'opacity') return [0, 1];
      }
      return [0, 1];
    };

    const suggestStepForRange = (min, max) => {
      const span = Math.abs(Number(max) - Number(min));
      if (!Number.isFinite(span) || span <= 0) return 0.01;
      if (span <= 1) return 0.001;
      if (span <= 10) return 0.01;
      if (span <= 100) return 0.1;
      return 1;
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

      const titleEl = document.createElement('div');
      titleEl.textContent = title ?? '';
      titleEl.style.fontWeight = '700';
      titleEl.style.fontSize = '12px';
      titleEl.style.color = 'var(--helios-ui-muted)';
      titleEl.style.letterSpacing = '0.4px';
      titleEl.style.textTransform = 'uppercase';
      if (tooltip) tooltips.attachTooltip?.(titleEl, tooltip);
      header.appendChild(titleEl);
      if (action) header.appendChild(action);
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
        if (mode === 'edge' && isColor) return ['constant', 'passthrough', 'nodeAttribute', 'colormap'];
        if (mode === 'edge' && isScalar) return ['constant', 'passthrough', 'nodeAttribute', 'linear'];
        if (isColor) return ['constant', 'passthrough', 'colormap'];
        if (isScalar) return ['constant', 'passthrough', 'linear'];
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
	        row.style.gap = '8px';
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
	        alphaInput.style.maxWidth = compact ? '72px' : '88px';
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
          const names = listAttributeNames('node', { channel: state.channel, mapperType: 'nodeAttribute' });
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
              setDirty(true);
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
            const toggleWrap = document.createElement('label');
            toggleWrap.style.display = 'inline-flex';
            toggleWrap.style.alignItems = 'center';
            toggleWrap.style.gap = '6px';
            toggleWrap.style.justifyContent = 'flex-end';

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = Boolean(isSplit);
            toggle.style.margin = '0';

            const toggleText = document.createElement('span');
            toggleText.textContent = 'Source/Target';
            toggleText.style.color = 'var(--helios-ui-muted)';

            toggleWrap.appendChild(toggle);
            toggleWrap.appendChild(toggleText);
            wrap.appendChild(toggleWrap);

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
            const toggleWrap = document.createElement('label');
            toggleWrap.style.display = 'inline-flex';
            toggleWrap.style.alignItems = 'center';
            toggleWrap.style.gap = '6px';
            toggleWrap.style.justifyContent = 'flex-end';

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = Boolean(isSplit);
            toggle.style.margin = '0';

            const toggleText = document.createElement('span');
            toggleText.textContent = 'Source/Target';
            toggleText.style.color = 'var(--helios-ui-muted)';

            toggleWrap.appendChild(toggle);
            toggleWrap.appendChild(toggleText);
            wrap.appendChild(toggleWrap);

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
          for (const optVal of ['linear', 'log', 'log1p', 'logit', 'power']) {
            const opt = document.createElement('option');
            opt.value = optVal;
            opt.textContent = optVal === 'log1p' ? 'Log1p' : `${optVal.slice(0, 1).toUpperCase()}${optVal.slice(1)}`;
            transformSelect.appendChild(opt);
          }
          transformSelect.value = String(state.pending.transformType ?? 'linear');

          const powerInput = document.createElement('input');
          powerInput.type = 'number';
          powerInput.className = 'helios-ui-number';
          powerInput.style.maxWidth = '96px';
          powerInput.style.flex = '0 0 auto';
          powerInput.value = String(Number.isFinite(Number(state.pending.transformPower)) ? state.pending.transformPower : 1);
          powerInput.hidden = transformSelect.value !== 'power';

          transformSelect.addEventListener('change', () => {
            const nextType = transformSelect.value || 'linear';
            powerInput.hidden = nextType !== 'power';
            state.pending = { ...state.pending, type: 'linear', transformType: nextType };
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
          const extent = computeScalarExtent(mode, domainAttr);
          const min = extent?.min ?? 0;
          const max = extent?.max ?? 1;
          const step = suggestStepForRange(min, max);
          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : [min, max];

          if (!Array.isArray(state.pending.domain) && domainAttr) {
            const nextPending = { ...state.pending, type: 'linear', domain: [min, max] };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
          }

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
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            const loSlider = Math.max(min, Math.min(max, lo));
            const hiSlider = Math.max(min, Math.min(max, hi));
            slider.aInput.value = String(loSlider);
            slider.bInput.value = String(hiSlider);
            slider.setVisual(loSlider, hiSlider);
            const nextPending = { ...state.pending, type: 'linear', domain: [lo, hi] };
            markDomainAuto(nextPending, false);
            state.pending = nextPending;
            setDirty(true);
          };
          d0.addEventListener('change', commitDomainTyped);
          d1.addEventListener('change', commitDomainTyped);

          values.appendChild(d0);
          values.appendChild(d1);
          domainWrap.appendChild(slider.element);
          domainWrap.appendChild(values);
          editorBody.appendChild(createAlignedRow({
            title: 'Domain',
            hint: 'Input range used for scaling (min/max).',
            controls: domainWrap,
          }).row);

          const rangeWrap = document.createElement('div');
          rangeWrap.style.display = 'grid';
          rangeWrap.style.gap = '6px';
          rangeWrap.style.width = '100%';

          const minAllowed = state.channel === 'opacity' ? 0 : 0;
          const maxAllowed = state.channel === 'opacity' ? 1 : null;

          const suggestedRange = suggestRangeForChannel(mode, state.channel);
          const stepOut = suggestStepForRange(suggestedRange[0], suggestedRange[1]);

          const range = Array.isArray(state.pending.range) ? state.pending.range : suggestedRange;
          if (!Array.isArray(state.pending.range)) {
            state.pending = { ...state.pending, type: 'linear', range };
          }

          const commitRangeAt = (idx, value) => {
            const n = clampNumber(value, { min: minAllowed, max: maxAllowed });
            if (n == null) return;
            const current = Array.isArray(state.pending.range) ? state.pending.range : suggestedRange;
            const next = [current[0], current[1]];
            next[idx] = n;
            state.pending = { ...state.pending, type: 'linear', range: next };
            setDirty(true);
          };

          const labelStyle = (el) => {
            el.style.fontSize = '12px';
            el.style.color = 'var(--helios-ui-muted)';
          };

          const minLabel = document.createElement('div');
          minLabel.textContent = 'Min';
          labelStyle(minLabel);
          rangeWrap.appendChild(minLabel);
          const minControls = new SuggestedSliderControls({
            value: Number(range[0] ?? suggestedRange[0]),
            suggested: [suggestedRange[0], suggestedRange[1]],
            step: stepOut,
            inputMin: minAllowed,
            inputMax: maxAllowed,
            onCommit: (v) => commitRangeAt(0, v),
          });
          registerControl(minControls);
          rangeWrap.appendChild(minControls.element);

          const maxLabel = document.createElement('div');
          maxLabel.textContent = 'Max';
          labelStyle(maxLabel);
          rangeWrap.appendChild(maxLabel);
          const maxControls = new SuggestedSliderControls({
            value: Number(range[1] ?? suggestedRange[1]),
            suggested: [suggestedRange[0], suggestedRange[1]],
            step: stepOut,
            inputMin: minAllowed,
            inputMax: maxAllowed,
            onCommit: (v) => commitRangeAt(1, v),
          });
          registerControl(maxControls);
          rangeWrap.appendChild(maxControls.element);

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
	              item.style.padding = '8px';
	              item.style.borderRadius = '10px';
	              item.style.border = '1px solid color-mix(in srgb, var(--helios-ui-border) 70%, transparent)';
	              item.style.background = 'color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent)';

	              const top = document.createElement('div');
	              top.style.display = 'flex';
	              top.style.gap = '8px';
	              top.style.alignItems = 'center';
	              top.style.justifyContent = 'space-between';

	              const condRow = document.createElement('div');
	              condRow.style.display = 'flex';
	              condRow.style.gap = '8px';
	              condRow.style.alignItems = 'center';
	              condRow.style.flex = '1 1 auto';
	              condRow.style.minWidth = '0';

	              const opSelect = document.createElement('select');
	              opSelect.className = 'helios-ui-select helios-ui-select--compact';
	              opSelect.style.maxWidth = '72px';
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
	              rhsInput.style.maxWidth = '96px';
	              rhsInput.value = spec.rhs != null ? String(spec.rhs) : '';
	              rhsInput.placeholder = 'value';

	              const outInput = document.createElement('input');
	              outInput.type = 'number';
	              outInput.className = 'helios-ui-number';
	              outInput.style.maxWidth = '140px';
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
	              const thenLabel = createRuleKeyword('then');

	              condRow.appendChild(ifLabel);
	              condRow.appendChild(opSelect);
	              condRow.appendChild(rhsInput);
	              condRow.appendChild(thenLabel);
	              condRow.appendChild(outInput);
	              tooltips.attachTooltip(opSelect, 'Condition operator.');
	              tooltips.attachTooltip(rhsInput, 'Comparison value.');
	              tooltips.attachTooltip(outInput, 'Override output.');

	              const remove = document.createElement('button');
	              remove.type = 'button';
	              remove.className = 'helios-ui-button helios-ui-button--compact';
	              remove.textContent = '×';
	              remove.setAttribute('aria-label', 'Remove override');
	              tooltips.attachTooltip(remove, 'Remove this override.');
	              remove.addEventListener('click', () => {
	                const nextRules = rules.filter((_, idx) => idx !== i);
	                state.pending = { ...state.pending, type: 'linear', rules: nextRules };
	                setDirty(true);
	                renderRulesList();
	              });

	              top.appendChild(condRow);
	              top.appendChild(remove);
	              item.appendChild(top);
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
          for (const optVal of ['linear', 'log', 'log1p', 'logit', 'power']) {
            const opt = document.createElement('option');
            opt.value = optVal;
            opt.textContent = optVal === 'log1p' ? 'Log1p' : `${optVal.slice(0, 1).toUpperCase()}${optVal.slice(1)}`;
            transformSelect.appendChild(opt);
          }
          transformSelect.value = String(state.pending.transformType ?? 'linear');

          const powerInput = document.createElement('input');
          powerInput.type = 'number';
          powerInput.className = 'helios-ui-number';
          powerInput.style.maxWidth = '96px';
          powerInput.style.flex = '0 0 auto';
          powerInput.value = String(Number.isFinite(Number(state.pending.transformPower)) ? state.pending.transformPower : 1);
          powerInput.hidden = transformSelect.value !== 'power';

          transformSelect.addEventListener('change', () => {
            const nextType = transformSelect.value || 'linear';
            powerInput.hidden = nextType !== 'power';
            state.pending = { ...state.pending, type: 'colormap', transformType: nextType };
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

          const nameWrap = document.createElement('div');
          nameWrap.className = 'helios-ui-colormap-picker';
          const colormapDisplay = document.createElement('button');
          colormapDisplay.type = 'button';
          colormapDisplay.className = 'helios-ui-select helios-ui-colormap-picker__display';

          const colormapDisplayLabel = document.createElement('span');
          colormapDisplayLabel.className = 'helios-ui-ellipsis';
          colormapDisplay.appendChild(colormapDisplayLabel);

          const preview = document.createElement('div');
          preview.className = 'helios-ui-colormap-picker__preview helios-ui-colormap-thumb';

          const popover = document.createElement('div');
          popover.className = 'helios-ui-colormap-popover';
          popover.hidden = true;

          const popoverPanel = document.createElement('div');
          popoverPanel.className = 'helios-ui-colormap-popover__panel';
          popover.appendChild(popoverPanel);

          const popoverHeader = document.createElement('div');
          popoverHeader.className = 'helios-ui-colormap-popover__header';
          const searchInput = document.createElement('input');
          searchInput.type = 'text';
          searchInput.className = 'helios-ui-text helios-ui-colormap-popover__search';
          searchInput.placeholder = 'Search colormaps (e.g. viridis, CET, cmasher)…';
          popoverHeader.appendChild(searchInput);
          popoverPanel.appendChild(popoverHeader);

          const popoverList = document.createElement('div');
          popoverList.className = 'helios-ui-colormap-popover__list';
          popoverPanel.appendChild(popoverList);

          const portalRoot = ui?.container ?? document.body;
          portalRoot.appendChild(popover);
          const popoverCleanups = [];
          const registerPopoverCleanup = (fn) => {
            if (typeof fn === 'function') popoverCleanups.push(fn);
          };
          registerPopoverCleanup(() => popover.remove());

          const resolveDisplayEntry = (keyRaw) => {
            const key = String(keyRaw ?? '').trim();
            if (!key) return null;
            return colormapCatalog.byKey.get(key) ?? null;
          };

          const formatDisplayValue = (keyRaw) => {
            const key = String(keyRaw ?? '').trim();
            if (!key) return '';
            const entry = resolveDisplayEntry(key);
            if (!entry) return key;
            return `${entry.group}: ${entry.label}`;
          };

          const applySelectionToUi = (keyRaw) => {
            const key = String(keyRaw ?? '').trim() || 'interpolateInferno';
            colormapDisplayLabel.textContent = formatDisplayValue(key);
            colormapDisplay.title = colormapDisplayLabel.textContent;
            colormapDisplay.dataset.colormapKey = key;
            updatePreview(key);
          };

          const updatePreview = (keyRaw) => {
            const key = String(keyRaw ?? '').trim() || 'interpolateInferno';
            const gradient = colormapToCssGradient(key, { samples: 32, alpha: 1 });
            preview.style.backgroundImage = gradient ?? 'linear-gradient(90deg, rgba(120,120,120,1), rgba(40,40,40,1))';
          };

          const setSelectedColormap = (keyRaw) => {
            const key = String(keyRaw ?? '').trim() || 'interpolateInferno';
            state.pending = { ...state.pending, type: 'colormap', colormap: key };
            applySelectionToUi(key);
            setDirty(true);
          };

          // Initialize UI from current pending value (no dirty).
          applySelectionToUi(state.pending.colormap ?? 'interpolateInferno');

          let thumbObserver = null;
          const ensureThumbObserver = () => {
            if (thumbObserver) return thumbObserver;
            if (typeof IntersectionObserver !== 'function') return null;
            thumbObserver = new IntersectionObserver((entries) => {
              for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const el = entry.target;
                const key = el?.dataset?.colormapKey;
                if (!key) continue;
                if (el.dataset.colormapReady === '1') continue;
                el.dataset.colormapReady = '1';
                const gradient = colormapToCssGradient(key, { samples: 28, alpha: 1 });
                el.style.backgroundImage = gradient ?? 'linear-gradient(90deg, rgba(120,120,120,1), rgba(40,40,40,1))';
                thumbObserver.unobserve(el);
              }
            }, { root: popoverPanel, rootMargin: '64px' });
            registerPopoverCleanup(() => {
              thumbObserver?.disconnect?.();
              thumbObserver = null;
            });
            return thumbObserver;
          };

          const renderPopover = (queryRaw) => {
            popoverList.replaceChildren();

            const query = String(queryRaw ?? '').trim().toLowerCase();
            const tokens = query.split(/\s+/).filter(Boolean);

            const matches = tokens.length
              ? colormapCatalog.entries.filter((entry) => tokens.every((t) => entry.search.includes(t)))
              : colormapCatalog.entries;

            if (!matches.length) {
              const note = document.createElement('div');
              note.className = 'helios-ui-colormap-picker__note';
              note.textContent = 'No matches.';
              popoverList.appendChild(note);
              return;
            }

            const groupOrder = ['d3', 'cmasher', 'CET', 'helios', 'other'];
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

            const observer = ensureThumbObserver();

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
                  // Keep focus on the input while selecting.
                  e.preventDefault();
                  setSelectedColormap(entry.key);
                  popover.hidden = true;
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
              popoverList.appendChild(section);
              if (total >= capTotal) break;
            }

            if (matches.length > capTotal) {
              const note = document.createElement('div');
              note.className = 'helios-ui-colormap-picker__note';
              note.textContent = `Showing ${capTotal} of ${matches.length}. Refine your search.`;
              popoverList.appendChild(note);
            }
          };

          const OFFSET = 6;
          const MARGIN = 10;
          const MIN_HEIGHT = 180;
          const MIN_WIDTH = 240;
          const MAX_WIDTH = 420;
          const MAX_HEIGHT = 420;

	          const positionPopover = () => {
	            if (popover.hidden) return;
	            const anchor = colormapDisplay.getBoundingClientRect();
	            const vw = window.innerWidth;
	            const vh = window.innerHeight;

            const spaceBelow = vh - anchor.bottom - MARGIN;
            const spaceAbove = anchor.top - MARGIN;
            const spaceRight = vw - anchor.right - MARGIN;
            const spaceLeft = anchor.left - MARGIN;

            popover.style.width = `${Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, anchor.width))}px`;
            popover.style.left = '0px';
            popover.style.top = '0px';
            popover.hidden = false;

            const measured = popoverPanel.getBoundingClientRect();
            const desiredW = measured.width || Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, anchor.width));
            const desiredH = popoverPanel.scrollHeight || measured.height || MIN_HEIGHT;

            const canVertical = Math.max(spaceBelow, spaceAbove) >= MIN_HEIGHT;
            const preferBelow = spaceBelow >= spaceAbove;
            const canHorizontal = Math.max(spaceRight, spaceLeft) >= MIN_WIDTH;
            const preferRight = spaceRight >= spaceLeft;

            let placement = 'bottom';
            if (canVertical) {
              placement = preferBelow ? 'bottom' : 'top';
            } else if (canHorizontal) {
              placement = preferRight ? 'right' : 'left';
            } else {
              // Pick the side with the most room.
              const best = [
                { side: 'bottom', size: spaceBelow },
                { side: 'top', size: spaceAbove },
                { side: 'right', size: spaceRight },
                { side: 'left', size: spaceLeft },
              ].sort((a, b) => b.size - a.size)[0];
              placement = best?.side ?? 'bottom';
            }

            let left = anchor.left;
            let top = anchor.bottom + OFFSET;
            let maxH = Math.max(80, spaceBelow);

            if (placement === 'top') {
              maxH = Math.max(80, spaceAbove);
              top = Math.max(MARGIN, anchor.top - OFFSET - Math.min(desiredH, maxH));
            } else if (placement === 'right') {
              left = anchor.right + OFFSET;
              top = anchor.top;
              maxH = Math.max(80, vh - 2 * MARGIN);
            } else if (placement === 'left') {
              left = Math.max(MARGIN, anchor.left - OFFSET - desiredW);
              top = anchor.top;
              maxH = Math.max(80, vh - 2 * MARGIN);
            }

            // Clamp within viewport.
            left = Math.max(MARGIN, Math.min(vw - MARGIN - desiredW, left));
            top = Math.max(MARGIN, Math.min(vh - MARGIN - 80, top));

            popover.style.width = `${Math.min(desiredW, vw - 2 * MARGIN)}px`;
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;

            const bottomLimit = placement === 'top' ? Math.max(MARGIN, anchor.top - OFFSET) : vh - MARGIN;
            const availableH = Math.max(120, bottomLimit - top);
            popoverPanel.style.maxHeight = `${Math.min(MAX_HEIGHT, availableH)}px`;
            popoverList.style.maxHeight = '';
          };

	          const closePopover = () => {
	            popover.hidden = true;
	          };

          const onDocPointerDown = (e) => {
            const target = e.target;
            if (popover.hidden) return;
            if (target && (popover.contains(target) || nameWrap.contains(target))) return;
            closePopover();
          };

          let pendingPosition = false;
          const schedulePosition = () => {
            if (pendingPosition) return;
            pendingPosition = true;
            requestAnimationFrame(() => {
              pendingPosition = false;
              positionPopover();
            });
          };

          const onDocScroll = (e) => {
            if (popover.hidden) return;
            const target = e?.target;
            if (target && popoverPanel.contains(target)) return; // allow internal list scroll
            schedulePosition();
          };
          const onWinResize = () => schedulePosition();

          document.addEventListener('pointerdown', onDocPointerDown, true);
          document.addEventListener('scroll', onDocScroll, true);
          window.addEventListener('resize', onWinResize);
          registerPopoverCleanup(() => document.removeEventListener('pointerdown', onDocPointerDown, true));
          registerPopoverCleanup(() => document.removeEventListener('scroll', onDocScroll, true));
          registerPopoverCleanup(() => window.removeEventListener('resize', onWinResize));

          const openPopover = ({ seedQuery } = {}) => {
            popover.hidden = false;
            const query = seedQuery != null ? String(seedQuery) : '';
            searchInput.value = query;
            renderPopover(searchInput.value);
            positionPopover();
            queueMicrotask(() => searchInput.focus());
          };

          const onDisplayClick = () => openPopover();
          const onPreviewClick = () => openPopover();
          const onDisplayKeyDown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPopover();
              return;
            }
            if (e.key && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
              e.preventDefault();
              openPopover({ seedQuery: e.key });
            }
          };

          colormapDisplay.addEventListener('click', onDisplayClick);
          preview.addEventListener('click', onPreviewClick);
          colormapDisplay.addEventListener('keydown', onDisplayKeyDown);
          registerPopoverCleanup(() => colormapDisplay.removeEventListener('click', onDisplayClick));
          registerPopoverCleanup(() => preview.removeEventListener('click', onPreviewClick));
          registerPopoverCleanup(() => colormapDisplay.removeEventListener('keydown', onDisplayKeyDown));

          const onSearchInput = () => {
            renderPopover(searchInput.value);
            positionPopover();
          };
          searchInput.addEventListener('input', onSearchInput);
          registerPopoverCleanup(() => searchInput.removeEventListener('input', onSearchInput));

          const onSearchKeyDown = (e) => {
            if (e.key === 'Escape') {
              closePopover();
              colormapDisplay.focus();
            }
            if (e.key === 'Enter' && (searchInput.value ?? '').trim()) {
              closePopover();
              // If the user typed an exact key, accept it.
              const typed = String(searchInput.value ?? '').trim();
              if (colormapCatalog.byKey.has(typed)) setSelectedColormap(typed);
            }
          };
          searchInput.addEventListener('keydown', onSearchKeyDown);
          registerPopoverCleanup(() => searchInput.removeEventListener('keydown', onSearchKeyDown));

          const onNameWrapFocusOut = () => {
            // Close if focus has left the picker entirely.
            queueMicrotask(() => {
              if (!nameWrap.contains(document.activeElement) && !popover.contains(document.activeElement)) closePopover();
            });
          };
          nameWrap.addEventListener('focusout', onNameWrapFocusOut);
          registerPopoverCleanup(() => nameWrap.removeEventListener('focusout', onNameWrapFocusOut));

          registerControl({
            destroy() {
              for (const cleanup of popoverCleanups.splice(0)) {
                try {
                  cleanup();
                } catch (_) {
                  // ignore
                }
              }
            },
          });

          nameWrap.appendChild(colormapDisplay);
          nameWrap.appendChild(preview);

          editorBody.appendChild(createAlignedRow({
            title: 'Colormap',
            hint: 'Choose the named colormap/interpolator to use.',
            controls: nameWrap,
          }).row);

          const domainWrap = document.createElement('div');
          domainWrap.style.display = 'grid';
          domainWrap.style.gap = '2px';
          domainWrap.style.width = '100%';

          const domainAttr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
          const extent = computeScalarExtent(mode, domainAttr);
          const min = extent?.min ?? 0;
          const max = extent?.max ?? 1;
          const step = suggestStepForRange(min, max);
          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : [min, max];

          if (!Array.isArray(state.pending.domain) && domainAttr) {
            const nextPending = { ...state.pending, type: 'colormap', domain: [min, max] };
            markDomainAuto(nextPending, true);
            state.pending = nextPending;
          }

          const slider = new TwoHandleRange({
            min,
            max,
            step,
            value: domain,
            onChange: (next) => {
              const nextPending = { ...state.pending, type: 'colormap', domain: next };
              markDomainAuto(nextPending, false);
              state.pending = nextPending;
              setDirty(true);
              d0.value = String(next[0]);
              d1.value = String(next[1]);
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
            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            const loSlider = Math.max(min, Math.min(max, lo));
            const hiSlider = Math.max(min, Math.min(max, hi));
            slider.aInput.value = String(loSlider);
            slider.bInput.value = String(hiSlider);
            slider.setVisual(loSlider, hiSlider);
            const nextPending = { ...state.pending, type: 'colormap', domain: [lo, hi] };
            markDomainAuto(nextPending, false);
            state.pending = nextPending;
            setDirty(true);
          };
          d0.addEventListener('change', commitDomainTyped);
          d1.addEventListener('change', commitDomainTyped);

          values.appendChild(d0);
          values.appendChild(d1);
          domainWrap.appendChild(slider.element);
          domainWrap.appendChild(values);
          editorBody.appendChild(createAlignedRow({
            title: 'Domain',
            hint: 'Input range used to map values into the colormap (min/max).',
            controls: domainWrap,
          }).row);

          const advanced = document.createElement('div');
          const clampWrap = document.createElement('label');
          clampWrap.style.display = 'inline-flex';
          clampWrap.style.alignItems = 'center';
          clampWrap.style.gap = '6px';
          const clampInput = document.createElement('input');
          clampInput.type = 'checkbox';
          clampInput.checked = state.pending.clamp ?? true;
          clampInput.style.margin = '0';
          const clampText = document.createElement('span');
          clampText.textContent = 'Clamp';
          clampText.style.color = 'var(--helios-ui-muted)';
          clampWrap.appendChild(clampInput);
          clampWrap.appendChild(clampText);

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

          clampInput.addEventListener('change', () => {
            state.pending = { ...state.pending, type: 'colormap', clamp: clampInput.checked };
            setDirty(true);
          });

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
		              item.style.padding = '8px';
		              item.style.borderRadius = '10px';
		              item.style.border = '1px solid color-mix(in srgb, var(--helios-ui-border) 70%, transparent)';
		              item.style.background = 'color-mix(in srgb, var(--helios-ui-bg-solid) 85%, transparent)';

		              const top = document.createElement('div');
		              top.style.display = 'flex';
		              top.style.gap = '8px';
		              top.style.alignItems = 'center';
		              top.style.justifyContent = 'space-between';

		              const condRow = document.createElement('div');
		              condRow.style.display = 'flex';
		              condRow.style.gap = '8px';
		              condRow.style.alignItems = 'center';
		              condRow.style.flex = '1 1 auto';
		              condRow.style.minWidth = '0';

		              const opSelect = document.createElement('select');
		              opSelect.className = 'helios-ui-select helios-ui-select--compact';
		              opSelect.style.maxWidth = '72px';
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
		              rhsInput.style.maxWidth = '96px';
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
		              remove.addEventListener('click', () => {
		                const nextRules = rules.filter((_, idx) => idx !== i);
		                state.pending = { ...state.pending, type: 'colormap', rules: nextRules };
		                setDirty(true);
		                renderRulesList();
		              });

		              top.appendChild(condRow);
		              top.appendChild(remove);

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
		              outWrap.style.display = 'flex';
		              outWrap.style.gap = '8px';
		              outWrap.style.alignItems = 'center';
		              outWrap.style.width = '100%';

		              outRow.style.flex = '1 1 auto';
		              outRow.style.minWidth = '0';
		              outRow.style.width = 'auto';

		              outWrap.appendChild(createRuleKeyword('then'));
		              outWrap.appendChild(outRow);

		              item.appendChild(top);
		              item.appendChild(outWrap);
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

      // Recompute suggested domains when the underlying network changes.
      const onNetworkReplaced = () => {
        updateAutoDomainFromNetwork();
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

      resetPendingFromLive();
      return { root, state, channels, setChannel };
    };

    const nodeTab = createModeTab('node');
    const edgeTab = createModeTab('edge');

    let activeMode = 'node';

    const channelSelect = document.createElement('select');
    channelSelect.className = 'helios-ui-select helios-ui-select--compact';
    tooltips.attachTooltip(channelSelect, 'Select which visual channel to edit.');

    const getActiveTab = () => (activeMode === 'edge' ? edgeTab : nodeTab);

    const syncChannelSelect = () => {
      const { channels, state } = getActiveTab();
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
        activeMode = tabId === 'edges' ? 'edge' : 'node';
        syncChannelSelect();
      },
      tabs: [
        { id: 'nodes', title: 'Nodes', content: nodeTab.root },
        { id: 'edges', title: 'Edges', content: edgeTab.root },
      ],
      variant: 'panel',
    });
  }
}
