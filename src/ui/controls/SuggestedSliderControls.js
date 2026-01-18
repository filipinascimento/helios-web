function updateSliderVisual(slider) {
  if (!slider) return;
  const min = Number(slider.min);
  const max = Number(slider.max);
  const value = Number(slider.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(value) || min === max) return;
  const pct = ((value - min) / (max - min)) * 100;
  slider.style.setProperty('--pct', String(Math.max(0, Math.min(100, pct))));
}

export class SuggestedSliderControls {
  constructor({
    value,
    suggested,
    step,
    inputMin = null,
    inputMax = null,
    onCommit = null,
  }) {
    this.element = document.createElement('div');
    this.element.className = 'helios-ui-slider-controls';

    this.slider = document.createElement('input');
    this.slider.type = 'range';
    this.slider.className = 'helios-ui-slider';
    this.slider.min = String(suggested[0]);
    this.slider.max = String(suggested[1]);
    this.slider.step = String(step);

    this.input = document.createElement('input');
    this.input.type = 'number';
    this.input.className = 'helios-ui-number';
    this.input.step = String(step);
    if (inputMin != null) this.input.min = String(inputMin);
    else this.input.removeAttribute('min');
    if (inputMax != null) this.input.max = String(inputMax);
    else this.input.removeAttribute('max');

    const set = (next) => {
      const n = Number(next);
      if (!Number.isFinite(n)) return;
      const min = Number(this.slider.min);
      const max = Number(this.slider.max);
      const clamped = Math.max(min, Math.min(max, n));
      this.slider.value = String(clamped);
      this.input.value = String(n);
      updateSliderVisual(this.slider);
    };
    this.set = set;

    set(value);

    const onSliderInput = () => {
      this.input.value = String(this.slider.value);
      updateSliderVisual(this.slider);
      onCommit?.(this.slider.value);
    };
    const onInputChange = () => {
      set(this.input.value);
      onCommit?.(this.input.value);
    };
    const onInputKeyDown = (event) => {
      if (event.key === 'Enter') {
        set(this.input.value);
        onCommit?.(this.input.value);
        this.input.blur();
      }
    };

    this.slider.addEventListener('input', onSliderInput);
    this.input.addEventListener('change', onInputChange);
    this.input.addEventListener('keydown', onInputKeyDown);

    this._destroy = () => {
      this.slider.removeEventListener('input', onSliderInput);
      this.input.removeEventListener('change', onInputChange);
      this.input.removeEventListener('keydown', onInputKeyDown);
      this.element.remove();
    };

    this.element.appendChild(this.slider);
    this.element.appendChild(this.input);
  }

  destroy() {
    this._destroy?.();
    this._destroy = null;
  }
}

