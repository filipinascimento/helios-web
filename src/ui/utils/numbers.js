export function clampNumber(value, { min = null, max = null } = {}) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const clampedMin = min == null ? n : Math.max(Number(min), n);
  const clampedMax = max == null ? clampedMin : Math.min(Number(max), clampedMin);
  if (!Number.isFinite(clampedMax)) return null;
  return clampedMax;
}

