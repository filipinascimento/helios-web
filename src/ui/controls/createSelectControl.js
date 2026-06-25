export function createSelectControl({
  options = [],
  value = null,
  className = 'helios-ui-select',
  ariaLabel = '',
  compact = false,
  onChange = null,
} = {}) {
  const select = document.createElement('select');
  select.className = compact ? `${className} helios-ui-select--compact` : className;
  if (ariaLabel) select.setAttribute('aria-label', ariaLabel);

  const setOptions = (nextOptions = [], nextValue = value) => {
    select.replaceChildren();
    for (const entry of nextOptions) {
      const option = document.createElement('option');
      option.value = String(entry?.value ?? '');
      option.textContent = entry?.label ?? String(entry?.value ?? '');
      if (entry?.disabled === true) option.disabled = true;
      select.appendChild(option);
    }
    if (nextValue != null) select.value = String(nextValue);
  };

  setOptions(options, value);
  if (onChange) {
    select.addEventListener('change', () => onChange(select.value));
  }
  select.setOptions = setOptions;
  return select;
}

export default createSelectControl;
