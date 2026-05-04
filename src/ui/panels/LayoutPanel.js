import { EVENTS } from '../../Helios.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { LogSliderControls } from '../controls/LogSliderControls.js';

const CURRENT_POSITION_ATTRIBUTE = '_helios_visuals_position';

function toFinite(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatDisplayNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  const abs = Math.abs(numeric);
  if (abs >= 1000) return numeric.toFixed(0);
  if (abs >= 100) return numeric.toFixed(1);
  if (abs >= 10) return numeric.toFixed(2);
  if (abs >= 1) return numeric.toFixed(3);
  if (abs >= 0.01) return numeric.toFixed(4);
  return numeric.toExponential(2);
}

function formatBindingValue(binding, value) {
  if (typeof binding?.format === 'function') {
    try {
      return String(binding.format(value));
    } catch (_) {
      return String(value ?? '—');
    }
  }
  if (typeof value === 'number') return formatDisplayNumber(value);
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (value == null || value === '') return '—';
  return String(value);
}

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  let next = numeric;
  const minValue = resolveFiniteBound(min, null);
  const maxValue = resolveFiniteBound(max, null);
  if (Number.isFinite(minValue)) next = Math.max(minValue, next);
  if (Number.isFinite(maxValue)) next = Math.min(maxValue, next);
  return next;
}

function resolveFiniteBound(primary, fallback = null) {
  if (primary == null || primary === '') {
    if (fallback == null || fallback === '') return null;
    const fallbackNumeric = Number(fallback);
    return Number.isFinite(fallbackNumeric) ? fallbackNumeric : null;
  }
  const numeric = Number(primary);
  if (Number.isFinite(numeric)) return numeric;
  if (fallback == null || fallback === '') return null;
  const fallbackNumeric = Number(fallback);
  return Number.isFinite(fallbackNumeric) ? fallbackNumeric : null;
}

function usesLogScale(binding) {
  return binding?.scale === 'log';
}

function formatInputNumber(value, binding) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  if (binding?.notation === 'scientific') {
    return numeric.toExponential(2);
  }
  const step = Number(binding?.step);
  if (Number.isFinite(step) && step >= 1) {
    return String(Math.round(numeric));
  }
  return String(Number(numeric.toFixed(6)));
}

function formatHistoryValue(value, scale = 'linear') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (scale === 'log') {
    return Math.log10(Math.max(1e-6, numeric));
  }
  return numeric;
}

function resolveHistoryBound(bound) {
  const raw = typeof bound === 'function' ? bound() : bound;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
}

export function buildSparklinePath(samples, width, height, scale = 'linear', bounds = null) {
  const values = samples
    .map((sample) => Number(sample))
    .filter((sample) => Number.isFinite(sample));
  if (!values.length) return '';

  const transformed = values
    .map((sample) => formatHistoryValue(sample, scale))
    .filter((sample) => Number.isFinite(sample));
  if (!transformed.length) return '';

  const boundMin = resolveHistoryBound(bounds?.min);
  const boundMax = resolveHistoryBound(bounds?.max);
  const min = Number.isFinite(boundMin)
    ? formatHistoryValue(boundMin, scale)
    : Math.min(...transformed);
  const max = Number.isFinite(boundMax)
    ? formatHistoryValue(boundMax, scale)
    : Math.max(...transformed);
  const span = Math.max(1e-9, max - min);
  if (transformed.length === 1) {
    const normalized = span <= 1e-9 ? 0.5 : Math.max(0, Math.min(1, (transformed[0] - min) / span));
    const y = height - (normalized * height);
    return `M 0 ${y.toFixed(2)}`;
  }
  return transformed.map((value, index) => {
    const x = (index / Math.max(1, transformed.length - 1)) * width;
    const normalized = span <= 1e-9 ? 0.5 : Math.max(0, Math.min(1, (value - min) / span));
    const y = height - (normalized * height);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function createPlayIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('helios-ui-button__icon');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 5.5v13l10-6.5z');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('stroke', 'none');

  svg.appendChild(path);
  return svg;
}

function createPauseIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('helios-ui-button__icon');

  for (const x of [7, 13]) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', '5.5');
    rect.setAttribute('width', '4');
    rect.setAttribute('height', '13');
    rect.setAttribute('rx', '0.75');
    rect.setAttribute('fill', 'currentColor');
    svg.appendChild(rect);
  }

  return svg;
}

function createStatusSpinnerIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.classList.add('helios-ui-layout__status-spinner');

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M21 12a9 9 0 1 1-3.1-6.8');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  svg.appendChild(path);
  return svg;
}

function subscribe(helios, eventName, handler) {
  if (!helios || typeof handler !== 'function') return () => {};
  if (typeof helios.on === 'function') {
    return helios.on(eventName, handler) ?? (() => {});
  }
  if (typeof helios.addEventListener === 'function') {
    helios.addEventListener(eventName, handler);
    return () => helios.removeEventListener(eventName, handler);
  }
  return () => {};
}

export class LayoutPanel {
  constructor(ui, options = {}) {
    this.ui = ui;
    this.options = options;
  }

  create() {
    const helios = this.ui.helios ?? null;
    const content = document.createElement('div');
    const layoutBehavior = helios?.behavior?.layout ?? helios?.useBehavior?.('layout');

    if (!helios || !layoutBehavior) {
      const placeholder = document.createElement('div');
      placeholder.className = 'helios-ui-label__hint';
      placeholder.textContent = this.options.placeholder ?? 'Layout controls require LayoutBehavior.';
      const { row } = createAlignedRowEl({
        title: this.options.placeholderTitle ?? 'Status',
        controls: placeholder,
      });
      content.appendChild(row);
      return this.ui.createPanel({
        id: this.options.id ?? 'helios-ui-layout',
        title: this.options.title ?? 'Layout',
        position: this.options.position ?? { x: 16, y: 360 },
        dock: this.options.dock ?? 'top-right',
      content,
      });
    }

    const controlsByKey = new Map();
    let currentDescriptorKey = null;
    let lastChoiceSignature = null;
    let lastPositionChoiceSignature = null;
    let selectedPositionAttribute = layoutBehavior.positionAttribute?.() ?? CURRENT_POSITION_ATTRIBUTE;

    const layoutSelect = document.createElement('select');
    layoutSelect.className = 'helios-ui-select';

    const positionAttributeSelect = document.createElement('select');
    positionAttributeSelect.className = 'helios-ui-select';

    const statusControls = document.createElement('div');
    statusControls.className = 'helios-ui-layout__status-shell';

    const statusVisual = document.createElement('div');
    statusVisual.className = 'helios-ui-layout__status-visual';

    const statusSparkline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    statusSparkline.setAttribute('viewBox', '0 0 120 24');
    statusSparkline.setAttribute('preserveAspectRatio', 'none');
    statusSparkline.classList.add('helios-ui-layout__sparkline', 'helios-ui-layout__sparkline--status');

    const statusSparklinePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    statusSparklinePath.setAttribute('fill', 'none');
    statusSparklinePath.setAttribute('vector-effect', 'non-scaling-stroke');
    statusSparkline.appendChild(statusSparklinePath);

    const statusTempLabel = document.createElement('div');
    statusTempLabel.className = 'helios-ui-layout__status-temp';
    statusTempLabel.textContent = 'Temp.';

    const statusBadge = document.createElement('div');
    statusBadge.className = 'helios-ui-layout__status-badge';

    const statusSpinner = createStatusSpinnerIcon();
    const statusText = document.createElement('span');
    statusText.className = 'helios-ui-layout__status-text';

    statusBadge.appendChild(statusSpinner);
    statusBadge.appendChild(statusText);
    statusVisual.appendChild(statusSparkline);
    statusVisual.appendChild(statusTempLabel);
    statusVisual.appendChild(statusBadge);

    const runButton = document.createElement('button');
    runButton.type = 'button';
    runButton.className = 'helios-ui-layout__status-button';

    const runButtonIconWrap = document.createElement('span');
    runButtonIconWrap.className = 'helios-ui-layout__status-button-icon';

    statusControls.appendChild(statusVisual);
    statusControls.appendChild(runButton);

    const bindingsRoot = document.createElement('div');
    bindingsRoot.className = 'helios-ui-layout__bindings';

    let statusBinding = null;
    let statusHistory = [];
    let lastStatusSampleAt = Number.NEGATIVE_INFINITY;

    const layoutRow = createAlignedRowEl({
      title: 'Layout',
      controls: layoutSelect,
    });
    content.appendChild(layoutRow.row);

    const sourceRow = createAlignedRowEl({
      title: 'Set from',
      hint: 'Copies a numeric 2D/3D node attribute into the current layout positions.',
      controls: positionAttributeSelect,
    });
    content.appendChild(sourceRow.row);

    const runRow = createAlignedRowEl({
      title: 'Status',
      controls: statusControls,
    });
    content.appendChild(runRow.row);
    content.appendChild(bindingsRoot);

    const panel = this.ui.createPanel({
      id: this.options.id ?? 'helios-ui-layout',
      title: this.options.title ?? 'Layout',
      position: this.options.position ?? { x: 16, y: 360 },
      dock: this.options.dock ?? 'top-right',
      content,
    });

    const getCurrentDescriptor = () => layoutBehavior.descriptor?.() ?? {
      key: 'static',
      label: 'Static',
      dynamic: false,
      bindings: [],
    };

    const syncLayoutChoices = () => {
      const descriptor = getCurrentDescriptor();
      const choices = layoutBehavior.choices?.() ?? [];
      const signature = JSON.stringify([
        descriptor.key,
        ...choices.map((choice) => [choice.value, choice.label]),
      ]);
      if (signature === lastChoiceSignature) {
        if (layoutSelect.value !== descriptor.key) {
          layoutSelect.value = descriptor.key;
        }
        return;
      }
      lastChoiceSignature = signature;
      layoutSelect.textContent = '';
      for (const choice of choices) {
        const option = document.createElement('option');
        option.value = choice.value;
        option.textContent = choice.label;
        layoutSelect.appendChild(option);
      }
      if (!choices.some((choice) => choice.value === descriptor.key)) {
        const option = document.createElement('option');
        option.value = descriptor.key;
        option.textContent = descriptor.label;
        layoutSelect.appendChild(option);
      }
      layoutSelect.value = descriptor.key;
    };

    const syncPositionChoices = () => {
      const descriptor = getCurrentDescriptor();
      const layoutState = layoutBehavior.runState?.() ?? 'stopped';
      const enabled = layoutState !== 'stopped';
      const choices = typeof layoutBehavior.positionAttributeChoices === 'function'
        ? layoutBehavior.positionAttributeChoices()
        : [{ value: CURRENT_POSITION_ATTRIBUTE, label: 'Current positions', dimension: 3 }];
      const signature = JSON.stringify(choices.map((choice) => [choice.value, choice.label, choice.dimension]));
      const fallbackValue = choices[0]?.value ?? CURRENT_POSITION_ATTRIBUTE;
      const shouldUseCurrentPositions = descriptor.dynamic === true && enabled;
      const desiredValue = shouldUseCurrentPositions ? CURRENT_POSITION_ATTRIBUTE : selectedPositionAttribute;
      const nextSelected = choices.some((choice) => choice.value === desiredValue)
        ? desiredValue
        : fallbackValue;

      if (signature !== lastPositionChoiceSignature) {
        lastPositionChoiceSignature = signature;
        positionAttributeSelect.textContent = '';
        for (const choice of choices) {
          const option = document.createElement('option');
          option.value = choice.value;
          option.textContent = choice.label;
          positionAttributeSelect.appendChild(option);
        }
      }

      selectedPositionAttribute = nextSelected;
      positionAttributeSelect.value = nextSelected;
    };

    const refreshRunState = () => {
      const descriptor = getCurrentDescriptor();
      const dynamic = descriptor.dynamic === true;
      const state = dynamic ? (layoutBehavior.runState?.() ?? 'stopped') : 'stopped';
      const running = state === 'running';
      const stoppable = state === 'running' || state === 'idle';
      const label = state === 'idle' ? 'idle' : (running ? 'running' : 'stopped');

      runRow.row.style.display = dynamic ? '' : 'none';
      statusControls.dataset.state = state;
      statusVisual.dataset.state = state;
      statusBadge.dataset.state = state;
      statusText.textContent = label;
      statusText.dataset.state = state;
      statusSpinner.style.display = running ? '' : 'none';
      runButton.replaceChildren();
      runButton.dataset.state = state;
      const nextActionLabel = stoppable ? 'Stop layout' : 'Start layout';
      runButton.title = nextActionLabel;
      runButton.setAttribute('aria-label', nextActionLabel);
      runButtonIconWrap.replaceChildren(stoppable ? createPauseIcon() : createPlayIcon());
      runButton.appendChild(runButtonIconWrap);
      runButton.setAttribute('aria-busy', running ? 'true' : 'false');
    };

    const resetStatusHistory = () => {
      statusHistory = [];
      lastStatusSampleAt = Number.NEGATIVE_INFINITY;
      const initialValue = Number(statusBinding?.get?.());
      if (Number.isFinite(initialValue)) {
        statusHistory.push(initialValue);
        lastStatusSampleAt = performance.now();
      }
      const scale = statusBinding?.history?.scale === 'log' ? 'log' : 'linear';
      const bounds = statusBinding?.history ?? null;
      const d = buildSparklinePath(statusHistory, 120, 24, scale, bounds);
      statusSparklinePath.setAttribute('d', d || '');
    };

    const refreshStatusBinding = () => {
      statusTempLabel.textContent = statusBinding?.label ?? 'Temp.';
      statusVisual.style.display = statusBinding ? '' : 'none';
      resetStatusHistory();
    };

    const sampleStatusBinding = (now) => {
      if (!statusBinding?.history) return;
      const sampleMs = Math.max(250, Number(statusBinding.history.sampleMs ?? 1000) || 1000);
      if (now - lastStatusSampleAt < sampleMs) return;
      const nextValue = Number(statusBinding.get?.());
      if (!Number.isFinite(nextValue)) return;
      lastStatusSampleAt = now;
      statusHistory.push(nextValue);
      const limit = Math.max(2, Math.floor(statusBinding.history.length ?? 20));
      while (statusHistory.length > limit) statusHistory.shift();
      const scale = statusBinding.history.scale === 'log' ? 'log' : 'linear';
      const bounds = statusBinding.history ?? null;
      const d = buildSparklinePath(statusHistory, 120, 24, scale, bounds);
      statusSparklinePath.setAttribute('d', d || '');
    };

    const addBindingRow = (binding) => {
      let controls = null;
      let rowClass = null;
      let refresh = () => {};
      let sample = null;
      let destroy = () => {};

      if (binding.type === 'display') {
        const wrap = document.createElement('div');
        wrap.className = 'helios-ui-layout__display-stack';
        if (binding.history) {
          const sparkline = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          sparkline.setAttribute('viewBox', '0 0 120 28');
          sparkline.setAttribute('preserveAspectRatio', 'none');
          sparkline.classList.add('helios-ui-layout__sparkline');

          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('fill', 'none');
          path.setAttribute('vector-effect', 'non-scaling-stroke');
          sparkline.appendChild(path);

          const history = [];
          const limit = Math.max(2, Math.floor(binding.history.length ?? 20));
          const scale = binding.history.scale === 'log' ? 'log' : 'linear';
          const bounds = binding.history ?? null;

          const renderHistory = () => {
            const d = buildSparklinePath(history, 120, 28, scale, bounds);
            path.setAttribute('d', d || '');
          };

          sample = (now) => {
            const sampleMs = Math.max(250, Number(binding.history.sampleMs ?? 1000) || 1000);
            const lastAt = sample?._lastAt ?? -Infinity;
            if (now - lastAt < sampleMs) return;
            const nextValue = binding.get?.();
            if (!Number.isFinite(Number(nextValue))) return;
            sample._lastAt = now;
            history.push(Number(nextValue));
            while (history.length > limit) history.shift();
            renderHistory();
          };

          const initialValue = Number(binding.get?.());
          if (Number.isFinite(initialValue)) {
            history.push(initialValue);
            sample._lastAt = performance.now();
            renderHistory();
          }

          wrap.appendChild(sparkline);
          controls = wrap;
          refresh = () => {};
        } else {
          const display = document.createElement('div');
          display.className = 'helios-ui-layout__display';
          wrap.appendChild(display);
          controls = wrap;
          refresh = () => {
            display.textContent = formatBindingValue(binding, binding.get?.());
          };
        }
      } else if (binding.type === 'boolean') {
        const toggle = createToggleControl({
          checked: Boolean(binding.get?.()),
          onLabel: 'On',
          offLabel: 'Off',
          ariaLabel: binding.label ?? binding.key,
        });
        toggle.addEventListener('change', () => {
          binding.set?.(toggle.checked);
        });
        controls = toggle;
        refresh = () => {
          if (document.activeElement === toggle) return;
          toggle.checked = Boolean(binding.get?.());
        };
      } else if (binding.type === 'select') {
        const select = document.createElement('select');
        select.className = 'helios-ui-select';
        for (const entry of binding.options ?? []) {
          const option = document.createElement('option');
          option.value = String(entry.value);
          option.textContent = entry.label ?? String(entry.value);
          select.appendChild(option);
        }
        select.addEventListener('change', () => {
          binding.set?.(select.value);
        });
        controls = select;
        refresh = () => {
          if (document.activeElement === select) return;
          const nextValue = String(binding.get?.() ?? '');
          if (select.value !== nextValue) select.value = nextValue;
        };
      } else {
        const wrap = document.createElement('div');
        const sliderMin = resolveFiniteBound(binding.sliderMin, binding.min);
        const sliderMax = resolveFiniteBound(binding.sliderMax, binding.max);
        const inputMin = resolveFiniteBound(binding.inputMin, binding.min);
        const inputMax = resolveFiniteBound(binding.inputMax, binding.max);
        const hasRange = Number.isFinite(sliderMin) && Number.isFinite(sliderMax);
        if (hasRange) {
          rowClass = 'helios-ui-row--slider';
          if (usesLogScale(binding)) {
            const logControls = new LogSliderControls({
              value: binding.get?.(),
              minExp: Math.log10(Math.max(1e-12, sliderMin)),
              maxExp: Math.log10(Math.max(1e-12, sliderMax)),
              stepExp: binding.sliderStep ?? 0.01,
              minValue: sliderMin,
              maxValue: sliderMax,
              inputMin,
              inputMax,
              format: (next) => formatInputNumber(next, binding),
              onCommit: (next) => {
                const clamped = clampNumber(next, inputMin, inputMax);
                if (clamped == null) return;
                binding.set?.(clamped);
              },
            });
            controls = logControls.element;
            destroy = () => logControls.destroy();
            refresh = () => {
              const next = toFinite(binding.get?.());
              if (next == null) return;
              if (document.activeElement !== logControls.slider && document.activeElement !== logControls.input) {
                logControls.setValue(next);
              }
            };
          } else {
            const linearControls = new SuggestedSliderControls({
              value: binding.get?.(),
              suggested: [sliderMin, sliderMax],
              step: binding.step ?? 0.01,
              inputMin,
              inputMax,
              onCommit: (next) => {
                const clamped = clampNumber(next, inputMin, inputMax);
                if (clamped == null) return;
                binding.set?.(clamped);
              },
            });
            linearControls.input.inputMode = 'decimal';
            linearControls.input.step = String(binding.inputStep ?? (binding.step ?? 0.01));
            controls = linearControls.element;
            destroy = () => linearControls.destroy();
            refresh = () => {
              const next = toFinite(binding.get?.());
              if (next == null) return;
              if (document.activeElement !== linearControls.slider && document.activeElement !== linearControls.input) {
                linearControls.set(next);
              }
            };
          }
        } else {
          const input = document.createElement('input');
          input.type = 'number';
          input.inputMode = 'decimal';
          input.className = 'helios-ui-number';
          input.step = String(binding.inputStep ?? (binding.notation === 'scientific' ? 'any' : (binding.step ?? 0.01)));
          input.addEventListener('change', () => {
            const committed = clampNumber(input.value, binding.min, binding.max);
            if (committed == null) return;
            input.value = formatInputNumber(committed, binding);
            binding.set?.(committed);
          });
          wrap.appendChild(input);
          controls = wrap;
          refresh = () => {
            if (document.activeElement === input) return;
            input.value = formatInputNumber(binding.get?.(), binding);
          };
        }
      }

      const row = createAlignedRowEl({
        title: binding.label ?? binding.key,
        hint: binding.hint ?? null,
        controls,
        rowClass,
      });
      bindingsRoot.appendChild(row.row);
      controlsByKey.set(binding.key, { refresh, sample, destroy });
      refresh();
      sample?.(performance.now());
    };

    const rebuildBindings = () => {
      const descriptor = getCurrentDescriptor();
      currentDescriptorKey = descriptor.key;
      for (const control of controlsByKey.values()) {
        control.destroy?.();
      }
      controlsByKey.clear();
      bindingsRoot.textContent = '';
      statusBinding = null;
      refreshStatusBinding();

      if (!descriptor.bindings?.length) {
        return;
      }

      for (const binding of descriptor.bindings) {
        if (binding?.key === 'alphaCurrent' && binding?.type === 'display' && binding?.history) {
          statusBinding = binding;
          refreshStatusBinding();
          sampleStatusBinding(performance.now());
          continue;
        }
        addBindingRow(binding);
      }
    };

    let suppressRunButtonClick = false;
    const activateRunButton = () => {
      const descriptor = getCurrentDescriptor();
      if (descriptor.dynamic !== true) return;
      const state = layoutBehavior.runState?.() ?? 'stopped';
      if (state === 'running' || state === 'idle') {
        layoutBehavior.stop?.('ui:layout-panel');
      } else {
        layoutBehavior.reheat?.('ui:layout-panel');
        layoutBehavior.start?.();
        selectedPositionAttribute = CURRENT_POSITION_ATTRIBUTE;
      }
      sync(false);
    };

    const refreshBindingValues = () => {
      for (const control of controlsByKey.values()) {
        control.refresh?.();
      }
    };

    const sampleBindingValues = (now) => {
      sampleStatusBinding(now);
      for (const control of controlsByKey.values()) {
        control.sample?.(now);
      }
    };

    const sync = (force = false) => {
      syncLayoutChoices();
      syncPositionChoices();
      const descriptor = getCurrentDescriptor();
      if (force || descriptor.key !== currentDescriptorKey) {
        rebuildBindings();
      }
      refreshBindingValues();
      refreshRunState();
    };

    const applySelectedPositionAttribute = () => {
      layoutBehavior.positionAttribute?.(selectedPositionAttribute);
      const didSet = layoutBehavior.applyPositionAttribute?.(selectedPositionAttribute);
      if (!didSet) {
        sync(false);
        return;
      }
      const descriptor = getCurrentDescriptor();
      const layoutState = layoutBehavior.runState?.() ?? 'stopped';
      if (descriptor.dynamic === true && layoutState !== 'stopped') {
        selectedPositionAttribute = CURRENT_POSITION_ATTRIBUTE;
      }
      sync(false);
    };

    positionAttributeSelect.addEventListener('change', () => {
      selectedPositionAttribute = positionAttributeSelect.value || CURRENT_POSITION_ATTRIBUTE;
      applySelectedPositionAttribute();
    });

    runButton.addEventListener('pointerup', (event) => {
      if (runButton.disabled) return;
      if (event.button != null && event.button !== 0) return;
      suppressRunButtonClick = true;
      activateRunButton();
    });

    runButton.addEventListener('click', () => {
      if (suppressRunButtonClick) {
        suppressRunButtonClick = false;
        return;
      }
      activateRunButton();
    });

    layoutSelect.addEventListener('change', () => {
      layoutBehavior.type?.(layoutSelect.value);
      if (layoutSelect.value === 'static') {
        layoutBehavior.stop?.('ui:layout-panel');
      } else if ((layoutBehavior.runState?.() ?? 'stopped') !== 'stopped') {
        selectedPositionAttribute = CURRENT_POSITION_ATTRIBUTE;
      }
      sync(false);
    });

    const unsubscribers = [
      // Binding updates and run-state changes should refresh values in place.
      // Rebuilding controls during an active drag breaks native range interaction.
      layoutBehavior.on?.('change', () => sync(false)) ?? (() => {}),
      subscribe(helios, EVENTS.LAYOUT_CHANGED, () => sync(false)),
      subscribe(helios, EVENTS.LAYOUT_START, () => {
        selectedPositionAttribute = CURRENT_POSITION_ATTRIBUTE;
        sync(false);
      }),
      subscribe(helios, EVENTS.LAYOUT_STOP, () => refreshRunState()),
      subscribe(helios, EVENTS.NETWORK_REPLACED, () => sync(true)),
    ];

    const refreshMs = Math.max(150, Number(this.options.refreshMs ?? 400) || 400);
    const refreshTimer = window.setInterval(() => sync(false), refreshMs);
    const sampleTimer = window.setInterval(() => sampleBindingValues(performance.now()), 1000);

    sync(true);

    const originalDestroy = panel.destroy?.bind(panel);
    if (originalDestroy) {
      panel.destroy = () => {
        window.clearInterval(refreshTimer);
        window.clearInterval(sampleTimer);
        for (const unsubscribe of unsubscribers) unsubscribe?.();
        for (const control of controlsByKey.values()) {
          control.destroy?.();
        }
        controlsByKey.clear();
        originalDestroy();
      };
    }

    return panel;
  }
}

export default LayoutPanel;
