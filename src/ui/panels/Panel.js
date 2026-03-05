import { computeDockMode } from './docking.js';
import { computeResizedWidth } from './resize.js';
import { defineHeliosWebComponents } from '../web-components/defineHeliosWebComponents.js';

const DEFAULT_POSITION = Object.freeze({ x: 12, y: 12 });
const DEFAULT_DOCK_THRESHOLD = 18;
const DEFAULT_MIN_WIDTH = 240;

export class Panel {
  constructor(options) {
    if (!options?.id) throw new Error('Panel requires an id');
    this.id = options.id;
    this.title = options.title ?? options.id;
    this.draggable = Boolean(options.draggable ?? true);
    this.onDockChange = typeof options.onDockChange === 'function' ? options.onDockChange : null;
    this.onHeaderPointerDown = typeof options.onHeaderPointerDown === 'function' ? options.onHeaderPointerDown : null;
    this.position = { ...(options.position ?? DEFAULT_POSITION) };
    this.lastFreePosition = { ...this.position };
    this.dock = options.dock ?? 'free';
    this.dockThreshold = options.dockThreshold ?? DEFAULT_DOCK_THRESHOLD;
    this.minWidth = options.minWidth ?? DEFAULT_MIN_WIDTH;
    this.width = options.width ?? null;
    this.getContainerRect = typeof options.getContainerRect === 'function'
      ? options.getContainerRect
      : () => this.element?.parentElement?.getBoundingClientRect?.();

    const doc = options?.content?.ownerDocument ?? document;
    defineHeliosWebComponents(doc);

    this.element = doc.createElement('helios-panel');
    this.element.dataset.panelId = this.id;
    this.element.setAttribute('panel-id', this.id);
    this.element.dataset.collapsed = 'false';
    this.element.setAttribute('heading', this.title);
    this.element.setAttribute('dock', this.dock);
    this.element.ensureBuilt?.();
    if (this.width != null) this.element.style.width = `${Number(this.width)}px`;
    this.element.style.minWidth = `${Number(this.minWidth)}px`;

    this.resizeHandle = this.element.querySelector('.helios-ui-resize-handle');
    this._syncResizeHandleEdge();
    this._applyDock();

    this.header = this.element.querySelector('.helios-ui-panel__header');
    this.titleEl = this.element.querySelector('.helios-ui-panel__title');
    this.actionsEl = this.element.querySelector('.helios-ui-panel__actions');
    this.collapseButton = this.element.querySelector('.helios-ui-panel__actions .helios-ui-button');
    this.body = this.element.querySelector('.helios-ui-panel__body');
    if (this.body && options.content) this.body.appendChild(options.content);

    this._drag = null;
    this._resize = null;
    this._onPointerDown = (e) => this._handlePointerDown(e);
    this.header?.addEventListener('pointerdown', this._onPointerDown);

    this._onResizePointerDown = (e) => this._handleResizePointerDown(e);
    this.resizeHandle?.addEventListener('pointerdown', this._onResizePointerDown);
  }

  setZIndex(zIndex) {
    this.element.style.zIndex = String(zIndex);
  }

  setPosition(x, y) {
    this.position = { x, y };
    if (this.dock !== 'free') return;
    this.element.style.left = `${x}px`;
    this.element.style.top = `${y}px`;
  }

  setDock(mode) {
    if (!mode) mode = 'free';
    if (mode === this.dock) return;
    if (this.dock === 'free') {
      this.lastFreePosition = { ...this.position };
    }
    this.dock = mode;
    this.element.dataset.dock = mode;
    this.element.setAttribute('dock', mode);
    this._syncResizeHandleEdge();
    this._applyDock();
    this.onDockChange?.(this, mode);
  }

  _syncResizeHandleEdge() {
    const dock = this.dock ?? 'free';
    const edge = dock.includes('right') ? 'left' : 'right';
    if (this.resizeHandle) this.resizeHandle.dataset.edge = edge;
  }

  _applyDock() {
    const mode = this.dock ?? 'free';
    if (mode === 'free') {
      this.element.style.position = 'absolute';
      this.element.style.right = '';
      this.element.style.bottom = '';
      if (this.width == null) this.element.style.width = '';
      this.element.style.height = '';
      this.element.style.maxWidth = '';
      this.element.style.minWidth = '';
      this.element.style.left = `${this.position.x}px`;
      this.element.style.top = `${this.position.y}px`;
      this._syncResizeHandleEdge();
      return;
    }

    const rect = this.element.getBoundingClientRect();
    const width = this.width ?? (rect.width || 320);
    const height = rect.height || 240;

    const clear = () => {
      this.element.style.left = '';
      this.element.style.top = '';
      this.element.style.right = '';
      this.element.style.bottom = '';
      this.element.style.width = '';
      this.element.style.height = '';
    };

    clear();

    if (mode === 'left' || mode === 'right' || mode.endsWith('-left') || mode.endsWith('-right')) {
      this.element.style.position = 'relative';
      this.element.style.width = `${width}px`;
      return;
    }
    if (mode === 'top') {
      this.element.style.position = 'absolute';
      this.element.style.left = '0px';
      this.element.style.top = '0px';
      this.element.style.right = '0px';
      this.element.style.width = 'auto';
      this.element.style.maxWidth = 'none';
      this.element.style.minWidth = '0';
      this.element.style.height = `${height}px`;
      this._syncResizeHandleEdge();
      return;
    }
    if (mode === 'bottom') {
      this.element.style.position = 'absolute';
      this.element.style.left = '0px';
      this.element.style.right = '0px';
      this.element.style.bottom = '0px';
      this.element.style.width = 'auto';
      this.element.style.maxWidth = 'none';
      this.element.style.minWidth = '0';
      this.element.style.height = `${height}px`;
      this._syncResizeHandleEdge();
      return;
    }
  }

  collapsed() {
    return this.element.dataset.collapsed === 'true';
  }

  setCollapsed(collapsed) {
    if (typeof this.element.setCollapsed === 'function') {
      this.element.setCollapsed(collapsed);
      return;
    }
    this.element.dataset.collapsed = collapsed ? 'true' : 'false';
    if (this.collapseButton) {
      this.collapseButton.textContent = collapsed ? '+' : '—';
      this.collapseButton.title = collapsed ? 'Expand' : 'Collapse';
    }
  }

  toggleCollapsed() {
    if (typeof this.element.toggleCollapsed === 'function') {
      this.element.toggleCollapsed();
      return;
    }
    this.setCollapsed(!this.collapsed());
  }

  _handlePointerDown(event) {
    if (!this.draggable) return;
    if (event.button !== 0) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, input, select, textarea, .helios-ui-resize-handle')) return;
    if (this.onHeaderPointerDown?.(event, this) === true) {
      event.preventDefault();
      return;
    }

    this.beginDragFromHeaderPointer(event, {
      containerRect: this.getContainerRect?.(),
    });
    event.preventDefault();
  }

  beginDragFromHeaderPointer(event, options = {}) {
    if (!event) return;
    const containerRect = options.containerRect ?? this.getContainerRect?.();
    const panelRect = this.element.getBoundingClientRect();
    const rawOffsetX = Number.isFinite(options.offsetX) ? options.offsetX : (event.clientX - panelRect.left);
    const rawOffsetY = Number.isFinite(options.offsetY) ? options.offsetY : (event.clientY - panelRect.top);
    const offsetX = this._clampDragOffset(rawOffsetX, panelRect.width);
    const offsetY = this._clampDragOffset(rawOffsetY, panelRect.height);

    if (this.dock !== 'free') {
      const left = containerRect?.left ?? 0;
      const top = containerRect?.top ?? 0;
      const nextX = event.clientX - left - offsetX;
      const nextY = event.clientY - top - offsetY;
      this.setDock('free');
      this.setPosition(nextX, nextY);
    }

    this._drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: this.position.x,
      originY: this.position.y,
      offsetX,
      offsetY,
    };
    this.header?.setPointerCapture?.(event.pointerId);
  }

  _clampDragOffset(value, size) {
    const numericValue = Number(value);
    const numericSize = Number(size);
    if (!Number.isFinite(numericValue)) return 0;
    if (!Number.isFinite(numericSize) || numericSize <= 0) return numericValue;
    const margin = Math.min(12, Math.max(0, numericSize / 2));
    return Math.max(margin, Math.min(numericSize - margin, numericValue));
  }

  handlePointerMove(event, options = {}) {
    if (!this._drag || event.pointerId !== this._drag.pointerId) return;
    const containerRect = options.containerRect ?? this.getContainerRect?.();
    const allowDock = Boolean(options.allowDock ?? true);
    const threshold = options.threshold ?? this.dockThreshold;
    const keepFree = Boolean(event.shiftKey) || Boolean(options.forceFree ?? false);

    if (!containerRect) {
      const dx = event.clientX - this._drag.startX;
      const dy = event.clientY - this._drag.startY;
      this.setPosition(this._drag.originX + dx, this._drag.originY + dy);
      return;
    }

    const left = containerRect.left;
    const top = containerRect.top;

    const nextX = event.clientX - left - this._drag.offsetX;
    const nextY = event.clientY - top - this._drag.offsetY;

    this.setDock('free');
    this.setPosition(nextX, nextY);

    if (keepFree || !allowDock) return;

    const rect = this.element.getBoundingClientRect();
    const dock = computeDockMode({
      x: rect.left - left,
      y: rect.top - top,
      width: rect.width,
      height: rect.height,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      threshold,
    });
    if (dock !== 'free') {
      this.setDock(dock);
    }
  }

  _handleResizePointerDown(event) {
    if (event.button !== 0) return;
    const dock = this.dock ?? 'free';
    if (dock === 'top' || dock === 'bottom') return;

    const rect = this.element.getBoundingClientRect();
    const edge = this.resizeHandle.dataset.edge === 'left' ? 'left' : 'right';
    this._resize = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidth: rect.width,
      edge,
    };
    this.resizeHandle?.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  handleResizeMove(event, options = {}) {
    if (!this._resize || event.pointerId !== this._resize.pointerId) return null;
    const containerRect = options.containerRect ?? this.getContainerRect?.();
    const maxWidth = containerRect ? Math.max(this.minWidth, containerRect.width) : Infinity;
    const next = computeResizedWidth({
      startWidth: this._resize.startWidth,
      startClientX: this._resize.startClientX,
      clientX: event.clientX,
      edge: this._resize.edge,
      minWidth: this.minWidth,
      maxWidth,
    });
    if (next == null) return null;
    this.width = next;
    this.element.style.width = `${next}px`;
    return next;
  }

  handleResizeUp(event) {
    if (!this._resize || event.pointerId !== this._resize.pointerId) return;
    this._resize = null;
  }

  handlePointerUp(event) {
    if (!this._drag || event.pointerId !== this._drag.pointerId) return;
    this._drag = null;
  }

  syncDockStyles() {
    this._syncResizeHandleEdge();
    this._applyDock();
  }

  destroy() {
    this.header?.removeEventListener('pointerdown', this._onPointerDown);
    this.resizeHandle?.removeEventListener('pointerdown', this._onResizePointerDown);
    this.element.remove();
  }
}
