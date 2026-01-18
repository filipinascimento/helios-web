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

  for (const key of Object.keys(colormaps?.d3 ?? {})) {
    pushEntry({ key, label: key, group: 'd3', searchExtras: ['d3:'] });
  }

  for (const key of Object.keys(colormaps?.cmasher ?? {})) {
    const label = key.startsWith('cmasher_') ? key.slice('cmasher_'.length) : key;
    const alias = key.startsWith('cmasher_') ? `cmasher:${label}` : key;
    pushEntry({ key: alias, label, group: 'cmasher', searchExtras: [key, 'cmasher:', 'cmasher_'] });
  }

  for (const key of Object.keys(colormaps?.CET ?? {})) {
    const label = key.startsWith('CET_') ? key.slice('CET_'.length) : key;
    pushEntry({ key, label, group: 'CET', searchExtras: ['CET:'] });
  }

  for (const key of Object.keys(colormaps?.helios ?? {})) {
    pushEntry({ key, label: key, group: 'helios', searchExtras: ['helios:'] });
  }

  const byGroup = new Map();
  for (const entry of entries) {
    let list = byGroup.get(entry.group);
    if (!list) {
      list = [];
      byGroup.set(entry.group, list);
    }
    list.push(entry);
  }

  for (const list of byGroup.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label));
  }

  return { entries, byGroup };
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
    const network = helios?.network ?? null;
    const options = this.options ?? {};

    const tooltips = createTooltipManager();
    ui._controlCleanups.add(() => tooltips.destroy());

    const createAlignedRow = ({ title, hint, controls }) => createAlignedRowEl({
      title,
      hint,
      controls,
      attachTooltip: tooltips.attachTooltip,
    });

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
      nodeAttribute: 'From Nodes',
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

      // Editor currently doesn't represent exception rules.
      if (Array.isArray(config.rules) && config.rules.length > 0) return false;

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
      if (!network) return null;
      if (rawName === '$index') return { dimension: 1, type: null };
      if (typeof rawName !== 'string' || !rawName.length) return null;

      if (scope === 'edge' && rawName.startsWith('@node.')) {
        const key = rawName.slice('@node.'.length);
        const resolved = resolveVisualAlias(key);
        return network.getNodeAttributeInfo?.(resolved) ?? null;
      }

      const resolved = resolveVisualAlias(rawName);
      return scope === 'edge'
        ? (network.getEdgeAttributeInfo?.(resolved) ?? null)
        : (network.getNodeAttributeInfo?.(resolved) ?? null);
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
        if (isColorChannel) return dim === 3 || dim === 4 || dim === 1;
        if (isScalarChannel) return dim === 1;
        return false;
      }

      if (mapperType === 'passthrough') {
        if (isPositionChannel) {
          return dim === 3;
        }
        if (isColorChannel) {
          if (isEdge && typeof name === 'string' && name.startsWith('@node.')) return false;
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
      if (!network) return [];
      const getNames = scope === 'edge' ? network.getEdgeAttributeNames : network.getNodeAttributeNames;
      if (typeof getNames !== 'function') return [];
      const raw = getNames.call(network) ?? [];
      const out = [];

      out.push('$index');
      if (scope === 'node') {
        out.push('color', 'size', 'outline', 'outlineColor', 'position');
      } else {
        out.push('edgeColor', 'edgeWidth', 'edgeOpacity', 'edgeEndpointPosition', 'edgeEndpointSize');
      }

      for (const name of raw) {
        if (typeof name !== 'string') continue;
        if (!isPublicAttributeName(name)) continue;
        out.push(name);
      }

      if (scope === 'edge' && typeof network.getNodeAttributeNames === 'function') {
        const nodeRaw = network.getNodeAttributeNames() ?? [];
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
      if (!network) return null;
      if (typeof rawName !== 'string' || !rawName) return null;

      if (rawName === '$index') {
        const count = scope === 'edge'
          ? (network.edgeCount ?? network.edgesCount ?? null)
          : (network.nodeCount ?? network.nodesCount ?? null);
        if (Number.isFinite(count) && count > 0) return { min: 0, max: Math.max(0, count - 1) };
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

        const setPendingType = (nextType) => {
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
            base.domain = Array.isArray(prev.domain)
              ? prev.domain
              : (Array.isArray(live?.domain) ? live.domain : suggestDomainForAttribute(mode, attr));
            const suggested = suggestRangeForChannel(mode, state.channel);
            base.range = Array.isArray(prev.range) ? prev.range : (Array.isArray(live?.range) ? live.range : suggested);
          }
          if (nextType === 'colormap') {
            base.colormap = prev.colormap ?? live?.colormap ?? 'interpolateInferno';
            const attr = typeof base.attributes === 'string' ? base.attributes : null;
            base.transformType = prev.transformType ?? live?.transformType ?? 'linear';
            base.transformPower = prev.transformPower ?? live?.transformPower ?? 1;
            base.domain = Array.isArray(prev.domain)
              ? prev.domain
              : (Array.isArray(live?.domain) ? live.domain : suggestDomainForAttribute(mode, attr));
            base.alpha = prev.alpha ?? live?.alpha ?? 1;
            base.clamp = prev.clamp ?? live?.clamp ?? true;
          }
          state.pending = base;
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
          const current = typeof state.pending.nodeAttribute === 'string'
            ? state.pending.nodeAttribute
            : (typeof live?.nodeAttribute === 'string' ? live.nodeAttribute : '');

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
            title: 'From/To',
            hint: 'Pick the edge input (edge attribute or a derived @node.* value).',
            controls: attrSelect,
          }).row);
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
            state.pending = { ...state.pending, type: 'linear', attributes: attr, domain };
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
            state.pending = { ...state.pending, type: 'linear', domain: [min, max] };
          }

          const slider = new TwoHandleRange({
            min,
            max,
            step,
            value: domain,
            onChange: (next) => {
              state.pending = { ...state.pending, type: 'linear', domain: next };
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
            state.pending = { ...state.pending, type: 'linear', domain: [lo, hi] };
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
        }

        if (pendingType === 'colormap') {
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
            state.pending = { ...state.pending, type: 'colormap', attributes: attr, domain };
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
          const colormapInput = document.createElement('input');
          colormapInput.type = 'text';
          colormapInput.className = 'helios-ui-text helios-ui-colormap-picker__input';
          colormapInput.placeholder = 'interpolateInferno';
          colormapInput.value = String(state.pending.colormap ?? 'interpolateInferno');

          const preview = document.createElement('div');
          preview.className = 'helios-ui-colormap-picker__preview helios-ui-colormap-thumb';

          const popover = document.createElement('div');
          popover.className = 'helios-ui-colormap-popover';
          popover.hidden = true;

          const popoverPanel = document.createElement('div');
          popoverPanel.className = 'helios-ui-colormap-popover__panel';
          popover.appendChild(popoverPanel);

          const portalRoot = ui?.container ?? document.body;
          portalRoot.appendChild(popover);
          ui._controlCleanups.add(() => popover.remove());

          const updatePreview = (nameRaw) => {
            const name = colormapInput.value || 'interpolateInferno';
            const gradient = colormapToCssGradient(name, { samples: 32 });
            preview.style.background = gradient ?? 'linear-gradient(90deg, rgba(120,120,120,1), rgba(40,40,40,1))';
          };

          const renderPopover = (queryRaw) => {
            popoverPanel.replaceChildren();

            const query = String(queryRaw ?? '').trim().toLowerCase();
            const tokens = query.split(/\s+/).filter(Boolean);
            if (!tokens.length) {
              const note = document.createElement('div');
              note.className = 'helios-ui-colormap-picker__note';
              note.textContent = 'Type to search colormaps (e.g. inferno, CET, cmasher).';
              popoverPanel.appendChild(note);
              return;
            }

            const matches = colormapCatalog.entries.filter((entry) => tokens.every((t) => entry.search.includes(t)));
            if (!matches.length) {
              const note = document.createElement('div');
              note.className = 'helios-ui-colormap-picker__note';
              note.textContent = 'No matches.';
              popoverPanel.appendChild(note);
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

            const capPerGroup = 60;
            const capTotal = 220;
            let total = 0;

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
                const gradient = colormapToCssGradient(entry.key, { samples: 28 });
                itemThumb.style.background = gradient ?? 'linear-gradient(90deg, rgba(120,120,120,1), rgba(40,40,40,1))';

                item.appendChild(itemTitle);
                item.appendChild(itemThumb);

                item.addEventListener('pointerdown', (e) => {
                  // Keep focus on the input while selecting.
                  e.preventDefault();
                  colormapInput.value = entry.key;
                  state.pending = { ...state.pending, type: 'colormap', colormap: entry.key || 'interpolateInferno' };
                  setDirty(true);
                  updatePreview();
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
              popoverPanel.appendChild(section);
              if (total >= capTotal) break;
            }

            if (matches.length > capTotal) {
              const note = document.createElement('div');
              note.className = 'helios-ui-colormap-picker__note';
              note.textContent = `Showing ${capTotal} of ${matches.length}. Refine your search.`;
              popoverPanel.appendChild(note);
            }
          };

          const OFFSET = 6;
          const MARGIN = 10;
          const MIN_HEIGHT = 180;
          const MIN_WIDTH = 240;
          const MAX_WIDTH = 420;

          const positionPopover = () => {
            if (popover.hidden) return;
            const anchor = colormapInput.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const spaceBelow = vh - anchor.bottom - MARGIN;
            const spaceAbove = anchor.top - MARGIN;
            const spaceRight = vw - anchor.right - MARGIN;
            const spaceLeft = anchor.left - MARGIN;

            popover.style.width = `${Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, anchor.width))}px`;
            popover.style.left = '0px';
            popover.style.top = '0px';
            popover.style.maxHeight = '';

            // Ensure we can measure the panel.
            popover.style.visibility = 'hidden';
            popover.hidden = false;
            const measured = popover.getBoundingClientRect();
            const desiredW = measured.width || Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, anchor.width));
            const desiredH = measured.height || MIN_HEIGHT;

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
            popoverPanel.style.maxHeight = `${Math.min(maxH, vh - top - MARGIN)}px`;
            popover.style.visibility = 'visible';
          };

          const openPopoverIfNeeded = () => {
            const query = (colormapInput.value ?? '').trim();
            if (!query) {
              popover.hidden = true;
              return;
            }
            renderPopover(query);
            popover.hidden = false;
            positionPopover();
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

          const onDocScroll = () => positionPopover();
          const onWinResize = () => positionPopover();

          document.addEventListener('pointerdown', onDocPointerDown, true);
          document.addEventListener('scroll', onDocScroll, true);
          window.addEventListener('resize', onWinResize);
          ui._controlCleanups.add(() => document.removeEventListener('pointerdown', onDocPointerDown, true));
          ui._controlCleanups.add(() => document.removeEventListener('scroll', onDocScroll, true));
          ui._controlCleanups.add(() => window.removeEventListener('resize', onWinResize));

          colormapInput.addEventListener('focus', () => openPopoverIfNeeded());
          colormapInput.addEventListener('input', () => {
            updatePreview();
            openPopoverIfNeeded();
          });
          colormapInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              closePopover();
              colormapInput.blur();
            }
            if (e.key === 'Enter') {
              closePopover();
              state.pending = {
                ...state.pending,
                type: 'colormap',
                colormap: colormapInput.value || 'interpolateInferno',
              };
              setDirty(true);
            }
          });
          colormapInput.addEventListener('change', () => {
            state.pending = {
              ...state.pending,
              type: 'colormap',
              colormap: colormapInput.value || 'interpolateInferno',
            };
            setDirty(true);
            updatePreview();
          });

          nameWrap.addEventListener('focusout', () => {
            // Close if focus has left the picker entirely.
            queueMicrotask(() => {
              if (!nameWrap.contains(document.activeElement) && !popover.contains(document.activeElement)) closePopover();
            });
          });

          updatePreview();

          nameWrap.appendChild(colormapInput);
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
            state.pending = { ...state.pending, type: 'colormap', domain: [min, max] };
          }

          const slider = new TwoHandleRange({
            min,
            max,
            step,
            value: domain,
            onChange: (next) => {
              state.pending = { ...state.pending, type: 'colormap', domain: next };
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
            state.pending = { ...state.pending, type: 'colormap', domain: [lo, hi] };
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
