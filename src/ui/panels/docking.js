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
  if (top) return 'top';
  if (bottom) return 'bottom';
  return 'free';
}

