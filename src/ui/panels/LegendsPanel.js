import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { createTooltipManager } from '../controls/createTooltipManager.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';

function toFiniteNumber(value, fallback = null) {
  if (value == null || `${value}`.trim() === '') return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function subscribe(helios, eventName, handler) {
  if (!helios || typeof handler !== 'function') return () => {};
  if (typeof helios.on === 'function') {
    return helios.on(eventName, handler) ?? (() => {});
  }
  if (typeof helios.addEventListener === 'function') {
    helios.addEventListener(eventName, handler);
    return () => helios.removeEventListener(eventName, handler);
  }
  return () => {};
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
    const cfg = () => legendsBehavior.legends();
    const patch = (next) => {
      legendsBehavior.legends(next);
      refresh();
    };
    const patchNumber = (key) => (value) => {
      const numeric = toFiniteNumber(value, null);
      if (numeric == null) return;
      patch({ [key]: numeric });
    };
    const createRow = ({ title, hint, controls }) => {
      const built = createAlignedRowEl({
        title,
        hint,
        controls,
        attachTooltip: tooltips.attachTooltip,
      });
      content.appendChild(built.row);
      return built;
    };

    const overallToggle = createToggleControl({ ariaLabel: 'Legends enabled' });
    overallToggle.addEventListener('change', () => patch({ enabled: overallToggle.checked }));
    createRow({ title: 'Visible', hint: 'Enable or disable the SVG legends overlay.', controls: overallToggle });

    const dockToggle = createToggleControl({ ariaLabel: 'Respect docked UI' });
    dockToggle.addEventListener('change', () => patch({ respectDockInsets: dockToggle.checked }));
    createRow({ title: 'Dock Aware', hint: 'Keep legends inside the usable viewport when side panels are docked.', controls: dockToggle });

    const nodeColorToggle = createToggleControl({ ariaLabel: 'Node color legend' });
    nodeColorToggle.addEventListener('change', () => patch({ showNodeColor: nodeColorToggle.checked }));
    createRow({ title: 'Node Colors', hint: 'Show node colormap or categorical color legends.', controls: nodeColorToggle });

    const densityToggle = createToggleControl({ ariaLabel: 'Density legend' });
    densityToggle.addEventListener('change', () => patch({ showDensity: densityToggle.checked }));
    createRow({ title: 'Density', hint: 'Show the density legend when density mode is active.', controls: densityToggle });

    const edgeColorToggle = createToggleControl({ ariaLabel: 'Edge color legend' });
    edgeColorToggle.addEventListener('change', () => patch({ showEdgeColor: edgeColorToggle.checked }));
    createRow({ title: 'Edge Colors', hint: 'Show edge color legends when edges are not node-color passthrough.', controls: edgeColorToggle });

    const nodeSizeToggle = createToggleControl({ ariaLabel: 'Node size legend' });
    nodeSizeToggle.addEventListener('change', () => patch({ showNodeSize: nodeSizeToggle.checked }));
    createRow({ title: 'Node Sizes', hint: 'Show visual cues for legendable node size mappings.', controls: nodeSizeToggle });

    const edgeWidthToggle = createToggleControl({ ariaLabel: 'Edge width legend' });
    edgeWidthToggle.addEventListener('change', () => patch({ showEdgeWidth: edgeWidthToggle.checked }));
    createRow({ title: 'Edge Widths', hint: 'Show visual cues for legendable edge width mappings.', controls: edgeWidthToggle });

    const maxCharsControls = new SuggestedSliderControls({
      value: cfg().maxChars ?? 24,
      suggested: [0, 64],
      step: 1,
      inputMin: 0,
      inputMax: 512,
      onCommit: patchNumber('maxChars'),
    });
    createRow({ title: 'Max Chars', hint: 'Maximum characters per categorical legend row. Zero disables truncation.', controls: maxCharsControls.element });

    const maxRowsControls = new SuggestedSliderControls({
      value: cfg().maxRows ?? 2,
      suggested: [1, 8],
      step: 1,
      inputMin: 1,
      inputMax: 8,
      onCommit: patchNumber('maxRows'),
    });
    createRow({ title: 'Max Rows', hint: 'Maximum wrapped rows for categorical legend text.', controls: maxRowsControls.element });

    const scaleControls = new SuggestedSliderControls({
      value: cfg().scale ?? 1,
      suggested: [0.6, 3],
      step: 0.1,
      inputMin: 0.6,
      inputMax: 3,
      onCommit: patchNumber('scale'),
    });
    createRow({ title: 'Scale', hint: 'Scale the overall legend layout proportionally.', controls: scaleControls.element });

    const barHeightControls = new SuggestedSliderControls({
      value: cfg().continuousHeight ?? 132,
      suggested: [72, 320],
      step: 4,
      inputMin: 72,
      inputMax: 320,
      onCommit: patchNumber('continuousHeight'),
    });
    createRow({ title: 'Bar Height', hint: 'Height of continuous colormap legends.', controls: barHeightControls.element });

    const refresh = () => {
      const state = cfg();
      overallToggle.checked = state.enabled === true;
      dockToggle.checked = state.respectDockInsets !== false;
      nodeColorToggle.checked = state.showNodeColor !== false;
      densityToggle.checked = state.showDensity !== false;
      edgeColorToggle.checked = state.showEdgeColor !== false;
      nodeSizeToggle.checked = state.showNodeSize === true;
      edgeWidthToggle.checked = state.showEdgeWidth === true;
      maxCharsControls.set(state.maxChars ?? 24);
      maxRowsControls.set(state.maxRows ?? 2);
      scaleControls.set(state.scale ?? 1);
      barHeightControls.set(state.continuousHeight ?? 132);
    };

    refresh();
    const unsubscribers = [
      legendsBehavior.on?.('change', refresh) ?? (() => {}),
      subscribe(helios, 'network:replaced', refresh),
    ];
    this.ui._controlCleanups.add(() => tooltips.destroy());
    this.ui._controlCleanups.add(() => {
      maxCharsControls.destroy();
      maxRowsControls.destroy();
      scaleControls.destroy();
      barHeightControls.destroy();
      for (const unsubscribe of unsubscribers) unsubscribe();
    });

    return this.ui.createPanel({
      id: this.options.id ?? 'helios-ui-legends',
      title: this.options.title ?? 'Legends',
      position: this.options.position ?? { x: 16, y: 520 },
      dock: this.options.dock ?? 'top-right',
      content,
    });
  }
}

export default LegendsPanel;
