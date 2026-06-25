export function createSegmentedToggleControl({
  checked = false,
  disabled = false,
  onLabel = 'On',
  offLabel = 'Off',
  ariaLabel = null,
  className = 'helios-ui-segmented-toggle',
} = {}) {
  const root = document.createElement('div');
  root.className = className;
  root.setAttribute('role', 'radiogroup');
  if (ariaLabel) root.setAttribute('aria-label', String(ariaLabel));

  const labels = {
    on: String(onLabel ?? 'On'),
    off: String(offLabel ?? 'Off'),
  };

  const offButton = document.createElement('button');
  offButton.type = 'button';
  offButton.className = 'helios-ui-segmented-toggle__option';
  offButton.dataset.segment = 'off';
  offButton.dataset.value = 'false';
  offButton.setAttribute('role', 'radio');

  const onButton = document.createElement('button');
  onButton.type = 'button';
  onButton.className = 'helios-ui-segmented-toggle__option';
  onButton.dataset.segment = 'on';
  onButton.dataset.value = 'true';
  onButton.setAttribute('role', 'radio');

  root.appendChild(offButton);
  root.appendChild(onButton);

  let currentChecked = Boolean(checked);
  let currentDisabled = Boolean(disabled);

  const sync = () => {
    offButton.textContent = labels.off;
    onButton.textContent = labels.on;
    offButton.setAttribute('aria-checked', currentChecked ? 'false' : 'true');
    onButton.setAttribute('aria-checked', currentChecked ? 'true' : 'false');
    offButton.dataset.selected = currentChecked ? 'false' : 'true';
    onButton.dataset.selected = currentChecked ? 'true' : 'false';
    offButton.tabIndex = currentChecked ? -1 : 0;
    onButton.tabIndex = currentChecked ? 0 : -1;
    offButton.disabled = currentDisabled;
    onButton.disabled = currentDisabled;
    root.setAttribute('aria-disabled', currentDisabled ? 'true' : 'false');
    root.dataset.checked = currentChecked ? 'true' : 'false';
  };

  const setChecked = (value) => {
    const next = Boolean(value);
    if (next === currentChecked) return;
    currentChecked = next;
    sync();
    root.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const activateOption = (nextChecked) => {
    if (currentDisabled) return;
    setChecked(nextChecked);
  };

  const handleKeydown = (event) => {
    if (currentDisabled) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault();
      setChecked(false);
      offButton.focus?.();
      return;
    }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault();
      setChecked(true);
      onButton.focus?.();
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      setChecked(event.currentTarget === onButton);
    }
  };

  const handleOptionPointerUp = (nextChecked) => (event) => {
    if (currentDisabled) return;
    if (event.button != null && event.button !== 0) return;
    activateOption(nextChecked);
  };

  offButton.addEventListener('pointerup', handleOptionPointerUp(false));
  onButton.addEventListener('pointerup', handleOptionPointerUp(true));
  offButton.addEventListener('click', () => activateOption(false));
  onButton.addEventListener('click', () => activateOption(true));
  offButton.addEventListener('keydown', handleKeydown);
  onButton.addEventListener('keydown', handleKeydown);

  Object.defineProperty(root, 'checked', {
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

  Object.defineProperty(root, 'disabled', {
    configurable: true,
    enumerable: true,
    get() {
      return currentDisabled;
    },
    set(value) {
      currentDisabled = Boolean(value);
      sync();
    },
  });

  root.setLabels = ({ on, off } = {}) => {
    if (on != null) labels.on = String(on);
    if (off != null) labels.off = String(off);
    sync();
  };

  sync();
  return root;
}

export default createSegmentedToggleControl;
