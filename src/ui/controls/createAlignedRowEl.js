function createDefaultPersistenceIndicator() {
  const indicator = document.createElement('span');
  indicator.className = 'helios-ui-dirty-indicator helios-ui-dirty-indicator--static';
  indicator.dataset.state = 'default';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.destroy = () => {};
  return indicator;
}

export function createAlignedRowEl({
  title,
  hint,
  controls,
  dirtyIndicator,
  attachTooltip,
  rowClass = null,
}) {
  const row = document.createElement('div');
  row.className = 'helios-ui-row helios-ui-row--aligned';
  if (rowClass) {
    for (const className of String(rowClass).split(/\s+/).filter(Boolean)) {
      row.classList.add(className);
    }
  }
  const label = document.createElement('div');
  label.className = 'helios-ui-label';

  const titleRowEl = document.createElement('div');
  titleRowEl.className = 'helios-ui-label__title-row';
  const titleEl = document.createElement('div');
  titleEl.className = 'helios-ui-label__title';
  titleEl.textContent = title ?? '';
  titleRowEl.appendChild(titleEl);
  const indicator = dirtyIndicator === undefined ? createDefaultPersistenceIndicator() : dirtyIndicator;
  if (indicator) titleRowEl.appendChild(indicator);
  label.appendChild(titleRowEl);
  if (hint) attachTooltip?.(titleEl, hint);

  row.appendChild(label);
  const controlWrap = document.createElement('div');
  controlWrap.className = 'helios-ui-row__controls';
  if (controls) controlWrap.appendChild(controls);
  const hasSliderControls =
    Boolean(controls?.classList?.contains('helios-ui-slider-controls'))
    || Boolean(controls?.querySelector?.('.helios-ui-slider-controls'));
  if (hasSliderControls) row.classList.add('helios-ui-row--slider');
  row.appendChild(controlWrap);
  return { row, titleEl, controlWrap };
}
