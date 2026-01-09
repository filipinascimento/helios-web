import { PanelManager } from './panels/PanelManager.js';
import { UIAttribute } from './state/UIAttribute.js';
import { ensureDefaultStyles } from './style/defaultStyles.js';
import { createSliderRow } from './controls/createSliderRow.js';

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

  createDemoPanel(options = {}) {
    const content = document.createElement('div');

    const themeRow = document.createElement('div');
    themeRow.className = 'helios-ui-row helios-ui-row--aligned';
    const themeLabel = document.createElement('div');
    themeLabel.className = 'helios-ui-label';
    const themeTitle = document.createElement('div');
    themeTitle.className = 'helios-ui-label__title';
    themeTitle.textContent = 'Theme';
    const themeHint = document.createElement('div');
    themeHint.className = 'helios-ui-label__hint';
    themeHint.textContent = 'Light / Dark';
    themeLabel.appendChild(themeTitle);
    themeLabel.appendChild(themeHint);
    const themeButton = document.createElement('button');
    themeButton.type = 'button';
    themeButton.className = 'helios-ui-button';
    themeButton.textContent = this.theme === 'dark' ? 'Dark' : 'Light';
    themeButton.addEventListener('click', () => {
      this.toggleTheme();
      themeButton.textContent = this.theme === 'dark' ? 'Dark' : 'Light';
    });
    themeRow.appendChild(themeLabel);
    const themeControls = document.createElement('div');
    themeControls.className = 'helios-ui-row__controls';
    themeControls.appendChild(themeButton);
    themeRow.appendChild(themeControls);
    content.appendChild(themeRow);

    if (this.helios) {
      const bindings = this.helios?.constructor?.UI_BINDINGS ?? null;
      const numericAccessors = [
        'nodeSizeScale',
        'nodeSizeBase',
        'nodeOpacityScale',
        'nodeOpacityBase',
        'nodeOutlineWidthScale',
        'nodeOutlineWidthBase',
        'edgeWidthScale',
        'edgeWidthBase',
        'edgeOpacityScale',
        'edgeOpacityBase',
        'edgeEndpointTrim',
      ];
      const accessors = bindings
        ? numericAccessors.filter((name) => name in bindings)
        : ['nodeSizeScale'];

      for (const accessorName of accessors) {
        const info = bindings?.[accessorName] ?? { description: 'Scales mapped node sizes' };
        if (info?.type && info.type !== 'number') continue;
        if (typeof this.helios[accessorName] !== 'function') continue;
        const attribute = this.bindHeliosAccessor(accessorName);
        const row = createSliderRow(attribute, { hint: info?.description ?? null });
        content.appendChild(row.element);
        this._controlCleanups.add(row.destroy);
      }
    }

    return this.createPanel({
      id: options.id ?? 'helios-ui-demo',
      title: options.title ?? 'Controls',
      position: options.position ?? { x: 16, y: 16 },
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
}
