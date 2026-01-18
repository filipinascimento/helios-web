function resolveContainer(element) {
  if (element instanceof HTMLElement) return element;
  const div = document.createElement('div');
  if (element != null) div.textContent = String(element);
  return div;
}

export class TabbedPanel {
  constructor(options = {}) {
    this.element = document.createElement('div');
    this.element.className = 'helios-ui-tabs';

    this.bar = document.createElement('div');
    this.bar.className = 'helios-ui-tabs__bar';
    this.barLeft = document.createElement('div');
    this.barLeft.className = 'helios-ui-tabs__bar-left';
    this.barRight = document.createElement('div');
    this.barRight.className = 'helios-ui-tabs__bar-right';
    this.content = document.createElement('div');
    this.content.className = 'helios-ui-tabs__content';

    this.bar.appendChild(this.barLeft);
    this.bar.appendChild(this.barRight);
    this.element.appendChild(this.bar);
    this.element.appendChild(this.content);

    this._tabs = new Map();
    this._activeId = null;
    this._onActiveChanged = typeof options.onActiveChanged === 'function' ? options.onActiveChanged : null;

    if (options.barRight) {
      this.barRight.appendChild(resolveContainer(options.barRight));
    }

    const tabs = options.tabs ?? [];
    for (const tab of tabs) this.addTab(tab);
    if (options.activeId) this.setActive(options.activeId);
    if (!this._activeId && tabs.length) this.setActive(tabs[0].id);
  }

  addTab(tab) {
    if (!tab?.id) throw new Error('TabbedPanel.addTab requires tab.id');
    if (this._tabs.has(tab.id)) throw new Error(`Tab "${tab.id}" already exists`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'helios-ui-tab';
    button.textContent = tab.title ?? tab.id;
    button.addEventListener('click', () => this.setActive(tab.id));

    const panel = document.createElement('div');
    panel.className = 'helios-ui-tabpanel';
    panel.dataset.tabId = tab.id;
    panel.appendChild(resolveContainer(tab.content));

    this.barLeft.appendChild(button);
    this.content.appendChild(panel);
    this._tabs.set(tab.id, { id: tab.id, button, panel });

    if (!this._activeId) this.setActive(tab.id);
    return tab.id;
  }

  setActive(id) {
    if (!this._tabs.has(id)) return;
    this._activeId = id;
    for (const [tabId, tab] of this._tabs.entries()) {
      const active = tabId === id;
      tab.button.dataset.active = active ? 'true' : 'false';
      tab.panel.dataset.active = active ? 'true' : 'false';
    }
    if (this._onActiveChanged) {
      try {
        this._onActiveChanged(id);
      } catch (_) {
        // ignore callback failures
      }
    }
  }

  activeId() {
    return this._activeId;
  }

  destroy() {
    this.element.remove();
    this._tabs.clear();
    this._activeId = null;
  }
}
