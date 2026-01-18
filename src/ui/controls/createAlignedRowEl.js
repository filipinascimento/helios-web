export function createAlignedRowEl({ title, hint, controls, attachTooltip }) {
  const row = document.createElement('div');
  row.className = 'helios-ui-row helios-ui-row--aligned';
  const label = document.createElement('div');
  label.className = 'helios-ui-label';

  const titleRowEl = document.createElement('div');
  titleRowEl.className = 'helios-ui-label__title-row';
  const titleEl = document.createElement('div');
  titleEl.className = 'helios-ui-label__title';
  titleEl.textContent = title ?? '';
  titleRowEl.appendChild(titleEl);
  label.appendChild(titleRowEl);
  if (hint) attachTooltip?.(titleEl, hint);

  row.appendChild(label);
  const controlWrap = document.createElement('div');
  controlWrap.className = 'helios-ui-row__controls';
  if (controls) controlWrap.appendChild(controls);
  row.appendChild(controlWrap);
  return { row, titleEl, controlWrap };
}

