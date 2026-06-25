import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { createTooltipManager } from '../controls/createTooltipManager.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { LEGENDS_PANEL_SCHEMA, resolvePanelItemLabel } from './panelSchema.js';

function toFiniteNumber(value, fallback = null) {
  if (value == null || `${value}`.trim() === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

const LEGEND_CONTROL_HINTS = Object.freeze({
  'legends.enabled': 'Enable or disable the SVG legends overlay.',
  'legends.respectDockInsets': 'Keep legends inside the usable viewport when side panels are docked.',
  'legends.showNodeColor': 'Show node colormap or categorical color legends.',
  'legends.showDensity': 'Show the density legend when density mode is active.',
  'legends.showEdgeColor': 'Show edge color legends when edges are not node-color passthrough.',
  'legends.showNodeSize': 'Show visual cues for legendable node size mappings.',
  'legends.showEdgeWidth': 'Show visual cues for legendable edge width mappings.',
  'legends.maxChars': 'Maximum characters per categorical legend row. Zero disables truncation.',
  'legends.maxRows': 'Maximum wrapped rows for categorical legend text.',
  'legends.scale': 'Scale the overall legend layout proportionally.',
  'legends.continuousHeight': 'Height of continuous colormap legends.',
});

function normalizeSchemaItem(item) {
  if (typeof item === 'string') return { key: item };
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'custom') return null;
  if (typeof item.key === 'string') return item;
  return null;
}

export class LegendsPanel {
  constructor(ui, options = {}) {
    this.ui = ui;
    this.options = options;
  }

  create() {
    const helios = this.ui.helios ?? null;
    const content = document.createElement('div');
    this.ui._lastLegendsPanel = this;
    const legendsBehavior = helios?.behavior?.legends ?? helios?.useBehavior?.('legends');
    this.legendsBehavior = legendsBehavior ?? null;
    this.state = legendsBehavior?.state ?? null;
    if (!helios || !legendsBehavior || typeof legendsBehavior.legends !== 'function') {
      const placeholder = document.createElement('div');
      placeholder.textContent = 'Legends controls require LegendsBehavior.';
      content.appendChild(placeholder);
      return this.ui.createPanel({
        id: this.options.id ?? 'helios-ui-legends',
        title: this.options.title ?? 'Legends',
        position: this.options.position ?? { x: 16, y: 520 },
        dock: this.options.dock ?? 'top-right',
        content,
      });
    }

    const tooltips = createTooltipManager();
    const stateManager = helios?.states ?? helios?.storage ?? null;
    const createIndicator = (path) => this.ui.createStateIndicator?.(path, 'legends', {
      register: false,
    }) ?? null;
    const createRow = ({ title, hint, controls, persistencePath = null }) => {
      const built = createAlignedRowEl({
        title,
        hint,
        controls,
        dirtyIndicator: persistencePath ? createIndicator(persistencePath) : undefined,
        attachTooltip: tooltips.attachTooltip,
      });
      content.appendChild(built.row);
      return built;
    };
    const valueForKey = (key, fallback = null) => {
      const entry = stateManager?.entry?.(key) ?? null;
      const value = stateManager?.get?.(key, undefined);
      return value === undefined ? (entry?.default ?? fallback) : value;
    };
    const writeKey = (key, value) => {
      if (typeof stateManager?.set === 'function') {
        stateManager.set(key, value, {
          source: 'ui',
          reason: `legends:${String(key).split('.').pop() ?? 'control'}`,
          journal: false,
        });
        return;
      }
      const prop = String(key).split('.').pop();
      if (prop) legendsBehavior.legends({ [prop]: value });
    };
    const subscribeKey = (key, sync) => {
      const unsubscribeStorage = stateManager?.subscribe?.(key, (value) => sync(value)) ?? null;
      if (typeof unsubscribeStorage === 'function') return unsubscribeStorage;
      return legendsBehavior.on?.('change', () => sync(valueForKey(key))) ?? (() => {});
    };
    const createToggleFromSchema = (item) => {
      const key = item.key;
      const entry = stateManager?.entry?.(key) ?? null;
      const label = resolvePanelItemLabel(item, stateManager);
      const toggle = createToggleControl({
        checked: Boolean(valueForKey(key, entry?.default ?? false)),
        ariaLabel: label,
      });
      const sync = (value) => {
        toggle.checked = Boolean(value);
      };
      const unsubscribe = subscribeKey(key, sync);
      toggle.addEventListener('change', () => writeKey(key, toggle.checked));
      createRow({
        title: label,
        hint: item.hint ?? LEGEND_CONTROL_HINTS[key] ?? entry?.description ?? null,
        controls: toggle,
        persistencePath: key,
      });
      this.ui._controlCleanups.add(() => unsubscribe());
    };
    const createNumberFromSchema = (item) => {
      const key = item.key;
      const entry = stateManager?.entry?.(key) ?? null;
      const label = resolvePanelItemLabel(item, stateManager);
      const ui = entry?.ui ?? {};
      const min = item.inputMin ?? ui.inputMin ?? ui.min ?? 0;
      const max = item.inputMax ?? ui.inputMax ?? ui.max ?? 1;
      const suggested = item.suggested ?? [
        item.suggestedMin ?? ui.suggestedMin ?? ui.min ?? min,
        item.suggestedMax ?? ui.suggestedMax ?? ui.max ?? max,
      ];
      const controls = new SuggestedSliderControls({
        value: valueForKey(key, entry?.default ?? 0),
        suggested,
        step: item.step ?? ui.step ?? 1,
        inputMin: min,
        inputMax: max,
        onCommit: (value) => {
          const numeric = toFiniteNumber(value, null);
          if (numeric == null) return;
          writeKey(key, numeric);
        },
      });
      const unsubscribe = subscribeKey(key, (value) => {
        const numeric = toFiniteNumber(value, null);
        if (numeric != null) controls.set(numeric);
      });
      createRow({
        title: label,
        hint: item.hint ?? LEGEND_CONTROL_HINTS[key] ?? entry?.description ?? null,
        controls: controls.element,
        persistencePath: key,
      });
      this.ui._controlCleanups.add(() => {
        unsubscribe();
        controls.destroy();
      });
    };
    const createControlFromSchema = (item) => {
      const normalized = normalizeSchemaItem(item);
      if (!normalized) return;
      const entry = stateManager?.entry?.(normalized.key) ?? null;
      const controller = normalized.controller ?? entry?.ui?.controller ?? entry?.type;
      if (controller === 'toggle' || entry?.type === 'boolean') {
        createToggleFromSchema(normalized);
      } else if (controller === 'slider' || entry?.type === 'number') {
        createNumberFromSchema(normalized);
      }
    };

    for (const section of LEGENDS_PANEL_SCHEMA.sections) {
      for (const item of section.items) createControlFromSchema(item);
    }

    this.ui._controlCleanups.add(() => tooltips.destroy());

    return this.ui.createPanel({
      id: this.options.id ?? 'helios-ui-legends',
      title: this.options.title ?? 'Legends',
      position: this.options.position ?? { x: 16, y: 520 },
      dock: this.options.dock ?? 'top-right',
      panelSchema: LEGENDS_PANEL_SCHEMA,
      content,
    });
  }
}

export default LegendsPanel;
