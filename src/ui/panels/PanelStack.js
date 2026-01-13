function resolveContainer(element) {
  if (element instanceof HTMLElement) return element;
  const div = document.createElement('div');
  if (element != null) div.textContent = String(element);
  return div;
}

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

    const toggle = document.createElement('span');
    toggle.className = 'helios-ui-subpanel__toggle';
    toggle.setAttribute('aria-hidden', 'true');

    const label = document.createElement('span');
    label.className = 'helios-ui-subpanel__label';
    label.textContent = options.title ?? options.id;

    const sync = () => {
      const collapsed = item.dataset.collapsed === 'true';
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.textContent = collapsed ? '+' : '−';
    };

    header.appendChild(toggle);
    header.appendChild(label);
    sync();

    const body = document.createElement('div');
    body.className = 'helios-ui-subpanel__body';
    body.appendChild(resolveContainer(options.content));

    header.addEventListener('click', () => {
      item.dataset.collapsed = item.dataset.collapsed === 'true' ? 'false' : 'true';
      sync();
    });

    item.appendChild(header);
    item.appendChild(body);
    this.element.appendChild(item);
    this._items.set(options.id, { item, header, body });
    return options.id;
  }

  destroy() {
    this.element.remove();
    this._items.clear();
  }
}

