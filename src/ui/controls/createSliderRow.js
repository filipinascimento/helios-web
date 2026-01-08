function formatNumber(value, precision = 3) {
  const v = Number(value);
  if (!Number.isFinite(v)) return String(value);
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toFixed(0);
  if (abs >= 100) return v.toFixed(1);
  if (abs >= 10) return v.toFixed(2);
  return v.toFixed(precision);
}

function clampToRange(value, range) {
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (!range) return v;
  return Math.max(range.min, Math.min(range.max, v));
}

export function createSliderRow(attribute, options = {}) {
  const title = options.title ?? attribute.label ?? attribute.id;
  const hint = options.hint ?? null;
  const fallbackRange = {
    min: attribute.min ?? 0,
    max: attribute.max ?? 1,
  };
  const sliderRange = attribute.recommendedRange ?? attribute.domain ?? fallbackRange;
  const inputRange = attribute.domain ?? sliderRange;
  const step = options.step ?? attribute.step ?? 0.01;

  const row = document.createElement('div');
  row.className = 'helios-ui-row';

  const label = document.createElement('div');
  label.className = 'helios-ui-label';
  const labelTitle = document.createElement('div');
  labelTitle.className = 'helios-ui-label__title';
  labelTitle.textContent = title;
  label.appendChild(labelTitle);
  if (hint) {
    const labelHint = document.createElement('div');
    labelHint.className = 'helios-ui-label__hint';
    labelHint.textContent = hint;
    label.appendChild(labelHint);
  }

  const right = document.createElement('div');
  right.style.display = 'grid';
  right.style.gap = '3px';
  right.style.justifyItems = 'end';

  const valueInput = document.createElement('input');
  valueInput.className = 'helios-ui-number';
  valueInput.type = 'number';
  valueInput.inputMode = 'decimal';
  valueInput.step = String(step);
  valueInput.disabled = attribute.readOnly;
  if (inputRange) {
    valueInput.min = String(inputRange.min);
    valueInput.max = String(inputRange.max);
  }

  const slider = document.createElement('input');
  slider.className = 'helios-ui-slider';
  slider.type = 'range';
  slider.min = String(sliderRange.min);
  slider.max = String(sliderRange.max);
  slider.step = String(step);
  slider.disabled = attribute.readOnly;

  const updateFromAttribute = (value) => {
    const v = Number(value);
    if (Number.isFinite(v)) slider.value = String(clampToRange(v, sliderRange));
    valueInput.value = formatNumber(value, options.precision ?? 3);
  };

  const unsub = attribute.subscribe(updateFromAttribute);

  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    if (!Number.isFinite(v)) return;
    attribute.write(v, { source: 'ui', event: 'input' });
  });

  const commitTypedValue = (eventName) => {
    const v = clampToRange(valueInput.value, inputRange ?? null);
    if (v == null) return;
    attribute.write(v, { source: 'ui', event: eventName });
  };

  valueInput.addEventListener('change', () => commitTypedValue('change'));
  valueInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commitTypedValue('enter');
      valueInput.blur();
    }
  });

  right.appendChild(valueInput);
  row.appendChild(label);
  row.appendChild(right);
  row.appendChild(slider);

  slider.style.gridColumn = '1 / -1';

  return {
    element: row,
    destroy: () => unsub(),
  };
}
