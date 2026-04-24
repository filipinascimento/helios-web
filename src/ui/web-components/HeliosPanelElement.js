import { createPanelIcon, resolvePanelIconKind } from '../panelIcons.js';

const BaseHTMLElement = globalThis.HTMLElement ?? class {};

export class HeliosPanelElement extends BaseHTMLElement {
  static get observedAttributes() {
    return ['heading', 'collapsed', 'dock', 'panel-id', 'panel-icon'];
  }

  constructor() {
    super();
    this._built = false;
    this._onCollapseClick = null;
  }

  ensureBuilt() {
    this._build();
    this._syncFromAttributes();
  }

  _build() {
    if (this._built) return;
    this._built = true;

    const doc = this.ownerDocument ?? document;

    this.classList.add('helios-ui-panel');

    this.resizeHandleEl = doc.createElement('div');
    this.resizeHandleEl.className = 'helios-ui-resize-handle';

    this.headerEl = doc.createElement('div');
    this.headerEl.className = 'helios-ui-panel__header';

    this.titleWrapEl = doc.createElement('div');
    this.titleWrapEl.className = 'helios-ui-panel__title-wrap';

    this.titleIconEl = doc.createElement('div');
    this.titleIconEl.className = 'helios-ui-panel__title-icon';

    this.titleEl = doc.createElement('div');
    this.titleEl.className = 'helios-ui-panel__title';

    this.actionsEl = doc.createElement('div');
    this.actionsEl.className = 'helios-ui-panel__actions';

    this.collapseButtonEl = doc.createElement('button');
    this.collapseButtonEl.className = 'helios-ui-button';
    this.collapseButtonEl.type = 'button';

    this.actionsEl.appendChild(this.collapseButtonEl);
    this.titleWrapEl.appendChild(this.titleIconEl);
    this.titleWrapEl.appendChild(this.titleEl);
    this.headerEl.appendChild(this.titleWrapEl);
    this.headerEl.appendChild(this.actionsEl);

    this.bodyEl = doc.createElement('div');
    this.bodyEl.className = 'helios-ui-panel__body';

    this.appendChild(this.resizeHandleEl);
    this.appendChild(this.headerEl);
    this.appendChild(this.bodyEl);

    this._ensureCollapseBinding();
  }

  _ensureCollapseBinding() {
    if (!this.collapseButtonEl) return;
    if (!this._onCollapseClick) {
      this._onCollapseClick = () => this.toggleCollapsed();
    }
    this.collapseButtonEl.removeEventListener('click', this._onCollapseClick);
    this.collapseButtonEl.addEventListener('click', this._onCollapseClick);
  }

  connectedCallback() {
    this.ensureBuilt();
    this._ensureCollapseBinding();
    this._upgradeProperty('heading');
    this._upgradeProperty('collapsed');
    this._upgradeProperty('dock');
    this._upgradeProperty('panelId');
    this._syncFromAttributes();
  }

  disconnectedCallback() {}

  _upgradeProperty(prop) {
    if (Object.prototype.hasOwnProperty.call(this, prop)) {
      const value = this[prop];
      delete this[prop];
      this[prop] = value;
    }
  }

  attributeChangedCallback() {
    if (!this._built) return;
    this._syncFromAttributes();
  }

  _syncFromAttributes() {
    const heading = this.getAttribute('heading') ?? '';
    if (this.titleEl) this.titleEl.textContent = heading;
    const panelId = this.getAttribute('panel-id') ?? this.dataset.panelId ?? null;
    const explicitIcon = this.getAttribute('panel-icon') ?? null;
    const iconKind = explicitIcon || resolvePanelIconKind({ id: panelId, heading });
    if (this.titleIconEl) {
      this.titleIconEl.replaceChildren(createPanelIcon(this.ownerDocument ?? document, iconKind));
      this.titleIconEl.hidden = !iconKind;
    }

    const dock = this.getAttribute('dock') ?? this.dataset.dock ?? 'free';
    this.dataset.dock = dock;

    const collapsed = this.hasAttribute('collapsed');
    this.dataset.collapsed = collapsed ? 'true' : 'false';

    if (this.collapseButtonEl) {
      this.collapseButtonEl.textContent = collapsed ? '+' : '—';
      this.collapseButtonEl.title = collapsed ? 'Expand' : 'Collapse';
    }
    if (panelId != null) {
      this.dataset.panelId = String(panelId);
    }
  }

  get heading() {
    return this.getAttribute('heading') ?? '';
  }

  set heading(value) {
    if (value == null) this.removeAttribute('heading');
    else this.setAttribute('heading', String(value));
  }

  get dock() {
    return this.getAttribute('dock') ?? 'free';
  }

  set dock(value) {
    if (value == null) this.removeAttribute('dock');
    else this.setAttribute('dock', String(value));
  }

  get panelId() {
    return this.getAttribute('panel-id') ?? null;
  }

  set panelId(value) {
    if (value == null) this.removeAttribute('panel-id');
    else this.setAttribute('panel-id', String(value));
  }

  get panelIcon() {
    return this.getAttribute('panel-icon') ?? null;
  }

  set panelIcon(value) {
    if (value == null || value === '') this.removeAttribute('panel-icon');
    else this.setAttribute('panel-icon', String(value));
  }

  get collapsed() {
    return this.hasAttribute('collapsed') || this.dataset.collapsed === 'true';
  }

  set collapsed(value) {
    if (value) this.setAttribute('collapsed', '');
    else this.removeAttribute('collapsed');
  }

  setContent(content) {
    if (!this.bodyEl) return;
    this.bodyEl.textContent = '';
    if (content) this.bodyEl.appendChild(content);
  }

  setCollapsed(collapsed) {
    this.collapsed = Boolean(collapsed);
    this._syncFromAttributes();
  }

  toggleCollapsed() {
    this.setCollapsed(!this.collapsed);
  }
}
