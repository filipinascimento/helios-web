import { Panel } from './Panel.js';

function resolveDockTarget(dock) {
  if (!dock || dock === 'free') return 'free';
  if (dock === 'top' || dock === 'bottom') return dock;
  if (dock === 'bottom-left') return 'left-bottom';
  if (dock === 'bottom-right') return 'right-bottom';
  if (dock === 'top-left') return 'left-top';
  if (dock === 'top-right') return 'right-top';
  if (dock.includes('left')) return 'left-top';
  if (dock.includes('right')) return 'right-top';
  return 'free';
}

export class PanelManager {
  constructor(options) {
    if (!options?.container) throw new Error('PanelManager requires a container');
    this.container = options.container;
    this.allowDrag = Boolean(options.allowDrag ?? true);
    this.allowDock = Boolean(options.allowDock ?? true);
    this.dockThreshold = options.dockThreshold ?? 18;
    this.labelColumn = options.labelColumn ?? { mode: 'auto', minPx: 120, maxPx: 220 };
    this.panels = new Map();
    this._zCounter = 1;
    this._measureCanvas = null;

    this.dockLeftTop = document.createElement('div');
    this.dockLeftTop.className = 'helios-ui-dock helios-ui-dock--left helios-ui-dock--top';
    this.dockLeftBottom = document.createElement('div');
    this.dockLeftBottom.className = 'helios-ui-dock helios-ui-dock--left helios-ui-dock--bottom';
    this.dockRightTop = document.createElement('div');
    this.dockRightTop.className = 'helios-ui-dock helios-ui-dock--right helios-ui-dock--top';
    this.dockRightBottom = document.createElement('div');
    this.dockRightBottom.className = 'helios-ui-dock helios-ui-dock--right helios-ui-dock--bottom';
    this.container.appendChild(this.dockLeftTop);
    this.container.appendChild(this.dockLeftBottom);
    this.container.appendChild(this.dockRightTop);
    this.container.appendChild(this.dockRightBottom);

    this._boundMove = (e) => this._handlePointerMove(e);
    this._boundUp = (e) => this._handlePointerUp(e);
    this.container.addEventListener('pointermove', this._boundMove);
    this.container.addEventListener('pointerup', this._boundUp);
    this.container.addEventListener('pointercancel', this._boundUp);
  }

  createPanel(options) {
    if (!options?.id) throw new Error('createPanel requires id');
    if (this.panels.has(options.id)) throw new Error(`Panel "${options.id}" already exists`);
    const panel = new Panel({
      ...options,
      draggable: this.allowDrag && (options.draggable ?? true),
      dockThreshold: options.dockThreshold ?? this.dockThreshold,
      getContainerRect: () => this.container.getBoundingClientRect(),
      onDockChange: () => this._placePanel(panel),
    });
    panel.setZIndex(this._nextZ());
    panel.element.addEventListener('pointerdown', () => panel.setZIndex(this._nextZ()), { capture: true });
    this.panels.set(panel.id, panel);
    this._placePanel(panel);
    this._scheduleAutoFitLabelColumn(panel);
    return panel;
  }

  getPanel(id) {
    return this.panels.get(id) ?? null;
  }

  removePanel(id) {
    const panel = this.panels.get(id);
    if (!panel) return;
    panel.destroy();
    this.panels.delete(id);
  }

  _nextZ() {
    this._zCounter += 1;
    return this._zCounter;
  }

  _handlePointerMove(event) {
    const rect = this.container.getBoundingClientRect();
    for (const panel of this.panels.values()) {
      panel.handleResizeMove(event, { containerRect: rect });
      panel.handlePointerMove(event, {
        containerRect: rect,
        allowDock: this.allowDock,
        threshold: this.dockThreshold,
      });
    }
  }

  _handlePointerUp(event) {
    for (const panel of this.panels.values()) {
      panel.handleResizeUp(event);
      panel.handlePointerUp(event);
    }
  }

  _placePanel(panel) {
    const target = resolveDockTarget(panel.dock);
    if (target === 'left-top') {
      if (panel.element.parentElement !== this.dockLeftTop) this.dockLeftTop.appendChild(panel.element);
      return;
    }
    if (target === 'left-bottom') {
      if (panel.element.parentElement !== this.dockLeftBottom) this.dockLeftBottom.appendChild(panel.element);
      return;
    }
    if (target === 'right-top') {
      if (panel.element.parentElement !== this.dockRightTop) this.dockRightTop.appendChild(panel.element);
      return;
    }
    if (target === 'right-bottom') {
      if (panel.element.parentElement !== this.dockRightBottom) this.dockRightBottom.appendChild(panel.element);
      return;
    }
    if (panel.element.parentElement !== this.container) this.container.appendChild(panel.element);
  }

  _scheduleAutoFitLabelColumn(panel) {
    const config = this.labelColumn;
    if (!config || config.mode !== 'auto') return;
    const doc = panel?.element?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const raf = win?.requestAnimationFrame ?? ((cb) => setTimeout(cb, 0));
    raf(() => {
      if (!panel?.element?.isConnected) return;
      this._autoFitLabelColumn(panel.element, config);
    });
  }

  _autoFitLabelColumn(panelElement, config) {
    const titles = Array.from(panelElement.querySelectorAll('.helios-ui-row--aligned .helios-ui-label__title'));
    if (!titles.length) return;
    const minPx = Number(config?.minPx ?? 120);
    const maxPx = Number(config?.maxPx ?? 220);
    const paddingPx = Number(config?.paddingPx ?? 10);

    let maxWidth = 0;
    for (const titleEl of titles) {
      const text = (titleEl.textContent ?? '').trim();
      if (!text) continue;
      const width = this._measureTextWidth(titleEl, text);
      if (Number.isFinite(width)) maxWidth = Math.max(maxWidth, width);
    }
    if (!Number.isFinite(maxWidth) || maxWidth <= 0) return;

    const computed = Math.max(minPx, Math.min(maxPx, Math.ceil(maxWidth + paddingPx)));
    panelElement.style.setProperty('--helios-ui-label-col', `${computed}px`);
  }

  _measureTextWidth(referenceElement, text) {
    const doc = referenceElement?.ownerDocument ?? document;
    if (!this._measureCanvas) this._measureCanvas = doc.createElement('canvas');
    const ctx = this._measureCanvas.getContext('2d');
    if (!ctx) return null;
    const style = (doc.defaultView ?? window).getComputedStyle(referenceElement);
    ctx.font = style.font || `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const metrics = ctx.measureText(text);
    return metrics?.width ?? null;
  }

  destroy() {
    for (const id of Array.from(this.panels.keys())) {
      this.removePanel(id);
    }
    this.container.removeEventListener('pointermove', this._boundMove);
    this.container.removeEventListener('pointerup', this._boundUp);
    this.container.removeEventListener('pointercancel', this._boundUp);
    this.dockLeftTop.remove();
    this.dockLeftBottom.remove();
    this.dockRightTop.remove();
    this.dockRightBottom.remove();
  }
}
