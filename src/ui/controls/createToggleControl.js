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
  let suppressClick = false;

  const sync = () => {
    const nextAriaChecked = currentChecked ? 'true' : 'false';
    if (button.getAttribute('aria-checked') !== nextAriaChecked) {
      button.setAttribute('aria-checked', nextAriaChecked);
    }
    const nextText = currentChecked ? labels.on : labels.off;
    if (text.textContent !== nextText) {
      text.textContent = nextText;
    }
  };

  const commitToggle = () => {
    if (button.disabled) return;
    button.checked = !button.checked;
    button.dispatchEvent(new Event('change', { bubbles: true }));
  };

  Object.defineProperty(button, 'checked', {
    configurable: true,
    enumerable: true,
    get() {
      return currentChecked;
    },
    set(value) {
      const nextChecked = Boolean(value);
      if (nextChecked === currentChecked) return;
      currentChecked = nextChecked;
      sync();
    },
  });

  button.setLabels = ({ on, off } = {}) => {
    const previousText = currentChecked ? labels.on : labels.off;
    if (on != null) labels.on = String(on);
    if (off != null) labels.off = String(off);
    if ((currentChecked ? labels.on : labels.off) !== previousText) sync();
  };

  button.addEventListener('pointerup', (event) => {
    if (button.disabled) return;
    if (event.button != null && event.button !== 0) return;
    suppressClick = true;
    commitToggle();
  });

  button.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    commitToggle();
  });

  button.disabled = Boolean(disabled);
  sync();
  return button;
}

export default createToggleControl;
