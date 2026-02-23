import { AttributeType } from 'helios-network';
import { PanelManager } from './panels/PanelManager.js';
import { UIAttribute } from './state/UIAttribute.js';
import { ensureDefaultStyles } from './style/defaultStyles.js';
import { defineHeliosWebComponents } from './web-components/defineHeliosWebComponents.js';
import { createSliderRow } from './controls/createSliderRow.js';
import { createAlignedRowEl } from './controls/createAlignedRowEl.js';
import { createTooltipManager } from './controls/createTooltipManager.js';
import { PanelStack } from './panels/PanelStack.js';
import { TabbedPanel } from './panels/TabbedPanel.js';
import { colormaps } from '../colors/colormaps.js';
import { VISUAL_ATTRIBUTE_MAP } from '../pipeline/constants.js';
import { MappersPanel } from './panels/MappersPanel.js';
import { LayoutPanel } from './panels/LayoutPanel.js';
import { clampNumber } from './utils/numbers.js';
import { toHex8 } from './utils/colors.js';
import { isPublicAttributeName } from './utils/attributes.js';
import { shallowCloneChannelConfig } from './utils/channelConfig.js';

function resolveUiContainer({ helios, container, layerName }) {
  if (container) return container;
  if (helios?.layers?.layers && typeof helios.layers.addLayer === 'function') {
    const layer = document.createElement('div');
    layer.className = 'helios-ui';
    helios.layers.addLayer(layerName ?? 'ui', layer);
    return layer;
  }
  const fallback = document.createElement('div');
  fallback.className = 'helios-ui';
  (document.body ?? document.documentElement).appendChild(fallback);
  return fallback;
}

function createStatChip(labelText, valueEl) {
  const stat = document.createElement('div');
  stat.className = 'helios-ui-stat';
  const label = document.createElement('div');
  label.className = 'helios-ui-stat__label';
  label.textContent = labelText;
  const value = valueEl ?? document.createElement('div');
  if (!valueEl) {
    value.className = 'helios-ui-stat__value';
    value.textContent = '—';
  } else {
    value.classList.add('helios-ui-stat__value');
  }
  stat.appendChild(label);
  stat.appendChild(value);
  return { stat, label, value };
}

function summarizeChannelConfig(config) {
  if (!config) return '—';
  const type = config.type ?? config.mode ?? 'custom';
  const attr = config.attributes ?? config.from;
  if (type === 'custom') {
    const name = config?.meta?.name;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.toLowerCase() === 'custom') return 'custom';
    return `custom: ${trimmed}`;
  }
  if (type === 'constant') {
    return config.value != null ? `constant` : 'constant';
  }
  if (type === 'passthrough') {
    return typeof attr === 'string' ? `passthrough: ${attr}` : 'passthrough';
  }
  if (type === 'linear') {
    const d = Array.isArray(config.domain) ? config.domain.join('..') : '';
    const r = Array.isArray(config.range) ? config.range.join('..') : '';
    const src = typeof attr === 'string' ? attr : 'attr';
    return `linear: ${src} (${d || '—'} → ${r || '—'})`;
  }
  if (type === 'colormap' || config.colormap) {
    const name = config.colormap ?? config.scale ?? config.range ?? 'colormap';
    const d = Array.isArray(config.domain) ? config.domain.join('..') : '';
    const src = typeof attr === 'string' ? attr : 'attr';
    return `colormap: ${src} → ${name}${d ? ` (${d})` : ''}`;
  }
  if (type === 'categorical') {
    const src = typeof attr === 'string' ? attr : 'attr';
    return `categorical: ${src}`;
  }
  if (type === 'nodeAttribute') return `node attribute: ${config.nodeAttribute ?? ''}`.trim();
  return String(type);
}

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

export class HeliosUI {
  constructor(options = {}) {
    this.helios = options.helios ?? null;
    this.layerName = options.layerName ?? 'ui';
    this.theme = options.theme ?? 'dark';
    this.styles = options.styles ?? 'default';

    if (this.styles === 'default') ensureDefaultStyles(options.document ?? document);

    // Ensure custom elements exist before panels/controls are created.
    defineHeliosWebComponents(options.document ?? document);

    this.container = resolveUiContainer({
      helios: this.helios,
      container: options.container ?? null,
      layerName: this.layerName,
    });
    this.container.classList.add('helios-ui');
    this.container.dataset.theme = this.theme;

    this.panelManager = new PanelManager({
      container: this.container,
      allowDrag: options.allowDrag ?? true,
      labelColumn: options.labelColumn ?? undefined,
    });

    this._controlCleanups = new Set();
    this._boundAttributesById = new Map();
    this._heliosBindingUnsubscribe = null;
  }

  _ensureHeliosBindingListener() {
    if (this._heliosBindingUnsubscribe || !this.helios) return;
    const handler = (event) => {
      const detail = event?.detail;
      const id = detail?.id;
      if (!id) return;
      const attribute = this._boundAttributesById.get(id);
      if (attribute) attribute.notify();
    };
    if (typeof this.helios.on === 'function') {
      this._heliosBindingUnsubscribe = this.helios.on('ui:binding-change', handler);
    } else if (typeof this.helios.addEventListener === 'function') {
      this.helios.addEventListener('ui:binding-change', handler);
      this._heliosBindingUnsubscribe = () => this.helios.removeEventListener('ui:binding-change', handler);
    }
    if (this._heliosBindingUnsubscribe) this._controlCleanups.add(this._heliosBindingUnsubscribe);
  }

  setTheme(theme) {
    this.theme = theme;
    if (this.container) this.container.dataset.theme = theme;
  }

  toggleTheme() {
    this.setTheme(this.theme === 'dark' ? 'light' : 'dark');
  }

  bindHeliosAccessor(accessorName, options = {}) {
    if (!this.helios) {
      throw new Error('HeliosUI.bindHeliosAccessor requires a Helios instance');
    }
    const accessor = this.helios[accessorName];
    if (typeof accessor !== 'function') {
      throw new Error(`Helios instance has no accessor method "${accessorName}()"`);
    }
    const info = typeof this.helios.uiBindingInfo === 'function'
      ? (this.helios.uiBindingInfo(accessorName) ?? null)
      : null;
    const merged = info ? { ...info, ...options } : options;
    const eventName = merged.eventName ?? (accessorName === 'background' ? 'clearColor' : accessorName);
    const id = merged.id ?? `helios.${eventName}`;
    const label = merged.label ?? accessorName;
    const defaultValue = merged.defaultValue ?? null;
    const type = merged.type ?? 'number';
    const makeAttribute = (factory) => factory({
      id,
      label,
      readOnly: Boolean(merged.readOnly ?? false),
      min: merged.min ?? null,
      max: merged.max ?? null,
      step: merged.step ?? null,
      domain: merged.domain ?? null,
      recommendedRange: merged.recommendedRange ?? null,
      meta: { source: 'helios', accessor: accessorName, eventName, ...merged.meta },
      get: () => {
        const value = accessor.call(this.helios);
        return value == null ? defaultValue : value;
      },
      set: (value) => accessor.call(this.helios, value),
    });
    const attribute = type === 'boolean'
      ? makeAttribute(UIAttribute.boolean)
      : type === 'string'
        ? makeAttribute(UIAttribute.string)
        : makeAttribute(UIAttribute.number);
    this._boundAttributesById.set(id, attribute);
    this._ensureHeliosBindingListener();
    return attribute;
  }

  createPanel(options) {
    return this.panelManager.createPanel(options);
  }

  createTabbedPanel(options = {}) {
    const tabs = new TabbedPanel({
      tabs: options.tabs ?? [],
      activeId: options.activeId,
      barRight: options.barRight,
      variant: options.variant,
      onActiveChanged: options.onActiveChanged,
    });
    this._controlCleanups.add(() => tabs.destroy());
    return this.createPanel({
      id: options.id,
      title: options.title,
      position: options.position,
      dock: options.dock,
      content: tabs.element,
    });
  }

  createDemoPanel(options = {}) {
    const content = document.createElement('div');

    const tooltips = createTooltipManager();
    this._controlCleanups.add(() => tooltips.destroy());

    const createAlignedRow = ({ title, hint, controls }) => createAlignedRowEl({
      title,
      hint,
      controls,
      attachTooltip: tooltips.attachTooltip,
    });

    let themeRow = document.createElement('div');
    const themeToggle = document.createElement('button');
    themeToggle.type = 'button';
    themeToggle.className = 'helios-ui-toggle';
    themeToggle.setAttribute('role', 'switch');

    const toggleThumb = document.createElement('span');
    toggleThumb.className = 'helios-ui-toggle__thumb';
    toggleThumb.setAttribute('aria-hidden', 'true');
    const toggleText = document.createElement('span');
    toggleText.className = 'helios-ui-toggle__text';
    themeToggle.appendChild(toggleThumb);
    themeToggle.appendChild(toggleText);

    const syncThemeToggle = () => {
      const isDark = this.theme === 'dark';
      themeToggle.setAttribute('aria-checked', isDark ? 'true' : 'false');
      toggleText.textContent = isDark ? 'Dark' : 'Light';
    };
    syncThemeToggle();

    themeToggle.addEventListener('click', () => {
      this.toggleTheme();
      syncThemeToggle();
    });

    const themeControls = document.createElement('div');
    themeControls.className = 'helios-ui-row__controls';
    themeControls.appendChild(themeToggle);

    const built = createAlignedRow({ title: 'Theme', hint: 'Toggle light/dark', controls: themeControls });
    themeRow = built.row;

    if (this.helios) {
      const bindings = this.helios?.constructor?.UI_BINDINGS ?? null;

      const networkControls = (() => {
        const container = document.createElement('div');
        container.className = 'helios-ui-network';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.xnet,.zxnet,.bxnet';
        fileInput.style.display = 'none';

        const formatSelect = document.createElement('select');
        formatSelect.className = 'helios-ui-select helios-ui-select--compact';
        for (const fmt of ['bxnet', 'zxnet', 'xnet']) {
          const opt = document.createElement('option');
          opt.value = fmt;
          opt.textContent = fmt.toUpperCase();
          formatSelect.appendChild(opt);
        }

        const loadButton = document.createElement('button');
        loadButton.type = 'button';
        loadButton.className = 'helios-ui-button helios-ui-button--icon';
        loadButton.setAttribute('aria-label', 'Load network…');

        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'helios-ui-button helios-ui-button--icon';
        saveButton.setAttribute('aria-label', 'Save network');

        const makeIcon = (d) => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('viewBox', '0 0 24 24');
          svg.classList.add('helios-ui-button__icon');
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('d', d);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', 'currentColor');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(path);
          return svg;
        };

        // Simple, readable icons (stroke, currentColor).
        const loadIcon = makeIcon('M12 3v10m0 0l-4-4m4 4l4-4M4 17v3h16v-3');
        const saveIcon = makeIcon('M12 21V11m0 0l-4 4m4-4l4 4M4 7V4h16v3');

        const loadText = document.createElement('span');
        loadText.textContent = 'Load';
        const saveText = document.createElement('span');
        saveText.textContent = 'Save';
        loadButton.appendChild(loadIcon);
        loadButton.appendChild(loadText);
        saveButton.appendChild(saveIcon);
        saveButton.appendChild(saveText);

        tooltips.attachTooltip(loadButton, 'Load a network file (.xnet/.zxnet/.bxnet)');
        tooltips.attachTooltip(saveButton, 'Save the current network as a file');
        tooltips.attachTooltip(formatSelect, 'Select export format');

        const controls = document.createElement('div');
        controls.className = 'helios-ui-network__actions';
        controls.appendChild(loadButton);
        controls.appendChild(saveButton);
        controls.appendChild(formatSelect);
        controls.appendChild(fileInput);

        let baseName = this.helios._lastLoadedNetworkBase ?? 'network';
        let loadedName = this.helios._lastLoadedNetworkName ?? null;
        let loadedFormat = this.helios._lastLoadedNetworkFormat ?? null;
        if (loadedFormat && ['bxnet', 'zxnet', 'xnet'].includes(loadedFormat)) {
          formatSelect.value = loadedFormat;
        }

        const sanitizeBaseName = (value) => {
          const raw = String(value ?? '').trim();
          // Keep filenames portable and avoid path separators.
          return raw.replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_');
        };

        let lastValidBaseName = sanitizeBaseName(baseName) || 'network';
        baseName = lastValidBaseName;

        const downloadBlob = (blob, filename) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 250);
        };

        const nameBar = document.createElement('div');
        nameBar.className = 'helios-ui-network__name';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'helios-ui-text';
        nameInput.value = lastValidBaseName;
        nameInput.placeholder = 'network';
        nameInput.spellcheck = false;
        nameInput.autocapitalize = 'off';
        nameInput.autocomplete = 'off';
        nameInput.inputMode = 'text';

        const extEl = document.createElement('span');
        extEl.className = 'helios-ui-network__ext';

        const syncExtension = () => {
          extEl.textContent = `.${formatSelect.value}`;
        };
        syncExtension();

        const commitBaseName = () => {
          const candidate = sanitizeBaseName(nameInput.value);
          if (candidate) {
            lastValidBaseName = candidate;
            baseName = candidate;
            if (nameInput.value !== candidate) nameInput.value = candidate;
          } else {
            nameInput.value = lastValidBaseName;
          }
        };

        nameInput.addEventListener('blur', commitBaseName);
        nameInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            nameInput.blur();
          }
        });

        tooltips.attachTooltip(nameInput, 'Base filename (without extension). Used when saving.');

        nameBar.appendChild(nameInput);
        nameBar.appendChild(extEl);

        const stats = document.createElement('div');
        stats.className = 'helios-ui-stats helios-ui-network__stats';
        const nodesValue = document.createElement('div');
        nodesValue.textContent = '—';
        const edgesValue = document.createElement('div');
        edgesValue.textContent = '—';
        const typeValue = document.createElement('div');
        typeValue.textContent = '—';
        const avgDegValue = document.createElement('div');
        avgDegValue.textContent = '—';

        stats.appendChild(createStatChip('Nodes', nodesValue).stat);
        stats.appendChild(createStatChip('Edges', edgesValue).stat);
        stats.appendChild(createStatChip('Type', typeValue).stat);
        stats.appendChild(createStatChip('Avg deg', avgDegValue).stat);

        const refreshNetworkInfo = () => {
          const network = this.helios?.network ?? null;
          const nodes = network?.nodeCount ?? 0;
          const edges = network?.edgeCount ?? 0;
          const directed = Boolean(network?.directed);
          const avgDegree = nodes ? (directed ? edges / nodes : (2 * edges) / nodes) : 0;

          syncExtension();
          nodesValue.textContent = String(nodes);
          edgesValue.textContent = String(edges);
          typeValue.textContent = directed ? 'directed' : 'undirected';
          avgDegValue.textContent = Number.isFinite(avgDegree) ? avgDegree.toFixed(2) : '—';
        };

        refreshNetworkInfo();

        loadButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files?.[0] ?? null;
          fileInput.value = '';
          if (!file) return;
          loadButton.disabled = true;
          saveButton.disabled = true;
          try {
            await this.helios.loadNetwork(file, { disposeOld: true, recreateRenderer: true, keepCamera: false });
            loadedName = file.name;
            const nextBase = this.helios._lastLoadedNetworkBase ?? file.name.replace(/\.[^.]+$/, '');
            const sanitized = sanitizeBaseName(nextBase);
            if (sanitized) {
              baseName = sanitized;
              lastValidBaseName = sanitized;
              nameInput.value = sanitized;
            }
            loadedFormat = this.helios._lastLoadedNetworkFormat ?? loadedFormat;
            if (loadedFormat && ['bxnet', 'zxnet', 'xnet'].includes(loadedFormat)) {
              formatSelect.value = loadedFormat;
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to load network', error);
          } finally {
            refreshNetworkInfo();
            loadButton.disabled = false;
            saveButton.disabled = false;
          }
        });

        saveButton.addEventListener('click', async () => {
          saveButton.disabled = true;
          loadButton.disabled = true;
          try {
            commitBaseName();
            const fmt = formatSelect.value;
            const blob = await this.helios.saveNetwork(fmt, { output: 'blob' });
            if (blob) {
              const filename = `${lastValidBaseName}.${fmt}`;
              downloadBlob(blob, filename);
            }
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Failed to save network', error);
          } finally {
              refreshNetworkInfo();
            saveButton.disabled = false;
            loadButton.disabled = false;
          }
        });

          formatSelect.addEventListener('change', () => refreshNetworkInfo());

          // Update stats if the network is replaced externally.
          const onNetworkReplaced = () => refreshNetworkInfo();
          let unsub = null;
          if (this.helios?.on) {
            unsub = this.helios.on('network:replaced', onNetworkReplaced);
          } else if (this.helios?.addEventListener) {
            this.helios.addEventListener('network:replaced', onNetworkReplaced);
            unsub = () => this.helios.removeEventListener('network:replaced', onNetworkReplaced);
          }
          if (unsub) this._controlCleanups.add(unsub);

          container.appendChild(stats);
          container.appendChild(controls);
          container.appendChild(nameBar);
        return container;
      })();

      const createRows = (accessorNames) => {
        const container = document.createElement('div');
        for (const accessorName of accessorNames) {
          const info = bindings?.[accessorName] ?? null;
          if (info?.type && info.type !== 'number') continue;
          if (typeof this.helios[accessorName] !== 'function') continue;
          const attribute = this.bindHeliosAccessor(accessorName);
          const row = createSliderRow(attribute, { hint: info?.description ?? null });
          container.appendChild(row.element);
          this._controlCleanups.add(row.destroy);
        }
        return container;
      };

      const createToggleRow = (accessorName) => {
        const info = bindings?.[accessorName] ?? null;
        if (!info || info.type !== 'boolean') return null;
        if (typeof this.helios[accessorName] !== 'function') return null;
        const attribute = this.bindHeliosAccessor(accessorName);
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.className = 'helios-ui-toggle';
        toggle.setAttribute('aria-label', info.label ?? accessorName);
        toggle.disabled = attribute.readOnly;

        const toggleText = document.createElement('span');
        toggleText.className = 'helios-ui-toggle__text';
        toggleText.style.fontWeight = '600';
        toggleText.style.fontSize = '12px';
        toggleText.style.color = 'var(--helios-ui-muted)';

        const syncToggle = (value) => {
          const enabled = Boolean(value);
          toggle.checked = enabled;
          toggle.setAttribute('aria-checked', enabled ? 'true' : 'false');
          toggleText.textContent = enabled ? 'On' : 'Off';
        };

        const unsub = attribute.subscribe((value) => {
          syncToggle(value);
        });

        toggle.addEventListener('change', () => {
          attribute.write(toggle.checked, { source: 'ui', event: 'change' });
        });

        const controls = document.createElement('div');
        controls.className = 'helios-ui-row__controls';
        controls.appendChild(toggle);
        controls.appendChild(toggleText);
        const { row } = createAlignedRow({
          title: info.label ?? accessorName,
          hint: info.description ?? null,
          controls,
        });
        this._controlCleanups.add(() => unsub());
        return row;
      };

      const clamp01 = (value) => {
        const v = Number(value);
        if (!Number.isFinite(v)) return 0;
        return Math.max(0, Math.min(1, v));
      };

      const rgba01ToHex6 = (rgba) => {
        const r = Math.round(255 * clamp01(rgba?.[0] ?? 0));
        const g = Math.round(255 * clamp01(rgba?.[1] ?? 0));
        const b = Math.round(255 * clamp01(rgba?.[2] ?? 0));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      };

      const createColorWithAlphaControls = ({ ariaLabel, getValue, setValue }) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '8px';
        row.style.alignItems = 'center';
        row.style.width = '100%';

        const swatchWrap = document.createElement('div');
        swatchWrap.className = 'helios-ui-color-swatch';

        const swatch = document.createElement('div');
        swatch.className = 'helios-ui-color-swatch__swatch';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'helios-ui-color-swatch__input';
        colorInput.setAttribute('aria-label', ariaLabel);

        const alphaInput = document.createElement('input');
        alphaInput.type = 'number';
        alphaInput.className = 'helios-ui-number';
        alphaInput.min = '0';
        alphaInput.max = '1';
        alphaInput.step = '0.01';
        alphaInput.style.maxWidth = '88px';
        alphaInput.title = 'Alpha';
        alphaInput.setAttribute('aria-label', `${ariaLabel} alpha`);

        const alphaLabel = document.createElement('span');
        alphaLabel.textContent = 'Alpha';
        alphaLabel.style.color = 'var(--helios-ui-muted)';

        const rawValue = getValue?.();

        let baseHex = '#000000';
        let alpha = 1;
        if (typeof rawValue === 'string') {
          const raw = rawValue.startsWith('#') ? rawValue.slice(1) : rawValue;
          baseHex = raw.length >= 6 ? `#${raw.slice(0, 6)}` : '#000000';
          const alphaHex = raw.length === 8 ? raw.slice(6, 8) : 'ff';
          alpha = Math.round((parseInt(alphaHex, 16) / 255) * 100) / 100;
        } else if (Array.isArray(rawValue) || ArrayBuffer.isView(rawValue)) {
          baseHex = rgba01ToHex6(rawValue);
          alpha = clamp01(rawValue?.[3] ?? 1);
        }

        colorInput.value = baseHex;
        alphaInput.value = String(Number.isFinite(alpha) ? alpha : 1);
        swatch.style.background = colorInput.value;

        const commit = () => {
          const a = clampNumber(alphaInput.value, { min: 0, max: 1 });
          if (a == null) return;
          setValue?.(toHex8(colorInput.value, a));
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

      const createLabelSourceSelect = () => {
        const select = document.createElement('select');
        select.className = 'helios-ui-select';
        select.setAttribute('aria-label', 'Label source attribute');

        const readNodeAttributeNames = () => {
          const network = this.helios?.network ?? null;
          if (!network || typeof network.getNodeAttributeNames !== 'function') return [];
          try {
            const raw = network.getNodeAttributeNames() ?? [];
            const out = [];
            for (const name of raw) {
              if (typeof name !== 'string') continue;
              if (!isPublicAttributeName(name)) continue;
              out.push(name);
            }
            out.sort((a, b) => a.localeCompare(b));
            return out;
          } catch (_) {
            return [];
          }
        };

        const refreshOptions = () => {
          const currentRaw = this.helios?.labelSource?.();
          const current = typeof currentRaw === 'string' ? currentRaw.trim() : '';
          const currentUi = current === '$id' ? '$index' : current;

          const options = [
            { value: '', label: 'Auto (Label, Name, id)' },
            { value: '$index', label: '$index (node id)' },
          ];
          const seen = new Set(options.map((entry) => entry.value));
          for (const name of readNodeAttributeNames()) {
            if (seen.has(name)) continue;
            options.push({ value: name, label: name });
            seen.add(name);
          }
          if (currentUi && !seen.has(currentUi)) {
            options.push({ value: currentUi, label: `${currentUi} (custom)` });
            seen.add(currentUi);
          }

          select.replaceChildren();
          for (const entry of options) {
            const opt = document.createElement('option');
            opt.value = entry.value;
            opt.textContent = entry.label;
            select.appendChild(opt);
          }
          select.value = seen.has(currentUi) ? currentUi : '';
        };

        select.addEventListener('change', () => {
          const next = String(select.value ?? '').trim();
          if (!next) {
            this.helios?.labelSource?.(null);
          } else if (next === '$index') {
            this.helios?.labelSource?.('$id');
          } else {
            this.helios?.labelSource?.(next);
          }
          refreshOptions();
        });

        const onNetworkReplaced = () => refreshOptions();
        let unsubscribe = null;
        if (this.helios?.on) {
          unsubscribe = this.helios.on('network:replaced', onNetworkReplaced);
        } else if (this.helios?.addEventListener) {
          this.helios.addEventListener('network:replaced', onNetworkReplaced);
          unsubscribe = () => this.helios.removeEventListener('network:replaced', onNetworkReplaced);
        }

        refreshOptions();
        return {
          element: select,
          destroy() {
            if (typeof unsubscribe === 'function') unsubscribe();
          },
        };
      };

      const createLabelFontFamilyInput = () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'helios-ui-text';
        input.placeholder = 'ui-sans-serif, system-ui, sans-serif';
        input.setAttribute('aria-label', 'Label font family');
        input.value = String(this.helios?.labelFontFamily?.() ?? '');
        input.addEventListener('change', () => {
          const next = String(input.value ?? '').trim();
          this.helios?.labelFontFamily?.(next);
        });
        return input;
      };

      const stack = new PanelStack();
      stack.add({
        id: 'network-io',
        title: 'Network',
        content: networkControls,
      });

      stack.add({
        id: 'appearance',
        title: 'Appearance',
        content: (() => {
          const wrapper = document.createElement('div');
          wrapper.appendChild(themeRow);

          wrapper.appendChild(createAlignedRow({
            title: 'Background',
            hint: 'Clear/background color (including opacity).',
            controls: createColorWithAlphaControls({
              ariaLabel: 'Background color',
              getValue: () => this.helios?.clearColor?.(),
              setValue: (value) => this.helios?.clearColor?.(value),
            }),
          }).row);

          const modeSelect = document.createElement('select');
          modeSelect.className = 'helios-ui-select';
          modeSelect.setAttribute('aria-label', 'Edge transparency mode');
          tooltips.attachTooltip(modeSelect, 'How edges blend/accumulate when overlapping.');

          const modes = [
            { value: 'alpha', label: 'Alpha' },
            { value: 'weighted', label: 'Smooth' },
            { value: 'additive', label: 'Additive' },
            { value: 'screen', label: 'Screen' },
            { value: 'max', label: 'Max' },
            { value: 'additive-normalized', label: 'Additive (normalized)' },
            { value: 'additive-tonemapped', label: 'Additive (tonemapped)' },
            { value: 'additive-normalized-bright', label: 'Additive (normalized bright)' },
          ];
          for (const info of modes) {
            const opt = document.createElement('option');
            opt.value = info.value;
            opt.textContent = info.label;
            modeSelect.appendChild(opt);
          }

          const syncEdgeMode = () => {
            const current = this.helios?.edgeTransparencyMode?.();
            const value = typeof current === 'string' ? current : 'alpha';
            modeSelect.value = modes.some((m) => m.value === value) ? value : 'alpha';
          };
          syncEdgeMode();

          modeSelect.addEventListener('change', () => {
            this.helios?.edgeTransparencyMode?.(modeSelect.value);
          });

          wrapper.appendChild(createAlignedRow({
            title: 'Blend Mode',
            hint: 'Controls how overlapping edges are composited ("Smooth" reduces overlap artifacts).',
            controls: modeSelect,
          }).row);

          return wrapper;
        })(),
      });

      stack.add({
        id: 'labels',
        title: 'Labels',
        content: (() => {
          const wrapper = document.createElement('div');
          const enableRow = createToggleRow('labelsEnabled');
          if (enableRow) wrapper.appendChild(enableRow);

          wrapper.appendChild(createRows([
            'labelsMaxVisible',
            'labelsFontSizeScale',
            'labelsMinScreenRadius',
            'labelsOutlineWidth',
          ]));

          const labelSourceControl = createLabelSourceSelect();
          wrapper.appendChild(createAlignedRow({
            title: 'Source',
            hint: 'Node attribute used for labels. Empty = auto fallback (Label, Name, id).',
            controls: labelSourceControl.element,
          }).row);
          this._controlCleanups.add(() => labelSourceControl.destroy());

          wrapper.appendChild(createAlignedRow({
            title: 'Font Family',
            hint: 'CSS font-family used by SVG labels.',
            controls: createLabelFontFamilyInput(),
          }).row);

          wrapper.appendChild(createAlignedRow({
            title: 'Fill',
            hint: 'Label text color + alpha.',
            controls: createColorWithAlphaControls({
              ariaLabel: 'Label fill color',
              getValue: () => this.helios?.labelFill?.(),
              setValue: (value) => this.helios?.labelFill?.(value),
            }),
          }).row);

          wrapper.appendChild(createAlignedRow({
            title: 'Outline',
            hint: 'Label outline/halo color + alpha.',
            controls: createColorWithAlphaControls({
              ariaLabel: 'Label outline color',
              getValue: () => this.helios?.labelOutlineColor?.(),
              setValue: (value) => this.helios?.labelOutlineColor?.(value),
            }),
          }).row);
          return wrapper;
        })(),
      });

      stack.add({
        id: 'node-appearance',
        title: 'Nodes',
        content: createRows(['nodeSizeScale', 'nodeOpacityScale', 'nodeOutlineWidthScale']),
      });

      stack.add({
        id: 'edge-appearance',
        title: 'Edges',
        content: createRows(['edgeWidthScale', 'edgeOpacityScale']),
      });

      stack.add({
        id: 'advanced-appearance',
        title: 'Advanced',
        collapsed: true,
        content: (() => {
          const advanced = document.createElement('div');
          advanced.appendChild(createRows([
            'nodeSizeBase',
            'semanticZoomExponent',
            'nodeOpacityBase',
            'nodeOutlineWidthBase',
            'edgeWidthBase',
            'edgeOpacityBase',
            'edgeEndpointTrim',
          ]));
          const nodeBlendRow = createToggleRow('nodeBlendWithEdges');
          if (nodeBlendRow) advanced.appendChild(nodeBlendRow);
          const edgeDepthRow = createToggleRow('edgeDepthWrite');
          if (edgeDepthRow) advanced.appendChild(edgeDepthRow);
          return advanced;
        })(),
      });

      content.appendChild(stack.element);
      this._controlCleanups.add(() => stack.destroy());
    } else {
      content.appendChild(themeRow);
    }

    return this.createPanel({
      id: options.id ?? 'helios-ui-demo',
      title: options.title ?? 'Controls',
      position: options.position ?? { x: 16, y: 16 },
      dock: options.dock ?? 'top-left',
      content,
    });
  }

  createMetricsPanel(options = {}) {
    const content = document.createElement('div');
    content.style.setProperty('--helios-ui-label-col', '130px');

    const tooltipCleanups = new Set();

    const attachTooltip = (anchorEl, hint) => {
      if (!anchorEl || !hint) return () => {};

      let tooltip = null;
      let tooltipRoot = null;
      let hideTooltipTimer = null;

      const resolveTooltipRoot = () => anchorEl.closest?.('.helios-ui') ?? anchorEl.ownerDocument?.body ?? document.body;

      const setTooltipHidden = (hidden) => {
        if (!tooltip) return;
        tooltip.dataset.open = hidden ? 'false' : 'true';
        tooltip.hidden = hidden;
      };

      const placeTooltip = () => {
        if (!tooltip) return;
        const anchor = tooltip.dataset.anchorId ? anchorEl.ownerDocument?.getElementById?.(tooltip.dataset.anchorId) : null;
        const el = anchor ?? null;
        if (!el) return;

        const margin = 8;
        const rect = el.getBoundingClientRect();
        const { innerWidth: vw, innerHeight: vh } = window;

        tooltip.style.left = '0px';
        tooltip.style.top = '0px';
        tooltip.style.transform = 'translate(-9999px, -9999px)';
        const tipRect = tooltip.getBoundingClientRect();

        const preferredLeft = rect.left + rect.width / 2 - tipRect.width / 2;
        const left = Math.max(margin, Math.min(vw - margin - tipRect.width, preferredLeft));

        const preferredTop = rect.top - 8 - tipRect.height;
        const fallbackTop = rect.bottom + 8;
        const top = preferredTop >= margin ? preferredTop : Math.min(vh - margin - tipRect.height, fallbackTop);

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.transform = 'translate(0, 0)';
      };

      const scheduleHideTooltip = () => {
        if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
        hideTooltipTimer = window.setTimeout(() => setTooltipHidden(true), 120);
      };

      const showTooltip = () => {
        if (!tooltip) return;
        if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
        if (!tooltipRoot) {
          tooltipRoot = resolveTooltipRoot();
          tooltipRoot.appendChild(tooltip);
        }
        setTooltipHidden(false);
        placeTooltip();
      };

      tooltip = document.createElement('div');
      tooltip.className = 'helios-ui-tooltip';
      tooltip.hidden = true;
      tooltip.dataset.open = 'false';
      tooltip.textContent = hint;
      tooltip.setAttribute('role', 'tooltip');

      const tooltipId = `helios-ui-tooltip-${Math.random().toString(16).slice(2)}`;
      tooltip.dataset.anchorId = tooltipId;
      anchorEl.id = tooltipId;
      anchorEl.tabIndex = 0;

      const onPointerEnter = () => showTooltip();
      const onPointerLeave = () => scheduleHideTooltip();
      const onFocus = () => showTooltip();
      const onBlur = () => setTooltipHidden(true);
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          setTooltipHidden(true);
          anchorEl.blur();
        }
      };
      const onScrollOrResize = () => {
        if (!tooltip || tooltip.hidden) return;
        placeTooltip();
      };

      anchorEl.addEventListener('pointerenter', onPointerEnter);
      anchorEl.addEventListener('pointerleave', onPointerLeave);
      anchorEl.addEventListener('focus', onFocus);
      anchorEl.addEventListener('blur', onBlur);
      anchorEl.addEventListener('keydown', onKeyDown);
      window.addEventListener('scroll', onScrollOrResize, { capture: true });
      window.addEventListener('resize', onScrollOrResize);

      const cleanup = () => {
        if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
        anchorEl.removeEventListener('pointerenter', onPointerEnter);
        anchorEl.removeEventListener('pointerleave', onPointerLeave);
        anchorEl.removeEventListener('focus', onFocus);
        anchorEl.removeEventListener('blur', onBlur);
        anchorEl.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('scroll', onScrollOrResize, { capture: true });
        window.removeEventListener('resize', onScrollOrResize);
        tooltip?.remove?.();
        tooltip = null;
        tooltipRoot = null;
      };

      tooltipCleanups.add(cleanup);
      return cleanup;
    };

    const createAlignedRow = ({ title, hint, controls }) => {
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
      label.appendChild(titleRowEl);
      if (hint) attachTooltip(titleEl, hint);

      row.appendChild(label);
      const controlWrap = document.createElement('div');
      controlWrap.className = 'helios-ui-row__controls';
      if (controls) controlWrap.appendChild(controls);
      row.appendChild(controlWrap);
      return { row, titleEl, controlWrap };
    };

    const updateSliderVisual = (slider) => {
      if (!slider) return;
      const min = Number(slider.min);
      const max = Number(slider.max);
      const value = Number(slider.value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || min === max) return;
      const pct = ((value - min) / (max - min)) * 100;
      slider.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct))));
    };

    const formatCompactNumber = (value, sigDigits = 6) => {
      const v = Number(value);
      if (!Number.isFinite(v)) return '';
      if (v === 0) return '0';
      return String(Number(v.toPrecision(sigDigits)));
    };

    const createLinearSliderRow = ({ title, hint, valueInput, range, step = 1, inputMin = null, inputMax = null, clampInput = true }) => {
      const { row, controlWrap } = createAlignedRow({ title, hint, controls: null });
      row.classList.add('helios-ui-row--slider');

      const controls = document.createElement('div');
      controls.className = 'helios-ui-slider-controls';

      const slider = document.createElement('input');
      slider.className = 'helios-ui-slider';
      slider.type = 'range';
      slider.min = String(range.min);
      slider.max = String(range.max);
      slider.step = String(step);

      valueInput.classList.add('helios-ui-number');
      valueInput.type = 'number';
      valueInput.step = String(step);
      valueInput.min = String(inputMin ?? range.min);
      if (inputMax != null) valueInput.max = String(inputMax);
      else valueInput.removeAttribute('max');

      const write = (next) => {
        const n = Number(next);
        if (!Number.isFinite(n)) return;
        const nextValue = clampInput ? Math.max(range.min, Math.min(range.max, n)) : n;
        const sliderValue = Math.max(range.min, Math.min(range.max, n));
        slider.value = String(sliderValue);
        valueInput.value = String(nextValue);
        updateSliderVisual(slider);
      };

      write(valueInput.value || range.min);

      slider.addEventListener('input', () => write(slider.value));
      valueInput.addEventListener('change', () => write(valueInput.value));
      valueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          write(valueInput.value);
          valueInput.blur();
        }
      });

      controls.appendChild(slider);
      controls.appendChild(valueInput);
      controlWrap.appendChild(controls);
      return { row, slider, write };
    };

    const createLogSliderRow = ({ title, hint, valueInput, minExp = -4, maxExp = 4, stepExp = 0.01 }) => {
      const { row, controlWrap } = createAlignedRow({ title, hint, controls: null });
      row.classList.add('helios-ui-row--slider');

      const controls = document.createElement('div');
      controls.className = 'helios-ui-slider-controls';

      const slider = document.createElement('input');
      slider.className = 'helios-ui-slider';
      slider.type = 'range';
      slider.min = String(minExp);
      slider.max = String(maxExp);
      slider.step = String(stepExp);

      const minValue = 10 ** minExp;
      const maxValue = 10 ** maxExp;

      valueInput.classList.add('helios-ui-number');
      valueInput.type = 'number';
      valueInput.step = 'any';
      valueInput.min = '0';

      const write = (next) => {
        const n = Number(next);
        if (!Number.isFinite(n) || n <= 0) return;
        // Keep the numeric value unbounded (>0); only clamp the slider's position
        // to the suggested exponent window.
        const exp = Math.log10(n);
        slider.value = String(Math.max(minExp, Math.min(maxExp, exp)));
        valueInput.value = formatCompactNumber(n, 6);
        updateSliderVisual(slider);
      };

      const writeFromSlider = () => {
        const exp = Number(slider.value);
        if (!Number.isFinite(exp)) return;
        const value = 10 ** exp;
        valueInput.value = formatCompactNumber(value, 6);
        updateSliderVisual(slider);
      };

      // Initialize from the provided numeric value.
      write(valueInput.value || 1);

      slider.addEventListener('input', () => writeFromSlider());
      valueInput.addEventListener('change', () => write(valueInput.value));
      valueInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          write(valueInput.value);
          valueInput.blur();
        }
      });

      controls.appendChild(slider);
      controls.appendChild(valueInput);
      controlWrap.appendChild(controls);
      return { row, slider, write };
    };

    const net = () => this.helios?.network ?? null;
    const defer = (ms = 0) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));

    const formatNumber = (value, digits = 3) => {
      if (!Number.isFinite(value)) return '—';
      return Number(value).toFixed(digits);
    };

    const makeValue = (text = '—') => {
      const el = document.createElement('div');
      el.className = 'helios-ui-value';
      el.textContent = text;
      return el;
    };

    const createStat = (labelText, valueEl) => {
      const stat = document.createElement('div');
      stat.className = 'helios-ui-stat';
      const label = document.createElement('div');
      label.className = 'helios-ui-stat__label';
      label.textContent = labelText;
      const value = valueEl ?? document.createElement('div');
      if (!valueEl) {
        value.className = 'helios-ui-stat__value';
        value.textContent = '—';
      } else {
        value.classList.add('helios-ui-stat__value');
      }
      stat.appendChild(label);
      stat.appendChild(value);
      return { stat, label, value };
    };

    const setDisabled = (el, disabled) => {
      if (!el) return;
      el.disabled = Boolean(disabled);
    };

    const normalizeDimensionMethod = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized === 'forward' || normalized === 'fw') return 'forward';
      if (normalized === 'backward' || normalized === 'bk') return 'backward';
      if (normalized === 'central' || normalized === 'centered' || normalized === 'ce') return 'central';
      return 'leastsquares';
    };

    const maxOrderForDimensionMethod = (method) => {
      const normalized = normalizeDimensionMethod(method);
      if (normalized === 'forward' || normalized === 'backward') return 6;
      if (normalized === 'central') return 4;
      return 32;
    };

    const maxFiniteArrayValue = (values) => {
      if (!values || typeof values.length !== 'number') return NaN;
      let max = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < values.length; i += 1) {
        const v = Number(values[i]);
        if (Number.isFinite(v) && v > max) {
          max = v;
        }
      }
      return Number.isFinite(max) ? max : NaN;
    };

    const summarizeFiniteValues = (values) => {
      if (!values || typeof values.length !== 'number') {
        return {
          count: 0,
          min: NaN,
          max: NaN,
          mean: NaN,
        };
      }
      let count = 0;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let sum = 0;
      for (let i = 0; i < values.length; i += 1) {
        const v = Number(values[i]);
        if (!Number.isFinite(v)) continue;
        count += 1;
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
      return {
        count,
        min: count > 0 ? min : NaN,
        max: count > 0 ? max : NaN,
        mean: count > 0 ? sum / count : NaN,
      };
    };

    const writeNodeMetricValues = (network, attributeName, result) => {
      if (!network || !attributeName || typeof attributeName !== 'string') return false;
      const trimmed = attributeName.trim();
      if (!trimmed) return false;

      let buffer = null;
      try {
        buffer = network.getNodeAttributeBuffer(trimmed);
      } catch (_) {
        if (typeof network.defineNodeAttribute !== 'function') return false;
        network.defineNodeAttribute(trimmed, AttributeType.Float, 1);
        buffer = network.getNodeAttributeBuffer(trimmed);
      }
      const view = buffer?.view ?? null;
      if (!view || typeof view.length !== 'number') return false;

      const full = result?.valuesByNode;
      if (full && typeof full.length === 'number') {
        const n = Math.min(view.length, full.length);
        for (let i = 0; i < n; i += 1) {
          const v = Number(full[i]);
          view[i] = Number.isFinite(v) ? v : 0;
        }
      } else {
        const nodeIndices = result?.nodeIndices;
        const values = result?.values;
        if (!nodeIndices || !values || typeof nodeIndices.length !== 'number' || typeof values.length !== 'number') {
          return false;
        }
        const n = Math.min(nodeIndices.length, values.length);
        for (let i = 0; i < n; i += 1) {
          const node = Number(nodeIndices[i]);
          if (!Number.isInteger(node) || node < 0 || node >= view.length) continue;
          const v = Number(values[i]);
          view[node] = Number.isFinite(v) ? v : 0;
        }
      }

      if (typeof buffer.bumpVersion === 'function') {
        buffer.bumpVersion();
      }
      return true;
    };

    const styleStatusHint = (el) => {
      if (!el) return;
      el.className = 'helios-ui-label__hint';
      el.style.marginTop = '0px';
      el.style.fontSize = '10px';
      el.style.lineHeight = '1.2';
      el.style.whiteSpace = 'normal';
      el.style.overflow = 'visible';
      el.style.textOverflow = 'clip';
      el.style.maxWidth = '100%';
      el.style.minWidth = '0';
    };

    const reportMeasurementError = (metricName, error, context = null) => {
      const err = error instanceof Error ? error : new Error(String(error));
      const message = err?.message ?? String(err);
      const detail = err?.stack ? `${message}\n${err.stack}` : message;
      if (typeof globalThis !== 'undefined' && typeof globalThis.reportError === 'function') {
        try {
          globalThis.reportError(err);
        } catch {}
      }
      // eslint-disable-next-line no-console
      console.error(`[HeliosUI] ${metricName} failed`, { error: err, context });
      return detail;
    };

    const normalizeNeighborDirection = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized === 'out' || normalized === 'outgoing') return 'out';
      if (normalized === 'in' || normalized === 'incoming') return 'in';
      return 'both';
    };

    const normalizeStrengthMeasure = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized === 'average' || normalized === 'avg' || normalized === 'mean') return 'average';
      if (normalized === 'maximum' || normalized === 'max') return 'maximum';
      if (normalized === 'minimum' || normalized === 'min') return 'minimum';
      return 'sum';
    };

    const normalizeClusteringVariant = (value) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (normalized === 'onnela') return 'onnela';
      if (normalized === 'newman' || normalized === 'barrat' || normalized === 'weighted') return 'newman';
      return 'unweighted';
    };

    const createDirectionSelect = (testid, initialValue = 'both') => {
      const select = document.createElement('select');
      select.className = 'helios-ui-select';
      if (testid) select.dataset.testid = testid;
      for (const entry of [
        { value: 'both', label: 'Both' },
        { value: 'in', label: 'In' },
        { value: 'out', label: 'Out' },
      ]) {
        const opt = document.createElement('option');
        opt.value = entry.value;
        opt.textContent = entry.label;
        select.appendChild(opt);
      }
      select.value = normalizeNeighborDirection(initialValue);
      return select;
    };

    const edgeWeightSelects = [];
    const createEdgeWeightSelect = (testid, initialValue = '') => {
      const select = document.createElement('select');
      select.className = 'helios-ui-select';
      if (testid) select.dataset.testid = testid;
      select.dataset.initialValue = initialValue ? String(initialValue) : '';
      edgeWeightSelects.push(select);
      return select;
    };

    // --- Degree --------------------------------------------------------------
    const degree = document.createElement('div');

    const degreeDirectionSelect = createDirectionSelect('metrics-degree-direction', options?.degree?.direction ?? 'both');
    const degreeOutAttrInput = document.createElement('input');
    degreeOutAttrInput.type = 'text';
    degreeOutAttrInput.className = 'helios-ui-text';
    degreeOutAttrInput.placeholder = 'degree';
    degreeOutAttrInput.value = String(options?.degree?.outNodeAttribute ?? 'degree');
    degreeOutAttrInput.dataset.testid = 'metrics-degree-outAttr';

    const degreeActionWrap = document.createElement('div');
    degreeActionWrap.style.display = 'inline-flex';
    degreeActionWrap.style.alignItems = 'center';
    degreeActionWrap.style.gap = '6px';

    const degreeCalcButton = document.createElement('button');
    degreeCalcButton.type = 'button';
    degreeCalcButton.className = 'helios-ui-button';
    degreeCalcButton.textContent = 'Calculate';
    degreeCalcButton.dataset.testid = 'metrics-degree-calc';
    degreeActionWrap.appendChild(degreeCalcButton);

    const degreeStatusEl = document.createElement('div');
    degreeStatusEl.dataset.testid = 'metrics-degree-status';
    degreeStatusEl.textContent = '';
    styleStatusHint(degreeStatusEl);

    degree.appendChild(createAlignedRow({
      title: 'Degree',
      hint: 'Node degree (unweighted)',
      controls: degreeActionWrap,
    }).row);
    degree.appendChild(createAlignedRow({
      title: 'Direction',
      hint: 'For directed networks: In, Out, or Both',
      controls: degreeDirectionSelect,
    }).row);
    degree.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: degreeStatusEl,
    }).row);

    const degreeStats = document.createElement('div');
    degreeStats.className = 'helios-ui-stats';
    const degreeMaxValue = makeValue('—');
    degreeMaxValue.dataset.testid = 'metrics-degree-max';
    const degreeMeanValue = makeValue('—');
    degreeMeanValue.dataset.testid = 'metrics-degree-mean';
    const degreeElapsedValue = makeValue('—');
    degreeElapsedValue.dataset.testid = 'metrics-degree-elapsed';
    degreeStats.appendChild(createStat('Max', degreeMaxValue).stat);
    degreeStats.appendChild(createStat('Mean', degreeMeanValue).stat);
    degreeStats.appendChild(createStat('Elapsed', degreeElapsedValue).stat);
    degreeStats.style.marginTop = '2px';
    degreeStats.style.marginBottom = '8px';
    degree.appendChild(degreeStats);

    const degreeAdvanced = document.createElement('div');
    degreeAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float node degree values',
      controls: degreeOutAttrInput,
    }).row);
    const degreeInnerStack = new PanelStack();
    degreeInnerStack.add({ id: 'metrics-degree-advanced', title: 'Advanced', collapsed: true, content: degreeAdvanced });
    degreeInnerStack.element.style.marginTop = '6px';

    // --- Strength ------------------------------------------------------------
    const strength = document.createElement('div');

    const strengthDirectionSelect = createDirectionSelect('metrics-strength-direction', options?.strength?.direction ?? 'both');
    const strengthMeasureSelect = document.createElement('select');
    strengthMeasureSelect.className = 'helios-ui-select';
    strengthMeasureSelect.dataset.testid = 'metrics-strength-measure';
    for (const entry of [
      { value: 'sum', label: 'Sum' },
      { value: 'average', label: 'Average' },
      { value: 'maximum', label: 'Maximum' },
      { value: 'minimum', label: 'Minimum' },
    ]) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      strengthMeasureSelect.appendChild(opt);
    }
    strengthMeasureSelect.value = normalizeStrengthMeasure(options?.strength?.measure ?? 'sum');

    const strengthWeightSelect = createEdgeWeightSelect('metrics-strength-weight', options?.strength?.edgeWeightAttribute ?? '');
    const strengthOutAttrInput = document.createElement('input');
    strengthOutAttrInput.type = 'text';
    strengthOutAttrInput.className = 'helios-ui-text';
    strengthOutAttrInput.placeholder = 'strength';
    strengthOutAttrInput.value = String(options?.strength?.outNodeAttribute ?? 'strength');
    strengthOutAttrInput.dataset.testid = 'metrics-strength-outAttr';

    const strengthActionWrap = document.createElement('div');
    strengthActionWrap.style.display = 'inline-flex';
    strengthActionWrap.style.alignItems = 'center';
    strengthActionWrap.style.gap = '6px';

    const strengthCalcButton = document.createElement('button');
    strengthCalcButton.type = 'button';
    strengthCalcButton.className = 'helios-ui-button';
    strengthCalcButton.textContent = 'Calculate';
    strengthCalcButton.dataset.testid = 'metrics-strength-calc';
    strengthActionWrap.appendChild(strengthCalcButton);

    const strengthStatusEl = document.createElement('div');
    strengthStatusEl.dataset.testid = 'metrics-strength-status';
    strengthStatusEl.textContent = '';
    styleStatusHint(strengthStatusEl);

    strength.appendChild(createAlignedRow({
      title: 'Strength',
      hint: 'Weighted node degree summary',
      controls: strengthActionWrap,
    }).row);
    strength.appendChild(createAlignedRow({
      title: 'Direction',
      hint: 'For directed networks: In, Out, or Both',
      controls: strengthDirectionSelect,
    }).row);
    strength.appendChild(createAlignedRow({
      title: 'Measure',
      hint: 'Aggregation over incident edge weights',
      controls: strengthMeasureSelect,
    }).row);
    strength.appendChild(createAlignedRow({
      title: 'Edge Weight',
      hint: 'Optional edge weight attribute',
      controls: strengthWeightSelect,
    }).row);
    strength.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: strengthStatusEl,
    }).row);

    const strengthStats = document.createElement('div');
    strengthStats.className = 'helios-ui-stats';
    const strengthMaxValue = makeValue('—');
    strengthMaxValue.dataset.testid = 'metrics-strength-max';
    const strengthMeanValue = makeValue('—');
    strengthMeanValue.dataset.testid = 'metrics-strength-mean';
    const strengthElapsedValue = makeValue('—');
    strengthElapsedValue.dataset.testid = 'metrics-strength-elapsed';
    strengthStats.appendChild(createStat('Max', strengthMaxValue).stat);
    strengthStats.appendChild(createStat('Mean', strengthMeanValue).stat);
    strengthStats.appendChild(createStat('Elapsed', strengthElapsedValue).stat);
    strengthStats.style.marginTop = '2px';
    strengthStats.style.marginBottom = '8px';
    strength.appendChild(strengthStats);

    const strengthAdvanced = document.createElement('div');
    strengthAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float node strength values',
      controls: strengthOutAttrInput,
    }).row);
    const strengthInnerStack = new PanelStack();
    strengthInnerStack.add({ id: 'metrics-strength-advanced', title: 'Advanced', collapsed: true, content: strengthAdvanced });
    strengthInnerStack.element.style.marginTop = '6px';

    // --- Local Clustering ----------------------------------------------------
    const clustering = document.createElement('div');

    const clusteringDirectionSelect = createDirectionSelect('metrics-clustering-direction', options?.clustering?.direction ?? 'both');
    const clusteringVariantSelect = document.createElement('select');
    clusteringVariantSelect.className = 'helios-ui-select';
    clusteringVariantSelect.dataset.testid = 'metrics-clustering-variant';
    for (const entry of [
      { value: 'unweighted', label: 'Unweighted' },
      { value: 'onnela', label: 'Onnela (Weighted)' },
      { value: 'newman', label: 'Newman (Weighted)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      clusteringVariantSelect.appendChild(opt);
    }
    clusteringVariantSelect.value = normalizeClusteringVariant(options?.clustering?.variant ?? 'unweighted');

    const clusteringWeightSelect = createEdgeWeightSelect('metrics-clustering-weight', options?.clustering?.edgeWeightAttribute ?? '');
    const clusteringOutAttrInput = document.createElement('input');
    clusteringOutAttrInput.type = 'text';
    clusteringOutAttrInput.className = 'helios-ui-text';
    clusteringOutAttrInput.placeholder = 'clustering';
    clusteringOutAttrInput.value = String(options?.clustering?.outNodeAttribute ?? 'clustering');
    clusteringOutAttrInput.dataset.testid = 'metrics-clustering-outAttr';

    const clusteringActionWrap = document.createElement('div');
    clusteringActionWrap.style.display = 'inline-flex';
    clusteringActionWrap.style.alignItems = 'center';
    clusteringActionWrap.style.gap = '6px';

    const clusteringCalcButton = document.createElement('button');
    clusteringCalcButton.type = 'button';
    clusteringCalcButton.className = 'helios-ui-button';
    clusteringCalcButton.textContent = 'Calculate';
    clusteringCalcButton.dataset.testid = 'metrics-clustering-calc';
    clusteringActionWrap.appendChild(clusteringCalcButton);

    const clusteringStatusEl = document.createElement('div');
    clusteringStatusEl.dataset.testid = 'metrics-clustering-status';
    clusteringStatusEl.textContent = '';
    styleStatusHint(clusteringStatusEl);

    clustering.appendChild(createAlignedRow({
      title: 'Local Clustering',
      hint: 'Local clustering coefficient',
      controls: clusteringActionWrap,
    }).row);
    clustering.appendChild(createAlignedRow({
      title: 'Variant',
      hint: 'Unweighted, Onnela, or Newman formulation',
      controls: clusteringVariantSelect,
    }).row);
    clustering.appendChild(createAlignedRow({
      title: 'Direction',
      hint: 'For directed networks: In, Out, or Both',
      controls: clusteringDirectionSelect,
    }).row);
    clustering.appendChild(createAlignedRow({
      title: 'Edge Weight',
      hint: 'Required for weighted variants',
      controls: clusteringWeightSelect,
    }).row);
    clustering.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: clusteringStatusEl,
    }).row);

    const clusteringStats = document.createElement('div');
    clusteringStats.className = 'helios-ui-stats';
    const clusteringMaxValue = makeValue('—');
    clusteringMaxValue.dataset.testid = 'metrics-clustering-max';
    const clusteringMeanValue = makeValue('—');
    clusteringMeanValue.dataset.testid = 'metrics-clustering-mean';
    const clusteringElapsedValue = makeValue('—');
    clusteringElapsedValue.dataset.testid = 'metrics-clustering-elapsed';
    clusteringStats.appendChild(createStat('Max', clusteringMaxValue).stat);
    clusteringStats.appendChild(createStat('Mean', clusteringMeanValue).stat);
    clusteringStats.appendChild(createStat('Elapsed', clusteringElapsedValue).stat);
    clusteringStats.style.marginTop = '2px';
    clusteringStats.style.marginBottom = '8px';
    clustering.appendChild(clusteringStats);

    const clusteringAdvanced = document.createElement('div');
    clusteringAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float local clustering coefficients',
      controls: clusteringOutAttrInput,
    }).row);
    const clusteringInnerStack = new PanelStack();
    clusteringInnerStack.add({ id: 'metrics-clustering-advanced', title: 'Advanced', collapsed: true, content: clusteringAdvanced });
    clusteringInnerStack.element.style.marginTop = '6px';

    // --- Eigenvector Centrality ---------------------------------------------
    const eigenvector = document.createElement('div');

    const eigenvectorDirectionSelect = createDirectionSelect('metrics-eigen-direction', options?.eigenvector?.direction ?? 'both');
    const eigenvectorWeightSelect = createEdgeWeightSelect('metrics-eigen-weight', options?.eigenvector?.edgeWeightAttribute ?? '');

    const eigenvectorMaxIterationsInput = document.createElement('input');
    eigenvectorMaxIterationsInput.type = 'number';
    eigenvectorMaxIterationsInput.className = 'helios-ui-number';
    eigenvectorMaxIterationsInput.value = String(options?.eigenvector?.maxIterations ?? 256);
    eigenvectorMaxIterationsInput.dataset.testid = 'metrics-eigen-maxIterations';

    const eigenvectorToleranceInput = document.createElement('input');
    eigenvectorToleranceInput.type = 'number';
    eigenvectorToleranceInput.className = 'helios-ui-number';
    eigenvectorToleranceInput.value = String(options?.eigenvector?.tolerance ?? 1e-6);
    eigenvectorToleranceInput.dataset.testid = 'metrics-eigen-tolerance';

    const eigenvectorOutAttrInput = document.createElement('input');
    eigenvectorOutAttrInput.type = 'text';
    eigenvectorOutAttrInput.className = 'helios-ui-text';
    eigenvectorOutAttrInput.placeholder = 'eigenvector_centrality';
    eigenvectorOutAttrInput.value = String(options?.eigenvector?.outNodeAttribute ?? 'eigenvector_centrality');
    eigenvectorOutAttrInput.dataset.testid = 'metrics-eigen-outAttr';

    const eigenvectorActionWrap = document.createElement('div');
    eigenvectorActionWrap.style.display = 'inline-flex';
    eigenvectorActionWrap.style.alignItems = 'center';
    eigenvectorActionWrap.style.gap = '6px';

    const eigenvectorCalcButton = document.createElement('button');
    eigenvectorCalcButton.type = 'button';
    eigenvectorCalcButton.className = 'helios-ui-button';
    eigenvectorCalcButton.textContent = 'Calculate';
    eigenvectorCalcButton.dataset.testid = 'metrics-eigen-calc';
    eigenvectorActionWrap.appendChild(eigenvectorCalcButton);

    const eigenvectorCancelButton = document.createElement('button');
    eigenvectorCancelButton.type = 'button';
    eigenvectorCancelButton.className = 'helios-ui-button';
    eigenvectorCancelButton.textContent = 'Cancel';
    eigenvectorCancelButton.dataset.testid = 'metrics-eigen-cancel';
    eigenvectorCancelButton.disabled = true;
    eigenvectorActionWrap.appendChild(eigenvectorCancelButton);

    const eigenvectorStatusEl = document.createElement('div');
    eigenvectorStatusEl.dataset.testid = 'metrics-eigen-status';
    eigenvectorStatusEl.textContent = '';
    styleStatusHint(eigenvectorStatusEl);

    eigenvector.appendChild(createAlignedRow({
      title: 'Eigenvector Centrality',
      hint: 'Power iteration centrality',
      controls: eigenvectorActionWrap,
    }).row);
    eigenvector.appendChild(createAlignedRow({
      title: 'Direction',
      hint: 'For directed networks: In, Out, or Both',
      controls: eigenvectorDirectionSelect,
    }).row);
    eigenvector.appendChild(createAlignedRow({
      title: 'Edge Weight',
      hint: 'Optional edge weight attribute',
      controls: eigenvectorWeightSelect,
    }).row);
    const eigenvectorMaxIterationsRow = createLinearSliderRow({
      title: 'Max Iterations',
      hint: 'Maximum power-iteration steps',
      valueInput: eigenvectorMaxIterationsInput,
      range: { min: 1, max: 2048 },
      step: 1,
    });
    eigenvector.appendChild(eigenvectorMaxIterationsRow.row);
    const eigenvectorToleranceRow = createLogSliderRow({
      title: 'Tolerance',
      hint: 'Convergence threshold • log scale',
      valueInput: eigenvectorToleranceInput,
      minExp: -12,
      maxExp: -1,
      stepExp: 0.05,
    });
    eigenvector.appendChild(eigenvectorToleranceRow.row);
    eigenvector.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: eigenvectorStatusEl,
    }).row);

    const eigenvectorProgressWrap = document.createElement('div');
    eigenvectorProgressWrap.style.display = 'grid';
    eigenvectorProgressWrap.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    eigenvectorProgressWrap.style.columnGap = '8px';
    eigenvectorProgressWrap.style.rowGap = '2px';
    eigenvectorProgressWrap.style.alignItems = 'center';
    eigenvectorProgressWrap.style.width = '100%';

    const eigenvectorProgressEl = document.createElement('progress');
    eigenvectorProgressEl.className = 'helios-ui-progress';
    eigenvectorProgressEl.max = 1;
    eigenvectorProgressEl.value = 0;
    eigenvectorProgressEl.dataset.testid = 'metrics-eigen-progress';

    const eigenvectorProgressPct = makeValue('0%');
    eigenvectorProgressPct.dataset.testid = 'metrics-eigen-progressPct';
    eigenvectorProgressWrap.appendChild(eigenvectorProgressEl);
    eigenvectorProgressWrap.appendChild(eigenvectorProgressPct);

    const { row: eigenvectorProgressRow } = createAlignedRow({
      title: 'Progress',
      hint: 'Chunked power-iteration progress',
      controls: eigenvectorProgressWrap,
    });
    eigenvector.appendChild(eigenvectorProgressRow);

    const eigenvectorStats = document.createElement('div');
    eigenvectorStats.className = 'helios-ui-stats';
    const eigenvectorMaxValue = makeValue('—');
    eigenvectorMaxValue.dataset.testid = 'metrics-eigen-max';
    const eigenvectorEigenvalueValue = makeValue('—');
    eigenvectorEigenvalueValue.dataset.testid = 'metrics-eigen-eigenvalue';
    const eigenvectorElapsedValue = makeValue('—');
    eigenvectorElapsedValue.dataset.testid = 'metrics-eigen-elapsed';
    eigenvectorStats.appendChild(createStat('Max', eigenvectorMaxValue).stat);
    eigenvectorStats.appendChild(createStat('Eigenvalue', eigenvectorEigenvalueValue).stat);
    eigenvectorStats.appendChild(createStat('Elapsed', eigenvectorElapsedValue).stat);
    eigenvectorStats.style.marginTop = '2px';
    eigenvectorStats.style.marginBottom = '8px';
    eigenvector.appendChild(eigenvectorStats);

    const eigenvectorAdvanced = document.createElement('div');
    eigenvectorAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float eigenvector-centrality values',
      controls: eigenvectorOutAttrInput,
    }).row);

    const eigenvectorChunkIterationsInput = document.createElement('input');
    eigenvectorChunkIterationsInput.type = 'number';
    eigenvectorChunkIterationsInput.className = 'helios-ui-number';
    eigenvectorChunkIterationsInput.value = String(options?.eigenvector?.chunkIterations ?? 16);
    eigenvectorChunkIterationsInput.dataset.testid = 'metrics-eigen-chunkIterations';
    const eigenvectorChunkIterationsRow = createLinearSliderRow({
      title: 'Chunk Iterations',
      hint: 'Iterations per chunk before yielding',
      valueInput: eigenvectorChunkIterationsInput,
      range: { min: 1, max: 256 },
      step: 1,
    });
    eigenvectorAdvanced.appendChild(eigenvectorChunkIterationsRow.row);

    const eigenvectorYieldMsInput = document.createElement('input');
    eigenvectorYieldMsInput.type = 'number';
    eigenvectorYieldMsInput.className = 'helios-ui-number';
    eigenvectorYieldMsInput.value = String(options?.eigenvector?.yieldMs ?? 0);
    eigenvectorYieldMsInput.dataset.testid = 'metrics-eigen-yieldMs';
    const eigenvectorYieldRow = createLinearSliderRow({
      title: 'Yield (ms)',
      hint: 'Delay between chunks to keep UI responsive',
      valueInput: eigenvectorYieldMsInput,
      range: { min: 0, max: 100 },
      step: 1,
    });
    eigenvectorAdvanced.appendChild(eigenvectorYieldRow.row);
    const eigenvectorInnerStack = new PanelStack();
    eigenvectorInnerStack.add({ id: 'metrics-eigen-advanced', title: 'Advanced', collapsed: true, content: eigenvectorAdvanced });
    eigenvectorInnerStack.element.style.marginTop = '6px';

    // --- Betweenness Centrality ---------------------------------------------
    const betweenness = document.createElement('div');

    const betweennessWeightSelect = createEdgeWeightSelect('metrics-betweenness-weight', options?.betweenness?.edgeWeightAttribute ?? '');
    const betweennessNormalizeCheckbox = document.createElement('input');
    betweennessNormalizeCheckbox.type = 'checkbox';
    betweennessNormalizeCheckbox.dataset.testid = 'metrics-betweenness-normalize';
    betweennessNormalizeCheckbox.checked = options?.betweenness?.normalize !== false;

    const betweennessOutAttrInput = document.createElement('input');
    betweennessOutAttrInput.type = 'text';
    betweennessOutAttrInput.className = 'helios-ui-text';
    betweennessOutAttrInput.placeholder = 'betweenness_centrality';
    betweennessOutAttrInput.value = String(options?.betweenness?.outNodeAttribute ?? 'betweenness_centrality');
    betweennessOutAttrInput.dataset.testid = 'metrics-betweenness-outAttr';

    const betweennessActionWrap = document.createElement('div');
    betweennessActionWrap.style.display = 'inline-flex';
    betweennessActionWrap.style.alignItems = 'center';
    betweennessActionWrap.style.gap = '6px';

    const betweennessCalcButton = document.createElement('button');
    betweennessCalcButton.type = 'button';
    betweennessCalcButton.className = 'helios-ui-button';
    betweennessCalcButton.textContent = 'Calculate';
    betweennessCalcButton.dataset.testid = 'metrics-betweenness-calc';
    betweennessActionWrap.appendChild(betweennessCalcButton);

    const betweennessCancelButton = document.createElement('button');
    betweennessCancelButton.type = 'button';
    betweennessCancelButton.className = 'helios-ui-button';
    betweennessCancelButton.textContent = 'Cancel';
    betweennessCancelButton.dataset.testid = 'metrics-betweenness-cancel';
    betweennessCancelButton.disabled = true;
    betweennessActionWrap.appendChild(betweennessCancelButton);

    const betweennessStatusEl = document.createElement('div');
    betweennessStatusEl.dataset.testid = 'metrics-betweenness-status';
    betweennessStatusEl.textContent = '';
    styleStatusHint(betweennessStatusEl);

    betweenness.appendChild(createAlignedRow({
      title: 'Betweenness Centrality',
      hint: 'Brandes shortest-path centrality',
      controls: betweennessActionWrap,
    }).row);
    betweenness.appendChild(createAlignedRow({
      title: 'Edge Weight',
      hint: 'Optional edge weight attribute',
      controls: betweennessWeightSelect,
    }).row);
    betweenness.appendChild(createAlignedRow({
      title: 'Normalize',
      hint: 'Normalize values by graph size',
      controls: betweennessNormalizeCheckbox,
    }).row);
    betweenness.appendChild(createAlignedRow({
      title: 'Status',
      hint: 'Latest run status',
      controls: betweennessStatusEl,
    }).row);

    const betweennessProgressWrap = document.createElement('div');
    betweennessProgressWrap.style.display = 'grid';
    betweennessProgressWrap.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    betweennessProgressWrap.style.columnGap = '8px';
    betweennessProgressWrap.style.rowGap = '2px';
    betweennessProgressWrap.style.alignItems = 'center';
    betweennessProgressWrap.style.width = '100%';

    const betweennessProgressEl = document.createElement('progress');
    betweennessProgressEl.className = 'helios-ui-progress';
    betweennessProgressEl.max = 1;
    betweennessProgressEl.value = 0;
    betweennessProgressEl.dataset.testid = 'metrics-betweenness-progress';

    const betweennessProgressPct = makeValue('0%');
    betweennessProgressPct.dataset.testid = 'metrics-betweenness-progressPct';
    betweennessProgressWrap.appendChild(betweennessProgressEl);
    betweennessProgressWrap.appendChild(betweennessProgressPct);

    const { row: betweennessProgressRow } = createAlignedRow({
      title: 'Progress',
      hint: 'Chunked source-node progress',
      controls: betweennessProgressWrap,
    });
    betweenness.appendChild(betweennessProgressRow);

    const betweennessStats = document.createElement('div');
    betweennessStats.className = 'helios-ui-stats';
    const betweennessMaxValue = makeValue('—');
    betweennessMaxValue.dataset.testid = 'metrics-betweenness-max';
    const betweennessSourceCountValue = makeValue('—');
    betweennessSourceCountValue.dataset.testid = 'metrics-betweenness-sourceCount';
    const betweennessElapsedValue = makeValue('—');
    betweennessElapsedValue.dataset.testid = 'metrics-betweenness-elapsed';
    betweennessStats.appendChild(createStat('Max', betweennessMaxValue).stat);
    betweennessStats.appendChild(createStat('Sources', betweennessSourceCountValue).stat);
    betweennessStats.appendChild(createStat('Elapsed', betweennessElapsedValue).stat);
    betweennessStats.style.marginTop = '2px';
    betweennessStats.style.marginBottom = '8px';
    betweenness.appendChild(betweennessStats);

    const betweennessAdvanced = document.createElement('div');
    betweennessAdvanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes Float betweenness-centrality values',
      controls: betweennessOutAttrInput,
    }).row);

    const betweennessSourceChunkInput = document.createElement('input');
    betweennessSourceChunkInput.type = 'number';
    betweennessSourceChunkInput.className = 'helios-ui-number';
    betweennessSourceChunkInput.value = String(options?.betweenness?.sourceChunkSize ?? 64);
    betweennessSourceChunkInput.dataset.testid = 'metrics-betweenness-sourceChunk';
    const betweennessSourceChunkRow = createLinearSliderRow({
      title: 'Source Chunk',
      hint: 'Number of source nodes processed per chunk',
      valueInput: betweennessSourceChunkInput,
      range: { min: 1, max: 512 },
      step: 1,
    });
    betweennessAdvanced.appendChild(betweennessSourceChunkRow.row);

    const betweennessYieldMsInput = document.createElement('input');
    betweennessYieldMsInput.type = 'number';
    betweennessYieldMsInput.className = 'helios-ui-number';
    betweennessYieldMsInput.value = String(options?.betweenness?.yieldMs ?? 0);
    betweennessYieldMsInput.dataset.testid = 'metrics-betweenness-yieldMs';
    const betweennessYieldRow = createLinearSliderRow({
      title: 'Yield (ms)',
      hint: 'Delay between source chunks',
      valueInput: betweennessYieldMsInput,
      range: { min: 0, max: 100 },
      step: 1,
    });
    betweennessAdvanced.appendChild(betweennessYieldRow.row);
    const betweennessInnerStack = new PanelStack();
    betweennessInnerStack.add({ id: 'metrics-betweenness-advanced', title: 'Advanced', collapsed: true, content: betweennessAdvanced });
    betweennessInnerStack.element.style.marginTop = '6px';

    // --- Leiden --------------------------------------------------------------
    const leiden = document.createElement('div');

    const weightSelect = document.createElement('select');
    weightSelect.className = 'helios-ui-select';
    weightSelect.dataset.testid = 'metrics-leiden-weight';
    weightSelect.dataset.initialValue = String(options?.leiden?.edgeWeightAttribute ?? '');
    edgeWeightSelects.push(weightSelect);

    const resolutionInput = document.createElement('input');
    resolutionInput.type = 'number';
    resolutionInput.className = 'helios-ui-number';
    resolutionInput.value = String(options?.leiden?.resolution ?? 1);
    resolutionInput.dataset.testid = 'metrics-leiden-resolution';

    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.className = 'helios-ui-number';
    seedInput.value = String(options?.leiden?.seed ?? 1);
    seedInput.dataset.testid = 'metrics-leiden-seed';

    const maxLevelsInput = document.createElement('input');
    maxLevelsInput.type = 'number';
    maxLevelsInput.className = 'helios-ui-number';
    maxLevelsInput.value = String(options?.leiden?.maxLevels ?? 32);
    maxLevelsInput.dataset.testid = 'metrics-leiden-maxLevels';

    const maxPassesInput = document.createElement('input');
    maxPassesInput.type = 'number';
    maxPassesInput.className = 'helios-ui-number';
    maxPassesInput.value = String(options?.leiden?.passes ?? options?.leiden?.maxPasses ?? 8);
    maxPassesInput.dataset.testid = 'metrics-leiden-maxPasses';

    const outAttributeInput = document.createElement('input');
    outAttributeInput.type = 'text';
    outAttributeInput.className = 'helios-ui-text';
    outAttributeInput.placeholder = 'community';
    outAttributeInput.value = String(options?.leiden?.outNodeCommunityAttribute ?? 'community');
    outAttributeInput.dataset.testid = 'metrics-leiden-outAttr';

    const actionWrap = document.createElement('div');
    actionWrap.style.display = 'inline-flex';
    actionWrap.style.alignItems = 'center';
    actionWrap.style.gap = '6px';

    const calcButton = document.createElement('button');
    calcButton.type = 'button';
    calcButton.className = 'helios-ui-button';
    calcButton.textContent = 'Calculate';
    calcButton.dataset.testid = 'metrics-calc';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'helios-ui-button';
    cancelButton.textContent = 'Cancel';
    cancelButton.dataset.testid = 'metrics-cancel';
    cancelButton.disabled = true;

    actionWrap.appendChild(calcButton);
    actionWrap.appendChild(cancelButton);

    const statusEl = document.createElement('div');
    statusEl.className = 'helios-ui-label__hint';
    statusEl.dataset.testid = 'metrics-status';
    statusEl.textContent = '';

    const { row: actionsRow } = createAlignedRow({
      title: 'Communities (Leiden)',
      hint: 'Run community detection (worker)',
      controls: actionWrap,
    });
    leiden.appendChild(actionsRow);

    const { row: weightRow } = createAlignedRow({
      title: 'Edge Weight',
      hint: 'Optional edge weight attribute',
      controls: weightSelect,
    });
    leiden.appendChild(weightRow);

    const resolutionRow = createLogSliderRow({
      title: 'Resolution',
      hint: 'Gamma (higher → more communities) • log scale',
      valueInput: resolutionInput,
      minExp: -4,
      maxExp: 4,
      stepExp: 0.02,
    });
    leiden.appendChild(resolutionRow.row);

    const leidenStats = document.createElement('div');
    leidenStats.className = 'helios-ui-stats';
    const modularityValue = makeValue('—');
    modularityValue.dataset.testid = 'metrics-modularity';
    const communityValue = makeValue('—');
    communityValue.dataset.testid = 'metrics-communityCount';
    const elapsedValue = makeValue('—');
    elapsedValue.dataset.testid = 'metrics-elapsed';

    leidenStats.appendChild(createStat('Modularity', modularityValue).stat);
    leidenStats.appendChild(createStat('Communities', communityValue).stat);
    leidenStats.appendChild(createStat('Elapsed', elapsedValue).stat);

    leidenStats.style.marginTop = '2px';

    const progressWrap = document.createElement('div');
    progressWrap.style.display = 'grid';
    progressWrap.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    progressWrap.style.columnGap = '8px';
    progressWrap.style.rowGap = '2px';
    progressWrap.style.alignItems = 'center';
    progressWrap.style.width = '100%';

    const progressEl = document.createElement('progress');
    progressEl.className = 'helios-ui-progress';
    progressEl.max = 1;
    progressEl.value = 0;
    progressEl.dataset.testid = 'metrics-progress';

    const progressPct = makeValue('0%');
    progressPct.dataset.testid = 'metrics-progressPct';
    progressWrap.appendChild(progressEl);
    progressWrap.appendChild(progressPct);

    // Status text lives directly under the progress bar.
    statusEl.style.gridColumn = '1 / -1';
    statusEl.style.marginTop = '0px';
    statusEl.style.fontSize = '10px';
    statusEl.style.lineHeight = '1.1';
    statusEl.style.whiteSpace = 'nowrap';
    statusEl.style.overflow = 'hidden';
    statusEl.style.textOverflow = 'ellipsis';
    statusEl.style.maxWidth = '100%';
    statusEl.style.minWidth = '0';
    progressWrap.appendChild(statusEl);

    const { row: progressRow } = createAlignedRow({
      title: 'Progress',
      hint: 'Worker progress for the current run',
      controls: progressWrap,
    });
    leiden.appendChild(progressRow);

    // Results shown without an extra title row.
    leiden.appendChild(leidenStats);
    leidenStats.style.marginBottom = '8px';

    // Advanced options collapsed inside Leiden.
    const advanced = document.createElement('div');

    const seedRow = createLinearSliderRow({
      title: 'Seed',
      hint: 'Deterministic RNG seed',
      valueInput: seedInput,
      range: { min: 0, max: 1_000_000 },
      step: 1,
    });
    advanced.appendChild(seedRow.row);

    const levelsRow = createLinearSliderRow({
      title: 'Max Levels',
      hint: 'Hierarchy aggregation levels',
      valueInput: maxLevelsInput,
      range: { min: 1, max: 128 },
      step: 1,
    });
    advanced.appendChild(levelsRow.row);

    const passesRow = createLinearSliderRow({
      title: 'Max Passes',
      hint: 'Local move passes per level',
      valueInput: maxPassesInput,
      range: { min: 1, max: 64 },
      step: 1,
    });
    advanced.appendChild(passesRow.row);

    advanced.appendChild(createAlignedRow({
      title: 'Output Attr',
      hint: 'Writes UnsignedInteger node communities',
      controls: outAttributeInput,
    }).row);

    const yieldMsInput = document.createElement('input');
    yieldMsInput.type = 'number';
    yieldMsInput.className = 'helios-ui-number';
    yieldMsInput.value = String(options?.worker?.yieldMs ?? 0);
    yieldMsInput.dataset.testid = 'metrics-yieldMs';

    const timeoutMsInput = document.createElement('input');
    timeoutMsInput.type = 'number';
    timeoutMsInput.className = 'helios-ui-number';
    timeoutMsInput.value = String(options?.worker?.timeoutMs ?? 60);
    timeoutMsInput.dataset.testid = 'metrics-timeoutMs';

    const chunkBudgetInput = document.createElement('input');
    chunkBudgetInput.type = 'number';
    chunkBudgetInput.className = 'helios-ui-number';
    chunkBudgetInput.value = String(options?.worker?.chunkBudget ?? 20000);
    chunkBudgetInput.dataset.testid = 'metrics-chunkBudget';

    advanced.appendChild(createLinearSliderRow({ title: 'Yield (ms)', hint: 'Delay between worker chunks', valueInput: yieldMsInput, range: { min: 0, max: 100 }, step: 1 }).row);
    advanced.appendChild(createLinearSliderRow({ title: 'Timeout (ms)', hint: 'Max time per step() (slider shows 0–500ms suggestion)', valueInput: timeoutMsInput, range: { min: 0, max: 500 }, step: 1, inputMin: 0, inputMax: null, clampInput: false }).row);
    advanced.appendChild(createLinearSliderRow({ title: 'Chunk Budget', hint: 'Work per step() slice', valueInput: chunkBudgetInput, range: { min: 100, max: 100_000 }, step: 100 }).row);

    const leidenInnerStack = new PanelStack();
    leidenInnerStack.add({ id: 'metrics-leiden-advanced', title: 'Advanced', collapsed: true, content: advanced });
    leidenInnerStack.element.style.marginTop = '6px';

    // --- Dimensionality ------------------------------------------------------
    const dimension = document.createElement('div');

    const dimensionMethodSelect = document.createElement('select');
    dimensionMethodSelect.className = 'helios-ui-select';
    dimensionMethodSelect.dataset.testid = 'metrics-dimension-method';
    const dimensionMethodValue = normalizeDimensionMethod(options?.dimension?.method ?? 'leastsquares');
    for (const entry of [
      { value: 'leastsquares', label: 'Least Squares (LS)' },
      { value: 'central', label: 'Centered Difference (CE)' },
      { value: 'backward', label: 'Backward Difference (BK)' },
      { value: 'forward', label: 'Forward Difference (FW)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      dimensionMethodSelect.appendChild(opt);
    }
    dimensionMethodSelect.value = dimensionMethodValue;

    const dimensionMaxLevelInput = document.createElement('input');
    dimensionMaxLevelInput.type = 'number';
    dimensionMaxLevelInput.className = 'helios-ui-number';
    dimensionMaxLevelInput.value = String(options?.dimension?.maxLevel ?? 12);
    dimensionMaxLevelInput.dataset.testid = 'metrics-dimension-maxLevel';

    const dimensionOrderInput = document.createElement('input');
    dimensionOrderInput.type = 'number';
    dimensionOrderInput.className = 'helios-ui-number';
    dimensionOrderInput.value = String(options?.dimension?.order ?? 2);
    dimensionOrderInput.dataset.testid = 'metrics-dimension-order';

    const dimensionOutMaxAttrInput = document.createElement('input');
    dimensionOutMaxAttrInput.type = 'text';
    dimensionOutMaxAttrInput.className = 'helios-ui-text';
    dimensionOutMaxAttrInput.placeholder = 'dimension_max';
    dimensionOutMaxAttrInput.value = String(options?.dimension?.outNodeMaxDimensionAttribute ?? 'dimension_max');
    dimensionOutMaxAttrInput.dataset.testid = 'metrics-dimension-outMaxAttr';

    const dimensionOutLevelsAttrInput = document.createElement('input');
    dimensionOutLevelsAttrInput.type = 'text';
    dimensionOutLevelsAttrInput.className = 'helios-ui-text';
    dimensionOutLevelsAttrInput.placeholder = 'dimension_levels';
    dimensionOutLevelsAttrInput.value = String(options?.dimension?.outNodeDimensionLevelsAttribute ?? '');
    dimensionOutLevelsAttrInput.dataset.testid = 'metrics-dimension-outLevelsAttr';

    const dimensionSaveLevelsCheckbox = document.createElement('input');
    dimensionSaveLevelsCheckbox.type = 'checkbox';
    dimensionSaveLevelsCheckbox.dataset.testid = 'metrics-dimension-saveLevels';
    dimensionSaveLevelsCheckbox.checked = Boolean(
      options?.dimension?.saveLevelsDistribution
      ?? options?.dimension?.saveNodeDimensionLevels
      ?? options?.dimension?.outNodeDimensionLevelsAttribute
    );

    const dimensionSaveLevelsWrap = document.createElement('label');
    dimensionSaveLevelsWrap.style.display = 'inline-flex';
    dimensionSaveLevelsWrap.style.alignItems = 'center';
    dimensionSaveLevelsWrap.style.gap = '6px';
    const dimensionSaveLevelsText = document.createElement('span');
    dimensionSaveLevelsText.textContent = 'Write Levels Distribution';
    dimensionSaveLevelsWrap.appendChild(dimensionSaveLevelsCheckbox);
    dimensionSaveLevelsWrap.appendChild(dimensionSaveLevelsText);

    const dimensionLevelsEncodingSelect = document.createElement('select');
    dimensionLevelsEncodingSelect.className = 'helios-ui-select';
    dimensionLevelsEncodingSelect.dataset.testid = 'metrics-dimension-levelsEncoding';
    for (const entry of [
      { value: 'vector', label: 'Vector (Float)' },
      { value: 'string', label: 'String (JSON)' },
    ]) {
      const opt = document.createElement('option');
      opt.value = entry.value;
      opt.textContent = entry.label;
      dimensionLevelsEncodingSelect.appendChild(opt);
    }
    const initialLevelsEncoding = String(options?.dimension?.dimensionLevelsEncoding ?? 'vector').trim().toLowerCase();
    dimensionLevelsEncodingSelect.value = initialLevelsEncoding === 'string' ? 'string' : 'vector';

    const dimensionLevelsPrecisionInput = document.createElement('input');
    dimensionLevelsPrecisionInput.type = 'number';
    dimensionLevelsPrecisionInput.className = 'helios-ui-number';
    dimensionLevelsPrecisionInput.min = '0';
    dimensionLevelsPrecisionInput.max = '12';
    dimensionLevelsPrecisionInput.step = '1';
    dimensionLevelsPrecisionInput.value = String(options?.dimension?.dimensionLevelsStringPrecision ?? 6);
    dimensionLevelsPrecisionInput.dataset.testid = 'metrics-dimension-levelsPrecision';

    const dimensionActionWrap = document.createElement('div');
    dimensionActionWrap.style.display = 'inline-flex';
    dimensionActionWrap.style.alignItems = 'center';
    dimensionActionWrap.style.gap = '6px';

    const dimensionCalcButton = document.createElement('button');
    dimensionCalcButton.type = 'button';
    dimensionCalcButton.className = 'helios-ui-button';
    dimensionCalcButton.textContent = 'Calculate';
    dimensionCalcButton.dataset.testid = 'metrics-dimension-calc';

    const dimensionCancelButton = document.createElement('button');
    dimensionCancelButton.type = 'button';
    dimensionCancelButton.className = 'helios-ui-button';
    dimensionCancelButton.textContent = 'Cancel';
    dimensionCancelButton.dataset.testid = 'metrics-dimension-cancel';
    dimensionCancelButton.disabled = true;

    dimensionActionWrap.appendChild(dimensionCalcButton);
    dimensionActionWrap.appendChild(dimensionCancelButton);

    const dimensionStatusEl = document.createElement('div');
    dimensionStatusEl.className = 'helios-ui-label__hint';
    dimensionStatusEl.dataset.testid = 'metrics-dimension-status';
    dimensionStatusEl.textContent = '';

    const { row: dimensionActionsRow } = createAlignedRow({
      title: 'Dimensionality',
      hint: 'Run multiscale dimension measurement with incremental progress',
      controls: dimensionActionWrap,
    });
    dimension.appendChild(dimensionActionsRow);

    const { row: dimensionMethodRow } = createAlignedRow({
      title: 'Method',
      hint: 'Dimension estimator: LS, CE, BK, or FW',
      controls: dimensionMethodSelect,
    });
    dimension.appendChild(dimensionMethodRow);

    const dimensionMaxLevelRow = createLinearSliderRow({
      title: 'Max Level',
      hint: 'Largest concentric geodesic level r',
      valueInput: dimensionMaxLevelInput,
      range: { min: 1, max: 128 },
      step: 1,
    });
    dimension.appendChild(dimensionMaxLevelRow.row);

    const dimensionOrderRow = createLinearSliderRow({
      title: 'Order',
      hint: 'Estimator order (LS window order or finite-difference order)',
      valueInput: dimensionOrderInput,
      range: { min: 1, max: 32 },
      step: 1,
    });
    dimension.appendChild(dimensionOrderRow.row);

    const dimensionStats = document.createElement('div');
    dimensionStats.className = 'helios-ui-stats';
    const dimensionGlobalMaxValue = makeValue('—');
    dimensionGlobalMaxValue.dataset.testid = 'metrics-dimension-globalMax';
    const dimensionSelectedCountValue = makeValue('—');
    dimensionSelectedCountValue.dataset.testid = 'metrics-dimension-selectedCount';
    const dimensionElapsedValue = makeValue('—');
    dimensionElapsedValue.dataset.testid = 'metrics-dimension-elapsed';

    dimensionStats.appendChild(createStat('Global Dmax', dimensionGlobalMaxValue).stat);
    dimensionStats.appendChild(createStat('Nodes', dimensionSelectedCountValue).stat);
    dimensionStats.appendChild(createStat('Elapsed', dimensionElapsedValue).stat);
    dimensionStats.style.marginTop = '2px';

    const dimensionProgressWrap = document.createElement('div');
    dimensionProgressWrap.style.display = 'grid';
    dimensionProgressWrap.style.gridTemplateColumns = 'minmax(0, 1fr) auto';
    dimensionProgressWrap.style.columnGap = '8px';
    dimensionProgressWrap.style.rowGap = '2px';
    dimensionProgressWrap.style.alignItems = 'center';
    dimensionProgressWrap.style.width = '100%';

    const dimensionProgressEl = document.createElement('progress');
    dimensionProgressEl.className = 'helios-ui-progress';
    dimensionProgressEl.max = 1;
    dimensionProgressEl.value = 0;
    dimensionProgressEl.dataset.testid = 'metrics-dimension-progress';

    const dimensionProgressPct = makeValue('0%');
    dimensionProgressPct.dataset.testid = 'metrics-dimension-progressPct';
    dimensionProgressWrap.appendChild(dimensionProgressEl);
    dimensionProgressWrap.appendChild(dimensionProgressPct);

    dimensionStatusEl.style.gridColumn = '1 / -1';
    dimensionStatusEl.style.marginTop = '0px';
    dimensionStatusEl.style.fontSize = '10px';
    dimensionStatusEl.style.lineHeight = '1.1';
    dimensionStatusEl.style.whiteSpace = 'nowrap';
    dimensionStatusEl.style.overflow = 'hidden';
    dimensionStatusEl.style.textOverflow = 'ellipsis';
    dimensionStatusEl.style.maxWidth = '100%';
    dimensionStatusEl.style.minWidth = '0';
    dimensionProgressWrap.appendChild(dimensionStatusEl);

    const { row: dimensionProgressRow } = createAlignedRow({
      title: 'Progress',
      hint: 'Incremental progress while measuring selected nodes',
      controls: dimensionProgressWrap,
    });
    dimension.appendChild(dimensionProgressRow);

    dimension.appendChild(dimensionStats);
    dimensionStats.style.marginBottom = '8px';

    const dimensionAdvanced = document.createElement('div');
    dimensionAdvanced.appendChild(createAlignedRow({
      title: 'Output Dmax',
      hint: 'Writes maximum local dimension per node (Float, dim 1)',
      controls: dimensionOutMaxAttrInput,
    }).row);
    dimensionAdvanced.appendChild(createAlignedRow({
      title: 'Save Levels',
      hint: 'Enable writing the local dimension distribution across concentric levels',
      controls: dimensionSaveLevelsWrap,
    }).row);
    dimensionAdvanced.appendChild(createAlignedRow({
      title: 'Output Levels',
      hint: 'Optional full per-level local dimension profile per node',
      controls: dimensionOutLevelsAttrInput,
    }).row);
    dimensionAdvanced.appendChild(createAlignedRow({
      title: 'Levels Encoding',
      hint: 'Vector writes Float dimension=maxLevel+1; String writes JSON array string',
      controls: dimensionLevelsEncodingSelect,
    }).row);

    const dimensionPrecisionRow = createLinearSliderRow({
      title: 'String Precision',
      hint: 'Applied only when Levels Encoding is String',
      valueInput: dimensionLevelsPrecisionInput,
      range: { min: 0, max: 12 },
      step: 1,
    });
    dimensionAdvanced.appendChild(dimensionPrecisionRow.row);

    const dimensionYieldMsInput = document.createElement('input');
    dimensionYieldMsInput.type = 'number';
    dimensionYieldMsInput.className = 'helios-ui-number';
    dimensionYieldMsInput.value = String(options?.dimension?.worker?.yieldMs ?? options?.worker?.yieldMs ?? 0);
    dimensionYieldMsInput.dataset.testid = 'metrics-dimension-yieldMs';

    const dimensionTimeoutMsInput = document.createElement('input');
    dimensionTimeoutMsInput.type = 'number';
    dimensionTimeoutMsInput.className = 'helios-ui-number';
    dimensionTimeoutMsInput.value = String(options?.dimension?.worker?.timeoutMs ?? options?.worker?.timeoutMs ?? 60);
    dimensionTimeoutMsInput.dataset.testid = 'metrics-dimension-timeoutMs';

    const dimensionChunkBudgetInput = document.createElement('input');
    dimensionChunkBudgetInput.type = 'number';
    dimensionChunkBudgetInput.className = 'helios-ui-number';
    dimensionChunkBudgetInput.value = String(options?.dimension?.worker?.chunkBudget ?? options?.worker?.chunkBudget ?? 200);
    dimensionChunkBudgetInput.dataset.testid = 'metrics-dimension-chunkBudget';

    dimensionAdvanced.appendChild(createLinearSliderRow({ title: 'Yield (ms)', hint: 'Delay between step() calls', valueInput: dimensionYieldMsInput, range: { min: 0, max: 100 }, step: 1 }).row);
    dimensionAdvanced.appendChild(createLinearSliderRow({ title: 'Timeout (ms)', hint: 'Max time per step() (slider shows 0–500ms suggestion)', valueInput: dimensionTimeoutMsInput, range: { min: 0, max: 500 }, step: 1, inputMin: 0, inputMax: null, clampInput: false }).row);
    dimensionAdvanced.appendChild(createLinearSliderRow({ title: 'Chunk Budget', hint: 'Nodes processed per step() chunk', valueInput: dimensionChunkBudgetInput, range: { min: 1, max: 10_000 }, step: 1 }).row);

    const dimensionInnerStack = new PanelStack();
    dimensionInnerStack.add({ id: 'metrics-dimension-advanced', title: 'Advanced', collapsed: true, content: dimensionAdvanced });
    dimensionInnerStack.element.style.marginTop = '6px';

    // --- State + wiring ------------------------------------------------------
    let leidenRunning = false;
    let leidenAbortController = null;
    let dimensionRunning = false;
    let dimensionAbortController = null;
    let degreeRunning = false;
    let strengthRunning = false;
    let clusteringRunning = false;
    let eigenvectorRunning = false;
    let betweennessRunning = false;
    let eigenvectorAbortController = null;
    let betweennessAbortController = null;

    const setDegreeStatus = (text) => {
      const value = text ?? '';
      degreeStatusEl.textContent = value;
      degreeStatusEl.title = value;
    };

    const setDegreeRunning = (nextRunning) => {
      degreeRunning = Boolean(nextRunning);
      setDisabled(degreeCalcButton, degreeRunning);
      setDisabled(degreeDirectionSelect, degreeRunning);
      setDisabled(degreeOutAttrInput, degreeRunning);
    };

    const setStrengthStatus = (text) => {
      const value = text ?? '';
      strengthStatusEl.textContent = value;
      strengthStatusEl.title = value;
    };

    const setStrengthRunning = (nextRunning) => {
      strengthRunning = Boolean(nextRunning);
      setDisabled(strengthCalcButton, strengthRunning);
      setDisabled(strengthDirectionSelect, strengthRunning);
      setDisabled(strengthMeasureSelect, strengthRunning);
      setDisabled(strengthWeightSelect, strengthRunning);
      setDisabled(strengthOutAttrInput, strengthRunning);
    };

    const setClusteringStatus = (text) => {
      const value = text ?? '';
      clusteringStatusEl.textContent = value;
      clusteringStatusEl.title = value;
    };

    const setClusteringRunning = (nextRunning) => {
      clusteringRunning = Boolean(nextRunning);
      setDisabled(clusteringCalcButton, clusteringRunning);
      setDisabled(clusteringVariantSelect, clusteringRunning);
      setDisabled(clusteringDirectionSelect, clusteringRunning);
      setDisabled(clusteringWeightSelect, clusteringRunning || clusteringVariantSelect.value === 'unweighted');
      setDisabled(clusteringOutAttrInput, clusteringRunning);
    };

    const setEigenvectorStatus = (text) => {
      const value = text ?? '';
      eigenvectorStatusEl.textContent = value;
      eigenvectorStatusEl.title = value;
    };

    const setEigenvectorProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        eigenvectorProgressEl.removeAttribute('value');
        eigenvectorProgressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      eigenvectorProgressEl.value = pct;
      eigenvectorProgressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setEigenvectorRunning = (nextRunning) => {
      eigenvectorRunning = Boolean(nextRunning);
      setDisabled(eigenvectorCalcButton, eigenvectorRunning);
      setDisabled(eigenvectorCancelButton, !eigenvectorRunning);
      setDisabled(eigenvectorDirectionSelect, eigenvectorRunning);
      setDisabled(eigenvectorWeightSelect, eigenvectorRunning);
      setDisabled(eigenvectorMaxIterationsInput, eigenvectorRunning);
      setDisabled(eigenvectorMaxIterationsRow.slider, eigenvectorRunning);
      setDisabled(eigenvectorToleranceInput, eigenvectorRunning);
      setDisabled(eigenvectorToleranceRow.slider, eigenvectorRunning);
      setDisabled(eigenvectorOutAttrInput, eigenvectorRunning);
      setDisabled(eigenvectorChunkIterationsInput, eigenvectorRunning);
      setDisabled(eigenvectorChunkIterationsRow.slider, eigenvectorRunning);
      setDisabled(eigenvectorYieldMsInput, eigenvectorRunning);
      setDisabled(eigenvectorYieldRow.slider, eigenvectorRunning);
    };

    const setBetweennessStatus = (text) => {
      const value = text ?? '';
      betweennessStatusEl.textContent = value;
      betweennessStatusEl.title = value;
    };

    const setBetweennessProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        betweennessProgressEl.removeAttribute('value');
        betweennessProgressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      betweennessProgressEl.value = pct;
      betweennessProgressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setBetweennessRunning = (nextRunning) => {
      betweennessRunning = Boolean(nextRunning);
      setDisabled(betweennessCalcButton, betweennessRunning);
      setDisabled(betweennessCancelButton, !betweennessRunning);
      setDisabled(betweennessWeightSelect, betweennessRunning);
      setDisabled(betweennessNormalizeCheckbox, betweennessRunning);
      setDisabled(betweennessOutAttrInput, betweennessRunning);
      setDisabled(betweennessSourceChunkInput, betweennessRunning);
      setDisabled(betweennessSourceChunkRow.slider, betweennessRunning);
      setDisabled(betweennessYieldMsInput, betweennessRunning);
      setDisabled(betweennessYieldRow.slider, betweennessRunning);
    };

    const setLeidenStatus = (text) => {
      statusEl.textContent = text ?? '';
    };

    const setLeidenProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        progressEl.removeAttribute('value');
        progressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      progressEl.value = pct;
      progressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setLeidenRunning = (nextRunning) => {
      leidenRunning = Boolean(nextRunning);
      setDisabled(calcButton, leidenRunning);
      setDisabled(cancelButton, !leidenRunning);
      setDisabled(weightSelect, leidenRunning);
      setDisabled(resolutionInput, leidenRunning);
      setDisabled(resolutionRow.slider, leidenRunning);
      setDisabled(seedInput, leidenRunning);
      setDisabled(seedRow.slider, leidenRunning);
      setDisabled(maxLevelsInput, leidenRunning);
      setDisabled(levelsRow.slider, leidenRunning);
      setDisabled(maxPassesInput, leidenRunning);
      setDisabled(passesRow.slider, leidenRunning);
      setDisabled(outAttributeInput, leidenRunning);
      setDisabled(yieldMsInput, leidenRunning);
      setDisabled(timeoutMsInput, leidenRunning);
      setDisabled(chunkBudgetInput, leidenRunning);
    };

    const setDimensionStatus = (text) => {
      dimensionStatusEl.textContent = text ?? '';
    };

    const setDimensionProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        dimensionProgressEl.removeAttribute('value');
        dimensionProgressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      dimensionProgressEl.value = pct;
      dimensionProgressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setDimensionRunning = (nextRunning) => {
      dimensionRunning = Boolean(nextRunning);
      setDisabled(dimensionCalcButton, dimensionRunning);
      setDisabled(dimensionCancelButton, !dimensionRunning);
      setDisabled(dimensionMethodSelect, dimensionRunning);
      setDisabled(dimensionMaxLevelInput, dimensionRunning);
      setDisabled(dimensionMaxLevelRow.slider, dimensionRunning);
      setDisabled(dimensionOrderInput, dimensionRunning);
      setDisabled(dimensionOrderRow.slider, dimensionRunning);
      setDisabled(dimensionOutMaxAttrInput, dimensionRunning);
      setDisabled(dimensionSaveLevelsCheckbox, dimensionRunning);
      setDisabled(dimensionOutLevelsAttrInput, dimensionRunning || !dimensionSaveLevelsCheckbox.checked);
      setDisabled(dimensionLevelsEncodingSelect, dimensionRunning || !dimensionSaveLevelsCheckbox.checked);
      setDisabled(dimensionLevelsPrecisionInput, dimensionRunning || !dimensionSaveLevelsCheckbox.checked || dimensionLevelsEncodingSelect.value !== 'string');
      setDisabled(dimensionPrecisionRow.slider, dimensionRunning || !dimensionSaveLevelsCheckbox.checked || dimensionLevelsEncodingSelect.value !== 'string');
      setDisabled(dimensionYieldMsInput, dimensionRunning);
      setDisabled(dimensionTimeoutMsInput, dimensionRunning);
      setDisabled(dimensionChunkBudgetInput, dimensionRunning);
    };

    const refreshDimensionOrderLimits = () => {
      const method = normalizeDimensionMethod(dimensionMethodSelect.value);
      const methodMaxOrder = maxOrderForDimensionMethod(method);
      dimensionOrderInput.max = String(methodMaxOrder);
      dimensionOrderRow.slider.max = String(methodMaxOrder);
      const currentOrder = Math.max(1, Number(dimensionOrderInput.value) || 1);
      if (currentOrder > methodMaxOrder) {
        dimensionOrderRow.write(methodMaxOrder);
      } else {
        dimensionOrderRow.write(currentOrder);
      }
    };

    const refreshDimensionLevelEncodingControls = () => {
      const saveLevels = Boolean(dimensionSaveLevelsCheckbox.checked);
      const allowPrecision = saveLevels && dimensionLevelsEncodingSelect.value === 'string';
      setDisabled(dimensionOutLevelsAttrInput, dimensionRunning || !saveLevels);
      setDisabled(dimensionLevelsEncodingSelect, dimensionRunning || !saveLevels);
      setDisabled(dimensionLevelsPrecisionInput, dimensionRunning || !allowPrecision);
      setDisabled(dimensionPrecisionRow.slider, dimensionRunning || !allowPrecision);
    };

    dimensionMethodSelect.addEventListener('change', refreshDimensionOrderLimits);
    dimensionOutLevelsAttrInput.addEventListener('input', refreshDimensionLevelEncodingControls);
    dimensionSaveLevelsCheckbox.addEventListener('change', refreshDimensionLevelEncodingControls);
    dimensionLevelsEncodingSelect.addEventListener('change', refreshDimensionLevelEncodingControls);

    const refreshClusteringWeightControls = () => {
      setDisabled(clusteringWeightSelect, clusteringRunning || clusteringVariantSelect.value === 'unweighted');
    };

    clusteringVariantSelect.addEventListener('change', refreshClusteringWeightControls);

    const refreshEdgeWeightOptions = () => {
      const network = net();
      const names = network && typeof network.getEdgeAttributeNames === 'function'
        ? (network.getEdgeAttributeNames() ?? []).filter((name) => isPublicAttributeName(name))
        : [];
      for (const select of edgeWeightSelects) {
        const existing = select.value;
        const preferred = select.dataset.initialValue ?? '';
        select.textContent = '';
        const optNone = document.createElement('option');
        optNone.value = '';
        optNone.textContent = 'None';
        select.appendChild(optNone);
        for (const name of names) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          select.appendChild(opt);
        }
        if (existing && Array.from(select.options).some((o) => o.value === existing)) {
          select.value = existing;
        } else if (preferred && Array.from(select.options).some((o) => o.value === preferred)) {
          select.value = preferred;
        } else {
          select.value = '';
        }
      }
    };

    const refreshAll = () => {
      refreshEdgeWeightOptions();
      refreshClusteringWeightControls();
      refreshDimensionOrderLimits();
      refreshDimensionLevelEncodingControls();
    };

    const cancelLeidenRun = () => {
      if (!leidenAbortController) return;
      leidenAbortController.abort();
    };

    const cancelDimensionRun = () => {
      if (!dimensionAbortController) return;
      dimensionAbortController.abort();
    };

    const cancelEigenvectorRun = () => {
      if (!eigenvectorAbortController) return;
      eigenvectorAbortController.abort();
    };

    const cancelBetweennessRun = () => {
      if (!betweennessAbortController) return;
      betweennessAbortController.abort();
    };

    cancelButton.addEventListener('click', cancelLeidenRun);
    dimensionCancelButton.addEventListener('click', cancelDimensionRun);
    eigenvectorCancelButton.addEventListener('click', cancelEigenvectorRun);
    betweennessCancelButton.addEventListener('click', cancelBetweennessRun);

    const runDegree = () => {
      const network = net();
      if (!network || typeof network.measureDegree !== 'function') {
        setDegreeStatus('Degree measurement is not available on this network');
        return;
      }
      const direction = normalizeNeighborDirection(degreeDirectionSelect.value);
      const outNodeAttribute = degreeOutAttrInput.value.trim();

      setDegreeStatus('Running…');
      degreeMaxValue.textContent = '—';
      degreeMeanValue.textContent = '—';
      degreeElapsedValue.textContent = '—';
      setDegreeRunning(true);

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const result = network.measureDegree({ direction });
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(result?.values ?? result?.valuesByNode);
        const wrote = outNodeAttribute ? writeNodeMetricValues(network, outNodeAttribute, result) : false;
        degreeMaxValue.textContent = formatNumber(summary.max, 4);
        degreeMeanValue.textContent = formatNumber(summary.mean, 4);
        degreeElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        setDegreeStatus(wrote ? `Done • wrote "${outNodeAttribute}"` : 'Done');
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        setDegreeStatus(error?.message ?? String(error));
      } finally {
        setDegreeRunning(false);
      }
    };

    const runStrength = () => {
      const network = net();
      if (!network || typeof network.measureStrength !== 'function') {
        setStrengthStatus('Strength measurement is not available on this network');
        return;
      }
      const direction = normalizeNeighborDirection(strengthDirectionSelect.value);
      const measure = normalizeStrengthMeasure(strengthMeasureSelect.value);
      const edgeWeightAttribute = strengthWeightSelect.value ? String(strengthWeightSelect.value) : null;
      const outNodeAttribute = strengthOutAttrInput.value.trim();

      setStrengthStatus('Running…');
      strengthMaxValue.textContent = '—';
      strengthMeanValue.textContent = '—';
      strengthElapsedValue.textContent = '—';
      setStrengthRunning(true);

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const result = network.measureStrength({
          direction,
          measure,
          edgeWeightAttribute,
        });
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(result?.values ?? result?.valuesByNode);
        const wrote = outNodeAttribute ? writeNodeMetricValues(network, outNodeAttribute, result) : false;
        strengthMaxValue.textContent = formatNumber(summary.max, 4);
        strengthMeanValue.textContent = formatNumber(summary.mean, 4);
        strengthElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        setStrengthStatus(wrote ? `Done • wrote "${outNodeAttribute}"` : 'Done');
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        setStrengthStatus(error?.message ?? String(error));
      } finally {
        setStrengthRunning(false);
      }
    };

    const runClustering = () => {
      const network = net();
      if (!network || typeof network.measureLocalClusteringCoefficient !== 'function') {
        setClusteringStatus('Local clustering measurement is not available on this network');
        return;
      }
      const direction = normalizeNeighborDirection(clusteringDirectionSelect.value);
      const variant = normalizeClusteringVariant(clusteringVariantSelect.value);
      const edgeWeightAttribute = clusteringWeightSelect.value ? String(clusteringWeightSelect.value) : null;
      if (variant !== 'unweighted' && !edgeWeightAttribute) {
        setClusteringStatus('Choose an edge weight attribute for weighted variants');
        return;
      }
      const outNodeAttribute = clusteringOutAttrInput.value.trim();

      setClusteringStatus('Running…');
      clusteringMaxValue.textContent = '—';
      clusteringMeanValue.textContent = '—';
      clusteringElapsedValue.textContent = '—';
      setClusteringRunning(true);

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const result = network.measureLocalClusteringCoefficient({
          direction,
          variant,
          edgeWeightAttribute: variant === 'unweighted' ? null : edgeWeightAttribute,
        });
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(result?.values ?? result?.valuesByNode);
        const wrote = outNodeAttribute ? writeNodeMetricValues(network, outNodeAttribute, result) : false;
        clusteringMaxValue.textContent = formatNumber(summary.max, 4);
        clusteringMeanValue.textContent = formatNumber(summary.mean, 4);
        clusteringElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        setClusteringStatus(wrote ? `Done • wrote "${outNodeAttribute}"` : 'Done');
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        setClusteringStatus(error?.message ?? String(error));
      } finally {
        setClusteringRunning(false);
      }
    };

    const runEigenvector = async () => {
      const network = net();
      if (!network || typeof network.measureEigenvectorCentrality !== 'function') {
        setEigenvectorStatus('Eigenvector centrality is not available on this network');
        return;
      }

      const direction = normalizeNeighborDirection(eigenvectorDirectionSelect.value);
      const edgeWeightAttribute = eigenvectorWeightSelect.value ? String(eigenvectorWeightSelect.value) : null;
      const maxIterations = Math.max(1, Number(eigenvectorMaxIterationsInput.value) || 1);
      const chunkIterations = Math.max(1, Number(eigenvectorChunkIterationsInput.value) || 1);
      const yieldMs = Math.max(0, Number(eigenvectorYieldMsInput.value) || 0);
      const toleranceRaw = Number(eigenvectorToleranceInput.value);
      const tolerance = Number.isFinite(toleranceRaw) && toleranceRaw > 0 ? toleranceRaw : 1e-6;
      const outNodeAttribute = eigenvectorOutAttrInput.value.trim();

      setEigenvectorStatus('Starting…');
      setEigenvectorProgress(0, maxIterations);
      eigenvectorMaxValue.textContent = '—';
      eigenvectorEigenvalueValue.textContent = '—';
      eigenvectorElapsedValue.textContent = '—';
      setEigenvectorRunning(true);
      eigenvectorAbortController = new AbortController();
      const signal = eigenvectorAbortController.signal;

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      let processedIterations = 0;
      let currentValues = null;
      let lastResult = null;
      try {
        while (processedIterations < maxIterations) {
          if (signal.aborted) {
            throw new Error('Canceled');
          }
          const remaining = maxIterations - processedIterations;
          const stepIterations = Math.max(1, Math.min(chunkIterations, remaining));
          lastResult = network.measureEigenvectorCentrality({
            direction,
            edgeWeightAttribute,
            maxIterations: stepIterations,
            tolerance,
            initialValues: currentValues,
            executionMode: 'single-thread',
          });
          currentValues = lastResult?.valuesByNode ?? currentValues;
          const stepDone = Math.max(1, Number(lastResult?.iterations ?? stepIterations));
          processedIterations = Math.min(maxIterations, processedIterations + stepDone);
          setEigenvectorProgress(processedIterations, maxIterations);
          setEigenvectorStatus(`Running… ${processedIterations}/${maxIterations} iterations`);
          if (lastResult?.converged) break;
          await defer(yieldMs);
        }
        if (!currentValues) {
          throw new Error('Eigenvector centrality returned no values');
        }
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(currentValues);
        const resultForWrite = lastResult?.valuesByNode ? lastResult : { valuesByNode: currentValues };
        const wrote = outNodeAttribute ? writeNodeMetricValues(network, outNodeAttribute, resultForWrite) : false;
        const converged = lastResult?.converged ? 'converged' : 'max iterations reached';
        const iterations = processedIterations;
        setEigenvectorProgress(1, 1);
        eigenvectorMaxValue.textContent = formatNumber(summary.max, 6);
        eigenvectorEigenvalueValue.textContent = formatNumber(Number(lastResult?.eigenvalue ?? NaN), 6);
        eigenvectorElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        const writeMsg = wrote ? ` • wrote "${outNodeAttribute}"` : '';
        setEigenvectorStatus(`Done • ${converged} in ${iterations} iterations${writeMsg}`);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const lower = message.toLowerCase();
        const aborted = signal.aborted || lower.includes('aborted') || lower.includes('canceled');
        if (aborted) {
          setEigenvectorStatus('Canceled');
        } else {
          const detail = reportMeasurementError('Eigenvector centrality', error, {
            direction,
            edgeWeightAttribute,
            maxIterations,
            chunkIterations,
            tolerance,
            processedIterations,
          });
          setEigenvectorStatus(detail);
        }
      } finally {
        eigenvectorAbortController = null;
        setEigenvectorRunning(false);
      }
    };

    const runBetweenness = async () => {
      const network = net();
      if (!network || typeof network.measureBetweennessCentrality !== 'function') {
        setBetweennessStatus('Betweenness centrality is not available on this network');
        return;
      }
      const edgeWeightAttribute = betweennessWeightSelect.value ? String(betweennessWeightSelect.value) : null;
      const normalize = Boolean(betweennessNormalizeCheckbox.checked);
      const sourceChunkSize = Math.max(1, Number(betweennessSourceChunkInput.value) || 1);
      const yieldMs = Math.max(0, Number(betweennessYieldMsInput.value) || 0);
      const outNodeAttribute = betweennessOutAttrInput.value.trim();

      const sourceNodes = Uint32Array.from(network.nodeIndices ?? []);
      const totalSources = sourceNodes.length >>> 0;
      if (!totalSources) {
        setBetweennessStatus('No active nodes to process');
        betweennessMaxValue.textContent = '—';
        betweennessSourceCountValue.textContent = '0';
        betweennessElapsedValue.textContent = '0 ms';
        setBetweennessProgress(1, 1);
        return;
      }

      setBetweennessStatus('Starting…');
      setBetweennessProgress(0, totalSources);
      betweennessMaxValue.textContent = '—';
      betweennessSourceCountValue.textContent = '—';
      betweennessElapsedValue.textContent = '—';
      setBetweennessRunning(true);
      betweennessAbortController = new AbortController();
      const signal = betweennessAbortController.signal;

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      let processedSources = 0;
      let valuesByNode = null;
      try {
        while (processedSources < totalSources) {
          if (signal.aborted) {
            throw new Error('Canceled');
          }
          const chunk = sourceNodes.subarray(processedSources, Math.min(totalSources, processedSources + sourceChunkSize));
          const partial = network.measureBetweennessCentrality({
            edgeWeightAttribute,
            normalize: false,
            sourceNodes: chunk,
            accumulate: processedSources > 0,
            initialValues: valuesByNode,
            executionMode: 'single-thread',
          });
          valuesByNode = partial?.valuesByNode ?? valuesByNode;
          processedSources += chunk.length;
          setBetweennessProgress(processedSources, totalSources);
          setBetweennessStatus(`Running… ${processedSources}/${totalSources} sources`);
          await defer(yieldMs);
        }
        if (!valuesByNode) {
          throw new Error('Betweenness centrality returned no values');
        }
        let finalValues = valuesByNode;
        if (normalize) {
          const n = Math.max(0, Number(network.nodeCount) || 0);
          const denom = (n - 1) * (n - 2);
          const scale = denom > 0 ? (network.directed ? (1 / denom) : (2 / denom)) : 0;
          const normalizedValues = new Float32Array(finalValues.length);
          for (let i = 0; i < finalValues.length; i += 1) {
            normalizedValues[i] = finalValues[i] * scale;
          }
          finalValues = normalizedValues;
        }
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const summary = summarizeFiniteValues(finalValues);
        const wrote = outNodeAttribute ? writeNodeMetricValues(network, outNodeAttribute, { valuesByNode: finalValues }) : false;
        setBetweennessProgress(1, 1);
        betweennessMaxValue.textContent = formatNumber(summary.max, 6);
        betweennessSourceCountValue.textContent = String(processedSources);
        betweennessElapsedValue.textContent = `${Math.round(Math.max(0, ended - started))} ms`;
        const writeMsg = wrote ? ` • wrote "${outNodeAttribute}"` : '';
        setBetweennessStatus(`Done${writeMsg}`);
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const lower = message.toLowerCase();
        const aborted = signal.aborted || lower.includes('aborted') || lower.includes('canceled');
        if (aborted) {
          setBetweennessStatus('Canceled');
        } else {
          const detail = reportMeasurementError('Betweenness centrality', error, {
            edgeWeightAttribute,
            normalize,
            sourceChunkSize,
            processedSources,
            totalSources,
          });
          setBetweennessStatus(detail);
        }
      } finally {
        betweennessAbortController = null;
        setBetweennessRunning(false);
      }
    };

    const runLeiden = async () => {
      const network = net();
      if (!network || typeof network.createLeidenSession !== 'function') {
        setLeidenStatus('Leiden is not available on this network');
        return;
      }

      const resolution = Number(resolutionInput.value || 1);
      const seed = Number(seedInput.value || 0);
      const maxLevels = Number(maxLevelsInput.value || 32);
      const maxPasses = Number(maxPassesInput.value || 8);
      const edgeWeightAttribute = weightSelect.value ? String(weightSelect.value) : null;
      const outNodeCommunityAttribute = String(outAttributeInput.value || 'community');

      const timeoutMs = Math.max(0, Number(timeoutMsInput.value) || 0);
      const chunkBudget = Math.max(1, Number(chunkBudgetInput.value) || 20000);
      const yieldMs = Math.max(0, Number(yieldMsInput.value) || 0);

      setLeidenStatus('Starting…');
      setLeidenProgress(0, 1);
      modularityValue.textContent = '—';
      communityValue.textContent = '—';
      elapsedValue.textContent = '—';
      setLeidenRunning(true);
      leidenAbortController = new AbortController();

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try {
        const session = network.createLeidenSession({
          edgeWeightAttribute,
          resolution,
          seed,
          maxLevels,
          maxPasses,
          outNodeCommunityAttribute,
        });

        const result = await session.runWorker({
          signal: leidenAbortController.signal,
          yieldMs,
          stepOptions: { timeoutMs, chunkBudget },
          onProgress: (progress) => {
            if (!progress) return;
            setLeidenProgress(progress.progressCurrent, progress.progressTotal);
            const phase = progress.phase ?? 0;
            const level = progress.level ?? 0;
            const maxL = progress.maxLevels ?? 0;
            const pass = progress.pass ?? 0;
            const maxP = progress.maxPasses ?? 0;
            const communities = progress.communityCount ?? 0;
            setLeidenStatus(`Running… phase ${phase} • level ${level}/${maxL} • pass ${pass}/${maxP} • k=${communities}`);
          },
        });

        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsedMs = Math.max(0, ended - started);
        setLeidenProgress(1, 1);
        setLeidenStatus(`Done • wrote "${outNodeCommunityAttribute}"`);
        modularityValue.textContent = formatNumber(result?.modularity ?? NaN, 6);
        communityValue.textContent = String(result?.communityCount ?? '—');
        elapsedValue.textContent = `${Math.round(elapsedMs)} ms`;
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const lower = message.toLowerCase();
        const aborted = leidenAbortController?.signal?.aborted || lower.includes('aborted') || lower.includes('canceled');
        if (aborted) {
          setLeidenStatus('Canceled');
        } else {
          setLeidenStatus(message);
        }
      } finally {
        leidenAbortController = null;
        setLeidenRunning(false);
      }
    };

    const runDimension = async () => {
      const network = net();
      if (!network || typeof network.createDimensionSession !== 'function') {
        setDimensionStatus('Dimension session is not available on this network');
        return;
      }

      refreshDimensionOrderLimits();
      const method = normalizeDimensionMethod(dimensionMethodSelect.value);
      const maxLevel = Math.max(0, Number(dimensionMaxLevelInput.value) || 0);
      const methodMaxOrder = maxOrderForDimensionMethod(method);
      const order = Math.min(methodMaxOrder, Math.max(1, Number(dimensionOrderInput.value) || 1));
      dimensionOrderRow.write(order);

      const outNodeMaxDimensionAttribute = dimensionOutMaxAttrInput.value.trim() || null;
      const saveLevels = Boolean(dimensionSaveLevelsCheckbox.checked);
      let outNodeDimensionLevelsAttribute = null;
      if (saveLevels) {
        outNodeDimensionLevelsAttribute = dimensionOutLevelsAttrInput.value.trim() || 'dimension_levels';
        dimensionOutLevelsAttrInput.value = outNodeDimensionLevelsAttribute;
      }
      const dimensionLevelsEncoding = dimensionLevelsEncodingSelect.value === 'string' ? 'string' : 'vector';
      const dimensionLevelsStringPrecision = Math.max(0, Math.min(12, Number(dimensionLevelsPrecisionInput.value) || 0));

      const timeoutMs = Math.max(0, Number(dimensionTimeoutMsInput.value) || 0);
      const chunkBudget = Math.max(1, Number(dimensionChunkBudgetInput.value) || 200);
      const yieldMs = Math.max(0, Number(dimensionYieldMsInput.value) || 0);

      setDimensionStatus('Starting…');
      setDimensionProgress(0, 1);
      dimensionGlobalMaxValue.textContent = '—';
      dimensionSelectedCountValue.textContent = '—';
      dimensionElapsedValue.textContent = '—';
      setDimensionRunning(true);
      dimensionAbortController = new AbortController();

      const started = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      let session = null;
      try {
        session = network.createDimensionSession({
          maxLevel,
          method,
          order,
          captureNodeDimensionProfiles: Boolean(outNodeDimensionLevelsAttribute),
          outNodeMaxDimensionAttribute,
          outNodeDimensionLevelsAttribute,
          dimensionLevelsEncoding,
          dimensionLevelsStringPrecision,
        });

        await session.run({
          signal: dimensionAbortController.signal,
          yieldMs,
          stepOptions: { timeoutMs, chunkBudget },
          onProgress: (progress) => {
            if (!progress) return;
            setDimensionProgress(progress.progressCurrent, progress.progressTotal);
            const phase = progress.phase ?? 0;
            const processed = progress.processedNodes ?? progress.progressCurrent ?? 0;
            const total = progress.nodeCount ?? progress.progressTotal ?? 0;
            setDimensionStatus(`Running… phase ${phase} • ${processed}/${total} nodes`);
          },
        });

        const result = session.finalize({
          outNodeMaxDimensionAttribute,
          outNodeDimensionLevelsAttribute,
          dimensionLevelsEncoding,
          dimensionLevelsStringPrecision,
        });
        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsedMs = Math.max(0, ended - started);
        const dmax = maxFiniteArrayValue(result?.globalDimension);

        const writes = [];
        if (outNodeMaxDimensionAttribute) writes.push(`"${outNodeMaxDimensionAttribute}"`);
        if (outNodeDimensionLevelsAttribute) writes.push(`"${outNodeDimensionLevelsAttribute}"`);
        setDimensionProgress(1, 1);
        setDimensionStatus(writes.length ? `Done • wrote ${writes.join(', ')}` : 'Done');
        dimensionGlobalMaxValue.textContent = formatNumber(dmax, 4);
        dimensionSelectedCountValue.textContent = String(result?.selectedCount ?? '—');
        dimensionElapsedValue.textContent = `${Math.round(elapsedMs)} ms`;
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const lower = message.toLowerCase();
        const aborted = dimensionAbortController?.signal?.aborted || lower.includes('aborted') || lower.includes('canceled');
        if (aborted) {
          setDimensionStatus('Canceled');
        } else {
          setDimensionStatus(message);
        }
      } finally {
        if (session && typeof session.dispose === 'function') {
          session.dispose();
        }
        dimensionAbortController = null;
        setDimensionRunning(false);
      }
    };

    degreeCalcButton.addEventListener('click', () => {
      if (degreeRunning) return;
      runDegree();
    });
    strengthCalcButton.addEventListener('click', () => {
      if (strengthRunning) return;
      runStrength();
    });
    clusteringCalcButton.addEventListener('click', () => {
      if (clusteringRunning) return;
      runClustering();
    });
    eigenvectorCalcButton.addEventListener('click', () => {
      if (eigenvectorRunning) return;
      runEigenvector();
    });
    betweennessCalcButton.addEventListener('click', () => {
      if (betweennessRunning) return;
      runBetweenness();
    });

    calcButton.addEventListener('click', () => {
      if (leidenRunning) return;
      runLeiden();
    });
    dimensionCalcButton.addEventListener('click', () => {
      if (dimensionRunning) return;
      runDimension();
    });

    refreshAll();

    // Status is rendered under the Progress bar.

    const stack = new PanelStack();
    stack.add({
      id: 'metrics-degree',
      title: 'Degree',
      collapsed: options?.collapsedDegree ?? true,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(degree);
        wrapper.appendChild(degreeInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-strength',
      title: 'Strength',
      collapsed: options?.collapsedStrength ?? true,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(strength);
        wrapper.appendChild(strengthInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-clustering',
      title: 'Local Clustering',
      collapsed: options?.collapsedClustering ?? true,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(clustering);
        wrapper.appendChild(clusteringInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-eigen',
      title: 'Eigenvector Centrality',
      collapsed: options?.collapsedEigenvector ?? true,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(eigenvector);
        wrapper.appendChild(eigenvectorInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-betweenness',
      title: 'Betweenness Centrality',
      collapsed: options?.collapsedBetweenness ?? true,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(betweenness);
        wrapper.appendChild(betweennessInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-leiden',
      title: 'Communities (Leiden)',
      collapsed: options?.collapsedLeiden ?? true,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(leiden);
        wrapper.appendChild(leidenInnerStack.element);
        return wrapper;
      })(),
    });
    stack.add({
      id: 'metrics-dimension',
      title: 'Dimensionality',
      collapsed: options?.collapsedDimension ?? true,
      content: (() => {
        const wrapper = document.createElement('div');
        wrapper.appendChild(dimension);
        wrapper.appendChild(dimensionInnerStack.element);
        return wrapper;
      })(),
    });
    content.appendChild(stack.element);
    this._controlCleanups.add(() => stack.destroy());
    this._controlCleanups.add(() => degreeInnerStack.destroy());
    this._controlCleanups.add(() => strengthInnerStack.destroy());
    this._controlCleanups.add(() => clusteringInnerStack.destroy());
    this._controlCleanups.add(() => eigenvectorInnerStack.destroy());
    this._controlCleanups.add(() => betweennessInnerStack.destroy());
    this._controlCleanups.add(() => leidenInnerStack.destroy());
    this._controlCleanups.add(() => dimensionInnerStack.destroy());

    this._controlCleanups.add(() => {
      for (const cleanup of tooltipCleanups) cleanup();
      tooltipCleanups.clear();
    });

    // Refresh on network changes (and cancel any in-flight run).
    const onNetworkReplaced = () => {
      cancelLeidenRun();
      cancelDimensionRun();
      cancelEigenvectorRun();
      cancelBetweennessRun();
      refreshAll();
    };
    let unsub = null;
    if (this.helios?.on) {
      unsub = this.helios.on('network:replaced', onNetworkReplaced);
    } else if (this.helios?.addEventListener) {
      this.helios.addEventListener('network:replaced', onNetworkReplaced);
      unsub = () => this.helios.removeEventListener('network:replaced', onNetworkReplaced);
    }
    if (unsub) this._controlCleanups.add(unsub);

    return this.createPanel({
      id: options.id ?? 'helios-ui-metrics',
      title: options.title ?? 'Metrics',
      position: options.position ?? { x: 16, y: 340 },
      dock: options.dock ?? 'top-left',
      content,
    });
  }

  destroy() {
    for (const cleanup of this._controlCleanups) cleanup();
    this._controlCleanups.clear();
    this._boundAttributesById.clear();
    this._heliosBindingUnsubscribe = null;
    this.panelManager?.destroy();
    if (this.helios?.layers && typeof this.helios.layers.removeLayer === 'function') {
      this.helios.layers.removeLayer(this.layerName);
      return;
    }
    this.container?.remove?.();
  }

  createMappersPanel(options = {}) {
    return new MappersPanel(this, options).create();

    const helios = this.helios;
    const network = helios?.network ?? null;

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

    // Domains shown in the UI are always in the original attribute scale.
    // When a transform is selected, the runtime will transform the domain internally.

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

    const isHexColorString = (value) => {
      if (typeof value !== 'string') return false;
      const hex = value.trim();
      return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex);
    };

    const isNumericAttributeType = (type) => typeof type === 'number';
    const isIntegerAttributeType = (type) =>
      type === AttributeType.Integer ||
      type === AttributeType.UnsignedInteger ||
      type === AttributeType.BigInteger ||
      type === AttributeType.UnsignedBigInteger;

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

      // Special built-in attribute implemented by Mapper.resolveAttribute.
      out.push('$index');

      // Friendly aliases for internal visual attributes (avoid showing _helios_*).
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

      // For edge mappers, allow selecting node endpoint values with @node.*.
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
        const count = scope === 'edge' ? (network.edgeCount ?? network.edgesCount ?? null) : (network.nodeCount ?? network.nodesCount ?? null);
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

    const updateSliderVisual = (slider) => {
      if (!slider) return;
      const min = Number(slider.min);
      const max = Number(slider.max);
      const value = Number(slider.value);
      if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || min === max) return;
      const pct = ((value - min) / (max - min)) * 100;
      slider.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct))));
    };

    const createSuggestedSliderControls = ({
      value,
      suggested,
      step,
      inputMin = null,
      inputMax = null,
      onCommit,
    }) => {
      const controls = document.createElement('div');
      controls.className = 'helios-ui-slider-controls';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'helios-ui-slider';
      slider.min = String(suggested[0]);
      slider.max = String(suggested[1]);
      slider.step = String(step);

      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'helios-ui-number';
      input.step = String(step);
      if (inputMin != null) input.min = String(inputMin);
      else input.removeAttribute('min');
      if (inputMax != null) input.max = String(inputMax);
      else input.removeAttribute('max');

      const set = (next) => {
        const n = Number(next);
        if (!Number.isFinite(n)) return;
        const min = Number(slider.min);
        const max = Number(slider.max);
        const clamped = Math.max(min, Math.min(max, n));
        slider.value = String(clamped);
        input.value = String(n);
        updateSliderVisual(slider);
      };

      set(value);

      slider.addEventListener('input', () => {
        input.value = String(slider.value);
        updateSliderVisual(slider);
        onCommit?.(slider.value);
      });
      input.addEventListener('change', () => {
        set(input.value);
        onCommit?.(input.value);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          set(input.value);
          onCommit?.(input.value);
          input.blur();
        }
      });

      controls.appendChild(slider);
      controls.appendChild(input);
      return { element: controls, slider, input, set };
    };

    const createTwoHandleRange = ({ min, max, value, step, onChange, allowRangeDrag = true }) => {
      const wrap = document.createElement('div');
      wrap.className = 'helios-ui-range2';

      const track = document.createElement('div');
      track.className = 'helios-ui-range2__track';
      const bar = document.createElement('div');
      bar.className = 'helios-ui-range2__bar';
      const rangeEl = document.createElement('div');
      rangeEl.className = 'helios-ui-range2__range';
      track.appendChild(bar);
      track.appendChild(rangeEl);

      const aInput = document.createElement('input');
      aInput.type = 'range';
      aInput.className = 'helios-ui-slider helios-ui-range2__input';
      const bInput = document.createElement('input');
      bInput.type = 'range';
      bInput.className = 'helios-ui-slider helios-ui-range2__input';

      const syncRanges = () => {
        aInput.min = String(min);
        aInput.max = String(max);
        aInput.step = String(step);
        bInput.min = String(min);
        bInput.max = String(max);
        bInput.step = String(step);
      };
      syncRanges();

      const clampTo = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const snappedMin = Math.abs(n - min) <= step / 2 ? min : n;
        const snappedMax = Math.abs(snappedMin - max) <= step / 2 ? max : snappedMin;
        return Math.max(min, Math.min(max, snappedMax));
      };

      const setVisual = (lo, hi) => {
        const span = max - min;
        const loPct = span === 0 ? 0 : ((lo - min) / span) * 100;
        const hiPct = span === 0 ? 100 : ((hi - min) / span) * 100;
        track.style.setProperty('--min-pct', String(Math.max(0, Math.min(100, loPct))));
        track.style.setProperty('--max-pct', String(Math.max(0, Math.min(100, hiPct))));
      };

      const commitBoth = (lo, hi) => {
        const nextLo = clampTo(lo);
        const nextHi = clampTo(hi);
        if (nextLo == null || nextHi == null) return;
        const orderedLo = Math.min(nextLo, nextHi);
        const orderedHi = Math.max(nextLo, nextHi);
        aInput.value = String(orderedLo);
        bInput.value = String(orderedHi);
        setVisual(orderedLo, orderedHi);
        onChange?.([orderedLo, orderedHi]);
      };

      const seedLo = clampTo(value?.[0] ?? min) ?? min;
      const seedHi = clampTo(value?.[1] ?? max) ?? max;
      const lo0 = Math.min(seedLo, seedHi);
      const hi0 = Math.max(seedLo, seedHi);
      aInput.value = String(lo0);
      bInput.value = String(hi0);
      setVisual(lo0, hi0);

      const commit = (source) => {
        const a = clampTo(aInput.value);
        const b = clampTo(bInput.value);
        if (a == null || b == null) return;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        // Keep thumbs from crossing visually.
        if (source === 'a' && a > hi) aInput.value = String(hi);
        if (source === 'b' && b < lo) bInput.value = String(lo);
        setVisual(lo, hi);
        onChange?.([lo, hi]);
      };

      // Dragging the highlighted range pans both thumbs together.
      const onRangePointerDown = (event) => {
        // Only handle primary pointer interactions.
        if (event.button != null && event.button !== 0) return;
        event.preventDefault();

        const rect = track.getBoundingClientRect();
        const widthPx = Math.max(1, rect.width);
        const domainSpan = max - min;
        if (!Number.isFinite(domainSpan) || Math.abs(domainSpan) < 1e-9) return;

        const startX = event.clientX;
        const startA = clampTo(aInput.value) ?? min;
        const startB = clampTo(bInput.value) ?? max;
        const startLo = Math.min(startA, startB);
        const startHi = Math.max(startA, startB);
        const rangeSpan = startHi - startLo;

        const clampRangeToBounds = (lo, hi) => {
          let nextLo = lo;
          let nextHi = hi;
          if (nextLo < min) {
            const shift = min - nextLo;
            nextLo = min;
            nextHi += shift;
          }
          if (nextHi > max) {
            const shift = nextHi - max;
            nextHi = max;
            nextLo -= shift;
          }
          // If span is larger than domain (shouldn't happen), fall back.
          if (nextLo < min) nextLo = min;
          if (nextHi > max) nextHi = max;
          // Preserve original span when possible.
          if (Number.isFinite(rangeSpan) && rangeSpan >= 0) {
            const currentSpan = nextHi - nextLo;
            if (currentSpan !== rangeSpan) {
              nextHi = Math.min(max, nextLo + rangeSpan);
              nextLo = Math.max(min, nextHi - rangeSpan);
            }
          }
          return [nextLo, nextHi];
        };

        const onMove = (moveEvent) => {
          const dx = moveEvent.clientX - startX;
          const delta = (dx / widthPx) * domainSpan;
          if (!Number.isFinite(delta)) return;
          const [nextLo, nextHi] = clampRangeToBounds(startLo + delta, startHi + delta);
          commitBoth(nextLo, nextHi);
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      };
      if (allowRangeDrag) {
        rangeEl.addEventListener('pointerdown', onRangePointerDown);
      }

      aInput.style.zIndex = '2';
      bInput.style.zIndex = '3';
      aInput.addEventListener('input', () => commit('a'));
      bInput.addEventListener('input', () => commit('b'));

      track.appendChild(aInput);
      track.appendChild(bInput);
      wrap.appendChild(track);

      return { element: wrap, setVisual: (lo, hi) => setVisual(lo, hi), aInput, bInput };
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
      this._controlCleanups.add(() => editorStack.destroy());

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

        // If the editor can't fully represent the config, treat it as a custom mapper.
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
              if (state.channel === 'width' || state.channel === 'opacity' || state.channel === 'endpointSize') {
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
          channel === 'opacity' ||
          channel === 'endpointSize';
        if (mode === 'edge' && isColor) return ['constant', 'passthrough', 'nodeAttribute', 'colormap'];
        if (mode === 'edge' && isScalar) return ['constant', 'passthrough', 'nodeAttribute', 'linear'];
        if (isColor) return ['constant', 'passthrough', 'colormap'];
        if (isScalar) return ['constant', 'passthrough', 'linear'];
        // MVP: other channels are passthrough only.
        return ['passthrough'];
      };

      const renderEditor = () => {
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

        // Decide current selection first, registering custom presets before building the dropdown.
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

          // If live is custom but pending isn't set yet, ensure the live custom preset exists.
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
          if (nextType === 'passthrough') {
            // nothing else
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

        editorBody.appendChild(createAlignedRowEl({ title: 'Type', controls: typeSelect }).row);

        const pendingTypeKey = typeSelect.value;
        const pendingType = pendingTypeKey.startsWith('custom:') ? 'custom' : pendingTypeKey;
        const isColor = state.channel === 'color' || state.channel === 'outlineColor';
        const isScalar =
          state.channel === 'size' ||
          state.channel === 'outline' ||
          state.channel === 'width' ||
          state.channel === 'opacity' ||
          state.channel === 'endpointSize';
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
          editorBody.appendChild(createAlignedRowEl({ title: 'Description', controls: descEl }).row);

          const srcEl = document.createElement('div');
          srcEl.style.whiteSpace = 'pre-wrap';
          srcEl.style.color = 'var(--helios-ui-muted)';
          srcEl.textContent = source || '—';
          editorBody.appendChild(createAlignedRowEl({ title: 'Source', controls: srcEl }).row);
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
          editorBody.appendChild(createAlignedRowEl({ title: 'Attribute', controls: attrSelect }).row);
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
          editorBody.appendChild(createAlignedRowEl({ title: 'From/To', controls: attrSelect }).row);
        }

        if (pendingType === 'constant' && isScalar) {
          const wrap = document.createElement('div');
          wrap.style.display = 'grid';
          wrap.style.gap = '6px';
          wrap.style.width = '100%';

          const minAllowed = (() => {
            if (state.channel === 'opacity') return 0;
            if (state.channel === 'size' || state.channel === 'outline' || state.channel === 'width' || state.channel === 'endpointSize') return 0;
            return null;
          })();
          const maxAllowed = state.channel === 'opacity' ? 1 : null;

          const [suggestMin, suggestMax] = suggestRangeForChannel(mode, state.channel);
          const step = suggestStepForRange(suggestMin, suggestMax);

          const isEdgeSplitCapable = mode === 'edge' && (state.channel === 'width' || state.channel === 'opacity' || state.channel === 'endpointSize');
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

          if (isSplit) {
            const labelStyle = (el) => {
              el.style.fontSize = '12px';
              el.style.color = 'var(--helios-ui-muted)';
            };

            const sourceLabel = document.createElement('div');
            sourceLabel.textContent = 'Source';
            labelStyle(sourceLabel);
            wrap.appendChild(sourceLabel);

            const srcSeed = Number(pendingValue?.source ?? pendingValue?.start ?? 1);
            const srcValue = Number.isFinite(srcSeed) ? srcSeed : 1;
            wrap.appendChild(createSuggestedSliderControls({
              value: srcValue,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v, 'source'),
            }).element);

            const targetLabel = document.createElement('div');
            targetLabel.textContent = 'Target';
            labelStyle(targetLabel);
            wrap.appendChild(targetLabel);

            const dstSeed = Number(pendingValue?.target ?? pendingValue?.end ?? srcValue);
            const dstValue = Number.isFinite(dstSeed) ? dstSeed : srcValue;
            wrap.appendChild(createSuggestedSliderControls({
              value: dstValue,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v, 'target'),
            }).element);
          } else {
            const fallbackValue = Number.isFinite(Number(live?.value)) ? Number(live.value) : 1;
            const seeded = Number.isFinite(Number(state.pending.value)) ? Number(state.pending.value) : fallbackValue;
            if (!Number.isFinite(Number(state.pending.value))) {
              state.pending = { ...state.pending, type: 'constant', value: seeded };
            }
            wrap.appendChild(createSuggestedSliderControls({
              value: seeded,
              suggested: [suggestMin, suggestMax],
              step,
              inputMin: minAllowed,
              inputMax: maxAllowed,
              onCommit: (v) => commit(v),
            }).element);
          }

          editorBody.appendChild(createAlignedRowEl({ title: 'Value', controls: wrap }).row);
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
          editorBody.appendChild(createAlignedRowEl({ title: 'Value', controls: wrap }).row);
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
            editorBody.appendChild(createAlignedRowEl({ title: 'Color', controls: wrap }).row);
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
            editorBody.appendChild(createAlignedRowEl({ title: 'Color', controls: wrap }).row);
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
          editorBody.appendChild(createAlignedRowEl({ title: 'Attribute', controls: attrSelect }).row);

          const transformWrap = document.createElement('div');
          transformWrap.style.display = 'flex';
          transformWrap.style.gap = '8px';
          transformWrap.style.alignItems = 'center';

          const transformSelect = document.createElement('select');
          transformSelect.className = 'helios-ui-select';
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
          powerInput.value = String(Number.isFinite(Number(state.pending.transformPower)) ? state.pending.transformPower : 1);
          powerInput.hidden = transformSelect.value !== 'power';

          transformSelect.addEventListener('change', () => {
            const nextType = transformSelect.value || 'linear';
            const prevType = state.pending.transformType ?? 'linear';
            powerInput.hidden = nextType !== 'power';
            const nextPending = { ...state.pending, type: 'linear', transformType: nextType };
            if (isPercentileTransform(nextType)) {
              nextPending.domain = [0, 1];
            } else if (isPercentileTransform(prevType)) {
              const attr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
              nextPending.domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
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
          editorBody.appendChild(createAlignedRowEl({ title: 'Transform', controls: transformWrap }).row);

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
            state.pending = { ...state.pending, type: 'linear', domain: [0, 1] };
          } else if (!Array.isArray(state.pending.domain) && domainAttr) {
            state.pending = { ...state.pending, type: 'linear', domain: [min, max] };
          }
          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : [min, max];

          const slider = createTwoHandleRange({
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
          editorBody.appendChild(createAlignedRowEl({ title: 'Domain', controls: domainWrap }).row);

          const rangeWrap = document.createElement('div');
          rangeWrap.style.display = 'grid';
          rangeWrap.style.gap = '6px';
          rangeWrap.style.width = '100%';

          const minAllowed = (() => {
            if (state.channel === 'opacity') return 0;
            if (state.channel === 'size' || state.channel === 'outline' || state.channel === 'width' || state.channel === 'endpointSize') return 0;
            return null;
          })();
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
          rangeWrap.appendChild(createSuggestedSliderControls({
            value: Number(range[0] ?? suggestedRange[0]),
            suggested: [suggestedRange[0], suggestedRange[1]],
            step: stepOut,
            inputMin: minAllowed,
            inputMax: maxAllowed,
            onCommit: (v) => commitRangeAt(0, v),
          }).element);

          const maxLabel = document.createElement('div');
          maxLabel.textContent = 'Max';
          labelStyle(maxLabel);
          rangeWrap.appendChild(maxLabel);
          rangeWrap.appendChild(createSuggestedSliderControls({
            value: Number(range[1] ?? suggestedRange[1]),
            suggested: [suggestedRange[0], suggestedRange[1]],
            step: stepOut,
            inputMin: minAllowed,
            inputMax: maxAllowed,
            onCommit: (v) => commitRangeAt(1, v),
          }).element);

          editorBody.appendChild(createAlignedRowEl({ title: 'Range', controls: rangeWrap }).row);
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
          editorBody.appendChild(createAlignedRowEl({ title: 'Attribute', controls: attrSelect }).row);

          const transformWrap = document.createElement('div');
          transformWrap.style.display = 'flex';
          transformWrap.style.gap = '8px';
          transformWrap.style.alignItems = 'center';

          const transformSelect = document.createElement('select');
          transformSelect.className = 'helios-ui-select';
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
          powerInput.value = String(Number.isFinite(Number(state.pending.transformPower)) ? state.pending.transformPower : 1);
          powerInput.hidden = transformSelect.value !== 'power';

          transformSelect.addEventListener('change', () => {
            const nextType = transformSelect.value || 'linear';
            const prevType = state.pending.transformType ?? 'linear';
            powerInput.hidden = nextType !== 'power';
            const nextPending = { ...state.pending, type: 'colormap', transformType: nextType };
            if (isPercentileTransform(nextType)) {
              nextPending.domain = [0, 1];
            } else if (isPercentileTransform(prevType)) {
              const attr = typeof state.pending.attributes === 'string' ? state.pending.attributes : null;
              nextPending.domain = attr ? suggestDomainForAttribute(mode, attr) : [0, 1];
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
          editorBody.appendChild(createAlignedRowEl({ title: 'Transform', controls: transformWrap }).row);

          const nameWrap = document.createElement('div');
          nameWrap.style.display = 'grid';
          nameWrap.style.gap = '6px';
          const colormapInput = document.createElement('input');
          colormapInput.type = 'text';
          colormapInput.className = 'helios-ui-text';
          colormapInput.placeholder = 'interpolateInferno';
          colormapInput.value = String(state.pending.colormap ?? 'interpolateInferno');

          const datalistId = `helios-ui-colormap-datalist-${Math.random().toString(16).slice(2)}`;
          const datalist = document.createElement('datalist');
          datalist.id = datalistId;
          for (const name of colormapNames) {
            const opt = document.createElement('option');
            opt.value = name;
            datalist.appendChild(opt);
          }
          colormapInput.setAttribute('list', datalistId);
          nameWrap.appendChild(colormapInput);
          nameWrap.appendChild(datalist);

          colormapInput.addEventListener('change', () => {
            state.pending = { ...state.pending, type: 'colormap', colormap: colormapInput.value || 'interpolateInferno' };
            setDirty(true);
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'Colormap', controls: nameWrap }).row);

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
            state.pending = { ...state.pending, type: 'colormap', domain: [0, 1] };
          } else if (!Array.isArray(state.pending.domain) && domainAttr) {
            const nextDomain = divergent ? resolveDivergentDomain([min, max], extent) : [min, max];
            state.pending = { ...state.pending, type: 'colormap', domain: nextDomain };
          } else if (divergent && Array.isArray(state.pending.domain)) {
            state.pending = { ...state.pending, type: 'colormap', domain: resolveDivergentDomain(state.pending.domain, extent) };
          }

          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : (divergent ? resolveDivergentDomain([min, max], extent) : [min, max]);

          const slider = createTwoHandleRange({
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
            state.pending = { ...state.pending, type: 'colormap', domain: nextDomain };
            setDirty(true);
            d0.value = String(nextDomain[0]);
              d1.value = String(nextDomain[1]);
              if (divergent) {
                slider.aInput.value = String(nextDomain[0]);
                slider.bInput.value = String(nextDomain[1]);
                slider.setVisual(nextDomain[0], nextDomain[1]);
              }
            },
          });

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
            state.pending = { ...state.pending, type: 'colormap', domain: nextDomain };
            setDirty(true);
            d0.value = String(nextDomain[0]);
            d1.value = String(nextDomain[1]);
          };
          d0.addEventListener('change', commitDomainTyped);
          d1.addEventListener('change', commitDomainTyped);

          values.appendChild(d0);
          values.appendChild(d1);
          domainWrap.appendChild(slider.element);
          domainWrap.appendChild(values);
          editorBody.appendChild(createAlignedRowEl({
            title: 'Domain',
            controls: domainWrap,
            hint: percentile
              ? 'Percentile range used to map values into the colormap (0 to 1).'
              : (divergent
                ? 'Symmetric range around zero used for divergent colormaps.'
                : 'Input range used to map values into the colormap (min/max).'),
          }).row);

          const advanced = document.createElement('div');
          const divergentWrap = document.createElement('label');
          divergentWrap.style.display = 'inline-flex';
          divergentWrap.style.alignItems = 'center';
          divergentWrap.style.gap = '6px';
          const divergentInput = document.createElement('input');
          divergentInput.type = 'checkbox';
          divergentInput.checked = Boolean(state.pending.divergent) && allowDivergent;
          divergentInput.disabled = !allowDivergent;
          divergentInput.style.margin = '0';
          const divergentText = document.createElement('span');
          divergentText.textContent = 'Divergent';
          divergentText.style.color = 'var(--helios-ui-muted)';
          divergentWrap.appendChild(divergentInput);
          divergentWrap.appendChild(divergentText);

          const clampWrap = document.createElement('div');
          clampWrap.style.display = 'inline-flex';
          clampWrap.style.alignItems = 'center';
          clampWrap.style.gap = '10px';
          const clampState = normalizeClampSetting(state.pending.clamp);
          const clampMinInput = document.createElement('input');
          clampMinInput.type = 'checkbox';
          clampMinInput.checked = clampState.min;
          clampMinInput.style.margin = '0';
          const clampMinLabel = document.createElement('span');
          clampMinLabel.textContent = 'Min';
          clampMinLabel.style.color = 'var(--helios-ui-muted)';
          const clampMaxInput = document.createElement('input');
          clampMaxInput.type = 'checkbox';
          clampMaxInput.checked = clampState.max;
          clampMaxInput.style.margin = '0';
          const clampMaxLabel = document.createElement('span');
          clampMaxLabel.textContent = 'Max';
          clampMaxLabel.style.color = 'var(--helios-ui-muted)';

          const clampMinWrap = document.createElement('label');
          clampMinWrap.style.display = 'inline-flex';
          clampMinWrap.style.alignItems = 'center';
          clampMinWrap.style.gap = '4px';
          clampMinWrap.appendChild(clampMinInput);
          clampMinWrap.appendChild(clampMinLabel);

          const clampMaxWrap = document.createElement('label');
          clampMaxWrap.style.display = 'inline-flex';
          clampMaxWrap.style.alignItems = 'center';
          clampMaxWrap.style.gap = '4px';
          clampMaxWrap.appendChild(clampMaxInput);
          clampMaxWrap.appendChild(clampMaxLabel);

          clampWrap.appendChild(clampMinWrap);
          clampWrap.appendChild(clampMaxWrap);

          const alphaSeed = clampNumber(state.pending.alpha ?? 1, { min: 0, max: 1 }) ?? 1;
          const alphaControls = createSuggestedSliderControls({
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
            state.pending = { ...state.pending, type: 'colormap', divergent: nextDivergent, domain: nextDomain };
            setDirty(true);
            renderEditor();
          });

          advanced.appendChild(createAlignedRowEl({
            title: 'Divergent',
            controls: divergentWrap,
            hint: allowDivergent
              ? 'Lock the domain to a symmetric range around zero (for divergent colormaps).'
              : 'Divergent mode is unavailable for percentile transforms.',
          }).row);

          advanced.appendChild(createAlignedRowEl({
            title: 'Clamp',
            controls: clampWrap,
            hint: 'Clamp values outside the domain to the nearest end of the colormap.',
          }).row);

          advanced.appendChild(createAlignedRowEl({ title: 'Alpha', controls: alphaControls.element }).row);

          const advancedStack = new PanelStack();
          advancedStack.add({ id: `${mode}-mapper-advanced`, title: 'Advanced', collapsed: true, content: advanced });
          editorBody.appendChild(advancedStack.element);
          this._controlCleanups.add(() => advancedStack.destroy());
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

    return this.createTabbedPanel({
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
    });
  }

  createLayoutPanel(options = {}) {
    return new LayoutPanel(this, options).create();
  }
}
