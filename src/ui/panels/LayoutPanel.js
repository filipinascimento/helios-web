import { EVENTS } from '../../Helios.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { LogSliderControls } from '../controls/LogSliderControls.js';

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

function buildSparklinePath(samples, width, height, scale = 'linear', bounds = null) {
  const values = samples
    .map((sample) => Number(sample))
    .filter((sample) => Number.isFinite(sample));
  if (!values.length) return '';
  if (values.length === 1) {
    const y = height * 0.5;
    return `M 0 ${y.toFixed(2)} L ${width.toFixed(2)} ${y.toFixed(2)}`;
  }

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
  return transformed.map((value, index) => {
    const x = (index / Math.max(1, transformed.length - 1)) * width;
    const normalized = span <= 1e-9 ? 0.5 : Math.max(0, Math.min(1, (value - min) / span));
    const y = height - (normalized * height);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function getLayoutDescriptor(layout) {
  const descriptor = typeof layout?.getParameterBindings === 'function'
    ? (layout.getParameterBindings() ?? null)
    : null;
  if (descriptor && typeof descriptor === 'object') return descriptor;
  return {
    key: 'static',
    label: layout?.constructor?.name ?? 'Layout',
    dynamic: false,
    bindings: [],
  };
}

function getRendererLabel(helios) {
  const type = String(helios?.renderer?.device?.type ?? '').toLowerCase();
  if (type === 'webgpu') return 'GPU/WebGPU';
  if (type === 'webgl2' || type === 'webgl') return 'GPU/WebGL2';
  return 'GPU';
}

function getLayoutChoices(helios) {
  return [
    { value: 'worker:force3d', label: 'Force (worker)' },
    { value: 'gpu-force', label: `Force (${getRendererLabel(helios)})` },
    { value: 'd3force3d', label: 'D3 Force 3D (worker)' },
    { value: 'worker:jitter', label: 'Jitter (worker)' },
    { value: 'static', label: 'Static (no layout)' },
  ];
}

function buildLayoutInstance(helios, value) {
  const mode = helios?.options?.mode === '3d' ? '3d' : '2d';
  const nodeCount = Math.max(1, Number(helios?.network?.nodeCount ?? helios?.network?.nodeCapacity ?? 1000));
  const radius = 220 * Math.sqrt(nodeCount / 1000);
  const depth = mode === '3d' ? 140 : 0;

  if (value === 'static') {
    return helios.createLayout({
      type: 'static',
      options: { bounds: [-500, -500, 500, 500] },
    });
  }

  if (value === 'd3force3d') {
    return helios.createLayout({
      type: 'd3force3d',
      options: {
        settings: {
          use2D: mode !== '3d',
        },
      },
    });
  }

  if (value === 'gpu-force') {
    return helios.createLayout({
      type: 'gpu-force',
      options: {
        mode,
        center: [0, 0, 0],
        radius,
        depth,
        sampleCount2D: 64,
        sampleCount3D: 96,
        maxNeighborsPerNode: 64,
        outputScale: 6.5,
        linkDistance: 1,
        kRepulsion: 0.07,
        kAttraction: 0.62,
        kGravity: 0.00035,
        eta: 0.04,
        damping: 0.92,
        maxStep: 2.5,
        minDistance: 0.15,
        alphaDecay: 0.001,
      },
    });
  }

  if (value === 'worker:jitter') {
    return helios.createLayout({
      type: 'worker',
      options: {
        layout: 'jitter',
        mode,
        center: [0, 0, 0],
        radius,
        depth,
        jitter: 3,
      },
    });
  }

  return helios.createLayout({
    type: 'worker',
    options: {
      layout: 'force3d',
      mode,
      center: [0, 0, 0],
      radius,
      depth,
      kRepulsion: 3,
      kAttraction: 0.003,
      kGravity: 0.0008,
      repulsionStrategy: 'barnes-hut',
      negativesPerNode: 64,
      negativeSampling: true,
    },
  });
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

    if (!helios) {
      const placeholder = document.createElement('div');
      placeholder.className = 'helios-ui-label__hint';
      placeholder.textContent = this.options.placeholder ?? 'Layout controls require a Helios instance.';
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
    let layoutRunning = Boolean(helios?.scheduler?.layoutEnabled !== false);
    let lastChoiceSignature = null;

    const layoutSelect = document.createElement('select');
    layoutSelect.className = 'helios-ui-select';

    const statusValue = document.createElement('div');
    statusValue.className = 'helios-ui-layout__display helios-ui-layout__status';

    const actions = document.createElement('div');
    actions.className = 'helios-ui-layout__actions';

    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.className = 'helios-ui-button';
    startButton.textContent = 'Start';

    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'helios-ui-button helios-ui-button--danger';
    stopButton.textContent = 'Stop';

    actions.appendChild(startButton);
    actions.appendChild(stopButton);

    const bindingsRoot = document.createElement('div');
    bindingsRoot.className = 'helios-ui-layout__bindings';

    const layoutRow = createAlignedRowEl({
      title: 'Layout',
      controls: layoutSelect,
    });
    content.appendChild(layoutRow.row);

    const statusRow = createAlignedRowEl({
      title: 'Status',
      controls: statusValue,
    });
    content.appendChild(statusRow.row);

    const actionsRow = createAlignedRowEl({
      title: 'Actions',
      controls: actions,
    });
    content.appendChild(actionsRow.row);
    content.appendChild(bindingsRoot);

    const panel = this.ui.createPanel({
      id: this.options.id ?? 'helios-ui-layout',
      title: this.options.title ?? 'Layout',
      position: this.options.position ?? { x: 16, y: 360 },
      dock: this.options.dock ?? 'top-right',
      content,
    });

    const getCurrentDescriptor = () => getLayoutDescriptor(helios.layout?.());

    const syncLayoutChoices = () => {
      const descriptor = getCurrentDescriptor();
      const choices = getLayoutChoices(helios);
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

    const refreshStatus = () => {
      const descriptor = getCurrentDescriptor();
      const scheduler = helios?.scheduler ?? null;
      const enabled = scheduler?.layoutEnabled !== false;
      const layout = helios.layout?.();
      const dynamic = descriptor.dynamic === true;

      let stateLabel = 'Static';
      let stateToken = 'idle';
      if (dynamic) {
        if (!enabled) {
          stateLabel = 'Stopped';
          stateToken = 'error';
        } else if (layoutRunning || layout?.pending) {
          stateLabel = 'Running';
          stateToken = 'running';
        } else {
          stateLabel = 'Idle';
          stateToken = 'idle';
        }
      }

      statusValue.textContent = `${descriptor.label} · ${stateLabel}`;
      statusValue.dataset.state = stateToken;
      startButton.disabled = !dynamic;
      stopButton.disabled = !dynamic || !enabled;
    };

    const addBindingRow = (binding) => {
      let controls = null;
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

      if (!descriptor.bindings?.length) {
        const empty = document.createElement('div');
        empty.className = 'helios-ui-layout__empty';
        empty.textContent = descriptor.dynamic ? 'No adjustable parameters for this layout.' : 'This layout has no live parameters.';
        bindingsRoot.appendChild(empty);
        return;
      }

      for (const binding of descriptor.bindings) {
        addBindingRow(binding);
      }
    };

    const refreshBindingValues = () => {
      for (const control of controlsByKey.values()) {
        control.refresh?.();
      }
    };

    const sampleBindingValues = (now) => {
      for (const control of controlsByKey.values()) {
        control.sample?.(now);
      }
    };

    const sync = (force = false) => {
      syncLayoutChoices();
      const descriptor = getCurrentDescriptor();
      if (force || descriptor.key !== currentDescriptorKey) {
        rebuildBindings();
      }
      refreshBindingValues();
      refreshStatus();
    };

    startButton.addEventListener('click', () => {
      const layout = helios.layout?.();
      layout?.reheat?.();
      helios.startLayout();
      layoutRunning = true;
      sync(false);
    });

    stopButton.addEventListener('click', () => {
      helios.stopLayout('ui:layout-panel');
      layoutRunning = false;
      sync(false);
    });

    layoutSelect.addEventListener('change', () => {
      const layout = buildLayoutInstance(helios, layoutSelect.value);
      helios.layout(layout);
      if (layoutSelect.value === 'static') {
        helios.stopLayout('ui:layout-panel');
        layoutRunning = false;
      } else {
        layout?.reheat?.();
        helios.startLayout();
        layoutRunning = true;
      }
      sync(true);
    });

    const unsubscribers = [
      subscribe(helios, EVENTS.LAYOUT_CHANGED, () => sync(true)),
      subscribe(helios, EVENTS.LAYOUT_START, () => {
        layoutRunning = true;
        refreshStatus();
      }),
      subscribe(helios, EVENTS.LAYOUT_STOP, () => {
        layoutRunning = false;
        refreshStatus();
      }),
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
