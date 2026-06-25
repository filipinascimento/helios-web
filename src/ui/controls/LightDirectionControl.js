import { createFpsThrottle } from './createFpsThrottle.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FALLBACK_DIRECTION = Object.freeze([0.577350269, 0.577350269, 0.577350269]);
const EPSILON = 1e-6;

function normalizeDirection(value, fallback = FALLBACK_DIRECTION) {
  const source = Array.isArray(value) || ArrayBuffer.isView(value) ? value : fallback;
  const x = Number(source?.[0]);
  const y = Number(source?.[1]);
  const z = Number(source?.[2]);
  const length = Math.hypot(x, y, z);
  if (!Number.isFinite(length) || length <= EPSILON) return Array.from(fallback);
  return [x / length, y / length, z / length];
}

function clampUnitDisk(x, y) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= 1) return [x, y];
  return [x / length, y / length];
}

function formatComponent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return number.toFixed(3).replace(/\.?0+$/, '');
}

function createSvgElement(doc, name, attributes = {}) {
  const element = doc.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

export function createLightDirectionControl(attribute, options = {}) {
  const doc = options.document ?? document;
  const mode = options.mode === 'axis' ? 'axis' : 'light';
  const root = doc.createElement('div');
  root.className = 'helios-ui-light-direction';
  root.classList.add(`helios-ui-light-direction--${mode}`);

  const pad = doc.createElement('button');
  pad.type = 'button';
  pad.className = 'helios-ui-light-direction__pad';
  pad.dataset.testid = options.testId ?? 'controls-shaded-light-direction';
  pad.setAttribute('aria-label', options.ariaLabel ?? 'Shaded light direction');

  const svg = createSvgElement(doc, 'svg', {
    class: 'helios-ui-light-direction__sphere',
    viewBox: '0 0 100 100',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const outline = createSvgElement(doc, 'circle', {
    class: 'helios-ui-light-direction__outline',
    cx: 50,
    cy: 50,
    r: 42,
  });
  const equator = createSvgElement(doc, 'ellipse', {
    class: 'helios-ui-light-direction__latitude',
    cx: 50,
    cy: 54,
    rx: 39,
    ry: 12,
  });
  const meridian = createSvgElement(doc, 'ellipse', {
    class: 'helios-ui-light-direction__latitude',
    cx: 50,
    cy: 50,
    rx: 14,
    ry: 40,
  });
  const line = createSvgElement(doc, 'line', {
    class: 'helios-ui-light-direction__ray',
    x1: 50,
    y1: 50,
    x2: 50,
    y2: 50,
  });
  const center = createSvgElement(doc, 'circle', {
    class: 'helios-ui-light-direction__center',
    cx: 50,
    cy: 50,
    r: 2.7,
  });
  const handleGroup = createSvgElement(doc, 'g', {
    class: 'helios-ui-light-direction__handle-group',
  });
  const handle = createSvgElement(doc, 'ellipse', {
    class: 'helios-ui-light-direction__handle',
    cx: 0,
    cy: 0,
    rx: 5,
    ry: 8,
  });
  const axisArrow = createSvgElement(doc, 'path', {
    class: 'helios-ui-light-direction__axis-arrow',
    d: 'M 10 0 L 1 -5 L 3 0 L 1 5 Z',
  });
  handleGroup.append(handle, axisArrow);
  const backHandleGroup = createSvgElement(doc, 'g', {
    class: 'helios-ui-light-direction__handle-group helios-ui-light-direction__handle-group--back',
  });
  const backHandle = createSvgElement(doc, 'ellipse', {
    class: 'helios-ui-light-direction__handle helios-ui-light-direction__handle--back',
    cx: 0,
    cy: 0,
    rx: 4,
    ry: 7,
  });
  backHandleGroup.appendChild(backHandle);
  svg.append(outline, equator, meridian, line, center, backHandleGroup, handleGroup);
  pad.appendChild(svg);

  const fields = doc.createElement('div');
  fields.className = 'helios-ui-light-direction__fields';
  const inputs = [];
  for (const axis of ['x', 'y', 'z']) {
    const input = doc.createElement('input');
    input.type = 'number';
    input.className = 'helios-ui-number';
    input.min = '-1';
    input.max = '1';
    input.step = '0.01';
    input.inputMode = 'decimal';
    input.dataset.axis = axis;
    input.dataset.testid = `${options.fieldTestIdPrefix ?? 'controls-shaded-light-direction'}-${axis}`;
    input.setAttribute('aria-label', `Light ${axis.toUpperCase()}`);
    fields.appendChild(input);
    inputs.push(input);
  }

  root.append(pad, fields);

  const readDirection = () => normalizeDirection(attribute?.value?.());
  const writeDirection = (direction, event = 'change') => {
    if (attribute?.readOnly) return;
    attribute?.write?.(normalizeDirection(direction, readDirection()), { source: 'ui', event });
  };

  let currentDirection = readDirection();
  let activeAxisSign = 1;
  const sync = (value = readDirection()) => {
    currentDirection = normalizeDirection(value, currentDirection);
    const [x, y, z] = currentDirection;
    const px = 50 + x * 38;
    const py = 50 - y * 38;
    const nx = 50 - x * 38;
    const ny = 50 + y * 38;
    const screenAngle = Math.atan2(py - 50, px - 50) * 180 / Math.PI;
    const backScreenAngle = Math.atan2(ny - 50, nx - 50) * 180 / Math.PI;
    const flatten = 3.5 + Math.max(0, Math.min(1, Math.abs(z))) * 2.5;
    line.setAttribute('x1', formatComponent(mode === 'axis' ? nx : 50));
    line.setAttribute('y1', formatComponent(mode === 'axis' ? ny : 50));
    line.setAttribute('x2', formatComponent(px));
    line.setAttribute('y2', formatComponent(py));
    handle.setAttribute('rx', formatComponent(flatten));
    backHandle.setAttribute('rx', formatComponent(flatten));
    handleGroup.setAttribute('transform', `translate(${formatComponent(px)} ${formatComponent(py)}) rotate(${formatComponent(screenAngle)})`);
    backHandleGroup.setAttribute('transform', `translate(${formatComponent(nx)} ${formatComponent(ny)}) rotate(${formatComponent(backScreenAngle)})`);
    handleGroup.dataset.back = z < 0 ? 'true' : 'false';
    backHandleGroup.dataset.back = z >= 0 ? 'true' : 'false';
    pad.dataset.back = z < 0 ? 'true' : 'false';
    pad.setAttribute('aria-valuetext', `X ${formatComponent(x)}, Y ${formatComponent(y)}, Z ${formatComponent(z)}`);
    for (let i = 0; i < inputs.length; i += 1) {
      inputs[i].value = formatComponent(currentDirection[i]);
      inputs[i].disabled = Boolean(attribute?.readOnly);
    }
    pad.disabled = Boolean(attribute?.readOnly);
  };

  const pointerToUnitDisk = (event) => {
    const rect = pad.getBoundingClientRect();
    const size = Math.max(1, Math.min(rect.width, rect.height));
    const left = rect.left + (rect.width - size) / 2;
    const top = rect.top + (rect.height - size) / 2;
    let x = ((event.clientX - left) / size - 0.5) * 2;
    let y = -(((event.clientY - top) / size - 0.5) * 2);
    [x, y] = clampUnitDisk(x, y);
    return [x, y];
  };

  const resolveAxisSign = (x, y) => {
    if (mode !== 'axis') return 1;
    const frontDistance = Math.hypot(x - currentDirection[0], y - currentDirection[1]);
    const backDistance = Math.hypot(x + currentDirection[0], y + currentDirection[1]);
    return backDistance < frontDistance ? -1 : 1;
  };

  const directionFromPointer = (event, axisSign = activeAxisSign) => {
    const [x, y] = pointerToUnitDisk(event);
    const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
    if (mode === 'axis' && axisSign < 0) return [-x, -y, -z];
    return [x, y, z];
  };

  const writePointerDirection = createFpsThrottle((direction) => {
    writeDirection(direction, 'input');
  });

  let draggingPointerId = null;
  const onPointerDown = (event) => {
    if (attribute?.readOnly) return;
    event.preventDefault();
    draggingPointerId = event.pointerId;
    pad.setPointerCapture?.(event.pointerId);
    const [x, y] = pointerToUnitDisk(event);
    activeAxisSign = resolveAxisSign(x, y);
    const next = directionFromPointer(event, activeAxisSign);
    sync(next);
    writePointerDirection(next);
  };
  const onPointerMove = (event) => {
    if (draggingPointerId !== event.pointerId) return;
    event.preventDefault();
    const next = directionFromPointer(event, activeAxisSign);
    sync(next);
    writePointerDirection(next);
  };
  const onPointerUp = (event) => {
    if (draggingPointerId !== event.pointerId) return;
    event.preventDefault();
    const next = directionFromPointer(event, activeAxisSign);
    sync(next);
    writePointerDirection(next);
    writePointerDirection.flush();
    draggingPointerId = null;
    pad.releasePointerCapture?.(event.pointerId);
  };
  const onPointerCancel = (event) => {
    if (draggingPointerId !== event.pointerId) return;
    writePointerDirection.cancel();
    draggingPointerId = null;
    pad.releasePointerCapture?.(event.pointerId);
    sync();
  };

  const commitInputs = () => {
    const next = currentDirection.slice();
    for (let i = 0; i < inputs.length; i += 1) {
      const value = Number(inputs[i].value);
      if (Number.isFinite(value)) next[i] = value;
    }
    writeDirection(next, 'change');
    sync(readDirection());
  };

  const onInputKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    commitInputs();
    event.currentTarget.blur();
  };

  const onKeyDown = (event) => {
    if (attribute?.readOnly) return;
    const step = event.shiftKey ? 0.01 : 0.05;
    const next = currentDirection.slice();
    if (event.key === 'ArrowLeft') next[0] -= step;
    else if (event.key === 'ArrowRight') next[0] += step;
    else if (event.key === 'ArrowUp') next[1] += step;
    else if (event.key === 'ArrowDown') next[1] -= step;
    else if (event.key === 'PageUp') next[2] += step;
    else if (event.key === 'PageDown') next[2] -= step;
    else if (event.key === 'Home') next.splice(0, 3, ...FALLBACK_DIRECTION);
    else return;
    event.preventDefault();
    writeDirection(next, 'change');
    sync(readDirection());
  };

  pad.addEventListener('pointerdown', onPointerDown);
  pad.addEventListener('pointermove', onPointerMove);
  pad.addEventListener('pointerup', onPointerUp);
  pad.addEventListener('pointercancel', onPointerCancel);
  pad.addEventListener('keydown', onKeyDown);
  for (const input of inputs) {
    input.addEventListener('change', commitInputs);
    input.addEventListener('keydown', onInputKeyDown);
  }
  const unsubscribe = attribute?.subscribe?.(sync) ?? null;
  sync();

  return {
    element: root,
    set: sync,
    destroy() {
      unsubscribe?.();
      writePointerDirection.cancel();
      pad.removeEventListener('pointerdown', onPointerDown);
      pad.removeEventListener('pointermove', onPointerMove);
      pad.removeEventListener('pointerup', onPointerUp);
      pad.removeEventListener('pointercancel', onPointerCancel);
      pad.removeEventListener('keydown', onKeyDown);
      for (const input of inputs) {
        input.removeEventListener('change', commitInputs);
        input.removeEventListener('keydown', onInputKeyDown);
      }
      root.remove();
    },
  };
}
