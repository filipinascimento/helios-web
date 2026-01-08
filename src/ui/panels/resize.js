export function computeResizedWidth({
  startWidth,
  startClientX,
  clientX,
  edge = 'right',
  minWidth = 240,
  maxWidth = Infinity,
}) {
  const baseWidth = Number(startWidth);
  if (!Number.isFinite(baseWidth)) return null;
  const dx = Number(clientX) - Number(startClientX);
  if (!Number.isFinite(dx)) return null;
  const delta = edge === 'left' ? -dx : dx;
  const next = baseWidth + delta;
  const clamped = Math.max(minWidth, Math.min(maxWidth, next));
  return clamped;
}

