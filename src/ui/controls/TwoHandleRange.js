import { createFpsThrottle } from './createFpsThrottle.js';

export class TwoHandleRange {
  constructor({ min, max, value, step, onChange, onCommit, allowRangeDrag = true }) {
    this.element = document.createElement('div');
    this.element.className = 'helios-ui-range2';

    const track = document.createElement('div');
    track.className = 'helios-ui-range2__track';
    const bar = document.createElement('div');
    bar.className = 'helios-ui-range2__bar';
    const rangeEl = document.createElement('div');
    rangeEl.className = 'helios-ui-range2__range';
    track.appendChild(bar);
    track.appendChild(rangeEl);

    const aInput = document.createElement('input');
    aInput.type = 'range';
    aInput.className = 'helios-ui-slider helios-ui-range2__input';
    const bInput = document.createElement('input');
    bInput.type = 'range';
    bInput.className = 'helios-ui-slider helios-ui-range2__input';

    const syncRanges = () => {
      aInput.min = String(min);
      aInput.max = String(max);
      aInput.step = String(step);
      bInput.min = String(min);
      bInput.max = String(max);
      bInput.step = String(step);
    };
    syncRanges();

    const clampTo = (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return null;
      const snappedMin = Math.abs(n - min) <= step / 2 ? min : n;
      const snappedMax = Math.abs(snappedMin - max) <= step / 2 ? max : snappedMin;
      return Math.max(min, Math.min(max, snappedMax));
    };

    const setVisual = (lo, hi) => {
      const span = max - min;
      const loPct = span === 0 ? 0 : ((lo - min) / span) * 100;
      const hiPct = span === 0 ? 100 : ((hi - min) / span) * 100;
      track.style.setProperty('--min-pct', String(Math.max(0, Math.min(100, loPct))));
      track.style.setProperty('--max-pct', String(Math.max(0, Math.min(100, hiPct))));
    };
    this.setVisual = setVisual;

    const seedLo = clampTo(value?.[0] ?? min) ?? min;
    const seedHi = clampTo(value?.[1] ?? max) ?? max;
    const lo0 = Math.min(seedLo, seedHi);
    const hi0 = Math.max(seedLo, seedHi);
    aInput.value = String(lo0);
    bInput.value = String(hi0);
    setVisual(lo0, hi0);
    const emitChange = createFpsThrottle((lo, hi) => {
      onChange?.([lo, hi]);
    });
    const emitCommit = (lo, hi) => {
      onCommit?.([lo, hi]);
    };

    const commit = (source) => {
      const a = clampTo(aInput.value);
      const b = clampTo(bInput.value);
      if (a == null || b == null) return;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (source === 'a' && a > hi) aInput.value = String(hi);
      if (source === 'b' && b < lo) bInput.value = String(lo);
      setVisual(lo, hi);
      emitChange(lo, hi);
      return [lo, hi];
    };

    const flushCommit = (source) => {
      const committed = commit(source);
      emitChange.flush();
      if (committed) emitCommit(...committed);
    };

    // Dragging the highlighted range pans both thumbs together.
    const onRangePointerDown = (event) => {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();

      const rect = track.getBoundingClientRect();
      const widthPx = Math.max(1, rect.width);
      const domainSpan = max - min;
      if (!Number.isFinite(domainSpan) || Math.abs(domainSpan) < 1e-9) return;

      const startX = event.clientX;
      const startA = clampTo(aInput.value) ?? min;
      const startB = clampTo(bInput.value) ?? max;
      const startLo = Math.min(startA, startB);
      const startHi = Math.max(startA, startB);
      const rangeSpan = startHi - startLo;

      const clampRangeToBounds = (lo, hi) => {
        let nextLo = lo;
        let nextHi = hi;
        if (nextLo < min) {
          const shift = min - nextLo;
          nextLo = min;
          nextHi += shift;
        }
        if (nextHi > max) {
          const shift = nextHi - max;
          nextHi = max;
          nextLo -= shift;
        }
        if (nextLo < min) nextLo = min;
        if (nextHi > max) nextHi = max;
        if (Number.isFinite(rangeSpan) && rangeSpan >= 0) {
          const currentSpan = nextHi - nextLo;
          if (currentSpan !== rangeSpan) {
            nextHi = nextLo + rangeSpan;
            if (nextHi > max) {
              nextHi = max;
              nextLo = Math.max(min, max - rangeSpan);
            }
          }
        }
        return [nextLo, nextHi];
      };

      const onMove = (moveEvent) => {
        const dxPx = moveEvent.clientX - startX;
        const delta = (dxPx / widthPx) * domainSpan;
        const [nextLo, nextHi] = clampRangeToBounds(startLo + delta, startHi + delta);
        aInput.value = String(nextLo);
        bInput.value = String(nextHi);
        setVisual(nextLo, nextHi);
        emitChange(nextLo, nextHi);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        emitChange.flush();
        const a = clampTo(aInput.value);
        const b = clampTo(bInput.value);
        if (a == null || b == null) return;
        emitCommit(Math.min(a, b), Math.max(a, b));
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    const onAInput = () => commit('a');
    const onBInput = () => commit('b');
    const onAChange = () => flushCommit('a');
    const onBChange = () => flushCommit('b');
    if (allowRangeDrag) {
      rangeEl.addEventListener('pointerdown', onRangePointerDown);
    }
    aInput.addEventListener('input', onAInput);
    bInput.addEventListener('input', onBInput);
    aInput.addEventListener('change', onAChange);
    bInput.addEventListener('change', onBChange);

    this._destroy = () => {
      emitChange.cancel();
      if (allowRangeDrag) {
        rangeEl.removeEventListener('pointerdown', onRangePointerDown);
      }
      aInput.removeEventListener('input', onAInput);
      bInput.removeEventListener('input', onBInput);
      aInput.removeEventListener('change', onAChange);
      bInput.removeEventListener('change', onBChange);
      this.element.remove();
    };

    this.aInput = aInput;
    this.bInput = bInput;

    track.appendChild(aInput);
    track.appendChild(bInput);
    this.element.appendChild(track);
  }

  destroy() {
    this._destroy?.();
    this._destroy = null;
  }
}
