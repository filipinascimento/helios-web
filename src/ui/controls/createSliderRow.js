import { createFpsThrottle } from './createFpsThrottle.js';

function createDefaultPersistenceIndicator() {
  const indicator = document.createElement('span');
  indicator.className = 'helios-ui-dirty-indicator helios-ui-dirty-indicator--static';
  indicator.dataset.state = 'default';
  indicator.setAttribute('aria-hidden', 'true');
  indicator.destroy = () => {};
  return indicator;
}

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
  let v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (!range) return v;
  const min = range.min;
  const max = range.max;
  if (min != null) {
    const minNumber = Number(min);
    if (Number.isFinite(minNumber)) v = Math.max(minNumber, v);
  }
  if (max != null) {
    const maxNumber = Number(max);
    if (Number.isFinite(maxNumber)) v = Math.min(maxNumber, v);
  }
  return v;
}

export function createSliderRow(attribute, options = {}) {
  const title = options.title ?? attribute.label ?? attribute.id;
  const hint = options.hint ?? null;
  const fallbackRange = {
    min: attribute.min ?? 0,
    max: attribute.max ?? 1,
  };
  const sliderRange = attribute.recommendedRange ?? attribute.domain ?? fallbackRange;
  const inputMin = Object.prototype.hasOwnProperty.call(attribute.meta ?? {}, 'inputMin')
    ? Number(attribute.meta?.inputMin)
    : (attribute.domain?.min ?? sliderRange.min);
  const inputMaxOverride = Object.prototype.hasOwnProperty.call(attribute.meta ?? {}, 'inputMax')
    ? attribute.meta?.inputMax
    : null;
  const inputMax = inputMaxOverride === null
    ? null
    : (inputMaxOverride != null ? Number(inputMaxOverride) : (attribute.domain?.max ?? sliderRange.max));
  const inputRange =
    (Number.isFinite(inputMin) || Number.isFinite(inputMax))
      ? { min: inputMin, max: inputMax }
      : null;
  const step = options.step ?? attribute.step ?? 0.01;

  const row = document.createElement('div');
  row.className = 'helios-ui-row helios-ui-row--aligned helios-ui-row--slider';

  const label = document.createElement('div');
  label.className = 'helios-ui-label';
  const labelTitle = document.createElement('div');
  labelTitle.className = 'helios-ui-label__title-row';
  const labelTitleText = document.createElement('div');
  labelTitleText.className = 'helios-ui-label__title';
  labelTitleText.textContent = title;
  labelTitle.appendChild(labelTitleText);
  const dirtyIndicator = options.dirtyIndicator === undefined
    ? createDefaultPersistenceIndicator()
    : options.dirtyIndicator;
  if (dirtyIndicator) labelTitle.appendChild(dirtyIndicator);

  let tooltip = null;
  let tooltipRoot = null;
  let hideTooltipTimer = null;
  let removeTooltipListeners = null;

  const setTooltipHidden = (hidden) => {
    if (!tooltip) return;
    tooltip.dataset.open = hidden ? 'false' : 'true';
    tooltip.hidden = hidden;
  };

  const resolveTooltipRoot = () => row.closest?.('.helios-ui') ?? row.ownerDocument?.body ?? document.body;

  const placeTooltip = () => {
    if (!tooltip) return;
    const anchor = tooltip.dataset.anchorId ? row.ownerDocument?.getElementById?.(tooltip.dataset.anchorId) : null;
    const el = anchor ?? null;
    if (!el) return;

    const margin = 8;
    const rect = el.getBoundingClientRect();
    const { innerWidth: vw, innerHeight: vh } = window;

    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    tooltip.style.transform = 'translate(-9999px, -9999px)';
    const tipRect = tooltip.getBoundingClientRect();

    const preferredLeft = rect.left + rect.width / 2 - tipRect.width / 2;
    const left = Math.max(margin, Math.min(vw - margin - tipRect.width, preferredLeft));

    const preferredTop = rect.top - 8 - tipRect.height;
    const fallbackTop = rect.bottom + 8;
    const top = preferredTop >= margin ? preferredTop : Math.min(vh - margin - tipRect.height, fallbackTop);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.transform = 'translate(0, 0)';
  };

  const scheduleHideTooltip = () => {
    if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
    hideTooltipTimer = window.setTimeout(() => setTooltipHidden(true), 120);
  };

  const showTooltip = () => {
    if (!tooltip) return;
    if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
    if (!tooltipRoot) {
      tooltipRoot = resolveTooltipRoot();
      tooltipRoot.appendChild(tooltip);
    }
    setTooltipHidden(false);
    placeTooltip();
  };

  if (hint) {
    tooltip = document.createElement('div');
    tooltip.className = 'helios-ui-tooltip';
    tooltip.hidden = true;
    tooltip.dataset.open = 'false';
    tooltip.textContent = hint;
    tooltip.setAttribute('role', 'tooltip');
    const tooltipId = `helios-ui-tooltip-${Math.random().toString(16).slice(2)}`;
    tooltip.dataset.anchorId = tooltipId;
    labelTitleText.id = tooltipId;
    labelTitleText.tabIndex = 0;

    const onPointerEnter = () => showTooltip();
    const onPointerLeave = () => scheduleHideTooltip();
    const onFocus = () => showTooltip();
    const onBlur = () => setTooltipHidden(true);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setTooltipHidden(true);
        labelTitleText.blur();
      }
    };
    const onScrollOrResize = () => {
      if (!tooltip || tooltip.hidden) return;
      placeTooltip();
    };

    labelTitleText.addEventListener('pointerenter', onPointerEnter);
    labelTitleText.addEventListener('pointerleave', onPointerLeave);
    labelTitleText.addEventListener('focus', onFocus);
    labelTitleText.addEventListener('blur', onBlur);
    labelTitleText.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScrollOrResize, { capture: true });
    window.addEventListener('resize', onScrollOrResize);

    removeTooltipListeners = () => {
      labelTitleText.removeEventListener('pointerenter', onPointerEnter);
      labelTitleText.removeEventListener('pointerleave', onPointerLeave);
      labelTitleText.removeEventListener('focus', onFocus);
      labelTitleText.removeEventListener('blur', onBlur);
      labelTitleText.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScrollOrResize, { capture: true });
      window.removeEventListener('resize', onScrollOrResize);
    };
  }

  label.appendChild(labelTitle);

  const controls = document.createElement('div');
  controls.className = 'helios-ui-slider-controls';

  const valueInput = document.createElement('input');
  valueInput.className = 'helios-ui-number';
  valueInput.type = 'number';
  valueInput.inputMode = 'decimal';
  valueInput.step = String(step);
  valueInput.disabled = attribute.readOnly;
  if (inputRange) {
    if (Number.isFinite(inputRange.min)) valueInput.min = String(inputRange.min);
    if (Number.isFinite(inputRange.max)) valueInput.max = String(inputRange.max);
  }

  const slider = document.createElement('input');
  slider.className = 'helios-ui-slider';
  slider.type = 'range';
  slider.min = String(sliderRange.min);
  slider.max = String(sliderRange.max);
  slider.step = String(step);
  slider.disabled = attribute.readOnly;

  const updateSliderVisual = () => {
    const min = Number(slider.min);
    const max = Number(slider.max);
    const value = Number(slider.value);
    if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || min === max) return;
    const pct = ((value - min) / (max - min)) * 100;
    slider.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct))));
  };

  const updateFromAttribute = (value) => {
    const v = Number(value);
    if (Number.isFinite(v)) slider.value = String(clampToRange(v, sliderRange));
    valueInput.value = formatNumber(value, options.precision ?? 3);
    updateSliderVisual();
  };

  const unsub = attribute.subscribe(updateFromAttribute);
  const writeSliderValue = createFpsThrottle((nextValue) => {
    const v = Number(nextValue);
    if (!Number.isFinite(v)) return;
    attribute.write(v, { source: 'ui', event: 'input' });
  });

  slider.addEventListener('input', () => {
    const v = Number(slider.value);
    if (!Number.isFinite(v)) return;
    updateSliderVisual();
    writeSliderValue(v);
  });
  slider.addEventListener('change', () => {
    const v = Number(slider.value);
    if (!Number.isFinite(v)) return;
    updateSliderVisual();
    writeSliderValue(v);
    writeSliderValue.flush();
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

  row.appendChild(label);
  controls.appendChild(slider);
  controls.appendChild(valueInput);
  row.appendChild(controls);

  return {
    element: row,
    destroy: () => {
      unsub();
      writeSliderValue.cancel();
      if (hideTooltipTimer != null) window.clearTimeout(hideTooltipTimer);
      removeTooltipListeners?.();
      tooltip?.remove?.();
      tooltip = null;
      tooltipRoot = null;
    },
  };
}
