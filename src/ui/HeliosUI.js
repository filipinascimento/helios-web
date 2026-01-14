import { PanelManager } from './panels/PanelManager.js';
import { UIAttribute } from './state/UIAttribute.js';
import { ensureDefaultStyles } from './style/defaultStyles.js';
import { createSliderRow } from './controls/createSliderRow.js';
import { PanelStack } from './panels/PanelStack.js';
import { TabbedPanel } from './panels/TabbedPanel.js';
import { colormaps } from '../colors/colormaps.js';
import { VISUAL_ATTRIBUTE_MAP } from '../pipeline/constants.js';

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

function createTooltipManager() {
  const cleanups = new Set();

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

    cleanups.add(cleanup);
    return cleanup;
  };

  return {
    attachTooltip,
    destroy() {
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    },
  };
}

function createAlignedRowEl({ title, hint, controls, attachTooltip }) {
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
  if (hint) attachTooltip?.(titleEl, hint);

  row.appendChild(label);
  const controlWrap = document.createElement('div');
  controlWrap.className = 'helios-ui-row__controls';
  if (controls) controlWrap.appendChild(controls);
  row.appendChild(controlWrap);
  return { row, titleEl, controlWrap };
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

function clampNumber(value, { min = null, max = null } = {}) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (min != null && v < min) return min;
  if (max != null && v > max) return max;
  return v;
}

function hexToRgb01(hex) {
  if (typeof hex !== 'string') return null;
  const raw = hex.trim().replace(/^#/, '');
  const expand = (c) => `${c}${c}`;
  let r; let g; let b;
  if (raw.length === 3) {
    r = parseInt(expand(raw[0]), 16);
    g = parseInt(expand(raw[1]), 16);
    b = parseInt(expand(raw[2]), 16);
  } else if (raw.length >= 6) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  } else {
    return null;
  }
  if (![r, g, b].every(Number.isFinite)) return null;
  return [r / 255, g / 255, b / 255];
}

function toHex8(hex6, alpha01 = 1) {
  const rgb = hexToRgb01(hex6);
  if (!rgb) return '#000000ff';
  const a = Math.round(Math.max(0, Math.min(1, Number(alpha01))) * 255);
  const aa = a.toString(16).padStart(2, '0');
  const raw = String(hex6).trim();
  const base = raw.startsWith('#') ? raw.slice(1) : raw;
  const normalized = base.length === 3
    ? base.split('').map((c) => `${c}${c}`).join('')
    : base.slice(0, 6).padEnd(6, '0');
  return `#${normalized}${aa}`;
}

function shallowCloneChannelConfig(config) {
  if (!config) return null;
  return {
    ...config,
    attributes: config.attributes ?? config.from,
    domain: Array.isArray(config.domain) ? [...config.domain] : config.domain,
    range: Array.isArray(config.range) ? [...config.range] : config.range,
    rules: Array.isArray(config.rules) ? config.rules.map((r) => ({ ...r })) : [],
  };
}

function summarizeChannelConfig(config) {
  if (!config) return '—';
  const type = config.type ?? config.mode ?? 'custom';
  const attr = config.attributes ?? config.from;
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
    const attribute = UIAttribute.number({
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
    this._boundAttributesById.set(id, attribute);
    this._ensureHeliosBindingListener();
    return attribute;
  }

  createPanel(options) {
    return this.panelManager.createPanel(options);
  }

  createTabbedPanel(options = {}) {
    const tabs = new TabbedPanel({ tabs: options.tabs ?? [], activeId: options.activeId });
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

      const stack = new PanelStack();
      stack.add({
        id: 'network-io',
        title: 'Network',
        content: networkControls,
      });
      stack.add({
        id: 'node-appearance',
        title: 'Nodes',
        content: (() => {
          const wrapper = document.createElement('div');
          wrapper.appendChild(themeRow);
          wrapper.appendChild(createRows(['nodeSizeScale', 'nodeOpacityScale', 'nodeOutlineWidthScale']));
          return wrapper;
        })(),
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
        content: createRows([
          'nodeSizeBase',
          'nodeOpacityBase',
          'nodeOutlineWidthBase',
          'edgeWidthBase',
          'edgeOpacityBase',
          'edgeEndpointTrim',
        ]),
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

    // --- Leiden --------------------------------------------------------------
    const leiden = document.createElement('div');

    const weightSelect = document.createElement('select');
    weightSelect.className = 'helios-ui-select';
    weightSelect.dataset.testid = 'metrics-leiden-weight';

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
    maxPassesInput.value = String(options?.leiden?.maxPasses ?? 8);
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

    // --- State + wiring ------------------------------------------------------
    let running = false;
    let abortController = null;

    const setStatus = (text) => {
      const next = text ?? '';
      statusEl.textContent = next;
    };

    const setProgress = (current, total) => {
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(current) || current < 0) {
        progressEl.removeAttribute('value');
        progressPct.textContent = '—';
        return;
      }
      const pct = Math.max(0, Math.min(1, current / total));
      progressEl.value = pct;
      progressPct.textContent = `${Math.round(pct * 100)}%`;
    };

    const setRunning = (nextRunning) => {
      running = Boolean(nextRunning);
      setDisabled(calcButton, running);
      setDisabled(cancelButton, !running);
      setDisabled(weightSelect, running);
      setDisabled(resolutionInput, running);
      setDisabled(resolutionRow.slider, running);
      setDisabled(seedInput, running);
      setDisabled(seedRow.slider, running);
      setDisabled(maxLevelsInput, running);
      setDisabled(levelsRow.slider, running);
      setDisabled(maxPassesInput, running);
      setDisabled(passesRow.slider, running);
      setDisabled(outAttributeInput, running);
      setDisabled(yieldMsInput, running);
      setDisabled(timeoutMsInput, running);
      setDisabled(chunkBudgetInput, running);
    };

    const refreshEdgeWeightOptions = () => {
      const network = net();
      const existing = weightSelect.value;
      weightSelect.textContent = '';
      const optNone = document.createElement('option');
      optNone.value = '';
      optNone.textContent = 'None';
      weightSelect.appendChild(optNone);
      if (network && typeof network.getEdgeAttributeNames === 'function') {
        const names = network.getEdgeAttributeNames() ?? [];
        for (const name of names) {
          const opt = document.createElement('option');
          opt.value = name;
          opt.textContent = name;
          weightSelect.appendChild(opt);
        }
      }
      weightSelect.value = existing && Array.from(weightSelect.options).some((o) => o.value === existing) ? existing : '';
    };

    const refreshAll = () => {
      refreshEdgeWeightOptions();
    };

    const cancelRun = () => {
      if (!abortController) return;
      abortController.abort();
    };

    cancelButton.addEventListener('click', cancelRun);

    const runLeiden = async () => {
      const network = net();
      if (!network || typeof network.createLeidenSession !== 'function') {
        setStatus('Leiden is not available on this network');
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

      setStatus('Starting…');
      setProgress(0, 1);
      modularityValue.textContent = '—';
      communityValue.textContent = '—';
      elapsedValue.textContent = '—';
      setRunning(true);
      abortController = new AbortController();

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
          signal: abortController.signal,
          yieldMs,
          stepOptions: { timeoutMs, chunkBudget },
          onProgress: (progress) => {
            if (!progress) return;
            setProgress(progress.progressCurrent, progress.progressTotal);
            const phase = progress.phase ?? 0;
            const level = progress.level ?? 0;
            const maxL = progress.maxLevels ?? 0;
            const pass = progress.pass ?? 0;
            const maxP = progress.maxPasses ?? 0;
            const communities = progress.communityCount ?? 0;
            setStatus(`Running… phase ${phase} • level ${level}/${maxL} • pass ${pass}/${maxP} • k=${communities}`);
          },
        });

        const ended = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const elapsedMs = Math.max(0, ended - started);
        setProgress(1, 1);
        setStatus(`Done • wrote "${outNodeCommunityAttribute}"`);
        modularityValue.textContent = formatNumber(result?.modularity ?? NaN, 6);
        communityValue.textContent = String(result?.communityCount ?? '—');
        elapsedValue.textContent = `${Math.round(elapsedMs)} ms`;
        refreshAll();
        this.helios?.requestRender?.();
      } catch (error) {
        const message = error?.message ?? String(error);
        const aborted = abortController?.signal?.aborted || message.toLowerCase().includes('aborted') || message.toLowerCase().includes('canceled');
        if (aborted) {
          setStatus('Canceled');
        } else {
          setStatus(message);
        }
      } finally {
        abortController = null;
        setRunning(false);
      }
    };

    calcButton.addEventListener('click', () => {
      if (running) return;
      runLeiden();
    });

    refreshAll();

    // Status is rendered under the Progress bar.

    const stack = new PanelStack();
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
    content.appendChild(stack.element);
    this._controlCleanups.add(() => stack.destroy());
    this._controlCleanups.add(() => leidenInnerStack.destroy());

    this._controlCleanups.add(() => {
      for (const cleanup of tooltipCleanups) cleanup();
      tooltipCleanups.clear();
    });

    // Refresh on network changes (and cancel any in-flight run).
    const onNetworkReplaced = () => {
      cancelRun();
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
    const helios = this.helios;
    const network = helios?.network ?? null;

    const nodeChannels = ['color', 'size', 'outline', 'outlineColor', 'position'];
    const edgeChannels = ['color', 'width', 'opacity', 'endpointPosition', 'endpointSize'];

    const colormapNames = collectColormapSuggestionNames();

    const isHexColorString = (value) => {
      if (typeof value !== 'string') return false;
      const hex = value.trim();
      return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex);
    };

    const isNumericAttributeType = (type) => typeof type === 'number';

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
        if (name.startsWith('__')) continue;
        if (name.startsWith('_helios_') || name.startsWith('_helios')) continue;
        out.push(name);
      }

      // For edge mappers, allow selecting node endpoint values with @node.*.
      if (scope === 'edge' && typeof network.getNodeAttributeNames === 'function') {
        const nodeRaw = network.getNodeAttributeNames() ?? [];
        for (const name of nodeRaw) {
          if (typeof name !== 'string') continue;
          if (name.startsWith('__')) continue;
          if (name.startsWith('_helios_') || name.startsWith('_helios')) continue;
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

      const channelSelect = document.createElement('select');
      channelSelect.className = 'helios-ui-select';
      for (const name of channels) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        channelSelect.appendChild(opt);
      }
      if (!channels.includes(state.channel)) state.channel = channels[0];
      channelSelect.value = state.channel;

      const channelRowControls = document.createElement('div');
      channelRowControls.style.display = 'grid';
      channelRowControls.style.gap = '6px';
      channelRowControls.appendChild(channelSelect);

      root.appendChild(createAlignedRowEl({ title: 'Channel', controls: channelRowControls }).row);

      const summaryEl = document.createElement('div');
      summaryEl.className = 'helios-ui-ellipsis';
      summaryEl.style.color = 'var(--helios-ui-muted)';
      summaryEl.style.fontSize = '11.5px';
      summaryEl.style.marginTop = '-4px';
      root.appendChild(summaryEl);

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

        const type = state.pending.type ?? 'passthrough';

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

        return true;
      };

      const syncApplyEnabled = () => {
        applyButton.disabled = !canApplyPending();
      };

      const setDirty = (dirty) => {
        state.dirty = Boolean(dirty);
        syncApplyEnabled();
      };

      const syncSummary = () => {
        if (mode === 'node' && state.channel === 'position') {
          const scheduler = helios?.scheduler ?? null;
          const hasLayout = Boolean(scheduler?.layout);
          const layoutEnabled = hasLayout && scheduler?.layoutEnabled !== false;
          if (layoutEnabled) {
            summaryEl.textContent = 'Current: layout';
            return;
          }
        }
        const live = resolveLiveConfig(mode, state.channel);
        summaryEl.textContent = `Current: ${summarizeChannelConfig(live)}`;
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
        syncSummary();
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
        const typeSelect = document.createElement('select');
        typeSelect.className = 'helios-ui-select';
        for (const t of allowedTypes) {
          const opt = document.createElement('option');
          opt.value = t;
          opt.textContent = t;
          typeSelect.appendChild(opt);
        }
        const currentType = state.pending.type ?? live?.type ?? allowedTypes[0];
        typeSelect.value = allowedTypes.includes(currentType) ? currentType : allowedTypes[0];

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
            base.domain = Array.isArray(prev.domain) ? prev.domain : (Array.isArray(live?.domain) ? live.domain : [0, 1]);
            base.range = Array.isArray(prev.range) ? prev.range : (Array.isArray(live?.range) ? live.range : [0, 1]);
          }
          if (nextType === 'colormap') {
            base.colormap = prev.colormap ?? live?.colormap ?? 'interpolateInferno';
            base.domain = Array.isArray(prev.domain) ? prev.domain : (Array.isArray(live?.domain) ? live.domain : [0, 1]);
            base.alpha = prev.alpha ?? live?.alpha ?? 1;
            base.clamp = prev.clamp ?? live?.clamp ?? true;
          }
          state.pending = base;
          setDirty(true);
          renderEditor();
        };

        typeSelect.addEventListener('change', () => {
          setPendingType(typeSelect.value);
        });

        editorBody.appendChild(createAlignedRowEl({ title: 'Type', controls: typeSelect }).row);

        const pendingType = typeSelect.value;
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
          const input = document.createElement('input');
          input.type = 'number';
          input.className = 'helios-ui-number';
          const fallbackValue = Number.isFinite(live?.value) ? live.value : 1;
          const seeded = Number.isFinite(state.pending.value) ? state.pending.value : fallbackValue;
          if (!Number.isFinite(state.pending.value)) {
            state.pending = { ...state.pending, type: 'constant', value: seeded };
          }
          input.value = String(seeded);
          input.addEventListener('change', () => {
            const v = clampNumber(input.value);
            if (v == null) return;
            state.pending = { ...state.pending, type: 'constant', value: v };
            setDirty(true);
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'Value', controls: input }).row);
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
          wrap.style.display = 'flex';
          wrap.style.gap = '8px';
          wrap.style.alignItems = 'center';

          const colorInput = document.createElement('input');
          colorInput.type = 'color';

          const alphaInput = document.createElement('input');
          alphaInput.type = 'number';
          alphaInput.className = 'helios-ui-number';
          alphaInput.min = '0';
          alphaInput.max = '1';
          alphaInput.step = '0.01';
          alphaInput.style.maxWidth = '88px';
          alphaInput.title = 'Alpha (0–1)';

          const alphaLabel = document.createElement('span');
          alphaLabel.textContent = 'Alpha (0–1)';
          alphaLabel.style.color = 'var(--helios-ui-muted)';

          if (!(typeof state.pending.value === 'string' && state.pending.value.length > 0)) {
            const seed = typeof live?.value === 'string' && live.value.length > 0 ? live.value : '#ffffff';
            state.pending = { ...state.pending, type: 'constant', value: seed };
          }

          const liveValue = state.pending.value ?? live?.value ?? '#ffffff';
          const liveColor = typeof liveValue === 'string' ? liveValue : '#ffffff';
          const raw = liveColor.startsWith('#') ? liveColor.slice(1) : liveColor;
          const baseHex = raw.length >= 6 ? `#${raw.slice(0, 6)}` : '#ffffff';
          const alphaHex = raw.length === 8 ? raw.slice(6, 8) : 'ff';
          const alpha = Math.round(parseInt(alphaHex, 16) / 255 * 100) / 100;

          colorInput.value = baseHex;
          alphaInput.value = String(Number.isFinite(alpha) ? alpha : 1);

          const commit = () => {
            const a = clampNumber(alphaInput.value, { min: 0, max: 1 });
            if (a == null) return;
            state.pending = { ...state.pending, type: 'constant', value: toHex8(colorInput.value, a) };
            setDirty(true);
          };
          colorInput.addEventListener('input', commit);
          alphaInput.addEventListener('change', commit);

          wrap.appendChild(colorInput);
          wrap.appendChild(alphaLabel);
          wrap.appendChild(alphaInput);
          editorBody.appendChild(createAlignedRowEl({ title: 'Color', controls: wrap }).row);
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
            state.pending = { ...state.pending, type: 'linear', attributes: attrSelect.value || undefined };
            setDirty(true);
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'Attribute', controls: attrSelect }).row);

          const domainWrap = document.createElement('div');
          domainWrap.style.display = 'flex';
          domainWrap.style.gap = '8px';

          const d0 = document.createElement('input');
          d0.type = 'number';
          d0.className = 'helios-ui-number';
          const d1 = document.createElement('input');
          d1.type = 'number';
          d1.className = 'helios-ui-number';
          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : [0, 1];
          d0.value = String(domain[0] ?? 0);
          d1.value = String(domain[1] ?? 1);
          const commitDomain = () => {
            const a = clampNumber(d0.value);
            const b = clampNumber(d1.value);
            if (a == null || b == null) return;
            state.pending = { ...state.pending, type: 'linear', domain: [a, b] };
            setDirty(true);
          };
          d0.addEventListener('change', commitDomain);
          d1.addEventListener('change', commitDomain);
          domainWrap.appendChild(d0);
          domainWrap.appendChild(d1);
          editorBody.appendChild(createAlignedRowEl({ title: 'Domain', controls: domainWrap }).row);

          const rangeWrap = document.createElement('div');
          rangeWrap.style.display = 'flex';
          rangeWrap.style.gap = '8px';
          const r0 = document.createElement('input');
          r0.type = 'number';
          r0.className = 'helios-ui-number';
          const r1 = document.createElement('input');
          r1.type = 'number';
          r1.className = 'helios-ui-number';
          const range = Array.isArray(state.pending.range) ? state.pending.range : [0, 1];
          r0.value = String(range[0] ?? 0);
          r1.value = String(range[1] ?? 1);
          const commitRange = () => {
            const a = clampNumber(r0.value);
            const b = clampNumber(r1.value);
            if (a == null || b == null) return;
            state.pending = { ...state.pending, type: 'linear', range: [a, b] };
            setDirty(true);
          };
          r0.addEventListener('change', commitRange);
          r1.addEventListener('change', commitRange);
          rangeWrap.appendChild(r0);
          rangeWrap.appendChild(r1);
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
            state.pending = { ...state.pending, type: 'colormap', attributes: attrSelect.value || undefined };
            setDirty(true);
          });
          editorBody.appendChild(createAlignedRowEl({ title: 'Attribute', controls: attrSelect }).row);

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
          domainWrap.style.display = 'flex';
          domainWrap.style.gap = '8px';
          const d0 = document.createElement('input');
          d0.type = 'number';
          d0.className = 'helios-ui-number';
          const d1 = document.createElement('input');
          d1.type = 'number';
          d1.className = 'helios-ui-number';
          const domain = Array.isArray(state.pending.domain) ? state.pending.domain : [0, 1];
          d0.value = String(domain[0] ?? 0);
          d1.value = String(domain[1] ?? 1);
          const commitDomain = () => {
            const a = clampNumber(d0.value);
            const b = clampNumber(d1.value);
            if (a == null || b == null) return;
            state.pending = { ...state.pending, type: 'colormap', domain: [a, b] };
            setDirty(true);
          };
          d0.addEventListener('change', commitDomain);
          d1.addEventListener('change', commitDomain);
          domainWrap.appendChild(d0);
          domainWrap.appendChild(d1);
          editorBody.appendChild(createAlignedRowEl({ title: 'Domain', controls: domainWrap }).row);

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

          const alphaInput = document.createElement('input');
          alphaInput.type = 'number';
          alphaInput.className = 'helios-ui-number';
          alphaInput.min = '0';
          alphaInput.max = '1';
          alphaInput.step = '0.01';
          alphaInput.value = String(clampNumber(state.pending.alpha ?? 1, { min: 0, max: 1 }) ?? 1);

          clampInput.addEventListener('change', () => {
            state.pending = { ...state.pending, type: 'colormap', clamp: clampInput.checked };
            setDirty(true);
          });
          alphaInput.addEventListener('change', () => {
            const a = clampNumber(alphaInput.value, { min: 0, max: 1 });
            if (a == null) return;
            state.pending = { ...state.pending, type: 'colormap', alpha: a };
            setDirty(true);
          });

          advanced.appendChild(createAlignedRowEl({ title: 'Clamp', controls: clampWrap }).row);
          advanced.appendChild(createAlignedRowEl({ title: 'Alpha (0–1)', controls: alphaInput }).row);

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

      channelSelect.addEventListener('change', () => {
        state.channel = channelSelect.value;
        resetPendingFromLive();
      });

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
            syncSummary();
            return;
          }
          if (scheduler && typeof scheduler.setLayoutEnabled === 'function') {
            scheduler.setLayoutEnabled(false, 'ui:mappers');
          }
        }

        const ok = applyConfig(mode, state.channel, state.pending);
        if (ok) {
          setDirty(false);
          syncSummary();
        }
      });

      resetPendingFromLive();
      return root;
    };

    return this.createTabbedPanel({
      id: options.id ?? 'helios-ui-mappers',
      title: options.title ?? 'Mappers',
      position: options.position ?? { x: 16, y: 120 },
      dock: options.dock ?? 'top-left',
      tabs: [
        { id: 'nodes', title: 'Nodes', content: createModeTab('node') },
        { id: 'edges', title: 'Edges', content: createModeTab('edge') },
      ],
    });
  }
}
