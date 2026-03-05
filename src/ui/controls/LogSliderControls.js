function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateSliderVisual(slider) {
  if (!slider) return;
  const min = Number(slider.min);
  const max = Number(slider.max);
  const value = Number(slider.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || min === max) return;
  const pct = ((value - min) / (max - min)) * 100;
  slider.style.setProperty('--pct', String(clamp(pct, 0, 100)));
}

function defaultFormat(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  const abs = Math.abs(numeric);
  if ((abs > 0 && abs < 0.01) || abs >= 10000) {
    return numeric.toExponential(Math.max(1, digits - 1));
  }
  return numeric.toFixed(digits);
}

export class LogSliderControls {
  constructor({
    value,
    minExp,
    maxExp,
    stepExp = 0.05,
    minValue = null,
    maxValue = null,
    digits = 2,
    format = null,
    onCommit = null,
  }) {
    this.minExp = Number(minExp);
    this.maxExp = Number(maxExp);
    this.minValue = Number.isFinite(minValue) ? Number(minValue) : Math.pow(10, this.minExp);
    this.maxValue = Number.isFinite(maxValue) ? Number(maxValue) : Math.pow(10, this.maxExp);
    this.format = typeof format === 'function' ? format : (next) => defaultFormat(next, digits);
    this.onCommit = onCommit;

    this.element = document.createElement('div');
    this.element.className = 'helios-ui-slider-controls';

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.className = 'helios-ui-slider';
    this.slider.min = String(this.minExp);
    this.slider.max = String(this.maxExp);
    this.slider.step = String(stepExp);

    this.input = document.createElement('input');
    this.input.type = 'number';
    this.input.className = 'helios-ui-number';
    this.input.step = 'any';
    this.input.min = String(this.minValue);
    this.input.max = String(this.maxValue);

    this.element.appendChild(this.slider);
    this.element.appendChild(this.input);

    this.setValue(value ?? this.minValue);

    this._onSliderInput = () => {
      const numeric = this.valueFromExp(this.slider.value);
      this.setValue(numeric);
      this.onCommit?.(numeric);
    };
    this._onInputCommit = () => {
      const numeric = Number(this.input.value);
      if (!Number.isFinite(numeric)) return;
      const clamped = clamp(numeric, this.minValue, this.maxValue);
      this.setValue(clamped);
      this.onCommit?.(clamped);
    };
    this._onInputKeyDown = (event) => {
      if (event.key !== 'Enter') return;
      this._onInputCommit();
      this.input.blur();
    };

    this.slider.addEventListener('input', this._onSliderInput);
    this.input.addEventListener('change', this._onInputCommit);
    this.input.addEventListener('keydown', this._onInputKeyDown);
  }

  clampExp(exp) {
    return clamp(Number(exp), this.minExp, this.maxExp);
  }

  expFromValue(value) {
    const numeric = Number(value);
    const safe = Number.isFinite(numeric) ? clamp(numeric, this.minValue, this.maxValue) : this.minValue;
    return this.clampExp(Math.log10(Math.max(this.minValue, safe)));
  }

  valueFromExp(exp) {
    return clamp(Math.pow(10, this.clampExp(exp)), this.minValue, this.maxValue);
  }

  setValue(nextValue) {
    const exp = this.expFromValue(nextValue);
    const actual = this.valueFromExp(exp);
    this.slider.value = String(exp);
    this.input.value = this.format(actual);
    updateSliderVisual(this.slider);
  }

  destroy() {
    this.slider.removeEventListener('input', this._onSliderInput);
    this.input.removeEventListener('change', this._onInputCommit);
    this.input.removeEventListener('keydown', this._onInputKeyDown);
    this.element.remove();
  }
}

export default LogSliderControls;
