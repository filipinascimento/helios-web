export const DOCK_MODES = Object.freeze([
  'free',
  'left',
  'right',
  'top',
  'bottom',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

export function resolveDockTarget(dock) {
  if (!dock || dock === 'free') return 'free';
  if (dock === 'top' || dock === 'bottom') return dock;
  if (dock.includes('left')) return 'left';
  if (dock.includes('right')) return 'right';
  return 'free';
}

export function isSideDockMode(dock) {
  const target = resolveDockTarget(dock);
  return target === 'left' || target === 'right';
}

export function computeDockMode({
  x,
  y,
  width,
  height,
  containerWidth,
  containerHeight,
  threshold = 18,
}) {
  const left = x <= threshold;
  const top = y <= threshold;
  const right = (x + width) >= (containerWidth - threshold);
  const bottom = (y + height) >= (containerHeight - threshold);

  if (left && top) return 'top-left';
  if (right && top) return 'top-right';
  if (left && bottom) return 'bottom-left';
  if (right && bottom) return 'bottom-right';
  if (left) return 'left';
  if (right) return 'right';
  // Top/bottom edge docking is intentionally disabled. Panels only snap to side docks.
  return 'free';
}
