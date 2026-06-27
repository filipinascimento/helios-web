import { EVENTS } from '../../Helios.js';
import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { createTooltipManager } from '../controls/createTooltipManager.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { createSelectControl } from '../controls/createSelectControl.js';
import { createLightDirectionControl } from '../controls/LightDirectionControl.js';
import { PanelStack } from './PanelStack.js';

const AUTO_FIT_FREQUENCY_MIN = 1;
const AUTO_FIT_FREQUENCY_MAX = 10;
const AUTO_FIT_INTERVAL_MIN_MS = 100;
const AUTO_FIT_INTERVAL_MAX_MS = 5000;
const CAMERA_MOVE_SYNC_INTERVAL_MS = 240;

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

export function createTrailingThrottle(callback, delayMs = 0) {
  let timerId = null;
  let lastArgs = null;
  let lastThis = null;

  const invoke = () => {
    timerId = null;
    if (!lastArgs) return;
    const args = lastArgs;
    const context = lastThis;
    lastArgs = null;
    lastThis = null;
    callback.apply(context, args);
  };

  const throttled = function throttled(...args) {
    lastArgs = args;
    lastThis = this;
    if (timerId != null) return;
    timerId = setTimeout(invoke, Math.max(0, delayMs));
  };

  throttled.flush = () => {
    if (timerId != null) {
      clearTimeout(timerId);
      timerId = null;
    }
    invoke();
  };

  throttled.cancel = () => {
    if (timerId != null) {
      clearTimeout(timerId);
      timerId = null;
    }
    lastArgs = null;
    lastThis = null;
  };

  return throttled;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeDirection(value, fallback = [0, 1, 0]) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : fallback;
  const x = Number(source?.[0]);
  const y = Number(source?.[1]);
  const z = Number(source?.[2]);
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= 1e-6) return Array.from(fallback);
  return [x / length, y / length, z / length];
}

function resolveCameraBasis(helios) {
  const camera = helios?.renderer?.camera ?? null;
  camera?.updateBasis?.();
  const right = normalizeDirection(camera?.right, [1, 0, 0]);
  const up = normalizeDirection(camera?.up, [0, 1, 0]);
  const forward = normalizeDirection(camera?.forward, [0, 0, -1]);
  return { right, up, forward };
}

function orbitAxisViewToWorld(helios, viewAxis, basis = resolveCameraBasis(helios)) {
  const axis = normalizeDirection(viewAxis, [0, 1, 0]);
  const { right, up, forward } = basis;
  return normalizeDirection([
    (axis[0] * right[0]) + (axis[1] * up[0]) - (axis[2] * forward[0]),
    (axis[0] * right[1]) + (axis[1] * up[1]) - (axis[2] * forward[1]),
    (axis[0] * right[2]) + (axis[1] * up[2]) - (axis[2] * forward[2]),
  ]);
}

function updateSliderBounds(controls, min, max, step = null) {
  if (!controls?.slider || !controls?.input) return;
  controls.slider.min = String(min);
  controls.slider.max = String(max);
  if (step != null) {
    controls.slider.step = String(step);
    controls.input.step = String(step);
  }
  controls.input.min = String(min);
  controls.input.max = String(max);
}

function frequencyToIntervalMs(value) {
  const numeric = clampNumber(value, AUTO_FIT_FREQUENCY_MIN, AUTO_FIT_FREQUENCY_MAX, 5);
  const t = (numeric - AUTO_FIT_FREQUENCY_MIN) / (AUTO_FIT_FREQUENCY_MAX - AUTO_FIT_FREQUENCY_MIN);
  const minLog = Math.log(AUTO_FIT_INTERVAL_MIN_MS);
  const maxLog = Math.log(AUTO_FIT_INTERVAL_MAX_MS);
  return Math.round(Math.exp(maxLog + ((minLog - maxLog) * t)));
}

function intervalMsToFrequency(value) {
  const numeric = clampNumber(value, AUTO_FIT_INTERVAL_MIN_MS, AUTO_FIT_INTERVAL_MAX_MS, 900);
  const minLog = Math.log(AUTO_FIT_INTERVAL_MIN_MS);
  const maxLog = Math.log(AUTO_FIT_INTERVAL_MAX_MS);
  const t = (Math.log(numeric) - maxLog) / (minLog - maxLog);
  return AUTO_FIT_FREQUENCY_MIN + (clampNumber(t, 0, 1, 0) * (AUTO_FIT_FREQUENCY_MAX - AUTO_FIT_FREQUENCY_MIN));
}

function createRowAppender(container, tooltipManager) {
  return ({ title, hint, controls }) => {
    const { row } = createAlignedRowEl({
      title,
      hint,
      controls,
      attachTooltip: tooltipManager.attachTooltip,
    });
    container.appendChild(row);
    return row;
  };
}

export class CameraPanel {
  constructor(ui, options = {}) {
    this.ui = ui;
    this.options = options;
  }

  create() {
    const helios = this.ui.helios ?? null;
    const content = document.createElement('div');
    if (!helios) {
      const placeholder = document.createElement('div');
      placeholder.textContent = this.options.placeholder ?? 'Camera controls require a Helios instance.';
      content.appendChild(placeholder);
      return this.ui.createPanel({
        id: this.options.id ?? 'helios-ui-camera',
        title: this.options.title ?? 'Camera',
        position: this.options.position ?? { x: 16, y: 760 },
        dock: this.options.dock ?? 'top-right',
        collapsed: this.options.collapsed ?? true,
        content,
      });
    }

    const tooltipManager = createTooltipManager();
    const appendTopRow = createRowAppender(content, tooltipManager);
    const persistCameraControl = (patch = {}) => {
      const current = helios.cameraControls?.() ?? {};
      for (const [key, value] of Object.entries(patch)) {
        const path = `camera.controls.${key}`;
        this.ui._registerStateKey?.(path, {
          scope: 'network',
          debounceMs: 500,
          defaultValue: current[key],
          metadata: { panel: 'camera', control: key },
        });
        this.ui._writeStateValue?.(path, value, {
          scope: 'network',
          source: 'ui',
          reason: 'camera-control',
          debounceMs: 500,
        });
      }
    };
    const shouldTrackCameraPoseOverride = (detail = null) => {
      const origin = String(detail?.origin ?? detail?.change?.origin ?? '').trim();
      return origin === 'ui' || origin === 'interaction' || origin === 'cli' || origin === 'program';
    };
    const persistCameraPose = (pose = helios.cameraPose?.() ?? null, options = {}) => {
      if (!pose || typeof pose !== 'object') return;
      this.ui._registerStateKey?.('camera.pose', {
        scope: 'network',
        debounceMs: 750,
        defaultValue: pose,
        metadata: { panel: 'camera' },
      });
      this.ui._writeStateValue?.('camera.pose', pose, {
        scope: 'network',
        source: 'ui',
        reason: 'camera-pose',
        debounceMs: 750,
        trackOverride: options.trackOverride === true,
      });
    };

    const distanceControls = new SuggestedSliderControls({
      value: 1,
      suggested: [0.001, 10],
      step: 0.001,
      onCommit: (value) => {
        const pose = helios.cameraPose?.() ?? null;
        if (!pose) return;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return;
        if (pose.mode === '3d') {
          helios.setCameraPose({ distance: numeric }, { source: 'ui' });
        } else {
          helios.setCameraPose({ zoom: numeric }, { source: 'ui' });
        }
        persistCameraPose(null, { trackOverride: true });
      },
    });
    const distanceRow = appendTopRow({
      title: 'Distance',
      hint: 'Direct camera zoom in 2D, or camera distance in 3D.',
      controls: distanceControls.element,
    });

    const sectionStack = new PanelStack();
    sectionStack.element.style.marginTop = '6px';

    const autoFitToggle = createToggleControl({
      checked: true,
      onLabel: 'On',
      offLabel: 'Off',
      ariaLabel: 'Auto fit',
      });
      autoFitToggle.addEventListener('change', () => {
        const patch = { autoFit: autoFitToggle.checked };
        helios.cameraControls?.(patch);
        persistCameraControl(patch);
      });
    const autoFitBody = document.createElement('div');
    const appendAutoFitRow = createRowAppender(autoFitBody, tooltipManager);

    const intervalControls = new SuggestedSliderControls({
      value: intervalMsToFrequency(900),
      suggested: [AUTO_FIT_FREQUENCY_MIN, AUTO_FIT_FREQUENCY_MAX],
      step: 0.1,
      inputMin: AUTO_FIT_FREQUENCY_MIN,
        inputMax: AUTO_FIT_FREQUENCY_MAX,
        onCommit: (value) => {
          const patch = { autoFitIntervalMs: frequencyToIntervalMs(value) };
          helios.cameraControls?.(patch);
          persistCameraControl(patch);
        },
      });
    appendAutoFitRow({
      title: 'Update Freq',
      hint: 'Higher values update auto-fit more often. Large networks still adapt downward automatically.',
      controls: intervalControls.element,
    });

    const fitButton = document.createElement('button');
    fitButton.type = 'button';
    fitButton.className = 'helios-ui-button';
    fitButton.textContent = 'Fit camera';
    fitButton.addEventListener('click', () => {
      const controls = helios.cameraControls?.() ?? {};
      const targetNodeIndices = helios.cameraTargetNodes?.() ?? [];
      helios.requestFrameNetwork?.({
        nodeIndices: targetNodeIndices.length ? targetNodeIndices : undefined,
        coverage: controls.autoFitCoverage,
        paddingRatio: controls.autoFitPaddingRatio,
        maxSamples: controls.autoFitMaxSamples,
        animate: controls.animation === true,
        durationMs: controls.animationDurationMs,
        resetOrientation: false,
        focusMode: targetNodeIndices.length ? 'centroid' : 'bbox',
      });
    });
    appendAutoFitRow({
      title: 'Fit',
      hint: 'Forces an immediate fit using the current auto-fit sampling settings.',
      controls: fitButton,
    });

    sectionStack.add({
      id: 'camera-auto-fit',
      title: 'Auto Fit',
      collapsed: true,
      statusDot: false,
      headerControls: autoFitToggle,
      content: autoFitBody,
    });

    const animationToggle = createToggleControl({
      checked: true,
      onLabel: 'On',
      offLabel: 'Off',
      ariaLabel: 'Camera animation',
      });
      animationToggle.addEventListener('change', () => {
        const patch = { animation: animationToggle.checked };
        helios.cameraControls?.(patch);
        persistCameraControl(patch);
      });
    const animationBody = document.createElement('div');
    const appendAnimationRow = createRowAppender(animationBody, tooltipManager);

    const durationControls = new SuggestedSliderControls({
      value: 280,
      suggested: [0, 2000],
      step: 20,
        inputMin: 0,
        inputMax: 60000,
        onCommit: (value) => {
          const patch = { animationDurationMs: clampNumber(value, 0, 60000, 520) };
          helios.cameraControls?.(patch);
          persistCameraControl(patch);
        },
      });
    appendAnimationRow({
      title: 'Duration',
      hint: 'Transition duration for fit and focus changes when animation is enabled.',
      controls: durationControls.element,
    });

    sectionStack.add({
      id: 'camera-animation',
      title: 'Animation',
      collapsed: true,
      statusDot: false,
      headerControls: animationToggle,
      content: animationBody,
    });

    const orbitToggle = createToggleControl({
      checked: false,
      onLabel: 'On',
      offLabel: 'Off',
      ariaLabel: 'Orbit target',
    });
    const orbitBody = document.createElement('div');
    const appendOrbitRow = createRowAppender(orbitBody, tooltipManager);

    const orbitSpeedControls = new SuggestedSliderControls({
      value: 0.08,
      suggested: [0, 0.5],
      step: 0.01,
      inputMin: 0,
      inputMax: 10,
      onCommit: (value) => {
        const patch = { orbitSpeed: clampNumber(value, 0, 10, 0.08) };
        helios.cameraControls?.(patch);
        persistCameraControl(patch);
      },
    });
    appendOrbitRow({
      title: 'Orbit Speed',
      hint: 'Orbit speed in rotations per second.',
      controls: orbitSpeedControls.element,
    });

    let orbitAxisView = [0, 1, 0];
    let orbitAxisReferenceBasis = resolveCameraBasis(helios);
    let lastOrbitEnabled = false;
    const commitOrbitAxis = (basis = resolveCameraBasis(helios)) => {
      orbitAxisReferenceBasis = basis;
      const patch = { orbitAxis: orbitAxisViewToWorld(helios, orbitAxisView, basis) };
      helios.cameraControls?.(patch);
      persistCameraControl(patch);
    };
    orbitToggle.addEventListener('change', () => {
      if (orbitToggle.checked) {
        orbitAxisReferenceBasis = resolveCameraBasis(helios);
        const patch = {
          orbit: true,
          orbitAxis: orbitAxisViewToWorld(helios, orbitAxisView, orbitAxisReferenceBasis),
        };
        helios.cameraControls?.(patch);
        persistCameraControl(patch);
      } else {
        const patch = { orbit: false };
        helios.cameraControls?.(patch);
        persistCameraControl(patch);
      }
    });
    const orbitAxisAttribute = {
      readOnly: false,
      value: () => orbitAxisView,
      write: (value) => {
        orbitAxisView = normalizeDirection(value, orbitAxisView);
        commitOrbitAxis(resolveCameraBasis(helios));
      },
    };
    const orbitAxisControl = createLightDirectionControl(orbitAxisAttribute, {
      mode: 'axis',
      ariaLabel: 'Orbit axis',
      testId: 'controls-camera-orbit-axis',
      fieldTestIdPrefix: 'controls-camera-orbit-axis',
    });
    appendOrbitRow({
      title: 'Orbit Axis',
      hint: 'Axis used for 3D camera orbit. Drag either end of the axis or edit the vector fields directly.',
      controls: orbitAxisControl.element,
    });

    const directionSelect = createSelectControl({
      value: 'cw',
      compact: true,
      options: [
        { value: 'cw', label: 'Clockwise' },
        { value: 'ccw', label: 'Counter' },
        ],
        onChange: (value) => {
          const patch = { orbitDirection: value === 'ccw' ? -1 : 1 };
          helios.cameraControls?.(patch);
          persistCameraControl(patch);
        },
      });
    appendOrbitRow({
      title: 'Direction',
      hint: 'Orbit direction around the current target.',
      controls: directionSelect,
    });

    sectionStack.add({
      id: 'camera-orbit',
      title: 'Orbit',
      collapsed: true,
      statusDot: false,
      headerControls: orbitToggle,
      content: orbitBody,
    });

    content.appendChild(sectionStack.element);

    const syncDistanceControl = (poseOverride = null) => {
      const pose = poseOverride ?? helios.cameraPose?.() ?? null;
      const camera = helios.renderer?.camera ?? null;
      const is3D = pose?.mode === '3d';

      const minValue = is3D
        ? Math.max(0.001, Number(camera?.minDistance ?? (10 / 3)))
        : Math.max(0.0001, Number(camera?.minZoom ?? (0.001 / 3)));
      const maxValue = is3D
        ? Math.max(minValue, Number(camera?.maxDistance ?? 75000))
        : Math.max(minValue, Number(camera?.maxZoom ?? 30));
      updateSliderBounds(
        distanceControls,
        minValue,
        maxValue,
        is3D ? Math.max(0.1, (maxValue - minValue) / 500) : 0.001,
      );
      distanceControls.set(is3D ? (pose?.distance ?? minValue) : (pose?.zoom ?? minValue));
    };

    const syncDistanceControlThrottled = createTrailingThrottle((event) => {
      const detail = event?.detail ?? event ?? null;
      const state = detail?.state ?? null;
      const pose = state
        ? {
          mode: state.mode,
          distance: state.distance,
          zoom: state.zoom,
        }
        : null;
      syncDistanceControl(pose);
      persistCameraPose(null, { trackOverride: shouldTrackCameraPoseOverride(detail) });
    }, CAMERA_MOVE_SYNC_INTERVAL_MS);

    const sync = () => {
      const pose = helios.cameraPose?.() ?? null;
      const camera = helios.renderer?.camera ?? null;
      const controls = helios.cameraControls?.() ?? {};
      const is3D = pose?.mode === '3d';

      syncDistanceControl(pose);

      const distanceLabel = distanceRow.querySelector('.helios-ui-label__title');
      if (distanceLabel) distanceLabel.textContent = is3D ? 'Distance' : 'Zoom';

      autoFitToggle.checked = controls.autoFit === true;
      intervalControls.set(intervalMsToFrequency(controls.autoFitIntervalMs ?? 900));

      animationToggle.checked = controls.animation === true;
      durationControls.set(controls.animationDurationMs ?? 520);

      const orbitEnabled = controls.orbit === true;
      if (orbitEnabled && !lastOrbitEnabled) {
        orbitAxisReferenceBasis = resolveCameraBasis(helios);
      } else if (!orbitEnabled) {
        orbitAxisReferenceBasis = resolveCameraBasis(helios);
      }
      lastOrbitEnabled = orbitEnabled;

      orbitToggle.checked = controls.orbit === true;
      orbitSpeedControls.set(controls.orbitSpeed ?? 0.08);
      orbitAxisControl.set(orbitAxisView);
      directionSelect.value = Number(controls.orbitDirection) < 0 ? 'ccw' : 'cw';

      const orbitSectionItem = sectionStack._items.get('camera-orbit')?.item ?? null;
      if (orbitSectionItem) orbitSectionItem.hidden = !is3D;
    };
    sync();

    const unsubscribers = [
      subscribe(helios, EVENTS.CAMERA_MOVE, syncDistanceControlThrottled),
      subscribe(helios, EVENTS.CAMERA_CONTROL_CHANGE, sync),
      subscribe(helios, EVENTS.NETWORK_REPLACED, sync),
      subscribe(helios, EVENTS.GRAPH_FILTER_CHANGED, sync),
      subscribe(helios, EVENTS.MODE_CHANGED, sync),
      subscribe(helios, EVENTS.RESIZE, sync),
    ];

    const panel = this.ui.createPanel({
      id: this.options.id ?? 'helios-ui-camera',
      title: this.options.title ?? 'Camera',
      position: this.options.position ?? { x: 16, y: 760 },
      dock: this.options.dock ?? 'top-right',
      collapsed: this.options.collapsed ?? true,
      content,
    });

    const originalDestroy = panel.destroy?.bind(panel);
    panel.destroy = () => {
      syncDistanceControlThrottled.cancel?.();
      for (const unsubscribe of unsubscribers) unsubscribe?.();
      tooltipManager.destroy();
      sectionStack.destroy();
      distanceControls.destroy();
      intervalControls.destroy();
      durationControls.destroy();
      orbitSpeedControls.destroy();
      orbitAxisControl.destroy();
      originalDestroy?.();
    };

    return panel;
  }
}

export default CameraPanel;
