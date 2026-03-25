import { EVENTS } from '../../Helios.js';
import { createAlignedRowEl } from '../controls/createAlignedRowEl.js';
import { createToggleControl } from '../controls/createToggleControl.js';
import { createTooltipManager } from '../controls/createTooltipManager.js';
import { SuggestedSliderControls } from '../controls/SuggestedSliderControls.js';
import { createSelectControl } from '../controls/createSelectControl.js';
import { PanelStack } from './PanelStack.js';

const AUTO_FIT_FREQUENCY_MIN = 1;
const AUTO_FIT_FREQUENCY_MAX = 10;
const AUTO_FIT_INTERVAL_MIN_MS = 100;
const AUTO_FIT_INTERVAL_MAX_MS = 5000;
const CAMERA_MOVE_SYNC_INTERVAL_MS = 80;

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

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
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
        content,
      });
    }

    const tooltipManager = createTooltipManager();
    const appendTopRow = createRowAppender(content, tooltipManager);

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
      helios.cameraControls?.({ autoFit: autoFitToggle.checked });
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
        helios.cameraControls?.({
          autoFitIntervalMs: frequencyToIntervalMs(value),
        });
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
      helios.cameraControls?.({ animation: animationToggle.checked });
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
        helios.cameraControls?.({
          animationDurationMs: clampNumber(value, 0, 60000, 280),
        });
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
    orbitToggle.addEventListener('change', () => {
      helios.cameraControls?.({ orbit: orbitToggle.checked });
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
        helios.cameraControls?.({
          orbitSpeed: clampNumber(value, 0, 10, 0.08),
        });
      },
    });
    appendOrbitRow({
      title: 'Orbit Speed',
      hint: 'Orbit speed in rotations per second.',
      controls: orbitSpeedControls.element,
    });

    const orbitAngleControls = new SuggestedSliderControls({
      value: 0,
      suggested: [-60, 60],
      step: 1,
      inputMin: -89,
      inputMax: 89,
      onCommit: (value) => {
        helios.cameraControls?.({
          orbitAngle: clampNumber(value, -89, 89, 0),
        });
      },
    });
    appendOrbitRow({
      title: 'Orbit Tilt',
      hint: 'Tilts the orbit path up or down while azimuth keeps moving internally.',
      controls: orbitAngleControls.element,
    });

    const directionSelect = createSelectControl({
      value: 'cw',
      compact: true,
      options: [
        { value: 'cw', label: 'Clockwise' },
        { value: 'ccw', label: 'Counter' },
      ],
      onChange: (value) => {
        helios.cameraControls?.({ orbitDirection: value === 'ccw' ? -1 : 1 });
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

    const sync = () => {
      const pose = helios.cameraPose?.() ?? null;
      const camera = helios.renderer?.camera ?? null;
      const controls = helios.cameraControls?.() ?? {};
      const is3D = pose?.mode === '3d';

      const minValue = is3D
        ? Math.max(0.001, Number(camera?.minDistance ?? 10))
        : Math.max(0.0001, Number(camera?.minZoom ?? 0.001));
      const maxValue = is3D
        ? Math.max(minValue, Number(camera?.maxDistance ?? 25000))
        : Math.max(minValue, Number(camera?.maxZoom ?? 10));
      updateSliderBounds(
        distanceControls,
        minValue,
        maxValue,
        is3D ? Math.max(0.1, (maxValue - minValue) / 500) : 0.001,
      );
      distanceControls.set(is3D ? (pose?.distance ?? minValue) : (pose?.zoom ?? minValue));

      const distanceLabel = distanceRow.querySelector('.helios-ui-label__title');
      if (distanceLabel) distanceLabel.textContent = is3D ? 'Distance' : 'Zoom';

      autoFitToggle.checked = controls.autoFit === true;
      intervalControls.set(intervalMsToFrequency(controls.autoFitIntervalMs ?? 900));

      animationToggle.checked = controls.animation === true;
      durationControls.set(controls.animationDurationMs ?? 280);

      orbitToggle.checked = controls.orbit === true;
      orbitSpeedControls.set(controls.orbitSpeed ?? 0.08);
      orbitAngleControls.set(controls.orbitAngle ?? 0);
      directionSelect.value = Number(controls.orbitDirection) < 0 ? 'ccw' : 'cw';

      const orbitSectionItem = sectionStack._items.get('camera-orbit')?.item ?? null;
      if (orbitSectionItem) orbitSectionItem.hidden = !is3D;
    };
    const moveSyncIntervalMs = Math.max(
      16,
      Number.isFinite(this.options.moveSyncIntervalMs)
        ? Math.floor(this.options.moveSyncIntervalMs)
        : CAMERA_MOVE_SYNC_INTERVAL_MS,
    );
    let moveSyncTimer = null;
    let lastMoveSyncAt = 0;
    const syncCameraMove = () => {
      const now = performance.now();
      const elapsed = now - lastMoveSyncAt;
      if (elapsed >= moveSyncIntervalMs) {
        if (moveSyncTimer != null) {
          clearTimeout(moveSyncTimer);
          moveSyncTimer = null;
        }
        lastMoveSyncAt = now;
        sync();
        return;
      }
      if (moveSyncTimer != null) return;
      moveSyncTimer = setTimeout(() => {
        moveSyncTimer = null;
        lastMoveSyncAt = performance.now();
        sync();
      }, Math.max(0, moveSyncIntervalMs - elapsed));
    };

    sync();

    const unsubscribers = [
      subscribe(helios, EVENTS.CAMERA_MOVE, syncCameraMove),
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
      content,
    });

    const originalDestroy = panel.destroy?.bind(panel);
    panel.destroy = () => {
      if (moveSyncTimer != null) {
        clearTimeout(moveSyncTimer);
        moveSyncTimer = null;
      }
      for (const unsubscribe of unsubscribers) unsubscribe?.();
      tooltipManager.destroy();
      sectionStack.destroy();
      distanceControls.destroy();
      intervalControls.destroy();
      durationControls.destroy();
      orbitSpeedControls.destroy();
      orbitAngleControls.destroy();
      originalDestroy?.();
    };

    return panel;
  }
}

export default CameraPanel;
