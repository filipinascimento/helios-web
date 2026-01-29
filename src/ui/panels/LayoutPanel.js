import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';

export class LayoutPanel {
  constructor(ui, options = {}) {
    this.ui = ui;
    this.options = options;
  }

  create() {
    const content = document.createElement('div');

    const placeholder = document.createElement('div');
    placeholder.className = 'helios-ui-label__hint';
    placeholder.textContent = this.options.placeholder ?? 'Layout controls will appear here.';

    const { row } = createAlignedRowEl({
      title: this.options.placeholderTitle ?? 'Status',
      controls: placeholder,
    });
    content.appendChild(row);

    return this.ui.createPanel({
      id: this.options.id ?? 'helios-ui-layout',
      title: this.options.title ?? 'Layout',
      position: this.options.position ?? { x: 16, y: 360 },
      dock: this.options.dock ?? 'top-right',
      content,
    });
  }
}
