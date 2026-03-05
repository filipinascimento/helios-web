export function createToggleControl({
  checked = false,
  disabled = false,
  onLabel = 'On',
  offLabel = 'Off',
  ariaLabel = null,
  className = 'helios-ui-toggle',
} = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.setAttribute('role', 'switch');
  if (ariaLabel) button.setAttribute('aria-label', String(ariaLabel));

  const thumb = document.createElement('span');
  thumb.className = 'helios-ui-toggle__thumb';
  thumb.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'helios-ui-toggle__text';

  button.appendChild(thumb);
  button.appendChild(text);

  const labels = {
    on: String(onLabel ?? 'On'),
    off: String(offLabel ?? 'Off'),
  };

  let currentChecked = Boolean(checked);

  const sync = () => {
    button.setAttribute('aria-checked', currentChecked ? 'true' : 'false');
    text.textContent = currentChecked ? labels.on : labels.off;
  };

  Object.defineProperty(button, 'checked', {
    configurable: true,
    enumerable: true,
    get() {
      return currentChecked;
    },
    set(value) {
      currentChecked = Boolean(value);
      sync();
    },
  });

  button.setLabels = ({ on, off } = {}) => {
    if (on != null) labels.on = String(on);
    if (off != null) labels.off = String(off);
    sync();
  };

  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.checked = !button.checked;
    button.dispatchEvent(new Event('change', { bubbles: true }));
  });

  button.disabled = Boolean(disabled);
  sync();
  return button;
}

export default createToggleControl;
