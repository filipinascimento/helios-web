function resolveContainer(element) {
  if (element instanceof HTMLElement) return element;
  const div = document.createElement('div');
  if (element != null) div.textContent = String(element);
  return div;
}

function appendResolved(target, value) {
  if (value == null) return;
  if (Array.isArray(value)) {
    for (const entry of value) appendResolved(target, entry);
    return;
  }
  if (value instanceof Node) {
    target.appendChild(value);
    return;
  }
  target.appendChild(resolveContainer(value));
}

/**
 * Collapsible stack of UI subpanels used by the optional Helios UI.
 *
 * @public
 * @apiSection User Interface
 * @param {object} [options] - Stack options.
 * @param {Array<object>} [options.items] - Initial panel items.
 */
export class PanelStack {
  constructor(options = {}) {
    this.element = document.createElement('div');
    this.element.className = 'helios-ui-stack';
    this._items = new Map();
    const items = options.items ?? [];
    for (const item of items) this.add(item);
  }

  add(options) {
    if (!options?.id) throw new Error('PanelStack.add requires id');
    if (this._items.has(options.id)) throw new Error(`Stack item "${options.id}" already exists`);

    const item = document.createElement('div');
    item.className = 'helios-ui-subpanel';
    item.dataset.collapsed = options.collapsed ? 'true' : 'false';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'helios-ui-subpanel__header';
    const headerRow = document.createElement('div');
    headerRow.className = 'helios-ui-subpanel__header-row';

    const toggle = document.createElement('span');
    toggle.className = 'helios-ui-subpanel__toggle';
    toggle.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'helios-ui-subpanel__label';
    label.textContent = options.title ?? options.id;

    let status = null;
    if (options.statusDot !== false) {
      status = document.createElement('span');
      status.className = 'helios-ui-subpanel__status';
      status.dataset.state = 'idle';
      status.hidden = true;
      status.setAttribute('aria-hidden', 'true');
    }

    const sync = () => {
      const collapsed = item.dataset.collapsed === 'true';
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.textContent = collapsed ? '+' : '−';
    };

    header.appendChild(toggle);
    if (status) header.appendChild(status);
    header.appendChild(label);
    headerRow.appendChild(header);
    let headerControls = null;
    if (options.headerControls != null) {
      headerControls = document.createElement('div');
      headerControls.className = 'helios-ui-subpanel__header-controls';
      appendResolved(headerControls, options.headerControls);
      if (headerControls.childNodes.length > 0) {
        headerRow.appendChild(headerControls);
      } else {
        headerControls = null;
      }
    }
    sync();

    const body = document.createElement('div');
    body.className = 'helios-ui-subpanel__body';
    body.appendChild(resolveContainer(options.content));

    header.addEventListener('click', () => {
      item.dataset.collapsed = item.dataset.collapsed === 'true' ? 'false' : 'true';
      sync();
    });

    item.appendChild(headerRow);
    item.appendChild(body);
    this.element.appendChild(item);
    this._items.set(options.id, { item, header, headerRow, headerControls, body, status });
    return options.id;
  }

  setStatus(id, status) {
    const entry = this._items.get(id);
    if (!entry?.status) return;
    const normalized = typeof status === 'string' ? status : 'idle';
    entry.status.dataset.state = normalized;
    entry.status.hidden = normalized === 'none';
  }

  destroy() {
    this.element.remove();
    this._items.clear();
  }
}
