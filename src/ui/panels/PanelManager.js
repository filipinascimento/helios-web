import { Panel } from './Panel.js';
import { resolveDockTarget } from './docking.js';

const STACK_DRAG_EDGE_SCROLL_PX = 36;
const STACK_DRAG_SCROLL_STEP_PX = 20;

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
    this._dockReorder = null;
    this._freeDragDockGuards = new Map();
    this._dockMetricsListeners = new Set();
    this._eventTarget = this.container?.ownerDocument?.defaultView ?? globalThis.window ?? this.container;
    this._responsivePresentation = {
      mode: 'desktop',
      dockSide: 'left',
      controlsOpen: false,
      activePanelId: null,
      focused: false,
    };

    this.dockLeft = document.createElement('div');
    this.dockLeft.className = 'helios-ui-dock helios-ui-dock--side helios-ui-dock--left';
    this.dockRight = document.createElement('div');
    this.dockRight.className = 'helios-ui-dock helios-ui-dock--side helios-ui-dock--right';
    this.fullscreenFlow = document.createElement('div');
    this.fullscreenFlow.className = 'helios-ui-fullscreen-flow';
    this.fullscreenFlow.hidden = true;
    this.container.appendChild(this.dockLeft);
    this.container.appendChild(this.dockRight);
    this.container.appendChild(this.fullscreenFlow);

    this._boundDockMetricsResize = () => this._emitDockMetricsChange();
    if (typeof ResizeObserver === 'function') {
      this._dockResizeObserver = new ResizeObserver(this._boundDockMetricsResize);
      this._dockResizeObserver.observe(this.container);
      this._dockResizeObserver.observe(this.dockLeft);
      this._dockResizeObserver.observe(this.dockRight);
    } else {
      this._dockResizeObserver = null;
    }

    this._boundMove = (e) => this._handlePointerMove(e);
    this._boundUp = (e) => this._handlePointerUp(e);
    this._eventTarget.addEventListener('pointermove', this._boundMove);
    this._eventTarget.addEventListener('pointerup', this._boundUp);
    this._eventTarget.addEventListener('pointercancel', this._boundUp);
    this._emitDockMetricsChange();
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
      onHeaderPointerDown: (event, panelRef) => this._startSideDockReorder(panelRef, event),
    });
    panel.setZIndex(this._nextZ());
    panel.element.addEventListener('pointerdown', () => panel.setZIndex(this._nextZ()), { capture: true });
    this.panels.set(panel.id, panel);
    this._placePanel(panel);
    this._scheduleAutoFitLabelColumn(panel);
    this._emitDockMetricsChange();
    return panel;
  }

  getPanel(id) {
    return this.panels.get(id) ?? null;
  }

  getPanels() {
    return Array.from(this.panels.values());
  }

  serializeState() {
    const panels = {};
    for (const [id, panel] of this.panels.entries()) {
      panels[id] = panel.serializeState?.() ?? null;
    }
    return {
      panels,
      dockOrder: {
        left: Array.from(this.dockLeft?.children ?? []).map((element) => element.dataset.panelId).filter(Boolean),
        right: Array.from(this.dockRight?.children ?? []).map((element) => element.dataset.panelId).filter(Boolean),
      },
    };
  }

  restoreState(state = {}) {
    if (!state || typeof state !== 'object') return this;
    const panels = state.panels && typeof state.panels === 'object' ? state.panels : {};
    for (const [id, panelState] of Object.entries(panels)) {
      this.panels.get(id)?.restoreState?.(panelState);
    }
    const leftOrder = Array.isArray(state.dockOrder?.left) ? state.dockOrder.left : [];
    const rightOrder = Array.isArray(state.dockOrder?.right) ? state.dockOrder.right : [];
    for (const id of leftOrder) {
      const panel = this.panels.get(id);
      if (panel?.element && panel.dock !== 'free') this.dockLeft.appendChild(panel.element);
    }
    for (const id of rightOrder) {
      const panel = this.panels.get(id);
      if (panel?.element && panel.dock !== 'free') this.dockRight.appendChild(panel.element);
    }
    this._emitDockMetricsChange();
    return this;
  }

  removePanel(id) {
    const panel = this.panels.get(id);
    if (!panel) return;
    this._freeDragDockGuards.delete(id);
    if (this._dockReorder?.panel === panel) {
      this._endSideDockReorder({ pointerId: this._dockReorder.pointerId }, { force: true });
    }
    panel.destroy();
    this.panels.delete(id);
    this._emitDockMetricsChange();
  }

  _nextZ() {
    this._zCounter += 1;
    return this._zCounter;
  }

  _handlePointerMove(event) {
    if (this._dockReorder && event.pointerId === this._dockReorder.pointerId) {
      if (this._moveSideDockReorder(event)) return;
    }

    const rect = this.container.getBoundingClientRect();
    for (const panel of this.panels.values()) {
      const resizedWidth = panel.handleResizeMove(event, { containerRect: rect });
      if (resizedWidth != null) {
        this._syncDockedWidths(panel, resizedWidth);
      }
      const forceFree = this._shouldForceFreeWhileDragging(panel, event);
      panel.handlePointerMove(event, {
        containerRect: rect,
        allowDock: this.allowDock,
        threshold: this.dockThreshold,
        forceFree,
      });
      if (this._trySwitchFreeDragToDockReorder(panel, event)) return;
    }
  }

  _handlePointerUp(event) {
    if (this._dockReorder && event.pointerId === this._dockReorder.pointerId) {
      this._endSideDockReorder(event);
      return;
    }
    for (const panel of this.panels.values()) {
      panel.handleResizeUp(event);
      panel.handlePointerUp(event);
      this._clearFreeDragDockGuard(panel, event);
    }
  }

  _placePanel(panel) {
    if (!panel?.element) return;

    if (this._dockReorder?.panel === panel) {
      return;
    }

    const target = this._resolveEffectiveSideDockTarget(panel);
    if (target === 'left') {
      this._matchSideDockWidth(panel, 'left');
      panel.element.dataset.sideDocked = 'true';
      if (panel.element.parentElement !== this.dockLeft) this.dockLeft.appendChild(panel.element);
      panel.syncDockStyles();
      this._emitDockMetricsChange();
      return;
    }
    if (target === 'right') {
      this._matchSideDockWidth(panel, 'right');
      panel.element.dataset.sideDocked = 'true';
      if (panel.element.parentElement !== this.dockRight) this.dockRight.appendChild(panel.element);
      panel.syncDockStyles();
      this._emitDockMetricsChange();
      return;
    }

    delete panel.element.dataset.sideDocked;
    if (panel.element.parentElement !== this.container) this.container.appendChild(panel.element);
    panel.syncDockStyles();
    this._emitDockMetricsChange();
  }

  _syncDockedWidths(sourcePanel, width) {
    const target = this._resolveEffectiveSideDockTarget(sourcePanel);
    let side = null;
    if (target === 'left') side = 'left';
    else if (target === 'right') side = 'right';
    if (!side) return;

    const numeric = Number(width);
    if (!Number.isFinite(numeric)) return;
    const nextWidth = Math.max(sourcePanel?.minWidth ?? 240, numeric);
    for (const panel of this.panels.values()) {
      const panelTarget = this._resolveEffectiveSideDockTarget(panel);
      if (panelTarget !== side) continue;
      panel.width = nextWidth;
      panel.element.style.width = `${nextWidth}px`;
    }
    this._emitDockMetricsChange();
  }

  _matchSideDockWidth(panel, side) {
    if (!panel || (side !== 'left' && side !== 'right')) return;
    let width = null;
    for (const candidate of this.panels.values()) {
      if (!candidate || candidate === panel) continue;
      if (this._resolveEffectiveSideDockTarget(candidate) !== side) continue;
      const candidateWidth = Number(candidate.width ?? candidate.element?.getBoundingClientRect?.().width);
      if (!Number.isFinite(candidateWidth) || candidateWidth <= 0) continue;
      width = Math.max(candidate.minWidth ?? panel.minWidth ?? 240, candidateWidth);
      break;
    }
    if (!Number.isFinite(width) || width <= 0) return;
    panel.width = width;
    panel.element.style.width = `${width}px`;
  }

  _resolveEffectiveSideDockTarget(panel) {
    const target = resolveDockTarget(panel?.dock);
    if (
      this._responsivePresentation?.mode === 'compact'
      && (target === 'left' || target === 'right')
    ) {
      return this._responsivePresentation?.dockSide === 'right' ? 'right' : 'left';
    }
    return target;
  }

  getDockInsets() {
    if (this._responsivePresentation?.mode === 'fullscreen') {
      return {
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      };
    }
    const leftWidth = this.dockLeft?.childElementCount
      ? Math.max(0, Math.round(this.dockLeft.getBoundingClientRect().width))
      : 0;
    const rightWidth = this.dockRight?.childElementCount
      ? Math.max(0, Math.round(this.dockRight.getBoundingClientRect().width))
      : 0;
    return {
      top: 0,
      right: rightWidth,
      bottom: 0,
      left: leftWidth,
    };
  }

  onDockMetricsChange(callback) {
    if (typeof callback !== 'function') return () => {};
    this._dockMetricsListeners.add(callback);
    callback(this.getDockInsets());
    return () => this._dockMetricsListeners.delete(callback);
  }

  setResponsivePresentation(presentation = {}) {
    const next = {
      ...this._responsivePresentation,
      ...(presentation && typeof presentation === 'object' ? presentation : {}),
    };
    next.mode = typeof next.mode === 'string' ? next.mode : 'desktop';
    next.dockSide = next.dockSide === 'right' ? 'right' : 'left';
    next.controlsOpen = next.controlsOpen === true;
    next.activePanelId = typeof next.activePanelId === 'string' ? next.activePanelId : null;
    next.focused = next.focused === true;
    this._responsivePresentation = next;

    this.container.dataset.responsiveMode = next.mode;
    this.container.dataset.compactDockSide = next.dockSide;
    this.container.dataset.controlsOpen = next.controlsOpen ? 'true' : 'false';
    this.container.dataset.focusedControl = next.focused ? 'true' : 'false';
    if (next.activePanelId) this.container.dataset.activePanelId = next.activePanelId;
    else delete this.container.dataset.activePanelId;

    this.fullscreenFlow.hidden = !(next.mode === 'fullscreen' && next.controlsOpen);
    this.fullscreenFlow.dataset.focused = next.focused ? 'true' : 'false';

    if (next.mode === 'compact') {
      const compactPanels = Array.from(this.panels.values())
        .filter((panel) => {
          const panelTarget = resolveDockTarget(panel?.dock);
          return panelTarget === 'left' || panelTarget === 'right';
        })
        .sort((a, b) => {
          const targetA = resolveDockTarget(a?.dock);
          const targetB = resolveDockTarget(b?.dock);
          if (targetA !== targetB) return targetA === 'left' ? -1 : 1;
          return 0;
        });
      const dock = next.dockSide === 'right' ? this.dockRight : this.dockLeft;
      for (const panel of compactPanels) {
        panel.setResponsiveMode?.('desktop');
        dock.appendChild(panel.element);
        panel.setDockEdgeOverride(next.dockSide);
        panel.element.dataset.sideDocked = 'true';
        this._matchSideDockWidth(panel, next.dockSide);
      }
    }

    for (const panel of this.panels.values()) {
      const panelTarget = resolveDockTarget(panel?.dock);
      if (next.mode === 'fullscreen') {
        panel.setResponsiveMode?.('fullscreen');
        if (panel.element.parentElement !== this.fullscreenFlow) this.fullscreenFlow.appendChild(panel.element);
        panel.setDockEdgeOverride(null);
        delete panel.element.dataset.sideDocked;
      } else if (next.mode === 'compact') {
        if (panelTarget === 'left' || panelTarget === 'right') {
          panel.setResponsiveMode?.('desktop');
          panel.setDockEdgeOverride(next.dockSide);
          panel.element.dataset.sideDocked = 'true';
        } else {
          panel.setResponsiveMode?.('desktop');
          panel.setDockEdgeOverride(null);
          delete panel.element.dataset.sideDocked;
          this._placePanel(panel);
        }
      } else {
        panel.setResponsiveMode?.('desktop');
        panel.setDockEdgeOverride(null);
        delete panel.element.dataset.sideDocked;
        this._placePanel(panel);
      }

      let visible = true;
      let visibilityState = 'visible';
      if (next.mode === 'fullscreen') {
        visible = next.controlsOpen === true;
        if (!visible) visibilityState = 'hidden';
        else if (next.focused === true && next.activePanelId) {
          visibilityState = next.activePanelId === panel.id ? 'active' : 'background';
        }
      }
      panel.element.dataset.interfaceVisible = visible ? 'true' : 'false';
      panel.element.dataset.interfaceActive = next.activePanelId === panel.id ? 'true' : 'false';
      panel.element.dataset.interfaceState = visibilityState;
    }

    this._emitDockMetricsChange();
    return this;
  }

  _emitDockMetricsChange() {
    const insets = this.getDockInsets();
    for (const listener of this._dockMetricsListeners) {
      try {
        listener({ ...insets });
      } catch {}
    }
  }

  _startSideDockReorder(panel, event) {
    if (this._responsivePresentation?.mode === 'fullscreen') return false;
    if (!this.allowDrag) return false;
    if (!panel) return false;
    const primaryPressed = (Number(event?.buttons ?? 0) & 1) === 1 || event?.button === 0;
    if (!primaryPressed) return false;
    if (event.shiftKey) return false;

    const target = this._resolveEffectiveSideDockTarget(panel);
    if (target !== 'left' && target !== 'right') return false;

    const dockEl = target === 'left' ? this.dockLeft : this.dockRight;
    if (panel.element.parentElement !== dockEl) return false;

    const panelRect = panel.element.getBoundingClientRect();
    const dockRect = dockEl.getBoundingClientRect();
    if (!panelRect.height || !dockRect.height) return false;

    const dropLine = document.createElement('div');
    dropLine.className = 'helios-ui-dock-drop-line';
    dockEl.insertBefore(dropLine, panel.element.nextSibling);
    const preview = this._createDockDragPreview(panel, panelRect, dockRect);
    this.container.appendChild(preview);
    const previewRect = preview.getBoundingClientRect();
    const pointerOffsetX = this._clampOffset(event.clientX - panelRect.left, panelRect.width);
    const pointerOffsetY = this._clampOffset(event.clientY - panelRect.top, panelRect.height);
    const previewOffsetX = this._scaleOffset(pointerOffsetX, panelRect.width, previewRect.width);
    const previewOffsetY = this._scaleOffset(pointerOffsetY, panelRect.height, previewRect.height);
    const dragAnchorRatioX = panelRect.width > 0 ? (pointerOffsetX / panelRect.width) : 0.5;
    const dragAnchorRatioY = panelRect.height > 0 ? (pointerOffsetY / panelRect.height) : 0.5;
    this._placeSourcePanelAtDrop(dockEl, dropLine, panel.element);
    this._freeDragDockGuards.delete(panel.id);

    panel.element.classList.add('helios-ui-panel--dock-source');
    this.container.classList.add('helios-ui--dock-reordering');
    panel.setZIndex(this._nextZ());

    this._dockReorder = {
      pointerId: event.pointerId,
      panel,
      dockEl,
      side: target,
      dropLine,
      preview,
      previewOffsetX,
      previewOffsetY,
      dragAnchorRatioX,
      dragAnchorRatioY,
      header: panel.header,
    };
    this._updateDockDragPreview(event, this._dockReorder);
    this._setPointerCapture(panel.header, event.pointerId);
    event.preventDefault();
    return true;
  }

  _moveSideDockReorder(event) {
    const state = this._dockReorder;
    if (!state) return false;
    const { panel, dockEl, dropLine, preview } = state;
    this._updateDockDragPreview(event, state);

    const dockRect = dockEl.getBoundingClientRect();
    if (event.shiftKey || this._isOutsideSideDock(event, dockRect, state.side)) {
      this._startFreeDragFromSideDock(event, state);
      return true;
    }

    const pointerY = event.clientY - dockRect.top + dockEl.scrollTop;

    if (event.clientY <= dockRect.top + STACK_DRAG_EDGE_SCROLL_PX) {
      dockEl.scrollTop = Math.max(0, dockEl.scrollTop - STACK_DRAG_SCROLL_STEP_PX);
    } else if (event.clientY >= dockRect.bottom - STACK_DRAG_EDGE_SCROLL_PX) {
      dockEl.scrollTop += STACK_DRAG_SCROLL_STEP_PX;
    }

    const children = Array.from(dockEl.children).filter((child) => child !== panel.element && child !== dropLine);
    let insertBefore = null;
    for (const child of children) {
      const midpoint = child.offsetTop + (child.offsetHeight / 2);
      if (pointerY < midpoint) {
        insertBefore = child;
        break;
      }
    }

    if (insertBefore) {
      dockEl.insertBefore(dropLine, insertBefore);
    } else {
      dockEl.appendChild(dropLine);
    }
    this._placeSourcePanelAtDrop(dockEl, dropLine, panel.element);
    return true;
  }

  _endSideDockReorder(event, options = {}) {
    const state = this._dockReorder;
    if (!state) return;
    if (!options.force && event.pointerId !== state.pointerId) return;

    const { panel, dockEl, dropLine, preview, header } = state;
    this._dockReorder = null;

    this._releasePointerCapture(header, state.pointerId);
    this.container.classList.remove('helios-ui--dock-reordering');
    preview?.remove();
    dropLine?.remove();

    panel.element.classList.remove('helios-ui-panel--dock-source');
    panel.syncDockStyles();
  }

  _isOutsideSideDock(event, dockRect, side) {
    if (!dockRect) return false;
    const x = event.clientX;
    if (side === 'left' || side === 'right') {
      return x < dockRect.left || x > dockRect.right;
    }
    return false;
  }

  _startFreeDragFromSideDock(event, state) {
    const { panel, side, dropLine, preview, header, dragAnchorRatioX, dragAnchorRatioY } = state;
    this._dockReorder = null;
    dropLine?.remove();
    preview?.remove();
    this._releasePointerCapture(header, state.pointerId);
    this.container.classList.remove('helios-ui--dock-reordering');
    panel.element.classList.remove('helios-ui-panel--dock-source');
    this._freeDragDockGuards.set(panel.id, side);

    const containerRect = this.container.getBoundingClientRect();
    const panelRect = panel.element.getBoundingClientRect();
    const offsetX = this._offsetFromAnchorRatio(dragAnchorRatioX, panelRect.width);
    const offsetY = this._offsetFromAnchorRatio(dragAnchorRatioY, panelRect.height);
    panel.beginDragFromHeaderPointer(event, {
      containerRect,
      offsetX,
      offsetY,
    });
    panel.handlePointerMove(event, {
      containerRect,
      allowDock: this.allowDock,
      threshold: this.dockThreshold,
      forceFree: true,
    });
  }

  _trySwitchFreeDragToDockReorder(panel, event) {
    if (this._dockReorder) return false;
    if (!panel?._drag || panel._drag.pointerId !== event.pointerId) return false;
    if (this._hasActiveFreeDragDockGuard(panel, event)) return false;
    const target = this._resolveEffectiveSideDockTarget(panel);
    if (target !== 'left' && target !== 'right') return false;
    const dockEl = target === 'left' ? this.dockLeft : this.dockRight;
    const dockRect = dockEl?.getBoundingClientRect?.();
    if (!this._isPointerInsideRect(event, dockRect)) return false;
    const started = this._startSideDockReorder(panel, event);
    if (!started) return false;
    panel.handlePointerUp(event);
    return true;
  }

  _createDockDragPreview(panel, panelRect, dockRect) {
    const doc = this.container?.ownerDocument ?? document;
    const preview = doc.createElement('div');
    preview.className = 'helios-ui-dock-drag-preview';
    const dockWidth = Math.max(0, Math.round(Number(dockRect?.width) || 0));
    const maxFromDock = dockWidth > 0 ? Math.max(160, dockWidth - 16) : Infinity;
    const compactWidth = Math.round((Number(panelRect?.width) || 220) * 0.92);
    const width = Math.max(160, Math.min(320, compactWidth, maxFromDock));
    preview.style.width = `${width}px`;

    const header = doc.createElement('div');
    header.className = 'helios-ui-dock-drag-preview__header';

    const title = doc.createElement('div');
    title.className = 'helios-ui-dock-drag-preview__title';
    title.textContent = (panel?.titleEl?.textContent ?? panel?.title ?? panel?.id ?? 'Panel').trim();

    header.appendChild(title);
    preview.appendChild(header);
    return preview;
  }

  _updateDockDragPreview(event, state) {
    const preview = state?.preview;
    if (!preview) return;
    const containerRect = this.container.getBoundingClientRect();
    const left = event.clientX - containerRect.left - (state?.previewOffsetX ?? 0);
    const top = event.clientY - containerRect.top - (state?.previewOffsetY ?? 0);
    preview.style.left = `${Math.round(left)}px`;
    preview.style.top = `${Math.round(top)}px`;
  }

  _placeSourcePanelAtDrop(dockEl, dropLine, panelElement) {
    if (!dockEl || !dropLine || !panelElement) return;
    const before = dropLine.nextSibling;
    if (before === panelElement) return;
    dockEl.insertBefore(panelElement, before ?? null);
  }

  _shouldForceFreeWhileDragging(panel, event) {
    if (!panel?._drag || panel._drag.pointerId !== event?.pointerId) return false;
    if (this._hasActiveFreeDragDockGuard(panel, event)) return true;
    const target = this._resolveEffectiveSideDockTarget(panel);
    if (target !== 'left' && target !== 'right') return false;
    const dockEl = target === 'left' ? this.dockLeft : this.dockRight;
    const dockRect = dockEl?.getBoundingClientRect?.();
    return !this._isPointerInsideRect(event, dockRect);
  }

  _hasActiveFreeDragDockGuard(panel, event) {
    const side = this._freeDragDockGuards.get(panel?.id);
    if (!side) return false;
    const leftRect = this.dockLeft?.getBoundingClientRect?.();
    const rightRect = this.dockRight?.getBoundingClientRect?.();
    const insideAnySideDock = this._isPointerInsideRect(event, leftRect) || this._isPointerInsideRect(event, rightRect);
    if (insideAnySideDock) {
      this._freeDragDockGuards.delete(panel.id);
      return false;
    }
    return true;
  }

  _clearFreeDragDockGuard(panel, event) {
    if (!panel?.id) return;
    if (event?.pointerId != null && panel?._drag && panel._drag.pointerId !== event.pointerId) return;
    this._freeDragDockGuards.delete(panel.id);
  }

  _setPointerCapture(element, pointerId) {
    if (pointerId == null) return;
    try {
      element?.setPointerCapture?.(pointerId);
    } catch {}
  }

  _releasePointerCapture(element, pointerId) {
    if (pointerId == null) return;
    try {
      if (element?.hasPointerCapture?.(pointerId)) {
        element.releasePointerCapture(pointerId);
      }
    } catch {}
  }

  _isPointerInsideRect(event, rect) {
    if (!rect || !event) return false;
    const x = Number(event.clientX);
    const y = Number(event.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  _scaleOffset(offsetPx, fromSizePx, toSizePx) {
    const offset = Number(offsetPx);
    const from = Number(fromSizePx);
    const to = Number(toSizePx);
    if (!Number.isFinite(offset) || !Number.isFinite(from) || !Number.isFinite(to) || from <= 0 || to <= 0) {
      return 0;
    }
    const ratio = offset / from;
    const scaled = ratio * to;
    return this._clampOffset(scaled, to);
  }

  _clampOffset(offsetPx, sizePx) {
    const offset = Number(offsetPx);
    const size = Number(sizePx);
    if (!Number.isFinite(offset)) return 0;
    if (!Number.isFinite(size) || size <= 0) return offset;
    const margin = Math.min(12, Math.max(0, size / 2));
    return Math.max(margin, Math.min(size - margin, offset));
  }

  _offsetFromAnchorRatio(ratioValue, sizePx) {
    const ratio = Number(ratioValue);
    const size = Number(sizePx);
    if (!Number.isFinite(size) || size <= 0) return 0;
    const normalized = Number.isFinite(ratio) ? ratio : 0.5;
    return this._clampOffset(normalized * size, size);
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
    this._eventTarget?.removeEventListener('pointermove', this._boundMove);
    this._eventTarget?.removeEventListener('pointerup', this._boundUp);
    this._eventTarget?.removeEventListener('pointercancel', this._boundUp);
    this._dockResizeObserver?.disconnect?.();
    this._dockMetricsListeners.clear();
    this.dockLeft.remove();
    this.dockRight.remove();
  }
}
